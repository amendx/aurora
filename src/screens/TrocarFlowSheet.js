import { useState, useMemo, useContext, useEffect } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, TouchableOpacity,
  StyleSheet, Image, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Typography, BorderRadius } from '../constants/DesignSystem';
import { AuthContext } from '../context/AuthContext';
import { useGroups } from '../contexts/GroupsContext';
import { useOffers } from '../contexts/OffersContext';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';
import { canSwap } from '../utils/SwapEligibility';

const _initials = (n = '') => n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const _labelName = (l) => ({ M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite' }[l] || l || 'Plantão');
const _fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
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

export default function TrocarFlowSheet({ visible, shift, onClose, onDone }) {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);
  const { user } = useContext(AuthContext);
  const { groupsById, getGroupMembers } = useGroups();
  const { proposeSwap } = useOffers();

  const [step, setStep]               = useState(1);
  const [pickedColleague, setColl]    = useState(null);
  const [theirShifts, setTheirShifts] = useState(null); // null = loading, [] = none
  const [pickedShift, setPickedShift] = useState(null);
  const [submitting, setSub]          = useState(false);

  const myGroupIds = useMemo(() => Object.values(groupsById || {})
    .map(g => String(g.public_id || g.id)).filter(Boolean), [groupsById]);

  // Build a unique colleagues list across all my groups (excluding me)
  const colleagues = useMemo(() => {
    if (!user?.id) return [];
    const seen = new Map();
    Object.values(groupsById || {}).forEach(g => {
      const gid = String(g.public_id || g.id);
      getGroupMembers(gid).forEach(m => {
        const p = m.person;
        if (!p || String(p.id) === String(user.id)) return;
        if (!seen.has(p.id)) seen.set(p.id, { person: p, groupIds: new Set() });
        seen.get(p.id).groupIds.add(gid);
      });
    });
    return Array.from(seen.values())
      .map(({ person, groupIds }) => ({ person, groupIds: [...groupIds] }))
      .sort((a, b) => (a.person.name || '').localeCompare(b.person.name || '', 'pt-BR'));
  }, [user?.id, groupsById, getGroupMembers]);

  // Load target's upcoming shifts when colleague picked
  useEffect(() => {
    if (!pickedColleague) return;
    setTheirShifts(null);
    (async () => {
      const months = _monthKeysFromNow(3);
      const raw = await FirebaseAdapter.getUserShiftsForMonths(pickedColleague.person.id, months);
      const now = Date.now();
      // Filter to upcoming + passes initiator-side eligibility
      const out = raw
        .filter(sh => sh.startISO && new Date(sh.startISO).getTime() > now)
        .filter(sh => {
          const r = canSwap({
            initiatorGroups: myGroupIds,
            targetGroups: null,
            shiftA: shift,
            shiftB: sh,
          });
          return r.ok;
        })
        .sort((a, b) => a.startISO.localeCompare(b.startISO));
      setTheirShifts(out);
    })();
  }, [pickedColleague, myGroupIds, shift]);

  const reset = () => { setStep(1); setColl(null); setTheirShifts(null); setPickedShift(null); setSub(false); };
  const close = () => { reset(); onClose?.(); };

  const handleSend = async () => {
    if (!pickedShift || !pickedColleague) return;
    setSub(true);
    const eligible = canSwap({
      initiatorGroups: myGroupIds,
      targetGroups: null,
      shiftA: shift,
      shiftB: pickedShift,
    });
    const r = await proposeSwap(shift, pickedColleague.person, pickedShift, eligible.eligibleGroupIds || []);
    setSub(false);
    if (r?.success) { onDone?.(); close(); }
  };

  if (!visible || !shift) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={s.backdrop} onPress={close} />
      <View style={[s.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={s.handle} />
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{step === 1 ? 'Escolher colega' : step === 2 ? 'Escolher plantão' : 'Confirmar troca'}</Text>
            <Text style={s.subtitle}>Passo {step} de 3</Text>
          </View>
          <Pressable onPress={close} hitSlop={10}><Ionicons name="close" size={22} color={C.text.secondary} /></Pressable>
        </View>

        {step === 1 && (
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8 }}>
            {colleagues.length === 0 ? (
              <Text style={s.empty}>Nenhum colega em seus grupos.</Text>
            ) : colleagues.map(c => {
              const sel = pickedColleague?.person?.id === c.person.id;
              return (
                <TouchableOpacity
                  key={c.person.id}
                  style={[s.memberRow, sel && { backgroundColor: C.accentSoft + '60' }]}
                  onPress={() => setColl(c)}
                >
                  {c.person.photo
                    ? <Image source={{ uri: c.person.photo }} style={s.avatar} />
                    : <View style={[s.avatar, s.avatarFallback]}>
                        <Text style={s.avatarInitials}>{_initials(c.person.name)}</Text>
                      </View>
                  }
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberName} numberOfLines={1}>{c.person.name}</Text>
                    <Text style={s.memberMeta}>{c.groupIds.length} grupo{c.groupIds.length !== 1 ? 's' : ''} em comum</Text>
                  </View>
                  {sel && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {step === 2 && (
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8 }}>
            {theirShifts === null ? (
              <ActivityIndicator color={C.primary} style={{ marginTop: 32 }} />
            ) : theirShifts.length === 0 ? (
              <Text style={s.empty}>{pickedColleague?.person?.name?.split(' ')[0]} não tem plantões trocáveis em grupos compartilhados.</Text>
            ) : theirShifts.map(sh => {
              const sel = pickedShift?.id === sh.id;
              return (
                <TouchableOpacity
                  key={sh.id}
                  style={[s.shiftRow, sel && { borderColor: C.primary }]}
                  onPress={() => setPickedShift(sh)}
                >
                  <View style={[s.labelChip, { backgroundColor: (sh.group?.color || C.primary) + '22' }]}>
                    <Text style={[s.labelChipText, { color: sh.group?.color || C.primary }]}>{sh.label || 'M'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberName}>{_labelName(sh.label)} · {_fmtDate(sh.startISO)}</Text>
                    <Text style={s.memberMeta}>{sh.group?.institution?.name || sh.group?.name || ''}</Text>
                  </View>
                  {sel && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {step === 3 && (
          <View style={{ paddingHorizontal: 18 }}>
            <Text style={s.eyebrow}>Você dá</Text>
            <ShiftSummary shift={shift} C={C} s={s} />
            <View style={s.swapArrow}><Ionicons name="swap-vertical" size={20} color={C.primary} /></View>
            <Text style={s.eyebrow}>Você recebe</Text>
            <ShiftSummary shift={pickedShift} C={C} s={s} />
            <Text style={s.note}>{pickedColleague?.person?.name} será notificado(a) e poderá aceitar ou recusar.</Text>
          </View>
        )}

        <View style={[s.ctaRow, { paddingHorizontal: 18 }]}>
          {step > 1 ? (
            <Pressable style={s.secondaryBtn} onPress={() => setStep(step - 1)}>
              <Text style={[s.secondaryBtnText, { color: C.text.secondary }]}>Voltar</Text>
            </Pressable>
          ) : null}
          {step < 3 ? (
            <Pressable
              style={[s.primaryBtn, { backgroundColor: ((step === 1 && pickedColleague) || (step === 2 && pickedShift)) ? C.primary : C.border.medium, flex: step > 1 ? 2 : 1 }]}
              onPress={() => { if (step === 1 && pickedColleague) setStep(2); else if (step === 2 && pickedShift) setStep(3); }}
              disabled={(step === 1 && !pickedColleague) || (step === 2 && !pickedShift)}
            >
              <Text style={s.primaryBtnText}>Continuar</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[s.primaryBtn, { backgroundColor: C.primary, flex: 2 }]}
              onPress={handleSend}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Enviar proposta</Text>}
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ShiftSummary({ shift, C, s }) {
  if (!shift) return null;
  return (
    <View style={s.summaryCard}>
      <View style={[s.labelChip, { backgroundColor: (shift.group?.color || C.primary) + '22' }]}>
        <Text style={[s.labelChipText, { color: shift.group?.color || C.primary }]}>{shift.label || 'M'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.memberName}>{_labelName(shift.label)} · {_fmtDate(shift.startISO)}</Text>
        <Text style={s.memberMeta}>{shift.group?.institution?.name || shift.group?.name || ''}</Text>
      </View>
    </View>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 12 },
  title: { fontSize: 18, fontFamily: Typography.fontFamily.display, fontWeight: '700', color: C.text.primary },
  subtitle: { fontSize: 11, color: C.text.tertiary, marginTop: 2 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: C.text.tertiary, marginBottom: 8, marginTop: 6 },
  empty: { fontSize: 13, color: C.text.tertiary, textAlign: 'center', paddingVertical: 28 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10 },
  avatar: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.background.secondary },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary + '22' },
  avatarInitials: { fontSize: 13, fontWeight: '700', color: C.primary },
  memberName: { fontSize: 14, fontWeight: '600', color: C.text.primary },
  memberMeta: { fontSize: 11, color: C.text.tertiary, marginTop: 1 },
  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 0.5, borderColor: C.border.light, marginBottom: 8 },
  labelChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  labelChipText: { fontSize: 12, fontWeight: '800' },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: C.background.secondary, borderWidth: 0.5, borderColor: C.border.light, marginBottom: 6 },
  swapArrow: { alignItems: 'center', paddingVertical: 6 },
  note: { fontSize: 12, color: C.text.tertiary, marginTop: 14, lineHeight: 17 },
  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 4 },
  secondaryBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: C.background.secondary, borderWidth: 0.5, borderColor: C.border.light },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },
  primaryBtn: { paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
