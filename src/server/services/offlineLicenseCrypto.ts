/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import crypto from 'node:crypto';
import { isStrictProductionSecrets } from './secretsPolicy';
import fs from 'node:fs';
import path from 'node:path';

export type SubscriptionDurationDays = 30 | 90 | 180 | 365 | 36500;

export interface OfflineLicensePayload {
  version: 'AELP-LIC-1';
  licenseKey: string;
  tier: 'SHOP_30D' | 'PRO_90D' | 'PRO_180D' | 'VIP_365D' | 'LIFETIME';
  durationDays: SubscriptionDurationDays;
  issuedAtMs: number;
  expiresAtMs: number;
  technicianNote: string;
}

export interface IssuedOfflineLicenseRecord {
  licenseKey: string;
  signedActivationCode: string;
  payload: OfflineLicensePayload;
  createdAtIso: string;
}

interface ServerSigningKeys {
  privateKey: crypto.KeyObject;
  publicKeyJwk: JsonWebKey;
}

interface DurableOfflineLedgerPayload {
  schemaVersion: 1;
  updatedAtMs: number;
  issuedLedger: IssuedOfflineLicenseRecord[];
}

let cachedServerKeys: ServerSigningKeys | null = null;
const issuedLedger: IssuedOfflineLicenseRecord[] = [];
let customOfflineDataDir: string | null = null;
let isLedgerLoaded = false;

function resolveOfflineDataDir(): string {
  if (customOfflineDataDir) {
    return customOfflineDataDir;
  }
  const envDir = (process.env.VECL_DATA_DIR || '').trim();
  if (envDir) {
    return path.resolve(envDir);
  }
  return path.resolve(process.cwd(), '.data');
}

function resolveSigningKeyFilePath(): string {
  return path.join(resolveOfflineDataDir(), 'aelp-offline-signing-key.jwk');
}

function resolveOfflineLedgerFilePath(): string {
  return path.join(resolveOfflineDataDir(), 'aelp-offline-licenses.store.json');
}

