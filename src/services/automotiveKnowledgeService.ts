/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { INITIAL_AUTOMOTIVE_CATALOG } from '../data/automotiveKnowledgeSeed';
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
  deduplicateCatalog,
  mergeOemManufacturersDeduplicated,
  parseStartMyCarOemCsv,
} from '../utils/oemManufacturerCsvImporter';

const STORAGE_KEY = 'autolab_automotive_knowledge_index_v1';

let cachedCatalog: AutomotiveKnowledgeCatalog | null = null;

function pickLatestIsoTimestamp(a?: string, b?: string): string {
  const aMs = a ? Date.parse(a) : Number.NaN;
  const bMs = b ? Date.parse(b) : Number.NaN;
  if (Number.isFinite(aMs) && Number.isFinite(bMs)) {
    return bMs >= aMs ? b! : a!;
  }
  if (Number.isFinite(bMs)) return b!;
  if (Number.isFinite(aMs)) return a!;
  return new Date().toISOString();
}

function buildEnrichedDefaultCatalog(): AutomotiveKnowledgeCatalog {
  const compiled = unifiedOemCompiledJson as unknown as {
    generatedAt?: string;
    manufacturers: ManufacturerRecord[];
    vehicleModelRecords: VehicleModelRecord[];
    knowledgeIndexEntries: RepairReferenceRecord[];
  };

  const mergedMfg = mergeOemManufacturersDeduplicated(
    INITIAL_AUTOMOTIVE_CATALOG.manufacturers,
    compiled.manufacturers || []
  );

  return deduplicateCatalog({
    ...INITIAL_AUTOMOTIVE_CATALOG,
    generatedAt: pickLatestIsoTimestamp(
      INITIAL_AUTOMOTIVE_CATALOG.generatedAt,
      compiled.generatedAt
    ),
    manufacturers: mergedMfg.manufacturers,
    vehicles: [
      ...INITIAL_AUTOMOTIVE_CATALOG.vehicles,
      ...(compiled.vehicleModelRecords || []),
    ],
    repairReferences: [
      ...INITIAL_AUTOMOTIVE_CATALOG.repairReferences,
      ...(compiled.knowledgeIndexEntries || []),
    ],
  });
}

function mergeWithBundledDefaults(
  stored: AutomotiveKnowledgeCatalog
): AutomotiveKnowledgeCatalog {
  const defaults = buildEnrichedDefaultCatalog();
  return deduplicateCatalog({
    ...defaults,
    ...stored,
    generatedAt: pickLatestIsoTimestamp(stored.generatedAt, defaults.generatedAt),
    manufacturers: [...(stored.manufacturers || []), ...defaults.manufacturers],
    vehicles: [...(stored.vehicles || []), ...defaults.vehicles],
    repairReferences: [...(stored.repairReferences || []), ...defaults.repairReferences],
    systems:
      stored.systems && stored.systems.length > 0 ? stored.systems : defaults.systems,
  });
}

export function resetAutomotiveKnowledgeCatalogCache(): void {
  cachedCatalog = null;
}

export function loadAutomotiveKnowledgeCatalog(): AutomotiveKnowledgeCatalog {
  if (cachedCatalog) return cachedCatalog;

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AutomotiveKnowledgeCatalog;
        if (parsed && parsed.repairReferences && parsed.vehicles) {
          const synced = mergeWithBundledDefaults(parsed);
          cachedCatalog = synced;
          return synced;
        }
      }
    }
  } catch {
    // Fallback to initial seed on corruption/error
  }

  cachedCatalog = buildEnrichedDefaultCatalog();
  return cachedCatalog;
}

export function saveAutomotiveKnowledgeCatalog(catalog: AutomotiveKnowledgeCatalog): void {
  const deduplicated = deduplicateCatalog(catalog);
  cachedCatalog = deduplicated;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deduplicated));
    }
  } catch (err) {
    console.error('Failed to persist automotive knowledge catalog to localStorage:', err);
  }
}

export interface KnowledgeSearchFilter {
  query?: string;
  make?: string;
  model?: string;
  year?: number;
  systemCategoryId?: SystemCategoryId | string;
  verifiedOnly?: boolean;
}

export interface ScoredReference {
  reference: RepairReferenceRecord;
  vehicle?: VehicleModelRecord;
  relevanceScore: number;
  matchReasons: string[];
}

