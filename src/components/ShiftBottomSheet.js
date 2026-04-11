import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Pressable,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { Colors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';
import { calculateShiftValueWithBreakdown, calculateShiftValue } from '../utils/ShiftValueCalculator';
import { formatMoney, formatMoneyCompact, formatHourlyRate } from '../utils/MoneyFormatter';
import HoursEditModal from './HoursEditModal';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const BOTTOM_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.75;
const BOTTOM_SHEET_MIN_HEIGHT = 0;

const ShiftBottomSheet = ({ 
  isVisible, 
  onClose, 
  shifts, 
  selectedDate,
  calculateShiftValue,
  onHoursChanged, // Novo callback para notificar mudanças nas horas
  onNavigateToGroup, // Callback para navegar ao grupo ao clicar no nome
}) => {
  const translateY = useRef(new Animated.Value(BOTTOM_SHEET_MAX_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [shiftBreakdowns, setShiftBreakdowns] = useState({});
  const [realHours, setRealHours] = useState({}); // Armazenar horas reais por plantão
  const [editingShift, setEditingShift] = useState(null); // Shift sendo editado no modal

  // Carregar horas reais salvas
  useEffect(() => {
    const loadRealHours = async () => {
      if (!shifts || !selectedDate) return;
      
      try {
        // Garantir que selectedDate é válido
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
        }
      } catch (error) {
        console.warn('Erro ao carregar horas reais:', error);
      }
    };
    
    if (isVisible) {
      loadRealHours();
    }
  }, [shifts, selectedDate, isVisible]);

  // LIMPEZA AUTOMÁTICA REMOVIDA COMPLETAMENTE
  // Não limpar dados automaticamente para permitir testes
  /*
  useEffect(() => {
    const initializeClearData = async () => {
      // Removido para permitir teste das horas extras
    };
    initializeClearData();
  }, []);
  */

  // Salvar horas reais
  const saveRealHours = async (newRealHours) => {
    try {
      // Garantir que selectedDate é válido
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
      
      // Notificar o componente pai sobre a mudança nas horas
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
    console.log('📝 Abrindo editor para shift index:', shiftIndex);
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
    
    // Nova estrutura com identificação específica do plantão
    newRealHours[shiftIndex] = {
      ...hours,
      shiftId: shift.id || `${shift.label}_${shiftIndex}`, // ID único do plantão
      shiftType: shift.label || 'M', // M, T, N
      shiftTime: shift.time || 'Horário não informado', // Horário previsto (ex: "07:00 - 13:00 (M)")
      groupName: shift.group?.name || 'Sem grupo',
      institutionName: shift.group?.institution?.name || 'Sem instituição',
      registeredAt: new Date().toISOString(), // Timestamp do registro
    };
    
    saveRealHours(newRealHours);
    setEditingShift(null);
    
    // Log detalhado do que foi salvo
    console.log('💾 Horas registradas para plantão:', {
      shiftIndex,
      shiftType: shift.label,
      group: shift.group?.name,
      institution: shift.group?.institution?.name,
      hours: hours,
      savedData: newRealHours[shiftIndex]
    });
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
    
    console.log('🧹 Horas limpas para shift index:', shiftIndex);
  };

  // Função para limpar TODOS os dados de horas extras salvos (para debug/reset)
  const clearAllSavedHours = async () => {
    try {
      // Obter todas as chaves do SecureStore que contenham 'real_hours_'
      const keysToDelete = [];
      
      // Como não podemos listar chaves no SecureStore, vamos tentar limpar
      // algumas datas conhecidas dos últimos meses
      const today = new Date();
      for (let i = 0; i < 90; i++) { // Últimos 90 dias
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        keysToDelete.push(`real_hours_${dateKey}`);
      }

      // Deletar todas as chaves
      await Promise.all(
        keysToDelete.map(async (key) => {
          try {
            await SecureStore.deleteItemAsync(key);
          } catch (error) {
            // Ignorar erros de chaves que não existem
          }
        })
      );

      console.log('✅ Todos os dados de horas extras foram limpos');
      
      // Limpar estado local também
      setRealHours({});
      
    } catch (error) {
      console.error('❌ Erro ao limpar dados:', error);
    }
  };

  // Calcular diferença de horas para exibição
  const getHoursSummary = (shift, shiftIndex) => {
    // Validações robustas
    if (!shift || typeof shiftIndex !== 'number' || shiftIndex < 0) {
      console.log('🔍 getHoursSummary - Parâmetros inválidos:', { shift: !!shift, shiftIndex });
      return null;
    }

    const shiftRealHours = realHours[shiftIndex];
    if (!shiftRealHours || typeof shiftRealHours !== 'object') {
      console.log('🔍 getHoursSummary - Sem horas reais para index:', shiftIndex);
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
    
    // Aceitar tanto hífen (-) quanto travessão (–) como separador
    let timeParts = shiftTime.split(' – ');
    if (timeParts.length !== 2) {
      timeParts = shiftTime.split(' - '); // Tentar com hífen simples
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

    const differenceMin = realDurationMin - predictedDurationMin;
    
    console.log('🔍 getHoursSummary - Diferença final:', {
      realDurationMin,
      predictedDurationMin,
      differenceMin,
      differenceFormatted: formatMinutesDifference(differenceMin)
    });

    return {
      startTime: shiftRealHours.startTime,
      endTime: shiftRealHours.endTime,
      predictedHours: predictedDurationMin / 60, // Converter para horas apenas para display
      realHours: realDurationMin / 60,
      difference: differenceMin / 60, // Diferença em horas para display
      differenceMinutes: differenceMin // Manter diferença em minutos para precisão
    };
  };

  // Calcular duração entre dois horários (retorna minutos para maior precisão)
  const calculateDuration = (startTime, endTime) => {
    try {
      console.log('🔍 calculateDuration - Input:', { startTime, endTime });
      
      // Normalizar formato dos horários (tanto "07h00" quanto "07:00")
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
      
      // Se horário de fim é menor que início, considerar passagem de dia
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
      
      return duration; // Retorna em minutos para preservar precisão
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
      
      // Converter selectedDate para string no formato esperado pela função
      let dateString;
      try {
        if (selectedDate instanceof Date) {
          if (isNaN(selectedDate.getTime())) {
            console.warn('selectedDate é um Date inválido:', selectedDate);
            return;
          }
          dateString = selectedDate.toISOString().split('T')[0]; // YYYY-MM-DD
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
          // Passar dateString em vez de selectedDate
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
      // Animar para cima
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animar para baixo
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: BOTTOM_SHEET_MAX_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
      
      // Reset editing modal when closing
      setEditingShift(null);
    }
  }, [isVisible]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      // Só capturar swipe para baixo (fechar) — nunca roubar scroll para cima
      const isDownward = gestureState.dy > 10;
      const isMoreVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      return isDownward && isMoreVertical;
    },
    onPanResponderMove: (_, gestureState) => {
      // Só permitir movimento para baixo (fechar)
      if (gestureState.dy > 0) {
        translateY.setValue(gestureState.dy);
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 100 || gestureState.vy > 0.5) {
        // Fechar se arrastou mais de 100px ou velocidade > 0.5
        onClose();
      } else {
        // Voltar para posição original
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    },
  });

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleDateString('pt-BR', { month: 'long' });
    const year = date.getFullYear();
    
    return `${day} de ${month}, ${year}`;
  };

  const formatDateHeader = (dateInput) => {
    if (!dateInput) return '';
    
    try {
      let date;
      
      // Se for um objeto Date, usar diretamente
      if (dateInput instanceof Date) {
        date = dateInput;
      } 
      // Se for string, tentar parsear
      else if (typeof dateInput === 'string') {
        if (dateInput.includes('-')) {
          // Formato YYYY-MM-DD
          const [year, month, day] = dateInput.split('-');
          date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        } else {
          // Outros formatos de string
          date = new Date(dateInput);
        }
      }
      // Fallback
      else {
        date = new Date(dateInput);
      }
      
      // Verificar se a data é válida
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
    if (!label) return Colors.primary;
    
    const colorMap = {
      'M': Colors.success,
      'T': Colors.primary,
      'N': Colors.warning
    };
    
    const type = label.charAt(0);
    return colorMap[type] || Colors.primary;
  };

  const renderShiftCard = (shift, index) => {
    // Validações robustas
    if (!shift || typeof index !== 'number' || index < 0) {
      console.error('❌ renderShiftCard - Parâmetros inválidos:', { shift: !!shift, index });
      return null;
    }

    const breakdown = shiftBreakdowns[index];
    const shiftType = getShiftTypeLabel(shift.label);
    const shiftColor = getShiftTypeColor(shift.label);
    const hoursSummary = getHoursSummary(shift, index);
    const hasRegisteredHours = hoursSummary !== null;

    // Log detalhado para debug
    console.log('🔍 renderShiftCard - Shift', index, ':', {
      shiftType,
      hasRegisteredHours,
      hoursSummary: hoursSummary ? {
        startTime: hoursSummary.startTime,
        endTime: hoursSummary.endTime,
        differenceMinutes: hoursSummary.differenceMinutes,
        difference: hoursSummary.difference,
        predictedHours: hoursSummary.predictedHours,
        realHours: hoursSummary.realHours
      } : null,
      shiftTime: shift.time,
      realHours: realHours[index]
    });

    // Calcular valor correto para split shifts
    const getDisplayValue = () => {
      if (!breakdown) return '0,00';
      
      // Para split shifts, recalcular valor considerando apenas horas deste mês
      if (shift.splitHours) {
        const hoursThisMonth = shift.splitHours.hoursThisMonth || 0;
        const proportionalBaseValue = (breakdown.hourlyValue || 0) * hoursThisMonth;
        
        // Aplicar bônus proporcionais baseados no valor das horas do split
        let loyaltyBonus = 0;
        let generalBonus = 0;
        
        if (breakdown.loyaltyPercentage) {
          loyaltyBonus = (proportionalBaseValue * breakdown.loyaltyPercentage) / 100;
        }
        
        if (breakdown.generalBonusPercentage) {
          generalBonus = (proportionalBaseValue * breakdown.generalBonusPercentage) / 100;
        }
        
        const totalValue = proportionalBaseValue + loyaltyBonus + generalBonus;
        console.log('🔍 Split Value Calculation:', {
          hoursThisMonth,
          hourlyValue: breakdown.hourlyValue,
          proportionalBaseValue,
          loyaltyPercentage: breakdown.loyaltyPercentage,
          loyaltyBonus,
          generalBonusPercentage: breakdown.generalBonusPercentage,
          generalBonus,
          totalValue
        });
        
        return formatMoneyCompact(totalValue);
      }
      
      // Para plantões normais, usar valor original
      return formatMoneyCompact(breakdown.finalValue);
    };

    return (
      <View key={index} style={styles.shiftCard}>
        {/* Header do Card com Tipo e Valor */}
        <View style={styles.shiftHeader}>
          <View style={[styles.shiftTypeBadge, { backgroundColor: shiftColor + '15', borderColor: shiftColor + '30' }]}>
            <Text style={[styles.shiftTypeText, { color: shiftColor }]}>
              {shiftType}
            </Text>
          </View>

          {shift.splitHours && (
            <View style={[styles.shiftTypeBadge, styles.splitInlineBadge]}>
              <Text style={[styles.shiftTypeText, { color: Colors.info }]}>
                {shift.splitHours.hoursThisMonth}h mês
              </Text>
            </View>
          )}

          <View style={styles.shiftValueContainer}>
            <Text style={styles.shiftValueText}>
              R$ {getDisplayValue()}
            </Text>
            <Text style={styles.shiftValueLabel}>valor estimado</Text>
          </View>
        </View>

        {/* Detalhes do Plantão com Botão Integrado */}
        <View style={styles.shiftDetails}>
          <View style={styles.detailsContent}>
            <View style={styles.detailsLeft}>
              <View style={styles.shiftDetailRow}>
                <Ionicons name="time-outline" size={18} color={Colors.text.tertiary} />
                <Text style={styles.shiftDetailText}>
                  {formatTime(shift.time)}
                </Text>
              </View>

              {shift.group?.institution?.name && (
                <View style={styles.shiftDetailRow}>
                  <Ionicons name="location-outline" size={18} color={Colors.text.tertiary} />
                  <Text style={styles.shiftDetailText}>
                    {shift.group.institution.name}
                  </Text>
                </View>
              )}

              {shift.group?.name && (
                <TouchableOpacity 
                  style={styles.shiftDetailRow}
                  onPress={() => {
                    if (onNavigateToGroup && shift.group) {
                      onNavigateToGroup(shift.group);
                    }
                  }}
                  activeOpacity={onNavigateToGroup ? 0.6 : 1}
                  disabled={!onNavigateToGroup}
                >
                  <Ionicons name="people-outline" size={18} color={Colors.text.tertiary} />
                  <Text style={[styles.shiftDetailText, styles.groupText]}>
                    {shift.group.name}
                  </Text>
                  {onNavigateToGroup && (
                    <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Botão de Ação Integrado */}
            <TouchableOpacity 
              style={[
                styles.compactActionButton,
                hasRegisteredHours && styles.compactActionButtonActive
              ]}
              onPress={() => openHoursEditor(index)}
            >
              <Ionicons 
                name={hasRegisteredHours ? "create-outline" : "time-outline"} 
                size={16} 
                color={hasRegisteredHours ? Colors.primary : Colors.text.tertiary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Seção de Horas Registradas - Nova estrutura visual */}
        {hasRegisteredHours && (
          <>
            <View style={styles.divider} />
            
            <View style={styles.registeredHoursSection}>
              <View style={styles.registeredHoursHeader}>
                <View style={styles.registeredHoursHeaderLeft}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                  <Text style={styles.registeredHoursTitle}>
                    Horas registradas - {getShiftTypeLabel(shift.label)}
                  </Text>
                </View>
                
                {/* Botão de Limpar */}
                <TouchableOpacity 
                  style={styles.clearButton}
                  onPress={() => confirmClearHours(index)}
                >
                  <Ionicons name="trash-outline" size={14} color={Colors.error} />
                  <Text style={styles.clearButtonText}>Limpar</Text>
                </TouchableOpacity>
              </View>
              
              {/* Informações específicas do plantão registrado */}
              <View style={styles.registeredHoursDetails}>
                <View style={styles.registeredHoursDisplay}>
                  <Text style={styles.registeredHoursTime}>
                    {hoursSummary.startTime} – {hoursSummary.endTime}
                  </Text>
                </View>
                
                {/* Informações contextuais do plantão */}
                <View style={styles.shiftContextInfo}>
                  {/* {shift.group?.name && (
                    <Text style={styles.contextInfoText}>
                      📍 {shift.group.name}
                    </Text>
                  )} */}
                  {realHours[index]?.registeredAt && (
                    <Text style={styles.contextInfoText}>
                      🕐 Registrado em {(() => {
                        try {
                          const date = new Date(realHours[index].registeredAt);
                          return !isNaN(date.getTime()) ? date.toLocaleDateString('pt-BR') : 'Data inválida';
                        } catch (error) {
                          console.warn('Erro ao formatar data de registro:', error);
                          return 'Data inválida';
                        }
                      })()}
                    </Text>
                  )}
                </View>
              </View>

              {/* Extras em destaque com formatação precisa */}
              {hoursSummary.differenceMinutes !== 0 && (
                <View style={[
                  styles.extrasIndicator,
                  {
                    backgroundColor: hoursSummary.differenceMinutes > 0 
                      ? Colors.success + '15'
                      : Colors.error + '15',
                    borderColor: hoursSummary.differenceMinutes > 0 
                      ? Colors.success + '30'
                      : Colors.error + '30'
                  }
                ]}>
                  <View style={styles.extrasContent}>
                    <Ionicons 
                      name={hoursSummary.differenceMinutes > 0 ? "trending-up-outline" : "trending-down-outline"} 
                      size={14} 
                      color={hoursSummary.differenceMinutes > 0 ? Colors.success : Colors.error}
                    />
                    <Text style={[
                      styles.extrasText,
                      {
                        color: hoursSummary.differenceMinutes > 0 
                          ? Colors.success
                          : Colors.error
                      }
                    ]}>
                      {hoursSummary.differenceMinutes > 0 ? 'Extras: +' : 'Faltou: -'}{formatMinutesDifference(Math.abs(hoursSummary.differenceMinutes))}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </>
        )}

        {/* Composição do Valor - Estilo clean como horas registradas */}
        {breakdown && (
          <>
            <View style={styles.divider} />
            
            <View style={styles.registeredHoursSection}>
              <View style={styles.registeredHoursHeader}>
                <View style={styles.registeredHoursHeaderLeft}>
                  <Ionicons name="calculator-outline" size={16} color={Colors.primary} />
                  <Text style={styles.registeredHoursTitle}>
                    Composição do valor
                  </Text>
                </View>
              </View>
              
              <View style={styles.valueCalculationDetails}>
                {/* Para split shifts, mostrar apenas cálculo das horas do mês atual */}
                {shift.splitHours ? (
                  <>
                    {/* Apenas horas deste mês (não mostrar próximo mês) */}
                    <View style={styles.valueCalculationRow}>
                      <Text style={[styles.valueCalculationText, { color: Colors.info }]}>
                        {formatHourlyRate(breakdown.hourlyValue)} × {shift.splitHours.hoursThisMonth}h (split - este mês)
                        {breakdown.weekend && breakdown.isNaturalWeekend ? ' (FDS)' : ''}
                        {breakdown.isFridayNight ? ' (Sexta N)' : ''}
                      </Text>
                      <Text style={[styles.valueCalculationAmount, { color: Colors.info }]}>
                        R$ {formatMoneyCompact((breakdown.hourlyValue || 0) * shift.splitHours.hoursThisMonth)}
                      </Text>
                    </View>
                    
                    {/* Bônus de fidelização para split (proporcional às horas do split) */}
                    {breakdown.loyaltyPercentage > 0 && (
                      <View style={styles.valueCalculationRow}>
                        <Text style={[styles.valueCalculationText, { color: Colors.primary }]}>
                          + Fidelização {breakdown.loyaltyPercentage}% (sobre {shift.splitHours.hoursThisMonth}h)
                        </Text>
                        <Text style={[styles.valueCalculationAmount, { color: Colors.primary }]}>
                          R$ {formatMoneyCompact(((breakdown.hourlyValue || 0) * shift.splitHours.hoursThisMonth * breakdown.loyaltyPercentage) / 100)}
                        </Text>
                      </View>
                    )}
                    
                    {/* Bônus geral para split (proporcional às horas do split) */}
                    {breakdown.generalBonusPercentage > 0 && (
                      <View style={styles.valueCalculationRow}>
                        <Text style={[styles.valueCalculationText, { color: Colors.success }]}>
                          + Bônus {breakdown.generalBonusPercentage}% (sobre {shift.splitHours.hoursThisMonth}h)
                        </Text>
                        <Text style={[styles.valueCalculationAmount, { color: Colors.success }]}>
                          R$ {formatMoneyCompact(((breakdown.hourlyValue || 0) * shift.splitHours.hoursThisMonth * breakdown.generalBonusPercentage) / 100)}
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  /* Cálculo normal para plantões não-split */
                  <>
                    <View style={styles.valueCalculationRow}>
                      <Text style={styles.valueCalculationText}>
                        {formatHourlyRate(breakdown.hourlyValue)} × {breakdown.hours || 0}h
                        {breakdown.weekend && breakdown.isNaturalWeekend ? ' (FDS)' : ''}
                        {breakdown.isFridayNight ? ' (Sexta N)' : ''}
                      </Text>
                      <Text style={styles.valueCalculationAmount}>
                        R$ {formatMoneyCompact(breakdown.baseValue) || '0,00'}
                      </Text>
                    </View>
                    
                    {/* Bônus de fidelização para plantões normais */}
                    {breakdown.loyaltyBonus > 0 && (
                      <View style={styles.valueCalculationRow}>
                        <Text style={[styles.valueCalculationText, { color: Colors.primary }]}>
                          + Fidelização {breakdown.loyaltyPercentage}%
                        </Text>
                        <Text style={[styles.valueCalculationAmount, { color: Colors.primary }]}>
                          R$ {formatMoneyCompact(breakdown.loyaltyBonus)}
                        </Text>
                      </View>
                    )}
                    
                    {/* Bônus geral para plantões normais */}
                    {breakdown.generalBonus > 0 && (
                      <View style={styles.valueCalculationRow}>
                        <Text style={[styles.valueCalculationText, { color: Colors.success }]}>
                          + Bônus {breakdown.generalBonusPercentage}%
                        </Text>
                        <Text style={[styles.valueCalculationAmount, { color: Colors.success }]}>
                          R$ {formatMoneyCompact(breakdown.generalBonus)}
                        </Text>
                      </View>
                    )}
                  </>
                )}
                
                {/* Observação sobre sexta-feira */}
                {breakdown.isFridayNight && (
                  <View style={styles.shiftContextInfo}>
                    <Text style={[styles.contextInfoText, { color: Colors.warning }]}>
                    - Sexta-feira (N) - aplicando valor de FDS
                    </Text>
                  </View>
                )}
              </View>
              
              {/* Linha de origem dos valores - FORA do registeredHoursDetails */}
              {/* <View style={styles.valueSourceContainer}>
                <Text style={styles.valueSourceText}>
                  {breakdown.hours || 0}h × R$ {breakdown.hourlyValue?.toFixed(0) || '0'}
                  {breakdown.loyaltyBonus > 0 && ` | + ${breakdown.loyaltyPercentage}% fidelização`}
                  {breakdown.generalBonus > 0 && ` | + ${breakdown.generalBonusPercentage}% bônus`}
                </Text>
              </View> */}
            </View>
          </>
        )}
      </View>
    );
  };

  if (!isVisible) return null;

  return (
    <View style={styles.container}>
      {/* Backdrop */}
      <Animated.View 
        style={[
          styles.backdrop, 
          { opacity: backdropOpacity }
        ]}
      >
        <Pressable style={styles.backdropPressable} onPress={onClose} />
      </Animated.View>

      {/* Bottom Sheet */}
      <Animated.View
        style={[
          styles.bottomSheet,
          { transform: [{ translateY }] }
        ]}
      >
        {/* Área de gesto para fechar - apenas handle e header */}
        <View style={styles.gestureArea} {...panResponder.panHandlers}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Text style={styles.dateTitle}>{formatDateHeader(selectedDate)}</Text>
              <Text style={styles.shiftsCountText}>
                {shifts.length} {shifts.length === 1 ? 'plantão agendado' : 'plantões agendados'}
              </Text>
            </View>
            
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.text.secondary} />
            </Pressable>
          </View>
        </View>

        {/* Content */}
        <ScrollView 
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          bounces={false} // Remove bounce para evitar conflito
          scrollEventThrottle={16} // Melhora performance
          keyboardShouldPersistTaps="handled" // Melhora interação
          nestedScrollEnabled={true} // Permite scroll aninhado no Android
          overScrollMode="never" // Android: evita overscroll
        >
          {shifts && shifts.length > 0 ? (
            shifts.map((shift, index) => renderShiftCard(shift, index))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>Nenhum plantão</Text>
              <Text style={styles.emptySubtitle}>Não há plantões agendados para este dia</Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>

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

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.shadow.overlay,
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
    backgroundColor: Colors.background.primary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...Shadows.strong,
  },

  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border.medium,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border.light,
  },

  headerContent: {
    flex: 1,
  },

  dateTitle: {
    fontSize: Typography.fontSize.title2,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text.primary,
    marginBottom: 2,
  },

  shiftsCountText: {
    fontSize: Typography.fontSize.subhead,
    color: Colors.text.secondary,
    textTransform: 'lowercase',
  },

  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
  },

  content: {
    flex: 1,
  },

  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl + 34, // Safe area bottom
  },

  // Shift Card
  shiftCard: {
    backgroundColor: Colors.background.primary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.small,
  },

  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingBottom: Spacing.xs,
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
    fontSize: 18, // Reduzido de Typography.fontSize.title2 para caber valores maiores
    fontWeight: Typography.fontWeight.bold,
    color: Colors.success,
    marginBottom: 2,
  },

  shiftValueLabel: {
    fontSize: Typography.fontSize.footnote,
    color: Colors.text.tertiary,
    fontWeight: Typography.fontWeight.medium,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border.light,
    marginHorizontal: Spacing.lg,
  },

  shiftDetails: {
    paddingHorizontal: Spacing.lg,
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
    color: Colors.text.secondary,
    flex: 1,
    fontWeight: Typography.fontWeight.medium,
  },

  groupText: {
    color: Colors.text.tertiary,
    fontSize: Typography.fontSize.footnote,
  },

  // Botão compacto integrado
  compactActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.light,
  },

  compactActionButtonActive: {
    backgroundColor: Colors.primary + '10',
    borderColor: Colors.primary + '30',
  },

  // Calculation Summary
  calculationSummary: {
    backgroundColor: Colors.info + '08',
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg, // Adiciona margem no final
    borderLeftWidth: 3,
    borderLeftColor: Colors.info,
    borderRightWidth: 3,
    borderRightColor: Colors.info,
  },

  summaryTitle: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },

  summaryItem: {
    fontSize: Typography.fontSize.footnote,
    color: Colors.text.secondary,
    fontWeight: Typography.fontWeight.medium,
    marginBottom: 2,
  },

  summaryBonus: {
    fontSize: Typography.fontSize.footnote,
    color: Colors.success,
    fontWeight: Typography.fontWeight.medium,
    marginBottom: 2,
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
    color: Colors.text.primary,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },

  emptySubtitle: {
    fontSize: Typography.fontSize.subhead,
    color: Colors.text.secondary,
    textAlign: 'center',
  },

  // Registered Hours Section (Nueva estructura visual)
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
    color: Colors.text.secondary,
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
    color: Colors.text.tertiary,
    fontWeight: '500',
    margin: 2,
  },

  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.error + '10',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.error + '20',
  },

  clearButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.error,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  registeredHoursDisplay: {
    marginBottom: Spacing.sm,
  },

  registeredHoursTime: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    letterSpacing: 0.3,
  },

  extrasIndicator: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },

  extrasContent: {
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

  // Novos estilos para composição de valor clean
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
    color: Colors.text.secondary,
    flex: 1,
  },

  valueCalculationAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
    textAlign: 'right',
  },

  // Container e texto para origem dos valores
  valueSourceContainer: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border.light,
  },

  valueSourceText: {
    fontSize: 10,
    fontWeight: '500',
    color: Colors.text.tertiary,
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  splitInlineBadge: {
    backgroundColor: Colors.info + '15',
    borderColor: Colors.info + '30',
    marginRight: Spacing.sm,
  },
});

export default ShiftBottomSheet;