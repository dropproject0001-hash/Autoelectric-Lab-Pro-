/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import {
  LocalKnowledgeSyncManager,
  evaluateCentralOverwriteGuard,
  type CentralKnowledgeStoreAdapter,
  type SyncEnvelopeRecord,
} from '../../services/knowledgeIncrementalSyncService';
import { runUnifiedAiOrchestrator } from '../../services/ai/unifiedAiOrchestrator';
import {
  DEFAULT_BENCH_COMPONENTS,
  DEFAULT_ECU_PINS,
  DEFAULT_WIRES,
  solveCircuit,
} from '../../utils/circuitSolver';
import type { RepairReferenceRecord } from '../../types/automotiveKnowledge';

function makeRef(id: string, title: string, verified: boolean): RepairReferenceRecord {
  return {
    id,
    vehicleId: 'veh-toyota-hilux',
    make: 'Toyota',
    model: 'Hilux',
    years: '2018-2022',
    systemCategoryId: 'engine_management_ecu',
    title,
    referenceType: 'service_manual',
    summary: `${title} summary`,
    source: {
      sourceName: 'Toyota EWD',
      originalUrl: 'https://techinfo.toyota.com',
      sourceType: 'oem',
      collectedAt: '2026-11-27T00:00:00.000Z',
      language: 'en',
      verificationStatus: verified ? 'OEM_VERIFIED' : 'unverified',
      confidenceScore: verified ? 1 : 0.4,
    },
    tags: ['toyota', 'hilux'],
    verified,
    recordVersion: 1,
  };
}

