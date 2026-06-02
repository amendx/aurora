/**
 * GroupScheduleService — source-agnostic group calendar data layer.
 *
 * Returns a normalized map { [dateStr]: DaySchedule } for a (groupId, monthKey).
 *
 * Lookup order:
 *   1. LocalCache (aurora_grpsched_{groupId}_{YYYY-MM}) — respects isMonthStale.
 *   2. Firestore (groupSchedules/{groupId}/months/{YYYY-MM}/days/*) — if the metadata
 *      doc exists. Aurora users prefer this path.
 *   3. PlantaoAPI (webClient): GET /groups/{groupId}/calendar/daily/{date} per day in the month.
 *      Used as last resort or to refresh stale data. WebClient users always traverse this
 *      to keep PlantaoAPI as the live source of truth and shadow-write Firestore.
 *
 * Shadow-writes after a successful PlantaoAPI fetch:
 *   - LocalCache.saveGroupSchedule (which also fires the Firebase adapter)
 *   - UserSourceResolver rewrites assignments[].userId to the canonical user doc
 *     id (and upgrades source to 'aurora' when the person has an Aurora account).
 *     This is the single point where the PlantaoAPI's numeric coworker id is
 *     translated to whatever id the rest of the app uses to identify that human.
 */

import LocalCache, { isMonthStale } from './LocalCache';
import FirebaseAdapter from './firebase/FirebaseAdapter';
import WebClientApiService from './WebClientApiService';
import { normalizeGroupDaySchedule } from '../utils/OpeningNormalizer';
import UserSourceResolver from '../utils/UserSourceResolver';
import Logger from '../utils/Logger';

const _inflight = new Map(); // `${groupId}|${monthKey}` → Promise<{ days }>

const _dateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const _daysInMonth = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

const _monthDates = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  const total = _daysInMonth(monthKey);
  const dates = [];
  for (let d = 1; d <= total; d++) {
    dates.push(_dateStr(new Date(y, m - 1, d)));
  }
  return dates;
};

const _enrichAssignmentsWithSource = async (days) => {
  const ids = new Set();
  for (const day of Object.values(days)) {
    for (const slot of (day?.slots || [])) {
      for (const a of (slot?.assignments || [])) {
        if (a?.userId) ids.add(a.userId);
      }
    }
  }
  if (ids.size === 0) return days;
  try {
    const lookup = await UserSourceResolver.resolveBatch([...ids]);
    for (const day of Object.values(days)) {
      for (const slot of (day?.slots || [])) {
        for (const a of (slot?.assignments || [])) {
          const v = lookup.get(String(a.userId));
          if (v) {
            a.source = v.source;
            if (v.auroraUid) a.auroraUid = v.auroraUid;
            if (v.canonicalUserId && v.canonicalUserId !== String(a.userId)) {
              a.legacyUserId = String(a.userId);
              a.userId = v.canonicalUserId;
            }
          }
        }
      }
    }
  } catch {}
  return days;
};

const _fetchFromWebClient = async (token, group, monthKey) => {
  const groupId = String(group.id);
  const dates = _monthDates(monthKey);
  const days = {};

  await Promise.all(dates.map(async (dt) => {
    try {
      const res = await WebClientApiService.getGroupDailyCalendar(token, groupId, dt);
      if (res?.success && res.data?.dynamic_schedule) {
        const normalized = normalizeGroupDaySchedule(dt, group, res.data.dynamic_schedule);
        if (normalized) days[dt] = normalized;
        // Also keep the raw cache fresh for TodayCoworkersService consumers.
        LocalCache.saveGroupDaily(groupId, dt, res.data.dynamic_schedule).catch(() => {});
      }
    } catch (err) {
      Logger.warn(`[GroupScheduleService] webClient fetch ${groupId} ${dt}: ${err?.message}`);
    }
  }));

  return days;
};

/**
 * @param {object} opts
 * @param {object} opts.group   Normalized group from GroupsContext (must include id, name, color, institution)
 * @param {string} opts.monthKey  "YYYY-MM"
 * @param {string} [opts.token]   webClient token; required for fallback fetch
 * @param {string} [opts.userSource] 'aurora' | undefined
 * @param {string|number} [opts.currentUserId]  current user uid — required for aurora-native aggregation
 * @param {boolean} [opts.force]  bypass staleness checks
 * @returns {Promise<{ days: Object<string, object>, syncedAt: string|null, source: 'cache'|'firestore'|'aurora-aggregate'|'webClient' }>}
 */
