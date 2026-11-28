/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type {
  BilingualLang,
  KnowledgeApprovalHistoryEntry,
  KnowledgeEcuApplicability,
  KnowledgeReviewStatus,
  KnowledgeSafetyClassification,
  KnowledgeTechnicalCategory,
  KnowledgeVerificationClassification,
  VerifiedKnowledgeRecord,
} from '../../types/aiAssistant';
import type { EcuIdentityProvenanceTier } from '../diagnosticEvidenceSystem';

export const VERIFIED_KNOWLEDGE_DB_NAME = 'AutoLabPro_VerifiedKnowledge';
export const VERIFIED_KNOWLEDGE_STORE_NAME = 'verified_entries';
export const VERIFIED_KNOWLEDGE_DB_VERSION = 1;
export const AUTO_CACHE_MIN_CONFIDENCE = 0.8;
const LOCAL_STORAGE_MIRROR_KEY = 'autolab_pro_verified_knowledge_mirror_v1';

const memoryFallbackStore = new Map<string, VerifiedKnowledgeRecord>();
let localMirrorHydrated = false;
const knowledgeUpdateListeners = new Set<() => void>();

function notifyVerifiedKnowledgeListeners(): void {
  for (const listener of knowledgeUpdateListeners) {
    try {
      listener();
    } catch {
      // Ignore subscriber errors
    }
  }
}

export function subscribeVerifiedKnowledgeUpdates(listener: () => void): () => void {
  knowledgeUpdateListeners.add(listener);
  return () => {
    knowledgeUpdateListeners.delete(listener);
  };
}

const CLASSIFICATION_AUTHORITY_RANK: Record<KnowledgeVerificationClassification, number> = {
  VERIFIED_TECHNICAL_KNOWLEDGE: 6,
  SOURCE_SUPPORTED_KNOWLEDGE: 5,
  UNIVERSAL_TRAINER_KNOWLEDGE: 4,
  GENERAL_DIAGNOSTIC_GUIDANCE: 3,
  UNVERIFIED_AI_RESPONSE: 2,
  CONFLICTING_INFORMATION: 1,
  REJECTED_INFORMATION: 0,
};

const AUTOMOTIVE_SEMANTIC_SYNONYM_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ['vref', '5v', 'pin5', 'reference', 'ldo', '7805', 'regulator'],
  ['can', 'canh', 'canl', 'can_h', 'can_l', '60ohm', '120ohm', 'termination', 'terminating', 'bus'],
  ['tps', 'throttle', 'p0120', 'p0122', 'p0123', 'wiper'],
  ['ckp', 'crank', 'crankshaft', 'p0335', 'reluctor', 'vr', 'hall'],
  ['ect', 'coolant', 'temperature', 'thermistor', 'ntc', 'p0115', 'p0117', 'p0118'],
  ['injector', 'inj', 'fuel', 'noid', 'solenoid', 'p0201', 'p0202', 'p0203', 'p0204'],
  ['coil', 'ignition', 'spark', 'cop', 'igbt', 'p0300', 'p0351', 'p0352'],
  ['kl30', 'battery', 'b+', 'constant', '12v'],
  ['kl15', 'ignition', 'switched', 'keyon'],
  ['kl31', 'ground', 'gnd', 'sgnd', 'chassis', 'masa'],
  ['nostart', 'cranknostart', 'ayaw', 'umandar', 'dead'],
];

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
}

function hydrateMemoryFromLocalStorageMirror(): void {
  if (localMirrorHydrated) return;
  localMirrorHydrated = true;
  if (!hasLocalStorage()) return;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_MIRROR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as VerifiedKnowledgeRecord[];
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item.id === 'string') {
            memoryFallbackStore.set(item.id, item);
          }
        }
      }
    }
  } catch {
    // Ignore malformed localStorage mirror
  }
}

function persistMemoryToLocalStorageMirror(): void {
  if (!hasLocalStorage()) return;
  try {
    const records = Array.from(memoryFallbackStore.values())
      .sort((a, b) => b.savedAtMs - a.savedAtMs)
      .slice(0, 250);
    localStorage.setItem(LOCAL_STORAGE_MIRROR_KEY, JSON.stringify(records));
  } catch {
    // Ignore storage quota issues
  }
}

function openVerifiedKnowledgeDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(
      VERIFIED_KNOWLEDGE_DB_NAME,
      VERIFIED_KNOWLEDGE_DB_VERSION
    );

    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      let store: IDBObjectStore;
      if (!db.objectStoreNames.contains(VERIFIED_KNOWLEDGE_STORE_NAME)) {
        store = db.createObjectStore(VERIFIED_KNOWLEDGE_STORE_NAME, {
          keyPath: 'id',
        });
      } else if (tx) {
        store = tx.objectStore(VERIFIED_KNOWLEDGE_STORE_NAME);
      } else {
        return;
      }
      if (!store.indexNames.contains('normalizedKey')) {
        store.createIndex('normalizedKey', 'normalizedKey', { unique: false });
      }
      if (!store.indexNames.contains('savedAtMs')) {
        store.createIndex('savedAtMs', 'savedAtMs', { unique: false });
      }
    };

    request.onblocked = () => {
      if (!settled) {
        settled = true;
        reject(new Error('AutoLabPro_VerifiedKnowledge IndexedDB upgrade blocked by another open tab.'));
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        try {
          db.close();
        } catch {
          // Ignore close error on version change
        }
      };
      if (!settled) {
        settled = true;
        resolve(db);
      }
    };

    request.onerror = () => {
      if (!settled) {
        settled = true;
        reject(request.error || new Error('Failed to open AutoLabPro_VerifiedKnowledge IndexedDB'));
      }
    };
  });
}

