/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import MiniSearch from 'minisearch';
import { INITIAL_AUTOMOTIVE_CATALOG, SYSTEM_CATEGORIES } from '../data/automotiveKnowledgeSeed';
import unifiedOemCompiledJson from '../data/unifiedOemCompiledKnowledge.json';
import {
  AutomotiveKnowledgeCatalog,
  ManufacturerRecord,
  RepairReferenceRecord,
  SystemCategoryId,
  VehicleModelRecord,
} from '../types/automotiveKnowledge';
import { normalizeSystemCategory } from '../utils/automotiveTaxonomy';
import {
  migrateCatalogV1ToV2,
  validateKnowledgeRecordProvenance,
} from './knowledgeMigrationService';

const STORAGE_KEY = 'autolab_automotive_knowledge_index_v1';

let cachedCatalog: AutomotiveKnowledgeCatalog | null = null;
let cachedSearchIndex: MiniSearch<{
  id: string;
  title: string;
  summary: string;
  make: string;
  model: string;
  partNumber: string;
  hardwareId: string;
  tags: string;
}> | null = null;

function rebuildSearchIndex(catalog: AutomotiveKnowledgeCatalog): void {
  const index = new MiniSearch({
    fields: ['title', 'summary', 'make', 'model', 'partNumber', 'hardwareId', 'tags'],
    storeFields: ['id'],
    searchOptions: {
      boost: { partNumber: 5, hardwareId: 4, title: 3, model: 2, make: 1.5 },
      prefix: true,
      fuzzy: 0.15,
    },
  });

  const docs = catalog.repairReferences
    .filter((r) => !r.deletedAt)
    .map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      make: r.make,
      model: r.model,
      partNumber: r.ecuIdentity?.partNumber || '',
      hardwareId: r.ecuIdentity?.hardwareId || '',
      tags: (r.tags || []).join(' '),
    }));

  index.addAll(docs);
  cachedSearchIndex = index;
}

function buildEnrichedDefaultCatalog(): AutomotiveKnowledgeCatalog {
  const compiled = unifiedOemCompiledJson as unknown as {
    manufacturers: ManufacturerRecord[];
    vehicleModelRecords: VehicleModelRecord[];
    knowledgeIndexEntries: RepairReferenceRecord[];
  };

  const manufacturerSlugs = new Set(INITIAL_AUTOMOTIVE_CATALOG.manufacturers.map((m) => m.slug.toLowerCase()));
  const mergedManufacturers: ManufacturerRecord[] = [...INITIAL_AUTOMOTIVE_CATALOG.manufacturers];
  for (const m of compiled.manufacturers || []) {
    if (!manufacturerSlugs.has(m.slug.toLowerCase())) {
      mergedManufacturers.push(m);
      manufacturerSlugs.add(m.slug.toLowerCase());
    }
  }

  const vehicleIds = new Set(INITIAL_AUTOMOTIVE_CATALOG.vehicles.map((v) => v.id));
  const mergedVehicles: VehicleModelRecord[] = [...INITIAL_AUTOMOTIVE_CATALOG.vehicles];
  for (const v of compiled.vehicleModelRecords || []) {
    if (!vehicleIds.has(v.id)) {
      mergedVehicles.push(v);
      vehicleIds.add(v.id);
    }
  }

  const refIds = new Set(INITIAL_AUTOMOTIVE_CATALOG.repairReferences.map((r) => r.id));
  const mergedRefs: RepairReferenceRecord[] = [...INITIAL_AUTOMOTIVE_CATALOG.repairReferences];
  for (const r of compiled.knowledgeIndexEntries || []) {
    if (!refIds.has(r.id)) {
      mergedRefs.push(r);
      refIds.add(r.id);
    }
  }

  const verifiedCount = mergedRefs.filter((r) => r.verified).length;

  const baseCatalog: AutomotiveKnowledgeCatalog = {
    ...INITIAL_AUTOMOTIVE_CATALOG,
    manufacturers: mergedManufacturers,
    vehicles: mergedVehicles,
    repairReferences: mergedRefs,
    statistics: {
      manufacturerCount: mergedManufacturers.length,
      vehicleCount: mergedVehicles.length,
      referenceCount: mergedRefs.length,
      verifiedCount,
      unverifiedCount: mergedRefs.length - verifiedCount,
    },
  };

  // Automatically hydrate v2 provenance, ECU identity, and version history non-destructively
  // while preserving schemaVersion ('1.1.0') for backward compatibility with existing consumers.
  const { migratedCatalog } = migrateCatalogV1ToV2(baseCatalog, baseCatalog.generatedAt);
  return {
    ...migratedCatalog,
    schemaVersion: baseCatalog.schemaVersion,
  };
}

