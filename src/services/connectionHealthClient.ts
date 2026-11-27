/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { User } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import type { AuthErrorDetails } from '../context/AuthContext';
import {
  db,
  type FirebaseTargetSummary,
  getFirebaseTargetSummary,
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
  quotaExceeded?: boolean;
  latencyMs: number;
  detail: string;
}

export interface FirebaseFixGuideItem {
  id: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  title: string;
  description: string;
  actionKind?: 'COPY_HOSTNAME' | 'OPEN_AUTH_DOMAINS' | 'OPEN_QUOTA_UPGRADE' | 'SIGN_IN' | 'REPING';
  actionLabel?: string;
  actionUrl?: string | null;
}

export interface FullConnectionHealthSnapshot {
  overall: OverallHealthTone;
  checkedAtIso: string;
  firebaseTarget?: FirebaseTargetSummary;
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
 * Generates contextual, actionable Firebase remediation steps based on live diagnostic telemetry
 * and the latest Firebase Auth error state.
 */
export function buildFirebaseFixGuideItems(
  snapshot: FullConnectionHealthSnapshot | null,
  authErrorDetails?: AuthErrorDetails | null
): FirebaseFixGuideItem[] {
  const items: FirebaseFixGuideItem[] = [];
  const target = snapshot?.firebaseTarget ?? getFirebaseTargetSummary();

  if (authErrorDetails?.code === 'auth/unauthorized-domain') {
    const host = authErrorDetails.hostname || target.currentHostname;
    items.push({
      id: 'unauthorized-domain',
      severity: 'ERROR',
      title: `Authorize domain "${host}" in Firebase Auth`,
      description: `Add "${host}" under Firebase Console → Authentication → Settings → Authorized domains for project ${target.projectId || 'your project'}.`,
      actionKind: 'OPEN_AUTH_DOMAINS',
      actionLabel: 'Open Authorized Domains',
      actionUrl: authErrorDetails.consoleAuthorizedDomainsUrl || target.consoleAuthorizedDomainsUrl,
    });
  } else if (
    authErrorDetails?.code === 'auth/email-not-verified' ||
    (snapshot?.firebaseAuth.signedIn && !snapshot.firebaseAuth.emailVerified)
  ) {
    items.push({
      id: 'email-not-verified',
      severity: 'WARNING',
      title: 'Verified email required by Firestore rules',
      description:
        'Cloud Firestore security rules require a verified email session. Verify your account email or sign in with a verified Google account to unlock cloud sync.',
      actionKind: 'SIGN_IN',
      actionLabel: 'Sign In with Verified Account',
    });
  } else if (authErrorDetails?.code === 'auth/popup-blocked') {
    items.push({
      id: 'popup-blocked',
      severity: 'WARNING',
      title: 'Allow Google Sign-In popups in browser',
      description:
        'Your browser blocked the authentication popup window. Enable popups for this preview host and retry Google Sign-In.',
      actionKind: 'SIGN_IN',
      actionLabel: 'Retry Google Sign-In',
    });
  } else if (authErrorDetails?.code && authErrorDetails.code !== 'auth/popup-closed-by-user') {
    items.push({
      id: `auth-error-${authErrorDetails.code}`,
      severity: 'ERROR',
      title: `Firebase Auth error (${authErrorDetails.code})`,
      description: authErrorDetails.message,
      actionKind: 'REPING',
      actionLabel: 'Re-Run Diagnostics',
    });
  }

  if (snapshot?.firestore.quotaExceeded) {
    items.push({
      id: 'firestore-quota-exceeded',
      severity: 'ERROR',
      title: 'Firestore free-tier daily quota reached',
      description:
        'Free daily read units were exceeded on this Spark database. Quota resets the next day, or you can upgrade the project plan in Firebase Console.',
      actionKind: 'OPEN_QUOTA_UPGRADE',
      actionLabel: 'View Quota & Upgrade',
      actionUrl: target.consoleQuotaUpgradeUrl,
    });
  } else if (snapshot?.firestore.status === 'OFFLINE') {
    items.push({
      id: 'firestore-offline',
      severity: 'WARNING',
      title: 'Firestore client offline — local IndexedDB active',
      description: `Check network connectivity and confirm custom database "${target.firestoreDatabaseId}" is reachable in project "${target.projectId}". Local bench saves remain protected.`,
      actionKind: 'REPING',
      actionLabel: 'Retry Server Read',
    });
  } else if (snapshot?.firestore.status === 'UNREACHABLE') {
    items.push({
      id: 'firestore-unreachable',
      severity: 'ERROR',
      title: 'Custom Firestore database unreachable',
      description:
        snapshot.firestore.detail ||
        `Unable to reach database "${target.firestoreDatabaseId}". Confirm security rules are deployed and network egress is available.`,
      actionKind: 'REPING',
      actionLabel: 'Re-Ping Firestore',
    });
  }

  if (snapshot && !snapshot.firebaseAuth.signedIn && snapshot.firebaseAuth.configured && items.length === 0) {
    items.push({
      id: 'guest-local-ready',
      severity: 'INFO',
      title: 'Guest local mode active (zero cloud errors)',
      description: `Custom database "${target.firestoreDatabaseId}" is reachable. Sign in with Google to enable cloud-synced bench sessions and server-verified PostgreSQL pings.`,
      actionKind: 'SIGN_IN',
      actionLabel: 'Sign In with Google',
    });
  }

  return items;
}

/**
 * Runs a single on-demand diagnostic pass verifying:
 * 1. Firebase Auth client state + in-memory ID token retrieval (never stored in browser storage)
 * 2. Cloud Firestore live server ping/read against the explicit custom database ID
 * 3. Backend Cloud SQL PostgreSQL ping + RS256 Firebase ID token verification (only when a token is active)
 */
export async function runConnectionHealthDiagnostics(params: {
  user: User | null;
  authReady: boolean;
}): Promise<FullConnectionHealthSnapshot> {
  const { user, authReady } = params;
  const checkedAtIso = new Date().toISOString();
  const firebaseTarget = getFirebaseTargetSummary();

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

  // 2. Run Cloud Firestore live server ping/read check against the provisioned custom database
  const fsStart = performance.now();
  let firestoreReport: FirestorePingHealthReport;
  if (!isFirebaseConfigured || !db) {
    firestoreReport = {
      configured: false,
      databaseId: resolvedFirebaseConfig.firestoreDatabaseId || '(default)',
      status: 'NOT_CONFIGURED',
      profileReadVerified: false,
      quotaExceeded: false,
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
        databaseId: connCheck.databaseId || resolvedFirebaseConfig.firestoreDatabaseId || '(default)',
        status: 'CONNECTED',
        profileReadVerified,
        quotaExceeded: false,
        latencyMs: fsLatency,
        detail: profileReadVerified
          ? `Custom database read verified (${fsLatency}ms) including authenticated profile read.`
          : `Custom database reachable (${fsLatency}ms). Sign in with Google to verify authenticated profile read.`,
      };
    } else if (connCheck.quotaExceeded) {
      firestoreReport = {
        configured: true,
        databaseId: connCheck.databaseId || resolvedFirebaseConfig.firestoreDatabaseId || '(default)',
        status: 'UNREACHABLE',
        profileReadVerified: false,
        quotaExceeded: true,
        latencyMs: fsLatency,
        detail:
          connCheck.errorMessage ||
          'Firestore daily free-tier read quota exceeded. Quota resets tomorrow.',
      };
    } else if (connCheck.offline) {
      firestoreReport = {
        configured: true,
        databaseId: connCheck.databaseId || resolvedFirebaseConfig.firestoreDatabaseId || '(default)',
        status: 'OFFLINE',
        profileReadVerified: false,
        quotaExceeded: false,
        latencyMs: fsLatency,
        detail: 'Firestore client reported offline — local IndexedDB fallback is active.',
      };
    } else {
      firestoreReport = {
        configured: true,
        databaseId: connCheck.databaseId || resolvedFirebaseConfig.firestoreDatabaseId || '(default)',
        status: 'UNREACHABLE',
        profileReadVerified: false,
        quotaExceeded: false,
        latencyMs: fsLatency,
        detail: connCheck.errorMessage || 'Unable to reach Cloud Firestore server.',
      };
    }
  }

