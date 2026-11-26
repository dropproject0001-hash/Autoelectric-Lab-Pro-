/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { LabGuidanceStep, UniversityLabModule } from '../data/universityLabCurriculum';
import type { EcuPin } from '../types/ecu';
import { buildUnifiedApiHeaders, inspectAndHandleTrialErrorPayload } from './trialPinClientService';
import {
  buildGroundedStepSpec,
  buildStepTutorialCacheKey,
  buildStepTutorialPrompt,
  buildStepTutorialSubtitles,
  type GroundedStepTutorialSpec,
  type StepTutorialSubtitleCue,
  type TutorialDurationSec,
  type TutorialNarrationStyle,
} from '../utils/stepTutorialBuilder';

export type StepTutorialDeliveryMode = 'AI_VIDEO' | 'INTERACTIVE_SCHEMATIC';

export interface CachedStepTutorialEntry {
  cacheKey: string;
  moduleId: string;
  stepId: string;
  narrationStyle: TutorialNarrationStyle;
  durationSec: TutorialDurationSec;
  mode: StepTutorialDeliveryMode;
  videoUrl?: string;
  model?: string;
  fallbackReason?: string;
  grounded: GroundedStepTutorialSpec;
  subtitles: StepTutorialSubtitleCue[];
  promptUsed: string;
  updatedAtIso: string;
}

const DB_NAME = 'autoelectric-step-tutorials-v1';
const STORE_NAME = 'tutorials';
const memoryCache = new Map<string, CachedStepTutorialEntry>();
const cacheListeners = new Set<() => void>();

function notifyCacheListeners() {
  for (const listener of cacheListeners) {
    try {
      listener();
    } catch {
      // Ignore subscriber errors
    }
  }
}

export function subscribeStepTutorialCache(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => {
    cacheListeners.delete(listener);
  };
}

function openTutorialDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function getCachedStepTutorial(
  cacheKey: string
): Promise<CachedStepTutorialEntry | null> {
  const inMem = memoryCache.get(cacheKey);
  if (inMem) return inMem;

  const db = await openTutorialDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cacheKey);
      req.onsuccess = () => {
        const result = (req.result as CachedStepTutorialEntry | undefined) ?? null;
        if (result) {
          memoryCache.set(cacheKey, result);
        }
        resolve(result);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveCachedStepTutorial(
  entry: CachedStepTutorialEntry
): Promise<void> {
  memoryCache.set(entry.cacheKey, entry);
  notifyCacheListeners();

  const db = await openTutorialDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function listCachedKeysForModule(
  moduleId: string,
  narrationStyle: TutorialNarrationStyle,
  durationSec: TutorialDurationSec
): Promise<Record<string, CachedStepTutorialEntry>> {
  const out: Record<string, CachedStepTutorialEntry> = {};
  for (const [, entry] of memoryCache.entries()) {
    if (
      entry.moduleId === moduleId &&
      entry.narrationStyle === narrationStyle &&
      entry.durationSec === durationSec
    ) {
      out[entry.stepId] = entry;
    }
  }

  const db = await openTutorialDb();
  if (!db) return out;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = Array.isArray(req.result)
          ? (req.result as CachedStepTutorialEntry[])
          : [];
        for (const item of items) {
          memoryCache.set(item.cacheKey, item);
          if (
            item.moduleId === moduleId &&
            item.narrationStyle === narrationStyle &&
            item.durationSec === durationSec
          ) {
            out[item.stepId] = item;
          }
        }
        resolve(out);
      };
      req.onerror = () => resolve(out);
    } catch {
      resolve(out);
    }
  });
}

