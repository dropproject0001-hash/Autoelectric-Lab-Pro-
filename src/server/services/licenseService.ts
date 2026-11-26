/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Response } from 'express';
import {
  type AuthenticatedRequest,
  type VerifiedFirebaseUser,
} from './firebaseAuthMiddleware';

export type LicenseDurationPlan =
  | 'TRIAL_1D'
  | 'SHORT_7D'
  | 'MONTHLY_30D'
  | 'QUARTERLY_90D'
  | 'SEMI_ANNUAL_180D'
  | 'ANNUAL_365D'
  | 'CUSTOM';

export type LicenseStatus = 'UNUSED' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export interface RegisteredDeviceEntry {
  deviceId: string;
  deviceLabel: string;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
}

export interface LicenseRecord {
  licenseId: string;
  codeHash: string;
  maskedCode: string;
  plan: LicenseDurationPlan;
  durationDays: number;
  maxDevices: number;
  unusedExpiryDays: number;
  createdAtMs: number;
  unusedExpiresAtMs: number;
  activatedAtMs: number | null;
  expiresAtMs: number | null;
  revokedAtMs: number | null;
  revokeReason: string | null;
  assignedUid: string | null;
  assignedEmail: string | null;
  devices: RegisteredDeviceEntry[];
  notes: string;
  createdByAdminUid: string;
  extensionHistory: Array<{
    addedDays: number;
    extendedAtMs: number;
    adminUid: string;
  }>;
}

export interface OfflineLeasePayload {
  licenseId: string;
  uid: string;
  deviceId: string;
  issuedAtMs: number;
  leaseExpiresAtMs: number;
  licenseExpiresAtMs: number;
}

const PLAN_DAYS_MAP: Record<Exclude<LicenseDurationPlan, 'CUSTOM'>, number> = {
  TRIAL_1D: 1,
  SHORT_7D: 7,
  MONTHLY_30D: 30,
  QUARTERLY_90D: 90,
  SEMI_ANNUAL_180D: 180,
  ANNUAL_365D: 365,
};

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Unambiguous uppercase alphanumeric
const DEFAULT_MAX_DEVICES = 2;
const DEFAULT_UNUSED_EXPIRY_DAYS = 90;
const OFFLINE_LEASE_TTL_MS = 72 * 60 * 60 * 1000; // 72-hour signed offline lease

// Durable repository backed by atomic disk persistence + per-codeHash locks
const licensesById = new Map<string, LicenseRecord>();
const licenseIdByCodeHash = new Map<string, string>();
const activeLicenseIdByUid = new Map<string, string>();
const redemptionLocks = new Set<string>();

// Brute-force redemption rate limiting (max 8 attempts / 5 min per UID or IP)
const redeemAttemptsByKey = new Map<string, number[]>();
const REDEEM_WINDOW_MS = 5 * 60 * 1000;
const REDEEM_MAX_ATTEMPTS = 8;

// Verified Admin UID registry:
// Anchored strictly to verified Firebase UID via VECL_ADMIN_UIDS env var (no hardcoded UID or email bootstrap).
const verifiedAdminUids = new Set<string>();
let requireLicenseForAllUsers = false;

interface DurableLicenseStorePayload {
  schemaVersion: 1;
  updatedAtMs: number;
  licenses: LicenseRecord[];
  activeLicenseIdByUid: Record<string, string>;
  verifiedAdminUids: string[];
}

let customStoreFilePath: string | null = null;
let cachedGeneratedHmacSecret: string | null = null;
let isStoreLoaded = false;

function resolveDurableDataDir(): string {
  const envDir = (process.env.VECL_DATA_DIR || '').trim();
  if (envDir) {
    return path.resolve(envDir);
  }
  return path.resolve(process.cwd(), '.data');
}

function resolveLicenseStoreFilePath(): string {
  if (customStoreFilePath) {
    return customStoreFilePath;
  }
  if (process.env.VECL_LICENSE_STORE_PATH && process.env.VECL_LICENSE_STORE_PATH.trim()) {
    return path.resolve(process.env.VECL_LICENSE_STORE_PATH.trim());
  }
  return path.join(resolveDurableDataDir(), 'vecl-licenses.store.json');
}

