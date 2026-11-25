/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { VerificationStatus } from '../types/provenance';

export interface PinoutSafetyCheckInput {
  ecuIdentified: boolean;
  ecuPartNumber?: string;
  connectorOrientationConfirmed: boolean;
  provenanceStatus: VerificationStatus;
  pinCategory?: 'power' | 'ground' | 'communication' | 'sensor_in' | 'actuator_out' | 'boot' | 'reference' | 'unknown';
  hasConflictingPinoutReports?: boolean;
  isObd2DlcPin?: boolean;
  isSimulatedValue?: boolean;
}

export interface PinoutSafetyEvaluation {
  canEnergizePhysicalBench: boolean;
  canEnergizeSimulatedBench: boolean;
  canInferPowerOrSignalPin: boolean;
  provenanceStatus: VerificationStatus;
  riskLevel: 'SAFE_WITH_DMM_CHECK' | 'CAUTION_VERIFY_MANUAL' | 'BLOCKED_HIGH_RISK';
  measurementOriginLabel: 'SIMULATED_BENCH_VALUE' | 'UNVERIFIED_PHYSICAL_SPEC';
  obd2DlcSeparationNotice: string;
  warnings: string[];
  requiredChecklist: string[];
}

const ENERGISABLE_STATUSES: ReadonlySet<VerificationStatus> = new Set([
  'OEM_VERIFIED',
  'OFFICIAL_MANUFACTURER',
]);

/**
 * Enforces strict electrical safety rules for ECU bench testing:
 * 1. Separates SAE J1962 OBD-II DLC pins from ECU harness connector pins.
 * 2. Prohibits applying live physical voltage from AI_INFERRED, SIMULATION_ONLY, COMMUNITY_UNVERIFIED, or UNKNOWN sources.
 * 3. Prohibits inferring power, ground, CAN, LIN, 5V reference, or driver pins without verified evidence.
 * 4. Requires explicit ECU part number + connector orientation confirmation before energizing.
 * 5. Clearly separates simulated bench calculations (SIMULATION_ONLY) from real physical measurements.
 */
export function evaluatePinoutSafety(input: PinoutSafetyCheckInput): PinoutSafetyEvaluation {
  const warnings: string[] = [];
  const requiredChecklist: string[] = [
    'Confirm exact ECU hardware part number stamped on housing before wiring.',
    'Confirm connector cavity numbering and view orientation (harness-side vs. ECU header-side).',
    'Verify ground pins (KL31 / E1) with a multimeter continuity check before connecting +12V.',
  ];

  const provenanceVerified = ENERGISABLE_STATUSES.has(input.provenanceStatus);
  const isSimulationOnlyTrainer = input.provenanceStatus === 'SIMULATION_ONLY';
  const sensitivePin =
    input.pinCategory === 'power' ||
    input.pinCategory === 'ground' ||
    input.pinCategory === 'communication' ||
    input.pinCategory === 'actuator_out' ||
    input.pinCategory === 'reference' ||
    input.pinCategory === 'boot';

  if (input.provenanceStatus === 'AI_INFERRED') {
    warnings.push(
      'AI-INFERRED DATA BLOCKED: Do NOT apply real bench voltage or assume pin polarity based solely on AI search results.'
    );
  } else if (isSimulationOnlyTrainer) {
    warnings.push(
      'SIMULATION-ONLY TRAINER: Generic 16-pin virtual training model. Do NOT use this simulated pinout to energize a physical OEM ECU bench.'
    );
  } else if (input.provenanceStatus === 'COMMUNITY_UNVERIFIED') {
    warnings.push(
      'COMMUNITY DATASET NOTICE: Community PID/pin references are unverified by the OEM and must not be used to power ECU terminals.'
    );
  } else if (input.provenanceStatus === 'UNKNOWN' || input.provenanceStatus === 'USER_SUPPLIED') {
    warnings.push(
      `PROVENANCE ${input.provenanceStatus}: Insufficient verified OEM evidence to infer power, ground, CAN/LIN, 5V reference, or driver pins.`
    );
  }

  if (!input.ecuIdentified || !(input.ecuPartNumber && input.ecuPartNumber.trim().length > 0)) {
    warnings.push(
      'ECU IDENTIFICATION INCOMPLETE: Exact ECU hardware part number is required because connector pins change across model years and emissions tiers.'
    );
  }

  if (!input.connectorOrientationConfirmed) {
    warnings.push(
      'CONNECTOR ORIENTATION UNCONFIRMED: Mirroring pin numbering between male ECU pins and female harness plug can reverse +12V and GND.'
    );
  }

  if (input.hasConflictingPinoutReports) {
    warnings.push(
      'CONFLICTING PINOUT DETECTED: Multiple pin assignments exist for this platform. Resolve against factory wiring diagram before energizing.'
    );
  }

  if (input.isObd2DlcPin) {
    warnings.push(
      'OBD-II DLC vs ECU CONNECTOR WARNING: SAE J1962 OBD-II DLC pins (e.g. Pin 16 +12V, Pin 6/14 CAN, Pin 7 K-Line) NEVER map 1:1 to ECU harness cavity numbers.'
    );
  }

  const canInferPowerOrSignalPin =
    provenanceVerified && !input.hasConflictingPinoutReports && input.ecuIdentified;

  const canEnergizePhysicalBench =
    provenanceVerified &&
    input.ecuIdentified &&
    Boolean(input.ecuPartNumber && input.ecuPartNumber.trim().length > 0) &&
    input.connectorOrientationConfirmed &&
    !input.hasConflictingPinoutReports;

  const canEnergizeSimulatedBench =
    canEnergizePhysicalBench ||
    (isSimulationOnlyTrainer &&
      input.ecuIdentified &&
      input.connectorOrientationConfirmed &&
      !input.hasConflictingPinoutReports);

  let riskLevel: PinoutSafetyEvaluation['riskLevel'] = 'SAFE_WITH_DMM_CHECK';
  if (isSimulationOnlyTrainer && canEnergizeSimulatedBench) {
    riskLevel = 'CAUTION_VERIFY_MANUAL';
  } else if (!provenanceVerified || input.hasConflictingPinoutReports || (sensitivePin && !canEnergizePhysicalBench)) {
    riskLevel = 'BLOCKED_HIGH_RISK';
  } else if (!canEnergizePhysicalBench) {
    riskLevel = 'CAUTION_VERIFY_MANUAL';
  }

  return {
    canEnergizePhysicalBench,
    canEnergizeSimulatedBench,
    canInferPowerOrSignalPin,
    provenanceStatus: input.provenanceStatus,
    riskLevel,
    measurementOriginLabel:
      input.isSimulatedValue === false ? 'UNVERIFIED_PHYSICAL_SPEC' : 'SIMULATED_BENCH_VALUE',
    obd2DlcSeparationNotice:
      'OBD-II J1962 DLC numbering (1..16) is distinct from OEM ECU connector cavity numbering.',
    warnings,
    requiredChecklist,
  };
}