export function loadAutomotiveKnowledgeCatalog(): AutomotiveKnowledgeCatalog {
  if (cachedCatalog) return cachedCatalog;

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AutomotiveKnowledgeCatalog;
        if (parsed && parsed.repairReferences && parsed.vehicles) {
          cachedCatalog =
            parsed.schemaVersion === '2.0'
              ? parsed
              : migrateCatalogV1ToV2(parsed, parsed.generatedAt).migratedCatalog;
          rebuildSearchIndex(cachedCatalog);
          return cachedCatalog;
        }
      }
    }
  } catch {
    // Fallback to initial seed on corruption/error
  }

  cachedCatalog = buildEnrichedDefaultCatalog();
  rebuildSearchIndex(cachedCatalog);
  return cachedCatalog;
}

export function saveAutomotiveKnowledgeCatalog(catalog: AutomotiveKnowledgeCatalog): void {
  cachedCatalog = catalog;
  rebuildSearchIndex(catalog);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
    }
  } catch (err) {
    console.error('Failed to persist automotive knowledge catalog to localStorage:', err);
  }
}

export function resetAutomotiveKnowledgeCacheForTests(): void {
  cachedCatalog = null;
  cachedSearchIndex = null;
}

export interface KnowledgeSearchFilter {
  query?: string;
  make?: string;
  model?: string;
  year?: number;
  systemCategoryId?: SystemCategoryId | string;
  verifiedOnly?: boolean;
  /** M1: Exact ECU part number lookup (ranked strictly above general matches) */
  ecuPartNumber?: string;
  /** M1: Exact hardware ID lookup */
  hardwareId?: string;
  /** M1: Exact software ID lookup */
  softwareId?: string;
  /** M5: Opt-in flag to include unverified / pending / captured records (default false when verifiedOnly is set) */
  includeUnverified?: boolean;
}

export type KnowledgeMatchTier =
  | 'EXACT_ECU_PART_NUMBER'
  | 'EXACT_HARDWARE_SOFTWARE_ID'
  | 'EXACT_VEHICLE_SYSTEM'
  | 'GENERAL_MATCH';

export interface ScoredReference {
  reference: RepairReferenceRecord;
  vehicle?: VehicleModelRecord;
  relevanceScore: number;
  matchReasons: string[];
  matchTier?: KnowledgeMatchTier;
  incompleteIdentificationDisclosure?: string;
}

