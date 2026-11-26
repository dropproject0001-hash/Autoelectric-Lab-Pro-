/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import {
  EcuPin,
  InjectedFault,
  WireConnection,
  BenchComponent,
  MultimeterState,
  PowerSupplyState,
  DiagnosticTroubleCode,
} from '../../types/ecu';
import { CircuitNetwork, CircuitSolutionResult } from '../electrical/CircuitNetwork';
import { AutomotiveModels } from '../components/AutomotiveModels';
import type { MapCalibrationPreset } from '../telemetry/telemetryTypes';
import { FaultManager } from '../faults/FaultManager';
import { SignalGenerator } from '../signals/SignalGenerator';

export const DEFAULT_ECU_PINS: EcuPin[] = [
  { id: 'ecu-pin-1', pinNumber: 1, label: 'KL31', name: 'Power Ground 1', category: 'ground', nominalVoltage: 0.0, internalResistance: 0.08, description: 'Chassis/Engine Ground Return' },
  { id: 'ecu-pin-2', pinNumber: 2, label: 'KL31_2', name: 'Power Ground 2', category: 'ground', nominalVoltage: 0.0, internalResistance: 0.08, description: 'Power Ground Secondary' },
  { id: 'ecu-pin-3', pinNumber: 3, label: 'KL30', name: 'Battery Constant +12V', category: 'power', nominalVoltage: 12.6, internalResistance: 0.2, description: 'Unswitched Battery Supply (+30)' },
  { id: 'ecu-pin-4', pinNumber: 4, label: 'KL15', name: 'Ignition Switch Input', category: 'power', nominalVoltage: 12.6, internalResistance: 1200, description: 'Switched Terminal 15 (+15)' },
  { id: 'ecu-pin-5', pinNumber: 5, label: 'VREF_5V', name: 'Sensor 5V Reference', category: 'reference', nominalVoltage: 5.0, internalResistance: 8.5, description: 'Regulated 5.00V Supply (Max 150mA)' },
  { id: 'ecu-pin-6', pinNumber: 6, label: 'SGND', name: 'Sensor Clean Ground', category: 'ground', nominalVoltage: 0.0, internalResistance: 0.35, description: 'Analog Ground Reference' },
  { id: 'ecu-pin-7', pinNumber: 7, label: 'TPS_SIG', name: 'Throttle Position Signal', category: 'sensor_in', nominalVoltage: 1.28, internalResistance: 47000, description: 'Analog ADC input 0.5V - 4.5V (1.28V @ 20% default)' },
  { id: 'ecu-pin-8', pinNumber: 8, label: 'MAP_SIG', name: 'Manifold Pressure Signal', category: 'sensor_in', nominalVoltage: 1.58, internalResistance: 47000, description: 'Pressure Transducer Input (1.58V @ 42 kPa idle)' },
  { id: 'ecu-pin-9', pinNumber: 9, label: 'ECT_SIG', name: 'Coolant Temp Signal', category: 'sensor_in', nominalVoltage: 0.55, internalResistance: 2200, description: 'Internal Pull-Up 2.2kΩ to 5V (0.55V @ 85°C warm)' },
  { id: 'ecu-pin-10', pinNumber: 10, label: 'INJ_1', name: 'Injector 1 Driver', category: 'actuator_out', nominalVoltage: 12.6, internalResistance: 0.15, description: 'Low-Side MOSFET Sink to GND' },
  { id: 'ecu-pin-11', pinNumber: 11, label: 'IGN_1', name: 'Ignition Coil 1 Trigger', category: 'actuator_out', nominalVoltage: 0.0, internalResistance: 100, description: '5V Logic Trigger / Smart Coil' },
  { id: 'ecu-pin-12', pinNumber: 12, label: 'MRELAY', name: 'Main Relay Control', category: 'actuator_out', nominalVoltage: 12.6, internalResistance: 0.2, description: 'Low-side Relay Pull-Down' },
  { id: 'ecu-pin-13', pinNumber: 13, label: 'CAN_H', name: 'High-Speed CAN High', category: 'communication', nominalVoltage: 2.5, internalResistance: 60, description: 'Recessive 2.5V, Dominant 3.5V' },
  { id: 'ecu-pin-14', pinNumber: 14, label: 'CAN_L', name: 'High-Speed CAN Low', category: 'communication', nominalVoltage: 2.5, internalResistance: 60, description: 'Recessive 2.5V, Dominant 1.5V' },
  { id: 'ecu-pin-15', pinNumber: 15, label: 'O2_SIG', name: 'Oxygen Sensor 1 Bank 1', category: 'sensor_in', nominalVoltage: 0.45, internalResistance: 100000, description: 'Zirconia Nernst Cell 0.1V - 0.9V' },
  { id: 'ecu-pin-16', pinNumber: 16, label: 'FP_RELAY', name: 'Fuel Pump Relay Driver', category: 'actuator_out', nominalVoltage: 12.6, internalResistance: 0.2, description: 'Low-Side Ground Switched' },
];

export interface UniversalSimulationProfileSpec {
  id: 'universal-16pin-bench-trainer';
  name: string;
  isOemPinout: false;
  safetyDisclaimer: string;
  obd2DlcPinMapping: ReadonlyArray<{
    dlcPin: number;
    dlcSignal: string;
    benchPinId: string;
    benchPinNumber: number;
    note: string;
  }>;
  simulationLevels: {
    LEVEL_1_DC_MNA: string;
    LEVEL_2_SIGNAL_GENERATOR: string;
    LEVEL_3_CONCEPTUAL_BOUNDS: string;
  };
}

export const UNIVERSAL_SIMULATION_PROFILE: UniversalSimulationProfileSpec = {
  id: 'universal-16pin-bench-trainer',
  name: 'Universal 16-Pin Bench Trainer (Non-OEM Simulation Model)',
  isOemPinout: false,
  safetyDisclaimer:
    'Generic educational ECU breakout model. Do NOT apply physical power using these trainer pin numbers — consult exact OEM ECU connector face views and part numbers first, and distinguish ECU harness pins from SAE J1962 OBD-II DLC pins.',
  obd2DlcPinMapping: [
    { dlcPin: 4, dlcSignal: 'Chassis Ground', benchPinId: 'ecu-pin-1', benchPinNumber: 1, note: 'ECU Power GND (KL31) vs OBD-II DLC Pin 4' },
    { dlcPin: 5, dlcSignal: 'Signal Ground', benchPinId: 'ecu-pin-6', benchPinNumber: 6, note: 'Analog Sensor GND (SGND) vs OBD-II DLC Pin 5' },
    { dlcPin: 6, dlcSignal: 'CAN High (ISO 15765)', benchPinId: 'ecu-pin-13', benchPinNumber: 13, note: 'CAN_H Bus Node vs OBD-II DLC Pin 6' },
    { dlcPin: 14, dlcSignal: 'CAN Low (ISO 15765)', benchPinId: 'ecu-pin-14', benchPinNumber: 14, note: 'CAN_L Bus Node vs OBD-II DLC Pin 14' },
    { dlcPin: 16, dlcSignal: 'Battery +12V (KL30)', benchPinId: 'ecu-pin-3', benchPinNumber: 3, note: 'Unfused DLC Pin 16 vs ECU Bench Pin 3 (KL30)' },
  ],
  simulationLevels: {
    LEVEL_1_DC_MNA: 'Linear resistive Modified Nodal Analysis (DC node voltages, branch currents, fault loading, current limiting).',
    LEVEL_2_SIGNAL_GENERATOR: 'Synthesized deterministic CKP/CMP/CAN/PWM waveform frames conditioned by MNA bus voltage and faults.',
    LEVEL_3_CONCEPTUAL_BOUNDS: 'Does not model full transient inductance/back-EMF flyback spikes, thermal runaway, or OEM proprietary security/immobilizer handshakes.',
  },
};

export const DEFAULT_BENCH_COMPONENTS: BenchComponent[] = [
  {
    id: 'comp-tps',
    name: 'Throttle Position Sensor (TPS)',
    type: 'sensor',
    x: 480,
    y: 60,
    pins: [
      { id: 'tps-vcc', label: '5V VCC', type: 'power', relativeX: 0, relativeY: 46 },
      { id: 'tps-sig', label: 'WIPER SIG', type: 'output', relativeX: 0, relativeY: 78 },
      { id: 'tps-gnd', label: 'GND', type: 'ground', relativeX: 0, relativeY: 110 },
    ],
    state: { throttleAnglePercent: 20 },
  },
  {
    id: 'comp-map',
    name: 'Manifold Pressure (MAP)',
    type: 'sensor',
    x: 480,
    y: 220,
    pins: [
      { id: 'map-vcc', label: '5V VCC', type: 'power', relativeX: 0, relativeY: 46 },
      { id: 'map-sig', label: 'PRESSURE SIG', type: 'output', relativeX: 0, relativeY: 78 },
      { id: 'map-gnd', label: 'GND', type: 'ground', relativeX: 0, relativeY: 110 },
    ],
    state: { pressureKpa: 42 },
  },
  {
    id: 'comp-ect',
    name: 'Coolant Temp Sensor (ECT)',
    type: 'sensor',
    x: 480,
    y: 380,
    pins: [
      { id: 'ect-sig', label: 'THERMISTOR +', type: 'input', relativeX: 0, relativeY: 46 },
      { id: 'ect-gnd', label: 'GND RETURN', type: 'ground', relativeX: 0, relativeY: 78 },
    ],
    state: { tempCelsius: 85 },
  },
  {
    id: 'comp-inj',
    name: 'Cylinder 1 Fuel Injector',
    type: 'actuator',
    x: 770,
    y: 60,
    pins: [
      { id: 'inj-vbat', label: '+12V BATTERY', type: 'power', relativeX: 0, relativeY: 46 },
      { id: 'inj-ctrl', label: 'ECU SINK CTRL', type: 'input', relativeX: 0, relativeY: 78 },
    ],
    state: { coilResistanceOhms: 12.5, isFiring: true },
  },
  {
    id: 'comp-relay',
    name: 'Main System Relay (ISO)',
    type: 'relay',
    x: 770,
    y: 210,
    pins: [
      { id: 'relay-30', label: 'PIN 30 (+12V IN)', type: 'power', relativeX: 0, relativeY: 46 },
      { id: 'relay-87', label: 'PIN 87 (LOAD OUT)', type: 'output', relativeX: 0, relativeY: 78 },
      { id: 'relay-86', label: 'PIN 86 (COIL +)', type: 'power', relativeX: 0, relativeY: 110 },
      { id: 'relay-85', label: 'PIN 85 (COIL -)', type: 'input', relativeX: 0, relativeY: 142 },
    ],
    state: { isLatched: true, coilResistanceOhms: 85 },
  },
  {
    id: 'comp-can',
    name: 'CAN Bus Terminator (120Ω)',
    type: 'bus_node',
    x: 770,
    y: 400,
    pins: [
      { id: 'can-term-h', label: 'CAN-H TERMINAL', type: 'input', relativeX: 0, relativeY: 46 },
      { id: 'can-term-l', label: 'CAN-L TERMINAL', type: 'input', relativeX: 0, relativeY: 78 },
    ],
    state: { terminatingResistanceOhms: 120 },
  },
];