export async function clearStepTutorialCacheForModule(moduleId?: string): Promise<void> {
  if (moduleId) {
    for (const [key, val] of memoryCache.entries()) {
      if (val.moduleId === moduleId) {
        memoryCache.delete(key);
      }
    }
  } else {
    memoryCache.clear();
  }
  notifyCacheListeners();

  const db = await openTutorialDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (!moduleId) {
        const clearReq = store.clear();
        clearReq.onsuccess = () => resolve();
        clearReq.onerror = () => resolve();
        return;
      }
      const getReq = store.getAll();
      getReq.onsuccess = () => {
        const items = Array.isArray(getReq.result)
          ? (getReq.result as CachedStepTutorialEntry[])
          : [];
        for (const item of items) {
          if (item.moduleId === moduleId) {
            store.delete(item.cacheKey);
          }
        }
        resolve();
      };
      getReq.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadOrGenerateStepTutorial(params: {
  module: UniversityLabModule;
  step: LabGuidanceStep;
  ecuPins?: readonly EcuPin[];
  narrationStyle: TutorialNarrationStyle;
  durationSec: TutorialDurationSec;
  forceRegenerate?: boolean;
  signal?: AbortSignal;
}): Promise<CachedStepTutorialEntry> {
  const {
    module,
    step,
    ecuPins = [],
    narrationStyle,
    durationSec,
    forceRegenerate = false,
    signal,
  } = params;

  const cacheKey = buildStepTutorialCacheKey(
    module.id,
    step.id,
    narrationStyle,
    durationSec
  );

  if (!forceRegenerate) {
    const cached = await getCachedStepTutorial(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const grounded = buildGroundedStepSpec(module, step, ecuPins);
  const subtitles = buildStepTutorialSubtitles(grounded, narrationStyle, durationSec);
  const promptUsed = buildStepTutorialPrompt(grounded, narrationStyle, durationSec);

  try {
    const headers = await buildUnifiedApiHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/autoelectric/step-tutorial-video', {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        moduleId: module.id,
        stepId: step.id,
        narrationStyle,
        durationSec,
        ecuPins: ecuPins.slice(0, 32).map((p) => ({
          id: p.id,
          pinNumber: p.pinNumber,
          label: p.label,
          name: p.name,
          nominalVoltage: p.nominalVoltage,
        })),
      }),
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      inspectAndHandleTrialErrorPayload(res.status, data);
      const reason =
        typeof data.error === 'string' && data.error.trim().length > 0
          ? data.error.trim()
          : `AI video pipeline returned HTTP ${res.status}`;
      const fallbackEntry: CachedStepTutorialEntry = {
        cacheKey,
        moduleId: module.id,
        stepId: step.id,
        narrationStyle,
        durationSec,
        mode: 'INTERACTIVE_SCHEMATIC',
        fallbackReason: reason,
        grounded,
        subtitles,
        promptUsed,
        updatedAtIso: new Date().toISOString(),
      };
      await saveCachedStepTutorial(fallbackEntry);
      return fallbackEntry;
    }

    const videoUrl = typeof data.videoUrl === 'string' ? data.videoUrl : '';
    if (!videoUrl) {
      const fallbackEntry: CachedStepTutorialEntry = {
        cacheKey,
        moduleId: module.id,
        stepId: step.id,
        narrationStyle,
        durationSec,
        mode: 'INTERACTIVE_SCHEMATIC',
        fallbackReason: 'AI video endpoint returned empty video stream; using interactive schematic.',
        grounded,
        subtitles,
        promptUsed,
        updatedAtIso: new Date().toISOString(),
      };
      await saveCachedStepTutorial(fallbackEntry);
      return fallbackEntry;
    }

    const videoEntry: CachedStepTutorialEntry = {
      cacheKey,
      moduleId: module.id,
      stepId: step.id,
      narrationStyle,
      durationSec,
      mode: 'AI_VIDEO',
      videoUrl,
      model: typeof data.model === 'string' ? data.model : 'gemini-omni-1.2-flash',
      grounded,
      subtitles,
      promptUsed,
      updatedAtIso: new Date().toISOString(),
    };
    await saveCachedStepTutorial(videoEntry);
    return videoEntry;
  } catch (err: unknown) {
    if (signal?.aborted) {
      throw err;
    }
    const reason =
      err instanceof Error && err.message
        ? err.message
        : 'Video pipeline offline; interactive animated schematic with voice guidance active.';
    const fallbackEntry: CachedStepTutorialEntry = {
      cacheKey,
      moduleId: module.id,
      stepId: step.id,
      narrationStyle,
      durationSec,
      mode: 'INTERACTIVE_SCHEMATIC',
      fallbackReason: reason,
      grounded,
      subtitles,
      promptUsed,
      updatedAtIso: new Date().toISOString(),
    };
    await saveCachedStepTutorial(fallbackEntry);
    return fallbackEntry;
  }
}

export async function batchPregenerateModuleTutorials(params: {
  module: UniversityLabModule;
  ecuPins?: readonly EcuPin[];
  narrationStyle: TutorialNarrationStyle;
  durationSec: TutorialDurationSec;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number, lastEntry: CachedStepTutorialEntry) => void;
}): Promise<CachedStepTutorialEntry[]> {
  const { module, ecuPins, narrationStyle, durationSec, signal, onProgress } = params;
  const results: CachedStepTutorialEntry[] = [];
  const total = module.steps.length;

  for (let idx = 0; idx < total; idx += 1) {
    if (signal?.aborted) break;
    const step = module.steps[idx];
    const entry = await loadOrGenerateStepTutorial({
      module,
      step,
      ecuPins,
      narrationStyle,
      durationSec,
      signal,
    });
    results.push(entry);
    onProgress?.(idx + 1, total, entry);
  }
  return results;
}
