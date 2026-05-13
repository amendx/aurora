
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, doc, setDoc, getDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db, auth, storage } from './config';

// Maps Firebase Auth error codes to user-friendly Portuguese messages.
export const friendlyAuthError = (code) => {
  switch (code) {
    case 'auth/email-already-in-use':   return 'Este email já está cadastrado.';
    case 'auth/invalid-email':           return 'Email inválido.';
    case 'auth/weak-password':           return 'Senha muito fraca. Use ao menos 6 caracteres.';
    case 'auth/network-request-failed':  return 'Sem conexão. Verifique sua internet.';
    case 'auth/configuration-not-found': return 'Login por email não está ativado no projeto Firebase. Acesse Firebase Console → Authentication → Sign-in methods → Email/Password e ative.';
    case 'auth/too-many-requests':       return 'Muitas tentativas. Aguarde alguns minutos.';
    case 'auth/user-not-found':          return 'Usuário não encontrado.';
    case 'auth/wrong-password':          return 'Senha incorreta.';
    case 'auth/popup-closed-by-user':    return 'Login cancelado.';
    case 'auth/username-taken':          return 'Este nome de usuário já está em uso.';
    default:                             return null;
  }
};

const _monthKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

export const _compressAndUpload = async (userId, photoUri) => {
  const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
  const compressed = await manipulateAsync(
    photoUri,
    [{ resize: { width: 400 } }],
    { compress: 0.7, format: SaveFormat.JPEG }
  );
  const response = await fetch(compressed.uri);
  const blob = await response.blob();
  const photoRef = ref(storage, `users/${userId}/profile/avatar.jpg`);
  await uploadBytes(photoRef, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(photoRef);
};

// Exported so GoogleSignInService can reuse it.
export const initUserDefaults = async (userId) => {
  if (!db) return;
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const months = [_monthKey(prev), _monthKey(now), _monthKey(next)];
  const currentMonthKey = _monthKey(now);

  await Promise.all([
    setDoc(doc(db, 'users', userId, 'financialConfig', 'current'), {
      userId,
      version: 1,
      effectiveFrom: currentMonthKey,
      hourValues: { weekdayDay: 0, weekdayNight: 0, weekendDay: 0, weekendNight: 0 },
      loyaltyEnabled: false,
      loyaltyOptions: [],
      bonusEnabled: false,
      bonus: null,
      fridayNightAsWeekend: false,
      updatedAt: serverTimestamp(),
    }),
    setDoc(doc(db, 'users', userId, 'financialConfigHistory', '1'), {
      userId,
      version: 1,
      effectiveFrom: currentMonthKey,
      hourValues: { weekdayDay: 0, weekdayNight: 0, weekendDay: 0, weekendNight: 0 },
      loyaltyEnabled: false,
      loyaltyOptions: [],
      bonusEnabled: false,
      bonus: null,
      fridayNightAsWeekend: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    setDoc(doc(db, 'users', userId, 'settings', 'groupVisibility'), {
      hiddenGroups: [],
      updatedAt: serverTimestamp(),
    }),
    setDoc(doc(db, 'users', userId, 'settings', 'groupColors'), {
      colors: {},
      updatedAt: serverTimestamp(),
    }),
    ...months.map(monthKey =>
      setDoc(doc(db, 'users', userId, 'months', monthKey), {
        userId,
        monthKey,
        shiftCount: 0,
        syncedAt: serverTimestamp(),
      })
    ),
  ]);
};

export const createAccount = async ({ name, username, email, password, photoUri, crm, crmState }) => {
  if (!auth) throw new Error('Firebase Auth não inicializado. Verifique a configuração do app.');

  if (db) {
    const snap = await getDocs(query(collection(db, 'users'), where('username', '==', username)));
    if (!snap.empty) {
      const err = new Error('Este nome de usuário já está em uso.');
      err.code = 'auth/username-taken';
      throw err;
    }
  }

  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const userId = credential.user.uid;

  let photoUrl = null;
  if (photoUri) {
    photoUrl = await _compressAndUpload(userId, photoUri);
  }

  // council matches the WebClient normalized shape: { id, state }
  const council = { id: crm || '', state: crmState || '' };

  const userProfile = {
    id: userId,
    name: name || username,
    email,
    username,
    photo: photoUrl,
    council,
    role: '',
    phone: '',
    is_premium: false,
    source: 'aurora',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  };

  if (db) {
    await setDoc(doc(db, 'users', userId), userProfile);
    await initUserDefaults(userId);
  }

  return {
    id: userId,
    name: name || username,
    email,
    username,
    role: '',
    photo: photoUrl,
    council,
    phone: '',
    is_premium: false,
    source: 'aurora',
  };
};

// Try to sign in an Aurora (Firebase Auth) user with email + password.
// Returns { userInfo, idToken } on success.
// Throws with error.code set so the caller can decide whether to fall back to WebClient.
//   auth/user-not-found  → no Firebase account → try WebClient
//   auth/wrong-password / auth/invalid-credential → account exists but bad password → stop
export const loginAuroraUser = async (email, password) => {
  if (!auth) return null; // Firebase not available — caller should try WebClient

  const credential = await signInWithEmailAndPassword(auth, email, password);
  const firebaseUser = credential.user;
  const userId = firebaseUser.uid;
  const idToken = await firebaseUser.getIdToken(true);

  let userInfo = null;
  if (db) {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) {
      const d = snap.data();
      userInfo = {
        id: d.id || userId,
        name: d.name || '',
        email: d.email || email,
        username: d.username || '',
        role: d.role || '',
        photo: d.photo || null,
        council: d.council || { id: '', state: '' },
        phone: d.phone || '',
        is_premium: d.is_premium || false,
        source: 'aurora',
      };
    }
  }

  // Fallback if Firestore profile is missing (edge case)
  if (!userInfo) {
    userInfo = {
      id: userId,
      name: firebaseUser.displayName || email.split('@')[0],
      email: firebaseUser.email || email,
      username: email.split('@')[0],
      role: '',
      photo: firebaseUser.photoURL || null,
      council: { id: '', state: '' },
      phone: '',
      is_premium: false,
      source: 'aurora',
    };
  }

  return { userInfo, idToken };
};

export const getFirebaseIdToken = async () => {
  if (!auth?.currentUser) return null;
  return auth.currentUser.getIdToken(true);
};

// Waits for Firebase Auth to restore session from AsyncStorage before resolving.
// auth.currentUser is null right after app start — this avoids false negatives.
export const waitForAuroraAuth = () => {
  if (!auth) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { unsubscribe(); resolve(false); }, 5000);
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(!!firebaseUser);
    });
  });
};

export const signOutAurora = async () => {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('[SignupService] Firebase signOut failed:', err?.message);
  }
};

export const isAuroraUserStillSignedIn = () => !!auth?.currentUser;
