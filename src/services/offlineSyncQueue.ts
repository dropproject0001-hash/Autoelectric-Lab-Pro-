export type OfflineMutationCollection =
  | 'users'
  | 'benchSessions'
  | 'diagnosticLogs'
  | 'pcbScans'
  | 'benchPreferences';

export interface OfflineMutationRecord<T = Record<string, unknown>> {
  idempotencyKey: string;
  uid: string;
  collection: OfflineMutationCollection;
  docId: string;
  payload: T;
  version: number;
  baseUpdatedAtMs?: number;
  createdAtMs: number;
  updatedAtMs: number;
  attempts: number;
  nextRetryAtMs: number;
  lastError?: string;
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
}

export type CloudSyncState = 'IDLE' | 'SYNCING' | 'OFFLINE_QUEUED' | 'ERROR';

export interface CloudSyncStatusSnapshot {
  state: CloudSyncState;
  pendingCount: number;
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
const DB_VERSION = 1;
const STORE_QUEUE = 'mutation_queue';
const STORE_CACHE = 'local_records';

const RETRY_BACKOFF_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

// In-memory fallback for Node/test environments without IndexedDB
const memoryQueue = new Map<string, OfflineMutationRecord>();
const memoryCache = new Map<string, LocalCachedDoc>();
const latestStampByKey = new Map<string, MutationVersionStamp>();

let currentSyncState: CloudSyncStatusSnapshot = {
  state: 'IDLE',
  pendingCount: 0,
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
  return { ...currentSyncState };
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
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const qStore = db.createObjectStore(STORE_QUEUE, { keyPath: 'idempotencyKey' });
        qStore.createIndex('uid', 'uid', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        const cStore = db.createObjectStore(STORE_CACHE, { keyPath: 'cacheKey' });
        cStore.createIndex('uid_collection', ['uid', 'collection'], { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB sync store'));
  });
}

async function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  if (!hasIndexedDb()) {
    if (storeName === STORE_QUEUE) {
      return memoryQueue.get(key) as unknown as T | undefined;
    }
    return memoryCache.get(key) as unknown as T | undefined;
  }
  const db = await openOfflineDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error || new Error('IndexedDB key read failed'));
    });
  } finally {
    db.close();
  }
}

async function idbPut<T>(storeName: string, value: T): Promise<void> {
  if (!hasIndexedDb()) {
    if (storeName === STORE_QUEUE) {
      const rec = value as unknown as OfflineMutationRecord;
      memoryQueue.set(rec.idempotencyKey, rec);
    } else {
      const rec = value as unknown as LocalCachedDoc;
      memoryCache.set(rec.cacheKey, rec);
    }
    return;
  }
  const db = await openOfflineDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
    });
  } finally {
    db.close();
  }
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  if (!hasIndexedDb()) {
    if (storeName === STORE_QUEUE) {
      memoryQueue.delete(key);
    } else {
      memoryCache.delete(key);
    }
    return;
  }
  const db = await openOfflineDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'));
    });
  } finally {
    db.close();
  }
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  if (!hasIndexedDb()) {
    if (storeName === STORE_QUEUE) {
      return Array.from(memoryQueue.values()) as unknown as T[];
    }
    return Array.from(memoryCache.values()) as unknown as T[];
  }
  const db = await openOfflineDb();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
    });
  } finally {
    db.close();
  }
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
    msg.includes('firestore_offline_suppressed')
  );
}

