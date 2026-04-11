import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Switch,
  Image,
  StatusBar,
  TouchableOpacity,
  Animated,
} from 'react-native';

// Use exatamente as mesmas cores do calendário
const COLORS = {
  // Usar as cores originais do calendário sem modificação
  PRIMARY: '#41b883',           // Mint Leaf (SHIFTS_1)
  SECONDARY: '#49627a',         // Blue Slate 
  BACKGROUND: '#3e556c',        // Background do calendário
  TEXT_PRIMARY: '#34495e',      // Charcoal Blue
  TEXT_SECONDARY: '#31373d',    // Jet Black
  
  // Cards e elementos
  CARD_BACKGROUND: '#f8f9fa',   // Mesmo card do calendário
  SEPARATOR_COLOR: '#e9ecef',   // Separadores
  INPUT_BACKGROUND: '#ffffff',  // Inputs
  SHADOW_COLOR: '#000000',      // Sombras
  
  // Compatibilidade
  WHITE: '#ffffff',
  LIGHT_GRAY: '#3e556c',        // Mesmo background
  BORDER_GRAY: '#e9ecef',       
  
  // Headers seguem navegação do calendário  
  HEADER_PRIMARY: '#34495e',    // Charcoal Blue
  HEADER_TEXT: '#ffffff',       
  
  // Tematização igual ao calendário
  THEME_DARK: '#31373d',        // SHIFTS_3 - Jet Black
  THEME_MEDIUM: '#34495e',      // Charcoal Blue
  THEME_LIGHT: '#49627a',       // Blue Slate
  THEME_ACCENT: '#97cafc',      // SHIFTS_2 - Baby Blue Ice
  THEME_SUCCESS: '#41b883',     // SHIFTS_1 - Mint Leaf
};

// Componente ProfileCard
const ProfileCard = ({ name, email, avatar, onPress }) => (
  <Pressable 
    style={({ pressed }) => [styles.profileCard, pressed && styles.pressed]}
    onPress={onPress}
  >
    <View style={styles.profileContainer}>
      {/* Borda temática */}
      <View style={[styles.profileBorder, { backgroundColor: COLORS.THEME_SUCCESS }]} />
      
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: COLORS.THEME_SUCCESS }]}>
            <Text style={styles.avatarText}>
              {name ? name.split(' ').map(n => n[0]).join('').slice(0, 2) : 'DR'}
            </Text>
          </View>
        )}
      </View>
      
      {/* Info */}
      <View style={styles.profileInfo}>
        <Text style={styles.profileName}>{name}</Text>
        <Text style={styles.profileEmail}>{email}</Text>
      </View>
      
      {/* Chevron */}
      <View style={styles.chevron}>
        <Text style={styles.chevronText}>›</Text>
      </View>
    </View>
  </Pressable>
);

