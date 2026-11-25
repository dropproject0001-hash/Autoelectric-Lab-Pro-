/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { ClassifiedUpstreamError } from './geminiErrorClassifier';
import {
  buildDefaultGeminiEndpointsFromEnv,
  loadConfiguredGeminiKeysFromEnv,
  QuotaManager,
  type QuotaAcquisitionPlan,
  type QuotaCandidateRoute,
  type QuotaManagerSnapshot,
} from './quotaManager';

export interface FreeTierModelConfig {
  model: string;
  softRpmLimit: number;
  baseCooldownMs: number;
}

export interface FreeTierModelStatus {
  model: string;
  requestsInLast60s: number;
  softRpmLimit: number;
  remainingSoftBudget: number;
  inCooldown: boolean;
  cooldownRemainingSec: number;
  consecutiveFailures: number;
}

export interface FreeTierSelectionResult {
  candidates: string[];
  allInCooldown: boolean;
  earliestRetryAfterSec: number;
  preQuotaReroutedFrom: string | null;
  rerouteReason: string | null;
  poolStatus: FreeTierModelStatus[];
}

const DEFAULT_429_COOLDOWN_MS = 60_000;
const MIN_COOLDOWN_MS = 5_000;
const MAX_COOLDOWN_MS = 180_000;

function parseCooldownMs(): number {
  const num = Number(process.env.GEMINI_429_COOLDOWN_MS);
  if (!Number.isFinite(num)) return DEFAULT_429_COOLDOWN_MS;
  return Math.max(MIN_COOLDOWN_MS, Math.min(MAX_COOLDOWN_MS, Math.round(num)));
}

function getEnvFingerprint(): string {
  const keyParts = [
    process.env.GEMINI_API_KEY || '',
    process.env.GEMINI_API_KEYS || '',
    process.env.GEMINI_HYDROGEN_RPM_SOFT_LIMIT || '',
    process.env.GEMINI_FLASH_LITE_RPM_SOFT_LIMIT || '',
    process.env.GEMINI_KEY_RPM_LIMIT || '',
    process.env.GEMINI_QUOTA_SWITCH_RATIO || '',
  ];
  for (let i = 1; i <= 10; i++) {
    keyParts.push(process.env[`GEMINI_API_KEY_${i}`] || '');
  }
  return keyParts.join('|');
}

let lastEnvFingerprint = '';
let sharedQuotaManager: QuotaManager | null = null;
const clientCacheByKey = new Map<string, GoogleGenAI>();

export function getSharedGeminiQuotaManager(): QuotaManager {
  const currentFp = getEnvFingerprint();
  if (!sharedQuotaManager) {
    sharedQuotaManager = new QuotaManager({
      keys: loadConfiguredGeminiKeysFromEnv(process.env),
      endpoints: buildDefaultGeminiEndpointsFromEnv(process.env),
      defaultCooldownMs: parseCooldownMs(),
    });
    lastEnvFingerprint = currentFp;
    return sharedQuotaManager;
  }

  if (currentFp !== lastEnvFingerprint) {
    sharedQuotaManager.reconfigure({
      keys: loadConfiguredGeminiKeysFromEnv(process.env),
      endpoints: buildDefaultGeminiEndpointsFromEnv(process.env),
    });
    lastEnvFingerprint = currentFp;
  }

  return sharedQuotaManager;
}

export function hasConfiguredGeminiKeys(): boolean {
  return getSharedGeminiQuotaManager().getSnapshot().hasConfiguredKeys;
}

export function getGeminiClientForApiKey(apiKey: string): GoogleGenAI {
  let client = clientCacheByKey.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    clientCacheByKey.set(apiKey, client);
  }
  return client;
}

export function selectFreeTierRoutes(
  preferredModel: string,
  fallbackModels: readonly string[] = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
  nowMs: number = Date.now()
): QuotaAcquisitionPlan {
  return getSharedGeminiQuotaManager().acquirePlan(preferredModel, fallbackModels, nowMs);
}

export function recordRouteAttemptStart(
  route: Pick<QuotaCandidateRoute, 'keyId' | 'endpointId'>,
  nowMs: number = Date.now()
): void {
  getSharedGeminiQuotaManager().recordAttemptStart({
    keyId: route.keyId,
    endpointId: route.endpointId,
    nowMs,
  });
}

export function recordRouteSuccess(
  route: Pick<QuotaCandidateRoute, 'keyId' | 'endpointId'>,
  tokensUsed?: number,
  nowMs: number = Date.now()
): void {
  getSharedGeminiQuotaManager().recordSuccess({
    keyId: route.keyId,
    endpointId: route.endpointId,
    tokensUsed,
    nowMs,
  });
}

