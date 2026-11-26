/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { ClassifiedUpstreamError } from './geminiErrorClassifier';

export interface QuotaApiKeyConfig {
  id: string;
  apiKey: string;
  label?: string;
  provider?: string;
  rpmLimit?: number;
  tpmLimit?: number;
  rpdLimit?: number;
  priority?: number;
  allowedEndpointIds?: string[];
}

export interface QuotaEndpointTierConfig {
  id: string;
  model: string;
  endpoint?: string;
  provider?: string;
  rpmLimit: number;
  tpmLimit?: number;
  rpdLimit?: number;
  priority?: number;
}

export interface QuotaManagerConfig {
  keys?: QuotaApiKeyConfig[];
  endpoints?: QuotaEndpointTierConfig[];
  /** Threshold ratio [0.1 .. 0.99] at which usage is considered approaching limit (default: 0.80 = 80%). */
  switchThresholdRatio?: number;
  /** Rolling RPM/TPM window duration in ms (default: 60_000). */
  windowMs?: number;
  /** Rolling daily RPD window duration in ms (default: 86_400_000). */
  dailyWindowMs?: number;
  defaultCooldownMs?: number;
  minCooldownMs?: number;
  maxCooldownMs?: number;
  authErrorCooldownMs?: number;
  notFoundCooldownMs?: number;
}

export type QuotaSwitchKind =
  | 'PRIMARY'
  | 'KEY_SWITCH'
  | 'TIER_SWITCH'
  | 'KEY_AND_TIER_SWITCH';

export interface QuotaCandidateRoute {
  keyId: string;
  apiKey: string;
  endpointId: string;
  model: string;
  endpoint: string;
  provider: string;
  requestsInWindow: number;
  softRpmLimit: number;
  hardRpmLimit: number;
  utilizationRatio: number;
  approachingLimit: boolean;
  switchKind: QuotaSwitchKind;
  reason: string;
}

export interface QuotaKeyStatus {
  keyId: string;
  label: string;
  provider: string;
  requestsInWindow: number;
  requestsToday: number;
  tokensInWindow: number;
  softRpmLimit: number;
  hardRpmLimit: number;
  remainingBeforeSwitch: number;
  utilizationRatio: number;
  approachingLimit: boolean;
  inCooldown: boolean;
  cooldownRemainingSec: number;
  consecutiveFailures: number;
  lastErrorCategory: string | null;
}

export interface QuotaEndpointStatus {
  endpointId: string;
  model: string;
  endpoint: string;
  provider: string;
  requestsInWindow: number;
  requestsToday: number;
  tokensInWindow: number;
  softRpmLimit: number;
  hardRpmLimit: number;
  remainingSoftBudget: number;
  utilizationRatio: number;
  approachingLimit: boolean;
  inCooldown: boolean;
  cooldownRemainingSec: number;
  consecutiveFailures: number;
}

export interface QuotaManagerSnapshot {
  switchThresholdRatio: number;
  windowMs: number;
  hasConfiguredKeys: boolean;
  totalConfiguredKeys: number;
  healthyKeys: number;
  keys: QuotaKeyStatus[];
  endpoints: QuotaEndpointStatus[];
}

export interface QuotaAcquisitionPlan {
  candidates: QuotaCandidateRoute[];
  selected: QuotaCandidateRoute | null;
  allInCooldown: boolean;
  hasConfiguredKeys: boolean;
  earliestRetryAfterSec: number;
  switchedFromKeyId: string | null;
  switchedFromEndpointId: string | null;
  preQuotaSwitched: boolean;
  switchReason: string | null;
  snapshot: QuotaManagerSnapshot;
}

export interface QuotaUsageRecordOptions {
  keyId?: string;
  endpointId: string;
  tokensUsed?: number;
  nowMs?: number;
}

export interface QuotaFailureInput {
  category: ClassifiedUpstreamError['category'] | 'NETWORK_ERROR';
  statusCode?: number;
  retryAfterSec?: number;
  scope?: 'PAIR' | 'KEY' | 'ENDPOINT';
}

