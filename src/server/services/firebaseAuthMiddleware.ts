/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import type { MasterAdminProof } from './adminMasterPinService';
import {
  type PublicTrialPinRecord,
  verifyAdminSessionToken,
  verifyTrialBearerToken,
} from './trialPinService';

const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export interface VerifiedFirebaseUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

export interface AuthenticatedRequest extends Request {
  authUser?: VerifiedFirebaseUser;
  trialAccess?: PublicTrialPinRecord;
  isPinAdmin?: boolean;
  masterAdminProof?: MasterAdminProof;
}

export type AuthFailureCode =
  | 'AUTH_REQUIRED'
  | 'TOKEN_EXPIRED'
  | 'INVALID_TOKEN'
  | 'EMAIL_NOT_VERIFIED'
  | 'AUTH_UNAVAILABLE';

export class FirebaseTokenVerificationError extends Error {
  public readonly statusCode: number;
  public readonly code: AuthFailureCode;

  constructor(message: string, statusCode: number, code: AuthFailureCode) {
    super(message);
    this.name = 'FirebaseTokenVerificationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface JwkKeyRecord {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
}

interface JwksCacheEntry {
  keysByKid: Map<string, JwkKeyRecord>;
  expiresAtMs: number;
  fetchedAtMs: number;
}

let jwksCache: JwksCacheEntry | null = null;
let customJwksFetcher: (() => Promise<{ keys: JwkKeyRecord[]; maxAgeSec: number }>) | null = null;

export function setJwksFetcherForTests(
  fetcher: (() => Promise<{ keys: JwkKeyRecord[]; maxAgeSec: number }>) | null
): void {
  customJwksFetcher = fetcher;
  jwksCache = null;
}

export function resetFirebaseAuthCacheForTests(): void {
  jwksCache = null;
  customJwksFetcher = null;
}

function parseCacheMaxAgeSec(cacheControl: string | null): number {
  if (!cacheControl) return 3600;
  const match = cacheControl.match(/max-age=(\d+)/i);
  if (!match) return 3600;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3600;
}

async function fetchGoogleJwks(): Promise<JwksCacheEntry> {
  const now = Date.now();
  if (customJwksFetcher) {
    const res = await customJwksFetcher();
    const map = new Map<string, JwkKeyRecord>();
    for (const k of res.keys) {
      if (k?.kid) map.set(k.kid, k);
    }
    return {
      keysByKid: map,
      fetchedAtMs: now,
      expiresAtMs: now + Math.max(10, res.maxAgeSec) * 1000,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(FIREBASE_JWKS_URL, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new FirebaseTokenVerificationError(
        `Unable to fetch Firebase verification keys (HTTP ${response.status}).`,
        503,
        'AUTH_UNAVAILABLE'
      );
    }
    const payload = (await response.json()) as { keys?: JwkKeyRecord[] };
    const keys = Array.isArray(payload?.keys) ? payload.keys : [];
    const map = new Map<string, JwkKeyRecord>();
    for (const k of keys) {
      if (k && typeof k.kid === 'string') {
        map.set(k.kid, k);
      }
    }
    const maxAgeSec = parseCacheMaxAgeSec(response.headers.get('cache-control'));
    return {
      keysByKid: map,
      fetchedAtMs: now,
      expiresAtMs: now + maxAgeSec * 1000,
    };
  } catch (err) {
    if (err instanceof FirebaseTokenVerificationError) throw err;
    throw new FirebaseTokenVerificationError(
      'Firebase authentication verification keys temporarily unavailable.',
      503,
      'AUTH_UNAVAILABLE'
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function getJwkForKid(kid: string): Promise<JwkKeyRecord | null> {
  const now = Date.now();
  if (!jwksCache || now >= jwksCache.expiresAtMs) {
    jwksCache = await fetchGoogleJwks();
  }
  let found = jwksCache.keysByKid.get(kid) ?? null;
  // Key rotation check: refresh once if cache is >60s old
  if (!found && now - jwksCache.fetchedAtMs > 60_000) {
    jwksCache = await fetchGoogleJwks();
    found = jwksCache.keysByKid.get(kid) ?? null;
  }
  return found;
}

function decodeBase64UrlToBuffer(segment: string): Buffer {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLen), 'base64');
}

function parseJsonSegment<T>(segment: string): T {
  const raw = decodeBase64UrlToBuffer(segment).toString('utf8');
  return JSON.parse(raw) as T;
}

export interface LocalFirebaseAppletConfig {
  projectId?: string;
  apiKey?: string;
}

function readLocalFirebaseConfig(): LocalFirebaseAppletConfig | null {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) return null;
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw) as LocalFirebaseAppletConfig;
  } catch {
    return null;
  }
}

