import 'react-native-gesture-handler';
import React, { useContext, useState, useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { ShiftsProvider } from './src/contexts/ShiftsContext';
import { GroupsProvider } from './src/contexts/GroupsContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import LoginScreenPremium from './src/screens/LoginScreenPremium';
import SignupScreen from './src/screens/SignupScreen';
import MainScreenPremium from './src/screens/MainScreenPremium';
import { AuthContext } from './src/context/AuthContext';

function RootNavigator() {
  const { isAuthenticated } = useContext(AuthContext);
  const [showSignup, setShowSignup] = useState(false);

  // Reset signup screen whenever the user logs out so they land back on login.
  useEffect(() => {
    if (!isAuthenticated) setShowSignup(false);
  }, [isAuthenticated]);

  if (isAuthenticated) return <MainScreenPremium />;
  if (showSignup) return <SignupScreen onBack={() => setShowSignup(false)} />;
  return <LoginScreenPremium onShowSignup={() => setShowSignup(true)} />;
}

export default function App() {
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