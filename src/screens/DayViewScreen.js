/**
 * DayViewScreen — inline expanded shift cards, no bottom sheet.
 *
 * AUDIT (motion refactor):
 *   Was: FAB had no entry animation; no press feedback; no scroll behavior tuning.
 *   Now: FAB springs in on mount (scale 0→1, delay 200ms after transition).
 *        FAB press: scale 1→0.88→1 spring.
 *        Day selector: auto-scrolls selected item to center on change.
 *        ScrollView: decelerationRate 'fast' (iOS), overScrollMode 'never' (Android).
 *        Haptic feedback on FAB press (expo-haptics).
 *        Coworkers/shift-picker modals: spring open, timing close (custom animation).
 */
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Alert,
  Image,
  Modal,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { IconUsers, IconX } from '@tabler/icons-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useShifts } from '../contexts/ShiftsContext';
import { useColors, Typography, Spacing, BorderRadius, Shadows } from '../constants/DesignSystem';
import { calculateShiftValueWithBreakdown, getFullShiftConfig, computeShiftValue } from '../utils/ShiftValueCalculator';
import { formatMoneyCompact, formatHourlyRate } from '../utils/MoneyFormatter';
import HoursEditModal from '../components/HoursEditModal';
import TimeUtils from '../utils/TimeUtils';
import { useGroups } from '../contexts/GroupsContext';
import { AuthContext } from '../context/AuthContext';
import { getGroupVisibility } from '../utils/GroupVisibilityConfig';
import { getGroupColors } from '../utils/GroupColorConfig';
import TodayCoworkersService from '../services/TodayCoworkersService';

const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_FULL_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const SHIFT_ACCENTS = ['#6cc1c0', '#97cafc', '#41b883', '#7096bb'];

// ─── Animation constants ───────────────────────────────────────────────────────
const { width: W } = Dimensions.get('window');

const SPRING_SHEET    = { damping: 20, stiffness: 300, mass: 0.8, useNativeDriver: true };
const SPRING_FAB      = { damping: 15, stiffness: 380, mass: 0.7, useNativeDriver: true };
const EASING_CLOSE    = Easing.bezier(0.4, 0, 1, 1);
const EASING_OPEN_BG  = Easing.bezier(0, 0, 0.2, 1);
const DURATION_CLOSE  = 260;
const DURATION_BG     = 280;

// Day selector: each item = 44px wide + 4+4px horizontal margin = 52px total; 16px padding
const DAY_ITEM_TOTAL  = 52;
const DAY_PADDING     = Spacing.md;

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

// ── CoworkerAvatar ─────────────────────────────────────────────────────────────

const _initials = (name) =>
  (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w.charAt(0))
    .join('')
    .toUpperCase();

const CoworkerAvatar = ({ person }) => {
  const C = useColors();
  const [imgFailed, setImgFailed] = useState(false);
  const initials = _initials(person.name);
  const firstName = (person.name || '').split(' ')[0];
  const av = makeAvatarStyles(C);
  return (
    <View style={av.item}>
      {person.photo && !imgFailed ? (
        <Image source={{ uri: person.photo }} style={av.photo} onError={() => setImgFailed(true)} />
      ) : (
        <View style={av.fallback}>
          <Text style={av.initials}>{initials}</Text>
        </View>
      )}
      <Text style={av.name} numberOfLines={1}>{firstName}</Text>
    </View>
  );
};

const makeAvatarStyles = (C) => ({
  item: { alignItems: 'center', width: 52, marginRight: Spacing.sm },
  photo: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.border.light },
  fallback: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primaryLight + '28', alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 13, fontWeight: '600', color: C.primaryLight },
  name: { fontSize: 10, color: C.text.secondary, marginTop: 3, maxWidth: 50, textAlign: 'center' },
});

const VacancySlot = () => {
  const C = useColors();
  const av = makeAvatarStyles(C);
  return (
    <View style={av.item}>
      <View style={[av.fallback, { backgroundColor: C.warning + '18', borderWidth: 1.5, borderColor: C.warning + '60', borderStyle: 'dashed' }]}>
        <Ionicons name="star-outline" size={16} color={C.warning} />
      </View>
      <Text style={[av.name, { color: C.warning }]} numberOfLines={1}>Vago</Text>
    </View>
  );
};

const PersonRow = ({ person, C }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = _initials(person.full_name || person.name);
  return (
    <View style={[cw.personRow, { borderBottomColor: C.border.light }]}>
      <View style={cw.avatarWrap}>
        {person.photo && !imgFailed
          ? <Image source={{ uri: person.photo }} style={cw.avatarPhoto} onError={() => setImgFailed(true)} />
          : <View style={[cw.avatarFallback, { backgroundColor: C.primary + '22' }]}>
              <Text style={[cw.avatarInitials, { color: C.primary }]}>{initials}</Text>
            </View>
        }
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[cw.personName, { color: C.text.primary }]} numberOfLines={1}>
          {person.full_name || person.name}
        </Text>
        {(person.description || person.council)
          ? <Text style={[cw.personSub, { color: C.text.tertiary }]} numberOfLines={1}>
              {[person.description, person.council].filter(Boolean).join(' · ')}
            </Text>
          : null}
      </View>
    </View>
  );
};

