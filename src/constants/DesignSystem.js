/**
 * Premium Design System
 * Modern, native-inspired design tokens for consistent UI
 *
 * Dark Palette (v2):
 *   Charcoal Blue  #3d4d5c  — deep backgrounds
 *   Blue Slate     #49627a  — surface / card
 *   Blue Grey      #7096bb  — inactive / mid-tone
 *   Baby Blue Ice  #97cafc  — accent / highlight
 *   Tropical Teal  #6cc1c0  — primary action
 *   Mint Leaf      #41b883  — success / positive
 */
import { Dimensions, Platform } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// ─── Palette tokens ────────────────────────────────────────────────────────
const Palette = {
  charcoalBlue:  '#3d4d5c',
  blueSlate:     '#49627a',
  blueGrey:      '#7096bb',
  babyBlueIce:   '#97cafc',
  tropicalTeal:  '#6cc1c0',
  mintLeaf:      '#41b883',
  // Deeper surface derived by darkening charcoal-blue ~15%
  abyss:         '#263340',
};

export const Colors = {
  // Primary System Colors
  primary: '#6cc1c0',      // Tropical Teal
  primaryLight: '#97cafc', // Baby Blue Ice
  primaryDark: '#41b883',  // Mint Leaf
  
  // Background System (light)
  background: {
    primary: '#FFFFFF',
    secondary: '#F2F2F7',
    tertiary: '#F9F9FB',
    card: '#FFFFFF',
    elevated: '#FFFFFF',
  },
  
  // Dark Mode — harmonized with the new cool-toned palette
  dark: {
    primary:      Palette.tropicalTeal,   // #6cc1c0
    primaryLight: Palette.babyBlueIce,    // #97cafc
    primaryDark:  Palette.mintLeaf,       // #41b883

    background: {
      primary:   Palette.abyss,           // #263340  — deepest canvas
      secondary: Palette.charcoalBlue,    // #3d4d5c  — standard surface
      tertiary:  Palette.blueSlate,       // #49627a  — elevated surface
      card:      Palette.charcoalBlue,    // #3d4d5c
      elevated:  Palette.blueSlate,       // #49627a
    },
    text: {
      primary:     '#E8F4FD',                        // near-white, blue tinted
      secondary:   Palette.babyBlueIce,              // #97cafc
      tertiary:    'rgba(151, 202, 252, 0.65)',
      quaternary:  'rgba(151, 202, 252, 0.40)',
      placeholder: 'rgba(112, 150, 187, 0.55)',      // blue-grey
    },
    interactive: {
      active:   Palette.tropicalTeal,                // #6cc1c0
      inactive: Palette.blueGrey,                    // #7096bb
      pressed:  Palette.mintLeaf,                    // #41b883
      disabled: 'rgba(112, 150, 187, 0.30)',
    },
    success: Palette.mintLeaf,                       // #41b883
    warning: '#FFBB55',                              // warm amber — still visible on blue bg
    error:   '#FF6B6B',                              // soft red that won't clash with the cool tones
    info:    Palette.babyBlueIce,                    // #97cafc
    border: {
      light:  'rgba(73, 98, 122, 0.55)',             // blue-slate semi
      medium: Palette.blueSlate,                     // #49627a
      strong: Palette.blueGrey,                      // #7096bb
    },
    shadow: {
      light:   'rgba(38, 51, 64, 0.40)',
      medium:  'rgba(38, 51, 64, 0.60)',
      strong:  'rgba(38, 51, 64, 0.80)',
      overlay: 'rgba(38, 51, 64, 0.70)',
    },
  },
  
  // Text System
  text: {
    primary: '#000000',
    secondary: '#3C3C43',    // iOS Secondary Label
    tertiary: '#3C3C4399',   // iOS Tertiary Label
    quaternary: '#3C3C434D', // iOS Quaternary Label
    placeholder: '#3C3C434D',
  },
  
  // Interactive States
  interactive: {
    active:   Palette.tropicalTeal,              // #6cc1c0
    inactive: '#8E8E93',
    pressed:  Palette.mintLeaf,                  // #41b883
    disabled: '#3C3C4399',
  },
  
  // Semantic Colors
  success: '#34C759',        // iOS Green
  warning: '#FF9500',        // iOS Orange
  error: '#FF3B30',          // iOS Red
  info: '#97cafc',           // Baby Blue Ice
  
  // Border & Separator
  border: {
    light: '#C6C6C8',        // iOS Separator
    medium: '#8E8E93',
    strong: '#3C3C43',
  },
  
  // Shadows & Overlays
  shadow: {
    light: 'rgba(0, 0, 0, 0.04)',
    medium: 'rgba(0, 0, 0, 0.08)',
    strong: 'rgba(0, 0, 0, 0.12)',
    overlay: 'rgba(0, 0, 0, 0.3)',
  }
};

