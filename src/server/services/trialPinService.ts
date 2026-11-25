/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type TrialDurationHours = 3 | 4 | 5 | 6 | 720 | 2160 | 4320 | 8760;
export type TrialPinStatus = 'UNUSED' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export type TrialAuditEventType =
  | 'GENERATED'
  | 'ACTIVATED'
  | 'DEVICE_BIND'
  | 'REVERIFIED'
  | 'DEVICE_RESET'
  | 'REVOKED'
  | 'RESTORED'
  | 'IMPORTED';

export interface TrialDeviceUsageRecord {
  deviceIdHash: string;
  maskedDeviceId: string;
  deviceLabel: string;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
  activationCount: number;
}

export interface PublicTrialDeviceUsage {
  maskedDeviceId: string;
  deviceLabel: string;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
  activationCount: number;
  isCurrentlyBound: boolean;
}

export interface TrialAuditEvent {
  eventId: string;
  timestampMs: number;
  eventType: TrialAuditEventType;
  trialId: string;
  maskedPin: string;
  durationHours: TrialDurationHours;
  actor: string;
  deviceLabel: string | null;
  maskedDeviceId: string | null;
  detail: string;
}

export interface AdminTrialAuditSummary {
  totalPins: number;
  activePins: number;
  unusedPins: number;
  expiredPins: number;
  revokedPins: number;
  expiringSoonPins: number;
  totalUniqueDevicesUsed: number;
  totalActivations: number;
}

export interface TrialPinRecord {
  trialId: string;
  maskedPin: string;
  pinLookupHash: string;
  pinSalt: string;
  pinScryptHash: string;
  durationHours: TrialDurationHours;
  maxDevices: 1;
  unusedExpiryHours: number;
  createdAtMs: number;
  unusedExpiresAtMs: number;
  activatedAtMs: number | null;
  expiresAtMs: number | null;
  revokedAtMs: number | null;
  revokeReason: string | null;
  boundDeviceId: string | null;
  boundDeviceLabel: string | null;
  lastSeenAtMs: number | null;
  notes: string;
  deviceHistory?: TrialDeviceUsageRecord[];
  totalActivations?: number;
}

export type PublicTrialPinRecord = Omit<
  TrialPinRecord,
  'pinLookupHash' | 'pinSalt' | 'pinScryptHash' | 'deviceHistory' | 'totalActivations'
> & {
  status: TrialPinStatus;
  remainingSeconds: number | null;
  totalDevicesUsed: number;
  totalActivations: number;
  usageHistory: PublicTrialDeviceUsage[];
};

export interface AdminPinCredentialRecord {
  salt: string;
  scryptHash: string;
  createdAtMs: number;
}

export interface TrialTokenPayload {
  kind: 'trial_v1';
  trialId: string;
  deviceId: string;
  issuedAtMs: number;
  expiresAtMs: number;
}

export interface AdminSessionTokenPayload {
  kind: 'admin_v1';
  adminId: string;
  issuedAtMs: number;
  expiresAtMs: number;
}

interface DurableTrialStorePayload {
  schemaVersion: 1 | 2;
  updatedAtMs: number;
  trials: TrialPinRecord[];
  auditLog?: TrialAuditEvent[];
  adminCredential: AdminPinCredentialRecord | null;
}

const VALID_TRIAL_DURATIONS = new Set<number>([3, 4, 5, 6, 720, 2160, 4320, 8760]);
const DEFAULT_UNUSED_EXPIRY_HOURS = 72;
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const REDEEM_WINDOW_MS = 5 * 60 * 1000;
const REDEEM_MAX_ATTEMPTS = 8;
const ADMIN_LOGIN_WINDOW_MS = 5 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 8;

const MAX_AUDIT_LOG_EVENTS = 1000;
const MAX_IMPORT_CSV_BYTES = 1_000_000;
const MAX_IMPORT_CSV_ROWS = 2500;
const LOW_TIME_WARNING_THRESHOLD_SEC = 1800;

const trialsById = new Map<string, TrialPinRecord>();
const trialIdByLookupHash = new Map<string, string>();
const auditEvents: TrialAuditEvent[] = [];
const trialRedemptionLocks = new Set<string>();
const trialAttemptBuckets = new Map<string, number[]>();
const adminAttemptBuckets = new Map<string, number[]>();

let storedAdminCredential: AdminPinCredentialRecord | null = null;
let customTrialStoreFilePath: string | null = null;
let cachedHmacSecret: string | null = null;
let isTrialStoreLoaded = false;

function hashDeviceIdentifier(deviceId: string): string {
  return crypto.createHash('sha256').update(`vecl:dev:v1:${deviceId.trim()}`).digest('hex');
}

function maskDeviceIdentifier(deviceId: string | null | undefined): string | null {
  const clean = (deviceId || '').trim();
  if (!clean) return null;
  if (clean.length <= 6) {
    return `dev_•••${clean.slice(-2)}`;
  }
  return `dev_•••${clean.slice(-4)}`;
}

function sanitizeAuditActor(actor: string | undefined, fallback = 'Master Admin'): string {
  const clean = (actor || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80);
  return clean || fallback;
}

function appendAuditEvent(params: {
  eventType: TrialAuditEventType;
  record: TrialPinRecord;
  timestampMs: number;
  actor?: string;
  deviceLabel?: string | null;
  deviceId?: string | null;
  detail: string;
}): TrialAuditEvent {
  const entry: TrialAuditEvent = {
    eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
    timestampMs: params.timestampMs,
    eventType: params.eventType,
    trialId: params.record.trialId,
    maskedPin: params.record.maskedPin,
    durationHours: params.record.durationHours,
    actor: sanitizeAuditActor(params.actor, 'System'),
    deviceLabel: params.deviceLabel ? params.deviceLabel.trim().slice(0, 120) : null,
    maskedDeviceId: maskDeviceIdentifier(params.deviceId),
    detail: params.detail.trim().slice(0, 220),
  };
  auditEvents.unshift(entry);
  if (auditEvents.length > MAX_AUDIT_LOG_EVENTS) {
    auditEvents.length = MAX_AUDIT_LOG_EVENTS;
  }
  return entry;
}

function ensureBackfilledRecordHistory(rec: TrialPinRecord): TrialPinRecord {
  const existingHistory = Array.isArray(rec.deviceHistory)
    ? rec.deviceHistory.filter(
        (h) => h && typeof h.deviceIdHash === 'string' && typeof h.maskedDeviceId === 'string'
      )
    : [];

  let normalizedHistory = existingHistory.map((h) => ({ ...h }));
  if (normalizedHistory.length === 0 && rec.boundDeviceId) {
    normalizedHistory = [
      {
        deviceIdHash: hashDeviceIdentifier(rec.boundDeviceId),
        maskedDeviceId: maskDeviceIdentifier(rec.boundDeviceId) || 'dev_••••',
        deviceLabel: (rec.boundDeviceLabel || 'Workstation').trim().slice(0, 120),
        firstSeenAtMs: rec.activatedAtMs ?? rec.createdAtMs,
        lastSeenAtMs: rec.lastSeenAtMs ?? rec.activatedAtMs ?? rec.createdAtMs,
        activationCount: 1,
      },
    ];
  }

  const totalActivations =
    typeof rec.totalActivations === 'number' && Number.isFinite(rec.totalActivations)
      ? Math.max(rec.totalActivations, normalizedHistory.length)
      : rec.activatedAtMs !== null
        ? Math.max(1, normalizedHistory.length)
        : 0;

  return {
    ...rec,
    maxDevices: 1,
    deviceHistory: normalizedHistory,
    totalActivations,
  };
}

