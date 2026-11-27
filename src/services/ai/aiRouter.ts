/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type {
  AiDiagnosticResult,
  AiRouterStatusSnapshot,
  AiTierAttemptLog,
  AiTierId,
  AiTierMetadata,
  BenchTelemetry,
  BilingualLang,
} from '../../types/aiAssistant';
import {
  sendGeminiChat,
  type FreeTierModelPoolStatusEntry,
  type GeminiChatRole,
  type StructuredAiHttpError,
} from '../geminiIntelligenceService';
import {
  saveVerifiedKnowledgeEntry,
  searchLocalFirstKnowledge,
} from './localKnowledgeDB';
import {
  isLiveTelemetryQuery,
  lookupVoiceInteractionCache,
  resetVoiceInteractionCacheMemorySync,
  saveVoiceInteractionCache,
} from './voiceInteractionCache';
import {
  buildThreeRepairStepCards,
  formatBenchSnapshotSummary,
  runOfflineDiagnosticEngine,
  stripBilingualStopwords,
} from './offlineEngine';

export const AI_TIER_CASCADE: readonly AiTierMetadata[] = [
  {
    id: 'CARBON',
    label: 'Carbon',
    shortLabel: 'Carbon',
    geminiRole: 'DEEP_REASONING',
    isOnline: true,
  },
  {
    id: 'HYDROGEN',
    label: 'Hydrogen',
    shortLabel: 'Hydrogen',
    geminiRole: 'COMPLEX_INTERACTIVE',
    isOnline: true,
  },
  {
    id: 'ARGON',
    label: 'Argon',
    shortLabel: 'Argon',
    geminiRole: 'GENERAL',
    isOnline: true,
  },
  {
    id: 'FLASH_LITE',
    label: 'Flash Lite',
    shortLabel: 'Flash Lite',
    geminiRole: 'FAST',
    isOnline: true,
  },
  {
    id: 'OFFLINE_AI',
    label: 'Offline AI',
    shortLabel: 'Offline AI',
    isOnline: false,
  },
] as const;

export interface OnlineTierTransportRequest {
  tier: AiTierMetadata;
  query: string;
  lang: BilingualLang;
  benchContextText: string;
  timeoutMs: number;
}

export interface OnlineTierTransportResponse {
  reply: string;
  model: string;
  confidence?: number;
  reroutedFrom?: string;
  preQuotaRerouted?: boolean;
  rerouteReason?: string;
  freeTierPoolStatus?: FreeTierModelPoolStatusEntry[];
}

export type OnlineTierTransportFn = (
  req: OnlineTierTransportRequest
) => Promise<OnlineTierTransportResponse>;

const DEFAULT_TIER_TIMEOUT_MS = 22_000;
const ROLLING_WINDOW_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_PER_TIER_SOFT_RPM = 4;
const DEFAULT_HYDROGEN_POOL_SOFT_RPM = 6;
const DEFAULT_FLASH_LITE_POOL_SOFT_RPM = 10;

let softLimitOverrides: {
  perTierSoftRpm?: number;
  hydrogenPoolSoftRpm?: number;
  flashLitePoolSoftRpm?: number;
} | null = null;

const tierRequestTimestamps = new Map<AiTierId, number[]>();
const tierCooldownUntilMs = new Map<AiTierId, number>();
const modelPoolRequestTimestamps = new Map<string, number[]>();
const modelPoolCooldownUntilMs = new Map<string, number>();

let routerStatus: AiRouterStatusSnapshot = {
  activeTier: 'CARBON',
  phase: 'IDLE',
  lastUpdatedAt: Date.now(),
  isOfflineFallback: false,
  attemptTrail: [],
};

const statusSubscribers = new Set<(snapshot: AiRouterStatusSnapshot) => void>();
let customTransportForTests: OnlineTierTransportFn | null = null;
let onlineOverrideForTests: boolean | null = null;

function mapTierToServerModel(tierId: AiTierId): string | null {
  if (tierId === 'CARBON' || tierId === 'HYDROGEN' || tierId === 'ARGON') {
    return 'gemini-4-hydrogen';
  }
  if (tierId === 'FLASH_LITE') {
    return 'gemini-3.1-flash-lite';
  }
  return null;
}

function getPerTierSoftRpm(): number {
  return softLimitOverrides?.perTierSoftRpm ?? DEFAULT_PER_TIER_SOFT_RPM;
}

