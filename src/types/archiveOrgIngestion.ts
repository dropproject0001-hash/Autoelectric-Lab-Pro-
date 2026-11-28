/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { IngestionVerificationTier } from './startMyCarIngestion';
import type { SystemCategoryId } from './automotiveKnowledge';

export type ArchiveOrgManualCategory =
  | 'WIRING_DIAGRAM'
  | 'REPAIR_SERVICE_MANUAL'
  | 'ENGINE_ECU_MANUAL'
  | 'OWNERS_MANUAL'
  | 'NAVIGATION_AUDIO_MANUAL'
  | 'PARTS_CATALOG'
  | 'TECHNICAL_BULLETIN'
  | 'OTHER_AUTOMOTIVE';

export interface ArchiveOrgPdfAsset {
  fileName: string;
  format: string;
  sizeBytes: number | null;
  pageCount: number | null;
  downloadUrl: string;
}

export interface ArchiveOrgManualRecord {
  identifier: string;
  title: string;
  make: 'Toyota';
  makeSlug: 'toyota';
  model: string;
  modelSlug: string;
  chassisCodes: string[];
  engineCodes: string[];
  yearStart: number | null;
  yearEnd: number | null;
  yearsLabel: string;
  category: ArchiveOrgManualCategory;
  systemCategories: SystemCategoryId[];
  creator: string | null;
  publisher: string | null;
  language: string | null;
  licenseUrl: string | null;
  downloads: number | null;
  itemSizeBytes: number | null;
  subjects: string[];
  descriptionExcerpt: string;
  pdfAssets: ArchiveOrgPdfAsset[];
  provenance: {
    sourceSite: 'archive.org';
    sourceSearchUrl: string;
    detailsUrl: string;
    metadataApiUrl: string;
    crawledAt: string;
    tier: IngestionVerificationTier;
    evidenceType: 'UNVERIFIED_DATABASE_RECORD';
    copyrightNotice: 'Reference metadata and short catalog excerpt only; full PDF remains hosted on archive.org.';
  };
}

export interface ArchiveOrgFilteredOutItem {
  identifier: string;
  title: string;
  mediatype: string;
  reason: string;
}

export interface ArchiveOrgToyotaCatalogManifest {
  schemaVersion: '1.0.0';
  sourceSite: 'archive.org';
  sourceQuery: string;
  sourcePage: number;
  sourceSearchUrl: string;
  apiEndpoint: string;
  generatedAt: string;
  zeroFabricationIntegrity: true;
  totalSearchHitsReported: number;
  rawPageDocsFetched: number;
  automotiveManualsIngested: number;
  filteredOutNonAutomotiveCount: number;
  totalPdfAssetsIndexed: number;
  modelsDiscovered: string[];
  categoriesBreakdown: Record<ArchiveOrgManualCategory, number>;
  records: ArchiveOrgManualRecord[];
  filteredOutItems: ArchiveOrgFilteredOutItem[];
}
