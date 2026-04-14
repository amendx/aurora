import React, { useState, useEffect, useRef, useContext, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Share,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useShifts } from '../contexts/ShiftsContext';
import { Colors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';
import { calculateShiftValueWithBreakdown, getShiftHours } from '../utils/ShiftValueCalculator';
import { formatMoney, formatMoneyCompact } from '../utils/MoneyFormatter';

// ── Skeleton ──────────────────────────────────────────────────────────────────
const SkeletonBox = ({ width = '100%', height = 20, style }) => {
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
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.2] });
  return (
    <Animated.View
      style={[{ width, height, backgroundColor: '#90a4ae', borderRadius: 6, opacity }, style]}
    />
  );
};
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const LABEL_MAP = { M: 'Manhã', T: 'Tarde', N: 'Noite' };

const LABEL_COLORS = {
  M: Colors.success,
  T: Colors.primary,
  N: Colors.warning,
};

const fmt2 = (n) => String(n).padStart(2, '0');

const formatHours = (h) => {
  if (!h && h !== 0) return '—';
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins > 0 ? `${whole}h${fmt2(mins)}` : `${whole}h`;
};

// Nova função para formatar horas com extras integradas
const formatHoursWithExtras = (plannedHours, extraHours) => {
  if (extraHours === 0) {
    return formatHours(plannedHours);
  }
  
  // Converter para minutos para melhor precisão
  const plannedMin = Math.round(plannedHours * 60);
  const extraMin = Math.round(extraHours * 60);
  const totalMin = plannedMin + extraMin;
  
  // Converter de volta para horas e minutos
  const totalHours = Math.floor(totalMin / 60);
  const remainingMin = totalMin % 60;
  
  if (remainingMin === 0) {
    return `${totalHours}h`;
  } else {
    return `${totalHours}:${fmt2(remainingMin)}h`;
  }
};

