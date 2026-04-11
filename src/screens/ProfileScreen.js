import React, { useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { Colors, Typography, Spacing, Shadows, BorderRadius, Layout } from '../constants/DesignSystem';

const ProfileScreen = ({ navigation }) => {
  const { user, logout } = useContext(AuthContext);

  const handleLogout = () => {
    Alert.alert(
      'Sair da Conta',
      'Tem certeza que deseja sair da sua conta?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const menuItems = [
    {
      id: 'personal-info',
      title: 'Informações Pessoais',
      subtitle: 'Nome, email e dados do perfil',
      icon: 'person-outline',
      onPress: () => console.log('Personal Info'),
    },
    {
      id: 'notifications',
      title: 'Notificações',
      subtitle: 'Gerencie suas notificações',
      icon: 'notifications-outline',
      onPress: () => console.log('Notifications'),
    },
    {
      id: 'preferences',
      title: 'Preferências',
      subtitle: 'Tema, idioma e configurações',
      icon: 'settings-outline',
      onPress: () => console.log('Preferences'),
    },
    {
      id: 'privacy',
      title: 'Privacidade e Segurança',
      subtitle: 'Controle seus dados',
      icon: 'shield-checkmark-outline',
      onPress: () => console.log('Privacy'),
    },
    {
      id: 'help',
      title: 'Ajuda e Suporte',
      subtitle: 'FAQ, contato e documentação',
      icon: 'help-circle-outline',
      onPress: () => console.log('Help'),
    },
  ];

  const renderMenuItem = (item) => (
    <Pressable
      key={item.id}
      style={({ pressed }) => [
        styles.menuItem,
        pressed && styles.menuItemPressed
      ]}
      onPress={item.onPress}
    >
      <View style={styles.menuItemIcon}>
        <Ionicons name={item.icon} size={24} color={Colors.interactive.active} />
      </View>
      <View style={styles.menuItemContent}>
        <Text style={styles.menuItemTitle}>{item.title}</Text>
        <Text style={styles.menuItemSubtitle}>{item.subtitle}</Text>
      </View>
      <Ionicons 
        name="chevron-forward" 
        size={20} 
        color={Colors.interactive.inactive} 
      />
    </Pressable>
  );

  const renderSection = (title, items) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>
        {items.map((item, index) => (
          <View key={item.id}>
            {renderMenuItem(item)}
            {index < items.length - 1 && <View style={styles.separator} />}
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={32} color={Colors.interactive.active} />
            </View>
          </View>
          
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name || 'Usuário'}</Text>
            <Text style={styles.userEmail}>{user?.email || 'email@exemplo.com'}</Text>
          </View>
          
          <Pressable style={styles.editButton}>
            <Ionicons name="create-outline" size={20} color={Colors.interactive.active} />
          </Pressable>
        </View>

        {/* Menu Sections */}
        {renderSection('Conta', menuItems.slice(0, 2))}
        {renderSection('Configurações', menuItems.slice(2, 4))}
        {renderSection('Suporte', menuItems.slice(4, 5))}

        {/* Logout Section */}
        <View style={styles.section}>
          <View style={styles.card}>
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                styles.logoutItem,
                pressed && styles.menuItemPressed
              ]}
              onPress={handleLogout}
            >
              <View style={[styles.menuItemIcon, styles.logoutIcon]}>
                <Ionicons name="log-out-outline" size={24} color={Colors.error} />
              </View>
              <View style={styles.menuItemContent}>
                <Text style={[styles.menuItemTitle, styles.logoutText]}>
                  Sair da Conta
                </Text>
                <Text style={styles.menuItemSubtitle}>
                  Desconectar do aplicativo
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>
            Cem Horas v1.0.0
          </Text>
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
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxxl + 60, // Extra space for tab bar
  },

  // Profile Header
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    ...Shadows.small,
  },
  avatarContainer: {
    marginRight: Spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    backgroundColor: Colors.background.secondary,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.small,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: Typography.fontSize.title3,
    fontWeight: Typography.fontWeight.semiBold,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.text.primary,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.regular,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  editButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background.secondary,
    borderRadius: 22,
  },

  // Sections
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
    fontFamily: Typography.fontFamily.semiBold,
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

  // Menu Items
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    minHeight: 60,
  },
  menuItemPressed: {
    backgroundColor: Colors.background.secondary,
  },
  menuItemIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background.secondary,
    borderRadius: 20,
    marginRight: Spacing.md,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.text.primary,
    marginBottom: 2,
  },
  menuItemSubtitle: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.regular,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: Typography.fontSize.footnote * Typography.lineHeight.normal,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border.light,
    marginLeft: 56, // Align with content
  },

  // Logout Item
  logoutItem: {
    // Special styling for logout
  },
  logoutIcon: {
    backgroundColor: Colors.error + '10',
  },
  logoutText: {
    color: Colors.error,
  },

  // App Info
  appInfo: {
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  appInfoText: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.regular,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.tertiary,
  },
});

export default ProfileScreen;