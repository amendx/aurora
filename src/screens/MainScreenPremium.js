import React, { useState, useContext } from 'react';
import {
  View,
  StyleSheet,
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
import AppHeader from '../components/AppHeader';
import HomeScreenPremium from './HomeScreenPremium';
import CalendarScreenPremium from './CalendarScreenPremium';
import SettingsScreenPremium from './SettingsScreenPremium';
import ProfileScreen from './ProfileScreen';
import ConfigScreenPremium from './ConfigScreenPremium';
import TabBarPremium from '../components/TabBarPremium';
import { Colors, Spacing } from '../constants/DesignSystem';
import Logger from '../utils/Logger';

export default function MainScreenPremium() {
  const [currentTab, setCurrentTab] = useState('home');
  const [currentScreen, setCurrentScreen] = useState(null);
  const { user } = useContext(AuthContext);

  const handleTabPress = (tabId) => {
    Logger.debug(`📱 Navegando para tab: ${tabId}`);
    setCurrentTab(tabId);
    setCurrentScreen(null); // Reset sub-screen when changing tabs
  };

  // Navigation handler for internal screens
  const handleNavigation = (screenName) => {
    Logger.debug(`📱 Navegação interna para: ${screenName}`);
    
    if (screenName === 'Profile') {
      setCurrentScreen('profile');
    } else if (screenName === 'ConfigScreenPremium') {
      setCurrentScreen('config');
    } else {
      setCurrentScreen(null);
    }
  };

  // Back navigation handler
  const handleBackNavigation = () => {
    Logger.debug(`📱 Voltando de navegação interna`);
    setCurrentScreen(null);
  };

  // Header data configuration
  const getHeaderData = () => {
    // Profile screen (from settings)
    if (currentTab === 'settings' && currentScreen === 'profile') {
      return {
        title: 'Perfil',
        subtitle: 'Sua conta e configurações',
        showBackButton: true,
        onBackPress: handleBackNavigation,
      };
    }

    // Config screen (from settings)
    if (currentTab === 'settings' && currentScreen === 'config') {
      return {
        title: 'Valores do Plantão',
        subtitle: 'Configure valores e parâmetros',
        showBackButton: true,
        onBackPress: handleBackNavigation,
      };
    }

    // Main tabs
    switch (currentTab) {
      case 'home':
        return {
          title: 'Início',
          subtitle: 'Bem-vindo ao Cem Horas',
          showBackButton: false,
        };
      case 'calendar':
        return {
          title: 'Calendário',
          subtitle: 'Seus plantões e horários',
          showBackButton: false,
        };
      case 'settings':
        return {
          title: 'Configurações',
          subtitle: 'Personalize sua experiência',
          showBackButton: false,
        };
      default:
        return {
          title: 'Cem Horas',
          subtitle: '',
          showBackButton: false,
        };
    }
  };

  // Screen renderer
  const renderCurrentScreen = () => {
    // Sub-screens
    if (currentTab === 'settings') {
      if (currentScreen === 'profile') {
        return <ProfileScreen navigation={{ goBack: handleBackNavigation }} />;
      }
      if (currentScreen === 'config') {
        return <ConfigScreenPremium navigation={{ goBack: handleBackNavigation }} />;
      }
    }

    // Main tab screens
    switch (currentTab) {
      case 'home':
        return <HomeScreenPremium />;
      case 'calendar':
        return <CalendarScreenPremium />;
      case 'settings':
        return <SettingsScreenPremium navigation={{ navigate: handleNavigation }} />;
      default:
        return <HomeScreenPremium />;
    }
  };

  return (
    <View style={styles.container}>
      {/* Fixed Header */}
      <AppHeader {...getHeaderData()} />
      
      {/* Content Area - No animations, just instant switching */}
      <View style={styles.content}>
        {renderCurrentScreen()}
      </View>

      {/* Fixed Tab Bar */}
      <TabBarPremium currentTab={currentTab} onTabPress={handleTabPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
  },
  content: {
    flex: 1,
    paddingBottom: 68 + Spacing.md * 2, // TabBar height + margins
  },
});