/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { Auth } from 'firebase-admin/auth';
import { resolveFirebaseProjectId } from '../server/services/firebaseAuthMiddleware';

let cachedAdminAuth: Auth | null = null;

/**
 * Lazily loads `firebase-admin` on demand instead of at module boot.
 * Prevents `jwks-rsa -> require('jose')` ERR_REQUIRE_ESM crashes on Node 20
 * serverless cold starts for routes that do not require Firebase Admin.
 */
export async function getAdminAuth(): Promise<Auth> {
  if (cachedAdminAuth) return cachedAdminAuth;

  const [{ getApp, getApps, initializeApp }, { getAuth }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/auth'),
  ]);

  const resolvedProjectId =
    resolveFirebaseProjectId() || process.env.GOOGLE_CLOUD_PROJECT || undefined;

  const adminApp = getApps().length
    ? getApp()
    : initializeApp(resolvedProjectId ? { projectId: resolvedProjectId } : undefined);

  cachedAdminAuth = getAuth(adminApp);
  return cachedAdminAuth;
}
