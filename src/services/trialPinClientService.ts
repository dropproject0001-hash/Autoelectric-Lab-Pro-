/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import {
  getDefaultWorkstationLabel,
  getOrCreateWorkstationDeviceId,
} from './licenseClientService';
import { firebaseAuth } from '../lib/firebase';

export type TrialDurationHours = 3 | 4 | 5 | 6 | 720 | 2160 | 4320 | 8760;
export type TrialPinStatus = 'UNUSED' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export const TRIAL_DURATION_PRESETS: ReadonlyArray<{
  hours: TrialDurationHours;
  shortLabel: string;
  fullLabel: string;
  group: 'SHORT' | 'EXTENDED';
}> = [
  { hours: 3, shortLabel: '3h', fullLabel: '3 Hours', group: 'SHORT' },
  { hours: 4, shortLabel: '4h', fullLabel: '4 Hours', group: 'SHORT' },
  { hours: 5, shortLabel: '5h', fullLabel: '5 Hours', group: 'SHORT' },
  { hours: 6, shortLabel: '6h', fullLabel: '6 Hours', group: 'SHORT' },
  { hours: 720, shortLabel: '30d', fullLabel: '30 Days', group: 'EXTENDED' },
  { hours: 2160, shortLabel: '3m', fullLabel: '3 Months', group: 'EXTENDED' },
  { hours: 4320, shortLabel: '6m', fullLabel: '6 Months', group: 'EXTENDED' },
  { hours: 8760, shortLabel: '1y', fullLabel: '1 Year', group: 'EXTENDED' },
];

export function formatTrialDurationLabel(
  durationHours: number,
  style: 'short' | 'full' = 'short'
): string {
  const match = TRIAL_DURATION_PRESETS.find((preset) => preset.hours === durationHours);
  if (match) {
    return style === 'short' ? match.shortLabel : match.fullLabel;
  }
  return style === 'short' ? `${durationHours}h` : `${durationHours} Hours`;
}
export type TrialAuditEventType =
  | 'GENERATED'
  | 'ACTIVATED'
  | 'DEVICE_BIND'
  | 'REVERIFIED'
  | 'DEVICE_RESET'
  | 'REVOKED'
  | 'RESTORED'
  | 'IMPORTED';

export interface PublicTrialDeviceUsage {
  maskedDeviceId: string;
  deviceLabel: string;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
  activationCount: number;
  isCurrentlyBound: boolean;
}

export interface ClientTrialAuditEvent {
  eventId: string;
  timestampMs: number;
  eventType: TrialAuditEventType;
  trialId: string;
  maskedPin: string;
  durationHours: TrialDurationHours;
  actor: string;
  deviceLabel: string | null;
  maskedDeviceId: string | null;
  detail: string;
}

export interface AdminTrialAuditSummary {
  totalPins: number;
  activePins: number;
  unusedPins: number;
  expiredPins: number;
  revokedPins: number;
  expiringSoonPins: number;
  totalUniqueDevicesUsed: number;
  totalActivations: number;
}

export interface ClientTrialPinRecord {
  trialId: string;
  maskedPin: string;
  durationHours: TrialDurationHours;
  maxDevices: 1;
  unusedExpiryHours: number;
  createdAtMs: number;
  unusedExpiresAtMs: number;
  activatedAtMs: number | null;
  expiresAtMs: number | null;
  revokedAtMs: number | null;
  revokeReason: string | null;
  boundDeviceId: string | null;
  boundDeviceLabel: string | null;
  lastSeenAtMs: number | null;
  notes: string;
  status: TrialPinStatus;
  remainingSeconds: number | null;
  totalDevicesUsed: number;
  totalActivations: number;
  usageHistory: PublicTrialDeviceUsage[];
}

export interface TrialDeviceStatusResponse {
  status: 'SUCCESS';
  accessState: 'TRIAL_ACTIVE' | 'TRIAL_EXPIRED' | 'TRIAL_REVOKED' | 'UNLICENSED';
  hasAccess: boolean;
  trial: ClientTrialPinRecord | null;
  trialToken: string | null;
  serverNowMs: number;
}

export interface AdminPinConfigStatus {
  masterEnvConfigured: boolean;
  adminClaimed: boolean;
  setupEnabled: boolean;
}

