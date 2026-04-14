import React, { useState, useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import AppHeader from '../components/AppHeader';
import HomeScreen from '../screens/HomeScreen';
import CalendarScreen from '../screens/CalendarScreen';
import SettingsScreen from '../screens/SettingsScreen';
import TabBar from '../components/TabBar';
import Logger from '../utils/Logger';

export default function TabNavigator({ navigation }) {
  const [currentTab, setCurrentTab] = useState('home');
  const { user } = useContext(AuthContext);

  const handleTabPress = (tabId) => {
    Logger.debug(`📱 Navegando para tab: ${tabId}`);
    setCurrentTab(tabId);
  };

  const handleNavigation = (screenName) => {
    Logger.debug(`📱 Navegação interna para: ${screenName}`);
    if (screenName === 'ConfigScreenPremium') {
      navigation.navigate('ConfigScreenPremium');
    }
  };

  // Função para obter dados dinâmicos do header
  const getHeaderData = () => {
    switch (currentTab) {
      case 'home':
        return {
          title: 'Início',
          showBackButton: false,
        };
      case 'calendar':
        return {
          title: 'Calendário',
          showBackButton: false,
        };
      case 'settings':
        return {
          title: 'Configurações',
          showBackButton: false,
        };
      default:
        return {
          title: 'Aurora',
          showBackButton: false,
        };
    }
  };

  const renderCurrentScreen = () => {
    switch (currentTab) {
      case 'home':
        return <HomeScreen />;
      case 'calendar':
        return <CalendarScreen />;
      case 'settings':
        return <SettingsScreen navigation={{ navigate: handleNavigation }} />;
      default:
        return <HomeScreen />;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header fixo e compartilhado */}
      <AppHeader {...getHeaderData()} />
      
      <View style={styles.content}>
        {renderCurrentScreen()}
      </View>
      
      <TabBar currentTab={currentTab} onTabPress={handleTabPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingBottom: 60,
  },
});