function getModelPoolSoftRpm(model: string): number {
  if (model === 'gemini-3.1-flash-lite') {
    return softLimitOverrides?.flashLitePoolSoftRpm ?? DEFAULT_FLASH_LITE_POOL_SOFT_RPM;
  }
  return softLimitOverrides?.hydrogenPoolSoftRpm ?? DEFAULT_HYDROGEN_POOL_SOFT_RPM;
}

function pruneTimestamps<K>(map: Map<K, number[]>, key: K, nowMs: number): number[] {
  const cutoff = nowMs - ROLLING_WINDOW_MS;
  const list = (map.get(key) || []).filter((ts) => ts > cutoff);
  map.set(key, list);
  return list;
}

function getCooldownUntil<K>(map: Map<K, number>, key: K, nowMs: number): number {
  const until = map.get(key) || 0;
  if (until <= nowMs) {
    if (until > 0) map.delete(key);
    return 0;
  }
  return until;
}

function setCooldownUntil<K>(map: Map<K, number>, key: K, untilMs: number): void {
  const prev = map.get(key) || 0;
  if (untilMs > prev) {
    map.set(key, untilMs);
  }
}

function recordAttemptTimestamp(tierId: AiTierId, nowMs: number, trackModelPool: boolean): void {
  const tierList = pruneTimestamps(tierRequestTimestamps, tierId, nowMs);
  tierList.push(nowMs);
  if (trackModelPool) {
    const serverModel = mapTierToServerModel(tierId);
    if (serverModel) {
      const poolList = pruneTimestamps(modelPoolRequestTimestamps, serverModel, nowMs);
      poolList.push(nowMs);
    }
  }
}

function syncServerPoolStatus(
  poolStatus: FreeTierModelPoolStatusEntry[] | undefined,
  nowMs: number
): void {
  if (!poolStatus || poolStatus.length === 0) return;
  for (const entry of poolStatus) {
    if (entry.inCooldown && entry.cooldownRemainingSec > 0) {
      setCooldownUntil(
        modelPoolCooldownUntilMs,
        entry.model,
        nowMs + entry.cooldownRemainingSec * 1000
      );
    }
    const localList = pruneTimestamps(modelPoolRequestTimestamps, entry.model, nowMs);
    // Align local rolling count up to server count if server already processed more requests
    const deficit = entry.requestsInLast60s - localList.length;
    if (deficit > 0) {
      for (let i = 0; i < deficit; i++) {
        localList.push(nowMs);
      }
    }
  }
}

function getTierBlockState(
  tierId: AiTierId,
  nowMs: number,
  useModelPool: boolean
): {
  inCooldown: boolean;
  cooldownUntilMs: number;
  cooldownRemainingSec: number;
  atSoftQuota: boolean;
  usageReason: string;
} {
  const tierCooldown = getCooldownUntil(tierCooldownUntilMs, tierId, nowMs);
  const serverModel = mapTierToServerModel(tierId);
  const poolCooldown =
    useModelPool && serverModel
      ? getCooldownUntil(modelPoolCooldownUntilMs, serverModel, nowMs)
      : 0;
  const effectiveCooldown = Math.max(tierCooldown, poolCooldown);

  if (effectiveCooldown > nowMs) {
    const remainingSec = Math.max(1, Math.ceil((effectiveCooldown - nowMs) / 1000));
    return {
      inCooldown: true,
      cooldownUntilMs: effectiveCooldown,
      cooldownRemainingSec: remainingSec,
      atSoftQuota: true,
      usageReason: `In ${remainingSec}s cooldown protection`,
    };
  }

  const tierList = pruneTimestamps(tierRequestTimestamps, tierId, nowMs);
  const perTierLimit = getPerTierSoftRpm();
  if (tierList.length >= perTierLimit) {
    return {
      inCooldown: false,
      cooldownUntilMs: 0,
      cooldownRemainingSec: 0,
      atSoftQuota: true,
      usageReason: `Tier budget ${tierList.length}/${perTierLimit} RPM reached`,
    };
  }

  if (useModelPool && serverModel) {
    const poolList = pruneTimestamps(modelPoolRequestTimestamps, serverModel, nowMs);
    const poolLimit = getModelPoolSoftRpm(serverModel);
    if (poolList.length >= poolLimit) {
      return {
        inCooldown: false,
        cooldownUntilMs: 0,
        cooldownRemainingSec: 0,
        atSoftQuota: true,
        usageReason: `Model pool ${serverModel} soft cap ${poolList.length}/${poolLimit} RPM reached`,
      };
    }
  }

  return {
    inCooldown: false,
    cooldownUntilMs: 0,
    cooldownRemainingSec: 0,
    atSoftQuota: false,
    usageReason: '',
  };
}

