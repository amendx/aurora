import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';

const TabBar = ({ currentTab, onTabPress, isDark = false }) => {
  const insets = useSafeAreaInsets();
  const colorScheme = isDark ? Colors.dark : Colors;

  const tabs = [
    {
      id: 'home',
      icon: 'home-outline',
      iconActive: 'home',
      label: 'Início',
    },
    {
      id: 'calendar',
      icon: 'calendar-outline',
      iconActive: 'calendar',
      label: 'Calendário',
    },
    {
      id: 'settings',
      icon: 'settings-outline',
      iconActive: 'settings',
      label: 'Configurações',
    },
  ];

  const renderTab = (tab) => {
    const isActive = currentTab === tab.id;

    const handlePress = () => {
      onTabPress(tab.id);
    };

    return (
      <Pressable
        key={tab.id}
        style={[
          styles.tab,
          isActive && styles.tabActive,
        ]}
        onPress={handlePress}
        hitSlop={Spacing.sm}
      >
        <View style={[
          styles.tabContent,
          isActive && [
            styles.tabContentActive,
            { backgroundColor: isDark ? colorScheme.background?.tertiary || '#2C2C2E' : Colors.background.secondary }
          ]
        ]}>
          {/* Icon */}
          <Ionicons
            name={isActive ? tab.iconActive : tab.icon}
            size={24}
            color={isActive ? Colors.interactive.active : Colors.interactive.inactive}
            style={styles.tabIcon}
          />
          
          {/* Bottom pill indicator */}
          {isActive && (
            <View style={styles.pillIndicator} />
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[
      styles.container,
      { paddingBottom: Math.max(insets.bottom, Spacing.md) }
    ]}>
      <View style={[
        styles.tabBar,
        { 
          backgroundColor: isDark ? colorScheme.background?.secondary || '#1C1C1E' : Colors.background.primary,
          borderColor: isDark ? colorScheme.border || Colors.border.light : Colors.border.light,
        },
        Platform.OS === 'ios' ? Shadows.medium : { elevation: 8 }
      ]}>
        {tabs.map(renderTab)}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: 'transparent',
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: Colors.background.primary,
    borderRadius: BorderRadius.xxl,
    height: 68,
    paddingHorizontal: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border.light,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  tabActive: {
    // Active state handled by indicator
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  tabContentActive: {
    backgroundColor: Colors.background.secondary,
  },
  tabIcon: {
    zIndex: 1,
  },
  pillIndicator: {
    position: 'absolute',
    bottom: -4,
    width: 20,
    height: 3,
    backgroundColor: Colors.interactive.active,
    borderRadius: BorderRadius.pill,
    zIndex: 1,
  },
});

export default TabBar;