/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { VerificationStatus } from '../types/provenance';

/**
 * Diagnostic Evidence Sources as required by Section 3 of the Master System Implementation Specification.
 */
export type DiagnosticEvidenceSource =
  | 'PHYSICAL_INSTRUMENT'
  | 'ELECTRICAL_SIMULATION'
  | 'VERIFIED_OEM_DOCUMENTATION'
  | 'UNIVERSAL_TRAINER_REFERENCE'
  | 'LOCAL_TECHNICAL_KNOWLEDGE'
  | 'UNVERIFIED_AI_RESPONSE';

/**
 * Diagnostic Evidence Statuses as required by Section 3.
 */
export type DiagnosticEvidenceStatus =
  | 'VALID'
  | 'STALE'
  | 'UNAVAILABLE'
  | 'UNRESOLVED'
  | 'UNVERIFIED';

/**
 * Strict ECU Identity & Pinout Provenance classification as required by Section 5.
 */
export type EcuIdentityProvenanceTier =
  | 'UNIVERSAL_TRAINER'
  | 'VERIFIED_OEM'
  | 'UNVERIFIED_OEM';

export interface DiagnosticEvidenceEnvelope {
  source: DiagnosticEvidenceSource;
  status: DiagnosticEvidenceStatus;
  ecuProvenanceTier: EcuIdentityProvenanceTier;
  isActualMeasurement: boolean;
  isExpectedReference: boolean;
  isEducationalOnly: boolean;
  timestampMs: number;
  staleThresholdMs: number;
  sourceLabelEN: string;
  sourceLabelTL: string;
  uncertaintyNoticeEN?: string;
  uncertaintyNoticeTL?: string;
}

export interface EcuIdentityVerificationInput {
  brandKey?: string | null;
  modelName?: string | null;
  ecuProfileId?: string | null;
  ecuPartNumber?: string | null;
  connectorCode?: string | null;
  ecuStatus?: 'VERIFIED' | 'OCR_VERIFY' | 'PART_METADATA_ONLY' | 'MECHANICAL_NO_ECU' | string;
  hasVerifiedPinoutMap?: boolean;
  orientationConfirmed?: boolean;
  provenanceStatus?: VerificationStatus;
}

export interface EcuIdentityVerificationResult {
  tier: EcuIdentityProvenanceTier;
  isUniversalTrainer: boolean;
  isVerifiedOem: boolean;
  isUnverifiedOem: boolean;
  canUseOemSpecifications: boolean;
  requiresClarification: boolean;
  missingDetails: string[];
  clarificationPromptEN: string;
  clarificationPromptTL: string;
  badgeLabel: string;
}

/**
 * Verifies ECU identity, connector orientation, and source applicability before using OEM specifications.
 * Never allows Universal Trainer information to silently become an OEM pinout.
 */
