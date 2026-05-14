/**
 * ShiftBottomSheet — animated detail sheet for shift cards.
 *
 * AUDIT (motion refactor):
 *   Was: open and close both used Animated.timing (300ms / 250ms flat).
 *        PanResponder snap-back also used Animated.timing (200ms).
 *   Now: open uses Animated.spring (damping:20, stiffness:300, mass:0.8) — feels physical.
 *        close keeps Animated.timing with ease-in (spec: timing for intentional dismiss).
 *        PanResponder snap-back uses same spring as open.
 */
import React, { useRef, useEffect, useState, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  PanResponder,
  Dimensions,
  Pressable,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useColors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';
import { calculateShiftValueWithBreakdown, calculateShiftValue, getFullShiftConfig, computeShiftValue } from '../utils/ShiftValueCalculator';
import { formatMoney, formatMoneyCompact, formatHourlyRate } from '../utils/MoneyFormatter';
import HoursEditModal from './HoursEditModal';
import TimeUtils from '../utils/TimeUtils';
import { useGroups } from '../contexts/GroupsContext';
import { AuthContext } from '../context/AuthContext';
import { getGroupVisibility } from '../utils/GroupVisibilityConfig';
import { getGroupColors } from '../utils/GroupColorConfig';
import TodayCoworkersService from '../services/TodayCoworkersService';

// ── CoworkerAvatar ─────────────────────────────────────────────────────────────
// Small circular avatar with photo or initials fallback.
// Defined outside ShiftBottomSheet so it gets its own stable render identity.

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

  return (
    <View style={makeAvatarStyles(C).item}>
      {person.photo && !imgFailed ? (
        <Image
          source={{ uri: person.photo }}
          style={makeAvatarStyles(C).photo}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <View style={makeAvatarStyles(C).fallback}>
          <Text style={makeAvatarStyles(C).initials}>{initials}</Text>
        </View>
      )}
      <Text style={makeAvatarStyles(C).name} numberOfLines={1}>{firstName}</Text>
    </View>
  );
};

const makeAvatarStyles = (C) => ({
  item: {
    alignItems: 'center',
    width: 52,
    marginRight: Spacing.sm,
  },
  photo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.border.light,
  },
  fallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.primaryLight + '28',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontSize: 13,
    fontWeight: '600',
    color: C.primaryLight,
  },
  name: {
    fontSize: 10,
    color: C.text.secondary,
    marginTop: 3,
    maxWidth: 50,
    textAlign: 'center',
  },
});

/** Placeholder avatar for an open vacancy slot */
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const BOTTOM_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.75;
const BOTTOM_SHEET_MIN_HEIGHT = 0;

