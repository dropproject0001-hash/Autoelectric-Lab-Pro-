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
