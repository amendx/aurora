import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import * as SecureStore from 'expo-secure-store';
import { AuthContext } from '../context/AuthContext';
import { useShifts } from '../contexts/ShiftsContext';
import { useColors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';
import Logger from '../utils/Logger';
import ShiftBottomSheet from '../components/ShiftBottomSheet';
import { getShiftValues, calculateShiftValueSync } from '../utils/ShiftValueCalculator';
import TimeUtils from '../utils/TimeUtils';

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

const SkeletonBox = ({ width = '100%', height = 20, style }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.2] });
  return (
    <Animated.View
      style={[{ width, height, backgroundColor: '#90a4ae', borderRadius: 6, opacity }, style]}
    />
  );
};

/** Replaces a single day cell with a skeleton box — same outer dimensions as the real day cell. */
const SkeletonDay = () => (
  <View style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', marginVertical: 1 }}>
    <SkeletonBox width={36} height={36} style={{ borderRadius: 8 }} />
  </View>
);

const CalendarScreenPremium = ({ navigation }) => {
  useContext(AuthContext);
  const {
    daysWithShifts,
    loading,
    error,
    loadedFor,
    loadMonthlyShifts,
    hoursReport,
    persistTimeEntries,
    refreshMonthSummary,
  } = useShifts();
  const C = useColors();
  const s = makeStyles(C);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [markedDates, setMarkedDates] = useState({});
  const [themeKey, setThemeKey] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);

  // Refs for debouncing month navigation
  const navigationTimeoutRef = useRef(null);
  const isNavigatingRef = useRef(false);
  const pendingDateRef = useRef(null);
  const targetMonthKeyRef = useRef(null);

  // Estado para filtros de tipo de plantão
  const [shiftFilters, setShiftFilters] = useState({
    M: true,  // Manhã
    T: true,  // Tarde
    N: true,  // Noite
    D: true   // Derivado/Carryover (sempre incluir)
  });

  // Estados para o BottomSheet
  const [bottomSheetVisible, setBottomSheetVisible] = useState(false);
  const [selectedDayData, setSelectedDayData] = useState(null);
  const [shiftValues, setShiftValues] = useState(null);
  const [extraHours, setExtraHours] = useState(0);

  // Debounced navigation - only load data after user stops clicking
  const navigateToMonth = useCallback((targetDate) => {
    // Clear any existing timeout
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
    }

    // Update the UI immediately (optimistic update)
    setCurrentDate(targetDate);
    setIsNavigating(true);

    // Store the pending date for loading
    pendingDateRef.current = targetDate;
    isNavigatingRef.current = true;
    targetMonthKeyRef.current = `${targetDate.getFullYear()}-${targetDate.getMonth() + 1}`;

    // Wait 500ms after the last click before loading data
    navigationTimeoutRef.current = setTimeout(() => {
      const month = pendingDateRef.current.getMonth() + 1;
      const year = pendingDateRef.current.getFullYear();

      Logger.debug(`📅 CalendarScreen: Loading data for ${month}/${year} (after navigation settled)`);
      loadMonthlyShifts(month, year);

      isNavigatingRef.current = false;
      pendingDateRef.current = null;
    }, 500);
  }, [loadMonthlyShifts]);

  // Load data immediately on mount, then rely on navigateToMonth for subsequent changes
  useEffect(() => {
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();

    // Only load on initial mount
    if (!isNavigatingRef.current) {
      loadMonthlyShifts(month, year);
    }

    // Cleanup function to clear timeout on unmount
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []); // Only run on mount

  // Remount Calendar component when month/year changes so it displays the new month
  useEffect(() => {
    setThemeKey(prev => prev + 1);
  }, [currentDate.getFullYear(), currentDate.getMonth()]);

  // Clear navigation skeleton once the context confirms the target month is loaded
  useEffect(() => {
    if (loadedFor && loadedFor === targetMonthKeyRef.current) {
      setIsNavigating(false);
      targetMonthKeyRef.current = null;
    }
  }, [loadedFor]);

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


      if (!daysWithShifts) return 0;

      for (const day of daysWithShifts) {
        if (day.shifts) {
          const dateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
          const savedHoursKey = `real_hours_${dateKey}`;


          // Tentar carregar horas reais salvas para este dia
          const savedHours = await SecureStore.getItemAsync(savedHoursKey);

          if (savedHours) {
            const realHours = JSON.parse(savedHours);

            // Para cada plantão do dia, calcular diferença
            day.shifts.forEach((shift, index) => {
              const shiftRealHours = realHours[index];


              if (shiftRealHours?.startTime && shiftRealHours?.endTime) {
                // Calcular horas previstas
                const shiftTime = shift.time || '';
                let timeParts = shiftTime.split(' – ');
                if (timeParts.length !== 2) {
                  timeParts = shiftTime.split(' - ');
                }

                if (timeParts.length === 2) {
                  const [predictedStart, predictedEnd] = timeParts.map(time => time.replace(/\s*\([^)]*\)/, '').trim());
                  const predictedDurationMin = TimeUtils.calculateDurationMinutes(predictedStart, predictedEnd);
                  const realDurationMin = TimeUtils.calculateDurationMinutes(shiftRealHours.startTime, shiftRealHours.endTime);



                  if (predictedDurationMin !== null && realDurationMin !== null) {
                    const differenceMin = realDurationMin - predictedDurationMin;
                    // NOVA LÓGICA: trabalhar em minutos, converter apenas no final
                    totalExtras += differenceMin / 60; // Conversão para horas decimais (compatibilidade)


                  }
                }
              }
            });
          }
        }
      }


      return totalExtras;
    } catch (error) {
      Logger.warn('Erro ao calcular horas extras:', error);
      return 0;
    }
  };


  // Atualizar marcações quando os dados mudarem
  useEffect(() => {
    updateCalendarMarkers();
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
        'M': C.success,      // Manhã - Verde
        'T': C.primary,      // Tarde - Azul
        'N': C.warning       // Noite - Laranja
      };

      // Aplicar filtros de tipo
      let visibleShifts = dayData.shifts || [];
      visibleShifts = visibleShifts.filter(shift => {
        const type = shift.label?.charAt(0);
        // Incluir plantões conhecidos que estão habilitados OU plantões sem tipo definido
        return shiftFilters[type] || !type || !shiftFilters.hasOwnProperty(type);
      });

      if (visibleShifts.length === 0) {
        return; // Não marcar dias sem plantões visíveis
      }

      // Criar pontos (dots) para cada tipo de plantão visível
      const shiftTypes = [...new Set(visibleShifts.map(s => s.label?.charAt(0)))];
      const dots = shiftTypes.map(type => ({
        color: shiftTypeColors[type] || C.primary,
      }));

      // Determinar cor de seleção baseada no tipo predominante
      let selectedColor = C.primary; // padrão
      if (shiftTypes.length === 1) {
        selectedColor = shiftTypeColors[shiftTypes[0]];
      } else if (shiftTypes.length > 1) {
        // Para múltiplos tipos, usar cor neutra mas destacada
        selectedColor = C.interactive.inactive;
      }

      // Marcar como selected com dots
      marked[dateString] = {
        selected: true,
        marked: true,
        selectedColor: selectedColor,
        dots: dots,
        dotColor: dots[0]?.color || C.primary
      };
    });

    setMarkedDates(marked);
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
      'M': C.success,
      'T': C.primary,
      'N': C.warning
    };

    return isActive ? colors[type] : C.background.secondary;
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

    // Recalcular horas extras após mudança (existing behaviour)
    try {
      const newExtraHours = await calculateExtraHours();
      setExtraHours(newExtraHours);
    } catch (error) {
      console.error('Erro ao recalcular horas extras:', error);
    }

    // Persist time entries to LocalCache and refresh MonthSummary
    try {
      const dayData = (daysWithShifts || []).find(d => d.date === dateKey);
      if (dayData?.shifts && newHours) {
        await persistTimeEntries(dateKey, newHours, dayData.shifts);
      }
      const month = currentDate.getMonth() + 1;
      const year  = currentDate.getFullYear();
      await refreshMonthSummary(month, year);
    } catch (err) {
      console.warn('LocalCache summary refresh error:', err?.message);
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
        byType: { M: 0, T: 0, N: 0, D: 0 }, // Incluir tipo D para carryovers
        totalHours: 0,
        extraHours: 0,
        extraHoursFormatted: '0h'
      };
    }

    // Formatar horas extras com sinal e cor apropriada - CORRIGIDA para usar TimeUtils
    const formatExtraHours = (hours) => {
      if (hours === 0) return '0h';

      // Converter para minutos para evitar problemas de precisão
      const totalMinutes = Math.round(hours * 60);
      const formatted = TimeUtils.minutesToCompactDisplay(Math.abs(totalMinutes));

      return hours >= 0 ? `+${formatted}` : `-${formatted}`;
    };

    const stats = {
      totalDays: 0,
      totalShifts: 0,
      byType: { M: 0, T: 0, N: 0, D: 0 }, // Incluir tipo D para carryovers
      totalHours: hoursReport?.realHours || 0, // Usar horas totais (previstas + extras) do contexto
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
          // Incluir plantões conhecidos que estão habilitados OU plantões sem tipo definido
          return shiftFilters[type] || !type || !shiftFilters.hasOwnProperty(type);
        });

        // Se há turnos visíveis neste dia, contar o dia
        if (filteredShifts.length > 0) {
          daysWithVisibleShifts++;
          stats.totalShifts += filteredShifts.length;

          // Contar por tipo apenas os visíveis
          filteredShifts.forEach(shift => {
            const type = shift.label?.charAt(0);

            // Contar o shift por tipo (se o tipo é conhecido)
            if (stats.byType.hasOwnProperty(type)) {
              stats.byType[type]++;
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
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      <View style={s.content}>
        {/* Month Navigation */}
        <View style={s.monthHeader}>
          <Pressable style={s.navButton} onPress={goToPreviousMonth}>
            <Ionicons
              name="chevron-back"
              size={20}
              color={C.interactive.active}
            />
          </Pressable>

          <Text style={s.monthTitle}>{formatMonth(currentDate)}</Text>

          <Pressable style={s.navButton} onPress={goToNextMonth}>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={C.interactive.active}
            />
          </Pressable>
        </View>

        {/* Statistics Overview */}
        <View style={s.statsSection}>
          <View style={s.statsGrid}>
            {loading ? (
              <>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={[s.statCard, { gap: 6 }]}>
                    <SkeletonBox width={40} height={28} />
                    <SkeletonBox width={52} height={12} />
                  </View>
                ))}
              </>
            ) : (
              <>
                <View style={s.statCard}>
                  <Text
                    style={[
                      s.statNumber,
                      {
                        color:
                          stats.extraHours === 0
                            ? C.text.secondary
                            : stats.extraHours > 0
                              ? C.success
                              : C.error,
                      },
                    ]}
                  >
                    {stats.extraHoursFormatted}
                  </Text>
                  <Text style={s.statLabel}>Horas Extras</Text>
                </View>

                <View style={s.statCard}>
                  <Text
                    style={[
                      s.statNumber,
                      {
                        color:
                          stats.totalShifts === 0
                            ? C.text.secondary
                            : stats.totalShifts > 0
                              ? C.success
                              : C.error,
                      },
                    ]}
                  >
                    {stats.totalShifts}
                  </Text>
                  <Text style={s.statLabel}>Plantões</Text>
                </View>
                <View style={s.statCard}>
                  <Text style={s.statNumber}>{stats.totalHours}h</Text>
                  <Text style={s.statLabel}>Horas totais</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Shift Filters */}
        <View style={s.filtersSection}>
          <Text style={s.filtersTitle}>Filtrar por período</Text>
          <View style={s.filtersRow}>
            {[
              { key: "M", label: "Manhã", count: stats.byType.M },
              { key: "T", label: "Tarde", count: stats.byType.T },
              { key: "N", label: "Noite", count: stats.byType.N },
            ].map((filter) => (
              <Pressable
                key={filter.key}
                style={[
                  s.filterChip,
                  {
                    backgroundColor: shiftFilters[filter.key]
                      ? getFilterButtonColor(filter.key, true)
                      : C.background.secondary,
                    borderColor: getFilterButtonColor(filter.key, true),
                    borderWidth: shiftFilters[filter.key] ? 0 : 1,
                  },
                ]}
                onPress={() => toggleShiftFilter(filter.key)}
              >
                <Text
                  style={[
                    s.filterChipText,
                    {
                      color: shiftFilters[filter.key]
                        ? C.background.primary
                        : C.text.secondary,
                    },
                  ]}
                >
                  {filter.label}
                </Text>
                {filter.count > 0 && (
                  <View
                    style={[
                      s.filterBadge,
                      {
                        backgroundColor: shiftFilters[filter.key]
                          ? C.background.primary + "30"
                          : getFilterButtonColor(filter.key, true) + "20",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        s.filterBadgeText,
                        {
                          color: shiftFilters[filter.key]
                            ? C.background.primary
                            : getFilterButtonColor(filter.key, true),
                        },
                      ]}
                    >
                      {filter.count}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Calendário */}
        <View style={s.calendarSection}>
          {error && !loading && !isNavigating ? (
            <View style={s.errorContainer}>
              <Ionicons name="alert-circle-outline" size={48} color={C.error} />
              <Text style={s.errorText}>Erro ao carregar dados</Text>
              <Pressable
                style={s.retryButton}
                onPress={() =>
                  loadMonthlyShifts(
                    currentDate.getMonth() + 1,
                    currentDate.getFullYear(),
                  )
                }
              >
                <Text style={s.retryButtonText}>Tentar novamente</Text>
              </Pressable>
            </View>
          ) : (
            <Calendar
              key={themeKey}
              dayComponent={loading || isNavigating ? SkeletonDay : undefined}
              current={`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`}
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
                backgroundColor: "transparent",
                calendarBackground: "transparent",
                textSectionTitleColor: C.text.secondary,
                selectedDayBackgroundColor: C.primary,
                selectedDayTextColor: C.background.primary,
                todayTextColor: C.primary,
                dayTextColor: C.text.primary,
                textDisabledColor: C.text.tertiary,
                dotColor: C.primary,
                selectedDotColor: C.background.primary,
                arrowColor: C.text.primary,
                disabledArrowColor: C.text.tertiary,
                monthTextColor: C.text.primary,
                indicatorColor: C.primary,
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
                "stylesheet.calendar.header": {
                  header: {
                    height: 10,
                    opacity: 0,
                  },
                  monthText: {
                    height: 0,
                    opacity: 0,
                  },
                  week: {
                    marginTop: 5,
                    flexDirection: "row",
                    justifyContent: "space-around",
                  },
                },
                "stylesheet.calendar.main": {
                  container: {
                    paddingLeft: 10,
                    paddingRight: 10,
                  },
                  week: {
                    marginTop: 2,
                    marginBottom: 2,
                    flexDirection: "row",
                    justifyContent: "space-around",
                  },
                },
                "stylesheet.day.basic": {
                  base: {
                    width: 42,
                    height: 42,
                    alignItems: "center",
                    justifyContent: "center",
                    marginVertical: 1,
                  },
                  text: {
                    marginTop: 2,
                    fontSize: 17,
                    fontFamily: Typography.fontFamily.regular,
                    fontWeight: Typography.fontWeight.regular,
                    color: C.text.primary,
                    backgroundColor: "transparent",
                  },
                  today: {
                    backgroundColor: "transparent",
                  },
                  todayText: {
                    color: C.primary,
                    fontWeight: Typography.fontWeight.semiBold,
                  },
                  selectedText: {
                    color: C.background.primary,
                    fontWeight: Typography.fontWeight.semiBold,
                  },
                  disabledText: {
                    color: C.text.tertiary,
                  },
                },
                "stylesheet.day.multiDot": {
                  base: {
                    width: 42,
                    height: 42,
                    alignItems: "center",
                    justifyContent: "center",
                    marginVertical: 1,
                  },
                  text: {
                    marginTop: 2,
                    fontSize: 17,
                    fontFamily: Typography.fontFamily.regular,
                    fontWeight: Typography.fontWeight.regular,
                    color: C.text.primary,
                    backgroundColor: "transparent",
                  },
                  today: {
                    backgroundColor: "transparent",
                  },
                  todayText: {
                    color: C.primary,
                    fontWeight: Typography.fontWeight.semiBold,
                  },
                  selectedText: {
                    color: C.background.primary,
                    fontWeight: Typography.fontWeight.semiBold,
                  },
                  disabledText: {
                    color: C.text.tertiary,
                  },
                  selected: {
                    backgroundColor: C.primary,
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
                    flexDirection: "row",
                    justifyContent: "center",
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

const makeStyles = (C) => ({
  container: {
    flex: 1,
    backgroundColor: C.background.secondary,
  },
  content: {
    paddingBottom: Spacing.xxxl + 60,
  },

  // Month Header — floating card
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: C.background.primary,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    ...Shadows.small,
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: Typography.fontSize.title2,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.primary,
    textTransform: 'capitalize',
  },

  // Statistics Section — card with tinted mini-cards inside
  statsSection: {
    backgroundColor: C.background.primary,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm,
    ...Shadows.small,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  statCard: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  statNumber: {
    fontSize: Typography.fontSize.title3,
    fontWeight: Typography.fontWeight.bold,
    color: C.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: Typography.fontSize.caption2,
    fontWeight: Typography.fontWeight.medium,
    color: C.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Filters Section — card
  filtersSection: {
    backgroundColor: C.background.primary,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    ...Shadows.small,
  },
  filtersTitle: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.secondary,
    marginBottom: Spacing.sm,
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
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
    minHeight: 34,
  },
  filterChipText: {
    fontSize: Typography.fontSize.footnote,
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

  // Calendar Section — card, overflow hidden clips the calendar grid to rounded corners
  calendarSection: {
    backgroundColor: C.background.primary,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    paddingBottom: Spacing.md,
    ...Shadows.small,
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
    color: C.text.secondary,
  },
  errorContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  errorText: {
    fontSize: Typography.fontSize.body,
    color: C.error,
    textAlign: 'center',
    marginVertical: Spacing.md,
    fontWeight: Typography.fontWeight.medium,
  },
  retryButton: {
    backgroundColor: C.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  retryButtonText: {
    color: C.background.primary,
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
  },
});

export default CalendarScreenPremium;