interface UsageBucket {
  requestTimestamps: number[];
  dailyTimestamps: number[];
  tokenEntries: Array<{ ts: number; tokens: number }>;
  cooldownUntilMs: number;
  consecutiveFailures: number;
  lastErrorCategory: string | null;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_DAILY_WINDOW_MS = 86_400_000;
const DEFAULT_SWITCH_RATIO = 0.8;
const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_MIN_COOLDOWN_MS = 5_000;
const DEFAULT_MAX_COOLDOWN_MS = 180_000;
const DEFAULT_AUTH_COOLDOWN_MS = 300_000;
const DEFAULT_NOT_FOUND_COOLDOWN_MS = 300_000;
const VIRTUAL_DEFAULT_KEY_ID = 'virtual-default-key';

function createEmptyBucket(): UsageBucket {
  return {
    requestTimestamps: [],
    dailyTimestamps: [],
    tokenEntries: [],
    cooldownUntilMs: 0,
    consecutiveFailures: 0,
    lastErrorCategory: null,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return clamp(Math.round(num), min, max);
}

function parseRatio(raw: string | undefined, fallback: number): number {
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return clamp(num, 0.1, 0.99);
}

export function computeSoftLimit(hardLimit: number, ratio: number): number {
  if (hardLimit <= 1) return 1;
  return Math.max(1, Math.min(hardLimit, Math.floor(hardLimit * ratio)));
}

/**
 * Loads one or more Gemini API keys from server environment variables
 * (GEMINI_API_KEY, GEMINI_API_KEY_1..GEMINI_API_KEY_10, GEMINI_API_KEYS).
 * Never logs or exposes raw secret values.
 */
export function loadConfiguredGeminiKeysFromEnv(
  env: NodeJS.ProcessEnv = process.env
): QuotaApiKeyConfig[] {
  const rawEntries: Array<{ key: string; label: string }> = [];
  const primary = env.GEMINI_API_KEY?.trim();
  if (primary) {
    rawEntries.push({ key: primary, label: 'Primary Key' });
  }

  for (let idx = 1; idx <= 10; idx++) {
    const numbered = env[`GEMINI_API_KEY_${idx}`]?.trim();
    if (numbered) {
      rawEntries.push({ key: numbered, label: `Key Slot #${idx}` });
    }
  }

  const csvList = env.GEMINI_API_KEYS?.trim();
  if (csvList) {
    const parts = csvList
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    parts.forEach((part, idx) => {
      rawEntries.push({ key: part, label: `Pool Key #${idx + 1}` });
    });
  }

  const seenKeys = new Set<string>();
  const keyRpmLimit = parsePositiveInt(env.GEMINI_KEY_RPM_LIMIT, 15, 1, 120);
  const keyTpmLimit = env.GEMINI_KEY_TPM_LIMIT
    ? parsePositiveInt(env.GEMINI_KEY_TPM_LIMIT, 250_000, 1_000, 10_000_000)
    : undefined;
  const keyRpdLimit = env.GEMINI_KEY_RPD_LIMIT
    ? parsePositiveInt(env.GEMINI_KEY_RPD_LIMIT, 1_500, 10, 100_000)
    : undefined;

  const unique: QuotaApiKeyConfig[] = [];
  for (const entry of rawEntries) {
    if (seenKeys.has(entry.key)) continue;
    seenKeys.add(entry.key);
    const slotNumber = unique.length + 1;
    unique.push({
      id: `gemini-key-${slotNumber}`,
      apiKey: entry.key,
      label: entry.label,
      provider: 'gemini',
      rpmLimit: keyRpmLimit,
      tpmLimit: keyTpmLimit,
      rpdLimit: keyRpdLimit,
      priority: slotNumber,
    });
  }
  return unique;
}

export function buildDefaultGeminiEndpointsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): QuotaEndpointTierConfig[] {
  const switchRatio = parseRatio(env.GEMINI_QUOTA_SWITCH_RATIO, DEFAULT_SWITCH_RATIO);

  // Preserve soft-limit overrides cleanly when specified
  const hydrogenSoftOverride = env.GEMINI_HYDROGEN_RPM_SOFT_LIMIT
    ? parsePositiveInt(env.GEMINI_HYDROGEN_RPM_SOFT_LIMIT, 8, 1, 60)
    : 8;
  const flashLiteSoftOverride = env.GEMINI_FLASH_LITE_RPM_SOFT_LIMIT
    ? parsePositiveInt(env.GEMINI_FLASH_LITE_RPM_SOFT_LIMIT, 12, 1, 60)
    : 12;

  const hydrogenHard = Math.max(
    hydrogenSoftOverride + 1,
    Math.ceil(hydrogenSoftOverride / switchRatio)
  );
  const flashLiteHard = Math.max(
    flashLiteSoftOverride + 1,
    Math.ceil(flashLiteSoftOverride / switchRatio)
  );

  return [
    {
      id: 'gemini-4-hydrogen',
      model: 'gemini-4-hydrogen',
      endpoint: 'generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen',
      provider: 'gemini',
      rpmLimit: hydrogenHard,
      priority: 1,
    },
    {
      id: 'gemini-3.1-flash-lite',
      model: 'gemini-3.1-flash-lite',
      endpoint: 'generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite',
      provider: 'gemini',
      rpmLimit: flashLiteHard,
      priority: 2,
    },
  ];
}

/**
 * QuotaManager tracks rolling RPM, TPM, RPD, and cooldown health across multiple configured
 * API keys and model/endpoint tiers, automatically rotating to the next healthy key or tier
 * before limits are exceeded.
 */
export class QuotaManager {
  private keys: QuotaApiKeyConfig[];
  private endpoints: QuotaEndpointTierConfig[];
  private switchThresholdRatio: number;
  private windowMs: number;
  private dailyWindowMs: number;
  private defaultCooldownMs: number;
  private minCooldownMs: number;
  private maxCooldownMs: number;
  private authErrorCooldownMs: number;
  private notFoundCooldownMs: number;

