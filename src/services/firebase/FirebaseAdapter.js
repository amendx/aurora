/**
 * FirebaseAdapter — shadow persistence layer for Aurora.
 *
 * PURPOSE:
 *   Persist normalized entities to Firestore in parallel with AsyncStorage writes.
 *   Firebase is WRITE-THROUGH for all shadow writes. LoginSyncService performs one
 *   targeted GET per login (month metadata only) to avoid unnecessary shift rewrites.
 *   No screen or context reads from Firebase yet.
 *
 * SAFETY CONTRACT:
 *   Every write is fire-and-forget. A Firestore failure NEVER blocks the UI,
 *   never throws to the caller, and never affects LocalCache behavior.
 *   The app works identically whether Firebase is configured or not.
 *
 * FIRESTORE DOCUMENT STRUCTURE:
 *   users/{userId}                                          { profile, lastLoginAt }
 *   users/{userId}/financialConfig/current                  { ...FinancialConfig }
 *   users/{userId}/financialConfigHistory/{version}         { ...FinancialConfig }
 *   users/{userId}/persons/{personId}                       { ...Person }
 *   users/{userId}/groups/{groupId}                         { ...Group }
 *   users/{userId}/groupMembers/{groupId}                   { memberIds, members }
 *   users/{userId}/months/{YYYY-MM}                         { userId, monthKey, syncedAt }
 *   users/{userId}/months/{YYYY-MM}/summary/current         { ...MonthSummary }
 *   users/{userId}/months/{YYYY-MM}/shifts/{shiftId}        { ...Shift }
 *   users/{userId}/months/{YYYY-MM}/timeEntries/{shiftId}   { ...TimeEntry }
 */

import { doc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './config';
import Logger from '../../utils/Logger';

// ── Document reference helpers ────────────────────────────────────────────────

/** Root user document: users/{userId} */
const _uDoc = (userId) => {
  if (!db) return null;
  return doc(db, 'users', String(userId));
};

/** Subcollection document: users/{userId}/...path */
const _sub = (userId, ...path) => {
  if (!db) return null;
  return doc(db, 'users', String(userId), ...path);
};

// ── Batch helpers ─────────────────────────────────────────────────────────────

// Firestore hard limit is 500 ops per batch. Use 400 to leave headroom for
// any implicit ops (e.g. document creation counts against the limit).
const BATCH_LIMIT = 400;

/**
 * Write an arbitrary list of { ref, data, merge } tuples in chunked batches.
 * Each chunk is committed independently so a large set of writes never hits
 * the 500-op Firestore limit.
 *
 * @param {Array<{ref: DocumentReference, data: object, merge?: boolean}>} writes
 * @param {string} label - For warning messages only
 */
const _writeBatched = async (writes, label) => {
  if (!db || writes.length === 0) return;
  const now = new Date().toISOString();
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const chunk = writes.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const { ref, data, merge = true } of chunk) {
      if (!ref) continue;
      batch.set(ref, { ...data, _updatedAt: now }, { merge });
    }
    try {
      await batch.commit();
    } catch (err) {
      Logger.warn(`[Firebase] Batch commit failed [${label} chunk@${i}]: ${err?.message}`);
    }
  }
};

// ── Single-doc write helper ───────────────────────────────────────────────────

/**
 * Safe setDoc with merge. Always resolves. Never throws to caller.
 */
const _write = async (ref, data, merge = true) => {
  if (!db || !ref) return;
  try {
    await setDoc(
      ref,
      { ...data, _updatedAt: new Date().toISOString() },
      { merge }
    );
  } catch (err) {
    Logger.warn(`[Firebase] Write failed [${ref?.path}]: ${err?.message}`);
  }
};

// ── Strip helpers ─────────────────────────────────────────────────────────────

/**
 * Strip fields that are large or redundant before persisting.
 * `originalData` from the PlantaoAPI API can be 5–20KB per shift.
 */
