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
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useShifts } from '../contexts/ShiftsContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';
import { calculateShiftValueWithBreakdown, getFullShiftConfig, computeShiftValue } from '../utils/ShiftValueCalculator';
import { formatMoney, formatMoneyCompact } from '../utils/MoneyFormatter';
import TimeUtils from '../utils/TimeUtils';
import { AuthContext } from '../context/AuthContext';
import LocalCache from '../services/LocalCache';
import { getMonthTotalValue, getMonthTotalHours } from '../utils/MonthSummaryComputer';
import { buildHybridConfig, isPastMonthKey } from '../utils/HospitalConfigResolver';
import { ChartsView } from './ChartsScreen';

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

const SCREEN_W = Dimensions.get('window').width;

export default function ReportsScreen({ onExportReady, initialTab = 'resumo' } = {}) {
  const [tab, setTab] = useState(initialTab); // 'resumo' | 'graficos'
  const { loading, prefetchMonth, getMonthCache } = useShifts();
  const [reportsDaysWithShifts, setReportsDaysWithShifts] = useState([]);
  const daysWithShifts = reportsDaysWithShifts;
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);
  const { user } = useContext(AuthContext);
  const [viewDate, setViewDate] = useState(new Date());
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({ hours: 0, value: 0 });
  const [computing, setComputing] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  // Header reads from the canonical month summary (same source as Home hero,
  // Calendar hero, Charts bars) — never recompute totals in this screen.
  const [viewMonthSummary, setViewMonthSummary] = useState(null);

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
    navigationTimeoutRef.current = setTimeout(async () => {
      const m = pendingDateRef.current.getMonth() + 1;
      const y = pendingDateRef.current.getFullYear();

      await prefetchMonth(m, y);
      setReportsDaysWithShifts(getMonthCache(m, y)?.daysWithShifts || []);

      isNavigatingRef.current = false;
      pendingDateRef.current = null;
    }, 500);
  }, [prefetchMonth, getMonthCache]);

  // Load data immediately on mount, then rely on navigateToMonth for subsequent changes
  useEffect(() => {
    // Only load on initial mount
    if (!isNavigatingRef.current) {
      (async () => {
        await prefetchMonth(month, year);
        setReportsDaysWithShifts(getMonthCache(month, year)?.daysWithShifts || []);
      })();
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
      const liveConfig = await getFullShiftConfig();
      const fracExtra = liveConfig.fractionalExtraHours ?? true;

      // Past-month freeze: bonus + loyalty come from the prior saved summary's
      // snapshot; hour values + friday-night rule come from the live config.
      // Current/future months use the live config wholesale.
      const viewMonthKey = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
      let breakdownConfig = liveConfig;
      if (user?.id && isPastMonthKey(viewMonthKey)) {
        try {
          const prior = await LocalCache.getSummary(user.id, viewMonthKey);
          const snap = prior?.financialConfigSnapshot;
          if (snap) breakdownConfig = buildHybridConfig(liveConfig, snap);
        } catch (_) {}
      }

      // Pre-pass: total planned hours for the month — needed by the legacy
      // global-loyalty tier filter inside calculateShiftValueWithBreakdown.
      // Without this, totalMonthlyHours=0 skips every tier with minHours>0,
      // making the header read R$ X (sem fidelização) while the bar chart
      // (LocalCache.getSummary) correctly includes it.
      let totalMonthlyHours = 0;
      for (const dayData of daysWithShifts) {
        for (const shift of (dayData.shifts || [])) {
          const planned = shift.splitHours
            ? TimeUtils.decimalHoursToMinutes(shift.splitHours.hoursThisMonth)
            : TimeUtils.getShiftStandardMinutes(shift.label);
          totalMonthlyHours += planned / 60;
        }
      }

      const built = [];
      let totalHours = 0;
      let totalValue = 0;

      for (const dayData of daysWithShifts) {
        const dateStr = dayData.date; // YYYY-MM-DD
        const dateKey = dateStr;

        // Load registered real hours for this day (extra hours).
        // Chave escopada por uid (fallback à legada).
        let realHoursMap = {};
        try {
          const uid = String(user?.id || '');
          const saved = (uid && await SecureStore.getItemAsync(`real_hours_${uid}_${dateKey}`))
            || await SecureStore.getItemAsync(`real_hours_${dateKey}`);
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
            const bd = await calculateShiftValueWithBreakdown(shift, dateStr, totalMonthlyHours, breakdownConfig);
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

  const isLoading = loading || computing || chartLoading;

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

  useEffect(() => {
    if (onExportReady) onExportReady(rows.length > 0 ? exportCSV : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  // Load last 3 months of summaries for bar chart + the viewed month for header
  useEffect(() => {
    if (!user?.id) return;
    setChartLoading(true);
    const load = async () => {
      const months = [];
      let viewedSummary = null;
      for (let i = 2; i >= 0; i--) {
        const d = new Date(viewDate.getFullYear(), viewDate.getMonth() - i, 1);
        const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const summary = await LocalCache.getSummary(user.id, mk);
        if (i === 0) viewedSummary = summary;
        const val = getMonthTotalValue(summary) ?? 0;
        months.push({
          month: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase(),
          value: val,
          isCurrent: i === 0,
        });
      }
      setChartData(months);
      setViewMonthSummary(viewedSummary);
      setChartLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, viewDate.getMonth(), viewDate.getFullYear(), daysWithShifts]);

  const extraMinutesTotal = rows.reduce((a, r) => a + (r.extraMinutes > 0 ? r.extraMinutes : 0), 0);
  const extraValue = rows.reduce((a, r) => {
    if (r.extraMinutes > 0) {
      const rate = r.value / (r.totalMinutes || 1);
      return a + rate * r.extraMinutes;
    }
    return a;
  }, 0);

  const fmtBRLk = (v) => {
    if (!v || isNaN(v)) return 'R$ —';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const LABEL_COLORS = {
    M: C.success,
    T: C.primary,
    N: C.warning,
  };

  const renderTabs = () => (
    <View style={s.tabsBar}>
      <Pressable style={[s.tab, tab === 'resumo' && s.tabActive]} onPress={() => setTab('resumo')}>
        <Text style={[s.tabText, tab === 'resumo' && s.tabTextActive]}>Resumo</Text>
      </Pressable>
      <Pressable style={[s.tab, tab === 'graficos' && s.tabActive]} onPress={() => setTab('graficos')}>
        <Text style={[s.tabText, tab === 'graficos' && s.tabTextActive]}>Gráficos</Text>
      </Pressable>
    </View>
  );

  if (tab === 'graficos') {
    return (
      <View style={{ flex: 1 }}>
        {renderTabs()}
        <ChartsView />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {renderTabs()}
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: Spacing.lg }} showsVerticalScrollIndicator={false}>

      {/* Hero */}
      <View style={s.heroSection}>
        <View style={s.heroNav}>
          <View>
            <Text style={s.heroYearLabel}>{MONTH_NAMES[viewDate.getMonth()].toUpperCase()} · {viewDate.getFullYear()}</Text>
            <View style={s.heroValueRow}>
              {(() => {
                // Canonical source: same as bar chart, Home hero, Calendar hero.
                const headerVal = getMonthTotalValue(viewMonthSummary);
                const display = headerVal != null ? formatMoney(headerVal) : '—';
                return (
                  <>
                    <Text style={s.heroValue}>
                      {isLoading || headerVal == null ? '—' : display.split(',')[0]}
                    </Text>
                    {!isLoading && headerVal != null && (
                      <Text style={s.heroValueCents}>,{display.split(',')[1]}</Text>
                    )}
                  </>
                );
              })()}
            </View>
          </View>
          <View style={s.heroNavBtns}>
            <Pressable style={s.navButton} onPress={goToPrev}>
              <Ionicons name="chevron-back" size={16} color={C.text.primary} />
            </Pressable>
            <Pressable style={s.navButton} onPress={goToNext}>
              <Ionicons name="chevron-forward" size={16} color={C.text.primary} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Bar chart */}
      <View style={s.chartCard}>
        <View style={s.chartCardHeader}>
          <Text style={s.chartCardLabel}>3 meses</Text>
        </View>
        <View style={s.chartBars}>
          {chartLoading ? (
            [0, 1, 2].map(i => (
              <View key={i} style={[s.chartBarCol, { justifyContent: 'flex-end', gap: 6 }]}>
                <SkeletonBox width="100%" height={20 + i * 22} style={{ borderRadius: 6 }} />
                <SkeletonBox width={28} height={10} style={{ borderRadius: 4 }} />
              </View>
            ))
          ) : (
            (() => {
              const max = Math.max(...chartData.map(d => d.value), 1);
              return chartData.map((b, i) => {
                const h = Math.max((b.value / max) * 80, b.value > 0 ? 6 : 2);
                return (
                  <View key={i} style={s.chartBarCol}>
                    {b.isCurrent && b.value > 0 ? (
                      <Text style={s.chartBarLabel}>{fmtBRLk(b.value)}</Text>
                    ) : null}
                    <View style={[
                      s.chartBar,
                      { height: h, backgroundColor: b.isCurrent ? C.money : C.accentSoft,
                        borderWidth: b.isCurrent ? 0 : StyleSheet.hairlineWidth,
                        borderColor: C.border.light },
                    ]} />
                    <Text style={[s.chartMonthLabel, b.isCurrent && { color: C.text.primary, fontWeight: '800' }]}>
                      {b.month}
                    </Text>
                  </View>
                );
              });
            })()
          )}
        </View>
      </View>

      {/* Mini stats */}
      <View style={s.miniStatsRow}>
        <View style={s.miniStat}>
          {isLoading
            ? <SkeletonBox width={40} height={22} style={{ marginBottom: 4 }} />
            : <Text style={s.miniStatValue}>{rows.length}</Text>}
          <Text style={s.miniStatLabel}>plantões</Text>
        </View>
        <View style={[s.miniStat, s.miniStatBorder]}>
          {isLoading
            ? <SkeletonBox width={50} height={22} style={{ marginBottom: 4 }} />
            : <Text style={s.miniStatValue}>{formatHours(totals.hours)}</Text>}
          <Text style={s.miniStatLabel}>horas</Text>
        </View>
        <View style={[s.miniStat, s.miniStatBorder]}>
          {isLoading
            ? <SkeletonBox width={50} height={22} style={{ marginBottom: 4 }} />
            : <Text style={[s.miniStatValue, extraMinutesTotal > 0 && { color: C.warning }]}>
                {extraMinutesTotal > 0 ? fmtBRLk(extraValue) : '—'}
              </Text>}
          <Text style={s.miniStatLabel}>extras</Text>
        </View>
      </View>

      {/* Shift list */}
      <Text style={s.sectionLabel}>Plantões do mês</Text>
      <View style={s.listCard}>
        {isLoading ? (
          [0, 1, 2].map(i => (
            <View key={i} style={[s.reportRow, i === 0 && { borderTopWidth: 0 }]}>
              <View style={s.reportDateCol}>
                <SkeletonBox width={28} height={20} style={{ marginBottom: 3 }} />
                <SkeletonBox width={22} height={10} />
              </View>
              <View style={[s.reportColorBar, { backgroundColor: C.border.light }]} />
              <View style={s.reportInfoCol}>
                <SkeletonBox width="55%" height={13} style={{ marginBottom: 4 }} />
                <SkeletonBox width="40%" height={11} />
              </View>
              <View style={s.reportValueCol}>
                <SkeletonBox width={52} height={14} style={{ borderRadius: 4 }} />
              </View>
            </View>
          ))
        ) : rows.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="document-text-outline" size={40} color={C.text.tertiary} />
            <Text style={s.emptyText}>Nenhum plantão neste mês</Text>
          </View>
        ) : (
          rows.map((row, idx) => {
            const labelColor = LABEL_COLORS[row.label] || C.primary;
            const shiftDate = new Date(row.dateStr + 'T12:00:00');
            const dayNum = shiftDate.getDate();
            const weekday = shiftDate.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
            const delta = row.extraMinutes !== 0 ? ` (${row.extraMinutes > 0 ? '+' : ''}${TimeUtils.minutesToDisplay(row.extraMinutes)})` : '';

            return (
              <View key={`${row.dateStr}-${idx}`} style={[s.reportRow, idx === 0 && { borderTopWidth: 0 }]}>
                <View style={s.reportDateCol}>
                  <Text style={s.reportDateDay}>{dayNum}</Text>
                  <Text style={s.reportDateWeekday}>{weekday}</Text>
                </View>
                <View style={[s.reportColorBar, { backgroundColor: labelColor }]} />
                <View style={s.reportInfoCol}>
                  <Text style={s.reportInstitution} numberOfLines={1}>
                    {row.shift.group?.institution?.name || row.shift.group?.name || '—'}
                  </Text>
                  <Text style={s.reportMeta}>
                    {TimeUtils.minutesToDisplay(row.totalMinutes)} · {LABEL_MAP[row.label] || row.label}
                    {delta ? <Text style={{ color: row.extraMinutes > 0 ? C.money : C.error }}>{delta}</Text> : null}
                  </Text>
                </View>
                <View style={s.reportValueCol}>
                  {computing
                    ? <SkeletonBox width={48} height={14} style={{ borderRadius: 4 }} />
                    : <Text style={s.reportValue}>{formatMoneyCompact(row.value)}</Text>}
                  {row.extraMinutes > 0 ? (
                    <Text style={s.reportExtraValue}>+ extras</Text>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Export */}
      <Pressable style={s.exportButton} onPress={exportCSV}>
        <Ionicons name="share-outline" size={14} color={C.interactive.active} />
        <Text style={s.exportButtonText}>Exportar relatório (CSV)</Text>
      </Pressable>

      <View style={{ height: 20 }} />
    </ScrollView>
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background.secondary,
  },

  // Segmented pill — padrão TrocasAbertasScreen / GroupsScreen
  tabsBar: {
    flexDirection: 'row',
    marginHorizontal: Spacing.screen,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    padding: 4,
    borderRadius: 999,
    backgroundColor: C.background.elevated,
    borderWidth: 0.5,
    borderColor: C.border.light,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 999,
  },
  tabActive: { backgroundColor: C.background.card, ...Shadows.small },
  tabText: { fontSize: 14, fontFamily: Typography.fontFamily.semiBold, color: C.text.tertiary },
  tabTextActive: { color: C.text.primary },

  // Hero
  heroSection: {
    backgroundColor: C.background.primary,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
  },
  heroNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroYearLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: C.text.tertiary,
  },
  heroValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    marginTop: 4,
  },
  heroValue: {
    fontFamily: Typography.fontFamily.display,
    fontSize: 42,
    fontWeight: '800',
    color: C.money,
    letterSpacing: -1,
  },
  heroValueCents: {
    fontSize: 14,
    color: C.text.secondary,
  },
  heroNavBtns: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  navButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.background.secondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border.light,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Chart
  chartCard: {
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    padding: 16,
    paddingBottom: 8,
    ...Shadows.small,
  },
  chartCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 14,
  },
  chartCardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.text.tertiary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    height: 110,
    paddingBottom: 20,
  },
  chartBarCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chartBarLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.money,
    marginBottom: 4,
  },
  chartBar: {
    width: '100%',
    borderRadius: 6,
  },
  chartMonthLabel: {
    marginTop: 6,
    fontSize: 10,
    color: C.text.tertiary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Mini stats
  miniStatsRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    gap: 8,
  },
  miniStat: {
    flex: 1,
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.md,
    padding: 12,
    alignItems: 'center',
    ...Shadows.small,
  },
  miniStatBorder: {},
  miniStatValue: {
    fontSize: 17,
    fontWeight: '800',
    color: C.text.primary,
    fontFamily: Typography.fontFamily.display,
    marginBottom: 2,
  },
  miniStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Section label
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },

  // List card
  listCard: {
    marginHorizontal: Spacing.md,
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.small,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border.light,
    paddingLeft: 0,
  },
  reportDateCol: {
    width: 42,
    alignItems: 'center',
    paddingLeft: 12,
  },
  reportDateDay: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text.primary,
  },
  reportDateWeekday: {
    fontSize: 10,
    fontWeight: '700',
    color: C.text.tertiary,
    textTransform: 'uppercase',
  },
  reportColorBar: {
    width: 6,
    height: 36,
    borderRadius: 3,
    opacity: 0.7,
  },
  reportInfoCol: {
    flex: 1,
    minWidth: 0,
  },
  reportInstitution: {
    fontSize: 13,
    fontWeight: '700',
    color: C.text.primary,
  },
  reportMeta: {
    fontSize: 11,
    color: C.text.tertiary,
    marginTop: 1,
  },
  reportValueCol: {
    alignItems: 'flex-end',
    paddingRight: 12,
  },
  reportValue: {
    fontSize: 13,
    fontWeight: '600',
    color: C.money,
  },
  reportExtraValue: {
    fontSize: 10,
    color: C.warning,
    fontWeight: '600',
  },

  // Export
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: Spacing.md,
    marginTop: 18,
    paddingVertical: 13,
    borderRadius: BorderRadius.md,
    backgroundColor: C.background.primary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border.light,
    ...Shadows.small,
  },
  exportButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.interactive.active,
  },

  // Empty
  empty: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text.secondary,
  },
  emptySubtext: {
    fontSize: Typography.fontSize.subhead,
    color: C.text.tertiary,
    textAlign: 'center',
  },
});

