/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import {
  buildUnifiedApiHeaders,
  getClientBearerToken,
  inspectAndHandleTrialErrorPayload,
} from './trialPinClientService';
import type {
  NhtsaMakeModelDirectoryResponse,
  NhtsaVehicleLookupResponse,
} from '../server/services/nhtsaService';

export type {
  DecodedVinInfo,
  NhtsaComplaintItem,
  NhtsaMakeModelDirectoryResponse,
  NhtsaRecallItem,
  NhtsaVehicleLookupResponse,
  NhtsaWmiInfo,
} from '../server/services/nhtsaService';

const CLIENT_CACHE_KEY = 'autoelectric_nhtsa_cache_v1';
const MAX_CLIENT_CACHE = 30;
const STALE_WARNING_TEXT =
  'OFFLINE / STALE CACHE FALLBACK: Displaying locally cached NHTSA response because the live service is unreachable. Never treat cached recall data as proof that a vehicle has no active safety recalls.';

interface CachedEnvelope<T> {
  key: string;
  savedAtMs: number;
  data: T;
}

function readClientCache<T>(key: string): CachedEnvelope<T> | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(CLIENT_CACHE_KEY);
    if (!raw) return null;
    const list = JSON.parse(raw) as CachedEnvelope<T>[];
    if (!Array.isArray(list)) return null;
    return list.find((item) => item && item.key === key) || null;
  } catch {
    return null;
  }
}

function writeClientCache<T>(key: string, data: T): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const raw = window.localStorage.getItem(CLIENT_CACHE_KEY);
    const list = raw ? (JSON.parse(raw) as CachedEnvelope<unknown>[]) : [];
    const filtered = Array.isArray(list) ? list.filter((item) => item && item.key !== key) : [];
    filtered.unshift({ key, savedAtMs: Date.now(), data });
    window.localStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify(filtered.slice(0, MAX_CLIENT_CACHE)));
  } catch {
    // Ignore storage quota issues
  }
}

class NhtsaClientHttpError extends Error {
  public readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'NhtsaClientHttpError';
    this.status = status;
  }
}

let testAuthHeaderProvider: (() => Promise<Record<string, string>>) | null = null;

export function setNhtsaClientAuthForTests(
  provider: (() => Promise<Record<string, string>>) | null
): void {
  testAuthHeaderProvider = provider;
}

async function getBearerHeaders(): Promise<Record<string, string>> {
  if (testAuthHeaderProvider) {
    return testAuthHeaderProvider();
  }
  const token = await getClientBearerToken();
  if (!token) {
    throw new Error(
      'Enter an active 8-digit Trial PIN or Master Admin PIN to query live NHTSA vehicle & recall records.'
    );
  }
  return buildUnifiedApiHeaders({ Accept: 'application/json' });
}

const TRANSIENT_FALLBACK_STATUSES = new Set([429, 500, 502, 503, 504]);

async function fetchWithOfflineFallback<T extends { cached: boolean; stale: boolean; staleWarning?: string }>(
  cacheKey: string,
  url: string,
  fallbackErrorLabel: string
): Promise<T> {
  const headers = await getBearerHeaders();
  try {
    const res = await fetch(url, { method: 'GET', headers });
    const data = (await res.json().catch(() => null)) as
      | (T & { error?: string; code?: string })
      | null;
    if (!res.ok || !data) {
      inspectAndHandleTrialErrorPayload(res.status, data);
      throw new NhtsaClientHttpError(
        data?.error || `${fallbackErrorLabel} (HTTP ${res.status}).`,
        res.status
      );
    }
    writeClientCache(cacheKey, data);
    return data;
  } catch (err) {
    const cached = readClientCache<T>(cacheKey);
    const isTransientHttp =
      err instanceof NhtsaClientHttpError && TRANSIENT_FALLBACK_STATUSES.has(err.status);
    const isNetworkOrOffline =
      (typeof navigator !== 'undefined' && navigator.onLine === false) ||
      (err instanceof TypeError) ||
      (err instanceof Error &&
        (err.name === 'AbortError' ||
          /Failed to fetch|NetworkError|fetch failed|ECONNREFUSED|Load failed|network/i.test(
            err.message
          )));
    if (cached && (isTransientHttp || isNetworkOrOffline)) {
      return {
        ...cached.data,
        cached: true,
        stale: true,
        staleWarning: `${STALE_WARNING_TEXT} (Cached: ${new Date(cached.savedAtMs).toLocaleString()})`,
      };
    }
    throw err;
  }
}

export async function lookupVinWithRecalls(
  vin: string,
  modelYear?: string
): Promise<NhtsaVehicleLookupResponse> {
  const cleanVin = vin.trim().toUpperCase();
  const params = new URLSearchParams({ vin: cleanVin, includeRecalls: '1' });
  if (modelYear?.trim()) {
    params.set('year', modelYear.trim());
  }
  return fetchWithOfflineFallback<NhtsaVehicleLookupResponse>(
    `vin:${cleanVin}:${modelYear?.trim() || ''}`,
    `/api/autoelectric/vehicle/decode-vin?${params.toString()}`,
    'NHTSA VIN lookup failed'
  );
}

export async function lookupRecallsByVehicle(
  make: string,
  model: string,
  modelYear: string
): Promise<NhtsaVehicleLookupResponse> {
  const params = new URLSearchParams({
    make: make.trim(),
    model: model.trim(),
    year: modelYear.trim(),
  });
  return fetchWithOfflineFallback<NhtsaVehicleLookupResponse>(
    `recalls:${make.trim().toLowerCase()}:${model.trim().toLowerCase()}:${modelYear.trim()}`,
    `/api/autoelectric/recalls?${params.toString()}`,
    'NHTSA recalls lookup failed'
  );
}

export async function lookupComplaintsByVehicle(
  make: string,
  model: string,
  modelYear: string
): Promise<NhtsaVehicleLookupResponse> {
  const params = new URLSearchParams({
    make: make.trim(),
    model: model.trim(),
    year: modelYear.trim(),
  });
  return fetchWithOfflineFallback<NhtsaVehicleLookupResponse>(
    `complaints:${make.trim().toLowerCase()}:${model.trim().toLowerCase()}:${modelYear.trim()}`,
    `/api/autoelectric/vehicle/complaints?${params.toString()}`,
    'NHTSA complaints lookup failed'
  );
}

export async function lookupVehicleMakesAndWmi(params: {
  wmi?: string;
  manufacturer?: string;
  make?: string;
  year?: string;
}): Promise<NhtsaMakeModelDirectoryResponse> {
  const qs = new URLSearchParams();
  if (params.wmi?.trim()) qs.set('wmi', params.wmi.trim().toUpperCase());
  if (params.manufacturer?.trim()) qs.set('manufacturer', params.manufacturer.trim());
  if (params.make?.trim()) qs.set('make', params.make.trim());
  if (params.year?.trim()) qs.set('year', params.year.trim());

  return fetchWithOfflineFallback<NhtsaMakeModelDirectoryResponse>(
    `makes:${qs.toString()}`,
    `/api/autoelectric/vehicle/makes?${qs.toString()}`,
    'NHTSA makes/WMI lookup failed'
  );
}