function ensureLedgerLoaded(): void {
  if (isLedgerLoaded) return;
  isLedgerLoaded = true;
  issuedLedger.length = 0;
  const ledgerPath = resolveOfflineLedgerFilePath();
  if (!fs.existsSync(ledgerPath)) return;
  try {
    const raw = fs.readFileSync(ledgerPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DurableOfflineLedgerPayload>;
    if (Array.isArray(parsed.issuedLedger)) {
      for (const item of parsed.issuedLedger.slice(0, 200)) {
        if (item && typeof item.licenseKey === 'string' && typeof item.signedActivationCode === 'string') {
          issuedLedger.push(item);
        }
      }
    }
  } catch (err) {
    console.warn('[OfflineLicenseCrypto] Failed to parse durable ledger:', err);
  }
}

function persistLedgerToDisk(): void {
  try {
    const ledgerPath = resolveOfflineLedgerFilePath();
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    const payload: DurableOfflineLedgerPayload = {
      schemaVersion: 1,
      updatedAtMs: Date.now(),
      issuedLedger: issuedLedger.slice(0, 200),
    };
    const tmpPath = `${ledgerPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(tmpPath, ledgerPath);
  } catch (err) {
    console.warn('[OfflineLicenseCrypto] Durable ledger write warning:', err);
  }
}

function getOrInitializeServerSigningKeys(): ServerSigningKeys {
  if (cachedServerKeys) return cachedServerKeys;

  const envJwkRaw = (process.env.AELP_LICENSE_SIGNING_PRIVATE_KEY_JWK || '').trim();
  if (isStrictProductionSecrets()) {
    if (!envJwkRaw) {
      throw new Error(
        'OFFLINE_LICENSE_JWK_MISSING: AELP_LICENSE_SIGNING_PRIVATE_KEY_JWK must be configured in strict production mode.'
      );
    }
    const parsedPrivate = JSON.parse(envJwkRaw) as crypto.JsonWebKey;
    const privateKey = crypto.createPrivateKey({ key: parsedPrivate, format: 'jwk' });
    const publicKey = crypto.createPublicKey(privateKey);
    const publicKeyJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
    cachedServerKeys = { privateKey, publicKeyJwk };
    return cachedServerKeys;
  }

  if (envJwkRaw) {
    try {
      const parsedPrivate = JSON.parse(envJwkRaw) as crypto.JsonWebKey;
      const privateKey = crypto.createPrivateKey({ key: parsedPrivate, format: 'jwk' });
      const publicKey = crypto.createPublicKey(privateKey);
      const publicKeyJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
      cachedServerKeys = { privateKey, publicKeyJwk };
      return cachedServerKeys;
    } catch {
      // An operator-supplied key that cannot be parsed must never be silently replaced:
      // doing so would invalidate every previously issued offline license.
      throw new Error(
        'OFFLINE_LICENSE_JWK_INVALID: AELP_LICENSE_SIGNING_PRIVATE_KEY_JWK is set but is not a valid P-256 private JWK.'
      );
    }
  }

  const keyFilePath = resolveSigningKeyFilePath();
  try {
    if (fs.existsSync(keyFilePath)) {
      const storedJwk = JSON.parse(fs.readFileSync(keyFilePath, 'utf8')) as crypto.JsonWebKey;
      const privateKey = crypto.createPrivateKey({ key: storedJwk, format: 'jwk' });
      const publicKey = crypto.createPublicKey(privateKey);
      const publicKeyJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
      cachedServerKeys = { privateKey, publicKeyJwk };
      return cachedServerKeys;
    }
  } catch {
    // Regenerate key if persisted key file is unreadable
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const publicKeyJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
  try {
    const privateKeyJwk = privateKey.export({ format: 'jwk' }) as JsonWebKey;
    fs.mkdirSync(path.dirname(keyFilePath), { recursive: true });
    const tmpKeyPath = `${keyFilePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpKeyPath, JSON.stringify(privateKeyJwk), {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(tmpKeyPath, keyFilePath);
  } catch {
    // Ignore disk write failure on read-only FS
  }
  cachedServerKeys = { privateKey, publicKeyJwk };
  return cachedServerKeys;
}

function base64UrlEncode(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function generateReadableSegment(length = 4): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function resolveTierLabel(days: SubscriptionDurationDays): OfflineLicensePayload['tier'] {
  if (days >= 36500) return 'LIFETIME';
  if (days >= 365) return 'VIP_365D';
  if (days >= 180) return 'PRO_180D';
  if (days >= 90) return 'PRO_90D';
  return 'SHOP_30D';
}

export function getPublicVerificationKeyJwk(): JsonWebKey {
  return getOrInitializeServerSigningKeys().publicKeyJwk;
}

/**
 * Generates a cryptographically signed offline-verifiable subscription license key
 * (`AELP-PRO-XXXX-2026`) backed by ECDSA P-256 SHA-256 (IEEE P1363 format compatible with Web Crypto API).
 */
export function generateSignedOfflineLicense(params: {
  durationDays: SubscriptionDurationDays;
  technicianNote?: string;
}): IssuedOfflineLicenseRecord {
  ensureLedgerLoaded();
  const { privateKey } = getOrInitializeServerSigningKeys();
  const issuedAtMs = Date.now();
  const year = new Date(issuedAtMs).getUTCFullYear();
  const licenseKey = `AELP-PRO-${generateReadableSegment(4)}-${year}`;
  const expiresAtMs = issuedAtMs + params.durationDays * 86_400_000;
  const cleanNote = String(params.technicianNote || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, 120);

  const payload: OfflineLicensePayload = {
    version: 'AELP-LIC-1',
    licenseKey,
    tier: resolveTierLabel(params.durationDays),
    durationDays: params.durationDays,
    issuedAtMs,
    expiresAtMs,
    technicianNote: cleanNote,
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  // IEEE P1363 signature encoding matches Web Crypto subtle.verify('ECDSA') directly
  const sigBuf = crypto.sign('sha256', Buffer.from(payloadB64, 'utf8'), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  const sigB64 = base64UrlEncode(sigBuf);
  const signedActivationCode = `${licenseKey}.${payloadB64}.${sigB64}`;

  const record: IssuedOfflineLicenseRecord = {
    licenseKey,
    signedActivationCode,
    payload,
    createdAtIso: new Date(issuedAtMs).toISOString(),
  };

  issuedLedger.unshift(record);
  if (issuedLedger.length > 200) {
    issuedLedger.pop();
  }
  persistLedgerToDisk();
  return record;
}

const LAB_REPORT_SIGNATURE_DOMAIN = 'AELP-LAB-REPORT-v1';

export interface LabReportServerSignature {
  version: 'AELP-LABSIG-1';
  sha256Hash: string;
  signedAtMs: number;
  keyId: string;
  /** base64url ECDSA P-256 / SHA-256 signature (IEEE P1363) over `labReportSigningInput()` */
  signature: string;
}

/** Exact byte string that is signed / verified. Domain-separated from license signatures. */
export function labReportSigningInput(sha256Hash: string, signedAtMs: number): string {
  return `${LAB_REPORT_SIGNATURE_DOMAIN}|${sha256Hash.toLowerCase()}|${signedAtMs}`;
}

function computeKeyId(publicKeyJwk: JsonWebKey): string {
  return crypto
    .createHash('sha256')
    .update(`${publicKeyJwk.crv}|${publicKeyJwk.x}|${publicKeyJwk.y}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Signs a lab-report SHA-256 digest with the server ECDSA key, so a report cannot be forged by
 * anyone who merely knows the (public) canonical hashing scheme. The signature proves the server
 * attested this digest at `signedAtMs`; it is verified offline with the public key from
 * `/api/billing/public-key`.
 */
export function signLabReportHash(sha256Hash: string, nowMs = Date.now()): LabReportServerSignature {
  if (!/^[a-f0-9]{64}$/i.test(sha256Hash)) {
    throw new Error('INVALID_LAB_REPORT_HASH');
  }
  const { privateKey, publicKeyJwk } = getOrInitializeServerSigningKeys();
  const normalized = sha256Hash.toLowerCase();
  const sigBuf = crypto.sign('sha256', Buffer.from(labReportSigningInput(normalized, nowMs), 'utf8'), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return {
    version: 'AELP-LABSIG-1',
    sha256Hash: normalized,
    signedAtMs: nowMs,
    keyId: computeKeyId(publicKeyJwk),
    signature: base64UrlEncode(sigBuf),
  };
}

export function listIssuedOfflineLicenses(): IssuedOfflineLicenseRecord[] {
  ensureLedgerLoaded();
  return issuedLedger.slice(0, 100);
}

export function setOfflineLicenseDataDirForTests(dirPath: string | null): void {
  customOfflineDataDir = dirPath;
  cachedServerKeys = null;
  isLedgerLoaded = false;
}

export function clearIssuedOfflineLicensesForTests(): void {
  issuedLedger.length = 0;
  isLedgerLoaded = true;
  try {
    const ledgerPath = resolveOfflineLedgerFilePath();
    if (fs.existsSync(ledgerPath)) {
      fs.unlinkSync(ledgerPath);
    }
  } catch {
    // Ignore cleanup errors
  }
}
