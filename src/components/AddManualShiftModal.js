import { useState, useContext, useEffect, useMemo } from 'react';
import {
  View, Text, Modal, Pressable, TextInput, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { useShifts } from '../contexts/ShiftsContext';
import { useGroups } from '../contexts/GroupsContext';
import { useColors, Typography, Spacing, BorderRadius } from '../constants/DesignSystem';
import { getShiftValues } from '../utils/ShiftValueCalculator';
import TimeUtils from '../utils/TimeUtils';

const LABELS = ['M', 'T', 'N'];
const LABEL_NAMES = { M: 'Manhã', T: 'Tarde', N: 'Noite' };
const DEFAULT_TIMES = { M: { start: '07:00', end: '13:00' }, T: { start: '13:00', end: '19:00' }, N: { start: '19:00', end: '07:00' } };

const pad2 = n => String(n).padStart(2, '0');

const toMonthKey = (dateStr) => dateStr.slice(0, 7); // 'YYYY-MM-DD' → 'YYYY-MM'

const calcDuration = (start, end) => {
  const mins = TimeUtils.calculateDurationMinutes(start, end);
  return mins && mins > 0 ? mins : null;
};

const fmtBRL = (v) => v != null ? 'R$ ' + v.toFixed(2).replace('.', ',') : '—';

const estimateValue = (durationMinutes, label, dateStr, savedValues) => {
  if (!durationMinutes || !savedValues) return null;
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay(); // 0=Sun, 6=Sat
  const isWeekend = dow === 0 || dow === 6;
  const isNight = label === 'N';
  const period = isNight ? 'night' : 'day';
  const bucket = isWeekend ? 'weekend' : 'weekday';
  const rate = parseFloat(savedValues?.[bucket]?.[period]) || 0;
  return (durationMinutes / 60) * rate;
};

export default function AddManualShiftModal({ visible, onClose, date }) {
  const C = useColors();
  const s = makeStyles(C);
  const insets = useSafeAreaInsets();
  const { user } = useContext(AuthContext);
  const { addManualShift } = useShifts();
  const { groups } = useGroups();
  const { daysWithShifts } = useShifts();

  // Institutions known via user's groups — these carry an id so the shift can
  // route to per-hospital financial config (HospitalDetailScreen overrides).
  const institutions = useMemo(() => {
    const byId = {};
    Object.values(groups || {}).forEach(g => {
      const i = g?.institution;
      if (i?.id) byId[String(i.id)] = { id: String(i.id), name: i.name || g.name || '' };
    });
    return Object.values(byId).sort((a, b) => a.name.localeCompare(b.name));
  }, [groups]);
  // Legacy: free-text hospitals from the user profile (no id) — kept as fallback.
  const legacyHospitals = user?.hospitals || [];

  const takenLabels = useMemo(() => {
    const day = (daysWithShifts || []).find(d => d.date === date);
    return new Set((day?.shifts || []).map(s => s.label?.charAt(0)).filter(Boolean));
  }, [daysWithShifts, date]);

  const [label, setLabel] = useState('M');
  // Selected institution id (or '' for custom / no institution). Stored as id
  // so we can route the manual shift to per-hospital financial config.
  const [instId, setInstId] = useState('');
  const [customHospital, setCustomHospital] = useState('');
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('13:00');
  const [saving, setSaving] = useState(false);
  const [savedValues, setSavedValues] = useState(null);

  useEffect(() => {
    getShiftValues().then(setSavedValues).catch(() => {});
  }, []);

  useEffect(() => {
    if (visible) {
      const firstAvailable = LABELS.find(l => !takenLabels.has(l)) || 'M';
      setLabel(firstAvailable);
      setInstId(institutions[0]?.id || '');
      setCustomHospital(institutions.length === 0 ? (legacyHospitals[0] || '') : '');
      setStartTime(DEFAULT_TIMES[firstAvailable].start);
      setEndTime(DEFAULT_TIMES[firstAvailable].end);
    }
  }, [visible]);

  const onLabelSelect = (l) => {
    setLabel(l);
    setStartTime(DEFAULT_TIMES[l].start);
    setEndTime(DEFAULT_TIMES[l].end);
  };

  const selectedInst = institutions.find(i => i.id === instId) || null;
  const hospitalName = selectedInst ? selectedInst.name : customHospital.trim();
  const duration = calcDuration(startTime, endTime);
  const crossesMidnight = duration !== null && (() => {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return (eh * 60 + em) < (sh * 60 + sm);
  })();
  const estimatedValue = estimateValue(duration, label, date, savedValues);

  const isValid = hospitalName.length > 0 && duration !== null && date && !takenLabels.has(label);

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    await addManualShift({
      date,
      monthKey: toMonthKey(date),
      label,
      hospitalName,
      // Optional — if user picked a real hospital, route to its per-hospital
      // financial config; falls back to global when null.
      institution: selectedInst ? { id: selectedInst.id, name: selectedInst.name } : null,
      startTime,
      endTime,
      durationMinutes: duration,
      crossesMidnight,
    });
    setSaving(false);
    onClose();
  };

  const sheetContent = (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <ScrollView
        style={[s.sheet, { maxHeight: '90%' }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.handle} />
        <Text style={s.title}>Adicionar plantão</Text>

        {/* Shift type */}
        <Text style={s.fieldLabel}>Tipo de plantão</Text>
        <View style={s.labelRow}>
          {LABELS.map(l => {
            const taken = takenLabels.has(l);
            return (
              <Pressable
                key={l}
                style={[
                  s.labelChip,
                  label === l && { backgroundColor: C.primary, borderColor: C.primary },
                  taken && { opacity: 0.35, backgroundColor: C.background.tertiary },
                ]}
                onPress={() => !taken && onLabelSelect(l)}
                disabled={taken}
              >
                <Text style={[s.labelChipText, label === l && { color: '#fff' }]}>{LABEL_NAMES[l]}</Text>
                <Text style={{ fontSize: 9, color: taken ? C.text.tertiary : C.text.secondary, marginTop: 2 }}>{taken ? 'já adicionado' : 'disponível'}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Hospital */}
        <Text style={s.fieldLabel}>Hospital</Text>
        {institutions.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} keyboardShouldPersistTaps="handled">
            <View style={s.hospitalRow}>
              {institutions.map(i => (
                <Pressable
                  key={i.id}
                  style={[s.hospitalChip, instId === i.id && { backgroundColor: C.accentSoft, borderColor: C.primary }]}
                  onPress={() => { setInstId(i.id); setCustomHospital(''); }}
                >
                  <Text style={[s.hospitalChipText, instId === i.id && { color: C.primary }]}>{i.name}</Text>
                </Pressable>
              ))}
              <Pressable
                style={[s.hospitalChip, instId === '' && { backgroundColor: C.accentSoft, borderColor: C.primary }]}
                onPress={() => setInstId('')}
              >
                <Text style={[s.hospitalChipText, instId === '' && { color: C.primary }]}>Outro…</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
        {(instId === '' || institutions.length === 0) && (
          <TextInput
            style={s.input}
            value={customHospital}
            onChangeText={setCustomHospital}
            placeholder="Nome do hospital"
            placeholderTextColor={C.text.placeholder}
            autoCapitalize="words"
          />
        )}

        {/* Times */}
        <View style={s.timeRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.fieldLabel}>Entrada</Text>
            <TextInput
              style={s.input}
              value={startTime}
              onChangeText={setStartTime}
              placeholder="07:00"
              placeholderTextColor={C.text.placeholder}
              keyboardType="numeric"
              maxLength={5}
            />
          </View>
          <View style={s.timeSep}>
            <Ionicons name="arrow-forward" size={16} color={C.text.tertiary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.fieldLabel}>Saída</Text>
            <TextInput
              style={s.input}
              value={endTime}
              onChangeText={setEndTime}
              placeholder="13:00"
              placeholderTextColor={C.text.placeholder}
              keyboardType="numeric"
              maxLength={5}
            />
          </View>
        </View>

        {/* Summary */}
        {duration !== null && (
          <View style={[s.summary, { backgroundColor: C.background.secondary, borderColor: C.border.light }]}>
            <View style={s.summaryRow}>
              <Text style={[s.summaryLabel, { color: C.text.secondary }]}>Duração</Text>
              <Text style={[s.summaryValue, { color: C.text.primary }]}>
                {Math.floor(duration / 60)}h{duration % 60 > 0 ? ` ${duration % 60}min` : ''}
                {crossesMidnight ? ' (vira meia-noite)' : ''}
              </Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={[s.summaryLabel, { color: C.text.secondary }]}>Valor estimado</Text>
              <Text style={[s.summaryValue, { color: C.money }]}>{fmtBRL(estimatedValue)}</Text>
            </View>
          </View>
        )}

        <Pressable
          style={[s.saveBtn, { backgroundColor: C.primary }, !isValid && { opacity: 0.45 }]}
          onPress={handleSave}
          disabled={!isValid || saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.saveBtnText}>Salvar plantão</Text>
          }
        </Pressable>
      </ScrollView>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={s.overlay} behavior="padding">
          {sheetContent}
        </KeyboardAvoidingView>
      ) : (
        <View style={s.overlay}>
          {sheetContent}
        </View>
      )}
    </Modal>
  );
}

const makeStyles = (C) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: C.background.elevated,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 20 },
      android: { elevation: 16 },
    }),
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border.medium, alignSelf: 'center', marginBottom: Spacing.md },
  title: { fontSize: 18, fontFamily: Typography.fontFamily.display, fontWeight: '700', color: C.text.primary, marginBottom: Spacing.lg },

  fieldLabel: { fontSize: 11, fontFamily: Typography.fontFamily.semiBold, color: C.text.secondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },

  labelRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.lg },
  labelChip: {
    flex: 1, paddingVertical: 10, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: C.border.medium, alignItems: 'center',
    backgroundColor: C.background.secondary,
  },
  labelChipText: { fontSize: 14, fontFamily: Typography.fontFamily.semiBold, color: C.text.primary },

  hospitalRow: { flexDirection: 'row', gap: 8, paddingBottom: 2 },
  hospitalChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.pill,
    borderWidth: 1, borderColor: C.border.light, backgroundColor: C.background.secondary,
  },
  hospitalChipText: { fontSize: 13, fontFamily: Typography.fontFamily.semiBold, color: C.text.secondary },

  input: {
    borderWidth: 1, borderColor: C.border.light, borderRadius: BorderRadius.sm,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    fontFamily: Typography.fontFamily.regular, color: C.text.primary,
    backgroundColor: C.background.secondary, marginBottom: Spacing.lg,
  },

  timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  timeSep: { paddingBottom: 22, alignItems: 'center', justifyContent: 'center', width: 24 },

  summary: {
    borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.md,
    marginBottom: Spacing.lg, gap: 8,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 13, fontFamily: Typography.fontFamily.regular },
  summaryValue: { fontSize: 14, fontFamily: Typography.fontFamily.bold },

  saveBtn: {
    height: 50, borderRadius: BorderRadius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#fff', fontWeight: '700' },
});
