import { isTransientOfflineError } from '../services/offlineSyncQueue';

export interface CloudSyncErrorFormatOptions {
  /**
   * True when running in strict PIN-only local IndexedDB workstation mode
   * (no interactive Firebase Auth user session). In this mode, cloud-only
   * permission/auth rejections are expected and must not block local IndexedDB state.
   */
  isPinOnlyLocalMode?: boolean;
  /**
   * Optional override for testing offline browser detection without mutating global navigator.
   */
  isOffline?: boolean;
}

interface ParsedFirestoreErrorPayload {
  error?: string;
  operationType?: string;
  path?: string | null;
  authInfo?: {
    userId?: string | null;
  };
}

function extractFirestoreErrorMessage(raw: string): {
  message: string;
  path: string | null;
  hasAuthenticatedUser: boolean | null;
} {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as ParsedFirestoreErrorPayload;
      if (typeof parsed?.error === 'string' && parsed.error.trim().length > 0) {
        const hasAuthenticatedUser =
          parsed.authInfo && 'userId' in parsed.authInfo
            ? Boolean(parsed.authInfo.userId)
            : null;
        return {
          message: parsed.error.trim(),
          path: typeof parsed.path === 'string' && parsed.path.trim() ? parsed.path.trim() : null,
          hasAuthenticatedUser,
        };
      }
    } catch {
      // Fall back to raw message string
    }
  }
  return { message: trimmed, path: null, hasAuthenticatedUser: null };
}

function isCloudAuthOrPermissionMessage(lowerMsg: string): boolean {
  return (
    lowerMsg.includes('permission-denied') ||
    lowerMsg.includes('missing or insufficient permissions') ||
    lowerMsg.includes('unauthenticated') ||
    lowerMsg.includes('please check your firebase configuration')
  );
}

/**
 * Returns true when an error originates from offline network conditions or
 * expected unauthenticated cloud-Firestore rejections while operating in
 * PIN-only local IndexedDB workstation mode.
 */
export function isSuppressedOfflineOrPinOnlyCloudError(
  err: unknown,
  options: CloudSyncErrorFormatOptions = {}
): boolean {
  if (options.isOffline === true) {
    return true;
  }
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (!raw.trim()) {
    return true;
  }

  const extracted = extractFirestoreErrorMessage(raw);
  const lowerCombined = `${raw}\n${extracted.message}`.toLowerCase();

  if (
    lowerCombined.includes('firestore_offline_suppressed') ||
    lowerCombined.includes('the client is offline') ||
    isTransientOfflineError(err) ||
    isTransientOfflineError(extracted.message)
  ) {
    return true;
  }

  const isPinOnlyMode = options.isPinOnlyLocalMode ?? true;
  if (isPinOnlyMode && isCloudAuthOrPermissionMessage(lowerCombined)) {
    // Only suppress if there is no authenticated Firebase user (PIN-only local mode)
    if (extracted.hasAuthenticatedUser !== true) {
      return true;
    }
  }

  return false;
}

/**
 * Formats a cloud/local storage sync error for non-blocking UI banners.
 * Returns `null` when the error is an expected offline or PIN-only cloud-sync
 * condition so local IndexedDB state continues uninterrupted without alarming notices.
 */
export function formatCloudSyncError(
  err: unknown,
  options: CloudSyncErrorFormatOptions = {}
): string | null {
  if (isSuppressedOfflineOrPinOnlyCloudError(err, options)) {
    return null;
  }
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const extracted = extractFirestoreErrorMessage(raw);
  if (!extracted.message) {
    return null;
  }
  return extracted.path ? `${extracted.message} (${extracted.path})` : extracted.message;
}
