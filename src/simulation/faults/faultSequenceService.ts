/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { EcuPin, FaultType, InjectedFault } from '../../types/ecu';

export type CustomFaultMode =
  | 'INTERMITTENT_SIGNAL'
  | 'RESISTANCE_BUILDUP'
  | 'HARD_GROUND'
  | 'SHORT_TO_VBAT'
  | 'OPEN_CIRCUIT'
  | 'CUT_WIRE'
  | 'CKP_DROPOUT';

export type IntermittentEffect = 'OPEN_DROPOUT' | 'SHORT_TO_GND' | 'HIGH_RESISTANCE';

export type FaultDifficultyLevel = 'APPRENTICE' | 'TECHNICIAN' | 'MASTER';

export type ReasoningFaultCategory =
  | 'INTERMITTENT'
  | 'RESISTANCE_BUILDUP'
  | 'HARD_GROUND'
  | 'SHORT_TO_VBAT'
  | 'OPEN_CIRCUIT'
  | 'CKP_DROPOUT'
  | 'MULTI_FAULT';

export interface FaultBuilderStageItem {
  id: string;
  pinId: string;
  wireId?: string;
  mode: CustomFaultMode;
  label: string;
  /** Starting contact/corrosion resistance in Ohms (0.5 - 100,000). */
  startOhms?: number;
  /** Ending resistance in Ohms for linear ramp across the stage duration. */
  endOhms?: number;
  /** Active fault pulse width in ms for INTERMITTENT_SIGNAL (default 700ms). */
  onDurationMs?: number;
  /** Nominal recovery window in ms for INTERMITTENT_SIGNAL (default 900ms). */
  offDurationMs?: number;
  /** Physical effect applied while the intermittent pulse is engaged. */
  intermittentEffect?: IntermittentEffect;
}

export interface FaultSequenceStep {
  id: string;
  name: string;
  durationSec: number;
  notes: string;
  items: FaultBuilderStageItem[];
}

export type FaultSequenceSyncState = 'SYNCED_CLOUD' | 'QUEUED_OFFLINE' | 'LOCAL_ONLY';

export interface CustomFaultSequence {
  id: string;
  title: string;
  description: string;
  difficulty: FaultDifficultyLevel;
  loopPlayback: boolean;
  blindChallengeHint?: string;
  steps: FaultSequenceStep[];
  isBuiltInPreset?: boolean;
  syncState?: FaultSequenceSyncState;
  /** Server-confirmed Firestore updatedAt timestamp (ms) used for cross-device OCC conflict detection. */
  cloudUpdatedAtMs?: number;
  createdAt: number;
  updatedAt: number;
}

export interface EvaluatedFaultSummaryItem {
  itemId: string;
  label: string;
  pinId: string;
  pinLabel: string;
  mode: CustomFaultMode;
  engaged: boolean;
  effectiveOhms?: number;
}

export interface FaultSequenceFrameEvaluation {
  sequenceId: string;
  totalDurationMs: number;
  clampedElapsedMs: number;
  activeStepIndex: number;
  activeStep: FaultSequenceStep;
  stepElapsedMs: number;
  stepDurationMs: number;
  stepProgressRatio: number;
  completedNonLoop: boolean;
  injectedFaults: InjectedFault[];
  cutWireIds: string[];
  ckpSignalLost: boolean;
  intermittentEngaged: boolean;
  activeSummaryItems: EvaluatedFaultSummaryItem[];
}

export interface ReasoningCheckResult {
  pinMatched: boolean;
  mechanismMatched: boolean;
  overallCorrect: boolean;
  expectedPinLabels: string[];
  expectedCategories: ReasoningFaultCategory[];
  feedbackTitle: string;
  feedbackDetail: string;
}

export const CUSTOM_FAULT_SEQUENCES_STORAGE_KEY = 'autoelectric_fault_builder_sequences_v1';

export const MIN_PULSE_WIDTH_MS = 10;
export const MAX_SEQUENCE_COUNT = 40;
export const MAX_STEPS_PER_SEQUENCE = 16;
export const MAX_ITEMS_PER_STEP = 12;
const MAX_IMPORT_JSON_BYTES = 128 * 1024;

