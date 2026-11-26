/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

export type BilingualLang = 'TL' | 'EN';

export type AiTierId =
  | 'CARBON'
  | 'HYDROGEN'
  | 'ARGON'
  | 'FLASH_LITE'
  | 'OFFLINE_AI';

export type AiRouterPhase = 'IDLE' | 'ROUTING' | 'ACTIVE' | 'FALLBACK' | 'OFFLINE';

export interface AiTierMetadata {
  id: AiTierId;
  label: string;
  shortLabel: string;
  geminiRole?: 'DEEP_REASONING' | 'COMPLEX_INTERACTIVE' | 'GENERAL' | 'FAST';
  isOnline: boolean;
}

export interface AiTierAttemptLog {
  tier: AiTierId;
  outcome:
    | 'SUCCESS'
    | 'QUOTA_429'
    | 'TIMEOUT'
    | 'AUTH_OR_TIER_BLOCKED'
    | 'NETWORK_ERROR'
    | 'SKIPPED_OFFLINE'
    | 'SKIPPED_COOLDOWN'
    | 'PRE_QUOTA_REROUTED'
    | 'VOICE_CACHE_HIT';
  statusCode?: number;
  reason?: string;
}

export interface AiRouterStatusSnapshot {
  activeTier: AiTierId;
  phase: AiRouterPhase;
  lastUpdatedAt: number;
  isOfflineFallback: boolean;
  preQuotaRerouted?: boolean;
  rerouteReason?: string;
  cooldownActiveUntilMs?: number;
  lastErrorSummary?: string;
  attemptTrail: AiTierAttemptLog[];
}

export interface MultimeterToleranceHook {
  nominalOhms?: number;
  nominalVolts?: number;
  tolerancePercent?: number;
  measuredValue?: number;
  withinSpec?: boolean;
}

export interface PcbOverlayHook {
  boardId?: string;
  highlightedComponentId?: string;
  coordinates?: { x: number; y: number };
}

export interface BenchTelemetry {
  vehicleLabel: string;
  ecuProfileLabel: string;
  psuEnabled: boolean;
  psuVoltageSetting: number;
  psuCurrentLimitAmps: number;
  psuCurrentDrawAmps: number;
  isOcpTripped: boolean;
  activeDtcs: Array<{
    code: string;
    severity: string;
    description: string;
  }>;
  activeFaults: Array<{
    pinId: string;
    faultType: string;
    description: string;
  }>;
  selectedPin?: {
    id: string;
    pinNumber: number;
    label: string;
    name: string;
    measuredVoltage: number | null;
    nominalVoltage: number;
  };
  dmm: {
    isPowered: boolean;
    mode: string;
    displayReading: string;
    unit: string;
    redProbeLabel: string;
    blackProbeLabel: string;
    warning?: string;
  };
  /** Reserved Priority 2 extension hook for automated multimeter tolerance grading */
  multimeterToleranceHook?: MultimeterToleranceHook;
  /** Reserved Priority 2 extension hook for PCB visual overlay hotspot linking */
  pcbOverlayHook?: PcbOverlayHook;
}

export type DiagnosticCardKind =
  | 'SAFETY_WARNING'
  | 'ROOT_CAUSE_ASSESSMENT'
  | 'VERIFICATION_ACTION';

export interface DiagnosticStepCard {
  id: string;
  stepNumber: 1 | 2 | 3;
  kind: DiagnosticCardKind;
  title: string;
  badge: string;
  body: string;
  bulletPoints?: string[];
  emphasisTone: 'danger' | 'info' | 'action';
}

export type KnowledgeVerificationClassification =
  | 'VERIFIED_TECHNICAL_KNOWLEDGE'
  | 'SOURCE_SUPPORTED_KNOWLEDGE'
  | 'UNIVERSAL_TRAINER_KNOWLEDGE'
  | 'GENERAL_DIAGNOSTIC_GUIDANCE'
  | 'UNVERIFIED_AI_RESPONSE'
  | 'CONFLICTING_INFORMATION'
  | 'REJECTED_INFORMATION';