function resolveTrialStoreFilePath(): string {
  if (customTrialStoreFilePath) {
    return customTrialStoreFilePath;
  }
  if (process.env.VECL_TRIAL_STORE_PATH && process.env.VECL_TRIAL_STORE_PATH.trim()) {
    return path.resolve(process.env.VECL_TRIAL_STORE_PATH.trim());
  }
  if (process.env.VECL_LICENSE_STORE_PATH && process.env.VECL_LICENSE_STORE_PATH.trim()) {
    return path.join(path.dirname(path.resolve(process.env.VECL_LICENSE_STORE_PATH.trim())), 'vecl-trials.store.json');
  }
  return path.resolve(process.cwd(), '.data', 'vecl-trials.store.json');
}

function resolveHmacKeyFilePath(): string {
  const storeDir = path.dirname(resolveTrialStoreFilePath());
  return path.join(storeDir, 'vecl-license-hmac.key');
}

function getHmacSecret(): string {
  const envSecret = (process.env.VECL_LICENSE_HMAC_SECRET || '').trim();
  if (process.env.VECL_STRICT_PRODUCTION_SECRETS === 'true') {
    if (envSecret.length < 32) {
      throw new Error(
        'LICENSE_HMAC_SECRET_MISSING_OR_WEAK: VECL_LICENSE_HMAC_SECRET must be at least 32 characters in strict production mode.'
      );
    }
    return envSecret;
  }
  if (envSecret.length >= 16) {
    return envSecret;
  }
  if (cachedHmacSecret) {
    return cachedHmacSecret;
  }
  try {
    const keyPath = resolveHmacKeyFilePath();
    if (fs.existsSync(keyPath)) {
      const existing = fs.readFileSync(keyPath, 'utf8').trim();
      if (existing.length >= 64) {
        cachedHmacSecret = existing;
        return existing;
      }
    }
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    const generated = crypto.randomBytes(32).toString('hex');
    const tmpKeyPath = `${keyPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpKeyPath, generated, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpKeyPath, keyPath);
    cachedHmacSecret = generated;
    return generated;
  } catch {
    if (!cachedHmacSecret) {
      cachedHmacSecret = crypto.randomBytes(32).toString('hex');
    }
    return cachedHmacSecret;
  }
}

function persistTrialStoreToDisk(): void {
  try {
    const filePath = resolveTrialStoreFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const payload: DurableTrialStorePayload = {
      schemaVersion: 2,
      updatedAtMs: Date.now(),
      trials: Array.from(trialsById.values()),
      auditLog: auditEvents.slice(0, MAX_AUDIT_LOG_EVENTS),
      adminCredential: storedAdminCredential,
    };
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.warn('[TrialPinService] Durable store write warning:', err);
  }
}

export function reloadTrialStoreFromDisk(): {
  loadedTrials: number;
  storeFilePath: string;
} {
  const filePath = resolveTrialStoreFilePath();
  trialsById.clear();
  trialIdByLookupHash.clear();
  auditEvents.length = 0;
  storedAdminCredential = null;
  isTrialStoreLoaded = true;

  if (!fs.existsSync(filePath)) {
    return { loadedTrials: 0, storeFilePath: filePath };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DurableTrialStorePayload>;
    if (Array.isArray(parsed.trials)) {
      for (const rec of parsed.trials) {
        if (rec && typeof rec.trialId === 'string' && typeof rec.pinLookupHash === 'string') {
          const normalized = ensureBackfilledRecordHistory(rec);
          trialsById.set(rec.trialId, normalized);
          if (!rec.pinLookupHash.startsWith('imported:') && typeof rec.pinScryptHash === 'string' && rec.pinScryptHash.length > 0) {
            trialIdByLookupHash.set(rec.pinLookupHash, rec.trialId);
          }
        }
      }
    }
    if (Array.isArray(parsed.auditLog)) {
      for (const evt of parsed.auditLog) {
        if (evt && typeof evt.eventId === 'string' && typeof evt.trialId === 'string') {
          auditEvents.push(evt);
        }
      }
      auditEvents.sort((a, b) => b.timestampMs - a.timestampMs);
      if (auditEvents.length > MAX_AUDIT_LOG_EVENTS) {
        auditEvents.length = MAX_AUDIT_LOG_EVENTS;
      }
    }
    if (
      parsed.adminCredential &&
      typeof parsed.adminCredential.salt === 'string' &&
      typeof parsed.adminCredential.scryptHash === 'string'
    ) {
      storedAdminCredential = { ...parsed.adminCredential };
    }
  } catch (err) {
    console.warn('[TrialPinService] Failed to parse durable trial store:', err);
  }

  return { loadedTrials: trialsById.size, storeFilePath: filePath };
}

function ensureTrialStoreLoaded(): void {
  if (!isTrialStoreLoaded) {
    reloadTrialStoreFromDisk();
  }
}

export function setTrialStoreFilePathForTests(filePath: string | null): void {
  customTrialStoreFilePath = filePath;
  cachedHmacSecret = null;
  isTrialStoreLoaded = false;
}

export function resetTrialStoreForTests(): void {
  trialsById.clear();
  trialIdByLookupHash.clear();
  auditEvents.length = 0;
  trialRedemptionLocks.clear();
  trialAttemptBuckets.clear();
  adminAttemptBuckets.clear();
  storedAdminCredential = null;
  isTrialStoreLoaded = true;
  try {
    const filePath = resolveTrialStoreFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

function checkRateBucket(
  buckets: Map<string, number[]>,
  key: string,
  windowMs: number,
  maxAttempts: number,
  nowMs = Date.now()
): { allowed: boolean; retryAfterSec?: number } {
  const windowStart = nowMs - windowMs;
  const list = (buckets.get(key) || []).filter((t) => t > windowStart);
  if (list.length >= maxAttempts) {
    const oldest = list[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000));
    buckets.set(key, list);
    return { allowed: false, retryAfterSec };
  }
  list.push(nowMs);
  buckets.set(key, list);
  if (buckets.size > 128) {
    for (const [k, times] of buckets.entries()) {
      const active = times.filter((t) => t > windowStart);
      if (active.length === 0) {
        buckets.delete(k);
      } else if (active.length !== times.length) {
        buckets.set(k, active);
      }
    }
  }
  return { allowed: true };
}

export function checkTrialRedeemRateLimit(key: string, nowMs = Date.now()) {
  return checkRateBucket(trialAttemptBuckets, key, REDEEM_WINDOW_MS, REDEEM_MAX_ATTEMPTS, nowMs);
}

export function checkAdminPinRateLimit(key: string, nowMs = Date.now()) {
  return checkRateBucket(
    adminAttemptBuckets,
    key,
    ADMIN_LOGIN_WINDOW_MS,
    ADMIN_LOGIN_MAX_ATTEMPTS,
    nowMs
  );
}

export function normalizeTrialPin(rawPin: string): string {
  return rawPin.replace(/[\s-]+/g, '').trim();
}

export function formatTrialPin(digits: string): string {
  const norm = normalizeTrialPin(digits);
  if (norm.length !== 8) return norm;
  return `${norm.slice(0, 4)}-${norm.slice(4, 8)}`;
}

export function isValidTrialPinFormat(rawPin: string): boolean {
  return /^\d{8}$/.test(normalizeTrialPin(rawPin));
}

function computePinLookupHash(normalizedPin: string): string {
  return crypto.createHash('sha256').update(`vecl:trial-lookup:v1:${normalizedPin}`).digest('hex');
}

function derivePinScryptDigest(normalizedPin: string, saltHex: string): string {
  return crypto.scryptSync(`vecl:trial:v1:${normalizedPin}`, saltHex, 32).toString('hex');
}

function constantTimeHexEquals(aHex: string, bHex: string): boolean {
  if (!aHex || !bHex || aHex.length !== bHex.length) return false;
  const aBuf = Buffer.from(aHex, 'hex');
  const bBuf = Buffer.from(bHex, 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function constantTimeUtf8DigestEquals(a: string, b: string): boolean {
  const aDigest = crypto.createHash('sha256').update(a, 'utf8').digest();
  const bDigest = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(aDigest, bDigest);
}

function isTrivialPinSequence(pin: string): boolean {
  if (/^(\d)\1{7}$/.test(pin)) return true;
  if (pin === '12345678' || pin === '87654321' || pin === '01234567' || pin === '98765432') {
    return true;
  }
  return false;
}

export function generatePlainTrialPin(): string {
  for (let i = 0; i < 32; i++) {
    const num = crypto.randomInt(10_000_000, 100_000_000);
    const digits = String(num).padStart(8, '0');
    if (!isTrivialPinSequence(digits)) {
      return digits;
    }
  }
  return String(crypto.randomInt(10_000_000, 100_000_000)).padStart(8, '0');
}

export function computeEffectiveTrialStatus(
  record: TrialPinRecord,
  nowMs = Date.now()
): TrialPinStatus {
  if (record.revokedAtMs !== null) {
    return 'REVOKED';
  }
  if (record.activatedAtMs === null) {
    if (nowMs >= record.unusedExpiresAtMs) {
      return 'EXPIRED';
    }
    return 'UNUSED';
  }
  if (record.expiresAtMs !== null && nowMs >= record.expiresAtMs) {
    return 'EXPIRED';
  }
  return 'ACTIVE';
}

export function computeRemainingSecondsForRecord(
  record: TrialPinRecord,
  nowMs = Date.now()
): number | null {
  const status = computeEffectiveTrialStatus(record, nowMs);
  if (status === 'ACTIVE' && record.expiresAtMs !== null) {
    return Math.max(0, Math.floor((record.expiresAtMs - nowMs) / 1000));
  }
  if (status === 'EXPIRED' || status === 'REVOKED') {
    return 0;
  }
  return null;
}

export function toPublicTrialPinRecord(
  record: TrialPinRecord,
  nowMs = Date.now()
): PublicTrialPinRecord {
  const normalized = ensureBackfilledRecordHistory(record);
  const currentBoundHash = normalized.boundDeviceId
    ? hashDeviceIdentifier(normalized.boundDeviceId)
    : null;
  const usageHistory: PublicTrialDeviceUsage[] = (normalized.deviceHistory || [])
    .slice()
    .sort((a, b) => b.lastSeenAtMs - a.lastSeenAtMs)
    .map((entry) => ({
      maskedDeviceId: entry.maskedDeviceId,
      deviceLabel: entry.deviceLabel,
      firstSeenAtMs: entry.firstSeenAtMs,
      lastSeenAtMs: entry.lastSeenAtMs,
      activationCount: entry.activationCount,
      isCurrentlyBound: currentBoundHash !== null && entry.deviceIdHash === currentBoundHash,
    }));

  return {
    trialId: normalized.trialId,
    maskedPin: normalized.maskedPin,
    durationHours: normalized.durationHours,
    maxDevices: 1,
    unusedExpiryHours: normalized.unusedExpiryHours,
    createdAtMs: normalized.createdAtMs,
    unusedExpiresAtMs: normalized.unusedExpiresAtMs,
    activatedAtMs: normalized.activatedAtMs,
    expiresAtMs: normalized.expiresAtMs,
    revokedAtMs: normalized.revokedAtMs,
    revokeReason: normalized.revokeReason,
    boundDeviceId: normalized.boundDeviceId,
    boundDeviceLabel: normalized.boundDeviceLabel,
    lastSeenAtMs: normalized.lastSeenAtMs,
    notes: normalized.notes,
    status: computeEffectiveTrialStatus(normalized, nowMs),
    remainingSeconds: computeRemainingSecondsForRecord(normalized, nowMs),
    totalDevicesUsed: usageHistory.length,
    totalActivations: normalized.totalActivations ?? usageHistory.length,
    usageHistory,
  };
}

function signHmacToken(prefix: string, payload: object): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getHmacSecret())
    .update(`${prefix}.${payloadB64}`)
    .digest('base64url');
  return `${prefix}.${payloadB64}.${sig}`;
}

function verifyHmacToken<T>(token: string, expectedPrefix: string): { valid: boolean; payload?: T; reason?: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'Malformed token' };
  }
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== expectedPrefix || !parts[1] || !parts[2]) {
    return { valid: false, reason: 'Invalid token structure' };
  }
  const [, payloadB64, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getHmacSecret())
    .update(`${expectedPrefix}.${payloadB64}`)
    .digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, reason: 'Invalid token cryptographic signature' };
  }
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as T;
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'Unparseable token payload' };
  }
}

// ============================================================================
// MASTER ADMIN PIN AUTHENTICATION & FIRST-RUN SETUP
// ============================================================================

export function getAdminPinConfigStatus(): {
  masterEnvConfigured: boolean;
  adminClaimed: boolean;
} {
  ensureTrialStoreLoaded();
  const envPin = (process.env.VECL_ADMIN_MASTER_PIN || '').trim();
  return {
    masterEnvConfigured: envPin.length > 0,
    adminClaimed: storedAdminCredential !== null,
  };
}

export function setupFirstRunAdminPin(
  rawPin: string,
  nowMs = Date.now()
): { adminToken: string; expiresAtMs: number } {
  ensureTrialStoreLoaded();
  const envPin = (process.env.VECL_ADMIN_MASTER_PIN || '').trim();
  if (envPin.length > 0) {
    throw new Error('ADMIN_ENV_MANAGED');
  }
  if (storedAdminCredential !== null) {
    throw new Error('ADMIN_ALREADY_CLAIMED');
  }
  const cleaned = normalizeTrialPin(rawPin);
  if (!/^\d{6,12}$/.test(cleaned)) {
    throw new Error('INVALID_ADMIN_PIN_FORMAT');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const scryptHash = crypto.scryptSync(`vecl:admin:v1:${cleaned}`, salt, 32).toString('hex');
  storedAdminCredential = {
    salt,
    scryptHash,
    createdAtMs: nowMs,
  };
  persistTrialStoreToDisk();

  const expiresAtMs = nowMs + ADMIN_SESSION_TTL_MS;
  const adminToken = signHmacToken('vecl_admin_v1', {
    kind: 'admin_v1',
    adminId: 'master_pin_admin',
    issuedAtMs: nowMs,
    expiresAtMs,
  } satisfies AdminSessionTokenPayload);

  return { adminToken, expiresAtMs };
}

export function verifyMasterAdminPinAndIssueToken(
  rawPin: string,
  nowMs = Date.now()
): { adminToken: string; expiresAtMs: number } {
  ensureTrialStoreLoaded();
  const cleaned = normalizeTrialPin(rawPin);
  if (!cleaned || cleaned.length < 4 || cleaned.length > 64) {
    throw new Error('INVALID_MASTER_PIN');
  }

  const envPin = (process.env.VECL_ADMIN_MASTER_PIN || '').trim();
  if (envPin.length > 0) {
    // Support both exact match (trimmed) and hyphen-stripped numeric match
    const normalizedEnv = normalizeTrialPin(envPin);
    const matchesRaw = constantTimeUtf8DigestEquals(rawPin.trim(), envPin);
    const matchesNormalized =
      normalizedEnv.length >= 4 && constantTimeUtf8DigestEquals(cleaned, normalizedEnv);
    if (!matchesRaw && !matchesNormalized) {
      throw new Error('INVALID_MASTER_PIN');
    }
  } else {
    if (!storedAdminCredential) {
      throw new Error('ADMIN_PIN_NOT_INITIALIZED');
    }
    const candidateHash = crypto
      .scryptSync(`vecl:admin:v1:${cleaned}`, storedAdminCredential.salt, 32)
      .toString('hex');
    if (!constantTimeHexEquals(candidateHash, storedAdminCredential.scryptHash)) {
      throw new Error('INVALID_MASTER_PIN');
    }
  }

  const expiresAtMs = nowMs + ADMIN_SESSION_TTL_MS;
  const adminToken = signHmacToken('vecl_admin_v1', {
    kind: 'admin_v1',
    adminId: 'master_pin_admin',
    issuedAtMs: nowMs,
    expiresAtMs,
  } satisfies AdminSessionTokenPayload);

  return { adminToken, expiresAtMs };
}

export function verifyAdminSessionToken(
  token: string,
  nowMs = Date.now()
): { valid: boolean; payload?: AdminSessionTokenPayload; code?: 'INVALID_TOKEN' | 'TOKEN_EXPIRED'; error?: string } {
  const verified = verifyHmacToken<AdminSessionTokenPayload>(token, 'vecl_admin_v1');
  if (!verified.valid || !verified.payload || verified.payload.kind !== 'admin_v1') {
    return {
      valid: false,
      code: 'INVALID_TOKEN',
      error: verified.reason || 'Invalid admin session token.',
    };
  }
  if (typeof verified.payload.expiresAtMs !== 'number' || nowMs >= verified.payload.expiresAtMs) {
    return {
      valid: false,
      code: 'TOKEN_EXPIRED',
      error: 'Admin session has expired. Re-enter the Master Admin PIN.',
    };
  }
  return { valid: true, payload: verified.payload };
}

// ============================================================================
// 8-DIGIT TRIAL PIN CREATION, REDEMPTION, SINGLE-DEVICE & EXPIRY ENFORCEMENT
// ============================================================================

function formatDurLabel(h: TrialDurationHours): string {
  return h === 720 ? '30d' : h === 2160 ? '3m' : h === 4320 ? '6m' : h === 8760 ? '1y' : `${h}h`;
}

export function createTrialPinRecord(params: {
  durationHours: number;
  unusedExpiryHours?: number;
  notes?: string;
  actor?: string;
  nowMs?: number;
}): {
  plainPin: string;
  formattedPin: string;
  record: PublicTrialPinRecord;
} {
  ensureTrialStoreLoaded();
  const hours = Number(params.durationHours);
  if (!Number.isInteger(hours) || !VALID_TRIAL_DURATIONS.has(hours)) {
    throw new Error(
      'Trial duration must be 3h, 4h, 5h, 6h, 30 days (720h), 3 months (2160h), 6 months (4320h), or 1 year (8760h).'
    );
  }
  const durationHours = hours as TrialDurationHours;
  const nowMs = params.nowMs ?? Date.now();
  const unusedExpiryHours =
    typeof params.unusedExpiryHours === 'number' &&
    Number.isFinite(params.unusedExpiryHours) &&
    params.unusedExpiryHours >= 1 &&
    params.unusedExpiryHours <= 8760
      ? Math.floor(params.unusedExpiryHours)
      : DEFAULT_UNUSED_EXPIRY_HOURS;

  let plainPin = generatePlainTrialPin();
  let lookupHash = computePinLookupHash(plainPin);
  while (trialIdByLookupHash.has(lookupHash)) {
    plainPin = generatePlainTrialPin();
    lookupHash = computePinLookupHash(plainPin);
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const scryptHash = derivePinScryptDigest(plainPin, salt);
  const trialId = `trial_${crypto.randomBytes(8).toString('hex')}`;
  const cleanNotes = typeof params.notes === 'string' ? params.notes.trim().slice(0, 200) : '';

  const record: TrialPinRecord = {
    trialId,
    maskedPin: `••••-${plainPin.slice(-4)}`,
    pinLookupHash: lookupHash,
    pinSalt: salt,
    pinScryptHash: scryptHash,
    durationHours,
    maxDevices: 1,
    unusedExpiryHours,
    createdAtMs: nowMs,
    unusedExpiresAtMs: nowMs + unusedExpiryHours * 3_600_000,
    activatedAtMs: null,
    expiresAtMs: null,
    revokedAtMs: null,
    revokeReason: null,
    boundDeviceId: null,
    boundDeviceLabel: null,
    lastSeenAtMs: null,
    notes: cleanNotes,
    deviceHistory: [],
    totalActivations: 0,
  };

  trialsById.set(trialId, record);
  trialIdByLookupHash.set(lookupHash, trialId);
  appendAuditEvent({
    eventType: 'GENERATED',
    record,
    timestampMs: nowMs,
    actor: params.actor || 'Master Admin',
    detail: `Issued ${formatDurLabel(durationHours)} single-device Pro trial PIN (pickup ${unusedExpiryHours}h)${cleanNotes ? ` — ${cleanNotes}` : ''}`,
  });
  persistTrialStoreToDisk();

  return {
    plainPin,
    formattedPin: formatTrialPin(plainPin),
    record: toPublicTrialPinRecord(record, nowMs),
  };
}

export function signTrialSessionToken(record: TrialPinRecord, nowMs = Date.now()): string {
  const expiresAtMs = record.expiresAtMs ?? nowMs + record.durationHours * 3_600_000;
  return signHmacToken('vecl_trial_v1', {
    kind: 'trial_v1',
    trialId: record.trialId,
    deviceId: record.boundDeviceId || '',
    issuedAtMs: nowMs,
    expiresAtMs,
  } satisfies TrialTokenPayload);
}

export async function redeemTrialPin(params: {
  rawPin: string;
  deviceId: string;
  deviceLabel?: string;
  nowMs?: number;
}): Promise<{
  record: PublicTrialPinRecord;
  trialToken: string;
  newlyActivated: boolean;
  serverNowMs: number;
}> {
  const nowMs = params.nowMs ?? Date.now();
  const normalizedPin = normalizeTrialPin(params.rawPin || '');
  if (!isValidTrialPinFormat(normalizedPin)) {
    throw new Error('INVALID_PIN_FORMAT');
  }

  const deviceId = (params.deviceId || '').trim().slice(0, 128);
  if (!deviceId || deviceId.length < 6) {
    throw new Error('DEVICE_ID_REQUIRED');
  }
  const deviceLabel = (params.deviceLabel || 'Technician Workstation').trim().slice(0, 120);

  const lookupHash = computePinLookupHash(normalizedPin);
  if (trialRedemptionLocks.has(lookupHash)) {
    throw new Error('REDEMPTION_IN_PROGRESS');
  }
  trialRedemptionLocks.add(lookupHash);

  try {
    ensureTrialStoreLoaded();
    const trialId = trialIdByLookupHash.get(lookupHash);
    if (!trialId) {
      throw new Error('PIN_NOT_FOUND');
    }
    const existing = trialsById.get(trialId);
    if (!existing) {
      throw new Error('PIN_NOT_FOUND');
    }
    const record = ensureBackfilledRecordHistory(existing);
    trialsById.set(trialId, record);

    const candidateHash = derivePinScryptDigest(normalizedPin, record.pinSalt);
    if (!constantTimeHexEquals(candidateHash, record.pinScryptHash)) {
      throw new Error('PIN_NOT_FOUND');
    }

    const status = computeEffectiveTrialStatus(record, nowMs);
    if (status === 'REVOKED') {
      throw new Error('TRIAL_REVOKED');
    }
    if (status === 'EXPIRED') {
      throw new Error(record.activatedAtMs === null ? 'UNUSED_TRIAL_EXPIRED' : 'TRIAL_EXPIRED');
    }

    // Strict Single-Device Limit (maxDevices = 1)
    if (record.boundDeviceId !== null && record.boundDeviceId !== deviceId) {
      throw new Error('DEVICE_LIMIT_REACHED');
    }

    const wasUnboundBeforeRedeem = record.boundDeviceId === null;
    let newlyActivated = false;
    if (record.activatedAtMs === null) {
      record.activatedAtMs = nowMs;
      record.expiresAtMs = nowMs + record.durationHours * 3_600_000;
      newlyActivated = true;
    }

    const resolvedDeviceLabel = deviceLabel || record.boundDeviceLabel || 'Technician Workstation';
    record.boundDeviceId = deviceId;
    record.boundDeviceLabel = resolvedDeviceLabel;
    record.lastSeenAtMs = nowMs;
    record.totalActivations = (record.totalActivations ?? 0) + 1;

    // Track cumulative unique devices bound across lifetime (preserved across device resets)
    const devHash = hashDeviceIdentifier(deviceId);
    const maskedDevId = maskDeviceIdentifier(deviceId) || 'dev_••••';
    const history = Array.isArray(record.deviceHistory) ? record.deviceHistory : [];
    const existingDeviceEntry = history.find((item) => item.deviceIdHash === devHash);
    let isNewUniqueDevice = false;
    if (existingDeviceEntry) {
      existingDeviceEntry.lastSeenAtMs = nowMs;
      existingDeviceEntry.activationCount += 1;
      existingDeviceEntry.deviceLabel = resolvedDeviceLabel;
    } else {
      isNewUniqueDevice = true;
      history.push({
        deviceIdHash: devHash,
        maskedDeviceId: maskedDevId,
        deviceLabel: resolvedDeviceLabel,
        firstSeenAtMs: nowMs,
        lastSeenAtMs: nowMs,
        activationCount: 1,
      });
    }
    record.deviceHistory = history;

    if (newlyActivated) {
      appendAuditEvent({
        eventType: 'ACTIVATED',
        record,
        timestampMs: nowMs,
        actor: resolvedDeviceLabel,
        deviceLabel: resolvedDeviceLabel,
        deviceId,
        detail: `Activated ${formatDurLabel(record.durationHours)} trial window & bound device #${history.length}`,
      });
    } else if (wasUnboundBeforeRedeem) {
      appendAuditEvent({
        eventType: 'DEVICE_BIND',
        record,
        timestampMs: nowMs,
        actor: resolvedDeviceLabel,
        deviceLabel: resolvedDeviceLabel,
        deviceId,
        detail: isNewUniqueDevice
          ? `Bound new workstation (unique device #${history.length}) after device reset`
          : `Re-bound previously seen workstation after device reset`,
      });
    } else {
      appendAuditEvent({
        eventType: 'REVERIFIED',
        record,
        timestampMs: nowMs,
        actor: resolvedDeviceLabel,
        deviceLabel: resolvedDeviceLabel,
        deviceId,
        detail: `Re-verified active session on bound workstation (login #${record.totalActivations})`,
      });
    }

    persistTrialStoreToDisk();

    const trialToken = signTrialSessionToken(record, nowMs);

    return {
      record: toPublicTrialPinRecord(record, nowMs),
      trialToken,
      newlyActivated,
      serverNowMs: nowMs,
    };
  } finally {
    trialRedemptionLocks.delete(lookupHash);
  }
}

