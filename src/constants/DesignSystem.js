/**
 * Premium Design System
 * Modern, native-inspired design tokens for consistent UI
 *
 * Dark Palette (v3 — neutral dark, Claude-style):
 *   Abyss     #141414  — deepest canvas
 *   Surface   #1f1f1f  — standard page surface
 *   Card      #282828  — card / sheet
 *   Elevated  #323232  — elevated surface / modal
 *   Muted     #8a8a8a  — mid-tone / inactive
 */
import { Dimensions, Platform } from 'react-native';
import { useTheme as _useTheme } from '../contexts/ThemeContext';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// ─── Palette tokens ────────────────────────────────────────────────────────
const Palette = {
  charcoalBlue:  '#3d4d5c',
  blueSlate:     '#49627a',
  blueGrey:      '#7096bb',
  babyBlueIce:   '#97cafc',
  tropicalTeal:  '#6cc1c0',
  mintLeaf:      '#41b883',
  abyss:         '#263340',
  // Neutral dark (v3)
  darkAbyss:     '#141414',
  darkSurface:   '#1f1f1f',
  darkCard:      '#282828',
  darkElevated:  '#323232',
  darkMuted:     '#8a8a8a',
};

export const Colors = {
  // Primary System Colors
  primary: '#3FA9A7',      // Tropical Teal — refined Direction A
  primaryLight: '#97cafc', // Baby Blue Ice
  primaryDark: '#41b883',  // Mint Leaf
  
  // Semantic financial color — distinct from teal primary
  // Teal = navigation/interaction. Money = earnings, positive financial.
  money: '#2F9266',
  moneySoft: '#E3F3EB',

  // Soft teal background for active states, icon badges
  accentSoft: '#E5F4F3',

  // Soft warning background — A2 hero card "restam" stat, vacancy indicators
  warningSoft: '#FBEED4',

  // Background System (light)
  background: {
    primary: '#FFFFFF',
    secondary: '#F4F6F8',
    tertiary: '#F9FAFB',
    card: '#FFFFFF',
    elevated: '#FFFFFF',
  },
  
  // Dark Mode — neutral dark, Claude-style (v3)
  dark: {
    primary:      '#3FA9A7',              // teal — same as light, pops on dark bg
    primaryLight: '#6cc1c0',
    primaryDark:  '#41b883',

    background: {
      primary:   Palette.darkAbyss,       // #141414 — deepest canvas
      secondary: Palette.darkSurface,     // #1f1f1f — standard page surface
      tertiary:  Palette.darkCard,        // #282828 — slightly raised
      card:      Palette.darkCard,        // #282828 — card
      elevated:  Palette.darkElevated,    // #323232 — modal / sheet
    },
    text: {
      primary:     '#ececec',
      secondary:   '#a0a0a0',
      tertiary:    '#6b6b6b',
      quaternary:  '#4a4a4a',
      placeholder: '#555555',
    },
    interactive: {
      active:   '#3FA9A7',
      inactive: Palette.darkMuted,        // #8a8a8a
      pressed:  '#41b883',
      disabled: 'rgba(138,138,138,0.25)',
    },
    money:      '#4aba8a',
    moneySoft:  'rgba(74,186,138,0.15)',
    accentSoft: 'rgba(63,169,167,0.15)',
    success:    '#41b883',
    warning:    '#f0a843',
    warningSoft:'rgba(240,168,67,0.15)',
    error:      '#e05c5c',
    info:       '#5a8dd1',
    border: {
      light:  'rgba(255,255,255,0.08)',
      medium: 'rgba(255,255,255,0.13)',
      strong: 'rgba(255,255,255,0.22)',
    },
    shadow: {
      light:   'rgba(0,0,0,0.30)',
      medium:  'rgba(0,0,0,0.50)',
      strong:  'rgba(0,0,0,0.70)',
      overlay: 'rgba(0,0,0,0.60)',
    },
  },
  
  // Text System
  text: {
    primary: '#0E141A',
    secondary: '#4B5560',
    tertiary: '#8A95A0',
    quaternary: '#B0BCC6',
    placeholder: '#B0BCC6',
  },
  
  // Interactive States
  interactive: {
    active:   '#3FA9A7',                         // refined teal
    inactive: '#8A95A0',
    pressed:  Palette.mintLeaf,                  // #41b883
    disabled: '#3C3C4399',
  },

  // Semantic Colors
  success: '#34C759',        // iOS Green
  warning: '#E08A00',        // Muted amber — Direction A
  error: '#E0524C',          // Muted red — Direction A
  info: '#5A8DD1',           // Steel blue — Direction A
  
  // Border & Separator
  border: {
    light: '#E6E9EC',        // Direction A — much lighter than iOS default
    medium: '#CFD4D8',
    strong: '#4B5560',
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
  // Font families
  // DM Sans (body) + DM Serif Display (display/headings)
  // To activate: place TTF files in assets/fonts/ and add useFonts() in App.js
  fontFamily: {
    regular:     'Nexa-Regular',
    medium:      'Nexa-Regular',
    semiBold:    'Nexa-Bold',
    bold:        'Nexa-Bold',
    display:     'Nexa-Heavy',
    displayItalic: 'Nexa-Heavy',
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
  },

  // Deep shadow for bottom sheets, modals, FABs
  strong: {
    shadowColor: 'rgba(0,0,0,1)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
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

// Re-export so components can import from one place.
export { _useTheme as useTheme };

// Hook — returns the active palette based on current theme.
export const useColors = () => {
  const { isDark } = _useTheme();
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