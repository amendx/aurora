/**
 * MonthSummaryComputer — pure function, no side effects, no async.
 *
 * Source of truth: INTEGER MINUTES throughout.
 * Never convert to decimal hours mid-calculation.
 * Final monetary values are rounded once at the end via roundCurrency().
 *
 * Usage:
 *   const summary = computeMonthSummary(userId, monthKey, daysWithShifts, timeEntries, financialConfig);
 *   await LocalCache.saveSummary(userId, monthKey, summary);
 */

import {
  isWeekend,
  isFriday,
  shouldUseWeekendValue,
  getShiftPeriod,
  roundCurrency,
  computeShiftValue,
} from './ShiftValueCalculator';
import TimeUtils from './TimeUtils';

// ── Bonus applicability ────────────────────────────────────────────────────────

/**
 * Returns true when the shift's month falls within the bonus date range.
 * bonus.startMonth / bonus.endMonth are stored as "YYYY-MM" strings in FinancialConfig,
 * but legacy configs may still store them as raw month integers (1-12).
 *
 * @param {string} shiftDate     "YYYY-MM-DD"
 * @param {{ startMonth: string|number, endMonth: string|number }} bonus
 */
const _bonusApplies = (shiftDate, bonus) => {
  if (!bonus?.startMonth || !bonus?.endMonth) return false;

  const shiftMonth = parseInt(shiftDate.slice(5, 7), 10); // 1-12

  // Support both "YYYY-MM" strings and legacy numeric month values
  const parseMonth = (v) => {
    if (typeof v === 'number') return v;
    const s = String(v);
    return s.includes('-') ? parseInt(s.slice(-2), 10) : parseInt(s, 10);
  };

  const start = parseMonth(bonus.startMonth);
  const end   = parseMonth(bonus.endMonth);
  return shiftMonth >= start && shiftMonth <= end;
};

// ── Scheduled minutes for a shift ─────────────────────────────────────────────

/**
 * Returns the integer minutes that count for THIS month for a given shift.
 * For split/carryover shifts, only the portion attributed to this month is returned.
 *
 * @param {object} shift - Internal shift object from daysWithShifts
 * @returns {number} integer minutes
 */
const _scheduledMinutesForShift = (shift) => {
  if (shift.splitHours?.minutesThisMonth != null) {
    return shift.splitHours.minutesThisMonth;
  }
  if (shift.isManual && shift.durationMinutes != null) {
    return shift.durationMinutes;
  }
  return TimeUtils.getShiftStandardMinutes(shift.label);
};

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Compute a complete MonthSummary from shifts, time entries, and financial config.
 * This function is pure: given the same inputs it always returns the same output.
 *
 * @param {number}  userId
 * @param {string}  monthKey               "YYYY-MM"
 * @param {Array}   daysWithShifts         The array ShiftsContext produces
 * @param {Object}  timeEntries            { [shiftId]: TimeEntry } — may be null/empty
 * @param {import('../models').FinancialConfig} financialConfig
 * @returns {import('../models').MonthSummary}
 */
export const computeMonthSummary = (userId, monthKey, daysWithShifts, timeEntries, financialConfig) => {
  const entries = timeEntries || {};
  const config  = financialConfig || {};

  // Accumulators — all in integer minutes or BRL cents (rounded at end)
  let totalScheduledMinutes = 0;
  let totalActualMinutes    = 0;
  let weekdayDayMinutes     = 0;
  let weekdayNightMinutes   = 0;
  let weekendDayMinutes     = 0;
  let weekendNightMinutes   = 0;
  let fridayNightMinutes    = 0;
  let shiftCount            = 0;

  // Financial accumulators (in BRL, accumulated as numbers, rounded per-shift)
  let totalGrossValue   = 0;
  let totalLoyaltyValue = 0;
  let totalBonusValue   = 0;

  // Resolve active loyalty option once (same for all shifts in the month)
  const activeLoyalty = config.loyaltyEnabled && Array.isArray(config.loyaltyOptions)
    ? config.loyaltyOptions.find(o => o.active) || null
    : null;

  for (const dayData of (daysWithShifts || [])) {
    const dateStr = dayData.date; // "YYYY-MM-DD"

    for (const shift of (dayData.shifts || [])) {
      shiftCount++;

      // ── Minutes for this month ─────────────────────────────────────────────
      const scheduledMin = _scheduledMinutesForShift(shift);
      totalScheduledMinutes += scheduledMin;

      // Actual minutes: use time entry if present, else fallback to scheduled
      const entry       = entries[shift.id];
      const actualMin   = (entry?.actualDurationMinutes != null && entry.actualDurationMinutes > 0)
        ? entry.actualDurationMinutes
        : scheduledMin;
      totalActualMinutes += actualMin;

      // ── Categorize for financial breakdown ────────────────────────────────
      const period       = getShiftPeriod(shift.label);
      const isFridayNight = config.fridayNightAsWeekend && isFriday(dateStr) && period === 'night';
      const useWeekend   = shouldUseWeekendValue(dateStr, shift.label, config.fridayNightAsWeekend);

      if (isFridayNight) {
        fridayNightMinutes += scheduledMin;
      } else if (useWeekend) {
        if (period === 'night') weekendNightMinutes += scheduledMin;
        else                    weekendDayMinutes   += scheduledMin;
      } else {
        if (period === 'night') weekdayNightMinutes += scheduledMin;
        else                    weekdayDayMinutes   += scheduledMin;
      }

      // ── Financial value ───────────────────────────────────────────────────
      const hv = config.hourValues || {};
      const rateGroup  = useWeekend ? (hv.weekend || {}) : (hv.weekday || {});
      const hourlyRate = parseFloat(rateGroup[period]) || 0;

      const loyaltyPct = activeLoyalty ? (activeLoyalty.percentage || 0) : 0;
      const bonusPct   = (config.bonusEnabled && _bonusApplies(dateStr, config.bonus))
        ? (parseFloat(config.bonus?.percentage) || 0)
        : 0;

      // computeShiftValue is the canonical formula from ShiftValueCalculator:
      //   roundCurrency( (minutes/60) × hourlyRate × (1 + loyalty% + bonus%) )
      // We pass the breakdown descriptor it expects.
      const bd = {
        hourlyValue:           hourlyRate,
        loyaltyPercentage:     loyaltyPct,
        generalBonusPercentage: bonusPct,
      };

      const baseValue    = (scheduledMin / 60) * hourlyRate;
      const loyaltyBonus = roundCurrency(baseValue * loyaltyPct   / 100);
      const genBonus     = roundCurrency(baseValue * bonusPct      / 100);

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

/**
 * Canonical "value for a month" — used by Home hero, Calendar hero, Charts bars,
 * Reports header, and any other UI showing a month total. ALL such totals MUST
 * go through this so they stay in sync; never re-implement the addition.
 *
 * @param {import('../models').MonthSummary | null | undefined} summary
 * @returns {number | null}  BRL value, or null when summary is missing
 */
export const getMonthTotalValue = (summary) => {
  if (!summary) return null;
  return (summary.totalGrossValue   || 0)
       + (summary.totalLoyaltyValue || 0)
       + (summary.totalBonusValue   || 0);
};

/**
 * Canonical "hours for a month" — scheduled minutes converted to decimal hours.
 * Same single-source-of-truth principle as getMonthTotalValue.
 *
 * @param {import('../models').MonthSummary | null | undefined} summary
 * @returns {number | null}
 */
export const getMonthTotalHours = (summary) => {
  if (!summary) return null;
  return (summary.totalScheduledMinutes || 0) / 60;
};
