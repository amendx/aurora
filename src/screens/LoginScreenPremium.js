import { useState, useContext, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Image,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { useColors, Typography, Spacing, Shadows, BorderRadius, Layout } from '../constants/DesignSystem';
import Logger from '../utils/Logger';

const { width: W, height: H } = Dimensions.get('window');

// Fixed palette for the login card — always sits on a white card over a dark gradient,
// so these never change with the app theme.
const CARD = {
  label:            '#3a3a3c',
  inputBg:          '#f2f2f7',
  inputBorder:      '#d1d1d6',
  inputText:        '#1c1c1e',
  inputPlaceholder: '#8e8e93',
  iconColor:        '#8e8e93',
  buttonBg:         '#6cc1c0',
  buttonPressed:    '#41b883',
  buttonDisabled:   'rgba(108,193,192,0.28)',
  buttonText:       '#ffffff',
  dividerLine:      '#e5e5ea',
  dividerText:      '#aeaeb2',
  signupLink:       '#6cc1c0',
};

function Orb({ x, y, size, color, delay }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 4000 + delay, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 4000 + delay, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const opacity = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.18, 0.38, 0.18] });
  const scale = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.12, 1] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateY }, { scale }],
      }}
    />
  );
}

export default function LoginScreen({ onShowSignup }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useContext(AuthContext);
  const C = useColors();
  const s = makeStyles();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos');
      return;
    }
    Logger.info('🚀 Login — email:', email);
    setIsLoading(true);
    const result = await login(email, password);
    Logger.info('🚀 Login result:', JSON.stringify(result));
    if (!result.success) {
      Alert.alert('Erro no Login', result.error || 'Falha na autenticação');
    }
    setIsLoading(false);
  };

  const isDark = C.background.primary === '#000000' || C.background.primary === '#0a0a0f';

  return (
    <View style={{ flex: 1 }}>
      {/* Gradient background */}
      <LinearGradient
        colors={isDark
          ? ['#0a0a14', '#0d0d1f', '#080814']
          : ['#f0f4ff', '#e8f0fe', '#f5f0ff']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
      />

      {/* Floating orbs */}
      <Orb x={-W * 0.18} y={H * 0.04}  size={W * 0.7}  color="#3d4d5c" delay={0}    />
      <Orb x={W * 0.55}  y={H * 0.55}  size={W * 0.55} color="#6cc1c0" delay={800}  />
      <Orb x={W * 0.1}   y={H * 0.65}  size={W * 0.45} color="#6B4EFF" delay={1600} />
      <Orb x={W * 0.6}   y={-H * 0.05} size={W * 0.4}  color="#49627a" delay={400}  />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.content}>
            {/* Logo */}
            <View style={s.logoSection}>
              <View style={s.logoContainer}>
                <Image
                  source={require('../../assets/icon.png')}
                  style={{ width: 72, height: 72, resizeMode: 'contain' }}
                  accessibilityLabel="Logo Aurora"
                />
              </View>
              <Text style={s.appName}>Aurora</Text>
            </View>

            {/* Welcome */}
            <View style={s.welcomeSection}>
              <Text style={s.welcomeTitle}>Bom te ver de novo</Text>
              <Text style={s.welcomeSubtitle}>
                Entre com sua conta para acessar e gerenciar seus plantões
              </Text>
            </View>

            {/* Form card */}
            <View style={s.card}>
              <View style={s.inputGroup}>
                <Text style={s.inputLabel}>Email</Text>
                <View style={s.inputContainer}>
                  <Ionicons name="mail-outline" size={20} color={CARD.iconColor} style={s.inputIcon} />
                  <TextInput
                    style={s.textInput}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Digite seu email"
                    placeholderTextColor={CARD.inputPlaceholder}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                  />
                </View>
              </View>

              <View style={s.inputGroup}>
                <Text style={s.inputLabel}>Senha</Text>
                <View style={s.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={20} color={CARD.iconColor} style={s.inputIcon} />
                  <TextInput
                    style={[s.textInput, s.passwordInput]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Digite sua senha"
                    placeholderTextColor={CARD.inputPlaceholder}
                    secureTextEntry={!isPasswordVisible}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="password"
                  />
                  <Pressable style={s.visibilityButton} onPress={() => setIsPasswordVisible(!isPasswordVisible)} hitSlop={Spacing.sm}>
                    <Ionicons name={isPasswordVisible ? 'eye-outline' : 'eye-off-outline'} size={20} color={CARD.iconColor} />
                  </Pressable>
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [
                  s.loginButton,
                  pressed && s.loginButtonPressed,
                  (!email || !password || isLoading) && s.loginButtonDisabled,
                ]}
                onPress={handleLogin}
                disabled={!email || !password || isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View style={s.loginButtonContent}>
                    <Text style={s.loginButtonText}>Entrar</Text>
                    <Ionicons name="arrow-forward" size={20} color="#fff" style={s.loginButtonIcon} />
                  </View>
                )}
              </Pressable>
            </View>

            {/* Secondary actions */}
            <View style={s.secondaryActions}>
              <View style={s.orDivider}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>ou</Text>
                <View style={s.dividerLine} />
              </View>

              <Pressable style={s.secondaryButton} onPress={onShowSignup}>
                <Text style={s.secondaryButtonText}>Criar conta com email</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const makeStyles = () => ({
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
  },

  logoSection: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,122,255,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },

  welcomeSection: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  welcomeTitle: {
    fontSize: Typography.fontSize.title1,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.fontFamily.bold,
    color: '#fff',
    textAlign: 'center',
    marginBottom: Spacing.sm,
    letterSpacing: -0.8,
  },
  welcomeSubtitle: {
    fontSize: Typography.fontSize.body,
    color: 'rgba(0, 0, 0, 0.49)',
    textAlign: 'center',
    lineHeight: Typography.fontSize.body * Typography.lineHeight.relaxed,
  },

  card: {
    backgroundColor: 'rgba(255, 255, 255, 1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: Spacing.xl,
    marginBottom: Spacing.md,
  },

  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.fontFamily.medium,
    color: CARD.label,
    marginBottom: Spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD.inputBg,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: Layout.input.height + 6,
    borderWidth: 1,
    borderColor: CARD.inputBorder,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  textInput: {
    flex: 1,
    fontSize: Typography.fontSize.body,
    fontFamily: Typography.fontFamily.regular,
    color: CARD.inputText,
    paddingVertical: 0,
  },
  passwordInput: {
    paddingRight: Spacing.md,
  },
  visibilityButton: {
    padding: Spacing.sm,
    marginRight: -Spacing.sm,
  },

  loginButton: {
    borderRadius: BorderRadius.md,
    height: Layout.button.height + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    backgroundColor: CARD.buttonBg,
    ...Shadows.small,
  },
  loginButtonPressed: {
    backgroundColor: CARD.buttonPressed,
    transform: [{ scale: 0.98 }],
  },
  loginButtonDisabled: {
    backgroundColor: CARD.buttonDisabled,
  },
  loginButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loginButtonText: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.semiBold,
    fontFamily: Typography.fontFamily.semiBold,
    color: CARD.buttonText,
  },
  loginButtonIcon: {
    marginLeft: Spacing.sm,
  },

  secondaryActions: {
    alignItems: 'center',
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.md,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: CARD.dividerLine,
  },
  dividerText: {
    fontSize: Typography.fontSize.footnote,
    color: CARD.dividerText,
    marginHorizontal: Spacing.md,
    textTransform: 'uppercase',
  },
  secondaryButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  secondaryButtonText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.fontFamily.medium,
    color: CARD.signupLink,
  },
});
