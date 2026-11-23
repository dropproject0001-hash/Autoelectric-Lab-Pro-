import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  db,
  firebaseAuth,
  googleAuthProvider,
  isFirebaseConfigured,
} from '../lib/firebase';
import {
  CloudSyncStatusSnapshot,
  flushQueuedBenchSync,
  getSyncStatusSnapshot,
  handleFirestoreError,
  OperationType,
  subscribeSyncStatus,
} from '../services/benchStorageService';

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  isSigningIn: boolean;
  authError: string | null;
  workspaceToken: string | null;
  needsWorkspaceAuth: boolean;
  syncStatus: CloudSyncStatusSnapshot;
  signInWithGoogle: () => Promise<string | null>;
  signOutUser: () => Promise<void>;
  invalidateWorkspaceToken: () => void;
  retryCloudSync: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  authReady: true,
  isSigningIn: false,
  authError: null,
  workspaceToken: null,
  needsWorkspaceAuth: false,
  syncStatus: getSyncStatusSnapshot(),
  signInWithGoogle: async () => null,
  signOutUser: async () => {},
  invalidateWorkspaceToken: () => {},
  retryCloudSync: async () => {},
});

async function ensureUserProfileDocument(user: User): Promise<void> {
  if (!db || !user.uid || !user.email || !user.emailVerified) return;
  const profilePath = `users/${user.uid}`;
  const profileRef = doc(db, 'users', user.uid);
  const cleanEmail = user.email.trim().slice(0, 254);
  const cleanDisplayName = user.displayName ? user.displayName.trim().slice(0, 120) : undefined;

  try {
    const existingSnap = await getDoc(profileRef);
    if (existingSnap.exists()) {
      const existingData = existingSnap.data();
      const updatePayload: Record<string, unknown> = {
        uid: user.uid,
        email: cleanEmail,
        createdAt: existingData?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (cleanDisplayName !== undefined) {
        updatePayload.displayName = cleanDisplayName;
      }
      await setDoc(profileRef, updatePayload);
    } else {
      const createPayload: Record<string, unknown> = {
        uid: user.uid,
        email: cleanEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (cleanDisplayName !== undefined) {
        createPayload.displayName = cleanDisplayName;
      }
      await setDoc(profileRef, createPayload);
    }
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, profilePath);
    } catch {
      // Non-fatal: offline IndexedDB storage remains operational
    }
  }
}

function formatFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  if (code === 'auth/popup-closed-by-user') {
    return 'Google Sign-In popup was closed before completing authentication.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Browser blocked the Google Sign-In popup. Allow popups for this site and try again.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network unavailable for Google Sign-In. Offline IndexedDB bench mode remains active.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This preview domain is not yet authorized in Firebase Authentication.';
  }
  return err instanceof Error ? err.message : 'Google Sign-In failed.';
}

/**
 * Firebase Authentication & Firestore Cloud Sync Context with Offline IndexedDB Fallback.
 * Supports Google Sign-In alongside Trial PIN / Master Admin PIN modes.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(() => !firebaseAuth);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [workspaceToken, setWorkspaceToken] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatusSnapshot>(() => getSyncStatusSnapshot());

  useEffect(() => {
    const unsubSync = subscribeSyncStatus(setSyncStatus);
    return () => unsubSync();
  }, []);

  useEffect(() => {
    if (!firebaseAuth) {
      setAuthReady(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        setAuthError(null);
        void ensureUserProfileDocument(nextUser).then(() => {
          void flushQueuedBenchSync(nextUser.uid).catch(() => {});
        });
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.uid || typeof window === 'undefined') return;
    const handleOnline = () => {
      void flushQueuedBenchSync(user.uid).catch(() => {});
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [user?.uid]);

  const signInWithGoogle = useCallback(async (): Promise<string | null> => {
    if (!isFirebaseConfigured || !firebaseAuth) {
      setAuthError('Cloud sign-in is not configured in this environment. Offline local bench mode is active.');
      return null;
    }
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const credential = await signInWithPopup(firebaseAuth, googleAuthProvider);
      const signedInUser = credential.user;
      setUser(signedInUser);
      await ensureUserProfileDocument(signedInUser);
      void flushQueuedBenchSync(signedInUser.uid).catch(() => {});
      const idToken = await signedInUser.getIdToken();
      return idToken;
    } catch (err: unknown) {
      setAuthError(formatFirebaseAuthError(err));
      return null;
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    setWorkspaceToken(null);
    if (!firebaseAuth) {
      setUser(null);
      return;
    }
    try {
      await signOut(firebaseAuth);
      setUser(null);
    } catch (err: unknown) {
      setAuthError(formatFirebaseAuthError(err));
    }
  }, []);

  const invalidateWorkspaceToken = useCallback(() => {
    setWorkspaceToken(null);
  }, []);

  const retryCloudSync = useCallback(async () => {
    if (!user?.uid) return;
    await flushQueuedBenchSync(user.uid, true);
  }, [user?.uid]);

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        isSigningIn,
        authError,
        workspaceToken,
        needsWorkspaceAuth: false,
        syncStatus,
        signInWithGoogle,
        signOutUser,
        invalidateWorkspaceToken,
        retryCloudSync,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
