import React, { useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { Colors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';

const SettingsScreenPremium = ({ navigation }) => {
  const { user } = useContext(AuthContext);

  const settingsItems = [
    {
      id: 'profile',
      title: 'Perfil',
      subtitle: 'Gerencie suas informações pessoais',
      icon: 'person-outline',
      onPress: () => navigation?.navigate('Profile'),
    },
    {
      id: 'config',
      title: 'Valores do Plantão',
      subtitle: 'Configure valores e parâmetros',
      icon: 'calculator-outline',
      onPress: () => navigation?.navigate('ConfigScreenPremium'),
    },
    {
      id: 'notifications',
      title: 'Notificações',
      subtitle: 'Gerencie suas notificações',
      icon: 'notifications-outline',
      onPress: () => console.log('Notifications'),
    },
    {
      id: 'theme',
      title: 'Aparência',
      subtitle: 'Tema claro, escuro ou automático',
      icon: 'color-palette-outline',
      onPress: () => console.log('Theme'),
    },
    {
      id: 'backup',
      title: 'Backup e Sincronização',
      subtitle: 'Mantenha seus dados seguros',
      icon: 'cloud-outline',
      onPress: () => console.log('Backup'),
    },
    {
      id: 'privacy',
      title: 'Privacidade',
      subtitle: 'Controle seus dados pessoais',
      icon: 'shield-checkmark-outline',
      onPress: () => console.log('Privacy'),
    },
    {
      id: 'about',
      title: 'Sobre o App',
      subtitle: 'Versão, licenças e informações',
      icon: 'information-circle-outline',
      onPress: () => console.log('About'),
    },
    {
      id: 'help',
      title: 'Ajuda e Suporte',
      subtitle: 'FAQ, contato e documentação',
      icon: 'help-circle-outline',
      onPress: () => console.log('Help'),
    },
  ];

  const renderUserCard = () => (
    <View style={styles.userCard}>
      <View style={styles.avatar}>
        <Ionicons name="person" size={28} color={Colors.interactive.active} />
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{user?.name || 'Usuário'}</Text>
        <Text style={styles.userEmail}>{user?.email || 'email@exemplo.com'}</Text>
      </View>
      <Pressable style={styles.editButton} onPress={() => navigation?.navigate('Profile')}>
        <Ionicons name="chevron-forward" size={20} color={Colors.interactive.inactive} />
      </Pressable>
    </View>
  );

  const renderSettingsItem = (item, isLast = false) => (
    <View key={item.id}>
      <Pressable
        style={({ pressed }) => [
          styles.settingsItem,
          pressed && styles.settingsItemPressed
        ]}
        onPress={item.onPress}
      >
        <View style={styles.settingsIcon}>
          <Ionicons name={item.icon} size={24} color={Colors.interactive.active} />
        </View>
        <View style={styles.settingsContent}>
          <Text style={styles.settingsTitle}>{item.title}</Text>
          <Text style={styles.settingsSubtitle}>{item.subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.interactive.inactive} />
      </Pressable>
      {!isLast && <View style={styles.separator} />}
    </View>
  );

  const renderSection = (title, items, startIndex = 0) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>
        {items.map((item, index) => renderSettingsItem(item, index === items.length - 1))}
      </View>
    </View>
  );

  // Group settings items by sections
  const accountItems = settingsItems.slice(0, 2);
  const appItems = settingsItems.slice(2, 5);
  const supportItems = settingsItems.slice(5, 8);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* User Card */}
        {renderUserCard()}

        {/* Settings Sections */}
        {renderSection('Conta', accountItems)}
        {/* {renderSection('Aplicativo', appItems)} */}
        {/* {renderSection('Suporte', supportItems)} */}

        {/* App Version */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>Cem Horas v1.0.0</Text>
          <Text style={styles.buildText}>Build 2024.03.10</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
  },
  content: {
    padding: Spacing.screen,
    paddingBottom: Spacing.xxxl + 60, // Extra space for tab bar
  },

  // User Card
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    ...Shadows.small,
  },
  avatar: {
    width: 56,
    height: 56,
    backgroundColor: Colors.background.secondary,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    ...Shadows.small,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: Typography.fontSize.title3,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.text.primary,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.regular,
    color: Colors.text.secondary,
  },
  editButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sections
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.text.secondary,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: Colors.background.primary,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.small,
  },

  // Settings Items
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    minHeight: 64,
  },
  settingsItemPressed: {
    backgroundColor: Colors.background.secondary,
  },
  settingsIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background.secondary,
    borderRadius: 20,
    marginRight: Spacing.md,
  },
  settingsContent: {
    flex: 1,
  },
  settingsTitle: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.primary,
    marginBottom: 2,
  },
  settingsSubtitle: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.regular,
    color: Colors.text.secondary,
    lineHeight: Typography.fontSize.footnote * Typography.lineHeight.normal,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border.light,
    marginLeft: 56, // Align with content after icon
  },

  // Version Info
  versionContainer: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border.light,
  },
  versionText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.secondary,
  },
  buildText: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.regular,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
});

export default SettingsScreenPremium;