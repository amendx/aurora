import { useState, useEffect, useCallback, useContext } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  RefreshControl, StyleSheet, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Typography, Spacing, BorderRadius, Shadows } from '../constants/DesignSystem';
import { useOffers } from '../contexts/OffersContext';
import { useOpenings } from '../contexts/OpeningsContext';
import { AuthContext } from '../context/AuthContext';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';
import Logger from '../utils/Logger';

const _labelName = (l) => ({ M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite' }[l] || l || 'Plantão');

const _fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
};

const _fmtAbsolute = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const STATUS_META = {
  accepted:  { label: 'Aceito',    tone: 'good'    },
  rejected:  { label: 'Recusado',  tone: 'bad'     },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
  expired:   { label: 'Expirado',  tone: 'neutral' },
};

export default function HistoricoScreen({ navigation }) {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);

  const { user } = useContext(AuthContext);
  const userId = user?.id || null;

  const {
    offersSent, offersReceived, swapsSent, swapsReceived,
    refresh, acceptOffer, rejectOffer, cancelOffer,
    acceptSwap, rejectSwap, cancelSwap,
  } = useOffers();

  const { myCededOpenings, cancelCedeOpening, refresh: refreshOpenings } = useOpenings();

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!userId) return;
    setLoadingHistory(true);
    try {
      const items = await FirebaseAdapter.getHistoryForUser(userId);
      setHistory(items);
    } catch (err) {
      Logger.warn(`[Historico] loadHistory: ${err?.message}`);
    } finally {
      setLoadingHistory(false);
    }
  }, [userId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), loadHistory(), refreshOpenings?.()]);
    setRefreshing(false);
  }, [refresh, loadHistory, refreshOpenings]);

  const cededToGroupActive = (myCededOpenings || []).filter(o => o.status === 'active');
  // Trocas pendentes saíram pra aba "Trocas" — não contam mais aqui.
  const pendingCount =
    offersReceived.length + offersSent.length + cededToGroupActive.length;
  const empty = pendingCount === 0 && history.length === 0;

  // Confirmação antes de cancelar — evita "tap" acidental destruindo a oferta/troca.
  const confirmCancelOffer = (offer) => {
    const sh = offer?.shiftSnapshot || {};
    const detail = `${_labelName(sh.label)} · ${_fmtDate(sh.startISO)}${sh.group?.name ? ' · ' + sh.group.name : ''}`;
    Alert.alert(
      'Cancelar cessão?',
      `Você vai cancelar a cessão deste plantão:\n\n${detail}\n\nO plantão volta para você.`,
      [
        { text: 'Voltar', style: 'cancel' },
        { text: 'Cancelar cessão', style: 'destructive', onPress: () => cancelOffer(offer) },
      ],
    );
  };

  const confirmCancelCedeOpening = (opening) => {
    const snap = opening?.originShiftSnapshot || {};
    const detail = `${_labelName(snap.label || opening.label)} · ${_fmtDate(snap.startISO || opening.startISO)}${opening.group?.name ? ' · ' + opening.group.name : ''}`;
    Alert.alert(
      'Cancelar cessão ao grupo?',
      `Você vai cancelar esta cessão:\n\n${detail}\n\nO plantão volta para você.`,
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Cancelar cessão', style: 'destructive',
          onPress: async () => {
            const r = await cancelCedeOpening(opening.id);
            if (!r?.success) {
              Alert.alert('Erro', 'Não foi possível cancelar a cessão. Tente novamente.');
            }
          },
        },
      ],
    );
  };

  const confirmCancelSwap = (sw) => {
    const A = sw?.shiftA || {};
    const B = sw?.shiftB || {};
    const a = `${_labelName(A.label)} · ${_fmtDate(A.startISO)}`;
    const b = `${_labelName(B.label)} · ${_fmtDate(B.startISO)}`;
    Alert.alert(
      'Cancelar troca?',
      `Você vai cancelar esta proposta de troca:\n\n${a}\n  ⇄\n${b}\n\n${sw.targetUserName || 'O colega'} não poderá mais aceitar.`,
      [
        { text: 'Voltar', style: 'cancel' },
        { text: 'Cancelar troca', style: 'destructive', onPress: () => cancelSwap(sw) },
      ],
    );
  };

  return (
    <View style={[s.root, { backgroundColor: C.background.secondary }]}>
      <ScrollView
        contentContainerStyle={{ padding: Spacing.screen, paddingBottom: Spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {loadingHistory && !refreshing && history.length === 0 && pendingCount === 0 ? (
          <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 40 }} />
        ) : empty ? (
          <View style={[s.empty, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
            <Ionicons name="time-outline" size={28} color={C.text.tertiary} style={{ marginBottom: 10 }} />
            <Text style={[s.emptyText, { color: C.text.tertiary }]}>Sem atividade ainda.</Text>
            <Text style={[s.emptyHint, { color: C.text.tertiary }]}>Cessões e trocas que você faz ou recebe aparecem aqui.</Text>
          </View>
        ) : (
          <>
            {offersReceived.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Aguardando sua resposta</Text>
                {offersReceived.map(o => (
                  <PendingOfferCard
                    key={o.id} offer={o} mode="received"
                    onAccept={() => acceptOffer(o)} onReject={() => rejectOffer(o)}
                    C={C} s={s}
                  />
                ))}
              </>
            )}

            {/* Trocas pendentes (recebidas e enviadas) agora vivem na aba "Trocas".
                O Histórico mantém só cessões pendentes + o histórico fechado. */}

            {offersSent.length > 0 && (
              <>
                <Text style={s.sectionLabelSpaced}>Cessões enviadas (aguardando)</Text>
                {offersSent.map(o => (
                  <PendingOfferCard
                    key={o.id} offer={o} mode="sent"
                    onCancel={() => confirmCancelOffer(o)}
                    C={C} s={s}
                  />
                ))}
              </>
            )}


            {cededToGroupActive.length > 0 && (
              <>
                <Text style={s.sectionLabelSpaced}>Cessões ao grupo (aguardando)</Text>
                {cededToGroupActive.map(op => (
                  <CededToGroupCard
                    key={op.id}
                    opening={op}
                    onCancel={() => confirmCancelCedeOpening(op)}
                    C={C} s={s}
                  />
                ))}
              </>
            )}

            {history.length > 0 && (
              <>
                <Text style={s.sectionLabelSpaced}>Histórico</Text>
                {history.map(item => (
                  <HistoryItem
                    key={`${item.__kind}_${item.id}`}
                    item={item} userId={userId} C={C} s={s}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function CededToGroupCard({ opening, onCancel, C, s }) {
  const [busy, setBusy] = useState(false);
  const snap = opening.originShiftSnapshot || {};
  const label = snap.label || opening.label || 'M';
  const startISO = snap.startISO || opening.startISO;
  const groupName = opening.group?.name || snap.group?.name || 'Grupo';
  const color = opening.group?.color || snap.group?.color || C.primary;

  const handle = async () => { setBusy(true); try { await onCancel(); } finally { setBusy(false); } };

  return (
    <View style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
      <View style={[s.colorStrip, { backgroundColor: color }]} />
      <View style={s.cardBody}>
        <View style={s.cardHeaderRow}>
          <View style={[s.labelChip, { backgroundColor: color + '22' }]}>
            <Text style={[s.labelChipText, { color }]}>{label}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.cardTitle, { color: C.text.primary }]} numberOfLines={1}>
              {_labelName(label)} · {_fmtDate(startISO)}
            </Text>
            <Text style={[s.cardMeta, { color: C.text.tertiary }]} numberOfLines={1}>
              Aberta para {groupName}
            </Text>
          </View>
        </View>

        <View style={s.actionsRow}>
          <Pressable
            style={[s.actionBtn, { backgroundColor: C.error + '14', borderColor: C.error + '40', flex: 1 }]}
            onPress={handle}
            disabled={busy}
          >
            {busy
              ? <ActivityIndicator size="small" color={C.error} />
              : <Text style={[s.actionBtnText, { color: C.error }]}>Cancelar cessão</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function PendingOfferCard({ offer, mode, onAccept, onReject, onCancel, C, s }) {
  const [busy, setBusy] = useState(null);
  const sh = offer.shiftSnapshot || {};
  const color = sh.group?.color || C.primary;
  const handle = async (kind, fn) => { setBusy(kind); try { await fn(); } finally { setBusy(null); } };

  return (
    <View style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
      <View style={[s.colorStrip, { backgroundColor: color }]} />
      <View style={s.cardBody}>
        <View style={s.cardHeaderRow}>
          <View style={[s.labelChip, { backgroundColor: color + '22' }]}>
            <Text style={[s.labelChipText, { color }]}>{sh.label || 'M'}</Text>
          </View>
          <Text style={[s.cardKind, { color: C.primary }]}>
            {mode === 'received' ? 'Plantão cedido a você' : 'Plantão que você cedeu'}
          </Text>
        </View>
        <Text style={s.cardTitle} numberOfLines={1}>{_labelName(sh.label)} · {_fmtDate(sh.startISO || sh.date)}</Text>
        <Text style={s.cardSub} numberOfLines={1}>{sh.group?.institution?.name || sh.group?.name || ''}</Text>

        {mode === 'received' ? (
          <View style={s.cardActions}>
            <Pressable
              style={[s.actionBtn, { backgroundColor: C.background.secondary, borderColor: C.border.light }]}
              onPress={() => handle('reject', onReject)} disabled={!!busy}
            >
              {busy === 'reject' ? <ActivityIndicator color={C.text.secondary} /> : <Text style={[s.actionText, { color: C.text.secondary }]}>Recusar</Text>}
            </Pressable>
            <Pressable
              style={[s.actionBtn, { backgroundColor: C.primary, flex: 2 }]}
              onPress={() => handle('accept', onAccept)} disabled={!!busy}
            >
              {busy === 'accept' ? <ActivityIndicator color="#fff" /> : <Text style={[s.actionText, { color: '#fff' }]}>Aceitar</Text>}
            </Pressable>
          </View>
        ) : (
          <View style={s.cardActions}>
            <Pressable
              style={[s.actionBtn, { backgroundColor: C.background.secondary, borderColor: C.border.light }]}
              onPress={() => handle('cancel', onCancel)} disabled={!!busy}
            >
              {busy === 'cancel' ? <ActivityIndicator color={C.error} /> : <Text style={[s.actionText, { color: C.error }]}>Cancelar oferta</Text>}
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function PendingSwapCard({ swap, mode, onAccept, onReject, onCancel, C, s }) {
  const [busy, setBusy] = useState(null);
  const A = swap.shiftA || {};
  const B = swap.shiftB || {};
  // For the target, A is what they receive and B is what they give.
  const give    = mode === 'received' ? B : A;
  const receive = mode === 'received' ? A : B;
  const handle = async (kind, fn) => { setBusy(kind); try { await fn(); } finally { setBusy(null); } };

  return (
    <View style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
      <View style={s.cardBody}>
        <Text style={[s.cardKind, { color: C.primary, marginBottom: 6 }]}>
          {mode === 'received' ? 'Proposta de troca' : 'Troca que você propôs'}
        </Text>

        <Text style={s.swapEyebrow}>Você dá</Text>
        <View style={s.swapRow}>
          <View style={[s.labelChip, { backgroundColor: (give.group?.color || C.primary) + '22' }]}>
            <Text style={[s.labelChipText, { color: give.group?.color || C.primary }]}>{give.label || 'M'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{_labelName(give.label)} · {_fmtDate(give.startISO || give.date)}</Text>
            <Text style={s.cardSub}>{give.group?.institution?.name || give.group?.name || ''}</Text>
          </View>
        </View>

        <View style={s.swapArrow}><Ionicons name="swap-vertical" size={18} color={C.primary} /></View>

        <Text style={s.swapEyebrow}>Você recebe</Text>
        <View style={s.swapRow}>
          <View style={[s.labelChip, { backgroundColor: (receive.group?.color || C.primary) + '22' }]}>
            <Text style={[s.labelChipText, { color: receive.group?.color || C.primary }]}>{receive.label || 'M'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{_labelName(receive.label)} · {_fmtDate(receive.startISO || receive.date)}</Text>
            <Text style={s.cardSub}>{receive.group?.institution?.name || receive.group?.name || ''}</Text>
          </View>
        </View>

        {mode === 'received' ? (
          <View style={s.cardActions}>
            <Pressable
              style={[s.actionBtn, { backgroundColor: C.background.secondary, borderColor: C.border.light }]}
              onPress={() => handle('reject', onReject)} disabled={!!busy}
            >
              {busy === 'reject' ? <ActivityIndicator color={C.text.secondary} /> : <Text style={[s.actionText, { color: C.text.secondary }]}>Recusar</Text>}
            </Pressable>
            <Pressable
              style={[s.actionBtn, { backgroundColor: C.primary, flex: 2 }]}
              onPress={() => handle('accept', onAccept)} disabled={!!busy}
            >
              {busy === 'accept' ? <ActivityIndicator color="#fff" /> : <Text style={[s.actionText, { color: '#fff' }]}>Aceitar troca</Text>}
            </Pressable>
          </View>
        ) : (
          <View style={s.cardActions}>
            <Pressable
              style={[s.actionBtn, { backgroundColor: C.background.secondary, borderColor: C.border.light }]}
              onPress={() => handle('cancel', onCancel)} disabled={!!busy}
            >
              {busy === 'cancel' ? <ActivityIndicator color={C.error} /> : <Text style={[s.actionText, { color: C.error }]}>Cancelar proposta</Text>}
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function HistoryItem({ item, userId, C, s }) {
  const isSwap = item.__kind === 'swap';
  const meta = STATUS_META[item.status] || { label: item.status || '—', tone: 'neutral' };
  const toneColor =
    meta.tone === 'good' ? C.money :
    meta.tone === 'bad'  ? C.error :
    C.text.tertiary;

  const directionTag = isSwap
    ? (String(item.initiatorUserId) === String(userId) ? 'Você propôs' : 'Proposta a você')
    : (String(item.fromUserId)      === String(userId) ? 'Você cedeu'  : 'Cedido a você');

  const sh = isSwap ? (item.shiftA || {}) : (item.shiftSnapshot || {});
  const color = sh.group?.color || C.primary;
  const when = item.respondedAt || item.createdAt;

  return (
    <View style={[s.historyRow, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
      <View style={[s.labelChip, { backgroundColor: color + '22' }]}>
        <Text style={[s.labelChipText, { color }]}>{sh.label || (isSwap ? '⇄' : 'M')}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.historyTitle} numberOfLines={1}>
          {isSwap
            ? `Troca · ${_fmtDate(item.shiftA?.startISO || item.shiftA?.date)} ⇄ ${_fmtDate(item.shiftB?.startISO || item.shiftB?.date)}`
            : `${_labelName(sh.label)} · ${_fmtDate(sh.startISO || sh.date)}`}
        </Text>
        <Text style={s.historySub} numberOfLines={1}>
          {directionTag} · {_fmtAbsolute(when)}
        </Text>
      </View>
      <View style={[s.statusPill, { borderColor: toneColor }]}>
        <Text style={[s.statusPillText, { color: toneColor }]}>{meta.label}</Text>
      </View>
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  root: { flex: 1 },

  empty: { borderRadius: BorderRadius.md, borderWidth: 0.5, padding: Spacing.xl, alignItems: 'center' },
  emptyText: { fontSize: 14, fontWeight: '600' },
  emptyHint: { fontSize: 12, textAlign: 'center', marginTop: 4, lineHeight: 17 },

  sectionLabel:        { fontSize: 11.5, fontWeight: '600', color: C.text.tertiary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
  sectionLabelSpaced:  { fontSize: 11.5, fontWeight: '600', color: C.text.tertiary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm, marginTop: Spacing.lg },

  card: { borderRadius: BorderRadius.md, borderWidth: 0.5, overflow: 'hidden', marginBottom: Spacing.sm, flexDirection: 'row', ...Shadows.small },
  colorStrip: { width: 4 },
  cardBody: { flex: 1, padding: 12 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardKind: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: C.text.primary },
  cardSub: { fontSize: 11.5, color: C.text.tertiary, marginTop: 1 },
  labelChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  labelChipText: { fontSize: 11, fontWeight: '800' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 0.5, borderColor: 'transparent' },
  actionText: { fontSize: 13, fontWeight: '700' },

  swapEyebrow: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: C.text.tertiary, marginBottom: 4, marginTop: 4 },
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 8, backgroundColor: C.background.secondary },
  swapArrow: { alignItems: 'center', paddingVertical: 4 },

  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: BorderRadius.md, borderWidth: 0.5, marginBottom: Spacing.xs,
  },
  historyTitle: { fontSize: 13, fontWeight: '700', color: C.text.primary },
  historySub: { fontSize: 11, color: C.text.tertiary, marginTop: 2 },

  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  statusPillText: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
});
