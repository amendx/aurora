/**
 * TrocasAbertasScreen — central place for "Trocar aberto ao grupo" auctions.
 *
 * Tabs:
 *   - "Disponíveis": open auctions in my groups (not mine). I can place a bid.
 *   - "Minhas": auctions I created. I can review incoming bids and accept one.
 *
 * Entry: opened via overlay navigation (registered in MainScreen).
 * Creating a new auction: floating "+ Nova troca" button → TrocarAbertoSheet.
 */

import React, { useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { useSwapAuctions, isBidCompatible } from '../contexts/SwapAuctionsContext';
import { useOffers } from '../contexts/OffersContext';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';
import TrocarAbertoSheet from './TrocarAbertoSheet';
import { useColors, Typography, Spacing, Shadows } from '../constants/DesignSystem';
import Logger from '../utils/Logger';

const LABEL_NAME = { M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite' };
const LABEL_UP = { M: 'MANHÃ', T: 'TARDE', N: 'NOITE', D: 'NOITE' };
const SCOPE_LABEL = { any: 'qualquer dia', weekday: 'durante a semana', weekend: 'no fim de semana' };

const _labelColor = (C) => ({ M: C.money, T: C.warning, N: C.info, D: C.info });
const _AVATARS = (C) => [C.error, C.primary, C.info, C.warning, C.money];

const _fmtDate = (input) => {
  if (!input) return '';
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(input) ? `${input}T12:00:00` : input;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
};

const _shiftDate = (sh) => sh?.startISO || sh?.date || '';

const _hhmm = (iso) => (typeof iso === 'string' && iso.length >= 16 && iso.includes('T') ? iso.slice(11, 16) : '');
const _timeRange = (sh) => {
  const a = _hhmm(sh?.startISO);
  const b = _hhmm(sh?.endISO);
  return a && b ? `${a}-${b}` : a || '';
};

const _normColor = (c, fallback) => {
  if (!c) return fallback;
  return String(c).startsWith('#') ? c : `#${c}`;
};

const _initials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

const _hash = (str) => {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const _relTime = (ts) => {
  if (typeof ts !== 'number') return '';
  const diff = Date.now() - ts;
  if (diff < 0) return '';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `há ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'ontem';
  return `há ${days} d`;
};

const _monthKeysFromNow = (n = 3) => {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
};

const TrocasAbertasScreen = () => {
  const C = useColors();
  const { user } = useContext(AuthContext);
  const { auctions, myAuctions, loading, refresh, submitBid, cancelAuction, acceptBid, getBids } = useSwapAuctions();
  const {
    swapsReceived, swapsSent,
    acceptSwap, rejectSwap, cancelSwap,
    refresh: refreshOffers,
  } = useOffers();
  const s = makeStyles(C);
  const LABEL_C = _labelColor(C);
  const AV = _AVATARS(C);

  const [tab, setTab] = useState('available'); // 'available' | 'mine'
  const [respondingSwap, setRespondingSwap] = useState(null); // swapId in flight
  const [createOpen, setCreateOpen] = useState(false);
  const [bidPicker, setBidPicker] = useState(null); // { auction }
  const [myUpcoming, setMyUpcoming] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [bidsByAuction, setBidsByAuction] = useState({});
  const [accepting, setAccepting] = useState(null);

  useEffect(() => { refresh(); refreshOffers?.(); }, [refresh, refreshOffers]);

  // ── Small presentational helpers ────────────────────────────────────────────
  const renderLabelChip = (label) => {
    const c = LABEL_C[label] || C.text.secondary;
    return (
      <View style={[s.labelChip, { backgroundColor: c + '1A' }]}>
        <Text style={[s.labelChipText, { color: c }]}>{LABEL_UP[label] || 'PLANTÃO'}</Text>
      </View>
    );
  };

  const renderTeamChip = (group, key) => {
    if (!group) return null;
    const gc = _normColor(group.color, C.text.tertiary);
    return (
      <View key={key} style={[s.teamChip, { backgroundColor: gc + '14' }]}>
        <View style={[s.teamDot, { backgroundColor: gc }]} />
        <Text style={[s.teamChipText, { color: C.text.secondary }]} numberOfLines={1}>{group.name || 'Equipe'}</Text>
      </View>
    );
  };

  const renderShiftCol = (cap, sh) => (
    <View style={s.swapCol}>
      <Text style={s.colCap}>{cap}</Text>
      <View style={s.shiftLineRow}>
        {renderLabelChip(sh?.label)}
        {!!_timeRange(sh) && <Text style={s.timeText}>{_timeRange(sh)}</Text>}
      </View>
      <Text style={s.dateText}>{_fmtDate(_shiftDate(sh))}</Text>
      {renderTeamChip(sh?.group, 'tc')}
    </View>
  );

  const renderHospital = (group) => {
    const name = group?.institution?.name || group?.name;
    if (!name) return null;
    return (
      <View style={s.hospRow}>
        <Ionicons name="business-outline" size={12} color={C.text.tertiary} />
        <Text style={s.hospText} numberOfLines={1}>{name}</Text>
      </View>
    );
  };

  // ── Trocas direcionadas (shiftSwaps 1:1) ───────────────────────────────────
  const swapAction = useCallback(async (swap, fn) => {
    setRespondingSwap(swap.id);
    try { await fn(swap); } finally {
      setRespondingSwap(null);
      refresh(); refreshOffers?.();
    }
  }, [refresh, refreshOffers]);

  const renderDirectedSwapCard = (swap, mode /* 'received' | 'sent' */) => {
    const give = mode === 'received' ? swap.shiftB : swap.shiftA;   // o que EU dou
    const receive = mode === 'received' ? swap.shiftA : swap.shiftB; // o que EU recebo
    const counterpart = mode === 'received' ? swap.initiatorUserName : swap.targetUserName;
    const busy = respondingSwap === swap.id;
    const avColor = AV[_hash(counterpart || swap.id) % AV.length];
    const sameTeam = give?.group?.id && receive?.group?.id && String(give.group.id) === String(receive.group.id);

    return (
      <View key={swap.id} style={s.card}>
        <View style={s.cardHead}>
          <View style={[s.avatar, { backgroundColor: avColor }]}>
            <Text style={s.avatarText}>{_initials(counterpart)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.personName} numberOfLines={1}>{counterpart || 'Colega'}</Text>
            <Text style={s.personSub}>{mode === 'received' ? 'quer trocar com você' : 'aguardando resposta'}</Text>
          </View>
          {!!_relTime(swap.createdAt) && <Text style={s.relTime}>{_relTime(swap.createdAt)}</Text>}
        </View>

        <View style={s.relRow}>
          <Text style={s.relLabel}>{sameTeam ? 'MESMA EQUIPE' : 'ENTRE EQUIPES'}</Text>
          <View style={s.teamPair}>
            {renderTeamChip(give?.group, 'a')}
            <Ionicons name="swap-horizontal" size={13} color={C.text.tertiary} />
            {renderTeamChip(receive?.group, 'b')}
          </View>
        </View>

        <View style={s.swapGrid}>
          {renderShiftCol('VOCÊ DÁ', give)}
          <View style={s.swapArrowWrap}>
            <View style={s.swapArrow}>
              <Ionicons name="swap-horizontal" size={14} color={C.primary} />
            </View>
          </View>
          {renderShiftCol('VOCÊ RECEBE', receive)}
        </View>

        {renderHospital(give?.group || receive?.group)}

        {busy ? (
          <ActivityIndicator size="small" color={C.primary} style={{ marginTop: 4 }} />
        ) : mode === 'received' ? (
          <View style={s.btnRow}>
            <Pressable style={[s.acceptBtn, { flex: 2 }]} onPress={() => swapAction(swap, acceptSwap)}>
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={s.acceptBtnText}>Aceitar</Text>
            </Pressable>
            <Pressable style={[s.refuseBtn, { flex: 1 }]} onPress={() => swapAction(swap, rejectSwap)}>
              <Text style={s.refuseBtnText}>Recusar</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={s.cancelBtn} onPress={() => swapAction(swap, cancelSwap)}>
            <Text style={s.cancelBtnText}>Cancelar troca</Text>
          </Pressable>
        )}
      </View>
    );
  };

  // ── Load my upcoming shifts when the bid picker opens ──────────────────────
  useEffect(() => {
    if (!bidPicker || !user?.id) return;
    setMyUpcoming(null);
    let cancelled = false;
    (async () => {
      try {
        const months = _monthKeysFromNow(3);
        const raw = await FirebaseAdapter.getUserShiftsForMonths(user.id, months);
        const todayStr = new Date().toISOString().slice(0, 10);
        const out = (raw || [])
          .filter(sh => {
            const date = sh.date || (sh.startISO || '').slice(0, 10);
            return date && date >= todayStr;
          })
          .filter(sh => isBidCompatible(bidPicker.auction, sh))
          .sort((a, b) => (a.date || a.startISO || '').localeCompare(b.date || b.startISO || ''));
        if (!cancelled) setMyUpcoming(out);
      } catch (err) {
        Logger.warn(`[TrocasAbertas] load my upcoming: ${err?.message}`);
        if (!cancelled) setMyUpcoming([]);
      }
    })();
    return () => { cancelled = true; };
  }, [bidPicker, user?.id]);

  // ── Load bids per my auction (lazy: only when "mine" tab active) ────────────
  useEffect(() => {
    if (tab !== 'mine') return;
    let cancelled = false;
    (async () => {
      const map = {};
      for (const a of myAuctions) {
        try {
          map[a.id] = await getBids(a.id);
        } catch (err) {
          Logger.warn(`[TrocasAbertas] getBids ${a.id}: ${err?.message}`);
        }
      }
      if (!cancelled) setBidsByAuction(map);
    })();
    return () => { cancelled = true; };
  }, [tab, myAuctions, getBids]);

  const handleSubmitBid = useCallback(async (auction, candidateShift) => {
    setSubmitting(true);
    const r = await submitBid(auction, candidateShift);
    setSubmitting(false);
    if (r?.success) { setBidPicker(null); refresh(); }
  }, [submitBid, refresh]);

  const handleAccept = useCallback(async (auction, bid) => {
    setAccepting(bid.id);
    const r = await acceptBid(auction, bid);
    setAccepting(null);
    if (r?.success) refresh();
  }, [acceptBid, refresh]);

  const renderAuctionCard = (a, mine = false) => {
    const offered = a.offeredShift;
    const prefs = a.preferences || {};
    const labelsText = (prefs.labels || []).map(l => LABEL_NAME[l] || l).join(' · ') || 'qualquer turno';
    const scopeText = SCOPE_LABEL[prefs.periodScope] || 'qualquer dia';
    const avColor = AV[_hash(a.initiatorName || a.id) % AV.length];
    const bidsForThis = mine ? (bidsByAuction[a.id] || []) : [];
    const pendingBids = bidsForThis.filter(b => b.status === 'pending');

    return (
      <View key={a.id} style={s.card}>
        <View style={s.cardHead}>
          <View style={[s.avatar, { backgroundColor: avColor }]}>
            <Text style={s.avatarText}>{_initials(a.initiatorName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.personName} numberOfLines={1}>{a.initiatorName || 'Colega'}</Text>
            <Text style={s.personSub}>aberto ao grupo</Text>
          </View>
          {mine ? (
            <Pressable hitSlop={8} onPress={() => cancelAuction(a.id).then(refresh)}>
              <Ionicons name="trash-outline" size={18} color={C.text.tertiary} />
            </Pressable>
          ) : (!!_relTime(a.createdAt) && <Text style={s.relTime}>{_relTime(a.createdAt)}</Text>)}
        </View>

        <View style={s.relRow}>
          <Text style={s.relLabel}>OFERECE</Text>
          <View style={s.teamPair}>{renderTeamChip(offered?.group, 'g')}</View>
        </View>

        <View style={s.offerBox}>
          <View style={s.shiftLineRow}>
            {renderLabelChip(offered?.label)}
            {!!_timeRange(offered) && <Text style={s.timeText}>{_timeRange(offered)}</Text>}
            <Text style={[s.dateText, { marginLeft: 'auto' }]}>{_fmtDate(_shiftDate(offered))}</Text>
          </View>
          <Text style={s.prefsText}>Aceita: {labelsText} · {scopeText}</Text>
        </View>

        {renderHospital(offered?.group)}

        {!mine && (
          <Pressable style={s.acceptBtn} onPress={() => setBidPicker({ auction: a })}>
            <Ionicons name="hand-left-outline" size={15} color="#fff" />
            <Text style={s.acceptBtnText}>Fazer lance</Text>
          </Pressable>
        )}

        {mine && pendingBids.length === 0 && (
          <Text style={s.emptyInline}>Nenhum lance ainda.</Text>
        )}
        {mine && pendingBids.map(bid => {
          const bidShift = bid.offeredShift;
          const isAccepting = accepting === bid.id;
          return (
            <View key={bid.id} style={s.bidRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.bidName}>{bid.bidderName || 'Colega'}</Text>
                <Text style={s.bidMeta}>
                  {LABEL_NAME[bidShift?.label] || 'Plantão'} · {_fmtDate(_shiftDate(bidShift))} · {bidShift?.group?.name || ''}
                </Text>
              </View>
              {isAccepting
                ? <ActivityIndicator size="small" color={C.primary} />
                : (
                  <Pressable style={s.smallAcceptBtn} onPress={() => handleAccept(a, bid)}>
                    <Text style={s.smallAcceptText}>Aceitar</Text>
                  </Pressable>
                )}
            </View>
          );
        })}
      </View>
    );
  };

  const list = tab === 'available' ? auctions : myAuctions;
  const directedSwaps = tab === 'available' ? (swapsReceived || []) : (swapsSent || []);
  const isEmpty = list.length === 0 && directedSwaps.length === 0;
  const availCount = (auctions?.length || 0) + (swapsReceived?.length || 0);
  const mineCount = (myAuctions?.length || 0) + (swapsSent?.length || 0);

  const renderTab = (key, label, count) => {
    const active = tab === key;
    return (
      <Pressable style={[s.tab, active && s.tabActive]} onPress={() => setTab(key)}>
        <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
        <Text style={[s.tabCount, active && s.tabCountActive]}>{count}</Text>
      </Pressable>
    );
  };

  return (
    <>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={s.tabsBar}>
          {renderTab('available', 'Disponíveis', availCount)}
          {renderTab('mine', 'Minhas', mineCount)}
        </View>

        {loading && isEmpty && (
          <ActivityIndicator color={C.primary} style={{ marginTop: 32 }} />
        )}

        {!loading && isEmpty && (
          <Text style={s.empty}>
            {tab === 'available'
              ? 'Nenhuma troca disponível ou direcionada a você.'
              : 'Você ainda não enviou nem publicou trocas.'}
          </Text>
        )}

        <View style={s.cardsCol}>
          {/* Trocas direcionadas (1:1) primeiro — ação mais urgente */}
          {directedSwaps.map(sw => renderDirectedSwapCard(sw, tab === 'available' ? 'received' : 'sent'))}
          {/* Leilões (abertos ao grupo) */}
          {list.map(a => renderAuctionCard(a, tab === 'mine'))}
        </View>
      </ScrollView>

      {/* FAB */}
      <Pressable style={[s.fab, { backgroundColor: C.primary }]} onPress={() => setCreateOpen(true)}>
        <Ionicons name="add" size={26} color="#fff" />
      </Pressable>

      <TrocarAbertoSheet
        visible={createOpen}
        shift={null}
        onClose={() => { setCreateOpen(false); refresh(); }}
      />

      {/* Bid picker modal */}
      {bidPicker && (
        <View style={s.bidModalWrap} pointerEvents="box-none">
          <Pressable style={s.bidBackdrop} onPress={() => setBidPicker(null)} />
          <View style={[s.bidModal, { backgroundColor: C.background.elevated }]}>
            <View style={s.bidHead}>
              <Text style={s.bidTitle}>Escolha um plantão para oferecer</Text>
              <Pressable hitSlop={8} onPress={() => setBidPicker(null)}>
                <Ionicons name="close" size={20} color={C.text.secondary} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 16 }}>
              {myUpcoming === null ? (
                <ActivityIndicator color={C.primary} />
              ) : myUpcoming.length === 0 ? (
                <Text style={s.empty}>Você não tem plantões compatíveis para oferecer.</Text>
              ) : myUpcoming.map(sh => (
                <TouchableOpacity
                  key={sh.id}
                  style={s.shiftRow}
                  onPress={() => handleSubmitBid(bidPicker.auction, sh)}
                  disabled={submitting}
                >
                  {renderLabelChip(sh.label)}
                  <View style={{ flex: 1 }}>
                    <Text style={s.personName}>{LABEL_NAME[sh.label] || 'Plantão'} · {_fmtDate(_shiftDate(sh))}</Text>
                    <Text style={s.personSub}>{sh.group?.institution?.name || sh.group?.name || ''}</Text>
                  </View>
                  {submitting ? <ActivityIndicator size="small" color={C.primary} /> : <Ionicons name="chevron-forward" size={18} color={C.text.tertiary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </>
  );
};

const makeStyles = (C) => ({
  container: { flex: 1, backgroundColor: C.background.secondary },

  // Tabs
  tabsBar: {
    flexDirection: 'row',
    margin: Spacing.screen,
    marginBottom: Spacing.sm,
    padding: 4,
    borderRadius: 999,
    backgroundColor: C.background.elevated,
    borderWidth: 0.5,
    borderColor: C.border.light,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 999,
  },
  tabActive: { backgroundColor: C.background.card, ...Shadows.small },
  tabText: { fontSize: 14, fontFamily: Typography.fontFamily.semiBold, color: C.text.tertiary },
  tabTextActive: { color: C.text.primary },
  tabCount: { fontSize: 11, fontWeight: '700', color: C.text.quaternary },
  tabCountActive: { color: C.primary },

  empty: {
    fontSize: 13,
    color: C.text.tertiary,
    textAlign: 'center',
    paddingVertical: 28,
    paddingHorizontal: Spacing.screen,
  },
  emptyInline: { fontSize: 12, color: C.text.tertiary, paddingTop: 4 },

  cardsCol: { gap: 14, paddingHorizontal: Spacing.screen, paddingTop: Spacing.xs },
  card: {
    backgroundColor: C.background.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 0.5,
    borderColor: C.border.light,
    ...Shadows.small,
    gap: 12,
  },

  // Header
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 14, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.5 },
  personName: { fontSize: 16, fontFamily: Typography.fontFamily.bold, color: C.text.primary },
  personSub: { fontSize: 11.5, color: C.text.tertiary, marginTop: 2 },
  relTime: { fontSize: 11, color: C.text.quaternary },

  // Relationship + teams row
  relRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.background.secondary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  relLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.text.tertiary },
  teamPair: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  teamChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  teamDot: { width: 7, height: 7, borderRadius: 4 },
  teamChipText: { fontSize: 11, fontWeight: '600' },

  // Give / receive grid
  swapGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: C.background.tertiary,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: C.border.light,
    padding: 12,
  },
  swapCol: { flex: 1, gap: 6 },
  colCap: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.8, color: C.text.tertiary },
  shiftLineRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  labelChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  labelChipText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  timeText: { fontSize: 12, fontWeight: '600', color: C.text.secondary },
  dateText: { fontSize: 14, fontFamily: Typography.fontFamily.bold, color: C.text.primary },
  swapArrowWrap: { width: 28, alignItems: 'center', justifyContent: 'center' },
  swapArrow: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.primary + '1A',
  },

  // Auction offer box
  offerBox: {
    backgroundColor: C.background.tertiary,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: C.border.light,
    padding: 12,
    gap: 8,
  },
  prefsText: { fontSize: 12, color: C.text.secondary },

  // Hospital
  hospRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hospText: { fontSize: 11.5, color: C.text.tertiary, flex: 1 },

  // Buttons
  btnRow: { flexDirection: 'row', gap: 10 },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.primary,
    paddingVertical: 13,
    borderRadius: 12,
  },
  acceptBtnText: { color: '#fff', fontSize: 14, fontFamily: Typography.fontFamily.bold },
  refuseBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border.medium,
    backgroundColor: C.background.card,
  },
  refuseBtnText: { color: C.text.secondary, fontSize: 14, fontFamily: Typography.fontFamily.semiBold },
  cancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.error + '40',
    backgroundColor: C.error + '0F',
  },
  cancelBtnText: { color: C.error, fontSize: 13.5, fontFamily: Typography.fontFamily.semiBold },

  // Bids (mine)
  bidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: C.border.light,
  },
  bidName: { fontSize: 13.5, fontFamily: Typography.fontFamily.semiBold, color: C.text.primary },
  bidMeta: { fontSize: 11, color: C.text.tertiary, marginTop: 2 },
  smallAcceptBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: C.primary },
  smallAcceptText: { color: '#fff', fontSize: 12.5, fontFamily: Typography.fontFamily.bold },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 90,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.small,
  },

  // Bid picker modal
  bidModalWrap: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'flex-end' },
  bidBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  bidModal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 6, paddingBottom: 24 },
  bidHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
  },
  bidTitle: { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: C.text.primary },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: C.border.light,
    marginBottom: 8,
  },
});

export default TrocasAbertasScreen;
