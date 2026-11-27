/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type {
  AutomotiveKnowledgeCatalog,
  ManufacturerRecord,
  RepairReferenceRecord,
  VehicleModelRecord,
} from '../types/automotiveKnowledge';

const STARTMYCAR_PICKMODEL_URL_PATTERN =
  /^https?:\/\/(?:www\.)?startmycar\.com\/([a-z0-9-]+)\/pickmodel(?:[/?#].*)?$/i;

const CANONICAL_OEM_DISPLAY_NAMES: Record<string, string> = {
  'alfa-romeo': 'Alfa Romeo',
  'aston-martin': 'Aston Martin',
  baic: 'BAIC',
  bmw: 'BMW',
  byd: 'BYD',
  citroen: 'Citroën',
  dfsk: 'DFSK',
  ds: 'DS',
  gac: 'GAC',
  gmc: 'GMC',
  'great-wall': 'Great Wall',
  hsv: 'HSV',
  jac: 'JAC',
  jmc: 'JMC',
  jmev: 'JMEV',
  kyc: 'KYC',
  'land-rover': 'Land Rover',
  'lynk-co': 'Lynk & Co',
  'mercedes-benz': 'Mercedes-Benz',
  mg: 'MG',
  ram: 'RAM',
  ssangyong: 'SsangYong',
  swm: 'SWM',
};

export interface ParsedOemCsvResult {
  totalDataRows: number;
  validOemLinksFound: number;
  ignoredNonOemRows: number;
  inFileDuplicatesSkipped: number;
  manufacturers: ManufacturerRecord[];
}

export interface MergeOemManufacturersResult {
  manufacturers: ManufacturerRecord[];
  addedCount: number;
  duplicateCount: number;
  totalCount: number;
  addedSlugs: string[];
  duplicateSlugs: string[];
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&apos;|&#39;|&#x27;/gi, "'")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

export function normalizeCatalogUrl(url: string | undefined): string {
  if (!url) return '';
  return url.trim().toLowerCase().replace(/\/+$/, '');
}

export function formatMakeNameFromSlug(slug: string, rawAnchorText?: string): string {
  const normalizedSlug = slug.trim().toLowerCase();
  const decodedAnchor = decodeHtmlEntities(rawAnchorText || '');

  if (decodedAnchor.length > 0) {
    return decodedAnchor;
  }

  if (CANONICAL_OEM_DISPLAY_NAMES[normalizedSlug]) {
    return CANONICAL_OEM_DISPLAY_NAMES[normalizedSlug];
  }

  return normalizedSlug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * RFC-4180 compliant single-line / multi-line CSV row parser supporting quoted
 * commas and escaped double quotes ("").
 */
export function parseCsvRecords(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  const normalized = csvText.replace(/^\uFEFF/, '');

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const next = normalized[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField);
      currentField = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}

/**
 * Parses a StartMyCar links export CSV (`URL,Anchor Text,Rel,Type,Source`) and
 * extracts strictly valid, deduplicated OEM manufacturer directory records.
 * Non-OEM links (auth, legal, nav, external partner links, mailto) are excluded.
 */
export function parseStartMyCarOemCsv(csvText: string): ParsedOemCsvResult {
  const rows = parseCsvRecords(csvText);
  if (rows.length === 0) {
    return {
      totalDataRows: 0,
      validOemLinksFound: 0,
      ignoredNonOemRows: 0,
      inFileDuplicatesSkipped: 0,
      manufacturers: [],
    };
  }

  const headerRow = rows[0].map((col) => col.trim().toLowerCase());
  const urlColIdx = headerRow.findIndex((h) => h === 'url' || h === 'link' || h === 'href');
  const anchorColIdx = headerRow.findIndex(
    (h) => h === 'anchor text' || h === 'anchor' || h === 'make' || h === 'brand' || h === 'name'
  );

  const hasHeader = urlColIdx !== -1;
  const resolvedUrlIdx = hasHeader ? urlColIdx : 0;
  const resolvedAnchorIdx = hasHeader ? anchorColIdx : 1;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const seenSlugs = new Set<string>();
  const manufacturers: ManufacturerRecord[] = [];
  let validOemLinksFound = 0;
  let ignoredNonOemRows = 0;
  let inFileDuplicatesSkipped = 0;

  for (const row of dataRows) {
    const rawUrl = (row[resolvedUrlIdx] || '').trim();
    const rawAnchor = resolvedAnchorIdx >= 0 ? (row[resolvedAnchorIdx] || '').trim() : '';

    const match = rawUrl.match(STARTMYCAR_PICKMODEL_URL_PATTERN);
    if (!match) {
      ignoredNonOemRows += 1;
      continue;
    }

    validOemLinksFound += 1;
    const slug = match[1].trim().toLowerCase();

    if (seenSlugs.has(slug)) {
      inFileDuplicatesSkipped += 1;
      continue;
    }

    seenSlugs.add(slug);
    manufacturers.push({
      id: `m-${slug}`,
      make: formatMakeNameFromSlug(slug, rawAnchor),
      slug,
      catalogUrl: `https://www.startmycar.com/${slug}/pickmodel`,
      verified: false,
    });
  }

  return {
    totalDataRows: dataRows.length,
    validOemLinksFound,
    ignoredNonOemRows,
    inFileDuplicatesSkipped,
    manufacturers,
  };
}

/**
 * Merges incoming OEM manufacturer records into an existing list with strict
 * zero-duplication guarantees across canonical slug, id, and catalogUrl.
 * Existing verified records are always preserved untouched.
 */
export function mergeOemManufacturersDeduplicated(
  existing: ManufacturerRecord[],
  incoming: ManufacturerRecord[]
): MergeOemManufacturersResult {
  const seenSlugs = new Set<string>();
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const merged: ManufacturerRecord[] = [];

  for (const record of existing) {
    const slugKey = record.slug.trim().toLowerCase();
    const idKey = record.id.trim().toLowerCase();
    const urlKey = normalizeCatalogUrl(record.catalogUrl);

    if (!slugKey || seenSlugs.has(slugKey) || seenIds.has(idKey)) {
      continue;
    }

    seenSlugs.add(slugKey);
    seenIds.add(idKey);
    if (urlKey) seenUrls.add(urlKey);
    merged.push({
      ...record,
      slug: slugKey,
    });
  }

  const addedSlugs: string[] = [];
  const duplicateSlugs: string[] = [];

  for (const candidate of incoming) {
    const slugKey = candidate.slug.trim().toLowerCase();
    const idKey = (candidate.id || `m-${slugKey}`).trim().toLowerCase();
    const urlKey = normalizeCatalogUrl(candidate.catalogUrl);

    if (!slugKey) continue;

    if (seenSlugs.has(slugKey) || seenIds.has(idKey) || (urlKey && seenUrls.has(urlKey))) {
      duplicateSlugs.push(slugKey);
      continue;
    }

    seenSlugs.add(slugKey);
    seenIds.add(idKey);
    if (urlKey) seenUrls.add(urlKey);
    addedSlugs.push(slugKey);

    merged.push({
      id: candidate.id || `m-${slugKey}`,
      make: decodeHtmlEntities(candidate.make) || formatMakeNameFromSlug(slugKey),
      slug: slugKey,
      catalogUrl: candidate.catalogUrl,
      verified: Boolean(candidate.verified),
    });
  }

  return {
    manufacturers: merged,
    addedCount: addedSlugs.length,
    duplicateCount: duplicateSlugs.length,
    totalCount: merged.length,
    addedSlugs,
    duplicateSlugs,
  };
}

function buildVehicleDedupeSignature(v: VehicleModelRecord): string {
  return [
    v.makeSlug.trim().toLowerCase(),
    v.model.trim().toLowerCase(),
    (v.generation || '').trim().toLowerCase(),
    String(v.yearStart),
    String(v.yearEnd),
  ].join('|');
}

function buildReferenceDedupeSignature(r: RepairReferenceRecord): string {
  return [
    r.vehicleId.trim().toLowerCase(),
    r.systemCategoryId.trim().toLowerCase(),
    r.title.trim().toLowerCase(),
    normalizeCatalogUrl(r.source?.originalUrl),
  ].join('|');
}

/**
 * Enforces strict deduplication across all catalog tables (manufacturers,
 * vehicles, repairReferences) and recalculates catalog statistics.
 */
export function deduplicateCatalog(
  catalog: AutomotiveKnowledgeCatalog
): AutomotiveKnowledgeCatalog {
  const mfgResult = mergeOemManufacturersDeduplicated(catalog.manufacturers || [], []);

  const seenVehicleIds = new Set<string>();
  const seenVehicleSigs = new Set<string>();
  const dedupedVehicles: VehicleModelRecord[] = [];
  for (const v of catalog.vehicles || []) {
    const idKey = v.id.trim().toLowerCase();
    const sigKey = buildVehicleDedupeSignature(v);
    if (seenVehicleIds.has(idKey) || seenVehicleSigs.has(sigKey)) continue;
    seenVehicleIds.add(idKey);
    seenVehicleSigs.add(sigKey);
    dedupedVehicles.push(v);
  }

  const seenRefIds = new Set<string>();
  const seenRefSigs = new Set<string>();
  const dedupedRefs: RepairReferenceRecord[] = [];
  for (const r of catalog.repairReferences || []) {
    const idKey = r.id.trim().toLowerCase();
    const sigKey = buildReferenceDedupeSignature(r);
    if (seenRefIds.has(idKey) || seenRefSigs.has(sigKey)) continue;
    seenRefIds.add(idKey);
    seenRefSigs.add(sigKey);
    dedupedRefs.push(r);
  }

  const verifiedCount = dedupedRefs.filter((r) => r.verified).length;

  return {
    ...catalog,
    manufacturers: mfgResult.manufacturers,
    vehicles: dedupedVehicles,
    repairReferences: dedupedRefs,
    statistics: {
      manufacturerCount: mfgResult.manufacturers.length,
      vehicleCount: dedupedVehicles.length,
      referenceCount: dedupedRefs.length,
      verifiedCount,
      unverifiedCount: dedupedRefs.length - verifiedCount,
    },
  };
}
