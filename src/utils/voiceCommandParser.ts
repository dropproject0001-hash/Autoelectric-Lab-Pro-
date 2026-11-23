import { EcuPin, FaultType, MultimeterMode, MultimeterState } from '../types/ecu';
import {
  TABLE16_DLC_INTERFACES,
  VERIFIED_VOICE_ECU_GUIDES,
  matchRestrictedModelsForQuery,
  matchSafetyGatesForQuery,
  searchOemPcbHardwareSpecs,
} from './oemKnowledgeDatabase';
import { parseWorkflowStepTarget } from './diagnosticWorkflow';
import type { ScenarioVoiceGuidanceKind } from './troubleScenarioVoiceCoach';

export type LabTab = 'BENCH_LAB' | 'WIRING_DIAGRAM' | 'THREE_D_TWIN' | 'ECU_PINOUT' | 'OSCILLOSCOPE' | 'PCB_SCANNER' | 'REPAIR_GUIDE';

export type VoiceCommandCategory =
  | 'WIRING'
  | 'MULTIMETER'
  | 'POWER'
  | 'PROBES'
  | 'NAVIGATION'
  | 'FAULT'
  | 'DIAGNOSTIC'
  | 'RPM'
  | 'MACRO'
  | 'SYSTEM';

export type VoiceCommandStatus = 'EXECUTED' | 'FAILED' | 'UNRECOGNIZED';

export interface ScenarioVoiceCallbackResult {
  actionDescription: string;
  spokenReply: string;
  scenarioPhId?: string;
  scenarioStepNumber?: number;
  guidanceKind?: ScenarioVoiceGuidanceKind;
  alreadySpoken?: boolean;
}

export interface CommandExecutionResult {
  matched: boolean;
  actionDescription: string;
  spokenReply: string;
  normalizedTranscript?: string;
  category?: VoiceCommandCategory;
  status?: VoiceCommandStatus;
  scenarioPhId?: string;
  scenarioStepNumber?: number;
  guidanceKind?: ScenarioVoiceGuidanceKind;
  alreadySpoken?: boolean;
}

export interface MacroStepResult {
  instruction: string;
  matched: boolean;
  status: VoiceCommandStatus;
  actionDescription: string;
  spokenReply: string;
  category: VoiceCommandCategory;
}

export interface MacroExecutionResult {
  matched: boolean;
  macroName: string;
  triggerPhrase: string;
  stepResults: MacroStepResult[];
  executedCount: number;
  failedCount: number;
  unrecognizedCount: number;
  status: VoiceCommandStatus;
  actionDescription: string;
  spokenReply: string;
}

export type VoiceBenchPane = 'INSTRUMENTS' | 'CANVAS' | 'GUIDE';

export interface VoiceMeterSummary {
  display: string;
  unit: string;
  dtcCount: number;
  supplyVolts: number;
  isPowerOn: boolean;
  supplyAmps: number;
}

export interface ResolvedBenchTerminal {
  id: string;
  label: string;
  color: string;
  spokenLabel: string;
}

export interface VoiceCommandActions {
  setVoltage: (volts: number) => void;
  setCurrentLimit?: (amps: number) => void;
  setPowerSupplyPreset?: (
    preset: '12V_BENCH' | '14.4V_RUNNING' | '10.2V_CRANKING' | '5V_LOGIC' | 'CUSTOM',
    volts: number,
    currentLimit: number
  ) => void;
  resetLab: () => void;
  attachProbeToPin: (pinId: string, label: string) => void;
  setPowerSupplyOutput: (enabled: boolean) => void;
  switchTab: (tab: LabTab) => void;
  switchMobilePane?: (pane: VoiceBenchPane) => void;
  openDiagnosticWorkflow?: () => void;
  openLogicCheck?: () => void;
  toggleWorkflowStep?: (stepId: string, checked?: boolean) => void;
  checkPassingWorkflow?: () => number | void;
  resetWorkflow?: () => void;
  clearFaults?: () => void;
  readMeter?: () => VoiceMeterSummary;
  connectWire?: (sourcePinId: string, targetPinId: string, color?: string, label?: string) => boolean | void;
  disconnectWireByPin?: (pinId: string) => number;
  toggleCutWireByPin?: (pinId: string, cut?: boolean) => number;
  attachBlackProbeToPin?: (pinId: string, label: string) => void;
  swapProbes?: () => void;
  disconnectProbes?: () => void;
  setMultimeterState?: (updates: Partial<MultimeterState>, manualRangeLabel?: string | null) => void;
  injectFault?: (pinId: string, faultType: FaultType, description: string) => void;
  toggleFault?: (pinId: string, faultType: FaultType, description: string) => boolean | void;
  removeFault?: (pinId: string) => boolean | void;
  setRpmEmulator?: (updates: { isActive?: boolean; rpm?: number }) => void;
  openTroubleLookup?: (query?: string) => ScenarioVoiceCallbackResult | void;
  emulateTroubleScenario?: (phId?: string) => ScenarioVoiceCallbackResult | void;
  nextScenarioStep?: () => ScenarioVoiceCallbackResult | void;
  prevScenarioStep?: () => ScenarioVoiceCallbackResult | void;
  repeatScenarioStep?: (stepNumber?: number) => ScenarioVoiceCallbackResult | void;
  verifyScenarioStep?: () => ScenarioVoiceCallbackResult | void;
  completeScenarioStep?: (stepNumber?: number) => ScenarioVoiceCallbackResult | void;
  probeScenarioFocusPin?: () => ScenarioVoiceCallbackResult | void;
}

const SINGLE_NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS_NUMBER_WORDS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/**
 * Normalizes Web Speech API transcripts so spoken numbers ("five", "twenty four", "twelve point six")
 * and automotive abbreviations ("multi meter", "d.m.m.", "v bat", "pin 5 two ground") match cleanly.
 */
export function normalizeVoiceTranscript(rawTranscript: string): string {
  let normalized = rawTranscript
    .trim()
    .toLowerCase()
    .replace(/multi[\s-]+meter/g, 'multimeter')
    .replace(/\bd\.?\s*m\.?\s*m\.?\b/g, 'multimeter')
    .replace(/\bv[\s-]+bat\b/g, 'vbat')
    .replace(/\btee\s+pee\s+ess\b/g, 'tps')
    .replace(/\bk\s+l\s+(30|31|15)\b/g, 'kl$1')
    .replace(/\bp\.?\s*h\.?\s*[\s-]*(\d{3,4})\b/gi, 'ph-$1');

  // Fix common STT homophone "pin <num> two ground/12 volts" before converting "two" -> "2"
  normalized = normalized.replace(
    /\b((?:ecu\s+)?pin\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|\d+))\s+two\s+(ground|gnd|earth|chassis|vbat|battery|power|pin\b|tps|map|ect|can|relay|injector|twelve|12\b)/gi,
    '$1 to $2'
  );

  // Convert compound tens e.g. "twenty four" -> "24"
  normalized = normalized.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+(one|two|three|four|five|six|seven|eight|nine)\b/gi,
    (_, tensWord: string, unitWord: string) => {
      const tens = TENS_NUMBER_WORDS[tensWord.toLowerCase()] ?? 0;
      const unit = SINGLE_NUMBER_WORDS[unitWord.toLowerCase()] ?? 0;
      return String(tens + unit);
    }
  );

  // Convert standalone tens ("twenty" -> "20", "two hundred" -> "200")
  normalized = normalized.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine)\s+hundred\b/gi,
    (_, numWord: string) => String((SINGLE_NUMBER_WORDS[numWord.toLowerCase()] ?? 1) * 100)
  );
  normalized = normalized.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi,
    (w) => String(TENS_NUMBER_WORDS[w.toLowerCase()] ?? w)
  );
  normalized = normalized.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/gi,
    (w) => String(SINGLE_NUMBER_WORDS[w.toLowerCase()] ?? w)
  );

  // Convert spoken decimal points between digits: "12 point 6" -> "12.6"
  normalized = normalized.replace(/(\d+)\s+point\s+(\d+)/g, '$1.$2');

  return normalized.replace(/\s+/g, ' ').trim();
}

function inferWireColor(source: ResolvedBenchTerminal, target: ResolvedBenchTerminal): string {
  if (source.id === 'chassis-gnd' || target.id === 'chassis-gnd') return '#1e293b';
  if (source.id === 'bench-vbat' || target.id === 'bench-vbat') return '#ef4444';
  if (source.color !== '#06b6d4') return source.color;
  if (target.color !== '#06b6d4') return target.color;
  return '#06b6d4';
}

