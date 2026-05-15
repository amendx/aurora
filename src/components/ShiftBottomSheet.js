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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { useShifts } from '../contexts/ShiftsContext';

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

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const BOTTOM_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.82;
const BOTTOM_SHEET_MIN_HEIGHT = 0;

const ShiftBottomSheet = ({
  isVisible,
  onClose,
  shifts,
  selectedDate,
  initialShiftIndex = 0,
  calculateShiftValue,
  onHoursChanged,
  onNavigateToGroup,
}) => {
  const C = useColors();
  const s = makeStyles(C);
  const insets = useSafeAreaInsets();

  const translateY = useRef(new Animated.Value(BOTTOM_SHEET_MAX_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [shiftBreakdowns, setShiftBreakdowns] = useState({});
  const [realHours, setRealHours] = useState({});
  const [editingShift, setEditingShift] = useState(null);
  const [fractionalExtra, setFractionalExtra] = useState(true);

  // ── "Quem está também" state ────────────────────────────────────────────────
  const { user } = useContext(AuthContext);
  const { deleteManualShift } = useShifts();
  const { coworkersById, groupsById } = useGroups();
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [enabledGroupIds, setEnabledGroupIds] = useState(null);
  const [groupColors, setGroupColors] = useState({});
  const [coworkersModal, setCoworkersModal] = useState(null);
  const [currentShiftIdx, setCurrentShiftIdx] = useState(0);
  const currentIdxRef = useRef(0);
  const hScrollRef = useRef(null);

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
      const idx = Math.min(initialShiftIndex, (shifts?.length ?? 1) - 1);
      setCurrentShiftIdx(idx);
      currentIdxRef.current = idx;
      if (idx > 0) {
        setTimeout(() => hScrollRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: false }), 0);
      } else {
        hScrollRef.current?.scrollTo({ x: 0, animated: false });
      }
      translateY.setValue(BOTTOM_SHEET_MAX_HEIGHT);
      backdropOpacity.setValue(0);
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

    const groupColor = _resolveGroupColor(shift.group?.id);
    const accentColor = groupColor || shiftColor;
    const institution = shift.group?.institution?.name;
    const groupName = shift.group?.name;

    return (
      <View key={index} style={s.shiftCard}>
        {/* Left accent bar — dimmed when completed */}
        <View style={[s.shiftAccentBar, { backgroundColor: accentColor, opacity: hasRegisteredHours ? 0.5 : 1 }]} />

        {/* Completed wash behind header */}
        {hasRegisteredHours ? (
          <View style={[s.completedWash, { backgroundColor: C.money + '10' }]} pointerEvents="none" />
        ) : null}

        {/* Card header: type badge + institution + group vs. value */}
        <View style={s.cardHeader}>
          <View style={s.cardHeaderLeft}>
           
              <View style={[s.typeBadge, { backgroundColor: shiftColor + '20', borderColor: shiftColor + '40' }]}>
                <Text style={[s.typeBadgeText, { color: shiftColor }]}>
                  {shiftType}{shift.splitHours ? ` · ${shift.splitHours.hoursThisMonth}h` : ''}
                </Text>
              </View>
            
            {institution ? (
              <Text style={s.institutionText} numberOfLines={2}>{institution}</Text>
            ) : null}
            {groupName ? (
              <View style={s.groupNameRow}>
                <View style={[s.groupDot, { backgroundColor: accentColor }]} />
                <Text style={[s.groupNameText, groupColor ? { color: groupColor } : null]} numberOfLines={1}>{groupName}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.cardHeaderRight}>
            <Text style={s.valorLabel}>{hasRegisteredHours ? 'Valor efetivo' : 'Valor previsto'}</Text>
            <Text style={[s.valorAmount, hasRegisteredHours && { fontSize: 24 }]}>R$ {getDisplayValue()}</Text>
          
          </View>
        </View>

        <View style={s.hairlineRow} />

        {/* Time row */}
        <View style={s.infoRow}>
          <Ionicons name="time-outline" size={15} color={C.text.secondary} />
          <Text style={s.infoRowLabel}>Horário</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.infoRowValue}>{formatTime(shift.time)}</Text>
            {breakdown?.hours > 0 ? (
              <Text style={s.infoRowMeta}>{breakdown.hours}h</Text>
            ) : null}
          </View>
        </View>
         {/* Horas registradas — A2 design */}
        {hasRegisteredHours ? (
          <>
            <View style={s.hairlineRow} />
            <View style={s.regHoursSection}>
              <Text style={s.regHoursSectionTitle}>Horas registradas</Text>
              <View style={s.regHoursRow}>
                <View style={s.regHoursCircle}>
                  <Ionicons name="checkmark" size={20} color={C.money} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.regHoursTime}>{hoursSummary.startTime} → {hoursSummary.endTime}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <Text style={s.regHoursSub}>Escalado · {breakdown?.hours || 0}h</Text>
                    {hoursSummary.differenceMinutes > 0 ? (
                      <>
                        <Text style={[s.regHoursSub, { color: C.border.light }]}>·</Text>
                        <Text style={[s.regHoursSub, { color: C.money, fontWeight: '700' }]}>
                          + {TimeUtils.minutesToDisplay(hoursSummary.differenceMinutes)}
                        </Text>
                      </>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
          </>
        ) : null}

        {/* Team row + coworker mini-stack */}
        {(() => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const shiftDate = new Date(shift.date + 'T00:00:00');
          const isPast = shiftDate < today;
          const isFuture = shiftDate > today;
          if (isFuture && !TodayCoworkersService.hasEntry(shift.id)) return null;

          const coworkers = _getCoworkersForShift(shift);
          const vacancyGroups = isPast ? [] : _getVacanciesByGroupForShift(shift);
          const totalVacancies = vacancyGroups.reduce((acc, v) => acc + (v.available ?? 0), 0);
          if (coworkers.length === 0 && totalVacancies === 0) return null;

          const MAX_PREV = 4;
          const hasV = totalVacancies > 0;
          const personPreview = coworkers.slice(0, hasV ? MAX_PREV - 1 : MAX_PREV);
          const overflow = (coworkers.length - personPreview.length) + (totalVacancies - (hasV ? 1 : 0));
          const names = personPreview.slice(0, 2).map(p => (p.name || '').split(' ')[0]).join(', ')
            + (coworkers.length > 2 ? ` e mais ${coworkers.length - 2}` : '');

          return (
            <>
              <View style={s.hairlineRow} />
              <View style={s.infoRow}>
                <Ionicons name="people-outline" size={15} color={C.text.secondary} />
                <Text style={s.infoRowLabel}>Equipe</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.infoRowValue}>{coworkers.length} colega{coworkers.length !== 1 ? 's' : ''}</Text>
                  {totalVacancies > 0 ? (
                    <Text style={[s.infoRowMeta, { color: C.warning }]}>{totalVacancies} vaga{totalVacancies !== 1 ? 's' : ''}</Text>
                  ) : null}
                </View>
              </View>
              <TouchableOpacity
                style={s.coworkerMiniStack}
                onPress={() => openCoworkersModal(shift, coworkers)}
                activeOpacity={0.7}
              >
                <View style={s.miniAvatarRow}>
                  {personPreview.map((p, i) => (
                    <View key={p.id} style={[s.miniAvatar, { marginLeft: i > 0 ? -8 : 0, zIndex: MAX_PREV - i }]}>
                      {p.photo
                        ? <Image source={{ uri: p.photo }} style={s.miniAvatarImg} />
                        : <View style={[s.miniAvatarFallback, { backgroundColor: shiftColor + '28' }]}>
                            <Text style={[s.miniAvatarInitials, { color: shiftColor }]}>{_initials(p.name)}</Text>
                          </View>
                      }
                    </View>
                  ))}
                  {hasV ? (
                    <View style={[s.miniAvatar, { marginLeft: personPreview.length > 0 ? -8 : 0, zIndex: 0 }]}>
                      <View style={[s.miniAvatarFallback, { backgroundColor: C.warning + '20', borderColor: C.warning + '60', borderStyle: 'dashed', borderWidth: 1 }]}>
                        <Ionicons name="star-outline" size={11} color={C.warning} />
                      </View>
                    </View>
                  ) : null}
                  {overflow > 0 ? (
                    <View style={[s.miniAvatar, s.miniAvatarOverflow, { marginLeft: -8 }]}>
                      <Text style={s.miniAvatarOverflowText}>+{overflow}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={s.coworkerNamesText} numberOfLines={1}>{names}</Text>
              </TouchableOpacity>
            </>
          );
        })()}

        <View style={s.hairlineRow} />

        {/* Composição do valor / efetiva */}
        {breakdown ? (
          <View style={s.breakdownSection}>
            <Text style={s.breakdownSectionTitle}>{hasRegisteredHours ? 'Composição efetiva' : 'Composição do valor'}</Text>
            {shift.splitHours ? (
              <>
                <View style={s.breakdownRow}>
                  <Text style={s.breakdownLabel}>
                    {formatHourlyRate(breakdown.hourlyValue)} × {shift.splitHours.hoursThisMonth}h{breakdown.weekend && breakdown.isNaturalWeekend ? ' (FDS)' : ''}{breakdown.isFridayNight ? ' (Sexta N)' : ''}
                  </Text>
                  <Text style={s.breakdownValue}>+ R$ {formatMoneyCompact((breakdown.hourlyValue || 0) * shift.splitHours.hoursThisMonth)}</Text>
                </View>
                {breakdown.loyaltyPercentage > 0 ? (
                  <View style={s.breakdownRow}>
                    <Text style={[s.breakdownLabel, { color: C.text.tertiary }]}>Fidelização +{breakdown.loyaltyPercentage}%</Text>
                    <Text style={s.breakdownValue}>+ R$ {formatMoneyCompact(((breakdown.hourlyValue || 0) * shift.splitHours.hoursThisMonth * breakdown.loyaltyPercentage) / 100)}</Text>
                  </View>
                ) : null}
                {breakdown.generalBonusPercentage > 0 ? (
                  <View style={s.breakdownRow}>
                    <Text style={[s.breakdownLabel, { color: C.primary }]}>Bônus +{breakdown.generalBonusPercentage}%</Text>
                    <Text style={[s.breakdownValue, { color: C.primary }]}>+ R$ {formatMoneyCompact(((breakdown.hourlyValue || 0) * shift.splitHours.hoursThisMonth * breakdown.generalBonusPercentage) / 100)}</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <View style={s.breakdownRow}>
                  <Text style={s.breakdownLabel}>
                    {formatHourlyRate(breakdown.hourlyValue)} × {breakdown.hours || 0}h{breakdown.weekend && breakdown.isNaturalWeekend ? ' (FDS)' : ''}{breakdown.isFridayNight ? ' (Sexta N)' : ''}
                  </Text>
                  <Text style={s.breakdownValue}>+ R$ {formatMoneyCompact(breakdown.baseValue) || '0,00'}</Text>
                </View>
                {breakdown.loyaltyBonus > 0 ? (
                  <View style={s.breakdownRow}>
                    <Text style={[s.breakdownLabel, { color: C.text.tertiary }]}>Fidelização +{breakdown.loyaltyPercentage}%</Text>
                    <Text style={s.breakdownValue}>+ R$ {formatMoneyCompact(breakdown.loyaltyBonus)}</Text>
                  </View>
                ) : null}
                {breakdown.generalBonus > 0 ? (
                  <View style={s.breakdownRow}>
                    <Text style={[s.breakdownLabel, { color: C.primary }]}>Bônus +{breakdown.generalBonusPercentage}%</Text>
                    <Text style={[s.breakdownValue, { color: C.primary }]}>+ R$ {formatMoneyCompact(breakdown.generalBonus)}</Text>
                  </View>
                ) : null}
              </>
            )}
            {hoursSummary && hoursSummary.differenceMinutes !== 0 ? (
              <View style={s.breakdownRow}>
                <Text style={[s.breakdownLabel, { color: hoursSummary.differenceMinutes > 0 ? C.money : C.error }]}>
                  Horas extras · {TimeUtils.minutesToDisplay(Math.abs(hoursSummary.differenceMinutes))}
                </Text>
                <Text style={[s.breakdownValue, { color: hoursSummary.differenceMinutes > 0 ? C.money : C.error }]}>
                  {hoursSummary.differenceMinutes > 0 ? '+ ' : '- '}R$ {formatMoneyCompact(Math.abs((hoursSummary.differenceMinutes / 60) * (breakdown.hourlyValue || 0) * (1 + (breakdown.loyaltyPercentage || 0) / 100 + (breakdown.generalBonusPercentage || 0) / 100)))}
                </Text>
              </View>
            ) : null}
            <View style={s.hairlineRow} />
            <View style={s.breakdownRow}>
              <Text style={s.breakdownTotalLabel}>{hasRegisteredHours ? 'Recebido' : 'Total'}</Text>
              <Text style={s.breakdownTotalValue}>R$ {getDisplayValue()}</Text>
            </View>
          </View>
        ) : null}

       

      </View>
    );
  };

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
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
              <Text style={s.dateLabel}>{formatDateHeader(selectedDate)}</Text>
              <Text style={s.dateTitle}>
                {shifts && shifts.length > 1
                  ? `Plantão ${currentShiftIdx + 1} de ${shifts.length}`
                  : 'Plantão do dia'}
              </Text>
            </View>
            <Pressable style={s.closeButton} onPress={onClose}>
              <Ionicons name="close" size={20} color={C.text.secondary} />
            </Pressable>
          </View>
        </View>

        {/* Pagination dots */}
        {shifts && shifts.length > 1 ? (
          <View style={s.pagination}>
            {shifts.map((_, i) => (
              <Pressable key={i} onPress={() => {
                currentIdxRef.current = i;
                setCurrentShiftIdx(i);
                hScrollRef.current?.scrollTo({ x: i * SCREEN_WIDTH, animated: true });
              }}>
                <View style={[s.paginationDot, i === currentShiftIdx && s.paginationDotActive]} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Card pager — native horizontal scroll */}
        <ScrollView
          ref={hScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={shifts && shifts.length > 1}
          style={s.cardArea}
          keyboardShouldPersistTaps="handled"
          overScrollMode="never"
          bounces={false}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            currentIdxRef.current = i;
            setCurrentShiftIdx(i);
          }}
        >
          {shifts && shifts.length > 0 ? shifts.map((shift, index) => (
            <ScrollView
              key={index}
              style={{ width: SCREEN_WIDTH }}
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
              overScrollMode="never"
            >
              {renderShiftCard(shift, index)}
            </ScrollView>
          )) : (
            <View style={[s.emptyState, { width: SCREEN_WIDTH }]}>
              <Ionicons name="calendar-outline" size={48} color={C.text.tertiary} />
              <Text style={s.emptyTitle}>Nenhum plantão</Text>
              <Text style={s.emptySubtitle}>Não há plantões agendados para este dia</Text>
            </View>
          )}
        </ScrollView>

        {/* CTA — fixed at bottom, always visible */}
        {shifts && shifts.length > 0 ? (
          <View style={{ marginBottom: 14 + insets.bottom }}>
            <View style={s.ctaRow}>
              {getHoursSummary(shifts[currentShiftIdx], currentShiftIdx) === null ? (
                <TouchableOpacity style={[s.ctaButton, { flex: 1 }]} onPress={() => openHoursEditor(currentShiftIdx)}>
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={s.ctaText}>Registrar horas</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity style={[s.ctaButtonSecondary, { flex: 1 }]} onPress={() => confirmClearHours(currentShiftIdx)}>
                    <Ionicons name="trash-outline" size={16} color={C.error} />
                    <Text style={[s.ctaText, { color: C.error }]}>Apagar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.ctaButton, { flex: 2 }]} onPress={() => openHoursEditor(currentShiftIdx)}>
                    <Ionicons name="create-outline" size={18} color="#fff" />
                    <Text style={s.ctaText}>Editar horas</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
            {shifts[currentShiftIdx]?.isManual ? (
              <TouchableOpacity style={s.deleteShiftBtn} onPress={() => setDeleteConfirmVisible(true)}>
                <Ionicons name="trash-outline" size={14} color={C.error} />
                <Text style={[s.deleteShiftBtnText, { color: C.error }]}>Excluir plantão</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </Animated.View>

      {/* Modal — Quem está também (detalhe) */}
      <Modal
        visible={coworkersModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setCoworkersModal(null)}
      >
        <Pressable style={s.modalBackdrop} onPress={() => setCoworkersModal(null)} />
        <View style={[s.modalSheet, { paddingBottom: 16 + insets.bottom }]}>
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

      {/* Confirmação de exclusão de plantão manual */}
      <Modal visible={deleteConfirmVisible} transparent animationType="fade" onRequestClose={() => setDeleteConfirmVisible(false)}>
        <Pressable style={s.confirmBackdrop} onPress={() => setDeleteConfirmVisible(false)} />
        <View style={s.confirmBox}>
          <View style={[s.confirmIconWrap, { backgroundColor: C.error + '15' }]}>
            <Ionicons name="trash-outline" size={24} color={C.error} />
          </View>
          <Text style={[s.confirmTitle, { color: C.text.primary }]}>Excluir plantão?</Text>
          <Text style={[s.confirmBody, { color: C.text.secondary }]}>Este plantão foi adicionado manualmente e será removido permanentemente.</Text>
          <View style={s.confirmActions}>
            <Pressable style={[s.confirmBtn, { backgroundColor: C.background.secondary, borderColor: C.border.light }]} onPress={() => setDeleteConfirmVisible(false)}>
              <Text style={[s.confirmBtnText, { color: C.text.primary }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[s.confirmBtn, { backgroundColor: C.error }]}
              onPress={() => {
                const shift = shifts?.[currentShiftIdx];
                if (shift?.isManual) deleteManualShift(shift.id, shift.monthKey);
                setDeleteConfirmVisible(false);
                onClose();
              }}
            >
              <Text style={[s.confirmBtnText, { color: '#fff' }]}>Excluir</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
    </Modal>
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
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border.light,
  },

  headerContent: {
    flex: 1,
  },

  dateLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: C.text.tertiary,
  },

  dateTitle: {
    fontSize: 22,
    fontFamily: Typography.fontFamily.display,
    fontWeight: Typography.fontWeight.bold,
    color: C.text.primary,
    marginTop: 2,
    letterSpacing: -0.4,
  },

  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
    marginTop: 2,
  },

  // ── Registered / completed variant ────────────────────────────────────────
  completedWash: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    pointerEvents: 'none',
  },

  completedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 22,
    paddingHorizontal: 10,
    borderRadius: 11,
    backgroundColor: C.money,
  },

  completedPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#fff',
  },

  secondaryBadge: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  secondaryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  valueDeltaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: C.money + '18',
    alignSelf: 'flex-end',
  },

  valueDeltaText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.money,
    fontFamily: Typography.fontFamily.mono || 'monospace',
  },

  regHoursSection: {
    padding: 12,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },

  regHoursSectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: C.text.tertiary,
    marginBottom: 10,
  },

  regHoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  regHoursCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.money + '18',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  regHoursTime: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text.primary,
    fontFamily: Typography.fontFamily.mono || 'monospace',
  },

  regHoursSub: {
    fontSize: 11.5,
    color: C.text.tertiary,
  },


  // ── A2 ShiftDetailCard styles ──────────────────────────────────────────────
  cardHeader: {
    padding: 14,
    paddingLeft: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  cardHeaderRight: {
    alignItems: 'flex-end',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 5,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  institutionText: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text.primary,
    marginTop: 8,
    fontFamily: Typography.fontFamily.display,
    letterSpacing: -0.2,
  },
  groupNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  groupDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  groupNameText: {
    fontSize: 12,
    color: C.text.secondary,
  },
  valorLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: C.text.tertiary,
  },
  valorAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: C.money,
    fontFamily: Typography.fontFamily.display,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  hairlineRow: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border.light,
    marginLeft: 18,
  },
  infoRow: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoRowLabel: {
    flex: 1,
    fontSize: 12.5,
    color: C.text.secondary,
    fontWeight: '500',
  },
  infoRowValue: {
    fontSize: 13,
    color: C.text.primary,
    fontWeight: '700',
  },
  infoRowMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: C.text.tertiary,
  },
  coworkerMiniStack: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  miniAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.background.primary,
  },
  miniAvatarImg: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  miniAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniAvatarInitials: {
    fontSize: 9,
    fontWeight: '700',
  },
  miniAvatarOverflow: {
    backgroundColor: C.border.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniAvatarOverflowText: {
    fontSize: 9,
    fontWeight: '600',
    color: C.text.secondary,
  },
  coworkerNamesText: {
    fontSize: 11,
    color: C.text.tertiary,
    flex: 1,
  },
  breakdownSection: {
    padding: 12,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  breakdownSectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: C.text.tertiary,
    marginBottom: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 4,
  },
  breakdownLabel: {
    fontSize: 12,
    color: C.text.secondary,
    fontWeight: '500',
    flex: 1,
  },
  breakdownValue: {
    fontSize: 12,
    fontWeight: '500',
    color: C.text.primary,
  },
  breakdownTotalLabel: {
    fontSize: 13,
    color: C.text.primary,
    fontWeight: '700',
  },
  breakdownTotalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: C.money,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 18,
    marginTop: 4,
  },

  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },

  ctaButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.error + '12',
    borderWidth: 1,
    borderColor: C.error + '30',
    paddingVertical: 14,
    borderRadius: 14,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  deleteShiftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 18,
    marginTop: 10,
    paddingVertical: 10,
  },
  deleteShiftBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },

  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  confirmBox: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '35%',
    backgroundColor: C.background.elevated,
    borderRadius: BorderRadius.lg,
    padding: 24,
    alignItems: 'center',
    ...Shadows.strong,
  },
  confirmIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  confirmTitle: {
    fontSize: 17,
    fontFamily: Typography.fontFamily.display,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  confirmBody: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 22,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  confirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },

  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },

  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.border.medium || C.border.light,
  },

  paginationDotActive: {
    width: 16,
    backgroundColor: C.primary,
  },

  cardArea: {
    flex: 1,
    overflow: 'hidden',
  },

  content: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },

  // Shift Card
  shiftCard: {
    backgroundColor: C.background.elevated,
    borderRadius: BorderRadius.lg,
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