export const DEFAULT_WIRES: WireConnection[] = [
  { id: 'wire-1', sourcePinId: 'ecu-pin-5', targetPinId: 'tps-vcc', color: '#eab308', label: '5V VREF -> TPS VCC', isCut: false, resistance: 0.05 },
  { id: 'wire-2', sourcePinId: 'ecu-pin-7', targetPinId: 'tps-sig', color: '#22c55e', label: 'TPS SIG -> ECU Pin 7', isCut: false, resistance: 0.05 },
  { id: 'wire-3', sourcePinId: 'ecu-pin-6', targetPinId: 'tps-gnd', color: '#78716c', label: 'TPS GND -> ECU SGND', isCut: false, resistance: 0.05 },

  { id: 'wire-4', sourcePinId: 'ecu-pin-5', targetPinId: 'map-vcc', color: '#eab308', label: '5V VREF -> MAP VCC', isCut: false, resistance: 0.05 },
  { id: 'wire-5', sourcePinId: 'ecu-pin-8', targetPinId: 'map-sig', color: '#06b6d4', label: 'MAP SIG -> ECU Pin 8', isCut: false, resistance: 0.05 },
  { id: 'wire-6', sourcePinId: 'ecu-pin-6', targetPinId: 'map-gnd', color: '#78716c', label: 'MAP GND -> ECU SGND', isCut: false, resistance: 0.05 },

  { id: 'wire-7', sourcePinId: 'ecu-pin-9', targetPinId: 'ect-sig', color: '#f97316', label: 'ECT SIG -> ECU Pin 9', isCut: false, resistance: 0.05 },
  { id: 'wire-8', sourcePinId: 'ecu-pin-6', targetPinId: 'ect-gnd', color: '#78716c', label: 'ECT GND -> ECU SGND', isCut: false, resistance: 0.05 },

  { id: 'wire-9', sourcePinId: 'ecu-pin-10', targetPinId: 'inj-ctrl', color: '#3b82f6', label: 'ECU INJ1 -> Injector Sink', isCut: false, resistance: 0.05 },

  { id: 'wire-10', sourcePinId: 'ecu-pin-13', targetPinId: 'can-term-h', color: '#6366f1', label: 'CAN_H -> Bus Terminator', isCut: false, resistance: 0.05 },
  { id: 'wire-11', sourcePinId: 'ecu-pin-14', targetPinId: 'can-term-l', color: '#a855f7', label: 'CAN_L -> Bus Terminator', isCut: false, resistance: 0.05 },
];

export interface CircuitSolution {
  nodeVoltages: Record<string, number>;
  /** Strictly null for floating or unresolved nodes — never silently coerced to a valid 0V measurement */
  validatedNodeVoltages?: Record<string, number | null>;
  nodeMeasurementStatuses?: Record<string, 'VALID' | 'UNRESOLVED' | 'UNSTABLE' | 'UNAVAILABLE'>;
  unresolvedNodes?: string[];
  solverStatus?: 'VALID' | 'UNRESOLVED' | 'UNSTABLE' | 'NON_FINITE';
  solverWarnings?: string[];
  nodeResistances: Record<string, number>;
  wireCurrentsMa: Record<string, number>;
  supplyCurrentDrawAmps: number;
  isSupplyCurrentTripped: boolean;
  activeDTCs: DiagnosticTroubleCode[];
  multimeterReading: {
    display: string;
    value: number;
    unit: string;
    isOverLimit: boolean;
    isWarning: boolean;
    warningMessage?: string;
    shouldBeep: boolean;
    evidenceStatus?: 'VALID' | 'UNRESOLVED' | 'UNSTABLE' | 'UNAVAILABLE';
    evidenceSource?: 'ELECTRICAL_SIMULATION';
  };
}

export interface SolveCircuitOptions {
  rpm?: number;
  isInjectorFiring?: boolean;
  hasCanFault?: boolean;
  hasInjectorFault?: boolean;
  camPhaseOffsetDeg?: number;
  ckpSignalLost?: boolean;
}

const NODE_TO_PIN_ID_MAP: Record<string, string> = {
  'tps-sig': 'ecu-pin-7',
  'map-sig': 'ecu-pin-8',
  'ect-sig': 'ecu-pin-9',
  'inj-ctrl': 'ecu-pin-10',
  'can-term-h': 'ecu-pin-13',
  'can-term-l': 'ecu-pin-14',
};

function mapNodeToSignalPinId(nodeId: string, pins: EcuPin[]): EcuPin | null {
  const norm = nodeId.toLowerCase();
  const direct = pins.find((p) => p.id === norm);
  if (direct) return direct;
  const mappedId = NODE_TO_PIN_ID_MAP[norm];
  if (mappedId) {
    return pins.find((p) => p.id === mappedId) ?? null;
  }
  return null;
}

function estimateWaveformMetrics(
  redNode: string,
  blackNode: string,
  pins: EcuPin[],
  nodeVoltages: Record<string, number>,
  faults: InjectedFault[],
  isPowerOn: boolean,
  isEcuAwake: boolean,
  simOptions: Required<SolveCircuitOptions>
): { acRms: number; freqHz: number } {
  const redPin = mapNodeToSignalPinId(redNode, pins);
  const blackPin = mapNodeToSignalPinId(blackNode, pins);
  const vRedDc = nodeVoltages[redNode] ?? 0;
  const vBlackDc = nodeVoltages[blackNode] ?? 0;

  if (!isPowerOn || !isEcuAwake || (!redPin && !blackPin)) {
    return { acRms: 0, freqHz: 0 };
  }

  const sampleCount = 96;
  // Choose 160ms window for low-frequency pulse trains so AC RMS & edge counting capture multiple cycles cleanly
  const hasSlowSignal =
    redPin?.id === 'ecu-pin-10' ||
    redPin?.id === 'ecu-pin-11' ||
    redPin?.id === 'ecu-pin-15' ||
    blackPin?.id === 'ecu-pin-10' ||
    blackPin?.id === 'ecu-pin-11' ||
    blackPin?.id === 'ecu-pin-15';
  const windowMs = hasSlowSignal ? 160 : 20;

  const redFault = redPin ? faults.find((f) => f.pinId === redPin.id)?.faultType ?? 'NONE' : 'NONE';
  const blackFault = blackPin ? faults.find((f) => f.pinId === blackPin.id)?.faultType ?? 'NONE' : 'NONE';

  const sRed = redPin
    ? SignalGenerator.samplePinWaveformSeries({
        pinId: redPin.id,
        pinLabel: redPin.label,
        mnaNodeVoltage: vRedDc,
        faultType: redFault,
        isPowerOn,
        isEcuAwake,
        ckpSignalLost: simOptions.ckpSignalLost,
        hasCanFault: simOptions.hasCanFault,
        hasInjectorFault: simOptions.hasInjectorFault,
        isInjectorFiring: simOptions.isInjectorFiring,
        rpm: simOptions.rpm,
        tStartSec: 0,
        windowMs,
        sampleCount,
      })
    : null;

  const sBlack = blackPin
    ? SignalGenerator.samplePinWaveformSeries({
        pinId: blackPin.id,
        pinLabel: blackPin.label,
        mnaNodeVoltage: vBlackDc,
        faultType: blackFault,
        isPowerOn,
        isEcuAwake,
        ckpSignalLost: simOptions.ckpSignalLost,
        hasCanFault: simOptions.hasCanFault,
        hasInjectorFault: simOptions.hasInjectorFault,
        isInjectorFiring: simOptions.isInjectorFiring,
        rpm: simOptions.rpm,
        tStartSec: 0,
        windowMs,
        sampleCount,
      })
    : null;

  const diffSamples = new Array<number>(sampleCount);
  let meanDiff = 0;
  for (let i = 0; i < sampleCount; i++) {
    const vr = sRed ? sRed.samples[i]?.voltage ?? vRedDc : vRedDc;
    const vb = sBlack ? sBlack.samples[i]?.voltage ?? vBlackDc : vBlackDc;
    const d = vr - vb;
    diffSamples[i] = d;
    meanDiff += d;
  }
  meanDiff /= sampleCount;

  let sumSqAc = 0;
  for (let i = 0; i < sampleCount; i++) {
    const ac = diffSamples[i] - meanDiff;
    sumSqAc += ac * ac;
  }
  const acRms = Math.sqrt(sumSqAc / sampleCount);

  let freqHz = 0;
  if (acRms > 0.02) {
    const primaryFreq = sRed?.freqHz || sBlack?.freqHz || 0;
    freqHz = primaryFreq;
  }

  return { acRms, freqHz };
}

type NonLinearAuxMode = 'OFF' | 'FWD' | 'REV_CLAMP';

function resolvePolarizedPins(
  comp: BenchComponent,
  preferSwappedDefault = false
): { anodePinId: string; cathodePinId: string } {
  const pins = comp.pins;
  const findPin = (role: string) =>
    pins.find(
      (p) =>
        p.id.toLowerCase().endsWith(`-${role}`) ||
        p.label.toUpperCase().includes(role.toUpperCase())
    );
  let anodePin = findPin('anode');
  let cathodePin = findPin('cathode');
  if (!anodePin || !cathodePin || anodePin.id === cathodePin.id) {
    anodePin = preferSwappedDefault ? pins[1] : pins[0];
    cathodePin = preferSwappedDefault ? pins[0] : pins[1];
  }
  if (Boolean(comp.state?.isReverse ?? false)) {
    return { anodePinId: cathodePin.id, cathodePinId: anodePin.id };
  }
  return { anodePinId: anodePin.id, cathodePinId: cathodePin.id };
}

function getAuxiliaryNonLinearIds(components: BenchComponent[]): BenchComponent[] {
  return components.filter(
    (c) =>
      c.id !== 'comp-tps' &&
      c.id !== 'comp-map' &&
      c.id !== 'comp-ect' &&
      c.id !== 'comp-inj' &&
      c.id !== 'comp-relay' &&
      c.id !== 'comp-can' &&
      c.pins &&
      c.pins.length >= 2 &&
      (c.type === 'diode' || c.type === 'led' || c.type === 'relay')
  );
}

function isRelayCoilWired(comp: BenchComponent, wires: WireConnection[]): boolean {
  const pins = comp.pins;
  const p86 = pins.find((p) => p.id.endsWith('pin86')) || pins[3];
  const p85 = pins.find((p) => p.id.endsWith('pin85')) || pins[4];
  if (!p86 || !p85) return false;
  return wires.some(
    (w) =>
      !w.isCut &&
      (w.sourcePinId === p86.id ||
        w.targetPinId === p86.id ||
        w.sourcePinId === p85.id ||
        w.targetPinId === p85.id)
  );
}

