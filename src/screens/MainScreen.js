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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import HospitalDetailScreen from './HospitalDetailScreen';
import OpeningsScreen from './OpeningsScreen';
import NetworkVacanciesScreen from './NetworkVacanciesScreen';
import AvisosScreen from './AvisosScreen';
import NotificationsSettingsScreen from './NotificationsSettingsScreen';
import HistoricoScreen from './HistoricoScreen';
import GroupDayTeamScreen from './GroupDayTeamScreen';
import TrocasAbertasScreen from './TrocasAbertasScreen';
import ActivityLogScreen from './ActivityLogScreen';
// Aura (IA do Aurora): conselho de escala + gestão de disponibilidade.
import AuraScreen from './AuraScreen';
import AuraAvailabilityScreen from './AuraAvailabilityScreen';
import TabBar from '../components/TabBar';
import { useColors, Spacing } from '../constants/DesignSystem';
import Logger from '../utils/Logger';
import { emitScrollToTop } from '../utils/scrollToTopBus';

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
const SELF_CONTAINED = new Set(['dayView', 'avisos', 'notifsettings']);

// Map handleNavigation() screen-name → internal state key
const SCREEN_MAP = {
  Profile:               'profile',
  ConfigScreen:          'config',
  GroupsScreen:          'groups',
  HoursReport:           'reports',
  Reports:               'reports',
  GroupVisibilityScreen: 'groupVisibility',
  DayView:               'dayView',
  // ChartsScreen virou aba dentro de Reports — navega via 'Reports' com params.initialTab='graficos'.
  HospitalsScreen:       'hospitals',
  HospitalDetailScreen:  'hospitalDetail',
  OpeningsScreen:        'openings',
  NetworkVacanciesScreen: 'networkVacancies',
  AvisosScreen:          'avisos',
  NotificationsSettingsScreen: 'notifsettings',
  Historico:             'historico',
  GroupDayTeam:          'groupDayTeam',
  TrocasAbertas:         'trocasAbertas',
  ActivityLog:           'activityLog',
  AuraScreen:            'aura',              // Aura (IA do Aurora)
  AuraAvailabilityScreen: 'auraAvailability', // Aura (IA do Aurora)
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
  const insets   = useSafeAreaInsets();

  // Espaço único reservado pro TabBar absoluto.
  //   - tabBarReserve: pra base layer (tabs visíveis, TabBar mostra)
  //   - overlayReserve: pra sub-screens (overlayLayer tem zIndex 5 e cobre o
  //     TabBar — só precisa do safe-area inferior, sem altura do TabBar)
  // Telas filhas NÃO devem adicionar paddingBottom próprio em
  // ScrollView/contentContainerStyle.
  const TAB_BAR_HEIGHT = 56;
  const tabBarReserve  = TAB_BAR_HEIGHT + insets.bottom + Spacing.md;
  const overlayReserve = insets.bottom + Spacing.md;

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

  // Back-stack of overlays *below* the current one. Pushing a sub-screen while
  // already in an overlay stacks the current frame here so Back pops to it
  // instead of dismissing straight to the tab. Kept in a ref (not rendered —
  // only the top frame lives in overlayScreen state) to avoid stale closures
  // in the swipe-back PanResponder and extra renders.
  const overlayStackRef    = useRef([]);

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
            // Stacked overlay → snap the previous frame back into view rather
            // than revealing the tab underneath.
            if (overlayStackRef.current.length > 0) {
              const prev = overlayStackRef.current[overlayStackRef.current.length - 1];
              overlayStackRef.current = overlayStackRef.current.slice(0, -1);
              setCurrentScreen(prev.name); setScreenParams(prev.params); setOverlayScreen(prev);
              setGroupsRefreshFn(null); setReportsExportFn(null);
              slideX.setValue(0); baseParallaxX.setValue(-W * 0.1); overlayOpacity.setValue(1);
              isAnimating.current = false;
              return;
            }
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
      // Remember the current overlay so Back returns here, not to the tab.
      overlayStackRef.current = [...overlayStackRef.current, { name: currentScreen, params: screenParams }];
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

    // Stacked overlay → pop one level (crossfade) instead of dismissing to tab.
    // Mirrors pushSubScreen's replace transition.
    if (overlayStackRef.current.length > 0) {
      const prev = overlayStackRef.current[overlayStackRef.current.length - 1];
      overlayStackRef.current = overlayStackRef.current.slice(0, -1);
      Logger.nav(`pop ← ${currentScreen} → ${prev.name}`);
      overlayOpacity.setValue(0);
      setCurrentScreen(prev.name);
      setScreenParams(prev.params);
      setOverlayScreen(prev);
      setGroupsRefreshFn(null);
      setReportsExportFn(null);
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: DURATION_REPLACE,
        easing: EASING_OUT,
        useNativeDriver: true,
      }).start();
      return;
    }

    isAnimating.current = true;
    Logger.nav(`pop ← ${currentScreen || 'overlay'}`);

    const finish = () => {
      overlayStackRef.current = [];
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
    if (overlayScreen !== null) {
      // Tapping a tab dismisses all stacked overlays, not just one level.
      overlayStackRef.current = [];
      handleBackNavigation();
      setCurrentTab(tabId);
      Logger.nav(`tab → ${tabId}`);
      return;
    }
    if (currentTab === tabId) {
      // Re-tap na aba já ativa → volta ao topo do conteúdo.
      emitScrollToTop(tabId);
      return;
    }
    setCurrentTab(tabId);
    Logger.nav(`tab → ${tabId}`);
  };

  // ── Navigation handler (called by child screens) ───────────────────────────────
  const handleNavigation = (screenName, params = null) => {
    Logger.nav(`push → ${screenName}`);
    if (screenName === 'calendar') {
      handleTabPress('calendar');
      return;
    }
    const mapped = SCREEN_MAP[screenName];
    if (mapped) pushSubScreen(mapped, params);
  };

  // ── Header data ───────────────────────────────────────────────────────────────

  const TAB_BACK_LABELS = { home: 'Início', calendar: 'Calendário', settings: 'Configurações' };

  // Back label when Back returns to a stacked overlay (not a tab).
  const OVERLAY_BACK_LABELS = {
    openings: 'Vagas', networkVacancies: 'Vagas', groups: 'Grupos',
    trocasAbertas: 'Movimentações', historico: 'Histórico', reports: 'Relatórios',
    hospitals: 'Hospitais', charts: 'Gráficos', dayView: 'Dia',
    groupDayTeam: 'Equipe', profile: 'Perfil', config: 'Valores',
    aura: 'Aura', // Aura (IA do Aurora)
  };

  const getTabHeaderData = () => {
    switch (currentTab) {
      case 'home':     return { title: 'Início' };
      case 'calendar': return { title: 'Calendário' };
      case 'settings': return { title: 'Configurações' };
      default:         return { title: 'Aurora' };
    }
  };

  const getOverlayHeaderData = () => {
    const stackTop = overlayStackRef.current[overlayStackRef.current.length - 1];
    const backLabel = stackTop
      ? (OVERLAY_BACK_LABELS[stackTop.name] || 'Voltar')
      : (TAB_BACK_LABELS[currentTab] || 'Voltar');
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
      case 'hospitals':
        return { title: 'Meus hospitais', subtitle: 'Instituições e fidelização', showBackButton: true, onBackPress: handleBackNavigation, backLabel };
      case 'hospitalDetail': {
        const inst = screenParams?.institution;
        return {
          title: inst?.popular_name || inst?.name || 'Hospital',
          showBackButton: true, onBackPress: handleBackNavigation, backLabel,
        };
      }
      case 'openings':
        return { title: 'Vagas disponíveis', subtitle: 'Plantões em aberto', showBackButton: true, onBackPress: handleBackNavigation, backLabel };
      case 'networkVacancies':
        return { title: 'Vagas da rede', subtitle: 'Próximos 7 dias', showBackButton: true, onBackPress: handleBackNavigation, backLabel };
      case 'historico':
        return { title: 'Histórico', subtitle: 'Cessões e trocas', showBackButton: true, onBackPress: handleBackNavigation, backLabel };
      case 'groupDayTeam':
        return { title: 'Equipe do plantão', subtitle: 'Quem está hoje', showBackButton: true, onBackPress: handleBackNavigation, backLabel };
      case 'trocasAbertas':
        return { title: 'Movimentações', subtitle: 'Trocas e cessões em andamento', showBackButton: true, onBackPress: handleBackNavigation, backLabel };
      case 'activityLog':
        return { title: 'Minhas ações', subtitle: 'Log da sessão atual', showBackButton: true, onBackPress: handleBackNavigation, backLabel };
      // Aura (IA do Aurora)
      case 'aura':
        return { title: 'Aura', subtitle: 'Conselho de escala', showBackButton: true, onBackPress: handleBackNavigation, backLabel };
      case 'auraAvailability':
        return { title: 'Disponibilidade', subtitle: 'Bloqueios, folgas e regras', showBackButton: true, onBackPress: handleBackNavigation, backLabel };
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
        return (
          <ReportsScreen
            onExportReady={(fn) => setReportsExportFn(() => fn)}
            initialTab={screen.params?.initialTab || 'resumo'}
          />
        );
      case 'dayView':
        return (
          <DayViewScreen
            navigation={{ goBack: handleBackNavigation, navigate: handleNavigation }}
            initialDate={screen.params?.date}
            initialFocusShiftId={screen.params?.focusShiftId}
          />
        );
      case 'groupVisibility':
        return <GroupVisibilityScreen navigation={{ goBack: handleBackNavigation }} />;
      case 'profile':
        return <ProfileScreen navigation={{ goBack: handleBackNavigation, navigate: handleNavigation }} />;
      case 'config':
        return <ConfigScreen navigation={{ goBack: handleBackNavigation, navigate: handleNavigation }} />;
      case 'hospitals':
        return <HospitalsScreen navigation={{ goBack: handleBackNavigation, navigate: handleNavigation }} />;
      case 'hospitalDetail':
        return (
          <HospitalDetailScreen
            navigation={{ goBack: handleBackNavigation }}
            institution={screen.params?.institution}
          />
        );
      case 'openings':
        return <OpeningsScreen navigation={{ goBack: handleBackNavigation }} />;
      case 'networkVacancies':
        return <NetworkVacanciesScreen navigation={{ goBack: handleBackNavigation, navigate: handleNavigation }} />;
      case 'avisos':
        return <AvisosScreen navigation={{ goBack: handleBackNavigation }} />;
      case 'notifsettings':
        return <NotificationsSettingsScreen navigation={{ goBack: handleBackNavigation }} />;
      case 'historico':
        return <HistoricoScreen navigation={{ goBack: handleBackNavigation }} />;
      case 'groupDayTeam':
        return (
          <GroupDayTeamScreen
            navigation={{ goBack: handleBackNavigation, navigate: handleNavigation }}
            date={screen.params?.date}
            groupIds={screen.params?.groupIds}
          />
        );
      case 'trocasAbertas':
        return <TrocasAbertasScreen navigation={{ goBack: handleBackNavigation, navigate: handleNavigation }} />;
      case 'activityLog':
        return <ActivityLogScreen />;
      // Aura (IA do Aurora)
      case 'aura':
        return <AuraScreen navigation={{ goBack: handleBackNavigation, navigate: handleNavigation }} />;
      case 'auraAvailability':
        return <AuraAvailabilityScreen navigation={{ goBack: handleBackNavigation, navigate: handleNavigation }} />;
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
            style={[styles.content, { paddingBottom: tabBarReserve }, id !== currentTab && styles.tabHidden]}
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
          <View style={[styles.content, { paddingBottom: overlayReserve }, isSelfContained && styles.fullContent]}>
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
    // paddingBottom é injetado inline via tabBarReserve (insets-aware).
  },
  tabHidden: {
    display: 'none',
  },
  fullContent: {
    paddingBottom: 0, // self-contained screens manage their own bottom inset
  },
});
