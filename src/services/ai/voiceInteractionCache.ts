/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type {
  AiDiagnosticResult,
  BilingualLang,
} from '../../types/aiAssistant';
import type {
  VoiceActionTarget,
  VoiceCoachIntent,
} from './localVoiceBrain';
import { stripBilingualStopwords } from './offlineEngine';

export const VOICE_INTERACTION_CACHE_DB_NAME = 'AutoLabPro_VoiceInteractionCache';
export const VOICE_INTERACTION_CACHE_STORE_NAME = 'voice_interactions';
export const VOICE_INTERACTION_CACHE_DB_VERSION = 1;
export const VOICE_CACHE_MAX_ENTRIES = 100;
export const VOICE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const VOICE_CACHE_MIN_CONFIDENCE = 0.75;

export type VoiceInteractionCacheChannel = 'VOICE_COACH' | 'DIAGNOSTIC_ROUTER';

export type VoiceInteractionSourceOrigin =
  | 'LOCAL_VOICE_BRAIN'
  | 'VERIFIED_ONLINE_AI'
  | 'OFFLINE_VERIFIED_ENGINE';

export interface VoiceInteractionCacheEntry {
  id: string;
  cacheKey: string;
  channel: VoiceInteractionCacheChannel;
  lang: BilingualLang;
  query: string;
  intent: VoiceCoachIntent | 'DIAGNOSTIC_QUERY';
  spokenText: string;
  displayText: string;
  whyTip: string;
  matchedSource: string;
  detailsBullets?: string[];
  followUpChips?: string[];
  suggestedAction?: VoiceActionTarget | null;
  diagnosticResult?: AiDiagnosticResult;
  sourceOrigin: VoiceInteractionSourceOrigin;
  confidence: number;
  hitCount: number;
  createdAtMs: number;
  lastAccessedAtMs: number;
  expiresAtMs: number;
}

export interface VoiceInteractionCacheStats {
  entryCount: number;
  totalHits: number;
  estimatedApiCallsSaved: number;
}

export type VoiceInteractionCacheSaveInput = Omit<
  VoiceInteractionCacheEntry,
  'id' | 'cacheKey' | 'hitCount' | 'createdAtMs' | 'lastAccessedAtMs' | 'expiresAtMs'
> & {
  nowMs?: number;
  ttlMs?: number;
};

const BYPASSED_LIVE_INTENTS = new Set<VoiceCoachIntent>([
  'LIVE_BENCH_STATUS',
  'READING_EVALUATION',
  'DIRECT_PROBE_QUERY',
  'EXPECTED_VALUE_QUERY',
  'STEP_NAVIGATION',
  'WORKSPACE_NAVIGATION',
  'SIMPLIFY_OR_REPEAT',
  'FOLLOW_UP_DETAILS',
]);

/**
 * Bilingual live-telemetry phrases that inspect real-time bench measurements,
 * active probe connections, PSU/OCP live status, or current DMM values.
 * These MUST bypass cache lookup/storage so technicians never receive stale voltages.
 */
