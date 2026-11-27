/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import unifiedOemCompiledJson from '../data/unifiedOemCompiledKnowledge.json';
import {
  getAllFuseBoxInfoProfiles,
  getFuseBoxInfoManifest,
} from '../services/fuseBoxInfoKnowledgeService';
import {
  getAllIngestedVehicleProfiles,
  getStartMyCarManifest,
} from '../services/startMyCarKnowledgeService';
import type { AutomotiveKnowledgeCatalog } from '../types/automotiveKnowledge';

export type OemCorrelationFilterMode = 'ALL' | 'DUAL_OEM' | 'SINGLE_SOURCE';

export interface OemCorrelationMonitorRow {
  id: string;
  brand: string;
  makeSlug: string;
  model: string;
  modelSlug: string;
  displayModel: string;
  yearsLabel: string;
  yearStart: number;
  yearEnd: number;
  chassisCode: string;
  fbiCavities: number;
  fbiBoxCount: number;
  smcCavities: number | null;
  smcBoxCount: number;
  smcYear: number | null;
  correlatedCircuits: number;
  matchRatePercent: number | null;
  confidenceRating: 'DUAL_OEM_CONFIRMED' | 'SINGLE_SOURCE_VERIFIED';
  zeroFabricationIntegrity: boolean;
  fbiSourceUrl: string;
  smcSourceUrl: string | null;
}

export interface OemBrandCountSummary {
  brand: string;
  makeSlug: string;
  profileCount: number;
  dualOemCount: number;
  fbiCavities: number;
  smcCavities: number;
}

export interface OemTimestampSourceEntry {
  label: string;
  iso: string;
}

export interface OemDatabaseTimestampMetadata {
  latestIso: string | null;
  latestEpochMs: number | null;
  sourceLabel: string;
  formattedUtc: string;
  sources: OemTimestampSourceEntry[];
}

export interface OemCountingMonitorSnapshot {
  oemProfilesCount: number;
  brandCount: number;
  brands: OemBrandCountSummary[];
  fbiCavitiesMapped: number;
  smcFleetCavities: number;
  smcProfilesCount: number;
  totalCombinedCavities: number;
  totalFuseBoxesMapped: number;
  dualOemCorrelatedCount: number;
  singleSourceCount: number;
  totalCorrelatedCircuits: number;
  dualOemBaselineFbiCavities: number;
  overallMatchRatePercent: number;
  integrityPolicyPercent: number;
  zeroFabricationVerified: boolean;
  catalogReferenceCount: number;
  catalogVerifiedCount: number;
  catalogVehicleCount: number;
  catalogManufacturerCount: number;
  generatedAtIso: string;
  lastUpdatedMeta: OemDatabaseTimestampMetadata;
  rows: OemCorrelationMonitorRow[];
}

interface CompiledVehicleEntry {
  id: string;
  brand: string;
  makeSlug: string;
  model: string;
  modelSlug: string;
  yearsString: string;
  yearStart: number;
  yearEnd: number;
  chassisCode: string;
  confidenceRating: 'DUAL_OEM_CONFIRMED' | 'SINGLE_SOURCE_VERIFIED';
  dualOemCorrelatedCircuitsCount: number;
  totalCavities: number;
  provenance?: {
    fuseBoxInfo?: {
      sourceUrl?: string;
    };
    startMyCar?: {
      sourceUrl?: string;
    };
  };
}

interface UnifiedOemCompiledFile {
  generatedAt?: string;
  zeroFabricationIntegrity?: boolean;
  compiledVehicles?: CompiledVehicleEntry[];
}

function formatDisplayModel(brand: string, model: string, chassisCode: string): string {
  const isFacelift = /facelift/i.test(chassisCode) && !/facelift/i.test(model);
  return isFacelift ? `${brand} ${model} Facelift` : `${brand} ${model}`;
}

function formatShortChassis(chassisCode: string): string {
  const cleaned = (chassisCode || '').replace(/\s+facelift$/i, '').trim();
  return cleaned || '—';
}