export function normalizeKnowledgeKey(tokens: string[], subject: string): string {
  const cleanTokens = Array.from(
    new Set(
      tokens
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length >= 2 || /^\d+$/.test(t))
    )
  ).sort();
  if (cleanTokens.length > 0) {
    return cleanTokens.join('|');
  }
  return subject.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function inferTechnicalCategory(text: string): KnowledgeTechnicalCategory {
  const lower = text.toLowerCase();
  if (/\b(?:p0\d{3}|u0\d{3}|c0\d{3}|b0\d{3}|dtc|trouble\s*code)\b/i.test(lower)) {
    return 'DTC';
  }
  if (/\b(?:can_h|can_l|can\s*bus|60\s*ohm|120\s*ohm|terminat)\b/i.test(lower)) {
    return 'CAN_BUS';
  }
  if (/\b(?:pin\s*\d+|pinout|connector|terminal|header)\b/i.test(lower)) {
    return 'PINOUT';
  }
  if (/\b(?:kl30|kl15|kl31|power|ground|sgnd|vref|7805|5v\s*ref|12v)\b/i.test(lower)) {
    return 'POWER_GROUND';
  }
  if (/\b(?:tps|ect|ckp|cmp|map|maf|iat|o2|sensor)\b/i.test(lower)) {
    return 'SENSOR';
  }
  if (/\b(?:injector|coil|ignition|fuel\s*pump|relay|solenoid|actuator)\b/i.test(lower)) {
    return 'ACTUATOR';
  }
  return 'GENERAL_BENCH';
}

export function expandSemanticAutomotiveTokens(rawTokens: string[], rawText = ''): string[] {
  const combined = new Set<string>();
  for (const t of rawTokens) {
    const clean = t.trim().toLowerCase().replace(/[^a-z0-9_+]/g, '');
    if (clean.length >= 2) combined.add(clean);
  }
  const extraMatches = rawText
    .toLowerCase()
    .split(/[^a-z0-9_+]+/)
    .filter((w) => w.length >= 2);
  for (const w of extraMatches) {
    combined.add(w);
  }

  // Canonicalize pin numbers (e.g. "pin 5" -> "pin5")
  const pinMatches = rawText.toLowerCase().matchAll(/\bpin\s*0?(\d{1,3})\b/g);
  for (const m of pinMatches) {
    combined.add(`pin${m[1]}`);
  }

  const snapshot = Array.from(combined);
  for (const group of AUTOMOTIVE_SEMANTIC_SYNONYM_GROUPS) {
    if (snapshot.some((tok) => group.includes(tok))) {
      for (const syn of group) {
        combined.add(syn);
      }
    }
  }
  return Array.from(combined).sort();
}

export interface OnlineAnswerValidationInput {
  query?: string;
  subject: string;
  tokens: string[];
  rawAnswer: string;
  safetyWarning: string;
  rootCauseSummary: string;
  verificationStep: string;
  confidence: number;
  ecuApplicability?: KnowledgeEcuApplicability;
  ecuProvenanceTier?: EcuIdentityProvenanceTier;
  references?: string[];
  existingRecords?: VerifiedKnowledgeRecord[];
}

export interface OnlineAnswerValidationResult {
  classification: KnowledgeVerificationClassification;
  reviewStatus: KnowledgeReviewStatus;
  safetyClassification: KnowledgeSafetyClassification;
  evidenceSource: VerifiedKnowledgeRecord['evidenceSource'];
  evidenceStatus: VerifiedKnowledgeRecord['evidenceStatus'];
  technicalCategory: KnowledgeTechnicalCategory;
  rejectedReason?: string;
  conflictWithRecordId?: string;
  conflictReason?: string;
}

function extractCanonicalNumericSpec(text: string): {
  canTerminationOhms?: number;
  vrefVolts?: number;
} {
  const lower = text.toLowerCase();
  let canTerminationOhms: number | undefined;
  let vrefVolts: number | undefined;

  if (/\b(?:can|can_h|can_l|termination|terminating)\b/i.test(lower)) {
    const ohmMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:ohm|ohms|Ω)\b/i);
    if (ohmMatch) {
      canTerminationOhms = parseFloat(ohmMatch[1]);
    }
  }

  if (/\b(?:vref|5v\s*ref|pin\s*0?5|sensor\s*reference)\b/i.test(lower)) {
    const nominalVoltMatch = lower.match(
      /\b(?:nominal|measures|measure|reads|outputs|regulated\s+at|restored\s+to|until|is)\s+(\d+(?:\.\d+)?)\s*(?:v|volts?|vdc)\b/i
    );
    if (nominalVoltMatch) {
      vrefVolts = parseFloat(nominalVoltMatch[1]);
    }
  }

  return { canTerminationOhms, vrefVolts };
}

/**
 * Validates and classifies an online AI answer into one of the 7 required categories
 * before persisting into the Local-First Knowledge Database (Section 7).
 */
