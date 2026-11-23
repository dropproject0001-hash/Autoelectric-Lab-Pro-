import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import {
  getUniversityTierMeta,
  type CapturedLabStepEvidence,
  type UniversityLabModule,
} from '../data/universityLabCurriculum';
import { SignalGenerator } from '../simulation/signals/SignalGenerator';
import type {
  DiagnosticTroubleCode,
  InjectedFault,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';

export interface InstitutionalStudentInfo {
  firstName: string;
  lastName: string;
  studentAccountCode: string;
  universityCampus: string;
  labTerminal: string;
  studentConclusion: string;
}

export interface VerifiedLabBenchConditions {
  injectedFaultsSummary: string[];
  psuVoltageSetting: number;
  psuEnabled: boolean;
  peakCurrentDrawAmps: number;
  activeDtcs: string[];
  oscilloscopeSummary: string;
  waveformDigest: string;
}

export interface VerifiedLabReportCanonicalPayload {
  schemaVersion: 'AELP-UNIV-1';
  verificationMode: 'OFFLINE_SHA256_WORKSTATION';
  measurementProvenance: 'SIMULATED_BENCH_WORKSTATION';
  generatedAtIso: string;
  student: {
    firstName: string;
    lastName: string;
    studentAccountCode: string;
    boundSessionRef: string;
    universityCampus: string;
    labTerminal: string;
  };
  module: {
    id: string;
    exerciseCode: string;
    tier: string;
    tierLabel: string;
    titleTaglish: string;
    targetUnit: string;
  };
  benchConditions: VerifiedLabBenchConditions;
  stepResults: Array<{
    stepNumber: number;
    title: string;
    measured: string;
    criteria: string;
    status: string;
    capturedAtIso: string;
  }>;
  studentConclusion: string;
}

export interface SignedLabReportEnvelope {
  payload: VerifiedLabReportCanonicalPayload;
  sha256Hash: string;
  qrToken: string;
}

export interface OfflineVerificationResult {
  valid: boolean;
  status: 'GENUINE' | 'TAMPERED' | 'INVALID_FORMAT';
  reasonTaglish: string;
  expectedHash?: string;
  computedHash?: string;
  payload?: VerifiedLabReportCanonicalPayload;
}

const QR_TOKEN_PREFIX = 'AELP1|';

/**
 * Strips control characters, trims, and clamps user-entered text safely
 * for PDF cell layout, canonical hashing, and UI rendering.
 */
export function sanitizeInstitutionalText(raw: string, maxLen: number): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Recursively sorts object keys for bit-exact deterministic JSON serialization
 * across browsers and Node runtimes.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonStringify(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Computes lowercase hex SHA-256 digest via standard Web Crypto API (works offline in browsers & Node 20+).
 */
export async function computeOfflineSha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto SHA-256 is unavailable in this environment.');
  }
  const digestBuffer = await subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(digestBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeHexEqual(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left.length !== right.length || left.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

function encodeUtf8Base64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeUtf8Base64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (encoded.length % 4)) % 4);
  if (typeof atob === 'function') {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function validateStudentForm(info: InstitutionalStudentInfo): {
  valid: boolean;
  missingFields: string[];
} {
  const missing: string[] = [];
  if (sanitizeInstitutionalText(info.firstName, 60).length < 1) missing.push('Pangalan (First Name)');
  if (sanitizeInstitutionalText(info.lastName, 60).length < 1) missing.push('Apelyido (Last Name)');
  if (sanitizeInstitutionalText(info.studentAccountCode, 48).length < 2) missing.push('Student / Account Code');
  if (sanitizeInstitutionalText(info.universityCampus, 100).length < 2) missing.push('University / Campus');
  if (sanitizeInstitutionalText(info.labTerminal, 80).length < 2) missing.push('Lab Terminal / Station');
  if (sanitizeInstitutionalText(info.studentConclusion, 500).length < 5) {
    missing.push('Konklusyon at Repair Action ng Estudyante');
  }
  return { valid: missing.length === 0, missingFields: missing };
}

/**
 * Builds the canonical signed exam record, SHA-256 digest, and compact offline QR token.
 */
export async function buildSignedLabReportEnvelope(input: {
  student: InstitutionalStudentInfo;
  boundSessionRef: string;
  module: UniversityLabModule | null;
  powerSupply: PowerSupplyState;
  supplyCurrentDrawAmps: number;
  faults: readonly InjectedFault[];
  wires: readonly WireConnection[];
  activeDTCs: readonly DiagnosticTroubleCode[];
  capturedSteps: readonly CapturedLabStepEvidence[];
  waveformDigest: string;
  oscilloscopeSummary?: string;
  generatedAtIso?: string;
}): Promise<SignedLabReportEnvelope> {
  const generatedAtIso = input.generatedAtIso || new Date().toISOString();
  const cutWires = input.wires.filter((w) => w.isCut);
  const faultDescriptions = [
    ...input.faults.map((f) => `${f.pinId}: ${f.faultType} (${sanitizeInstitutionalText(f.description, 90)})`),
    ...cutWires.map((w) => `Wire Cut: ${sanitizeInstitutionalText(w.label || w.id, 60)}`),
  ];

  const tierMeta = input.module ? getUniversityTierMeta(input.module.tier) : null;

  const payload: VerifiedLabReportCanonicalPayload = {
    schemaVersion: 'AELP-UNIV-1',
    verificationMode: 'OFFLINE_SHA256_WORKSTATION',
    measurementProvenance: 'SIMULATED_BENCH_WORKSTATION',
    generatedAtIso,
    student: {
      firstName: sanitizeInstitutionalText(input.student.firstName, 60),
      lastName: sanitizeInstitutionalText(input.student.lastName, 60),
      studentAccountCode: sanitizeInstitutionalText(input.student.studentAccountCode, 48),
      boundSessionRef: sanitizeInstitutionalText(input.boundSessionRef || 'PIN-WORKSTATION', 48),
      universityCampus: sanitizeInstitutionalText(input.student.universityCampus, 100),
      labTerminal: sanitizeInstitutionalText(input.student.labTerminal, 80),
    },
    module: input.module
      ? {
          id: input.module.id,
          exerciseCode: input.module.exerciseCode,
          tier: input.module.tier,
          tierLabel: tierMeta?.titleTaglish ?? input.module.tier,
          titleTaglish: input.module.titleTaglish,
          targetUnit: input.module.targetUnit,
        }
      : {
          id: 'custom-bench-practical',
          exerciseCode: 'BENCH-PRACTICAL',
          tier: 'CUSTOM',
          tierLabel: 'Custom Bench Assessment',
          titleTaglish: 'General ECU Bench Practical Diagnostics',
          targetUnit: 'Universal 16-Pin Bench Trainer (Simulation Model)',
        },
    benchConditions: {
      injectedFaultsSummary: faultDescriptions.slice(0, 8),
      psuVoltageSetting: Number(input.powerSupply.voltageSetting.toFixed(2)),
      psuEnabled: Boolean(input.powerSupply.isOutputEnabled),
      peakCurrentDrawAmps: Number(input.supplyCurrentDrawAmps.toFixed(2)),
      activeDtcs: input.activeDTCs.slice(0, 10).map((d) => d.code),
      oscilloscopeSummary: sanitizeInstitutionalText(
        input.oscilloscopeSummary ||
          input.module?.oscilloscopeCriteriaLabel ||
          'CH1 Live MNA Signal Snapshot',
        120
      ),
      waveformDigest: sanitizeInstitutionalText(input.waveformDigest || 'NO_SCOPE_DATA', 32),
    },
    stepResults: input.capturedSteps.slice(0, 12).map((s) => ({
      stepNumber: s.stepNumber,
      title: sanitizeInstitutionalText(s.titleTaglish, 90),
      measured: sanitizeInstitutionalText(`${s.measuredDisplay} ${s.measuredUnit}`.trim(), 32),
      criteria: sanitizeInstitutionalText(s.expectedCriteria, 64),
      status: s.status,
      capturedAtIso: s.capturedAtIso,
    })),
    studentConclusion: sanitizeInstitutionalText(input.student.studentConclusion, 500),
  };

  const canonicalString = canonicalJsonStringify(payload);
  const sha256Hash = await computeOfflineSha256Hex(canonicalString);
  const envelopeJson = JSON.stringify({ p: payload, h: sha256Hash });
  const qrToken = `${QR_TOKEN_PREFIX}${encodeUtf8Base64Url(envelopeJson)}`;

  return { payload, sha256Hash, qrToken };
}

/**
 * Offline Instructor Verification Engine:
 * Accepts either an `AELP1|...` QR token or raw JSON `{ p, h }` envelope, recomputes
 * the canonical SHA-256 digest offline, and reports GENUINE vs TAMPERED.
 */
export async function verifyOfflineLabReportToken(rawInput: string): Promise<OfflineVerificationResult> {
  const trimmed = String(rawInput ?? '').trim();
  if (!trimmed) {
    return {
      valid: false,
      status: 'INVALID_FORMAT',
      reasonTaglish: 'Walang laman ang verification input. I-paste ang QR token (AELP1|...) mula sa PDF report.',
    };
  }

  let parsedEnvelope: { p?: VerifiedLabReportCanonicalPayload; h?: string };
  try {
    const jsonString = trimmed.startsWith(QR_TOKEN_PREFIX)
      ? decodeUtf8Base64Url(trimmed.slice(QR_TOKEN_PREFIX.length))
      : trimmed;
    parsedEnvelope = JSON.parse(jsonString) as { p?: VerifiedLabReportCanonicalPayload; h?: string };
  } catch {
    return {
      valid: false,
      status: 'INVALID_FORMAT',
      reasonTaglish:
        'Hindi mabasa ang verification token. Siguraduhing kumpleto ang kinopyang QR code string (nagsisimula sa AELP1|).',
    };
  }

  if (
    !parsedEnvelope ||
    typeof parsedEnvelope !== 'object' ||
    !parsedEnvelope.p ||
    typeof parsedEnvelope.h !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(parsedEnvelope.h.trim())
  ) {
    return {
      valid: false,
      status: 'INVALID_FORMAT',
      reasonTaglish: 'Kulang o mali ang istruktura ng QR cryptographic envelope (kulang ang payload o 64-char SHA-256 hash).',
    };
  }

  const payload = parsedEnvelope.p;
  if (payload.schemaVersion !== 'AELP-UNIV-1' || !payload.student || !payload.module) {
    return {
      valid: false,
      status: 'INVALID_FORMAT',
      reasonTaglish: 'Hindi kilalang bersyon ng AutoElectric Lab Pro exam sheet.',
    };
  }

  const expectedHash = parsedEnvelope.h.trim().toLowerCase();
  const recomputedHash = await computeOfflineSha256Hex(canonicalJsonStringify(payload));

  if (!constantTimeHexEqual(expectedHash, recomputedHash)) {
    return {
      valid: false,
      status: 'TAMPERED',
      reasonTaglish:
        'BABALA — TAMPERED / HASH MISMATCH! May binagong teksto, pangalan, petsa, o sukat sa verification record matapos itong i-export.',
      expectedHash,
      computedHash: recomputedHash,
      payload,
    };
  }

  return {
    valid: true,
    status: 'GENUINE',
    reasonTaglish:
      '100% GENUINE OFFLINE LAB SESSION — Tugma ang SHA-256 cryptographic hash sa lahat ng student details, MNA telemetry, at step results.',
    expectedHash,
    computedHash: recomputedHash,
    payload,
  };
}

/**
 * Captures the live Oscilloscope canvas from the DOM if mounted, otherwise renders
 * a crisp deterministic waveform snapshot directly from SignalGenerator + MNA voltages.
 */
export async function captureOscilloscopeSnapshotPng(options: {
  signalMode: 'CAN_BUS' | 'INJECTOR_PWM' | 'CRANK_CKP' | 'TPS_DC' | 'O2_LAMBDA';
  isPowerOn: boolean;
  rpm: number;
  hasCanFault: boolean;
  hasInjectorFault: boolean;
  ckpSignalLost: boolean;
  tpsVoltage: number;
}): Promise<{ dataUrl: string; waveformDigest: string; sourceLabel: string }> {
  // 1. Prefer live mounted oscilloscope canvas when available in browser DOM
  if (typeof document !== 'undefined') {
    const liveCanvas = document.querySelector<HTMLCanvasElement>('canvas[data-scope-canvas="true"]');
    if (liveCanvas && liveCanvas.width > 0 && liveCanvas.height > 0) {
      try {
        const dataUrl = liveCanvas.toDataURL('image/png');
        if (dataUrl.startsWith('data:image/png;base64,') && dataUrl.length > 200) {
          const digest = (await computeOfflineSha256Hex(dataUrl.slice(0, 4096))).slice(0, 16);
          return {
            dataUrl,
            waveformDigest: `LIVE-${digest}`,
            sourceLabel: 'Live Bench Oscilloscope Canvas',
          };
        }
      } catch {
        // Fall through to deterministic offscreen synthesis
      }
    }
  }

  // 2. Deterministic offscreen waveform render from SignalGenerator
  const width = 640;
  const height = 210;
  if (typeof document === 'undefined') {
    const fallbackDigest = (
      await computeOfflineSha256Hex(
        `${options.signalMode}|${options.isPowerOn}|${options.rpm}|${options.tpsVoltage.toFixed(2)}`
      )
    ).slice(0, 16);
    return {
      dataUrl: '',
      waveformDigest: `MNA-${fallbackDigest}`,
      sourceLabel: 'Deterministic MNA Signal Model',
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { dataUrl: '', waveformDigest: 'MNA-NOCANVAS', sourceLabel: 'Deterministic MNA Signal Model' };
  }

  // Background + subtle oscilloscope graticule
  ctx.fillStyle = '#07111c';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#18314b';
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += width / 10) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += height / 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const samples = 240;
  const valuesCh1: number[] = [];
  const valuesCh2: number[] = [];

  for (let i = 0; i < samples; i += 1) {
    const tSec = (i / samples) * 0.04; // 40ms capture window
    if (!options.isPowerOn) {
      valuesCh1.push(0);
      continue;
    }
    switch (options.signalMode) {
      case 'CAN_BUS': {
        const frame = SignalGenerator.getCanBusSignals(tSec, options.hasCanFault);
        valuesCh1.push(frame.canHigh);
        valuesCh2.push(frame.canLow);
        break;
      }
      case 'INJECTOR_PWM': {
        const v = SignalGenerator.getInjectorWaveform(
          tSec,
          options.hasInjectorFault,
          12.6,
          Math.max(250, options.rpm)
        );
        valuesCh1.push(v);
        break;
      }
      case 'CRANK_CKP': {
        const v = SignalGenerator.getCrankshaftVrSignal(
          tSec,
          Math.max(250, options.rpm),
          options.ckpSignalLost
        );
        valuesCh1.push(v);
        break;
      }
      case 'O2_LAMBDA': {
        valuesCh1.push(
          Math.min(1.1, Math.max(0.05, 0.45 + 0.35 * Math.sin(tSec * 2 * Math.PI * 1.25)))
        );
        break;
      }
      default: {
        valuesCh1.push(options.tpsVoltage);
        break;
      }
    }
  }

  const maxScale =
    options.signalMode === 'INJECTOR_PWM'
      ? 65
      : options.signalMode === 'CAN_BUS'
        ? 5.0
        : options.signalMode === 'CRANK_CKP'
          ? 6.0
          : 5.5;
  const minScale = options.signalMode === 'CRANK_CKP' ? -6.0 : -0.5;

  const plotTrace = (pts: number[], color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    pts.forEach((v, idx) => {
      const x = (idx / Math.max(1, pts.length - 1)) * (width - 20) + 10;
      const norm = (v - minScale) / Math.max(0.001, maxScale - minScale);
      const y = height - 18 - Math.max(0, Math.min(1, norm)) * (height - 36);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };

  plotTrace(valuesCh1, '#22d3ee');
  if (valuesCh2.length > 0) {
    plotTrace(valuesCh2, '#f59e0b');
  }

  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(
    `AUTOELECTRIC LAB PRO · MNA SCOPE SNAPSHOT · ${options.signalMode} · ${options.isPowerOn ? `${options.rpm} RPM` : 'PSU OFF'}`,
    12,
    18
  );

  const dataUrl = canvas.toDataURL('image/png');
  const digest = (await computeOfflineSha256Hex(dataUrl.slice(0, 4096))).slice(0, 16);
  return {
    dataUrl,
    waveformDigest: `MNA-${digest}`,
    sourceLabel: 'Deterministic MNA Waveform Capture',
  };
}

/**
 * Generates and directly downloads an official print-ready A4 University Practical Exam Sheet PDF
 * containing Student Metadata, Bench Simulation Conditions, Embedded Oscilloscope Image,
 * Measured Criteria Table, Student Conclusion, and Offline SHA-256 + QR Cryptographic Stamp.
 */
export async function generateAndDownloadUniversityLabPdf(input: {
  student: InstitutionalStudentInfo;
  boundSessionRef: string;
  module: UniversityLabModule | null;
  powerSupply: PowerSupplyState;
  supplyCurrentDrawAmps: number;
  faults: readonly InjectedFault[];
  wires: readonly WireConnection[];
  activeDTCs: readonly DiagnosticTroubleCode[];
  capturedSteps: readonly CapturedLabStepEvidence[];
  rpm: number;
  ckpSignalLost: boolean;
  tpsVoltage: number;
  skipBrowserDownload?: boolean;
}): Promise<{
  filename: string;
  envelope: SignedLabReportEnvelope;
}> {
  const signalMode = input.module?.oscilloscopeSignal ?? 'INJECTOR_PWM';
  const hasCanFault =
    input.faults.some((f) => f.pinId === 'ecu-pin-13' || f.pinId === 'ecu-pin-14') ||
    input.wires.some((w) => (w.id === 'wire-10' || w.id === 'wire-11') && w.isCut);
  const hasInjectorFault =
    input.faults.some((f) => f.pinId === 'ecu-pin-10') ||
    input.wires.some((w) => w.id === 'wire-9' && w.isCut);

  const scopeCapture = await captureOscilloscopeSnapshotPng({
    signalMode,
    isPowerOn: input.powerSupply.isOutputEnabled,
    rpm: input.rpm,
    hasCanFault,
    hasInjectorFault,
    ckpSignalLost: input.ckpSignalLost,
    tpsVoltage: input.tpsVoltage,
  });

  const envelope = await buildSignedLabReportEnvelope({
    student: input.student,
    boundSessionRef: input.boundSessionRef,
    module: input.module,
    powerSupply: input.powerSupply,
    supplyCurrentDrawAmps: input.supplyCurrentDrawAmps,
    faults: input.faults,
    wires: input.wires,
    activeDTCs: input.activeDTCs,
    capturedSteps: input.capturedSteps,
    waveformDigest: scopeCapture.waveformDigest,
    oscilloscopeSummary: `${input.module?.oscilloscopeCriteriaLabel ?? signalMode} (${scopeCapture.sourceLabel})`,
  });

  const qrDataUrl = await QRCode.toDataURL(envelope.qrToken, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
    color: { dark: '#0f172a', light: '#ffffff' },
  });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  // --- Institutional Header Banner ---
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(margin, y, contentWidth, 24, 'F');
  doc.setDrawColor(245, 158, 11); // Amber 500 accent rule
  doc.setLineWidth(0.7);
  doc.line(margin, y + 24, margin + contentWidth, y + 24);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(envelope.payload.student.universityCampus.toUpperCase(), margin + 4, y + 9);

  doc.setTextColor(251, 191, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    'AutoElectric Lab Pro · Opisyal na Diagnostic Practical Exam Sheet (Taglish Curriculum)',
    margin + 4,
    y + 15.5
  );

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(7.5);
  doc.text(
    'PROVENANCE: SIMULATED BENCH WORKSTATION TELEMETRY (NON-PHYSICAL MNA MODEL)',
    margin + 4,
    y + 21
  );

  y += 28;

  // --- Student & Exam Metadata Box ---
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, contentWidth, 24, 'FD');

  const formattedDate = new Date(envelope.payload.generatedAtIso).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(71, 85, 105);
  doc.text('PANGALAN NG ESTUDYANTE:', margin + 3, y + 6);
  doc.text('STUDENT / ACCOUNT CODE:', margin + 3, y + 12.5);
  doc.text('LEVEL / TRACK:', margin + 3, y + 19);

  doc.text('PETSA AT ORAS:', margin + 98, y + 6);
  doc.text('LAB TERMINAL / STATION:', margin + 98, y + 12.5);
  doc.text('MODULE:', margin + 98, y + 19);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(
    `${envelope.payload.student.firstName} ${envelope.payload.student.lastName}`.slice(0, 36),
    margin + 46,
    y + 6
  );
  doc.text(
    `${envelope.payload.student.studentAccountCode} (${envelope.payload.student.boundSessionRef})`.slice(0, 36),
    margin + 46,
    y + 12.5
  );
  doc.text(envelope.payload.module.tierLabel.slice(0, 36), margin + 46, y + 19);

  doc.text(formattedDate, margin + 136, y + 6);
  doc.text(envelope.payload.student.labTerminal.slice(0, 28), margin + 136, y + 12.5);
  doc.text(
    `${envelope.payload.module.exerciseCode} · ${envelope.payload.module.titleTaglish}`.slice(0, 30),
    margin + 136,
    y + 19
  );

  y += 29;

  // --- Section 1: Bench Simulation Conditions + Live Scope Snapshot ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('1. MGA KONDISYON NG BENCH SIMULATION (MNA PHYSICS ENGINE)', margin, y);
  y += 3.5;

  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, 54);

  const cond = envelope.payload.benchConditions;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(30, 41, 59);
  const faultText =
    cond.injectedFaultsSummary.length > 0
      ? cond.injectedFaultsSummary.join('; ')
      : 'Walang injected pin fault / nominal bench topology';
  const faultLines = doc.splitTextToSize(`• Injected Fault / Harness: ${faultText}`, contentWidth - 6);
  doc.text(faultLines.slice(0, 2), margin + 3, y + 5.5);

  doc.text(
    `• Bench PSU: ${cond.psuEnabled ? `${cond.psuVoltageSetting.toFixed(2)}V DC (ON)` : 'POWER OFF (0.00V)'}  |  Peak Current Draw: ${cond.peakCurrentDrawAmps.toFixed(2)} A  |  Active DTCs: ${cond.activeDtcs.join(', ') || 'None'}`,
    margin + 3,
    y + 14.5
  );
  doc.text(`• Oscilloscope Capture: ${cond.oscilloscopeSummary}`, margin + 3, y + 19.5);

  if (scopeCapture.dataUrl) {
    doc.addImage(scopeCapture.dataUrl, 'PNG', margin + 3, y + 22, contentWidth - 6, 29.5);
  } else {
    doc.setFillColor(15, 23, 42);
    doc.rect(margin + 3, y + 22, contentWidth - 6, 29.5, 'F');
    doc.setTextColor(226, 232, 240);
    doc.text(`MNA Waveform Digest: ${cond.waveformDigest}`, margin + 8, y + 38);
  }

  y += 59;

  // --- Section 2: Measured Diagnostic Values & Pass/Fail Criteria ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('2. MGA NASUKAT NA DIAGNOSTIC VALUES AT CRITERIA (AUTO-GRADED MNA/DMM)', margin, y);
  y += 3.5;

  // Table header
  doc.setFillColor(30, 41, 59);
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.8);
  doc.text('STEP / DIAGNOSTIC CHECK', margin + 2.5, y + 4.8);
  doc.text('NASUKAT (MNA)', margin + 84, y + 4.8);
  doc.text('CRITERIA / TOLERANCE', margin + 114, y + 4.8);
  doc.text('STATUS', margin + 157, y + 4.8);
  y += 7;

  const stepsToRender =
    envelope.payload.stepResults.length > 0
      ? envelope.payload.stepResults
      : [
          {
            stepNumber: 1,
            title: 'Walang naka-capture na lab step reading bago ang export',
            measured: 'N/A',
            criteria: 'Gamitin ang Capture Evidence button sa bawat step',
            status: 'UNCAPTURED',
            capturedAtIso: envelope.payload.generatedAtIso,
          },
        ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  for (let i = 0; i < Math.min(6, stepsToRender.length); i += 1) {
    const row = stepsToRender[i];
    const rowHeight = 8.5;
    if (i % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, rowHeight, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, contentWidth, rowHeight);

    doc.setTextColor(15, 23, 42);
    doc.text(row.title.slice(0, 46), margin + 2.5, y + 5.3);
    doc.setFont('courier', 'bold');
    doc.text(row.measured.slice(0, 16), margin + 84, y + 5.3);
    doc.setFont('helvetica', 'normal');
    doc.text(row.criteria.slice(0, 26), margin + 114, y + 5.3);

    if (row.status === 'PASSED') {
      doc.setTextColor(5, 150, 105);
      doc.setFont('helvetica', 'bold');
      doc.text('[PASSED]', margin + 157, y + 5.3);
    } else if (row.status === 'FAULT_CONFIRMED') {
      doc.setTextColor(180, 83, 9);
      doc.setFont('helvetica', 'bold');
      doc.text('[FAULT OK]', margin + 157, y + 5.3);
    } else {
      doc.setTextColor(190, 18, 60);
      doc.setFont('helvetica', 'bold');
      doc.text(`[${row.status.slice(0, 10)}]`, margin + 157, y + 5.3);
    }
    doc.setFont('helvetica', 'normal');
    y += rowHeight;
  }

  y += 5;

  // --- Section 3: Student Conclusion & Repair Action ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('3. KONKLUSYON AT REPAIR ACTION NG ESTUDYANTE', margin, y);
  y += 3.5;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, 24, 'FD');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.4);
  doc.setTextColor(30, 41, 59);
  const conclusionLines = doc.splitTextToSize(
    `"${envelope.payload.studentConclusion}"`,
    contentWidth - 6
  );
  doc.text(conclusionLines.slice(0, 4), margin + 3, y + 5.5);

  y += 29;

  // --- Section 4: Offline Cryptographic Authentication Stamp ---
  const stampY = Math.min(y, 236);
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.rect(margin, stampY, contentWidth, 45, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(15, 23, 42);
  doc.text(
    'OFFLINE SYSTEM CRYPTOGRAPHIC AUTHENTICATION STAMP (SHA-256 INTEGRITY)',
    margin + 3,
    stampY + 6
  );

  // QR Code Image
  doc.addImage(qrDataUrl, 'PNG', margin + 3.5, stampY + 9, 32, 32);

  // Stamp Details
  const infoX = margin + 39;
  doc.setFont('courier', 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(15, 23, 42);
  doc.text(`SHA-256: ${envelope.sha256Hash.slice(0, 32)}`, infoX, stampY + 13);
  doc.text(`         ${envelope.sha256Hash.slice(32, 64)}`, infoX, stampY + 17);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(30, 41, 59);
  doc.text(
    'Verifier: AutoElectric Lab Pro Offline SHA-256 Verifier (No Server Required)',
    infoX,
    stampY + 22.5
  );
  doc.text(
    `Bound Session: ${envelope.payload.student.studentAccountCode} · ${envelope.payload.student.boundSessionRef}`,
    infoX,
    stampY + 27.5
  );
  doc.text(
    `Station / Campus: ${envelope.payload.student.labTerminal} / ${envelope.payload.student.universityCampus}`.slice(0, 72),
    infoX,
    stampY + 32.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(5, 150, 105);
  doc.text('STATUS: GENUINE SIMULATED LAB BENCH SESSION', infoX, stampY + 37.5);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.1);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Paalala: Anumang binagong pangalan, boltahe, o score sa papel na ito ay magreresulta sa HASH MISMATCH sa Offline Verifier.',
    infoX,
    stampY + 42
  );

  const safeCode = envelope.payload.student.studentAccountCode.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeEx = envelope.payload.module.exerciseCode.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `AutoElectricLab-${safeEx}-${safeCode}-${envelope.sha256Hash.slice(0, 8)}.pdf`;

  if (!input.skipBrowserDownload && typeof document !== 'undefined') {
    doc.save(filename);
  }

  return { filename, envelope };
}
