/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

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

const STORAGE_KEY = 'autolab_automotive_knowledge_index_v1';

let cachedCatalog: AutomotiveKnowledgeCatalog | null = null;

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

  return {
    ...INITIAL_AUTOMOTIVE_CATALOG,
    manufacturers: mergedManufacturers,
    vehicles: mergedVehicles,
    repairReferences: mergedRefs,
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
          cachedCatalog = parsed;
          return parsed;
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
  cachedCatalog = catalog;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
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
  const systemFilter = filter.systemCategoryId
    ? normalizeSystemCategory(String(filter.systemCategoryId)) || filter.systemCategoryId
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

export function importCatalogFromJson(jsonString: string): { success: boolean; error?: string; count?: number } {
  try {
    const parsed = JSON.parse(jsonString) as AutomotiveKnowledgeCatalog;
    if (!parsed || !Array.isArray(parsed.repairReferences) || !Array.isArray(parsed.vehicles)) {
      return { success: false, error: 'Invalid JSON schema: missing repairReferences or vehicles array.' };
    }
    saveAutomotiveKnowledgeCatalog(parsed);
    return { success: true, count: parsed.repairReferences.length };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
