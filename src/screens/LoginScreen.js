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
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { useColors, Typography, Spacing, Shadows, BorderRadius, Layout } from '../constants/DesignSystem';
import Logger from '../utils/Logger';

const { width: W, height: H } = Dimensions.get('window');


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
  const s = makeStyles(C);

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

  const isEmailValid = email.includes('@') && email.includes('.');

  return (
    <View style={s.root}>

      {/* ── Hero (top 42%) — gradient + orbs + wave mask ── */}
      <View style={s.hero}>
        <LinearGradient
          colors={['#1a2535', '#263340', '#1a2535']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
        />

        {/* Orbs — repositioned within hero bounds, logic untouched */}
        <Orb x={-W * 0.18} y={-H * 0.04} size={W * 0.75} color="#3d4d5c" delay={0}    />
        <Orb x={W * 0.55}  y={H * 0.08}  size={W * 0.55} color="#6cc1c0" delay={800}  />
        <Orb x={W * 0.05}  y={H * 0.10}  size={W * 0.45} color="#49627a" delay={1600} />
        <Orb x={W * 0.6}   y={-H * 0.06} size={W * 0.4}  color="#97cafc" delay={400}  />

        {/* Logo centred in hero */}
        <SafeAreaView edges={['top']} style={s.heroContent}>
          <Image
            source={require('../../assets/icon.png')}
            style={s.heroLogo}
            accessibilityLabel="Logo Aurora"
          />
          <Text style={s.heroAppName}>Aurora</Text>
        </SafeAreaView>

        {/* Wave — white rounded shape that bleeds into the form area */}
        <View style={s.heroWave} />
      </View>

      {/* ── Form (bottom 58%) — pure white ── */}
      <KeyboardAvoidingView
        style={s.formArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={s.formScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.heading}>Login</Text>

          {/* Email field */}
          <View style={s.field}>
            <Text style={s.fieldLabel}>Email</Text>
            <View style={[s.fieldRow, email.length > 0 && s.fieldRowFilled]}>
              <TextInput
                style={s.fieldInput}
                value={email}
                onChangeText={setEmail}
                placeholder="seu@email.com"
                placeholderTextColor={C.text.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
              />
              {isEmailValid && (
                <Ionicons name="checkmark-circle" size={20} color={C.primary} />
              )}
            </View>
          </View>

          {/* Password field */}
          <View style={s.field}>
            <Text style={s.fieldLabel}>Senha</Text>
            <View style={[s.fieldRow, password.length > 0 && s.fieldRowFilled]}>
              <TextInput
                style={s.fieldInput}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={C.text.placeholder}
                secureTextEntry={!isPasswordVisible}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
              />
              <Pressable
                onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                hitSlop={Spacing.sm}
              >
                <Ionicons
                  name={isPasswordVisible ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color={C.text.tertiary}
                />
              </Pressable>
            </View>
          </View>

          {/* CTA */}
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

          {/* Secondary */}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const HERO_H = H * 0.42;

const makeStyles = (C) => ({
  root: {
    flex: 1,
    backgroundColor: C.background.primary,
  },

  // ── Hero ────────────────────────────────────────────────────────────────────
  hero: {
    height: HERO_H,
    overflow: 'hidden',
  },
  heroContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 32,
  },
  heroLogo: {
    width: 64,
    height: 64,
    resizeMode: 'contain',
    marginBottom: Spacing.sm,
  },
  heroAppName: {
    fontSize: 22,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: -0.3,
  },
  heroWave: {
    position: 'absolute',
    bottom: -28,
    left: -16,
    right: -16,
    height: 56,
    backgroundColor: C.background.primary,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
  },

  // ── Form area ───────────────────────────────────────────────────────────────
  formArea: {
    flex: 1,
    backgroundColor: C.background.primary,
  },
  formScroll: {
    paddingHorizontal: 24,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
  },

  heading: {
    fontSize: 34,
    fontWeight: '800',
    fontFamily: Typography.fontFamily.display,
    color: C.text.primary,
    letterSpacing: -0.8,
    marginBottom: Spacing.xl,
  },

  // ── Underline fields ────────────────────────────────────────────────────────
  field: {
    marginBottom: 28,
  },
  fieldLabel: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.semiBold,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.secondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: C.border.light,
    paddingBottom: 10,
  },
  fieldRowFilled: {
    borderBottomColor: C.primary,
  },
  fieldInput: {
    flex: 1,
    fontSize: Typography.fontSize.body,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.primary,
    paddingVertical: 0,
  },

  // ── CTA button — pill ───────────────────────────────────────────────────────
  loginButton: {
    borderRadius: 50,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    backgroundColor: C.primary,
    ...Platform.select({
      ios:     { shadowColor: C.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14 },
      android: { elevation: 6 },
    }),
  },
  loginButtonPressed: {
    backgroundColor: C.primaryDark,
    transform: [{ scale: 0.98 }],
  },
  loginButtonDisabled: {
    backgroundColor: C.primary + '47',
    ...Platform.select({ ios: { shadowOpacity: 0 }, android: { elevation: 0 } }),
  },
  loginButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loginButtonText: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.semiBold,
    fontFamily: Typography.fontFamily.semiBold,
    color: '#fff',
  },
  loginButtonIcon: {
    marginLeft: Spacing.sm,
  },

  // ── Secondary ───────────────────────────────────────────────────────────────
  secondaryActions: {
    alignItems: 'center',
    marginTop: Spacing.md,
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
    backgroundColor: C.border.light,
  },
  dividerText: {
    fontSize: Typography.fontSize.footnote,
    color: C.text.tertiary,
    marginHorizontal: Spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  secondaryButtonText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.fontFamily.medium,
    color: C.primary,
  },
});
