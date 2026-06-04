/**
 * ApiCounter — debug-only request counter for Firestore operations.
 *
 * Conta operações de Firebase (leitura/escrita/listener) via a fachada
 * `src/services/firebase/fdb.js`. Qualquer subscriber (DebugApiCounter)
 * reflete o valor ao vivo. Não é pra produção.
 */

let _count = 0;
const _listeners = new Set();

function _emit() {
  _listeners.forEach(fn => { try { fn(_count); } catch {} });
}

const ApiCounter = {
  // label só pra debug/log; n = quantas operações somar (ex.: docs lidos).
  bump(label, n = 1) { _count += (Number(n) || 1); _emit(); },
  get() { return _count; },
  reset() { _count = 0; _emit(); },
  subscribe(fn) {
    _listeners.add(fn);
    fn(_count);
    return () => _listeners.delete(fn);
  },
};

export default ApiCounter;
