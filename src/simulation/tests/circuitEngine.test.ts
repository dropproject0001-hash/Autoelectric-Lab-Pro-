/**
 * Automated Verification Test Suite for AutoTech Virtual Lab Pro
 * Tests MNA Circuit Simulation Engine, Automotive Component Models,
 * Multimeter Thevenin Measurements, Power Supply, and Fault Injection.
 */

import { MatrixSolver } from '../engine/MatrixSolver';
import { CircuitNetwork } from '../electrical/CircuitNetwork';
import { AutomotiveModels } from '../components/AutomotiveModels';
import { FaultManager } from '../faults/FaultManager';
import { SignalGenerator } from '../signals/SignalGenerator';
import {
  solveCircuit,
  analyzePinBinaryState,
  evaluateBulkPinContinuity,
  DEFAULT_ECU_PINS,
  DEFAULT_BENCH_COMPONENTS,
  DEFAULT_WIRES,
} from '../../utils/circuitSolver';
import { BenchComponent, InjectedFault, MultimeterState, PowerSupplyState, WireConnection } from '../../types/ecu';
import { evaluateCircuitAnomalies } from '../diagnostics/circuitAudioMonitor';
import {
  BENCH_TROUBLE_SCENARIOS,
  PH_BENCH_TROUBLE_SCENARIOS,
  evaluateBenchPulseAndSignalStatus,
  findBenchTroubleScenarioById,
} from '../faults/benchTroubleScenarios';
import {
  PH_DOMAIN_DEFINITIONS,
  PH_REFERENCE_ATTRIBUTION,
  PH_TROUBLE_SCENARIOS_520,
  PH_TROUBLE_SCENARIOS_ALL,
  PH_TROUBLE_SCENARIOS_BATCH2_520,
  PH_TROUBLE_SCENARIOS_BATCH3_520,
  PH_TROUBLE_SCENARIOS_BATCH4_520,
  getPhScenarioById,
  getPhScenariosByDomain,
  searchPhScenarios,
  splitDiagnosticSteps,
} from '../../data/phTroubleScenarios520';
import {
  TROUBLE_TRIAGE_PRESETS,
  findRelatedTroubleScenarios,
  formatScenarioClipboardText,
  getIndexedScenarioByPhId,
  loadFavoriteScenarioIds,
  loadPinnedLookupIds,
  loadRecentLookupIds,
  recordRecentLookupId,
  searchTroubleScenariosRanked,
  toggleFavoriteScenarioId,
  togglePinnedLookupId,
} from '../../utils/troubleScenarioLookup';
import {
  LAB_DRAWER_ARCHETYPE_LABELS,
  LAB_DRAWER_ICON_ASSET_PATHS,
  LAB_DRAWER_ICON_SIZES,
  type LabDrawerIconName,
  renderLabDrawerIconPaths,
} from '../../components/icons/LabDrawerIcons';
import {
  AUTO_PLAY_STEP_DELAY_MS,
  buildStepCompletionSpeech,
  computeScenarioStepProgress,
  evaluateScenarioVoiceCoach,
  filterVoiceTranscriptForScenario,
  formatScenarioTranscriptText,
  resolveAutoPlayNextStepIndex,
  stepScenarioIndex,
} from '../../utils/troubleScenarioVoiceCoach';
import { offlineVoiceAssistant } from '../../services/offlineVoiceService';
import {
  parseAndExecuteVoiceCommand,
  type VoiceCommandActions,
} from '../../utils/voiceCommandParser';
import {
  BUILT_IN_FAULT_SEQUENCES,
  MIN_PULSE_WIDTH_MS,
  computeNextFaultSequenceEdgeMs,
  deleteCustomFaultSequence,
  evaluateDiagnosticReasoning,
  evaluateFaultSequenceFrame,
  exportFaultSequenceJson,
  importFaultSequenceJson,
  loadSavedFaultSequences,
  mergeFaultSequencesWithBuiltIns,
  parseImportedFaultSequenceJson,
  resetFaultSequenceStoreForTests,
  saveCustomFaultSequence,
  type CustomFaultSequence,
} from '../faults/faultSequenceService';

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  expected: string;
  actual: string;
  error?: string;
}

const testResults: TestResult[] = [];

function assert(name: string, category: string, condition: boolean, expected: string, actual: string) {
  testResults.push({
    name,
    category,
    passed: condition,
    expected,
    actual,
  });
}

function assertCloseTo(
  name: string,
  category: string,
  actual: number,
  expected: number,
  tolerance = 0.05
) {
  const diff = Math.abs(actual - expected);
  const passed = diff <= tolerance;
  assert(
    name,
    category,
    passed,
    `${expected} ± ${tolerance}`,
    `${actual.toFixed(4)} (diff: ${diff.toFixed(4)})`
  );
}

// ==========================================
// TEST SUITE 1: Numerical Linear Solver (MNA)
// ==========================================
function testMatrixSolver() {
  // Test 1.1: 2x2 system
  // 2*v1 - 1*v2 = 5
  // -1*v1 + 3*v2 = 5
  // Solution: v1 = 4, v2 = 3
  const A = [
    [2, -1],
    [-1, 3],
  ];
  const b = [5, 5];
  const x = MatrixSolver.solve(A, b);

  assertCloseTo('MNA 2x2 Linear System Solve', 'Numerical Solver', x[0], 4.0, 0.001);
  assertCloseTo('MNA 2x2 Linear System Solve (v2)', 'Numerical Solver', x[1], 3.0, 0.001);

  // Test 1.2: Singular / Degenerate Matrix
  const A_sing = [
    [1, 1],
    [1, 1],
  ];
  const b_sing = [2, 2];
  const x_sing = MatrixSolver.solve(A_sing, b_sing);
  assert(
    'Singular Matrix Graceful Regularization',
    'Numerical Solver',
    x_sing.every(v => !isNaN(v) && isFinite(v)),
    'Finite non-NaN values',
    JSON.stringify(x_sing)
  );

  // Test 1.3: Near-Singular Pivot Row Swap Before Regularization
  // A = [[0, 1], [1e-13, 1]], b = [1, 2] -> Exact solution: x = [1e13, 1]
  const A_near = [
    [0, 1],
    [1e-13, 1],
  ];
  const b_near = [1, 2];
  const x_near = MatrixSolver.solve(A_near, b_near);
  assert(
    'Near-Singular Pivot Swaps Rows Before Regularizing (A=[[0,1],[1e-13,1]], b=[1,2] -> x=[1e13,1])',
    'Numerical Solver',
    Math.abs(x_near[0] - 1e13) / 1e13 < 1e-6 && Math.abs(x_near[1] - 1.0) < 1e-9,
    'x = [1e13, 1]',
    `x = [${x_near[0]}, ${x_near[1]}]`
  );
}

// ==========================================
// TEST SUITE 2: Ohm's Law & Circuit Network
// ==========================================
function testOhmsLawAndNetwork() {
  const network = new CircuitNetwork();

  // Voltage source: 12.6V on node 'vbat'
  network.addVoltageSource('VS1', 'vbat', '0', 12.6, 0.02);

  // Load resistor: 10 ohms between 'vbat' and 'load_node'
  network.addResistor('load_node', '0', 10.0);
  network.addResistor('vbat', 'load_node', 0.05); // wire resistance

  const solution = network.solve();
  const vLoad = solution.nodeVoltages['load_node'] ?? 0;
  const currentDraw = solution.sourceCurrentDrawAmps;

  // Expected: 12.6 / (10 + 0.02 + 0.05) = 12.6 / 10.07 ≈ 1.2512 A
  // vLoad = 1.2512 * 10 = 12.512 V
  assertCloseTo("Ohm's Law V_Load", 'Electrical Network', vLoad, 12.512, 0.05);
  assertCloseTo("Ohm's Law Source Current", 'Electrical Network', currentDraw, 1.2512, 0.05);
}

// ==========================================
// TEST SUITE 3: Automotive Component Physics
// ==========================================
function testAutomotiveModels() {
  // 3.1: Dual TPS Transfer Function
  const tpsIdle = AutomotiveModels.calculateTps(0, 5.0);
  assertCloseTo('TPS Throttle 0% Track 1 (0.50V min)', 'Automotive Models', tpsIdle.track1Voltage, 0.50, 0.02);
  assertCloseTo('TPS Throttle 0% Track 2 (4.50V inverted)', 'Automotive Models', tpsIdle.track2Voltage, 4.50, 0.02);

  const tpsHalf = AutomotiveModels.calculateTps(50, 5.0);
  assertCloseTo('TPS Throttle 50% Track 1 (2.50V)', 'Automotive Models', tpsHalf.track1Voltage, 2.50, 0.02);

  const tpsWot = AutomotiveModels.calculateTps(100, 5.0);
  assertCloseTo('TPS Throttle 100% Track 1 (4.50V WOT)', 'Automotive Models', tpsWot.track1Voltage, 4.50, 0.02);
  assertCloseTo('TPS Throttle 100% Track 2 (0.50V WOT)', 'Automotive Models', tpsWot.track2Voltage, 0.50, 0.02);

  // 3.2: ECT Steinhart-Hart NTC Thermistor
  const rCold = AutomotiveModels.calculateEct(10).resistanceOhms; // 10°C
  const rNominal = AutomotiveModels.calculateEct(25).resistanceOhms; // 25°C
  const rHot = AutomotiveModels.calculateEct(85).resistanceOhms; // 85°C

  assert(
    'ECT NTC Negative Temperature Coefficient (R_cold > R_nominal > R_hot)',
    'Automotive Models',
    rCold > rNominal && rNominal > rHot,
    'Cold > Nominal > Hot',
    `Cold: ${rCold.toFixed(0)}Ω, Nom: ${rNominal.toFixed(0)}Ω, Hot: ${rHot.toFixed(0)}Ω`
  );
  assertCloseTo('ECT Thermistor 25°C Benchmark (2500Ω)', 'Automotive Models', rNominal, 2500, 1.0);

  // 3.3: CAN Bus Termination Resistance
  const canNominal = AutomotiveModels.calculateCanBus(true, true);
  assertCloseTo('CAN Bus Dual 120Ω Parallel Termination (60Ω)', 'Automotive Models', canNominal.busResistanceOhms, 60.0, 0.1);

  const canOpenTerm = AutomotiveModels.calculateCanBus(true, false);
  assertCloseTo('CAN Bus Single Term Open (120Ω Remaining)', 'Automotive Models', canOpenTerm.busResistanceOhms, 120.0, 0.1);

  // 3.4: Ratiometric TPS & MAP scaling at reduced VREF and 0V safety
  const tpsLowVref = AutomotiveModels.calculateTps(50, 2.5);
  assertCloseTo('TPS 50% at 2.5V VREF Scales Ratiometrically (1.25V)', 'Automotive Models', tpsLowVref.track1Voltage, 1.25, 0.02);
  const tpsZeroVref = AutomotiveModels.calculateTps(50, 0);
  assert(
    'TPS at 0V VREF Avoids NaN / Infinity',
    'Automotive Models',
    Number.isFinite(tpsZeroVref.track1Voltage) && Number.isFinite(tpsZeroVref.rLower) && tpsZeroVref.track1Voltage === 0,
    'Finite 0V output & valid resistor divider',
    `v=${tpsZeroVref.track1Voltage}, rLower=${tpsZeroVref.rLower}`
  );
  const mapLowVref = AutomotiveModels.calculateMap(100, 2.5);
  assertCloseTo('MAP 100kPa at 2.5V VREF Scales Ratiometrically (2.25V)', 'Automotive Models', mapLowVref.voltage, 2.25, 0.02);
}

// ==========================================
// TEST SUITE 4: Fault Injection & Diagnostics
// ==========================================
function testFaultInjection() {
  const basePins = DEFAULT_ECU_PINS;
  const baseComponents = DEFAULT_BENCH_COMPONENTS;
  const baseWires = DEFAULT_WIRES;

  const normalSupply: PowerSupplyState = {
    voltageSetting: 12.6,
    currentLimit: 5.0,
    isOutputEnabled: true,
    preset: '12V_BENCH',
  };

  const dmmVoltage: MultimeterState = {
    mode: 'V_DC',
    redProbe: { attachedToPinId: 'ecu-pin-7', attachedLabel: 'TPS_SIG (Pin 7)' },
    blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'Chassis GND' },
    isPowered: true,
    rangeAuto: true,
    holdValue: false,
  };

  // Set TPS throttle component to 50% for 2.50V benchmark
  const testComponents = baseComponents.map(c =>
    c.id === 'comp-tps' ? { ...c, state: { ...c.state, throttleAnglePercent: 50 } } : c
  );

  // Normal TPS Voltage (2.50V at 50% throttle)
  const normSol = solveCircuit(normalSupply, basePins, [], baseWires, testComponents, dmmVoltage);
  assertCloseTo('Nominal TPS Sensor Output Voltage (2.50V at 50% throttle)', 'Fault Injection', normSol.multimeterReading.value, 2.50, 0.15);
  assert('Nominal State DTC Count == 0', 'Fault Injection', normSol.activeDTCs.length === 0, '0 DTCs', `${normSol.activeDTCs.length} DTCs`);

  // Fault 1: Short TPS to Ground
  const shortFault: InjectedFault[] = [
    { pinId: 'ecu-pin-7', faultType: 'SHORT_TO_GND', description: 'TPS signal wire pinched to metal ground', timestamp: Date.now() },
  ];
  const shortSol = solveCircuit(normalSupply, basePins, shortFault, baseWires, testComponents, dmmVoltage);
  assertCloseTo('TPS Short to GND Voltage (0.0V)', 'Fault Injection', shortSol.multimeterReading.value, 0.0, 0.05);
  assert('TPS Short to GND Generates P0122 DTC', 'Fault Injection', shortSol.activeDTCs.some(d => d.code === 'P0122'), 'Contains P0122', JSON.stringify(shortSol.activeDTCs.map(d => d.code)));

  // Fault 2: Short to Battery (+12.6V)
  const vbatFault: InjectedFault[] = [
    { pinId: 'ecu-pin-7', faultType: 'SHORT_TO_VBAT', description: 'Harness shorted to battery +12V', timestamp: Date.now() },
  ];
  const vbatSol = solveCircuit(normalSupply, basePins, vbatFault, baseWires, testComponents, dmmVoltage);
  assertCloseTo('TPS Short to VBAT Voltage (12.6V)', 'Fault Injection', vbatSol.multimeterReading.value, 12.6, 0.2);
  assert('TPS Short to VBAT Generates P0123 DTC', 'Fault Injection', vbatSol.activeDTCs.some(d => d.code === 'P0123'), 'Contains P0123', JSON.stringify(vbatSol.activeDTCs.map(d => d.code)));

  // Fault 3: High Resistance Corrosion (250Ω) on TPS Pin 7
  const corrodeFault: InjectedFault[] = [
    { pinId: 'ecu-pin-7', faultType: 'HIGH_RESISTANCE_250R', description: 'Corroded pin terminal (250Ω)', timestamp: Date.now() },
  ];
  const corrodeSol = solveCircuit(normalSupply, basePins, corrodeFault, baseWires, testComponents, dmmVoltage);
  assert(
    'Corrosion Introduces Measurable Voltage Attenuation',
    'Fault Injection',
    corrodeSol.multimeterReading.value < normSol.multimeterReading.value,
    '< nominal 2.5V',
    `${corrodeSol.multimeterReading.value.toFixed(3)}V (nominal: ${normSol.multimeterReading.value.toFixed(3)}V)`
  );

  // Fault 4: True Series Open Circuit on TPS Signal (Pin 7)
  const tpsOpenFault: InjectedFault[] = [
    { pinId: 'ecu-pin-7', faultType: 'OPEN_CIRCUIT', description: 'TPS Signal Wire Break', timestamp: Date.now() },
  ];
  const tpsOpenSol = solveCircuit(normalSupply, basePins, tpsOpenFault, baseWires, testComponents, dmmVoltage);
  assertCloseTo('TPS Pin 7 Open Circuit Isolates ADC Input (~0.0V)', 'Fault Injection', tpsOpenSol.nodeVoltages['ecu-pin-7'] ?? -1, 0.0, 0.05);
  assert('TPS Open Circuit Triggers P0122', 'Fault Injection', tpsOpenSol.activeDTCs.some(d => d.code === 'P0122'), 'Contains P0122', JSON.stringify(tpsOpenSol.activeDTCs.map(d => d.code)));

  // Fault 5: True Series Ground Corrosion (+50Ω) on KL31 Pin 1 causes genuine ground lift
  const gndCorrodeFault: InjectedFault[] = [
    { pinId: 'ecu-pin-1', faultType: 'HIGH_RESISTANCE_50R', description: 'Main Ground Fretting', timestamp: Date.now() },
  ];
  const gndCorrodeSol = solveCircuit(normalSupply, basePins, gndCorrodeFault, baseWires, testComponents, dmmVoltage);
  const pin1GroundLift = gndCorrodeSol.nodeVoltages['ecu-pin-1'] ?? 0;
  assert(
    'Ground Corrosion (+50Ω on Pin 1) Causes Real Ground Offset > 1.5V',
    'Fault Injection',
    pin1GroundLift > 1.5 && pin1GroundLift < 5.0,
    'Between 1.5V and 5.0V',
    `${pin1GroundLift.toFixed(3)}V`
  );

  // Fault 6: Injector 1 Open Circuit triggers P0201 and collapses Pin 10 voltage
  const injOpenFault: InjectedFault[] = [
    { pinId: 'ecu-pin-10', faultType: 'OPEN_CIRCUIT', description: 'Injector 1 Open Circuit', timestamp: Date.now() },
  ];
  const injOpenSol = solveCircuit(normalSupply, basePins, injOpenFault, baseWires, testComponents, dmmVoltage);
  assertCloseTo('Injector 1 Open Drops Pin 10 to 0.0V', 'Fault Injection', injOpenSol.nodeVoltages['ecu-pin-10'] ?? -1, 0.0, 0.05);
  assert('Injector 1 Open Logs P0201 DTC', 'Fault Injection', injOpenSol.activeDTCs.some(d => d.code === 'P0201'), 'Contains P0201', JSON.stringify(injOpenSol.activeDTCs.map(d => d.code)));

  // Fault 7: PSU Constant-Current (C.C.) Foldback Under Short to VBAT->GND & Low Supply P0562
  const lowLimSupply: PowerSupplyState = {
    voltageSetting: 12.6,
    currentLimit: 2.0,
    isOutputEnabled: true,
    preset: '12V_BENCH',
  };
  const kl30ShortFault: InjectedFault[] = [
    { pinId: 'ecu-pin-3', faultType: 'SHORT_TO_GND', description: 'KL30 Hard Short to GND', timestamp: Date.now() },
  ];
  const ccSol = solveCircuit(lowLimSupply, basePins, kl30ShortFault, baseWires, testComponents, dmmVoltage);
  assert(
    'PSU C.C. Foldback Collapses bench-vbat & Clamps Current <= Limit',
    'Fault Injection',
    ccSol.isSupplyCurrentTripped &&
      (ccSol.nodeVoltages['bench-vbat'] ?? 12) < 2.0 &&
      ccSol.supplyCurrentDrawAmps <= lowLimSupply.currentLimit + 0.05 &&
      ccSol.activeDTCs.some(d => d.code === 'P0562'),
    'Tripped=true, Vbat < 2.0V, I <= 2.0A, P0562',
    `tripped=${ccSol.isSupplyCurrentTripped}, vbat=${(ccSol.nodeVoltages['bench-vbat'] ?? 0).toFixed(2)}V, I=${ccSol.supplyCurrentDrawAmps.toFixed(2)}A, dtcs=${ccSol.activeDTCs.map(d => d.code).join(',')}`
  );

  // Fault 8: Direct CAN_H to CAN_L jumper short (< 25 Ohm bus termination) triggers U0001, while nominal bus does not
  const canShortWires: WireConnection[] = [
    ...baseWires,
    {
      id: 'wire-can-bus-short',
      sourcePinId: 'ecu-pin-13',
      targetPinId: 'ecu-pin-14',
      color: '#ef4444',
      label: 'CAN_H <-> CAN_L Direct Short',
      isCut: false,
      resistance: 0.05,
    },
  ];
  const canShortSol = solveCircuit(normalSupply, basePins, [], canShortWires, testComponents, dmmVoltage);
  assert(
    'CAN_H to CAN_L Direct Bus Short Triggers U0001',
    'Fault Injection',
    !normSol.activeDTCs.some((d) => d.code === 'U0001') &&
      canShortSol.activeDTCs.some((d) => d.code === 'U0001'),
    'Nominal clears U0001; CAN_H-to-CAN_L short triggers U0001',
    `nominal=${normSol.activeDTCs.map((d) => d.code).join(',')}; short=${canShortSol.activeDTCs.map((d) => d.code).join(',')}`
  );
}