function clampNumber(val: unknown, fallback: number, min: number, max: number): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function makeUid(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function mapOhmsToStandardFaultType(ohms: number): FaultType {
  if (ohms >= 600) return 'HIGH_RESISTANCE_1K';
  if (ohms >= 130) return 'HIGH_RESISTANCE_250R';
  return 'HIGH_RESISTANCE_50R';
}

export function describeFaultMode(mode: CustomFaultMode): string {
  switch (mode) {
    case 'INTERMITTENT_SIGNAL':
      return 'Intermittent Sensor Signal';
    case 'RESISTANCE_BUILDUP':
      return 'Resistance Buildup';
    case 'HARD_GROUND':
      return 'Hard Ground (KL31 Short)';
    case 'SHORT_TO_VBAT':
      return 'Short to +12V VBAT';
    case 'OPEN_CIRCUIT':
      return 'Open Circuit Break';
    case 'CUT_WIRE':
      return 'Harness Wire Cut';
    case 'CKP_DROPOUT':
      return 'CKP Crank Signal Dropout';
  }
}

export const BUILT_IN_FAULT_SEQUENCES: readonly CustomFaultSequence[] = [
  {
    id: 'preset-tps-intermittent-corrosion-short',
    title: 'TPS Intermittent -> Corrosion Buildup -> Hard Ground',
    description:
      'Classic 3-stage throttle harness deterioration: starts with vibration-induced intermittent dropouts, builds connector oxidation resistance (+25Ω to +450Ω), then pinches into a hard short to ground (P0122).',
    difficulty: 'TECHNICIAN',
    loopPlayback: true,
    blindChallengeHint:
      'Compare TPS_SIG (Pin 7) oscilloscope traces while idle: check whether voltage glitches toward 0V briefly, drifts with high series impedance, or locks flat near 0.00V.',
    isBuiltInPreset: true,
    createdAt: 1_760_000_000_000,
    updatedAt: 1_760_000_000_000,
    steps: [
      {
        id: 'step-tps-1',
        name: 'Stage 1: Intermittent TPS Signal Dropout',
        durationSec: 6,
        notes: 'Simulate loose female terminal fretting under engine vibration (700ms dropout / 900ms clean).',
        items: [
          {
            id: 'item-tps-int',
            pinId: 'ecu-pin-7',
            mode: 'INTERMITTENT_SIGNAL',
            label: 'TPS_SIG Intermittent Pin Chatter',
            onDurationMs: 700,
            offDurationMs: 900,
            intermittentEffect: 'OPEN_DROPOUT',
          },
        ],
      },
      {
        id: 'step-tps-2',
        name: 'Stage 2: Progressive Resistance Buildup',
        durationSec: 8,
        notes: 'Moisture intrusion creates green terminal corrosion, ramping series resistance from +25Ω up to +450Ω.',
        items: [
          {
            id: 'item-tps-res',
            pinId: 'ecu-pin-7',
            mode: 'RESISTANCE_BUILDUP',
            label: 'TPS Connector Oxidation (+25Ω -> +450Ω)',
            startOhms: 25,
            endOhms: 450,
          },
        ],
      },
      {
        id: 'step-tps-3',
        name: 'Stage 3: Hard Short to Chassis Ground',
        durationSec: 6,
        notes: 'Chafed harness insulation finally contacts engine block ground, clamping TPS_SIG to ~0.00V and setting P0122.',
        items: [
          {
            id: 'item-tps-gnd',
            pinId: 'ecu-pin-7',
            mode: 'HARD_GROUND',
            label: 'TPS_SIG Hard Short to KL31 Ground',
          },
        ],
      },
    ],
  },
  {
    id: 'preset-ground-offset-can-collapse',
    title: 'KL31 Ground Buildup + CAN Bus Asymmetric Fault',
    description:
      'Multi-fault diagnostic drill combining elevated chassis ground return resistance (+40Ω -> +180Ω) with intermittent and hard CAN_H grounding that knocks out communication (U0001).',
    difficulty: 'MASTER',
    loopPlayback: true,
    blindChallengeHint:
      'Measure KL31 (Pin 1) voltage drop relative to chassis-gnd first before condemning the CAN transceiver on Pin 13.',
    isBuiltInPreset: true,
    createdAt: 1_760_000_000_000,
    updatedAt: 1_760_000_000_000,
    steps: [
      {
        id: 'step-gnd-1',
        name: 'Stage 1: KL31 Ground Terminal Oxidation',
        durationSec: 6,
        notes: 'Battery/ECU main ground lug builds resistance from +40Ω to +180Ω, lifting all ECU ground-referenced signals.',
        items: [
          {
            id: 'item-kl31-res',
            pinId: 'ecu-pin-1',
            mode: 'RESISTANCE_BUILDUP',
            label: 'KL31 Ground Lug Resistance Buildup',
            startOhms: 40,
            endOhms: 180,
          },
        ],
      },
      {
        id: 'step-gnd-2',
        name: 'Stage 2: Concurrent Ground Offset + CAN_H Intermittent',
        durationSec: 6,
        notes: 'While KL31 remains corroded (+180Ω), CAN_H begins intermittent contact drops.',
        items: [
          {
            id: 'item-kl31-hold',
            pinId: 'ecu-pin-1',
            mode: 'RESISTANCE_BUILDUP',
            label: 'KL31 Ground Corrosion (+180Ω)',
            startOhms: 180,
            endOhms: 180,
          },
          {
            id: 'item-canh-int',
            pinId: 'ecu-pin-13',
            mode: 'INTERMITTENT_SIGNAL',
            label: 'CAN_H Intermittent Ground Pinch',
            onDurationMs: 650,
            offDurationMs: 850,
            intermittentEffect: 'SHORT_TO_GND',
          },
        ],
      },
      {
        id: 'step-gnd-3',
        name: 'Stage 3: Dual Ground Buildup + Hard CAN_H Short',
        durationSec: 6,
        notes: 'CAN_H stays shorted hard to ground alongside the degraded KL31 ground return.',
        items: [
          {
            id: 'item-kl31-final',
            pinId: 'ecu-pin-1',
            mode: 'RESISTANCE_BUILDUP',
            label: 'KL31 Ground Corrosion (+180Ω)',
            startOhms: 180,
            endOhms: 180,
          },
          {
            id: 'item-canh-hard',
            pinId: 'ecu-pin-13',
            mode: 'HARD_GROUND',
            label: 'CAN_H Hard Short to Ground',
          },
        ],
      },
    ],
  },
  {
    id: 'preset-vref-load-ect-drift',
    title: 'VREF 5V Intermittent Drag + ECT High Resistance',
    description:
      'Tests differentiation between a shared 5V sensor supply sag and an individual coolant thermistor harness resistance fault (P0118).',
    difficulty: 'APPRENTICE',
    loopPlayback: true,
    blindChallengeHint:
      'Watch VREF_5V (Pin 5) alongside ECT_SIG (Pin 9) and MAP_SIG (Pin 8). If MAP drops whenever ECT shifts, check the shared 5V supply rail.',
    isBuiltInPreset: true,
    createdAt: 1_760_000_000_000,
    updatedAt: 1_760_000_000_000,
    steps: [
      {
        id: 'step-vref-1',
        name: 'Stage 1: ECT Connector Corrosion (+120Ω -> +600Ω)',
        durationSec: 7,
        notes: 'ECT harness builds series resistance while 5V VREF stays steady.',
        items: [
          {
            id: 'item-ect-res',
            pinId: 'ecu-pin-9',
            mode: 'RESISTANCE_BUILDUP',
            label: 'ECT_SIG Harness Corrosion',
            startOhms: 120,
            endOhms: 600,
          },
        ],
      },
      {
        id: 'step-vref-2',
        name: 'Stage 2: Intermittent VREF 5V Short + ECT Resistance',
        durationSec: 7,
        notes: 'External 5V sensor wire rubs ground intermittently (550ms ON / 1100ms OFF) while ECT stays at +600Ω.',
        items: [
          {
            id: 'item-vref-int',
            pinId: 'ecu-pin-5',
            mode: 'INTERMITTENT_SIGNAL',
            label: 'VREF_5V Intermittent Short to GND',
            onDurationMs: 550,
            offDurationMs: 1100,
            intermittentEffect: 'SHORT_TO_GND',
          },
          {
            id: 'item-ect-hold',
            pinId: 'ecu-pin-9',
            mode: 'RESISTANCE_BUILDUP',
            label: 'ECT_SIG Corroded Terminal (+600Ω)',
            startOhms: 600,
            endOhms: 600,
          },
        ],
      },
    ],
  },
  {
    id: 'preset-tps-sub150-chatter-glitch',
    title: 'Fast 25ms TPS Micro-Dropout & CKP Sync Glitch',
    description:
      'High-speed intermittent drill featuring 25ms/75ms harness terminal chatter that escapes coarse multimeters unless caught by edge triggers or oscilloscope trace.',
    difficulty: 'MASTER',
    loopPlayback: true,
    blindChallengeHint:
      'Watch the Pin Scope on TPS_SIG (Pin 7) and the transport pulse-edge latch counter for brief 25ms dropouts that return before an averaging DMM settles.',
    isBuiltInPreset: true,
    createdAt: 1_760_000_000_000,
    updatedAt: 1_760_000_000_000,
    steps: [
      {
        id: 'step-glitch-1',
        name: 'Stage 1: 25ms TPS Terminal Micro-Chatter',
        durationSec: 5,
        notes: '25ms open dropout every 100ms (25% fault duty cycle) simulating high-frequency wiper bounce.',
        items: [
          {
            id: 'item-tps-micro',
            pinId: 'ecu-pin-7',
            mode: 'INTERMITTENT_SIGNAL',
            label: 'TPS_SIG 25ms Micro-Chatter',
            onDurationMs: 25,
            offDurationMs: 75,
            intermittentEffect: 'OPEN_DROPOUT',
          },
        ],
      },
      {
        id: 'step-glitch-2',
        name: 'Stage 2: 40ms CKP Dropout + TPS Short Glitch',
        durationSec: 5,
        notes: 'Brief 40ms CKP signal loss overlapping 40ms TPS ground pinches.',
        items: [
          {
            id: 'item-ckp-micro',
            pinId: 'ecu-pin-11',
            mode: 'CKP_DROPOUT',
            label: 'CKP 40ms Sync Dropout',
            onDurationMs: 40,
            offDurationMs: 120,
          },
          {
            id: 'item-tps-pinch-micro',
            pinId: 'ecu-pin-7',
            mode: 'INTERMITTENT_SIGNAL',
            label: 'TPS_SIG 40ms Ground Pinch',
            onDurationMs: 40,
            offDurationMs: 120,
            intermittentEffect: 'SHORT_TO_GND',
          },
        ],
      },
    ],
  },
];

export function createEmptyFaultSequence(title = 'Custom Diagnostic Sequence'): CustomFaultSequence {
  const now = Date.now();
  return {
    id: makeUid('fseq'),
    title,
    description: 'Custom multi-fault bench drill created in Fault Builder.',
    difficulty: 'TECHNICIAN',
    loopPlayback: true,
    blindChallengeHint: '',
    isBuiltInPreset: false,
    createdAt: now,
    updatedAt: now,
    steps: [
      {
        id: makeUid('fstep'),
        name: 'Stage 1: Initial Fault',
        durationSec: 6,
        notes: 'Initial symptom phase.',
        items: [
          {
            id: makeUid('fitem'),
            pinId: 'ecu-pin-7',
            mode: 'INTERMITTENT_SIGNAL',
            label: 'Intermittent TPS Signal Dropout',
            onDurationMs: 700,
            offDurationMs: 900,
            intermittentEffect: 'OPEN_DROPOUT',
          },
        ],
      },
      {
        id: makeUid('fstep'),
        name: 'Stage 2: Escalated Fault',
        durationSec: 6,
        notes: 'Escalated resistance buildup or hard short.',
        items: [
          {
            id: makeUid('fitem'),
            pinId: 'ecu-pin-7',
            mode: 'RESISTANCE_BUILDUP',
            label: 'Resistance Buildup (+50Ω -> +300Ω)',
            startOhms: 50,
            endOhms: 300,
          },
        ],
      },
    ],
  };
}

function sanitizeStageItem(raw: unknown): FaultBuilderStageItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const validModes: CustomFaultMode[] = [
    'INTERMITTENT_SIGNAL',
    'RESISTANCE_BUILDUP',
    'HARD_GROUND',
    'SHORT_TO_VBAT',
    'OPEN_CIRCUIT',
    'CUT_WIRE',
    'CKP_DROPOUT',
  ];
  const rawMode = String(obj.mode || 'OPEN_CIRCUIT') as CustomFaultMode;
  const mode: CustomFaultMode = validModes.includes(rawMode) ? rawMode : 'OPEN_CIRCUIT';
  const pinId = String(obj.pinId || 'ecu-pin-7').slice(0, 64) || 'ecu-pin-7';
  const wireId = obj.wireId ? String(obj.wireId).slice(0, 64) : undefined;
  const label = String(obj.label || describeFaultMode(mode)).slice(0, 120) || describeFaultMode(mode);
  const effectRaw = String(obj.intermittentEffect || 'OPEN_DROPOUT') as IntermittentEffect;
  const intermittentEffect: IntermittentEffect =
    effectRaw === 'SHORT_TO_GND' || effectRaw === 'HIGH_RESISTANCE' ? effectRaw : 'OPEN_DROPOUT';

  return {
    id: String(obj.id || makeUid('fitem')).slice(0, 64),
    pinId,
    ...(wireId ? { wireId } : {}),
    mode,
    label,
    startOhms: clampNumber(obj.startOhms, 50, 0.5, 100_000),
    endOhms: clampNumber(obj.endOhms ?? obj.startOhms, clampNumber(obj.startOhms, 50, 0.5, 100_000), 0.5, 100_000),
    onDurationMs: clampNumber(obj.onDurationMs, 700, MIN_PULSE_WIDTH_MS, 30_000),
    offDurationMs: clampNumber(obj.offDurationMs, 900, MIN_PULSE_WIDTH_MS, 30_000),
    intermittentEffect,
  };
}

