/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { MultimeterMode } from '../types/ecu';
import {
  type EcuIdentityProvenanceTier,
  verifyEcuIdentityAndPinoutProvenance,
} from './diagnosticEvidenceSystem';

export type BenchAuthorizationDecision = 'ALLOW' | 'CONFIRM' | 'BLOCK';

export type BenchExecutionEnvironmentMode =
  | 'SIMULATION_MODE'
  | 'PHYSICAL_HARDWARE_MODE';

export type BenchActionOriginChannel =
  | 'VOICE_COMMAND'
  | 'TEXT_ASSISTANT'
  | 'VOICE_MACRO'
  | 'AUTOMATION_SCRIPT'
  | 'UI_CONTROL';

export type BenchActionType =
  | 'VOLTAGE_ADJUSTMENT'
  | 'CURRENT_LIMIT_ADJUSTMENT'
  | 'POWER_OUTPUT_ACTIVATION'
  | 'POWER_OUTPUT_DEACTIVATION'
  | 'WIRING_CHANGE'
  | 'KL30_OPERATION'
  | 'KL15_OPERATION'
  | 'FAULT_INJECTION'
  | 'FAULT_REMOVAL'
  | 'BENCH_RESET'
  | 'ECU_PROFILE_CHANGE'
  | 'MULTIMETER_MODE_CHANGE'
  | 'PROBE_ATTACHMENT'
  | 'NAVIGATION_OR_READ_ONLY'
  | 'PHYSICAL_HARDWARE_OPERATION';

export interface BenchSafetyStateSnapshot {
  environmentMode: BenchExecutionEnvironmentMode;
  isPhysicalBridgeConnected?: boolean;
  technicianPhysicalArmConfirmed?: boolean;
  preBenchMandatoryChecked?: number;
  preBenchMandatoryTotal?: number;
  psuOutputEnabled: boolean;
  psuVoltageSetting: number;
  psuCurrentLimitAmps: number;
  psuCurrentDrawAmps?: number;
  ocpTripped: boolean;
  dmmMode: MultimeterMode | string;
  brandKey?: string | null;
  modelName?: string | null;
  ecuProfileId?: string | null;
  ecuStatus?: 'VERIFIED' | 'OCR_VERIFY' | 'PART_METADATA_ONLY' | 'MECHANICAL_NO_ECU' | string;
  hasVerifiedPinoutMap?: boolean;
  orientationConfirmed?: boolean;
  snapshotTimestampMs?: number;
}

export interface BenchActionProposal {
  id?: string;
  originChannel: BenchActionOriginChannel;
  actionType: BenchActionType;
  commandText: string;
  targetVoltage?: number;
  targetCurrentAmps?: number;
  targetPinId?: string | null;
  secondaryPinId?: string | null;
  targetDmmMode?: MultimeterMode | string;
  targetEcuProfileId?: string | null;
  targetBrandKey?: string | null;
  targetModelName?: string | null;
  isMacroStep?: boolean;
  macroName?: string;
  macroStepIndex?: number;
}

export interface BenchAuthorizationEvaluation {
  proposalId: string;
  decision: BenchAuthorizationDecision;
  actionType: BenchActionType;
  originChannel: BenchActionOriginChannel;
  environmentMode: BenchExecutionEnvironmentMode;
  ecuProvenanceTier: EcuIdentityProvenanceTier;
  reasonCode:
    | 'SAFE_READ_ONLY'
    | 'SAFE_DEENERGIZE'
    | 'REQUIRES_TECHNICIAN_CONFIRMATION'
    | 'BLOCKED_5V_REF_OVERVOLTAGE'
    | 'BLOCKED_VOLTAGE_OUT_OF_RANGE'
    | 'BLOCKED_CURRENT_OUT_OF_RANGE'
    | 'BLOCKED_LIVE_CIRCUIT_OHMMETER'
    | 'BLOCKED_OCP_FAULT_LATCHED'
    | 'BLOCKED_UNVERIFIED_OEM_ENERGIZE'
    | 'BLOCKED_PHYSICAL_HARDWARE_UNAUTHORIZED'
    | 'BLOCKED_DIRECT_VBAT_TO_GND_SHORT'
    | 'BLOCKED_STALE_APPROVAL';
  summaryEN: string;
  summaryTL: string;
  safetyReasonEN?: string;
  safetyReasonTL?: string;
  snapshotAtProposal: BenchSafetyStateSnapshot;
  evaluatedAtMs: number;
  expiresAtMs: number;
}

