import {
  canonicalJsonStringify,
  computeOfflineSha256Hex,
  verifyOfflineLabReportToken,
  type VerifiedLabReportCanonicalPayload,
} from '../../services/universityLabPdfService';
import {
  findSignedAcademySessionByHash,
  type AcademySignedSessionLogEntry,
} from './labCryptoSigner';

export type AcademyVerificationBadge =
  | 'VERIFIED_GENUINE_SESSION'
  | 'TAMPERED_INVALID_SIGNATURE';

export interface AcademyVerificationOutcome {
  valid: boolean;
  badge: AcademyVerificationBadge;
  matchMode: 'QR_PAYLOAD_RECOMPUTED' | 'SHA256_SESSION_LOG' | 'INVALID';
  messageTaglish: string;
  messageEnglish: string;
  sha256Hash?: string;
  recomputedHash?: string;
  payload?: VerifiedLabReportCanonicalPayload;
  matchedLogEntry?: AcademySignedSessionLogEntry;
}

const SHA256_HEX_64_REGEX = /^[a-f0-9]{64}$/i;

/**
 * Decodes either a full AELP1 QR payload OR a 64-character hex SHA-256 hash string,
 * recomputes the cryptographic digest, and cross-checks against local signed session logs.
 */
export async function verifyAcademyLabReport(
  rawInput: string
): Promise<AcademyVerificationOutcome> {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      badge: 'TAMPERED_INVALID_SIGNATURE',
      matchMode: 'INVALID',
      messageTaglish: 'Walang inilagay na QR payload o 64-character SHA-256 hash.',
      messageEnglish: 'No QR payload or 64-character SHA-256 hash was provided.',
    };
  }

  // Case 1: 64-character hex SHA-256 hash lookup against signed session logs
  if (SHA256_HEX_64_REGEX.test(trimmed)) {
    const normalizedHash = trimmed.toLowerCase();
    const matchedLog = findSignedAcademySessionByHash(normalizedHash);
    if (!matchedLog) {
      return {
        valid: false,
        badge: 'TAMPERED_INVALID_SIGNATURE',
        matchMode: 'INVALID',
        sha256Hash: normalizedHash,
        messageTaglish:
          'TAMPERED / HINDI KUMPIRMADO: Hindi matagpuan ang SHA-256 hash na ito sa verified session logs ng terminal.',
        messageEnglish:
          'TAMPERED / INVALID SIGNATURE: SHA-256 hash was not found in verified terminal session logs.',
      };
    }

    const recomputed = await computeOfflineSha256Hex(
      canonicalJsonStringify(matchedLog.envelope.payload)
    );
    if (recomputed !== normalizedHash) {
      return {
        valid: false,
        badge: 'TAMPERED_INVALID_SIGNATURE',
        matchMode: 'INVALID',
        sha256Hash: normalizedHash,
        recomputedHash: recomputed,
        messageTaglish:
          'TAMPERED / INVALID SIGNATURE: Nagbago ang canonical session payload kumpara sa nakatatak na SHA-256 digest.',
        messageEnglish:
          'TAMPERED / INVALID SIGNATURE: Recomputed digest does not match the recorded SHA-256 hash.',
      };
    }

    return {
      valid: true,
      badge: 'VERIFIED_GENUINE_SESSION',
      matchMode: 'SHA256_SESSION_LOG',
      sha256Hash: normalizedHash,
      recomputedHash: recomputed,
      payload: matchedLog.envelope.payload,
      matchedLogEntry: matchedLog,
      messageTaglish:
        'VERIFIED GENUINE SESSION: Tugma ang 64-char SHA-256 digest sa naka-record na MNA practical lab session.',
      messageEnglish:
        'VERIFIED GENUINE SESSION: 64-character SHA-256 digest matches the immutable MNA practical lab session.',
    };
  }

  // Case 2: Full QR payload (AELP1|<hash>|<base64url-payload>)
  const qrCheck = await verifyOfflineLabReportToken(trimmed);
  if (qrCheck.valid && qrCheck.status === 'GENUINE' && qrCheck.payload) {
    const matchedLog = qrCheck.computedHash
      ? findSignedAcademySessionByHash(qrCheck.computedHash) || undefined
      : undefined;
    return {
      valid: true,
      badge: 'VERIFIED_GENUINE_SESSION',
      matchMode: 'QR_PAYLOAD_RECOMPUTED',
      sha256Hash: qrCheck.expectedHash,
      recomputedHash: qrCheck.computedHash,
      payload: qrCheck.payload,
      matchedLogEntry: matchedLog,
      messageTaglish:
        'VERIFIED GENUINE SESSION: Eksaktong tugma ang recomputed SHA-256 digest sa QR payload at walang palatandaan ng tamper.',
      messageEnglish:
        'VERIFIED GENUINE SESSION: Recomputed SHA-256 digest matches the QR payload with zero tampering detected.',
    };
  }

  return {
    valid: false,
    badge: 'TAMPERED_INVALID_SIGNATURE',
    matchMode: 'INVALID',
    sha256Hash: qrCheck.expectedHash,
    recomputedHash: qrCheck.computedHash,
    messageTaglish:
      qrCheck.reasonTaglish ||
      'TAMPERED / INVALID SIGNATURE: Hindi tugma ang QR payload o sira ang cryptographic signature.',
    messageEnglish:
      'TAMPERED / INVALID SIGNATURE: QR payload failed cryptographic SHA-256 verification.',
  };
}
