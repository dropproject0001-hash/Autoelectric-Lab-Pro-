/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import { firebaseAuth, isFirebaseConfigured } from '../lib/firebase';

/**
 * Full deduplicated Google Workspace OAuth scopes provisioned for AutoElectric Lab Pro:
 * Gmail, Google Docs, Google Tasks, Google Drive, Google Picker, Google Classroom, and Google Forms.
 */
export const GOOGLE_WORKSPACE_SCOPES: readonly string[] = [
  // Gmail
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.addons.current.action.compose',
  'https://www.googleapis.com/auth/gmail.addons.current.message.action',
  'https://www.googleapis.com/auth/gmail.addons.current.message.metadata',
  'https://www.googleapis.com/auth/gmail.addons.current.message.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.insert',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.metadata',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
  // Google Docs
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/documents.readonly',
  // Google Tasks
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/tasks.readonly',
  // Google Drive & Google Picker
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.activity',
  'https://www.googleapis.com/auth/drive.activity.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.apps.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.install',
  'https://www.googleapis.com/auth/drive.meet.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.photos.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.scripts',
  // Google Classroom
  'https://www.googleapis.com/auth/classroom.addons.student',
  'https://www.googleapis.com/auth/classroom.addons.teacher',
  'https://www.googleapis.com/auth/classroom.announcements',
  'https://www.googleapis.com/auth/classroom.announcements.readonly',
  'https://www.googleapis.com/auth/classroom.courses',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students',
  'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
  'https://www.googleapis.com/auth/classroom.courseworkmaterials',
  'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
  'https://www.googleapis.com/auth/classroom.guardianlinks.me.readonly',
  'https://www.googleapis.com/auth/classroom.guardianlinks.students',
  'https://www.googleapis.com/auth/classroom.guardianlinks.students.readonly',
  'https://www.googleapis.com/auth/classroom.profile.emails',
  'https://www.googleapis.com/auth/classroom.profile.photos',
  'https://www.googleapis.com/auth/classroom.push-notifications',
  'https://www.googleapis.com/auth/classroom.rosters',
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.students.readonly',
  'https://www.googleapis.com/auth/classroom.topics',
  'https://www.googleapis.com/auth/classroom.topics.readonly',
  // Google Forms
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly',
];

/**
 * Strictly in-memory OAuth access token cache.
 * Never persisted to localStorage or sessionStorage.
 */
let cachedWorkspaceAccessToken: string | null = null;
let authClearListenerAttached = false;

export function getCachedWorkspaceAccessToken(): string | null {
  return cachedWorkspaceAccessToken;
}

export function setCachedWorkspaceAccessToken(token: string | null): void {
  cachedWorkspaceAccessToken = token && token.trim() ? token.trim() : null;
}

export function clearCachedWorkspaceAccessToken(): void {
  cachedWorkspaceAccessToken = null;
}

export function attachWorkspaceTokenSignOutGuard(): void {
  if (authClearListenerAttached || !firebaseAuth) return;
  authClearListenerAttached = true;
  onAuthStateChanged(firebaseAuth, (user) => {
    if (!user) {
      cachedWorkspaceAccessToken = null;
    }
  });
}

export function createWorkspaceGoogleAuthProvider(forceConsent = false): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  for (const scope of GOOGLE_WORKSPACE_SCOPES) {
    provider.addScope(scope);
  }
  provider.setCustomParameters(
    forceConsent
      ? { prompt: 'consent select_account' }
      : { prompt: 'select_account' }
  );
  return provider;
}

export interface WorkspaceSignInResult {
  user: User;
  accessToken: string | null;
  idToken: string;
}

/**
 * Reuse the existing Firebase Auth instance to authenticate the user with Google
 * and request Google Workspace OAuth access (Gmail, Docs, Tasks, Drive, Picker, Classroom).
 */
export async function signInForGoogleWorkspace(
  forceConsent = false
): Promise<WorkspaceSignInResult> {
  if (!isFirebaseConfigured || !firebaseAuth) {
    throw new Error('Firebase Authentication is not configured in this environment.');
  }
  attachWorkspaceTokenSignOutGuard();
  const provider = createWorkspaceGoogleAuthProvider(forceConsent);
  const result = await signInWithPopup(firebaseAuth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken ?? null;
  setCachedWorkspaceAccessToken(accessToken);
  const idToken = await result.user.getIdToken();
  return {
    user: result.user,
    accessToken,
    idToken,
  };
}
