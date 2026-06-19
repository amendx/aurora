/**
 * TrocaDetailSheet — detalhe de uma troca direcionada (shiftSwap).
 * Design: screenshot "Detalhe da troca".
 *
 * Perspectiva:
 *   - 'received' → troca proposta a mim: Aceitar troca / Recusar.
 *   - 'sent'     → troca que eu propus: Cancelar troca.
 */

import { useState, useContext } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Typography, BorderRadius } from '../constants/DesignSystem';
import { AuthContext } from '../context/AuthContext';
import { isViewOnly } from '../utils/userSource';
import { useOffers } from '../contexts/OffersContext';
import { useGroups } from '../contexts/GroupsContext';
import {
  ShiftBlock, SwapArrow, initials,
  CrmSwapCountLine,
} from '../components/swapParts';

const AV = (C) => [C.error, C.primary, C.info, C.warning, C.money];
const _hash = (str) => { let h = 0; for (let i = 0; i < String(str).length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); };

export default function TrocaDetailSheet({ visible, swap, mode = 'received', onClose }) {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);
  const { user } = useContext(AuthContext);
  const { acceptSwap, rejectSwap, cancelSwap, swapsSent, swapsReceived } = useOffers();
  const { coworkersById } = useGroups();
  const [busy, setBusy] = useState(false);

  if (!visible || !swap) return null;

  const give = mode === 'received' ? swap.shiftB : swap.shiftA;     // o que EU dou
  const receive = mode === 'received' ? swap.shiftA : swap.shiftB;  // o que EU recebo
  const counterpart = mode === 'received' ? swap.initiatorUserName : swap.targetUserName;
  const counterpartId = mode === 'received' ? swap.initiatorUserId : swap.targetUserId;
  const avColor = AV(C)[_hash(counterpart || swap.id) % AV(C).length];
  const cw = counterpartId ? coworkersById?.[counterpartId] : null;
  const swapCountWithPerson = counterpartId
    ? [...(swapsSent || []), ...(swapsReceived || [])].filter(sw =>
        String(sw.initiatorUserId) === String(counterpartId)
        || String(sw.targetUserId) === String(counterpartId)
      ).length
    : 0;

  const run = async (fn) => {
    setBusy(true);
    try { await fn(swap); } finally { setBusy(false); onClose?.(); }
  };

  const confirmCancel = () => {
    Alert.alert(
      'Cancelar troca?',
      `A proposta para ${counterpart || 'o colega'} será cancelada.`,
      [
        { text: 'Voltar', style: 'cancel' },
        { text: 'Cancelar troca', style: 'destructive', onPress: () => run(cancelSwap) },
      ],
    );
  };

  const hospital = (give?.group || receive?.group)?.institution?.name
    || (give?.group || receive?.group)?.name || '—';

  // Saldo de horas — computado inline pra renderizar como ROW dentro do meta-card
  // (ao invés de card separado). Mantém a estrutura conceitual; só visualmente
  // colado ao hospital row.
  const deltaInfo = (() => {
    const g = Number(give?.durationMinutes) || 0;
    const r = Number(receive?.durationMinutes) || 0;
    if (!g && !r) return null;
    const delta = r - g;
    const abs = Math.abs(delta);
    const hours = Math.floor(abs / 60);
    const mins = abs % 60;
    const fmt = mins ? `${hours}h${String(mins).padStart(2, '0')}` : `${hours}h`;
    if (delta === 0) return { label: 'Saldo', value: 'Mesma duração', color: C.text.secondary, icon: 'remove-outline' };
    if (delta > 0)  return { label: 'Você ganha', value: fmt, color: C.money, icon: 'trending-up-outline' };
    return { label: 'Você perde', value: fmt, color: C.error, icon: 'trending-down-outline' };
  })();

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={s.handle} />
        <View style={s.headerRow}>
          <View>
            <Text style={s.title}>Detalhe da troca</Text>
            <Text style={s.subtitle}>troca de plantão</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={C.text.secondary} />
          </Pressable>
        </View>

        <ScrollView
          style={{ maxHeight: 470 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Troca com — card de pessoa */}
          <View style={s.card}>
            <Text style={s.cap}>TROCA COM</Text>
            <View style={s.personRow}>
              <View style={[s.avatar, { backgroundColor: avColor }]}>
                <Text style={s.avatarText}>{initials(counterpart)}</Text>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={s.personName} numberOfLines={1}>{counterpart || 'Colega'}</Text>
                <CrmSwapCountLine council={cw?.council} swapCount={swapCountWithPerson} C={C} />
              </View>
            </View>
          </View>

          {/* Troca: você dá + arrow + você recebe — num único card pra
              conectar visualmente os dois lados da troca. */}
          <View style={s.swapCard}>
            <Text style={s.capInline}>VOCÊ DÁ</Text>
            <ShiftBlock shift={give} C={C} />
            <View style={s.arrowDivider}>
              <View style={s.arrowLine} />
              <SwapArrow C={C} />
              <View style={s.arrowLine} />
            </View>
            <Text style={s.capInline}>VOCÊ RECEBE</Text>
            <ShiftBlock shift={receive} C={C} />
          </View>

          {/* Meta: saldo + hospital — card único com rows */}
          {(deltaInfo || hospital) && (
            <View style={s.metaCard}>
              {deltaInfo && (
                <View style={s.metaRow}>
                  <Ionicons name={deltaInfo.icon} size={16} color={deltaInfo.color} />
                  <Text style={s.metaLabel}>{deltaInfo.label}</Text>
                  <Text style={[s.metaValue, { color: deltaInfo.color }]} numberOfLines={1}>{deltaInfo.value}</Text>
                </View>
              )}
              {deltaInfo && hospital ? <View style={s.metaHairline} /> : null}
              {hospital && hospital !== '—' && (
                <View style={s.metaRow}>
                  <Ionicons name="business-outline" size={16} color={C.text.tertiary} />
                  <Text style={s.metaLabel}>Hospital</Text>
                  <Text style={s.metaValue} numberOfLines={1}>{hospital}</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* CTA */}
        <View style={s.ctaRow}>
          {busy ? (
            <ActivityIndicator color={C.primary} style={{ flex: 1, paddingVertical: 13 }} />
          ) : isViewOnly(user) ? null : mode === 'received' ? (
            <>
              <Pressable style={[s.primaryBtn, { flex: 2 }]} onPress={() => run(acceptSwap)}>
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={s.primaryBtnText}>Aceitar troca</Text>
              </Pressable>
              <Pressable style={s.secondaryBtn} onPress={() => run(rejectSwap)}>
                <Text style={[s.secondaryBtnText, { color: C.text.secondary }]}>Recusar</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={s.cancelBtn} onPress={confirmCancel}>
              <Text style={s.cancelBtnText}>Cancelar troca</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: C.background.secondary,
    borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl,
    paddingTop: 8,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border.medium, alignSelf: 'center', marginBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 12 },
  title: { fontSize: 18, fontFamily: Typography.fontFamily.display, fontWeight: '700', color: C.text.primary },
  subtitle: { fontSize: 12.5, fontFamily: Typography.fontFamily.regular, color: C.text.tertiary, marginTop: 1 },

  card: {
    backgroundColor: C.background.card,
    borderRadius: 14, borderWidth: 0.5, borderColor: C.border.light,
    padding: 14, marginBottom: 8,
  },
  cap: { fontSize: 10, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.8, color: C.text.tertiary, marginBottom: 12 },

  // Swap card — agrupa "VOCÊ DÁ + arrow + VOCÊ RECEBE" num único container
  // pra os 2 lados ficarem visualmente conectados (em vez de 2 ShiftBlocks
  // soltos + arrow flutuando entre eles).
  swapCard: {
    backgroundColor: C.background.card,
    borderRadius: 14, borderWidth: 0.5, borderColor: C.border.light,
    padding: 14, marginBottom: 8,
  },
  capInline: {
    fontSize: 10, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.8,
    color: C.text.tertiary, marginBottom: 8,
  },
  arrowDivider: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginVertical: 12,
  },
  arrowLine: { flex: 1, height: 0.5, backgroundColor: C.border.light },

  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 15, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.5 },
  personName: { fontSize: 16, fontFamily: Typography.fontFamily.bold, color: C.text.primary },

  // Meta card — saldo de horas + hospital, rows divididos por hairline interna.
  metaCard: {
    backgroundColor: C.background.card,
    borderRadius: 14, borderWidth: 0.5, borderColor: C.border.light,
    paddingHorizontal: 14, paddingVertical: 4,
    marginBottom: 4,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  metaLabel: { flex: 1, fontSize: 13, fontFamily: Typography.fontFamily.regular, color: C.text.secondary },
  metaValue: { fontSize: 13.5, fontFamily: Typography.fontFamily.bold, color: C.text.primary, maxWidth: '60%', textAlign: 'right' },
  metaHairline: { height: 0.5, backgroundColor: C.border.light, marginHorizontal: -14 },

  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 8, paddingHorizontal: 18 },
  primaryBtn: { flexDirection: 'row', gap: 6, paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary },
  primaryBtnText: { color: '#fff', fontSize: 14, fontFamily: Typography.fontFamily.bold },
  secondaryBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background.card, borderWidth: 1, borderColor: C.border.medium },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: C.error + '40', backgroundColor: C.error + '0F' },
  cancelBtnText: { color: C.error, fontSize: 14, fontFamily: Typography.fontFamily.semiBold },
});
