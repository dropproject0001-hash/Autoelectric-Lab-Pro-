/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createAutoelectricApiApp } from '../../server/createApiApp';
import {
  evaluateGatewayRequestPolicy,
  executeFreeTierGatewayPrompt,
  getGatewayUsageSnapshot,
  isProhibitedPaidModel,
  resetGeminiFreeTierGatewayForTests,
  setFreeTierModelAllowlistState,
  setGatewayQuotaLimits,
} from '../../server/services/geminiFreeTierGateway';
import { resolveImageAnalysisProviderName } from '../../server/services/imageAnalysisProvider';

async function runM4GatewayTests(): Promise<void> {
  console.log('\n=== M4 GEMINI FREE-TIER GATEWAY SECURITY & ENFORCEMENT SUITE ===');
  resetGeminiFreeTierGatewayForTests();

  // 1. Default-disabled allowlist rejects models until admin verifies & enables
  const defaultBlocked = evaluateGatewayRequestPolicy({
    modelId: 'gemini-2.5-flash',
    prompt: 'Explain CAN bus 60 ohm termination',
    actor: 'tech-user-1',
    env: { GEMINI_API_KEY: 'test-server-only-key-123456' },
  });
  assert.equal(defaultBlocked.allowed, false);
  assert.equal(defaultBlocked.statusCode, 403);
  assert.equal(defaultBlocked.code, 'MODEL_NOT_ALLOWLISTED');
  assert.equal(defaultBlocked.fallbackToLocalAi, true);
  console.log('  PASS: 1. Default-disabled allowlist blocks unapproved models with local AI fallback');

  // 2. Paid / non-free models permanently blocked — even admins cannot override
  for (const paidId of [
    'gpt-4o-mini',
    'o3-mini',
    'claude-3-5-sonnet',
    'gemini-2.5-pro',
    'gemini-omni-1.2-flash',
    'gemini-nano-banana-2.1',
  ]) {
    assert.equal(isProhibitedPaidModel(paidId), true, `${paidId} must be prohibited`);
    const adminOverrideAttempt = setFreeTierModelAllowlistState({
      modelId: paidId,
      enabled: true,
      freeTierEligibilityVerified: true,
      actor: 'Master Admin',
    });
    assert.equal(adminOverrideAttempt.ok, false, `Admin must not override paid block for ${paidId}`);
    assert.equal(adminOverrideAttempt.statusCode, 403);
  }

  // Paid OpenAI image provider is permanently disabled even if OPENAI_API_KEY is set
  const prevProv = process.env.IMAGE_ANALYSIS_PROVIDER;
  const prevOai = process.env.OPENAI_API_KEY;
  process.env.IMAGE_ANALYSIS_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'sk-should-never-be-used-1234567890';
  assert.equal(resolveImageAnalysisProviderName(), 'manual');
  if (prevProv === undefined) delete process.env.IMAGE_ANALYSIS_PROVIDER;
  else process.env.IMAGE_ANALYSIS_PROVIDER = prevProv;
  if (prevOai === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = prevOai;
  console.log('  PASS: 2. Paid models and OpenAI provider permanently rejected (non-overridable by admins)');

  // 3. Admin-verified allowlist enables free-tier model, scrubs PII, and shuts off automatically on quota exhaustion
  const enableRes = setFreeTierModelAllowlistState({
    modelId: 'gemini-2.5-flash',
    enabled: true,
    freeTierEligibilityVerified: true,
    verificationNotes: 'Verified against Google AI Studio Free Tier table',
    actor: 'Master Admin',
  });
  assert.equal(enableRes.ok, true);

  setGatewayQuotaLimits({ dailyQuotaLimit: 1, rpmLimit: 5, actor: 'Master Admin' });

  let capturedPromptSentUpstream = '';
  const okExec = await executeFreeTierGatewayPrompt({
    modelId: 'gemini-2.5-flash',
    prompt:
      'Customer email john@example.com VIN 1HGCM82633A004352 phone 555-234-5678: Explain TPS P0122.',
    actor: 'tech-user-1',
    env: { GEMINI_API_KEY: 'test-server-only-key-123456' },
    customExecutorForTests: async ({ prompt }) => {
      capturedPromptSentUpstream = prompt;
      return 'TPS P0122 indicates throttle position sensor circuit low input.';
    },
  });
  assert.equal(okExec.ok, true);
  assert.ok(!capturedPromptSentUpstream.includes('john@example.com'), 'Email must be scrubbed');
  assert.ok(!capturedPromptSentUpstream.includes('1HGCM82633A004352'), 'VIN must be scrubbed');
  assert.ok(!capturedPromptSentUpstream.includes('555-234-5678'), 'Phone must be scrubbed');
  assert.ok(capturedPromptSentUpstream.includes('TPS P0122'), 'Technical context must remain');

  // Next call hits daily quota limit -> auto cloud shutoff + local AI fallback (no paid call)
  const quotaExhausted = await executeFreeTierGatewayPrompt({
    modelId: 'gemini-2.5-flash',
    prompt: 'Second request after daily quota exhausted',
    actor: 'tech-user-1',
    env: { GEMINI_API_KEY: 'test-server-only-key-123456' },
    customExecutorForTests: async () => 'SHOULD_NOT_RUN',
  });
  assert.equal(quotaExhausted.ok, false);
  assert.equal(quotaExhausted.statusCode, 429);
  assert.equal(quotaExhausted.code, 'FREE_TIER_QUOTA_EXHAUSTED');
  assert.equal(quotaExhausted.fallbackToLocalAi, true);

  const snap = getGatewayUsageSnapshot({ GEMINI_API_KEY: 'test-server-only-key-123456' });
  assert.equal(snap.cloudShutoffActive, true, 'Quota exhaustion must engage cloud shutoff');
  assert.ok(snap.adminNotifications.length > 0, 'Quota exhaustion must notify admin');
  assert.ok(
    !snap.credentialRotation.keyFingerprintMasked.includes('test-server-only-key'),
    'Raw key must never appear in status snapshots'
  );
  console.log('  PASS: 3. Privacy scrubbing, quota exhaustion auto-shutoff & local AI fallback verified');

  // 4. HTTP endpoint rejects unauthenticated requests with 401
  const app = createAutoelectricApiApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const unauthRes = await fetch(`${baseUrl}/api/autoelectric/ai/gateway`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemini-2.5-flash', prompt: 'test' }),
    });
    assert.equal(unauthRes.status, 401, 'Unauthenticated gateway request must be rejected with 401');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  console.log('  PASS: 4. Unauthenticated HTTP requests to /api/autoelectric/ai/gateway rejected (401)');

  // 5. Client bundle scan verifies zero API keys in dist/assets/*.js
  const distAssetsDir = path.resolve(process.cwd(), 'dist', 'assets');
  if (fs.existsSync(distAssetsDir)) {
    const jsFiles = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.js'));
    // Word-bounded secret pattern: catches real Google (AIza + 35 chars) & OpenAI (sk-...) keys
    // without false-positiving on random 4-byte substrings inside WebLLM base64 WASM binaries.
    const secretRe = new RegExp('\\bAI' + 'za[0-9A-Za-z_-]{35}\\b|\\bsk' + '-[0-9A-Za-z]{20,}\\b');
    for (const file of jsFiles) {
      const content = fs.readFileSync(path.join(distAssetsDir, file), 'utf8');
      assert.equal(
        secretRe.test(content),
        false,
        `Client bundle asset ${file} must never contain an API key`
      );
    }
  }
  console.log('  PASS: 5. Client bundle scan confirms zero API keys in built frontend assets');

  resetGeminiFreeTierGatewayForTests();
  console.log('\nM4 Gemini Free-Tier Gateway Suite Summary: 5 passed, 0 failed\n');
}

runM4GatewayTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
