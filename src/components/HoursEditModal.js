import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
  Animated,
  Easing,
  Keyboard,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Typography } from '../constants/DesignSystem';

const SPRING = { damping: 22, stiffness: 320, mass: 0.8, useNativeDriver: true };

const HoursEditModal = ({ visible, onClose, onSave, shift, currentHours = {} }) => {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [startErr, setStartErr] = useState(null);
  const [endErr, setEndErr] = useState(null);
  const [focusedField, setFocusedField] = useState(null);
  const endRef = useRef(null);
  const startRef = useRef(null);

  const slideY = useRef(new Animated.Value(500)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== 'ios') return; // Android resizes the window itself — no offset needed
    const onShow = (e) => Animated.spring(keyboardOffset, { toValue: -e.endCoordinates.height, ...SPRING }).start();
    const onHide = () => Animated.spring(keyboardOffset, { toValue: 0, ...SPRING }).start();
    const sub1 = Keyboard.addListener('keyboardWillShow', onShow);
    const sub2 = Keyboard.addListener('keyboardWillHide', onHide);
    return () => { sub1.remove(); sub2.remove(); };
  }, []);

  useEffect(() => {
    if (visible) {
      setStartTime(currentHours.startTime || '');
      setEndTime(currentHours.endTime || '');
      setStartErr(null);
      setEndErr(null);
      setFocusedField(null);
      keyboardOffset.setValue(0);
      slideY.setValue(500);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, ...SPRING }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const close = () => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(slideY, { toValue: 500, duration: 240, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const fmt = (text) => {
    const n = text.replace(/\D/g, '');
    if (n.length <= 2) return n;
    return `${n.slice(0, 2)}:${n.slice(2, 4)}`;
  };

  const validateTime = (t) => {
    if (!t || t.length < 5) return null;
    const [h, m] = t.split(':').map(Number);
    if (h > 23) return 'Horas: 00–23';
    if (m > 59) return 'Minutos: 00–59';
    return null;
  };

  const calcDuration = (s, e) => {
    if (!s || !e || s.length < 5 || e.length < 5) return null;
    const [sh, sm] = s.split(':').map(Number);
    const [eh, em] = e.split(':').map(Number);
    if ([sh, sm, eh, em].some(isNaN)) return null;
    const start = sh * 60 + sm;
    let end = eh * 60 + em;
    if (end < start) end += 1440;
    return end - start;
  };

  const fmtMin = (min) => {
    if (min == null) return '—';
    const h = Math.floor(min / 60), m = min % 60;
    return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}min`;
  };

  const fmtDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
  };

  const getPredicted = () => {
    // Normalize "07h00" / "07h" → "07:00" and drop trailing "(N)"-style suffix
    const norm = (t) => t.replace(/\s*\([^)]*\)/, '').replace(/(\d+)h(\d*)/, (_, h, m) => `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`).trim();
    const parts = (shift?.time || '').split(/\s[–-]\s/);
    if (parts.length === 2) {
      return { start: norm(parts[0]), end: norm(parts[1]) };
    }
    const defaults = { M: { start: '07:00', end: '13:00' }, T: { start: '13:00', end: '19:00' }, N: { start: '19:00', end: '07:00' } };
    return defaults[shift?.label?.charAt(0)] || defaults.M;
  };

  const handleSave = () => {
    const se = validateTime(startTime);
    const ee = validateTime(endTime);
    setStartErr(se);
    setEndErr(ee);
    if (se || ee) return;
    if (startTime && endTime) {
      onSave({ startTime, endTime });
      close();
    }
  };

  const handleClear = () => {
    setStartTime('');
    setEndTime('');
    setStartErr(null);
    setEndErr(null);
    startRef.current?.focus();
  };

  const predicted = getPredicted();
  const predMin = (typeof shift?.durationMinutes === 'number' && shift.durationMinutes > 0)
    ? shift.durationMinutes
    : calcDuration(predicted.start, predicted.end);
  const realMin = calcDuration(startTime, endTime);
  const diffMin = predMin != null && realMin != null ? realMin - predMin : null;
  const canSave = startTime.length === 5 && endTime.length === 5 && !startErr && !endErr;

  const institution = shift?.group?.institution?.name || 'Plantão';
  const groupName = shift?.group?.name || '';
  const groupColor = shift?.group?.color || C.primary;
  const dateLabel = fmtDate(shift?.date);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <Animated.View style={[s.backdrop, { opacity: backdropOpacity }]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={close} />

      <Animated.View
        style={[
          s.sheet,
          { backgroundColor: C.background.primary, paddingBottom: insets.bottom || 16 },
          { transform: [{ translateY: Animated.add(slideY, keyboardOffset) }] },
        ]}
      >
        {/* Handle */}
        <View style={[s.handle, { backgroundColor: C.border.medium }]} />

        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={[s.eyebrow, { color: C.text.tertiary }]}>Registrar horas</Text>
            <Text style={[s.institution, { color: C.text.primary }]}>{institution}</Text>
            <View style={s.metaRow}>
              <View style={[s.groupDot, { backgroundColor: groupColor }]} />
              <Text style={[s.metaText, { color: C.text.secondary }]}>{groupName}</Text>
              {dateLabel ? (
                <>
                  <Text style={[s.metaDot, { color: C.text.tertiary }]}>·</Text>
                  <Text style={[s.metaDate, { color: C.text.tertiary }]}>{dateLabel}</Text>
                </>
              ) : null}
            </View>
          </View>
          <Pressable onPress={close} style={[s.closeBtn, { backgroundColor: C.background.secondary }]} hitSlop={8}>
            <Ionicons name="close" size={16} color={C.text.secondary} />
          </Pressable>
        </View>

        {/* Hairline */}
        <View style={[s.hairline, { backgroundColor: C.border.light }]} />

        {/* Reference row */}
        <View style={[s.refRow, { backgroundColor: C.background.secondary }]}>
          <View style={s.refLeft}>
            <Ionicons name="time-outline" size={14} color={C.text.tertiary} />
            <Text style={[s.refLabel, { color: C.text.secondary }]}>
              Escalado · {predMin != null ? fmtMin(predMin) : '—'}
            </Text>
          </View>
          <Text style={[s.refTime, { color: C.text.secondary }]}>
            {predicted.start} → {predicted.end}
          </Text>
        </View>

        {/* Inputs */}
        <View style={s.inputGrid}>
          <View style={{ flex: 1 }}>
            <Text style={[s.inputLabel, { color: C.text.tertiary }]}>Início real</Text>
            <View style={[
              s.inputBox,
              { backgroundColor: focusedField === 'start' ? C.accentSoft : C.background.secondary },
              { borderColor: startErr ? C.error : focusedField === 'start' ? C.primary : C.border.light },
            ]}>
              <TextInput
                ref={startRef}
                style={[s.inputText, { color: C.text.primary }]}
                value={startTime}
                onChangeText={(t) => {
                  const v = fmt(t);
                  setStartTime(v);
                  setStartErr(null);
                  if (v.length === 5) endRef.current?.focus();
                }}
                onFocus={() => setFocusedField('start')}
                onBlur={() => { setFocusedField(null); if (startTime.length > 0) setStartErr(validateTime(startTime)); }}
                keyboardType="numeric"
                placeholder={predicted.start}
                placeholderTextColor={C.text.quaternary}
                maxLength={5}
              />
            </View>
            {startErr ? <Text style={[s.errText, { color: C.error }]}>{startErr}</Text> : null}
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[s.inputLabel, { color: C.text.tertiary }]}>Fim real</Text>
            <View style={[
              s.inputBox,
              { backgroundColor: focusedField === 'end' ? C.accentSoft : C.background.secondary },
              { borderColor: endErr ? C.error : focusedField === 'end' ? C.primary : C.border.light },
            ]}>
              <TextInput
                ref={endRef}
                style={[s.inputText, { color: C.text.primary }]}
                value={endTime}
                onChangeText={(t) => { setEndTime(fmt(t)); setEndErr(null); }}
                onFocus={() => setFocusedField('end')}
                onBlur={() => { setFocusedField(null); if (endTime.length > 0) setEndErr(validateTime(endTime)); }}
                keyboardType="numeric"
                placeholder={predicted.end}
                placeholderTextColor={C.text.quaternary}
                maxLength={5}
              />
            </View>
            {endErr ? <Text style={[s.errText, { color: C.error }]}>{endErr}</Text> : null}
          </View>
        </View>

        {/* Summary card */}
        {realMin != null && (
          <View style={[s.summaryCard, { backgroundColor: C.background.primary, borderColor: C.border.light }]}>
            <View style={s.summaryRow}>
              <Text style={[s.summaryLabel, { color: C.text.secondary }]}>Total trabalhado</Text>
              <Text style={[s.summaryTotal, { color: C.text.primary }]}>{fmtMin(realMin)}</Text>
            </View>
            <View style={[s.summaryHairline, { backgroundColor: C.border.light }]} />
            <View style={s.summaryRow}>
              <Text style={[s.summaryLabel, { color: C.text.secondary }]}>Diferença</Text>
              <View style={[s.diffPill, { backgroundColor: diffMin >= 0 ? C.moneySoft : C.error + '18' }]}>
                <Text style={[s.diffPillText, { color: diffMin >= 0 ? C.money : C.error }]}>
                  {diffMin >= 0 ? '+' : ''}{fmtMin(Math.abs(diffMin ?? 0))}
                </Text>
              </View>
            </View>
            {shift?.hourlyRate != null && diffMin != null && (
              <View style={s.summaryRow}>
                <Text style={[s.summaryLabel, { color: C.text.secondary }]}>Impacto no valor</Text>
                <Text style={[s.summaryImpact, { color: C.money }]}>
                  {diffMin >= 0 ? '+ ' : '– '}R$ {Math.abs(diffMin / 60 * shift.hourlyRate).toFixed(2).replace('.', ',')}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* CTAs */}
        <View style={s.ctaRow}>
          <Pressable
            style={({ pressed }) => [s.ctaBtn, s.ctaBtnSecondary, { backgroundColor: pressed ? C.background.secondary : C.background.secondary, borderColor: C.border.light }]}
            onPress={handleClear}
          >
            <Text style={[s.ctaBtnText, { color: C.text.secondary }]}>Limpar</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.ctaBtn, s.ctaBtnPrimary, { backgroundColor: canSave ? C.money : C.border.light, flex: 2, opacity: pressed ? 0.88 : 1 }]}
            onPress={handleSave}
            disabled={!canSave}
          >
            <Ionicons name="checkmark" size={15} color={canSave ? '#fff' : C.text.tertiary} strokeWidth={2.6} />
            <Text style={[s.ctaBtnText, { color: canSave ? '#fff' : C.text.tertiary }]}>Salvar horas</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 14,
  },
  eyebrow: {
    fontSize: 11, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  institution: {
    fontSize: 22, fontWeight: '800',
    fontFamily: Typography.fontFamily.display,
    letterSpacing: -0.4, marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 6, marginTop: 3,
  },
  groupDot: {
    width: 7, height: 7, borderRadius: 4,
  },
  metaText: { fontSize: 12, fontWeight: '500' },
  metaDot: { fontSize: 12 },
  metaDate: { fontSize: 12 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },

  hairline: { height: StyleSheet.hairlineWidth },

  refRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 12,
  },
  refLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refLabel: { fontSize: 12, fontWeight: '600' },
  refTime: { fontSize: 12, fontFamily: Typography.fontFamily.semiBold },

  inputGrid: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 6,
  },
  inputLabel: {
    fontSize: 10.5, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 6,
  },
  inputBox: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  inputText: {
    fontSize: 26, fontWeight: '600',
    fontFamily: Typography.fontFamily.semiBold,
    letterSpacing: 0.4,
    textAlign: 'center',
    width: '100%',
  },
  errText: { fontSize: 10, marginTop: 4 },

  summaryCard: {
    marginHorizontal: 18,
    marginTop: 8,
    marginBottom: 0,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    paddingHorizontal: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  summaryHairline: { height: StyleSheet.hairlineWidth },
  summaryLabel: { fontSize: 12, fontWeight: '600' },
  summaryTotal: {
    fontSize: 16, fontWeight: '700',
    fontFamily: Typography.fontFamily.semiBold,
  },
  diffPill: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 8,
  },
  diffPillText: { fontSize: 11, fontWeight: '700' },
  summaryImpact: {
    fontSize: 14, fontWeight: '700',
    fontFamily: Typography.fontFamily.semiBold,
  },

  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    marginTop: 14,
  },
  ctaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
  },
  ctaBtnSecondary: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  ctaBtnPrimary: {},
  ctaBtnText: {
    fontSize: 14, fontWeight: '700',
    fontFamily: Typography.fontFamily.semiBold,
  },
});

export default HoursEditModal;
