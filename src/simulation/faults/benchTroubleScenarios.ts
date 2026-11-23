import type {
  BenchComponent,
  FaultType,
  InjectedFault,
  PowerSupplyState,
  WireConnection,
} from '../../types/ecu';
import type { CircuitSolution } from '../../utils/circuitSolver';
import type { RpmEmulatorState } from '../../utils/vehicleEcuRegistry';
import {
  getPhScenarioBatch,
  PH_TROUBLE_SCENARIOS_ALL,
  type PhDiagnosticScenario,
  type PhDomainNumber,
} from '../../data/phTroubleScenarios520';

export type TroubleScenarioCategory =
  | 'POWER_IGNITION'
  | 'NO_PULSE_SENSOR'
  | 'ACTUATOR_BUS'
  | 'GROUND_WIRING';

export interface BenchTroubleFaultSpec {
  pinId: string;
  faultType: FaultType;
  description: string;
}

export interface BenchTroubleScenario {
  id: string;
  title: string;
  subtitle: string;
  category: TroubleScenarioCategory;
  severity: 'CRITICAL' | 'WARNING';
  symptomTag: string;
  expectedProbeOutcome: string;
  diagnosticHint: string;
  focusPinId: string;
  focusPinLabel: string;
  /** Pin-level faults injected into MNA when this scenario is activated. */
  faultsToInject: BenchTroubleFaultSpec[];
  /** Bench power supply behavior while emulating this trouble. */
  psuOverride?: {
    isOutputEnabled?: boolean;
    voltageSetting?: number;
  };
  /** RPM/CKP emulator behavior so cranking or test probing is immediately observable. */
  rpmOverride: {
    isActive: boolean;
    rpm: number;
    ckpSignalLost?: boolean;
    camPhaseOffsetDeg?: number;
  };
  /** Main relay latch or injector firing overrides on bench components. */
  componentOverrides?: Array<{
    componentId: string;
    state: Record<string, number | boolean | string>;
  }>;
  /** Associated expected DTC codes when ECU wakes up or under low supply. */
  relatedDtcs: string[];
}

export interface BenchPulseChannelStatus {
  pinId: string;
  pinNumber: number;
  label: string;
  hasOutput: boolean;
  freqHz: number;
  voltageV: number;
  statusLabel: string;
  reason: string;
}

export interface BenchSignalPulseEvaluation {
  isPsuOn: boolean;
  isBatteryKl30Ok: boolean;
  isIgnitionKl15Ok: boolean;
  isEcuAwake: boolean;
  isVrefOk: boolean;
  isMainRelayLatchedOk: boolean;
  isCkpOk: boolean;
  isEngineTesting: boolean;
  testRpm: number;
  kl30Volts: number;
  kl15Volts: number;
  vrefVolts: number;
  relay87Volts: number;
  anyPulseOrSignalMissing: boolean;
  headlineStatus: 'ALL_SIGNALS_ACTIVE' | 'NO_PULSE_OR_SIGNAL' | 'STANDBY_KEY_OFF';
  headlineTitle: string;
  headlineDetail: string;
  missingReasons: string[];
  injectorPulse: BenchPulseChannelStatus;
  ignitionPulse: BenchPulseChannelStatus;
  canSignal: BenchPulseChannelStatus;
  vrefRail: BenchPulseChannelStatus;
}

