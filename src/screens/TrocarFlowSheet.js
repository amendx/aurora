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
import Logger from '../utils/Logger';

const _initials = (n = '') => n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const _labelName = (l) => ({ M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite' }[l] || l || 'Plantão');

// Cores por tipo de turno — alinhadas com CalendarScreen / GroupDayTeamScreen.
const SHIFT_TYPE_COLOR = { M: '#3FA9A7', T: '#97CAFC', N: '#5B6FBF', D: '#5B6FBF' };
const _shiftColor = (label, fallback) => {
  const k = String(label || '').charAt(0).toUpperCase();
  return SHIFT_TYPE_COLOR[k] || fallback;
};
const _fmtDate = (input) => {
  if (!input) return '';
  // Accept either an ISO timestamp or a plain YYYY-MM-DD date.
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(input) ? `${input}T12:00:00` : input;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
};

const _shiftDate = (sh) => sh?.startISO || sh?.date || '';

const _withTimeout = (promise, ms = 8000, fallback = []) => {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
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

export default function TrocarFlowSheet({ visible, shift: initialShift, presetTargetUserId, presetTargetShiftId, onClose, onDone }) {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);
  const { user } = useContext(AuthContext);
  const { groupsById, getGroupMembers } = useGroups();
  const { proposeSwap } = useOffers();

  // When the user opens Trocar from a colleague's row in GroupDayTeam we don't
  // know which of their own shifts to offer yet — step 0 picks it.
  const needsOwnShiftStep = !initialShift;
  const initialStep = needsOwnShiftStep ? 0 : 1;

  const [step, setStep]               = useState(initialStep);
  const [shift, setShift]             = useState(initialShift || null); // the user's own shift to offer
  const [myShifts, setMyShifts]       = useState(null); // null = loading
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

  // Load user's own upcoming shifts when needed (step 0 / opened without a preselected shift)
  useEffect(() => {
    if (!needsOwnShiftStep || !user?.id || !visible) return;
    setMyShifts(null);
    let cancelled = false;
    (async () => {
      try {
        const months = _monthKeysFromNow(3);
        Logger.info(`[TrocarFlowSheet] step0 → loading own shifts for uid=${user.id} months=${months.join(',')}`);
        const t0 = Date.now();
        const raw = await _withTimeout(
          FirebaseAdapter.getUserShiftsForMonths(user.id, months),
          8000,
          []
        );
        Logger.info(`[TrocarFlowSheet] step0 ← raw=${(raw || []).length} shifts in ${Date.now() - t0}ms`);
        const todayStr = new Date().toISOString().slice(0, 10);
        const out = (raw || [])
          .filter(sh => {
            const date = sh.date || (sh.startISO || '').slice(0, 10);
            return date && date >= todayStr;
          })
          .sort((a, b) => (a.date || a.startISO || '').localeCompare(b.date || b.startISO || ''));
        Logger.info(`[TrocarFlowSheet] step0 → filtered to ${out.length} future shifts`);
        if (!cancelled) setMyShifts(out);
      } catch (err) {
        Logger.warn(`[TrocarFlowSheet] load own shifts FAILED: ${err?.message}`);
        if (!cancelled) setMyShifts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [needsOwnShiftStep, user?.id, visible]);

  // Apply presetTargetUserId once colleagues list is populated
  useEffect(() => {
    if (!presetTargetUserId || pickedColleague || colleagues.length === 0) return;
    const match = colleagues.find(c => String(c.person.id) === String(presetTargetUserId));
    Logger.info(`[TrocarFlowSheet] preset target uid=${presetTargetUserId} → ${match ? 'MATCH ' + match.person.name : 'NOT FOUND in ' + colleagues.length + ' colleagues'}`);
    if (match) {
      setColl(match);
      if (shift) setStep(2);
    }
  }, [presetTargetUserId, colleagues, pickedColleague, shift]);

  // Load target's upcoming shifts when colleague picked
  useEffect(() => {
    if (!pickedColleague || !shift) return;
    setTheirShifts(null);
    let cancelled = false;
    (async () => {
      try {
        const months = _monthKeysFromNow(3);
        Logger.info(`[TrocarFlowSheet] step2 → loading target shifts uid=${pickedColleague.person.id} months=${months.join(',')}`);
        const t0 = Date.now();
        const raw = await _withTimeout(
          FirebaseAdapter.getUserShiftsForMonths(pickedColleague.person.id, months),
          8000,
          []
        );
        Logger.info(`[TrocarFlowSheet] step2 ← raw=${(raw || []).length} shifts in ${Date.now() - t0}ms`);
        const todayStr = new Date().toISOString().slice(0, 10);
        // Dedup por (date + label) — defensivo contra histórico de seeds antigos
        // ou snapshots sobrepostos no Firestore (mesmo dia/turno, ids diferentes).
        // Mantém o mais recente por _updatedAt; sem timestamp, mantém o primeiro.
        const _seen = new Map();
        const deduped = [];
        for (const sh of (raw || [])) {
          const date = sh.date || (sh.startISO || '').slice(0, 10);
          const key = `${date}_${sh.label || ''}_${sh.group?.id || ''}`;
          const prev = _seen.get(key);
          if (!prev) {
            _seen.set(key, sh);
            deduped.push(sh);
            continue;
          }
          const prevTs = prev._updatedAt ? Date.parse(prev._updatedAt) : 0;
          const curTs  = sh._updatedAt   ? Date.parse(sh._updatedAt)   : 0;
          if (curTs > prevTs) {
            const idx = deduped.indexOf(prev);
            if (idx >= 0) deduped[idx] = sh;
            _seen.set(key, sh);
          }
        }
        // Filter to upcoming + passes initiator-side eligibility
        const out = deduped
          .filter(sh => {
            const date = sh.date || (sh.startISO || '').slice(0, 10);
            return date && date >= todayStr;
          })
          .filter(sh => {
            try {
              const r = canSwap({
                initiatorGroups: myGroupIds,
                targetGroups: null,
                shiftA: shift,
                shiftB: sh,
              });
              return r.ok;
            } catch {
              return false;
            }
          })
          .sort((a, b) => (a.date || a.startISO || '').localeCompare(b.date || b.startISO || ''));
        Logger.info(`[TrocarFlowSheet] step2 → filtered to ${out.length} eligible target shifts`);
        if (!cancelled) {
          if (presetTargetShiftId) {
            // Hard-lock to the shift the user tapped on in the calendar.
            // The trocar flow was opened from a specific shift — não faz sentido
            // permitir mudar pra outro dia. Mostra só esse na lista.
            const match = out.find(sh => String(sh.id) === String(presetTargetShiftId));
            if (match) {
              Logger.info(`[TrocarFlowSheet] step2 → locked to preset shift ${presetTargetShiftId}`);
              setTheirShifts([match]);
              setPickedShift(match);
            } else {
              Logger.info(`[TrocarFlowSheet] step2 → preset shift ${presetTargetShiftId} NOT in eligible list, falling back to full list`);
              setTheirShifts(out);
            }
          } else {
            setTheirShifts(out);
          }
        }
      } catch (err) {
        Logger.warn(`[TrocarFlowSheet] load target shifts FAILED: ${err?.message}`);
        if (!cancelled) setTheirShifts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [pickedColleague, myGroupIds, shift]);

  const reset = () => {
    setStep(initialStep);
    setShift(initialShift || null);
    setMyShifts(null);
    setColl(null);
    setTheirShifts(null);
    setPickedShift(null);
    setSub(false);
  };
  const close = () => { reset(); onClose?.(); };

  const handleSend = async () => {
    if (!pickedShift || !pickedColleague) return;
    Logger.info(`[TrocarFlowSheet] handleSend → ${shift?.id} (mine) ⇄ ${pickedShift.id} (theirs, uid=${pickedColleague.person.id})`);
    setSub(true);
    try {
      const eligible = canSwap({
        initiatorGroups: myGroupIds,
        targetGroups: null,
        shiftA: shift,
        shiftB: pickedShift,
      });
      Logger.info(`[TrocarFlowSheet] eligible=${eligible.ok} reason=${eligible.reason || '-'} groups=${(eligible.eligibleGroupIds || []).join(',')}`);
      const r = await _withTimeout(
        proposeSwap(shift, pickedColleague.person, pickedShift, eligible.eligibleGroupIds || []),
        10000,
        { success: false, reason: 'timeout' }
      );
      Logger.info(`[TrocarFlowSheet] proposeSwap result: success=${r?.success} reason=${r?.reason || '-'} id=${r?.swapId || '-'}`);
      if (r?.success) { onDone?.(); close(); }
    } catch (err) {
      Logger.warn(`[TrocarFlowSheet] handleSend FAILED: ${err?.message}`);
    } finally {
      setSub(false);
    }
  };

  if (!visible) return null;

  const totalSteps = needsOwnShiftStep ? 4 : 3;
  const displayStep = needsOwnShiftStep ? step + 1 : step;
  const stepTitle = (() => {
    if (step === 0) return 'Seu plantão';
    if (step === 1) return 'Escolher colega';
    if (step === 2) return 'Plantão do colega';
    return 'Confirmar troca';
  })();

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={s.backdrop} onPress={close} />
      <View style={[s.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={s.handle} />
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{stepTitle}</Text>
            <Text style={s.subtitle}>Passo {displayStep} de {totalSteps}</Text>
          </View>
          <Pressable onPress={close} hitSlop={10}><Ionicons name="close" size={22} color={C.text.secondary} /></Pressable>
        </View>

        {/* Plantão travado — identifica qual plantão entra na troca, sem repetir
            o verbo "oferece" que aparece no step 3 confirmação ("Você dá"). */}
        {!needsOwnShiftStep && shift && step < 3 && (
          <View style={{ paddingHorizontal: 18, paddingBottom: 8 }}>
            <Text style={s.eyebrow}>Seu plantão</Text>
            <View style={s.summaryCard}>
              <View style={[s.labelChip, { backgroundColor: _shiftColor(shift.label, C.primary) + '22' }]}>
                <Text style={[s.labelChipText, { color: _shiftColor(shift.label, C.primary) }]}>{shift.label || 'M'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.memberName}>{_labelName(shift.label)} · {_fmtDate(_shiftDate(shift))}</Text>
                <Text style={s.memberMeta}>{shift.group?.name || shift.group?.institution?.name || ''}</Text>
              </View>
              <Ionicons name="lock-closed" size={14} color={C.text.tertiary} />
            </View>
          </View>
        )}

        {step === 0 && (
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8 }}>
            {myShifts === null ? (
              <ActivityIndicator color={C.primary} style={{ marginTop: 32 }} />
            ) : myShifts.length === 0 ? (
              <Text style={s.empty}>Você não tem plantões futuros para oferecer.</Text>
            ) : myShifts.map(sh => {
              const sel = shift?.id === sh.id;
              return (
                <TouchableOpacity
                  key={sh.id}
                  style={[s.shiftRow, sel && { borderColor: C.primary }]}
                  onPress={() => setShift(sh)}
                >
                  <View style={[s.labelChip, { backgroundColor: _shiftColor(sh.label, C.primary) + '22' }]}>
                    <Text style={[s.labelChipText, { color: _shiftColor(sh.label, C.primary) }]}>{sh.label || 'M'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberName}>{_labelName(sh.label)} · {_fmtDate(_shiftDate(sh))}</Text>
                    <Text style={s.memberMeta}>{sh.group?.name || sh.group?.institution?.name || ''}</Text>
                  </View>
                  {sel && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

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
            {presetTargetShiftId && pickedShift && (
              <Text style={[s.subtitle, { marginBottom: 8, marginTop: 0 }]}>
                Você está trocando por este plantão específico. Para trocar por outro dia, cancele e selecione outro no calendário.
              </Text>
            )}
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
                  <View style={[s.labelChip, { backgroundColor: _shiftColor(sh.label, C.primary) + '22' }]}>
                    <Text style={[s.labelChipText, { color: _shiftColor(sh.label, C.primary) }]}>{sh.label || 'M'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberName}>{_labelName(sh.label)} · {_fmtDate(_shiftDate(sh))}</Text>
                    <Text style={s.memberMeta}>{sh.group?.name || sh.group?.institution?.name || ''}</Text>
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
          {step > initialStep ? (
            <Pressable style={s.secondaryBtn} onPress={() => setStep(step - 1)}>
              <Text style={[s.secondaryBtnText, { color: C.text.secondary }]}>Voltar</Text>
            </Pressable>
          ) : null}
          {step < 3 ? (
            <Pressable
              style={[s.primaryBtn, {
                backgroundColor:
                  ((step === 0 && shift) || (step === 1 && pickedColleague) || (step === 2 && pickedShift))
                    ? C.primary : C.border.medium,
                flex: step > initialStep ? 2 : 1,
              }]}
              onPress={() => {
                if (step === 0 && shift) setStep(1);
                else if (step === 1 && pickedColleague) setStep(2);
                else if (step === 2 && pickedShift) setStep(3);
              }}
              disabled={(step === 0 && !shift) || (step === 1 && !pickedColleague) || (step === 2 && !pickedShift)}
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
  const tColor = _shiftColor(shift.label, C.primary);
  return (
    <View style={s.summaryCard}>
      <View style={[s.labelChip, { backgroundColor: tColor + '22' }]}>
        <Text style={[s.labelChipText, { color: tColor }]}>{shift.label || 'M'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.memberName}>{_labelName(shift.label)} · {_fmtDate(_shiftDate(shift))}</Text>
        <Text style={s.memberMeta}>{shift.group?.name || shift.group?.institution?.name || ''}</Text>
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