const _stripShift = (shift) => {
  if (!shift || typeof shift !== 'object') return shift;
  const { originalData: _od, ...clean } = shift;
  return clean;
};

// ── Public write methods ──────────────────────────────────────────────────────
// All are async. All are safe to call without awaiting.
// All swallow errors and log a warning on failure.

const FirebaseAdapter = {
  /**
   * Persist user document on login / session restore.
   * Token is stripped before writing — credentials must not reach Firestore.
   *
   * users/{userId}
   */
  saveUser: (userId, authRaw, profile) => {
    let safeAuthRaw = null;
    if (authRaw && typeof authRaw === 'object') {
      // Strip any credential fields that must never leave the device
      const { token: _t, password: _p, ...rest } = authRaw;
      safeAuthRaw = rest;
    }
    return _write(_uDoc(userId), {
      userId,
      ...(safeAuthRaw ? { authRaw: safeAuthRaw } : {}),
      profile: profile || {},
      lastLoginAt: new Date().toISOString(),
    });
  },

  /**
   * Persist the current financial config and append an immutable history entry.
   *
   * users/{userId}/financialConfig/current
   * users/{userId}/financialConfigHistory/{version}
   */
  saveFinancialConfig: async (userId, config) => {
    if (!db || !config) return;
    try {
      const now = new Date().toISOString();
      await setDoc(
        _sub(userId, 'financialConfig', 'current'),
        { ...config, _updatedAt: now },
        { merge: true }
      );
      if (config?.version != null) {
        // History entries are immutable — no merge so a retry overwrites cleanly
        await setDoc(
          _sub(userId, 'financialConfigHistory', String(config.version)),
          { ...config, _savedAt: now }
        );
      }
    } catch (err) {
      Logger.warn(`[Firebase] saveFinancialConfig failed [${userId}]: ${err?.message}`);
    }
  },

  /**
   * Persist each group as its own document (batched, chunked).
   *
   * users/{userId}/groups/{groupId}
   */
  saveGroups: (userId, groups) => {
    if (!Array.isArray(groups) || groups.length === 0) return Promise.resolve();
    const writes = groups
      .filter(g => g?.id)
      .map(g => ({ ref: _sub(userId, 'groups', String(g.id)), data: { ...g } }));
    return _writeBatched(writes, `saveGroups/${userId}`);
  },

  /**
   * Persist group members for a specific group.
   *
   * users/{userId}/groupMembers/{groupId}
   */
  saveGroupMembers: (userId, groupId, memberIds, members) =>
    _write(_sub(userId, 'groupMembers', String(groupId)), {
      userId,
      groupId,
      memberIds: memberIds || [],
      members: members || [],
      syncedAt: new Date().toISOString(),
    }),

  /**
   * Persist each person as its own document (batched, chunked).
   *
   * users/{userId}/persons/{personId}
   */
  savePersons: (userId, personsMap) => {
    if (!personsMap) return Promise.resolve();
    const entries = Object.entries(personsMap);
    if (entries.length === 0) return Promise.resolve();
    const writes = entries.map(([personId, person]) => ({
      ref: _sub(userId, 'persons', String(personId)),
      data: { ...person },
    }));
    return _writeBatched(writes, `savePersons/${userId}`);
  },

  /**
   * Persist a month's shifts.
   * Month metadata goes into the month doc; each shift is its own document.
   * Batched and chunked to handle months with many shifts safely.
   *
   * users/{userId}/months/{YYYY-MM}                   ← metadata only
   * users/{userId}/months/{YYYY-MM}/shifts/{shiftId}  ← per-shift doc
   */
  saveMonthShifts: async (userId, monthKey, daysWithShifts, syncedAt) => {
    if (!db) return;
    const now = new Date().toISOString();
    const syncTs = syncedAt || now;
    try {
      // Month metadata (merge: summary/other subcollection data is unaffected)
      await setDoc(
        _sub(userId, 'months', monthKey),
        { userId, monthKey, syncedAt: syncTs, _updatedAt: now },
        { merge: true }
      );

      if (!Array.isArray(daysWithShifts) || daysWithShifts.length === 0) return;

      const writes = [];
      for (const day of daysWithShifts) {
        if (!Array.isArray(day?.shifts)) continue;
        for (const shift of day.shifts) {
          if (!shift?.id) continue;
          writes.push({
            ref: _sub(userId, 'months', monthKey, 'shifts', String(shift.id)),
            data: _stripShift(shift),
          });
        }
      }
      await _writeBatched(writes, `saveMonthShifts/${userId}/${monthKey}`);
    } catch (err) {
      Logger.warn(`[Firebase] saveMonthShifts failed [${userId}/${monthKey}]: ${err?.message}`);
    }
  },

  /**
   * Persist a MonthSummary into its own dedicated document.
   * Kept separate from the month metadata doc to avoid field collision.
   *
   * users/{userId}/months/{YYYY-MM}/summary/current
   */
  saveSummary: (userId, monthKey, summary) =>
    _write(_sub(userId, 'months', monthKey, 'summary', 'current'), { ...summary }),

  /**
   * Persist a single time entry (manual or migrated).
   * Enriches the entry with required audit fields before writing to Firestore.
   * Local TimeEntry model stays unchanged — enrichment is Firebase-only.
   *
   * Required fields guaranteed in Firestore:
   *   source       'manual' | 'migrated'
   *   createdAt    first-seen timestamp (preserved across updates)
   *   updatedAt    always the current write timestamp
   *   editedAt     backward-compat alias for when the user last edited
   *
   * users/{userId}/months/{YYYY-MM}/timeEntries/{shiftId}
   */
  saveTimeEntry: (userId, monthKey, shiftId, entry) => {
    const now = new Date().toISOString();
    return _write(
      _sub(userId, 'months', monthKey, 'timeEntries', String(shiftId)),
      {
        ...entry,
        source:    entry?.source    || 'manual',
        // createdAt: preserve existing value; fall back to editedAt for migrated entries
        createdAt: entry?.createdAt || entry?.editedAt || now,
        updatedAt: now,
        editedAt:  entry?.editedAt  || now,
      }
    );
  },

  /**
   * Persist all time entries for a month (batched, chunked).
   * Same field enrichment as saveTimeEntry.
   *
   * users/{userId}/months/{YYYY-MM}/timeEntries/{shiftId}
   */
  /**
   * Persist precomputed today-coworkers for a specific shift.
   * Called by TodayCoworkersService on login / refresh.
   *
   * users/{userId}/todayCoworkers/{shiftId}
   */
  /**
   * Persist the user's group-visibility preference.
   *
   * users/{userId}/settings/groupVisibility
   */
  saveGroupVisibilityConfig: (userId, config) =>
    _write(_sub(userId, 'settings', 'groupVisibility'), { ...config }),

  /** users/{userId}/settings/groupColors */
  saveGroupColors: (userId, payload) =>
    _write(_sub(userId, 'settings', 'groupColors'), { ...payload }),

  saveTodayCoworkers: (userId, shiftId, data) =>
    _write(_sub(userId, 'todayCoworkers', String(shiftId)), { ...data }),

  saveTimeEntries: (userId, monthKey, entries) => {
    if (!entries) return Promise.resolve();
    const pairs = Object.entries(entries);
    if (pairs.length === 0) return Promise.resolve();
    const now = new Date().toISOString();
    const writes = pairs.map(([shiftId, entry]) => ({
      ref: _sub(userId, 'months', monthKey, 'timeEntries', String(shiftId)),
      data: {
        ...entry,
        source:    entry?.source    || 'manual',
        createdAt: entry?.createdAt || entry?.editedAt || now,
        updatedAt: now,
        editedAt:  entry?.editedAt  || now,
      },
    }));
    return _writeBatched(writes, `saveTimeEntries/${userId}/${monthKey}`);
  },
};

export default FirebaseAdapter;