export interface BenchAuthorizationAuditEntry {
  id: string;
  timestampMs: number;
  proposalId: string;
  originChannel: BenchActionOriginChannel;
  environmentMode: BenchExecutionEnvironmentMode;
  actionType: BenchActionType;
  commandText: string;
  decision: BenchAuthorizationDecision;
  eventKind:
    | 'PROPOSED'
    | 'ALLOWED_IMMEDIATE'
    | 'QUEUED_FOR_CONFIRMATION'
    | 'APPROVED_BY_TECHNICIAN'
    | 'REJECTED_BY_TECHNICIAN'
    | 'BLOCKED_SAFETY_INTERLOCK'
    | 'REVALIDATION_FAILED'
    | 'EXECUTION_VERIFIED'
    | 'EXECUTION_FAILED';
  reasonCode: string;
  details: string;
}

const MAX_AUDIT_ENTRIES = 250;
const APPROVAL_EXPIRY_WINDOW_MS = 120_000; // 2 minutes max before confirmation expires

const auditLog: BenchAuthorizationAuditEntry[] = [];

function recordAudit(entry: Omit<BenchAuthorizationAuditEntry, 'id' | 'timestampMs'> & { timestampMs?: number }): BenchAuthorizationAuditEntry {
  const timestampMs = entry.timestampMs ?? Date.now();
  const full: BenchAuthorizationAuditEntry = {
    ...entry,
    id: `safety_audit_${timestampMs}_${Math.random().toString(36).slice(2, 7)}`,
    timestampMs,
  };
  auditLog.unshift(full);
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.length = MAX_AUDIT_ENTRIES;
  }
  return full;
}

export function getBenchAuthorizationAuditLog(): BenchAuthorizationAuditEntry[] {
  return [...auditLog];
}

export function clearBenchAuthorizationAuditLog(): void {
  auditLog.length = 0;
}

/**
 * Classifies a raw voice or text command string into a normalized BenchActionProposal.
 */