  private readonly keyBuckets = new Map<string, UsageBucket>();
  private readonly endpointBuckets = new Map<string, UsageBucket>();
  private readonly pairBuckets = new Map<string, UsageBucket>();

  constructor(config: QuotaManagerConfig = {}) {
    this.keys = (config.keys || []).map((k, idx) => ({
      ...k,
      provider: k.provider || 'gemini',
      rpmLimit: k.rpmLimit ?? 15,
      priority: k.priority ?? idx + 1,
    }));
    this.endpoints = (config.endpoints || []).map((e, idx) => ({
      ...e,
      provider: e.provider || 'gemini',
      endpoint: e.endpoint || e.id,
      priority: e.priority ?? idx + 1,
    }));
    this.switchThresholdRatio = clamp(
      config.switchThresholdRatio ?? DEFAULT_SWITCH_RATIO,
      0.1,
      0.99
    );
    this.windowMs = Math.max(1_000, config.windowMs ?? DEFAULT_WINDOW_MS);
    this.dailyWindowMs = Math.max(this.windowMs, config.dailyWindowMs ?? DEFAULT_DAILY_WINDOW_MS);
    this.defaultCooldownMs = Math.max(1_000, config.defaultCooldownMs ?? DEFAULT_COOLDOWN_MS);
    this.minCooldownMs = Math.max(1_000, config.minCooldownMs ?? DEFAULT_MIN_COOLDOWN_MS);
    this.maxCooldownMs = Math.max(this.minCooldownMs, config.maxCooldownMs ?? DEFAULT_MAX_COOLDOWN_MS);
    this.authErrorCooldownMs = Math.max(5_000, config.authErrorCooldownMs ?? DEFAULT_AUTH_COOLDOWN_MS);
    this.notFoundCooldownMs = Math.max(5_000, config.notFoundCooldownMs ?? DEFAULT_NOT_FOUND_COOLDOWN_MS);
  }

  public reconfigure(config: Pick<QuotaManagerConfig, 'keys' | 'endpoints' | 'switchThresholdRatio'>): void {
    if (config.keys !== undefined) {
      this.keys = config.keys.map((k, idx) => ({
        ...k,
        provider: k.provider || 'gemini',
        rpmLimit: k.rpmLimit ?? 15,
        priority: k.priority ?? idx + 1,
      }));
    }
    if (config.endpoints !== undefined) {
      this.endpoints = config.endpoints.map((e, idx) => ({
        ...e,
        provider: e.provider || 'gemini',
        endpoint: e.endpoint || e.id,
        priority: e.priority ?? idx + 1,
      }));
    }
    if (config.switchThresholdRatio !== undefined) {
      this.switchThresholdRatio = clamp(config.switchThresholdRatio, 0.1, 0.99);
    }
  }

  public reset(): void {
    this.keyBuckets.clear();
    this.endpointBuckets.clear();
    this.pairBuckets.clear();
  }

  private getOrCreateBucket(store: Map<string, UsageBucket>, id: string): UsageBucket {
    let bucket = store.get(id);
    if (!bucket) {
      bucket = createEmptyBucket();
      store.set(id, bucket);
    }
    return bucket;
  }

  private pairKey(keyId: string, endpointId: string): string {
    return `${keyId}::${endpointId}`;
  }

  private pruneBucket(bucket: UsageBucket, nowMs: number): void {
    const windowCutoff = nowMs - this.windowMs;
    const dailyCutoff = nowMs - this.dailyWindowMs;

    if (bucket.requestTimestamps.length > 0) {
      bucket.requestTimestamps = bucket.requestTimestamps.filter((ts) => ts > windowCutoff);
    }
    if (bucket.dailyTimestamps.length > 0) {
      bucket.dailyTimestamps = bucket.dailyTimestamps.filter((ts) => ts > dailyCutoff);
    }
    if (bucket.tokenEntries.length > 0) {
      bucket.tokenEntries = bucket.tokenEntries.filter((e) => e.ts > windowCutoff);
    }
    if (bucket.cooldownUntilMs > 0 && bucket.cooldownUntilMs <= nowMs) {
      bucket.cooldownUntilMs = 0;
    }
  }

  private getTokensInWindow(bucket: UsageBucket): number {
    let sum = 0;
    for (const entry of bucket.tokenEntries) {
      sum += entry.tokens;
    }
    return sum;
  }

