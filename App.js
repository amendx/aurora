import 'react-native-gesture-handler';
import './src/utils/Logger'; // silences stray console.* — must load first
import React, { useContext } from 'react';
import { View, AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// import * as Font from 'expo-font'; // uncomment when adding custom fonts
import { AuthProvider } from './src/context/AuthContext';
import { ShiftsProvider } from './src/contexts/ShiftsContext';
import { GroupsProvider } from './src/contexts/GroupsContext';
import { OpeningsProvider } from './src/contexts/OpeningsContext';
import { OffersProvider } from './src/contexts/OffersContext';
import { SwapAuctionsProvider } from './src/contexts/SwapAuctionsContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { PrivacyProvider } from './src/contexts/PrivacyContext';
import AuthScreen from './src/screens/AuthScreen';
import MainScreen from './src/screens/MainScreen';
import { AuthContext } from './src/context/AuthContext';
import OnboardingScreen from './src/screens/OnboardingScreen';
import AuthBootstrapScreen from './src/screens/AuthBootstrapScreen';
import DebugApiCounter from './src/components/DebugApiCounter';
import NotificationService from './src/services/NotificationService';
import MovementExpiry from './src/services/MovementExpiry';
import { useEffect } from 'react';

// To enable Nexa fonts:
// 1. Download Nexa-Regular.ttf, Nexa-Bold.ttf, Nexa-Heavy.ttf from Fontfabric
// 2. Place in assets/fonts/ and uncomment the Font.loadAsync block below
function useCachedFonts() {
  // Font loading is a no-op until TTF files are added to assets/fonts/.
  return true;

  // Once fonts are in assets/fonts/, replace the line above with:
  // const [loaded, setLoaded] = useState(false);
  // useEffect(() => {
  //   Font.loadAsync({
  //     'Nexa-Regular': require('./assets/fonts/Nexa-Regular.ttf'),
  //     'Nexa-Bold':    require('./assets/fonts/Nexa-Bold.ttf'),
  //     'Nexa-Heavy':   require('./assets/fonts/Nexa-Heavy.ttf'),
  //   }).catch(() => {}).finally(() => setLoaded(true));
  // }, []);
  // return loaded;
}


function RootNavigator() {
  const { isAuthenticated, user, loading, completeOnboarding } = useContext(AuthContext);

  // Register for push notifications once we have an authenticated user.
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      NotificationService.registerForPushAsync(user.id);
    }
  }, [isAuthenticated, user?.id]);

  // Auto-expiry centralizado de movimentações:
  //  - Roda 1× ao montar com user logado.
  //  - Roda toda vez que o app volta do background (AppState 'active').
  //  Substitui as 3 fontes dispersas que faziam lazy-expire.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    MovementExpiry.sweepExpired(user.id, { force: true });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') MovementExpiry.sweepExpired(user.id);
    });
    return () => sub.remove();
  }, [isAuthenticated, user?.id]);

  if (loading) return <AuthBootstrapScreen />;

  if (isAuthenticated && user?.showOnboarding) {
    return <OnboardingScreen onDone={completeOnboarding} />;
  }
  if (isAuthenticated) return <MainScreen />;

  return <AuthScreen />;
}

export default function App() {
  const fontsLoaded = useCachedFonts();
  if (!fontsLoaded) return <View style={{ flex: 1 }} />;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
      <PrivacyProvider>
      <AuthProvider>
        <ShiftsProvider>
          <GroupsProvider>
            <OpeningsProvider>
              <OffersProvider>
                <SwapAuctionsProvider>
                  <RootNavigator />
                  <DebugApiCounter />
                </SwapAuctionsProvider>
              </OffersProvider>
            </OpeningsProvider>
          </GroupsProvider>
        </ShiftsProvider>
      </AuthProvider>
      </PrivacyProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}