export function verifyTrialBearerToken(
  token: string,
  deviceIdHeader?: string,
  nowMs = Date.now()
): {
  valid: boolean;
  record?: TrialPinRecord;
  publicRecord?: PublicTrialPinRecord;
  payload?: TrialTokenPayload;
  statusCode?: number;
  code?: string;
  error?: string;
} {
  ensureTrialStoreLoaded();
  const verified = verifyHmacToken<TrialTokenPayload>(token, 'vecl_trial_v1');
  if (!verified.valid || !verified.payload || verified.payload.kind !== 'trial_v1') {
    return {
      valid: false,
      statusCode: 401,
      code: 'INVALID_TOKEN',
      error: verified.reason || 'Invalid trial access token.',
    };
  }

  const payload = verified.payload;
  const record = trialsById.get(payload.trialId);
  if (!record) {
    return {
      valid: false,
      statusCode: 403,
      code: 'TRIAL_REVOKED',
      error: 'Trial PIN session is no longer valid.',
    };
  }

  const cleanHeaderDevice = (deviceIdHeader || '').trim();
  if (cleanHeaderDevice && record.boundDeviceId && cleanHeaderDevice !== record.boundDeviceId) {
    return {
      valid: false,
      statusCode: 403,
      code: 'DEVICE_LIMIT_REACHED',
      error: 'Single-device trial limit reached. This 8-digit trial PIN is bound to another workstation.',
    };
  }

  if (record.boundDeviceId && payload.deviceId !== record.boundDeviceId) {
    return {
      valid: false,
      statusCode: 403,
      code: 'DEVICE_LIMIT_REACHED',
      error: 'Trial device binding was reset or transferred. Re-enter the trial PIN to bind this workstation.',
    };
  }

  const status = computeEffectiveTrialStatus(record, nowMs);
  if (status === 'REVOKED') {
    return {
      valid: false,
      statusCode: 403,
      code: 'TRIAL_REVOKED',
      error: `Trial PIN access was revoked${record.revokeReason ? `: ${record.revokeReason}` : '.'}`,
    };
  }

  if (status === 'EXPIRED' || nowMs >= payload.expiresAtMs) {
    return {
      valid: false,
      statusCode: 403,
      code: 'TRIAL_EXPIRED',
      error:
        'Your trial PIN session has expired. AI tools and exports are locked. Enter a new 8-digit Trial PIN or Master Admin PIN to continue.',
    };
  }

  record.lastSeenAtMs = nowMs;
  return {
    valid: true,
    record,
    publicRecord: toPublicTrialPinRecord(record, nowMs),
    payload,
  };
}