// ==========================================
// TEST SUITE 5: Virtual Multimeter & Measurements
// ==========================================
function testMultimeterModes() {
  // Key-OFF condition: power supply turned OFF for passive resistance diagnostics
  const offSupply: PowerSupplyState = {
    voltageSetting: 12.6,
    currentLimit: 5.0,
    isOutputEnabled: false,
    preset: '12V_BENCH',
  };

  // 5.1: Continuity / Resistance Mode on CAN Bus Termination (Key OFF)
  const dmmOhms: MultimeterState = {
    mode: 'RESISTANCE',
    redProbe: { attachedToPinId: 'ecu-pin-13', attachedLabel: 'CAN_H' },
    blackProbe: { attachedToPinId: 'ecu-pin-14', attachedLabel: 'CAN_L' },
    isPowered: true,
    rangeAuto: true,
    holdValue: false,
  };

  const ohmsSol = solveCircuit(offSupply, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, dmmOhms);
  assertCloseTo(
    'DMM Resistance Mode Measures CAN Bus Termination (60Ω Key-OFF)',
    'Digital Multimeter',
    ohmsSol.multimeterReading.value,
    60.0,
    2.0
  );

  // 5.2: Live Circuit Warning when measuring Ohms with Power ON
  const liveSupply: PowerSupplyState = {
    voltageSetting: 12.6,
    currentLimit: 5.0,
    isOutputEnabled: true,
    preset: '12V_BENCH',
  };
  const liveOhmsSol = solveCircuit(liveSupply, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, dmmOhms);
  assert(
    'DMM Ohms on Live Circuit Triggers Warning & Lockout',
    'Digital Multimeter',
    liveOhmsSol.multimeterReading.isWarning && liveOhmsSol.multimeterReading.display === 'ERR',
    'Warning ERR',
    `${liveOhmsSol.multimeterReading.display} (${liveOhmsSol.multimeterReading.warningMessage ?? 'OK'})`
  );

  // 5.3: Continuity Mode (Key-OFF valid & Live Circuit lockout)
  const dmmCont: MultimeterState = {
    mode: 'CONTINUITY',
    redProbe: { attachedToPinId: 'ecu-pin-1', attachedLabel: 'KL31 GND 1' },
    blackProbe: { attachedToPinId: 'ecu-pin-2', attachedLabel: 'KL31 GND 2' },
    isPowered: true,
    rangeAuto: true,
    holdValue: false,
  };
  const contSol = solveCircuit(offSupply, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, dmmCont);
  assert(
    'DMM Continuity Beeps on Common Grounds (<50Ω)',
    'Digital Multimeter',
    contSol.multimeterReading.shouldBeep || contSol.multimeterReading.value < 5.0,
    'Continuity BEEP',
    contSol.multimeterReading.display
  );

  const dmmContLive: MultimeterState = {
    ...dmmCont,
    redProbe: { attachedToPinId: 'ecu-pin-3', attachedLabel: 'KL30' },
  };
  const contLiveSol = solveCircuit(liveSupply, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, dmmContLive);
  assert(
    'DMM Continuity on Live 12V Rail Triggers Warning & Lockout',
    'Digital Multimeter',
    contLiveSol.multimeterReading.isWarning && contLiveSol.multimeterReading.display === 'ERR',
    'Warning ERR',
    contLiveSol.multimeterReading.display
  );

  // 5.4: DMM AC Voltage & Frequency on Active Injector Pin
  const dmmAcInj: MultimeterState = {
    mode: 'V_AC',
    redProbe: { attachedToPinId: 'ecu-pin-10', attachedLabel: 'INJ_1' },
    blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'Chassis GND' },
    isPowered: true,
    rangeAuto: true,
    holdValue: false,
  };
  const acInjSol = solveCircuit(liveSupply, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, dmmAcInj, { rpm: 1200, isInjectorFiring: true });
  assert(
    'DMM V_AC Measures Real Non-Zero AC RMS on Firing Injector',
    'Digital Multimeter',
    acInjSol.multimeterReading.value > 1.0,
    '> 1.0V AC RMS',
    `${acInjSol.multimeterReading.display} ${acInjSol.multimeterReading.unit}`
  );

  const dmmFreqInj: MultimeterState = { ...dmmAcInj, mode: 'FREQUENCY' };
  const freqInjSol = solveCircuit(liveSupply, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, dmmFreqInj, { rpm: 1200, isInjectorFiring: true });
  assertCloseTo('DMM Frequency Mode Reads 20.0 Hz at 1200 RPM on INJ_1', 'Digital Multimeter', freqInjSol.multimeterReading.value, 20.0, 0.5);

  // 5.5: DMM Diode Mode Measures Valid PN Drop on ECU Pin & O.L on Disconnected Open Wire
  const dmmDiode: MultimeterState = {
    mode: 'DIODE',
    redProbe: { attachedToPinId: 'ecu-pin-7', attachedLabel: 'TPS_SIG' },
    blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'Chassis GND' },
    isPowered: true,
    rangeAuto: true,
    holdValue: false,
  };
  const diodeSol = solveCircuit(offSupply, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, dmmDiode);
  assert(
    'DMM Diode Mode Reads Forward Junction Drop (~0.5–0.8V) Key-OFF',
    'Digital Multimeter',
    diodeSol.multimeterReading.value >= 0.5 && diodeSol.multimeterReading.value <= 0.85,
    '0.50V – 0.85V',
    `${diodeSol.multimeterReading.display} ${diodeSol.multimeterReading.unit}`
  );
}

// ==========================================
// TEST SUITE 6: Oscilloscope Physical Signals
// ==========================================
function testOscilloscopeSignals() {
  // 6.1: Crankshaft 60-2 Missing Tooth Pattern & Signal Loss
  const crankTooth1 = SignalGenerator.getCrankshaftVrSignal(0.001, 1200);
  const crankLost = SignalGenerator.getCrankshaftVrSignal(0.001, 1200, true);
  assert('Crankshaft VR Signal Generates Dynamic Sine Wave', 'Oscilloscope Engine', typeof crankTooth1 === 'number' && !isNaN(crankTooth1) && crankLost === 0, 'Valid Number & 0 when lost', `${crankTooth1} / lost=${crankLost}`);

  // 6.1b: Camshaft Hall Phase Shift + DTC P0016 / P0335
  const cmpNom = SignalGenerator.getCamshaftHallSignal(0.001, 1200, 0);
  const cmpShifted = SignalGenerator.getCamshaftHallSignal(0.001, 1200, 180);
  assert('Camshaft Hall 180° Phase Shift Inverts Sync Pulse', 'Oscilloscope Engine', cmpNom === 5.0 && cmpShifted === 0.0, '5V @ 0°, 0V @ 180°', `nom=${cmpNom}V, shift180=${cmpShifted}V`);

  const liveSupply: PowerSupplyState = {
    voltageSetting: 12.6,
    currentLimit: 5.0,
    isOutputEnabled: true,
    preset: '12V_BENCH',
  };
  const dmmDummy: MultimeterState = {
    mode: 'V_DC',
    redProbe: { attachedToPinId: 'ecu-pin-7', attachedLabel: 'TPS' },
    blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'GND' },
    isPowered: true,
    rangeAuto: true,
    holdValue: false,
  };
  const ckpCmpFaultSol = solveCircuit(liveSupply, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, dmmDummy, {
    rpm: 1200,
    camPhaseOffsetDeg: 22,
    ckpSignalLost: true,
  });
  assert(
    'CKP Signal Loss & >15° CMP Drift Log P0335 & P0016',
    'Oscilloscope Engine',
    ckpCmpFaultSol.activeDTCs.some(d => d.code === 'P0335') && ckpCmpFaultSol.activeDTCs.some(d => d.code === 'P0016'),
    'Contains P0335 & P0016',
    JSON.stringify(ckpCmpFaultSol.activeDTCs.map(d => d.code))
  );

  // 6.2: Injector Waveform 3-Phase Physical Profile
  // Phase 1: MOSFET Dwell Saturation (0.2V)
  const injDwell = SignalGenerator.getInjectorWaveform(0.001, false, 12.6);
  assertCloseTo('Injector MOSFET Ground Dwell Voltage (~0.2V)', 'Oscilloscope Engine', injDwell, 0.2, 0.05);

  // Phase 2: Inductive Flyback Kick (> 40V)
  const injFlyback = SignalGenerator.getInjectorWaveform(0.00255, false, 12.6);
  assert(
    'Injector Flyback Spike > 40V During De-energization',
    'Oscilloscope Engine',
    injFlyback > 40.0,
    '> 40V Kick',
    `${injFlyback.toFixed(1)}V`
  );

  // Phase 3: Quiescent VBat (12.6V)
  const injQuiescent = SignalGenerator.getInjectorWaveform(0.010, false, 12.6);
  assertCloseTo('Injector Quiescent Battery Voltage (12.6V)', 'Oscilloscope Engine', injQuiescent, 12.6, 0.1);

  // 6.3: Dual-Trace CAN_H vs CAN_L Anti-Phase Correlation (-1.0 / 180 deg)
  const dualCan = SignalGenerator.sampleDualPinWaveformSeries({
    ch1PinId: 'ecu-pin-13',
    ch1PinLabel: 'CAN_H',
    ch1MnaVoltage: 2.5,
    ch2PinId: 'ecu-pin-14',
    ch2PinLabel: 'CAN_L',
    ch2MnaVoltage: 2.5,
    isPowerOn: true,
    hasCanFault: false,
    hasInjectorFault: false,
    isInjectorFiring: true,
    rpm: 1200,
    tStartSec: 0,
    windowMs: 10,
    sampleCount: 96,
  });
  assert(
    'Dual-Trace CAN_H vs CAN_L Exhibits Anti-Phase (r <= -0.95, 180°)',
    'Oscilloscope Engine',
    dualCan.correlationMode === 'ANTI_PHASE' && dualCan.correlationR !== null && dualCan.correlationR <= -0.95 && dualCan.phaseDiffDeg === 180,
    'ANTI_PHASE, r <= -0.95, 180°',
    `${dualCan.correlationMode}, r=${dualCan.correlationR}, deg=${dualCan.phaseDiffDeg}`
  );

  // 6.4: Dual-Trace INJ_1 vs IGN_1 Phase Lag
  const dualTiming = SignalGenerator.sampleDualPinWaveformSeries({
    ch1PinId: 'ecu-pin-10',
    ch1PinLabel: 'INJ_1',
    ch1MnaVoltage: 12.6,
    ch2PinId: 'ecu-pin-11',
    ch2PinLabel: 'IGN_1',
    ch2MnaVoltage: 0.0,
    isPowerOn: true,
    hasCanFault: false,
    hasInjectorFault: false,
    isInjectorFiring: true,
    rpm: 1200,
    tStartSec: 0,
    windowMs: 50,
    sampleCount: 128,
  });
  assert(
    'Dual-Trace INJ_1 vs IGN_1 Captures Both Waveforms & Non-Zero Phase/Lag',
    'Oscilloscope Engine',
    dualTiming.ch1Stats.vpp > 40 && dualTiming.ch2Stats.vpp >= 4.9 && dualTiming.timeLagMs !== null && dualTiming.timeLagMs !== 0,
    'Vpp1>40V, Vpp2>=4.9V, non-zero lag',
    `Vpp1=${dualTiming.ch1Stats.vpp}, Vpp2=${dualTiming.ch2Stats.vpp}, lag=${dualTiming.timeLagMs}ms`
  );

  // 6.5: Dual-Trace KL30 vs KL15 In-Phase Ripple
  const dualPower = SignalGenerator.sampleDualPinWaveformSeries({
    ch1PinId: 'ecu-pin-3',
    ch1PinLabel: 'KL30',
    ch1MnaVoltage: 12.6,
    ch2PinId: 'ecu-pin-4',
    ch2PinLabel: 'KL15',
    ch2MnaVoltage: 12.6,
    isPowerOn: true,
    hasCanFault: false,
    hasInjectorFault: false,
    isInjectorFiring: true,
    rpm: 1200,
    tStartSec: 0,
    windowMs: 40,
    sampleCount: 96,
  });
  assert(
    'Dual-Trace KL30 vs KL15 In-Phase Supply Ripple (r >= 0.99, 0°)',
    'Oscilloscope Engine',
    dualPower.correlationMode === 'IN_PHASE' && dualPower.correlationR !== null && dualPower.correlationR >= 0.99 && dualPower.phaseDiffDeg === 0,
    'IN_PHASE, r >= 0.99, 0°',
    `${dualPower.correlationMode}, r=${dualPower.correlationR}, deg=${dualPower.phaseDiffDeg}`
  );

  // 6.6: Dual-Trace Short-to-GND Fault Collapses Correlation to DC_STATIC
  const dualFaulted = SignalGenerator.sampleDualPinWaveformSeries({
    ch1PinId: 'ecu-pin-7',
    ch1PinLabel: 'TPS_SIG',
    ch1MnaVoltage: 0.0,
    ch1FaultType: 'SHORT_TO_GND',
    ch2PinId: 'ecu-pin-8',
    ch2PinLabel: 'MAP_SIG',
    ch2MnaVoltage: 1.6,
    isPowerOn: true,
    hasCanFault: false,
    hasInjectorFault: false,
    isInjectorFiring: true,
    rpm: 1200,
    tStartSec: 0,
    windowMs: 10,
    sampleCount: 96,
  });
  assert(
    'Dual-Trace Faulted Pin Collapses Correlation to DC_STATIC',
    'Oscilloscope Engine',
    dualFaulted.correlationMode === 'DC_STATIC' && dualFaulted.correlationR === null && dualFaulted.avgDiffV === -1.6,
    'DC_STATIC, r=null, avgDiffV=-1.6',
    `${dualFaulted.correlationMode}, r=${dualFaulted.correlationR}, avgDiffV=${dualFaulted.avgDiffV}`
  );

  // 6.7: Auto-Scale Normalization Across Asymmetric Amplitudes (INJ_1 ~65V vs IGN_1 ~5V)
  const ch1NormsTiming = dualTiming.samples.map((s) => s.ch1Norm);
  const ch2NormsTiming = dualTiming.samples.map((s) => s.ch2Norm);
  const ch1NormMin = Math.min(...ch1NormsTiming);
  const ch1NormMax = Math.max(...ch1NormsTiming);
  const ch2NormMin = Math.min(...ch2NormsTiming);
  const ch2NormMax = Math.max(...ch2NormsTiming);
  assert(
    'Auto-Scale Normalizes Asymmetric INJ_1 (~65V) & IGN_1 (~5V) Both to [0, 100]% While Preserving Raw Vpp',
    'Oscilloscope Engine',
    ch1NormMin === 0 &&
      ch1NormMax === 100 &&
      ch2NormMin === 0 &&
      ch2NormMax === 100 &&
      dualTiming.autoScale.ch1SpanV > 40 &&
      dualTiming.autoScale.ch2SpanV >= 4.9 &&
      dualTiming.autoScale.amplitudeRatio !== null &&
      dualTiming.autoScale.amplitudeRatio > 5,
    'Both 0–100%, raw spans >40V & >=4.9V, ratio > 5×',
    `CH1=[${ch1NormMin},${ch1NormMax}]% (${dualTiming.autoScale.ch1SpanV}V), CH2=[${ch2NormMin},${ch2NormMax}]% (${dualTiming.autoScale.ch2SpanV}V), ratio=${dualTiming.autoScale.amplitudeRatio}x`
  );

  // 6.8: Auto-Scale Gracefully Handles Flat/Faulted DC Channel at 50% Midpoint Without NaN
  const dualFlatVsO2 = SignalGenerator.sampleDualPinWaveformSeries({
    ch1PinId: 'ecu-pin-7',
    ch1PinLabel: 'TPS_SIG',
    ch1MnaVoltage: 0.0,
    ch1FaultType: 'SHORT_TO_GND',
    ch2PinId: 'ecu-pin-15',
    ch2PinLabel: 'O2_SIG',
    ch2MnaVoltage: 0.45,
    isPowerOn: true,
    hasCanFault: false,
    hasInjectorFault: false,
    isInjectorFiring: true,
    rpm: 1200,
    tStartSec: 0,
    windowMs: 800,
    sampleCount: 96,
  });
  const flatCh1AllMid = dualFlatVsO2.samples.every(
    (s) => Number.isFinite(s.ch1Norm) && s.ch1Norm === 50.0 && Number.isFinite(s.ch2Norm) && Number.isFinite(s.diffNorm)
  );
  const o2MinNorm = Math.min(...dualFlatVsO2.samples.map((s) => s.ch2Norm));
  const o2MaxNorm = Math.max(...dualFlatVsO2.samples.map((s) => s.ch2Norm));
  assert(
    'Auto-Scale Maps Flat Short-to-GND Channel to 50% Midpoint & Active O2_SIG to [0, 100]%',
    'Oscilloscope Engine',
    flatCh1AllMid &&
      dualFlatVsO2.autoScale.ch1IsFlat === true &&
      dualFlatVsO2.autoScale.ch2IsFlat === false &&
      dualFlatVsO2.autoScale.amplitudeRatio === null &&
      o2MinNorm === 0 &&
      o2MaxNorm === 100,
    'CH1 flat=true @ 50%, CH2=[0, 100]%, ratio=null',
    `flatCh1AllMid=${flatCh1AllMid}, ch1IsFlat=${dualFlatVsO2.autoScale.ch1IsFlat}, o2Norm=[${o2MinNorm},${o2MaxNorm}]%, ratio=${dualFlatVsO2.autoScale.amplitudeRatio}`
  );
}