const getMonth = async ({ group, monthKey, token, userSource, currentUserId, force = false }) => {
  if (!group?.id || !monthKey) return { days: {}, syncedAt: null, source: 'cache' };
  const groupId = String(group.id);
  const isAurora = userSource === 'aurora';
  const key = `${groupId}|${monthKey}`;

  if (_inflight.has(key)) return _inflight.get(key);

  const promise = (async () => {
    // 1. LocalCache
    if (!force) {
      const cached = await LocalCache.getGroupSchedule(groupId, monthKey);
      if (cached?.days && !isMonthStale(cached.syncedAt, monthKey)) {
        return { days: cached.days, syncedAt: cached.syncedAt, source: 'cache' };
      }
    }

    // 2. Firestore shadow-write cache (groupSchedules/*)
    //    Aurora reads it eagerly; webClient uses it only if its own fetch fails.
    let firestoreDays = null;
    let firestoreSyncedAt = null;
    if (isAurora || !token) {
      const fs = await FirebaseAdapter.fetchGroupScheduleMonth(groupId, monthKey);
      if (fs?.hasData) {
        firestoreDays = fs.days;
        firestoreSyncedAt = fs.syncedAt;
        if (!isMonthStale(firestoreSyncedAt, monthKey)) {
          await _enrichAssignmentsWithSource(firestoreDays);
          LocalCache.saveGroupSchedule(groupId, monthKey, firestoreDays, firestoreSyncedAt).catch(() => {});
          return { days: firestoreDays, syncedAt: firestoreSyncedAt, source: 'firestore' };
        }
      }
    }

    // 3a. Aurora-native: aggregate from member shift docs. No PlantaoAPI touch.
    //     This is the primary data source for aurora users — bypasses webClient
    //     entirely. Reads at most (1 + N) Firestore docs per group, where N =
    //     group members.
    if (isAurora) {
      const days = await FirebaseAdapter.aggregateAuroraGroupSchedule(group, monthKey, currentUserId);
      if (Object.keys(days).length > 0) {
        await _enrichAssignmentsWithSource(days);
        const syncedAt = new Date().toISOString();
        LocalCache.saveGroupSchedule(groupId, monthKey, days, syncedAt).catch(() => {});
        // Persist this aggregated view to groupSchedules so peers can read it too.
        FirebaseAdapter.saveGroupScheduleMonth(groupId, monthKey, days, syncedAt).catch(() => {});
        return { days, syncedAt, source: 'aurora-aggregate' };
      }
      // Aurora user with no data anywhere → return empty, never fall through to webClient.
      if (firestoreDays) {
        await _enrichAssignmentsWithSource(firestoreDays);
        return { days: firestoreDays, syncedAt: firestoreSyncedAt, source: 'firestore' };
      }
      const stale = await LocalCache.getGroupSchedule(groupId, monthKey);
      return stale?.days
        ? { days: stale.days, syncedAt: stale.syncedAt, source: 'cache' }
        : { days: {}, syncedAt: null, source: 'cache' };
    }

    // 3b. webClient (live fetch + shadow-write) — only for non-aurora users.
    if (token) {
      const days = await _fetchFromWebClient(token, group, monthKey);
      const hasAny = Object.keys(days).length > 0;
      if (hasAny) {
        await _enrichAssignmentsWithSource(days);
        const syncedAt = new Date().toISOString();
        LocalCache.saveGroupSchedule(groupId, monthKey, days, syncedAt).catch(() => {});
        return { days, syncedAt, source: 'webClient' };
      }
    }

    // 4. Last resort: stale Firestore data, then stale LocalCache.
    if (firestoreDays) {
      await _enrichAssignmentsWithSource(firestoreDays);
      return { days: firestoreDays, syncedAt: firestoreSyncedAt, source: 'firestore' };
    }
    const stale = await LocalCache.getGroupSchedule(groupId, monthKey);
    if (stale?.days) {
      return { days: stale.days, syncedAt: stale.syncedAt, source: 'cache' };
    }
    return { days: {}, syncedAt: null, source: 'cache' };
  })();

  _inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    _inflight.delete(key);
  }
};