function resolveHmacKeyFilePath(): string {
  const storeDir = path.dirname(resolveLicenseStoreFilePath());
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
  if (cachedGeneratedHmacSecret) {
    return cachedGeneratedHmacSecret;
  }
  try {
    const keyPath = resolveHmacKeyFilePath();
    if (fs.existsSync(keyPath)) {
      const existing = fs.readFileSync(keyPath, 'utf8').trim();
      if (existing.length >= 64) {
        cachedGeneratedHmacSecret = existing;
        return existing;
      }
    }
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    const generated = crypto.randomBytes(32).toString('hex');
    const tmpKeyPath = `${keyPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpKeyPath, generated, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpKeyPath, keyPath);
    cachedGeneratedHmacSecret = generated;
    return generated;
  } catch {
    // Ephemeral fallback if filesystem is read-only
    if (!cachedGeneratedHmacSecret) {
      cachedGeneratedHmacSecret = crypto.randomBytes(32).toString('hex');
    }
    return cachedGeneratedHmacSecret;
  }
}

function persistLicenseStoreToDisk(): void {
  try {
    const filePath = resolveLicenseStoreFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const payload: DurableLicenseStorePayload = {
      schemaVersion: 1,
      updatedAtMs: Date.now(),
      licenses: Array.from(licensesById.values()),
      activeLicenseIdByUid: Object.fromEntries(activeLicenseIdByUid.entries()),
      verifiedAdminUids: Array.from(verifiedAdminUids.values()),
    };
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.warn('[LicenseService] Durable store write warning:', err);
  }
}

export function reloadLicenseStoreFromDisk(): {
  loadedLicenses: number;
  storeFilePath: string;
} {
  const filePath = resolveLicenseStoreFilePath();
  licensesById.clear();
  licenseIdByCodeHash.clear();
  activeLicenseIdByUid.clear();
  isStoreLoaded = true;

  if (!fs.existsSync(filePath)) {
    return { loadedLicenses: 0, storeFilePath: filePath };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DurableLicenseStorePayload>;
    if (Array.isArray(parsed.licenses)) {
      for (const rec of parsed.licenses) {
        if (rec && typeof rec.licenseId === 'string' && typeof rec.codeHash === 'string') {
          licensesById.set(rec.licenseId, {
            ...rec,
            devices: Array.isArray(rec.devices) ? rec.devices.map((d) => ({ ...d })) : [],
            extensionHistory: Array.isArray(rec.extensionHistory)
              ? rec.extensionHistory.map((e) => ({ ...e }))
              : [],
          });
          licenseIdByCodeHash.set(rec.codeHash, rec.licenseId);
        }
      }
    }
    if (parsed.activeLicenseIdByUid && typeof parsed.activeLicenseIdByUid === 'object') {
      for (const [uid, licId] of Object.entries(parsed.activeLicenseIdByUid)) {
        if (typeof uid === 'string' && typeof licId === 'string' && licensesById.has(licId)) {
          activeLicenseIdByUid.set(uid, licId);
        }
      }
    }
    if (Array.isArray(parsed.verifiedAdminUids)) {
      for (const uid of parsed.verifiedAdminUids) {
        if (typeof uid === 'string' && uid.trim()) {
          verifiedAdminUids.add(uid.trim());
        }
      }
    }
  } catch (err) {
    console.warn('[LicenseService] Failed to parse durable license store:', err);
  }

  return { loadedLicenses: licensesById.size, storeFilePath: filePath };
}

function ensureStoreLoaded(): void {
  if (!isStoreLoaded) {
    reloadLicenseStoreFromDisk();
  }
}

export function setLicenseStoreFilePathForTests(filePath: string | null): void {
  customStoreFilePath = filePath;
  cachedGeneratedHmacSecret = null;
  isStoreLoaded = false;
}

export function setAdminUidForTests(uid: string | null): void {
  ensureStoreLoaded();
  verifiedAdminUids.clear();
  if (uid && uid.trim()) {
    verifiedAdminUids.add(uid.trim());
  }
  persistLicenseStoreToDisk();
}

export function setRequireLicenseForAllUsers(enforce: boolean): void {
  requireLicenseForAllUsers = enforce;
}

export function resetLicenseStoreForTests(): void {
  licensesById.clear();
  licenseIdByCodeHash.clear();
  activeLicenseIdByUid.clear();
  redemptionLocks.clear();
  redeemAttemptsByKey.clear();
  verifiedAdminUids.clear();
  requireLicenseForAllUsers = false;
  isStoreLoaded = true;
  try {
    const filePath = resolveLicenseStoreFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

export function isVerifiedAdminUser(user: VerifiedFirebaseUser | undefined | null): boolean {
  ensureStoreLoaded();
  if (!user || !user.uid || !user.emailVerified) return false;

  const envUids = (process.env.VECL_ADMIN_UIDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const uid of envUids) {
    verifiedAdminUids.add(uid);
  }

  if (verifiedAdminUids.has(user.uid)) {
    return true;
  }

  return false;
}

export function normalizeLicenseCode(rawCode: string): string {
  const cleaned = rawCode
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
  if (cleaned.startsWith('VECL') && cleaned.length === 16) {
    const body = cleaned.slice(4);
    return `VECL-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
  }
  return rawCode.toUpperCase().trim();
}