function buildBenchNetwork(
  powerSupply: PowerSupplyState,
  faults: InjectedFault[],
  wires: WireConnection[],
  components: BenchComponent[],
  effectiveSupplyVolts: number,
  mapSupplyVolts: number,
  nonLinearModes: Map<string, NonLinearAuxMode> = new Map(),
  relayEnergizedMap: Map<string, boolean> = new Map(),
  ldoReflectLoadOhms: number | null = null,
  isEcuLogicAwake: boolean = true
): CircuitNetwork {
  const net = new CircuitNetwork();
  const isPowerOn = powerSupply.isOutputEnabled && powerSupply.voltageSetting > 0.4;

  // 1. Stamp Laboratory Power Supply (with physical 0.02Ω lead/internal impedance)
  if (isPowerOn) {
    net.addVoltageSource('bench-vsource', 'bench-vbat', 'chassis-gnd', effectiveSupplyVolts, 0.02);
    if (ldoReflectLoadOhms !== null && isFinite(ldoReflectLoadOhms) && ldoReflectLoadOhms > 0.5) {
      net.addResistor('ecu-vref-supply-reflect', 'bench-vbat', 'chassis-gnd', ldoReflectLoadOhms);
    }
  } else {
    net.addResistor('bench-off-bleed', 'bench-vbat', 'chassis-gnd', 1e6);
  }

  // 2. Stamp ECU Ground & Power Rails with physical series terminal fault impedance
  const gnd1FaultR = FaultManager.getSeriesFaultOhms(faults, 'ecu-pin-1');
  const gnd2FaultR = FaultManager.getSeriesFaultOhms(faults, 'ecu-pin-2');
  const sgndFaultR = FaultManager.getSeriesFaultOhms(faults, 'ecu-pin-6');
  const kl30FaultR = FaultManager.getSeriesFaultOhms(faults, 'ecu-pin-3');
  const kl15FaultR = FaultManager.getSeriesFaultOhms(faults, 'ecu-pin-4');
  const mrelayFaultR = FaultManager.getSeriesFaultOhms(faults, 'ecu-pin-12');
  const fpRelayFaultR = FaultManager.getSeriesFaultOhms(faults, 'ecu-pin-16');

  // Pin 1 & Pin 2: Ground returns to Chassis Ground
  net.addResistor('ecu-gnd-1', 'ecu-pin-1', 'chassis-gnd', 0.08 + gnd1FaultR);
  net.addResistor('ecu-gnd-2', 'ecu-pin-2', 'chassis-gnd', 0.08 + gnd2FaultR);

  // Pin 3 (KL30) & Pin 4 (KL15): Fed from bench +12V supply with realistic ECU logic return to Pin 1 / Pin 2
  net.addResistor('ecu-kl30-feed', 'bench-vbat', 'ecu-pin-3', 0.2 + kl30FaultR);
  net.addResistor('ecu-kl15-feed', 'bench-vbat', 'ecu-pin-4', 0.2 + kl15FaultR);
  net.addResistor('ecu-kl30-load', 'ecu-pin-3', 'ecu-pin-1', 150.0);
  net.addResistor('ecu-kl15-load', 'ecu-pin-4', 'ecu-pin-2', 150.0);

  // Pin 6: Sensor clean ground plane (with series fault resistance if corroded/open)
  net.addResistor('ecu-sgnd-plane', 'ecu-pin-6', 'chassis-gnd', 0.35 + sgndFaultR);

  // Pin 5: Regulated +5.00V Sensor Reference Supply Rail (Internal LDO requires KL30 & KL15 ECU wake headroom)
  const vrefSeriesFault = FaultManager.getSeriesFaultOhms(faults, 'ecu-pin-5');
  if (isPowerOn && isEcuLogicAwake && effectiveSupplyVolts >= 6.5) {
    net.addVoltageSource('ecu-vref-ldo', 'ecu-pin-5', 'ecu-pin-6', 5.0, 8.5 + vrefSeriesFault);
  } else if (isPowerOn && isEcuLogicAwake && effectiveSupplyVolts > 1.5) {
    // LDO Dropout mode
    net.addVoltageSource(
      'ecu-vref-ldo',
      'ecu-pin-5',
      'ecu-pin-6',
      Math.max(0, effectiveSupplyVolts - 1.2),
      8.5 + vrefSeriesFault
    );
  } else {
    net.addResistor('ecu-vref-off', 'ecu-pin-5', 'ecu-pin-6', 4700 + vrefSeriesFault);
  }

  // Pin 9 (ECT ADC input with internal 2.2kΩ pull-up to +5V VREF)
  net.addResistor('ecu-ect-pullup', 'ecu-pin-5', 'ecu-pin-9', 2200);

  // Pin 7 & Pin 8 (ADC input buffers with 47kΩ internal impedance to sensor ground)
  net.addResistor('ecu-tps-adc', 'ecu-pin-7', 'ecu-pin-6', 47000);
  net.addResistor('ecu-map-adc', 'ecu-pin-8', 'ecu-pin-6', 47000);

  // Pin 13 & Pin 14: ECU High-Speed CAN Bus termination (120Ω between CAN-H and CAN-L)
  net.addResistor('ecu-can-termination', 'ecu-pin-13', 'ecu-pin-14', 120.0);
  // CAN Transceiver recessive biasing to 2.5V (collapses when ECU wake power KL30/KL15 is lost or brownout)
  if (isPowerOn && isEcuLogicAwake && effectiveSupplyVolts >= 4.0) {
    net.addVoltageSource('can-h-bias', 'ecu-pin-13', 'chassis-gnd', 2.5, 60.0);
    net.addVoltageSource('can-l-bias', 'ecu-pin-14', 'chassis-gnd', 2.5, 60.0);
  } else {
    net.addResistor('can-h-off', 'ecu-pin-13', 'chassis-gnd', 10000);
    net.addResistor('can-l-off', 'ecu-pin-14', 'chassis-gnd', 10000);
  }

  // 3. Stamp Components into Network
  const tpsComp = components.find((c) => c.id === 'comp-tps');
  const angle = (tpsComp?.state?.throttleAnglePercent as number) ?? 20;
  // TPS potentiometer sits directly across tps-vcc and tps-gnd, so MNA inherently scales it ratiometrically
  const tpsModel = AutomotiveModels.calculateTps(angle, 5.0);
  net.addResistor('tps-upper', 'tps-vcc', 'tps-sig', tpsModel.rUpper);
  net.addResistor('tps-lower', 'tps-sig', 'tps-gnd', tpsModel.rLower);

  const ectComp = components.find((c) => c.id === 'comp-ect');
  const temp = (ectComp?.state?.tempCelsius as number) ?? 85;
  const ectModel = AutomotiveModels.calculateEct(temp, 5.0);
  net.addResistor('ect-ntc', 'ect-sig', 'ect-gnd', ectModel.resistanceOhms);

  const mapComp = components.find((c) => c.id === 'comp-map');
  const kpa = (mapComp?.state?.pressureKpa as number) ?? 42;
  const mapPreset = (mapComp?.state?.calibrationPreset as MapCalibrationPreset | undefined) ?? 'BAR_1_NA';
  const mapModel = AutomotiveModels.calculateMap(kpa, mapSupplyVolts, mapPreset);
  // Active MAP pressure transducer powered by map-vcc (which equals 0V if wire-4/VREF opens)
  net.addVoltageSource('map-transducer', 'map-sig', 'map-gnd', isPowerOn && isEcuLogicAwake ? mapModel.voltage : 0.0, 150);
  net.addResistor('map-vcc-load', 'map-vcc', 'map-gnd', 3500);

  // Injector Solenoid (dynamic coil resistance from component state)
  const injComp = components.find((c) => c.id === 'comp-inj');
  const injCoilOhms = Math.max(0.5, Number(injComp?.state?.coilResistanceOhms ?? 12.5));
  net.addResistor('inj-vbat-feed', 'bench-vbat', 'inj-vbat', 0.1);
  net.addResistor('inj-coil', 'inj-vbat', 'inj-ctrl', injCoilOhms);
  net.addResistor('inj-lowside-driver', 'ecu-pin-10', 'ecu-pin-1', 10000);

  // Pin 11: Ignition Coil 1 Trigger (5V logic output resting at 0.0V low state in DC quiescent mode)
  net.addResistor('ecu-ign1-pd', 'ecu-pin-11', 'ecu-pin-1', 100);

  // Main System Relay & Pin 12 (dynamic coil resistance + latch state)
  const relayComp = components.find((c) => c.id === 'comp-relay');
  const relayCoilOhms = Math.max(10.0, Number(relayComp?.state?.coilResistanceOhms ?? 85.0));
  const relayLatched = Boolean(relayComp?.state?.isLatched ?? true);
  net.addResistor('relay-30-feed', 'bench-vbat', 'relay-30', 0.1);
  net.addResistor('relay-86-feed', 'bench-vbat', 'relay-86', 0.1);
  net.addResistor('relay-coil', 'relay-86', 'relay-85', relayCoilOhms);
  net.addResistor('relay-contacts', 'relay-30', 'relay-87', isPowerOn && isEcuLogicAwake && relayLatched ? 0.05 : 1e9);
  net.addResistor('relay-87-bleed', 'relay-87', 'chassis-gnd', 100000);
  net.addResistor('wire-mrelay', 'relay-85', 'ecu-pin-12', 0.05 + mrelayFaultR);
  net.addResistor('ecu-mrelay-off', 'ecu-pin-12', 'ecu-pin-2', 10000);

  // Pin 15: Oxygen Sensor 1 Bank 1 (0.45V ECU stoichiometric bias reference)
  const o2SeriesFault = FaultManager.getSeriesFaultOhms(faults, 'ecu-pin-15');
  if (isPowerOn && isEcuLogicAwake && effectiveSupplyVolts >= 4.0) {
    net.addVoltageSource('ecu-o2-bias', 'ecu-pin-15', 'ecu-pin-6', 0.45, 10000 + o2SeriesFault);
  } else {
    net.addResistor('ecu-o2-off', 'ecu-pin-15', 'ecu-pin-6', 100000 + o2SeriesFault);
  }

  // Pin 16: Fuel Pump Relay Driver (Fed through 85Ω fuel pump relay coil from +12V)
  net.addResistor('fp-relay-coil', 'bench-vbat', 'ecu-pin-16', 85.0 + fpRelayFaultR);
  net.addResistor('ecu-fprelay-off', 'ecu-pin-16', 'ecu-pin-2', 10000);

  // Cluster CAN Terminator (dynamic terminating resistance from component state)
  const canComp = components.find((c) => c.id === 'comp-can');
  const canTermOhms = Math.max(10.0, Number(canComp?.state?.terminatingResistanceOhms ?? 120.0));
  net.addResistor('cluster-can-term', 'can-term-h', 'can-term-l', canTermOhms);

  // 3.1 Stamp Auxiliary Bench Components (Resistors, LEDs, Diodes, Switches, Capacitors, Solenoids, Potentiometers)
  for (const comp of components) {
    if (
      comp.id === 'comp-tps' ||
      comp.id === 'comp-map' ||
      comp.id === 'comp-ect' ||
      comp.id === 'comp-inj' ||
      comp.id === 'comp-relay' ||
      comp.id === 'comp-can'
    ) {
      continue;
    }

    const pins = comp.pins;
    if (!pins || pins.length === 0) continue;

    switch (comp.type) {
      case 'resistor': {
        if (pins.length >= 2) {
          const rVal = Math.max(0.001, Number(comp.state?.resistanceOhms ?? 1000));
          net.addResistor(`aux-res-${comp.id}`, pins[0].id, pins[1].id, rVal);
        }
        break;
      }

      case 'led': {
        if (pins.length >= 2) {
          const { anodePinId, cathodePinId } = resolvePolarizedPins(comp, false);
          const vf = Math.max(0.5, Number(comp.state?.forwardDropVolts ?? 2.0));
          const ballastR = Math.max(10, Number(comp.state?.seriesResistorOhms ?? 680));
          const mode = nonLinearModes.get(comp.id) ?? 'OFF';
          if (isPowerOn && mode === 'FWD') {
            net.addVoltageSource(`aux-led-${comp.id}`, anodePinId, cathodePinId, vf, ballastR);
          } else {
            net.addResistor(`aux-led-${comp.id}`, anodePinId, cathodePinId, 1e7);
          }
        }
        break;
      }

      case 'diode': {
        if (pins.length >= 2) {
          const zenerV = Number(comp.state?.zenerVoltage ?? 0);
          const tvsBreakdown = Number(comp.state?.breakdownVolts ?? 0);
          const isTvs = comp.libraryTemplateId === 'lib-diode-smbj24ca' || tvsBreakdown > 0;
          const mode = nonLinearModes.get(comp.id) ?? 'OFF';

          if (isTvs) {
            const vClamp = Math.max(5.0, tvsBreakdown > 0 ? tvsBreakdown : zenerV > 0 ? zenerV : 26.7);
            if (isPowerOn && mode === 'FWD') {
              net.addVoltageSource(`aux-tvs-${comp.id}`, pins[0].id, pins[1].id, vClamp, 0.8);
            } else if (isPowerOn && mode === 'REV_CLAMP') {
              net.addVoltageSource(`aux-tvs-${comp.id}`, pins[1].id, pins[0].id, vClamp, 0.8);
            } else {
              net.addResistor(`aux-tvs-${comp.id}`, pins[0].id, pins[1].id, 1e7);
            }
          } else if (zenerV > 0) {
            const { anodePinId, cathodePinId } = resolvePolarizedPins(comp, true);
            const vf = Math.max(0.2, Number(comp.state?.forwardDropVolts ?? 0.7));
            const rZ = Math.max(0.25, Number(comp.state?.zenerResistanceOhms ?? 1.5));
            if (isPowerOn && mode === 'FWD') {
              net.addVoltageSource(`aux-zener-${comp.id}`, anodePinId, cathodePinId, vf, rZ);
            } else if (isPowerOn && mode === 'REV_CLAMP') {
              net.addVoltageSource(`aux-zener-${comp.id}`, cathodePinId, anodePinId, zenerV, rZ);
            } else {
              net.addResistor(`aux-zener-${comp.id}`, anodePinId, cathodePinId, 1e6);
            }
          } else {
            const { anodePinId, cathodePinId } = resolvePolarizedPins(comp, false);
            const vf = Math.max(0.15, Number(comp.state?.forwardDropVolts ?? 0.7));
            const rOn = Math.max(0.05, Number(comp.state?.internalResistanceOhms ?? (vf <= 0.45 ? 0.15 : 0.35)));
            if (isPowerOn && mode === 'FWD') {
              net.addVoltageSource(`aux-diode-${comp.id}`, anodePinId, cathodePinId, vf, rOn);
            } else {
              net.addResistor(`aux-diode-${comp.id}`, anodePinId, cathodePinId, 1e7);
            }
          }
        }
        break;
      }

      case 'switch': {
        if (pins.length >= 2) {
          const isOpen = Boolean(comp.state?.isOpen ?? false);
          const fuseBlown = Boolean(comp.state?.fuseBlown ?? false);
          const contactR = Math.max(0.001, Number(comp.state?.contactResistanceOhms ?? 0.02));
          if (isOpen || fuseBlown) {
            net.addResistor(`aux-sw-${comp.id}`, pins[0].id, pins[1].id, 1e9);
          } else {
            net.addResistor(`aux-sw-${comp.id}`, pins[0].id, pins[1].id, contactR);
          }
        }
        break;
      }

      case 'potentiometer': {
        if (pins.length >= 3) {
          const totalR = Math.max(10, Number(comp.state?.resistanceOhms ?? 10000));
          const wiperPct = Math.min(100, Math.max(0, Number(comp.state?.wiperPercent ?? 50)));
          const k = Math.min(0.999, Math.max(0.001, wiperPct / 100.0));
          const rUpper = Math.max(0.1, (1.0 - k) * totalR);
          const rLower = Math.max(0.1, k * totalR);
          net.addResistor(`aux-pot-upper-${comp.id}`, pins[0].id, pins[1].id, rUpper);
          net.addResistor(`aux-pot-lower-${comp.id}`, pins[1].id, pins[2].id, rLower);
        } else if (pins.length === 2) {
          const rVal = Math.max(0.1, Number(comp.state?.resistanceOhms ?? 1000));
          net.addResistor(`aux-pot-${comp.id}`, pins[0].id, pins[1].id, rVal);
        }
        break;
      }

      case 'capacitor': {
        if (pins.length >= 2) {
          // Steady-state DC open-circuit equivalent (leakage resistance 1 MΩ)
          net.addResistor(`aux-cap-${comp.id}`, pins[0].id, pins[1].id, 1e6);
        }
        break;
      }

      case 'load': {
        if (pins.length >= 2) {
          const rLoad = Math.max(0.1, Number(comp.state?.resistanceOhms ?? 12.0));
          net.addResistor(`aux-load-${comp.id}`, pins[0].id, pins[1].id, rLoad);
        }
        break;
      }

      case 'relay': {
        const p30 = pins.find((p) => p.id.endsWith('pin30')) || pins[0];
        const p87 = pins.find((p) => p.id.endsWith('pin87')) || pins[1];
        const p87a = pins.find((p) => p.id.endsWith('pin87a')) || pins[2];
        const p86 = pins.find((p) => p.id.endsWith('pin86')) || pins[3];
        const p85 = pins.find((p) => p.id.endsWith('pin85')) || pins[4];

        const coilR = Math.max(10, Number(comp.state?.coilResistanceOhms ?? 85));
        const manualLatched = comp.state?.isLatched !== false;
        const coilWired = isRelayCoilWired(comp, wires);
        const isEnergized = coilWired
          ? Boolean(relayEnergizedMap.get(comp.id)) && manualLatched
          : Boolean(comp.state?.isLatched ?? true);

        if (p86 && p85) {
          net.addResistor(`aux-relay-coil-${comp.id}`, p86.id, p85.id, coilR);
        }
        if (p30 && p87) {
          net.addResistor(
            `aux-relay-no-${comp.id}`,
            p30.id,
            p87.id,
            isPowerOn && isEnergized ? 0.05 : 1e9
          );
        }
        if (p30 && p87a) {
          net.addResistor(
            `aux-relay-nc-${comp.id}`,
            p30.id,
            p87a.id,
            isPowerOn && isEnergized ? 1e9 : 0.05
          );
        }
        break;
      }

      default: {
        if (pins.length >= 2) {
          net.addResistor(`aux-generic-${comp.id}`, pins[0].id, pins[1].id, 1000);
        }
      }
    }
  }

  // 4. Stamp Harness Wires (incorporating series pin faults at source/target terminals)
  for (const wire of wires) {
    if (wire.isCut) {
      net.addResistor(`wire-${wire.id}`, wire.sourcePinId, wire.targetPinId, 1e9);
    } else {
      const sourcePinFaultR = FaultManager.getSeriesFaultOhms(faults, wire.sourcePinId);
      const targetPinFaultR = FaultManager.getSeriesFaultOhms(faults, wire.targetPinId);
      const baseR = wire.resistance || 0.05;
      const effectiveR =
        sourcePinFaultR >= 1e9 || targetPinFaultR >= 1e9
          ? 1e9
          : baseR + sourcePinFaultR + targetPinFaultR;
      net.addResistor(`wire-${wire.id}`, wire.sourcePinId, wire.targetPinId, effectiveR);
    }
  }

  // 5. Apply Parallel Topological Shunt Faults (SHORT_TO_GND / SHORT_TO_VBAT)
  FaultManager.applyFaults(net, faults);

  return net;
}