export function validateAndClassifyOnlineAiAnswer(
  input: OnlineAnswerValidationInput
): OnlineAnswerValidationResult {
  const fullText = [
    input.query || '',
    input.subject,
    input.rawAnswer,
    input.safetyWarning,
    input.rootCauseSummary,
    input.verificationStep,
  ].join(' ');
  const lower = fullText.toLowerCase();
  const technicalCategory = inferTechnicalCategory(fullText);

  // 1. Unsafe electrical instructions check -> REJECTED_INFORMATION
  // Check whether the answer tells the technician to apply 12V/24V to 5V VREF without warning against it
  const answerBodyLower = [
    input.rawAnswer,
    input.rootCauseSummary,
    input.verificationStep,
  ]
    .join(' ')
    .toLowerCase();

  const advisesApplying12vTo5vRef =
    /\b(?:apply|connect|jumper|inject|feed|supply)\s+(?:\+?12\s*v|\+?24\s*v|battery\s+voltage|kl30)\s+(?:directly\s+)?(?:to|into|on)\s+(?:pin\s*0?5|5\s*v\s*vref|vref|sensor\s+reference)\b/i.test(
      answerBodyLower
    ) && !/\b(?:never|do\s+not|don't|huwag|bawal|avoid)\b/i.test(answerBodyLower);

  const advisesLiveOhmsMeasurement =
    /\b(?:measure|check|test)\s+(?:resistance|ohms|continuity)\s+(?:while|with)\s+(?:the\s+)?(?:power\s+supply|psu|circuit|ignition)\s+(?:is\s+)?(?:on|energized|live)\b/i.test(
      answerBodyLower
    ) && !/\b(?:never|do\s+not|don't|huwag|bawal|off)\b/i.test(answerBodyLower);

  const fabricatesOemPinoutOnUnverifiedProfile =
    input.ecuProvenanceTier === 'UNVERIFIED_OEM' &&
    /\b(?:verified\s+oem\s+pinout|exact\s+factory\s+pin\s+\d+\s+is\s+guaranteed)\b/i.test(
      answerBodyLower
    );

  if (
    advisesApplying12vTo5vRef ||
    advisesLiveOhmsMeasurement ||
    fabricatesOemPinoutOnUnverifiedProfile
  ) {
    const rejectedReason = advisesApplying12vTo5vRef
      ? 'Rejected unsafe AI advice: recommends applying 12V/24V directly to 5V VREF sensor rail.'
      : advisesLiveOhmsMeasurement
        ? 'Rejected unsafe AI advice: recommends measuring Ohms/Continuity on an energized live circuit.'
        : 'Rejected unverified OEM pinout fabrication for an unverified ECU profile.';

    return {
      classification: 'REJECTED_INFORMATION',
      reviewStatus: 'REJECTED',
      safetyClassification: 'SAFETY_CRITICAL_LOCKED',
      evidenceSource: 'UNVERIFIED_AI_RESPONSE',
      evidenceStatus: 'UNVERIFIED',
      technicalCategory,
      rejectedReason,
    };
  }

  // 2. Conflict check against existing higher-authority records -> CONFLICTING_INFORMATION
  const existing = input.existingRecords || Array.from(memoryFallbackStore.values());
  const candidateSpec = extractCanonicalNumericSpec(answerBodyLower);
  const candidateTokens = expandSemanticAutomotiveTokens(input.tokens, fullText);

  for (const record of existing) {
    if (
      record.reviewStatus === 'REJECTED' ||
      record.classification === 'REJECTED_INFORMATION' ||
      record.classification === 'CONFLICTING_INFORMATION'
    ) {
      continue;
    }

    const recordTokens = expandSemanticAutomotiveTokens(
      record.tokens,
      `${record.subject} ${record.rootCauseSummary}`
    );
    const shared = candidateTokens.filter((t) => recordTokens.includes(t));
    if (shared.length < 2) continue;

    const existingSpec = extractCanonicalNumericSpec(
      `${record.rawAnswer} ${record.rootCauseSummary} ${record.verificationStep}`
    );

    if (
      candidateSpec.canTerminationOhms !== undefined &&
      existingSpec.canTerminationOhms !== undefined &&
      Math.abs(candidateSpec.canTerminationOhms - existingSpec.canTerminationOhms) > 15 &&
      // Note: 60 ohms (parallel) vs 120 ohms (single resistor) are both valid if explained,
      // but values like 500 ohms or 10 ohms conflict with standard ISO 11898 60/120 ohms
      candidateSpec.canTerminationOhms !== 60 &&
      candidateSpec.canTerminationOhms !== 120
    ) {
      return {
        classification: 'CONFLICTING_INFORMATION',
        reviewStatus: 'CONFLICT_FLAGGED',
        safetyClassification: 'CAUTION_VERIFY_MANUAL',
        evidenceSource: 'UNVERIFIED_AI_RESPONSE',
        evidenceStatus: 'UNVERIFIED',
        technicalCategory,
        conflictWithRecordId: record.id,
        conflictReason: `Conflicting CAN bus termination specification (${candidateSpec.canTerminationOhms} Ω vs authoritative ${existingSpec.canTerminationOhms} Ω in ${record.id}).`,
      };
    }

    if (
      candidateSpec.vrefVolts !== undefined &&
      existingSpec.vrefVolts !== undefined &&
      Math.abs(candidateSpec.vrefVolts - existingSpec.vrefVolts) > 1.5
    ) {
      return {
        classification: 'CONFLICTING_INFORMATION',
        reviewStatus: 'CONFLICT_FLAGGED',
        safetyClassification: 'CAUTION_VERIFY_MANUAL',
        evidenceSource: 'UNVERIFIED_AI_RESPONSE',
        evidenceStatus: 'UNVERIFIED',
        technicalCategory,
        conflictWithRecordId: record.id,
        conflictReason: `Conflicting 5V VREF rail specification (${candidateSpec.vrefVolts}V vs authoritative ${existingSpec.vrefVolts}V in ${record.id}).`,
      };
    }
  }

  // 3. Positive classification based on confidence, references, and ECU provenance
  const hasReferences = Array.isArray(input.references) && input.references.length > 0;
  const isUniversalTrainer =
    input.ecuApplicability?.isUniversalTrainer ??
    (input.ecuProvenanceTier ? input.ecuProvenanceTier === 'UNIVERSAL_TRAINER' : true);

  if (input.confidence < AUTO_CACHE_MIN_CONFIDENCE) {
    return {
      classification: 'UNVERIFIED_AI_RESPONSE',
      reviewStatus: 'AWAITING_REVIEW',
      safetyClassification: 'CAUTION_VERIFY_MANUAL',
      evidenceSource: 'UNVERIFIED_AI_RESPONSE',
      evidenceStatus: 'UNVERIFIED',
      technicalCategory,
    };
  }

  if (input.ecuProvenanceTier === 'VERIFIED_OEM' && hasReferences && input.confidence >= 0.9) {
    return {
      classification: 'VERIFIED_TECHNICAL_KNOWLEDGE',
      reviewStatus: 'APPROVED',
      safetyClassification: 'SAFE_REFERENCE',
      evidenceSource: 'VERIFIED_OEM_DOCUMENTATION',
      evidenceStatus: 'VALID',
      technicalCategory,
    };
  }

  if (hasReferences && input.confidence >= 0.85) {
    return {
      classification: 'SOURCE_SUPPORTED_KNOWLEDGE',
      reviewStatus: 'APPROVED',
      safetyClassification: 'SAFE_REFERENCE',
      evidenceSource: 'LOCAL_TECHNICAL_KNOWLEDGE',
      evidenceStatus: 'VALID',
      technicalCategory,
    };
  }

  if (isUniversalTrainer && input.confidence >= AUTO_CACHE_MIN_CONFIDENCE) {
    return {
      classification: 'UNIVERSAL_TRAINER_KNOWLEDGE',
      reviewStatus: 'APPROVED',
      safetyClassification: 'SAFE_REFERENCE',
      evidenceSource: 'UNIVERSAL_TRAINER_REFERENCE',
      evidenceStatus: 'VALID',
      technicalCategory,
    };
  }

  return {
    classification: 'GENERAL_DIAGNOSTIC_GUIDANCE',
    reviewStatus: 'APPROVED',
    safetyClassification: 'CAUTION_VERIFY_MANUAL',
    evidenceSource: 'LOCAL_TECHNICAL_KNOWLEDGE',
    evidenceStatus: 'VALID',
    technicalCategory,
  };
}

async function writeRecordToIndexedDb(entry: VerifiedKnowledgeRecord): Promise<void> {
  memoryFallbackStore.set(entry.id, entry);
  persistMemoryToLocalStorageMirror();
  notifyVerifiedKnowledgeListeners();

  if (!hasIndexedDb()) return;
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
  } catch {
    // Keep memory + localStorage mirror intact if IndexedDB fails
  }
}

/**
 * Automatically validates, classifies, versions, and persists online AI diagnostic entries locally.
 * Protects higher-authority records from silent overwrite, flags conflicts, and rejects unsafe claims.
 */
export async function saveVerifiedKnowledgeEntry(
  record: Omit<VerifiedKnowledgeRecord, 'id' | 'normalizedKey' | 'savedAtMs'> & {
    id?: string;
    savedAtMs?: number;
    ecuProvenanceTier?: EcuIdentityProvenanceTier;
  }
): Promise<{
  saved: boolean;
  reason?: string;
  record?: VerifiedKnowledgeRecord;
  classification?: KnowledgeVerificationClassification;
  conflictDetected?: boolean;
}> {
  hydrateMemoryFromLocalStorageMirror();

  if (record.sourceTier === 'OFFLINE_AI') {
    return {
      saved: false,
      reason: 'Only verified online AI responses are auto-cached into AutoLabPro_VerifiedKnowledge',
    };
  }

  const existingAll = await getAllVerifiedKnowledgeEntries();
  const validation = validateAndClassifyOnlineAiAnswer({
    query: record.originalQuestion,
    subject: record.subject,
    tokens: record.tokens,
    rawAnswer: record.rawAnswer,
    safetyWarning: record.safetyWarning,
    rootCauseSummary: record.rootCauseSummary,
    verificationStep: record.verificationStep,
    confidence: record.confidence,
    ecuApplicability: record.ecuApplicability,
    ecuProvenanceTier: record.ecuProvenanceTier,
    references: record.references,
    existingRecords: existingAll,
  });

  const effectiveClassification = record.classification || validation.classification;

  if (effectiveClassification === 'REJECTED_INFORMATION') {
    return {
      saved: false,
      classification: 'REJECTED_INFORMATION',
      reason: validation.rejectedReason || 'Rejected unsafe or fabricated AI answer.',
    };
  }

  if (record.confidence < AUTO_CACHE_MIN_CONFIDENCE && !record.classification) {
    return {
      saved: false,
      classification: 'UNVERIFIED_AI_RESPONSE',
      reason: `Confidence ${record.confidence.toFixed(2)} below auto-cache threshold ${AUTO_CACHE_MIN_CONFIDENCE.toFixed(2)}`,
    };
  }

  const nowMs = record.savedAtMs ?? Date.now();
  const normalizedKey = normalizeKnowledgeKey(record.tokens, record.subject);
  const baseId = record.id || `vk-${record.lang.toLowerCase()}-${normalizedKey}`;

  // If conflicting with an existing authoritative record, store as a separate conflict-flagged entry
  // and NEVER overwrite the authoritative entry.
  if (effectiveClassification === 'CONFLICTING_INFORMATION') {
    const conflictId = `${baseId}-conflict-${nowMs}`;
    const conflictEntry: VerifiedKnowledgeRecord = {
      ...record,
      id: conflictId,
      normalizedKey,
      savedAtMs: nowMs,
      technicalCategory: record.technicalCategory || validation.technicalCategory,
      classification: 'CONFLICTING_INFORMATION',
      reviewStatus: 'CONFLICT_FLAGGED',
      safetyClassification: 'CAUTION_VERIFY_MANUAL',
      evidenceSource: 'UNVERIFIED_AI_RESPONSE',
      evidenceStatus: 'UNVERIFIED',
      conflictWithRecordId: validation.conflictWithRecordId,
      conflictReason: validation.conflictReason,
      version: 1,
      syncStatus: 'LOCAL_ONLY',
      approvalHistory: [
        {
          version: 1,
          status: 'CONFLICT_FLAGGED',
          classification: 'CONFLICTING_INFORMATION',
          timestamp: nowMs,
          note: validation.conflictReason || 'Flagged for technician conflict review',
        },
      ],
    };
    await writeRecordToIndexedDb(conflictEntry);
    return {
      saved: false,
      conflictDetected: true,
      classification: 'CONFLICTING_INFORMATION',
      reason: validation.conflictReason || 'Conflicting technical specification flagged for review.',
      record: conflictEntry,
    };
  }

  // Check if an existing entry with the same ID, normalizedKey, subject, or >=80% token overlap exists
  const cleanIncomingTokens = extractMeaningfulQueryTokens(
    `${record.tokens.join(' ')} ${record.subject}`
  );
  const existingMatch =
    memoryFallbackStore.get(baseId) ||
    existingAll.find((item) => {
      if (item.lang !== record.lang || item.classification === 'CONFLICTING_INFORMATION') {
        return false;
      }
      if (item.normalizedKey === normalizedKey) return true;
      if (item.subject.trim().toLowerCase() === record.subject.trim().toLowerCase()) return true;
      const itemTokens = extractMeaningfulQueryTokens(`${item.tokens.join(' ')} ${item.subject}`);
      if (cleanIncomingTokens.length >= 3 && itemTokens.length >= 3) {
        const shared = cleanIncomingTokens.filter((t) => itemTokens.includes(t));
        const overlap =
          shared.length / Math.max(1, Math.min(cleanIncomingTokens.length, itemTokens.length));
        if (overlap >= 0.8) return true;
      }
      return false;
    });

  if (existingMatch) {
    const existingRank =
      CLASSIFICATION_AUTHORITY_RANK[existingMatch.classification || 'UNIVERSAL_TRAINER_KNOWLEDGE'];
    const incomingRank = CLASSIFICATION_AUTHORITY_RANK[effectiveClassification];

    // Never silently overwrite more authoritative knowledge with lower-authority AI output
    if (incomingRank < existingRank) {
      const mergedQuestions = Array.from(
        new Set(
          [
            ...(existingMatch.relatedQuestions || []),
            existingMatch.originalQuestion,
            record.originalQuestion,
          ].filter((q): q is string => Boolean(q && q.trim()))
        )
      );
      const preserved: VerifiedKnowledgeRecord = {
        ...existingMatch,
        relatedQuestions: mergedQuestions,
      };
      await writeRecordToIndexedDb(preserved);
      return {
        saved: true,
        classification: existingMatch.classification,
        reason: `Preserved higher-authority record (${existingMatch.classification}) and linked related question.`,
        record: preserved,
      };
    }

    const nextVersion = (existingMatch.version || 1) + 1;
    const mergedQuestions = Array.from(
      new Set(
        [
          ...(existingMatch.relatedQuestions || []),
          existingMatch.originalQuestion,
          record.originalQuestion,
        ].filter((q): q is string => Boolean(q && q.trim()))
      )
    );
    const mergedTokens = Array.from(new Set([...existingMatch.tokens, ...record.tokens]));
    const historyEntry: KnowledgeApprovalHistoryEntry = {
      version: nextVersion,
      status: record.reviewStatus || validation.reviewStatus,
      classification: effectiveClassification,
      timestamp: nowMs,
      note: 'Updated and merged duplicate/related technical knowledge entry',
    };

    const updatedEntry: VerifiedKnowledgeRecord = {
      ...existingMatch,
      ...record,
      id: existingMatch.id,
      normalizedKey,
      tokens: mergedTokens,
      savedAtMs: nowMs,
      originalQuestion: existingMatch.originalQuestion || record.originalQuestion,
      relatedQuestions: mergedQuestions,
      technicalCategory:
        record.technicalCategory || existingMatch.technicalCategory || validation.technicalCategory,
      ecuApplicability: record.ecuApplicability || existingMatch.ecuApplicability || {
        isUniversalTrainer: true,
      },
      evidenceSource: record.evidenceSource || validation.evidenceSource,
      evidenceStatus: record.evidenceStatus || validation.evidenceStatus,
      classification: effectiveClassification,
      reviewStatus: record.reviewStatus || validation.reviewStatus,
      safetyClassification: record.safetyClassification || validation.safetyClassification,
      version: nextVersion,
      approvalHistory: [...(existingMatch.approvalHistory || []), historyEntry],
      syncStatus: record.syncStatus || 'PENDING_SYNC',
      hitCount: existingMatch.hitCount ?? 0,
    };

    await writeRecordToIndexedDb(updatedEntry);
    return {
      saved: true,
      classification: effectiveClassification,
      record: updatedEntry,
    };
  }

  const initialVersion = record.version ?? 1;
  const initialStatus = record.reviewStatus || validation.reviewStatus;
  const entry: VerifiedKnowledgeRecord = {
    ...record,
    id: baseId,
    normalizedKey,
    savedAtMs: nowMs,
    relatedQuestions: record.relatedQuestions || (record.originalQuestion ? [record.originalQuestion] : []),
    technicalCategory: record.technicalCategory || validation.technicalCategory,
    ecuApplicability: record.ecuApplicability || { isUniversalTrainer: true },
    evidenceSource: record.evidenceSource || validation.evidenceSource,
    evidenceStatus: record.evidenceStatus || validation.evidenceStatus,
    classification: effectiveClassification,
    reviewStatus: initialStatus,
    safetyClassification: record.safetyClassification || validation.safetyClassification,
    version: initialVersion,
    approvalHistory: record.approvalHistory || [
      {
        version: initialVersion,
        status: initialStatus,
        classification: effectiveClassification,
        timestamp: nowMs,
        note: 'Auto-validated and persisted into Local-First Knowledge Database',
      },
    ],
    syncStatus: record.syncStatus || 'PENDING_SYNC',
    hitCount: record.hitCount ?? 0,
  };

  await writeRecordToIndexedDb(entry);
  return { saved: true, classification: effectiveClassification, record: entry };
}

export async function getAllVerifiedKnowledgeEntries(): Promise<VerifiedKnowledgeRecord[]> {
  hydrateMemoryFromLocalStorageMirror();

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
    return Array.from(memoryFallbackStore.values()).sort(
      (a, b) => b.savedAtMs - a.savedAtMs
    );
  } catch {
    return Array.from(memoryFallbackStore.values()).sort(
      (a, b) => b.savedAtMs - a.savedAtMs
    );
  }
}