export function isValidLicenseCodeFormat(code: string): boolean {
  const normalized = normalizeLicenseCode(code);
  return /^VECL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized);
}

export function hashLicenseCode(rawCode: string): string {
  const normalized = normalizeLicenseCode(rawCode);
  return crypto.createHash('sha256').update(`vecl:license:v1:${normalized}`).digest('hex');
}

export function maskLicenseCode(rawCode: string): string {
  const normalized = normalizeLicenseCode(rawCode);
  const parts = normalized.split('-');
  if (parts.length !== 4) return 'VECL-****-****-****';
  return `VECL-${parts[1]}-****-${parts[3]}`;
}

export function generatePlainLicenseCode(): string {
  const segments: string[] = ['VECL'];
  for (let s = 0; s < 3; s++) {
    let seg = '';
    const bytes = crypto.randomBytes(4);
    for (let i = 0; i < 4; i++) {
      seg += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    segments.push(seg);
  }
  return segments.join('-');
}

export function computeEffectiveLicenseStatus(
  record: LicenseRecord,
  nowMs = Date.now()
): LicenseStatus {
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

export function resolvePlanDurationDays(
  plan: LicenseDurationPlan,
  customDays?: number
): number {
  if (plan === 'CUSTOM') {
    const parsed = Number(customDays);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 3650) {
      throw new Error('Custom duration must be between 1 and 3650 days.');
    }
    return Math.floor(parsed);
  }
  const days = PLAN_DAYS_MAP[plan];
  if (!days) {
    throw new Error(`Unsupported license duration plan: ${plan}`);
  }
  return days;
}

export function createLicenseCodeRecord(params: {
  adminUser: VerifiedFirebaseUser;
  plan: LicenseDurationPlan;
  customDays?: number;
  unusedExpiryDays?: number;
  maxDevices?: number;
  notes?: string;
  nowMs?: number;
}): { plainCode: string; record: LicenseRecord } {
  if (!isVerifiedAdminUser(params.adminUser)) {
    throw new Error('FORBIDDEN_ADMIN_ONLY');
  }

  const nowMs = params.nowMs ?? Date.now();
  const durationDays = resolvePlanDurationDays(params.plan, params.customDays);
  const unusedExpiryDays =
    typeof params.unusedExpiryDays === 'number' &&
    Number.isFinite(params.unusedExpiryDays) &&
    params.unusedExpiryDays >= 1 &&
    params.unusedExpiryDays <= 3650
      ? Math.floor(params.unusedExpiryDays)
      : DEFAULT_UNUSED_EXPIRY_DAYS;

  const maxDevices =
    typeof params.maxDevices === 'number' &&
    params.maxDevices >= 1 &&
    params.maxDevices <= 5
      ? Math.floor(params.maxDevices)
      : DEFAULT_MAX_DEVICES;

  let plainCode = generatePlainLicenseCode();
  let codeHash = hashLicenseCode(plainCode);
  while (licenseIdByCodeHash.has(codeHash)) {
    plainCode = generatePlainLicenseCode();
    codeHash = hashLicenseCode(plainCode);
  }

  const licenseId = `lic_${crypto.randomBytes(8).toString('hex')}`;
  const record: LicenseRecord = {
    licenseId,
    codeHash,
    maskedCode: maskLicenseCode(plainCode),
    plan: params.plan,
    durationDays,
    maxDevices,
    unusedExpiryDays,
    createdAtMs: nowMs,
    unusedExpiresAtMs: nowMs + unusedExpiryDays * 86_400_000,
    activatedAtMs: null,
    expiresAtMs: null,
    revokedAtMs: null,
    revokeReason: null,
    assignedUid: null,
    assignedEmail: null,
    devices: [],
    notes: typeof params.notes === 'string' ? params.notes.trim().slice(0, 240) : '',
    createdByAdminUid: params.adminUser.uid,
    extensionHistory: [],
  };

  licensesById.set(licenseId, record);
  licenseIdByCodeHash.set(codeHash, licenseId);
  persistLicenseStoreToDisk();

  return { plainCode, record };
}

export function signOfflineLeaseToken(payload: OfflineLeasePayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getHmacSecret())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifyOfflineLeaseToken(
  token: string,
  expectedUid: string,
  expectedDeviceId: string,
  nowMs = Date.now()
): { valid: boolean; payload?: OfflineLeasePayload; reason?: string } {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, reason: 'Malformed lease token' };
  }
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'Malformed lease token' };
  }
  const [payloadB64, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getHmacSecret())
    .update(payloadB64)
    .digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, reason: 'Invalid lease cryptographic signature' };
  }
  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as OfflineLeasePayload;
    if (payload.uid !== expectedUid) {
      return { valid: false, reason: 'Lease UID mismatch' };
    }
    if (payload.deviceId !== expectedDeviceId) {
      return { valid: false, reason: 'Lease device mismatch' };
    }
    if (nowMs >= payload.leaseExpiresAtMs || nowMs >= payload.licenseExpiresAtMs) {
      return { valid: false, reason: 'Offline lease or license has expired' };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'Unparseable lease payload' };
  }
}

