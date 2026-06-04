/**
 * MovementColors — cor + rótulo por tipo de AÇÃO pendente num plantão.
 *
 * Cores fortes e quentes (azul/violeta não funcionam visualmente aqui):
 *   - troca (swap)              → vermelho
 *   - cessão direcionada (offer)→ laranja
 *   - cessão ao grupo (cede)    → amarelo (âmbar)
 *
 * Usado pelo card condensado (Home/DayView) e marcadores do calendário.
 */

export const RED = '#E0322B';     // vermelho forte
export const ORANGE = '#F2761A';  // laranja forte
export const YELLOW = '#E0A100';  // amarelo/âmbar forte

/**
 * @param {object} C  paleta do tema (useColors())
 * @param {'swap'|'offer'|'cede'} kind
 * @param {'initiator'|'target'|'sender'} [role]
 * @returns {{ color: string, tag: string }}
 */
export const movementVisual = (C, kind, role) => {
  switch (kind) {
    case 'swap':
      return { color: RED, tag: role === 'initiator' ? 'Em troca' : 'Pediram troca' };
    case 'offer':
      return { color: ORANGE, tag: 'Oferecido' };
    case 'cede':
      return { color: YELLOW, tag: 'Cedido' };
    default:
      return { color: YELLOW, tag: 'Pendente' };
  }
};

/**
 * Detecta o estado pendente de um shift a partir dos mapas/flags conhecidos.
 * `byShiftId` mapeia shiftId → { kind, role } (trocas + ofertas enviadas).
 * Cessão ao grupo é marcada via `shift._pendingCede`.
 * @returns {{ kind, role }|null}
 */
export const shiftPending = (shift, byShiftId) => {
  if (!shift) return null;
  const hit = byShiftId?.[String(shift.id)];
  if (hit) return hit;
  if (shift._pendingCede) return { kind: 'cede' };
  return null;
};