const UTC_MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function formatOemLastUpdatedTimestamp(isoString: string | null | undefined): string {
  if (!isoString) return 'Unavailable';
  const parsedMs = Date.parse(isoString);
  if (!Number.isFinite(parsedMs)) return 'Unavailable';
  const d = new Date(parsedMs);
  const mon = UTC_MONTH_SHORT[d.getUTCMonth()];
  const day = String(d.getUTCDate()).padStart(2, '0');
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mon} ${day}, ${year} · ${hh}:${mm} UTC`;
}

export function resolveLatestOemKnowledgeTimestamp(overrides?: {
  unifiedGeneratedAt?: string;
  fuseBoxInfoGeneratedAt?: string;
  startMyCarGeneratedAt?: string;
  catalogGeneratedAt?: string;
}): OemDatabaseTimestampMetadata {
  const compiled = unifiedOemCompiledJson as unknown as UnifiedOemCompiledFile;
  const fbiManifest = getFuseBoxInfoManifest();
  const smcManifest = getStartMyCarManifest();

  const candidates: Array<{ label: string; iso?: string }> = [
    {
      label: 'Unified OEM Compiled',
      iso: overrides?.unifiedGeneratedAt ?? compiled.generatedAt,
    },
    {
      label: 'Fuse-Box.info Catalog',
      iso: overrides?.fuseBoxInfoGeneratedAt ?? fbiManifest.generatedAt,
    },
    {
      label: 'StartMyCar Catalog',
      iso: overrides?.startMyCarGeneratedAt ?? smcManifest.generatedAt,
    },
  ];

  if (overrides?.catalogGeneratedAt) {
    candidates.push({
      label: 'Active Knowledge Catalog',
      iso: overrides.catalogGeneratedAt,
    });
  }

  const validSources: OemTimestampSourceEntry[] = [];
  let latestEpochMs: number | null = null;
  let latestIso: string | null = null;
  let sourceLabel = 'Compiled OEM Metadata';

  for (const item of candidates) {
    if (!item.iso || typeof item.iso !== 'string') continue;
    const trimmed = item.iso.trim();
    const parsedMs = Date.parse(trimmed);
    if (!Number.isFinite(parsedMs)) continue;
    validSources.push({ label: item.label, iso: trimmed });
    if (latestEpochMs === null || parsedMs > latestEpochMs) {
      latestEpochMs = parsedMs;
      latestIso = trimmed;
      sourceLabel = item.label;
    }
  }

  return {
    latestIso,
    latestEpochMs,
    sourceLabel,
    formattedUtc: formatOemLastUpdatedTimestamp(latestIso),
    sources: validSources,
  };
}

export function buildOemCountingMonitorSnapshot(
  catalog?: Pick<AutomotiveKnowledgeCatalog, 'statistics'> & { generatedAt?: string } | null
): OemCountingMonitorSnapshot {
  const compiled = unifiedOemCompiledJson as unknown as UnifiedOemCompiledFile;
  const compiledVehicles = compiled.compiledVehicles ?? [];
  const fbiProfiles = getAllFuseBoxInfoProfiles();
  const smcProfiles = getAllIngestedVehicleProfiles();
  const fbiManifest = getFuseBoxInfoManifest();
  const smcManifest = getStartMyCarManifest();

  const compiledByKey = new Map<string, CompiledVehicleEntry>();
  for (const cv of compiledVehicles) {
    const key = `${cv.makeSlug.toLowerCase()}|${cv.modelSlug.toLowerCase()}|${cv.yearStart}|${cv.yearEnd}`;
    compiledByKey.set(key, cv);
  }

  let fbiCavitiesSum = 0;
  let fbiBoxSum = 0;
  let zeroFabValidCount = 0;
  let dualOemCount = 0;
  let totalCorrelatedCircuits = 0;
  let dualOemBaselineFbiCavities = 0;

  const brandMap = new Map<string, OemBrandCountSummary>();
  const rows: OemCorrelationMonitorRow[] = [];

  for (const fbi of fbiProfiles) {
    const makeSlug = fbi.identification.makeSlug.toLowerCase();
    const modelSlug = fbi.identification.modelSlug.toLowerCase();
    const yearStart = fbi.identification.yearStart;
    const yearEnd = fbi.identification.yearEnd;
    const lookupKey = `${makeSlug}|${modelSlug}|${yearStart}|${yearEnd}`;
    const compiledEntry = compiledByKey.get(lookupKey);

    const fbiCavities = fbi.powerDistribution.boxes.reduce(
      (sum, box) => sum + box.cavities.length,
      0
    );
    const fbiBoxCount = fbi.powerDistribution.boxes.length;
    fbiCavitiesSum += fbiCavities;
    fbiBoxSum += fbiBoxCount;

    const zeroFabOk = Boolean(fbi.provenance.zeroFabricationIntegrity);
    if (zeroFabOk) {
      zeroFabValidCount += 1;
    }

    const smcProfile =
      smcProfiles.find(
        (p) =>
          p.identification.makeSlug.toLowerCase() === makeSlug &&
          p.identification.modelSlug.toLowerCase() === modelSlug &&
          p.identification.year >= yearStart &&
          p.identification.year <= yearEnd
      ) || null;

    const smcCavities = smcProfile
      ? smcProfile.powerDistribution.boxes.reduce((sum, box) => sum + box.fuses.length, 0)
      : null;
    const smcBoxCount = smcProfile ? smcProfile.powerDistribution.boxes.length : 0;

    const correlatedCircuits = compiledEntry?.dualOemCorrelatedCircuitsCount ?? 0;
    const isDualOem =
      compiledEntry?.confidenceRating === 'DUAL_OEM_CONFIRMED' ||
      (smcProfile !== null && correlatedCircuits > 5);

    if (isDualOem) {
      dualOemCount += 1;
      totalCorrelatedCircuits += correlatedCircuits;
      dualOemBaselineFbiCavities += fbiCavities;
    }

    const matchRatePercent =
      isDualOem && fbiCavities > 0
        ? Math.min(100, Math.round((correlatedCircuits / fbiCavities) * 1000) / 10)
        : null;

    const rawChassis = compiledEntry?.chassisCode || fbi.identification.chassisCode || '';
    const brand = compiledEntry?.brand || fbi.identification.make;
    const model = compiledEntry?.model || fbi.identification.model;

    rows.push({
      id: compiledEntry?.id || `oem-fbi-${makeSlug}-${modelSlug}-${yearStart}-${yearEnd}`,
      brand,
      makeSlug,
      model,
      modelSlug,
      displayModel: formatDisplayModel(brand, model, rawChassis),
      yearsLabel: `${yearStart}-${yearEnd}`,
      yearStart,
      yearEnd,
      chassisCode: formatShortChassis(rawChassis),
      fbiCavities,
      fbiBoxCount,
      smcCavities,
      smcBoxCount,
      smcYear: smcProfile?.identification.year ?? null,
      correlatedCircuits,
      matchRatePercent,
      confidenceRating: isDualOem ? 'DUAL_OEM_CONFIRMED' : 'SINGLE_SOURCE_VERIFIED',
      zeroFabricationIntegrity: zeroFabOk,
      fbiSourceUrl: fbi.provenance.sourceUrl,
      smcSourceUrl:
        compiledEntry?.provenance?.startMyCar?.sourceUrl ||
        smcProfile?.provenance.sourceUrl ||
        null,
    });

    const existingBrand = brandMap.get(makeSlug);
    if (existingBrand) {
      existingBrand.profileCount += 1;
      if (isDualOem) existingBrand.dualOemCount += 1;
      existingBrand.fbiCavities += fbiCavities;
    } else {
      brandMap.set(makeSlug, {
        brand,
        makeSlug,
        profileCount: 1,
        dualOemCount: isDualOem ? 1 : 0,
        fbiCavities,
        smcCavities: 0,
      });
    }
  }

  let smcFleetCavitiesSum = 0;
  let smcBoxSum = 0;
  for (const smc of smcProfiles) {
    const smcCount = smc.powerDistribution.boxes.reduce((sum, box) => sum + box.fuses.length, 0);
    smcFleetCavitiesSum += smcCount;
    smcBoxSum += smc.powerDistribution.boxes.length;
    const slug = smc.identification.makeSlug.toLowerCase();
    const existingBrand = brandMap.get(slug);
    if (existingBrand) {
      existingBrand.smcCavities += smcCount;
    }
  }

  const oemProfilesCount = fbiProfiles.length;
  const fbiCavitiesMapped = fbiCavitiesSum || fbiManifest.totalCavitiesMapped;
  const smcFleetCavities = smcFleetCavitiesSum || smcManifest.totalFusesAndRelays;
  const overallMatchRatePercent =
    dualOemBaselineFbiCavities > 0
      ? Math.round((totalCorrelatedCircuits / dualOemBaselineFbiCavities) * 1000) / 10
      : 0;
  const integrityPolicyPercent =
    oemProfilesCount > 0 ? Math.round((zeroFabValidCount / oemProfilesCount) * 100) : 0;

  const lastUpdatedMeta = resolveLatestOemKnowledgeTimestamp({
    unifiedGeneratedAt: compiled.generatedAt,
    fuseBoxInfoGeneratedAt: fbiManifest.generatedAt,
    startMyCarGeneratedAt: smcManifest.generatedAt,
    catalogGeneratedAt: catalog?.generatedAt,
  });

  return {
    oemProfilesCount,
    brandCount: brandMap.size,
    brands: Array.from(brandMap.values()),
    fbiCavitiesMapped,
    smcFleetCavities,
    smcProfilesCount: smcProfiles.length,
    totalCombinedCavities: fbiCavitiesMapped + smcFleetCavities,
    totalFuseBoxesMapped: fbiBoxSum + smcBoxSum,
    dualOemCorrelatedCount: dualOemCount,
    singleSourceCount: Math.max(0, oemProfilesCount - dualOemCount),
    totalCorrelatedCircuits,
    dualOemBaselineFbiCavities,
    overallMatchRatePercent,
    integrityPolicyPercent,
    zeroFabricationVerified:
      integrityPolicyPercent === 100 && Boolean(compiled.zeroFabricationIntegrity),
    catalogReferenceCount: catalog?.statistics.referenceCount ?? 0,
    catalogVerifiedCount: catalog?.statistics.verifiedCount ?? 0,
    catalogVehicleCount: catalog?.statistics.vehicleCount ?? oemProfilesCount,
    catalogManufacturerCount: catalog?.statistics.manufacturerCount ?? brandMap.size,
    generatedAtIso: lastUpdatedMeta.latestIso || compiled.generatedAt || fbiManifest.generatedAt,
    lastUpdatedMeta,
    rows,
  };
}

export function filterOemCorrelationRows(
  rows: OemCorrelationMonitorRow[],
  options: {
    correlationFilter?: OemCorrelationFilterMode;
    makeSlug?: string;
    query?: string;
  }
): OemCorrelationMonitorRow[] {
  const mode = options.correlationFilter ?? 'ALL';
  const make = (options.makeSlug || 'all').toLowerCase().trim();
  const q = (options.query || '').toLowerCase().trim();

  return rows.filter((row) => {
    if (mode === 'DUAL_OEM' && row.confidenceRating !== 'DUAL_OEM_CONFIRMED') {
      return false;
    }
    if (mode === 'SINGLE_SOURCE' && row.confidenceRating !== 'SINGLE_SOURCE_VERIFIED') {
      return false;
    }
    if (make && make !== 'all' && row.makeSlug !== make) {
      return false;
    }
    if (q) {
      const hay =
        `${row.brand} ${row.model} ${row.displayModel} ${row.yearsLabel} ${row.chassisCode}`.toLowerCase();
      if (!hay.includes(q)) {
        return false;
      }
    }
    return true;
  });
}

export function summarizeCorrelationRows(rows: OemCorrelationMonitorRow[]): {
  profileCount: number;
  dualOemCount: number;
  fbiCavitiesTotal: number;
  smcPairedCavitiesTotal: number;
  correlatedCircuitsTotal: number;
  weightedMatchRatePercent: number | null;
} {
  let dualOemCount = 0;
  let fbiCavitiesTotal = 0;
  let smcPairedCavitiesTotal = 0;
  let correlatedCircuitsTotal = 0;
  let dualBaselineFbi = 0;

  for (const row of rows) {
    fbiCavitiesTotal += row.fbiCavities;
    if (row.smcCavities !== null) {
      smcPairedCavitiesTotal += row.smcCavities;
    }
    if (row.confidenceRating === 'DUAL_OEM_CONFIRMED') {
      dualOemCount += 1;
      correlatedCircuitsTotal += row.correlatedCircuits;
      dualBaselineFbi += row.fbiCavities;
    }
  }

  return {
    profileCount: rows.length,
    dualOemCount,
    fbiCavitiesTotal,
    smcPairedCavitiesTotal,
    correlatedCircuitsTotal,
    weightedMatchRatePercent:
      dualBaselineFbi > 0
        ? Math.round((correlatedCircuitsTotal / dualBaselineFbi) * 1000) / 10
        : null,
  };
}