export function recordRouteFailure(
  route: Pick<QuotaCandidateRoute, 'keyId' | 'endpointId'>,
  classified: ClassifiedUpstreamError,
  nowMs: number = Date.now(),
  remainingCandidatesCount = 0
): { cooldownSec: number; shouldTryNextRoute: boolean } {
  const mgr = getSharedGeminiQuotaManager();
  const cooldownSec = mgr.recordFailure(
    { keyId: route.keyId, endpointId: route.endpointId },
    {
      category: classified.category,
      statusCode: classified.statusCode,
      retryAfterSec: classified.retryAfterSec,
    },
    nowMs
  );

  // If key auth/permission failed (401/403), allow failover ONLY when another healthy key exists
  if (classified.category === 'UNAUTHENTICATED' || classified.category === 'PERMISSION_DENIED') {
    const snap = mgr.getSnapshot(undefined, nowMs);
    const hasAnotherHealthyKey = snap.healthyKeys > 0 && remainingCandidatesCount > 0;
    return { cooldownSec, shouldTryNextRoute: hasAnotherHealthyKey };
  }

  return {
    cooldownSec,
    shouldTryNextRoute: classified.retryNextModel && remainingCandidatesCount > 0,
  };
}

export function getQuotaManagerSnapshot(nowMs: number = Date.now()): QuotaManagerSnapshot {
  return getSharedGeminiQuotaManager().getSnapshot(undefined, nowMs);
}

export function getFreeTierPoolSnapshot(
  models: readonly string[] = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
  nowMs: number = Date.now()
): FreeTierModelStatus[] {
  const snap = getSharedGeminiQuotaManager().getSnapshot(models, nowMs);
  return snap.endpoints.map((ep) => ({
    model: ep.model,
    requestsInLast60s: ep.requestsInWindow,
    softRpmLimit: ep.softRpmLimit,
    remainingSoftBudget: ep.remainingSoftBudget,
    inCooldown: ep.inCooldown,
    cooldownRemainingSec: ep.cooldownRemainingSec,
    consecutiveFailures: ep.consecutiveFailures,
  }));
}

/**
 * Backward-compatible model-level selector backed by QuotaManager.
 */
export function selectFreeTierCandidates(
  preferredModel: string,
  fallbackModels: readonly string[] = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
  nowMs: number = Date.now()
): FreeTierSelectionResult {
  const orderedAll = Array.from(new Set([preferredModel, ...fallbackModels])).filter(Boolean);
  const plan = getSharedGeminiQuotaManager().acquirePlan(preferredModel, orderedAll, nowMs);
  const uniqueCandidateModels = Array.from(new Set(plan.candidates.map((c) => c.model)));
  const poolStatus = getFreeTierPoolSnapshot(orderedAll, nowMs);

  return {
    candidates: uniqueCandidateModels,
    allInCooldown: plan.allInCooldown,
    earliestRetryAfterSec: plan.earliestRetryAfterSec,
    preQuotaReroutedFrom: plan.preQuotaSwitched ? plan.switchedFromEndpointId : null,
    rerouteReason: plan.switchReason,
    poolStatus,
  };
}

/**
 * Conserves free-tier token-per-minute (TPM) headroom on gemini-4-hydrogen by stepping
 * ThinkingLevel down cleanly as the rolling request window fills up.
 */
export function resolveAdjustedThinkingLevel(
  model: string,
  requestedLevel: ThinkingLevel | undefined,
  nowMs: number = Date.now()
): ThinkingLevel | undefined {
  if (!requestedLevel || model !== 'gemini-4-hydrogen') {
    return undefined;
  }
  const ratio = getSharedGeminiQuotaManager().getUtilizationRatioForEndpoint(model, nowMs);

  if (ratio >= 0.75) {
    return ThinkingLevel.LOW;
  }
  if (ratio >= 0.5 && requestedLevel === ThinkingLevel.HIGH) {
    return ThinkingLevel.MEDIUM;
  }
  return requestedLevel;
}

export function recordModelAttemptStart(model: string, nowMs: number = Date.now()): void {
  const mgr = getSharedGeminiQuotaManager();
  const snap = mgr.getSnapshot([model], nowMs);
  if (snap.keys.length > 0) {
    for (const k of snap.keys) {
      mgr.recordAttemptStart({ keyId: k.keyId, endpointId: model, nowMs });
    }
  } else {
    mgr.recordAttemptStart({ endpointId: model, nowMs });
  }
}

export function recordModelSuccess(model: string, tokensUsed?: number): void {
  getSharedGeminiQuotaManager().recordSuccess({
    endpointId: model,
    tokensUsed,
  });
}

export function recordModelFailure(
  model: string,
  classified: ClassifiedUpstreamError,
  nowMs: number = Date.now()
): number {
  return getSharedGeminiQuotaManager().recordFailure(
    { endpointId: model },
    {
      category: classified.category,
      statusCode: classified.statusCode,
      retryAfterSec: classified.retryAfterSec,
      scope: 'ENDPOINT',
    },
    nowMs
  );
}

export function resetFreeTierRouterForTests(): void {
  if (sharedQuotaManager) {
    sharedQuotaManager.reset();
    sharedQuotaManager = null;
  }
  lastEnvFingerprint = '';
  clientCacheByKey.clear();
}
