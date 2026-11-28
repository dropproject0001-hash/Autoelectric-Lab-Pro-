/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type {
  KnowledgeLifecycleStatus,
  RepairReferenceRecord,
} from '../types/automotiveKnowledge';

/**
 * Incremental Knowledge Sync Engine (Master Developer Instruction v1.1, Section 12).
 * Keeps 4 distinct storage layers clearly separated:
 *  1. Authoritative Database (central versioned records)
 *  2. Device-Local Cache (local working copy + unsynced pending queue)
 *  3. Offline Document Storage (Service Worker Cache Storage app shell)
 *  4. Search Index (MiniSearch in-memory index rebuilt from synced local cache)
 *
 * Guarantees:
 * - Cursor-based incremental delta sync (never re-downloads the entire database)
 * - Stable IDs, monotonic versioning, idempotent replay, tombstone deletion propagation
 * - Anti-overwrite guard: unverified local records NEVER overwrite approved central records
 */

export interface SyncEnvelopeRecord {
  id: string;
  revision: number;
  updatedAt: string;
  deletedAt: string | null;
  lifecycleStatus: KnowledgeLifecycleStatus;
  record: RepairReferenceRecord;
}

export interface PendingLocalKnowledgeMutation {
  mutationId: string;
  idempotencyKey: string;
  recordId: string;
  operation: 'UPSERT' | 'DELETE';
  baseRevision: number;
  lifecycleStatus: KnowledgeLifecycleStatus;
  record?: RepairReferenceRecord;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

export interface IncrementalSyncConflict {
  recordId: string;
  reason: string;
  centralStatus: KnowledgeLifecycleStatus;
  localStatus: KnowledgeLifecycleStatus;
  centralRevision: number;
  localMutationId: string;
  detectedAt: string;
}

export interface IncrementalSyncResult {
  online: boolean;
  pulledDeltaCount: number;
  pushedMutationCount: number;
  appliedDeletions: number;
  conflicts: IncrementalSyncConflict[];
  newCursorRevision: number;
  cloudFeaturesAvailable: boolean;
  statusMessage: string;
}

export interface CentralKnowledgeStoreAdapter {
  pullDeltasSince: (sinceRevision: number) => Promise<{
    deltas: SyncEnvelopeRecord[];
    latestRevision: number;
  }>;
  pushMutation: (mutation: PendingLocalKnowledgeMutation) => Promise<{
    accepted: boolean;
    conflict?: IncrementalSyncConflict;
    assignedRevision?: number;
  }>;
}

export function isTrustedLifecycleStatus(status: KnowledgeLifecycleStatus): boolean {
  return status === 'VERIFIED' || status === 'TECHNICIAN_CONFIRMED';
}

/**
 * Authoritative central store conflict guard (can be reused on backend or in-memory sync tests):
 * NEVER permits an unverified local record to overwrite an approved central record.
 */
export function evaluateCentralOverwriteGuard(params: {
  centralRecord: SyncEnvelopeRecord | undefined;
  incomingMutation: PendingLocalKnowledgeMutation;
}): { allowed: boolean; conflict?: IncrementalSyncConflict } {
  const { centralRecord, incomingMutation } = params;
  if (!centralRecord) {
    return { allowed: true };
  }

  const centralApproved = isTrustedLifecycleStatus(centralRecord.lifecycleStatus);
  const localApproved = isTrustedLifecycleStatus(incomingMutation.lifecycleStatus);

  if (centralApproved && !localApproved) {
    return {
      allowed: false,
      conflict: {
        recordId: centralRecord.id,
        reason:
          'Blocked overwrite: an unverified local record cannot overwrite an approved central record.',
        centralStatus: centralRecord.lifecycleStatus,
        localStatus: incomingMutation.lifecycleStatus,
        centralRevision: centralRecord.revision,
        localMutationId: incomingMutation.mutationId,
        detectedAt: new Date().toISOString(),
      },
    };
  }

  if (incomingMutation.baseRevision < centralRecord.revision) {
    return {
      allowed: false,
      conflict: {
        recordId: centralRecord.id,
        reason: `Version conflict: local baseRevision (${incomingMutation.baseRevision}) is older than central revision (${centralRecord.revision}).`,
        centralStatus: centralRecord.lifecycleStatus,
        localStatus: incomingMutation.lifecycleStatus,
        centralRevision: centralRecord.revision,
        localMutationId: incomingMutation.mutationId,
        detectedAt: new Date().toISOString(),
      },
    };
  }

  return { allowed: true };
}

export class LocalKnowledgeSyncManager {
  private deviceLocalCache = new Map<string, SyncEnvelopeRecord>();
  private pendingQueue = new Map<string, PendingLocalKnowledgeMutation>();
  private conflicts: IncrementalSyncConflict[] = [];
  private cursorRevision = 0;