export function checkRedeemRateLimit(key: string, nowMs = Date.now()): {
  allowed: boolean;
  retryAfterSec?: number;
} {
  const windowStart = nowMs - REDEEM_WINDOW_MS;
  const list = (redeemAttemptsByKey.get(key) || []).filter((t) => t > windowStart);
  if (list.length >= REDEEM_MAX_ATTEMPTS) {
    const oldest = list[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + REDEEM_WINDOW_MS - nowMs) / 1000));
    return { allowed: false, retryAfterSec };
  }
  list.push(nowMs);
  redeemAttemptsByKey.set(key, list);
  return { allowed: true };
}

export async function redeemLicenseCode(params: {
  user: VerifiedFirebaseUser;
  rawCode: string;
  deviceId: string;
  deviceLabel?: string;
  nowMs?: number;
}): Promise<{
  record: LicenseRecord;
  status: LicenseStatus;
  leaseToken: string;
  newlyActivated: boolean;
}> {
  const nowMs = params.nowMs ?? Date.now();
  const normalizedCode = normalizeLicenseCode(params.rawCode);
  if (!isValidLicenseCodeFormat(normalizedCode)) {
    throw new Error('INVALID_CODE_FORMAT');
  }

  const deviceId = (params.deviceId || '').trim().slice(0, 128);
  if (!deviceId) {
    throw new Error('DEVICE_ID_REQUIRED');
  }
  const deviceLabel = (params.deviceLabel || 'Technician Workstation').trim().slice(0, 120);

  const codeHash = hashLicenseCode(normalizedCode);

  // Atomic per-code lock to prevent simultaneous race redemption
  if (redemptionLocks.has(codeHash)) {
    throw new Error('REDEMPTION_IN_PROGRESS');
  }
  redemptionLocks.add(codeHash);

  try {
    ensureStoreLoaded();
    const licenseId = licenseIdByCodeHash.get(codeHash);
    if (!licenseId) {
      throw new Error('CODE_NOT_FOUND');
    }
    const record = licensesById.get(licenseId);
    if (!record) {
      throw new Error('CODE_NOT_FOUND');
    }

    const currentStatus = computeEffectiveLicenseStatus(record, nowMs);
    if (currentStatus === 'REVOKED') {
      throw new Error('LICENSE_REVOKED');
    }
    if (currentStatus === 'EXPIRED') {
      throw new Error(
        record.activatedAtMs === null ? 'UNUSED_CODE_EXPIRED' : 'LICENSE_EXPIRED'
      );
    }

    // Check account ownership (1 code = 1 Google account)
    if (record.assignedUid !== null && record.assignedUid !== params.user.uid) {
      throw new Error('CODE_ALREADY_ASSIGNED_TO_ANOTHER_USER');
    }

    let newlyActivated = false;
    if (record.activatedAtMs === null) {
      record.activatedAtMs = nowMs;
      record.expiresAtMs = nowMs + record.durationDays * 86_400_000;
      record.assignedUid = params.user.uid;
      record.assignedEmail = params.user.email;
      newlyActivated = true;
    }

    // Check device registration (max 2 devices per license)
    const existingDevice = record.devices.find((d) => d.deviceId === deviceId);
    if (existingDevice) {
      existingDevice.lastSeenAtMs = nowMs;
      existingDevice.deviceLabel = deviceLabel || existingDevice.deviceLabel;
    } else {
      if (record.devices.length >= record.maxDevices) {
        throw new Error('DEVICE_LIMIT_REACHED');
      }
      record.devices.push({
        deviceId,
        deviceLabel,
        firstSeenAtMs: nowMs,
        lastSeenAtMs: nowMs,
      });
    }

    activeLicenseIdByUid.set(params.user.uid, record.licenseId);
    persistLicenseStoreToDisk();

    const licenseExpiresAtMs = record.expiresAtMs ?? nowMs + record.durationDays * 86_400_000;
    const leaseExpiresAtMs = Math.min(licenseExpiresAtMs, nowMs + OFFLINE_LEASE_TTL_MS);
    const leaseToken = signOfflineLeaseToken({
      licenseId: record.licenseId,
      uid: params.user.uid,
      deviceId,
      issuedAtMs: nowMs,
      leaseExpiresAtMs,
      licenseExpiresAtMs,
    });

    return {
      record,
      status: computeEffectiveLicenseStatus(record, nowMs),
      leaseToken,
      newlyActivated,
    };
  } finally {
    redemptionLocks.delete(codeHash);
  }
}