// Keep signed trial & admin tokens strictly in JS memory (never localStorage/sessionStorage)
let inMemoryTrialToken: string | null = null;
let inMemoryAdminToken: string | null = null;

type TrialLockListener = (code: string, message: string) => void;
const trialLockListeners = new Set<TrialLockListener>();

export function subscribeTrialLockEvents(listener: TrialLockListener): () => void {
  trialLockListeners.add(listener);
  return () => {
    trialLockListeners.delete(listener);
  };
}

export function notifyTrialLockedFromServer(code: string, message: string): void {
  if (code === 'TRIAL_EXPIRED' || code === 'TRIAL_REVOKED') {
    inMemoryTrialToken = null;
  }
  for (const listener of trialLockListeners) {
    try {
      listener(code, message);
    } catch {
      // Ignore subscriber errors
    }
  }
}

export function getActiveTrialToken(): string | null {
  return inMemoryTrialToken;
}

export function setActiveTrialToken(token: string | null): void {
  inMemoryTrialToken = token && token.trim() ? token.trim() : null;
}

export function getAdminPinToken(): string | null {
  return inMemoryAdminToken;
}

export function setAdminPinToken(token: string | null): void {
  inMemoryAdminToken = token && token.trim() ? token.trim() : null;
}

export async function getClientBearerToken(forceRefresh = false): Promise<string | null> {
  if (inMemoryTrialToken) {
    return inMemoryTrialToken;
  }
  if (inMemoryAdminToken) {
    return inMemoryAdminToken;
  }
  if (firebaseAuth?.currentUser) {
    try {
      return await firebaseAuth.currentUser.getIdToken(forceRefresh);
    } catch {
      return null;
    }
  }
  return null;
}

export async function buildUnifiedApiHeaders(
  extra: Record<string, string> = {},
  forceRefresh = false
): Promise<Record<string, string>> {
  const bearer = await getClientBearerToken(forceRefresh);
  return {
    'X-VECL-Device-Id': getOrCreateWorkstationDeviceId(),
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    ...extra,
  };
}

export function inspectAndHandleTrialErrorPayload(
  status: number,
  data: { code?: string; error?: string } | null | undefined
): void {
  if (status === 403 && data?.code && (data.code === 'TRIAL_EXPIRED' || data.code === 'TRIAL_REVOKED')) {
    notifyTrialLockedFromServer(
      data.code,
      data.error || 'Your trial PIN session has expired. AI tools and local exports are locked.'
    );
  }
}

export async function fetchTrialDeviceStatus(): Promise<TrialDeviceStatusResponse> {
  const deviceId = getOrCreateWorkstationDeviceId();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-VECL-Device-Id': deviceId,
    ...(inMemoryTrialToken ? { Authorization: `Bearer ${inMemoryTrialToken}` } : {}),
  };

  const res = await fetch('/api/autoelectric/trial/status', {
    method: 'GET',
    headers,
    credentials: 'same-origin',
  });
  const data = (await res.json().catch(() => ({}))) as Partial<TrialDeviceStatusResponse> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `Unable to check trial status (${res.status})`);
  }

  if (data.hasAccess && data.trialToken) {
    setActiveTrialToken(data.trialToken);
  } else {
    setActiveTrialToken(null);
  }

  return data as TrialDeviceStatusResponse;
}

export async function redeemTrialPinClient(
  rawPin: string,
  deviceLabel?: string
): Promise<{
  newlyActivated: boolean;
  trial: ClientTrialPinRecord;
  trialToken: string;
  serverNowMs: number;
}> {
  const deviceId = getOrCreateWorkstationDeviceId();
  const res = await fetch('/api/autoelectric/trial/redeem', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-VECL-Device-Id': deviceId,
    },
    body: JSON.stringify({
      pin: rawPin.trim(),
      deviceId,
      deviceLabel: (deviceLabel || getDefaultWorkstationLabel()).trim(),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    newlyActivated?: boolean;
    trial?: ClientTrialPinRecord;
    trialToken?: string;
    serverNowMs?: number;
  };

  if (!res.ok || !data.trial || !data.trialToken) {
    throw new Error(data.error || `Trial PIN activation failed (${res.status}).`);
  }

  setActiveTrialToken(data.trialToken);
  return {
    newlyActivated: Boolean(data.newlyActivated),
    trial: data.trial,
    trialToken: data.trialToken,
    serverNowMs: typeof data.serverNowMs === 'number' ? data.serverNowMs : Date.now(),
  };
}

export async function fetchAdminPinConfigStatus(): Promise<AdminPinConfigStatus> {
  const res = await fetch('/api/autoelectric/trial/admin/config', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as Partial<AdminPinConfigStatus> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `Unable to load admin configuration (${res.status})`);
  }
  return {
    masterEnvConfigured: Boolean(data.masterEnvConfigured),
    adminClaimed: Boolean(data.adminClaimed),
    setupEnabled: Boolean(data.setupEnabled),
  };
}