export function verifyEcuIdentityAndPinoutProvenance(
  input: EcuIdentityVerificationInput
): EcuIdentityVerificationResult {
  const brandKey = (input.brandKey || '').trim().toLowerCase();

  // 1. Universal 16-Pin Bench Trainer
  if (
    !brandKey ||
    brandKey === 'universal-bench' ||
    input.provenanceStatus === 'SIMULATION_ONLY' ||
    input.ecuProfileId === 'universal-16pin-bench-trainer'
  ) {
    return {
      tier: 'UNIVERSAL_TRAINER',
      isUniversalTrainer: true,
      isVerifiedOem: false,
      isUnverifiedOem: false,
      canUseOemSpecifications: false,
      requiresClarification: false,
      missingDetails: [],
      clarificationPromptEN:
        'Using Universal 16-Pin Bench Trainer reference. Do not apply these educational trainer pin numbers to a physical OEM vehicle ECU.',
      clarificationPromptTL:
        'Gamit ang Universal 16-Pin Bench Trainer reference. Huwag gamitin ang educational trainer pin numbers na ito sa aktwal na OEM vehicle ECU.',
      badgeLabel: 'UNIVERSAL TRAINER',
    };
  }

  // 2. Check for missing identification fields required for OEM specs
  const missingDetails: string[] = [];
  if (!input.modelName || !input.modelName.trim()) {
    missingDetails.push('Vehicle Model / Engine Code');
  }
  if (!input.ecuProfileId && !input.ecuPartNumber) {
    missingDetails.push('ECU Hardware Part Number / Profile');
  }
  if (input.ecuStatus === 'PART_METADATA_ONLY') {
    missingDetails.push('Verified OEM Factory Wiring Diagram (Metadata-only model)');
  }
  if (input.ecuStatus === 'MECHANICAL_NO_ECU') {
    missingDetails.push('Electronic Engine ECU (Mechanical fuel injection platform)');
  }
  if (input.ecuStatus === 'OCR_VERIFY' && input.orientationConfirmed === false) {
    missingDetails.push('ECU Sticker Part Number & Connector Orientation Confirmation');
  }
  if (input.hasVerifiedPinoutMap === false) {
    missingDetails.push('Verified Connector Pinout Map');
  }
  if (
    input.provenanceStatus &&
    input.provenanceStatus !== 'OEM_VERIFIED' &&
    input.provenanceStatus !== 'OFFICIAL_MANUFACTURER'
  ) {
    missingDetails.push(`Authoritative OEM Provenance (current: ${input.provenanceStatus})`);
  }

  const isVerifiedOem =
    missingDetails.length === 0 &&
    input.ecuStatus !== 'PART_METADATA_ONLY' &&
    input.ecuStatus !== 'MECHANICAL_NO_ECU' &&
    input.hasVerifiedPinoutMap !== false &&
    (input.ecuStatus === 'VERIFIED' ||
      (input.ecuStatus === 'OCR_VERIFY' && input.orientationConfirmed === true));

  if (isVerifiedOem) {
    return {
      tier: 'VERIFIED_OEM',
      isUniversalTrainer: false,
      isVerifiedOem: true,
      isUnverifiedOem: false,
      canUseOemSpecifications: true,
      requiresClarification: false,
      missingDetails: [],
      clarificationPromptEN: `Verified OEM ECU Profile (${input.brandKey} ${input.modelName || ''}). Confirm physical connector cavity numbering before probing.`,
      clarificationPromptTL: `Verified OEM ECU Profile (${input.brandKey} ${input.modelName || ''}). Kumpirmahin pa rin ang connector cavity numbering bago mag-probe.`,
      badgeLabel: 'VERIFIED OEM',
    };
  }

  const missingList = missingDetails.join(', ') || 'ECU Hardware Part Number & Connector Code';
  return {
    tier: 'UNVERIFIED_OEM',
    isUniversalTrainer: false,
    isVerifiedOem: false,
    isUnverifiedOem: true,
    canUseOemSpecifications: false,
    requiresClarification: true,
    missingDetails: missingDetails.length > 0 ? missingDetails : ['ECU Part Number', 'Connector Code'],
    clarificationPromptEN: `UNVERIFIED OEM PROFILE: Cannot verify OEM pin assignments. Please provide/confirm: ${missingList}. Never guess or fabricate OEM pinouts.`,
    clarificationPromptTL: `UNVERIFIED OEM PROFILE: Hindi pa kumpirmado ang OEM pin assignments. Paki-verify muna ang: ${missingList}. Huwag manghula ng OEM pinouts.`,
    badgeLabel: 'UNVERIFIED OEM',
  };
}

/**
 * Builds a traceable DiagnosticEvidenceEnvelope for any measurement or AI answer.
 */