/**
 * solveCircuit: Solves the entire physical electrical lab using Modified Nodal Analysis (MNA).
 */
export function solveCircuit(
  powerSupply: PowerSupplyState,
  pins: EcuPin[],
  faults: InjectedFault[],
  wires: WireConnection[],
  components: BenchComponent[],
  multimeter: MultimeterState,
  simOptions: SolveCircuitOptions = {}
): CircuitSolution {
  const isPowerOn = powerSupply.isOutputEnabled && powerSupply.voltageSetting > 0.4;
  const vSet = isPowerOn ? powerSupply.voltageSetting : 0.0;

  const nonLinearComps = getAuxiliaryNonLinearIds(components);
  const nonLinearModes = new Map<string, NonLinearAuxMode>();
  const relayEnergizedMap = new Map<string, boolean>();
  for (const comp of nonLinearComps) {
    if (comp.type === 'relay') {
      relayEnergizedMap.set(comp.id, !isRelayCoilWired(comp, wires) && Boolean(comp.state?.isLatched ?? true));
    } else {
      nonLinearModes.set(comp.id, 'OFF');
    }
  }

  let effectiveSupplyVolts = vSet;
  let currentMapVcc = isPowerOn ? 5.0 : 0.0;
  let ldoReflectLoadOhms: number | null = null;
  let isEcuLogicAwake = isPowerOn;
  let net = buildBenchNetwork(
    powerSupply,
    faults,
    wires,
    components,
    effectiveSupplyVolts,
    currentMapVcc,
    nonLinearModes,
    relayEnergizedMap,
    ldoReflectLoadOhms,
    isEcuLogicAwake
  );
  let solution: CircuitSolutionResult = net.solve();
  let isSupplyCurrentTripped = false;

  const MAX_SOLVE_ITERS = 6;
  for (let iter = 0; iter < MAX_SOLVE_ITERS; iter++) {
    let topologyOrModeChanged = false;

    const kl30Headroom = (solution.nodeVoltages['ecu-pin-3'] ?? 0) - (solution.nodeVoltages['ecu-pin-1'] ?? 0);
    const kl15Headroom = (solution.nodeVoltages['ecu-pin-4'] ?? 0) - (solution.nodeVoltages['ecu-pin-2'] ?? 0);
    const nextEcuLogicAwake = isPowerOn && kl30Headroom >= 4.0 && kl15Headroom >= 4.0;
    if (nextEcuLogicAwake !== isEcuLogicAwake) {
      isEcuLogicAwake = nextEcuLogicAwake;
      topologyOrModeChanged = true;
    }

    // Evaluate LDO external draw reflection onto bench-vbat (so VREF shorts/loads reflect on PSU)
    let nextLdoReflectOhms: number | null = null;
    if (isPowerOn && isEcuLogicAwake && effectiveSupplyVolts >= 4.0) {
      const iVref = Math.abs(solution.branchCurrentsAmps['ecu-vref-ldo'] ?? 0);
      if (iVref > 0.005) {
        nextLdoReflectOhms = Math.max(5.0, effectiveSupplyVolts / Math.min(iVref, 1.5));
      }
    }
    if (
      (ldoReflectLoadOhms === null) !== (nextLdoReflectOhms === null) ||
      (ldoReflectLoadOhms !== null &&
        nextLdoReflectOhms !== null &&
        Math.abs(ldoReflectLoadOhms - nextLdoReflectOhms) / Math.max(1, ldoReflectLoadOhms) > 0.15)
    ) {
      ldoReflectLoadOhms = nextLdoReflectOhms;
      topologyOrModeChanged = true;
    }

    // Evaluate piecewise-linear state transitions for diodes, LEDs, Zeners, TVS & wired relays
    if (isPowerOn && nonLinearComps.length > 0) {
      for (const comp of nonLinearComps) {
        const pins = comp.pins;
        if (comp.type === 'led') {
          const { anodePinId, cathodePinId } = resolvePolarizedPins(comp, false);
          const vf = Math.max(0.5, Number(comp.state?.forwardDropVolts ?? 2.0));
          const vd = (solution.nodeVoltages[anodePinId] ?? 0) - (solution.nodeVoltages[cathodePinId] ?? 0);
          const prevMode = nonLinearModes.get(comp.id) ?? 'OFF';
          const nextMode: NonLinearAuxMode =
            prevMode === 'FWD' ? (vd >= vf - 0.01 ? 'FWD' : 'OFF') : vd >= vf ? 'FWD' : 'OFF';
          if (nextMode !== prevMode) {
            nonLinearModes.set(comp.id, nextMode);
            topologyOrModeChanged = true;
          }
        } else if (comp.type === 'diode') {
          const zenerV = Number(comp.state?.zenerVoltage ?? 0);
          const tvsBreakdown = Number(comp.state?.breakdownVolts ?? 0);
          const isTvs = comp.libraryTemplateId === 'lib-diode-smbj24ca' || tvsBreakdown > 0;
          const prevMode = nonLinearModes.get(comp.id) ?? 'OFF';
          let nextMode: NonLinearAuxMode = 'OFF';

          if (isTvs) {
            const vClamp = Math.max(5.0, tvsBreakdown > 0 ? tvsBreakdown : zenerV > 0 ? zenerV : 26.7);
            const vDiff = (solution.nodeVoltages[pins[0].id] ?? 0) - (solution.nodeVoltages[pins[1].id] ?? 0);
            if (prevMode === 'FWD') {
              nextMode = vDiff >= vClamp - 0.02 ? 'FWD' : 'OFF';
            } else if (prevMode === 'REV_CLAMP') {
              nextMode = -vDiff >= vClamp - 0.02 ? 'REV_CLAMP' : 'OFF';
            } else if (vDiff >= vClamp) {
              nextMode = 'FWD';
            } else if (-vDiff >= vClamp) {
              nextMode = 'REV_CLAMP';
            }
          } else if (zenerV > 0) {
            const { anodePinId, cathodePinId } = resolvePolarizedPins(comp, true);
            const vf = Math.max(0.2, Number(comp.state?.forwardDropVolts ?? 0.7));
            const vd = (solution.nodeVoltages[anodePinId] ?? 0) - (solution.nodeVoltages[cathodePinId] ?? 0);
            const vRev = -vd;
            if (prevMode === 'FWD') {
              nextMode = vd >= vf - 0.01 ? 'FWD' : 'OFF';
            } else if (prevMode === 'REV_CLAMP') {
              nextMode = vRev >= zenerV - 0.02 ? 'REV_CLAMP' : 'OFF';
            } else if (vd >= vf) {
              nextMode = 'FWD';
            } else if (vRev >= zenerV) {
              nextMode = 'REV_CLAMP';
            }
          } else {
            const { anodePinId, cathodePinId } = resolvePolarizedPins(comp, false);
            const vf = Math.max(0.15, Number(comp.state?.forwardDropVolts ?? 0.7));
            const vd = (solution.nodeVoltages[anodePinId] ?? 0) - (solution.nodeVoltages[cathodePinId] ?? 0);
            nextMode =
              prevMode === 'FWD' ? (vd >= vf - 0.01 ? 'FWD' : 'OFF') : vd >= vf ? 'FWD' : 'OFF';
          }

          if (nextMode !== prevMode) {
            nonLinearModes.set(comp.id, nextMode);
            topologyOrModeChanged = true;
          }
        } else if (comp.type === 'relay' && isRelayCoilWired(comp, wires)) {
          const p86 = pins.find((p) => p.id.endsWith('pin86')) || pins[3];
          const p85 = pins.find((p) => p.id.endsWith('pin85')) || pins[4];
          if (p86 && p85) {
            const vCoil = Math.abs(
              (solution.nodeVoltages[p86.id] ?? 0) - (solution.nodeVoltages[p85.id] ?? 0)
            );
            const prevEnergized = Boolean(relayEnergizedMap.get(comp.id));
            const nextEnergized = prevEnergized ? vCoil >= 5.5 : vCoil >= 7.5;
            if (nextEnergized !== prevEnergized) {
              relayEnergizedMap.set(comp.id, nextEnergized);
              topologyOrModeChanged = true;
            }
          }
        }
      }
    }

    // Measure PSU terminal current exclusively from bench-vsource (not independent internal LDO/CAN sources)
    const rawPsuDrawAmps = isPowerOn
      ? Math.abs(solution.branchCurrentsAmps['bench-vsource'] ?? 0)
      : 0.0;
    const trippedNow = isPowerOn && rawPsuDrawAmps > powerSupply.currentLimit;
    let nextEffectiveSupplyVolts = effectiveSupplyVolts;
    if (trippedNow && rawPsuDrawAmps > 1e-6) {
      isSupplyCurrentTripped = true;
      const rLoadTotal = effectiveSupplyVolts / rawPsuDrawAmps;
      nextEffectiveSupplyVolts = Math.max(0, Math.min(vSet, powerSupply.currentLimit * rLoadTotal));
    } else if (!isSupplyCurrentTripped) {
      nextEffectiveSupplyVolts = vSet;
    }

    const solvedMapVcc = isPowerOn
      ? Math.max(0, (solution.nodeVoltages['map-vcc'] ?? 0) - (solution.nodeVoltages['map-gnd'] ?? 0))
      : 0.0;
    const nextMapVcc = isSupplyCurrentTripped
      ? solvedMapVcc * (effectiveSupplyVolts > 0 ? nextEffectiveSupplyVolts / effectiveSupplyVolts : 0)
      : solvedMapVcc;

    const supplyChanged = Math.abs(nextEffectiveSupplyVolts - effectiveSupplyVolts) > 0.02;
    const mapChanged = Math.abs(nextMapVcc - currentMapVcc) > 0.05;

    if (!isPowerOn || (!topologyOrModeChanged && !supplyChanged && !mapChanged)) {
      break;
    }

    const canUpdateInPlace =
      !topologyOrModeChanged && effectiveSupplyVolts >= 6.5 && nextEffectiveSupplyVolts >= 6.5;

    effectiveSupplyVolts = nextEffectiveSupplyVolts;
    currentMapVcc = nextMapVcc;

    if (canUpdateInPlace) {
      const mapComp = components.find((c) => c.id === 'comp-map');
      const kpa = (mapComp?.state?.pressureKpa as number) ?? 42;
      const mapPreset = (mapComp?.state?.calibrationPreset as MapCalibrationPreset | undefined) ?? 'BAR_1_NA';
      const mapModel = AutomotiveModels.calculateMap(kpa, currentMapVcc, mapPreset);
      net.updateVoltageSource('bench-vsource', effectiveSupplyVolts);
      net.updateVoltageSource('map-transducer', mapModel.voltage);
    } else {
      net = buildBenchNetwork(
        powerSupply,
        faults,
        wires,
        components,
        effectiveSupplyVolts,
        currentMapVcc,
        nonLinearModes,
        relayEnergizedMap,
        ldoReflectLoadOhms,
        isEcuLogicAwake
      );
    }
    solution = net.solve();
  }

  const nodeVoltages = solution.nodeVoltages;
  const wireCurrentsMa: Record<string, number> = {};

  for (const wire of wires) {
    const iA = Math.abs(solution.branchCurrentsAmps[`wire-${wire.id}`] || 0);
    wireCurrentsMa[wire.id] = iA * 1000.0;
  }

  const finalPsuDrawAmps = isPowerOn
    ? Math.abs(solution.branchCurrentsAmps['bench-vsource'] ?? 0)
    : 0.0;
  const supplyCurrentDraw = isSupplyCurrentTripped
    ? Math.min(finalPsuDrawAmps, powerSupply.currentLimit)
    : finalPsuDrawAmps;

  // Compute Node Resistances for UI
  const nodeResistances: Record<string, number> = {};
  for (const p of pins) {
    nodeResistances[p.id] = p.internalResistance;
  }

  const wire10 = wires.find((w) => w.id === 'wire-10');
  const wire11 = wires.find((w) => w.id === 'wire-11');
  const wire9 = wires.find((w) => w.id === 'wire-9');

  const resolvedSimOptions: Required<SolveCircuitOptions> = {
    rpm: simOptions.rpm ?? 850,
    isInjectorFiring: simOptions.isInjectorFiring ?? Boolean(components.find((c) => c.id === 'comp-inj')?.state?.isFiring ?? true),
    hasCanFault:
      simOptions.hasCanFault ??
      (faults.some((f) => f.pinId === 'ecu-pin-13' || f.pinId === 'ecu-pin-14') ||
        Boolean(wire10?.isCut) ||
        Boolean(wire11?.isCut) ||
        isSupplyCurrentTripped),
    hasInjectorFault:
      simOptions.hasInjectorFault ??
      (faults.some((f) => f.pinId === 'ecu-pin-10') ||
        Boolean(wire9?.isCut) ||
        isSupplyCurrentTripped),
    camPhaseOffsetDeg: simOptions.camPhaseOffsetDeg ?? 0,
    ckpSignalLost: simOptions.ckpSignalLost ?? false,
  };

  // 7. Calculate Real Multimeter Measurement
  const redNode = multimeter.redProbe.attachedToPinId?.toLowerCase() || null;
  const blackNode = multimeter.blackProbe.attachedToPinId?.toLowerCase() || null;

  let dmmDisplay = '0.00';
  let dmmVal = 0.0;
  let dmmUnit = 'V';
  let dmmOverLimit = false;
  let dmmWarning = false;
  let dmmWarningMsg = '';
  let dmmShouldBeep = false;
  let dmmEvidenceStatus: 'VALID' | 'UNRESOLVED' | 'UNSTABLE' | 'UNAVAILABLE' = 'VALID';

  if (!multimeter.isPowered) {
    dmmDisplay = 'OFF';
    dmmUnit = '';
    dmmEvidenceStatus = 'UNAVAILABLE';
  } else if (!redNode || !blackNode) {
    dmmDisplay = '---';
    dmmUnit = '';
    dmmEvidenceStatus = 'UNAVAILABLE';
  } else {
    const redKnown = redNode === '0' || redNode === 'gnd' || redNode === 'chassis-gnd' || redNode in nodeVoltages;
    const blackKnown = blackNode === '0' || blackNode === 'gnd' || blackNode === 'chassis-gnd' || blackNode in nodeVoltages;
    const redUnresolved = !redKnown || Boolean(solution.unresolvedNodes?.includes(redNode));
    const blackUnresolved = !blackKnown || Boolean(solution.unresolvedNodes?.includes(blackNode));

    if (redUnresolved || blackUnresolved) {
      dmmEvidenceStatus = 'UNRESOLVED';
    } else if (solution.solverStatus === 'UNSTABLE') {
      dmmEvidenceStatus = 'UNSTABLE';
    }

    const vRed = nodeVoltages[redNode] !== undefined ? nodeVoltages[redNode] : 0.0;
    const vBlack = nodeVoltages[blackNode] !== undefined ? nodeVoltages[blackNode] : 0.0;
    const deltaV = vRed - vBlack;
    const isLiveCircuit =
      isPowerOn && (Math.abs(deltaV) > 0.1 || Math.abs(vRed) > 0.3 || Math.abs(vBlack) > 0.3);

    switch (multimeter.mode) {
      case 'V_DC': {
        if (!redKnown || !blackKnown) {
          dmmDisplay = 'UNRESOLVED';
          dmmVal = NaN;
          dmmUnit = 'V DC';
          dmmWarning = true;
          dmmWarningMsg = `UNRESOLVED NODE: Probe attached to unreferenced node (${!redKnown ? redNode : blackNode}). Cannot treat as a valid 0V measurement.`;
          dmmEvidenceStatus = 'UNRESOLVED';
          break;
        }
        if (redUnresolved || blackUnresolved) {
          dmmWarning = true;
          dmmWarningMsg = `FLOATING / UNRESOLVED NODE (${redUnresolved ? redNode : blackNode}): No DC ground reference path to KL31.`;
          dmmEvidenceStatus = 'UNRESOLVED';
        }
        dmmVal = deltaV;
        const absV = Math.abs(deltaV);
        if (absV >= 1000) {
          dmmDisplay = (deltaV / 1000).toFixed(2);
          dmmUnit = 'kV DC';
        } else if (absV >= 1.0 || absV === 0) {
          dmmDisplay = deltaV.toFixed(2);
          dmmUnit = 'V DC';
        } else {
          dmmDisplay = (deltaV * 1000).toFixed(1);
          dmmUnit = 'mV DC';
        }
        break;
      }

      case 'V_AC': {
        const { acRms } = estimateWaveformMetrics(
          redNode,
          blackNode,
          pins,
          nodeVoltages,
          faults,
          isPowerOn,
          isEcuLogicAwake,
          resolvedSimOptions
        );
        dmmVal = acRms;
        if (acRms >= 1000) {
          dmmDisplay = (acRms / 1000).toFixed(2);
          dmmUnit = 'kV AC';
        } else if (acRms >= 1.0 || acRms === 0) {
          dmmDisplay = acRms.toFixed(3);
          dmmUnit = 'V AC';
        } else {
          dmmDisplay = (acRms * 1000).toFixed(1);
          dmmUnit = 'mV AC';
        }
        break;
      }

      case 'RESISTANCE': {
        if (isLiveCircuit) {
          dmmWarning = true;
          dmmWarningMsg =
            'VOLTAGE DETECTED ON LIVE CIRCUIT! Turn bench power supply OFF for accurate Ohms measurement.';
          dmmDisplay = 'ERR';
          dmmUnit = 'Ω';
        } else {
          const rEq = net.calculateEquivalentResistance(redNode, blackNode);
          dmmVal = rEq;
          if (rEq >= 1e8 || !isFinite(rEq)) {
            dmmDisplay = 'O.L';
            dmmUnit = 'MΩ';
            dmmOverLimit = true;
          } else if (rEq >= 1e6) {
            dmmDisplay = (rEq / 1e6).toFixed(2);
            dmmUnit = 'MΩ';
          } else if (rEq >= 1000) {
            dmmDisplay = (rEq / 1000.0).toFixed(2);
            dmmUnit = 'kΩ';
          } else if (rEq >= 1.0 || rEq === 0) {
            dmmDisplay = rEq.toFixed(1);
            dmmUnit = 'Ω';
          } else {
            dmmDisplay = (rEq * 1000.0).toFixed(1);
            dmmUnit = 'mΩ';
          }
        }
        break;
      }

      case 'CONTINUITY': {
        if (isLiveCircuit) {
          dmmWarning = true;
          dmmWarningMsg =
            'LIVE VOLTAGE ON CONTINUITY PROBES! Power OFF bench supply before testing continuity.';
          dmmDisplay = 'ERR';
          dmmUnit = 'Ω';
        } else {
          const rCont = net.calculateEquivalentResistance(redNode, blackNode);
          dmmVal = rCont;
          if (rCont < 30.0) {
            dmmShouldBeep = true;
            if (rCont < 1.0 && rCont > 0) {
              dmmDisplay = (rCont * 1000).toFixed(0);
              dmmUnit = 'mΩ';
            } else {
              dmmDisplay = rCont.toFixed(1);
              dmmUnit = 'Ω';
            }
          } else if (rCont >= 1e6 || !isFinite(rCont)) {
            dmmDisplay = 'O.L';
            dmmUnit = 'Ω';
            dmmOverLimit = true;
          } else if (rCont >= 1000) {
            dmmDisplay = (rCont / 1000.0).toFixed(2);
            dmmUnit = 'kΩ';
          } else {
            dmmDisplay = rCont.toFixed(1);
            dmmUnit = 'Ω';
          }
        }
        break;
      }

      case 'DIODE': {
        if (isLiveCircuit) {
          dmmWarning = true;
          dmmWarningMsg =
            'LIVE VOLTAGE DETECTED! De-energize ECU before performing Diode Junction (-▷|-) test.';
          dmmDisplay = 'ERR';
          dmmUnit = 'V';
        } else {
          // Real DMM Diode Test Simulation:
          // Injects I_test = 1.0 mA from Red (+) probe to Black (-) probe with V_compliance = 3.0V.
          // 1. Check direct or wire-connected auxiliary semiconductor junctions (Diodes, LEDs, Zeners)
          const findConnectedDiodePolarity = () => {
            for (const c of nonLinearComps) {
              if ((c.type !== 'diode' && c.type !== 'led') || c.pins.length < 2) continue;
              const zenerV = Number(c.state?.zenerVoltage ?? 0);
              const tvsBreakdown = Number(c.state?.breakdownVolts ?? 0);
              if (tvsBreakdown > 0 || c.libraryTemplateId === 'lib-diode-smbj24ca') continue;
              const { anodePinId, cathodePinId } = resolvePolarizedPins(c, zenerV > 0);
              const anodeId = anodePinId.toLowerCase();
              const cathodeId = cathodePinId.toLowerCase();

              const rRedToAnode =
                redNode === anodeId ? 0 : net.calculateEquivalentResistance(redNode, anodeId);
              const rBlackToCathode =
                blackNode === cathodeId
                  ? 0
                  : net.calculateEquivalentResistance(blackNode, cathodeId);
              if (rRedToAnode < 50 && rBlackToCathode < 50) {
                return {
                  comp: c,
                  orientation: 'FORWARD' as const,
                  seriesOhms: rRedToAnode + rBlackToCathode,
                };
              }

              const rRedToCathode =
                redNode === cathodeId ? 0 : net.calculateEquivalentResistance(redNode, cathodeId);
              const rBlackToAnode =
                blackNode === anodeId ? 0 : net.calculateEquivalentResistance(blackNode, anodeId);
              if (rRedToCathode < 50 && rBlackToAnode < 50) {
                return {
                  comp: c,
                  orientation: 'REVERSE' as const,
                  seriesOhms: rRedToCathode + rBlackToAnode,
                };
              }
            }
            return null;
          };

          const auxDiodeMatch = findConnectedDiodePolarity();
          if (auxDiodeMatch) {
            const { comp: dComp, orientation, seriesOhms } = auxDiodeMatch;
            const zenerV = Number(dComp.state?.zenerVoltage ?? 0);
            const iTestAmps = 0.001; // 1.0 mA constant test current
            const vCompliance = 3.0; // 3.0 V DMM open-circuit compliance
            if (orientation === 'FORWARD') {
              const vf0 = Number(
                dComp.state?.forwardDropVolts ?? (dComp.type === 'led' ? 2.0 : 0.7)
              );
              const rOn = dComp.type === 'led' ? 12.0 : 0.8;
              const vMeasured = vf0 + iTestAmps * (rOn + seriesOhms);
              if (vMeasured >= vCompliance) {
                dmmVal = Infinity;
                dmmDisplay = 'O.L';
                dmmUnit = 'V';
                dmmOverLimit = true;
              } else {
                dmmVal = Number(vMeasured.toFixed(3));
                dmmDisplay = dmmVal.toFixed(3);
                dmmUnit = 'V';
              }
            } else if (zenerV > 0 && zenerV < vCompliance) {
              // Sub-3V Zener conducts in reverse under 3.0V DMM compliance
              const vMeasured = zenerV + iTestAmps * (1.5 + seriesOhms);
              dmmVal = Number(vMeasured.toFixed(3));
              dmmDisplay = dmmVal.toFixed(3);
              dmmUnit = 'V';
            } else {
              // Reverse-biased PN / Schottky / >=3V Zener blocks 1mA test current -> O.L
              dmmVal = Infinity;
              dmmDisplay = 'O.L';
              dmmUnit = 'V';
              dmmOverLimit = true;
            }
          } else {
            // 2. ECU Pin & Harness Path Test-Current Simulation (I_test = 1.0 mA, V_compliance = 3.0 V)
            const rEq = net.calculateEquivalentResistance(redNode, blackNode);
            const iTestAmps = 0.001;
            const vCompliance = 3.0;
            const groundNodes = new Set(['chassis-gnd', 'ecu-pin-1', 'ecu-pin-2', 'ecu-pin-6']);
            const redIsGnd = groundNodes.has(redNode);
            const blackIsGnd = groundNodes.has(blackNode);
            const redIsEcuPin = redNode.startsWith('ecu-pin-') && !redIsGnd;
            const blackIsEcuPin = blackNode.startsWith('ecu-pin-') && !blackIsGnd;

            if (rEq < 50.0) {
              // Low-resistance metallic/coil path reads V = I_test * R_eq
              const mvDrop = rEq * (iTestAmps * 1000);
              dmmVal = mvDrop / 1000;
              dmmDisplay = mvDrop.toFixed(1);
              dmmUnit = 'mV (SHORT)';
            } else if (!isFinite(rEq) || rEq >= 1e7) {
              dmmVal = Infinity;
              dmmDisplay = 'O.L';
              dmmUnit = 'V';
              dmmOverLimit = true;
            } else if (redIsEcuPin && blackIsGnd) {
              // Forward-probed ECU pin protection junction against ground under 1.0 mA test current:
              // Coupled Shockley junction (Is = 1e-12 A, n*Vt = 0.032 V) in parallel with R_eq
              const vPassive = iTestAmps * rEq;
              const vJunction = 0.032 * Math.log(1 + iTestAmps / 1e-12) * 0.72; // ~0.636V at 1mA
              const vTotal = (vPassive * vJunction) / (vPassive + vJunction) + 0.08;
              const vf = Math.min(0.78, Math.max(0.52, vTotal));
              dmmVal = Number(vf.toFixed(3));
              dmmDisplay = vf.toFixed(3);
              dmmUnit = 'V';
            } else if (redIsGnd && blackIsEcuPin) {
              // Reverse-probed orientation across ECU pin: internal protection diode is reverse-biased,
              // so the 1.0 mA test current must flow strictly through the passive input impedance R_eq.
              const vReversePassive = iTestAmps * rEq;
              if (vReversePassive >= vCompliance) {
                dmmVal = Infinity;
                dmmDisplay = 'O.L';
                dmmUnit = 'V';
                dmmOverLimit = true;
              } else {
                dmmVal = Number(vReversePassive.toFixed(3));
                dmmDisplay = vReversePassive.toFixed(3);
                dmmUnit = 'V';
              }
            } else {
              // Generic resistive/sensor path between two non-ground nodes under 1.0 mA test current
              const vDrop = iTestAmps * rEq;
              if (vDrop >= vCompliance) {
                dmmVal = Infinity;
                dmmDisplay = 'O.L';
                dmmUnit = 'V';
                dmmOverLimit = true;
              } else {
                dmmVal = Number(vDrop.toFixed(3));
                dmmDisplay = vDrop.toFixed(3);
                dmmUnit = 'V';
              }
            }
          }
        }
        break;
      }

      case 'FREQUENCY': {
        const { freqHz } = estimateWaveformMetrics(
          redNode,
          blackNode,
          pins,
          nodeVoltages,
          faults,
          isPowerOn,
          isEcuLogicAwake,
          resolvedSimOptions
        );
        dmmVal = freqHz;
        if (freqHz >= 1e6) {
          dmmDisplay = (freqHz / 1e6).toFixed(2);
          dmmUnit = 'MHz';
        } else if (freqHz >= 1000) {
          dmmDisplay = (freqHz / 1000.0).toFixed(1);
          dmmUnit = 'kHz';
        } else {
          dmmDisplay = freqHz.toFixed(1);
          dmmUnit = 'Hz';
        }
        break;
      }
    }
  }

  // 8. Generate Active OBD-II Diagnostic Trouble Codes (DTCs) from Actual Solved MNA Voltages & Topology
  const dtcs: DiagnosticTroubleCode[] = [];

  const tpsVoltage = nodeVoltages['ecu-pin-7'] ?? 0.85;
  if (isPowerOn && tpsVoltage < 0.20) {
    dtcs.push({
      code: 'P0122',
      system: 'Throttle Position Sensor',
      description: 'Throttle Position Sensor (G79) Circuit Low Input (Voltage < 0.20V)',
      severity: 'CRITICAL',
      status: 'ACTIVE',
      associatedPinIds: ['ecu-pin-7'],
    });
  } else if (isPowerOn && tpsVoltage > 4.80) {
    dtcs.push({
      code: 'P0123',
      system: 'Throttle Position Sensor',
      description: 'Throttle Position Sensor (G79) Circuit High Input (Voltage > 4.80V)',
      severity: 'CRITICAL',
      status: 'ACTIVE',
      associatedPinIds: ['ecu-pin-7'],
    });
  }

  const mapVoltage = nodeVoltages['ecu-pin-8'] ?? 1.45;
  if (isPowerOn && mapVoltage < 0.20) {
    dtcs.push({
      code: 'P0107',
      system: 'Manifold Absolute Pressure',
      description: 'MAP / Barometric Pressure Circuit Low Input (Voltage < 0.20V)',
      severity: 'WARNING',
      status: 'ACTIVE',
      associatedPinIds: ['ecu-pin-8'],
    });
  } else if (isPowerOn && mapVoltage > 4.80) {
    dtcs.push({
      code: 'P0108',
      system: 'Manifold Absolute Pressure',
      description: 'MAP / Barometric Pressure Circuit High Input (Voltage > 4.80V)',
      severity: 'WARNING',
      status: 'ACTIVE',
      associatedPinIds: ['ecu-pin-8'],
    });
  }

  const ectVoltage = nodeVoltages['ecu-pin-9'] ?? 1.95;
  if (isPowerOn && ectVoltage < 0.15) {
    dtcs.push({
      code: 'P0117',
      system: 'Engine Coolant Temperature',
      description: 'Coolant Temperature Sensor (G62) Circuit Low Input (Short to GND)',
      severity: 'WARNING',
      status: 'ACTIVE',
      associatedPinIds: ['ecu-pin-9'],
    });
  } else if (isPowerOn && ectVoltage > 4.85) {
    dtcs.push({
      code: 'P0118',
      system: 'Engine Coolant Temperature',
      description: 'Coolant Temperature Sensor (G62) Circuit High Input (Open Circuit)',
      severity: 'WARNING',
      status: 'ACTIVE',
      associatedPinIds: ['ecu-pin-9'],
    });
  }

  const o2Voltage = nodeVoltages['ecu-pin-15'] ?? 0.45;
  if (isPowerOn && o2Voltage < 0.05) {
    dtcs.push({
      code: 'P0131',
      system: 'Oxygen Sensor Bank 1',
      description: 'O2 Sensor Circuit Low Voltage (Short to GND / Sensor Bias Missing)',
      severity: 'WARNING',
      status: 'ACTIVE',
      associatedPinIds: ['ecu-pin-15'],
    });
  } else if (isPowerOn && o2Voltage > 1.10) {
    dtcs.push({
      code: 'P0132',
      system: 'Oxygen Sensor Bank 1',
      description: 'O2 Sensor Circuit High Voltage (Heater / +12V Shorted to Signal)',
      severity: 'WARNING',
      status: 'ACTIVE',
      associatedPinIds: ['ecu-pin-15'],
    });
  }

  const injVoltage = nodeVoltages['ecu-pin-10'] ?? 12.6;
  const injFaultObj = faults.find((f) => f.pinId === 'ecu-pin-10');
  if (isPowerOn && (injVoltage < 1.0 || injFaultObj?.faultType === 'OPEN_CIRCUIT' || wire9?.isCut)) {
    dtcs.push({
      code: 'P0201',
      system: 'Fuel Injection Driver',
      description: 'Cylinder 1 Injector Circuit Open / Driver Fault (No Coil Pull-Up at Pin 10)',
      severity: 'CRITICAL',
      status: 'ACTIVE',
      associatedPinIds: ['ecu-pin-10'],
    });
  }

  const ignVoltage = nodeVoltages['ecu-pin-11'] ?? 0.0;
  const ignFaultObj = faults.find((f) => f.pinId === 'ecu-pin-11');
  if (isPowerOn && (ignVoltage > 5.5 || ignFaultObj?.faultType === 'OPEN_CIRCUIT')) {
    dtcs.push({
      code: 'P0351',
      system: 'Ignition Primary/Secondary',
      description: 'Ignition Coil "A" Primary/Secondary Circuit Malfunction (Pin 11)',
      severity: 'CRITICAL',
      status: 'ACTIVE',
      associatedPinIds: ['ecu-pin-11'],
    });
  }

  const kl30Voltage = nodeVoltages['ecu-pin-3'] ?? 12.6;
  if (isPowerOn && kl30Voltage < 9.0) {
    dtcs.push({
      code: 'P0562',
      system: 'ECU System Voltage',
      description: 'System Voltage Low (KL30 < 9.0V — Supply Drop, Brownout, or C.C. Foldback)',
      severity: 'CRITICAL',
      status: 'ACTIVE',
      associatedPinIds: ['ecu-pin-3'],
    });
  } else if (isPowerOn && kl30Voltage > 16.0) {
    dtcs.push({
      code: 'P0563',
      system: 'ECU System Voltage',
      description: 'System Voltage High (KL30 > 16.0V — Overvoltage Condition)',
      severity: 'CRITICAL',
      status: 'ACTIVE',
      associatedPinIds: ['ecu-pin-3'],
    });
  }

  const canHVoltage = nodeVoltages['ecu-pin-13'] ?? 2.5;
  const canLVoltage = nodeVoltages['ecu-pin-14'] ?? 2.5;
  const canDifferential = Math.abs(canHVoltage - canLVoltage);
  const canTermResistance = net.calculateEquivalentResistance('can-term-h', 'can-term-l');
  const isCanTermDegraded =
    !isFinite(canTermResistance) || canTermResistance > 90.0 || canTermResistance < 25.0;
  if (
    isPowerOn &&
    (canHVoltage < 0.3 ||
      canLVoltage < 0.3 ||
      canDifferential > 3.0 ||
      isCanTermDegraded ||
      resolvedSimOptions.hasCanFault)
  ) {
    dtcs.push({
      code: 'U0001',
      system: 'CAN Communication Network',
      description: 'High Speed CAN Communication Bus Malfunction (Bus shorted or terminated incorrectly)',
      severity: 'CRITICAL',
      status: 'ACTIVE',
      associatedPinIds: ['ecu-pin-13', 'ecu-pin-14'],
    });
  }

  if (isPowerOn && resolvedSimOptions.ckpSignalLost) {
    dtcs.push({
      code: 'P0335',
      system: 'Crankshaft Position Sensor',
      description: 'Crankshaft Position Sensor "A" Circuit No Signal (CKP Dropout)',
      severity: 'CRITICAL',
      status: 'ACTIVE',
      associatedPinIds: ['ecu-pin-10', 'ecu-pin-11'],
    });
  }

  if (isPowerOn && Math.abs(resolvedSimOptions.camPhaseOffsetDeg) > 15) {
    dtcs.push({
      code: 'P0016',
      system: 'CKP/CMP Correlation',
      description: `Crankshaft / Camshaft Position Correlation Bank 1 (${resolvedSimOptions.camPhaseOffsetDeg > 0 ? '+' : ''}${resolvedSimOptions.camPhaseOffsetDeg.toFixed(0)}° Phase Drift)`,
      severity: 'CRITICAL',
      status: 'ACTIVE',
      associatedPinIds: ['ecu-pin-10', 'ecu-pin-11'],
    });
  }

  return {
    nodeVoltages,
    validatedNodeVoltages: solution.validatedNodeVoltages,
    nodeMeasurementStatuses: solution.nodeMeasurementStatuses,
    unresolvedNodes: solution.unresolvedNodes,
    solverStatus: solution.solverStatus,
    solverWarnings: solution.warnings,
    nodeResistances,
    wireCurrentsMa,
    supplyCurrentDrawAmps: supplyCurrentDraw,
    isSupplyCurrentTripped,
    activeDTCs: dtcs,
    multimeterReading: {
      display: dmmDisplay,
      value: dmmVal,
      unit: dmmUnit,
      isOverLimit: dmmOverLimit,
      isWarning: dmmWarning,
      warningMessage: dmmWarningMsg,
      shouldBeep: dmmShouldBeep,
      evidenceStatus: dmmEvidenceStatus,
      evidenceSource: 'ELECTRICAL_SIMULATION',
    },
  };
}

