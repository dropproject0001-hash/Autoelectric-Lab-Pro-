/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { resolveFirebaseProjectId } from '../server/services/firebaseAuthMiddleware';

const resolvedProjectId =
  resolveFirebaseProjectId() || process.env.GOOGLE_CLOUD_PROJECT || undefined;

const adminApp = getApps().length
  ? getApp()
  : initializeApp(resolvedProjectId ? { projectId: resolvedProjectId } : undefined);

export const adminAuth = getAuth(adminApp);
