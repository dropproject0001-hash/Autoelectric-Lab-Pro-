/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { GoogleGenAI } from '@google/genai';
import { scrubSensitiveDataForCloud } from '../../services/ai/privacyFilter';

/**
 * Gemini Free-Tier Gateway (Master Developer Instruction v1.1, Sections 4 & 10).
 *
 * Non-negotiable policy enforcement (backend-enforced, cannot be overridden by admins):
 * 1. Free-tier AI only. Paid models, OpenAI/Anthropic APIs, billing-required video/image models,
 *    and paid fallbacks are permanently prohibited.
 * 2. Model allowlist DEFAULTS TO DISABLED. A model is allowed only after an admin explicitly
 *    verifies free-tier eligibility against current provider documentation and enables it.
 *    Unknown eligibility means BLOCKED.
 * 3. Single primary key policy: never pool extra keys or projects to multiply free-tier quota.
 * 4. Quota exhaustion automatically shuts off cloud calls and notifies admin; caller falls back
 *    to Local AI / Database-Only mode.
 * 5. Privacy filter strips PII, user identifiers, emails, phones, VINs, and credentials before
 *    any cloud call.
 */

export interface FreeTierAllowlistEntry {
  modelId: string;
  displayName: string;
  enabled: boolean;
  freeTierEligibilityVerified: boolean;
  verifiedByAdmin: string | null;
  verifiedAt: string | null;
  verificationNotes: string;
  rpmLimit: number;
  rpdLimit: number;
}

export interface GatewayAuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  outcome: 'ALLOWED' | 'BLOCKED' | 'UPDATED' | 'SHUTOFF';
  detail: string;
}

export interface CredentialRotationStatus {
  rotationIntervalDays: number;
  lastRotatedAt: string | null;
  nextDueAt: string | null;
  isConfigured: boolean;
  keyFingerprintMasked: string;
  checklistSteps: readonly string[];
  rotationHistory: Array<{
    rotatedAt: string;
    actor: string;
    note: string;
  }>;
}

export interface GatewayUsageSnapshot {
  cloudShutoffActive: boolean;
  shutoffReason: string | null;
  totalRequestsToday: number;
  dailyQuotaLimit: number;
  requestsInLastMinute: number;
  rpmLimit: number;
  blockedPaidAttempts: number;
  blockedUnallowlistedAttempts: number;
  privacyRedactionsCount: number;
  adminNotifications: Array<{ id: string; timestamp: string; severity: 'WARNING' | 'CRITICAL'; message: string }>;
  allowlist: FreeTierAllowlistEntry[];
  credentialRotation: CredentialRotationStatus;
  privacyRuleNotice: string;
}

/**
 * Hard-coded prohibition patterns for paid/non-free APIs and models (Section 4).
 * Admins CANNOT override this blocklist.
 */
const PROHIBITED_PAID_MODEL_PATTERNS: readonly RegExp[] = [
  /^(?:gpt-|o[1-9]|chatgpt-|dall-e|whisper|text-embedding)/i,
  /^(?:claude-|anthropic)/i,
  /^gemini-omni-1\.2-flash$/i,
  /^gemini-nano-banana/i,
  /^gemini-.*-pro(?:$|[-.])/i,
  /^gemini-ultra/i,
  /^(?:veo-|imagen-)/i,
];

/**
 * Candidate Gemini models that MAY be verified by an admin as free-tier eligible.
 * ALL default to `enabled: false` and `freeTierEligibilityVerified: false` on startup.
 */
