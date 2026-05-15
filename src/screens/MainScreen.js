/**
 * MainScreen — custom navigator with native-feeling push/pop/tab animations.
 *
 * AUDIT (motion refactor):
 *   Was: single fadeAnim (0.6→1, 180ms) for all transitions — tabs AND sub-screens.
 *   Now: two-layer overlay architecture:
 *     - BASE layer: tab content, always rendered, slides left (iOS parallax) during push.
 *     - OVERLAY layer: sub-screens, animated over the base as a full-screen panel.
 *
 *   iOS push:  overlay slides from right (translateX W→0, 380ms).
 *              Base shifts left -W*0.1 (parallax).
 *   iOS pop:   overlay slides to right (translateX 0→W, 300ms, ease-in).
 *              Base returns to 0.
 *   Android push: overlay fades + slides up (translateY 32→0, opacity 0→1, 280ms).
 *   Android pop:  reversal, 260ms ease-in.
 *   Tab switch: opacity crossfade only (150ms). Never translate on tab change.
 *
 *   Sub-screen→sub-screen (rare): simple 120ms crossfade (no slide).
 */

import React, { useState, useContext, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  PanResponder,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AuthContext } from '../context/AuthContext';
import AppHeader from '../components/AppHeader';
import HomeScreen from './HomeScreen';
import CalendarScreen from './CalendarScreen';
import SettingsScreen from './SettingsScreen';
import ProfileScreen from './ProfileScreen';
import ConfigScreen from './ConfigScreen';
import GroupsScreen from './GroupsScreen';
import ReportsScreen from './ReportsScreen';
import GroupVisibilityScreen from './GroupVisibilityScreen';
import DayViewScreen from './DayViewScreen';
import HospitalsScreen from './HospitalsScreen';
import ChartsScreen from './ChartsScreen';
import TabBar from '../components/TabBar';
import { useColors, Spacing } from '../constants/DesignSystem';
import Logger from '../utils/Logger';

// ─── Animation constants ───────────────────────────────────────────────────────
const { width: W } = Dimensions.get('window');

const DURATION_PUSH_IOS     = 380;
const DURATION_PUSH_ANDROID = 280;
const DURATION_POP          = 300;
const DURATION_REPLACE      = 120;

// iOS: Material/UIKit standard easing curves
const EASING_STANDARD   = Easing.bezier(0.2, 0, 0, 1);   // decelerate (push arrive)
const EASING_ACCELERATE = Easing.bezier(0.4, 0, 1, 1);   // accelerate (pop leave)
const EASING_OUT        = Easing.bezier(0, 0, 0.2, 1);   // ease-out (tab fade)

// Screens that include their own full-screen header + handle their own safe area.
// These are rendered in the overlay WITHOUT an injected AppHeader.
const SELF_CONTAINED = new Set(['dayView']);

// Map handleNavigation() screen-name → internal state key
const SCREEN_MAP = {
  Profile:               'profile',
  ConfigScreen:          'config',
  GroupsScreen:          'groups',
  HoursReport:           'reports',
  Reports:               'reports',
  GroupVisibilityScreen: 'groupVisibility',
  DayView:               'dayView',
  ChartsScreen:          'charts',
  HospitalsScreen:       'hospitals',
};

