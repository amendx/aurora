/**
 * HospitalConfigResolver — single source of truth for "which config applies
 * to THIS shift?".
 *
 * The app keeps a global FinancialConfig (ConfigScreen) as a fallback /
 * rollback safety net. Each hospital may declare overrides under
 *   FinancialConfig.institutionConfig[instId] = {
 *     hourValues?, bonus?, bonusEnabled?, fridayNightAsWeekend?
 *   }
 * For loyalty, the existing institutionLoyalty[instId] +
 * currentInstitutionLoyalty[instId] slots are preserved (already per-hospital).
 *
 * Resolution is per-field: any field absent on the institution falls back to
 * the global value. If instId is null (e.g. manual shifts without a hospital),
 * everything falls back to global.
 *
 * The returned object is flat and self-contained so the value calculators
 * never have to re-derive which source a piece came from.
 */

/**
 * @param {object} globalConfig  FinancialConfig from getFullShiftConfig()
 * @param {string|number|null|undefined} instId
 * @returns {{
 *   hourValues: object,
 *   bonusEnabled: boolean,
 *   bonus: object,
 *   fridayNightAsWeekend: boolean,
 *   loyaltyEnabled: boolean,
 *   loyaltyOptions: Array,
 *   institutionLoyaltyCfg: object | null,
 *   institutionEarnedLoyalty: object | null,
 *   source: 'institution' | 'global',
 * }}
 */
export const resolveShiftConfig = (globalConfig, instId) => {
  const g = globalConfig || {};
  const key = instId != null && String(instId).length > 0 ? String(instId) : null;
  const instCfg = key ? (g.institutionConfig?.[key] || null) : null;

  const hourValues =
    (instCfg && instCfg.hourValues) || g.hourValues || null;

  const bonusEnabled =
    (instCfg && instCfg.bonusEnabled != null) ? instCfg.bonusEnabled : !!g.bonusEnabled;

  const bonus =
    (instCfg && instCfg.bonus) || g.bonus || null;

  const fridayNightAsWeekend =
    (instCfg && instCfg.fridayNightAsWeekend != null)
      ? instCfg.fridayNightAsWeekend
      : !!g.fridayNightAsWeekend;

  const treatHolidayAsWeekend =
    (instCfg && instCfg.treatHolidayAsWeekend != null)
      ? instCfg.treatHolidayAsWeekend
      : !!g.treatHolidayAsWeekend;

  return {
    hourValues,
    bonusEnabled,
    bonus,
    fridayNightAsWeekend,
    treatHolidayAsWeekend,
    loyaltyEnabled: !!g.loyaltyEnabled,
    loyaltyOptions: Array.isArray(g.loyaltyOptions) ? g.loyaltyOptions : [],
    institutionLoyaltyCfg:    key ? (g.institutionLoyalty?.[key] || null)        : null,
    institutionEarnedLoyalty: key ? (g.currentInstitutionLoyalty?.[key] || null) : null,
    source: instCfg ? 'institution' : 'global',
  };
};

/**
 * Build a "hybrid" config for past-month recomputes.
 *
 * Mental model: hour values + friday-night-as-weekend are SETTINGS (the rate
 * itself); they always reflect the current truth and are retroactive. Bonus
 * and loyalty are EARNED ADD-ONS; once a month is past, what was earned at
 * that time must not change just because the user toggled the bonus off in
 * the current month.
 *
 * The previously-saved MonthSummary always carries a `financialConfigSnapshot`
 * field — we use it as the source of truth for the frozen pieces.
 *
 * @param {object} currentConfig   Live FinancialConfig (rate-like pieces win)
 * @param {object} snapshotConfig  MonthSummary.financialConfigSnapshot from
 *                                 the prior save (bonus/loyalty pieces win)
 * @returns {object}               Hybrid config consumable by the resolver
 */
