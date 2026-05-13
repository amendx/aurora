import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useColors, Typography } from '../constants/DesignSystem';

export default function TabBar({ currentTab, onTabPress }) {
  const C = useColors();

  const tabs = [
    { id: 'home',     label: 'Home',       emoji: '🏠' },
    { id: 'calendar', label: 'Calendário', emoji: '📅' },
    { id: 'settings', label: 'Config',     emoji: '⚙️' },
  ];

  return (
    <View style={[s.container, {
      backgroundColor: C.background.primary,
      borderTopColor: C.border.light,
    }]}>
      <View style={s.tabBarContent}>
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[s.tab, isActive && { backgroundColor: C.primary + '15' }]}
              onPress={() => onTabPress(tab.id)}
              activeOpacity={0.7}
            >
              <Text style={s.emoji}>{tab.emoji}</Text>
              <Text style={[
                s.label,
                { color: isActive ? C.primary : C.interactive.inactive },
                isActive && s.activeLabel,
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

const s = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: Platform.OS === 'ios' ? 30 : 8,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabBarContent: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 2,
    borderRadius: 12,
  },
  emoji: { fontSize: 20, textAlign: 'center' },
  label: {
    fontSize: Typography.fontSize.caption2,
    fontWeight: '500',
    textAlign: 'center',
  },
  activeLabel: { fontWeight: '700' },
});
