import type { User } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import {
  db,
  isFirebaseConfigured,
  resolvedFirebaseConfig,
  validateFirestoreConnection,
} from '../lib/firebase';
import {
  handleFirestoreError,
  OperationType,
} from './benchStorageService';
import { buildUnifiedApiHeaders } from './trialPinClientService';

export type OverallHealthTone = 'HEALTHY' | 'PARTIAL' | 'DEGRADED' | 'CHECKING';

export interface FirebaseAuthHealthReport {
  configured: boolean;
  authReady: boolean;
  signedIn: boolean;
  emailVerified: boolean;
  email: string | null;
  uidMasked: string | null;
  serverTokenVerified: boolean;
  serverAuthKind: 'FIREBASE_ID_TOKEN' | 'TRIAL_PIN' | 'MASTER_ADMIN_PIN' | 'UNVERIFIED';
  detail: string;
}

export interface PostgresPingHealthReport {
  configured: boolean;
  status: 'CONNECTED' | 'UNREACHABLE' | 'NOT_CONFIGURED' | 'AUTH_REQUIRED';
  latencyMs: number;
  probeMethod: 'UNIX_SOCKET' | 'TCP_PG_WIRE' | 'NONE';
  detail: string;
}

export interface FirestorePingHealthReport {
  configured: boolean;
  databaseId: string;
  status: 'CONNECTED' | 'OFFLINE' | 'UNREACHABLE' | 'NOT_CONFIGURED';
  profileReadVerified: boolean;
  latencyMs: number;
  detail: string;
}

export interface FullConnectionHealthSnapshot {
  overall: OverallHealthTone;
  checkedAtIso: string;
  firebaseAuth: FirebaseAuthHealthReport;
  cloudSqlPostgres: PostgresPingHealthReport;
  firestore: FirestorePingHealthReport;
}

interface BackendConnectionHealthPayload {
  status: 'HEALTHY' | 'DEGRADED' | 'POSTGRES_UNCONFIGURED';
  checkedAt: string;
  firebaseAuth: {
    serverVerified: boolean;
    authKind: 'FIREBASE_ID_TOKEN' | 'TRIAL_PIN' | 'MASTER_ADMIN_PIN';
    uidMasked: string | null;
    emailVerified: boolean;
  };
  cloudSqlPostgres: {
    configured: boolean;
    status: 'CONNECTED' | 'UNREACHABLE' | 'NOT_CONFIGURED';
    latencyMs: number;
    probeMethod: 'UNIX_SOCKET' | 'TCP_PG_WIRE' | 'NONE';
    detail: string;
  };
}

