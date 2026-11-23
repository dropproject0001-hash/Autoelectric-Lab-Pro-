import {
  buildSignedLabReportEnvelope,
  computeOfflineSha256Hex,
  type InstitutionalStudentInfo,
  type SignedLabReportEnvelope,
} from '../../services/universityLabPdfService';
import type {
  CapturedLabStepEvidence,
  UniversityLabModule,
} from '../../data/universityLabCurriculum';
import type {
  DiagnosticTroubleCode,
  InjectedFault,
  PowerSupplyState,
  WireConnection,
} from '../../types/ecu';

export interface AcademySignedSessionLogEntry {
  sha256Hash: string;
  qrToken: string;
  studentName: string;
  studentAccountCode: string;
  campus: string;
  terminalBay: string;
  moduleCode: string;
  moduleTitle: string;
  generatedAtIso: string;
  stepCount: number;
  envelope: SignedLabReportEnvelope;
}

const SESSION_LOG_STORAGE_KEY = 'aelp_academy_signed_sessions_v1';
const memorySignedSessionLogs = new Map<string, AcademySignedSessionLogEntry>();

function persistSessionLogsToBrowser(): void {
  if (typeof window === 'undefined') return;
  try {
    const entries = Array.from(memorySignedSessionLogs.values()).slice(-50);
    window.localStorage.setItem(SESSION_LOG_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage quota or private mode restrictions
  }
}

export function loadSignedAcademySessionLogs(): AcademySignedSessionLogEntry[] {
  if (typeof window !== 'undefined' && memorySignedSessionLogs.size === 0) {
    try {
      const raw = window.localStorage.getItem(SESSION_LOG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AcademySignedSessionLogEntry[];
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item?.sha256Hash) {
              memorySignedSessionLogs.set(item.sha256Hash.toLowerCase(), item);
            }
          }
        }
      }
    } catch {
      // Ignore corrupt local cache
    }
  }
  return Array.from(memorySignedSessionLogs.values()).sort((a, b) =>
    b.generatedAtIso.localeCompare(a.generatedAtIso)
  );
}

export function findSignedAcademySessionByHash(
  sha256Hash: string
): AcademySignedSessionLogEntry | null {
  loadSignedAcademySessionLogs();
  return memorySignedSessionLogs.get(sha256Hash.trim().toLowerCase()) || null;
}

export function clearAcademySignedSessionLogsForTests(): void {
  memorySignedSessionLogs.clear();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(SESSION_LOG_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}

/**
 * Cryptographically signs a completed lab session using Web Crypto SHA-256
 * over canonical student identity, metadata, and read-only locked MNA telemetry.
 */
export function recordSignedAcademySessionEnvelope(
  envelope: SignedLabReportEnvelope
): AcademySignedSessionLogEntry {
  const entry: AcademySignedSessionLogEntry = {
    sha256Hash: envelope.sha256Hash.toLowerCase(),
    qrToken: envelope.qrToken,
    studentName: `${envelope.payload.student.firstName} ${envelope.payload.student.lastName}`.trim(),
    studentAccountCode: envelope.payload.student.studentAccountCode,
    campus: envelope.payload.student.universityCampus,
    terminalBay: envelope.payload.student.labTerminal,
    moduleCode: envelope.payload.module.exerciseCode,
    moduleTitle: envelope.payload.module.titleTaglish,
    generatedAtIso: envelope.payload.generatedAtIso,
    stepCount: envelope.payload.stepResults.length,
    envelope,
  };

  memorySignedSessionLogs.set(entry.sha256Hash, entry);
  persistSessionLogsToBrowser();
  return entry;
}

export async function signAcademyLabSession(input: {
  student: InstitutionalStudentInfo;
  boundSessionRef: string;
  module: UniversityLabModule;
  capturedEvidence: Record<string, CapturedLabStepEvidence>;
  powerSupply: PowerSupplyState;
  peakCurrentDrawAmps: number;
  activeDTCs: DiagnosticTroubleCode[];
  faults: InjectedFault[];
  wires: WireConnection[];
  waveformDigest: string;
}): Promise<SignedLabReportEnvelope> {
  const capturedSteps = Object.values(input.capturedEvidence).sort(
    (a, b) => a.stepNumber - b.stepNumber
  );
  const envelope = await buildSignedLabReportEnvelope({
    student: input.student,
    boundSessionRef: input.boundSessionRef,
    module: input.module,
    powerSupply: input.powerSupply,
    supplyCurrentDrawAmps: input.peakCurrentDrawAmps,
    faults: input.faults,
    wires: input.wires,
    activeDTCs: input.activeDTCs,
    capturedSteps,
    waveformDigest: input.waveformDigest,
  });
  recordSignedAcademySessionEnvelope(envelope);
  return envelope;
}

export { computeOfflineSha256Hex };
