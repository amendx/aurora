import React, { useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Animated,
  Dimensions,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { useShifts } from '../contexts/ShiftsContext';
import { useColors, Typography, Spacing, Shadows } from '../constants/DesignSystem';
import Logger from '../utils/Logger';
import ShiftBottomSheet from '../components/ShiftBottomSheet';
import LocalCache from '../services/LocalCache';
import { getShiftValues, getFullShiftConfig, calculateShiftValueSync } from '../utils/ShiftValueCalculator';
import { getGroupColors } from '../utils/GroupColorConfig';
import TodayCoworkersService from '../services/TodayCoworkersService';
import TimeUtils from '../utils/TimeUtils';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTHS_FULL_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEKDAY_SHORT  = ['D','S','T','Q','Q','S','S'];
const SHIFT_TYPE_COLOR = { M: '#3FA9A7', T: '#97CAFC', N: '#5B6FBF', D: '#5B6FBF', FN: '#E08A00' };
const LABEL_MAP = { M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite', FN: 'Sex. Noite' };

const fmtBRLk = (v) => {
  if (!v || isNaN(v)) return 'R$ —';
  if (v >= 1000) return 'R$ ' + (v / 1000).toFixed(1).replace('.', ',') + 'k';
  return 'R$ ' + v.toFixed(2).replace('.', ',');
};

const parseShiftTime = (timeStr) => {
  if (!timeStr) return null;
  const norm = s => s.replace(/h/i, ':').replace(/\s*\([^)]*\)/, '').trim();
  let parts = timeStr.split(' – ');
  if (parts.length !== 2) parts = timeStr.split(' - ');
  if (parts.length !== 2) return null;
  return `${norm(parts[0])}–${norm(parts[1])}`;
};

const formatHours = (decimalHours) => {
  if (!decimalHours) return '0h';
  const totalMin = Math.round(decimalHours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
};

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
  return <Animated.View style={[{ width, height, backgroundColor: '#90a4ae', borderRadius: 6, opacity }, style]} />;
};

// ─────────────────────────────────────────────────────────────────────────────

const CalendarScreen = ({ navigation }) => {
  useContext(AuthContext);
  const { user } = useContext(AuthContext);
  const {
    daysWithShifts,
    loading,
    loadedFor,
    loadMonthlyShifts,
    hoursReport,
    persistTimeEntries,
    refreshMonthSummary,
    monthSummary: contextSummary,
  } = useShifts();
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);

  const userId = user?.id || user?.data?.id || 0;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [isNavigating, setIsNavigating] = useState(false);
  const [bottomSheetVisible, setBottomSheetVisible] = useState(false);
  const [selectedDayData, setSelectedDayData] = useState(null);
  const [shiftValues, setShiftValues] = useState(null);
  const [loyaltyConfig, setLoyaltyConfig] = useState(null);
  const [, setExtraHours] = useState(0);
  const [cachedSummary, setCachedSummary] = useState(null);
  const monthSummary = contextSummary || cachedSummary;
  const [groupColors, setGroupColors] = useState({});

  const navigationTimeoutRef = useRef(null);
  const isNavigatingRef = useRef(false);
  const pendingDateRef = useRef(null);
  const targetMonthKeyRef = useRef(null);

  // Load supporting data
  useEffect(() => {
    getShiftValues().then(v => setShiftValues(v)).catch(() => {});
    getFullShiftConfig().then(cfg => setLoyaltyConfig(cfg)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!userId) return;
    getGroupColors(userId).then(c => setGroupColors(c || {})).catch(() => {});
  }, [userId]);

  // Load month summary from cache when data or month changes
  useEffect(() => {
    if (!userId) return;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    LocalCache.getSummary(userId, monthKey).then(s => s && setCachedSummary(s)).catch(() => {});
  }, [userId, currentDate.getFullYear(), currentDate.getMonth(), daysWithShifts]);

  // Initial data load
  useEffect(() => {
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();
    const key = `${year}-${month}`;
    if (!isNavigatingRef.current && loadedFor !== key) {
      loadMonthlyShifts(month, year);
    }
    return () => { if (navigationTimeoutRef.current) clearTimeout(navigationTimeoutRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear navigation loading once the context confirms data loaded
  useEffect(() => {
    if (loadedFor && loadedFor === targetMonthKeyRef.current) {
      setIsNavigating(false);
      targetMonthKeyRef.current = null;
    }
  }, [loadedFor]);

  // ── Debounced month navigation ────────────────────────────────────────────────
  const navigateToMonth = useCallback((targetDate) => {
    if (navigationTimeoutRef.current) clearTimeout(navigationTimeoutRef.current);
    setCurrentDate(targetDate);
    setIsNavigating(true);
    pendingDateRef.current = targetDate;
    isNavigatingRef.current = true;
    targetMonthKeyRef.current = `${targetDate.getFullYear()}-${targetDate.getMonth() + 1}`;
    navigationTimeoutRef.current = setTimeout(() => {
      const month = pendingDateRef.current.getMonth() + 1;
      const year = pendingDateRef.current.getFullYear();
      loadMonthlyShifts(month, year);
      isNavigatingRef.current = false;
      pendingDateRef.current = null;
    }, 500);
  }, [loadMonthlyShifts]);

  const goToPreviousMonth = useCallback(() => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() - 1);
    navigateToMonth(d);
  }, [currentDate, navigateToMonth]);

  const goToNextMonth = useCallback(() => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + 1);
    navigateToMonth(d);
  }, [currentDate, navigateToMonth]);

  // ── Calculated data ───────────────────────────────────────────────────────────
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const allShifts = useMemo(() => (daysWithShifts || []).flatMap(d => d.shifts || []), [daysWithShifts]);

  const upcomingShifts = useMemo(() => allShifts.filter(s => new Date(s.date + 'T00:00:00') >= today), [allShifts, today]);

  const nextShift = upcomingShifts[0] || null;
  const nextShifts = useMemo(() => {
    if (!nextShift) return [];
    return upcomingShifts.filter(s => s.date === nextShift.date);
  }, [nextShift, upcomingShifts]);

  const shiftTypesByDay = useMemo(() => {
    const map = {};
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    (daysWithShifts || []).forEach(dayData => {
      const d = new Date(dayData.date + 'T00:00:00');
      if (d.getFullYear() !== year || d.getMonth() + 1 !== month) return;
      const day = d.getDate();
      const seen = new Set();
      (dayData.shifts || []).forEach(shift => {
        const k = shift.carryover ? 'D' : (shift.label?.charAt(0) || 'M');
        seen.add(k);
      });
      map[day] = [...seen];
    });
    return map;
  }, [daysWithShifts, currentDate]);

  const stats = useMemo(() => ({
    totalShifts: (daysWithShifts || []).reduce((sum, d) => sum + (d.shifts || []).length, 0),
    totalHours: hoursReport?.standardHours || 0,
  }), [daysWithShifts, hoursReport]);

  const projected = monthSummary
    ? (monthSummary.totalGrossValue || 0) + (monthSummary.totalLoyaltyValue || 0) + (monthSummary.totalBonusValue || 0)
    : null;

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const resolveGroupColor = (shift) => {
    const raw = groupColors[String(shift.group?.id)] || shift.group?.color;
    return raw ? (raw.startsWith('#') ? raw : `#${raw}`) : C.primary;
  };

  const handleDayPress = (dayNum) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const dayData = daysWithShifts?.find(d => d.date === dateStr);
    const selectedDate = new Date(year, month - 1, dayNum);
    if (navigation?.navigate) {
      navigation.navigate('DayView', { date: selectedDate });
    } else if (dayData?.shifts?.length) {
      setSelectedDayData({ date: selectedDate, shifts: dayData.shifts });
      setBottomSheetVisible(true);
    }
  };

  const handleNextShiftTap = (shift) => {
    if (!shift) return;
    if (navigation?.navigate) {
      navigation.navigate('DayView', { date: new Date(shift.date + 'T00:00:00') });
    } else {
      const dayData = (daysWithShifts || []).find(d => d.date === shift.date);
      setSelectedDayData({
        date: new Date(shift.date + 'T00:00:00'),
        shifts: dayData?.shifts || [shift],
      });
      setBottomSheetVisible(true);
    }
  };

  const handleCloseBottomSheet = () => {
    setBottomSheetVisible(false);
    setSelectedDayData(null);
  };

  const calculateShiftValueForBottomSheet = (shift, dateString) => calculateShiftValueSync(shift, dateString, shiftValues);

  const calculateExtraHours = async () => {
    try {
      let totalExtras = 0;
      if (!daysWithShifts) return 0;
      for (const day of daysWithShifts) {
        if (!day.shifts) continue;
        const dateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(new Date(day.date + 'T00:00:00').getDate()).padStart(2, '0')}`;
        const saved = await SecureStore.getItemAsync(`real_hours_${dateKey}`);
        if (!saved) continue;
        const realHours = JSON.parse(saved);
        day.shifts.forEach((shift, index) => {
          const entry = realHours[index];
          if (!entry?.startTime || !entry?.endTime) return;
          let parts = (shift.time || '').split(' – ');
          if (parts.length !== 2) parts = (shift.time || '').split(' - ');
          if (parts.length !== 2) return;
          const [ps, pe] = parts.map(t => t.replace(/\s*\([^)]*\)/, '').trim());
          const predictedMin = TimeUtils.calculateDurationMinutes(ps, pe);
          const realMin = TimeUtils.calculateDurationMinutes(entry.startTime, entry.endTime);
          if (predictedMin != null && realMin != null) totalExtras += (realMin - predictedMin) / 60;
        });
      }
      return totalExtras;
    } catch { return 0; }
  };

  const handleHoursChanged = async (dateKey, newHours) => {
    try {
      const newExtra = await calculateExtraHours();
      setExtraHours(newExtra);
    } catch {}
    try {
      const dayData = (daysWithShifts || []).find(d => d.date === dateKey);
      if (dayData?.shifts && newHours) await persistTimeEntries(dateKey, newHours, dayData.shifts);
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      await refreshMonthSummary(month, year);
      // Reload summary from cache
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      LocalCache.getSummary(userId, monthKey).then(s => s && setCachedSummary(s)).catch(() => {});
    } catch (err) {
      Logger.warn('CalendarScreen: summary refresh error:', err?.message);
    }
  };

  const handleNavigateToGroup = (group) => {
    if (navigation?.navigate && group?.id) {
      handleCloseBottomSheet();
      setTimeout(() => navigation.navigate('GroupsScreen', { focusGroupId: group.id }), 300);
    }
  };

  // ── Render: Month header ──────────────────────────────────────────────────────
  const renderMonthHeader = () => {
    const year = currentDate.getFullYear();
    const monthName = MONTHS_FULL_PT[currentDate.getMonth()];
    return (
      <View style={s.monthHeader}>
        <View>
          <Text style={s.yearLabel}>{year}</Text>
          <Text style={s.monthName}>{monthName}</Text>
        </View>
        <View style={s.navRow}>
          <Pressable onPress={goToPreviousMonth} style={s.navBtn}>
            <Ionicons name="chevron-back" size={16} color={C.text.primary} />
          </Pressable>
          <Pressable onPress={goToNextMonth} style={s.navBtn}>
            <Ionicons name="chevron-forward" size={16} color={C.text.primary} />
          </Pressable>
        </View>
      </View>
    );
  };

  // ── Render: Weekday row ───────────────────────────────────────────────────────
  const renderWeekdayRow = () => (
    <View style={s.weekdayRow}>
      {WEEKDAY_SHORT.map((w, i) => (
        <View key={i} style={s.weekdayCell}>
          <Text style={s.weekdayText}>{w}</Text>
        </View>
      ))}
    </View>
  );

  // ── Render: Day grid ──────────────────────────────────────────────────────────
  const renderDayGrid = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const todayDay = today.getFullYear() === year && today.getMonth() + 1 === month ? today.getDate() : -1;

    const cells = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push(<View key={`e-${i}`} style={s.dayCell} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = day === todayDay;
      const types = shiftTypesByDay[day] || [];
      const hasShifts = types.length > 0;
      const colIndex = (firstDayOfWeek + day - 1) % 7;
      const isWeekend = colIndex === 0 || colIndex === 6;

      let cellBg = null;
      if (isToday) {
        cellBg = C.primary;
      } else if (types.length >= 2) {
        cellBg = C.primary + '24';
      } else if (types.length === 1) {
        cellBg = (SHIFT_TYPE_COLOR[types[0]] || C.primary) + '20';
      }

      cells.push(
        <Pressable
          key={day}
          onPress={() => handleDayPress(day)}
          style={({ pressed }) => [
            s.dayCell,
            cellBg && { backgroundColor: cellBg, borderRadius: 8 },
            pressed && { opacity: 0.7 },
          ]}
        >
          {loading || isNavigating
            ? <SkeletonBox width={22} height={14} style={{ borderRadius: 4 }} />
            : (
              <>
                <Text style={[
                  s.dayCellText,
                  isToday && { color: '#fff', fontFamily: Typography.fontFamily.bold },
                  !isToday && hasShifts && { fontFamily: Typography.fontFamily.bold },
                  !isToday && isWeekend && !hasShifts && { color: C.text.tertiary },
                ]}>
                  {day}
                </Text>
                {hasShifts && (
                  <View style={s.dayCellDots}>
                    {types.slice(0, 3).map((k, di) => (
                      <View key={di} style={[s.dot, { backgroundColor: isToday ? 'rgba(255,255,255,0.7)' : (SHIFT_TYPE_COLOR[k] || C.primary) }]} />
                    ))}
                  </View>
                )}
              </>
            )
          }
        </Pressable>
      );
    }

    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      const rowCells = cells.slice(i, i + 7);
      while (rowCells.length < 7) rowCells.push(<View key={`tail-${rowCells.length}`} style={s.dayCell} />);
      rows.push(<View key={i} style={s.dayRow}>{rowCells}</View>);
    }

    return <View style={s.dayGrid}>{rows}</View>;
  };

  // ── Render: Legend ────────────────────────────────────────────────────────────
  const renderLegend = () => {
    const items = [
      { key: 'M', label: 'Manhã' },
      { key: 'T', label: 'Tarde' },
      { key: 'N', label: 'Noite' },
      { key: 'multi', label: 'Múltiplos', color: C.primary + '24', border: C.primary + '60' },
    ];
    return (
      <View style={s.legend}>
        {items.map(({ key, label, color, border }) => {
          const bg = color || (SHIFT_TYPE_COLOR[key] + '20');
          const bd = border || (SHIFT_TYPE_COLOR[key] + '50');
          return (
            <View key={key} style={s.legendItem}>
              <View style={[s.legendSwatch, { backgroundColor: bg, borderColor: bd }]} />
              <Text style={s.legendLabel}>{label}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  // ── Render: Section label ─────────────────────────────────────────────────────
  const renderSectionLabel = (label, top = false) => (
    <View style={[s.sectionLabelWrap, top && { marginTop: 22 }]}>
      <Text style={s.sectionLabel}>{label}</Text>
    </View>
  );

  // ── Render: Summary card ──────────────────────────────────────────────────────
  const renderSummaryCard = () => (
    <View style={s.summaryCard}>
      <View style={s.summaryTopRow}>
        <Text style={s.summaryEarningsLabel}>Ganhos previstos</Text>
        <Text style={s.summaryEarnings}>
          {loading ? '—' : projected != null ? fmtBRLk(projected) : '—'}
        </Text>
      </View>
      <View style={s.summaryDivider} />
      <View style={s.summaryStatsRow}>
        <View style={s.summaryStat}>
          <Text style={s.summaryStatLabel}>Plantões</Text>
          <Text style={s.summaryStatValue}>{loading ? '—' : stats.totalShifts}</Text>
        </View>
        <View style={[s.summaryStat, { borderLeftWidth: 0.5, borderLeftColor: C.border.light }]}>
          <Text style={s.summaryStatLabel}>Horas</Text>
          <Text style={s.summaryStatValue}>{loading ? '—' : formatHours(stats.totalHours)}</Text>
        </View>
        <View style={[s.summaryStat, { borderLeftWidth: 0.5, borderLeftColor: C.border.light }]}>
          {(() => {
            const totalHours = stats.totalHours ?? 0;
            const tiers = loyaltyConfig?.loyaltyOptions;
            const earnedTier = tiers?.length > 0
              ? [...tiers].sort((a, b) => b.minHours - a.minHours).find(o => totalHours >= o.minHours)
              : null;
            return earnedTier ? (
              <>
                <Text style={s.summaryStatLabel}>Fideliz.</Text>
                <Text style={[s.summaryStatValue, { color: C.money }]}>{loading ? '—' : `${earnedTier.percentage}%`}</Text>
              </>
            ) : (
              <>
                <Text style={s.summaryStatLabel}>Restam</Text>
                <Text style={[s.summaryStatValue, { color: C.warning }]}>{loading ? '—' : upcomingShifts.length}</Text>
              </>
            );
          })()}
        </View>
      </View>
    </View>
  );

  // ── Render: Compact shift card (Próximo) ──────────────────────────────────────
  const renderNextShiftCard = (shift) => {
    if (!shift) return null;
    const d = new Date(shift.date + 'T00:00:00');
    const typeKey = shift.carryover ? 'D' : (shift.label?.charAt(0) || 'M');
    const badgeColor = SHIFT_TYPE_COLOR[typeKey] || C.primary;
    const groupColor = resolveGroupColor(shift);
    const value = calculateShiftValueSync(shift, shift.date, shiftValues);
    const timeStr = parseShiftTime(shift.time);
    const typeLabel = LABEL_MAP[typeKey] || 'Plantão';

    // Coworkers
    let coworkers = TodayCoworkersService.getCoworkers(shift.id);
    if (coworkers.length === 0 && shift?.originalData?.coworkers?.length > 0) {
      coworkers = shift.originalData.coworkers;
    }
    const vacancies = TodayCoworkersService.getVacanciesByGroup(shift.id);
    const totalVacancies = vacancies.reduce((acc, v) => acc + (v.available ?? 0), 0);

    return (
      <Pressable
        style={({ pressed }) => [s.compactCard, pressed && { opacity: 0.85 }]}
        onPress={() => handleNextShiftTap(shift)}
      >
        {/* Left accent bar */}
        <View style={[s.compactAccentBar, { backgroundColor: groupColor }]} />

        {/* Date column */}
        <View style={s.compactDateCol}>
          <Text style={s.compactDay}>{d.getDate()}</Text>
          <Text style={s.compactWeekday}>
            {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
          </Text>
        </View>

        {/* Info column */}
        <View style={s.compactInfoCol}>
          <View style={s.compactTopRow}>
            <View style={[s.typeBadge, { backgroundColor: badgeColor + '1f' }]}>
              <Text style={[s.typeBadgeText, { color: badgeColor }]}>{typeLabel}</Text>
            </View>
            {timeStr && <Text style={s.compactTime}>{timeStr}</Text>}
          </View>
          {shift.group?.institution?.name && (
            <Text style={s.compactInstitution} numberOfLines={1}>
              {shift.group.institution.name}
            </Text>
          )}
          <View style={s.compactMeta}>
            {shift.group?.name && (
              <>
                <View style={[s.groupDot, { backgroundColor: groupColor }]} />
                <Text style={s.groupName} numberOfLines={1}>{shift.group.name}</Text>
              </>
            )}
            {coworkers.length > 0 && (
              <View style={s.coworkerStack}>
                {coworkers.slice(0, 3).map((p, i) => (
                  <View key={p.id || i} style={[s.coworkerAvatar, { marginLeft: i === 0 ? 6 : -5, backgroundColor: C.accentSoft }]}>
                    {p.photo
                      ? <Image source={{ uri: p.photo }} style={s.coworkerAvatarImg} />
                      : <Text style={[s.coworkerInitial, { color: C.primary }]}>{(p.name || '?').charAt(0).toUpperCase()}</Text>
                    }
                  </View>
                ))}
                {coworkers.length > 3 && (
                  <View style={[s.coworkerAvatar, { marginLeft: -5, backgroundColor: C.background.secondary }]}>
                    <Text style={[s.coworkerInitial, { color: C.text.secondary }]}>+{coworkers.length - 3}</Text>
                  </View>
                )}
                {totalVacancies > 0 && Array.from({ length: Math.min(totalVacancies, 2) }).map((_, i) => (
                  <View key={`v-${i}`} style={[s.coworkerAvatar, { marginLeft: -5, backgroundColor: C.warningSoft, borderColor: C.warning, borderWidth: 1, borderStyle: 'dashed' }]}>
                    <Text style={[s.coworkerInitial, { color: C.warning }]}>+</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Value column */}
        <View style={s.compactValueCol}>
          {value > 0 && <Text style={s.compactValue}>{fmtBRLk(value)}</Text>}
          <Ionicons name="chevron-forward" size={14} color={C.text.tertiary} />
        </View>
      </Pressable>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <>
      <ScrollView
        style={[s.container]}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl + 70 }}
        showsVerticalScrollIndicator={false}
      >
        {renderMonthHeader()}
        {renderWeekdayRow()}
        {renderDayGrid()}
        {renderLegend()}

        {renderSectionLabel('Resumo do mês', true)}
        <View style={s.sectionPad}>
          {renderSummaryCard()}
        </View>

        {nextShifts.length > 0 && (
          <>
            {renderSectionLabel('Próximo', true)}
            <View style={[s.sectionPad, { gap: 10 }]}>
              {nextShifts.map((shift, i) => <View key={shift.id ?? i}>{renderNextShiftCard(shift)}</View>)}
            </View>
          </>
        )}
      </ScrollView>

      <ShiftBottomSheet
        isVisible={bottomSheetVisible}
        onClose={handleCloseBottomSheet}
        shifts={selectedDayData?.shifts || []}
        selectedDate={selectedDayData?.date || null}
        calculateShiftValue={calculateShiftValueForBottomSheet}
        onHoursChanged={handleHoursChanged}
        onNavigateToGroup={handleNavigateToGroup}
      />
    </>
  );
};

const makeStyles = (C) => {
  const GRID_PAD = Spacing.screen;
  const CELL_GAP = 3;
  const CELL_TOTAL = Math.floor((SCREEN_W - GRID_PAD * 2 - CELL_GAP * 6) / 7);
  const CELL_H = CELL_TOTAL; // square

  return {
    container: {
      flex: 1,
      backgroundColor: C.background.primary,
    },

    // ── Month header ──────────────────────────────────────────────────────────
    monthHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      paddingHorizontal: Spacing.screen,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.md,
    },
    yearLabel: {
      fontSize: 11,
      fontFamily: Typography.fontFamily.semiBold,
      color: C.text.tertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 2,
    },
    monthName: {
      fontSize: 28,
      fontFamily: Typography.fontFamily.display,
      color: C.text.primary,
      letterSpacing: -0.6,
      lineHeight: 32,
    },
    navRow: {
      flexDirection: 'row',
      gap: 6,
    },
    navBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: C.background.elevated,
      borderWidth: 0.5,
      borderColor: C.border.light,
      alignItems: 'center',
      justifyContent: 'center',
      ...Shadows.small,
    },

    // ── Weekday row ───────────────────────────────────────────────────────────
    weekdayRow: {
      flexDirection: 'row',
      gap: CELL_GAP,
      paddingHorizontal: GRID_PAD,
      paddingBottom: Spacing.xs,
    },
    weekdayCell: {
      width: CELL_TOTAL,
      alignItems: 'center',
    },
    weekdayText: {
      fontSize: 10,
      fontFamily: Typography.fontFamily.semiBold,
      color: C.text.tertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },

    // ── Day grid ──────────────────────────────────────────────────────────────
    dayGrid: {
      paddingHorizontal: GRID_PAD,
    },
    dayRow: {
      flexDirection: 'row',
      gap: CELL_GAP,
      marginBottom: CELL_GAP,
    },
    dayCell: {
      width: CELL_TOTAL,
      height: CELL_H,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 2,
    },
    dayCellText: {
      fontSize: 14,
      fontFamily: Typography.fontFamily.regular,
      color: C.text.primary,
      lineHeight: 17,
    },
    dayCellDots: {
      flexDirection: 'row',
      gap: 2,
      marginTop: 2,
    },
    dot: {
      width: 4,
      height: 4,
      borderRadius: 2,
    },
    // ── Legend ────────────────────────────────────────────────────────────────
    legend: {
      flexDirection: 'row',
      paddingHorizontal: GRID_PAD,
      paddingTop: 8,
      paddingBottom: 4,
      gap: 14,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    legendSwatch: {
      width: 10,
      height: 10,
      borderRadius: 3,
      borderWidth: 1,
    },
    legendLabel: {
      fontSize: 10,
      fontFamily: Typography.fontFamily.regular,
      color: C.text.tertiary,
    },

    // ── Section label ─────────────────────────────────────────────────────────
    sectionLabelWrap: {
      paddingHorizontal: Spacing.screen,
      paddingBottom: 8,
    },
    sectionLabel: {
      fontSize: 11.5,
      fontFamily: Typography.fontFamily.semiBold,
      color: C.text.tertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    sectionPad: {
      paddingHorizontal: Spacing.screen,
    },

    // ── Summary card ──────────────────────────────────────────────────────────
    summaryCard: {
      backgroundColor: C.background.elevated,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderWidth: 0.5,
      borderColor: C.border.light,
      ...Shadows.small,
    },
    summaryTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 12,
    },
    summaryEarningsLabel: {
      fontSize: 13,
      fontFamily: Typography.fontFamily.semiBold,
      color: C.text.secondary,
    },
    summaryEarnings: {
      fontSize: 22,
      fontFamily: Typography.fontFamily.display,
      fontWeight: 'bold',
      color: C.money,
      letterSpacing: -0.4,
    },
    summaryDivider: {
      height: 0.5,
      backgroundColor: C.border.light,
      marginBottom: 12,
    },
    summaryStatsRow: {
      flexDirection: 'row',
    },
    summaryStat: {
      flex: 1,
      paddingLeft: 12,
    },
    summaryStatLabel: {
      fontSize: 10,
      fontFamily: Typography.fontFamily.semiBold,
      color: C.text.tertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 2,
    },
    summaryStatValue: {
      fontSize: 17,
      fontFamily: Typography.fontFamily.display,
      fontWeight: 'bold',
      color: C.text.primary,
      letterSpacing: -0.2,
    },

    // ── Compact shift card ────────────────────────────────────────────────────
    compactCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.background.card,
      borderRadius: 14,
      borderWidth: 0.5,
      borderColor: C.border.light,
      paddingVertical: 12,
      paddingRight: 14,
      paddingLeft: 0,
      overflow: 'hidden',
      position: 'relative',
      ...Shadows.small,
    },
    compactAccentBar: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    compactDateCol: {
      alignItems: 'center',
      width: 54,
      paddingLeft: 16,
      paddingRight: 12,
    },
    compactDay: {
      fontSize: 22,
      fontFamily: Typography.fontFamily.display,
      color: C.text.primary,
      letterSpacing: -0.6,
      lineHeight: 24,
    },
    compactWeekday: {
      fontSize: 10,
      fontFamily: Typography.fontFamily.semiBold,
      color: C.text.tertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 2,
    },
    compactInfoCol: {
      flex: 1,
      paddingLeft: 2,
      paddingRight: 4,
    },
    compactTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 2,
    },
    typeBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 5,
    },
    typeBadgeText: {
      fontSize: 9.5,
      fontFamily: Typography.fontFamily.bold,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    compactTime: {
      fontSize: 12,
      fontFamily: Typography.fontFamily.regular,
      color: C.text.secondary,
    },
    compactInstitution: {
      fontSize: 14,
      fontFamily: Typography.fontFamily.semiBold,
      color: C.text.primary,
      marginBottom: 4,
    },
    compactMeta: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    groupDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginRight: 5,
      flexShrink: 0,
    },
    groupName: {
      fontSize: 11,
      fontFamily: Typography.fontFamily.regular,
      fontWeight: 'bold',
      color: C.text.tertiary,
      maxWidth: 100,
    },
    coworkerStack: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 8,
    },
    coworkerAvatar: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: C.background.card,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    coworkerAvatarImg: { width: 18, height: 18 },
    coworkerInitial: {
      fontSize: 7,
      fontFamily: Typography.fontFamily.bold,
    },
    compactValueCol: {
      alignItems: 'flex-end',
      flexShrink: 0,
      paddingRight: 2,
      gap: 2,
    },
    compactValue: {
      fontSize: 14,
      fontFamily: Typography.fontFamily.display,
      color: C.money,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
  };
};

export default CalendarScreen;
