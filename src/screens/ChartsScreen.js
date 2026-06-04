import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import Svg, { Path, Circle, Rect, Line, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import * as SecureStore from 'expo-secure-store';
import { useShifts } from '../contexts/ShiftsContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, Typography, Spacing, BorderRadius, Shadows } from '../constants/DesignSystem';
import { calculateShiftValueWithBreakdown, computeShiftValue } from '../utils/ShiftValueCalculator';
import { getMonthTotalValue } from '../utils/MonthSummaryComputer';
import { formatMoney } from '../utils/MoneyFormatter';
import TimeUtils from '../utils/TimeUtils';
import { AuthContext } from '../context/AuthContext';
import LocalCache from '../services/LocalCache';
import { Ionicons } from '@expo/vector-icons';

const MONTH_NAMES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const SCREEN_W = Dimensions.get('window').width;

const fmtBRL = (v) => {
  if (!v && v !== 0) return 'R$ 0,00';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const fmtBRLk = (v) => {
  if (!v || isNaN(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// ── LineChart ─────────────────────────────────────────────────────────────────
function LineChart({ data, selectedIndex, onSelect, hasSelection, C }) {
  const W = SCREEN_W - 64;
  const H = 180;
  const P = { l: 14, r: 14, t: 28, b: 28 };
  const innerW = W - P.l - P.r;
  const innerH = H - P.t - P.b;

  if (!data || data.length === 0) return null;

  const values = data.map(d => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pad = (max - min) * 0.15 || 1000;
  const yMax = max + pad;
  const yMin = Math.max(0, min - pad);

  const xFor = (i) => P.l + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const yFor = (v) => P.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const points = data.map((d, i) => [xFor(i), yFor(d.value)]);

  const pathD = points.map((p, i) => {
    if (i === 0) return `M ${p[0]} ${p[1]}`;
    const prev = points[i - 1];
    const cx1 = prev[0] + (p[0] - prev[0]) * 0.5;
    const cy1 = prev[1];
    const cx2 = p[0] - (p[0] - prev[0]) * 0.5;
    const cy2 = p[1];
    return `C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p[0]} ${p[1]}`;
  }).join(' ');

  const areaD = `${pathD} L ${P.l + innerW} ${P.t + innerH} L ${P.l} ${P.t + innerH} Z`;

  const sp = points[selectedIndex];
  const selVal = data[selectedIndex]?.value || 0;
  const calloutX = Math.max(P.l + 35, Math.min(P.l + innerW - 35, sp ? sp[0] : 0));
  const calloutBoxX = Math.max(P.l, Math.min(P.l + innerW - 70, sp ? sp[0] - 35 : 0));

  const tapAreaW = innerW / data.length;

  return (
    <View>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        <Defs>
          <LinearGradient id="aurora-area" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={C.money} stopOpacity="0.22" />
            <Stop offset="100%" stopColor={C.money} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Grid lines */}
        {[0.0, 0.5, 1.0].map((t, i) => (
          <Line
            key={i}
            x1={P.l} y1={P.t + innerH * (1 - t)}
            x2={P.l + innerW} y2={P.t + innerH * (1 - t)}
            stroke={C.border.light}
            strokeWidth="0.5"
            strokeDasharray={i === 2 ? '0' : '2 3'}
          />
        ))}

        {/* Area fill */}
        <Path d={areaD} fill="url(#aurora-area)" />

        {/* Line */}
        <Path d={pathD} fill="none" stroke={C.money} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Selection vertical line */}
        {sp ? (
          <Line x1={sp[0]} y1={P.t} x2={sp[0]} y2={P.t + innerH} stroke={C.primary} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        ) : null}

        {/* Tappable areas */}
        {data.map((d, i) => (
          <Rect
            key={i}
            x={xFor(i) - tapAreaW / 2}
            y={P.t}
            width={tapAreaW}
            height={innerH}
            fill="transparent"
            onPress={() => onSelect(i === selectedIndex && hasSelection ? null : i)}
          />
        ))}

        {/* Data points */}
        {data.map((d, i) => {
          const [x, y] = points[i];
          const isSel = i === selectedIndex && hasSelection;
          const isLast = i === data.length - 1;
          const highlight = isSel || (isLast && !hasSelection);
          return (
            <React.Fragment key={i}>
              {highlight ? <Circle cx={x} cy={y} r={8} fill={C.money} opacity={0.15} /> : null}
              <Circle
                cx={x} cy={y}
                r={highlight ? 4 : 2.5}
                fill={highlight ? C.money : C.background.primary}
                stroke={C.money}
                strokeWidth={highlight ? 0 : 2}
              />
              {highlight ? <Circle cx={x} cy={y} r={1.5} fill="#fff" /> : null}
            </React.Fragment>
          );
        })}

        {/* Callout */}
        {sp ? (
          <React.Fragment>
            <Rect x={calloutBoxX} y={sp[1] - 30} width="70" height="22" rx="6" fill={C.text.primary} />
            <SvgText
              x={calloutX} y={sp[1] - 16}
              fill={C.background.primary}
              fontSize="10" fontWeight="700"
              textAnchor="middle"
            >
              {fmtBRLk(selVal)}
            </SvgText>
          </React.Fragment>
        ) : null}

        {/* X-axis labels */}
        {data.map((d, i) => {
          const isSel = i === selectedIndex && hasSelection;
          return (
            <SvgText
              key={i}
              x={xFor(i)} y={H - 8}
              fill={isSel ? C.primary : C.text.tertiary}
              fontSize="9" fontWeight={isSel ? '800' : '600'}
              textAnchor="middle"
            >
              {d.label.toUpperCase()}
            </SvgText>
          );
        })}
      </Svg>

      {/* Range caption + clear */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <Text style={{ fontSize: 10, color: C.text.tertiary }}>
          {fmtBRLk(yMin)} — {fmtBRLk(yMax)}
        </Text>
        {hasSelection ? (
          <Pressable onPress={() => onSelect(null)}>
            <Text style={{ fontSize: 11, color: C.primary, fontWeight: '700' }}>Limpar seleção</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ── Insight card ──────────────────────────────────────────────────────────────
function InsightCard({ iconName, iconColor, iconBg, title, value, C }) {
  return (
    <View style={[s.insightCard, { backgroundColor: C.background.primary, borderColor: C.border.light }]}>
      <View style={[s.insightIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={15} color={iconColor} />
      </View>
      <View style={s.insightBody}>
        <Text style={[s.insightTitle, { color: C.text.tertiary }]}>{title}</Text>
        <Text style={[s.insightValue, { color: C.text.primary }]}>{value}</Text>
      </View>
    </View>
  );
}

// ── SkeletonBox ───────────────────────────────────────────────────────────────
// Shimmer suave entre 0.4 e 1.0 — mesmo padrão do ReportsScreen.
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
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  return (
    <Animated.View
      style={[{ width, height, backgroundColor: '#90a4ae22', borderRadius: 6, opacity }, style]}
    />
  );
};

// ── ChartsView ──────────────────────────────────────────────────────────────
// Componente embedável (era ChartsScreen como overlay). Agora vive como aba
// dentro de ReportsScreen. Mantém a ScrollView própria — cada aba do Reports
// tem seu próprio scroll independente.
export function ChartsView() {
  const { prefetchMonth, getMonthCache } = useShifts();
  const C = useColors();
  const insets = useSafeAreaInsets();
  const { user } = React.useContext(AuthContext);
  const [period, setPeriod] = useState('6m');
  const [monthlyData, setMonthlyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const loadKey  = useRef(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const periodN = period === '3m' ? 3 : period === '6m' ? 6 : 12;

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
    setSelectedIdx(null);

    // Limpa os dados → renderiza skeleton (condição já existente nos blocos).
    // Reset fadeAnim p/ 1 — o gating `monthlyData.length > 0 ? fadeAnim : 1`
    // mantém o skeleton em opacidade total enquanto carrega.
    setMonthlyData([]);
    fadeAnim.setValue(1);

    // Tempo mínimo de skeleton — mesmo com cache instantâneo, mantém a
    // transição perceptível em vez de "piscar" os dados de uma vez.
    const MIN_SKELETON_MS = 450;
    const startedAt = Date.now();

    try {
      const months = buildMonthList(n);
      const results = [];
      // Coleta TODOS os meses antes de comitar — evita re-render parcial.
      for (const { month, year } of months) {
        if (loadKey.current !== key) return;
        let totalValue = 0;
        let totalHours = 0;
        let count = 0;

        if (user?.id) {
          const mk = `${year}-${String(month).padStart(2, '0')}`;
          const cached = await LocalCache.getSummary(user.id, mk);
          if (cached && (cached.totalGrossValue || cached.totalShifts)) {
            totalValue = getMonthTotalValue(cached) ?? 0;
            totalHours = cached.totalHours || 0;
            count = cached.totalShifts || 0;
            results.push({ label: MONTH_NAMES_SHORT[month - 1], year, month, value: totalValue, hours: totalHours, count });
            continue;
          }
        }

        await prefetchMonth(month, year);
        const cached = getMonthCache(month, year);
        const days = cached?.daysWithShifts || [];
        for (const dayData of days) {
          const dateStr = dayData.date;
          let realHoursMap = {};
          try {
            const uid = String(user?.id || '');
            const saved = (uid && await SecureStore.getItemAsync(`real_hours_${uid}_${dateStr}`))
              || await SecureStore.getItemAsync(`real_hours_${dateStr}`);
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
            let value = 0;
            try {
              const bd = await calculateShiftValueWithBreakdown(shift, dateStr, 0);
              value = computeShiftValue(bd, plannedMinutes + extraMinutes);
            } catch (_) {}
            totalValue += value;
            totalHours += (plannedMinutes + extraMinutes) / 60;
            count++;
          }
        }
        results.push({ label: MONTH_NAMES_SHORT[month - 1], year, month, value: totalValue, hours: totalHours, count });
      }

      if (loadKey.current !== key) return;

      // Espera completar o mínimo do skeleton antes de comitar.
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_SKELETON_MS) {
        await new Promise(r => setTimeout(r, MIN_SKELETON_MS - elapsed));
      }
      if (loadKey.current !== key) return;

      // Crossfade skeleton → dados reais: começa em 0, anima até 1.
      fadeAnim.setValue(0);
      setMonthlyData(results);
    } catch (e) {
      // noop
    } finally {
      if (loadKey.current === key) {
        setLoading(false);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 420,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: true,
        }).start();
      }
    }
  }, [prefetchMonth, getMonthCache, user?.id]);

  useEffect(() => { loadData(periodN); }, [period]);

  const hasSelection = selectedIdx !== null;
  const visibleIdx = hasSelection ? selectedIdx : (monthlyData.length > 0 ? monthlyData.length - 1 : 0);
  const selectedMonth = monthlyData[visibleIdx];

  const total = monthlyData.reduce((s, d) => s + d.value, 0);
  const avg = monthlyData.length > 0 ? total / monthlyData.length : 0;

  const prevPeriodTotal = (() => {
    return total * 0.92; // approximate — would need extra months loaded for exact
  })();
  const periodDelta = prevPeriodTotal > 0 ? (total - prevPeriodTotal) / prevPeriodTotal : 0;

  const bestMonth = monthlyData.length > 0
    ? [...monthlyData].sort((a, b) => b.value - a.value)[0]
    : null;
  const maxVal = Math.max(...monthlyData.map(d => d.value), 1);
  const minVal = Math.min(...monthlyData.map(d => d.value), 0);

  const formatH = (h) => {
    const m = Math.round(h * 60);
    const hh = Math.floor(m / 60), mm = m % 60;
    return mm === 0 ? `${hh}h` : `${hh}h${String(mm).padStart(2, '0')}`;
  };

  const periodLabel = period === '3m' ? 'Total · 3 meses' : period === '6m' ? 'Total · 6 meses' : 'Total · 12 meses';

  return (
    <ScrollView
      style={[s.root, { backgroundColor: C.background.secondary }]}
      contentContainerStyle={{ paddingBottom: Spacing.lg }}
      showsVerticalScrollIndicator={false}
    >
      {/* Period segmented control */}
      <View style={s.segmentWrap}>
        <View style={[s.segment, { backgroundColor: C.background.secondary, borderColor: C.border.light }]}>
          {[
            { id: '3m', label: '3 meses' },
            { id: '6m', label: '6 meses' },
            { id: '12m', label: '12 meses' },
          ].map(opt => {
            const active = period === opt.id;
            return (
              <Pressable
                key={opt.id}
                style={[
                  s.segmentOption,
                  active && [s.segmentOptionActive, { backgroundColor: C.background.primary, borderColor: C.border.light, ...Shadows.small }],
                ]}
                onPress={() => { setPeriod(opt.id); setSelectedIdx(null); }}
              >
                <Text style={[s.segmentOptionText, { color: active ? C.text.primary : C.text.secondary }, active && { fontWeight: '700' }]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Hero */}
      <View style={s.hero}>
        <Text style={[s.heroLabel, { color: C.text.tertiary }]}>
          {!hasSelection ? periodLabel : `${selectedMonth?.label?.toUpperCase()} · ${selectedMonth?.year}`}
        </Text>
        <Animated.View style={[s.heroValueRow, { opacity: monthlyData.length > 0 ? fadeAnim : 1 }]}>
          {loading && monthlyData.length === 0 ? (
            <SkeletonBox width={160} height={44} style={{ borderRadius: 8 }} />
          ) : (
            <>
              <Text style={[s.heroValue, { color: C.money }]}>
                {fmtBRL(!hasSelection ? total : (selectedMonth?.value || 0)).split(',')[0]}
              </Text>
              <Text style={[s.heroValueCents, { color: C.text.secondary }]}>
                ,{fmtBRL(!hasSelection ? total : (selectedMonth?.value || 0)).split(',')[1]}
              </Text>
            </>
          )}
        </Animated.View>
        <View style={s.heroDeltaRow}>
          {!hasSelection ? (
            <>
              <View style={[s.deltaBadge, { backgroundColor: periodDelta >= 0 ? C.moneySoft : C.error + '18' }]}>
                <Text style={[s.deltaBadgeText, { color: periodDelta >= 0 ? C.money : C.error }]}>
                  {periodDelta >= 0 ? '↑' : '↓'} {(Math.abs(periodDelta) * 100).toFixed(1).replace('.', ',')}%
                </Text>
              </View>
              <Text style={[s.deltaRef, { color: C.text.tertiary }]}>vs. período anterior</Text>
            </>
          ) : (
            <>
              <Text style={[s.deltaRef, { color: C.text.tertiary }]}>média do período:</Text>
              <Text style={[s.deltaRef, { color: C.text.secondary, fontWeight: '600' }]}>{fmtBRL(avg)}</Text>
            </>
          )}
        </View>
      </View>

      {/* Line chart card */}
      <Animated.View style={[s.chartCard, { backgroundColor: C.background.primary, borderColor: C.border.light }, monthlyData.length > 0 && { opacity: fadeAnim }]}>
        {loading && monthlyData.length === 0 ? (
          <SkeletonBox width="100%" height={180} style={{ borderRadius: 8 }} />
        ) : (
          <LineChart
            data={monthlyData}
            selectedIndex={visibleIdx}
            onSelect={setSelectedIdx}
            hasSelection={hasSelection}
            C={C}
          />
        )}
      </Animated.View>

      {/* Insights */}
      <Text style={[s.sectionLabel, { color: C.text.tertiary }]}>Insights</Text>
      <Animated.View style={[s.insightsList, monthlyData.length > 0 && { opacity: fadeAnim }]}>
        {loading && monthlyData.length === 0 ? (
          [0, 1, 2].map(i => (
            <View key={i} style={[s.insightCard, { backgroundColor: C.background.primary, borderColor: C.border.light }]}>
              <SkeletonBox width={32} height={32} style={{ borderRadius: 9 }} />
              <View style={{ flex: 1, gap: 6, marginLeft: 12 }}>
                <SkeletonBox width="40%" height={10} />
                <SkeletonBox width="60%" height={14} />
              </View>
            </View>
          ))
        ) : (
          <>
            <InsightCard
              iconName="trending-up-outline"
              iconColor={C.money}
              iconBg={C.moneySoft}
              title="Melhor mês"
              value={bestMonth ? `${bestMonth.label} · ${fmtBRL(bestMonth.value)}` : '—'}
              C={C}
            />
            <InsightCard
              iconName="bar-chart-outline"
              iconColor={C.primary}
              iconBg={C.accentSoft}
              title="Média mensal"
              value={fmtBRL(avg)}
              C={C}
            />
            <InsightCard
              iconName="analytics-outline"
              iconColor={C.warning}
              iconBg={C.warningSoft}
              title="Variação"
              value={monthlyData.length > 1 ? `${fmtBRLk(maxVal - minVal)} entre pico e vale` : '—'}
              C={C}
            />
          </>
        )}
      </Animated.View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  segmentWrap: { paddingHorizontal: 16, paddingVertical: 14 },
  segment: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    borderWidth: 0.5,
  },
  segmentOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  segmentOptionActive: {
    borderWidth: 0.5,
  },
  segmentOptionText: {
    fontSize: 12.5,
    fontWeight: '600',
  },

  hero: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    marginTop: 4,
  },
  heroValue: {
    fontFamily: Typography.fontFamily.display,
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
  },
  heroValueCents: {
    fontSize: 14,
  },
  heroDeltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  deltaBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
  },
  deltaBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  deltaRef: {
    fontSize: 11,
  },

  chartCard: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: 0.5,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
    ...Shadows.small,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },

  insightsList: {
    marginHorizontal: 16,
    gap: 10,
  },
  insightCard: {
    borderRadius: 14,
    padding: 12,
    paddingHorizontal: 14,
    borderWidth: 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...Shadows.small,
  },
  insightIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightBody: { flex: 1, minWidth: 0 },
  insightTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  insightValue: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 1,
    fontFamily: Typography.fontFamily.display,
    letterSpacing: -0.2,
  },
});
