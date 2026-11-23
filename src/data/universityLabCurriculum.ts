import type {
  FaultType,
  InjectedFault,
  MultimeterMode,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import type { BenchTroubleFaultSpec, BenchTroubleScenario } from '../simulation/faults/benchTroubleScenarios';

export type UniversityDifficultyTier =
  | 'LEVEL_1_BEGINNER'
  | 'LEVEL_2_INTERMEDIATE'
  | 'LEVEL_3_ADVANCED';

export interface UniversityTierMeta {
  id: UniversityDifficultyTier;
  shortLabel: string;
  titleTaglish: string;
  subtitleTaglish: string;
  accentTone: 'emerald' | 'amber' | 'rose';
  curriculumTopics: readonly string[];
}

export const UNIVERSITY_TIER_META: readonly UniversityTierMeta[] = [
  {
    id: 'LEVEL_1_BEGINNER',
    shortLabel: 'Level 1',
    titleTaglish: 'Level 1: Beginner Trainee',
    subtitleTaglish: 'Basic PSU safety, ground integrity, 5V VREF, at DMM continuity/open-short checks',
    accentTone: 'emerald',
    curriculumTopics: [
      'Basic Bench PSU Safety & Ground',
      '5V VREF Supply Circuit Drop',
      'Open Circuit vs Short to Ground (DMM Continuity)',
      'TPS Circuit Low Voltage Input (DTC P0122)',
    ],
  },
  {
    id: 'LEVEL_2_INTERMEDIATE',
    shortLabel: 'Level 2',
    titleTaglish: 'Level 2: Intermediate Technician',
    subtitleTaglish: 'Sensor CKP/CMP pulse, injector PWM, CAN-Bus 60Ω resistance, relay at ground drop',
    accentTone: 'amber',
    curriculumTopics: [
      'Sensor Waveform (CKP/CMP Hall vs VR Reluctor)',
      'Solenoid PWM & Fuel Injector Pulse Width',
      'CAN-Bus 60Ω Termination Resistance',
      'Relay Control Circuits & Ground Voltage Drop',
    ],
  },
  {
    id: 'LEVEL_3_ADVANCED',
    shortLabel: 'Level 3',
    titleTaglish: 'Level 3: Advanced Troubleshooter',
    subtitleTaglish: 'CAN bus reflection/short, ECU 5V LDO short isolation, at MOSFET cold diode drop',
    accentTone: 'rose',
    curriculumTopics: [
      'High-Speed CAN-Bus Dominant Short & Reflection',
      'ECU Internal 5V LDO Regulator Short Isolation',
      'MOSFET Low-Side Driver Fault & Cold Diode Drop',
    ],
  },
];

export type LabStepKind = 'HEALTHY_CHECK' | 'FAULT_CONFIRMATION';

export interface LabGuidanceStep {
  id: string;
  stepNumber: number;
  titleTaglish: string;
  instructionTaglish: string;
  requiredPsuState: 'OFF' | 'ON' | 'ANY';
  requiredDmmMode: MultimeterMode;
  dmmModeDisplay: string;
  redProbeLabel: string;
  blackProbeLabel: string;
  /** Valid pin/node IDs accepted for Red (+) probe. */
  redProbeTargets: readonly string[];
  /** Valid pin/node IDs accepted for Black (-) probe. */
  blackProbeTargets: readonly string[];
  /** If true, Red and Black probes may be swapped (valid for unpolarized resistance/continuity). */
  allowSwappedProbes?: boolean;
  /** Primary pin to highlight when user clicks "Focus Pin". */
  focusPinId: string;
  focusPinLabel: string;
  expectedReadingLabel: string;
  toleranceLabel: string;
  /** Inclusive lower bound (in base unit: V, Ohms, Hz). */
  minValue: number;
  /** Inclusive upper bound (in base unit: V, Ohms, Hz). Use Infinity when O.L is valid. */
  maxValue: number;
  /** Accept O.L (over-limit open circuit) as matching this step's target band. */
  acceptOverLimit?: boolean;
  unitLabel: string;
  stepKind: LabStepKind;
  passFeedbackTaglish: string;
  failHintTaglish: string;
}

export interface UniversityLabModule {
  id: string;
  exerciseCode: string;
  tier: UniversityDifficultyTier;
  titleTaglish: string;
  subtitleTaglish: string;
  targetUnit: string;
  objectiveTaglish: string;
  dtcCodes: readonly string[];
  oscilloscopeSignal: 'CAN_BUS' | 'INJECTOR_PWM' | 'CRANK_CKP' | 'TPS_DC' | 'O2_LAMBDA';
  oscilloscopeCriteriaLabel: string;
  focusPinId: string;
  focusPinLabel: string;
  faultsToInject: readonly BenchTroubleFaultSpec[];
  wiresToCut?: readonly string[];
  psuOverride: {
    isOutputEnabled: boolean;
    voltageSetting: number;
  };
  rpmOverride: {
    isActive: boolean;
    rpm: number;
    ckpSignalLost?: boolean;
    camPhaseOffsetDeg?: number;
  };
  componentOverrides?: ReadonlyArray<{
    componentId: string;
    state: Record<string, number | boolean | string>;
  }>;
  steps: readonly LabGuidanceStep[];
}

export type LabStepStatus =
  | 'WAITING_SETUP'
  | 'PASSED'
  | 'FAULT_CONFIRMED'
  | 'OUT_OF_RANGE';

export interface LabStepLiveEvaluation {
  stepId: string;
  stepNumber: number;
  status: LabStepStatus;
  psuOk: boolean;
  dmmPoweredOk: boolean;
  dmmModeOk: boolean;
  probesOk: boolean;
  setupReady: boolean;
  liveNumericValue: number;
  liveDisplay: string;
  liveUnit: string;
  isOverLimit: boolean;
  hasDmmWarning: boolean;
  dmmWarningMessage?: string;
  feedbackTaglish: string;
  checklistSummaryTaglish: string;
}

export interface CapturedLabStepEvidence {
  stepId: string;
  stepNumber: number;
  titleTaglish: string;
  probeSetupLabel: string;
  dmmMode: MultimeterMode;
  psuEnabled: boolean;
  psuVoltage: number;
  measuredDisplay: string;
  measuredUnit: string;
  measuredNumeric: number | null;
  expectedCriteria: string;
  status: 'PASSED' | 'FAULT_CONFIRMED' | 'OUT_OF_RANGE';
  capturedAtIso: string;
}

export interface LiveBenchEvaluationInput {
  powerSupply: PowerSupplyState;
  multimeter: MultimeterState;
  multimeterReading: {
    display: string;
    value: number;
    unit: string;
    isOverLimit: boolean;
    isWarning: boolean;
    warningMessage?: string;
  };
  nodeVoltages?: Record<string, number>;
  faults?: readonly InjectedFault[];
  wires?: readonly WireConnection[];
}

const GROUND_NODE_IDS = ['chassis-gnd', 'ecu-pin-1', 'ecu-pin-2', 'ecu-pin-6'] as const;
const POWER_GROUND_NODE_IDS = ['chassis-gnd', 'ecu-pin-1', 'ecu-pin-2'] as const;

export const UNIVERSITY_LAB_MODULES: readonly UniversityLabModule[] = [
  // ---------------------------------------------------------------------------
  // LEVEL 1: BEGINNER TRAINEE (4 MODULES)
  // ---------------------------------------------------------------------------
  {
    id: 'univ-l1-01-psu-safety-ground',
    exerciseCode: 'LAB-01',
    tier: 'LEVEL_1_BEGINNER',
    titleTaglish: 'Basic Bench PSU Safety, KL30/KL15 Feed & Ground Integrity',
    subtitleTaglish: 'Siguraduhin muna ang ground resistance bago i-ON ang 12.6V bench supply at sukatin ang KL30/KL15.',
    targetUnit: 'Universal 16-Pin Bench Trainer (Simulation Model)',
    objectiveTaglish:
      'I-verify ang cold ground continuity (PSU OFF) bago mag-energize ng 12.6V DC para maiwasan ang short circuit sa ECU bench.',
    dtcCodes: [],
    oscilloscopeSignal: 'TPS_DC',
    oscilloscopeCriteriaLabel: 'CH1 DC Coupling · 5V/div · Stable 12.6V KL30/KL15 Rail',
    focusPinId: 'ecu-pin-1',
    focusPinLabel: 'KL31 (Pin 1)',
    faultsToInject: [],
    psuOverride: { isOutputEnabled: false, voltageSetting: 12.6 },
    rpmOverride: { isActive: false, rpm: 850, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    steps: [
      {
        id: 'l1-01-s1',
        stepNumber: 1,
        titleTaglish: 'STEP 1: Cold Power Ground Check (PSU OFF)',
        instructionTaglish:
          'Siguraduhing OFF ang Bench PSU. Ilagay ang DMM sa OHMS (Ω) at sukatin ang Pin 1 (KL31) papuntang Chassis Ground.',
        requiredPsuState: 'OFF',
        requiredDmmMode: 'RESISTANCE',
        dmmModeDisplay: 'OHMS (Ω)',
        redProbeLabel: 'Pin 1 (KL31)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-1', 'ecu-pin-2'],
        blackProbeTargets: ['chassis-gnd'],
        allowSwappedProbes: true,
        focusPinId: 'ecu-pin-1',
        focusPinLabel: 'KL31 (Pin 1)',
        expectedReadingLabel: '< 0.50 Ω',
        toleranceLabel: '0.00 Ω – 0.50 Ω',
        minValue: 0,
        maxValue: 0.5,
        unitLabel: 'Ω',
        stepKind: 'HEALTHY_CHECK',
        passFeedbackTaglish: 'PASSED — Malinis at low-resistance ang power ground return ng ECU.',
        failHintTaglish: 'I-check kung OFF ang PSU, naka-OHMS ang DMM, at nakakabit sa Pin 1 at Chassis GND.',
      },
      {
        id: 'l1-01-s2',
        stepNumber: 2,
        titleTaglish: 'STEP 2: Constant Battery +12V Supply Check (KL30 — PSU ON)',
        instructionTaglish:
          'I-ON ang Bench PSU (12.6V). Ilipat ang DMM sa DC VOLTS (V) at sukatin ang Pin 3 (KL30) kontra Chassis Ground.',
        requiredPsuState: 'ON',
        requiredDmmMode: 'V_DC',
        dmmModeDisplay: 'DC VOLTS (V)',
        redProbeLabel: 'Pin 3 (KL30)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-3'],
        blackProbeTargets: POWER_GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-3',
        focusPinLabel: 'KL30 (Pin 3)',
        expectedReadingLabel: '12.60 V',
        toleranceLabel: '12.00 V – 14.50 V',
        minValue: 12.0,
        maxValue: 14.5,
        unitLabel: 'V DC',
        stepKind: 'HEALTHY_CHECK',
        passFeedbackTaglish: 'PASSED — Kumpleto ang constant +12V battery feed sa ECU Pin 3 (KL30).',
        failHintTaglish: 'I-ON ang Bench PSU at ilagay ang Red probe sa Pin 3 (KL30) habang naka-DC VOLTS.',
      },
      {
        id: 'l1-01-s3',
        stepNumber: 3,
        titleTaglish: 'STEP 3: Switched Ignition Supply Check (KL15 — PSU ON)',
        instructionTaglish:
          'Habang ON ang PSU at naka-DC VOLTS, ilipat ang Red (+) probe sa Pin 4 (KL15) upang kumpirmahin ang ignition wake-up.',
        requiredPsuState: 'ON',
        requiredDmmMode: 'V_DC',
        dmmModeDisplay: 'DC VOLTS (V)',
        redProbeLabel: 'Pin 4 (KL15)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-4'],
        blackProbeTargets: POWER_GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-4',
        focusPinLabel: 'KL15 (Pin 4)',
        expectedReadingLabel: '12.60 V',
        toleranceLabel: '11.80 V – 14.50 V',
        minValue: 11.8,
        maxValue: 14.5,
        unitLabel: 'V DC',
        stepKind: 'HEALTHY_CHECK',
        passFeedbackTaglish: 'PASSED — Gising ang ECU dahil buo ang KL15 Ignition Switch feed.',
        failHintTaglish: 'Sukatin ang Pin 4 (KL15) kontra Chassis Ground gamit ang DC VOLTS.',
      },
    ],
  },
  {
    id: 'univ-l1-02-vref-circuit-drop',
    exerciseCode: 'LAB-02',
    tier: 'LEVEL_1_BEGINNER',
    titleTaglish: '5V VREF Supply Circuit Drop Diagnosis (DTC P0642)',
    subtitleTaglish: 'Hanapin kung bakit bumagsak ang 5.00V sensor reference rail habang malusog ang KL30 battery feed.',
    targetUnit: 'Universal 16-Pin Bench Trainer (5V Sensor Rail)',
    objectiveTaglish:
      'Patunayan na may 12.6V sa KL30 ngunit may excessive voltage drop sa Pin 5 (VREF_5V) dahil sa high-resistance fault.',
    dtcCodes: ['P0642'],
    oscilloscopeSignal: 'TPS_DC',
    oscilloscopeCriteriaLabel: 'CH1 2V/div DC · Nominal 5.00V vs Loaded Drop',
    focusPinId: 'ecu-pin-5',
    focusPinLabel: 'VREF_5V (Pin 5)',
    faultsToInject: [
      {
        pinId: 'ecu-pin-5',
        faultType: 'HIGH_RESISTANCE_250R',
        description: 'Corroded 5V VREF Splice / 250Ω High-Resistance Drop on Pin 5',
      },
    ],
    psuOverride: { isOutputEnabled: true, voltageSetting: 12.6 },
    rpmOverride: { isActive: false, rpm: 850, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    steps: [
      {
        id: 'l1-02-s1',
        stepNumber: 1,
        titleTaglish: 'STEP 1: Battery Feed Verification (KL30 — PSU ON)',
        instructionTaglish:
          'I-verify muna sa DC VOLTS na buo ang 12.6V sa Pin 3 (KL30) bago sisihin ang ECU regulator.',
        requiredPsuState: 'ON',
        requiredDmmMode: 'V_DC',
        dmmModeDisplay: 'DC VOLTS (V)',
        redProbeLabel: 'Pin 3 (KL30)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-3'],
        blackProbeTargets: POWER_GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-3',
        focusPinLabel: 'KL30 (Pin 3)',
        expectedReadingLabel: '12.60 V',
        toleranceLabel: '12.00 V – 14.50 V',
        minValue: 12.0,
        maxValue: 14.5,
        unitLabel: 'V DC',
        stepKind: 'HEALTHY_CHECK',
        passFeedbackTaglish: 'PASSED — Malusog ang main battery input; nasa 5V reference circuit ang problema.',
        failHintTaglish: 'Siguraduhing ON ang PSU at sukatin ang Pin 3 (KL30) sa DC VOLTS.',
      },
      {
        id: 'l1-02-s2',
        stepNumber: 2,
        titleTaglish: 'STEP 2: 5V Reference Voltage Drop Check (Pin 5 VREF)',
        instructionTaglish:
          'Ilipat ang Red (+) probe sa Pin 5 (VREF_5V) habang nakakabit ang Black (-) sa Chassis Ground. Obserbahan ang bagsak na boltahe.',
        requiredPsuState: 'ON',
        requiredDmmMode: 'V_DC',
        dmmModeDisplay: 'DC VOLTS (V)',
        redProbeLabel: 'Pin 5 (VREF_5V)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-5', 'tps-vcc', 'map-vcc'],
        blackProbeTargets: GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-5',
        focusPinLabel: 'VREF_5V (Pin 5)',
        expectedReadingLabel: '< 4.70 V (Fault)',
        toleranceLabel: 'Nominal 4.90V – 5.10V (Fault < 4.70V)',
        minValue: 0.0,
        maxValue: 4.7,
        unitLabel: 'V DC',
        stepKind: 'FAULT_CONFIRMATION',
        passFeedbackTaglish: 'FAULT CONFIRMED — Bumagsak ang VREF dahil sa 250Ω corrosion / high resistance sa 5V rail!',
        failHintTaglish: 'Sukatin ang Pin 5 (VREF_5V) o TPS 5V VCC habang ON ang PSU.',
      },
      {
        id: 'l1-02-s3',
        stepNumber: 3,
        titleTaglish: 'STEP 3: Sensor Signal Impact Check (TPS_SIG Pin 7)',
        instructionTaglish:
          'Sukatin ang Pin 7 (TPS_SIG) sa DC VOLTS para makita kung paano naapektuhan ng mababang VREF ang output ng TPS sensor.',
        requiredPsuState: 'ON',
        requiredDmmMode: 'V_DC',
        dmmModeDisplay: 'DC VOLTS (V)',
        redProbeLabel: 'Pin 7 (TPS_SIG)',
        blackProbeLabel: 'Chassis / Sensor GND',
        redProbeTargets: ['ecu-pin-7', 'tps-sig'],
        blackProbeTargets: GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-7',
        focusPinLabel: 'TPS_SIG (Pin 7)',
        expectedReadingLabel: '< 1.25 V (Suppressed)',
        toleranceLabel: '0.00 V – 1.25 V (Affected by VREF drop)',
        minValue: 0.0,
        maxValue: 1.25,
        unitLabel: 'V DC',
        stepKind: 'FAULT_CONFIRMATION',
        passFeedbackTaglish: 'FAULT CONFIRMED — Apektado ang ratio-metric TPS signal dahil bagsak ang 5V reference.',
        failHintTaglish: 'Ilagay ang Red probe sa Pin 7 (TPS_SIG) at Black probe sa GND.',
      },
    ],
  },
  {
    id: 'univ-l1-03-open-vs-short-continuity',
    exerciseCode: 'LAB-03',
    tier: 'LEVEL_1_BEGINNER',
    titleTaglish: 'Open Circuit vs Short-to-Ground (DMM Continuity & Ohms)',
    subtitleTaglish: 'Matutong kumilala ng putol na wire (O.L) kumpara sa short-to-ground (< 5 Ω) habang OFF ang power.',
    targetUnit: 'Universal 16-Pin Bench Trainer (Sensor Harness)',
    objectiveTaglish:
      'Gumamit ng DMM Continuity at Resistance (PSU OFF) upang ihambing ang putol na MAP signal wire at shorted ECT signal wire.',
    dtcCodes: ['P0107', 'P0117'],
    oscilloscopeSignal: 'TPS_DC',
    oscilloscopeCriteriaLabel: 'Cold Continuity Bench Check (PSU OFF Required)',
    focusPinId: 'ecu-pin-8',
    focusPinLabel: 'MAP_SIG (Pin 8)',
    faultsToInject: [
      {
        pinId: 'ecu-pin-9',
        faultType: 'SHORT_TO_GND',
        description: 'ECT Signal Harness Pinched / Shorted to Engine Block Ground',
      },
    ],
    wiresToCut: ['wire-5'],
    psuOverride: { isOutputEnabled: false, voltageSetting: 12.6 },
    rpmOverride: { isActive: false, rpm: 850, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    steps: [
      {
        id: 'l1-03-s1',
        stepNumber: 1,
        titleTaglish: 'STEP 1: Open Harness Continuity Test (MAP Wire Cut — PSU OFF)',
        instructionTaglish:
          'Habang OFF ang PSU, ilagay ang DMM sa CONTINUITY (BEEP). Sukatin mula Pin 8 (MAP_SIG) papuntang MAP Sensor Signal pin (map-sig).',
        requiredPsuState: 'OFF',
        requiredDmmMode: 'CONTINUITY',
        dmmModeDisplay: 'CONTINUITY (BEEP)',
        redProbeLabel: 'Pin 8 (MAP_SIG)',
        blackProbeLabel: 'MAP Sensor Signal (map-sig)',
        redProbeTargets: ['ecu-pin-8'],
        blackProbeTargets: ['map-sig'],
        allowSwappedProbes: true,
        focusPinId: 'ecu-pin-8',
        focusPinLabel: 'MAP_SIG (Pin 8)',
        expectedReadingLabel: 'O.L / > 1 kΩ (Walang Beep)',
        toleranceLabel: 'Open Circuit > 1,000 Ω o O.L',
        minValue: 1000,
        maxValue: Number.POSITIVE_INFINITY,
        acceptOverLimit: true,
        unitLabel: 'Ω',
        stepKind: 'FAULT_CONFIRMATION',
        passFeedbackTaglish: 'FAULT CONFIRMED — Walang continuity (Open Circuit) sa pagitan ng ECU Pin 8 at MAP Sensor!',
        failHintTaglish: 'I-OFF ang PSU, itakda sa CONTINUITY, at ikabit ang probes sa Pin 8 (MAP_SIG) at MAP Sensor Signal.',
      },
      {
        id: 'l1-03-s2',
        stepNumber: 2,
        titleTaglish: 'STEP 2: Short-to-Ground Resistance Check (ECT Pin 9 — PSU OFF)',
        instructionTaglish:
          'Ilipat ang DMM sa OHMS (Ω) habang OFF pa rin ang PSU. Sukatin ang Pin 9 (ECT_SIG) papuntang Chassis Ground.',
        requiredPsuState: 'OFF',
        requiredDmmMode: 'RESISTANCE',
        dmmModeDisplay: 'OHMS (Ω)',
        redProbeLabel: 'Pin 9 (ECT_SIG)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-9', 'ect-sig'],
        blackProbeTargets: POWER_GROUND_NODE_IDS,
        allowSwappedProbes: true,
        focusPinId: 'ecu-pin-9',
        focusPinLabel: 'ECT_SIG (Pin 9)',
        expectedReadingLabel: '< 5.0 Ω (Dead Short)',
        toleranceLabel: 'Short to GND: 0.0 Ω – 5.0 Ω',
        minValue: 0,
        maxValue: 5.0,
        unitLabel: 'Ω',
        stepKind: 'FAULT_CONFIRMATION',
        passFeedbackTaglish: 'FAULT CONFIRMED — Dead Short-to-Ground sa Pin 9 (ECT_SIG); kaya magbibigay ito ng DTC P0117!',
        failHintTaglish: 'Sukatin sa OHMS ang Pin 9 (ECT_SIG) laban sa Chassis Ground habang OFF ang PSU.',
      },
    ],
  },
  {
    id: 'univ-l1-04-tps-low-p0122',
    exerciseCode: 'LAB-04',
    tier: 'LEVEL_1_BEGINNER',
    titleTaglish: 'TPS Circuit Low Voltage Input (DTC P0122)',
    subtitleTaglish: 'Hanapin kung bakit halos 0.00V lang ang TPS signal sa ECU Pin 7 imbes na ~1.30V at idle.',
    targetUnit: 'Universal Bench Trainer / Toyota 1KD-FTV Reference Workflow',
    objectiveTaglish:
      'Hanapin kung bakit bagsak sa < 0.20V ang TPS signal imbes na 1.30V sa pamamagitan ng 3-step cold ground, 5V VREF, at signal pin check.',
    dtcCodes: ['P0122'],
    oscilloscopeSignal: 'TPS_DC',
    oscilloscopeCriteriaLabel: 'CH1 1V/div DC · Nominal Idle ~1.30V vs Fault ~0.00V',
    focusPinId: 'ecu-pin-7',
    focusPinLabel: 'TPS_SIG (Pin 7)',
    faultsToInject: [],
    wiresToCut: ['wire-2'],
    psuOverride: { isOutputEnabled: false, voltageSetting: 12.6 },
    rpmOverride: { isActive: false, rpm: 850, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    steps: [
      {
        id: 'l1-04-s1',
        stepNumber: 1,
        titleTaglish: 'STEP 1: Cold Resistance Check (PSU OFF)',
        instructionTaglish:
          'Habang OFF ang Bench PSU, ilagay ang DMM sa OHMS (Ω). Ikabit ang Red (+) sa Pin 6 (SGND) at Black (-) sa Chassis/Engine Ground.',
        requiredPsuState: 'OFF',
        requiredDmmMode: 'RESISTANCE',
        dmmModeDisplay: 'OHMS (Ω)',
        redProbeLabel: 'Pin 6 (SGND)',
        blackProbeLabel: 'Engine Block / Chassis GND',
        redProbeTargets: ['ecu-pin-6', 'tps-gnd'],
        blackProbeTargets: ['chassis-gnd', 'ecu-pin-1', 'ecu-pin-2'],
        allowSwappedProbes: true,
        focusPinId: 'ecu-pin-6',
        focusPinLabel: 'SGND (Pin 6)',
        expectedReadingLabel: '< 0.50 Ω',
        toleranceLabel: '0.00 Ω – 0.50 Ω (±0.10 Ω)',
        minValue: 0,
        maxValue: 0.5,
        unitLabel: 'Ω',
        stepKind: 'HEALTHY_CHECK',
        passFeedbackTaglish: 'PASSED — Ground integrity ng Sensor Ground (SGND) ay verified at mababa ang resistance.',
        failHintTaglish: 'I-OFF ang PSU, piliin ang OHMS (Ω), at sukatin ang Pin 6 (SGND) laban sa Chassis Ground.',
      },
      {
        id: 'l1-04-s2',
        stepNumber: 2,
        titleTaglish: 'STEP 2: 5V Reference Voltage Check (PSU ON)',
        instructionTaglish:
          'I-ON ang Bench PSU (12.6V). Ilagay ang DMM sa DC VOLTS (V), Red (+) sa Pin 5 (VREF_5V) at Black (-) sa Chassis Ground.',
        requiredPsuState: 'ON',
        requiredDmmMode: 'V_DC',
        dmmModeDisplay: 'DC VOLTS (V)',
        redProbeLabel: 'Pin 5 (VREF_5V)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-5', 'tps-vcc'],
        blackProbeTargets: GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-5',
        focusPinLabel: 'VREF_5V (Pin 5)',
        expectedReadingLabel: '5.00 V',
        toleranceLabel: '4.90 V – 5.10 V',
        minValue: 4.9,
        maxValue: 5.1,
        unitLabel: 'V DC',
        stepKind: 'HEALTHY_CHECK',
        passFeedbackTaglish: 'PASSED — Malusog ang 5.00V sensor reference rail ng ECU.',
        failHintTaglish: 'I-ON ang Bench PSU, ilipat sa DC VOLTS, at sukatin ang Pin 5 (VREF_5V) kontra Ground.',
      },
      {
        id: 'l1-04-s3',
        stepNumber: 3,
        titleTaglish: 'STEP 3: Signal Pin Diagnosis (Key ON / Engine OFF)',
        instructionTaglish:
          'Habang ON pa rin ang PSU at naka-DC VOLTS, ilipat ang Red (+) probe sa Pin 7 (TPS_SIG) at Black (-) sa Chassis Ground.',
        requiredPsuState: 'ON',
        requiredDmmMode: 'V_DC',
        dmmModeDisplay: 'DC VOLTS (V)',
        redProbeLabel: 'Pin 7 (TPS_SIG)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-7'],
        blackProbeTargets: GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-7',
        focusPinLabel: 'TPS_SIG (Pin 7)',
        expectedReadingLabel: '< 0.20 V (Fault: Open Harness)',
        toleranceLabel: 'Healthy ~1.30V · Fault Confirmed < 0.20V',
        minValue: 0.0,
        maxValue: 0.2,
        unitLabel: 'V DC',
        stepKind: 'FAULT_CONFIRMATION',
        passFeedbackTaglish: 'FAULT CONFIRMED — Bagsak sa <0.20V ang Pin 7! Root Cause: Putol ang TPS signal wire (wire-2 open harness).',
        failHintTaglish: 'Sukatin ang Pin 7 (TPS_SIG) kontra Ground habang ON ang PSU (KOEO).',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // LEVEL 2: INTERMEDIATE TECHNICIAN (5 MODULES)
  // ---------------------------------------------------------------------------
  {
    id: 'univ-l2-05-ckp-sensor-no-pulse',
    exerciseCode: 'LAB-05',
    tier: 'LEVEL_2_INTERMEDIATE',
    titleTaglish: 'CKP / CMP Sensor Loss & Crank No-Pulse (DTC P0335)',
    subtitleTaglish: 'Buo ang power at 5V VREF pero walang fuel/spark pulse habang cranking dahil nawala ang CKP 60-2 signal.',
    targetUnit: 'Universal Bench Trainer (60-2 CKP Hall/VR Emulation)',
    objectiveTaglish:
      'Kumpirmahin na kumpleto ang KL30/VREF ngunit 0.0 Hz ang Injector pulse sa Pin 10 dahil sa nawawalang CKP crank signal.',
    dtcCodes: ['P0335'],
    oscilloscopeSignal: 'CRANK_CKP',
    oscilloscopeCriteriaLabel: 'CH1 5V/div, 10ms/div · CKP 60-2 Missing Tooth Dropout',
    focusPinId: 'ecu-pin-10',
    focusPinLabel: 'INJ_1 (Pin 10)',
    faultsToInject: [],
    psuOverride: { isOutputEnabled: true, voltageSetting: 12.6 },
    rpmOverride: { isActive: true, rpm: 280, ckpSignalLost: true, camPhaseOffsetDeg: 0 },
    componentOverrides: [
      { componentId: 'comp-relay', state: { isLatched: true } },
      { componentId: 'comp-inj', state: { isFiring: true } },
    ],
    steps: [
      {
        id: 'l2-05-s1',
        stepNumber: 1,
        titleTaglish: 'STEP 1: Verify 5V Sensor Reference Alive (PSU ON)',
        instructionTaglish:
          'Sukatin ang Pin 5 (VREF_5V) gamit ang DC VOLTS upang matiyak na gising ang ECU logic sa cranking.',
        requiredPsuState: 'ON',
        requiredDmmMode: 'V_DC',
        dmmModeDisplay: 'DC VOLTS (V)',
        redProbeLabel: 'Pin 5 (VREF_5V)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-5'],
        blackProbeTargets: GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-5',
        focusPinLabel: 'VREF_5V (Pin 5)',
        expectedReadingLabel: '5.00 V',
        toleranceLabel: '4.90 V – 5.10 V',
        minValue: 4.9,
        maxValue: 5.1,
        unitLabel: 'V DC',
        stepKind: 'HEALTHY_CHECK',
        passFeedbackTaglish: 'PASSED — Gising ang ECU at may 5V reference kahit walang crank pulse.',
        failHintTaglish: 'I-check ang Pin 5 (VREF_5V) sa DC VOLTS habang ON ang PSU.',
      },
      {
        id: 'l2-05-s2',
        stepNumber: 2,
        titleTaglish: 'STEP 2: Injector #1 Pulse Frequency Check (Pin 10)',
        instructionTaglish:
          'Ilipat ang DMM sa FREQUENCY (Hz) at sukatin ang Pin 10 (INJ_1) kontra Chassis Ground habang cranking (280 RPM).',
        requiredPsuState: 'ON',
        requiredDmmMode: 'FREQUENCY',
        dmmModeDisplay: 'FREQUENCY (Hz)',
        redProbeLabel: 'Pin 10 (INJ_1)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-10', 'inj-ctrl'],
        blackProbeTargets: GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-10',
        focusPinLabel: 'INJ_1 (Pin 10)',
        expectedReadingLabel: '0.0 Hz (No Pulse)',
        toleranceLabel: 'Fault Confirmed: 0.0 Hz (CKP Sync Lost)',
        minValue: 0,
        maxValue: 0.2,
        unitLabel: 'Hz',
        stepKind: 'FAULT_CONFIRMATION',
        passFeedbackTaglish: 'FAULT CONFIRMED — Zero Hz ang Injector pulse! Pinipigilan ng ECU ang fuel/spark dahil walang CKP signal (P0335).',
        failHintTaglish: 'Itakda ang DMM sa FREQUENCY (Hz) at sukatin ang Pin 10 (INJ_1) laban sa Ground.',
      },
    ],
  },
  {
    id: 'univ-l2-06-injector-pwm-open',
    exerciseCode: 'LAB-06',
    tier: 'LEVEL_2_INTERMEDIATE',
    titleTaglish: 'Solenoid PWM & Fuel Injector #1 Open Driver (DTC P0201)',
    subtitleTaglish: 'Kumpirmahin ang open circuit sa pagitan ng ECU Pin 10 (INJ_1) at Cylinder #1 Injector low-side sink.',
    targetUnit: 'Universal Bench Trainer / Common Rail & MPI Injector Driver',
    objectiveTaglish:
      'Suriin ang 5V rail, sukatin ang bagsak/kawalan ng pulse sa Pin 10 (INJ_1), at beripikahin ang open driver circuit.',
    dtcCodes: ['P0201'],
    oscilloscopeSignal: 'INJECTOR_PWM',
    oscilloscopeCriteriaLabel: 'CH1 10V/div, 20ms/div · Low-Side Injector Pulse & Flyback Missing',
    focusPinId: 'ecu-pin-10',
    focusPinLabel: 'INJ_1 (Pin 10)',
    faultsToInject: [
      {
        pinId: 'ecu-pin-10',
        faultType: 'OPEN_CIRCUIT',
        description: 'Pin 10 (INJ_1) Open Circuit to Low-Side Injector Driver MOSFET',
      },
    ],
    psuOverride: { isOutputEnabled: true, voltageSetting: 13.8 },
    rpmOverride: { isActive: true, rpm: 850, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    componentOverrides: [
      { componentId: 'comp-relay', state: { isLatched: true } },
      { componentId: 'comp-inj', state: { isFiring: true } },
    ],
    steps: [
      {
        id: 'l2-06-s1',
        stepNumber: 1,
        titleTaglish: 'STEP 1: 5V VREF Regulator Baseline Check (PSU ON)',
        instructionTaglish:
          'Sukatin ang Pin 5 (VREF_5V) sa DC VOLTS (Red sa Pin 5, Black sa Ground) para makasigurong buo ang ECU logic.',
        requiredPsuState: 'ON',
        requiredDmmMode: 'V_DC',
        dmmModeDisplay: 'DC VOLTS (V)',
        redProbeLabel: 'Pin 5 (VREF_5V)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-5'],
        blackProbeTargets: GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-5',
        focusPinLabel: 'VREF_5V (Pin 5)',
        expectedReadingLabel: '5.00 V',
        toleranceLabel: '4.90 V – 5.10 V',
        minValue: 4.9,
        maxValue: 5.1,
        unitLabel: 'V DC',
        stepKind: 'HEALTHY_CHECK',
        passFeedbackTaglish: 'PASSED — Normal ang 5.00V ECU logic rail.',
        failHintTaglish: 'Sukatin ang Pin 5 (VREF_5V) kontra Ground gamit ang DC VOLTS.',
      },
      {
        id: 'l2-06-s2',
        stepNumber: 2,
        titleTaglish: 'STEP 2: Injector #1 Driver Voltage / Pulse Loss Check (Pin 10)',
        instructionTaglish:
          'Ilipat ang Red (+) probe sa Pin 10 (INJ_1) habang running sa 850 RPM at naka-DC VOLTS. Suriin kung nawawala ang +13.8V coil feed.',
        requiredPsuState: 'ON',
        requiredDmmMode: 'V_DC',
        dmmModeDisplay: 'DC VOLTS (V)',
        redProbeLabel: 'Pin 10 (INJ_1)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-10'],
        blackProbeTargets: GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-10',
        focusPinLabel: 'INJ_1 (Pin 10)',
        expectedReadingLabel: '0.00 V (Open Driver)',
        toleranceLabel: 'Healthy ~12–13.8V · Fault Confirmed < 0.50V',
        minValue: 0,
        maxValue: 0.5,
        unitLabel: 'V DC',
        stepKind: 'FAULT_CONFIRMATION',
        passFeedbackTaglish: 'FAULT CONFIRMED — 0.00V sa Pin 10 (INJ_1)! Open circuit sa pagitan ng ECU driver at Injector #1 coil.',
        failHintTaglish: 'Ilagay ang Red probe sa Pin 10 (INJ_1) at Black probe sa Ground sa DC VOLTS.',
      },
      {
        id: 'l2-06-s3',
        stepNumber: 3,
        titleTaglish: 'STEP 3: Verify Zero Firing Frequency on Pin 10 (FREQUENCY)',
        instructionTaglish:
          'Ilipat ang DMM dial sa FREQUENCY (Hz) sa Pin 10 (INJ_1) para itala ang kawalan ng PWM injector switching.',
        requiredPsuState: 'ON',
        requiredDmmMode: 'FREQUENCY',
        dmmModeDisplay: 'FREQUENCY (Hz)',
        redProbeLabel: 'Pin 10 (INJ_1)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-10'],
        blackProbeTargets: GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-10',
        focusPinLabel: 'INJ_1 (Pin 10)',
        expectedReadingLabel: '0.0 Hz',
        toleranceLabel: 'Fault Confirmed: 0.0 Hz (No Pulse)',
        minValue: 0,
        maxValue: 0.2,
        unitLabel: 'Hz',
        stepKind: 'FAULT_CONFIRMATION',
        passFeedbackTaglish: 'FAULT CONFIRMED — Walang switching frequency sa Injector #1 driver pin.',
        failHintTaglish: 'Itakda sa FREQUENCY (Hz) at sukatin ang Pin 10 (INJ_1).',
      },
    ],
  },
  {
    id: 'univ-l2-07-can-60ohm-termination',
    exerciseCode: 'LAB-07',
    tier: 'LEVEL_2_INTERMEDIATE',
    titleTaglish: 'CAN-Bus 60Ω Termination Resistance & Open Bus (DTC U0100)',
    subtitleTaglish: 'Sukatin ang differential termination resistance sa Pin 13 (CAN_H) at Pin 14 (CAN_L) habang OFF ang power.',
    targetUnit: 'Universal Bench Trainer (ISO 11898 High-Speed CAN 500 kbps)',
    objectiveTaglish:
      'Gamitin ang cold Ohms test (PSU OFF) sa CAN_H at CAN_L upang malaman kung 60Ω (normal dual 120Ω) o 120Ω/O.L (open terminator).',
    dtcCodes: ['U0100'],
    oscilloscopeSignal: 'CAN_BUS',
    oscilloscopeCriteriaLabel: 'CH1/CH2 Differential CAN-H (2.5–3.5V) & CAN-L (2.5–1.5V)',
    focusPinId: 'ecu-pin-13',
    focusPinLabel: 'CAN_H (Pin 13)',
    faultsToInject: [],
    wiresToCut: ['wire-10'],
    psuOverride: { isOutputEnabled: false, voltageSetting: 12.6 },
    rpmOverride: { isActive: false, rpm: 850, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    steps: [
      {
        id: 'l2-07-s1',
        stepNumber: 1,
        titleTaglish: 'STEP 1: CAN-Bus Cold Termination Check (PSU OFF)',
        instructionTaglish:
          'Siguraduhing OFF ang PSU! Ilagay ang DMM sa OHMS (Ω), Red (+) sa Pin 13 (CAN_H) at Black (-) sa Pin 14 (CAN_L).',
        requiredPsuState: 'OFF',
        requiredDmmMode: 'RESISTANCE',
        dmmModeDisplay: 'OHMS (Ω)',
        redProbeLabel: 'Pin 13 (CAN_H)',
        blackProbeLabel: 'Pin 14 (CAN_L)',
        redProbeTargets: ['ecu-pin-13'],
        blackProbeTargets: ['ecu-pin-14'],
        allowSwappedProbes: true,
        focusPinId: 'ecu-pin-13',
        focusPinLabel: 'CAN_H (Pin 13)',
        expectedReadingLabel: '~120 Ω (Missing 2nd Terminator)',
        toleranceLabel: 'Healthy 54–66 Ω · Open Bus Fault 105–135 Ω',
        minValue: 105,
        maxValue: 135,
        unitLabel: 'Ω',
        stepKind: 'FAULT_CONFIRMATION',
        passFeedbackTaglish: 'FAULT CONFIRMED — 120 Ω lang ang nasukat imbes na 60 Ω! Putol ang CAN_H trunk papuntang external 120Ω terminator.',
        failHintTaglish: 'I-OFF ang PSU, itakda sa OHMS (Ω), at sukatin sa pagitan ng Pin 13 (CAN_H) at Pin 14 (CAN_L).',
      },
      {
        id: 'l2-07-s2',
        stepNumber: 2,
        titleTaglish: 'STEP 2: Verify CAN_H Recessive Bias Voltage (PSU ON)',
        instructionTaglish:
          'I-ON ang PSU at ilipat ang DMM sa DC VOLTS (V). Sukatin ang Pin 13 (CAN_H) kontra Chassis Ground.',
        requiredPsuState: 'ON',
        requiredDmmMode: 'V_DC',
        dmmModeDisplay: 'DC VOLTS (V)',
        redProbeLabel: 'Pin 13 (CAN_H)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-13'],
        blackProbeTargets: GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-13',
        focusPinLabel: 'CAN_H (Pin 13)',
        expectedReadingLabel: '2.30 V – 2.80 V',
        toleranceLabel: 'ECU Transceiver Bias ~2.50 V DC',
        minValue: 2.2,
        maxValue: 2.9,
        unitLabel: 'V DC',
        stepKind: 'HEALTHY_CHECK',
        passFeedbackTaglish: 'PASSED — Buhay ang internal CAN transceiver bias (2.5V); nasa external wiring trunk ang open fault.',
        failHintTaglish: 'I-ON ang PSU at sukatin ang Pin 13 (CAN_H) kontra Ground sa DC VOLTS.',
      },
    ],
  },
  {
    id: 'univ-l2-08-main-relay-control',
    exerciseCode: 'LAB-08',
    tier: 'LEVEL_2_INTERMEDIATE',
    titleTaglish: 'Main Relay (MRELAY) Low-Side Control Circuit Check',
    subtitleTaglish: 'Gising ang ECU (may 5V VREF) ngunit open ang Main Relay low-side control driver sa Pin 12.',
    targetUnit: 'Universal Bench Trainer (Main EFI Relay Circuit)',
    objectiveTaglish:
      'Ihiwalay ang depektibong Main Relay control circuit (Pin 12) mula sa main KL15 ignition feed.',
    dtcCodes: ['P0685'],
    oscilloscopeSignal: 'TPS_DC',
    oscilloscopeCriteriaLabel: 'CH1 5V/div DC · KL15 Wake-Up vs MRELAY Pin 12 Open',
    focusPinId: 'ecu-pin-12',
    focusPinLabel: 'MRELAY (Pin 12)',
    faultsToInject: [
      {
        pinId: 'ecu-pin-12',
        faultType: 'OPEN_CIRCUIT',
        description: 'Main Relay (MRELAY Pin 12) Low-Side Control Line Open Circuit',
      },
    ],
    psuOverride: { isOutputEnabled: true, voltageSetting: 12.6 },
    rpmOverride: { isActive: false, rpm: 850, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    componentOverrides: [{ componentId: 'comp-relay', state: { isLatched: false } }],
    steps: [
      {
        id: 'l2-08-s1',
        stepNumber: 1,
        titleTaglish: 'STEP 1: Confirm Ignition Input KL15 (Pin 4 — PSU ON)',
        instructionTaglish:
          'Sukatin ang Pin 4 (KL15) sa DC VOLTS upang matiyak na nakakatanggap ang ECU ng Ignition ON command.',
        requiredPsuState: 'ON',
        requiredDmmMode: 'V_DC',
        dmmModeDisplay: 'DC VOLTS (V)',
        redProbeLabel: 'Pin 4 (KL15)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-4'],
        blackProbeTargets: POWER_GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-4',
        focusPinLabel: 'KL15 (Pin 4)',
        expectedReadingLabel: '12.60 V',
        toleranceLabel: '11.80 V – 14.50 V',
        minValue: 11.8,
        maxValue: 14.5,
        unitLabel: 'V DC',
        stepKind: 'HEALTHY_CHECK',
        passFeedbackTaglish: 'PASSED — Present ang KL15 Ignition command sa ECU Pin 4.',
        failHintTaglish: 'Sukatin ang Pin 4 (KL15) sa DC VOLTS habang ON ang PSU.',
      },
      {
        id: 'l2-08-s2',
        stepNumber: 2,
        titleTaglish: 'STEP 2: Inspect MRELAY Driver Output (Pin 12)',
        instructionTaglish:
          'Sukatin ang Pin 12 (MRELAY) kontra Chassis Ground sa DC VOLTS upang makumpirma ang open relay control line.',
        requiredPsuState: 'ON',
        requiredDmmMode: 'V_DC',
        dmmModeDisplay: 'DC VOLTS (V)',
        redProbeLabel: 'Pin 12 (MRELAY)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-12'],
        blackProbeTargets: POWER_GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-12',
        focusPinLabel: 'MRELAY (Pin 12)',
        expectedReadingLabel: '0.00 V (Open Control)',
        toleranceLabel: 'Fault Confirmed: < 0.30 V DC',
        minValue: 0,
        maxValue: 0.3,
        unitLabel: 'V DC',
        stepKind: 'FAULT_CONFIRMATION',
        passFeedbackTaglish: 'FAULT CONFIRMED — Open circuit ang Main Relay control sa Pin 12 kaya hindi nagla-latch ang Pin 87 actuator feed.',
        failHintTaglish: 'Sukatin ang Pin 12 (MRELAY) laban sa Chassis Ground gamit ang DC VOLTS.',
      },
    ],
  },
  {
    id: 'univ-l2-09-ground-voltage-drop',
    exerciseCode: 'LAB-09',
    tier: 'LEVEL_2_INTERMEDIATE',
    titleTaglish: 'High-Resistance Ground & Loaded Voltage Drop Test',
    subtitleTaglish: 'Tuklasin ang corroded chassis ground strap (50Ω) sa pamamagitan ng cold ohms at loaded voltage drop.',
    targetUnit: 'Universal Bench Trainer (Power Ground KL31 Circuit)',
    objectiveTaglish:
      'Sukatin ang mataas na resistance sa Pin 1 (KL31) at obserbahan ang abnormal ground voltage elevation kapag naka-ON ang load.',
    dtcCodes: ['P0562'],
    oscilloscopeSignal: 'TPS_DC',
    oscilloscopeCriteriaLabel: 'Loaded Ground Offset Check (Ideal < 0.10V vs Corroded Ground)',
    focusPinId: 'ecu-pin-1',
    focusPinLabel: 'KL31 (Pin 1)',
    faultsToInject: [
      {
        pinId: 'ecu-pin-1',
        faultType: 'HIGH_RESISTANCE_50R',
        description: 'Corroded Main ECU Ground Lug (+50Ω High Resistance on KL31 Pin 1)',
      },
    ],
    psuOverride: { isOutputEnabled: false, voltageSetting: 12.6 },
    rpmOverride: { isActive: false, rpm: 850, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    steps: [
      {
        id: 'l2-09-s1',
        stepNumber: 1,
        titleTaglish: 'STEP 1: Cold Ground Resistance Audit (KL31 — PSU OFF)',
        instructionTaglish:
          'Habang OFF ang PSU, sukatin sa OHMS (Ω) ang Pin 1 (KL31) papuntang Chassis Ground. Ikumpara sa < 0.50 Ω specification.',
        requiredPsuState: 'OFF',
        requiredDmmMode: 'RESISTANCE',
        dmmModeDisplay: 'OHMS (Ω)',
        redProbeLabel: 'Pin 1 (KL31)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-1'],
        blackProbeTargets: ['chassis-gnd'],
        allowSwappedProbes: true,
        focusPinId: 'ecu-pin-1',
        focusPinLabel: 'KL31 (Pin 1)',
        expectedReadingLabel: '> 10.0 Ω (Corroded Ground)',
        toleranceLabel: 'Healthy < 0.50 Ω · Fault Confirmed 15 Ω – 70 Ω',
        minValue: 15,
        maxValue: 70,
        unitLabel: 'Ω',
        stepKind: 'FAULT_CONFIRMATION',
        passFeedbackTaglish: 'FAULT CONFIRMED — Mataas ang resistance (~50 Ω) sa Pin 1 (KL31) ground lug dahil sa corrosion!',
        failHintTaglish: 'I-OFF ang PSU, itakda sa OHMS (Ω), at sukatin ang Pin 1 (KL31) kontra Chassis Ground.',
      },
      {
        id: 'l2-09-s2',
        stepNumber: 2,
        titleTaglish: 'STEP 2: Secondary Ground Comparison (KL31_2 Pin 2 — PSU OFF)',
        instructionTaglish:
          'Sukatin ang backup power ground sa Pin 2 (KL31_2) laban sa Chassis Ground para ikumpara sa depektibong Pin 1.',
        requiredPsuState: 'OFF',
        requiredDmmMode: 'RESISTANCE',
        dmmModeDisplay: 'OHMS (Ω)',
        redProbeLabel: 'Pin 2 (KL31_2)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-2'],
        blackProbeTargets: ['chassis-gnd'],
        allowSwappedProbes: true,
        focusPinId: 'ecu-pin-2',
        focusPinLabel: 'KL31_2 (Pin 2)',
        expectedReadingLabel: '< 0.50 Ω',
        toleranceLabel: 'Healthy Backup Ground: 0.00 Ω – 0.50 Ω',
        minValue: 0,
        maxValue: 0.5,
        unitLabel: 'Ω',
        stepKind: 'HEALTHY_CHECK',
        passFeedbackTaglish: 'PASSED — Malinis ang Pin 2 (KL31_2); isolated ang corrosion fault sa Pin 1 ground eyelet.',
        failHintTaglish: 'Sukatin ang Pin 2 (KL31_2) laban sa Chassis Ground habang OFF ang PSU.',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // LEVEL 3: ADVANCED TROUBLESHOOTER (3 MODULES)
  // ---------------------------------------------------------------------------
  {
    id: 'univ-l3-10-can-short-bus-drop',
    exerciseCode: 'LAB-10',
    tier: 'LEVEL_3_ADVANCED',
    titleTaglish: 'High-Speed CAN-Bus Dominant Short-to-Ground (DTC U0073)',
    subtitleTaglish: 'I-diagnose ang bus-off condition kung saan naka-short sa ground ang CAN_H at nawawala ang differential comms.',
    targetUnit: 'Universal Bench Trainer (High-Speed CAN Bus Transceiver)',
    objectiveTaglish:
      'Kumpirmahin ang bagsak na CAN_H voltage (PSU ON) at tukuyin ang dead short sa ground gamit ang cold Ohms test (PSU OFF).',
    dtcCodes: ['U0073'],
    oscilloscopeSignal: 'CAN_BUS',
    oscilloscopeCriteriaLabel: 'CH1/CH2 1V/div, 20µs/div · CAN_H Collapsed to 0V (Bus-Off)',
    focusPinId: 'ecu-pin-13',
    focusPinLabel: 'CAN_H (Pin 13)',
    faultsToInject: [
      {
        pinId: 'ecu-pin-13',
        faultType: 'SHORT_TO_GND',
        description: 'High-Speed CAN_H Line Shorted to Chassis Ground (Bus-Off / U0073)',
      },
    ],
    psuOverride: { isOutputEnabled: true, voltageSetting: 12.6 },
    rpmOverride: { isActive: true, rpm: 850, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    steps: [
      {
        id: 'l3-10-s1',
        stepNumber: 1,
        titleTaglish: 'STEP 1: Live CAN_H Bus Bias Collapse Check (PSU ON)',
        instructionTaglish:
          'Habang ON ang PSU, sukatin sa DC VOLTS ang Pin 13 (CAN_H) kontra Chassis Ground. Dapat ~2.50V ito kung normal.',
        requiredPsuState: 'ON',
        requiredDmmMode: 'V_DC',
        dmmModeDisplay: 'DC VOLTS (V)',
        redProbeLabel: 'Pin 13 (CAN_H)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-13', 'can-term-h'],
        blackProbeTargets: GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-13',
        focusPinLabel: 'CAN_H (Pin 13)',
        expectedReadingLabel: '< 0.25 V (Collapsed)',
        toleranceLabel: 'Nominal 2.50V · Short-to-GND Fault < 0.25V',
        minValue: 0,
        maxValue: 0.25,
        unitLabel: 'V DC',
        stepKind: 'FAULT_CONFIRMATION',
        passFeedbackTaglish: 'FAULT CONFIRMED — Bumagsak sa ~0V ang CAN_H bus voltage; hindi makakapag-communicate ang mga modules (U0073).',
        failHintTaglish: 'Sukatin ang Pin 13 (CAN_H) sa DC VOLTS habang ON ang PSU.',
      },
      {
        id: 'l3-10-s2',
        stepNumber: 2,
        titleTaglish: 'STEP 2: Cold Short-to-Ground Confirmation (PSU OFF)',
        instructionTaglish:
          'I-OFF ang PSU para sa ligtas na cold check! Ilipat sa OHMS (Ω) at sukatin ang Pin 13 (CAN_H) laban sa Chassis Ground.',
        requiredPsuState: 'OFF',
        requiredDmmMode: 'RESISTANCE',
        dmmModeDisplay: 'OHMS (Ω)',
        redProbeLabel: 'Pin 13 (CAN_H)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-13', 'can-term-h'],
        blackProbeTargets: POWER_GROUND_NODE_IDS,
        allowSwappedProbes: true,
        focusPinId: 'ecu-pin-13',
        focusPinLabel: 'CAN_H (Pin 13)',
        expectedReadingLabel: '< 5.0 Ω (Hard Short)',
        toleranceLabel: 'Short-to-GND Confirmed: 0.0 Ω – 5.0 Ω',
        minValue: 0,
        maxValue: 5.0,
        unitLabel: 'Ω',
        stepKind: 'FAULT_CONFIRMATION',
        passFeedbackTaglish: 'FAULT CONFIRMED — Hard short-to-ground (< 5 Ω) sa CAN_H line! I-disconnect paisa-isa ang mga bus nodes para i-isolate.',
        failHintTaglish: 'I-OFF muna ang PSU, itakda sa OHMS (Ω), at sukatin ang Pin 13 laban sa Chassis Ground.',
      },
    ],
  },
  {
    id: 'univ-l3-11-ecu-ldo-regulator-short',
    exerciseCode: 'LAB-11',
    tier: 'LEVEL_3_ADVANCED',
    titleTaglish: 'ECU Internal 5V LDO Regulator Short-to-Ground Isolation',
    subtitleTaglish: 'Na-pull down sa 0.00V ang buong 5V VREF regulator rail at bumagsak lahat ng 5V sensors (TPS & MAP).',
    targetUnit: 'Universal Bench Trainer (Internal 5V LDO Regulator Bus)',
    objectiveTaglish:
      'I-isolate ang hard short-to-ground sa 5V VREF rail gamit ang live voltage check at cold Ohms isolation check.',
    dtcCodes: ['P0642', 'P0122', 'P0107'],
    oscilloscopeSignal: 'TPS_DC',
    oscilloscopeCriteriaLabel: 'CH1 2V/div DC · 5V LDO Crowbar Collapse to 0.00V',
    focusPinId: 'ecu-pin-5',
    focusPinLabel: 'VREF_5V (Pin 5)',
    faultsToInject: [
      {
        pinId: 'ecu-pin-5',
        faultType: 'SHORT_TO_GND',
        description: '5V VREF LDO Regulator Output Shorted to Ground (External Sensor or Internal Clamp)',
      },
    ],
    psuOverride: { isOutputEnabled: true, voltageSetting: 12.6 },
    rpmOverride: { isActive: false, rpm: 850, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    steps: [
      {
        id: 'l3-11-s1',
        stepNumber: 1,
        titleTaglish: 'STEP 1: 5V LDO Rail Collapse Verification (PSU ON)',
        instructionTaglish:
          'Habang ON ang PSU, sukatin ang Pin 5 (VREF_5V) sa DC VOLTS. Kumpirmahin kung nasa current-limit foldback (< 0.30V).',
        requiredPsuState: 'ON',
        requiredDmmMode: 'V_DC',
        dmmModeDisplay: 'DC VOLTS (V)',
        redProbeLabel: 'Pin 5 (VREF_5V)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-5', 'tps-vcc', 'map-vcc'],
        blackProbeTargets: GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-5',
        focusPinLabel: 'VREF_5V (Pin 5)',
        expectedReadingLabel: '< 0.30 V (Shorted Rail)',
        toleranceLabel: 'Healthy 4.90–5.10V · Short Fault < 0.30V',
        minValue: 0,
        maxValue: 0.3,
        unitLabel: 'V DC',
        stepKind: 'FAULT_CONFIRMATION',
        passFeedbackTaglish: 'FAULT CONFIRMED — Tuluyang bumagsak sa ~0V ang 5V LDO output dahil sa short-to-ground!',
        failHintTaglish: 'Sukatin ang Pin 5 (VREF_5V) sa DC VOLTS habang ON ang PSU.',
      },
      {
        id: 'l3-11-s2',
        stepNumber: 2,
        titleTaglish: 'STEP 2: Cold 5V Rail Resistance Check (PSU OFF)',
        instructionTaglish:
          'I-OFF ang PSU! Ilipat sa OHMS (Ω) at sukatin ang Pin 5 (VREF_5V) laban sa Chassis Ground para kumpirmahin ang low-impedance short.',
        requiredPsuState: 'OFF',
        requiredDmmMode: 'RESISTANCE',
        dmmModeDisplay: 'OHMS (Ω)',
        redProbeLabel: 'Pin 5 (VREF_5V)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-5', 'tps-vcc', 'map-vcc'],
        blackProbeTargets: POWER_GROUND_NODE_IDS,
        allowSwappedProbes: true,
        focusPinId: 'ecu-pin-5',
        focusPinLabel: 'VREF_5V (Pin 5)',
        expectedReadingLabel: '< 5.0 Ω (Dead Short)',
        toleranceLabel: 'Shorted LDO / Sensor Rail: 0.0 Ω – 5.0 Ω',
        minValue: 0,
        maxValue: 5.0,
        unitLabel: 'Ω',
        stepKind: 'FAULT_CONFIRMATION',
        passFeedbackTaglish: 'FAULT CONFIRMED — Dead short (< 5 Ω) sa 5V rail. Bunutin muna ang TPS/MAP VCC connectors bago hatulan ang ECU LDO IC.',
        failHintTaglish: 'I-OFF ang PSU at sukatin ang Pin 5 (VREF_5V) kontra Ground gamit ang OHMS (Ω).',
      },
    ],
  },
  {
    id: 'univ-l3-12-mosfet-cold-diode-drop',
    exerciseCode: 'LAB-12',
    tier: 'LEVEL_3_ADVANCED',
    titleTaglish: 'MOSFET Gate/Driver Fault & Cold-Check Diode Drop (DTC P0351)',
    subtitleTaglish: 'Gumamit ng DMM Diode Mode (-▷|-) habang OFF ang PSU para ikumpara ang healthy ECU pin junction sa shorted driver MOSFET.',
    targetUnit: 'Universal Bench Trainer (Ignition / Injector MOSFET Stage)',
    objectiveTaglish:
      'Ihambing ang normal semiconductor diode drop (0.52V–0.78V) sa healthy pin laban sa shorted Ignition Driver MOSFET (Pin 11 < 0.05V).',
    dtcCodes: ['P0351'],
    oscilloscopeSignal: 'INJECTOR_PWM',
    oscilloscopeCriteriaLabel: 'Cold Semiconductor Junction Audit (DIODE Mode, PSU OFF)',
    focusPinId: 'ecu-pin-11',
    focusPinLabel: 'IGN_1 (Pin 11)',
    faultsToInject: [
      {
        pinId: 'ecu-pin-11',
        faultType: 'SHORT_TO_GND',
        description: 'Ignition Coil #1 Low-Side MOSFET Drain-to-Source Thermal Short to Ground',
      },
    ],
    psuOverride: { isOutputEnabled: false, voltageSetting: 12.6 },
    rpmOverride: { isActive: false, rpm: 850, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    steps: [
      {
        id: 'l3-12-s1',
        stepNumber: 1,
        titleTaglish: 'STEP 1: Healthy Reference Pin Cold Diode Drop (Pin 7 TPS — PSU OFF)',
        instructionTaglish:
          'Siguraduhing OFF ang PSU! Ilagay ang DMM sa DIODE (-▷|-). Red (+) sa Pin 7 (TPS_SIG) at Black (-) sa Chassis Ground bilang healthy baseline.',
        requiredPsuState: 'OFF',
        requiredDmmMode: 'DIODE',
        dmmModeDisplay: 'DIODE (-▷|-)',
        redProbeLabel: 'Pin 7 (TPS_SIG — Healthy Ref)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-7'],
        blackProbeTargets: POWER_GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-7',
        focusPinLabel: 'TPS_SIG (Pin 7)',
        expectedReadingLabel: '0.52 V – 0.78 V',
        toleranceLabel: 'Normal Silicon Junction Drop: 0.520V – 0.780V',
        minValue: 0.52,
        maxValue: 0.78,
        unitLabel: 'V',
        stepKind: 'HEALTHY_CHECK',
        passFeedbackTaglish: 'PASSED — Normal silicon ESD protection junction drop (0.52V–0.78V) ang baseline pin.',
        failHintTaglish: 'I-OFF ang PSU, piliin ang DIODE mode, Red (+) sa Pin 7 at Black (-) sa Chassis Ground.',
      },
      {
        id: 'l3-12-s2',
        stepNumber: 2,
        titleTaglish: 'STEP 2: Suspect MOSFET Driver Diode Drop Test (Pin 11 IGN_1 — PSU OFF)',
        instructionTaglish:
          'Habang OFF pa rin ang PSU at naka-DIODE mode, ilipat ang Red (+) sa Pin 11 (IGN_1) at Black (-) sa Chassis Ground.',
        requiredPsuState: 'OFF',
        requiredDmmMode: 'DIODE',
        dmmModeDisplay: 'DIODE (-▷|-)',
        redProbeLabel: 'Pin 11 (IGN_1 — Suspect Driver)',
        blackProbeLabel: 'Chassis Ground (GND)',
        redProbeTargets: ['ecu-pin-11'],
        blackProbeTargets: POWER_GROUND_NODE_IDS,
        focusPinId: 'ecu-pin-11',
        focusPinLabel: 'IGN_1 (Pin 11)',
        expectedReadingLabel: '< 0.05 V (MOSFET Shorted)',
        toleranceLabel: 'Healthy 0.52–0.78V · Shorted Junction < 0.05V',
        minValue: 0,
        maxValue: 0.05,
        unitLabel: 'V',
        stepKind: 'FAULT_CONFIRMATION',
        passFeedbackTaglish: 'FAULT CONFIRMED — Halos 0.00V diode drop sa Pin 11 (IGN_1)! Kumpirmadong shorted-to-ground ang driver MOSFET stage.',
        failHintTaglish: 'I-OFF ang PSU, naka-DIODE mode, Red (+) sa Pin 11 (IGN_1) at Black (-) sa Ground.',
      },
    ],
  },
];