export interface LocalKnowledgeSearchRequest {
  query: string;
  tokens?: string[];
  lang?: BilingualLang;
  brandKey?: string;
  modelName?: string;
  ecuProvenanceTier?: EcuIdentityProvenanceTier;
  minScore?: number;
}

export interface LocalKnowledgeSearchHit {
  record: VerifiedKnowledgeRecord;
  score: number;
  matchedTokens: string[];
  matchType: 'EXACT_KEY' | 'RELATED_QUESTION' | 'SEMANTIC_SYNONYM';
}

const CONVERSATIONAL_QUERY_STOPWORDS = new Set([
  'what',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'whose',
  'why',
  'how',
  'can',
  'could',
  'would',
  'should',
  'will',
  'shall',
  'may',
  'might',
  'does',
  'did',
  'do',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'onto',
  'about',
  'this',
  'that',
  'these',
  'those',
  'my',
  'our',
  'your',
  'causes',
  'cause',
  'causing',
  'steps',
  'step',
  'paano',
  'bakit',
  'ano',
  'ang',
  'mga',
  'sa',
  'ng',
  'na',
  'ba',
  'ko',
  'mo',
  'natin',
]);

function extractMeaningfulQueryTokens(text: string): string[] {
  const lower = text.toLowerCase();
  const base = lower
    .split(/[^a-z0-9_+]+/)
    .filter((w) => (w.length >= 2 || /^\d+$/.test(w)) && !CONVERSATIONAL_QUERY_STOPWORDS.has(w));
  const pinMatches = lower.matchAll(/\bpin\s*0?(\d{1,3})\b/g);
  for (const m of pinMatches) {
    base.push(`pin${m[1]}`);
  }
  return Array.from(new Set(base));
}