export function buildBenchActionProposalFromCommand(params: {
  commandText: string;
  originChannel: BenchActionOriginChannel;
  isMacroStep?: boolean;
  macroName?: string;
  macroStepIndex?: number;
}): BenchActionProposal {
  const raw = params.commandText.trim();
  const lower = raw.toLowerCase();

  let actionType: BenchActionType = 'NAVIGATION_OR_READ_ONLY';
  let targetVoltage: number | undefined;
  let targetCurrentAmps: number | undefined;
  let targetPinId: string | null = null;
  let secondaryPinId: string | null = null;
  let targetDmmMode: string | undefined;

  const pinMatches = Array.from(lower.matchAll(/\bpin\s*#?(\d{1,2})\b/gi));
  if (pinMatches.length >= 1) {
    targetPinId = `ecu-pin-${pinMatches[0][1]}`;
  }
  if (pinMatches.length >= 2) {
    secondaryPinId = `ecu-pin-${pinMatches[1][1]}`;
  }

  const voltMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:v|volts?|boltahe)\b/i);
  if (voltMatch) {
    targetVoltage = parseFloat(voltMatch[1]);
  }
  const ampMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:a|amps?|amperes?)\b/i);
  if (ampMatch) {
    targetCurrentAmps = parseFloat(ampMatch[1]);
  }

  if (/\b(?:physical\s+hardware|real\s+ecu\s+output|j2534\s+flash|physical\s+psu)\b/i.test(lower)) {
    actionType = 'PHYSICAL_HARDWARE_OPERATION';
  } else if (/\b(?:reset\s+(?:the\s+)?(?:lab|bench|workstation)|i-reset\s+ang\s+bench)\b/i.test(lower)) {
    actionType = 'BENCH_RESET';
  } else if (
    /\b(?:clear\s+(?:all\s+)?faults?|remove\s+(?:all\s+|the\s+)?.*faults?|alisin\s+ang\s+fault)\b/i.test(lower)
  ) {
    actionType = 'FAULT_REMOVAL';
  } else if (
    /\b(?:inject|fault|short\s+to\s+ground|short\s+to\s+vbat|open\s+circuit|high\s+resistance|toggle\s+open)\b/i.test(
      lower
    ) &&
    !/\b(?:check|paki-check|is\s+there|may\s+short\s+ba|how\s+to|paano|why|bakit|what|ano)\b/i.test(lower)
  ) {
    actionType = 'FAULT_INJECTION';
  } else if (/\b(?:engage\s+ignition|disengage\s+ignition|turn\s+(?:on|off)\s+kl\s*15|switch\s+kl\s*15)\b/i.test(lower)) {
    actionType = 'KL15_OPERATION';
  } else if (/\b(?:connect\s+power|turn\s+(?:on|off)\s+kl\s*30|switch\s+kl\s*30)\b/i.test(lower)) {
    actionType = 'KL30_OPERATION';
  } else if (
    /\b(?:turn\s+(?:power(?:\s+supply)?|psu)\s+off|power\s+off|switch\s+psu\s+off|patayin\s+ang\s+(?:power|psu)|i-off\s+ang\s+psu)\b/i.test(
      lower
    )
  ) {
    actionType = 'POWER_OUTPUT_DEACTIVATION';
  } else if (
    /\b(?:turn\s+(?:power(?:\s+supply)?|psu)\s+on|power\s+on|enable\s+psu|switch\s+psu\s+on|buksan\s+ang\s+(?:power|psu)|i-on\s+ang\s+psu)\b/i.test(
      lower
    )
  ) {
    actionType = 'POWER_OUTPUT_ACTIVATION';
  } else if (
    /\b(?:current\s+limit|set\s+current|taasan\s+ang\s+current|increase\s+current)\b/i.test(lower) ||
    (ampMatch && /\b(?:set|limit|psu|power)\b/i.test(lower))
  ) {
    actionType = 'CURRENT_LIMIT_ADJUSTMENT';
  } else if (
    /\b(?:set\s+(?:power\s+supply\s+)?voltage|set\s+psu|voltage\s+to|set\s+\d+(?:\.\d+)?\s*v|apply\s+\d+(?:\.\d+)?\s*v)\b/i.test(
      lower
    )
  ) {
    actionType = 'VOLTAGE_ADJUSTMENT';
    if (!targetVoltage) {
      if (/\b14\.4\b/.test(lower)) targetVoltage = 14.4;
      else if (/\b12(?:\.6)?\b/.test(lower)) targetVoltage = 12.6;
      else if (/\b10\.2\b/.test(lower)) targetVoltage = 10.2;
      else if (/\b5(?:\.0)?\b/.test(lower)) targetVoltage = 5.0;
    }
  } else if (
    /\b(?:set\s+(?:the\s+)?(?:multimeter|dmm|meter)\s+to|switch\s+(?:multimeter|dmm)\s+to)\b/i.test(lower)
  ) {
    actionType = 'MULTIMETER_MODE_CHANGE';
    if (/\b(?:continuity)\b/i.test(lower)) targetDmmMode = 'CONTINUITY';
    else if (/\b(?:resistance|ohms?)\b/i.test(lower)) targetDmmMode = 'RESISTANCE';
    else if (/\b(?:diode)\b/i.test(lower)) targetDmmMode = 'DIODE';
    else if (/\b(?:ac\s*volts?|v_ac)\b/i.test(lower)) targetDmmMode = 'V_AC';
    else if (/\b(?:frequency|hz)\b/i.test(lower)) targetDmmMode = 'FREQUENCY';
    else targetDmmMode = 'V_DC';
  } else if (
    /\b(?:connect|disconnect|cut\s+wire|reconnect\s+wire|wire\s+pin|connect\s+ground)\b/i.test(lower) &&
    !/\b(?:probe|red\s+probe|black\s+probe)\b/i.test(lower)
  ) {
    actionType = 'WIRING_CHANGE';
  } else if (/\b(?:attach|place|move|clip|swap|disconnect)\s+(?:the\s+)?(?:red\s+|black\s+)?probes?\b/i.test(lower)) {
    actionType = 'PROBE_ATTACHMENT';
  } else if (/\b(?:select\s+ecu|load\s+ecu\s+profile|change\s+ecu\s+profile|switch\s+ecu)\b/i.test(lower)) {
    actionType = 'ECU_PROFILE_CHANGE';
  }

  return {
    id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    originChannel: params.originChannel,
    actionType,
    commandText: raw,
    targetVoltage,
    targetCurrentAmps,
    targetPinId,
    secondaryPinId,
    targetDmmMode,
    isMacroStep: params.isMacroStep,
    macroName: params.macroName,
    macroStepIndex: params.macroStepIndex,
  };
}

/**
 * Centralized Bench Action Authorization System (Section 2).
 * Evaluates every proposed bench action and returns ALLOW, CONFIRM, or BLOCK.
 */