export function getUniversityLabModuleById(id: string | null | undefined): UniversityLabModule | null {
  if (!id) return null;
  return UNIVERSITY_LAB_MODULES.find((m) => m.id === id) ?? null;
}

export function getUniversityTierMeta(tier: UniversityDifficultyTier): UniversityTierMeta {
  return UNIVERSITY_TIER_META.find((t) => t.id === tier) ?? UNIVERSITY_TIER_META[0];
}

/**
 * Converts a UniversityLabModule into a BenchTroubleScenario compatible with
 * LabWorkspaceLayout's existing scenario applier without breaking any core workflow.
 */
export function toBenchTroubleScenario(module: UniversityLabModule): BenchTroubleScenario & {
  wiresToCut?: readonly string[];
  universityModuleId: string;
} {
  return {
    id: module.id,
    universityModuleId: module.id,
    title: `${module.exerciseCode}: ${module.titleTaglish}`,
    subtitle: module.subtitleTaglish,
    category:
      module.tier === 'LEVEL_1_BEGINNER'
        ? 'POWER_IGNITION'
        : module.tier === 'LEVEL_2_INTERMEDIATE'
          ? 'ACTUATOR_BUS'
          : 'NO_PULSE_SENSOR',
    severity: module.tier === 'LEVEL_3_ADVANCED' ? 'CRITICAL' : 'WARNING',
    symptomTag: `${module.exerciseCode} · ${getUniversityTierMeta(module.tier).shortLabel.toUpperCase()}`,
    expectedProbeOutcome: module.objectiveTaglish,
    diagnosticHint: module.steps[0]?.instructionTaglish ?? module.objectiveTaglish,
    focusPinId: module.focusPinId,
    focusPinLabel: module.focusPinLabel,
    faultsToInject: [...module.faultsToInject],
    wiresToCut: module.wiresToCut,
    psuOverride: { ...module.psuOverride },
    rpmOverride: { ...module.rpmOverride },
    componentOverrides: module.componentOverrides
      ? module.componentOverrides.map((c) => ({ componentId: c.componentId, state: { ...c.state } }))
      : undefined,
    relatedDtcs: [...module.dtcCodes],
  };
}

