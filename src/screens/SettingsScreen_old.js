import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Pressable,
  Switch,
  Image,
  StatusBar,
} from 'react-native';
import AppHeader from '../components/AppHeader';

// Paleta de cores do Cem Horas
const COLORS = {
  PRIMARY: '#41b883',           // Mint Leaf
  CHARCOAL_BLUE: '#34495e',
  JET_BLACK: '#31373d',         // Texto principal
  BLUE_SLATE: '#49627a',        // Texto secundário
  BABY_BLUE_ICE: '#97cafc',     // Destaques suaves
  WHITE: '#ffffff',
  LIGHT_GRAY: '#f8f9fa',
  BORDER_GRAY: '#e9ecef',
};

// Componente ProfileCard
const ProfileCard = ({ name, email, avatar, onPress }) => (
  <Pressable
    style={({ pressed }) => [
      styles.profileCard,
      pressed && styles.pressed
    ]}
    onPress={onPress}
  >
    <View style={styles.profileContent}>
      <View style={styles.avatarContainer}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarText}>
              {name ? name.charAt(0).toUpperCase() : 'U'}
            </Text>
          </View>
        )}
      </View>
      
      <View style={styles.profileInfo}>
        <Text style={styles.profileName}>{name || 'Nome do Usuário'}</Text>
        <Text style={styles.profileEmail}>{email || 'email@exemplo.com'}</Text>
      </View>
      
      <View style={styles.chevron}>
        <Text style={styles.chevronText}>›</Text>
      </View>
    </View>
  </Pressable>
);

// Componente SettingsItem
const SettingsItem = ({ icon, title, onPress, showSwitch = false, switchValue, onSwitchChange }) => (
  <Pressable
    style={({ pressed }) => [
      styles.settingsItem,
      pressed && styles.pressed
    ]}
    onPress={onPress}
    disabled={showSwitch}
  >
    <View style={styles.settingsContent}>
      <Text style={styles.settingsIcon}>{icon}</Text>
      <Text style={styles.settingsTitle}>{title}</Text>
      
      {showSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ false: COLORS.BORDER_GRAY, true: COLORS.PRIMARY + '40' }}
          thumbColor={switchValue ? COLORS.PRIMARY : COLORS.BLUE_SLATE}
        />
      ) : (
        <View style={styles.chevron}>
          <Text style={styles.chevronText}>›</Text>
        </View>
      )}
    </View>
  </Pressable>
);

// Tela principal de Configurações
const SettingsScreen = ({ navigation }) => {
  const [darkMode, setDarkMode] = useState(false);

  // Dados do usuário (podem vir de contexto/AsyncStorage)
  const userProfile = {
    name: 'Dr. João Silva',
    email: 'joao.silva@hospital.com',
    avatar: null, // URL da foto ou null para fallback
  };

  const handleProfilePress = () => {
    // Navegar para tela de perfil
    console.log('Navegar para perfil');
  };

  const handleValoresPress = () => {
    // Navegar para ConfigScreen existente
    if (navigation) {
      navigation.navigate('ConfigScreen');
    }
  };

  const handleMyProfilePress = () => {
    console.log('Navegar para Meu Perfil');
  };

  const handleReportsPress = () => {
    console.log('Navegar para Relatórios');
  };

  const handleBackPress = () => {
    if (navigation) {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          onPress={handleBackPress}
        >
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        
        <Text style={styles.headerTitle}>Configurações</Text>
        
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Card de Perfil */}
        <ProfileCard
          name={userProfile.name}
          email={userProfile.email}
          avatar={userProfile.avatar}
          onPress={handleProfilePress}
        />

        {/* Card de Configurações */}
        <View style={styles.settingsCard}>
          <SettingsItem
            icon="👤"
            title="Meu Perfil"
            onPress={handleMyProfilePress}
          />
          
          <View style={styles.separator} />
          
          <SettingsItem
            icon="💰"
            title="Valores do Plantão"
            onPress={handleValoresPress}
          />
          
          <View style={styles.separator} />
          
          <SettingsItem
            icon="📊"
            title="Relatórios"
            onPress={handleReportsPress}
          />
          
          <View style={styles.separator} />
          
          <SettingsItem
            icon="🌙"
            title="Dark Mode"
            showSwitch={true}
            switchValue={darkMode}
            onSwitchChange={setDarkMode}
          />
        </View>

        {/* Espaçamento para o bottom da tela */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.LIGHT_GRAY,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER_GRAY,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 24,
    color: COLORS.JET_BLACK,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.JET_BLACK,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },

  // ScrollView
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },

  // Profile Card
  profileCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  profileContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarFallback: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.WHITE,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.JET_BLACK,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: COLORS.BLUE_SLATE,
  },

  // Settings Card
  settingsCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  settingsItem: {
    padding: 20,
  },
  settingsContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsIcon: {
    fontSize: 20,
    marginRight: 16,
    width: 24,
    textAlign: 'center',
  },
  settingsTitle: {
    flex: 1,
    fontSize: 16,
    color: COLORS.JET_BLACK,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.BORDER_GRAY,
    marginLeft: 60,
  },

  // Chevron
  chevron: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronText: {
    fontSize: 18,
    color: COLORS.BLUE_SLATE,
    fontWeight: '400',
  },

  // Interaction states
  pressed: {
    opacity: 0.7,
  },

  // Spacing
  bottomSpacer: {
    height: 20,
  },
});

export default SettingsScreen;