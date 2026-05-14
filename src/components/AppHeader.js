/**
 * AppHeader — native-feeling navigation bar.
 *
 * AUDIT (motion refactor):
 *   Was: solid teal (C.primary) background, white text/icons, hardcoded 64px height.
 *   Now: BlurView on iOS (frosted glass), solid C.background.primary on Android.
 *        Title uses C.text.primary; back button uses C.primary.
 *        Platform-correct title alignment (centered iOS, left Android).
 *        Back button + title animate in on mount / screen change.
 */

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, useTheme, Typography, Spacing } from '../constants/DesignSystem';

// ─── Animation constants ───────────────────────────────────────────────────────
const DURATION_ENTER   = 220;
const DURATION_CONTENT = 180;
const EASING_OUT       = Easing.bezier(0, 0, 0.2, 1);

const HEADER_HEIGHT = Platform.OS === 'ios' ? 44 : 56;

export default function AppHeader({
  title,
  subtitle,
  showBackButton = false,
  onBackPress,
  backLabel,
  rightComponent,
  onRightPress,
}) {
  const insets  = useSafeAreaInsets();
  const C       = useColors();
  const { isDark } = useTheme();

  // Re-animate when screen identity changes (title or back-button state).
  const contentAnim = useRef(new Animated.Value(0)).current;
  const backAnim    = useRef(new Animated.Value(showBackButton ? 0 : 1)).current;

  useEffect(() => {
    contentAnim.setValue(0);
    Animated.timing(contentAnim, {
      toValue: 1,
      duration: DURATION_CONTENT,
      delay: 40,
      easing: EASING_OUT,
      useNativeDriver: true,
    }).start();
  }, [title]);

  useEffect(() => {
    Animated.timing(backAnim, {
      toValue: showBackButton ? 1 : 0,
      duration: DURATION_ENTER,
      easing: EASING_OUT,
      useNativeDriver: true,
    }).start();
  }, [showBackButton]);

  // iOS title slides in from slight right on push, left on pop
  const titleX = contentAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [Platform.OS === 'ios' ? 6 : -4, 0],
  });

  const inner = (
    <View style={[s.bar, { height: HEADER_HEIGHT }]}>
      {/* Left: back button */}
      <View style={s.side}>
        <Animated.View style={{ opacity: backAnim, transform: [{ translateX: backAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }}>
          {showBackButton && (
            <Pressable
              style={s.backBtn}
              onPress={onBackPress}
              hitSlop={{ top: 10, bottom: 10, left: 16, right: 10 }}
            >
              <Ionicons
                name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
                size={Platform.OS === 'ios' ? 28 : 24}
                color={C.primary}
              />
            </Pressable>
          )}
        </Animated.View>
      </View>

      {/* Center / left: title */}
      <Animated.View
        style={[
          Platform.OS === 'ios' ? s.centerTitle : s.leftTitle,
          { opacity: contentAnim, transform: [{ translateX: titleX }] },
        ]}
        pointerEvents="none"
      >
        <Text
          style={[
            s.title,
            { color: C.text.primary, textAlign: Platform.OS === 'ios' ? 'center' : 'left' },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[s.subtitle, { color: C.text.secondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </Animated.View>

      {/* Right: optional action */}
      <View style={s.side}>
        {rightComponent ? (
          <Pressable
            onPress={onRightPress}
            hitSlop={Spacing.sm}
            style={({ pressed }) => [s.rightBtn, pressed && { opacity: 0.6 }]}
          >
            {rightComponent}
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  // [iOS only] frosted glass header
  if (Platform.OS === 'ios') {
    return (
      <View style={[s.container, { paddingTop: insets.top, borderBottomColor: C.border.light }]}>
        <BlurView
          intensity={80}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        {inner}
      </View>
    );
  }

  // [Android only] solid header + hairline border
  return (
    <View style={[s.container, s.androidContainer, { paddingTop: insets.top, backgroundColor: C.background.primary, borderBottomColor: C.border.light }]}>
      {inner}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
    // No shadow — iOS uses blur depth; Android uses hairline border only
  },
  androidContainer: {
    // elevation: 0 intentionally — Material You uses hairline not shadow for nav bar
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  side: {
    width: 80,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 2,
  },
  backLabel: {
    fontSize: Typography.fontSize.callout,
    fontWeight: Typography.fontWeight.regular,
    marginLeft: 2,
  },
  centerTitle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftTitle: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: Spacing.sm,
  },
  title: {
    fontSize: Platform.OS === 'ios' ? Typography.fontSize.headline : Typography.fontSize.title3,
    fontWeight: Platform.OS === 'ios' ? Typography.fontWeight.semiBold : Typography.fontWeight.medium,
    fontFamily: Typography.fontFamily.semiBold,
    letterSpacing: Platform.OS === 'ios' ? -0.43 : 0,
  },
  subtitle: {
    fontSize: Typography.fontSize.caption1,
    marginTop: 1,
  },
  rightBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
  },
});
