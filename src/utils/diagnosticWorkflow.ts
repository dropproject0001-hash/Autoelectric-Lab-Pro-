/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type {
  DiagnosticTroubleCode,
  EcuPin,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import type { LabTab } from '../components/LabTopNav';

export type WorkflowTelemetryStatus = 'PASS' | 'ATTENTION' | 'STANDBY';

export type WorkflowPhase = 'PRE_BENCH' | 'ACTIVE_TEST' | 'REPAIR_SIGNOFF';

export type DiagnosticPanelMode = 'WORKFLOW' | 'LOGIC_CHECK' | 'MNA_GUIDE';

export interface DiagnosticWorkflowStepDef {
  id: string;
  order: number;
  phase: WorkflowPhase;
  mandatoryPreBench: boolean;
  title: string;
  instruction: string;
  targetTab?: LabTab;
  targetPinId?: string;
  ctaLabel?: string;
}

export interface EvaluatedWorkflowStep extends DiagnosticWorkflowStepDef {
  telemetryStatus: WorkflowTelemetryStatus;
  telemetrySummary: string;
  isChecked: boolean;
}

export interface WorkflowProgressSummary {
  totalCount: number;
  checkedCount: number;
  mandatoryTotal: number;
  mandatoryChecked: number;
  mandatoryAllChecked: boolean;
  telemetryWarnings: number;
}

export const WORKFLOW_STORAGE_KEY = 'autoelectric_diagnostic_workflow_v1';
export const WORKFLOW_PREFS_STORAGE_KEY = 'autoelectric_workflow_prefs_v1';

export interface WorkflowPreferences {
  preBenchGateLocked: boolean;
  autoVerifyWorkflow: boolean;
}

export interface PreBenchGateStatus {
  allowed: boolean;
  mandatoryChecked: number;
  mandatoryTotal: number;
  pendingTitles: string[];
}

export const DIAGNOSTIC_WORKFLOW_STEPS: readonly DiagnosticWorkflowStepDef[] = [
  {
    id: 'verify-battery-voltage',
    order: 1,
    phase: 'PRE_BENCH',
    mandatoryPreBench: true,
    title: 'Verify Battery Voltage',
    instruction:
      'Confirm bench DC power supply voltage preset (12.0V–14.4V), safe current limit (<= 5.0A), and KL30 Pin #3 terminal voltage before waking the ECU.',
    targetPinId: 'ecu-pin-3',
    ctaLabel: 'Focus KL30 (#3)',
  },
  {
    id: 'check-pinout-continuity',
    order: 2,
    phase: 'PRE_BENCH',
    mandatoryPreBench: true,
    title: 'Check Pinout Continuity',
    instruction:
      'Verify connector pinout assignments (KL30, KL15, KL31, CAN-H/L) against the active ECU profile and confirm ground continuity in Key-OFF mode.',
    targetTab: 'ECU_PINOUT',
    ctaLabel: 'Open Pinouts',
  },
  {
    id: 'inspect-wiring-integrity',
    order: 3,
    phase: 'PRE_BENCH',
    mandatoryPreBench: true,
    title: 'Inspect Wiring Integrity',
    instruction:
      'Inspect all harness leads for cut wires, short-to-ground/VBAT faults, or high-resistance corroded junctions prior to energized testing.',
    targetTab: 'WIRING_DIAGRAM',
    ctaLabel: 'Inspect Harness',
  },
  {
    id: 'confirm-sensor-grounds',
    order: 4,
    phase: 'PRE_BENCH',
    mandatoryPreBench: true,
    title: 'Confirm Clean Sensor Grounds',
    instruction:
      'Verify KL31 Power Ground (Pin #1) and SGND Analog Return (Pin #6) stay within <= 0.50V of Chassis Ground.',
    targetPinId: 'ecu-pin-6',
    ctaLabel: 'Probe SGND (#6)',
  },
  {
    id: 'capture-baseline-signals',
    order: 5,
    phase: 'ACTIVE_TEST',
    mandatoryPreBench: false,
    title: 'Capture Baseline Signals & DTCs',
    instruction:
      'Energize PSU output, verify DMM live measurement and Oscilloscope waveform traces, and review any active OBD-II DTCs.',
    targetTab: 'OSCILLOSCOPE',
    ctaLabel: 'Open Oscilloscope',
  },
  {
    id: 'verify-repair-signoff',
    order: 6,
    phase: 'REPAIR_SIGNOFF',
    mandatoryPreBench: false,
    title: 'Verify Repair & Clear Faults',
    instruction:
      'Confirm 0 active DTCs, zero injected faults or cut wires, and nominal quiescent current draw before finalizing repair notes.',
    targetTab: 'REPAIR_GUIDE',
    ctaLabel: 'Open Repair Guide',
  },
];

export interface WorkflowEvaluationInput {
  powerSupply: PowerSupplyState;
  pins: EcuPin[];
  wires: WireConnection[];
  faults: InjectedFault[];
  activeDTCs: DiagnosticTroubleCode[];
  nodeVoltages: Record<string, number>;
  supplyCurrentDrawAmps: number;
  isSupplyCurrentTripped: boolean;
  multimeter: MultimeterState;
  multimeterReading: {
    display: string;
    unit: string;
    isWarning: boolean;
  };
  ecuProfileLabel?: string;
}

export function evaluateWorkflowSteps(
  input: WorkflowEvaluationInput,
  checkedIds: ReadonlySet<string>
): EvaluatedWorkflowStep[] {
  const {
    powerSupply,
    wires,
    faults,
    activeDTCs,
    nodeVoltages,
    supplyCurrentDrawAmps,
    isSupplyCurrentTripped,
    multimeter,
    multimeterReading,
    ecuProfileLabel,
  } = input;

  const kl30V = nodeVoltages['ecu-pin-3'] ?? 0;
  const kl31V = nodeVoltages['ecu-pin-1'] ?? 0;
  const sgndV = nodeVoltages['ecu-pin-6'] ?? 0;
  const cutCount = wires.filter((w) => w.isCut).length;
  const faultCount = faults.length;
  const probeSeated = Boolean(
    multimeter.isPowered &&
      multimeter.redProbe.attachedToPinId &&
      multimeter.blackProbe.attachedToPinId
  );

  return DIAGNOSTIC_WORKFLOW_STEPS.map((step) => {
    let telemetryStatus: WorkflowTelemetryStatus = 'STANDBY';
    let telemetrySummary = '';

    switch (step.id) {
      case 'verify-battery-voltage': {
        const voltageNominal =
          powerSupply.voltageSetting >= 11.5 && powerSupply.voltageSetting <= 14.8;
        if (isSupplyCurrentTripped) {
          telemetryStatus = 'ATTENTION';
          telemetrySummary = `C.C. limit tripped (${supplyCurrentDrawAmps.toFixed(2)} A) at ${powerSupply.voltageSetting.toFixed(1)}V`;
        } else if (!voltageNominal) {
          telemetryStatus = 'ATTENTION';
          telemetrySummary = `PSU set to ${powerSupply.voltageSetting.toFixed(1)}V (recommended 12.0V–14.4V)`;
        } else if (powerSupply.isOutputEnabled && kl30V < 10.5) {
          telemetryStatus = 'ATTENTION';
          telemetrySummary = `PSU ${powerSupply.voltageSetting.toFixed(1)}V · KL30 low (${kl30V.toFixed(2)}V)`;
        } else {
          telemetryStatus = 'PASS';
          telemetrySummary = powerSupply.isOutputEnabled
            ? `PSU ${powerSupply.voltageSetting.toFixed(1)}V · KL30 ${kl30V.toFixed(2)}V · Limit ${powerSupply.currentLimit.toFixed(1)}A`
            : `Preset ${powerSupply.voltageSetting.toFixed(1)}V · Limit ${powerSupply.currentLimit.toFixed(1)}A (Standby)`;
        }
        break;
      }

      case 'check-pinout-continuity': {
        const profileText = ecuProfileLabel || 'Universal 16-Pin';
        if (multimeterReading.isWarning) {
          telemetryStatus = 'ATTENTION';
          telemetrySummary = `${profileText} · Live Ohms/Continuity lockout warning`;
        } else if (multimeter.mode === 'CONTINUITY' || multimeter.mode === 'RESISTANCE') {
          telemetryStatus = 'PASS';
          telemetrySummary = `${profileText} · DMM ${multimeterReading.display} ${multimeterReading.unit}`;
        } else {
          telemetryStatus = probeSeated ? 'PASS' : 'STANDBY';
          telemetrySummary = `${profileText} · Probes: ${multimeter.redProbe.attachedLabel}`;
        }
        break;
      }

      case 'inspect-wiring-integrity': {
        if (cutCount > 0 || faultCount > 0) {
          telemetryStatus = 'ATTENTION';
          telemetrySummary = `${cutCount} cut ${cutCount === 1 ? 'lead' : 'leads'} · ${faultCount} injected ${faultCount === 1 ? 'fault' : 'faults'}`;
        } else {
          telemetryStatus = 'PASS';
          telemetrySummary = `${wires.length}/${wires.length} harness leads intact · 0 pin faults`;
        }
        break;
      }

      case 'confirm-sensor-grounds': {
        const groundOffsetHigh = Math.abs(kl31V) > 0.5 || Math.abs(sgndV) > 0.5;
        if (groundOffsetHigh) {
          telemetryStatus = 'ATTENTION';
          telemetrySummary = `Elevated offset: KL31 ${kl31V.toFixed(2)}V · SGND ${sgndV.toFixed(2)}V`;
        } else {
          telemetryStatus = 'PASS';
          telemetrySummary = `KL31 ${kl31V.toFixed(2)}V · SGND ${sgndV.toFixed(2)}V (<= 0.50V)`;
        }
        break;
      }

      case 'capture-baseline-signals': {
        if (!powerSupply.isOutputEnabled) {
          telemetryStatus = 'STANDBY';
          telemetrySummary = 'Enable PSU output to capture live signals & DTCs';
        } else if (activeDTCs.length > 0) {
          telemetryStatus = 'ATTENTION';
          telemetrySummary = `${activeDTCs.length} active DTC (${activeDTCs.map((d) => d.code).join(', ')}) · DMM ${multimeterReading.display} ${multimeterReading.unit}`;
        } else {
          telemetryStatus = 'PASS';
          telemetrySummary = `0 DTCs · DMM ${multimeterReading.display} ${multimeterReading.unit} · ${supplyCurrentDrawAmps.toFixed(2)}A`;
        }
        break;
      }

      case 'verify-repair-signoff': {
        if (
          powerSupply.isOutputEnabled &&
          !isSupplyCurrentTripped &&
          activeDTCs.length === 0 &&
          cutCount === 0 &&
          faultCount === 0
        ) {
          telemetryStatus = 'PASS';
          telemetrySummary = 'Nominal bench health · 0 DTCs · Ready for sign-off';
        } else if (activeDTCs.length > 0 || cutCount > 0 || faultCount > 0 || isSupplyCurrentTripped) {
          telemetryStatus = 'ATTENTION';
          telemetrySummary = `${activeDTCs.length} DTCs · ${cutCount + faultCount} open circuit/pin issues`;
        } else {
          telemetryStatus = 'STANDBY';
          telemetrySummary = 'Awaiting energized final verification check';
        }
        break;
      }
    }

    return {
      ...step,
      telemetryStatus,
      telemetrySummary,
      isChecked: checkedIds.has(step.id),
    };
  });
}

export function getWorkflowProgress(
  steps: readonly EvaluatedWorkflowStep[]
): WorkflowProgressSummary {
  let checkedCount = 0;
  let mandatoryTotal = 0;
  let mandatoryChecked = 0;
  let telemetryWarnings = 0;

  for (const step of steps) {
    if (step.isChecked) checkedCount += 1;
    if (step.mandatoryPreBench) {
      mandatoryTotal += 1;
      if (step.isChecked) mandatoryChecked += 1;
    }
    if (step.telemetryStatus === 'ATTENTION') {
      telemetryWarnings += 1;
    }
  }

  return {
    totalCount: steps.length,
    checkedCount,
    mandatoryTotal,
    mandatoryChecked,
    mandatoryAllChecked: mandatoryChecked === mandatoryTotal && mandatoryTotal > 0,
    telemetryWarnings,
  };
}

export function loadCheckedWorkflowIds(): string[] {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(WORKFLOW_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const validIds = new Set(DIAGNOSTIC_WORKFLOW_STEPS.map((s) => s.id));
    return parsed.filter((id): id is string => typeof id === 'string' && validIds.has(id));
  } catch {
    return [];
  }
}

export function saveCheckedWorkflowIds(ids: readonly string[]): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(Array.from(new Set(ids))));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadWorkflowPreferences(): WorkflowPreferences {
  const defaults: WorkflowPreferences = {
    preBenchGateLocked: true,
    autoVerifyWorkflow: false,
  };
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return defaults;
  }
  try {
    const raw = window.localStorage.getItem(WORKFLOW_PREFS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<WorkflowPreferences>;
    return {
      preBenchGateLocked:
        typeof parsed.preBenchGateLocked === 'boolean'
          ? parsed.preBenchGateLocked
          : defaults.preBenchGateLocked,
      autoVerifyWorkflow: Boolean(parsed.autoVerifyWorkflow),
    };
  } catch {
    return defaults;
  }
}

