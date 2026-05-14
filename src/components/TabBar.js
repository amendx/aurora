/**
 * TabBar — native-feeling floating tab bar.
 *
 * AUDIT (motion refactor):
 *   Was: instant icon/indicator switch, no press feedback.
 *   Now: icon + container scale bounce on press (spring, 120ms).
 *        Active background + pill indicator fade in/out (150ms).
 *        No translation between tabs — crossfade only (correct native behavior).
 */

import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Pressable, Platform, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';

// ─── Animation constants ───────────────────────────────────────────────────────
const DURATION_INDICATOR = 150;
const SPRING_PRESS       = { damping: 12, stiffness: 400, mass: 0.6, useNativeDriver: true };
const EASING_OUT         = Easing.bezier(0, 0, 0.2, 1);

const tabs = [
  { id: 'home',     icon: 'home-outline',     iconActive: 'home',     label: 'Início' },
  { id: 'calendar', icon: 'calendar-outline',  iconActive: 'calendar', label: 'Calendário' },
  { id: 'settings', icon: 'settings-outline',  iconActive: 'settings', label: 'Configurações' },
];

const TabBar = ({ currentTab, onTabPress }) => {
  const insets = useSafeAreaInsets();
  const C      = useColors();

  // One Animated.Value per tab: 0 = inactive, 1 = active
  const activeAnims = useRef(tabs.map(t => new Animated.Value(t.id === 'home' ? 1 : 0))).current;
  // One Animated.Value per tab for press scale
  const scaleAnims  = useRef(tabs.map(() => new Animated.Value(1))).current;

  // Animate indicator when currentTab changes
  useEffect(() => {
    tabs.forEach((tab, i) => {
      Animated.timing(activeAnims[i], {
        toValue: tab.id === currentTab ? 1 : 0,
        duration: DURATION_INDICATOR,
        easing: EASING_OUT,
        useNativeDriver: true,
      }).start();
    });
  }, [currentTab]);

  const handlePress = (tab, index) => {
    // Scale bounce: in → spring back
    Animated.sequence([
      Animated.timing(scaleAnims[index], {
        toValue: 1.1,
        duration: 60,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnims[index], {
        toValue: 1,
        ...SPRING_PRESS,
      }),
    ]).start();

    onTabPress(tab.id);
  };

  return (
    <View style={[s.container, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
      <View style={[
        s.tabBar,
        { backgroundColor: C.background.primary, borderColor: C.border.light },
        Platform.OS === 'ios' ? Shadows.medium : { elevation: 8 },
      ]}>
        {tabs.map((tab, index) => {
          const isActive      = currentTab === tab.id;
          const activeAnim    = activeAnims[index];
          const scaleAnim     = scaleAnims[index];

          const bgOpacity    = activeAnim;
          const pillOpacity  = activeAnim;

          return (
            <Pressable
              key={tab.id}
              style={s.tab}
              onPress={() => handlePress(tab, index)}
              hitSlop={Spacing.sm}
            >
              <Animated.View style={[s.tabContent, { transform: [{ scale: scaleAnim }] }]}>
                {/* Active background fade */}
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    s.tabBg,
                    { backgroundColor: C.background.secondary, opacity: bgOpacity },
                  ]}
                />
                <Ionicons
                  name={isActive ? tab.iconActive : tab.icon}
                  size={24}
                  color={isActive ? C.interactive.active : C.interactive.inactive}
                  style={s.tabIcon}
                />
                {/* Active pill indicator — fade in/out */}
                <Animated.View
                  style={[s.pillIndicator, { backgroundColor: C.interactive.active, opacity: pillOpacity }]}
                />
              </Animated.View>
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
    overflow: 'hidden',
  },
  tabBg: {
    borderRadius: 25,
  },
  tabIcon: { zIndex: 1 },
  pillIndicator: {
    position: 'absolute',
    bottom: 4,
    width: 20,
    height: 3,
    borderRadius: BorderRadius.pill,
    zIndex: 1,
  },
});

export default TabBar;