export function searchAutomotiveKnowledge(filter: KnowledgeSearchFilter): ScoredReference[] {
  const catalog = loadAutomotiveKnowledgeCatalog();
  const q = (filter.query || '').toLowerCase().trim();
  const makeFilter = (filter.make || '').toLowerCase().trim();
  const modelFilter = (filter.model || '').toLowerCase().trim();
  const rawSystemCategory = (filter.systemCategoryId ? String(filter.systemCategoryId) : '').trim();
  const systemFilter =
    rawSystemCategory && rawSystemCategory.toLowerCase() !== 'all'
      ? normalizeSystemCategory(rawSystemCategory) || rawSystemCategory
      : null;

  const tokens = q.split(/\s+/).filter(Boolean);

  const results: ScoredReference[] = [];

  for (const ref of catalog.repairReferences) {
    const vehicle = catalog.vehicles.find((v) => v.id === ref.vehicleId);
    let score = 0;
    const reasons: string[] = [];

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

    // Verified only filter
    if (filter.verifiedOnly && !ref.verified) {
      continue;
    }

    // Token query search matching
    if (tokens.length > 0) {
      let matchedTokens = 0;
      const refText = `${ref.title} ${ref.summary} ${ref.make} ${ref.model} ${ref.years} ${ref.tags.join(' ')}`.toLowerCase();

      for (const t of tokens) {
        if (refText.includes(t)) {
          matchedTokens++;
          score += 5;
        }
      }

      if (matchedTokens === 0 && q) {
        // If query was specified but none of the tokens matched text fields, skip unless make/model already matched
        if (!makeFilter && !modelFilter && !systemFilter) {
          continue;
        }
      } else if (matchedTokens > 0) {
        reasons.push(`Matched ${matchedTokens}/${tokens.length} search tokens`);
      }
    } else {
      score += 5; // Base score for catalog entries when no query
    }

    // Source verification boost
    if (ref.verified && ref.source.verificationStatus === 'verified_source') {
      score += 10;
      reasons.push('Verified OEM source');
    }

    results.push({
      reference: ref,
      vehicle,
      relevanceScore: score,
      matchReasons: reasons,
    });
  }

  // Sort descending by relevance score
  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Retrieves up to 3 relevant verified references for AI diagnostic integration (aiRouter.ts).
 */
export function getRelevantReferencesForAiContext(params: {
  query: string;
  make?: string;
  model?: string;
  systemCategoryId?: string;
}): RepairReferenceRecord[] {
  const scored = searchAutomotiveKnowledge({
    query: params.query,
    make: params.make,
    model: params.model,
    systemCategoryId: params.systemCategoryId,
    verifiedOnly: true,
  });

  return scored.slice(0, 3).map((s) => s.reference);
}

export function exportCatalogToJson(): string {
  const catalog = loadAutomotiveKnowledgeCatalog();
  return JSON.stringify(catalog, null, 2);
}

export interface CatalogImportResult {
  success: boolean;
  error?: string;
  count?: number;
  addedManufacturers?: number;
  addedReferences?: number;
  duplicatesSkipped?: number;
}

export function importCatalogFromJson(jsonString: string): CatalogImportResult {
  try {
    const parsed = JSON.parse(jsonString) as AutomotiveKnowledgeCatalog;
    if (!parsed || !Array.isArray(parsed.repairReferences) || !Array.isArray(parsed.vehicles)) {
      return { success: false, error: 'Invalid JSON schema: missing repairReferences or vehicles array.' };
    }

    const current = loadAutomotiveKnowledgeCatalog();
    const beforeMfgCount = current.manufacturers.length;
    const beforeRefCount = current.repairReferences.length;

    const merged = deduplicateCatalog({
      ...current,
      ...parsed,
      generatedAt: pickLatestIsoTimestamp(current.generatedAt, parsed.generatedAt),
      manufacturers: [...current.manufacturers, ...(parsed.manufacturers || [])],
      vehicles: [...current.vehicles, ...parsed.vehicles],
      repairReferences: [...current.repairReferences, ...parsed.repairReferences],
      systems:
        parsed.systems && parsed.systems.length > 0 ? parsed.systems : current.systems,
    });

    const addedManufacturers = Math.max(0, merged.manufacturers.length - beforeMfgCount);
    const addedReferences = Math.max(0, merged.repairReferences.length - beforeRefCount);
    const incomingTotal =
      (parsed.manufacturers?.length || 0) + parsed.repairReferences.length;
    const duplicatesSkipped = Math.max(
      0,
      incomingTotal - (addedManufacturers + addedReferences)
    );

    saveAutomotiveKnowledgeCatalog(merged);
    return {
      success: true,
      count: merged.repairReferences.length,
      addedManufacturers,
      addedReferences,
      duplicatesSkipped,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export interface CsvOemImportResult {
  success: boolean;
  error?: string;
  addedCount: number;
  duplicateCount: number;
  ignoredNonOemCount: number;
  totalManufacturers: number;
}

export function importOemManufacturersFromCsv(csvText: string): CsvOemImportResult {
  try {
    const parsed = parseStartMyCarOemCsv(csvText);
    if (parsed.validOemLinksFound === 0) {
      return {
        success: false,
        error: 'No valid StartMyCar OEM manufacturer links (/pickmodel) found in CSV.',
        addedCount: 0,
        duplicateCount: 0,
        ignoredNonOemCount: parsed.ignoredNonOemRows,
        totalManufacturers: loadAutomotiveKnowledgeCatalog().manufacturers.length,
      };
    }

    const current = loadAutomotiveKnowledgeCatalog();
    const mergeResult = mergeOemManufacturersDeduplicated(
      current.manufacturers,
      parsed.manufacturers
    );

    const updatedCatalog: AutomotiveKnowledgeCatalog = {
      ...current,
      generatedAt: new Date().toISOString(),
      manufacturers: mergeResult.manufacturers,
    };
    saveAutomotiveKnowledgeCatalog(updatedCatalog);

    return {
      success: true,
      addedCount: mergeResult.addedCount,
      duplicateCount: parsed.inFileDuplicatesSkipped + mergeResult.duplicateCount,
      ignoredNonOemCount: parsed.ignoredNonOemRows,
      totalManufacturers: mergeResult.totalCount,
    };
  } catch (err) {
    return {
      success: false,
      error: String(err),
      addedCount: 0,
      duplicateCount: 0,
      ignoredNonOemCount: 0,
      totalManufacturers: loadAutomotiveKnowledgeCatalog().manufacturers.length,
    };
  }
}