export function getTrialStatusForDevice(
  deviceId: string,
  bearerToken?: string,
  nowMs = Date.now()
): {
  accessState: 'TRIAL_ACTIVE' | 'TRIAL_EXPIRED' | 'TRIAL_REVOKED' | 'UNLICENSED';
  hasAccess: boolean;
  trial: PublicTrialPinRecord | null;
  trialToken: string | null;
  serverNowMs: number;
} {
  ensureTrialStoreLoaded();
  const cleanDeviceId = (deviceId || '').trim();

  if (bearerToken && bearerToken.startsWith('vecl_trial_v1.')) {
    const check = verifyTrialBearerToken(bearerToken, cleanDeviceId || undefined, nowMs);
    if (check.valid && check.record) {
      return {
        accessState: 'TRIAL_ACTIVE',
        hasAccess: true,
        trial: toPublicTrialPinRecord(check.record, nowMs),
        trialToken: bearerToken,
        serverNowMs: nowMs,
      };
    }
    const payloadRec = check.payload ? trialsById.get(check.payload.trialId) : undefined;
    if (check.code === 'TRIAL_REVOKED') {
      return {
        accessState: 'TRIAL_REVOKED',
        hasAccess: false,
        trial: payloadRec ? toPublicTrialPinRecord(payloadRec, nowMs) : null,
        trialToken: null,
        serverNowMs: nowMs,
      };
    }
    if (check.code === 'TRIAL_EXPIRED') {
      return {
        accessState: 'TRIAL_EXPIRED',
        hasAccess: false,
        trial: payloadRec ? toPublicTrialPinRecord(payloadRec, nowMs) : null,
        trialToken: null,
        serverNowMs: nowMs,
      };
    }
  }

  if (!cleanDeviceId || cleanDeviceId.length < 6) {
    return {
      accessState: 'UNLICENSED',
      hasAccess: false,
      trial: null,
      trialToken: null,
      serverNowMs: nowMs,
    };
  }

  // Find latest activated trial bound strictly to this workstation device ID
  const boundTrials = Array.from(trialsById.values())
    .filter((t) => t.boundDeviceId === cleanDeviceId && t.activatedAtMs !== null)
    .sort((a, b) => (b.activatedAtMs ?? 0) - (a.activatedAtMs ?? 0));

  if (boundTrials.length === 0) {
    return {
      accessState: 'UNLICENSED',
      hasAccess: false,
      trial: null,
      trialToken: null,
      serverNowMs: nowMs,
    };
  }

  const latest = boundTrials[0];
  const status = computeEffectiveTrialStatus(latest, nowMs);
  if (status === 'ACTIVE') {
    return {
      accessState: 'TRIAL_ACTIVE',
      // Security: Never mint or return a signed Bearer token from a bare deviceId lookup.
      // Active session recovery requires presenting a valid Bearer token or HttpOnly session cookie.
      hasAccess: false,
      trial: toPublicTrialPinRecord(latest, nowMs),
      trialToken: null,
      serverNowMs: nowMs,
    };
  }
  if (status === 'REVOKED') {
    return {
      accessState: 'TRIAL_REVOKED',
      hasAccess: false,
      trial: toPublicTrialPinRecord(latest, nowMs),
      trialToken: null,
      serverNowMs: nowMs,
    };
  }

  return {
    accessState: 'TRIAL_EXPIRED',
    hasAccess: false,
    trial: toPublicTrialPinRecord(latest, nowMs),
    trialToken: null,
    serverNowMs: nowMs,
  };
}