function normalizeNodeId(id: string | null | undefined): string {
  return (id ?? '').trim().toLowerCase();
}

function matchesProbePair(
  step: LabGuidanceStep,
  redPinId: string | null,
  blackPinId: string | null
): boolean {
  const red = normalizeNodeId(redPinId);
  const black = normalizeNodeId(blackPinId);
  if (!red || !black) return false;

  const redAllowed = step.redProbeTargets.map((id) => id.toLowerCase());
  const blackAllowed = step.blackProbeTargets.map((id) => id.toLowerCase());

  const directMatch = redAllowed.includes(red) && blackAllowed.includes(black);
  if (directMatch) return true;

  if (step.allowSwappedProbes) {
    return redAllowed.includes(black) && blackAllowed.includes(red);
  }
  return false;
}

/**
 * Deterministically evaluates one University Lab diagnostic step against the live
 * MNA BenchCircuitSolver output, Bench Power Supply state, and Digital Multimeter probes.
 */
export function evaluateUniversityLabStep(
  step: LabGuidanceStep,
  bench: LiveBenchEvaluationInput
): LabStepLiveEvaluation {
  const psuOk =
    step.requiredPsuState === 'ANY'
      ? true
      : step.requiredPsuState === 'ON'
        ? bench.powerSupply.isOutputEnabled
        : !bench.powerSupply.isOutputEnabled;

  const dmmPoweredOk = Boolean(bench.multimeter.isPowered);
  const dmmModeOk = bench.multimeter.mode === step.requiredDmmMode;
  const probesOk = matchesProbePair(
    step,
    bench.multimeter.redProbe.attachedToPinId,
    bench.multimeter.blackProbe.attachedToPinId
  );

  const setupReady = psuOk && dmmPoweredOk && dmmModeOk && probesOk;
  const { display, value, unit, isOverLimit, isWarning, warningMessage } = bench.multimeterReading;

  const missingParts: string[] = [];
  if (!psuOk) {
    missingParts.push(step.requiredPsuState === 'OFF' ? 'I-OFF ang PSU' : 'I-ON ang PSU');
  }
  if (!dmmPoweredOk) {
    missingParts.push('I-ON ang DMM');
  }
  if (!dmmModeOk) {
    missingParts.push(`Ilipat ang DMM sa ${step.dmmModeDisplay}`);
  }
  if (!probesOk) {
    missingParts.push(`Ikabit ang Red sa ${step.redProbeLabel} at Black sa ${step.blackProbeLabel}`);
  }

  if (!setupReady) {
    return {
      stepId: step.id,
      stepNumber: step.stepNumber,
      status: 'WAITING_SETUP',
      psuOk,
      dmmPoweredOk,
      dmmModeOk,
      probesOk,
      setupReady: false,
      liveNumericValue: value,
      liveDisplay: display,
      liveUnit: unit,
      isOverLimit,
      hasDmmWarning: isWarning,
      dmmWarningMessage: warningMessage,
      feedbackTaglish: `Kailangan muna: ${missingParts.join(' · ')}`,
      checklistSummaryTaglish: missingParts.join(' · '),
    };
  }

  if (isWarning) {
    return {
      stepId: step.id,
      stepNumber: step.stepNumber,
      status: 'OUT_OF_RANGE',
      psuOk,
      dmmPoweredOk,
      dmmModeOk,
      probesOk,
      setupReady: true,
      liveNumericValue: value,
      liveDisplay: display,
      liveUnit: unit,
      isOverLimit,
      hasDmmWarning: true,
      dmmWarningMessage: warningMessage,
      feedbackTaglish: warningMessage || 'Babala sa DMM — i-check ang safety ng circuit bago sukatin.',
      checklistSummaryTaglish: 'DMM Safety Warning',
    };
  }

  const numericForRange = step.requiredDmmMode === 'V_DC' ? Math.abs(value) : value;
  const inTolerance =
    (isOverLimit && Boolean(step.acceptOverLimit)) ||
    (!isOverLimit &&
      Number.isFinite(numericForRange) &&
      numericForRange >= step.minValue - 1e-6 &&
      numericForRange <= step.maxValue + 1e-6);

  if (inTolerance) {
    return {
      stepId: step.id,
      stepNumber: step.stepNumber,
      status: step.stepKind === 'FAULT_CONFIRMATION' ? 'FAULT_CONFIRMED' : 'PASSED',
      psuOk,
      dmmPoweredOk,
      dmmModeOk,
      probesOk,
      setupReady: true,
      liveNumericValue: value,
      liveDisplay: display,
      liveUnit: unit,
      isOverLimit,
      hasDmmWarning: false,
      feedbackTaglish: step.passFeedbackTaglish,
      checklistSummaryTaglish: 'Setup OK · Ready to Capture',
    };
  }

  return {
    stepId: step.id,
    stepNumber: step.stepNumber,
    status: 'OUT_OF_RANGE',
    psuOk,
    dmmPoweredOk,
    dmmModeOk,
    probesOk,
    setupReady: true,
    liveNumericValue: value,
    liveDisplay: display,
    liveUnit: unit,
    isOverLimit,
    hasDmmWarning: false,
    feedbackTaglish: `Wala sa inaasahang tolerance (${step.toleranceLabel}). ${step.failHintTaglish}`,
    checklistSummaryTaglish: 'Setup OK · Out of Expected Range',
  };
}

export function evaluateUniversityLabModule(
  module: UniversityLabModule,
  bench: LiveBenchEvaluationInput
): LabStepLiveEvaluation[] {
  return module.steps.map((step) => evaluateUniversityLabStep(step, bench));
}