function sanitizeSequenceStep(raw: unknown, idx: number): FaultSequenceStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const itemsRaw = Array.isArray(obj.items) ? obj.items.slice(0, MAX_ITEMS_PER_STEP) : [];
  const items = itemsRaw.map(sanitizeStageItem).filter((x): x is FaultBuilderStageItem => x !== null);
  return {
    id: String(obj.id || makeUid('fstep')).slice(0, 64),
    name: String(obj.name || `Stage ${idx + 1}`).slice(0, 100) || `Stage ${idx + 1}`,
    durationSec: clampNumber(obj.durationSec, 6, 2, 120),
    notes: String(obj.notes || '').slice(0, 280),
    items,
  };
}

export function sanitizeFaultSequence(raw: unknown): CustomFaultSequence | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const stepsRaw = Array.isArray(obj.steps) ? obj.steps.slice(0, MAX_STEPS_PER_SEQUENCE) : [];
  const steps = stepsRaw
    .map((s, idx) => sanitizeSequenceStep(s, idx))
    .filter((x): x is FaultSequenceStep => x !== null);
  if (steps.length === 0) return null;

  const rawDiff = String(obj.difficulty || 'TECHNICIAN') as FaultDifficultyLevel;
  const difficulty: FaultDifficultyLevel =
    rawDiff === 'APPRENTICE' || rawDiff === 'MASTER' ? rawDiff : 'TECHNICIAN';

  const rawSync = obj.syncState;
  const syncState: FaultSequenceSyncState | undefined =
    rawSync === 'SYNCED_CLOUD' || rawSync === 'QUEUED_OFFLINE' || rawSync === 'LOCAL_ONLY'
      ? rawSync
      : undefined;

  const rawCloudUpdatedAtMs = Number(obj.cloudUpdatedAtMs);
  const cloudUpdatedAtMs =
    Number.isFinite(rawCloudUpdatedAtMs) && rawCloudUpdatedAtMs > 0
      ? rawCloudUpdatedAtMs
      : undefined;

  return {
    id: String(obj.id || makeUid('fseq')).slice(0, 64),
    title: String(obj.title || 'Untitled Fault Sequence').slice(0, 100) || 'Untitled Fault Sequence',
    description: String(obj.description || '').slice(0, 320),
    difficulty,
    loopPlayback: obj.loopPlayback !== false,
    blindChallengeHint: obj.blindChallengeHint ? String(obj.blindChallengeHint).slice(0, 260) : '',
    steps,
    isBuiltInPreset: Boolean(obj.isBuiltInPreset),
    ...(syncState ? { syncState } : {}),
    ...(cloudUpdatedAtMs !== undefined ? { cloudUpdatedAtMs } : {}),
    createdAt: clampNumber(obj.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
    updatedAt: clampNumber(obj.updatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
  };
}

// In-memory storage fallback for Node tests without window.localStorage
const memorySequenceStore = new Map<string, CustomFaultSequence>();

function readRawStoredCustomSequences(): CustomFaultSequence[] {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(CUSTOM_FAULT_SEQUENCES_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .slice(0, MAX_SEQUENCE_COUNT)
        .map(sanitizeFaultSequence)
        .filter((s): s is CustomFaultSequence => s !== null && !s.isBuiltInPreset);
    } catch {
      return [];
    }
  }
  return Array.from(memorySequenceStore.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

function writeStoredCustomSequences(customList: CustomFaultSequence[]): void {
  const bounded = customList
    .filter((s) => !s.isBuiltInPreset)
    .slice(0, MAX_SEQUENCE_COUNT);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(CUSTOM_FAULT_SEQUENCES_STORAGE_KEY, JSON.stringify(bounded));
    } catch {
      // Ignore storage quota errors cleanly
    }
    return;
  }

  memorySequenceStore.clear();
  for (const seq of bounded) {
    memorySequenceStore.set(seq.id, seq);
  }
}

