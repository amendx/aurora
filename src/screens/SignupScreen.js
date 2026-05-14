import { useState, useContext, useRef, useEffect } from 'react';
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
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AuthContext } from '../context/AuthContext';
import { useColors, Typography, Spacing, BorderRadius, Layout } from '../constants/DesignSystem';
import Logger from '../utils/Logger';

const { width: W, height: H } = Dimensions.get('window');

const CRM_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
];

const HERO_H = H * 0.28;

export default function SignupScreen({ onBack }) {
  const { signup } = useContext(AuthContext);
  const C = useColors();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [crm, setCrm] = useState('');
  const [crmState, setCrmState] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isRepeatPasswordVisible, setIsRepeatPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showStateList, setShowStateList] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const formAnim = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    Animated.spring(formAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
  }, []);

  const pickPhoto = async () => {
    setIsPickingPhoto(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Precisamos acessar sua galeria para escolher uma foto.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (!result.canceled && result.assets?.length > 0) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível abrir a galeria. Tente novamente.');
    } finally {
      setIsPickingPhoto(false);
    }
  };

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const handleEmailBlur = () => {
    if (email.length > 0) setEmailError(!isValidEmail(email));
  };

  const handleRepeatPasswordBlur = () => {
    if (repeatPassword.length > 0) setPasswordMismatch(password !== repeatPassword);
  };

  const handleSignup = async () => {
    if (!name.trim()) return Alert.alert('Erro', 'Informe seu nome.');
    if (!username.trim()) return Alert.alert('Erro', 'Informe seu nome de usuário.');
    if (!email.trim()) return Alert.alert('Erro', 'Informe seu email.');
    if (!isValidEmail(email)) { setEmailError(true); return Alert.alert('Erro', 'Email inválido.'); }
    if (!password) return Alert.alert('Erro', 'Informe uma senha.');
    if (password.length < 6) return Alert.alert('Erro', 'A senha deve ter pelo menos 6 caracteres.');
    if (password !== repeatPassword) {
      setPasswordMismatch(true);
      return Alert.alert('Erro', 'As senhas não coincidem.');
    }
    setIsLoading(true);
    const result = await signup({
      name: name.trim(), username: username.trim(), email: email.trim(),
      password, photoUri, crm: crm.trim(), crmState,
    });
    Logger.info('📝 Signup result:', JSON.stringify(result));
    setIsLoading(false);
    if (!result.success) Alert.alert('Erro ao criar conta', result.error || 'Tente novamente.');
  };

  const s = makeStyles(C);

  return (
    <View style={s.root}>

      {/* ── Hero ── */}
      <View style={s.hero}>
        <LinearGradient
          colors={['#1a2535', '#263340', '#1a2535']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
        />
        <SafeAreaView edges={['top']} style={s.heroContent}>
          <Pressable style={s.backBtn} onPress={onBack} hitSlop={Spacing.md}>
            <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} size={26} color="rgba(255,255,255,0.85)" />
          </Pressable>
          <View style={s.heroCenter}>
            <Text style={s.heroTitle}>Criar conta</Text>
            <Text style={s.heroSub}>Bem-vindo ao Aurora</Text>
          </View>
          <View style={s.heroSpacer} />
        </SafeAreaView>
        <View style={[s.heroWave, { backgroundColor: C.background.primary }]} />
      </View>

      {/* ── Form ── */}
      <KeyboardAvoidingView style={s.formArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Animated.View style={[{ flex: 1 }, { transform: [{ translateY: formAnim }] }]}>
          <ScrollView
            contentContainerStyle={s.formScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* Photo picker */}
            <View style={s.photoRow}>
              <Pressable style={[s.photoPicker, { backgroundColor: C.background.secondary, borderColor: C.border.light }]} onPress={pickPhoto} disabled={isLoading}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={s.photoImage} />
                ) : (
                  <View style={s.photoPlaceholder}>
                    <Ionicons name="camera" size={24} color={C.primary} />
                  </View>
                )}
                {(isPickingPhoto || (isLoading && photoUri)) && (
                  <View style={s.photoOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                )}
                <View style={[s.photoBadge, { backgroundColor: C.primary }]}>
                  <Ionicons name="add" size={14} color="#fff" />
                </View>
              </Pressable>
              <Text style={[s.photoHint, { color: C.text.tertiary }]}>
                {isPickingPhoto ? 'Selecionando...' : 'Foto de perfil'}
              </Text>
            </View>

            <Field label="Nome" icon="person-circle-outline" error={false} focused={focusedField === 'name'} C={C} s={s}>
              <TextInput
                style={s.fieldInput}
                value={name}
                onChangeText={(v) => setName(v.replace(/[<>"';\\]/g, ''))}
                placeholder="Seu nome completo"
                placeholderTextColor={C.text.placeholder}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={80}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
              />
            </Field>

            <Field label="Usuário" icon="person-outline" error={false} focused={focusedField === 'username'} C={C} s={s}>
              <TextInput
                style={s.fieldInput}
                value={username}
                onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                placeholder="nome_de_usuario"
                placeholderTextColor={C.text.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={30}
                onFocus={() => setFocusedField('username')}
                onBlur={() => setFocusedField(null)}
              />
            </Field>

            <Field label="Email" icon={emailError ? 'alert-circle-outline' : 'mail-outline'} error={emailError ? 'Email inválido' : false} focused={focusedField === 'email'} C={C} s={s}>
              <TextInput
                style={s.fieldInput}
                value={email}
                onChangeText={(v) => { setEmail(v.replace(/[<>"';\\]/g, '')); if (emailError) setEmailError(false); }}
                onBlur={() => { handleEmailBlur(); setFocusedField(null); }}
                placeholder="seu@email.com"
                placeholderTextColor={C.text.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                onFocus={() => setFocusedField('email')}
              />
            </Field>

            <Field label="Senha" icon="lock-closed-outline" error={false} focused={focusedField === 'password'} C={C} s={s}>
              <TextInput
                style={[s.fieldInput, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={C.text.placeholder}
                secureTextEntry={!isPasswordVisible}
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
              />
              <Pressable onPress={() => setIsPasswordVisible(v => !v)} hitSlop={Spacing.sm}>
                <Ionicons name={isPasswordVisible ? 'eye-outline' : 'eye-off-outline'} size={20} color={C.text.tertiary} />
              </Pressable>
            </Field>

            <Field label="Confirmar senha" icon="lock-closed-outline" error={passwordMismatch ? 'As senhas não coincidem' : false} focused={focusedField === 'repeatPassword'} C={C} s={s}>
              <TextInput
                style={[s.fieldInput, { flex: 1 }]}
                value={repeatPassword}
                onChangeText={(v) => { setRepeatPassword(v); if (passwordMismatch) setPasswordMismatch(false); }}
                onBlur={() => { handleRepeatPasswordBlur(); setFocusedField(null); }}
                placeholder="Repita a senha"
                placeholderTextColor={C.text.placeholder}
                secureTextEntry={!isRepeatPasswordVisible}
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => setFocusedField('repeatPassword')}
              />
              <Pressable onPress={() => setIsRepeatPasswordVisible(v => !v)} hitSlop={Spacing.sm}>
                <Ionicons name={isRepeatPasswordVisible ? 'eye-outline' : 'eye-off-outline'} size={20} color={C.text.tertiary} />
              </Pressable>
            </Field>

            <Field label="CRM (opcional)" icon="card-outline" error={false} focused={focusedField === 'crm'} C={C} s={s}>
              <TextInput
                style={s.fieldInput}
                value={crm}
                onChangeText={(v) => setCrm(v.replace(/[^0-9]/g, ''))}
                placeholder="Número do CRM"
                placeholderTextColor={C.text.placeholder}
                keyboardType="numeric"
                maxLength={10}
                onFocus={() => setFocusedField('crm')}
                onBlur={() => setFocusedField(null)}
              />
            </Field>

            <Field label="Estado do CRM (opcional)" icon="location-outline" error={false} focused={focusedField === 'crmState'} C={C} s={s}>
              <Pressable style={s.pickerBtn} onPress={() => setShowStateList(v => !v)}>
                <Text style={[s.fieldInput, !crmState && { color: C.text.placeholder }]}>
                  {crmState || 'Selecionar estado'}
                </Text>
                <Ionicons name={showStateList ? 'chevron-up' : 'chevron-down'} size={16} color={C.text.tertiary} />
              </Pressable>
            </Field>

            {showStateList && (
              <View style={[s.stateGrid, { backgroundColor: C.background.secondary, borderColor: C.border.light }]}>
                {CRM_STATES.map(st => (
                  <Pressable
                    key={st}
                    style={[s.stateChip, { backgroundColor: C.background.primary, borderColor: C.border.light }, crmState === st && { backgroundColor: C.primary, borderColor: C.primary }]}
                    onPress={() => { setCrmState(st); setShowStateList(false); }}
                  >
                    <Text style={[s.stateChipText, { color: C.text.primary }, crmState === st && { color: '#fff' }]}>{st}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Pressable
              style={({ pressed }) => [s.ctaBtn, { backgroundColor: C.primary }, pressed && { backgroundColor: C.primaryDark, transform: [{ scale: 0.98 }] }, isLoading && { backgroundColor: C.primary + '80' }]}
              onPress={handleSignup}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <View style={s.ctaBtnContent}>
                  <Text style={s.ctaBtnText}>Criar conta</Text>
                  <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: Spacing.sm }} />
                </View>
              )}
            </Pressable>

          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({ label, icon, error, focused, C, s, children }) {
  return (
    <View style={s.fieldGroup}>
      <Text style={[s.fieldLabel, { color: error ? C.error : C.text.secondary }]}>{label}</Text>
      <View style={[
        s.fieldRow,
        { borderColor: error ? C.error : focused ? C.primary : 'transparent', backgroundColor: C.background.secondary }
      ]}>
        <Ionicons name={icon} size={18} color={error ? C.error : focused ? C.primary : C.text.tertiary} style={s.fieldIcon} />
        {children}
      </View>
      {error && typeof error === 'string' && (
        <Text style={[s.errorInline, { color: C.error }]}>{error}</Text>
      )}
    </View>
  );
}

const makeStyles = (C) => ({
  root: {
    flex: 1,
    backgroundColor: C.background.primary,
  },

  // ── Hero ──────────────────────────────────────────────────────────────────────
  hero: {
    height: HERO_H,
    overflow: 'hidden',
  },
  heroContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  backBtn: {
    width: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  heroCenter: {
    flex: 1,
    alignItems: 'center',
  },
  heroTitle: {
    fontFamily: Typography.fontFamily.display,
    fontSize: 26,
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: -0.4,
  },
  heroSub: {
    fontSize: Typography.fontSize.footnote,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  heroSpacer: {
    width: 40,
  },
  heroWave: {
    position: 'absolute',
    bottom: -28,
    left: -16,
    right: -16,
    height: 56,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
  },

  // ── Form ──────────────────────────────────────────────────────────────────────
  formArea: {
    flex: 1,
    backgroundColor: C.background.primary,
  },
  formScroll: {
    paddingHorizontal: 24,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },

  // ── Photo ─────────────────────────────────────────────────────────────────────
  photoRow: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  photoPicker: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'visible',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  photoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoHint: {
    fontSize: Typography.fontSize.caption1,
  },

  // ── Fields ──────────────────────────────────────────────────────────────────
  fieldGroup: {
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.semiBold,
    fontFamily: Typography.fontFamily.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  fieldIcon: {
    marginRight: Spacing.sm,
  },
  fieldInput: {
    flex: 1,
    fontSize: Typography.fontSize.body,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.primary,
    paddingVertical: 0,
  },
  pickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorInline: {
    fontSize: Typography.fontSize.caption1,
    marginTop: 4,
    paddingHorizontal: 2,
  },

  // ── State grid ─────────────────────────────────────────────────────────────────
  stateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stateChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 48,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stateChipText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
  },

  // ── CTA ────────────────────────────────────────────────────────────────────────
  ctaBtn: {
    borderRadius: 50,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
    ...Platform.select({
      ios:     { shadowColor: '#6cc1c0', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14 },
      android: { elevation: 6 },
    }),
  },
  ctaBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ctaBtnText: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.semiBold,
    fontFamily: Typography.fontFamily.semiBold,
    color: '#fff',
  },
});
