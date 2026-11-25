/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { OfflineLicensePayload } from '../../server/services/offlineLicenseCrypto';

export const LICENSE_VAULT_DB_NAME = 'AutoLabPro_LicenseVault';
export const LICENSE_VAULT_STORE_NAME = 'vault_records';
export const LICENSE_VAULT_DB_VERSION = 1;

export type OfflineLicenseStatus =
  | 'FREE_TRIAL'
  | 'PRO_ACTIVE'
  | 'EXPIRED'
  | 'DEVICE_MISMATCH'
  | 'CLOCK_TAMPER_DETECTED';

export interface StoredLicenseVaultState {
  id: 'primary';
  deviceId: string;
  publicKeyJwk: JsonWebKey | null;
  activeActivationCode: string | null;
  payload: OfflineLicensePayload | null;
  activatedAtMs: number | null;
  lastValidSystemTime: number;
  monotonicAnchorMs: number;
  clockTamperDetected: boolean;
}

export interface LicenseStatusView {
  status: OfflineLicenseStatus;
  isProUnlocked: boolean;
  licenseKey: string | null;
  daysRemaining: number;
  expiresAtIso: string | null;
  deviceId: string;
  messageTaglish: string;
  messageEnglish: string;
}

const LICENSE_KEY_PREFIX_REGEX = /^AELP-[A-Z0-9]{2,8}-[A-Z0-9]{4}-\d{4}$/;
const CLOCK_ROLLBACK_TOLERANCE_MS = 60_000;

let memoryVaultState: StoredLicenseVaultState | null = null;
const vaultSubscribers = new Set<(view: LicenseStatusView) => void>();

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function getMonotonicMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return 0;
}

function generateDeviceFingerprint(): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 18);
  return `DEV-${randomPart.toUpperCase()}`;
}

function openLicenseVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LICENSE_VAULT_DB_NAME, LICENSE_VAULT_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LICENSE_VAULT_STORE_NAME)) {
        db.createObjectStore(LICENSE_VAULT_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error || new Error('Failed to open AutoLabPro_LicenseVault IndexedDB'));
  });
}

