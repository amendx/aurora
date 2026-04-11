import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import * as SecureStore from 'expo-secure-store';
import { AuthContext } from '../context/AuthContext';
import { useShifts } from '../contexts/ShiftsContext';
import { Colors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';
import Logger from '../utils/Logger';
import ShiftBottomSheet from '../components/ShiftBottomSheet';
import { getShiftValues, calculateShiftValueSync } from '../utils/ShiftValueCalculator';

// Configurar calendário em português
LocaleConfig.locales['pt'] = {
  monthNames: [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ],
  monthNamesShort: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
  dayNames: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  dayNamesShort: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'],
  today: 'Hoje'
};
LocaleConfig.defaultLocale = 'pt';

const CalendarScreenPremium = ({ navigation }) => {
  const { user } = useContext(AuthContext);
  const { 
    daysWithShifts, 
    loading, 
    error, 
    loadMonthlyShifts, 
    hasDataFor,
    hoursReport 
  } = useShifts();
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [markedDates, setMarkedDates] = useState({});
  const [themeKey, setThemeKey] = useState(0);
  
  // Estado para filtros de tipo de plantão
  const [shiftFilters, setShiftFilters] = useState({
    M: true,  // Manhã
    T: true,  // Tarde
    N: true   // Noite
  });

  // Estados para o BottomSheet
  const [bottomSheetVisible, setBottomSheetVisible] = useState(false);
  const [selectedDayData, setSelectedDayData] = useState(null);
  const [shiftValues, setShiftValues] = useState(null);
  const [extraHours, setExtraHours] = useState(0);

  // Carregar dados quando a data mudar
  useEffect(() => {
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();
    
    if (!hasDataFor(month, year)) {
      Logger.debug(`📅 CalendarScreen: Carregando dados para ${month}/${year}`);
      loadMonthlyShifts(month, year);
    } else {
      Logger.debug(`📅 CalendarScreen: Usando dados em cache para ${month}/${year}`);
    }
  }, [currentDate]);

  // Carregar configurações de valores
  useEffect(() => {
    loadShiftValues();
  }, []);

  const loadShiftValues = async () => {
    try {
      const values = await getShiftValues();
      setShiftValues(values);
    } catch (error) {
      Logger.warn('Erro ao carregar configurações de valores:', error);
    }
  };

  // Calcular horas extras registradas no mês
  const calculateExtraHours = async () => {
    try {
      let totalExtras = 0;
      
      console.log('🔍 calculateExtraHours - Iniciando cálculo para mês:', currentDate.getMonth() + 1);
      
      if (!daysWithShifts) return 0;

      for (const day of daysWithShifts) {
        if (day.shifts) {
          const dateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
          const savedHoursKey = `real_hours_${dateKey}`;
          
          console.log('🔍 calculateExtraHours - Verificando dia:', dateKey);
          
          // Tentar carregar horas reais salvas para este dia
          const savedHours = await SecureStore.getItemAsync(savedHoursKey);
          
          if (savedHours) {
            const realHours = JSON.parse(savedHours);
            console.log('🔍 calculateExtraHours - Horas salvas encontradas:', realHours);
            
            // Para cada plantão do dia, calcular diferença
            day.shifts.forEach((shift, index) => {
              const shiftRealHours = realHours[index];
              
              console.log('🔍 calculateExtraHours - Shift', index, ':', {
                shiftTime: shift.time,
                realHours: shiftRealHours
              });
              
              if (shiftRealHours?.startTime && shiftRealHours?.endTime) {
                // Calcular horas previstas
                const shiftTime = shift.time || '';
                let timeParts = shiftTime.split(' – ');
                if (timeParts.length !== 2) {
                  timeParts = shiftTime.split(' - ');
                }
                
                if (timeParts.length === 2) {
                  const [predictedStart, predictedEnd] = timeParts.map(time => time.replace(/\s*\([^)]*\)/, '').trim());
                  const predictedDurationMin = calculateDuration(predictedStart, predictedEnd);
                  const realDurationMin = calculateDuration(shiftRealHours.startTime, shiftRealHours.endTime);
                  
                  console.log('🔍 calculateExtraHours - Durações calculadas:', {
                    predictedDurationMin,
                    realDurationMin,
                    difference: realDurationMin - predictedDurationMin
                  });
                  
                  if (predictedDurationMin !== null && realDurationMin !== null) {
                    const differenceMin = realDurationMin - predictedDurationMin;
                    // Incluir TODAS as diferenças (positivas e negativas)
                    totalExtras += differenceMin / 60;
                    
                    console.log('🔍 calculateExtraHours - Diferença adicionada:', {
                      differenceMin,
                      differenceHours: differenceMin / 60,
                      totalAcumulado: totalExtras
                    });
                  }
                }
              }
            });
          }
        }
      }
      
      console.log('🔍 calculateExtraHours - Total final:', totalExtras);
      return totalExtras;
    } catch (error) {
      Logger.warn('Erro ao calcular horas extras:', error);
      return 0;
    }
  };

  // Calcular duração em minutos
  const calculateDuration = (startTime, endTime) => {
    try {
      // Normalizar formato dos horários (tanto "07h00" quanto "07:00")
      const normalizeTime = (time) => {
        return time.replace('h', ':');
      };
      
      const normalizedStart = normalizeTime(startTime);
      const normalizedEnd = normalizeTime(endTime);
      
      const [startHour, startMin] = normalizedStart.split(':').map(Number);
      const [endHour, endMin] = normalizedEnd.split(':').map(Number);
      
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

  // Atualizar marcações quando os dados mudarem
  useEffect(() => {
    updateCalendarMarkers();
    // Recalcular horas extras quando os dados mudarem
    calculateExtraHours().then(setExtraHours);
  }, [daysWithShifts, shiftFilters]);

  // Função para atualizar as marcações do calendário baseado nos filtros
  const updateCalendarMarkers = () => {
    if (!daysWithShifts || daysWithShifts.length === 0) {
      setMarkedDates({});
      return;
    }

    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();
    
    const marked = {};
    daysWithShifts.forEach(dayData => {
      const dateString = `${year}-${String(month).padStart(2, '0')}-${String(dayData.day).padStart(2, '0')}`;
      
      // Definir cores por tipo de plantão
      const shiftTypeColors = {
        'M': Colors.success,      // Manhã - Verde
        'T': Colors.primary,      // Tarde - Azul
        'N': Colors.warning       // Noite - Laranja
      };

      // Aplicar filtros de tipo
      let visibleShifts = dayData.shifts || [];
      visibleShifts = visibleShifts.filter(shift => {
        const type = shift.label?.charAt(0);
        return shiftFilters[type];
      });

      if (visibleShifts.length === 0) {
        return; // Não marcar dias sem plantões visíveis
      }

      // Criar pontos (dots) para cada tipo de plantão visível
      const shiftTypes = [...new Set(visibleShifts.map(s => s.label?.charAt(0)))];
      const dots = shiftTypes.map(type => ({
        color: shiftTypeColors[type] || Colors.primary,
      }));

      // Determinar cor de seleção baseada no tipo predominante
      let selectedColor = Colors.primary; // padrão
      if (shiftTypes.length === 1) {
        selectedColor = shiftTypeColors[shiftTypes[0]];
      } else if (shiftTypes.length > 1) {
        // Para múltiplos tipos, usar cor neutra mas destacada
        selectedColor = Colors.interactive.inactive;
      }

      // Marcar como selected com dots
      marked[dateString] = {
        selected: true,
        marked: true,
        selectedColor: selectedColor,
        dots: dots,
        dotColor: dots[0]?.color || Colors.primary
      };
    });

    setMarkedDates(marked);
    
    // Forçar re-render do tema do calendário quando os filtros mudarem
    setThemeKey(prev => prev + 1);
  };

  // Alternar filtro de tipo de plantão
  const toggleShiftFilter = (type) => {
    setShiftFilters(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  // Obter cor do botão de filtro baseado no estado
  const getFilterButtonColor = (type, isActive) => {
    const colors = {
      'M': Colors.success,
      'T': Colors.primary,
      'N': Colors.warning
    };
    
    return isActive ? colors[type] : Colors.background.secondary;
  };

  // Manipular pressionar um dia
  const handleDayPress = (day) => {
    const dayData = daysWithShifts?.find(d => d.day === parseInt(day.day));
    
    if (!dayData || !dayData.shifts || dayData.shifts.length === 0) {
      return;
    }
    
    // Criar objeto Date válido para o BottomSheet
    // Se dayData.date já é um objeto Date, usar ele; senão criar um novo
    let selectedDate;
    if (dayData.date instanceof Date) {
      selectedDate = dayData.date;
    } else if (typeof dayData.date === 'string') {
      // Corrigir problema de timezone - parsear manualmente para evitar offset UTC
      if (dayData.date.includes('-')) {
        // Formato YYYY-MM-DD
        const [year, month, day] = dayData.date.split('-');
        selectedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      } else {
        selectedDate = new Date(dayData.date);
      }
    } else {
      // Fallback: criar data baseada no dia selecionado e mês/ano do calendário atual
      selectedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), parseInt(day.day));
    }
    
    setSelectedDayData({
      date: selectedDate,
      shifts: dayData.shifts
    });
    setBottomSheetVisible(true);
  };

  const handleCloseBottomSheet = () => {
    setBottomSheetVisible(false);
    setSelectedDayData(null);
  };

  const calculateShiftValueForBottomSheet = (shift, dateString) => {
    return calculateShiftValueSync(shift, dateString, shiftValues);
  };

  // Callback chamado quando horas são alteradas no BottomSheet
  const handleHoursChanged = async (dateKey, newHours) => {
    console.log('📊 Horas alteradas para', dateKey, '- Recalculando totalizador...');
    
    // Recalcular horas extras após mudança
    try {
      const newExtraHours = await calculateExtraHours();
      setExtraHours(newExtraHours);
    } catch (error) {
      console.error('Erro ao recalcular horas extras:', error);
    }
  };

  // Navegar para GroupsScreen com grupo selecionado
  const handleNavigateToGroup = (group) => {
    if (navigation?.navigate && group?.id) {
      handleCloseBottomSheet();
      // Pequeno delay para fechar o bottom sheet antes de navegar
      setTimeout(() => {
        navigation.navigate('GroupsScreen', { focusGroupId: group.id });
      }, 300);
    }
  };

  const goToPreviousMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setCurrentDate(newDate);
  };

  const goToNextMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setCurrentDate(newDate);
  };

  // Gerar estatísticas do mês baseado nos filtros ativos
  const generateStatistics = () => {
    if (!daysWithShifts || daysWithShifts.length === 0) {
      return {
        totalDays: 0,
        totalShifts: 0,
        byType: { M: 0, T: 0, N: 0 },
        filteredHours: 0,
        extraHours: 0,
        extraHoursFormatted: '0h'
      };
    }

    // Formatar horas extras com sinal e cor apropriada
    const formatExtraHours = (hours) => {
      if (hours === 0) return '0h';
      
      const absHours = Math.abs(hours);
      const wholeHours = Math.floor(absHours);
      const minutes = Math.round((absHours - wholeHours) * 60);
      
      let formatted = '';
      if (wholeHours > 0 && minutes > 0) {
        formatted = `${wholeHours}h${minutes.toString().padStart(2, '0')}`;
      } else if (wholeHours > 0) {
        formatted = `${wholeHours}h`;
      } else {
        formatted = `${minutes}min`;
      }
      
      return hours >= 0 ? `+${formatted}` : `-${formatted}`;
    };

    const stats = {
      totalDays: 0,
      totalShifts: 0,
      byType: { M: 0, T: 0, N: 0 },
      filteredHours: 0,
      extraHours: Math.round(extraHours * 100) / 100, // Arredondar para 2 casas decimais
      extraHoursFormatted: formatExtraHours(extraHours)
    };

    // Contar apenas dias que possuem shifts visíveis após filtros
    let daysWithVisibleShifts = 0;

    daysWithShifts.forEach(day => {
      if (day.shifts) {
        // Filtrar turnos baseado nos filtros ativos
        const filteredShifts = day.shifts.filter(shift => {
          const type = shift.label?.charAt(0);
          return shiftFilters[type];
        });

        // Se há turnos visíveis neste dia, contar o dia
        if (filteredShifts.length > 0) {
          daysWithVisibleShifts++;
          stats.totalShifts += filteredShifts.length;

          // Contar por tipo apenas os visíveis
          filteredShifts.forEach(shift => {
            const type = shift.label?.charAt(0);
            if (stats.byType[type] !== undefined) {
              stats.byType[type]++;
              // Calcular horas baseado no tipo (assumindo M=6h, T=6h, N=12h)
              const hoursPerShift = type === 'N' ? 12 : 6;
              stats.filteredHours += hoursPerShift;
            }
          });
        }
      }
    });

    stats.totalDays = daysWithVisibleShifts;
    return stats;
  };

  const formatMonth = (date) => {
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  };

  const stats = generateStatistics();

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* Month Navigation */}
        <View style={styles.monthHeader}>
          <Pressable style={styles.navButton} onPress={goToPreviousMonth}>
            <Ionicons name="chevron-back" size={20} color={Colors.interactive.active} />
          </Pressable>
          
          <Text style={styles.monthTitle}>{formatMonth(currentDate)}</Text>
          
          <Pressable style={styles.navButton} onPress={goToNextMonth}>
            <Ionicons name="chevron-forward" size={20} color={Colors.interactive.active} />
          </Pressable>
        </View>

        {/* Statistics Overview */}
        <View style={styles.statsSection}>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={[
                styles.statNumber,
                {
                  color: stats.extraHours === 0 
                    ? Colors.text.secondary
                    : stats.extraHours > 0 
                      ? Colors.success 
                      : Colors.error
                }
              ]}>
                {stats.extraHoursFormatted}
              </Text>
              <Text style={styles.statLabel}>Horas Extras</Text>
            </View>
            
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.totalShifts}</Text>
              <Text style={styles.statLabel}>Plantões</Text>
            </View>
            
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.filteredHours}h</Text>
              <Text style={styles.statLabel}>Horas</Text>
            </View>
          </View>
        </View>

        {/* Shift Filters */}
        <View style={styles.filtersSection}>
          <Text style={styles.filtersTitle}>Filtrar por período</Text>
          <View style={styles.filtersRow}>
            {[
              { key: 'M', label: 'Manhã', count: stats.byType.M },
              { key: 'T', label: 'Tarde', count: stats.byType.T },
              { key: 'N', label: 'Noite', count: stats.byType.N }
            ].map(filter => (
              <Pressable
                key={filter.key}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: shiftFilters[filter.key] 
                      ? getFilterButtonColor(filter.key, true)
                      : Colors.background.secondary,
                    borderColor: getFilterButtonColor(filter.key, true),
                    borderWidth: shiftFilters[filter.key] ? 0 : 1,
                  }
                ]}
                onPress={() => toggleShiftFilter(filter.key)}
              >
                <Text style={[
                  styles.filterChipText,
                  { 
                    color: shiftFilters[filter.key] 
                      ? Colors.background.primary 
                      : Colors.text.secondary 
                  }
                ]}>
                  {filter.label}
                </Text>
                {filter.count > 0 && (
                  <View style={[
                    styles.filterBadge,
                    { 
                      backgroundColor: shiftFilters[filter.key] 
                        ? Colors.background.primary + '30'
                        : getFilterButtonColor(filter.key, true) + '20'
                    }
                  ]}>
                    <Text style={[
                      styles.filterBadgeText,
                      { 
                        color: shiftFilters[filter.key] 
                          ? Colors.background.primary 
                          : getFilterButtonColor(filter.key, true)
                      }
                    ]}>
                      {filter.count}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Calendário */}
        <View style={styles.calendarSection}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Carregando plantões...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
              <Text style={styles.errorText}>Erro ao carregar dados</Text>
              <Pressable 
                style={styles.retryButton}
                onPress={() => loadMonthlyShifts(currentDate.getMonth() + 1, currentDate.getFullYear())}
              >
                <Text style={styles.retryButtonText}>Tentar novamente</Text>
              </Pressable>
            </View>
          ) : (
            <Calendar
              key={themeKey}
              current={`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`}
              minDate="2020-01-01"
              maxDate="2040-12-31"
              onDayPress={handleDayPress}
              monthFormat="MMMM yyyy"
              hideExtraDays={true}
              disableMonthChange={true}
              firstDay={0}
              hideArrows={true}
              hideDayNames={false}
              showWeekNumbers={false}
              onMonthChange={null}
              enableSwipeMonths={false}
              markedDates={markedDates}
              markingType="multi-dot"
              theme={{
                backgroundColor: 'transparent',
                calendarBackground: 'transparent',
                textSectionTitleColor: Colors.text.secondary,
                selectedDayBackgroundColor: Colors.primary,
                selectedDayTextColor: Colors.background.primary,
                todayTextColor: Colors.primary,
                dayTextColor: Colors.text.primary,
                textDisabledColor: Colors.text.tertiary,
                dotColor: Colors.primary,
                selectedDotColor: Colors.background.primary,
                arrowColor: Colors.text.primary,
                disabledArrowColor: Colors.text.tertiary,
                monthTextColor: Colors.text.primary,
                indicatorColor: Colors.primary,
                textDayFontFamily: Typography.fontFamily.regular,
                textMonthFontFamily: Typography.fontFamily.semiBold,
                textDayHeaderFontFamily: Typography.fontFamily.medium,
                textDayFontWeight: Typography.fontWeight.regular,
                textMonthFontWeight: Typography.fontWeight.semiBold,
                textDayHeaderFontWeight: Typography.fontWeight.medium,
                textDayFontSize: 17,
                textMonthFontSize: Typography.fontSize.title3,
                textDayHeaderFontSize: Typography.fontSize.caption1,
                // Personalização dos dias
                'stylesheet.calendar.header': {
                  week: {
                    marginTop: 5,
                    flexDirection: 'row',
                    justifyContent: 'space-around',
                  },
                },
                'stylesheet.calendar.main': {
                  container: {
                    paddingLeft: 10,
                    paddingRight: 10,
                  },
                  week: {
                    marginTop: 2,
                    marginBottom: 2,
                    flexDirection: 'row',
                    justifyContent: 'space-around',
                  },
                },
                'stylesheet.day.basic': {
                  base: {
                    width: 42,
                    height: 42,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginVertical: 1,
                  },
                  text: {
                    marginTop: 2,
                    fontSize: 17,
                    fontFamily: Typography.fontFamily.regular,
                    fontWeight: Typography.fontWeight.regular,
                    color: Colors.text.primary,
                    backgroundColor: 'transparent',
                  },
                  today: {
                    backgroundColor: 'transparent',
                  },
                  todayText: {
                    color: Colors.primary,
                    fontWeight: Typography.fontWeight.semiBold,
                  },
                  selectedText: {
                    color: Colors.background.primary,
                    fontWeight: Typography.fontWeight.semiBold,
                  },
                  disabledText: {
                    color: Colors.text.tertiary,
                  },
                },
                'stylesheet.day.multiDot': {
                  base: {
                    width: 42,
                    height: 42,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginVertical: 1,
                  },
                  text: {
                    marginTop: 2,
                    fontSize: 17,
                    fontFamily: Typography.fontFamily.regular,
                    fontWeight: Typography.fontWeight.regular,
                    color: Colors.text.primary,
                    backgroundColor: 'transparent',
                  },
                  today: {
                    backgroundColor: 'transparent',
                  },
                  todayText: {
                    color: Colors.primary,
                    fontWeight: Typography.fontWeight.semiBold,
                  },
                  selectedText: {
                    color: Colors.background.primary,
                    fontWeight: Typography.fontWeight.semiBold,
                  },
                  disabledText: {
                    color: Colors.text.tertiary,
                  },
                  selected: {
                    backgroundColor: Colors.primary,
                    borderRadius: 8, // Menos circular
                    width: 40,
                    height: 40,
                  },
                  dot: {
                    width: 6,
                    height: 6,
                    marginTop: 1,
                    borderRadius: 3,
                  },
                  visibleDots: {
                    flexDirection: 'row',
                    justifyContent: 'center',
                    paddingHorizontal: 2,
                  },
                },
              }}
            />
          )}
        </View>
      </View>

      {/* Bottom Sheet */}
      <ShiftBottomSheet
        isVisible={bottomSheetVisible}
        onClose={handleCloseBottomSheet}
        shifts={selectedDayData?.shifts || []}
        selectedDate={selectedDayData?.date || null}
        calculateShiftValue={calculateShiftValueForBottomSheet}
        onHoursChanged={handleHoursChanged}
        onNavigateToGroup={handleNavigateToGroup}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
  },
  content: {
    paddingBottom: Spacing.xxxl + 60, // Extra space for tab bar
  },

  // Month Header
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.background.primary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border.light,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: Typography.fontSize.title2,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.text.primary,
    textTransform: 'capitalize',
  },

  // Statistics Section
  statsSection: {
    backgroundColor: Colors.background.primary,
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border.light,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.lg,
  },
  statCard: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: Typography.fontSize.largeTitle,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Filters Section
  filtersSection: {
    backgroundColor: Colors.background.primary,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border.light,
  },
  filtersTitle: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.text.primary,
    marginBottom: Spacing.md,
  },
  filtersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  filterChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
    minHeight: 44,
  },
  filterChipText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
    marginRight: Spacing.xs,
  },
  filterBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  filterBadgeText: {
    fontSize: Typography.fontSize.caption2,
    fontWeight: Typography.fontWeight.bold,
  },

  // Calendar Section
  calendarSection: {
    backgroundColor: Colors.background.primary,
    paddingBottom: Spacing.lg,
  },

  // Loading & Error States
  loadingContainer: {
    padding: Spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: Typography.fontSize.subhead,
    color: Colors.text.secondary,
  },
  errorContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  errorText: {
    fontSize: Typography.fontSize.body,
    color: Colors.error,
    textAlign: 'center',
    marginVertical: Spacing.md,
    fontWeight: Typography.fontWeight.medium,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  retryButtonText: {
    color: Colors.background.primary,
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
  },
});

export default CalendarScreenPremium;
