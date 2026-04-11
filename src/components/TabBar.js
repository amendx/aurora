import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useColorScheme,
} from 'react-native';
import COLORS from '../constants/Colors';

export default function TabBar({ currentTab, onTabPress }) {
  const isDarkMode = useColorScheme() === 'dark';
  
  const tabs = [
    { 
      id: 'home', 
      label: 'Home',
      emoji: '🏠'
    },
    { 
      id: 'calendar', 
      label: 'Calendário',
      emoji: '📅'
    },
    { 
      id: 'settings', 
      label: 'Config',
      emoji: '⚙️'
    },
  ];

  return (
    <View style={[styles.container, { 
      backgroundColor: isDarkMode ? COLORS.BACKGROUND_DARK_ : COLORS.TEXT_SECONDARY,
      borderTopColor: isDarkMode ? COLORS.SEPARATOR_COLOR_DARK : COLORS.TEXT_SECONDARY,
    }]}>
      <View style={styles.tabBarContent}>
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          
          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.tab,
                isActive && styles.activeTab,
              ]}
              onPress={() => onTabPress(tab.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.emoji}>
                {tab.emoji}
              </Text>
              <Text style={[
                styles.label,
                { color: isDarkMode ? COLORS.TEXT_SECONDARY_DARK : COLORS.TEXT_SECONDARY_DARK },
                isActive && styles.activeLabel,
              ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 30 : 8, // Reduzido para iOS
    // Garantir que está no limite da tela
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabBarContent: {
    flexDirection: 'row',
    paddingTop: 8,        // Reduzido de 12 para 8
    paddingBottom: 4,     // Reduzido de 8 para 4  
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,   // Reduzido de 8 para 6
    paddingHorizontal: 8,
    gap: 2,              // Reduzido de 4 para 2
    borderRadius: 12,
  },
  activeTab: {
    backgroundColor: `${COLORS.PRIMARY}15`, // PRIMARY com transparência
  },
  emoji: {
    fontSize: 20,        // Tamanho do emoji
    textAlign: 'center',
  },
  label: {
    fontSize: 9,         // Reduzido de 10 para 9
    fontWeight: '500',
    textAlign: 'center',
  },
  activeLabel: {
    color: COLORS.PRIMARY, // Verde mint
    fontWeight: '700',
  },
});