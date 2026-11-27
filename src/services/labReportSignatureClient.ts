/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { buildUnifiedApiHeaders } from './trialPinClientService';

export interface LabReportServerSignature {
  version: 'AELP-LABSIG-1';
  sha256Hash: string;
  signedAtMs: number;
  keyId: string;
  signature: string;
}

const LAB_REPORT_SIGNATURE_DOMAIN = 'AELP-LAB-REPORT-v1';

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Asks the server to ECDSA-sign a lab-report SHA-256 digest. Requires a signed-in user or active trial. */
export async function requestLabReportServerSignature(
  sha256Hash: string,
  fetchImpl: typeof fetch = fetch
): Promise<LabReportServerSignature> {
  const res = await fetchImpl('/api/autoelectric/academy/sign-report', {
    method: 'POST',
    headers: await buildUnifiedApiHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify({ sha256Hash }),
  });
  const data = (await res.json().catch(() => null)) as
    | { status?: string; signature?: LabReportServerSignature; error?: string }
    | null;
  if (!res.ok || !data?.signature) {
    throw new Error(data?.error || `Lab report signing failed (HTTP ${res.status}).`);
  }
  return data.signature;
}

/**
 * Verifies a server signature offline with the cached public key JWK (from /api/billing/public-key).
 * Also checks that the signature is bound to the digest of the report being verified.
 */
export async function verifyLabReportServerSignature(
  expectedSha256Hash: string,
  sig: LabReportServerSignature,
  publicKeyJwk: JsonWebKey
): Promise<{ valid: boolean; reason?: string }> {
  if (sig.version !== 'AELP-LABSIG-1') return { valid: false, reason: 'Unknown signature version.' };
  if (sig.sha256Hash.toLowerCase() !== expectedSha256Hash.toLowerCase()) {
    return { valid: false, reason: 'Signature was issued for a different report digest.' };
  }
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      publicKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const input = `${LAB_REPORT_SIGNATURE_DOMAIN}|${sig.sha256Hash.toLowerCase()}|${sig.signedAtMs}`;
    const sigBytes = base64UrlToBytes(sig.signature);
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      sigBytes.buffer.slice(sigBytes.byteOffset, sigBytes.byteOffset + sigBytes.byteLength) as ArrayBuffer,
      new TextEncoder().encode(input)
    );
    return ok ? { valid: true } : { valid: false, reason: 'Signature verification failed.' };
  } catch {
    return { valid: false, reason: 'Public key or signature could not be processed.' };
  }
}
