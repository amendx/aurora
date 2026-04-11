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
      
      Logger.debug('🔍 Resultado do SoffiaApiService.login:', result);
      
      if (result && result.message) {
        // Resposta mockada ou da API real vem no formato: { data: { ... }, message: "..." }
        const responseData = result;
        
        // O token está dentro de responseData.data.token
        const apiData = responseData.data;
        const token = apiData.token;
        
        // Dados do usuário são o próprio apiData (sem o token para não duplicar)
        const userInfo = { ...apiData };
        delete userInfo.token; // Remove token dos dados do usuário
        
        console.log('✅ Login bem-sucedido!');
        console.log('📦 Dados da API:', responseData);
        console.log('🔑 Token extraído:', token ? 'Token presente' : 'Token não encontrado');
        console.log('👤 Dados do usuário:', userInfo.name || userInfo.email);
        
        await StorageService.saveToken(token);
        await StorageService.saveUserData(userInfo);
        
        setToken(token);
        setUser(userInfo);
        setIsAuthenticated(true);
        
        Logger.info('✅ Login finalizado e dados armazenados');
        
        return { success: true };
      } else if (result.success) {
        // Formato antigo com { success: true, data: ... }
        const responseData = result.data;
        const apiData = responseData.data;
        const token = apiData.token;
        const userInfo = { ...apiData };
        delete userInfo.token;
        
        await StorageService.saveToken(token);
        await StorageService.saveUserData(userInfo);
        
        setToken(token);
        setUser(userInfo);
        setIsAuthenticated(true);
        
        Logger.info('✅ Login finalizado e dados armazenados');
        
        return { success: true };
      } else {
        Logger.error('❌ Login falhou:', result.error || 'Erro desconhecido');
        return { success: false, error: result.error || 'Erro desconhecido' };
      }
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
      const token = await StorageService.getToken();
      
      if (token) {
        await SoffiaApiService.logout(token);
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