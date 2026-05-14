/**
 * Google Sign-In service for Aurora.
 *
 * HOW TO ENABLE GOOGLE SIGN-IN (required before this works):
 *
 * 1. Firebase Console → Authentication → Sign-in methods → Google → Enable
 *    - Set "Project support email" (required)
 *    - Copy the "Web client ID" shown → set as EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env.local
 *
 * 2. Google Cloud Console → APIs & Services → Credentials
 *    - The Web client is auto-created by Firebase. Keep it.
 *    - For iOS: create an "iOS" OAuth client → set as EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in .env.local
 *      (also add the reversed client ID to app.json ios.infoPlist.CFBundleURLSchemes)
 *    - For Android: create an "Android" OAuth client using your app's SHA-1 fingerprint
 *      (get it via: npx expo credentials:manager)
 *
 * 3. For Expo Go (development only):
 *    - Use GOOGLE_WEB_CLIENT_ID only — Expo routes auth through its proxy automatically.
 *    - No extra config needed in Expo Go.
 *
 * 4. For production builds: set iosClientId and androidClientId in useGoogleAuthRequest().
 */

import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './config';
import { initUserDefaults, getFirebaseIdToken } from './SignupService';

// Read from environment variables — see .env.example
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

/**
 * Complete Firebase Google sign-in using the accessToken returned by expo-auth-session.
 * Creates a Firestore profile and default docs if the user is new.
 * Returns a NormalizedUser compatible with AuthContext.
 */
export const handleGoogleSignIn = async (accessToken) => {
  if (!auth) throw new Error('Firebase Auth não inicializado.');

  const credential = GoogleAuthProvider.credential(null, accessToken);
  const result = await signInWithCredential(auth, credential);
  const firebaseUser = result.user;
  const userId = firebaseUser.uid;

  // Check whether this is a first-time user by looking for an existing Firestore profile.
  const existingDoc = db ? await getDoc(doc(db, 'users', userId)) : null;
  const isNew = !existingDoc?.exists();

  if (isNew && db) {
    const userProfile = {
      id: userId,
      name: firebaseUser.displayName || '',
      email: firebaseUser.email || '',
      username: (firebaseUser.email || '').split('@')[0],
      photo: firebaseUser.photoURL || null,
      council: { id: '', state: '' },
      role: '',
      phone: firebaseUser.phoneNumber || '',
      is_premium: false,
      source: 'aurora',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'users', userId), userProfile);
    await initUserDefaults(userId);
  } else if (db) {
    // Update last login timestamp for returning users.
    await setDoc(doc(db, 'users', userId), { lastLoginAt: serverTimestamp() }, { merge: true });
  }

  const idToken = await getFirebaseIdToken();

  const existingData = existingDoc?.exists() ? existingDoc.data() : null;

  return {
    userInfo: {
      id: userId,
      name: firebaseUser.displayName || '',
      email: firebaseUser.email || '',
      username: (firebaseUser.email || '').split('@')[0],
      role: '',
      photo: firebaseUser.photoURL || null,
      council: { id: '', state: '' },
      phone: '',
      is_premium: false,
      source: 'aurora',
      showOnboarding: existingData?.showOnboarding ?? null,
    },
    idToken,
  };
};
