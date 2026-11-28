/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type {
  ArchiveOrgManualCategory,
  ArchiveOrgManualRecord,
  ArchiveOrgToyotaCatalogManifest,
} from '../types/archiveOrgIngestion';
import type {
  KnowledgeReferenceType,
  RepairReferenceRecord,
  SystemCategoryId,
  VehicleModelRecord,
} from '../types/automotiveKnowledge';
import catalogManifestJson from '../data/archiveorg/toyota/archiveOrgToyotaCatalog.json';

const CATALOG_MANIFEST = catalogManifestJson as unknown as ArchiveOrgToyotaCatalogManifest;

export function getArchiveOrgToyotaManifest(): ArchiveOrgToyotaCatalogManifest {
  return CATALOG_MANIFEST;
}

export function getAllArchiveOrgToyotaManuals(): ArchiveOrgManualRecord[] {
  return CATALOG_MANIFEST.records || [];
}

export interface ArchiveOrgToyotaSearchFilter {
  query?: string;
  modelSlug?: string;
  year?: number;
  category?: ArchiveOrgManualCategory;
  chassisCode?: string;
  engineCode?: string;
}

export interface ArchiveOrgToyotaSearchResult {
  record: ArchiveOrgManualRecord;
  score: number;
}

export function searchArchiveOrgToyotaManuals(
  filter: ArchiveOrgToyotaSearchFilter = {}
): ArchiveOrgToyotaSearchResult[] {
  const q = (filter.query || '').toLowerCase().trim();
  const modelFilter = (filter.modelSlug || '').toLowerCase().trim();
  const chassisFilter = (filter.chassisCode || '').toUpperCase().trim();
  const engineFilter = (filter.engineCode || '').toUpperCase().trim();
  const results: ArchiveOrgToyotaSearchResult[] = [];

  for (const rec of getAllArchiveOrgToyotaManuals()) {
    if (modelFilter && rec.modelSlug.toLowerCase() !== modelFilter) continue;
    if (filter.category && rec.category !== filter.category) continue;
    if (
      typeof filter.year === 'number' &&
      rec.yearStart !== null &&
      rec.yearEnd !== null &&
      (filter.year < rec.yearStart || filter.year > rec.yearEnd)
    ) {
      continue;
    }
    if (chassisFilter && !rec.chassisCodes.some((c) => c.toUpperCase() === chassisFilter)) {
      continue;
    }
    if (engineFilter && !rec.engineCodes.some((e) => e.toUpperCase() === engineFilter)) {
      continue;
    }

    let score = 10;
    if (q) {
      const hay = [
        rec.title,
        rec.model,
        rec.yearsLabel,
        rec.identifier,
        rec.category,
        rec.descriptionExcerpt,
        ...rec.chassisCodes,
        ...rec.engineCodes,
        ...rec.subjects,
      ]
        .join(' ')
        .toLowerCase();

      if (!hay.includes(q)) {
        const tokens = q.split(/\s+/).filter(Boolean);
        const matchedTokens = tokens.filter((t) => hay.includes(t));
        if (matchedTokens.length === 0) continue;
        score += matchedTokens.length * 5;
      } else {
        score += 25;
        if (rec.title.toLowerCase().includes(q)) score += 20;
        if (rec.model.toLowerCase().includes(q)) score += 15;
      }
    }

    // Prioritize repair/wiring/ECU manuals in tie-breaking
    if (rec.category === 'WIRING_DIAGRAM' || rec.category === 'ENGINE_ECU_MANUAL') score += 8;
    if (rec.category === 'REPAIR_SERVICE_MANUAL') score += 6;
    if (rec.pdfAssets.length > 0) score += 2;

    results.push({ record: rec, score });
  }

  return results.sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title));
}

export function getArchiveOrgToyotaManualsForVehicle(
  modelSlug: string,
  year?: number
): ArchiveOrgManualRecord[] {
  return searchArchiveOrgToyotaManuals({ modelSlug, year }).map((r) => r.record);
}

function mapCategoryToReferenceType(category: ArchiveOrgManualCategory): KnowledgeReferenceType {
  switch (category) {
    case 'WIRING_DIAGRAM':
      return 'wiring_diagram';
    case 'ENGINE_ECU_MANUAL':
      return 'fuel_injection';
    case 'REPAIR_SERVICE_MANUAL':
      return 'repair_manual';
    case 'OWNERS_MANUAL':
      return 'maintenance_manual';
    case 'NAVIGATION_AUDIO_MANUAL':
      return 'electrical_system';
    default:
      return 'service_manual';
  }
}

function normalizeArchiveSystemCategory(raw?: string): SystemCategoryId {
  switch (raw) {
    case 'engine_mechanical':
    case 'fuel_system':
    case 'electrical_charging':
    case 'engine_management_ecu':
    case 'transmission':
    case 'body_electrical':
    case 'safety_abs_srs':
    case 'diagnostics_obd_dtc':
    case 'maintenance':
      return raw;
    case 'wiring_diagrams':
    case 'fuses_relays':
      return 'electrical_charging';
    case 'ecu_ecm':
    case 'engine_management':
      return 'engine_management_ecu';
    case 'diagnostics_obd2':
      return 'diagnostics_obd_dtc';
    default:
      return 'body_electrical';
  }
}

