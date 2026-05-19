/**
 * ApiCounter — debug-only request counter for the webClient API.
 *
 * Centralized so any caller (WebClientApiService) bumps it and any subscriber
 * (DebugApiCounter overlay) reflects the live value without prop drilling.
 *
 * Not for production. Remove the overlay mount + import to disable.
 */

let _count = 0;
const _listeners = new Set();

function _emit() {
  _listeners.forEach(fn => { try { fn(_count); } catch {} });
}

const ApiCounter = {
  bump() { _count++; _emit(); },
  get() { return _count; },
  reset() { _count = 0; _emit(); },
  subscribe(fn) {
    _listeners.add(fn);
    fn(_count);
    return () => _listeners.delete(fn);
  },
};

export default ApiCounter;
