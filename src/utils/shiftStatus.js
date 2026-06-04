// Status semântico do plantão pra UI (DayView novo). Derivado do shift atual
// + pendências já anotadas pelo caller. Tipos:
//   confirmado      — meu plantão sem pendências
//   a_confirmar     — placeholder; ainda não temos sinal pra disparar (TODO)
//   em_troca        — troca proposta (envio ou recebimento) ou oferta de cessão direcionada pendente
//   troca_recebida  — troca direcionada PRA MIM, ainda não respondida
//   cedido          — cessão aberta ao grupo pendente (eu cedi)
//   cobrindo        — recebi via cede/troca (source='received') e ainda está comigo
//   cancelado       — sem trigger atual; reservado pra futuro
//
// Tons (alinhados ao mockup C standalone):
//   money | warn | info | violet | muted
export const SHIFT_STATUS = Object.freeze({
  CONFIRMADO:     'confirmado',
  A_CONFIRMAR:    'a_confirmar',
  EM_TROCA:       'em_troca',
  TROCA_RECEBIDA: 'troca_recebida',
  CEDIDO:         'cedido',
  COBRINDO:       'cobrindo',
  CANCELADO:      'cancelado',
});

export const SHIFT_STATUS_META = Object.freeze({
  confirmado:     { tone: 'money',  icon: 'check', label: 'Confirmado',            desc: 'Plantão garantido na sua escala.' },
  a_confirmar:    { tone: 'warn',   icon: 'clock', label: 'A confirmar',           desc: 'Aguardando você confirmar presença.' },
  em_troca:       { tone: 'info',   icon: 'swap',  label: 'Em troca',              desc: 'Proposta de troca enviada — aguardando resposta.' },
  troca_recebida: { tone: 'info',   icon: 'swap',  label: 'Troca proposta a você', desc: 'Um colega quer trocar este plantão com você.' },
  cedido:         { tone: 'warn',   icon: 'cede',  label: 'Cedido ao grupo',       desc: 'Disponível para alguém do grupo assumir.' },
  cobrindo:       { tone: 'violet', icon: 'login', label: 'Cobrindo colega',       desc: 'Você está cobrindo este plantão.' },
  cancelado:      { tone: 'muted',  icon: 'x',     label: 'Cancelado',             desc: 'Este plantão foi cancelado.' },
});

// shift: o objeto anotado pelo DayViewScreen (com _pendingCede/_pendingSwap/_pendingOffer).
// currentUserId: pra distinguir cobrindo do estado "neutro" (sem badge).
//
// Retorna null pra plantão "normal" do dono (sem pendência, sem cobertura) —
// caller renderiza sem banner/chip. Status visíveis são só os que mudam o
// comportamento esperado da UI (em troca, cedido, cobrindo, etc.).
export function deriveShiftStatus(shift, currentUserId) {
  if (!shift) return null;
  if (shift._pendingCede) return SHIFT_STATUS.CEDIDO;
  if (shift._pendingSwap) {
    // role 'target' = troca proposta a mim. role 'initiator' = enviada.
    return shift._pendingSwapRole === 'target' ? SHIFT_STATUS.TROCA_RECEBIDA : SHIFT_STATUS.EM_TROCA;
  }
  if (shift._pendingOffer) return SHIFT_STATUS.EM_TROCA;
  if (shift.source === 'received') {
    // Se não recebeu de si mesmo (rare edge), é cobrindo.
    if (shift.originUserId && String(shift.originUserId) !== String(currentUserId)) {
      return SHIFT_STATUS.COBRINDO;
    }
  }
  return null;
}

// Cores dos tons. Aceita C (DesignSystem.useColors()) e devolve { fg, bg, line }.
export function statusTone(toneName, C) {
  switch (toneName) {
    case 'money':  return { fg: C.money,                 bg: C.moneySoft || (C.money + '1f'),         line: C.money };
    case 'warn':   return { fg: C.warning,               bg: C.warningSoft || (C.warning + '1f'),     line: C.warning };
    case 'info':   return { fg: C.info || '#3F6FB0',     bg: (C.info || '#3F6FB0') + '1f',            line: C.info || '#5A8DD1' };
    case 'violet': return { fg: '#6A52B0',               bg: '#ECE7F8',                                line: '#7A5BBF' };
    case 'muted':
    default:       return { fg: C.text.tertiary,         bg: C.background.secondary,                   line: C.border.light };
  }
}