/**
 * Resolve the month for several groups in parallel.
 * @returns {Promise<Object<string, { days: Object, syncedAt: string|null, source: string }>>}
 *          keyed by groupId
 */
const getMultipleMonths = async ({ groups, monthKey, token, userSource, currentUserId, force = false }) => {
  const out = {};
  if (!Array.isArray(groups) || groups.length === 0 || !monthKey) return out;
  await Promise.all(groups.map(async (g) => {
    const res = await getMonth({ group: g, monthKey, token, userSource, currentUserId, force });
    out[String(g.id)] = res;
  }));
  return out;
};

/**
 * Aggregate multiple groups into a single `{ [dateStr]: DaySchedule[] }` view.
 * Each date holds an array of per-group DaySchedules (one per group with data).
 */
const aggregateByDate = (perGroupResult) => {
  const days = {};
  for (const groupId of Object.keys(perGroupResult || {})) {
    const { days: gd } = perGroupResult[groupId] || {};
    if (!gd) continue;
    for (const [dateStr, schedule] of Object.entries(gd)) {
      if (!days[dateStr]) days[dateStr] = [];
      days[dateStr].push(schedule);
    }
  }
  return days;
};

/**
 * Annotate assignments with pending-offer state from `shiftOffers` so the team
 * view can render "Pendente para você" / "Aguardando <Nome>" badges + actions.
 *
 * Cross-reference by `offer.shiftSnapshot.id == assignment.shiftId` first, then
 * fallback to (offer.shiftSnapshot.date == day.date AND offer.fromUserId == assignment.userId)
 * to handle webClient → aurora id drift.
 *
 * Mutates `perGroupResult.days` in place. Returns the same reference for chaining.
 *
 * @param {object} perGroupResult       result from getMultipleMonths { groupId → { days } }
 * @param {string|number} currentUserId
 */
const enrichWithPendingOffers = async (perGroupResult, currentUserId) => {
  if (!perGroupResult || !currentUserId) return perGroupResult;
  try {
    const offers = await FirebaseAdapter.getPendingOffersForUser(currentUserId);
    if (!Array.isArray(offers) || offers.length === 0) return perGroupResult;

    const selfId = String(currentUserId);
    for (const offer of offers) {
      if (offer?.kind !== 'cede' || offer?.status !== 'pending') continue;
      const role = String(offer.toUserId) === selfId ? 'recipient' : 'sender';
      const snap = offer.shiftSnapshot || {};
      const shiftId = snap.id != null ? String(snap.id) : null;
      const dateStr = (snap.date || (snap.startISO || '').slice(0, 10)) || null;
      const fromUserId = String(offer.fromUserId);

      for (const groupId of Object.keys(perGroupResult)) {
        const days = perGroupResult[groupId]?.days || {};
        for (const [d, schedule] of Object.entries(days)) {
          if (dateStr && d !== dateStr) continue;
          for (const slot of (schedule?.slots || [])) {
            for (const a of (slot.assignments || [])) {
              const matchById = shiftId && a.shiftId && String(a.shiftId) === shiftId;
              const matchByUser = !matchById && a.userId && String(a.userId) === fromUserId;
              if (matchById || matchByUser) {
                a.pendingOffer = {
                  offerId: offer.id,
                  role,
                  counterpartyUserId: role === 'recipient' ? fromUserId : String(offer.toUserId),
                  counterpartyName: role === 'recipient' ? snap?.userName : offer.toUserName,
                  offer,
                };
              }
            }
          }
        }
      }
    }
  } catch (err) {
    Logger.warn(`[GroupScheduleService] enrichWithPendingOffers: ${err?.message}`);
  }
  return perGroupResult;
};

/**
 * Annotate assignments with pending-swap state from `shiftSwaps`. Mirror of
 * enrichWithPendingOffers but for trocas. The annotation lives on the
 * assignment of whichever side I'm involved with:
 *
 *   role 'initiator-mine'    → my own shift offered in a swap I started
 *   role 'initiator-theirs'  → the counterparty's shift I want (renders "Cancelar")
 *   role 'target-mine'       → my own shift someone wants from me (renders Aceitar/Recusar)
 *   role 'target-theirs'     → the counterparty's shift they offered to me
 */
