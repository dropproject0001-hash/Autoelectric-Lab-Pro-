/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import { createAutoelectricApiApp } from '../../server/createApiApp';
import { resetGeminiFreeTierGatewayForTests } from '../../server/services/geminiFreeTierGateway';
import {
  captureAdaptiveKnowledge,
  resetAdaptiveKnowledgeEngineForTests,
} from '../../services/ai/adaptiveKnowledgeEngine';
import { resetTrialStoreForTests } from '../../server/services/trialPinService';

async function runM8AdminControlCenterTests(): Promise<void> {
  console.log('\n=== M8 ADMIN AI CONTROL CENTER BACKEND RBAC & AUDIT TEST SUITE ===');
  resetGeminiFreeTierGatewayForTests();
  resetAdaptiveKnowledgeEngineForTests();
  resetTrialStoreForTests();

  const prevAdminPin = process.env.VECL_ADMIN_MASTER_PIN;
  process.env.VECL_ADMIN_MASTER_PIN = '9876543210';

  const app = createAutoelectricApiApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. Non-admin / unauthenticated requests are denied by the backend (401)
    for (const [method, endpoint] of [
      ['GET', '/api/autoelectric/admin/ai/overview'],
      ['POST', '/api/autoelectric/admin/ai/allowlist'],
      ['POST', '/api/autoelectric/admin/ai/shutoff'],
      ['POST', '/api/autoelectric/admin/ai/quota'],
      ['POST', '/api/autoelectric/admin/ai/credential-rotation'],
      ['POST', '/api/autoelectric/admin/ai/knowledge/approve'],
      ['GET', '/api/autoelectric/admin/ai/audit-log'],
    ] as const) {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify({}) : undefined,
      });
      assert.equal(res.status, 401, `Unauthenticated ${method} ${endpoint} must be denied (401)`);
    }

    // Non-admin bearer token (e.g., regular user/trial token) is also denied by backend
    const nonAdminRes = await fetch(`${baseUrl}/api/autoelectric/admin/ai/overview`, {
      headers: { Authorization: 'Bearer fake-non-admin-user-token' },
    });
    assert.equal(nonAdminRes.status, 401, 'Non-admin user token must be denied by backend');
    console.log('  PASS: 1. Non-admin & unauthenticated requests denied by backend across all admin AI routes');

    // 2. Authenticate as Master Admin via existing PIN login endpoint
    const loginRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterPin: '9876543210' }),
    });
    assert.equal(loginRes.status, 200);
    const loginJson = (await loginRes.json()) as { adminToken: string };
    assert.ok(loginJson.adminToken.startsWith('vecl_admin_v1.'));
    const adminHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginJson.adminToken}`,
    };

    // 3. Each control changes real backend state and writes an audit entry
    const allowRes = await fetch(`${baseUrl}/api/autoelectric/admin/ai/allowlist`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        modelId: 'gemini-2.5-flash',
        enabled: true,
        freeTierEligibilityVerified: true,
        verificationNotes: 'Verified free tier',
      }),
    });
    assert.equal(allowRes.status, 200);
    const allowJson = (await allowRes.json()) as { entry: { enabled: boolean } };
    assert.equal(allowJson.entry.enabled, true);

    // Paid model still rejected even for authenticated Master Admin
    const paidRes = await fetch(`${baseUrl}/api/autoelectric/admin/ai/allowlist`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        modelId: 'gpt-4o-mini',
        enabled: true,
        freeTierEligibilityVerified: true,
      }),
    });
    assert.equal(paidRes.status, 403, 'Paid model must remain blocked even for Master Admin');

    // Emergency shutoff changes real backend state
    const shutoffRes = await fetch(`${baseUrl}/api/autoelectric/admin/ai/shutoff`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ active: true, reason: 'Maintenance drill' }),
    });
    assert.equal(shutoffRes.status, 200);
    const shutoffJson = (await shutoffRes.json()) as { gateway: { cloudShutoffActive: boolean } };
    assert.equal(shutoffJson.gateway.cloudShutoffActive, true);

    // Quota update changes real backend state
    const quotaRes = await fetch(`${baseUrl}/api/autoelectric/admin/ai/quota`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ dailyQuotaLimit: 120, rpmLimit: 6 }),
    });
    assert.equal(quotaRes.status, 200);
    const quotaJson = (await quotaRes.json()) as {
      gateway: { dailyQuotaLimit: number; rpmLimit: number };
    };
    assert.equal(quotaJson.gateway.dailyQuotaLimit, 120);
    assert.equal(quotaJson.gateway.rpmLimit, 6);

    // Credential rotation checklist audit
    const rotRes = await fetch(`${baseUrl}/api/autoelectric/admin/ai/credential-rotation`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ note: 'Q4 key rotation done', intervalDays: 90 }),
    });
    assert.equal(rotRes.status, 200);

    // Knowledge verification queue approval changes real backend state
    const captured = captureAdaptiveKnowledge({
      title: 'Isuzu D-Max 4JJ1 Rail Pressure Sensor Ref',
      content: 'Sensor supply Pin 1 is 5.0V Key-ON.',
      origin: 'AI_ASSISTED_DRAFT',
      ecuIdentity: { manufacturer: 'Isuzu', partNumber: '897380-4JJ1' },
      sourceDocument: 'Isuzu Workshop Reference',
      testConditions: 'IG-ON Engine OFF',
      actor: 'ai-orchestrator',
    });
    const approveRes = await fetch(`${baseUrl}/api/autoelectric/admin/ai/knowledge/approve`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        id: captured.item!.id,
        targetStatus: 'VERIFIED',
        reviewNote: 'Confirmed against Isuzu manual',
      }),
    });
    assert.equal(approveRes.status, 200);
    console.log('  PASS: 2. All Admin AI controls mutate real backend state cleanly');

    // 4. Verify every admin action wrote an audit entry
    const auditRes = await fetch(`${baseUrl}/api/autoelectric/admin/ai/audit-log`, {
      headers: { Authorization: `Bearer ${loginJson.adminToken}` },
    });
    assert.equal(auditRes.status, 200);
    const auditJson = (await auditRes.json()) as { auditLog: Array<{ action: string }> };
    const actions = auditJson.auditLog.map((e) => e.action);
    assert.ok(actions.includes('ALLOWLIST_MODEL_ENABLED'));
    assert.ok(actions.includes('ALLOWLIST_UPDATE_BLOCKED'));
    assert.ok(actions.includes('CLOUD_SHUTOFF_ENABLED'));
    assert.ok(actions.includes('QUOTA_LIMITS_UPDATED'));
    assert.ok(actions.includes('CREDENTIAL_ROTATION_RECORDED'));
    assert.ok(actions.includes('KNOWLEDGE_APPROVED'));
    console.log('  PASS: 3. Every admin action recorded a verifiable backend audit log entry');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (prevAdminPin === undefined) delete process.env.VECL_ADMIN_MASTER_PIN;
    else process.env.VECL_ADMIN_MASTER_PIN = prevAdminPin;
    resetGeminiFreeTierGatewayForTests();
    resetAdaptiveKnowledgeEngineForTests();
    resetTrialStoreForTests();
  }

  console.log('\nM8 Admin AI Control Center Suite Summary: 3 passed, 0 failed\n');
}

runM8AdminControlCenterTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
