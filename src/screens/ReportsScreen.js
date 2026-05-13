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
import { useColors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';
import { calculateShiftValueWithBreakdown, getShiftHours, getFullShiftConfig, computeShiftValue } from '../utils/ShiftValueCalculator';
import { formatMoney, formatMoneyCompact } from '../utils/MoneyFormatter';
import TimeUtils from '../utils/TimeUtils';

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

const fmt2 = (n) => String(n).padStart(2, '0');

const formatHours = (h) => {
  if (!h && h !== 0) return '—';
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins > 0 ? `${whole}h${fmt2(mins)}` : `${whole}h`;
};

// Nova função para formatar horas com extras integradas - CORRIGIDA para usar minutos puros
const formatHoursWithExtras = (plannedMinutes, extraMinutes) => {
  if (!extraMinutes || extraMinutes === 0) {
    return TimeUtils.minutesToDisplay(plannedMinutes);
  }

  // Calcular total em minutos (fonte da verdade)
  const totalMinutes = plannedMinutes + extraMinutes;

  return TimeUtils.minutesToDisplay(totalMinutes);
};

export default function ReportsScreen() {
  const { daysWithShifts, loading, loadMonthlyShifts } = useShifts();
  const C = useColors();
  const s = makeStyles(C);
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
      const config = await getFullShiftConfig();
      const fracExtra = config.fractionalExtraHours ?? true;

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

          // NOVA LÓGICA: Tudo em minutos como fonte da verdade
          const plannedMinutes = shift.splitHours
            ? TimeUtils.decimalHoursToMinutes(shift.splitHours.hoursThisMonth)
            : TimeUtils.getShiftStandardMinutes(shift.label);

          // Calcular minutos extras
          let extraMinutes = 0;
          const rh = realHoursMap[i];
          if (rh?.startTime && rh?.endTime) {
            const realMinutes = TimeUtils.calculateDurationMinutes(rh.startTime, rh.endTime);
            if (realMinutes !== null) {
              const rawDiffMinutes = realMinutes - plannedMinutes;
              // Aplicar fracionamento se configurado
              if (fracExtra) {
                // Fracionamento ativado: usar diferença exata em minutos
                extraMinutes = rawDiffMinutes;
              } else {
                // Fracionamento desativado: arredondar apenas horas extras positivas
                if (rawDiffMinutes >= 0) {
                  // Horas extras: arredondar para baixo (só conta horas completas)
                  extraMinutes = Math.floor(rawDiffMinutes / 60) * 60;
                } else {
                  // Horas faltantes: manter valor negativo exato (não arredondar)
                  extraMinutes = rawDiffMinutes;
                }
              }
            }
          }

          // Minutos totais efetivos
          const totalMinutes = plannedMinutes + extraMinutes;

          // Converter para horas decimais APENAS para compatibilidade com cálculos financeiros legados
          const plannedHours = plannedMinutes / 60;
          const extraHours = extraMinutes / 60;
          const effectiveHours = totalMinutes / 60;

          // Value — fonte da verdade: minutos.
          // Fórmula única para split e não-split:
          //   value = (totalMinutes / 60) × hourlyRate × bonusMult
          //
          // Para split: plannedMinutes = splitHours.minutesThisMonth (porção real)
          // Para normal: plannedMinutes = duração padrão do turno
          // totalMinutes já inclui extraMinutes (com regra fracionada aplicada acima)
          //
          // Exemplos (sem fidelidade):
          //   M seg 360min + 33min extra, R$130/h → (393/60)×130 = R$851,50
          //   D carryover 420min (seg, R$143/h) → (420/60)×143 = R$1.001,00
          //   N sáb 720min - 45min, R$185/h → (675/60)×185 = R$2.081,25
          //   Total mês (M+N acima, fid 25%): R$851,50×1.25 + R$2081,25×1.25 = R$3.665,94
          let value = 0;
          try {
            const bd = await calculateShiftValueWithBreakdown(shift, dateStr, 0);
            // totalMinutes = plannedMinutes + extraMinutes (fracExtra rule already applied)
            value = computeShiftValue(bd, totalMinutes);
          } catch (_) {}

          totalHours += effectiveHours;
          totalValue += value;

          built.push({
            dateStr,
            day: dayData.day,
            label,
            shift,
            // Manter compatibilidade com campos existentes (em horas decimais)
            plannedHours,
            extraHours,
            effectiveHours,
            // FONTE DA VERDADE: valores em minutos
            plannedMinutes,
            extraMinutes,
            totalMinutes,
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

  // Helper function to convert minutes to readable format
  const formatMinutesToTime = (totalMinutes) => {
    return TimeUtils.minutesToDisplay(totalMinutes);
  };

  // Label colors computed from current theme
  const LABEL_COLORS = {
    M: C.success,
    T: C.primary,
    N: C.warning,
  };

  const exportCSV = async () => {
    if (rows.length === 0) {
      Alert.alert('Sem dados', 'Não há plantões para exportar neste mês.');
      return;
    }
    const header = 'Data,Grupo,Turno,Minutos Base,Minutos Extras,Minutos Totais,Valor Estimado,Virada';
    const lines = rows.map(row => {
      const date = row.dateStr;
      const group = `"${(row.shift.group?.name || '').replace(/"/g, '""')}"`;
      const turn = LABEL_MAP[row.label] || row.label;
      // TODOS OS VALORES EM MINUTOS PUROS (números inteiros)
      const baseMinutes = TimeUtils.decimalHoursToMinutes(row.plannedHours);
      const extraMinutes = row.extraMinutes || 0;
      const totalMinutes = baseMinutes + extraMinutes;
      const value = row.value.toFixed(2);
      const split = row.isSplit ? 'Sim' : 'Não';
      return [date, group, turn, baseMinutes, extraMinutes, totalMinutes, value, split].join(',');
    });
    const csv = [header, ...lines].join('\n');
    const monthName = MONTH_NAMES[viewDate.getMonth()];
    const yearNum = viewDate.getFullYear();
    try {
      await Share.share({ message: csv, title: `Plantões ${monthName} ${yearNum}.csv` });
    } catch (_) {}
  };

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      {/* Month switcher */}
      <View style={s.monthHeader}>
        <Pressable style={s.navButton} onPress={goToPrev}>
          <Ionicons name="chevron-back" size={20} color={C.interactive.active} />
        </Pressable>
        <Text style={s.monthTitle}>
          {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
        </Text>
        <Pressable style={s.navButton} onPress={goToNext}>
          <Ionicons name="chevron-forward" size={20} color={C.interactive.active} />
        </Pressable>
      </View>

      {/* Export CSV */}
      {!isLoading && rows.length > 0 && (
        <Pressable style={s.exportButton} onPress={exportCSV}>
          <Ionicons name="download-outline" size={16} color={C.interactive.active} />
          <Text style={s.exportButtonText}>Exportar CSV</Text>
        </Pressable>
      )}

      {/* Totals summary — structure always visible, values skeletonized while loading */}
      <View style={s.summaryCard}>
        <View style={s.summaryGrid}>
          <View style={s.summaryItem}>
            {isLoading
              ? <SkeletonBox width={60} height={28} style={{ marginBottom: 6 }} />
              : <Text style={s.summaryValue}>{formatHours(totals.hours)}</Text>}
            <Text style={s.summaryLabel}>Horas no mês</Text>
          </View>
          <View style={s.summaryDivider} />
          <View style={s.summaryItem}>
            {isLoading
              ? <SkeletonBox width={80} height={28} style={{ marginBottom: 6 }} />
              : <Text style={[s.summaryValue, { color: C.success }]}>{formatMoney(totals.value)}</Text>}
            <Text style={s.summaryLabel}>Estimado no mês</Text>
          </View>
        </View>
      </View>

      {/* Shift list */}
      <View style={s.listSection}>
        {isLoading && rows.length === 0 ? (
          /* No rows yet (initial load): show placeholder rows to hold structure */
          [0, 1, 2].map(i => (
            <View key={i} style={s.shiftRow}>
              <View style={s.dateCol}>
                <SkeletonBox width={28} height={22} style={{ marginBottom: 4 }} />
                <SkeletonBox width={24} height={11} />
              </View>
              <View style={s.infoCol}>
                <SkeletonBox width="55%" height={13} style={{ marginBottom: 5 }} />
                <SkeletonBox width="40%" height={11} style={{ marginBottom: 4 }} />
                <SkeletonBox width="50%" height={11} />
              </View>
              <View style={s.valueCol}>
                <SkeletonBox width={52} height={18} style={{ borderRadius: 6, marginBottom: 4 }} />
                <SkeletonBox width={40} height={10} style={{ borderRadius: 4 }} />
              </View>
            </View>
          ))
        ) : rows.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="document-text-outline" size={48} color={C.text.tertiary} />
            <Text style={s.emptyText}>Nenhum plantão neste mês</Text>
          </View>
        ) : (
          rows.map((row, idx) => {
            const labelColor = LABEL_COLORS[row.label] || C.primary;
            const shiftDate = new Date(row.dateStr + 'T12:00:00');
            const dayNum = shiftDate.getDate();
            const monthShort = shiftDate.toLocaleDateString('pt-BR', { month: 'short' });

            return (
              <View key={`${row.dateStr}-${idx}`} style={s.shiftRow}>
                {/* Date column */}
                <View style={s.dateCol}>
                  <Text style={s.dateDay}>{dayNum}</Text>
                  <Text style={s.dateMonth}>{monthShort}</Text>
                </View>

                {/* Info column */}
                <View style={s.infoCol}>
                  <View style={s.infoTitleRow}>
                    <View style={[s.labelBadge, { backgroundColor: labelColor + '18', borderColor: labelColor + '40' }]}>
                      <Text style={[s.labelBadgeText, { color: labelColor }]}>
                        {LABEL_MAP[row.label] || row.label}
                      </Text>
                    </View>
                    {row.isSplit && (
                      <View style={[s.labelBadge, { backgroundColor: C.warning + '15', borderColor: C.warning + '30', marginLeft: 4 }]}>
                        <Ionicons name="git-branch-outline" size={10} color={C.warning} />
                        <Text style={[s.labelBadgeText, { color: C.warning, marginLeft: 2 }]}>Virada</Text>
                      </View>
                    )}
                  </View>

                  {row.shift.group?.name ? (
                    <Text style={s.infoGroup} numberOfLines={1}>{row.shift.group.name}</Text>
                  ) : null}

                  <View style={s.infoHoursRow}>
                    <Text style={s.infoHours}>
                      {formatHoursWithExtras(row.plannedMinutes, row.extraMinutes)}
                    </Text>
                    {row.extraMinutes !== 0 && (
                      <Text style={[
                        s.infoExtraLabel,
                        { color: row.extraMinutes > 0 ? C.success : C.error }
                      ]}>
                        {row.extraMinutes > 0 ? 'c/ extras' : 'c/ faltas'}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Value column — skeleton while recomputing financials */}
                <View style={s.valueCol}>
                  {computing
                    ? <SkeletonBox width={52} height={18} style={{ borderRadius: 6, marginBottom: 4 }} />
                    : <Text style={s.valueText}>{formatMoney(row.value)}</Text>}
                  <Text style={s.valueLabel}>estimado</Text>
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

const makeStyles = (C) => ({
  container: {
    flex: 1,
    backgroundColor: C.background.secondary,
  },

  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    backgroundColor: C.background.primary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border.light,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: Typography.fontSize.title2,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.primary,
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
    color: C.interactive.active,
  },

  summaryCard: {
    backgroundColor: C.background.primary,
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
    backgroundColor: C.border.light,
    marginHorizontal: Spacing.md,
  },
  summaryValue: {
    fontSize: 18, // Reduzido para caber valores maiores
    fontWeight: Typography.fontWeight.bold,
    color: C.primary,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.medium,
    color: C.text.secondary,
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
    backgroundColor: C.background.primary,
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
    color: C.primary,
    lineHeight: Typography.fontSize.title2 * 1.1,
  },
  dateMonth: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.medium,
    color: C.text.secondary,
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
    color: C.text.secondary,
  },
  infoHoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  infoHours: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.medium,
    color: C.text.secondary,
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
    color: C.text.primary,
  },
  valueLabel: {
    fontSize: Typography.fontSize.caption1,
    color: C.text.tertiary,
    marginTop: 2,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: Typography.fontSize.body,
    color: C.text.secondary,
  },
});