// ==========================================
// 7. BINARY STATE MONITOR (PWM & CAN DECODER) TESTS
// ==========================================
function testBinaryStateMonitor() {
  const healthyPsu: PowerSupplyState = {
    voltageSetting: 12.6,
    currentLimit: 5.0,
    isOutputEnabled: true,
    preset: '12V_BENCH',
  };
  const dmmDummy: MultimeterState = {
    mode: 'V_DC',
    redProbe: { attachedToPinId: 'ecu-pin-10', attachedLabel: 'INJ_1 (Pin 10)' },
    blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'Chassis GND' },
    isPowered: true,
    rangeAuto: true,
    holdValue: false,
  };
  const baseSolution = solveCircuit(
    healthyPsu,
    DEFAULT_ECU_PINS,
    [],
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    dmmDummy
  );

  // 7.1: INJ_1 PWM Detection & RPM-Proportional Duty Cycle Scaling
  const inj850 = analyzePinBinaryState({
    pinId: 'ecu-pin-10',
    pinLabel: 'INJ_1',
    pinNumber: 10,
    mnaNodeVoltage: baseSolution.nodeVoltages['ecu-pin-10'] ?? 12.6,
    isPowerOn: true,
    hasCanFault: false,
    hasInjectorFault: false,
    isInjectorFiring: true,
    rpm: 850,
    tStartSec: 0.42,
    windowMs: 100,
  });
  const inj3000 = analyzePinBinaryState({
    pinId: 'ecu-pin-10',
    pinLabel: 'INJ_1',
    pinNumber: 10,
    mnaNodeVoltage: baseSolution.nodeVoltages['ecu-pin-10'] ?? 12.6,
    isPowerOn: true,
    hasCanFault: false,
    hasInjectorFault: false,
    isInjectorFiring: true,
    rpm: 3000,
    tStartSec: 0.42,
    windowMs: 100,
  });

  assert(
    'INJ_1 Binary Monitor Detects Active-Low PWM & Physical RPM Duty Cycle Scaling',
    'Binary State Monitor',
    inj850.detectedProtocol === 'PWM_ACTUATOR' &&
      inj850.metrics.activePolarity === 'ACTIVE_LOW' &&
      inj850.metrics.edgeCount >= 2 &&
      inj850.metrics.pulseWidthMs >= 2.2 &&
      inj850.metrics.pulseWidthMs <= 2.8 &&
      Math.abs(inj850.metrics.frequencyHz - 850 / 60) <= 1.5 &&
      inj850.metrics.dutyCyclePct >= 2.0 &&
      inj850.metrics.dutyCyclePct <= 6.0 &&
      inj3000.metrics.dutyCyclePct >= inj850.metrics.dutyCyclePct * 2.2 &&
      inj3000.metrics.frequencyHz >= 45 &&
      (inj850.metrics.flybackPeakV ?? 0) > 25,
    'PWM_ACTUATOR, ~2.5ms pulse, ~14.2Hz & ~3.5% @ 850 RPM, ~50Hz & >10% @ 3000 RPM, flyback > 25V',
    `proto=${inj850.detectedProtocol}, pw=${inj850.metrics.pulseWidthMs}ms, f850=${inj850.metrics.frequencyHz}Hz, duty850=${inj850.metrics.dutyCyclePct}%, duty3000=${inj3000.metrics.dutyCyclePct}%, f3000=${inj3000.metrics.frequencyHz}Hz, flyback=${inj850.metrics.flybackPeakV}V`
  );

  // 7.2: IGN_1 5V Logic Dwell Trigger Detection
  const ign1200 = analyzePinBinaryState({
    pinId: 'ecu-pin-11',
    pinLabel: 'IGN_1',
    pinNumber: 11,
    mnaNodeVoltage: baseSolution.nodeVoltages['ecu-pin-11'] ?? 0,
    isPowerOn: true,
    hasCanFault: false,
    hasInjectorFault: false,
    isInjectorFiring: true,
    rpm: 1200,
    tStartSec: 0,
    windowMs: 120,
  });
  assert(
    'IGN_1 Binary Monitor Detects 5V Logic Coil Dwell Trigger',
    'Binary State Monitor',
    ign1200.detectedProtocol === 'LOGIC_PULSE' &&
      ign1200.metrics.activePolarity === 'ACTIVE_HIGH' &&
      ign1200.metrics.edgeCount >= 4 &&
      ign1200.metrics.pulseWidthMs >= 2.5 &&
      ign1200.metrics.pulseWidthMs <= 3.5 &&
      Math.abs(ign1200.metrics.frequencyHz - 20) <= 1.0,
    'LOGIC_PULSE, ~3.0ms pulse @ 20 Hz (1200 RPM)',
    `proto=${ign1200.detectedProtocol}, pw=${ign1200.metrics.pulseWidthMs}ms, f=${ign1200.metrics.frequencyHz}Hz, edges=${ign1200.metrics.edgeCount}`
  );

  // 7.3: CAN_H ISO 11898 Differential Frame Pattern Decoding
  const canHealthy = analyzePinBinaryState({
    pinId: 'ecu-pin-13',
    pinLabel: 'CAN_H',
    pinNumber: 13,
    mnaNodeVoltage: baseSolution.nodeVoltages['ecu-pin-13'] ?? 2.5,
    companionMnaVoltage: baseSolution.nodeVoltages['ecu-pin-14'] ?? 2.5,
    isPowerOn: true,
    hasCanFault: false,
    hasInjectorFault: false,
    isInjectorFiring: true,
    rpm: 1200,
    tStartSec: 0,
  });
  assert(
    'CAN_H Binary Monitor Decodes ISO 11898 Differential Bitstream & Frame Summary',
    'Binary State Monitor',
    canHealthy.detectedProtocol === 'CAN_BUS' &&
      canHealthy.samples.length === 48 &&
      canHealthy.bitString.length === 48 &&
      canHealthy.hexBytes.length === 6 &&
      canHealthy.canFrameSummary !== null &&
      canHealthy.canFrameSummary.health === 'ACTIVE_500KBPS' &&
      canHealthy.canFrameSummary.vDiffMax >= 1.9 &&
      canHealthy.canFrameSummary.dominantPct > 10 &&
      canHealthy.canFrameSummary.recessivePct > 10 &&
      canHealthy.canFrameSummary.sofDetected === true,
    'CAN_BUS, 48 bits, 6 hex bytes, Vdiff>=1.9V, SOF detected',
    `proto=${canHealthy.detectedProtocol}, bits=${canHealthy.bitString.length}, bytes=${canHealthy.hexBytes.length}, vDiffMax=${canHealthy.canFrameSummary?.vDiffMax}V, dom=${canHealthy.canFrameSummary?.dominantPct}%, sof=${canHealthy.canFrameSummary?.sofDetected}`
  );

  // 7.4: CAN_H Fault Collapse (SHORT_TO_GND / hasCanFault)
  const canFaultSol = solveCircuit(
    healthyPsu,
    DEFAULT_ECU_PINS,
    [{ pinId: 'ecu-pin-13', faultType: 'SHORT_TO_GND', description: 'CAN_H short to GND', timestamp: Date.now() }],
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    dmmDummy
  );
  const canFaulted = analyzePinBinaryState({
    pinId: 'ecu-pin-13',
    pinLabel: 'CAN_H',
    pinNumber: 13,
    mnaNodeVoltage: canFaultSol.nodeVoltages['ecu-pin-13'] ?? 0,
    companionMnaVoltage: canFaultSol.nodeVoltages['ecu-pin-14'] ?? 2.5,
    faultType: 'SHORT_TO_GND',
    isPowerOn: true,
    hasCanFault: true,
    hasInjectorFault: false,
    isInjectorFiring: true,
    rpm: 1200,
    tStartSec: 0,
  });
  assert(
    'CAN Bus Short-to-GND Fault Collapses Differential Traffic to BUS_FAULT_COLLAPSED',
    'Binary State Monitor',
    canFaulted.detectedProtocol === 'FAULT_OR_OFF' &&
      canFaulted.canFrameSummary?.health === 'BUS_FAULT_COLLAPSED' &&
      canFaulted.canFrameSummary?.dominantPct === 0,
    'FAULT_OR_OFF, BUS_FAULT_COLLAPSED, dominantPct=0',
    `proto=${canFaulted.detectedProtocol}, health=${canFaulted.canFrameSummary?.health}, dom=${canFaulted.canFrameSummary?.dominantPct}%`
  );

  // 7.5: Static DC Analog Pin (TPS_SIG) vs Regulated 5V Rail (VREF_5V) + PSU OFF
  const tpsStatic = analyzePinBinaryState({
    pinId: 'ecu-pin-7',
    pinLabel: 'TPS_SIG',
    pinNumber: 7,
    mnaNodeVoltage: baseSolution.nodeVoltages['ecu-pin-7'] ?? 0.68,
    isPowerOn: true,
    hasCanFault: false,
    hasInjectorFault: false,
    isInjectorFiring: true,
    rpm: 850,
    tStartSec: 0,
  });
  const vrefHigh = analyzePinBinaryState({
    pinId: 'ecu-pin-5',
    pinLabel: 'VREF_5V',
    pinNumber: 5,
    mnaNodeVoltage: baseSolution.nodeVoltages['ecu-pin-5'] ?? 5.0,
    isPowerOn: true,
    hasCanFault: false,
    hasInjectorFault: false,
    isInjectorFiring: true,
    rpm: 850,
    tStartSec: 0,
  });
  const psuOffCan = analyzePinBinaryState({
    pinId: 'ecu-pin-13',
    pinLabel: 'CAN_H',
    pinNumber: 13,
    mnaNodeVoltage: 0,
    companionMnaVoltage: 0,
    isPowerOn: false,
    hasCanFault: false,
    hasInjectorFault: false,
    isInjectorFiring: true,
    rpm: 850,
    tStartSec: 0,
  });
  assert(
    'Static DC Pins Report 0 Edges & PSU OFF Halts CAN Frame Decoding',
    'Binary State Monitor',
    tpsStatic.detectedProtocol === 'STATIC_LEVEL' &&
      tpsStatic.metrics.edgeCount === 0 &&
      tpsStatic.metrics.currentLogicLevel === 0 &&
      vrefHigh.detectedProtocol === 'STATIC_LEVEL' &&
      vrefHigh.metrics.currentLogicLevel === 1 &&
      vrefHigh.metrics.dutyCyclePct === 100 &&
      psuOffCan.detectedProtocol === 'FAULT_OR_OFF' &&
      psuOffCan.canFrameSummary?.health === 'POWER_OFF' &&
      psuOffCan.anomalies.length === 0,
    'TPS static 0 edges (LOW), VREF static 100% (HIGH), PSU OFF CAN -> POWER_OFF & 0 anomalies',
    `tps=${tpsStatic.detectedProtocol}/${tpsStatic.metrics.edgeCount}/${tpsStatic.metrics.currentLogicLevel}, vref=${vrefHigh.metrics.dutyCyclePct}%/${vrefHigh.metrics.currentLogicLevel}, off=${psuOffCan.canFrameSummary?.health}, offAnomalies=${psuOffCan.anomalies.length}`
  );

  // 7.6: Diagnostic Notification System - Nominal Signals Produce Zero Critical/Warning Anomalies + Accurate Transition Frequency
  const injNarrowHealthy = analyzePinBinaryState({
    pinId: 'ecu-pin-10',
    pinLabel: 'INJ_1',
    pinNumber: 10,
    mnaNodeVoltage: baseSolution.nodeVoltages['ecu-pin-10'] ?? 12.6,
    isPowerOn: true,
    hasCanFault: false,
    hasInjectorFault: false,
    isInjectorFiring: true,
    rpm: 850,
    tStartSec: 0.01,
    windowMs: 40,
  });

  const healthyCriticalOrWarn = [
    ...inj850.anomalies,
    ...inj3000.anomalies,
    ...ign1200.anomalies,
    ...canHealthy.anomalies,
    ...tpsStatic.anomalies,
    ...vrefHigh.anomalies,
    ...injNarrowHealthy.anomalies,
  ].filter((a) => a.severity === 'CRITICAL' || a.severity === 'WARNING');

  assert(
    'Healthy Signals & Narrow 40ms Capture Window Produce 0 False-Positive Anomalies',
    'Diagnostic Notifications',
    healthyCriticalOrWarn.length === 0 &&
      inj850.metrics.transitionFreqHz >= 18 &&
      inj3000.metrics.transitionFreqHz >= 80 &&
      canHealthy.metrics.transitionFreqHz >= 3000,
    '0 CRITICAL/WARNING anomalies across healthy pins; transitionFreqHz >= 18Hz (850RPM), >=80Hz (3000RPM), >=3kHz (CAN)',
    `falsePositives=${healthyCriticalOrWarn.length}, f850=${inj850.metrics.transitionFreqHz}Hz, f3000=${inj3000.metrics.transitionFreqHz}Hz, fCan=${canHealthy.metrics.transitionFreqHz}Hz`
  );

  // 7.7: Diagnostic Notification System - Invalid CAN Framing & PWM Signal Clipping Detection
  const injOpenSol = solveCircuit(
    healthyPsu,
    DEFAULT_ECU_PINS,
    [{ pinId: 'ecu-pin-10', faultType: 'OPEN_CIRCUIT', description: 'INJ_1 open harness', timestamp: Date.now() }],
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    dmmDummy
  );
  const injClippedOpen = analyzePinBinaryState({
    pinId: 'ecu-pin-10',
    pinLabel: 'INJ_1',
    pinNumber: 10,
    mnaNodeVoltage: injOpenSol.nodeVoltages['ecu-pin-10'] ?? 0,
    faultType: 'OPEN_CIRCUIT',
    isPowerOn: true,
    hasCanFault: false,
    hasInjectorFault: true,
    isInjectorFiring: true,
    rpm: 1200,
    tStartSec: 0,
    windowMs: 100,
  });

  const ignShortGnd = analyzePinBinaryState({
    pinId: 'ecu-pin-11',
    pinLabel: 'IGN_1',
    pinNumber: 11,
    mnaNodeVoltage: 0,
    faultType: 'SHORT_TO_GND',
    isPowerOn: true,
    hasCanFault: false,
    hasInjectorFault: false,
    isInjectorFiring: true,
    rpm: 1200,
    tStartSec: 0,
    windowMs: 100,
  });

  const hasInvalidCanFraming = canFaulted.anomalies.some(
    (a) => a.code === 'INVALID_CAN_FRAMING' && a.title === 'Invalid CAN Framing' && a.severity === 'CRITICAL'
  );
  const hasInjPwmClipping = injClippedOpen.anomalies.some(
    (a) => a.code === 'PWM_SIGNAL_CLIPPING' && a.title === 'PWM Signal Clipping' && a.severity === 'CRITICAL'
  );
  const hasIgnPwmClipping = ignShortGnd.anomalies.some(
    (a) => a.code === 'PWM_SIGNAL_CLIPPING' && a.title === 'PWM Signal Clipping' && a.severity === 'CRITICAL'
  );

  assert(
    'Faulted CAN & Clipped PWM Signals Flag Invalid CAN Framing & PWM Signal Clipping',
    'Diagnostic Notifications',
    hasInvalidCanFraming &&
      canFaulted.metrics.transitionFreqHz === 0 &&
      hasInjPwmClipping &&
      injClippedOpen.metrics.transitionFreqHz === 0 &&
      hasIgnPwmClipping &&
      ignShortGnd.metrics.transitionFreqHz === 0,
    'INVALID_CAN_FRAMING on faulted CAN_H; PWM_SIGNAL_CLIPPING on faulted INJ_1 & IGN_1 with 0 Hz transitions',
    `canAlert=${hasInvalidCanFraming} (${canFaulted.metrics.transitionFreqHz}Hz), injClip=${hasInjPwmClipping} (${injClippedOpen.metrics.transitionFreqHz}Hz), ignClip=${hasIgnPwmClipping} (${ignShortGnd.metrics.transitionFreqHz}Hz)`
  );
}

