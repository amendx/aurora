import React, { useContext, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { useShifts } from '../contexts/ShiftsContext';
import { useOffers } from '../contexts/OffersContext';
import { useOpenings } from '../contexts/OpeningsContext';
import { usePrivacy } from '../contexts/PrivacyContext';
import { useColors, Typography, Spacing, Shadows } from '../constants/DesignSystem';
import ShiftBottomSheet from '../components/ShiftBottomSheet';
import SkeletonBox from '../components/Skeleton';
import CederFlowSheet from './CederFlowSheet';
import TrocarFlowSheet from './TrocarFlowSheet';
import TodayCoworkersService from '../services/TodayCoworkersService';
import { getGroupColors } from '../utils/GroupColorConfig';
import { movementVisual, shiftPending } from '../utils/MovementColors';
import { registerScrollToTop } from '../utils/scrollToTopBus';
import LocalCache from '../services/LocalCache';
import { isAuroraOnly, isViewOnly } from '../utils/userSource';
import { getShiftValues, getFullShiftConfig, calculateShiftValueSync, calculateShiftFinalValueSync } from '../utils/ShiftValueCalculator';
import { getMonthTotalValue } from '../utils/MonthSummaryComputer';
import { applyPublishedHospitalConfigs, collectInstIds } from '../utils/PublishedHospitalConfig';
import { applyLuisFrancaPreset } from '../utils/LuisFrancaPreset';

const LABEL_MAP = { M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite', FN: 'Sex. Noite' };

// Shift type → accent color
const SHIFT_TYPE_COLOR = {
  M:  '#3FA9A7',
  T:  '#97CAFC',
  N:  '#5B6FBF',
  D:  '#5B6FBF',
  FN: '#E08A00',
};

const fmtBRLk = (v) => {
  if (!v || isNaN(v)) return 'R$ —';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// Parse "07h00 – 13h00 (M)" or "07:00 - 13:00" → "07:00–13:00"
const parseShiftTime = (timeStr) => {
  if (!timeStr) return null;
  const norm = s => s.replace(/h/i, ':').replace(/\s*\([^)]*\)/, '').trim();
  let parts = timeStr.split(' – ');
  if (parts.length !== 2) parts = timeStr.split(' - ');
  if (parts.length !== 2) return null;
  return `${norm(parts[0])}–${norm(parts[1])}`;
};

const HomeScreen = ({ navigation }) => {
  const { user } = useContext(AuthContext);
  const ctx = useShifts();
  const { loading, loadedFor, loadMonthlyShifts, refreshShifts, monthSummary: contextSummary, getMonthCache } = ctx;
  const { unreadCount: avisosUnread, offersReceived, swapsReceived, swapsSent, offersSent } = useOffers();
  const { openings, myCededOpenings } = useOpenings();
  const { valuesHidden, toggleValues } = usePrivacy();

  // Mapa de plantões com estado pendente — pra colorir/etiquetar o card condensado.
  // Cobre: troca que iniciei (shiftA.id), troca proposta a mim (shiftB.id), cessão direcionada que enviei (shiftSnapshot.id).
  // Cessão ao grupo já remove o shift do calendário, não precisa tratar aqui.
  const pendingByShiftId = React.useMemo(() => {
    const map = {};
    (swapsSent || []).forEach(sw => {
      if (sw?.status === 'pending' && sw.shiftA?.id) map[String(sw.shiftA.id)] = { kind: 'swap', role: 'initiator', counterparty: sw.targetUserName };
    });
    (swapsReceived || []).forEach(sw => {
      if (sw?.status === 'pending' && sw.shiftB?.id) map[String(sw.shiftB.id)] = { kind: 'swap', role: 'target', counterparty: sw.initiatorUserName };
    });
    (offersSent || []).forEach(o => {
      if (o?.status === 'pending' && o.shiftSnapshot?.id) map[String(o.shiftSnapshot.id)] = { kind: 'offer', role: 'sender', counterparty: o.toUserName };
    });
    return map;
  }, [swapsSent, swapsReceived, offersSent]);
  const pendingActionable = offersReceived.length + swapsReceived.length;
  const badgeCount = Math.max(avisosUnread, pendingActionable);

  // Always pin Home to the CURRENT month — Reports/Charts may swap the active
  // month in shiftsData, but Home must remain anchored to "today's" month.
  const _now = new Date();
  const _curMonth = _now.getMonth() + 1;
  const _curYear  = _now.getFullYear();
  const _curKey   = `${_curYear}-${_curMonth}`;
  const _curCache = getMonthCache?.(_curMonth, _curYear);
  const _activeIsCurrent = ctx.currentMonth === _curMonth && ctx.currentYear === _curYear;

  const _rawDays       = _curCache?.daysWithShifts ?? (_activeIsCurrent ? ctx.daysWithShifts : []);
  const totalShifts    = _curCache?.totalShifts    ?? (_activeIsCurrent ? ctx.totalShifts    : null);
  const hoursReport    = _curCache?.hoursReport    ?? (_activeIsCurrent ? ctx.hoursReport    : null);

  // Plantões cedidos ao grupo deste mês — re-injeta no calendário como cards
  // amarelos (mesmo padrão do DayView). Sem isso o plantão "some" da Home
  // depois de ceder, dando impressão de que ele se perdeu.
  const daysWithShifts = React.useMemo(() => {
    const activeCede = (myCededOpenings || []).filter(o => o.status === 'active');
    if (activeCede.length === 0) return _rawDays;
    const monthPrefix = `${_curYear}-${String(_curMonth).padStart(2, '0')}`;
    const byDate = {};
    (_rawDays || []).forEach(d => { byDate[d.date] = d; });
    activeCede.forEach(o => {
      const dateKey = o.dateKey || (o.startISO || '').slice(0, 10);
      if (!dateKey || !dateKey.startsWith(monthPrefix)) return;
      const snap = o.originShiftSnapshot || {};
      const ghost = {
        ...snap,
        _pendingCede: o,
        id: snap.id || `pending_${o.id}`,
        label: snap.label || o.label,
        date: snap.date || dateKey,
        startISO: snap.startISO || o.startISO,
        endISO: snap.endISO || o.endISO,
        time: snap.time,
        group: snap.group || o.group,
        monthKey: snap.monthKey || o.monthKey,
      };
      if (byDate[dateKey]) {
        if (!(byDate[dateKey].shifts || []).some(s => String(s.id) === String(ghost.id))) {
          byDate[dateKey] = {
            ...byDate[dateKey],
            shifts: [...(byDate[dateKey].shifts || []), ghost],
            shiftsCount: (byDate[dateKey].shiftsCount || 0) + 1,
          };
        }
      } else {
        const d = new Date(dateKey + 'T00:00:00');
        byDate[dateKey] = { day: d.getDate(), date: dateKey, shifts: [ghost], shiftsCount: 1, originalData: null };
      }
    });
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [_rawDays, myCededOpenings, _curMonth, _curYear]);
  const [refreshing, setRefreshing] = useState(false);
  const [groupColors, setGroupColors] = useState({});
  const [cachedSummary, setCachedSummary] = useState(null);
  const monthSummary = contextSummary || cachedSummary;
  const [prevSummary, setPrevSummary] = useState(null);
  const [savedValues, setSavedValues] = useState(null);
  const [loyaltyConfig, setLoyaltyConfig] = useState(null);
  const [timeEntriesByMonth, setTimeEntriesByMonth] = useState({});
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);

  const userId = user?.id || user?.data?.id || 0;

  useEffect(() => {
    if (!userId) return;
    getGroupColors(userId).then(setGroupColors);
    getShiftValues().then(v => setSavedValues(v)).catch(() => {});

    // RESET antes de buscar — evita vazamento entre sessões (logout aurora →
    // login webClient mantinha summary do anterior se o novo não tinha cache).
    setCachedSummary(null);
    setPrevSummary(null);
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    LocalCache.getSummary(userId, monthKey).then(s => { if (s) setCachedSummary(s); }).catch(() => {});

    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    LocalCache.getSummary(userId, prevKey).then(s => s && setPrevSummary(s)).catch(() => {});

    // Load time-entries for current + next month so upcoming-shift values can
    // include extra hours when the user has registered real start/end times.
    const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextKey = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    Promise.all([
      LocalCache.getTimeEntries(userId, monthKey).catch(() => ({})),
      LocalCache.getTimeEntries(userId, nextKey).catch(() => ({})),
    ]).then(([cur, nxt]) => setTimeEntriesByMonth({ [monthKey]: cur || {}, [nextKey]: nxt || {} }));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    getFullShiftConfig().then(async cfg => {
      const [published, entries] = await Promise.all([
        applyPublishedHospitalConfigs(cfg, collectInstIds(daysWithShifts)),
        LocalCache.getTimeEntries(userId, monthKey).catch(() => ({})),
      ]);
      const eff = applyLuisFrancaPreset(published, daysWithShifts, isViewOnly(user), entries || {});
      setLoyaltyConfig(eff);
    }).catch(() => {});
  }, [userId, user, daysWithShifts]);

  const [bsVisible, setBsVisible] = useState(false);
  const [bsShifts, setBsShifts] = useState([]);
  const [bsDate, setBsDate] = useState(null);
  const [cedeShift, setCedeShift] = useState(null);
  const [trocarShift, setTrocarShift] = useState(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    const now = new Date();
    // refreshShifts: aurora = Firestore-only; webClient = monthly + só dias que mudaram.
    if (refreshShifts) {
      await refreshShifts(now.getMonth() + 1, now.getFullYear());
    } else {
      await loadMonthlyShifts(now.getMonth() + 1, now.getFullYear(), true);
    }
    setRefreshing(false);
  };

  const scrollRef = useRef(null);
  useEffect(() => registerScrollToTop('home', () => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  }), []);

  const loadedForRef = useRef(loadedFor);
  useEffect(() => { loadedForRef.current = loadedFor; }, [loadedFor]);

  useEffect(() => {
    const reload = () => {
      const now = new Date();
      const m = now.getMonth() + 1;
      const y = now.getFullYear();
      const key = `${y}-${m}`;
      if (loadedForRef.current === key && !loading) return;
      loadMonthlyShifts(m, y);
    };
    reload();
    const unsubscribe = navigation?.addListener?.('focus', reload);
    return unsubscribe;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allShifts = (daysWithShifts || []).flatMap(d => d.shifts || []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingShifts = allShifts
    .filter(s => new Date(s.date + 'T00:00:00') >= today)
    .slice(0, 5);

  const plannedHoursByInstitution = React.useMemo(() => {
    const out = {};
    (daysWithShifts || []).forEach(day => {
      (day.shifts || []).forEach(shift => {
        const instId = shift?.group?.institution?.id ?? shift?.group?.institutionId ?? null;
        if (instId == null || String(instId).length === 0) return;
        const hours = shift?.splitHours?.minutesThisMonth != null
          ? shift.splitHours.minutesThisMonth / 60
          : shift?.durationMinutes != null
            ? shift.durationMinutes / 60
            : (String(shift?.label || '').charAt(0).toUpperCase() === 'N' || String(shift?.label || '').charAt(0).toUpperCase() === 'D' ? 12 : 6);
        out[String(instId)] = (out[String(instId)] || 0) + hours;
      });
    });
    return out;
  }, [daysWithShifts]);

  // Clique no card de plantão na Home → DayView com esse shift em foco.
  // Mesma experiência do calendário (status banner, ações por status, confirm
  // sheet). Antes abria o ShiftBottomSheet — substituído.
  const openShiftBottomSheet = (shift) => {
    if (navigation?.navigate) {
      // initialDate de DayView espera Date — caller original (CalendarScreen)
      // converte do string yyyy-mm-dd assim. Replicando.
      navigation.navigate('DayView', {
        date: new Date(shift.date + 'T00:00:00'),
        focusShiftId: shift.id,
      });
      return;
    }
    // Fallback (caso navegação não disponível por algum motivo): bottom sheet.
    const dayData = (daysWithShifts || []).find(d => d.date === shift.date);
    setBsShifts(dayData?.shifts || [shift]);
    setBsDate(new Date(shift.date + 'T00:00:00'));
    setBsVisible(true);
  };

  const resolveGroupColor = (shift) => {
    const raw = groupColors[String(shift.group?.id)] || shift.group?.color;
    return raw ? (raw.startsWith('#') ? raw : `#${raw}`) : C.primary;
  };

  const shiftTypeKey = (shift) => {
    if (shift.carryover) return 'D';
    const k = shift.label?.charAt(0);
    // Detect FN: friday night
    if (shift.label === 'FN') return 'FN';
    return k || 'M';
  };

  const shiftLabel = (shift) => LABEL_MAP[shift.label] || LABEL_MAP[shiftTypeKey(shift)] || shift.label || 'Plantão';

  // ── Header ───────────────────────────────────────────────────────────────────
  const renderHeader = () => {
    const firstName = user?.name?.split(' ')[0] || 'Usuário';
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });

    return (
      <View style={[s.header, { paddingTop: Spacing.lg }]}>
        <View style={s.headerTop}>
          <View style={s.headerLeft}>
            <Text style={s.headerDate}>{dateStr}</Text>
            <Text style={s.headerGreeting}>Olá, {firstName}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable onPress={toggleValues} hitSlop={8} style={s.bellBtn}>
              <Ionicons name={valuesHidden ? 'eye-off-outline' : 'eye-outline'} size={22} color={C.text.primary} />
            </Pressable>
            <Pressable
              onPress={() => navigation?.navigate?.('AvisosScreen')}
              hitSlop={8}
              style={s.bellBtn}
            >
              <Ionicons name="notifications-outline" size={22} color={C.text.primary} />
              {badgeCount > 0 && (
                <View style={[s.bellBadge, { backgroundColor: C.error }]}>
                  <Text style={s.bellBadgeText}>{badgeCount > 9 ? '9+' : badgeCount}</Text>
                </View>
              )}
            </Pressable>
            <Pressable style={s.avatarWrap} onPress={() => navigation?.navigate?.('Profile')}>
              {user?.photo ? (
                <Image source={{ uri: user.photo }} style={s.avatarImg} />
              ) : (
                <View style={[s.avatarFallback, { backgroundColor: C.accentSoft }]}>
                  <Text style={s.avatarInitial}>{firstName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={s.avatarStatusDot} />
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  // ── Hero card ─────────────────────────────────────────────────────────────────
  const renderHeroCard = () => {
    const now = new Date();
    const monthName = now.toLocaleDateString('pt-BR', { month: 'long' });

    const projected     = getMonthTotalValue(monthSummary);
    const prevProjected = getMonthTotalValue(prevSummary);

    const deltaPct = projected != null && prevProjected && prevProjected > 0
      ? Math.round(((projected - prevProjected) / prevProjected) * 100)
      : null;

    const totalHours = hoursReport?.standardHours != null
      ? Math.round(hoursReport.standardHours)
      : monthSummary
        ? Math.round((monthSummary.totalScheduledMinutes || 0) / 60)
        : null;

    const shiftsCount = totalShifts ?? monthSummary?.shiftCount ?? null;

    const remaining = upcomingShifts.length;

    // Per-hospital loyalty makes a single global % meaningless on the hero —
    // slot is intentionally left for a future stat. See HospitalDetailScreen
    // for per-hospital fidelização configuration.

    return (
      <View style={s.heroWrap}>
        <View style={s.heroCard}>
          <Text style={s.heroLabel}>Ganhos previstos · {monthName}</Text>
          {loading
            ? <SkeletonBox width={180} height={34} style={{ marginVertical: 4 }} />
            : <Text style={s.heroValue}>
                {projected != null ? (valuesHidden ? 'R$ ••••' : fmtBRLk(projected)) : '—'}
              </Text>}
          <View style={s.heroSubRow}>
            {deltaPct != null && (
              <View style={[s.deltaBadge, { backgroundColor: deltaPct >= 0 ? C.moneySoft : C.warningSoft }]}>
                <Ionicons
                  name={deltaPct >= 0 ? 'arrow-up' : 'arrow-down'}
                  size={10}
                  color={deltaPct >= 0 ? C.money : C.warning}
                />
                <Text style={[s.deltaBadgeText, { color: deltaPct >= 0 ? C.money : C.warning }]}>
                  {Math.abs(deltaPct)}%
                </Text>
              </View>
            )}
            {prevProjected != null && (
              <Text style={s.heroDeltaRef}>vs. mês ant. · {valuesHidden ? '••••' : fmtBRLk(prevProjected)}</Text>
            )}
          </View>

          <View style={s.heroDivider} />

          <View style={s.heroStatsRow}>
            <View style={s.heroStat}>
              {loading
                ? <SkeletonBox width={28} height={20} style={{ marginBottom: 3 }} />
                : <Text style={s.heroStatValue}>{shiftsCount ?? '—'}</Text>}
              <Text style={s.heroStatLabel}>plantões</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              {loading
                ? <SkeletonBox width={28} height={20} style={{ marginBottom: 3 }} />
                : <Text style={s.heroStatValue}>{totalHours != null ? totalHours : '—'}</Text>}
              <Text style={s.heroStatLabel}>horas</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              {loading
                ? <SkeletonBox width={28} height={20} style={{ marginBottom: 3 }} />
                : <Text style={[s.heroStatValue, { color: C.warning }]}>{remaining}</Text>}
              <Text style={s.heroStatLabel}>próximos</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // ── Compact Shift Card — unified pattern for all shifts ───────────────────────
  const renderShiftCard = (shift, index) => {
    const d = new Date(shift.date + 'T00:00:00');
    const groupColor = resolveGroupColor(shift);
    const timeStr = parseShiftTime(shift.time);
    const typeKey = shiftTypeKey(shift);
    const badgeColor = SHIFT_TYPE_COLOR[typeKey] || C.primary;

    const pending = shiftPending(shift, pendingByShiftId);
    const mv = pending ? movementVisual(C, pending.kind, pending.role) : null;
    const accentColor = mv ? mv.color : groupColor;
    const pendingTag = mv ? mv.tag : null;

    const shiftMonthKey = (shift.date || '').slice(0, 7);
    const realEntry = timeEntriesByMonth?.[shiftMonthKey]?.[shift.id] || null;
    const instId = shift?.group?.institution?.id ?? shift?.group?.institutionId ?? null;
    const monthlyHours = instId != null && plannedHoursByInstitution[String(instId)] != null
      ? plannedHoursByInstitution[String(instId)]
      : hoursReport?.standardHours || ((monthSummary?.totalScheduledMinutes || 0) / 60) || 0;
    const value = loyaltyConfig
      ? calculateShiftFinalValueSync(shift, shift.date, loyaltyConfig, monthlyHours, realEntry)
      : calculateShiftValueSync(shift, shift.date, savedValues);

    let coworkers = TodayCoworkersService.getCoworkers(shift.id);
    if (coworkers.length === 0 && shift?.originalData?.coworkers?.length > 0) {
      coworkers = shift.originalData.coworkers;
    }
    const vacancies = TodayCoworkersService.getVacanciesByGroup(shift.id);
    const totalVacancies = vacancies.reduce((acc, v) => acc + (v.available ?? 0), 0);

    return (
      <Pressable
        key={index}
        style={({ pressed }) => [
          s.shiftCard,
          mv && { borderColor: mv.color + '55', borderWidth: 1 },
          pressed && { opacity: 0.85 },
        ]}
        onPress={() => openShiftBottomSheet(shift)}
      >
        {/* Left accent bar — group color (ou amarelo se pendente) */}
        <View style={[s.shiftAccentBar, { backgroundColor: accentColor }]} />

        {/* Date column */}
        <View style={s.shiftDateCol}>
          <Text style={s.shiftDay}>{d.getDate()}</Text>
          <Text style={s.shiftWday}>
            {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
          </Text>
        </View>

        {/* Info column */}
        <View style={s.shiftInfoCol}>
          {/* Type badge + time + tag pendente */}
          <View style={s.shiftTopRow}>
            <View style={[s.shiftTypeBadge, { backgroundColor: badgeColor + '1f' }]}>
              <Text style={[s.shiftTypeBadgeText, { color: badgeColor }]}>{shiftLabel(shift)}</Text>
            </View>
            {pendingTag && (
              <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: mv.color + '22' }}>
                <Text style={{ fontSize: 8.5, fontFamily: Typography.fontFamily.bold, color: mv.color, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  {pendingTag}
                </Text>
              </View>
            )}
            {timeStr ? (
              <Text style={s.shiftTime}>{timeStr}</Text>
            ) : null}
          </View>
          {/* Institution */}
          {shift.group?.institution?.name && (
            <Text style={s.shiftInstitution} numberOfLines={1}>
              {shift.group.institution.name}
            </Text>
          )}
          {/* Group + coworkers */}
          <View style={s.shiftMeta}>
            {shift.group?.name && (
              <>
                <View style={[s.shiftGroupDot, { backgroundColor: groupColor }]} />
                <Text style={s.shiftGroupName} numberOfLines={1}>{shift.group.name}</Text>
              </>
            )}
            {coworkers.length > 0 && (
              <View style={s.coworkerStack}>
                {coworkers.slice(0, 3).map((p, i) => (
                  <View key={p.id || i} style={[s.coworkerAvatar, { marginLeft: i === 0 ? 6 : -5 }]}>
                    {p.photo
                      ? <Image source={{ uri: p.photo }} style={s.coworkerAvatarImg} />
                      : <View style={[s.coworkerAvatarFallback, { backgroundColor: C.accentSoft }]}>
                          <Text style={s.coworkerAvatarInitial}>{(p.name || '?').charAt(0).toUpperCase()}</Text>
                        </View>
                    }
                  </View>
                ))}
                {coworkers.length > 3 && (
                  <View style={[s.coworkerAvatar, s.coworkerAvatarOverflow, { marginLeft: -5 }]}>
                    <Text style={s.coworkerAvatarOverflowText}>+{coworkers.length - 3}</Text>
                  </View>
                )}
                {totalVacancies > 0 && Array.from({ length: Math.min(totalVacancies, 2) }).map((_, i) => (
                  <View key={'v' + i} style={[s.coworkerAvatar, s.coworkerAvatarVacancy, { marginLeft: -5 }]}>
                    <Ionicons name="star-outline" size={10} color={C.warning} />
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Value column */}
        <View style={s.shiftValueCol}>
          {value > 0 && <Text style={s.shiftValue}>{valuesHidden ? 'R$ ••••' : fmtBRLk(value)}</Text>}
          <Ionicons name="chevron-forward" size={14} color={C.text.tertiary} />
        </View>
      </Pressable>
    );
  };

  const renderEmptyShifts = () => (
    <View style={s.emptyState}>
      <Ionicons name="moon-outline" size={28} color={C.text.tertiary} />
      <Text style={s.emptyTitle}>Sem plantões próximos</Text>
      <Text style={s.emptyText}>Você está em paz por enquanto</Text>
    </View>
  );

  // ── Quick Actions ─────────────────────────────────────────────────────────────
  const renderActionTile = ({ icon, label, iconColor, iconBg, onPress, disabled, hasDot }) => (
    <Pressable
      key={label}
      style={({ pressed }) => [s.actionTile, disabled && s.actionTileDisabled, pressed && !disabled && { opacity: 0.8 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={[s.actionTileIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
        {hasDot && <View style={s.actionTileDot} />}
      </View>
      <Text style={[s.actionTileLabel, disabled && s.actionLabelDisabled]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );

  // Bolinha de notificação na tile de Movimentações.
  // Acende quando há algo pendente de ação do usuário:
  //   - troca direcionada recebida (swapsReceived)
  //   - cessão direcionada recebida (offersReceived)
  //   - cessão minha aguardando (myCededOpenings) — feedback de "ainda lá"
  const hasMovimentacoes = (swapsReceived?.length || 0) > 0
    || (offersReceived?.length || 0) > 0
    || (myCededOpenings || []).some(o => o.status === 'active' || !o.status);

  // Bolinha de notificação na tile de Vagas: acende quando há vaga em aberto
  // nos meus grupos pra assumir/demonstrar interesse.
  const hasVagas = (openings?.length || 0) > 0;

  const renderActions = () => (
    <View style={s.actionsGrid}>
      {renderActionTile({ icon: 'document-text',  label: 'Relatórios', iconColor: C.money,   iconBg: C.moneySoft,  onPress: () => navigation?.navigate?.('Reports') })}
      {/* [WEBCLIENT-BRIDGE] `|| user?.auroraOnlyMode` rotea o webClient migrado pro Openings aurora.
          Conta só-visualização (PlantãoAPI) não vê Vagas/Movimentações. */}
      {!isViewOnly(user) && renderActionTile({ icon: 'medkit',         label: 'Vagas',      iconColor: C.money,   iconBg: C.moneySoft,  hasDot: hasVagas, onPress: () => navigation?.navigate?.(isAuroraOnly(user) ? 'OpeningsScreen' : 'NetworkVacanciesScreen') })}
      {!isViewOnly(user) && renderActionTile({ icon: 'swap-horizontal', label: 'Movimentações', iconColor: C.primary, iconBg: C.accentSoft, hasDot: hasMovimentacoes, onPress: () => navigation?.navigate?.('TrocasAbertas') })}
      {/* Aura (IA do Aurora): conselho de escala */}
      {renderActionTile({ icon: 'sparkles', label: 'Aura', iconColor: C.primary, iconBg: C.accentSoft, onPress: () => navigation?.navigate?.('AuraScreen') })}
    </View>
  );

  return (
    <>
      <ScrollView
        ref={scrollRef}
        style={s.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {renderHeader()}

        <View style={s.body}>
          {/* Hero card — projected earnings + stats */}
          {renderHeroCard()}

          {/* Quick actions */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>AÇÕES</Text>
            {renderActions()}
          </View>

          {/* Upcoming shifts */}
          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionLabel}>PRÓXIMOS PLANTÕES</Text>
              <Pressable onPress={() => navigation?.navigate?.('calendar')} style={s.seeAllBtn}>
                <Text style={s.seeAllText}>Ver todos</Text>
                <Ionicons name="chevron-forward" size={13} color={C.interactive.active} />
              </Pressable>
            </View>
            <View style={s.shiftListStack}>
              {loading
                ? [0, 1, 2].map(i => (
                    <View key={i} style={s.shiftCard}>
                      <View style={[s.shiftDateCol, { gap: 4 }]}>
                        <SkeletonBox width={28} height={22} />
                        <SkeletonBox width={22} height={10} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <SkeletonBox width="50%" height={12} style={{ marginBottom: 6 }} />
                        <SkeletonBox width="70%" height={14} style={{ marginBottom: 6 }} />
                        <SkeletonBox width="35%" height={11} />
                      </View>
                    </View>
                  ))
                : upcomingShifts.length === 0
                  ? renderEmptyShifts()
                  : upcomingShifts.map((shift, i) => renderShiftCard(shift, i))
              }
            </View>
          </View>
        </View>
      </ScrollView>

      <ShiftBottomSheet
        isVisible={bsVisible}
        onClose={() => setBsVisible(false)}
        shifts={bsShifts}
        selectedDate={bsDate}
        onCede={(sh) => { setBsVisible(false); setCedeShift(sh); }}
        onTrocar={(sh) => { setBsVisible(false); setTrocarShift(sh); }}
      />
      {cedeShift && <CederFlowSheet key={`cede-${cedeShift.id}`} visible shift={cedeShift} onClose={() => setCedeShift(null)} />}
      {trocarShift && <TrocarFlowSheet key={`trocar-${trocarShift.id}`} visible shift={trocarShift} onClose={() => setTrocarShift(null)} />}
    </>
  );
};

const makeStyles = (C) => ({
  container: {
    flex: 1,
    backgroundColor: C.background.secondary,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: C.background.primary,
    paddingHorizontal: Spacing.screen,
    paddingBottom: Spacing.md,
    borderBottomWidth: 0,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flex: 1 },
  headerDate: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  headerGreeting: {
    fontSize: 28,
    fontFamily: Typography.fontFamily.display,
    fontWeight: 'bold',
    color: C.text.primary,
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  avatarWrap: {
    width: 42,
    height: 42,
    marginLeft: Spacing.md,
    position: 'relative',
  },
  avatarImg: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: C.primary,
  },
  avatarStatusDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: C.money,
    borderWidth: 2,
    borderColor: C.background.primary,
  },
  bellBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.background.elevated,
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: 2, right: 2,
    minWidth: 16, height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  // ── Hero card ────────────────────────────────────────────────────────────────
  heroWrap: {
    paddingBottom: Spacing.lg,
  },
  heroCard: {
    backgroundColor: C.background.elevated,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderWidth: 0.5,
    borderColor: C.border.light,
    ...Shadows.small,
  },
  heroLabel: {
    fontSize: 10.5,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.tertiary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroValue: {
    fontSize: 38,
    fontFamily: Typography.fontFamily.display,
    fontWeight: 'bold',
    color: C.text.primary,
    letterSpacing: -1,
    lineHeight: 46,
    marginTop: 4,
  },
  heroSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  deltaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  deltaBadgeText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
  },
  heroDeltaRef: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary,
  },
  heroDivider: {
    height: 0.5,
    backgroundColor: C.border.light,
    marginVertical: 14,
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  heroStatDivider: {
    width: 0.5,
    backgroundColor: C.border.light,
  },
  heroStatValue: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.display,
    fontWeight: 'bold',
    color: C.text.primary,
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  heroStatLabel: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.semiBold,
    fontWeight: 'bold',
    color: C.text.tertiary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginTop: 2,
  },

  // ── Body ─────────────────────────────────────────────────────────────────────
  body: {
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: 11.5,
    fontFamily: Typography.fontFamily.semiBold,
    fontWeight: 'bold',
    color: C.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontSize: Typography.fontSize.caption1,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.interactive.active,
  },

  // ── Compact Shift Cards ──────────────────────────────────────────────────────
  shiftListStack: {
    flexDirection: 'column',
    gap: 10,
  },
  shiftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 14,
    paddingLeft: 0,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: C.background.elevated,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.border.light,
    ...Shadows.small,
  },
  shiftAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  shiftDateCol: {
    alignItems: 'center',
    width: 54,
    paddingLeft: 16,
    paddingRight: 12,
  },
  shiftDay: {
    fontSize: 22,
    fontFamily: Typography.fontFamily.display,
    fontWeight: 'bold',
    color: C.text.primary,
    letterSpacing: -0.6,
    lineHeight: 24,
  },
  shiftWday: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  shiftInfoCol: {
    flex: 1,
    paddingLeft: 2,
    paddingRight: 4,
  },
  shiftTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  shiftTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  shiftTypeBadgeText: {
    fontSize: 9.5,
    fontFamily: Typography.fontFamily.bold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  shiftTime: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.secondary,
  },
  shiftInstitution: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.primary,
    marginBottom: 4,
  },
  shiftMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shiftGroupDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
    flexShrink: 0,
  },
  shiftGroupName: {
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
    borderColor: C.background.elevated,
    overflow: 'hidden',
  },
  coworkerAvatarImg: { width: 18, height: 18 },
  coworkerAvatarFallback: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coworkerAvatarInitial: {
    fontSize: 7,
    fontFamily: Typography.fontFamily.bold,
    color: C.primary,
  },
  coworkerAvatarOverflow: {
    backgroundColor: C.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coworkerAvatarOverflowText: {
    fontSize: 7,
    fontFamily: Typography.fontFamily.bold,
    color: C.text.secondary,
  },
  coworkerAvatarVacancy: {
    backgroundColor: C.warningSoft,
    borderColor: C.warning,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Value column ─────────────────────────────────────────────────────────────
  shiftValueCol: {
    alignItems: 'flex-end',
    flexShrink: 0,
    paddingRight: 2,
    gap: 2,
  },
  shiftValue: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.display,
    color: C.money,
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  // ── Empty state ───────────────────────────────────────────────────────────────
  emptyState: {
    backgroundColor: C.background.elevated,
    borderRadius: 18,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: C.border.light,
    ...Shadows.small,
    gap: Spacing.xs,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.primary,
    marginTop: 4,
  },
  emptyText: {
    fontSize: Typography.fontSize.footnote,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.secondary,
  },

  // ── Quick Actions ─────────────────────────────────────────────────────────────
  actionsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  actionTile: {
    flex: 1,
    backgroundColor: C.background.elevated,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 0.5,
    borderColor: C.border.light,
    ...Shadows.small,
  },
  actionTileDisabled: {
    opacity: 0.45,
  },
  actionTileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTileDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.error,
    borderWidth: 1.5,
    borderColor: C.background.elevated,
  },
  actionTileLabel: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.primary,
    textAlign: 'center',
  },
  actionLabelDisabled: {
    color: C.text.tertiary,
  },
});

export default HomeScreen;
