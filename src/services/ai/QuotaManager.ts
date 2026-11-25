/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import {
  QuotaManager,
  buildDefaultGeminiEndpointsFromEnv,
  computeSoftLimit,
  loadConfiguredGeminiKeysFromEnv,
  type QuotaAcquisitionPlan,
  type QuotaApiKeyConfig,
  type QuotaCandidateRoute,
  type QuotaEndpointStatus,
  type QuotaEndpointTierConfig,
  type QuotaFailureInput,
  type QuotaKeyStatus,
  type QuotaManagerConfig,
  type QuotaManagerSnapshot,
  type QuotaSwitchKind,
  type QuotaUsageRecordOptions,
} from '../../server/services/quotaManager';
import {
  getQuotaManagerSnapshot,
  getSharedGeminiQuotaManager,
} from '../../server/services/geminiFreeTierRouter';

export {
  QuotaManager,
  buildDefaultGeminiEndpointsFromEnv,
  computeSoftLimit,
  loadConfiguredGeminiKeysFromEnv,
  type QuotaAcquisitionPlan,
  type QuotaApiKeyConfig,
  type QuotaCandidateRoute,
  type QuotaEndpointStatus,
  type QuotaEndpointTierConfig,
  type QuotaFailureInput,
  type QuotaKeyStatus,
  type QuotaManagerConfig,
  type QuotaManagerSnapshot,
  type QuotaSwitchKind,
  type QuotaUsageRecordOptions,
};

const PLACEHOLDER_API_KEY_VALUES = new Set([
  'MY_GEMINI_API_KEY',
  'YOUR_GEMINI_API_KEY',
  'YOUR_API_KEY',
  'REPLACE_ME',
]);

/**
 * Returns true only when executing inside a server-side Node runtime.
 * Prevents private `.env.example` API keys from ever being read or exposed in browser bundles.
 */
export function isServerQuotaRuntime(): boolean {
  return (
    typeof window === 'undefined' &&
    typeof process !== 'undefined' &&
    typeof process.env === 'object' &&
    process.env !== null
  );
}

function isPlaceholderSecret(value: string | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return PLACEHOLDER_API_KEY_VALUES.has(trimmed.toUpperCase());
}

function sanitizeEnvForQuotaLoader(
  env?: Record<string, string | undefined>
): Record<string, string | undefined> {
  if (!env && !isServerQuotaRuntime()) {
    return {};
  }
  const source = env ?? (process.env as Record<string, string | undefined>);
  const cleaned: Record<string, string | undefined> = { ...source };

  if (isPlaceholderSecret(cleaned.GEMINI_API_KEY)) {
    delete cleaned.GEMINI_API_KEY;
  }
  for (let i = 1; i <= 10; i += 1) {
    const varName = `GEMINI_API_KEY_${i}`;
    if (isPlaceholderSecret(cleaned[varName])) {
      delete cleaned[varName];
    }
  }
  if (cleaned.GEMINI_API_KEYS) {
    const filteredCsv = cleaned.GEMINI_API_KEYS.split(',')
      .map((s) => s.trim())
      .filter((s) => !isPlaceholderSecret(s));
    if (filteredCsv.length > 0) {
      cleaned.GEMINI_API_KEYS = filteredCsv.join(',');
    } else {
      delete cleaned.GEMINI_API_KEYS;
    }
  }
  return cleaned;
}

/**
 * Loads server-side API keys defined in `.env.example` (`GEMINI_API_KEY`,
 * `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`, `GEMINI_API_KEYS`, and optional `OPENAI_API_KEY`).
 * Always returns an empty array if invoked in a browser context.
 */
export function loadApiKeysFromEnv(
  env?: Record<string, string | undefined>,
  options?: { includeOpenAiVisionKey?: boolean }
): QuotaApiKeyConfig[] {
  if (!env && !isServerQuotaRuntime()) {
    return [];
  }
  const safeEnv = sanitizeEnvForQuotaLoader(env);
  const geminiKeys = loadConfiguredGeminiKeysFromEnv(safeEnv as NodeJS.ProcessEnv);

  if (options?.includeOpenAiVisionKey && !isPlaceholderSecret(safeEnv.OPENAI_API_KEY)) {
    const openAiKey = safeEnv.OPENAI_API_KEY!.trim();
    const openAiModel = (safeEnv.OPENAI_MODEL || 'gpt-4o-mini').trim();
    geminiKeys.push({
      id: 'openai-vision-key-1',
      apiKey: openAiKey,
      label: 'OpenAI Vision Fallback Key',
      provider: 'openai',
      rpmLimit: 30,
      priority: geminiKeys.length + 1,
      allowedEndpointIds: [openAiModel],
    });
  }

  return geminiKeys;
}

/**
 * Constructs an isolated `QuotaManager` pre-configured from `.env.example` keys,
 * endpoint tiers (`GEMINI_MODEL`, `GEMINI_SEARCH_MODEL`), and switch ratio (`GEMINI_QUOTA_SWITCH_RATIO`).
 */
export function createQuotaManagerFromEnv(
  env?: Record<string, string | undefined>,
  overrides?: Partial<QuotaManagerConfig>
): QuotaManager {
  const safeEnv = sanitizeEnvForQuotaLoader(env);
  const keys = overrides?.keys ?? loadApiKeysFromEnv(safeEnv);
  const endpoints =
    overrides?.endpoints ??
    buildDefaultGeminiEndpointsFromEnv(safeEnv as NodeJS.ProcessEnv);

  const parsedRatio = Number(safeEnv.GEMINI_QUOTA_SWITCH_RATIO);
  const switchThresholdRatio =
    overrides?.switchThresholdRatio ??
    (Number.isFinite(parsedRatio) ? parsedRatio : 0.8);

  return new QuotaManager({
    ...overrides,
    keys,
    endpoints,
    switchThresholdRatio,
  });
}

/**
 * Returns the canonical shared server-side QuotaManager singleton so all AI routes
 * and services track rolling RPM/TPM/RPD usage and cooldowns from a single source of truth.
 */
export function getSharedQuotaManager(): QuotaManager {
  if (!isServerQuotaRuntime()) {
    return new QuotaManager({ keys: [], endpoints: [] });
  }
  return getSharedGeminiQuotaManager();
}

/**
 * Selects the next available `(key, endpoint)` candidate before quota limits are exceeded.
 */
export function selectNextAvailableEndpoint(
  preferredModel = 'gemini-4-hydrogen',
  fallbackModels: readonly string[] = ['gemini-3.1-flash-lite'],
  nowMs: number = Date.now()
): QuotaAcquisitionPlan {
  return getSharedQuotaManager().acquirePlan(preferredModel, fallbackModels, nowMs);
}

/**
 * Returns a sanitized, secret-free telemetry snapshot of configured key slots and endpoint tiers.
 */
export function getSanitizedQuotaStatus(nowMs: number = Date.now()): QuotaManagerSnapshot {
  if (!isServerQuotaRuntime()) {
    return {
      switchThresholdRatio: 0.8,
      windowMs: 60_000,
      hasConfiguredKeys: false,
      totalConfiguredKeys: 0,
      healthyKeys: 0,
      keys: [],
      endpoints: [],
    };
  }
  return getQuotaManagerSnapshot(nowMs);
}

export default QuotaManager;
