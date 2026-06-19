/**
 * MovementExpiry — auto-expiry centralizado de movimentações.
 *
 * Substitui as 3 fontes de expiração que existiam dispersas:
 *   - OffersContext.refresh (lazy check em offers/swaps)
 *   - OffersContext realtime handler (marca expired in-line)
 *   - SwapAuctionsContext.refresh (expira auctions)
 *
 * Roda numa única chamada `sweepExpired(uid)` disparada em:
 *   - App mount (ver App.js)
 *   - AppState 'active' (volta do background)
 *   - Pull-to-refresh em telas de Movimentações/Vagas/Histórico
 *
 * Faz queries scoped ao user atual, marca docs com expiresAt < now como
 * expired no servidor. Erros são silenciados (best-effort) — o filtro
 * em UI já cuida de não exibir expirados via MovementHelpers.isPending.
 */

import { isExpired } from '../utils/MovementHelpers';
import FirebaseAdapter from './firebase/FirebaseAdapter';
import Logger from '../utils/Logger';

let lastSweepAt = 0;
const MIN_GAP_MS = 30_000; // não roda mais que 1× a cada 30s

/**
 * Varre as 4 coleções de movimentação procurando itens com expiresAt no passado
 * que ainda estão como 'pending'/'active'/'open'. Marca como expired no servidor.
 *
 * @param {string} uid — usuário atual; sem ele, no-op.
 * @param {Object} [opts]
 * @param {boolean} [opts.force=false] — pula o gap de 30s entre runs.
 * @returns {Promise<{ offers: number, swaps: number, auctions: number, openings: number }>}
 */
export const sweepExpired = async (uid, { force = false } = {}) => {
  const empty = { offers: 0, swaps: 0, auctions: 0, openings: 0 };
  if (!uid) return empty;
  const now = Date.now();
  if (!force && now - lastSweepAt < MIN_GAP_MS) return empty;
  lastSweepAt = now;

  try {
    const [offers, swaps, auctions, openings] = await Promise.allSettled([
      _sweepOffers(uid),
      _sweepSwaps(uid),
      _sweepAuctions(uid),
      _sweepOpenings(uid),
    ]);
    const result = {
      offers:   offers.status   === 'fulfilled' ? offers.value   : 0,
      swaps:    swaps.status    === 'fulfilled' ? swaps.value    : 0,
      auctions: auctions.status === 'fulfilled' ? auctions.value : 0,
      openings: openings.status === 'fulfilled' ? openings.value : 0,
    };
    const total = result.offers + result.swaps + result.auctions + result.openings;
    if (total > 0) {
      Logger.info(`[MovementExpiry] sweep ${uid}: ${total} expirados (offers=${result.offers} swaps=${result.swaps} auctions=${result.auctions} openings=${result.openings})`);
    }
    return result;
  } catch (err) {
    Logger.warn(`[MovementExpiry] sweep falhou: ${err?.message}`);
    return empty;
  }
};

// ── Internals — cada coleção tem sua query + write own ───────────────────────

const _sweepOffers = async (uid) => {
  const items = await FirebaseAdapter.getPendingOffersForUser(uid).catch(() => []);
  let n = 0;
  for (const o of (items || [])) {
    if (o.status === 'pending' && isExpired(o)) {
      FirebaseAdapter.respondOffer(o.id, { status: 'expired' }).catch(() => {});
      n++;
    }
  }
  return n;
};

const _sweepSwaps = async (uid) => {
  const items = await FirebaseAdapter.getPendingSwapsForUser(uid).catch(() => []);
  let n = 0;
  for (const s of (items || [])) {
    if (s.status === 'pending' && isExpired(s)) {
      FirebaseAdapter.respondSwap(s.id, { status: 'expired' }).catch(() => {});
      n++;
    }
  }
  return n;
};

const _sweepAuctions = async (uid) => {
  // [DEPRECATED-AUCTION] — auctions vão sair na Fase 3. Mantém limpeza até lá.
  if (typeof FirebaseAdapter.getMyAuctions !== 'function') return 0;
  const items = await FirebaseAdapter.getMyAuctions(uid).catch(() => []);
  let n = 0;
  for (const a of (items || [])) {
    if (a.status === 'open' && isExpired(a)) {
      FirebaseAdapter.expireSwapAuction(a.id).catch(() => {});
      n++;
    }
  }
  return n;
};

const _sweepOpenings = async (uid) => {
  // Minhas cessões + admin vagas que eu criei. Marca expired quando passou.
  if (typeof FirebaseAdapter.getMyOpenings !== 'function') return 0;
  const items = await FirebaseAdapter.getMyOpenings(uid).catch(() => []);
  let n = 0;
  for (const o of (items || [])) {
    if (o.status === 'active' && isExpired(o)) {
      // Reaproveita saveOpening pra atualizar status (merge).
      FirebaseAdapter.saveOpening({ id: o.id, status: 'expired', expiredAt: new Date().toISOString() }).catch(() => {});
      n++;
    }
  }
  return n;
};

export default { sweepExpired };
