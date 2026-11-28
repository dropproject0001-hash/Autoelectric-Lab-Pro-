/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  ArchiveOrgFilteredOutItem,
  ArchiveOrgManualCategory,
  ArchiveOrgManualRecord,
  ArchiveOrgPdfAsset,
  ArchiveOrgToyotaCatalogManifest,
} from '../../src/types/archiveOrgIngestion';
import type { SystemCategoryId } from '../../src/types/automotiveKnowledge';

const SOURCE_QUERY = 'Toyota manual pdf';
const SOURCE_PAGE = 2;
const ROWS_PER_PAGE = 50;
const SOURCE_SEARCH_URL = `https://archive.org/search?tab=all&query=Toyota+manual+pdf&page=${SOURCE_PAGE}`;
const SEARCH_API_URL =
  `https://archive.org/advancedsearch.php?q=Toyota+manual+pdf` +
  `&fl[]=identifier,title,creator,publisher,year,date,mediatype,subject,description,language,downloads,item_size,licenseurl` +
  `&rows=${ROWS_PER_PAGE}&page=${SOURCE_PAGE}&output=json`;

const USER_AGENT = 'AutoElectricLabPro/1.0 (+https://autoelectriclab-pro.vercel.app; OEM Reference Cataloger)';

interface RawArchiveSearchDoc {
  identifier?: string;
  title?: string | string[];
  creator?: string | string[];
  publisher?: string | string[];
  year?: string | number;
  date?: string;
  mediatype?: string;
  subject?: string | string[];
  description?: string | string[];
  language?: string | string[];
  downloads?: number;
  item_size?: number;
  licenseurl?: string;
}

interface RawArchiveMetadataFile {
  name?: string;
  format?: string;
  size?: string | number;
  page_count?: string | number;
}

interface RawArchiveMetadataResponse {
  metadata?: {
    identifier?: string;
    title?: string | string[];
    creator?: string | string[];
    publisher?: string | string[];
    year?: string | number;
    date?: string;
    mediatype?: string;
    subject?: string | string[];
    description?: string | string[];
    language?: string | string[];
    licenseurl?: string;
    imagecount?: string | number;
  };
  files?: RawArchiveMetadataFile[];
}

const NON_AUTOMOTIVE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bsewing\s+machine\b|\boverlock\b|\bserger\b|\bknitting\s+machine\b|\bembroidery\b|\bquilt/i, reason: 'Non-automotive textile/sewing machine manual' },
  { pattern: /\btoyota\s+(?:830|858|895|900|901|906|907|910|920|930|940|950|960|980|rs2000|eco\s*15|super\s*jeans|sp10|sp20|sl3314|sl3335|sl3487|es121|jfs18|oekaki)\b/i, reason: 'Toyota domestic sewing/knitting machine model' },
  { pattern: /\bforklift\b|\bpallet\s+jack\b|\bstacker\b|\breach\s+truck\b|\bmaterial\s+handling\b|\b8fgu\b|\b7fgu\b|\b8fgcu\b/i, reason: 'Industrial forklift/material-handling equipment (out of passenger/light-truck automotive scope)' },
  { pattern: /\bpodcast\b|\bepisode\b|\btech\s+guy\b|\bnewspaper\b|\bmagazine\s+issue\b/i, reason: 'Non-manual media/periodical' },
];