export const BENCH_TROUBLE_SCENARIOS: readonly BenchTroubleScenario[] = [
  {
    id: 'no-start-lost-battery-kl30',
    title: 'No-Start: Lost Battery Supply (KL30 Open / Fuse Blown)',
    subtitle: 'Engine cranking test — battery constant +12V feed to ECU Pin 3 is open; zero pulse/signal output.',
    category: 'POWER_IGNITION',
    severity: 'CRITICAL',
    symptomTag: 'NO START · NO PULSE · KL30 LOST',
    expectedProbeOutcome: 'KL30 = 0.00V · VREF = 0.00V · INJ_1 & IGN_1 = NO PULSE (0.0 Hz)',
    diagnosticHint:
      'Crank test is running, but constant battery supply (KL30 Pin 3) failed. Check main ECU fuse, fusible link, and Pin 3 terminal voltage under load.',
    focusPinId: 'ecu-pin-3',
    focusPinLabel: 'KL30 (Pin 3)',
    faultsToInject: [
      {
        pinId: 'ecu-pin-3',
        faultType: 'OPEN_CIRCUIT',
        description: 'KL30 Battery +12V Feed Open (Blown Main Fuse / Broken B+ Wire)',
      },
    ],
    psuOverride: { isOutputEnabled: true, voltageSetting: 12.6 },
    rpmOverride: { isActive: true, rpm: 250, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    componentOverrides: [
      { componentId: 'comp-relay', state: { isLatched: true } },
      { componentId: 'comp-inj', state: { isFiring: true } },
    ],
    relatedDtcs: ['P0562'],
  },
  {
    id: 'no-start-lost-ignition-kl15',
    title: 'No-Start: Lost Ignition Supply (KL15 / IGSW Open)',
    subtitle: 'Battery +12.6V present at KL30, but switched Ignition (KL15 Pin 4) is dead; zero pulse when probing.',
    category: 'POWER_IGNITION',
    severity: 'CRITICAL',
    symptomTag: 'NO START · NO PULSE · KL15 LOST',
    expectedProbeOutcome: 'KL30 = 12.6V, KL15 = 0.00V · VREF = 0.00V · INJ_1 & IGN_1 = NO PULSE (0.0 Hz)',
    diagnosticHint:
      'Battery +12V is present at Pin 3, yet Pin 4 (KL15 IGSW) reads 0.00V so ECU stays asleep. No injector or ignition pulses come out during crank testing.',
    focusPinId: 'ecu-pin-4',
    focusPinLabel: 'KL15 (Pin 4)',
    faultsToInject: [
      {
        pinId: 'ecu-pin-4',
        faultType: 'OPEN_CIRCUIT',
        description: 'KL15 Switched Ignition (+IG) Feed Open / Faulty Ignition Switch',
      },
    ],
    psuOverride: { isOutputEnabled: true, voltageSetting: 12.6 },
    rpmOverride: { isActive: true, rpm: 250, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    componentOverrides: [
      { componentId: 'comp-relay', state: { isLatched: true } },
      { componentId: 'comp-inj', state: { isFiring: true } },
    ],
    relatedDtcs: [],
  },
  {
    id: 'no-start-total-battery-disconnected',
    title: 'Dead Bench / Total Battery Supply Drop (PSU Output OFF)',
    subtitle: 'Main battery supply disconnected or main relay/terminal completely dead across entire harness.',
    category: 'POWER_IGNITION',
    severity: 'CRITICAL',
    symptomTag: 'DEAD ECU · 0.00V ALL RAILS',
    expectedProbeOutcome: 'ALL PINS = 0.00V · NO PULSE · NO CAN SIGNAL',
    diagnosticHint:
      'Entire harness has 0V supply because bench battery power output is cut off. Verify battery clamps, main ground strap, and bench PSU enable.',
    focusPinId: 'ecu-pin-3',
    focusPinLabel: 'KL30 (Pin 3)',
    faultsToInject: [],
    psuOverride: { isOutputEnabled: false },
    rpmOverride: { isActive: true, rpm: 250, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    relatedDtcs: [],
  },
  {
    id: 'no-pulse-ckp-sensor-lost',
    title: 'Crank No-Start: CKP Crank Signal Missing (Good Power, No Pulse)',
    subtitle: 'KL30, KL15, and 5V VREF are all OK, but Crankshaft (60-2) signal is lost — ECU withholds fuel & spark pulse.',
    category: 'NO_PULSE_SENSOR',
    severity: 'CRITICAL',
    symptomTag: 'CRANK NO-START · NO PULSE · P0335',
    expectedProbeOutcome: 'KL30/KL15 = 12.6V · VREF = 5.00V · INJ_1 & IGN_1 = NO PULSE (0.0 Hz)',
    diagnosticHint:
      'Classic crank-no-start case: power and 5V reference are healthy, but without a valid CKP RPM sync signal (DTC P0335), the ECU never commands injector or ignition pulses.',
    focusPinId: 'ecu-pin-10',
    focusPinLabel: 'INJ_1 (Pin 10)',
    faultsToInject: [],
    psuOverride: { isOutputEnabled: true, voltageSetting: 12.6 },
    rpmOverride: { isActive: true, rpm: 280, ckpSignalLost: true, camPhaseOffsetDeg: 0 },
    componentOverrides: [
      { componentId: 'comp-relay', state: { isLatched: true } },
      { componentId: 'comp-inj', state: { isFiring: true } },
    ],
    relatedDtcs: ['P0335'],
  },
  {
    id: 'no-start-main-relay-unlatched',
    title: 'No-Start: Main Relay (MREL) Control Open / Unlatched',
    subtitle: 'ECU logic wakes up (VREF 5V active), but Main Relay output Pin 87 stays 0.00V — actuator feed & pulse interrupted.',
    category: 'POWER_IGNITION',
    severity: 'WARNING',
    symptomTag: 'RELAY OPEN · NO ACTUATOR FEED',
    expectedProbeOutcome: 'KL15 = 12.6V · VREF = 5.00V · Relay Pin 87 = 0.00V · INJ_1 Driver Open',
    diagnosticHint:
      'Verify Pin 12 (MRELAY) low-side ground pull-down and relay Pin 87 contact output. A bad relay or open Pin 12 control wire starves actuators of power.',
    focusPinId: 'ecu-pin-12',
    focusPinLabel: 'MRELAY (Pin 12)',
    faultsToInject: [
      {
        pinId: 'ecu-pin-12',
        faultType: 'OPEN_CIRCUIT',
        description: 'Main Relay Control Wire Open (Pin 12 MRELAY)',
      },
    ],
    psuOverride: { isOutputEnabled: true, voltageSetting: 12.6 },
    rpmOverride: { isActive: true, rpm: 250, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    componentOverrides: [{ componentId: 'comp-relay', state: { isLatched: false } }],
    relatedDtcs: [],
  },
  {
    id: 'no-signal-vref-5v-short-gnd',
    title: 'Sensor Dead: 5V Reference Shorted to Ground (VREF Collapse)',
    subtitle: 'Shorted 5V transducer pulls Pin 5 VREF_5V down to ~0V — TPS, MAP, and ECT signals flatline.',
    category: 'NO_PULSE_SENSOR',
    severity: 'CRITICAL',
    symptomTag: '5V REF COLLAPSED · MULTI-SENSOR DTC',
    expectedProbeOutcome: 'VREF_5V ≈ 0.00V · TPS/MAP/ECT = 0.00V · P0122 / P0107 / P0117',
    diagnosticHint:
      'When 5V VREF is shorted to ground by a failed sensor or pinched harness, multiple analog sensors read near 0.00V simultaneously. Unplug sensors one by one to isolate.',
    focusPinId: 'ecu-pin-5',
    focusPinLabel: 'VREF_5V (Pin 5)',
    faultsToInject: [
      {
        pinId: 'ecu-pin-5',
        faultType: 'SHORT_TO_GND',
        description: '5V Sensor Reference Shorted to Chassis Ground',
      },
    ],
    psuOverride: { isOutputEnabled: true, voltageSetting: 12.6 },
    rpmOverride: { isActive: true, rpm: 850, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    relatedDtcs: ['P0122', 'P0107', 'P0117'],
  },
  {
    id: 'no-pulse-injector-driver-open',
    title: 'Misfire / No Pulse: Injector 1 Circuit Open (Pin 10)',
    subtitle: 'Broken injector harness wire or open coil — probing INJ_1 yields 0.00V and 0.0 Hz pulse.',
    category: 'ACTUATOR_BUS',
    severity: 'CRITICAL',
    symptomTag: 'INJ_1 NO PULSE · P0201',
    expectedProbeOutcome: 'INJ_1 (Pin 10) = 0.00V · NO INJECTOR PULSE (0.0 Hz) · P0201',
    diagnosticHint:
      'Engine runs rough or stalls on Cylinder 1. Pin 10 shows 0V instead of ~12.6V pull-up with 65V inductive flyback spikes.',
    focusPinId: 'ecu-pin-10',
    focusPinLabel: 'INJ_1 (Pin 10)',
    faultsToInject: [
      {
        pinId: 'ecu-pin-10',
        faultType: 'OPEN_CIRCUIT',
        description: 'Cylinder 1 Injector Harness Open Circuit',
      },
    ],
    psuOverride: { isOutputEnabled: true, voltageSetting: 12.6 },
    rpmOverride: { isActive: true, rpm: 850, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    relatedDtcs: ['P0201'],
  },
  {
    id: 'no-pulse-ignition-driver-open',
    title: 'No Spark: Ignition Coil 1 Trigger Open (Pin 11)',
    subtitle: 'Open circuit between ECU ignition driver Pin 11 and Coil #1 — probing trigger yields NO PULSE.',
    category: 'ACTUATOR_BUS',
    severity: 'CRITICAL',
    symptomTag: 'IGN_1 NO PULSE · P0351',
    expectedProbeOutcome: 'IGN_1 (Pin 11) = 0.00V · NO 5V SPARK TRIGGER PULSE (0.0 Hz) · P0351',
    diagnosticHint:
      'Pin 11 trigger path is open so no 5V dwell pulses reach the smart coil / igniter stage.',
    focusPinId: 'ecu-pin-11',
    focusPinLabel: 'IGN_1 (Pin 11)',
    faultsToInject: [
      {
        pinId: 'ecu-pin-11',
        faultType: 'OPEN_CIRCUIT',
        description: 'Ignition Coil 1 Trigger Harness Open (Pin 11)',
      },
    ],
    psuOverride: { isOutputEnabled: true, voltageSetting: 12.6 },
    rpmOverride: { isActive: true, rpm: 850, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    relatedDtcs: ['P0351'],
  },
  {
    id: 'no-comm-can-bus-short-gnd',
    title: 'No Scan Comms: High-Speed CAN Bus Shorted to Ground',
    subtitle: 'CAN_H pinched to ground — differential communication collapses, scanner & gateway offline.',
    category: 'ACTUATOR_BUS',
    severity: 'CRITICAL',
    symptomTag: 'CAN BUS DOWN · U0001',
    expectedProbeOutcome: 'CAN_H = 0.00V · CAN_L degraded · NO 500 kbps DATA · U0001',
    diagnosticHint:
      'Power supply and engine sensors remain alive, but CAN transceiver traffic is flatlined. Measure Key-OFF bus resistance (~60Ω nominal).',
    focusPinId: 'ecu-pin-13',
    focusPinLabel: 'CAN_H (Pin 13)',
    faultsToInject: [
      {
        pinId: 'ecu-pin-13',
        faultType: 'SHORT_TO_GND',
        description: 'High-Speed CAN_H Shorted to Chassis Ground',
      },
    ],
    psuOverride: { isOutputEnabled: true, voltageSetting: 12.6 },
    rpmOverride: { isActive: true, rpm: 850, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    relatedDtcs: ['U0001'],
  },
  {
    id: 'ground-corrosion-kl31-250r',
    title: 'Intermittent / Weak Output: Corroded Main Ground (+250Ω KL31)',
    subtitle: 'Green-crust ground strap corrosion lifts ECU ground reference, distorting voltages & weakening loads.',
    category: 'GROUND_WIRING',
    severity: 'WARNING',
    symptomTag: 'HIGH-R GROUND · VOLTAGE DROP',
    expectedProbeOutcome: 'KL31 Pin 1 Ground Lift > 3V · Erratic Signal Baselines',
    diagnosticHint:
      'Measure voltage drop directly from ECU KL31 (Pin 1) to Chassis GND while energized. Anything above 0.2V indicates bad ground continuity.',
    focusPinId: 'ecu-pin-1',
    focusPinLabel: 'KL31 (Pin 1)',
    faultsToInject: [
      {
        pinId: 'ecu-pin-1',
        faultType: 'HIGH_RESISTANCE_250R',
        description: 'Corroded Main ECU Ground Return (+250Ω KL31)',
      },
    ],
    psuOverride: { isOutputEnabled: true, voltageSetting: 12.6 },
    rpmOverride: { isActive: true, rpm: 850, ckpSignalLost: false, camPhaseOffsetDeg: 0 },
    relatedDtcs: [],
  },
];

export interface EvaluateBenchPulseInput {
  powerSupply: PowerSupplyState;
  circuitSolution: CircuitSolution;
  faults: InjectedFault[];
  wires: WireConnection[];
  components: BenchComponent[];
  rpmEmulator?: RpmEmulatorState;
}

/**
 * Evaluates real-time supply & signal/pulse probe availability from solved MNA voltages,
 * PSU output, faults, harness wires, relay state, and CKP emulator state.
 */
export function evaluateBenchPulseAndSignalStatus(
  input: EvaluateBenchPulseInput
): BenchSignalPulseEvaluation {
  const { powerSupply, circuitSolution, faults, wires, components, rpmEmulator } = input;
  const nv = circuitSolution.nodeVoltages;

  const isPsuOn = Boolean(powerSupply.isOutputEnabled && powerSupply.voltageSetting > 0.4);
  const kl30Volts = nv['ecu-pin-3'] ?? 0;
  const kl15Volts = nv['ecu-pin-4'] ?? 0;
  const kl31Volts = nv['ecu-pin-1'] ?? 0;
  const kl31_2Volts = nv['ecu-pin-2'] ?? 0;
  const vrefVolts = nv['ecu-pin-5'] ?? 0;
  const sgndVolts = nv['ecu-pin-6'] ?? 0;
  const injVolts = nv['ecu-pin-10'] ?? 0;
  const ignVolts = nv['ecu-pin-11'] ?? 0;
  const canHVolts = nv['ecu-pin-13'] ?? 0;
  const canLVolts = nv['ecu-pin-14'] ?? 0;
  const relay87Volts = nv['relay-87'] ?? 0;

  const isBatteryKl30Ok =
    isPsuOn && !circuitSolution.isSupplyCurrentTripped && kl30Volts - kl31Volts >= 6.5;
  const isIgnitionKl15Ok =
    isPsuOn && !circuitSolution.isSupplyCurrentTripped && kl15Volts - kl31_2Volts >= 6.5;
  const isEcuAwake = isBatteryKl30Ok && isIgnitionKl15Ok;
  const isVrefOk = isEcuAwake && vrefVolts - sgndVolts >= 4.2 && vrefVolts <= 5.6;

  const relayComp = components.find((c) => c.id === 'comp-relay');
  const relayFault = faults.find((f) => f.pinId === 'ecu-pin-12')?.faultType ?? 'NONE';
  const isMainRelayLatchedOk =
    isEcuAwake &&
    Boolean(relayComp?.state?.isLatched ?? true) &&
    relayFault !== 'OPEN_CIRCUIT' &&
    relay87Volts >= 6.5;

  const isCkpOk = !Boolean(rpmEmulator?.ckpSignalLost);
  const isEngineTesting = Boolean(rpmEmulator?.isActive);
  const testRpm = isEngineTesting ? Math.max(0, Math.round(rpmEmulator?.rpm ?? 850)) : 850;
  const pulseBaseHz = Number(Math.max(4, Math.max(300, testRpm) / 60).toFixed(1));

  const missingReasons: string[] = [];
  if (!isPsuOn) {
    missingReasons.push('Main Bench Battery / PSU Output OFF (0.00V)');
  } else if (circuitSolution.isSupplyCurrentTripped) {
    missingReasons.push('PSU Over-Current Foldback / Short Collapse');
  } else {
    if (!isBatteryKl30Ok) {
      missingReasons.push(`Battery KL30 (Pin 3) Missing (${kl30Volts.toFixed(2)}V)`);
    }
    if (!isIgnitionKl15Ok) {
      missingReasons.push(`Ignition KL15 (Pin 4) Missing (${kl15Volts.toFixed(2)}V)`);
    }
  }
  if (isEcuAwake && !isVrefOk) {
    missingReasons.push(`5V Sensor Reference Collapsed (${vrefVolts.toFixed(2)}V)`);
  }
  if (isEcuAwake && !isMainRelayLatchedOk) {
    missingReasons.push(`Main Relay Pin 87 Unlatched / Open (${relay87Volts.toFixed(2)}V)`);
  }
  if (isEcuAwake && !isCkpOk) {
    missingReasons.push('Crankshaft CKP Signal Lost (P0335 · No RPM Sync)');
  }

  // Injector Pulse (Pin 10)
  const injComp = components.find((c) => c.id === 'comp-inj');
  const isInjFiringEnabled = Boolean(injComp?.state?.isFiring ?? true);
  const wire9Cut = wires.some((w) => w.id === 'wire-9' && w.isCut);
  const injFault = faults.find((f) => f.pinId === 'ecu-pin-10')?.faultType ?? 'NONE';
  const hasInjPinFault =
    wire9Cut ||
    injFault === 'OPEN_CIRCUIT' ||
    injFault === 'SHORT_TO_GND' ||
    injFault === 'SHORT_TO_VBAT';

  let injHasOutput = true;
  let injReason = `Active 65V inductive flyback pulse (${pulseBaseHz} Hz)`;
  if (!isPsuOn) {
    injHasOutput = false;
    injReason = 'PSU Output OFF — no battery power on injector';
  } else if (!isBatteryKl30Ok) {
    injHasOutput = false;
    injReason = 'No pulse: Battery KL30 supply missing (ECU dead)';
  } else if (!isIgnitionKl15Ok) {
    injHasOutput = false;
    injReason = 'No pulse: Ignition KL15 missing (ECU stays asleep)';
  } else if (!isMainRelayLatchedOk) {
    injHasOutput = false;
    injReason = 'No pulse: Main Relay Pin 87 actuator supply open';
  } else if (!isCkpOk) {
    injHasOutput = false;
    injReason = 'No pulse: CKP crank sensor dropout (no RPM sync)';
  } else if (hasInjPinFault) {
    injHasOutput = false;
    injReason = `No pulse: INJ_1 pin/wire fault (${wire9Cut ? 'WIRE CUT' : injFault})`;
  } else if (!isInjFiringEnabled) {
    injHasOutput = false;
    injReason = 'Injector pulse toggle paused on bench';
  }

  // Ignition Trigger (Pin 11)
  const ignFault = faults.find((f) => f.pinId === 'ecu-pin-11')?.faultType ?? 'NONE';
  const hasIgnPinFault =
    ignFault === 'OPEN_CIRCUIT' ||
    ignFault === 'SHORT_TO_GND' ||
    ignFault === 'SHORT_TO_VBAT';

  let ignHasOutput = true;
  let ignReason = `Active 5V dwell trigger (${pulseBaseHz} Hz)`;
  if (!isPsuOn) {
    ignHasOutput = false;
    ignReason = 'PSU Output OFF — 0.00V trigger output';
  } else if (!isBatteryKl30Ok) {
    ignHasOutput = false;
    ignReason = 'No pulse: Battery KL30 missing (ECU dead)';
  } else if (!isIgnitionKl15Ok) {
    ignHasOutput = false;
    ignReason = 'No pulse: Ignition KL15 missing (ECU asleep)';
  } else if (!isCkpOk) {
    ignHasOutput = false;
    ignReason = 'No pulse: CKP crank sensor lost (no ignition sync)';
  } else if (hasIgnPinFault) {
    ignHasOutput = false;
    ignReason = `No pulse: IGN_1 pin fault (${ignFault})`;
  }

  // CAN Bus (Pins 13 / 14)
  const wire10Cut = wires.some((w) => w.id === 'wire-10' && w.isCut);
  const wire11Cut = wires.some((w) => w.id === 'wire-11' && w.isCut);
  const canFault = faults.find((f) => f.pinId === 'ecu-pin-13' || f.pinId === 'ecu-pin-14')?.faultType ?? 'NONE';
  const isCanHealthy =
    isEcuAwake &&
    !wire10Cut &&
    !wire11Cut &&
    canFault !== 'OPEN_CIRCUIT' &&
    canFault !== 'SHORT_TO_GND' &&
    canFault !== 'SHORT_TO_VBAT' &&
    canHVolts >= 0.3 &&
    canLVolts >= 0.3 &&
    Math.abs(canHVolts - canLVolts) <= 3.0;

  let canReason = 'ISO 11898 500 kbps differential frames active';
  if (!isPsuOn) canReason = 'PSU OFF — bus dead';
  else if (!isBatteryKl30Ok || !isIgnitionKl15Ok) canReason = 'ECU unpowered (KL30/KL15 lost) — no CAN TX';
  else if (!isCanHealthy) canReason = 'CAN bus faulted/shorted — no communication signal';

  const vrefFault = faults.find((f) => f.pinId === 'ecu-pin-5')?.faultType ?? 'NONE';
  let vrefReason = 'Regulated +5.00V sensor excitation active';
  if (!isPsuOn) vrefReason = 'PSU OFF — 0.00V';
  else if (!isBatteryKl30Ok) vrefReason = 'KL30 lost — LDO off (0.00V)';
  else if (!isIgnitionKl15Ok) vrefReason = 'KL15 lost — ECU asleep (0.00V)';
  else if (!isVrefOk) vrefReason = `5V VREF fault (${vrefFault !== 'NONE' ? vrefFault : `${vrefVolts.toFixed(2)}V`})`;

  const anyPulseOrSignalMissing =
    !injHasOutput || !ignHasOutput || !isCanHealthy || !isVrefOk || missingReasons.length > 0;

  let headlineStatus: BenchSignalPulseEvaluation['headlineStatus'] = 'ALL_SIGNALS_ACTIVE';
  let headlineTitle = 'ECU Awake · Pulses & Signals Active';
  let headlineDetail = `Injector & ignition pulses switching at ${pulseBaseHz} Hz (${testRpm} RPM); 5V VREF & 500 kbps CAN healthy.`;

  if (!isPsuOn) {
    headlineStatus = 'STANDBY_KEY_OFF';
    headlineTitle = 'NO PULSE / NO SIGNAL · Bench Supply OFF (0.00V)';
    headlineDetail =
      'Power supply output is OFF. Probing INJ_1, IGN_1, CAN, or sensors outputs 0.00V / 0.0 Hz.';
  } else if (anyPulseOrSignalMissing) {
    headlineStatus = 'NO_PULSE_OR_SIGNAL';
    if (!isBatteryKl30Ok) {
      headlineTitle = 'NO PULSE / NO SIGNAL · Battery Supply (KL30) Lost';
      headlineDetail =
        'Battery constant supply (KL30 Pin 3) collapsed or open. ECU stays dead: 0.0 Hz on INJ_1 / IGN_1 and 0.00V on VREF.';
    } else if (!isIgnitionKl15Ok) {
      headlineTitle = 'NO PULSE / NO SIGNAL · Ignition Supply (KL15) Lost';
      headlineDetail =
        'KL30 +12V is present, but Ignition Switch (KL15 Pin 4) is 0.00V. ECU cannot wake up — zero injector/ignition pulse (0.0 Hz).';
    } else if (!isCkpOk) {
      headlineTitle = 'NO PULSE · Crankshaft (CKP) Signal Lost (P0335)';
      headlineDetail =
        'Power & 5V VREF are present, but missing CKP RPM sync blocks injector and ignition firing pulses (0.0 Hz).';
    } else if (!isMainRelayLatchedOk) {
      headlineTitle = 'NO ACTUATOR OUTPUT · Main Relay (Pin 87) Open';
      headlineDetail =
        'ECU logic is awake, but Main Relay Pin 87 actuator feed is open — injector & actuator loop disabled.';
    } else if (!isVrefOk) {
      headlineTitle = 'NO SENSOR SIGNAL · 5V Reference (VREF) Collapsed';
      headlineDetail =
        'VREF_5V rail failed — TPS, MAP, and ECT sensor signals cannot be generated.';
    } else {
      headlineTitle = 'SIGNAL / PULSE FAULT DETECTED ON PROBE';
      headlineDetail = missingReasons[0] || injReason || ignReason || canReason;
    }
  }

  return {
    isPsuOn,
    isBatteryKl30Ok,
    isIgnitionKl15Ok,
    isEcuAwake,
    isVrefOk,
    isMainRelayLatchedOk,
    isCkpOk,
    isEngineTesting,
    testRpm,
    kl30Volts,
    kl15Volts,
    vrefVolts,
    relay87Volts,
    anyPulseOrSignalMissing,
    headlineStatus,
    headlineTitle,
    headlineDetail,
    missingReasons,
    injectorPulse: {
      pinId: 'ecu-pin-10',
      pinNumber: 10,
      label: 'INJ_1 Pulse',
      hasOutput: injHasOutput,
      freqHz: injHasOutput ? pulseBaseHz : 0,
      voltageV: injVolts,
      statusLabel: injHasOutput ? `PULSING · ${pulseBaseHz} Hz` : 'NO PULSE · 0.0 Hz',
      reason: injReason,
    },
    ignitionPulse: {
      pinId: 'ecu-pin-11',
      pinNumber: 11,
      label: 'IGN_1 Trigger',
      hasOutput: ignHasOutput,
      freqHz: ignHasOutput ? pulseBaseHz : 0,
      voltageV: ignVolts,
      statusLabel: ignHasOutput ? `PULSING · ${pulseBaseHz} Hz` : 'NO PULSE · 0.0 Hz',
      reason: ignReason,
    },
    canSignal: {
      pinId: 'ecu-pin-13',
      pinNumber: 13,
      label: 'CAN Bus Data',
      hasOutput: isCanHealthy,
      freqHz: isCanHealthy ? 500000 : 0,
      voltageV: canHVolts,
      statusLabel: isCanHealthy ? 'ACTIVE · 500 kbps' : 'NO SIGNAL · 0 kbps',
      reason: canReason,
    },
    vrefRail: {
      pinId: 'ecu-pin-5',
      pinNumber: 5,
      label: 'VREF_5V Supply',
      hasOutput: isVrefOk,
      freqHz: 0,
      voltageV: vrefVolts,
      statusLabel: isVrefOk ? `OK · ${vrefVolts.toFixed(2)}V` : `DEAD · ${vrefVolts.toFixed(2)}V`,
      reason: vrefReason,
    },
  };
}

export type PhEmulationFidelity =
  | 'DIRECT_16PIN_FAULT'
  | 'ELECTRICAL_PROXY'
  | 'DIAGNOSTIC_REFERENCE_ONLY';

export interface PhBenchTroubleScenario extends BenchTroubleScenario {
  phId: string;
  batch: 1 | 2 | 3 | 4;
  domainNumber: PhDomainNumber;
  domainName: string;
  phContext: string;
  symptoms: string;
  diagnosticSteps: string;
  sourcePage: number;
  provenanceStatus: 'CROSS_REFERENCED';
  emulationFidelity: PhEmulationFidelity;
  emulationNote: string;
}

const NON_16PIN_MECHANICAL_OR_HV_KEYWORDS = [
  'hydrolock',
  'hydro-lock',
  'water in cylinders',
  'cracked piston',
  'low compression',
  'relative compression',
  'intake valve carbon',
  'oil sludge',
  'sedimenter',
  'clogged fuel filter',
  'air filter',
  'cabin filter',
  'thermostat stuck',
  'clogged radiator',
  'head gasket',
  'refrigerant',
  'expansion valve',
  'compressor lockup',
  'torque converter shudder',
  'clutch plate',
  'cv joint',
  'wheel bearing',
  'center bearing',
  'prop shaft',
  'u-joint',
  'shock absorber',
  'leaf spring',
  'lug nut',
  'pitman',
  'idler arm',
  'kingpin',
  'carrier bearing',
  'cab air suspension',
  'torsion/suspension',
  'hub seal',
  'brake pad',
  'brake booster',
  'air brake pressure',
  'air brake compressor',
  'clutch booster',
  'alternator belt',
  'pulley',
  'hv isolation',
  'isolation sensor',
  'high-voltage',
  'water ingress in hv',
  'skid plate',
  'diesel particulate filter',
  'dpf',
  'muffler',
  'charcoal canister',
  'tire rotation',
  'tire repair slime',
  'rotor warping',
  'windshield',
];

function extractRelatedDtcs(dtcCode: string): string[] {
  if (!dtcCode || dtcCode === 'NO-DTC') return [];
  const matches = dtcCode.match(/\b(?:[PUBC][0-9A-F]{4}|SPN\s+\d+|Code\s+\d+)\b/gi);
  if (matches && matches.length > 0) {
    return matches.map((m) => m.toUpperCase());
  }
  return [dtcCode];
}

export function mapPhScenarioToBenchScenario(item: PhDiagnosticScenario): PhBenchTroubleScenario {
  const combined = `${item.dtcCode} ${item.title} ${item.phContext} ${item.symptoms} ${item.diagnosticSteps}`.toLowerCase();
  const dtcUpper = item.dtcCode.toUpperCase();
  const relatedDtcs = extractRelatedDtcs(item.dtcCode);

  let category: TroubleScenarioCategory = 'ACTUATOR_BUS';
  let severity: 'CRITICAL' | 'WARNING' = 'WARNING';
  let focusPinId = 'ecu-pin-8';
  let focusPinLabel = 'MAP_SIG (Pin 8)';
  let faultsToInject: BenchTroubleFaultSpec[] = [];
  let psuOverride: BenchTroubleScenario['psuOverride'] = {
    isOutputEnabled: true,
    voltageSetting: 12.6,
  };
  let rpmOverride: BenchTroubleScenario['rpmOverride'] = {
    isActive: true,
    rpm: 850,
    ckpSignalLost: false,
    camPhaseOffsetDeg: 0,
  };
  let componentOverrides: BenchTroubleScenario['componentOverrides'] = [
    { componentId: 'comp-relay', state: { isLatched: true } },
    { componentId: 'comp-inj', state: { isFiring: true } },
  ];
  let emulationFidelity: PhEmulationFidelity = 'ELECTRICAL_PROXY';
  let emulationNote =
    'Simulated via equivalent 16-pin ECU bench electrical proxy. Always confirm vehicle-specific subsystem specs in OEM manual.';
  let expectedProbeOutcome = `${focusPinLabel} fault telemetry observable on Bench DMM / Scope`;

  // Priority 0A: Strict HV Isolation / Safety / Hydrolock / Domain 47 Workshop Hazards -> safe PSU-OFF or reference standby
  if (
    item.domainNumber === 47 ||
    combined.includes('hv isolation') ||
    combined.includes('isolation sensor') ||
    combined.includes('hv a/c leak') ||
    combined.includes('water ingress in hv') ||
    combined.includes('underbody battery skid plate') ||
    combined.includes('pyrofuse') ||
    combined.includes('hydrolock') ||
    combined.includes('hydro-lock') ||
    combined.includes('arc welding') ||
    combined.includes('do not force starter')
  ) {
    const isElectricalToolBenchCheck =
      item.id === 'PH-1999' ||
      item.id === 'PH-2015' ||
      item.id === 'PH-2018' ||
      item.id === 'PH-2023' ||
      item.id === 'PH-2024' ||
      item.id === 'PH-2031' ||
      item.id === 'PH-2033' ||
      item.id === 'PH-2034' ||
      item.id === 'PH-2035';
    category =
      item.domainNumber === 4
        ? 'GROUND_WIRING'
        : item.id === 'PH-2015' || item.id === 'PH-2031' || item.id === 'PH-2034'
          ? 'ACTUATOR_BUS'
          : 'POWER_IGNITION';
    severity = isElectricalToolBenchCheck ? 'WARNING' : 'CRITICAL';
    focusPinId = category === 'ACTUATOR_BUS' ? 'ecu-pin-13' : 'ecu-pin-3';
    focusPinLabel = category === 'ACTUATOR_BUS' ? 'CAN_H (Pin 13)' : 'KL30 (Pin 3)';
    faultsToInject = [];
    if (!isElectricalToolBenchCheck) {
      psuOverride = { isOutputEnabled: false };
      rpmOverride = { isActive: false, rpm: 0, ckpSignalLost: false, camPhaseOffsetDeg: 0 };
      expectedProbeOutcome = 'KEY OFF / BENCH SAFE STANDBY (HV Isolation / SRS / Workshop Safety Only)';
    } else {
      expectedProbeOutcome = 'Workshop Tool / Bench PSU / Probe Configuration Reference Only (No Fault Injected)';
    }
    emulationFidelity = 'DIAGNOSTIC_REFERENCE_ONLY';
    emulationNote =
      item.domainNumber === 47
        ? 'Workshop safety, HV PPE, ESD, or bench-tool edge-case procedure — keep physical safety interlocks engaged; do not emulate live HV or squib hazards.'
        : 'High-voltage isolation / mechanical hazard procedure — keep low-voltage bench PSU disabled and verify isolation / compression manually.';
  }
  // Priority 0B: Domain 36 Pre-Purchase, Mechanical/Driveline/Steering/Brake Domains (37, 40, 41, 42, 44 Immo/Key, 45 Fleet PM, 46 Environmental) & D48 pure mechanical checks
  else if (
    item.id === 'PH-1400' ||
    (item.domainNumber === 36 &&
      !combined.includes('weak battery') &&
      !combined.includes('overcharging')) ||
    (item.domainNumber === 37 &&
      !dtcUpper.includes('P0016') &&
      !dtcUpper.includes('P0524') &&
      !combined.includes('injector')) ||
    item.domainNumber === 40 ||
    (item.domainNumber === 41 && !combined.includes('steering angle sensor')) ||
    (item.domainNumber === 42 && !combined.includes('hill-start assist')) ||
    (item.domainNumber === 44 &&
      !combined.includes('can ') &&
      !combined.includes('sync') &&
      !dtcUpper.includes('B2795') &&
      !dtcUpper.includes('B2799')) ||
    (item.domainNumber === 45 &&
      !dtcUpper.includes('P0420') &&
      !combined.includes('telematics') &&
      !combined.includes('alternator')) ||
    (item.domainNumber === 46 &&
      !dtcUpper.includes('P0172') &&
      !combined.includes('fan blade') &&
      !combined.includes('winch solenoid') &&
      !combined.includes('abs tone ring') &&
      !combined.includes('salt'))
  ) {
    category =
      item.domainNumber === 36 || item.domainNumber === 40 || item.domainNumber === 41 || item.domainNumber === 42 || item.domainNumber === 44
        ? 'ACTUATOR_BUS'
        : 'POWER_IGNITION';
    severity = combined.includes('airbag') || combined.includes('flood') || combined.includes('odometer') || combined.includes('brake')
      ? 'CRITICAL'
      : 'WARNING';
    focusPinId = category === 'ACTUATOR_BUS' ? 'ecu-pin-13' : 'ecu-pin-3';
    focusPinLabel = category === 'ACTUATOR_BUS' ? 'CAN_H (Pin 13)' : 'KL30 (Pin 3)';
    faultsToInject = [];
    emulationFidelity = 'DIAGNOSTIC_REFERENCE_ONLY';
    emulationNote =
      item.id === 'PH-1400'
        ? 'Workshop multimeter 10A/400mA fuse check — verify DMM fuse continuity before parasitic draw measurement.'
        : item.domainNumber === 36
          ? 'Pre-purchase physical, paperwork, or OBD-II readiness inspection procedure — perform directly on candidate vehicle.'
          : item.domainNumber === 44
            ? 'Transponder key / EEPROM / smart-key RF locksmith procedure — verify coil/chip/EEPROM physically; cannot be emulated as a 16-pin wire fault.'
            : `Domain ${item.domainNumber} mechanical, hydraulic, alignment, or environmental inspection procedure — verify physically per listed steps.`;
    expectedProbeOutcome =
      item.id === 'PH-1400'
        ? 'Bench Tool Verification (Check DMM 400mA / 10A Internal Fuse)'
        : item.domainNumber === 36
          ? 'Pre-Purchase Inspection Checklist Reference (Verify Vehicle History, OBD Monitors & Physical Condition)'
          : 'Mechanical / Hydraulic / Physical Inspection Reference (16-Pin Bench Nominal)';
  }
  // Priority 0C: Domain 20 (PH-836–PH-880) Explicit AutoElectric Lab PRO Bench ECU & PCB Driver IC Faults
  else if (item.domainNumber === 20) {
    if (item.id === 'PH-854' || item.id === 'PH-876' || combined.includes('tvs') || combined.includes('ground loop')) {
      category = 'POWER_IGNITION';
      severity = 'CRITICAL';
      focusPinId = 'ecu-pin-3';
      focusPinLabel = 'KL30 (Pin 3)';
      faultsToInject = [
        {
          pinId: 'ecu-pin-3',
          faultType: 'SHORT_TO_GND',
          description: `${item.id}: Shorted TVS Diode / 12V Bench Overcurrent Trip`,
        },
      ];
      psuOverride = { isOutputEnabled: true, voltageSetting: 12.6 };
      emulationFidelity = 'DIRECT_16PIN_FAULT';
      emulationNote = 'Direct 16-pin MNA simulation: KL30 shorted to ground trips bench PSU current limit (>3A) and drops ECU rails.';
      expectedProbeOutcome = 'PSU Current Limit Tripped (KL30 Shorted) · VREF = 0.00V · NO PULSE';
    } else if (item.id === 'PH-864' || combined.includes('sensor ground') || combined.includes('sgnd')) {
      category = 'GROUND_WIRING';
      severity = 'CRITICAL';
      focusPinId = 'ecu-pin-6';
      focusPinLabel = 'SGND (Pin 6)';
      faultsToInject = [
        {
          pinId: 'ecu-pin-6',
          faultType: 'OPEN_CIRCUIT',
          description: `${item.id}: Sensor Ground (SGND) PCB Trace Open`,
        },
      ];
      emulationFidelity = 'DIRECT_16PIN_FAULT';
      emulationNote = 'Direct 16-pin SGND (Pin 6) open-circuit floats TPS/MAP/ECT return toward +5V.';
      expectedProbeOutcome = 'SGND Open -> Analog Sensors Pulled High (~4.8V–5.0V) Simultaneously';
    } else if (item.id === 'PH-837' || dtcUpper.includes('P0642') || combined.includes('5v regulator')) {
      category = 'NO_PULSE_SENSOR';
      severity = 'CRITICAL';
      focusPinId = 'ecu-pin-5';
      focusPinLabel = 'VREF_5V (Pin 5)';
      faultsToInject = [
        {
          pinId: 'ecu-pin-5',
          faultType: 'SHORT_TO_GND',
          description: `${item.id}: Internal 5V Regulator IC Dropout on Bench`,
        },
      ];
      emulationFidelity = 'DIRECT_16PIN_FAULT';
      emulationNote = 'Direct 16-pin VREF_5V (Pin 5) dropout simulation — collapses TPS/MAP/ECT and logic rails.';
      expectedProbeOutcome = 'VREF_5V < 1.8V / 0.00V -> Multi-Sensor Dropout & P0642';
    } else if (item.id === 'PH-838' || dtcUpper.includes('P0351') || combined.includes('igbt')) {
      category = 'ACTUATOR_BUS';
      severity = 'CRITICAL';
      focusPinId = 'ecu-pin-11';
      focusPinLabel = 'IGN_1 (Pin 11)';
      faultsToInject = [
        {
          pinId: 'ecu-pin-11',
          faultType: 'SHORT_TO_GND',
          description: `${item.id}: Shorted Ignition Coil Driver IGBT`,
        },
      ];
      emulationFidelity = 'DIRECT_16PIN_FAULT';
      emulationNote = 'Direct 16-pin IGN_1 (Pin 11) IGBT short-to-ground suppresses spark trigger pulse.';
      expectedProbeOutcome = 'IGN_1 (Pin 11) Shorted Low (0.00V) · NO SPARK PULSE · P0351';
    } else if (item.id === 'PH-839' || dtcUpper.includes('P0201') || combined.includes('injector low-side')) {
      category = 'ACTUATOR_BUS';
      severity = 'CRITICAL';
      focusPinId = 'ecu-pin-10';
      focusPinLabel = 'INJ_1 (Pin 10)';
      faultsToInject = [
        {
          pinId: 'ecu-pin-10',
          faultType: 'SHORT_TO_GND',
          description: `${item.id}: Injector Low-Side Driver MOSFET Shorted/Failed`,
        },
      ];
      emulationFidelity = 'DIRECT_16PIN_FAULT';
      emulationNote = 'Direct 16-pin INJ_1 (Pin 10) MOSFET fault removes controlled injector pulse.';
      expectedProbeOutcome = 'INJ_1 (Pin 10) Locked / Zero Pulse · P0201 Active';
    } else if (
      item.id === 'PH-840' ||
      item.id === 'PH-860' ||
      item.id === 'PH-861' ||
      dtcUpper.includes('U0073') ||
      dtcUpper.includes('U0100') ||
      combined.includes('120-ohm') ||
      combined.includes('tja1040')
    ) {
      category = 'ACTUATOR_BUS';
      severity = 'CRITICAL';
      focusPinId = 'ecu-pin-13';
      focusPinLabel = 'CAN_H (Pin 13)';
      const fType: FaultType =
        item.id === 'PH-840'
          ? 'SHORT_TO_GND'
          : item.id === 'PH-861'
            ? 'HIGH_RESISTANCE_250R'
            : 'OPEN_CIRCUIT';
      faultsToInject = [
        {
          pinId: 'ecu-pin-13',
          faultType: fType,
          description: `${item.id}: Bench CAN Bus Transceiver / Termination Fault`,
        },
      ];
      emulationFidelity = 'DIRECT_16PIN_FAULT';
      emulationNote = 'Direct 16-pin CAN_H (Pin 13) PCB/termination simulation (verify 60Ω/120Ω on Pins 13–14 with Key OFF).';
      expectedProbeOutcome = 'CAN Bus Offline · U0073/U0100 · Check 60Ω/120Ω Termination';
    } else if (item.id === 'PH-846' || combined.includes('60-2')) {
      category = 'NO_PULSE_SENSOR';
      severity = 'CRITICAL';
      focusPinId = 'ecu-pin-10';
      focusPinLabel = 'INJ_1 (Pin 10)';
      faultsToInject = [];
      rpmOverride = { isActive: true, rpm: 260, ckpSignalLost: true, camPhaseOffsetDeg: 0 };
      emulationFidelity = 'DIRECT_16PIN_FAULT';
      emulationNote = 'Direct 16-pin CKP 60-2 pull-up/bias failure keeps INJ_1 & IGN_1 at 0.0 Hz despite normal KL30/KL15.';
      expectedProbeOutcome = 'KL30/KL15 = 12.6V · Bench CKP Not Detected -> INJ_1 & IGN_1 = 0.0 Hz';
    } else if (item.id === 'PH-848' || dtcUpper.includes('P0685')) {
      category = 'POWER_IGNITION';
      severity = 'CRITICAL';
      focusPinId = 'ecu-pin-12';
      focusPinLabel = 'MRELAY (Pin 12)';
      faultsToInject = [
        {
          pinId: 'ecu-pin-12',
          faultType: 'OPEN_CIRCUIT',
          description: `${item.id}: ECU Main Relay Driver Open`,
        },
      ];
      componentOverrides = [{ componentId: 'comp-relay', state: { isLatched: false } }];
      emulationFidelity = 'DIRECT_16PIN_FAULT';
      emulationNote = 'Direct 16-pin MRELAY (Pin 12) open-circuit disables Main Relay latch and Pin 87 actuator feed.';
      expectedProbeOutcome = 'MRELAY Dead · Pin 87 = 0.00V · INJ_1 Disabled';
    } else if (item.id === 'PH-836') {
      category = 'POWER_IGNITION';
      severity = 'CRITICAL';
      focusPinId = 'ecu-pin-4';
      focusPinLabel = 'KL15 (Pin 4)';
      faultsToInject = [
        {
          pinId: 'ecu-pin-4',
          faultType: 'OPEN_CIRCUIT',
          description: `${item.id}: Bench ECU No Wake-Up (<10 mA)`,
        },
      ];
      emulationFidelity = 'DIRECT_16PIN_FAULT';
      emulationNote = 'Direct 16-pin KL15 (Pin 4) open keeps ECU asleep with near-zero bench current draw.';
      expectedProbeOutcome = 'KL15 = 0.00V · VREF = 0.00V · NO PULSE / NO CAN';
    } else if (item.id === 'PH-853' || dtcUpper.includes('P0135')) {
      category = 'NO_PULSE_SENSOR';
      severity = 'WARNING';
      focusPinId = 'ecu-pin-15';
      focusPinLabel = 'O2_SIG (Pin 15)';
      faultsToInject = [
        {
          pinId: 'ecu-pin-15',
          faultType: 'OPEN_CIRCUIT',
          description: `${item.id}: O2 Heater / Sense Driver Open`,
        },
      ];
      emulationFidelity = 'DIRECT_16PIN_FAULT';
      emulationNote = 'Direct 16-pin O2_SIG (Pin 15) circuit fault -> P0135/O2 loop offline.';
      expectedProbeOutcome = 'O2_SIG (Pin 15) Inactive · Heater Driver Fault';
    } else if (item.id === 'PH-879' || item.id === 'PH-880') {
      category = 'GROUND_WIRING';
      severity = 'WARNING';
      focusPinId = 'ecu-pin-1';
      focusPinLabel = 'KL31 (Pin 1)';
      faultsToInject = [
        {
          pinId: 'ecu-pin-1',
          faultType: item.id === 'PH-880' ? 'OPEN_CIRCUIT' : 'HIGH_RESISTANCE_250R',
          description: `${item.id}: ${item.title}`,
        },
      ];
      emulationFidelity = 'DIRECT_16PIN_FAULT';
      emulationNote = `Direct 16-pin KL31 (Pin 1) ${item.id === 'PH-880' ? 'bent terminal open' : 'case ground resistance'} fault.`;
      expectedProbeOutcome = 'KL31 Ground Drop / Open -> Unstable Bench Reference';
    } else {
      // Internal flash/EEPROM/crystal/J2534/BGA/coating/tool checks
      category = combined.includes('throttle') || combined.includes('can') ? 'ACTUATOR_BUS' : 'POWER_IGNITION';
      severity = 'WARNING';
      focusPinId = 'ecu-pin-3';
      focusPinLabel = 'KL30 (Pin 3)';
      faultsToInject = [];
      emulationFidelity = 'DIAGNOSTIC_REFERENCE_ONLY';
      emulationNote =
        'Internal PCB/MCU/EEPROM/bench-tool check — inspect directly on ECU PCB or scanner; cannot be reproduced as an external wire open/short.';
      expectedProbeOutcome = 'Bench Nominal Rails (Verify Internal IC / EEPROM / Tool per Steps)';
    }
  }
  // Priority 1: Non-16-pin purely mechanical / fluid / physical subsystem cases -> reference-safe bench state
  else if (
    NON_16PIN_MECHANICAL_OR_HV_KEYWORDS.some((kw) => combined.includes(kw)) &&
    !dtcUpper.includes('P0016') &&
    !combined.includes('dead 12v') &&
    !combined.includes('sensor') &&
    !combined.includes('short') &&
    !combined.includes('open')
  ) {
    category = item.domainNumber === 3 || item.domainNumber === 11 || item.domainNumber === 12 || item.domainNumber === 21 || item.domainNumber === 23
      ? 'POWER_IGNITION'
      : item.domainNumber === 4
        ? 'GROUND_WIRING'
        : 'ACTUATOR_BUS';
    severity = combined.includes('hydrolock') || combined.includes('hv') ? 'CRITICAL' : 'WARNING';
    focusPinId = 'ecu-pin-3';
    focusPinLabel = 'KL30 (Pin 3)';
    faultsToInject = [];
    if (combined.includes('hydrolock') || combined.includes('do not')) {
      psuOverride = { isOutputEnabled: false };
      rpmOverride = { isActive: false, rpm: 0, ckpSignalLost: false, camPhaseOffsetDeg: 0 };
      expectedProbeOutcome = 'KEY OFF / BENCH SAFE STANDBY (Mechanical / Safety Verification Only)';
    } else {
      expectedProbeOutcome = 'Reference Check — 16-Pin Bench Nominal (Vehicle Mechanical / Fluid Subsystem)';
    }
    emulationFidelity = 'DIAGNOSTIC_REFERENCE_ONLY';
    emulationNote =
      'Physical mechanical, fluid, or HV isolation procedure — not directly simulated inside 16-pin low-voltage ECU MNA. Follow listed steps on vehicle.';
  }
  // Priority 2: Direct CKP loss / Crank no-start (P0335, P0336, CKP lost)
  else if (
    dtcUpper.includes('P0335') ||
    dtcUpper.includes('P0336') ||
    dtcUpper.includes('P0339') ||
    combined.includes('ckp sensor') ||
    combined.includes('crankshaft position')
  ) {
    category = 'NO_PULSE_SENSOR';
    severity = 'CRITICAL';
    focusPinId = 'ecu-pin-10';
    focusPinLabel = 'INJ_1 (Pin 10)';
    faultsToInject = [];
    rpmOverride = { isActive: true, rpm: 260, ckpSignalLost: true, camPhaseOffsetDeg: 0 };
    emulationFidelity = 'DIRECT_16PIN_FAULT';
    emulationNote = 'Direct 16-pin CKP dropout simulation: KL30/KL15 active, CKP sync lost -> INJ_1 & IGN_1 drop to 0.0 Hz.';
    expectedProbeOutcome = 'KL30/KL15 = 12.6V · CKP LOST -> INJ_1 & IGN_1 = NO PULSE (0.0 Hz)';
  }
  // Priority 3: CMP / Timing correlation fault (P0340, P0016, VVT)
  else if (
    dtcUpper.includes('P0340') ||
    dtcUpper.includes('P0016') ||
    dtcUpper.includes('P0017') ||
    dtcUpper.includes('P0341') ||
    combined.includes('camshaft position') ||
    combined.includes('cmp ')
  ) {
    category = 'NO_PULSE_SENSOR';
    severity = 'CRITICAL';
    focusPinId = 'ecu-pin-11';
    focusPinLabel = 'IGN_1 (Pin 11)';
    faultsToInject = [];
    rpmOverride = { isActive: true, rpm: 260, ckpSignalLost: false, camPhaseOffsetDeg: 24 };
    emulationFidelity = 'DIRECT_16PIN_FAULT';
    emulationNote = 'Direct 16-pin CMP phase-offset (+24°) simulation on crank/cam oscilloscope.';
    expectedProbeOutcome = 'CKP/CMP Phase Offset (+24° Sync Error) observable on 4-Ch Scope';
  }
  // Priority 4: Low / Dead 12V Battery or Cranking Drop or Dead 12V Aux in Hybrid/EV (P0562, PH-463, PH-925, PH-1271, PH-1470, 24V Low)
  else if (
    !combined.includes('ground bounce') &&
    !combined.includes('sgnd') &&
    (dtcUpper.includes('P0562') ||
      dtcUpper.includes('P0560') ||
      dtcUpper.includes('P0A1D') ||
      dtcUpper.includes('SPN 168') ||
      combined.includes('dead 12v') ||
      combined.includes('12v lfp aux') ||
      combined.includes('sleep cutout') ||
      combined.includes('12v brownout') ||
      combined.includes('12v battery (<9v') ||
      combined.includes('loose battery terminal') ||
      combined.includes('sulfated 12v battery') ||
      combined.includes('voltage low') ||
      combined.includes('weak battery') ||
      combined.includes('sulfated battery') ||
      combined.includes('loose starter terminal') ||
      combined.includes('solenoid magnetic switch') ||
      combined.includes('battery master switch'))
  ) {
    category = 'POWER_IGNITION';
    severity = 'CRITICAL';
    focusPinId = 'ecu-pin-3';
    focusPinLabel = 'KL30 (Pin 3)';
    const isDeadZero =
      combined.includes('dead 12v') ||
      combined.includes('sleep cutout') ||
      combined.includes('12v brownout') ||
      combined.includes("won't enter 'ready'") ||
      combined.includes('locking out healthy 400v');
    const is24V =
      item.domainNumber === 12 ||
      item.domainNumber === 34 ||
      (item.domainNumber === 23 && combined.includes('24v'));
    if (isDeadZero) {
      faultsToInject = [
        {
          pinId: 'ecu-pin-3',
          faultType: 'HIGH_RESISTANCE_250R',
          description: `${item.id}: Weak / Depleted 12V Aux Supply Collapse`,
        },
      ];
      psuOverride = { isOutputEnabled: true, voltageSetting: 8.2 };
      expectedProbeOutcome = 'KL30 < 6.5V under load · ECU Brownout / Relays Drop Out · NO PULSE';
    } else if (is24V) {
      psuOverride = { isOutputEnabled: true, voltageSetting: 18.5 };
      faultsToInject = [
        {
          pinId: 'ecu-pin-3',
          faultType: 'HIGH_RESISTANCE_50R',
          description: `${item.id}: 24V System Voltage Drop (<22V via Switch/Harness)`,
        },
      ];
      expectedProbeOutcome = '24V Commercial Bus Dropped Below Nominal (<22V) · SPN 168 / P0562';
    } else {
      psuOverride = { isOutputEnabled: true, voltageSetting: 9.6 };
      faultsToInject = [
        {
          pinId: 'ecu-pin-3',
          faultType: 'HIGH_RESISTANCE_50R',
          description: `${item.id}: Cranking / Low KL30 Supply Voltage (<10V)`,
        },
      ];
      expectedProbeOutcome = 'KL30 Sag < 9.6V · Low-Voltage DTC P0562 Active';
    }
    rpmOverride = { isActive: true, rpm: 250, ckpSignalLost: false, camPhaseOffsetDeg: 0 };
    emulationFidelity = is24V ? 'ELECTRICAL_PROXY' : 'DIRECT_16PIN_FAULT';
    emulationNote = is24V
      ? '24V commercial supply sag modeled on PSU + KL30 Pin 3.'
      : 'Direct 16-pin low battery / brownout voltage emulation on KL30 Pin 3.';
  }
  // Priority 5: Overcharging / High Voltage (P0563, >15.5V, >29.5V, 30V+)
  else if (
    dtcUpper.includes('P0563') ||
    combined.includes('overcharg') ||
    combined.includes('sense wire broken') ||
    combined.includes('sense fuse blown') ||
    combined.includes('>15.') ||
    combined.includes('>29.') ||
    combined.includes('30v+')
  ) {
    category = 'POWER_IGNITION';
    severity = 'CRITICAL';
    focusPinId = 'ecu-pin-3';
    focusPinLabel = 'KL30 (Pin 3)';
    const is24VSystem = item.domainNumber === 12 || item.domainNumber === 34;
    psuOverride = {
      isOutputEnabled: true,
      voltageSetting: is24VSystem ? 30.2 : 15.8,
    };
    faultsToInject = [];
    emulationFidelity = 'DIRECT_16PIN_FAULT';
    emulationNote = `PSU set to overvoltage (${psuOverride.voltageSetting}V) to emulate regulator/alternator sense-circuit overcharge.`;
    expectedProbeOutcome = `KL30 Overvoltage (${psuOverride.voltageSetting}V) — Regulator Fault Warning`;
  }
  // Priority 6: Switched Ignition (KL15), Main Relay (P0685), GPS Cut-Off Relay (PH-1482), or Flyback-Damaged Relay (PH-1364)
  else if (
    !combined.includes('corroded engine ground') &&
    (dtcUpper.includes('P0685') ||
      dtcUpper.includes('P2118') ||
      combined.includes('main relay') ||
      combined.includes('main ecm relay') ||
      combined.includes('ecm relay') ||
      combined.includes('engine control relay') ||
      combined.includes('cut-off relay') ||
      combined.includes('flyback diode') ||
      combined.includes('relay without flyback') ||
      combined.includes('etcs fuse') ||
      combined.includes('igsw') ||
      combined.includes('ignition switch'))
  ) {
    category = 'POWER_IGNITION';
    severity = 'CRITICAL';
    const isMainRelay =
      combined.includes('main relay') ||
      combined.includes('main ecm relay') ||
      combined.includes('ecm relay') ||
      combined.includes('engine control relay') ||
      combined.includes('cut-off relay') ||
      combined.includes('flyback diode') ||
      combined.includes('etcs fuse') ||
      dtcUpper.includes('P0685') ||
      dtcUpper.includes('P2118');
    focusPinId = isMainRelay ? 'ecu-pin-12' : 'ecu-pin-4';
    focusPinLabel = isMainRelay ? 'MRELAY (Pin 12)' : 'KL15 (Pin 4)';
    faultsToInject = [
      {
        pinId: focusPinId,
        faultType: 'OPEN_CIRCUIT',
        description: `${item.id}: ${item.title}`,
      },
    ];
    componentOverrides = isMainRelay
      ? [{ componentId: 'comp-relay', state: { isLatched: false } }]
      : componentOverrides;
    rpmOverride = { isActive: true, rpm: 250, ckpSignalLost: false, camPhaseOffsetDeg: 0 };
    emulationFidelity = 'DIRECT_16PIN_FAULT';
    emulationNote = `Direct 16-pin fault on ${focusPinLabel} — breaks ECU wakeup or actuator Pin 87 power.`;
    expectedProbeOutcome = isMainRelay
      ? 'VREF = 5.0V · Main Relay Pin 87 = 0.00V · INJ_1 Disabled'
      : 'KL30 = 12.6V · KL15 = 0.00V · ECU Asleep · NO PULSE';
  }
  // Priority 7: Fuel Pump Relay / Fuel Delivery Low (P0230, P0087, weak fuel pump)
  else if (
    dtcUpper.includes('P0230') ||
    dtcUpper.includes('P0627') ||
    combined.includes('fuel pump') ||
    combined.includes('fuel rail pressure') ||
    dtcUpper.includes('P0087') ||
    dtcUpper.includes('P0088') ||
    dtcUpper.includes('P0193')
  ) {
    const isFpRelay = dtcUpper.includes('P0230') || dtcUpper.includes('P0627') || combined.includes('fuel pump');
    category = isFpRelay ? 'POWER_IGNITION' : 'NO_PULSE_SENSOR';
    severity = 'CRITICAL';
    focusPinId = isFpRelay ? 'ecu-pin-16' : 'ecu-pin-8';
    focusPinLabel = isFpRelay ? 'FP_RELAY (Pin 16)' : 'MAP_SIG (Pin 8)';
    faultsToInject = [
      {
        pinId: focusPinId,
        faultType: isFpRelay ? 'OPEN_CIRCUIT' : dtcUpper.includes('P0088') || dtcUpper.includes('P0193') ? 'SHORT_TO_VBAT' : 'SHORT_TO_GND',
        description: `${item.id}: ${item.title}`,
      },
    ];
    emulationFidelity = isFpRelay ? 'DIRECT_16PIN_FAULT' : 'ELECTRICAL_PROXY';
    emulationNote = isFpRelay
      ? 'Direct 16-pin fault on FP_RELAY (Pin 16).'
      : 'Analog pressure input fault simulated on Pin 8 (MAP/Pressure transducer channel).';
    expectedProbeOutcome = `${focusPinLabel} faulted — abnormal rail/pump voltage observable`;
  }
  // Priority 8: CAN / LIN / U-codes / Network Comm / OBD Dongles / Immobilizer CAN Sync / Domain 43
  else if (
    !combined.includes('corroded engine ground') &&
    (item.domainNumber === 9 ||
      item.domainNumber === 43 ||
      dtcUpper.startsWith('U') ||
      dtcUpper.includes('B2795') ||
      dtcUpper.includes('B2799') ||
      dtcUpper.includes('P1614') ||
      dtcUpper.includes('C1611') ||
      dtcUpper.includes('P0620') ||
      combined.includes('can-h') ||
      combined.includes('can-l') ||
      combined.includes('can bus') ||
      combined.includes('canbus') ||
      combined.includes('lin bus') ||
      combined.includes('j1939') ||
      combined.includes('no-comm') ||
      combined.includes('obd-ii') ||
      combined.includes('nitroobd') ||
      combined.includes("'eco' obd2") ||
      combined.includes('immobilizer'))
  ) {
    category = 'ACTUATOR_BUS';
    severity = 'CRITICAL';
    const isTerminationOrFlood =
      combined.includes('120') ||
      combined.includes('60 ohm') ||
      combined.includes('unterminated') ||
      combined.includes('ringing') ||
      combined.includes('corrosion') ||
      combined.includes('swapped') ||
      combined.includes('wet');
    const isBusShortToVbat =
      combined.includes('stuck at 12v') ||
      combined.includes('shorted to battery') ||
      combined.includes('12.0v');
    const isBusShort =
      combined.includes('short') ||
      combined.includes('stuck at 0v') ||
      combined.includes('pulling bus permanently low') ||
      combined.includes('asymmetric') ||
      combined.includes('corrupting can') ||
      dtcUpper.includes('U0073') ||
      dtcUpper.includes('U0001') ||
      dtcUpper.includes('U1000');
    focusPinId = 'ecu-pin-13';
    focusPinLabel = 'CAN_H (Pin 13)';
    faultsToInject = [
      {
        pinId: 'ecu-pin-13',
        faultType: isBusShortToVbat
          ? 'SHORT_TO_VBAT'
          : isBusShort
            ? 'SHORT_TO_GND'
            : isTerminationOrFlood
              ? 'HIGH_RESISTANCE_250R'
              : 'OPEN_CIRCUIT',
        description: `${item.id}: ${item.title}`,
      },
    ];
    emulationFidelity =
      item.domainNumber === 9 ||
      item.domainNumber === 43 ||
      item.id === 'PH-1323' ||
      item.id === 'PH-1324'
        ? 'DIRECT_16PIN_FAULT'
        : 'ELECTRICAL_PROXY';
    emulationNote = 'Simulated via CAN_H (Pin 13) bus fault in 16-pin MNA network (Key-OFF resistance check on Pins 13–14).';
    expectedProbeOutcome = isBusShortToVbat
      ? 'CAN Bus Shorted to +12V (SHORT_TO_VBAT) · Zero Comm'
      : 'CAN Bus Communication Offline (U0001 / U0073) · Differential Signal Lost';
  }
  // Priority 9: Grounds, Flood/Corrosion, Water Ingress, SGND Bounce
  else if (
    item.domainNumber === 4 ||
    combined.includes('sgnd') ||
    combined.includes('sensor ground') ||
    combined.includes('ground') ||
    combined.includes('corrosion') ||
    combined.includes('green-crust') ||
    combined.includes('green crust') ||
    combined.includes('splice')
  ) {
    category = 'GROUND_WIRING';
    severity = 'WARNING';
    const isSensorGnd = combined.includes('sgnd') || combined.includes('sensor ground') || combined.includes('5v');
    focusPinId = isSensorGnd ? 'ecu-pin-6' : 'ecu-pin-1';
    focusPinLabel = isSensorGnd ? 'SGND (Pin 6)' : 'KL31 (Pin 1)';
    faultsToInject = [
      {
        pinId: focusPinId,
        faultType: 'HIGH_RESISTANCE_250R',
        description: `${item.id}: Corrosion / High-Resistance Ground Lift (+250Ω)`,
      },
    ];
    emulationFidelity = 'DIRECT_16PIN_FAULT';
    emulationNote = `Corroded terminal / ground offset (+250Ω) injected on ${focusPinLabel}. Probe Pin-to-Chassis drop (>0.2V abnormal).`;
    expectedProbeOutcome = `${focusPinLabel} Ground Lift > 1.5V under load · Distorted Baselines`;
  }
  // Priority 10: 5V Reference Collapse / Glitch / Multi-Sensor Short
  else if (
    dtcUpper.includes('P0642') ||
    combined.includes('5v ref') ||
    combined.includes('5v vref') ||
    combined.includes('vref') ||
    combined.includes('5.0v')
  ) {
    category = 'NO_PULSE_SENSOR';
    severity = 'CRITICAL';
    focusPinId = 'ecu-pin-5';
    focusPinLabel = 'VREF_5V (Pin 5)';
    faultsToInject = [
      {
        pinId: 'ecu-pin-5',
        faultType: 'SHORT_TO_GND',
        description: `${item.id}: 5V Reference Collapsed / Shorted`,
      },
    ];
    emulationFidelity = 'DIRECT_16PIN_FAULT';
    emulationNote = 'Direct 5V VREF Pin 5 short-to-ground collapses TPS/MAP/ECT simultaneously.';
    expectedProbeOutcome = 'VREF_5V ≈ 0.00V · TPS/MAP/ECT Flatlined · Multi-Sensor DTCs';
  }
  // Priority 11: Injector driver faults (P0200-P0204, P1261, injector circuit)
  else if (
    dtcUpper.includes('P020') ||
    dtcUpper.includes('P126') ||
    combined.includes('injector circuit') ||
    combined.includes('injector driver') ||
    combined.includes('injector dead-time') ||
    combined.includes('edu')
  ) {
    category = 'ACTUATOR_BUS';
    severity = 'CRITICAL';
    focusPinId = 'ecu-pin-10';
    focusPinLabel = 'INJ_1 (Pin 10)';
    faultsToInject = [
      {
        pinId: 'ecu-pin-10',
        faultType: combined.includes('short') ? 'SHORT_TO_GND' : 'OPEN_CIRCUIT',
        description: `${item.id}: ${item.title}`,
      },
    ];
    emulationFidelity = 'DIRECT_16PIN_FAULT';
    emulationNote = 'Direct 16-pin injector driver fault on INJ_1 (Pin 10) -> P0201 active & zero pulse.';
    expectedProbeOutcome = 'INJ_1 (Pin 10) NO PULSE (0.0 Hz) · P0201 Triggered';
  }
  // Priority 12: Ignition coil / spark trigger / Toyota IGF faults (P0351-P0354, P1300, misfire P030x)
  else if (
    dtcUpper.includes('P035') ||
    dtcUpper.includes('P1300') ||
    dtcUpper.includes('P030') ||
    combined.includes('ignition coil') ||
    combined.includes('igf') ||
    combined.includes('no spark')
  ) {
    category = 'ACTUATOR_BUS';
    severity = 'CRITICAL';
    focusPinId = 'ecu-pin-11';
    focusPinLabel = 'IGN_1 (Pin 11)';
    faultsToInject = [
      {
        pinId: 'ecu-pin-11',
        faultType: combined.includes('short') ? 'SHORT_TO_GND' : 'OPEN_CIRCUIT',
        description: `${item.id}: ${item.title}`,
      },
    ];
    emulationFidelity = 'DIRECT_16PIN_FAULT';
    emulationNote = 'Direct 16-pin ignition primary trigger fault on IGN_1 (Pin 11) -> P0351 & 0.0 Hz spark trigger.';
    expectedProbeOutcome = 'IGN_1 (Pin 11) = NO 5V SPARK TRIGGER PULSE (0.0 Hz)';
  }
  // Priority 13: TPS / APP / ETC (P012x, P21xx)
  else if (
    dtcUpper.includes('P012') ||
    dtcUpper.includes('P21') ||
    combined.includes('throttle') ||
    combined.includes('tps') ||
    combined.includes('app sensor')
  ) {
    category = 'NO_PULSE_SENSOR';
    severity = 'WARNING';
    focusPinId = 'ecu-pin-7';
    focusPinLabel = 'TPS_SIG (Pin 7)';
    const isHigh = dtcUpper.includes('P0123') || combined.includes('high input') || combined.includes('short to 5v');
    faultsToInject = [
      {
        pinId: 'ecu-pin-7',
        faultType: isHigh ? 'SHORT_TO_VBAT' : 'OPEN_CIRCUIT',
        description: `${item.id}: ${item.title}`,
      },
    ];
    emulationFidelity = 'DIRECT_16PIN_FAULT';
    emulationNote = 'Direct 16-pin TPS_SIG (Pin 7) fault -> P0122 / P0123 triggers cleanly in MNA solver.';
    expectedProbeOutcome = `TPS_SIG (Pin 7) out of range -> ${isHigh ? 'P0123 (>4.8V)' : 'P0122 (<0.2V)'}`;
  }
  // Priority 14: ECT / Cooling Temp (P0115-P0119, P0128, P0217, Domain 5 cooling)
  else if (
    dtcUpper.includes('P011') ||
    dtcUpper.includes('P0128') ||
    dtcUpper.includes('P0217') ||
    item.domainNumber === 5 ||
    combined.includes('coolant') ||
    combined.includes('ect') ||
    combined.includes('overheat')
  ) {
    category = 'NO_PULSE_SENSOR';
    severity = dtcUpper.includes('P0217') || combined.includes('overheat') ? 'CRITICAL' : 'WARNING';
    focusPinId = 'ecu-pin-9';
    focusPinLabel = 'ECT_SIG (Pin 9)';
    const isShortLow = dtcUpper.includes('P0117') || dtcUpper.includes('P0217') || combined.includes('overheat') || combined.includes('low');
    faultsToInject = [
      {
        pinId: 'ecu-pin-9',
        faultType: isShortLow ? 'SHORT_TO_GND' : 'OPEN_CIRCUIT',
        description: `${item.id}: ${item.title}`,
      },
    ];
    emulationFidelity = dtcUpper.includes('P011') ? 'DIRECT_16PIN_FAULT' : 'ELECTRICAL_PROXY';
    emulationNote = 'Cooling/ECT electrical fault simulated on Pin 9 (ECT_SIG NTC thermistor channel).';
    expectedProbeOutcome = isShortLow
      ? 'ECT_SIG (Pin 9) < 0.15V (Hot / Shorted Low -> P0117)'
      : 'ECT_SIG (Pin 9) ≈ 5.00V Pull-Up (Open Thermistor -> P0118)';
  }
  // Priority 15: O2 / Lean / Rich / Fuel Trim (P013x, P014x, P0171, P0172, P0420)
  else if (
    dtcUpper.includes('P013') ||
    dtcUpper.includes('P014') ||
    dtcUpper.includes('P0171') ||
    dtcUpper.includes('P0172') ||
    dtcUpper.includes('P0420') ||
    combined.includes('o2') ||
    combined.includes('oxygen')
  ) {
    category = 'NO_PULSE_SENSOR';
    severity = 'WARNING';
    focusPinId = 'ecu-pin-15';
    focusPinLabel = 'O2_SIG (Pin 15)';
    const isRich = dtcUpper.includes('P0172') || dtcUpper.includes('P0132') || combined.includes('rich');
    faultsToInject = [
      {
        pinId: 'ecu-pin-15',
        faultType: isRich ? 'SHORT_TO_VBAT' : 'OPEN_CIRCUIT',
        description: `${item.id}: ${item.title}`,
      },
    ];
    emulationFidelity = dtcUpper.includes('P013') || dtcUpper.includes('P014') ? 'DIRECT_16PIN_FAULT' : 'ELECTRICAL_PROXY';
    emulationNote = 'Oxygen/Fuel-trim electrical response simulated on O2_SIG (Pin 15).';
    expectedProbeOutcome = isRich
      ? 'O2_SIG (Pin 15) stuck rich (>0.85V)'
      : 'O2_SIG (Pin 15) flatlined lean / open (~0.00V or bias 0.45V)';
  }
  // Priority 16: General MAP/MAF/Boost/AT/ABS/EPS/ADAS/Cabin/4WD electrical proxy
  else {
    const isBusDomain =
      item.domainNumber === 6 ||
      item.domainNumber === 7 ||
      item.domainNumber === 8 ||
      item.domainNumber === 10 ||
      item.domainNumber === 15 ||
      item.domainNumber === 16 ||
      item.domainNumber === 17 ||
      item.domainNumber === 44;
    category = isBusDomain ? 'ACTUATOR_BUS' : 'NO_PULSE_SENSOR';
    severity = 'WARNING';
    focusPinId = isBusDomain ? 'ecu-pin-13' : 'ecu-pin-8';
    focusPinLabel = isBusDomain ? 'CAN_H (Pin 13)' : 'MAP_SIG (Pin 8)';
    faultsToInject = [
      {
        pinId: focusPinId,
        faultType: isBusDomain ? 'HIGH_RESISTANCE_50R' : 'OPEN_CIRCUIT',
        description: `${item.id}: ${item.title} (16-Pin Bench Electrical Proxy)`,
      },
    ];
    emulationFidelity = 'ELECTRICAL_PROXY';
    emulationNote = isBusDomain
      ? `Domain ${item.domainNumber} subsystem fault represented on 16-pin bench via ${focusPinLabel} signal degradation (+50Ω).`
      : `Analog sensor/load circuit represented on 16-pin bench via ${focusPinLabel} open circuit.`;
    expectedProbeOutcome = `${focusPinLabel} degraded (${faultsToInject[0].faultType}) · ${dtcUpper}`;
  }

  return {
    id: `ph-${item.id.toLowerCase()}`,
    phId: item.id,
    batch: getPhScenarioBatch(item.domainNumber),
    domainNumber: item.domainNumber,
    domainName: item.domainName,
    phContext: item.phContext,
    symptoms: item.symptoms,
    diagnosticSteps: item.diagnosticSteps,
    sourcePage: item.sourcePage,
    provenanceStatus: 'CROSS_REFERENCED',
    emulationFidelity,
    emulationNote,
    title: `${item.id}: ${item.title}`,
    subtitle: `${item.phContext} · Symptoms: ${item.symptoms}`,
    category,
    severity,
    symptomTag: `${item.id} · ${item.dtcCode} · ${
      emulationFidelity === 'DIRECT_16PIN_FAULT'
        ? '16-PIN DIRECT'
        : emulationFidelity === 'ELECTRICAL_PROXY'
          ? 'BENCH PROXY'
          : 'REF PROCEDURE'
    }`,
    expectedProbeOutcome,
    diagnosticHint: `${item.diagnosticSteps} [${emulationNote}]`,
    focusPinId,
    focusPinLabel,
    faultsToInject,
    psuOverride,
    rpmOverride,
    componentOverrides,
    relatedDtcs,
  };
}

export const PH_BENCH_TROUBLE_SCENARIOS: readonly PhBenchTroubleScenario[] =
  PH_TROUBLE_SCENARIOS_ALL.map(mapPhScenarioToBenchScenario);

export const PH_BATCH1_BENCH_SCENARIOS: readonly PhBenchTroubleScenario[] =
  PH_BENCH_TROUBLE_SCENARIOS.filter((s) => s.batch === 1);

export const PH_BATCH2_BENCH_SCENARIOS: readonly PhBenchTroubleScenario[] =
  PH_BENCH_TROUBLE_SCENARIOS.filter((s) => s.batch === 2);

export const PH_BATCH3_BENCH_SCENARIOS: readonly PhBenchTroubleScenario[] =
  PH_BENCH_TROUBLE_SCENARIOS.filter((s) => s.batch === 3);

export const PH_BATCH4_BENCH_SCENARIOS: readonly PhBenchTroubleScenario[] =
  PH_BENCH_TROUBLE_SCENARIOS.filter((s) => s.batch === 4);

const BENCH_SCENARIO_BY_ID = new Map<string, BenchTroubleScenario>([
  ...BENCH_TROUBLE_SCENARIOS.map((s) => [s.id, s] as const),
  ...PH_BENCH_TROUBLE_SCENARIOS.map((s) => [s.id, s] as const),
  ...PH_BENCH_TROUBLE_SCENARIOS.map((s) => [s.phId.toUpperCase(), s] as const),
]);

export function findBenchTroubleScenarioById(id: string): BenchTroubleScenario | undefined {
  return BENCH_SCENARIO_BY_ID.get(id) ?? BENCH_SCENARIO_BY_ID.get(id.toUpperCase());
}