export function buildDiagnosticEvidenceEnvelope(params: {
  source: DiagnosticEvidenceSource;
  status: DiagnosticEvidenceStatus;
  ecuProvenanceTier: EcuIdentityProvenanceTier;
  isActualMeasurement: boolean;
  isExpectedReference: boolean;
  timestampMs?: number;
  staleThresholdMs?: number;
  nowMs?: number;
  customUncertaintyEN?: string;
  customUncertaintyTL?: string;
}): DiagnosticEvidenceEnvelope {
  const nowMs = params.nowMs ?? Date.now();
  const timestampMs = params.timestampMs ?? nowMs;
  const staleThresholdMs = params.staleThresholdMs ?? 30_000;

  let effectiveStatus = params.status;
  if (
    effectiveStatus === 'VALID' &&
    params.isActualMeasurement &&
    nowMs - timestampMs > staleThresholdMs
  ) {
    effectiveStatus = 'STALE';
  }

  const sourceLabels: Record<DiagnosticEvidenceSource, { en: string; tl: string }> = {
    PHYSICAL_INSTRUMENT: {
      en: 'Physical Instrument Acquisition',
      tl: 'Aktwal na Physical Instrument Reading',
    },
    ELECTRICAL_SIMULATION: {
      en: 'Electrical MNA Circuit Simulation',
      tl: 'Simulated MNA Electrical Circuit',
    },
    VERIFIED_OEM_DOCUMENTATION: {
      en: 'Verified OEM Service Documentation',
      tl: 'Verified OEM Service Manual',
    },
    UNIVERSAL_TRAINER_REFERENCE: {
      en: 'Universal 16-Pin Bench Trainer Reference',
      tl: 'Universal 16-Pin Bench Trainer Reference',
    },
    LOCAL_TECHNICAL_KNOWLEDGE: {
      en: 'Local Verified Technical Knowledge DB',
      tl: 'Local Verified Technical Knowledge DB',
    },
    UNVERIFIED_AI_RESPONSE: {
      en: 'Unverified AI Response (Requires Manual Verification)',
      tl: 'Unverified AI Response (Kailangan ng Manual Check)',
    },
  };

  let uncertaintyNoticeEN = params.customUncertaintyEN;
  let uncertaintyNoticeTL = params.customUncertaintyTL;

  if (!uncertaintyNoticeEN) {
    if (effectiveStatus === 'UNRESOLVED') {
      uncertaintyNoticeEN =
        'UNRESOLVED NODE: This electrical node is floating or unreferenced to ground (KL31). Do not treat as a valid 0.00V reading.';
      uncertaintyNoticeTL =
        'UNRESOLVED NODE: Floating o walang ground path (KL31) ang node na ito. Huwag ituring na valid 0.00V reading.';
    } else if (effectiveStatus === 'UNAVAILABLE') {
      uncertaintyNoticeEN =
        'EVIDENCE UNAVAILABLE: Reliable measurement or verified OEM specification is unavailable. Do not guess pinouts or values.';
      uncertaintyNoticeTL =
        'WALANG VERIFIED EVIDENCE: Walang live measurement o verified OEM spec. Huwag manghula ng pinout o value.';
    } else if (effectiveStatus === 'STALE') {
      uncertaintyNoticeEN =
        'STALE MEASUREMENT: This reading was captured from a previous bench state and may not reflect current live circuit voltage.';
      uncertaintyNoticeTL =
        'LUMA NA ANG READING (STALE): Galing ito sa nakaraang bench state at maaaring iba na ang live circuit voltage ngayon.';
    } else if (effectiveStatus === 'UNVERIFIED' || params.source === 'UNVERIFIED_AI_RESPONSE') {
      uncertaintyNoticeEN =
        'UNVERIFIED REFERENCE: Confirm against official OEM wiring diagram and de-energized DMM continuity check before applying power.';
      uncertaintyNoticeTL =
        'UNVERIFIED REFERENCE: I-check muna sa official OEM wiring diagram at DMM continuity (PSU OFF) bago maglagay ng power.';
    }
  }

  return {
    source: params.source,
    status: effectiveStatus,
    ecuProvenanceTier: params.ecuProvenanceTier,
    isActualMeasurement: params.isActualMeasurement,
    isExpectedReference: params.isExpectedReference,
    isEducationalOnly: params.ecuProvenanceTier === 'UNIVERSAL_TRAINER',
    timestampMs,
    staleThresholdMs,
    sourceLabelEN: sourceLabels[params.source].en,
    sourceLabelTL: sourceLabels[params.source].tl,
    uncertaintyNoticeEN,
    uncertaintyNoticeTL,
  };
}
