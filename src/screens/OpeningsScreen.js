/**
 * OpeningsScreen — "Vagas"
 *
 * Layout segue o design em design/groups/vagas.html (ignorando fontes):
 *   1. Filter chips por grupo (Tudo + cada grupo) — pill row horizontal.
 *   2. "Minhas cessões abertas" — minhas cessões pendentes com Cancelar inline.
 *   3. "Por equipe" — vagas agrupadas por grupo, cada grupo com header
 *      "Nome · N vagas" + cards.
 *
 * Card: white, accent vertical (cor do grupo), day chip à esquerda,
 *       label do turno + horários, badge "N vaga(s)" à direita.
 */

import { useEffect, useState, useCallback, useMemo, useContext } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  RefreshControl, StyleSheet, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Typography, Spacing, BorderRadius, Shadows } from '../constants/DesignSystem';
import { AuthContext } from '../context/AuthContext';
import { useOpenings } from '../contexts/OpeningsContext';
import { useShifts } from '../contexts/ShiftsContext';
import { useGroups } from '../contexts/GroupsContext';
import GroupScheduleService from '../services/GroupScheduleService';
import Logger from '../utils/Logger';
import VagaDetailSheet from './VagaDetailSheet';
import CederFlowSheet from './CederFlowSheet';

// Cores por turno (já no design system, replico só pra clareza local).
const SHIFT_COLORS = (C) => ({
  M: C.primary,  // morning — teal
  T: C.warning,  // afternoon — amber
  N: C.info,     // night — blue
  D: C.info,     // carryover night
});
const SHIFT_NAMES  = { M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite' };
const WEEKDAY_PT   = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const LABEL_DURATIONS = { M: 360, T: 360, N: 720, D: 720 };

const fmtTime = (d) => d?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) || '';
const fmtDay  = (d) => WEEKDAY_PT[d?.getDay?.()] || '';
const fmtDayNum = (d) => d ? String(d.getDate()).padStart(2, '0') : '';

// Extrai "HH:MM" inicial/final de uma string de turno tipo "19h00 às 07h00".
const parseSlotTimes = (raw) => {
  if (!raw) return { start: null, end: null };
  const m = String(raw).match(/(\d{1,2})h(\d{2}).*?(\d{1,2})h(\d{2})/);
  if (!m) return { start: null, end: null };
  return { start: `${m[1].padStart(2, '0')}:${m[2]}`, end: `${m[3].padStart(2, '0')}:${m[4]}` };
};

// Constrói um "shift-like" / opening-like a partir de um item de falta gente.
const faltaToShift = (item) => {
  const { start, end } = parseSlotTimes(item.time || item.labelRaw);
  const startISO = start ? `${item.date}T${start}:00` : `${item.date}T00:00:00`;
  // Noite cruza meia-noite → fim no dia seguinte.
  let endISO = null;
  if (end) {
    const crosses = start && end < start;
    const endDate = crosses ? _addDays(item.date, 1) : item.date;
    endISO = `${endDate}T${end}:00`;
  }
  const durationMinutes = LABEL_DURATIONS[item.label] ?? 360;
  return { startISO, endISO, durationMinutes };
};

const _addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const _monthKeysBetween = (a, b) => {
  const out = new Set();
  const d = new Date(a.getFullYear(), a.getMonth(), 1);
  while (d <= b) {
    out.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() + 1);
  }
  return [...out];
};

