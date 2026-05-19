import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useGroups } from './GroupsContext';
import WebClientApiService from '../services/WebClientApiService';
import LocalCache from '../services/LocalCache';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';
import { fromWebClient, fromFirestore } from '../utils/OpeningNormalizer';
import NotificationService from '../services/NotificationService';
import Logger from '../utils/Logger';

const OpeningsContext = createContext();

export const useOpenings = () => {
  const ctx = useContext(OpeningsContext);
  if (!ctx) throw new Error('useOpenings must be used within OpeningsProvider');
  return ctx;
};

export const OpeningsProvider = ({ children }) => {
  const { token, user } = useContext(AuthContext);
  const { groups } = useGroups();
  const userId = user?.id || 0;
  const isWebClient = user?.source !== 'aurora';

  const [openings, setOpenings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fetchingRef = useRef(false);

  const _groupIds = () => Object.values(groups || {}).map(g => g.public_id || String(g.id)).filter(Boolean);

  const refresh = useCallback(async (force = false) => {
    if (!userId || fetchingRef.current) return;
    const stale = await LocalCache.isOpeningsStale(userId);
    if (!stale && !force) {
      const monthKey = new Date().toISOString().slice(0, 7);
      const cached = await LocalCache.getOpenings(userId, monthKey);
      if (cached.length) { setOpenings(cached); return; }
    }

    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const merged = [];
      const seen = new Set();

      const add = (item) => {
        if (!item?.id || seen.has(item.id)) return;
        seen.add(item.id);
        merged.push(item);
      };

      // Aurora openings from Firestore (all user types)
      const groupIds = _groupIds();
      if (groupIds.length) {
        const docs = await FirebaseAdapter.getOpeningsForGroups(groupIds);
        docs.forEach(d => {
          const o = fromFirestore(d);
          // Hide cede-backed openings whose origin is the current user
          // (you can't claim back your own ceded shift — use the cancel CTA instead).
          if (o.originUserId && String(o.originUserId) === String(userId)) return;
          // Enforce restrictedToGroupId scoping client-side as a defense in depth.
          if (o.restrictedToGroupId && !groupIds.includes(String(o.restrictedToGroupId))) return;
          add(o);
        });
      }

      // webClient openings (only for webClient-source users)
      if (isWebClient && token) {
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const res = await WebClientApiService.getPendingShifts(token, page, 20);
          if (!res.success || !res.data.length) { hasMore = false; break; }
          res.data
            .filter(item => item.type === 'vacancy' || item.type === 'assignment')
            .forEach(item => {
              try {
                const normalized = fromWebClient(item);
                if (normalized) add(normalized);
              } catch (e) {
                Logger.error(`[OpeningsContext] normalize failed for ${item.id}: ${e.message}`);
              }
            });
          hasMore = res.data.length === 20;
          page++;
          if (page > 10) break;
        }
      }

      merged.sort((a, b) => a.startISO.localeCompare(b.startISO));
      setOpenings(merged);

      const monthKey = new Date().toISOString().slice(0, 7);
      await LocalCache.saveOpenings(userId, monthKey, merged);
    } catch (err) {
      Logger.error('[OpeningsContext] refresh:', err?.message);
      setError(err?.message || 'Erro ao carregar vagas');
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [userId, token, isWebClient, groups]);

  /**
   * Claim a slot on an Aurora-native opening.
   * Writes to Firestore atomically, then writes the shift to LocalCache.
   */
  const claimOpening = useCallback(async (openingId, slotId) => {
    const opening = openings.find(o => o.id === openingId);
    if (!opening || !opening.claimable) return { success: false, reason: 'not_claimable' };

    try {
      await FirebaseAdapter.claimSlot(openingId, slotId, userId);

      // If this opening was created by a doctor ceding a shift, the origin
      // doctor's calendar must lose that shift atomically and be notified.
      const isCedeBacked = !!opening.originUserId && !!opening.originShiftId;
      if (isCedeBacked) {
        await FirebaseAdapter.deleteUserShift(
          opening.originUserId,
          opening.monthKey,
          opening.originShiftId,
        );
        NotificationService.notify(opening.originUserId, 'offer_outcome', {
          title: 'Plantão cedido foi assumido',
          body: `${opening.group?.name || 'Grupo'} · ${opening.dateKey || ''}`,
          payload: { openingId, outcome: 'accepted' },
        }).catch(() => {});
      }

      // Write shift to claimant's calendar (local + Firestore via shadow)
      const shift = {
        id: `opening_${openingId}_${slotId}`,
        source: isCedeBacked ? 'received' : 'aurora_opening',
        openingId,
        originUserId: opening.originUserId || null,
        originalShiftId: opening.originShiftId || null,
        label: opening.label,
        startISO: opening.startISO,
        endISO: opening.endISO,
        monthKey: opening.monthKey,
        durationMinutes: opening.durationMinutes,
        group: opening.group,
        estimatedValue: opening.estimatedValue,
        coworkers: [],
        createdAt: new Date().toISOString(),
      };
      await LocalCache.saveManualShift(userId, shift);

      // Optimistically update local openings list
      setOpenings(prev => prev.map(o => {
        if (o.id !== openingId) return o;
        const newAvail = o.availableSlots - 1;
        return { ...o, availableSlots: newAvail, claimable: newAvail > 0 };
      }));

      return { success: true };
    } catch (err) {
      Logger.error(`[OpeningsContext] claimOpening: ${err?.message}`);
      return { success: false, reason: err?.message };
    }
  }, [openings, userId]);

  /**
   * Cancel a cede-backed opening that THIS user created.
   * The origin shift was never removed from the doctor's calendar (we only
   * delete it on actual claim), so cancel is just a status update.
   */
  const cancelCedeOpening = useCallback(async (openingId) => {
    const opening = openings.find(o => o.id === openingId);
    if (!opening) return { success: false };
    if (String(opening.originUserId) !== String(userId)) return { success: false, reason: 'not_owner' };
    try {
      await FirebaseAdapter.saveOpening({ ...opening, id: opening.id, status: 'cancelled', updatedAt: new Date().toISOString() });
      setOpenings(prev => prev.filter(o => o.id !== openingId));
      return { success: true };
    } catch (err) {
      Logger.error(`[OpeningsContext] cancelCedeOpening: ${err?.message}`);
      return { success: false, reason: err?.message };
    }
  }, [openings, userId]);

  return (
    <OpeningsContext.Provider value={{ openings, loading, error, refresh, claimOpening, cancelCedeOpening }}>
      {children}
    </OpeningsContext.Provider>
  );
};