const LIVE_TELEMETRY_QUERY_PATTERNS: readonly RegExp[] = [
  /\b(ano|anong|what(?:'s|\s+is)?)\s+(?:ang\s+)?(?:reading|basa|value|voltage|boltahe|status|lagay)\s*(?:ngayon|right\s+now|live|currently|sa\s+bench|ng\s+bench)?\b/i,
  /\b(reading|voltage|boltahe|current|ampere|amps)\s+(?:ngayon|right\s+now|live|currently)\b/i,
  /\b(live|current|actual|measured)\s+(?:reading|voltage|current|bench|telemetry|measurement|dmm|psu)\b/i,
  /\b(bench\s+status|status\s+ng\s+bench|kamusta\s+(?:ang\s+)?bench|psu\s+status|ocp\s+status|dmm\s+reading|multimeter\s+reading|meter\s+reading)\b/i,
  /\b(read|check|measure|sukatin|basahin|tingnan)\s+(?:the\s+|ang\s+|yung\s+)?(?:meter|multimeter|dmm|bench\s+voltage|supply\s+voltage|current\s+draw|amps)\b/i,
  /\b(check|measure|read|sukatin|basahin|tingnan)\s+(?:the\s+|ang\s+|yung\s+|mo\s+yung\s+)?(?:voltage|boltahe|reading|basa)\s+(?:on|at|of|sa|ng)\s+(?:pin\s*#?\d+|kl\s*30|kl\s*15|kl\s*31|vref|tps|map|ect|o2|can|inj|ign)\b/i,
  /\b(?:pin\s*#?\d+|kl\s*30|kl\s*15|vref|tps_?sig|map_?sig|ect_?sig)\s+(?:live\s+)?(?:voltage|boltahe|reading)\b/i,
  /\b(how\s+many|ilang)\s+(?:amps|amperes|dtc|dtcs|faults?|volts?)\b/i,
  /\b(do\s+i\s+have|are\s+there|may)\s+(?:any\s+|anong\s+)?(?:active\s+)?(?:fault|faults|dtc|dtcs|short)\b/i,
  /\b(ok|okay|tama|normal|goods|ayos)\s+ba\s*(?:'to|ito|to|iyan|yan|ang\s+reading|ang\s+basa)?\b/i,
  /\b(saan|san|where)\s+(?:nakakabit|nakalagay|connected|attached|are\s+the\s+probes)\b/i,
  /\b(bakit|why)\s+(?:zero|0(?:\.0+)?|wala|walang\s+(?:reading|voltage|output|power))\b/i,
  /\b(active\s+dtc|active\s+fault|current\s+dtc|anong\s+active\s+dtc|may\s+dtc\s+ba\s+ngayon|nag[-\s]?trip\s+ba|ocp\s+tripped)\b/i,
  /\b(is\s+(?:the\s+)?psu\s+(?:on|off)|naka[-\s]?on\s+ba\s+ang\s+psu|naka[-\s]?off\s+ba\s+ang\s+psu)\b/i,
  /\b(my\s+(?:reading|voltage|dmm|meter)|reading\s+ko|basa\s+ko|sinusukat\s+ko)\b/i,
];

const memoryCacheStore = new Map<string, VoiceInteractionCacheEntry>();
const cacheSubscribers = new Set<() => void>();
let sessionApiCallsSaved = 0;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function notifySubscribers(): void {
  for (const listener of cacheSubscribers) {
    try {
      listener();
    } catch {
      // Ignore subscriber errors
    }
  }
}

function openVoiceInteractionCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      VOICE_INTERACTION_CACHE_DB_NAME,
      VOICE_INTERACTION_CACHE_DB_VERSION
    );

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VOICE_INTERACTION_CACHE_STORE_NAME)) {
        const store = db.createObjectStore(VOICE_INTERACTION_CACHE_STORE_NAME, {
          keyPath: 'id',
        });
        store.createIndex('cacheKey', 'cacheKey', { unique: false });
        store.createIndex('lastAccessedAtMs', 'lastAccessedAtMs', { unique: false });
        store.createIndex('lang', 'lang', { unique: false });
        store.createIndex('channel', 'channel', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ||
          new Error('Failed to open AutoLabPro_VoiceInteractionCache IndexedDB')
      );
  });
}

/**
 * Returns true if the query or classified intent asks about real-time bench telemetry,
 * probe placement, live reading evaluation, or stateful navigation — which must NEVER
 * be served from or written into the cached interaction store.
 */
