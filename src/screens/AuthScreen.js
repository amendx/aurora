import { useState, useContext, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Modal,
  FlatList,
  Platform,
  Pressable,
  Image,
  Animated,
  Dimensions,
  useColorScheme,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as ImagePicker from 'expo-image-picker';
import { AuthContext } from '../context/AuthContext';
import { useColors, useTheme, Typography, Spacing } from '../constants/DesignSystem';
// import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../services/firebase/GoogleSignInService'; // re-enable with androidClientId
import Logger from '../utils/Logger';

WebBrowser.maybeCompleteAuthSession();

const { width: W, height: H } = Dimensions.get('window');

const DARK_BG        = '#1A2535';
const CARD_TOP_LOGIN  = H * 0.30;
const CARD_TOP_SIGNUP = H * 0.12;

const SPRING_UP   = { damping: 26, stiffness: 280, mass: 0.9, useNativeDriver: false };
const SPRING_DOWN = { damping: 32, stiffness: 320, mass: 0.8, useNativeDriver: false };
const SPRING_LOGO = { damping: 28, stiffness: 260, mass: 0.85, useNativeDriver: true };

// Where the logo center sits in login mode (bottom-aligned in header, paddingBottom 28 + texts ~68px + half logo 28)
const LOGO_CENTER_Y_LOGIN  = CARD_TOP_LOGIN - 124;
const LOGO_TARGET_X        = W / 2 - 48;                                // right: ~20px margin
const LOGO_TARGET_Y        = CARD_TOP_SIGNUP / 2 - LOGO_CENTER_Y_LOGIN; // negative = up

const CRM_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
];

const HEADINGS = [
  'Que bom ter você de volta',
  'Já estava ficando com saudade',
  'Quanto tempo, hein!',
  'Oi sumido(a) 👀',
  'Olha quem apareceu!',
  'Finalmente! A gente tava preocupado',
  'Voltou! Achamos que tinha fugido',
  'Vai um plantãozinho aí?',
  'Descansou? Tá na hora de trabalhar 😅',
  'Mais um plantão? Você é forte demais',
  'Bem-vindo(a) de volta, guerreiro(a)',
];

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
  const opacity    = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.30, 0.55, 0.30] });
  const scale      = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.1, 1] });
  return (
    <Animated.View
      style={{
        position: 'absolute', left: x, top: y,
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color, opacity,
        transform: [{ translateY }, { scale }],
      }}
    />
  );
}

function UField({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize, secureTextEntry, onBlur, error, maxLength, rightEl }) {
  const C = useColors();
  const s = makeStyles(C);
  return (
    <View style={s.uFieldGroup}>
      <Text style={[s.uFieldLabel, error && { color: C.error }]}>{label}</Text>
      <View style={[s.uFieldRow, { borderBottomColor: error ? C.error : value?.length > 0 ? C.primary : C.border.light }]}>
        <TextInput
          style={s.uFieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.text.placeholder}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize ?? 'sentences'}
          autoCorrect={false}
          secureTextEntry={secureTextEntry}
          onBlur={onBlur}
          maxLength={maxLength}
        />
        {rightEl}
      </View>
      {error ? <Text style={s.uFieldError}>{error}</Text> : null}
    </View>
  );
}