function maskClientUid(uid: string | null | undefined): string | null {
  if (!uid) return null;
  const trimmed = uid.trim();
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}***`;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function deriveOverallHealthTone(
  authReport: FirebaseAuthHealthReport,
  pgReport: PostgresPingHealthReport,
  fsReport: FirestorePingHealthReport
): OverallHealthTone {
  const activeDbReachable =
    pgReport.status === 'CONNECTED' || fsReport.status === 'CONNECTED';

  if (pgReport.status === 'UNREACHABLE' || fsReport.status === 'OFFLINE' || fsReport.status === 'UNREACHABLE') {
    return 'DEGRADED';
  }
  if (authReport.signedIn && authReport.serverTokenVerified && activeDbReachable) {
    return 'HEALTHY';
  }
  if (activeDbReachable || authReport.configured) {
    return 'PARTIAL';
  }
  return 'DEGRADED';
}

/**
 * Runs a single on-demand diagnostic pass verifying:
 * 1. Firebase Auth client state + in-memory ID token retrieval (never stored in localStorage)
 * 2. Cloud Firestore live server ping/read (getDocFromServer + signed-in user doc check)
 * 3. Backend Cloud SQL PostgreSQL ping + RS256 Firebase ID token verification
 */
export async function runConnectionHealthDiagnostics(params: {
  user: User | null;
  authReady: boolean;
}): Promise<FullConnectionHealthSnapshot> {
  const { user, authReady } = params;
  const checkedAtIso = new Date().toISOString();

  // 1. Acquire live Firebase ID token strictly in memory if user is signed in
  let firebaseIdToken: string | null = null;
  let tokenErrorDetail: string | null = null;
  if (user) {
    try {
      firebaseIdToken = await user.getIdToken();
    } catch (err) {
      tokenErrorDetail =
        err instanceof Error ? err.message : 'Unable to fetch Firebase ID token.';
    }
  }

  // 2. Run Cloud Firestore live server ping/read check
  const fsStart = performance.now();
  let firestoreReport: FirestorePingHealthReport;
  if (!isFirebaseConfigured || !db) {
    firestoreReport = {
      configured: false,
      databaseId: resolvedFirebaseConfig.firestoreDatabaseId || '(default)',
      status: 'NOT_CONFIGURED',
      profileReadVerified: false,
      latencyMs: 0,
      detail: 'Firebase client config is not present in this environment.',
    };
  } else {
    const connCheck = await validateFirestoreConnection();
    let profileReadVerified = false;

    if (connCheck.reachable && user?.uid && user.emailVerified) {
      const profilePath = `users/${user.uid}`;
      try {
        await getDocFromServer(doc(db, 'users', user.uid));
        profileReadVerified = true;
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.GET, profilePath);
        } catch {
          // Keep diagnostic widget resilient without crashing page
        }
      }
    }

    const fsLatency = Math.max(1, Math.round(performance.now() - fsStart));
    if (connCheck.reachable) {
      firestoreReport = {
        configured: true,
        databaseId: resolvedFirebaseConfig.firestoreDatabaseId || '(default)',
        status: 'CONNECTED',
        profileReadVerified,
        latencyMs: fsLatency,
        detail: profileReadVerified
          ? `Firestore server read verified (${fsLatency}ms) including authenticated profile read.`
          : `Firestore server reachable (${fsLatency}ms). Sign in with Google to verify authenticated profile read.`,
      };
    } else if (connCheck.offline) {
      firestoreReport = {
        configured: true,
        databaseId: resolvedFirebaseConfig.firestoreDatabaseId || '(default)',
        status: 'OFFLINE',
        profileReadVerified: false,
        latencyMs: fsLatency,
        detail: 'Firestore client reported offline — local IndexedDB fallback is active.',
      };
    } else {
      firestoreReport = {
        configured: true,
        databaseId: resolvedFirebaseConfig.firestoreDatabaseId || '(default)',
        status: 'UNREACHABLE',
        profileReadVerified: false,
        latencyMs: fsLatency,
        detail: connCheck.errorMessage || 'Unable to reach Cloud Firestore server.',
      };
    }
  }

  // 3. Call authenticated backend endpoint for Cloud SQL PostgreSQL ping + server-side token verification
  let pgReport: PostgresPingHealthReport;
  let serverTokenVerified = false;
  let serverAuthKind: FirebaseAuthHealthReport['serverAuthKind'] = 'UNVERIFIED';

  try {
    const headers = await buildUnifiedApiHeaders({ Accept: 'application/json' });
    if (firebaseIdToken) {
      headers['X-Firebase-Id-Token'] = firebaseIdToken;
    }

    const res = await fetch('/api/autoelectric/diagnostics/connection-health', {
      method: 'GET',
      headers,
    });

    if (res.status === 401 || res.status === 403) {
      pgReport = {
        configured: false,
        status: 'AUTH_REQUIRED',
        latencyMs: 0,
        probeMethod: 'NONE',
        detail:
          'Sign in with Google or unlock an active Trial/Admin PIN to execute the server-side PostgreSQL ping.',
      };
    } else if (!res.ok) {
      pgReport = {
        configured: false,
        status: 'UNREACHABLE',
        latencyMs: 0,
        probeMethod: 'NONE',
        detail: `Diagnostic endpoint returned HTTP ${res.status}.`,
      };
    } else {
      const payload = (await res.json()) as BackendConnectionHealthPayload;
      serverTokenVerified = Boolean(payload.firebaseAuth?.serverVerified);
      serverAuthKind = payload.firebaseAuth?.authKind || 'UNVERIFIED';
      pgReport = {
        configured: Boolean(payload.cloudSqlPostgres?.configured),
        status: payload.cloudSqlPostgres?.status || 'NOT_CONFIGURED',
        latencyMs: Number(payload.cloudSqlPostgres?.latencyMs) || 0,
        probeMethod: payload.cloudSqlPostgres?.probeMethod || 'NONE',
        detail:
          payload.cloudSqlPostgres?.detail ||
          'Cloud SQL PostgreSQL status unavailable.',
      };
    }
  } catch {
    pgReport = {
      configured: false,
      status: 'UNREACHABLE',
      latencyMs: 0,
      probeMethod: 'NONE',
      detail: 'Backend diagnostic endpoint unreachable (offline mode active).',
    };
  }

  const firebaseAuthReport: FirebaseAuthHealthReport = {
    configured: isFirebaseConfigured,
    authReady,
    signedIn: Boolean(user),
    emailVerified: Boolean(user?.emailVerified),
    email: user?.email || null,
    uidMasked: maskClientUid(user?.uid),
    serverTokenVerified,
    serverAuthKind,
    detail: !isFirebaseConfigured
      ? 'Firebase Authentication is not configured in this environment.'
      : !authReady
        ? 'Initializing Firebase Authentication session...'
        : !user
          ? 'Firebase Auth ready (signed out — Trial/Admin PIN or offline mode active).'
          : tokenErrorDetail
            ? `Signed in locally, but token fetch failed: ${tokenErrorDetail}`
            : serverTokenVerified
              ? 'Google Sign-In active and RS256 Firebase ID token verified on server.'
              : 'Google Sign-In active on client.',
  };

  return {
    overall: deriveOverallHealthTone(firebaseAuthReport, pgReport, firestoreReport),
    checkedAtIso,
    firebaseAuth: firebaseAuthReport,
    cloudSqlPostgres: pgReport,
    firestore: firestoreReport,
  };
}
