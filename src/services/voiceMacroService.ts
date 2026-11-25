/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { MultimeterMode, MultimeterState, PowerSupplyState } from '../types/ecu';
import { normalizeVoiceTranscript } from '../utils/voiceCommandParser';

export interface VoiceMacro {
  id: string;
  name: string;
  triggerPhrase: string;
  steps: string[];
  description?: string;
  isPreset?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type VoiceMacroListener = (macros: VoiceMacro[]) => void;

export const VOICE_MACROS_STORAGE_KEY = 'autoelectric_voice_macros_v1';
export const VOICE_MACROS_PRESET_VERSION_KEY = 'autoelectric_voice_macros_preset_v';
const CURRENT_PRESET_VERSION = 2;

export type PsuPresetOption = '12V_BENCH' | '14.4V_RUNNING' | '10.2V_CRANKING' | '5V_LOGIC';

export type PowerSupplyStepSpec =
  | {
      target: 'POWER_SUPPLY';
      action: 'SET_OUTPUT';
      outputEnabled: boolean;
    }
  | {
      target: 'POWER_SUPPLY';
      action: 'SET_VOLTAGE';
      volts: number;
    }
  | {
      target: 'POWER_SUPPLY';
      action: 'SET_CURRENT_LIMIT';
      amps: number;
    }
  | {
      target: 'POWER_SUPPLY';
      action: 'APPLY_PRESET';
      preset: PsuPresetOption;
    }
  | {
      target: 'POWER_SUPPLY';
      action: 'RAIL_SHORTHAND';
      shorthand: 'Connect Power' | 'Engage Ignition' | 'Disengage Ignition' | 'Connect Ground';
    };

export type MultimeterStepSpec =
  | {
      target: 'MULTIMETER';
      action: 'SET_POWER';
      isPowered: boolean;
    }
  | {
      target: 'MULTIMETER';
      action: 'SET_MODE_RANGE';
      mode: MultimeterMode;
      manualRangeLabel?: string | null;
    }
  | {
      target: 'MULTIMETER';
      action: 'ATTACH_RED_PROBE';
      terminalTarget: string;
    }
  | {
      target: 'MULTIMETER';
      action: 'ATTACH_BLACK_PROBE';
      terminalTarget: string;
    }
  | {
      target: 'MULTIMETER';
      action: 'SET_HOLD';
      holdValue: boolean;
    }
  | {
      target: 'MULTIMETER';
      action: 'PROBE_UTILITY';
      utility: 'SWAP_PROBES' | 'DISCONNECT_PROBES' | 'AUTO_RANGE';
    };

export type InstrumentStateStepSpec = PowerSupplyStepSpec | MultimeterStepSpec;

export const DMM_MANUAL_RANGE_OPTIONS: Readonly<Record<MultimeterMode, ReadonlyArray<{ label: string; value: string }>>> = {
  V_DC: [
    { label: 'Auto-Range (V DC)', value: 'AUTO' },
    { label: '200mV DC Manual', value: '200mV DC' },
    { label: '20V DC Manual', value: '20V DC' },
    { label: '200V DC Manual', value: '200V DC' },
  ],
  V_AC: [
    { label: 'Auto-Range (V AC)', value: 'AUTO' },
    { label: '20V AC Manual', value: '20V AC' },
    { label: '200V AC Manual', value: '200V AC' },
  ],
  RESISTANCE: [
    { label: 'Auto-Range (Ω)', value: 'AUTO' },
    { label: '200Ω Manual', value: '200 ohms' },
    { label: '2kΩ Manual', value: '2k ohms' },
    { label: '20kΩ Manual', value: '20k ohms' },
  ],
  CONTINUITY: [
    { label: 'Continuity Beep (<30Ω)', value: 'AUTO' },
  ],
  FREQUENCY: [
    { label: 'Auto-Range (Hz / %)', value: 'AUTO' },
    { label: '200Hz Manual', value: '200Hz' },
    { label: '20kHz Manual', value: '20kHz' },
  ],
  DIODE: [
    { label: 'Junction Drop (1mA / 3.0V)', value: 'AUTO' },
  ],
};

export const PSU_PRESET_METADATA: Readonly<
  Record<PsuPresetOption, { label: string; volts: number; amps: number; instruction: string }>
> = {
  '12V_BENCH': {
    label: '12.6V Nominal Battery (4.0A)',
    volts: 12.6,
    amps: 4.0,
    instruction: 'Set PSU preset to 12.6V battery',
  },
  '14.4V_RUNNING': {
    label: '14.4V Alternator Charging (5.0A)',
    volts: 14.4,
    amps: 5.0,
    instruction: 'Set PSU preset to 14.4V charging',
  },
  '10.2V_CRANKING': {
    label: '10.2V Cranking Sag (8.0A)',
    volts: 10.2,
    amps: 8.0,
    instruction: 'Set PSU preset to 10.2V cranking',
  },
  '5V_LOGIC': {
    label: '5.0V Sensor Reference Logic (2.0A)',
    volts: 5.0,
    amps: 2.0,
    instruction: 'Set PSU preset to 5V logic',
  },
};

export function compileInstrumentStepToInstruction(spec: InstrumentStateStepSpec): string {
  if (spec.target === 'POWER_SUPPLY') {
    switch (spec.action) {
      case 'SET_OUTPUT':
        return spec.outputEnabled ? 'Turn power supply on' : 'Turn power supply off';
      case 'SET_VOLTAGE': {
        const clamped = Math.max(0, Math.min(28.0, Number(spec.volts) || 0));
        return `Set power supply voltage to ${clamped.toFixed(1)}V`;
      }
      case 'SET_CURRENT_LIMIT': {
        const clamped = Math.max(0.2, Math.min(10.0, Number(spec.amps) || 0.2));
        return `Set current limit to ${clamped.toFixed(1)}A`;
      }
      case 'APPLY_PRESET':
        return PSU_PRESET_METADATA[spec.preset]?.instruction || 'Set PSU preset to 12.6V battery';
      case 'RAIL_SHORTHAND':
        return spec.shorthand;
    }
  }

  switch (spec.action) {
    case 'SET_POWER':
      return spec.isPowered ? 'Turn multimeter on' : 'Turn multimeter off';
    case 'SET_MODE_RANGE': {
      const rangeRaw = spec.manualRangeLabel?.trim();
      if (rangeRaw && rangeRaw.toUpperCase() !== 'AUTO') {
        return `Set multimeter to ${rangeRaw}`;
      }
      switch (spec.mode) {
        case 'V_DC':
          return 'Set multimeter to DC volts';
        case 'V_AC':
          return 'Set multimeter to AC volts';
        case 'RESISTANCE':
          return 'Set multimeter to resistance';
        case 'CONTINUITY':
          return 'Set multimeter to continuity';
        case 'FREQUENCY':
          return 'Set multimeter to frequency';
        case 'DIODE':
          return 'Set multimeter to diode';
      }
      break;
    }
    case 'ATTACH_RED_PROBE': {
      const cleanTarget = spec.terminalTarget.trim() || 'Pin 7';
      return `Attach red probe to ${cleanTarget}`;
    }
    case 'ATTACH_BLACK_PROBE': {
      const cleanTarget = spec.terminalTarget.trim() || 'ground';
      return `Attach black probe to ${cleanTarget}`;
    }
    case 'SET_HOLD':
      return spec.holdValue ? 'Hold multimeter reading' : 'Release multimeter hold';
    case 'PROBE_UTILITY':
      if (spec.utility === 'SWAP_PROBES') return 'Swap probes';
      if (spec.utility === 'DISCONNECT_PROBES') return 'Disconnect probes';
      return 'Set multimeter to auto-range';
  }
  return '';
}

export function compileInstrumentSequenceToSteps(specs: InstrumentStateStepSpec[]): string[] {
  return specs.map(compileInstrumentStepToInstruction).map((s) => s.trim()).filter(Boolean);
}

function pinIdToVoiceTerminalTarget(pinId: string | null | undefined): string | null {
  if (!pinId) return null;
  if (pinId === 'chassis-gnd') return 'ground';
  if (pinId === 'bench-vbat') return '+12V VBat';
  const ecuMatch = pinId.match(/^ecu-pin-(\d+)$/i);
  if (ecuMatch) {
    return `pin ${ecuMatch[1]}`;
  }
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
  return compMap[pinId] || null;
}

/**
 * Captures the current live Bench Power Supply and Digital Multimeter state into
 * an ordered sequence of deterministic voice macro instructions.
 */
export function captureBenchInstrumentSequence(params: {
  powerSupply: PowerSupplyState;
  multimeter: MultimeterState;
  manualRangeLabel?: string | null;
  includePowerSupply?: boolean;
  includeMultimeter?: boolean;
  includeProbes?: boolean;
}): string[] {
  const {
    powerSupply,
    multimeter,
    manualRangeLabel = null,
    includePowerSupply = true,
    includeMultimeter = true,
    includeProbes = true,
  } = params;

  const specs: InstrumentStateStepSpec[] = [];

  if (includePowerSupply) {
    if (
      powerSupply.preset &&
      powerSupply.preset !== 'CUSTOM' &&
      powerSupply.preset in PSU_PRESET_METADATA
    ) {
      const presetKey = powerSupply.preset as PsuPresetOption;
      const presetMeta = PSU_PRESET_METADATA[presetKey];
      specs.push({
        target: 'POWER_SUPPLY',
        action: 'APPLY_PRESET',
        preset: presetKey,
      });
      if (Math.abs(powerSupply.currentLimit - presetMeta.amps) > 0.05) {
        specs.push({
          target: 'POWER_SUPPLY',
          action: 'SET_CURRENT_LIMIT',
          amps: powerSupply.currentLimit,
        });
      }
    } else {
      specs.push({
        target: 'POWER_SUPPLY',
        action: 'SET_VOLTAGE',
        volts: powerSupply.voltageSetting,
      });
      specs.push({
        target: 'POWER_SUPPLY',
        action: 'SET_CURRENT_LIMIT',
        amps: powerSupply.currentLimit,
      });
    }
    specs.push({
      target: 'POWER_SUPPLY',
      action: 'SET_OUTPUT',
      outputEnabled: powerSupply.isOutputEnabled,
    });
  }

  if (includeMultimeter) {
    if (!multimeter.isPowered) {
      specs.push({
        target: 'MULTIMETER',
        action: 'SET_POWER',
        isPowered: false,
      });
    } else {
      specs.push({
        target: 'MULTIMETER',
        action: 'SET_MODE_RANGE',
        mode: multimeter.mode,
        manualRangeLabel: !multimeter.rangeAuto ? manualRangeLabel : null,
      });
    }
  }

  if (includeProbes && multimeter.isPowered) {
    const redTarget = pinIdToVoiceTerminalTarget(multimeter.redProbe.attachedToPinId);
    const blackTarget = pinIdToVoiceTerminalTarget(multimeter.blackProbe.attachedToPinId);

    if (!redTarget && !blackTarget) {
      specs.push({
        target: 'MULTIMETER',
        action: 'PROBE_UTILITY',
        utility: 'DISCONNECT_PROBES',
      });
    } else {
      if (redTarget) {
        specs.push({
          target: 'MULTIMETER',
          action: 'ATTACH_RED_PROBE',
          terminalTarget: redTarget,
        });
      }
      if (blackTarget) {
        specs.push({
          target: 'MULTIMETER',
          action: 'ATTACH_BLACK_PROBE',
          terminalTarget: blackTarget,
        });
      }
    }

    if (multimeter.holdValue) {
      specs.push({
        target: 'MULTIMETER',
        action: 'SET_HOLD',
        holdValue: true,
      });
    }
  }

  return compileInstrumentSequenceToSteps(specs);
}

export function classifyMacroStepInstrument(stepInstruction: string): {
  instrument: 'POWER_SUPPLY' | 'MULTIMETER' | 'PROBES' | 'HARNESS' | 'FAULT' | 'RPM' | 'DIAGNOSTIC';
  badgeLabel: string;
} {
  const lower = stepInstruction.trim().toLowerCase();
  if (
    /\b(?:fault|dtc|short\s+to|open\s+circuit|high\s+resistance|corrosion|inject\s+(?:a\s+)?(?:short|open|high)|toggle\s+(?:open|short|high|fault)|clear\s+faults?|remove\s+(?:the\s+)?.*fault)\b/i.test(
      lower
    )
  ) {
    return { instrument: 'FAULT', badgeLabel: 'FAULT SIM' };
  }
  if (/\b(?:rpm|crank|engine\s+speed)\b/i.test(lower)) {
    return { instrument: 'RPM', badgeLabel: 'RPM EMU' };
  }
  if (/\b(?:probe|swap\s+probes?|disconnect\s+probes?)\b/i.test(lower)) {
    return { instrument: 'PROBES', badgeLabel: 'DMM PROBE' };
  }
  if (
    /\b(?:multimeter|meter|auto[\s-]*range|hold\s+(?:reading|multimeter)|release\s+(?:multimeter\s+)?hold|continuity|diode|resistance|ohms?)\b/i.test(
      lower
    )
  ) {
    return { instrument: 'MULTIMETER', badgeLabel: 'DMM STATE' };
  }
  if (
    /\b(?:power\s+supply|psu|current\s+limit|set\s+\d+(?:\.\d+)?\s*v|voltage\s+to|turn\s+power|connect\s+power|engage\s+ignition|disengage\s+ignition)\b/i.test(
      lower
    )
  ) {
    return { instrument: 'POWER_SUPPLY', badgeLabel: 'PSU STATE' };
  }
  if (/\b(?:connect|wire|disconnect|cut|reconnect|ground|kl\s*31|kl\s*30|kl\s*15)\b/i.test(lower)) {
    return { instrument: 'HARNESS', badgeLabel: 'HARNESS' };
  }
  return { instrument: 'DIAGNOSTIC', badgeLabel: 'BENCH CMD' };
}

export const COMMON_MACRO_STEP_SNIPPETS: ReadonlyArray<{
  label: string;
  instruction: string;
}> = [
  { label: 'Connect Power', instruction: 'Connect Power' },
  { label: 'Set 12V', instruction: 'Set 12V' },
  { label: 'Engage Ignition', instruction: 'Engage Ignition' },
  { label: 'Connect Ground', instruction: 'Connect Ground' },
  { label: 'PSU 14.4V Chg', instruction: 'Set PSU preset to 14.4V charging' },
  { label: 'PSU 10.2V Crk', instruction: 'Set PSU preset to 10.2V cranking' },
  { label: 'PSU Lim 4.0A', instruction: 'Set current limit to 4.0A' },
  { label: 'Cold Idle 1150 RPM', instruction: 'Set engine RPM to 1150' },
  { label: 'Crank 240 RPM', instruction: 'Set engine RPM to 240' },
  { label: 'RPM Off', instruction: 'Turn RPM emulator off' },
  { label: 'Toggle Injector Fault', instruction: 'Toggle open circuit on pin 10' },
  { label: 'TPS Open Fault', instruction: 'Inject open circuit on pin 7' },
  { label: 'Clear Faults', instruction: 'Clear faults' },
  { label: 'Pin 5 → GND', instruction: 'Connect pin 5 to ground' },
  { label: 'DMM 20V', instruction: 'Set multimeter to 20 volts' },
  { label: 'DMM Ohms', instruction: 'Set multimeter to resistance' },
  { label: 'DMM Diode', instruction: 'Set multimeter to diode' },
  { label: 'DMM Continuity', instruction: 'Set multimeter to continuity' },
  { label: 'Probe Pin 7', instruction: 'Attach probe to pin 7' },
  { label: 'Probe Pin 10', instruction: 'Attach red probe to pin 10' },
  { label: 'Black → GND', instruction: 'Attach black probe to ground' },
  { label: 'Hold Reading', instruction: 'Hold multimeter reading' },
  { label: 'Power Off', instruction: 'Turn power off' },
  { label: 'Open Scope', instruction: 'Open oscilloscope' },
];

export const PRESET_VOICE_MACROS: ReadonlyArray<Omit<VoiceMacro, 'createdAt' | 'updatedAt'>> = [
  {
    id: 'preset-bench-power-up',
    name: 'Bench Power Up',
    triggerPhrase: 'Bench Power Up',
    description: 'Connects KL30 +12V battery feed, sets PSU to 12.0V, and engages KL15 ignition.',
    steps: ['Connect Power', 'Set 12V', 'Engage Ignition'],
    isPreset: true,
  },
  {
    id: 'preset-cold-start',
    name: 'Perform Cold Start',
    triggerPhrase: 'Perform Cold Start',
    description:
      'Connects KL31 ground and KL30 power under 10.2V cranking sag, engages KL15 ignition, starts CKP/CMP at 1150 RPM high-idle, and probes Pin 10 INJ_1 on 20V DC.',
    steps: [
      'Connect Ground',
      'Set PSU preset to 10.2V cranking',
      'Connect Power',
      'Engage Ignition',
      'Set engine RPM to 1150',
      'Set multimeter to 20V DC',
      'Attach red probe to pin 10',
      'Attach black probe to ground',
    ],
    isPreset: true,
  },
  {
    id: 'preset-toggle-injector-fault',
    name: 'Toggle Injector Fault',
    triggerPhrase: 'Toggle Injector Fault',
    description:
      'Toggles an Open Circuit fault on Injector Driver Pin 10 (INJ_1 / P0201), configures DMM to 20V DC, and probes Pin 10 vs Chassis GND.',
    steps: [
      'Toggle open circuit on pin 10',
      'Set multimeter to 20V DC',
      'Attach red probe to pin 10',
      'Attach black probe to ground',
    ],
    isPreset: true,
  },
  {
    id: 'preset-can-ohm-check',
    name: 'CAN Bus Resistance Test',
    triggerPhrase: 'Check CAN Bus',
    description: 'Powers down PSU, switches DMM to Ohms, and probes CAN-H (Pin 13) vs CAN-L (Pin 14).',
    steps: [
      'Turn power off',
      'Set multimeter to resistance',
      'Attach probe to pin 13',
      'Attach black probe to pin 14',
    ],
    isPreset: true,
  },
  {
    id: 'preset-vref-5v-probe',
    name: 'VREF 5V Supply Check',
    triggerPhrase: 'Check 5V Reference',
    description: 'Connects KL30/KL31, sets DMM to 20V DC, and probes VREF_5V (Pin 5) against Chassis GND.',
    steps: [
      'Connect Power',
      'Connect Ground',
      'Set multimeter to 20 volts',
      'Attach probe to pin 5',
      'Attach black probe to ground',
    ],
    isPreset: true,
  },
  {
    id: 'preset-esd-diode-sweep',
    name: 'Pin 7 ESD Diode Junction Test',
    triggerPhrase: 'Test TPS Diode Drop',
    description: 'De-energizes PSU, sets DMM to Diode mode (1mA/3.0V), and forward-biases TPS Pin 7 against Chassis GND.',
    steps: [
      'Turn power supply off',
      'Set multimeter to diode',
      'Attach red probe to pin 7',
      'Attach black probe to ground',
    ],
    isPreset: true,
  },
  {
    id: 'preset-cranking-sag-vbat',
    name: 'Cranking Voltage Sag Test',
    triggerPhrase: 'Simulate Cranking Sag',
    description: 'Applies 10.2V / 8.0A cranking preset, enables PSU output, and measures KL15 ignition rail on DMM 20V DC.',
    steps: [
      'Set PSU preset to 10.2V cranking',
      'Turn power supply on',
      'Set multimeter to 20V DC',
      'Attach red probe to pin 4',
      'Attach black probe to ground',
    ],
    isPreset: true,
  },
];

export function normalizeMacroTrigger(rawPhrase: string): string {
  const normalized = normalizeVoiceTranscript(rawPhrase)
    .replace(/[.,!?;:'"()[\]{}]+$/g, '')
    .replace(/^(?:please\s+)?(?:run|execute|trigger|activate|start|invoke)\s+(?:the\s+)?(?:macro\s+)?/i, '')
    .replace(/^(?:the\s+)?macro\s+/i, '')
    .trim();

  return normalized;
}

function makePresetMacros(): VoiceMacro[] {
  const now = Date.now();
  return PRESET_VOICE_MACROS.map((preset) => ({
    ...preset,
    steps: [...preset.steps],
    createdAt: now,
    updatedAt: now,
  }));
}

function sanitizeSteps(steps: string[]): string[] {
  return steps
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

class VoiceMacroRegistryService {
  private macros: VoiceMacro[] = [];
  private listeners: Set<VoiceMacroListener> = new Set();

  constructor() {
    this.macros = this.loadInitialMacros();
  }

  private loadInitialMacros(): VoiceMacro[] {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return makePresetMacros();
    }

    try {
      const raw = window.localStorage.getItem(VOICE_MACROS_STORAGE_KEY);
      if (!raw) {
        const seeded = makePresetMacros();
        this.persist(seeded);
        window.localStorage.setItem(VOICE_MACROS_PRESET_VERSION_KEY, String(CURRENT_PRESET_VERSION));
        return seeded;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return makePresetMacros();
      }
      let sanitized: VoiceMacro[] = parsed
        .filter(
          (item): item is VoiceMacro =>
            Boolean(item) &&
            typeof item.id === 'string' &&
            typeof item.name === 'string' &&
            typeof item.triggerPhrase === 'string' &&
            Array.isArray(item.steps)
        )
        .map((item) => ({
          id: item.id,
          name: item.name.trim() || item.triggerPhrase.trim(),
          triggerPhrase: item.triggerPhrase.trim(),
          steps: sanitizeSteps(item.steps.map((s) => String(s))),
          description: typeof item.description === 'string' ? item.description : undefined,
          isPreset: Boolean(item.isPreset),
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
          updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
        }))
        .filter((item) => item.triggerPhrase.length > 0 && item.steps.length > 0);

      const storedVer = Number(window.localStorage.getItem(VOICE_MACROS_PRESET_VERSION_KEY) || '1');
      if (storedVer < CURRENT_PRESET_VERSION) {
        const existingIds = new Set(sanitized.map((m) => m.id));
        const missingPresets = makePresetMacros().filter((p) => !existingIds.has(p.id));
        if (missingPresets.length > 0) {
          sanitized = [...sanitized, ...missingPresets];
          this.persist(sanitized);
        }
        window.localStorage.setItem(VOICE_MACROS_PRESET_VERSION_KEY, String(CURRENT_PRESET_VERSION));
      }

      return sanitized;
    } catch {
      return makePresetMacros();
    }
  }

  private persist(nextMacros: VoiceMacro[]) {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
    try {
      window.localStorage.setItem(VOICE_MACROS_STORAGE_KEY, JSON.stringify(nextMacros));
    } catch {
      // Ignore storage quota errors
    }
  }

  private emit() {
    const snapshot = this.getMacros();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  public getMacros(): VoiceMacro[] {
    return this.macros.map((macro) => ({
      ...macro,
      steps: [...macro.steps],
    }));
  }

  public subscribeMacros(listener: VoiceMacroListener): () => void {
    this.listeners.add(listener);
    listener(this.getMacros());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public createMacro(input: {
    name: string;
    triggerPhrase: string;
    steps: string[];
    description?: string;
  }): VoiceMacro {
    const triggerPhrase = input.triggerPhrase.trim();
    const name = input.name.trim() || triggerPhrase;
    const steps = sanitizeSteps(input.steps);
    if (!triggerPhrase) {
      throw new Error('Trigger phrase is required.');
    }
    if (steps.length === 0) {
      throw new Error('At least one bench instruction step is required.');
    }

    const now = Date.now();
    const id = `macro_${now}_${Math.random().toString(36).slice(2, 6)}`;
    const newMacro: VoiceMacro = {
      id,
      name,
      triggerPhrase,
      steps,
      description: input.description?.trim() || undefined,
      isPreset: false,
      createdAt: now,
      updatedAt: now,
    };

    this.macros = [newMacro, ...this.macros];
    this.persist(this.macros);
    this.emit();
    return { ...newMacro, steps: [...newMacro.steps] };
  }

  public createMacroFromInstrumentSequence(input: {
    name: string;
    triggerPhrase: string;
    description?: string;
    sequence: InstrumentStateStepSpec[];
  }): VoiceMacro {
    const steps = compileInstrumentSequenceToSteps(input.sequence);
    return this.createMacro({
      name: input.name,
      triggerPhrase: input.triggerPhrase,
      description: input.description,
      steps,
    });
  }

  public captureStateMacro(input: {
    name: string;
    triggerPhrase: string;
    description?: string;
    powerSupply: PowerSupplyState;
    multimeter: MultimeterState;
    manualRangeLabel?: string | null;
    includePowerSupply?: boolean;
    includeMultimeter?: boolean;
    includeProbes?: boolean;
  }): VoiceMacro {
    const steps = captureBenchInstrumentSequence({
      powerSupply: input.powerSupply,
      multimeter: input.multimeter,
      manualRangeLabel: input.manualRangeLabel,
      includePowerSupply: input.includePowerSupply,
      includeMultimeter: input.includeMultimeter,
      includeProbes: input.includeProbes,
    });
    return this.createMacro({
      name: input.name,
      triggerPhrase: input.triggerPhrase,
      description: input.description,
      steps,
    });
  }

  public duplicateMacro(id: string): VoiceMacro | null {
    const source = this.macros.find((m) => m.id === id);
    if (!source) return null;
    return this.createMacro({
      name: `${source.name} (Copy)`,
      triggerPhrase: `${source.triggerPhrase} Copy`,
      description: source.description,
      steps: [...source.steps],
    });
  }

  public updateMacro(
    id: string,
    updates: {
      name?: string;
      triggerPhrase?: string;
      steps?: string[];
      description?: string;
    }
  ): VoiceMacro | null {
    const idx = this.macros.findIndex((m) => m.id === id);
    if (idx < 0) return null;

    const current = this.macros[idx];
    const nextTrigger = updates.triggerPhrase !== undefined ? updates.triggerPhrase.trim() : current.triggerPhrase;
    const nextName =
      updates.name !== undefined ? updates.name.trim() || nextTrigger : current.name;
    const nextSteps = updates.steps !== undefined ? sanitizeSteps(updates.steps) : current.steps;

    if (!nextTrigger || nextSteps.length === 0) {
      return null;
    }

    const updated: VoiceMacro = {
      ...current,
      name: nextName,
      triggerPhrase: nextTrigger,
      steps: nextSteps,
      description:
        updates.description !== undefined ? updates.description.trim() || undefined : current.description,
      updatedAt: Date.now(),
    };

    this.macros = this.macros.map((m) => (m.id === id ? updated : m));
    this.persist(this.macros);
    this.emit();
    return { ...updated, steps: [...updated.steps] };
  }

  public deleteMacro(id: string): boolean {
    const next = this.macros.filter((m) => m.id !== id);
    if (next.length === this.macros.length) return false;
    this.macros = next;
    this.persist(this.macros);
    this.emit();
    return true;
  }

  public resetPresets(): void {
    const customOnly = this.macros.filter((m) => !m.isPreset);
    this.macros = [...customOnly, ...makePresetMacros()];
    this.persist(this.macros);
    this.emit();
  }

  public exportMacrosJson(): string {
    return JSON.stringify(
      {
        schema: 'autoelectric-voice-macros-v1',
        exportedAt: new Date().toISOString(),
        macros: this.getMacros(),
      },
      null,
      2
    );
  }

  public importMacrosJson(rawJson: string): { importedCount: number; totalCount: number } {
    const parsed = JSON.parse(rawJson) as unknown;
    const rawArray = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { macros?: unknown[] }).macros)
      ? (parsed as { macros: unknown[] }).macros
      : null;

    if (!rawArray) {
      throw new Error('Invalid JSON format: expected an array of voice macros or { macros: [...] }.');
    }

    const beforeIds = new Set(this.macros.map((m) => m.id));
    const merged = this.syncFromCloud(rawArray, 'merge');
    const addedCount = merged.filter((m) => !beforeIds.has(m.id)).length;
    return { importedCount: addedCount || rawArray.length, totalCount: merged.length };
  }

  public syncFromCloud(
    incomingMacros: unknown[],
    mode: 'merge' | 'replace' = 'merge'
  ): VoiceMacro[] {
    if (!Array.isArray(incomingMacros)) {
      return this.getMacros();
    }

    const sanitizedIncoming: VoiceMacro[] = incomingMacros
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as Record<string, unknown>).id === 'string' &&
          typeof (item as Record<string, unknown>).triggerPhrase === 'string' &&
          Array.isArray((item as Record<string, unknown>).steps)
      )
      .slice(0, 50)
      .map((item) => {
        const triggerPhrase = String(item.triggerPhrase).trim().slice(0, 120);
        const name = String(item.name || triggerPhrase).trim().slice(0, 120) || triggerPhrase;
        const steps = sanitizeSteps((item.steps as unknown[]).map((s) => String(s)));
        return {
          id: String(item.id).slice(0, 128),
          name,
          triggerPhrase,
          steps,
          description:
            typeof item.description === 'string' && item.description.trim()
              ? item.description.trim().slice(0, 240)
              : undefined,
          isPreset: Boolean(item.isPreset),
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
          updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
        };
      })
      .filter((item) => item.triggerPhrase.length > 0 && item.steps.length > 0);

    if (mode === 'replace') {
      if (sanitizedIncoming.length === 0) return this.getMacros();
      this.macros = sanitizedIncoming;
      this.persist(this.macros);
      this.emit();
      return this.getMacros();
    }

    const mergedById = new Map<string, VoiceMacro>();
    for (const localMacro of this.macros) {
      mergedById.set(localMacro.id, { ...localMacro, steps: [...localMacro.steps] });
    }
    for (const remoteMacro of sanitizedIncoming) {
      const existing = mergedById.get(remoteMacro.id);
      if (!existing || remoteMacro.updatedAt > existing.updatedAt) {
        mergedById.set(remoteMacro.id, remoteMacro);
      }
    }

    const next = Array.from(mergedById.values())
      .sort((a, b) => {
        if (Boolean(a.isPreset) !== Boolean(b.isPreset)) {
          return a.isPreset ? 1 : -1;
        }
        return b.updatedAt - a.updatedAt;
      })
      .slice(0, 50);

    this.macros = next;
    this.persist(this.macros);
    this.emit();
    return this.getMacros();
  }

  public findMatchingMacro(rawTranscript: string): VoiceMacro | null {
    const candidate = normalizeMacroTrigger(rawTranscript);
    if (!candidate) return null;

    // 1. Exact trigger phrase or macro name match (prefers user custom macros first via list order)
    for (const macro of this.macros) {
      const normalizedTrigger = normalizeMacroTrigger(macro.triggerPhrase);
      const normalizedName = normalizeMacroTrigger(macro.name);
      if (
        (normalizedTrigger && candidate === normalizedTrigger) ||
        (normalizedName && candidate === normalizedName)
      ) {
        return { ...macro, steps: [...macro.steps] };
      }
    }

    // 2. Clean boundary match when user embeds a multi-word / 6+ char trigger in a sentence
    //    (e.g., "go ahead and bench power up")
    for (const macro of this.macros) {
      const normalizedTrigger = normalizeMacroTrigger(macro.triggerPhrase);
      if (!normalizedTrigger || normalizedTrigger.length < 6) continue;
      const escaped = normalizedTrigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const boundaryRegex = new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`, 'i');
      if (boundaryRegex.test(candidate)) {
        return { ...macro, steps: [...macro.steps] };
      }
    }

    return null;
  }
}

export const voiceMacroService = new VoiceMacroRegistryService();
