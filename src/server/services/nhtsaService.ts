/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { AutomotiveRecordProvenance } from '../../types/provenance';
import { buildProvenanceRecord } from '../../utils/provenanceEngine';

export interface DecodedVinInfo {
  vin: string;
  wmi: string;
  make: string;
  model: string;
  modelYear: string;
  series: string;
  trim: string;
  bodyClass: string;
  vehicleType: string;
  driveType: string;
  fuelTypePrimary: string;
  displacementL: string;
  engineCylinders: string;
  engineModel: string;
  engineHp: string;
  transmissionStyle: string;
  plantCountry: string;
  manufacturer: string;
  errorCode: string;
  errorText: string;
  hasCheckDigitWarning: boolean;
  localCheckDigitValid?: boolean;
  expectedCheckDigit?: string;
}

export interface NhtsaWmiInfo {
  wmi: string;
  manufacturerName: string;
  make: string;
  vehicleType: string;
  country: string;
  dateAvailableToPublic: string;
}

export interface NhtsaMakeModelDirectoryResponse {
  status: 'SUCCESS';
  source: 'NHTSA_OFFICIAL_VPIC_API';
  verificationStatus: 'OFFICIAL_GOVERNMENT';
  provenance: AutomotiveRecordProvenance;
  regionalNote: string;
  wmiInfo?: NhtsaWmiInfo;
  makes: string[];
  models: string[];
  manufacturerDetails: Array<{
    mfrId: string;
    mfrName: string;
    country: string;
    vehicleTypes: string[];
  }>;
  cached: boolean;
  stale: boolean;
  staleWarning?: string;
  fetchedAt: string;
  expiresAt: string;
  timestamp: string;
}

export interface NhtsaRecallItem {
  campaignNumber: string;
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  reportReceivedDate: string;
  parkIt: boolean;
}

export interface NhtsaComplaintItem {
  odiNumber: string;
  components: string;
  summary: string;
  dateOfIncident: string;
  crash: boolean;
  fire: boolean;
}

export interface NhtsaVehicleLookupResponse {
  status: 'SUCCESS';
  source: 'NHTSA_OFFICIAL_PUBLIC_API';
  verificationStatus: 'OFFICIAL_GOVERNMENT';
  provenance: AutomotiveRecordProvenance;
  regionalNote: string;
  decodedVin?: DecodedVinInfo;
  wmiInfo?: NhtsaWmiInfo;
  recalls: NhtsaRecallItem[];
  complaints: NhtsaComplaintItem[];
  recallCount: number;
  complaintCount: number;
  cached: boolean;
  stale: boolean;
  staleWarning?: string;
  fetchedAt: string;
  expiresAt: string;
  timestamp: string;
}

export const NHTSA_US_COVERAGE_NOTE =
  'Official U.S. NHTSA vPIC & Safety Database (FMVSS). Non-US / PH / ASEAN / JDM / EU vehicles not sold in North America may return partial VIN attributes or 0 NHTSA recalls; 0 NHTSA recalls does NOT certify zero regional factory TSBs or campaigns.';

export const NHTSA_STALE_CACHE_WARNING =
  'STALE CACHE FALLBACK: Upstream NHTSA API is temporarily unreachable; displaying expired cached data. Never treat cached recall data as proof that a vehicle has no current recalls.';

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;
const WMI_REGEX = /^[A-HJ-NPR-Z0-9]{3}$/;
const MAX_CACHE_ENTRIES = 200;
const MAX_TRANSIENT_RETRIES = 2;

function resolveTimeoutMs(): number {
  const envVal = Number(process.env.NHTSA_REQUEST_TIMEOUT_MS);
  if (Number.isFinite(envVal) && envVal >= 1_000 && envVal <= 25_000) {
    return envVal;
  }
  return 8_000;
}

function resolveCacheTtlMs(): number {
  const envVal = Number(process.env.NHTSA_CACHE_TTL_MS);
  if (Number.isFinite(envVal) && envVal >= 1_000 && envVal <= 86_400_000) {
    return envVal;
  }
  return 15 * 60_000;
}

interface CacheEntry<T> {
  value: T;
  fetchedAtMs: number;
  expiresAtMs: number;
}

const vinCache = new Map<string, CacheEntry<DecodedVinInfo>>();
const recallsCache = new Map<
  string,
  CacheEntry<{ recalls: NhtsaRecallItem[]; complaints: NhtsaComplaintItem[]; complaintCount: number }>
