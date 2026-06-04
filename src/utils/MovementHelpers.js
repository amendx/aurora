/**
 * MovementHelpers — utilitários centralizados pra todo "movimento" de plantão.
 *
 * Aceita docs de qualquer coleção: openings, shiftOffers, shiftSwaps,
 * tradeIntents, swapAuctions (deprecated). Discrimina pelo shape.
 *
 * Use estas funções em vez de filtros inline como `o.status === 'pending'` —
 * o objetivo é zerar a duplicação de regras de "está pendente / expirado" em
 * OffersContext, OpeningsContext, HistoricoScreen, TrocasAbertasScreen, etc.
 *
 * Ver glossário em src/models/index.js.
 */

/**
 * Classifica o item em uma das categorias do glossário.
 * @param {Object} item
 * @returns {'cede_group'|'cede_targeted'|'swap'|'intent'|'auction'|'vaga_admin_temp'|'vaga_admin_fixed'|'unknown'}
 */
export const classifyMovement = (item) => {
  if (!item) return 'unknown';
  // Openings (tem kind discriminador)
  if (item.slots !== undefined || item.kind === 'cede' || item.kind === 'admin_temp' || item.kind === 'admin_fixed') {
    if (item.kind === 'admin_temp') return 'vaga_admin_temp';
    if (item.kind === 'admin_fixed') return 'vaga_admin_fixed';
    // 'cede' (default pra openings legados sem kind)
    return 'cede_group';
  }
  // ShiftOffer (cessão direcionada)
  if (item.fromUserId && item.toUserId && item.kind === 'cede') return 'cede_targeted';
  if (item.fromUserId && item.toUserId && item.shiftSnapshot) return 'cede_targeted';
  // ShiftSwap (troca direcionada)
  if (item.initiatorUserId && item.targetUserId && item.shiftA && item.shiftB) return 'swap';
  // TradeIntent
  if (item.initiatorUserId && item.offeredShift && item.preferences) {
    // Auction legado tem matchedBidId; intent tem matchedSwapId.
    if (item.matchedSwapId !== undefined) return 'intent';
    if (item.matchedBidId !== undefined || item.expiredAt !== undefined) return 'auction';
    return 'intent';
  }
  return 'unknown';
};

/**
 * Verdade compartilhada de "este movimento está expirado pelo tempo".
 * Não consulta status — só tempo. Use combinado com isPending pra UI.
 * @param {Object} item
 * @param {number} [now] timestamp ms — default Date.now()
 * @returns {boolean}
 */
export const isExpired = (item, now = Date.now()) => {
  if (!item?.expiresAt) return false;
  const t = new Date(item.expiresAt).getTime();
  if (Number.isNaN(t)) return false;
  return t <= now;
};

/**
 * Status que indica "ainda em jogo, pode ter ação".
 * Convenção unificada — cada coleção usa um vocabulário ligeiramente diferente:
 *
 *   - openings:     'active'
 *   - shiftOffers:  'pending'
 *   - shiftSwaps:   'pending'
 *   - tradeIntents: 'open'
 *   - swapAuctions: 'open'  (deprecated)
 *
 * `isPending` aceita qualquer um deles como sinal de "vivo".
 *
 * @param {Object} item
 * @param {number} [now]
 * @returns {boolean}
 */
export const isPending = (item, now = Date.now()) => {
  if (!item) return false;
  const live = new Set(['active', 'pending', 'open']);
  if (!live.has(item.status)) return false;
  if (isExpired(item, now)) return false;
  // Openings: precisa ter slot aberto
  if (Array.isArray(item.slots)) {
    return item.slots.some(s => s?.status === 'open');
  }
  return true;
};

/**
 * Status terminais (não voltam pra pending). Útil pra histórico.
 * @param {Object} item
 * @returns {boolean}
 */
export const isTerminal = (item) => {
  const terminal = new Set(['accepted', 'rejected', 'cancelled', 'expired', 'claimed', 'matched', 'fulfilled']);
  return terminal.has(item?.status);
};

/**
 * Resolve o nome da contraparte pra exibição na UI ("Você dá pra X", "X te ofereceu").
 *
 * @param {Object} item
 * @param {string|number} myUid
 * @returns {string|null}
 */
export const counterpartName = (item, myUid) => {
  if (!item || myUid == null) return null;
  const me = String(myUid);
  const k = classifyMovement(item);
  switch (k) {
    case 'cede_targeted':
      if (String(item.fromUserId) === me) return item.toUserName || null;
      if (String(item.toUserId) === me) return item.fromUserName || null;
      return null;
    case 'swap':
      if (String(item.initiatorUserId) === me) return item.targetUserName || null;
      if (String(item.targetUserId) === me) return item.initiatorUserName || null;
      return null;
    case 'cede_group':
    case 'vaga_admin_temp':
    case 'vaga_admin_fixed':
      // Pro cedente/criador, contraparte é "qualquer membro do grupo".
      // Pra quem vê, é o cedente/criador.
      if (item.originUserId && String(item.originUserId) === me) return null;
      return item.originUserName || null;
    case 'intent':
    case 'auction':
      if (String(item.initiatorUserId) === me) return null;
      return item.initiatorName || null;
    default:
      return null;
  }
};

/**
 * Label humano pro status. Pra exibir em chips/badges.
 * @param {Object} item
 * @returns {string}
 */
export const labelForStatus = (item) => {
  if (!item?.status) return '';
  switch (item.status) {
    case 'active':
    case 'pending':
    case 'open':
      return isExpired(item) ? 'Expirado' : 'Aguardando';
    case 'accepted':   return 'Aceito';
    case 'rejected':   return 'Recusado';
    case 'cancelled':  return 'Cancelado';
    case 'expired':    return 'Expirado';
    case 'claimed':    return 'Assumido';
    case 'matched':    return 'Concluído';
    case 'fulfilled':  return 'Concluído';
    default:           return item.status;
  }
};

/**
 * Direção do movimento na perspectiva do user (quem deu / quem recebeu).
 * Não distingue tipo — útil pra agrupar em "Minhas" vs "Recebidas".
 *
 * @param {Object} item
 * @param {string|number} myUid
 * @returns {'sent'|'received'|'none'}
 */
export const directionForUser = (item, myUid) => {
  if (!item || myUid == null) return 'none';
  const me = String(myUid);
  const k = classifyMovement(item);
  switch (k) {
    case 'cede_targeted':
      if (String(item.fromUserId) === me) return 'sent';
      if (String(item.toUserId) === me)   return 'received';
      return 'none';
    case 'swap':
      if (String(item.initiatorUserId) === me) return 'sent';
      if (String(item.targetUserId) === me)    return 'received';
      return 'none';
    case 'cede_group':
    case 'vaga_admin_temp':
    case 'vaga_admin_fixed':
      // Pro criador: 'sent'. Pra qualquer outro membro: 'received'.
      if (item.originUserId && String(item.originUserId) === me) return 'sent';
      if (item.createdBy && String(item.createdBy) === me)       return 'sent';
      return 'received';
    case 'intent':
    case 'auction':
      if (String(item.initiatorUserId) === me) return 'sent';
      return 'received';
    default:
      return 'none';
  }
};

export default {
  classifyMovement,
  isExpired,
  isPending,
  isTerminal,
  counterpartName,
  labelForStatus,
  directionForUser,
};
