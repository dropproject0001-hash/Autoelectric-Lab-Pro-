/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type {
  EcuComponentIdentity,
  EvidenceHierarchyLevel,
  KnowledgeLifecycleStatus,
  KnowledgeVersionHistoryEntry,
  RepairReferenceRecord,
} from '../../types/automotiveKnowledge';
import {
  loadAutomotiveKnowledgeCatalog,
  upsertKnowledgeRecordWithProvenance,
} from '../automotiveKnowledgeService';
import { extractNormalizedNumericSet } from './numericValidator';
import { scrubSensitiveDataForCloud } from './privacyFilter';

/**
 * Adaptive Knowledge Engine (Master Developer Instruction v1.1, Section 8).
 * Pipeline: Capture -> Extract -> Normalize -> Deduplicate -> Validate -> Approve -> Index -> Sync
 * Statuses: CAPTURED, PENDING, VERIFIED, TECHNICIAN_CONFIRMED, REJECTED, SUPERSEDED
 *
 * Strict Anti-Poisoning Rules:
 * - AI-generated content is NEVER auto-verified.
 * - CAPTURED & PENDING items are excluded from retrieval by default; only returned when
 *   `includeUnverified: true` is explicitly passed, clearly badged as UNVERIFIED.
 * - Only explicit Admin or Technician approval promotes a record to trusted status.
 * - Hidden chain-of-thought (<think>...</think>) and personal data are stripped on capture.
 * - On conflicts: preserve BOTH records, compare ECU identity / HW-SW revision / test conditions /
 *   source quality, flag conflict, and NEVER overwrite a verified value with an unverified one.
 */

export type AdaptiveCaptureOrigin =
  | 'AI_ASSISTED_DRAFT'
  | 'TECHNICIAN_SESSION_OUTCOME'
  | 'ADMIN_INGEST';

export interface AdaptiveCaptureInput {
  title: string;
  content: string;
  origin: AdaptiveCaptureOrigin;
  ecuIdentity: EcuComponentIdentity;
  sourceDocument: string;
  pageOrSection?: string;
  revision?: string;
  testConditions: string;
  tags?: string[];
  make?: string;
  model?: string;
  years?: string;
  actor: string;
}

export interface AdaptiveConflictDetail {
  conflictId: string;
  conflictingRecordId: string;
  reason: string;
  comparison: {
    incomingEcuPartNumber: string | null;
    existingEcuPartNumber: string | null;
    incomingHardwareId: string | null;
    existingHardwareId: string | null;
    incomingSoftwareId: string | null;
    existingSoftwareId: string | null;
    incomingTestConditions: string;
    existingTestConditions: string;
    incomingSourceQuality: string;
    existingSourceQuality: string;
  };
  flaggedAt: string;
  resolved: boolean;
}

export interface AdaptiveKnowledgeItem {
  id: string;
  normalizedFingerprint: string;
  title: string;
  content: string;
  origin: AdaptiveCaptureOrigin;
  lifecycleStatus: KnowledgeLifecycleStatus;
  evidenceType: EvidenceHierarchyLevel;
  ecuIdentity: EcuComponentIdentity;
  sourceDocument: string;
  pageOrSection: string;
  revision: string;
  captureDate: string;
  testConditions: string;
  tags: string[];
  make: string;
  model: string;
  years: string;
  version: number;
  versionHistory: KnowledgeVersionHistoryEntry[];
  conflict?: AdaptiveConflictDetail;
  syncState: 'LOCAL_PENDING' | 'SYNCED';
  indexedCatalogId?: string;
}

export interface AdaptiveCaptureResult {
  captured: boolean;
  isDuplicate: boolean;
  duplicateOfId?: string;
  conflictFlagged: boolean;
  conflictDetail?: AdaptiveConflictDetail;
  item?: AdaptiveKnowledgeItem;
  reason?: string;
}

const adaptiveStore = new Map<string, AdaptiveKnowledgeItem>();