export function resolveFirebaseProjectId(
  fileCfg: LocalFirebaseAppletConfig | null = readLocalFirebaseConfig(),
  env: Record<string, string | undefined> = process.env
): string {
  const fileProjectId = (fileCfg?.projectId || '').trim();
  const fileApiKey = (fileCfg?.apiKey || '').trim();
  const hasProvisionedFileConfig = Boolean(fileProjectId && fileApiKey);
  if (hasProvisionedFileConfig) {
    return fileProjectId;
  }

  const authDomainRaw = (env.VITE_FIREBASE_AUTH_DOMAIN || '').trim().toLowerCase();
  const derivedFromAuthDomain = authDomainRaw.match(/^([a-z0-9-]+)\.(?:firebaseapp\.com|web\.app)$/)?.[1] || '';

  return (
    (env.FIREBASE_PROJECT_ID || '').trim() ||
    (env.VITE_FIREBASE_PROJECT_ID || '').trim() ||
    fileProjectId ||
    derivedFromAuthDomain ||
    ''
  );
}

export interface FirebaseStartupDiagnosticsResult {
  resolvedProjectId: string;
  warnings: string[];
}

export function logFirebaseAuthStartupDiagnostics(
  fileCfg: LocalFirebaseAppletConfig | null = readLocalFirebaseConfig(),
  env: Record<string, string | undefined> = process.env
): FirebaseStartupDiagnosticsResult {
  const resolvedProjectId = resolveFirebaseProjectId(fileCfg, env);
  const serverEnvProjectId = (env.FIREBASE_PROJECT_ID || '').trim();
  const clientEnvProjectId = (env.VITE_FIREBASE_PROJECT_ID || '').trim();
  const fileProjectId = (fileCfg?.projectId || '').trim();
  const fileApiKey = (fileCfg?.apiKey || '').trim();
  const hasProvisionedFileConfig = Boolean(fileProjectId && fileApiKey);
  const warnings: string[] = [];

  if (serverEnvProjectId && clientEnvProjectId && serverEnvProjectId !== clientEnvProjectId) {
    const msg = `[FirebaseAuth] WARNING: VITE_FIREBASE_PROJECT_ID ("${clientEnvProjectId}") differs from FIREBASE_PROJECT_ID ("${serverEnvProjectId}"). Server will verify Firebase ID tokens against "${resolvedProjectId || '(unset)'}".`;
    warnings.push(msg);
    console.warn(msg);
  }

  if (hasProvisionedFileConfig && serverEnvProjectId && serverEnvProjectId !== fileProjectId) {
    const msg = `[FirebaseAuth] WARNING: FIREBASE_PROJECT_ID ("${serverEnvProjectId}") differs from provisioned firebase-applet-config.json projectId ("${fileProjectId}"). Using provisioned projectId "${resolvedProjectId}".`;
    warnings.push(msg);
    console.warn(msg);
  }

  if (hasProvisionedFileConfig && clientEnvProjectId && clientEnvProjectId !== fileProjectId) {
    const msg = `[FirebaseAuth] WARNING: VITE_FIREBASE_PROJECT_ID ("${clientEnvProjectId}") differs from provisioned firebase-applet-config.json projectId ("${fileProjectId}"). Client and server both use provisioned projectId "${resolvedProjectId}".`;
    warnings.push(msg);
    console.warn(msg);
  }

  if (resolvedProjectId) {
    console.info(
      `[FirebaseAuth] Verifying Firebase ID tokens against project "${resolvedProjectId}".`
    );
  } else {
    const msg =
      '[FirebaseAuth] WARNING: No Firebase project ID configured (firebase-applet-config.json, FIREBASE_PROJECT_ID, or VITE_FIREBASE_PROJECT_ID).';
    warnings.push(msg);
    console.warn(msg);
  }

  return { resolvedProjectId, warnings };
}