/**
 * Converts Archive.org Toyota manual catalog entries into standard RepairReferenceRecord
 * objects for unified indexing in automotiveKnowledgeService (MiniSearch + AI orchestrator).
 * Strictly preserves UNVERIFIED / reference-only provenance (no fabricated specs).
 */
export function buildArchiveOrgToyotaRepairReferences(): RepairReferenceRecord[] {
  return getAllArchiveOrgToyotaManuals().map((rec) => {
    const primaryPdf = rec.pdfAssets[0];
    const pdfSummary =
      rec.pdfAssets.length > 0
        ? `PDF assets indexed: ${rec.pdfAssets.length}${
            primaryPdf?.pageCount ? ` (${primaryPdf.pageCount} pages)` : ''
          }.`
        : 'Archive.org reference item (see details URL).';

    const tags = Array.from(
      new Set([
        'archive.org',
        'toyota',
        rec.modelSlug,
        rec.category.toLowerCase(),
        ...rec.chassisCodes.map((c) => c.toLowerCase()),
        ...rec.engineCodes.map((e) => e.toLowerCase()),
        ...rec.subjects.slice(0, 5).map((s) => s.toLowerCase()),
      ])
    );

    const vehicleId =
      rec.modelSlug === 'general'
        ? 'v-archiveorg-toyota-general'
        : `v-archiveorg-toyota-${rec.modelSlug}`;

    const record: RepairReferenceRecord = {
      id: `ref-archiveorg-toyota-${rec.identifier.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`,
      vehicleId,
      make: 'Toyota',
      model: rec.model,
      years: rec.yearsLabel,
      systemCategoryId: normalizeArchiveSystemCategory(rec.systemCategories[0]),
      title: `${rec.title} [Archive.org OEM Reference]`,
      referenceType: mapCategoryToReferenceType(rec.category),
      summary: `${rec.descriptionExcerpt} ${pdfSummary} Source: ${rec.provenance.detailsUrl}`,
      source: {
        sourceName: 'Internet Archive (archive.org)',
        originalUrl: rec.provenance.detailsUrl,
        sourceType: 'archive_org_catalog_metadata',
        collectedAt: rec.provenance.crawledAt,
        pageCount: primaryPdf?.pageCount ?? undefined,
        language: rec.language || 'en',
        verificationStatus: 'source_metadata_only',
        confidenceScore: 0.45,
      },
      verified: false,
      tags,
      provenance: {
        sourceDocument: `archive.org/${rec.identifier}`,
        pageOrSection: `Search page ${CATALOG_MANIFEST.sourcePage} (${rec.category})`,
        revision: rec.yearsLabel,
        captureDate: rec.provenance.crawledAt,
        verificationStatus: 'CAPTURED',
        evidenceType: 'UNVERIFIED_DB',
        testConditions:
          'Catalog reference metadata only — verify pinouts/values against OEM manual before repair.',
        copyrightNotice: rec.provenance.copyrightNotice,
        versionHistory: [
          {
            version: 1,
            updatedAt: rec.provenance.crawledAt,
            actor: 'archive-org-ingestion-engine',
            lifecycleStatus: 'CAPTURED',
            changeSummary: `Cataloged from archive.org search page ${CATALOG_MANIFEST.sourcePage}`,
          },
        ],
      },
    };
    return record;
  });
}

export function buildArchiveOrgToyotaVehicleModels(): VehicleModelRecord[] {
  const seen = new Map<string, VehicleModelRecord>();
  for (const rec of getAllArchiveOrgToyotaManuals()) {
    if (rec.modelSlug === 'general') continue;
    const key = `toyota:${rec.modelSlug}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, {
        id: `v-archiveorg-toyota-${rec.modelSlug}`,
        makeSlug: 'toyota',
        make: 'Toyota',
        model: rec.model,
        generation: rec.chassisCodes[0] ?? null,
        yearStart: rec.yearStart ?? 1990,
        yearEnd: rec.yearEnd ?? 2025,
        market: 'Global / Multi-Market',
        engine: {
          engineCode: rec.engineCodes[0] ?? null,
          displacement: null,
          fuelType: 'Unknown',
          configuration: null,
        },
        transmission: {
          type: 'Unknown',
          code: null,
        },
        systems: rec.systemCategories.map((s) => normalizeArchiveSystemCategory(s)),
        sourceUrls: [rec.provenance.detailsUrl],
      });
    } else {
      if (rec.yearStart && rec.yearStart < existing.yearStart) existing.yearStart = rec.yearStart;
      if (rec.yearEnd && rec.yearEnd > existing.yearEnd) existing.yearEnd = rec.yearEnd;
      if (!existing.generation && rec.chassisCodes[0]) existing.generation = rec.chassisCodes[0];
      if (!existing.engine.engineCode && rec.engineCodes[0]) {
        existing.engine.engineCode = rec.engineCodes[0];
      }
      if (!existing.sourceUrls.includes(rec.provenance.detailsUrl)) {
        existing.sourceUrls.push(rec.provenance.detailsUrl);
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.model.localeCompare(b.model));
}
