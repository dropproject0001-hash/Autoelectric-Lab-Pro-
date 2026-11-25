/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type {
  EcuPin,
  FaultType,
  InjectedFault,
  MultimeterMode,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import type { RpmEmulatorState } from '../utils/vehicleEcuRegistry';
import { PSU_PRESET_METADATA, type PsuPresetOption } from './voiceMacroService';

export interface BenchRecorderSnapshot {
  powerSupply: PowerSupplyState;
  multimeter: MultimeterState;
  manualRangeLabel?: string | null;
  faults: InjectedFault[];
  wires: WireConnection[];
  rpmEmulator: RpmEmulatorState;
}

const MAX_MACRO_STEPS = 20;

const DMM_MODE_TO_INSTRUCTION: Record<MultimeterMode, string> = {
  V_DC: 'Set multimeter to DC volts',
  V_AC: 'Set multimeter to AC volts',
  RESISTANCE: 'Set multimeter to resistance',
  CONTINUITY: 'Set multimeter to continuity',
  FREQUENCY: 'Set multimeter to frequency',
  DIODE: 'Set multimeter to diode',
};

function terminalIdToVoiceLabel(
  pinId: string | null | undefined,
  pins: EcuPin[],
  forFault: boolean = false
): string {
  if (!pinId) return 'pin 7';
  if (pinId === 'chassis-gnd') return 'ground';
  if (pinId === 'bench-vbat') return '+12V VBat';

  const ecuPin = pins.find((p) => p.id === pinId);
  if (ecuPin) {
    return `pin ${ecuPin.pinNumber}`;
  }

  const ecuMatch = pinId.match(/^ecu-pin-(\d+)$/i);
  if (ecuMatch) {
    return `pin ${ecuMatch[1]}`;
  }

  if (!forFault) {
    const compMap: Record<string, string> = {
      'tps-vcc': 'TPS VCC',
      'tps-gnd': 'TPS GND',
      'tps-sig': 'TPS signal',
      'map-vcc': 'MAP VCC',
      'map-gnd': 'MAP GND',
      'map-sig': 'MAP signal',
      'ect-gnd': 'ECT GND',
      'ect-sig': 'ECT signal',
      'inj-vbat': 'injector 12V',
      'inj-ctrl': 'injector control',
      'can-term-h': 'CAN-H',
      'can-term-l': 'CAN-L',
      'relay-30': 'relay pin 30',
      'relay-87': 'relay pin 87',
      'relay-86': 'relay pin 86',
      'relay-85': 'relay pin 85',
    };
    if (compMap[pinId]) return compMap[pinId];
  }

  return pinId;
}

function faultTypeToPhrase(faultType: FaultType): string {
  switch (faultType) {
    case 'SHORT_TO_GND':
      return 'short to ground';
    case 'SHORT_TO_VBAT':
      return 'short to 12v';
    case 'HIGH_RESISTANCE_50R':
    case 'HIGH_RESISTANCE_250R':
    case 'HIGH_RESISTANCE_1K':
      return 'high resistance';
    case 'OPEN_CIRCUIT':
    case 'NONE':
    default:
      return 'open circuit';
  }
}

function choosePrimaryWirePin(wire: WireConnection): string {
  if (wire.sourcePinId.startsWith('ecu-pin-')) return wire.sourcePinId;
  if (wire.targetPinId.startsWith('ecu-pin-')) return wire.targetPinId;
  return wire.sourcePinId;
}

function wireSignature(w: WireConnection): string {
  const pair = [w.sourcePinId, w.targetPinId].sort();
  return `${pair[0]}::${pair[1]}`;
}

/**
 * Computes deterministic, voice-executable macro instructions corresponding to every
 * meaningful live bench state change between two snapshots.
 */
export function diffBenchSnapshotsToInstructions(
  prev: BenchRecorderSnapshot,
  next: BenchRecorderSnapshot,
  pins: EcuPin[]
): string[] {
  const instructions: string[] = [];

  // 1. Power Supply diffs
  const prevPsu = prev.powerSupply;
  const nextPsu = next.powerSupply;
  const presetChanged = prevPsu.preset !== nextPsu.preset;

  if (
    presetChanged &&
    nextPsu.preset &&
    nextPsu.preset !== 'CUSTOM' &&
    nextPsu.preset in PSU_PRESET_METADATA
  ) {
    const presetKey = nextPsu.preset as PsuPresetOption;
    instructions.push(PSU_PRESET_METADATA[presetKey].instruction);
  } else {
    if (Math.abs(prevPsu.voltageSetting - nextPsu.voltageSetting) >= 0.05) {
      instructions.push(`Set power supply voltage to ${nextPsu.voltageSetting.toFixed(1)}V`);
    }
    if (Math.abs(prevPsu.currentLimit - nextPsu.currentLimit) >= 0.05) {
      instructions.push(`Set current limit to ${nextPsu.currentLimit.toFixed(1)}A`);
    }
  }

  if (prevPsu.isOutputEnabled !== nextPsu.isOutputEnabled) {
    instructions.push(nextPsu.isOutputEnabled ? 'Turn power supply on' : 'Turn power supply off');
  }

  // 2. Digital Multimeter diffs
  const prevDmm = prev.multimeter;
  const nextDmm = next.multimeter;

  if (prevDmm.isPowered !== nextDmm.isPowered) {
    instructions.push(nextDmm.isPowered ? 'Turn multimeter on' : 'Turn multimeter off');
  }

  const modeChanged = prevDmm.mode !== nextDmm.mode;
  const rangeAutoChanged = prevDmm.rangeAuto !== nextDmm.rangeAuto;
  const manualRangeChanged = (prev.manualRangeLabel ?? null) !== (next.manualRangeLabel ?? null);

  if (nextDmm.isPowered && (modeChanged || rangeAutoChanged || manualRangeChanged)) {
    if (!nextDmm.rangeAuto && next.manualRangeLabel?.trim()) {
      instructions.push(`Set multimeter to ${next.manualRangeLabel.trim()}`);
    } else if (rangeAutoChanged && nextDmm.rangeAuto && !modeChanged) {
      instructions.push('Set multimeter to auto-range');
    } else {
      instructions.push(DMM_MODE_TO_INSTRUCTION[nextDmm.mode] || 'Set multimeter to DC volts');
    }
  }

  const prevRed = prevDmm.redProbe.attachedToPinId;
  const nextRed = nextDmm.redProbe.attachedToPinId;
  const prevBlack = prevDmm.blackProbe.attachedToPinId;
  const nextBlack = nextDmm.blackProbe.attachedToPinId;

  if (nextRed === null && nextBlack === null && (prevRed !== null || prevBlack !== null)) {
    instructions.push('Disconnect probes');
  } else {
    if (prevRed !== nextRed && nextRed) {
      instructions.push(`Attach red probe to ${terminalIdToVoiceLabel(nextRed, pins)}`);
    }
    if (prevBlack !== nextBlack && nextBlack) {
      instructions.push(`Attach black probe to ${terminalIdToVoiceLabel(nextBlack, pins)}`);
    }
  }

  if (prevDmm.holdValue !== nextDmm.holdValue) {
    instructions.push(nextDmm.holdValue ? 'Hold multimeter reading' : 'Release multimeter hold');
  }

  // 3. Fault Injection Matrix diffs
  const prevFaultMap = new Map<string, InjectedFault>(prev.faults.map((f) => [f.pinId, f]));
  const nextFaultMap = new Map<string, InjectedFault>(next.faults.map((f) => [f.pinId, f]));

  if (prev.faults.length > 0 && next.faults.length === 0) {
    if (prev.faults.length === 1) {
      const target = terminalIdToVoiceLabel(prev.faults[0].pinId, pins, true);
      instructions.push(`Remove fault on ${target}`);
    } else {
      instructions.push('Clear faults');
    }
  } else {
    for (const [pinId] of prevFaultMap) {
      if (!nextFaultMap.has(pinId)) {
        const target = terminalIdToVoiceLabel(pinId, pins, true);
        instructions.push(`Remove fault on ${target}`);
      }
    }
    for (const [pinId, nextFault] of nextFaultMap) {
      const prevFault = prevFaultMap.get(pinId);
      if (!prevFault || prevFault.faultType !== nextFault.faultType) {
        if (nextFault.faultType === 'NONE') {
          const target = terminalIdToVoiceLabel(pinId, pins, true);
          instructions.push(`Remove fault on ${target}`);
        } else {
          const target = terminalIdToVoiceLabel(pinId, pins, true);
          instructions.push(`Inject ${faultTypeToPhrase(nextFault.faultType)} on ${target}`);
        }
      }
    }
  }

  // 4. Crank/Cam RPM Emulator diffs
  const prevRpm = prev.rpmEmulator;
  const nextRpm = next.rpmEmulator;

  if (!prevRpm.isActive && nextRpm.isActive) {
    const rounded = Math.max(100, Math.min(7500, Math.round(nextRpm.rpm)));
    instructions.push(`Set engine RPM to ${rounded}`);
  } else if (prevRpm.isActive && !nextRpm.isActive) {
    instructions.push('Turn RPM emulator off');
  } else if (nextRpm.isActive && Math.round(prevRpm.rpm) !== Math.round(nextRpm.rpm)) {
    const rounded = Math.max(100, Math.min(7500, Math.round(nextRpm.rpm)));
    instructions.push(`Set engine RPM to ${rounded}`);
  }

  // 5. Harness Wire diffs
  const prevWireById = new Map(prev.wires.map((w) => [w.id, w]));
  const nextWireById = new Map(next.wires.map((w) => [w.id, w]));
  const prevWireSigs = new Set(prev.wires.map(wireSignature));
  const nextWireSigs = new Set(next.wires.map(wireSignature));

  for (const nextWire of next.wires) {
    const prevMatch = prevWireById.get(nextWire.id);
    if (!prevMatch) {
      if (!prevWireSigs.has(wireSignature(nextWire))) {
        const src = terminalIdToVoiceLabel(nextWire.sourcePinId, pins);
        const dst = terminalIdToVoiceLabel(nextWire.targetPinId, pins);
        instructions.push(`Connect ${src} to ${dst}`);
      }
    } else if (prevMatch.isCut !== nextWire.isCut) {
      const primaryPin = terminalIdToVoiceLabel(choosePrimaryWirePin(nextWire), pins);
      instructions.push(
        nextWire.isCut ? `Cut wire on ${primaryPin}` : `Reconnect wire on ${primaryPin}`
      );
    }
  }

  for (const prevWire of prev.wires) {
    if (!nextWireById.has(prevWire.id) && !nextWireSigs.has(wireSignature(prevWire))) {
      const primaryPin = terminalIdToVoiceLabel(choosePrimaryWirePin(prevWire), pins);
      instructions.push(`Disconnect ${primaryPin}`);
    }
  }

  return instructions;
}

const SLIDER_REPLACEABLE_PREFIXES = [
  'Set power supply voltage to ',
  'Set current limit to ',
  'Set engine RPM to ',
] as const;

/**
 * Appends newly recorded steps while coalescing consecutive continuous-slider updates
 * (voltage knob, current limit, RPM slider) when they immediately follow each other.
 */
export function appendRecordedSteps(
  existingSteps: string[],
  incomingSteps: string[],
  lastStepTimestampMs: number | null,
  nowMs: number = Date.now()
): { steps: string[]; changed: boolean } {
  if (incomingSteps.length === 0) {
    return { steps: existingSteps, changed: false };
  }

  const next = [...existingSteps];
  const withinDebounceWindow =
    typeof lastStepTimestampMs === 'number' && nowMs - lastStepTimestampMs < 1500;

  for (const rawStep of incomingSteps) {
    const step = rawStep.trim();
    if (!step) continue;

    const lastStep = next[next.length - 1];
    if (lastStep === step) continue;

    if (withinDebounceWindow && lastStep) {
      const matchingPrefix = SLIDER_REPLACEABLE_PREFIXES.find(
        (prefix) => step.startsWith(prefix) && lastStep.startsWith(prefix)
      );
      if (matchingPrefix) {
        next[next.length - 1] = step;
        continue;
      }
    }

    if (next.length < MAX_MACRO_STEPS) {
      next.push(step);
    }
  }

  return { steps: next, changed: true };
}
