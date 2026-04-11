class Logger {
  static log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (data) {
      console.log(logMessage, data);
    } else {
      console.log(logMessage);
    }
  }

  static info(message, data = null) {
    this.log('info', message, data);
  }

  static error(message, data = null) {
    this.log('error', message, data);
  }

  static warn(message, data = null) {
    this.log('warn', message, data);
  }

  static debug(message, data = null) {
    this.log('debug', message, data);
  }

  // Métodos específicos para auth
  static loginAttempt(email, url) {
    this.info(`🔐 Tentativa de login - Usuário: ${email} | URL: ${url}`);
  }

  static loginSuccess(email, userData) {
    this.info(`✅ Login realizado com sucesso - Usuário: ${email}`, userData);
  }

  static loginError(email, error, url) {
    this.error(`❌ Erro no login - Usuário: ${email} | URL: ${url} | Erro: ${error}`);
  }

  static logoutAttempt(url) {
    this.info(`🚪 Tentativa de logout | URL: ${url}`);
  }

  static logoutSuccess() {
    this.info(`✅ Logout realizado com sucesso`);
  }

  static logoutError(error, url) {
    this.error(`❌ Erro no logout | URL: ${url} | Erro: ${error}`);
  }

  static userInput(field, value, masked = false) {
    const displayValue = masked ? '*'.repeat(value.length) : value;
    this.debug(`📝 Input ${field}: ${displayValue}`);
  }
}

export default Logger;