  private resolveEffectiveKeys(): QuotaApiKeyConfig[] {
    if (this.keys.length > 0) {
      return [...this.keys].sort((a, b) => (a.priority ?? 1) - (b.priority ?? 1));
    }
    return [
      {
        id: VIRTUAL_DEFAULT_KEY_ID,
        apiKey: '',
        label: 'Unconfigured Virtual Slot',
        provider: 'gemini',
        rpmLimit: 60,
        priority: 1,
      },
    ];
  }

  private getEndpointConfig(endpointId: string): QuotaEndpointTierConfig {
    const found = this.endpoints.find((e) => e.id === endpointId || e.model === endpointId);
    if (found) return found;
    return {
      id: endpointId,
      model: endpointId,
      endpoint: endpointId,
      provider: 'gemini',
      rpmLimit: 10,
      priority: 99,
    };
  }

  private evaluateKeyHealth(keyCfg: QuotaApiKeyConfig, nowMs: number): QuotaKeyStatus {
    const bucket = this.getOrCreateBucket(this.keyBuckets, keyCfg.id);
    this.pruneBucket(bucket, nowMs);

    const hardRpm = Math.max(1, keyCfg.rpmLimit ?? 15);
    const softRpm = computeSoftLimit(hardRpm, this.switchThresholdRatio);
    const reqs = bucket.requestTimestamps.length;
    const dailyReqs = bucket.dailyTimestamps.length;
    const tokens = this.getTokensInWindow(bucket);

    const rpmRatio = reqs / hardRpm;
    const tpmRatio = keyCfg.tpmLimit ? tokens / Math.max(1, keyCfg.tpmLimit) : 0;
    const rpdRatio = keyCfg.rpdLimit ? dailyReqs / Math.max(1, keyCfg.rpdLimit) : 0;
    const utilizationRatio = Math.max(rpmRatio, tpmRatio, rpdRatio);

    const inCooldown = bucket.cooldownUntilMs > nowMs;
    const cooldownRemainingSec = inCooldown
      ? Math.max(1, Math.ceil((bucket.cooldownUntilMs - nowMs) / 1000))
      : 0;

    const approachingLimit =
      reqs >= softRpm ||
      (keyCfg.tpmLimit ? tokens >= computeSoftLimit(keyCfg.tpmLimit, this.switchThresholdRatio) : false) ||
      (keyCfg.rpdLimit ? dailyReqs >= computeSoftLimit(keyCfg.rpdLimit, this.switchThresholdRatio) : false);

    return {
      keyId: keyCfg.id,
      label: keyCfg.label || keyCfg.id,
      provider: keyCfg.provider || 'gemini',
      requestsInWindow: reqs,
      requestsToday: dailyReqs,
      tokensInWindow: tokens,
      softRpmLimit: softRpm,
      hardRpmLimit: hardRpm,
      remainingBeforeSwitch: Math.max(0, softRpm - reqs),
      utilizationRatio: Number(utilizationRatio.toFixed(3)),
      approachingLimit,
      inCooldown,
      cooldownRemainingSec,
      consecutiveFailures: bucket.consecutiveFailures,
      lastErrorCategory: bucket.lastErrorCategory,
    };
  }

  private evaluateEndpointHealth(endpointId: string, nowMs: number): QuotaEndpointStatus {
    const cfg = this.getEndpointConfig(endpointId);
    const bucket = this.getOrCreateBucket(this.endpointBuckets, cfg.id);
    this.pruneBucket(bucket, nowMs);

    const hardRpm = Math.max(1, cfg.rpmLimit);
    const softRpm = computeSoftLimit(hardRpm, this.switchThresholdRatio);
    const reqs = bucket.requestTimestamps.length;
    const dailyReqs = bucket.dailyTimestamps.length;
    const tokens = this.getTokensInWindow(bucket);

    const rpmRatio = reqs / hardRpm;
    const tpmRatio = cfg.tpmLimit ? tokens / Math.max(1, cfg.tpmLimit) : 0;
    const rpdRatio = cfg.rpdLimit ? dailyReqs / Math.max(1, cfg.rpdLimit) : 0;
    const utilizationRatio = Math.max(rpmRatio, tpmRatio, rpdRatio);

    const inCooldown = bucket.cooldownUntilMs > nowMs;
    const cooldownRemainingSec = inCooldown
      ? Math.max(1, Math.ceil((bucket.cooldownUntilMs - nowMs) / 1000))
      : 0;

    const approachingLimit =
      reqs >= softRpm ||
      (cfg.tpmLimit ? tokens >= computeSoftLimit(cfg.tpmLimit, this.switchThresholdRatio) : false) ||
      (cfg.rpdLimit ? dailyReqs >= computeSoftLimit(cfg.rpdLimit, this.switchThresholdRatio) : false);

    return {
      endpointId: cfg.id,
      model: cfg.model,
      endpoint: cfg.endpoint || cfg.id,
      provider: cfg.provider || 'gemini',
      requestsInWindow: reqs,
      requestsToday: dailyReqs,
      tokensInWindow: tokens,
      softRpmLimit: softRpm,
      hardRpmLimit: hardRpm,
      remainingSoftBudget: Math.max(0, softRpm - reqs),
      utilizationRatio: Number(utilizationRatio.toFixed(3)),
      approachingLimit,
      inCooldown,
      cooldownRemainingSec,
      consecutiveFailures: bucket.consecutiveFailures,
    };
  }

