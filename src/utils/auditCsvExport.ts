/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import {
  ClientTrialAuditEvent,
  ClientTrialPinRecord,
  formatTrialDurationLabel,
} from '../services/trialPinClientService';

/**
 * Escapes and neutralizes a single CSV cell per RFC 4180 while guarding
 * against spreadsheet formula injection (=, +, -, @, tab, CR prefixes).
 */
export function escapeAuditCsvCell(raw: string | number | boolean | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  let text = String(raw).replace(/\r\n/g, ' ').replace(/[\r\n]/g, ' ');
  if (/^[=+\-@\t]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function formatCsvRow(cells: Array<string | number | boolean | null | undefined>): string {
  return cells.map((cell) => escapeAuditCsvCell(cell)).join(',');
}

function formatDurationSecondsForCsv(seconds: number | null): string {
  if (seconds === null) return 'Pending activation';
  if (seconds <= 0) return '00:00:00';
  const days = Math.floor(seconds / 86400);
  const hrs = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const hms = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return days > 0 ? `${days}d ${hms}` : hms;
}

export function computeRemainingPercentForTrial(
  tr: Pick<ClientTrialPinRecord, 'status' | 'durationHours' | 'remainingSeconds'>,
  overrideRemainingSec?: number | null
): number {
  if (tr.status === 'UNUSED') return 100;
  if (tr.status === 'EXPIRED' || tr.status === 'REVOKED') return 0;
  const rem = overrideRemainingSec !== undefined ? overrideRemainingSec : tr.remainingSeconds;
  if (rem === null || rem === undefined || !Number.isFinite(rem)) return 100;
  const totalSec = Math.max(1, tr.durationHours * 3600);
  return Math.max(0, Math.min(100, Math.round((rem / totalSec) * 100)));
}

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const LABELED_USER_ID_PATTERN =
  /\b(?:user[_\s-]?id|uid|account[_\s-]?id|owner[_\s-]?id|firebase[_\s-]?uid)\s*[:=#]\s*[A-Za-z0-9._:@/-]+/gi;
const PIN_ADMIN_UID_PATTERN = /\b(?:pin-admin:[A-Za-z0-9_-]+|usr_[A-Za-z0-9_-]{4,})\b/gi;
const LABELED_DEVICE_ID_PATTERN =
  /\b(?:device[_\s-]?id|workstation[_\s-]?id|bound[_\s-]?device)\s*[:=#]\s*[A-Za-z0-9._•*:/-]+/gi;
const DEVICE_TOKEN_PATTERN =
  /\b(?:vecl_dev_[A-Za-z0-9_-]+|dev_[•*A-Za-z0-9_-]{3,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi;

/**
 * Scrubs sensitive identifiers (emails, user IDs, and device IDs) from free-text
 * audit cells before CSV download while preserving operational/usage statistics.
 */
export function scrubSensitiveAuditText(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(LABELED_USER_ID_PATTERN, '[REDACTED_UID]')
    .replace(PIN_ADMIN_UID_PATTERN, '[REDACTED_UID]')
    .replace(LABELED_DEVICE_ID_PATTERN, '[REDACTED_DEVICE_ID]')
    .replace(DEVICE_TOKEN_PATTERN, '[REDACTED_DEVICE_ID]')
    .replace(/\s+/g, ' ')
    .trim();
}

const TECHNICIAN_EVENT_TYPES = new Set([
  'ACTIVATED',
  'DEVICE_BIND',
  'REVERIFIED',
  'DEVICE_BLOCKED',
]);

/**
 * Normalizes audit event actor labels so personal emails, user UIDs, or
 * workstation/device names are never leaked into exported CSV logs.
 */
export function scrubAuditActor(
  raw: string | null | undefined,
  context?: { eventType?: string; deviceLabel?: string | null }
): string {
  if (context?.eventType && TECHNICIAN_EVENT_TYPES.has(context.eventType)) {
    return 'Technician';
  }
  const cleaned = String(raw || '').trim();
  if (!cleaned) return 'System';
  if (context?.deviceLabel && cleaned === context.deviceLabel.trim()) {
    return 'Technician';
  }
  const lower = cleaned.toLowerCase();
  if (lower === 'master admin' || lower.startsWith('pin-admin')) return 'Master Admin';
  if (
    lower === 'technician' ||
    lower === 'workstation' ||
    lower === 'device' ||
    lower.includes('workstation')
  ) {
    return 'Technician';
  }
  if (lower === 'system' || lower === 'imported' || lower === 'historical') return 'System';
  if (lower === 'admin') return 'Admin';

  // Collapse any remaining identifier (email, Firebase UID, handle, or device label) to 'Admin'
  return 'Admin';
}

function scrubEventDetail(detail: string | null | undefined, deviceLabel?: string | null): string {
  let text = detail ? String(detail) : '';
  const trimmedDevice = deviceLabel ? deviceLabel.trim() : '';
  if (trimmedDevice && trimmedDevice.length >= 3 && text.includes(trimmedDevice)) {
    text = text.split(trimmedDevice).join('[REDACTED_DEVICE_ID]');
  }
  return scrubSensitiveAuditText(text);
}

export function buildTrialAuditCsv(params: {
  trials: ClientTrialPinRecord[];
  auditLog: ClientTrialAuditEvent[];
  exportedAtMs?: number;
}): string {
  const exportedAtMs = params.exportedAtMs ?? Date.now();
  const lines: string[] = [];

  // Export Banner Metadata (Sanitized: user IDs, emails, and device IDs scrubbed)
  lines.push(
    formatCsvRow([
      'Virtual ECU Lab - Sanitized Trial PIN Audit Export (PII & Device IDs Scrubbed)',
      new Date(exportedAtMs).toISOString(),
      `PIN Records: ${params.trials.length}`,
      `Audit Events: ${params.auditLog.length}`,
    ])
  );
  lines.push('');

  // Section 1: Sanitized Security Audit Event Stream (no device IDs, emails, or user IDs)
  lines.push(formatCsvRow(['SECTION 1: SECURITY AUDIT EVENT LOG']));
  lines.push(
    formatCsvRow([
      'Timestamp (ISO)',
      'Event ID',
      'Event Type',
      'Trial ID',
      'Masked PIN',
      'Duration Window',
      'Actor',
      'Detail',
    ])
  );

  for (const evt of params.auditLog) {
    lines.push(
      formatCsvRow([
        new Date(evt.timestampMs).toISOString(),
        evt.eventId,
        evt.eventType,
        evt.trialId,
        evt.maskedPin,
        formatTrialDurationLabel(evt.durationHours, 'full'),
        scrubAuditActor(evt.actor, { eventType: evt.eventType, deviceLabel: evt.deviceLabel }),
        scrubEventDetail(evt.detail, evt.deviceLabel),
      ])
    );
  }

  lines.push('');

  // Section 2: Cumulative Trial PIN & Usage Summary (preserves PIN generation & usage stats)
  lines.push(formatCsvRow(['SECTION 2: TRIAL PIN & USAGE SUMMARY']));
  lines.push(
    formatCsvRow([
      'Trial ID',
      'Masked PIN',
      'Status',
      'Duration Window',
      'Created At (ISO)',
      'Activated At (ISO)',
      'Expires / Pickup By (ISO)',
      'Remaining Duration',
      'Remaining (%)',
      'Device Binding Status',
      'Unique Devices Used',
      'Total Activations',
      'Revoke Reason',
      'Notes',
    ])
  );

  for (const tr of params.trials) {
    const expiryIso = tr.activatedAtMs
      ? tr.expiresAtMs
        ? new Date(tr.expiresAtMs).toISOString()
        : ''
      : new Date(tr.unusedExpiresAtMs).toISOString();
    const pct = computeRemainingPercentForTrial(tr);
    const bindingStatus = tr.boundDeviceId ? 'Bound (1/1)' : 'Unbound (0/1)';
    lines.push(
      formatCsvRow([
        tr.trialId,
        tr.maskedPin,
        tr.status,
        formatTrialDurationLabel(tr.durationHours, 'full'),
        new Date(tr.createdAtMs).toISOString(),
        tr.activatedAtMs ? new Date(tr.activatedAtMs).toISOString() : 'Not activated',
        expiryIso,
        formatDurationSecondsForCsv(tr.remainingSeconds),
        `${pct}%`,
        bindingStatus,
        tr.totalDevicesUsed,
        tr.totalActivations,
        scrubSensitiveAuditText(tr.revokeReason),
        scrubSensitiveAuditText(tr.notes),
      ])
    );
  }

  return `\uFEFF${lines.join('\r\n')}`;
}

export function triggerAuditCsvDownload(csvContent: string, exportedAtMs = Date.now()): string {
  const dateSlug = new Date(exportedAtMs).toISOString().slice(0, 10);
  const filename = `vecl-trial-audit-log-${dateSlug}.csv`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
