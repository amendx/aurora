import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { Colors, Typography, Spacing, Shadows, BorderRadius, Layout } from '../constants/DesignSystem';
import Logger from '../utils/Logger';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useContext(AuthContext);

  const handleLogin = async () => {
    Logger.info('🚀 Iniciando processo de login');
    
    if (!email || !password) {
      Logger.warn('❌ Campos obrigatórios não preenchidos');
      Alert.alert('Erro', 'Por favor, preencha todos os campos');
      return;
    }

    Logger.userInput('email', email);
    Logger.userInput('senha', password, true);
    Logger.info(`📧 Email informado: ${email}`);
    Logger.debug('🔑 Senha informada (tamanho):', password.length);

    setIsLoading(true);
    const result = await login(email, password);
    
    if (!result.success) {
      Logger.error('❌ Erro no login:', result.error);
      Alert.alert('Erro no Login', result.error || 'Falha na autenticação');
    } else {
      Logger.success('✅ Login realizado com sucesso');
    }
    setIsLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          {/* Logo Section */}
          <View style={styles.logoSection}>
            <View style={styles.logoContainer}>
              <Image
                source={require('../../assets/icon.png')}
                style={{ width: 80, height: 80, resizeMode: 'contain' }}
                accessibilityLabel="Logo Aurora"
              />
            </View>
          </View>

          {/* Welcome Section */}
          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeTitle}>Bem-vindo de volta</Text>
            <Text style={styles.welcomeSubtitle}>
              Entre com sua conta para acessar seus plantões
            </Text>
          </View>

          {/* Form Section */}
          <View style={styles.formSection}>
            {/* Email Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <View style={styles.inputContainer}>
                <Ionicons 
                  name="mail-outline" 
                  size={20} 
                  color={Colors.interactive.inactive}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Digite seu email"
                  placeholderTextColor={Colors.text.placeholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                />
              </View>
            </View>

            {/* Password Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Senha</Text>
              <View style={styles.inputContainer}>
                <Ionicons 
                  name="lock-closed-outline" 
                  size={20} 
                  color={Colors.interactive.inactive}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.textInput, styles.passwordInput]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Digite sua senha"
                  placeholderTextColor={Colors.text.placeholder}
                  secureTextEntry={!isPasswordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                />
                <Pressable
                  style={styles.visibilityButton}
                  onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                  hitSlop={Spacing.sm}
                >
                  <Ionicons 
                    name={isPasswordVisible ? "eye-outline" : "eye-off-outline"} 
                    size={20} 
                    color={Colors.interactive.inactive}
                  />
                </Pressable>
              </View>
            </View>

            {/* Login Button */}
            <Pressable
              style={({ pressed }) => [
                styles.loginButton,
                pressed && styles.loginButtonPressed,
                isLoading && styles.loginButtonDisabled
              ]}
              onPress={handleLogin}
              disabled={isLoading || !email || !password}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={Colors.background.primary} />
              ) : (
                <View style={styles.loginButtonContent}>
                  <Text style={styles.loginButtonText}>Entrar</Text>
                  <Ionicons 
                    name="arrow-forward" 
                    size={20} 
                    color={Colors.background.primary}
                    style={styles.loginButtonIcon}
                  />
                </View>
              )}
            </Pressable>
          </View>

          {/* Secondary Actions */}
          <View style={styles.secondaryActions}>
            {/* <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Esqueci minha senha</Text>
            </Pressable> */}
            
            <View style={styles.orDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ou</Text>
              <View style={styles.dividerLine} />
            </View>
            
            <Pressable
              style={({ pressed }) => [
                styles.localLoginButton,
                pressed && styles.localLoginButtonPressed
              ]}
              onPress={() => {
                // Simular login local para desenvolvimento/demo
                Logger.info('🔓 Login local ativado');
                login('demo@cemhoras.com', 'demo123');
              }}
            >
              <View style={styles.localLoginContent}>
                <Ionicons 
                  name="phone-portrait-outline" 
                  size={20} 
                  color={Colors.interactive.active}
                  style={styles.localLoginIcon}
                />
                <Text style={styles.localLoginText}>Login Local</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
  },
  
  // Logo Section
  logoSection: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  logoContainer: {
    width: 64,
    height: 64,
    // backgroundColor: Colors.background.secondary,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    ...Shadows.small,
  },
  appName: {
    fontSize: Typography.fontSize.title3,
    fontWeight: Typography.fontWeight.semiBold,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.text.primary,
    letterSpacing: -0.5,
  },

  // Welcome Section
  welcomeSection: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
  },
  welcomeTitle: {
    fontSize: Typography.fontSize.title1,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    letterSpacing: -0.8,
  },
  welcomeSubtitle: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.regular,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: Typography.fontSize.body * Typography.lineHeight.relaxed,
  },

  // Form Section
  formSection: {
    marginBottom: Spacing.xl,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.secondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: Layout.input.height + 6, // Slightly taller for comfort
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border.light,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  textInput: {
    flex: 1,
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.regular,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    paddingVertical: 0, // Remove default padding
  },
  passwordInput: {
    paddingRight: Spacing.md, // Space for visibility button
  },
  visibilityButton: {
    padding: Spacing.sm,
    marginRight: -Spacing.sm,
  },

  // Login Button
  loginButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    height: Layout.button.height + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
    ...Shadows.small,
  },
  loginButtonPressed: {
    backgroundColor: Colors.primaryDark,
    transform: [{ scale: 0.98 }],
  },
  loginButtonDisabled: {
    backgroundColor: Colors.interactive.disabled,
    ...Shadows.small,
  },
  loginButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loginButtonText: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.semiBold,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.background.primary,
  },
  loginButtonIcon: {
    marginLeft: Spacing.sm,
  },

  // Secondary Actions
  secondaryActions: {
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  secondaryButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  secondaryButtonText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.interactive.active,
  },

  // Divider
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.lg,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border.light,
  },
  dividerText: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.regular,
    color: Colors.text.tertiary,
    marginHorizontal: Spacing.md,
    textTransform: 'uppercase',
  },

  // Local Login Button
  localLoginButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border.light,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background.secondary,
  },
  localLoginButtonPressed: {
    backgroundColor: Colors.background.tertiary,
    transform: [{ scale: 0.98 }],
  },
  localLoginContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  localLoginIcon: {
    marginRight: Spacing.sm,
  },
  localLoginText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.interactive.active,
  },
});