export function extendLicenseDuration(params: {
  adminUser: VerifiedFirebaseUser;
  licenseId: string;
  additionalDays: number;
  nowMs?: number;
}): LicenseRecord {
  if (!isVerifiedAdminUser(params.adminUser)) {
    throw new Error('FORBIDDEN_ADMIN_ONLY');
  }
  const nowMs = params.nowMs ?? Date.now();
  const addDays = Math.floor(Number(params.additionalDays));
  if (!Number.isFinite(addDays) || addDays < 1 || addDays > 3650) {
    throw new Error('Additional days must be between 1 and 3650.');
  }

  const record = licensesById.get(params.licenseId);
  if (!record) {
    throw new Error('LICENSE_NOT_FOUND');
  }

  const addMs = addDays * 86_400_000;
  if (record.activatedAtMs === null) {
    record.durationDays += addDays;
    record.unusedExpiresAtMs = Math.max(record.unusedExpiresAtMs, nowMs) + addMs;
  } else {
    const baseMs =
      record.expiresAtMs !== null && record.expiresAtMs > nowMs
        ? record.expiresAtMs
        : nowMs;
    record.expiresAtMs = baseMs + addMs;
    record.durationDays += addDays;
  }

  // If previously expired, extending reactivates unless revoked
  record.extensionHistory.push({
    addedDays: addDays,
    extendedAtMs: nowMs,
    adminUid: params.adminUser.uid,
  });
  persistLicenseStoreToDisk();

  return record;
}

export function resetLicenseDevices(params: {
  adminUser: VerifiedFirebaseUser;
  licenseId: string;
}): LicenseRecord {
  if (!isVerifiedAdminUser(params.adminUser)) {
    throw new Error('FORBIDDEN_ADMIN_ONLY');
  }
  const record = licensesById.get(params.licenseId);
  if (!record) {
    throw new Error('LICENSE_NOT_FOUND');
  }
  record.devices = [];
  persistLicenseStoreToDisk();
  return record;
}

export function setLicenseRevocation(params: {
  adminUser: VerifiedFirebaseUser;
  licenseId: string;
  revoked: boolean;
  reason?: string;
  nowMs?: number;
}): LicenseRecord {
  if (!isVerifiedAdminUser(params.adminUser)) {
    throw new Error('FORBIDDEN_ADMIN_ONLY');
  }
  const record = licensesById.get(params.licenseId);
  if (!record) {
    throw new Error('LICENSE_NOT_FOUND');
  }
  const nowMs = params.nowMs ?? Date.now();
  if (params.revoked) {
    record.revokedAtMs = nowMs;
    record.revokeReason = (params.reason || 'Revoked by administrator').trim().slice(0, 200);
  } else {
    record.revokedAtMs = null;
    record.revokeReason = null;
  }
  persistLicenseStoreToDisk();
  return record;
}

export function listAllLicensesForAdmin(
  adminUser: VerifiedFirebaseUser,
  nowMs = Date.now()
): Array<LicenseRecord & { status: LicenseStatus }> {
  if (!isVerifiedAdminUser(adminUser)) {
    throw new Error('FORBIDDEN_ADMIN_ONLY');
  }
  return Array.from(licensesById.values())
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .map((rec) => ({
      ...rec,
      status: computeEffectiveLicenseStatus(rec, nowMs),
    }));
}

