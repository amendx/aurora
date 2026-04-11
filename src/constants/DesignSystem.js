/**
 * Premium Design System
 * Modern, native-inspired design tokens for consistent UI
 */
import { Dimensions, Platform } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export const Colors = {
  // Primary System Colors
  primary: '#007AFF',      // iOS Blue
  primaryLight: '#5AC8FA', // Light Blue
  primaryDark: '#0056CC',  // Dark Blue
  
  // Background System
  background: {
    primary: '#FFFFFF',
    secondary: '#F2F2F7',   // iOS Light Gray
    tertiary: '#F9F9FB',    // Subtle Background
    card: '#FFFFFF',
    elevated: '#FFFFFF',
  },
  
  // Dark Mode
  dark: {
    background: {
      primary: '#000000',
      secondary: '#1C1C1E',   // iOS Dark Gray
      tertiary: '#2C2C2E',    // Card Background
      card: '#1C1C1E',
      elevated: '#2C2C2E',
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#EBEBF5',
      tertiary: '#EBEBF560',
    }
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
    active: '#007AFF',
    inactive: '#8E8E93',     // iOS Inactive
    pressed: '#0056CC',
    disabled: '#3C3C4399',
  },
  
  // Semantic Colors
  success: '#34C759',        // iOS Green
  warning: '#FF9500',        // iOS Orange
  error: '#FF3B30',          // iOS Red
  info: '#5AC8FA',           // iOS Light Blue
  
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
export const getColorScheme = (isDark = false) => {
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