export async function verifyFirebaseIdToken(
  token: string,
  expectedProjectId = resolveFirebaseProjectId()
): Promise<VerifiedFirebaseUser> {
  if (!expectedProjectId) {
    throw new FirebaseTokenVerificationError(
      'Firebase authentication is not configured for this environment.',
      503,
      'AUTH_UNAVAILABLE'
    );
  }
  const trimmed = token.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
    throw new FirebaseTokenVerificationError('Malformed authentication token.', 401, 'INVALID_TOKEN');
  }

  const [headerSeg, payloadSeg, sigSeg] = parts;

  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = parseJsonSegment<{ alg?: string; kid?: string }>(headerSeg);
    claims = parseJsonSegment<Record<string, unknown>>(payloadSeg);
  } catch {
    throw new FirebaseTokenVerificationError('Unparseable authentication token.', 401, 'INVALID_TOKEN');
  }

  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw new FirebaseTokenVerificationError('Unsupported token algorithm or key ID.', 401, 'INVALID_TOKEN');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const clockSkewSec = 300;

  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) {
    throw new FirebaseTokenVerificationError('Token missing expiration claim.', 401, 'INVALID_TOKEN');
  }
  if (claims.exp <= nowSec - 30) {
    throw new FirebaseTokenVerificationError(
      'Session token expired. Please refresh or sign in again.',
      401,
      'TOKEN_EXPIRED'
    );
  }

  if (typeof claims.iat !== 'number' || claims.iat > nowSec + clockSkewSec) {
    throw new FirebaseTokenVerificationError('Invalid token issue timestamp.', 401, 'INVALID_TOKEN');
  }
  if (typeof claims.auth_time === 'number' && claims.auth_time > nowSec + clockSkewSec) {
    throw new FirebaseTokenVerificationError('Invalid token auth_time timestamp.', 401, 'INVALID_TOKEN');
  }

  const expectedIssuer = `https://securetoken.google.com/${expectedProjectId}`;
  const isDirectMatch = claims.aud === expectedProjectId && claims.iss === expectedIssuer;
  const allowLegacyFallback = process.env.ALLOW_LEGACY_FIREBASE_PROJECT_ID === 'true';
  const isFallbackMatch =
    allowLegacyFallback &&
    claims.aud === 'valued-zoo-9mvz5' &&
    claims.iss === 'https://securetoken.google.com/valued-zoo-9mvz5';

  if (!isDirectMatch && !isFallbackMatch) {
    const receivedAud =
      typeof claims.aud === 'string' ? claims.aud : JSON.stringify(claims.aud ?? null);
    const receivedIss =
      typeof claims.iss === 'string' ? claims.iss : JSON.stringify(claims.iss ?? null);
    console.warn(
      `[FirebaseAuth] Token audience or issuer mismatch: expectedProjectId="${expectedProjectId}", expectedIssuer="${expectedIssuer}", receivedAud="${receivedAud}", receivedIss="${receivedIss}".`
    );
    throw new FirebaseTokenVerificationError(
      'Token audience or issuer mismatch. Please sign out and sign back in to refresh your authentication session.',
      401,
      'INVALID_TOKEN'
    );
  }

  if (typeof claims.sub !== 'string' || claims.sub.length === 0 || claims.sub.length > 128) {
    throw new FirebaseTokenVerificationError('Token missing valid subject UID.', 401, 'INVALID_TOKEN');
  }

  const jwk = await getJwkForKid(header.kid);
  if (!jwk) {
    throw new FirebaseTokenVerificationError('Token signing key not recognized.', 401, 'INVALID_TOKEN');
  }

  let signatureValid = false;
  try {
    const publicKey = crypto.createPublicKey({
      key: jwk as unknown as crypto.JsonWebKey,
      format: 'jwk',
    });
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerSeg}.${payloadSeg}`);
    verifier.end();
    signatureValid = verifier.verify(publicKey, decodeBase64UrlToBuffer(sigSeg));
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    throw new FirebaseTokenVerificationError('Invalid token cryptographic signature.', 401, 'INVALID_TOKEN');
  }

  return {
    uid: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    emailVerified: claims.email_verified === true,
  };
}

export async function requireFirebaseAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Authentication required. Please sign in with Google to run AI diagnostics.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    res.status(401).json({
      error: 'Authentication required. Please sign in with Google to run AI diagnostics.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  try {
    const user = await verifyFirebaseIdToken(idToken);
    if (!user.emailVerified) {
      res.status(403).json({
        error: 'Verified Google email required to access protected diagnostic endpoints.',
        code: 'EMAIL_NOT_VERIFIED',
      });
      return;
    }
    req.authUser = user;
    next();
  } catch (err) {
    if (err instanceof FirebaseTokenVerificationError) {
      res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
      });
      return;
    }
    res.status(401).json({
      error: 'Authentication verification failed.',
      code: 'INVALID_TOKEN',
    });
  }
}

export interface VerifiedAccessResult {
  valid: boolean;
  statusCode?: number;
  code?: string;
  error?: string;
  authUser?: VerifiedFirebaseUser;
  trialAccess?: PublicTrialPinRecord;
  isPinAdmin?: boolean;
}

/**
 * Verifies any accepted workstation credential:
 * 1) Active 8-digit Trial PIN bearer token (vecl_trial_v1.*)
 * 2) Master Admin PIN session token (vecl_admin_v1.*)
 * 3) Verified Firebase Auth ID token (Google Sign-In)
 */
export async function verifyAnyAccessBearerToken(
  rawToken: string,
  deviceId = ''
): Promise<VerifiedAccessResult> {
  const token = rawToken.trim();
  if (!token) {
    return {
      valid: false,
      statusCode: 401,
      code: 'AUTH_REQUIRED',
      error: 'Authentication required. Sign in with Google or enter an active Trial/Admin PIN.',
    };
  }

  if (token.startsWith('vecl_trial_v1.')) {
    const check = verifyTrialBearerToken(token, deviceId.trim());
    if (!check.valid || !check.publicRecord) {
      return {
        valid: false,
        statusCode: check.statusCode || 401,
        code: check.code || 'INVALID_TOKEN',
        error: check.error || 'Trial PIN session invalid.',
      };
    }
    return {
      valid: true,
      authUser: {
        uid: `trial:${check.publicRecord.trialId}`,
        email: null,
        emailVerified: true,
      },
      trialAccess: check.publicRecord,
    };
  }

  if (token.startsWith('vecl_admin_v1.')) {
    const adminCheck = verifyAdminSessionToken(token);
    if (!adminCheck.valid) {
      return {
        valid: false,
        statusCode: 401,
        code: adminCheck.code || 'INVALID_TOKEN',
        error: adminCheck.error || 'Admin session token invalid.',
      };
    }
    return {
      valid: true,
      authUser: {
        uid: 'pin-admin:master',
        email: null,
        emailVerified: true,
      },
      isPinAdmin: true,
    };
  }

  // Fallback: verify RS256 Firebase ID token (Google Sign-In)
  try {
    const user = await verifyFirebaseIdToken(token);
    if (!user.emailVerified) {
      return {
        valid: false,
        statusCode: 403,
        code: 'EMAIL_NOT_VERIFIED',
        error: 'A verified Google account email is required to access protected diagnostic endpoints.',
      };
    }
    return {
      valid: true,
      authUser: user,
    };
  } catch (err: unknown) {
    if (err instanceof FirebaseTokenVerificationError) {
      return {
        valid: false,
        statusCode: err.statusCode,
        code: err.code,
        error: err.message,
      };
    }
    return {
      valid: false,
      statusCode: 401,
      code: 'INVALID_TOKEN',
      error: 'Authentication token is invalid or expired. Sign in with Google or enter an active Trial PIN.',
    };
  }
}

export async function requireAuthOrTrialSession(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Authentication required. Sign in with Google or enter an active 8-digit Trial PIN to run AI diagnostics.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const deviceIdHeader =
    typeof req.headers['x-vecl-device-id'] === 'string'
      ? req.headers['x-vecl-device-id'].trim()
      : '';

  const verified = await verifyAnyAccessBearerToken(token, deviceIdHeader);
  if (!verified.valid || !verified.authUser) {
    res.status(verified.statusCode || 401).json({
      error: verified.error || 'Authentication required.',
      code: verified.code || 'INVALID_TOKEN',
    });
    return;
  }

  req.authUser = verified.authUser;
  if (verified.trialAccess) {
    req.trialAccess = verified.trialAccess;
  }
  if (verified.isPinAdmin) {
    req.isPinAdmin = true;
  }
  next();
}
