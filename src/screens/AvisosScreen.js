import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  RefreshControl, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Typography, Spacing, BorderRadius, Shadows } from '../constants/DesignSystem';
import { useOffers } from '../contexts/OffersContext';
import { routeForNotification } from '../utils/notificationRoute';

const _labelName = (l) => ({ M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite' }[l] || l || 'Plantão');
const _fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
};
const _fmtAgo = (iso) => {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
};

export default function AvisosScreen({ navigation }) {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);
  const {
    offersReceived, swapsReceived, inbox, loading,
    refresh, acceptOffer, rejectOffer, acceptSwap, rejectSwap,
    markInboxRead, markAllInboxRead,
  } = useOffers();
  const [refreshing, setRefreshing] = useState(false);

  // Ao abrir a tela, marca todas as notificações como lidas — o badge da
  // Home reflete esse estado e some/decrementa imediatamente. Só roda 1x
  // por montagem pra evitar loop com a atualização do snapshot do inbox.
  const markedOnceRef = useRef(false);
  useEffect(() => {
    if (markedOnceRef.current) return;
    if (loading) return;
    const hasUnread = inbox.some(n => !n.read);
    if (!hasUnread) return;
    markedOnceRef.current = true;
    markAllInboxRead();
  }, [loading, inbox, markAllInboxRead]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const outcomeNotifs = useMemo(
    () => inbox.filter(n => n.type === 'offer_outcome' || n.type === 'ceder_in_my_group').slice(0, 12),
    [inbox],
  );

  const empty = offersReceived.length === 0 && swapsReceived.length === 0 && outcomeNotifs.length === 0;

  // Tocar num aviso → marca lido e cai na tela do aviso em questão (Vagas,
  // Movimentações, …), conforme o tipo/payload. Mesmo mapa do deep-link de push.
  const onOutcomePress = useCallback((n) => {
    if (!n.read) markInboxRead(n.id);
    const route = routeForNotification({ type: n.type, ...(n.payload || {}) });
    if (route) navigation?.navigate?.(route.screen, route.params || null);
  }, [markInboxRead, navigation]);

  return (
    <View style={[s.root, { backgroundColor: C.background.secondary }]}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => navigation?.goBack?.()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.primary} />
        </Pressable>
        <Text style={[s.title, { color: C.text.primary }]}>Avisos</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.screen, paddingBottom: Spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 40 }} />
        ) : empty ? (
          <View style={[s.empty, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
            <Ionicons name="notifications-outline" size={28} color={C.text.tertiary} style={{ marginBottom: 10 }} />
            <Text style={[s.emptyText, { color: C.text.tertiary }]}>Tudo em dia.</Text>
            <Text style={[s.emptyHint, { color: C.text.tertiary }]}>Ofertas e propostas pendentes aparecerão aqui.</Text>
          </View>
        ) : (
          <>
            {offersReceived.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { color: C.text.tertiary }]}>Plantões oferecidos a você</Text>
                {offersReceived.map(o => (
                  <OfferCard
                    key={o.id}
                    offer={o}
                    onAccept={() => acceptOffer(o)}
                    onReject={() => rejectOffer(o)}
                    C={C}
                    s={s}
                  />
                ))}
              </>
            )}

            {swapsReceived.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { color: C.text.tertiary, marginTop: Spacing.lg }]}>Propostas de troca</Text>
                {swapsReceived.map(sw => (
                  <SwapCard
                    key={sw.id}
                    swap={sw}
                    onAccept={() => acceptSwap(sw)}
                    onReject={() => rejectSwap(sw)}
                    C={C}
                    s={s}
                  />
                ))}
              </>
            )}

            {outcomeNotifs.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { color: C.text.tertiary, marginTop: Spacing.lg }]}>Atividade recente</Text>
                {outcomeNotifs.map(n => (
                  <Pressable
                    key={n.id}
                    style={[s.outcomeRow, !n.read && { backgroundColor: C.accentSoft + '40' }]}
                    onPress={() => onOutcomePress(n)}
                  >
                    {!n.read && <View style={s.unreadDot} />}
                    <View style={{ flex: 1 }}>
                      <Text style={s.outcomeTitle} numberOfLines={1}>{n.title}</Text>
                      {n.body ? <Text style={s.outcomeBody} numberOfLines={2}>{n.body}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={C.text.tertiary} style={{ marginLeft: 4 }} />
                    <Text style={s.outcomeAgo}>{_fmtAgo(n.createdAt)}</Text>
                  </Pressable>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function OfferCard({ offer, onAccept, onReject, C, s }) {
  const [busy, setBusy] = useState(null);
  const sh = offer.shiftSnapshot || {};
  const color = sh.group?.color || C.primary;
  const handle = async (kind, fn) => { setBusy(kind); await fn(); setBusy(null); };
  return (
    <View style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
      <View style={[s.colorStrip, { backgroundColor: color }]} />
      <View style={s.cardBody}>
        <View style={s.cardHeaderRow}>
          <View style={[s.labelChip, { backgroundColor: color + '22' }]}>
            <Text style={[s.labelChipText, { color }]}>{sh.label || 'M'}</Text>
          </View>
          <Text style={[s.cardKind, { color: C.primary }]}>Plantão cedido</Text>
        </View>
        <Text style={s.cardTitle} numberOfLines={1}>{_labelName(sh.label)} · {_fmtDate(sh.startISO)}</Text>
        <Text style={s.cardSub} numberOfLines={1}>{sh.group?.institution?.name || sh.group?.name || ''}</Text>
        <View style={s.cardActions}>
          <Pressable
            style={[s.actionBtn, { backgroundColor: C.background.secondary, borderColor: C.border.light }]}
            onPress={() => handle('reject', onReject)}
            disabled={!!busy}
          >
            {busy === 'reject' ? <ActivityIndicator color={C.text.secondary} /> : <Text style={[s.actionText, { color: C.text.secondary }]}>Recusar</Text>}
          </Pressable>
          <Pressable
            style={[s.actionBtn, { backgroundColor: C.primary, flex: 2 }]}
            onPress={() => handle('accept', onAccept)}
            disabled={!!busy}
          >
            {busy === 'accept' ? <ActivityIndicator color="#fff" /> : <Text style={[s.actionText, { color: '#fff' }]}>Aceitar</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function SwapCard({ swap, onAccept, onReject, C, s }) {
  const [busy, setBusy] = useState(null);
  const A = swap.shiftA || {};
  const B = swap.shiftB || {};
  const handle = async (kind, fn) => { setBusy(kind); await fn(); setBusy(null); };
  return (
    <View style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
      <View style={s.cardBody}>
        <Text style={[s.cardKind, { color: C.primary, marginBottom: 6 }]}>Proposta de troca</Text>

        <Text style={s.swapEyebrow}>Você dá</Text>
        <View style={s.swapRow}>
          <View style={[s.labelChip, { backgroundColor: (B.group?.color || C.primary) + '22' }]}>
            <Text style={[s.labelChipText, { color: B.group?.color || C.primary }]}>{B.label || 'M'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{_labelName(B.label)} · {_fmtDate(B.startISO)}</Text>
            <Text style={s.cardSub}>{B.group?.institution?.name || B.group?.name || ''}</Text>
          </View>
        </View>

        <View style={s.swapArrow}><Ionicons name="swap-vertical" size={18} color={C.primary} /></View>

        <Text style={s.swapEyebrow}>Você recebe</Text>
        <View style={s.swapRow}>
          <View style={[s.labelChip, { backgroundColor: (A.group?.color || C.primary) + '22' }]}>
            <Text style={[s.labelChipText, { color: A.group?.color || C.primary }]}>{A.label || 'M'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{_labelName(A.label)} · {_fmtDate(A.startISO)}</Text>
            <Text style={s.cardSub}>{A.group?.institution?.name || A.group?.name || ''}</Text>
          </View>
        </View>

        <View style={s.cardActions}>
          <Pressable
            style={[s.actionBtn, { backgroundColor: C.background.secondary, borderColor: C.border.light }]}
            onPress={() => handle('reject', onReject)}
            disabled={!!busy}
          >
            {busy === 'reject' ? <ActivityIndicator color={C.text.secondary} /> : <Text style={[s.actionText, { color: C.text.secondary }]}>Recusar</Text>}
          </Pressable>
          <Pressable
            style={[s.actionBtn, { backgroundColor: C.primary, flex: 2 }]}
            onPress={() => handle('accept', onAccept)}
            disabled={!!busy}
          >
            {busy === 'accept' ? <ActivityIndicator color="#fff" /> : <Text style={[s.actionText, { color: '#fff' }]}>Aceitar troca</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingBottom: 12, gap: 8 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: Typography.fontFamily.display, fontWeight: '700' },

  empty: { borderRadius: BorderRadius.md, borderWidth: 0.5, padding: Spacing.xl, alignItems: 'center' },
  emptyText: { fontSize: 14, fontWeight: '600' },
  emptyHint: { fontSize: 12, textAlign: 'center', marginTop: 4, lineHeight: 17 },

  sectionLabel: { fontSize: 11.5, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },

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

  outcomeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 6 },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary },
  outcomeTitle: { fontSize: 13, fontWeight: '600', color: C.text.primary },
  outcomeBody: { fontSize: 11.5, color: C.text.tertiary, marginTop: 2 },
  outcomeAgo: { fontSize: 10.5, color: C.text.tertiary },
});