export function resolveBenchTerminal(
  rawExpr: string,
  pins: EcuPin[]
): ResolvedBenchTerminal | null {
  const expr = rawExpr
    .trim()
    .toLowerCase()
    .replace(/^(?:the|ecu|bench)\s+/i, '')
    .trim();

  if (!expr) return null;

  if (
    /^(?:chassis\s+)?(?:ground|gnd|earth|kl\s*31|neg|negative|battery\s+negative)$/i.test(expr)
  ) {
    return {
      id: 'chassis-gnd',
      label: 'Chassis GND (KL31)',
      color: '#1e293b',
      spokenLabel: 'chassis ground',
    };
  }

  if (
    /^(?:\+?12\s*(?:v|volts?)?|vbat|battery(?:\s+positive)?|power(?:\s+rail|\s+supply)?|supply|kl\s*30|positive)$/i.test(
      expr
    )
  ) {
    return {
      id: 'bench-vbat',
      label: '+12V VBat Rail',
      color: '#ef4444',
      spokenLabel: '12 volt battery rail',
    };
  }

  const pinNumMatch = expr.match(/^(?:ecu\s+)?(?:pin|terminal|ch|channel)?\s*#?(\d+)$/i);
  if (pinNumMatch) {
    const pinNum = parseInt(pinNumMatch[1], 10);
    const targetPin = pins.find((p) => p.pinNumber === pinNum || p.id.endsWith(`-${pinNum}`));
    if (targetPin) {
      const color =
        targetPin.category === 'ground'
          ? '#1e293b'
          : targetPin.category === 'power'
          ? '#ef4444'
          : targetPin.category === 'reference'
          ? '#eab308'
          : '#06b6d4';
      return {
        id: targetPin.id,
        label: `${targetPin.label} (Pin ${targetPin.pinNumber})`,
        color,
        spokenLabel: `pin ${targetPin.pinNumber}, ${targetPin.label}`,
      };
    }
    return null;
  }

  // Named bench component terminals
  const componentMap: Array<{ pattern: RegExp; terminal: ResolvedBenchTerminal }> = [
    {
      pattern: /\btps\s*(?:vcc|power|5v|supply|ref)\b/i,
      terminal: { id: 'tps-vcc', label: 'TPS 5V VCC', color: '#eab308', spokenLabel: 'TPS 5 volt VCC' },
    },
    {
      pattern: /\btps\s*(?:gnd|ground)\b/i,
      terminal: { id: 'tps-gnd', label: 'TPS GND', color: '#78716c', spokenLabel: 'TPS ground' },
    },
    {
      pattern: /\btps(?:\s+(?:sig|signal|wiper))?\b/i,
      terminal: { id: 'tps-sig', label: 'TPS Wiper Signal', color: '#22c55e', spokenLabel: 'TPS signal' },
    },
    {
      pattern: /\bmap\s*(?:vcc|power|5v|supply)\b/i,
      terminal: { id: 'map-vcc', label: 'MAP 5V VCC', color: '#eab308', spokenLabel: 'MAP 5 volt VCC' },
    },
    {
      pattern: /\bmap\s*(?:gnd|ground)\b/i,
      terminal: { id: 'map-gnd', label: 'MAP GND', color: '#78716c', spokenLabel: 'MAP ground' },
    },
    {
      pattern: /\bmap(?:\s+(?:sig|signal|pressure))?\b/i,
      terminal: { id: 'map-sig', label: 'MAP Signal', color: '#06b6d4', spokenLabel: 'MAP signal' },
    },
    {
      pattern: /\bect\s*(?:gnd|ground)\b/i,
      terminal: { id: 'ect-gnd', label: 'ECT GND', color: '#78716c', spokenLabel: 'ECT ground' },
    },
    {
      pattern: /\b(?:ect|coolant(?:\s+temp)?|thermistor)(?:\s+(?:sig|signal))?\b/i,
      terminal: { id: 'ect-sig', label: 'ECT Thermistor +', color: '#f97316', spokenLabel: 'ECT sensor' },
    },
    {
      pattern: /\binjector\s*(?:12v|vbat|power|battery|\+)\b/i,
      terminal: { id: 'inj-vbat', label: 'Injector +12V', color: '#ef4444', spokenLabel: 'injector 12 volt feed' },
    },
    {
      pattern: /\b(?:injector|inj)(?:\s+(?:ctrl|control|sink|signal))?\b/i,
      terminal: { id: 'inj-ctrl', label: 'Injector Sink Ctrl', color: '#3b82f6', spokenLabel: 'injector control' },
    },
    {
      pattern: /\bcan[\s_-]*(?:h|high)\b/i,
      terminal: { id: 'can-term-h', label: 'CAN-H Terminator', color: '#6366f1', spokenLabel: 'CAN high terminator' },
    },
    {
      pattern: /\bcan[\s_-]*(?:l|low)\b/i,
      terminal: { id: 'can-term-l', label: 'CAN-L Terminator', color: '#a855f7', spokenLabel: 'CAN low terminator' },
    },
    {
      pattern: /\brelay\s*(?:pin\s*)?30\b/i,
      terminal: { id: 'relay-30', label: 'Relay Pin 30', color: '#ef4444', spokenLabel: 'relay pin 30' },
    },
    {
      pattern: /\brelay\s*(?:pin\s*)?87\b/i,
      terminal: { id: 'relay-87', label: 'Relay Pin 87', color: '#06b6d4', spokenLabel: 'relay pin 87' },
    },
    {
      pattern: /\brelay\s*(?:pin\s*)?86\b/i,
      terminal: { id: 'relay-86', label: 'Relay Pin 86', color: '#ef4444', spokenLabel: 'relay pin 86' },
    },
    {
      pattern: /\brelay\s*(?:pin\s*)?85\b/i,
      terminal: { id: 'relay-85', label: 'Relay Pin 85', color: '#3b82f6', spokenLabel: 'relay pin 85' },
    },
  ];

  for (const entry of componentMap) {
    if (entry.pattern.test(expr)) {
      return entry.terminal;
    }
  }

  // Fallback: match by ECU pin label (e.g. "vref", "kl15", "o2", "mrelay", "sgnd")
  const matchedEcuPin = pins.find((p) => {
    const lbl = p.label.toLowerCase();
    return (
      lbl === expr ||
      lbl.replace(/_/g, ' ') === expr ||
      (expr.length >= 3 && lbl.includes(expr))
    );
  });

  if (matchedEcuPin) {
    return {
      id: matchedEcuPin.id,
      label: `${matchedEcuPin.label} (Pin ${matchedEcuPin.pinNumber})`,
      color: matchedEcuPin.category === 'ground' ? '#1e293b' : '#06b6d4',
      spokenLabel: `pin ${matchedEcuPin.pinNumber}, ${matchedEcuPin.label}`,
    };
  }

  return null;
}

function makeResolvedEcuPinTerminal(pin: EcuPin): ResolvedBenchTerminal {
  const color =
    pin.category === 'ground'
      ? '#1e293b'
      : pin.category === 'power'
      ? '#ef4444'
      : pin.category === 'reference'
      ? '#eab308'
      : '#06b6d4';
  return {
    id: pin.id,
    label: `${pin.label} (Pin ${pin.pinNumber})`,
    color,
    spokenLabel: `pin ${pin.pinNumber}, ${pin.label}`,
  };
}

/**
 * Resolves ECU connector pin targets specifically for Fault Injection Matrix commands
 * (e.g. "injector" -> Pin 10 INJ_1, "tps" -> Pin 7 TPS_SIG, "pin 10" -> Pin 10).
 */
export function resolveFaultTargetPin(
  rawExpr: string,
  pins: EcuPin[]
): ResolvedBenchTerminal | null {
  const cleaned = rawExpr
    .trim()
    .toLowerCase()
    .replace(/\b(?:fault|circuit|driver|signal|line)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;

  const findPinByHint = (labelPattern: RegExp, fallbackPinNum: number): EcuPin | undefined =>
    pins.find((p) => labelPattern.test(p.label)) ||
    pins.find((p) => p.pinNumber === fallbackPinNum || p.id.endsWith(`-${fallbackPinNum}`));

  if (/\b(?:inj|injector)\b/i.test(cleaned)) {
    const p = findPinByHint(/inj/i, 10);
    if (p) return makeResolvedEcuPinTerminal(p);
  }
  if (/\b(?:ign|ignition|coil)\b/i.test(cleaned)) {
    const p = findPinByHint(/ign|coil/i, 11);
    if (p) return makeResolvedEcuPinTerminal(p);
  }
  if (/\b(?:tps|throttle)\b/i.test(cleaned)) {
    const p = findPinByHint(/tps/i, 7);
    if (p) return makeResolvedEcuPinTerminal(p);
  }
  if (/\b(?:map|manifold)\b/i.test(cleaned)) {
    const p = findPinByHint(/map/i, 8);
    if (p) return makeResolvedEcuPinTerminal(p);
  }
  if (/\b(?:ect|coolant|temp)\b/i.test(cleaned)) {
    const p = findPinByHint(/ect/i, 9);
    if (p) return makeResolvedEcuPinTerminal(p);
  }
  if (/\b(?:vref|5v)\b/i.test(cleaned)) {
    const p = findPinByHint(/vref/i, 5);
    if (p) return makeResolvedEcuPinTerminal(p);
  }
  if (/\b(?:o2|oxygen)\b/i.test(cleaned)) {
    const p = findPinByHint(/o2/i, 15);
    if (p) return makeResolvedEcuPinTerminal(p);
  }
  if (/\bcan[\s_-]*(?:h|high)\b/i.test(cleaned)) {
    const p = findPinByHint(/can_?h/i, 13);
    if (p) return makeResolvedEcuPinTerminal(p);
  }
  if (/\bcan[\s_-]*(?:l|low)\b/i.test(cleaned)) {
    const p = findPinByHint(/can_?l/i, 14);
    if (p) return makeResolvedEcuPinTerminal(p);
  }
  if (/\b(?:main\s+relay|mrelay)\b/i.test(cleaned)) {
    const p = findPinByHint(/mrelay/i, 12);
    if (p) return makeResolvedEcuPinTerminal(p);
  }
  if (/\b(?:fuel\s+pump|fp)\b/i.test(cleaned)) {
    const p = findPinByHint(/fp/i, 16);
    if (p) return makeResolvedEcuPinTerminal(p);
  }
  if (/\b(?:kl31|power\s+ground|ground)\b/i.test(cleaned)) {
    const p = findPinByHint(/kl31/i, 1);
    if (p) return makeResolvedEcuPinTerminal(p);
  }

  const direct = resolveBenchTerminal(cleaned, pins);
  if (direct && direct.id.startsWith('ecu-pin-')) {
    return direct;
  }

  return null;
}

function mapFaultPhraseToType(faultPhrase?: string): { faultType: FaultType; label: string } {
  const lower = (faultPhrase || '').toLowerCase();
  if (lower.includes('ground') || lower.includes('gnd')) {
    return { faultType: 'SHORT_TO_GND', label: 'Short to Ground' };
  }
  if (lower.includes('12v') || lower.includes('vbat') || lower.includes('battery') || lower.includes('power')) {
    return { faultType: 'SHORT_TO_VBAT', label: 'Short to +12V VBat' };
  }
  if (lower.includes('resistance') || lower.includes('corrosion')) {
    return { faultType: 'HIGH_RESISTANCE_250R', label: 'High Resistance / Corrosion (250Ω)' };
  }
  return { faultType: 'OPEN_CIRCUIT', label: 'Open Circuit' };
}

function parseMultimeterVoiceCommand(
  text: string,
  pins: EcuPin[],
  actions: VoiceCommandActions
): CommandExecutionResult | null {
  // 0a. Power multimeter ON/OFF
  if (/^(?:turn|switch|power)\s+(?:the\s+)?(?:multimeter|meter)\s+(on|off)$/i.test(text) ||
      /^(?:multimeter|meter)\s+(on|off)$/i.test(text)) {
    const turnOn = /\bon$/i.test(text);
    actions.setMultimeterState?.({ isPowered: turnOn, holdValue: turnOn ? undefined : false });
    return {
      matched: true,
      actionDescription: turnOn ? 'Powered Multimeter ON' : 'Powered Multimeter OFF',
      spokenReply: turnOn ? 'Digital multimeter powered on.' : 'Digital multimeter powered off.',
    };
  }

  // 0b. Hold / Freeze reading
  if (/(?:hold|freeze|latch)\s+(?:the\s+)?(?:multimeter|meter|reading|value)/i.test(text) ||
      /^hold\s+(?:reading|value|meter)$/i.test(text)) {
    actions.setMultimeterState?.({ isPowered: true, holdValue: true });
    return {
      matched: true,
      actionDescription: 'Latched DMM HOLD reading',
      spokenReply: 'Multimeter reading held.',
    };
  }
  if (/(?:release|clear|unhold|unfreeze)\s+(?:the\s+)?(?:hold|multimeter|meter|reading)/i.test(text) ||
      /^release\s+hold$/i.test(text)) {
    actions.setMultimeterState?.({ holdValue: false });
    return {
      matched: true,
      actionDescription: 'Released DMM HOLD latch',
      spokenReply: 'Multimeter hold released. Showing live reading.',
    };
  }

  // 0c. Swap / Disconnect probes
  if (/swap\s+(?:the\s+)?probes?/i.test(text)) {
    actions.swapProbes?.();
    return {
      matched: true,
      actionDescription: 'Swapped DMM Red (+) and Black COM (-) probes',
      spokenReply: 'Swapped multimeter red and black probes.',
    };
  }
  if (/(?:disconnect|clear|remove)\s+(?:all\s+|both\s+)?(?:multimeter\s+)?probes?/i.test(text)) {
    actions.disconnectProbes?.();
    return {
      matched: true,
      actionDescription: 'Disconnected both DMM probes',
      spokenReply: 'Multimeter probes disconnected.',
    };
  }

  // 0d. Auto range command
  if (/(?:set\s+(?:the\s+)?(?:multimeter|meter)\s+to\s+|enable\s+)?auto[\s-]*range/i.test(text)) {
    actions.setMultimeterState?.({ isPowered: true, rangeAuto: true }, null);
    return {
      matched: true,
      actionDescription: 'Set Multimeter to Auto-Range',
      spokenReply: 'Multimeter set to auto range.',
    };
  }

  // 0e. Black probe placement (e.g. "attach black probe to ground", "move com probe to pin 6")
  const blackProbeMatch = text.match(
    /(?:attach|connect|put|place|move)\s+(?:the\s+)?(?:black|com|negative)\s+(?:probe|lead)\s+(?:to\s+)?(.+)$/i
  );
  if (blackProbeMatch && actions.attachBlackProbeToPin) {
    const terminal = resolveBenchTerminal(blackProbeMatch[1], pins);
    if (terminal) {
      actions.attachBlackProbeToPin(terminal.id, terminal.label);
      return {
        matched: true,
        actionDescription: `Attached DMM Black COM (-) probe to ${terminal.label}`,
        spokenReply: `Attached black probe to ${terminal.spokenLabel}.`,
        category: 'PROBES',
      };
    }
    return {
      matched: true,
      status: 'FAILED',
      category: 'PROBES',
      actionDescription: `Terminal "${blackProbeMatch[1].trim()}" not recognized for black probe`,
      spokenReply: `Could not find terminal ${blackProbeMatch[1].trim()} for the black probe.`,
    };
  }

  // 0f. Multimeter Mode / Range e.g. "set multimeter to 20 volts", "set meter to resistance", "set multimeter to ac volts"
  const meterCmdMatch = text.match(
    /(?:set|switch|change|put|turn)\s+(?:the\s+)?(?:multimeter|meter)\s+(?:mode\s+)?(?:to\s+)?(.+)$/i
  );
  if (meterCmdMatch && actions.setMultimeterState) {
    const spec = meterCmdMatch[1].trim();

    let mode: MultimeterMode | null = null;
    let rangeAuto = true;
    let manualRangeLabel: string | null = null;
    let spokenModeDesc = '';

    // Check explicit numeric range + unit first (e.g. "20 volts", "200 millivolts", "200v ac", "20k ohms", "20 khz")
    const voltRangeMatch = spec.match(/(\d+(?:\.\d+)?)\s*(mv|millivolts?|v|volts?)\s*(ac|dc)?/i);
    const acMentioned = /\bac\b|\balternating\b/i.test(spec);
    const dcMentioned = /\bdc\b|\bdirect\b/i.test(spec);

    if (voltRangeMatch) {
      const value = parseFloat(voltRangeMatch[1]);
      const unitRaw = voltRangeMatch[2].toLowerCase();
      const suffix = voltRangeMatch[3]?.toLowerCase();
      const isMv = unitRaw.startsWith('mv') || unitRaw.startsWith('milli');
      const isAc = suffix === 'ac' || acMentioned;
      mode = isAc ? 'V_AC' : 'V_DC';
      rangeAuto = false;
      manualRangeLabel = isMv ? `${value}mV` : `${value}V`;
      spokenModeDesc = `${value} ${isMv ? 'millivolts' : 'volts'} ${isAc ? 'A C' : 'D C'}`;
    } else if (/\b(?:continuity|beep)\b/i.test(spec)) {
      mode = 'CONTINUITY';
      spokenModeDesc = 'continuity beep mode';
    } else if (/\b(?:diode|junction)\b/i.test(spec)) {
      mode = 'DIODE';
      spokenModeDesc = 'diode junction test mode';
    } else if (/\b(?:freq|frequency|hertz|hz|duty|pwm)\b/i.test(spec)) {
      const hzMatch = spec.match(/(\d+(?:\.\d+)?)\s*(k?hz|kilohertz|hertz)/i);
      mode = 'FREQUENCY';
      if (hzMatch) {
        rangeAuto = false;
        const isKhz = hzMatch[2].toLowerCase().startsWith('k');
        manualRangeLabel = `${hzMatch[1]}${isKhz ? 'kHz' : 'Hz'}`;
        spokenModeDesc = `frequency ${hzMatch[1]} ${isKhz ? 'kilohertz' : 'hertz'}`;
      } else {
        spokenModeDesc = 'frequency and duty cycle mode';
      }
    } else if (/(?:\b(?:res|resistance|ohms?|ohm)\b|[\u03A9\u2126])/i.test(spec)) {
      const ohmMatch = spec.match(/(\d+(?:\.\d+)?)\s*(k|m)?\s*(?:ohms?|ohm|[\u03A9\u2126])/i);
      mode = 'RESISTANCE';
      if (ohmMatch) {
        rangeAuto = false;
        const rawMult = ohmMatch[2]?.toLowerCase() || '';
        const mult = rawMult === 'k' ? 'k' : rawMult === 'm' ? 'M' : '';
        manualRangeLabel = `${ohmMatch[1]}${mult}Ω`;
        spokenModeDesc = `${ohmMatch[1]} ${mult === 'k' ? 'kilohms' : mult === 'M' ? 'megohms' : 'ohms'} resistance`;
      } else {
        spokenModeDesc = 'resistance ohms mode';
      }
    } else if (acMentioned || /ac\s*volts?/i.test(spec)) {
      mode = 'V_AC';
      spokenModeDesc = 'A C voltage mode';
    } else if (dcMentioned || /(?:dc\s*)?volts?|voltage/i.test(spec)) {
      mode = 'V_DC';
      spokenModeDesc = 'D C voltage mode';
    }

    if (mode) {
      actions.setMultimeterState(
        {
          isPowered: true,
          mode,
          rangeAuto,
          holdValue: false,
        },
        manualRangeLabel
      );
      const rangeTag = rangeAuto ? 'Auto-Range' : `${manualRangeLabel} Manual Range`;
      return {
        matched: true,
        actionDescription: `Set Multimeter to ${mode.replace('_', ' ')} (${rangeTag})`,
        spokenReply: `Multimeter set to ${spokenModeDesc}.`,
      };
    }
  }

  return null;
}

function inferCommandCategory(result: CommandExecutionResult, text: string): VoiceCommandCategory {
  if (result.category) return result.category;
  const desc = `${result.actionDescription} ${text}`.toLowerCase();
  if (/probe|swap\s+dmm|black\s+com|red\s+probe/i.test(desc)) return 'PROBES';
  if (/multimeter|dmm|auto-range|hold\s+latch|continuity|diode|resistance|ac\s+voltage|dc\s+voltage/i.test(desc)) return 'MULTIMETER';
  if (/wire|connected\s+wire|disconnected|cut\s+wire|reconnected/i.test(desc)) return 'WIRING';
  if (/power\s+supply|psu/i.test(desc)) return 'POWER';
  if (/fault|dtc|short\s+to|open\s+circuit|corrosion/i.test(desc)) return 'FAULT';
  if (/rpm\s+emulator/i.test(desc)) return 'RPM';
  if (/opened|focused|bench\s+lab|workspace|oscilloscope|scanner|pinout/i.test(desc)) return 'NAVIGATION';
  if (/reset\s+laboratory/i.test(desc)) return 'SYSTEM';
  return 'DIAGNOSTIC';
}

export function parseAndExecuteVoiceCommand(
  transcript: string,
  pins: EcuPin[],
  actions: VoiceCommandActions
): CommandExecutionResult {
  const text = normalizeVoiceTranscript(transcript);
  const rawResult = parseAndExecuteNormalizedCommand(text, pins, actions);
  return {
    ...rawResult,
    normalizedTranscript: text,
    category: rawResult.matched ? inferCommandCategory(rawResult, text) : 'DIAGNOSTIC',
    status: rawResult.status ?? (rawResult.matched ? 'EXECUTED' : 'UNRECOGNIZED'),
  };
}

function parseAndExecuteNormalizedCommand(
  text: string,
  pins: EcuPin[],
  actions: VoiceCommandActions
): CommandExecutionResult {
  // 0. Multimeter mode, range, power, hold, and probe placement (must run BEFORE PSU voltage & wire commands)
  const meterResult = parseMultimeterVoiceCommand(text, pins, actions);
  if (meterResult) return { category: 'MULTIMETER', ...meterResult };

  // 0g-1. Toggle Fault commands e.g. "toggle open circuit on pin 10", "toggle injector fault"
  const toggleFaultWithTypeMatch = text.match(
    /^(?:please\s+)?toggle\s+(?:a\s+|the\s+)?(short\s+to\s+ground|short\s+to\s+(?:12v|vbat|battery|power)|open\s+circuit|high\s+resistance|corrosion)(?:\s+fault)?\s+(?:on|at|to)\s+(.+)$/i
  );
  const toggleFaultTargetMatch =
    toggleFaultWithTypeMatch ||
    text.match(/^(?:please\s+)?toggle\s+(?:the\s+)?(?:fault\s+(?:on|at)\s+)(.+)$/i) ||
    text.match(/^(?:please\s+)?toggle\s+(?:the\s+)?(.+?)\s+fault$/i);

  if (toggleFaultTargetMatch && (actions.toggleFault || actions.injectFault)) {
    const faultPhrase = toggleFaultWithTypeMatch ? toggleFaultWithTypeMatch[1] : 'open circuit';
    const rawTarget = toggleFaultWithTypeMatch
      ? toggleFaultWithTypeMatch[2]
      : toggleFaultTargetMatch[1];
    const terminal = resolveFaultTargetPin(rawTarget, pins);
    if (terminal && terminal.id.startsWith('ecu-pin-')) {
      const { faultType, label } = mapFaultPhraseToType(faultPhrase);
      const description = `Voice toggled ${label} on ${terminal.label}`;
      if (actions.toggleFault) {
        const nowActive = actions.toggleFault(terminal.id, faultType, description);
        const stateWord = nowActive === false ? 'Cleared / Toggled OFF' : 'Toggled ON';
        return {
          matched: true,
          category: 'FAULT',
          status: 'EXECUTED',
          actionDescription: `${stateWord} ${label} on ${terminal.label}`,
          spokenReply:
            nowActive === false
              ? `Cleared ${label} fault on ${terminal.spokenLabel}.`
              : `Injected ${label} fault on ${terminal.spokenLabel}.`,
        };
      }
      actions.injectFault?.(terminal.id, faultType, description);
      return {
        matched: true,
        category: 'FAULT',
        status: 'EXECUTED',
        actionDescription: `Injected ${label} on ${terminal.label}`,
        spokenReply: `Injected ${label} fault on ${terminal.spokenLabel}.`,
      };
    }
  }

  // 0g-2. Single-pin Fault removal commands e.g. "remove fault on pin 10", "clear injector fault"
  const removePinFaultMatch =
    text.match(
      /^(?:please\s+)?(?:remove|clear|reset|repair|fix)\s+(?:the\s+)?(?:short\s+to\s+ground|short\s+to\s+(?:12v|vbat|battery|power)|open\s+circuit|high\s+resistance|corrosion)?\s*fault\s+(?:on|at|from)\s+(.+)$/i
    ) ||
    text.match(
      /^(?:please\s+)?(?:remove|clear|reset|repair|fix)\s+(?:the\s+)?(.+?)\s+fault$/i
    );
  if (
    removePinFaultMatch &&
    !/^(?:all|any|the)$/i.test(removePinFaultMatch[1].trim()) &&
    actions.removeFault
  ) {
    const terminal = resolveFaultTargetPin(removePinFaultMatch[1], pins);
    if (terminal && terminal.id.startsWith('ecu-pin-')) {
      actions.removeFault(terminal.id);
      return {
        matched: true,
        category: 'FAULT',
        status: 'EXECUTED',
        actionDescription: `Removed fault on ${terminal.label}`,
        spokenReply: `Cleared fault on ${terminal.spokenLabel}.`,
      };
    }
  }

  // 0g-3. Fault injection commands e.g. "inject short to ground on pin 7", "inject open circuit on injector"
  const faultMatch = text.match(
    /(?:inject|simulate|create|add)\s+(?:a\s+)?(short\s+to\s+ground|short\s+to\s+(?:12v|vbat|battery|power)|open\s+circuit|high\s+resistance|corrosion)\s+(?:on|at|to)\s+(.+)$/i
  );
  if (faultMatch && actions.injectFault) {
    const { faultType, label } = mapFaultPhraseToType(faultMatch[1]);
    const terminal = resolveFaultTargetPin(faultMatch[2], pins);
    if (terminal && terminal.id.startsWith('ecu-pin-')) {
      actions.injectFault(terminal.id, faultType, `Voice injected ${label} on ${terminal.label}`);
      return {
        matched: true,
        category: 'FAULT',
        actionDescription: `Injected ${label} on ${terminal.label}`,
        spokenReply: `Injected ${label} fault on ${terminal.spokenLabel}.`,
      };
    }
  }

  // 0h. Wiring Connection Commands e.g. "connect pin 5 to ground", "wire pin 7 to 12 volts", "jumper pin 5 to tps vcc"
  const wireConnectMatch = text.match(
    /^(?:please\s+)?(?:connect|wire|jumper|link|hook\s+up|bridge)\s+(?!red\s+probe|black\s+probe|com\s+probe|probe\b)(.+?)\s+(?:to|and|with|into)\s+(.+)$/i
  );
  if (wireConnectMatch && actions.connectWire) {
    const source = resolveBenchTerminal(wireConnectMatch[1], pins);
    const target = resolveBenchTerminal(wireConnectMatch[2], pins);

    if (source && target) {
      if (source.id === target.id) {
        return {
          matched: true,
          status: 'FAILED',
          category: 'WIRING',
          actionDescription: `Cannot connect ${source.label} to itself`,
          spokenReply: `Source and target are both ${source.spokenLabel}. Choose two different terminals.`,
        };
      }
      const wireColor = inferWireColor(source, target);
      const wireLabel = `${source.label} -> ${target.label}`;
      actions.connectWire(source.id, target.id, wireColor, wireLabel);
      return {
        matched: true,
        category: 'WIRING',
        actionDescription: `Connected wire: ${wireLabel}`,
        spokenReply: `Connected ${source.spokenLabel} to ${target.spokenLabel}.`,
      };
    }

    const missing = !source ? wireConnectMatch[1].trim() : wireConnectMatch[2].trim();
    return {
      matched: true,
      status: 'FAILED',
      category: 'WIRING',
      actionDescription: `Bench terminal "${missing}" not found in harness map`,
      spokenReply: `Could not locate terminal ${missing} on the bench harness.`,
    };
  }

  // 0i. Wire Cut / Disconnect / Reconnect e.g. "disconnect pin 5", "cut wire pin 9", "reconnect wire pin 9"
  const wireActionMatch = text.match(
    /^(?:please\s+)?(disconnect|remove\s+wire(?:\s+from|\s+on)?|cut(?:\s+wire)?(?:\s+on)?|open\s+wire(?:\s+on)?|reconnect|repair(?:\s+wire)?(?:\s+on)?)\s+(.+)$/i
  );
  if (wireActionMatch && (actions.disconnectWireByPin || actions.toggleCutWireByPin)) {
    const verb = wireActionMatch[1].toLowerCase();
    const terminal = resolveBenchTerminal(wireActionMatch[2], pins);
    if (terminal) {
      if (verb.startsWith('cut') || verb.startsWith('open')) {
        const affected = actions.toggleCutWireByPin?.(terminal.id, true) ?? 0;
        return {
          matched: true,
          status: affected > 0 ? 'EXECUTED' : 'FAILED',
          category: 'WIRING',
          actionDescription:
            affected > 0
              ? `Opened / cut ${affected} wire(s) on ${terminal.label}`
              : `No active wire found on ${terminal.label} to cut`,
          spokenReply:
            affected > 0
              ? `Cut wire on ${terminal.spokenLabel}.`
              : `No wire was connected to ${terminal.spokenLabel}.`,
        };
      }
      if (verb.startsWith('reconnect') || verb.startsWith('repair')) {
        const affected = actions.toggleCutWireByPin?.(terminal.id, false) ?? 0;
        return {
          matched: true,
          status: affected > 0 ? 'EXECUTED' : 'FAILED',
          category: 'WIRING',
          actionDescription:
            affected > 0
              ? `Reconnected ${affected} cut wire(s) on ${terminal.label}`
              : `No cut wire found on ${terminal.label}`,
          spokenReply:
            affected > 0
              ? `Reconnected wire on ${terminal.spokenLabel}.`
              : `No cut wire found on ${terminal.spokenLabel}.`,
        };
      }
      const removed = actions.disconnectWireByPin?.(terminal.id) ?? 0;
      return {
        matched: true,
        status: removed > 0 ? 'EXECUTED' : 'FAILED',
        category: 'WIRING',
        actionDescription:
          removed > 0
            ? `Disconnected ${removed} wire(s) from ${terminal.label}`
            : `No harness wire connected to ${terminal.label}`,
        spokenReply:
          removed > 0
            ? `Disconnected wire from ${terminal.spokenLabel}.`
            : `No harness wire was attached to ${terminal.spokenLabel}.`,
      };
    }
  }

  // 0j. RPM Emulator commands e.g. "set engine rpm to 1150", "set rpm 2500 rpm", "turn rpm emulator on/off"
  const rpmSetMatch =
    text.match(/(?:set|change|crank(?:\s+at)?)\s+(?:engine\s+)?(?:rpm(?:\s+emulator)?\s+)?(?:to\s+)?(\d{3,4})(?:\s*rpm)?\b/i) ||
    text.match(/(\d{3,4})\s*rpm\b/i);
  if (rpmSetMatch && actions.setRpmEmulator) {
    const parsedRpm = parseInt(rpmSetMatch[1], 10);
    const rpm = Math.min(7500, Math.max(100, parsedRpm));
    actions.setRpmEmulator({ isActive: true, rpm });
    return {
      matched: true,
      category: 'RPM',
      actionDescription: `Set Crank/Cam RPM Emulator to ${rpm} RPM`,
      spokenReply: `Crankshaft R P M emulator set to ${rpm} R P M.`,
    };
  }
  const rpmToggleMatch = text.match(/^(?:(?:turn|switch)\s+(?:the\s+)?)?rpm\s+(?:emulator\s+)?(on|off)$/i);
  if (rpmToggleMatch && actions.setRpmEmulator) {
    const active = rpmToggleMatch[1].toLowerCase() === 'on';
    actions.setRpmEmulator({ isActive: active });
    return {
      matched: true,
      category: 'RPM',
      actionDescription: active ? 'Enabled Crank/Cam RPM Emulator' : 'Disabled Crank/Cam RPM Emulator',
      spokenReply: active ? 'R P M emulator enabled.' : 'R P M emulator disabled.',
    };
  }

  // 0k. Macro-friendly ECU Power, Ignition & Ground Shorthands
  // e.g. "Connect Power", "Engage Ignition", "Disengage Ignition", "Connect Ground"
  if (/^(?:please\s+)?connect\s+(?:bench\s+)?(?:battery\s+)?power(?:\s+supply)?$/i.test(text) ||
      /^(?:please\s+)?(?:connect|wire)\s+kl\s*30$/i.test(text)) {
    const kl30Pin = pins.find((p) => p.label.toUpperCase().includes('KL30') || p.pinNumber === 3);
    const pinId = kl30Pin?.id || 'ecu-pin-3';
    const pinLabel = kl30Pin ? `${kl30Pin.label} (Pin ${kl30Pin.pinNumber})` : 'KL30 (Pin 3)';
    actions.connectWire?.(pinId, 'bench-vbat', '#ef4444', `${pinLabel} -> +12V VBat Rail`);
    actions.setPowerSupplyOutput(true);
    return {
      matched: true,
      category: 'POWER',
      status: 'EXECUTED',
      actionDescription: `Connected ${pinLabel} to +12V VBat Rail & enabled PSU output`,
      spokenReply: `Connected battery power to ${pinLabel} and enabled bench power output.`,
    };
  }

  if (/^(?:please\s+)?(?:engage|turn\s+on|connect|enable|switch\s+on)\s+(?:the\s+)?(?:ignition|kl\s*15|ign)$/i.test(text)) {
    const kl15Pin = pins.find((p) => p.label.toUpperCase().includes('KL15') || p.pinNumber === 4);
    const pinId = kl15Pin?.id || 'ecu-pin-4';
    const pinLabel = kl15Pin ? `${kl15Pin.label} (Pin ${kl15Pin.pinNumber})` : 'KL15 (Pin 4)';
    actions.connectWire?.(pinId, 'bench-vbat', '#f59e0b', `${pinLabel} -> +12V Ignition`);
    actions.setPowerSupplyOutput(true);
    return {
      matched: true,
      category: 'POWER',
      status: 'EXECUTED',
      actionDescription: `Engaged Ignition (${pinLabel} -> +12V VBat & PSU ON)`,
      spokenReply: `Ignition engaged on ${pinLabel}.`,
    };
  }

  if (/^(?:please\s+)?(?:disengage|turn\s+off|cut|disable|switch\s+off)\s+(?:the\s+)?(?:ignition|kl\s*15|ign)$/i.test(text)) {
    const kl15Pin = pins.find((p) => p.label.toUpperCase().includes('KL15') || p.pinNumber === 4);
    const pinId = kl15Pin?.id || 'ecu-pin-4';
    const cutCount = actions.toggleCutWireByPin?.(pinId, true) ?? 0;
    const removedCount = cutCount === 0 ? (actions.disconnectWireByPin?.(pinId) ?? 0) : 0;
    const total = cutCount + removedCount;
    return {
      matched: true,
      category: 'POWER',
      status: 'EXECUTED',
      actionDescription:
        total > 0
          ? `Disengaged Ignition on ${kl15Pin ? kl15Pin.label : 'KL15'} (${total} lead(s) opened)`
          : 'Disengaged Ignition (KL15 standby)',
      spokenReply: 'Ignition switched off.',
    };
  }

  if (/^(?:please\s+)?connect\s+(?:chassis\s+|ecu\s+)?ground$/i.test(text) ||
      /^(?:please\s+)?(?:connect|wire)\s+kl\s*31$/i.test(text)) {
    const kl31Pin = pins.find((p) => p.label.toUpperCase().includes('KL31') || p.pinNumber === 1);
    const pinId = kl31Pin?.id || 'ecu-pin-1';
    const pinLabel = kl31Pin ? `${kl31Pin.label} (Pin ${kl31Pin.pinNumber})` : 'KL31 (Pin 1)';
    actions.connectWire?.(pinId, 'chassis-gnd', '#1e293b', `${pinLabel} -> Chassis GND (KL31)`);
    return {
      matched: true,
      category: 'WIRING',
      status: 'EXECUTED',
      actionDescription: `Connected ${pinLabel} to Chassis GND (KL31)`,
      spokenReply: `Connected ${pinLabel} to chassis ground.`,
    };
  }

  // 1a. Bench Power Supply Automotive Presets e.g. "set psu preset to 14.4v charging", "set power supply preset to 10.2v cranking"
  const psuPresetMatch = text.match(
    /(?:set|apply|select|switch)\s+(?:the\s+)?(?:bench\s+)?(?:power\s+supply|psu)\s+preset\s+(?:to\s+)?(.+)$/i
  );
  if (psuPresetMatch) {
    const rawPreset = psuPresetMatch[1].toLowerCase();
    let preset: '12V_BENCH' | '14.4V_RUNNING' | '10.2V_CRANKING' | '5V_LOGIC' | null = null;
    let volts = 12.6;
    let amps = 4.0;
    let label = '12.6V Battery Bench';

    if (rawPreset.includes('14.4') || rawPreset.includes('charg') || rawPreset.includes('running') || rawPreset.includes('chg')) {
      preset = '14.4V_RUNNING';
      volts = 14.4;
      amps = 5.0;
      label = '14.4V Charging Rail';
    } else if (rawPreset.includes('10.2') || rawPreset.includes('crank') || rawPreset.includes('crk')) {
      preset = '10.2V_CRANKING';
      volts = 10.2;
      amps = 8.0;
      label = '10.2V Cranking Sag';
    } else if (rawPreset.includes('5.0') || rawPreset.includes('5v') || rawPreset.includes('logic') || rawPreset.includes('log')) {
      preset = '5V_LOGIC';
      volts = 5.0;
      amps = 2.0;
      label = '5.0V Sensor Logic';
    } else if (rawPreset.includes('12.6') || rawPreset.includes('12v') || rawPreset.includes('bat') || rawPreset.includes('bench')) {
      preset = '12V_BENCH';
      volts = 12.6;
      amps = 4.0;
      label = '12.6V Nominal Battery';
    }

    if (preset) {
      if (actions.setPowerSupplyPreset) {
        actions.setPowerSupplyPreset(preset, volts, amps);
      } else {
        actions.setVoltage(volts);
        actions.setCurrentLimit?.(amps);
      }
      return {
        matched: true,
        category: 'POWER',
        status: 'EXECUTED',
        actionDescription: `Applied PSU Preset: ${label} (${volts.toFixed(1)}V / ${amps.toFixed(1)}A limit)`,
        spokenReply: `Power supply preset set to ${label}, ${volts.toFixed(1)} volts and ${amps.toFixed(1)} amps limit.`,
      };
    }
  }

  // 1b. Set Bench Power Supply Current Limit e.g. "set current limit to 4.0a", "set psu current limit to 2.5 amps"
  const currentLimitMatch =
    text.match(/(?:set|change)\s+(?:the\s+)?(?:power\s+supply\s+|psu\s+)?current(?:\s+limit)?\s+(?:to\s+)?([0-9]+(?:\.[0-9]+)?)\s*(?:a|amps?|amperes?)?/i) ||
    text.match(/current\s+limit\s+(?:to\s+)?([0-9]+(?:\.[0-9]+)?)\s*(?:a|amps?|amperes?)?/i);

  if (currentLimitMatch) {
    const amps = parseFloat(currentLimitMatch[1]);
    if (!isNaN(amps) && amps >= 0.1 && amps <= 10.0) {
      const clampedAmps = Math.max(0.2, Math.min(10.0, parseFloat(amps.toFixed(2))));
      actions.setCurrentLimit?.(clampedAmps);
      return {
        matched: true,
        category: 'POWER',
        status: 'EXECUTED',
        actionDescription: `Set power supply current limit to ${clampedAmps.toFixed(1)}A`,
        spokenReply: `Power supply current limit set to ${clampedAmps.toFixed(1)} amps.`,
      };
    }
  }

  // 1. Set Bench Power Supply Voltage e.g. "set voltage to 12 volts", "set 12v", "change voltage to 5V", "set power supply to 13.8"
  const voltageMatch =
    text.match(/(?:set|change)\s+(?:power\s+supply\s+|psu\s+)?voltage\s+(?:to\s+)?([0-9]+(?:\.[0-9]+)?)/i) ||
    text.match(/(?:set|change)\s+(?:power\s+supply|psu)\s+(?:to\s+)?([0-9]+(?:\.[0-9]+)?)\s*(?:v|volts?)?/i) ||
    text.match(/voltage\s+([0-9]+(?:\.[0-9]+)?)\s*(?:v|volts?)?/i) ||
    text.match(/set\s+(?:to\s+)?([0-9]+(?:\.[0-9]+)?)\s*(?:v|volts?)/i);

  if (voltageMatch) {
    const volts = parseFloat(voltageMatch[1]);
    if (!isNaN(volts) && volts >= 0 && volts <= 30) {
      actions.setVoltage(volts);
      return {
        matched: true,
        category: 'POWER',
        actionDescription: `Set power supply voltage to ${volts.toFixed(1)}V`,
        spokenReply: `Power supply voltage adjusted to ${volts.toFixed(1)} volts.`,
      };
    }
  }

  // 2. Reset Lab e.g. "reset lab", "reset circuit", "reset bench"
  if (/reset\s+(?:lab|circuit|bench|session)/i.test(text) || /restart\s+(?:lab|bench)/i.test(text)) {
    actions.resetLab();
    return {
      matched: true,
      actionDescription: 'Reset laboratory to pristine factory state',
      spokenReply: 'Laboratory reset to initial factory bench state.',
    };
  }

  // 2b. Clear Faults e.g. "clear faults", "clear dtc", "remove faults"
  if (actions.clearFaults && /(?:clear|remove)\s+(?:all\s+)?(?:faults?|dtcs?|codes?)/i.test(text)) {
    actions.clearFaults();
    return {
      matched: true,
      actionDescription: 'Cleared all injected bench faults',
      spokenReply: 'Cleared all injected faults from the ECU bench.',
    };
  }

  // 2c. Live MNA Meter & Status Readout e.g. "read meter", "check voltage", "bench status"
  if (
    actions.readMeter &&
    /(?:read|check|what\s+is)\s+(?:the\s+)?(?:meter|multimeter|voltage|reading|status|bench|dtc)/i.test(text)
  ) {
    const snap = actions.readMeter();
    const powerDesc = snap.isPowerOn
      ? `Power supply on at ${snap.supplyVolts.toFixed(1)} volts drawing ${snap.supplyAmps.toFixed(2)} amps`
      : 'Power supply is currently off';
    const dtcDesc =
      snap.dtcCount === 0
        ? 'No active DTCs.'
        : `${snap.dtcCount} active DTC${snap.dtcCount === 1 ? '' : 's'}.`;
    return {
      matched: true,
      actionDescription: `DMM: ${snap.display} ${snap.unit} · PSU: ${snap.isPowerOn ? `${snap.supplyVolts.toFixed(1)}V` : 'OFF'} · ${snap.dtcCount} DTC`,
      spokenReply: `${powerDesc}. Multimeter reads ${snap.display} ${snap.unit}. ${dtcDesc}`,
    };
  }

  // 3. Power Supply Toggle e.g. "turn power supply on", "disable power supply", "turn output off"
  if (/(?:turn\s+(?:power\s+supply\s+)?|power\s+)(on|enable)/i.test(text)) {
    actions.setPowerSupplyOutput(true);
    return {
      matched: true,
      actionDescription: 'Enabled bench power supply output',
      spokenReply: 'Bench power supply output enabled.',
    };
  }
  if (/(?:turn\s+(?:power\s+supply\s+)?|power\s+)(off|disable)/i.test(text) || /cut\s+power/i.test(text)) {
    actions.setPowerSupplyOutput(false);
    return {
      matched: true,
      actionDescription: 'Disabled bench power supply output',
      spokenReply: 'Bench power supply output disabled.',
    };
  }

  // 4. Attach Red Probe to Terminal/Pin e.g. "attach probe to pin 7", "probe pin 15", "attach red probe to tps signal"
  const namedProbeMatch = text.match(
    /(?:attach|connect|put|place|move)\s+(?:the\s+)?(?:red\s+)?probe\s+(?:to\s+)?(.+)$/i
  );
  if (namedProbeMatch) {
    const terminal = resolveBenchTerminal(namedProbeMatch[1], pins);
    if (terminal) {
      actions.attachProbeToPin(terminal.id, terminal.label);
      return {
        matched: true,
        actionDescription: `Attached DMM red probe to ${terminal.label}`,
        spokenReply: `Attached multimeter red probe to ${terminal.spokenLabel}.`,
      };
    }
  }

  const pinMatch =
    text.match(/(?:attach|connect)?\s*(?:red\s+)?probe\s+(?:to\s+)?(?:pin\s+)?([0-9]+)/i) ||
    text.match(/probe\s+pin\s+([0-9]+)/i) ||
    text.match(/pin\s+([0-9]+)\s+probe/i);

  if (pinMatch) {
    const pinNumStr = pinMatch[1];
    const pinNum = parseInt(pinNumStr, 10);
    const targetPin = pins.find((p) => p.pinNumber === pinNum || p.id.endsWith(`-${pinNum}`));
    if (targetPin) {
      actions.attachProbeToPin(targetPin.id, `${targetPin.label} (#${targetPin.pinNumber})`);
      return {
        matched: true,
        actionDescription: `Attached DMM red probe to Pin #${targetPin.pinNumber} (${targetPin.label})`,
        spokenReply: `Attached multimeter probe to pin ${targetPin.pinNumber}, ${targetPin.label}.`,
      };
    } else {
      return {
        matched: true,
        status: 'FAILED',
        category: 'PROBES',
        actionDescription: `Pin #${pinNum} not found in ECU pinout map`,
        spokenReply: `Pin number ${pinNum} was not found in the ECU pinout library.`,
      };
    }
  }

  // 5. Bench Pane Switcher (mobile & desktop quick navigation)
  if (
    actions.switchMobilePane &&
    /(?:show|open|go\s+to|focus|switch\s+to)\s+(?:the\s+)?(?:instruments?|multimeter|power\s+supply|fault\s+matrix|rack)/i.test(text)
  ) {
    actions.switchTab('BENCH_LAB');
    actions.switchMobilePane('INSTRUMENTS');
    return {
      matched: true,
      actionDescription: 'Focused Bench Instrument Panels',
      spokenReply: 'Showing bench instrument panels.',
    };
  }
  if (
    actions.switchMobilePane &&
    /(?:show|focus|switch\s+to|go\s+to)\s+(?:the\s+)?(?:harness\s+)?(?:canvas|wires?)/i.test(text)
  ) {
    actions.switchTab('BENCH_LAB');
    actions.switchMobilePane('CANVAS');
    return {
      matched: true,
      actionDescription: 'Focused Harness Wiring Canvas',
      spokenReply: 'Showing harness wiring canvas.',
    };
  }
  if (
    actions.switchMobilePane &&
    /(?:show|open|focus|switch\s+to|go\s+to|start|enable)\s+(?:the\s+)?(?:automated\s+)?(?:logic\s+check|pin\s+logic(?:\s+monitor)?|monitor\s+pin\s+logic)/i.test(text)
  ) {
    actions.switchTab('BENCH_LAB');
    actions.openLogicCheck?.();
    actions.switchMobilePane('GUIDE');
    return {
      matched: true,
      category: 'DIAGNOSTIC',
      actionDescription: 'Opened Automated Multi-Pin Logic Check monitor',
      spokenReply: 'Opening automated multi-pin logic check monitor.',
    };
  }
  if (
    actions.switchMobilePane &&
    /(?:show|open|focus|switch\s+to|go\s+to)\s+(?:the\s+)?(?:(?:diagnostic|pre[\s-]*bench)\s+(?:workflow|checklist)|workflow|checklist)/i.test(text)
  ) {
    actions.switchTab('BENCH_LAB');
    actions.openDiagnosticWorkflow?.();
    actions.switchMobilePane('GUIDE');
    return {
      matched: true,
      category: 'NAVIGATION',
      actionDescription: 'Opened Pre-Bench Diagnostic Workflow checklist',
      spokenReply: 'Opening diagnostic workflow checklist.',
    };
  }

  // 5b. Diagnostic Workflow checklist check-off & verification commands
  if (
    actions.checkPassingWorkflow &&
    /(?:check\s+passing(?:\s+workflow|\s+steps)?|auto[\s-]*verify\s+(?:passing|workflow)|verify\s+passing\s+steps)/i.test(text)
  ) {
    const added = actions.checkPassingWorkflow();
    const countSuffix = typeof added === 'number' ? ` (${added} passing step${added === 1 ? '' : 's'} checked)` : '';
    return {
      matched: true,
      category: 'DIAGNOSTIC',
      actionDescription: `Verified passing Diagnostic Workflow steps${countSuffix}`,
      spokenReply:
        typeof added === 'number' && added > 0
          ? `Checked ${added} passing diagnostic workflow ${added === 1 ? 'step' : 'steps'}.`
          : 'All currently passing workflow steps are checked.',
    };
  }

  if (
    actions.resetWorkflow &&
    /(?:reset|clear)\s+(?:the\s+)?(?:diagnostic\s+)?(?:workflow|checklist)/i.test(text)
  ) {
    actions.resetWorkflow();
    return {
      matched: true,
      category: 'DIAGNOSTIC',
      actionDescription: 'Reset Diagnostic Workflow checklist',
      spokenReply: 'Reset diagnostic workflow checklist.',
    };
  }

  const workflowUncheckMatch = text.match(
    /^(?:please\s+)?(?:uncheck|clear|unmark)\s+(?:workflow\s+)?(?:step\s+)?(.+)$/i
  );
  if (workflowUncheckMatch && actions.toggleWorkflowStep) {
    const step = parseWorkflowStepTarget(workflowUncheckMatch[1]);
    if (step) {
      actions.toggleWorkflowStep(step.id, false);
      return {
        matched: true,
        category: 'DIAGNOSTIC',
        actionDescription: `Unchecked workflow step ${String(step.order).padStart(2, '0')}: ${step.title}`,
        spokenReply: `Unchecked step ${step.order}, ${step.title}.`,
      };
    }
  }

  // Trouble Scenario step completion commands checked before Pre-Bench Workflow check-off
  const completeSpecificScenarioStepMatch =
    text.match(
      /^(?:please\s+)?(?:complete|finish|mark)\s+(?:scenario|diagnostic|trouble)\s+step\s+#?(\d+)(?:\s+(?:as\s+)?(?:complete|completed|done|finished))?$/i
    );
  if (completeSpecificScenarioStepMatch && actions.completeScenarioStep) {
    const stepNum = parseInt(completeSpecificScenarioStepMatch[1], 10);
    const res = actions.completeScenarioStep(stepNum);
    return {
      matched: true,
      category: 'DIAGNOSTIC',
      actionDescription: res?.actionDescription || `Marked Trouble Scenario step ${stepNum} completed`,
      spokenReply: res?.spokenReply || `Step ${stepNum} marked complete.`,
      scenarioPhId: res?.scenarioPhId,
      scenarioStepNumber: res?.scenarioStepNumber ?? stepNum,
      guidanceKind: res?.guidanceKind ?? 'STEP_COMPLETED',
      alreadySpoken: res?.alreadySpoken,
    };
  }

  if (
    actions.completeScenarioStep &&
    /^(?:please\s+)?(?:(?:mark|set)\s+(?:the\s+|current\s+|this\s+|active\s+|scenario\s+|diagnostic\s+)?step\s+(?:as\s+)?(?:complete|completed|done|finished)|(?:complete|finish)\s+(?:the\s+|current\s+|this\s+|active\s+|scenario\s+|diagnostic\s+)?step|(?:current\s+|this\s+)?step\s+(?:is\s+)?(?:complete|completed|done|finished)|done\s+with\s+(?:this|current|the)\s+step)$/i.test(
      text
    )
  ) {
    const res = actions.completeScenarioStep();
    return {
      matched: true,
      category: 'DIAGNOSTIC',
      actionDescription: res?.actionDescription || 'Marked current Trouble Scenario diagnostic step completed',
      spokenReply: res?.spokenReply || 'Current diagnostic step marked complete.',
      scenarioPhId: res?.scenarioPhId,
      scenarioStepNumber: res?.scenarioStepNumber,
      guidanceKind: res?.guidanceKind ?? 'STEP_COMPLETED',
      alreadySpoken: res?.alreadySpoken,
    };
  }

  const workflowCheckMatch =
    text.match(/^(?:please\s+)?(?:check\s+off|check|tick|complete)\s+(?:workflow\s+)?(step\s+#?\d+|.+)$/i) ||
    text.match(/^(?:please\s+)?mark\s+(?:workflow\s+)?(.+?)\s+(?:as\s+)?(?:complete|completed|done|checked|verified)$/i) ||
    text.match(/^(?:please\s+)?(verify\s+(?:battery\s+voltage|pinout\s+continuity|wiring\s+integrity|sensor\s+grounds|repair))$/i);
  if (workflowCheckMatch && actions.toggleWorkflowStep) {
    const step = parseWorkflowStepTarget(workflowCheckMatch[1]);
    if (step) {
      actions.toggleWorkflowStep(step.id, true);
      return {
        matched: true,
        category: 'DIAGNOSTIC',
        actionDescription: `Checked workflow step ${String(step.order).padStart(2, '0')}: ${step.title}`,
        spokenReply: `Marked step ${step.order}, ${step.title}, complete.`,
      };
    }
  }

  if (
    actions.switchMobilePane &&
    /(?:show|open|focus|switch\s+to|go\s+to)\s+(?:the\s+)?(?:5[\s-]*step\s+)?(?:diagnostic\s+)?guide/i.test(text)
  ) {
    actions.switchTab('BENCH_LAB');
    actions.switchMobilePane('GUIDE');
    return {
      matched: true,
      actionDescription: 'Focused 5-Step ECU Diagnostic Guide',
      spokenReply: 'Showing 5-step diagnostic guide.',
    };
  }

  // 5c. Trouble Scenarios Lookup & Interactive Step-by-Step Voice Coach commands
  if (
    actions.nextScenarioStep &&
    /^(?:please\s+)?(?:next\s+(?:diagnostic\s+|scenario\s+)?step|advance\s+step|step\s+forward|continue\s+(?:walkthrough|scenario|guide))$/i.test(
      text
    )
  ) {
    const res = actions.nextScenarioStep();
    return {
      matched: true,
      category: 'DIAGNOSTIC',
      actionDescription: res?.actionDescription || 'Advanced to next Trouble Scenario diagnostic step',
      spokenReply: res?.spokenReply || 'Moving to the next diagnostic step.',
      scenarioPhId: res?.scenarioPhId,
      scenarioStepNumber: res?.scenarioStepNumber,
      guidanceKind: res?.guidanceKind ?? 'STEP_GUIDANCE',
      alreadySpoken: res?.alreadySpoken,
    };
  }

  if (
    actions.prevScenarioStep &&
    /^(?:please\s+)?(?:(?:previous|prev|back|prior)\s+(?:diagnostic\s+|scenario\s+)?step|step\s+back)$/i.test(
      text
    )
  ) {
    const res = actions.prevScenarioStep();
    return {
      matched: true,
      category: 'DIAGNOSTIC',
      actionDescription: res?.actionDescription || 'Moved to previous Trouble Scenario diagnostic step',
      spokenReply: res?.spokenReply || 'Returning to the previous diagnostic step.',
      scenarioPhId: res?.scenarioPhId,
      scenarioStepNumber: res?.scenarioStepNumber,
      guidanceKind: res?.guidanceKind ?? 'STEP_GUIDANCE',
      alreadySpoken: res?.alreadySpoken,
    };
  }

  const readSpecificStepMatch = text.match(
    /^(?:please\s+)?(?:read|speak|repeat|start|go\s+to)\s+(?:diagnostic\s+|scenario\s+)?step\s+#?(\d+)$/i
  );
  if (readSpecificStepMatch && actions.repeatScenarioStep) {
    const stepNum = parseInt(readSpecificStepMatch[1], 10);
    const res = actions.repeatScenarioStep(stepNum);
    return {
      matched: true,
      category: 'DIAGNOSTIC',
      actionDescription: res?.actionDescription || `Read Trouble Scenario step ${stepNum}`,
      spokenReply: res?.spokenReply || `Reading diagnostic step ${stepNum}.`,
      scenarioPhId: res?.scenarioPhId,
      scenarioStepNumber: res?.scenarioStepNumber ?? stepNum,
      guidanceKind: res?.guidanceKind ?? 'STEP_GUIDANCE',
      alreadySpoken: res?.alreadySpoken,
    };
  }

  if (
    actions.repeatScenarioStep &&
    /^(?:please\s+)?(?:(?:repeat|read|speak)\s+(?:current\s+|this\s+)?(?:diagnostic\s+|scenario\s+)?step|(?:start|begin|play)\s+(?:voice\s+)?(?:walkthrough|coach|scenario\s+guide))$/i.test(
      text
    )
  ) {
    const res = actions.repeatScenarioStep();
    return {
      matched: true,
      category: 'DIAGNOSTIC',
      actionDescription: res?.actionDescription || 'Speaking active Trouble Scenario step guidance',
      spokenReply: res?.spokenReply || 'Reading current scenario diagnostic step.',
      scenarioPhId: res?.scenarioPhId,
      scenarioStepNumber: res?.scenarioStepNumber,
      guidanceKind: res?.guidanceKind ?? 'STEP_GUIDANCE',
      alreadySpoken: res?.alreadySpoken,
    };
  }

  if (
    actions.verifyScenarioStep &&
    /^(?:please\s+)?(?:(?:verify|check)\s+(?:my\s+|current\s+|this\s+|the\s+|scenario\s+)?(?:step|probe|bench(?:\s+state)?)|compare\s+(?:my\s+|the\s+)?(?:probe|reading|scenario))$/i.test(
      text
    )
  ) {
    const res = actions.verifyScenarioStep();
    return {
      matched: true,
      category: 'DIAGNOSTIC',
      actionDescription: res?.actionDescription || 'Verified live DMM probe and bench telemetry against active scenario step',
      spokenReply: res?.spokenReply || 'Verifying live probe placement and multimeter telemetry against the active scenario.',
      scenarioPhId: res?.scenarioPhId,
      scenarioStepNumber: res?.scenarioStepNumber,
      guidanceKind: res?.guidanceKind ?? 'VERIFICATION',
      alreadySpoken: res?.alreadySpoken,
    };
  }

  if (
    actions.probeScenarioFocusPin &&
    /^(?:please\s+)?(?:probe|attach\s+probe\s+to|test)\s+(?:the\s+)?(?:scenario\s+)?focus\s+pin$/i.test(
      text
    )
  ) {
    const res = actions.probeScenarioFocusPin();
    return {
      matched: true,
      category: 'PROBES',
      actionDescription: res?.actionDescription || 'Attached Red (+) DMM probe to scenario focus pin',
      spokenReply: res?.spokenReply || 'Attached red multimeter probe to the scenario focus pin.',
      scenarioPhId: res?.scenarioPhId,
      scenarioStepNumber: res?.scenarioStepNumber,
      guidanceKind: res?.guidanceKind ?? 'BENCH_ACTION',
      alreadySpoken: res?.alreadySpoken,
    };
  }

  const emulatePhMatch = text.match(
    /^(?:please\s+)?(?:emulate|load|activate|simulate|run)\s+(?:trouble\s+)?(?:scenario\s+)?(ph-\d{3,4})\b/i
  );
  if (emulatePhMatch && actions.emulateTroubleScenario) {
    const targetPh = emulatePhMatch[1].toUpperCase();
    const res = actions.emulateTroubleScenario(targetPh);
    return {
      matched: true,
      category: 'FAULT',
      actionDescription: res?.actionDescription || `Emulated Trouble Scenario ${targetPh} on 16-pin bench`,
      spokenReply: res?.spokenReply || `Emulating trouble scenario ${targetPh} on the virtual bench.`,
      scenarioPhId: res?.scenarioPhId ?? targetPh,
      scenarioStepNumber: res?.scenarioStepNumber,
      guidanceKind: res?.guidanceKind ?? 'BENCH_ACTION',
      alreadySpoken: res?.alreadySpoken,
    };
  }

  if (
    actions.emulateTroubleScenario &&
    /^(?:please\s+)?(?:emulate|load|activate|simulate)\s+(?:this\s+|current\s+|selected\s+|active\s+)?(?:trouble\s+)?scenario$/i.test(
      text
    )
  ) {
    const res = actions.emulateTroubleScenario();
    return {
      matched: true,
      category: 'FAULT',
      actionDescription: res?.actionDescription || 'Emulated selected Trouble Scenario on 16-pin bench',
      spokenReply: res?.spokenReply || 'Emulating the selected trouble scenario on the virtual bench.',
      scenarioPhId: res?.scenarioPhId,
      scenarioStepNumber: res?.scenarioStepNumber,
      guidanceKind: res?.guidanceKind ?? 'BENCH_ACTION',
      alreadySpoken: res?.alreadySpoken,
    };
  }

  const lookupScenarioMatch =
    text.match(
      /^(?:please\s+)?(?:look\s*up|search(?:\s+for)?|find|open|show|inspect)\s+(?:trouble\s+)?(?:scenario\s+)?(ph-\d{3,4})\b/i
    ) ||
    text.match(
      /^(?:please\s+)?(?:open|show)\s+(?:the\s+)?trouble\s+(?:scenarios?\s+)?lookup(?:\s+for\s+(.+))?$/i
    );
  if (lookupScenarioMatch && actions.openTroubleLookup) {
    const q = (lookupScenarioMatch[1] || '').trim();
    const res = actions.openTroubleLookup(q || undefined);
    return {
      matched: true,
      category: 'NAVIGATION',
      actionDescription:
        res?.actionDescription ||
        (q ? `Opened Trouble Scenarios Lookup for "${q.toUpperCase()}"` : 'Opened Trouble Scenarios Lookup Drawer'),
      spokenReply:
        res?.spokenReply ||
        (q ? `Opening trouble scenarios lookup for ${q.toUpperCase()}.` : 'Opening trouble scenarios lookup drawer.'),
      scenarioPhId: res?.scenarioPhId,
      scenarioStepNumber: res?.scenarioStepNumber,
      guidanceKind: res?.guidanceKind ?? 'BRIEFING',
      alreadySpoken: res?.alreadySpoken,
    };
  }

  // 6. Switch Tabs / Open Workspace Views
  if (/(?:open|show|switch\s+to)\s+(?:the\s+)?(?:oscilloscope|scope)/i.test(text)) {
    actions.switchTab('OSCILLOSCOPE');
    return { matched: true, actionDescription: 'Opened Oscilloscope workspace', spokenReply: 'Switching to digital oscilloscope.' };
  }
  if (/(?:open|show|switch\s+to)\s+(?:the\s+)?(?:pcb\s+scanner|scanner|board)/i.test(text)) {
    actions.switchTab('PCB_SCANNER');
    return { matched: true, actionDescription: 'Opened PCB Scanner workspace', spokenReply: 'Switching to PCB vision scanner.' };
  }
  if (/(?:open|show|switch\s+to)\s+(?:the\s+)?(?:repair\s+guide|manuals?|knowledge\s+base)/i.test(text)) {
    actions.switchTab('REPAIR_GUIDE');
    return { matched: true, actionDescription: 'Opened ECU Repair Knowledge Base', spokenReply: 'Opening ECU repair knowledge base and diagnostic manuals.' };
  }
  if (/(?:open|show|switch\s+to)\s+(?:the\s+)?(?:pinout|ecu\s+pins?)/i.test(text)) {
    actions.switchTab('ECU_PINOUT');
    return { matched: true, actionDescription: 'Opened ECU Pinout Library', spokenReply: 'Opening ECU connector pinout library.' };
  }
  if (/(?:open|show|switch\s+to)\s+(?:the\s+)?(?:wiring|diagram|canvas)/i.test(text)) {
    actions.switchTab('WIRING_DIAGRAM');
    return { matched: true, actionDescription: 'Opened Wiring Harness Canvas', spokenReply: 'Opening interactive wiring canvas.' };
  }
  if (/(?:open|show|switch\s+to)\s+(?:the\s+)?(?:3d\s+bench|3\s*d\s+bench|twin|hardware)/i.test(text)) {
    actions.switchTab('THREE_D_TWIN');
    return { matched: true, actionDescription: 'Opened 3D Bench Twin workspace', spokenReply: 'Switching to Three D bench hardware twin.' };
  }
  if (/(?:open|show|switch\s+to)\s+(?:the\s+)?(?:bench|lab|simulator)/i.test(text)) {
    actions.switchTab('BENCH_LAB');
    return { matched: true, actionDescription: 'Opened Main Bench Lab', spokenReply: 'Returning to main bench laboratory.' };
  }

  // 7. Table 16 OBD-II / Legacy DLC Voice Lookup
  if (/(?:dlc|obd[\s-]*2|obd[\s-]*ii|consult|mut[\s-]*2|mut[\s-]*ii|sdl|tdcl|scs)/i.test(text)) {
    const matchedDlc =
      TABLE16_DLC_INTERFACES.find((d) => text.includes(d.brandKey.split('-')[0])) ||
      TABLE16_DLC_INTERFACES.find((d) => d.brandKey === 'universal-bench');
    if (matchedDlc) {
      return {
        matched: true,
        actionDescription: `Table 16 DLC · ${matchedDlc.brandLabel}: ${matchedDlc.obd2Pins}`,
        spokenReply: matchedDlc.voiceSummary,
      };
    }
  }

  // 8. Restricted PART_METADATA_ONLY / MECHANICAL_NO_ECU Anti-Fabrication Guardrail
  const restrictedMatches = matchRestrictedModelsForQuery(text);
  if (restrictedMatches.length > 0 && /(?:pin|pinout|wiring|ecu|bench|check|guide)/i.test(text)) {
    const first = restrictedMatches[0];
    return {
      matched: true,
      actionDescription: `${first.brandLabel} ${first.modelName} [${first.status}]: ${first.oemControllerNote}`,
      spokenReply:
        first.status === 'MECHANICAL_NO_ECU'
          ? `${first.brandLabel} ${first.modelName} uses mechanical injection and has no Engine ECU.`
          : `${first.brandLabel} ${first.modelName} is metadata only. Verified factory pin numbers are unavailable, so no pinout will be fabricated.`,
    };
  }

  // 9. Verified Voice-Ready ECU Bench Guide Match
  const guideStopWords = new Set([
    'denso',
    'honda',
    'toyota',
    'nissan',
    'ford',
    'hyundai',
    'isuzu',
    'suzuki',
    'mitsubishi',
    'keihin',
    'hitachi',
    'fomoco',
    'continental',
    'ecm',
    'ecu',
    'pcm',
    'bench',
    'pins',
    'grid',
    'boot',
    'protocol',
    'dual',
    'vvt-i',
    'common',
    'rail',
    'only',
    'trucks',
    'revisions',
    'hardware',
    '2014',
    'legacy',
    'euro-5',
    'euro-4',
    'and',
    'the',
    'for',
    'with',
    'connector',
    'models',
  ]);
  const allowedShortTokens = new Set(['t6', 'na', 'ph']);

  let bestGuide: (typeof VERIFIED_VOICE_ECU_GUIDES)[number] | undefined;
  let bestScore = 0;

  const queryWords = new Set(text.split(/[\s/,()[\]&+]+/).filter(Boolean));
  const querySubWords = new Set(text.split(/[\s/,()[\]&+-]+/).filter(Boolean));

  for (const g of VERIFIED_VOICE_ECU_GUIDES) {
    const baseTokens = [
      ...g.ecuName.toLowerCase().split(/[\s/,()[\]&]+/),
      ...g.models.join(' ').toLowerCase().split(/[\s/,()[\]&]+/),
    ];
    const subTokens = baseTokens.flatMap((t) => (t.includes('-') ? [t, ...t.split('-')] : [t]));
    const rawTokens = subTokens.filter(
      (t) => (t.length >= 3 || allowedShortTokens.has(t)) && !guideStopWords.has(t) && t !== 'ftv'
    );

    const uniqueTokens = Array.from(new Set(rawTokens));
    let score = 0;
    for (const tok of uniqueTokens) {
      if (tok.length <= 2) {
        if (queryWords.has(tok) || querySubWords.has(tok)) score += 3;
      } else if (queryWords.has(tok) || querySubWords.has(tok)) {
        score += 3;
      } else if (text.includes(tok)) {
        score += 2;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestGuide = g;
    }
  }

  if (
    bestGuide &&
    bestGuide.status === 'VERIFIED' &&
    bestScore >= 3 &&
    /(?:pin|pinout|bench|boot|guide|wakeup|wake\s*up|ecu|pcm|tcm|power|ignition|ground|connect|wiring)/i.test(text)
  ) {
    const gateSuffix = bestGuide.ocrVerifyGate ? ` | ${bestGuide.ocrVerifyGate}` : '';
    return {
      matched: true,
      actionDescription: `${bestGuide.brandLabel} ${bestGuide.ecuName} (${bestGuide.tableRef}): ${bestGuide.keyBenchPins}${gateSuffix}`,
      spokenReply: bestGuide.voicePrompt,
    };
  }

  // 9b. Voice Query for OEM PCB Hardware Layouts & Component Specifications
  if (/(?:pcb|component|spec|specs|chip|mcu|ic|mosfet|transceiver|capacitor|crystal|resistor|board)/i.test(text)) {
    const pcbResults = searchOemPcbHardwareSpecs(text);
    if (pcbResults.length > 0) {
      const topPcb = pcbResults[0];
      return {
        matched: true,
        actionDescription: `${topPcb.platformName} PCB Specs (${topPcb.boardPartNumbers.join(', ')}): MCU ${topPcb.mcuArchitecture} | Bulk Caps: ${topPcb.bulkCapacitors} | Clock: ${topPcb.crystalFrequency}`,
        spokenReply: topPcb.voiceSummary,
      };
    }
  }

  // 10. Hardware-Conflict / OCR_VERIFY Voice Gate
  const safetyGates = matchSafetyGatesForQuery(text);
  if (safetyGates.length > 0 && /(?:pin|pinout|verify|check|energize|probe|guide|bench|ecu|volt)/i.test(text)) {
    const primary = safetyGates[0];
    return {
      matched: true,
      actionDescription: `${primary.title}: ${primary.prompt}`,
      spokenReply: primary.spokenAlert,
    };
  }

  if (
    bestGuide &&
    bestScore > 0 &&
    /(?:pin|pinout|bench|boot|guide|wakeup|wake\s*up|ecu|pcm|tcm|power|ignition|ground|connect|wiring)/i.test(text)
  ) {
    return {
      matched: true,
      actionDescription: `${bestGuide.brandLabel} ${bestGuide.ecuName} (${bestGuide.tableRef}): ${bestGuide.keyBenchPins}`,
      spokenReply: bestGuide.voicePrompt,
    };
  }

  return {
    matched: false,
    actionDescription: '',
    spokenReply: '',
  };
}

const NOOP_VOICE_ACTIONS: VoiceCommandActions = {
  setVoltage: () => {},
  setCurrentLimit: () => {},
  setPowerSupplyPreset: () => {},
  resetLab: () => {},
  attachProbeToPin: () => {},
  attachBlackProbeToPin: () => {},
  swapProbes: () => {},
  disconnectProbes: () => {},
  setMultimeterState: () => {},
  connectWire: () => true,
  disconnectWireByPin: () => 1,
  toggleCutWireByPin: () => 1,
  injectFault: () => {},
  toggleFault: () => true,
  removeFault: () => true,
  setRpmEmulator: () => {},
  clearFaults: () => {},
  readMeter: () => ({
    display: '0.00',
    unit: 'V DC',
    dtcCount: 0,
    supplyVolts: 12.6,
    isPowerOn: true,
    supplyAmps: 0.25,
  }),
  setPowerSupplyOutput: () => {},
  switchTab: () => {},
  switchMobilePane: () => {},
  openDiagnosticWorkflow: () => {},
  openLogicCheck: () => {},
  toggleWorkflowStep: () => {},
  checkPassingWorkflow: () => 0,
  resetWorkflow: () => {},
  openTroubleLookup: () => {},
  emulateTroubleScenario: () => {},
  nextScenarioStep: () => {},
  prevScenarioStep: () => {},
  repeatScenarioStep: () => {},
  verifyScenarioStep: () => {},
  probeScenarioFocusPin: () => {},
};

/**
 * Dry-run parses a single macro instruction without mutating bench state.
 * Used by the Macro Builder to verify SpeechRecognition/command phrasing live.
 */
export function previewMacroStep(
  instruction: string,
  pins: EcuPin[]
): CommandExecutionResult {
  const trimmed = instruction.trim();
  if (!trimmed) {
    return {
      matched: false,
      actionDescription: 'Empty step',
      spokenReply: '',
      normalizedTranscript: '',
      category: 'DIAGNOSTIC',
      status: 'UNRECOGNIZED',
    };
  }
  return parseAndExecuteVoiceCommand(trimmed, pins, NOOP_VOICE_ACTIONS);
}

/**
 * Executes a custom voice macro's ordered instructions sequentially against live MNA bench actions.
 */
export function executeMacroSequence(
  macro: { name: string; triggerPhrase: string; steps: string[] },
  pins: EcuPin[],
  actions: VoiceCommandActions
): MacroExecutionResult {
  const stepResults: MacroStepResult[] = [];
  let executedCount = 0;
  let failedCount = 0;
  let unrecognizedCount = 0;

  for (const rawStep of macro.steps) {
    const trimmedStep = rawStep.trim();
    if (!trimmedStep) continue;

    const result = parseAndExecuteVoiceCommand(trimmedStep, pins, actions);
    const status: VoiceCommandStatus =
      result.status ?? (result.matched ? 'EXECUTED' : 'UNRECOGNIZED');
    const category: VoiceCommandCategory = result.category ?? 'DIAGNOSTIC';

    if (result.matched && status === 'EXECUTED') {
      executedCount += 1;
    } else if (result.matched && status === 'FAILED') {
      failedCount += 1;
    } else {
      unrecognizedCount += 1;
    }

    stepResults.push({
      instruction: trimmedStep,
      matched: result.matched,
      status,
      actionDescription:
        result.actionDescription || `Unrecognized instruction: "${trimmedStep}"`,
      spokenReply: result.spokenReply,
      category,
    });
  }

  const totalSteps = stepResults.length;
  const overallStatus: VoiceCommandStatus =
    totalSteps === 0
      ? 'UNRECOGNIZED'
      : failedCount === 0 && unrecognizedCount === 0
      ? 'EXECUTED'
      : 'FAILED';

  const stepSummary =
    stepResults.length > 0
      ? stepResults
          .map((step, index) => `${index + 1}. ${step.actionDescription}`)
          .join(' · ')
      : 'Macro contains no executable steps.';

  const actionDescription = `Macro "${macro.name}" (${executedCount}/${totalSteps} steps): ${stepSummary}`;
  const spokenReply =
    overallStatus === 'EXECUTED'
      ? `Executed macro ${macro.name}. Completed ${executedCount} ${executedCount === 1 ? 'step' : 'steps'}.`
      : `Macro ${macro.name} finished with ${executedCount} of ${totalSteps} steps executed and ${failedCount + unrecognizedCount} issue${failedCount + unrecognizedCount === 1 ? '' : 's'}.`;

  return {
    matched: true,
    macroName: macro.name,
    triggerPhrase: macro.triggerPhrase,
    stepResults,
    executedCount,
    failedCount,
    unrecognizedCount,
    status: overallStatus,
    actionDescription,
    spokenReply,
  };
}

