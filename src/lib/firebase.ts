/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  type Auth,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  type Firestore,
} from 'firebase/firestore';

import firebaseAppletConfig from '../../firebase-applet-config.json';

interface FirebaseAppletConfigShape {
  projectId?: string;
  appId?: string;
  apiKey?: string;
  authDomain?: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

export interface FirebaseAuthProviderInfo {
  providerId?: string | null;
  email?: string | null;
}

export interface FirebaseCurrentUserSnapshot {
  uid?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
  isAnonymous?: boolean | null;
  tenantId?: string | null;
  providerData?: FirebaseAuthProviderInfo[];
}

export interface FirebaseAuthHandle {
  currentUser: FirebaseCurrentUserSnapshot | null;
}

const clientEnv: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && (import.meta as unknown as Record<string, unknown>).env
    ? ((import.meta as unknown as Record<string, unknown>).env as Record<string, string | undefined>)
    : {};

const FIRESTORE_DATABASE_ID_REGEX = /^[a-z][a-z0-9-]{2,62}$/;

export function sanitizeFirestoreDatabaseId(raw: string | undefined | null): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed || trimmed === '(default)') return '(default)';
  if (FIRESTORE_DATABASE_ID_REGEX.test(trimmed)) return trimmed;
  return '(default)';
}

export function resolveFirebaseClientConfig(
  fileCfg: FirebaseAppletConfigShape,
  env: Record<string, string | undefined>
) {
  const hasProvisionedFileConfig = Boolean(fileCfg.projectId && fileCfg.apiKey);
  if (hasProvisionedFileConfig) {
    return {
      projectId: fileCfg.projectId || '',
      appId: fileCfg.appId || '',
      apiKey: fileCfg.apiKey || '',
      authDomain: fileCfg.authDomain || '',
      firestoreDatabaseId: sanitizeFirestoreDatabaseId(fileCfg.firestoreDatabaseId),
      storageBucket: fileCfg.storageBucket || '',
      messagingSenderId: fileCfg.messagingSenderId || '',
    };
  }

  return {
    projectId: env.VITE_FIREBASE_PROJECT_ID || fileCfg.projectId || '',
    appId: env.VITE_FIREBASE_APP_ID || fileCfg.appId || '',
    apiKey: env.VITE_FIREBASE_API_KEY || fileCfg.apiKey || '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || fileCfg.authDomain || '',
    firestoreDatabaseId: sanitizeFirestoreDatabaseId(
      env.VITE_FIREBASE_DATABASE_ID || fileCfg.firestoreDatabaseId
    ),
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || fileCfg.storageBucket || '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || fileCfg.messagingSenderId || '',
  };
}

const fileConfig: FirebaseAppletConfigShape =
  (firebaseAppletConfig as FirebaseAppletConfigShape) ?? {};

export const resolvedFirebaseConfig = resolveFirebaseClientConfig(fileConfig, clientEnv);

export const isFirebaseConfigured = Boolean(
  resolvedFirebaseConfig.apiKey && resolvedFirebaseConfig.projectId
);

let app: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;

if (isFirebaseConfigured && typeof window !== 'undefined') {
  app = getApps().length ? getApps()[0] : initializeApp(resolvedFirebaseConfig);
  try {
    authInstance = getAuth(app);
  } catch {
    authInstance = null;
  }
  try {
    firestoreInstance = initializeFirestore(
      app,
      { experimentalForceLongPolling: true },
      resolvedFirebaseConfig.firestoreDatabaseId
    );
  } catch {
    firestoreInstance = getFirestore(app, resolvedFirebaseConfig.firestoreDatabaseId);
  }
}

export const db = firestoreInstance as Firestore;

/**
 * Live Firebase Auth instance when running in a configured browser environment.
 */
export const firebaseAuth: Auth | null = authInstance;

export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Typed auth snapshot handle (backed by live Firebase Auth when available,
 * with a safe null-user fallback for headless tests).
 */
export const auth: Auth | FirebaseAuthHandle = authInstance ?? { currentUser: null };

export interface FirestoreConnectionCheckResult {
  reachable: boolean;
  offline: boolean;
  permissionDenied: boolean;
  errorMessage?: string;
}

export async function validateFirestoreConnection(): Promise<FirestoreConnectionCheckResult> {
  if (!isFirebaseConfigured || !firestoreInstance) {
    return {
      reachable: false,
      offline: false,
      permissionDenied: false,
      errorMessage: 'Firebase is not configured for this environment.',
    };
  }
  try {
    await getDocFromServer(doc(firestoreInstance, 'test', 'connection'));
    return {
      reachable: true,
      offline: false,
      permissionDenied: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : '';
    if (message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return {
        reachable: false,
        offline: true,
        permissionDenied: false,
        errorMessage: message,
      };
    }
    if (
      code === 'permission-denied' ||
      message.includes('Missing or insufficient permissions') ||
      message.includes('permission-denied')
    ) {
      // Expected against default-deny /test/connection rule: proves Firestore server is reachable
      return {
        reachable: true,
        offline: false,
        permissionDenied: true,
      };
    }
    return {
      reachable: false,
      offline: false,
      permissionDenied: false,
      errorMessage: message,
    };
  }
}

if (typeof window !== 'undefined' && isFirebaseConfigured && firestoreInstance) {
  void validateFirestoreConnection();
}
