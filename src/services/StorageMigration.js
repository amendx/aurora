/**
 * StorageMigration — one-time, idempotent migration of legacy SecureStore keys.
 *
 * Run once at app startup (before any data reads). Safe to call on every launch —
 * exits immediately if the migration version is already satisfied.
 *
 * Migration v1 converts:
 *   real_hours_{YYYY-MM-DD}   (SecureStore) → LocalCache time entries per month
 *   shift_configurations      (SecureStore) → LocalCache FinancialConfig with version=1
 *
 * The old SecureStore keys are deleted after successful migration.
 * If a partial failure occurs, the migration version is NOT updated, so the next
 * launch will retry safely (all writes are upserts).
 */

import * as SecureStore from 'expo-secure-store';
import LocalCache from './LocalCache';
import TimeUtils from '../utils/TimeUtils';
import Logger from '../utils/Logger';

const CURRENT_MIGRATION_VERSION = 1;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build "YYYY-MM-DD" strings for the past N months (including current).
 * Used to enumerate all dates that could have real_hours_ keys.
 */
const _pastMonthDates = (monthsBack = 13) => {
  const dates = [];
  const now   = new Date();

  for (let m = 0; m < monthsBack; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const year  = d.getFullYear();
    const month = d.getMonth(); // 0-based
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      dates.push(
        `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      );
    }
  }

  return dates;
};

/**
 * Convert the legacy real_hours_ dict value (keyed by shiftIndex) to
 * an array of TimeEntry objects.
 *
 * Old format:
 *   { [shiftIndex]: { startTime, endTime, shiftId, shiftType, shiftTime, ... } }
 *
 * New format (TimeEntry):
 *   { shiftId, userId, date, monthKey, scheduledStart, scheduledEnd,
 *     actualStart, actualEnd, actualDurationMinutes, editedAt }
 */
const _convertLegacyDayEntries = (dateStr, userId, rawDict) => {
  const entries = [];
  const now = new Date().toISOString();
  const rawEntries = Object.entries(rawDict);

  for (let idx = 0; idx < rawEntries.length; idx++) {
    const [, entry] = rawEntries[idx];
    if (!entry?.startTime || !entry?.endTime) continue;

    // shiftId comes from the saved entry if available; otherwise build a stable fallback.
    // The index suffix prevents collisions when multiple shifts on the same day share
    // the same type and start time (e.g. two entries written in the same minute).
    const shiftId = entry.shiftId
      || `legacy_${dateStr}_${entry.shiftType || 'M'}_${entry.startTime}_${idx}`;

    // Parse scheduled times from the saved shiftTime string (e.g. "07:00 - 13:00 (M)")
    let scheduledStart = '';
    let scheduledEnd   = '';
    if (entry.shiftTime) {
      let parts = entry.shiftTime.split(' – ');
      if (parts.length !== 2) parts = entry.shiftTime.split(' - ');
      if (parts.length === 2) {
        scheduledStart = parts[0].replace(/\s*\([^)]*\)/, '').trim().replace('h', ':');
        scheduledEnd   = parts[1].replace(/\s*\([^)]*\)/, '').trim().replace('h', ':');
      }
    }

    const actualDurationMinutes =
      TimeUtils.calculateDurationMinutes(entry.startTime, entry.endTime) ?? 0;

    const registeredAt = entry.registeredAt || now;

    entries.push({
      shiftId,
      userId,
      date:                  dateStr,
      monthKey:              dateStr.slice(0, 7),  // "YYYY-MM"
      scheduledStart,
      scheduledEnd,
      actualStart:           entry.startTime,
      actualEnd:             entry.endTime,
      actualDurationMinutes,
      source:                'migrated',
      createdAt:             registeredAt,
      updatedAt:             now,
      editedAt:              registeredAt, // kept for backward compat with old readers
    });
  }

  return entries;
};

// ── Migration steps ───────────────────────────────────────────────────────────

/**
 * Step 1: Migrate all real_hours_{YYYY-MM-DD} SecureStore keys.
 * Groups entries by month, writes them to LocalCache, then deletes old keys.
 *
 * @param {number} userId
 */
const _migrateTimeEntries = async (userId) => {
  Logger.info('StorageMigration: migrating time entries...');

  const dates = _pastMonthDates(13);  // last ~13 months
  const byMonth = {};  // { "YYYY-MM": { [shiftId]: TimeEntry } }
  const migratedKeys = [];

  for (const dateStr of dates) {
    // Prefer per-user scoped key (current format) over legacy unscoped key.
    // A migration de outro usuário pode ter deletado a legada — neutralizar
    // o risco de absorver dados que não eram do usuário atual.
    const scopedKey = `real_hours_${userId}_${dateStr}`;
    const legacyKey = `real_hours_${dateStr}`;
    let raw;
    let key = scopedKey;
    try {
      raw = await SecureStore.getItemAsync(scopedKey);
      if (!raw) { raw = await SecureStore.getItemAsync(legacyKey); key = legacyKey; }
    } catch (_) {
      continue;
    }
    if (!raw) continue;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      Logger.warn(`StorageMigration: could not parse ${key}, skipping`);
      continue;
    }

    const monthKey = dateStr.slice(0, 7);
    if (!byMonth[monthKey]) byMonth[monthKey] = {};

    const converted = _convertLegacyDayEntries(dateStr, userId, parsed);
    for (const entry of converted) {
      byMonth[monthKey][entry.shiftId] = entry;
    }
    migratedKeys.push(key);
  }

  // Write all months to LocalCache
  for (const [monthKey, entries] of Object.entries(byMonth)) {
    const existing = (await LocalCache.getTimeEntries(userId, monthKey)) || {};
    // Merge: existing LocalCache entries win (they're more recent than legacy)
    const merged = { ...entries, ...existing };
    await LocalCache.saveTimeEntries(userId, monthKey, merged);
    Logger.info(`StorageMigration: ${Object.keys(merged).length} time entries written for ${monthKey}`);
  }

  // Delete old keys only after all writes succeed
  for (const key of migratedKeys) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (_) {
      // Non-fatal: the migration version won't be set until all steps pass
    }
  }

  Logger.info(`StorageMigration: migrated ${migratedKeys.length} real_hours_ keys`);
};

/**
 * Step 2: Migrate shift_configurations SecureStore key to LocalCache FinancialConfig.
 *
 * @param {number} userId
 */
const _migrateFinancialConfig = async (userId) => {
  Logger.info('StorageMigration: migrating financial config...');

  let raw;
  try {
    raw = await SecureStore.getItemAsync('shift_configurations');
  } catch (_) {
    return;
  }
  if (!raw) return;

  let legacy;
  try {
    legacy = JSON.parse(raw);
  } catch (_) {
    Logger.warn('StorageMigration: could not parse shift_configurations, skipping');
    return;
  }

  // Check if already migrated (don't overwrite a newer config)
  const existing = await LocalCache.getFinancialConfig(userId);
  if (existing && existing.version > 1) {
    Logger.info('StorageMigration: financial config already migrated (version > 1), skipping');
    return;
  }

  const now = new Date();
  const effectiveFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Normalize legacy bonus months (may be numeric 1-12, need "YYYY-MM")
  let bonus = legacy.bonus || { percentage: 0, startMonth: 1, endMonth: 12 };
  if (typeof bonus.startMonth === 'number') {
    bonus = {
      ...bonus,
      startMonth: `${now.getFullYear()}-${String(bonus.startMonth).padStart(2, '0')}`,
      endMonth:   `${now.getFullYear()}-${String(bonus.endMonth).padStart(2, '0')}`,
    };
  }

  const config = {
    userId,
    version:       1,
    effectiveFrom,
    hourValues:    legacy.hourValues || {
      weekday: { day: 130, night: 143 },
      weekend: { day: 170, night: 185 },
    },
    loyaltyEnabled:      legacy.loyaltyEnabled      || false,
    loyaltyOptions:      legacy.loyaltyOptions       || [],
    bonusEnabled:        legacy.bonusEnabled         || false,
    bonus,
    fridayNightAsWeekend: legacy.fridayNightAsWeekend || false,
    updatedAt:            new Date().toISOString(),
  };

  // skipDirtyMark: migration config writes must not dirty summaries at startup —
  // summaries don't exist yet on a fresh install, and on existing installs the
  // config is conceptually unchanged (just being normalized, not edited by user).
  await LocalCache.saveFinancialConfig(userId, config, { skipDirtyMark: true });
  Logger.info('StorageMigration: financial config migrated (version 1)');
  // Keep the old SecureStore key — it's still read by ShiftValueCalculator until
  // that module is refactored to read from LocalCache (future step).
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run all pending migrations for the given user.
 * Idempotent: safe to call on every app launch.
 *
 * @param {number} userId  - From AuthContext user.id
 * @returns {Promise<void>}
 */
export const runMigration = async (userId) => {
  if (!userId) {
    Logger.warn('StorageMigration: no userId, skipping');
    return;
  }

  const currentVersion = await LocalCache.getMigrationVersion(userId);
  if (currentVersion >= CURRENT_MIGRATION_VERSION) {
    Logger.info(`StorageMigration: already at v${currentVersion} for user ${userId}, nothing to do`);
    return;
  }

  Logger.info(`StorageMigration: running v${currentVersion} → v${CURRENT_MIGRATION_VERSION} for user ${userId}`);

  try {
    if (currentVersion < 1) {
      await _migrateTimeEntries(userId);
      await _migrateFinancialConfig(userId);
    }

    await LocalCache.setMigrationVersion(userId, CURRENT_MIGRATION_VERSION);
    Logger.info(`StorageMigration: completed successfully (v${CURRENT_MIGRATION_VERSION}) for user ${userId}`);
  } catch (err) {
    // Do NOT set migration version on failure — next launch will retry
    Logger.error('StorageMigration: failed, will retry on next launch:', err?.message);
  }
};
