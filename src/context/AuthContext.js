import React, { createContext, useState, useEffect, useContext } from 'react';
import { SoffiaApiService } from '../services/SoffiaApiService';
import { StorageService } from '../utils/StorageService';
import Logger from '../utils/Logger';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      Logger.info('🔍 Verificando status de autenticação...');
      
      const storedToken = await StorageService.getToken();
      const userData = await StorageService.getUserData();
      
      if (storedToken && userData) {
        // Verificar se o token ainda é válido
        const isTokenValid = await validateToken(storedToken);
        
        if (isTokenValid) {
          setToken(storedToken);
          setUser(userData);
          setIsAuthenticated(true);
          Logger.info('✅ Usuário já autenticado com token válido');
        } else {
          Logger.warn('⚠️ Token expirado, removendo dados');
          await StorageService.clearAll();
        }
      } else {
        Logger.info('ℹ️ Nenhum token armazenado encontrado');
      }
    } catch (error) {
      Logger.error('❌ Erro ao verificar status de autenticação:', error.message);
      await StorageService.clearAll();
    } finally {
      setLoading(false);
    }
  };

  const validateToken = async (tokenToValidate) => {
    try {
      // Se for token mockado, sempre considerar válido
      if (tokenToValidate === 'mock_token_for_development') {
        Logger.debug('🧪 Token mockado detectado - considerando válido');
        return true;
      }
      
      // Tentar fazer uma requisição simples para validar o token
      const response = await fetch('https://api.plantaoativo.com/users/profile', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${tokenToValidate}`,
        },
      });
      
      Logger.debug(`🔐 Validação do token - Status: ${response.status}`);
      return response.status === 200;
    } catch (error) {
      Logger.error('❌ Erro na validação do token:', error.message);
      return false;
    }
  };

  const login = async (email, password) => {
    try {
      setLoading(true);
      const result = await SoffiaApiService.login(email, password);

      Logger.debug('🔍 Resultado do SoffiaApiService.login:', JSON.stringify(result));

      // Extrair apiData do formato { message, data: {...} } ou { success, data: { data: {...} } }
      let apiData = null;

      if (result && result.message && result.data) {
        // Formato direto da API real / login local: { message: "...", data: { token, id, name, ... } }
        apiData = result.data;
      } else if (result && result.success && result.data) {
        // Formato legado com { success: true, data: { data: { token, ... } } }
        apiData = result.data.data || result.data;
      }

      if (!apiData) {
        const errorMsg = result?.error || 'Resposta inválida do servidor';
        Logger.error('❌ Login falhou:', errorMsg);
        return { success: false, error: errorMsg };
      }

      const extractedToken = apiData.token;
      if (!extractedToken) {
        Logger.error('❌ Token não encontrado na resposta');
        return { success: false, error: 'Token não recebido pelo servidor' };
      }

      // Normalizar dados do usuário — suportar variações de campo da API
      const userInfo = {
        id: apiData.id || apiData.user_id,
        name: apiData.name || apiData.full_name || apiData.username || email,
        email: apiData.email || email,
        username: apiData.username || '',
        role: apiData.role || '',
        photo: apiData.photo || null,
        council: apiData.council || '',
        phone: apiData.phone || '',
        is_premium: apiData.is_premium || false,
      };

      Logger.info('✅ Login bem-sucedido!');
      Logger.info(`👤 Usuário: ${userInfo.name} (${userInfo.email})`);
      Logger.info(`🔑 Token: ${extractedToken.substring(0, 20)}...`);

      await StorageService.saveToken(extractedToken);
      await StorageService.saveUserData(userInfo);

      setToken(extractedToken);
      setUser(userInfo);
      setIsAuthenticated(true);

      Logger.info('✅ Login finalizado e dados armazenados');
      return { success: true };
    } catch (error) {
      Logger.error('❌ Erro no processo de login:', error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      const storedToken = await StorageService.getToken();

      // Só chama a API de logout se for um token real (não login local)
      if (storedToken && storedToken !== 'mock_token_for_development') {
        await SoffiaApiService.logout(storedToken);
      } else {
        Logger.info('🧪 Logout local - sem chamada à API');
      }
      
      await StorageService.clearAll();
      setUser(null);
      setToken(null);
      setIsAuthenticated(false);
      
      return { success: true };
    } catch (error) {
      console.error('Erro no logout:', error);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  const value = {
    isAuthenticated,
    user,
    token,
    loading,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export { AuthContext };