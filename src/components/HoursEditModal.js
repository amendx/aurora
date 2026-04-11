import React, { useState, useEffect } from 'react';
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
import { Colors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';

const HoursEditModal = ({ 
  visible, 
  onClose, 
  onSave,
  shift,
  currentHours = {}
}) => {
  const [startTime, setStartTime] = useState(currentHours.startTime || '');
  const [endTime, setEndTime] = useState(currentHours.endTime || '');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [startTimeError, setStartTimeError] = useState(null);
  const [endTimeError, setEndTimeError] = useState(null);

  // Obter horários previstos baseados no tipo de plantão
  const getPredictedHours = () => {
    const shiftType = shift?.label?.charAt(0) || 'M';
    
    const defaultHours = {
      'M': { start: '07:00', end: '13:00' }, // Manhã
      'T': { start: '13:00', end: '19:00' }, // Tarde
      'N': { start: '19:00', end: '07:00' }  // Noite
    };
    
    // Tentar extrair horários do shift.time se disponível
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
    // Se não tem o formato HH:MM, é válido (ainda está sendo digitado)
    if (!/^\d{2}:\d{2}$/.test(timeString)) {
      return { isValid: true, errorMessage: null };
    }

    const [hours, minutes] = timeString.split(':').map(Number);
    
    // Validar horas (0-23)
    if (hours < 0 || hours > 23) {
      return { 
        isValid: false, 
        errorMessage: 'Horas entre 00 e 23' 
      };
    }
    
    // Validar minutos (0-59)
    if (minutes < 0 || minutes > 59) {
      return { 
        isValid: false, 
        errorMessage: 'Minutos entre 00 e 59' 
      };
    }
    
    return { isValid: true, errorMessage: null };
  };

  // Formatação inteligente de tempo (sem validação durante digitação)
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

  // Manipular entrada de horário de início (sem validação em tempo real)
  const handleStartTimeChange = (text) => {
    const formattedTime = formatTimeInput(text);
    setStartTime(formattedTime);
    // Limpar erro anterior quando usuário digita
    setStartTimeError(null);
  };

  // Manipular entrada de horário de fim (sem validação em tempo real)
  const handleEndTimeChange = (text) => {
    const formattedTime = formatTimeInput(text);
    setEndTime(formattedTime);
    // Limpar erro anterior quando usuário digita
    setEndTimeError(null);
  };

  // Calcular diferença de horas
  const calculateHoursDifference = () => {
    if (!startTime || !endTime || !shift?.time) return null;

    const shiftTime = shift.time || '';
    // Aceitar tanto hífen (-) quanto travessão (–) como separador
    let timeParts = shiftTime.split(' – ');
    if (timeParts.length !== 2) {
      timeParts = shiftTime.split(' - '); // Tentar com hífen simples
    }
    
    if (timeParts.length !== 2) return null;

    const [predictedStart, predictedEnd] = timeParts.map(time => time.replace(/\s*\([^)]*\)/, '').trim());
    const predictedDurationMin = calculateDuration(predictedStart, predictedEnd);
    const realDurationMin = calculateDuration(startTime, endTime);

    if (predictedDurationMin === null || realDurationMin === null) return null;

    const differenceMin = realDurationMin - predictedDurationMin;

    return {
      predictedHours: predictedDurationMin / 60, // Para display
      realHours: realDurationMin / 60,
      difference: differenceMin / 60, // Para display  
      differenceMinutes: differenceMin // Preservar precisão em minutos
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
      
      return endTotalMin - startTotalMin; // Retorna em minutos para preservar precisão
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
    // Limpar erros anteriores
    setStartTimeError(null);
    setEndTimeError(null);
    
    let hasErrors = false;
    
    // Validar horário de início
    if (startTime && startTime.length === 5) {
      const startValidation = validateTimeInput(startTime);
      if (!startValidation.isValid) {
        setStartTimeError(startValidation.errorMessage);
        hasErrors = true;
      }
    }
    
    // Validar horário de fim
    if (endTime && endTime.length === 5) {
      const endValidation = validateTimeInput(endTime);
      if (!endValidation.isValid) {
        setEndTimeError(endValidation.errorMessage);
        hasErrors = true;
      }
    }
    
    // Se houver erros, não salvar
    if (hasErrors) {
      return;
    }
    
    // Se tudo válido, salvar
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

  // Obter cor das horas extras
  const getExtrasColor = (difference) => {
    if (!difference) return Colors.text.tertiary;
    if (difference > 0) return Colors.success;
    if (difference < 0) return Colors.warning;
    return Colors.text.tertiary;
  };

  // Formatar diferença de horas
  const formatDifference = (difference) => {
    if (!difference) return '0h';
    const sign = difference >= 0 ? '+' : '';
    return `${sign}${formatDuration(Math.abs(difference))}`;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        
        <Animated.View 
          style={[
            styles.modalContainer, 
            { opacity: fadeAnim }
          ]}
        >
          {/* Cabeçalho */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Text style={styles.modalTitle}>Ajustar horas do plantão</Text>
              <Text style={styles.modalSubtitle}>
                {getShiftTypeLabel(shift?.label)} · {shift?.group?.name}
              </Text>
              <Text style={styles.predictedTime}>
                Previsto {shift?.time}
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={onClose}
            >
              <Ionicons name="close" size={24} color={Colors.text.tertiary} />
            </TouchableOpacity>
          </View>

          {/* Inputs de horário */}
          <View style={styles.inputSection}>
            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Entrada real</Text>
                <TextInput
                  style={[
                    styles.timeInput,
                    startTimeError && styles.timeInputError
                  ]}
                  value={startTime}
                  onChangeText={handleStartTimeChange}
                  keyboardType="numeric"
                  placeholder={getPredictedHours().start}
                  placeholderTextColor={Colors.text.tertiary}
                  maxLength={5}
                />
                {startTimeError && (
                  <Text style={styles.errorText}>{startTimeError}</Text>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Saída real</Text>
                <TextInput
                  style={[
                    styles.timeInput,
                    endTimeError && styles.timeInputError
                  ]}
                  value={endTime}
                  onChangeText={handleEndTimeChange}
                  keyboardType="numeric"
                  placeholder={getPredictedHours().end}
                  placeholderTextColor={Colors.text.tertiary}
                  maxLength={5}
                />
                {endTimeError && (
                  <Text style={styles.errorText}>{endTimeError}</Text>
                )}
              </View>
            </View>
          </View>

          {/* Resumo do plantão */}
          {hasValidTimes && hoursDiff && (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Resumo do plantão</Text>
              
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Previsto</Text>
                  <Text style={styles.summaryValue}>
                    {formatDuration(hoursDiff.predictedHours)}
                  </Text>
                </View>

                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Real</Text>
                  <Text style={styles.summaryValue}>
                    {formatDuration(hoursDiff.realHours)}
                  </Text>
                </View>

                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Extras</Text>
                  <Text style={[
                    styles.summaryValue,
                    styles.extrasValue,
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
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveButton,
                !canSave && styles.saveButtonDisabled
              ]}
              onPress={handleSave}
              disabled={!canSave}
            >
              <Text style={[
                styles.saveButtonText,
                !canSave && styles.saveButtonTextDisabled
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

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.shadow.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },

  modalContainer: {
    backgroundColor: Colors.background.primary,
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
    color: Colors.text.primary,
    marginBottom: 4,
  },

  modalSubtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    fontWeight: '500',
    marginBottom: 6,
  },

  predictedTime: {
    fontSize: 13,
    color: Colors.text.tertiary,
  },

  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.background.secondary,
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
    color: Colors.text.secondary,
    marginBottom: 8,
  },

  timeInput: {
    backgroundColor: Colors.background.primary,
    borderWidth: 1,
    borderColor: Colors.border.light,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text.primary,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Summary Card
  summaryCard: {
    backgroundColor: Colors.background.secondary,
    marginHorizontal: 20,
    borderRadius: BorderRadius.md,
    padding: 16,
    marginBottom: 24,
  },

  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
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
    color: Colors.text.tertiary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
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
    borderTopColor: Colors.border.light,
  },

  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    borderWidth: 1,
    borderColor: Colors.border.light,
  },

  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text.secondary,
  },

  saveButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },

  saveButtonDisabled: {
    backgroundColor: Colors.background.tertiary,
  },

  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },

  saveButtonTextDisabled: {
    color: Colors.text.tertiary,
  },

  // Estilos para validação de horários
  timeInputError: {
    borderColor: Colors.error,
    borderWidth: 1,
    backgroundColor: Colors.error + '08',
  },

  errorText: {
    fontSize: 12,
    color: Colors.error,
    fontWeight: '500',
    marginTop: 4,
    marginLeft: 2,
  },
});

export default HoursEditModal;