/**
 * scrollToTopBus — sinal simples pra "voltar ao topo" quando o usuário toca de
 * novo na aba já ativa. Cada tela de aba registra um handler pelo seu id; o
 * MainScreen emite no re-tap.
 */

const handlers = {};

export const registerScrollToTop = (id, fn) => {
  handlers[id] = fn;
  return () => { if (handlers[id] === fn) delete handlers[id]; };
};

export const emitScrollToTop = (id) => {
  handlers[id]?.();
};
