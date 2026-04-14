// Utilitário para cálculo de valores de plantão
import * as SecureStore from 'expo-secure-store';

// Configurações padrão (caso não haja configuração salva)
const DEFAULT_VALUES = {
  weekday: { day: 130, night: 143 },
  weekend: { day: 170, night: 185 },
};

const CONFIG_KEY = 'shift_configurations';

// Função para obter configurações completas salvas
export const getFullShiftConfig = async () => {
  try {
    const savedConfig = await SecureStore.getItemAsync(CONFIG_KEY);
    if (savedConfig) {
      return JSON.parse(savedConfig);
    }
    return {
      hourValues: DEFAULT_VALUES,
      loyaltyEnabled: false,
      loyaltyOptions: [],
      bonusEnabled: false,
      bonus: { percentage: 0, startMonth: 1, endMonth: 12 }
    };
  } catch (error) {
    console.warn('Erro ao carregar configurações completas:', error);
    return {
      hourValues: DEFAULT_VALUES,
      loyaltyEnabled: false,
      loyaltyOptions: [],
      bonusEnabled: false,
      bonus: { percentage: 0, startMonth: 1, endMonth: 12 },
      fridayNightAsWeekend: false
    };
  }
};

// Função para obter configurações salvas
export const getShiftValues = async () => {
  try {
    const savedValues = await SecureStore.getItemAsync(CONFIG_KEY);
    if (savedValues) {
      const parsed = JSON.parse(savedValues);
      return parsed.hourValues || DEFAULT_VALUES;
    }
    return DEFAULT_VALUES;
  } catch (error) {
    console.warn('Erro ao carregar configurações de valores:', error);
    return DEFAULT_VALUES;
  }
};

// Função para determinar se uma data é fim de semana
export const isWeekend = (dateString) => {
  // Criar data no meio-dia UTC para evitar problemas de timezone
  const [year, month, day] = dateString.split('-');
  const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0));
  const dayOfWeek = date.getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Domingo, 6 = Sábado
};

// Função para determinar se é sexta-feira
export const isFriday = (dateString) => {
  // Criar data no meio-dia UTC para evitar problemas de timezone
  const [year, month, day] = dateString.split('-');
  const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0));
  const dayOfWeek = date.getUTCDay();
  return dayOfWeek === 5; // 5 = Sexta-feira
};

// Função para verificar se deve usar valor de fim de semana (incluindo sexta N se configurado)
export const shouldUseWeekendValue = (dateString, shiftLabel, fridayNightAsWeekend = false) => {
  const isWeekendDay = isWeekend(dateString);
  
  // Se é fim de semana natural, sempre usar valor de FDS
  if (isWeekendDay) {
    return true;
  }
  
  // Se é sexta-feira e o turno é noturno (N) e a opção está ativada
  if (fridayNightAsWeekend && isFriday(dateString)) {
    const period = getShiftPeriod(shiftLabel);
    return period === 'night';
  }
  
  return false;
};

// Função para determinar o período do plantão baseado no label
export const getShiftPeriod = (shiftLabel) => {
  if (!shiftLabel) return 'day'; // padrão

  const type = shiftLabel.charAt(0).toUpperCase();
  return (type === 'N' || type === 'D') ? 'night' : 'day'; // N/D = noite, M/T = dia
};

// Função para calcular horas do plantão baseado no tipo
export const getShiftHours = (shiftLabel) => {
  if (!shiftLabel) return 6; // padrão

  const type = shiftLabel.charAt(0).toUpperCase();
  return (type === 'N' || type === 'D') ? 12 : 6; // N/D = 12h, Manhã/Tarde = 6h
};

// Função para verificar se bônus é aplicável baseado no mês
export const isBonusApplicable = (dateString, bonusConfig) => {
  if (!bonusConfig || !bonusConfig.startMonth || !bonusConfig.endMonth) {
    return false;
  }
  
  const date = new Date(dateString);
  const month = date.getMonth() + 1; // getMonth() retorna 0-11
  
  return month >= bonusConfig.startMonth && month <= bonusConfig.endMonth;
};