export function isLiveTelemetryQuery(
  rawQuery: string,
  intent?: VoiceCoachIntent | 'DIAGNOSTIC_QUERY' | null
): boolean {
  if (intent && intent !== 'DIAGNOSTIC_QUERY' && BYPASSED_LIVE_INTENTS.has(intent)) {
    return true;
  }
  const trimmed = String(rawQuery || '').trim();
  if (!trimmed) return true;
  return LIVE_TELEMETRY_QUERY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Normalizes a Taglish or English diagnostic query into a deterministic cache key.
 * Preserves DTC codes, pin references, and standalone numeric qualifiers (e.g. Cylinder 1 vs 2)
 * while stripping conversational filler words so equivalent questions share a cache entry.
 */
export function normalizeVoiceQueryKey(rawQuery: string): {
  normalizedKey: string;
  tokens: string[];
} {
  const cleaned = String(rawQuery || '')
    .toLowerCase()
    .replace(/[^\w\s\-/.Ω]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return { normalizedKey: '', tokens: [] };
  }

  const baseTokens = stripBilingualStopwords(cleaned);
  const numericQualifiers = cleaned
    .split(' ')
    .map((w) => w.replace(/^[./-]+|[./-]+$/g, ''))
    .filter((w) => /^\d+(?:\.\d+)?$/.test(w));

  const merged = Array.from(
    new Set([...baseTokens, ...numericQualifiers].map((t) => t.trim().toLowerCase()).filter(Boolean))
  ).sort();

  return {
    normalizedKey: merged.join('|'),
    tokens: merged,
  };
}

export function buildVoiceCacheEntryId(
  channel: VoiceInteractionCacheChannel,
  lang: BilingualLang,
  normalizedKey: string
): string {
  return `${channel}:${lang}:${normalizedKey}`;
}

async function putEntryInIndexedDb(entry: VoiceInteractionCacheEntry): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const db = await openVoiceInteractionCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(VOICE_INTERACTION_CACHE_STORE_NAME, 'readwrite');
      tx.objectStore(VOICE_INTERACTION_CACHE_STORE_NAME).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Voice cache IndexedDB write failed'));
    });
    db.close();
  } catch {
    // Graceful degradation to in-memory fallback in private/restricted browsers
  }
}

async function deleteEntryIdsFromIndexedDb(ids: string[]): Promise<void> {
  if (!ids.length || !hasIndexedDb()) return;
  try {
    const db = await openVoiceInteractionCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(VOICE_INTERACTION_CACHE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(VOICE_INTERACTION_CACHE_STORE_NAME);
      for (const id of ids) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Voice cache IndexedDB delete failed'));
    });
    db.close();
  } catch {
    // Non-fatal in restricted storage environments
  }
}

async function readAllEntriesFromIndexedDb(): Promise<VoiceInteractionCacheEntry[]> {
  if (!hasIndexedDb()) {
    return Array.from(memoryCacheStore.values());
  }
  try {
    const db = await openVoiceInteractionCacheDb();
    const rows = await new Promise<VoiceInteractionCacheEntry[]>((resolve, reject) => {
      const tx = db.transaction(VOICE_INTERACTION_CACHE_STORE_NAME, 'readonly');
      const req = tx.objectStore(VOICE_INTERACTION_CACHE_STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result as VoiceInteractionCacheEntry[]) || []);
      req.onerror = () => reject(req.error || new Error('Voice cache IndexedDB read failed'));
    });
    db.close();
    for (const row of rows) {
      if (row && typeof row.id === 'string') {
        const existing = memoryCacheStore.get(row.id);
        if (!existing || row.lastAccessedAtMs >= existing.lastAccessedAtMs) {
          memoryCacheStore.set(row.id, row);
        }
      }
    }
    return Array.from(memoryCacheStore.values());
  } catch {
    return Array.from(memoryCacheStore.values());
  }
}

async function pruneExpiredAndLruEntries(nowMs: number): Promise<void> {
  const allEntries = Array.from(memoryCacheStore.values());
  const expiredIds: string[] = [];
  const activeEntries: VoiceInteractionCacheEntry[] = [];

  for (const entry of allEntries) {
    if (entry.expiresAtMs <= nowMs) {
      expiredIds.push(entry.id);
      memoryCacheStore.delete(entry.id);
    } else {
      activeEntries.push(entry);
    }
  }

  const evictedIds: string[] = [...expiredIds];
  if (activeEntries.length > VOICE_CACHE_MAX_ENTRIES) {
    activeEntries.sort((a, b) => b.lastAccessedAtMs - a.lastAccessedAtMs);
    const overflow = activeEntries.slice(VOICE_CACHE_MAX_ENTRIES);
    for (const item of overflow) {
      memoryCacheStore.delete(item.id);
      evictedIds.push(item.id);
    }
  }

  if (evictedIds.length > 0) {
    await deleteEntryIdsFromIndexedDb(evictedIds);
  }
}

/**
 * Synchronous in-memory lookup helper for zero-latency hands-free voice turns
 * after IndexedDB hydration on mount.
 */
