import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Animated,
  StyleSheet,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useShifts } from '../contexts/ShiftsContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, Typography, Spacing, BorderRadius, Shadows } from '../constants/DesignSystem';
import { calculateShiftValueWithBreakdown, computeShiftValue, getFullShiftConfig } from '../utils/ShiftValueCalculator';
import { formatMoney } from '../utils/MoneyFormatter';
import TimeUtils from '../utils/TimeUtils';

const MONTH_NAMES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const BAR_MAX_H = 160;

// ── Bar ───────────────────────────────────────────────────────────────────────
const Bar = ({ ratio, label, value, color, index }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.spring(anim, { toValue: 1, damping: 18, stiffness: 220, useNativeDriver: false }).start();
    }, index * 60);
    return () => clearTimeout(t);
  }, [ratio]);

  const barH = anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(4, ratio * BAR_MAX_H)] });
  const valueOpacity = anim.interpolate({ inputRange: [0.6, 1], outputRange: [0, 1] });

  return (
    <View style={ch.barCol}>
      <Animated.Text style={[ch.barValue, { opacity: valueOpacity, color }]}>
        {value > 0 ? formatMoney(value).replace('R$ ', '') : '—'}
      </Animated.Text>
      <View style={ch.barTrack}>
        <Animated.View style={[ch.barFill, { height: barH, backgroundColor: color }]} />
      </View>
      <Text style={ch.barLabel}>{label}</Text>
    </View>
  );
};

// ── SkeletonBar ───────────────────────────────────────────────────────────────
const SkeletonBar = ({ index }) => {
  const C = useColors();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.18] });
  const h = 40 + (index % 3) * 30;
  return (
    <View style={ch.barCol}>
      <View style={{ height: 12, marginBottom: 4 }} />
      <View style={ch.barTrack}>
        <Animated.View style={{ height: h, backgroundColor: '#90a4ae', borderRadius: 6, opacity }} />
      </View>
      <Animated.View style={{ width: 20, height: 10, backgroundColor: '#90a4ae', borderRadius: 4, opacity, marginTop: 6, alignSelf: 'center' }} />
    </View>
  );
};

