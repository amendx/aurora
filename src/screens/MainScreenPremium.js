import React, { useState, useContext, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Animated,
} from 'react-native';

import { AuthContext } from '../context/AuthContext';
import AppHeader from '../components/AppHeader';
import HomeScreenPremium from './HomeScreenPremium';
import CalendarScreenPremium from './CalendarScreenPremium';
import SettingsScreenPremium from './SettingsScreenPremium';
import ProfileScreen from './ProfileScreen';
import ConfigScreenPremium from './ConfigScreenPremium';
import GroupsScreen from './GroupsScreen';
import ReportsScreen from './ReportsScreen';
import TabBarPremium from '../components/TabBarPremium';
import { Colors, Spacing } from '../constants/DesignSystem';
import Logger from '../utils/Logger';

export default function MainScreenPremium() {
  const [currentTab, setCurrentTab] = useState('home');
  const [currentScreen, setCurrentScreen] = useState(null);
  const [screenParams, setScreenParams] = useState(null);
  const { user } = useContext(AuthContext);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const fadeTransition = (callback) => {
    // Instant state change, then fade in — no jarring fade-out flash
    fadeAnim.setValue(0.6);
    callback();
    Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  };

  const handleTabPress = (tabId) => {
    Logger.debug(`📱 Navegando para tab: ${tabId}`);
    fadeTransition(() => {
      setCurrentTab(tabId);
      setCurrentScreen(null);
      setScreenParams(null);
    });
  };

  // Navigation handler for internal screens
  const handleNavigation = (screenName, params = null) => {
    Logger.debug(`📱 Navegação interna para: ${screenName}`);
    fadeTransition(() => {
      if (screenName === 'Profile') {
        setCurrentScreen('profile');
      } else if (screenName === 'ConfigScreenPremium') {
        setCurrentScreen('config');
      } else if (screenName === 'GroupsScreen') {
        setCurrentScreen('groups');
        setScreenParams(params);
      } else if (screenName === 'HoursReport' || screenName === 'Reports') {
        setCurrentScreen('reports');
      } else if (screenName === 'calendar') {
        setCurrentTab('calendar');
        setCurrentScreen(null);
        setScreenParams(null);
      } else {
        setCurrentScreen(null);
        setScreenParams(null);
      }
    });
  };

  // Back navigation handler
  const handleBackNavigation = () => {
    Logger.debug(`📱 Voltando de navegação interna`);
    fadeTransition(() => {
      setCurrentScreen(null);
      setScreenParams(null);
    });
  };

  // Header data configuration
  const getHeaderData = () => {
    if (currentScreen === 'reports') {
      return {
        title: 'Relatórios',
        subtitle: 'Histórico e totais mensais',
        showBackButton: true,
        onBackPress: handleBackNavigation,
      };
    }

    // Groups screen (acessível de qualquer tab)
    if (currentScreen === 'groups') {
      return {
        title: 'Grupos',
        subtitle: 'Seus grupos e membros',
        showBackButton: true,
        onBackPress: handleBackNavigation,
      };
    }

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
    // Sub-screens globais (acessíveis de qualquer tab)
    if (currentScreen === 'groups') {
      return <GroupsScreen navigation={{ goBack: handleBackNavigation }} focusGroupId={screenParams?.focusGroupId} />;
    }

    if (currentScreen === 'reports') {
      return <ReportsScreen />;
    }

    // Sub-screens da tab settings
    if (currentTab === 'settings') {
      if (currentScreen === 'profile') {
        return <ProfileScreen navigation={{ 
          goBack: handleBackNavigation, 
          navigate: handleNavigation 
        }} />;
      }
      if (currentScreen === 'config') {
        return <ConfigScreenPremium navigation={{ 
          goBack: handleBackNavigation,
          navigate: handleNavigation 
        }} />;
      }
    }

    // Main tab screens
    switch (currentTab) {
      case 'home':
        return <HomeScreenPremium navigation={{ navigate: handleNavigation }} />;
      case 'calendar':
        return <CalendarScreenPremium navigation={{ navigate: handleNavigation }} />;
      case 'settings':
        return <SettingsScreenPremium navigation={{ navigate: handleNavigation }} />;
      default:
        return <HomeScreenPremium navigation={{ navigate: handleNavigation }} />;
    }
  };

  return (
    <View style={styles.container}>
      {/* Fixed Header */}
      <AppHeader {...getHeaderData()} />
      
      {/* Content Area - fade transition on tab/screen change */}
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {renderCurrentScreen()}
      </Animated.View>

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