export async function setupFirstRunAdminPinClient(masterPin: string): Promise<{
  adminToken: string;
  expiresAtMs: number;
}> {
  const res = await fetch('/api/autoelectric/trial/admin/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ masterPin: masterPin.trim() }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    adminToken?: string;
    expiresAtMs?: number;
    error?: string;
  };
  if (!res.ok || !data.adminToken) {
    throw new Error(data.error || `Failed to set up Master Admin PIN (${res.status}).`);
  }
  setAdminPinToken(data.adminToken);
  return {
    adminToken: data.adminToken,
    expiresAtMs: data.expiresAtMs ?? Date.now() + 12 * 3600_000,
  };
}

export async function loginAdminMasterPinClient(masterPin: string): Promise<{
  adminToken: string;
  expiresAtMs: number;
}> {
  const res = await fetch('/api/autoelectric/trial/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ masterPin: masterPin.trim() }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    adminToken?: string;
    expiresAtMs?: number;
    error?: string;
  };
  if (!res.ok || !data.adminToken) {
    throw new Error(data.error || `Admin unlock failed (${res.status}).`);
  }
  setAdminPinToken(data.adminToken);
  return {
    adminToken: data.adminToken,
    expiresAtMs: data.expiresAtMs ?? Date.now() + 12 * 3600_000,
  };
}