export function getUserLicenseStatus(
  user: VerifiedFirebaseUser,
  deviceId?: string,
  nowMs = Date.now()
): {
  isAdmin: boolean;
  hasLicense: boolean;
  status: LicenseStatus | 'ADMIN_BYPASS' | 'UNLICENSED';
  license: (LicenseRecord & { status: LicenseStatus }) | null;
  deviceRegistered: boolean;
  leaseToken: string | null;
} {
  ensureStoreLoaded();
  const isAdmin = isVerifiedAdminUser(user);
  const licenseId = activeLicenseIdByUid.get(user.uid);
  if (!licenseId) {
    return {
      isAdmin,
      hasLicense: isAdmin,
      status: isAdmin ? 'ADMIN_BYPASS' : 'UNLICENSED',
      license: null,
      deviceRegistered: isAdmin,
      leaseToken: null,
    };
  }

  const record = licensesById.get(licenseId) ?? null;
  if (!record) {
    return {
      isAdmin,
      hasLicense: isAdmin,
      status: isAdmin ? 'ADMIN_BYPASS' : 'UNLICENSED',
      license: null,
      deviceRegistered: isAdmin,
      leaseToken: null,
    };
  }

  const status = computeEffectiveLicenseStatus(record, nowMs);
  const cleanDeviceId = (deviceId || '').trim();
  const matchedDevice = cleanDeviceId
    ? record.devices.find((d) => d.deviceId === cleanDeviceId)
    : undefined;
  if (matchedDevice && status === 'ACTIVE') {
    matchedDevice.lastSeenAtMs = nowMs;
  }

  let leaseToken: string | null = null;
  if (status === 'ACTIVE' && cleanDeviceId && matchedDevice && record.expiresAtMs) {
    leaseToken = signOfflineLeaseToken({
      licenseId: record.licenseId,
      uid: user.uid,
      deviceId: cleanDeviceId,
      issuedAtMs: nowMs,
      leaseExpiresAtMs: Math.min(record.expiresAtMs, nowMs + OFFLINE_LEASE_TTL_MS),
      licenseExpiresAtMs: record.expiresAtMs,
    });
  }

  return {
    isAdmin,
    hasLicense: status === 'ACTIVE' || isAdmin,
    status,
    license: { ...record, status },
    deviceRegistered: Boolean(matchedDevice) || isAdmin,
    leaseToken,
  };
}

export function requireActiveLicense(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.isPinAdmin || req.trialAccess) {
    next();
    return;
  }

  const user = req.authUser;
  if (!user) {
    res.status(401).json({
      error: 'Authentication required.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  if (isVerifiedAdminUser(user)) {
    next();
    return;
  }

  const nowMs = Date.now();
  const deviceIdHeader =
    typeof req.headers['x-vecl-device-id'] === 'string'
      ? req.headers['x-vecl-device-id'].trim()
      : '';
  const enforceHeader = req.headers['x-vecl-enforce-license'] === '1';

  const licenseId = activeLicenseIdByUid.get(user.uid);
  if (!licenseId) {
    if (requireLicenseForAllUsers || enforceHeader || process.env.VECL_ENFORCE_LICENSES === 'true') {
      res.status(403).json({
        error: 'An active AutoElectric Lab Pro license code is required to access this protected endpoint.',
        code: 'LICENSE_REQUIRED',
      });
      return;
    }
    next();
    return;
  }

  const record = licensesById.get(licenseId);
  if (!record) {
    next();
    return;
  }

  const status = computeEffectiveLicenseStatus(record, nowMs);
  if (status === 'REVOKED') {
    res.status(403).json({
      error: `License access has been revoked${record.revokeReason ? `: ${record.revokeReason}` : '.'}`,
      code: 'LICENSE_REVOKED',
    });
    return;
  }

  if (status === 'EXPIRED') {
    res.status(403).json({
      error: 'Your AutoElectric Lab Pro license has expired. Please contact the administrator to extend or renew your access code.',
      code: 'LICENSE_EXPIRED',
    });
    return;
  }

  if (deviceIdHeader) {
    const existingDevice = record.devices.find((d) => d.deviceId === deviceIdHeader);
    if (!existingDevice && record.devices.length >= record.maxDevices) {
      res.status(403).json({
        error: `Maximum registered device limit (${record.maxDevices} devices) reached for this license. Ask the administrator to reset device registrations.`,
        code: 'DEVICE_LIMIT_REACHED',
      });
      return;
    }
  }

  next();
}