export function listAllTrialPinsForAdmin(nowMs = Date.now()): PublicTrialPinRecord[] {
  ensureTrialStoreLoaded();
  return Array.from(trialsById.values())
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .map((rec) => toPublicTrialPinRecord(rec, nowMs));
}

export function getAdminTrialAuditSnapshot(nowMs = Date.now()): {
  trials: PublicTrialPinRecord[];
  auditLog: TrialAuditEvent[];
  summary: AdminTrialAuditSummary;
  serverNowMs: number;
} {
  ensureTrialStoreLoaded();
  const trials = listAllTrialPinsForAdmin(nowMs);
  let activePins = 0;
  let unusedPins = 0;
  let expiredPins = 0;
  let revokedPins = 0;
  let expiringSoonPins = 0;
  let totalUniqueDevicesUsed = 0;
  let totalActivations = 0;

  for (const t of trials) {
    if (t.status === 'ACTIVE') {
      activePins += 1;
      if (
        t.remainingSeconds !== null &&
        t.remainingSeconds > 0 &&
        t.remainingSeconds < LOW_TIME_WARNING_THRESHOLD_SEC
      ) {
        expiringSoonPins += 1;
      }
    } else if (t.status === 'UNUSED') {
      unusedPins += 1;
    } else if (t.status === 'EXPIRED') {
      expiredPins += 1;
    } else if (t.status === 'REVOKED') {
      revokedPins += 1;
    }
    totalUniqueDevicesUsed += t.totalDevicesUsed;
    totalActivations += t.totalActivations;
  }

  return {
    trials,
    auditLog: auditEvents.slice().sort((a, b) => b.timestampMs - a.timestampMs),
    summary: {
      totalPins: trials.length,
      activePins,
      unusedPins,
      expiredPins,
      revokedPins,
      expiringSoonPins,
      totalUniqueDevicesUsed,
      totalActivations,
    },
    serverNowMs: nowMs,
  };
}