  public getCursorRevision(): number {
    return this.cursorRevision;
  }

  public getLocalCacheSnapshot(): SyncEnvelopeRecord[] {
    return Array.from(this.deviceLocalCache.values()).filter((r) => !r.deletedAt);
  }

  public getPendingQueueSnapshot(): PendingLocalKnowledgeMutation[] {
    return Array.from(this.pendingQueue.values());
  }

  public getConflicts(): IncrementalSyncConflict[] {
    return [...this.conflicts];
  }

  public enqueueLocalUpsert(params: {
    record: RepairReferenceRecord;
    lifecycleStatus: KnowledgeLifecycleStatus;
    idempotencyKey?: string;
  }): PendingLocalKnowledgeMutation {
    const existing = this.deviceLocalCache.get(params.record.id);
    const idempotencyKey =
      params.idempotencyKey || `upsert:${params.record.id}:v${params.record.recordVersion ?? 1}`;

    const mutation: PendingLocalKnowledgeMutation = {
      mutationId: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      idempotencyKey,
      recordId: params.record.id,
      operation: 'UPSERT',
      baseRevision: existing?.revision ?? 0,
      lifecycleStatus: params.lifecycleStatus,
      record: params.record,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };

    // Idempotent queue keyed by idempotencyKey — prevents duplicate pending entries
    this.pendingQueue.set(idempotencyKey, mutation);

    // Update device-local cache optimistically without losing unsynced user work
    this.deviceLocalCache.set(params.record.id, {
      id: params.record.id,
      revision: existing?.revision ?? 0,
      updatedAt: mutation.createdAt,
      deletedAt: null,
      lifecycleStatus: params.lifecycleStatus,
      record: params.record,
    });

    return mutation;
  }

  public enqueueLocalDelete(recordId: string, lifecycleStatus: KnowledgeLifecycleStatus): PendingLocalKnowledgeMutation {
    const existing = this.deviceLocalCache.get(recordId);
    const idempotencyKey = `delete:${recordId}:rev${existing?.revision ?? 0}`;
    const mutation: PendingLocalKnowledgeMutation = {
      mutationId: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      idempotencyKey,
      recordId,
      operation: 'DELETE',
      baseRevision: existing?.revision ?? 0,
      lifecycleStatus,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    this.pendingQueue.set(idempotencyKey, mutation);
    return mutation;
  }

  public async synchronize(params: {
    isOnline: boolean;
    central: CentralKnowledgeStoreAdapter;
  }): Promise<IncrementalSyncResult> {
    if (!params.isOnline) {
      return {
        online: false,
        pulledDeltaCount: 0,
        pushedMutationCount: 0,
        appliedDeletions: 0,
        conflicts: [...this.conflicts],
        newCursorRevision: this.cursorRevision,
        cloudFeaturesAvailable: false,
        statusMessage: `Offline mode active — ${this.pendingQueue.size} pending local change(s) preserved safely for reconnection. Cloud AI unavailable offline.`,
      };
    }

    let pushedMutationCount = 0;
    const newConflicts: IncrementalSyncConflict[] = [];

    // 1. Push pending local mutations with idempotency & anti-overwrite conflict guard
    for (const [key, mutation] of Array.from(this.pendingQueue.entries())) {
      try {
        const res = await params.central.pushMutation(mutation);
        if (res.accepted) {
          this.pendingQueue.delete(key);
          pushedMutationCount += 1;
        } else if (res.conflict) {
          this.pendingQueue.delete(key);
          newConflicts.push(res.conflict);
          this.conflicts.push(res.conflict);
        }
      } catch (err: unknown) {
        mutation.attempts += 1;
        mutation.lastError = err instanceof Error ? err.message : String(err);
        this.pendingQueue.set(key, mutation);
      }
    }

    // 2. Pull ONLY incremental deltas since `this.cursorRevision` (never re-download full DB)
    const { deltas, latestRevision } = await params.central.pullDeltasSince(this.cursorRevision);
    let appliedDeletions = 0;

    for (const delta of deltas) {
      if (delta.deletedAt) {
        this.deviceLocalCache.set(delta.id, delta);
        appliedDeletions += 1;
      } else {
        this.deviceLocalCache.set(delta.id, delta);
      }
    }

    if (latestRevision > this.cursorRevision) {
      this.cursorRevision = latestRevision;
    }

    return {
      online: true,
      pulledDeltaCount: deltas.length,
      pushedMutationCount,
      appliedDeletions,
      conflicts: newConflicts,
      newCursorRevision: this.cursorRevision,
      cloudFeaturesAvailable: true,
      statusMessage: `Incremental sync complete (cursor rev ${this.cursorRevision}): pulled ${deltas.length} delta(s), pushed ${pushedMutationCount}, conflicts ${newConflicts.length}.`,
    };
  }
}