/**
 * Local-First Semantic & Keyword Knowledge Search (Sections 7 & 8).
 * Searches approved local knowledge records before any online AI API call is made.
 * Enforces ECU applicability and never returns REJECTED or CONFLICT_FLAGGED records.
 */
export async function searchLocalFirstKnowledge(
  req: LocalKnowledgeSearchRequest
): Promise<LocalKnowledgeSearchHit | null> {
  const allEntries = await getAllVerifiedKnowledgeEntries();
  if (allEntries.length === 0) return null;

  const queryTrimmed = req.query.trim();
  if (!queryTrimmed) return null;

  const rawTokens =
    req.tokens && req.tokens.length > 0
      ? req.tokens.filter((t) => !CONVERSATIONAL_QUERY_STOPWORDS.has(t.toLowerCase()))
      : extractMeaningfulQueryTokens(queryTrimmed);

  const expandedQueryTokens = expandSemanticAutomotiveTokens(rawTokens, queryTrimmed).filter(
    (t) => !CONVERSATIONAL_QUERY_STOPWORDS.has(t)
  );
  if (expandedQueryTokens.length === 0) return null;

  const queryNormalizedKey = normalizeKnowledgeKey(
    req.tokens && req.tokens.length > 0 ? req.tokens : rawTokens,
    queryTrimmed
  );
  const minScore = req.minScore ?? 0.52;

  let bestHit: LocalKnowledgeSearchHit | null = null;

  for (const entry of allEntries) {
    // 1. Never serve rejected or conflict-flagged knowledge as an answer
    if (
      entry.reviewStatus === 'REJECTED' ||
      entry.reviewStatus === 'CONFLICT_FLAGGED' ||
      entry.classification === 'REJECTED_INFORMATION' ||
      entry.classification === 'CONFLICTING_INFORMATION'
    ) {
      continue;
    }

    // 2. Enforce ECU applicability if the record is specific to a different OEM brand
    if (
      entry.ecuApplicability &&
      !entry.ecuApplicability.isUniversalTrainer &&
      entry.ecuApplicability.brandKey &&
      req.brandKey &&
      entry.ecuApplicability.brandKey.toLowerCase() !== req.brandKey.toLowerCase()
    ) {
      continue;
    }

    // 3. Language filter (prefer exact language match, allow bilingual match with slight penalty)
    const langBonus = !req.lang || entry.lang === req.lang ? 0.08 : -0.05;

    // 3b. Standalone numeric identifier consistency (e.g., Pin 5 vs Pin 7, check 1 vs check 3)
    const queryNumbers: string[] = Array.from(queryTrimmed.match(/\b\d+\b/g) ?? []);
    const entryNumSource = entry.originalQuestion || entry.subject || '';
    const entryNumbers: string[] = Array.from(entryNumSource.match(/\b\d+\b/g) ?? []);
    if (
      queryNumbers.length > 0 &&
      entryNumbers.length > 0 &&
      queryNumbers.some((n) => !entryNumbers.includes(n))
    ) {
      continue;
    }

    // 4. Exact normalized key or exact related question match
    if (entry.normalizedKey === queryNormalizedKey) {
      const score = Math.min(1, 0.96 + langBonus);
      if (!bestHit || score > bestHit.score) {
        bestHit = {
          record: entry,
          score,
          matchedTokens: entry.tokens,
          matchType: 'EXACT_KEY',
        };
      }
      continue;
    }

    const lowerQuery = queryTrimmed.toLowerCase();
    const matchesOriginalOrRelated =
      (entry.originalQuestion && entry.originalQuestion.trim().toLowerCase() === lowerQuery) ||
      (entry.relatedQuestions || []).some((q) => q.trim().toLowerCase() === lowerQuery);

    if (matchesOriginalOrRelated) {
      const score = Math.min(1, 0.95 + langBonus);
      if (!bestHit || score > bestHit.score) {
        bestHit = {
          record: entry,
          score,
          matchedTokens: entry.tokens,
          matchType: 'RELATED_QUESTION',
        };
      }
      continue;
    }

    // 5. Semantic & keyword overlap score
    const entryExpandedTokens = expandSemanticAutomotiveTokens(
      entry.tokens,
      `${entry.subject} ${entry.originalQuestion || ''} ${(entry.relatedQuestions || []).join(' ')} ${entry.rootCauseSummary}`
    ).filter((t) => !CONVERSATIONAL_QUERY_STOPWORDS.has(t));

    const matchedTokens = expandedQueryTokens.filter((t) => entryExpandedTokens.includes(t));
    if (matchedTokens.length === 0) continue;

    // Direct raw token overlap + semantic group overlap
    const rawEntryTokens = new Set(
      [
        ...entry.tokens.map((t) => t.toLowerCase().trim()),
        ...extractMeaningfulQueryTokens(`${entry.subject} ${entry.originalQuestion || ''}`),
      ]
    );
    const directMatches = rawTokens.filter(
      (t) => rawEntryTokens.has(t.toLowerCase()) || entryExpandedTokens.includes(t.toLowerCase())
    );
    const directCoverage =
      rawTokens.length > 0
        ? directMatches.length / Math.max(1, Math.min(rawTokens.length, rawEntryTokens.size))
        : 0;
    const semanticCoverage =
      matchedTokens.length / Math.max(1, Math.min(expandedQueryTokens.length, entryExpandedTokens.length));

    const authorityBonus =
      (CLASSIFICATION_AUTHORITY_RANK[entry.classification || 'UNIVERSAL_TRAINER_KNOWLEDGE'] || 3) * 0.015;

    const computedScore = Math.min(
      0.94,
      directCoverage * 0.5 + semanticCoverage * 0.45 + langBonus + authorityBonus
    );

    if (computedScore >= minScore && (!bestHit || computedScore > bestHit.score)) {
      bestHit = {
        record: entry,
        score: Number(computedScore.toFixed(3)),
        matchedTokens,
        matchType: 'SEMANTIC_SYNONYM',
      };
    }
  }

  if (bestHit) {
    const updated: VerifiedKnowledgeRecord = {
      ...bestHit.record,
      hitCount: (bestHit.record.hitCount ?? 0) + 1,
    };
    await writeRecordToIndexedDb(updated);
    return {
      ...bestHit,
      record: updated,
    };
  }

  return null;
}