const DEFAULT_FREE_TIER_CANDIDATES: ReadonlyArray<{
  modelId: string;
  displayName: string;
  rpmLimit: number;
  rpdLimit: number;
}> = [
  { modelId: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash (Free Tier)', rpmLimit: 10, rpdLimit: 250 },
  { modelId: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash-Lite (Free Tier)', rpmLimit: 15, rpdLimit: 500 },
  { modelId: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash (Free Tier)', rpmLimit: 10, rpdLimit: 250 },
  { modelId: 'gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen (Free Tier)', rpmLimit: 8, rpdLimit: 200 },
  { modelId: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash-Lite (Free Tier)', rpmLimit: 12, rpdLimit: 400 },
];

export const CREDENTIAL_ROTATION_CHECKLIST: readonly string[] = [
  '1. Create a new restricted Gemini API key in Google AI Studio (billing disabled on project).',
  '2. Apply API restrictions (Generative Language API only) and server IP/referrer restrictions.',
  '3. Store the new key in secure backend secret storage (GEMINI_API_KEY) — never in repo or client code.',
  '4. Test the new key against an admin-allowlisted free-tier model.',
  '5. Activate the new key in the server runtime environment.',
  '6. Monitor error and quota logs for 15 minutes.',
  '7. Revoke the previous API key in Google AI Studio.',
  '8. Record the rotation audit entry in the Admin AI Control Center.',
];

export const CLOUD_PRIVACY_RULE_NOTICE =
  'PRIVACY POLICY (Section 10): Free-tier Gemini inputs may be used by Google to improve its products. AutoElectric Lab Pro strips all user identifiers, personal data, emails, phone numbers, full VINs, and credentials before any cloud request and sends only minimal technical context.';

export function isProhibitedPaidModel(modelId: string): boolean {
  const clean = (modelId || '').trim().replace(/^models\//i, '');
  if (!clean) return true;
  return PROHIBITED_PAID_MODEL_PATTERNS.some((re) => re.test(clean));
}

function createInitialAllowlist(): Map<string, FreeTierAllowlistEntry> {
  const map = new Map<string, FreeTierAllowlistEntry>();
  for (const c of DEFAULT_FREE_TIER_CANDIDATES) {
    map.set(c.modelId, {
      modelId: c.modelId,
      displayName: c.displayName,
      enabled: false, // STRICT DEFAULT: DISABLED until admin verifies free-tier eligibility
      freeTierEligibilityVerified: false,
      verifiedByAdmin: null,
      verifiedAt: null,
      verificationNotes: 'Disabled by default. Admin must verify free-tier eligibility before enabling.',
      rpmLimit: c.rpmLimit,
      rpdLimit: c.rpdLimit,
    });
  }
  return map;
}

let allowlistMap = createInitialAllowlist();
let cloudShutoffActive = false;
let shutoffReason: string | null = null;
let dailyQuotaLimit = 200;
let globalRpmLimit = 10;
let minuteTimestamps: number[] = [];
let dailyTimestamps: number[] = [];
let blockedPaidAttempts = 0;
let blockedUnallowlistedAttempts = 0;
let privacyRedactionsCount = 0;
const auditLog: GatewayAuditEntry[] = [];
const adminNotifications: Array<{
  id: string;
  timestamp: string;
  severity: 'WARNING' | 'CRITICAL';
  message: string;
}> = [];
let credentialRotationIntervalDays = 90;
let lastKeyRotatedAt: string | null = null;
const rotationHistory: Array<{ rotatedAt: string; actor: string; note: string }> = [];

function appendAudit(entry: Omit<GatewayAuditEntry, 'id' | 'timestamp'>): GatewayAuditEntry {
  const rec: GatewayAuditEntry = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  auditLog.unshift(rec);
  if (auditLog.length > 500) {
    auditLog.length = 500;
  }
  return rec;
}

function pushAdminNotification(severity: 'WARNING' | 'CRITICAL', message: string): void {
  adminNotifications.unshift({
    id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    timestamp: new Date().toISOString(),
    severity,
    message,
  });
  if (adminNotifications.length > 50) {
    adminNotifications.length = 50;
  }
}

function pruneUsageWindows(nowMs: number): void {
  const minCutoff = nowMs - 60_000;
  const dayCutoff = nowMs - 86_400_000;
  minuteTimestamps = minuteTimestamps.filter((t) => t > minCutoff);
  dailyTimestamps = dailyTimestamps.filter((t) => t > dayCutoff);
}

/**
 * Single primary server-side Gemini API key (never pools extra keys/projects for extra quota).
 */
export function getSinglePrimaryGeminiApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.GEMINI_API_KEY?.trim();
  if (!raw || raw.length < 12 || /YOUR_|MY_GEMINI|PLACEHOLDER/i.test(raw)) {
    return null;
  }
  return raw;
}

export function getMaskedKeyFingerprint(env: NodeJS.ProcessEnv = process.env): string {
  const key = getSinglePrimaryGeminiApiKey(env);
  if (!key) return 'NOT_CONFIGURED';
  return `***${key.slice(-4)} (server-side only)`;
}

export function setFreeTierModelAllowlistState(params: {
  modelId: string;
  enabled: boolean;
  freeTierEligibilityVerified: boolean;
  verificationNotes?: string;
  actor: string;
}): { ok: boolean; statusCode: number; error?: string; entry?: FreeTierAllowlistEntry } {
  const cleanId = (params.modelId || '').trim().replace(/^models\//i, '');
  if (!cleanId) {
    return { ok: false, statusCode: 400, error: 'Missing modelId.' };
  }

  // Non-overridable paid model prohibition (Section 4)
  if (isProhibitedPaidModel(cleanId)) {
    blockedPaidAttempts += 1;
    appendAudit({
      actor: params.actor,
      action: 'ALLOWLIST_UPDATE_BLOCKED',
      target: cleanId,
      outcome: 'BLOCKED',
      detail: 'Prohibited paid/non-free model cannot be allowlisted even by an admin.',
    });
    return {
      ok: false,
      statusCode: 403,
      error: `Model "${cleanId}" is permanently prohibited under the Free-Tier AI Only policy. Admins cannot override this prohibition.`,
    };
  }

  if (params.enabled && !params.freeTierEligibilityVerified) {
    appendAudit({
      actor: params.actor,
      action: 'ALLOWLIST_UPDATE_BLOCKED',
      target: cleanId,
      outcome: 'BLOCKED',
      detail: 'Admin must confirm free-tier eligibility before enabling a model.',
    });
    return {
      ok: false,
      statusCode: 400,
      error: `Cannot enable "${cleanId}" until free-tier eligibility is explicitly verified.`,
    };
  }

  const existing = allowlistMap.get(cleanId);
  if (!existing) {
    appendAudit({
      actor: params.actor,
      action: 'ALLOWLIST_UPDATE_BLOCKED',
      target: cleanId,
      outcome: 'BLOCKED',
      detail: 'Unknown model eligibility — blocked by default.',
    });
    return {
      ok: false,
      statusCode: 403,
      error: `Model "${cleanId}" has unknown free-tier eligibility and is blocked.`,
    };
  }

  const nowIso = new Date().toISOString();
  const updated: FreeTierAllowlistEntry = {
    ...existing,
    enabled: params.enabled,
    freeTierEligibilityVerified: params.freeTierEligibilityVerified,
    verifiedByAdmin: params.freeTierEligibilityVerified ? params.actor : null,
    verifiedAt: params.freeTierEligibilityVerified ? nowIso : null,
    verificationNotes:
      params.verificationNotes?.trim() ||
      (params.enabled
        ? `Free-tier eligibility verified and enabled by ${params.actor}.`
        : `Disabled by ${params.actor}.`),
  };
  allowlistMap.set(cleanId, updated);

  appendAudit({
    actor: params.actor,
    action: params.enabled ? 'ALLOWLIST_MODEL_ENABLED' : 'ALLOWLIST_MODEL_DISABLED',
    target: cleanId,
    outcome: 'UPDATED',
    detail: updated.verificationNotes,
  });

  return { ok: true, statusCode: 200, entry: updated };
}

export function setEmergencyCloudShutoff(params: {
  active: boolean;
  reason?: string;
  actor: string;
}): void {
  cloudShutoffActive = params.active;
  shutoffReason = params.active
    ? params.reason?.trim() || 'Emergency cloud shutoff activated by administrator.'
    : null;
  appendAudit({
    actor: params.actor,
    action: params.active ? 'CLOUD_SHUTOFF_ENABLED' : 'CLOUD_SHUTOFF_CLEARED',
    target: 'gemini-free-tier-gateway',
    outcome: params.active ? 'SHUTOFF' : 'UPDATED',
    detail: shutoffReason || 'Cloud free-tier gateway re-opened by admin (subject to allowlist).',
  });
  if (params.active) {
    pushAdminNotification('CRITICAL', shutoffReason!);
  }
}

export function setGatewayQuotaLimits(params: {
  dailyQuotaLimit?: number;
  rpmLimit?: number;
  actor: string;
}): void {
  if (typeof params.dailyQuotaLimit === 'number' && params.dailyQuotaLimit >= 1) {
    dailyQuotaLimit = Math.min(2000, Math.floor(params.dailyQuotaLimit));
  }
  if (typeof params.rpmLimit === 'number' && params.rpmLimit >= 1) {
    globalRpmLimit = Math.min(60, Math.floor(params.rpmLimit));
  }
  appendAudit({
    actor: params.actor,
    action: 'QUOTA_LIMITS_UPDATED',
    target: 'gemini-free-tier-gateway',
    outcome: 'UPDATED',
    detail: `Updated limits: daily=${dailyQuotaLimit} RPD, rpm=${globalRpmLimit} RPM.`,
  });
}

export function recordCredentialRotationAudit(params: {
  actor: string;
  note: string;
  intervalDays?: number;
}): CredentialRotationStatus {
  if (typeof params.intervalDays === 'number' && params.intervalDays >= 7 && params.intervalDays <= 365) {
    credentialRotationIntervalDays = Math.floor(params.intervalDays);
  }
  const nowIso = new Date().toISOString();
  lastKeyRotatedAt = nowIso;
  rotationHistory.unshift({
    rotatedAt: nowIso,
    actor: params.actor,
    note: params.note.trim() || 'Manual key rotation completed per checklist.',
  });
  appendAudit({
    actor: params.actor,
    action: 'CREDENTIAL_ROTATION_RECORDED',
    target: 'GEMINI_API_KEY',
    outcome: 'UPDATED',
    detail: `Key rotation recorded (schedule: ${credentialRotationIntervalDays} days). Raw secret never logged.`,
  });
  return getGatewayUsageSnapshot().credentialRotation;
}

export function recordAdminKnowledgeAuditEvent(params: {
  actor: string;
  action: 'KNOWLEDGE_APPROVED' | 'KNOWLEDGE_REJECTED';
  targetId: string;
  detail: string;
}): GatewayAuditEntry {
  return appendAudit({
    actor: params.actor,
    action: params.action,
    target: params.targetId,
    outcome: 'UPDATED',
    detail: params.detail,
  });
}

export function getGatewayAuditLog(): GatewayAuditEntry[] {
  return [...auditLog];
}

export function getGatewayUsageSnapshot(env: NodeJS.ProcessEnv = process.env): GatewayUsageSnapshot {
  pruneUsageWindows(Date.now());
  const nextDueAt = lastKeyRotatedAt
    ? new Date(
        new Date(lastKeyRotatedAt).getTime() + credentialRotationIntervalDays * 86_400_000
      ).toISOString()
    : null;
  return {
    cloudShutoffActive,
    shutoffReason,
    totalRequestsToday: dailyTimestamps.length,
    dailyQuotaLimit,
    requestsInLastMinute: minuteTimestamps.length,
    rpmLimit: globalRpmLimit,
    blockedPaidAttempts,
    blockedUnallowlistedAttempts,
    privacyRedactionsCount,
    adminNotifications: [...adminNotifications],
    allowlist: Array.from(allowlistMap.values()),
    credentialRotation: {
      rotationIntervalDays: credentialRotationIntervalDays,
      lastRotatedAt: lastKeyRotatedAt,
      nextDueAt,
      isConfigured: Boolean(getSinglePrimaryGeminiApiKey(env)),
      keyFingerprintMasked: getMaskedKeyFingerprint(env),
      checklistSteps: CREDENTIAL_ROTATION_CHECKLIST,
      rotationHistory: [...rotationHistory],
    },
    privacyRuleNotice: CLOUD_PRIVACY_RULE_NOTICE,
  };
}

export interface GatewayPolicyCheckResult {
  allowed: boolean;
  statusCode: number;
  code:
    | 'ALLOWED'
    | 'PAID_MODEL_PROHIBITED'
    | 'MODEL_NOT_ALLOWLISTED'
    | 'CLOUD_SHUTOFF_ACTIVE'
    | 'FREE_TIER_QUOTA_EXHAUSTED'
    | 'MISSING_API_KEY';
  error?: string;
  fallbackToLocalAi: boolean;
  sanitizedPrompt?: string;
  privacyRedactions?: number;
}

/**
 * Evaluates all Section 4 & Section 10 policies BEFORE making any upstream Gemini call.
 */
export function evaluateGatewayRequestPolicy(params: {
  modelId: string;
  prompt: string;
  actor: string;
  nowMs?: number;
  env?: NodeJS.ProcessEnv;
}): GatewayPolicyCheckResult {
  const nowMs = params.nowMs ?? Date.now();
  const cleanModel = (params.modelId || '').trim().replace(/^models\//i, '');

  // 1. Hard paid-model blocklist (non-overridable)
  if (isProhibitedPaidModel(cleanModel)) {
    blockedPaidAttempts += 1;
    appendAudit({
      actor: params.actor,
      action: 'GATEWAY_REQUEST_BLOCKED',
      target: cleanModel || '(empty)',
      outcome: 'BLOCKED',
      detail: 'Rejected prohibited paid or non-free model identifier.',
    });
    return {
      allowed: false,
      statusCode: 403,
      code: 'PAID_MODEL_PROHIBITED',
      error: `Model "${cleanModel}" is prohibited under the Free-Tier AI Only policy. Falling back to Local AI / Database-Only mode.`,
      fallbackToLocalAi: true,
    };
  }

  // 2. Emergency cloud shutoff check
  if (cloudShutoffActive) {
    appendAudit({
      actor: params.actor,
      action: 'GATEWAY_REQUEST_BLOCKED',
      target: cleanModel,
      outcome: 'SHUTOFF',
      detail: shutoffReason || 'Cloud shutoff active.',
    });
    return {
      allowed: false,
      statusCode: 503,
      code: 'CLOUD_SHUTOFF_ACTIVE',
      error: `${shutoffReason || 'Cloud AI shutoff is active.'} Continuing with Local AI / Database-Only mode.`,
      fallbackToLocalAi: true,
    };
  }

  // 3. Default-disabled admin-verified allowlist check
  const entry = allowlistMap.get(cleanModel);
  if (!entry || !entry.enabled || !entry.freeTierEligibilityVerified) {
    blockedUnallowlistedAttempts += 1;
    appendAudit({
      actor: params.actor,
      action: 'GATEWAY_REQUEST_BLOCKED',
      target: cleanModel,
      outcome: 'BLOCKED',
      detail: 'Model is not enabled on the admin-verified free-tier allowlist.',
    });
    return {
      allowed: false,
      statusCode: 403,
      code: 'MODEL_NOT_ALLOWLISTED',
      error: `Model "${cleanModel}" is blocked because it is not enabled on the admin-verified free-tier allowlist (default disabled). Continuing with Local AI / Database-Only mode.`,
      fallbackToLocalAi: true,
    };
  }

  // 4. Quota check (RPM + Daily RPD) -> automatic shutoff on daily exhaustion
  pruneUsageWindows(nowMs);
  if (dailyTimestamps.length >= dailyQuotaLimit) {
    cloudShutoffActive = true;
    shutoffReason = `Daily free-tier quota limit (${dailyQuotaLimit} RPD) reached — cloud calls automatically shut off.`;
    pushAdminNotification('CRITICAL', shutoffReason);
    appendAudit({
      actor: 'system:quota-guard',
      action: 'AUTO_CLOUD_SHUTOFF',
      target: cleanModel,
      outcome: 'SHUTOFF',
      detail: shutoffReason,
    });
    return {
      allowed: false,
      statusCode: 429,
      code: 'FREE_TIER_QUOTA_EXHAUSTED',
      error: `${shutoffReason} Local AI continues with zero paid fallback.`,
      fallbackToLocalAi: true,
    };
  }

  if (minuteTimestamps.length >= Math.min(globalRpmLimit, entry.rpmLimit)) {
    return {
      allowed: false,
      statusCode: 429,
      code: 'FREE_TIER_QUOTA_EXHAUSTED',
      error: `Per-minute free-tier quota reached (${minuteTimestamps.length} RPM). Local AI continues with zero paid fallback.`,
      fallbackToLocalAi: true,
    };
  }

  // 5. Single primary server-side API key check
  const apiKey = getSinglePrimaryGeminiApiKey(params.env);
  if (!apiKey) {
    return {
      allowed: false,
      statusCode: 503,
      code: 'MISSING_API_KEY',
      error: 'Server GEMINI_API_KEY is not configured. Continuing with Local AI / Database-Only mode.',
      fallbackToLocalAi: true,
    };
  }

  // 6. Mandatory server-side privacy scrubbing
  const scrubbed = scrubSensitiveDataForCloud(params.prompt);
  privacyRedactionsCount += scrubbed.redactedCount;

  return {
    allowed: true,
    statusCode: 200,
    code: 'ALLOWED',
    fallbackToLocalAi: false,
    sanitizedPrompt: scrubbed.sanitizedText,
    privacyRedactions: scrubbed.redactedCount,
  };
}

export async function executeFreeTierGatewayPrompt(params: {
  modelId: string;
  prompt: string;
  systemInstruction?: string;
  actor: string;
  env?: NodeJS.ProcessEnv;
  customExecutorForTests?: (input: { model: string; prompt: string }) => Promise<string>;
}): Promise<{
  ok: boolean;
  statusCode: number;
  code: string;
  reply?: string;
  model?: string;
  error?: string;
  fallbackToLocalAi: boolean;
  privacyRedactions?: number;
}> {
  const policy = evaluateGatewayRequestPolicy({
    modelId: params.modelId,
    prompt: params.prompt,
    actor: params.actor,
    env: params.env,
  });

  if (!policy.allowed) {
    return {
      ok: false,
      statusCode: policy.statusCode,
      code: policy.code,
      error: policy.error,
      fallbackToLocalAi: true,
    };
  }

  const nowMs = Date.now();
  minuteTimestamps.push(nowMs);
  dailyTimestamps.push(nowMs);

  try {
    let text = '';
    if (params.customExecutorForTests) {
      text = await params.customExecutorForTests({
        model: params.modelId,
        prompt: policy.sanitizedPrompt || '',
      });
    } else {
      const apiKey = getSinglePrimaryGeminiApiKey(params.env)!;
      const ai = new GoogleGenAI({ apiKey });
      const res = await ai.models.generateContent({
        model: params.modelId,
        contents: policy.sanitizedPrompt || '',
        config: params.systemInstruction ? { systemInstruction: params.systemInstruction } : undefined,
      });
      text = res.text || '';
    }

    appendAudit({
      actor: params.actor,
      action: 'GATEWAY_REQUEST_SUCCEEDED',
      target: params.modelId,
      outcome: 'ALLOWED',
      detail: `Completed free-tier request (privacyRedactions=${policy.privacyRedactions ?? 0}).`,
    });

    return {
      ok: true,
      statusCode: 200,
      code: 'SUCCESS',
      reply: text,
      model: params.modelId,
      fallbackToLocalAi: false,
      privacyRedactions: policy.privacyRedactions,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upstream free-tier Gemini error';
    appendAudit({
      actor: params.actor,
      action: 'GATEWAY_UPSTREAM_FAILED',
      target: params.modelId,
      outcome: 'BLOCKED',
      detail: msg.slice(0, 180),
    });
    return {
      ok: false,
      statusCode: 502,
      code: 'UPSTREAM_FREE_TIER_UNAVAILABLE',
      error: 'Free-tier Gemini gateway unavailable. Continuing with Local AI / Database-Only mode.',
      fallbackToLocalAi: true,
    };
  }
}

export function resetGeminiFreeTierGatewayForTests(): void {
  allowlistMap = createInitialAllowlist();
  cloudShutoffActive = false;
  shutoffReason = null;
  dailyQuotaLimit = 200;
  globalRpmLimit = 10;
  minuteTimestamps = [];
  dailyTimestamps = [];
  blockedPaidAttempts = 0;
  blockedUnallowlistedAttempts = 0;
  privacyRedactionsCount = 0;
  auditLog.length = 0;
  adminNotifications.length = 0;
  credentialRotationIntervalDays = 90;
  lastKeyRotatedAt = null;
  rotationHistory.length = 0;
}