export function lookupVoiceInteractionMemorySync(params: {
  query: string;
  lang: BilingualLang;
  channel: VoiceInteractionCacheChannel;
  intent?: VoiceCoachIntent | 'DIAGNOSTIC_QUERY' | null;
  nowMs?: number;
}): VoiceInteractionCacheEntry | null {
  const nowMs = params.nowMs ?? Date.now();
  if (isLiveTelemetryQuery(params.query, params.intent)) {
    return null;
  }
  const { normalizedKey } = normalizeVoiceQueryKey(params.query);
  if (!normalizedKey) return null;

  const id = buildVoiceCacheEntryId(params.channel, params.lang, normalizedKey);
  const found = memoryCacheStore.get(id);
  if (!found) return null;
  if (found.expiresAtMs <= nowMs) {
    memoryCacheStore.delete(id);
    return null;
  }
  return found;
}

/**
 * Looks up a cached interaction in IndexedDB (with memory hydration),
 * bypassing live bench reading queries and expired records.
 * On cache hit, increments hitCount and updates LRU recency.
 */
export async function lookupVoiceInteractionCache(params: {
  query: string;
  lang: BilingualLang;
  channel: VoiceInteractionCacheChannel;
  intent?: VoiceCoachIntent | 'DIAGNOSTIC_QUERY' | null;
  nowMs?: number;
}): Promise<VoiceInteractionCacheEntry | null> {
  const nowMs = params.nowMs ?? Date.now();
  if (isLiveTelemetryQuery(params.query, params.intent)) {
    return null;
  }

  const { normalizedKey } = normalizeVoiceQueryKey(params.query);
  if (!normalizedKey) return null;

  const id = buildVoiceCacheEntryId(params.channel, params.lang, normalizedKey);
  let entry = memoryCacheStore.get(id) ?? null;

  if (!entry && hasIndexedDb()) {
    await readAllEntriesFromIndexedDb();
    entry = memoryCacheStore.get(id) ?? null;
  }

  if (!entry) return null;

  if (entry.expiresAtMs <= nowMs) {
    memoryCacheStore.delete(id);
    await deleteEntryIdsFromIndexedDb([id]);
    notifySubscribers();
    return null;
  }

  const updated: VoiceInteractionCacheEntry = {
    ...entry,
    hitCount: entry.hitCount + 1,
    lastAccessedAtMs: nowMs,
  };
  memoryCacheStore.set(id, updated);

  if (params.channel === 'DIAGNOSTIC_ROUTER') {
    sessionApiCallsSaved += 1;
  }

  await putEntryInIndexedDb(updated);
  notifySubscribers();
  return updated;
}

/**
 * Persists a verified general diagnostic or coaching interaction into IndexedDB,
 * enforcing live-reading exclusion, confidence floor, TTL, and 100-entry LRU bounds.
 */
export async function saveVoiceInteractionCache(
  input: VoiceInteractionCacheSaveInput
): Promise<{ saved: boolean; reason?: string; entry?: VoiceInteractionCacheEntry }> {
  const nowMs = input.nowMs ?? Date.now();

  if (isLiveTelemetryQuery(input.query, input.intent)) {
    return {
      saved: false,
      reason: 'Live bench reading queries bypass IndexedDB voice cache to preserve measurement accuracy.',
    };
  }

  if (input.confidence < VOICE_CACHE_MIN_CONFIDENCE) {
    return {
      saved: false,
      reason: `Confidence ${input.confidence.toFixed(2)} below voice cache threshold ${VOICE_CACHE_MIN_CONFIDENCE.toFixed(2)}.`,
    };
  }

  const { normalizedKey } = normalizeVoiceQueryKey(input.query);
  if (!normalizedKey) {
    return {
      saved: false,
      reason: 'Empty normalized query key.',
    };
  }

  const id = buildVoiceCacheEntryId(input.channel, input.lang, normalizedKey);
  const existing = memoryCacheStore.get(id);
  const ttlMs = input.ttlMs ?? VOICE_CACHE_TTL_MS;

  const entry: VoiceInteractionCacheEntry = {
    id,
    cacheKey: normalizedKey,
    channel: input.channel,
    lang: input.lang,
    query: input.query.trim(),
    intent: input.intent,
    spokenText: input.spokenText,
    displayText: input.displayText,
    whyTip: input.whyTip,
    matchedSource: input.matchedSource,
    detailsBullets: input.detailsBullets,
    followUpChips: input.followUpChips,
    suggestedAction: input.suggestedAction,
    diagnosticResult: input.diagnosticResult,
    sourceOrigin: input.sourceOrigin,
    confidence: input.confidence,
    hitCount: existing ? existing.hitCount : 0,
    createdAtMs: existing ? existing.createdAtMs : nowMs,
    lastAccessedAtMs: nowMs,
    expiresAtMs: nowMs + ttlMs,
  };

  memoryCacheStore.set(id, entry);
  await putEntryInIndexedDb(entry);
  await pruneExpiredAndLruEntries(nowMs);
  notifySubscribers();

  return { saved: true, entry };
}