const TOYOTA_MODEL_PATTERNS: Array<{ name: string; slug: string; pattern: RegExp }> = [
  { name: 'Camry Solara', slug: 'camry-solara', pattern: /\b(?:camry\s+)?solara\b/i },
  { name: 'Land Cruiser', slug: 'land-cruiser', pattern: /\bland\s*cruiser\b|\bprado\b/i },
  { name: 'FJ Cruiser', slug: 'fj-cruiser', pattern: /\bfj\s*cruiser\b/i },
  { name: 'Grand Highlander', slug: 'grand-highlander', pattern: /\bgrand\s+highlander\b/i },
  { name: 'Corolla Cross', slug: 'corolla-cross', pattern: /\bcorolla\s+cross\b/i },
  { name: 'Corolla', slug: 'corolla', pattern: /\bcorolla\b/i },
  { name: 'Camry', slug: 'camry', pattern: /\bcamry\b/i },
  { name: 'Hilux', slug: 'hilux', pattern: /\bhilux\b|\bhi-lux\b/i },
  { name: 'RAV4', slug: 'rav4', pattern: /\brav\s*4\b/i },
  { name: 'Tacoma', slug: 'tacoma', pattern: /\btacoma\b/i },
  { name: 'Tundra', slug: 'tundra', pattern: /\btundra\b/i },
  { name: '4Runner', slug: '4runner', pattern: /\b4\s*runner\b|\b4runner\b/i },
  { name: 'Prius', slug: 'prius', pattern: /\bprius\b/i },
  { name: 'Sienna', slug: 'sienna', pattern: /\bsienna\b/i },
  { name: 'Avalon', slug: 'avalon', pattern: /\bavalon\b/i },
  { name: 'Highlander', slug: 'highlander', pattern: /\bhighlander\b|\bkluger\b/i },
  { name: 'Yaris', slug: 'yaris', pattern: /\byaris\b|\bvitz\b/i },
  { name: 'Vios', slug: 'vios', pattern: /\bvios\b/i },
  { name: 'Fortuner', slug: 'fortuner', pattern: /\bfortuner\b/i },
  { name: 'Innova', slug: 'innova', pattern: /\binnova\b/i },
  { name: 'MR2', slug: 'mr2', pattern: /\bmr2\b|\bmr-2\b/i },
  { name: 'Supra', slug: 'supra', pattern: /\bsupra\b/i },
  { name: 'Celica', slug: 'celica', pattern: /\bcelica\b/i },
  { name: 'Tercel', slug: 'tercel', pattern: /\btercel\b/i },
  { name: 'Paseo', slug: 'paseo', pattern: /\bpaseo\b/i },
  { name: 'Sequoia', slug: 'sequoia', pattern: /\bsequoia\b/i },
  { name: 'Matrix', slug: 'matrix', pattern: /\bmatrix\b/i },
  { name: 'Venza', slug: 'venza', pattern: /\bvenza\b/i },
  { name: 'C-HR', slug: 'c-hr', pattern: /\bc-hr\b|\bchr\b/i },
  { name: '86 / GR86', slug: 'gr86', pattern: /\bgr86\b|\bgt86\b|\btoyota\s+86\b/i },
  { name: 'Echo', slug: 'echo', pattern: /\becho\b/i },
  { name: 'Previa', slug: 'previa', pattern: /\bprevia\b|\bestima\b/i },
  { name: 'HiAce', slug: 'hiace', pattern: /\bhiace\b|\bhi-ace\b/i },
  { name: 'Avensis', slug: 'avensis', pattern: /\bavensis\b/i },
  { name: 'Auris', slug: 'auris', pattern: /\bauris\b/i },
  { name: 'Aygo', slug: 'aygo', pattern: /\baygo\b/i },
  { name: 'Crown', slug: 'crown', pattern: /\bcrown\b/i },
  { name: 'Cressida', slug: 'cressida', pattern: /\bcressida\b/i },
  { name: 'Starlet', slug: 'starlet', pattern: /\bstarlet\b/i },
  { name: 'Mirai', slug: 'mirai', pattern: /\bmirai\b/i },
  { name: 'bZ4X', slug: 'bz4x', pattern: /\bbz4x\b/i },
  { name: 'T100', slug: 't100', pattern: /\bt100\b/i },
  { name: 'Pickup / Truck', slug: 'pickup-truck', pattern: /\bpickup\b|\btruck\b/i },
];

const CHASSIS_CODE_REGEX =
  /\b(?:AE86|AE92|AE101|AE111|E120|E140|E150|E170|E210|XV10|XV20|XV30|XV40|XV50|XV70|XA10|XA20|XA30|XA40|XA50|AN120|AN130|GUN125|GUN126|KUN25|KUN26|LN106|RN85|KZN130|JZA70|JZA80|SW20|AW11|ZZW30|FJ40|FJ60|FJ62|FJ80|FZJ80|HDJ80|UZJ100|VDJ200|GRJ150|NZE121|ZZE122|ZRE152|ZRE172|NHW20|ZVW30|ZVW50|GSU40|ACV40|ASV50|AXVH70|GSX30|MCX20|MCV20|MCV30|ST185|ST205|ZZT231|NCP91|NCP131|XP90|XP130|XP210|MXPA10)\b/gi;

