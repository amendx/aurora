import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useGroups } from './GroupsContext';
import LocalCache from '../services/LocalCache';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';
import { fromFirestore } from '../utils/OpeningNormalizer';
import NotificationService from '../services/NotificationService';
import Logger from '../utils/Logger';

const OpeningsContext = createContext();

export const useOpenings = () => {
  const ctx = useContext(OpeningsContext);
  if (!ctx) throw new Error('useOpenings must be used within OpeningsProvider');
  return ctx;
};

export const OpeningsProvider = ({ children }) => {
  const { user } = useContext(AuthContext);
  const { groups } = useGroups();
  const userId = user?.id || 0;

  const [openings, setOpenings] = useState([]);
  const [myCededOpenings, setMyCededOpenings] = useState([]);
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
      const claimable = [];
      const mine = [];
      const seen = new Set();

      // Aurora pool: openings in Firestore, scoped to the user's groups.
      const groupIds = _groupIds();
      if (groupIds.length) {
        const docs = await FirebaseAdapter.getOpeningsForGroups(groupIds);
        docs.forEach(d => {
          const o = fromFirestore(d);
          if (!o?.id || seen.has(o.id)) return;
          seen.add(o.id);
          // Own active cedes go to mine (separately surfaced for cancel UX).
          if (o.originUserId && String(o.originUserId) === String(userId)) {
            if (o.claimable) mine.push(o);
            return;
          }
          // Enforce restrictedToGroupId scoping client-side as a defense in depth.
          if (o.restrictedToGroupId && !groupIds.includes(String(o.restrictedToGroupId))) return;
          claimable.push(o);
        });
      }

      claimable.sort((a, b) => a.startISO.localeCompare(b.startISO));
      mine.sort((a, b) => a.startISO.localeCompare(b.startISO));
      setOpenings(claimable);
      setMyCededOpenings(mine);

      const monthKey = new Date().toISOString().slice(0, 7);
      await LocalCache.saveOpenings(userId, monthKey, claimable);
    } catch (err) {
      Logger.error('[OpeningsContext] refresh:', err?.message);
      setError(err?.message || 'Erro ao carregar vagas');
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [userId, groups]);

  /**
   * Claim a slot on an Aurora-native opening.
   * The origin shift was already removed at cede time, so claim just writes
   * the claimant's new shift + flips the slot status.
   */
  const claimOpening = useCallback(async (openingId, slotId) => {
    const opening = openings.find(o => o.id === openingId);
    if (!opening || !opening.claimable) return { success: false, reason: 'not_claimable' };

    try {
      await FirebaseAdapter.claimSlot(openingId, slotId, userId);

      const isCedeBacked = !!opening.originUserId && !!opening.originShiftId;
      if (isCedeBacked) {
        NotificationService.notify(opening.originUserId, 'offer_outcome', {
          title: 'Plantão cedido foi assumido',
          body: `${opening.group?.name || 'Grupo'} · ${opening.dateKey || ''}`,
          payload: { openingId, outcome: 'accepted' },
        }).catch(() => {});
      }

      // Build the received shift, preserving the original snapshot when present
      // so the claimant gets the full shift shape (time string, etc.).
      const snapshot = opening.originShiftSnapshot || {};
      const newShiftId = `received_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const shift = {
        ...snapshot,
        id: newShiftId,
        userId,
        source: 'received',
        openingId,
        originUserId: opening.originUserId || null,
        originalShiftId: opening.originShiftId || null,
        label: opening.label || snapshot.label,
        startISO: opening.startISO || snapshot.startISO,
        endISO: opening.endISO || snapshot.endISO,
        date: snapshot.date || (opening.startISO || '').slice(0, 10),
        monthKey: opening.monthKey || snapshot.monthKey,
        durationMinutes: opening.durationMinutes || snapshot.durationMinutes,
        group: opening.group || snapshot.group,
        estimatedValue: opening.estimatedValue ?? snapshot.estimatedValue ?? null,
        coworkers: [],
        transferredAt: new Date().toISOString(),
        isManual: false,
      };

      // Persist to Firestore (months path) and LocalCache (regularShifts bucket
      // for received shifts so the source semantics stay correct).
      try {
        await FirebaseAdapter.restoreUserShift(userId, shift.monthKey, shift);
      } catch (err) {
        Logger.warn(`[OpeningsContext] write claimed shift: ${err?.message}`);
      }
      await LocalCache.saveRegularShift(userId, shift);

      // Optimistically update local openings list
      setOpenings(prev => prev.map(o => {
        if (o.id !== openingId) return o;
        const newAvail = o.availableSlots - 1;
        return { ...o, availableSlots: newAvail, claimable: newAvail > 0 };
      }));

      return { success: true, claimedShift: shift };
    } catch (err) {
      Logger.error(`[OpeningsContext] claimOpening: ${err?.message}`);
      return { success: false, reason: err?.message };
    }
  }, [openings, userId]);

  /**
   * Cancel a cede-backed opening that THIS user created, and restore the
   * shift to the holder's calendar (Firestore + LocalCache).
   */
  const cancelCedeOpening = useCallback(async (openingId) => {
    const opening = myCededOpenings.find(o => o.id === openingId)
      || openings.find(o => o.id === openingId);
    if (!opening) return { success: false };
    if (String(opening.originUserId) !== String(userId)) return { success: false, reason: 'not_owner' };
    try {
      await FirebaseAdapter.saveOpening({ ...opening, id: opening.id, status: 'cancelled', updatedAt: new Date().toISOString() });

      // Restore the original shift if we kept a snapshot.
      const snap = opening.originShiftSnapshot;
      if (snap?.id && snap?.monthKey) {
        await FirebaseAdapter.restoreUserShift(userId, snap.monthKey, snap);
        if (snap.isManual) {
          await LocalCache.saveManualShift(userId, snap);
        } else {
          await LocalCache.saveRegularShift(userId, snap);
        }
      }

      setOpenings(prev => prev.filter(o => o.id !== openingId));
      setMyCededOpenings(prev => prev.filter(o => o.id !== openingId));
      return { success: true, restoredShift: snap || null };
    } catch (err) {
      Logger.error(`[OpeningsContext] cancelCedeOpening: ${err?.message}`);
      return { success: false, reason: err?.message };
    }
  }, [openings, myCededOpenings, userId]);

  return (
    <OpeningsContext.Provider value={{ openings, myCededOpenings, loading, error, refresh, claimOpening, cancelCedeOpening }}>
      {children}
    </OpeningsContext.Provider>
  );
};