export function searchAutomotiveKnowledge(filter: KnowledgeSearchFilter): ScoredReference[] {
  const catalog = loadAutomotiveKnowledgeCatalog();
  if (!cachedSearchIndex) {
    rebuildSearchIndex(catalog);
  }

  const q = (filter.query || '').toLowerCase().trim();
  const makeFilter = (filter.make || '').toLowerCase().trim();
  const modelFilter = (filter.model || '').toLowerCase().trim();
  const partFilter = (filter.ecuPartNumber || '').toLowerCase().trim();
  const hwFilter = (filter.hardwareId || '').toLowerCase().trim();
  const swFilter = (filter.softwareId || '').toLowerCase().trim();
  const systemFilter = filter.systemCategoryId
    ? normalizeSystemCategory(String(filter.systemCategoryId)) || filter.systemCategoryId
    : null;

  const tokens = q.split(/\s+/).filter(Boolean);

  // Use MiniSearch index to score full-text relevance quickly when a query is present
  const miniSearchBoostById = new Map<string, number>();
  if (q && cachedSearchIndex) {
    try {
      const hits = cachedSearchIndex.search(q);
      for (const hit of hits) {
        miniSearchBoostById.set(String(hit.id), Math.min(25, Math.round(hit.score * 2)));
      }
    } catch {
      // Fall back to direct token scan if query contains unusual characters
    }
  }

  const results: ScoredReference[] = [];

  for (const ref of catalog.repairReferences) {
    if (ref.deletedAt) continue;

    const lifecycle = ref.provenance?.verificationStatus;
    if (lifecycle === 'REJECTED' || lifecycle === 'SUPERSEDED') {
      continue;
    }

    const vehicle = catalog.vehicles.find((v) => v.id === ref.vehicleId);
    let score = 0;
    const reasons: string[] = [];
    let matchTier: KnowledgeMatchTier = 'GENERAL_MATCH';

    // Exact ECU part number / hardware / software ID check (ranked strictly above general matches)
    const refPart = (ref.ecuIdentity?.partNumber || '').toLowerCase().trim();
    const refHw = (ref.ecuIdentity?.hardwareId || '').toLowerCase().trim();
    const refSw = (ref.ecuIdentity?.softwareId || '').toLowerCase().trim();

    if (partFilter) {
      if (refPart && refPart === partFilter) {
        score += 100;
        matchTier = 'EXACT_ECU_PART_NUMBER';
        reasons.push(`Exact ECU part-number match (${ref.ecuIdentity?.partNumber})`);
      } else if (refPart && refPart.includes(partFilter)) {
        score += 45;
        reasons.push('Partial ECU part-number match');
      }
    }

    if (hwFilter && refHw && refHw === hwFilter) {
      score += 80;
      if (matchTier !== 'EXACT_ECU_PART_NUMBER') {
        matchTier = 'EXACT_HARDWARE_SOFTWARE_ID';
      }
      reasons.push(`Exact hardware ID match (${ref.ecuIdentity?.hardwareId})`);
    }

    if (swFilter && refSw && refSw === swFilter) {
      score += 70;
      if (matchTier !== 'EXACT_ECU_PART_NUMBER') {
        matchTier = 'EXACT_HARDWARE_SOFTWARE_ID';
      }
      reasons.push(`Exact software ID match (${ref.ecuIdentity?.softwareId})`);
    }

    // Filter by manufacturer make
    if (makeFilter && makeFilter !== 'all') {
      if (ref.make.toLowerCase() !== makeFilter && vehicle?.makeSlug.toLowerCase() !== makeFilter) {
        continue;
      } else {
        score += 10;
        reasons.push('Make match');
      }
    }

    // Filter by model
    if (modelFilter && modelFilter !== 'all') {
      if (!ref.model.toLowerCase().includes(modelFilter) && !vehicle?.model.toLowerCase().includes(modelFilter)) {
        continue;
      } else {
        score += 15;
        reasons.push('Model match');
      }
    }

    // Filter by year
    if (filter.year) {
      if (vehicle) {
        if (filter.year < vehicle.yearStart || filter.year > vehicle.yearEnd) {
          continue;
        } else {
          score += 10;
          reasons.push('Year range match');
        }
      }
    }

    // Filter by system category
    if (systemFilter) {
      if (ref.systemCategoryId !== systemFilter) {
        continue;
      } else {
        score += 20;
        reasons.push('System category match');
      }
    }

    // Verified only filter (also excludes CAPTURED/PENDING unless explicitly opted in)
    if (filter.verifiedOnly) {
      const isTrusted =
        ref.verified &&
        (!lifecycle || lifecycle === 'VERIFIED' || lifecycle === 'TECHNICIAN_CONFIRMED');
      if (!isTrusted && !filter.includeUnverified) {
        continue;
      }
    }

    if (
      matchTier === 'GENERAL_MATCH' &&
      makeFilter &&
      modelFilter &&
      systemFilter
    ) {
      matchTier = 'EXACT_VEHICLE_SYSTEM';
    }

    // Token query search matching + MiniSearch boost
    if (tokens.length > 0) {
      let matchedTokens = 0;
      const refText = `${ref.title} ${ref.summary} ${ref.make} ${ref.model} ${ref.years} ${ref.ecuIdentity?.partNumber || ''} ${ref.ecuIdentity?.hardwareId || ''} ${ref.tags.join(' ')}`.toLowerCase();

      for (const t of tokens) {
        if (refText.includes(t)) {
          matchedTokens++;
          score += 5;
        }
      }

      const indexBoost = miniSearchBoostById.get(ref.id) || 0;
      if (indexBoost > 0) {
        score += indexBoost;
      }

      if (matchedTokens === 0 && indexBoost === 0 && q) {
        if (!makeFilter && !modelFilter && !systemFilter && !partFilter) {
          continue;
        }
      } else if (matchedTokens > 0) {
        reasons.push(`Matched ${matchedTokens}/${tokens.length} search tokens`);
      }
    } else {
      score += 5;
    }

    // Source verification boost
    if (ref.verified && (ref.source.verificationStatus === 'verified_source' || lifecycle === 'VERIFIED')) {
      score += 10;
      reasons.push('Verified OEM source');
    }

    // Disclose incomplete ECU identification whenever exact partNumber/HW ID was not confirmed
    let incompleteIdentificationDisclosure: string | undefined;
    if (matchTier !== 'EXACT_ECU_PART_NUMBER' && matchTier !== 'EXACT_HARDWARE_SOFTWARE_ID') {
      if (partFilter && refPart !== partFilter) {
        incompleteIdentificationDisclosure = `Requested ECU part number "${filter.ecuPartNumber}" did not exactly match this record (${ref.ecuIdentity?.partNumber || 'unspecified part#'}). Never assume two ECUs are identical based on make/model alone.`;
      } else if (!ref.ecuIdentity?.partNumber) {
        incompleteIdentificationDisclosure =
          'Incomplete ECU identification: record does not pin an exact ECU part number or hardware/software revision. Confirm physical ECU label before bench probing.';
      }
    }

    results.push({
      reference: ref,
      vehicle,
      relevanceScore: score,
      matchReasons: reasons,
      matchTier,
      incompleteIdentificationDisclosure,
    });
  }

  // Sort strictly by exact-match precedence, then relevanceScore descending
  const tierRank: Record<KnowledgeMatchTier, number> = {
    EXACT_ECU_PART_NUMBER: 4,
    EXACT_HARDWARE_SOFTWARE_ID: 3,
    EXACT_VEHICLE_SYSTEM: 2,
    GENERAL_MATCH: 1,
  };

  return results.sort((a, b) => {
    const tDiff = tierRank[b.matchTier || 'GENERAL_MATCH'] - tierRank[a.matchTier || 'GENERAL_MATCH'];
    if (tDiff !== 0) return tDiff;
    return b.relevanceScore - a.relevanceScore;
  });
}

