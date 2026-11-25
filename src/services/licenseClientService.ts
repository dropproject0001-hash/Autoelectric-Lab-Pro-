/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

export type LicenseDurationPlan =
  | 'TRIAL_1D'
  | 'SHORT_7D'
  | 'MONTHLY_30D'
  | 'QUARTERLY_90D'
  | 'SEMI_ANNUAL_180D'
  | 'ANNUAL_365D'
  | 'CUSTOM';

export type LicenseStatus = 'UNUSED' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export interface ClientLicenseDevice {
  deviceId: string;
  deviceLabel: string;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
}

export interface ClientLicenseRecord {
  licenseId: string;
  maskedCode: string;
  plan: LicenseDurationPlan;
  durationDays: number;
  maxDevices: number;
  unusedExpiryDays: number;
  createdAtMs: number;
  unusedExpiresAtMs: number;
  activatedAtMs: number | null;
  expiresAtMs: number | null;
  revokedAtMs: number | null;
  revokeReason: string | null;
  assignedUid: string | null;
  assignedEmail: string | null;
  devices: ClientLicenseDevice[];
  notes: string;
  status: LicenseStatus;
}

export interface UserLicenseStatusResponse {
  status: 'SUCCESS';
  isAdmin: boolean;
  hasLicense: boolean;
  licenseState: LicenseStatus | 'ADMIN_BYPASS' | 'UNLICENSED';
  license: ClientLicenseRecord | null;
  deviceRegistered: boolean;
  leaseToken: string | null;
}

const DEVICE_ID_STORAGE_KEY = 'vecl_workstation_device_id_v1';
const LEGACY_LEASE_TOKEN_STORAGE_KEY = 'vecl_offline_lease_token_v1';

// Keep signed license lease tokens strictly in JS memory (never localStorage/sessionStorage)
let inMemoryOfflineLeaseToken: string | null = null;

function generateCryptographicDeviceSuffix(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 36).toString(36)
  ).join('');
}

export function getOrCreateWorkstationDeviceId(): string {
  if (typeof window === 'undefined') return 'srv_workstation_node';
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.trim().length >= 8) {
      return existing.trim();
    }
    const created = `vecl_dev_${generateCryptographicDeviceSuffix()}`;
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return 'vecl_dev_fallback';
  }
}

export function getDefaultWorkstationLabel(): string {
  if (typeof navigator === 'undefined') return 'Virtual ECU Bench Workstation';
  const platform = navigator.platform || 'Workstation';
  return `Bench Terminal (${platform})`;
}

export function saveOfflineLeaseToken(token: string | null): void {
  inMemoryOfflineLeaseToken = token && token.trim() ? token.trim() : null;
  if (typeof window === 'undefined') return;
  try {
    // Purge any legacy persisted lease token from localStorage
    window.localStorage.removeItem(LEGACY_LEASE_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }
}

export function getSavedOfflineLeaseToken(): string | null {
  return inMemoryOfflineLeaseToken;
}

async function buildAuthHeaders(_forceRefresh = false): Promise<Record<string, string>> {
  throw new Error('Google account authentication has been removed. Use 8-digit PIN access instead.');
}

async function authenticatedLicenseFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  let headers = await buildAuthHeaders(false);
  let res = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });

  // If 401 occurs (token expired or audience mismatch), retry once with forced token refresh
  if (res.status === 401) {
    try {
      headers = await buildAuthHeaders(true);
      res = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...(options.headers || {}),
        },
      });
    } catch {
      // Continue to error extraction
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `License service error (${res.status})`);
  }
  return data as T;
}

export async function fetchUserLicenseStatus(forceRefresh = false): Promise<{
  isAdmin: boolean;
  hasLicense: boolean;
  status: LicenseStatus | 'ADMIN_BYPASS' | 'UNLICENSED';
  license: ClientLicenseRecord | null;
  deviceRegistered: boolean;
  leaseToken: string | null;
}> {
  if (forceRefresh) {
    await buildAuthHeaders(true).catch(() => {});
  }
  const deviceId = getOrCreateWorkstationDeviceId();
  const data = await authenticatedLicenseFetch<{
    isAdmin: boolean;
    hasLicense: boolean;
    status: LicenseStatus | 'ADMIN_BYPASS' | 'UNLICENSED';
    license: ClientLicenseRecord | null;
    deviceRegistered: boolean;
    leaseToken: string | null;
  }>(`/api/autoelectric/license/status?deviceId=${encodeURIComponent(deviceId)}`, {
    method: 'GET',
  });

  if (data.leaseToken) {
    saveOfflineLeaseToken(data.leaseToken);
  }
  return data;
}

export async function redeemLicenseCodeClient(rawCode: string, deviceLabel?: string) {
  const deviceId = getOrCreateWorkstationDeviceId();
  const data = await authenticatedLicenseFetch<{
    status: 'SUCCESS';
    newlyActivated: boolean;
    licenseStatus: LicenseStatus;
    license: ClientLicenseRecord;
    leaseToken: string;
  }>('/api/autoelectric/license/redeem', {
    method: 'POST',
    body: JSON.stringify({
      code: rawCode.trim(),
      deviceId,
      deviceLabel: deviceLabel || getDefaultWorkstationLabel(),
    }),
  });

  if (data.leaseToken) {
    saveOfflineLeaseToken(data.leaseToken);
  }
  return data;
}

export async function fetchAdminLicensesList(): Promise<{
  adminUid: string;
  licenses: ClientLicenseRecord[];
}> {
  return authenticatedLicenseFetch<{
    adminUid: string;
    licenses: ClientLicenseRecord[];
  }>('/api/autoelectric/license/admin/list', {
    method: 'GET',
  });
}

export async function generateAdminLicenseCode(params: {
  plan: LicenseDurationPlan;
  customDays?: number;
  unusedExpiryDays?: number;
  notes?: string;
}): Promise<{
  plainCode: string;
  license: ClientLicenseRecord;
}> {
  return authenticatedLicenseFetch<{
    plainCode: string;
    license: ClientLicenseRecord;
  }>('/api/autoelectric/license/admin/generate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function extendAdminLicense(licenseId: string, additionalDays: number) {
  return authenticatedLicenseFetch('/api/autoelectric/license/admin/extend', {
    method: 'POST',
    body: JSON.stringify({ licenseId, additionalDays }),
  });
}

export async function resetAdminLicenseDevices(licenseId: string) {
  return authenticatedLicenseFetch('/api/autoelectric/license/admin/reset-devices', {
    method: 'POST',
    body: JSON.stringify({ licenseId }),
  });
}

export async function setAdminLicenseRevocation(
  licenseId: string,
  revoked: boolean,
  reason?: string
) {
  return authenticatedLicenseFetch('/api/autoelectric/license/admin/revoke', {
    method: 'POST',
    body: JSON.stringify({ licenseId, revoked, reason }),
  });
}
