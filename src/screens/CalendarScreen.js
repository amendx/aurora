import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  useColorScheme,
  StatusBar,
  Animated,
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';

import { AuthContext } from '../context/AuthContext';
import { useShifts } from '../contexts/ShiftsContext';
import Logger from '../utils/Logger';
import COLORS from '../constants/Colors';

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

// Componente Skeleton para loading sutil
const SkeletonLoader = ({ width = '100%', height = 20, style = {} }) => {
  const animatedValue = new Animated.Value(0);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: false,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: false,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 0.3],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          backgroundColor: '#E0E0E0',
          borderRadius: 4,
          opacity,
        },
        style,
      ]}
    />
  );
};

const CalendarScreen = () => {
  const isDarkMode = useColorScheme() === 'dark';
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
  
  // Refs for debouncing month navigation
  const navigationTimeoutRef = useRef(null);
  const isNavigatingRef = useRef(false);
  const pendingDateRef = useRef(null);
  
  // Estado para filtros de tipo de plantão
  const [shiftFilters, setShiftFilters] = useState({
    M: true,  // Manhã
    T: true,  // Tarde
    N: true   // Noite
  });

  // Debounced navigation - only load data after user stops clicking
  const navigateToMonth = useCallback((targetDate) => {
    // Clear any existing timeout
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
    }
    
    // Update the UI immediately (optimistic update)
    setCurrentDate(targetDate);
    
    // Store the pending date for loading
    pendingDateRef.current = targetDate;
    isNavigatingRef.current = true;
    
    // Wait 500ms after the last click before loading data
    navigationTimeoutRef.current = setTimeout(() => {
      const month = pendingDateRef.current.getMonth() + 1;
      const year = pendingDateRef.current.getFullYear();
      
      if (!hasDataFor(month, year)) {
        console.log(`📅 CalendarScreen: Loading data for ${month}/${year} (after navigation settled)`);
        loadMonthlyShifts(month, year);
      } else {
        console.log(`📅 CalendarScreen: Using cached data for ${month}/${year}`);
      }
      
      isNavigatingRef.current = false;
      pendingDateRef.current = null;
    }, 500);
  }, [hasDataFor, loadMonthlyShifts]);

  // Load data immediately on mount, then rely on navigateToMonth for subsequent changes
  useEffect(() => {
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();
    
    // Only load on initial mount if we don't have data
    if (!hasDataFor(month, year) && !isNavigatingRef.current) {
      console.log(`📅 CalendarScreen: Initial load for ${month}/${year}`);
      loadMonthlyShifts(month, year);
    }
    
    // Cleanup function to clear timeout on unmount
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []); // Only run on mount

  // Atualizar marcações quando os dados mudarem
  useEffect(() => {
    updateCalendarMarkers();
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
        'M': COLORS.SHIFTS_1,    // Manhã - Mint Leaf
        'T': COLORS.SHIFTS_2,    // Tarde - Sky Blue
        'N': COLORS.SHIFTS_3     // Noite - Sunset Orange
      };

      // Aplicar filtros de tipo
      let visibleShifts = dayData.shifts || [];
      visibleShifts = visibleShifts.filter(shift => {
        const type = shift.label.charAt(0);
        return shiftFilters[type];
      });

      if (visibleShifts.length === 0) {
        return; // Não marcar dias sem plantões visíveis
      }

      // Criar pontos (dots) para cada tipo de plantão visível
      const shiftTypes = [...new Set(visibleShifts.map(s => s.label.charAt(0)))];
      const dots = shiftTypes.map(type => ({
        color: shiftTypeColors[type] || COLORS.SHIFTS_1,
      }));

      // Determinar cor de seleção baseada no tipo predominante
      let selectedColor = COLORS.SHIFTS_1; // padrão
      if (shiftTypes.length === 1) {
        selectedColor = shiftTypeColors[shiftTypes[0]];
      } else if (shiftTypes.length > 1) {
        // Para múltiplos tipos, usar cor neutra mas destacada
        selectedColor = COLORS.TEXT_DISABLED_DARK;
      }

      // Marcar como selected com dots
      marked[dateString] = {
        selected: true,
        marked: true,
        selectedColor: selectedColor,
        dots: dots,
        dotColor: dots[0]?.color || COLORS.SHIFTS_1
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
      'M': COLORS.SHIFTS_1,
      'T': COLORS.SHIFTS_2,
      'N': COLORS.SHIFTS_3
    };
    
    return isActive ? colors[type] : COLORS.CARD_BACKGROUND;
  };

  // Manipular pressionar um dia
  const handleDayPress = (day) => {
    const dayData = daysWithShifts?.find(d => d.day === parseInt(day.day));
    if (!dayData || !dayData.shifts || dayData.shifts.length === 0) {
      return;
    }
    
    const shiftsText = dayData.shifts.map((shift, index) => 
      `${index + 1}. ${shift.time || 'Horário N/A'}\n` +
      `   Grupo: ${shift.group?.name || 'N/A'}\n` +
      `   Hospital: ${shift.group?.institution?.name || 'N/A'}\n` +
      `   Período: ${shift.label}`
    ).join('\n\n');
    
    Alert.alert(
      `Plantões - ${day.day}/${day.month}/${day.year}`,
      `${shiftsText}\n\n📊 Total: ${dayData.shifts.length} plantão(s)`,
      [{ text: 'OK' }]
    );
  };

  const goToPreviousMonth = useCallback(() => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() - 1);
    navigateToMonth(newDate);
  }, [currentDate, navigateToMonth]);

  const goToNextMonth = useCallback(() => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + 1);
    navigateToMonth(newDate);
  }, [currentDate, navigateToMonth]);

  // Gerar estatísticas do mês baseado nos filtros ativos
  const generateStatistics = () => {
    if (!daysWithShifts || daysWithShifts.length === 0) {
      return {
        totalDays: 0,
        totalShifts: 0,
        byType: { M: 0, T: 0, N: 0 },
        totalHours: 0
      };
    }

    const stats = {
      totalDays: 0,
      totalShifts: 0,
      byType: { M: 0, T: 0, N: 0 },
      totalHours: hoursReport?.realHours || 0 // Usar horas totais (previstas + extras) do contexto
    };

    daysWithShifts.forEach(day => {
      if (day.shifts) {
        // Filtrar turnos baseado nos filtros ativos
        const filteredShifts = day.shifts.filter(shift => {
          const type = shift.label.charAt(0);
          return shiftFilters[type];
        });

        // Se há turnos visíveis neste dia, contar o dia
        if (filteredShifts.length > 0) {
          stats.totalDays++;
          stats.totalShifts += filteredShifts.length;

          // Contar por tipo apenas os visíveis
          filteredShifts.forEach(shift => {
            const type = shift.label.charAt(0);
            if (stats.byType[type] !== undefined) {
              stats.byType[type]++;
            }
          });
        }
      }
    });

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
    <View style={[styles.container, isDarkMode && styles.containerDark]}>
      <StatusBar 
        barStyle={isDarkMode ? "light-content" : "dark-content"}
        backgroundColor={isDarkMode ? COLORS.BACKGROUND_DARK : COLORS.BACKGROUND}
      />

      {/* Navegação de Mês */}
      <View style={styles.monthNavigation}>
        <TouchableOpacity onPress={goToPreviousMonth} style={styles.navButton}>
          <Text style={[styles.navButtonText, isDarkMode && styles.textDark]}>‹</Text>
        </TouchableOpacity>
        
        <View style={styles.monthDisplay}>
          <Text style={[styles.monthTitle, isDarkMode && styles.textDark]}>
            {formatMonth(currentDate)}
          </Text>
        </View>
        
        <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
          <Text style={[styles.navButtonText, isDarkMode && styles.textDark]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Filtros de tipo de plantão */}
      <View style={styles.filtersContainer}>
        <View style={styles.filtersRow}>
          {[
            { key: 'M', label: 'Manhã' },
            { key: 'T', label: 'Tarde' },
            { key: 'N', label: 'Noite' }
          ].map(filter => (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.filterButton,
                {
                  backgroundColor: getFilterButtonColor(filter.key, shiftFilters[filter.key]),
                  opacity: shiftFilters[filter.key] ? 1 : 0.3
                }
              ]}
              onPress={() => toggleShiftFilter(filter.key)}
            >
              <Text style={[
                styles.filterButtonText,
                { color: shiftFilters[filter.key] ? '#fff' : COLORS.TEXT_SECONDARY }
              ]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>


        
        {/* Estatísticas */}
        {stats && (
          <View style={[styles.statsContainer, isDarkMode && styles.cardDark]}>            
            {loading ? (
              <SkeletonLoader height={80} style={{ marginVertical: 10 }} />
            ) : (
              <View style={styles.statsContent}>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, isDarkMode && styles.textDark]}>{stats.totalDays}</Text>
                  <Text style={[styles.statLabel, isDarkMode && styles.textSecondaryDark]}>Dias com plantão</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, isDarkMode && styles.textDark]}>{stats.totalShifts}</Text>
                  <Text style={[styles.statLabel, isDarkMode && styles.textSecondaryDark]}>Total de plantões</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, isDarkMode && styles.textDark]}>{stats.totalHours}h</Text>
                  <Text style={[styles.statLabel, isDarkMode && styles.textSecondaryDark]}>Horas totais</Text>
                </View>
              </View>
            )}

            <View style={styles.typeStats}>
              <View style={styles.typeStatsRow}>
                {Object.entries(stats.byType)
                  .filter(([type, count]) => shiftFilters[type] && count > 0) // Só mostrar tipos ativos com contagem > 0
                  .map(([type, count]) => (
                  <View key={type} style={styles.typeStatItem}>
                    <View style={[styles.typeIndicator, { backgroundColor: getFilterButtonColor(type, true) }]} />
                    <Text style={[styles.typeStatText, isDarkMode && styles.textSecondaryDark]}>
                      {type === 'M' ? 'Manhã' : type === 'T' ? 'Tarde' : 'Noite'}: {count}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Calendário */}
        <View style={[styles.calendarContainer, isDarkMode && styles.cardDark]}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.SHIFTS_1} />
              <Text style={[styles.loadingText, isDarkMode && styles.textDark]}>
                Carregando plantões...
              </Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={[styles.errorText, isDarkMode && styles.textDark]}>
                Erro ao carregar dados: {error}
              </Text>
              <TouchableOpacity 
                style={styles.retryButton}
                onPress={() => loadMonthlyShifts(currentDate.getMonth() + 1, currentDate.getFullYear())}
              >
                <Text style={styles.retryButtonText}>Tentar novamente</Text>
              </TouchableOpacity>
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
                backgroundColor: isDarkMode ? COLORS.CARD_BACKGROUND_DARK : COLORS.CARD_BACKGROUND,
                calendarBackground: isDarkMode ? COLORS.CARD_BACKGROUND_DARK : COLORS.CARD_BACKGROUND,
                textSectionTitleColor: isDarkMode ? COLORS.TEXT_PRIMARY_DARK : COLORS.TEXT_PRIMARY,
                selectedDayBackgroundColor: COLORS.SHIFTS_1,
                selectedDayTextColor: '#ffffff',
                todayTextColor: COLORS.SHIFTS_2,
                dayTextColor: isDarkMode ? COLORS.TEXT_PRIMARY_DARK : COLORS.TEXT_PRIMARY,
                textDisabledColor: isDarkMode ? COLORS.TEXT_DISABLED_DARK : COLORS.TEXT_DISABLED,
                dotColor: COLORS.SHIFTS_1,
                selectedDotColor: '#ffffff',
                arrowColor: isDarkMode ? COLORS.TEXT_PRIMARY_DARK : COLORS.TEXT_PRIMARY,
                disabledArrowColor: isDarkMode ? COLORS.TEXT_DISABLED_DARK : COLORS.TEXT_DISABLED,
                monthTextColor: isDarkMode ? COLORS.TEXT_PRIMARY_DARK : COLORS.TEXT_PRIMARY,
                indicatorColor: COLORS.SHIFTS_1,
                textDayFontFamily: 'System',
                textMonthFontFamily: 'System',
                textDayHeaderFontFamily: 'System',
                textDayFontWeight: '300',
                textMonthFontWeight: 'bold',
                textDayHeaderFontWeight: '300',
                textDayFontSize: 20,
                textMonthFontSize: 16,
                textDayHeaderFontSize: 13,
                'stylesheet.calendar.header': {
                  monthText: {
                    display: 'none'
                  },
                  week: {
                    marginTop: 5,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                  },
                  dayHeader: {
                    marginTop: 2,
                    marginBottom: 7,
                    width: 40,
                    textAlign: 'center',
                    fontSize: 13,
                    fontFamily: 'System',
                    fontWeight: 'bold',
                    color: isDarkMode ? COLORS.TEXT_SECONDARY_DARK : COLORS.TEXT_SECONDARY,
                  },
                },
                'stylesheet.day.basic': {
                  base: {
                    width: 40,
                    height: 40,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                  text: {
                    fontSize: 18,
                    fontFamily: 'Roboto',
                    color: isDarkMode ? COLORS.TEXT_PRIMARY_DARK : COLORS.TEXT_DISABLED,
                  },
                },
              }}
            />
          )}
        </View>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  containerDark: {
    backgroundColor: COLORS.BACKGROUND_DARK,
  },
  monthNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: COLORS.TEXT_PRIMARY,
  },
  monthDisplay: {
    flex: 1,
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY_DARK,
    textAlign: 'center',
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.SHIFTS_1,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  navButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  filtersContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: COLORS.SECONDARY,
  },
  filtersTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY_DARK,
    marginBottom: 8,
  },
  filtersRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 15,
    minWidth: 70,
    alignItems: 'center',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsContainer: {
    marginHorizontal: 15,
    marginTop: 10,
    marginBottom: 8,
    padding: 12,
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: 12,
    shadowColor: COLORS.SHADOW_COLOR,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  cardDark: {
    backgroundColor: COLORS.CARD_BACKGROUND_DARK,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 10,
  },
  statsContent: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.SHIFTS_1,
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
  },
  typeStats: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.SEPARATOR_COLOR,
  },
  typeStatsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 8,
  },
  typeStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  typeStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  typeStatText: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
  },
  calendarContainer: {
    flex: 1,
    marginHorizontal: 15,
    marginBottom: 15,
    padding: 12,
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: 12,
    shadowColor: COLORS.SHADOW_COLOR,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
  },
  errorContainer: {
    padding: 20,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: COLORS.ERROR,
    textAlign: 'center',
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: COLORS.SHIFTS_1,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  textDark: {
    color: COLORS.TEXT_PRIMARY_DARK,
  },
  textSecondaryDark: {
    color: COLORS.TEXT_SECONDARY_DARK,
  },
});

export default CalendarScreen;