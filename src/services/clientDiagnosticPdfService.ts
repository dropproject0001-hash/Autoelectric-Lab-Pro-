/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import {
  canonicalJsonStringify,
  computeOfflineSha256Hex,
} from './universityLabPdfService';
import type {
  DiagnosticTroubleCode,
  EcuPin,
  InjectedFault,
  MultimeterState,
  PinCategory,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import type { CircuitSolution } from '../utils/circuitSolver';

export interface ClientDiagnosticReportInput {
  reportTitle: string;
  clientName?: string;
  workOrderNumber?: string;
  vehicleInfo?: string;
  ecuProfileLabel: string;
  technicianName?: string;
  technicianNotes?: string;
  powerSupply: PowerSupplyState;
  pins: readonly EcuPin[];
  wires: readonly WireConnection[];
  faults: readonly InjectedFault[];
  multimeter: MultimeterState;
  circuitSolution: CircuitSolution;
  generatedAtIso?: string;
  skipBrowserDownload?: boolean;
}

export interface SignedClientPinMeasurement {
  pinNumber: number;
  id: string;
  label: string;
  name: string;
  category: PinCategory;
  measuredVoltage: number;
  nominalVoltage: number;
  deltaVoltage: number;
  status: string;
}

export interface SignedClientFaultLogEntry {
  source: 'INJECTED_FAULT' | 'CUT_WIRE' | 'OBD2_DTC';
  codeOrElement: string;
  severityOrType: string;
  description: string;
}

export interface SignedClientReportPayload {
  schemaVersion: 'AELP-CLIENT-1';
  measurementProvenance: 'SIMULATED_BENCH_WORKSTATION';
  generatedAtIso: string;
  reportTitle: string;
  clientName: string;
  workOrderNumber: string;
  vehicleInfo: string;
  ecuProfileLabel: string;
  technicianName: string;
  powerSupply: {
    isOutputEnabled: boolean;
    voltageSetting: number;
    currentLimit: number;
    preset: string;
    supplyCurrentDrawAmps: number;
    isSupplyCurrentTripped: boolean;
  };
  multimeter: {
    isPowered: boolean;
    mode: string;
    display: string;
    unit: string;
    redProbeLabel: string;
    blackProbeLabel: string;
    isWarning: boolean;
    warningMessage: string;
  };
  pinMeasurements: SignedClientPinMeasurement[];
  faultLogs: SignedClientFaultLogEntry[];
  activeDtcCodes: string[];
  technicianNotes: string;
}

export interface SignedClientDiagnosticEnvelope {
  reportId: string;
  sha256Hash: string;
  qrToken: string;
  canonicalJson: string;
  payload: SignedClientReportPayload;
}

export interface GeneratedClientDiagnosticPdfResult {
  envelope: SignedClientDiagnosticEnvelope;
  filename: string;
  qrDataUrl: string;
  pdfBytes: Uint8Array;
  pageCount: number;
}

export interface ClientReportVerificationResult {
  valid: boolean;
  status: 'GENUINE' | 'TAMPERED' | 'INVALID_FORMAT';
  expectedHash?: string;
  recomputedHash?: string;
  payload?: SignedClientReportPayload;
  message: string;
}

const CLIENT_QR_PREFIX = 'AELP-CLIENT-1';

function sanitizePdfText(raw: string | undefined | null, maxLen = 180): string {
  return String(raw || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function sanitizeFileSlug(input: string): string {
  return (
    String(input || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'ecu-client-diagnostic-report'
  );
}

function encodeUtf8ToBase64Url(input: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'utf8')
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeBase64UrlToUtf8(b64url: string): string {
  const padded =
    b64url.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (b64url.length % 4)) % 4);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf8');
  }
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function roundTo(n: number, decimals = 3): number {
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/**
 * Builds the canonical JSON payload, 64-character SHA-256 digest, and scannable
 * tamper-evident verification token for a client ECU diagnostic record.
 */
export async function buildSignedClientDiagnosticEnvelope(
  input: ClientDiagnosticReportInput
): Promise<SignedClientDiagnosticEnvelope> {
  const generatedAtIso = input.generatedAtIso || new Date().toISOString();
  const activeFaults = input.faults.filter((f) => f.faultType !== 'NONE');
  const cutWires = input.wires.filter((w) => w.isCut);

  const sortedPins = [...input.pins].sort((a, b) => a.pinNumber - b.pinNumber);
  const pinMeasurements: SignedClientPinMeasurement[] = sortedPins.map((pin) => {
    const rawV = input.circuitSolution.nodeVoltages[pin.id];
    const measuredVoltage = roundTo(Number.isFinite(rawV) ? rawV : 0, 2);
    const nominalVoltage = roundTo(pin.nominalVoltage, 2);
    const deltaVoltage = roundTo(measuredVoltage - nominalVoltage, 2);
    const pinFault = activeFaults.find((f) => f.pinId === pin.id);
    const pinCutWire = cutWires.find(
      (w) => w.sourcePinId === pin.id || w.targetPinId === pin.id
    );
    const status = pinFault
      ? pinFault.faultType
      : pinCutWire
        ? 'WIRE_CUT_OPEN'
        : input.powerSupply.isOutputEnabled
          ? 'NOMINAL'
          : 'STANDBY';

    return {
      pinNumber: pin.pinNumber,
      id: pin.id,
      label: sanitizePdfText(pin.label, 24),
      name: sanitizePdfText(pin.name, 48),
      category: pin.category,
      measuredVoltage,
      nominalVoltage,
      deltaVoltage,
      status,
    };
  });

  const faultLogs: SignedClientFaultLogEntry[] = [
    ...activeFaults.map((f) => ({
      source: 'INJECTED_FAULT' as const,
      codeOrElement: sanitizePdfText(f.pinId, 32),
      severityOrType: sanitizePdfText(f.faultType, 32),
      description: sanitizePdfText(f.description || 'Injected bench circuit fault', 140),
    })),
    ...cutWires.map((w) => ({
      source: 'CUT_WIRE' as const,
      codeOrElement: sanitizePdfText(w.label || w.id, 36),
      severityOrType: 'OPEN_CIRCUIT',
      description: sanitizePdfText(
        `Harness conductor cut open (${w.sourcePinId} -> ${w.targetPinId})`,
        140
      ),
    })),
    ...input.circuitSolution.activeDTCs.map((d: DiagnosticTroubleCode) => ({
      source: 'OBD2_DTC' as const,
      codeOrElement: sanitizePdfText(d.code, 16),
      severityOrType: `${d.severity} / ${sanitizePdfText(d.system, 24)}`,
      description: sanitizePdfText(d.description, 140),
    })),
  ];

  const payload: SignedClientReportPayload = {
    schemaVersion: 'AELP-CLIENT-1',
    measurementProvenance: 'SIMULATED_BENCH_WORKSTATION',
    generatedAtIso,
    reportTitle: sanitizePdfText(input.reportTitle || 'ECU Bench Diagnostic Record', 96),
    clientName: sanitizePdfText(input.clientName || 'Walk-In / Unspecified Client', 80),
    workOrderNumber: sanitizePdfText(input.workOrderNumber || 'RO-UNASSIGNED', 40),
    vehicleInfo: sanitizePdfText(input.vehicleInfo || 'Universal ECU Bench Profile', 96),
    ecuProfileLabel: sanitizePdfText(input.ecuProfileLabel || 'Universal ECU Bench', 80),
    technicianName: sanitizePdfText(input.technicianName || 'Bench Diagnostic Technician', 80),
    powerSupply: {
      isOutputEnabled: Boolean(input.powerSupply.isOutputEnabled),
      voltageSetting: roundTo(input.powerSupply.voltageSetting, 2),
      currentLimit: roundTo(input.powerSupply.currentLimit, 2),
      preset: sanitizePdfText(input.powerSupply.preset, 24),
      supplyCurrentDrawAmps: roundTo(input.circuitSolution.supplyCurrentDrawAmps, 3),
      isSupplyCurrentTripped: Boolean(input.circuitSolution.isSupplyCurrentTripped),
    },
    multimeter: {
      isPowered: Boolean(input.multimeter.isPowered),
      mode: sanitizePdfText(input.multimeter.mode, 20),
      display: sanitizePdfText(input.circuitSolution.multimeterReading.display, 24),
      unit: sanitizePdfText(input.circuitSolution.multimeterReading.unit, 16),
      redProbeLabel: sanitizePdfText(input.multimeter.redProbe.attachedLabel || 'Disconnected', 40),
      blackProbeLabel: sanitizePdfText(
        input.multimeter.blackProbe.attachedLabel || 'Disconnected',
        40
      ),
      isWarning: Boolean(input.circuitSolution.multimeterReading.isWarning),
      warningMessage: sanitizePdfText(
        input.circuitSolution.multimeterReading.warningMessage || '',
        120
      ),
    },
    pinMeasurements,
    faultLogs,
    activeDtcCodes: input.circuitSolution.activeDTCs.map((d) => sanitizePdfText(d.code, 16)),
    technicianNotes: sanitizePdfText(
      input.technicianNotes || 'No additional technician remarks recorded.',
      600
    ),
  };

  const canonicalJson = canonicalJsonStringify(payload);
  const sha256Hash = (await computeOfflineSha256Hex(canonicalJson)).toLowerCase();
  const dateCompact = generatedAtIso.slice(0, 10).replace(/-/g, '');
  const reportId = `RPT-${dateCompact}-${sha256Hash.slice(0, 8).toUpperCase()}`;

  // Compact token embeds full canonical JSON so offline verification works anywhere without a server lookup
  const payloadB64 = encodeUtf8ToBase64Url(canonicalJson);
  const qrToken = `${CLIENT_QR_PREFIX}|${sha256Hash}|${payloadB64}`;

  return {
    reportId,
    sha256Hash,
    qrToken,
    canonicalJson,
    payload,
  };
}

/**
 * Verifies an exported AELP-CLIENT-1 verification token by decoding its canonical
 * JSON payload and recomputing the SHA-256 digest offline.
 */
export async function verifySignedClientDiagnosticToken(
  rawToken: string
): Promise<ClientReportVerificationResult> {
  const trimmed = String(rawToken || '').trim();
  const parts = trimmed.split('|');
  if (parts.length !== 3 || parts[0] !== CLIENT_QR_PREFIX) {
    return {
      valid: false,
      status: 'INVALID_FORMAT',
      message: 'Token format invalid. Expected AELP-CLIENT-1|<64-hex-sha256>|<base64url-payload>.',
    };
  }

  const [, expectedHashRaw, payloadB64] = parts;
  const expectedHash = expectedHashRaw.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
    return {
      valid: false,
      status: 'INVALID_FORMAT',
      message: 'SHA-256 digest segment is not a valid 64-character hex string.',
    };
  }

  try {
    const decodedJson = decodeBase64UrlToUtf8(payloadB64);
    const parsed = JSON.parse(decodedJson) as SignedClientReportPayload;
    if (!parsed || parsed.schemaVersion !== 'AELP-CLIENT-1') {
      return {
        valid: false,
        status: 'INVALID_FORMAT',
        expectedHash,
        message: 'Decoded payload schema version does not match AELP-CLIENT-1.',
      };
    }

    const recomputedHash = (
      await computeOfflineSha256Hex(canonicalJsonStringify(parsed))
    ).toLowerCase();
    if (recomputedHash !== expectedHash) {
      return {
        valid: false,
        status: 'TAMPERED',
        expectedHash,
        recomputedHash,
        payload: parsed,
        message:
          'TAMPER DETECTED: Recomputed SHA-256 digest does not match the sealed client report signature.',
      };
    }

    return {
      valid: true,
      status: 'GENUINE',
      expectedHash,
      recomputedHash,
      payload: parsed,
      message:
        'VERIFIED GENUINE RECORD: SHA-256 cryptographic signature matches the immutable bench diagnostic payload.',
    };
  } catch {
    return {
      valid: false,
      status: 'TAMPERED',
      expectedHash,
      message: 'TAMPERED / CORRUPTED PAYLOAD: Unable to decode signed client report payload.',
    };
  }
}

function getCategoryRgb(category: PinCategory): [number, number, number] {
  switch (category) {
    case 'power':
      return [220, 38, 38]; // Red
    case 'ground':
      return [51, 65, 85]; // Slate/Black
    case 'reference':
      return [2, 132, 199]; // Blue
    case 'sensor_in':
      return [13, 148, 136]; // Teal
    case 'actuator_out':
      return [217, 119, 6]; // Amber
    case 'communication':
      return [124, 58, 237]; // Purple
    default:
      return [71, 85, 105];
  }
}

function drawPinoutConnectorDiagram(
  doc: jsPDF,
  pins: readonly SignedClientPinMeasurement[],
  startY: number
): number {
  const marginX = 14;
  const contentWidth = 182;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('ECU CONNECTOR PINOUT DIAGRAM & LIVE TERMINAL VOLTAGES', marginX, startY);

  const boxTop = startY + 3;
  const colsPerRow = Math.max(1, Math.ceil(pins.length / 2));
  const rowCount = pins.length > 1 ? 2 : 1;
  const boxHeight = rowCount === 2 ? 52 : 30;

  // Outer connector housing
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(0.5);
  doc.roundedRect(marginX, boxTop, contentWidth, boxHeight, 2.5, 2.5, 'FD');

  // Connector keyway alignment notch (top center)
  const keyW = 24;
  const keyX = marginX + (contentWidth - keyW) / 2;
  doc.setFillColor(30, 41, 59);
  doc.rect(keyX, boxTop - 1.5, keyW, 3.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.text('KEYWAY / LOCK TAB', marginX + contentWidth / 2, boxTop + 0.8, { align: 'center' });

  const innerPadX = 4;
  const gapX = 2;
  const cellW = (contentWidth - innerPadX * 2 - gapX * (colsPerRow - 1)) / colsPerRow;
  const cellH = 18.5;

  pins.forEach((pin, idx) => {
    const row = idx < colsPerRow ? 0 : 1;
    const col = idx < colsPerRow ? idx : idx - colsPerRow;
    const cx = marginX + innerPadX + col * (cellW + gapX);
    const cy = boxTop + 6 + row * (cellH + 4.5);

    const isFaulted = pin.status !== 'NOMINAL' && pin.status !== 'STANDBY';
    const [r, g, b] = getCategoryRgb(pin.category);

    // Pin cavity container
    doc.setFillColor(isFaulted ? 254 : 255, isFaulted ? 242 : 255, isFaulted ? 242 : 255);
    doc.setDrawColor(isFaulted ? 225 : r, isFaulted ? 29 : g, isFaulted ? 72 : b);
    doc.setLineWidth(isFaulted ? 0.65 : 0.35);
    doc.roundedRect(cx, cy, cellW, cellH, 1.5, 1.5, 'FD');

    // Top color bar inside pin cavity
    doc.setFillColor(r, g, b);
    doc.rect(cx, cy, cellW, 4.2, 'F');

    // Pin number
    doc.setFont('courier', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`P${pin.pinNumber}`, cx + cellW / 2, cy + 3.1, { align: 'center' });

    // Pin label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(15, 23, 42);
    doc.text(pin.label.slice(0, 10), cx + cellW / 2, cy + 9.2, { align: 'center' });

    // Live measured voltage
    doc.setFont('courier', 'bold');
    doc.setFontSize(6.8);
    if (isFaulted) {
      doc.setTextColor(190, 18, 60);
    } else {
      doc.setTextColor(30, 64, 175);
    }
    doc.text(`${pin.measuredVoltage.toFixed(2)}V`, cx + cellW / 2, cy + 14.0, { align: 'center' });

    // Compact fault tag if faulted
    if (isFaulted) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4.8);
      doc.setTextColor(190, 18, 60);
      doc.text('FAULT', cx + cellW / 2, cy + 17.4, { align: 'center' });
    }
  });

  // Color Legend & Orientation Disclaimer
  const legendY = boxTop + boxHeight + 4.5;
  const legendItems: Array<{ label: string; cat: PinCategory }> = [
    { label: 'Power (KL30/KL15)', cat: 'power' },
    { label: 'Ground (KL31/SGND)', cat: 'ground' },
    { label: '5V Ref', cat: 'reference' },
    { label: 'Sensor In', cat: 'sensor_in' },
    { label: 'Actuator Out', cat: 'actuator_out' },
    { label: 'CAN/Comms', cat: 'communication' },
  ];

  let lx = marginX;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  for (const item of legendItems) {
    const [r, g, b] = getCategoryRgb(item.cat);
    doc.setFillColor(r, g, b);
    doc.rect(lx, legendY - 2.3, 2.8, 2.8, 'F');
    doc.setTextColor(71, 85, 105);
    doc.text(item.label, lx + 3.8, legendY);
    lx += 30.2;
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.4);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Note: Simulated bench connector schematic. Always confirm exact OEM ECU part number and harness-side vs ECU-side face orientation before physical probing.',
    marginX,
    legendY + 4.2
  );

  return legendY + 8.5;
}