  // 3. Call authenticated backend endpoint only when a Firebase ID token or Trial/Admin token exists
  let pgReport: PostgresPingHealthReport;
  let serverTokenVerified = false;
  let serverAuthKind: FirebaseAuthHealthReport['serverAuthKind'] = 'UNVERIFIED';

  try {
    const headers = await buildUnifiedApiHeaders({ Accept: 'application/json' });
    if (firebaseIdToken) {
      headers['X-Firebase-Id-Token'] = firebaseIdToken;
    }

    if (!headers.Authorization && !firebaseIdToken) {
      // Avoid noisy 401 console errors in unauthenticated guest mode
      pgReport = {
        configured: false,
        status: 'AUTH_REQUIRED',
        latencyMs: 0,
        probeMethod: 'NONE',
        detail:
          'Sign in with Google or unlock an active Trial/Admin PIN to execute the server-side PostgreSQL ping.',
      };
    } else {
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
          ? 'Firebase Auth ready (signed out — local IndexedDB bench mode active).'
          : tokenErrorDetail
            ? `Signed in locally, but token fetch failed: ${tokenErrorDetail}`
            : !user.emailVerified
              ? 'Signed in, but email verification is required by Firestore rules.'
              : serverTokenVerified
                ? 'Google Sign-In active and RS256 Firebase ID token verified on server.'
                : 'Google Sign-In active on client.',
  };

  return {
    overall: deriveOverallHealthTone(firebaseAuthReport, pgReport, firestoreReport),
    checkedAtIso,
    firebaseTarget,
    firebaseAuth: firebaseAuthReport,
    cloudSqlPostgres: pgReport,
    firestore: firestoreReport,
  };
}
