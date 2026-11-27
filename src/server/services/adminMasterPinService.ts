/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import crypto from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from './firebaseAuthMiddleware';
import { isStrictProductionSecrets } from './secretsPolicy';

export const MASTER_ADMIN_ACTOR_UID = 'master-pin-admin:env';

const MIN_ENV_ADMIN_PIN_LENGTH_STRICT = 10;
const MIN_ENV_ADMIN_PIN_LENGTH_DEV = 4;
const MAX_INCOMING_PIN_LENGTH = 128;

const IP_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const IP_FAILURE_MAX_ATTEMPTS = 8;
const GLOBAL_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_FAILURE_MAX_ATTEMPTS = 40;

const PROCESS_FINGERPRINT_KEY = crypto.randomBytes(32);
const PROOF_BRAND = Symbol('vecl:master-admin-env-proof');

interface HashedEnvAdminPinRecord {
  envFingerprintHmac: string;
  salt: string;
  rawScryptHash: Buffer;
  normalizedNumericScryptHash: Buffer | null;
  envPinLength: number;
  hashedAtMs: number;
}

export interface MasterAdminProof {
  readonly [PROOF_BRAND]: true;
  readonly adminUid: typeof MASTER_ADMIN_ACTOR_UID;
  readonly verifiedAtMs: number;
}

export type MasterAdminPinFailureCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_MASTER_PIN'
  | 'ADMIN_ENV_PIN_NOT_CONFIGURED'
  | 'ADMIN_ENV_PIN_TOO_WEAK'
  | 'ADMIN_RATE_LIMITED';

export interface MasterAdminPinVerificationResult {
  valid: boolean;
  proof?: MasterAdminProof;
  statusCode?: number;
  code?: MasterAdminPinFailureCode;
  error?: string;
  retryAfterSec?: number;
}

export interface MasterAdminPinPolicyStatus {
  envConfigured: boolean;
  strictMode: boolean;
  meetsStrengthRequirement: boolean;
  hashCached: boolean;
  algorithm: 'scrypt-timingSafeEqual';
}

const validMasterAdminProofs = new WeakSet<MasterAdminProof>();
const ipFailureBuckets = new Map<string, number[]>();
let globalFailureTimestamps: number[] = [];

let cachedEnvRecord: HashedEnvAdminPinRecord | null = null;
let warnedWeakEnvAdminPin = false;

function computeEnvFingerprint(envPin: string): string {
  return crypto
    .createHmac('sha256', PROCESS_FINGERPRINT_KEY)
    .update(envPin, 'utf8')
    .digest('hex');
}

function isNumericFormattedPin(value: string): boolean {
  return /^\d[\d\s-]*\d$/.test(value);
}

function normalizeNumericPin(value: string): string {
  return value.replace(/[\s-]+/g, '');
}

function deriveMasterPinScrypt(domain: 'raw' | 'num', pinValue: string, saltHex: string): Buffer {
  return crypto.scryptSync(`vecl:master-admin:v1:${domain}:${pinValue}`, saltHex, 32);
}

