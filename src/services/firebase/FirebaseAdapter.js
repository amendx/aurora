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

import { doc, setDoc, writeBatch } from './fdb';
import { db, functions } from './config';
import Logger from '../../utils/Logger';
import { makeLogEntry, appendLog, TRANSFER_LOG_TYPES } from '../../utils/shiftTransferLog';

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

  // Aura (IA do Aurora): persiste disponibilidade (bloqueios/folgas/regras).
  /** users/{userId}/settings/availability */
  saveAvailabilityConfig: (userId, config) =>
    _write(_sub(userId, 'settings', 'availability'), { ...config }),

  saveTodayCoworkers: (userId, shiftId, data) =>
    _write(_sub(userId, 'todayCoworkers', String(shiftId)), { ...data }),

  /**
   * Shadow-write a full month of normalized DaySchedules for a group.
   * groupSchedules/{groupId}/months/{YYYY-MM}                 ← month metadata
   * groupSchedules/{groupId}/months/{YYYY-MM}/days/{date}     ← one doc per day
   *
   * @param {string} groupId
   * @param {string} monthKey  "YYYY-MM"
   * @param {Object} days      { [dateStr]: DaySchedule }
   * @param {string} [syncedAt]
   */
  saveGroupScheduleMonth: async (groupId, monthKey, days, syncedAt) => {
    if (!db || !groupId || !monthKey || !days) return;
    const now = new Date().toISOString();
    const syncTs = syncedAt || now;
    try {
      await setDoc(
        doc(db, 'groupSchedules', String(groupId), 'months', monthKey),
        { groupId: String(groupId), monthKey, syncedAt: syncTs, _updatedAt: now },
        { merge: true }
      );
      const entries = Object.entries(days);
      if (entries.length === 0) return;
      const writes = entries.map(([dateStr, daySchedule]) => ({
        ref: doc(db, 'groupSchedules', String(groupId), 'months', monthKey, 'days', dateStr),
        data: { ...daySchedule, syncedAt: syncTs },
      }));
      await _writeBatched(writes, `saveGroupScheduleMonth/${groupId}/${monthKey}`);
    } catch (err) {
      Logger.warn(`[Firebase] saveGroupScheduleMonth [${groupId}/${monthKey}]: ${err?.message}`);
    }
  },

  /**
   * Aurora-native aggregation: build a group's DaySchedule month directly from
   * each member's own shift docs. No PlantaoAPI involved. Use this when an
   * aurora user opens "Meus grupos" and groupSchedules/* has no shadow-write yet.
   *
   * Reads:
   *   users/{currentUserId}/groupMembers/{groupId}    (1 doc — to get memberIds + person info)
   *   users/{memberId}/months/{monthKey}/shifts/*     (1 collection per member, parallel)
   *
   * Returns { [dateStr]: DaySchedule } where DaySchedule.slots[] has assignments
   * pivoted by (date, label first char). Capacity = filledCount; we don't know
   * vacancies from this path (Aurora has no native concept of "vacancy slot"
   * at the moment — that lives on webClient or `openings/`).
   */
  aggregateAuroraGroupSchedule: async (group, monthKey, currentUserId) => {
    if (!db || !group?.id || !monthKey || !currentUserId) return {};
    const groupId = String(group.id);
    try {
      const { collection, doc: _doc, getDoc, getDocs } = await import('./fdb');

      // 1. members of the group (from current user's view)
      const memSnap = await getDoc(_doc(db, 'users', String(currentUserId), 'groupMembers', groupId));
      const memData = memSnap.exists() ? memSnap.data() : null;
      const personsByUserId = {};
      for (const m of (memData?.members || [])) {
        const uid = String(m.id || m.userId || '');
        if (uid) personsByUserId[uid] = m;
      }
      // Drop admin/manager (canHaveShifts=false): nunca recebem escala — pular
      // a leitura paralela evita 1 round-trip por admin sem retorno.
      const rawIds = Array.isArray(memData?.memberIds) ? memData.memberIds : [];
      const memberIds = [...new Set([...rawIds.map(String), String(currentUserId)])]
        .filter(uid => {
          const p = personsByUserId[uid];
          return !p || (p.memberType !== 'manager' && p.canHaveShifts !== false);
        });

      if (memberIds.length === 0) return {};

      // 2. each member's shifts for the month, in parallel
      const days = {};
      await Promise.all(memberIds.map(async (memberId) => {
        const shiftsSnap = await getDocs(
          collection(db, 'users', memberId, 'months', String(monthKey), 'shifts')
        );
        shiftsSnap.forEach(d => {
          const shift = d.data();
          // Only consider shifts that belong to this group
          if (String(shift.group?.id) !== groupId) return;
          const date = shift.date || (shift.startISO || '').slice(0, 10);
          if (!date) return;

          if (!days[date]) {
            days[date] = {
              date,
              groupId,
              groupName: group.name || '',
              groupColor: group.color || '#888888',
              institution: group.institution || null,
              slots: [],
            };
          }

          const labelChar = (shift.label || '').charAt(0).toUpperCase();
          let slot = days[date].slots.find(s => s.label === labelChar);
          if (!slot) {
            const timeStr = shift.time
              || (shift.startTime && shift.endTime ? `${shift.startTime} – ${shift.endTime}` : null);
            slot = {
              label: labelChar,
              labelRaw: shift.rawLabel || shift.label || '',
              time: timeStr,
              capacity: 0,
              filledCount: 0,
              available: 0,
              vacancyId: null,
              assignments: [],
            };
            days[date].slots.push(slot);
          }

          const person = personsByUserId[memberId] || {};
          // council pode vir como objeto {state, id} da PlantaoAPI — coage pra string
          const councilStr = typeof person.council === 'string'
            ? person.council
            : (person.council?.state || person.council?.uf || '');
          // dedup: se a mesma userId já está nesse slot, não adiciona de novo
          if (slot.assignments.some(a => String(a.userId) === String(memberId))) return;
          slot.assignments.push({
            userId: memberId,
            source: 'aurora',
            person: {
              id: memberId,
              name: typeof person.name === 'string' ? person.name : (person.full_name || ''),
              full_name: typeof person.full_name === 'string' ? person.full_name : (person.name || ''),
              photo: typeof person.photo === 'string' ? person.photo : null,
              council: councilStr,
              role: typeof person.role === 'string' ? person.role : '',
            },
            shiftId: shift.id != null ? String(shift.id) : d.id,
            transactionId: null,
          });
          slot.filledCount += 1;
          slot.capacity += 1;
        });
      }));

      return days;
    } catch (err) {
      Logger.warn(`[Firebase] aggregateAuroraGroupSchedule [${groupId}/${monthKey}]: ${err?.message}`);
      return {};
    }
  },

  /**
   * Read a month of DaySchedules for a group from Firestore.
   * Returns { days: { [dateStr]: DaySchedule }, syncedAt, hasData }.
   * hasData is true only when the month metadata doc exists.
   */
  fetchGroupScheduleMonth: async (groupId, monthKey) => {
    const empty = { days: {}, syncedAt: null, hasData: false };
    if (!db || !groupId || !monthKey) return empty;
    try {
      const { collection, doc: _doc, getDoc, getDocs } = await import('./fdb');
      const [metaRes, daysRes] = await Promise.allSettled([
        getDoc(_doc(db, 'groupSchedules', String(groupId), 'months', monthKey)),
        getDocs(collection(db, 'groupSchedules', String(groupId), 'months', monthKey, 'days')),
      ]);
      const metaSnap = metaRes.status === 'fulfilled' ? metaRes.value : null;
      if (!metaSnap?.exists()) return empty;
      const meta = metaSnap.data() || {};
      const days = {};
      if (daysRes.status === 'fulfilled') {
        daysRes.value.forEach(d => { days[d.id] = d.data(); });
      } else {
        Logger.warn(`[Firebase] fetchGroupScheduleMonth/days [${groupId}/${monthKey}]: ${daysRes.reason?.message}`);
      }
      // authoritative = escrito pelo aurora-web (fonte da verdade). O app não
      // re-agrega nem sobrescreve quando true.
      return { days, syncedAt: meta.syncedAt || null, hasData: true, authoritative: meta.authoritative === true };
    } catch (err) {
      Logger.warn(`[Firebase] fetchGroupScheduleMonth [${groupId}/${monthKey}]: ${err?.message}`);
      return empty;
    }
  },

  /**
   * Realtime read for the web-authored group calendar projection.
   * Listens to groupSchedules/{groupId}/months/{monthKey}/days/* and emits the
   * full month map every time the coordinator updates the web schedule.
   */
  subscribeGroupScheduleMonth: (groupId, monthKey, onChange, onError) => {
    if (!db || !groupId || !monthKey) return () => {};
    let unsub = null;
    let cancelled = false;
    (async () => {
      try {
        const { collection, onSnapshot } = await import('./fdb');
        if (cancelled) return;
        unsub = onSnapshot(
          collection(db, 'groupSchedules', String(groupId), 'months', monthKey, 'days'),
          snap => {
            const days = {};
            let syncedAt = null;
            snap.forEach(d => {
              const data = d.data() || {};
              days[d.id] = data;
              if (data.syncedAt && (!syncedAt || data.syncedAt > syncedAt)) syncedAt = data.syncedAt;
            });
            onChange?.({ days, syncedAt, hasData: true, source: 'firestore-live' });
          },
          err => {
            Logger.warn(`[Firebase] subscribeGroupScheduleMonth [${groupId}/${monthKey}]: ${err?.message}`);
            onError?.(err);
          },
        );
      } catch (err) {
        Logger.warn(`[Firebase] subscribeGroupScheduleMonth/setup [${groupId}/${monthKey}]: ${err?.message}`);
        onError?.(err);
      }
    })();
    return () => {
      cancelled = true;
      if (typeof unsub === 'function') unsub();
    };
  },

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

  /**
   * Persist an Aurora-native opening to Firestore.
   * openings/{openingId}
   */
  saveOpening: (opening) => {
    if (!db || !opening?.id) return Promise.resolve();
    const ref = doc(db, 'openings', String(opening.id));
    return _write(ref, { ...opening });
  },

  /**
   * Claim a slot in an Aurora opening by flipping it inside the parent doc's
   * `slots` array (read-modify-write), then recomputing availableSlots/claimable/
   * status. This is what makes the opening leave the Vagas + "vagas criadas"
   * lists once full — they filter on the parent's status == 'active' / claimable.
   * Slots live on the parent doc (openings/{id}.slots[]), NOT in a subcollection.
   * Mirrors the web `assignInterest` Cloud Function.
   */
  claimSlot: async (openingId, slotId, userId) => {
    if (!db || !openingId || !slotId || !userId) return Promise.resolve();
    try {
      const { getDoc } = await import('./fdb');
      const ref = doc(db, 'openings', String(openingId));
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const data = snap.data() || {};
      const nowIso = new Date().toISOString();
      const slots = (Array.isArray(data.slots) ? data.slots : []).map(s =>
        String(s.slotId) === String(slotId) && s.status === 'open'
          ? { ...s, status: 'claimed', claimedByUserId: String(userId), claimedAt: nowIso }
          : s,
      );
      const available = slots.filter(s => s.status === 'open').length;
      return _write(ref, {
        slots,
        availableSlots: available,
        claimable: available > 0,
        // Don't resurrect a cancelled vaga; close it when no open slots remain.
        status: data.status === 'cancelled' ? 'cancelled' : (available > 0 ? 'active' : 'claimed'),
        updatedAt: nowIso,
      });
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] claimSlot: ${err.message}`);
    }
  },

  /**
   * Vaga de escala: registra/remove interesse de um médico numa opening.
   * Interests vivem no array `interests` do doc da opening; o escalista
   * escolhe remotamente entre os interessados.
   */
  // Interesses moram em openings/{id}/interests/{uid} (doc id = uid). A rule deixa
  // o médico criar/remover só o próprio; a LISTA só gestor/coord/admin lê.
  addOpeningInterest: async (openingId, interest) => {
    if (!db || !openingId || !interest?.userId) return Promise.resolve();
    try {
      const ref = doc(db, 'openings', String(openingId), 'interests', String(interest.userId));
      return _write(ref, {
        ...interest,
        userId: String(interest.userId),
        at: interest.at || new Date().toISOString(),
      }, false);
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] addOpeningInterest: ${err.message}`);
    }
  },

  removeOpeningInterest: async (openingId, userId) => {
    if (!db || !openingId || !userId) return Promise.resolve();
    try {
      const { deleteDoc } = await import('./fdb');
      return deleteDoc(doc(db, 'openings', String(openingId), 'interests', String(userId)));
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] removeOpeningInterest: ${err.message}`);
    }
  },

  /** O próprio interesse do médico (a rule permite ler só o seu). null se não houver. */
  getMyOpeningInterest: async (openingId, userId) => {
    if (!db || !openingId || !userId) return null;
    try {
      const { getDoc } = await import('./fdb');
      const snap = await getDoc(doc(db, 'openings', String(openingId), 'interests', String(userId)));
      return snap.exists() ? snap.data() : null;
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] getMyOpeningInterest: ${err.message}`);
      return null;
    }
  },

  /** Lista de interessados — só gestor/coord/admin consegue ler (senão a rule nega). */
  getOpeningInterests: async (openingId) => {
    if (!db || !openingId) return [];
    try {
      const { collection: _collection, getDocs } = await import('./fdb');
      const snap = await getDocs(_collection(db, 'openings', String(openingId), 'interests'));
      const out = [];
      snap.forEach(d => out.push({ id: d.id, ...d.data() }));
      return out;
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] getOpeningInterests: ${err.message}`);
      return [];
    }
  },

  /**
   * Query openings for a set of group IDs.
   * Returns raw Firestore docs — caller normalizes with fromFirestore().
   * openings/ where groupId in groupIds and status == 'active'
   */
  getOpeningsForGroups: async (groupIds) => {
    if (!db || !groupIds?.length) return [];
    try {
      const { collection, query, where, getDocs } = await import('./fdb');
      const chunks = [];
      for (let i = 0; i < groupIds.length; i += 10) {
        chunks.push(groupIds.slice(i, i + 10));
      }
      const results = [];
      for (const chunk of chunks) {
        const q = query(
          collection(db, 'openings'),
          where('group.id', 'in', chunk),
          where('status', '==', 'active'),
        );
        const snap = await getDocs(q);
        snap.forEach(d => results.push({ id: d.id, ...d.data() }));
      }
      return results;
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] getOpeningsForGroups: ${err.message}`);
      return [];
    }
  },

  // Cessões que EU criei — query por originUserId, sem filtro de grupo.
  // Necessário porque o user pode ter cedido um plantão de grupo webClient
  // que não está mais em groupIds dele (modo aurora-only). Sem essa query
  // separada, ele não veria as próprias cessões pra cancelar.
  getMyOpenings: async (userId) => {
    if (!db || !userId) return [];
    try {
      const { collection, query, where, getDocs } = await import('./fdb');
      const q = query(
        collection(db, 'openings'),
        where('originUserId', '==', String(userId)),
        where('status', '==', 'active'),
      );
      const snap = await getDocs(q);
      const results = [];
      snap.forEach(d => results.push({ id: d.id, ...d.data() }));
      return results;
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] getMyOpenings: ${err.message}`);
      return [];
    }
  },

  // ── Ceder / Trocar — offers and swaps ──────────────────────────────────────

  /** shiftOffers/{offerId} */
  createOffer: (offer) => {
    if (!db || !offer?.id) return Promise.resolve();
    return _write(doc(db, 'shiftOffers', String(offer.id)), { ...offer }, false);
  },

  /** Update an existing offer's status (accept/reject/cancel/expire). */
  respondOffer: (offerId, patch) => {
    if (!db || !offerId) return Promise.resolve();
    return _write(doc(db, 'shiftOffers', String(offerId)), {
      ...patch,
      respondedAt: patch.respondedAt || new Date().toISOString(),
    });
  },

  cancelOffer: (offerId) => {
    if (!db || !offerId) return Promise.resolve();
    return _write(doc(db, 'shiftOffers', String(offerId)), {
      status: 'cancelled',
      respondedAt: new Date().toISOString(),
    });
  },

  /** Query pending offers either sent to OR from a user.
   *  Uses single-field where() to avoid Firestore composite-index requirement;
   *  status is filtered client-side.
   */
  getPendingOffersForUser: async (userId) => {
    if (!db || !userId) return [];
    try {
      const { collection, query, where, getDocs } = await import('./fdb');
      const uid = String(userId);
      const [snapTo, snapFrom] = await Promise.all([
        getDocs(query(collection(db, 'shiftOffers'), where('toUserId', '==', uid))),
        getDocs(query(collection(db, 'shiftOffers'), where('fromUserId', '==', uid))),
      ]);
      const out = [];
      const seen = new Set();
      const add = (d) => {
        if (seen.has(d.id)) return;
        const data = d.data();
        if (data?.status !== 'pending') return;
        seen.add(d.id);
        out.push({ id: d.id, ...data });
      };
      snapTo.forEach(add);
      snapFrom.forEach(add);
      Logger.info(`[FirebaseAdapter] getPendingOffersForUser(${uid}) → ${out.length} pending`);
      return out;
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] getPendingOffersForUser FAILED: ${err.code || ''} ${err.message}`);
      return [];
    }
  },

  /** shiftSwaps/{swapId} */
  createSwap: (swap) => {
    if (!db || !swap?.id) return Promise.resolve();
    return _write(doc(db, 'shiftSwaps', String(swap.id)), { ...swap }, false);
  },

  respondSwap: (swapId, patch) => {
    if (!db || !swapId) return Promise.resolve();
    return _write(doc(db, 'shiftSwaps', String(swapId)), {
      ...patch,
      respondedAt: patch.respondedAt || new Date().toISOString(),
    });
  },

  cancelSwap: (swapId) => {
    if (!db || !swapId) return Promise.resolve();
    return _write(doc(db, 'shiftSwaps', String(swapId)), {
      status: 'cancelled',
      respondedAt: new Date().toISOString(),
    });
  },

  /**
   * Read full ceder/swap history for a user (everything except pending).
   * Returns a unified, date-desc list with `__kind` ('offer' | 'swap') for the
   * Histórico screen. Filters by status client-side to avoid composite indexes.
   */
  getHistoryForUser: async (userId) => {
    if (!db || !userId) return [];
    try {
      const { collection, query, where, getDocs } = await import('./fdb');
      const uid = String(userId);
      const [offFrom, offTo, swInit, swTarg] = await Promise.all([
        getDocs(query(collection(db, 'shiftOffers'), where('fromUserId', '==', uid))),
        getDocs(query(collection(db, 'shiftOffers'), where('toUserId',   '==', uid))),
        getDocs(query(collection(db, 'shiftSwaps'),  where('initiatorUserId', '==', uid))),
        getDocs(query(collection(db, 'shiftSwaps'),  where('targetUserId',    '==', uid))),
      ]);
      const seen = new Set();
      const out = [];
      const add = (kind, d) => {
        if (seen.has(d.id)) return;
        seen.add(d.id);
        const data = d.data();
        if (data?.status && data.status !== 'pending') out.push({ __kind: kind, id: d.id, ...data });
      };
      offFrom.forEach(d => add('offer', d));
      offTo.forEach(d => add('offer', d));
      swInit.forEach(d => add('swap', d));
      swTarg.forEach(d => add('swap', d));
      out.sort((a, b) => {
        const ta = a.respondedAt || a.createdAt || '';
        const tb = b.respondedAt || b.createdAt || '';
        return tb.localeCompare(ta);
      });
      return out;
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] getHistoryForUser: ${err.message}`);
      return [];
    }
  },

  getPendingSwapsForUser: async (userId) => {
    if (!db || !userId) return [];
    try {
      const { collection, query, where, getDocs } = await import('./fdb');
      const uid = String(userId);
      const [snapTarget, snapInitiator] = await Promise.all([
        getDocs(query(collection(db, 'shiftSwaps'), where('targetUserId', '==', uid))),
        getDocs(query(collection(db, 'shiftSwaps'), where('initiatorUserId', '==', uid))),
      ]);
      const out = [];
      const seen = new Set();
      const add = (d) => {
        if (seen.has(d.id)) return;
        const data = d.data();
        if (data?.status !== 'pending') return;
        seen.add(d.id);
        out.push({ id: d.id, ...data });
      };
      snapTarget.forEach(add);
      snapInitiator.forEach(add);
      Logger.info(`[FirebaseAdapter] getPendingSwapsForUser(${uid}) → ${out.length} pending swaps`);
      return out;
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] getPendingSwapsForUser FAILED: ${err.code || ''} ${err.message}`);
      return [];
    }
  },

  /**
   * Bulk check: pra cada uid recebido, retorna Set<string> com os que são
   * aurora-capable (source==='aurora' OU auroraOnlyMode===true em users/{uid}).
   * Usado pelo TrocarFlowSheet pra desabilitar colegas que ainda não migraram —
   * trocas exigem que o target consiga ler shiftSwaps do Firestore.
   */
  getAuroraCapableUsers: async (uids) => {
    if (!db || !Array.isArray(uids) || uids.length === 0) return new Set();
    try {
      const { doc, getDoc } = await import('./fdb');
      const unique = Array.from(new Set(uids.map(u => String(u)).filter(Boolean)));
      const results = await Promise.all(
        unique.map(uid =>
          getDoc(doc(db, 'users', uid))
            .then(snap => {
              if (!snap.exists()) return null;
              const data = snap.data() || {};
              return (data.source === 'aurora' || data.auroraOnlyMode === true) ? uid : null;
            })
            .catch(() => null)
        )
      );
      return new Set(results.filter(Boolean));
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] getAuroraCapableUsers: ${err.message}`);
      return new Set();
    }
  },

  /**
   * Hydrate aurora groups + memberships + persons (coworkers) from Firestore.
   * Aurora users have no PlantaoAPI source for any of these — the data lives
   * only in users/{uid}/groups, users/{uid}/groupMembers and users/{uid}/persons.
   *
   * Returns:
   *   {
   *     groups:           Array<Group>,
   *     membersByGroupId: { [groupId]: Array<{ userId, name, photo, council }> },
   *     persons:          { [personId]: Person }
   *   }
   */
  fetchAuroraGroupMembers: async (userId) => {
    if (!db || !userId) return { groups: [], membersByGroupId: {}, persons: {} };
    const { collection, getDocs } = await import('./fdb');
    const [grpSnap, memSnap, perSnap] = await Promise.allSettled([
      getDocs(collection(db, 'users', String(userId), 'groups')),
      getDocs(collection(db, 'users', String(userId), 'groupMembers')),
      getDocs(collection(db, 'users', String(userId), 'persons')),
    ]);
    const groups = [];
    if (grpSnap.status === 'fulfilled') {
      grpSnap.value.forEach(d => groups.push({ id: d.id, ...d.data() }));
    } else {
      Logger.warn(`[FirebaseAdapter] fetchAuroraGroupMembers/groups [${userId}]: ${grpSnap.reason?.message}`);
    }
    const membersByGroupId = {};
    if (memSnap.status === 'fulfilled') {
      memSnap.value.forEach(d => {
        const data = d.data() || {};
        if (Array.isArray(data.members)) membersByGroupId[d.id] = data.members;
      });
    } else {
      Logger.warn(`[FirebaseAdapter] fetchAuroraGroupMembers/members [${userId}]: ${memSnap.reason?.message}`);
    }
    const persons = {};
    if (perSnap.status === 'fulfilled') {
      perSnap.value.forEach(d => { persons[d.id] = { id: d.id, ...d.data() }; });
    } else {
      Logger.warn(`[FirebaseAdapter] fetchAuroraGroupMembers/persons [${userId}]: ${perSnap.reason?.message}`);
    }
    return { groups, membersByGroupId, persons };
  },

  /**
   * Hydrate an aurora user's month from Firestore.
   * Returns { manualShifts, regularShifts } — manual = self-created, regular =
   * received via cede/swap or coordinator opening. Both paths are needed because
   * aurora users have no PlantaoAPI backing; Firestore is the source of truth.
   *
   * Paths read:
   *   users/{uid}/manualShifts/*           ← filtered to monthKey
   *   users/{uid}/months/{mk}/shifts/*     ← all = regular for aurora users
   */
  fetchAuroraMonth: async (userId, monthKey) => {
    const empty = { manualShifts: [], regularShifts: [], manualAuthoritative: false, regularAuthoritative: false };
    if (!db || !userId || !monthKey) return empty;
    const { collection, getDocs } = await import('./fdb');
    // allSettled — one path failing (e.g. permission gap) must not zero out the other.
    const [manualRes, regularRes] = await Promise.allSettled([
      getDocs(collection(db, 'users', String(userId), 'manualShifts')),
      getDocs(collection(db, 'users', String(userId), 'months', String(monthKey), 'shifts')),
    ]);
    const manualShifts = [];
    const manualAuthoritative = manualRes.status === 'fulfilled';
    if (manualAuthoritative) {
      manualRes.value.forEach(d => {
        const data = d.data();
        if (data?.monthKey === monthKey) manualShifts.push({ id: d.id, ...data });
      });
    } else {
      Logger.warn(`[FirebaseAdapter] fetchAuroraMonth/manual [${userId}/${monthKey}]: ${manualRes.reason?.message}`);
    }
    const regularShifts = [];
    const regularAuthoritative = regularRes.status === 'fulfilled';
    if (regularAuthoritative) {
      regularRes.value.forEach(d => regularShifts.push({ id: d.id, ...d.data() }));
    } else {
      Logger.warn(`[FirebaseAdapter] fetchAuroraMonth/regular [${userId}/${monthKey}]: ${regularRes.reason?.message}`);
    }
    return { manualShifts, regularShifts, manualAuthoritative, regularAuthoritative };
  },

  /**
   * Hydrate a webClient user's past month from Firestore.
   * Reads month metadata + per-shift docs + summary, then rebuilds the
   * daysWithShifts structure ShiftsContext expects, plus the cached summary.
   *
   * Returns { daysWithShifts, syncedAt, summary, hasData }. `hasData` is true
   * only when the month metadata doc exists — used by the caller to decide
   * whether to skip the API fetch entirely.
   */
  fetchWebClientMonth: async (userId, monthKey) => {
    const empty = { daysWithShifts: [], syncedAt: null, summary: null, hasData: false };
    if (!db || !userId || !monthKey) return empty;
    try {
      const { collection, doc: _doc, getDoc, getDocs } = await import('./fdb');
      const [metaRes, shiftsRes, summaryRes] = await Promise.allSettled([
        getDoc(_doc(db, 'users', String(userId), 'months', monthKey)),
        getDocs(collection(db, 'users', String(userId), 'months', monthKey, 'shifts')),
        getDoc(_doc(db, 'users', String(userId), 'months', monthKey, 'summary', 'current')),
      ]);

      const metaSnap = metaRes.status === 'fulfilled' ? metaRes.value : null;
      if (!metaSnap?.exists()) return empty;
      const meta = metaSnap.data() || {};

      const byDate = {};
      if (shiftsRes.status === 'fulfilled') {
        shiftsRes.value.forEach(d => {
          const data = d.data() || {};
          const date = data.date;
          if (!date) return;
          if (!byDate[date]) {
            const dt = new Date(date + 'T00:00:00');
            byDate[date] = { day: dt.getDate(), date, shiftsCount: 0, shifts: [], originalData: null };
          }
          byDate[date].shifts.push({ id: d.id, ...data });
          byDate[date].shiftsCount++;
        });
      } else {
        Logger.warn(`[FirebaseAdapter] fetchWebClientMonth/shifts [${userId}/${monthKey}]: ${shiftsRes.reason?.message}`);
      }
      const daysWithShifts = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

      const summary = summaryRes.status === 'fulfilled' && summaryRes.value.exists()
        ? summaryRes.value.data()
        : null;

      return {
        daysWithShifts,
        syncedAt: meta.syncedAt || null,
        summary,
        hasData: true,
      };
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] fetchWebClientMonth [${userId}/${monthKey}]: ${err?.message}`);
      return empty;
    }
  },

  /**
   * Read a user's upcoming shifts across a list of month keys.
   * Used by Trocar to surface the target's swappable shifts.
   */
  getUserShiftsForMonths: async (userId, monthKeys) => {
    if (!db || !userId || !monthKeys?.length) {
      Logger.warn(`[FirebaseAdapter] getUserShiftsForMonths early-return: db=${!!db} userId=${userId} months=${monthKeys?.length}`);
      return [];
    }
    try {
      const { collection, getDocs } = await import('./fdb');
      const out = [];
      for (const mk of monthKeys) {
        const path = `users/${String(userId)}/months/${String(mk)}/shifts`;
        const t0 = Date.now();
        const snap = await getDocs(collection(db, 'users', String(userId), 'months', String(mk), 'shifts'));
        Logger.info(`[FirebaseAdapter] read ${path} → ${snap.size} docs in ${Date.now() - t0}ms`);
        snap.forEach(d => out.push({ id: d.id, monthKey: mk, ...d.data() }));
      }
      return out;
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] getUserShiftsForMonths(${userId}) FAILED: ${err.code || ''} ${err.message}`);
      return [];
    }
  },

  /**
   * Delete a single shift from a user's month/shifts subcollection.
   * Used when a cede-backed opening is claimed — origin shift must be removed.
   */
  deleteUserShift: async (userId, monthKey, shiftId) => {
    if (!db || !userId || !monthKey || !shiftId) return Promise.resolve();
    try {
      const { deleteDoc } = await import('./fdb');
      await deleteDoc(_sub(userId, 'months', monthKey, 'shifts', String(shiftId)));
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] deleteUserShift: ${err.message}`);
    }
  },

  /**
   * Remove a shift from BOTH the monthly path and the manualShifts path in one
   * atomic batch. Used by Ceder, which doesn't know which bucket the shift
   * originally lived in. delete is a no-op when a doc is absent.
   */
  removeUserShiftFull: async (userId, monthKey, shiftId) => {
    if (!db || !userId || !monthKey || !shiftId) return { success: false };
    try {
      const batch = writeBatch(db);
      batch.delete(_sub(userId, 'months', monthKey, 'shifts', String(shiftId)));
      batch.delete(_sub(userId, 'manualShifts', String(shiftId)));
      await batch.commit();
      return { success: true };
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] removeUserShiftFull: ${err.message}`);
      return { success: false };
    }
  },

  /**
   * Restore a previously-removed shift (used when the holder cancels a cede
   * opening before anyone claims). Writes to the monthly path; if the snapshot
   * was originally manual, also re-writes to the manualShifts path.
   */
  restoreUserShift: async (userId, monthKey, shift) => {
    if (!db || !userId || !monthKey || !shift?.id) return { success: false };
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      batch.set(_sub(userId, 'months', monthKey, 'shifts', String(shift.id)), {
        ..._stripShift(shift),
        _updatedAt: now,
      }, { merge: true });
      if (shift.isManual) {
        batch.set(_sub(userId, 'manualShifts', String(shift.id)), {
          ..._stripShift(shift),
          _updatedAt: now,
        }, { merge: true });
      }
      await batch.commit();
      return { success: true };
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] restoreUserShift: ${err.message}`);
      return { success: false };
    }
  },

  // ── Atomic shift transfer / swap ───────────────────────────────────────────

  /**
   * Atomically move a shift from one user's calendar to another's.
   * Uses Firestore writeBatch: delete origin + write destination in one commit.
   * Returns the new shift id (caller mirrors to LocalCache).
   */
  transferShift: async (fromUserId, toUserId, shift, opts = {}) => {
    if (!db || !fromUserId || !toUserId || !shift?.id || !shift?.monthKey) {
      return { success: false, newShiftId: null };
    }
    try {
      const newId = `received_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const batch = writeBatch(db);
      const fromRef       = _sub(fromUserId, 'months', shift.monthKey, 'shifts', String(shift.id));
      const fromManualRef = _sub(fromUserId, 'manualShifts', String(shift.id));
      const toRef         = _sub(toUserId,   'months', shift.monthKey, 'shifts', newId);
      const now = new Date().toISOString();
      batch.delete(fromRef);
      // Origin may have lived in manualShifts (aurora-created). delete is a no-op when absent.
      batch.delete(fromManualRef);
      // Escalista vs Efetivo (ver Glossário em models/index.js):
      //  - Plantão FIXO: escalistaUserId NÃO muda (dono original da escala).
      //    Só o currentHolderUserId vai pro destinatário (= toUserId).
      //  - Plantão NÃO-fixo: ambos (escalista + currentHolder) vão pro destinatário.
      const isFixed = shift?.isFixedSchedule === true;
      const originalEscalista = shift?.escalistaUserId || String(fromUserId);
      const nextLog = appendLog(shift?.transferLog, makeLogEntry({
        type: TRANSFER_LOG_TYPES.CEDE,
        fromUserId, fromUserName: opts.fromUserName || shift?.originUserName || null,
        toUserId,   toUserName:   opts.toUserName || null,
        actorUserId: opts.actorUserId || toUserId,
        openingId: opts.openingId,
      }));
      batch.set(toRef, {
        ..._stripShift(shift),
        id: newId,
        userId: toUserId,
        currentHolderUserId: String(toUserId),
        escalistaUserId: isFixed ? originalEscalista : String(toUserId),
        source: 'received',
        // Destinatário não herda a flag isFixedSchedule do shift transferido
        // (só o escalista original "é" fixo). Registra que a ORIGEM era fixa.
        isFixedSchedule: false,
        isFixedSchedule_origin: isFixed,
        originUserId: String(fromUserId),
        originUserName: opts.fromUserName || shift?.originUserName || null,
        originalShiftId: String(shift.id),
        transferredAt: now,
        transferLog: nextLog,
        cededAt: now,
        _updatedAt: now,
      });
      await batch.commit();
      return { success: true, newShiftId: newId };
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] transferShift: ${err.message}`);
      return { success: false, newShiftId: null };
    }
  },

  /**
   * Atomically swap two shifts between two users.
   * 4 ops in one batch: delete A's, delete B's, write A→B's slot, write B→A's slot.
   */
  swapShifts: async (uidA, uidB, shiftA, shiftB, opts = {}) => {
    if (!db || !uidA || !uidB || !shiftA?.id || !shiftB?.id) {
      return { success: false };
    }
    try {
      const newIdForB = `received_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newIdForA = `received_${Date.now()}_${Math.random().toString(36).slice(2, 7)}a`;
      const batch = writeBatch(db);
      const now = new Date().toISOString();

      // Delete originals from both the monthly path and the manualShifts path
      // (origin may have been aurora-manual). delete is a no-op when doc absent.
      batch.delete(_sub(uidA, 'months', shiftA.monthKey, 'shifts', String(shiftA.id)));
      batch.delete(_sub(uidB, 'months', shiftB.monthKey, 'shifts', String(shiftB.id)));
      batch.delete(_sub(uidA, 'manualShifts', String(shiftA.id)));
      batch.delete(_sub(uidB, 'manualShifts', String(shiftB.id)));

      // Escalista vs Efetivo — mesma regra do transferShift, agora dos 2 lados.
      const isFixedA = shiftA?.isFixedSchedule === true;
      const isFixedB = shiftB?.isFixedSchedule === true;
      const escA = shiftA?.escalistaUserId || String(uidA);
      const escB = shiftB?.escalistaUserId || String(uidB);

      const logA = appendLog(shiftA?.transferLog, makeLogEntry({
        type: TRANSFER_LOG_TYPES.SWAP,
        fromUserId: uidA, fromUserName: opts.uidAName || shiftA?.originUserName || null,
        toUserId: uidB,   toUserName:   opts.uidBName || null,
        actorUserId: opts.actorUserId || uidB,
      }));
      const logB = appendLog(shiftB?.transferLog, makeLogEntry({
        type: TRANSFER_LOG_TYPES.SWAP,
        fromUserId: uidB, fromUserName: opts.uidBName || shiftB?.originUserName || null,
        toUserId: uidA,   toUserName:   opts.uidAName || null,
        actorUserId: opts.actorUserId || uidB,
      }));

      // Shift A → B's calendar
      batch.set(_sub(uidB, 'months', shiftA.monthKey, 'shifts', newIdForB), {
        ..._stripShift(shiftA),
        id: newIdForB,
        userId: uidB,
        currentHolderUserId: String(uidB),
        // FIXO: escalista original mantido. NÃO-fixo: escalista vira o destinatário.
        escalistaUserId: isFixedA ? escA : String(uidB),
        source: 'received',
        isFixedSchedule: false,
        isFixedSchedule_origin: isFixedA,
        originUserId: String(uidA),
        originUserName: opts.uidAName || shiftA?.originUserName || null,
        originalShiftId: String(shiftA.id),
        transferredAt: now,
        transferLog: logA,
        cededAt: now,
        _updatedAt: now,
      });

      // Shift B → A's calendar
      batch.set(_sub(uidA, 'months', shiftB.monthKey, 'shifts', newIdForA), {
        ..._stripShift(shiftB),
        id: newIdForA,
        userId: uidA,
        currentHolderUserId: String(uidA),
        escalistaUserId: isFixedB ? escB : String(uidA),
        source: 'received',
        isFixedSchedule: false,
        isFixedSchedule_origin: isFixedB,
        originUserId: String(uidB),
        originUserName: opts.uidBName || shiftB?.originUserName || null,
        originalShiftId: String(shiftB.id),
        transferredAt: now,
        transferLog: logB,
        cededAt: now,
        _updatedAt: now,
      });

      await batch.commit();
      return { success: true, newIdForA, newIdForB };
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] swapShifts: ${err.message}`);
      return { success: false };
    }
  },

  /**
   * Devolve um shift recebido pro originUserId. Atómico:
   *   - delete do currentHolder (months + manualShifts)
   *   - write no originUser side (months + manualShifts) com source='aurora',
   *     origin* limpos, currentHolderUserId=originUser, isManual=true,
   *     transferLog herda + entry 'devolução', cededAt=null (sem nova janela).
   *
   * Permitido só dentro da janela de 2h pós-aceitação — caller verifica.
   */
  devolveShift: async (currentHolderUserId, shift, opts = {}) => {
    if (!db || !currentHolderUserId || !shift?.id || !shift?.monthKey || !shift?.originUserId) {
      return { success: false, newShiftId: null };
    }
    try {
      const originUserId = String(shift.originUserId);
      const newId = `devolvido_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toISOString();
      const batch = writeBatch(db);

      // Remove do currentHolder
      batch.delete(_sub(currentHolderUserId, 'months', shift.monthKey, 'shifts', String(shift.id)));
      batch.delete(_sub(currentHolderUserId, 'manualShifts', String(shift.id)));

      const nextLog = appendLog(shift?.transferLog, makeLogEntry({
        type: TRANSFER_LOG_TYPES.DEVOLUTION,
        fromUserId: currentHolderUserId,
        fromUserName: opts.fromUserName || null,
        toUserId: originUserId,
        toUserName: opts.toUserName || shift?.originUserName || null,
        actorUserId: opts.actorUserId || currentHolderUserId,
      }));

      // Devolvido volta como manualShift do originUser — tratamento neutro:
      // shift volta sob controle pleno dele e pode ser cedido novamente.
      const restored = {
        ..._stripShift(shift),
        id: newId,
        userId: originUserId,
        source: 'aurora',
        isManual: true,
        currentHolderUserId: originUserId,
        // Limpa origin pra evitar mostrar "Recebido de X" no DayView.
        originUserId: null,
        originUserName: null,
        openingId: null,
        // Mantém originalShiftId pra rastreabilidade — não atrapalha o display.
        transferLog: nextLog,
        cededAt: null,
        transferredAt: now,
        _updatedAt: now,
      };
      batch.set(_sub(originUserId, 'months', shift.monthKey, 'shifts', newId), restored);
      batch.set(_sub(originUserId, 'manualShifts', newId), restored);

      await batch.commit();
      return { success: true, newShiftId: newId };
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] devolveShift: ${err.message}`);
      return { success: false, newShiftId: null };
    }
  },

  // [WEBCLIENT-BRIDGE] — remove when webClient is fully retired.
  /**
   * Snapshot do grafo webClient (groups + persons + memberships) num namespace
   * SEPARADO do aurora — `users/{uid}/webClientArchive/{kind}/{id}` — pra que:
   *   1. O caminho aurora (users/{uid}/groups, /persons, /groupMembers) continue
   *      contendo SÓ grupos aurora reais. Aurora-only mode mostra só esses.
   *   2. Os plantões snapshotados ainda tenham referência rica de grupo/colegas
   *      pra exibição (consultando o archive como fallback) — não somem.
   *   3. Trocar/ceder funciona só com grupos do path aurora (não do archive).
   */
  snapshotWebClientGraph: async (uid, { groups, coworkers, membersByGroupId }) => {
    if (!db || !uid) return { success: true, groups: 0, persons: 0, memberships: 0 };
    try {
      const now = new Date().toISOString();
      const groupList = Object.values(groups || {});
      const coworkerMap = coworkers || {};
      const mbgi = membersByGroupId || {};
      const ARCHIVE_BASE = ['webClientArchive']; // users/{uid}/webClientArchive/...

      // 1) groups → users/{uid}/webClientArchive/groups/{gid}
      if (groupList.length) {
        const CHUNK = 400;
        for (let i = 0; i < groupList.length; i += CHUNK) {
          const slice = groupList.slice(i, i + CHUNK);
          const batch = writeBatch(db);
          for (const g of slice) {
            if (!g?.id) continue;
            batch.set(
              _sub(uid, ...ARCHIVE_BASE, 'groups', String(g.id)),
              { ...g, _updatedAt: now, _archived: true },
              { merge: true }
            );
          }
          await batch.commit();
        }
      }

      // 2) persons → users/{uid}/webClientArchive/persons/{pid}
      const personEntries = Object.entries(coworkerMap).filter(([pid]) => pid);
      if (personEntries.length) {
        const CHUNK = 400;
        for (let i = 0; i < personEntries.length; i += CHUNK) {
          const slice = personEntries.slice(i, i + CHUNK);
          const batch = writeBatch(db);
          for (const [pid, p] of slice) {
            batch.set(
              _sub(uid, ...ARCHIVE_BASE, 'persons', String(pid)),
              { ...p, id: String(pid), _updatedAt: now, _archived: true },
              { merge: true }
            );
          }
          await batch.commit();
        }
      }

      // 3) groupMembers → users/{uid}/webClientArchive/groupMembers/{gid}
      // Archive não precisa mergear cross-source: é fonte única do webClient.
      const membershipEntries = Object.entries(mbgi);
      if (membershipEntries.length) {
        const CHUNK = 400;
        for (let i = 0; i < membershipEntries.length; i += CHUNK) {
          const slice = membershipEntries.slice(i, i + CHUNK);
          const batch = writeBatch(db);
          for (const [gid, list] of slice) {
            const memberIds = [];
            const members = [];
            for (const m of (list || [])) {
              const pid = String(m?.userId || m?.id || '');
              if (!pid) continue;
              const person = coworkerMap[pid] || {};
              memberIds.push(pid);
              members.push({
                userId: pid,
                name: person.name || m.name || '',
                photo: person.photo || m.photo || null,
                role: person.role || m.role || 'Médico',
                council: person.council || m.council || '',
                memberType: m.memberType || 'member',
              });
            }
            batch.set(
              _sub(uid, ...ARCHIVE_BASE, 'groupMembers', String(gid)),
              {
                userId: String(uid),
                groupId: String(gid),
                memberIds,
                members,
                syncedAt: now,
                _updatedAt: now,
                _archived: true,
              },
              { merge: true }
            );
          }
          await batch.commit();
        }
      }

      return {
        success: true,
        groups: groupList.length,
        persons: personEntries.length,
        memberships: membershipEntries.length,
      };
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] snapshotWebClientGraph: ${err.message}`);
      return { success: false, error: err.message };
    }
  },

  // [WEBCLIENT-BRIDGE] — remove when webClient is fully retired.
  /**
   * Lê o archive webClient (groups + persons) só pra fins de exibição:
   * quando um plantão snapshotado em aurora-only referencia um grupo/colega
   * que não existe no path aurora, a UI cai aqui pra recuperar nome/hospital.
   */
  fetchWebClientArchive: async (uid) => {
    if (!db || !uid) return { groups: {}, persons: {} };
    try {
      const { collection, getDocs } = await import('./fdb');
      const [gSnap, pSnap] = await Promise.allSettled([
        getDocs(collection(db, 'users', String(uid), 'webClientArchive', 'groups')),
        getDocs(collection(db, 'users', String(uid), 'webClientArchive', 'persons')),
      ]);
      const groups = {};
      const persons = {};
      if (gSnap.status === 'fulfilled') gSnap.value.forEach(d => { groups[d.id] = { id: d.id, ...d.data() }; });
      if (pSnap.status === 'fulfilled') pSnap.value.forEach(d => { persons[d.id] = { id: d.id, ...d.data() }; });
      return { groups, persons };
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] fetchWebClientArchive: ${err.message}`);
      return { groups: {}, persons: {} };
    }
  },

  // [WEBCLIENT-BRIDGE] — remove when webClient is fully retired.
  /**
   * Snapshot all webClient-origin shifts of a user into Firestore as source:'aurora',
   * so the app can stop reading from PlantaoAPI for this user (aurora-only mode).
   * Idempotent: same shift.id reused; safe to re-run to refresh from latest webClient data.
   */
  snapshotWebClientToAurora: async (uid, shifts) => {
    if (!db || !uid || !Array.isArray(shifts) || shifts.length === 0) {
      return { success: true, written: 0 };
    }
    try {
      const now = new Date().toISOString();
      // Firestore batch limit is 500. Chunk if needed.
      const CHUNK = 400;
      let written = 0;
      for (let i = 0; i < shifts.length; i += CHUNK) {
        const slice = shifts.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        for (const sh of slice) {
          if (!sh?.id || !sh?.monthKey) continue;
          const ref = _sub(uid, 'months', sh.monthKey, 'shifts', String(sh.id));
          batch.set(ref, {
            ..._stripShift(sh),
            id: String(sh.id),
            userId: String(uid),
            source: 'aurora',
            snapshotFromWebClient: true,
            _updatedAt: now,
          }, { merge: true });
          written++;
        }
        await batch.commit();
      }
      return { success: true, written };
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] snapshotWebClientToAurora: ${err.message}`);
      return { success: false, error: err.message };
    }
  },

  // ── Swap auctions (Trocar aberto ao grupo) ─────────────────────────────────

  /** swapAuctions/{auctionId} */
  createSwapAuction: (auction) => {
    if (!db || !auction?.id) return Promise.resolve();
    return _write(doc(db, 'swapAuctions', String(auction.id)), { ...auction }, false);
  },

  cancelSwapAuction: (auctionId) => {
    if (!db || !auctionId) return Promise.resolve();
    return _write(doc(db, 'swapAuctions', String(auctionId)), {
      status: 'cancelled',
      respondedAt: new Date().toISOString(),
    });
  },

  // Auto-expire: leilão cujo expiresAt (= startISO do plantão ofertado) passou
  // e ainda está open. Disparado em background pelo SwapAuctionsContext.refresh.
  expireSwapAuction: (auctionId) => {
    if (!db || !auctionId) return Promise.resolve();
    return _write(doc(db, 'swapAuctions', String(auctionId)), {
      status: 'expired',
      expiredAt: new Date().toISOString(),
    });
  },

  /** swapAuctions/{auctionId}/bids/{bidId} */
  submitBid: (auctionId, bid) => {
    if (!db || !auctionId || !bid?.id) return Promise.resolve();
    return _write(doc(db, 'swapAuctions', String(auctionId), 'bids', String(bid.id)), { ...bid }, false);
  },

  withdrawBid: (auctionId, bidId) => {
    if (!db || !auctionId || !bidId) return Promise.resolve();
    return _write(doc(db, 'swapAuctions', String(auctionId), 'bids', String(bidId)), {
      status: 'withdrawn',
      respondedAt: new Date().toISOString(),
    });
  },

  /**
   * Accept a bid: atomically swap shifts between initiator and bidder, mark this
   * auction as matched, and reject sibling bids.
   * Returns { success, newIdForInitiator, newIdForBidder } when both shifts have valid ids.
   */
  acceptBid: async (auctionId, bidId, initiatorUserId, bidderUserId, shiftA, shiftB) => {
    if (!db || !auctionId || !bidId || !initiatorUserId || !bidderUserId || !shiftA?.id || !shiftB?.id) {
      return { success: false };
    }
    try {
      const swapResult = await FirebaseAdapter.swapShifts(initiatorUserId, bidderUserId, shiftA, shiftB);
      if (!swapResult.success) return { success: false };
      const now = new Date().toISOString();
      // Mark auction matched + selected bid accepted (sibling rejection done client-side via listing)
      const batch = writeBatch(db);
      batch.set(doc(db, 'swapAuctions', String(auctionId)),
        { status: 'matched', matchedBidId: String(bidId), _updatedAt: now },
        { merge: true });
      batch.set(doc(db, 'swapAuctions', String(auctionId), 'bids', String(bidId)),
        { status: 'accepted', respondedAt: now, _updatedAt: now },
        { merge: true });
      await batch.commit();
      return { success: true, ...swapResult };
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] acceptBid: ${err.message}`);
      return { success: false };
    }
  },

  /**
   * List active swap auctions whose preferences.groupIds intersect the given groups.
   * Filters status==='open' client-side to avoid composite indexes.
   */
  getSwapAuctionsForGroups: async (groupIds) => {
    if (!db || !Array.isArray(groupIds) || groupIds.length === 0) return [];
    try {
      const { collection, query, where, getDocs } = await import('./fdb');
      const ids = [...new Set(groupIds.map(String))];
      const chunks = [];
      for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
      const seen = new Map();
      for (const chunk of chunks) {
        const q = query(
          collection(db, 'swapAuctions'),
          where('preferences.groupIds', 'array-contains-any', chunk),
        );
        const snap = await getDocs(q);
        snap.forEach(d => {
          const data = d.data() || {};
          if (data.status !== 'open') return;
          if (!seen.has(d.id)) seen.set(d.id, { id: d.id, ...data });
        });
      }
      return [...seen.values()];
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] getSwapAuctionsForGroups: ${err.message}`);
      return [];
    }
  },

  /** Auctions I initiated. */
  getMyAuctions: async (userId) => {
    if (!db || !userId) return [];
    try {
      const { collection, query, where, getDocs } = await import('./fdb');
      const snap = await getDocs(query(
        collection(db, 'swapAuctions'),
        where('initiatorUserId', '==', String(userId)),
      ));
      const out = [];
      snap.forEach(d => out.push({ id: d.id, ...d.data() }));
      return out;
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] getMyAuctions: ${err.message}`);
      return [];
    }
  },

  /** All bids on a specific auction. */
  getBidsForAuction: async (auctionId) => {
    if (!db || !auctionId) return [];
    try {
      const { collection, getDocs } = await import('./fdb');
      const snap = await getDocs(collection(db, 'swapAuctions', String(auctionId), 'bids'));
      const out = [];
      snap.forEach(d => out.push({ id: d.id, auctionId: String(auctionId), ...d.data() }));
      return out;
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] getBidsForAuction: ${err.message}`);
      return [];
    }
  },

  // ── Notifications ──────────────────────────────────────────────────────────

  /** Write an inbox notification for a user. */
  writeNotification: (userId, notif) => {
    if (!db || !userId || !notif?.id) return Promise.resolve();
    return _write(_sub(userId, 'notifications', String(notif.id)), {
      ...notif,
      read: notif.read ?? false,
      createdAt: notif.createdAt || new Date().toISOString(),
    }, false);
  },

  markNotificationRead: (userId, notifId) => {
    if (!db || !userId || !notifId) return Promise.resolve();
    return _write(_sub(userId, 'notifications', String(notifId)), { read: true });
  },

  /** Marca várias notificações como lidas num único batch. */
  markNotificationsReadBulk: async (userId, notifIds) => {
    if (!db || !userId || !Array.isArray(notifIds) || notifIds.length === 0) return;
    try {
      const CHUNK = 400;
      for (let i = 0; i < notifIds.length; i += CHUNK) {
        const slice = notifIds.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        for (const id of slice) {
          if (!id) continue;
          batch.set(_sub(userId, 'notifications', String(id)), { read: true }, { merge: true });
        }
        await batch.commit();
      }
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] markNotificationsReadBulk: ${err.message}`);
    }
  },

  /** users/{userId}/settings/notifications */
  saveNotificationPrefs: (userId, prefs) =>
    _write(_sub(userId, 'settings', 'notifications'), { ...prefs }),

  loadNotificationPrefs: async (userId) => {
    if (!db || !userId) return null;
    try {
      const { getDoc } = await import('./fdb');
      const snap = await getDoc(_sub(userId, 'settings', 'notifications'));
      return snap.exists() ? snap.data() : null;
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] loadNotificationPrefs: ${err.message}`);
      return null;
    }
  },

  /** users/{userId}/devices/{deviceId} — push token registry */
  savePushDevice: (userId, deviceId, payload) =>
    _write(_sub(userId, 'devices', String(deviceId)), { ...payload, registeredAt: new Date().toISOString() }),

  loadPushDevices: async (userId) => {
    if (!db || !userId) return [];
    try {
      const { collection, getDocs } = await import('./fdb');
      const snap = await getDocs(collection(db, 'users', String(userId), 'devices'));
      const out = [];
      snap.forEach(d => out.push({ id: d.id, ...d.data() }));
      return out;
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] loadPushDevices: ${err.message}`);
      return [];
    }
  },

  /**
   * Reads the manager-published config off institutions/{id} for a set of ids.
   * institutions/{id} is world-readable (rules: allow read: if true), so a
   * doctor's app can fetch the hospital's source-of-truth financial config.
   * Returns a { [instId]: HospitalConfig } map; missing/config-less docs are
   * skipped. Fail-safe: any error yields {} so calculations fall back to the
   * user's own config.
   */
  /**
   * Real-time subscription to the cross-user groups this doctor belongs to:
   * top-level `auroraGroups` where memberIds array-contains uid. This is the
   * collection the web admin writes when adding a professional to a hospital, so
   * the app reflects membership changes live (rules allow a member to read it).
   *
   * `onChange` receives a raw array [{ id, ...data }]; the caller normalizes.
   * Returns an unsubscribe fn that also cancels the pending async setup.
   */
  subscribeAuroraGroups: (userId, onChange, onError) => {
    if (!db || !userId) return () => {};
    let unsub = () => {};
    let cancelled = false;
    (async () => {
      try {
        const { collection, query, where, onSnapshot } = await import('./fdb');
        if (cancelled) return;
        const q = query(
          collection(db, 'auroraGroups'),
          where('memberIds', 'array-contains', String(userId)),
        );
        unsub = onSnapshot(
          q,
          (snap) => {
            const out = [];
            snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
            onChange(out);
          },
          (err) => { if (onError) onError(err); },
        );
      } catch (err) {
        if (onError) onError(err);
      }
    })();
    return () => { cancelled = true; try { unsub(); } catch (_) {} };
  },

  /**
   * Células da escala fixa em que o médico é titular OU co, nos seus grupos.
   * Lê todas as células de cada grupo (rule permite a membro) e filtra client-side.
   * Cada item ganha `groupId`.
   */
  getMyFixedSlots: async (userId, groupIds) => {
    if (!db || !userId || !Array.isArray(groupIds) || groupIds.length === 0) return [];
    try {
      const { collection, getDocs } = await import('./fdb');
      const uid = String(userId);
      const snaps = await Promise.all(
        groupIds.map((gid) =>
          getDocs(collection(db, 'auroraGroups', String(gid), 'fixedSlots')).catch(() => null),
        ),
      );
      const out = [];
      snaps.forEach((snap, i) => {
        if (!snap) return;
        snap.forEach((d) => {
          const s = d.data() || {};
          if (String(s.titularId) === uid || (s.co && String(s.co.userId) === uid)) {
            out.push({ ...s, groupId: String(groupIds[i]) });
          }
        });
      });
      return out;
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] getMyFixedSlots: ${err.message}`);
      return [];
    }
  },

  /** Chama uma Cloud Function de escala fixa (entregar/transferir/reverter). */
  callFixedFn: async (name, data) => {
    if (!functions) return { ok: false, reason: 'functions-indisponivel' };
    try {
      const { httpsCallable } = await import('firebase/functions');
      const res = await httpsCallable(functions, name)(data || {});
      return res.data || { ok: true };
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] callFixedFn(${name}): ${err?.message}`);
      return { ok: false, reason: err?.message || 'erro' };
    }
  },

  getHospitalConfigs: async (instIds) => {
    if (!db || !Array.isArray(instIds) || instIds.length === 0) return {};
    try {
      const { doc: _doc, getDoc } = await import('./fdb');
      const ids = [...new Set(instIds.map(String).filter(Boolean))];
      const snaps = await Promise.all(
        ids.map(id => getDoc(_doc(db, 'institutions', id)).catch(() => null)),
      );
      const out = {};
      snaps.forEach((snap, i) => {
        if (snap && snap.exists()) {
          const cfg = snap.data()?.config;
          if (cfg) out[ids[i]] = cfg;
        }
      });
      return out;
    } catch (err) {
      Logger.warn(`[FirebaseAdapter] getHospitalConfigs: ${err.message}`);
      return {};
    }
  },
};

export default FirebaseAdapter;