export interface VehicleBenchSafetyInput {
  brandKey: string;
  modelName: string;
  ecuProfileId: string | null;
  ecuStatus: 'VERIFIED' | 'OCR_VERIFY' | 'PART_METADATA_ONLY' | 'MECHANICAL_NO_ECU';
  hasVerifiedPinoutMap: boolean;
  controllerNote: string;
  orientationConfirmed: boolean;
}

/**
 * Evaluates bench energizing safety for the active vehicle/ECU selection.
 * - Assigns SIMULATION_ONLY provenance to 'universal-bench' (blocks physical bench authorization while allowing virtual software simulation).
 * - Blocks both physical and simulated energizing for PART_METADATA_ONLY, MECHANICAL_NO_ECU, missing pinout maps,
 *   or OCR_VERIFY targets whose physical ECU housing & connector orientation are unconfirmed.
 */
export function evaluateVehicleBenchSafety(
  input: VehicleBenchSafetyInput
): PinoutSafetyEvaluation {
  if (input.brandKey === 'universal-bench') {
    return evaluatePinoutSafety({
      ecuIdentified: true,
      ecuPartNumber: 'UNIVERSAL-16PIN-TRAINER',
      connectorOrientationConfirmed: true,
      provenanceStatus: 'SIMULATION_ONLY',
      pinCategory: 'power',
      isSimulatedValue: true,
    });
  }

  if (
    input.ecuStatus === 'PART_METADATA_ONLY' ||
    input.ecuStatus === 'MECHANICAL_NO_ECU' ||
    !input.hasVerifiedPinoutMap
  ) {
    return evaluatePinoutSafety({
      ecuIdentified: false,
      ecuPartNumber: undefined,
      connectorOrientationConfirmed: false,
      provenanceStatus: 'UNKNOWN',
      pinCategory: 'power',
      hasConflictingPinoutReports: false,
      isSimulatedValue: true,
    });
  }

  if (input.ecuStatus === 'OCR_VERIFY') {
    return evaluatePinoutSafety({
      ecuIdentified: Boolean(input.ecuProfileId),
      ecuPartNumber: input.orientationConfirmed
        ? input.ecuProfileId || input.controllerNote || input.modelName
        : undefined,
      connectorOrientationConfirmed: input.orientationConfirmed,
      provenanceStatus: 'OEM_VERIFIED',
      pinCategory: 'power',
      hasConflictingPinoutReports: !input.orientationConfirmed,
      isSimulatedValue: true,
    });
  }

  return evaluatePinoutSafety({
    ecuIdentified: true,
    ecuPartNumber: input.ecuProfileId || input.modelName,
    connectorOrientationConfirmed: true,
    provenanceStatus: 'OEM_VERIFIED',
    pinCategory: 'power',
    isSimulatedValue: true,
  });
}