export function saveWorkflowPreferences(prefs: WorkflowPreferences): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(WORKFLOW_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

export function parseWorkflowStepTarget(expr: string): DiagnosticWorkflowStepDef | null {
  const clean = expr
    .trim()
    .toLowerCase()
    .replace(/^(?:workflow\s+|diagnostic\s+)?(?:step|item|check)\s*#?/i, '')
    .replace(/\s+(?:complete|completed|done|checked|pass|passed|unchecked|incomplete)$/i, '')
    .trim();

  if (!clean) return null;

  const numMatch = clean.match(/^(\d+)$/);
  if (numMatch) {
    const order = parseInt(numMatch[1], 10);
    return DIAGNOSTIC_WORKFLOW_STEPS.find((s) => s.order === order) ?? null;
  }

  const byId = DIAGNOSTIC_WORKFLOW_STEPS.find((s) => s.id === clean);
  if (byId) return byId;

  const keywordAliases: Array<{ id: string; pattern: RegExp }> = [
    { id: 'verify-battery-voltage', pattern: /battery|kl\s*30|supply\s+voltage|power\s+voltage/i },
    { id: 'check-pinout-continuity', pattern: /pinout|continuity|connector/i },
    { id: 'inspect-wiring-integrity', pattern: /wiring|harness|integrity|leads?/i },
    { id: 'confirm-sensor-grounds', pattern: /sensor\s+ground|sgnd|kl\s*31|ground/i },
    { id: 'capture-baseline-signals', pattern: /baseline|signal|oscilloscope|dtc/i },
    { id: 'verify-repair-signoff', pattern: /repair|sign[\s-]*off|clear\s+fault/i },
  ];

  for (const alias of keywordAliases) {
    if (alias.pattern.test(clean)) {
      return DIAGNOSTIC_WORKFLOW_STEPS.find((s) => s.id === alias.id) ?? null;
    }
  }

  return (
    DIAGNOSTIC_WORKFLOW_STEPS.find(
      (s) => s.title.toLowerCase().includes(clean) || clean.includes(s.title.toLowerCase())
    ) ?? null
  );
}

export function canEnergizeWithPreBenchGate(params: {
  preBenchGateLocked: boolean;
  preBenchGateBypassed?: boolean;
  checkedWorkflowIds: readonly string[];
}): PreBenchGateStatus {
  const mandatorySteps = DIAGNOSTIC_WORKFLOW_STEPS.filter((s) => s.mandatoryPreBench);
  const checkedSet = new Set(params.checkedWorkflowIds);
  const pendingTitles = mandatorySteps
    .filter((s) => !checkedSet.has(s.id))
    .map((s) => s.title);

  const mandatoryChecked = mandatorySteps.length - pendingTitles.length;
  const allowed =
    !params.preBenchGateLocked ||
    Boolean(params.preBenchGateBypassed) ||
    pendingTitles.length === 0;

  return {
    allowed,
    mandatoryChecked,
    mandatoryTotal: mandatorySteps.length,
    pendingTitles,
  };
}

export function shouldSeedInitialCloudPreferences(params: {
  checkedWorkflowIds: readonly string[];
  preBenchGateLocked: boolean;
  autoVerifyWorkflow: boolean;
  hasCustomVoiceMacros: boolean;
}): boolean {
  return (
    params.checkedWorkflowIds.length > 0 ||
    params.preBenchGateLocked ||
    params.autoVerifyWorkflow ||
    params.hasCustomVoiceMacros
  );
}

/**
 * SECTION 9 — STRUCTURED 10-STAGE TRACEABLE TECHNICIAN WORKFLOWS
 * Each step includes: objective, equipment, connections, expected values,
 * evidence source, safety requirements, actual results, status (PASS | FAIL | INCONCLUSIVE | NOT_TESTED),
 * and next action. Never forces a conclusion when critical evidence is incomplete.
 */
export type StructuredTechnicianStepStatus =
  | 'PASS'
  | 'FAIL'
  | 'INCONCLUSIVE'
  | 'NOT_TESTED';

export interface StructuredTechnicianWorkflowStage {
  stageNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  id:
    | 'ECU_IDENTIFICATION'
    | 'PINOUT_VERIFICATION'
    | 'POWER_AND_GROUND_CHECKS'
    | 'BENCH_CONFIGURATION'
    | 'ELECTRICAL_MEASUREMENTS'
    | 'REFERENCE_COMPARISONS'
    | 'FAULT_ISOLATION'
    | 'DIAGNOSTIC_INTERPRETATION'
    | 'REPAIR_RECOMMENDATIONS'
    | 'TEST_DOCUMENTATION';
  title: string;
  objective: string;
  equipment: string[];
  connections: string;
  expectedValues: string;
  evidenceSource:
    | 'PHYSICAL_INSTRUMENT'
    | 'ELECTRICAL_SIMULATION'
    | 'VERIFIED_OEM_DOCUMENTATION'
    | 'UNIVERSAL_TRAINER_REFERENCE'
    | 'LOCAL_TECHNICAL_KNOWLEDGE';
  safetyRequirements: string;
  actualResults: string;
  status: StructuredTechnicianStepStatus;
  nextAction: string;
}

export interface StructuredWorkflowEvaluationSummary {
  stages: StructuredTechnicianWorkflowStage[];
  overallStatus: StructuredTechnicianStepStatus;
  canConcludeDiagnosis: boolean;
  conclusionStatement: string;
}

export function evaluateStructuredTechnicianWorkflow(
  input: WorkflowEvaluationInput & {
    ecuProvenanceTier?: 'UNIVERSAL_TRAINER' | 'VERIFIED_OEM' | 'UNVERIFIED_OEM';
    unresolvedNodes?: string[];
  }
): StructuredWorkflowEvaluationSummary {
  const {
    powerSupply,
    wires,
    faults,
    activeDTCs,
    nodeVoltages,
    supplyCurrentDrawAmps,
    isSupplyCurrentTripped,
    multimeter,
    multimeterReading,
    ecuProfileLabel,
    ecuProvenanceTier = 'UNIVERSAL_TRAINER',
    unresolvedNodes = [],
  } = input;

  const kl30V = nodeVoltages['ecu-pin-3'] ?? 0;
  const kl15V = nodeVoltages['ecu-pin-4'] ?? 0;
  const kl31V = nodeVoltages['ecu-pin-1'] ?? 0;
  const vrefV = nodeVoltages['ecu-pin-5'] ?? 0;
  const sgndV = nodeVoltages['ecu-pin-6'] ?? 0;
  const cutCount = wires.filter((w) => w.isCut).length;
  const probeAttached = Boolean(
    multimeter.isPowered &&
      multimeter.redProbe.attachedToPinId &&
      multimeter.blackProbe.attachedToPinId
  );
  const probedPinUnresolved =
    Boolean(
      multimeter.redProbe.attachedToPinId &&
        unresolvedNodes.includes(multimeter.redProbe.attachedToPinId)
    ) || multimeterReading.display === 'UNRESOLVED';

  const stages: StructuredTechnicianWorkflowStage[] = [
    {
      stageNumber: 1,
      id: 'ECU_IDENTIFICATION',
      title: '1. ECU Identification',
      objective: 'Confirm exact ECU part number, hardware family, and provenance tier.',
      equipment: ['ECU Label Scanner / Registry Lookup'],
      connections: 'Visual inspection before connecting bench harness',
      expectedValues: 'Identified Universal Trainer or Verified OEM Profile',
      evidenceSource:
        ecuProvenanceTier === 'VERIFIED_OEM'
          ? 'VERIFIED_OEM_DOCUMENTATION'
          : 'UNIVERSAL_TRAINER_REFERENCE',
      safetyRequirements: 'Never assume two OEM ECUs share pinouts without part-number confirmation.',
      actualResults: `${ecuProfileLabel || 'Universal 16-Pin Trainer'} (${ecuProvenanceTier})`,
      status: ecuProvenanceTier === 'UNVERIFIED_OEM' ? 'INCONCLUSIVE' : 'PASS',
      nextAction:
        ecuProvenanceTier === 'UNVERIFIED_OEM'
          ? 'Verify OEM factory wiring diagram before energizing bench PSU.'
          : 'Proceed to Stage 2 Pinout Verification.',
    },
    {
      stageNumber: 2,
      id: 'PINOUT_VERIFICATION',
      title: '2. Pinout Verification',
      objective: 'Verify KL30, KL15, KL31, SGND, 5V VREF, and CAN terminals against reference.',
      equipment: ['Pinout Matrix', 'Digital Multimeter (Key-OFF Continuity)'],
      connections: 'ECU Header Pins #1 (KL31), #3 (KL30), #4 (KL15), #5 (VREF), #6 (SGND)',
      expectedValues: 'Verified pin roles with 0 cross-wired power/signal leads',
      evidenceSource:
        ecuProvenanceTier === 'VERIFIED_OEM'
          ? 'VERIFIED_OEM_DOCUMENTATION'
          : 'UNIVERSAL_TRAINER_REFERENCE',
      safetyRequirements: 'Keep PSU OFF during continuity verification.',
      actualResults:
        ecuProvenanceTier === 'UNVERIFIED_OEM'
          ? 'OEM pinout unverified / OCR pending'
          : `Pin map verified (${input.pins.length} pins mapped)`,
      status: ecuProvenanceTier === 'UNVERIFIED_OEM' ? 'FAIL' : 'PASS',
      nextAction:
        ecuProvenanceTier === 'UNVERIFIED_OEM'
          ? 'Halt bench power until OEM connector pins are verified.'
          : 'Proceed to Stage 3 Power and Ground Checks.',
    },
    {
      stageNumber: 3,
      id: 'POWER_AND_GROUND_CHECKS',
      title: '3. Power and Ground Checks',
      objective: 'Confirm clean chassis/power ground (KL31) and sensor ground return (SGND).',
      equipment: ['Bench DMM (V_DC / Continuity)'],
      connections: 'Black Probe -> Chassis GND, Red Probe -> Pin #1 (KL31) & Pin #6 (SGND)',
      expectedValues: 'KL31 <= 0.10V, SGND <= 0.05V, 0 Ω to ground reference',
      evidenceSource: 'ELECTRICAL_SIMULATION',
      safetyRequirements: 'Confirm ground return integrity before energizing high-side loads.',
      actualResults: `KL31=${kl31V.toFixed(3)}V, SGND=${sgndV.toFixed(3)}V`,
      status: Math.abs(kl31V) <= 0.5 && Math.abs(sgndV) <= 0.5 ? 'PASS' : 'FAIL',
      nextAction:
        Math.abs(kl31V) <= 0.5 && Math.abs(sgndV) <= 0.5
          ? 'Grounds verified. Proceed to Stage 4 Bench Configuration.'
          : 'Repair elevated ground offset on KL31/SGND before testing sensors.',
    },
    {
      stageNumber: 4,
      id: 'BENCH_CONFIGURATION',
      title: '4. Bench Configuration',
      objective: 'Configure DC power supply voltage (12.0V–14.4V) and safe current limit (<= 5.0A).',
      equipment: ['Programmable Bench DC Power Supply'],
      connections: 'PSU (+) -> KL30/KL15 bus, PSU (-) -> KL31 Common Ground',
      expectedValues: '12.0V–14.4V DC, Current Limit 1.5A–5.0A, OCP Ready',
      evidenceSource: 'ELECTRICAL_SIMULATION',
      safetyRequirements: 'Never raise current limit to force power into an OCP trip.',
      actualResults: `${powerSupply.voltageSetting.toFixed(2)}V, Limit ${powerSupply.currentLimit.toFixed(2)}A, Output ${powerSupply.isOutputEnabled ? 'ON' : 'OFF'}${isSupplyCurrentTripped ? ' [OCP TRIPPED]' : ''}`,
      status: isSupplyCurrentTripped
        ? 'FAIL'
        : powerSupply.voltageSetting >= 11.5 &&
            powerSupply.voltageSetting <= 14.8 &&
            powerSupply.currentLimit <= 5.0
          ? 'PASS'
          : 'INCONCLUSIVE',
      nextAction: isSupplyCurrentTripped
        ? 'De-energize PSU and clear short circuit causing OCP trip.'
        : 'Proceed to Stage 5 Electrical Measurements.',
    },
    {
      stageNumber: 5,
      id: 'ELECTRICAL_MEASUREMENTS',
      title: '5. Electrical Measurements',
      objective: 'Measure live rail and signal voltages with virtual or physical DMM.',
      equipment: ['Digital Multimeter', '2-Channel Oscilloscope'],
      connections: `Red Probe -> ${multimeter.redProbe.attachedLabel}, Black Probe -> ${multimeter.blackProbe.attachedLabel}`,
      expectedValues: 'Finite, ground-referenced reading matching active DMM mode',
      evidenceSource: 'ELECTRICAL_SIMULATION',
      safetyRequirements: 'Never switch DMM to Ohms/Continuity while PSU Output is ON.',
      actualResults: !powerSupply.isOutputEnabled
        ? 'PSU Output OFF (Standby)'
        : probedPinUnresolved
          ? 'UNRESOLVED floating node measurement'
          : `DMM ${multimeterReading.display} ${multimeterReading.unit}`,
      status: !powerSupply.isOutputEnabled
        ? 'NOT_TESTED'
        : multimeterReading.isWarning || probedPinUnresolved
          ? 'INCONCLUSIVE'
          : probeAttached
            ? 'PASS'
            : 'NOT_TESTED',
      nextAction: !powerSupply.isOutputEnabled
        ? 'Enable PSU output after pre-bench safety checks to record live measurements.'
        : probedPinUnresolved
          ? 'Restore circuit reference path for floating/unresolved node.'
          : 'Compare measured values in Stage 6.',
    },
    {
      stageNumber: 6,
      id: 'REFERENCE_COMPARISONS',
      title: '6. Reference Comparisons',
      objective: 'Compare KL30, KL15, and 5V VREF rails against nominal specifications.',
      equipment: ['ECU Pinout Reference Table', 'Bench DMM'],
      connections: 'Pin #3 (KL30), Pin #4 (KL15), Pin #5 (5V VREF)',
      expectedValues: 'KL30: 12.0–14.4V, KL15: 12.0–14.4V, VREF: 4.90–5.10V',
      evidenceSource:
        ecuProvenanceTier === 'VERIFIED_OEM'
          ? 'VERIFIED_OEM_DOCUMENTATION'
          : 'UNIVERSAL_TRAINER_REFERENCE',
      safetyRequirements: 'Never apply >5.5V to Pin #5 (5V VREF).',
      actualResults: !powerSupply.isOutputEnabled
        ? 'Not yet energized'
        : `KL30=${kl30V.toFixed(2)}V, KL15=${kl15V.toFixed(2)}V, VREF=${vrefV.toFixed(2)}V`,
      status: !powerSupply.isOutputEnabled
        ? 'NOT_TESTED'
        : kl30V >= 11.0 && kl15V >= 11.0 && vrefV >= 4.75 && vrefV <= 5.25
          ? 'PASS'
          : 'FAIL',
      nextAction:
        !powerSupply.isOutputEnabled
          ? 'Energize PSU to compare rail voltages.'
          : vrefV < 4.75 || vrefV > 5.25
            ? 'Inspect 5V LDO regulator (7805) and sensor VREF rail for shorts/overload.'
            : 'Rails within specification. Proceed to Stage 7 Fault Isolation.',
    },
    {
      stageNumber: 7,
      id: 'FAULT_ISOLATION',
      title: '7. Fault Isolation',
      objective: 'Isolate open harness leads, short circuits, and active pin faults.',
      equipment: ['Harness Schematic', 'Fault Matrix'],
      connections: 'All 16 bench harness leads and sensor/actuator branches',
      expectedValues: '0 cut wires, 0 active pin faults, 0 unresolved nodes',
      evidenceSource: 'ELECTRICAL_SIMULATION',
      safetyRequirements: 'Isolate short-to-ground faults with PSU OFF.',
      actualResults: `${cutCount} cut wires, ${faults.length} injected faults, ${unresolvedNodes.length} unresolved nodes`,
      status: cutCount === 0 && faults.length === 0 ? 'PASS' : 'FAIL',
      nextAction:
        cutCount === 0 && faults.length === 0
          ? 'No active harness faults detected.'
          : 'Locate and repair cut wires or clear injected pin faults.',
    },
    {
      stageNumber: 8,
      id: 'DIAGNOSTIC_INTERPRETATION',
      title: '8. Diagnostic Interpretation',
      objective: 'Correlate measured electrical evidence with active OBD-II DTCs.',
      equipment: ['OBD-II Fault Scanner', 'Local-First Knowledge DB'],
      connections: 'CAN_H (Pin #14) & CAN_L (Pin #15)',
      expectedValues: 'Consistent root-cause correlation supported by valid measurements',
      evidenceSource: 'LOCAL_TECHNICAL_KNOWLEDGE',
      safetyRequirements: 'Do not guess or fabricate root causes when measurements are unresolved.',
      actualResults: !powerSupply.isOutputEnabled
        ? 'Awaiting energized telemetry for DTC correlation'
        : activeDTCs.length === 0
          ? '0 active DTCs · Normal ECU operation'
          : `Active DTCs: ${activeDTCs.map((d) => d.code).join(', ')}`,
      status: !powerSupply.isOutputEnabled
        ? 'NOT_TESTED'
        : probedPinUnresolved
          ? 'INCONCLUSIVE'
          : activeDTCs.length === 0
            ? 'PASS'
            : 'FAIL',
      nextAction: !powerSupply.isOutputEnabled
        ? 'Complete Stage 5 measurements before interpreting DTCs.'
        : activeDTCs.length > 0
          ? `Address root cause for ${activeDTCs.map((d) => d.code).join(', ')}.`
          : 'Proceed to Stage 9 Repair Recommendations.',
    },
    {
      stageNumber: 9,
      id: 'REPAIR_RECOMMENDATIONS',
      title: '9. Repair Recommendations',
      objective: 'Formulate evidence-backed repair action based on verified measurements.',
      equipment: ['Repair Guide & PCB Inspection Overlay'],
      connections: 'Targeted faulty circuit or internal ECU protection component',
      expectedValues: 'Specific repair action backed by PASS/FAIL electrical evidence',
      evidenceSource: 'LOCAL_TECHNICAL_KNOWLEDGE',
      safetyRequirements: 'DisconnectKL30/KL15 power before soldering or replacing PCB components.',
      actualResults: !powerSupply.isOutputEnabled
        ? 'Insufficient live measurement evidence to finalize repair recommendation'
        : cutCount > 0 || faults.length > 0 || activeDTCs.length > 0
          ? 'Targeted circuit repair required on flagged pins/harness leads'
          : 'No hardware replacement required — all rails and signals nominal',
      status: !powerSupply.isOutputEnabled
        ? 'INCONCLUSIVE'
        : cutCount === 0 && faults.length === 0 && activeDTCs.length === 0 && !isSupplyCurrentTripped
          ? 'PASS'
          : 'FAIL',
      nextAction: !powerSupply.isOutputEnabled
        ? 'Perform energized rail and signal checks first.'
        : 'Execute recommended repair and verify in Stage 10.',
    },
    {
      stageNumber: 10,
      id: 'TEST_DOCUMENTATION',
      title: '10. Test Documentation & Sign-Off',
      objective: 'Document verified voltages, current draw, DTC clearance, and evidence provenance.',
      equipment: ['AutoElectric Lab Pro Diagnostic Report'],
      connections: 'Full Closed-Loop Bench Verification',
      expectedValues: 'All critical stages tested, 0 active DTCs, nominal current draw',
      evidenceSource: 'ELECTRICAL_SIMULATION',
      safetyRequirements: 'Retain audit log of all authorized bench actions.',
      actualResults:
        powerSupply.isOutputEnabled &&
        !isSupplyCurrentTripped &&
        cutCount === 0 &&
        faults.length === 0 &&
        activeDTCs.length === 0
          ? `Verified PASS @ ${powerSupply.voltageSetting.toFixed(1)}V / ${supplyCurrentDrawAmps.toFixed(2)}A`
          : 'Awaiting completion of all energized tests and fault clearance',
      status:
        !powerSupply.isOutputEnabled
          ? 'NOT_TESTED'
          : !isSupplyCurrentTripped &&
              cutCount === 0 &&
              faults.length === 0 &&
              activeDTCs.length === 0
            ? 'PASS'
            : 'FAIL',
      nextAction:
        powerSupply.isOutputEnabled &&
        !isSupplyCurrentTripped &&
        cutCount === 0 &&
        faults.length === 0 &&
        activeDTCs.length === 0
          ? 'Diagnosis complete and documented.'
          : 'Resolve remaining FAIL / NOT_TESTED stages before sign-off.',
    },
  ];

  const hasUntestedOrInconclusiveCritical = stages
    .filter((s) => s.stageNumber <= 6)
    .some((s) => s.status === 'NOT_TESTED' || s.status === 'INCONCLUSIVE');
  const hasAnyFail = stages.some((s) => s.status === 'FAIL');

  const canConcludeDiagnosis = !hasUntestedOrInconclusiveCritical;
  const overallStatus: StructuredTechnicianStepStatus = hasAnyFail
    ? 'FAIL'
    : hasUntestedOrInconclusiveCritical
      ? 'INCONCLUSIVE'
      : 'PASS';

  const conclusionStatement = !canConcludeDiagnosis
    ? 'INCONCLUSIVE: Critical electrical measurements or ECU pinout verification stages are incomplete (NOT_TESTED / INCONCLUSIVE). Do not force a repair conclusion without valid measurement evidence.'
    : hasAnyFail
      ? 'FAULT CONFIRMED BY EVIDENCE: Review failed workflow stages and isolate the flagged circuit before sign-off.'
      : 'VERIFIED PASS: All 10 structured diagnostic workflow stages passed with valid measurement evidence.';

  return {
    stages,
    overallStatus,
    canConcludeDiagnosis,
    conclusionStatement,
  };
}