// ==========================================
// 8. NONLINEAR AUXILIARY COMPONENTS & PSU DECOUPLING
// ==========================================
function testNonLinearAuxiliaryAndPsuDecoupling() {
  const nominalPsu: PowerSupplyState = {
    voltageSetting: 12.6,
    currentLimit: 5.0,
    isOutputEnabled: true,
    preset: '12V_BENCH',
  };
  const dmmDummy: MultimeterState = {
    mode: 'V_DC',
    redProbe: { attachedToPinId: 'ecu-pin-3', attachedLabel: 'KL30' },
    blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'GND' },
    isPowered: true,
    rangeAuto: true,
    holdValue: false,
  };

  // 8.1: PSU Draw Measures True bench-vsource Current (< 0.25A nominal, decoupled from internal LDO/CAN bias)
  const baseSol = solveCircuit(
    nominalPsu,
    DEFAULT_ECU_PINS,
    [],
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    dmmDummy
  );
  assert(
    'PSU Draw Reflects True bench-vsource Load (< 0.25A Nominal)',
    'Nonlinear & PSU Fidelity',
    baseSol.supplyCurrentDrawAmps > 0.14 && baseSol.supplyCurrentDrawAmps < 0.25,
    '0.14A < I_psu < 0.25A',
    `${baseSol.supplyCurrentDrawAmps.toFixed(4)}A`
  );

  // 8.2: 1N4007 Diode Forward Drop (~0.7V) vs Reverse Blocking (~0V)
  const auxDiode: BenchComponent = {
    id: 'aux-diode-1',
    name: '1N4007 Diode',
    type: 'diode',
    libraryTemplateId: 'lib-diode-1n4007',
    x: 200,
    y: 200,
    pins: [
      { id: 'aux-diode-1-anode', label: 'ANODE (A)', type: 'input', relativeX: 0, relativeY: 40 },
      { id: 'aux-diode-1-cathode', label: 'CATHODE (K)', type: 'output', relativeX: 0, relativeY: 80 },
    ],
    state: { forwardDropVolts: 0.7, isReverse: false },
  };
  const auxLoad: BenchComponent = {
    id: 'aux-load-1',
    name: '100R Load',
    type: 'load',
    x: 300,
    y: 200,
    pins: [
      { id: 'aux-load-1-a', label: 'LOAD +', type: 'input', relativeX: 0, relativeY: 40 },
      { id: 'aux-load-1-b', label: 'LOAD -', type: 'ground', relativeX: 0, relativeY: 80 },
    ],
    state: { resistanceOhms: 100 },
  };
  const fwdWires: WireConnection[] = [
    ...DEFAULT_WIRES,
    { id: 'w-d-1', sourcePinId: 'ecu-pin-3', targetPinId: 'aux-diode-1-anode', color: '#ef4444', label: 'KL30->A', isCut: false, resistance: 0.05 },
    { id: 'w-d-2', sourcePinId: 'aux-diode-1-cathode', targetPinId: 'aux-load-1-a', color: '#eab308', label: 'K->Load', isCut: false, resistance: 0.05 },
    { id: 'w-d-3', sourcePinId: 'aux-load-1-b', targetPinId: 'chassis-gnd', color: '#64748b', label: 'Load->GND', isCut: false, resistance: 0.05 },
  ];
  const fwdSol = solveCircuit(
    nominalPsu,
    DEFAULT_ECU_PINS,
    [],
    fwdWires,
    [...DEFAULT_BENCH_COMPONENTS, auxDiode, auxLoad],
    dmmDummy
  );
  const vFwdLoad = fwdSol.nodeVoltages['aux-load-1-a'] ?? 0;
  assert(
    '1N4007 Diode Forward Biased Drops ~0.7V (V_load ~ 11.4–12.0V)',
    'Nonlinear & PSU Fidelity',
    vFwdLoad >= 11.4 && vFwdLoad <= 12.1,
    '11.4V – 12.1V',
    `${vFwdLoad.toFixed(3)}V`
  );

  // Reverse bias by swapping isReverse = true
  const revDiode: BenchComponent = { ...auxDiode, state: { forwardDropVolts: 0.7, isReverse: true } };
  const revSol = solveCircuit(
    nominalPsu,
    DEFAULT_ECU_PINS,
    [],
    fwdWires,
    [...DEFAULT_BENCH_COMPONENTS, revDiode, auxLoad],
    dmmDummy
  );
  const vRevLoad = revSol.nodeVoltages['aux-load-1-a'] ?? 12;
  assertCloseTo(
    '1N4007 Diode Reverse Biased Blocks Current (~0.0V Load)',
    'Nonlinear & PSU Fidelity',
    vRevLoad,
    0.0,
    0.05
  );

  // 8.3: 5.1V Zener Clamps 12.6V Pull-Up to ~5.1V
  const zenerComp: BenchComponent = {
    id: 'aux-zener-1',
    name: '5.1V Zener',
    type: 'diode',
    libraryTemplateId: 'lib-diode-zener-5v1',
    x: 220,
    y: 240,
    pins: [
      { id: 'aux-zener-1-cathode', label: 'CATHODE (5V SIG)', type: 'input', relativeX: 0, relativeY: 40 },
      { id: 'aux-zener-1-anode', label: 'ANODE (GND)', type: 'ground', relativeX: 0, relativeY: 80 },
    ],
    state: { zenerVoltage: 5.1 },
  };
  const seriesRes: BenchComponent = {
    id: 'aux-res-z',
    name: '1k Series',
    type: 'resistor',
    x: 220,
    y: 180,
    pins: [
      { id: 'aux-res-z-1', label: 'R1', type: 'input', relativeX: 0, relativeY: 40 },
      { id: 'aux-res-z-2', label: 'R2', type: 'output', relativeX: 0, relativeY: 80 },
    ],
    state: { resistanceOhms: 1000 },
  };
  const zenerWires: WireConnection[] = [
    ...DEFAULT_WIRES,
    { id: 'w-z-1', sourcePinId: 'ecu-pin-3', targetPinId: 'aux-res-z-1', color: '#ef4444', label: 'KL30->R', isCut: false, resistance: 0.05 },
    { id: 'w-z-2', sourcePinId: 'aux-res-z-2', targetPinId: 'aux-zener-1-cathode', color: '#eab308', label: 'R->Z_K', isCut: false, resistance: 0.05 },
    { id: 'w-z-3', sourcePinId: 'aux-zener-1-anode', targetPinId: 'chassis-gnd', color: '#64748b', label: 'Z_A->GND', isCut: false, resistance: 0.05 },
  ];
  const zenerSol = solveCircuit(
    nominalPsu,
    DEFAULT_ECU_PINS,
    [],
    zenerWires,
    [...DEFAULT_BENCH_COMPONENTS, zenerComp, seriesRes],
    dmmDummy
  );
  assertCloseTo(
    '5.1V Zener Diode Clamps 12.6V Through 1kΩ to ~5.1V',
    'Nonlinear & PSU Fidelity',
    zenerSol.nodeVoltages['aux-zener-1-cathode'] ?? 0,
    5.11,
    0.15
  );

  // 8.4: SMBJ24CA TVS Stays Off at 12.6V & Clamps at ~26.7V Under 32V Surge
  const tvsComp: BenchComponent = {
    id: 'aux-tvs-1',
    name: 'SMBJ24CA TVS',
    type: 'diode',
    libraryTemplateId: 'lib-diode-smbj24ca',
    x: 260,
    y: 260,
    pins: [
      { id: 'aux-tvs-1-t1', label: 'TERMINAL 1', type: 'input', relativeX: 0, relativeY: 40 },
      { id: 'aux-tvs-1-t2', label: 'TERMINAL 2', type: 'ground', relativeX: 0, relativeY: 80 },
    ],
    state: { breakdownVolts: 26.7 },
  };
  const surgeR: BenchComponent = { ...seriesRes, id: 'aux-res-tvs', state: { resistanceOhms: 50 } };
  const tvsWires: WireConnection[] = [
    ...DEFAULT_WIRES,
    { id: 'w-tvs-1', sourcePinId: 'ecu-pin-3', targetPinId: 'aux-res-z-1', color: '#ef4444', label: 'KL30->R', isCut: false, resistance: 0.05 },
    { id: 'w-tvs-2', sourcePinId: 'aux-res-z-2', targetPinId: 'aux-tvs-1-t1', color: '#eab308', label: 'R->TVS1', isCut: false, resistance: 0.05 },
    { id: 'w-tvs-3', sourcePinId: 'aux-tvs-1-t2', targetPinId: 'chassis-gnd', color: '#64748b', label: 'TVS2->GND', isCut: false, resistance: 0.05 },
  ];
  const tvs12Sol = solveCircuit(
    nominalPsu,
    DEFAULT_ECU_PINS,
    [],
    tvsWires,
    [...DEFAULT_BENCH_COMPONENTS, tvsComp, { ...surgeR, id: 'aux-res-z' }],
    dmmDummy
  );
  const tvs32Sol = solveCircuit(
    { ...nominalPsu, voltageSetting: 32.0 },
    DEFAULT_ECU_PINS,
    [],
    tvsWires,
    [...DEFAULT_BENCH_COMPONENTS, tvsComp, { ...surgeR, id: 'aux-res-z' }],
    dmmDummy
  );
  assert(
    'SMBJ24CA TVS Stays Off at 12.6V (~12.4V Line) & Clamps 32V Surge (~26.8V)',
    'Nonlinear & PSU Fidelity',
    (tvs12Sol.nodeVoltages['aux-tvs-1-t1'] ?? 0) > 12.0 &&
      (tvs32Sol.nodeVoltages['aux-tvs-1-t1'] ?? 32) >= 26.6 &&
      (tvs32Sol.nodeVoltages['aux-tvs-1-t1'] ?? 32) <= 27.5,
    '12.6V-> >12.0V; 32V-> 26.6–27.5V',
    `12V=${(tvs12Sol.nodeVoltages['aux-tvs-1-t1'] ?? 0).toFixed(2)}V, 32V=${(tvs32Sol.nodeVoltages['aux-tvs-1-t1'] ?? 0).toFixed(2)}V`
  );

  // 8.5: Auxiliary Relay with Wired Coil Requires Energized Coil to Close NO (30->87)
  const auxRelay: BenchComponent = {
    id: 'aux-relay-1',
    name: 'Aux SPDT Relay',
    type: 'relay',
    x: 340,
    y: 260,
    pins: [
      { id: 'aux-relay-1-pin30', label: '30 COM', type: 'power', relativeX: 0, relativeY: 20 },
      { id: 'aux-relay-1-pin87', label: '87 NO', type: 'output', relativeX: 0, relativeY: 40 },
      { id: 'aux-relay-1-pin87a', label: '87a NC', type: 'output', relativeX: 0, relativeY: 60 },
      { id: 'aux-relay-1-pin86', label: '86 COIL +', type: 'input', relativeX: 0, relativeY: 80 },
      { id: 'aux-relay-1-pin85', label: '85 COIL -', type: 'ground', relativeX: 0, relativeY: 100 },
    ],
    state: { coilResistanceOhms: 85, isLatched: true },
  };
  const relayCoilOffWires: WireConnection[] = [
    ...DEFAULT_WIRES,
    { id: 'w-r-30', sourcePinId: 'ecu-pin-3', targetPinId: 'aux-relay-1-pin30', color: '#ef4444', label: '30', isCut: false, resistance: 0.05 },
    { id: 'w-r-87', sourcePinId: 'aux-relay-1-pin87', targetPinId: 'aux-load-1-a', color: '#22c55e', label: '87', isCut: false, resistance: 0.05 },
    { id: 'w-r-ld', sourcePinId: 'aux-load-1-b', targetPinId: 'chassis-gnd', color: '#64748b', label: 'GND', isCut: false, resistance: 0.05 },
    { id: 'w-r-86', sourcePinId: 'chassis-gnd', targetPinId: 'aux-relay-1-pin86', color: '#94a3b8', label: '86->GND', isCut: false, resistance: 0.05 },
    { id: 'w-r-85', sourcePinId: 'aux-relay-1-pin85', targetPinId: 'chassis-gnd', color: '#64748b', label: '85->GND', isCut: false, resistance: 0.05 },
  ];
  const relayCoilOnWires: WireConnection[] = relayCoilOffWires.map((w) =>
    w.id === 'w-r-86' ? { ...w, sourcePinId: 'ecu-pin-3', label: '86->KL30' } : w
  );
  const relayOffSol = solveCircuit(
    nominalPsu,
    DEFAULT_ECU_PINS,
    [],
    relayCoilOffWires,
    [...DEFAULT_BENCH_COMPONENTS, auxRelay, auxLoad],
    dmmDummy
  );
  const relayOnSol = solveCircuit(
    nominalPsu,
    DEFAULT_ECU_PINS,
    [],
    relayCoilOnWires,
    [...DEFAULT_BENCH_COMPONENTS, auxRelay, auxLoad],
    dmmDummy
  );
  assert(
    'Wired Auxiliary Relay Stays Open at 0V Coil & Closes NO (30->87) at 12V Coil',
    'Nonlinear & PSU Fidelity',
    (relayOffSol.nodeVoltages['aux-load-1-a'] ?? 12) < 0.05 &&
      (relayOnSol.nodeVoltages['aux-load-1-a'] ?? 0) > 11.8,
    '0V coil -> <0.05V load; 12V coil -> >11.8V load',
    `coil0V=${(relayOffSol.nodeVoltages['aux-load-1-a'] ?? 0).toFixed(3)}V, coil12V=${(relayOnSol.nodeVoltages['aux-load-1-a'] ?? 0).toFixed(3)}V`
  );

  // 8.6: DMM Direct Diode Polarity Test (Key-OFF)
  const offPsu: PowerSupplyState = { ...nominalPsu, isOutputEnabled: false };
  const dmmFwd: MultimeterState = {
    mode: 'DIODE',
    redProbe: { attachedToPinId: 'aux-diode-1-anode', attachedLabel: 'A' },
    blackProbe: { attachedToPinId: 'aux-diode-1-cathode', attachedLabel: 'K' },
    isPowered: true,
    rangeAuto: true,
    holdValue: false,
  };
  const dmmRev: MultimeterState = {
    ...dmmFwd,
    redProbe: { attachedToPinId: 'aux-diode-1-cathode', attachedLabel: 'K' },
    blackProbe: { attachedToPinId: 'aux-diode-1-anode', attachedLabel: 'A' },
  };
  const dmmFwdSol = solveCircuit(offPsu, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, [...DEFAULT_BENCH_COMPONENTS, auxDiode], dmmFwd);
  const dmmRevSol = solveCircuit(offPsu, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, [...DEFAULT_BENCH_COMPONENTS, auxDiode], dmmRev);
  assert(
    'DMM Diode Mode Reads 0.700V Forward & O.L Reverse Across Auxiliary Diode',
    'Nonlinear & PSU Fidelity',
    Math.abs(dmmFwdSol.multimeterReading.value - 0.7) < 0.01 &&
      dmmRevSol.multimeterReading.display === 'O.L' &&
      dmmRevSol.multimeterReading.isOverLimit,
    'Fwd=0.700V, Rev=O.L',
    `Fwd=${dmmFwdSol.multimeterReading.display}${dmmFwdSol.multimeterReading.unit}, Rev=${dmmRevSol.multimeterReading.display}`
  );

  // 8.7: DMM Diode Mode Polarity-Sensitive ECU Pin ESD Protection Junction Test (Key-OFF)
  const ecuEsdFwd: MultimeterState = {
    mode: 'DIODE',
    redProbe: { attachedToPinId: 'ecu-pin-13', attachedLabel: 'CAN_H' },
    blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'GND' },
    isPowered: true,
    rangeAuto: true,
    holdValue: false,
  };
  const ecuEsdRev: MultimeterState = {
    ...ecuEsdFwd,
    redProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'GND' },
    blackProbe: { attachedToPinId: 'ecu-pin-13', attachedLabel: 'CAN_H' },
  };
  const esdFwdSol = solveCircuit(offPsu, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, ecuEsdFwd);
  const esdRevSol = solveCircuit(offPsu, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, ecuEsdRev);
  assert(
    'DMM Diode Mode Distinguishes Forward (~0.520V) vs Reverse (O.L) Polarity on ECU Pin ESD Junction',
    'Nonlinear & PSU Fidelity',
    esdFwdSol.multimeterReading.value >= 0.5 &&
      esdFwdSol.multimeterReading.value <= 0.78 &&
      esdRevSol.multimeterReading.display === 'O.L' &&
      esdRevSol.multimeterReading.isOverLimit,
    'Fwd 0.50–0.78V, Rev=O.L',
    `Fwd=${esdFwdSol.multimeterReading.display}V, Rev=${esdRevSol.multimeterReading.display}`
  );
}

// ==========================================
// TEST SUITE 9: Circuit Acoustic Anomaly Monitor
// ==========================================
function testCircuitAudioAnomalyMonitor() {
  const nominalSupply: PowerSupplyState = {
    voltageSetting: 12.6,
    currentLimit: 5.0,
    isOutputEnabled: true,
    preset: '12V_BENCH',
  };
  const dmmVdc: MultimeterState = {
    mode: 'V_DC',
    redProbe: { attachedToPinId: 'ecu-pin-7', attachedLabel: 'TPS_SIG' },
    blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'GND' },
    isPowered: true,
    rangeAuto: true,
    holdValue: false,
  };

  // 9.1: Nominal bench state produces 0 audio alerts
  const nominalSol = solveCircuit(
    nominalSupply,
    DEFAULT_ECU_PINS,
    [],
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    dmmVdc
  );
  const nominalSnap = evaluateCircuitAnomalies({
    powerSupply: nominalSupply,
    pins: DEFAULT_ECU_PINS,
    wires: DEFAULT_WIRES,
    faults: [],
    multimeter: dmmVdc,
    circuitSolution: nominalSol,
  });
  assert(
    'Nominal Bench State Reports NOMINAL Acoustic Status (0 Alerts)',
    'Circuit Audio Monitor',
    nominalSnap.overallSeverity === 'NOMINAL' &&
      nominalSnap.primaryKind === 'NONE' &&
      nominalSnap.alerts.length === 0,
    'NOMINAL / NONE / 0 alerts',
    `${nominalSnap.overallSeverity} / ${nominalSnap.primaryKind} / ${nominalSnap.alerts.length} alerts`
  );

  // 9.2: Direct Short to Ground on KL30 triggers CRITICAL SHORT_CIRCUIT alert
  const shortFaults: InjectedFault[] = [
    {
      pinId: 'ecu-pin-3',
      faultType: 'SHORT_TO_GND',
      description: 'KL30 Direct Short to Chassis GND',
      timestamp: Date.now(),
    },
  ];
  const shortSol = solveCircuit(
    { ...nominalSupply, currentLimit: 2.0 },
    DEFAULT_ECU_PINS,
    shortFaults,
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    dmmVdc
  );
  const shortSnap = evaluateCircuitAnomalies({
    powerSupply: { ...nominalSupply, currentLimit: 2.0 },
    pins: DEFAULT_ECU_PINS,
    wires: DEFAULT_WIRES,
    faults: shortFaults,
    multimeter: dmmVdc,
    circuitSolution: shortSol,
  });
  assert(
    'KL30 Short to Ground Triggers CRITICAL SHORT_CIRCUIT Acoustic Alert & OCP Trip Detection',
    'Circuit Audio Monitor',
    shortSnap.overallSeverity === 'CRITICAL' &&
      shortSnap.primaryKind === 'SHORT_CIRCUIT' &&
      shortSnap.alerts.some((a) => a.id === 'ocp-supply-trip'),
    'CRITICAL SHORT_CIRCUIT with ocp-supply-trip',
    `${shortSnap.overallSeverity} / ${shortSnap.primaryKind} (${shortSnap.alerts.map((a) => a.id).join(', ')})`
  );

  // 9.3: Ground corrosion (HIGH_RESISTANCE_50R on Pin 1) triggers VOLTAGE_DROP alert
  const gndDropFaults: InjectedFault[] = [
    {
      pinId: 'ecu-pin-1',
      faultType: 'HIGH_RESISTANCE_50R',
      description: 'Corroded Main Ground Strap (+50Ω)',
      timestamp: Date.now(),
    },
  ];
  const gndDropSol = solveCircuit(
    nominalSupply,
    DEFAULT_ECU_PINS,
    gndDropFaults,
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    dmmVdc
  );
  const gndDropSnap = evaluateCircuitAnomalies({
    powerSupply: nominalSupply,
    pins: DEFAULT_ECU_PINS,
    wires: DEFAULT_WIRES,
    faults: gndDropFaults,
    multimeter: dmmVdc,
    circuitSolution: gndDropSol,
  });
  assert(
    'Ground Corrosion & High-Resistance Terminal Triggers VOLTAGE_DROP Acoustic Alert',
    'Circuit Audio Monitor',
    gndDropSnap.primaryKind === 'VOLTAGE_DROP' &&
      gndDropSnap.alerts.some((a) => a.kind === 'VOLTAGE_DROP'),
    'primaryKind === VOLTAGE_DROP',
    `${gndDropSnap.overallSeverity} / ${gndDropSnap.primaryKind} (${gndDropSnap.alerts.map((a) => a.id).join(', ')})`
  );

  // 9.4: Live DMM Resistance Lockout & Cut Harness Wire triggers ABNORMAL_BEHAVIOR alert
  const dmmLiveOhms: MultimeterState = {
    ...dmmVdc,
    mode: 'RESISTANCE',
    redProbe: { attachedToPinId: 'ecu-pin-3', attachedLabel: 'KL30' },
  };
  const cutWires = DEFAULT_WIRES.map((w) => (w.id === 'wire-7' ? { ...w, isCut: true } : w));
  const abnormalSol = solveCircuit(
    nominalSupply,
    DEFAULT_ECU_PINS,
    [],
    cutWires,
    DEFAULT_BENCH_COMPONENTS,
    dmmLiveOhms
  );
  const abnormalSnap = evaluateCircuitAnomalies({
    powerSupply: nominalSupply,
    pins: DEFAULT_ECU_PINS,
    wires: cutWires,
    faults: [],
    multimeter: dmmLiveOhms,
    circuitSolution: abnormalSol,
  });
  assert(
    'Cut Harness Wire & Live DMM Resistance Probing Trigger ABNORMAL_BEHAVIOR Acoustic Alerts',
    'Circuit Audio Monitor',
    abnormalSnap.primaryKind === 'ABNORMAL_BEHAVIOR' &&
      abnormalSnap.alerts.some((a) => a.id.startsWith('dmm-warning-')) &&
      abnormalSnap.alerts.some((a) => a.id === 'abnormal-cut-wire-wire-7'),
    'ABNORMAL_BEHAVIOR with dmm-warning & abnormal-cut-wire-wire-7',
    `${abnormalSnap.primaryKind} (${abnormalSnap.alerts.map((a) => a.id).join(', ')})`
  );
}