const enrichWithPendingSwaps = async (perGroupResult, currentUserId, localSwaps = null) => {
  if (!perGroupResult || !currentUserId) return perGroupResult;
  try {
    // Prefer local-state swaps when provided (immediate, no Firestore latency).
    // Falls back to Firestore query (covers fresh sessions before OffersContext refresh).
    let swaps = Array.isArray(localSwaps) ? localSwaps.filter(s => s?.status === 'pending') : null;
    if (!swaps || swaps.length === 0) {
      const remote = await FirebaseAdapter.getPendingSwapsForUser(currentUserId);
      swaps = Array.isArray(remote) ? remote : [];
      Logger.info(`[GroupScheduleService] enrichWithPendingSwaps (Firestore) → ${swaps.length} pending swaps for uid=${currentUserId}`);
    } else {
      Logger.info(`[GroupScheduleService] enrichWithPendingSwaps (local) → ${swaps.length} pending swaps for uid=${currentUserId}`);
    }
    if (swaps.length === 0) return perGroupResult;

    const selfId = String(currentUserId);
    for (const swap of swaps) {
      if (swap?.status !== 'pending') continue;
      const initId = String(swap.initiatorUserId);
      const targId = String(swap.targetUserId);
      const isInit = initId === selfId;
      const isTarget = targId === selfId;
      if (!isInit && !isTarget) continue;

      const sides = [
        { shift: swap.shiftA, ownerUid: initId, isMineSide: isInit, side: 'A' },
        { shift: swap.shiftB, ownerUid: targId, isMineSide: isTarget, side: 'B' },
      ];

      for (const { shift: sideShift, ownerUid, isMineSide, side } of sides) {
        if (!sideShift) continue;
        const shiftId = sideShift.id != null ? String(sideShift.id) : null;
        const dateStr = sideShift.date || (sideShift.startISO || '').slice(0, 10);

        let role;
        if (isInit && isMineSide)  role = 'initiator-mine';
        if (isInit && !isMineSide) role = 'initiator-theirs';
        if (isTarget && isMineSide)  role = 'target-mine';
        if (isTarget && !isMineSide) role = 'target-theirs';

        const counterpartyName = isInit ? (swap.targetUserName || '') : (swap.initiatorUserName || '');
        const counterpartyUserId = isInit ? targId : initId;

        let matched = 0;
        const inspected = [];
        for (const groupId of Object.keys(perGroupResult)) {
          const days = perGroupResult[groupId]?.days || {};
          for (const [d, schedule] of Object.entries(days)) {
            if (dateStr && d !== dateStr) continue;
            for (const slot of (schedule?.slots || [])) {
              for (const a of (slot.assignments || [])) {
                const aShiftIdStr = a.shiftId != null ? String(a.shiftId) : '';
                const aUserIdStr  = a.userId != null ? String(a.userId) : '';
                const matchById = !!shiftId && !!aShiftIdStr && aShiftIdStr === shiftId;
                const matchByUser = !matchById && !!aUserIdStr && aUserIdStr === ownerUid;
                if (matchById || matchByUser) {
                  a.pendingSwap = {
                    swapId: swap.id,
                    role,
                    counterpartyName,
                    counterpartyUserId,
                    swap,
                  };
                  matched++;
                } else {
                  inspected.push(`{shift=${aShiftIdStr.slice(0, 12)} user=${aUserIdStr.slice(0, 12)}}`);
                }
              }
            }
          }
        }
        Logger.info(`[GroupScheduleService] swap ${swap.id} side=${side} role=${role} target shiftId=${shiftId} ownerUid=${ownerUid} date=${dateStr} → matched ${matched} (inspected: ${inspected.join(', ').slice(0, 200)})`);
      }
    }
  } catch (err) {
    Logger.warn(`[GroupScheduleService] enrichWithPendingSwaps FAILED: ${err?.message}`);
  }
  return perGroupResult;
};

export default {
  getMonth,
  getMultipleMonths,
  aggregateByDate,
  enrichWithPendingOffers,
  enrichWithPendingSwaps,
};