// ── Card padrão de vaga ──────────────────────────────────────────────────────
// Toque abre o detalhe (VagaDetailSheet); não assume direto.
function VagaCard({ item, onPress, C, s }) {
  const startDate = item.startISO ? new Date(item.startISO) : null;
  const endDate   = item.endISO   ? new Date(item.endISO)   : null;
  const labelKey  = String(item.label || '').charAt(0).toUpperCase();
  const shiftColor = SHIFT_COLORS(C)[labelKey] || C.primary;
  const shiftName  = SHIFT_NAMES[labelKey] || item.label || 'Plantão';
  const hours = item.durationMinutes ? Math.round(item.durationMinutes / 60) : null;
  const slotsLeft = item.availableSlots || 0;

  return (
    <Pressable onPress={() => onPress(item)} style={s.vagaCard}>
      <View style={[s.vagaStrip, { backgroundColor: shiftColor }]} />
      <View style={s.vagaDayCol}>
        <Text style={[s.vagaDay, { color: C.text.tertiary }]}>{fmtDay(startDate)}</Text>
        <Text style={[s.vagaDayNum, { color: C.text.primary }]}>{fmtDayNum(startDate)}</Text>
      </View>
      <View style={s.vagaMid}>
        <Text style={[s.vagaShiftName, { color: shiftColor }]}>{shiftName}</Text>
        <Text style={[s.vagaTime, { color: C.text.secondary }]}>
          {startDate ? fmtTime(startDate) : ''}{endDate ? ' – ' + fmtTime(endDate) : ''}
        </Text>
        {hours != null && (
          <Text style={[s.vagaDuration, { color: C.text.tertiary }]}>{hours}h de plantão</Text>
        )}
      </View>
      <View style={s.vagaRight}>
        <View style={[s.vagaSlotsBadge, { backgroundColor: C.accentSoft }]}>
          <Text style={[s.vagaSlotsText, { color: C.primary }]}>{slotsLeft}</Text>
        </View>
        <Text style={[s.vagaSlotsLabel, { color: C.text.tertiary }]}>
          {slotsLeft === 1 ? 'vaga' : 'vagas'}
        </Text>
      </View>
      <View style={s.vagaChevron}>
        <Ionicons name="chevron-forward" size={16} color={C.text.tertiary} />
      </View>
    </Pressable>
  );
}

// ── Card de cessão que EU abri (aguardando colega pegar) ─────────────────────
function MyCedeCard({ item, onCancel, C, s }) {
  const snap = item?.originShiftSnapshot || {};
  const startISO = snap.startISO || item.startISO;
  const endISO = snap.endISO || item.endISO;
  const startDate = startISO ? new Date(startISO) : null;
  const endDate = endISO ? new Date(endISO) : null;
  const labelKey = String(snap.label || item.label || '').charAt(0).toUpperCase();
  const shiftName = SHIFT_NAMES[labelKey] || snap.label || item.label || 'Plantão';
  const groupName = snap.group?.name || item.group?.name || '—';

  return (
    <View style={[s.myCedeCard, { borderColor: C.warning + '40', backgroundColor: C.warning + '08' }]}>
      <View style={s.myCedeHead}>
        <View style={[s.myCedeIcon, { backgroundColor: C.warning + '22' }]}>
          <Ionicons name="megaphone" size={14} color={C.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.myCedeTitle, { color: C.text.primary }]} numberOfLines={1}>
            {shiftName} · {fmtDay(startDate)} {fmtDayNum(startDate)}
          </Text>
          <Text style={[s.myCedeSub, { color: C.text.tertiary }]} numberOfLines={1}>
            {groupName} · aguardando colega
          </Text>
        </View>
        {startDate && (
          <Text style={[s.myCedeTime, { color: C.text.tertiary }]}>
            {fmtTime(startDate)}{endDate ? '–' + fmtTime(endDate) : ''}
          </Text>
        )}
      </View>
      <Pressable onPress={onCancel} style={[s.myCedeCancel, { borderColor: C.warning + '55' }]}>
        <Text style={[s.myCedeCancelText, { color: C.warning }]}>Cancelar cessão</Text>
      </Pressable>
    </View>
  );
}