// ==========================================
// TEST SUITE 10: Bench Trouble Scenarios & No-Pulse Gating
// ==========================================
function testBenchTroubleScenarios() {
  const nominalSupply: PowerSupplyState = {
    voltageSetting: 12.6,
    currentLimit: 5.0,
    isOutputEnabled: true,
    preset: '12V_BENCH',
  };
  const dmmVdc: MultimeterState = {
    mode: 'V_DC',
    redProbe: { attachedToPinId: 'ecu-pin-10', attachedLabel: 'INJ_1' },
    blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'Chassis GND' },
    isPowered: true,
    rangeAuto: true,
    holdValue: false,
  };

  assert(
    'Trouble Scenario Catalog Contains Core No-Start & No-Pulse Scenarios',
    'Trouble Emulator',
    BENCH_TROUBLE_SCENARIOS.length >= 8 &&
      BENCH_TROUBLE_SCENARIOS.some((s) => s.id === 'no-start-lost-battery-kl30') &&
      BENCH_TROUBLE_SCENARIOS.some((s) => s.id === 'no-start-lost-ignition-kl15') &&
      BENCH_TROUBLE_SCENARIOS.some((s) => s.id === 'no-pulse-ckp-sensor-lost'),
    'Includes KL30 open, KL15 open, and CKP dropout scenarios',
    `count=${BENCH_TROUBLE_SCENARIOS.length}`
  );

  // 10.1: Nominal bench shows active injector, ignition, CAN, and 5V VREF
  const nomSol = solveCircuit(
    nominalSupply,
    DEFAULT_ECU_PINS,
    [],
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    dmmVdc,
    { rpm: 850, isInjectorFiring: true }
  );
  const nomEval = evaluateBenchPulseAndSignalStatus({
    powerSupply: nominalSupply,
    circuitSolution: nomSol,
    faults: [],
    wires: DEFAULT_WIRES,
    components: DEFAULT_BENCH_COMPONENTS,
    rpmEmulator: { isActive: true, rpm: 850, soundEnabled: false, ckpSignalLost: false },
  });
  assert(
    'Nominal Energized Bench Reports All Pulses & Signals Active',
    'Trouble Emulator',
    nomEval.headlineStatus === 'ALL_SIGNALS_ACTIVE' &&
      nomEval.injectorPulse.hasOutput &&
      nomEval.ignitionPulse.hasOutput &&
      nomEval.canSignal.hasOutput &&
      nomEval.vrefRail.hasOutput,
    'ALL_SIGNALS_ACTIVE across INJ_1, IGN_1, CAN, VREF',
    `${nomEval.headlineStatus} | INJ=${nomEval.injectorPulse.statusLabel}`
  );

  // 10.2: Lost Battery Supply (KL30 Pin 3 OPEN_CIRCUIT) shuts down VREF & all pulses
  const kl30LostFaults: InjectedFault[] = [
    {
      pinId: 'ecu-pin-3',
      faultType: 'OPEN_CIRCUIT',
      description: 'KL30 Battery +12V Feed Open',
      timestamp: Date.now(),
    },
  ];
  const kl30Sol = solveCircuit(
    nominalSupply,
    DEFAULT_ECU_PINS,
    kl30LostFaults,
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    dmmVdc,
    { rpm: 250, isInjectorFiring: true }
  );
  const kl30Eval = evaluateBenchPulseAndSignalStatus({
    powerSupply: nominalSupply,
    circuitSolution: kl30Sol,
    faults: kl30LostFaults,
    wires: DEFAULT_WIRES,
    components: DEFAULT_BENCH_COMPONENTS,
    rpmEmulator: { isActive: true, rpm: 250, soundEnabled: false, ckpSignalLost: false },
  });
  const kl30InjScope = SignalGenerator.samplePinWaveformSeries({
    pinId: 'ecu-pin-10',
    pinLabel: 'INJ_1',
    mnaNodeVoltage: kl30Sol.nodeVoltages['ecu-pin-10'] ?? 0,
    isPowerOn: true,
    isEcuAwake: kl30Eval.isEcuAwake,
    ckpSignalLost: false,
    hasCanFault: false,
    hasInjectorFault: false,
    isInjectorFiring: true,
    rpm: 250,
    tStartSec: 0,
    windowMs: 40,
    sampleCount: 96,
  });
  assert(
    'Lost KL30 Battery Supply Drops VREF (~0V) & Outputs NO PULSE (0.0 Hz)',
    'Trouble Emulator',
    !kl30Eval.isBatteryKl30Ok &&
      !kl30Eval.isEcuAwake &&
      (kl30Sol.nodeVoltages['ecu-pin-5'] ?? 5) < 0.2 &&
      !kl30Eval.injectorPulse.hasOutput &&
      !kl30Eval.ignitionPulse.hasOutput &&
      kl30Eval.injectorPulse.freqHz === 0 &&
      kl30InjScope.freqHz === 0,
    'KL30 failed, VREF < 0.2V, INJ/IGN no output, Scope freqHz = 0',
    `VREF=${(kl30Sol.nodeVoltages['ecu-pin-5'] ?? -1).toFixed(2)}V, INJ=${kl30Eval.injectorPulse.statusLabel}, scopeHz=${kl30InjScope.freqHz}`
  );

  // 10.3: Lost Ignition Supply (KL15 Pin 4 OPEN_CIRCUIT) keeps KL30 > 12V yet suppresses VREF & pulses
  const kl15LostFaults: InjectedFault[] = [
    {
      pinId: 'ecu-pin-4',
      faultType: 'OPEN_CIRCUIT',
      description: 'KL15 Ignition Feed Open',
      timestamp: Date.now(),
    },
  ];
  const kl15Sol = solveCircuit(
    nominalSupply,
    DEFAULT_ECU_PINS,
    kl15LostFaults,
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    dmmVdc,
    { rpm: 250, isInjectorFiring: true }
  );
  const kl15Eval = evaluateBenchPulseAndSignalStatus({
    powerSupply: nominalSupply,
    circuitSolution: kl15Sol,
    faults: kl15LostFaults,
    wires: DEFAULT_WIRES,
    components: DEFAULT_BENCH_COMPONENTS,
    rpmEmulator: { isActive: true, rpm: 250, soundEnabled: false, ckpSignalLost: false },
  });
  assert(
    'Lost KL15 Ignition Keeps KL30 > 12V Yet Suppresses VREF & Pulses (NO PULSE)',
    'Trouble Emulator',
    kl15Eval.isBatteryKl30Ok &&
      kl15Eval.kl30Volts > 12.0 &&
      !kl15Eval.isIgnitionKl15Ok &&
      !kl15Eval.isEcuAwake &&
      (kl15Sol.nodeVoltages['ecu-pin-5'] ?? 5) < 0.2 &&
      !kl15Eval.injectorPulse.hasOutput &&
      !kl15Eval.ignitionPulse.hasOutput &&
      kl15Eval.headlineStatus === 'NO_PULSE_OR_SIGNAL',
    'KL30 > 12V, KL15 dead, VREF < 0.2V, INJ/IGN NO PULSE',
    `KL30=${kl15Eval.kl30Volts.toFixed(2)}V, KL15=${kl15Eval.kl15Volts.toFixed(2)}V, VREF=${kl15Eval.vrefVolts.toFixed(2)}V, title=${kl15Eval.headlineTitle}`
  );

  // 10.4: CKP Signal Loss keeps KL30/KL15/VREF healthy while cutting INJ_1 & IGN_1 pulse to 0.0 Hz
  const ckpEval = evaluateBenchPulseAndSignalStatus({
    powerSupply: nominalSupply,
    circuitSolution: nomSol,
    faults: [],
    wires: DEFAULT_WIRES,
    components: DEFAULT_BENCH_COMPONENTS,
    rpmEmulator: { isActive: true, rpm: 280, soundEnabled: false, ckpSignalLost: true },
  });
  const ckpIgnScope = SignalGenerator.samplePinWaveformSeries({
    pinId: 'ecu-pin-11',
    pinLabel: 'IGN_1',
    mnaNodeVoltage: nomSol.nodeVoltages['ecu-pin-11'] ?? 0,
    isPowerOn: true,
    isEcuAwake: ckpEval.isEcuAwake,
    ckpSignalLost: true,
    hasCanFault: false,
    hasInjectorFault: false,
    isInjectorFiring: true,
    rpm: 280,
    tStartSec: 0,
    windowMs: 40,
    sampleCount: 96,
  });
  assert(
    'CKP Signal Dropout Keeps Power/VREF OK While Reporting NO PULSE (0.0 Hz) on INJ_1 & IGN_1',
    'Trouble Emulator',
    ckpEval.isEcuAwake &&
      ckpEval.isVrefOk &&
      !ckpEval.isCkpOk &&
      !ckpEval.injectorPulse.hasOutput &&
      !ckpEval.ignitionPulse.hasOutput &&
      ckpIgnScope.freqHz === 0,
    'ECU awake, VREF OK, CKP lost, INJ/IGN NO PULSE, IGN scope 0 Hz',
    `awake=${ckpEval.isEcuAwake}, VREF=${ckpEval.vrefVolts.toFixed(2)}V, INJ=${ckpEval.injectorPulse.statusLabel}, ignScopeHz=${ckpIgnScope.freqHz}`
  );
}