export function authorizeBenchAction(
  proposal: BenchActionProposal,
  snapshot: BenchSafetyStateSnapshot,
  nowMs = Date.now()
): BenchAuthorizationEvaluation {
  const proposalId = proposal.id || `prop_${nowMs}`;
  const lower = proposal.commandText.toLowerCase();

  const ecuVerification = verifyEcuIdentityAndPinoutProvenance({
    brandKey: snapshot.brandKey,
    modelName: snapshot.modelName,
    ecuProfileId: snapshot.ecuProfileId,
    ecuStatus: snapshot.ecuStatus,
    hasVerifiedPinoutMap: snapshot.hasVerifiedPinoutMap,
    orientationConfirmed: snapshot.orientationConfirmed,
  });

  const finalize = (
    decision: BenchAuthorizationDecision,
    reasonCode: BenchAuthorizationEvaluation['reasonCode'],
    summaryEN: string,
    summaryTL: string,
    safetyReasonEN?: string,
    safetyReasonTL?: string
  ): BenchAuthorizationEvaluation => {
    const evaluation: BenchAuthorizationEvaluation = {
      proposalId,
      decision,
      actionType: proposal.actionType,
      originChannel: proposal.originChannel,
      environmentMode: snapshot.environmentMode,
      ecuProvenanceTier: ecuVerification.tier,
      reasonCode,
      summaryEN,
      summaryTL,
      safetyReasonEN,
      safetyReasonTL,
      snapshotAtProposal: { ...snapshot, snapshotTimestampMs: snapshot.snapshotTimestampMs ?? nowMs },
      evaluatedAtMs: nowMs,
      expiresAtMs: nowMs + APPROVAL_EXPIRY_WINDOW_MS,
    };

    recordAudit({
      timestampMs: nowMs,
      proposalId,
      originChannel: proposal.originChannel,
      environmentMode: snapshot.environmentMode,
      actionType: proposal.actionType,
      commandText: proposal.commandText,
      decision,
      eventKind:
        decision === 'BLOCK'
          ? 'BLOCKED_SAFETY_INTERLOCK'
          : decision === 'CONFIRM'
            ? 'QUEUED_FOR_CONFIRMATION'
            : 'ALLOWED_IMMEDIATE',
      reasonCode,
      details: safetyReasonEN || summaryEN,
    });

    return evaluation;
  };

  // 1. Physical Hardware Mode Strict Separation & Interlock
  if (
    snapshot.environmentMode === 'PHYSICAL_HARDWARE_MODE' ||
    proposal.actionType === 'PHYSICAL_HARDWARE_OPERATION'
  ) {
    const preBenchComplete =
      typeof snapshot.preBenchMandatoryChecked === 'number' &&
      typeof snapshot.preBenchMandatoryTotal === 'number' &&
      snapshot.preBenchMandatoryTotal > 0 &&
      snapshot.preBenchMandatoryChecked >= snapshot.preBenchMandatoryTotal;

    if (
      !snapshot.isPhysicalBridgeConnected ||
      !snapshot.technicianPhysicalArmConfirmed ||
      ecuVerification.tier !== 'VERIFIED_OEM' ||
      !preBenchComplete
    ) {
      return finalize(
        'BLOCK',
        'BLOCKED_PHYSICAL_HARDWARE_UNAUTHORIZED',
        'Blocked Physical Hardware Operation',
        'Hinarang ang Physical Hardware Operation',
        'SAFETY LOCKOUT (PHYSICAL HARDWARE MODE): Simulated authorization never permits physical hardware operation. Physical hardware control requires a connected hardware bridge, VERIFIED_OEM pinout provenance (never Universal Trainer or Unverified OEM), 100% completed Pre-Bench Safety Checklist, and explicit technician arming.',
        'SAFETY LOCKOUT (PHYSICAL HARDWARE MODE): Ang simulated authorization ay HINDI pwedeng magpatakbo ng physical hardware. Kailangan ng connected physical bridge, VERIFIED_OEM pinout, kumpletong Pre-Bench Safety Checklist, at explicit technician arming.'
      );
    }
  }

  // 2. Block applying > 5.5V (e.g., 12V) to Pin 5 (VREF_5V) or any 5V sensor reference line
  const touches5vRef =
    proposal.targetPinId === 'ecu-pin-5' ||
    proposal.secondaryPinId === 'ecu-pin-5' ||
    /\b(?:pin\s*5|vref|5v\s*(?:ref|reference|rail|supply))\b/i.test(lower);
  const mentionsOver5v =
    (typeof proposal.targetVoltage === 'number' && proposal.targetVoltage > 5.5) ||
    /\b(?:12\s*v|12\.6\s*v|13\.8\s*v|14\.4\s*v|24\s*v|vbat|kl30|kl15|battery)\b/i.test(lower);
  const isApplyingOrShorting =
    proposal.actionType === 'VOLTAGE_ADJUSTMENT' ||
    proposal.actionType === 'WIRING_CHANGE' ||
    proposal.actionType === 'FAULT_INJECTION' ||
    /\b(?:set|apply|inject|connect|short|wire|lagyan|ikabit)\b/i.test(lower);

  if (touches5vRef && mentionsOver5v && isApplyingOrShorting) {
    return finalize(
      'BLOCK',
      'BLOCKED_5V_REF_OVERVOLTAGE',
      'Blocked 5V Reference Overvoltage',
      'Hinarang ang >5.5V sa 5V Reference Rail',
      'SAFETY LOCKOUT: Applying >5.5V (+12V VBAT) to Pin 5 (VREF_5V) or any 5V sensor reference rail is strictly blocked. Overvoltage destroys the internal ECU 5V LDO regulator and MCU ADC.',
      'SAFETY LOCKOUT: Mahigpit na ipinagbabawal ang paglalagay ng >5.5V (+12V VBAT) sa Pin 5 (VREF_5V) o 5V sensor rail dahil masusunog ang internal 5V LDO regulator at MCU ADC ng ECU.'
    );
  }

  // 3. Block direct wiring of +12V VBAT / KL30 (Pin 3) or KL15 (Pin 4) directly to Ground (Pin 1/2/6) via WIRING_CHANGE
  if (proposal.actionType === 'WIRING_CHANGE') {
    const connectsPowerRail =
      proposal.targetPinId === 'ecu-pin-3' ||
      proposal.targetPinId === 'ecu-pin-4' ||
      proposal.secondaryPinId === 'ecu-pin-3' ||
      proposal.secondaryPinId === 'ecu-pin-4' ||
      /\b(?:pin\s*3|pin\s*4|kl\s*30|kl\s*15|vbat|\+12v)\b/i.test(lower);
    const connectsGroundRail =
      proposal.targetPinId === 'ecu-pin-1' ||
      proposal.targetPinId === 'ecu-pin-2' ||
      proposal.targetPinId === 'ecu-pin-6' ||
      proposal.secondaryPinId === 'ecu-pin-1' ||
      proposal.secondaryPinId === 'ecu-pin-2' ||
      proposal.secondaryPinId === 'ecu-pin-6' ||
      /\b(?:pin\s*1|pin\s*2|pin\s*6|kl\s*31|sgnd|ground|gnd|chassis)\b/i.test(lower);
    if (
      connectsPowerRail &&
      connectsGroundRail &&
      !/\b(?:connect\s+ground|connect\s+power)\b/i.test(lower)
    ) {
      return finalize(
        'BLOCK',
        'BLOCKED_DIRECT_VBAT_TO_GND_SHORT',
        'Blocked Direct +12V to Ground Wire Short',
        'Hinarang ang Direct Jumper mula +12V papuntang Ground',
        'SAFETY LOCKOUT: Connecting a direct jumper wire between +12V Power (KL30/KL15) and Ground (KL31/SGND) creates a dead short across the bench supply.',
        'SAFETY LOCKOUT: Ang direktang pag-jumper ng +12V Power (KL30/KL15) sa Ground (KL31/SGND) ay magdudulot ng dead short sa bench supply.'
      );
    }
  }

  // 4. Validate Voltage & Current Limits
  if (proposal.actionType === 'VOLTAGE_ADJUSTMENT' && typeof proposal.targetVoltage === 'number') {
    if (!Number.isFinite(proposal.targetVoltage) || proposal.targetVoltage < 0 || proposal.targetVoltage > 16.5) {
      return finalize(
        'BLOCK',
        'BLOCKED_VOLTAGE_OUT_OF_RANGE',
        `Blocked Unsafe Bench Voltage (${proposal.targetVoltage}V)`,
        `Hinarang ang Delikadong Boltahe (${proposal.targetVoltage}V)`,
        `SAFETY LOCKOUT: Requested bench supply voltage (${proposal.targetVoltage}V) exceeds the safe 12V automotive ECU operating envelope (0.0V – 16.5V).`,
        `SAFETY LOCKOUT: Ang hiniling na boltahe (${proposal.targetVoltage}V) ay lampas sa ligtas na 12V automotive ECU range (0.0V – 16.5V).`
      );
    }
  }

  if (proposal.actionType === 'CURRENT_LIMIT_ADJUSTMENT' && typeof proposal.targetCurrentAmps === 'number') {
    if (!Number.isFinite(proposal.targetCurrentAmps) || proposal.targetCurrentAmps < 0.1 || proposal.targetCurrentAmps > 10.0) {
      return finalize(
        'BLOCK',
        'BLOCKED_CURRENT_OUT_OF_RANGE',
        `Blocked Unsafe Current Limit (${proposal.targetCurrentAmps}A)`,
        `Hinarang ang Delikadong Current Limit (${proposal.targetCurrentAmps}A)`,
        `SAFETY LOCKOUT: Requested current limit (${proposal.targetCurrentAmps}A) is outside the safe bench protection range (0.1A – 10.0A).`,
        `SAFETY LOCKOUT: Ang hiniling na current limit (${proposal.targetCurrentAmps}A) ay labas sa ligtas na bench protection range (0.1A – 10.0A).`
      );
    }
  }

  // 5. Block switching DMM to OHMS / CONTINUITY / DIODE while PSU output is ON
  const requestsOhmsOrContinuity =
    (proposal.actionType === 'MULTIMETER_MODE_CHANGE' &&
      (proposal.targetDmmMode === 'RESISTANCE' ||
        proposal.targetDmmMode === 'CONTINUITY' ||
        proposal.targetDmmMode === 'DIODE')) ||
    /\b(?:set|switch|change|ilagay|gawing)\b.*\b(?:multimeter|dmm|meter)\b.*\b(?:ohm|ohms|resistance|continuity|diode)\b/i.test(
      lower
    );

  if (requestsOhmsOrContinuity && snapshot.psuOutputEnabled) {
    return finalize(
      'BLOCK',
      'BLOCKED_LIVE_CIRCUIT_OHMMETER',
      'Blocked Ohmmeter/Continuity on Live Circuit',
      'Hinarang ang Ohms/Continuity Test Habang Buhay ang PSU',
      `SAFETY LOCKOUT: Cannot switch multimeter to Resistance/Continuity/Diode mode while the Bench Power Supply is ON (${snapshot.psuVoltageSetting.toFixed(1)}V). Turn PSU OFF first before measuring resistance.`,
      `SAFETY LOCKOUT: Hindi pwedeng ilagay sa Resistance/Continuity/Diode mode ang multimeter habang naka-ON ang Bench Power Supply (${snapshot.psuVoltageSetting.toFixed(1)}V). I-OFF muna ang PSU bago mag-resistance test.`
    );
  }

  // 6. Block enabling PSU or raising current limit while OCP is tripped
  const requestsEnablePsuOrRaiseCurrent =
    proposal.actionType === 'POWER_OUTPUT_ACTIVATION' ||
    proposal.actionType === 'KL30_OPERATION' ||
    proposal.actionType === 'KL15_OPERATION' ||
    proposal.actionType === 'CURRENT_LIMIT_ADJUSTMENT';

  if (requestsEnablePsuOrRaiseCurrent && snapshot.ocpTripped) {
    return finalize(
      'BLOCK',
      'BLOCKED_OCP_FAULT_LATCHED',
      'Blocked Power Activation Under Active OCP Trip',
      'Hinarang ang Pag-ON ng Power Habang Naka-OCP Trip',
      'SAFETY LOCKOUT: Over-Current Protection (OCP) is currently tripped due to an active short-to-ground. Do not raise the current limit or force power ON. Isolate and clear the short fault first.',
      'SAFETY LOCKOUT: Naka-trip ang Over-Current Protection (OCP) dahil sa short-to-ground. Huwag taasan ang current limit o pilitin i-ON ang PSU. Alisin muna ang short circuit.'
    );
  }

  // 7. Block energizing PSU when an UNVERIFIED OEM profile is loaded
  const requestsPowerActivation =
    proposal.actionType === 'POWER_OUTPUT_ACTIVATION' ||
    (proposal.actionType === 'KL30_OPERATION' && !/\boff\b/i.test(lower)) ||
    (proposal.actionType === 'KL15_OPERATION' && !/\b(?:off|disengage)\b/i.test(lower));

  if (requestsPowerActivation && ecuVerification.tier === 'UNVERIFIED_OEM') {
    return finalize(
      'BLOCK',
      'BLOCKED_UNVERIFIED_OEM_ENERGIZE',
      'Blocked Energizing Unverified OEM Pinout',
      'Hinarang ang Pag-ON ng PSU sa Unverified OEM Pinout',
      `SAFETY LOCKOUT: The active OEM vehicle profile (${snapshot.brandKey || ''} ${snapshot.modelName || ''}) has unverified pinout provenance (${ecuVerification.missingDetails.join(', ')}). Confirm exact ECU part number and connector orientation before energizing.`,
      `SAFETY LOCKOUT: Hindi pa verified ang OEM pinout provenance para sa ${snapshot.brandKey || ''} ${snapshot.modelName || ''} (${ecuVerification.missingDetails.join(', ')}). Kumpirmahin muna ang ECU part number at connector orientation bago mag-ON ng power.`
    );
  }

  // 8. Immediate ALLOW for Read-Only, Navigation, Probe Attachment, and Emergency Power OFF
  if (
    proposal.actionType === 'NAVIGATION_OR_READ_ONLY' ||
    proposal.actionType === 'PROBE_ATTACHMENT'
  ) {
    return finalize(
      'ALLOW',
      'SAFE_READ_ONLY',
      `Allowed read-only / probe operation: "${proposal.commandText}"`,
      `Pinayagan ang read-only / probe operation: "${proposal.commandText}"`
    );
  }

  if (proposal.actionType === 'POWER_OUTPUT_DEACTIVATION') {
    return finalize(
      'ALLOW',
      'SAFE_DEENERGIZE',
      'Allowed immediate PSU de-energize (Safety Power OFF)',
      'Pinayagan ang agarang pag-OFF ng Bench Power Supply'
    );
  }

  // 9. All other consequential state-changing operations require explicit technician confirmation (CONFIRM)
  return finalize(
    'CONFIRM',
    'REQUIRES_TECHNICIAN_CONFIRMATION',
    `Confirm bench state change (${proposal.actionType}): "${proposal.commandText}"`,
    `Kumpirmahin ang pagbabago sa bench (${proposal.actionType}): "${proposal.commandText}"`
  );
}