const ENGINE_CODE_REGEX =
  /\b(?:1NZ-FE|2NZ-FE|1ZZ-FE|2ZZ-GE|1ZR-FE|2ZR-FE|2ZR-FXE|1AZ-FE|2AZ-FE|2AR-FE|2AR-FXE|A25A-FXS|A25A-FKS|M20A-FKS|1GR-FE|2GR-FE|2GR-FKS|3GR-FE|1MZ-FE|3MZ-FE|1UZ-FE|2UZ-FE|3UZ-FE|3UR-FE|1JZ-GTE|2JZ-GE|2JZ-GTE|4A-GE|4A-FE|5A-FE|7A-FE|3S-FE|3S-GE|3S-GTE|5S-FE|22R-E|22R|3VZ-E|5VZ-FE|1TR-FE|2TR-FE|1KD-FTV|2KD-FTV|1GD-FTV|2GD-FTV|1HZ|1HD-T|1HD-FTE|2L-T|3L|5L-E|1NR-FE|2NR-FE|3NR-FE)\b/gi;

function toSingleString(val: string | string[] | number | undefined): string {
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) return val.map((v) => String(v || '').trim()).filter(Boolean).join('; ');
  return String(val).trim();
}

function toStringArray(val: string | string[] | undefined): string[] {
  if (!val) return [];
  const arr = Array.isArray(val) ? val : [val];
  const out: string[] = [];
  for (const item of arr) {
    for (const part of String(item || '').split(/[;,]/)) {
      const clean = part.trim();
      if (clean && !out.includes(clean)) out.push(clean);
    }
  }
  return out;
}

