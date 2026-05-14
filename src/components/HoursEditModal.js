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
} from 'react-native';
import { IconX, IconClock, IconArrowRight, IconCheck } from '@tabler/icons-react-native';
import { useColors, Typography, Spacing, BorderRadius } from '../constants/DesignSystem';

const SPRING = { damping: 22, stiffness: 320, mass: 0.8, useNativeDriver: true };

const HoursEditModal = ({ visible, onClose, onSave, shift, currentHours = {} }) => {
  const C = useColors();
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [startErr, setStartErr] = useState(null);
  const [endErr, setEndErr] = useState(null);
  const endRef = useRef(null);

  const slideY = useRef(new Animated.Value(400)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setStartTime(currentHours.startTime || '');
      setEndTime(currentHours.endTime || '');
      setStartErr(null);
      setEndErr(null);
      slideY.setValue(400);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, ...SPRING }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const close = () => {
    Animated.parallel([
      Animated.timing(slideY, { toValue: 400, duration: 240, easing: Easing.in(Easing.quad), useNativeDriver: true }),
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
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
  };

  const getPredicted = () => {
    const parts = (shift?.time || '').split(/\s[–-]\s/);
    if (parts.length === 2) {
      return { start: parts[0].replace(/\s*\(.*\)/, '').trim(), end: parts[1].replace(/\s*\(.*\)/, '').trim() };
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

  const predicted = getPredicted();
  const predMin = calcDuration(predicted.start, predicted.end);
  const realMin = calcDuration(startTime, endTime);
  const diffMin = predMin != null && realMin != null ? realMin - predMin : null;
  const canSave = startTime.length === 5 && endTime.length === 5 && !startErr && !endErr;

  const shiftLabel = { M: 'Manhã', T: 'Tarde', N: 'Noite' }[shift?.label?.charAt(0)] || 'Plantão';

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      {/* Backdrop */}
      <Animated.View style={[s.backdrop, { opacity: backdropOpacity }]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={close} />

      {/* Sheet */}
      <Animated.View style={[s.sheet, { backgroundColor: C.background.primary, transform: [{ translateY: slideY }] }]}>
        {/* Handle */}
        <View style={[s.handle, { backgroundColor: C.border.medium }]} />

        {/* Header */}
        <View style={s.header}>
          <View style={[s.iconBadge, { backgroundColor: C.primary + '18' }]}>
            <IconClock size={20} color={C.primary} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: C.text.primary }]}>Ajustar horas</Text>
            <Text style={[s.subtitle, { color: C.text.secondary }]}>
              {shiftLabel}{shift?.group?.name ? ` · ${shift.group.name}` : ''}
            </Text>
          </View>
          <Pressable onPress={close} style={[s.closeBtn, { backgroundColor: C.background.secondary }]} hitSlop={8}>
            <IconX size={18} color={C.text.tertiary} strokeWidth={2} />
          </Pressable>
        </View>

        {/* Predicted time pill */}
        <View style={[s.predictedPill, { backgroundColor: C.background.secondary }]}>
          <Text style={[s.predictedLabel, { color: C.text.tertiary }]}>Previsto</Text>
          <Text style={[s.predictedValue, { color: C.text.secondary }]}>
            {predicted.start} → {predicted.end}
            {predMin != null ? `  ·  ${fmtMin(predMin)}` : ''}
          </Text>
        </View>

        {/* Time inputs */}
        <View style={s.inputRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.inputLabel, { color: C.text.tertiary }]}>Entrada real</Text>
            <TextInput
              style={[s.input, { color: C.text.primary, borderColor: startErr ? C.error : startTime.length === 5 ? C.primary : C.border.light, backgroundColor: C.background.secondary }]}
              value={startTime}
              onChangeText={(t) => { setStartTime(fmt(t)); setStartErr(null); if (fmt(t).length === 5) endRef.current?.focus(); }}
              keyboardType="numeric"
              placeholder={predicted.start}
              placeholderTextColor={C.text.quaternary}
              maxLength={5}
            />
            {startErr ? <Text style={[s.errText, { color: C.error }]}>{startErr}</Text> : null}
          </View>

          <View style={[s.arrowWrap]}>
            <IconArrowRight size={18} color={C.text.quaternary} strokeWidth={2} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[s.inputLabel, { color: C.text.tertiary }]}>Saída real</Text>
            <TextInput
              ref={endRef}
              style={[s.input, { color: C.text.primary, borderColor: endErr ? C.error : endTime.length === 5 ? C.primary : C.border.light, backgroundColor: C.background.secondary }]}
              value={endTime}
              onChangeText={(t) => { setEndTime(fmt(t)); setEndErr(null); }}
              keyboardType="numeric"
              placeholder={predicted.end}
              placeholderTextColor={C.text.quaternary}
              maxLength={5}
            />
            {endErr ? <Text style={[s.errText, { color: C.error }]}>{endErr}</Text> : null}
          </View>
        </View>

        {/* Summary — only when both times valid */}
        {canSave && realMin != null && (
          <View style={[s.summary, { backgroundColor: C.background.secondary }]}>
            <SummaryItem label="Previsto" value={fmtMin(predMin)} color={C.text.primary} />
            <View style={[s.summaryDivider, { backgroundColor: C.border.light }]} />
            <SummaryItem label="Real" value={fmtMin(realMin)} color={C.text.primary} />
            <View style={[s.summaryDivider, { backgroundColor: C.border.light }]} />
            <SummaryItem
              label="Diferença"
              value={(diffMin >= 0 ? '+' : '') + fmtMin(Math.abs(diffMin))}
              color={diffMin > 0 ? C.success : diffMin < 0 ? C.warning : C.text.tertiary}
            />
          </View>
        )}

        {/* Buttons */}
        <View style={s.buttons}>
          <Pressable
            style={({ pressed }) => [s.btn, s.btnSecondary, { borderColor: C.border.light, backgroundColor: pressed ? C.background.secondary : 'transparent' }]}
            onPress={close}
          >
            <Text style={[s.btnText, { color: C.text.secondary }]}>Cancelar</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.btn, s.btnPrimary, { backgroundColor: canSave ? (pressed ? C.primaryDark : C.primary) : C.border.light }]}
            onPress={handleSave}
            disabled={!canSave}
          >
            <IconCheck size={16} color={canSave ? '#fff' : C.text.tertiary} strokeWidth={2.5} />
            <Text style={[s.btnText, { color: canSave ? '#fff' : C.text.tertiary, marginLeft: 6 }]}>Salvar</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
};

