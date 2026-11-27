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
  const fileProjectId = (fileCfg.projectId || '').trim();
  const fileApiKey = (fileCfg.apiKey || '').trim();
  const hasProvisionedFileConfig = Boolean(fileProjectId && fileApiKey);
  if (hasProvisionedFileConfig) {
    return {
      projectId: fileProjectId,
      appId: (fileCfg.appId || '').trim(),
      apiKey: fileApiKey,
      authDomain: (fileCfg.authDomain || '').trim(),
      firestoreDatabaseId: sanitizeFirestoreDatabaseId(fileCfg.firestoreDatabaseId),
      storageBucket: (fileCfg.storageBucket || '').trim(),
      messagingSenderId: (fileCfg.messagingSenderId || '').trim(),
    };
  }

  return {
    projectId: (env.VITE_FIREBASE_PROJECT_ID || '').trim() || fileProjectId || '',
    appId: (env.VITE_FIREBASE_APP_ID || '').trim() || (fileCfg.appId || '').trim() || '',
    apiKey: (env.VITE_FIREBASE_API_KEY || '').trim() || fileApiKey || '',
    authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN || '').trim() || (fileCfg.authDomain || '').trim() || '',
    firestoreDatabaseId: sanitizeFirestoreDatabaseId(
      env.VITE_FIREBASE_DATABASE_ID || fileCfg.firestoreDatabaseId
    ),
    storageBucket: (env.VITE_FIREBASE_STORAGE_BUCKET || '').trim() || (fileCfg.storageBucket || '').trim() || '',
    messagingSenderId:
      (env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim() ||
      (fileCfg.messagingSenderId || '').trim() ||
      '',
  };
}

function loadFirebaseAppletConfig(): FirebaseAppletConfigShape {
  try {
    const configModules = import.meta.glob<FirebaseAppletConfigShape>(
      '/firebase-applet-config.json',
      { eager: true, import: 'default' }
    );
    const matched = Object.values(configModules)[0];
    if (matched && typeof matched === 'object') {
      return matched;
    }
  } catch {
    // Non-Vite runtime (e.g., Node/tsx test runner): fall through to Node filesystem read
  }

  try {
    const nodeProc = (globalThis as {
      process?: {
        cwd?: () => string;
        getBuiltinModule?: (id: string) => unknown;
      };
    }).process;
    if (
      nodeProc &&
      typeof nodeProc.getBuiltinModule === 'function' &&
      typeof nodeProc.cwd === 'function'
    ) {
      const fsMod = nodeProc.getBuiltinModule('node:fs') as
        | {
            existsSync?: (p: string) => boolean;
            readFileSync?: (p: string, enc: string) => string;
          }
        | undefined;
      const pathMod = nodeProc.getBuiltinModule('node:path') as
        | {
            resolve?: (...paths: string[]) => string;
          }
        | undefined;
      if (fsMod?.existsSync && fsMod.readFileSync && pathMod?.resolve) {
        const configPath = pathMod.resolve(nodeProc.cwd(), 'firebase-applet-config.json');
        if (fsMod.existsSync(configPath)) {
          return JSON.parse(fsMod.readFileSync(configPath, 'utf8')) as FirebaseAppletConfigShape;
        }
      }
    }
  } catch {
    // Ignore filesystem errors and fall back to VITE_FIREBASE_* env vars
  }

  return {};
}

const fileConfig: FirebaseAppletConfigShape = loadFirebaseAppletConfig();

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
