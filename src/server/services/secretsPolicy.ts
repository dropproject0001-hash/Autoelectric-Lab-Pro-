/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

/**
 * Single source of truth for "strict production secrets" mode.
 *
 * - VECL_STRICT_PRODUCTION_SECRETS=true  -> strict (always)
 * - VECL_STRICT_PRODUCTION_SECRETS=false -> relaxed (explicit operator opt-out)
 * - unset/empty                          -> strict when NODE_ENV === 'production', relaxed otherwise
 *
 * Strict mode refuses to start signing/HMAC services with missing or weak secrets instead of
 * silently generating ephemeral ones (which would invalidate every issued token on restart).
 */
export function isStrictProductionSecrets(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.VECL_STRICT_PRODUCTION_SECRETS ?? '').trim().toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  return (env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
}

const INVISIBLE_PIN_CHARS_REGEX = /[\u200B-\u200D\uFEFF]/g;

/**
 * Strips accidental copy-paste artifacts from a server-configured Master Admin PIN secret
 * (invisible zero-width characters, accidental "VECL_ADMIN_MASTER_PIN=" prefix, or one pair of
 * matching outer quotes) while preserving the underlying secret characters verbatim.
 */
export function sanitizeEnvAdminMasterPin(raw: string | undefined | null): string {
  let value = String(raw ?? '')
    .replace(INVISIBLE_PIN_CHARS_REGEX, '')
    .trim();
  if (!value) return '';

  if (/^(VECL_ADMIN_MASTER_PIN|ADMIN_MASTER_PIN|MASTER_ADMIN_PIN)\s*=/i.test(value)) {
    value = value
      .replace(/^(VECL_ADMIN_MASTER_PIN|ADMIN_MASTER_PIN|MASTER_ADMIN_PIN)\s*=/i, '')
      .trim();
  }

  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim();
  }

  return value;
}

/**
 * Resolves the configured Master Admin PIN from server environment secrets.
 * Prefers the canonical VECL_ADMIN_MASTER_PIN, with fallback to common aliases only when unset.
 */
export function resolveConfiguredMasterAdminPin(
  env: NodeJS.ProcessEnv = process.env
): { raw: string; sanitized: string; sourceKey: string | null } {
  const candidates: Array<{ key: string; val: string | undefined }> = [
    { key: 'VECL_ADMIN_MASTER_PIN', val: env.VECL_ADMIN_MASTER_PIN },
    { key: 'ADMIN_MASTER_PIN', val: env.ADMIN_MASTER_PIN },
    { key: 'MASTER_ADMIN_PIN', val: env.MASTER_ADMIN_PIN },
  ];

  for (const candidate of candidates) {
    const raw = (candidate.val ?? '').replace(INVISIBLE_PIN_CHARS_REGEX, '').trim();
    const sanitized = sanitizeEnvAdminMasterPin(candidate.val);
    if (sanitized.length > 0) {
      return { raw, sanitized, sourceKey: candidate.key };
    }
  }

  return { raw: '', sanitized: '', sourceKey: null };
}
