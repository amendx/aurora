/**
 * AppStyles — centralized shared style tokens for Aurora.
 *
 * EXTENDS (does not replace):
 *   src/constants/DesignSystem.js  — Colors, Typography, Spacing, BorderRadius, Shadows
 *   src/constants/Colors.js        — shift-specific palette (unchanged)
 *
 * ─── AUDIT SUMMARY (what was consolidated) ───────────────────────────────────
 *
 * BORDER + SHADOW on the same card (violation of elevation system):
 *   HomeScreen  — statsCard, shiftCard, actionCard: ...Shadows.small + borderWidth:1
 *   DayViewScreen      — shiftCard: shadow + borderWidth:1
 *   ShiftBottomSheet   — shiftTypeBadge, statusCard: borderWidth + ad-hoc shadow props
 *   ConfigScreen — card at line 697: ad-hoc elevation:2 + borderRadius:12
 *
 * HARDCODED font sizes (should use Typography tokens):
 *   ConfigScreen — fontSize: 18, 14, 12 (not using Typography.fontSize)
 *   HoursEditModal      — fontSize: 18, 14, 13, 12, 16 (not using Typography.fontSize)
 *   ShiftBottomSheet    — fontSize: 13, 12, 11, 10, 18 (not using Typography.fontSize)
 *   DayViewScreen       — fontWeight: '700' (should use Typography.fontWeight.bold)
 *
 * HARDCODED borderRadius (should use BorderRadius tokens):
 *   ShiftBottomSheet — borderRadius: 20 (should be BorderRadius.xl = 20 ✓ but not using token)
 *   CalendarScreen — borderRadius: 18 (should be BorderRadius.xl = 20, near-match)
 *   ConfigScreen — borderRadius: 18, 16, 12, 10, 6
 *   HoursEditModal — borderRadius: 16 (BorderRadius.lg), 5 (custom)
 *
 * ─── ELEVATION RULES ──────────────────────────────────────────────────────────
 *
 *   card.flat     — border only, no shadow
 *                   Use for: stats chips, tags, filter pills, empty state outlines
 *
 *   card.raised   — shadow only, no border  ← DEFAULT for most cards
 *                   Use for: shift cards, action cards, list items, welcome card
 *
 *   card.floating — stronger shadow, no border
 *                   Use for: bottom sheets, modals, FABs, popovers
 *
 * Rule: never add both borderWidth and shadowColor/elevation to the same view.
 * Pick one level from the three above.
 *
 * ─── HOW TO USE ──────────────────────────────────────────────────────────────
 *
 *   import { CardStyles, TextStyles, InputStyles, ButtonStyles, SheetStyles } from '../theme/AppStyles';
 *
 *   // Spread directly into StyleSheet or inline styles:
 *   <View style={[CardStyles.raised, { backgroundColor: C.background.primary }]} />
 *
 *   // With extra overrides:
 *   <View style={[CardStyles.raised, { borderRadius: BorderRadius.xxl }]} />
 *
 *   // Typography:
 *   <Text style={[TextStyles.bodyLarge, { color: C.text.primary }]} />
 */

import { Platform, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/DesignSystem';

// ─── Card Elevations ──────────────────────────────────────────────────────────

export const CardStyles = StyleSheet.create({
  /** Subtle, grounded. Border only, no shadow. */
  flat: {
    backgroundColor: Colors.background.primary,
    borderRadius: BorderRadius.lg,   // 16
    borderWidth: 1,
    borderColor: Colors.border.light,
  },

  /** Default card. Shadow only, no border. */
  raised: {
    backgroundColor: Colors.background.primary,
    borderRadius: BorderRadius.lg,   // 16
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(0,0,0,1)',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },

  /** Bottom sheets, modals, FABs. Stronger shadow, no border. */
  floating: {
    backgroundColor: Colors.background.primary,
    borderTopLeftRadius: BorderRadius.xxl,   // 28
    borderTopRightRadius: BorderRadius.xxl,
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(0,0,0,1)',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 32,
      },
      android: { elevation: 16 },
    }),
  },
});

// ─── Typography (ready-to-spread RN style objects) ────────────────────────────

export const TextStyles = StyleSheet.create({
  displayLarge: {
    fontFamily: Typography.fontFamily.display,
    fontSize: Typography.fontSize.title1,    // 28
    fontWeight: Typography.fontWeight.bold,
    letterSpacing: -0.5,
  },
  displaySmall: {
    fontFamily: Typography.fontFamily.display,
    fontSize: Typography.fontSize.title2,    // 22
    fontWeight: Typography.fontWeight.bold,
    letterSpacing: -0.3,
  },
  bodyLarge: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.callout,   // 16
    fontWeight: Typography.fontWeight.regular,
  },
  bodyMedium: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.footnote,  // 13
    fontWeight: Typography.fontWeight.regular,
  },
  bodySmall: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.caption1,  // 12
    fontWeight: Typography.fontWeight.regular,
  },
  label: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.caption2,  // 11
    fontWeight: Typography.fontWeight.medium,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  caption: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.caption2,  // 11
    fontWeight: Typography.fontWeight.regular,
  },
});

// ─── Input fields ─────────────────────────────────────────────────────────────

export const InputStyles = StyleSheet.create({
  /** Base — transparent background, rounded border. Combine with state variants below. */
  base: {
    backgroundColor: 'transparent',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border.light,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    fontSize: Typography.fontSize.callout,
    fontFamily: Typography.fontFamily.regular,
  },

  /** Active (focused) */
  active: {
    borderColor: Colors.primary,
  },

  /** Has a value */
  filled: {
    borderColor: Colors.primary,
    borderWidth: 1,
  },

  /** Error state */
  error: {
    borderColor: Colors.error,
    borderWidth: 1.5,
  },

  /** Disabled */
  disabled: {
    borderColor: Colors.border.light,
    opacity: 0.5,
  },

  /** Login screen only — underline variant. */
  underline: {
    backgroundColor: 'transparent',
    borderBottomWidth: 1.5,
    borderBottomColor: Colors.border.light,
    paddingBottom: 10,
    paddingTop: 4,
    fontSize: Typography.fontSize.callout,
    fontFamily: Typography.fontFamily.regular,
  },

  underlineFilled: {
    borderBottomColor: Colors.primary,
  },
});

// ─── Buttons ──────────────────────────────────────────────────────────────────

export const ButtonStyles = StyleSheet.create({
  primary: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.pill,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.pill,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: {
    backgroundColor: 'transparent',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.callout,
    fontWeight: Typography.fontWeight.semiBold,
    color: '#FFFFFF',
  },
  secondaryText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.callout,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.primary,
  },
  ghostText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
  },
});

// ─── Bottom Sheets ────────────────────────────────────────────────────────────

export const SheetStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background.primary,
    borderTopLeftRadius: BorderRadius.xxl,   // 28
    borderTopRightRadius: BorderRadius.xxl,
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(0,0,0,1)',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: { elevation: 16 },
    }),
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: BorderRadius.pill,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
});