/**
 * Enforces provenance validation before upserting a record into the catalog.
 */
export function upsertKnowledgeRecordWithProvenance(
  record: RepairReferenceRecord,
  actor = 'system'
): { success: boolean; error?: string; record?: RepairReferenceRecord } {
  const validation = validateKnowledgeRecordProvenance(record);
  if (!validation.valid) {
    return {
      success: false,
      error: `Provenance validation failed. Missing required fields: ${validation.missingFields.join(', ')}`,
    };
  }

  const catalog = loadAutomotiveKnowledgeCatalog();
  const idx = catalog.repairReferences.findIndex((r) => r.id === record.id);
  const nowIso = new Date().toISOString();

  let saved: RepairReferenceRecord;
  if (idx >= 0) {
    const existing = catalog.repairReferences[idx];
    const nextVersion = (existing.recordVersion ?? 1) + 1;
    const prevHistory = existing.provenance?.versionHistory || [];
    saved = {
      ...record,
      recordVersion: nextVersion,
      provenance: {
        ...record.provenance!,
        versionHistory: [
          ...prevHistory,
          {
            version: nextVersion,
            updatedAt: nowIso,
            actor,
            lifecycleStatus: record.provenance!.verificationStatus,
            changeSummary: `Updated record v${nextVersion}`,
          },
        ],
      },
    };
    const nextRefs = [...catalog.repairReferences];
    nextRefs[idx] = saved;
    const verifiedCount = nextRefs.filter((r) => r.verified && !r.deletedAt).length;
    saveAutomotiveKnowledgeCatalog({
      ...catalog,
      repairReferences: nextRefs,
      statistics: {
        ...catalog.statistics,
        referenceCount: nextRefs.filter((r) => !r.deletedAt).length,
        verifiedCount,
        unverifiedCount: nextRefs.filter((r) => !r.deletedAt).length - verifiedCount,
      },
    });
  } else {
    saved = {
      ...record,
      recordVersion: record.recordVersion ?? 1,
      deletedAt: record.deletedAt ?? null,
    };
    const nextRefs = [...catalog.repairReferences, saved];
    const verifiedCount = nextRefs.filter((r) => r.verified && !r.deletedAt).length;
    saveAutomotiveKnowledgeCatalog({
      ...catalog,
      repairReferences: nextRefs,
      statistics: {
        ...catalog.statistics,
        referenceCount: nextRefs.filter((r) => !r.deletedAt).length,
        verifiedCount,
        unverifiedCount: nextRefs.filter((r) => !r.deletedAt).length - verifiedCount,
      },
    });
  }

  return { success: true, record: saved };
}

/**
 * Retrieves up to 3 relevant verified references for AI diagnostic integration.
 */
export function getRelevantReferencesForAiContext(params: {
  query: string;
  make?: string;
  model?: string;
  ecuPartNumber?: string;
  systemCategoryId?: string;
}): RepairReferenceRecord[] {
  const scored = searchAutomotiveKnowledge({
    query: params.query,
    make: params.make,
    model: params.model,
    ecuPartNumber: params.ecuPartNumber,
    systemCategoryId: params.systemCategoryId,
    verifiedOnly: true,
  });

  return scored.slice(0, 3).map((s) => s.reference);
}

export function exportCatalogToJson(): string {
  const catalog = loadAutomotiveKnowledgeCatalog();
  return JSON.stringify(catalog, null, 2);
}

export function importCatalogFromJson(jsonString: string): { success: boolean; error?: string; count?: number } {
  try {
    const parsed = JSON.parse(jsonString) as AutomotiveKnowledgeCatalog;
    if (!parsed || !Array.isArray(parsed.repairReferences) || !Array.isArray(parsed.vehicles)) {
      return { success: false, error: 'Invalid JSON schema: missing repairReferences or vehicles array.' };
    }
    const migrated =
      parsed.schemaVersion === '2.0'
        ? parsed
        : migrateCatalogV1ToV2(parsed, parsed.generatedAt).migratedCatalog;
    saveAutomotiveKnowledgeCatalog(migrated);
    return { success: true, count: migrated.repairReferences.length };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
