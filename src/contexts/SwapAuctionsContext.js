/**
 * SwapAuctionsContext — "Trocar aberto ao grupo" (auction-style swap requests).
 *
 * Doctor A publishes "I want to swap my shift S for any T/N on weekdays within group G".
 * Other doctors with a compatible shift place a bid offering one of theirs.
 * A picks a bid → atomic swap executes; sibling bids get rejected client-side.
 *
 * Firestore:
 *   swapAuctions/{auctionId}
 *     initiatorUserId, initiatorName, offeredShift, preferences, status, expiresAt
 *   swapAuctions/{auctionId}/bids/{bidId}
 *     bidderUserId, bidderName, offeredShift, status
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useGroups } from './GroupsContext';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';
import Logger from '../utils/Logger';

const SwapAuctionsContext = createContext(null);

export const useSwapAuctions = () => {
  const ctx = useContext(SwapAuctionsContext);
  if (!ctx) throw new Error('useSwapAuctions must be used within SwapAuctionsProvider');
  return ctx;
};

const _id = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const _now = () => new Date().toISOString();

/**
 * Compatibility check for a bid against the auction's preferences.
 * Pure function so we can validate both at submit time and on listing.
 */
export const isBidCompatible = (auction, candidateShift) => {
  if (!auction || !candidateShift) return false;
  const prefs = auction.preferences || {};
  const labels = Array.isArray(prefs.labels) ? prefs.labels : [];
  if (labels.length > 0) {
    const label = (candidateShift.label || '').charAt(0).toUpperCase();
    if (!labels.includes(label)) return false;
  }
  const groupIds = Array.isArray(prefs.groupIds) ? prefs.groupIds.map(String) : [];
  if (groupIds.length > 0) {
    const gid = String(candidateShift.group?.id || '');
    if (gid && !groupIds.includes(gid)) return false;
  }
  if (prefs.periodScope && prefs.periodScope !== 'any') {
    const dateStr = candidateShift.date || (candidateShift.startISO || '').slice(0, 10);
    if (dateStr) {
      // Use noon to dodge timezone edge cases at midnight.
      const d = new Date(`${dateStr}T12:00:00`);
      if (!isNaN(d.getTime())) {
        const dow = d.getDay(); // 0 = Sun
        const isWeekend = dow === 0 || dow === 6;
        if (prefs.periodScope === 'weekend' && !isWeekend) return false;
        if (prefs.periodScope === 'weekday' && isWeekend) return false;
      }
    }
  }
  return true;
};

export const SwapAuctionsProvider = ({ children }) => {
  const { user } = useContext(AuthContext);
  const { groups: userGroups } = useGroups();
  const userId = user?.id ? String(user.id) : null;
  const userName = user?.name || user?.full_name || '';

  const groupIds = useMemo(
    () => (userGroups || []).map(g => String(g?.id || '')).filter(Boolean),
    [userGroups]
  );

  const [auctions, setAuctions] = useState([]);     // open in my groups
  const [myAuctions, setMyAuctions] = useState([]); // auctions I created
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [open, mine] = await Promise.all([
        FirebaseAdapter.getSwapAuctionsForGroups(groupIds),
        FirebaseAdapter.getMyAuctions(userId),
      ]);
      // Hide expired locally + remove my own from the "open" list (UX: don't bid on yourself)
      const now = Date.now();
      const filterActive = a => a.status === 'open' && (!a.expiresAt || new Date(a.expiresAt).getTime() > now);
      setAuctions(open.filter(filterActive).filter(a => String(a.initiatorUserId) !== userId));
      setMyAuctions(mine);
    } catch (err) {
      Logger.warn(`[SwapAuctions] refresh: ${err?.message}`);
    } finally {
      setLoading(false);
    }
  }, [userId, groupIds]);

  useEffect(() => { refresh(); }, [refresh]);

  const createAuction = useCallback(async ({ shift, preferences }) => {
    if (!userId || !shift?.id) return { success: false };
    const auctionId = `auc_${_id()}`;
    const expiresAt = shift.startISO || (shift.date ? `${shift.date}T00:00:00` : null);
    const auction = {
      id: auctionId,
      initiatorUserId: userId,
      initiatorName: userName,
      offeredShift: shift,
      preferences: {
        labels: preferences?.labels || [],
        periodScope: preferences?.periodScope || 'any',
        groupIds: (preferences?.groupIds || [String(shift.group?.id)]).filter(Boolean),
      },
      status: 'open',
      matchedBidId: null,
      createdAt: _now(),
      expiresAt,
    };
    await FirebaseAdapter.createSwapAuction(auction);
    setMyAuctions(prev => [auction, ...prev]);
    return { success: true, auctionId };
  }, [userId, userName]);

  const cancelAuction = useCallback(async (auctionId) => {
    if (!userId || !auctionId) return { success: false };
    await FirebaseAdapter.cancelSwapAuction(auctionId);
    setMyAuctions(prev => prev.map(a => a.id === auctionId ? { ...a, status: 'cancelled' } : a));
    return { success: true };
  }, [userId]);

  const submitBid = useCallback(async (auction, candidateShift) => {
    if (!userId || !auction?.id || !candidateShift?.id) return { success: false };
    if (!isBidCompatible(auction, candidateShift)) {
      return { success: false, reason: 'incompatible' };
    }
    const bidId = `bid_${_id()}`;
    const bid = {
      id: bidId,
      bidderUserId: userId,
      bidderName: userName,
      offeredShift: candidateShift,
      status: 'pending',
      createdAt: _now(),
      respondedAt: null,
    };
    await FirebaseAdapter.submitBid(auction.id, bid);
    return { success: true, bidId };
  }, [userId, userName]);

  const withdrawBid = useCallback(async (auctionId, bidId) => {
    if (!auctionId || !bidId) return { success: false };
    await FirebaseAdapter.withdrawBid(auctionId, bidId);
    return { success: true };
  }, []);

  const acceptBid = useCallback(async (auction, bid) => {
    if (!userId || !auction?.id || !bid?.id) return { success: false };
    if (String(auction.initiatorUserId) !== userId) return { success: false, reason: 'not_initiator' };
    const result = await FirebaseAdapter.acceptBid(
      auction.id, bid.id,
      auction.initiatorUserId, bid.bidderUserId,
      auction.offeredShift, bid.offeredShift,
    );
    if (!result.success) return { success: false };
    setMyAuctions(prev => prev.map(a => a.id === auction.id ? { ...a, status: 'matched', matchedBidId: bid.id } : a));
    return { success: true };
  }, [userId]);

  const getBids = useCallback(async (auctionId) => {
    return FirebaseAdapter.getBidsForAuction(auctionId);
  }, []);

  return (
    <SwapAuctionsContext.Provider value={{
      auctions, myAuctions, loading, refresh,
      createAuction, cancelAuction,
      submitBid, withdrawBid, acceptBid, getBids,
    }}>
      {children}
    </SwapAuctionsContext.Provider>
  );
};
