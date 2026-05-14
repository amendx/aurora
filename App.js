import 'react-native-gesture-handler';
import React, { useContext, useState, useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// import * as Font from 'expo-font'; // uncomment when adding custom fonts
import { AuthProvider } from './src/context/AuthContext';
import { ShiftsProvider } from './src/contexts/ShiftsContext';
import { GroupsProvider } from './src/contexts/GroupsContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import MainScreen from './src/screens/MainScreen';
import { AuthContext } from './src/context/AuthContext';
import OnboardingScreen from './src/screens/OnboardingScreen';

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
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) setShowSignup(false);
  }, [isAuthenticated]);

  if (isAuthenticated && user?.showOnboarding) {
    return <OnboardingScreen onDone={completeOnboarding} />;
  }

  if (isAuthenticated) return <MainScreen />;
  if (showSignup) return <SignupScreen onBack={() => setShowSignup(false)} />;
  return <LoginScreen onShowSignup={() => setShowSignup(true)} />;
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
            <RootNavigator />
          </GroupsProvider>
        </ShiftsProvider>
      </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}