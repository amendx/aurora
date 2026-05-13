import { useState, useContext } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AuthContext } from '../context/AuthContext';
import { useColors, Typography, Spacing, Shadows, BorderRadius, Layout } from '../constants/DesignSystem';
import Logger from '../utils/Logger';

const CRM_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
];

export default function SignupScreen({ onBack }) {
  const { signup } = useContext(AuthContext);
  const C = useColors();
  const s = makeStyles(C);

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
      console.error('[SignupScreen] pickPhoto error:', err);
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
    if (repeatPassword.length > 0) {
      setPasswordMismatch(password !== repeatPassword);
    }
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

    Logger.info('📝 Signup — username:', username.trim(), 'email:', email.trim(), 'photo:', !!photoUri);
    setIsLoading(true);
    const result = await signup({
      name: name.trim(),
      username: username.trim(),
      email: email.trim(),
      password,
      photoUri,
      crm: crm.trim(),
      crmState,
    });
    Logger.info('📝 Signup result:', JSON.stringify(result));
    setIsLoading(false);

    if (!result.success) {
      Alert.alert('Erro ao criar conta', result.error || 'Tente novamente.');
    }
  };

  const photoOverlay = isPickingPhoto || (isLoading && photoUri);

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        style={s.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={s.header}>
            <Pressable style={s.backButton} onPress={onBack} hitSlop={Spacing.md}>
              <Ionicons name="arrow-back" size={24} color={C.text.primary} />
            </Pressable>
            <Text style={s.headerTitle}>Criar conta</Text>
            <View style={s.headerSpacer} />
          </View>

          {/* Photo picker */}
          <View style={s.photoSection}>
            <Pressable style={s.photoPicker} onPress={pickPhoto} disabled={isLoading}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={s.photoImage} />
              ) : (
                <View style={s.photoPlaceholder}>
                  <Ionicons name="camera-outline" size={32} color={C.text.secondary} />
                  <Text style={s.photoPlaceholderText}>Foto de perfil</Text>
                </View>
              )}
              {photoOverlay && (
                <View style={s.photoOverlay}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              )}
            </Pressable>
            <Text style={s.photoHint}>
              {isPickingPhoto ? 'Selecionando...' : isLoading && photoUri ? 'Enviando foto...' : 'Toque para adicionar foto'}
            </Text>
          </View>

          <View style={s.formSection}>
            <Field label="Nome" s={s}>
              <Ionicons name="person-circle-outline" size={20} color={C.interactive.inactive} style={s.inputIcon} />
              <TextInput
                style={s.textInput}
                value={name}
                onChangeText={(v) => setName(v.replace(/[<>"';\\]/g, ''))}
                placeholder="Seu nome completo"
                placeholderTextColor={C.text.placeholder}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={80}
              />
            </Field>

            <Field label="Usuário" s={s}>
              <Ionicons name="person-outline" size={20} color={C.interactive.inactive} style={s.inputIcon} />
              <TextInput
                style={s.textInput}
                value={username}
                onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                placeholder="Nome de usuário"
                placeholderTextColor={C.text.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={30}
              />
            </Field>

            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>Email</Text>
              <View style={[s.inputContainer, emailError && s.inputContainerError]}>
                <Ionicons name="mail-outline" size={20} color={emailError ? C.error : C.interactive.inactive} style={s.inputIcon} />
                <TextInput
                  style={s.textInput}
                  value={email}
                  onChangeText={(v) => { setEmail(v.replace(/[<>"';\\]/g, '')); if (emailError) setEmailError(false); }}
                  onBlur={handleEmailBlur}
                  placeholder="seu@email.com"
                  placeholderTextColor={C.text.placeholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                />
              </View>
              {emailError && <Text style={s.errorText}>Email inválido</Text>}
            </View>

            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>Senha</Text>
              <View style={s.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color={C.interactive.inactive} style={s.inputIcon} />
                <TextInput
                  style={[s.textInput, s.passwordInput]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Mínimo 6 caracteres"
                  placeholderTextColor={C.text.placeholder}
                  secureTextEntry={!isPasswordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable style={s.visibilityButton} onPress={() => setIsPasswordVisible(v => !v)} hitSlop={Spacing.sm}>
                  <Ionicons name={isPasswordVisible ? 'eye-outline' : 'eye-off-outline'} size={20} color={C.interactive.inactive} />
                </Pressable>
              </View>
              <View style={s.passwordTip}>
                <Ionicons name="information-circle-outline" size={14} color={C.text.tertiary} />
                <Text style={s.passwordTipText}>Use ao menos uma letra maiúscula para maior segurança</Text>
              </View>
            </View>

            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>Confirmar senha</Text>
              <View style={[s.inputContainer, passwordMismatch && s.inputContainerError]}>
                <Ionicons name="lock-closed-outline" size={20} color={passwordMismatch ? C.error : C.interactive.inactive} style={s.inputIcon} />
                <TextInput
                  style={[s.textInput, s.passwordInput]}
                  value={repeatPassword}
                  onChangeText={(v) => { setRepeatPassword(v); if (passwordMismatch) setPasswordMismatch(false); }}
                  onBlur={handleRepeatPasswordBlur}
                  placeholder="Repita a senha"
                  placeholderTextColor={C.text.placeholder}
                  secureTextEntry={!isRepeatPasswordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable style={s.visibilityButton} onPress={() => setIsRepeatPasswordVisible(v => !v)} hitSlop={Spacing.sm}>
                  <Ionicons name={isRepeatPasswordVisible ? 'eye-outline' : 'eye-off-outline'} size={20} color={C.interactive.inactive} />
                </Pressable>
              </View>
              {passwordMismatch && (
                <Text style={s.errorText}>As senhas não coincidem</Text>
              )}
            </View>

            <Field label="CRM (opcional)" s={s}>
              <Ionicons name="card-outline" size={20} color={C.interactive.inactive} style={s.inputIcon} />
              <TextInput
                style={s.textInput}
                value={crm}
                onChangeText={(v) => setCrm(v.replace(/[^0-9]/g, ''))}
                placeholder="Número do CRM"
                placeholderTextColor={C.text.placeholder}
                keyboardType="numeric"
                maxLength={10}
              />
            </Field>

            <Field label="Estado do CRM (opcional)" s={s}>
              <Ionicons name="location-outline" size={20} color={C.interactive.inactive} style={s.inputIcon} />
              <Pressable style={s.pickerButton} onPress={() => setShowStateList(v => !v)}>
                <Text style={crmState ? s.pickerText : s.pickerPlaceholder}>
                  {crmState || 'Selecionar estado'}
                </Text>
                <Ionicons name={showStateList ? 'chevron-up' : 'chevron-down'} size={16} color={C.text.secondary} />
              </Pressable>
            </Field>

            {showStateList && (
              <View style={s.stateList}>
                {CRM_STATES.map(st => (
                  <Pressable
                    key={st}
                    style={[s.stateItem, crmState === st && s.stateItemSelected]}
                    onPress={() => { setCrmState(st); setShowStateList(false); }}
                  >
                    <Text style={[s.stateItemText, crmState === st && s.stateItemTextSelected]}>{st}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                s.signupButton,
                pressed && s.signupButtonPressed,
                isLoading && s.signupButtonDisabled,
              ]}
              onPress={handleSignup}
              disabled={isLoading}
            >
              {isLoading ? (
                <View style={s.loadingRow}>
                  <ActivityIndicator size="small" color={C.background.primary} />
                  <Text style={[s.signupButtonText, { marginLeft: Spacing.sm }]}>
                    {photoUri ? 'Enviando...' : 'Criando conta...'}
                  </Text>
                </View>
              ) : (
                <Text style={s.signupButtonText}>Criar conta</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children, s }) {
  return (
    <View style={s.inputGroup}>
      <Text style={s.inputLabel}>{label}</Text>
      <View style={s.inputContainer}>{children}</View>
    </View>
  );
}

const makeStyles = (C) => ({
  container: {
    flex: 1,
    backgroundColor: C.background.primary,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: Typography.fontSize.title3,
    fontWeight: Typography.fontWeight.semiBold,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.primary,
    letterSpacing: -0.5,
  },
  headerSpacer: {
    width: 32,
  },

  photoSection: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  photoPicker: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    backgroundColor: C.background.secondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border.light,
    ...Shadows.small,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  photoPlaceholderText: {
    fontSize: Typography.fontSize.caption1,
    color: C.text.secondary,
    textAlign: 'center',
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoHint: {
    fontSize: Typography.fontSize.caption1,
    color: C.text.tertiary,
  },

  formSection: {},
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.fontFamily.medium,
    color: C.text.primary,
    marginBottom: Spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.background.secondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: Layout.input.height + 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border.light,
  },
  inputContainerError: {
    borderColor: C.error,
    borderWidth: 1,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  textInput: {
    flex: 1,
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.regular,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.primary,
    paddingVertical: 0,
  },
  passwordInput: {
    paddingRight: Spacing.md,
  },
  visibilityButton: {
    padding: Spacing.sm,
    marginRight: -Spacing.sm,
  },
  passwordTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  passwordTipText: {
    flex: 1,
    fontSize: Typography.fontSize.caption1,
    color: C.text.tertiary,
    lineHeight: Typography.fontSize.caption1 * 1.4,
  },
  errorText: {
    fontSize: Typography.fontSize.caption1,
    color: C.error,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  pickerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerText: {
    fontSize: Typography.fontSize.body,
    color: C.text.primary,
  },
  pickerPlaceholder: {
    fontSize: Typography.fontSize.body,
    color: C.text.placeholder,
  },

  stateList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    backgroundColor: C.background.secondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border.light,
  },
  stateItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 48,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
    backgroundColor: C.background.primary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border.light,
  },
  stateItemSelected: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  stateItemText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    color: C.text.primary,
  },
  stateItemTextSelected: {
    color: C.background.primary,
    fontWeight: Typography.fontWeight.semiBold,
  },

  signupButton: {
    backgroundColor: C.primary,
    borderRadius: BorderRadius.md,
    height: Layout.button.height + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
    ...Shadows.small,
  },
  signupButtonPressed: {
    backgroundColor: C.primaryDark,
    transform: [{ scale: 0.98 }],
  },
  signupButtonDisabled: {
    backgroundColor: C.interactive.disabled,
  },
  signupButtonText: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.semiBold,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.background.primary,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
