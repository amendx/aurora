/**
 * LocalCache — centralized local persistence for Aurora.
 *
 * Backed by AsyncStorage (non-sensitive bulk data).
 * SecureStore is reserved for auth tokens and credentials only.
 *
 * Firebase upgrade path:
 *   Replace this file with FirebaseCache.js that implements the same API.
 *   Zero changes needed in contexts or screens.
 *
 * Key scheme:
 *   aurora_shifts_{userId}_{YYYY-MM}       Shift[] (daysWithShifts format)
 *   aurora_te_{userId}_{YYYY-MM}           { [shiftId]: TimeEntry }
 *   aurora_summary_{userId}_{YYYY-MM}      MonthSummary
 *   aurora_groups_{userId}                 { groups: Group[], syncedAt }
 *   aurora_grpmbr_{userId}_{groupId}       { members: Person[], memberIds: number[], syncedAt }
 *   aurora_persons_{userId}                { [personId]: Person }
 *   aurora_finconfig_{userId}              FinancialConfig
 *   aurora_migration_v_{userId}            number (migration version, scoped per user)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Logger from '../utils/Logger';

const P = 'aurora'; // namespace prefix — short to save key space

// ── Firebase shadow adapter ───────────────────────────────────────────────────
// Set once at app startup via LocalCache.setFirebaseAdapter(FirebaseAdapter).
// When set, every write also persists to Firestore in the background.
// Never blocks reads/writes. Never throws to callers.
// Null = Firebase not configured (default) → shadow writes silently skipped.
let _fb = null;

// ── Key builders ──────────────────────────────────────────────────────────────
// Centralized here so Firebase migration only needs to change the storage backend,
// not the key strings.

const K = {
  shifts:          (uid, mk)  => `${P}_shifts_${uid}_${mk}`,
  timeEntries:     (uid, mk)  => `${P}_te_${uid}_${mk}`,
  summary:         (uid, mk)  => `${P}_summary_${uid}_${mk}`,
  groups:          (uid)      => `${P}_groups_${uid}`,
  groupMembers:    (uid, gid) => `${P}_grpmbr_${uid}_${gid}`,
  groupDaily:      (gid, dt)  => `${P}_grpdaily_${gid}_${dt}`,
  persons:         (uid)      => `${P}_persons_${uid}`,
  financialConfig: (uid)      => `${P}_finconfig_${uid}`,
  migrationVersion:(uid)      => `${P}_migration_v_${uid}`,
  manualShifts:    (uid, mk)  => `${P}_manual_${uid}_${mk}`,
  regularShifts:   (uid, mk)  => `${P}_regular_${uid}_${mk}`,
  openings:        (uid, mk)  => `${P}_openings_${uid}_${mk}`,
  openingsLastFetch: (uid)    => `${P}_openings_last_fetch_${uid}`,
};

// ── Staleness helpers ─────────────────────────────────────────────────────────

const _currentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Returns true when cached data should be re-fetched from the API.
 * Past months are never auto-stale (their data doesn't change).
 * Current month: stale after 30 min.
 * Future months: stale after 4 h.
 *
 * forceReload bypasses this check entirely.
 *
 * @param {string|null} syncedAt - ISO timestamp of last hydration, or null
 * @param {string}      monthKey - "YYYY-MM"
 * @returns {boolean}
 */
export const isMonthStale = (syncedAt, monthKey) => {
  if (!syncedAt) return true;

  const ageMs = Date.now() - new Date(syncedAt).getTime();
  const current = _currentMonthKey();

  if (monthKey < current) return false;                    // past: never auto-stale
  if (monthKey === current) return ageMs > 30 * 60_000;   // current: 30 min
  return ageMs > 4 * 60 * 60_000;                         // future: 4 h
};

// ── Internal get/set ─────────────────────────────────────────────────────────

const _get = async (key) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    Logger.warn(`LocalCache._get(${key}) failed:`, err?.message);
    return null;
  }
};