// ==========================================
// 11. PH 2,080 REFERENCE TROUBLE SCENARIOS (BATCHES 1–4) & EMULATION MAPPING
// ==========================================
function testPh520TroubleScenariosDataset() {
  // 11.1 Complete 2,080 count: Batch 1 PH-001..520 + Batch 2 PH-521..1040 + Batch 3 PH-1041..1560 + Batch 4 PH-1561..2080
  const expectedIdsB1 = Array.from({ length: 520 }, (_, idx) => `PH-${String(idx + 1).padStart(3, '0')}`);
  const expectedIdsB2 = Array.from({ length: 520 }, (_, idx) => `PH-${idx + 521}`);
  const expectedIdsB3 = Array.from({ length: 520 }, (_, idx) => `PH-${idx + 1041}`);
  const expectedIdsB4 = Array.from({ length: 520 }, (_, idx) => `PH-${idx + 1561}`);
  const actualIdsB1 = PH_TROUBLE_SCENARIOS_520.map(s => s.id);
  const actualIdsB2 = PH_TROUBLE_SCENARIOS_BATCH2_520.map(s => s.id);
  const actualIdsB3 = PH_TROUBLE_SCENARIOS_BATCH3_520.map(s => s.id);
  const actualIdsB4 = PH_TROUBLE_SCENARIOS_BATCH4_520.map(s => s.id);
  const uniqueAllIds = new Set(PH_TROUBLE_SCENARIOS_ALL.map(s => s.id));

  const seqMatchB1 =
    actualIdsB1.length === 520 && expectedIdsB1.every((id, idx) => actualIdsB1[idx] === id);
  const seqMatchB2 =
    actualIdsB2.length === 520 && expectedIdsB2.every((id, idx) => actualIdsB2[idx] === id);
  const seqMatchB3 =
    actualIdsB3.length === 520 && expectedIdsB3.every((id, idx) => actualIdsB3[idx] === id);
  const seqMatchB4 =
    actualIdsB4.length === 520 && expectedIdsB4.every((id, idx) => actualIdsB4[idx] === id);

  const allFieldsValidB1 = PH_TROUBLE_SCENARIOS_520.every(
    s =>
      s.dtcCode.trim().length > 0 &&
      s.title.trim().length > 0 &&
      s.phContext.trim().length > 0 &&
      s.symptoms.trim().length > 0 &&
      s.diagnosticSteps.trim().length > 0 &&
      s.sourcePage >= 2 &&
      s.sourcePage <= 78 &&
      splitDiagnosticSteps(s.diagnosticSteps).length === 3
  );
  const allFieldsValidB2 = PH_TROUBLE_SCENARIOS_BATCH2_520.every(
    s =>
      s.dtcCode.trim().length > 0 &&
      s.dtcCode.length <= 32 &&
      s.title.trim().length > 0 &&
      s.phContext.trim().length > 0 &&
      s.symptoms.trim().length > 0 &&
      s.diagnosticSteps.trim().length > 0 &&
      s.sourcePage >= 2 &&
      s.sourcePage <= 78 &&
      splitDiagnosticSteps(s.diagnosticSteps).length >= 2 &&
      splitDiagnosticSteps(s.diagnosticSteps).length <= 3
  );
  const allFieldsValidB3 = PH_TROUBLE_SCENARIOS_BATCH3_520.every(
    s =>
      s.dtcCode.trim().length > 0 &&
      s.dtcCode.length <= 32 &&
      s.title.trim().length > 0 &&
      s.phContext.trim().length > 0 &&
      s.symptoms.trim().length > 0 &&
      s.diagnosticSteps.trim().length > 0 &&
      s.sourcePage >= 2 &&
      s.sourcePage <= 77 &&
      splitDiagnosticSteps(s.diagnosticSteps).length >= 1 &&
      splitDiagnosticSteps(s.diagnosticSteps).length <= 3
  );
  const allFieldsValidB4 = PH_TROUBLE_SCENARIOS_BATCH4_520.every(
    s =>
      s.dtcCode.trim().length > 0 &&
      s.dtcCode.length <= 64 &&
      s.title.trim().length > 0 &&
      s.phContext.trim().length > 0 &&
      s.symptoms.trim().length > 0 &&
      s.diagnosticSteps.trim().length > 0 &&
      s.sourcePage >= 2 &&
      s.sourcePage <= 76 &&
      s.diagnosticSteps.startsWith('1. ') &&
      splitDiagnosticSteps(s.diagnosticSteps).length >= 1 &&
      splitDiagnosticSteps(s.diagnosticSteps).length <= 3
  );
  assert(
    'PH 2,080 Dataset Integrity: Batches 1–4 (PH-001..PH-2080) Complete',
    'PH 2,080 Catalog',
    seqMatchB1 &&
      seqMatchB2 &&
      seqMatchB3 &&
      seqMatchB4 &&
      uniqueAllIds.size === 2080 &&
      PH_TROUBLE_SCENARIOS_ALL.length === 2080 &&
      allFieldsValidB1 &&
      allFieldsValidB2 &&
      allFieldsValidB3 &&
      allFieldsValidB4 &&
      PH_BENCH_TROUBLE_SCENARIOS.length === 2080,
    '2,080 unique sequential PH-001..PH-2080 records with valid steps & page bounds',
    `b1=${actualIdsB1.length}, b2=${actualIdsB2.length}, b3=${actualIdsB3.length}, b4=${actualIdsB4.length}, mapped=${PH_BENCH_TROUBLE_SCENARIOS.length}, seq=${seqMatchB1 && seqMatchB2 && seqMatchB3 && seqMatchB4}, valid=${allFieldsValidB1 && allFieldsValidB2 && allFieldsValidB3 && allFieldsValidB4}`
  );

  // 11.2 Exact 48-domain distribution matching PDF TOCs (Batches 1–4)
  const expectedDomainCounts = [
    60, 60, 50, 45, 45, 45, 40, 40, 40, 35, 30, 30,
    50, 50, 40, 40, 45, 45, 45, 45, 45, 40, 40, 35,
    50, 45, 45, 45, 45, 45, 45, 40, 40, 40, 40, 40,
    45, 45, 45, 45, 40, 40, 45, 45, 45, 40, 40, 45,
  ];
  const actualDomainCounts = PH_DOMAIN_DEFINITIONS.map(def => getPhScenariosByDomain(def.domainNumber).length);
  const domainCountsExact =
    PH_DOMAIN_DEFINITIONS.length === 48 &&
    expectedDomainCounts.every((cnt, idx) => actualDomainCounts[idx] === cnt && PH_DOMAIN_DEFINITIONS[idx].expectedCount === cnt);
  const totalDomainCount = actualDomainCounts.reduce((acc, n) => acc + n, 0);
  assert(
    'PH 2,080 48-Domain Distribution Matches Reference Manuals Batches 1–4',
    'PH 2,080 Catalog',
    domainCountsExact && totalDomainCount === 2080 && PH_REFERENCE_ATTRIBUTION.provenanceStatus === 'CROSS_REFERENCED',
    '48 domains summing to 2,080 with CROSS_REFERENCED provenance',
    `domains=${PH_DOMAIN_DEFINITIONS.length}, sum=${totalDomainCount}, b4=[${actualDomainCounts.slice(36).join(',')}], status=${PH_REFERENCE_ATTRIBUTION.provenanceStatus}`
  );

  // 11.3 Representative Batches 1–4 lookups + MNA fidelity checks
  const ph001 = getPhScenarioById('PH-001');
  const ph025 = findBenchTroubleScenarioById('ph-025') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph171 = findBenchTroubleScenarioById('ph-171') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph386 = findBenchTroubleScenarioById('ph-386') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph463 = findBenchTroubleScenarioById('ph-463') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph520 = getPhScenarioById('PH-520');
  const ph521 = getPhScenarioById('PH-521');
  const ph837 = findBenchTroubleScenarioById('PH-837') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph840 = findBenchTroubleScenarioById('PH-840') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph854 = findBenchTroubleScenarioById('PH-854') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph864 = findBenchTroubleScenarioById('PH-864') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph884 = findBenchTroubleScenarioById('PH-884') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph926 = getPhScenarioById('PH-926');
  const ph1040 = getPhScenarioById('PH-1040');
  const ph1041 = findBenchTroubleScenarioById('PH-1041') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1056 = findBenchTroubleScenarioById('PH-1056') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1186 = findBenchTroubleScenarioById('PH-1186') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1271 = findBenchTroubleScenarioById('PH-1271') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1304 = findBenchTroubleScenarioById('PH-1304') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1323 = findBenchTroubleScenarioById('PH-1323') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1339 = findBenchTroubleScenarioById('PH-1339') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1364 = findBenchTroubleScenarioById('PH-1364') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1470 = findBenchTroubleScenarioById('PH-1470') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1477 = findBenchTroubleScenarioById('PH-1477') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1487 = findBenchTroubleScenarioById('PH-1487') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1521 = findBenchTroubleScenarioById('PH-1521') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1560 = findBenchTroubleScenarioById('PH-1560') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1561 = findBenchTroubleScenarioById('PH-1561') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1582 = findBenchTroubleScenarioById('PH-1582') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1654 = findBenchTroubleScenarioById('PH-1654') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1853 = findBenchTroubleScenarioById('PH-1853') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1869 = findBenchTroubleScenarioById('PH-1869') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1996 = findBenchTroubleScenarioById('PH-1996') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph1998 = findBenchTroubleScenarioById('PH-1998') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph2040 = findBenchTroubleScenarioById('PH-2040') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph2041 = findBenchTroubleScenarioById('PH-2041') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph2055 = findBenchTroubleScenarioById('PH-2055') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph2060 = findBenchTroubleScenarioById('PH-2060') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph2063 = findBenchTroubleScenarioById('PH-2063') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;
  const ph2080 = findBenchTroubleScenarioById('PH-2080') as (typeof PH_BENCH_TROUBLE_SCENARIOS)[number] | undefined;

  const dmmVdc: MultimeterState = {
    mode: 'V_DC',
    redProbe: { attachedToPinId: 'ecu-pin-5', attachedLabel: 'Pin 5 (VREF)' },
    blackProbe: { attachedToPinId: 'ecu-pin-1', attachedLabel: 'Pin 1 (GND)' },
    isPowered: true,
    rangeAuto: true,
    holdValue: false,
  };
  const baseSupply: PowerSupplyState = {
    voltageSetting: 13.8,
    currentLimit: 5.0,
    isOutputEnabled: true,
    preset: '12V_BENCH',
  };

  // Run PH-386 (U0073 CAN Bus Off) through MNA & pulse evaluator
  const ph386Faults: InjectedFault[] = ph386
    ? ph386.faultsToInject.map((f) => ({
        pinId: f.pinId,
        faultType: f.faultType,
        description: f.description,
        timestamp: Date.now(),
      }))
    : [];
  const ph386Sol = ph386
    ? solveCircuit(baseSupply, DEFAULT_ECU_PINS, ph386Faults, DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, dmmVdc, {
        rpm: ph386.rpmOverride.rpm,
        isInjectorFiring: true,
      })
    : null;
  const ph386Eval =
    ph386 && ph386Sol
      ? evaluateBenchPulseAndSignalStatus({
          powerSupply: baseSupply,
          circuitSolution: ph386Sol,
          faults: ph386Faults,
          wires: DEFAULT_WIRES,
          components: DEFAULT_BENCH_COMPONENTS,
          rpmEmulator: {
            isActive: true,
            rpm: ph386.rpmOverride.rpm,
            soundEnabled: false,
            ckpSignalLost: Boolean(ph386.rpmOverride.ckpSignalLost),
          },
        })
      : null;

  assert(
    'PH Batches 1–4 Representative Mappings: Batch 1–3 + Batch 4 (PH-1561, PH-1582, PH-1654, PH-1853, PH-1869, PH-1996, PH-1998, PH-2040, PH-2041, PH-2055, PH-2060, PH-2063, PH-2080)',
    'PH 2,080 Catalog',
    Boolean(
      ph001 &&
        ph025?.rpmOverride.ckpSignalLost === true &&
        ph171?.emulationFidelity === 'DIAGNOSTIC_REFERENCE_ONLY' &&
        ph171.psuOverride?.isOutputEnabled === false &&
        ph386?.faultsToInject.some(f => f.pinId === 'ecu-pin-13') &&
        ph386Eval?.canSignal.hasOutput === false &&
        ph463?.psuOverride?.voltageSetting !== undefined &&
        ph463.psuOverride.voltageSetting < 10.0 &&
        ph520?.dtcCode.includes('P0088') &&
        ph521?.domainNumber === 13 &&
        ph521?.dtcCode === 'P0087' &&
        ph837?.focusPinId === 'ecu-pin-5' &&
        ph837.emulationFidelity === 'DIRECT_16PIN_FAULT' &&
        ph840?.focusPinId === 'ecu-pin-13' &&
        ph840.emulationFidelity === 'DIRECT_16PIN_FAULT' &&
        ph854?.focusPinId === 'ecu-pin-3' &&
        ph854.faultsToInject.some(f => f.faultType === 'SHORT_TO_GND') &&
        ph864?.focusPinId === 'ecu-pin-6' &&
        ph864.faultsToInject.some(f => f.faultType === 'OPEN_CIRCUIT') &&
        ph884?.emulationFidelity === 'DIAGNOSTIC_REFERENCE_ONLY' &&
        ph884.psuOverride?.isOutputEnabled === false &&
        ph926?.domainNumber === 22 &&
        ph1040?.domainNumber === 24 &&
        searchPhScenarios('tja1040', 'ALL', 'BATCH_2').some(s => s.id === 'PH-840') &&
        ph1041?.domainNumber === 25 &&
        ph1041.rpmOverride.camPhaseOffsetDeg === 24 &&
        ph1056?.focusPinId === 'ecu-pin-11' &&
        ph1056.emulationFidelity === 'DIRECT_16PIN_FAULT' &&
        ph1186?.focusPinId === 'ecu-pin-13' &&
        ph1271?.focusPinId === 'ecu-pin-3' &&
        (ph1271?.psuOverride?.voltageSetting ?? 99) < 10.0 &&
        ph1304?.emulationFidelity === 'DIAGNOSTIC_REFERENCE_ONLY' &&
        ph1304.psuOverride?.isOutputEnabled === false &&
        ph1323?.focusPinId === 'ecu-pin-13' &&
        ph1323.emulationFidelity === 'DIRECT_16PIN_FAULT' &&
        ph1339?.focusPinId === 'ecu-pin-6' &&
        ph1339.emulationFidelity === 'DIRECT_16PIN_FAULT' &&
        ph1364?.focusPinId === 'ecu-pin-12' &&
        ph1364.emulationFidelity === 'DIRECT_16PIN_FAULT' &&
        (ph1470?.psuOverride?.voltageSetting ?? 0) > 15.0 &&
        (ph1477?.psuOverride?.voltageSetting ?? 0) >= 29.0 &&
        ph1487?.focusPinId === 'ecu-pin-13' &&
        ph1521?.emulationFidelity === 'DIAGNOSTIC_REFERENCE_ONLY' &&
        ph1560?.domainNumber === 36 &&
        ph1560.emulationFidelity === 'DIAGNOSTIC_REFERENCE_ONLY' &&
        searchPhScenarios('sealion', 'ALL', 'BATCH_3').some(s => s.id === 'PH-1271') &&
        ph1561?.domainNumber === 37 &&
        ph1561.emulationFidelity === 'DIAGNOSTIC_REFERENCE_ONLY' &&
        ph1582?.rpmOverride.camPhaseOffsetDeg === 24 &&
        ph1654?.focusPinId === 'ecu-pin-10' &&
        ph1853?.focusPinId === 'ecu-pin-13' &&
        ph1853.faultsToInject.some(f => f.faultType === 'SHORT_TO_VBAT') &&
        ph1853.emulationFidelity === 'DIRECT_16PIN_FAULT' &&
        ph1869?.focusPinId === 'ecu-pin-13' &&
        ph1996?.emulationFidelity === 'DIAGNOSTIC_REFERENCE_ONLY' &&
        ph1996.psuOverride?.isOutputEnabled === false &&
        ph1998?.emulationFidelity === 'DIAGNOSTIC_REFERENCE_ONLY' &&
        ph1998.psuOverride?.isOutputEnabled === false &&
        ph2040?.focusPinId === 'ecu-pin-1' &&
        ph2041?.focusPinId === 'ecu-pin-5' &&
        ph2041.faultsToInject.some(f => f.faultType === 'SHORT_TO_GND') &&
        ph2055?.focusPinId === 'ecu-pin-3' &&
        (ph2055?.psuOverride?.voltageSetting ?? 99) < 10.0 &&
        ph2060?.focusPinId === 'ecu-pin-12' &&
        ph2063?.focusPinId === 'ecu-pin-3' &&
        (ph2063?.psuOverride?.voltageSetting ?? 0) > 15.0 &&
        ph2080?.domainNumber === 48 &&
        searchPhScenarios('doip', 'ALL', 'BATCH_4').length > 0
    ),
    'Batches 1–4 representative MNA & reference scenarios verified across all 48 domains',
    `ph1561=${ph1561?.emulationFidelity}, ph1582Cam=${ph1582?.rpmOverride.camPhaseOffsetDeg}, ph1853=${ph1853?.faultsToInject[0]?.faultType}, ph1996Psu=${ph1996?.psuOverride?.isOutputEnabled}, ph2040=${ph2040?.focusPinId}, ph2041=${ph2041?.focusPinId}, ph2055V=${ph2055?.psuOverride?.voltageSetting}, ph2063V=${ph2063?.psuOverride?.voltageSetting}`
  );
}

function testTroubleScenarioLookupEngine() {
  const ph1853Exact = searchTroubleScenariosRanked({
    query: 'PH-1853',
    batch: 'BATCH_1',
  });
  assert(
    'Lookup Ranking: Exact PH-ID Ranks #1 Across All Batches',
    'Trouble Lookup Engine',
    ph1853Exact.length > 0 && ph1853Exact[0].phId === 'PH-1853',
    'PH-1853 ranked first even when batch preset is BATCH_1',
    `top=${ph1853Exact[0]?.phId}, total=${ph1853Exact.length}`
  );

  const dtcResults = searchTroubleScenariosRanked({ query: 'P0335' });
  assert(
    'Lookup Ranking: Exact DTC Prioritizes Matching Scenarios',
    'Trouble Lookup Engine',
    dtcResults.length > 0 && dtcResults[0].relatedDtcs.some(d => d.toUpperCase().includes('P0335')),
    'Top result explicitly includes P0335',
    `top=${dtcResults[0]?.phId} dtcs=${dtcResults[0]?.relatedDtcs.join(',')}`
  );

  const presetCounts = TROUBLE_TRIAGE_PRESETS.map(p => ({
    id: p.id,
    count: searchTroubleScenariosRanked({ triagePreset: p.id }).length,
  }));
  const allPresetsPopulated =
    presetCounts.length === 8 &&
    presetCounts[0].count === 2080 &&
    presetCounts.every(p => p.count > 0);
  assert(
    'Lookup Triage Presets: All 8 Presets Return Valid Non-Empty Subsets',
    'Trouble Lookup Engine',
    allPresetsPopulated,
    'ALL=2080 and all 7 specialized triage presets > 0',
    presetCounts.map(p => `${p.id}=${p.count}`).join(', ')
  );

  const pinnedFilter = searchTroubleScenariosRanked({
    onlyBookmarkedIds: new Set(['PH-001', 'PH-2041']),
  });
  assert(
    'Lookup Filter: Pinned Bookmarks Filter Isolates Selected Scenarios',
    'Trouble Lookup Engine',
    pinnedFilter.length === 2 &&
      pinnedFilter.some(s => s.phId === 'PH-001') &&
      pinnedFilter.some(s => s.phId === 'PH-2041'),
    'Exactly PH-001 & PH-2041 returned',
    `ids=${pinnedFilter.map(s => s.phId).join(',')}`
  );

  const sampleTarget = getIndexedScenarioByPhId('PH-025')!;
  const related = findRelatedTroubleScenarios(sampleTarget, 5);
  const dossierText = formatScenarioClipboardText(sampleTarget);
  const recentNext = recordRecentLookupId('PH-1853', []);
  const pinnedNext = togglePinnedLookupId('PH-025', []);
  const favStep1 = toggleFavoriteScenarioId('PH-025', []);
  const favStep2 = toggleFavoriteScenarioId('PH-1853', favStep1);
  const favStep3 = toggleFavoriteScenarioId('PH-025', favStep2);
  const savedTabResults = searchTroubleScenariosRanked({
    onlyBookmarkedIds: new Set(favStep2),
  });
  assert(
    'Lookup Related Discovery, Dossier Clipboard & Safe SSR Storage',
    'Trouble Lookup Engine',
    related.length > 0 &&
      related.length <= 5 &&
      !related.some(r => r.phId === 'PH-025') &&
      dossierText.includes('PH-025') &&
      dossierText.includes('CROSS_REFERENCED') &&
      Array.isArray(loadRecentLookupIds()) &&
      Array.isArray(loadPinnedLookupIds()) &&
      Array.isArray(loadFavoriteScenarioIds()) &&
      recentNext[0] === 'PH-1853' &&
      pinnedNext[0] === 'PH-025' &&
      favStep2.length === 2 &&
      favStep2[0] === 'PH-1853' &&
      favStep3.length === 1 &&
      favStep3[0] === 'PH-1853' &&
      savedTabResults.length === 2,
    '1–5 distinct related scenarios, complete dossier text, and Saved Scenarios favorite add/remove persistence',
    `related=${related.map(r => r.phId).join(',')}, favStep2=${favStep2.join(',')}, favStep3=${favStep3.join(',')}`
  );
}

// ==========================================
// 13. METALLIC AUTOMOTIVE DRAWER ICON SYSTEM (12 ARCHETYPES + 5 STATUS INDICATORS)
// ==========================================
function testLabDrawerIconSystem() {
  const required12Archetypes: LabDrawerIconName[] = [
    'cabinet',
    'slide-out',
    'trouble-drawer',
    'tray-stack',
    'expand',
    'split-drawer',
    'multi-comp',
    'modular',
    'active-drawer',
    'server-drawer',
    'archive',
    'mini-slider',
  ];
  const requiredStatusIndicators: LabDrawerIconName[] = [
    'status-ok',
    'status-warning',
    'status-fault',
    'status-active',
    'status-inactive',
  ];
  const allIcons = [...required12Archetypes, ...requiredStatusIndicators];
  const sizesMatch =
    LAB_DRAWER_ICON_SIZES.length === 3 &&
    LAB_DRAWER_ICON_SIZES[0] === 24 &&
    LAB_DRAWER_ICON_SIZES[1] === 32 &&
    LAB_DRAWER_ICON_SIZES[2] === 48;

  const allPathsAndNodesValid = allIcons.every((iconName) => {
    const assetPath = LAB_DRAWER_ICON_ASSET_PATHS[iconName];
    const label = LAB_DRAWER_ARCHETYPE_LABELS[iconName];
    const renderedNode = renderLabDrawerIconPaths(iconName, 'test-uid');
    return (
      typeof assetPath === 'string' &&
      assetPath === `/assets/icons/drawers/${iconName}.svg` &&
      typeof label === 'string' &&
      label.trim().length > 0 &&
      renderedNode !== null &&
      renderedNode !== undefined
    );
  });

  assert(
    'Metallic Automotive Drawer Icons: 12 Archetypes + 5 Status LEDs & 24/32/48 Tiers',
    'Drawer Icon System',
    sizesMatch && allPathsAndNodesValid && Object.keys(LAB_DRAWER_ICON_ASSET_PATHS).length === 17,
    '12 drawer archetypes + 5 status indicators with individual SVG assets and 24x24, 32x32, 48x48 tiers',
    `archetypes=${required12Archetypes.length}, status=${requiredStatusIndicators.length}, sizes=${LAB_DRAWER_ICON_SIZES.join('x')}, valid=${allPathsAndNodesValid}`
  );
}

