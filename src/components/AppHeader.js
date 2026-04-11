import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';

export default function AppHeader({ 
  title, 
  subtitle,
  showBackButton = false, 
  onBackPress,
  rightComponent,
  isDark = false,
}) {
  const insets = useSafeAreaInsets();
  const colorScheme = isDark ? Colors.dark : Colors;

  return (
    <View style={[styles.container, { 
      backgroundColor: colorScheme.background.primary,
      borderBottomColor: colorScheme.border || Colors.border.light,
      paddingTop: insets.top 
    }]}>
      <View style={styles.header}>
        {/* Left Section - Back Button */}
        <View style={styles.leftSection}>
          {showBackButton ? (
            <Pressable 
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.backButtonPressed
              ]} 
              onPress={onBackPress}
              hitSlop={Spacing.sm}
            >
              <Ionicons 
                name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} 
                size={24} 
                color={Colors.interactive.active}
              />
            </Pressable>
          ) : null}
        </View>

        {/* Center Section - Title */}
        <View style={styles.centerSection}>
          <Text style={[styles.title, { 
            color: isDark ? colorScheme.text.primary : Colors.text.primary 
          }]} numberOfLines={1} ellipsizeMode="tail">
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.subtitle, { 
              color: isDark ? colorScheme.text.secondary : Colors.text.secondary 
            }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>

        {/* Right Section */}
        <View style={styles.rightSection}>
          {rightComponent}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background.primary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border.light,
    ...Shadows.header,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: Spacing.header,
    paddingHorizontal: Spacing.screen,
  },
  leftSection: {
    width: 50,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  rightSection: {
    width: 50,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
    marginLeft: -Spacing.sm,
  },
  backButtonPressed: {
    backgroundColor: Colors.interactive.pressed + '10',
  },
  title: {
    fontSize: Typography.fontSize.headline,
    fontWeight: Typography.fontWeight.semiBold,
    fontFamily: Typography.fontFamily.semiBold,
    textAlign: 'center',
    letterSpacing: Platform.OS === 'ios' ? -0.43 : 0,
    lineHeight: Typography.fontSize.headline * Typography.lineHeight.tight,
  },
  subtitle: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.regular,
    fontFamily: Typography.fontFamily.regular,
    textAlign: 'center',
    marginTop: 2,
    lineHeight: Typography.fontSize.caption1 * Typography.lineHeight.normal,
  },
});