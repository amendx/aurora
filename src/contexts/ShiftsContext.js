                    import React, { createContext, useContext, useState, useEffect } from 'react';
import SoffiaApiService from '../services/SoffiaApiService';
import Logger from '../utils/Logger';
import { AuthContext } from '../context/AuthContext';

// Context para gerenciar dados dos plantões globalmente (APENAS MONTHLY)
const ShiftsContext = createContext({});

export const ShiftsProvider = ({ children }) => {
  const { token } = useContext(AuthContext);
  
  // Estado global dos plantões
  const [shiftsData, setShiftsData] = useState({
    currentMonth: null,
    currentYear: null,
    monthlyCalendar: null,
    daysWithShifts: [],
    totalShifts: 0,
    loading: false,
    error: null,
    lastUpdated: null,
    loadedFor: null, // "YYYY-M" — tracks which month was fully loaded (even if 0 shifts)
  });

  // Helper: parse "19h00 - 07h00 (N)" and return split info for month-boundary night shifts
  const computeSplitHours = (timeStr) => {
    if (!timeStr) return null;
    
    let parts = timeStr.split(' – ');
    if (parts.length !== 2) parts = timeStr.split(' - ');
    if (parts.length !== 2) return null;

    const normalize = (t) => t.replace('h', ':').replace(/\s*\([^)]*\)/, '').trim();
    const [sh, sm] = normalize(parts[0]).split(':').map(Number);
    const [eh, em] = normalize(parts[1]).split(':').map(Number);
    if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null;

    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    
    if (endMin >= startMin) return null; // doesn't cross midnight

    const minutesThisMonth = 24 * 60 - startMin;
    const minutesNextMonth = endMin;
    return {
      minutesThisMonth,
      minutesNextMonth,
      hoursThisMonth: +(minutesThisMonth / 60).toFixed(2),
      hoursNextMonth: +(minutesNextMonth / 60).toFixed(2),
    };
  };

  // Carregar dados dos plantões para um mês específico (APENAS MONTHLY)
  const loadMonthlyShifts = async (month, year, forceReload = false) => {
    const monthKey = `${year}-${month}`;

    // Evitar recarregar se já temos dados para este mês
    if (!forceReload && shiftsData.loadedFor === monthKey) {
      Logger.info('📋 Dados já carregados para', monthKey);
      return;
    }

    // Evitar recarregar se já está carregando o mesmo mês
    if (shiftsData.loading && shiftsData.currentMonth === month && shiftsData.currentYear === year) {
      Logger.info('📋 Carregamento já em progresso para', monthKey);
      return;
    }

    Logger.info(`🚀 CARREGAMENTO SIMPLES - APENAS MONTHLY para ${month}/${year}`);

    // Limpar dados do mês anterior imediatamente para evitar UI stale
    const switchingMonth = shiftsData.currentMonth !== month || shiftsData.currentYear !== year;
    setShiftsData(prev => ({
      ...prev,
      loading: true,
      error: null,
      daysWithShifts: switchingMonth ? [] : prev.daysWithShifts,
      loadedFor: switchingMonth ? null : prev.loadedFor,
    }));

    try {
      Logger.info(`📅 Chamando endpoint monthly: ${month}/${year}`);
      
      // PASSO 1: Buscar apenas o calendário mensal
      const monthlyResponse = await SoffiaApiService.getMonthlyCalendar(token, month, year);
      
      if (!monthlyResponse.success) {
        throw new Error(monthlyResponse.error || 'Erro ao carregar calendário');
      }

      const monthlyData = monthlyResponse.data;
      Logger.info('📦 Dados do monthly recebidos');
      // Logger.info('🔍 Estrutura:', JSON.stringify(monthlyData, null, 2));

      // PASSO 2: Processar os dados do monthly (estrutura correta)
      if (!monthlyData.data || !monthlyData.data.current || !monthlyData.data.current.days) {
        throw new Error('Estrutura de dados do monthly inválida');
      }

      const currentMonthDays = monthlyData.data.current.days;
      Logger.info(`📊 ${currentMonthDays.length} dias encontrados no monthly`);

      // PASSO 3: Buscar detalhes diários para cada dia com plantões
      const isMock = SoffiaApiService.isMockToken(token);
      const daysWithShifts = [];

      for (const dayData of currentMonthDays) {
        const day = parseInt(dayData.date.split('-')[2]);
        const shiftsCount = dayData.shifts ? dayData.shifts.length : 0;

        let shifts = [];

        if (isMock) {
          // Token local → usar dados mockados detalhados
          const { MOCK_DETAILED_SHIFTS } = require('../mocks/MockDataReal');
          const dayDetailedData = MOCK_DETAILED_SHIFTS[dayData.date];
          if (dayDetailedData && dayDetailedData.data.items) {
            shifts = dayDetailedData.data.items.map(shiftData => ({
              id: shiftData.id,
              label: shiftData.label,
              time: shiftData.time,
              date: dayData.date,
              group: shiftData.group,
              originalData: shiftData,
            }));
          } else {
            shifts = (dayData.shifts || []).map(shiftId => ({
              id: shiftId,
              label: 'M',
              time: '07h00 - 13h00 (M)',
              date: dayData.date,
              group: { name: 'Grupo Padrão' },
            }));
          }
        } else {
          // Token real → chamar endpoint diário para detalhes
          const dateObj = new Date(dayData.date + 'T12:00:00.000Z');
          const dailyResponse = await SoffiaApiService.getDailyShifts(token, dateObj);

          if (dailyResponse.success && dailyResponse.data && dailyResponse.data.length > 0) {
            // Log do primeiro item para diagnóstico de estrutura da API real
            // if (dailyResponse.data[0]) {
            //   Logger.info(`🔬 Estrutura raw do daily (${dayData.date}): ${JSON.stringify(dailyResponse.data[0])}`);
            // }

            shifts = dailyResponse.data.map(shiftData => {
              // Detectar label com precedência correta — sem bug de ternário
              const detectLabel = () => {
                if (shiftData.label) return shiftData.label;
                if (shiftData.shift_type) return shiftData.shift_type;
                if (shiftData.type) return shiftData.type;
                const t = (shiftData.time || shiftData.schedule || shiftData.hours || '');
                // Noturno: começa >= 18h ou 19h
                if (/1[89][:h]/.test(t) || /2[0-3][:h]/.test(t)) return 'N';
                // Tarde: começa >= 13h
                if (/1[3-7][:h]/.test(t)) return 'T';
                return 'M';
              };
              const label = detectLabel();

              return {
                id: shiftData.id,
                label: typeof label === 'string' ? label : 'M',
                time: shiftData.time || shiftData.schedule || shiftData.hours || '',
                date: dayData.date,
                group: shiftData.group || { name: shiftData.group_name || 'Sem grupo' },
                originalData: shiftData,
              };
            });

            Logger.info(`📋 ${dayData.date}: ${shifts.length} plantão(s) da API`);
            shifts.forEach((s, i) =>
              Logger.info(`   ${i + 1}. [${s.label}] ${s.time} — ${s.group?.name || ''}`)
            );
          } else {
            // API não retornou detalhes → montar placeholder com IDs do monthly
            shifts = (dayData.shifts || []).map(shiftId => ({
              id: shiftId,
              label: 'M',
              time: '',
              date: dayData.date,
              group: { name: '' },
            }));
            Logger.warn(`⚠️ ${dayData.date}: sem detalhes da API daily (${shiftsCount} IDs do monthly)`);
          }
        }

        // Detect month-boundary split for night shifts on the last day of the month
        const lastDayOfMonth = new Date(year, month, 0).getDate();
        if (day === lastDayOfMonth) {
          shifts = shifts.map(shift => {
            if (shift.label?.charAt(0) !== 'N') return shift;
            const split = computeSplitHours(shift.time);
            if (!split) return shift;
            Logger.info(`🌙 Split shift detected on day ${day}: ${split.hoursThisMonth}h this month, ${split.hoursNextMonth}h next month`);
            return { ...shift, splitHours: split };
          });
        }

        daysWithShifts.push({
          day,
          shiftsCount,
          shifts,
          date: dayData.date,
          originalData: dayData,
        });
      }

      // ── Day-1 carryover: inject derived shift from previous month's last night ──
      // Check the API monthly response for "previous" month's last day
      const prevDays = monthlyData.data?.previous?.days;
      
      if (prevDays && Array.isArray(prevDays)) {
        // Get the actual last day of the previous month (not just the last day with shifts)
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const lastDayOfPrevMonth = new Date(prevYear, prevMonth, 0).getDate(); // Day 0 = last day of previous month
        const expectedLastDay = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDayOfPrevMonth).padStart(2, '0')}`;
        
        // Only look for carryover if the actual last day of the month has shifts
        const prevLastDay = prevDays.find(d => d.date === expectedLastDay);

        if (prevLastDay) {
          // Try to get the actual shift detail for that day from the API
          let prevNightShifts = [];

          if (isMock) {
            const { MOCK_DETAILED_SHIFTS } = require('../mocks/MockDataReal');
            const prevDetail = MOCK_DETAILED_SHIFTS[prevLastDay.date];
            if (prevDetail?.data?.items) {
              prevNightShifts = prevDetail.data.items
                .filter(s => s.label?.charAt(0) === 'N')
                .map(s => ({ ...s, date: prevLastDay.date }));
            }
          } else {
            Logger.info(`🔍 CARRYOVER: Fetching daily shifts for ${prevLastDay.date}`);
            const dateObj = new Date(prevLastDay.date + 'T12:00:00.000Z');
            const resp = await SoffiaApiService.getDailyShifts(token, dateObj);
            Logger.info(`🔍 CARRYOVER: Daily API response: ${resp.success ? 'success' : 'failed'}, ${resp.data?.length || 0} shifts`);
            
            if (resp.success && resp.data) {
              const allShifts = resp.data;
              Logger.info(`🔍 CARRYOVER: All shifts on ${prevLastDay.date}: ${allShifts.map(s => `[${s.label}] ${s.time}`).join(', ')}`);
              
              prevNightShifts = resp.data
                .filter(s => (s.label || '').charAt(0) === 'N')
                .map(s => ({ ...s, date: prevLastDay.date }));
            }
          }
          
          for (const prevShift of prevNightShifts) {
            
            const split = computeSplitHours(prevShift.time || prevShift.schedule || '');
            
            if (!split) {
              continue;
            }

            // Build the carryover end time string, e.g. "00h00 - 07h00"
            const normalize = (t) => t.replace('h', ':').replace(/\s*\([^)]*\)/, '').trim();
            let parts = (prevShift.time || '').split(' – ');
            if (parts.length !== 2) parts = (prevShift.time || '').split(' - ');
            const endTimeRaw = parts.length === 2 ? normalize(parts[1]) : null;
            const carryoverTime = endTimeRaw
              ? `00h00 - ${endTimeRaw.replace(':', 'h').replace(/^(\d):/, '0$1:')}`
              : `00h00 - ${String(Math.floor(split.minutesNextMonth / 60)).padStart(2,'0')}h${String(split.minutesNextMonth % 60).padStart(2,'0')}`;

            const derivedShift = {
              id: `carry_${prevShift.id || prevLastDay.date}`,
              label: 'D', // D = Divided (carryover)
              time: carryoverTime,
              date: `${year}-${String(month).padStart(2, '0')}-01`,
              group: prevShift.group || { name: prevShift.group_name || 'Sem grupo' },
              carryover: true, // marks this as a derived carryover shift
              splitHours: {
                minutesThisMonth: split.minutesNextMonth,
                minutesNextMonth: 0,
                hoursThisMonth: split.hoursNextMonth,
                hoursNextMonth: 0,
              },
              originalLabel: 'N',
              originalTime: prevShift.time,
            };

            // Inject into day 1 if it exists, otherwise create a day-1 entry
            const day1Idx = daysWithShifts.findIndex(d => d.day === 1);
            if (day1Idx >= 0) {
              daysWithShifts[day1Idx] = {
                ...daysWithShifts[day1Idx],
                shifts: [derivedShift, ...daysWithShifts[day1Idx].shifts],
                shiftsCount: daysWithShifts[day1Idx].shiftsCount + 1,
              };
            } else {
              const day1Date = `${year}-${String(month).padStart(2, '0')}-01`;
              daysWithShifts.unshift({
                day: 1,
                shiftsCount: 1,
                shifts: [derivedShift],
                date: day1Date,
                originalData: null,
              });
            }

            Logger.info(`🌙 Carryover shift injected on ${year}-${String(month).padStart(2,'0')}-01: ${split.hoursNextMonth}h (${carryoverTime})`);
          }
        } else {
          Logger.info(`🔍 CARRYOVER: No prevLastDay found in previous month data`);
        }
      } else {
        Logger.info(`🔍 CARRYOVER: No previous month data available`);
      }
      // ────────────────────────────────────────────────────────────────────────

      // Log resumo de todos os plantões do mês
      Logger.info(`\n📅 ===== PLANTÕES DE ${month}/${year} =====`);
      daysWithShifts.forEach(d => {
        if (d.shifts.length > 0) {
          Logger.info(`  ${d.date} (${d.shifts.length}): ${d.shifts.map(s => `[${s.label}] ${s.time}`).join(' | ')}`);
        }
      });
      Logger.info(`📅 =======================================\n`);

      const totalShifts = daysWithShifts.reduce((sum, day) => sum + day.shiftsCount, 0);
      // PASSO 4: Calcular estatísticas REAIS baseadas nos turnos da API
      const realBreakdown = { M: { count: 0, hours: 0 }, T: { count: 0, hours: 0 }, N: { count: 0, hours: 0 } };
      
      daysWithShifts.forEach(day => {
        day.shifts.forEach(shift => {
          // Carryover 'D' shifts count as 'N' for stats purposes
          const type = shift.carryover ? 'N' : (shift.label?.charAt(0) || shift.label || 'M');
          if (!realBreakdown[type]) realBreakdown[type] = { count: 0, hours: 0 };
          realBreakdown[type].count++;
          
          // Use split hours when available (both end-of-month and carryover shifts)
          let hours = 0;
          if (shift.splitHours) {
            hours = shift.splitHours.hoursThisMonth;
            Logger.info(`🔍 Split shift found: ${shift.label} - ${hours}h (from split)`);
          } else {
            hours = type === 'N' ? 12 : 6;
            Logger.info(`🔍 Regular shift found: ${shift.label} - ${hours}h (standard)`);
          }
          
          realBreakdown[type].hours += hours;
        });
      });

      // IMPORTANTE: Separar horas previstas de horas reais
      // standardHours = sempre baseado nos plantões cadastrados (NUNCA muda)
      // realHours = horas previstas + horas extras registradas (pode variar)
      
      const standardHours = realBreakdown.M.hours + realBreakdown.T.hours + realBreakdown.N.hours;
      
      // Calcular horas extras registradas pelo usuário
      let totalExtras = 0;
      try {
        for (const dayData of daysWithShifts) {
          for (const shift of dayData.shifts) {
            const dateStr = dayData.date;
            const shiftId = shift.id;
            
            // Tentar carregar horas reais salvas para este plantão específico
            const realHoursKey = `real_hours_${dateStr}_${shiftId}`;
            const savedRealHours = await StorageService.getItem(realHoursKey);
            
            if (savedRealHours) {
              try {
                const realHoursData = JSON.parse(savedRealHours);
                if (realHoursData && realHoursData.realHours) {
                  // Calcular horas previstas para este plantão
                  const shiftLabel = shift.label?.charAt(0);
                  const plannedHours = shiftLabel === 'N' ? 12 : 6;
                  
                  // Calcular diferença (horas extras)
                  const extraHours = realHoursData.realHours - plannedHours;
                  if (extraHours > 0) {
                    totalExtras += extraHours;
                  }
                }
              } catch (parseError) {
                Logger.warn(`Erro ao parsear horas reais para ${realHoursKey}:`, parseError);
              }
            }
          }
        }
      } catch (error) {
        Logger.warn('Erro ao calcular horas extras:', error);
      }
      
      const realHours = standardHours + totalExtras;

      const hoursReport = {
        totalShifts,
        standardHours, // Horas previstas (fixas)
        realHours, // Horas reais (previstas + extras)
        breakdown: realBreakdown
      };

      Logger.info(`✅ RESULTADO FINAL: ${totalShifts} plantões em ${daysWithShifts.length} dias`);
      Logger.info(`🕐 Total de horas: ${hoursReport.standardHours}h`);

      // Debug detalhado das horas para HomeScreen
      Logger.info('🏠 📊 DEBUG HORAS PARA HOME:');
      Logger.info(`🏠 📈 realHours: ${hoursReport.realHours}h`);
      Logger.info(`🏠 📈 standardHours: ${hoursReport.standardHours}h`);
      Logger.info(`🏠 📈 breakdown M: ${realBreakdown.M.count} turnos, ${realBreakdown.M.hours}h`);
      Logger.info(`🏠 📈 breakdown T: ${realBreakdown.T.count} turnos, ${realBreakdown.T.hours}h`);
      Logger.info(`🏠 📈 breakdown N: ${realBreakdown.N.count} turnos, ${realBreakdown.N.hours}h`);

      // PASSO 5: Atualizar estado global
      setShiftsData({
        currentMonth: month,
        currentYear: year,
        monthlyCalendar: monthlyData,
        daysWithShifts,
        totalShifts,
        hoursReport,
        loading: false,
        error: null,
        lastUpdated: new Date(),
        loadedFor: `${year}-${month}`,
      });

      Logger.info('🎉 DADOS CARREGADOS COM SUCESSO!');

    } catch (error) {
      Logger.error('❌ Erro ao carregar plantões:', error.message);
      setShiftsData(prev => ({
        ...prev,
        loading: false,
        error: error.message,
        loadedFor: `${year}-${month}`, // prevent retry loop on error
      }));
    }
  };

  // Carregar dados do mês atual — respeita cache
  const getCurrentMonthData = (forceReload = false) => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    Logger.info(`📅 Carregando mês atual: ${month}/${year}`);
    loadMonthlyShifts(month, year, forceReload);
  };

  // Limpar dados
  const clearShiftsData = () => {
    setShiftsData({
      currentMonth: null,
      currentYear: null,
      monthlyCalendar: null,
      daysWithShifts: [],
      totalShifts: 0,
      hoursReport: null,
      loading: false,
      error: null,
      lastUpdated: null
    });
  };

  // Auto-carregar dados do mês atual quando o token estiver disponível
  useEffect(() => {
    if (token && !shiftsData.loading && !shiftsData.daysWithShifts.length) {
      Logger.info('🔄 Token disponível, carregando dados do mês atual...');
      getCurrentMonthData();
    }
  }, [token]);

  const contextValue = {
    // Dados
    ...shiftsData,
    
    // Métodos
    loadMonthlyShifts,
    getCurrentMonthData,
    clearShiftsData,
    
    // Estados derivados úteis
    isCurrentMonth: (month, year) => {
      const now = new Date();
      return month === (now.getMonth() + 1) && year === now.getFullYear();
    },
    
    hasDataFor: (month, year) => {
      return shiftsData.loadedFor === `${year}-${month}`;
    }
  };

  return (
    <ShiftsContext.Provider value={contextValue}>
      {children}
    </ShiftsContext.Provider>
  );
};

// Hook para usar o contexto
export const useShifts = () => {
  const context = useContext(ShiftsContext);
  if (!context) {
    throw new Error('useShifts deve ser usado dentro do ShiftsProvider');
  }
  return context;
};

export default ShiftsContext;