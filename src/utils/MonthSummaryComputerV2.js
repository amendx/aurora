/**
 * MonthSummaryComputerV2 — same shape as MonthSummaryComputer but resolves
 * config per shift via HospitalConfigResolver so each shift's contribution
 * uses its hospital's hour values, bonus, friday-night-as-weekend rule, and
 * loyalty tier. Falls back to the global config (and current behaviour) when
 * a shift has no institution or its institution has no overrides.
 *
 * The legacy MonthSummaryComputer.js stays intact as a rollback path:
 * reverting is a single import swap in ShiftsContext.js.
 *
 * Returned shape is identical to v1 (totalGrossValue, totalLoyaltyValue,
 * totalBonusValue, totalScheduledMinutes, totalActualMinutes, shiftCount,
 * weekdayDayMinutes, …) so all consumers (getMonthTotalValue, charts, hero
 * cards, reports header) keep working unchanged.
 */

import {
  isFriday,
  shouldUseWeekendValue,
  getShiftPeriod,
  roundCurrency,
} from './ShiftValueCalculator';
import TimeUtils from './TimeUtils';
import { resolveShiftConfig, resolveLoyaltyPct } from './HospitalConfigResolver';

// Same bonus-month parser as v1 (kept private to this module so v1 stays untouched).
const _bonusApplies = (shiftDate, bonus) => {
  if (!bonus?.startMonth || !bonus?.endMonth) return false;
  const shiftMonth = parseInt(shiftDate.slice(5, 7), 10);
  const parseMonth = (v) => {
    if (typeof v === 'number') return v;
    const s = String(v);
    return s.includes('-') ? parseInt(s.slice(-2), 10) : parseInt(s, 10);
  };
  const start = parseMonth(bonus.startMonth);
  const end   = parseMonth(bonus.endMonth);
  return shiftMonth >= start && shiftMonth <= end;
};

const _scheduledMinutesForShift = (shift) => {
  if (shift.splitHours?.minutesThisMonth != null) {
    return shift.splitHours.minutesThisMonth;
  }
  if (shift.isManual && shift.durationMinutes != null) {
    return shift.durationMinutes;
  }
  return TimeUtils.getShiftStandardMinutes(shift.label);
};

/**
 * @param {number}  userId
 * @param {string}  monthKey                 "YYYY-MM"
 * @param {Array}   daysWithShifts
 * @param {Object}  timeEntries              { [shiftId]: TimeEntry } | null
 * @param {import('../models').FinancialConfig} financialConfig  global config
 * @returns {import('../models').MonthSummary}
 */
export const computeMonthSummary = (userId, monthKey, daysWithShifts, timeEntries, financialConfig) => {
  const entries = timeEntries || {};
  const config  = financialConfig || {};

  let totalScheduledMinutes = 0;
  let totalActualMinutes    = 0;
  let weekdayDayMinutes     = 0;
  let weekdayNightMinutes   = 0;
  let weekendDayMinutes     = 0;
  let weekendNightMinutes   = 0;
  let fridayNightMinutes    = 0;
  let shiftCount            = 0;

  let totalGrossValue   = 0;
  let totalLoyaltyValue = 0;
  let totalBonusValue   = 0;

  // First pass: total planned hours — needed by legacy global loyalty's
  // minHours-tier gate. Per-institution loyalty does not depend on it
  // (it uses currentInstitutionLoyalty pre-resolved by ShiftsContext).
  let totalPlannedHours = 0;
  const plannedHoursByInstitution = {};
  for (const dayData of (daysWithShifts || [])) {
    for (const shift of (dayData.shifts || [])) {
      const plannedHours = _scheduledMinutesForShift(shift) / 60;
      totalPlannedHours += plannedHours;
      const iid = shift?.group?.institution?.id ?? shift?.group?.institutionId ?? null;
      if (iid != null && String(iid).length > 0) {
        const key = String(iid);
        plannedHoursByInstitution[key] = (plannedHoursByInstitution[key] || 0) + plannedHours;
      }
    }
  }

  for (const dayData of (daysWithShifts || [])) {
    const dateStr = dayData.date;

    for (const shift of (dayData.shifts || [])) {
      shiftCount++;

      const scheduledMin = _scheduledMinutesForShift(shift);
      totalScheduledMinutes += scheduledMin;

      const entry = entries[shift.id];
      // Horas reais recortadas na virada de mês (plantão N do último dia: só a
      // parte deste mês conta; o resto é o carryover D do mês seguinte).
      const actualThisMonth = entry
        ? TimeUtils.actualMinutesThisMonth(shift, entry.actualStart, entry.actualEnd, entry.actualDurationMinutes)
        : null;
      const actualMin = (actualThisMonth != null && actualThisMonth > 0)
        ? actualThisMonth
        : scheduledMin;
      totalActualMinutes += actualMin;

      // Per-shift effective config
      const instId = shift?.group?.institution?.id ?? shift?.group?.institutionId ?? null;
      const eff = resolveShiftConfig(config, instId);

      const period       = getShiftPeriod(shift.label);
      const isFridayNight = eff.fridayNightAsWeekend && isFriday(dateStr) && period === 'night';
      const useWeekend   = shouldUseWeekendValue(dateStr, shift.label, eff.fridayNightAsWeekend, eff.treatHolidayAsWeekend);

      if (isFridayNight) {
        fridayNightMinutes += scheduledMin;
      } else if (useWeekend) {
        if (period === 'night') weekendNightMinutes += scheduledMin;
        else                    weekendDayMinutes   += scheduledMin;
      } else {
        if (period === 'night') weekdayNightMinutes += scheduledMin;
        else                    weekdayDayMinutes   += scheduledMin;
      }

      const hv = eff.hourValues || {};
      const rateGroup  = useWeekend ? (hv.weekend || {}) : (hv.weekday || {});
      const hourlyRate = parseFloat(rateGroup[period]) || 0;

      const loyaltyHours = instId != null && String(instId).length > 0
        ? (plannedHoursByInstitution[String(instId)] || 0)
        : totalPlannedHours;
      const loyaltyPct = resolveLoyaltyPct(eff, loyaltyHours);
      const bonusPct   = (eff.bonusEnabled && _bonusApplies(dateStr, eff.bonus))
        ? (parseFloat(eff.bonus?.percentage) || 0)
        : 0;

      const valueMin     = Math.max(scheduledMin, actualMin);
      const baseValue    = (valueMin / 60) * hourlyRate;
      const loyaltyBonus = roundCurrency(baseValue * loyaltyPct / 100);
      const genBonus     = roundCurrency(baseValue * bonusPct   / 100);

      totalGrossValue   += roundCurrency(baseValue);
      totalLoyaltyValue += loyaltyBonus;
      totalBonusValue   += genBonus;
    }
  }

  return {
    userId,
    monthKey,
    totalScheduledMinutes,
    totalActualMinutes,
    totalGrossValue:   roundCurrency(totalGrossValue),
    totalBonusValue:   roundCurrency(totalBonusValue),
    totalLoyaltyValue: roundCurrency(totalLoyaltyValue),
    shiftCount,
    weekdayDayMinutes,
    weekdayNightMinutes,
    weekendDayMinutes,
    weekendNightMinutes,
    fridayNightMinutes,
    configVersion:            config.version || 1,
    financialConfigSnapshot:  config,
    generatedAt:              new Date().toISOString(),
    isDirty:                  false,
  };
};