export function readLegacyLocalFaultSequences(): CustomFaultSequence[] {
  return readRawStoredCustomSequences();
}

export function clearLegacyLocalFaultSequences(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(CUSTOM_FAULT_SEQUENCES_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }
}

export function resetFaultSequenceStoreForTests(): void {
  memorySequenceStore.clear();
  clearLegacyLocalFaultSequences();
}

export function mergeFaultSequencesWithBuiltIns(
  customList: readonly CustomFaultSequence[]
): CustomFaultSequence[] {
  const customOnly = customList
    .filter((s) => !s.isBuiltInPreset)
    .slice(0, MAX_SEQUENCE_COUNT);
  return [
    ...customOnly,
    ...BUILT_IN_FAULT_SEQUENCES.map((p) => ({
      ...p,
      steps: p.steps.map((s) => ({ ...s, items: [...s.items] })),
    })),
  ];
}

export function loadSavedFaultSequences(): CustomFaultSequence[] {
  return mergeFaultSequencesWithBuiltIns(readRawStoredCustomSequences());
}

export function saveCustomFaultSequence(sequence: CustomFaultSequence): {
  saved: CustomFaultSequence;
  allSequences: CustomFaultSequence[];
} {
  const now = Date.now();
  const base = sanitizeFaultSequence({
    ...sequence,
    isBuiltInPreset: false,
    id: sequence.isBuiltInPreset ? makeUid('fseq') : sequence.id || makeUid('fseq'),
    title:
      sequence.isBuiltInPreset && !sequence.title.toLowerCase().includes('custom')
        ? `${sequence.title} (Custom)`
        : sequence.title,
    createdAt: sequence.isBuiltInPreset ? now : sequence.createdAt || now,
    updatedAt: now,
  });

  if (!base) {
    throw new Error('Cannot save fault sequence: at least one stage is required.');
  }

  const existing = readRawStoredCustomSequences().filter((s) => s.id !== base.id);
  const nextCustom = [base, ...existing].slice(0, MAX_SEQUENCE_COUNT);
  writeStoredCustomSequences(nextCustom);

  return {
    saved: base,
    allSequences: loadSavedFaultSequences(),
  };
}

