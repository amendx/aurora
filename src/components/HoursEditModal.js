import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Pressable,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';

const HoursEditModal = ({
  visible,
  onClose,
  onSave,
  shift,
  currentHours = {}
}) => {
  const C = useColors();
  const s = makeStyles(C);

  const [startTime, setStartTime] = useState(currentHours.startTime || '');
  const [endTime, setEndTime] = useState(currentHours.endTime || '');
  const [fadeAnim] = useState(new Animated.Value(0));
  const endTimeRef = useRef(null);
  const [startTimeError, setStartTimeError] = useState(null);
  const [endTimeError, setEndTimeError] = useState(null);

  // Obter horários previstos baseados no tipo de plantão
  const getPredictedHours = () => {
    const shiftType = shift?.label?.charAt(0) || 'M';

    const defaultHours = {
      'M': { start: '07:00', end: '13:00' },
      'T': { start: '13:00', end: '19:00' },
      'N': { start: '19:00', end: '07:00' }
    };

    if (shift?.time) {
      const shiftTime = shift.time || '';
      let timeParts = shiftTime.split(' – ');
      if (timeParts.length !== 2) {
        timeParts = shiftTime.split(' - ');
      }

      if (timeParts.length === 2) {
        const [predictedStart, predictedEnd] = timeParts.map(time =>
          time.replace(/\s*\([^)]*\)/, '').trim()
        );
        return { start: predictedStart, end: predictedEnd };
      }
    }

    return defaultHours[shiftType] || defaultHours['M'];
  };

  useEffect(() => {
    if (visible) {
      setStartTime(currentHours.startTime || '');
      setEndTime(currentHours.endTime || '');

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, currentHours]);

  // Validador de horários válidos (00:00 - 23:59)
  const validateTimeInput = (timeString) => {
    if (!/^\d{2}:\d{2}$/.test(timeString)) {
      return { isValid: true, errorMessage: null };
    }

    const [hours, minutes] = timeString.split(':').map(Number);

    if (hours < 0 || hours > 23) {
      return {
        isValid: false,
        errorMessage: 'Horas entre 00 e 23'
      };
    }

    if (minutes < 0 || minutes > 59) {
      return {
        isValid: false,
        errorMessage: 'Minutos entre 00 e 59'
      };
    }

    return { isValid: true, errorMessage: null };
  };

  // Formatação inteligente de tempo
  const formatTimeInput = (text) => {
    const numbers = text.replace(/\D/g, '');

    if (numbers.length <= 2) {
      return numbers;
    } else if (numbers.length <= 4) {
      return `${numbers.slice(0, 2)}:${numbers.slice(2)}`;
    } else {
      return `${numbers.slice(0, 2)}:${numbers.slice(2, 4)}`;
    }
  };

  const handleStartTimeChange = (text) => {
    const formattedTime = formatTimeInput(text);
    setStartTime(formattedTime);
    setStartTimeError(null);
    if (formattedTime.length === 5) {
      endTimeRef.current?.focus();
    }
  };

  const handleEndTimeChange = (text) => {
    const formattedTime = formatTimeInput(text);
    setEndTime(formattedTime);
    setEndTimeError(null);
  };

  // Calcular diferença de horas
  const calculateHoursDifference = () => {
    if (!startTime || !endTime || !shift?.time) return null;

    const shiftTime = shift.time || '';
    let timeParts = shiftTime.split(' – ');
    if (timeParts.length !== 2) {
      timeParts = shiftTime.split(' - ');
    }

    if (timeParts.length !== 2) return null;

    const [predictedStart, predictedEnd] = timeParts.map(time => time.replace(/\s*\([^)]*\)/, '').trim());
    const predictedDurationMin = calculateDuration(predictedStart, predictedEnd);
    const realDurationMin = calculateDuration(startTime, endTime);

    if (predictedDurationMin === null || realDurationMin === null) return null;

    const differenceMin = realDurationMin - predictedDurationMin;

    return {
      predictedHours: predictedDurationMin / 60,
      realHours: realDurationMin / 60,
      difference: differenceMin / 60,
      differenceMinutes: differenceMin
    };
  };

  // Calcular duração entre horários (retorna minutos para precisão)
  const calculateDuration = (start, end) => {
    try {
      const [startHour, startMin] = start.split(':').map(Number);
      const [endHour, endMin] = end.split(':').map(Number);

      if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) {
        return null;
      }

      const startTotalMin = startHour * 60 + startMin;
      let endTotalMin = endHour * 60 + endMin;

      if (endTotalMin < startTotalMin) {
        endTotalMin += 24 * 60;
      }

      return endTotalMin - startTotalMin;
    } catch (error) {
      return null;
    }
  };

  // Formatar duração
  const formatDuration = (hours) => {
    if (hours === null || isNaN(hours)) return '0h';

    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);

    if (minutes === 0) {
      return `${wholeHours}h`;
    }

    return `${wholeHours}h${minutes.toString().padStart(2, '0')}`;
  };

  // Formatar diferença em minutos de forma precisa
  const formatMinutesDifference = (minutes) => {
    if (!minutes || minutes === 0) return '0min';

    const absMinutes = Math.abs(minutes);
    const hours = Math.floor(absMinutes / 60);
    const remainingMinutes = absMinutes % 60;

    if (hours === 0) {
      return `${remainingMinutes}min`;
    } else if (remainingMinutes === 0) {
      return `${hours}h`;
    } else {
      return `${hours}h${remainingMinutes.toString().padStart(2, '0')}`;
    }
  };

  // Obter tipo do plantão
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

  // Salvar horas com validação
  const handleSave = () => {
    setStartTimeError(null);
    setEndTimeError(null);

    let hasErrors = false;

    if (startTime && startTime.length === 5) {
      const startValidation = validateTimeInput(startTime);
      if (!startValidation.isValid) {
        setStartTimeError(startValidation.errorMessage);
        hasErrors = true;
      }
    }

    if (endTime && endTime.length === 5) {
      const endValidation = validateTimeInput(endTime);
      if (!endValidation.isValid) {
        setEndTimeError(endValidation.errorMessage);
        hasErrors = true;
      }
    }

    if (hasErrors) {
      return;
    }

    if (startTime && endTime) {
      onSave({ startTime, endTime });
      onClose();
    }
  };

  const hoursDiff = calculateHoursDifference();
  const hasValidTimes = startTime && endTime &&
                       startTime.length >= 4 && endTime.length >= 4;
  const hasErrors = startTimeError || endTimeError;
  const canSave = hasValidTimes && !hasErrors;

  const getExtrasColor = (difference) => {
    if (!difference) return C.text.tertiary;
    if (difference > 0) return C.success;
    if (difference < 0) return C.warning;
    return C.text.tertiary;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={s.modalOverlay}>
        <Pressable style={s.backdrop} onPress={onClose} />

        <Animated.View
          style={[
            s.modalContainer,
            { opacity: fadeAnim }
          ]}
        >
          {/* Cabeçalho */}
          <View style={s.header}>
            <View style={s.headerContent}>
              <Text style={s.modalTitle}>Ajustar horas do plantão</Text>
              <Text style={s.modalSubtitle}>
                {getShiftTypeLabel(shift?.label)} · {shift?.group?.name}
              </Text>
              <Text style={s.predictedTime}>
                Previsto {shift?.time}
              </Text>
            </View>
            <TouchableOpacity
              style={s.closeButton}
              onPress={onClose}
            >
              <Ionicons name="close" size={24} color={C.text.tertiary} />
            </TouchableOpacity>
          </View>

          {/* Inputs de horário */}
          <View style={s.inputSection}>
            <View style={s.inputRow}>
              <View style={s.inputGroup}>
                <Text style={s.inputLabel}>Entrada real</Text>
                <TextInput
                  style={[
                    s.timeInput,
                    startTimeError && s.timeInputError
                  ]}
                  value={startTime}
                  onChangeText={handleStartTimeChange}
                  keyboardType="numeric"
                  placeholder={getPredictedHours().start}
                  placeholderTextColor={C.text.tertiary}
                  maxLength={5}
                />
                {startTimeError && (
                  <Text style={s.errorText}>{startTimeError}</Text>
                )}
              </View>

              <View style={s.inputGroup}>
                <Text style={s.inputLabel}>Saída real</Text>
                <TextInput
                  ref={endTimeRef}
                  style={[
                    s.timeInput,
                    endTimeError && s.timeInputError
                  ]}
                  value={endTime}
                  onChangeText={handleEndTimeChange}
                  keyboardType="numeric"
                  placeholder={getPredictedHours().end}
                  placeholderTextColor={C.text.tertiary}
                  maxLength={5}
                />
                {endTimeError && (
                  <Text style={s.errorText}>{endTimeError}</Text>
                )}
              </View>
            </View>
          </View>

          {/* Resumo do plantão */}
          {hasValidTimes && hoursDiff && (
            <View style={s.summaryCard}>
              <Text style={s.summaryTitle}>Resumo do plantão</Text>

              <View style={s.summaryRow}>
                <View style={s.summaryItem}>
                  <Text style={s.summaryLabel}>Previsto</Text>
                  <Text style={s.summaryValue}>
                    {formatDuration(hoursDiff.predictedHours)}
                  </Text>
                </View>

                <View style={s.summaryItem}>
                  <Text style={s.summaryLabel}>Real</Text>
                  <Text style={s.summaryValue}>
                    {formatDuration(hoursDiff.realHours)}
                  </Text>
                </View>

                <View style={s.summaryItem}>
                  <Text style={s.summaryLabel}>Extras</Text>
                  <Text style={[
                    s.summaryValue,
                    s.extrasValue,
                    { color: getExtrasColor(hoursDiff.differenceMinutes) }
                  ]}>
                    {formatMinutesDifference(hoursDiff.differenceMinutes >= 0 ? hoursDiff.differenceMinutes : -hoursDiff.differenceMinutes)}
                    {hoursDiff.differenceMinutes !== 0 && (
                      <Text style={{ fontSize: 12 }}>
                        {hoursDiff.differenceMinutes >= 0 ? '' : ' menos'}
                      </Text>
                    )}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Botões */}
          <View style={s.buttonRow}>
            <TouchableOpacity
              style={s.cancelButton}
              onPress={onClose}
            >
              <Text style={s.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                s.saveButton,
                !canSave && s.saveButtonDisabled
              ]}
              onPress={handleSave}
              disabled={!canSave}
            >
              <Text style={[
                s.saveButtonText,
                !canSave && s.saveButtonTextDisabled
              ]}>
                Salvar horas
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const makeStyles = (C) => ({
  modalOverlay: {
    flex: 1,
    backgroundColor: C.shadow.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },

  modalContainer: {
    backgroundColor: C.background.elevated,
    borderRadius: BorderRadius.lg,
    width: '100%',
    maxWidth: 420,
    ...Shadows.strong,
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 16,
  },

  headerContent: {
    flex: 1,
    marginRight: Spacing.md,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: C.text.primary,
    marginBottom: 4,
  },

  modalSubtitle: {
    fontSize: 14,
    color: C.text.secondary,
    fontWeight: '500',
    marginBottom: 6,
  },

  predictedTime: {
    fontSize: 13,
    color: C.text.tertiary,
  },

  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Input Section
  inputSection: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },

  inputRow: {
    flexDirection: 'row',
    gap: 16,
  },

  inputGroup: {
    flex: 1,
  },

  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: C.text.secondary,
    marginBottom: 8,
  },

  timeInput: {
    backgroundColor: C.background.secondary,
    borderWidth: 1,
    borderColor: C.border.light,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: C.text.primary,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Summary Card
  summaryCard: {
    backgroundColor: C.background.secondary,
    marginHorizontal: 20,
    borderRadius: BorderRadius.md,
    padding: 16,
    marginBottom: 24,
  },

  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text.primary,
    marginBottom: 12,
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },

  summaryLabel: {
    fontSize: 12,
    color: C.text.tertiary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text.primary,
  },

  extrasValue: {
    fontSize: 16,
    fontWeight: '700',
  },

  // Buttons
  buttonRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border.light,
  },

  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    backgroundColor: C.background.primary,
    borderWidth: 1,
    borderColor: C.border.light,
  },

  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: C.text.secondary,
  },

  saveButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    backgroundColor: C.primary,
  },

  saveButtonDisabled: {
    backgroundColor: C.interactive.disabled,
  },

  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: C.background.primary,
  },

  saveButtonTextDisabled: {
    color: C.text.tertiary,
  },

  timeInputError: {
    borderColor: C.error,
    borderWidth: 1,
    backgroundColor: C.error + '08',
  },

  errorText: {
    fontSize: 12,
    color: C.error,
    fontWeight: '500',
    marginTop: 4,
    marginLeft: 2,
  },
});

export default HoursEditModal;
