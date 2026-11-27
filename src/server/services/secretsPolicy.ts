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