export type PinContinuityStatus =
  | 'CLOSED_CONTINUITY'
  | 'HIGH_RESISTANCE'
  | 'OPEN_CIRCUIT'
  | 'SHORT_FAULT'
  | 'SKIPPED';

export interface BulkPinContinuityResult {
  pinId: string;
  pinNumber: number;
  label: string;
  name: string;
  category: EcuPin['category'];
  referenceNode: string;
  referenceLabel: string;
  measuredOhms: number;
  displayOhms: string;
  expectedMaxOhms: number;
  shortToGndOhms: number;
  shortToVbatOhms: number;
  status: PinContinuityStatus;
  hasLiveSupplyWarning: boolean;
  message: string;
}

export interface BulkContinuityReport {
  isPowerLiveWarning: boolean;
  supplyVoltageV: number;
  checkedCount: number;
  passedCount: number;
  faultCount: number;
  results: BulkPinContinuityResult[];
}

function formatContinuityOhms(ohms: number): string {
  if (!isFinite(ohms) || ohms >= 1e7) return 'O.L (Open)';
  if (ohms >= 1e6) return `${(ohms / 1e6).toFixed(2)} MΩ`;
  if (ohms >= 1000) return `${(ohms / 1000).toFixed(2)} kΩ`;
  if (ohms >= 10) return `${ohms.toFixed(1)} Ω`;
  return `${ohms.toFixed(2)} Ω`;
}

