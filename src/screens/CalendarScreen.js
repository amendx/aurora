import React, { useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { useShifts } from '../contexts/ShiftsContext';
import { useOffers } from '../contexts/OffersContext';
import { useOpenings } from '../contexts/OpeningsContext';
import { usePrivacy } from '../contexts/PrivacyContext';
import { registerScrollToTop } from '../utils/scrollToTopBus';
import { useColors, Typography, Spacing, Shadows } from '../constants/DesignSystem';
import Logger from '../utils/Logger';
import ShiftBottomSheet from '../components/ShiftBottomSheet';
import CederFlowSheet from './CederFlowSheet';
import TrocarFlowSheet from './TrocarFlowSheet';
import LocalCache from '../services/LocalCache';
import { getShiftValues, getFullShiftConfig, calculateShiftValueSync, calculateShiftFinalValueSync } from '../utils/ShiftValueCalculator';
import { getMonthTotalValue } from '../utils/MonthSummaryComputer';
import { getGroupColors } from '../utils/GroupColorConfig';
import TodayCoworkersService from '../services/TodayCoworkersService';
import TimeUtils from '../utils/TimeUtils';
import CalendarModePill from '../components/CalendarModePill';
import GroupPickerModal from '../components/GroupPickerModal';
import GroupSummaryCard from '../components/GroupSummaryCard';
import { useGroups } from '../contexts/GroupsContext';
import GroupScheduleService from '../services/GroupScheduleService';
import { getGroupVisibility } from '../utils/GroupVisibilityConfig';
import SkeletonBox from '../components/Skeleton';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTHS_FULL_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEKDAY_SHORT  = ['D','S','T','Q','Q','S','S'];
const SHIFT_TYPE_COLOR = { M: '#3FA9A7', T: '#97CAFC', N: '#5B6FBF', D: '#5B6FBF', FN: '#E08A00' };
const LABEL_MAP = { M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite', FN: 'Sex. Noite' };

const fmtBRLk = (v) => {
  if (!v || isNaN(v)) return 'R$ —';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

const CalendarScreen = ({ navigation }) => {
  useContext(AuthContext);
  const { user, token } = useContext(AuthContext);
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
  const { groups: userGroups } = useGroups();
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);

  const userId = user?.id || user?.data?.id || 0;

  const [calendarMode, setCalendarMode] = useState('mine'); // 'mine' | 'groups'
  // Default: nenhum grupo selecionado ainda — populated quando visibleGroups carregar (1 grupo)
  const [groupSelection, setGroupSelection] = useState(null); // null | Set<groupId> | 'all'
  const [groupSchedules, setGroupSchedules] = useState({}); // groupId → { days, syncedAt }
  const [groupLoading, setGroupLoading] = useState(false);
  const [enabledGroupIds, setEnabledGroupIds] = useState(null); // null = "no config saved → all visible"
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isNavigating, setIsNavigating] = useState(false);
  const [bottomSheetVisible, setBottomSheetVisible] = useState(false);
  const [cedeShift, setCedeShift] = useState(null);
  const [trocarShift, setTrocarShift] = useState(null);
  const [selectedDayData, setSelectedDayData] = useState(null);
  const [shiftValues, setShiftValues] = useState(null);
  const [loyaltyConfig, setLoyaltyConfig] = useState(null);
  const [, setExtraHours] = useState(0);
  const [cachedSummary, setCachedSummary] = useState(null);
  const contextMatchesView = loadedFor === `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}`;
  const monthSummary = (contextMatchesView ? contextSummary : null) || cachedSummary;
  const [groupColors, setGroupColors] = useState({});
  const [timeEntriesByMonth, setTimeEntriesByMonth] = useState({});

  const scrollRef = useRef(null);
  useEffect(() => registerScrollToTop('calendar', () => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  }), []);

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

  useEffect(() => {
    if (!userId) return;
    getGroupVisibility(userId)
      .then(cfg => setEnabledGroupIds(cfg?.enabledGroupIds ? cfg.enabledGroupIds.map(String) : null))
      .catch(() => {});
  }, [userId]);

  // Load month summary from cache when data or month changes
  useEffect(() => {
    if (!userId) return;
    setCachedSummary(null);
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    LocalCache.getSummary(userId, monthKey).then(s => setCachedSummary(s || null)).catch(() => {});
  }, [userId, currentDate.getFullYear(), currentDate.getMonth(), daysWithShifts]);

  // Load time-entries for current + next + currently-viewed month so the
  // summary's "Horas extras" totalizer stays accurate as the user navigates.
  // Reads from LocalCache first, then merges SecureStore entries as fallback
  // (DayViewScreen saves to SecureStore only, not LocalCache).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const uid = String(userId);
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextKey = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    const viewKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    const keys = Array.from(new Set([monthKey, nextKey, viewKey]));

    (async () => {
      const maps = await Promise.all(keys.map(k => LocalCache.getTimeEntries(userId, k).catch(() => ({}))));
      const next = {};
      keys.forEach((k, i) => { next[k] = maps[i] || {}; });

      // Merge SecureStore entries for viewed month (covers hours registered
      // from DayViewScreen which writes to SecureStore but not LocalCache).
      const viewEntries = { ...(next[viewKey] || {}) };
      for (const d of (daysWithShifts || [])) {
        const shifts = d.shifts || [];
        const needsLookup = shifts.some(sh => !viewEntries[sh.id]?.actualDurationMinutes);
        if (!needsLookup) continue;
        try {
          const raw = (uid && await SecureStore.getItemAsync(`real_hours_${uid}_${d.date}`))
            || await SecureStore.getItemAsync(`real_hours_${d.date}`);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          shifts.forEach((shift, i) => {
            if (viewEntries[shift.id]?.actualDurationMinutes) return;
            const rh = parsed[i];
            if (!rh?.startTime || !rh?.endTime) return;
            const mins = TimeUtils.calculateDurationMinutes(rh.startTime, rh.endTime);
            if (mins != null && mins > 0) {
              viewEntries[shift.id] = {
                shiftId: shift.id,
                actualDurationMinutes: mins,
                actualStart: rh.startTime,
                actualEnd: rh.endTime,
              };
            }
          });
        } catch {}
      }
      next[viewKey] = viewEntries;

      if (!cancelled) setTimeEntriesByMonth(next);
    })();

    return () => { cancelled = true; };
  }, [userId, currentDate.getFullYear(), currentDate.getMonth(), loadedFor]);

  useEffect(() => {
    if (!userId || !navigation?.addListener) return;
    const unsubscribe = navigation.addListener('focus', () => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      LocalCache.getSummary(userId, monthKey).then(s => setCachedSummary(s || null)).catch(() => {});
      LocalCache.getTimeEntries(userId, monthKey).then(te => {
        setTimeEntriesByMonth(prev => ({ ...prev, [monthKey]: te || {} }));
      }).catch(() => {});
    });
    return unsubscribe;
  }, [navigation, userId, currentDate.getFullYear(), currentDate.getMonth()]);

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

  // ── Group mode: derive active groups + load group schedules ───────────────────
  // Visible groups respect the user's GroupVisibilityConfig (same config used by
  // "Quem está também" / TodayCoworkersService). null config = all visible.
  const visibleGroups = useMemo(() => {
    const list = (userGroups || []).filter(g => g?.id);
    if (!enabledGroupIds) return list;
    return list.filter(g => enabledGroupIds.some(id => id === String(g.id)));
  }, [userGroups, enabledGroupIds]);

  // Quando visibleGroups carrega pela primeira vez, defaulta seleção para o primeiro grupo
  useEffect(() => {
    if (groupSelection !== null) return;
    if (visibleGroups.length === 0) return;
    setGroupSelection(new Set([String(visibleGroups[0].id)]));
  }, [visibleGroups, groupSelection]);

  const activeGroups = useMemo(() => {
    if (groupSelection === 'all') return visibleGroups;
    if (!(groupSelection instanceof Set) || groupSelection.size === 0) {
      // ainda não inicializado ou vazio → mostra apenas o primeiro pra evitar carregar tudo
      return visibleGroups.slice(0, 1);
    }
    return visibleGroups.filter(g => groupSelection.has(String(g.id)));
  }, [visibleGroups, groupSelection]);

  const viewMonthKey = useMemo(
    () => `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`,
    [currentDate]
  );

  useEffect(() => {
    if (calendarMode !== 'groups' || activeGroups.length === 0) return;
    let cancelled = false;
    const liveUnsub = GroupScheduleService.subscribeMultipleMonths({
      groups: activeGroups,
      monthKey: viewMonthKey,
      currentUserId: userId,
      onChange: (result) => {
        const hasAny = Object.values(result || {}).some(r => Object.keys(r?.days || {}).length > 0);
        if (!cancelled && hasAny) setGroupSchedules(result);
      },
      onError: (err) => Logger.warn(`[CalendarScreen] group live: ${err?.message}`),
    });
    setGroupLoading(true);
    (async () => {
      try {
        const result = await GroupScheduleService.getMultipleMonths({
          groups: activeGroups,
          monthKey: viewMonthKey,
          token,
          userSource: user?.source,
          auroraOnlyMode: user?.auroraOnlyMode === true,
          currentUserId: userId,
          force: true,
        });
        await GroupScheduleService.enrichWithPendingOffers(result, userId);
        await GroupScheduleService.enrichWithPendingSwaps(result, userId);  // CalendarScreen: Firestore-only (no OffersContext access here)
        if (!cancelled) setGroupSchedules(result);
      } catch (err) {
        Logger.warn(`[CalendarScreen] group load: ${err?.message}`);
      } finally {
        if (!cancelled) setGroupLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      liveUnsub?.();
    };
  }, [calendarMode, viewMonthKey, activeGroups.map(g => g.id).join(','), token, user?.source, userId]);

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

  // Dia → ação pendente (troca/cessão direcionada/cessão ao grupo) pra marcar
  // no calendário. Modo pessoal só. Prioridade: troca > oferta > cessão.
  const { swapsSent, swapsReceived, offersSent } = useOffers();
  const { myCededOpenings } = useOpenings();
  const { valuesHidden } = usePrivacy();
  const pendingByDay = useMemo(() => {
    const byShift = {};
    (swapsSent || []).forEach(sw => { if (sw?.status === 'pending' && sw.shiftA?.id) byShift[String(sw.shiftA.id)] = { kind: 'swap', role: 'initiator' }; });
    (swapsReceived || []).forEach(sw => { if (sw?.status === 'pending' && sw.shiftB?.id) byShift[String(sw.shiftB.id)] = { kind: 'swap', role: 'target' }; });
    (offersSent || []).forEach(o => { if (o?.status === 'pending' && o.shiftSnapshot?.id) byShift[String(o.shiftSnapshot.id)] = { kind: 'offer', role: 'sender' }; });

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    const map = {};
    (daysWithShifts || []).forEach(dayData => {
      const d = new Date(dayData.date + 'T00:00:00');
      if (d.getFullYear() !== year || d.getMonth() + 1 !== month) return;
      const day = d.getDate();
      (dayData.shifts || []).forEach(sh => {
        const p = byShift[String(sh.id)] || (sh._pendingCede ? { kind: 'cede' } : null);
        if (p && !map[day]) map[day] = p;
      });
    });
    // Cessões ao grupo (somem do calendário) — marca o dia mesmo assim.
    (myCededOpenings || []).forEach(o => {
      if (o.status && o.status !== 'active') return;
      const dk = o.dateKey || (o.startISO || '').slice(0, 10);
      if (!dk.startsWith(monthPrefix)) return;
      const day = Number(dk.slice(8, 10));
      if (!map[day]) map[day] = { kind: 'cede' };
    });
    return map;
  }, [swapsSent, swapsReceived, offersSent, myCededOpenings, daysWithShifts, currentDate]);

  // Group mode: dots + vacancy flag per day + pending-offer-for-me flag.
  // Derives ONLY from groups currently selected (activeGroups). This way the
  // totalizers reflect the chip selection even if groupSchedules retains data
  // from a previous selection load (e.g. all groups → one group).
  const activeGroupIds = useMemo(
    () => activeGroups.map(g => String(g.id)),
    [activeGroups]
  );

  const groupTypesByDay = useMemo(() => {
    const map = {}; // day → { types: Set, hasVacancy: bool, hasPendingForMe: bool }
    for (const gid of activeGroupIds) {
      const days = groupSchedules[gid]?.days || {};
      for (const [dateStr, schedule] of Object.entries(days)) {
        const day = Number(dateStr.slice(8, 10));
        if (!map[day]) map[day] = { types: new Set(), hasVacancy: false, hasPendingForMe: false };
        for (const slot of (schedule?.slots || [])) {
          if ((slot.assignments?.length || 0) > 0) map[day].types.add(slot.label);
          if ((slot.available || 0) > 0) map[day].hasVacancy = true;
          for (const a of (slot.assignments || [])) {
            if (a?.pendingOffer?.role === 'recipient') map[day].hasPendingForMe = true;
          }
        }
      }
    }
    const out = {};
    for (const [day, v] of Object.entries(map)) {
      out[day] = { types: [...v.types], hasVacancy: v.hasVacancy, hasPendingForMe: v.hasPendingForMe };
    }
    return out;
  }, [groupSchedules, activeGroupIds]);

  // Group mode: month totals — cobertura (filled/capacity), vagas + dias com vaga.
  // Same active-only iteration so chip filter changes the totalizers immediately.
  const groupTotals = useMemo(() => {
    let filled = 0;
    let capacity = 0;
    let openVacancies = 0;
    const vacancyDays = new Set();
    for (const gid of activeGroupIds) {
      const days = groupSchedules[gid]?.days || {};
      for (const [dateStr, schedule] of Object.entries(days)) {
        for (const slot of (schedule?.slots || [])) {
          filled += slot.filledCount || 0;
          capacity += slot.capacity || 0;
          openVacancies += slot.available || 0;
          if ((slot.available || 0) > 0) vacancyDays.add(dateStr);
        }
      }
    }
    const coverage = capacity > 0 ? Math.round((filled / capacity) * 100) : null;
    return { coverage, openVacancies, vacancyDays: vacancyDays.size };
  }, [groupSchedules, activeGroupIds]);

  const stats = useMemo(() => {
    // Extras: sum per-shift positive (actual - planned) using the time entries
    // for the displayed month. Same rule the Reports screen uses.
    const viewMonthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    const entries = timeEntriesByMonth?.[viewMonthKey] || {};
    let extraMin = 0;
    (daysWithShifts || []).forEach(d => {
      (d.shifts || []).forEach(shift => {
        const entry = entries[shift.id];
        if (!entry?.actualDurationMinutes) return;
        // Use actual shift duration: splitHours > durationMinutes > parsed time > label default
        let planned = shift.splitHours?.minutesThisMonth;
        if (planned == null && shift.durationMinutes > 0) {
          planned = shift.durationMinutes;
        }
        if (planned == null && shift.time) {
          let parts = shift.time.split(' – ');
          if (parts.length !== 2) parts = shift.time.split(' - ');
          if (parts.length === 2) {
            const norm = t => t.replace(/\s*\([^)]*\)/, '').replace('h', ':').trim();
            const mins = TimeUtils.calculateDurationMinutes(norm(parts[0]), norm(parts[1]));
            if (mins != null && mins > 0) planned = mins;
          }
        }
        if (planned == null) planned = TimeUtils.getShiftStandardMinutes(shift.label);
        const diff = entry.actualDurationMinutes - planned;
        if (diff > 0) extraMin += diff;
      });
    });
    return {
      totalShifts: (daysWithShifts || []).reduce((sum, d) => sum + (d.shifts || []).length, 0),
      totalHours: hoursReport?.standardHours || 0,
      extraHours: extraMin / 60,
    };
  }, [daysWithShifts, hoursReport, timeEntriesByMonth, currentDate]);

  const projected = getMonthTotalValue(monthSummary);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const resolveGroupColor = (shift) => {
    const raw = groupColors[String(shift.group?.id)] || shift.group?.color;
    return raw ? (raw.startsWith('#') ? raw : `#${raw}`) : C.primary;
  };

  const handleDayPress = (dayNum) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const selectedDate = new Date(year, month - 1, dayNum);
    if (calendarMode === 'groups') {
      if (navigation?.navigate) {
        navigation.navigate('GroupDayTeam', {
          date: selectedDate,
          groupIds: activeGroups.map(g => String(g.id)),
        });
      }
      return;
    }
    const dayData = daysWithShifts?.find(d => d.date === dateStr);
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
        const uid = String(userId || '');
        const saved = (uid && await SecureStore.getItemAsync(`real_hours_${uid}_${dateKey}`))
          || await SecureStore.getItemAsync(`real_hours_${dateKey}`);
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
      // Reload time entries so stats.extraHours recalculates
      LocalCache.getTimeEntries(userId, monthKey).then(te => {
        setTimeEntriesByMonth(prev => ({ ...prev, [monthKey]: te || {} }));
      }).catch(() => {});
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
      const inGroupMode = calendarMode === 'groups';
      const groupEntry = inGroupMode ? (groupTypesByDay[day] || null) : null;
      const types = inGroupMode ? (groupEntry?.types || []) : (shiftTypesByDay[day] || []);
      const hasShifts = types.length > 0;
      const hasVacancy = inGroupMode && !!groupEntry?.hasVacancy;
      const hasPendingForMe = inGroupMode && !!groupEntry?.hasPendingForMe;
      const dayPending = !inGroupMode ? pendingByDay[day] : null;
      const colIndex = (firstDayOfWeek + day - 1) % 7;
      const isWeekend = colIndex === 0 || colIndex === 6;
      const showSkeleton = (inGroupMode ? groupLoading : (loading || isNavigating));

      let cellBg = null;
      if (isToday) {
        cellBg = C.primary;
      } else if (inGroupMode && hasVacancy) {
        cellBg = C.warningSoft;
      } else if (!inGroupMode && types.length >= 2) {
        cellBg = C.primary + '24';
      } else if (!inGroupMode && types.length === 1) {
        cellBg = (SHIFT_TYPE_COLOR[types[0]] || C.primary) + '20';
      } else if (inGroupMode && hasShifts) {
        cellBg = C.primary + '14';
      }

      cells.push(
        <Pressable
          key={day}
          onPress={() => handleDayPress(day)}
          style={({ pressed }) => [
            s.dayCell,
            cellBg && { backgroundColor: cellBg, borderRadius: 8 },
            dayPending && !isToday && { borderWidth: 2, borderColor: C.movement, borderRadius: 8 },
            pressed && { opacity: 0.7 },
          ]}
        >
          {showSkeleton
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
                {!inGroupMode && hasShifts && (
                  <View style={s.dayCellDots}>
                    {types.slice(0, 3).map((k, di) => (
                      <View key={di} style={[s.dot, { backgroundColor: isToday ? 'rgba(255,255,255,0.7)' : (SHIFT_TYPE_COLOR[k] || C.primary) }]} />
                    ))}
                  </View>
                )}
                {inGroupMode && hasVacancy && (
                  <View style={[s.vacancyBadge, { backgroundColor: isToday ? '#fff' : C.warning }]} />
                )}
                {inGroupMode && hasPendingForMe && !isToday && (
                  <View style={[s.pendingBadge, { backgroundColor: C.primary }]} />
                )}
                {dayPending && isToday && (
                  <View style={[s.pendingBadge, { backgroundColor: '#fff' }]} />
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
    // Plantões alterados (troca/cessão/oferta) presentes neste mês → única legenda.
    const hasPending = calendarMode !== 'groups' && Object.keys(pendingByDay).length > 0;
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
        {hasPending && (
          <View style={s.legendItem}>
            <View style={[s.legendSwatch, { backgroundColor: 'transparent', borderColor: C.movement, borderWidth: 2 }]} />
            <Text style={s.legendLabel}>Alterado</Text>
          </View>
        )}
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
  const summaryLoading = loading || isNavigating;
  const renderSummaryCard = () => (
    <View style={s.summaryCard}>
      <View style={s.summaryTopRow}>
        <Text style={s.summaryEarningsLabel}>Ganhos previstos</Text>
        {summaryLoading
          ? <SkeletonBox width={120} height={22} style={{ borderRadius: 4 }} />
          : <Text style={s.summaryEarnings}>
              {projected != null ? (valuesHidden ? 'R$ ••••' : fmtBRLk(projected)) : '—'}
            </Text>}
      </View>
      <View style={s.summaryDivider} />
      <View style={s.summaryStatsRow}>
        <View style={s.summaryStat}>
          <Text style={s.summaryStatLabel}>Plantões</Text>
          {summaryLoading
            ? <SkeletonBox width={28} height={16} style={{ borderRadius: 4, marginTop: 2 }} />
            : <Text style={s.summaryStatValue}>{stats.totalShifts}</Text>}
        </View>
        <View style={[s.summaryStat, { borderLeftWidth: 0.5, borderLeftColor: C.border.light }]}>
          <Text style={s.summaryStatLabel}>Horas</Text>
          {summaryLoading
            ? <SkeletonBox width={40} height={16} style={{ borderRadius: 4, marginTop: 2 }} />
            : <Text style={s.summaryStatValue}>{formatHours(stats.totalHours)}</Text>}
        </View>
        <View style={[s.summaryStat, { borderLeftWidth: 0.5, borderLeftColor: C.border.light }]}>
          <Text style={s.summaryStatLabel}>Horas extras</Text>
          {summaryLoading
            ? <SkeletonBox width={40} height={16} style={{ borderRadius: 4, marginTop: 2 }} />
            : <Text style={[s.summaryStatValue, stats.extraHours > 0 && { color: C.warning }]}>
                {stats.extraHours > 0 ? formatHours(stats.extraHours) : '—'}
              </Text>}
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
    const shiftMonthKey = (shift.date || '').slice(0, 7);
    const realEntry = timeEntriesByMonth?.[shiftMonthKey]?.[shift.id] || null;
    const monthlyHours = hoursReport?.standardHours || ((monthSummary?.totalScheduledMinutes || 0) / 60) || 0;
    const value = loyaltyConfig
      ? calculateShiftFinalValueSync(shift, shift.date, loyaltyConfig, monthlyHours, realEntry)
      : calculateShiftValueSync(shift, shift.date, shiftValues);
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
          <Text style={s.compactDay} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {d.getDate()}
          </Text>
          <Text style={s.compactWeekday} numberOfLines={1}>
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
          {value > 0 && <Text style={s.compactValue}>{valuesHidden ? 'R$ ••••' : fmtBRLk(value)}</Text>}
          <Ionicons name="chevron-forward" size={14} color={C.text.tertiary} />
        </View>
      </Pressable>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <>
      <ScrollView
        ref={scrollRef}
        style={[s.container]}
        contentContainerStyle={{ paddingBottom: Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {renderMonthHeader()}
        <CalendarModePill mode={calendarMode} onChange={setCalendarMode} />
        {calendarMode === 'groups' && (
          <View style={s.groupPickerWrap}>
            <Pressable
              style={({ pressed }) => [s.groupPickerBtn, pressed && { opacity: 0.85 }]}
              onPress={() => setGroupPickerOpen(true)}
            >
              <Ionicons name="people-outline" size={16} color={C.text.primary} />
              <View style={{ flex: 1 }}>
                <Text style={s.groupPickerLabel} numberOfLines={1}>
                  {activeGroups[0]?.name || 'Selecione um grupo'}
                </Text>
                {!!activeGroups[0]?.institution?.name && (
                  <Text style={s.groupPickerSub} numberOfLines={1}>
                    {activeGroups[0].institution.name}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-down" size={16} color={C.text.tertiary} />
            </Pressable>
          </View>
        )}
        {renderWeekdayRow()}
        {renderDayGrid()}
        {renderLegend()}

        {calendarMode === 'mine' ? (
          <>
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
          </>
        ) : (
          <>
            {renderSectionLabel('Resumo dos grupos', true)}
            <View style={s.sectionPad}>
              <GroupSummaryCard
                groups={activeGroups}
                coverage={groupTotals.coverage}
                openVacancies={groupTotals.openVacancies}
                vacancyDays={groupTotals.vacancyDays}
                loading={groupLoading}
              />
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
        onCede={(sh) => { setBottomSheetVisible(false); setCedeShift(sh); }}
        onTrocar={(sh) => { setBottomSheetVisible(false); setTrocarShift(sh); }}
      />
      {cedeShift && <CederFlowSheet key={`cede-${cedeShift.id}`} visible shift={cedeShift} onClose={() => setCedeShift(null)} />}
      {trocarShift && <TrocarFlowSheet key={`trocar-${trocarShift.id}`} visible shift={trocarShift} onClose={() => setTrocarShift(null)} />}
      <GroupPickerModal
        visible={groupPickerOpen}
        groups={visibleGroups}
        selection={groupSelection}
        onClose={() => setGroupPickerOpen(false)}
        onConfirm={(next) => setGroupSelection(next)}
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
    groupPickerWrap: {
      paddingHorizontal: Spacing.screen,
      paddingBottom: Spacing.sm,
    },
    groupPickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 12,
      backgroundColor: C.background.card,
      borderWidth: 0.5,
      borderColor: C.border.light,
      ...Shadows.small,
    },
    groupPickerLabel: {
      fontSize: 13,
      fontFamily: Typography.fontFamily.bold,
      color: C.text.primary,
    },
    groupPickerSub: {
      fontSize: 11,
      fontFamily: Typography.fontFamily.regular,
      color: C.text.tertiary,
      marginTop: 1,
    },
    loadingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: Spacing.screen,
      paddingVertical: 10,
      marginHorizontal: Spacing.screen,
      marginBottom: 8,
      borderRadius: 10,
      backgroundColor: C.background.secondary,
      borderWidth: 0.5,
      borderColor: C.border.light,
    },
    loadingBannerText: {
      fontSize: 12,
      fontFamily: Typography.fontFamily.semiBold,
      color: C.text.secondary,
      letterSpacing: 0.2,
    },
    vacancyBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    pendingBadge: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      width: 6,
      height: 6,
      borderRadius: 3,
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
      width: 60,
      paddingLeft: 14,
      paddingRight: 10,
    },
    compactDay: {
      fontSize: 20,
      fontFamily: Typography.fontFamily.display,
      color: C.text.primary,
      letterSpacing: -0.5,
      lineHeight: 22,
    },
    compactWeekday: {
      fontSize: 9,
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