function stripChainOfThoughtAndPii(raw: string): string {
  // Remove hidden chain-of-thought tags (<think>...</think>, <reasoning>...</reasoning>)
  const withoutCot = raw
    .replace(/<(?:think|reasoning|thought)[^>]*>[\s\S]*?<\/(?:think|reasoning|thought)>/gi, '')
    .trim();
  return scrubSensitiveDataForCloud(withoutCot).sanitizedText;
}

function buildNormalizedFingerprint(ecu: EcuComponentIdentity, title: string, content: string): string {
  const keyParts = [
    ecu.manufacturer.toLowerCase().trim(),
    (ecu.partNumber || '').toLowerCase().trim(),
    (ecu.componentName || '').toLowerCase().trim(),
    title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
    content.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 140),
  ];
  return keyParts.join('|');
}

function tokenJaccard(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3));
  const setB = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter += 1;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

function detectNumericSpecConflict(incomingText: string, existingText: string): string | null {
  const incNums = Array.from(extractNormalizedNumericSet(incomingText));
  const extNums = Array.from(extractNormalizedNumericSet(existingText));
  const byPrefix = (list: string[], prefix: string) =>
    list.filter((x) => x.startsWith(prefix)).map((x) => x.slice(prefix.length));

  for (const [prefix, label] of [
    ['v:', 'voltage'],
    ['r:', 'resistance'],
    ['hz:', 'frequency'],
  ] as const) {
    const incVals = byPrefix(incNums, prefix);
    const extVals = byPrefix(extNums, prefix);
    if (incVals.length > 0 && extVals.length > 0) {
      const differs = incVals.some((v) => !extVals.includes(v));
      if (differs) {
        return `Conflicting ${label} specification: incoming (${incVals.join(', ')}) vs existing (${extVals.join(', ')}).`;
      }
    }
  }
  return null;
}

/**
 * Stages 1-5: Capture -> Extract -> Normalize -> Deduplicate -> Validate
 * Always starts as CAPTURED or PENDING (NEVER auto-verified!).
 */