/**
 * Records a manual replay from the collapsible Recent History panel so recency
 * and hit counters stay accurate without invoking any online API.
 */
export async function recordVoiceHistoryReplay(
  entryId: string,
  nowMs = Date.now()
): Promise<VoiceInteractionCacheEntry | null> {
  const existing = memoryCacheStore.get(entryId);
  if (!existing) return null;
  if (existing.expiresAtMs <= nowMs) {
    memoryCacheStore.delete(entryId);
    await deleteEntryIdsFromIndexedDb([entryId]);
    notifySubscribers();
    return null;
  }

  const updated: VoiceInteractionCacheEntry = {
    ...existing,
    hitCount: existing.hitCount + 1,
    lastAccessedAtMs: nowMs,
  };
  memoryCacheStore.set(entryId, updated);
  await putEntryInIndexedDb(updated);
  notifySubscribers();
  return updated;
}

/**
 * Hydrates and lists recent cached voice interactions in reverse chronological order.
 */
export async function listRecentVoiceInteractions(options?: {
  lang?: BilingualLang;
  channel?: VoiceInteractionCacheChannel;
  limit?: number;
  nowMs?: number;
}): Promise<VoiceInteractionCacheEntry[]> {
  const nowMs = options?.nowMs ?? Date.now();
  const limit = options?.limit ?? 20;

  await readAllEntriesFromIndexedDb();
  await pruneExpiredAndLruEntries(nowMs);

  let rows = Array.from(memoryCacheStore.values()).filter(
    (entry) => entry.expiresAtMs > nowMs
  );

  if (options?.lang) {
    rows = rows.filter((entry) => entry.lang === options.lang);
  }
  if (options?.channel) {
    rows = rows.filter((entry) => entry.channel === options.channel);
  }

  rows.sort((a, b) => b.lastAccessedAtMs - a.lastAccessedAtMs);
  return rows.slice(0, Math.max(1, limit));
}

export function getVoiceInteractionCacheStats(
  channel?: VoiceInteractionCacheChannel
): VoiceInteractionCacheStats {
  const nowMs = Date.now();
  let entryCount = 0;
  let totalHits = 0;
  let diagnosticHits = 0;

  for (const entry of memoryCacheStore.values()) {
    if (entry.expiresAtMs <= nowMs) continue;
    if (channel && entry.channel !== channel) continue;
    entryCount += 1;
    totalHits += entry.hitCount;
    if (entry.channel === 'DIAGNOSTIC_ROUTER') {
      diagnosticHits += entry.hitCount;
    }
  }

  return {
    entryCount,
    totalHits,
    estimatedApiCallsSaved: Math.max(sessionApiCallsSaved, diagnosticHits),
  };
}

export function subscribeVoiceInteractionCache(listener: () => void): () => void {
  cacheSubscribers.add(listener);
  return () => {
    cacheSubscribers.delete(listener);
  };
}

export async function clearVoiceInteractionCache(): Promise<void> {
  memoryCacheStore.clear();
  sessionApiCallsSaved = 0;

  if (hasIndexedDb()) {
    try {
      const db = await openVoiceInteractionCacheDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(VOICE_INTERACTION_CACHE_STORE_NAME, 'readwrite');
        tx.objectStore(VOICE_INTERACTION_CACHE_STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      // Ignore clear errors in private/restricted browsers
    }
  }

  notifySubscribers();
}

export function resetVoiceInteractionCacheMemorySync(): void {
  memoryCacheStore.clear();
  sessionApiCallsSaved = 0;
}