export default function MainScreen() {
  const [currentTab,    setCurrentTab]    = useState('home');
  const [currentScreen, setCurrentScreen] = useState(null);
  const [screenParams,  setScreenParams]  = useState(null);
  const [groupsRefreshFn, setGroupsRefreshFn] = useState(null);
  const [reportsExportFn, setReportsExportFn] = useState(null);

  // overlayScreen persists during the exit animation so the screen stays
  // rendered until the animation completes.
  const [overlayScreen, setOverlayScreen] = useState(null); // { name, params } | null

  const { user } = useContext(AuthContext);
  const C        = useColors();

  // ── Animated values ──────────────────────────────────────────────────────────

  // [iOS only] base-layer parallax during push/pop
  const baseParallaxX = useRef(new Animated.Value(0)).current;

  // Overlay slide (iOS: translateX; Android: translateY)
  const slideX = useRef(new Animated.Value(W)).current;   // [iOS only]
  const slideY = useRef(new Animated.Value(32)).current;  // [Android only]

  // Overlay opacity (Android: full opacity anim; iOS: edge shadow only)
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const isAnimating        = useRef(false);
  const disableSwipeBack   = useRef(false);

  // Keep disableSwipeBack in sync with currentScreen
  useEffect(() => {
    disableSwipeBack.current = currentScreen === 'dayView';
  }, [currentScreen]);

  // ── Swipe-back gesture (iOS only) ─────────────────────────────────────────
  const swipeBackPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Platform.OS === 'ios' && g.dx > 8 && Math.abs(g.dy) < Math.abs(g.dx) * 1.5 && !isAnimating.current && !disableSwipeBack.current,
      onPanResponderMove: (_, g) => {
        const x = Math.max(0, g.dx);
        slideX.setValue(x);
        baseParallaxX.setValue(-W * 0.1 * (1 - x / W));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > W * 0.35 || g.vx > 0.6) {
          // commit — finish pop from current position
          isAnimating.current = true;
          const finish = () => {
            setOverlayScreen(null); setCurrentScreen(null);
            setScreenParams(null); setGroupsRefreshFn(null);
            setReportsExportFn(null); isAnimating.current = false;
          };
          Animated.parallel([
            Animated.timing(slideX, { toValue: W, duration: 220, easing: EASING_ACCELERATE, useNativeDriver: true }),
            Animated.timing(baseParallaxX, { toValue: 0, duration: 220, easing: EASING_OUT, useNativeDriver: true }),
            Animated.timing(overlayOpacity, { toValue: 0, duration: 110, easing: EASING_ACCELERATE, useNativeDriver: true }),
          ]).start(finish);
        } else {
          // cancel — snap back
          Animated.parallel([
            Animated.spring(slideX, { toValue: 0, damping: 22, stiffness: 300, mass: 0.8, useNativeDriver: true }),
            Animated.spring(baseParallaxX, { toValue: -W * 0.1, damping: 22, stiffness: 300, mass: 0.8, useNativeDriver: true }),
          ]).start();
        }
      },
      onPanResponderTerminate: (_, g) => {
        Animated.parallel([
          Animated.spring(slideX, { toValue: 0, damping: 22, stiffness: 300, mass: 0.8, useNativeDriver: true }),
          Animated.spring(baseParallaxX, { toValue: -W * 0.1, damping: 22, stiffness: 300, mass: 0.8, useNativeDriver: true }),
        ]).start();
      },
    })
  ).current;

  // ── Push: navigate into a sub-screen ─────────────────────────────────────────
  const pushSubScreen = (screenName, params = null) => {
    // If already in an overlay, do a quick replace crossfade instead of slide
    if (overlayScreen !== null) {
      overlayOpacity.setValue(0);
      setCurrentScreen(screenName);
      setScreenParams(params);
      setOverlayScreen({ name: screenName, params });
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: DURATION_REPLACE,
        easing: EASING_OUT,
        useNativeDriver: true,
      }).start();
      return;
    }

    if (isAnimating.current) return;
    isAnimating.current = true;

    // Set overlay content before animation starts (renders at offscreen position)
    setCurrentScreen(screenName);
    setScreenParams(params);
    setOverlayScreen({ name: screenName, params });

    if (Platform.OS === 'ios') {
      slideX.setValue(W);
      overlayOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(slideX, {
          toValue: 0,
          duration: DURATION_PUSH_IOS,
          easing: EASING_STANDARD,
          useNativeDriver: true,
        }),
        // Base slides left (parallax ~10%) [iOS only]
        Animated.timing(baseParallaxX, {
          toValue: -W * 0.1,
          duration: DURATION_PUSH_IOS,
          easing: EASING_STANDARD,
          useNativeDriver: true,
        }),
        // Left-edge shadow fades in as overlay arrives
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: DURATION_PUSH_IOS * 0.6,
          easing: EASING_OUT,
          useNativeDriver: true,
        }),
      ]).start(() => { isAnimating.current = false; });
    } else {
      // [Android only] slide up + fade in
      slideY.setValue(32);
      overlayOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(slideY, {
          toValue: 0,
          duration: DURATION_PUSH_ANDROID,
          easing: EASING_STANDARD,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: DURATION_PUSH_ANDROID,
          easing: EASING_OUT,
          useNativeDriver: true,
        }),
      ]).start(() => { isAnimating.current = false; });
    }
  };

  // ── Pop: go back from sub-screen ──────────────────────────────────────────────
  const handleBackNavigation = () => {
    if (isAnimating.current) return;
    isAnimating.current = true;

    const finish = () => {
      setOverlayScreen(null);
      setCurrentScreen(null);
      setScreenParams(null);
      setGroupsRefreshFn(null);
      setReportsExportFn(null);
      isAnimating.current = false;
    };

    if (Platform.OS === 'ios') {
      Animated.parallel([
        Animated.timing(slideX, {
          toValue: W,
          duration: DURATION_POP,
          easing: EASING_ACCELERATE,
          useNativeDriver: true,
        }),
        // Base returns to 0 [iOS only]
        Animated.timing(baseParallaxX, {
          toValue: 0,
          duration: DURATION_POP,
          easing: EASING_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: DURATION_POP * 0.5,
          easing: EASING_ACCELERATE,
          useNativeDriver: true,
        }),
      ]).start(finish);
    } else {
      // [Android only]
      Animated.parallel([
        Animated.timing(slideY, {
          toValue: 32,
          duration: DURATION_POP,
          easing: EASING_ACCELERATE,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: DURATION_POP * 0.7,
          easing: EASING_ACCELERATE,
          useNativeDriver: true,
        }),
      ]).start(finish);
    }
  };

  // ── Tab switch ────────────────────────────────────────────────────────────────
  const handleTabPress = (tabId) => {
    // If coming from a sub-screen, pop first then switch tab
    if (overlayScreen !== null) {
      handleBackNavigation();
      // Tab switch happens after pop completes — defer via state
      // (pop finish sets currentScreen to null; tab is already correct after this)
      setCurrentTab(tabId);
      return;
    }
    if (currentTab === tabId) return;

    // Instant switch — tabs stay mounted, display:none toggles layout participation.
    // No crossfade needed; native tab bars never crossfade (iOS, Android, WhatsApp, etc.)
    setCurrentTab(tabId);
  };

  // ── Navigation handler (called by child screens) ───────────────────────────────
  const handleNavigation = (screenName, params = null) => {
    Logger.debug(`📱 Navegação para: ${screenName}`);
    if (screenName === 'calendar') {
      handleTabPress('calendar');
      return;
    }
    const mapped = SCREEN_MAP[screenName];
    if (mapped) pushSubScreen(mapped, params);
  };

  // ── Header data ───────────────────────────────────────────────────────────────

  const TAB_BACK_LABELS = { home: 'Início', calendar: 'Calendário', settings: 'Configurações' };

  const getTabHeaderData = () => {
    switch (currentTab) {
      case 'home':     return { title: 'Início' };
      case 'calendar': return { title: 'Calendário' };
      case 'settings': return { title: 'Configurações' };
      default:         return { title: 'Aurora' };
    }
  };

  const getOverlayHeaderData = () => {
    const backLabel = TAB_BACK_LABELS[currentTab] || 'Voltar';
    switch (currentScreen) {
      case 'dayView':
        return { title: 'Dia', showBackButton: true, onBackPress: handleBackNavigation, backLabel };
      case 'reports':
        return {
          title: 'Relatórios', subtitle: 'Histórico e totais mensais',
          showBackButton: true, onBackPress: handleBackNavigation, backLabel,
          rightComponent: reportsExportFn ? <Text style={{ color: C.primary, fontSize: 15, fontWeight: '600' }}>Exportar</Text> : null,
          onRightPress: reportsExportFn ?? undefined,
        };
      case 'groups':
        return {
          title: 'Grupos', subtitle: 'Seus grupos e membros',
          showBackButton: true, onBackPress: handleBackNavigation, backLabel,
          rightComponent: groupsRefreshFn ? <Ionicons name="refresh" size={22} color={C.primary} /> : null,
          onRightPress: groupsRefreshFn ?? undefined,
        };
      case 'groupVisibility':
        return { title: 'Visibilidade de grupos', subtitle: 'Escolha quem aparece no seu plantão', showBackButton: true, onBackPress: handleBackNavigation, backLabel };
      case 'profile':
        return { title: 'Perfil', subtitle: 'Sua conta e configurações', showBackButton: true, onBackPress: handleBackNavigation, backLabel };
      case 'config':
        return { title: 'Valores do Plantão', subtitle: 'Configure valores e parâmetros', showBackButton: true, onBackPress: handleBackNavigation, backLabel };
      case 'charts':
        return { title: 'Gráficos', subtitle: 'Estimativas mensais', showBackButton: true, onBackPress: handleBackNavigation, backLabel };
      default:
        return { title: '', showBackButton: true, onBackPress: handleBackNavigation, backLabel };
    }
  };

  // ── Screen renderers ──────────────────────────────────────────────────────────

  // Stable nav delegate — updates via ref so screens never get new props → never remount.
  const _navRef = useRef(handleNavigation);
  _navRef.current = handleNavigation;
  const stableNav = useRef({ navigate: (...a) => _navRef.current(...a) }).current;

  // Tab screen elements created once — React reconciles the same instances forever.
  const TAB_SCREENS = useMemo(() => [
    { id: 'home',     el: <HomeScreen navigation={stableNav} /> },
    { id: 'calendar', el: <CalendarScreen navigation={stableNav} /> },
    { id: 'settings', el: <SettingsScreen navigation={stableNav} /> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  const renderOverlayContent = (screen) => {
    if (!screen) return null;
    switch (screen.name) {
      case 'groups':
        return (
          <GroupsScreen
            navigation={{ goBack: handleBackNavigation }}
            focusGroupId={screen.params?.focusGroupId}
            onRefreshReady={(fn) => setGroupsRefreshFn(() => fn)}
          />
        );
      case 'reports':
        return <ReportsScreen onExportReady={(fn) => setReportsExportFn(() => fn)} />;
      case 'dayView':
        return (
          <DayViewScreen
            navigation={{ goBack: handleBackNavigation, navigate: handleNavigation }}
            initialDate={screen.params?.date}
          />
        );
      case 'groupVisibility':
        return <GroupVisibilityScreen navigation={{ goBack: handleBackNavigation }} />;
      case 'profile':
        return <ProfileScreen navigation={{ goBack: handleBackNavigation, navigate: handleNavigation }} />;
      case 'config':
        return <ConfigScreen navigation={{ goBack: handleBackNavigation, navigate: handleNavigation }} />;
      case 'charts':
        return <ChartsScreen />;
      case 'hospitals':
        return <HospitalsScreen navigation={{ goBack: handleBackNavigation }} />;
      default:
        return null;
    }
  };

  // ── Overlay animated style ────────────────────────────────────────────────────
  const overlayAnimStyle = Platform.OS === 'ios'
    ? { transform: [{ translateX: slideX }] }
    : { transform: [{ translateY: slideY }], opacity: overlayOpacity };

  const isSelfContained = overlayScreen && SELF_CONTAINED.has(overlayScreen.name);

  return (
    <View style={[styles.container, { backgroundColor: C.background.secondary }]}>

      {/* ── BASE LAYER: tab content ── */}
      <Animated.View style={[
        styles.baseLayer,
        Platform.OS === 'ios' ? { transform: [{ translateX: baseParallaxX }] } : null,
      ]}>
        <AppHeader {...getTabHeaderData()} />
        {TAB_SCREENS.map(({ id, el }) => (
          <View
            key={id}
            style={[styles.content, id !== currentTab && styles.tabHidden]}
          >
            {el}
          </View>
        ))}
      </Animated.View>

      {/* ── OVERLAY LAYER: sub-screens ── */}
      {overlayScreen && (
        <Animated.View
          style={[styles.overlayLayer, overlayAnimStyle, { backgroundColor: C.background.secondary }]}
          {...(Platform.OS === 'ios' ? swipeBackPan.panHandlers : {})}
        >
          {/* Left-edge shadow strip [iOS only] — fades in as overlay arrives */}
          {Platform.OS === 'ios' && (
            <Animated.View
              style={[styles.overlayShadow, { opacity: overlayOpacity.interpolate({ inputRange: [0, 1], outputRange: [0, 0.15] }) }]}
              pointerEvents="none"
            />
          )}

          {/* Inject header for non-self-contained screens */}
          {!isSelfContained && (
            <AppHeader {...getOverlayHeaderData()} />
          )}

          {/* Screen content */}
          <View style={[styles.content, isSelfContained && styles.fullContent]}>
            {renderOverlayContent(overlayScreen)}
          </View>
        </Animated.View>
      )}

      {/* ── TAB BAR (always on top) ── */}
      <TabBar currentTab={currentTab} onTabPress={handleTabPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  baseLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  overlayShadow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 8,
    // [iOS only] mimics UINavigationController's left-edge shadow on incoming card
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    zIndex: 10,
  },
  content: {
    flex: 1,
    paddingBottom: 68 + Spacing.md * 2,
  },
  tabHidden: {
    display: 'none',
  },
  fullContent: {
    paddingBottom: 0, // self-contained screens manage their own bottom inset
  },
});
