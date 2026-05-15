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

// Função para arredondamento monetário consistente
export const roundCurrency = (value) => {
  return Math.round(value * 100) / 100;
};

/**
 * SINGLE SOURCE OF TRUTH for shift monetary value.
 *
 * Formula (one pass, no intermediate rounding):
 *   value = roundCurrency( (totalMinutes / 60) × bd.hourlyValue × bonusMult )
 *
 * Use this everywhere — BottomSheet, Reports, CSV, totals.
 * totalMinutes already includes extra/split minutes as computed by the caller.
 *
 * Examples (no fidelity unless noted):
 *   M weekday 360min + 33min extra, R$130/h, fid 25%:
 *     computeShiftValue(bd, 393) = round(393/60 × 130 × 1.25 × 100)/100 = R$1.064,38
 *   N weekend 720min − 45min, R$185/h:
 *     computeShiftValue(bd, 675) = round(675/60 × 185 × 100)/100 = R$2.081,25
 *   D carryover 420min (Monday night, R$143/h, fid 25%):
 *     computeShiftValue(bd, 420) = round(420/60 × 143 × 1.25 × 100)/100 = R$1.251,25
 *   Split N end-of-month 330min, R$185/h:
 *     computeShiftValue(bd, 330) = round(330/60 × 185 × 100)/100 = R$1.017,50
 *   Monthly total (M+N above, each fid 25%): R$1.064,38 + R$2.081,25 = R$3.145,63
 */
export const computeShiftValue = (bd, totalMinutes) => {
  // Valor base
  const baseValue = (totalMinutes / 60) * (bd.hourlyValue || 0);
  
  // Bônus de fidelização (sobre base)
  const loyaltyBonus = baseValue * ((bd.loyaltyPercentage || 0) / 100);
  
  // Bônus geral (sobre base)
  const generalBonus = baseValue * ((bd.generalBonusPercentage || 0) / 100);
  
  // Total: base + bônus individuais (não compostos)
  const totalValue = baseValue + loyaltyBonus + generalBonus;
  
  return roundCurrency(totalValue);
};

// Função avançada para calcular valor com breakdown detalhado - CORRIGIDA
export const calculateShiftValueWithBreakdown = async (shift, dateString, totalMonthlyHours = 0) => {
  try {
    const config = await getFullShiftConfig();
    
    const isNaturalWeekend = isWeekend(dateString);
    const useWeekendValue = shouldUseWeekendValue(dateString, shift.label, config.fridayNightAsWeekend);
    
    
    const period = getShiftPeriod(shift.label);
    const hours = getShiftHours(shift.label);
    const standardMinutes = hours * 60; // NOVA: base em minutos
    
    // Valor base - CORRIGIDO: usar base em minutos
    let hourlyValue;
    if (useWeekendValue) {
      hourlyValue = parseFloat(config.hourValues.weekend?.[period]) || DEFAULT_VALUES.weekend[period];
    } else {
      hourlyValue = parseFloat(config.hourValues.weekday?.[period]) || DEFAULT_VALUES.weekday[period];
    }
    
    // NOVA LÓGICA: Calcular baseado em minutos padrão
    const baseValue = (standardMinutes / 60) * hourlyValue; // Valor base sem bônus
    
    let breakdown = {
      baseValue,
      hourlyValue,
      hours,
      standardMinutes, // NOVO: adicionar minutos padrão
      weekend: useWeekendValue,
      isNaturalWeekend,
      isFridayNight: config.fridayNightAsWeekend && isFriday(dateString) && period === 'night',
      period,
      loyaltyBonus: 0,
      loyaltyPercentage: 0,
      generalBonus: 0,
      generalBonusPercentage: 0,
      finalValue: baseValue
    };

    // Aplicar bônus de fidelização — tier mais alto que o usuário qualifica por horas do mês
    if (config.loyaltyEnabled && config.loyaltyOptions) {
      const activeLoyalty = config.loyaltyOptions
        .filter(o => o.minHours <= totalMonthlyHours)
        .sort((a, b) => b.minHours - a.minHours)[0] || null;
      if (activeLoyalty) {
        breakdown.loyaltyBonus = roundCurrency((baseValue * activeLoyalty.percentage) / 100);
        breakdown.loyaltyPercentage = activeLoyalty.percentage;
        breakdown.loyaltyMinHours = activeLoyalty.minHours;
      }
    }

    // Aplicar bônus geral se habilitado - CORRIGIDO: com precisão monetária
    if (config.bonusEnabled && config.bonus && isBonusApplicable(dateString, config.bonus)) {
      const bonusPercentage = parseFloat(config.bonus.percentage) || 0;
      breakdown.generalBonus = roundCurrency((baseValue * bonusPercentage) / 100);
      breakdown.generalBonusPercentage = bonusPercentage;
     
    }

    // Valor final — usa a função canônica (mesma fórmula de BottomSheet e Reports)
    breakdown.finalValue = computeShiftValue(breakdown, standardMinutes);
    breakdown.fractionalExtraHours = config.fractionalExtraHours ?? true;


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