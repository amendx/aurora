/**
 * TodayCoworkersService — compute and cache coworkers + vacancies for the
 * current user's shifts covering TODAY + the next 6 days (1-week window).
 *
 * ── Data sources ──────────────────────────────────────────────────────────────
 * PRIMARY (coworkers):
 *   GET /groups/{groupId}/calendar/daily/{YYYY-MM-DD}
 *   Used fields: data.dynamic_schedule[].label
 *                data.dynamic_schedule[].shifts[].user
 *
 * FALLBACK (coworkers, per shift):
 *   GET /groups/{groupId}/shifts/{shiftId}
 *   Only when daily data has no matching slot for the user's own shift.
 *
 * Vacancies come from dynamic_schedule[].vacancy (same daily fetch, no extra request).
 *
 * ── Matching logic ────────────────────────────────────────────────────────────
 * For each user shift, scan every enabled group's daily calendar on the same date.
 * Match by shift label first character ("T" === "T").
 * Merge all matching users across groups; dedup by id; exclude self.
 *
 * ── In-memory cache shape ─────────────────────────────────────────────────────
 * Map<shiftId, {
 *   date: "YYYY-MM-DD",
 *   coworkers: Person[],
 *   coworkersByGroup: [{ groupId, groupName, institutionName, coworkers[] }],
 *   vacanciesByGroup: [{ groupId, groupName, institutionName, label, available, total }],
 * }>
 *
 * ── Firebase storage (write-only from here) ───────────────────────────────────
 * users/{userId}/todayCoworkers/{shiftId}  — same shape as above + syncedAt
 *
 * ── When compute() runs ───────────────────────────────────────────────────────
 * Once per session on login / session restore (guarded by mutex).
 * Safe to call fire-and-forget. Never blocks the caller.
 */

import LocalCache from './LocalCache';
import FirebaseAdapter from './firebase/FirebaseAdapter';
import WebClientApiService from './WebClientApiService';
import { getGroupVisibility } from '../utils/GroupVisibilityConfig';
import Logger from '../utils/Logger';

// ── In-memory cache ───────────────────────────────────────────────────────────

/** Map<shiftId, CacheEntry> */
const _cache = new Map();
let _cachedUserId = null;
let _computing = false; // mutex: prevents duplicate concurrent runs

// ── Helpers ───────────────────────────────────────────────────────────────────

const _dateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const _todayStr = () => _dateStr(new Date());

/** Returns ISO date strings for today and the next 6 days (7 total). */
const _weekDates = () => {
  const today = new Date();
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(_dateStr(d));
  }
  return dates;
};

/** "YYYY-MM" for a given date string "YYYY-MM-DD". */
const _monthKeyOf = (dateStr) => dateStr.slice(0, 7);

const _parsePerson = (u) => {
  if (!u?.id) return null;
  return {
    id: String(u.id),
    name: u.name || u.full_name || '',
    full_name: u.full_name || u.name || '',
    photo: u.photo || null,
    description: u.description || '',
    council: u.council || '',
  };
};

const _serializePerson = (p) => ({
  id: p.id, name: p.name, full_name: p.full_name,
  photo: p.photo, description: p.description, council: p.council,
});

// ── Core per-date processing ──────────────────────────────────────────────────

/**
 * For a single date + its user shifts, compute coworkers + vacancies.
 * Mutates `allEntries` in place. Reads/writes LocalCache for daily calendars.
 * Returns void — errors are caught by the caller.
 *
 * @param {object}  opts
 * @param {string}  opts.date          "YYYY-MM-DD"
 * @param {object[]} opts.userShifts   User's shifts on that date
 * @param {object[]} opts.enabledGroups
 * @param {Map}     opts.groupById     groupId → group object
 * @param {string}  opts.selfId
 * @param {string}  opts.token
 * @param {object}  opts.allEntries    Output accumulator { shiftId → CacheEntry }
 */