// ==========================================
// 14. TROUBLE SCENARIOS LOOKUP & OFFLINE AI VOICE COACH INTEGRATION
// ==========================================
function testTroubleScenarioVoiceCoachIntegration() {
  const ph001 = getIndexedScenarioByPhId('PH-001')!;
  const misplacedProbeEval = evaluateScenarioVoiceCoach(ph001, 0, {
    powerSupply: {
      voltageSetting: 12.6,
      currentLimit: 5.0,
      isOutputEnabled: true,
      preset: '12V_BENCH',
    },
    multimeter: {
      mode: 'V_DC',
      redProbe: { attachedToPinId: 'ecu-pin-3', attachedLabel: 'KL30 (Pin 3)' },
      blackProbe: { attachedToPinId: 'ecu-pin-1', attachedLabel: 'GND_1 (Pin 1)' },
      isPowered: true,
      rangeAuto: true,
      holdValue: false,
    },
    multimeterDisplay: '12.60',
    multimeterUnit: 'V DC',
    nodeVoltages: { [ph001.focusPinId]: 0.0 },
    faults: [],
    activeScenarioId: null,
  });

  const matchedFaultEval = evaluateScenarioVoiceCoach(ph001, 1, {
    powerSupply: {
      voltageSetting: 12.6,
      currentLimit: 5.0,
      isOutputEnabled: true,
      preset: '12V_BENCH',
    },
    multimeter: {
      mode: 'V_DC',
      redProbe: { attachedToPinId: ph001.focusPinId, attachedLabel: ph001.focusPinLabel },
      blackProbe: { attachedToPinId: 'ecu-pin-1', attachedLabel: 'GND_1 (Pin 1)' },
      isPowered: true,
      rangeAuto: true,
      holdValue: false,
    },
    multimeterDisplay: '0.00',
    multimeterUnit: 'V DC',
    nodeVoltages: { [ph001.focusPinId]: 0.0 },
    faults: ph001.faultsToInject.map((f) => ({
      pinId: f.pinId,
      faultType: f.faultType,
      description: f.description,
      timestamp: Date.now(),
    })),
    activeScenarioId: ph001.id,
  });

  assert(
    'Voice Coach Step Evaluator: Detects Misplaced Probe & Confirms Emulated Fault Telemetry',
    'Trouble Voice Coach',
    misplacedProbeEval.verdict === 'PROBE_FOCUS_PIN' &&
      !misplacedProbeEval.isStepVerified &&
      matchedFaultEval.verdict === 'FAULT_CONFIRMED' &&
      matchedFaultEval.isStepVerified &&
      matchedFaultEval.stepIndex === 1 &&
      matchedFaultEval.spokenStepGuidance.includes('PH-001'),
    'PROBE_FOCUS_PIN when Red probe is off focusPinId; FAULT_CONFIRMED when probe is attached & fault active',
    `misplaced=${misplacedProbeEval.verdict}, matched=${matchedFaultEval.verdict}, step=${matchedFaultEval.stepIndex + 1}/${matchedFaultEval.totalSteps}`
  );

  const invoked: string[] = [];
  const mockVoiceActions: VoiceCommandActions = {
    setVoltage: () => {},
    resetLab: () => {},
    attachProbeToPin: () => {},
    setPowerSupplyOutput: () => {},
    switchTab: () => {},
    openTroubleLookup: (q) => {
      invoked.push(`lookup:${q || 'ALL'}`);
      return {
        actionDescription: `Lookup ${q || 'ALL'}`,
        spokenReply: `Opened lookup for ${q || 'ALL'}.`,
      };
    },
    emulateTroubleScenario: (id) => {
      invoked.push(`emulate:${id || 'CURRENT'}`);
      return {
        actionDescription: `Emulate ${id || 'CURRENT'}`,
        spokenReply: `Emulating ${id || 'CURRENT'}.`,
      };
    },
    nextScenarioStep: () => {
      invoked.push('next');
      return { actionDescription: 'Next step', spokenReply: 'Next step.' };
    },
    prevScenarioStep: () => {
      invoked.push('prev');
      return { actionDescription: 'Prev step', spokenReply: 'Prev step.' };
    },
    repeatScenarioStep: (num) => {
      invoked.push(`repeat:${num ?? 'CURRENT'}`);
      return { actionDescription: 'Repeat step', spokenReply: 'Repeat step.' };
    },
    verifyScenarioStep: () => {
      invoked.push('verify');
      return { actionDescription: 'Verify step', spokenReply: 'Verify step.' };
    },
    completeScenarioStep: (num) => {
      invoked.push(`complete:${num ?? 'CURRENT'}`);
      return {
        actionDescription: `Completed step ${num ?? 'current'}`,
        spokenReply: `Step ${num ?? 1} marked complete.`,
        scenarioPhId: 'PH-001',
        scenarioStepNumber: num ?? 1,
        guidanceKind: 'STEP_COMPLETED',
        alreadySpoken: true,
      };
    },
    toggleWorkflowStep: (id, checked) => {
      invoked.push(`workflow:${id}:${checked}`);
    },
    probeScenarioFocusPin: () => {
      invoked.push('probeFocus');
      return { actionDescription: 'Probe focus', spokenReply: 'Probe focus.' };
    },
  };

  const c1 = parseAndExecuteVoiceCommand('Look up PH-1853', DEFAULT_ECU_PINS, mockVoiceActions);
  const c2 = parseAndExecuteVoiceCommand('Emulate scenario PH-001', DEFAULT_ECU_PINS, mockVoiceActions);
  const c3 = parseAndExecuteVoiceCommand('Next step', DEFAULT_ECU_PINS, mockVoiceActions);
  const c4 = parseAndExecuteVoiceCommand('Previous step', DEFAULT_ECU_PINS, mockVoiceActions);
  const c5 = parseAndExecuteVoiceCommand('Verify my probe', DEFAULT_ECU_PINS, mockVoiceActions);
  const c6 = parseAndExecuteVoiceCommand('Probe focus pin', DEFAULT_ECU_PINS, mockVoiceActions);
  const c7 = parseAndExecuteVoiceCommand('Mark current step complete', DEFAULT_ECU_PINS, mockVoiceActions);
  const c8 = parseAndExecuteVoiceCommand('Complete scenario step 2', DEFAULT_ECU_PINS, mockVoiceActions);
  const c9 = parseAndExecuteVoiceCommand('Check off step 1', DEFAULT_ECU_PINS, mockVoiceActions);

  assert(
    'Voice Command Parser: Handles Scenario Lookup, Emulation, Step Navigation, Step Completion & Workflow Isolation',
    'Trouble Voice Coach',
    c1.matched &&
      c2.matched &&
      c3.matched &&
      c4.matched &&
      c5.matched &&
      c6.matched &&
      c7.matched &&
      c7.guidanceKind === 'STEP_COMPLETED' &&
      c7.alreadySpoken === true &&
      c8.matched &&
      c8.scenarioStepNumber === 2 &&
      c9.matched &&
      invoked.includes('lookup:ph-1853') &&
      invoked.includes('emulate:PH-001') &&
      invoked.includes('next') &&
      invoked.includes('prev') &&
      invoked.includes('verify') &&
      invoked.includes('probeFocus') &&
      invoked.includes('complete:CURRENT') &&
      invoked.includes('complete:2') &&
      invoked.some((entry) => entry.startsWith('workflow:')),
    'All scenario commands including step completion match without breaking Pre-Bench Workflow check-off',
    `invoked=[${invoked.join(', ')}]`
  );

  // 14.3 Real-time step completion confirmation & active-scenario voice transcript filtering
  offlineVoiceAssistant.clearCommandHistory();
  offlineVoiceAssistant.addCommandLog({
    source: 'QUICK_CHIP',
    rawTranscript: 'read step 1',
    normalizedTranscript: 'read step 1',
    status: 'EXECUTED',
    category: 'DIAGNOSTIC',
    actionDescription: 'PH-001 Step 1/3',
    spokenReply: 'PH-001. Step 1 of 3: Check VREF voltage at sensor connector.',
    scenarioPhId: 'PH-001',
    scenarioStepNumber: 1,
    guidanceKind: 'STEP_GUIDANCE',
  });
  offlineVoiceAssistant.addCommandLog({
    source: 'QUICK_CHIP',
    rawTranscript: 'read step 1',
    normalizedTranscript: 'read step 1',
    status: 'EXECUTED',
    category: 'DIAGNOSTIC',
    actionDescription: 'PH-1853 Step 1/3',
    spokenReply: 'PH-1853. Step 1 of 3: Inspect CAN_H voltage.',
    scenarioPhId: 'PH-1853',
    scenarioStepNumber: 1,
    guidanceKind: 'STEP_GUIDANCE',
  });

  const chimeCountBefore = offlineVoiceAssistant.getState().stepCompleteChimeCount;
  const directChimeAt = offlineVoiceAssistant.playStepCompleteChime(false);
  const step1Confirm = offlineVoiceAssistant.confirmStepCompleted({
    phId: 'PH-001',
    stepNumber: 1,
    totalSteps: 3,
    stepText: '1. Check 5V VREF at sensor connector',
    allCompleted: false,
    nextStepNumber: 2,
    nextStepText: '2. Measure continuity to KL31 GND',
    dmmReadingText: '0.00 V DC',
  });
  const voiceStateAfterChime = offlineVoiceAssistant.getState();
  const finalSpeech = buildStepCompletionSpeech({
    phId: 'PH-001',
    stepNumber: 3,
    totalSteps: 3,
    stepText: '3. Verify 5V recovery after repair',
    allCompleted: true,
    dmmReadingText: '5.00 V DC',
  });

  const ph001Transcript = filterVoiceTranscriptForScenario(
    offlineVoiceAssistant.getCommandHistory(),
    'PH-001'
  );
  const ph1853Transcript = filterVoiceTranscriptForScenario(
    offlineVoiceAssistant.getCommandHistory(),
    'PH-1853'
  );
  const formattedTranscript = formatScenarioTranscriptText('PH-001', 'Test Case', ph001Transcript);

  offlineVoiceAssistant.clearScenarioHistory('PH-001');
  const ph001AfterClear = filterVoiceTranscriptForScenario(
    offlineVoiceAssistant.getCommandHistory(),
    'PH-001'
  );
  const ph1853AfterClear = filterVoiceTranscriptForScenario(
    offlineVoiceAssistant.getCommandHistory(),
    'PH-1853'
  );
  offlineVoiceAssistant.clearCommandHistory();

  assert(
    'Offline Voice Assistant: Step Complete Chime, Real-Time Confirmation & Active Scenario Transcript Isolation',
    'Trouble Voice Coach',
    directChimeAt > 0 &&
      step1Confirm.chimePlayedAt >= directChimeAt &&
      voiceStateAfterChime.stepCompleteChimeCount === chimeCountBefore + 2 &&
      voiceStateAfterChime.lastStepCompleteChimeAt === step1Confirm.chimePlayedAt &&
      step1Confirm.logEntry !== null &&
      step1Confirm.logEntry.guidanceKind === 'STEP_COMPLETED' &&
      step1Confirm.logEntry.scenarioPhId === 'PH-001' &&
      step1Confirm.spokenReply.includes('Step 1 of 3 marked complete for PH-001') &&
      step1Confirm.spokenReply.includes('Next is step 2') &&
      finalSpeech.includes('All 3 diagnostic steps are now complete') &&
      ph001Transcript.length === 2 &&
      ph001Transcript[0].guidanceKind === 'STEP_GUIDANCE' &&
      ph001Transcript[1].guidanceKind === 'STEP_COMPLETED' &&
      ph1853Transcript.length === 1 &&
      formattedTranscript.includes('Voice Guidance Transcript') &&
      formattedTranscript.includes('STEP_COMPLETED') &&
      ph001AfterClear.length === 0 &&
      ph1853AfterClear.length === 1,
    'playStepCompleteChime & confirmStepCompleted trigger chime state updates, log STEP_COMPLETED, and isolate PH-001 transcript',
    `chimeCountDelta=${voiceStateAfterChime.stepCompleteChimeCount - chimeCountBefore}, ph001Len=${ph001Transcript.length}, order=[${ph001Transcript.map((e) => e.guidanceKind).join('->')}], ph1853AfterClear=${ph1853AfterClear.length}`
  );

  // 14.4 Diagnostic step progress ratio calculation & Previous/Next manual step cycling bounds
  const p0 = computeScenarioStepProgress([], 3);
  const pMid = computeScenarioStepProgress([0, 0, 2, 99, -1], 3);
  const pFull = computeScenarioStepProgress([0, 1, 2], 3);
  const prevAtStart = stepScenarioIndex(0, -1, 3);
  const nextFromStart = stepScenarioIndex(0, 1, 3);
  const prevFromMid = stepScenarioIndex(1, -1, 3);
  const nextAtEnd = stepScenarioIndex(2, 1, 3);

  assert(
    'Diagnostic Step Progress Ratio & Manual Previous/Next Step Cycling Bounds',
    'Trouble Voice Coach',
    p0.completedCount === 0 &&
      p0.percent === 0 &&
      p0.statusLabel === 'NOT STARTED' &&
      pMid.completedCount === 2 &&
      pMid.percent === 67 &&
      pMid.statusLabel === 'IN PROGRESS' &&
      pFull.completedCount === 3 &&
      pFull.percent === 100 &&
      pFull.isAllComplete &&
      pFull.statusLabel === 'ALL COMPLETE' &&
      prevAtStart === 0 &&
      nextFromStart === 1 &&
      prevFromMid === 0 &&
      nextAtEnd === 2,
    'Bounded ratio (0%->67%->100%) ignores duplicates/out-of-range indices and Previous/Next clamps to [0, totalSteps-1]',
    `p0=${p0.percent}%, pMid=${pMid.completedCount}/${pMid.totalSteps}(${pMid.percent}%), pFull=${pFull.percent}%, nav=[${prevAtStart},${nextFromStart},${prevFromMid},${nextAtEnd}]`
  );

  // 14.5 Auto-Play next-step resolution & 1-second completion chime delay contract
  const autoNextSeq1 = resolveAutoPlayNextStepIndex(0, [0], 3);
  const autoNextSeq2 = resolveAutoPlayNextStepIndex(1, [0, 1], 3);
  const autoNextSkipDone = resolveAutoPlayNextStepIndex(0, [0, 1], 3);
  const autoNextWrapPending = resolveAutoPlayNextStepIndex(2, [1, 2], 3);
  const autoNextAllComplete = resolveAutoPlayNextStepIndex(2, [0, 1, 2], 3);
  const autoNextSingleStep = resolveAutoPlayNextStepIndex(0, [0], 1);

  assert(
    'Auto-Play Diagnostic Step Advance: 1-Second Chime Delay & Next Incomplete Step Resolution',
    'Trouble Voice Coach',
    AUTO_PLAY_STEP_DELAY_MS === 1000 &&
      autoNextSeq1 === 1 &&
      autoNextSeq2 === 2 &&
      autoNextSkipDone === 2 &&
      autoNextWrapPending === 0 &&
      autoNextAllComplete === null &&
      autoNextSingleStep === null,
    '1000ms delay, sequential 0->1->2, skips completed steps, wraps to remaining pending step, returns null when all done',
    `delayMs=${AUTO_PLAY_STEP_DELAY_MS}, seq=[${autoNextSeq1},${autoNextSeq2}], skip=${autoNextSkipDone}, wrap=${autoNextWrapPending}, done=${autoNextAllComplete}, single=${autoNextSingleStep}`
  );
}

function testBulkPinContinuityCheck() {
  const psuOff: PowerSupplyState = {
    voltageSetting: 12.6,
    currentLimit: 5.0,
    isOutputEnabled: false,
    preset: '12V_BENCH',
  };

  // 15.1 Nominal 16-pin continuity check passes cleanly
  const nominalReport = evaluateBulkPinContinuity(
    psuOff,
    DEFAULT_ECU_PINS,
    [],
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS
  );
  assert(
    'Bulk Continuity Check: All 16 default ECU pins pass CLOSED_CONTINUITY on healthy bench',
    'Batch Continuity',
    nominalReport.checkedCount === 16 &&
      nominalReport.passedCount === 16 &&
      nominalReport.faultCount === 0 &&
      !nominalReport.isPowerLiveWarning &&
      nominalReport.results.every((r) => r.status === 'CLOSED_CONTINUITY'),
    '16/16 CLOSED_CONTINUITY, 0 faults, no live PSU warning',
    `checked=${nominalReport.checkedCount}, passed=${nominalReport.passedCount}, faults=${nominalReport.faultCount}`
  );

  // 15.2 Pin sub-selection only evaluates targeted pins
  const subsetReport = evaluateBulkPinContinuity(
    psuOff,
    DEFAULT_ECU_PINS,
    [],
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    ['ecu-pin-1', 'ecu-pin-7']
  );
  const skippedCount = subsetReport.results.filter((r) => r.status === 'SKIPPED').length;
  assert(
    'Bulk Continuity Check: Sub-selection evaluates only selected pins and skips remaining pins',
    'Batch Continuity',
    subsetReport.checkedCount === 2 &&
      subsetReport.passedCount === 2 &&
      skippedCount === 14,
    'checkedCount=2, passedCount=2, skippedCount=14',
    `checked=${subsetReport.checkedCount}, passed=${subsetReport.passedCount}, skipped=${skippedCount}`
  );

  // 15.3 Cut wires trigger OPEN_CIRCUIT on exact affected pins (including multi-wire VREF_5V)
  const wiresWithCuts = DEFAULT_WIRES.map((w) =>
    w.id === 'wire-2' || w.id === 'wire-4' ? { ...w, isCut: true } : w
  );
  const cutReport = evaluateBulkPinContinuity(
    psuOff,
    DEFAULT_ECU_PINS,
    [],
    wiresWithCuts,
    DEFAULT_BENCH_COMPONENTS
  );
  const tpsRes = cutReport.results.find((r) => r.pinId === 'ecu-pin-7');
  const vrefRes = cutReport.results.find((r) => r.pinId === 'ecu-pin-5');
  assert(
    'Bulk Continuity Check: Cut harness wires (wire-2, wire-4) trigger OPEN_CIRCUIT on TPS_SIG and VREF_5V',
    'Batch Continuity',
    tpsRes?.status === 'OPEN_CIRCUIT' &&
      vrefRes?.status === 'OPEN_CIRCUIT' &&
      cutReport.faultCount >= 2,
    'TPS_SIG=OPEN_CIRCUIT, VREF_5V=OPEN_CIRCUIT',
    `TPS=${tpsRes?.status}, VREF=${vrefRes?.status}, faults=${cutReport.faultCount}`
  );

  // 15.4 High resistance & rail short faults + live PSU safety advisory
  const highResFaults: InjectedFault[] = [
    {
      pinId: 'ecu-pin-3',
      faultType: 'HIGH_RESISTANCE_250R',
      description: 'Corroded KL30 fuse',
      timestamp: Date.now(),
    },
  ];
  const highResReport = evaluateBulkPinContinuity(
    { ...psuOff, isOutputEnabled: true },
    DEFAULT_ECU_PINS,
    highResFaults,
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS
  );
  const kl30Res = highResReport.results.find((r) => r.pinId === 'ecu-pin-3');

  const shortFaults: InjectedFault[] = [
    {
      pinId: 'ecu-pin-7',
      faultType: 'SHORT_TO_GND',
      description: 'TPS pinched to chassis',
      timestamp: Date.now(),
    },
    {
      pinId: 'ecu-pin-1',
      faultType: 'SHORT_TO_VBAT',
      description: 'KL31 shorted to +12V',
      timestamp: Date.now(),
    },
  ];
  const shortReport = evaluateBulkPinContinuity(
    { ...psuOff, isOutputEnabled: true },
    DEFAULT_ECU_PINS,
    shortFaults,
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS
  );
  const tpsShortRes = shortReport.results.find((r) => r.pinId === 'ecu-pin-7');
  const kl31ShortRes = shortReport.results.find((r) => r.pinId === 'ecu-pin-1');
  assert(
    'Bulk Continuity Check: Detects HIGH_RESISTANCE_250R, SHORT_TO_GND, SHORT_TO_VBAT, and warns when PSU is live',
    'Batch Continuity',
    highResReport.isPowerLiveWarning &&
      kl30Res?.status === 'HIGH_RESISTANCE' &&
      (kl30Res?.measuredOhms ?? 0) > 100 &&
      (kl30Res?.measuredOhms ?? 0) < 200 &&
      tpsShortRes?.status === 'SHORT_FAULT' &&
      kl31ShortRes?.status === 'SHORT_FAULT',
    'liveWarning=true, KL30=HIGH_RESISTANCE (100-200Ω Thevenin parallel), TPS=SHORT_FAULT, KL31=SHORT_FAULT',
    `live=${highResReport.isPowerLiveWarning}, KL30=${kl30Res?.status}(${kl30Res?.measuredOhms.toFixed(1)}Ω), TPS=${tpsShortRes?.status}, KL31=${kl31ShortRes?.status}`
  );
}

