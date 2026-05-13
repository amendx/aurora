import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, Typography, Spacing } from '../constants/DesignSystem';

const HEADER_HEIGHT = 64;

export default function AppHeader({
  title,
  subtitle,
  showBackButton = false,
  onBackPress,
  rightComponent,
  onRightPress,
}) {
  const insets = useSafeAreaInsets();
  const C = useColors();

  return (
    <View style={{ backgroundColor: C.primary, paddingTop: insets.top }}>
      <View style={s.header}>
        {/* Left */}
        <View style={s.sideSection}>
          {showBackButton ? (
            <Pressable
              style={({ pressed }) => [s.sideBtn, pressed && { opacity: 0.7 }]}
              onPress={onBackPress}
            >
              <Ionicons
                name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
                size={24}
                color="#FFFFFF"
              />
            </Pressable>
          ) : null}
        </View>

        {/* Center */}
        <View style={s.centerSection}>
          <Text style={s.title} numberOfLines={1} ellipsizeMode="tail">
            {title}
          </Text>
          {subtitle ? (
            <Text style={s.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {/* Right */}
        <View style={s.sideSection}>
          {rightComponent ? (
            <Pressable
              style={({ pressed }) => [s.sideBtn, pressed && { opacity: 0.7 }]}
              onPress={onRightPress}
            >
              {rightComponent}
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: HEADER_HEIGHT,
    paddingHorizontal: Spacing.screen,
    gap: Spacing.sm,
  },
  sideSection: {
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideBtn: {
    width: 48,
    alignSelf: 'stretch',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: Typography.fontSize.headline,
    fontWeight: Typography.fontWeight.semiBold,
    fontFamily: Typography.fontFamily.semiBold,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: Platform.OS === 'ios' ? -0.43 : 0,
  },
  subtitle: {
    fontSize: Typography.fontSize.caption1,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginTop: 2,
  },
});
