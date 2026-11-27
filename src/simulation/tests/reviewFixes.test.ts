/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

// Regression tests for the deep-review fixes: strict secrets policy, lab-report ECDSA signatures,
// global PIN throttling and weak master-PIN rejection.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isStrictProductionSecrets } from '../../server/services/secretsPolicy';

// --- secrets policy
assert.equal(isStrictProductionSecrets({ NODE_ENV: 'production' } as any), true);
assert.equal(isStrictProductionSecrets({ NODE_ENV: 'production', VECL_STRICT_PRODUCTION_SECRETS: 'false' } as any), false);
assert.equal(isStrictProductionSecrets({ NODE_ENV: 'development' } as any), false);
assert.equal(isStrictProductionSecrets({ VECL_STRICT_PRODUCTION_SECRETS: 'true' } as any), true);
console.log('PASS secretsPolicy');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aelp-'));
process.env.VECL_DATA_DIR = dir;

(async () => {
  // --- lab report signature round trip (server sign -> WebCrypto verify)
  const crypto = await import('node:crypto');
  const lic = await import('../../server/services/offlineLicenseCrypto');
  lic.setOfflineLicenseDataDirForTests(dir);
  const hash = crypto.createHash('sha256').update('report-payload').digest('hex');
  const sig = lic.signLabReportHash(hash, 1_700_000_000_000);
  const jwk = lic.getPublicVerificationKeyJwk();
  const key = await crypto.subtle.importKey('jwk', jwk as any, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const b = Buffer.from(sig.signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const input = `AELP-LAB-REPORT-v1|${sig.sha256Hash}|${sig.signedAtMs}`;
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b, new TextEncoder().encode(input)), true);
  const tampered = `AELP-LAB-REPORT-v1|${'0'.repeat(64)}|${sig.signedAtMs}`;
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b, new TextEncoder().encode(tampered)), false);
  assert.throws(() => lic.signLabReportHash('nothex'), /INVALID_LAB_REPORT_HASH/);
  console.log('PASS lab report ECDSA sign/verify + tamper + bad hash, keyId', sig.keyId);

  // --- malformed operator JWK must throw, never silently replaced (non-strict and strict)
  lic.setOfflineLicenseDataDirForTests(dir + '-2');
  process.env.AELP_LICENSE_SIGNING_PRIVATE_KEY_JWK = '{not json';
  assert.throws(() => lic.getPublicVerificationKeyJwk(), /OFFLINE_LICENSE_JWK_INVALID/);
  process.env.NODE_ENV = 'production';
  process.env.AELP_LICENSE_SIGNING_PRIVATE_KEY_JWK = '{"kty":"EC","crv":"P-256"}garbage';
  assert.throws(() => lic.getPublicVerificationKeyJwk(), /OFFLINE_LICENSE_JWK_INVALID/);

  // Verify /api/billing/public-key returns structured 503 JSON without HTML stack trace
  const http = await import('node:http');
  const { createAutoelectricApiApp } = await import('../../server/createApiApp');
  const apiApp = createAutoelectricApiApp();
  const srv = http.createServer(apiApp);
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  try {
    const addr = srv.address();
    assert.ok(addr && typeof addr !== 'string');
    const badRes = await fetch(`http://127.0.0.1:${addr.port}/api/billing/public-key`);
    assert.equal(badRes.status, 503);
    const badBody = (await badRes.json()) as { status?: string; code?: string };
    assert.equal(badBody.status, 'ERROR');
    assert.equal(badBody.code, 'OFFLINE_LICENSE_KEY_UNAVAILABLE');
  } finally {
    srv.close();
  }
  delete process.env.AELP_LICENSE_SIGNING_PRIVATE_KEY_JWK;
  console.log('PASS malformed JWK fails loudly and /api/billing/public-key returns structured 503 JSON');

  // --- strict production: missing HMAC secret must refuse
  process.env.NODE_ENV = 'production';
  const trial = await import('../../server/services/trialPinService');
  trial.setTrialStoreFilePathForTests(path.join(dir, 'vecl-trials.store.json'));
  // global limiters
  let blocked = 0;
  for (let i = 0; i < 45; i++) {
    if (!trial.checkAdminPinRateLimit(`ip-${i}`).allowed) blocked++;
  }
  assert.equal(blocked, 5); // 40 global budget across rotating IPs
  let tblocked = 0;
  for (let i = 0; i < 310; i++) {
    if (!trial.checkTrialRedeemGlobalRateLimit().allowed) tblocked++;
  }
  assert.equal(tblocked, 10);
  console.log('PASS global admin (40/15min) and trial (300/5min) budgets hold across rotating IPs');

  // weak env admin PIN rejected in production
  process.env.VECL_ADMIN_MASTER_PIN = '1234';
  assert.throws(() => trial.verifyMasterAdminPinAndIssueToken('1234'), /ADMIN_ENV_PIN_TOO_WEAK/);
  assert.throws(() => {
    process.env.VECL_ADMIN_MASTER_PIN = 'correct-horse-9';
    trial.verifyMasterAdminPinAndIssueToken('correct-horse-9');
  }, /LICENSE_HMAC_SECRET_MISSING_OR_WEAK/);
  console.log('PASS production refuses to mint tokens without a 32+ char HMAC secret');

  process.env.VECL_LICENSE_HMAC_SECRET = 'x'.repeat(48);
  assert.ok(trial.verifyMasterAdminPinAndIssueToken('correct-horse-9').adminToken);
  console.log('PASS weak env PIN rejected in production; strong PIN accepted');
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
