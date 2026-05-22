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

/**
 * Pull past months from Firestore into LocalCache so Charts/Reports don't
 * re-fetch immutable history on a fresh device or after logout.
 *
 * Strategy:
 *   - For each of the last N past month keys (current month excluded)
 *   - WebClient users: write into the shifts bucket (matches API-shape cache)
 *   - Aurora users: write into manualShifts + regularShifts buckets (matches
 *     the aurora branch in ShiftsContext.loadMonthlyShifts)
 *   - Always hydrate the month summary — Charts only checks the summary doc
 *     to decide whether to skip prefetch.
 *
 * Fire-and-forget. Runs concurrently across months for speed.
 *
 * @param {number}  userId
 * @param {string}  source  'aurora' | undefined (webClient)
 * @param {number}  count   How many past months to hydrate (default 12)
 */
export const hydratePastMonthsFromFirebase = async (userId, source, count = 12) => {
  if (!userId || !db) return;
  const isAurora = source === 'aurora';
  const now = new Date();
  const pastKeys = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    pastKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  let hydrated = 0;
  await Promise.all(pastKeys.map(async (mk) => {
    try {
      if (isAurora) {
        // Aurora: check the buckets ShiftsContext aurora branch reads from.
        const [manual, regular, summary] = await Promise.all([
          LocalCache.getManualShifts(userId, mk),
          LocalCache.getRegularShifts(userId, mk),
          LocalCache.getSummary(userId, mk),
        ]);
        if ((manual?.length || regular?.length) && summary) return;

        const remote = await FirebaseAdapter.fetchAuroraMonth(userId, mk);
        const monthManual = (remote.manualShifts || []).filter(s => s?.monthKey === mk);
        const monthRegular = remote.regularShifts || [];
        if (monthManual.length === 0 && monthRegular.length === 0) return;

        if (remote.manualAuthoritative)  await LocalCache.setManualShifts(userId, mk, monthManual);
        if (remote.regularAuthoritative) await LocalCache.saveRegularShifts(userId, mk, monthRegular);

        // Pull the cached summary doc if present — saves one recompute on Charts.
        const { doc: _doc, getDoc } = await import('firebase/firestore');
        try {
          const sumSnap = await getDoc(_doc(db, 'users', String(userId), 'months', mk, 'summary', 'current'));
          if (sumSnap.exists()) await LocalCache.saveSummary(userId, mk, sumSnap.data());
        } catch (_) {}

        hydrated++;
        return;
      }

      // WebClient: shifts bucket matches API cache shape.
      const local = await LocalCache.getShifts(userId, mk);
      if (local?.daysWithShifts?.length) return;

      const remote = await FirebaseAdapter.fetchWebClientMonth(userId, mk);
      if (!remote.hasData) return;

      await LocalCache.saveShifts(
        userId, mk, remote.daysWithShifts, remote.syncedAt || new Date().toISOString(), null
      );
      if (remote.summary) {
        await LocalCache.saveSummary(userId, mk, remote.summary);
      }
      hydrated++;
    } catch (err) {
      Logger.warn(`[LoginSync] hydratePastMonths ${mk}: ${err?.message}`);
    }
  }));

  if (hydrated > 0) {
    Logger.info(`[LoginSync] Past-month hydration: ${hydrated}/${pastKeys.length} months pulled from Firestore (${isAurora ? 'aurora' : 'webClient'})`);
  }
};