const ShiftBottomSheet = ({
  isVisible,
  onClose,
  shifts,
  selectedDate,
  calculateShiftValue,
  onHoursChanged,
  onNavigateToGroup,
}) => {
  const C = useColors();
  const s = makeStyles(C);

  const translateY = useRef(new Animated.Value(BOTTOM_SHEET_MAX_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [shiftBreakdowns, setShiftBreakdowns] = useState({});
  const [realHours, setRealHours] = useState({});
  const [editingShift, setEditingShift] = useState(null);
  const [fractionalExtra, setFractionalExtra] = useState(true);

  // ── "Quem está também" state ────────────────────────────────────────────────
  const { user } = useContext(AuthContext);
  const { coworkersById, groupsById } = useGroups();
  const [enabledGroupIds, setEnabledGroupIds] = useState(null);
  const [groupColors, setGroupColors] = useState({});
  const [coworkersModal, setCoworkersModal] = useState(null);

  // Carregar horas reais salvas
  useEffect(() => {
    const loadRealHours = async () => {
      if (!shifts || !selectedDate) return;

      try {
        let date;
        if (selectedDate instanceof Date) {
          date = selectedDate;
        } else if (typeof selectedDate === 'string' && selectedDate.trim() !== '') {
          date = new Date(selectedDate);
        } else {
          console.warn('selectedDate inválido ou vazio:', selectedDate);
          return;
        }

        if (isNaN(date.getTime())) {
          console.warn('selectedDate inválido após conversão:', selectedDate);
          return;
        }

        const dateKey = date.toISOString().split('T')[0];
        const savedHours = await SecureStore.getItemAsync(`real_hours_${dateKey}`);

        if (savedHours) {
          setRealHours(JSON.parse(savedHours));
        } else {
          setRealHours({});
        }
      } catch (error) {
        console.warn('Erro ao carregar horas reais:', error);
      }
    };

    if (isVisible) {
      loadRealHours();
    }
  }, [shifts, selectedDate, isVisible]);


  // Salvar horas reais
  const saveRealHours = async (newRealHours) => {
    try {
      let date;
      if (selectedDate instanceof Date) {
        date = selectedDate;
      } else if (typeof selectedDate === 'string' && selectedDate.trim() !== '') {
        date = new Date(selectedDate);
      } else {
        console.error('selectedDate inválido ou vazio para salvar:', selectedDate);
        return;
      }

      if (isNaN(date.getTime())) {
        console.error('selectedDate inválido após conversão para salvar:', selectedDate);
        return;
      }

      const dateKey = date.toISOString().split('T')[0];
      await SecureStore.setItemAsync(`real_hours_${dateKey}`, JSON.stringify(newRealHours));
      setRealHours(newRealHours);

      if (onHoursChanged) {
        onHoursChanged(dateKey, newRealHours);
      }
    } catch (error) {
      console.error('Erro ao salvar horas reais:', error);
    }
  };

  // Abrir modal de edição
  const openHoursEditor = (shiftIndex) => {
    if (typeof shiftIndex !== 'number' || shiftIndex < 0 || !shifts || !shifts[shiftIndex]) {
      console.error('❌ Tentativa de abrir editor com índice inválido:', { shiftIndex, shiftsLength: shifts?.length });
      return;
    }

    setEditingShift(shiftIndex);
  };

  // Salvar horas do modal
  const handleSaveHours = (shiftIndex, hours) => {
    if (!shifts || !shifts[shiftIndex]) {
      console.error('❌ Shift inválido para salvar horas:', { shiftIndex, shiftsLength: shifts?.length });
      return;
    }

    if (!hours || typeof hours !== 'object') {
      console.error('❌ Dados de horas inválidos:', hours);
      return;
    }

    const shift = shifts[shiftIndex];
    const newRealHours = { ...realHours };

    newRealHours[shiftIndex] = {
      ...hours,
      shiftId: shift.id || `${shift.label}_${shiftIndex}`,
      shiftType: shift.label || 'M',
      shiftTime: shift.time || 'Horário não informado',
      groupName: shift.group?.name || 'Sem grupo',
      institutionName: shift.group?.institution?.name || 'Sem instituição',
      registeredAt: new Date().toISOString(),
    };

    saveRealHours(newRealHours);
    setEditingShift(null);
  };

  // Confirmar limpeza de horas
  const confirmClearHours = (shiftIndex) => {
    Alert.alert(
      "Limpar Horas Registradas",
      "Deseja realmente limpar as horas registradas para este plantão? Esta ação não pode ser desfeita.",
      [
        {
          text: "Cancelar",
          style: "cancel"
        },
        {
          text: "Sim, limpar",
          style: "destructive",
          onPress: () => clearHours(shiftIndex)
        }
      ]
    );
  };

  // Limpar horas registradas de um plantão específico
  const clearHours = (shiftIndex) => {
    if (typeof shiftIndex !== 'number' || shiftIndex < 0 || !realHours[shiftIndex]) {
      console.warn('❌ Tentativa de limpar horas de índice inválido:', shiftIndex);
      return;
    }

    const newRealHours = { ...realHours };
    delete newRealHours[shiftIndex];
    saveRealHours(newRealHours);
  };

  // Calcular diferença de horas para exibição
  const getHoursSummary = (shift, shiftIndex) => {
    if (!shift || typeof shiftIndex !== 'number' || shiftIndex < 0) {
      return null;
    }

    const shiftRealHours = realHours[shiftIndex];
    if (!shiftRealHours || typeof shiftRealHours !== 'object') {
      return null;
    }

    if (!shiftRealHours.startTime || !shiftRealHours.endTime) {
      console.log('🔍 getHoursSummary - Horários incompletos:', {
        startTime: shiftRealHours.startTime,
        endTime: shiftRealHours.endTime
      });
      return null;
    }

    const shiftTime = shift.time || '';
    console.log('🔍 getHoursSummary - shiftTime original:', shiftTime);

    let timeParts = shiftTime.split(' – ');
    if (timeParts.length !== 2) {
      timeParts = shiftTime.split(' - ');
    }
    if (timeParts.length !== 2) {
      console.log('🔍 getHoursSummary - Não conseguiu dividir o horário:', timeParts);
      return null;
    }

    const [predictedStart, predictedEnd] = timeParts.map(time => time.replace(/\s*\([^)]*\)/, '').trim());
    console.log('🔍 getHoursSummary - Horários extraídos:', { predictedStart, predictedEnd });

    const predictedDurationMin = calculateDuration(predictedStart, predictedEnd);
    const realDurationMin = calculateDuration(shiftRealHours.startTime, shiftRealHours.endTime);

    console.log('🔍 getHoursSummary - Durações calculadas:', {
      predictedStart,
      predictedEnd,
      predictedDurationMin,
      realStart: shiftRealHours.startTime,
      realEnd: shiftRealHours.endTime,
      realDurationMin
    });

    if (predictedDurationMin === null || realDurationMin === null) {
      console.log('🔍 getHoursSummary - Duração nula, cancelando cálculo');
      return null;
    }

    const rawDiff = realDurationMin - predictedDurationMin;
    const differenceMin = fractionalExtra
      ? rawDiff
      : rawDiff >= 0
        ? Math.floor(rawDiff / 60) * 60
        : rawDiff;

    console.log('🔍 getHoursSummary - Diferença final:', {
      realDurationMin,
      predictedDurationMin,
      differenceMin,
      differenceFormatted: formatMinutesDifference(differenceMin)
    });

    return {
      startTime: shiftRealHours.startTime,
      endTime: shiftRealHours.endTime,
      predictedHours: predictedDurationMin / 60,
      realHours: realDurationMin / 60,
      difference: differenceMin / 60,
      differenceMinutes: differenceMin
    };
  };

  // Calcular duração entre dois horários (retorna minutos para maior precisão)
  const calculateDuration = (startTime, endTime) => {
    try {
      console.log('🔍 calculateDuration - Input:', { startTime, endTime });

      const normalizeTime = (time) => {
        const normalized = time.replace('h', ':');
        console.log('🔍 calculateDuration - Normalizado:', time, '->', normalized);
        return normalized;
      };

      const normalizedStart = normalizeTime(startTime);
      const normalizedEnd = normalizeTime(endTime);

      const [startHour, startMin] = normalizedStart.split(':').map(Number);
      const [endHour, endMin] = normalizedEnd.split(':').map(Number);

      console.log('🔍 calculateDuration - Componentes:', {
        startHour, startMin, endHour, endMin,
        startValid: !isNaN(startHour) && !isNaN(startMin),
        endValid: !isNaN(endHour) && !isNaN(endMin)
      });

      if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) {
        console.log('🔍 calculateDuration - Valores inválidos detectados');
        return null;
      }

      const startTotalMin = startHour * 60 + startMin;
      let endTotalMin = endHour * 60 + endMin;

      if (endTotalMin < startTotalMin) {
        endTotalMin += 24 * 60;
        console.log('🔍 calculateDuration - Detectada passagem de dia');
      }

      const duration = endTotalMin - startTotalMin;
      console.log('🔍 calculateDuration - Resultado:', {
        startTotalMin,
        endTotalMin,
        duration
      });

      return duration;
    } catch (error) {
      console.error('🔍 calculateDuration - Erro:', error);
      return null;
    }
  };

  // Formatar duração em horas e minutos
  const formatDuration = (hours) => {
    if (hours === null || isNaN(hours)) return '0h';

    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);

    if (minutes === 0) {
      return `${wholeHours}h`;
    }

    return `${wholeHours}h${minutes.toString().padStart(2, '0')}`;
  };

  // Formatar diferença de minutos de forma precisa
  const formatMinutesDifference = (minutes) => {
    console.log('🔍 formatMinutesDifference - Input:', minutes);

    if (!minutes || minutes === 0) {
      console.log('🔍 formatMinutesDifference - Retornando 0min');
      return '0min';
    }

    const absMinutes = Math.abs(minutes);
    const hours = Math.floor(absMinutes / 60);
    const remainingMinutes = absMinutes % 60;

    let result;
    if (hours === 0) {
      result = `${remainingMinutes}min`;
    } else if (remainingMinutes === 0) {
      result = `${hours}h`;
    } else {
      result = `${hours}h${remainingMinutes.toString().padStart(2, '0')}`;
    }

    console.log('🔍 formatMinutesDifference - Output:', {
      minutes,
      absMinutes,
      hours,
      remainingMinutes,
      result
    });

    return result;
  };

  // Carregar breakdowns quando shifts ou data mudarem
  useEffect(() => {
    const loadBreakdowns = async () => {
      if (!shifts || !selectedDate) return;

      let dateString;
      try {
        if (selectedDate instanceof Date) {
          if (isNaN(selectedDate.getTime())) {
            console.warn('selectedDate é um Date inválido:', selectedDate);
            return;
          }
          dateString = selectedDate.toISOString().split('T')[0];
        } else if (typeof selectedDate === 'string' && selectedDate.trim() !== '') {
          dateString = selectedDate.trim();
        } else {
          console.warn('selectedDate tem formato inesperado ou está vazio:', selectedDate);
          return;
        }
      } catch (error) {
        console.warn('Erro ao processar selectedDate:', error, selectedDate);
        return;
      }

      const breakdowns = {};
      for (let i = 0; i < shifts.length; i++) {
        const shift = shifts[i];
        try {
          const result = await calculateShiftValueWithBreakdown(shift, dateString, 0);
          breakdowns[i] = result;
        } catch (error) {
          console.warn('Erro ao carregar breakdown para shift:', error);
          const simpleValue = calculateShiftValue ? calculateShiftValue(shift, dateString) : 0;
          breakdowns[i] = {
            baseValue: simpleValue,
            finalValue: simpleValue,
            hourlyValue: 130,
            hours: 6
          };
        }
      }
      setShiftBreakdowns(breakdowns);
    };

    if (isVisible) {
      loadBreakdowns();
    }
  }, [shifts, selectedDate, isVisible]);

  useEffect(() => {
    if (isVisible) {
      // Open: spring for the sheet (physical feel), timing for backdrop
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 20,
          stiffness: 300,
          mass: 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.bezier(0, 0, 0.2, 1),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Close: timing with ease-in (intentional dismiss — spec says timing for close)
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: BOTTOM_SHEET_MAX_HEIGHT,
          duration: 260,
          easing: Easing.bezier(0.4, 0, 1, 1),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 220,
          easing: Easing.bezier(0.4, 0, 1, 1),
          useNativeDriver: true,
        }),
      ]).start();

      setEditingShift(null);
    }

    if (isVisible) {
      getFullShiftConfig().then(cfg => {
        setFractionalExtra(cfg.fractionalExtraHours ?? true);
      });
      if (user?.id) {
        getGroupVisibility(user.id).then(config => {
          setEnabledGroupIds(config ? config.enabledGroupIds : null);
        });
        getGroupColors(user.id).then(colors => {
          setGroupColors(colors || {});
        });
      }
    }
  }, [isVisible]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      const isDownward = gestureState.dy > 10;
      const isMoreVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      return isDownward && isMoreVertical;
    },
    onPanResponderMove: (_, gestureState) => {
      if (gestureState.dy > 0) {
        translateY.setValue(gestureState.dy);
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 100 || gestureState.vy > 0.5) {
        onClose();
      } else {
        // Snap back: same spring as open — feels like it bounces back
        Animated.spring(translateY, {
          toValue: 0,
          damping: 20,
          stiffness: 300,
          mass: 0.8,
          useNativeDriver: true,
        }).start();
      }
    },
  });

  const formatDateHeader = (dateInput) => {
    if (!dateInput) return '';

    try {
      let date;

      if (dateInput instanceof Date) {
        date = dateInput;
      } else if (typeof dateInput === 'string') {
        if (dateInput.includes('-')) {
          const [year, month, day] = dateInput.split('-');
          date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        } else {
          date = new Date(dateInput);
        }
      } else {
        date = new Date(dateInput);
      }

      if (isNaN(date.getTime())) {
        return 'Data inválida';
      }

      const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' });
      const dayMonth = date.toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long'
      });

      return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${dayMonth}`;
    } catch (error) {
      console.warn('Erro ao formatar data do header:', error);
      return 'Data inválida';
    }
  };

  const formatTime = (timeString) => {
    if (!timeString) return 'Horário não informado';
    return timeString;
  };

  const getShiftTypeLabel = (label) => {
    if (!label) return 'Plantão';

    const typeMap = {
      'M': 'Manhã',
      'T': 'Tarde',
      'N': 'Noite'
    };

    const type = label.charAt(0);
    return typeMap[type] || label;
  };

  const getShiftTypeColor = (label) => {
    if (!label) return C.primary;

    const colorMap = {
      'M': C.success,
      'T': C.primary,
      'N': C.warning
    };

    const type = label.charAt(0);
    return colorMap[type] || C.primary;
  };

  // ── Helpers for "Quem está também" ─────────────────────────────────────────

  const _getCoworkersForShift = (shift) => {
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

  const _getCoworkersByGroupForShift = (shift, flatPersons) => {
    if (shift?.id && TodayCoworkersService.hasEntry(shift.id)) {
      const grouped = TodayCoworkersService.getCoworkersByGroup(shift.id);
      if (grouped.length > 0) return grouped;
    }
    if (flatPersons.length === 0) return [];
    return [{
      groupId: String(shift?.group?.id ?? ''),
      groupName: shift?.group?.name || '',
      institutionName: shift?.group?.institution?.name || '',
      coworkers: flatPersons,
    }];
  };

  const _getVacanciesByGroupForShift = (shift) => {
    if (shift?.id && TodayCoworkersService.hasEntry(shift.id)) {
      return TodayCoworkersService.getVacanciesByGroup(shift.id);
    }
    return [];
  };

  const _resolveGroupColor = (groupId) => {
    const custom = groupColors[String(groupId)];
    if (custom) return custom.startsWith('#') ? custom : '#' + custom;
    const fromContext = groupsById?.[groupId]?.color;
    if (fromContext) return fromContext.startsWith('#') ? fromContext : '#' + fromContext;
    return null;
  };

  const openCoworkersModal = (shift, persons) => {
    const institution = shift?.group?.institution?.name || '';
    const label = { M: 'Manhã', T: 'Tarde', N: 'Noite' }[shift?.label] || shift?.label || '';
    const rawGroups = _getCoworkersByGroupForShift(shift, persons);
    const coworkersByGroup = rawGroups.map(g => ({
      ...g,
      groupColor: _resolveGroupColor(g.groupId) || g.groupColor || null,
    }));
    const vacanciesByGroup = _getVacanciesByGroupForShift(shift);
    setCoworkersModal({
      coworkers: persons,
      coworkersByGroup,
      vacanciesByGroup,
      title: institution || label,
      subtitle: institution ? label : '',
    });
  };

  // ── End "Quem está também" helpers ──────────────────────────────────────────

  const renderShiftCard = (shift, index) => {
    if (!shift || typeof index !== 'number' || index < 0) {
      console.error('❌ renderShiftCard - Parâmetros inválidos:', { shift: !!shift, index });
      return null;
    }

    const breakdown = shiftBreakdowns[index];
    const shiftType = getShiftTypeLabel(shift.label);
    const shiftColor = getShiftTypeColor(shift.label);
    const hoursSummary = getHoursSummary(shift, index);
    const hasRegisteredHours = hoursSummary !== null;

    const getDisplayValue = () => {
      if (!breakdown) return '0,00';

      const baseMin = shift.splitHours
        ? (shift.splitHours.minutesThisMonth ?? Math.round((shift.splitHours.hoursThisMonth || 0) * 60))
        : (breakdown.standardMinutes || (breakdown.hours || 0) * 60);

      const extraMin = (hoursSummary && hoursSummary.differenceMinutes) || 0;
      const totalMin = baseMin + extraMin;

      return formatMoneyCompact(computeShiftValue(breakdown, totalMin));
    };

    return (
      <View key={index} style={s.shiftCard}>
        <View style={[s.shiftAccentBar, { backgroundColor: shiftColor }]} />
        {/* Header do Card com Tipo e Valor */}
        <View style={s.shiftHeader}>
          <View style={[s.shiftTypeBadge, { backgroundColor: shiftColor + '15', borderColor: shiftColor + '30' }]}>
            <Text style={[s.shiftTypeText, { color: shiftColor }]}>
              {shiftType}
            </Text>
          </View>

          {shift.splitHours && (
            <View style={[s.shiftTypeBadge, s.splitInlineBadge]}>
              <Text style={[s.shiftTypeText, { color: C.info }]}>
                {shift.splitHours.hoursThisMonth}h mês
              </Text>
            </View>
          )}

          <View style={s.shiftValueContainer}>
            <Text style={s.shiftValueText}>
              R$ {getDisplayValue()}
            </Text>
            <Text style={s.shiftValueLabel}>valor estimado</Text>
          </View>
        </View>

        {/* Detalhes do Plantão com Botão Integrado */}
        <View style={s.shiftDetails}>
          <View style={s.detailsContent}>
            <View style={s.detailsLeft}>
              <View style={s.shiftDetailRow}>
                <Ionicons name="time-outline" size={18} color={C.text.tertiary} />
                <Text style={s.shiftDetailText}>
                  {formatTime(shift.time)}
                </Text>
              </View>

              {shift.group?.institution?.name && (
                <View style={s.shiftDetailRow}>
                  <Ionicons name="location-outline" size={18} color={C.text.tertiary} />
                  <Text style={s.shiftDetailText}>
                    {shift.group.institution.name}
                  </Text>
                </View>
              )}

              {shift.group?.name && (
                <View style={s.shiftDetailRow}>
                  {(() => {
                    const groupColor = _resolveGroupColor(shift.group?.id);
                    return groupColor
                      ? <View style={[s.groupColorDot, { backgroundColor: groupColor }]} />
                      : <Ionicons name="people-outline" size={18} color={C.text.tertiary} />;
                  })()}
                  <Text style={[s.shiftDetailText, s.groupText, _resolveGroupColor(shift.group?.id) ? {
                    color: _resolveGroupColor(shift.group?.id),
                  } : null]}>
                    {shift.group.name}
                  </Text>
                </View>
              )}
            </View>

            {/* Botão de Ação Integrado */}
            <TouchableOpacity
              style={[
                s.compactActionButton,
                hasRegisteredHours && s.compactActionButtonActive
              ]}
              onPress={() => openHoursEditor(index)}
            >
              <Ionicons
                name={hasRegisteredHours ? "create-outline" : "time-outline"}
                size={16}
                color={hasRegisteredHours ? C.primary : C.text.tertiary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Seção de Horas Registradas */}
        {hasRegisteredHours && (
          <>
            <View style={s.divider} />
            <View style={s.registeredHoursSection}>
              <View style={s.registeredHoursHeader}>
                <View style={s.registeredHoursHeaderLeft}>
                  <Ionicons name="checkmark-circle" size={16} color={C.success} />
                  <Text style={s.registeredHoursTitle}>Horas registradas</Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                  {hoursSummary.differenceMinutes !== 0 && (
                    <View style={[
                      s.extrasIndicator,
                      { marginBottom: 0, marginTop: 0,
                        backgroundColor: hoursSummary.differenceMinutes > 0 ? C.success + '15' : C.error + '15',
                        borderColor:     hoursSummary.differenceMinutes > 0 ? C.success + '30' : C.error + '30',
                      }
                    ]}>
                      <Ionicons
                        name={hoursSummary.differenceMinutes > 0 ? 'trending-up-outline' : 'trending-down-outline'}
                        size={13}
                        color={hoursSummary.differenceMinutes > 0 ? C.success : C.error}
                      />
                      <Text style={[s.extrasText, { color: hoursSummary.differenceMinutes > 0 ? C.success : C.error }]}>
                        {hoursSummary.differenceMinutes > 0 ? '+' : '-'}{formatMinutesDifference(Math.abs(hoursSummary.differenceMinutes))}
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity style={s.clearButton} onPress={() => confirmClearHours(index)}>
                    <Ionicons name="trash-outline" size={14} color={C.error} />
                    <Text style={s.clearButtonText}>Limpar</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={s.registeredHoursDetails}>
                <View style={s.registeredHoursDisplay}>
                  <Text style={s.registeredHoursTime}>
                    {hoursSummary.startTime} – {hoursSummary.endTime}
                  </Text>
                </View>
                <View style={s.shiftContextInfo}>
                  {realHours[index]?.registeredAt && (
                    <Text style={s.contextInfoText}>
                      🕐 Registrado em {(() => {
                        try {
                          const date = new Date(realHours[index].registeredAt);
                          return !isNaN(date.getTime()) ? date.toLocaleDateString('pt-BR') : 'Data inválida';
                        } catch (error) { return 'Data inválida'; }
                      })()}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </>
        )}

        {/* Quem está também — compact tap-to-detail */}
        {(() => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const shiftDate = new Date(shift.date + 'T00:00:00');
          const isPast = shiftDate < today;
          const isFuture = shiftDate > today;

          if (isFuture && !TodayCoworkersService.hasEntry(shift.id)) return null;

          const shiftCoworkers = _getCoworkersForShift(shift);
          const vacancies = isPast ? [] : _getVacanciesByGroupForShift(shift);
          const totalVacancies = vacancies.reduce((acc, v) => acc + (v.available ?? 0), 0);
          if (shiftCoworkers.length === 0 && totalVacancies === 0) return null;

          const MAX_PREVIEW = 4;
          const hasVacancies = totalVacancies > 0;
          const maxPersons = hasVacancies ? MAX_PREVIEW - 1 : MAX_PREVIEW;
          const personPreview = shiftCoworkers.slice(0, maxPersons);
          const vacancyPreview = hasVacancies ? 1 : 0;
          const personOverflow = shiftCoworkers.length - personPreview.length;
          const vacancyOverflow = totalVacancies - vacancyPreview;
          const overflow = personOverflow + vacancyOverflow;

          return (
            <>
              <View style={s.divider} />
              <TouchableOpacity
                style={s.registeredHoursSection}
                onPress={() => openCoworkersModal(shift, shiftCoworkers)}
                activeOpacity={0.7}
              >
                <View style={s.registeredHoursHeader}>
                  <View style={s.registeredHoursHeaderLeft}>
                    <Ionicons name="people-outline" size={16} color={C.primary} />
                    <Text style={s.registeredHoursTitle}>
                      Quem está também ({shiftCoworkers.length}{totalVacancies > 0 ? ` + ${totalVacancies} vaga${totalVacancies > 1 ? 's' : ''}` : ''})
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={C.text.tertiary} />
                </View>
                <View style={s.coworkersRow}>
                  {personPreview.map(person => (
                    <CoworkerAvatar key={person.id} person={person} />
                  ))}
                  {Array.from({ length: vacancyPreview }).map((_, i) => (
                    <VacancySlot key={`vacancy-${i}`} />
                  ))}
                  {overflow > 0 && (
                    <View style={s.coworkerOverflow}>
                      <View style={s.coworkerOverflowCircle}>
                        <Text style={s.coworkerOverflowText}>+{overflow}</Text>
                      </View>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </>
          );
        })()}

        {/* Composição do Valor */}
        {breakdown && (
          <>
            <View style={s.divider} />

            <View style={s.registeredHoursSection}>
              <View style={s.registeredHoursHeader}>
                <View style={s.registeredHoursHeaderLeft}>
                  <Ionicons name="calculator-outline" size={16} color={C.primary} />
                  <Text style={s.registeredHoursTitle}>
                    Composição do valor
                  </Text>
                </View>
              </View>

              <View style={s.valueCalculationDetails}>
                {shift.splitHours ? (
                  <>
                    <View style={s.valueCalculationRow}>
                      <Text style={[s.valueCalculationText, { color: C.info }]}>
                        {formatHourlyRate(breakdown.hourlyValue)} × {shift.splitHours.hoursThisMonth}h (split - este mês)
                        {breakdown.weekend && breakdown.isNaturalWeekend ? ' (FDS)' : ''}
                        {breakdown.isFridayNight ? ' (Sexta N)' : ''}
                      </Text>
                      <Text style={[s.valueCalculationAmount, { color: C.info }]}>
                        R$ {formatMoneyCompact((breakdown.hourlyValue || 0) * shift.splitHours.hoursThisMonth)}
                      </Text>
                    </View>

                    {breakdown.loyaltyPercentage > 0 && (
                      <View style={s.valueCalculationRow}>
                        <Text style={[s.valueCalculationText, { color: C.primary }]}>
                          + Fidelização {breakdown.loyaltyPercentage}% (sobre {shift.splitHours.hoursThisMonth}h)
                        </Text>
                        <Text style={[s.valueCalculationAmount, { color: C.primary }]}>
                          R$ {formatMoneyCompact(((breakdown.hourlyValue || 0) * shift.splitHours.hoursThisMonth * breakdown.loyaltyPercentage) / 100)}
                        </Text>
                      </View>
                    )}

                    {breakdown.generalBonusPercentage > 0 && (
                      <View style={s.valueCalculationRow}>
                        <Text style={[s.valueCalculationText, { color: C.success }]}>
                          + Bônus {breakdown.generalBonusPercentage}% (sobre {shift.splitHours.hoursThisMonth}h)
                        </Text>
                        <Text style={[s.valueCalculationAmount, { color: C.success }]}>
                          R$ {formatMoneyCompact(((breakdown.hourlyValue || 0) * shift.splitHours.hoursThisMonth * breakdown.generalBonusPercentage) / 100)}
                        </Text>
                      </View>
                    )}

                    {hoursSummary && hoursSummary.differenceMinutes !== 0 && (
                      <View style={s.valueCalculationRow}>
                        <Text style={[s.valueCalculationText, {
                          color: hoursSummary.differenceMinutes > 0 ? C.success : C.error
                        }]}>
                          {hoursSummary.differenceMinutes > 0 ? '+ ' : '- '}
                          Horas {hoursSummary.differenceMinutes > 0 ? 'extras' : 'faltantes'}: {
                            TimeUtils.minutesToDisplay(Math.abs(hoursSummary.differenceMinutes))
                          }
                        </Text>
                        <Text style={[s.valueCalculationAmount, {
                          color: hoursSummary.differenceMinutes > 0 ? C.success : C.error
                        }]}>
                          {hoursSummary.differenceMinutes > 0 ? '+' : '-'} R$ {
                            formatMoneyCompact(Math.abs((hoursSummary.differenceMinutes / 60) * (breakdown.hourlyValue || 0) * (
                              1 + (breakdown.loyaltyPercentage || 0) / 100 + (breakdown.generalBonusPercentage || 0) / 100
                            )))
                          }
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    <View style={s.valueCalculationRow}>
                      <Text style={s.valueCalculationText}>
                        {formatHourlyRate(breakdown.hourlyValue)} × {breakdown.hours || 0}h
                        {breakdown.weekend && breakdown.isNaturalWeekend ? ' (FDS)' : ''}
                        {breakdown.isFridayNight ? ' (Sexta N)' : ''}
                      </Text>
                      <Text style={s.valueCalculationAmount}>
                        R$ {formatMoneyCompact(breakdown.baseValue) || '0,00'}
                      </Text>
                    </View>

                    {breakdown.loyaltyBonus > 0 && (
                      <View style={s.valueCalculationRow}>
                        <Text style={[s.valueCalculationText, { color: C.primary }]}>
                          + Fidelização {breakdown.loyaltyPercentage}%
                        </Text>
                        <Text style={[s.valueCalculationAmount, { color: C.primary }]}>
                          R$ {formatMoneyCompact(breakdown.loyaltyBonus)}
                        </Text>
                      </View>
                    )}

                    {breakdown.generalBonus > 0 && (
                      <View style={s.valueCalculationRow}>
                        <Text style={[s.valueCalculationText, { color: C.success }]}>
                          + Bônus {breakdown.generalBonusPercentage}%
                        </Text>
                        <Text style={[s.valueCalculationAmount, { color: C.success }]}>
                          R$ {formatMoneyCompact(breakdown.generalBonus)}
                        </Text>
                      </View>
                    )}

                    {hoursSummary && hoursSummary.differenceMinutes !== 0 && (
                      <View style={s.valueCalculationRow}>
                        <Text style={[s.valueCalculationText, {
                          color: hoursSummary.differenceMinutes > 0 ? C.success : C.error
                        }]}>
                          {hoursSummary.differenceMinutes > 0 ? '+ ' : '- '}
                          Horas {hoursSummary.differenceMinutes > 0 ? 'extras' : 'faltantes'}: {
                            TimeUtils.minutesToDisplay(Math.abs(hoursSummary.differenceMinutes))
                          }
                        </Text>
                        <Text style={[s.valueCalculationAmount, {
                          color: hoursSummary.differenceMinutes > 0 ? C.success : C.error
                        }]}>
                          {hoursSummary.differenceMinutes > 0 ? '+' : '-'} R$ {
                            formatMoneyCompact(Math.abs((hoursSummary.differenceMinutes / 60) * (breakdown.hourlyValue || 0) * (
                              1 + (breakdown.loyaltyPercentage || 0) / 100 + (breakdown.generalBonusPercentage || 0) / 100
                            )))
                          }
                        </Text>
                      </View>
                    )}
                  </>
                )}

                {breakdown.isFridayNight && (
                  <View style={s.shiftContextInfo}>
                    <Text style={[s.contextInfoText, { color: C.warning }]}>
                    - Sexta-feira (N) - aplicando valor de FDS
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </>
        )}
      </View>
    );
  };

  if (!isVisible) return null;

  return (
    <View style={s.container}>
      {/* Backdrop */}
      <Animated.View
        style={[
          s.backdrop,
          { opacity: backdropOpacity }
        ]}
      >
        <Pressable style={s.backdropPressable} onPress={onClose} />
      </Animated.View>

      {/* Bottom Sheet */}
      <Animated.View
        style={[
          s.bottomSheet,
          { transform: [{ translateY }] }
        ]}
      >
        {/* Área de gesto para fechar - apenas handle e header */}
        <View style={s.gestureArea} {...panResponder.panHandlers}>
          {/* Handle */}
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <View style={s.headerContent}>
              <Text style={s.dateTitle}>{formatDateHeader(selectedDate)}</Text>
              <Text style={s.shiftsCountText}>
                {shifts.length} {shifts.length === 1 ? 'plantão agendado' : 'plantões agendados'}
              </Text>
            </View>

            <Pressable style={s.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={C.text.secondary} />
            </Pressable>
          </View>
        </View>

        {/* Content */}
        <ScrollView
          style={s.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scrollContent}
          bounces={false}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled={true}
          overScrollMode="never"
        >
          {shifts && shifts.length > 0 ? (
            shifts.map((shift, index) => renderShiftCard(shift, index))
          ) : (
            <View style={s.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={C.text.tertiary} />
              <Text style={s.emptyTitle}>Nenhum plantão</Text>
              <Text style={s.emptySubtitle}>Não há plantões agendados para este dia</Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>

      {/* Modal — Quem está também (detalhe) */}
      <Modal
        visible={coworkersModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setCoworkersModal(null)}
      >
        <Pressable style={s.modalBackdrop} onPress={() => setCoworkersModal(null)} />
        <View style={s.modalSheet}>
          {/* Header */}
          <View style={s.modalHeader}>
            <View style={s.handle} />
            <View style={s.modalTitleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>{coworkersModal?.title}</Text>
                {coworkersModal?.subtitle ? (
                  <Text style={s.modalSubtitle}>{coworkersModal.subtitle}</Text>
                ) : null}
              </View>
              <Pressable onPress={() => setCoworkersModal(null)} style={s.modalClose}>
                <Ionicons name="close" size={22} color={C.text.secondary} />
              </Pressable>
            </View>
          </View>

          {/* List — grouped by group, vacancies inline within each group */}
          <ScrollView
            style={s.modalList}
            contentContainerStyle={s.modalListContent}
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
                const groupVacancies = vacanciesByGroup.filter(
                  v => !group.groupId || String(v.groupId) === String(group.groupId)
                );
                return (
                  <View key={group.groupId || gi}>
                    {showGroupHeaders ? (
                      <TouchableOpacity
                        style={s.modalGroupHeader}
                        activeOpacity={onNavigateToGroup && group.groupId ? 0.6 : 1}
                        onPress={() => {
                          if (onNavigateToGroup && group.groupId) {
                            setCoworkersModal(null);
                            setTimeout(() => onNavigateToGroup({ id: group.groupId, name: group.groupName }), 200);
                          }
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {group.groupColor ? (
                            <View style={[s.groupColorDot, { backgroundColor: group.groupColor }]} />
                          ) : null}
                          <Text style={s.modalGroupName} numberOfLines={1}>
                            {group.groupName || 'Grupo'}
                          </Text>
                          {onNavigateToGroup && group.groupId ? (
                            <Ionicons name="chevron-forward" size={14} color={C.text.tertiary} />
                          ) : null}
                        </View>
                        {group.institutionName ? (
                          <Text style={s.modalGroupInstitution} numberOfLines={1}>
                            {group.institutionName}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    ) : null}
                    {group.coworkers.map(person => (
                      <View key={person.id} style={s.modalPersonRow}>
                        <CoworkerAvatar person={person} />
                        <View style={s.modalPersonInfo}>
                          <Text style={s.modalPersonName} numberOfLines={1}>
                            {person.full_name || person.name}
                          </Text>
                          {person.description ? (
                            <Text style={s.modalPersonDesc} numberOfLines={1}>
                              {person.description}
                            </Text>
                          ) : null}
                          {person.council ? (
                            <Text style={s.modalPersonCouncil} numberOfLines={1}>
                              {person.council}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                    {groupVacancies.flatMap((v, vi) =>
                      Array.from({ length: v.available ?? 0 }).map((_, si) => {
                        const av = makeAvatarStyles(C);
                        return (
                          <View key={`vacancy-${v.groupId || vi}-${si}`} style={s.modalPersonRow}>
                            <View style={av.item}>
                              <View style={[av.fallback, { backgroundColor: C.warning + '18', borderWidth: 1.5, borderColor: C.warning + '60', borderStyle: 'dashed' }]}>
                                <Ionicons name="star-outline" size={16} color={C.warning} />
                              </View>
                              <Text style={[av.name, { color: C.warning }]} numberOfLines={1}>Vago</Text>
                            </View>
                            <View style={s.modalPersonInfo}>
                              <Text style={[s.modalPersonName, { color: C.warning }]} numberOfLines={1}>
                                Vaga Aberta
                              </Text>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                );
              });
            })()}
          </ScrollView>
        </View>
      </Modal>

      {/* Modal de Edição de Horas */}
      <HoursEditModal
        visible={editingShift !== null && typeof editingShift === 'number' && editingShift >= 0}
        onClose={() => setEditingShift(null)}
        onSave={(hours) => handleSaveHours(editingShift, hours)}
        shift={editingShift !== null && shifts && shifts[editingShift] ? shifts[editingShift] : null}
        currentHours={editingShift !== null && realHours && realHours[editingShift] ? realHours[editingShift] : {}}
      />
    </View>
  );
};

const makeStyles = (C) => ({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.shadow.overlay,
  },

  backdropPressable: {
    flex: 1,
  },

  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: BOTTOM_SHEET_MAX_HEIGHT,
    backgroundColor: C.background.primary,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    ...Shadows.strong,
  },

  handle: {
    width: 36,
    height: 4,
    backgroundColor: C.border.light,
    borderRadius: BorderRadius.pill,
    alignSelf: 'center',
    marginTop: 14,
    marginBottom: 6,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border.light,
  },

  headerContent: {
    flex: 1,
  },

  dateTitle: {
    fontSize: Typography.fontSize.title2,
    fontWeight: Typography.fontWeight.bold,
    color: C.text.primary,
    marginBottom: 2,
  },

  shiftsCountText: {
    fontSize: Typography.fontSize.subhead,
    color: C.text.secondary,
    textTransform: 'lowercase',
  },

  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
  },

  content: {
    flex: 1,
  },

  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },

  // Shift Card
  shiftCard: {
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadows.small,
  },

  shiftAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },

  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingLeft: Spacing.lg + 4,
    paddingBottom: Spacing.sm,
  },

  shiftTypeBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },

  shiftTypeText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.bold,
  },

  shiftValueContainer: {
    alignItems: 'flex-end',
  },

  shiftValueText: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.display,
    color: C.success,
    marginBottom: 2,
  },

  shiftValueLabel: {
    fontSize: Typography.fontSize.footnote,
    color: C.text.tertiary,
    fontWeight: Typography.fontWeight.medium,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border.light,
    marginHorizontal: Spacing.lg,
  },

  shiftDetails: {
    paddingHorizontal: Spacing.lg,
    paddingLeft: Spacing.lg + 4,
    paddingVertical: Spacing.md,
  },

  detailsContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  detailsLeft: {
    flex: 1,
    gap: Spacing.sm,
  },

  shiftDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },

  shiftDetailText: {
    fontSize: Typography.fontSize.body,
    color: C.text.secondary,
    flex: 1,
    fontWeight: Typography.fontWeight.medium,
  },

  groupText: {
    color: C.text.tertiary,
    fontSize: Typography.fontSize.footnote,
  },

  groupColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 2,
    flexShrink: 0,
  },

  compactActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
    borderWidth: 1,
    borderColor: C.border.light,
  },

  compactActionButtonActive: {
    backgroundColor: C.primary + '10',
    borderColor: C.primary + '30',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
  },

  emptyTitle: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.primary,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },

  emptySubtitle: {
    fontSize: Typography.fontSize.subhead,
    color: C.text.secondary,
    textAlign: 'center',
  },

  // Registered Hours Section
  registeredHoursSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },

  registeredHoursHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },

  registeredHoursHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },

  registeredHoursTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: C.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  registeredHoursDetails: {
    display: 'flex',
    justifyContent: 'space-between',
    alignContent: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
  },

  shiftContextInfo: {
    gap: 2,
  },

  contextInfoText: {
    fontSize: 11,
    color: C.text.tertiary,
    fontWeight: '500',
    margin: 2,
  },

  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: C.error + '10',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.error + '20',
  },

  clearButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.error,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  registeredHoursDisplay: {
    marginBottom: Spacing.sm,
  },

  registeredHoursTime: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text.primary,
    letterSpacing: 0.3,
  },

  extrasIndicator: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  extrasText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Value calculation
  valueCalculationDetails: {
    flexDirection: 'column',
    gap: Spacing.xs,
  },

  valueCalculationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },

  valueCalculationText: {
    fontSize: 13,
    fontWeight: '500',
    color: C.text.secondary,
    flex: 1,
  },

  valueCalculationAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text.primary,
    textAlign: 'right',
  },

  valueSourceContainer: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border.light,
  },

  valueSourceText: {
    fontSize: 10,
    fontWeight: '500',
    color: C.text.tertiary,
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  splitInlineBadge: {
    backgroundColor: C.info + '15',
    borderColor: C.info + '30',
    marginRight: Spacing.sm,
  },

  // "Quem está também"
  coworkersRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },

  coworkerOverflow: {
    width: 52,
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  coworkerOverflowCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.border.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coworkerOverflowText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.text.secondary,
    marginTop: 3,
  },

  // Coworkers detail Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheet: {
    backgroundColor: C.background.elevated,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    maxHeight: '75%',
    paddingBottom: 32,
  },
  modalHeader: {
    alignItems: 'center',
    paddingTop: 10,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border.light,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    width: '100%',
  },
  modalTitle: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.primary,
  },
  modalSubtitle: {
    fontSize: Typography.fontSize.footnote,
    color: C.text.secondary,
    marginTop: 2,
  },
  modalClose: {
    padding: 4,
  },
  modalList: {
    flexGrow: 0,
  },
  modalListContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  modalPersonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border.light,
  },
  modalPersonInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  modalPersonName: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    color: C.text.primary,
  },
  modalPersonDesc: {
    fontSize: Typography.fontSize.footnote,
    color: C.text.secondary,
    marginTop: 1,
  },
  modalPersonCouncil: {
    fontSize: Typography.fontSize.caption1,
    color: C.text.tertiary,
    marginTop: 1,
  },

  // Vacancy badge
  vacancyBadge: {
    backgroundColor: C.warning + '20',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: Spacing.xs,
  },
  vacancyBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: C.warning,
  },

  // Vacancy section in modal
  vacancySection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border.light,
  },
  vacancySectionTitle: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: Spacing.xs,
  },
  vacancyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  vacancyGroupName: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.medium,
    color: C.text.primary,
  },
  vacancyInstitution: {
    fontSize: Typography.fontSize.caption1,
    color: C.text.tertiary,
  },
  vacancyCount: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.warning,
    marginLeft: Spacing.sm,
  },

  // Modal grouped sections
  modalGroupHeader: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border.light,
    marginBottom: Spacing.xs,
  },
  modalGroupName: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  modalGroupInstitution: {
    fontSize: Typography.fontSize.caption1,
    color: C.text.tertiary,
    marginTop: 1,
  },
});

export default ShiftBottomSheet;