// Função avançada para calcular valor com breakdown detalhado
export const calculateShiftValueWithBreakdown = async (shift, dateString, totalMonthlyHours = 0) => {
  try {
    const config = await getFullShiftConfig();
    console.log('🔧 Config carregada no breakdown:', {
      loyaltyEnabled: config.loyaltyEnabled,
      bonusEnabled: config.bonusEnabled,
      fridayNightAsWeekend: config.fridayNightAsWeekend,
      loyaltyOptions: config.loyaltyOptions?.map(opt => ({ minHours: opt.minHours, percentage: opt.percentage, active: opt.active }))
    });
    
    const isNaturalWeekend = isWeekend(dateString);
    const useWeekendValue = shouldUseWeekendValue(dateString, shift.label, config.fridayNightAsWeekend);
    
    console.log('📅 Análise da data:', {
      date: dateString,
      isNaturalWeekend,
      useWeekendValue,
      shiftLabel: shift.label,
      fridayNightAsWeekend: config.fridayNightAsWeekend
    });
    
    const period = getShiftPeriod(shift.label);
    const hours = getShiftHours(shift.label);
    
    // Valor base
    let hourlyValue;
    if (useWeekendValue) {
      hourlyValue = parseFloat(config.hourValues.weekend?.[period]) || DEFAULT_VALUES.weekend[period];
    } else {
      hourlyValue = parseFloat(config.hourValues.weekday?.[period]) || DEFAULT_VALUES.weekday[period];
    }
    
    const baseValue = hourlyValue * hours;
    let breakdown = {
      baseValue,
      hourlyValue,
      hours,
      weekend: useWeekendValue,
      isNaturalWeekend,
      isFridayNight: config.fridayNightAsWeekend && isFriday(dateString) && period === 'night',
      period,
      loyaltyBonus: 0,
      generalBonus: 0,
      finalValue: baseValue
    };

    // Aplicar bônus de fidelização se habilitado (sempre aplicar quando ativo - previsão)
    if (config.loyaltyEnabled && config.loyaltyOptions) {
      const activeLoyalty = config.loyaltyOptions.find(option => option.active);
      if (activeLoyalty) {
        breakdown.loyaltyBonus = (baseValue * activeLoyalty.percentage) / 100;
        breakdown.loyaltyPercentage = activeLoyalty.percentage;
        breakdown.loyaltyMinHours = activeLoyalty.minHours;
        console.log('💎 Fidelização aplicada (previsão):', {
          percentage: activeLoyalty.percentage,
          bonus: breakdown.loyaltyBonus,
          minHours: activeLoyalty.minHours
        });
      } else {
        console.log('❌ Nenhuma fidelização ativa configurada');
      }
    }

    // Aplicar bônus geral se habilitado e aplicável
    if (config.bonusEnabled && config.bonus && isBonusApplicable(dateString, config.bonus)) {
      const bonusPercentage = parseFloat(config.bonus.percentage) || 0;
      breakdown.generalBonus = (baseValue * bonusPercentage) / 100;
      breakdown.generalBonusPercentage = bonusPercentage;
      console.log('🎁 Bônus geral aplicado:', {
        percentage: bonusPercentage,
        bonus: breakdown.generalBonus
      });
    }

    // Valor final
    breakdown.finalValue = baseValue + breakdown.loyaltyBonus + breakdown.generalBonus;
    
    console.log('💰 Breakdown final:', breakdown);
    return breakdown;
  } catch (error) {
    console.warn('Erro ao calcular breakdown do plantão:', error);
    const fallbackIsWeekend = isWeekend(dateString);
    const fallbackHourly = fallbackIsWeekend ? 150 : 130;
    const fallbackHours = getShiftHours(shift.label);
    const fallbackValue = fallbackHourly * fallbackHours;
    const fallbackPeriod = getShiftPeriod(shift.label);
    
    return {
      baseValue: fallbackValue,
      hourlyValue: fallbackHourly,
      hours: fallbackHours,
      weekend: fallbackIsWeekend,
      isNaturalWeekend: fallbackIsWeekend,
      isFridayNight: isFriday(dateString) && fallbackPeriod === 'night',
      period: fallbackPeriod,
      loyaltyBonus: 0,
      loyaltyPercentage: 0,
      generalBonus: 0,
      generalBonusPercentage: 0,
      finalValue: fallbackValue
    };
  }
};

// Função principal para calcular valor do plantão (simples)
export const calculateShiftValue = async (shift, dateString) => {
  try {
    const config = await getFullShiftConfig();
    const useWeekendValue = shouldUseWeekendValue(dateString, shift.label, config.fridayNightAsWeekend);
    const period = getShiftPeriod(shift.label);
    const hours = getShiftHours(shift.label);
    
    // Selecionar valor base correto
    let hourlyValue;
    if (useWeekendValue) {
      hourlyValue = parseFloat(config.hourValues.weekend[period]) || DEFAULT_VALUES.weekend[period];
    } else {
      hourlyValue = parseFloat(config.hourValues.weekday[period]) || DEFAULT_VALUES.weekday[period];
    }
    
    // Calcular valor total
    const totalValue = hourlyValue * hours;
    
    return totalValue;
  } catch (error) {
    console.warn('Erro ao calcular valor do plantão:', error);
    // Valor de fallback
    const fallbackHourly = isWeekend(dateString) ? 150 : 130;
    const fallbackHours = getShiftHours(shift.label);
    return fallbackHourly * fallbackHours;
  }
};

// Função síncrona para usar com valores já carregados
export const calculateShiftValueSync = (shift, dateString, savedValues = null) => {
  const values = savedValues || DEFAULT_VALUES;
  const weekend = isWeekend(dateString);
  const period = getShiftPeriod(shift.label);
  const hours = getShiftHours(shift.label);
  
  // Selecionar valor base correto - corrigir conversão de string para número
  let hourlyValue;
  if (weekend) {
    hourlyValue = parseFloat(values.weekend?.[period]) || DEFAULT_VALUES.weekend[period];
  } else {
    hourlyValue = parseFloat(values.weekday?.[period]) || DEFAULT_VALUES.weekday[period];
  }
  
  // Calcular valor total
  const totalValue = hourlyValue * hours;
  
  return totalValue;
};