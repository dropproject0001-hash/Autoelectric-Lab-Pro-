/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import crypto from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from './firebaseAuthMiddleware';
import {
  isStrictProductionSecrets,
  resolveConfiguredMasterAdminPin,
} from './secretsPolicy';

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

const INVISIBLE_PIN_CHARS_REGEX = /[\u200B-\u200D\uFEFF]/g;

export type PinFormatClass =
  | 'empty'
  | 'digits_only'
  | 'digits_formatted'
  | 'alphanumeric_or_symbols';

export function classifyPinFormat(value: string): PinFormatClass {
  if (!value) return 'empty';
  if (/^\d+$/.test(value)) return 'digits_only';
  if (/^\d[\d\s-]*\d$/.test(value)) return 'digits_formatted';
  return 'alphanumeric_or_symbols';
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

function emitMasterPinAuthTrace(trace: Record<string, unknown>): void {
  // Structured server-only trace: never logs raw PINs, env secrets, salts, or crackable hashes.
  console.info('[MasterAdminPinAuthTrace]', JSON.stringify(trace));
}

function getOrBuildHashedEnvRecord(nowMs: number):
  | {
      ok: true;
      record: HashedEnvAdminPinRecord;
      meta: {
        sourceKey: string | null;
        strictMode: boolean;
        envRawLen: number;
        envSanitizedLen: number;
        envWasSanitized: boolean;
        envFormatClass: PinFormatClass;
        envNormalizedLen: number;
        hashCacheHit: boolean;
      };
    }
  | {
      ok: false;
      statusCode: number;
      code: 'ADMIN_ENV_PIN_NOT_CONFIGURED' | 'ADMIN_ENV_PIN_TOO_WEAK';
      error: string;
      meta: {
        sourceKey: string | null;
        strictMode: boolean;
        envRawLen: number;
        envSanitizedLen: number;
        envWasSanitized: boolean;
        envFormatClass: PinFormatClass;
      };
    } {
  const resolved = resolveConfiguredMasterAdminPin();
  const envPin = resolved.sanitized;
  const strict = isStrictProductionSecrets();
  const envFormatClass = classifyPinFormat(envPin);
  const envWasSanitized = resolved.raw !== envPin;

  if (!envPin) {
    cachedEnvRecord = null;
    return {
      ok: false,
      statusCode: 503,
      code: 'ADMIN_ENV_PIN_NOT_CONFIGURED',
      error:
        'Master Admin PIN authentication is unavailable because VECL_ADMIN_MASTER_PIN is not configured on the server.',
      meta: {
        sourceKey: resolved.sourceKey,
        strictMode: strict,
        envRawLen: resolved.raw.length,
        envSanitizedLen: 0,
        envWasSanitized,
        envFormatClass,
      },
    };
  }

  if (strict && envPin.length < MIN_ENV_ADMIN_PIN_LENGTH_STRICT) {
    cachedEnvRecord = null;
    return {
      ok: false,
      statusCode: 503,
      code: 'ADMIN_ENV_PIN_TOO_WEAK',
      error: `Server Master Admin PIN is too weak for strict production mode. Configure at least ${MIN_ENV_ADMIN_PIN_LENGTH_STRICT} characters in VECL_ADMIN_MASTER_PIN.`,
      meta: {
        sourceKey: resolved.sourceKey,
        strictMode: strict,
        envRawLen: resolved.raw.length,
        envSanitizedLen: envPin.length,
        envWasSanitized,
        envFormatClass,
      },
    };
  }

  if (envPin.length < MIN_ENV_ADMIN_PIN_LENGTH_DEV) {
    cachedEnvRecord = null;
    return {
      ok: false,
      statusCode: 503,
      code: 'ADMIN_ENV_PIN_TOO_WEAK',
      error: `Server Master Admin PIN must be at least ${MIN_ENV_ADMIN_PIN_LENGTH_DEV} characters.`,
      meta: {
        sourceKey: resolved.sourceKey,
        strictMode: strict,
        envRawLen: resolved.raw.length,
        envSanitizedLen: envPin.length,
        envWasSanitized,
        envFormatClass,
      },
    };
  }

  if (!strict && envPin.length < MIN_ENV_ADMIN_PIN_LENGTH_STRICT && !warnedWeakEnvAdminPin) {
    warnedWeakEnvAdminPin = true;
    console.warn(
      `[AdminMasterPin] VECL_ADMIN_MASTER_PIN is shorter than ${MIN_ENV_ADMIN_PIN_LENGTH_STRICT} characters; this will be rejected when strict production secrets are enabled.`
    );
  }

  const normalizedEnvLen = isNumericFormattedPin(envPin)
    ? normalizeNumericPin(envPin).length
    : envPin.length;
  const fingerprint = computeEnvFingerprint(envPin);
  if (cachedEnvRecord && cachedEnvRecord.envFingerprintHmac === fingerprint) {
    return {
      ok: true,
      record: cachedEnvRecord,
      meta: {
        sourceKey: resolved.sourceKey,
        strictMode: strict,
        envRawLen: resolved.raw.length,
        envSanitizedLen: envPin.length,
        envWasSanitized,
        envFormatClass,
        envNormalizedLen: normalizedEnvLen,
        hashCacheHit: true,
      },
    };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const rawScryptHash = deriveMasterPinScrypt('raw', envPin, salt);

  // Always compute normalized numeric hash when env PIN is numeric (with or without separators)
  // so both "908172635544" and "9081-7263-5544" validate symmetrically in either direction.
  let normalizedNumericScryptHash: Buffer | null = null;
  if (isNumericFormattedPin(envPin)) {
    const normalized = normalizeNumericPin(envPin);
    if (normalized.length >= MIN_ENV_ADMIN_PIN_LENGTH_DEV) {
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

  return {
    ok: true,
    record: cachedEnvRecord,
    meta: {
      sourceKey: resolved.sourceKey,
      strictMode: strict,
      envRawLen: resolved.raw.length,
      envSanitizedLen: envPin.length,
      envWasSanitized,
      envFormatClass,
      envNormalizedLen: normalizedEnvLen,
      hashCacheHit: false,
    },
  };
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
  const envPin = resolveConfiguredMasterAdminPin().sanitized;
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
  options?: { ipKey?: string; nowMs?: number; source?: string; route?: string }
): MasterAdminPinVerificationResult {
  const startedMs = Date.now();
  const traceId = `mpin_${crypto.randomBytes(4).toString('hex')}`;
  const nowMs = options?.nowMs ?? startedMs;
  const ipKey = (options?.ipKey || 'unknown').trim() || 'unknown';
  const source = options?.source || 'direct';
  const route = options?.route || 'adminMasterPinService';

  const rate = checkFailureRateLimit(ipKey, nowMs);
  if (!rate.allowed) {
    emitMasterPinAuthTrace({
      traceId,
      route,
      source,
      outcome: 'DENY_RATE_LIMITED',
      httpStatus: 429,
      retryAfterSec: rate.retryAfterSec,
      elapsedMs: Date.now() - startedMs,
    });
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
    emitMasterPinAuthTrace({
      traceId,
      route,
      source,
      envConfig: envCheck.meta,
      outcome: `DENY_${envCheck.code}`,
      httpStatus: envCheck.statusCode,
      elapsedMs: Date.now() - startedMs,
    });
    return {
      valid: false,
      statusCode: envCheck.statusCode,
      code: envCheck.code,
      error: envCheck.error,
    };
  }

  if (typeof rawPin !== 'string') {
    recordFailedAttempt(ipKey, nowMs);
    emitMasterPinAuthTrace({
      traceId,
      route,
      source,
      envConfig: envCheck.meta,
      incoming: { type: typeof rawPin },
      outcome: 'DENY_NON_STRING_PIN',
      httpStatus: 401,
      elapsedMs: Date.now() - startedMs,
    });
    return {
      valid: false,
      statusCode: 401,
      code: 'INVALID_MASTER_PIN',
      error: 'Invalid Master Admin PIN.',
    };
  }

  const withoutInvisible = rawPin.replace(INVISIBLE_PIN_CHARS_REGEX, '');
  const hadInvisibleChars = withoutInvisible.length !== rawPin.length;
  const trimmed = withoutInvisible.trim();
  const hadOuterWhitespace = trimmed.length !== withoutInvisible.length;
  const incomingFormatClass = classifyPinFormat(trimmed);
  const incomingNormalized = isNumericFormattedPin(trimmed) ? normalizeNumericPin(trimmed) : trimmed;

  if (
    trimmed.length < MIN_ENV_ADMIN_PIN_LENGTH_DEV ||
    trimmed.length > MAX_INCOMING_PIN_LENGTH
  ) {
    recordFailedAttempt(ipKey, nowMs);
    emitMasterPinAuthTrace({
      traceId,
      route,
      source,
      envConfig: envCheck.meta,
      incoming: {
        rawLen: rawPin.length,
        trimmedLen: trimmed.length,
        normalizedLen: incomingNormalized.length,
        hadInvisibleChars,
        hadOuterWhitespace,
        formatClass: incomingFormatClass,
      },
      outcome: 'DENY_LENGTH_BOUNDS',
      httpStatus: 401,
      elapsedMs: Date.now() - startedMs,
    });
    return {
      valid: false,
      statusCode: 401,
      code: 'INVALID_MASTER_PIN',
      error: 'Invalid Master Admin PIN.',
    };
  }

  const { record } = envCheck;
  const candidateRawHash = deriveMasterPinScrypt('raw', trimmed, record.salt);
  const rawHashMatched =
    candidateRawHash.length === record.rawScryptHash.length &&
    crypto.timingSafeEqual(candidateRawHash, record.rawScryptHash);

  let normalizedHashCompareRan = false;
  let normalizedHashMatched = false;
  if (!rawHashMatched && record.normalizedNumericScryptHash && isNumericFormattedPin(trimmed)) {
    const normalized = normalizeNumericPin(trimmed);
    if (normalized.length >= MIN_ENV_ADMIN_PIN_LENGTH_DEV) {
      normalizedHashCompareRan = true;
      const candidateNumHash = deriveMasterPinScrypt('num', normalized, record.salt);
      normalizedHashMatched =
        candidateNumHash.length === record.normalizedNumericScryptHash.length &&
        crypto.timingSafeEqual(candidateNumHash, record.normalizedNumericScryptHash);
    }
  }

  const matched = rawHashMatched || normalizedHashMatched;

  emitMasterPinAuthTrace({
    traceId,
    route,
    source,
    algorithm: 'scrypt-timingSafeEqual',
    envConfig: {
      ...envCheck.meta,
      hasNormalizedNumericHash: record.normalizedNumericScryptHash !== null,
      hashBytes: record.rawScryptHash.length,
    },
    incoming: {
      rawLen: rawPin.length,
      trimmedLen: trimmed.length,
      normalizedLen: incomingNormalized.length,
      hadInvisibleChars,
      hadOuterWhitespace,
      formatClass: incomingFormatClass,
      lengthMatchesSanitized: trimmed.length === envCheck.meta.envSanitizedLen,
      lengthMatchesNormalized: incomingNormalized.length === envCheck.meta.envNormalizedLen,
    },
    comparison: {
      rawHashCompareRan: true,
      rawHashMatched,
      normalizedHashCompareRan,
      normalizedHashMatched,
    },
    outcome: matched ? 'ALLOW' : 'DENY_SCRYPT_HASH_MISMATCH',
    httpStatus: matched ? 200 : 401,
    elapsedMs: Date.now() - startedMs,
  });

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
): { pin: string | null; headerSource: string; rejectedLegacyScheme: boolean } {
  const xAdminPin = req.headers['x-admin-pin'];
  if (typeof xAdminPin === 'string' && xAdminPin.trim().length > 0) {
    return { pin: xAdminPin, headerSource: 'x-admin-pin', rejectedLegacyScheme: false };
  }
  if (Array.isArray(xAdminPin) && xAdminPin.length > 0) {
    return { pin: null, headerSource: 'x-admin-pin:array', rejectedLegacyScheme: true };
  }

  const xMasterPin = req.headers['x-master-pin'];
  if (typeof xMasterPin === 'string' && xMasterPin.trim().length > 0) {
    return { pin: xMasterPin, headerSource: 'x-master-pin', rejectedLegacyScheme: false };
  }
  if (Array.isArray(xMasterPin) && xMasterPin.length > 0) {
    return { pin: null, headerSource: 'x-master-pin:array', rejectedLegacyScheme: true };
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.trim().length > 0) {
    if (/^MasterPin\s+/i.test(authHeader)) {
      const token = authHeader.replace(/^MasterPin\s+/i, '').trim();
      return {
        pin: token || null,
        headerSource: 'authorization:MasterPin',
        rejectedLegacyScheme: !token,
      };
    }
    // Reject Firebase JWTs, Trial tokens, or Session tokens explicitly — VECL_ADMIN_MASTER_PIN is exclusive.
    return { pin: null, headerSource: 'authorization:non-MasterPin', rejectedLegacyScheme: true };
  }

  return { pin: null, headerSource: 'none', rejectedLegacyScheme: false };
}

export function requireExclusiveMasterAdminPin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const { pin, headerSource, rejectedLegacyScheme } = extractIncomingMasterPinFromHeaders(req);
  if (!pin) {
    emitMasterPinAuthTrace({
      route: `${req.method} ${req.path}`,
      middleware: 'requireExclusiveMasterAdminPin',
      headerSource,
      rejectedLegacyScheme,
      outcome: 'DENY_AUTH_REQUIRED',
      httpStatus: 401,
    });
    res.status(401).json({
      error: rejectedLegacyScheme
        ? 'Exclusive Master Admin PIN authentication (X-Admin-Pin) is required; Bearer tokens and Firebase accounts are not accepted on license admin endpoints.'
        : 'Master Admin PIN authentication (X-Admin-Pin) is required.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const ipKey = `license-admin:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
  const result = verifyMasterAdminPinAgainstEnvHash(pin, {
    ipKey,
    source: headerSource,
    route: `${req.method} ${req.path}`,
  });
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