export function deleteCustomFaultSequence(sequenceId: string): CustomFaultSequence[] {
  const existing = readRawStoredCustomSequences();
  const next = existing.filter((s) => s.id !== sequenceId);
  writeStoredCustomSequences(next);
  return loadSavedFaultSequences();
}

export function duplicateFaultSequence(source: CustomFaultSequence): {
  cloned: CustomFaultSequence;
  allSequences: CustomFaultSequence[];
} {
  const now = Date.now();
  const cloneInput: CustomFaultSequence = {
    ...source,
    id: makeUid('fseq'),
    title: `${source.title} (Copy)`.slice(0, 100),
    isBuiltInPreset: false,
    createdAt: now,
    updatedAt: now,
    steps: source.steps.map((step) => ({
      ...step,
      id: makeUid('fstep'),
      items: step.items.map((item) => ({
        ...item,
        id: makeUid('fitem'),
      })),
    })),
  };
  const { saved, allSequences } = saveCustomFaultSequence(cloneInput);
  return { cloned: saved, allSequences };
}

export function exportFaultSequenceJson(sequence: CustomFaultSequence): string {
  const sanitized = sanitizeFaultSequence({ ...sequence, isBuiltInPreset: false });
  return JSON.stringify(sanitized ?? sequence, null, 2);
}

export function parseImportedFaultSequenceJson(rawJson: string): CustomFaultSequence {
  if (!rawJson || rawJson.length > MAX_IMPORT_JSON_BYTES) {
    throw new Error('Sequence JSON payload is empty or exceeds the 128 KB limit.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Invalid JSON format for Fault Builder sequence.');
  }

  const sanitized = sanitizeFaultSequence(parsed);
  if (!sanitized) {
    throw new Error('JSON does not contain a valid Fault Builder sequence with at least one stage.');
  }

  return {
    ...sanitized,
    id: makeUid('fseq'),
    isBuiltInPreset: false,
  };
}

