import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Image,
  Modal,
  Animated,
  Easing,
  Dimensions,
  PanResponder,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShifts } from '../contexts/ShiftsContext';
import { useOpenings } from '../contexts/OpeningsContext';
import { useOffers } from '../contexts/OffersContext';
import { useColors, Typography, Spacing, BorderRadius, Shadows } from '../constants/DesignSystem';
import { getFullShiftConfig, calculateShiftValueSync, roundCurrency, getShiftPeriod, shouldUseWeekendValue } from '../utils/ShiftValueCalculator';
import ShiftBottomSheet from '../components/ShiftBottomSheet';
import CederFlowSheet from './CederFlowSheet';
import TrocarFlowSheet from './TrocarFlowSheet';
import AddManualShiftModal from '../components/AddManualShiftModal';
import { AuthContext } from '../context/AuthContext';
import { getGroupColors } from '../utils/GroupColorConfig';
import TodayCoworkersService from '../services/TodayCoworkersService';

const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_FULL_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const SHIFT_ACCENTS = ['#6cc1c0', '#97cafc', '#41b883', '#7096bb'];

const { width: W } = Dimensions.get('window');
const SPRING_FAB   = { damping: 15, stiffness: 380, mass: 0.7, useNativeDriver: true };
const EASING_CLOSE = Easing.bezier(0.4, 0, 1, 1);
const DURATION_CLOSE = 260;

const DAY_ITEM_TOTAL = 52;
const DAY_PADDING    = Spacing.md;

