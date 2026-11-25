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
