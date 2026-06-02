/**
 * TrocarAbertoSheet — publish a swap auction to the group.
 *
 * Flow:
 *   1. (Optional) pick which of my upcoming shifts to offer (skipped if `shift` provided)
 *   2. Choose preferences:
 *      - labels accepted (multi-select: M / T / N)
 *      - periodScope (weekday / weekend / any)
 *   3. Confirm and publish.
 *
 * Compatibility checks are enforced at bid time by SwapAuctionsContext.submitBid.
 */

import { useState, useMemo, useContext, useEffect } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Typography, BorderRadius } from '../constants/DesignSystem';
import { AuthContext } from '../context/AuthContext';
import { useSwapAuctions } from '../contexts/SwapAuctionsContext';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';
import Logger from '../utils/Logger';

const LABEL_NAME = { M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite' };
const ALL_LABELS = ['M', 'T', 'N'];
const SCOPE_OPTIONS = [
  { key: 'any',     label: 'Qualquer dia' },
  { key: 'weekday', label: 'Apenas semana' },
  { key: 'weekend', label: 'Apenas fim de semana' },
];

const _fmtDate = (input) => {
  if (!input) return '';
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(input) ? `${input}T12:00:00` : input;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
};

const _shiftDate = (sh) => sh?.startISO || sh?.date || '';

const _monthKeysFromNow = (n = 3) => {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
};

export default function TrocarAbertoSheet({ visible, shift: initialShift, onClose, onDone }) {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);
  const { user } = useContext(AuthContext);
  const { createAuction } = useSwapAuctions();

  const needsShiftPick = !initialShift;
  const initialStep = needsShiftPick ? 0 : 1;

  const [step, setStep]                 = useState(initialStep);
  const [shift, setShift]               = useState(initialShift || null);
  const [myShifts, setMyShifts]         = useState(null);
  const [labels, setLabels]             = useState(ALL_LABELS);
  const [periodScope, setPeriodScope]   = useState('any');
  const [submitting, setSubmitting]     = useState(false);

  useEffect(() => {
    if (!needsShiftPick || !user?.id || !visible) return;
    setMyShifts(null);
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
          .sort((a, b) => (a.date || a.startISO || '').localeCompare(b.date || b.startISO || ''));
        if (!cancelled) setMyShifts(out);
      } catch (err) {
        Logger.warn(`[TrocarAbertoSheet] load own shifts: ${err?.message}`);
        if (!cancelled) setMyShifts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [needsShiftPick, user?.id, visible]);

  const reset = () => {
    setStep(initialStep);
    setShift(initialShift || null);
    setMyShifts(null);
    setLabels(ALL_LABELS);
    setPeriodScope('any');
    setSubmitting(false);
  };
  const close = () => { reset(); onClose?.(); };

  const toggleLabel = (l) => {
    if (labels.includes(l)) {
      const next = labels.filter(x => x !== l);
      if (next.length === 0) return; // ao menos 1 label exigido
      setLabels(next);
    } else {
      setLabels([...labels, l]);
    }
  };

  const handlePublish = async () => {
    if (!shift) return;
    setSubmitting(true);
    try {
      const r = await createAuction({
        shift,
        preferences: {
          labels,
          periodScope,
          groupIds: [String(shift.group?.id || '')].filter(Boolean),
        },
      });
      if (r?.success) { onDone?.(); close(); }
    } catch (err) {
      Logger.warn(`[TrocarAbertoSheet] handlePublish: ${err?.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  const totalSteps = needsShiftPick ? 3 : 2;
  const displayStep = needsShiftPick ? step + 1 : step;
  const stepTitle = step === 0 ? 'Seu plantão' : step === 1 ? 'Preferências' : 'Publicar';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={s.backdrop} onPress={close} />
      <View style={[s.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={s.handle} />
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{stepTitle}</Text>
            <Text style={s.subtitle}>Trocar aberto · Passo {displayStep} de {totalSteps}</Text>
          </View>
          <Pressable onPress={close} hitSlop={10}><Ionicons name="close" size={22} color={C.text.secondary} /></Pressable>
        </View>

        {step === 0 && (
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8 }}>
            <Text style={s.eyebrow}>Qual plantão você quer trocar?</Text>
            {myShifts === null ? (
              <ActivityIndicator color={C.primary} style={{ marginTop: 32 }} />
            ) : myShifts.length === 0 ? (
              <Text style={s.empty}>Você não tem plantões futuros para trocar.</Text>
            ) : myShifts.map(sh => {
              const sel = shift?.id === sh.id;
              return (
                <TouchableOpacity
                  key={sh.id}
                  style={[s.shiftRow, sel && { borderColor: C.primary }]}
                  onPress={() => setShift(sh)}
                >
                  <View style={[s.labelChip, { backgroundColor: (sh.group?.color || C.primary) + '22' }]}>
                    <Text style={[s.labelChipText, { color: sh.group?.color || C.primary }]}>{sh.label || 'M'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>{LABEL_NAME[sh.label] || 'Plantão'} · {_fmtDate(_shiftDate(sh))}</Text>
                    <Text style={s.rowMeta}>{sh.group?.institution?.name || sh.group?.name || ''}</Text>
                  </View>
                  {sel && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {step === 1 && (
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8 }}>
            <Text style={s.eyebrow}>O que você aceita receber?</Text>
            <View style={s.chipsRow}>
              {ALL_LABELS.map(l => {
                const sel = labels.includes(l);
                return (
                  <Pressable
                    key={l}
                    onPress={() => toggleLabel(l)}
                    style={[s.chip, sel && { backgroundColor: C.primary + '1f', borderColor: C.primary }]}
                  >
                    <Text style={[s.chipText, sel && { color: C.primary }]}>{LABEL_NAME[l]}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[s.eyebrow, { marginTop: 18 }]}>Quando?</Text>
            {SCOPE_OPTIONS.map(opt => {
              const sel = periodScope === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.optionRow, sel && { borderColor: C.primary, backgroundColor: C.primary + '0f' }]}
                  onPress={() => setPeriodScope(opt.key)}
                >
                  <Ionicons
                    name={sel ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={sel ? C.primary : C.text.tertiary}
                  />
                  <Text style={[s.rowTitle, { flex: 1 }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {step === 2 && shift && (
          <View style={{ paddingHorizontal: 18 }}>
            <Text style={s.eyebrow}>Você oferece</Text>
            <View style={s.summaryCard}>
              <View style={[s.labelChip, { backgroundColor: (shift.group?.color || C.primary) + '22' }]}>
                <Text style={[s.labelChipText, { color: shift.group?.color || C.primary }]}>{shift.label || 'M'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{LABEL_NAME[shift.label] || 'Plantão'} · {_fmtDate(_shiftDate(shift))}</Text>
                <Text style={s.rowMeta}>{shift.group?.institution?.name || shift.group?.name || ''}</Text>
              </View>
            </View>
            <Text style={[s.eyebrow, { marginTop: 14 }]}>Em troca, aceito</Text>
            <Text style={s.summaryText}>
              {labels.map(l => LABEL_NAME[l]).join(' · ')}
              {' · '}
              {SCOPE_OPTIONS.find(o => o.key === periodScope)?.label}
            </Text>
            <Text style={s.note}>
              Membros do grupo verão sua proposta e poderão oferecer um plantão deles compatível. Você escolhe um e a troca é efetivada com o aceite.
            </Text>
          </View>
        )}

        <View style={[s.ctaRow, { paddingHorizontal: 18 }]}>
          {step > initialStep ? (
            <Pressable style={s.secondaryBtn} onPress={() => setStep(step - 1)}>
              <Text style={[s.secondaryBtnText, { color: C.text.secondary }]}>Voltar</Text>
            </Pressable>
          ) : null}
          {step < 2 ? (
            <Pressable
              style={[s.primaryBtn, {
                backgroundColor: ((step === 0 && shift) || (step === 1 && labels.length > 0)) ? C.primary : C.border.medium,
                flex: step > initialStep ? 2 : 1,
              }]}
              onPress={() => {
                if (step === 0 && shift) setStep(1);
                else if (step === 1 && labels.length > 0) setStep(2);
              }}
              disabled={(step === 0 && !shift) || (step === 1 && labels.length === 0)}
            >
              <Text style={s.primaryBtnText}>Continuar</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[s.primaryBtn, { backgroundColor: C.primary, flex: 2 }]}
              onPress={handlePublish}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Publicar troca</Text>}
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C) => ({
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
  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 0.5, borderColor: C.border.light, marginBottom: 8 },
  labelChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  labelChipText: { fontSize: 12, fontWeight: '800' },
  rowTitle: { fontSize: 14, fontWeight: '600', color: C.text.primary },
  rowMeta: { fontSize: 11, color: C.text.tertiary, marginTop: 1 },
  chipsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 0.5, borderColor: C.border.light, backgroundColor: C.background.card,
  },
  chipText: { fontSize: 12, fontWeight: '700', color: C.text.secondary, letterSpacing: 0.3 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8,
    borderRadius: 12, borderWidth: 0.5, borderColor: C.border.light,
  },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: C.background.secondary, borderWidth: 0.5, borderColor: C.border.light, marginBottom: 6 },
  summaryText: { fontSize: 14, color: C.text.primary, fontWeight: '600', marginTop: 4 },
  note: { fontSize: 12, color: C.text.tertiary, marginTop: 14, lineHeight: 17 },
  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 4 },
  secondaryBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: C.background.secondary, borderWidth: 0.5, borderColor: C.border.light },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },
  primaryBtn: { paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