const LABEL_MAP = { M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite', FN: 'Sex. Noite' };
const SHIFT_TYPE_COLOR = { M: '#3FA9A7', T: '#97CAFC', N: '#5B6FBF', D: '#5B6FBF', FN: '#E08A00' };

const fmtBRLk = (v) => {
  if (!v || isNaN(v)) return null;
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

const pad = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const buildWeekDays = (centerDate) => {
  const days = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(centerDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
};

// ── DayViewScreen ──────────────────────────────────────────────────────────────

const DayViewScreen = ({ navigation, initialDate }) => {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const { daysWithShifts, hoursReport } = useShifts();
  const { myCededOpenings, refresh: refreshOpenings } = useOpenings();
  const { swapsSent, swapsReceived, offersSent } = useOffers();
  const { user } = useContext(AuthContext);

  useEffect(() => { refreshOpenings?.(true); }, [refreshOpenings]);

  const today = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState(initialDate || today);
  const [groupColors, setGroupColors] = useState({});
  const [savedValues, setSavedValues] = useState(null);
  const [fullConfig, setFullConfig] = useState(null);
  const [dayRealHours, setDayRealHours] = useState({});

  const [bsVisible, setBsVisible] = useState(false);
  const [bsShifts, setBsShifts] = useState([]);
  const [bsDate, setBsDate] = useState(null);
  const [bsInitialIdx, setBsInitialIdx] = useState(0);
  const [cedeShift, setCedeShift] = useState(null);
  const [trocarShift, setTrocarShift] = useState(null);

  const [shiftPickerVisible, setShiftPickerVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);

  const swipePan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
    onPanResponderRelease: (_, g) => {
      if (g.dx > 60) {
        setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
      } else if (g.dx < -60) {
        setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
      }
    },
  })).current;

  const daySelectorRef  = useRef(null);
  const fabEntryScale   = useRef(new Animated.Value(0)).current;
  const fabPressScale   = useRef(new Animated.Value(1)).current;
  const fabAnimatedOnce = useRef(false);
  const pickerSlideY    = useRef(new Animated.Value(500)).current;

  const weekDays = useMemo(() => buildWeekDays(selectedDate), [selectedDate]);

  const shiftsMap = useMemo(() => {
    const map = {};
    (daysWithShifts || []).forEach(d => { map[d.date] = d.shifts || []; });
    return map;
  }, [daysWithShifts]);

  const selectedDateStr = toDateStr(selectedDate);
  const baseDayShifts = shiftsMap[selectedDateStr] || [];

  // Cede ao grupo remove o plantão do calendário. Reinjetamos como "virtual shift"
  // marcado com _pendingCede pra renderizar amarelo + permitir cancelar inline.
  // Adicionalmente anotamos pendências de troca (swap) e cessão direcionada (offer)
  // nos plantões que continuam visíveis — mesmo padrão visual.
  const dayShifts = useMemo(() => {
    const cededToday = (myCededOpenings || []).filter(o => {
      const k = o.dateKey || (o.startISO || '').slice(0, 10);
      return k === selectedDateStr && o.status === 'active';
    });
    const ceded = cededToday.map(o => {
      const snap = o.originShiftSnapshot || {};
      return {
        ...snap,
        _pendingCede: o,
        id: snap.id || `pending_${o.id}`,
        label: snap.label || o.label,
        date: snap.date || o.dateKey,
        startISO: snap.startISO || o.startISO,
        endISO: snap.endISO || o.endISO,
        time: snap.time,
        group: snap.group || o.group,
        monthKey: snap.monthKey || o.monthKey,
      };
    });

    // Index swaps and direct offers by the user's own shift id (shiftA for swaps initiated by me).
    const sentSwapByShiftId = {};
    (swapsSent || []).forEach(sw => {
      if (sw?.status !== 'pending' || !sw.shiftA?.id) return;
      sentSwapByShiftId[String(sw.shiftA.id)] = sw;
    });
    const sentOfferByShiftId = {};
    (offersSent || []).forEach(o => {
      if (o?.status !== 'pending' || !o.shiftSnapshot?.id) return;
      sentOfferByShiftId[String(o.shiftSnapshot.id)] = o;
    });
    const recvSwapByShiftId = {};
    (swapsReceived || []).forEach(sw => {
      if (sw?.status !== 'pending' || !sw.shiftB?.id) return;
      recvSwapByShiftId[String(sw.shiftB.id)] = sw;
    });

    const annotated = baseDayShifts.map(sh => {
      const id = sh?.id != null ? String(sh.id) : '';
      const pendingSwap = sentSwapByShiftId[id] || recvSwapByShiftId[id] || null;
      const pendingOffer = sentOfferByShiftId[id] || null;
      if (!pendingSwap && !pendingOffer) return sh;
      return {
        ...sh,
        _pendingSwap: pendingSwap || undefined,
        _pendingSwapRole: pendingSwap
          ? (sentSwapByShiftId[id] ? 'initiator' : 'target')
          : undefined,
        _pendingOffer: pendingOffer || undefined,
      };
    });

    return [...annotated, ...ceded];
  }, [baseDayShifts, myCededOpenings, selectedDateStr, swapsSent, swapsReceived, offersSent]);

  useEffect(() => {
    if (!fabAnimatedOnce.current) {
      fabAnimatedOnce.current = true;
      fabEntryScale.setValue(0);
      const t = setTimeout(() => Animated.spring(fabEntryScale, { toValue: 1, ...SPRING_FAB }).start(), 200);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    const itemCenter = DAY_PADDING + 3 * DAY_ITEM_TOTAL + DAY_ITEM_TOTAL / 2;
    daySelectorRef.current?.scrollTo({ x: Math.max(0, itemCenter - W / 2), animated: true });
  }, [selectedDateStr]);

  useEffect(() => {
    if (shiftPickerVisible) {
      pickerSlideY.setValue(500);
      Animated.spring(pickerSlideY, { toValue: 0, damping: 20, stiffness: 300, mass: 0.8, useNativeDriver: true }).start();
    } else {
      Animated.timing(pickerSlideY, { toValue: 500, duration: DURATION_CLOSE, easing: EASING_CLOSE, useNativeDriver: true }).start();
    }
  }, [shiftPickerVisible]);

  useEffect(() => {
    const userId = user?.id;
    getFullShiftConfig().then(cfg => { setSavedValues(cfg.hourValues); setFullConfig(cfg); }).catch(() => {});
    if (userId) getGroupColors(userId).then(colors => setGroupColors(colors || {}));
  }, [user?.id]);

  useEffect(() => {
    const uid = String(user?.id || '');
    // Chave escopada por uid (legada sem uid como fallback).
    (async () => {
      try {
        const raw = (uid && await SecureStore.getItemAsync(`real_hours_${uid}_${selectedDateStr}`))
          || await SecureStore.getItemAsync(`real_hours_${selectedDateStr}`);
        setDayRealHours(raw ? JSON.parse(raw) : {});
      } catch { setDayRealHours({}); }
    })();
  }, [selectedDateStr, user?.id]);

  const resolveGroupColor = (shift) => {
    const raw = groupColors[String(shift.group?.id)] || shift.group?.color;
    return raw ? (raw.startsWith('#') ? raw : `#${raw}`) : C.primary;
  };

  const shiftTypeKey = (shift) => {
    if (shift.carryover) return 'D';
    if (shift.label === 'FN') return 'FN';
    return shift.label?.charAt(0) || 'M';
  };

  const openShiftDetail = (shift) => {
    // Use the annotated dayShifts (with _pendingSwap / _pendingCede / _pendingOffer)
    // instead of the raw daysWithShifts, so the bottom sheet sees the pending state.
    const allShifts = dayShifts.length > 0 ? dayShifts : [shift];
    const idx = allShifts.findIndex(s => String(s.id) === String(shift.id));
    setBsShifts(allShifts);
    setBsDate(new Date(shift.date + 'T00:00:00'));
    setBsInitialIdx(idx >= 0 ? idx : 0);
    setBsVisible(true);
  };

  const handleFAB = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAddModalVisible(true);
  };

  const dateLabel = () => {
    const wd = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][selectedDate.getDay()];
    return `${wd}, ${selectedDate.getDate()} de ${MONTHS_FULL_PT[selectedDate.getMonth()]}`;
  };

  const renderShiftCard = (shift, index) => {
    const d = new Date(shift.date + 'T00:00:00');
    const groupColor = resolveGroupColor(shift);
    const timeStr = parseShiftTime(shift.time);
    const typeKey = shiftTypeKey(shift);
    const badgeColor = SHIFT_TYPE_COLOR[typeKey] || C.primary;
    const baseValue = calculateShiftValueSync(shift, shift.date, savedValues);
    const value = (() => {
      let mult = 1;
      const monthlyHours = hoursReport?.realHours || 0;
      if (fullConfig?.loyaltyEnabled && fullConfig.loyaltyOptions?.length) {
        const tier = fullConfig.loyaltyOptions
          .filter(o => o.minHours <= monthlyHours)
          .sort((a, b) => b.minHours - a.minHours)[0];
        if (tier) mult += tier.percentage / 100;
      }
      if (fullConfig?.bonusEnabled && fullConfig.bonus) {
        const month = new Date(shift.date + 'T00:00:00').getMonth() + 1;
        if (month >= fullConfig.bonus.startMonth && month <= fullConfig.bonus.endMonth) {
          mult += (parseFloat(fullConfig.bonus.percentage) || 0) / 100;
        }
      }
      // extra hours from registered real hours
      const realEntry = dayRealHours[index];
      let extraValue = 0;
      if (realEntry?.startTime && realEntry?.endTime) {
        const toMin = t => { const [h, m] = t.replace('h', ':').split(':').map(Number); return h * 60 + (m || 0); };
        const scheduledMin = (() => {
          const parts = (shift.time || '').split(/\s*[–-]\s*/);
          if (parts.length < 2) return 0;
          const s = toMin(parts[0].replace(/\s*\([^)]*\)/, '').trim());
          let e = toMin(parts[1].replace(/\s*\([^)]*\)/, '').trim());
          if (e < s) e += 1440;
          return e - s;
        })();
        const realStart = toMin(realEntry.startTime);
        let realEnd = toMin(realEntry.endTime);
        if (realEnd < realStart) realEnd += 1440;
        const extraMin = (realEnd - realStart) - scheduledMin;
        if (extraMin > 0 && savedValues) {
          const period = getShiftPeriod(shift.label);
          const useWe = shouldUseWeekendValue(shift.date, shift.label, fullConfig?.fridayNightAsWeekend);
          const hourly = parseFloat((useWe ? savedValues.weekend : savedValues.weekday)?.[period]) || 0;
          extraValue = roundCurrency((extraMin / 60) * hourly * mult);
        }
      }
      return roundCurrency(baseValue * mult) + extraValue;
    })();

    let coworkers = TodayCoworkersService.getCoworkers(shift.id);
    if (coworkers.length === 0) {
      // Same dedup + self-exclusion the detail sheet applies (ShiftBottomSheet._getCoworkersForShift)
      const selfId = user?.id ? String(user.id) : null;
      const raw = [
        ...(shift?.originalData?.coworkers || []),
        ...(shift?.originalData?.vacancy?.coworkers || []),
      ];
      const seen = new Set();
      coworkers = [];
      for (const p of raw) {
        if (!p?.id) continue;
        const pid = String(p.id);
        if (seen.has(pid)) continue;
        if (selfId && pid === selfId) continue;
        seen.add(pid);
        coworkers.push(p);
      }
    }
    const vacancies = TodayCoworkersService.getVacanciesByGroup(shift.id);
    const totalVacancies = vacancies.reduce((acc, v) => acc + (v.available ?? 0), 0);

    const pendingCede = shift._pendingCede;
    const pendingSwap = shift._pendingSwap;
    const pendingSwapRole = shift._pendingSwapRole; // 'initiator' | 'target'
    const pendingOffer = shift._pendingOffer;
    const isPending = !!(pendingCede || pendingSwap || pendingOffer);
    const cardBg = isPending ? C.warning + '14' : C.background.card;
    const cardBorder = isPending ? C.warning + '55' : C.border.light;
    const accentColor = isPending ? C.warning : groupColor;

    const pendingBadgeText = pendingCede
      ? 'Cedido'
      : pendingSwap
        ? (pendingSwapRole === 'initiator' ? 'Troca pendente' : 'Pediram troca')
        : pendingOffer ? 'Oferecido' : '';
    const pendingSubText = pendingCede
      ? 'Aguardando colega assumir'
      : pendingSwap
        ? (pendingSwapRole === 'initiator'
            ? `Aguardando ${pendingSwap.targetUserName || 'colega'} aceitar`
            : `${pendingSwap.initiatorUserName || 'Colega'} quer trocar com você`)
        : pendingOffer ? `Cedido para ${pendingOffer.toUserName || 'colega'}` : '';

    return (
      <Pressable
        key={index}
        style={({ pressed }) => [s.shiftCard, { backgroundColor: cardBg, borderColor: cardBorder }, pressed && { opacity: 0.85 }]}
        onPress={() => openShiftDetail(shift)}
      >
        <View style={[s.shiftAccentBar, { backgroundColor: accentColor }]} />
        <View style={s.shiftDateCol}>
          <Text
            style={[s.shiftDay, { color: C.text.primary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            allowFontScaling={false}
          >
            {d.getDate()}
          </Text>
          <Text style={[s.shiftWday, { color: C.text.tertiary }]} numberOfLines={1} allowFontScaling={false}>
            {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
          </Text>
        </View>
        <View style={s.shiftInfoCol}>
          <View style={s.shiftTopRow}>
            <View style={[s.shiftTypeBadge, { backgroundColor: badgeColor + '1f' }]}>
              <Text style={[s.shiftTypeBadgeText, { color: badgeColor }]}>
                {LABEL_MAP[shift.label] || LABEL_MAP[typeKey] || shift.label || 'Plantão'}
              </Text>
            </View>
            {timeStr ? <Text style={[s.shiftTime, { color: C.text.secondary }]}>{timeStr}</Text> : null}
            {!isPending && shift.isFixedSchedule && (
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: C.accentSoft }}>
                <Text style={{ fontSize: 9.5, fontFamily: Typography.fontFamily.bold, color: C.primary, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  Fixa
                </Text>
              </View>
            )}
            {isPending && (
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: C.warning + '22' }}>
                <Text style={{ fontSize: 9.5, fontFamily: Typography.fontFamily.bold, color: C.warning, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  {pendingBadgeText}
                </Text>
              </View>
            )}
          </View>
          {shift.group?.institution?.name
            ? <Text style={[s.shiftInstitution, { color: C.text.primary }]} numberOfLines={1}>{shift.group.institution.name}</Text>
            : null}
          {shift.source === 'received' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Ionicons name="enter-outline" size={11} color={C.text.secondary} />
              <Text style={{ fontSize: 11, color: C.text.secondary }} numberOfLines={1}>
                Recebido de {shift.originUserName || `Doutor#${String(shift.originUserId || '').slice(0, 6)}`}
                {shift.isFixedSchedule_origin ? (
                  <Text style={{ fontStyle: 'italic', color: C.text.tertiary }}> · escala fixa</Text>
                ) : null}
              </Text>
            </View>
          )}
          {isPending && (
            <Text style={{ fontSize: 11.5, color: C.warning, fontFamily: Typography.fontFamily.semiBold, marginTop: 2 }} numberOfLines={1}>
              {pendingSubText}
            </Text>
          )}
          <View style={s.shiftMeta}>
            {shift.group?.name ? (
              <>
                <View style={[s.shiftGroupDot, { backgroundColor: groupColor }]} />
                <Text style={[s.shiftGroupName, { color: C.text.tertiary }]} numberOfLines={1}>{shift.group.name}</Text>
              </>
            ) : null}
            {(coworkers.length > 0 || totalVacancies > 0) && (() => {
              // Mirror ShiftBottomSheet team mini-stack: coworker avatars, one vacancy
              // placeholder, and a single combined overflow chip.
              const hasV = totalVacancies > 0;
              const personPreview = coworkers.slice(0, hasV ? 2 : 3);
              const overflow = (coworkers.length - personPreview.length) + (totalVacancies - (hasV ? 1 : 0));
              return (
                <View style={s.coworkerStack}>
                  {personPreview.map((p, i) => (
                    <View key={p.id || i} style={[s.coworkerAvatar, { marginLeft: i === 0 ? 6 : -5, borderColor: C.background.card }]}>
                      {p.photo
                        ? <Image source={{ uri: p.photo }} style={s.coworkerAvatarImg} />
                        : <View style={[s.coworkerAvatarFallback, { backgroundColor: C.accentSoft }]}>
                            <Text style={[s.coworkerAvatarInitial, { color: C.primary }]}>{(p.name || '?').charAt(0).toUpperCase()}</Text>
                          </View>
                      }
                    </View>
                  ))}
                  {hasV && (
                    <View style={[s.coworkerAvatar, s.coworkerAvatarVacancy, { marginLeft: personPreview.length > 0 ? -5 : 6, borderColor: C.background.card, backgroundColor: C.warning + '18' }]}>
                      <Ionicons name="star-outline" size={10} color={C.warning} />
                    </View>
                  )}
                  {overflow > 0 && (
                    <View style={[s.coworkerAvatar, s.coworkerAvatarOverflow, { marginLeft: -5, backgroundColor: C.border.light, borderColor: C.background.card }]}>
                      <Text style={[s.coworkerAvatarOverflowText, { color: C.text.secondary }]}>+{overflow}</Text>
                    </View>
                  )}
                </View>
              );
            })()}
          </View>
        </View>
        <View style={s.shiftValueCol}>
          {value > 0 ? <Text style={[s.shiftValue, { color: C.money }]}>{fmtBRLk(value)}</Text> : null}
          <Ionicons name="chevron-forward" size={14} color={C.text.tertiary} />
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[s.root, { backgroundColor: C.background.secondary }]} {...swipePan.panHandlers}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + Spacing.sm, backgroundColor: C.background.primary }]}>
        <Pressable onPress={() => navigation?.goBack?.()} style={s.backBtn} hitSlop={Spacing.md}>
          <Ionicons name="chevron-back" size={22} color={C.text.primary} />
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={[s.headerLabel, { color: C.text.tertiary }]}>Dia</Text>
          <Text style={[s.headerDate, { color: C.text.primary, fontFamily: Typography.fontFamily.display }]}>{dateLabel()}</Text>
        </View>
        <Pressable onPress={() => setSelectedDate(today)} style={s.todayBtn} hitSlop={Spacing.sm}>
          <Text style={[s.todayBtnText, { color: C.primary }]}>Hoje</Text>
        </Pressable>
      </View>

      {/* Day selector */}
      <View style={[s.daySelector, { backgroundColor: C.background.primary, borderBottomColor: C.border.light }]}>
        <ScrollView
          ref={daySelectorRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.daySelectorContent}
          decelerationRate={0.92}
          scrollEventThrottle={16}
        >
          {weekDays.map((d, i) => {
            const ds = toDateStr(d);
            const isSelected = ds === selectedDateStr;
            const isToday = ds === toDateStr(today);
            const count = (shiftsMap[ds] || []).length;
            return (
              <Pressable key={i} style={s.dayItem} onPress={() => setSelectedDate(d)}>
                <Text style={[s.dayWeekday, { color: isSelected ? C.primary : C.text.tertiary }]}>
                  {WEEKDAYS_PT[d.getDay()]}
                </Text>
                <View style={[s.dayNumWrap, isSelected && { backgroundColor: C.primary }]}>
                  <Text style={[s.dayNum, { color: isSelected ? '#fff' : isToday ? C.primary : C.text.primary, fontFamily: Typography.fontFamily.bold }]}>
                    {d.getDate()}
                  </Text>
                </View>
                <View style={s.dayDots}>
                  {Array.from({ length: Math.min(count, 3) }).map((_, di) => (
                    <View key={di} style={[s.dayDot, { backgroundColor: SHIFT_ACCENTS[di] }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Shift list */}
      <ScrollView
        style={s.listArea}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        overScrollMode="never"
        bounces={Platform.OS === 'ios'}
      >
        {dayShifts.length === 0 ? (
          <View style={[s.empty, { borderColor: C.border.light }]}>
            <Ionicons name="calendar-outline" size={40} color={C.interactive.inactive} />
            <Text style={[s.emptyTitle, { color: C.text.primary, fontFamily: Typography.fontFamily.semiBold }]}>Nenhum plantão</Text>
            <Text style={[s.emptySubtitle, { color: C.text.secondary }]}>Sem turnos para este dia</Text>
          </View>
        ) : (
          dayShifts.map((shift, index) => renderShiftCard(shift, index))
        )}
      </ScrollView>

      {/* FAB — always visible, adds a manual shift */}
      <Animated.View style={[s.fabWrap, { bottom: insets.bottom + Spacing.lg }, { transform: [{ scale: fabEntryScale }, { scale: fabPressScale }] }]}>
        <Pressable
          style={[s.fab, { backgroundColor: C.primary }]}
          onPress={handleFAB}
          onPressIn={() => Animated.spring(fabPressScale, { toValue: 0.88, ...SPRING_FAB }).start()}
          onPressOut={() => Animated.spring(fabPressScale, { toValue: 1, ...SPRING_FAB }).start()}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      </Animated.View>

      {/* Shift picker (multi-shift FAB) */}
      <Modal visible={shiftPickerVisible} transparent animationType="fade" onRequestClose={() => setShiftPickerVisible(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setShiftPickerVisible(false)} />
        <Animated.View style={[s.pickerSheet, { backgroundColor: C.background.elevated, transform: [{ translateY: pickerSlideY }] }]}>
          <View style={[s.sheetHandle, { backgroundColor: C.border.light }]} />
          <Text style={[s.pickerTitle, { color: C.text.primary }]}>Ver detalhes de qual plantão?</Text>
          {dayShifts.map((shift, index) => {
            const label = LABEL_MAP[shift.label?.charAt(0)] || shift.label || 'Plantão';
            const accent = SHIFT_ACCENTS[index % SHIFT_ACCENTS.length];
            return (
              <Pressable
                key={index}
                style={[s.pickerItem, { borderBottomColor: C.border.light }]}
                onPress={() => { setShiftPickerVisible(false); openShiftDetail(shift); }}
              >
                <View style={[s.pickerDot, { backgroundColor: accent }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.pickerItemLabel, { color: C.text.primary }]}>Plantão {label}</Text>
                  {shift.time ? <Text style={[s.pickerItemSub, { color: C.text.secondary }]}>{shift.time}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.text.tertiary} />
              </Pressable>
            );
          })}
        </Animated.View>
      </Modal>

      <ShiftBottomSheet
        isVisible={bsVisible}
        onClose={() => setBsVisible(false)}
        shifts={bsShifts}
        selectedDate={bsDate}
        initialShiftIndex={bsInitialIdx}
        onCede={(sh) => { setBsVisible(false); setCedeShift(sh); }}
        onTrocar={(sh) => { setBsVisible(false); setTrocarShift(sh); }}
      />
      {cedeShift && <CederFlowSheet key={`cede-${cedeShift.id}`} visible shift={cedeShift} onClose={() => setCedeShift(null)} />}
      {trocarShift && <TrocarFlowSheet key={`trocar-${trocarShift.id}`} visible shift={trocarShift} onClose={() => setTrocarShift(null)} />}

      <AddManualShiftModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        date={selectedDateStr}
      />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  backBtn: { marginRight: Spacing.sm, paddingBottom: 2 },
  headerCenter: { flex: 1 },
  todayBtn: { paddingLeft: Spacing.sm, paddingBottom: 2 },
  todayBtnText: { fontSize: Typography.fontSize.subhead, fontWeight: '600' },
  headerLabel: { fontSize: Typography.fontSize.caption1, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  headerDate: { fontSize: Typography.fontSize.title3, fontWeight: '700', letterSpacing: -0.3 },

  daySelector: { borderBottomWidth: StyleSheet.hairlineWidth },
  daySelectorContent: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 4 },
  dayItem: { alignItems: 'center', width: 44, marginHorizontal: 4, paddingVertical: 4 },
  dayWeekday: { fontSize: Typography.fontSize.caption3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  dayNumWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: Typography.fontSize.callout, fontWeight: '700' },
  dayDots: { flexDirection: 'row', gap: 3, marginTop: 4, height: 6, alignItems: 'center' },
  dayDot: { width: 5, height: 5, borderRadius: 3 },

  listArea: { flex: 1 },

  // ── Compact Shift Card (matches HomeScreen) ──────────────────────────────────
  shiftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 14,
    paddingLeft: 0,
    overflow: 'hidden',
    position: 'relative',
    borderRadius: 14,
    borderWidth: 0.5,
    marginBottom: 10,
    ...Shadows.small,
  },
  shiftAccentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  shiftDateCol: { alignItems: 'center', width: 54, paddingLeft: 16, paddingRight: 12 },
  shiftDay: { fontSize: 22, fontFamily: Typography.fontFamily.display, fontWeight: 'bold', letterSpacing: -0.6, lineHeight: 24 },
  shiftWday: { fontSize: 10, fontFamily: Typography.fontFamily.semiBold, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
  shiftInfoCol: { flex: 1, paddingLeft: 2, paddingRight: 4 },
  shiftTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  shiftTypeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  shiftTypeBadgeText: { fontSize: 9.5, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.4, textTransform: 'uppercase' },
  shiftTime: { fontSize: 12, fontFamily: Typography.fontFamily.regular },
  shiftInstitution: { fontSize: 14, fontFamily: Typography.fontFamily.semiBold, marginBottom: 4 },
  shiftMeta: { flexDirection: 'row', alignItems: 'center' },
  shiftGroupDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5, flexShrink: 0 },
  shiftGroupName: { fontSize: 11, fontFamily: Typography.fontFamily.regular, fontWeight: 'bold', maxWidth: 100 },
  coworkerStack: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  coworkerAvatar: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, overflow: 'hidden' },
  coworkerAvatarImg: { width: 18, height: 18, borderRadius: 9 },
  coworkerAvatarFallback: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  coworkerAvatarInitial: { fontSize: 8, fontWeight: '700' },
  coworkerAvatarOverflow: { alignItems: 'center', justifyContent: 'center' },
  coworkerAvatarOverflowText: { fontSize: 8, fontWeight: '600' },
  coworkerAvatarVacancy: { alignItems: 'center', justifyContent: 'center' },
  shiftValueCol: { alignItems: 'flex-end', gap: 2 },
  shiftValue: { fontSize: 13, fontWeight: '700', fontFamily: Typography.fontFamily.semiBold },
  // ─────────────────────────────────────────────────────────────────────────────

  cedeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 0.5,
    marginBottom: 10,
    overflow: 'hidden',
    ...Shadows.small,
  },
  cedeBannerStrip: { width: 4, alignSelf: 'stretch' },
  cedeBannerTitle: { fontSize: 14, fontFamily: Typography.fontFamily.semiBold, fontWeight: '700' },
  cedeBannerSub: { fontSize: 11, marginTop: 2 },
  cedeBannerBtn: {
    borderWidth: 1,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 12,
  },
  cedeBannerBtnText: { fontSize: 12, fontWeight: '700' },

  empty: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyTitle: { fontSize: Typography.fontSize.body, marginTop: Spacing.sm },
  emptySubtitle: { fontSize: Typography.fontSize.subhead, textAlign: 'center' },

  fabWrap: { position: 'absolute', right: Spacing.lg },
  fab: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  pickerSheet: {
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    paddingBottom: 32,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: BorderRadius.pill, alignSelf: 'center', marginTop: 14, marginBottom: 6 },
  pickerTitle: { fontSize: Typography.fontSize.body, fontWeight: '600', paddingHorizontal: Spacing.lg, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.md,
  },
  pickerDot: { width: 10, height: 10, borderRadius: 5 },
  pickerItemLabel: { fontSize: Typography.fontSize.body, fontWeight: '500' },
  pickerItemSub: { fontSize: Typography.fontSize.footnote, marginTop: 1 },
});

export default DayViewScreen;