export function setTrialPinRevocation(params: {
  trialId: string;
  revoked: boolean;
  reason?: string;
  actor?: string;
  nowMs?: number;
}): PublicTrialPinRecord {
  ensureTrialStoreLoaded();
  const record = trialsById.get(params.trialId);
  if (!record) {
    throw new Error('TRIAL_NOT_FOUND');
  }
  const nowMs = params.nowMs ?? Date.now();
  if (params.revoked) {
    record.revokedAtMs = nowMs;
    record.revokeReason = (params.reason || 'Revoked by administrator').trim().slice(0, 200);
    appendAuditEvent({
      eventType: 'REVOKED',
      record,
      timestampMs: nowMs,
      actor: params.actor || 'Master Admin',
      deviceLabel: record.boundDeviceLabel,
      deviceId: record.boundDeviceId,
      detail: record.revokeReason,
    });
  } else {
    record.revokedAtMs = null;
    record.revokeReason = null;
    appendAuditEvent({
      eventType: 'RESTORED',
      record,
      timestampMs: nowMs,
      actor: params.actor || 'Master Admin',
      deviceLabel: record.boundDeviceLabel,
      deviceId: record.boundDeviceId,
      detail: 'Trial PIN access restored by administrator',
    });
  }
  persistTrialStoreToDisk();
  return toPublicTrialPinRecord(record, nowMs);
}

export function resetTrialPinDevice(
  trialId: string,
  nowMs = Date.now(),
  actor?: string
): PublicTrialPinRecord {
  ensureTrialStoreLoaded();
  const record = trialsById.get(trialId);
  if (!record) {
    throw new Error('TRIAL_NOT_FOUND');
  }
  const prevDeviceLabel = record.boundDeviceLabel;
  const prevDeviceId = record.boundDeviceId;
  record.boundDeviceId = null;
  record.boundDeviceLabel = null;
  appendAuditEvent({
    eventType: 'DEVICE_RESET',
    record,
    timestampMs: nowMs,
    actor: actor || 'Master Admin',
    deviceLabel: prevDeviceLabel,
    deviceId: prevDeviceId,
    detail: `Cleared single-device lock${prevDeviceLabel ? ` from ${prevDeviceLabel}` : ''}; cumulative history retained`,
  });
  persistTrialStoreToDisk();
  return toPublicTrialPinRecord(record, nowMs);
}

// ============================================================================
// HISTORICAL AUDIT & TRIAL PIN CSV RESTORATION
// ============================================================================

const VALID_AUDIT_EVENT_TYPES = new Set<TrialAuditEventType>([
  'GENERATED',
  'ACTIVATED',
  'DEVICE_BIND',
  'REVERIFIED',
  'DEVICE_RESET',
  'REVOKED',
  'RESTORED',
  'IMPORTED',
]);

