/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  db,
  firebaseAuth,
  googleAuthProvider,
  isFirebaseConfigured,
  resolvedFirebaseConfig,
} from '../lib/firebase';
import {
  cancelScheduledBenchSyncRetries,
  CloudSyncStatusSnapshot,
  flushQueuedBenchSync,
  getSyncStatusSnapshot,
  handleFirestoreError,
  OperationType,
  promoteLocalWorkstationFaultSequencesToUser,
  subscribeSyncStatus,
} from '../services/benchStorageService';

import {
  clearCachedWorkspaceAccessToken,
  getCachedWorkspaceAccessToken,
  signInForGoogleWorkspace,
} from '../services/googleWorkspaceAuth';

export interface AuthErrorDetails {
  code: string;
  message: string;
  hostname?: string;
  consoleAuthorizedDomainsUrl?: string | null;
}

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  isSigningIn: boolean;
  authError: string | null;
  authErrorDetails: AuthErrorDetails | null;
  clearAuthError: () => void;
  workspaceToken: string | null;
  needsWorkspaceAuth: boolean;
  syncStatus: CloudSyncStatusSnapshot;
  signInWithGoogle: () => Promise<string | null>;
  connectGoogleWorkspace: (forceConsent?: boolean) => Promise<string | null>;
  signOutUser: () => Promise<void>;
  invalidateWorkspaceToken: () => void;
  retryCloudSync: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  authReady: true,
  isSigningIn: false,
  authError: null,
  authErrorDetails: null,
  clearAuthError: () => {},
  workspaceToken: null,
  needsWorkspaceAuth: true,
  syncStatus: getSyncStatusSnapshot(),
  signInWithGoogle: async () => null,
  connectGoogleWorkspace: async () => null,
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
      const updatePayload: Record<string, unknown> = {
        email: cleanEmail,
        updatedAt: serverTimestamp(),
      };
      if (cleanDisplayName !== undefined) {
        updatePayload.displayName = cleanDisplayName;
      }
      await updateDoc(profileRef, updatePayload);
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

const SAFE_FIREBASE_PROJECT_ID_REGEX = /^[a-z0-9-]+$/;

export function buildFirebaseAuthorizedDomainsConsoleUrl(
  projectIdOverride?: string
): string | null {
  const candidate = (projectIdOverride ?? resolvedFirebaseConfig.projectId ?? '').trim();
  if (!candidate || !SAFE_FIREBASE_PROJECT_ID_REGEX.test(candidate)) {
    return null;
  }
  return `https://console.firebase.google.com/project/${candidate}/authentication/settings`;
}

export function formatFirebaseAuthErrorDetails(
  err: unknown,
  hostnameOverride?: string,
  projectIdOverride?: string
): AuthErrorDetails {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const hostname =
    hostnameOverride ||
    (typeof window !== 'undefined' && window.location?.hostname
      ? window.location.hostname
      : 'this host');

  if (code === 'auth/popup-closed-by-user') {
    return {
      code,
      message: 'Google Sign-In popup was closed before completing authentication.',
    };
  }
  if (code === 'auth/cancelled-popup-request') {
    return {
      code,
      message: 'A newer Google Sign-In popup superseded the previous request. Please try again.',
    };
  }
  if (code === 'auth/popup-blocked') {
    return {
      code,
      message: 'Browser blocked the Google Sign-In popup. Allow popups for this site and try again.',
    };
  }
  if (code === 'auth/network-request-failed') {
    return {
      code,
      message: 'Network unavailable for Google Sign-In. Offline IndexedDB bench mode remains active.',
    };
  }
  if (code === 'auth/unauthorized-domain') {
    return {
      code,
      hostname,
      consoleAuthorizedDomainsUrl: buildFirebaseAuthorizedDomainsConsoleUrl(projectIdOverride),
      message: `Domain "${hostname}" is not yet authorized in Firebase Authentication. Add it under Firebase Console → Authentication → Settings → Authorized domains.`,
    };
  }
  if (code === 'auth/operation-not-allowed') {
    return {
      code,
      message: 'Google Sign-In provider is not enabled in Firebase Authentication for this project.',
    };
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return {
      code,
      message: 'An account already exists with this email under a different sign-in provider.',
    };
  }
  if (code === 'auth/invalid-api-key' || code === 'auth/app-not-authorized') {
    return {
      code,
      message: 'Firebase client API key or OAuth origin was rejected. Verify firebase-applet-config.json and authorized origins.',
    };
  }
  return {
    code: code || 'auth/unknown',
    message: err instanceof Error ? err.message : 'Google Sign-In failed.',
  };
}

export function formatFirebaseAuthError(err: unknown, hostnameOverride?: string): string {
  return formatFirebaseAuthErrorDetails(err, hostnameOverride).message;
}