export function importFaultSequenceJson(rawJson: string): {
  imported: CustomFaultSequence;
  allSequences: CustomFaultSequence[];
} {
  const candidate = parseImportedFaultSequenceJson(rawJson);
  const savedResult = saveCustomFaultSequence(candidate);

  return {
    imported: savedResult.saved,
    allSequences: savedResult.allSequences,
  };
}

const FAULT_PRECEDENCE: Record<FaultType, number> = {
  NONE: 0,
  HIGH_RESISTANCE_50R: 1,
  HIGH_RESISTANCE_250R: 2,
  HIGH_RESISTANCE_1K: 3,
  OPEN_CIRCUIT: 4,
  SHORT_TO_GND: 5,
  SHORT_TO_VBAT: 6,
};

/**
 * Deterministically evaluates the physical MNA faults, wire cuts, CKP dropouts, and interpolated
 * resistance ramps active at `elapsedMs` inside a custom multi-fault sequence.
 */
export function evaluateFaultSequenceFrame(
  sequence: CustomFaultSequence,
  elapsedMs: number,
  pins: readonly EcuPin[] = []
): FaultSequenceFrameEvaluation {
  const safeSteps = sequence.steps.length > 0 ? sequence.steps : createEmptyFaultSequence().steps;
  const totalDurationMs = safeSteps.reduce(
    (acc, step) => acc + Math.max(2000, Math.round(step.durationSec * 1000)),
    0
  );

  const safeElapsed = Math.max(0, elapsedMs);
  const completedNonLoop = !sequence.loopPlayback && safeElapsed >= totalDurationMs;
  const effectiveElapsedMs =
    totalDurationMs <= 0
      ? 0
      : sequence.loopPlayback
        ? safeElapsed % totalDurationMs
        : Math.min(safeElapsed, totalDurationMs - 1);

  let cursorMs = 0;
  let activeStepIndex = 0;
  let stepElapsedMs = 0;
  let stepDurationMs = Math.max(2000, Math.round(safeSteps[0].durationSec * 1000));

  for (let i = 0; i < safeSteps.length; i++) {
    const dur = Math.max(2000, Math.round(safeSteps[i].durationSec * 1000));
    if (effectiveElapsedMs < cursorMs + dur || i === safeSteps.length - 1) {
      activeStepIndex = i;
      stepDurationMs = dur;
      stepElapsedMs = completedNonLoop ? dur : Math.max(0, effectiveElapsedMs - cursorMs);
      break;
    }
    cursorMs += dur;
  }

  const activeStep = safeSteps[activeStepIndex];
  const stepProgressRatio = Math.min(1, Math.max(0, stepElapsedMs / Math.max(1, stepDurationMs)));
  const pinLabelById = new Map(pins.map((p) => [p.id, `${p.label} (#${p.pinNumber})`]));

  const faultByPin = new Map<string, InjectedFault>();
  const cutWireSet = new Set<string>();
  let ckpSignalLost = false;
  let intermittentEngaged = false;
  const activeSummaryItems: EvaluatedFaultSummaryItem[] = [];

  const mergePinFault = (
    pinId: string,
    faultType: FaultType,
    description: string,
    customSeriesOhms?: number
  ) => {
    if (faultType === 'NONE') return;
    const prev = faultByPin.get(pinId);
    if (!prev) {
      faultByPin.set(pinId, {
        pinId,
        faultType,
        description,
        timestamp: 0,
        ...(customSeriesOhms !== undefined ? { customSeriesOhms } : {}),
      });
      return;
    }

    // Sum series resistances when stacking multiple resistance faults on the same pin
    if (
      prev.customSeriesOhms !== undefined &&
      customSeriesOhms !== undefined &&
      FAULT_PRECEDENCE[faultType] <= 3 &&
      FAULT_PRECEDENCE[prev.faultType] <= 3
    ) {
      const summed = Number((prev.customSeriesOhms + customSeriesOhms).toFixed(1));
      faultByPin.set(pinId, {
        pinId,
        faultType: mapOhmsToStandardFaultType(summed),
        description: `${prev.description} + ${description}`.slice(0, 240),
        timestamp: 0,
        customSeriesOhms: summed,
      });
      return;
    }

    if (FAULT_PRECEDENCE[faultType] >= FAULT_PRECEDENCE[prev.faultType]) {
      faultByPin.set(pinId, {
        pinId,
        faultType,
        description,
        timestamp: 0,
        ...(customSeriesOhms !== undefined ? { customSeriesOhms } : {}),
      });
    }
  };

  for (const item of activeStep.items) {
    const pinLabel = pinLabelById.get(item.pinId) ?? item.pinId;

    switch (item.mode) {
      case 'HARD_GROUND': {
        mergePinFault(item.pinId, 'SHORT_TO_GND', item.label || 'Hard Short to GND');
        activeSummaryItems.push({
          itemId: item.id,
          label: item.label,
          pinId: item.pinId,
          pinLabel,
          mode: item.mode,
          engaged: true,
        });
        break;
      }

      case 'SHORT_TO_VBAT': {
        mergePinFault(item.pinId, 'SHORT_TO_VBAT', item.label || 'Short to +12V VBAT');
        activeSummaryItems.push({
          itemId: item.id,
          label: item.label,
          pinId: item.pinId,
          pinLabel,
          mode: item.mode,
          engaged: true,
        });
        break;
      }

      case 'OPEN_CIRCUIT': {
        mergePinFault(item.pinId, 'OPEN_CIRCUIT', item.label || 'Open Circuit Break');
        activeSummaryItems.push({
          itemId: item.id,
          label: item.label,
          pinId: item.pinId,
          pinLabel,
          mode: item.mode,
          engaged: true,
        });
        break;
      }

      case 'RESISTANCE_BUILDUP': {
        const startR = clampNumber(item.startOhms, 50, 0.5, 100_000);
        const endR = clampNumber(item.endOhms ?? startR, startR, 0.5, 100_000);
        const currentR = Number((startR + (endR - startR) * stepProgressRatio).toFixed(1));
        mergePinFault(
          item.pinId,
          mapOhmsToStandardFaultType(currentR),
          `${item.label} (+${currentR}Ω)`.slice(0, 240),
          currentR
        );
        activeSummaryItems.push({
          itemId: item.id,
          label: item.label,
          pinId: item.pinId,
          pinLabel,
          mode: item.mode,
          engaged: true,
          effectiveOhms: currentR,
        });
        break;
      }

      case 'INTERMITTENT_SIGNAL': {
        const onMs = clampNumber(item.onDurationMs, 700, MIN_PULSE_WIDTH_MS, 30_000);
        const offMs = clampNumber(item.offDurationMs, 900, MIN_PULSE_WIDTH_MS, 30_000);
        const cycleMs = onMs + offMs;
        const engaged = (stepElapsedMs % cycleMs) < onMs;
        if (engaged) {
          intermittentEngaged = true;
          const effect = item.intermittentEffect ?? 'OPEN_DROPOUT';
          if (effect === 'SHORT_TO_GND') {
            mergePinFault(item.pinId, 'SHORT_TO_GND', `${item.label} (Intermittent Short)`);
          } else if (effect === 'HIGH_RESISTANCE') {
            const ohms = clampNumber(item.startOhms, 250, 0.5, 100_000);
            mergePinFault(
              item.pinId,
              mapOhmsToStandardFaultType(ohms),
              `${item.label} (Intermittent +${ohms}Ω)`,
              ohms
            );
          } else {
            mergePinFault(item.pinId, 'OPEN_CIRCUIT', `${item.label} (Intermittent Dropout)`);
          }
        }
        activeSummaryItems.push({
          itemId: item.id,
          label: item.label,
          pinId: item.pinId,
          pinLabel,
          mode: item.mode,
          engaged,
        });
        break;
      }

      case 'CUT_WIRE': {
        if (item.wireId) {
          cutWireSet.add(item.wireId);
        }
        activeSummaryItems.push({
          itemId: item.id,
          label: item.label,
          pinId: item.pinId,
          pinLabel: item.wireId || pinLabel,
          mode: item.mode,
          engaged: true,
        });
        break;
      }

      case 'CKP_DROPOUT': {
        const onMs = clampNumber(item.onDurationMs, 0, 0, 30_000);
        const offMs = clampNumber(item.offDurationMs, 0, 0, 30_000);
        const engaged = onMs > 0 && offMs > 0 ? (stepElapsedMs % (onMs + offMs)) < onMs : true;
        if (engaged) ckpSignalLost = true;
        activeSummaryItems.push({
          itemId: item.id,
          label: item.label,
          pinId: item.pinId,
          pinLabel: 'CKP Crank VR',
          mode: item.mode,
          engaged,
        });
        break;
      }
    }
  }

  return {
    sequenceId: sequence.id,
    totalDurationMs,
    clampedElapsedMs: effectiveElapsedMs,
    activeStepIndex,
    activeStep,
    stepElapsedMs,
    stepDurationMs,
    stepProgressRatio,
    completedNonLoop,
    injectedFaults: Array.from(faultByPin.values()),
    cutWireIds: Array.from(cutWireSet),
    ckpSignalLost,
    intermittentEngaged,
    activeSummaryItems,
  };
}