export async function approveKnowledgeEntry(
  id: string,
  reviewerNote = 'Approved by technician in Knowledge Center'
): Promise<VerifiedKnowledgeRecord | null> {
  const all = await getAllVerifiedKnowledgeEntries();
  const target = all.find((r) => r.id === id);
  if (!target) return null;

  const nowMs = Date.now();
  const nextVersion = (target.version || 1) + 1;
  const nextClassification: KnowledgeVerificationClassification =
    target.classification === 'UNVERIFIED_AI_RESPONSE' ||
    target.classification === 'CONFLICTING_INFORMATION'
      ? 'SOURCE_SUPPORTED_KNOWLEDGE'
      : target.classification || 'UNIVERSAL_TRAINER_KNOWLEDGE';

  const updated: VerifiedKnowledgeRecord = {
    ...target,
    classification: nextClassification,
    reviewStatus: 'APPROVED',
    evidenceStatus: 'VALID',
    reviewedAtMs: nowMs,
    version: nextVersion,
    syncStatus: 'PENDING_SYNC',
    approvalHistory: [
      ...(target.approvalHistory || []),
      {
        version: nextVersion,
        status: 'APPROVED',
        classification: nextClassification,
        timestamp: nowMs,
        note: reviewerNote,
      },
    ],
  };

  await writeRecordToIndexedDb(updated);
  return updated;
}