export function captureAdaptiveKnowledge(input: AdaptiveCaptureInput): AdaptiveCaptureResult {
  const nowIso = new Date().toISOString();
  const cleanTitle = stripChainOfThoughtAndPii(input.title).slice(0, 180);
  const cleanContent = stripChainOfThoughtAndPii(input.content).slice(0, 4000);
  const cleanTestConditions = stripChainOfThoughtAndPii(input.testConditions).slice(0, 400);

  if (!cleanTitle || !cleanContent) {
    return {
      captured: false,
      isDuplicate: false,
      conflictFlagged: false,
      reason: 'Empty title or technical content after sanitization.',
    };
  }

  const normalizedFingerprint = buildNormalizedFingerprint(
    input.ecuIdentity,
    cleanTitle,
    cleanContent
  );

  // Stage 4: Deduplication check (exact fingerprint or >=0.85 Jaccard similarity on same ECU/manufacturer)
  for (const existing of adaptiveStore.values()) {
    if (existing.lifecycleStatus === 'REJECTED' || existing.lifecycleStatus === 'SUPERSEDED') {
      continue;
    }
    const sameMfg =
      existing.ecuIdentity.manufacturer.toLowerCase() ===
      input.ecuIdentity.manufacturer.toLowerCase();
    const samePart =
      (existing.ecuIdentity.partNumber || '').toLowerCase() ===
      (input.ecuIdentity.partNumber || '').toLowerCase();

    if (existing.normalizedFingerprint === normalizedFingerprint) {
      return {
        captured: false,
        isDuplicate: true,
        duplicateOfId: existing.id,
        conflictFlagged: false,
        reason: `Exact duplicate of existing record ${existing.id}.`,
      };
    }

    if (
      sameMfg &&
      samePart &&
      tokenJaccard(`${existing.title} ${existing.content}`, `${cleanTitle} ${cleanContent}`) >= 0.85
    ) {
      const conflictReason = detectNumericSpecConflict(cleanContent, existing.content);
      if (!conflictReason) {
        return {
          captured: false,
          isDuplicate: true,
          duplicateOfId: existing.id,
          conflictFlagged: false,
          reason: `High-similarity duplicate of existing record ${existing.id}.`,
        };
      }
    }
  }

  // Stage 5: Conflict check against trusted/existing records — preserve BOTH, NEVER overwrite verified!
  let conflictDetail: AdaptiveConflictDetail | undefined;
  for (const existing of adaptiveStore.values()) {
    if (existing.lifecycleStatus === 'REJECTED' || existing.lifecycleStatus === 'SUPERSEDED') {
      continue;
    }
    const samePart =
      Boolean(input.ecuIdentity.partNumber && existing.ecuIdentity.partNumber) &&
      input.ecuIdentity.partNumber!.toLowerCase() === existing.ecuIdentity.partNumber!.toLowerCase();
    const highTopicOverlap =
      existing.ecuIdentity.manufacturer.toLowerCase() ===
        input.ecuIdentity.manufacturer.toLowerCase() &&
      tokenJaccard(existing.title, cleanTitle) >= 0.45;

    if (samePart || highTopicOverlap) {
      const conflictReason = detectNumericSpecConflict(cleanContent, existing.content);
      if (conflictReason) {
        conflictDetail = {
          conflictId: `cfl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          conflictingRecordId: existing.id,
          reason: conflictReason,
          comparison: {
            incomingEcuPartNumber: input.ecuIdentity.partNumber ?? null,
            existingEcuPartNumber: existing.ecuIdentity.partNumber ?? null,
            incomingHardwareId: input.ecuIdentity.hardwareId ?? null,
            existingHardwareId: existing.ecuIdentity.hardwareId ?? null,
            incomingSoftwareId: input.ecuIdentity.softwareId ?? null,
            existingSoftwareId: existing.ecuIdentity.softwareId ?? null,
            incomingTestConditions: cleanTestConditions,
            existingTestConditions: existing.testConditions,
            incomingSourceQuality: `${input.origin} (${input.sourceDocument})`,
            existingSourceQuality: `${existing.lifecycleStatus} (${existing.sourceDocument})`,
          },
          flaggedAt: nowIso,
          resolved: false,
        };
        break;
      }
    }
  }

  // Anti-poisoning: NEVER auto-verify! AI drafts enter as CAPTURED; technician notes enter as PENDING.
  const initialStatus: KnowledgeLifecycleStatus =
    input.origin === 'AI_ASSISTED_DRAFT' ? 'CAPTURED' : 'PENDING';

  const id = `ak-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const item: AdaptiveKnowledgeItem = {
    id,
    normalizedFingerprint,
    title: cleanTitle,
    content: cleanContent,
    origin: input.origin,
    lifecycleStatus: initialStatus,
    evidenceType: 'UNVERIFIED_DB',
    ecuIdentity: { ...input.ecuIdentity },
    sourceDocument: input.sourceDocument.trim() || 'Technician Session Capture',
    pageOrSection: input.pageOrSection?.trim() || 'Captured Note',
    revision: input.revision?.trim() || 'rev-1',
    captureDate: nowIso,
    testConditions: cleanTestConditions || 'Test conditions pending verification',
    tags: Array.from(new Set((input.tags || []).map((t) => t.toLowerCase().trim()).filter(Boolean))),
    make: input.make || input.ecuIdentity.manufacturer,
    model: input.model || input.ecuIdentity.ecuModel || 'General',
    years: input.years || 'Unspecified',
    version: 1,
    versionHistory: [
      {
        version: 1,
        updatedAt: nowIso,
        actor: input.actor,
        lifecycleStatus: initialStatus,
        changeSummary: conflictDetail
          ? `Captured with conflict flagged against ${conflictDetail.conflictingRecordId}`
          : `Captured via ${input.origin} (excluded from default retrieval until approved)`,
      },
    ],
    conflict: conflictDetail,
    syncState: 'LOCAL_PENDING',
  };

  adaptiveStore.set(item.id, item);

  return {
    captured: true,
    isDuplicate: false,
    conflictFlagged: Boolean(conflictDetail),
    conflictDetail,
    item,
  };
}

/**
 * Stage 6 & 7: Explicit Admin / Technician Approval -> Index into authoritative knowledge catalog.
 * Only human approval can promote CAPTURED/PENDING to VERIFIED or TECHNICIAN_CONFIRMED.
 */
export function approveAdaptiveKnowledgeItem(params: {
  id: string;
  targetStatus: 'VERIFIED' | 'TECHNICIAN_CONFIRMED';
  approverActor: string;
  approverRole: 'ADMIN' | 'TECHNICIAN';
  reviewNote?: string;
}): { ok: boolean; error?: string; item?: AdaptiveKnowledgeItem } {
  const existing = adaptiveStore.get(params.id);
  if (!existing) {
    return { ok: false, error: `Adaptive knowledge record "${params.id}" not found.` };
  }
  if (params.targetStatus === 'VERIFIED' && params.approverRole !== 'ADMIN') {
    return {
      ok: false,
      error: 'Only an Administrator can promote a record to VERIFIED OEM status.',
    };
  }

  const nowIso = new Date().toISOString();
  const nextVersion = existing.version + 1;
  const nextEvidence: EvidenceHierarchyLevel =
    params.targetStatus === 'VERIFIED' ? 'VERIFIED_OEM' : 'TECHNICIAN_CONFIRMED';

  const updated: AdaptiveKnowledgeItem = {
    ...existing,
    lifecycleStatus: params.targetStatus,
    evidenceType: nextEvidence,
    version: nextVersion,
    conflict: existing.conflict ? { ...existing.conflict, resolved: true } : undefined,
    versionHistory: [
      ...existing.versionHistory,
      {
        version: nextVersion,
        updatedAt: nowIso,
        actor: params.approverActor,
        lifecycleStatus: params.targetStatus,
        changeSummary:
          params.reviewNote?.trim() ||
          `Approved as ${params.targetStatus} by ${params.approverRole} (${params.approverActor})`,
      },
    ],
  };

  // Stage 7: Index into authoritative catalog with full M1 provenance
  const catalog = loadAutomotiveKnowledgeCatalog();
  const catalogRecord: RepairReferenceRecord = {
    id: `ref-adaptive-${updated.id}`,
    vehicleId: catalog.vehicles[0]?.id || 'veh-adaptive',
    make: updated.make,
    model: updated.model,
    years: updated.years,
    systemCategoryId: 'engine_management_ecu',
    title: updated.title,
    referenceType: 'repair_manual',
    summary: updated.content,
    source: {
      sourceName: updated.sourceDocument,
      originalUrl: '',
      sourceType: params.targetStatus === 'VERIFIED' ? 'oem_verified' : 'technician_confirmed',
      collectedAt: updated.captureDate,
      language: 'en',
      verificationStatus: params.targetStatus === 'VERIFIED' ? 'OEM_VERIFIED' : 'USER_SUPPLIED',
      confidenceScore: 1,
    },
    tags: updated.tags,
    verified: true,
    ecuIdentity: updated.ecuIdentity,
    provenance: {
      sourceDocument: updated.sourceDocument,
      pageOrSection: updated.pageOrSection,
      revision: updated.revision,
      captureDate: updated.captureDate,
      verificationStatus: params.targetStatus,
      evidenceType: nextEvidence,
      testConditions: updated.testConditions,
      versionHistory: updated.versionHistory,
    },
    recordVersion: nextVersion,
  };

  const indexed = upsertKnowledgeRecordWithProvenance(catalogRecord, params.approverActor);
  if (indexed.success && indexed.record) {
    updated.indexedCatalogId = indexed.record.id;
  }

  adaptiveStore.set(updated.id, updated);
  return { ok: true, item: updated };
}

export function rejectOrSupersedeAdaptiveItem(params: {
  id: string;
  targetStatus: 'REJECTED' | 'SUPERSEDED';
  actor: string;
  reason: string;
}): { ok: boolean; error?: string; item?: AdaptiveKnowledgeItem } {
  const existing = adaptiveStore.get(params.id);
  if (!existing) {
    return { ok: false, error: `Adaptive knowledge record "${params.id}" not found.` };
  }
  const nowIso = new Date().toISOString();
  const nextVersion = existing.version + 1;
  const updated: AdaptiveKnowledgeItem = {
    ...existing,
    lifecycleStatus: params.targetStatus,
    version: nextVersion,
    versionHistory: [
      ...existing.versionHistory,
      {
        version: nextVersion,
        updatedAt: nowIso,
        actor: params.actor,
        lifecycleStatus: params.targetStatus,
        changeSummary: params.reason.trim() || `Marked ${params.targetStatus}`,
      },
    ],
  };
  adaptiveStore.set(updated.id, updated);
  return { ok: true, item: updated };
}

export interface AdaptiveRetrievalItem {
  item: AdaptiveKnowledgeItem;
  badge: string;
  isUnverifiedOptIn: boolean;
}

/**
 * Retrieves adaptive knowledge items.
 * Anti-poisoning rule: CAPTURED and PENDING records are STRICTLY EXCLUDED by default.
 * They appear ONLY when `includeUnverified: true` is passed, clearly badged as `[UNVERIFIED]`.
 */
export function retrieveAdaptiveKnowledge(params: {
  query: string;
  includeUnverified?: boolean;
}): AdaptiveRetrievalItem[] {
  const qTokens = params.query
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length >= 2);
  const results: AdaptiveRetrievalItem[] = [];

  for (const item of adaptiveStore.values()) {
    if (item.lifecycleStatus === 'REJECTED' || item.lifecycleStatus === 'SUPERSEDED') {
      continue;
    }
    const isTrusted =
      item.lifecycleStatus === 'VERIFIED' || item.lifecycleStatus === 'TECHNICIAN_CONFIRMED';
    if (!isTrusted && !params.includeUnverified) {
      continue;
    }

    const haystack = `${item.title} ${item.content} ${item.ecuIdentity.manufacturer} ${item.ecuIdentity.partNumber || ''} ${item.tags.join(' ')}`.toLowerCase();
    const matched = qTokens.length === 0 || qTokens.some((t) => haystack.includes(t));
    if (!matched) continue;

    results.push({
      item,
      badge: isTrusted
        ? item.lifecycleStatus === 'VERIFIED'
          ? 'VERIFIED OEM'
          : 'TECHNICIAN CONFIRMED'
        : 'UNVERIFIED',
      isUnverifiedOptIn: !isTrusted,
    });
  }

  return results;
}

export function listAdaptiveKnowledgeQueue(): {
  all: AdaptiveKnowledgeItem[];
  pendingReview: AdaptiveKnowledgeItem[];
  conflicts: AdaptiveKnowledgeItem[];
  trusted: AdaptiveKnowledgeItem[];
} {
  const all = Array.from(adaptiveStore.values());
  return {
    all,
    pendingReview: all.filter(
      (i) => i.lifecycleStatus === 'CAPTURED' || i.lifecycleStatus === 'PENDING'
    ),
    conflicts: all.filter((i) => Boolean(i.conflict && !i.conflict.resolved)),
    trusted: all.filter(
      (i) => i.lifecycleStatus === 'VERIFIED' || i.lifecycleStatus === 'TECHNICIAN_CONFIRMED'
    ),
  };
}

export function resetAdaptiveKnowledgeEngineForTests(): void {
  adaptiveStore.clear();
}
