/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

export type OfflineMutationCollection =
  | 'users'
  | 'benchSessions'
  | 'diagnosticLogs'
  | 'pcbScans'
  | 'benchPreferences'
  | 'faultSequences';

export type OfflineMutationState =
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'retryable'
  | 'failed'
  | 'conflict';

export type OfflineMutationOperationType = 'UPSERT' | 'DELETE';

export type SyncErrorCategory =
  | 'NETWORK'
  | 'SERVER'
  | 'AUTH'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'UNKNOWN';

export interface OfflineMutationRecord<T = Record<string, unknown>> {
  mutationId?: string;
  idempotencyKey: string;
  uid: string;
  collection: OfflineMutationCollection;
  docId: string;
  operationType?: OfflineMutationOperationType;
  payload: T;
  version: number;
  baseUpdatedAtMs?: number;
  createdAtMs: number;
  updatedAtMs: number;
  attempts: number;
  nextRetryAtMs: number;
  queueState?: OfflineMutationState;
  errorCategory?: SyncErrorCategory;
  syncStartedAtMs?: number;
  lastError?: string;
  conflictServerVersion?: number;
  conflictServerData?: unknown;
  conflictDetectedAtMs?: number;
  lastAckServerVersion?: number;
}

export interface LocalCachedDoc<T = Record<string, unknown>> {
  cacheKey: string;
  uid: string;
  collection: OfflineMutationCollection;
  docId: string;
  data: T;
  version: number;
  updatedAtMs: number;
  syncState: 'SYNCED_CLOUD' | 'QUEUED_OFFLINE' | 'ERROR';
}

export interface MutationVersionStamp {
  version: number;
  updatedAtMs: number;
}

export interface MarkMutationSyncedOptions {
  expectedVersion?: number;
  expectedUpdatedAtMs?: number;
  ack?: ServerSyncAcknowledgement;
}

export interface ServerSyncAcknowledgement {
  mutationId?: string;
  entityId?: string;
  serverVersion?: number;
  idempotencyResult?: 'APPLIED' | 'DUPLICATE_IGNORED';
}

export interface OfflineStorageDiagnostics {
  storageBackend: 'INDEXED_DB' | 'MEMORY_FALLBACK';
  indexedDbDegradedReason: string | null;
  quotaBytes: number | null;
  usageBytes: number | null;
  usageRatio: number | null;
  queuedMutationCount: number;
  cachedDocCount: number;
  disposableSyncedCacheCount: number;
}

export type CloudSyncState = 'IDLE' | 'SYNCING' | 'OFFLINE_QUEUED' | 'ERROR';

export interface CloudSyncStatusSnapshot {
  state: CloudSyncState;
  pendingCount: number;
  failedCount: number;
  retryableCount?: number;
  conflictCount?: number;
  authRequired?: boolean;
  nextRetryAtMs: number | null;
  pendingCollections: OfflineMutationCollection[];
  lastSyncedAtMs: number | null;
  lastError: string | null;
}

export interface SavePersistenceResult {
  id: string;
  syncedToCloud: boolean;
  queuedOffline: boolean;
  syncState: 'SYNCED_CLOUD' | 'QUEUED_OFFLINE';
  conflictForked?: boolean;
  conflictOriginalId?: string;
}

const DB_NAME = 'virtual_ecu_lab_offline_v1';
const DB_VERSION = 2;
const STORE_QUEUE = 'mutation_queue';
const STORE_CACHE = 'local_records';

const RETRY_BACKOFF_MS = [2_000, 5_000, 15_000, 30_000, 60_000];
export const MAX_RETRY_ATTEMPTS = 6;
const SYNC_LEASE_TIMEOUT_MS = 120_000;

let indexedDbDegraded = false;
let indexedDbDegradedReason: string | null = null;

// In-memory fallback for Node/test environments or restricted/Incognito IndexedDB
const memoryQueue = new Map<string, OfflineMutationRecord>();
const memoryCache = new Map<string, LocalCachedDoc>();
const latestStampByKey = new Map<string, MutationVersionStamp>();

let currentSyncState: CloudSyncStatusSnapshot = {
  state: 'IDLE',
  pendingCount: 0,
  failedCount: 0,
  retryableCount: 0,
  conflictCount: 0,
  authRequired: false,
  nextRetryAtMs: null,
  pendingCollections: [],
  lastSyncedAtMs: null,
  lastError: null,
};

const syncListeners = new Set<(snapshot: CloudSyncStatusSnapshot) => void>();

function notifyListeners(): void {
  const snapshot: CloudSyncStatusSnapshot = { ...currentSyncState };
  syncListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      /* Listener errors must not break sync state notifications */
    }
  });
}

function updateSyncSnapshot(partial: Partial<CloudSyncStatusSnapshot>): void {
  currentSyncState = {
    ...currentSyncState,
    ...partial,
  };
  notifyListeners();
}

export function getSyncStatusSnapshot(): CloudSyncStatusSnapshot {
  return {
    ...currentSyncState,
    pendingCollections: [...currentSyncState.pendingCollections],
  };
}

export function subscribeSyncStatus(
  listener: (snapshot: CloudSyncStatusSnapshot) => void
): () => void {
  syncListeners.add(listener);
  listener({ ...currentSyncState });
  return () => {
    syncListeners.delete(listener);
  };
}