const SummaryItem = ({ label, value, color }) => {
  const C = useColors();
  return (
    <View style={s.summaryItem}>
      <Text style={[s.summaryLabel, { color: C.text.tertiary }]}>{label}</Text>
      <Text style={[s.summaryValue, { color }]}>{value}</Text>
    </View>
  );
};

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 36,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: Typography.fontSize.headline,
    fontWeight: Typography.fontWeight.semiBold,
    fontFamily: Typography.fontFamily.semiBold,
  },
  subtitle: {
    fontSize: Typography.fontSize.caption1,
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  predictedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
  },
  predictedLabel: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  predictedValue: {
    fontSize: Typography.fontSize.footnote,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    gap: 0,
    marginBottom: Spacing.md,
  },
  arrowWrap: {
    paddingTop: 34,
    paddingHorizontal: 8,
  },
  inputLabel: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: 12,
    fontSize: 22,
    fontWeight: Typography.fontWeight.semiBold,
    textAlign: 'center',
    letterSpacing: 1,
  },
  errText: {
    fontSize: Typography.fontSize.caption2,
    marginTop: 4,
  },
  summary: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
  },
  summaryLabel: {
    fontSize: Typography.fontSize.caption2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: Typography.fontSize.callout,
    fontWeight: Typography.fontWeight.semiBold,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
  },
  btnSecondary: {
    borderWidth: 1.5,
  },
  btnPrimary: {},
  btnText: {
    fontSize: Typography.fontSize.callout,
    fontWeight: Typography.fontWeight.semiBold,
    fontFamily: Typography.fontFamily.semiBold,
  },
});

export default HoursEditModal;