function getOrBuildHashedEnvRecord(nowMs: number):
  | { ok: true; record: HashedEnvAdminPinRecord }
  | {
      ok: false;
      statusCode: number;
      code: 'ADMIN_ENV_PIN_NOT_CONFIGURED' | 'ADMIN_ENV_PIN_TOO_WEAK';
      error: string;
    } {
  const envPin = (process.env.VECL_ADMIN_MASTER_PIN || '').trim();
  if (!envPin) {
    cachedEnvRecord = null;
    return {
      ok: false,
      statusCode: 503,
      code: 'ADMIN_ENV_PIN_NOT_CONFIGURED',
      error:
        'Master Admin PIN authentication is unavailable because VECL_ADMIN_MASTER_PIN is not configured on the server.',
    };
  }

  const strict = isStrictProductionSecrets();
  if (strict && envPin.length < MIN_ENV_ADMIN_PIN_LENGTH_STRICT) {
    cachedEnvRecord = null;
    return {
      ok: false,
      statusCode: 503,
      code: 'ADMIN_ENV_PIN_TOO_WEAK',
      error: `Server Master Admin PIN is too weak for strict production mode. Configure at least ${MIN_ENV_ADMIN_PIN_LENGTH_STRICT} characters in VECL_ADMIN_MASTER_PIN.`,
    };
  }

  if (envPin.length < MIN_ENV_ADMIN_PIN_LENGTH_DEV) {
    cachedEnvRecord = null;
    return {
      ok: false,
      statusCode: 503,
      code: 'ADMIN_ENV_PIN_TOO_WEAK',
      error: `Server Master Admin PIN must be at least ${MIN_ENV_ADMIN_PIN_LENGTH_DEV} characters.`,
    };
  }

  if (!strict && envPin.length < MIN_ENV_ADMIN_PIN_LENGTH_STRICT && !warnedWeakEnvAdminPin) {
    warnedWeakEnvAdminPin = true;
    console.warn(
      `[AdminMasterPin] VECL_ADMIN_MASTER_PIN is shorter than ${MIN_ENV_ADMIN_PIN_LENGTH_STRICT} characters; this will be rejected when strict production secrets are enabled.`
    );
  }

  const fingerprint = computeEnvFingerprint(envPin);
  if (cachedEnvRecord && cachedEnvRecord.envFingerprintHmac === fingerprint) {
    return { ok: true, record: cachedEnvRecord };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const rawScryptHash = deriveMasterPinScrypt('raw', envPin, salt);

  let normalizedNumericScryptHash: Buffer | null = null;
  if (isNumericFormattedPin(envPin)) {
    const normalized = normalizeNumericPin(envPin);
    if (normalized.length >= MIN_ENV_ADMIN_PIN_LENGTH_DEV && normalized !== envPin) {
      normalizedNumericScryptHash = deriveMasterPinScrypt('num', normalized, salt);
    }
  }

  cachedEnvRecord = {
    envFingerprintHmac: fingerprint,
    salt,
    rawScryptHash,
    normalizedNumericScryptHash,
    envPinLength: envPin.length,
    hashedAtMs: nowMs,
  };

  return { ok: true, record: cachedEnvRecord };
}

function checkFailureRateLimit(
  ipKey: string,
  nowMs: number
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const globalWindowStart = nowMs - GLOBAL_FAILURE_WINDOW_MS;
  globalFailureTimestamps = globalFailureTimestamps.filter((t) => t > globalWindowStart);
  if (globalFailureTimestamps.length >= GLOBAL_FAILURE_MAX_ATTEMPTS) {
    const oldestGlobal = globalFailureTimestamps[0];
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldestGlobal + GLOBAL_FAILURE_WINDOW_MS - nowMs) / 1000)
    );
    return { allowed: false, retryAfterSec };
  }

  const ipWindowStart = nowMs - IP_FAILURE_WINDOW_MS;
  const ipList = (ipFailureBuckets.get(ipKey) || []).filter((t) => t > ipWindowStart);
  if (ipList.length === 0) {
    ipFailureBuckets.delete(ipKey);
  } else {
    ipFailureBuckets.set(ipKey, ipList);
  }

  if (ipList.length >= IP_FAILURE_MAX_ATTEMPTS) {
    const oldestIp = ipList[0];
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldestIp + IP_FAILURE_WINDOW_MS - nowMs) / 1000)
    );
    return { allowed: false, retryAfterSec };
  }

  return { allowed: true };
}

function recordFailedAttempt(ipKey: string, nowMs: number): void {
  const globalWindowStart = nowMs - GLOBAL_FAILURE_WINDOW_MS;
  globalFailureTimestamps = globalFailureTimestamps.filter((t) => t > globalWindowStart);
  globalFailureTimestamps.push(nowMs);

  const ipWindowStart = nowMs - IP_FAILURE_WINDOW_MS;
  const ipList = (ipFailureBuckets.get(ipKey) || []).filter((t) => t > ipWindowStart);
  ipList.push(nowMs);
  ipFailureBuckets.set(ipKey, ipList);
}

function mintMasterAdminProof(nowMs: number): MasterAdminProof {
  const proof: MasterAdminProof = Object.freeze({
    [PROOF_BRAND]: true as const,
    adminUid: MASTER_ADMIN_ACTOR_UID,
    verifiedAtMs: nowMs,
  });
  validMasterAdminProofs.add(proof);
  return proof;
}

export function isValidMasterAdminProof(value: unknown): value is MasterAdminProof {
  if (!value || typeof value !== 'object') return false;
  return validMasterAdminProofs.has(value as MasterAdminProof);
}

export function getMasterAdminPinPolicyStatus(): MasterAdminPinPolicyStatus {
  const envPin = (process.env.VECL_ADMIN_MASTER_PIN || '').trim();
  const strictMode = isStrictProductionSecrets();
  const minLen = strictMode ? MIN_ENV_ADMIN_PIN_LENGTH_STRICT : MIN_ENV_ADMIN_PIN_LENGTH_DEV;
  const meetsStrengthRequirement = envPin.length >= minLen;
  const fingerprint = envPin ? computeEnvFingerprint(envPin) : '';

  return {
    envConfigured: envPin.length > 0,
    strictMode,
    meetsStrengthRequirement,
    hashCached: Boolean(
      cachedEnvRecord && envPin && cachedEnvRecord.envFingerprintHmac === fingerprint
    ),
    algorithm: 'scrypt-timingSafeEqual',
  };
}

