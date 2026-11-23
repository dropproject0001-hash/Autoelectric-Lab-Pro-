import type { VerifiedKnowledgeRecord } from '../../types/aiAssistant';

export const VERIFIED_KNOWLEDGE_DB_NAME = 'AutoLabPro_VerifiedKnowledge';
export const VERIFIED_KNOWLEDGE_STORE_NAME = 'verified_entries';
export const VERIFIED_KNOWLEDGE_DB_VERSION = 1;
export const AUTO_CACHE_MIN_CONFIDENCE = 0.8;

const memoryFallbackStore = new Map<string, VerifiedKnowledgeRecord>();

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openVerifiedKnowledgeDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      VERIFIED_KNOWLEDGE_DB_NAME,
      VERIFIED_KNOWLEDGE_DB_VERSION
    );

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VERIFIED_KNOWLEDGE_STORE_NAME)) {
        const store = db.createObjectStore(VERIFIED_KNOWLEDGE_STORE_NAME, {
          keyPath: 'id',
        });
        store.createIndex('normalizedKey', 'normalizedKey', { unique: false });
        store.createIndex('savedAtMs', 'savedAtMs', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error('Failed to open AutoLabPro_VerifiedKnowledge IndexedDB'));
  });
}

export function normalizeKnowledgeKey(tokens: string[], subject: string): string {
  const cleanTokens = Array.from(
    new Set(
      tokens
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length >= 2)
    )
  ).sort();
  if (cleanTokens.length > 0) {
    return cleanTokens.join('|');
  }
  return subject.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Automatically persists verified high-confidence online AI diagnostic entries locally.
 * Strictly automatic based on verification & confidence threshold — NO manual user voting/rating.
 */
export async function saveVerifiedKnowledgeEntry(
  record: Omit<VerifiedKnowledgeRecord, 'id' | 'normalizedKey' | 'savedAtMs'> & {
    id?: string;
    savedAtMs?: number;
  }
): Promise<{ saved: boolean; reason?: string; record?: VerifiedKnowledgeRecord }> {
  if (record.confidence < AUTO_CACHE_MIN_CONFIDENCE) {
    return {
      saved: false,
      reason: `Confidence ${record.confidence.toFixed(2)} below auto-cache threshold ${AUTO_CACHE_MIN_CONFIDENCE.toFixed(2)}`,
    };
  }

  if (record.sourceTier === 'OFFLINE_AI') {
    return {
      saved: false,
      reason: 'Only verified online AI responses are auto-cached into AutoLabPro_VerifiedKnowledge',
    };
  }

  const normalizedKey = normalizeKnowledgeKey(record.tokens, record.subject);
  const entry: VerifiedKnowledgeRecord = {
    ...record,
    id: record.id || `vk-${record.lang.toLowerCase()}-${normalizedKey}`,
    normalizedKey,
    savedAtMs: record.savedAtMs ?? Date.now(),
  };

  memoryFallbackStore.set(entry.id, entry);

  if (!hasIndexedDb()) {
    return { saved: true, record: entry };
  }

  try {
    const db = await openVerifiedKnowledgeDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(VERIFIED_KNOWLEDGE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(VERIFIED_KNOWLEDGE_STORE_NAME);
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
    });
    db.close();
    return { saved: true, record: entry };
  } catch {
    // Preserve durability in memory fallback if browser restricts IndexedDB in private mode
    return { saved: true, record: entry };
  }
}

export async function getAllVerifiedKnowledgeEntries(): Promise<VerifiedKnowledgeRecord[]> {
  if (!hasIndexedDb()) {
    return Array.from(memoryFallbackStore.values()).sort(
      (a, b) => b.savedAtMs - a.savedAtMs
    );
  }

  try {
    const db = await openVerifiedKnowledgeDb();
    const rows = await new Promise<VerifiedKnowledgeRecord[]>((resolve, reject) => {
      const tx = db.transaction(VERIFIED_KNOWLEDGE_STORE_NAME, 'readonly');
      const store = tx.objectStore(VERIFIED_KNOWLEDGE_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as VerifiedKnowledgeRecord[]) || []);
      req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
    });
    db.close();
    for (const row of rows) {
      memoryFallbackStore.set(row.id, row);
    }
    return rows.sort((a, b) => b.savedAtMs - a.savedAtMs);
  } catch {
    return Array.from(memoryFallbackStore.values()).sort(
      (a, b) => b.savedAtMs - a.savedAtMs
    );
  }
}

export async function clearVerifiedKnowledgeStoreForTests(): Promise<void> {
  memoryFallbackStore.clear();
  if (!hasIndexedDb()) {
    return;
  }
  try {
    const db = await openVerifiedKnowledgeDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(VERIFIED_KNOWLEDGE_STORE_NAME, 'readwrite');
      tx.objectStore(VERIFIED_KNOWLEDGE_STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore cleanup errors in restricted browser contexts
  }
}