function emitStatus(next: AiRouterStatusSnapshot): void {
  routerStatus = next;
  for (const listener of statusSubscribers) {
    try {
      listener(routerStatus);
    } catch {
      // Keep status bus isolated from subscriber render errors
    }
  }
}

export function getAiRouterStatus(): AiRouterStatusSnapshot {
  return routerStatus;
}

export function subscribeAiRouterStatus(
  listener: (snapshot: AiRouterStatusSnapshot) => void
): () => void {
  statusSubscribers.add(listener);
  listener(routerStatus);
  return () => {
    statusSubscribers.delete(listener);
  };
}

export function setAiRouterOnlineTransportForTests(
  fn: OnlineTierTransportFn | null,
  onlineOverride?: boolean | null
): void {
  customTransportForTests = fn;
  onlineOverrideForTests = onlineOverride === undefined ? null : onlineOverride;
}

export function setAiRouterSoftLimitsForTests(
  overrides: {
    perTierSoftRpm?: number;
    hydrogenPoolSoftRpm?: number;
    flashLitePoolSoftRpm?: number;
  } | null
): void {
  softLimitOverrides = overrides;
}

export function resetAiRouterStateForTests(): void {
  customTransportForTests = null;
  onlineOverrideForTests = null;
  softLimitOverrides = null;
  tierRequestTimestamps.clear();
  tierCooldownUntilMs.clear();
  modelPoolRequestTimestamps.clear();
  modelPoolCooldownUntilMs.clear();
  resetVoiceInteractionCacheMemorySync();
  emitStatus({
    activeTier: 'CARBON',
    phase: 'IDLE',
    lastUpdatedAt: Date.now(),
    isOfflineFallback: false,
    attemptTrail: [],
  });
}

