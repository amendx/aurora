import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'soffia_auth_token';
const USER_KEY = 'soffia_user_data';

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

  static async clearAll() {
    try {
      await Promise.all([
        this.removeToken(),
        this.removeUserData(),
      ]);
      return true;
    } catch (error) {
      console.error('Erro ao limpar armazenamento:', error);
      return false;
    }
  }
}