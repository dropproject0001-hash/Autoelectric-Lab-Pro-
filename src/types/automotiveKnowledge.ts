/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { VerificationStatus } from '../types/provenance';

export type AutomotiveMakeSlug = 'ford' | 'toyota' | 'nissan' | 'suzuki' | 'isuzu';

export interface ManufacturerRecord {
  id: string;
  make: string;
  slug: AutomotiveMakeSlug | string;
  catalogUrl?: string;
  verified: boolean;
}

export interface EngineVariant {
  engineCode: string | null;
  displacement: string | null;
  fuelType: 'Diesel' | 'Petrol' | 'Hybrid' | 'Electric' | 'Unknown';
  configuration: string | null;
}

export interface TransmissionVariant {
  type: 'Automatic' | 'Manual' | 'CVT' | 'DCT' | 'Unknown';
  code: string | null;
}

export interface VehicleModelRecord {
  id: string;
  makeSlug: string;
  make: string;
  model: string;
  generation: string | null;
  yearStart: number;
  yearEnd: number;
  market: string;
  engine: EngineVariant;
  transmission: TransmissionVariant;
  systems: string[];
  sourceUrls: string[];
}

export type SystemCategoryId =
  | 'engine_mechanical'
  | 'fuel_system'
  | 'electrical_charging'
  | 'engine_management_ecu'
  | 'transmission'
  | 'body_electrical'
  | 'safety_abs_srs'
  | 'diagnostics_obd_dtc'
  | 'maintenance';

export interface SystemCategoryRecord {
  id: SystemCategoryId;
  name: string;
  description: string;
  aliases: string[];
}

export type KnowledgeReferenceType =
  | 'service_manual'
  | 'repair_manual'
  | 'wiring_diagram'
  | 'electrical_system'
  | 'fuel_injection'
  | 'maintenance_manual'
  | 'training_guide'
  | 'bodywork';

export interface SourceMetadata {
  sourceName: string;
  originalUrl: string;
  sourceType: string;
  collectedAt: string;
  pageCount?: number;
  language: string;
  verificationStatus: VerificationStatus | 'verified_source' | 'source_metadata_only' | 'unverified';
  confidenceScore: number;
}

/**
 * 6-Tier Evidence Hierarchy (Master Developer Instruction v1.1, Section 5).
 * Every automotive answer and knowledge record carries an explicit evidence tier.
 */
export type EvidenceHierarchyLevel =
  | 'VERIFIED_OEM'
  | 'TECHNICIAN_CONFIRMED'
  | 'UNVERIFIED_DB'
  | 'GENERAL_AI'
  | 'SIMULATED_RESULT'
  | 'USER_MEASUREMENT';

/**
 * 6-State Knowledge Lifecycle Status (Master Developer Instruction v1.1, Section 8).
 */
export type KnowledgeLifecycleStatus =
  | 'CAPTURED'
  | 'PENDING'
  | 'VERIFIED'
  | 'TECHNICIAN_CONFIRMED'
  | 'REJECTED'
  | 'SUPERSEDED';

export interface EcuComponentIdentity {
  manufacturer: string;
  ecuModel?: string | null;
  partNumber?: string | null;
  hardwareId?: string | null;
  softwareId?: string | null;
  engineCode?: string | null;
  connectorId?: string | null;
  componentName?: string | null;
}

export interface KnowledgeVersionHistoryEntry {
  version: number;
  updatedAt: string;
  actor: string;
  lifecycleStatus: KnowledgeLifecycleStatus;
  changeSummary: string;
}

export interface RecordProvenanceEnvelope {
  sourceDocument: string;
  pageOrSection: string;
  revision: string;
  captureDate: string;
  verificationStatus: KnowledgeLifecycleStatus;
  evidenceType: EvidenceHierarchyLevel;
  testConditions: string;
  versionHistory: KnowledgeVersionHistoryEntry[];
  copyrightNotice?: string;
}

export interface ElectricalSpecClaim {
  pinNumber?: string;
  signalName?: string;
  voltageRange?: string;
  resistanceRange?: string;
  frequencyRange?: string;
  testCondition?: string;
}

export interface RepairReferenceRecord {
  id: string;
  vehicleId: string;
  make: string;
  model: string;
  years: string;
  systemCategoryId: SystemCategoryId;
  title: string;
  referenceType: KnowledgeReferenceType;
  summary: string;
  source: SourceMetadata;
  tags: string[];
  verified: boolean;
  /** M1 Structured ECU / component identity for exact-match-first lookup */
  ecuIdentity?: EcuComponentIdentity;
  /** M1 Mandatory provenance, lifecycle, test conditions & version history */
  provenance?: RecordProvenanceEnvelope;
  /** Optional structured electrical specs extracted from verified records */
  electricalSpecs?: ElectricalSpecClaim[];
  /** Monotonic record version for incremental sync */
  recordVersion?: number;
  /** Soft-delete tombstone for incremental sync propagation */
  deletedAt?: string | null;
}

export interface AutomotiveKnowledgeCatalog {
  schemaVersion: string;
  databaseName: string;
  generatedAt: string;
  manufacturers: ManufacturerRecord[];
  vehicles: VehicleModelRecord[];
  systems: SystemCategoryRecord[];
  repairReferences: RepairReferenceRecord[];
  statistics: {
    manufacturerCount: number;
    vehicleCount: number;
    referenceCount: number;
    verifiedCount: number;
    unverifiedCount: number;
  };
}

export interface ImportJobRecord {
  jobId: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'completed_with_errors' | 'failed';
  pagesAttempted: number;
  pagesOk: number;
  pagesFailed: number;
  errorLog: string[];
}