/**
 * Generates a cryptographically signed A4 client diagnostic PDF containing all live
 * bench measurements, fault logs, vector ECU connector pinout diagram, embedded QR
 * verification code, and full 64-character SHA-256 digest.
 */
export async function generateSignedClientDiagnosticPdf(
  input: ClientDiagnosticReportInput
): Promise<GeneratedClientDiagnosticPdfResult> {
  const envelope = await buildSignedClientDiagnosticEnvelope(input);
  const { payload, reportId, sha256Hash, qrToken } = envelope;

  // Compact QR payload (embed report ID + full SHA-256 hash + summary to keep QR density crisp and scannable)
  const compactQrPayload = JSON.stringify({
    v: 'AELP-CLIENT-1',
    id: reportId,
    sha256: sha256Hash,
    ts: payload.generatedAtIso,
    wo: payload.workOrderNumber,
    ecu: payload.ecuProfileLabel,
    dtcs: payload.activeDtcCodes,
  });

  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(compactQrPayload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  } catch {
    qrDataUrl = '';
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageW = 210;
  const pageH = 297;
  const marginX = 14;
  const contentW = pageW - marginX * 2;

  const ensureSpace = (currentY: number, neededMm: number): number => {
    if (currentY + neededMm > pageH - 18) {
      doc.addPage();
      return 18;
    }
    return currentY;
  };

  // =========================================================================
  // PAGE 1: HEADER, PROVENANCE, CLIENT INFO, BENCH MEASUREMENTS, PINOUT DIAGRAM
  // =========================================================================
  doc.setFillColor(10, 18, 32);
  doc.rect(0, 0, pageW, 27, 'F');
  doc.setFillColor(14, 165, 233);
  doc.rect(0, 27, pageW, 1.2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('AUTOELECTRIC LAB PRO — CLIENT DIAGNOSTIC RECORD', marginX, 11.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(148, 163, 184);
  doc.text(payload.reportTitle, marginX, 17.5);
  doc.text(
    `Generated (UTC): ${payload.generatedAtIso}   |   Document ID: ${reportId}`,
    marginX,
    22.5
  );

  // Top-right SHA-256 SEAL pill
  doc.setFillColor(6, 78, 59);
  doc.setDrawColor(16, 185, 129);
  doc.roundedRect(pageW - marginX - 42, 7.5, 42, 11, 1.5, 1.5, 'FD');
  doc.setFont('courier', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(167, 243, 208);
  doc.text('SHA-256 SIGNED A4', pageW - marginX - 21, 12.2, { align: 'center' });
  doc.setFontSize(6.2);
  doc.text(sha256Hash.slice(0, 16).toUpperCase(), pageW - marginX - 21, 16.4, {
    align: 'center',
  });

  // Provenance Notice Strip (Clear Separation of Simulated vs Physical Readings)
  let y = 32;
  doc.setFillColor(254, 243, 199);
  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(0.35);
  doc.roundedRect(marginX, y, contentW, 9.5, 1.2, 1.2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(146, 64, 14);
  doc.text(
    'PROVENANCE NOTICE: SIMULATED MNA BENCH TELEMETRY (NOT PHYSICAL VEHICLE MEASUREMENTS)',
    marginX + 3,
    y + 4.1
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  doc.text(
    'Measurements below come from the Modified Nodal Analysis bench solver. Confirm OEM service manual specs prior to physical repair.',
    marginX + 3,
    y + 7.8
  );
  y += 13.5;

  // Client & Work Order Information Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('CLIENT, WORK ORDER & ECU IDENTIFICATION', marginX, y);
  y += 2.5;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(marginX, y, contentW, 21, 1.5, 1.5, 'FD');

  const metaRows: Array<[string, string, string, string]> = [
    ['Client / Account:', payload.clientName, 'Work Order / RO #:', payload.workOrderNumber],
    ['Vehicle / VIN:', payload.vehicleInfo, 'ECU Profile:', payload.ecuProfileLabel],
    ['Technician:', payload.technicianName, 'Report ID:', reportId],
  ];

  let my = y + 5.5;
  for (const [k1, v1, k2, v2] of metaRows) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(k1, marginX + 3, my);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(v1.slice(0, 36), marginX + 31, my);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(k2, marginX + 96, my);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(v2.slice(0, 34), marginX + 126, my);
    my += 6.2;
  }
  y += 26;

  // Executive Bench Measurements Grid (3 Cards)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('BENCH INSTRUMENT MEASUREMENTS SNAPSHOT', marginX, y);
  y += 2.8;

  const cardGap = 3.5;
  const cardW = (contentW - cardGap * 2) / 3;
  const cardH = 26;

  // Card 1: Bench PSU
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(148, 163, 184);
  doc.roundedRect(marginX, y, cardW, cardH, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(2, 132, 199);
  doc.text('BENCH POWER SUPPLY', marginX + 3, y + 5);
  doc.setFont('courier', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    payload.powerSupply.isOutputEnabled
      ? `${payload.powerSupply.voltageSetting.toFixed(2)} V  (ON)`
      : 'OUTPUT OFF',
    marginX + 3,
    y + 11.5
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Draw: ${payload.powerSupply.supplyCurrentDrawAmps.toFixed(3)} A / Limit: ${payload.powerSupply.currentLimit.toFixed(1)} A`,
    marginX + 3,
    y + 17
  );
  doc.text(
    `Preset: ${payload.powerSupply.preset} | OCP: ${payload.powerSupply.isSupplyCurrentTripped ? 'TRIPPED' : 'OK'}`,
    marginX + 3,
    y + 22
  );

  // Card 2: Digital Multimeter
  const c2x = marginX + cardW + cardGap;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(148, 163, 184);
  doc.roundedRect(c2x, y, cardW, cardH, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(13, 148, 136);
  doc.text(`DMM (${payload.multimeter.mode})`, c2x + 3, y + 5);
  doc.setFont('courier', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    payload.multimeter.isPowered
      ? `${payload.multimeter.display} ${payload.multimeter.unit}`.trim()
      : 'DMM POWERED OFF',
    c2x + 3,
    y + 11.5
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Red (+): ${payload.multimeter.redProbeLabel.slice(0, 22)}`, c2x + 3, y + 17);
  doc.text(`Blk (-): ${payload.multimeter.blackProbeLabel.slice(0, 22)}`, c2x + 3, y + 22);

  // Card 3: Fault & DTC Summary
  const c3x = marginX + (cardW + cardGap) * 2;
  const hasFaults = payload.faultLogs.length > 0;
  doc.setFillColor(hasFaults ? 254 : 236, hasFaults ? 242 : 253, hasFaults ? 242 : 245);
  doc.setDrawColor(hasFaults ? 225 : 16, hasFaults ? 29 : 185, hasFaults ? 72 : 129);
  doc.roundedRect(c3x, y, cardW, cardH, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(hasFaults ? 190 : 5, hasFaults ? 18 : 150, hasFaults ? 60 : 105);
  doc.text('FAULT & DTC SUMMARY', c3x + 3, y + 5);
  doc.setFont('courier', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    hasFaults ? `${payload.faultLogs.length} FINDING(S)` : 'ALL NOMINAL',
    c3x + 3,
    y + 11.5
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Active DTCs: ${payload.activeDtcCodes.length > 0 ? payload.activeDtcCodes.join(', ').slice(0, 24) : 'None'}`,
    c3x + 3,
    y + 17
  );
  doc.text(
    `Monitored Pins: ${payload.pinMeasurements.length} | Wires: ${input.wires.length}`,
    c3x + 3,
    y + 22
  );

  y += cardH + 7;

  // Vector ECU Connector Pinout Diagram
  y = drawPinoutConnectorDiagram(doc, payload.pinMeasurements, y);

  // =========================================================================
  // FULL PINOUT MEASUREMENTS TABLE
  // =========================================================================
  y = ensureSpace(y, 35);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('COMPLETE BENCH PINOUT MEASUREMENTS MATRIX', marginX, y);
  y += 3;

  const drawPinTableHeader = (topY: number): number => {
    doc.setFillColor(15, 23, 42);
    doc.rect(marginX, topY, contentW, 6.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('PIN', marginX + 2, topY + 4.3);
    doc.text('LABEL', marginX + 14, topY + 4.3);
    doc.text('SIGNAL DESCRIPTION', marginX + 38, topY + 4.3);
    doc.text('CATEGORY', marginX + 94, topY + 4.3);
    doc.text('LIVE (V)', marginX + 122, topY + 4.3);
    doc.text('NOM (V)', marginX + 141, topY + 4.3);
    doc.text('STATUS', marginX + 159, topY + 4.3);
    return topY + 6.2;
  };

  y = drawPinTableHeader(y);
  for (let i = 0; i < payload.pinMeasurements.length; i++) {
    const p = payload.pinMeasurements[i];
    if (y + 5.6 > pageH - 18) {
      doc.addPage();
      y = drawPinTableHeader(16);
    }

    const isFaulted = p.status !== 'NOMINAL' && p.status !== 'STANDBY';
    if (isFaulted) {
      doc.setFillColor(254, 242, 242);
    } else if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.rect(marginX, y, contentW, 5.4, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, y + 5.4, marginX + contentW, y + 5.4);

    doc.setFont('courier', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text(`#${p.pinNumber}`, marginX + 2, y + 3.8);
    doc.text(p.label.slice(0, 12), marginX + 14, y + 3.8);

    doc.setFont('helvetica', 'normal');
    doc.text(p.name.slice(0, 32), marginX + 38, y + 3.8);
    doc.setTextColor(71, 85, 105);
    doc.text(p.category.toUpperCase().slice(0, 13), marginX + 94, y + 3.8);

    doc.setFont('courier', 'bold');
    doc.setTextColor(isFaulted ? 190 : 30, isFaulted ? 18 : 64, isFaulted ? 60 : 175);
    doc.text(`${p.measuredVoltage.toFixed(2)}V`, marginX + 122, y + 3.8);
    doc.setFont('courier', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`${p.nominalVoltage.toFixed(2)}V`, marginX + 141, y + 3.8);

    doc.setFont('courier', 'bold');
    doc.setTextColor(isFaulted ? 190 : 5, isFaulted ? 18 : 150, isFaulted ? 60 : 105);
    doc.text(p.status.slice(0, 13), marginX + 159, y + 3.8);

    y += 5.4;
  }

  y += 7;

  // =========================================================================
  // FAULT LOGS & ACTIVE DTC TABLE
  // =========================================================================
  y = ensureSpace(y, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('FAULT LOGS, HARNESS INTERRUPTIONS & ACTIVE DTCs', marginX, y);
  y += 3;

  if (payload.faultLogs.length === 0) {
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(16, 185, 129);
    doc.roundedRect(marginX, y, contentW, 9, 1.2, 1.2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(6, 95, 70);
    doc.text(
      'NO ACTIVE CIRCUIT FAULTS, CUT WIRES, OR OBD-II DTCs LOGGED IN THIS BENCH SNAPSHOT.',
      marginX + 3,
      y + 5.7
    );
    y += 14;
  } else {
    doc.setFillColor(127, 29, 29);
    doc.rect(marginX, y, contentW, 6.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('SOURCE', marginX + 2, y + 4.3);
    doc.text('CODE / ELEMENT', marginX + 32, y + 4.3);
    doc.text('TYPE / SEVERITY', marginX + 66, y + 4.3);
    doc.text('DIAGNOSTIC DESCRIPTION', marginX + 106, y + 4.3);
    y += 6.2;

    for (const log of payload.faultLogs) {
      const descLines = doc.splitTextToSize(log.description, 74) as string[];
      const rowH = Math.max(6, descLines.length * 3.8 + 2.4);
      y = ensureSpace(y, rowH + 2);

      doc.setFillColor(254, 242, 242);
      doc.rect(marginX, y, contentW, rowH, 'F');
      doc.setDrawColor(252, 165, 165);
      doc.line(marginX, y + rowH, marginX + contentW, y + rowH);

      doc.setFont('courier', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(153, 27, 27);
      doc.text(log.source, marginX + 2, y + 4);
      doc.text(log.codeOrElement.slice(0, 18), marginX + 32, y + 4);
      doc.text(log.severityOrType.slice(0, 22), marginX + 66, y + 4);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.text(descLines, marginX + 106, y + 4);
      y += rowH;
    }
    y += 6;
  }

  // =========================================================================
  // TECHNICIAN BENCH NOTES
  // =========================================================================
  const noteLines = doc.splitTextToSize(payload.technicianNotes, contentW - 6) as string[];
  const notesBoxH = Math.max(14, noteLines.length * 4 + 6);
  y = ensureSpace(y, notesBoxH + 10);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('TECHNICIAN BENCH NOTES & RECOMMENDATIONS', marginX, y);
  y += 2.8;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(marginX, y, contentW, notesBoxH, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(30, 41, 59);
  doc.text(noteLines, marginX + 3, y + 5.2);
  y += notesBoxH + 7;

  // =========================================================================
  // CRYPTOGRAPHIC AUTHENTICITY SEAL & EMBEDDED VERIFICATION QR CODE
  // =========================================================================
  y = ensureSpace(y, 44);
  doc.setFillColor(15, 23, 42);
  doc.setDrawColor(14, 165, 233);
  doc.setLineWidth(0.5);
  doc.roundedRect(marginX, y, contentW, 40, 2, 2, 'FD');

  if (qrDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(marginX + 3.5, y + 3.5, 33, 33, 1.2, 1.2, 'F');
    doc.addImage(qrDataUrl, 'PNG', marginX + 4.5, y + 4.5, 31, 31);
  }

  const sealTextX = marginX + 41;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(56, 189, 248);
  doc.text('CRYPTOGRAPHIC SHA-256 AUTHENTICITY SEAL', sealTextX, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(226, 232, 240);
  doc.text(`Document ID: ${reportId}   |   Schema: AELP-CLIENT-1`, sealTextX, y + 13.5);
  doc.text(
    'This A4 client record is sealed with an offline SHA-256 digest over all measurements, pin voltages, and fault logs.',
    sealTextX,
    y + 18.5
  );

  doc.setFont('courier', 'bold');
  doc.setFontSize(6.6);
  doc.setTextColor(167, 243, 208);
  doc.text(`SHA-256: ${sha256Hash.slice(0, 32)}`, sealTextX, y + 25.5);
  doc.text(`         ${sha256Hash.slice(32)}`, sealTextX, y + 29.8);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.4);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'Any post-export modification invalidates the SHA-256 digest & verification token.',
    sealTextX,
    y + 35.5
  );

  // Page Footers across all pages
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(marginX, pageH - 12, pageW - marginX, pageH - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `AutoElectric Lab Pro · Signed Client Diagnostic Record (${reportId}) · SHA-256: ${sha256Hash.slice(0, 14)}...`,
      marginX,
      pageH - 7.5
    );
    doc.text(`Page ${p} of ${pageCount}`, pageW - marginX, pageH - 7.5, { align: 'right' });
  }

  const filename = `${sanitizeFileSlug(payload.reportTitle)}-${reportId.toLowerCase()}.pdf`;
  const pdfArrayBuffer = doc.output('arraybuffer');
  const pdfBytes = new Uint8Array(pdfArrayBuffer);

  if (!input.skipBrowserDownload && typeof window !== 'undefined' && typeof document !== 'undefined') {
    doc.save(filename);
  }

  return {
    envelope,
    filename,
    qrDataUrl,
    pdfBytes,
    pageCount,
  };
}
