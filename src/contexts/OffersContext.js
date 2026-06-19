/**
 * OffersContext — central state for Ceder + Trocar.
 *
 * Holds:
 *   - offersSent / offersReceived (pending ShiftOffer[])
 *   - swapsSent  / swapsReceived  (pending ShiftSwap[])
 *   - inbox (Notification[])
 *   - prefs (NotificationPrefs)
 *
 * Exposes:
 *   - cedeOpenToGroup(shift)           — release a shift for any group member to claim
 *   - cedeTargeted(shift, toUserId, toUserName)
 *   - proposeSwap(myShift, target, theirShift)
 *   - acceptOffer / rejectOffer / cancelOffer
 *   - acceptSwap  / rejectSwap  / cancelSwap
 *   - markInboxRead / markAllInboxRead
 *   - savePrefs
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { isViewOnly } from '../utils/userSource';
import { useGroups } from './GroupsContext';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';
import { db } from '../services/firebase/config';
import { collection, query, where, onSnapshot } from '../services/firebase/fdb';
import NotificationService from '../services/NotificationService';
import LocalCache from '../services/LocalCache';
import Logger from '../utils/Logger';
import ActivityLogger from '../utils/ActivityLogger';
import UserSourceResolver from '../utils/UserSourceResolver';
import { isWithinDevolutionWindow } from '../utils/shiftTransferLog';
import { fmtDateBR } from '../utils/formatDate';

const OffersContext = createContext();

export const useOffers = () => {
  const ctx = useContext(OffersContext);
  if (!ctx) throw new Error('useOffers must be used within OffersProvider');
  return ctx;
};

const _uuid = (prefix = 'o') =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const _isExpired = (item) =>
  item?.expiresAt && new Date(item.expiresAt).getTime() <= Date.now();

export const OffersProvider = ({ children }) => {
  const { user } = useContext(AuthContext);
  const { groups: groupsById } = useGroups();
  const userId = user?.id || null;
  const userName = user?.name || user?.full_name || 'Colega';

  const [offersSent, setOffersSent]         = useState([]);
  const [offersReceived, setOffersReceived] = useState([]);
  const [swapsSent, setSwapsSent]           = useState([]);
  const [swapsReceived, setSwapsReceived]   = useState([]);
  const [inbox, setInbox]                   = useState([]);
  const [prefs, setPrefs]                   = useState(NotificationService.defaultPrefs());
  const [loading, setLoading]               = useState(false);

  const fetchingRef = useRef(false);

  // ── Inbox subscription ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) { setInbox([]); return; }
    const unsub = NotificationService.subscribeInbox(userId, setInbox);
    return unsub;
  }, [userId]);

  // ── Prefs ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    NotificationService.loadPrefs(userId).then(setPrefs).catch(() => {});
  }, [userId]);

  const savePrefs = useCallback(async (next) => {
    setPrefs(next);
    if (userId) await NotificationService.savePrefs(userId, next);
  }, [userId]);

  // ── Offers + swaps fetch (called on mount and on demand) ──────────────────
  const refresh = useCallback(async () => {
    if (!userId || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const [offers, swaps] = await Promise.all([
        FirebaseAdapter.getPendingOffersForUser(userId),
        FirebaseAdapter.getPendingSwapsForUser(userId),
      ]);
      const uid = String(userId);

      // Lazy expiry: anything past expiresAt → mark on server, drop from local list
      const liveOffers = [];
      offers.forEach(o => {
        if (_isExpired(o)) {
          FirebaseAdapter.respondOffer(o.id, { status: 'expired' }).catch(() => {});
        } else liveOffers.push(o);
      });
      const liveSwaps = [];
      swaps.forEach(s => {
        if (_isExpired(s)) {
          FirebaseAdapter.respondSwap(s.id, { status: 'expired' }).catch(() => {});
        } else liveSwaps.push(s);
      });

      const newOffersSent     = liveOffers.filter(o => String(o.fromUserId) === uid);
      const newOffersReceived = liveOffers.filter(o => String(o.toUserId) === uid);
      const newSwapsSent      = liveSwaps.filter(s => String(s.initiatorUserId) === uid);
      const newSwapsReceived  = liveSwaps.filter(s => String(s.targetUserId) === uid);
      setOffersSent(newOffersSent);
      setOffersReceived(newOffersReceived);
      setSwapsSent(newSwapsSent);
      setSwapsReceived(newSwapsReceived);
      ActivityLogger.snapshot({
        selfId: uid, selfName: userName,
        swapsSent: newSwapsSent, swapsReceived: newSwapsReceived,
        offersSent: newOffersSent, offersReceived: newOffersReceived,
      });
    } catch (err) {
      Logger.error(`[OffersContext] refresh: ${err?.message}`);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [userId, userName]);

  // ── Realtime listeners (onSnapshot) ───────────────────────────────────────
  // 4 streams: ofertas recebidas/enviadas + trocas recebidas/enviadas.
  // Substituem o fetch one-shot — qualquer mudança no Firestore reflete na
  // UI imediatamente (sem precisar de pull-to-refresh).
  useEffect(() => {
    if (!userId || !db) {
      setOffersSent([]); setOffersReceived([]);
      setSwapsSent([]); setSwapsReceived([]);
      return;
    }
    const uid = String(userId);

    // Diagnostic — visível no Settings → Minhas ações
    ActivityLogger.snapshot({
      selfId: uid, selfName: userName,
      swapsSent: [], swapsReceived: [], offersSent: [], offersReceived: [],
    });

    const makeDiagnosticHandler = (setter, kind, label) => (snap) => {
      const out = [];
      let expired = 0;
      let nonPending = 0;
      snap.forEach(d => {
        const data = { id: d.id, ...d.data() };
        if (data.status !== 'pending') { nonPending++; return; }
        if (_isExpired(data)) {
          expired++;
          if (kind === 'offer') FirebaseAdapter.respondOffer(data.id, { status: 'expired' }).catch(() => {});
          else FirebaseAdapter.respondSwap(data.id, { status: 'expired' }).catch(() => {});
          return;
        }
        out.push(data);
      });
      Logger.info(`[OffersContext] ${label}(uid=${uid}) snap=${snap.size} pending=${out.length} expired=${expired} other=${nonPending}`);
      setter(out);
    };

    const unsubs = [
      onSnapshot(query(collection(db, 'shiftOffers'), where('toUserId', '==', uid)),
        makeDiagnosticHandler(setOffersReceived, 'offer', 'offersReceived'),
        (err) => Logger.warn(`[OffersContext] FAIL offersReceived(uid=${uid}): ${err?.code || ''} ${err?.message}`)),
      onSnapshot(query(collection(db, 'shiftOffers'), where('fromUserId', '==', uid)),
        makeDiagnosticHandler(setOffersSent, 'offer', 'offersSent'),
        (err) => Logger.warn(`[OffersContext] FAIL offersSent(uid=${uid}): ${err?.code || ''} ${err?.message}`)),
      onSnapshot(query(collection(db, 'shiftSwaps'), where('targetUserId', '==', uid)),
        makeDiagnosticHandler(setSwapsReceived, 'swap', 'swapsReceived'),
        (err) => Logger.warn(`[OffersContext] FAIL swapsReceived(uid=${uid}): ${err?.code || ''} ${err?.message}`)),
      onSnapshot(query(collection(db, 'shiftSwaps'), where('initiatorUserId', '==', uid)),
        makeDiagnosticHandler(setSwapsSent, 'swap', 'swapsSent'),
        (err) => Logger.warn(`[OffersContext] FAIL swapsSent(uid=${uid}): ${err?.code || ''} ${err?.message}`)),
    ];
    Logger.info(`[OffersContext] realtime listeners up for uid=${uid}`);

    return () => {
      unsubs.forEach(u => { try { u(); } catch {} });
      Logger.info(`[OffersContext] realtime listeners down for uid=${uid}`);
    };
  }, [userId]);

  // ── Ceder: open to group ──────────────────────────────────────────────────
  // Creates an opening with restrictedToGroupId + originShiftId, then removes
  // the shift from the holder's Firestore + LocalCache immediately so the
  // calendar reflects the cede right away. The opening carries a full snapshot
  // so the holder can cancel and restore the shift before anyone claims.
  const cedeOpenToGroup = useCallback(async (shift) => {
    if (isViewOnly(user)) return { success: false, reason: 'view_only' };
    if (!userId || !shift?.id || !shift?.group?.id) return { success: false };
    const groupId = String(shift.group.id);
    const openingId = _uuid('cede');
    const slotId = _uuid('slot');
    const monthKey = shift.monthKey || (shift.startISO || '').slice(0, 7);
    const opening = {
      id: openingId,
      source: 'aurora',
      kind: 'cede',                  // discriminador — médico cedendo seu próprio plantão
      createdByRole: 'doctor',
      targetUserId: null,            // null = aberto ao grupo
      status: 'active',
      groupId,
      group: shift.group,
      institutionId: shift.group?.institution?.id || null,
      label: shift.label,
      startISO: shift.startISO || shift.start_date || null,
      endISO: shift.endISO || shift.end_date || null,
      dateKey: shift.date || shift.dateKey || (shift.startISO || '').slice(0, 10),
      monthKey,
      totalSlots: 1,
      slots: [{ slotId, status: 'open', claimedByUserId: null, claimedAt: null }],
      estimatedValue: shift.estimatedValue ?? null,
      notes: null,
      createdBy: String(userId),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      restrictedToGroupId: groupId,
      originShiftId: String(shift.id),
      originUserId: String(userId),
      // Quem cedeu — usado para exibir "Cedido por: X" nas telas de vagas.
      originUserName: userName || null,
      originShiftSnapshot: (() => {
        const { originalData: _od, ...clean } = shift || {};
        return clean;
      })(),
    };
    await FirebaseAdapter.saveOpening(opening);
    ActivityLogger.cedeToGroup({ selfName: userName, shift, openingId });

    // Remove the shift from the holder immediately. Firestore is source of
    // truth — LocalCache is patched separately by the caller via ShiftsContext.
    try {
      await FirebaseAdapter.removeUserShiftFull(userId, monthKey, shift.id);
      await Promise.all([
        LocalCache.deleteManualShift(userId, shift.id, monthKey),
        LocalCache.deleteRegularShift(userId, shift.id, monthKey),
      ]);
    } catch (err) {
      Logger.error(`[OffersContext] cedeOpenToGroup remove shift: ${err?.message}`);
    }

    // Notify other group members
    try {
      const memberIds = await _loadGroupMemberIds(userId, groupId);
      const targets = memberIds.filter(id => String(id) !== String(userId));
      await Promise.all(targets.map(uid => NotificationService.notify(uid, 'ceder_in_my_group', {
        title: `${userName} cedeu um plantão`,
        body: `${shift.group?.name || 'Grupo'} · ${_humanShiftLabel(shift)}`,
        payload: { openingId, groupId },
      })));
    } catch (err) {
      Logger.error(`[OffersContext] cedeOpenToGroup notify: ${err?.message}`);
    }

    return { success: true, openingId };
  }, [userId, userName]);

  // ── Ceder: targeted to one person ─────────────────────────────────────────
  const cedeTargeted = useCallback(async (shift, toUserId, toUserName) => {
    if (isViewOnly(user)) return { success: false, reason: 'view_only' };
    if (!userId || !shift?.id || !toUserId) return { success: false };
    const offerId = _uuid('offer');
    const startISO = shift.startISO || shift.start_date || new Date().toISOString();
    const offer = {
      id: offerId,
      kind: 'cede',
      fromUserId: String(userId),
      toUserId: String(toUserId),
      shiftSnapshot: { ...shift },
      status: 'pending',
      groupId: String(shift.group?.id || ''),
      monthKey: shift.monthKey || startISO.slice(0, 7),
      createdAt: new Date().toISOString(),
      respondedAt: null,
      expiresAt: startISO,
    };
    await FirebaseAdapter.createOffer(offer);
    ActivityLogger.cedeTargeted({ selfName: userName, targetName: toUserName, shift, offerId });
    await NotificationService.notify(toUserId, 'ceder_offered_to_me', {
      title: `${userName} quer ceder um plantão a você`,
      body: `${shift.group?.name || 'Grupo'} · ${_humanShiftLabel(shift)}`,
      payload: { offerId },
    });
    setOffersSent(prev => [offer, ...prev]);
    return { success: true, offerId };
  }, [userId, userName]);

  // ── Trocar: propose ───────────────────────────────────────────────────────
  const proposeSwap = useCallback(async (myShift, target, theirShift, eligibleGroupIds) => {
    if (!userId || !target?.id || !myShift?.id || !theirShift?.id) {
      Logger.warn(`[OffersContext] proposeSwap early-return: userId=${userId} target=${target?.id} myShift=${myShift?.id} theirShift=${theirShift?.id}`);
      return { success: false };
    }
    const swapId = _uuid('swap');
    const startA = myShift.startISO || myShift.start_date;
    const startB = theirShift.startISO || theirShift.start_date;
    const earlier = (new Date(startA) < new Date(startB)) ? startA : startB;

    // PlantaoAPI uses two different ids for the same person: a slug in /auth/login
    // and a numeric id in coworker listings. The schedule enrichment already
    // rewrites assignments to the canonical doc id, but resolve again here as a
    // last-mile guard in case `target` came from a path that wasn't enriched.
    const rawTargetId = String(target.id);
    const resolved = await UserSourceResolver.resolveBatch([rawTargetId]);
    const canonicalTargetId = resolved.get(rawTargetId)?.canonicalUserId || rawTargetId;

    const swap = {
      id: swapId,
      kind: 'swap',
      initiatorUserId: String(userId),
      initiatorUserName: userName,
      targetUserId: canonicalTargetId,
      ...(canonicalTargetId !== rawTargetId ? { targetWebClientUserId: rawTargetId } : {}),
      targetUserName: target.name || target.full_name || '',
      shiftA: { ...myShift },
      shiftB: { ...theirShift },
      status: 'pending',
      eligibleGroupIds: (eligibleGroupIds || []).map(String),
      monthKeys: [myShift.monthKey, theirShift.monthKey].filter(Boolean),
      createdAt: new Date().toISOString(),
      respondedAt: null,
      expiresAt: earlier,
    };
    Logger.info(`[OffersContext] proposeSwap → id=${swapId} init=${userId} target=${canonicalTargetId}${canonicalTargetId !== rawTargetId ? ` (raw=${rawTargetId})` : ''} shiftA.id=${myShift.id} shiftB.id=${theirShift.id}`);
    await FirebaseAdapter.createSwap(swap);
    Logger.info(`[OffersContext] proposeSwap → createSwap awaited (Firestore write done)`);
    ActivityLogger.swapProposed({
      selfName: userName,
      targetName: target.name || target.full_name || '',
      myShift, theirShift, swapId,
    });
    try {
      await NotificationService.notify(canonicalTargetId, 'swap_proposed_to_me', {
        title: `${userName} propôs uma troca`,
        body: `${_humanShiftLabel(myShift)} ⇄ ${_humanShiftLabel(theirShift)}`,
        payload: { swapId },
      });
    } catch (err) {
      Logger.warn(`[OffersContext] proposeSwap notify failed: ${err?.message}`);
    }
    setSwapsSent(prev => [swap, ...prev]);
    return { success: true, swapId };
  }, [userId, userName]);

  // ── Offer responses ───────────────────────────────────────────────────────
  const acceptOffer = useCallback(async (offer) => {
    if (isViewOnly(user)) return { success: false, reason: 'view_only' };
    if (!offer?.id || String(offer.toUserId) !== String(userId)) return { success: false };
    const result = await FirebaseAdapter.transferShift(offer.fromUserId, userId, offer.shiftSnapshot, {
      fromUserName: offer.fromUserName || null,
      toUserName: userName || null,
      actorUserId: userId,
    });
    if (!result.success) return { success: false };

    await FirebaseAdapter.respondOffer(offer.id, { status: 'accepted' });
    ActivityLogger.offerAccepted({
      selfName: userName,
      counterpartName: offer.fromUserName,
      offerId: offer.id,
      shift: offer.shiftSnapshot,
    });

    // Mirror into MY local cache as the new received shift
    const newShift = {
      ...offer.shiftSnapshot,
      id: result.newShiftId,
      userId,
      source: 'received',
      originUserId: String(offer.fromUserId),
      originalShiftId: String(offer.shiftSnapshot.id),
      transferredAt: new Date().toISOString(),
    };
    await LocalCache.saveManualShift(userId, newShift);

    // Tell the originator the outcome
    await NotificationService.notify(offer.fromUserId, 'offer_outcome', {
      title: `${userName} aceitou seu plantão`,
      body: _humanShiftLabel(offer.shiftSnapshot),
      payload: { offerId: offer.id, outcome: 'accepted' },
    });

    setOffersReceived(prev => prev.filter(o => o.id !== offer.id));
    return { success: true };
  }, [userId, userName]);

  const rejectOffer = useCallback(async (offer) => {
    if (!offer?.id) return { success: false };
    await FirebaseAdapter.respondOffer(offer.id, { status: 'rejected' });
    ActivityLogger.offerRejected({ selfName: userName, counterpartName: offer.fromUserName, offerId: offer.id });
    await NotificationService.notify(offer.fromUserId, 'offer_outcome', {
      title: `${userName} recusou seu plantão`,
      body: _humanShiftLabel(offer.shiftSnapshot),
      payload: { offerId: offer.id, outcome: 'rejected' },
    });
    setOffersReceived(prev => prev.filter(o => o.id !== offer.id));
    return { success: true };
  }, [userId, userName]);

  const cancelOffer = useCallback(async (offer) => {
    if (!offer?.id) return { success: false };
    await FirebaseAdapter.cancelOffer(offer.id);
    ActivityLogger.offerCancelled({ selfName: userName, offerId: offer.id });
    setOffersSent(prev => prev.filter(o => o.id !== offer.id));
    return { success: true };
  }, [userName]);

  // ── Swap responses ───────────────────────────────────────────────────────
  const acceptSwap = useCallback(async (swap) => {
    if (isViewOnly(user)) return { success: false, reason: 'view_only' };
    if (!swap?.id || String(swap.targetUserId) !== String(userId)) return { success: false };
    const result = await FirebaseAdapter.swapShifts(
      swap.initiatorUserId, userId, swap.shiftA, swap.shiftB,
      {
        uidAName: swap.initiatorUserName || null,
        uidBName: swap.targetUserName || userName || null,
        actorUserId: userId,
      },
    );
    if (!result.success) return { success: false };

    await FirebaseAdapter.respondSwap(swap.id, { status: 'accepted' });
    ActivityLogger.swapAccepted({ selfName: userName, counterpartName: swap.initiatorUserName, swapId: swap.id });

    // Mirror MY local cache: drop my shiftB, add shiftA (now received)
    try {
      await LocalCache.deleteManualShift(userId, swap.shiftB.id, swap.shiftB.monthKey);
    } catch {}
    const newShiftForMe = {
      ...swap.shiftA,
      id: result.newIdForB,
      userId,
      source: 'received',
      originUserId: String(swap.initiatorUserId),
      originalShiftId: String(swap.shiftA.id),
      transferredAt: new Date().toISOString(),
    };
    await LocalCache.saveManualShift(userId, newShiftForMe);

    await NotificationService.notify(swap.initiatorUserId, 'offer_outcome', {
      title: `${userName} aceitou sua troca`,
      body: `${_humanShiftLabel(swap.shiftA)} ⇄ ${_humanShiftLabel(swap.shiftB)}`,
      payload: { swapId: swap.id, outcome: 'accepted' },
    });

    setSwapsReceived(prev => prev.filter(s => s.id !== swap.id));
    return { success: true };
  }, [userId, userName]);

  const rejectSwap = useCallback(async (swap) => {
    if (!swap?.id) return { success: false };
    await FirebaseAdapter.respondSwap(swap.id, { status: 'rejected' });
    ActivityLogger.swapRejected({ selfName: userName, counterpartName: swap.initiatorUserName, swapId: swap.id });
    await NotificationService.notify(swap.initiatorUserId, 'offer_outcome', {
      title: `${userName} recusou sua troca`,
      body: `${_humanShiftLabel(swap.shiftA)} ⇄ ${_humanShiftLabel(swap.shiftB)}`,
      payload: { swapId: swap.id, outcome: 'rejected' },
    });
    setSwapsReceived(prev => prev.filter(s => s.id !== swap.id));
    return { success: true };
  }, [userId, userName]);

  const cancelSwap = useCallback(async (swap) => {
    if (!swap?.id) return { success: false };
    await FirebaseAdapter.cancelSwap(swap.id);
    ActivityLogger.swapCancelled({
      selfName: userName, swapId: swap.id,
      myShift: swap.shiftA, theirShift: swap.shiftB,
    });
    setSwapsSent(prev => prev.filter(s => s.id !== swap.id));
    return { success: true };
  }, [userName]);

  // ── Devolução: holder de aurora-shift recebido devolve dentro da janela 2h ──
  const devolverShift = useCallback(async (shift) => {
    if (!userId || !shift?.id || !shift?.originUserId || !shift?.monthKey) {
      return { success: false, reason: 'missing_fields' };
    }
    if (shift.source !== 'received') return { success: false, reason: 'not_received' };
    if (!isWithinDevolutionWindow(shift.cededAt)) return { success: false, reason: 'window_expired' };

    const result = await FirebaseAdapter.devolveShift(userId, shift, {
      fromUserName: userName || null,
      toUserName: shift.originUserName || null,
      actorUserId: userId,
    });
    if (!result.success) return { success: false, reason: 'write_failed' };

    // LocalCache: remover do holder atual (em ambos os buckets defensivamente).
    try {
      await LocalCache.deleteManualShift(userId, shift.id, shift.monthKey);
      await LocalCache.deleteRegularShift(userId, shift.id, shift.monthKey);
    } catch (err) {
      Logger.warn(`[OffersContext] devolverShift cache cleanup: ${err?.message}`);
    }

    // Notifica o originUser que recebeu de volta.
    try {
      await NotificationService.notify(shift.originUserId, 'offer_outcome', {
        title: `${userName || 'Colega'} devolveu um plantão`,
        body: _humanShiftLabel(shift),
        payload: { originalShiftId: shift.originalShiftId || null, outcome: 'devolved' },
      });
    } catch (err) {
      Logger.warn(`[OffersContext] devolverShift notify: ${err?.message}`);
    }

    return { success: true, newShiftId: result.newShiftId };
  }, [userId, userName]);

  // ── Inbox helpers ─────────────────────────────────────────────────────────
  const markInboxRead = useCallback(async (notifId) => {
    if (!userId) return;
    await NotificationService.markRead(userId, notifId);
  }, [userId]);

  const markAllInboxRead = useCallback(async () => {
    if (!userId) return;
    const unreadIds = inbox.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await NotificationService.markAllRead(userId, unreadIds);
  }, [userId, inbox]);

  const unreadCount = inbox.filter(n => !n.read).length;

  return (
    <OffersContext.Provider value={{
      offersSent, offersReceived, swapsSent, swapsReceived,
      inbox, unreadCount, prefs, loading,
      refresh,
      cedeOpenToGroup, cedeTargeted, proposeSwap,
      acceptOffer, rejectOffer, cancelOffer,
      acceptSwap, rejectSwap, cancelSwap,
      devolverShift,
      markInboxRead, markAllInboxRead, savePrefs,
    }}>
      {children}
    </OffersContext.Provider>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────────
async function _loadGroupMemberIds(userId, groupId) {
  try {
    const cached = await LocalCache.getGroupMembers(userId, groupId);
    return cached?.memberIds || [];
  } catch {
    return [];
  }
}

function _humanShiftLabel(shift) {
  if (!shift) return 'Plantão';
  const dateStr = shift.date || (shift.startISO || '').slice(0, 10) || '';
  const labelMap = { M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite' };
  const labelName = labelMap[shift.label] || shift.label || 'Plantão';
  return dateStr ? `${labelName} · ${fmtDateBR(dateStr)}` : labelName;
}
