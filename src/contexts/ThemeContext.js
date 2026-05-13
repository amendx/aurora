import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  const [preference, setPreference] = useState('system');
  const [userId, setUserId] = useState(null);

  // Load from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(v => {
      if (v === 'light' || v === 'dark' || v === 'system') {
        setPreference(v);
        Appearance.setColorScheme(v === 'system' ? null : v);
      }
    });
  }, []);

  // When userId is set (after login), load preference from Firestore and override
  useEffect(() => {
    if (!userId) return;
    _loadFromFirestore(userId).then(v => {
      if (v) {
        setPreference(v);
        AsyncStorage.setItem(THEME_KEY, v);
        Appearance.setColorScheme(v === 'system' ? null : v);
        console.log(`[Theme] loaded from Firestore → ${v}`);
      }
    });
  }, [userId]);

  const setTheme = async (value) => {
    setPreference(value);
    await AsyncStorage.setItem(THEME_KEY, value);
    Appearance.setColorScheme(value === 'system' ? null : value);
    _saveToFirestore(userId, value);
    console.log(`[Theme] set → ${value} | system: ${systemScheme} | isDark: ${value === 'dark' || (value === 'system' && systemScheme === 'dark')}`);
  };

  const isDark = preference === 'dark' || (preference === 'system' && systemScheme === 'dark');

  useEffect(() => {
    console.log(`[Theme] active → preference: ${preference} | system: ${systemScheme} | isDark: ${isDark}`);
  }, [isDark, preference]);

  return (
    <ThemeContext.Provider value={{ isDark, preference, setTheme, setUserId }}>
      {children}
    </ThemeContext.Provider>
  );
};