async function readVaultRecord(): Promise<StoredLicenseVaultState> {
  if (memoryVaultState) {
    return memoryVaultState;
  }

  const now = Date.now();
  const defaultState: StoredLicenseVaultState = {
    id: 'primary',
    deviceId: generateDeviceFingerprint(),
    publicKeyJwk: null,
    activeActivationCode: null,
    payload: null,
    activatedAtMs: null,
    lastValidSystemTime: now,
    monotonicAnchorMs: getMonotonicMs(),
    clockTamperDetected: false,
  };

  if (!hasIndexedDb()) {
    memoryVaultState = defaultState;
    return defaultState;
  }

  try {
    const db = await openLicenseVaultDb();
    const existing = await new Promise<StoredLicenseVaultState | undefined>((resolve, reject) => {
      const tx = db.transaction(LICENSE_VAULT_STORE_NAME, 'readonly');
      const req = tx.objectStore(LICENSE_VAULT_STORE_NAME).get('primary');
      req.onsuccess = () => resolve(req.result as StoredLicenseVaultState | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    memoryVaultState = existing || defaultState;
    if (!existing) {
      await writeVaultRecord(memoryVaultState);
    }
    return memoryVaultState;
  } catch {
    memoryVaultState = defaultState;
    return defaultState;
  }
}

async function writeVaultRecord(next: StoredLicenseVaultState): Promise<void> {
  memoryVaultState = next;
  if (!hasIndexedDb()) return;
  try {
    const db = await openLicenseVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LICENSE_VAULT_STORE_NAME, 'readwrite');
      tx.objectStore(LICENSE_VAULT_STORE_NAME).put(next);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Keep in-memory state intact if browser restricts IndexedDB
  }
}

function base64UrlToUint8Array(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(padded, 'base64'));
  }
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function decodePayloadBase64Url(b64url: string): OfflineLicensePayload | null {
  try {
    const bytes = base64UrlToUint8Array(b64url);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as OfflineLicensePayload;
    if (
      parsed &&
      parsed.version === 'AELP-LIC-1' &&
      typeof parsed.licenseKey === 'string' &&
      typeof parsed.expiresAtMs === 'number' &&
      typeof parsed.issuedAtMs === 'number'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function cachePublicVerificationKeyJwk(publicKeyJwk: JsonWebKey): Promise<void> {
  const vault = await readVaultRecord();
  await writeVaultRecord({
    ...vault,
    publicKeyJwk,
  });
}

async function ensurePublicVerificationKeyJwk(
  overrideKey?: JsonWebKey | null
): Promise<JsonWebKey | null> {
  if (overrideKey) {
    await cachePublicVerificationKeyJwk(overrideKey);
    return overrideKey;
  }
  const vault = await readVaultRecord();
  if (vault.publicKeyJwk) {
    return vault.publicKeyJwk;
  }
  if (typeof fetch === 'function' && typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/billing/public-key', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = (await res.json()) as { publicKeyJwk?: JsonWebKey };
        if (data?.publicKeyJwk) {
          await cachePublicVerificationKeyJwk(data.publicKeyJwk);
          return data.publicKeyJwk;
        }
      }
    } catch {
      // Offline mode — cannot fetch if not already cached
    }
  }
  return null;
}

/**
 * Verifies an offline signed license token (`AELP-PRO-XXXX-2026.<payloadB64>.<sigB64>`)
 * using Web Crypto API ECDSA P-256 SHA-256 public verification key.
 */
export async function verifyOfflineLicenseSignature(
  rawActivationCode: string,
  publicKeyOverride?: JsonWebKey | null
): Promise<{
  valid: boolean;
  payload?: OfflineLicensePayload;
  reason?: string;
}> {
  const trimmed = String(rawActivationCode || '').trim();
  const segments = trimmed.split('.');
  if (segments.length !== 3) {
    return {
      valid: false,
      reason: 'Invalid license token format. Expected AELP-PRO-XXXX-YYYY.<payload>.<signature>.',
    };
  }

  const [licenseKey, payloadB64, sigB64] = segments;
  if (!LICENSE_KEY_PREFIX_REGEX.test(licenseKey)) {
    return {
      valid: false,
      reason: 'License key prefix format is invalid (expected AELP-PRO-XXXX-2026).',
    };
  }

  const payload = decodePayloadBase64Url(payloadB64);
  if (!payload || payload.licenseKey !== licenseKey) {
    return {
      valid: false,
      reason: 'License payload does not match the activation key prefix.',
    };
  }

  const publicJwk = await ensurePublicVerificationKeyJwk(publicKeyOverride);
  if (!publicJwk) {
    return {
      valid: false,
      reason: 'Public verification key is unavailable offline. Connect once to sync key.',
    };
  }

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const sigBytes = base64UrlToUint8Array(sigB64);
    const dataBytes = new TextEncoder().encode(payloadB64);
    const sigBuf = sigBytes.buffer.slice(
      sigBytes.byteOffset,
      sigBytes.byteOffset + sigBytes.byteLength
    ) as ArrayBuffer;
    const isValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      sigBuf,
      dataBytes
    );

    if (!isValid) {
      return {
        valid: false,
        reason: 'Cryptographic signature verification failed — key may be forged or modified.',
      };
    }

    return { valid: true, payload };
  } catch {
    return {
      valid: false,
      reason: 'Web Crypto signature verification failed.',
    };
  }
}

export function evaluateLicenseVaultState(
  vault: StoredLicenseVaultState,
  nowMs: number = Date.now()
): LicenseStatusView {
  // Monotonic Anti-Clock Guard: detect system clock rollback > 60 seconds
  const clockRolledBack =
    vault.clockTamperDetected || nowMs + CLOCK_ROLLBACK_TOLERANCE_MS < vault.lastValidSystemTime;

  if (clockRolledBack && vault.payload) {
    return {
      status: 'CLOCK_TAMPER_DETECTED',
      isProUnlocked: false,
      licenseKey: vault.payload.licenseKey,
      daysRemaining: 0,
      expiresAtIso: new Date(vault.payload.expiresAtMs).toISOString(),
      deviceId: vault.deviceId,
      messageTaglish:
        'CLOCK TAMPER DETECTED: Na-detect na ibinalik ang oras ng device. Naka-lock ang PRO license hanggang mag-network time re-sync.',
      messageEnglish:
        'CLOCK TAMPER DETECTED: Device clock rollback detected. PRO features are locked until network time re-sync.',
    };
  }

  if (!vault.payload) {
    return {
      status: 'FREE_TRIAL',
      isProUnlocked: false,
      licenseKey: null,
      daysRemaining: 0,
      expiresAtIso: null,
      deviceId: vault.deviceId,
      messageTaglish: 'FREE / TRIAL · Upgrade sa PRO',
      messageEnglish: 'FREE / TRIAL · Upgrade',
    };
  }

  const remainingMs = vault.payload.expiresAtMs - nowMs;
  if (remainingMs <= 0) {
    return {
      status: 'EXPIRED',
      isProUnlocked: false,
      licenseKey: vault.payload.licenseKey,
      daysRemaining: 0,
      expiresAtIso: new Date(vault.payload.expiresAtMs).toISOString(),
      deviceId: vault.deviceId,
      messageTaglish: 'EXPIRED LICENSE · Mag-renew gamit ang bagong PIN',
      messageEnglish: 'EXPIRED LICENSE · Renew with a new PIN',
    };
  }

  const daysRemaining = Math.max(1, Math.ceil(remainingMs / 86_400_000));
  return {
    status: 'PRO_ACTIVE',
    isProUnlocked: true,
    licenseKey: vault.payload.licenseKey,
    daysRemaining,
    expiresAtIso: new Date(vault.payload.expiresAtMs).toISOString(),
    deviceId: vault.deviceId,
    messageTaglish: `PRO LICENSE · ${daysRemaining} Araw ang Natitira`,
    messageEnglish: `PRO LICENSE · ${daysRemaining} Days Left`,
  };
}