  public getUtilizationRatioForEndpoint(endpointId: string, nowMs: number = Date.now()): number {
    const status = this.evaluateEndpointHealth(endpointId, nowMs);
    return status.requestsInWindow / Math.max(1, status.softRpmLimit);
  }

  public getSnapshot(endpointIds?: readonly string[], nowMs: number = Date.now()): QuotaManagerSnapshot {
    const configuredKeys = this.keys;
    const keyStatuses = configuredKeys.map((k) => this.evaluateKeyHealth(k, nowMs));
    const healthyKeys = keyStatuses.filter((k) => !k.inCooldown).length;

    const targetEndpointIds =
      endpointIds && endpointIds.length > 0
        ? Array.from(new Set(endpointIds))
        : this.endpoints.map((e) => e.id);
    const endpointStatuses = targetEndpointIds.map((id) => this.evaluateEndpointHealth(id, nowMs));

    return {
      switchThresholdRatio: this.switchThresholdRatio,
      windowMs: this.windowMs,
      hasConfiguredKeys: configuredKeys.length > 0,
      totalConfiguredKeys: configuredKeys.length,
      healthyKeys,
      keys: keyStatuses,
      endpoints: endpointStatuses,
    };
  }

  /**
   * Selects ordered `(key, endpoint/tier)` route candidates:
   * 1. Excludes any pair where key, endpoint, or (key, endpoint) pair is in cooldown.
   * 2. Places healthy below-threshold pairs FIRST (preferred endpoint across healthy keys, then fallback tiers across healthy keys).
   * 3. Automatically switches key or tier BEFORE exceeding hard quota limits when usage hits `switchThresholdRatio`.
   * 4. Returns `allInCooldown=true` with `earliestRetryAfterSec` when every route is cooling down.
   */
  public acquirePlan(
    preferredEndpointId: string,
    fallbackEndpointIds: readonly string[] = [],
    nowMs: number = Date.now()
  ): QuotaAcquisitionPlan {
    const orderedEndpointIds = Array.from(
      new Set([preferredEndpointId, ...fallbackEndpointIds, ...this.endpoints.map((e) => e.id)])
    ).filter(Boolean);

    const effectiveKeys = this.resolveEffectiveKeys();
    const primaryKeyId = effectiveKeys[0]?.id || VIRTUAL_DEFAULT_KEY_ID;
    const snapshot = this.getSnapshot(orderedEndpointIds, nowMs);

    interface EvaluatedPair {
      candidate: QuotaCandidateRoute;
      endpointIdx: number;
      keyPriority: number;
      inCooldown: boolean;
      cooldownUntilMs: number;
    }

    const evaluatedPairs: EvaluatedPair[] = [];
    const keyStatusMap = new Map<string, QuotaKeyStatus>(
      effectiveKeys.map((k) => [k.id, this.evaluateKeyHealth(k, nowMs)])
    );
    const endpointStatusMap = new Map<string, QuotaEndpointStatus>(
      orderedEndpointIds.map((id) => [id, this.evaluateEndpointHealth(id, nowMs)])
    );

    const multiKeyMode = effectiveKeys.length > 1;

    for (let epIdx = 0; epIdx < orderedEndpointIds.length; epIdx++) {
      const epId = orderedEndpointIds[epIdx];
      const epCfg = this.getEndpointConfig(epId);
      const epStatus = endpointStatusMap.get(epId)!;
      const epBucket = this.getOrCreateBucket(this.endpointBuckets, epCfg.id);

      for (const keyCfg of effectiveKeys) {
        if (
          keyCfg.allowedEndpointIds &&
          keyCfg.allowedEndpointIds.length > 0 &&
          !keyCfg.allowedEndpointIds.includes(epCfg.id)
        ) {
          continue;
        }
        if (keyCfg.provider && epCfg.provider && keyCfg.provider !== epCfg.provider) {
          continue;
        }

        const keyStatus = keyStatusMap.get(keyCfg.id)!;
        const keyBucket = this.getOrCreateBucket(this.keyBuckets, keyCfg.id);
        const pairBucket = this.getOrCreateBucket(this.pairBuckets, this.pairKey(keyCfg.id, epCfg.id));
        this.pruneBucket(pairBucket, nowMs);

        const pairSoftRpm = computeSoftLimit(epCfg.rpmLimit, this.switchThresholdRatio);
        const pairReqs = pairBucket.requestTimestamps.length;
        const pairApproaching = pairReqs >= pairSoftRpm;

        // In single-key mode, endpoint-level and key-level share saturation; in multi-key mode,
        // per-pair + per-key usage determines whether another key can absorb load on the same tier.
        const effectiveReqs = multiKeyMode ? pairReqs : Math.max(pairReqs, epStatus.requestsInWindow);
        const effectiveApproaching =
          keyStatus.approachingLimit ||
          pairApproaching ||
          (!multiKeyMode && epStatus.approachingLimit);

        const pairCooldownUntil = Math.max(
          keyBucket.cooldownUntilMs,
          epBucket.cooldownUntilMs,
          pairBucket.cooldownUntilMs
        );
        const inCooldown = pairCooldownUntil > nowMs;

        const utilizationRatio = Math.max(
          keyStatus.utilizationRatio,
          effectiveReqs / Math.max(1, epCfg.rpmLimit),
          multiKeyMode ? 0 : epStatus.utilizationRatio
        );

        const isPrimaryKey = keyCfg.id === primaryKeyId;
        const isPrimaryEndpoint = epCfg.id === preferredEndpointId;
        const switchKind: QuotaSwitchKind =
          isPrimaryKey && isPrimaryEndpoint
            ? 'PRIMARY'
            : !isPrimaryKey && isPrimaryEndpoint
              ? 'KEY_SWITCH'
              : isPrimaryKey && !isPrimaryEndpoint
                ? 'TIER_SWITCH'
                : 'KEY_AND_TIER_SWITCH';

        evaluatedPairs.push({
          candidate: {
            keyId: keyCfg.id,
            apiKey: keyCfg.apiKey,
            endpointId: epCfg.id,
            model: epCfg.model,
            endpoint: epCfg.endpoint || epCfg.id,
            provider: epCfg.provider || 'gemini',
            requestsInWindow: effectiveReqs,
            softRpmLimit: pairSoftRpm,
            hardRpmLimit: epCfg.rpmLimit,
            utilizationRatio: Number(utilizationRatio.toFixed(3)),
            approachingLimit: effectiveApproaching,
            switchKind,
            reason: effectiveApproaching
              ? `Approaching limit (${effectiveReqs}/${epCfg.rpmLimit} RPM, ${Math.round(utilizationRatio * 100)}%)`
              : 'Healthy below threshold',
          },
          endpointIdx: epIdx,
          keyPriority: keyCfg.priority ?? 1,
          inCooldown,
          cooldownUntilMs: pairCooldownUntil,
        });
      }
    }

    const nonCooldownPairs = evaluatedPairs.filter((p) => !p.inCooldown);
    if (nonCooldownPairs.length === 0) {
      const earliestMs =
        evaluatedPairs.length > 0
          ? Math.min(...evaluatedPairs.map((p) => p.cooldownUntilMs || nowMs + this.defaultCooldownMs))
          : nowMs + this.defaultCooldownMs;
      const earliestRetryAfterSec = Math.max(1, Math.ceil((earliestMs - nowMs) / 1000));
      return {
        candidates: [],
        selected: null,
        allInCooldown: true,
        hasConfiguredKeys: this.keys.length > 0,
        earliestRetryAfterSec,
        switchedFromKeyId: null,
        switchedFromEndpointId: null,
        preQuotaSwitched: false,
        switchReason: `All configured API keys and tiers are in cooldown. Retry in ${earliestRetryAfterSec}s.`,
        snapshot,
      };
    }

    const healthyPairs = nonCooldownPairs.filter((p) => !p.candidate.approachingLimit);
    const approachingPairs = nonCooldownPairs.filter((p) => p.candidate.approachingLimit);

    // Prefer healthy routes: keep higher-priority tier when another healthy key can take it,
    // or fall back to next healthy tier; sort same-tier healthy keys by priority then lower utilization.
    healthyPairs.sort((a, b) => {
      if (a.endpointIdx !== b.endpointIdx) return a.endpointIdx - b.endpointIdx;
      const utilDiff = a.candidate.utilizationRatio - b.candidate.utilizationRatio;
      if (Math.abs(utilDiff) > 0.15) return utilDiff;
      return a.keyPriority - b.keyPriority;
    });

    // Reserve pairs approaching limit (not yet in cooldown) sorted by lowest utilization as final backup
    approachingPairs.sort((a, b) => {
      const utilDiff = a.candidate.utilizationRatio - b.candidate.utilizationRatio;
      if (Math.abs(utilDiff) > 0.001) return utilDiff;
      const aPairRatio = a.candidate.requestsInWindow / Math.max(1, a.candidate.hardRpmLimit);
      const bPairRatio = b.candidate.requestsInWindow / Math.max(1, b.candidate.hardRpmLimit);
      if (Math.abs(aPairRatio - bPairRatio) > 0.001) return aPairRatio - bPairRatio;
      if (a.endpointIdx !== b.endpointIdx) return a.endpointIdx - b.endpointIdx;
      return a.keyPriority - b.keyPriority;
    });

    const orderedCandidates = [...healthyPairs, ...approachingPairs].map((p) => p.candidate);
    const selected = orderedCandidates[0] || null;

    let switchedFromKeyId: string | null = null;
    let switchedFromEndpointId: string | null = null;
    let preQuotaSwitched = false;
    let switchReason: string | null = null;

    if (selected && (selected.keyId !== primaryKeyId || selected.endpointId !== preferredEndpointId)) {
      const primaryPair = evaluatedPairs.find(
        (p) => p.candidate.keyId === primaryKeyId && p.candidate.endpointId === preferredEndpointId
      );

      if (selected.keyId !== primaryKeyId) {
        switchedFromKeyId = primaryKeyId;
      }
      if (selected.endpointId !== preferredEndpointId) {
        switchedFromEndpointId = preferredEndpointId;
      }

      if (primaryPair && !primaryPair.inCooldown && primaryPair.candidate.approachingLimit) {
        preQuotaSwitched = true;
        if (selected.keyId !== primaryKeyId && selected.endpointId === preferredEndpointId) {
          switchReason = `Proactively rotated from ${primaryKeyId} (${primaryPair.candidate.requestsInWindow}/${primaryPair.candidate.hardRpmLimit} RPM) to ${selected.keyId} on ${selected.model} before exceeding quota.`;
        } else if (selected.keyId === primaryKeyId && selected.endpointId !== preferredEndpointId) {
          switchReason = `Proactively rerouted from ${preferredEndpointId} (${primaryPair.candidate.requestsInWindow}/${primaryPair.candidate.softRpmLimit} RPM threshold) to ${selected.model} before exceeding quota.`;
        } else {
          switchReason = `Proactively switched from ${primaryKeyId}/${preferredEndpointId} to ${selected.keyId}/${selected.model} before exceeding quota.`;
        }
      } else if (primaryPair?.inCooldown) {
        const remSec = Math.max(1, Math.ceil((primaryPair.cooldownUntilMs - nowMs) / 1000));
        switchReason = `Skipped ${primaryKeyId}/${preferredEndpointId} (${remSec}s cooldown) and routed directly to ${selected.keyId}/${selected.model}.`;
      } else if (selected.endpointId !== preferredEndpointId) {
        switchReason = `Balanced load from ${preferredEndpointId} to ${selected.model}.`;
      }
    }

    return {
      candidates: orderedCandidates,
      selected,
      allInCooldown: false,
      hasConfiguredKeys: this.keys.length > 0,
      earliestRetryAfterSec: 0,
      switchedFromKeyId,
      switchedFromEndpointId,
      preQuotaSwitched,
      switchReason,
      snapshot,
    };
  }

