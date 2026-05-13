import React from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';

const tabs = [
  { id: 'home',     icon: 'home-outline',     iconActive: 'home',     label: 'Início' },
  { id: 'calendar', icon: 'calendar-outline',  iconActive: 'calendar', label: 'Calendário' },
  { id: 'settings', icon: 'settings-outline',  iconActive: 'settings', label: 'Configurações' },
];

const TabBarPremium = ({ currentTab, onTabPress }) => {
  const insets = useSafeAreaInsets();
  const C = useColors();

  return (
    <View style={[s.container, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
      <View style={[
        s.tabBar,
        {
          backgroundColor: C.background.primary,
          borderColor: C.border.light,
        },
        Platform.OS === 'ios' ? Shadows.medium : { elevation: 8 },
      ]}>
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={s.tab}
              onPress={() => onTabPress(tab.id)}
              hitSlop={Spacing.sm}
            >
              <View style={[
                s.tabContent,
                isActive && { backgroundColor: C.background.secondary },
              ]}>
                <Ionicons
                  name={isActive ? tab.iconActive : tab.icon}
                  size={24}
                  color={isActive ? C.interactive.active : C.interactive.inactive}
                  style={s.tabIcon}
                />
                {isActive && (
                  <View style={[s.pillIndicator, { backgroundColor: C.interactive.active }]} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
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
    borderRadius: BorderRadius.xxl,
    height: 68,
    paddingHorizontal: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  tabIcon: { zIndex: 1 },
  pillIndicator: {
    position: 'absolute',
    bottom: -4,
    width: 20,
    height: 3,
    borderRadius: BorderRadius.pill,
    zIndex: 1,
  },
});

export default TabBarPremium;