export type KnowledgeTechnicalCategory =
  | 'PINOUT'
  | 'POWER_GROUND'
  | 'SENSOR'
  | 'ACTUATOR'
  | 'CAN_BUS'
  | 'DTC'
  | 'GENERAL_BENCH';

export type KnowledgeReviewStatus =
  | 'APPROVED'
  | 'AWAITING_REVIEW'
  | 'CONFLICT_FLAGGED'
  | 'REJECTED';

export type KnowledgeSafetyClassification =
  | 'SAFE_REFERENCE'
  | 'CAUTION_VERIFY_MANUAL'
  | 'SAFETY_CRITICAL_LOCKED';

export type KnowledgeSyncStatus = 'LOCAL_ONLY' | 'SYNCED_CLOUD' | 'PENDING_SYNC';

export interface KnowledgeEcuApplicability {
  brandKey?: string;
  modelName?: string;
  connectorCode?: string;
  isUniversalTrainer: boolean;
}

export interface KnowledgeApprovalHistoryEntry {
  version: number;
  status: KnowledgeReviewStatus;
  classification: KnowledgeVerificationClassification;
  timestamp: number;
  note: string;
}

export interface AiDiagnosticResult {
  id: string;
  lang: BilingualLang;
  tierUsed: AiTierId;
  tierLabel: string;
  sourceProvenance: 'VERIFIED_ONLINE_AI' | 'LOCAL_VERIFIED_CACHE' | 'OFFLINE_VERIFIED_ENGINE' | 'CLARIFICATION_GATE';
  confidence: number;
  blockedByScoreGate: boolean;
  subject: string;
  conversationalSummary: string;
  cards: DiagnosticStepCard[];
  extractedTokens: string[];
  attemptTrail: AiTierAttemptLog[];
  cachedLocally: boolean;
  servedFromInteractionCache?: boolean;
  servedFromLocalKnowledgeDb?: boolean;
  localKnowledgeRecordId?: string;
  knowledgeClassification?: KnowledgeVerificationClassification;
  evidenceSource?:
    | 'PHYSICAL_INSTRUMENT'
    | 'ELECTRICAL_SIMULATION'
    | 'VERIFIED_OEM_DOCUMENTATION'
    | 'UNIVERSAL_TRAINER_REFERENCE'
    | 'LOCAL_TECHNICAL_KNOWLEDGE'
    | 'UNVERIFIED_AI_RESPONSE';
  evidenceStatus?: 'VALID' | 'STALE' | 'UNAVAILABLE' | 'UNRESOLVED' | 'UNVERIFIED';
  cacheHitCount?: number;
  benchSnapshotSummary: string;
  createdAt: number;
}

export interface VerifiedKnowledgeRecord {
  id: string;
  normalizedKey: string;
  subject: string;
  tokens: string[];
  lang: BilingualLang;
  sourceTier: AiTierId;
  confidence: number;
  safetyWarning: string;
  rootCauseSummary: string;
  verificationStep: string;
  rawAnswer: string;
  savedAtMs: number;
  /** Extended Master Specification fields (Sections 7, 8 & 10) */
  originalQuestion?: string;
  relatedQuestions?: string[];
  technicalCategory?: KnowledgeTechnicalCategory;
  ecuApplicability?: KnowledgeEcuApplicability;
  evidenceSource?:
    | 'PHYSICAL_INSTRUMENT'
    | 'ELECTRICAL_SIMULATION'
    | 'VERIFIED_OEM_DOCUMENTATION'
    | 'UNIVERSAL_TRAINER_REFERENCE'
    | 'LOCAL_TECHNICAL_KNOWLEDGE'
    | 'UNVERIFIED_AI_RESPONSE';
  evidenceStatus?: 'VALID' | 'STALE' | 'UNAVAILABLE' | 'UNRESOLVED' | 'UNVERIFIED';
  references?: string[];
  classification?: KnowledgeVerificationClassification;
  reviewStatus?: KnowledgeReviewStatus;
  safetyClassification?: KnowledgeSafetyClassification;
  reviewedAtMs?: number;
  version?: number;
  approvalHistory?: KnowledgeApprovalHistoryEntry[];
  conflictWithRecordId?: string;
  conflictReason?: string;
  syncStatus?: KnowledgeSyncStatus;
  hitCount?: number;
}