>();
const directoryCache = new Map<
  string,
  CacheEntry<Omit<NhtsaMakeModelDirectoryResponse, 'status' | 'source' | 'verificationStatus' | 'provenance' | 'regionalNote' | 'cached' | 'stale' | 'staleWarning' | 'fetchedAt' | 'expiresAt' | 'timestamp'>>
>();

export type NhtsaFetchLike = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

let customFetchForTests: NhtsaFetchLike | null = null;
let retryBaseDelayMsForTests: number | null = null;

export function setNhtsaFetchForTests(
  fetcher: NhtsaFetchLike | null,
  retryBaseDelayMs?: number
): void {
  customFetchForTests = fetcher;
  retryBaseDelayMsForTests = typeof retryBaseDelayMs === 'number' ? retryBaseDelayMs : null;
}

export function resetNhtsaStateForTests(): void {
  vinCache.clear();
  recallsCache.clear();
  directoryCache.clear();
  customFetchForTests = null;
  retryBaseDelayMsForTests = null;
}

export function maskVin(vin: string): string {
  const clean = vin.trim().toUpperCase();
  if (clean.length <= 6) return '***';
  return `${clean.slice(0, 3)}********${clean.slice(-4)}`;
}

function pruneCache<T>(map: Map<string, CacheEntry<T>>, now: number): void {
  if (map.size <= MAX_CACHE_ENTRIES) return;
  for (const [k, v] of map.entries()) {
    if (v.expiresAtMs <= now) {
      map.delete(k);
    }
  }
  if (map.size > MAX_CACHE_ENTRIES) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
}

export function normalizeVin(rawVin: string): { ok: true; vin: string } | { ok: false; error: string } {
  const clean = rawVin.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 17) {
    return {
      ok: false,
      error: 'VIN must be exactly 17 alphanumeric characters (excluding spaces/dashes).',
    };
  }
  if (!VIN_REGEX.test(clean)) {
    return {
      ok: false,
      error: 'Invalid VIN format: characters I, O, and Q are not permitted under ISO 3779.',
    };
  }
  return { ok: true, vin: clean };
}

const ISO3779_TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
};
const ISO3779_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2] as const;

export function computeIso3779CheckDigit(rawVin: string): {
  valid: boolean;
  expectedCheckDigit: string;
  actualCheckDigit: string;
} | null {
  const norm = normalizeVin(rawVin);
  if (!norm.ok) return null;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const val = ISO3779_TRANSLITERATION[norm.vin[i]];
    if (val === undefined) return null;
    sum += val * ISO3779_WEIGHTS[i];
  }
  const rem = sum % 11;
  const expected = rem === 10 ? 'X' : String(rem);
  const actual = norm.vin[8];
  return {
    valid: actual === expected,
    expectedCheckDigit: expected,
    actualCheckDigit: actual,
  };
}

export function normalizeWmi(rawWmi: string): { ok: true; wmi: string } | { ok: false; error: string } {
  const clean = rawWmi.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!WMI_REGEX.test(clean)) {
    return {
      ok: false,
      error: 'WMI must be a valid 3-character alphanumeric identifier (excluding I, O, Q).',
    };
  }
  return { ok: true, wmi: clean };
}

function cleanField(val: unknown): string {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (!trimmed || trimmed.toLowerCase() === 'not applicable') return '';
  return trimmed;
}

export function parseNhtsaVinResult(vin: string, rawRow: Record<string, unknown>): DecodedVinInfo {
  const errorCode = cleanField(rawRow.ErrorCode) || '0';
  const errorText = cleanField(rawRow.ErrorText);
  const codeTokens = errorCode
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const hasCheckDigitWarning = codeTokens.some((token) => token !== '0');

  const checkDigit = computeIso3779CheckDigit(vin);

  return {
    vin,
    wmi: vin.slice(0, 3),
    make: cleanField(rawRow.Make),
    model: cleanField(rawRow.Model),
    modelYear: cleanField(rawRow.ModelYear),
    series: cleanField(rawRow.Series),
    trim: cleanField(rawRow.Trim),
    bodyClass: cleanField(rawRow.BodyClass),
    vehicleType: cleanField(rawRow.VehicleType),
    driveType: cleanField(rawRow.DriveType),
    fuelTypePrimary: cleanField(rawRow.FuelTypePrimary),
    displacementL: cleanField(rawRow.DisplacementL),
    engineCylinders: cleanField(rawRow.EngineCylinders),
    engineModel: cleanField(rawRow.EngineModel),
    engineHp: cleanField(rawRow.EngineHP),
    transmissionStyle: cleanField(rawRow.TransmissionStyle),
    plantCountry: cleanField(rawRow.PlantCountry),
    manufacturer: cleanField(rawRow.Manufacturer),
    errorCode,
    errorText,
    hasCheckDigitWarning,
    localCheckDigitValid: checkDigit?.valid,
    expectedCheckDigit: checkDigit?.expectedCheckDigit,
  };
}