function isBrowserOnline(): boolean {
  if (onlineOverrideForTests !== null) {
    return onlineOverrideForTests;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

import { getRelevantReferencesForAiContext } from '../automotiveKnowledgeService';

function buildSystemInstructionPrompt(
  query: string,
  lang: BilingualLang,
  benchContextText: string
): string {
  const languageDirective =
    lang === 'TL'
      ? 'Respond in clear, beginner-friendly Taglish (Filipino + English technical terms) suitable for a mechanic in a repair shop.'
      : 'Respond in clear, beginner-friendly English suitable for an automotive electronics technician.';

  const relevantRefs = getRelevantReferencesForAiContext({ query });
  const refContextText =
    relevantRefs.length > 0
      ? relevantRefs
          .map(
            (r, idx) =>
              `REF_${idx + 1}: [${r.make} ${r.model} (${r.years})] ${r.title} — ${r.summary} (Source: ${r.source.sourceName}, Status: ${r.source.verificationStatus}, URL: ${r.source.originalUrl})`
          )
          .join('\n')
      : 'No specific OEM reference match found in indexed catalog; rely on verified general automotive principles and highlight missing verifications.';

  return [
    'AUTOELECTRIC LAB PRO — ZERO-FABRICATION DIAGNOSTIC ASSISTANT',
    languageDirective,
    'RULES:',
    '1. Never invent ECU pinouts, wire colors, resistance values, or OEM repair steps.',
    '2. Explicitly separate simulated bench telemetry from real physical vehicle measurements.',
    '3. Format your response strictly with these 3 labeled sections:',
    'SAFETY_WARNING: <1-2 sentences of electrical safety warnings>',
    'ROOT_CAUSE: <2-3 sentences explaining the root cause and live bench telemetry>',
    'VERIFICATION_ACTION: <1 single concrete next verification step>',
    '',
    `VERIFIED_AUTOMOTIVE_KNOWLEDGE_REFERENCES:\n${refContextText}`,
    '',
    `LIVE_BENCH_TELEMETRY: ${benchContextText}`,
    `TECHNICIAN_QUERY: ${query}`,
  ].join('\n');
}

function parseOnlineReplyIntoSections(
  reply: string,
  lang: BilingualLang
): {
  safetyWarning: string;
  rootCause: string;
  verificationAction: string;
} {
  const safetyMatch = reply.match(/SAFETY_WARNING:\s*([\s\S]*?)(?=ROOT_CAUSE:|VERIFICATION_ACTION:|$)/i);
  const rootMatch = reply.match(/ROOT_CAUSE:\s*([\s\S]*?)(?=VERIFICATION_ACTION:|$)/i);
  const verifyMatch = reply.match(/VERIFICATION_ACTION:\s*([\s\S]*?)$/i);

  const fallbackSafety =
    lang === 'TL'
      ? 'MAG-INGAT: I-verify ang eksaktong ECU part number bago mag-jumper. Huwag maglalagay ng +12V sa 5V sensor rail at i-OFF ang PSU bago mag-OHMS test.'
      : 'ELECTRICAL SAFETY: Confirm exact ECU part number before jumpering. Never apply +12V to 5V sensor rails and switch PSU OFF before OHMS checks.';

  const safetyWarning = safetyMatch?.[1]?.trim() || fallbackSafety;
  const rootCause = rootMatch?.[1]?.trim() || reply.trim();
  const verificationAction =
    verifyMatch?.[1]?.trim() ||
    (lang === 'TL'
      ? 'Sukatin muna ang KL30/KL15 power at 5V VREF gamit ang DMM sa V_DC mode bago magpalit ng piyesa.'
      : 'Verify KL30/KL15 power and 5V VREF with DMM in V_DC mode before replacing any component.');

  return { safetyWarning, rootCause, verificationAction };
}

function classifyTransportError(error: unknown): {
  outcome: AiTierAttemptLog['outcome'];
  statusCode?: number;
  code?: string;
  retryAfterMs: number;
  attemptedModels: string[];
  allFreeTiersExhausted: boolean;
  reason: string;
} {
  const errObj = error as StructuredAiHttpError & { statusCode?: number };
  const message = String(errObj?.message || error || 'Unknown error');
  const statusCode = errObj?.status || errObj?.statusCode;
  const retryAfterMs =
    typeof errObj?.retryAfterSec === 'number' && errObj.retryAfterSec > 0
      ? Math.min(180_000, Math.max(5_000, errObj.retryAfterSec * 1000))
      : DEFAULT_COOLDOWN_MS;
  const attemptedModels = Array.isArray(errObj?.attemptedModels) ? errObj.attemptedModels : [];
  const allFreeTiersExhausted = Boolean(
    errObj?.allFreeTiersExhausted || errObj?.code === 'ALL_FREE_TIERS_COOLDOWN'
  );

  if (errObj?.name === 'AbortError' || /timeout|timed out/i.test(message)) {
    return {
      outcome: 'TIMEOUT',
      statusCode: 408,
      code: errObj?.code,
      retryAfterMs: 15_000,
      attemptedModels,
      allFreeTiersExhausted,
      reason: message,
    };
  }
  if (
    statusCode === 429 ||
    errObj?.code === 'ALL_FREE_TIERS_COOLDOWN' ||
    errObj?.code === 'USER_RATE_LIMITED' ||
    /\b429\b|quota|rate limit|resource_exhausted|cooldown/i.test(message)
  ) {
    return {
      outcome: 'QUOTA_429',
      statusCode: 429,
      code: errObj?.code,
      retryAfterMs,
      attemptedModels,
      allFreeTiersExhausted,
      reason: message,
    };
  }
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    /\b401\b|\b403\b|forbidden|unauthorized|paid|pin|expired/i.test(message)
  ) {
    return {
      outcome: 'AUTH_OR_TIER_BLOCKED',
      statusCode: statusCode || 403,
      code: errObj?.code,
      retryAfterMs: 30_000,
      attemptedModels,
      allFreeTiersExhausted: false,
      reason: message,
    };
  }
  return {
    outcome: 'NETWORK_ERROR',
    statusCode,
    code: errObj?.code,
    retryAfterMs: 15_000,
    attemptedModels,
    allFreeTiersExhausted,
    reason: message,
  };
}

async function defaultOnlineTransport(
  req: OnlineTierTransportRequest
): Promise<OnlineTierTransportResponse> {
  const role: GeminiChatRole = req.tier.geminiRole || 'GENERAL';
  const prompt = buildSystemInstructionPrompt(req.query, req.lang, req.benchContextText);

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Tier ${req.tier.label} timed out after ${req.timeoutMs}ms`));
    }, req.timeoutMs);
  });

  try {
    const response = await Promise.race([
      sendGeminiChat({
        messages: [{ role: 'user', text: prompt, timestamp: Date.now() }],
        role,
        benchContext: req.benchContextText,
        signal: controller.signal,
      }),
      timeoutPromise,
    ]);

    return {
      reply: response.reply,
      model: response.model,
      confidence: 0.9,
      reroutedFrom: response.reroutedFrom,
      preQuotaRerouted: response.preQuotaRerouted,
      rerouteReason: response.rerouteReason,
      freeTierPoolStatus: response.freeTierPoolStatus,
    };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export function getTierMetadata(tierId: AiTierId): AiTierMetadata {
  return (
    AI_TIER_CASCADE.find((t) => t.id === tierId) ||
    AI_TIER_CASCADE[AI_TIER_CASCADE.length - 1]
  );
}

/**
 * Multi-tier resilient AI Router with proactive pre-quota auto-rerouting & cooldown circuit breaking:
 * Cascades: Carbon ➔ Hydrogen ➔ Argon ➔ Flash Lite ➔ Offline AI.
 * Switches BEFORE hitting hard quota limits, skips cooled-down tiers/models,
 * and avoids amplifying server rate-limit errors.
 */
export async function queryAiDiagnosticRouter(params: {
  query: string;
  lang: BilingualLang;
  telemetry?: BenchTelemetry;
  timeoutMs?: number;
  forceOffline?: boolean;
  bypassInteractionCache?: boolean;
}): Promise<AiDiagnosticResult> {
  const {
    query,
    lang,
    telemetry,
    timeoutMs = DEFAULT_TIER_TIMEOUT_MS,
    forceOffline = false,
    bypassInteractionCache = false,
  } = params;

  const trimmedQuery = query.trim();
  const benchContextText = formatBenchSnapshotSummary(telemetry, lang);
  const extractedTokens = stripBilingualStopwords(trimmedQuery);
  const attemptTrail: AiTierAttemptLog[] = [];

  const liveTelemetryQuery = isLiveTelemetryQuery(trimmedQuery);

  // Check IndexedDB Voice/Diagnostic Interaction Cache BEFORE invoking online APIs
  // (strictly bypasses live bench telemetry questions so real-time voltages are never stale)
  if (
    !bypassInteractionCache &&
    !forceOffline &&
    isBrowserOnline() &&
    extractedTokens.length > 0 &&
    !liveTelemetryQuery
  ) {
    const cachedHit = await lookupVoiceInteractionCache({
      query: trimmedQuery,
      lang,
      channel: 'DIAGNOSTIC_ROUTER',
    });

    if (cachedHit?.diagnosticResult) {
      const hitNow = Date.now();
      const cacheTrail: AiTierAttemptLog[] = [
        {
          tier: cachedHit.diagnosticResult.tierUsed,
          outcome: 'VOICE_CACHE_HIT',
          reason: 'Served immediately from AutoLabPro_VoiceInteractionCache (0 online API calls)',
        },
      ];

      emitStatus({
        activeTier: cachedHit.diagnosticResult.tierUsed,
        phase: 'ACTIVE',
        lastUpdatedAt: hitNow,
        isOfflineFallback: false,
        attemptTrail: cacheTrail,
      });

      return {
        ...cachedHit.diagnosticResult,
        id: `cache-hit-${hitNow}`,
        sourceProvenance: 'LOCAL_VERIFIED_CACHE',
        cachedLocally: true,
        servedFromInteractionCache: true,
        cacheHitCount: cachedHit.hitCount,
        attemptTrail: cacheTrail,
        benchSnapshotSummary: benchContextText,
        createdAt: hitNow,
      };
    }

    // Step 2: Check Persistent Local-First Knowledge Database (semantic + keyword + synonym search)
    // before making any online AI request (Sections 7 & 8)
    const localKnowledgeHit = await searchLocalFirstKnowledge({
      query: trimmedQuery,
      tokens: extractedTokens,
      lang,
      minScore: 0.62,
    });

    if (localKnowledgeHit) {
      const hitNow = Date.now();
      const kbRecord = localKnowledgeHit.record;
      const kbTrail: AiTierAttemptLog[] = [
        {
          tier: kbRecord.sourceTier,
          outcome: 'VOICE_CACHE_HIT',
          reason: `Served from Local-First Knowledge DB (${localKnowledgeHit.matchType}, score=${localKnowledgeHit.score}, 0 online API calls)`,
        },
      ];

      emitStatus({
        activeTier: kbRecord.sourceTier,
        phase: 'ACTIVE',
        lastUpdatedAt: hitNow,
        isOfflineFallback: false,
        attemptTrail: kbTrail,
      });

      const conversationalSummary =
        lang === 'TL'
          ? `Boss, mula sa ating Local-First Verified Knowledge DB (${kbRecord.subject}): ${kbRecord.rootCauseSummary}`
          : `From our Local-First Verified Knowledge Database (${kbRecord.subject}): ${kbRecord.rootCauseSummary}`;

      return {
        id: `local-kb-hit-${hitNow}`,
        lang,
        tierUsed: kbRecord.sourceTier,
        tierLabel: getTierMetadata(kbRecord.sourceTier).label,
        sourceProvenance: 'LOCAL_VERIFIED_CACHE',
        confidence: kbRecord.confidence,
        blockedByScoreGate: false,
        subject: kbRecord.subject,
        conversationalSummary,
        cards: buildThreeRepairStepCards({
          lang,
          subject: kbRecord.subject,
          safetyWarning: kbRecord.safetyWarning,
          rootCause: kbRecord.rootCauseSummary,
          verificationAction: kbRecord.verificationStep,
          telemetry,
        }),
        extractedTokens,
        attemptTrail: kbTrail,
        cachedLocally: true,
        servedFromLocalKnowledgeDb: true,
        localKnowledgeRecordId: kbRecord.id,
        knowledgeClassification: kbRecord.classification,
        evidenceSource: kbRecord.evidenceSource || 'LOCAL_TECHNICAL_KNOWLEDGE',
        evidenceStatus: kbRecord.evidenceStatus || 'VALID',
        cacheHitCount: kbRecord.hitCount,
        benchSnapshotSummary: benchContextText,
        createdAt: hitNow,
      };
    }
  }

  const onlineTiers = AI_TIER_CASCADE.filter((t) => t.isOnline);
  const shouldAttemptOnline = !forceOffline && isBrowserOnline() && extractedTokens.length > 0;
  const useModelPoolTracking = !customTransportForTests;

  let detectedPreQuotaReroute = false;
  let detectedRerouteReason: string | undefined;

  if (shouldAttemptOnline) {
    const transport = customTransportForTests || defaultOnlineTransport;

    for (let i = 0; i < onlineTiers.length; i++) {
      const tier = onlineTiers[i];
      const nowMs = Date.now();
      const blockState = getTierBlockState(tier.id, nowMs, useModelPoolTracking);

      if (blockState.inCooldown) {
        attemptTrail.push({
          tier: tier.id,
          outcome: 'SKIPPED_COOLDOWN',
          statusCode: 429,
          reason: blockState.usageReason,
        });
        continue;
      }

      if (blockState.atSoftQuota) {
        const hasHealthyLaterTier = onlineTiers.slice(i + 1).some((candidate) => {
          const candidateState = getTierBlockState(candidate.id, nowMs, useModelPoolTracking);
          return !candidateState.inCooldown && !candidateState.atSoftQuota;
        });

        if (hasHealthyLaterTier) {
          detectedPreQuotaReroute = true;
          detectedRerouteReason = `Proactively rerouted past ${tier.label}: ${blockState.usageReason}`;
          attemptTrail.push({
            tier: tier.id,
            outcome: 'PRE_QUOTA_REROUTED',
            reason: blockState.usageReason,
          });
          continue;
        }
      }

      emitStatus({
        activeTier: tier.id,
        phase: i === 0 && attemptTrail.length === 0 ? 'ROUTING' : 'FALLBACK',
        lastUpdatedAt: nowMs,
        isOfflineFallback: false,
        preQuotaRerouted: detectedPreQuotaReroute,
        rerouteReason: detectedRerouteReason,
        attemptTrail: [...attemptTrail],
      });

      recordAttemptTimestamp(tier.id, nowMs, useModelPoolTracking);

      try {
        const res = await transport({
          tier,
          query: trimmedQuery,
          lang,
          benchContextText,
          timeoutMs,
        });

        if (!res.reply || !res.reply.trim()) {
          throw new Error(`Empty response from ${tier.label}`);
        }

        const successNow = Date.now();
        if (useModelPoolTracking) {
          syncServerPoolStatus(res.freeTierPoolStatus, successNow);
        }

        let effectiveTier = tier;
        if (
          useModelPoolTracking &&
          res.model === 'gemini-3.1-flash-lite' &&
          tier.id !== 'FLASH_LITE'
        ) {
          effectiveTier = getTierMetadata('FLASH_LITE');
          if (res.preQuotaRerouted) {
            detectedPreQuotaReroute = true;
            detectedRerouteReason =
              res.rerouteReason ||
              `Proactively rerouted from ${tier.label} to Flash Lite before exceeding quota.`;
            attemptTrail.push({
              tier: tier.id,
              outcome: 'PRE_QUOTA_REROUTED',
              reason: detectedRerouteReason,
            });
          } else {
            // Upstream gemini-4-hydrogen failed over to Flash Lite on server; cool down hydrogen tiers briefly
            const hydrogenCooldown = successNow + 30_000;
            setCooldownUntil(modelPoolCooldownUntilMs, 'gemini-4-hydrogen', hydrogenCooldown);
            attemptTrail.push({
              tier: tier.id,
              outcome: 'QUOTA_429',
              statusCode: 429,
              reason: res.rerouteReason || 'Server automatically failed over to Flash Lite.',
            });
          }
          attemptTrail.push({ tier: effectiveTier.id, outcome: 'SUCCESS' });
        } else {
          if (res.preQuotaRerouted) {
            detectedPreQuotaReroute = true;
            detectedRerouteReason = res.rerouteReason || detectedRerouteReason;
          }
          attemptTrail.push({ tier: effectiveTier.id, outcome: 'SUCCESS' });
        }

        const parsed = parseOnlineReplyIntoSections(res.reply, lang);
        const confidence = Math.max(0.82, Math.min(0.98, res.confidence ?? 0.9));
        const subject = extractedTokens.slice(0, 4).join(' ').toUpperCase() || 'ECU Bench Query';

        const cacheOutcome = liveTelemetryQuery
          ? {
              saved: false as const,
              classification: 'GENERAL_DIAGNOSTIC_GUIDANCE' as const,
              record: undefined,
            }
          : await saveVerifiedKnowledgeEntry({
              subject,
              tokens: extractedTokens,
              lang,
              sourceTier: effectiveTier.id,
              confidence,
              safetyWarning: parsed.safetyWarning,
              rootCauseSummary: parsed.rootCause,
              verificationStep: parsed.verificationAction,
              rawAnswer: res.reply,
              originalQuestion: trimmedQuery,
            });

        // If online AI returned unsafe advice that was classified as REJECTED_INFORMATION,
        // refuse to serve it and fall back to the deterministic safety-verified offline engine.
        if (cacheOutcome.classification === 'REJECTED_INFORMATION') {
          break;
        }

        emitStatus({
          activeTier: effectiveTier.id,
          phase: 'ACTIVE',
          lastUpdatedAt: successNow,
          isOfflineFallback: false,
          preQuotaRerouted: detectedPreQuotaReroute,
          rerouteReason: detectedRerouteReason,
          attemptTrail: [...attemptTrail],
        });

        const rerouteNoteTL = detectedPreQuotaReroute
          ? ' (auto-rerouted before quota)'
          : '';
        const rerouteNoteEN = detectedPreQuotaReroute
          ? ' (auto-rerouted before quota)'
          : '';

        const conversationalSummary =
          lang === 'TL'
            ? `Boss, batay sa verified online analysis (${effectiveTier.label}${rerouteNoteTL}): ${parsed.rootCause}`
            : `Based on verified online analysis (${effectiveTier.label}${rerouteNoteEN}): ${parsed.rootCause}`;

        const resultPayload: AiDiagnosticResult = {
          id: `online-${effectiveTier.id.toLowerCase()}-${successNow}`,
          lang,
          tierUsed: effectiveTier.id,
          tierLabel: effectiveTier.label,
          sourceProvenance: 'VERIFIED_ONLINE_AI',
          confidence: Number(confidence.toFixed(2)),
          blockedByScoreGate: false,
          subject,
          conversationalSummary,
          cards: buildThreeRepairStepCards({
            lang,
            subject,
            safetyWarning: parsed.safetyWarning,
            rootCause: parsed.rootCause,
            verificationAction: parsed.verificationAction,
            telemetry,
          }),
          extractedTokens,
          attemptTrail,
          cachedLocally: cacheOutcome.saved,
          localKnowledgeRecordId: cacheOutcome.record?.id,
          knowledgeClassification: cacheOutcome.classification,
          evidenceSource: cacheOutcome.record?.evidenceSource || 'LOCAL_TECHNICAL_KNOWLEDGE',
          evidenceStatus: cacheOutcome.record?.evidenceStatus || 'VALID',
          benchSnapshotSummary: benchContextText,
          createdAt: successNow,
        };

        if (!liveTelemetryQuery && cacheOutcome.saved) {
          await saveVoiceInteractionCache({
            channel: 'DIAGNOSTIC_ROUTER',
            lang,
            query: trimmedQuery,
            intent: 'DIAGNOSTIC_QUERY',
            spokenText: conversationalSummary,
            displayText: conversationalSummary,
            whyTip: parsed.safetyWarning,
            matchedSource: `${effectiveTier.label} Verified Diagnostic`,
            detailsBullets: [parsed.rootCause, parsed.verificationAction].filter(Boolean),
            diagnosticResult: resultPayload,
            sourceOrigin: 'VERIFIED_ONLINE_AI',
            confidence: resultPayload.confidence,
            nowMs: successNow,
          });
        }

        return resultPayload;
      } catch (error) {
        const failNow = Date.now();
        const classified = classifyTransportError(error);
        attemptTrail.push({
          tier: tier.id,
          outcome: classified.outcome,
          statusCode: classified.statusCode,
          reason: classified.reason,
        });

        // Cooldown the failed tier on 429 or real-mode TIMEOUT errors
        if (classified.outcome === 'QUOTA_429') {
          setCooldownUntil(tierCooldownUntilMs, tier.id, failNow + classified.retryAfterMs);
        } else if (useModelPoolTracking && classified.outcome === 'TIMEOUT') {
          setCooldownUntil(tierCooldownUntilMs, tier.id, failNow + 20_000);
          const serverModel = mapTierToServerModel(tier.id);
          if (serverModel) {
            setCooldownUntil(modelPoolCooldownUntilMs, serverModel, failNow + 20_000);
          }
        }

        // For real server responses, apply server-reported model cooldowns & short-circuit terminal cascades
        if (useModelPoolTracking) {
          for (const attemptedModel of classified.attemptedModels) {
            if (classified.outcome === 'QUOTA_429') {
              setCooldownUntil(modelPoolCooldownUntilMs, attemptedModel, failNow + classified.retryAfterMs);
            } else if (classified.outcome === 'TIMEOUT') {
              setCooldownUntil(modelPoolCooldownUntilMs, attemptedModel, failNow + 20_000);
            }
          }

          const terminalForCascade =
            classified.allFreeTiersExhausted ||
            classified.code === 'ALL_FREE_TIERS_COOLDOWN' ||
            classified.code === 'USER_RATE_LIMITED' ||
            classified.code === 'MISSING_API_KEY' ||
            classified.code === 'AUTH_REQUIRED' ||
            classified.code === 'TRIAL_EXPIRED' ||
            (classified.attemptedModels.includes('gemini-4-hydrogen') &&
              classified.attemptedModels.includes('gemini-3.1-flash-lite'));

          if (terminalForCascade) {
            const remainingOnline = onlineTiers.slice(i + 1);
            for (const skipped of remainingOnline) {
              if (
                classified.outcome === 'QUOTA_429' ||
                classified.code === 'USER_RATE_LIMITED' ||
                classified.allFreeTiersExhausted
              ) {
                setCooldownUntil(tierCooldownUntilMs, skipped.id, failNow + classified.retryAfterMs);
                attemptTrail.push({
                  tier: skipped.id,
                  outcome: 'SKIPPED_COOLDOWN',
                  statusCode: classified.statusCode || 429,
                  reason: 'Skipped to avoid duplicate quota hits while server pool cools down.',
                });
              } else {
                attemptTrail.push({
                  tier: skipped.id,
                  outcome: 'AUTH_OR_TIER_BLOCKED',
                  statusCode: classified.statusCode,
                  reason: classified.reason,
                });
              }
            }
            break;
          }
        }
      }
    }
  } else if (forceOffline || !isBrowserOnline()) {
    for (const tier of onlineTiers) {
      attemptTrail.push({
        tier: tier.id,
        outcome: 'SKIPPED_OFFLINE',
        reason: forceOffline ? 'Offline mode requested' : 'Device is offline',
      });
    }
  }

  // Final deterministic local fallback: Offline AI
  const offlineResult = await runOfflineDiagnosticEngine({
    query: trimmedQuery,
    lang,
    telemetry,
  });

  const nowAfterOffline = Date.now();
  const activeCooldowns = onlineTiers
    .map((t) => getCooldownUntil(tierCooldownUntilMs, t.id, nowAfterOffline))
    .filter((ms) => ms > nowAfterOffline);
  const maxCooldownUntilMs =
    activeCooldowns.length > 0 ? Math.max(...activeCooldowns) : undefined;

  const lastFailure = attemptTrail.find(
    (a) => a.outcome !== 'SKIPPED_OFFLINE' && a.outcome !== 'PRE_QUOTA_REROUTED'
  )?.reason;

  emitStatus({
    activeTier: 'OFFLINE_AI',
    phase: 'OFFLINE',
    lastUpdatedAt: nowAfterOffline,
    isOfflineFallback: true,
    preQuotaRerouted: detectedPreQuotaReroute,
    rerouteReason: detectedRerouteReason,
    cooldownActiveUntilMs: maxCooldownUntilMs,
    lastErrorSummary: lastFailure,
    attemptTrail: [...attemptTrail, { tier: 'OFFLINE_AI', outcome: 'SUCCESS' }],
  });

  return {
    ...offlineResult,
    attemptTrail: [...attemptTrail, { tier: 'OFFLINE_AI', outcome: 'SUCCESS' }],
  };
}
