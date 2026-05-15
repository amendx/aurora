import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Logger from '../utils/Logger';

const THEME_KEY = '@aurora_theme';

const ThemeContext = createContext({});

export const useTheme = () => useContext(ThemeContext);

const _saveToFirestore = async (userId, preference) => {
  if (!userId) return;
  try {
    const { db } = require('../services/firebase/config');
    const { doc, setDoc } = require('firebase/firestore');
    if (!db) return;
    await setDoc(doc(db, 'users', userId, 'settings', 'appearance'), { theme: preference }, { merge: true });
  } catch {}
};

const _loadFromFirestore = async (userId) => {
  if (!userId) return null;
  try {
    const { db } = require('../services/firebase/config');
    const { doc, getDoc } = require('firebase/firestore');
    if (!db) return null;
    const snap = await getDoc(doc(db, 'users', userId, 'settings', 'appearance'));
    const v = snap.data()?.theme;
    return (v === 'light' || v === 'dark' || v === 'system') ? v : null;
  } catch { return null; }
};

export const ThemeProvider = ({ children }) => {
  const systemScheme = useColorScheme();
  const [systemOverride, setSystemOverride] = useState(() => Appearance.getColorScheme());
  const [preference, setPreference] = useState('system');
  const [userId, setUserId] = useState(null);

  // Appearance.addChangeListener is the reliable cross-env listener (Expo Go + standalone)
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      Logger.info(`[Theme] Appearance changed → ${colorScheme}`);
      setSystemOverride(colorScheme);
    });
    return () => sub.remove();
  }, []);

  // Load saved preference from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(v => {
      if (v === 'light' || v === 'dark' || v === 'system') setPreference(v);
    });
  }, []);

  // When userId is set (after login), load preference from Firestore and override
  useEffect(() => {
    if (!userId) return;
    _loadFromFirestore(userId).then(v => {
      if (v) {
        setPreference(v);
        AsyncStorage.setItem(THEME_KEY, v);
        Logger.info(`[Theme] loaded from Firestore → ${v}`);
      }
    });
  }, [userId]);

  const setTheme = async (value) => {
    setPreference(value);
    await AsyncStorage.setItem(THEME_KEY, value);
    _saveToFirestore(userId, value);
  };

  // systemOverride from the listener is authoritative; systemScheme is fallback for initial value
  const resolvedSystem = systemOverride ?? systemScheme;
  const isDark = preference === 'dark' || (preference === 'system' && resolvedSystem === 'dark');

  useEffect(() => {
    Logger.info(`[Theme] preference: ${preference} | system: ${resolvedSystem} | isDark: ${isDark}`);
  }, [isDark, preference, resolvedSystem]);

  return (
    <ThemeContext.Provider value={{ isDark, preference, setTheme, setUserId }}>
      {children}
    </ThemeContext.Provider>
  );
};