const _set = async (key, value) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    Logger.warn(`LocalCache._set(${key}) failed:`, err?.message);
    return false;
  }
};

// ── Shifts ────────────────────────────────────────────────────────────────────
//
// Stored as { syncedAt, daysWithShifts } to preserve the exact structure
// ShiftsContext already produces. This avoids any UI-layer changes while still
// enabling proper staleness checks and LocalCache-first reads.

/**
 * @param {number} userId
 * @param {string} monthKey  "YYYY-MM"
 * @returns {Promise<{ syncedAt: string, daysWithShifts: object[] }|null>}
 */
const getShifts = (userId, monthKey) => _get(K.shifts(userId, monthKey));

/**
 * @param {number}   userId
 * @param {string}   monthKey
 * @param {object[]} daysWithShifts  - The exact array ShiftsContext produces
 * @param {string}   syncedAt        - ISO timestamp
 */
const saveShifts = async (userId, monthKey, daysWithShifts, syncedAt, hoursReport) => {
  const result = await _set(K.shifts(userId, monthKey), { syncedAt, daysWithShifts, hoursReport: hoursReport || null });
  if (_fb) _fb.saveMonthShifts(userId, monthKey, daysWithShifts, syncedAt).catch(() => {});
  return result;
};

// ── Time Entries ──────────────────────────────────────────────────────────────
//
// Stored as { [shiftId]: TimeEntry } per month.
// The old real_hours_{date} format (keyed by shiftIndex) is converted during migration.

/**
 * @param {number} userId
 * @param {string} monthKey
 * @returns {Promise<Object.<string, import('../models').TimeEntry>|null>}
 */
const getTimeEntries = (userId, monthKey) => _get(K.timeEntries(userId, monthKey));

/**
 * Merge a single TimeEntry into the month's time-entry map (upsert).
 * @param {number} userId
 * @param {string} monthKey
 * @param {string} shiftId
 * @param {import('../models').TimeEntry} entry
 */
const saveTimeEntry = async (userId, monthKey, shiftId, entry) => {
  const existing = (await getTimeEntries(userId, monthKey)) || {};
  existing[shiftId] = entry;
  const result = await _set(K.timeEntries(userId, monthKey), existing);
  if (_fb) _fb.saveTimeEntry(userId, monthKey, shiftId, entry).catch(() => {});
  return result;
};

/**
 * Save a full time-entry map (used by migration).
 * @param {number} userId
 * @param {string} monthKey
 * @param {Object.<string, import('../models').TimeEntry>} entries
 */
const saveTimeEntries = async (userId, monthKey, entries) => {
  const result = await _set(K.timeEntries(userId, monthKey), entries);
  if (_fb) _fb.saveTimeEntries(userId, monthKey, entries).catch(() => {});
  return result;
};

// ── MonthSummary ──────────────────────────────────────────────────────────────

/**
 * @param {number} userId
 * @param {string} monthKey
 * @returns {Promise<import('../models').MonthSummary|null>}
 */
const getSummary = (userId, monthKey) => _get(K.summary(userId, monthKey));

/**
 * @param {number} userId
 * @param {string} monthKey
 * @param {import('../models').MonthSummary} summary
 */
const saveSummary = async (userId, monthKey, summary) => {
  const result = await _set(K.summary(userId, monthKey), summary);
  if (_fb) _fb.saveSummary(userId, monthKey, summary).catch(() => {});
  return result;
};

/**
 * Mark a month's summary as dirty (config changed, needs recompute on next read).
 * Does not delete the summary — the old values remain readable until recomputed.
 */
const markSummaryDirty = async (userId, monthKey) => {
  const existing = await getSummary(userId, monthKey);
  if (existing) {
    return saveSummary(userId, monthKey, { ...existing, isDirty: true });
  }
  return true;
};

// ── Groups ────────────────────────────────────────────────────────────────────

/**
 * @param {number} userId
 * @returns {Promise<{ groups: import('../models').Group[], syncedAt: string }|null>}
 */
const getGroups = (userId) => _get(K.groups(userId));