function stripCsvFormulaGuard(raw: string): string {
  const clean = raw.replace(/\0/g, '').trim();
  if (/^'[=+\-@\t]/.test(clean)) {
    return clean.slice(1);
  }
  return clean;
}

function parseRfc4180CsvRows(rawCsv: string): string[][] {
  const text = rawCsv.charCodeAt(0) === 0xfeff ? rawCsv.slice(1) : rawCsv;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      if (field.length === 0) {
        inQuotes = true;
      } else {
        field += ch;
      }
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }

    if (rows.length > MAX_IMPORT_CSV_ROWS) {
      throw new Error(`INVALID_CSV_SIZE: Exceeds maximum allowed ${MAX_IMPORT_CSV_ROWS} CSV rows.`);
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseDurationHoursFromCsv(raw: string): TrialDurationHours | null {
  const clean = stripCsvFormulaGuard(raw).toLowerCase();
  if (!clean) return null;
  if (clean === '3' || clean === '3h' || clean === '3 hours' || clean === '3 hour') return 3;
  if (clean === '4' || clean === '4h' || clean === '4 hours' || clean === '4 hour') return 4;
  if (clean === '5' || clean === '5h' || clean === '5 hours' || clean === '5 hour') return 5;
  if (clean === '6' || clean === '6h' || clean === '6 hours' || clean === '6 hour') return 6;
  if (clean === '720' || clean === '30d' || clean === '30 days' || clean === '30 day') return 720;
  if (clean === '2160' || clean === '3m' || clean === '3 months' || clean === '3 month') return 2160;
  if (clean === '4320' || clean === '6m' || clean === '6 months' || clean === '6 month') return 4320;
  if (clean === '8760' || clean === '1y' || clean === '1 year' || clean === '12 months') return 8760;
  const numeric = Number(clean.replace(/[^\d]/g, ''));
  if (Number.isInteger(numeric) && VALID_TRIAL_DURATIONS.has(numeric)) {
    return numeric as TrialDurationHours;
  }
  return null;
}

function parseOptionalIsoTimestampMs(raw: string): number | null {
  const clean = stripCsvFormulaGuard(raw);
  if (
    !clean ||
    clean.toLowerCase() === 'not activated' ||
    clean.toLowerCase() === 'pending' ||
    clean.toLowerCase() === 'n/a'
  ) {
    return null;
  }
  const ms = Date.parse(clean);
  return Number.isFinite(ms) ? ms : null;
}

function normalizeImportedTrialId(raw: string): string | null {
  const clean = stripCsvFormulaGuard(raw).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return clean.length >= 4 ? clean : null;
}

function normalizeImportedMaskedPin(raw: string): string {
  const clean = stripCsvFormulaGuard(raw);
  const digits = clean.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `••••-${digits.slice(-4)}`;
  }
  return '••••-0000';
}

function normalizeImportedMaskedDeviceId(raw: string): string | null {
  const clean = stripCsvFormulaGuard(raw);
  if (!clean) return null;
  const tail = clean.replace(/[^a-zA-Z0-9]/g, '').slice(-4);
  if (!tail) return null;
  return `dev_•••${tail}`;
}

export interface AuditCsvImportResult {
  importedEvents: number;
  skippedDuplicateEvents: number;
  importedTrials: number;
  skippedExistingTrials: number;
  skippedInvalidRows: number;
  snapshot: ReturnType<typeof getAdminTrialAuditSnapshot>;
}