// ==========================================
// 16. CUSTOM FAULT BUILDER SEQUENCES & MNA INTEGRATION
// ==========================================
function testCustomFaultBuilderSequences() {
  resetFaultSequenceStoreForTests();

  const psuOn: PowerSupplyState = {
    voltageSetting: 12.6,
    currentLimit: 10.0,
    isOutputEnabled: true,
    preset: '12V_BENCH',
  };
  const dmmDc: MultimeterState = {
    mode: 'V_DC',
    redProbe: { attachedToPinId: 'ecu-pin-7', attachedLabel: 'TPS_SIG' },
    blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'CHASSIS_GND' },
    isPowered: true,
    rangeAuto: true,
    holdValue: false,
  };

  // Baseline nominal TPS voltage for comparison
  const nominalSim = solveCircuit(
    psuOn,
    DEFAULT_ECU_PINS,
    [],
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    dmmDc,
    { ckpSignalLost: false }
  );
  const nominalTpsV = nominalSim.nodeVoltages['ecu-pin-7'] ?? 0;

  // 16.1 Built-in 3-stage sequence: Intermittent -> Resistance Buildup -> Hard Ground
  const tpsSequence = BUILT_IN_FAULT_SEQUENCES[0];

  // Stage 1 (0..6000ms): ON window (<700ms) -> OPEN_CIRCUIT on Pin 7
  const frameStage1On = evaluateFaultSequenceFrame(tpsSequence, 200, DEFAULT_ECU_PINS);
  const simStage1On = solveCircuit(
    psuOn,
    DEFAULT_ECU_PINS,
    frameStage1On.injectedFaults,
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    dmmDc,
    { ckpSignalLost: frameStage1On.ckpSignalLost }
  );
  // Stage 1 OFF recovery window (700..1600ms) -> clean signal
  const frameStage1Off = evaluateFaultSequenceFrame(tpsSequence, 900, DEFAULT_ECU_PINS);
  const simStage1Off = solveCircuit(
    psuOn,
    DEFAULT_ECU_PINS,
    frameStage1Off.injectedFaults,
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    dmmDc,
    { ckpSignalLost: frameStage1Off.ckpSignalLost }
  );

  assert(
    'Fault Builder: Stage 1 intermittent cycles ON dropout and OFF nominal recovery in MNA solver',
    'Fault Builder',
    frameStage1On.activeStepIndex === 0 &&
      frameStage1On.intermittentEngaged &&
      frameStage1On.injectedFaults[0]?.faultType === 'OPEN_CIRCUIT' &&
      (simStage1On.nodeVoltages['ecu-pin-7'] ?? 5) < 0.25 &&
      !frameStage1Off.intermittentEngaged &&
      frameStage1Off.injectedFaults.length === 0 &&
      Math.abs((simStage1Off.nodeVoltages['ecu-pin-7'] ?? 0) - nominalTpsV) < 0.05,
    `ON=OPEN_CIRCUIT (<0.25V), OFF=nominal (~${nominalTpsV.toFixed(2)}V)`,
    `ON=${frameStage1On.injectedFaults[0]?.faultType} (${(simStage1On.nodeVoltages['ecu-pin-7'] ?? 0).toFixed(2)}V), OFF=${frameStage1Off.injectedFaults.length} faults (${(simStage1Off.nodeVoltages['ecu-pin-7'] ?? 0).toFixed(2)}V)`
  );

  // Stage 2 (6000..14000ms): Linear resistance buildup 25Ω -> 450Ω; midpoint at 10000ms = 237.5Ω
  const frameStage2Mid = evaluateFaultSequenceFrame(tpsSequence, 10_000, DEFAULT_ECU_PINS);
  const customOhmsMid = frameStage2Mid.injectedFaults[0]?.customSeriesOhms ?? 0;
  const solverOhmsMid = FaultManager.getSeriesFaultOhms(frameStage2Mid.injectedFaults, 'ecu-pin-7');
  const simStage2Mid = solveCircuit(
    psuOn,
    DEFAULT_ECU_PINS,
    frameStage2Mid.injectedFaults,
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    dmmDc,
    { ckpSignalLost: frameStage2Mid.ckpSignalLost }
  );

  assertCloseTo(
    'Fault Builder: Stage 2 resistance buildup interpolates to 237.5Ω at midpoint and flows into FaultManager',
    'Fault Builder',
    solverOhmsMid,
    237.5,
    1.0
  );
  assert(
    'Fault Builder: Stage 2 customSeriesOhms causes measurable MNA voltage drop',
    'Fault Builder',
    frameStage2Mid.activeStepIndex === 1 &&
      customOhmsMid > 200 &&
      customOhmsMid < 275 &&
      (simStage2Mid.nodeVoltages['ecu-pin-7'] ?? nominalTpsV) < nominalTpsV,
    `activeStepIndex=1, customSeriesOhms in (200, 275), Pin7 < ${nominalTpsV.toFixed(4)}V`,
    `step=${frameStage2Mid.activeStepIndex}, customSeriesOhms=${customOhmsMid}, Pin7=${(simStage2Mid.nodeVoltages['ecu-pin-7'] ?? 0).toFixed(4)}V`
  );

  // Stage 3 (14000..20000ms): Hard short to ground -> <0.05V & P0122
  const frameStage3 = evaluateFaultSequenceFrame(tpsSequence, 15_000, DEFAULT_ECU_PINS);
  const simStage3 = solveCircuit(
    psuOn,
    DEFAULT_ECU_PINS,
    frameStage3.injectedFaults,
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    dmmDc,
    { ckpSignalLost: frameStage3.ckpSignalLost }
  );
  assert(
    'Fault Builder: Stage 3 hard ground clamps TPS_SIG near 0V and raises P0122',
    'Fault Builder',
    frameStage3.activeStepIndex === 2 &&
      frameStage3.injectedFaults[0]?.faultType === 'SHORT_TO_GND' &&
      (simStage3.nodeVoltages['ecu-pin-7'] ?? 5) < 0.05 &&
      simStage3.activeDTCs.some((dtc) => dtc.code === 'P0122'),
    'SHORT_TO_GND, TPS<0.05V, DTC P0122',
    `type=${frameStage3.injectedFaults[0]?.faultType}, V=${(simStage3.nodeVoltages['ecu-pin-7'] ?? 0).toFixed(3)}V, DTCs=${simStage3.activeDTCs.map((d) => d.code).join(',')}`
  );

  // 16.2 Multi-fault + CUT_WIRE + CKP_DROPOUT + Save/Load/Import/Export/Delete
  const customSeq: CustomFaultSequence = {
    id: 'custom-test-seq-1',
    title: 'Dual Harness Cut & CKP Dropout Drill',
    description: 'Tests simultaneous wire cut, CKP crank loss, and TPS resistance buildup.',
    difficulty: 'MASTER',
    loopPlayback: false,
    steps: [
      {
        id: 'cstep-1',
        name: 'Combined Multi-Fault',
        durationSec: 5,
        notes: 'Cut wire-2, kill CKP, and inject +120Ω on Pin 7',
        items: [
          {
            id: 'citem-cut',
            pinId: 'ecu-pin-7',
            wireId: 'wire-2',
            mode: 'CUT_WIRE',
            label: 'Cut TPS Signal Wire',
          },
          {
            id: 'citem-ckp',
            pinId: 'ecu-pin-11',
            mode: 'CKP_DROPOUT',
            label: 'CKP Sensor Dropout',
          },
          {
            id: 'citem-res',
            pinId: 'ecu-pin-7',
            mode: 'RESISTANCE_BUILDUP',
            label: 'TPS Terminal Resistance',
            startOhms: 120,
            endOhms: 120,
          },
        ],
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const multiFrame = evaluateFaultSequenceFrame(customSeq, 1000, DEFAULT_ECU_PINS);
  const completedFrame = evaluateFaultSequenceFrame(customSeq, 6000, DEFAULT_ECU_PINS);
  assert(
    'Fault Builder: Multi-fault stage activates CUT_WIRE, CKP_DROPOUT, and resistance simultaneously; non-loop stops cleanly',
    'Fault Builder',
    multiFrame.cutWireIds.includes('wire-2') &&
      multiFrame.ckpSignalLost &&
      multiFrame.injectedFaults[0]?.customSeriesOhms === 120 &&
      completedFrame.completedNonLoop,
    'cutWire=wire-2, ckpSignalLost=true, ohms=120, completedNonLoop=true',
    `wires=${multiFrame.cutWireIds.join(',')}, ckp=${multiFrame.ckpSignalLost}, ohms=${multiFrame.injectedFaults[0]?.customSeriesOhms}, done=${completedFrame.completedNonLoop}`
  );

  const { saved, allSequences } = saveCustomFaultSequence(customSeq);
  const json = exportFaultSequenceJson(saved);
  const { imported } = importFaultSequenceJson(json);

  let invalidRejected = false;
  try {
    importFaultSequenceJson('{"invalid": true}');
  } catch {
    invalidRejected = true;
  }

  const afterDelete = deleteCustomFaultSequence(imported.id);
  const reloaded = loadSavedFaultSequences();
  assert(
    'Fault Builder: Save, JSON export/import round-trip, invalid JSON guard, and delete persist accurately',
    'Fault Builder',
    allSequences.some((s) => s.id === saved.id) &&
      imported.title === saved.title &&
      imported.id !== saved.id &&
      invalidRejected &&
      !afterDelete.some((s) => s.id === imported.id) &&
      reloaded.some((s) => s.id === saved.id),
    'saved present, imported cloned, invalid JSON rejected, deleted removed',
    `savedFound=${allSequences.some((s) => s.id === saved.id)}, invalidRejected=${invalidRejected}, reloadedLen=${reloaded.length}`
  );

  // 16.3 Diagnostic Reasoning Check
  const correctCheck = evaluateDiagnosticReasoning(
    tpsSequence,
    'ecu-pin-7',
    'MULTI_FAULT',
    DEFAULT_ECU_PINS
  );
  const wrongCheck = evaluateDiagnosticReasoning(
    tpsSequence,
    'ecu-pin-13',
    'CKP_DROPOUT',
    DEFAULT_ECU_PINS
  );
  assert(
    'Fault Builder: Diagnostic Reasoning Check validates matching pin/mechanism and rejects incorrect guesses with evidence',
    'Fault Builder',
    correctCheck.overallCorrect &&
      !wrongCheck.overallCorrect &&
      !wrongCheck.pinMatched &&
      !wrongCheck.mechanismMatched &&
      wrongCheck.expectedPinLabels.some((lbl) => lbl.includes('TPS_SIG')),
    'correct=true, wrong=false with TPS_SIG evidence',
    `correct=${correctCheck.overallCorrect}, wrong=${wrongCheck.overallCorrect}, pins=${wrongCheck.expectedPinLabels.join(',')}`
  );

  // 16.4 Sub-150ms Intermittent Chatter & Exact Edge Scheduling (computeNextFaultSequenceEdgeMs)
  const microSeq = BUILT_IN_FAULT_SEQUENCES.find(
    (s) => s.id === 'preset-tps-sub150-chatter-glitch'
  );
  assert(
    'Fault Builder: Built-in 25ms TPS micro-chatter preset exists and MIN_PULSE_WIDTH_MS is 10ms',
    'Fault Builder',
    Boolean(microSeq) && MIN_PULSE_WIDTH_MS === 10,
    'preset exists & MIN_PULSE_WIDTH_MS === 10',
    `preset=${Boolean(microSeq)}, MIN_PULSE_WIDTH_MS=${MIN_PULSE_WIDTH_MS}`
  );

  if (microSeq) {
    const microOn = evaluateFaultSequenceFrame(microSeq, 15, DEFAULT_ECU_PINS);
    const microOff = evaluateFaultSequenceFrame(microSeq, 30, DEFAULT_ECU_PINS);
    const microStage2On = evaluateFaultSequenceFrame(microSeq, 5020, DEFAULT_ECU_PINS);

    const simMicroOn = solveCircuit(
      psuOn,
      DEFAULT_ECU_PINS,
      microOn.injectedFaults,
      DEFAULT_WIRES,
      DEFAULT_BENCH_COMPONENTS,
      dmmDc,
      { ckpSignalLost: microOn.ckpSignalLost }
    );
    const simMicroOff = solveCircuit(
      psuOn,
      DEFAULT_ECU_PINS,
      microOff.injectedFaults,
      DEFAULT_WIRES,
      DEFAULT_BENCH_COMPONENTS,
      dmmDc,
      { ckpSignalLost: microOff.ckpSignalLost }
    );

    assert(
      'Fault Builder: 25ms ON / 75ms OFF sub-150ms glitch drops TPS in MNA during 15ms ON window and recovers cleanly at 30ms',
      'Fault Builder',
      microOn.intermittentEngaged &&
        !microOff.intermittentEngaged &&
        (simMicroOn.nodeVoltages['ecu-pin-7'] ?? 5) < 0.25 &&
        Math.abs((simMicroOff.nodeVoltages['ecu-pin-7'] ?? 0) - nominalTpsV) < 0.05 &&
        microStage2On.ckpSignalLost &&
        microStage2On.intermittentEngaged,
      '15ms ON (<0.25V), 30ms OFF (nominal), 5020ms Stage 2 CKP+TPS active',
      `15ms=${(simMicroOn.nodeVoltages['ecu-pin-7'] ?? 0).toFixed(2)}V, 30ms=${(simMicroOff.nodeVoltages['ecu-pin-7'] ?? 0).toFixed(2)}V, stg2Ckp=${microStage2On.ckpSignalLost}`
    );

    const edgeAt0 = computeNextFaultSequenceEdgeMs(microSeq, 0);
    const edgeAt25 = computeNextFaultSequenceEdgeMs(microSeq, 25);
    const edgeBeforeStage2 = computeNextFaultSequenceEdgeMs(microSeq, 4980);
    const rampEdge = computeNextFaultSequenceEdgeMs(tpsSequence, 6000, 50);
    const completedEdge = computeNextFaultSequenceEdgeMs(customSeq, 5000);

    assert(
      'Fault Builder: computeNextFaultSequenceEdgeMs resolves exact 25ms/75ms pulse edges, stage boundary, ramp tick, and non-loop end',
      'Fault Builder',
      edgeAt0 === 25 &&
        edgeAt25 === 75 &&
        edgeBeforeStage2 === 20 &&
        rampEdge === 50 &&
        completedEdge === null,
      'edge0=25, edge25=75, edge4980=20, ramp=50, nonLoopEnd=null',
      `edge0=${edgeAt0}, edge25=${edgeAt25}, edge4980=${edgeBeforeStage2}, ramp=${rampEdge}, end=${completedEdge}`
    );
  }

  const parsedPure = parseImportedFaultSequenceJson(json);
  const merged = mergeFaultSequencesWithBuiltIns([parsedPure]);
  assert(
    'Fault Builder: parseImportedFaultSequenceJson + mergeFaultSequencesWithBuiltIns keeps custom drills first ahead of all built-in starters',
    'Fault Builder',
    merged[0]?.id === parsedPure.id &&
      merged.length === BUILT_IN_FAULT_SEQUENCES.length + 1 &&
      !parsedPure.isBuiltInPreset,
    `custom first, total=${BUILT_IN_FAULT_SEQUENCES.length + 1}`,
    `first=${merged[0]?.id}, total=${merged.length}`
  );

  resetFaultSequenceStoreForTests();
}

// ==========================================
// RUNNER & REPORTING
// ==========================================
export function runAllTests(): { passed: number; failed: number; total: number; results: TestResult[] } {
  testResults.length = 0;

  try {
    testMatrixSolver();
    testOhmsLawAndNetwork();
    testAutomotiveModels();
    testFaultInjection();
    testMultimeterModes();
    testOscilloscopeSignals();
    testBinaryStateMonitor();
    testNonLinearAuxiliaryAndPsuDecoupling();
    testCircuitAudioAnomalyMonitor();
    testBenchTroubleScenarios();
    testPh520TroubleScenariosDataset();
    testTroubleScenarioLookupEngine();
    testLabDrawerIconSystem();
    testTroubleScenarioVoiceCoachIntegration();
    testBulkPinContinuityCheck();
    testCustomFaultBuilderSequences();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    testResults.push({
      name: 'Test Execution Exception',
      category: 'Runner',
      passed: false,
      expected: 'Clean Execution',
      actual: msg,
    });
  }

  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;

  console.log('====================================================');
  console.log(`AUTOTECH LAB TEST SUITE RESULTS: ${passed}/${testResults.length} PASSED`);
  console.log('====================================================');
  testResults.forEach(r => {
    const symbol = r.passed ? '✓ [PASS]' : '✗ [FAIL]';
    console.log(`${symbol} [${r.category}] ${r.name}`);
    if (!r.passed) {
      console.log(`    Expected: ${r.expected}`);
      console.log(`    Actual:   ${r.actual}`);
    }
  });

  return { passed, failed, total: testResults.length, results: testResults };
}

// Allow direct execution via tsx
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('circuitEngine.test.ts')) {
  const result = runAllTests();
  process.exit(result.failed > 0 ? 1 : 0);
}
