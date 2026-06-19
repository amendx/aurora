/**
 * CessaoDetailSheet — detalhe de uma cessão ao grupo (primeiro a pegar leva).
 *
 * Design: design/groups/cessao/B _ Primeiro a aceitar leva.html
 *
 * Duas perspectivas, derivadas de originUserId vs user.id:
 *   - 'mine'  → cedente: aguardando alguém aceitar, pode cancelar.
 *   - 'group' → colega: pega o plantão (primeiro a pegar leva).
 */

import { useState, useContext } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Typography, BorderRadius } from '../constants/DesignSystem';
import { AuthContext } from '../context/AuthContext';
import { isViewOnly } from '../utils/userSource';
import { useOpenings } from '../contexts/OpeningsContext';
import { useShifts } from '../contexts/ShiftsContext';

const SHIFT_COLORS = (C) => ({ M: C.money, T: C.warning, N: C.info, D: C.info });
const SHIFT_NAMES = { M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite' };
const WEEKDAY_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const _hhmm = (iso) => (typeof iso === 'string' && iso.length >= 16 && iso.includes('T') ? iso.slice(11, 16) : '');
const _initials = (name = '') =>
  String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const _relTime = (iso) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 0) return '';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ontem' : `há ${d} d`;
};

export default function CessaoDetailSheet({ visible, opening, onClose }) {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);
  const { user } = useContext(AuthContext);
  const { claimOpening, cancelCedeOpening } = useOpenings();
  const { addClaimedShiftLocally, restoreShiftLocally } = useShifts();

  const [busy, setBusy] = useState(false);

  const selfId = String(user?.id || '');
  const isMine = opening && String(opening.originUserId) === selfId;

  const startISO = opening?.startISO || opening?.originShiftSnapshot?.startISO;
  const endISO = opening?.endISO || opening?.originShiftSnapshot?.endISO;
  const startDate = startISO ? new Date(startISO) : null;
  const labelKey = String(opening?.label || '').charAt(0).toUpperCase();
  const shiftColor = SHIFT_COLORS(C)[labelKey] || C.primary;
  const shiftName = SHIFT_NAMES[labelKey] || opening?.label || 'Plantão';
  const hours = opening?.durationMinutes ? Math.round(opening.durationMinutes / 60) : null;
  const timeStr = (() => {
    const a = _hhmm(startISO), b = _hhmm(endISO);
    return a && b ? `${a}–${b}` : a;
  })();
  const group = opening?.group || opening?.originShiftSnapshot?.group || null;
  const gc = group?.color ? (String(group.color).startsWith('#') ? group.color : `#${group.color}`) : C.primary;
  const institution = group?.institution?.name || '';
  const cedenteName = opening?.originUserName || 'Colega';

  if (!visible || !opening) return null;

  const wrap = async (fn) => { setBusy(true); const r = await fn(); setBusy(false); return r; };

  const handleClaim = () => {
    Alert.alert('Pegar este plantão?', `${shiftName} · ${cedenteName}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Pegar plantão',
        onPress: () => wrap(async () => {
          const r = await claimOpening(opening.id, opening.slots?.[0]?.slotId);
          if (r?.success && r?.claimedShift) await addClaimedShiftLocally?.(r.claimedShift);
          if (r?.success) onClose?.();
          else Alert.alert('Erro', 'Não foi possível assumir. Tente novamente.');
        }),
      },
    ]);
  };

  const handleCancel = () => {
    Alert.alert('Cancelar cessão?', `${shiftName} volta pra você.`, [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar cessão',
        style: 'destructive',
        onPress: () => wrap(async () => {
          const r = await cancelCedeOpening(opening.id);
          if (r?.success && r?.restoredShift) await restoreShiftLocally?.(r.restoredShift);
          if (r?.success) onClose?.();
        }),
      },
    ]);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={s.handle} />
        <View style={s.headerRow}>
          <Text style={s.title}>{isMine ? 'Sua cessão' : 'Cessão do grupo'}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={C.text.secondary} />
          </Pressable>
        </View>

        <ScrollView
          style={{ maxHeight: 480 }}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Quem cedeu */}
          <View style={s.cedenteRow}>
            <View style={[s.avatar, s.avatarFallback, { backgroundColor: (isMine ? C.warning : shiftColor) + '22' }]}>
              {isMine
                ? <Ionicons name="megaphone" size={18} color={C.warning} />
                : <Text style={[s.avatarInitials, { color: shiftColor }]}>{_initials(cedenteName)}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cedenteName} numberOfLines={1}>
                {isMine ? 'Você cedeu ao grupo' : cedenteName}
              </Text>
              <Text style={s.cedenteSub} numberOfLines={1}>
                {isMine ? 'aguardando alguém aceitar' : 'cedeu ao grupo'}
              </Text>
            </View>
            {!!_relTime(opening.createdAt) && <Text style={s.relTime}>{_relTime(opening.createdAt)}</Text>}
          </View>

          {/* Badge do modo */}
          <View style={[s.modeBadge, { backgroundColor: C.money + '14' }]}>
            <Ionicons name="flash-outline" size={13} color={C.money} />
            <Text style={[s.modeBadgeText, { color: C.money }]}>PRIMEIRO A PEGAR LEVA</Text>
          </View>

          {/* Plantão */}
          <View style={[s.shiftCard, { borderColor: shiftColor + '33', backgroundColor: shiftColor + '0d' }]}>
            <View style={s.shiftHeadRow}>
              <View style={s.dayCol}>
                <Text style={[s.dayWk, { color: C.text.tertiary }]}>{startDate ? WEEKDAY_PT[startDate.getDay()] : ''}</Text>
                <Text style={[s.dayNum, { color: C.text.primary }]}>{startDate ? String(startDate.getDate()).padStart(2, '0') : ''}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={[s.shiftBadge, { backgroundColor: shiftColor + '1f' }]}>
                  <Text style={[s.shiftBadgeText, { color: shiftColor }]}>{shiftName}</Text>
                </View>
                <Text style={s.shiftTime}>
                  {timeStr}{hours != null ? `  ·  ${hours}h` : ''}
                </Text>
              </View>
            </View>
            <View style={s.groupRow}>
              <View style={[s.groupDot, { backgroundColor: gc }]} />
              <Text style={s.groupName} numberOfLines={1}>{group?.name || '—'}</Text>
            </View>
            {!!institution && <Text style={s.institution} numberOfLines={1}>{institution}</Text>}
          </View>
        </ScrollView>

        {/* CTA */}
        <View style={s.ctaRow}>
          {busy ? (
            <ActivityIndicator color={C.primary} style={{ paddingVertical: 13, flex: 1 }} />
          ) : isMine ? (
            <Pressable style={s.cancelBtn} onPress={handleCancel}>
              <Text style={s.cancelBtnText}>Cancelar cessão</Text>
            </Pressable>
          ) : isViewOnly(user) ? null : (
            <Pressable style={[s.primaryBtn, { backgroundColor: C.primary }]} onPress={handleClaim}>
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={s.primaryBtnText}>Pegar plantão</Text>
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
    backgroundColor: C.background.elevated,
    borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl,
    paddingTop: 8,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border.medium, alignSelf: 'center', marginBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 12 },
  title: { fontSize: 18, fontFamily: Typography.fontFamily.display, fontWeight: '700', color: C.text.primary },

  cedenteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.background.secondary },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 13, fontWeight: '700' },
  cedenteName: { fontSize: 16, fontFamily: Typography.fontFamily.bold, color: C.text.primary },
  cedenteSub: { fontSize: 11.5, color: C.text.tertiary, marginTop: 2 },
  relTime: { fontSize: 11, color: C.text.quaternary },

  modeBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginBottom: 12 },
  modeBadgeText: { fontSize: 10, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.6 },

  shiftCard: { borderRadius: 14, borderWidth: 0.5, padding: 14, marginBottom: 14 },
  shiftHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayCol: { width: 44, alignItems: 'center' },
  dayWk: { fontSize: 10, fontFamily: Typography.fontFamily.semiBold, textTransform: 'uppercase', letterSpacing: 0.4 },
  dayNum: { fontSize: 24, fontFamily: Typography.fontFamily.bold, lineHeight: 28 },
  shiftBadge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6, marginBottom: 5 },
  shiftBadgeText: { fontSize: 11, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.4, textTransform: 'uppercase' },
  shiftTime: { fontSize: 13.5, fontFamily: Typography.fontFamily.semiBold, color: C.text.secondary },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupName: { fontSize: 13, fontFamily: Typography.fontFamily.semiBold, color: C.text.primary, flex: 1 },
  institution: { fontSize: 11.5, fontFamily: Typography.fontFamily.regular, color: C.text.tertiary, marginTop: 2 },

  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 8, paddingHorizontal: 18 },
  primaryBtn: { flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center',
    borderWidth: 1, borderColor: C.error + '40', backgroundColor: C.error + '0F',
  },
  cancelBtnText: { color: C.error, fontSize: 14, fontFamily: Typography.fontFamily.semiBold },
});
