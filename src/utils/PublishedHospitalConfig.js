/**
 * PublishedHospitalConfig — overlays a hospital's manager-published config
 * (institutions/{id}.config, authored on the web) onto the user's
 * FinancialConfig as the per-hospital SOURCE OF TRUTH.
 *
 * The web HospitalConfig mirrors the app's per-hospital shape exactly, so each
 * published config drops straight into institutionConfig[instId] (rates / bonus /
 * friday-night) and institutionLoyalty[instId] (loyalty). Published WINS over
 * the user's personal per-hospital override — the personal override survives
 * only for hospitals with NO published config (and powers the estimate screen).
 *
 * Downstream stays pure: HospitalConfigResolver.resolveShiftConfig keeps reading
 * institutionConfig / institutionLoyalty exactly as before.
 */
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';

/** Unique, non-empty institution ids appearing in a month's daysWithShifts. */
export const collectInstIds = (daysWithShifts) => {
  const set = new Set();
  (daysWithShifts || []).forEach((day) => {
    (day?.shifts || []).forEach((shift) => {
      const id = shift?.group?.institution?.id ?? shift?.group?.institutionId ?? null;
      if (id != null && String(id).length > 0) set.add(String(id));
    });
  });
  return [...set];
};

/** Maps a web HospitalConfig → the app's institutionConfig[instId] entry. */
const toInstitutionConfig = (hc) => ({
  hourValues: hc.hourValues,
  bonusEnabled: !!hc.bonusEnabled,
  bonus: hc.bonus,
  fridayNightAsWeekend: !!hc.fridayNightAsWeekend,
});

/** Maps a web HospitalConfig.loyalty → the app's institutionLoyalty[instId] entry. */
const toInstitutionLoyalty = (hc) =>
  hc.loyalty
    ? {
        autoFromHours: hc.loyalty.autoFromHours,
        loyaltyOptions: hc.loyalty.loyaltyOptions,
        manualPercentage: hc.loyalty.manualPercentage,
      }
    : null;

/**
 * Returns `config` with the published hospital configs for `instIds` overlaid.
 * Published configs WIN over the user's personal per-hospital overrides.
 *
 * @param {object} config     the user's FinancialConfig
 * @param {string[]} instIds  hospitals present this month
 * @returns {Promise<object>} effective config (new object; original untouched)
 */
export const applyPublishedHospitalConfigs = async (config, instIds) => {
  const base = config || {};
  if (!Array.isArray(instIds) || instIds.length === 0) return base;

  const publishedById = await FirebaseAdapter.getHospitalConfigs(instIds);
  const ids = publishedById ? Object.keys(publishedById) : [];
  if (ids.length === 0) return base;

  const institutionConfig = { ...(base.institutionConfig || {}) };
  const institutionLoyalty = { ...(base.institutionLoyalty || {}) };
  ids.forEach((id) => {
    const hc = publishedById[id];
    if (!hc) return;
    if (hc.hourValues) institutionConfig[id] = toInstitutionConfig(hc);
    const loy = toInstitutionLoyalty(hc);
    if (loy) institutionLoyalty[id] = loy;
  });

  return { ...base, institutionConfig, institutionLoyalty };
};
