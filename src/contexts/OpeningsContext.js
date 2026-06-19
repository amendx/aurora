import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { isViewOnly } from '../utils/userSource';
import { useGroups } from './GroupsContext';
import LocalCache from '../services/LocalCache';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';
import { db } from '../services/firebase/config';
import { collection, query, where, onSnapshot } from '../services/firebase/fdb';
import { fromFirestore } from '../utils/OpeningNormalizer';
import NotificationService from '../services/NotificationService';
import Logger from '../utils/Logger';
import { fmtDateBR } from '../utils/formatDate';
import { makeLogEntry, appendLog, TRANSFER_LOG_TYPES } from '../utils/shiftTransferLog';

const OpeningsContext = createContext();

// Vaga FIXA de escala (admin_fixed): médicos demonstram interesse e o escalista
// decide remotamente. Vaga AVULSA (admin_temp) é "primeiro a pegar leva" — vai
// pelo claim normal, não por interesse. Cessão (cede) também é claim.
export const isInterestVaga = (o) => o?.kind === 'admin_fixed';

// Audiência: quando o escalista publica "para selecionados", a vaga só vale para
// os uids em eligibleUserIds. 'todos'/ausente (e cessões) → qualquer membro do grupo.
export const isEligibleForUser = (o, uid) => {
  if (o?.audience === 'selecionados' && Array.isArray(o.eligibleUserIds) && o.eligibleUserIds.length) {
    return o.eligibleUserIds.map(String).includes(String(uid));
  }
  return true;
};

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

  // groupIdsKey — string estável; previne resubscription do listener quando o
  // `groups` muda de referência sem mudar o conteúdo (ver project_context_value_loops).
  const groupIdsRef = useRef([]);
  const groupIdsKey = useMemo(() => {
    const ids = _groupIds();
    groupIdsRef.current = ids;
    return ids.slice().sort().join(',');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  // ── Realtime listeners (onSnapshot) ───────────────────────────────────────
  // Substituem o `refresh` one-shot como fonte primária — quando uma vaga é
  // criada/atualizada/cancelada (no aurora-web ou no próprio app), o usuário
  // vê em ~ms. `refresh()` permanece como escape hatch (pull-to-refresh).
  //
  // Subscreve 2+ streams: 1 por chunk de até 10 groupIds (Firestore `in` limita)
  // + 1 pra `originUserId == userId`. Buckets compartilhados (allDocs Map) são
  // mesclados via debounce de 100ms num flush único pra evitar setState em rajada.
  useEffect(() => {
    if (!userId || !db) {
      setOpenings([]); setMyCededOpenings([]);
      return;
    }
    const groupIds = groupIdsRef.current;
    const allDocs = new Map();         // openingId → raw doc (status='active' apenas)
    let flushTimer = null;

    const flush = () => {
      const claimable = [];
      const mine = [];
      const seen = new Set();
      for (const raw of allDocs.values()) {
        const o = fromFirestore(raw);
        if (!o?.id || seen.has(o.id)) continue;
        seen.add(o.id);
        if (o.originUserId && String(o.originUserId) === String(userId)) {
          if (o.claimable) mine.push(o);
        } else {
          if (o.restrictedToGroupId && !groupIds.includes(String(o.restrictedToGroupId))) continue;
          if (!isEligibleForUser(o, userId)) continue; // respeita audiência 'selecionados'
          if (o.claimable) claimable.push(o);
        }
      }
      claimable.sort((a, b) => (a.startISO || '').localeCompare(b.startISO || ''));
      mine.sort((a, b) => (a.startISO || '').localeCompare(b.startISO || ''));
      setOpenings(claimable);
      setMyCededOpenings(mine);
    };
    const scheduleFlush = () => {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 100);
    };

    const handler = (label) => (snap) => {
      snap.docChanges().forEach(ch => {
        const data = { id: ch.doc.id, ...ch.doc.data() };
        if (ch.type === 'removed' || data.status !== 'active') {
          allDocs.delete(ch.doc.id);
        } else {
          allDocs.set(ch.doc.id, data);
        }
      });
      Logger.debug(`[OpeningsContext] ${label} snap size=${snap.size} totalBucket=${allDocs.size}`);
      scheduleFlush();
    };
    const errHandler = (label) => (err) => {
      Logger.warn(`[OpeningsContext] FAIL ${label}: ${err?.code || ''} ${err?.message}`);
    };

    const unsubs = [];
    // Chunk de 10 (limite do operador `in` do Firestore)
    for (let i = 0; i < groupIds.length; i += 10) {
      const chunk = groupIds.slice(i, i + 10);
      const q = query(
        collection(db, 'openings'),
        where('group.id', 'in', chunk),
        where('status', '==', 'active'),
      );
      unsubs.push(onSnapshot(q, handler(`group[${i / 10}]`), errHandler(`group[${i / 10}]`)));
    }
    // Minhas cessões (qualquer grupo)
    unsubs.push(onSnapshot(
      query(
        collection(db, 'openings'),
        where('originUserId', '==', String(userId)),
        where('status', '==', 'active'),
      ),
      handler('mine'),
      errHandler('mine'),
    ));

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      unsubs.forEach(u => { try { u && u(); } catch {} });
    };
  }, [userId, groupIdsKey]);

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
      const groupIds = _groupIds();

      // Duas queries em paralelo:
      //   1) Openings em meus grupos atuais — pra mostrar como vagas.
      //   2) Openings que EU criei (qualquer grupo) — pra "minhas cessões",
      //      mesmo se o grupo não está mais em groupIds (ex.: cedi um plantão
      //      snapshotado de grupo webClient e depois entrei em aurora-only).
      const [groupDocs, mineDocs] = await Promise.all([
        groupIds.length
          ? FirebaseAdapter.getOpeningsForGroups(groupIds)
          : Promise.resolve([]),
        FirebaseAdapter.getMyOpenings(userId),
      ]);

      // Minhas primeiro — entram em `mine` independente do grupo.
      mineDocs.forEach(d => {
        const o = fromFirestore(d);
        if (!o?.id || seen.has(o.id)) return;
        seen.add(o.id);
        if (o.claimable) mine.push(o);
      });

      // Openings de colegas — vão pra `claimable` se ainda restritas ao grupo.
      groupDocs.forEach(d => {
        const o = fromFirestore(d);
        if (!o?.id || seen.has(o.id)) return;
        seen.add(o.id);
        if (o.originUserId && String(o.originUserId) === String(userId)) return; // já em mine
        if (o.restrictedToGroupId && !groupIds.includes(String(o.restrictedToGroupId))) return;
        if (!isEligibleForUser(o, userId)) return; // respeita audiência 'selecionados'
        claimable.push(o);
      });

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
    if (isViewOnly(user)) return { success: false, reason: 'view_only' };
    const opening = openings.find(o => o.id === openingId);
    if (!opening || !opening.claimable) return { success: false, reason: 'not_claimable' };
    // Vaga de escala (admin) não é "primeiro a pegar": o médico demonstra
    // interesse e o escalista escolhe remotamente. Sem claim direto.
    if (isInterestVaga(opening)) return { success: false, reason: 'interest_only' };

    try {
      await FirebaseAdapter.claimSlot(openingId, slotId, userId);

      const isCedeBacked = !!opening.originUserId && !!opening.originShiftId;
      if (isCedeBacked) {
        NotificationService.notify(opening.originUserId, 'offer_outcome', {
          title: 'Plantão cedido foi assumido',
          body: `${opening.group?.name || 'Grupo'} · ${fmtDateBR(opening.dateKey || (opening.startISO || '').slice(0, 10))}`,
          payload: { openingId, outcome: 'accepted' },
        }).catch(() => {});
      }

      // Build the received shift, preserving the original snapshot when present
      // so the claimant gets the full shift shape (time string, etc.).
      const snapshot = opening.originShiftSnapshot || {};
      const newShiftId = `received_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const nowIso = new Date().toISOString();
      const transferLog = appendLog(snapshot?.transferLog, makeLogEntry({
        type: TRANSFER_LOG_TYPES.CEDE,
        fromUserId: opening.originUserId,
        fromUserName: opening.originUserName || null,
        toUserId: userId,
        toUserName: user?.name || null,
        actorUserId: userId,
        openingId,
      }));
      const shift = {
        ...snapshot,
        id: newShiftId,
        userId,
        source: 'received',
        openingId,
        originUserId: opening.originUserId || null,
        originUserName: opening.originUserName || null,
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
        transferredAt: nowIso,
        transferLog,
        cededAt: nowIso,
        currentHolderUserId: String(userId),
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
   * Demonstrar interesse numa vaga de escala (admin). O escalista escolhe
   * remotamente entre os interessados — não há claim direto aqui.
   */
  const registerInterest = useCallback(async (openingId, person) => {
    if (isViewOnly(user)) return { success: false, reason: 'view_only' };
    const interest = {
      userId: String(userId),
      name: person?.name || person?.full_name || 'Colega',
      council: person?.council || '',
      photo: person?.photo || null,
      at: new Date().toISOString(),
    };
    try {
      await FirebaseAdapter.addOpeningInterest(openingId, interest);
      setOpenings(prev => prev.map(o => {
        if (o.id !== openingId) return o;
        if ((o.interests || []).some(i => String(i.userId) === String(userId))) return o;
        return { ...o, interests: [...(o.interests || []), interest] };
      }));
      // Avisa quem abriu a vaga (escalista) que há um interessado.
      const opening = openings.find(o => o.id === openingId);
      const creatorId = opening?.createdBy || opening?.originUserId;
      if (creatorId) {
        NotificationService.notify(creatorId, 'ceder_in_my_group', {
          title: 'Novo interessado na vaga',
          body: `${interest.name} quer ${opening.group?.name || 'o plantão'}`,
          payload: { openingId },
        }).catch(() => {});
      }
      return { success: true };
    } catch (err) {
      Logger.error(`[OpeningsContext] registerInterest: ${err?.message}`);
      return { success: false };
    }
  }, [openings, userId]);

  const withdrawInterest = useCallback(async (openingId) => {
    try {
      await FirebaseAdapter.removeOpeningInterest(openingId, userId);
      setOpenings(prev => prev.map(o =>
        o.id === openingId
          ? { ...o, interests: (o.interests || []).filter(i => String(i.userId) !== String(userId)) }
          : o
      ));
      return { success: true };
    } catch (err) {
      Logger.error(`[OpeningsContext] withdrawInterest: ${err?.message}`);
      return { success: false };
    }
  }, [userId]);

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
    <OpeningsContext.Provider value={{ openings, myCededOpenings, loading, error, refresh, claimOpening, cancelCedeOpening, registerInterest, withdrawInterest }}>
      {children}
    </OpeningsContext.Provider>
  );
};