/**
 * @param {number} userId
 * @param {import('../models').Group[]} groups
 */
const saveGroups = async (userId, groups) => {
  const result = await _set(K.groups(userId), { groups, syncedAt: new Date().toISOString() });
  if (_fb) _fb.saveGroups(userId, groups).catch(() => {});
  return result;
};

// ── Group Daily Calendar ──────────────────────────────────────────────────────
// Keyed by groupId + date string ("YYYY-MM-DD"). TTL: 30 min for today, never for past.
// Stores the full dynamic_schedule[] from GET /groups/{groupId}/calendar/daily/{date}.

const GROUP_DAILY_TTL_MS = 30 * 60_000; // 30 min

/**
 * @param {string} groupId
 * @param {string} dateStr  "YYYY-MM-DD"
 * @returns {Promise<import('../models').ApiDynamicScheduleSlot[]|null>}
 */
const getGroupDaily = async (groupId, dateStr) => {
  const cached = await _get(K.groupDaily(groupId, dateStr));
  if (!cached) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (dateStr === today) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age > GROUP_DAILY_TTL_MS) return null; // stale for today
  }
  return cached.dynamic_schedule ?? null;
};

/**
 * @param {string} groupId
 * @param {string} dateStr  "YYYY-MM-DD"
 * @param {import('../models').ApiDynamicScheduleSlot[]} dynamicSchedule
 */
const saveGroupDaily = (groupId, dateStr, dynamicSchedule) =>
  _set(K.groupDaily(groupId, dateStr), {
    dynamic_schedule: dynamicSchedule,
    fetchedAt: new Date().toISOString(),
  });

// ── Group Members ─────────────────────────────────────────────────────────────

/**
 * @param {number} userId
 * @param {number} groupId
 * @returns {Promise<{ memberIds: number[], members: import('../models').Person[], syncedAt: string }|null>}
 */
const getGroupMembers = (userId, groupId) => _get(K.groupMembers(userId, groupId));

/**
 * @param {number}   userId
 * @param {number}   groupId
 * @param {number[]} memberIds
 * @param {import('../models').Person[]} members
 */
const saveGroupMembers = async (userId, groupId, memberIds, members) => {
  const result = await _set(K.groupMembers(userId, groupId), {
    memberIds,
    members,
    syncedAt: new Date().toISOString(),
  });
  if (_fb) _fb.saveGroupMembers(userId, groupId, memberIds, members).catch(() => {});
  return result;
};

// ── Persons ───────────────────────────────────────────────────────────────────
//
// Flat map { [personId]: Person } scoped per user.
// Persons extracted from shift coworkers are merged here — never embedded in shifts.

/**
 * @param {number} userId
 * @returns {Promise<Object.<string, import('../models').Person>|null>}
 */
const getPersons = (userId) => _get(K.persons(userId));

/**
 * Merge new persons into the existing cache.
 * Field-level merge: incoming non-null/non-empty values win; existing richer
 * fields are kept when the incoming record has a null/empty value for them.
 * This prevents a partial coworker record fetched from a shift from overwriting
 * a richer record fetched from the group members list.
 *
 * @param {number} userId
 * @param {import('../models').Person[]} newPersons
 */
const mergePersons = async (userId, newPersons) => {
  const existing = (await getPersons(userId)) || {};
  for (const p of newPersons) {
    if (!p?.id) continue;
    const key = String(p.id);
    const prev = existing[key];
    if (!prev) {
      existing[key] = p;
    } else {
      // Incoming wins only for non-null, non-empty-string fields
      const merged = { ...prev };
      for (const [field, val] of Object.entries(p)) {
        if (val !== null && val !== undefined && val !== '') {
          merged[field] = val;
        }
      }
      existing[key] = merged;
    }
  }
  const result = await _set(K.persons(userId), existing);
  if (_fb) _fb.savePersons(userId, existing).catch(() => {});
  return result;
};

// ── Financial Config ──────────────────────────────────────────────────────────