/**
 * Computes the exact sequence-time delta (in ms) until the next fault edge transition
 * (stage rollover, sub-150ms intermittent ON/OFF edge, CKP pulse toggle, or resistance ramp tick).
 * Returns null if playback is non-looping and already completed.
 */
export function computeNextFaultSequenceEdgeMs(
  sequence: CustomFaultSequence,
  elapsedMs: number,
  rampIntervalMs = 50
): number | null {
  const safeSteps = sequence.steps.length > 0 ? sequence.steps : createEmptyFaultSequence().steps;
  const totalDurationMs = safeSteps.reduce(
    (acc, step) => acc + Math.max(2000, Math.round(step.durationSec * 1000)),
    0
  );
  if (totalDurationMs <= 0) return null;

  const safeElapsed = Math.max(0, elapsedMs);
  if (!sequence.loopPlayback && safeElapsed >= totalDurationMs) {
    return null;
  }

  const effectiveElapsedMs = sequence.loopPlayback
    ? safeElapsed % totalDurationMs
    : Math.min(safeElapsed, totalDurationMs - 1);

  let cursorMs = 0;
  let activeStep = safeSteps[0];
  let stepElapsedMs = 0;
  let stepDurationMs = Math.max(2000, Math.round(safeSteps[0].durationSec * 1000));

  for (let i = 0; i < safeSteps.length; i++) {
    const dur = Math.max(2000, Math.round(safeSteps[i].durationSec * 1000));
    if (effectiveElapsedMs < cursorMs + dur || i === safeSteps.length - 1) {
      activeStep = safeSteps[i];
      stepDurationMs = dur;
      stepElapsedMs = Math.max(0, effectiveElapsedMs - cursorMs);
      break;
    }
    cursorMs += dur;
  }

  let minDeltaMs = Math.max(1, stepDurationMs - stepElapsedMs);

  for (const item of activeStep.items) {
    if (item.mode === 'INTERMITTENT_SIGNAL') {
      const onMs = clampNumber(item.onDurationMs, 700, MIN_PULSE_WIDTH_MS, 30_000);
      const offMs = clampNumber(item.offDurationMs, 900, MIN_PULSE_WIDTH_MS, 30_000);
      const cycleMs = onMs + offMs;
      const posInCycle = stepElapsedMs % cycleMs;
      const edgeDelta = posInCycle < onMs ? onMs - posInCycle : cycleMs - posInCycle;
      if (edgeDelta > 0 && edgeDelta < minDeltaMs) {
        minDeltaMs = edgeDelta;
      }
    } else if (item.mode === 'CKP_DROPOUT') {
      const onMs = clampNumber(item.onDurationMs, 0, 0, 30_000);
      const offMs = clampNumber(item.offDurationMs, 0, 0, 30_000);
      if (onMs >= MIN_PULSE_WIDTH_MS && offMs >= MIN_PULSE_WIDTH_MS) {
        const cycleMs = onMs + offMs;
        const posInCycle = stepElapsedMs % cycleMs;
        const edgeDelta = posInCycle < onMs ? onMs - posInCycle : cycleMs - posInCycle;
        if (edgeDelta > 0 && edgeDelta < minDeltaMs) {
          minDeltaMs = edgeDelta;
        }
      }
    } else if (item.mode === 'RESISTANCE_BUILDUP') {
      const startR = clampNumber(item.startOhms, 50, 0.5, 100_000);
      const endR = clampNumber(item.endOhms ?? startR, startR, 0.5, 100_000);
      if (Math.abs(endR - startR) > 0.05) {
        const clampedRamp = Math.max(15, Math.min(rampIntervalMs, minDeltaMs));
        minDeltaMs = Math.min(minDeltaMs, clampedRamp);
      }
    }
  }

  return Math.max(4, Math.ceil(minDeltaMs));
}