export function parseNhtsaWmiPayload(wmi: string, payload: unknown): NhtsaWmiInfo | null {
  if (!payload || typeof payload !== 'object') return null;
  const results = (payload as { Results?: unknown }).Results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const row = results[0] as Record<string, unknown>;
  const manufacturerName = cleanField(row.Name) || cleanField(row.CommonName);
  const make = cleanField(row.Make) || cleanField(row.CommonName);
  const vehicleType = cleanField(row.VehicleType);
  const country = cleanField(row.Country);
  if (!manufacturerName && !make) return null;
  return {
    wmi,
    manufacturerName,
    make,
    vehicleType,
    country,
    dateAvailableToPublic: cleanField(row.DateAvailableToPublic),
  };
}

export function parseNhtsaMakesPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const results = (payload as { Results?: unknown }).Results;
  if (!Array.isArray(results)) return [];
  const unique = new Set<string>();
  for (const item of results) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const name = cleanField(row.Make_Name) || cleanField(row.MakeName) || cleanField(row.Make);
    if (name) unique.add(name);
    if (unique.size >= 150) break;
  }
  return Array.from(unique).sort((a, b) => a.localeCompare(b));
}

export function parseNhtsaModelsPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const results = (payload as { Results?: unknown }).Results;
  if (!Array.isArray(results)) return [];
  const unique = new Set<string>();
  for (const item of results) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const name = cleanField(row.Model_Name) || cleanField(row.ModelName) || cleanField(row.Model);
    if (name) unique.add(name);
    if (unique.size >= 150) break;
  }
  return Array.from(unique).sort((a, b) => a.localeCompare(b));
}

export function parseNhtsaManufacturerDetailsPayload(
  payload: unknown
): NhtsaMakeModelDirectoryResponse['manufacturerDetails'] {
  if (!payload || typeof payload !== 'object') return [];
  const results = (payload as { Results?: unknown }).Results;
  if (!Array.isArray(results)) return [];
  return results.slice(0, 15).map((item) => {
    const row = (item || {}) as Record<string, unknown>;
    const rawTypes = Array.isArray(row.VehicleTypes) ? row.VehicleTypes : [];
    const vehicleTypes = rawTypes
      .map((vt) => (vt && typeof vt === 'object' ? cleanField((vt as Record<string, unknown>).Name) : ''))
      .filter(Boolean);
    return {
      mfrId: String(row.Mfr_ID ?? ''),
      mfrName: cleanField(row.Mfr_CommonName) || cleanField(row.Mfr_Name),
      country: cleanField(row.Country),
      vehicleTypes,
    };
  });
}

export function parseNhtsaRecallsPayload(payload: unknown): NhtsaRecallItem[] {
  if (!payload || typeof payload !== 'object') {
    throw new NhtsaUpstreamError('Malformed NHTSA recalls response schema.', 502);
  }
  const results = (payload as { results?: unknown }).results;
  if (results === undefined) {
    return [];
  }
  if (!Array.isArray(results)) {
    throw new NhtsaUpstreamError('Unexpected NHTSA recalls payload format.', 502);
  }
  return results.slice(0, 25).map((r) => {
    const row = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    return {
      campaignNumber: cleanField(row.NHTSACampaignNumber) || 'UNKNOWN',
      component: cleanField(row.Component) || 'Unspecified Component',
      summary: cleanField(row.Summary),
      consequence: cleanField(row.Consequence),
      remedy: cleanField(row.Remedy),
      reportReceivedDate: cleanField(row.ReportReceivedDate),
      parkIt: Boolean(row.parkIt),
    };
  });
}

