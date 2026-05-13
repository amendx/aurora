/**
 * Firebase configuration for Aurora.
 *
 * Values are read from environment variables injected by Expo at build time.
 * See .env.example for the full list of required variables.
 *
 * Local development:
 *   1. Copy .env.example → .env.local
 *   2. Fill in your Firebase project values
 *   3. Restart the Expo dev server
 *
 * Production:
 *   Set variables in your CI/CD environment (EAS Secrets, GitHub Actions, etc.)
 *   Never commit real credentials to source control.
 */

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FIREBASE_CONFIG = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId:     process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Only initialize if all required env vars are present.
const _isConfigured = !!(
  FIREBASE_CONFIG.apiKey &&
  FIREBASE_CONFIG.projectId &&
  FIREBASE_CONFIG.appId
);

let db      = null;
let auth    = null;
let storage = null;

if (_isConfigured) {
  try {
    const isNew = getApps().length === 0;
    const app   = isNew ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
    db      = getFirestore(app);
    auth    = isNew
      ? initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
      : getAuth(app);
    storage = getStorage(app);
  } catch (err) {
    console.warn('[Aurora/Firebase] Init failed:', err?.message);
  }
} else {
  console.info('[Aurora/Firebase] Firebase env vars not set — shadow writes disabled. See .env.example.');
}

export { db, auth, storage };