function mapModeToReasoningCategory(mode: CustomFaultMode): ReasoningFaultCategory {
  switch (mode) {
    case 'INTERMITTENT_SIGNAL':
      return 'INTERMITTENT';
    case 'RESISTANCE_BUILDUP':
      return 'RESISTANCE_BUILDUP';
    case 'HARD_GROUND':
      return 'HARD_GROUND';
    case 'SHORT_TO_VBAT':
      return 'SHORT_TO_VBAT';
    case 'OPEN_CIRCUIT':
    case 'CUT_WIRE':
      return 'OPEN_CIRCUIT';
    case 'CKP_DROPOUT':
      return 'CKP_DROPOUT';
  }
}

export function evaluateDiagnosticReasoning(
  sequence: CustomFaultSequence,
  guessPinId: string,
  guessCategory: ReasoningFaultCategory,
  pins: readonly EcuPin[] = []
): ReasoningCheckResult {
  const allItems = sequence.steps.flatMap((s) => s.items);
  const expectedPinSet = new Set(allItems.map((item) => item.pinId));
  const expectedCategorySet = new Set(allItems.map((item) => mapModeToReasoningCategory(item.mode)));
  if (expectedPinSet.size > 1 || expectedCategorySet.size > 1) {
    expectedCategorySet.add('MULTI_FAULT');
  }

  const pinLabelById = new Map(pins.map((p) => [p.id, `${p.label} (Pin #${p.pinNumber})`]));
  const expectedPinLabels = Array.from(expectedPinSet).map((id) => pinLabelById.get(id) ?? id);
  const expectedCategories = Array.from(expectedCategorySet);

  const pinMatched = expectedPinSet.has(guessPinId);
  const mechanismMatched = expectedCategorySet.has(guessCategory);
  const overallCorrect = pinMatched && mechanismMatched;

  let feedbackTitle = 'Partial Reasoning — Keep Probing';
  if (overallCorrect) {
    feedbackTitle = 'Diagnosis Confirmed Against Sequence Physics';
  } else if (!pinMatched && !mechanismMatched) {
    feedbackTitle = 'Mismatch — Re-Check Pin Voltages & Waveforms';
  }

  const pinSummary = expectedPinLabels.join(', ') || 'None';
  const mechSummary = expectedCategories.join(', ') || 'None';

  const feedbackDetail = overallCorrect
    ? `Confirmed: ${pinLabelById.get(guessPinId) ?? guessPinId} exhibits ${guessCategory.replace(/_/g, ' ')} in this sequence (${sequence.steps.length} stage${sequence.steps.length === 1 ? '' : 's'}).`
    : `Sequence evidence involves pin(s): ${pinSummary} with mechanism(s): ${mechSummary}. Compare quiescent DC voltage, voltage drop under load, and oscilloscope time-domain stability.`;

  return {
    pinMatched,
    mechanismMatched,
    overallCorrect,
    expectedPinLabels,
    expectedCategories,
    feedbackTitle,
    feedbackDetail,
  };
}