/**
 * Evaluates bulk electrical continuity across selected ECU pins using a passive (de-energized)
 * Modified Nodal Analysis (MNA) bench network. Detects wire breaks, high-resistance series faults,
 * open circuits, and unintended shorts to GND or +12V VBAT.
 */
export function evaluateBulkPinContinuity(
  powerSupply: PowerSupplyState,
  pins: EcuPin[],
  faults: InjectedFault[],
  wires: WireConnection[],
  components: BenchComponent[],
  selectedPinIds?: readonly string[]
): BulkContinuityReport {
  const isPowerLiveWarning = Boolean(
    powerSupply.isOutputEnabled && powerSupply.voltageSetting > 0.4
  );
  const passivePsu: PowerSupplyState = {
    ...powerSupply,
    isOutputEnabled: false,
  };
  const passiveNet = buildBenchNetwork(
    passivePsu,
    faults,
    wires,
    components,
    0,
    0,
    new Map(),
    new Map(),
    null,
    false
  );

  const selectedSet =
    selectedPinIds !== undefined ? new Set(selectedPinIds) : null;

  let checkedCount = 0;
  let passedCount = 0;
  let faultCount = 0;

  const results: BulkPinContinuityResult[] = pins.map((pin) => {
    const isSelected = selectedSet === null || selectedSet.has(pin.id);
    if (!isSelected) {
      return {
        pinId: pin.id,
        pinNumber: pin.pinNumber,
        label: pin.label,
        name: pin.name,
        category: pin.category,
        referenceNode: 'chassis-gnd',
        referenceLabel: 'Not Selected',
        measuredOhms: Infinity,
        displayOhms: 'SKIPPED',
        expectedMaxOhms: 2.0,
        shortToGndOhms: Infinity,
        shortToVbatOhms: Infinity,
        status: 'SKIPPED',
        hasLiveSupplyWarning: isPowerLiveWarning,
        message: 'Excluded from current ECU pin selection.',
      };
    }

    checkedCount += 1;

    const shortToGndOhms = passiveNet.calculateEquivalentResistance(
      pin.id,
      'chassis-gnd'
    );
    const shortToVbatOhms = passiveNet.calculateEquivalentResistance(
      pin.id,
      'bench-vbat'
    );
    const attachedWires = wires.filter(
      (w) => w.sourcePinId === pin.id || w.targetPinId === pin.id
    );

    let referenceNode = 'chassis-gnd';
    let referenceLabel = 'Chassis GND (KL31)';
    let expectedMaxOhms = 2.0;
    let measuredOhms = Infinity;
    let cutWireLabel: string | null = null;

    if (pin.category === 'ground') {
      referenceNode = 'chassis-gnd';
      referenceLabel = 'Chassis GND (KL31)';
      expectedMaxOhms = 2.0;
      measuredOhms = passiveNet.calculateEquivalentResistance(pin.id, 'chassis-gnd');

      // For Sensor GND or wired ground pins, also inspect every harness ground return branch
      for (const wire of attachedWires) {
        const otherNode =
          wire.sourcePinId === pin.id ? wire.targetPinId : wire.sourcePinId;
        if (wire.isCut) {
          cutWireLabel = wire.label || wire.id;
          measuredOhms = Math.max(measuredOhms, 1e9);
          referenceNode = otherNode;
          referenceLabel = wire.label || `Harness (${otherNode})`;
          break;
        }
        const rWire = passiveNet.calculateEquivalentResistance(pin.id, otherNode);
        if (rWire > measuredOhms) {
          measuredOhms = rWire;
          referenceNode = otherNode;
          referenceLabel = wire.label || `Harness (${otherNode})`;
        }
      }
    } else if (pin.id === 'ecu-pin-3' || pin.id === 'ecu-pin-4') {
      referenceNode = 'bench-vbat';
      referenceLabel = 'Bench +12V Supply Rail';
      expectedMaxOhms = 2.0;
      measuredOhms = passiveNet.calculateEquivalentResistance(pin.id, 'bench-vbat');
    } else if (attachedWires.length > 0) {
      expectedMaxOhms = 2.0;
      measuredOhms = 0;

      for (const wire of attachedWires) {
        const otherNode =
          wire.sourcePinId === pin.id ? wire.targetPinId : wire.sourcePinId;
        const branchNominalMax = Math.max(2.0, (wire.resistance || 0.05) + 1.5);
        if (wire.isCut) {
          cutWireLabel = wire.label || wire.id;
          referenceNode = otherNode;
          referenceLabel = wire.label || `Harness -> ${otherNode}`;
          expectedMaxOhms = branchNominalMax;
          measuredOhms = passiveNet.calculateEquivalentResistance(pin.id, otherNode);
          break;
        }
        const rWire = passiveNet.calculateEquivalentResistance(pin.id, otherNode);
        if (rWire >= measuredOhms) {
          measuredOhms = rWire;
          referenceNode = otherNode;
          referenceLabel = wire.label || `Harness -> ${otherNode}`;
          expectedMaxOhms = branchNominalMax;
        }
      }
    } else if (pin.id === 'ecu-pin-11') {
      const seriesFaultR = FaultManager.getSeriesFaultOhms(faults, pin.id);
      referenceNode = 'ecu-pin-1';
      referenceLabel = 'KL31 Internal Driver Return (100Ω)';
      expectedMaxOhms = 120.0;
      const baseR = passiveNet.calculateEquivalentResistance(pin.id, 'ecu-pin-1');
      measuredOhms = seriesFaultR >= 1e9 ? 1e9 : baseR + seriesFaultR;
    } else if (pin.id === 'ecu-pin-12') {
      referenceNode = 'relay-85';
      referenceLabel = 'Main Relay Coil Pin 85 Lead';
      expectedMaxOhms = 2.0;
      measuredOhms = passiveNet.calculateEquivalentResistance(pin.id, 'relay-85');
    } else if (pin.id === 'ecu-pin-15') {
      referenceNode = 'ecu-pin-6';
      referenceLabel = 'SGND Nernst Bias Return (~100kΩ)';
      expectedMaxOhms = 120000;
      measuredOhms = passiveNet.calculateEquivalentResistance(pin.id, 'ecu-pin-6');
    } else if (pin.id === 'ecu-pin-16') {
      referenceNode = 'bench-vbat';
      referenceLabel = 'Fuel Pump Relay Coil (85Ω)';
      expectedMaxOhms = 110.0;
      measuredOhms = passiveNet.calculateEquivalentResistance(pin.id, 'bench-vbat');
    } else {
      referenceNode = 'chassis-gnd';
      referenceLabel = 'Chassis GND Return';
      expectedMaxOhms = 2.0;
      measuredOhms = passiveNet.calculateEquivalentResistance(pin.id, 'chassis-gnd');
    }

    const displayOhms = cutWireLabel ? 'O.L (Cut Wire)' : formatContinuityOhms(measuredOhms);

    // Cross-check unintended rail shorts first
    const isShortToGnd =
      pin.category !== 'ground' && shortToGndOhms < 2.0;
    const isShortToVbat =
      pin.id !== 'ecu-pin-3' && pin.id !== 'ecu-pin-4' && shortToVbatOhms < 2.0;

    let status: PinContinuityStatus;
    let message: string;
    const openThreshold =
      pin.id === 'ecu-pin-15' ? 250000 : Math.max(expectedMaxOhms * 10, 2000);

    if (isShortToGnd || isShortToVbat) {
      status = 'SHORT_FAULT';
      faultCount += 1;
      message = isShortToGnd
        ? `Short to Chassis GND detected (${formatContinuityOhms(shortToGndOhms)})`
        : `Short to +12V VBAT rail detected (${formatContinuityOhms(shortToVbatOhms)})`;
    } else if (cutWireLabel) {
      status = 'OPEN_CIRCUIT';
      faultCount += 1;
      message = `Open circuit: Harness wire "${cutWireLabel}" is cut (loop reads ${formatContinuityOhms(measuredOhms)})`;
    } else if (!isFinite(measuredOhms) || measuredOhms >= openThreshold) {
      status = 'OPEN_CIRCUIT';
      faultCount += 1;
      message = `Open circuit (${displayOhms}) to ${referenceLabel} — expected ≤ ${formatContinuityOhms(expectedMaxOhms)}`;
    } else if (measuredOhms > expectedMaxOhms) {
      status = 'HIGH_RESISTANCE';
      faultCount += 1;
      message = `High resistance (${displayOhms}) to ${referenceLabel} — inspect corroded terminal/wire (spec ≤ ${formatContinuityOhms(expectedMaxOhms)})`;
    } else {
      status = 'CLOSED_CONTINUITY';
      passedCount += 1;
      message = `Closed continuity verified (${displayOhms}) to ${referenceLabel}`;
    }

    return {
      pinId: pin.id,
      pinNumber: pin.pinNumber,
      label: pin.label,
      name: pin.name,
      category: pin.category,
      referenceNode,
      referenceLabel,
      measuredOhms,
      displayOhms,
      expectedMaxOhms,
      shortToGndOhms,
      shortToVbatOhms,
      status,
      hasLiveSupplyWarning: isPowerLiveWarning,
      message,
    };
  });

  return {
    isPowerLiveWarning,
    supplyVoltageV: isPowerLiveWarning ? powerSupply.voltageSetting : 0,
    checkedCount,
    passedCount,
    faultCount,
    results,
  };
}