export const buildHybridConfig = (currentConfig, snapshotConfig) => {
  const cur  = currentConfig  || {};
  const snap = snapshotConfig || {};

  // Merge per-hospital overrides: rate-like fields from current, bonus from snapshot
  const allKeys = new Set([
    ...Object.keys(cur.institutionConfig  || {}),
    ...Object.keys(snap.institutionConfig || {}),
  ]);
  const mergedInstitutionConfig = {};
  allKeys.forEach(id => {
    const c = cur.institutionConfig?.[id]  || {};
    const s = snap.institutionConfig?.[id] || {};
    const entry = {};
    if (c.hourValues)                  entry.hourValues             = c.hourValues;
    if (c.fridayNightAsWeekend != null) entry.fridayNightAsWeekend  = c.fridayNightAsWeekend;
    if (c.treatHolidayAsWeekend != null) entry.treatHolidayAsWeekend = c.treatHolidayAsWeekend;
    if (s.bonus)                       entry.bonus                  = s.bonus;
    if (s.bonusEnabled != null)        entry.bonusEnabled           = s.bonusEnabled;
    if (Object.keys(entry).length) mergedInstitutionConfig[id] = entry;
  });

  return {
    // Rate-like (current wins, always retroactive)
    hourValues:           cur.hourValues,
    fridayNightAsWeekend: cur.fridayNightAsWeekend,
    treatHolidayAsWeekend: cur.treatHolidayAsWeekend,
    // Earned add-ons (snapshot wins, frozen at month of earning)
    bonusEnabled:             snap.bonusEnabled,
    bonus:                    snap.bonus,
    loyaltyEnabled:           snap.loyaltyEnabled,
    loyaltyOptions:           snap.loyaltyOptions,
    institutionLoyalty:       snap.institutionLoyalty,
    currentInstitutionLoyalty: snap.currentInstitutionLoyalty,
    // Per-hospital map merged per the rules above
    institutionConfig: mergedInstitutionConfig,
    // Carry through anything else (version, userId, etc.)
    version:       cur.version,
    userId:        cur.userId,
    updatedAt:     cur.updatedAt,
    effectiveFrom: cur.effectiveFrom,
    _hybrid: true,
  };
};

/**
 * Decide whether a monthKey ("YYYY-MM") is strictly before the current month.
 * Past months use the hybrid (frozen-bonus) config; current and future months
 * use the live config so the user can still tweak the bonus that's about to
 * earn.
 */
export const isPastMonthKey = (monthKey, now = new Date()) => {
  if (!monthKey) return false;
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return monthKey < curKey;
};

/**
 * Resolve the loyalty percentage for a shift given its effective config and
 * the user's total monthly hours (legacy global tiers gate on minHours).
 * Returns 0 when no rule matches. Pure function.
 *
 * @param {ReturnType<typeof resolveShiftConfig>} eff
 * @param {number} totalMonthlyHours
 * @returns {number}  percentage, e.g. 25 for 25%
 */
export const resolveLoyaltyPct = (eff, totalMonthlyHours = 0) => {
  if (!eff) return 0;
  if (eff.institutionLoyaltyCfg) {
    const cfg = eff.institutionLoyaltyCfg;
    if (cfg.autoFromHours) {
      if (eff.institutionEarnedLoyalty) {
        return eff.institutionEarnedLoyalty.percentage || 0;
      }
      const tier = (cfg.loyaltyOptions || [])
        .filter(o => o.minHours <= totalMonthlyHours)
        .sort((a, b) => b.minHours - a.minHours)[0];
      return tier?.percentage || 0;
    }
    return cfg.manualPercentage || 0;
  }
  if (eff.loyaltyEnabled && eff.loyaltyOptions.length) {
    const tier = eff.loyaltyOptions
      .filter(o => o.minHours <= totalMonthlyHours)
      .sort((a, b) => b.minHours - a.minHours)[0];
    return tier?.percentage || 0;
  }
  return 0;
};