export function importHistoricalAuditCsv(params: {
  csvContent: string;
  filename?: string;
  actor?: string;
  nowMs?: number;
}): AuditCsvImportResult {
  ensureTrialStoreLoaded();
  if (typeof params.csvContent !== 'string' || !params.csvContent.trim()) {
    throw new Error('INVALID_CSV_FORMAT: Uploaded CSV file is empty.');
  }
  if (Buffer.byteLength(params.csvContent, 'utf8') > MAX_IMPORT_CSV_BYTES) {
    throw new Error('INVALID_CSV_SIZE: Uploaded CSV exceeds the 1 MB limit.');
  }

  const nowMs = params.nowMs ?? Date.now();
  const rows = parseRfc4180CsvRows(params.csvContent);
  let activeSection: 'NONE' | 'AUDIT_EVENTS' | 'TRIAL_SUMMARY' = 'NONE';
  let headerMap: Record<string, number> = {};
  let recognizedAtLeastOneSection = false;

  const existingEventIds = new Set<string>(auditEvents.map((e) => e.eventId));
  let importedEvents = 0;
  let skippedDuplicateEvents = 0;
  let importedTrials = 0;
  let skippedExistingTrials = 0;
  let skippedInvalidRows = 0;

  const getCell = (r: string[], colName: string): string => {
    const idx = headerMap[colName.toLowerCase()];
    return idx !== undefined && idx < r.length ? r[idx] : '';
  };

  for (const rawRow of rows) {
    const trimmedCols = rawRow.map((c) => c.trim());
    if (trimmedCols.every((c) => c.length === 0)) {
      continue;
    }

    const firstCellUpper = stripCsvFormulaGuard(trimmedCols[0]).toUpperCase();
    if (firstCellUpper.startsWith('VIRTUAL ECU LAB')) {
      continue;
    }
    if (firstCellUpper === 'SECTION 1: SECURITY AUDIT EVENT LOG') {
      activeSection = 'AUDIT_EVENTS';
      headerMap = {};
      continue;
    }
    if (firstCellUpper === 'SECTION 2: TRIAL PIN & USAGE SUMMARY') {
      activeSection = 'TRIAL_SUMMARY';
      headerMap = {};
      continue;
    }

    const lowerCols = trimmedCols.map((c) => stripCsvFormulaGuard(c).toLowerCase());
    if (
      lowerCols.includes('timestamp (iso)') &&
      lowerCols.includes('event id') &&
      lowerCols.includes('event type') &&
      lowerCols.includes('trial id')
    ) {
      activeSection = 'AUDIT_EVENTS';
      headerMap = {};
      lowerCols.forEach((col, idx) => {
        if (col) headerMap[col] = idx;
      });
      recognizedAtLeastOneSection = true;
      continue;
    }

    if (
      lowerCols.includes('trial id') &&
      lowerCols.includes('masked pin') &&
      lowerCols.includes('status') &&
      lowerCols.includes('created at (iso)')
    ) {
      activeSection = 'TRIAL_SUMMARY';
      headerMap = {};
      lowerCols.forEach((col, idx) => {
        if (col) headerMap[col] = idx;
      });
      recognizedAtLeastOneSection = true;
      continue;
    }

    if (activeSection === 'NONE' || Object.keys(headerMap).length === 0) {
      continue;
    }

    if (activeSection === 'AUDIT_EVENTS') {
      const timestampMs = parseOptionalIsoTimestampMs(getCell(trimmedCols, 'timestamp (iso)'));
      const rawEventId = stripCsvFormulaGuard(getCell(trimmedCols, 'event id'))
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 64);
      const rawEventType = stripCsvFormulaGuard(getCell(trimmedCols, 'event type')).toUpperCase();
      const trialId = normalizeImportedTrialId(getCell(trimmedCols, 'trial id'));
      const durationHours = parseDurationHoursFromCsv(getCell(trimmedCols, 'duration window'));

      if (
        timestampMs === null ||
        !rawEventId ||
        !VALID_AUDIT_EVENT_TYPES.has(rawEventType as TrialAuditEventType) ||
        !trialId ||
        durationHours === null
      ) {
        skippedInvalidRows += 1;
        continue;
      }

      if (existingEventIds.has(rawEventId)) {
        skippedDuplicateEvents += 1;
        continue;
      }

      existingEventIds.add(rawEventId);
      auditEvents.push({
        eventId: rawEventId,
        timestampMs,
        eventType: rawEventType as TrialAuditEventType,
        trialId,
        maskedPin: normalizeImportedMaskedPin(getCell(trimmedCols, 'masked pin')),
        durationHours,
        actor: sanitizeAuditActor(stripCsvFormulaGuard(getCell(trimmedCols, 'actor')), 'Admin'),
        deviceLabel:
          stripCsvFormulaGuard(getCell(trimmedCols, 'workstation label')).slice(0, 120) || null,
        maskedDeviceId: normalizeImportedMaskedDeviceId(
          getCell(trimmedCols, 'masked device id')
        ),
        detail: stripCsvFormulaGuard(getCell(trimmedCols, 'detail')).slice(0, 220),
      });
      importedEvents += 1;
      continue;
    }

    if (activeSection === 'TRIAL_SUMMARY') {
      const trialId = normalizeImportedTrialId(getCell(trimmedCols, 'trial id'));
      const durationHours = parseDurationHoursFromCsv(getCell(trimmedCols, 'duration window'));
      const createdAtMs = parseOptionalIsoTimestampMs(getCell(trimmedCols, 'created at (iso)'));
      const statusStr = stripCsvFormulaGuard(getCell(trimmedCols, 'status')).toUpperCase();

      if (!trialId || durationHours === null || createdAtMs === null) {
        skippedInvalidRows += 1;
        continue;
      }

      // Preserve live credentials & bindings when a PIN already exists in the active store
      if (trialsById.has(trialId)) {
        skippedExistingTrials += 1;
        continue;
      }

      const activatedAtMs = parseOptionalIsoTimestampMs(getCell(trimmedCols, 'activated at (iso)'));
      const expiryIsoMs = parseOptionalIsoTimestampMs(
        getCell(trimmedCols, 'expires / pickup by (iso)')
      );
      const rawBoundLabel = stripCsvFormulaGuard(getCell(trimmedCols, 'bound workstation label'));
      const boundDeviceLabel =
        rawBoundLabel && rawBoundLabel.toLowerCase() !== 'unbound'
          ? rawBoundLabel.slice(0, 120)
          : null;
      const uniqueDevicesCount = Math.max(
        0,
        Math.min(50, Math.floor(Number(stripCsvFormulaGuard(getCell(trimmedCols, 'unique devices used'))) || 0))
      );
      const totalActivationsCount = Math.max(
        uniqueDevicesCount,
        Math.floor(Number(stripCsvFormulaGuard(getCell(trimmedCols, 'total activations'))) || 0)
      );
      const revokeReason =
        stripCsvFormulaGuard(getCell(trimmedCols, 'revoke reason')).slice(0, 200) || null;
      const notes = stripCsvFormulaGuard(getCell(trimmedCols, 'notes')).slice(0, 200);

      const isRevoked = statusStr === 'REVOKED';
      const unusedExpiresAtMs =
        activatedAtMs === null && expiryIsoMs !== null
          ? expiryIsoMs
          : createdAtMs + DEFAULT_UNUSED_EXPIRY_HOURS * 3_600_000;
      const expiresAtMs =
        activatedAtMs !== null
          ? expiryIsoMs ?? activatedAtMs + durationHours * 3_600_000
          : null;

      // Historical audit-only entries use a non-SHA256 placeholder hash and are never added to trialIdByLookupHash
      const syntheticHistory: TrialDeviceUsageRecord[] = [];
      for (let d = 0; d < uniqueDevicesCount; d += 1) {
        const isLatest = d === 0;
        syntheticHistory.push({
          deviceIdHash: `imported_hist_${trialId}_${d}`,
          maskedDeviceId: `dev_•••H${String(d + 1).padStart(3, '0')}`,
          deviceLabel:
            isLatest && boundDeviceLabel ? boundDeviceLabel : `Archived Workstation #${d + 1}`,
          firstSeenAtMs: activatedAtMs ?? createdAtMs,
          lastSeenAtMs: expiresAtMs ?? activatedAtMs ?? createdAtMs,
          activationCount:
            isLatest && totalActivationsCount >= uniqueDevicesCount
              ? totalActivationsCount - (uniqueDevicesCount - 1)
              : 1,
        });
      }

      const restoredRecord: TrialPinRecord = {
        trialId,
        maskedPin: normalizeImportedMaskedPin(getCell(trimmedCols, 'masked pin')),
        pinLookupHash: `imported:${trialId}`,
        pinSalt: 'imported_audit_only',
        pinScryptHash: '',
        durationHours,
        maxDevices: 1,
        unusedExpiryHours: Math.max(
          1,
          Math.round((unusedExpiresAtMs - createdAtMs) / 3_600_000) || DEFAULT_UNUSED_EXPIRY_HOURS
        ),
        createdAtMs,
        unusedExpiresAtMs,
        activatedAtMs,
        expiresAtMs,
        revokedAtMs: isRevoked ? (expiresAtMs ?? activatedAtMs ?? createdAtMs) : null,
        revokeReason: isRevoked ? revokeReason || 'Restored as revoked from audit CSV' : null,
        boundDeviceId:
          boundDeviceLabel && !isRevoked && statusStr === 'ACTIVE'
            ? `imported_hist_${trialId}_0`
            : null,
        boundDeviceLabel,
        lastSeenAtMs: activatedAtMs ?? createdAtMs,
        notes,
        deviceHistory: syntheticHistory,
        totalActivations: totalActivationsCount,
      };

      trialsById.set(trialId, restoredRecord);
      importedTrials += 1;
    }
  }

  if (!recognizedAtLeastOneSection) {
    throw new Error(
      'INVALID_CSV_FORMAT: Uploaded file does not contain Virtual ECU Lab Security Audit Log or Trial PIN Summary columns.'
    );
  }

  if (importedEvents > 0 || importedTrials > 0) {
    const cleanFilename = (params.filename || 'audit-log.csv')
      .replace(/[\r\n\t]+/g, ' ')
      .trim()
      .slice(0, 80);
    auditEvents.push({
      eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
      timestampMs: nowMs,
      eventType: 'IMPORTED',
      trialId: 'audit_restore',
      maskedPin: '••••-CSV',
      durationHours: 4,
      actor: sanitizeAuditActor(params.actor, 'Master Admin'),
      deviceLabel: null,
      maskedDeviceId: null,
      detail: `Restored ${importedEvents} audit event(s) and ${importedTrials} historical PIN record(s) from ${cleanFilename}`,
    });
  }

  auditEvents.sort((a, b) => b.timestampMs - a.timestampMs);
  if (auditEvents.length > MAX_AUDIT_LOG_EVENTS) {
    auditEvents.length = MAX_AUDIT_LOG_EVENTS;
  }

  if (importedEvents > 0 || importedTrials > 0) {
    persistTrialStoreToDisk();
  }

  return {
    importedEvents,
    skippedDuplicateEvents,
    importedTrials,
    skippedExistingTrials,
    skippedInvalidRows,
    snapshot: getAdminTrialAuditSnapshot(nowMs),
  };
}