export function parseNhtsaComplaintsPayload(payload: unknown): {
  items: NhtsaComplaintItem[];
  totalCount: number;
} {
  if (!payload || typeof payload !== 'object') {
    throw new NhtsaUpstreamError('Malformed NHTSA complaints response schema.', 502);
  }
  const record = payload as { count?: unknown; results?: unknown };
  if (record.results !== undefined && !Array.isArray(record.results)) {
    throw new NhtsaUpstreamError('Unexpected NHTSA complaints payload format.', 502);
  }
  const results = Array.isArray(record.results) ? record.results : [];
  const totalCount =
    typeof record.count === 'number' && Number.isFinite(record.count)
      ? record.count
      : results.length;
  const items = results.slice(0, 15).map((c) => {
    const row = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    return {
      odiNumber: String(row.odiNumber ?? ''),
      components: cleanField(row.components) || 'General',
      summary: cleanField(row.summary).slice(0, 800),
      dateOfIncident: cleanField(row.dateOfIncident),
      crash: Boolean(row.crash),
      fire: Boolean(row.fire),
    };
  });
  return { items, totalCount };
}

export class NhtsaUpstreamError extends Error {
  public readonly statusCode: number;
  public readonly transient: boolean;
  constructor(message: string, statusCode: number, transient = false) {
    super(message);
    this.name = 'NhtsaUpstreamError';
    this.statusCode = statusCode;
    this.transient = transient;
  }
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonOnce(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetcher: NhtsaFetchLike =
    customFetchForTests ||
    ((u, init) => fetch(u, init) as Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>);

  try {
    const res = await fetcher(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AutoElectricLabPro/1.0 (Diagnostic Reference)',
      },
    });
    if (!res.ok) {
      const transient = res.status === 429 || res.status >= 500;
      const mappedStatus = res.status === 429 ? 429 : res.status >= 500 ? 502 : res.status;
      throw new NhtsaUpstreamError(
        `NHTSA API returned HTTP ${res.status}`,
        mappedStatus,
        transient
      );
    }

    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      throw new NhtsaUpstreamError('NHTSA API returned malformed JSON.', 502, false);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new NhtsaUpstreamError('NHTSA API returned unexpected empty/non-object JSON.', 502, false);
    }
    return parsed;
  } catch (err) {
    if (err instanceof NhtsaUpstreamError) throw err;
    if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw new NhtsaUpstreamError(
        `NHTSA public API request timed out after ${Math.round(timeoutMs / 1000)}s.`,
        504,
        true
      );
    }
    throw new NhtsaUpstreamError(
      err instanceof Error ? `NHTSA network error: ${err.message}` : 'NHTSA API unreachable.',
      502,
      true
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJsonWithRetry(url: string): Promise<unknown> {
  const timeoutMs = resolveTimeoutMs();
  const baseDelay = retryBaseDelayMsForTests ?? 250;
  let lastError: NhtsaUpstreamError | null = null;

  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    try {
      return await fetchJsonOnce(url, timeoutMs);
    } catch (err) {
      const nhtsaErr =
        err instanceof NhtsaUpstreamError
          ? err
          : new NhtsaUpstreamError('NHTSA request failure.', 502, true);
      lastError = nhtsaErr;
      if (!nhtsaErr.transient || attempt === MAX_TRANSIENT_RETRIES) {
        throw nhtsaErr;
      }
      await sleep(baseDelay * (attempt + 1));
    }
  }

  throw lastError || new NhtsaUpstreamError('NHTSA upstream failure.', 502, true);
}

export function buildNhtsaProvenance(params: {
  sourceName: string;
  sourceUrlOrRef: string;
  manufacturer: string;
  applicableVehicle: string;
  engineCode?: string;
  dateRetrieved?: string;
}): AutomotiveRecordProvenance {
  return buildProvenanceRecord({
    origin: 'NHTSA_PUBLIC_API',
    sourceName: params.sourceName,
    sourceUrlOrRef: params.sourceUrlOrRef,
    manufacturer: params.manufacturer || 'Unknown / NHTSA vPIC',
    applicableVehicle: params.applicableVehicle || 'Unspecified Vehicle',
    engineCode: params.engineCode || undefined,
    publicationOrRevision: 'NHTSA Public Data API (vPIC / Safety)',
    dateRetrieved: params.dateRetrieved,
    confidenceOrUncertainty:
      'OFFICIAL_GOVERNMENT — Authoritative for U.S. FMVSS recalls & WMI/VIN registry. Non-US/PH/ASEAN trims may not appear.',
    regionalApplicability: ['NORTH_AMERICA'],
  });
}