  public recordAttemptStart(
    route: Pick<QuotaUsageRecordOptions, 'keyId' | 'endpointId' | 'nowMs'>
  ): void {
    const nowMs = route.nowMs ?? Date.now();
    const endpointCfg = this.getEndpointConfig(route.endpointId);

    const epBucket = this.getOrCreateBucket(this.endpointBuckets, endpointCfg.id);
    this.pruneBucket(epBucket, nowMs);
    epBucket.requestTimestamps.push(nowMs);
    epBucket.dailyTimestamps.push(nowMs);

    const keyId = route.keyId || this.resolveEffectiveKeys()[0]?.id || VIRTUAL_DEFAULT_KEY_ID;
    const keyBucket = this.getOrCreateBucket(this.keyBuckets, keyId);
    this.pruneBucket(keyBucket, nowMs);
    keyBucket.requestTimestamps.push(nowMs);
    keyBucket.dailyTimestamps.push(nowMs);

    const pairBucket = this.getOrCreateBucket(
      this.pairBuckets,
      this.pairKey(keyId, endpointCfg.id)
    );
    this.pruneBucket(pairBucket, nowMs);
    pairBucket.requestTimestamps.push(nowMs);
    pairBucket.dailyTimestamps.push(nowMs);
  }

  public recordSuccess(opts: QuotaUsageRecordOptions): void {
    const nowMs = opts.nowMs ?? Date.now();
    const endpointCfg = this.getEndpointConfig(opts.endpointId);
    const tokens =
      typeof opts.tokensUsed === 'number' && opts.tokensUsed > 0
        ? Math.round(opts.tokensUsed)
        : 0;

    const epBucket = this.getOrCreateBucket(this.endpointBuckets, endpointCfg.id);
    epBucket.consecutiveFailures = 0;
    epBucket.lastErrorCategory = null;
    if (tokens > 0) {
      epBucket.tokenEntries.push({ ts: nowMs, tokens });
    }

    const keyId = opts.keyId || this.resolveEffectiveKeys()[0]?.id;
    if (keyId) {
      const keyBucket = this.getOrCreateBucket(this.keyBuckets, keyId);
      keyBucket.consecutiveFailures = 0;
      keyBucket.lastErrorCategory = null;
      if (tokens > 0) {
        keyBucket.tokenEntries.push({ ts: nowMs, tokens });
      }

      const pairBucket = this.getOrCreateBucket(
        this.pairBuckets,
        this.pairKey(keyId, endpointCfg.id)
      );
      pairBucket.consecutiveFailures = 0;
      pairBucket.lastErrorCategory = null;
      if (tokens > 0) {
        pairBucket.tokenEntries.push({ ts: nowMs, tokens });
      }
    }
  }

