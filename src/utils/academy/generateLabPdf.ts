/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import {
  generateAndDownloadUniversityLabPdf,
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
import { recordSignedAcademySessionEnvelope } from './labCryptoSigner';

export interface GenerateAcademyLabPdfParams {
  student: InstitutionalStudentInfo;
  boundSessionRef: string;
  module: UniversityLabModule;
  capturedEvidence: Record<string, CapturedLabStepEvidence>;
  powerSupply: PowerSupplyState;
  peakCurrentDrawAmps: number;
  activeDTCs: DiagnosticTroubleCode[];
  faults: InjectedFault[];
  wires: WireConnection[];
  download?: boolean;
}

/**
 * Generates an official institutional A4 practical exam PDF sheet with embedded QR code,
 * full SHA-256 hash, tamper-warning header/footer, and records the signed session log
 * for offline Instructor QR/SHA-256 verification.
 */
export async function generateAcademyLabPdf(
  params: GenerateAcademyLabPdfParams
): Promise<{
  envelope: SignedLabReportEnvelope;
  fileName: string;
}> {
  const capturedSteps = Object.values(params.capturedEvidence).sort(
    (a, b) => a.stepNumber - b.stepNumber
  );
  const result = await generateAndDownloadUniversityLabPdf({
    student: params.student,
    boundSessionRef: params.boundSessionRef,
    module: params.module,
    powerSupply: params.powerSupply,
    supplyCurrentDrawAmps: params.peakCurrentDrawAmps,
    faults: params.faults,
    wires: params.wires,
    activeDTCs: params.activeDTCs,
    capturedSteps,
    rpm: params.module.rpmOverride.rpm,
    ckpSignalLost: Boolean(params.module.rpmOverride.ckpSignalLost),
    tpsVoltage: 0.9,
    skipBrowserDownload: params.download === false,
  });

  // Record the exact signed envelope stamped on the PDF so Instructor 64-char SHA-256 lookup matches 100%
  recordSignedAcademySessionEnvelope(result.envelope);

  return {
    envelope: result.envelope,
    fileName: result.filename,
  };
}
