// Helpers pro rastreamento de movimentação de aurora-shifts.
// Schema do shift: transferLog: TransferLogEntry[], cededAt: ISO string.

export const TRANSFER_LOG_TYPES = Object.freeze({
  CREATE: 'create',
  CEDE: 'cede',
  DEVOLUTION: 'devolução',
  SWAP: 'swap',
});

// Janela em que "Devolver" fica disponível após o cede ser aceito.
export const DEVOLUTION_WINDOW_MS = 2 * 60 * 60 * 1000; // 2h

export const makeLogEntry = ({
  type, fromUserId, fromUserName, toUserId, toUserName,
  actorUserId, openingId,
}) => {
  const e = {
    at: new Date().toISOString(),
    type,
    fromUserId: fromUserId ? String(fromUserId) : null,
    fromUserName: fromUserName || null,
    toUserId: toUserId ? String(toUserId) : null,
    toUserName: toUserName || null,
    actorUserId: actorUserId ? String(actorUserId) : null,
  };
  if (openingId) e.openingId = String(openingId);
  return e;
};

export const appendLog = (prevLog, entry) => {
  const base = Array.isArray(prevLog) ? prevLog : [];
  return [...base, entry];
};

// Se cededAt ainda está dentro da janela de 2h.
export const isWithinDevolutionWindow = (cededAt) => {
  if (!cededAt) return false;
  const t = Date.parse(cededAt);
  if (!Number.isFinite(t)) return false;
  return (Date.now() - t) < DEVOLUTION_WINDOW_MS;
};

// Quantos ms restam até expirar. ≤0 = expirado.
export const devolutionMsLeft = (cededAt) => {
  if (!cededAt) return 0;
  const t = Date.parse(cededAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, DEVOLUTION_WINDOW_MS - (Date.now() - t));
};