const _processDate = async ({ date, userShifts, enabledGroups, groupById, selfId, token, allEntries }) => {
  // Fetch daily calendars for all enabled groups on this date (LocalCache TTL applies)
  const dailyByGroup = new Map();
  await Promise.all(
    enabledGroups.map(async (g) => {
      const gid = String(g.id);
      const cached = await LocalCache.getGroupDaily(gid, date);
      if (cached) {
        dailyByGroup.set(gid, cached);
        return;
      }
      const res = await WebClientApiService.getGroupDailyCalendar(token, gid, date);
      if (res.success && res.data?.dynamic_schedule) {
        const slots = res.data.dynamic_schedule;
        dailyByGroup.set(gid, slots);
        LocalCache.saveGroupDaily(gid, date, slots).catch(() => {});
      } else {
        dailyByGroup.set(gid, null);
      }
    })
  );

  for (const shift of userShifts) {
    const shiftLabel = shift?.label ? String(shift.label) : null;
    const seenIds = new Set();
    const coworkersByGroup = [];

    // ── Coworkers: scan all enabled groups ────────────────────────────────────
    for (const [gid, schedule] of dailyByGroup.entries()) {
      if (!schedule) continue;
      const group = groupById.get(gid);
      const slot = shiftLabel
        ? schedule.find(s => String(s.label).charAt(0) === shiftLabel)
        : null;
      if (!slot) continue;

      const groupPersons = (slot.shifts || [])
        .map(s => _parsePerson(s.user))
        .filter(p => {
          if (!p) return false;
          if (String(p.id) === selfId) return false;
          if (seenIds.has(p.id)) return false;
          return true;
        });

      if (groupPersons.length === 0) continue;
      groupPersons.forEach(p => seenIds.add(p.id));
      coworkersByGroup.push({
        groupId: gid,
        groupName: group?.name || '',
        groupColor: (() => { const c = group?.color || ''; return c ? (c.startsWith('#') ? c : '#' + c) : ''; })(),
        institutionName: group?.institution?.name || '',
        coworkers: groupPersons,
      });
    }

    const coworkers = coworkersByGroup.flatMap(g => g.coworkers);

    // ── Fallback: shift detail endpoint (only when cross-group gave nothing + today) ──
    if (coworkers.length === 0 && shift?.id && shift?.group?.id && date === _todayStr()) {
      const detail = await WebClientApiService.getShiftDetail(token, shift.group.id, shift.id);
      if (detail.success) {
        const candidates = [
          ...(detail.data?.coworkers || []),
          detail.data?.user ?? null,
        ].filter(Boolean);
        const fallbackPersons = candidates
          .map(_parsePerson)
          .filter(p => p && String(p.id) !== selfId && !seenIds.has(p.id));
        if (fallbackPersons.length > 0) {
          fallbackPersons.forEach(p => seenIds.add(p.id));
          coworkersByGroup.push({
            groupId: String(shift.group?.id ?? ''),
            groupName: shift.group?.name || '',
            groupColor: shift.group?.color || '',
            institutionName: shift.group?.institution?.name || '',
            coworkers: fallbackPersons,
          });
          coworkers.push(...fallbackPersons);
        }
      }
    }

    // ── Vacancies: from dynamic_schedule[].vacancy (already fetched) ──────────
    const vacanciesByGroup = [];
    for (const [gid, schedule] of dailyByGroup.entries()) {
      if (!schedule) continue;
      const group = groupById.get(gid);
      const slot = shiftLabel
        ? schedule.find(s => String(s.label).charAt(0) === shiftLabel)
        : null;
      if (!slot?.vacancy) continue;
      const openSlots = slot.vacancy.slots ?? 0;
      if (openSlots <= 0) continue;
      vacanciesByGroup.push({
        groupId: gid,
        groupName: group?.name || '',
        groupColor: (() => { const c = group?.color || ''; return c ? (c.startsWith('#') ? c : '#' + c) : ''; })(),
        institutionName: group?.institution?.name || '',
        label: slot.label,
        available: openSlots,
        total: (slot.shifts?.length ?? 0) + openSlots,
      });
    }

    allEntries[String(shift.id)] = { date, coworkers, coworkersByGroup, vacanciesByGroup };
  }
};

// ── Public API ────────────────────────────────────────────────────────────────