// ── Card "Falta gente com você" (plantão seu, time incompleto) ───────────────
function FaltaCard({ item, onPress, onChamar, C, s }) {
  const { start, end } = parseSlotTimes(item.time || item.labelRaw);
  const startDate = new Date(`${item.date}T00:00:00`);
  const labelKey = String(item.label || '').charAt(0).toUpperCase();
  const shiftColor = SHIFT_COLORS(C)[labelKey] || C.primary;
  const shiftName = SHIFT_NAMES[labelKey] || item.label || 'Plantão';
  const missing = item.available || 0;

  return (
    <Pressable onPress={() => onPress(item)} style={[s.faltaCard, { borderColor: C.warning + '33' }]}>
      <View style={s.faltaTopRow}>
        <Ionicons name="person-circle-outline" size={14} color={C.warning} />
        <Text style={[s.faltaTopText, { color: C.warning }]}>no seu plantão · você está escalada</Text>
      </View>
      <View style={s.faltaBody}>
        <View style={[s.vagaDayCol, { width: 46 }]}>
          <Text style={[s.vagaDay, { color: C.text.tertiary }]}>{fmtDay(startDate)}</Text>
          <Text style={[s.vagaDayNum, { color: C.text.primary }]}>{fmtDayNum(startDate)}</Text>
        </View>
        <View style={s.vagaMid}>
          <Text style={[s.vagaShiftName, { color: shiftColor }]}>{shiftName}</Text>
          {!!(start && end) && (
            <Text style={[s.vagaTime, { color: C.text.secondary }]}>{start} – {end}</Text>
          )}
          <Text style={[s.vagaDuration, { color: C.text.tertiary }]} numberOfLines={1}>{item.group?.name || ''}</Text>
        </View>
      </View>
      <View style={s.faltaFooter}>
        <Text style={[s.faltaFooterText, { color: C.text.secondary }]}>
          Falta <Text style={{ color: C.warning, fontFamily: Typography.fontFamily.bold }}>{missing} {missing === 1 ? 'colega' : 'colegas'}</Text> no seu plantão.
        </Text>
        <Pressable onPress={() => onChamar(item)} style={[s.chamarBtn, { backgroundColor: C.primary }]} hitSlop={6}>
          <Ionicons name="person-add-outline" size={13} color="#fff" />
          <Text style={s.chamarBtnText}>Chamar</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ── Tela ─────────────────────────────────────────────────────────────────────
export default function OpeningsScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);
  const {
    openings, myCededOpenings, loading, error, refresh,
    claimOpening, cancelCedeOpening,
  } = useOpenings();
  const { addClaimedShiftLocally, restoreShiftLocally } = useShifts();
  const { groups: ctxGroups } = useGroups();
  const { user, token } = useContext(AuthContext);
  const [refreshing, setRefreshing] = useState(false);
  const [filterGroupKey, setFilterGroupKey] = useState(null); // null = Tudo; senão = nome do grupo
  const [detailVaga, setDetailVaga] = useState(null);   // vaga "por equipe" no sheet
  const [faltaGente, setFaltaGente] = useState([]);     // plantões meus c/ time incompleto
  const [faltaDetail, setFaltaDetail] = useState(null); // opening-like p/ detalhe falta
  const [chamarShift, setChamarShift] = useState(null); // shift p/ sugerir a um colega

  const selfId = String(user?.id || '');

  useEffect(() => { refresh(true); }, [refresh]);

  // Carrega "Falta gente com você": meus plantões nos próximos 7 dias cujo turno
  // tem vaga em aberto no grupo (eu escalada + slot.available > 0).
  useEffect(() => {
    if (!ctxGroups?.length || !user?.id) { setFaltaGente([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const limit = new Date(today); limit.setDate(limit.getDate() + 7);
        const out = [];
        for (const mk of _monthKeysBetween(today, limit)) {
          const res = await GroupScheduleService.getMultipleMonths({
            groups: ctxGroups, monthKey: mk, token,
            userSource: user?.source, currentUserId: user?.id,
          });
          for (const g of ctxGroups) {
            const days = res[String(g.id)]?.days || {};
            for (const [date, day] of Object.entries(days)) {
              const d = new Date(`${date}T00:00:00`);
              if (d < today || d > limit) continue;
              for (const slot of (day?.slots || [])) {
                const mine = (slot.assignments || []).some(a => String(a.userId) === selfId);
                if (mine && (slot.available || 0) > 0) {
                  out.push({
                    key: `${g.id}-${date}-${slot.label}`,
                    group: g, date, label: slot.label,
                    time: slot.time, labelRaw: slot.labelRaw,
                    available: slot.available, assignments: slot.assignments || [],
                  });
                }
              }
            }
          }
        }
        out.sort((a, b) => `${a.date}${a.label}`.localeCompare(`${b.date}${b.label}`));
        if (!cancelled) setFaltaGente(out);
      } catch (err) {
        Logger.warn(`[OpeningsScreen] falta gente: ${err?.message}`);
        if (!cancelled) setFaltaGente([]);
      }
    })();
    return () => { cancelled = true; };
  }, [ctxGroups, token, user?.id, user?.source, refreshing]);

  // "Chamar": sugere o plantão (vaga em aberto) a um colega → vira cessão
  // direcionada nas movimentações dele.
  const handleChamar = useCallback((item) => {
    const { startISO, endISO, durationMinutes } = faltaToShift(item);
    setChamarShift({
      id: `vaga_${item.group?.id}_${item.date}_${item.label}`,
      label: item.label,
      date: item.date,
      startISO, endISO,
      monthKey: item.date.slice(0, 7),
      durationMinutes,
      group: item.group,
    });
  }, []);

  const openFaltaDetail = useCallback((item) => {
    const { startISO, endISO, durationMinutes } = faltaToShift(item);
    setFaltaDetail({
      id: item.key,
      kind: 'falta',
      label: item.label,
      dateKey: item.date,
      monthKey: item.date.slice(0, 7),
      startISO, endISO, durationMinutes,
      availableSlots: item.available,
      group: item.group,
    });
  }, []);

  const handleClaim = useCallback(async (openingId, slotId) => {
    const r = await claimOpening(openingId, slotId);
    if (r?.success && r?.claimedShift) {
      await addClaimedShiftLocally?.(r.claimedShift);
    }
    return r;
  }, [claimOpening, addClaimedShiftLocally]);

  const handleCancelMyCede = useCallback((opening) => {
    Alert.alert(
      'Cancelar cessão?',
      `${opening?.group?.name || 'Plantão'} volta pra você.`,
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Cancelar cessão',
          style: 'destructive',
          onPress: async () => {
            const r = await cancelCedeOpening(opening.id);
            if (r?.success && r?.restoredShift) {
              await restoreShiftLocally?.(r.restoredShift);
            }
          },
        },
      ],
    );
  }, [cancelCedeOpening, restoreShiftLocally]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh(true);
    setRefreshing(false);
  }, [refresh]);

  const vacancies = (openings || []).filter(o => (o.availableSlots || 0) > 0);
  const myActive  = (myCededOpenings || []).filter(o => o.status === 'active' || !o.status);

  // Universo de grupos: meus grupos (sempre, mesmo com 0 vagas) + grupos vistos
  // em vagas/cessões. Key = nome (estável entre contexto e openings, cujos ids
  // divergem — public_id vs id). Pills nunca somem ao zerar as vagas.
  const groupChips = useMemo(() => {
    const map = new Map();
    const add = (g) => {
      if (!g?.name || map.has(g.name)) return;
      map.set(g.name, { key: g.name, name: g.name, color: g.color || C.primary });
    };
    (ctxGroups || []).forEach(add);
    [...vacancies, ...myActive].forEach(o => add(o.group));
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [ctxGroups, vacancies, myActive, C.primary]);

  const visibleVacancies = filterGroupKey
    ? vacancies.filter(o => o.group?.name === filterGroupKey)
    : vacancies;

  // Agrupar por equipe — uma seção por grupo do universo (inclui 0 vagas).
  const byGroup = useMemo(() => {
    const chips = filterGroupKey ? groupChips.filter(g => g.key === filterGroupKey) : groupChips;
    return chips.map(g => ({
      ...g,
      items: visibleVacancies
        .filter(o => o.group?.name === g.name)
        .sort((a, b) => (a.startISO || '').localeCompare(b.startISO || '')),
    }));
  }, [groupChips, visibleVacancies, filterGroupKey]);

  return (
    <View style={[s.root, { backgroundColor: C.background.secondary }]}>
      {loading && !refreshing ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Ionicons name="alert-circle-outline" size={32} color={C.text.tertiary} />
          <Text style={[s.errorText, { color: C.text.tertiary }]}>{error}</Text>
          <Pressable onPress={() => refresh(true)} style={[s.retryBtn, { borderColor: C.primary }]}>
            <Text style={[s.retryText, { color: C.primary }]}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Filter chips no topo (não-scrollam com o conteúdo) */}
          {groupChips.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chipsRow}
              style={s.chipsScroll}
            >
              <Pressable
                onPress={() => setFilterGroupKey(null)}
                style={[s.chip, !filterGroupKey && { backgroundColor: C.primary, borderColor: C.primary }]}
              >
                <Text style={[s.chipText, { color: !filterGroupKey ? '#fff' : C.text.secondary }]}>Tudo</Text>
              </Pressable>
              {groupChips.map(g => {
                const active = filterGroupKey === g.key;
                const gc = String(g.color).startsWith('#') ? g.color : `#${g.color}`;
                return (
                  <Pressable
                    key={g.key}
                    onPress={() => setFilterGroupKey(active ? null : g.key)}
                    style={[s.chip, active && { borderColor: gc, backgroundColor: gc + '14' }]}
                  >
                    <View style={[s.chipDot, { backgroundColor: gc }]} />
                    <Text style={[s.chipText, { color: active ? gc : C.text.secondary }]} numberOfLines={1}>
                      {g.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: Spacing.screen, paddingBottom: Spacing.lg, paddingTop: Spacing.sm }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
          >
            <Text style={s.caption}>próximos 7 dias · seus grupos</Text>

            {faltaGente.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Falta gente com você</Text>
                {faltaGente.map(item => (
                  <FaltaCard
                    key={item.key}
                    item={item}
                    onPress={openFaltaDetail}
                    onChamar={handleChamar}
                    C={C}
                    s={s}
                  />
                ))}
              </>
            )}

            {myActive.length > 0 && (
              <>
                <Text style={[s.sectionLabel, faltaGente.length > 0 && { marginTop: Spacing.lg }]}>Minhas cessões abertas</Text>
                {myActive.map(item => (
                  <MyCedeCard
                    key={item.id}
                    item={item}
                    onCancel={() => handleCancelMyCede(item)}
                    C={C}
                    s={s}
                  />
                ))}
              </>
            )}

            {/* Sem nenhuma vaga em lugar nenhum: card branco, mas o header (chips
                + cessões) permanece. Com vagas: lista por equipe. */}
            {vacancies.length === 0 ? (
              <View style={[
                s.empty,
                { backgroundColor: C.background.elevated, borderColor: C.border.light },
                myActive.length > 0 && { marginTop: Spacing.lg },
              ]}>
                <Ionicons name="calendar-outline" size={28} color={C.text.tertiary} style={{ marginBottom: 10 }} />
                <Text style={[s.emptyText, { color: C.text.tertiary }]}>Nenhuma vaga disponível</Text>
              </View>
            ) : (
              <>
                <Text style={[s.sectionLabel, { marginTop: (myActive.length > 0 || faltaGente.length > 0) ? Spacing.lg : 0 }]}>
                  Por equipe
                </Text>
                {byGroup.map(g => {
                  const gc = String(g.color).startsWith('#') ? g.color : `#${g.color}`;
                  const totalVagas = g.items.reduce((acc, o) => acc + (o.availableSlots || 0), 0);
                  return (
                    <View key={g.key} style={s.groupSection}>
                      <View style={s.groupHeaderRow}>
                        <View style={[s.groupHeaderDot, { backgroundColor: gc }]} />
                        <Text style={[s.groupHeaderName, { color: C.text.primary }]} numberOfLines={1}>
                          {g.name}
                        </Text>
                        <Text style={[s.groupHeaderCount, { color: C.text.tertiary }]}>
                          {totalVagas} vaga{totalVagas !== 1 ? 's' : ''}
                        </Text>
                      </View>
                      {g.items.length === 0 ? (
                        <Text style={s.groupEmptyRow}>Nenhuma vaga aberta</Text>
                      ) : (
                        g.items.map(item => (
                          <VagaCard key={item.id} item={item} onPress={setDetailVaga} C={C} s={s} />
                        ))
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        </>
      )}

      <VagaDetailSheet
        visible={!!detailVaga}
        opening={detailVaga}
        onClose={() => setDetailVaga(null)}
        onClaim={handleClaim}
      />

      <VagaDetailSheet
        visible={!!faltaDetail}
        opening={faltaDetail}
        mode="falta"
        onChamar={(o) => {
          const item = faltaGente.find(f => f.key === o.id);
          if (item) handleChamar(item);
        }}
        onClose={() => setFaltaDetail(null)}
      />

      <CederFlowSheet
        visible={!!chamarShift}
        shift={chamarShift}
        initialMode="targeted"
        title="Sugerir plantão a um colega"
        onClose={() => setChamarShift(null)}
      />
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  retryText: { fontSize: 13, fontFamily: Typography.fontFamily.semiBold },

  // Filter chips
  chipsScroll: { maxHeight: 48 },
  chipsRow: {
    gap: 8, paddingHorizontal: Spacing.screen, paddingVertical: 10, paddingRight: Spacing.screen + 4,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, borderWidth: 0.5, borderColor: C.border.light,
    backgroundColor: C.background.elevated,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 12.5, fontFamily: Typography.fontFamily.semiBold, maxWidth: 130 },

  // Caption sob o header
  caption: {
    fontSize: 12, fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary, marginBottom: Spacing.md, marginTop: 2,
  },

  // Section header
  sectionLabel: {
    fontSize: 11.5, fontFamily: Typography.fontFamily.semiBold,
    color: C.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },

  // Falta gente card
  faltaCard: {
    backgroundColor: C.background.elevated,
    borderRadius: 14, borderWidth: 0.5, padding: 12, marginBottom: 8,
    ...Shadows.small,
  },
  faltaTopRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  faltaTopText: {
    fontSize: 10.5, fontFamily: Typography.fontFamily.semiBold,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  faltaBody: { flexDirection: 'row', alignItems: 'center' },
  faltaFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: C.border.light,
  },
  faltaFooterText: { flex: 1, fontSize: 12.5, fontFamily: Typography.fontFamily.regular },
  chamarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
  },
  chamarBtnText: { color: '#fff', fontSize: 12.5, fontFamily: Typography.fontFamily.bold },

  // Group section
  groupSection: { marginBottom: Spacing.md },
  groupHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, marginBottom: 6,
  },
  groupHeaderDot: { width: 10, height: 10, borderRadius: 5 },
  groupHeaderName: { flex: 1, fontSize: 15, fontFamily: Typography.fontFamily.bold },
  groupHeaderCount: { fontSize: 11.5, fontFamily: Typography.fontFamily.semiBold },
  groupEmptyRow: {
    fontSize: 12.5, fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary, paddingVertical: 6, paddingLeft: 18,
  },

  // Vaga card
  vagaCard: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: C.background.elevated,
    borderRadius: 14, borderWidth: 0.5, borderColor: C.border.light,
    overflow: 'hidden', marginBottom: 8,
    ...Shadows.small,
  },
  vagaStrip: { width: 4 },
  vagaDayCol: {
    width: 50, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 1,
  },
  vagaDay: {
    fontSize: 10, fontFamily: Typography.fontFamily.semiBold,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  vagaDayNum: { fontSize: 22, fontFamily: Typography.fontFamily.bold, lineHeight: 26 },
  vagaMid: {
    flex: 1, paddingVertical: 12, paddingHorizontal: 4,
    justifyContent: 'center', gap: 2,
  },
  vagaShiftName: { fontSize: 14, fontFamily: Typography.fontFamily.bold },
  vagaTime: { fontSize: 12.5, fontFamily: Typography.fontFamily.regular },
  vagaDuration: { fontSize: 11, fontFamily: Typography.fontFamily.regular },
  vagaRight: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 14, gap: 2,
  },
  vagaSlotsBadge: {
    minWidth: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
  },
  vagaSlotsText: { fontSize: 15, fontFamily: Typography.fontFamily.bold },
  vagaSlotsLabel: {
    fontSize: 10, fontFamily: Typography.fontFamily.semiBold,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  vagaChevron: { justifyContent: 'center', paddingRight: 10 },

  // My cede card (cessão que eu abri)
  myCedeCard: {
    borderRadius: 14, borderWidth: 0.5, padding: 12, marginBottom: 8,
  },
  myCedeHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  myCedeIcon: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  myCedeTitle: { fontSize: 14, fontFamily: Typography.fontFamily.semiBold },
  myCedeSub:   { fontSize: 11.5, fontFamily: Typography.fontFamily.regular, marginTop: 1 },
  myCedeTime:  { fontSize: 11, fontFamily: Typography.fontFamily.semiBold },
  myCedeCancel: {
    marginTop: 10, paddingVertical: 9, borderRadius: 999,
    alignItems: 'center', borderWidth: 0.5,
  },
  myCedeCancelText: { fontSize: 13, fontFamily: Typography.fontFamily.semiBold },

  // Empty
  empty: { borderRadius: 14, borderWidth: 0.5, padding: 28, alignItems: 'center' },
  emptyText: { fontSize: 14, fontFamily: Typography.fontFamily.semiBold },
});