export function verifyMasterAdminPinAgainstEnvHash(
  rawPin: string,
  options?: { ipKey?: string; nowMs?: number }
): MasterAdminPinVerificationResult {
  const nowMs = options?.nowMs ?? Date.now();
  const ipKey = (options?.ipKey || 'unknown').trim() || 'unknown';

  const rate = checkFailureRateLimit(ipKey, nowMs);
  if (!rate.allowed) {
    return {
      valid: false,
      statusCode: 429,
      code: 'ADMIN_RATE_LIMITED',
      error: `Too many invalid Master Admin PIN attempts. Retry in ${rate.retryAfterSec}s.`,
      retryAfterSec: rate.retryAfterSec,
    };
  }

  const envCheck = getOrBuildHashedEnvRecord(nowMs);
  if (!envCheck.ok) {
    return {
      valid: false,
      statusCode: envCheck.statusCode,
      code: envCheck.code,
      error: envCheck.error,
    };
  }

  if (typeof rawPin !== 'string') {
    recordFailedAttempt(ipKey, nowMs);
    return {
      valid: false,
      statusCode: 401,
      code: 'INVALID_MASTER_PIN',
      error: 'Invalid Master Admin PIN.',
    };
  }

  const trimmed = rawPin.trim();
  if (
    trimmed.length < MIN_ENV_ADMIN_PIN_LENGTH_DEV ||
    trimmed.length > MAX_INCOMING_PIN_LENGTH
  ) {
    recordFailedAttempt(ipKey, nowMs);
    return {
      valid: false,
      statusCode: 401,
      code: 'INVALID_MASTER_PIN',
      error: 'Invalid Master Admin PIN.',
    };
  }

  const { record } = envCheck;
  const candidateRawHash = deriveMasterPinScrypt('raw', trimmed, record.salt);
  let matched =
    candidateRawHash.length === record.rawScryptHash.length &&
    crypto.timingSafeEqual(candidateRawHash, record.rawScryptHash);

  if (!matched && record.normalizedNumericScryptHash && isNumericFormattedPin(trimmed)) {
    const normalized = normalizeNumericPin(trimmed);
    if (normalized.length >= MIN_ENV_ADMIN_PIN_LENGTH_DEV) {
      const candidateNumHash = deriveMasterPinScrypt('num', normalized, record.salt);
      matched =
        candidateNumHash.length === record.normalizedNumericScryptHash.length &&
        crypto.timingSafeEqual(candidateNumHash, record.normalizedNumericScryptHash);
    }
  }

  if (!matched) {
    recordFailedAttempt(ipKey, nowMs);
    return {
      valid: false,
      statusCode: 401,
      code: 'INVALID_MASTER_PIN',
      error: 'Invalid Master Admin PIN.',
    };
  }

  const proof = mintMasterAdminProof(nowMs);
  return {
    valid: true,
    proof,
  };
}

function extractIncomingMasterPinFromHeaders(
  req: AuthenticatedRequest
): { pin: string | null; rejectedLegacyScheme: boolean } {
  const xAdminPin = req.headers['x-admin-pin'];
  if (typeof xAdminPin === 'string' && xAdminPin.trim().length > 0) {
    return { pin: xAdminPin, rejectedLegacyScheme: false };
  }
  if (Array.isArray(xAdminPin) && xAdminPin.length > 0) {
    return { pin: null, rejectedLegacyScheme: true };
  }

  const xMasterPin = req.headers['x-master-pin'];
  if (typeof xMasterPin === 'string' && xMasterPin.trim().length > 0) {
    return { pin: xMasterPin, rejectedLegacyScheme: false };
  }
  if (Array.isArray(xMasterPin) && xMasterPin.length > 0) {
    return { pin: null, rejectedLegacyScheme: true };
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.trim().length > 0) {
    if (/^MasterPin\s+/i.test(authHeader)) {
      const token = authHeader.replace(/^MasterPin\s+/i, '').trim();
      return { pin: token || null, rejectedLegacyScheme: !token };
    }
    // Reject Firebase JWTs, Trial tokens, or Session tokens explicitly — VECL_ADMIN_MASTER_PIN is exclusive.
    return { pin: null, rejectedLegacyScheme: true };
  }

  return { pin: null, rejectedLegacyScheme: false };
}

export function requireExclusiveMasterAdminPin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const { pin, rejectedLegacyScheme } = extractIncomingMasterPinFromHeaders(req);
  if (!pin) {
    res.status(401).json({
      error: rejectedLegacyScheme
        ? 'Exclusive Master Admin PIN authentication (X-Admin-Pin) is required; Bearer tokens and Firebase accounts are not accepted on license admin endpoints.'
        : 'Master Admin PIN authentication (X-Admin-Pin) is required.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const ipKey = `license-admin:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
  const result = verifyMasterAdminPinAgainstEnvHash(pin, { ipKey });
  if (!result.valid || !result.proof) {
    if (result.statusCode === 429 && result.retryAfterSec) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
    }
    res.status(result.statusCode || 401).json({
      error: result.error || 'Invalid Master Admin PIN.',
      code: result.code || 'INVALID_MASTER_PIN',
    });
    return;
  }

  req.masterAdminProof = result.proof;
  req.isPinAdmin = true;
  req.authUser = {
    uid: result.proof.adminUid,
    email: null,
    emailVerified: true,
  };
  next();
}

export function resetAdminMasterPinServiceForTests(): void {
  cachedEnvRecord = null;
  ipFailureBuckets.clear();
  globalFailureTimestamps = [];
  warnedWeakEnvAdminPin = false;
}
