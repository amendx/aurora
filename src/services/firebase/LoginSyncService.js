/**
 * LoginSyncService — current-month Firebase reconciliation on login.
 *
 * PURPOSE:
 *   On every login (fresh or session restore), reconcile the current month's
 *   locally-cached data with Firestore. Past months are left untouched.
 *
 * RECONCILIATION STRATEGY:
 *   1. Read the month metadata doc from Firestore (ONE document GET per login).
 *   2. Compare its `syncedAt` timestamp against the local `syncedAt` timestamp.
 *   3. If local is newer (or Firebase doc is missing), write updated shifts.
 *      If Firebase is already up to date, skip all shift writes entirely.
 *   4. Time entries are always pushed if they exist — they change independently
 *      of the shift sync cycle (manual entries can be added between shift fetches).
 *   5. Summary and financial config are always pushed (single small docs each).
 *
 * COST:
 *   - 1 Firestore GET per login (month metadata)
 *   - 0–N Firestore writes (0 if already in sync, N = shift count if behind)
 *   - Never blocks login or UI — fully fire-and-forget
 *   - Never throws to caller
 *
 * WHY CURRENT MONTH ONLY:
 *   Past months are closed — their shift data never changes. They were written to
 *   Firebase when they were last fetched from the API. Only the current month can
 *   receive new/changed shifts from PlantaoAPI between sessions.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from './config';
import LocalCache from '../LocalCache';
import FirebaseAdapter from './FirebaseAdapter';
import Logger from '../../utils/Logger';

const _currentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Read the month metadata document from Firestore.
 * Returns the document data, or null on any error (missing doc, offline, etc.).
 * Failure is treated as "Firebase behind local" → write everything.
 *
 * @param {number} userId
 * @param {string} monthKey  "YYYY-MM"
 * @returns {Promise<object|null>}
 */
const _readFirebaseMonthMeta = async (userId, monthKey) => {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, 'users', String(userId), 'months', monthKey));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    // Network/permission error — treat as "not yet synced", write everything
    Logger.warn(`[LoginSync] Could not read Firebase month meta [${userId}/${monthKey}]: ${err?.message}`);
    return null;
  }
};

/**
 * Reconcile the current month's local data against Firestore.
 * Fire-and-forget. Never blocks login. Never throws.
 *
 * @param {number} userId
 */
export const syncCurrentMonthToFirebase = async (userId) => {
  if (!userId) return;
  const monthKey = _currentMonthKey();

  try {
    // ── Shifts: compare syncedAt before writing ───────────────────────────────
    const shiftsData = await LocalCache.getShifts(userId, monthKey);

    if (shiftsData?.daysWithShifts) {
      const fbMeta = await _readFirebaseMonthMeta(userId, monthKey);
      const fbSyncedAt    = fbMeta?.syncedAt || null;
      const localSyncedAt = shiftsData.syncedAt || null;

      // ISO 8601 strings are lexicographically comparable — no Date parsing needed.
      // Write only if Firebase is behind (missing or older than local).
      const needsShiftSync = !fbSyncedAt || !localSyncedAt || localSyncedAt > fbSyncedAt;

      if (needsShiftSync) {
        FirebaseAdapter.saveMonthShifts(
          userId,
          monthKey,
          shiftsData.daysWithShifts,
          localSyncedAt
        ).catch(() => {});
        Logger.info(
          `[LoginSync] Shifts out of sync for ${monthKey} — writing` +
          ` (local: ${localSyncedAt}, firebase: ${fbSyncedAt})`
        );
      } else {
        Logger.info(`[LoginSync] Shifts already in sync for ${monthKey} (${fbSyncedAt}), skipping`);
      }
    }

    // ── Time entries: always push if they exist ───────────────────────────────
    // Entries change independently of shifts (user can add a manual entry at any
    // time). There is no cheap syncedAt equivalent, so we always upsert.
    // Each entry write is idempotent (merge: true), so cost is O(entry count).
    const entries = await LocalCache.getTimeEntries(userId, monthKey);
    if (entries && Object.keys(entries).length > 0) {
      FirebaseAdapter.saveTimeEntries(userId, monthKey, entries).catch(() => {});
    }

    // ── Summary: push if it exists (single small doc) ─────────────────────────
    const summary = await LocalCache.getSummary(userId, monthKey);
    if (summary) {
      FirebaseAdapter.saveSummary(userId, monthKey, summary).catch(() => {});
    }

    // ── Financial config: always push latest (single small doc) ──────────────
    // Config version is embedded in the document — Firestore history sub-doc
    // ensures no version is ever lost even if this overwrites the current slot.
    const config = await LocalCache.getFinancialConfig(userId);
    if (config) {
      FirebaseAdapter.saveFinancialConfig(userId, config).catch(() => {});
    }

    Logger.info(`[LoginSync] Reconciliation complete for user ${userId} / month ${monthKey}`);
  } catch (err) {
    // Never propagate — this is a best-effort background operation
    Logger.warn(`[LoginSync] syncCurrentMonthToFirebase error for ${userId}: ${err?.message}`);
  }
};