function notifyVaultSubscribers(view: LicenseStatusView): void {
  for (const listener of vaultSubscribers) {
    try {
      listener(view);
    } catch {
      // Isolate subscriber errors
    }
  }
}

export async function getOfflineLicenseStatus(nowMs: number = Date.now()): Promise<LicenseStatusView> {
  const vault = await readVaultRecord();
  const isRollback = nowMs + CLOCK_ROLLBACK_TOLERANCE_MS < vault.lastValidSystemTime;
  const nextVault: StoredLicenseVaultState = isRollback
    ? { ...vault, clockTamperDetected: true }
    : {
        ...vault,
        lastValidSystemTime: Math.max(vault.lastValidSystemTime, nowMs),
        monotonicAnchorMs: getMonotonicMs(),
      };
  await writeVaultRecord(nextVault);
  const view = evaluateLicenseVaultState(nextVault, nowMs);
  notifyVaultSubscribers(view);
  return view;
}

export async function activateOfflineLicenseCode(params: {
  activationCode: string;
  publicKeyOverride?: JsonWebKey | null;
  expectedDeviceId?: string;
  nowMs?: number;
}): Promise<{
  ok: boolean;
  statusView: LicenseStatusView;
  error?: string;
}> {
  const now = params.nowMs ?? Date.now();
  const vault = await readVaultRecord();

  if (params.expectedDeviceId && params.expectedDeviceId !== vault.deviceId) {
    const view: LicenseStatusView = {
      status: 'DEVICE_MISMATCH',
      isProUnlocked: false,
      licenseKey: null,
      daysRemaining: 0,
      expiresAtIso: null,
      deviceId: vault.deviceId,
      messageTaglish: 'DEVICE MISMATCH: Naka-bind ang PIN sa ibang device.',
      messageEnglish: 'DEVICE MISMATCH: This license is bound to a different device fingerprint.',
    };
    return { ok: false, statusView: view, error: view.messageEnglish };
  }

  const verified = await verifyOfflineLicenseSignature(
    params.activationCode,
    params.publicKeyOverride
  );
  if (!verified.valid || !verified.payload) {
    const currentView = evaluateLicenseVaultState(vault, now);
    return {
      ok: false,
      statusView: currentView,
      error: verified.reason || 'Invalid activation key.',
    };
  }

  const nextVault: StoredLicenseVaultState = {
    ...vault,
    activeActivationCode: params.activationCode.trim(),
    payload: verified.payload,
    activatedAtMs: now,
    lastValidSystemTime: Math.max(vault.lastValidSystemTime, now),
    monotonicAnchorMs: getMonotonicMs(),
    clockTamperDetected: false,
  };
  await writeVaultRecord(nextVault);
  const view = evaluateLicenseVaultState(nextVault, now);
  notifyVaultSubscribers(view);
  return { ok: view.isProUnlocked, statusView: view };
}

export function subscribeOfflineLicenseStatus(
  listener: (view: LicenseStatusView) => void
): () => void {
  vaultSubscribers.add(listener);
  void getOfflineLicenseStatus().then((v) => listener(v));
  return () => {
    vaultSubscribers.delete(listener);
  };
}

export async function clearOfflineLicenseVaultForTests(): Promise<void> {
  memoryVaultState = null;
  if (!hasIndexedDb()) return;
  try {
    const db = await openLicenseVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LICENSE_VAULT_STORE_NAME, 'readwrite');
      tx.objectStore(LICENSE_VAULT_STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore
  }
}
