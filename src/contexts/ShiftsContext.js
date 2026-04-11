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
    lastUpdated: null
  });

  // Carregar dados dos plantões para um mês específico (APENAS MONTHLY)
  const loadMonthlyShifts = async (month, year, forceReload = false) => {
    const monthKey = `${year}-${month}`;
    
    // Evitar recarregar se já temos dados
    if (!forceReload && shiftsData.currentMonth === month && shiftsData.currentYear === year) {
      Logger.info('📋 Dados já carregados para', monthKey);
      return;
    }

    Logger.info(`🚀 CARREGAMENTO SIMPLES - APENAS MONTHLY para ${month}/${year}`);
    
    setShiftsData(prev => ({ ...prev, loading: true, error: null }));

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
            if (dailyResponse.data[0]) {
              Logger.info(`🔬 Estrutura raw do daily (${dayData.date}): ${JSON.stringify(dailyResponse.data[0])}`);
            }

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

        daysWithShifts.push({
          day,
          shiftsCount,
          shifts,
          date: dayData.date,
          originalData: dayData,
        });
      }

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
          const type = shift.label;
          realBreakdown[type].count++;
          realBreakdown[type].hours += type === 'N' ? 12 : 6; // Noturno = 12h, outros = 6h
        });
      });

      // IMPORTANTE: Separar horas previstas de horas reais
      // standardHours = sempre baseado nos plantões cadastrados (NUNCA muda)
      // realHours = horas previstas + horas extras registradas (pode variar)
      
      const standardHours = realBreakdown.M.hours + realBreakdown.T.hours + realBreakdown.N.hours;
      
      // TODO: Calcular horas extras registradas pelo usuário
      // Por enquanto, realHours = standardHours (sem extras)
      // Quando implementarmos o cálculo de extras, será: standardHours + totalExtras
      const realHours = standardHours; // Será atualizado em futuras versões

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
        lastUpdated: new Date()
      });

      Logger.info('🎉 DADOS CARREGADOS COM SUCESSO!');

    } catch (error) {
      Logger.error('❌ Erro ao carregar plantões:', error.message);
      setShiftsData(prev => ({
        ...prev,
        loading: false,
        error: error.message
      }));
    }
  };

  // Carregar dados do mês atual
  const getCurrentMonthData = () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    Logger.info(`📅 Carregando mês atual: ${month}/${year}`);
    loadMonthlyShifts(month, year);
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
      return shiftsData.currentMonth === month && 
             shiftsData.currentYear === year && 
             shiftsData.daysWithShifts.length > 0;
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