import React, { useContext } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert, Switch, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useColors, Typography, Spacing, Shadows } from '../constants/DesignSystem';

const SettingsScreen = ({ navigation }) => {
  const { logout, user } = useContext(AuthContext);
  const { isDark, setTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const C = useColors();
  const s = makeStyles(C);

  const firstName = user?.name?.split(' ')[0] || 'Usuário';
  const fullName  = user?.name || 'Usuário';
  const hasWebClient = !!(user?.data?.id || user?.webClientToken);

  const handleLogout = () => {
    Alert.alert('Sair da Conta', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: logout },
    ]);
  };

  const Row = ({ icon, label, hint, accent, onPress, last }) => (
    <View>
      <Pressable
        style={({ pressed }) => [s.row, pressed && s.rowPressed]}
        onPress={onPress}
      >
        <View style={[s.rowIcon, accent && { backgroundColor: C.moneySoft }]}>
          <Ionicons name={icon} size={16} color={accent ? C.money : C.primary} />
        </View>
        <View style={s.rowBody}>
          <Text style={s.rowLabel}>{label}</Text>
          {hint ? <Text style={s.rowHint}>{hint}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={14} color={C.text.tertiary} />
      </Pressable>
      {!last && <View style={s.sep} />}
    </View>
  );

  const SL = ({ children, top }) => (
    <Text style={[s.sectionLabel, top && { marginTop: Spacing.lg }]}>{children}</Text>
  );

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.pageHeader}>
        <Text style={s.eyebrow}>Configurações</Text>
        <Text style={s.pageTitle}>Sua conta</Text>
      </View>

      <View style={s.heroWrap}>
        <View style={s.heroCard}>
          <View style={s.heroDecor} />
          {user?.photo
            ? <Image source={{ uri: user.photo }} style={s.avatarImg} />
            : (
              <View style={s.avatarFallback}>
                <Text style={s.avatarInitial}>{firstName.charAt(0).toUpperCase()}</Text>
              </View>
            )
          }
          <View style={{ flex: 1, position: 'relative' }}>
            <Text style={s.heroName} numberOfLines={1}>{fullName}</Text>
            {user?.email ? <Text style={s.heroEmail} numberOfLines={1}>{user.email}</Text> : null}
            <View style={s.badgeRow}>
              <View style={[s.badge, { backgroundColor: C.moneySoft }]}>
                <Ionicons name="checkmark" size={9} color={C.money} />
                <Text style={[s.badgeText, { color: C.money }]}>Aurora</Text>
              </View>
              {hasWebClient && (
                <View style={[s.badge, { backgroundColor: C.background.secondary }]}>
                  <Text style={[s.badgeText, { color: C.text.secondary }]}>PlantãoAPI</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      <SL>Conta</SL>
      <View style={s.card}>
        <Row icon="person-outline"  label="Perfil"                  hint="Foto, nome, informações"      onPress={() => navigation?.navigate?.('Profile')} />
        <Row icon="people-outline"  label="Grupos"                  hint="Seus grupos e equipes"         onPress={() => navigation?.navigate?.('GroupsScreen')} />
        <Row icon="eye-outline"     label="Visibilidade de equipes" hint="Quem aparece no seu plantão"   onPress={() => navigation?.navigate?.('GroupVisibilityScreen')} last />
      </View>

      <SL top>Plantões & valores</SL>
      <View style={s.card}>
        <Row icon="business-outline"      label="Meus hospitais"  hint="Onde você trabalha"                onPress={() => navigation?.navigate?.('HospitalsScreen')} />
        <Row icon="cash-outline"          label="Valores e bônus" hint="Hora-base, fidelização, FDS" accent onPress={() => navigation?.navigate?.('ConfigScreen')} />
        <Row icon="document-text-outline" label="Relatórios"      hint="Histórico e exportação"            onPress={() => navigation?.navigate?.('Reports')} last />
      </View>

      <SL top>Aparência</SL>
      <View style={s.card}>
        <View style={s.row}>
          <View style={s.rowIcon}>
            <Ionicons name={isDark ? 'moon' : 'sunny-outline'} size={16} color={C.primary} />
          </View>
          <View style={s.rowBody}>
            <Text style={s.rowLabel}>Modo escuro</Text>
            <Text style={s.rowHint}>Acompanha o sistema</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={(v) => setTheme(v ? 'dark' : 'light')}
            trackColor={{ false: C.border.medium, true: C.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <View style={s.logoutWrap}>
        <Pressable style={s.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={14} color={C.error} />
          <Text style={s.logoutText}>Sair da conta</Text>
        </Pressable>
        <Text style={s.version}>v 1.0.0</Text>
      </View>
    </ScrollView>
  );
};

const makeStyles = (C) => ({
  container: { flex: 1, backgroundColor: C.background.secondary },
  pageHeader: { paddingHorizontal: Spacing.screen, paddingTop: 14, paddingBottom: 18 },
  eyebrow: { fontSize: 11, fontFamily: Typography.fontFamily.semiBold, color: C.text.tertiary, textTransform: 'uppercase', letterSpacing: 1 },
  pageTitle: { fontSize: 30, fontFamily: Typography.fontFamily.display, color: C.text.primary, letterSpacing: -0.6, marginTop: 2 },

  heroWrap: { paddingHorizontal: Spacing.screen, paddingBottom: Spacing.md },
  heroCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.background.elevated, borderRadius: 18, padding: 14,
    borderWidth: 0.5, borderColor: C.border.light, overflow: 'hidden', position: 'relative',
    ...Shadows.small,
  },
  heroDecor: { position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: C.accentSoft, opacity: 0.5 },
  avatarImg: { width: 54, height: 54, borderRadius: 27 },
  avatarFallback: { width: 54, height: 54, borderRadius: 27, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 22, fontFamily: Typography.fontFamily.bold, color: C.primary },
  heroName: { fontSize: 16, fontFamily: Typography.fontFamily.bold, color: C.text.primary },
  heroEmail: { fontSize: 12, color: C.text.secondary, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: Typography.fontFamily.semiBold },

  sectionLabel: {
    fontSize: 11.5, fontFamily: Typography.fontFamily.semiBold, color: C.text.tertiary,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.screen,
  },
  card: {
    marginHorizontal: Spacing.screen, backgroundColor: C.background.elevated,
    borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: C.border.light,
    ...Shadows.small,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 12, minHeight: 52 },
  rowPressed: { backgroundColor: C.background.tertiary },
  rowIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 14, fontFamily: Typography.fontFamily.semiBold, color: C.text.primary },
  rowHint: { fontSize: 11, color: C.text.tertiary, marginTop: 1 },
  sep: { height: 0.5, backgroundColor: C.border.light, marginLeft: 58 },

  logoutWrap: { paddingTop: 28, paddingBottom: Spacing.sm, alignItems: 'center', gap: 16 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoutText: { fontSize: 13, fontFamily: Typography.fontFamily.semiBold, color: C.error },
  version: { fontSize: 11, color: C.text.tertiary },
});

export default SettingsScreen;