// Componente SettingsItem
const SettingsItem = ({ icon, title, onPress, showSwitch = false, switchValue, onSwitchChange, theme = 'default' }) => {
  const [toggleAnim] = useState(new Animated.Value(switchValue ? 1 : 0));

  React.useEffect(() => {
    Animated.timing(toggleAnim, {
      toValue: switchValue ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [switchValue, toggleAnim]);

  // Cores temáticas baseadas no padrão do calendário
  const themeColors = {
    dark: COLORS.THEME_DARK,      // #31373d - Jet Black
    medium: COLORS.THEME_MEDIUM,  // #34495e - Charcoal Blue
    light: COLORS.THEME_LIGHT,    // #49627a - Blue Slate
    accent: COLORS.THEME_ACCENT,  // #97cafc - Baby Blue Ice
    success: COLORS.THEME_SUCCESS, // #41b883 - Mint Leaf
    default: COLORS.PRIMARY,
  };

  return (
    <Pressable 
      style={({ pressed }) => [
        styles.settingsItem,
        pressed && !showSwitch && styles.pressed
      ]}
      onPress={onPress}
      disabled={showSwitch}
    >
      <View style={styles.settingsContent}>
        {/* Indicador colorido */}
        <View style={[styles.themeIndicator, { backgroundColor: themeColors[theme] }]} />
        <Text style={styles.settingsIcon}>{icon}</Text>
        <Text style={styles.settingsTitle}>{title}</Text>
        
        {showSwitch ? (
          <TouchableOpacity 
            style={styles.toggleContainer}
            onPress={() => onSwitchChange(!switchValue)}
          >
            <Animated.View style={[
              styles.toggleTrack,
              {
                backgroundColor: toggleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [COLORS.BORDER_GRAY, COLORS.PRIMARY]
                })
              }
            ]}>
              <Animated.View style={[
                styles.toggleThumb,
                {
                  transform: [{
                    translateX: toggleAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [2, 22]
                    })
                  }]
                }
              ]} />
            </Animated.View>
          </TouchableOpacity>
        ) : (
          <View style={styles.chevron}>
            <Text style={styles.chevronText}>›</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
};

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
      navigation.navigate('ConfigScreenPremium');
    }
  };

  const handleMyProfilePress = () => {
    console.log('Navegar para Meu Perfil');
  };

  const handleReportsPress = () => {
    console.log('Navegar para Relatórios');
  };

  return (
    <View style={styles.container}>
      <StatusBar 
        barStyle="light-content"
        backgroundColor={COLORS.HEADER_PRIMARY}
      />
      
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Espaçamento superior */}
        <View style={styles.headerSpacing} />

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
            theme="success"
          />
          
          <View style={styles.separator} />
          
          <SettingsItem
            icon="💰"
            title="Valores do Plantão"
            onPress={handleValoresPress}
            theme="accent"
          />
          
          <View style={styles.separator} />
          
          <SettingsItem
            icon="📊"
            title="Relatórios"
            onPress={handleReportsPress}
            theme="medium"
          />
          
          <View style={styles.separator} />
          
          <SettingsItem
            icon="🌙"
            title="Dark Mode"
            showSwitch={true}
            switchValue={darkMode}
            onSwitchChange={setDarkMode}
            theme="dark"
          />
        </View>

        {/* Espaçamento para o bottom da tela */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,         // #3e556c - mesmo do calendário
  },
  
  scrollView: {
    flex: 1,
  },
  
  headerSpacing: {
    height: 20,
  },

  // ProfileCard
  profileCard: {
    backgroundColor: COLORS.CARD_BACKGROUND,   // mesmo card do calendário
    marginHorizontal: 15,                      // mesmo margin do calendário
    marginBottom: 8,                          // espaçamento menor
    borderRadius: 12,                         // mesmo border radius
    shadowColor: COLORS.SHADOW_COLOR,         // mesmo shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,                             // mesmo elevation
  },
  profileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,                              // mesmo padding do calendário
  },
  profileBorder: {
    width: 4,
    height: 60,
    borderRadius: 2,
    marginRight: 16,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.WHITE,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,                             // fonte reduzida como calendário
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 12,                             // fonte reduzida como calendário
    color: COLORS.TEXT_SECONDARY,
  },

  // SettingsCard
  settingsCard: {
    backgroundColor: COLORS.CARD_BACKGROUND,   // mesmo card do calendário
    marginHorizontal: 15,                      // mesmo margin do calendário
    borderRadius: 12,                         // mesmo border radius
    shadowColor: COLORS.SHADOW_COLOR,         // mesmo shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,                             // mesmo elevation
  },
  settingsItem: {
    paddingHorizontal: 15,                    // padding reduzido como calendário
    paddingVertical: 12,                      // padding reduzido
  },
  settingsContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeIndicator: {
    width: 4,
    height: 24,
    borderRadius: 2,
    marginRight: 12,
  },
  settingsIcon: {
    fontSize: 20,
    marginRight: 16,
    width: 24,
    textAlign: 'center',
  },
  settingsTitle: {
    flex: 1,
    fontSize: 14,                             // fonte menor como calendário
    fontWeight: '500',                        // peso menor
    color: COLORS.TEXT_PRIMARY,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.SEPARATOR_COLOR,   // mesma cor do calendário
    marginLeft: 50,                           // margin menor
  },

  // Chevron
  chevron: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronText: {
    fontSize: 18,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '400',
  },

  // Toggle (similar ao ConfigScreen)
  toggleContainer: {
    padding: 2,
  },
  toggleTrack: {
    width: 46,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
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