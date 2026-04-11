import 'react-native-gesture-handler';
import React, { useContext } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { ShiftsProvider } from './src/contexts/ShiftsContext';
import LoginScreenPremium from './src/screens/LoginScreenPremium';
import MainScreenPremium from './src/screens/MainScreenPremium';
import { AuthContext } from './src/context/AuthContext';

function RootNavigator() {
  const { isAuthenticated } = useContext(AuthContext);

  return isAuthenticated ? <MainScreenPremium /> : <LoginScreenPremium />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ShiftsProvider>
          <RootNavigator />
        </ShiftsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}