export async function decodeVinViaNhtsa(
  rawVin: string,
  modelYear?: string
): Promise<{
  decoded: DecodedVinInfo;
  cached: boolean;
  stale: boolean;
  fetchedAt: string;
  expiresAt: string;
}> {
  const norm = normalizeVin(rawVin);
  if (!norm.ok) {
    throw new NhtsaUpstreamError(norm.error, 400);
  }

  const cleanYear = modelYear && /^\d{4}$/.test(modelYear.trim()) ? modelYear.trim() : '';
  const cacheKey = `${norm.vin}:${cleanYear}`;
  const now = Date.now();
  const ttlMs = resolveCacheTtlMs();
  const hit = vinCache.get(cacheKey);

  if (hit && hit.expiresAtMs > now) {
    return {
      decoded: hit.value,
      cached: true,
      stale: false,
      fetchedAt: new Date(hit.fetchedAtMs).toISOString(),
      expiresAt: new Date(hit.expiresAtMs).toISOString(),
    };
  }

  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(norm.vin)}?format=json${
    cleanYear ? `&modelyear=${encodeURIComponent(cleanYear)}` : ''
  }`;

  try {
    const data = (await fetchJsonWithRetry(url)) as { Results?: unknown };
    if (!Array.isArray(data.Results) || data.Results.length === 0) {
      throw new NhtsaUpstreamError('NHTSA vPIC returned no VIN decode records.', 502);
    }
    const row = data.Results[0] as Record<string, unknown>;
    const decoded = parseNhtsaVinResult(norm.vin, row);

    pruneCache(vinCache, now);
    const expiresAtMs = now + ttlMs;
    vinCache.set(cacheKey, { value: decoded, fetchedAtMs: now, expiresAtMs });
    return {
      decoded,
      cached: false,
      stale: false,
      fetchedAt: new Date(now).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  } catch (err) {
    if (hit && err instanceof NhtsaUpstreamError && err.transient) {
      return {
        decoded: hit.value,
        cached: true,
        stale: true,
        fetchedAt: new Date(hit.fetchedAtMs).toISOString(),
        expiresAt: new Date(hit.expiresAtMs).toISOString(),
      };
    }
    throw err;
  }
}

export async function fetchNhtsaRecallsAndComplaints(
  make: string,
  model: string,
  modelYear: string
): Promise<{
  recalls: NhtsaRecallItem[];
  complaints: NhtsaComplaintItem[];
  complaintCount: number;
  cached: boolean;
  stale: boolean;
  fetchedAt: string;
  expiresAt: string;
}> {
  const cleanMake = make.trim().slice(0, 64);
  const cleanModel = model.trim().slice(0, 80);
  const cleanYear = modelYear.trim();

  if (!cleanMake || !cleanModel || !/^\d{4}$/.test(cleanYear)) {
    throw new NhtsaUpstreamError('Make, model, and a 4-digit modelYear are required.', 400);
  }

  const cacheKey = `${cleanMake.toLowerCase()}:${cleanModel.toLowerCase()}:${cleanYear}`;
  const now = Date.now();
  const ttlMs = resolveCacheTtlMs();
  const hit = recallsCache.get(cacheKey);

  if (hit && hit.expiresAtMs > now) {
    return {
      ...hit.value,
      cached: true,
      stale: false,
      fetchedAt: new Date(hit.fetchedAtMs).toISOString(),
      expiresAt: new Date(hit.expiresAtMs).toISOString(),
    };
  }

  const recallsUrl = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(cleanMake)}&model=${encodeURIComponent(cleanModel)}&modelYear=${encodeURIComponent(cleanYear)}`;
  const complaintsUrl = `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${encodeURIComponent(cleanMake)}&model=${encodeURIComponent(cleanModel)}&modelYear=${encodeURIComponent(cleanYear)}`;

  const [recallsSettled, complaintsSettled] = await Promise.allSettled([
    fetchJsonWithRetry(recallsUrl),
    fetchJsonWithRetry(complaintsUrl),
  ]);

  if (recallsSettled.status === 'rejected' && complaintsSettled.status === 'rejected') {
    const err = recallsSettled.reason;
    if (hit && err instanceof NhtsaUpstreamError && err.transient) {
      return {
        ...hit.value,
        cached: true,
        stale: true,
        fetchedAt: new Date(hit.fetchedAtMs).toISOString(),
        expiresAt: new Date(hit.expiresAtMs).toISOString(),
      };
    }
    if (err instanceof NhtsaUpstreamError) throw err;
    throw new NhtsaUpstreamError('Unable to reach NHTSA Recalls & Complaints API.', 502, true);
  }

  const recalls =
    recallsSettled.status === 'fulfilled' ? parseNhtsaRecallsPayload(recallsSettled.value) : [];
  const parsedComplaints =
    complaintsSettled.status === 'fulfilled'
      ? parseNhtsaComplaintsPayload(complaintsSettled.value)
      : { items: [], totalCount: 0 };

  const entryValue = {
    recalls,
    complaints: parsedComplaints.items,
    complaintCount: parsedComplaints.totalCount,
  };

  pruneCache(recallsCache, now);
  const expiresAtMs = now + ttlMs;
  recallsCache.set(cacheKey, { value: entryValue, fetchedAtMs: now, expiresAtMs });

  return {
    ...entryValue,
    cached: false,
    stale: false,
    fetchedAt: new Date(now).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export async function fetchVehicleMakesAndWmiViaNhtsa(params: {
  wmi?: string;
  manufacturer?: string;
  make?: string;
  year?: string;
}): Promise<NhtsaMakeModelDirectoryResponse> {
  const cleanWmi = params.wmi?.trim() || '';
  const cleanMfr = params.manufacturer?.trim().slice(0, 80) || '';
  const cleanMake = params.make?.trim().slice(0, 64) || '';
  const cleanYear = params.year?.trim() || '';

  if (cleanWmi) {
    const wmiCheck = normalizeWmi(cleanWmi);
    if (!wmiCheck.ok) {
      throw new NhtsaUpstreamError(wmiCheck.error, 400);
    }
  }
  if (cleanYear && !/^\d{4}$/.test(cleanYear)) {
    throw new NhtsaUpstreamError('year must be a 4-digit year (YYYY).', 400);
  }

  const cacheKey = `${cleanWmi.toUpperCase()}|${cleanMfr.toLowerCase()}|${cleanMake.toLowerCase()}|${cleanYear}`;
  const now = Date.now();
  const ttlMs = resolveCacheTtlMs();
  const hit = directoryCache.get(cacheKey);

  if (hit && hit.expiresAtMs > now) {
    const fetchedAt = new Date(hit.fetchedAtMs).toISOString();
    const expiresAt = new Date(hit.expiresAtMs).toISOString();
    return {
      status: 'SUCCESS',
      source: 'NHTSA_OFFICIAL_VPIC_API',
      verificationStatus: 'OFFICIAL_GOVERNMENT',
      provenance: buildNhtsaProvenance({
        sourceName: 'NHTSA vPIC Vehicle Directory / WMI API',
        sourceUrlOrRef: 'https://vpic.nhtsa.dot.gov/api/',
        manufacturer: hit.value.wmiInfo?.manufacturerName || cleanMfr || cleanMake || 'Multiple OEMs',
        applicableVehicle: [cleanYear, cleanMake].filter(Boolean).join(' ') || 'vPIC Vehicle Catalog',
        dateRetrieved: fetchedAt,
      }),
      regionalNote: NHTSA_US_COVERAGE_NOTE,
      ...hit.value,
      cached: true,
      stale: false,
      fetchedAt,
      expiresAt,
      timestamp: new Date().toISOString(),
    };
  }

  try {
    let wmiInfo: NhtsaWmiInfo | undefined;
    let makes: string[] = [];
    let models: string[] = [];
    let manufacturerDetails: NhtsaMakeModelDirectoryResponse['manufacturerDetails'] = [];

    if (cleanWmi) {
      const wmiNorm = normalizeWmi(cleanWmi);
      if (wmiNorm.ok) {
        const rawWmi = await fetchJsonWithRetry(
          `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeWMI/${encodeURIComponent(wmiNorm.wmi)}?format=json`
        );
        wmiInfo = parseNhtsaWmiPayload(wmiNorm.wmi, rawWmi) || undefined;
      }
    }

    if (cleanMfr) {
      const [mfrMakesRaw, mfrDetailsRaw] = await Promise.allSettled([
        fetchJsonWithRetry(
          `https://vpic.nhtsa.dot.gov/api/vehicles/GetMakeForManufacturer/${encodeURIComponent(cleanMfr)}?format=json`
        ),
        fetchJsonWithRetry(
          `https://vpic.nhtsa.dot.gov/api/vehicles/GetManufacturerDetails/${encodeURIComponent(cleanMfr)}?format=json`
        ),
      ]);
      if (mfrMakesRaw.status === 'fulfilled') {
        makes = parseNhtsaMakesPayload(mfrMakesRaw.value);
      }
      if (mfrDetailsRaw.status === 'fulfilled') {
        manufacturerDetails = parseNhtsaManufacturerDetailsPayload(mfrDetailsRaw.value);
      }
    } else if (!cleanMake && !cleanWmi) {
      const allMakesRaw = await fetchJsonWithRetry(
        'https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/car?format=json'
      );
      makes = parseNhtsaMakesPayload(allMakesRaw);
    }

    if (cleanMake && cleanYear) {
      const modelsRaw = await fetchJsonWithRetry(
        `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(cleanMake)}/modelyear/${encodeURIComponent(cleanYear)}?format=json`
      );
      models = parseNhtsaModelsPayload(modelsRaw);
      if (!makes.includes(cleanMake)) {
        makes = [cleanMake, ...makes];
      }
    } else if (cleanMake) {
      const modelsRaw = await fetchJsonWithRetry(
        `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMake/${encodeURIComponent(cleanMake)}?format=json`
      );
      models = parseNhtsaModelsPayload(modelsRaw);
      if (!makes.includes(cleanMake)) {
        makes = [cleanMake, ...makes];
      }
    }

    const value = { wmiInfo, makes, models, manufacturerDetails };
    pruneCache(directoryCache, now);
    const expiresAtMs = now + ttlMs;
    directoryCache.set(cacheKey, { value, fetchedAtMs: now, expiresAtMs });

    const fetchedAt = new Date(now).toISOString();
    const expiresAt = new Date(expiresAtMs).toISOString();
    return {
      status: 'SUCCESS',
      source: 'NHTSA_OFFICIAL_VPIC_API',
      verificationStatus: 'OFFICIAL_GOVERNMENT',
      provenance: buildNhtsaProvenance({
        sourceName: 'NHTSA vPIC Vehicle Directory / WMI API',
        sourceUrlOrRef: 'https://vpic.nhtsa.dot.gov/api/',
        manufacturer: wmiInfo?.manufacturerName || cleanMfr || cleanMake || 'Multiple OEMs',
        applicableVehicle: [cleanYear, cleanMake].filter(Boolean).join(' ') || 'vPIC Vehicle Catalog',
        dateRetrieved: fetchedAt,
      }),
      regionalNote: NHTSA_US_COVERAGE_NOTE,
      ...value,
      cached: false,
      stale: false,
      fetchedAt,
      expiresAt,
      timestamp: fetchedAt,
    };
  } catch (err) {
    if (hit && err instanceof NhtsaUpstreamError && err.transient) {
      const fetchedAt = new Date(hit.fetchedAtMs).toISOString();
      const expiresAt = new Date(hit.expiresAtMs).toISOString();
      return {
        status: 'SUCCESS',
        source: 'NHTSA_OFFICIAL_VPIC_API',
        verificationStatus: 'OFFICIAL_GOVERNMENT',
        provenance: buildNhtsaProvenance({
          sourceName: 'NHTSA vPIC Vehicle Directory / WMI API',
          sourceUrlOrRef: 'https://vpic.nhtsa.dot.gov/api/',
          manufacturer: hit.value.wmiInfo?.manufacturerName || cleanMfr || cleanMake || 'Multiple OEMs',
          applicableVehicle: [cleanYear, cleanMake].filter(Boolean).join(' ') || 'vPIC Vehicle Catalog',
          dateRetrieved: fetchedAt,
        }),
        regionalNote: NHTSA_US_COVERAGE_NOTE,
        ...hit.value,
        cached: true,
        stale: true,
        staleWarning: NHTSA_STALE_CACHE_WARNING,
        fetchedAt,
        expiresAt,
        timestamp: new Date().toISOString(),
      };
    }
    throw err;
  }
}