function hasIndexedDb(): boolean {
  return !indexedDbDegraded && typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function generateMutationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `mut-${crypto.randomUUID()}`;
  }
  return `mut-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const VALID_COLLECTIONS = new Set<OfflineMutationCollection>([
  'users',
  'benchSessions',
  'diagnosticLogs',
  'pcbScans',
  'benchPreferences',
  'faultSequences',
]);

function validateEntityIdentifiers(
  uid: string,
  collection: OfflineMutationCollection,
  docId: string
): void {
  if (typeof uid !== 'string' || !uid.trim()) {
    throw new Error('Offline persistence validation failed: uid must be a non-empty string.');
  }
  if (!VALID_COLLECTIONS.has(collection)) {
    throw new Error(`Offline persistence validation failed: unsupported collection "${String(collection)}".`);
  }
  if (typeof docId !== 'string' || !docId.trim()) {
    throw new Error('Offline persistence validation failed: docId must be a non-empty string.');
  }
}

function isQuotaExceededError(err: unknown): boolean {
  if (!err) return false;
  const name = err instanceof Error ? err.name : '';
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    name === 'QuotaExceededError' ||
    msg.includes('quotaexceeded') ||
    msg.includes('quota exceeded') ||
    msg.includes('disk full')
  );
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      const tx = req.transaction;
      let qStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        qStore = db.createObjectStore(STORE_QUEUE, { keyPath: 'idempotencyKey' });
      } else if (tx) {
        qStore = tx.objectStore(STORE_QUEUE);
      } else {
        return;
      }
      if (!qStore.indexNames.contains('uid')) {
        qStore.createIndex('uid', 'uid', { unique: false });
      }
      if (!qStore.indexNames.contains('queueState')) {
        qStore.createIndex('queueState', 'queueState', { unique: false });
      }
      if (!qStore.indexNames.contains('nextRetryAtMs')) {
        qStore.createIndex('nextRetryAtMs', 'nextRetryAtMs', { unique: false });
      }

      let cStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        cStore = db.createObjectStore(STORE_CACHE, { keyPath: 'cacheKey' });
      } else if (tx) {
        cStore = tx.objectStore(STORE_CACHE);
      } else {
        return;
      }
      if (!cStore.indexNames.contains('uid_collection')) {
        cStore.createIndex('uid_collection', ['uid', 'collection'], { unique: false });
      }
      if (!cStore.indexNames.contains('syncState')) {
        cStore.createIndex('syncState', 'syncState', { unique: false });
      }
      if (!cStore.indexNames.contains('updatedAtMs')) {
        cStore.createIndex('updatedAtMs', 'updatedAtMs', { unique: false });
      }
    };

    req.onblocked = () => {
      if (!settled) {
        settled = true;
        reject(new Error('IndexedDB upgrade blocked by another open AutoElectric Lab Pro tab.'));
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        try {
          db.close();
        } catch {
          // Ignore close error during version change
        }
      };
      if (!settled) {
        settled = true;
        resolve(db);
      }
    };

    req.onerror = () => {
      if (!settled) {
        settled = true;
        reject(req.error || new Error('Failed to open IndexedDB sync store'));
      }
    };
  });
}

async function openOfflineDbWithFallback(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return null;
  try {
    return await openOfflineDb();
  } catch (err) {
    indexedDbDegraded = true;
    indexedDbDegradedReason = err instanceof Error ? err.message : String(err);
    return null;
  }
}

async function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openOfflineDbWithFallback();
  if (!db) {
    if (storeName === STORE_QUEUE) {
      return memoryQueue.get(key) as unknown as T | undefined;
    }
    return memoryCache.get(key) as unknown as T | undefined;
  }
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error || new Error('IndexedDB key read failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB read transaction aborted'));
    });
  } finally {
    db.close();
  }
}

async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openOfflineDbWithFallback();
  if (!db) {
    if (storeName === STORE_QUEUE) {
      const rec = value as unknown as OfflineMutationRecord;
      memoryQueue.set(rec.idempotencyKey, rec);
    } else {
      const rec = value as unknown as LocalCachedDoc;
      memoryCache.set(rec.cacheKey, rec);
    }
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB write transaction aborted'));
    });
  } catch (err) {
    if (isQuotaExceededError(err)) {
      // Controlled disposable cleanup: ONLY evict already-synced cache records, never queued mutations
      await purgeDisposableSyncedCache({ maxToRemove: 25 });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed after quota cleanup'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB retry transaction aborted'));
      });
      return;
    }
    throw err;
  } finally {
    db.close();
  }
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await openOfflineDbWithFallback();
  if (!db) {
    if (storeName === STORE_QUEUE) {
      memoryQueue.delete(key);
    } else {
      memoryCache.delete(key);
    }
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB delete transaction aborted'));
    });
  } finally {
    db.close();
  }
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openOfflineDbWithFallback();
  if (!db) {
    if (storeName === STORE_QUEUE) {
      return Array.from(memoryQueue.values()) as unknown as T[];
    }
    return Array.from(memoryCache.values()) as unknown as T[];
  }
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB read-all transaction aborted'));
    });
  } finally {
    db.close();
  }
}

/**
 * Controlled cleanup for disposable synced cache entries ONLY.
 * NEVER deletes unsynchronized QUEUED_OFFLINE records or any mutation_queue item.
 */
export async function purgeDisposableSyncedCache(options?: {
  olderThanMs?: number;
  maxToRemove?: number;
}): Promise<{ removedCount: number; preservedUnsyncedCount: number }> {
  const allCached = await idbGetAll<LocalCachedDoc>(STORE_CACHE);
  const queued = await idbGetAll<OfflineMutationRecord>(STORE_QUEUE);
  const protectedKeys = new Set(queued.map((q) => q.idempotencyKey));

  const cutoff = options?.olderThanMs ? Date.now() - options.olderThanMs : Number.POSITIVE_INFINITY;
  const maxToRemove = options?.maxToRemove ?? 50;

  const disposable = allCached
    .filter(
      (doc) =>
        doc.syncState === 'SYNCED_CLOUD' &&
        !protectedKeys.has(doc.cacheKey) &&
        doc.updatedAtMs <= cutoff
    )
    .sort((a, b) => a.updatedAtMs - b.updatedAtMs)
    .slice(0, maxToRemove);

  for (const doc of disposable) {
    await idbDelete(STORE_CACHE, doc.cacheKey);
  }

  return {
    removedCount: disposable.length,
    preservedUnsyncedCount: allCached.length - disposable.length,
  };
}

export async function getOfflineStorageDiagnostics(): Promise<OfflineStorageDiagnostics> {
  const [queued, cached] = await Promise.all([
    idbGetAll<OfflineMutationRecord>(STORE_QUEUE),
    idbGetAll<LocalCachedDoc>(STORE_CACHE),
  ]);
  const protectedKeys = new Set(queued.map((q) => q.idempotencyKey));
  const disposableSyncedCacheCount = cached.filter(
    (doc) => doc.syncState === 'SYNCED_CLOUD' && !protectedKeys.has(doc.cacheKey)
  ).length;

  let quotaBytes: number | null = null;
  let usageBytes: number | null = null;
  let usageRatio: number | null = null;

  if (
    typeof navigator !== 'undefined' &&
    navigator.storage &&
    typeof navigator.storage.estimate === 'function'
  ) {
    try {
      const est = await navigator.storage.estimate();
      if (typeof est.quota === 'number') quotaBytes = est.quota;
      if (typeof est.usage === 'number') usageBytes = est.usage;
      if (quotaBytes && quotaBytes > 0 && usageBytes !== null) {
        usageRatio = Number((usageBytes / quotaBytes).toFixed(4));
      }
    } catch {
      // Ignore storage estimate failure
    }
  }

  return {
    storageBackend: hasIndexedDb() ? 'INDEXED_DB' : 'MEMORY_FALLBACK',
    indexedDbDegradedReason,
    quotaBytes,
    usageBytes,
    usageRatio,
    queuedMutationCount: queued.length,
    cachedDocCount: cached.length,
    disposableSyncedCacheCount,
  };
}

export function buildIdempotencyKey(
  uid: string,
  collection: OfflineMutationCollection,
  docId: string
): string {
  return `${uid}:${collection}:${docId}`;
}

/**
 * Reserves a strictly increasing (version, updatedAtMs) stamp for a document mutation.
 * Calling this at the start of an online or offline write ensures slower in-flight
 * operations can never overwrite or delete a newer mutation for the same document.
 */
export function reserveMutationStamp(
  uid: string,
  collection: OfflineMutationCollection,
  docId: string,
  explicitUpdatedAtMs?: number
): MutationVersionStamp {
  const key = buildIdempotencyKey(uid, collection, docId);
  const prev = latestStampByKey.get(key);
  const now = explicitUpdatedAtMs !== undefined ? explicitUpdatedAtMs : Date.now();
  const version = (prev?.version ?? 0) + 1;
  const updatedAtMs =
    explicitUpdatedAtMs !== undefined
      ? explicitUpdatedAtMs
      : Math.max(now, (prev?.updatedAtMs ?? 0) + 1);
  latestStampByKey.set(key, {
    version: Math.max(version, prev?.version ?? 0),
    updatedAtMs: Math.max(updatedAtMs, prev?.updatedAtMs ?? 0),
  });
  return { version, updatedAtMs };
}

function recordKnownStamp(key: string, version: number, updatedAtMs: number): void {
  const prev = latestStampByKey.get(key);
  latestStampByKey.set(key, {
    version: Math.max(version, prev?.version ?? 0),
    updatedAtMs: Math.max(updatedAtMs, prev?.updatedAtMs ?? 0),
  });
}

function isExistingRecordNewer(
  existing: { version?: number; updatedAtMs?: number } | undefined,
  candidateVersion?: number,
  candidateUpdatedAtMs?: number
): boolean {
  if (!existing) return false;
  if (
    candidateVersion !== undefined &&
    typeof existing.version === 'number' &&
    existing.version > candidateVersion
  ) {
    return true;
  }
  if (
    candidateUpdatedAtMs !== undefined &&
    typeof existing.updatedAtMs === 'number' &&
    existing.updatedAtMs > candidateUpdatedAtMs
  ) {
    return true;
  }
  return false;
}

export function isTransientOfflineError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return (
    msg.includes('offline') ||
    msg.includes('unavailable') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('deadline-exceeded') ||
    msg.includes('timeout') ||
    msg.includes('firestore_offline_suppressed')
  );
}

export function classifySyncError(err: unknown): SyncErrorCategory {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '').toLowerCase()
      : '';
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: unknown }).status)
      : NaN;

  if (
    status === 401 ||
    status === 403 ||
    code.includes('unauthenticated') ||
    code.includes('permission-denied') ||
    msg.includes('unauthenticated') ||
    msg.includes('auth/id-token-expired') ||
    msg.includes('token expired') ||
    msg.includes('unauthorized') ||
    msg.includes('401')
  ) {
    return 'AUTH';
  }
  if (
    status === 409 ||
    code.includes('aborted') ||
    code.includes('conflict') ||
    msg.includes('conflict') ||
    msg.includes('stale revision') ||
    msg.includes('version mismatch')
  ) {
    return 'CONFLICT';
  }
  if (
    status === 400 ||
    status === 422 ||
    code.includes('invalid-argument') ||
    msg.includes('validation') ||
    msg.includes('invalid payload') ||
    msg.includes('invalid-argument') ||
    msg.includes('schema')
  ) {
    return 'VALIDATION';
  }
  if (
    (Number.isFinite(status) && status >= 500) ||
    status === 429 ||
    code.includes('internal') ||
    code.includes('resource-exhausted') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('rate limit')
  ) {
    return 'SERVER';
  }
  if (isTransientOfflineError(err)) return 'NETWORK';
  return 'UNKNOWN';
}

export function computeExponentialBackoffWithJitter(
  attempts: number,
  randomFn: () => number = Math.random
): number {
  const safeAttempt = Math.max(1, attempts);
  const baseMs = RETRY_BACKOFF_MS[Math.min(safeAttempt - 1, RETRY_BACKOFF_MS.length - 1)];
  // Bounded ±20% jitter so reconnecting clients do not thundering-herd the backend
  const jitterFactor = 0.8 + Math.min(1, Math.max(0, randomFn())) * 0.4;
  return Math.round(baseMs * jitterFactor);
}

function summarizePendingQueue(records: OfflineMutationRecord[]): {
  pendingCount: number;
  failedCount: number;
  retryableCount: number;
  conflictCount: number;
  authRequired: boolean;
  nextRetryAtMs: number | null;
  pendingCollections: OfflineMutationCollection[];
  latestQueuedError: string | null;
} {
  let failedCount = 0;
  let retryableCount = 0;
  let conflictCount = 0;
  let authRequired = false;
  let earliestRetry: number | null = null;
  let latestQueuedError: string | null = null;
  let latestErrorTs = -1;
  const collections = new Set<OfflineMutationCollection>();

  for (const rec of records) {
    collections.add(rec.collection);
    const state = rec.queueState ?? (rec.attempts > 0 ? 'retryable' : 'pending');
    if (state === 'conflict') {
      conflictCount += 1;
    }
    if (state === 'retryable') {
      retryableCount += 1;
    }
    if (rec.errorCategory === 'AUTH') {
      authRequired = true;
    }
    if (rec.attempts > 0 || state === 'failed' || state === 'conflict') {
      failedCount += 1;
      if (
        state !== 'failed' &&
        state !== 'conflict' &&
        typeof rec.nextRetryAtMs === 'number' &&
        (earliestRetry === null || rec.nextRetryAtMs < earliestRetry)
      ) {
        earliestRetry = rec.nextRetryAtMs;
      }
    }
    if (rec.lastError && rec.updatedAtMs >= latestErrorTs) {
      latestQueuedError = rec.lastError;
      latestErrorTs = rec.updatedAtMs;
    }
  }

  return {
    pendingCount: records.length,
    failedCount,
    retryableCount,
    conflictCount,
    authRequired,
    nextRetryAtMs: earliestRetry,
    pendingCollections: Array.from(collections),
    latestQueuedError,
  };
}

export async function refreshPendingCount(uid?: string): Promise<number> {
  const all = await idbGetAll<OfflineMutationRecord>(STORE_QUEUE);
  const filtered = uid ? all.filter((m) => m.uid === uid) : all;
  const summary = summarizePendingQueue(filtered);
  const count = summary.pendingCount;
  updateSyncSnapshot({
    pendingCount: count,
    failedCount: summary.failedCount,
    retryableCount: summary.retryableCount,
    conflictCount: summary.conflictCount,
    authRequired: summary.authRequired,
    nextRetryAtMs: summary.nextRetryAtMs,
    pendingCollections: summary.pendingCollections,
    state:
      count > 0
        ? currentSyncState.state === 'SYNCING'
          ? 'SYNCING'
          : currentSyncState.state === 'ERROR' || summary.conflictCount > 0 || summary.authRequired
            ? 'ERROR'
            : 'OFFLINE_QUEUED'
        : currentSyncState.lastError
          ? 'ERROR'
          : 'IDLE',
  });
  return count;
}

export async function cacheLocalDocument<T = Record<string, unknown>>(input: {
  uid: string;
  collection: OfflineMutationCollection;
  docId: string;
  data: T;
  syncState: 'SYNCED_CLOUD' | 'QUEUED_OFFLINE' | 'ERROR';
  version?: number;
  updatedAtMs?: number;
}): Promise<void> {
  validateEntityIdentifiers(input.uid, input.collection, input.docId);
  if (input.data === undefined || input.data === null) {
    throw new Error('Offline cache validation failed: data payload cannot be null or undefined.');
  }
  const cacheKey = buildIdempotencyKey(input.uid, input.collection, input.docId);
  const existingCache = await idbGet<LocalCachedDoc<T>>(STORE_CACHE, cacheKey);

  if (isExistingRecordNewer(existingCache, input.version, input.updatedAtMs)) {
    return;
  }

  const tracked = latestStampByKey.get(cacheKey);
  const version =
    input.version ??
    Math.max((existingCache?.version ?? 0) + 1, tracked?.version ?? 1);
  const updatedAtMs =
    input.updatedAtMs ??
    Math.max(Date.now(), (existingCache?.updatedAtMs ?? 0) + 1, tracked?.updatedAtMs ?? 0);

  recordKnownStamp(cacheKey, version, updatedAtMs);

  const record: LocalCachedDoc<T> = {
    cacheKey,
    uid: input.uid,
    collection: input.collection,
    docId: input.docId,
    data: input.data,
    version,
    updatedAtMs,
    syncState: input.syncState,
  };
  await idbPut(STORE_CACHE, record);
}

export async function getLocalCachedDocuments<T = Record<string, unknown>>(
  uid: string,
  collection: OfflineMutationCollection
): Promise<LocalCachedDoc<T>[]> {
  const all = await idbGetAll<LocalCachedDoc<T>>(STORE_CACHE);
  return all
    .filter((item) => item && item.uid === uid && item.collection === collection)
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export async function removeLocalCachedDocument(
  uid: string,
  collection: OfflineMutationCollection,
  docId: string
): Promise<void> {
  const cacheKey = buildIdempotencyKey(uid, collection, docId);
  await idbDelete(STORE_CACHE, cacheKey);
  await idbDelete(STORE_QUEUE, cacheKey);
  latestStampByKey.delete(cacheKey);
  await refreshPendingCount(uid);
}

export async function enqueueOfflineMutation<T = Record<string, unknown>>(input: {
  uid: string;
  collection: OfflineMutationCollection;
  docId: string;
  payload: T;
  operationType?: OfflineMutationOperationType;
  lastError?: string;
  version?: number;
  updatedAtMs?: number;
  baseUpdatedAtMs?: number;
}): Promise<OfflineMutationRecord<T>> {
  validateEntityIdentifiers(input.uid, input.collection, input.docId);
  if (input.payload === undefined || input.payload === null) {
    throw new Error('Offline mutation validation failed: payload cannot be null or undefined.');
  }

  const idempotencyKey = buildIdempotencyKey(input.uid, input.collection, input.docId);
  const existing = await idbGet<OfflineMutationRecord<T>>(STORE_QUEUE, idempotencyKey);
  const existingCache = await idbGet<LocalCachedDoc<T>>(STORE_CACHE, idempotencyKey);

  // Never allow a slower/older in-flight mutation to overwrite a newer queued or cached mutation
  if (existing && isExistingRecordNewer(existing, input.version, input.updatedAtMs)) {
    await refreshPendingCount(input.uid);
    return existing;
  }
  if (
    !existing &&
    existingCache &&
    isExistingRecordNewer(existingCache, input.version, input.updatedAtMs)
  ) {
    const staleIgnoredRecord: OfflineMutationRecord<T> = {
      mutationId: generateMutationId(),
      idempotencyKey,
      uid: input.uid,
      collection: input.collection,
      docId: input.docId,
      operationType: input.operationType ?? 'UPSERT',
      payload: existingCache.data,
      version: existingCache.version,
      baseUpdatedAtMs: input.baseUpdatedAtMs,
      createdAtMs: existingCache.updatedAtMs,
      updatedAtMs: existingCache.updatedAtMs,
      attempts: 0,
      nextRetryAtMs: existingCache.updatedAtMs,
      queueState: 'pending',
      lastError: input.lastError,
    };
    await refreshPendingCount(input.uid);
    return staleIgnoredRecord;
  }

  const tracked = latestStampByKey.get(idempotencyKey);
  const highestKnownVersion = Math.max(
    existing?.version ?? 0,
    existingCache?.version ?? 0,
    tracked?.version ?? 0
  );
  const highestKnownTimestamp = Math.max(
    existing?.updatedAtMs ?? 0,
    existingCache?.updatedAtMs ?? 0,
    tracked?.updatedAtMs ?? 0
  );

  const now = Date.now();
  const version = input.version !== undefined ? input.version : highestKnownVersion + 1;
  const updatedAtMs =
    input.updatedAtMs !== undefined
      ? input.updatedAtMs
      : Math.max(now, highestKnownTimestamp + 1);

  recordKnownStamp(idempotencyKey, version, updatedAtMs);

  // Preserve the original cloud baseUpdatedAtMs across consecutive offline edits (V1 -> V2 -> V3)
  const resolvedBaseUpdatedAtMs = existing?.baseUpdatedAtMs ?? input.baseUpdatedAtMs;
  const isDeleteTombstone =
    typeof input.payload === 'object' &&
    input.payload !== null &&
    (input.payload as { _deleted?: unknown })._deleted === true;

  const record: OfflineMutationRecord<T> = {
    mutationId: existing?.mutationId ?? generateMutationId(),
    idempotencyKey,
    uid: input.uid,
    collection: input.collection,
    docId: input.docId,
    operationType: input.operationType ?? (isDeleteTombstone ? 'DELETE' : 'UPSERT'),
    payload: input.payload,
    version,
    ...(resolvedBaseUpdatedAtMs !== undefined ? { baseUpdatedAtMs: resolvedBaseUpdatedAtMs } : {}),
    createdAtMs: existing?.createdAtMs ?? updatedAtMs,
    updatedAtMs,
    attempts: 0,
    nextRetryAtMs: now,
    queueState: 'pending',
    lastError: input.lastError,
  };

  await idbPut(STORE_QUEUE, record);
  await cacheLocalDocument({
    uid: input.uid,
    collection: input.collection,
    docId: input.docId,
    data: input.payload,
    syncState: 'QUEUED_OFFLINE',
    version,
    updatedAtMs,
  });
  await refreshPendingCount(input.uid);
  return record;
}

export async function markMutationSynced<T = Record<string, unknown>>(
  uid: string,
  collection: OfflineMutationCollection,
  docId: string,
  syncedData?: T,
  options?: MarkMutationSyncedOptions
): Promise<boolean> {
  const idempotencyKey = buildIdempotencyKey(uid, collection, docId);
  const currentQueued = await idbGet<OfflineMutationRecord<T>>(STORE_QUEUE, idempotencyKey);
  const currentCached = await idbGet<LocalCachedDoc<T>>(STORE_CACHE, idempotencyKey);

  // Validate server acknowledgement identity when supplied
  if (options?.ack) {
    if (
      options.ack.entityId !== undefined &&
      options.ack.entityId !== docId
    ) {
      return false;
    }
    if (
      options.ack.mutationId !== undefined &&
      currentQueued?.mutationId &&
      options.ack.mutationId !== currentQueued.mutationId
    ) {
      return false;
    }
  }

  // If a newer mutation was enqueued while this sync operation was in-flight,
  // preserve the newer queued entry and do not overwrite local cache with older data.
  if (
    currentQueued &&
    isExistingRecordNewer(
      currentQueued,
      options?.expectedVersion,
      options?.expectedUpdatedAtMs
    )
  ) {
    const all = await idbGetAll<OfflineMutationRecord>(STORE_QUEUE);
    const remainingRecords = all.filter((m) => m.uid === uid);
    const summary = summarizePendingQueue(remainingRecords);
    updateSyncSnapshot({
      pendingCount: summary.pendingCount,
      failedCount: summary.failedCount,
      retryableCount: summary.retryableCount,
      conflictCount: summary.conflictCount,
      authRequired: summary.authRequired,
      nextRetryAtMs: summary.nextRetryAtMs,
      pendingCollections: summary.pendingCollections,
      state: summary.pendingCount > 0 ? 'OFFLINE_QUEUED' : 'IDLE',
    });
    return false;
  }

  await idbDelete(STORE_QUEUE, idempotencyKey);

  if (syncedData !== undefined) {
    const hasNewerCachedDoc = isExistingRecordNewer(
      currentCached,
      options?.expectedVersion,
      options?.expectedUpdatedAtMs
    );
    if (!hasNewerCachedDoc) {
      const isDeletedTombstone =
        typeof syncedData === 'object' &&
        syncedData !== null &&
        (syncedData as { _deleted?: unknown })._deleted === true;
      if (isDeletedTombstone) {
        await idbDelete(STORE_CACHE, idempotencyKey);
      } else {
        const syncedVersion =
          options?.ack?.serverVersion ??
          options?.expectedVersion ??
          currentQueued?.version ??
          currentCached?.version ??
          1;
        const syncedUpdatedAtMs =
          options?.expectedUpdatedAtMs ??
          currentQueued?.updatedAtMs ??
          currentCached?.updatedAtMs ??
          Date.now();
        await cacheLocalDocument({
          uid,
          collection,
          docId,
          data: syncedData,
          syncState: 'SYNCED_CLOUD',
          version: syncedVersion,
          updatedAtMs: syncedUpdatedAtMs,
        });
      }
    }
  }

  const all = await idbGetAll<OfflineMutationRecord>(STORE_QUEUE);
  const remainingRecords = all.filter((m) => m.uid === uid);
  const summary = summarizePendingQueue(remainingRecords);
  updateSyncSnapshot({
    pendingCount: summary.pendingCount,
    failedCount: summary.failedCount,
    retryableCount: summary.retryableCount,
    conflictCount: summary.conflictCount,
    authRequired: summary.authRequired,
    nextRetryAtMs: summary.nextRetryAtMs,
    pendingCollections: summary.pendingCollections,
    lastSyncedAtMs: Date.now(),
    lastError: summary.failedCount > 0 ? summary.latestQueuedError : null,
    state: summary.pendingCount > 0 ? 'OFFLINE_QUEUED' : 'IDLE',
  });
  return true;
}

export async function getPendingMutations(uid?: string): Promise<OfflineMutationRecord[]> {
  const all = await idbGetAll<OfflineMutationRecord>(STORE_QUEUE);
  const filtered = uid ? all.filter((m) => m.uid === uid) : all;
  return filtered.sort((a, b) => a.createdAtMs - b.createdAtMs);
}

/**
 * Startup / restart recovery: transitions any interrupted 'syncing' records
 * (from a browser crash, reload, or expired lease) back to 'retryable' so they
 * resume cleanly without losing unsynchronized diagnostic data.
 */
export async function recoverInterruptedMutations(
  uid?: string,
  options?: { leaseTimeoutMs?: number; forceRecoverAllSyncing?: boolean }
): Promise<{ recoveredCount: number; pendingCount: number }> {
  const all = await getPendingMutations(uid);
  const now = Date.now();
  const leaseMs = options?.leaseTimeoutMs ?? SYNC_LEASE_TIMEOUT_MS;
  let recoveredCount = 0;

  for (const rec of all) {
    const isStuckSyncing =
      rec.queueState === 'syncing' &&
      (options?.forceRecoverAllSyncing ||
        !rec.syncStartedAtMs ||
        now - rec.syncStartedAtMs >= leaseMs);

    if (isStuckSyncing) {
      const recovered: OfflineMutationRecord = {
        ...rec,
        queueState: 'retryable',
        syncStartedAtMs: undefined,
        nextRetryAtMs: now,
        lastError: rec.lastError || 'Recovered interrupted synchronization after restart.',
      };
      await idbPut(STORE_QUEUE, recovered);
      recoveredCount += 1;
    }
  }

  const pendingCount = await refreshPendingCount(uid);
  return { recoveredCount, pendingCount };
}

/**
 * Manual retry for failed or retryable mutations (e.g. after user re-authenticates or fixes network).
 */
export async function retryFailedMutations(
  uid: string,
  idempotencyKeys?: string[]
): Promise<{ resetCount: number }> {
  const all = await getPendingMutations(uid);
  const keySet = idempotencyKeys ? new Set(idempotencyKeys) : null;
  const now = Date.now();
  let resetCount = 0;

  for (const rec of all) {
    if (keySet && !keySet.has(rec.idempotencyKey)) continue;
    if (rec.queueState === 'failed' || rec.queueState === 'retryable' || rec.attempts > 0) {
      await idbPut(STORE_QUEUE, {
        ...rec,
        queueState: 'pending',
        attempts: 0,
        nextRetryAtMs: now,
        errorCategory: undefined,
        lastError: undefined,
      });
      resetCount += 1;
    }
  }

  await refreshPendingCount(uid);
  return { resetCount };
}

export async function getConflictMutations(uid?: string): Promise<OfflineMutationRecord[]> {
  const all = await getPendingMutations(uid);
  return all.filter((m) => m.queueState === 'conflict');
}

export async function resolveMutationConflict<T = Record<string, unknown>>(
  uid: string,
  idempotencyKey: string,
  strategy: 'KEEP_LOCAL_RETRY' | 'ACCEPT_SERVER',
  serverDataOverride?: T
): Promise<boolean> {
  const rec = await idbGet<OfflineMutationRecord<T>>(STORE_QUEUE, idempotencyKey);
  if (!rec || rec.uid !== uid || rec.queueState !== 'conflict') {
    return false;
  }

  if (strategy === 'KEEP_LOCAL_RETRY') {
    const nextVersion = Math.max(rec.version, rec.conflictServerVersion ?? 0) + 1;
    const now = Date.now();
    await idbPut(STORE_QUEUE, {
      ...rec,
      version: nextVersion,
      updatedAtMs: Math.max(now, rec.updatedAtMs + 1),
      queueState: 'pending',
      attempts: 0,
      nextRetryAtMs: now,
      errorCategory: undefined,
      lastError: undefined,
      conflictServerVersion: undefined,
      conflictServerData: undefined,
      conflictDetectedAtMs: undefined,
    });
    await refreshPendingCount(uid);
    return true;
  }

  // ACCEPT_SERVER: preserve server record in local cache and clear queued conflict
  const acceptedData = (serverDataOverride ?? rec.conflictServerData) as T | undefined;
  const acceptedVersion = Math.max(rec.version, rec.conflictServerVersion ?? 1) + 1;
  await idbDelete(STORE_QUEUE, idempotencyKey);
  if (acceptedData !== undefined) {
    await cacheLocalDocument({
      uid: rec.uid,
      collection: rec.collection,
      docId: rec.docId,
      data: acceptedData,
      syncState: 'SYNCED_CLOUD',
      version: acceptedVersion,
      updatedAtMs: Math.max(Date.now(), rec.updatedAtMs + 1),
    });
  }
  await refreshPendingCount(uid);
  return true;
}

const activeFlushPromisesByUid = new Map<
  string,
  Promise<{ synced: number; failed: number; remaining: number }>
>();

export interface FlushExecutorOutcome {
  skipCachePayloadUpdate?: boolean;
  ack?: ServerSyncAcknowledgement;
  conflict?: {
    serverVersion?: number;
    serverData?: unknown;
    reason?: string;
  };
}

export async function flushOfflineMutations(
  uid: string,
  executor: (record: OfflineMutationRecord) => Promise<void | FlushExecutorOutcome>,
  options: {
    forceRetry?: boolean;
    onRecordSynced?: (record: OfflineMutationRecord) => void | Promise<void>;
    onRecordFailed?: (record: OfflineMutationRecord, error: unknown) => void | Promise<void>;
    onRecordConflict?: (record: OfflineMutationRecord) => void | Promise<void>;
  } = {}
): Promise<{ synced: number; failed: number; remaining: number }> {
  const flushKey = uid || '__all__';
  const existingPromise = activeFlushPromisesByUid.get(flushKey);
  if (existingPromise) {
    return existingPromise;
  }

  const flushPromise = (async () => {
    // Automatically recover any stale 'syncing' records before starting flush
    await recoverInterruptedMutations(uid);

    const now = Date.now();
    const pending = await getPendingMutations(uid);
    if (pending.length === 0) {
      updateSyncSnapshot({
        pendingCount: 0,
        failedCount: 0,
        retryableCount: 0,
        conflictCount: 0,
        authRequired: false,
        nextRetryAtMs: null,
        pendingCollections: [],
        state: 'IDLE',
        lastError: null,
      });
      return { synced: 0, failed: 0, remaining: 0 };
    }

    const initialSummary = summarizePendingQueue(pending);
    updateSyncSnapshot({
      state: 'SYNCING',
      pendingCount: initialSummary.pendingCount,
      failedCount: initialSummary.failedCount,
      retryableCount: initialSummary.retryableCount,
      conflictCount: initialSummary.conflictCount,
      authRequired: initialSummary.authRequired,
      nextRetryAtMs: initialSummary.nextRetryAtMs,
      pendingCollections: initialSummary.pendingCollections,
    });

    let synced = 0;
    let failed = 0;
    let hasNonTransientFailure = false;
    let lastBatchError: string | null = null;

    for (const record of pending) {
      const recState = record.queueState ?? (record.attempts > 0 ? 'retryable' : 'pending');
      if (recState === 'conflict') {
        continue;
      }
      if (!options.forceRetry && recState === 'failed') {
        continue;
      }
      if (!options.forceRetry && record.nextRetryAtMs > now) {
        continue;
      }

      // Mark record as actively syncing with lease timestamp
      const syncingRecord: OfflineMutationRecord = {
        ...record,
        mutationId: record.mutationId ?? generateMutationId(),
        queueState: 'syncing',
        syncStartedAtMs: Date.now(),
      };
      await idbPut(STORE_QUEUE, syncingRecord);

      try {
        const outcome = await executor(syncingRecord);

        // Explicit server conflict: preserve BOTH local and server versions without silently overwriting
        if (outcome && outcome.conflict) {
          failed += 1;
          hasNonTransientFailure = true;
          const conflictMsg =
            outcome.conflict.reason ||
            `Revision conflict on ${record.collection}/${record.docId} (server v${outcome.conflict.serverVersion ?? '?'}).`;
          lastBatchError = conflictMsg;
          const conflictedRecord: OfflineMutationRecord = {
            ...syncingRecord,
            queueState: 'conflict',
            syncStartedAtMs: undefined,
            errorCategory: 'CONFLICT',
            lastError: conflictMsg,
            conflictServerVersion: outcome.conflict.serverVersion,
            conflictServerData: outcome.conflict.serverData,
            conflictDetectedAtMs: Date.now(),
          };
          await idbPut(STORE_QUEUE, conflictedRecord);
          if (options.onRecordConflict) {
            await options.onRecordConflict(conflictedRecord);
          }
          continue;
        }

        const skipCache = Boolean(outcome && outcome.skipCachePayloadUpdate);
        const marked = await markMutationSynced(
          syncingRecord.uid,
          syncingRecord.collection,
          syncingRecord.docId,
          skipCache ? undefined : syncingRecord.payload,
          {
            expectedVersion: syncingRecord.version,
            expectedUpdatedAtMs: syncingRecord.updatedAtMs,
            ack: outcome?.ack,
          }
        );
        if (!marked && outcome?.ack) {
          throw new Error('Server acknowledgement validation failed (mutation/entity mismatch).');
        }
        if (options.onRecordSynced) {
          await options.onRecordSynced(syncingRecord);
        }
        synced += 1;
      } catch (err) {
        failed += 1;
        const category = classifySyncError(err);
        const transientOffline = category === 'NETWORK';
        if (!transientOffline) {
          hasNonTransientFailure = true;
        }
        const errMsg = err instanceof Error ? err.message : String(err);
        lastBatchError = errMsg;
        const latestQueued = await idbGet<OfflineMutationRecord>(
          STORE_QUEUE,
          record.idempotencyKey
        );
        let updatedRecord: OfflineMutationRecord = syncingRecord;
        // Only write retry state if no newer version was enqueued while executor was in-flight
        if (
          !latestQueued ||
          !isExistingRecordNewer(latestQueued, record.version, record.updatedAtMs)
        ) {
          const attempts = record.attempts + 1;
          const isPermanentValidation = category === 'VALIDATION';
          const isExhausted = attempts >= MAX_RETRY_ATTEMPTS;
          const nextState: OfflineMutationState =
            category === 'CONFLICT'
              ? 'conflict'
              : isPermanentValidation || isExhausted
                ? 'failed'
                : 'retryable';
          const backoff = computeExponentialBackoffWithJitter(attempts);
          updatedRecord = {
            ...syncingRecord,
            attempts,
            updatedAtMs: record.updatedAtMs,
            queueState: nextState,
            errorCategory: category,
            syncStartedAtMs: undefined,
            nextRetryAtMs: nextState === 'failed' ? Number.MAX_SAFE_INTEGER : Date.now() + backoff,
            lastError: errMsg,
          };
          await idbPut(STORE_QUEUE, updatedRecord);
        }
        if (options.onRecordFailed) {
          await options.onRecordFailed(updatedRecord, err);
        }
        updateSyncSnapshot({
          lastError: errMsg,
          authRequired: category === 'AUTH' ? true : currentSyncState.authRequired,
        });
        if (transientOffline || category === 'AUTH') {
          // Stop batch when offline or auth expired; keep remaining entries intact
          break;
        }
      }
    }

    const remainingList = await getPendingMutations(uid);
    const finalSummary = summarizePendingQueue(remainingList);
    const isBrowserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const resolvedLastError =
      lastBatchError ??
      (finalSummary.failedCount > 0 ? finalSummary.latestQueuedError : null);

    updateSyncSnapshot({
      pendingCount: finalSummary.pendingCount,
      failedCount: finalSummary.failedCount,
      retryableCount: finalSummary.retryableCount,
      conflictCount: finalSummary.conflictCount,
      authRequired: finalSummary.authRequired,
      nextRetryAtMs: finalSummary.nextRetryAtMs,
      pendingCollections: finalSummary.pendingCollections,
      lastError: remainingList.length === 0 && failed === 0 ? null : resolvedLastError,
      state:
        hasNonTransientFailure && !isBrowserOffline
          ? 'ERROR'
          : finalSummary.pendingCount > 0
            ? 'OFFLINE_QUEUED'
            : failed > 0
              ? 'ERROR'
              : 'IDLE',
    });

    return {
      synced,
      failed,
      remaining: finalSummary.pendingCount,
    };
  })();

  activeFlushPromisesByUid.set(flushKey, flushPromise);

  try {
    return await flushPromise;
  } finally {
    activeFlushPromisesByUid.delete(flushKey);
  }
}

export async function resetOfflineQueueForTests(): Promise<void> {
  memoryQueue.clear();
  memoryCache.clear();
  latestStampByKey.clear();
  activeFlushPromisesByUid.clear();
  indexedDbDegraded = false;
  indexedDbDegradedReason = null;
  currentSyncState = {
    state: 'IDLE',
    pendingCount: 0,
    failedCount: 0,
    retryableCount: 0,
    conflictCount: 0,
    authRequired: false,
    nextRetryAtMs: null,
    pendingCollections: [],
    lastSyncedAtMs: null,
    lastError: null,
  };
  notifyListeners();
}
