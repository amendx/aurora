/**
 * Logger — silenced by default to keep Metro clean.
 *
 * Only three channels print:
 *   - Logger.api(method, url)  → HTTP requests
 *   - Logger.nav(event)        → screen clicks / changes
 *   - Logger.error(...)        → real failures
 *
 * info/warn/debug are no-ops. Stray console.log/info/warn across the codebase
 * are silenced globally below. console.error is kept so React Native still
 * surfaces real runtime errors.
 */

// Capture originals before silencing, so Logger can still print.
const _origLog = console.log.bind(console);

// Silence chatter from any stray console.* across the app.
console.log  = () => {};
console.info = () => {};
console.warn = () => {};
console.debug = () => {};

const _now = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

class Logger {
  static api(method, url) {
    _origLog(`[${_now()}] [API] ${String(method || 'GET').toUpperCase().padEnd(6)} ${url}`);
  }

  static nav(event) {
    _origLog(`[${_now()}] [NAV] ${event}`);
  }

  static error(message, data = null) {
    if (data) _origLog(`[${_now()}] [ERROR] ${message}`, data);
    else      _origLog(`[${_now()}] [ERROR] ${message}`);
  }

  // ── Silenced ───────────────────────────────────────────────────────────────
  static log()    {}
  static info()   {}
  static warn()   {}
  static debug()  {}

  // Legacy auth/IO helpers — silenced (kept so existing call sites compile)
  static loginAttempt()  {}
  static loginSuccess()  {}
  static loginError()    {}
  static logoutAttempt() {}
  static logoutSuccess() {}
  static logoutError()   {}
  static userInput()     {}
}

export default Logger;
