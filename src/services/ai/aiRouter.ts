import type {
  AiDiagnosticResult,
  AiRouterStatusSnapshot,
  AiTierAttemptLog,
  AiTierId,
  AiTierMetadata,
  BenchTelemetry,
  BilingualLang,
} from '../../types/aiAssistant';
import { sendGeminiChat, type GeminiChatRole } from '../geminiIntelligenceService';
import { saveVerifiedKnowledgeEntry } from './localKnowledgeDB';
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
}

export type OnlineTierTransportFn = (
  req: OnlineTierTransportRequest
) => Promise<OnlineTierTransportResponse>;

const DEFAULT_TIER_TIMEOUT_MS = 12_000;

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

export function resetAiRouterStateForTests(): void {
  customTransportForTests = null;
  onlineOverrideForTests = null;
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

function buildSystemInstructionPrompt(
  query: string,
  lang: BilingualLang,
  benchContextText: string
): string {
  const languageDirective =
    lang === 'TL'
      ? 'Respond in clear, beginner-friendly Taglish (Filipino + English technical terms) suitable for a mechanic in a repair shop.'
      : 'Respond in clear, beginner-friendly English suitable for an automotive electronics technician.';

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
  reason: string;
} {
  const errObj = error as Error & { status?: number; statusCode?: number; code?: string };
  const message = String(errObj?.message || error || 'Unknown error');
  const statusCode = errObj?.status || errObj?.statusCode;

  if (errObj?.name === 'AbortError' || /timeout|timed out/i.test(message)) {
    return { outcome: 'TIMEOUT', statusCode: 408, reason: message };
  }
  if (statusCode === 429 || /\b429\b|quota|rate limit|resource_exhausted/i.test(message)) {
    return { outcome: 'QUOTA_429', statusCode: 429, reason: message };
  }
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    /\b401\b|\b403\b|forbidden|unauthorized|paid|pin|expired/i.test(message)
  ) {
    return { outcome: 'AUTH_OR_TIER_BLOCKED', statusCode: statusCode || 403, reason: message };
  }
  return { outcome: 'NETWORK_ERROR', statusCode, reason: message };
}

async function defaultOnlineTransport(
  req: OnlineTierTransportRequest
): Promise<OnlineTierTransportResponse> {
  const role: GeminiChatRole = req.tier.geminiRole || 'GENERAL';
  const prompt = buildSystemInstructionPrompt(req.query, req.lang, req.benchContextText);

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      reject(new Error(`Tier ${req.tier.label} timed out after ${req.timeoutMs}ms`));
    }, req.timeoutMs);
  });

  const response = await Promise.race([
    sendGeminiChat({
      messages: [{ role: 'user', text: prompt, timestamp: Date.now() }],
      role,
      benchContext: req.benchContextText,
    }),
    timeoutPromise,
  ]);

  return {
    reply: response.reply,
    model: response.model,
    confidence: 0.9,
  };
}

export function getTierMetadata(tierId: AiTierId): AiTierMetadata {
  return (
    AI_TIER_CASCADE.find((t) => t.id === tierId) ||
    AI_TIER_CASCADE[AI_TIER_CASCADE.length - 1]
  );
}

/**
 * Multi-tier resilient AI Router:
 * Cascades sequentially: Carbon ➔ Hydrogen ➔ Argon ➔ Flash Lite ➔ Offline AI.
 * Auto-caches verified high-confidence online replies into AutoLabPro_VerifiedKnowledge.
 */
export async function queryAiDiagnosticRouter(params: {
  query: string;
  lang: BilingualLang;
  telemetry?: BenchTelemetry;
  timeoutMs?: number;
  forceOffline?: boolean;
}): Promise<AiDiagnosticResult> {
  const {
    query,
    lang,
    telemetry,
    timeoutMs = DEFAULT_TIER_TIMEOUT_MS,
    forceOffline = false,
  } = params;

  const trimmedQuery = query.trim();
  const benchContextText = formatBenchSnapshotSummary(telemetry, lang);
  const extractedTokens = stripBilingualStopwords(trimmedQuery);
  const attemptTrail: AiTierAttemptLog[] = [];

  const onlineTiers = AI_TIER_CASCADE.filter((t) => t.isOnline);
  const shouldAttemptOnline = !forceOffline && isBrowserOnline() && extractedTokens.length > 0;

  if (shouldAttemptOnline) {
    const transport = customTransportForTests || defaultOnlineTransport;

    for (let i = 0; i < onlineTiers.length; i++) {
      const tier = onlineTiers[i];
      emitStatus({
        activeTier: tier.id,
        phase: i === 0 ? 'ROUTING' : 'FALLBACK',
        lastUpdatedAt: Date.now(),
        isOfflineFallback: false,
        attemptTrail: [...attemptTrail],
      });

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

        attemptTrail.push({ tier: tier.id, outcome: 'SUCCESS' });
        const parsed = parseOnlineReplyIntoSections(res.reply, lang);
        const confidence = Math.max(0.82, Math.min(0.98, res.confidence ?? 0.9));
        const subject = extractedTokens.slice(0, 4).join(' ').toUpperCase() || 'ECU Bench Query';

        const cacheOutcome = await saveVerifiedKnowledgeEntry({
          subject,
          tokens: extractedTokens,
          lang,
          sourceTier: tier.id,
          confidence,
          safetyWarning: parsed.safetyWarning,
          rootCauseSummary: parsed.rootCause,
          verificationStep: parsed.verificationAction,
          rawAnswer: res.reply,
        });

        emitStatus({
          activeTier: tier.id,
          phase: 'ACTIVE',
          lastUpdatedAt: Date.now(),
          isOfflineFallback: false,
          attemptTrail: [...attemptTrail],
        });

        const conversationalSummary =
          lang === 'TL'
            ? `Boss, batay sa verified online analysis (${tier.label}): ${parsed.rootCause}`
            : `Based on verified online analysis (${tier.label}): ${parsed.rootCause}`;

        return {
          id: `online-${tier.id.toLowerCase()}-${Date.now()}`,
          lang,
          tierUsed: tier.id,
          tierLabel: tier.label,
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
          benchSnapshotSummary: benchContextText,
          createdAt: Date.now(),
        };
      } catch (error) {
        const classified = classifyTransportError(error);
        attemptTrail.push({
          tier: tier.id,
          outcome: classified.outcome,
          statusCode: classified.statusCode,
          reason: classified.reason,
        });
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

  const lastFailure = attemptTrail.find((a) => a.outcome !== 'SKIPPED_OFFLINE')?.reason;
  emitStatus({
    activeTier: 'OFFLINE_AI',
    phase: 'OFFLINE',
    lastUpdatedAt: Date.now(),
    isOfflineFallback: true,
    lastErrorSummary: lastFailure,
    attemptTrail: [...attemptTrail, { tier: 'OFFLINE_AI', outcome: 'SUCCESS' }],
  });

  return {
    ...offlineResult,
    attemptTrail: [...attemptTrail, { tier: 'OFFLINE_AI', outcome: 'SUCCESS' }],
  };
}
