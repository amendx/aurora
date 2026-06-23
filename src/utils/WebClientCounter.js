/**
 * WebClientCounter — debug-only request counter for WebClient API calls.
 */

let _count = 0;
const _listeners = new Set();

function _emit() {
  _listeners.forEach(fn => { try { fn(_count); } catch {} });
}

const WebClientCounter = {
  bump(label, n = 1) { _count += (Number(n) || 1); _emit(); },
  get() { return _count; },
  reset() { _count = 0; _emit(); },
  subscribe(fn) {
    _listeners.add(fn);
    fn(_count);
    return () => _listeners.delete(fn);
  },
};

export default WebClientCounter;
