/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_BENCH_COMPONENTS,
  DEFAULT_ECU_PINS,
  DEFAULT_WIRES,
  solveCircuit,
} from '../ecu/BenchCircuitSolver';
import { AutomotiveModels } from '../components/AutomotiveModels';
import {
  DEFAULT_GAUGE_MONITOR_STATE,
  DEFAULT_PEAK_HOLD,
  forceSafeStoppedGaugeState,
  GaugeMonitorState,
  sanitizeGaugeMonitorState,
} from '../telemetry/telemetryTypes';
import {
  calculateCalibratedMapVoltage,
  inferEctFromVoltage,
  inferMapFromVoltage,
} from '../telemetry/sensorTransferCurves';
import { calculateEstimatedMaf } from '../telemetry/mafEstimator';
import { calculateSimulatedSpeedKmh } from '../telemetry/vehicleSpeedModel';
import {
  computeUpdatedPeakHold,
  evaluateGaugeTelemetry,
} from '../telemetry/gaugeTelemetryEngine';
import {
  buildBenchSessionUpdatePayload,
  mergeCachedBenchSessions,
  SavedBenchSession,
} from '../../services/benchStorageService';
import {
  buildDriveBenchSnapshot,
  parseDriveBenchSnapshot,
} from '../../services/googleDriveService';
import type { BenchComponent, InjectedFault, MultimeterState, PowerSupplyState } from '../../types/ecu';
import type { RpmEmulatorState } from '../../utils/vehicleEcuRegistry';
import {
  buildClockwiseArcPath,
  computeArcDashOffset,
  computeGaugeNeedleAngleDeg,
  computeNormalizedGaugeRatio,
} from '../../components/gauges/useDampedGaugeMotion';

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(err);
  }
}

const DEFAULT_PSU_ON: PowerSupplyState = {
  voltageSetting: 12.6,
  currentLimit: 5.0,
  isOutputEnabled: true,
  preset: '12V_BENCH',
};

const DEFAULT_PSU_OFF: PowerSupplyState = {
  ...DEFAULT_PSU_ON,
  isOutputEnabled: false,
};

const DEFAULT_DMM: MultimeterState = {
  mode: 'V_DC',
  redProbe: { attachedToPinId: 'ecu-pin-7', attachedLabel: 'TPS_SIG' },
  blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'Chassis GND' },
  isPowered: true,
  rangeAuto: true,
  holdValue: false,
};

const DEFAULT_RPM: RpmEmulatorState = {
  isActive: true,
  rpm: 2500,
  soundEnabled: true,
  camPhaseOffsetDeg: 0,
  ckpSignalLost: false,
};

function withComponentUpdate(
  components: BenchComponent[],
  compId: string,
  updates: Record<string, number | boolean | string>
): BenchComponent[] {
  return components.map((c) =>
    c.id === compId ? { ...c, state: { ...c.state, ...updates } } : c
  );
}

