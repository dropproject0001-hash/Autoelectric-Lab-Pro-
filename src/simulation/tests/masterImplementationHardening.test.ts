/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAX_RETRY_ATTEMPTS,
  buildIdempotencyKey,
  cacheLocalDocument,
  classifySyncError,
  computeExponentialBackoffWithJitter,
  enqueueOfflineMutation,
  flushOfflineMutations,
  getConflictMutations,
  getLocalCachedDocuments,
  getOfflineStorageDiagnostics,
  getPendingMutations,
  getSyncStatusSnapshot,
  markMutationSynced,
  purgeDisposableSyncedCache,
  recoverInterruptedMutations,
  resetOfflineQueueForTests,
  resolveMutationConflict,
  retryFailedMutations,
} from '../../services/offlineSyncQueue';
import {
  grantModelDownloadConsent,
  loadLocalWebGpuModel,
  resetLocalAiServiceForTests,
  setLocalModelLoaderForTests,
  unloadLocalWebGpuModel,
  getLocalAiRuntimeStatus,
} from '../../services/ai/localWebLlmService';
import { runUnifiedAiOrchestrator } from '../../services/ai/unifiedAiOrchestrator';
import {
  formatMicrophoneError,
  microphoneManager,
} from '../../services/ai/microphoneManager';

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL: ${name}`);
    console.error(err);
  }
}

async function main(): Promise<void> {
  console.log('\n=== MASTER IMPLEMENTATION HARDENING SUITE (PHASES 2–7) ===');

  // ── PHASE 2: OFFLINE DATABASE RELIABILITY & STORAGE MANAGEMENT ──────────
  await runTest('1. Offline DB validates identifiers/payloads, persists versions, and protects unsynced data during disposable cache cleanup', async () => {
    await resetOfflineQueueForTests();

    await assert.rejects(
      () =>
        enqueueOfflineMutation({
          uid: '',
          collection: 'benchSessions',
          docId: 'sess-bad',
          payload: { name: 'invalid' },
        }),
      /uid must be a non-empty string/
    );

    await assert.rejects(
      () =>
        cacheLocalDocument({
          uid: 'tech-1',
          collection: 'benchSessions',
          docId: 'sess-null',
          data: null as unknown as Record<string, unknown>,
          syncState: 'SYNCED_CLOUD',
        }),
      /data payload cannot be null/
    );

    // Create 1 synced disposable doc + 1 unsynced offline mutation
    await cacheLocalDocument({
      uid: 'tech-1',
      collection: 'benchSessions',
      docId: 'sess-synced-old',
      data: { title: 'Old Synced Session' },
      syncState: 'SYNCED_CLOUD',
      updatedAtMs: Date.now() - 10_000,
    });
    const queued = await enqueueOfflineMutation({
      uid: 'tech-1',
      collection: 'benchSessions',
      docId: 'sess-unsynced',
      payload: { title: 'Active Offline Bench Measurement', vbat: 12.4 },
    });

    assert.ok(queued.mutationId && queued.mutationId.startsWith('mut-'));
    assert.equal(queued.queueState, 'pending');
    assert.equal(queued.operationType, 'UPSERT');

    const diagBefore = await getOfflineStorageDiagnostics();
    assert.equal(diagBefore.queuedMutationCount, 1);
    assert.equal(diagBefore.disposableSyncedCacheCount, 1);

    const purged = await purgeDisposableSyncedCache({ maxToRemove: 10 });
    assert.equal(purged.removedCount, 1);

    const remainingDocs = await getLocalCachedDocuments('tech-1', 'benchSessions');
    assert.equal(remainingDocs.length, 1);
    assert.equal(remainingDocs[0].docId, 'sess-unsynced');
  });

  // ── PHASE 3: OUTBOX SYNC STATES, BACKOFF+JITTER, RECOVERY, ACK & CONFLICTS ─
  await runTest('2. Outbox sync classifies network/server/auth/validation errors and applies bounded jittered backoff', async () => {
    await resetOfflineQueueForTests();

    assert.equal(classifySyncError(new Error('Failed to fetch (network down)')), 'NETWORK');
    assert.equal(classifySyncError(Object.assign(new Error('Unauthorized'), { status: 401 })), 'AUTH');
    assert.equal(classifySyncError(Object.assign(new Error('Invalid payload schema'), { status: 400 })), 'VALIDATION');
    assert.equal(classifySyncError(Object.assign(new Error('Service unavailable 503'), { status: 503 })), 'SERVER');
    assert.equal(classifySyncError(Object.assign(new Error('Version mismatch conflict'), { status: 409 })), 'CONFLICT');

    const b1 = computeExponentialBackoffWithJitter(1, () => 0.0);
    const b2 = computeExponentialBackoffWithJitter(1, () => 1.0);
    assert.ok(b1 >= 1600 && b1 <= 2400 && b2 >= b1);

    // Permanent validation failure must transition straight to 'failed' (not retried indefinitely)
    await enqueueOfflineMutation({
      uid: 'tech-2',
      collection: 'diagnosticLogs',
      docId: 'log-bad-schema',
      payload: { dtc: 'INVALID' },
    });
    const res = await flushOfflineMutations('tech-2', async () => {
      throw Object.assign(new Error('Invalid payload schema'), { status: 422 });
    });
    assert.equal(res.failed, 1);
    const pending = await getPendingMutations('tech-2');
    assert.equal(pending[0].queueState, 'failed');
    assert.equal(pending[0].errorCategory, 'VALIDATION');

    // Manual retry resets failed mutation back to pending
    const retryRes = await retryFailedMutations('tech-2');
    assert.equal(retryRes.resetCount, 1);
    const afterReset = await getPendingMutations('tech-2');
    assert.equal(afterReset[0].queueState, 'pending');
    assert.equal(afterReset[0].attempts, 0);
  });

  await runTest('3. Outbox sync recovers interrupted syncing mutations, validates server ack, and preserves revision conflicts', async () => {
    await resetOfflineQueueForTests();

    const m = await enqueueOfflineMutation({
      uid: 'tech-3',
      collection: 'benchSessions',
      docId: 'sess-conflict',
      payload: { notes: 'Local oscilloscope check 12.6V' },
    });

    // Simulate verified server conflict (preserves both local + server versions)
    const conflictFlush = await flushOfflineMutations('tech-3', async () => ({
      conflict: {
        serverVersion: 5,
        serverData: { notes: 'Cloud revision v5' },
        reason: 'Server has newer revision v5',
      },
    }));
    assert.equal(conflictFlush.failed, 1);
    const conflicts = await getConflictMutations('tech-3');
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].conflictServerVersion, 5);
    assert.equal(getSyncStatusSnapshot().conflictCount, 1);

    // Resolve by keeping local & retrying with verified server ack
    const resolved = await resolveMutationConflict(
      'tech-3',
      buildIdempotencyKey('tech-3', 'benchSessions', 'sess-conflict'),
      'KEEP_LOCAL_RETRY'
    );
    assert.equal(resolved, true);

    const syncedRes = await flushOfflineMutations('tech-3', async (rec) => ({
      ack: {
        mutationId: rec.mutationId,
        entityId: rec.docId,
        serverVersion: rec.version,
        idempotencyResult: 'APPLIED',
      },
    }));
    assert.equal(syncedRes.synced, 1);
    assert.equal(syncedRes.remaining, 0);

    // Verify mismatched ack is rejected and does NOT silently mark synced
    const m2 = await enqueueOfflineMutation({
      uid: 'tech-3',
      collection: 'diagnosticLogs',
      docId: 'log-ack-check',
      payload: { code: 'P0122' },
    });
    const badAck = await markMutationSynced('tech-3', 'diagnosticLogs', 'log-ack-check', m2.payload, {
      expectedVersion: m2.version,
      ack: { entityId: 'wrong-entity-id' },
    });
    assert.equal(badAck, false);

    // Startup recovery test
    const recCheck = await recoverInterruptedMutations('tech-3', { forceRecoverAllSyncing: true });
    assert.equal(recCheck.pendingCount, 1);
    assert.ok(m.idempotencyKey.includes('sess-conflict'));
    assert.ok(MAX_RETRY_ATTEMPTS >= 5);
  });

  await runTest('4. Outbox sync pauses batch on AUTH expiration and marks authRequired=true', async () => {
    await resetOfflineQueueForTests();
    await enqueueOfflineMutation({
      uid: 'tech-auth',
      collection: 'benchSessions',
      docId: 'sess-a',
      payload: { v: 1 },
    });
    await enqueueOfflineMutation({
      uid: 'tech-auth',
      collection: 'benchSessions',
      docId: 'sess-b',
      payload: { v: 2 },
    });

    let calls = 0;
    await flushOfflineMutations('tech-auth', async () => {
      calls += 1;
      throw Object.assign(new Error('auth/id-token-expired'), { status: 401 });
    });

    assert.equal(calls, 1, 'Batch must pause immediately on AUTH error without hammering remaining items');
    assert.equal(getSyncStatusSnapshot().authRequired, true);
  });

  // ── PHASE 4 & 6: UNIFIED AI ORCHESTRATOR + WEBLLM RELIABILITY ──────────
  await runTest('5. WebLLM declares direct dependency, removes unsafe new Function eval, integrates with Unified AI Orchestrator, and unloads cleanly', async () => {
    const root = process.cwd();
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    assert.ok(pkg.dependencies?.['@mlc-ai/web-llm'], '@mlc-ai/web-llm must be declared in package.json');

    const workerSrc = fs.readFileSync(path.join(root, 'src/workers/webLlmWorker.ts'), 'utf8');
    assert.equal(workerSrc.includes('new Function('), false, 'webLlmWorker.ts must not use unsafe new Function eval');
    assert.ok(workerSrc.includes("import('@mlc-ai/web-llm')"));

    await resetLocalAiServiceForTests();
    let unloaded = false;
    grantModelDownloadConsent('android-compact-q4');
    setLocalModelLoaderForTests(async () => ({
      explain: async () =>
        'Verified OEM reference confirmed: check the listed Toyota Hilux 1KD-FTV ECM specification from the database.',
      unload: async () => {
        unloaded = true;
      },
    }));
    const loadRes = await loadLocalWebGpuModel('android-compact-q4');
    assert.equal(loadRes.ok, true);
    assert.equal(getLocalAiRuntimeStatus().executionState, 'LOCAL_WEBGPU_INFERENCE');

    const orchRes = await runUnifiedAiOrchestrator({
      query: 'Toyota Hilux 1KD-FTV 89661-0K290 pinout',
      make: 'Toyota',
      model: 'Hilux',
      allowLocalLlm: true,
      isOffline: true,
    });
    assert.equal(orchRes.executionMode, 'LOCAL_WEBGPU_LLM');
    assert.equal(orchRes.hasEvidenceGap, false);

    await unloadLocalWebGpuModel();
    assert.equal(unloaded, true);
    assert.equal(getLocalAiRuntimeStatus().executionState, 'DATABASE_ONLY');
    await resetLocalAiServiceForTests();
  });

  // ── PHASE 7: PREMIUM GLASS DRAWER & CENTRALIZED MICROPHONE LIFECYCLE ────
  await runTest('6. UnifiedAiAssistantDrawer uses Motion + Portal frosted glass while staying non-blocking, and microphoneManager prevents duplicate sessions', () => {
    const root = process.cwd();
    const drawerSrc = fs.readFileSync(
      path.join(root, 'src/components/ai/UnifiedAiAssistantDrawer.tsx'),
      'utf8'
    );
    assert.ok(drawerSrc.includes('createPortal('), 'Drawer must render through React portal');
    assert.ok(drawerSrc.includes('AnimatePresence'), 'Drawer must use Motion AnimatePresence');
    assert.ok(drawerSrc.includes('useReducedMotion'), 'Drawer must respect prefers-reduced-motion');
    assert.ok(drawerSrc.includes('backdrop-blur-[30px]'), 'Drawer must use frosted glass backdrop blur');
    assert.ok(drawerSrc.includes('aria-modal="false"'), 'Drawer must remain non-blocking for bench simulation');
    assert.equal(drawerSrc.includes('fixed inset-0'), false, 'Drawer must not block workspace with fixed inset-0');
    assert.ok(drawerSrc.includes('microphoneManager.stopAllForDrawerClose()'), 'Closing drawer must stop active mic');

    // Centralized microphone ownership prevents duplicate active recognition sessions
    microphoneManager.resetForTests();
    let firstStopped = false;
    let secondStopped = false;

    microphoneManager.claimRecognitionSession('unified-drawer-quick-mic', {
      stop: () => {
        firstStopped = true;
      },
      abort: () => {
        firstStopped = true;
      },
    });
    assert.equal(microphoneManager.getSnapshot().activeRecognitionOwner, 'unified-drawer-quick-mic');

    const claim2 = microphoneManager.claimRecognitionSession('hands-free-voice-coach', {
      stop: () => {
        secondStopped = true;
      },
      abort: () => {
        secondStopped = true;
      },
    });
    assert.equal(claim2.previousOwnerStopped, 'unified-drawer-quick-mic');
    assert.equal(firstStopped, true, 'Previous recognition owner must be stopped before starting a new one');
    assert.equal(microphoneManager.getSnapshot().activeRecognitionOwner, 'hands-free-voice-coach');

    microphoneManager.stopAllForDrawerClose();
    assert.equal(secondStopped, true, 'Drawer close must stop active recognition session');
    assert.equal(microphoneManager.getSnapshot().state, 'IDLE');
    assert.equal(microphoneManager.getSnapshot().activeRecognitionOwner, null);

    // Bilingual permission error formatting
    assert.ok(formatMicrophoneError('not-allowed', 'EN').toLowerCase().includes('permission'));
    assert.ok(formatMicrophoneError('not-allowed', 'TL').toLowerCase().includes('microphone'));
  });

  console.log(`\nMaster Implementation Hardening Summary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main();