  public recordFailure(
    route: { keyId?: string; endpointId: string },
    failure: QuotaFailureInput,
    nowMs: number = Date.now()
  ): number {
    const endpointCfg = this.getEndpointConfig(route.endpointId);
    const keyId = route.keyId;

    const applyCooldown = (bucket: UsageBucket, cooldownMs: number) => {
      this.pruneBucket(bucket, nowMs);
      bucket.consecutiveFailures += 1;
      bucket.lastErrorCategory = failure.category;
      bucket.cooldownUntilMs = Math.max(bucket.cooldownUntilMs, nowMs + cooldownMs);
    };

    if (failure.category === 'UNAUTHENTICATED' || failure.category === 'PERMISSION_DENIED') {
      if (keyId) {
        const keyBucket = this.getOrCreateBucket(this.keyBuckets, keyId);
        applyCooldown(keyBucket, this.authErrorCooldownMs);
        return Math.ceil(this.authErrorCooldownMs / 1000);
      }
      return 0;
    }

    if (failure.category === 'NOT_FOUND') {
      const epBucket = this.getOrCreateBucket(this.endpointBuckets, endpointCfg.id);
      applyCooldown(epBucket, this.notFoundCooldownMs);
      return Math.ceil(this.notFoundCooldownMs / 1000);
    }

    if (failure.category === 'RATE_LIMITED') {
      const targetBucket = keyId
        ? this.getOrCreateBucket(this.pairBuckets, this.pairKey(keyId, endpointCfg.id))
        : this.getOrCreateBucket(this.endpointBuckets, endpointCfg.id);
      this.pruneBucket(targetBucket, nowMs);
      const nextFailures = targetBucket.consecutiveFailures + 1;
      const baseRetryMs = failure.retryAfterSec
        ? clamp(failure.retryAfterSec * 1000, this.minCooldownMs, this.maxCooldownMs)
        : this.defaultCooldownMs;
      const escalatedMs = Math.min(
        this.maxCooldownMs,
        baseRetryMs * (nextFailures > 1 ? 1.5 : 1)
      );

      if (keyId) {
        applyCooldown(targetBucket, escalatedMs);
        if (failure.scope === 'KEY') {
          applyCooldown(this.getOrCreateBucket(this.keyBuckets, keyId), escalatedMs);
        } else if (failure.scope === 'ENDPOINT' || this.keys.length <= 1) {
          applyCooldown(this.getOrCreateBucket(this.endpointBuckets, endpointCfg.id), escalatedMs);
        }
      } else {
        // Endpoint-wide failure applies to endpoint & all currently active keys
        applyCooldown(this.getOrCreateBucket(this.endpointBuckets, endpointCfg.id), escalatedMs);
        for (const k of this.resolveEffectiveKeys()) {
          applyCooldown(
            this.getOrCreateBucket(this.pairBuckets, this.pairKey(k.id, endpointCfg.id)),
            escalatedMs
          );
        }
      }
      return Math.max(1, Math.ceil(escalatedMs / 1000));
    }

    if (
      failure.category === 'TIMEOUT' ||
      failure.category === 'UPSTREAM_ERROR' ||
      failure.category === 'NETWORK_ERROR'
    ) {
      const targetBucket = keyId
        ? this.getOrCreateBucket(this.pairBuckets, this.pairKey(keyId, endpointCfg.id))
        : this.getOrCreateBucket(this.endpointBuckets, endpointCfg.id);
      this.pruneBucket(targetBucket, nowMs);
      targetBucket.consecutiveFailures += 1;
      targetBucket.lastErrorCategory = failure.category;

      const briefMs = targetBucket.consecutiveFailures >= 2 ? 30_000 : 15_000;
      targetBucket.cooldownUntilMs = Math.max(targetBucket.cooldownUntilMs, nowMs + briefMs);
      if (!keyId || this.keys.length <= 1) {
        const epBucket = this.getOrCreateBucket(this.endpointBuckets, endpointCfg.id);
        epBucket.cooldownUntilMs = Math.max(epBucket.cooldownUntilMs, nowMs + briefMs);
      }
      return Math.ceil(briefMs / 1000);
    }

    return 0;
  }
}