function main() {
  // 1. PSU OFF yields PSU_OFF status, zeroed RPM/Speed/MAF, null sensor values
  runTest('1. PSU OFF reports PSU_OFF and blanks energized telemetry', () => {
    const sol = solveCircuit(DEFAULT_PSU_OFF, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, DEFAULT_DMM);
    const snap = evaluateGaugeTelemetry({
      powerSupply: DEFAULT_PSU_OFF,
      circuitSolution: sol,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: [],
      wires: DEFAULT_WIRES,
      rpmEmulator: DEFAULT_RPM,
      gaugeMonitor: { ...DEFAULT_GAUGE_MONITOR_STATE, transportMode: 'LIVE' },
    });
    assert.equal(snap.statusCode, 'PSU_OFF');
    assert.equal(snap.rpm, 0);
    assert.equal(snap.simulatedSpeedKmh, 0);
    assert.equal(snap.estimatedMafGps, null);
    assert.equal(snap.coolantTempC, null);
    assert.equal(snap.supplyVoltageV, null);
  });

  // 2. PSU ON + STOPPED yields ECU_STANDBY while still reading live KL30/ECT/MAP
  runTest('2. PSU ON + STOPPED reports ECU_STANDBY with live MNA voltage readings', () => {
    const sol = solveCircuit(DEFAULT_PSU_ON, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, DEFAULT_DMM);
    const snap = evaluateGaugeTelemetry({
      powerSupply: DEFAULT_PSU_ON,
      circuitSolution: sol,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: [],
      wires: DEFAULT_WIRES,
      rpmEmulator: { ...DEFAULT_RPM, isActive: false },
      gaugeMonitor: { ...DEFAULT_GAUGE_MONITOR_STATE, transportMode: 'STOPPED' },
    });
    assert.equal(snap.statusCode, 'ECU_STANDBY');
    assert.equal(snap.rpm, 0);
    assert.ok(snap.supplyVoltageV !== null && snap.supplyVoltageV > 12.0);
    assert.ok(snap.coolantTempC !== null && Math.abs(snap.coolantTempC - 85.0) < 3.0);
  });

  // 3. Safety interlock blocks LIVE_SIMULATED
  runTest('3. Safety interlock forces SAFETY_LOCKED and zero RPM/Speed', () => {
    const sol = solveCircuit(DEFAULT_PSU_ON, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, DEFAULT_DMM);
    const snap = evaluateGaugeTelemetry({
      powerSupply: DEFAULT_PSU_ON,
      circuitSolution: sol,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: [],
      wires: DEFAULT_WIRES,
      rpmEmulator: DEFAULT_RPM,
      gaugeMonitor: { ...DEFAULT_GAUGE_MONITOR_STATE, transportMode: 'LIVE' },
      isSafetyLocked: true,
      safetyLockReason: 'Verify OEM connector',
    });
    assert.equal(snap.statusCode, 'SAFETY_LOCKED');
    assert.equal(snap.rpm, 0);
    assert.equal(snap.simulatedSpeedKmh, 0);
  });

  // 4. RPM sweep (800 -> 2500 -> 6500) scales Speed and ESTIMATED MAF monotonically
  runTest('4. RPM sweep (800 -> 2500 -> 6500) increases speed and ESTIMATED MAF monotonically', () => {
    const sol = solveCircuit(DEFAULT_PSU_ON, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, DEFAULT_DMM);
    const gm: GaugeMonitorState = { ...DEFAULT_GAUGE_MONITOR_STATE, transportMode: 'LIVE', selectedGear: '3' };
    const snap800 = evaluateGaugeTelemetry({
      powerSupply: DEFAULT_PSU_ON,
      circuitSolution: sol,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: [],
      wires: DEFAULT_WIRES,
      rpmEmulator: { ...DEFAULT_RPM, rpm: 800 },
      gaugeMonitor: gm,
    });
    const snap2500 = evaluateGaugeTelemetry({
      powerSupply: DEFAULT_PSU_ON,
      circuitSolution: sol,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: [],
      wires: DEFAULT_WIRES,
      rpmEmulator: { ...DEFAULT_RPM, rpm: 2500 },
      gaugeMonitor: gm,
    });
    const snap6500 = evaluateGaugeTelemetry({
      powerSupply: DEFAULT_PSU_ON,
      circuitSolution: sol,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: [],
      wires: DEFAULT_WIRES,
      rpmEmulator: { ...DEFAULT_RPM, rpm: 6500 },
      gaugeMonitor: gm,
    });

    assert.equal(snap800.statusCode, 'LIVE_SIMULATED');
    assert.ok(snap800.simulatedSpeedKmh < snap2500.simulatedSpeedKmh);
    assert.ok(snap2500.simulatedSpeedKmh < snap6500.simulatedSpeedKmh);
    assert.ok((snap800.estimatedMafGps ?? 0) < (snap2500.estimatedMafGps ?? 0));
    assert.ok((snap2500.estimatedMafGps ?? 0) < (snap6500.estimatedMafGps ?? 0));
  });

  // 5. Default 1-Bar NA AutomotiveModels.calculateMap() remains unchanged
  runTest('5. Default 1-Bar NA calculateMap() transfer curve stays backward-compatible', () => {
    const mIdle = AutomotiveModels.calculateMap(42, 5.0);
    const mWot = AutomotiveModels.calculateMap(100, 5.0);
    assert.ok(Math.abs(mIdle.voltage - 1.6) < 0.01);
    assert.ok(Math.abs(mWot.voltage - 4.5) < 0.01);
  });

  // 6. Configurable 2-Bar & 3-Bar boost calibrations represent positive boost cleanly inside MNA solver
  runTest('6. 2-Bar & 3-Bar boost calibrations yield positive boostBar without saturation', () => {
    const compsBoost = withComponentUpdate(DEFAULT_BENCH_COMPONENTS, 'comp-map', {
      pressureKpa: 185,
      calibrationPreset: 'BAR_2_BOOST',
    });
    const sol = solveCircuit(DEFAULT_PSU_ON, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, compsBoost, DEFAULT_DMM);
    const snap = evaluateGaugeTelemetry({
      powerSupply: DEFAULT_PSU_ON,
      circuitSolution: sol,
      components: compsBoost,
      faults: [],
      wires: DEFAULT_WIRES,
      rpmEmulator: DEFAULT_RPM,
      gaugeMonitor: {
        ...DEFAULT_GAUGE_MONITOR_STATE,
        transportMode: 'LIVE',
        mapCalibrationPreset: 'BAR_2_BOOST',
      },
    });
    assert.equal(snap.mapValidity, 'VALID');
    assert.ok(snap.mapKpa !== null && Math.abs(snap.mapKpa - 185) < 3.0);
    assert.ok(snap.boostBar !== null && snap.boostBar > 0.75);

    const cal3 = calculateCalibratedMapVoltage(260, 5.0, 'BAR_3_BOOST');
    assert.ok(cal3.voltage > 4.0 && cal3.voltage < 4.8);
  });

  // 7. MAP open-circuit wire cut invalidates boost & ESTIMATED MAF
  runTest('7. MAP OPEN wire cut invalidates Boost & ESTIMATED MAF as INVALID SOURCE', () => {
    const cutWires = DEFAULT_WIRES.map((w) => (w.id === 'wire-6' ? { ...w, isCut: true } : w));
    const sol = solveCircuit(DEFAULT_PSU_ON, DEFAULT_ECU_PINS, [], cutWires, DEFAULT_BENCH_COMPONENTS, DEFAULT_DMM);
    const snap = evaluateGaugeTelemetry({
      powerSupply: DEFAULT_PSU_ON,
      circuitSolution: sol,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: [],
      wires: cutWires,
      rpmEmulator: DEFAULT_RPM,
      gaugeMonitor: { ...DEFAULT_GAUGE_MONITOR_STATE, transportMode: 'LIVE' },
    });
    assert.equal(snap.mapValidity, 'FAULT_OPEN');
    assert.equal(snap.boostBar, null);
    assert.equal(snap.mafValidity, 'INVALID_SOURCE');
    assert.equal(snap.estimatedMafGps, null);
  });

  // 8. MAP short-to-ground triggers P0107 + FAULT_SHORT_GND + MAF invalidation
  runTest('8. MAP pin short-to-ground triggers P0107 and invalidates MAF', () => {
    const faults: InjectedFault[] = [
      { pinId: 'ecu-pin-8', faultType: 'SHORT_TO_GND', description: 'MAP short GND', timestamp: 1 },
    ];
    const sol = solveCircuit(DEFAULT_PSU_ON, DEFAULT_ECU_PINS, faults, DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, DEFAULT_DMM);
    const snap = evaluateGaugeTelemetry({
      powerSupply: DEFAULT_PSU_ON,
      circuitSolution: sol,
      components: DEFAULT_BENCH_COMPONENTS,
      faults,
      wires: DEFAULT_WIRES,
      rpmEmulator: DEFAULT_RPM,
      gaugeMonitor: { ...DEFAULT_GAUGE_MONITOR_STATE, transportMode: 'LIVE' },
    });
    assert.equal(snap.mapValidity, 'FAULT_SHORT_GND');
    assert.ok(snap.activeDtcCodes.includes('P0107'));
    assert.equal(snap.estimatedMafGps, null);
  });

  // 9. VREF_5V short-to-ground collapses VREF and marks MAP, ECT, MAF invalid
  runTest('9. VREF_5V short-to-ground marks MAP, ECT, and MAF as INVALID SOURCE', () => {
    const faults: InjectedFault[] = [
      { pinId: 'ecu-pin-5', faultType: 'SHORT_TO_GND', description: '5V ref short', timestamp: 1 },
    ];
    const sol = solveCircuit(DEFAULT_PSU_ON, DEFAULT_ECU_PINS, faults, DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, DEFAULT_DMM);
    const snap = evaluateGaugeTelemetry({
      powerSupply: DEFAULT_PSU_ON,
      circuitSolution: sol,
      components: DEFAULT_BENCH_COMPONENTS,
      faults,
      wires: DEFAULT_WIRES,
      rpmEmulator: DEFAULT_RPM,
      gaugeMonitor: { ...DEFAULT_GAUGE_MONITOR_STATE, transportMode: 'LIVE' },
    });
    assert.equal(snap.mapValidity, 'INVALID_SOURCE');
    assert.equal(snap.coolantValidity, 'INVALID_SOURCE');
    assert.equal(snap.mafValidity, 'INVALID_SOURCE');
  });

  // 10. ECT open circuit emits FAULT_OPEN fail-safe (-40°C) distinct from normal thermistor
  runTest('10. ECT open circuit emits FAULT_OPEN (-40°C fail-safe) + P0118', () => {
    const cutWires = DEFAULT_WIRES.map((w) => (w.id === 'wire-7' ? { ...w, isCut: true } : w));
    const sol = solveCircuit(DEFAULT_PSU_ON, DEFAULT_ECU_PINS, [], cutWires, DEFAULT_BENCH_COMPONENTS, DEFAULT_DMM);
    const snap = evaluateGaugeTelemetry({
      powerSupply: DEFAULT_PSU_ON,
      circuitSolution: sol,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: [],
      wires: cutWires,
      rpmEmulator: DEFAULT_RPM,
      gaugeMonitor: { ...DEFAULT_GAUGE_MONITOR_STATE, transportMode: 'LIVE' },
    });
    assert.equal(snap.coolantValidity, 'FAULT_OPEN');
    assert.equal(snap.coolantTempC, -40.0);
    assert.ok(snap.activeDtcCodes.includes('P0118'));
  });

  // 11. ECT short-to-ground emits FAULT_SHORT_GND fail-safe (+140°C) + P0117
  runTest('11. ECT short-to-ground emits FAULT_SHORT_GND (+140°C fail-safe) + P0117', () => {
    const faults: InjectedFault[] = [
      { pinId: 'ecu-pin-9', faultType: 'SHORT_TO_GND', description: 'ECT short GND', timestamp: 1 },
    ];
    const sol = solveCircuit(DEFAULT_PSU_ON, DEFAULT_ECU_PINS, faults, DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, DEFAULT_DMM);
    const snap = evaluateGaugeTelemetry({
      powerSupply: DEFAULT_PSU_ON,
      circuitSolution: sol,
      components: DEFAULT_BENCH_COMPONENTS,
      faults,
      wires: DEFAULT_WIRES,
      rpmEmulator: DEFAULT_RPM,
      gaugeMonitor: { ...DEFAULT_GAUGE_MONITOR_STATE, transportMode: 'LIVE' },
    });
    assert.equal(snap.coolantValidity, 'FAULT_SHORT_GND');
    assert.equal(snap.coolantTempC, 140.0);
    assert.ok(snap.activeDtcCodes.includes('P0117'));
  });

  // 12. CKP signal loss sets CKP_NO_SIGNAL, triggers P0335, zeroes RPM/Speed/MAF
  runTest('12. CKP signal dropout sets CKP_NO_SIGNAL, P0335, and zeroes RPM/Speed/MAF', () => {
    const ckpLostRpm: RpmEmulatorState = { ...DEFAULT_RPM, ckpSignalLost: true };
    const sol = solveCircuit(DEFAULT_PSU_ON, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, DEFAULT_DMM, {
      rpm: ckpLostRpm.rpm,
      ckpSignalLost: true,
    });
    const snap = evaluateGaugeTelemetry({
      powerSupply: DEFAULT_PSU_ON,
      circuitSolution: sol,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: [],
      wires: DEFAULT_WIRES,
      rpmEmulator: ckpLostRpm,
      gaugeMonitor: { ...DEFAULT_GAUGE_MONITOR_STATE, transportMode: 'LIVE' },
    });
    assert.equal(snap.statusCode, 'CKP_NO_SIGNAL');
    assert.equal(snap.rpm, 0);
    assert.equal(snap.simulatedSpeedKmh, 0);
    assert.equal(snap.estimatedMafGps, 0);
    assert.ok(snap.activeDtcCodes.includes('P0335'));
  });

  // 13. TPS slider syncs directly from shared component state & pin-7 voltage
  runTest('13. TPS change updates both telemetry tpsPercent and MNA pin-7 voltage', () => {
    const comps = withComponentUpdate(DEFAULT_BENCH_COMPONENTS, 'comp-tps', { throttleAnglePercent: 75 });
    const sol = solveCircuit(DEFAULT_PSU_ON, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, comps, DEFAULT_DMM);
    const snap = evaluateGaugeTelemetry({
      powerSupply: DEFAULT_PSU_ON,
      circuitSolution: sol,
      components: comps,
      faults: [],
      wires: DEFAULT_WIRES,
      rpmEmulator: DEFAULT_RPM,
      gaugeMonitor: { ...DEFAULT_GAUGE_MONITOR_STATE, transportMode: 'LIVE' },
    });
    assert.equal(snap.tpsPercent, 75);
    assert.ok((sol.nodeVoltages['ecu-pin-7'] ?? 0) > 3.2);
  });

  // 14. Injector OFF & Main Relay OFF propagate cleanly
  runTest('14. Injector OFF and Relay OFF propagate into telemetry flags', () => {
    let comps = withComponentUpdate(DEFAULT_BENCH_COMPONENTS, 'comp-inj', { isFiring: false });
    comps = withComponentUpdate(comps, 'comp-relay', { isLatched: false });
    const sol = solveCircuit(DEFAULT_PSU_ON, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, comps, DEFAULT_DMM);
    const snap = evaluateGaugeTelemetry({
      powerSupply: DEFAULT_PSU_ON,
      circuitSolution: sol,
      components: comps,
      faults: [],
      wires: DEFAULT_WIRES,
      rpmEmulator: DEFAULT_RPM,
      gaugeMonitor: { ...DEFAULT_GAUGE_MONITOR_STATE, transportMode: 'LIVE' },
    });
    assert.equal(snap.isInjectorFiring, false);
    assert.equal(snap.isRelayLatched, false);
  });

  // 15. Drivetrain Neutral gear reports 0 km/h while Gears 1..6 compute calibrated road speed
  runTest('15. Drivetrain Neutral yields 0 km/h while Gear 4 computes calibrated speed', () => {
    const neutral = calculateSimulatedSpeedKmh({
      rpm: 3000,
      selectedGear: 'N',
      finalDriveRatio: 3.9,
      tireCircumferenceMm: 1980,
      speedKmhOverride: null,
      isLive: true,
    });
    const gear4 = calculateSimulatedSpeedKmh({
      rpm: 3000,
      selectedGear: '4',
      finalDriveRatio: 3.9,
      tireCircumferenceMm: 1980,
      speedKmhOverride: null,
      isLive: true,
    });
    assert.equal(neutral.speedKmh, 0);
    assert.ok(gear4.speedKmh > 80 && gear4.speedKmh < 100);
  });

  // 16. Peak-Hold ignores fault fail-safes (+140°C ECT short) and STANDBY/PAUSED states
  runTest('16. Peak-Hold records valid LIVE readings and rejects fault fail-safe spikes', () => {
    const solValid = solveCircuit(DEFAULT_PSU_ON, DEFAULT_ECU_PINS, [], DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, DEFAULT_DMM);
    const snapValid = evaluateGaugeTelemetry({
      powerSupply: DEFAULT_PSU_ON,
      circuitSolution: solValid,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: [],
      wires: DEFAULT_WIRES,
      rpmEmulator: { ...DEFAULT_RPM, rpm: 4500 },
      gaugeMonitor: { ...DEFAULT_GAUGE_MONITOR_STATE, transportMode: 'LIVE' },
    });
    let peak = computeUpdatedPeakHold(DEFAULT_PEAK_HOLD, snapValid);
    assert.equal(peak.maxRpm, 4500);
    assert.ok(peak.maxCoolantC !== null && peak.maxCoolantC < 90);

    // Now inject ECT short-to-ground (+140°C fail-safe) -> Peak-Hold must ignore 140°C!
    const ectFaults: InjectedFault[] = [
      { pinId: 'ecu-pin-9', faultType: 'SHORT_TO_GND', description: 'ECT short', timestamp: 2 },
    ];
    const solFault = solveCircuit(DEFAULT_PSU_ON, DEFAULT_ECU_PINS, ectFaults, DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, DEFAULT_DMM);
    const snapFault = evaluateGaugeTelemetry({
      powerSupply: DEFAULT_PSU_ON,
      circuitSolution: solFault,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: ectFaults,
      wires: DEFAULT_WIRES,
      rpmEmulator: { ...DEFAULT_RPM, rpm: 5000 },
      gaugeMonitor: { ...DEFAULT_GAUGE_MONITOR_STATE, transportMode: 'LIVE' },
    });
    peak = computeUpdatedPeakHold(peak, snapFault);
    assert.equal(peak.maxRpm, 5000);
    assert.ok(peak.maxCoolantC !== null && peak.maxCoolantC < 90);

    // PAUSED / STOPPED states do not mutate peak
    const pausedSnap = { ...snapValid, statusCode: 'PAUSED' as const, rpm: 7900 };
    const afterPause = computeUpdatedPeakHold(peak, pausedSnap);
    assert.equal(afterPause, peak);
  });

  // 17. Reset Peaks clears peakHold cleanly to nulls
  runTest('17. Reset Peaks clears all extrema to null cleanly', () => {
    const clean = sanitizeGaugeMonitorState({
      ...DEFAULT_GAUGE_MONITOR_STATE,
      peakHold: { ...DEFAULT_PEAK_HOLD },
    });
    assert.deepEqual(clean.peakHold, DEFAULT_PEAK_HOLD);
  });

  // 18. Session restore & Drive import always force transportMode = 'STOPPED' while keeping settings & peaks
  runTest('18. forceSafeStoppedGaugeState preserves settings & peaks but forces STOPPED', () => {
    const savedLive: GaugeMonitorState = {
      ...DEFAULT_GAUGE_MONITOR_STATE,
      transportMode: 'LIVE',
      mapCalibrationPreset: 'BAR_3_BOOST',
      selectedGear: '5',
      intakeTempCelsius: 44.5,
      peakHold: {
        maxRpm: 6200,
        maxSpeedKmh: 174,
        maxBoostBar: 1.45,
        maxMafGps: 142.3,
        maxCoolantC: 94.2,
        minSupplyV: 11.8,
        maxSupplyV: 13.9,
      },
    };
    const restored = forceSafeStoppedGaugeState(savedLive);
    assert.equal(restored.transportMode, 'STOPPED');
    assert.equal(restored.mapCalibrationPreset, 'BAR_3_BOOST');
    assert.equal(restored.selectedGear, '5');
    assert.equal(restored.intakeTempCelsius, 44.5);
    assert.equal(restored.peakHold.maxRpm, 6200);
    assert.equal(restored.peakHold.maxBoostBar, 1.45);
  });

  // 19. Google Drive snapshot round-trip preserves gaugeMonitor + forces STOPPED on parse/restore
  runTest('19. Drive snapshot build + parse round-trips gaugeMonitor cleanly', () => {
    const gm: GaugeMonitorState = {
      ...DEFAULT_GAUGE_MONITOR_STATE,
      transportMode: 'LIVE',
      mapCalibrationPreset: 'BAR_2_BOOST',
      engineDisplacementLiters: 2.5,
      volumetricEfficiency: 0.92,
      peakHold: { ...DEFAULT_PEAK_HOLD, maxRpm: 5800 },
    };
    const snapshot = buildDriveBenchSnapshot({
      title: 'Turbo Boost Test',
      ecuProfileLabel: 'Universal 16-Pin',
      powerSupply: DEFAULT_PSU_ON,
      wires: DEFAULT_WIRES,
      faults: [],
      components: DEFAULT_BENCH_COMPONENTS,
      rpmEmulator: DEFAULT_RPM,
      gaugeMonitor: gm,
      activeDtcs: [],
      supplyCurrentDrawAmps: 0.45,
    });
    const parsed = parseDriveBenchSnapshot(JSON.stringify(snapshot));
    assert.ok(parsed && parsed.gaugeMonitor);
    const safeRestored = forceSafeStoppedGaugeState(parsed.gaugeMonitor);
    assert.equal(safeRestored.transportMode, 'STOPPED');
    assert.equal(safeRestored.mapCalibrationPreset, 'BAR_2_BOOST');
    assert.equal(safeRestored.engineDisplacementLiters, 2.5);
    assert.equal(safeRestored.peakHold.maxRpm, 5800);
  });

  // 20. Offline merge (subscribeBenchSessions fix) merges ALL queued fields, not just wires
  runTest('20. mergeCachedBenchSessions preserves queued gaugeMonitor & rpmEmulator updates', () => {
    const cloudSession: SavedBenchSession = {
      id: 'bench_1',
      ownerId: 'user_1',
      title: 'Cloud Bench',
      notes: '',
      ecuProfileLabel: 'Universal ECU',
      powerSupply: DEFAULT_PSU_ON,
      wires: DEFAULT_WIRES,
      faults: [],
      componentStates: {},
      activeDtcs: [],
      supplyCurrentDrawAmps: 0.3,
      gaugeMonitor: DEFAULT_GAUGE_MONITOR_STATE,
    };
    const updatedGauge: GaugeMonitorState = {
      ...DEFAULT_GAUGE_MONITOR_STATE,
      mapCalibrationPreset: 'BAR_2_BOOST',
      selectedGear: '4',
      peakHold: { ...DEFAULT_PEAK_HOLD, maxRpm: 4800 },
    };
    const merged = mergeCachedBenchSessions(
      [cloudSession],
      [
        {
          docId: 'bench_1',
          syncState: 'QUEUED_OFFLINE',
          data: {
            gaugeMonitor: updatedGauge,
            rpmEmulator: { isActive: false, rpm: 3200, soundEnabled: true },
          },
        },
      ]
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].syncState, 'QUEUED_OFFLINE');
    assert.equal(merged[0].gaugeMonitor?.mapCalibrationPreset, 'BAR_2_BOOST');
    assert.equal(merged[0].gaugeMonitor?.peakHold.maxRpm, 4800);
    assert.equal(merged[0].rpmEmulator?.rpm, 3200);
  });

  // 21. benchStorageService update payload allowlist + Firestore rules include gaugeMonitor
  runTest('21. benchStorageService allowlist and firestore.rules validate gaugeMonitor', () => {
    const payload = buildBenchSessionUpdatePayload({
      gaugeMonitor: DEFAULT_GAUGE_MONITOR_STATE,
      disallowedField: 'inject',
    });
    assert.ok('gaugeMonitor' in payload);
    assert.ok(!('disallowedField' in payload));

    const rulesContent = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    assert.ok(rulesContent.includes('function isValidGaugeMonitor(gm)'));
    assert.ok(rulesContent.includes("'gaugeMonitor'"));
  });

  // 22. Pure unit verification on inferMapFromVoltage & inferEctFromVoltage bounds & mafEstimator
  runTest('22. Speed-Density MAF & inverse MAP/ECT transfer helpers behave accurately', () => {
    const maf = calculateEstimatedMaf({
      rpm: 2000,
      mapKpa: 100,
      intakeTempCelsius: 25,
      engineDisplacementLiters: 2.0,
      volumetricEfficiency: 0.85,
      isLive: true,
      isPowerOn: true,
      hasValidMapSource: true,
    });
    assert.equal(maf.isValid, true);
    assert.ok(maf.mafGps !== null && maf.mafGps > 25 && maf.mafGps < 40);

    const mapInv = inferMapFromVoltage({
      mapVoltage: 2.5,
      vRefVoltage: 5.0,
      sgndVoltage: 0.0,
      isPowerOn: true,
      preset: 'BAR_1_NA',
    });
    assert.equal(mapInv.validity, 'VALID');
    assert.ok(mapInv.mapKpa !== null && Math.abs(mapInv.mapKpa - 60) < 0.5);

    const ectInv = inferEctFromVoltage({
      ectVoltage: 2.66, // ~2.5kΩ @ 25°C with 2.2kΩ pullup to 5V => 5 * 2500 / 4700 = 2.66V
      vRefVoltage: 5.0,
      sgndVoltage: 0.0,
      isPowerOn: true,
    });
    assert.equal(ectInv.validity, 'VALID');
    assert.ok(ectInv.coolantTempC !== null && Math.abs(ectInv.coolantTempC - 25.0) < 1.5);
  });

  // 23. Damped gauge needle & synchronized arc math helpers
  runTest('23. useDampedGaugeMotion helpers clamp ratios, map RPM/speed angles, and compute dash offsets accurately', () => {
    assert.equal(computeNormalizedGaugeRatio(-200, 0, 8000), 0);
    assert.equal(computeNormalizedGaugeRatio(4000, 0, 8000), 0.5);
    assert.equal(computeNormalizedGaugeRatio(12000, 0, 8000), 1);

    // CircularInstrumentGauge (-135..+135 deg)
    assert.equal(computeGaugeNeedleAngleDeg(0, -135, 270), -135);
    assert.equal(computeGaugeNeedleAngleDeg(0.5, -135, 270), 0);
    assert.equal(computeGaugeNeedleAngleDeg(1, -135, 270), 135);

    // MiniRpmDial (-225..+45 deg)
    assert.equal(computeGaugeNeedleAngleDeg(0, -225, 270), -225);
    assert.equal(computeGaugeNeedleAngleDeg(0.5, -225, 270), -90);
    assert.equal(computeGaugeNeedleAngleDeg(1, -225, 270), 45);

    // Synchronized strokeDashoffset across 0..1000 pathLength units
    assert.equal(computeArcDashOffset(0, 1000), 1000);
    assert.equal(computeArcDashOffset(0.25, 1000), 750);
    assert.equal(computeArcDashOffset(1, 1000), 0);

    // Clockwise 270-degree SVG arc uses largeArc=1, sweepFlag=1
    const mainArc = buildClockwiseArcPath(90, 88, 66, -135, 135);
    assert.ok(mainArc.includes('A 66 66 0 1 1'));
  });

  console.log(`\nGauge Telemetry Suite Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();

