import React, { createContext, useState, useEffect } from 'react';
import { WebClientApiService } from '../services/WebClientApiService';
import { StorageService } from '../utils/StorageService';
import { runMigration } from '../services/StorageMigration';
import LocalCache from '../services/LocalCache';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';
import { syncCurrentMonthToFirebase, hydratePastMonthsFromFirebase } from '../services/firebase/LoginSyncService';
import {
  createAccount,
  loginAuroraUser,
  getFirebaseIdToken,
  waitForAuroraAuth,
  signOutAurora,
  friendlyAuthError,
} from '../services/firebase/SignupService';
import { handleGoogleSignIn } from '../services/firebase/GoogleSignInService';
import { db } from '../services/firebase/config';
import { useTheme } from '../contexts/ThemeContext';
import TodayCoworkersService from '../services/TodayCoworkersService';
import Logger from '../utils/Logger';

// Returns true only if Firestore has a doc for this email with source:'aurora'.
const _isAuroraAccountInFirestore = async (email) => {
  if (!db || !email) return false;
  const { collection, query, where, getDocs } = await import('../services/firebase/fdb');
  const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
  if (snap.empty) return false;
  return snap.docs[0].data()?.source === 'aurora';
};

const _fireMigration = (userId) => {
  if (!userId) return;
  runMigration(userId).catch(err =>
    Logger.warn('StorageMigration background error:', err?.message)
  );
};

const _activateFirebase = () => LocalCache.setFirebaseAdapter(FirebaseAdapter);
const _deactivateFirebase = () => LocalCache.setFirebaseAdapter(null);

const _isAurora = (userData) => userData?.source === 'aurora';

