import 'react-native-gesture-handler';
import './src/utils/Logger'; // silences stray console.* — must load first
import React, { useContext } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// import * as Font from 'expo-font'; // uncomment when adding custom fonts
import { AuthProvider } from './src/context/AuthContext';
import { ShiftsProvider } from './src/contexts/ShiftsContext';
import { GroupsProvider } from './src/contexts/GroupsContext';
import { OpeningsProvider } from './src/contexts/OpeningsContext';
import { OffersProvider } from './src/contexts/OffersContext';
import { SwapAuctionsProvider } from './src/contexts/SwapAuctionsContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import AuthScreen from './src/screens/AuthScreen';
import MainScreen from './src/screens/MainScreen';
import { AuthContext } from './src/context/AuthContext';
import OnboardingScreen from './src/screens/OnboardingScreen';
import DebugApiCounter from './src/components/DebugApiCounter';
import NotificationService from './src/services/NotificationService';
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
  const { isAuthenticated, user, completeOnboarding } = useContext(AuthContext);

  // Register for push notifications once we have an authenticated user.
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      NotificationService.registerForPushAsync(user.id);
    }
  }, [isAuthenticated, user?.id]);

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
      </ThemeProvider>
    </SafeAreaProvider>
  );
}