/**
 * ActivityLogger — emite linhas legíveis no console rastreando as ações do
 * usuário (Trocar, Ceder, Aceitar, Cancelar, etc) + snapshot sanitizado do
 * estado atual de trocas/cessões.
 *
 * Saída sempre com prefixo `[ACT]` para facilitar grep no Expo / Metro:
 *
 *   [ACT] caco propôs troca: M 2026-05-28 (LIDER 1 HLF) ⇄ M 2026-05-25 (LIDER 1 HLF) com Raquel
 *   [ACT] caco abriu fluxo de troca com Raquel · plantão alvo: M 2026-05-25
 *   [ACT] caco cancelou troca id=swap_abc12345
 *   [ACT] raquel aceitou troca de caco · id=swap_abc12345
 *   [ACT] SNAPSHOT caco: {"swapsSent":[{...sanitized}], "swapsReceived":[...], "offersSent":[...], "offersReceived":[...]}
 */

import Logger from './Logger';

const _shiftLabel = (sh) => {
  if (!sh) return '?';
  const lbl = (sh.label || '?').toString().charAt(0);
  const date = sh.date || (sh.startISO || '').slice(0, 10) || '?';
  const group = sh.group?.name || sh.group?.institution?.name || '';
  return group ? `${lbl} ${date} (${group})` : `${lbl} ${date}`;
};

const _name = (n) => (typeof n === 'string' && n ? n : '?');

// Ring buffer in memory — last 100 actions. Available via getBuffer() for an
// in-app inspector screen if desired.
const _buffer = [];
const _push = (line) => {
  _buffer.push({ ts: new Date().toISOString(), line });
  while (_buffer.length > 100) _buffer.shift();
};

const _emit = (line) => {
  Logger.info(`[ACT] ${line}`);
  _push(line);
};

// ── Public log helpers ────────────────────────────────────────────────────────

const _ActivityLogger = {
  /** User opened the Trocar flow targeting a specific person (and optionally specific shift). */
  trocarOpened: (selfName, targetName, targetShift) => {
    const target = targetShift ? `${_name(targetName)} · plantão alvo: ${_shiftLabel(targetShift)}` : _name(targetName);
    _emit(`${_name(selfName)} abriu fluxo de troca com ${target}`);
  },

  /** User confirmed a swap proposal. */
  swapProposed: ({ selfName, targetName, myShift, theirShift, swapId }) => {
    _emit(
      `${_name(selfName)} propôs troca: ${_shiftLabel(myShift)} ⇄ ${_shiftLabel(theirShift)} com ${_name(targetName)} (id=${swapId})`
    );
  },

  /** User cancelled their own swap proposal. */
  swapCancelled: ({ selfName, swapId, myShift, theirShift }) => {
    _emit(
      `${_name(selfName)} cancelou troca ${_shiftLabel(myShift)} ⇄ ${_shiftLabel(theirShift)} · id=${swapId}`
    );
  },

  /** Target accepted a swap proposal. */
  swapAccepted: ({ selfName, counterpartName, swapId }) => {
    _emit(`${_name(selfName)} aceitou troca de ${_name(counterpartName)} · id=${swapId}`);
  },

  /** Target rejected a swap proposal. */
  swapRejected: ({ selfName, counterpartName, swapId }) => {
    _emit(`${_name(selfName)} recusou troca de ${_name(counterpartName)} · id=${swapId}`);
  },

  /** Cede actions */
  cedeOpened: (selfName, shift, mode) => {
    _emit(`${_name(selfName)} abriu fluxo de ceder (${mode}): ${_shiftLabel(shift)}`);
  },
  cedeToGroup: ({ selfName, shift, openingId }) => {
    _emit(`${_name(selfName)} cedeu ao grupo: ${_shiftLabel(shift)} (opening=${openingId})`);
  },
  cedeTargeted: ({ selfName, targetName, shift, offerId }) => {
    _emit(`${_name(selfName)} cedeu a ${_name(targetName)}: ${_shiftLabel(shift)} (offer=${offerId})`);
  },
  offerAccepted: ({ selfName, counterpartName, offerId, shift }) => {
    _emit(`${_name(selfName)} aceitou cessão de ${_name(counterpartName)}: ${_shiftLabel(shift)} (offer=${offerId})`);
  },
  offerRejected: ({ selfName, counterpartName, offerId }) => {
    _emit(`${_name(selfName)} recusou cessão de ${_name(counterpartName)} · offer=${offerId}`);
  },
  offerCancelled: ({ selfName, offerId }) => {
    _emit(`${_name(selfName)} cancelou cessão · offer=${offerId}`);
  },

  /** UI state transition for a row's button (e.g., "trocar" → "cancelar"). */
  buttonStateChange: ({ selfName, rowName, before, after }) => {
    _emit(`${_name(selfName)} botão de ${_name(rowName)}: ${before} → ${after}`);
  },

  /** Full sanitized snapshot. Call e.g. on every OffersContext refresh. */
  snapshot: ({ selfId, selfName, swapsSent = [], swapsReceived = [], offersSent = [], offersReceived = [] }) => {
    const sane = (list, side) => list
      .filter(x => x?.status === 'pending')
      .map(x => {
        if (x.kind === 'swap') {
          return {
            id: x.id,
            with: side === 'sent' ? x.targetUserName : x.initiatorUserName,
            give: _shiftLabel(side === 'sent' ? x.shiftA : x.shiftB),
            receive: _shiftLabel(side === 'sent' ? x.shiftB : x.shiftA),
            createdAt: x.createdAt,
          };
        }
        return {
          id: x.id,
          kind: x.kind || 'cede',
          with: side === 'sent' ? x.toUserName : x.fromUserName,
          shift: _shiftLabel(x.shiftSnapshot || x.shift),
          createdAt: x.createdAt,
        };
      });
    const payload = {
      swapsSent:      sane(swapsSent,      'sent'),
      swapsReceived:  sane(swapsReceived,  'received'),
      offersSent:     sane(offersSent,     'sent'),
      offersReceived: sane(offersReceived, 'received'),
    };
    _emit(`SNAPSHOT ${_name(selfName)} (${selfId}): ${JSON.stringify(payload)}`);
  },

  /** Returns the in-memory ring buffer for an in-app inspector. */
  getBuffer: () => [..._buffer],

  /** Clears the buffer (e.g., on logout). */
  clear: () => { _buffer.length = 0; },
};

export default _ActivityLogger;