/**
 * Revalidates live bench conditions immediately before executing a previously proposed/confirmed action.
 * Prevents stale approvals or race conditions (e.g. PSU turned ON before a queued OHMS mode change,
 * or OCP tripped while waiting for confirmation).
 */
export function revalidateAndExecuteBenchAction<TResult>(params: {
  evaluation: BenchAuthorizationEvaluation;
  currentSnapshot: BenchSafetyStateSnapshot;
  proposal: BenchActionProposal;
  technicianConfirmed: boolean;
  executeFn: () => TResult;
  verifyResultFn?: (result: TResult) => boolean;
  nowMs?: number;
}): {
  executed: boolean;
  decision: BenchAuthorizationDecision;
  revalidationPassed: boolean;
  result?: TResult;
  failureReasonEN?: string;
  failureReasonTL?: string;
} {
  const nowMs = params.nowMs ?? Date.now();

  if (params.evaluation.decision === 'BLOCK') {
    return {
      executed: false,
      decision: 'BLOCK',
      revalidationPassed: false,
      failureReasonEN: params.evaluation.safetyReasonEN || params.evaluation.summaryEN,
      failureReasonTL: params.evaluation.safetyReasonTL || params.evaluation.summaryTL,
    };
  }

  if (params.evaluation.decision === 'CONFIRM' && !params.technicianConfirmed) {
    return {
      executed: false,
      decision: 'CONFIRM',
      revalidationPassed: false,
      failureReasonEN: 'Explicit technician confirmation is required before executing this bench operation.',
      failureReasonTL: 'Kailangan muna ng explicit confirmation ng technician bago ituloy ang bench operation na ito.',
    };
  }

  // Check for stale approval expiration (> 120 seconds)
  if (nowMs > params.evaluation.expiresAtMs) {
    recordAudit({
      timestampMs: nowMs,
      proposalId: params.evaluation.proposalId,
      originChannel: params.proposal.originChannel,
      environmentMode: params.currentSnapshot.environmentMode,
      actionType: params.proposal.actionType,
      commandText: params.proposal.commandText,
      decision: 'BLOCK',
      eventKind: 'REVALIDATION_FAILED',
      reasonCode: 'BLOCKED_STALE_APPROVAL',
      details: 'Confirmation expired before execution.',
    });
    return {
      executed: false,
      decision: 'BLOCK',
      revalidationPassed: false,
      failureReasonEN: 'STALE APPROVAL BLOCKED: Confirmation expired (>120s). Please re-issue and confirm the command against current bench conditions.',
      failureReasonTL: 'STALE APPROVAL BLOCKED: Nag-expire na ang confirmation (>120s). Paki-ulit ang command para ma-check ang kasalukuyang bench state.',
    };
  }

  // Check if ECU profile changed between proposal and confirmation
  if (
    params.evaluation.snapshotAtProposal.ecuProfileId !== params.currentSnapshot.ecuProfileId ||
    params.evaluation.snapshotAtProposal.brandKey !== params.currentSnapshot.brandKey
  ) {
    recordAudit({
      timestampMs: nowMs,
      proposalId: params.evaluation.proposalId,
      originChannel: params.proposal.originChannel,
      environmentMode: params.currentSnapshot.environmentMode,
      actionType: params.proposal.actionType,
      commandText: params.proposal.commandText,
      decision: 'BLOCK',
      eventKind: 'REVALIDATION_FAILED',
      reasonCode: 'BLOCKED_STALE_APPROVAL',
      details: 'Active ECU profile changed while action was awaiting confirmation.',
    });
    return {
      executed: false,
      decision: 'BLOCK',
      revalidationPassed: false,
      failureReasonEN: 'STATE REVALIDATION FAILED: The active ECU profile changed while this command was awaiting confirmation. Action aborted for safety.',
      failureReasonTL: 'STATE REVALIDATION FAILED: Nagbago ang active ECU profile habang naghihintay ng confirmation. Kinansela ang action para sa kaligtasan.',
    };
  }

  // Re-run safety evaluation against the immediate current bench state
  const freshEval = authorizeBenchAction(params.proposal, params.currentSnapshot, nowMs);
  if (freshEval.decision === 'BLOCK') {
    recordAudit({
      timestampMs: nowMs,
      proposalId: params.evaluation.proposalId,
      originChannel: params.proposal.originChannel,
      environmentMode: params.currentSnapshot.environmentMode,
      actionType: params.proposal.actionType,
      commandText: params.proposal.commandText,
      decision: 'BLOCK',
      eventKind: 'REVALIDATION_FAILED',
      reasonCode: freshEval.reasonCode,
      details: freshEval.safetyReasonEN || freshEval.summaryEN,
    });
    return {
      executed: false,
      decision: 'BLOCK',
      revalidationPassed: false,
      failureReasonEN: freshEval.safetyReasonEN || freshEval.summaryEN,
      failureReasonTL: freshEval.safetyReasonTL || freshEval.summaryTL,
    };
  }

  if (params.evaluation.decision === 'CONFIRM' && params.technicianConfirmed) {
    recordAudit({
      timestampMs: nowMs,
      proposalId: params.evaluation.proposalId,
      originChannel: params.proposal.originChannel,
      environmentMode: params.currentSnapshot.environmentMode,
      actionType: params.proposal.actionType,
      commandText: params.proposal.commandText,
      decision: 'ALLOW',
      eventKind: 'APPROVED_BY_TECHNICIAN',
      reasonCode: 'TECHNICIAN_CONFIRMED',
      details: `Approved and revalidated: "${params.proposal.commandText}"`,
    });
  }

  try {
    const result = params.executeFn();
    const verified = params.verifyResultFn ? params.verifyResultFn(result) : true;
    if (!verified) {
      recordAudit({
        timestampMs: nowMs,
        proposalId: params.evaluation.proposalId,
        originChannel: params.proposal.originChannel,
        environmentMode: params.currentSnapshot.environmentMode,
        actionType: params.proposal.actionType,
        commandText: params.proposal.commandText,
        decision: 'ALLOW',
        eventKind: 'EXECUTION_FAILED',
        reasonCode: 'RESULT_VERIFICATION_FAILED',
        details: `Underlying service did not confirm execution of "${params.proposal.commandText}".`,
      });
      return {
        executed: false,
        decision: 'ALLOW',
        revalidationPassed: true,
        result,
        failureReasonEN: 'RESULT VERIFICATION FAILED: The underlying bench service did not confirm completion of the requested operation.',
        failureReasonTL: 'RESULT VERIFICATION FAILED: Hindi nakumpirma ng bench service na naisagawa ang operasyon.',
      };
    }

    recordAudit({
      timestampMs: nowMs,
      proposalId: params.evaluation.proposalId,
      originChannel: params.proposal.originChannel,
      environmentMode: params.currentSnapshot.environmentMode,
      actionType: params.proposal.actionType,
      commandText: params.proposal.commandText,
      decision: 'ALLOW',
      eventKind: 'EXECUTION_VERIFIED',
      reasonCode: 'EXECUTED_AND_VERIFIED',
      details: `Executed and verified: "${params.proposal.commandText}"`,
    });

    return {
      executed: true,
      decision: 'ALLOW',
      revalidationPassed: true,
      result,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordAudit({
      timestampMs: nowMs,
      proposalId: params.evaluation.proposalId,
      originChannel: params.proposal.originChannel,
      environmentMode: params.currentSnapshot.environmentMode,
      actionType: params.proposal.actionType,
      commandText: params.proposal.commandText,
      decision: 'ALLOW',
      eventKind: 'EXECUTION_FAILED',
      reasonCode: 'EXECUTION_EXCEPTION',
      details: msg,
    });
    return {
      executed: false,
      decision: 'ALLOW',
      revalidationPassed: true,
      failureReasonEN: `Execution error: ${msg}`,
      failureReasonTL: `Error sa pagpapatakbo: ${msg}`,
    };
  }
}

export function recordTechnicianRejection(
  evaluation: BenchAuthorizationEvaluation,
  commandText: string,
  nowMs = Date.now()
): void {
  recordAudit({
    timestampMs: nowMs,
    proposalId: evaluation.proposalId,
    originChannel: evaluation.originChannel,
    environmentMode: evaluation.environmentMode,
    actionType: evaluation.actionType,
    commandText,
    decision: 'BLOCK',
    eventKind: 'REJECTED_BY_TECHNICIAN',
    reasonCode: 'TECHNICIAN_CANCELLED',
    details: `Technician cancelled pending operation: "${commandText}"`,
  });
}