export default function AuthScreen() {
  const { login, loginWithGoogle, signup } = useContext(AuthContext);
  const C = useColors();
  const { isDark, preference } = useTheme();
  const systemScheme = useColorScheme();
  const s = makeStyles(C);

  const [mode, setMode] = useState('login');
  const [heading]       = useState(() => HEADINGS[Math.floor(Math.random() * HEADINGS.length)]);

  const cardTopAnim    = useRef(new Animated.Value(CARD_TOP_LOGIN)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const logoAnim       = useRef(new Animated.Value(0)).current;

  const logoTranslateX = logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0, LOGO_TARGET_X] });
  const logoTranslateY = logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0, LOGO_TARGET_Y] });
  const logoScale      = logoAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1] });
  const logoTextOp     = logoAnim.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 0, 0] });

  // ── Login state ──────────────────────────────────────────────────────────
  const [email, setEmail]                       = useState('');
  const [password, setPassword]                 = useState('');
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const [isLoading, setIsLoading]               = useState(false);
  const [isGoogleLoading, setGoogleLoading]     = useState(false);

  // ── Signup state ──────────────────────────────────────────────────────────
  const [suName, setSuName]                       = useState('');
  const [suEmail, setSuEmail]                     = useState('');
  const [suPassword, setSuPassword]               = useState('');
  const [suConfirmPassword, setSuConfirmPassword] = useState('');
  const [suPhone, setSuPhone]                     = useState('');
  const [suCrm, setSuCrm]                         = useState('');
  const [suCrmState, setSuCrmState]               = useState('');
  const [suPhotoUri, setSuPhotoUri]               = useState(null);
  const [isPickingPhoto, setPickingPhoto]         = useState(false);
  const [suPwVisible, setSuPwVisible]             = useState(false);
  const [suConfirmVisible, setSuConfirmVisible]   = useState(false);
  const [suLoading, setSuLoading]                 = useState(false);
  const [emailError, setEmailError]               = useState(false);

  useEffect(() => {
    Logger.info(`[AuthScreen] mode: ${mode} | preference: ${preference} | system: ${systemScheme} | isDark: ${isDark}`);
  }, [mode, isDark, preference, systemScheme]);

  const switchMode = (next) => {
    const targetTop  = next === 'signup' ? CARD_TOP_SIGNUP : CARD_TOP_LOGIN;
    const targetLogo = next === 'signup' ? 1 : 0;
    Animated.timing(contentOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setMode(next);

      Animated.spring(cardTopAnim, { toValue: targetTop, ...SPRING_UP }).start();
      Animated.timing(contentOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
    Animated.spring(logoAnim, { toValue: targetLogo, ...SPRING_LOGO }).start();
  };

  // ── Google auth ──────────────────────────────────────────────────────────
  // TODO: add EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID to .env.local and uncomment below
  // expo-auth-session ~7.x requires androidClientId on Android — crashes without it.
  //
  // const [_request, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
  //   webClientId: GOOGLE_WEB_CLIENT_ID,
  //   iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
  //   androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
  // });
  //
  // useEffect(() => {
  //   if (googleResponse?.type === 'success') {
  //     const { authentication } = googleResponse;
  //     if (authentication?.accessToken) {
  //       setGoogleLoading(true);
  //       loginWithGoogle(authentication.accessToken)
  //         .then((result) => { if (!result?.success) Alert.alert('Erro', result?.error || 'Falha no login com Google'); })
  //         .catch((e) => Alert.alert('Erro', e.message))
  //         .finally(() => setGoogleLoading(false));
  //     }
  //   }
  // }, [googleResponse]);
  const promptGoogleAsync = null;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const formatPhone = (raw) => {
    const d = raw.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  };

  const suRawPhone = suPhone.replace(/\D/g, '');
  const isSignupValid = (
    suName.trim().length > 0 &&
    isValidEmail(suEmail) &&
    (suRawPhone.length === 10 || suRawPhone.length === 11) &&
    suPassword.length >= 6 &&
    suConfirmPassword === suPassword
  );

  const handleLogin = async () => {
    if (!email || !password) { Alert.alert('Erro', 'Por favor, preencha todos os campos'); return; }
    Logger.info('Login attempt:', email);
    setIsLoading(true);
    const result = await login(email, password);
    if (!result.success) Alert.alert('Erro no Login', result.error || 'Falha na autenticação');
    setIsLoading(false);
  };

  const handleGooglePress = () => {
    // Google Sign-In disabled — see TODO above (androidClientId missing)
    Alert.alert('Indisponível', 'Login com Google temporariamente desabilitado.');
  };

  const pickPhoto = async () => {
    setPickingPhoto(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permissão necessária', 'Precisamos acessar sua galeria para escolher uma foto.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
      if (!result.canceled && result.assets?.length > 0) setSuPhotoUri(result.assets[0].uri);
    } catch { Alert.alert('Erro', 'Não foi possível abrir a galeria. Tente novamente.'); }
    finally { setPickingPhoto(false); }
  };

  const handleSignup = async () => {
    if (!isSignupValid) return;
    setSuLoading(true);
    const username = suEmail.trim().split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const result = await signup({ name: suName.trim(), username, email: suEmail.trim(), password: suPassword, photoUri: suPhotoUri, crm: suCrm.trim(), crmState: suCrmState, phone: suRawPhone });
    Logger.info('Signup result:', JSON.stringify(result));
    setSuLoading(false);
    if (!result.success) Alert.alert('Erro ao criar conta', result.error || 'Tente novamente.');
  };

  const isEmailValid = email.includes('@') && email.includes('.');
  const canSubmit    = !!email && !!password && !isLoading;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      {/* Static gradient header — never moves */}
      <LinearGradient
        colors={isDark ? ['#1A2535', '#263340', '#1A2535'] : ['#1A2535', '#263340', '#1A2535']}
        style={s.headerGradient}
      >
        <Orb x={-W * 0.1} y={-60}    size={260} color="rgba(108,193,192,0.55)" delay={800}  />
        <Orb x={W - 160}  y={40}     size={220} color="rgba(151,202,252,0.45)" delay={400}  />
        <Orb x={60}       y={90}     size={200} color="rgba(65,184,131,0.35)"  delay={1600} />

      </LinearGradient>

      {/* Animated card */}
      <Animated.View style={[s.cardContainer, { top: cardTopAnim }]}>
        <Svg viewBox="0 0 390 60" preserveAspectRatio="none" width={W} height={50} style={{ marginBottom: -2 }}>
          <Path d="M0 30 Q97 0 195 30 T390 30 V60 H0 Z" fill={C.background.card} />
        </Svg>

        <KeyboardAvoidingView
          style={s.cardBody}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            // paddingBottom generoso (≈ altura do teclado iOS/Android) garante
            // que SEMPRE há espaço pra rolar e revelar o botão, em qualquer
            // tamanho de fonte (Dynamic Type / Android font scale).
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 280 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
            bounces={true}
            alwaysBounceVertical={true}
            automaticallyAdjustKeyboardInsets={false}
          >
          <Animated.View style={[s.cardContent, { opacity: contentOpacity }]}>
            {mode === 'login' ? (
              <LoginContent
                heading={heading}
                email={email} setEmail={setEmail}
                password={password} setPassword={setPassword}
                isPasswordVisible={isPasswordVisible} setPasswordVisible={setPasswordVisible}
                isLoading={isLoading} isGoogleLoading={isGoogleLoading}
                isEmailValid={isEmailValid} canSubmit={canSubmit}
                handleLogin={handleLogin} handleGooglePress={handleGooglePress}
                onShowSignup={() => switchMode('signup')}
                C={C} s={s}
              />
            ) : (
              <SignupContent
                name={suName} setName={setSuName}
                email={suEmail} setEmail={setSuEmail}
                password={suPassword} setPassword={setSuPassword}
                confirmPassword={suConfirmPassword} setConfirmPassword={setSuConfirmPassword}
                phone={suPhone} setPhone={(v) => setSuPhone(formatPhone(v))}
                phoneError={suPhone.length > 0 && suRawPhone.length < 10 ? 'Número inválido' : null}
                passwordError={suPassword.length > 0 && suPassword.length < 6 ? 'Mínimo 6 caracteres' : null}
                crm={suCrm} setCrm={setSuCrm}
                crmState={suCrmState} setCrmState={setSuCrmState}
                photoUri={suPhotoUri}
                isPickingPhoto={isPickingPhoto} pickPhoto={pickPhoto}
                pwVisible={suPwVisible} setPwVisible={setSuPwVisible}
                confirmVisible={suConfirmVisible} setConfirmVisible={setSuConfirmVisible}
                isLoading={suLoading}
                isSignupValid={isSignupValid}

                emailError={emailError} setEmailError={setEmailError}
                isValidEmail={isValidEmail}
                handleSignup={handleSignup}
                onBack={() => switchMode('login')}
                C={C} s={s}
              />
            )}
          </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      {/* Logo — floats above card, animates to top-right on signup */}
      <Animated.View
        pointerEvents="none"
        style={[s.logoFloatWrapper, {
          transform: [
            { translateX: logoTranslateX },
            { translateY: logoTranslateY },
            { scale: logoScale },
          ],
        }]}
      >
        <SafeAreaView edges={['top']} style={s.logoFloatInner}>
          <View style={s.logoGlass}>
            <Image source={require('../../assets/icon.png')} style={s.logo} accessibilityLabel="Logo Aurora" />
          </View>
          <Animated.Text style={[s.appName, { opacity: logoTextOp }]}>Aurora</Animated.Text>
          <Animated.Text style={[s.tagline, { opacity: logoTextOp }]}>plantões com clareza</Animated.Text>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

function LoginContent({ heading, email, setEmail, password, setPassword, isPasswordVisible, setPasswordVisible, isLoading, isGoogleLoading, isEmailValid, canSubmit, handleLogin, handleGooglePress, onShowSignup, C, s }) {
  const passwordRef = useRef(null);
  return (
    <View style={s.cardScroll}>
      <Text style={s.heading}>{heading}</Text>
      <Text style={s.subheading}>Entre para ver seus próximos plantões.</Text>

      <View style={s.field}>
        <Text style={s.fieldLabel}>E-mail</Text>
        <View style={[s.fieldRow, email.length > 0 && s.fieldRowActive]}>
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
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            blurOnSubmit={false}
          />
          {isEmailValid && <Ionicons name="checkmark-circle" size={18} color={C.primary} />}
        </View>
      </View>

      <View style={s.field}>
        <View style={s.fieldLabelRow}>
          <Text style={[s.fieldLabel, { marginBottom: 0 }]}>Senha</Text>
          <Pressable hitSlop={8}>
            <Text style={s.forgotLabel}>Esqueci minha senha</Text>
          </Pressable>
        </View>
        <View style={[s.fieldRow, password.length > 0 && s.fieldRowActive]}>
          <TextInput
            ref={passwordRef}
            style={s.fieldInput}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={C.text.placeholder}
            secureTextEntry={!isPasswordVisible}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="password"
            returnKeyType="go"
            onSubmitEditing={() => { if (canSubmit) handleLogin(); else Keyboard.dismiss(); }}
          />
          <Pressable onPress={() => setPasswordVisible(!isPasswordVisible)} hitSlop={8}>
            <Ionicons name={isPasswordVisible ? 'eye-outline' : 'eye-off-outline'} size={18} color={C.text.tertiary} />
          </Pressable>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [s.button, pressed && s.buttonPressed, !canSubmit && s.buttonDisabled]}
        onPress={handleLogin}
        disabled={!canSubmit}
      >
        {isLoading
          ? <ActivityIndicator size="small" color={C.background.card} />
          : <Text style={s.buttonText}>Entrar</Text>
        }
      </Pressable>

      <View style={s.dividerRow}>
        <View style={s.dividerLine} />
        <Text style={s.dividerText}>ou</Text>
        <View style={s.dividerLine} />
      </View>

      <Pressable style={({ pressed }) => [s.socialBtn, s.socialBtnSubtle, pressed && { opacity: 0.8 }]}>
        <Ionicons name="business-outline" size={16} color={C.text.tertiary} />
        <Text style={[s.socialBtnText, { color: C.text.tertiary }]}>Entrar com conta PlantãoAPI</Text>
      </Pressable>

      <View style={s.signupRow}>
        <Text style={s.signupPrompt}>Novo no Aurora? </Text>
        <Pressable onPress={onShowSignup} hitSlop={8}>
          <Text style={s.signupLink}>Criar conta</Text>
        </Pressable>
      </View>
    </View>
  );
}

function UFDropdown({ value, onChange, C, s }) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Text style={s.uFieldLabel}>UF</Text>
      <Pressable
        style={[s.uFieldRow, { borderBottomColor: value ? C.primary : C.border.light }]}
        onPress={() => setVisible(true)}
      >
        <Text style={[s.uFieldInput, !value && { color: C.text.placeholder }]}>{value || 'Estado'}</Text>
        <Ionicons name="chevron-down" size={14} color={C.text.tertiary} />
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setVisible(false)}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Selecione o estado</Text>
            <FlatList
              data={CRM_STATES}
              keyExtractor={i => i}
              renderItem={({ item }) => (
                <Pressable
                  style={[s.modalItem, value === item && s.modalItemActive]}
                  onPress={() => { onChange(item); setVisible(false); }}
                >
                  <Text style={[s.modalItemText, value === item && s.modalItemTextActive]}>{item}</Text>
                  {value === item && <Ionicons name="checkmark" size={16} color={C.primary} />}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function SignupContent({ name, setName, email, setEmail, password, setPassword, confirmPassword, setConfirmPassword, phone, setPhone, phoneError, passwordError, crm, setCrm, crmState, setCrmState, photoUri, isPickingPhoto, pickPhoto, pwVisible, setPwVisible, confirmVisible, setConfirmVisible, isLoading, isSignupValid, emailError, setEmailError, isValidEmail, handleSignup, onBack, C, s }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[s.cardScroll, { paddingBottom: 48 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Back row */}
      <Pressable style={s.backRow} onPress={onBack} hitSlop={Spacing.md}>
        <Ionicons name="chevron-back" size={16} color={C.primary} />
        <Text style={s.backText}>Voltar</Text>
      </Pressable>

      <Text style={s.heading}>Criar sua conta</Text>

      {/* Photo + name row */}
      <View style={s.photoNameRow}>
        <Pressable style={[s.photoPicker, { borderColor: C.border.light }]} onPress={pickPhoto} disabled={isLoading}>
          {photoUri
            ? <Image source={{ uri: photoUri }} style={s.photoImage} />
            : <Ionicons name="add" size={22} color={C.text.tertiary} />
          }
          {isPickingPhoto && (
            <View style={s.photoOverlay}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          )}
        </Pressable>
        <View style={{ flex: 1 }}>
          <UField label="Nome completo" value={name} onChangeText={(v) => setName(v.replace(/[<>"';\\]/g, ''))} placeholder="Mariana Costa" autoCapitalize="words" />
        </View>
      </View>

      <UField
        label="E-mail" value={email}
        onChangeText={(v) => { setEmail(v.replace(/[<>"';\\]/g, '')); if (emailError) setEmailError(false); }}
        onBlur={() => { if (email.length > 0) setEmailError(!isValidEmail(email)); }}
        placeholder="seu@email.com" keyboardType="email-address" autoCapitalize="none"
        error={emailError ? 'Email inválido' : null}
      />

      <UField
        label="Telefone" value={phone}
        onChangeText={setPhone}
        placeholder="(11) 99999-9999" keyboardType="phone-pad"
        error={phoneError}
      />

      <UField
        label="Senha" value={password} onChangeText={setPassword}
        placeholder="Mínimo 6 caracteres" secureTextEntry={!pwVisible} autoCapitalize="none"
        error={passwordError}
        rightEl={
          <Pressable onPress={() => setPwVisible(v => !v)} hitSlop={8}>
            <Ionicons name={pwVisible ? 'eye-outline' : 'eye-off-outline'} size={18} color={C.text.tertiary} />
          </Pressable>
        }
      />

      <UField
        label="Confirmar senha" value={confirmPassword} onChangeText={setConfirmPassword}
        placeholder="Repita a senha" secureTextEntry={!confirmVisible} autoCapitalize="none"
        error={confirmPassword.length > 0 && confirmPassword !== password ? 'Senhas não coincidem' : null}
        rightEl={
          <Pressable onPress={() => setConfirmVisible(v => !v)} hitSlop={8}>
            <Ionicons name={confirmVisible ? 'eye-outline' : 'eye-off-outline'} size={18} color={C.text.tertiary} />
          </Pressable>
        }
      />

      <View style={s.splitRow}>
        <View style={{ flex: 1 }}>
          <UFDropdown value={crmState} onChange={setCrmState} C={C} s={s} />
        </View>
        <View style={{ flex: 1.6 }}>
          <UField label="CRM / COREN" value={crm} onChangeText={(v) => setCrm(v.replace(/[^0-9]/g, ''))} placeholder="142.380" keyboardType="numeric" maxLength={10} />
        </View>
      </View>

      <View style={s.ctaArea}>
        <Pressable
          style={({ pressed }) => [s.button, pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] }, (!isSignupValid || isLoading) && s.buttonDisabled]}
          onPress={handleSignup}
          disabled={!isSignupValid || isLoading}
        >
          {isLoading
            ? <ActivityIndicator size="small" color={C.background.card} />
            : <Text style={s.buttonText}>Criar conta</Text>
          }
        </Pressable>
        <Text style={s.terms}>
          Ao continuar, você aceita os <Text style={{ color: C.primary }}>Termos de Uso</Text> e <Text style={{ color: C.primary }}>Política de Privacidade</Text>.
        </Text>
      </View>
    </ScrollView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK_BG },

  headerGradient: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: H,
  },

  logoFloatWrapper: {
    position: 'absolute', top: 20, left: 0, right: 10,
    height: CARD_TOP_LOGIN,
    alignItems: 'center', justifyContent: 'flex-end',
    zIndex: 20,
  },
  logoFloatInner: {
    alignItems: 'center',
    paddingBottom: 28,
  },
  logoGlass: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  logo: { width: 32, height: 32, resizeMode: 'contain' },
  appName: {
    fontSize: 32, fontWeight: '800',
    fontFamily: Typography.fontFamily.display,
    color: '#fff', letterSpacing: -0.6, lineHeight: 36,
  },
  tagline: {
    fontSize: 13, color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.4, marginTop: 4,
  },

  cardContainer: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  cardBody: {
    flex: 1,
    backgroundColor: C.background.card,
  },
  // Sem flex:1 — deixa o conteúdo ter altura natural pra que o ScrollView
  // consiga rolar quando o teclado encolhe o viewport (independente do tamanho
  // de fonte do sistema, iOS/Android Dynamic Type).
  cardContent: {},
  cardScroll: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },

  backRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginBottom: 12, marginTop: 4,
  },
  backText: {
    fontSize: 14, fontWeight: '600',
    fontFamily: Typography.fontFamily.semiBold,
    color: C.primary,
  },

  heading: {
    fontSize: 22, fontWeight: '800',
    fontFamily: Typography.fontFamily.display,
    color: C.text.primary, letterSpacing: -0.4, lineHeight: 28, marginBottom: 20,
  },
  subheading: { fontSize: 13, color: C.text.secondary, marginBottom: 28 },

  field: { marginBottom: 24 },
  fieldLabelRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 11, fontWeight: '700',
    fontFamily: Typography.fontFamily.bold,
    color: C.text.secondary, letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 10,
  },
  forgotLabel: {
    fontSize: 11, fontWeight: '600',
    fontFamily: Typography.fontFamily.semiBold, color: C.primary,
  },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: C.border.light, paddingBottom: 10,
  },
  fieldRowActive: { borderBottomColor: C.primary },
  fieldInput: {
    flex: 1, fontSize: 16, fontWeight: '600',
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.primary, paddingVertical: 0, height: 35,
  },

  button: {
    height: 51, borderRadius: 999,
    backgroundColor: C.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
    ...Platform.select({
      ios:     { shadowColor: C.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  buttonDisabled: {
    backgroundColor: C.primary + '55',
    ...Platform.select({ ios: { shadowOpacity: 0 }, android: { elevation: 0 } }),
  },
  buttonText: {
    fontSize: 15, fontWeight: '700',
    fontFamily: Typography.fontFamily.bold, color: '#fff',
  },

  dividerRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, marginTop: 20, marginBottom: 16,
  },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: C.border.light },
  dividerText: {
    fontSize: 11, color: C.text.tertiary, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase',
  },

  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 13, paddingHorizontal: 16,
    borderRadius: 999, borderWidth: 1, borderColor: C.border.medium,
    backgroundColor: C.background.secondary, marginBottom: 10,
  },
  socialBtnSubtle: { backgroundColor: 'transparent', borderColor: C.border.light },
  socialBtnText: { fontSize: 14, fontWeight: '600', color: C.text.primary },

  signupRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', marginTop: 24,
  },
  signupPrompt: { fontSize: 13, color: C.text.secondary },
  signupLink: { fontSize: 13, fontWeight: '700', fontFamily: Typography.fontFamily.bold, color: C.primary },

  // Signup-specific
  photoNameRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginBottom: 2 },
  photoPicker: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 2, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexShrink: 0, marginBottom: 18,
  },
  photoImage: { width: 56, height: 56, borderRadius: 28 },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject, borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },

  uFieldGroup: { marginBottom: 16 },
  uFieldLabel: {
    fontSize: 11, fontWeight: '700', color: C.text.secondary,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6,
  },
  uFieldRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, paddingBottom: 8,
  },
  uFieldInput: {
    flex: 1, fontSize: 15, fontWeight: '600',
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.primary, paddingVertical: 0, height: 32,
  },
  uFieldError: { fontSize: 11, color: C.error, marginTop: 4 },

  splitRow: { flexDirection: 'row', gap: 14 },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.background.card,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    maxHeight: H * 0.55,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.border.medium,
    alignSelf: 'center', marginBottom: 14,
  },
  modalTitle: {
    fontSize: 13, fontWeight: '700', letterSpacing: 0.6,
    textTransform: 'uppercase', color: C.text.secondary,
    paddingHorizontal: 20, marginBottom: 8,
  },
  modalItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border.light,
  },
  modalItemActive: { backgroundColor: C.background.secondary },
  modalItemText: { fontSize: 15, fontWeight: '500', color: C.text.primary },
  modalItemTextActive: { fontWeight: '700', color: C.primary },

  ctaArea: { marginTop: 24, paddingTop: 8 },
  terms: {
    marginTop: 12, textAlign: 'center', fontSize: 11, lineHeight: 17, color: C.text.tertiary,
  },
});