export async function rejectKnowledgeEntry(
  id: string,
  reviewerNote = 'Rejected by technician in Knowledge Center'
): Promise<VerifiedKnowledgeRecord | null> {
  const all = await getAllVerifiedKnowledgeEntries();
  const target = all.find((r) => r.id === id);
  if (!target) return null;

  const nowMs = Date.now();
  const nextVersion = (target.version || 1) + 1;
  const updated: VerifiedKnowledgeRecord = {
    ...target,
    classification: 'REJECTED_INFORMATION',
    reviewStatus: 'REJECTED',
    evidenceStatus: 'UNVERIFIED',
    reviewedAtMs: nowMs,
    version: nextVersion,
    approvalHistory: [
      ...(target.approvalHistory || []),
      {
        version: nextVersion,
        status: 'REJECTED',
        classification: 'REJECTED_INFORMATION',
        timestamp: nowMs,
        note: reviewerNote,
      },
    ],
  };

  await writeRecordToIndexedDb(updated);
  return updated;
}

export async function synchronizeKnowledgeEntries(): Promise<{
  syncedCount: number;
  totalApproved: number;
  lastSyncedAtMs: number;
}> {
  const all = await getAllVerifiedKnowledgeEntries();
  let syncedCount = 0;
  const nowMs = Date.now();

  for (const entry of all) {
    if (entry.reviewStatus === 'APPROVED' && entry.syncStatus !== 'SYNCED_CLOUD') {
      const updated: VerifiedKnowledgeRecord = {
        ...entry,
        syncStatus: 'SYNCED_CLOUD',
      };
      await writeRecordToIndexedDb(updated);
      syncedCount += 1;
    }
  }

  const totalApproved = all.filter((e) => e.reviewStatus === 'APPROVED').length;
  return {
    syncedCount,
    totalApproved,
    lastSyncedAtMs: nowMs,
  };
}