export async function refreshPendingCount(uid?: string): Promise<number> {
  const all = await idbGetAll<OfflineMutationRecord>(STORE_QUEUE);
  const filtered = uid ? all.filter((m) => m.uid === uid) : all;
  const count = filtered.length;
  updateSyncSnapshot({
    pendingCount: count,
    state:
      count > 0
        ? currentSyncState.state === 'SYNCING'
          ? 'SYNCING'
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
    .filter((item) => item.uid === uid && item.collection === collection)
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
  lastError?: string;
  version?: number;
  updatedAtMs?: number;
  baseUpdatedAtMs?: number;
}): Promise<OfflineMutationRecord<T>> {
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
      idempotencyKey,
      uid: input.uid,
      collection: input.collection,
      docId: input.docId,
      payload: existingCache.data,
      version: existingCache.version,
      baseUpdatedAtMs: input.baseUpdatedAtMs,
      createdAtMs: existingCache.updatedAtMs,
      updatedAtMs: existingCache.updatedAtMs,
      attempts: 0,
      nextRetryAtMs: existingCache.updatedAtMs,
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

  const record: OfflineMutationRecord<T> = {
    idempotencyKey,
    uid: input.uid,
    collection: input.collection,
    docId: input.docId,
    payload: input.payload,
    version,
    ...(resolvedBaseUpdatedAtMs !== undefined ? { baseUpdatedAtMs: resolvedBaseUpdatedAtMs } : {}),
    createdAtMs: existing?.createdAtMs ?? updatedAtMs,
    updatedAtMs,
    attempts: 0,
    nextRetryAtMs: now,
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
    const remaining = all.filter((m) => m.uid === uid).length;
    updateSyncSnapshot({
      pendingCount: remaining,
      state: remaining > 0 ? 'OFFLINE_QUEUED' : 'IDLE',
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
      const syncedVersion =
        options?.expectedVersion ?? currentQueued?.version ?? currentCached?.version ?? 1;
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

  const all = await idbGetAll<OfflineMutationRecord>(STORE_QUEUE);
  const remaining = all.filter((m) => m.uid === uid).length;
  updateSyncSnapshot({
    pendingCount: remaining,
    lastSyncedAtMs: Date.now(),
    lastError: null,
    state: remaining > 0 ? 'OFFLINE_QUEUED' : 'IDLE',
  });
  return true;
}

export async function getPendingMutations(uid?: string): Promise<OfflineMutationRecord[]> {
  const all = await idbGetAll<OfflineMutationRecord>(STORE_QUEUE);
  const filtered = uid ? all.filter((m) => m.uid === uid) : all;
  return filtered.sort((a, b) => a.createdAtMs - b.createdAtMs);
}

const activeFlushPromisesByUid = new Map<
  string,
  Promise<{ synced: number; failed: number; remaining: number }>
>();

export async function flushOfflineMutations(
  uid: string,
  executor: (record: OfflineMutationRecord) => Promise<void>,
  options: { forceRetry?: boolean } = {}
): Promise<{ synced: number; failed: number; remaining: number }> {
  const flushKey = uid || '__all__';
  const existingPromise = activeFlushPromisesByUid.get(flushKey);
  if (existingPromise) {
    return existingPromise;
  }

  const flushPromise = (async () => {
    const now = Date.now();
    const pending = await getPendingMutations(uid);
    if (pending.length === 0) {
      updateSyncSnapshot({
        pendingCount: 0,
        state: 'IDLE',
        lastError: null,
      });
      return { synced: 0, failed: 0, remaining: 0 };
    }

    updateSyncSnapshot({
      state: 'SYNCING',
      pendingCount: pending.length,
    });

    let synced = 0;
    let failed = 0;
    let hasNonTransientFailure = false;

    for (const record of pending) {
      if (!options.forceRetry && record.nextRetryAtMs > now) {
        continue;
      }
      try {
        await executor(record);
        await markMutationSynced(record.uid, record.collection, record.docId, record.payload, {
          expectedVersion: record.version,
          expectedUpdatedAtMs: record.updatedAtMs,
        });
        synced += 1;
      } catch (err) {
        failed += 1;
        const transientOffline = isTransientOfflineError(err);
        if (!transientOffline) {
          hasNonTransientFailure = true;
        }
        const errMsg = err instanceof Error ? err.message : String(err);
        const latestQueued = await idbGet<OfflineMutationRecord>(
          STORE_QUEUE,
          record.idempotencyKey
        );
        // Only write retry state if no newer version was enqueued while executor was in-flight
        if (
          !latestQueued ||
          !isExistingRecordNewer(latestQueued, record.version, record.updatedAtMs)
        ) {
          const attempts = record.attempts + 1;
          const backoff = RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)];
          const updated: OfflineMutationRecord = {
            ...record,
            attempts,
            updatedAtMs: record.updatedAtMs,
            nextRetryAtMs: Date.now() + backoff,
            lastError: errMsg,
          };
          await idbPut(STORE_QUEUE, updated);
        }
        updateSyncSnapshot({
          lastError: errMsg,
        });
        if (transientOffline) {
          // Stop batch when connection is offline; keep remaining entries intact for reconnect
          break;
        }
      }
    }

    const remainingList = await getPendingMutations(uid);
    const isBrowserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    updateSyncSnapshot({
      pendingCount: remainingList.length,
      state:
        hasNonTransientFailure && !isBrowserOffline
          ? 'ERROR'
          : remainingList.length > 0
            ? 'OFFLINE_QUEUED'
            : failed > 0
              ? 'ERROR'
              : 'IDLE',
    });

    return {
      synced,
      failed,
      remaining: remainingList.length,
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
  currentSyncState = {
    state: 'IDLE',
    pendingCount: 0,
    lastSyncedAtMs: null,
    lastError: null,
  };
  notifyListeners();
}