export default function ReportsScreen() {
  const { daysWithShifts, loading, loadMonthlyShifts } = useShifts();
  const [viewDate, setViewDate] = useState(new Date());
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({ hours: 0, value: 0 });
  const [computing, setComputing] = useState(false);

  // Refs for debouncing month navigation
  const navigationTimeoutRef = useRef(null);
  const isNavigatingRef = useRef(false);
  const pendingDateRef = useRef(null);

  const month = viewDate.getMonth() + 1;
  const year = viewDate.getFullYear();

  // Debounced navigation - only load data after user stops clicking
  const navigateToMonth = useCallback((targetDate) => {
    // Clear any existing timeout
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
    }
    
    // Update the UI immediately (optimistic update)
    setViewDate(targetDate);
    
    // Store the pending date for loading
    pendingDateRef.current = targetDate;
    isNavigatingRef.current = true;
    
    // Wait 500ms after the last click before loading data
    navigationTimeoutRef.current = setTimeout(() => {
      const month = pendingDateRef.current.getMonth() + 1;
      const year = pendingDateRef.current.getFullYear();
      
      console.log(`📊 ReportsScreen: Loading data for ${month}/${year} (after navigation settled)`);
      loadMonthlyShifts(month, year);
      
      isNavigatingRef.current = false;
      pendingDateRef.current = null;
    }, 500);
  }, [loadMonthlyShifts]);

  // Load data immediately on mount, then rely on navigateToMonth for subsequent changes
  useEffect(() => {
    // Only load on initial mount
    if (!isNavigatingRef.current) {
      console.log(`📊 ReportsScreen: Initial load for ${month}/${year}`);
      loadMonthlyShifts(month, year);
    }
    
    // Cleanup function to clear timeout on unmount
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []); // Only run on mount

  // Recompute rows whenever daysWithShifts changes (after new data arrives)
  useEffect(() => {
    if (!daysWithShifts || daysWithShifts.length === 0) {
      setRows([]);
      setTotals({ hours: 0, value: 0 });
      return;
    }
    buildRows();
  }, [daysWithShifts]);

  const buildRows = async () => {
    setComputing(true);
    try {
      const built = [];
      let totalHours = 0;
      let totalValue = 0;

      for (const dayData of daysWithShifts) {
        const dateStr = dayData.date; // YYYY-MM-DD
        const dateKey = dateStr;

        // Load registered real hours for this day (extra hours)
        let realHoursMap = {};
        try {
          const saved = await SecureStore.getItemAsync(`real_hours_${dateKey}`);
          if (saved) realHoursMap = JSON.parse(saved);
        } catch (_) {}

        for (let i = 0; i < (dayData.shifts || []).length; i++) {
          const shift = dayData.shifts[i];
          const label = shift.label?.charAt(0) || 'M';

          // Hours: use split if present, else standard
          const plannedHours = shift.splitHours
            ? shift.splitHours.hoursThisMonth
            : getShiftHours(shift.label);

          // Extra hours
          let extraHours = 0;
          const rh = realHoursMap[i];
          if (rh?.startTime && rh?.endTime) {
            const plannedMin = plannedHours * 60;
            const realMin = calcDurationMin(rh.startTime, rh.endTime);
            if (realMin !== null) extraHours = (realMin - plannedMin) / 60;
          }

          const effectiveHours = plannedHours + extraHours;

          // Value: use breakdown, apply split ratio if needed
          let value = 0;
          try {
            const bd = await calculateShiftValueWithBreakdown(shift, dateStr, 0);
            value = bd.finalValue || 0;
            // Scale value proportionally for split shifts
            if (shift.splitHours) {
              const fullHours = getShiftHours(shift.label);
              value = fullHours > 0 ? value * (shift.splitHours.hoursThisMonth / fullHours) : value;
            }
            // Add extra hours value using the same hourly rate and bonuses
            if (extraHours !== 0) {
              const bonusMult = 1
                + (bd.loyaltyPercentage || 0) / 100
                + (bd.generalBonusPercentage || 0) / 100;
              value += extraHours * (bd.hourlyValue || 0) * bonusMult;
            }
          } catch (_) {}

          totalHours += effectiveHours;
          totalValue += value;

          built.push({
            dateStr,
            day: dayData.day,
            label,
            shift,
            plannedHours,
            extraHours,
            effectiveHours,
            value,
            isSplit: !!shift.splitHours,
          });
        }
      }

      setRows(built);
      setTotals({ hours: totalHours, value: totalValue });
    } finally {
      setComputing(false);
    }
  };

  const calcDurationMin = (start, end) => {
    try {
      const norm = (t) => t.replace('h', ':');
      const [sh, sm] = norm(start).split(':').map(Number);
      const [eh, em] = norm(end).split(':').map(Number);
      if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null;
      let s = sh * 60 + sm;
      let e = eh * 60 + em;
      if (e < s) e += 24 * 60;
      return e - s;
    } catch (_) { return null; }
  };

  const goToPrev = useCallback(() => {
    const d = new Date(viewDate);
    d.setMonth(d.getMonth() - 1);
    navigateToMonth(d);
  }, [viewDate, navigateToMonth]);

  const goToNext = useCallback(() => {
    const d = new Date(viewDate);
    d.setMonth(d.getMonth() + 1);
    navigateToMonth(d);
  }, [viewDate, navigateToMonth]);

  const isLoading = loading || computing;

  const exportCSV = async () => {
    if (rows.length === 0) {
      Alert.alert('Sem dados', 'Não há plantões para exportar neste mês.');
      return;
    }
    const header = 'Data,Grupo,Turno,Horas Base,Horas Extras,Horas Totais,Valor Estimado,Virada';
    const lines = rows.map(row => {
      const date = row.dateStr;
      const group = `"${(row.shift.group?.name || '').replace(/"/g, '""')}"`;
      const turn = LABEL_MAP[row.label] || row.label;
      const base = row.plannedHours.toFixed(2);
      const extra = row.extraHours.toFixed(2);
      const total = row.effectiveHours.toFixed(2);
      const value = row.value.toFixed(2);
      const split = row.isSplit ? 'Sim' : 'Não';
      return [date, group, turn, base, extra, total, value, split].join(',');
    });
    const csv = [header, ...lines].join('\n');
    const monthName = MONTH_NAMES[viewDate.getMonth()];
    const yearNum = viewDate.getFullYear();
    try {
      await Share.share({ message: csv, title: `Plantões ${monthName} ${yearNum}.csv` });
    } catch (_) {}
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Month switcher */}
      <View style={styles.monthHeader}>
        <Pressable style={styles.navButton} onPress={goToPrev}>
          <Ionicons name="chevron-back" size={20} color={Colors.interactive.active} />
        </Pressable>
        <Text style={styles.monthTitle}>
          {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
        </Text>
        <Pressable style={styles.navButton} onPress={goToNext}>
          <Ionicons name="chevron-forward" size={20} color={Colors.interactive.active} />
        </Pressable>
      </View>

      {/* Export CSV */}
      {!isLoading && rows.length > 0 && (
        <Pressable style={styles.exportButton} onPress={exportCSV}>
          <Ionicons name="download-outline" size={16} color={Colors.interactive.active} />
          <Text style={styles.exportButtonText}>Exportar CSV</Text>
        </Pressable>
      )}

      {/* Totals summary */}
      <View style={styles.summaryCard}>
        {isLoading ? (
          <View style={styles.summaryGrid}>
            {[0, 1].map(i => (
              <View key={i} style={styles.summaryItem}>
                <SkeletonBox width={60} height={28} style={{ marginBottom: 6 }} />
                <SkeletonBox width={80} height={12} />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{formatHours(totals.hours)}</Text>
              <Text style={styles.summaryLabel}>Horas no mês</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: Colors.success }]}>
                {formatMoney(totals.value)}
              </Text>
              <Text style={styles.summaryLabel}>Estimado no mês</Text>
            </View>
          </View>
        )}
      </View>

      {/* Shift list */}
      <View style={styles.listSection}>
        {isLoading ? (
          [0, 1, 2].map(i => (
            <View key={i} style={styles.shiftRow}>
              <View style={styles.dateCol}>
                <SkeletonBox width={28} height={22} style={{ marginBottom: 4 }} />
                <SkeletonBox width={24} height={11} />
              </View>
              <View style={styles.infoCol}>
                <SkeletonBox width="55%" height={13} style={{ marginBottom: 5 }} />
                <SkeletonBox width="40%" height={11} style={{ marginBottom: 4 }} />
                <SkeletonBox width="50%" height={11} />
              </View>
              <SkeletonBox width={52} height={40} style={{ borderRadius: 8 }} />
            </View>
          ))
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyText}>Nenhum plantão neste mês</Text>
          </View>
        ) : (
          rows.map((row, idx) => {
            const labelColor = LABEL_COLORS[row.label] || Colors.primary;
            const shiftDate = new Date(row.dateStr + 'T12:00:00');
            const dayNum = shiftDate.getDate();
            const monthShort = shiftDate.toLocaleDateString('pt-BR', { month: 'short' });

            return (
              <View key={`${row.dateStr}-${idx}`} style={styles.shiftRow}>
                {/* Date column */}
                <View style={styles.dateCol}>
                  <Text style={styles.dateDay}>{dayNum}</Text>
                  <Text style={styles.dateMonth}>{monthShort}</Text>
                </View>

                {/* Info column */}
                <View style={styles.infoCol}>
                  <View style={styles.infoTitleRow}>
                    <View style={[styles.labelBadge, { backgroundColor: labelColor + '18', borderColor: labelColor + '40' }]}>
                      <Text style={[styles.labelBadgeText, { color: labelColor }]}>
                        {LABEL_MAP[row.label] || row.label}
                      </Text>
                    </View>
                    {row.isSplit && (
                      <View style={[styles.labelBadge, { backgroundColor: Colors.warning + '15', borderColor: Colors.warning + '30', marginLeft: 4 }]}>
                        <Ionicons name="git-branch-outline" size={10} color={Colors.warning} />
                        <Text style={[styles.labelBadgeText, { color: Colors.warning, marginLeft: 2 }]}>Virada</Text>
                      </View>
                    )}
                  </View>

                  {row.shift.group?.name ? (
                    <Text style={styles.infoGroup} numberOfLines={1}>{row.shift.group.name}</Text>
                  ) : null}

                  <View style={styles.infoHoursRow}>
                    <Text style={styles.infoHours}>
                      {formatHoursWithExtras(row.plannedHours, row.extraHours)}
                    </Text>
                    {row.extraHours !== 0 && (
                      <Text style={[
                        styles.infoExtraLabel,
                        { color: row.extraHours > 0 ? Colors.success : Colors.error }
                      ]}>
                        {row.extraHours > 0 ? 'c/ extras' : 'c/ faltas'}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Value column */}
                <View style={styles.valueCol}>
                  <Text style={styles.valueText}>
                    {formatMoney(row.value)}
                  </Text>
                  <Text style={styles.valueLabel}>estimado</Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
  },

  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.background.primary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border.light,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: Typography.fontSize.title2,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.text.primary,
    textTransform: 'capitalize',
  },

  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: Spacing.md,
    marginRight: Spacing.lg,
    gap: Spacing.xs,
  },
  exportButtonText: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.interactive.active,
  },

  summaryCard: {
    backgroundColor: Colors.background.primary,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    ...Shadows.small,
  },
  summaryGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    height: 40,
    backgroundColor: Colors.border.light,
    marginHorizontal: Spacing.md,
  },
  summaryValue: {
    fontSize: 18, // Reduzido para caber valores maiores
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  listSection: {
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Shadows.small,
  },

  dateCol: {
    alignItems: 'center',
    minWidth: 44,
    marginRight: Spacing.md,
  },
  dateDay: {
    fontSize: Typography.fontSize.title2,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
    lineHeight: Typography.fontSize.title2 * 1.1,
  },
  dateMonth: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.secondary,
    textTransform: 'uppercase',
  },

  infoCol: {
    flex: 1,
    gap: 3,
  },
  infoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  labelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  labelBadgeText: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.semiBold,
  },
  infoGroup: {
    fontSize: Typography.fontSize.subhead,
    color: Colors.text.secondary,
  },
  infoHoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  infoHours: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.secondary,
  },
  infoExtra: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.semiBold,
  },
  infoExtraLabel: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.medium,
    fontStyle: 'italic',
    marginLeft: Spacing.xs,
  },

  valueCol: {
    alignItems: 'flex-end',
    minWidth: 72,
    marginLeft: Spacing.sm,
  },
  valueText: {
    fontSize: 14, // Reduzido para caber valores maiores
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text.primary,
  },
  valueLabel: {
    fontSize: Typography.fontSize.caption1,
    color: Colors.text.tertiary,
    marginTop: 2,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: Typography.fontSize.body,
    color: Colors.text.secondary,
  },
});