async function runM7OfflineAndSyncTests(): Promise<void> {
  console.log('\n=== M7 OFFLINE-FIRST & INCREMENTAL SYNC TEST SUITE ===');

  // Setup simulated authoritative central store
  let centralRevision = 2;
  const centralRecords = new Map<string, SyncEnvelopeRecord>([
    [
      'rec-oem-1',
      {
        id: 'rec-oem-1',
        revision: 1,
        updatedAt: '2026-11-27T00:00:00.000Z',
        deletedAt: null,
        lifecycleStatus: 'VERIFIED',
        record: makeRef('rec-oem-1', 'Verified Toyota Hilux 5V VREF', true),
      },
    ],
    [
      'rec-oem-2',
      {
        id: 'rec-oem-2',
        revision: 2,
        updatedAt: '2026-11-27T00:01:00.000Z',
        deletedAt: null,
        lifecycleStatus: 'VERIFIED',
        record: makeRef('rec-oem-2', 'Verified Toyota Hilux CAN Bus 60 Ohms', true),
      },
    ],
  ]);

  let pullCalls = 0;
  const centralAdapter: CentralKnowledgeStoreAdapter = {
    async pullDeltasSince(sinceRevision) {
      pullCalls += 1;
      const deltas = Array.from(centralRecords.values()).filter((r) => r.revision > sinceRevision);
      return { deltas, latestRevision: centralRevision };
    },
    async pushMutation(mutation) {
      const existing = centralRecords.get(mutation.recordId);
      const guard = evaluateCentralOverwriteGuard({
        centralRecord: existing,
        incomingMutation: mutation,
      });
      if (!guard.allowed) {
        return { accepted: false, conflict: guard.conflict };
      }
      centralRevision += 1;
      if (mutation.operation === 'DELETE' && existing) {
        centralRecords.set(mutation.recordId, {
          ...existing,
          revision: centralRevision,
          deletedAt: new Date().toISOString(),
        });
      } else if (mutation.record) {
        centralRecords.set(mutation.recordId, {
          id: mutation.recordId,
          revision: centralRevision,
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          lifecycleStatus: mutation.lifecycleStatus,
          record: mutation.record,
        });
      }
      return { accepted: true, assignedRevision: centralRevision };
    },
  };

  const syncMgr = new LocalKnowledgeSyncManager();

  // 1. Initial sync pulls 2 records; subsequent sync pulls 0 (incremental, not full re-download)
  const firstSync = await syncMgr.synchronize({ isOnline: true, central: centralAdapter });
  assert.equal(firstSync.pulledDeltaCount, 2);
  assert.equal(firstSync.newCursorRevision, 2);
  assert.equal(syncMgr.getLocalCacheSnapshot().length, 2);

  const secondSync = await syncMgr.synchronize({ isOnline: true, central: centralAdapter });
  assert.equal(secondSync.pulledDeltaCount, 0, 'Incremental sync must not re-download unchanged records');
  assert.equal(pullCalls, 2);
  console.log('  PASS: 1. Cursor-based incremental sync avoids full database re-downloads');

  // 2. Offline operation: simulation, local retrieval, and unsynced queue all work with network off
  const simOffline = solveCircuit(
    { preset: '12V_BENCH', voltageSetting: 12.6, currentLimit: 2.5, isOutputEnabled: true },
    DEFAULT_ECU_PINS,
    [],
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    {
      isPowered: true,
      mode: 'V_DC',
      rangeAuto: true,
      holdValue: false,
      redProbe: { attachedToPinId: 'ecu-pin-5', attachedLabel: 'Pin #5 (VREF)' },
      blackProbe: { attachedToPinId: 'ecu-pin-1', attachedLabel: 'Pin #1 (KL31)' },
    }
  );
  assert.ok(Math.abs(simOffline.multimeterReading.value - 5.0) < 0.25);

  const offlineAi = await runUnifiedAiOrchestrator({
    query: 'Toyota Hilux fuse relay',
    make: 'toyota',
    isOffline: true,
    allowGeminiFreeTier: true, // must NOT call cloud when offline
  });
  assert.equal(offlineAi.executionMode, 'DATABASE_ONLY');
  assert.ok(offlineAi.sources.length > 0);

  // Enqueue an unverified local edit to an APPROVED central record + a new technician note (idempotent)
  syncMgr.enqueueLocalUpsert({
    record: makeRef('rec-oem-1', 'Unverified Local Overwrite Attempt', false),
    lifecycleStatus: 'CAPTURED',
    idempotencyKey: 'key-overwrite-attempt',
  });
  syncMgr.enqueueLocalUpsert({
    record: makeRef('rec-local-new', 'Offline Technician Bench Note', false),
    lifecycleStatus: 'PENDING',
    idempotencyKey: 'key-new-note',
  });
  // Duplicate enqueue with same idempotencyKey must not duplicate queue item
  syncMgr.enqueueLocalUpsert({
    record: makeRef('rec-local-new', 'Offline Technician Bench Note', false),
    lifecycleStatus: 'PENDING',
    idempotencyKey: 'key-new-note',
  });
  assert.equal(syncMgr.getPendingQueueSnapshot().length, 2, 'Idempotency key prevents duplicate mutations');

  const offlineAttempt = await syncMgr.synchronize({ isOnline: false, central: centralAdapter });
  assert.equal(offlineAttempt.online, false);
  assert.equal(offlineAttempt.cloudFeaturesAvailable, false);
  assert.equal(syncMgr.getPendingQueueSnapshot().length, 2, 'Unsynced work preserved while offline');
  console.log('  PASS: 2. Offline simulation, local retrieval, and idempotent offline queue verified');

  // 3. Reconnection syncs safely & anti-overwrite guard protects approved central record
  const reconnectSync = await syncMgr.synchronize({ isOnline: true, central: centralAdapter });
  assert.equal(reconnectSync.pushedMutationCount, 1, 'New local note pushes cleanly');
  assert.equal(reconnectSync.conflicts.length, 1, 'Unverified overwrite of approved record must conflict');
  assert.equal(
    centralRecords.get('rec-oem-1')?.record.title,
    'Verified Toyota Hilux 5V VREF',
    'Approved central record MUST NEVER be overwritten by unverified local data'
  );
  assert.equal(centralRecords.has('rec-local-new'), true, 'New offline note synced without data loss');
  console.log('  PASS: 3. Reconnection syncs without duplicates/loss and blocks unverified overwrite of approved central record');

  // 4. Deletion propagation removes deleted record from active local cache
  centralRevision += 1;
  centralRecords.set('rec-oem-2', {
    ...centralRecords.get('rec-oem-2')!,
    revision: centralRevision,
    deletedAt: new Date().toISOString(),
  });
  const deleteSync = await syncMgr.synchronize({ isOnline: true, central: centralAdapter });
  assert.equal(deleteSync.appliedDeletions, 1);
  assert.equal(
    syncMgr.getLocalCacheSnapshot().some((r) => r.id === 'rec-oem-2'),
    false,
    'Tombstone deletion must propagate to local cache'
  );
  console.log('  PASS: 4. Deletion tombstone propagation verified');

  console.log('\nM7 Offline & Incremental Sync Suite Summary: 4 passed, 0 failed\n');
}

runM7OfflineAndSyncTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