const VacancyRow = ({ C }) => (
  <View style={[cw.personRow, { borderBottomColor: C.border.light }]}>
    <View style={cw.avatarWrap}>
      <View style={[cw.avatarFallback, { backgroundColor: C.warning + '15', borderWidth: 1.5, borderColor: C.warning + '50', borderStyle: 'dashed' }]}>
        <Ionicons name="star-outline" size={15} color={C.warning} />
      </View>
    </View>
    <View style={{ flex: 1 }}>
      <Text style={[cw.personName, { color: C.warning }]}>Vaga aberta</Text>
      <Text style={[cw.personSub, { color: C.warning + 'AA' }]}>Aguardando preenchimento</Text>
    </View>
  </View>
);

// ── ShiftDetailCard ────────────────────────────────────────────────────────────

const ShiftDetailCard = ({
  shift,
  index,
  accent,
  breakdown,
  realHoursEntry,
  fractionalExtra,
  openHoursEditor,
  confirmClearHours,
  user,
  coworkersById,
  groupsById,
  enabledGroupIds,
  groupColors,
  onOpenCoworkersModal,
}) => {
  const C = useColors();

  const getShiftTypeLabel = (label) => {
    if (!label) return 'Plantão';
    return { M: 'Manhã', T: 'Tarde', N: 'Noite' }[label.charAt(0)] || label;
  };

  const getShiftTypeColor = (label) => {
    if (!label) return C.primary;
    return { M: C.success, T: C.primary, N: C.warning }[label.charAt(0)] || C.primary;
  };

  const calculateDuration = (startTime, endTime) => {
    try {
      const normalize = (t) => t.replace('h', ':');
      const [sh, sm] = normalize(startTime).split(':').map(Number);
      const [eh, em] = normalize(endTime).split(':').map(Number);
      if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null;
      const startMin = sh * 60 + sm;
      let endMin = eh * 60 + em;
      if (endMin < startMin) endMin += 24 * 60;
      return endMin - startMin;
    } catch { return null; }
  };

  const formatMinutesDifference = (minutes) => {
    if (!minutes || minutes === 0) return '0min';
    const abs = Math.abs(minutes);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h${m.toString().padStart(2, '0')}`;
  };

  const getHoursSummary = () => {
    if (!realHoursEntry?.startTime || !realHoursEntry?.endTime) return null;
    const shiftTime = shift.time || '';
    let timeParts = shiftTime.split(' – ');
    if (timeParts.length !== 2) timeParts = shiftTime.split(' - ');
    if (timeParts.length !== 2) return null;
    const [predictedStart, predictedEnd] = timeParts.map(t => t.replace(/\s*\([^)]*\)/, '').trim());
    const predictedDurationMin = calculateDuration(predictedStart, predictedEnd);
    const realDurationMin = calculateDuration(realHoursEntry.startTime, realHoursEntry.endTime);
    if (predictedDurationMin === null || realDurationMin === null) return null;
    const rawDiff = realDurationMin - predictedDurationMin;
    const differenceMin = fractionalExtra
      ? rawDiff
      : rawDiff >= 0 ? Math.floor(rawDiff / 60) * 60 : rawDiff;
    return {
      startTime: realHoursEntry.startTime,
      endTime: realHoursEntry.endTime,
      predictedHours: predictedDurationMin / 60,
      realHours: realDurationMin / 60,
      difference: differenceMin / 60,
      differenceMinutes: differenceMin,
    };
  };

  const _resolveGroupColor = (groupId) => {
    const custom = groupColors[String(groupId)];
    if (custom) return custom.startsWith('#') ? custom : '#' + custom;
    const fromCtx = groupsById?.[groupId]?.color;
    if (fromCtx) return fromCtx.startsWith('#') ? fromCtx : '#' + fromCtx;
    return null;
  };

  const _getCoworkersForShift = () => {
    if (shift?.id && TodayCoworkersService.hasEntry(shift.id)) {
      return TodayCoworkersService.getCoworkers(shift.id);
    }
    const selfId = user?.id ? String(user.id) : null;
    const raw = [
      ...(shift?.originalData?.coworkers || []),
      ...(shift?.originalData?.vacancy?.coworkers || []),
    ];
    const seen = new Set();
    const persons = [];
    for (const p of raw) {
      if (!p?.id) continue;
      const pid = String(p.id);
      if (seen.has(pid)) continue;
      if (selfId && pid === selfId) continue;
      seen.add(pid);
      persons.push(coworkersById?.[pid] || coworkersById?.[p.id] || p);
    }
    if (persons.length === 0) return [];
    if (enabledGroupIds && shift?.group?.id != null) {
      const allowed = enabledGroupIds.some(id => String(id) === String(shift.group.id));
      if (!allowed) return [];
    }
    return persons;
  };

  const _getCoworkersByGroupForShift = (flatPersons) => {
    if (shift?.id && TodayCoworkersService.hasEntry(shift.id)) {
      const grouped = TodayCoworkersService.getCoworkersByGroup(shift.id);
      if (grouped.length > 0) return grouped;
    }
    if (flatPersons.length === 0) return [];
    return [{ groupId: String(shift?.group?.id ?? ''), groupName: shift?.group?.name || '', institutionName: shift?.group?.institution?.name || '', coworkers: flatPersons }];
  };

  const _getVacanciesByGroupForShift = () => {
    if (shift?.id && TodayCoworkersService.hasEntry(shift.id)) {
      return TodayCoworkersService.getVacanciesByGroup(shift.id);
    }
    return [];
  };

  const shiftType = getShiftTypeLabel(shift.label);
  const shiftColor = getShiftTypeColor(shift.label);
  const hoursSummary = getHoursSummary();
  const hasRegisteredHours = hoursSummary !== null;

  const getDisplayValue = () => {
    if (!breakdown) return '0,00';
    const baseMin = shift.splitHours
      ? (shift.splitHours.minutesThisMonth ?? Math.round((shift.splitHours.hoursThisMonth || 0) * 60))
      : (breakdown.standardMinutes || (breakdown.hours || 0) * 60);
    const extraMin = (hoursSummary && hoursSummary.differenceMinutes) || 0;
    return formatMoneyCompact(computeShiftValue(breakdown, baseMin + extraMin));
  };

  const groupColor = _resolveGroupColor(shift.group?.id);

  return (
    <View style={[sd.card, { backgroundColor: C.background.primary, ...Shadows.small }]}>
      {/* Left accent bar */}
      <View style={[sd.accentBar, { backgroundColor: accent }]} />

      <View style={sd.cardInner}>
        {/* Header: type badge + value */}
        <View style={sd.cardHeader}>
          <View style={[sd.typeBadge, { backgroundColor: shiftColor + '15', borderColor: shiftColor + '30' }]}>
            <Text style={[sd.typeBadgeText, { color: shiftColor }]}>{shiftType}</Text>
          </View>
          {shift.splitHours && (
            <View style={[sd.typeBadge, { backgroundColor: C.info + '15', borderColor: C.info + '30', marginLeft: Spacing.xs }]}>
              <Text style={[sd.typeBadgeText, { color: C.info }]}>{shift.splitHours.hoursThisMonth}h mês</Text>
            </View>
          )}
          <View style={sd.valueBox}>
            <Text style={[sd.valueText, { color: C.success }]}>R$ {getDisplayValue()}</Text>
            <Text style={[sd.valueLabel, { color: C.text.tertiary }]}>valor estimado</Text>
          </View>
        </View>

        {/* Details row */}
        <View style={sd.detailsRow}>
          <View style={sd.detailsLeft}>
            <View style={sd.detailLine}>
              <Ionicons name="time-outline" size={18} color={C.text.tertiary} />
              <Text style={[sd.detailText, { color: C.text.secondary }]}>{shift.time || 'Horário não informado'}</Text>
            </View>
            {shift.group?.institution?.name && (
              <View style={sd.detailLine}>
                <Ionicons name="location-outline" size={18} color={C.text.tertiary} />
                <Text style={[sd.detailText, { color: C.text.secondary }]}>{shift.group.institution.name}</Text>
              </View>
            )}
            {shift.group?.name && (
              <View style={sd.detailLine}>
                {groupColor
                  ? <View style={[sd.groupDot, { backgroundColor: groupColor }]} />
                  : <Ionicons name="people-outline" size={18} color={C.text.tertiary} />}
                <Text style={[sd.detailText, sd.groupText, groupColor ? { color: groupColor } : { color: C.text.tertiary }]}>
                  {shift.group.name}
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={[sd.editBtn, hasRegisteredHours && { backgroundColor: C.primary + '10', borderColor: C.primary + '30' }, { borderColor: C.border.light }]}
            onPress={() => openHoursEditor(index)}
          >
            <Ionicons name={hasRegisteredHours ? 'create-outline' : 'time-outline'} size={16} color={hasRegisteredHours ? C.primary : C.text.tertiary} />
          </TouchableOpacity>
        </View>

        {/* Registered hours */}
        {hasRegisteredHours && (
          <>
            <View style={[sd.divider, { backgroundColor: C.border.light }]} />
            <View style={sd.section}>
              <View style={sd.sectionHeader}>
                <View style={sd.sectionHeaderLeft}>
                  <Ionicons name="checkmark-circle" size={16} color={C.success} />
                  <Text style={[sd.sectionTitle, { color: C.text.secondary }]}>Horas registradas</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                  {hoursSummary.differenceMinutes !== 0 && (
                    <View style={[sd.extrasBadge, {
                      backgroundColor: hoursSummary.differenceMinutes > 0 ? C.success + '15' : C.error + '15',
                      borderColor: hoursSummary.differenceMinutes > 0 ? C.success + '30' : C.error + '30',
                    }]}>
                      <Ionicons name={hoursSummary.differenceMinutes > 0 ? 'trending-up-outline' : 'trending-down-outline'} size={13} color={hoursSummary.differenceMinutes > 0 ? C.success : C.error} />
                      <Text style={[sd.extrasText, { color: hoursSummary.differenceMinutes > 0 ? C.success : C.error }]}>
                        {hoursSummary.differenceMinutes > 0 ? '+' : '-'}{formatMinutesDifference(Math.abs(hoursSummary.differenceMinutes))}
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity style={[sd.clearBtn, { backgroundColor: C.error + '10', borderColor: C.error + '20' }]} onPress={() => confirmClearHours(index)}>
                    <Ionicons name="trash-outline" size={14} color={C.error} />
                    <Text style={[sd.clearBtnText, { color: C.error }]}>Limpar</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[sd.timeDisplay, { color: C.text.primary }]}>{hoursSummary.startTime} – {hoursSummary.endTime}</Text>
                {realHoursEntry?.registeredAt && (
                  <Text style={[sd.captionText, { color: C.text.tertiary }]}>
                    {(() => {
                      try {
                        const d = new Date(realHoursEntry.registeredAt);
                        return !isNaN(d.getTime()) ? `🕐 ${d.toLocaleDateString('pt-BR')}` : '';
                      } catch { return ''; }
                    })()}
                  </Text>
                )}
              </View>
            </View>
          </>
        )}

        {/* Quem está também */}
        {(() => {
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const shiftDate = new Date(shift.date + 'T00:00:00');
          const isPast = shiftDate < today;
          const isFuture = shiftDate > today;
          if (isFuture && !TodayCoworkersService.hasEntry(shift.id)) return null;
          const shiftCoworkers = _getCoworkersForShift();
          const vacancies = isPast ? [] : _getVacanciesByGroupForShift();
          const totalVacancies = vacancies.reduce((acc, v) => acc + (v.available ?? 0), 0);
          if (shiftCoworkers.length === 0 && totalVacancies === 0) return null;
          const MAX_PREVIEW = 4;
          const hasVacancies = totalVacancies > 0;
          const maxPersons = hasVacancies ? MAX_PREVIEW - 1 : MAX_PREVIEW;
          const personPreview = shiftCoworkers.slice(0, maxPersons);
          const vacancyPreview = hasVacancies ? 1 : 0;
          const overflow = (shiftCoworkers.length - personPreview.length) + (totalVacancies - vacancyPreview);
          return (
            <>
              <View style={[sd.divider, { backgroundColor: C.border.light }]} />
              <TouchableOpacity
                style={sd.section}
                onPress={() => {
                  const rawGroups = _getCoworkersByGroupForShift(shiftCoworkers);
                  const coworkersByGroup = rawGroups.map(g => ({ ...g, groupColor: _resolveGroupColor(g.groupId) || g.groupColor || null }));
                  const institution = shift?.group?.institution?.name || '';
                  const label = { M: 'Manhã', T: 'Tarde', N: 'Noite' }[shift?.label] || shift?.label || '';
                  onOpenCoworkersModal({
                    coworkers: shiftCoworkers,
                    coworkersByGroup,
                    vacanciesByGroup: _getVacanciesByGroupForShift(),
                    title: institution || label,
                    subtitle: institution ? label : '',
                  });
                }}
                activeOpacity={0.7}
              >
                <View style={sd.sectionHeader}>
                  <View style={sd.sectionHeaderLeft}>
                    <Ionicons name="people-outline" size={16} color={C.primary} />
                    <Text style={[sd.sectionTitle, { color: C.text.secondary }]}>
                      Quem está também ({shiftCoworkers.length}{totalVacancies > 0 ? ` + ${totalVacancies} vaga${totalVacancies > 1 ? 's' : ''}` : ''})
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={C.text.tertiary} />
                </View>
                <View style={sd.coworkersRow}>
                  {personPreview.map(person => <CoworkerAvatar key={person.id} person={person} />)}
                  {Array.from({ length: vacancyPreview }).map((_, i) => <VacancySlot key={`v-${i}`} />)}
                  {overflow > 0 && (
                    <View style={sd.overflowWrap}>
                      <View style={[sd.overflowCircle, { backgroundColor: C.border.light }]}>
                        <Text style={[sd.overflowText, { color: C.text.secondary }]}>+{overflow}</Text>
                      </View>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </>
          );
        })()}

        {/* Composição do valor */}
        {breakdown && (
          <>
            <View style={[sd.divider, { backgroundColor: C.border.light }]} />
            <View style={sd.section}>
              <View style={sd.sectionHeader}>
                <View style={sd.sectionHeaderLeft}>
                  <Ionicons name="calculator-outline" size={16} color={C.primary} />
                  <Text style={[sd.sectionTitle, { color: C.text.secondary }]}>Composição do valor</Text>
                </View>
              </View>
              <View style={{ gap: Spacing.xs }}>
                {shift.splitHours ? (
                  <>
                    <View style={sd.calcRow}>
                      <Text style={[sd.calcText, { color: C.info }]}>
                        {formatHourlyRate(breakdown.hourlyValue)} × {shift.splitHours.hoursThisMonth}h (split){breakdown.isFridayNight ? ' (Sexta N)' : ''}{breakdown.weekend && breakdown.isNaturalWeekend ? ' (FDS)' : ''}
                      </Text>
                      <Text style={[sd.calcAmount, { color: C.info }]}>R$ {formatMoneyCompact((breakdown.hourlyValue || 0) * shift.splitHours.hoursThisMonth)}</Text>
                    </View>
                    {breakdown.loyaltyPercentage > 0 && (
                      <View style={sd.calcRow}>
                        <Text style={[sd.calcText, { color: C.primary }]}>+ Fidelização {breakdown.loyaltyPercentage}% (sobre {shift.splitHours.hoursThisMonth}h)</Text>
                        <Text style={[sd.calcAmount, { color: C.primary }]}>R$ {formatMoneyCompact(((breakdown.hourlyValue || 0) * shift.splitHours.hoursThisMonth * breakdown.loyaltyPercentage) / 100)}</Text>
                      </View>
                    )}
                    {breakdown.generalBonusPercentage > 0 && (
                      <View style={sd.calcRow}>
                        <Text style={[sd.calcText, { color: C.success }]}>+ Bônus {breakdown.generalBonusPercentage}% (sobre {shift.splitHours.hoursThisMonth}h)</Text>
                        <Text style={[sd.calcAmount, { color: C.success }]}>R$ {formatMoneyCompact(((breakdown.hourlyValue || 0) * shift.splitHours.hoursThisMonth * breakdown.generalBonusPercentage) / 100)}</Text>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    <View style={sd.calcRow}>
                      <Text style={[sd.calcText, { color: C.text.secondary }]}>
                        {formatHourlyRate(breakdown.hourlyValue)} × {breakdown.hours || 0}h{breakdown.weekend && breakdown.isNaturalWeekend ? ' (FDS)' : ''}{breakdown.isFridayNight ? ' (Sexta N)' : ''}
                      </Text>
                      <Text style={[sd.calcAmount, { color: C.text.primary }]}>R$ {formatMoneyCompact(breakdown.baseValue) || '0,00'}</Text>
                    </View>
                    {breakdown.loyaltyBonus > 0 && (
                      <View style={sd.calcRow}>
                        <Text style={[sd.calcText, { color: C.primary }]}>+ Fidelização {breakdown.loyaltyPercentage}%</Text>
                        <Text style={[sd.calcAmount, { color: C.primary }]}>R$ {formatMoneyCompact(breakdown.loyaltyBonus)}</Text>
                      </View>
                    )}
                    {breakdown.generalBonus > 0 && (
                      <View style={sd.calcRow}>
                        <Text style={[sd.calcText, { color: C.success }]}>+ Bônus {breakdown.generalBonusPercentage}%</Text>
                        <Text style={[sd.calcAmount, { color: C.success }]}>R$ {formatMoneyCompact(breakdown.generalBonus)}</Text>
                      </View>
                    )}
                  </>
                )}
                {hoursSummary && hoursSummary.differenceMinutes !== 0 && (
                  <View style={sd.calcRow}>
                    <Text style={[sd.calcText, { color: hoursSummary.differenceMinutes > 0 ? C.success : C.error }]}>
                      {hoursSummary.differenceMinutes > 0 ? '+ ' : '- '}Horas {hoursSummary.differenceMinutes > 0 ? 'extras' : 'faltantes'}: {TimeUtils.minutesToDisplay(Math.abs(hoursSummary.differenceMinutes))}
                    </Text>
                    <Text style={[sd.calcAmount, { color: hoursSummary.differenceMinutes > 0 ? C.success : C.error }]}>
                      {hoursSummary.differenceMinutes > 0 ? '+' : '-'} R$ {formatMoneyCompact(Math.abs((hoursSummary.differenceMinutes / 60) * (breakdown.hourlyValue || 0) * (1 + (breakdown.loyaltyPercentage || 0) / 100 + (breakdown.generalBonusPercentage || 0) / 100)))}
                    </Text>
                  </View>
                )}
                {breakdown.isFridayNight && (
                  <Text style={[sd.captionText, { color: C.warning, marginTop: Spacing.xs }]}>- Sexta-feira (N) - aplicando valor de FDS</Text>
                )}
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
};

// ── Shift card detail styles ───────────────────────────────────────────────────
const sd = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  accentBar: { width: 4 },
  cardInner: { flex: 1 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.bold,
  },
  valueBox: { flex: 1, alignItems: 'flex-end' },
  valueText: {
    fontSize: Typography.fontSize.title3,
    fontWeight: Typography.fontWeight.bold,
    marginBottom: 1,
  },
  valueLabel: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.medium,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  detailsLeft: { flex: 1, gap: Spacing.sm },
  detailLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  detailText: { fontSize: Typography.fontSize.body, fontWeight: Typography.fontWeight.medium, flex: 1 },
  groupText: { fontSize: Typography.fontSize.footnote },
  groupDot: { width: 10, height: 10, borderRadius: 5, marginRight: 2, flexShrink: 0 },
  editBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: Spacing.md, borderWidth: 1,
  },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: Spacing.md },
  section: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  sectionTitle: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  extrasBadge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: BorderRadius.full, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  extrasText: { fontSize: Typography.fontSize.caption1, fontWeight: Typography.fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  clearBtnText: { fontSize: Typography.fontSize.caption2, fontWeight: Typography.fontWeight.semiBold, textTransform: 'uppercase', letterSpacing: 0.3 },
  timeDisplay: { fontSize: Typography.fontSize.body, fontWeight: Typography.fontWeight.semiBold, letterSpacing: 0.3 },
  captionText: { fontSize: Typography.fontSize.caption2, fontWeight: Typography.fontWeight.medium },
  coworkersRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: Spacing.xs, overflow: 'hidden' },
  overflowWrap: { width: 52, alignItems: 'center', marginRight: Spacing.sm },
  overflowCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  overflowText: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  calcText: { fontSize: Typography.fontSize.footnote, fontWeight: Typography.fontWeight.medium, flex: 1 },
  calcAmount: { fontSize: Typography.fontSize.footnote, fontWeight: Typography.fontWeight.semiBold, textAlign: 'right' },
});

// ── DayViewScreen ──────────────────────────────────────────────────────────────

const DayViewScreen = ({ navigation, initialDate }) => {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const { daysWithShifts } = useShifts();
  const { user } = useContext(AuthContext);
  const { coworkersById, groupsById } = useGroups();

  const today = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState(initialDate || today);

  const [shiftBreakdowns, setShiftBreakdowns] = useState({});
  const [realHours, setRealHours] = useState({});
  const [fractionalExtra, setFractionalExtra] = useState(true);
  const [enabledGroupIds, setEnabledGroupIds] = useState(null);
  const [groupColors, setGroupColors] = useState({});

  const [editingShift, setEditingShift] = useState(null);
  const [coworkersModal, setCoworkersModal] = useState(null);
  const [shiftPickerVisible, setShiftPickerVisible] = useState(false);

  // ── Animation refs ───────────────────────────────────────────────────────────
  const daySelectorRef  = useRef(null);
  const fabEntryScale   = useRef(new Animated.Value(0)).current;
  const fabPressScale   = useRef(new Animated.Value(1)).current;
  const fabAnimatedOnce = useRef(false);
  // Sheet modal positions (start offscreen below, spring to 0)
  const pickerSlideY    = useRef(new Animated.Value(500)).current;
  const coworkersSlideY = useRef(new Animated.Value(500)).current;

  const weekDays = useMemo(() => buildWeekDays(selectedDate), [selectedDate]);

  const shiftsMap = useMemo(() => {
    const map = {};
    (daysWithShifts || []).forEach(d => { map[d.date] = d.shifts || []; });
    return map;
  }, [daysWithShifts]);

  const selectedDateStr = toDateStr(selectedDate);
  const dayShifts = shiftsMap[selectedDateStr] || [];

  // FAB spring entry — fires once when shifts first appear
  useEffect(() => {
    if (dayShifts.length > 0 && !fabAnimatedOnce.current) {
      fabAnimatedOnce.current = true;
      fabEntryScale.setValue(0);
      const t = setTimeout(() => {
        Animated.spring(fabEntryScale, { toValue: 1, ...SPRING_FAB }).start();
      }, 200);
      return () => clearTimeout(t);
    }
  }, [dayShifts.length]);

  // Day selector auto-scroll: keep selected item (always index 3) centered
  useEffect(() => {
    const itemCenter = DAY_PADDING + 3 * DAY_ITEM_TOTAL + DAY_ITEM_TOTAL / 2;
    const scrollX = Math.max(0, itemCenter - W / 2);
    daySelectorRef.current?.scrollTo({ x: scrollX, animated: true });
  }, [selectedDateStr]);

  // Shift picker sheet: spring open, timing close
  useEffect(() => {
    if (shiftPickerVisible) {
      pickerSlideY.setValue(500);
      Animated.spring(pickerSlideY, { toValue: 0, ...SPRING_SHEET }).start();
    } else {
      Animated.timing(pickerSlideY, { toValue: 500, duration: DURATION_CLOSE, easing: EASING_CLOSE, useNativeDriver: true }).start();
    }
  }, [shiftPickerVisible]);

  // Coworkers sheet: spring open, timing close
  useEffect(() => {
    if (coworkersModal !== null) {
      coworkersSlideY.setValue(500);
      Animated.spring(coworkersSlideY, { toValue: 0, ...SPRING_SHEET }).start();
    } else {
      Animated.timing(coworkersSlideY, { toValue: 500, duration: DURATION_CLOSE, easing: EASING_CLOSE, useNativeDriver: true }).start();
    }
  }, [coworkersModal]);

  // Load config, visibility, colors
  useEffect(() => {
    getFullShiftConfig().then(cfg => setFractionalExtra(cfg.fractionalExtraHours ?? true));
    if (user?.id) {
      getGroupVisibility(user.id).then(config => setEnabledGroupIds(config ? config.enabledGroupIds : null));
      getGroupColors(user.id).then(colors => setGroupColors(colors || {}));
    }
  }, [user?.id]);

  // Load real hours on date change
  useEffect(() => {
    const load = async () => {
      try {
        const dateKey = selectedDate.toISOString().split('T')[0];
        const saved = await SecureStore.getItemAsync(`real_hours_${dateKey}`);
        setRealHours(saved ? JSON.parse(saved) : {});
      } catch (error) {
        console.warn('Erro ao carregar horas reais:', error);
      }
    };
    load();
  }, [selectedDateStr]);

  // Load breakdowns on date/shifts change
  useEffect(() => {
    const load = async () => {
      if (!dayShifts.length) return;
      const dateString = selectedDate.toISOString().split('T')[0];
      const breakdowns = {};
      for (let i = 0; i < dayShifts.length; i++) {
        try {
          breakdowns[i] = await calculateShiftValueWithBreakdown(dayShifts[i], dateString, 0);
        } catch (error) {
          console.warn('Erro ao carregar breakdown:', error);
          breakdowns[i] = { baseValue: 0, finalValue: 0, hourlyValue: 130, hours: 6 };
        }
      }
      setShiftBreakdowns(breakdowns);
    };
    load();
  }, [selectedDateStr, dayShifts.length]);

  const saveRealHours = async (newRealHours) => {
    try {
      const dateKey = selectedDate.toISOString().split('T')[0];
      await SecureStore.setItemAsync(`real_hours_${dateKey}`, JSON.stringify(newRealHours));
      setRealHours(newRealHours);
    } catch (error) {
      console.error('Erro ao salvar horas reais:', error);
    }
  };

  const openHoursEditor = (shiftIndex) => {
    if (typeof shiftIndex !== 'number' || shiftIndex < 0 || !dayShifts[shiftIndex]) return;
    setEditingShift(shiftIndex);
  };

  const handleSaveHours = (shiftIndex, hours) => {
    if (!dayShifts[shiftIndex] || !hours || typeof hours !== 'object') return;
    const shift = dayShifts[shiftIndex];
    const newRealHours = {
      ...realHours,
      [shiftIndex]: {
        ...hours,
        shiftId: shift.id || `${shift.label}_${shiftIndex}`,
        shiftType: shift.label || 'M',
        shiftTime: shift.time || 'Horário não informado',
        groupName: shift.group?.name || 'Sem grupo',
        institutionName: shift.group?.institution?.name || 'Sem instituição',
        registeredAt: new Date().toISOString(),
      },
    };
    saveRealHours(newRealHours);
    setEditingShift(null);
  };

  const confirmClearHours = (shiftIndex) => {
    Alert.alert(
      'Limpar Horas Registradas',
      'Deseja realmente limpar as horas registradas para este plantão? Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sim, limpar', style: 'destructive', onPress: () => {
          if (typeof shiftIndex !== 'number' || !realHours[shiftIndex]) return;
          const newRealHours = { ...realHours };
          delete newRealHours[shiftIndex];
          saveRealHours(newRealHours);
        }},
      ]
    );
  };

  const handleFAB = () => {
    if (dayShifts.length === 0) return;
    if (dayShifts.length === 1) {
      openHoursEditor(0);
    } else {
      setShiftPickerVisible(true);
    }
  };

  const dateLabel = () => {
    const wd = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][selectedDate.getDay()];
    return `${wd}, ${selectedDate.getDate()} de ${MONTHS_FULL_PT[selectedDate.getMonth()]}`;
  };

  return (
    <View style={[s.root, { backgroundColor: C.background.secondary }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + Spacing.sm, backgroundColor: C.background.primary }]}>
        <Pressable onPress={() => navigation?.goBack?.()} style={s.backBtn} hitSlop={Spacing.md}>
          <Ionicons name="chevron-back" size={22} color={C.text.primary} />
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={[s.headerLabel, { color: C.text.tertiary, fontFamily: Typography.fontFamily.regular }]}>Hoje</Text>
          <Text style={[s.headerDate, { color: C.text.primary, fontFamily: Typography.fontFamily.display }]}>{dateLabel()}</Text>
        </View>
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
                <Text style={[s.dayWeekday, { color: isSelected ? C.primary : C.text.tertiary, fontFamily: Typography.fontFamily.medium }]}>
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
          dayShifts.map((shift, index) => (
            <ShiftDetailCard
              key={index}
              shift={shift}
              index={index}
              accent={SHIFT_ACCENTS[index % SHIFT_ACCENTS.length]}
              breakdown={shiftBreakdowns[index]}
              realHoursEntry={realHours[index]}
              fractionalExtra={fractionalExtra}
              openHoursEditor={openHoursEditor}
              confirmClearHours={confirmClearHours}
              user={user}
              coworkersById={coworkersById}
              groupsById={groupsById}
              enabledGroupIds={enabledGroupIds}
              groupColors={groupColors}
              onOpenCoworkersModal={setCoworkersModal}
            />
          ))
        )}
      </ScrollView>

      {/* FAB — spring entry + press scale + haptic */}
      {dayShifts.length > 0 && (
        <Animated.View style={[
          s.fabWrap,
          { bottom: insets.bottom + Spacing.lg },
          { transform: [{ scale: fabEntryScale }, { scale: fabPressScale }] },
        ]}>
          <Pressable
            style={[s.fab, { backgroundColor: C.primary }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handleFAB();
            }}
            onPressIn={() => Animated.spring(fabPressScale, { toValue: 0.88, ...SPRING_FAB }).start()}
            onPressOut={() => Animated.spring(fabPressScale, { toValue: 1, ...SPRING_FAB }).start()}
          >
            <Ionicons name="add" size={28} color="#fff" />
          </Pressable>
        </Animated.View>
      )}

      {/* Shift picker (multi-shift FAB) — spring open, timing close */}
      <Modal visible={shiftPickerVisible} transparent animationType="fade" onRequestClose={() => setShiftPickerVisible(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setShiftPickerVisible(false)} />
        <Animated.View style={[s.pickerSheet, { backgroundColor: C.background.elevated, transform: [{ translateY: pickerSlideY }] }]}>
          <View style={[s.sheetHandle, { backgroundColor: C.border.light }]} />
          <Text style={[s.pickerTitle, { color: C.text.primary }]}>Registrar horas em qual plantão?</Text>
          {dayShifts.map((shift, index) => {
            const label = { M: 'Manhã', T: 'Tarde', N: 'Noite' }[shift.label?.charAt(0)] || shift.label || 'Plantão';
            const accent = SHIFT_ACCENTS[index % SHIFT_ACCENTS.length];
            return (
              <Pressable
                key={index}
                style={[s.pickerItem, { borderBottomColor: C.border.light }]}
                onPress={() => { setShiftPickerVisible(false); openHoursEditor(index); }}
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

      {/* Coworkers sheet — redesigned */}
      <Modal visible={coworkersModal !== null} transparent animationType="fade" onRequestClose={() => setCoworkersModal(null)}>
        <Pressable style={s.modalBackdrop} onPress={() => setCoworkersModal(null)} />
        <Animated.View style={[s.cwSheet, { backgroundColor: C.background.primary, transform: [{ translateY: coworkersSlideY }] }]}>
          {/* Handle */}
          <View style={[s.cwHandle, { backgroundColor: C.border.medium }]} />

          {/* Header */}
          <View style={s.cwHeader}>
            <View style={[s.cwIconBadge, { backgroundColor: C.primary + '18' }]}>
              <IconUsers size={20} color={C.primary} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.cwTitle, { color: C.text.primary }]}>{coworkersModal?.title || 'Quem está também'}</Text>
              {coworkersModal?.subtitle
                ? <Text style={[s.cwSubtitle, { color: C.text.secondary }]} numberOfLines={1}>{coworkersModal.subtitle}</Text>
                : null}
            </View>
            <Pressable onPress={() => setCoworkersModal(null)} style={[s.cwCloseBtn, { backgroundColor: C.background.secondary }]} hitSlop={8}>
              <IconX size={18} color={C.text.tertiary} strokeWidth={2} />
            </Pressable>
          </View>

          {/* List */}
          <ScrollView
            style={{ maxHeight: '70%' }}
            contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl }}
            showsVerticalScrollIndicator={false}
          >
            {(() => {
              const groups = coworkersModal?.coworkersByGroup?.length > 0
                ? coworkersModal.coworkersByGroup
                : coworkersModal?.coworkers?.length > 0
                  ? [{ groupId: '', groupName: '', institutionName: '', coworkers: coworkersModal.coworkers }]
                  : [];
              const vacanciesByGroup = coworkersModal?.vacanciesByGroup || [];
              const showGroupHeaders = groups.length > 1 || (groups.length === 1 && groups[0].groupName);

              return groups.map((group, gi) => {
                const groupVacancies = vacanciesByGroup.filter(v => !group.groupId || String(v.groupId) === String(group.groupId));
                const totalInGroup = group.coworkers.length + groupVacancies.reduce((a, v) => a + (v.available ?? 0), 0);

                return (
                  <View key={group.groupId || gi}>
                    {showGroupHeaders && (
                      <View style={s.cwGroupHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {group.groupColor
                            ? <View style={[s.cwGroupDot, { backgroundColor: group.groupColor }]} />
                            : null}
                          <Text style={[s.cwGroupName, { color: C.text.primary }]} numberOfLines={1}>
                            {group.groupName || 'Grupo'}
                          </Text>
                        </View>
                        <View style={[s.cwCountPill, { backgroundColor: C.background.secondary }]}>
                          <Text style={[s.cwCountText, { color: C.text.tertiary }]}>{totalInGroup}</Text>
                        </View>
                      </View>
                    )}

                    {group.coworkers.map((person, pi) => (
                      <PersonRow key={person.id || pi} person={person} C={C} />
                    ))}

                    {groupVacancies.flatMap((v, vi) =>
                      Array.from({ length: v.available ?? 0 }).map((_, si) => (
                        <VacancyRow key={`v-${vi}-${si}`} C={C} />
                      ))
                    )}
                  </View>
                );
              });
            })()}
          </ScrollView>
        </Animated.View>
      </Modal>

      {/* HoursEditModal */}
      <HoursEditModal
        visible={editingShift !== null && typeof editingShift === 'number' && editingShift >= 0}
        onClose={() => setEditingShift(null)}
        onSave={(hours) => handleSaveHours(editingShift, hours)}
        shift={editingShift !== null && dayShifts[editingShift] ? dayShifts[editingShift] : null}
        currentHours={editingShift !== null && realHours[editingShift] ? realHours[editingShift] : {}}
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
  pickerTitle: { fontSize: Typography.fontSize.body, fontWeight: Typography.fontWeight.semiBold, paddingHorizontal: Spacing.lg, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  pickerDot: { width: 10, height: 10, borderRadius: 5 },
  pickerItemLabel: { fontSize: Typography.fontSize.body, fontWeight: Typography.fontWeight.medium },
  pickerItemSub: { fontSize: Typography.fontSize.footnote, marginTop: 1 },

  modalHeader: { alignItems: 'center', paddingTop: 0, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm, width: '100%' },
  modalGroupHeader: { paddingTop: Spacing.md, paddingBottom: Spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: Spacing.xs },
  modalGroupName: { fontSize: Typography.fontSize.footnote, fontWeight: Typography.fontWeight.semiBold, textTransform: 'uppercase', letterSpacing: 0.4 },
  modalPersonRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },

  // coworkers sheet
  cwSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 32 },
  cwHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  cwHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.sm },
  cwIconBadge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cwTitle: { fontSize: Typography.fontSize.headline, fontWeight: Typography.fontWeight.semiBold, fontFamily: Typography.fontFamily.semiBold },
  cwSubtitle: { fontSize: Typography.fontSize.caption1, marginTop: 1 },
  cwCloseBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cwGroupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  cwGroupDot: { width: 8, height: 8, borderRadius: 4 },
  cwGroupName: { fontSize: Typography.fontSize.footnote, fontWeight: Typography.fontWeight.semiBold, textTransform: 'uppercase', letterSpacing: 0.5 },
  cwCountPill: { borderRadius: BorderRadius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  cwCountText: { fontSize: Typography.fontSize.caption2, fontWeight: Typography.fontWeight.semiBold },
});

const cw = StyleSheet.create({
  personRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.md },
  avatarWrap: { width: 44, height: 44 },
  avatarPhoto: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 15, fontWeight: '700' },
  personName: { fontSize: Typography.fontSize.callout, fontWeight: Typography.fontWeight.medium, fontFamily: Typography.fontFamily.medium },
  personSub: { fontSize: Typography.fontSize.caption1, marginTop: 2 },
});

export default DayViewScreen;