const TodayCoworkersService = {
  /**
   * Compute coworkers for all user shifts in the next 7 days (today inclusive).
   * Guarded by mutex — safe to call fire-and-forget; will not duplicate work.
   *
   * @param {string|number} userId
   * @param {string}        token
   * @param {string|number} currentUserId  — self, always excluded
   */
  compute: async (userId, token, currentUserId, { force = false } = {}) => {
    if (!userId || !token) return;
    if (!force && _cachedUserId === String(userId) && _cache.size > 0) {
      Logger.info('[TodayCoworkers] cache already ready for this user — skipped');
      return;
    }
    if (_computing) {
      Logger.info('[TodayCoworkers] compute already in progress — skipped');
      return;
    }
    _computing = true;

    try {
      Logger.info(`[TodayCoworkers] compute start — user=${userId}`);

      const weekDates = _weekDates();
      const today = weekDates[0];

      // ── 1. Gather user shifts for each date in the window ──────────────────
      // The week can span a month boundary — fetch both months if needed.
      const monthKeys = [...new Set(weekDates.map(_monthKeyOf))];
      const monthDataArr = await Promise.all(
        monthKeys.map(mk => LocalCache.getShifts(userId, mk))
      );

      // date → shift[]
      const shiftsByDate = new Map();
      for (const data of monthDataArr) {
        for (const day of (data?.daysWithShifts || [])) {
          if (weekDates.includes(day.date) && day.shifts?.length) {
            shiftsByDate.set(day.date, day.shifts);
          }
        }
      }

      if (shiftsByDate.size === 0) {
        Logger.info('[TodayCoworkers] No shifts in next 7 days — skipped');
        return;
      }
      Logger.info(`[TodayCoworkers] ${shiftsByDate.size} date(s) with shifts in window`);

      // ── 2. Enabled groups ──────────────────────────────────────────────────
      const [visibilityConfig, groupsData] = await Promise.all([
        getGroupVisibility(userId),
        LocalCache.getGroups(userId),
      ]);
      const enabledGroupIds = visibilityConfig?.enabledGroupIds ?? null;

      let allUserGroups = groupsData?.groups ?? [];
      if (allUserGroups.length === 0) {
        // Fallback: derive from shifts on any day in the window
        const shiftGroupMap = new Map();
        for (const shifts of shiftsByDate.values()) {
          for (const s of shifts) {
            if (s.group?.id) shiftGroupMap.set(String(s.group.id), s.group);
          }
        }
        allUserGroups = Array.from(shiftGroupMap.values());
      }

      const enabledGroups = allUserGroups.filter(g => {
        if (!g?.id) return false;
        if (!enabledGroupIds) return true;
        return enabledGroupIds.some(id => String(id) === String(g.id));
      });

      Logger.info(`[TodayCoworkers] ${enabledGroups.length} enabled group(s)`);

      if (enabledGroups.length === 0) {
        Logger.info('[TodayCoworkers] No enabled groups — skipped');
        return;
      }

      const groupById = new Map(enabledGroups.map(g => [String(g.id), g]));
      const selfId = String(currentUserId || userId);

      // ── 3. Process each date ───────────────────────────────────────────────
      const allEntries = {};
      for (const [date, userShifts] of shiftsByDate.entries()) {
        await _processDate({ date, userShifts, enabledGroups, groupById, selfId, token, allEntries });
      }

      // ── 4. Update in-memory cache ──────────────────────────────────────────
      _cache.clear();
      _cachedUserId = String(userId);
      for (const [shiftId, entry] of Object.entries(allEntries)) {
        _cache.set(shiftId, entry);
      }
      Logger.info(`[TodayCoworkers] cache ready — ${_cache.size} shift(s) for ${_cache.size > 0 ? today : 'none'}`);

      // ── 5. Persist to Firebase (fire-and-forget) ───────────────────────────
      const syncedAt = new Date().toISOString();
      for (const [shiftId, entry] of Object.entries(allEntries)) {
        // Find the shift object to get label/institution metadata
        const shiftList = shiftsByDate.get(entry.date) || [];
        const shift = shiftList.find(s => String(s.id) === shiftId);
        FirebaseAdapter.saveTodayCoworkers(userId, shiftId, {
          shiftId,
          date: entry.date,
          shiftLabel: shift?.label ?? null,
          institutionId: shift?.group?.institution?.id ?? null,
          institutionName: shift?.group?.institution?.name ?? null,
          coworkers: entry.coworkers.map(_serializePerson),
          coworkersByGroup: entry.coworkersByGroup.map(g => ({
            groupId: g.groupId,
            groupName: g.groupName,
            groupColor: g.groupColor,
            institutionName: g.institutionName,
            coworkers: g.coworkers.map(_serializePerson),
          })),
          vacanciesByGroup: entry.vacanciesByGroup,
          syncedAt,
        }).catch(err => Logger.warn(`[TodayCoworkers] Firebase write failed for ${shiftId}: ${err?.message}`));
      }
    } catch (err) {
      Logger.warn(`[TodayCoworkers] compute error: ${err?.message}`);
    } finally {
      _computing = false;
    }
  },

  /** Flat merged coworkers list (compact preview). */
  getCoworkers: (shiftId) => _cache.get(String(shiftId))?.coworkers || [],

  /** Grouped coworkers (detail modal). */
  getCoworkersByGroup: (shiftId) => _cache.get(String(shiftId))?.coworkersByGroup || [],

  /** Vacancies grouped by group (detail modal). */
  getVacanciesByGroup: (shiftId) => _cache.get(String(shiftId))?.vacanciesByGroup || [],

  /**
   * True if the cache has been computed for this user.
   * Does NOT guarantee a specific shiftId is present.
   */
  isReady: (userId) => _cachedUserId === String(userId) && _cache.size > 0,

  /**
   * True if cache has an entry for this specific shiftId
   * (even if that entry has zero coworkers/vacancies).
   * Use this to distinguish "computed but empty" from "not yet computed".
   */
  hasEntry: (shiftId) => _cache.has(String(shiftId)),

  /** Clear on logout. */
  clear: () => { _cache.clear(); _cachedUserId = null; _computing = false; },
};

export default TodayCoworkersService;
