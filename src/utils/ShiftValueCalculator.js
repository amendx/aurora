// Utilitário para cálculo de valores de plantão
import * as SecureStore from 'expo-secure-store';
import { resolveShiftConfig, resolveLoyaltyPct } from './HospitalConfigResolver';

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
/**
 * @param {object}  shift
 * @param {string}  dateString          "YYYY-MM-DD"
 * @param {number}  totalMonthlyHours   For legacy global loyalty tier resolution
 * @param {object}  [configOverride]    If passed, skip getFullShiftConfig() and use
 *                                       this object directly. Used by past-month
 *                                       recomputes so frozen bonus/loyalty values
 *                                       (from a hybrid config) flow through to the
 *                                       per-shift breakdown.
 */
export const calculateShiftValueWithBreakdown = async (shift, dateString, totalMonthlyHours = 0, configOverride = null) => {
  try {
    const config = configOverride || await getFullShiftConfig();
    // Per-hospital effective config (falls back to global per field).
    const instId = shift?.group?.institution?.id ?? shift?.group?.institutionId ?? null;
    const eff = resolveShiftConfig(config, instId);

    const isNaturalWeekend = isWeekend(dateString);
    const useWeekendValue = shouldUseWeekendValue(dateString, shift.label, eff.fridayNightAsWeekend);

    const period = getShiftPeriod(shift.label);
    const hours = getShiftHours(shift.label);
    const standardMinutes = hours * 60; // NOVA: base em minutos

    const rates = eff.hourValues || DEFAULT_VALUES;
    let hourlyValue;
    if (useWeekendValue) {
      hourlyValue = parseFloat(rates.weekend?.[period]) || DEFAULT_VALUES.weekend[period];
    } else {
      hourlyValue = parseFloat(rates.weekday?.[period]) || DEFAULT_VALUES.weekday[period];
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
      isFridayNight: eff.fridayNightAsWeekend && isFriday(dateString) && period === 'night',
      period,
      loyaltyBonus: 0,
      loyaltyPercentage: 0,
      generalBonus: 0,
      generalBonusPercentage: 0,
      configSource: eff.source, // 'institution' | 'global' — handy for debugging
      finalValue: baseValue
    };

    // Fidelização — resolver knows about per-institution + legacy global
    const loyaltyPct = resolveLoyaltyPct(eff, totalMonthlyHours);
    if (loyaltyPct > 0) {
      breakdown.loyaltyBonus = roundCurrency((baseValue * loyaltyPct) / 100);
      breakdown.loyaltyPercentage = loyaltyPct;
      // Surface tier minHours when the resolver source had one (institution auto-from-hours, or legacy tier match)
      if (eff.institutionLoyaltyCfg?.autoFromHours && eff.institutionEarnedLoyalty) {
        breakdown.loyaltyMinHours = eff.institutionEarnedLoyalty.minHours || 0;
      }
    }

    // Bônus geral — per-hospital toggle/percentage if set, else global
    if (eff.bonusEnabled && eff.bonus && isBonusApplicable(dateString, eff.bonus)) {
      const bonusPercentage = parseFloat(eff.bonus.percentage) || 0;
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

/**
 * Synchronous full breakdown — same math as calculateShiftValueWithBreakdown
 * but accepts a pre-loaded config + monthly hours, so the UI can render the
 * final value (base + loyalty + general bonus + real-hour extras) without an
 * async round-trip per card.
 *
 * @param {object} shift
 * @param {string} dateString               "YYYY-MM-DD"
 * @param {object} config                   getFullShiftConfig() result
 * @param {number} totalMonthlyHours        for loyalty tier resolution
 * @param {object} [realHoursEntry]         { startTime, endTime } for the shift, if registered
 * @returns {number}                        final value in BRL
 */
export const calculateShiftFinalValueSync = (shift, dateString, config, totalMonthlyHours = 0, realHoursEntry = null) => {
  if (!config) return calculateShiftValueSync(shift, dateString, null);

  // Per-hospital effective config (falls back to global per field).
  const instId = shift?.group?.institution?.id ?? shift?.group?.institutionId ?? null;
  const eff = resolveShiftConfig(config, instId);

  const useWeekendValue = shouldUseWeekendValue(dateString, shift.label, eff.fridayNightAsWeekend);
  const period = getShiftPeriod(shift.label);
  const standardHours = getShiftHours(shift.label);

  const rates = eff.hourValues || DEFAULT_VALUES;
  let hourlyValue;
  if (useWeekendValue) {
    hourlyValue = parseFloat(rates.weekend?.[period]) || DEFAULT_VALUES.weekend[period];
  } else {
    hourlyValue = parseFloat(rates.weekday?.[period]) || DEFAULT_VALUES.weekday[period];
  }

  // Real hours override (if user logged actual times)
  let effectiveHours = standardHours;
  if (realHoursEntry?.startTime && realHoursEntry?.endTime) {
    const [sh, sm] = realHoursEntry.startTime.split(':').map(Number);
    const [eh, em] = realHoursEntry.endTime.split(':').map(Number);
    if (![sh, sm, eh, em].some(isNaN)) {
      const start = sh * 60 + sm;
      let end = eh * 60 + em;
      if (end < start) end += 1440;
      const realMin = end - start;
      if (realMin > 0) effectiveHours = realMin / 60;
    }
  }

  const baseValue = hourlyValue * effectiveHours;

  const loyaltyPct = resolveLoyaltyPct(eff, totalMonthlyHours);
  const loyaltyBonus = (baseValue * loyaltyPct) / 100;

  let generalBonus = 0;
  if (eff.bonusEnabled && eff.bonus && isBonusApplicable(dateString, eff.bonus)) {
    const bonusPct = parseFloat(eff.bonus.percentage) || 0;
    generalBonus = (baseValue * bonusPct) / 100;
  }

  return baseValue + loyaltyBonus + generalBonus;
};