// Reads persistent user-level flags from Firestore — these survive logout
// (AsyncStorage gets cleared) so they must be re-hydrated from the cloud
// on every login. Returns {} if Firestore unavailable or doc absent.
const _loadFirestoreUserFlags = async (uid) => {
  if (!db || !uid) return {};
  try {
    const { doc, getDoc } = await import('../services/firebase/fdb');
    const snap = await getDoc(doc(db, 'users', String(uid)));
    if (!snap.exists()) return {};
    const d = snap.data() || {};
    return {
      showOnboarding: d.showOnboarding,
      auroraOnlyMode: d.auroraOnlyMode,
      auroraSnapshotAt: d.auroraSnapshotAt,
    };
  } catch {
    return {};
  }
};

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);
  const { setUserId: setThemeUserId } = useTheme();

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      Logger.info('🔍 Verificando status de autenticação...');

      const storedToken = await StorageService.getToken();
      const userData = await StorageService.getUserData();

      if (storedToken && userData) {
        const isTokenValid = await validateToken(storedToken, userData);

        if (isTokenValid) {
          // For Aurora users, always refresh the ID token on startup so it
          // never becomes stale (Firebase ID tokens expire after 1 hour).
          let activeToken = storedToken;
          if (_isAurora(userData)) {
            const fresh = await getFirebaseIdToken();
            if (fresh) {
              activeToken = fresh;
              await StorageService.saveToken(fresh);
            }
          }

          setToken(activeToken);
          setUser(userData);
          setIsAuthenticated(true);
          setThemeUserId(userData?.id || null);
          _fireMigration(userData?.id);
          _activateFirebase();
          FirebaseAdapter.saveUser(userData?.id, null, userData).catch(() => {});

          // Hydrate immutable past months from Firestore for both user types
          // so Charts/Reports don't re-fetch on fresh device or after logout.
          hydratePastMonthsFromFirebase(userData?.id, userData?.source).catch(() => {});

          // WebClient-only background tasks — skip for Aurora users who have no WebClient token.
          // [WEBCLIENT-BRIDGE] e tb skip se usuário webClient migrou pra aurora-only:
          // ele não precisa mais bater no PlantaoAPI.
          if (!_isAurora(userData) && !userData?.auroraOnlyMode) {
            syncCurrentMonthToFirebase(userData?.id).catch(() => {});
            TodayCoworkersService.compute(userData?.id, activeToken, userData?.id).catch(() => {});
          }

          Logger.info('✅ Usuário já autenticado com token válido');
        } else {
          Logger.warn('⚠️ Token expirado, removendo dados');
          await StorageService.clearAll();
        }
      } else {
        Logger.info('ℹ️ Nenhum token armazenado encontrado');
      }
    } catch (error) {
      Logger.error('❌ Erro ao verificar status de autenticação:', error.message);
      await StorageService.clearAll();
    } finally {
      setLoading(false);
    }
  };

  const validateToken = async (tokenToValidate, userData) => {
    try {
      // Aurora users: wait for Firebase Auth to restore session from AsyncStorage.
      // auth.currentUser is null synchronously on startup — waitForAuroraAuth uses
      // onAuthStateChanged to get the real answer after the SDK initializes.
      if (_isAurora(userData)) {
        return waitForAuroraAuth();
      }

      // [WEBCLIENT-BRIDGE] usuário webClient que já migrou pra aurora-only não
      // depende mais do PlantaoAPI. Confia no token local — sessão persiste mesmo
      // se a API estiver indisponível ou o token tiver expirado lá.
      if (userData?.auroraOnlyMode === true && tokenToValidate) {
        return true;
      }

      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/users/profile`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${tokenToValidate}`,
        },
      });

      Logger.debug(`🔐 Validação do token - Status: ${response.status}`);
      return response.status === 200;
    } catch (error) {
      Logger.error('❌ Erro na validação do token:', error.message);
      return false;
    }
  };

  const login = async (email, password) => {
    try {
      setLoading(true);
      Logger.info(`🔐 Login attempt — email: ${email}`);

      // ── Step 1: try Firebase Auth (Aurora users) ──────────────────────────
      // Errors that mean "stop here — don't fall through to WebClient":
      const FIREBASE_HARD_STOP = new Set([
        'auth/wrong-password',
        'auth/invalid-credential', // Firebase SDK v10+ merges wrong-password into this
        'auth/too-many-requests',
        'auth/user-disabled',
      ]);

      try {
        const aurora = await loginAuroraUser(email, password);
        if (aurora) {
          const { userInfo: rawAuroraInfo, idToken } = aurora;
          const prevUserData = await StorageService.getUserData();
          const isFirstLogin = !prevUserData || prevUserData.id !== rawAuroraInfo.id;
          const fsFlags = await _loadFirestoreUserFlags(rawAuroraInfo.id);
          const userInfo = {
            ...rawAuroraInfo,
            showOnboarding: fsFlags.showOnboarding != null
              ? fsFlags.showOnboarding
              : (isFirstLogin ? true : (rawAuroraInfo.showOnboarding ?? prevUserData?.showOnboarding ?? false)),
            auroraOnlyMode: fsFlags.auroraOnlyMode === true,
            auroraSnapshotAt: fsFlags.auroraSnapshotAt || null,
          };
          await StorageService.saveToken(idToken);
          await StorageService.saveUserData(userInfo);
          setToken(idToken);
          setUser(userInfo);
          setIsAuthenticated(true);
          setThemeUserId(userInfo?.id || null);
          _activateFirebase();
          FirebaseAdapter.saveUser(userInfo.id, null, userInfo).catch(() => {});
          hydratePastMonthsFromFirebase(userInfo.id, 'aurora').catch(() => {});
          Logger.info(`✅ Login concluído — email: ${email} source: aurora`);
          return { success: true };
        }
        // loginAuroraUser returned null → Firebase not initialised, fall through
      } catch (firebaseErr) {
        if (FIREBASE_HARD_STOP.has(firebaseErr.code)) {
          // Before hard-stopping, confirm this is actually an Aurora account in Firestore.
          // If no Firestore doc with source:'aurora' exists, fall through to WebClient —
          // the Firebase Auth account may be a ghost (e.g. migrated WebClient user).
          const isAuroraAccount = await _isAuroraAccountInFirestore(email).catch(() => false);
          if (isAuroraAccount) {
            return { success: false, error: friendlyAuthError(firebaseErr.code) || 'Senha incorreta.' };
          }
          Logger.debug(`🔍 Firebase hard-stop mas sem conta Aurora no Firestore — tentando WebClient...`);
        } else {
          // auth/user-not-found or anything else → try WebClient below.
          Logger.debug(`🔍 Firebase login falhou (${firebaseErr.code}), tentando WebClient...`);
        }
      }

      // ── Step 2: WebClient API (original PlantaoAPI users) ─────────────────
      return await _webClientLogin(email, password);
    } catch (error) {
      Logger.error('❌ Erro no processo de login:', error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  // Login direto no PlantaoAPI, sem tentar Firebase antes. Usado pelo botão
  // dedicado "Entrar com conta PlantãoAPI" (fluxo só-visualização) e como
  // fallback do login() acima.
  const _webClientLogin = async (email, password) => {
    const result = await WebClientApiService.login(email, password);

    let apiData = null;
    if (result && result.message && result.data) {
      apiData = result.data;
    } else if (result && result.success && result.data) {
      apiData = result.data.data || result.data;
    }

    if (!apiData) {
      return { success: false, error: result?.error || 'Credenciais inválidas.' };
    }

    const extractedToken = apiData.token;
    if (!extractedToken) {
      return { success: false, error: 'Token não recebido pelo servidor.' };
    }

    const prevUserData = await StorageService.getUserData();
    const wcUid = apiData.id || apiData.user_id;
    const isFirstLogin = !prevUserData || prevUserData.id !== wcUid;
    const fsFlags = await _loadFirestoreUserFlags(wcUid);

    const userInfo = {
      id: wcUid,
      name: apiData.name || apiData.full_name || apiData.username || email,
      email: apiData.email || email,
      username: apiData.username || '',
      role: apiData.role || '',
      photo: apiData.photo || null,
      council: apiData.council || { id: '', state: '' },
      phone: apiData.phone || '',
      is_premium: apiData.is_premium || false,
      showOnboarding: fsFlags.showOnboarding != null
        ? fsFlags.showOnboarding
        : (isFirstLogin ? true : (prevUserData?.showOnboarding ?? false)),
      auroraOnlyMode: fsFlags.auroraOnlyMode === true,
      auroraSnapshotAt: fsFlags.auroraSnapshotAt || null,
      // source intentionally absent — treated as 'webClient' (só-visualização)
    };

    await StorageService.saveToken(extractedToken);
    await StorageService.saveUserData(userInfo);
    setToken(extractedToken);
    setUser(userInfo);
    setIsAuthenticated(true);
    setThemeUserId(userInfo.id);
    _fireMigration(userInfo.id);
    _activateFirebase();
    FirebaseAdapter.saveUser(userInfo.id, apiData, userInfo).catch(() => {});
    syncCurrentMonthToFirebase(userInfo.id).catch(() => {});
    hydratePastMonthsFromFirebase(userInfo.id, userInfo.source).catch(() => {});
    TodayCoworkersService.compute(userInfo.id, extractedToken, userInfo.id).catch(() => {});

    Logger.info(`✅ Login concluído — email: ${email} source: webClient`);
    return { success: true };
  };

  // Entrada dedicada PlantaoAPI (pula Firebase). Modo só-visualização.
  const loginWebClient = async (email, password) => {
    try {
      setLoading(true);
      Logger.info(`🔐 Login PlantãoAPI — email: ${email}`);
      return await _webClientLogin(email, password);
    } catch (error) {
      Logger.error('❌ Erro no login PlantãoAPI:', error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  const signup = async (signupData) => {
    try {
      setLoading(true);
      const rawUserInfo = await createAccount(signupData);
      const userInfo = { ...rawUserInfo, showOnboarding: true };
      const idToken = await getFirebaseIdToken();

      await StorageService.saveToken(idToken);
      await StorageService.saveUserData(userInfo);

      setToken(idToken);
      setUser(userInfo);
      setIsAuthenticated(true);
      setThemeUserId(userInfo.id);
      _activateFirebase();
      FirebaseAdapter.saveUser(userInfo.id, null, userInfo).catch(() => {});

      Logger.info('✅ Conta Aurora criada com sucesso');
      return { success: true };
    } catch (error) {
      Logger.error('❌ Erro ao criar conta:', error.message);
      const friendly = friendlyAuthError(error.code);
      return { success: false, error: friendly || error.message };
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async (accessToken) => {
    try {
      setLoading(true);
      const { userInfo: rawUserInfo, idToken } = await handleGoogleSignIn(accessToken);

      const prevUserData = await StorageService.getUserData();
      const isFirstLogin = !prevUserData || prevUserData.id !== rawUserInfo.id;
      const fsFlags = await _loadFirestoreUserFlags(rawUserInfo.id);
      const userInfo = {
        ...rawUserInfo,
        showOnboarding: fsFlags.showOnboarding != null
          ? fsFlags.showOnboarding
          : (isFirstLogin ? true : (rawUserInfo.showOnboarding ?? prevUserData?.showOnboarding ?? false)),
        auroraOnlyMode: fsFlags.auroraOnlyMode === true,
        auroraSnapshotAt: fsFlags.auroraSnapshotAt || null,
      };

      await StorageService.saveToken(idToken);
      await StorageService.saveUserData(userInfo);

      setToken(idToken);
      setUser(userInfo);
      setIsAuthenticated(true);
      setThemeUserId(userInfo.id);
      _activateFirebase();
      FirebaseAdapter.saveUser(userInfo.id, null, userInfo).catch(() => {});
      hydratePastMonthsFromFirebase(userInfo.id, 'aurora').catch(() => {});

      Logger.info(`✅ Login concluído — email: ${userInfo.email} source: aurora (google)`);
      return { success: true };
    } catch (error) {
      Logger.error('❌ Erro no login Google:', error.message);
      const friendly = friendlyAuthError(error.code);
      return { success: false, error: friendly || error.message };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      const storedToken = await StorageService.getToken();
      const userData = await StorageService.getUserData();

      if (_isAurora(userData)) {
        // Aurora users: sign out from Firebase Auth; no WebClient API to call.
        await signOutAurora();
      } else if (storedToken) {
        // WebClient users: invalidate the PlantaoAPI session.
        await WebClientApiService.logout(storedToken).catch(() => {});
      }

      await StorageService.clearAll();
      TodayCoworkersService.clear();
      _deactivateFirebase();
      setThemeUserId(null);
      setUser(null);
      setToken(null);
      setIsAuthenticated(false);

      return { success: true };
    } catch (error) {
      console.error('Erro no logout:', error);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  const updatePhoto = async (photoUri) => {
    try {
      const { _compressAndUpload } = await import('../services/firebase/SignupService');
      const photoUrl = await _compressAndUpload(user.id, photoUri);
      const { db: firestoreDb } = await import('../services/firebase/config');
      const { doc, setDoc } = await import('../services/firebase/fdb');
      if (firestoreDb) {
        await setDoc(doc(firestoreDb, 'users', user.id), { photo: photoUrl }, { merge: true });
      }
      const updated = { ...user, photo: photoUrl };
      await StorageService.saveUserData(updated);
      setUser(updated);
      Logger.info('✅ Foto de perfil atualizada');
      return { success: true };
    } catch (err) {
      Logger.error('❌ Erro ao atualizar foto:', err?.message);
      return { success: false, error: err?.message };
    }
  };

  const completeOnboarding = async () => {
    if (!user) return;
    const updated = { ...user, showOnboarding: false };
    await StorageService.saveUserData(updated).catch(() => {});
    setUser(updated);
    try {
      const { db: firestoreDb } = await import('../services/firebase/config');
      const { doc, setDoc } = await import('../services/firebase/fdb');
      if (firestoreDb && user.id) {
        await setDoc(doc(firestoreDb, 'users', user.id), { showOnboarding: false }, { merge: true });
      }
    } catch {}
  };

  const updateUser = async (patch) => {
    if (!user) return;
    const updated = { ...user, ...patch };
    await StorageService.saveUserData(updated).catch(() => {});
    setUser(updated);
  };

  // [WEBCLIENT-BRIDGE] — remove when webClient is fully retired.
  // Toggles "aurora-only" mode for webClient users. When true, ShiftsContext
  // reads only from Firestore (snapshot). When false, reads from PlantaoAPI.
  // Persists to Firestore so it survives logout (AsyncStorage gets cleared).
  const setAuroraOnlyMode = async (enabled, snapshotAt = null) => {
    if (!user) return { success: false };
    const updated = {
      ...user,
      auroraOnlyMode: !!enabled,
      ...(snapshotAt ? { auroraSnapshotAt: snapshotAt } : {}),
    };
    await StorageService.saveUserData(updated).catch(() => {});
    setUser(updated);
    try {
      const { doc, setDoc } = await import('../services/firebase/fdb');
      if (db && user.id) {
        await setDoc(doc(db, 'users', String(user.id)), {
          auroraOnlyMode: !!enabled,
          ...(snapshotAt ? { auroraSnapshotAt: snapshotAt } : {}),
        }, { merge: true });
      }
      return { success: true };
    } catch (err) {
      Logger.warn('setAuroraOnlyMode firestore write failed:', err?.message);
      return { success: false, error: err?.message };
    }
  };

  const value = {
    isAuthenticated,
    user,
    token,
    loading,
    login,
    loginWebClient,
    signup,
    loginWithGoogle,
    logout,
    updatePhoto,
    completeOnboarding,
    updateUser,
    setAuroraOnlyMode,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export { AuthContext };
