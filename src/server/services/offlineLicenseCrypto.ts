import crypto from 'node:crypto';

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

let cachedServerKeys: ServerSigningKeys | null = null;
const issuedLedger: IssuedOfflineLicenseRecord[] = [];

function getOrInitializeServerSigningKeys(): ServerSigningKeys {
  if (cachedServerKeys) return cachedServerKeys;

  const envJwkRaw = process.env.AELP_LICENSE_SIGNING_PRIVATE_KEY_JWK;
  if (envJwkRaw && envJwkRaw.trim()) {
    try {
      const parsedPrivate = JSON.parse(envJwkRaw) as crypto.JsonWebKey;
      const privateKey = crypto.createPrivateKey({ key: parsedPrivate, format: 'jwk' });
      const publicKey = crypto.createPublicKey(privateKey);
      const publicKeyJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
      cachedServerKeys = { privateKey, publicKeyJwk };
      return cachedServerKeys;
    } catch {
      // Fall back to fresh in-memory ECDSA P-256 keypair if env JWK is malformed
    }
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const publicKeyJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
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
  return record;
}

export function listIssuedOfflineLicenses(): IssuedOfflineLicenseRecord[] {
  return issuedLedger.slice(0, 100);
}

export function clearIssuedOfflineLicensesForTests(): void {
  issuedLedger.length = 0;
}