export const Typography = {
  // System Font Stack
  fontFamily: {
    regular: Platform.OS === 'ios' ? 'System' : 'Roboto',
    medium: Platform.OS === 'ios' ? 'System' : 'Roboto-Medium',
    semiBold: Platform.OS === 'ios' ? 'System' : 'Roboto-Medium',
    bold: Platform.OS === 'ios' ? 'System' : 'Roboto-Bold',
  },
  
  // Scale System (iOS Human Interface Guidelines)
  fontSize: {
    largeTitle: 34,    // iOS Large Title
    title1: 28,        // iOS Title 1
    title2: 22,        // iOS Title 2
    title3: 20,        // iOS Title 3
    headline: 17,      // iOS Headline
    body: 17,          // iOS Body
    callout: 16,       // iOS Callout
    subhead: 15,       // iOS Subhead
    footnote: 13,      // iOS Footnote
    caption1: 12,      // iOS Caption 1
    caption2: 11,      // iOS Caption 2
    caption3: 10,      // Custom smaller caption
  },
  
  // Line Heights
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
  
  // Font Weights (iOS Style)
  fontWeight: {
    regular: '400',
    medium: '500',
    semiBold: '600',
    bold: '700',
  }
};

export const Spacing = {
  // 8pt Grid System
  xs: 4,     // 0.25rem
  sm: 8,     // 0.5rem
  md: 16,    // 1rem
  lg: 24,    // 1.5rem
  xl: 32,    // 2rem
  xxl: 48,   // 3rem
  xxxl: 64,  // 4rem
  
  // Component Specific
  screen: 16,        // Default screen padding
  card: 16,          // Card internal padding
  section: 24,       // Section spacing
  element: 12,       // Element spacing
  
  // Safe Areas
  statusBar: Platform.OS === 'ios' ? 44 : 24,
  tabBar: Platform.OS === 'ios' ? 83 : 56,
  header: Platform.OS === 'ios' ? 44 : 56,
};

export const BorderRadius = {
  // iOS Design Language
  xs: 4,     // Small elements
  sm: 8,     // Buttons, inputs
  md: 12,    // Cards, containers
  lg: 16,    // Large containers
  xl: 20,    // Modal, sheets
  xxl: 28,   // Hero elements
  
  // Special Cases
  pill: 999, // Fully rounded
  circle: '50%',
};

export const Shadows = {
  // iOS-style shadows
  small: {
    shadowColor: Colors.shadow.light,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 1,
  },
  
  medium: {
    shadowColor: Colors.shadow.medium,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 3,
  },
  
  large: {
    shadowColor: Colors.shadow.strong,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
  },
  
  header: {
    shadowColor: Colors.shadow.light,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 1,
  }
};

export const Layout = {
  // Screen Dimensions
  window: {
    width: screenWidth,
    height: screenHeight,
  },
  
  // Breakpoints
  breakpoint: {
    small: 375,
    medium: 414,
    large: 768,
  },
  
  // Component Sizes
  button: {
    height: 50,    // iOS standard button height
    minWidth: 88,  // Minimum touch target
  },
  
  input: {
    height: 44,    // iOS standard input height
  },
  
  listItem: {
    height: 44,    // iOS standard list item
  },
  
  // Touch Targets (iOS HIG)
  touchTarget: {
    minimum: 44,   // iOS minimum touch target
    comfortable: 48,
  }
};

export const Animation = {
  // Timing
  duration: {
    fast: 150,
    normal: 250,
    slow: 350,
  },
  
  // Easing (iOS Style)
  easing: {
    standard: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
    decelerated: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
    accelerated: 'cubic-bezier(0.4, 0.0, 1, 1)',
    sharp: 'cubic-bezier(0.4, 0.0, 0.6, 1)',
  }
};

// Utility Functions
export const getColorScheme = (isDark = false) => isDark ? Colors.dark : Colors;

// Hook — returns the active palette based on current theme.
// Usage: const colors = useColors();
export const useColors = () => {
  // Lazy import to avoid circular dep at module load time.
  const { useTheme } = require('../contexts/ThemeContext');
  const { isDark } = useTheme();
  return isDark ? Colors.dark : Colors;
};

export const isSmallScreen = () => screenWidth < Layout.breakpoint.medium;
export const isMediumScreen = () => screenWidth >= Layout.breakpoint.medium && screenWidth < Layout.breakpoint.large;
export const isLargeScreen = () => screenWidth >= Layout.breakpoint.large;

// Export default design system
export default {
  Colors,
  Typography,
  Spacing,
  BorderRadius,
  Shadows,
  Layout,
  Animation,
  getColorScheme,
  isSmallScreen,
  isMediumScreen,
  isLargeScreen,
};