/**
 * @param {number} userId
 * @returns {Promise<import('../models').FinancialConfig|null>}
 */
const getFinancialConfig = (userId) => _get(K.financialConfig(userId));

/**
 * Save a new version of financial config.
 * By default marks current+next month summaries dirty so they recompute on next read.
 * Pass { skipDirtyMark: true } when called from migration to avoid spurious recomputes
 * at startup (migration config write should not dirty summaries that don't exist yet).
 *
 * @param {number} userId
 * @param {import('../models').FinancialConfig} config
 * @param {{ skipDirtyMark?: boolean }} [opts]
 */
const saveFinancialConfig = async (userId, config, opts = {}) => {
  await _set(K.financialConfig(userId), config);
  if (_fb) _fb.saveFinancialConfig(userId, config).catch(() => {});

  if (opts.skipDirtyMark) return true;

  // Mark current and next month summaries dirty so they recompute on next read.
  const now = new Date();
  const currentMK = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const nextMonth = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
  const nextYear  = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const nextMK    = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}`;

  await markSummaryDirty(userId, currentMK);
  await markSummaryDirty(userId, nextMK);

  return true;
};

// ── Migration version ─────────────────────────────────────────────────────────

/**
 * Migration version is scoped per user so different accounts on the same device
 * each track their own migration state independently.
 * @param {number} userId
 */
const getMigrationVersion = async (userId) => {
  const v = await _get(K.migrationVersion(userId));
  return v ?? 0;
};

const setMigrationVersion = (userId, version) => _set(K.migrationVersion(userId), version);

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Remove all aurora_ keys for a given user (logout cleanup).
 * Does NOT remove the per-user migration version — that survives logout so the
 * migration does not re-run on the next login for the same device/account.
 *
 * Key patterns deleted:
 *   aurora_shifts_{userId}_*        (contains `_${userId}_`)
 *   aurora_te_{userId}_*
 *   aurora_summary_{userId}_*
 *   aurora_grpmbr_{userId}_*
 *   aurora_groups_{userId}          (exact match — no trailing segment)
 *   aurora_persons_{userId}         (exact match)
 *   aurora_finconfig_{userId}       (exact match)
 *
 * Keys intentionally preserved:
 *   aurora_migration_v_{userId}     — re-running migration wastes time and is safe
 *                                     but unnecessary; preserve across logouts.
 */
const clearUser = async (userId) => {
  const allKeys = await AsyncStorage.getAllKeys();
  // Keys that embed userId in the middle (e.g. aurora_shifts_{uid}_{mk})
  const middleKeys = allKeys.filter(
    k => k.startsWith(`${P}_`) && k.includes(`_${userId}_`) && !k.startsWith(`${P}_migration_v_`)
  );
  // Keys that end with userId (no trailing segment after userId)
  const tailKeys = allKeys.filter(k =>
    k === K.groups(userId) ||
    k === K.persons(userId) ||
    k === K.financialConfig(userId)
  );
  const toDelete = [...new Set([...middleKeys, ...tailKeys])];
  if (toDelete.length > 0) {
    await AsyncStorage.multiRemove(toDelete);
    Logger.info(`LocalCache: cleared ${toDelete.length} keys for user ${userId}`);
  }
};

// ── Manual Shifts ─────────────────────────────────────────────────────────────
// Shifts created by the user manually (aurora-source, no WebClient API).
// Shape mirrors the internal Shift model; missing API fields set to null.

const getManualShifts = async (userId, monthKey) => {
  const raw = await _get(K.manualShifts(userId, monthKey));
  return Array.isArray(raw) ? raw : [];
};

const saveManualShift = async (userId, shift) => {
  const existing = await getManualShifts(userId, shift.monthKey);
  const updated = existing.filter(s => s.id !== shift.id);
  updated.push(shift);
  return _set(K.manualShifts(userId, shift.monthKey), updated);
};

// Replace the entire manualShifts list for a month. Used when Firestore is
// authoritative (aurora hydration) so deleted shifts get evicted locally.
const setManualShifts = (userId, monthKey, shifts) =>
  _set(K.manualShifts(userId, monthKey), Array.isArray(shifts) ? shifts : []);

const deleteManualShift = async (userId, shiftId, monthKey) => {
  const existing = await getManualShifts(userId, monthKey);
  return _set(K.manualShifts(userId, monthKey), existing.filter(s => s.id !== shiftId));
};

// Regular shifts for aurora users — shifts they received via cede / swap.
// Distinguished from manualShifts so the source is preserved (manual = self-created,
// regular = came from a coordinator opening or another doctor's cede).
const getRegularShifts = async (userId, monthKey) => {
  const raw = await _get(K.regularShifts(userId, monthKey));
  return Array.isArray(raw) ? raw : [];
};

const saveRegularShifts = (userId, monthKey, shifts) =>
  _set(K.regularShifts(userId, monthKey), Array.isArray(shifts) ? shifts : []);

const saveRegularShift = async (userId, shift) => {
  const existing = await getRegularShifts(userId, shift.monthKey);
  const updated = existing.filter(s => s.id !== shift.id);
  updated.push(shift);
  return _set(K.regularShifts(userId, shift.monthKey), updated);
};

const deleteRegularShift = async (userId, shiftId, monthKey) => {
  const existing = await getRegularShifts(userId, monthKey);
  return _set(K.regularShifts(userId, monthKey), existing.filter(s => s.id !== shiftId));
};

// ── Openings ──────────────────────────────────────────────────────────────────

const OPENINGS_TTL_MS = 15 * 60_000; // 15 min

const getOpenings = async (userId, monthKey) => {
  const raw = await _get(K.openings(userId, monthKey));
  return Array.isArray(raw) ? raw : [];
};

const saveOpenings = async (userId, monthKey, openings) => {
  await _set(K.openings(userId, monthKey), openings);
  await _set(K.openingsLastFetch(userId), new Date().toISOString());
};

const isOpeningsStale = async (userId) => {
  const ts = await _get(K.openingsLastFetch(userId));
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > OPENINGS_TTL_MS;
};

// ── Firebase adapter registration ─────────────────────────────────────────────

/**
 * Register a Firebase adapter for shadow persistence.
 * Call once at app startup after user is confirmed.
 * Pass null to disable Firebase writes (e.g. on logout).
 *
 * @param {object|null} adapter - Object implementing FirebaseAdapter's write methods
 */
const setFirebaseAdapter = (adapter) => {
  _fb = adapter;
  Logger.info(`LocalCache: Firebase shadow writes ${adapter ? 'enabled' : 'disabled'}`);
};

// ── Public API ────────────────────────────────────────────────────────────────

const LocalCache = {
  // Shifts
  getShifts,
  saveShifts,

  // Time entries
  getTimeEntries,
  saveTimeEntry,
  saveTimeEntries,

  // Summary
  getSummary,
  saveSummary,
  markSummaryDirty,

  // Groups
  getGroups,
  saveGroups,

  // Group daily calendar (coworkers cache)
  getGroupDaily,
  saveGroupDaily,

  // Group members
  getGroupMembers,
  saveGroupMembers,

  // Persons
  getPersons,
  mergePersons,

  // Financial config
  getFinancialConfig,
  saveFinancialConfig,

  // Manual shifts (aurora-source users)
  getManualShifts,
  saveManualShift,
  setManualShifts,
  deleteManualShift,

  // Regular shifts (aurora users — received via cede / swap)
  getRegularShifts,
  saveRegularShifts,
  saveRegularShift,
  deleteRegularShift,

  // Openings
  getOpenings,
  saveOpenings,
  isOpeningsStale,

  // Migration
  getMigrationVersion,
  setMigrationVersion,

  // Utilities
  clearUser,

  // Staleness
  isMonthStale,

  // Firebase shadow adapter
  setFirebaseAdapter,

  // Exposed for testing / debugging only
  _keys: K,
};

export default LocalCache;