function stripHtmlAndTruncate(raw: string, maxLen = 320): string {
  const clean = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 'Internet Archive cataloged Toyota reference PDF (see archive.org details URL for full document).';
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trimEnd()}…`;
}

export function classifyNonAutomotive(
  title: string,
  description: string,
  subjects: string[],
  mediatype: string
): string | null {
  if (mediatype && mediatype.toLowerCase() !== 'texts') {
    return `Unsupported mediatype "${mediatype}" (only "texts" manuals indexed)`;
  }
  const combined = `${title} ${description} ${subjects.join(' ')}`;
  for (const rule of NON_AUTOMOTIVE_PATTERNS) {
    if (rule.pattern.test(combined)) {
      return rule.reason;
    }
  }
  // Must actually reference Toyota in title, description, or subjects
  if (!/\btoyota\b/i.test(combined)) {
    return 'Does not reference Toyota in title, description, or subjects';
  }
  return null;
}

export function extractToyotaModel(title: string, description: string, subjects: string[]): { model: string; modelSlug: string } {
  const titleFirst = title;
  for (const entry of TOYOTA_MODEL_PATTERNS) {
    if (entry.pattern.test(titleFirst)) {
      return { model: entry.name, modelSlug: entry.slug };
    }
  }
  const rest = `${description} ${subjects.join(' ')}`;
  for (const entry of TOYOTA_MODEL_PATTERNS) {
    if (entry.pattern.test(rest)) {
      return { model: entry.name, modelSlug: entry.slug };
    }
  }
  return { model: 'Multi-Model / General', modelSlug: 'general' };
}

export function extractModelYears(
  title: string,
  description: string,
  metaYear: string | number | undefined
): { yearStart: number | null; yearEnd: number | null; yearsLabel: string } {
  const currentMaxYear = 2026;
  const minYear = 1960;

  // Handle common typo like "02010" -> 2010 in titles
  const normalizedTitle = title.replace(/\b0((?:19|20)\d{2})\b/g, '$1');
  const titleYears = [...normalizedTitle.matchAll(/\b(19[6-9]\d|20[0-2]\d)\b/g)]
    .map((m) => Number(m[1]))
    .filter((y) => y >= minYear && y <= currentMaxYear);

  if (titleYears.length >= 2) {
    const start = Math.min(...titleYears);
    const end = Math.max(...titleYears);
    return {
      yearStart: start,
      yearEnd: end,
      yearsLabel: start === end ? String(start) : `${start}-${end}`,
    };
  }
  if (titleYears.length === 1) {
    return { yearStart: titleYears[0], yearEnd: titleYears[0], yearsLabel: String(titleYears[0]) };
  }

  const descYears = [...description.matchAll(/\b(19[6-9]\d|20[0-2]\d)\b/g)]
    .map((m) => Number(m[1]))
    .filter((y) => y >= minYear && y <= currentMaxYear);
  if (descYears.length > 0) {
    const start = Math.min(...descYears);
    const end = Math.max(...descYears);
    return {
      yearStart: start,
      yearEnd: end,
      yearsLabel: start === end ? String(start) : `${start}-${end}`,
    };
  }

  const parsedMeta = Number(String(metaYear || '').slice(0, 4));
  if (Number.isInteger(parsedMeta) && parsedMeta >= minYear && parsedMeta <= currentMaxYear) {
    return { yearStart: parsedMeta, yearEnd: parsedMeta, yearsLabel: String(parsedMeta) };
  }

  return { yearStart: null, yearEnd: null, yearsLabel: 'Unspecified Year' };
}

export function classifyManualCategory(
  title: string,
  description: string,
  subjects: string[]
): { category: ArchiveOrgManualCategory; systemCategories: SystemCategoryId[] } {
  const combined = `${title} ${description} ${subjects.join(' ')}`;

  if (/\bwiring\b|\bewd\b|\belectrical\s+wiring\b|\bschematic\b|\bcircuit\s+diagram\b/i.test(combined)) {
    return {
      category: 'WIRING_DIAGRAM',
      systemCategories: ['electrical_charging', 'body_electrical', 'engine_management_ecu'],
    };
  }
  if (/\becu\b|\becm\b|\bengine\s+control\b|\befi\b|\bfuel\s+injection\b|\bengine\s+repair\b|\bpowertrain\b/i.test(combined)) {
    return {
      category: 'ENGINE_ECU_MANUAL',
      systemCategories: ['engine_management_ecu', 'diagnostics_obd_dtc', 'fuel_system'],
    };
  }
  if (/\brepair\s+manual\b|\bservice\s+manual\b|\bworkshop\s+manual\b|\bfactory\s+service\b|\bfsm\b|\bpds\s+manual\b|\bpre-?delivery\b|\bdiagnostic\b/i.test(combined)) {
    return {
      category: 'REPAIR_SERVICE_MANUAL',
      systemCategories: ['engine_management_ecu', 'electrical_charging', 'diagnostics_obd_dtc'],
    };
  }
  if (/\bnavigation\b|\bmultimedia\b|\baudio\b|\binfotainment\b|\bentune\b/i.test(combined)) {
    return {
      category: 'NAVIGATION_AUDIO_MANUAL',
      systemCategories: ['body_electrical'],
    };
  }
  if (/\bparts\s+catalog\b|\bparts\s+list\b|\bpart\s+numbers\b/i.test(combined)) {
    return {
      category: 'PARTS_CATALOG',
      systemCategories: ['maintenance'],
    };
  }
  if (/\btsb\b|\btechnical\s+service\s+bulletin\b|\brecall\b/i.test(combined)) {
    return {
      category: 'TECHNICAL_BULLETIN',
      systemCategories: ['diagnostics_obd_dtc', 'engine_management_ecu'],
    };
  }
  if (/\bowner'?s?\s+manual\b|\buser'?s?\s+manual\b|\buser\s+guide\b|\bmanual\s+(?:de\s+)?us(?:u)?ario\b|\bhandbook\b|\bquick\s+reference\b/i.test(combined)) {
    return {
      category: 'OWNERS_MANUAL',
      systemCategories: ['body_electrical', 'maintenance'],
    };
  }
  return {
    category: 'OTHER_AUTOMOTIVE',
    systemCategories: ['body_electrical', 'diagnostics_obd_dtc'],
  };
}

function extractUniqueMatches(text: string, regex: RegExp): string[] {
  const seen = new Set<string>();
  const matches = text.match(regex) || [];
  for (const m of matches) {
    seen.add(m.toUpperCase());
  }
  return [...seen].sort();
}

async function fetchJsonWithRetry<T>(url: string, retries = 2): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        if (attempt < retries) continue;
        return null;
      }
      return (await res.json()) as T;
    } catch {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  return null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIdx = 0;

  async function runWorker() {
    while (nextIdx < items.length) {
      const current = nextIdx++;
      results[current] = await worker(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runWorker()));
  return results;
}

export async function runArchiveOrgToyotaPage2Ingestion(): Promise<ArchiveOrgToyotaCatalogManifest> {
  console.log(`[ArchiveOrgIngestion] Fetching page ${SOURCE_PAGE} from ${SEARCH_API_URL}...`);
  const searchPayload = await fetchJsonWithRetry<{
    response?: { numFound?: number; start?: number; docs?: RawArchiveSearchDoc[] };
  }>(SEARCH_API_URL, 3);

  if (!searchPayload?.response?.docs) {
    throw new Error('Failed to fetch Internet Archive search results for Toyota manual pdf page 2.');
  }

  const totalSearchHitsReported = Number(searchPayload.response.numFound || 0);
  const rawDocs = searchPayload.response.docs;
  console.log(
    `[ArchiveOrgIngestion] Retrieved ${rawDocs.length} raw docs (total search hits reported: ${totalSearchHitsReported}).`
  );

  const crawledAt = new Date().toISOString();
  const filteredOutItems: ArchiveOrgFilteredOutItem[] = [];
  const candidateDocs: RawArchiveSearchDoc[] = [];
  const seenIds = new Set<string>();

  for (const doc of rawDocs) {
    const identifier = String(doc.identifier || '').trim();
    if (!identifier || seenIds.has(identifier)) continue;
    seenIds.add(identifier);

    const title = toSingleString(doc.title) || identifier;
    const description = toSingleString(doc.description);
    const subjects = toStringArray(doc.subject);
    const mediatype = toSingleString(doc.mediatype) || 'unknown';

    const rejectReason = classifyNonAutomotive(title, description, subjects, mediatype);
    if (rejectReason) {
      filteredOutItems.push({ identifier, title, mediatype, reason: rejectReason });
      continue;
    }
    candidateDocs.push(doc);
  }

  console.log(
    `[ArchiveOrgIngestion] ${candidateDocs.length} automotive candidates (${filteredOutItems.length} non-automotive filtered). Enriching per-item /metadata/...`
  );

  const enriched = await mapWithConcurrency(candidateDocs, 5, async (doc, idx) => {
    const identifier = String(doc.identifier || '').trim();
    const metadataApiUrl = `https://archive.org/metadata/${encodeURIComponent(identifier)}`;
    const detailsUrl = `https://archive.org/details/${encodeURIComponent(identifier)}`;

    const metaRes = await fetchJsonWithRetry<RawArchiveMetadataResponse>(metadataApiUrl, 2);
    const meta = metaRes?.metadata || {};

    const title = toSingleString(meta.title) || toSingleString(doc.title) || identifier;
    const descriptionRaw = toSingleString(meta.description) || toSingleString(doc.description);
    const subjects = Array.from(
      new Set([...toStringArray(doc.subject), ...toStringArray(meta.subject)])
    ).slice(0, 12);
    const mediatype = toSingleString(meta.mediatype) || toSingleString(doc.mediatype) || 'texts';

    // Re-check non-automotive after full metadata enrichment (catches sewing machines only named in metadata)
    const lateReject = classifyNonAutomotive(title, descriptionRaw, subjects, mediatype);
    if (lateReject) {
      return { rejected: { identifier, title, mediatype, reason: lateReject } as ArchiveOrgFilteredOutItem };
    }

    const pdfAssets: ArchiveOrgPdfAsset[] = [];
    const files = Array.isArray(metaRes?.files) ? metaRes!.files : [];
    const defaultPageCount =
      meta.imagecount && Number.isFinite(Number(meta.imagecount)) ? Number(meta.imagecount) : null;

    for (const f of files) {
      const fileName = String(f.name || '').trim();
      const format = String(f.format || '').trim();
      if (!fileName) continue;
      if (!/\.pdf$/i.test(fileName) && !/pdf/i.test(format)) continue;
      const sizeBytes = f.size !== undefined && Number.isFinite(Number(f.size)) ? Number(f.size) : null;
      const pageCount =
        f.page_count !== undefined && Number.isFinite(Number(f.page_count))
          ? Number(f.page_count)
          : defaultPageCount;
      pdfAssets.push({
        fileName,
        format: format || 'Text PDF',
        sizeBytes,
        pageCount,
        downloadUrl: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(fileName)}`,
      });
    }

    const { model, modelSlug } = extractToyotaModel(title, descriptionRaw, subjects);
    const { yearStart, yearEnd, yearsLabel } = extractModelYears(title, descriptionRaw, meta.year ?? doc.year);
    const { category, systemCategories } = classifyManualCategory(title, descriptionRaw, subjects);
    const combinedText = `${title} ${descriptionRaw} ${subjects.join(' ')}`;
    const chassisCodes = extractUniqueMatches(combinedText, CHASSIS_CODE_REGEX);
    const engineCodes = extractUniqueMatches(combinedText, ENGINE_CODE_REGEX);

    const record: ArchiveOrgManualRecord = {
      identifier,
      title,
      make: 'Toyota',
      makeSlug: 'toyota',
      model,
      modelSlug,
      chassisCodes,
      engineCodes,
      yearStart,
      yearEnd,
      yearsLabel,
      category,
      systemCategories,
      creator: toSingleString(meta.creator) || toSingleString(doc.creator) || null,
      publisher: toSingleString(meta.publisher) || toSingleString(doc.publisher) || null,
      language: toSingleString(meta.language) || toSingleString(doc.language) || null,
      licenseUrl: toSingleString(meta.licenseurl) || toSingleString(doc.licenseurl) || null,
      downloads: typeof doc.downloads === 'number' ? doc.downloads : null,
      itemSizeBytes: typeof doc.item_size === 'number' ? doc.item_size : null,
      subjects,
      descriptionExcerpt: stripHtmlAndTruncate(descriptionRaw, 320),
      pdfAssets,
      provenance: {
        sourceSite: 'archive.org',
        sourceSearchUrl: SOURCE_SEARCH_URL,
        detailsUrl,
        metadataApiUrl,
        crawledAt,
        tier: 'COMMUNITY_UNVERIFIED',
        evidenceType: 'UNVERIFIED_DATABASE_RECORD',
        copyrightNotice:
          'Reference metadata and short catalog excerpt only; full PDF remains hosted on archive.org.',
      },
    };

    if ((idx + 1) % 10 === 0 || idx === candidateDocs.length - 1) {
      console.log(`  [${idx + 1}/${candidateDocs.length}] Enriched ${identifier} (${model} / ${category}, ${pdfAssets.length} PDF(s))`);
    }

    return { record };
  });

  const records: ArchiveOrgManualRecord[] = [];
  for (const item of enriched) {
    if (item.rejected) {
      filteredOutItems.push(item.rejected);
    } else if (item.record) {
      records.push(item.record);
    }
  }

  records.sort(
    (a, b) =>
      a.model.localeCompare(b.model) ||
      (a.yearStart ?? 9999) - (b.yearStart ?? 9999) ||
      a.title.localeCompare(b.title)
  );

  const categoriesBreakdown: Record<ArchiveOrgManualCategory, number> = {
    WIRING_DIAGRAM: 0,
    REPAIR_SERVICE_MANUAL: 0,
    ENGINE_ECU_MANUAL: 0,
    OWNERS_MANUAL: 0,
    NAVIGATION_AUDIO_MANUAL: 0,
    PARTS_CATALOG: 0,
    TECHNICAL_BULLETIN: 0,
    OTHER_AUTOMOTIVE: 0,
  };
  const modelsSet = new Set<string>();
  let totalPdfAssetsIndexed = 0;

  for (const rec of records) {
    categoriesBreakdown[rec.category] += 1;
    modelsSet.add(rec.model);
    totalPdfAssetsIndexed += rec.pdfAssets.length;
  }

  const manifest: ArchiveOrgToyotaCatalogManifest = {
    schemaVersion: '1.0.0',
    sourceSite: 'archive.org',
    sourceQuery: SOURCE_QUERY,
    sourcePage: SOURCE_PAGE,
    sourceSearchUrl: SOURCE_SEARCH_URL,
    apiEndpoint: SEARCH_API_URL,
    generatedAt: crawledAt,
    zeroFabricationIntegrity: true,
    totalSearchHitsReported,
    rawPageDocsFetched: rawDocs.length,
    automotiveManualsIngested: records.length,
    filteredOutNonAutomotiveCount: filteredOutItems.length,
    totalPdfAssetsIndexed,
    modelsDiscovered: [...modelsSet].sort(),
    categoriesBreakdown,
    records,
    filteredOutItems,
  };

  const outDir = path.resolve(process.cwd(), 'src/data/archiveorg/toyota');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'archiveOrgToyotaCatalog.json');
  fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2), 'utf-8');

  console.log(
    `✓ Wrote Archive.org Toyota Manual Catalog -> ${outFile}\n` +
      `  Raw page-2 docs: ${manifest.rawPageDocsFetched} | Automotive manuals ingested: ${manifest.automotiveManualsIngested} | ` +
      `Filtered non-automotive: ${manifest.filteredOutNonAutomotiveCount} | PDFs indexed: ${manifest.totalPdfAssetsIndexed}`
  );
  return manifest;
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('archiveOrgToyotaIngestionEngine.ts')
) {
  runArchiveOrgToyotaPage2Ingestion().catch((err) => {
    console.error('[ArchiveOrgIngestion] Fatal error:', err);
    process.exit(1);
  });
}