export async function logoutAdminSessionClient(): Promise<void> {
  const token = inMemoryAdminToken;
  setAdminPinToken(null);
  if (!token) return;
  try {
    await fetch('/api/autoelectric/trial/admin/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    // Token is already cleared in memory; ignore network offline error on logout
  }
}

async function buildAdminAuthHeaders(): Promise<Record<string, string>> {
  if (inMemoryAdminToken) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${inMemoryAdminToken}`,
    };
  }
  throw new Error('Unlock Administrator Console with the Master Admin PIN first.');
}

export async function fetchAdminTrialPinsList(): Promise<{
  trials: ClientTrialPinRecord[];
  auditLog: ClientTrialAuditEvent[];
  summary: AdminTrialAuditSummary;
  serverNowMs: number;
}> {
  const headers = await buildAdminAuthHeaders();
  const res = await fetch('/api/autoelectric/trial/admin/list', {
    method: 'GET',
    headers,
  });
  const data = (await res.json().catch(() => ({}))) as {
    trials?: ClientTrialPinRecord[];
    auditLog?: ClientTrialAuditEvent[];
    summary?: AdminTrialAuditSummary;
    serverNowMs?: number;
    error?: string;
  };
  if (!res.ok) {
    if (res.status === 401) {
      setAdminPinToken(null);
    }
    throw new Error(data.error || `Unable to list trial PINs (${res.status}).`);
  }
  const trials = Array.isArray(data.trials) ? data.trials : [];
  const auditLog = Array.isArray(data.auditLog) ? data.auditLog : [];
  const summary: AdminTrialAuditSummary = data.summary ?? {
    totalPins: trials.length,
    activePins: trials.filter((t) => t.status === 'ACTIVE').length,
    unusedPins: trials.filter((t) => t.status === 'UNUSED').length,
    expiredPins: trials.filter((t) => t.status === 'EXPIRED').length,
    revokedPins: trials.filter((t) => t.status === 'REVOKED').length,
    expiringSoonPins: trials.filter(
      (t) =>
        t.status === 'ACTIVE' &&
        t.remainingSeconds !== null &&
        t.remainingSeconds > 0 &&
        t.remainingSeconds < 1800
    ).length,
    totalUniqueDevicesUsed: trials.reduce((acc, t) => acc + (t.totalDevicesUsed ?? 0), 0),
    totalActivations: trials.reduce((acc, t) => acc + (t.totalActivations ?? 0), 0),
  };
  return {
    trials,
    auditLog,
    summary,
    serverNowMs: typeof data.serverNowMs === 'number' ? data.serverNowMs : Date.now(),
  };
}

export async function generateAdminTrialPinClient(params: {
  durationHours: TrialDurationHours;
  unusedExpiryHours?: number;
  notes?: string;
}): Promise<{
  plainPin: string;
  formattedPin: string;
  trial: ClientTrialPinRecord;
}> {
  const headers = await buildAdminAuthHeaders();
  const res = await fetch('/api/autoelectric/trial/admin/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as {
    plainPin?: string;
    formattedPin?: string;
    trial?: ClientTrialPinRecord;
    error?: string;
  };
  if (!res.ok || !data.plainPin || !data.formattedPin || !data.trial) {
    if (res.status === 401) {
      setAdminPinToken(null);
    }
    throw new Error(data.error || `Failed to generate trial PIN (${res.status}).`);
  }
  return {
    plainPin: data.plainPin,
    formattedPin: data.formattedPin,
    trial: data.trial,
  };
}

export async function revokeAdminTrialPinClient(
  trialId: string,
  revoked: boolean,
  reason?: string
): Promise<ClientTrialPinRecord> {
  const headers = await buildAdminAuthHeaders();
  const res = await fetch('/api/autoelectric/trial/admin/revoke', {
    method: 'POST',
    headers,
    body: JSON.stringify({ trialId, revoked, reason }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    trial?: ClientTrialPinRecord;
    error?: string;
  };
  if (!res.ok || !data.trial) {
    throw new Error(data.error || `Failed to update trial PIN status (${res.status}).`);
  }
  return data.trial;
}

export async function resetAdminTrialDeviceClient(trialId: string): Promise<ClientTrialPinRecord> {
  const headers = await buildAdminAuthHeaders();
  const res = await fetch('/api/autoelectric/trial/admin/reset-device', {
    method: 'POST',
    headers,
    body: JSON.stringify({ trialId }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    trial?: ClientTrialPinRecord;
    error?: string;
  };
  if (!res.ok || !data.trial) {
    throw new Error(data.error || `Failed to reset device binding (${res.status}).`);
  }
  return data.trial;
}

export interface ImportTrialAuditCsvResult {
  importedEvents: number;
  skippedDuplicateEvents: number;
  importedTrials: number;
  skippedExistingTrials: number;
  skippedInvalidRows: number;
  trials: ClientTrialPinRecord[];
  auditLog: ClientTrialAuditEvent[];
  summary: AdminTrialAuditSummary;
  serverNowMs: number;
}

export async function importAdminTrialAuditCsv(
  csvContent: string,
  filename?: string
): Promise<ImportTrialAuditCsvResult> {
  const headers = await buildAdminAuthHeaders();
  const res = await fetch('/api/autoelectric/trial/admin/import', {
    method: 'POST',
    headers,
    body: JSON.stringify({ csvContent, filename }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<ImportTrialAuditCsvResult> & {
    error?: string;
  };
  if (!res.ok) {
    if (res.status === 401) {
      setAdminPinToken(null);
    }
    throw new Error(data.error || `Failed to import audit CSV (${res.status}).`);
  }
  return {
    importedEvents: Number(data.importedEvents ?? 0),
    skippedDuplicateEvents: Number(data.skippedDuplicateEvents ?? 0),
    importedTrials: Number(data.importedTrials ?? 0),
    skippedExistingTrials: Number(data.skippedExistingTrials ?? 0),
    skippedInvalidRows: Number(data.skippedInvalidRows ?? 0),
    trials: Array.isArray(data.trials) ? data.trials : [],
    auditLog: Array.isArray(data.auditLog) ? data.auditLog : [],
    summary: data.summary ?? {
      totalPins: 0,
      activePins: 0,
      unusedPins: 0,
      expiredPins: 0,
      revokedPins: 0,
      expiringSoonPins: 0,
      totalUniqueDevicesUsed: 0,
      totalActivations: 0,
    },
    serverNowMs: typeof data.serverNowMs === 'number' ? data.serverNowMs : Date.now(),
  };
}