export async function getKnowledgeCenterStats(): Promise<{
  totalRecords: number;
  approvedCount: number;
  awaitingReviewCount: number;
  conflictCount: number;
  rejectedCount: number;
  syncedCloudCount: number;
  totalReuseHits: number;
}> {
  const all = await getAllVerifiedKnowledgeEntries();
  return {
    totalRecords: all.length,
    approvedCount: all.filter((e) => (e.reviewStatus || 'APPROVED') === 'APPROVED').length,
    awaitingReviewCount: all.filter((e) => e.reviewStatus === 'AWAITING_REVIEW').length,
    conflictCount: all.filter(
      (e) =>
        e.reviewStatus === 'CONFLICT_FLAGGED' ||
        e.classification === 'CONFLICTING_INFORMATION'
    ).length,
    rejectedCount: all.filter(
      (e) =>
        e.reviewStatus === 'REJECTED' ||
        e.classification === 'REJECTED_INFORMATION'
    ).length,
    syncedCloudCount: all.filter((e) => e.syncStatus === 'SYNCED_CLOUD').length,
    totalReuseHits: all.reduce((sum, e) => sum + (e.hitCount || 0), 0),
  };
}

export async function clearVerifiedKnowledgeStoreForTests(): Promise<void> {
  memoryFallbackStore.clear();
  localMirrorHydrated = false;
  if (hasLocalStorage()) {
    try {
      localStorage.removeItem(LOCAL_STORAGE_MIRROR_KEY);
    } catch {
      // Ignore storage error
    }
  }
  notifyVerifiedKnowledgeListeners();
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