// ── ChartsScreen ──────────────────────────────────────────────────────────────
export default function ChartsScreen() {
  const { loadMonthlyShifts, getMonthCache } = useShifts();
  const C = useColors();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState(6);
  const [monthlyData, setMonthlyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const loadKey = useRef(0);

  const buildMonthList = (n) => {
    const now = new Date();
    const list = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      list.push({ month: d.getMonth() + 1, year: d.getFullYear() });
    }
    return list;
  };

  const loadData = useCallback(async (n) => {
    const key = ++loadKey.current;
    setLoading(true);
    setMonthlyData([]);
    try {
      const months = buildMonthList(n);
      const results = [];
      for (const { month, year } of months) {
        if (loadKey.current !== key) return;
        await loadMonthlyShifts(month, year);
        const cached = getMonthCache(month, year);
        const days = cached?.daysWithShifts || [];
        let totalValue = 0;
        let totalHours = 0;
        let count = 0;
        for (const dayData of days) {
          const dateStr = dayData.date;
          let realHoursMap = {};
          try {
            const saved = await SecureStore.getItemAsync(`real_hours_${dateStr}`);
            if (saved) realHoursMap = JSON.parse(saved);
          } catch (_) {}
          for (let i = 0; i < (dayData.shifts || []).length; i++) {
            const shift = dayData.shifts[i];
            const plannedMinutes = shift.splitHours
              ? TimeUtils.decimalHoursToMinutes(shift.splitHours.hoursThisMonth)
              : TimeUtils.getShiftStandardMinutes(shift.label);
            let extraMinutes = 0;
            const rh = realHoursMap[i];
            if (rh?.startTime && rh?.endTime) {
              const rm = TimeUtils.calculateDurationMinutes(rh.startTime, rh.endTime);
              if (rm !== null) extraMinutes = rm - plannedMinutes;
            }
            const totalMinutes = plannedMinutes + extraMinutes;
            let value = 0;
            try {
              const bd = await calculateShiftValueWithBreakdown(shift, dateStr, 0);
              value = computeShiftValue(bd, totalMinutes);
            } catch (_) {}
            totalValue += value;
            totalHours += totalMinutes / 60;
            count++;
          }
        }
        results.push({ label: MONTH_NAMES_SHORT[month - 1], year, month, value: totalValue, hours: totalHours, count });
        if (loadKey.current === key) setMonthlyData([...results]);
      }
    } catch (e) {
      console.warn('ChartsScreen load error:', e);
    } finally {
      if (loadKey.current === key) setLoading(false);
    }
  }, [loadMonthlyShifts, getMonthCache]);

  useEffect(() => { loadData(period); }, [period]);

  const maxValue = Math.max(...monthlyData.map(d => d.value), 1);
  const totalValue = monthlyData.reduce((s, d) => s + d.value, 0);
  const totalHours = monthlyData.reduce((s, d) => s + d.hours, 0);
  const totalShifts = monthlyData.reduce((s, d) => s + d.count, 0);

  const formatH = (h) => {
    const m = Math.round(h * 60);
    const hh = Math.floor(m / 60), mm = m % 60;
    return mm === 0 ? `${hh}h` : `${hh}h${String(mm).padStart(2,'0')}`;
  };

  return (
    <ScrollView style={[ch.root, { backgroundColor: C.background.secondary }]} contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }} showsVerticalScrollIndicator={false}>
      <View style={ch.content}>

        {/* Period selector */}
        <View style={ch.periodRow}>
          {[3, 6, 12].map(p => (
            <Pressable
              key={p}
              style={[ch.periodChip, { backgroundColor: period === p ? C.primary : C.background.primary }]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[ch.periodChipText, { color: period === p ? '#fff' : C.text.secondary }]}>
                {p} meses
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Summary card */}
        <View style={[ch.summaryCard, { backgroundColor: C.background.primary, ...Shadows.small }]}>
          <View style={ch.summaryItem}>
            <Text style={[ch.summaryValue, { color: C.primary, fontFamily: Typography.fontFamily.display }]}>
              {loading && monthlyData.length === 0 ? '—' : formatMoney(totalValue)}
            </Text>
            <Text style={[ch.summaryLabel, { color: C.text.tertiary }]}>TOTAL NO PERÍODO</Text>
          </View>
          <View style={[ch.summaryDivider, { backgroundColor: C.border.light }]} />
          <View style={ch.summaryItem}>
            <Text style={[ch.summaryValue, { color: C.text.primary, fontFamily: Typography.fontFamily.display }]}>
              {loading && monthlyData.length === 0 ? '—' : `${totalShifts}`}
            </Text>
            <Text style={[ch.summaryLabel, { color: C.text.tertiary }]}>PLANTÕES</Text>
          </View>
          <View style={[ch.summaryDivider, { backgroundColor: C.border.light }]} />
          <View style={ch.summaryItem}>
            <Text style={[ch.summaryValue, { color: C.text.primary, fontFamily: Typography.fontFamily.display }]}>
              {loading && monthlyData.length === 0 ? '—' : formatH(totalHours)}
            </Text>
            <Text style={[ch.summaryLabel, { color: C.text.tertiary }]}>HORAS</Text>
          </View>
        </View>

        {/* Bar chart card */}
        <View style={[ch.chartCard, { backgroundColor: C.background.primary, ...Shadows.small }]}>
          <Text style={[ch.chartTitle, { color: C.text.primary }]}>Estimado por mês</Text>
          <Text style={[ch.chartSubtitle, { color: C.text.tertiary }]}>Valor estimado de plantões</Text>

          {/* Chart area */}
          <View style={ch.chartArea}>
            {/* Y-axis reference lines */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {[0.25, 0.5, 0.75, 1].map((r, i) => (
                <View key={i} style={[ch.yLine, { bottom: r * BAR_MAX_H + 12, backgroundColor: C.border.light }]} />
              ))}
            </View>

            {/* Bars */}
            <View style={ch.barsRow}>
              {loading && monthlyData.length === 0
                ? buildMonthList(period).map((_, i) => <SkeletonBar key={i} index={i} />)
                : monthlyData.map((item, i) => (
                    <Bar
                      key={`${item.year}-${item.month}`}
                      ratio={maxValue > 0 ? item.value / maxValue : 0}
                      label={item.label}
                      value={item.value}
                      color={i === monthlyData.length - 1 ? C.primary : C.primary + 'AA'}
                      index={i}
                    />
                  ))
              }
            </View>
          </View>
        </View>

        {/* Monthly breakdown */}
        {!loading && monthlyData.length > 0 && (
          <View style={[ch.breakdownCard, { backgroundColor: C.background.primary, ...Shadows.small }]}>
            <Text style={[ch.chartTitle, { color: C.text.primary, marginBottom: Spacing.md }]}>Detalhamento</Text>
            {[...monthlyData].reverse().map((item, i) => (
              <View key={`${item.year}-${item.month}`}>
                {i > 0 && <View style={[ch.rowDivider, { backgroundColor: C.border.light }]} />}
                <View style={ch.breakdownRow}>
                  <Text style={[ch.breakdownMonth, { color: C.text.secondary }]}>
                    {item.label} {item.year}
                  </Text>
                  <View style={ch.breakdownRight}>
                    <Text style={[ch.breakdownHours, { color: C.text.tertiary }]}>
                      {item.count} plantão{item.count !== 1 ? 'ões' : ''} · {formatH(item.hours)}
                    </Text>
                    <Text style={[ch.breakdownValue, { color: item.value > 0 ? C.text.primary : C.text.tertiary }]}>
                      {item.value > 0 ? formatMoney(item.value) : '—'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Empty state */}
        {!loading && monthlyData.every(d => d.count === 0) && (
          <View style={ch.empty}>
            <Text style={[ch.emptyTitle, { color: C.text.primary }]}>Sem dados no período</Text>
            <Text style={[ch.emptySubtitle, { color: C.text.secondary }]}>
              Nenhum plantão registrado nos últimos {period} meses
            </Text>
          </View>
        )}

      </View>
    </ScrollView>
  );
}

const ch = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.md },

  periodRow: { flexDirection: 'row', gap: Spacing.sm },
  periodChip: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: BorderRadius.pill,
  },
  periodChipText: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.semiBold,
  },

  summaryCard: {
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    paddingVertical: Spacing.lg,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: StyleSheet.hairlineWidth },
  summaryValue: { fontSize: Typography.fontSize.title2, fontWeight: Typography.fontWeight.bold, marginBottom: 4 },
  summaryLabel: {
    fontSize: Typography.fontSize.caption2,
    fontWeight: Typography.fontWeight.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  chartCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    paddingTop: Spacing.lg,
  },
  chartTitle: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.semiBold,
    fontFamily: Typography.fontFamily.semiBold,
    marginBottom: 2,
  },
  chartSubtitle: {
    fontSize: Typography.fontSize.caption1,
    marginBottom: Spacing.lg,
  },
  chartArea: {
    height: BAR_MAX_H + 48,
    justifyContent: 'flex-end',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: BAR_MAX_H + 36,
    position: 'relative',
    zIndex: 1,
  },
  yLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },

  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barValue: {
    fontSize: 9,
    fontWeight: Typography.fontWeight.semiBold,
    marginBottom: 3,
    textAlign: 'center',
  },
  barTrack: {
    width: '60%',
    height: BAR_MAX_H,
    justifyContent: 'flex-end',
  },
  barFill: { borderRadius: 5, minHeight: 4 },
  barLabel: {
    fontSize: Typography.fontSize.caption2,
    color: '#8E8E93',
    marginTop: 5,
    textAlign: 'center',
  },

  breakdownCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    paddingTop: Spacing.lg,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  breakdownMonth: {
    fontSize: Typography.fontSize.callout,
    fontWeight: Typography.fontWeight.medium,
    width: 72,
  },
  breakdownRight: { flex: 1, alignItems: 'flex-end' },
  breakdownHours: { fontSize: Typography.fontSize.caption1 },
  breakdownValue: { fontSize: Typography.fontSize.callout, fontWeight: Typography.fontWeight.bold, marginTop: 1 },
  rowDivider: { height: StyleSheet.hairlineWidth },

  empty: { alignItems: 'center', paddingVertical: 48, gap: Spacing.sm },
  emptyTitle: { fontSize: Typography.fontSize.body, fontWeight: Typography.fontWeight.semiBold },
  emptySubtitle: { fontSize: Typography.fontSize.subhead, textAlign: 'center' },
});
