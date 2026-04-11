import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
import Logger from '../utils/Logger';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useContext(AuthContext);

  const handleEmailChange = (text) => {
    setEmail(text);
    // Removido o log a cada digitação
  };

  const handlePasswordChange = (text) => {
    setPassword(text);
    // Removido o log a cada digitação
  };

  const handleLogin = async () => {
    Logger.info('🚀 Iniciando processo de login');
    
    if (!email || !password) {
      Logger.warn('❌ Campos obrigatórios não preenchidos');
      Alert.alert('Erro', 'Por favor, preencha todos os campos');
      return;
    }

    // Log dos inputs apenas no momento do login
    Logger.userInput('email', email);
    Logger.userInput('senha', password, true);
    Logger.info(`📧 Email informado: ${email}`);
    Logger.debug('🔑 Senha informada (tamanho):', password.length);

    setIsLoading(true);
    const result = await login(email, password);
    
    if (!result.success) {
      Logger.error('❌ Falha no login:', result.error);
      Alert.alert('Erro no Login', result.error || 'Credenciais inválidas');
    } else {
      Logger.info('✅ Login realizado com sucesso na tela');
    }
    
    setIsLoading(false);
  };

  const handleLocalLogin = async () => {
    Logger.info('🧪 Iniciando login local (dados mockados)');
    
    setIsLoading(true);
    
    // Usar dados mockados da Raquel
    const mockEmail = 'raquel-malmeida@outlook.com';
    const mockPassword = 'mock123';
    
    const result = await login(mockEmail, mockPassword);
    
    if (!result.success) {
      Logger.error('❌ Falha no login local:', result.error);
      Alert.alert('Erro no Login Local', result.error || 'Erro nos dados mockados');
    } else {
      Logger.info('✅ Login local realizado com sucesso');
    }
    
    setIsLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior="padding"
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Cem Horas</Text>
            <Text style={styles.subtitle}>Acesse sua conta Soffia</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.inputLabel}>E-mail:</Text>
            <TextInput
              style={styles.input}
              placeholder="Digite seu e-mail da Soffia"
              value={email}
              onChangeText={handleEmailChange}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!isLoading}
              autoCorrect={false}
            />

            <Text style={styles.inputLabel}>Senha:</Text>
            <TextInput
              style={styles.input}
              placeholder="Digite sua senha da Soffia"
              value={password}
              onChangeText={handlePasswordChange}
              secureTextEntry
              editable={!isLoading}
              autoCorrect={false}
            />

            <TouchableOpacity 
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={true}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Entrar</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.localButton, isLoading && styles.buttonDisabled]}
              onPress={handleLocalLogin}
              disabled={isLoading}
            >
              <Text style={styles.localButtonText}>
                🧪 Login Local (Dados de Teste)
              </Text>
            </TouchableOpacity>

            <Text style={styles.helperText}>
              💡 Use o botão "Login Local" para testar com dados mockados da Raquel
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 16,
    fontSize: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 18,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  localButton: {
    backgroundColor: '#34C759',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 2,
    borderColor: '#30B454',
    shadowColor: '#34C759',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  localButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginTop: 16,
    fontStyle: 'italic',
  },
});