/**
 * Firebase Authentication, Firestore Cloud Sync & In-Memory Google Workspace OAuth Context.
 * Supports Google Sign-In alongside Trial PIN / Master Admin PIN modes.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(() => !firebaseAuth);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authErrorDetails, setAuthErrorDetails] = useState<AuthErrorDetails | null>(null);
  const [workspaceToken, setWorkspaceToken] = useState<string | null>(() =>
    getCachedWorkspaceAccessToken()
  );
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatusSnapshot>(() => getSyncStatusSnapshot());

  useEffect(() => {
    const unsubSync = subscribeSyncStatus(setSyncStatus);
    return () => unsubSync();
  }, []);

  const syncSignedInUserBench = useCallback(async (signedInUser: User): Promise<void> => {
    if (!signedInUser.emailVerified) {
      const msg =
        'Signed in, but this Google account email is not verified. Firestore cloud sync requires a verified email; local IndexedDB storage remains active.';
      setAuthError(msg);
      setAuthErrorDetails({ code: 'auth/email-not-verified', message: msg });
      return;
    }
    setAuthError(null);
    setAuthErrorDetails(null);
    await ensureUserProfileDocument(signedInUser);
    await promoteLocalWorkstationFaultSequencesToUser(signedInUser.uid).catch(() => 0);
    await flushQueuedBenchSync(signedInUser.uid).catch(() => {});
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
        void syncSignedInUserBench(nextUser);
      } else {
        clearCachedWorkspaceAccessToken();
        setWorkspaceToken(null);
      }
    });

    return () => unsubscribe();
  }, [syncSignedInUserBench]);

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
      const msg =
        'Cloud sign-in is not configured in this environment. Offline local bench mode is active.';
      setAuthError(msg);
      setAuthErrorDetails({ code: 'auth/not-configured', message: msg });
      return null;
    }
    setIsSigningIn(true);
    setAuthError(null);
    setAuthErrorDetails(null);
    try {
      const credential = await signInWithPopup(firebaseAuth, googleAuthProvider);
      const signedInUser = credential.user;
      setUser(signedInUser);
      await syncSignedInUserBench(signedInUser);
      const idToken = await signedInUser.getIdToken();
      return idToken;
    } catch (err: unknown) {
      const details = formatFirebaseAuthErrorDetails(err);
      setAuthError(details.message);
      setAuthErrorDetails(details);
      return null;
    } finally {
      setIsSigningIn(false);
    }
  }, [syncSignedInUserBench]);

  const connectGoogleWorkspace = useCallback(
    async (forceConsent = false): Promise<string | null> => {
      if (!isFirebaseConfigured || !firebaseAuth) {
        const msg =
          'Google Workspace OAuth is not configured in this environment. Offline local exports remain active.';
        setAuthError(msg);
        setAuthErrorDetails({ code: 'auth/not-configured', message: msg });
        return null;
      }
      setIsSigningIn(true);
      setAuthError(null);
      setAuthErrorDetails(null);
      try {
        const result = await signInForGoogleWorkspace(forceConsent);
        setUser(result.user);
        setWorkspaceToken(result.accessToken);
        await syncSignedInUserBench(result.user);
        if (!result.accessToken) {
          const msg =
            'Signed in with Google, but no Workspace OAuth access token was returned. Please retry and approve Workspace permissions.';
          setAuthError(msg);
          setAuthErrorDetails({ code: 'auth/missing-workspace-token', message: msg });
        }
        return result.accessToken;
      } catch (err: unknown) {
        const details = formatFirebaseAuthErrorDetails(err);
        setAuthError(details.message);
        setAuthErrorDetails(details);
        return null;
      } finally {
        setIsSigningIn(false);
      }
    },
    [syncSignedInUserBench]
  );

  const signOutUser = useCallback(async () => {
    cancelScheduledBenchSyncRetries(user?.uid);
    setAuthError(null);
    setAuthErrorDetails(null);
    clearCachedWorkspaceAccessToken();
    setWorkspaceToken(null);
    if (!firebaseAuth) {
      setUser(null);
      return;
    }
    try {
      await signOut(firebaseAuth);
      setUser(null);
    } catch (err: unknown) {
      const details = formatFirebaseAuthErrorDetails(err);
      setAuthError(details.message);
      setAuthErrorDetails(details);
    }
  }, [user?.uid]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
    setAuthErrorDetails(null);
  }, []);

  const invalidateWorkspaceToken = useCallback(() => {
    clearCachedWorkspaceAccessToken();
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
        authErrorDetails,
        clearAuthError,
        workspaceToken,
        needsWorkspaceAuth: !workspaceToken,
        syncStatus,
        signInWithGoogle,
        connectGoogleWorkspace,
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
