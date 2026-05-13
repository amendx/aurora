import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'webClient_auth_token';
const USER_KEY = 'webClient_user_data';
const GROUPS_KEY = 'webClient_groups_cache';

export class StorageService {
  static async saveToken(token) {
    try {
      // Garantir que o token seja uma string
      const tokenString = typeof token === 'string' ? token : String(token);
      await SecureStore.setItemAsync(TOKEN_KEY, tokenString);
      return true;
    } catch (error) {
      console.error('Erro ao salvar token:', error);
      return false;
    }
  }

  static async getToken() {
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch (error) {
      console.error('Erro ao recuperar token:', error);
      return null;
    }
  }

  static async removeToken() {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      return true;
    } catch (error) {
      console.error('Erro ao remover token:', error);
      return false;
    }
  }

  static async saveUserData(userData) {
    try {
      // Garantir que os dados sejam convertidos para string JSON
      const userDataString = typeof userData === 'string' 
        ? userData 
        : JSON.stringify(userData);
      await SecureStore.setItemAsync(USER_KEY, userDataString);
      return true;
    } catch (error) {
      console.error('Erro ao salvar dados do usuário:', error);
      return false;
    }
  }

  static async getUserData() {
    try {
      const data = await SecureStore.getItemAsync(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Erro ao recuperar dados do usuário:', error);
      return null;
    }
  }

  static async removeUserData() {
    try {
      await SecureStore.deleteItemAsync(USER_KEY);
      return true;
    } catch (error) {
      console.error('Erro ao remover dados do usuário:', error);
      return false;
    }
  }

  // ── Grupos ────────────────────────────────────────────────
  static async saveGroups(groups) {
    try {
      await SecureStore.setItemAsync(GROUPS_KEY, JSON.stringify(groups));
      return true;
    } catch (error) {
      console.error('Erro ao salvar grupos:', error);
      return false;
    }
  }

  static async getGroups() {
    try {
      const data = await SecureStore.getItemAsync(GROUPS_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Erro ao recuperar grupos:', error);
      return null;
    }
  }

  static async clearGroups() {
    try {
      await SecureStore.deleteItemAsync(GROUPS_KEY);
      return true;
    } catch (error) {
      console.error('Erro ao remover grupos:', error);
      return false;
    }
  }

  static async clearAll() {
    try {
      await Promise.all([
        this.removeToken(),
        this.removeUserData(),
        this.clearGroups(),
      ]);
      return true;
    } catch (error) {
      console.error('Erro ao limpar armazenamento:', error);
      return false;
    }
  }

  // ── Generic SecureStore access (for legacy real_hours_ keys) ─────────────────
  // New code should use LocalCache (AsyncStorage) for bulk/non-sensitive data.
  // These methods exist for backward compat while migration runs.

  static async getItem(key) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error(`Erro ao ler item '${key}':`, error);
      return null;
    }
  }

  static async setItem(key, value) {
    try {
      const str = typeof value === 'string' ? value : JSON.stringify(value);
      await SecureStore.setItemAsync(key, str);
      return true;
    } catch (error) {
      console.error(`Erro ao salvar item '${key}':`, error);
      return false;
    }
  }

  static async removeItem(key) {
    try {
      await SecureStore.deleteItemAsync(key);
      return true;
    } catch (error) {
      console.error(`Erro ao remover item '${key}':`, error);
      return false;
    }
  }
}