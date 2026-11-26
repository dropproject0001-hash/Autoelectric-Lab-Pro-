/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import {
  DEFAULT_BENCH_COMPONENTS,
  DEFAULT_ECU_PINS,
  DEFAULT_WIRES,
  solveCircuit,
} from '../ecu/BenchCircuitSolver';
import {
  buildHarnessFaultEntries,
  buildWireOverviewMap,
  computeCrankAngularVelocityRadPerSec,
  computeHarnessGraphTopology,
  evaluatePinDiagnosticMatrix,
  evaluateSimulatedCanBusLoad,
  evaluateTopologySearch,
  filterWireOverviewEntries,
  formatWireResistanceOhms,
} from '../telemetry/harnessDiagnostics';
import {
  buildProbeTrailPathD,
  clampUnit,
  computeArcLiftPx,
  computeProbeFlightFrame,
  easeInOutCubic,
  formatProbeMoveBadge,
} from '../../components/harness/useProbeTransitionMotion';
import type { InjectedFault, MultimeterState, PowerSupplyState } from '../../types/ecu';
import {
  getSelectedVehicleContext,
  type RpmEmulatorState,
} from '../../utils/vehicleEcuRegistry';
import {
  evaluateEmsDigitalTwinState,
  evaluateSequentialFiringPhase,
  resolveEmsEcuSyncProfile,
} from '../telemetry/emsDigitalTwinSync';
import { describeTwinSyncStatus } from '../../components/LabStatusFooter';
import {
  deriveEngineBlockFaultOverlay,
  extractEmsSensorSignals,
} from '../../hooks/useEmsTelemetrySync';
import {
  buildOrthogonalTrunkWaypoints,
  classifyPinCircuitGroup,
  EFI_FUNCTIONAL_COLOR_STANDARD,
  EFI_TRUNK_CORRIDORS,
  formatStandardConnectionTag,
  parseThreeDVoiceCommand,
} from '../telemetry/efiHarnessStandard';
import { deriveEmsAcousticParams } from '../../utils/emsAudioSynthesizer';

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

const PSU_ON: PowerSupplyState = {
  voltageSetting: 12.6,
  currentLimit: 5.0,
  isOutputEnabled: true,
  preset: '12V_BENCH',
};

const PSU_OFF: PowerSupplyState = {
  ...PSU_ON,
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

const ACTIVE_RPM: RpmEmulatorState = {
  isActive: true,
  rpm: 3200,
  soundEnabled: false,
  camPhaseOffsetDeg: 0,
  ckpSignalLost: false,
};

function main() {
  // 1. Pin Matrix reflects PSU OFF cleanly
  runTest('1. evaluatePinDiagnosticMatrix sets STANDBY and 0.0V when PSU is OFF', () => {
    const sol = solveCircuit(
      PSU_OFF,
      DEFAULT_ECU_PINS,
      [],
      DEFAULT_WIRES,
      DEFAULT_BENCH_COMPONENTS,
      DEFAULT_DMM
    );
    const matrix = evaluatePinDiagnosticMatrix({
      pins: DEFAULT_ECU_PINS,
      nodeVoltages: sol.nodeVoltages,
      wireCurrentsMa: sol.wireCurrentsMa,
      wires: DEFAULT_WIRES,
      faults: [],
      activeDTCs: sol.activeDTCs,
      isPowerOn: false,
      rpmEmulator: ACTIVE_RPM,
    });

    assert.equal(matrix.length, DEFAULT_ECU_PINS.length);
    for (const entry of matrix) {
      assert.equal(entry.status, 'STANDBY');
      assert.equal(entry.compactReadout, '0.0V');
      assert.equal(entry.healthPercent, null);
    }
  });

  // 2. Pin Matrix tracks live MNA voltages, faults, cut wires, and INJ duty readout
  runTest('2. evaluatePinDiagnosticMatrix reports ACTIVE, FAULT, cut wires, and INJ duty', () => {
    const faults: InjectedFault[] = [
      {
        pinId: 'ecu-pin-7',
        faultType: 'SHORT_TO_GND',
        description: 'TPS signal shorted to ground',
        timestamp: 1_700_000_000_000,
      },
    ];
    const wiresWithCut = DEFAULT_WIRES.map((w) =>
      w.id === 'wire-10' ? { ...w, isCut: true } : w
    );
    const sol = solveCircuit(
      PSU_ON,
      DEFAULT_ECU_PINS,
      faults,
      wiresWithCut,
      DEFAULT_BENCH_COMPONENTS,
      DEFAULT_DMM
    );
    const matrix = evaluatePinDiagnosticMatrix({
      pins: DEFAULT_ECU_PINS,
      nodeVoltages: sol.nodeVoltages,
      wireCurrentsMa: sol.wireCurrentsMa,
      wires: wiresWithCut,
      faults,
      activeDTCs: sol.activeDTCs,
      isPowerOn: true,
      rpmEmulator: ACTIVE_RPM,
    });

    const kl30 = matrix.find((p) => p.pinId === 'ecu-pin-3');
    const tps = matrix.find((p) => p.pinId === 'ecu-pin-7');
    const canH = matrix.find((p) => p.pinId === 'ecu-pin-13');
    const inj1 = matrix.find((p) => p.pinId === 'ecu-pin-10');

    assert.ok(kl30 && kl30.status === 'ACTIVE' && kl30.voltage > 11.5);
    assert.ok(tps && tps.status === 'FAULT' && tps.compactReadout === '0V!' && tps.healthPercent === 0);
    assert.ok(canH && canH.status === 'FAULT' && canH.healthPercent === 0);
    assert.ok(inj1 && inj1.compactReadout.endsWith('%'));
  });

  // 3. Fault Diagnostics Builder prioritizes CRITICAL over HIGH and maps wire cuts + supply trip
  runTest('3. buildHarnessFaultEntries prioritizes CRITICAL and tracks supply trip & wire cuts', () => {
    const faults: InjectedFault[] = [
      {
        pinId: 'ecu-pin-9',
        faultType: 'HIGH_RESISTANCE_1K',
        description: 'Corroded ECT connector terminal',
        timestamp: 1_700_000_001_000,
      },
      {
        pinId: 'ecu-pin-7',
        faultType: 'SHORT_TO_GND',
        description: 'TPS short to GND',
        timestamp: 1_700_000_002_000,
      },
    ];
    const wiresWithCut = DEFAULT_WIRES.map((w) =>
      w.id === 'wire-5' ? { ...w, isCut: true } : w
    );
    const sol = solveCircuit(
      PSU_ON,
      DEFAULT_ECU_PINS,
      faults,
      wiresWithCut,
      DEFAULT_BENCH_COMPONENTS,
      DEFAULT_DMM
    );
    const entries = buildHarnessFaultEntries({
      pins: DEFAULT_ECU_PINS,
      wires: wiresWithCut,
      faults,
      activeDTCs: sol.activeDTCs,
      isSupplyTripped: true,
    });

    assert.equal(entries.length, 4);
    assert.equal(entries[entries.length - 1]?.priority, 'HIGH');
    assert.ok(entries.some((e) => e.source === 'SUPPLY_TRIP' && e.priority === 'CRITICAL'));
    assert.ok(entries.some((e) => e.source === 'WIRE_CUT' && e.wireId === 'wire-5'));
    assert.ok(entries.some((e) => e.source === 'PIN_FAULT' && e.pinId === 'ecu-pin-7' && Boolean(e.dtcCode)));
  });

  // 4. CAN Bus Load state machine covers PSU_OFF, ECU_SLEEP, BUS_OFF, DEGRADED, and ACTIVE_SIMULATED
  runTest('4. evaluateSimulatedCanBusLoad accurately distinguishes bus states', () => {
    const offSnap = evaluateSimulatedCanBusLoad({
      isPowerOn: false,
      nodeVoltages: {},
      faults: [],
      wires: DEFAULT_WIRES,
      rpmEmulator: ACTIVE_RPM,
      transportMode: 'LIVE',
    });
    assert.equal(offSnap.busState, 'PSU_OFF');
    assert.equal(offSnap.loadPercent, 0);

    const sleepSnap = evaluateSimulatedCanBusLoad({
      isPowerOn: true,
      nodeVoltages: { 'ecu-pin-3': 12.6, 'ecu-pin-4': 0.2, 'ecu-pin-13': 2.5, 'ecu-pin-14': 2.5 },
      faults: [],
      wires: DEFAULT_WIRES,
      rpmEmulator: ACTIVE_RPM,
      transportMode: 'LIVE',
    });
    assert.equal(sleepSnap.busState, 'ECU_SLEEP');
    assert.equal(sleepSnap.bitrateKbps, 0);

    const busOffSnap = evaluateSimulatedCanBusLoad({
      isPowerOn: true,
      nodeVoltages: { 'ecu-pin-3': 12.6, 'ecu-pin-4': 12.6, 'ecu-pin-13': 0.0, 'ecu-pin-14': 2.5 },
      faults: [
        { pinId: 'ecu-pin-13', faultType: 'SHORT_TO_GND', description: 'CAN_H short', timestamp: 1 },
      ],
      wires: DEFAULT_WIRES,
      rpmEmulator: ACTIVE_RPM,
      transportMode: 'LIVE',
    });
    assert.equal(busOffSnap.busState, 'BUS_OFF');
    assert.equal(busOffSnap.hasBusFault, true);
    assert.equal(busOffSnap.bitrateKbps, 0);

    const degradedSnap = evaluateSimulatedCanBusLoad({
      isPowerOn: true,
      nodeVoltages: { 'ecu-pin-3': 12.6, 'ecu-pin-4': 12.6, 'ecu-pin-13': 2.5, 'ecu-pin-14': 2.5 },
      faults: [
        { pinId: 'ecu-pin-13', faultType: 'HIGH_RESISTANCE_1K', description: 'Terminal oxidation', timestamp: 1 },
      ],
      wires: DEFAULT_WIRES,
      rpmEmulator: ACTIVE_RPM,
      transportMode: 'LIVE',
    });
    assert.equal(degradedSnap.busState, 'DEGRADED');
    assert.equal(degradedSnap.bitrateKbps, 125);
    assert.equal(degradedSnap.hasBusFault, true);

    const liveSnap = evaluateSimulatedCanBusLoad({
      isPowerOn: true,
      nodeVoltages: { 'ecu-pin-3': 12.6, 'ecu-pin-4': 12.6, 'ecu-pin-13': 2.5, 'ecu-pin-14': 2.5 },
      faults: [],
      wires: DEFAULT_WIRES,
      rpmEmulator: ACTIVE_RPM,
      transportMode: 'LIVE',
    });
    assert.equal(liveSnap.busState, 'ACTIVE_SIMULATED');
    assert.equal(liveSnap.bitrateKbps, 500);
    assert.equal(liveSnap.sourceLabel, 'SIMULATED CAN LOAD');
    assert.ok(liveSnap.loadPercent > 30 && liveSnap.loadPercent <= 94);
  });

  // 5. Topology search highlights matching pins, wires, and components cleanly
  runTest('5. evaluateTopologySearch matches pin numbers, component keywords, and misses cleanly', () => {
    const idle = evaluateTopologySearch({
      query: '   ',
      pins: DEFAULT_ECU_PINS,
      wires: DEFAULT_WIRES,
      components: DEFAULT_BENCH_COMPONENTS,
    });
    assert.equal(idle.totalMatches, 0);
    assert.equal(idle.matchingPinIds.size, DEFAULT_ECU_PINS.length);

    const byPin = evaluateTopologySearch({
      query: 'pin 13',
      pins: DEFAULT_ECU_PINS,
      wires: DEFAULT_WIRES,
      components: DEFAULT_BENCH_COMPONENTS,
    });
    assert.ok(byPin.matchingPinIds.has('ecu-pin-13'));
    assert.ok(byPin.matchingWireIds.has('wire-10'));
    assert.ok(!byPin.matchingPinIds.has('ecu-pin-7'));

    const byComp = evaluateTopologySearch({
      query: 'TPS',
      pins: DEFAULT_ECU_PINS,
      wires: DEFAULT_WIRES,
      components: DEFAULT_BENCH_COMPONENTS,
    });
    assert.ok(byComp.matchingComponentIds.has('comp-tps'));
    assert.ok(byComp.matchingPinIds.has('ecu-pin-7'));
    assert.ok(byComp.matchingWireIds.has('wire-2'));

    const miss = evaluateTopologySearch({
      query: 'ZZZ_UNMATCHED_QUERY',
      pins: DEFAULT_ECU_PINS,
      wires: DEFAULT_WIRES,
      components: DEFAULT_BENCH_COMPONENTS,
    });
    assert.equal(miss.totalMatches, 0);
    assert.equal(miss.matchingPinIds.size, 0);
  });

  // 6. 3D Crankshaft 36-1 angular velocity halts honestly on PSU OFF, standby, or CKP signal dropout
  runTest('6. computeCrankAngularVelocityRadPerSec respects PSU, run state, CKP dropout, and RPM scaling', () => {
    assert.equal(
      computeCrankAngularVelocityRadPerSec({
        isPowerActive: false,
        isRpmRunning: true,
        ckpSignalLost: false,
        rpm: 2400,
        simulationSpeed: 1,
      }),
      0
    );
    assert.equal(
      computeCrankAngularVelocityRadPerSec({
        isPowerActive: true,
        isRpmRunning: false,
        ckpSignalLost: false,
        rpm: 2400,
        simulationSpeed: 1,
      }),
      0
    );
    assert.equal(
      computeCrankAngularVelocityRadPerSec({
        isPowerActive: true,
        isRpmRunning: true,
        ckpSignalLost: true,
        rpm: 2400,
        simulationSpeed: 1,
      }),
      0
    );

    const vIdle = computeCrankAngularVelocityRadPerSec({
      isPowerActive: true,
      isRpmRunning: true,
      ckpSignalLost: false,
      rpm: 850,
      simulationSpeed: 1,
    });
    const vHigh = computeCrankAngularVelocityRadPerSec({
      isPowerActive: true,
      isRpmRunning: true,
      ckpSignalLost: false,
      rpm: 3500,
      simulationSpeed: 1,
    });
    assert.ok(vIdle > 0);
    assert.ok(vHigh > vIdle);
  });

  // 7. computeHarnessGraphTopology extracts deterministic nodes, links, and electrical nets from MNA circuit solution
  runTest('7. computeHarnessGraphTopology generates accurate node, link, and net topology', () => {
    const solution = solveCircuit(
      PSU_ON,
      DEFAULT_ECU_PINS,
      [],
      DEFAULT_WIRES,
      DEFAULT_BENCH_COMPONENTS,
      DEFAULT_DMM
    );

    const topology = computeHarnessGraphTopology({
      pins: DEFAULT_ECU_PINS,
      components: DEFAULT_BENCH_COMPONENTS,
      wires: DEFAULT_WIRES,
      nodeVoltages: solution.nodeVoltages,
      faults: [],
      isPowerOn: true,
    });

    assert.ok(topology.nodes.length >= DEFAULT_ECU_PINS.length);
    assert.equal(topology.links.length, DEFAULT_WIRES.length);
    assert.ok(topology.summary.connectedNodes > 0);
    assert.equal(topology.summary.totalWires, DEFAULT_WIRES.length);
    assert.equal(topology.summary.cutWires, 0);
    assert.ok(topology.nets.length > 0);

    // Verify voltage propagation on KL30 power node
    const kl30Node = topology.nodes.find((n) => n.label.includes('KL30') || n.id === 'ecu-pin-3');
    assert.ok(kl30Node, 'KL30 pin node must be present in topology');
    assert.ok(kl30Node.voltage > 10.0, 'KL30 node voltage must reflect PSU energization');

    // Test cut wire reflection
    const cutWires = DEFAULT_WIRES.map((w, idx) => (idx === 0 ? { ...w, isCut: true } : w));
    const cutTopology = computeHarnessGraphTopology({
      pins: DEFAULT_ECU_PINS,
      components: DEFAULT_BENCH_COMPONENTS,
      wires: cutWires,
      nodeVoltages: solution.nodeVoltages,
      faults: [],
      isPowerOn: true,
    });
    assert.equal(cutTopology.summary.cutWires, 1);
    assert.equal(cutTopology.summary.continuousWires, DEFAULT_WIRES.length - 1);
    assert.equal(cutTopology.links[0].isCut, true);
  });

  // 8. Virtual multimeter probe transition physics helpers compute smooth arcs, bounded lift, and move badges
  runTest('8. probe transition motion helpers compute smooth parabolic flight arcs, trails, and badges', () => {
    assert.equal(clampUnit(-0.4), 0);
    assert.equal(clampUnit(1.7), 1);
    assert.equal(easeInOutCubic(0), 0);
    assert.equal(easeInOutCubic(0.5), 0.5);
    assert.equal(easeInOutCubic(1), 1);

    const from = { x: 260, y: 276 };
    const to = { x: 640, y: 420 };

    const startFrame = computeProbeFlightFrame({ from, to, progress: 0, color: 'red' });
    assert.equal(startFrame.coords.x, from.x);
    assert.equal(startFrame.coords.y, from.y);
    assert.equal(startFrame.tiltAngle, 0);
    assert.equal(startFrame.scale, 1);

    const midRed = computeProbeFlightFrame({ from, to, progress: 0.5, color: 'red' });
    const midBlack = computeProbeFlightFrame({ from, to, progress: 0.5, color: 'black' });
    assert.ok(midRed.coords.x > from.x && midRed.coords.x < to.x);
    assert.ok(midRed.coords.y < midRed.groundCoords.y, 'Probe must visually lift above ground plane mid-flight');
    assert.ok(midRed.scale > 1);
    assert.ok(midRed.shadowOpacity > startFrame.shadowOpacity);
    assert.ok(midRed.tiltAngle < 0 && midBlack.tiltAngle > 0, 'Red and Black probes tilt ergonomically in opposite base directions');

    const endFrame = computeProbeFlightFrame({ from, to, progress: 1, color: 'red' });
    assert.equal(endFrame.coords.x, to.x);
    assert.equal(endFrame.coords.y, to.y);
    assert.equal(endFrame.tiltAngle, 0);
    assert.equal(endFrame.scale, 1);

    const safeNearTopLift = computeArcLiftPx({ x: 260, y: 24 }, { x: 600, y: 30 });
    assert.ok(safeNearTopLift >= 8 && safeNearTopLift <= 16, 'Arc lift near top edge remains bounded');

    const pathD = buildProbeTrailPathD(from, to);
    assert.match(pathD, /^M 260\.0 276\.0 Q \d+\.\d+ -?\d+\.\d+ 640\.0 420\.0$/);

    assert.equal(
      formatProbeMoveBadge('TPS_SIG (Pin 7)', 'INJ_1 (Pin 10)'),
      'TPS_SIG → INJ_1'
    );
    assert.equal(formatProbeMoveBadge(null, 'VBAT_KL30 (Pin 3)'), 'LEAD → VBAT_KL30');
  });

  // 9. Wire Overview Map provides searchable active wire connections, resistance values, and source/target IDs
  runTest('9. buildWireOverviewMap and filterWireOverviewEntries index active wires, resistance, and source/target IDs', () => {
    assert.equal(formatWireResistanceOhms(0.05, false), '0.05 Ω');
    assert.equal(formatWireResistanceOhms(250, false), '250.0 Ω');
    assert.equal(formatWireResistanceOhms(1500, false), '1.50 kΩ');
    assert.equal(formatWireResistanceOhms(0.05, true), '∞ Ω (OPEN)');

    const wiresWithCutAndHighR = DEFAULT_WIRES.map((w, idx) => {
      if (idx === 0) return { ...w, isCut: true };
      if (w.id === 'wire-2') return { ...w, resistance: 120 };
      return w;
    });

    const solution = solveCircuit(
      PSU_ON,
      DEFAULT_ECU_PINS,
      [],
      wiresWithCutAndHighR,
      DEFAULT_BENCH_COMPONENTS,
      DEFAULT_DMM
    );

    const overview = buildWireOverviewMap({
      pins: DEFAULT_ECU_PINS,
      components: DEFAULT_BENCH_COMPONENTS,
      wires: wiresWithCutAndHighR,
      nodeVoltages: solution.nodeVoltages,
      wireCurrentsMa: solution.wireCurrentsMa,
      isPowerOn: true,
    });

    assert.equal(overview.summary.totalWires, wiresWithCutAndHighR.length);
    assert.equal(overview.summary.cutWires, 1);
    assert.equal(overview.summary.activeWires, wiresWithCutAndHighR.length - 1);
    assert.ok(overview.summary.highResistanceWires >= 1);

    const activeOnly = filterWireOverviewEntries({
      entries: overview.entries,
      query: '',
      filterMode: 'ACTIVE',
    });
    assert.equal(activeOnly.length, overview.summary.activeWires);
    assert.ok(activeOnly.every((e) => e.isActive && !e.isCut));

    const searchByPinId = filterWireOverviewEntries({
      entries: overview.entries,
      query: 'ecu-pin-7',
      filterMode: 'ACTIVE',
    });
    assert.ok(searchByPinId.some((e) => e.sourcePinId === 'ecu-pin-7' || e.targetPinId === 'ecu-pin-7'));

    const searchByResistance = filterWireOverviewEntries({
      entries: overview.entries,
      query: '120.0 Ω',
      filterMode: 'ACTIVE',
    });
    assert.ok(searchByResistance.some((e) => e.wireId === 'wire-2' && e.isHighResistance));

    const sortedByRDesc = filterWireOverviewEntries({
      entries: overview.entries,
      query: '',
      filterMode: 'ACTIVE',
      sortMode: 'RESISTANCE_DESC',
    });
    assert.equal(sortedByRDesc[0]?.wireId, 'wire-2');
  });

  // 10. EMS Digital Twin Profile Sync defaults to 4-Cyl Gasoline EFI and adapts to selected OEM ECU models
  runTest('10. resolveEmsEcuSyncProfile defaults to EMS-32-801 4-Cyl EFI and syncs OEM Diesel CRDi ECU', () => {
    const defaultProfile = resolveEmsEcuSyncProfile(null, null, DEFAULT_ECU_PINS);
    assert.equal(defaultProfile.modelCode, 'EMS-32-801');
    assert.equal(defaultProfile.powertrainMode, 'GASOLINE_EFI');
    assert.deepEqual([...defaultProfile.firingOrder], [1, 3, 4, 2]);
    assert.equal(defaultProfile.isDefaultUniversalEfi, true);

    const mitsCtx = getSelectedVehicleContext(
      'mitsubishi',
      'Montero Sport (4N15 2.4L MIVEC)',
      'mitsubishi-denso-diesel'
    );
    const mitsProfile = resolveEmsEcuSyncProfile(mitsCtx, 'mitsubishi-denso-diesel', DEFAULT_ECU_PINS);
    assert.equal(mitsProfile.isDefaultUniversalEfi, false);
    assert.equal(mitsProfile.powertrainMode, 'DIESEL_CRDI');
    assert.ok(mitsProfile.oemPinMapping.kl30.includes('101'));
    assert.ok(mitsProfile.oemPinMapping.mainRelayCtrl.includes('118'));
  });

  // 11. EMS Digital Twin Telemetry reflects live MNA voltages, 5 blade fuses, dual relays, fuel pressure & ground offset
  runTest('11. evaluateEmsDigitalTwinState tracks fuses, Main/FP relays, fuel pump, OCP trip & SGND fault', () => {
    const profile = resolveEmsEcuSyncProfile(null, null, DEFAULT_ECU_PINS);
    const sol = solveCircuit(
      PSU_ON,
      DEFAULT_ECU_PINS,
      [],
      DEFAULT_WIRES,
      DEFAULT_BENCH_COMPONENTS,
      DEFAULT_DMM
    );
    const runningState = evaluateEmsDigitalTwinState({
      profile,
      powerSupply: PSU_ON,
      nodeVoltages: sol.nodeVoltages,
      wireCurrentsMa: sol.wireCurrentsMa,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: [],
      wires: DEFAULT_WIRES,
      rpm: 2200,
      isRpmRunning: true,
      ckpSignalLost: false,
      supplyCurrentDrawAmps: sol.supplyCurrentDrawAmps,
      isSupplyCurrentTripped: sol.isSupplyCurrentTripped,
    });

    assert.equal(runningState.isPowerActive, true);
    assert.equal(runningState.mainRelay.isLatched, true);
    assert.equal(runningState.fuelPumpRelay.isLatched, true);
    assert.equal(runningState.fuelSystem.isPumpRunning, true);
    assert.ok(runningState.fuelSystem.railPressureBar >= 3.0);
    assert.equal(runningState.fuses.length, 5);
    assert.ok(runningState.fuses.every((f) => f.isEnergized && !f.isBlown));
    assert.equal(runningState.grounds.hasGroundFault, false);

    // Inject short-to-ground on injector pin 10 & SGND lift fault -> 20A INJ fuse blows and ground fault flags
    const shortFaults: InjectedFault[] = [
      { pinId: 'ecu-pin-10', faultType: 'SHORT_TO_GND', description: 'INJ short to GND', timestamp: 1 },
      { pinId: 'ecu-pin-6', faultType: 'HIGH_RESISTANCE_1K', description: 'SGND ground lift', timestamp: 2 },
    ];
    const faultedState = evaluateEmsDigitalTwinState({
      profile,
      powerSupply: PSU_ON,
      nodeVoltages: { ...sol.nodeVoltages, 'ecu-pin-6': 0.45 },
      wireCurrentsMa: sol.wireCurrentsMa,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: shortFaults,
      wires: DEFAULT_WIRES,
      rpm: 2200,
      isRpmRunning: true,
      ckpSignalLost: false,
    });

    const injFuse = faultedState.fuses.find((f) => f.id === 'fuse-inj-20a');
    assert.equal(injFuse?.isBlown, true);
    assert.equal(faultedState.grounds.hasGroundFault, true);
    assert.ok(faultedState.grounds.groundOffsetMv >= 400);
  });

  // 12. Sequential 1-3-4-2 Firing Phase pulses injectors & spark arcs in Gasoline EFI and suppresses spark in Diesel CRDi
  runTest('12. evaluateSequentialFiringPhase sequences 1-3-4-2 and halts cleanly when engine stopped', () => {
    const profile = resolveEmsEcuSyncProfile(null, null, DEFAULT_ECU_PINS);
    const sol = solveCircuit(
      PSU_ON,
      DEFAULT_ECU_PINS,
      [],
      DEFAULT_WIRES,
      DEFAULT_BENCH_COMPONENTS,
      DEFAULT_DMM
    );
    const ems = evaluateEmsDigitalTwinState({
      profile,
      powerSupply: PSU_ON,
      nodeVoltages: sol.nodeVoltages,
      wireCurrentsMa: sol.wireCurrentsMa,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: [],
      wires: DEFAULT_WIRES,
      rpm: 1500,
      isRpmRunning: true,
      ckpSignalLost: false,
    });

    const stopped = evaluateSequentialFiringPhase({
      elapsedSec: 0.2,
      rpm: 0,
      isEngineRunning: false,
      powertrainMode: 'GASOLINE_EFI',
      cylinders: ems.cylinders,
    });
    assert.ok(stopped.every((p) => p.injectorPulse === 0 && p.sparkArc === 0));

    let sawCyl1Inj = false;
    let sawCyl3Spark = false;
    let sawDieselSpark = false;
    for (let step = 0; step < 40; step++) {
      const t = step * 0.025;
      const gas = evaluateSequentialFiringPhase({
        elapsedSec: t,
        rpm: 1800,
        isEngineRunning: true,
        powertrainMode: 'GASOLINE_EFI',
        cylinders: ems.cylinders,
      });
      if (gas[0].injectorPulse > 0.2) sawCyl1Inj = true;
      if (gas[2].sparkArc > 0.1) sawCyl3Spark = true;

      const diesel = evaluateSequentialFiringPhase({
        elapsedSec: t,
        rpm: 1800,
        isEngineRunning: true,
        powertrainMode: 'DIESEL_CRDI',
        cylinders: ems.cylinders,
      });
      if (diesel.some((d) => d.sparkArc > 0)) sawDieselSpark = true;
    }
    assert.equal(sawCyl1Inj, true);
    assert.equal(sawCyl3Spark, true);
    assert.equal(sawDieselSpark, false);
  });

  // 13. LabStatusFooter Twin Sync Status accurately reports LIVE, STANDBY, CAN DEGRADED, COMM FAULT, and OCP TRIP
  runTest('13. describeTwinSyncStatus reflects live MNA streaming, standby, OCP trip, and CAN comm faults', () => {
    const solOn = solveCircuit(
      PSU_ON,
      DEFAULT_ECU_PINS,
      [],
      DEFAULT_WIRES,
      DEFAULT_BENCH_COMPONENTS,
      DEFAULT_DMM
    );
    const live = describeTwinSyncStatus({
      powerSupply: PSU_ON,
      circuitSolution: solOn,
      wires: DEFAULT_WIRES,
      faults: [],
      hasCanFault: false,
    });
    assert.equal(live.tone, 'LIVE_SYNC');
    assert.equal(live.isReceivingLiveData, true);
    assert.equal(live.hasCommFault, false);

    const solOff = solveCircuit(
      PSU_OFF,
      DEFAULT_ECU_PINS,
      [],
      DEFAULT_WIRES,
      DEFAULT_BENCH_COMPONENTS,
      DEFAULT_DMM
    );
    const standby = describeTwinSyncStatus({
      powerSupply: PSU_OFF,
      circuitSolution: solOff,
      wires: DEFAULT_WIRES,
      faults: [],
      hasCanFault: false,
    });
    assert.equal(standby.tone, 'STANDBY');
    assert.equal(standby.isReceivingLiveData, false);
    assert.equal(standby.hasCommFault, false);

    const degraded = describeTwinSyncStatus({
      powerSupply: PSU_ON,
      circuitSolution: solOn,
      wires: DEFAULT_WIRES,
      faults: [
        { pinId: 'ecu-pin-13', faultType: 'HIGH_RESISTANCE_1K', description: 'CAN_H high-R', timestamp: 1 },
      ],
      hasCanFault: true,
    });
    assert.equal(degraded.tone, 'COMM_DEGRADED');
    assert.equal(degraded.hasCommFault, true);
    assert.equal(degraded.isReceivingLiveData, true);

    const busOff = describeTwinSyncStatus({
      powerSupply: PSU_ON,
      circuitSolution: solOn,
      wires: DEFAULT_WIRES.map((w) => (w.id === 'wire-10' ? { ...w, isCut: true } : w)),
      faults: [],
      hasCanFault: true,
    });
    assert.equal(busOff.tone, 'COMM_FAULT');
    assert.equal(busOff.hasCommFault, true);

    const ocp = describeTwinSyncStatus({
      powerSupply: PSU_ON,
      circuitSolution: { ...solOn, isSupplyCurrentTripped: true },
      wires: DEFAULT_WIRES,
      faults: [],
      hasCanFault: false,
    });
    assert.equal(ocp.tone, 'OCP_TRIPPED');
    assert.equal(ocp.isReceivingLiveData, false);

    const manualClean = describeTwinSyncStatus({
      powerSupply: PSU_ON,
      circuitSolution: solOn,
      wires: DEFAULT_WIRES,
      faults: [],
      hasCanFault: false,
      syncMode: 'MANUAL_REVIEW',
    });
    assert.equal(manualClean.tone, 'MANUAL_REVIEW');
    assert.equal(manualClean.isReceivingLiveData, false);
    assert.equal(manualClean.hasCommFault, false);
    assert.equal(manualClean.label, '3D Sync: MANUAL');

    const manualWithCommFault = describeTwinSyncStatus({
      powerSupply: PSU_ON,
      circuitSolution: solOn,
      wires: DEFAULT_WIRES.map((w) => (w.id === 'wire-10' ? { ...w, isCut: true } : w)),
      faults: [],
      hasCanFault: true,
      syncMode: 'MANUAL_REVIEW',
    });
    assert.equal(manualWithCommFault.tone, 'MANUAL_REVIEW');
    assert.equal(manualWithCommFault.isReceivingLiveData, false);
    assert.equal(manualWithCommFault.hasCommFault, true);
    assert.equal(manualWithCommFault.label, '3D Sync: MANUAL (COMM!)');
  });

  // 14. 3D Engine Block Wire-Mesh Fault Overlay classifies healthy, injector open/cut, coil short, sensor bus & ground lift
  runTest('14. deriveEngineBlockFaultOverlay maps MNA injector open, coil short, sensor, ground lift & OCP faults', () => {
    const profile = resolveEmsEcuSyncProfile(null, null, DEFAULT_ECU_PINS);
    const solOk = solveCircuit(
      PSU_ON,
      DEFAULT_ECU_PINS,
      [],
      DEFAULT_WIRES,
      DEFAULT_BENCH_COMPONENTS,
      DEFAULT_DMM
    );
    const emsOk = evaluateEmsDigitalTwinState({
      profile,
      powerSupply: PSU_ON,
      nodeVoltages: solOk.nodeVoltages,
      wireCurrentsMa: solOk.wireCurrentsMa,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: [],
      wires: DEFAULT_WIRES,
      rpm: 1600,
      isRpmRunning: true,
      ckpSignalLost: false,
    });

    const normalOverlay = deriveEngineBlockFaultOverlay({
      faults: [],
      wires: DEFAULT_WIRES,
      emsState: emsOk,
    });
    assert.equal(normalOverlay.overallSeverity, 'NORMAL');
    assert.equal(normalOverlay.hasActiveFault, false);
    assert.equal(normalOverlay.injectors[0].status, 'OK');
    assert.equal(normalOverlay.coils[0].status, 'OK');
    assert.equal(normalOverlay.sensorBus.status, 'OK');
    assert.equal(normalOverlay.groundStrap.status, 'OK');

    // Injector #1 Open Circuit + Cut wire -> WARNING severity, Cylinder 1 injector OPEN
    const injOpenFaults: InjectedFault[] = [
      { pinId: 'ecu-pin-10', faultType: 'OPEN_CIRCUIT', description: 'INJ #1 open circuit', timestamp: 10 },
    ];
    const injOpenOverlay = deriveEngineBlockFaultOverlay({
      faults: injOpenFaults,
      wires: DEFAULT_WIRES,
      emsState: emsOk,
    });
    assert.equal(injOpenOverlay.overallSeverity, 'WARNING');
    assert.equal(injOpenOverlay.hasActiveFault, true);
    assert.equal(injOpenOverlay.injectors[0].status, 'OPEN');
    assert.equal(injOpenOverlay.injectors[1].status, 'OK');
    assert.ok(injOpenOverlay.activeFaultLabels.some((l) => l.includes('INJ #1')));

    // Ignition Coil #1 Short-to-Ground -> CRITICAL severity, Cyl 1 SHORT, Cyl 2-4 FAULT (15A COIL fuse blown)
    const coilShortFaults: InjectedFault[] = [
      { pinId: 'ecu-pin-11', faultType: 'SHORT_TO_GND', description: 'COIL #1 short to ground', timestamp: 11 },
    ];
    const coilShortOverlay = deriveEngineBlockFaultOverlay({
      faults: coilShortFaults,
      wires: DEFAULT_WIRES,
      emsState: emsOk,
    });
    assert.equal(coilShortOverlay.overallSeverity, 'CRITICAL');
    assert.equal(coilShortOverlay.coils[0].status, 'SHORT');
    assert.equal(coilShortOverlay.coils[1].status, 'FAULT');
    assert.ok(coilShortOverlay.activeFaultLabels.includes('15A COIL FUSE BLOWN'));

    // Sensor bus CKP dropout + SGND lift -> flags sensorBus and groundStrap cleanly
    const emsGndLift = evaluateEmsDigitalTwinState({
      profile,
      powerSupply: PSU_ON,
      nodeVoltages: { ...solOk.nodeVoltages, 'ecu-pin-6': 0.52 },
      wireCurrentsMa: solOk.wireCurrentsMa,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: [],
      wires: DEFAULT_WIRES,
      rpm: 0,
      isRpmRunning: false,
      ckpSignalLost: true,
    });
    const sensorGndOverlay = deriveEngineBlockFaultOverlay({
      faults: [],
      wires: DEFAULT_WIRES,
      emsState: emsGndLift,
      ckpSignalLost: true,
    });
    assert.equal(sensorGndOverlay.sensorBus.status, 'OPEN');
    assert.equal(sensorGndOverlay.groundStrap.status, 'HIGH_R');
    assert.ok(sensorGndOverlay.activeFaultLabels.includes('CKP NO SIGNAL'));

    // Sensor signals helper extracts live voltages when PSU ON and zeros cleanly when PSU OFF
    const liveSensors = extractEmsSensorSignals({
      nodeVoltages: solOk.nodeVoltages,
      components: DEFAULT_BENCH_COMPONENTS,
      emsState: emsOk,
    });
    assert.ok(liveSensors.vrefVoltageV >= 4.5);
    assert.ok(liveSensors.tpsVoltageV > 0.2);
    assert.equal(liveSensors.ckpActive, true);

    const emsOff = evaluateEmsDigitalTwinState({
      profile,
      powerSupply: PSU_OFF,
      nodeVoltages: {},
      wireCurrentsMa: {},
      components: DEFAULT_BENCH_COMPONENTS,
      faults: [],
      wires: DEFAULT_WIRES,
      rpm: 0,
      isRpmRunning: false,
      ckpSignalLost: false,
    });
    const offSensors = extractEmsSensorSignals({
      nodeVoltages: solOk.nodeVoltages,
      components: DEFAULT_BENCH_COMPONENTS,
      emsState: emsOff,
    });
    assert.equal(offSensors.tpsVoltageV, 0);
    assert.equal(offSensors.vrefVoltageV, 0);
    assert.equal(offSensors.ckpActive, false);
  });

  // 16. CHK-01 & CHK-02 Functional Color-Coding Standard, EMI Corridor Separation & Orthogonal Trunk Routing
  runTest('16. EFI Functional Color Standard, EMI trunk corridors & orthogonal 90-degree routing', () => {
    assert.equal(EFI_FUNCTIONAL_COLOR_STANDARD.CONSTANT_POWER_KL30.standardColorName, 'Red');
    assert.equal(EFI_FUNCTIONAL_COLOR_STANDARD.SWITCHED_IGNITION_KL15.standardColorName, 'Yellow / Orange');
    assert.equal(EFI_FUNCTIONAL_COLOR_STANDARD.CHASSIS_ECU_GROUND.standardColorName, 'Black / Brown');
    assert.equal(EFI_FUNCTIONAL_COLOR_STANDARD.SENSOR_VREF_5V.standardColorName, 'Gray / Blue');
    assert.equal(EFI_FUNCTIONAL_COLOR_STANDARD.ACTUATOR_DRIVERS.standardColorName, 'Green / Violet');
    assert.equal(EFI_FUNCTIONAL_COLOR_STANDARD.CAN_BUS_COMMS.standardColorName, 'Twisted Pair (Tan/Wht)');

    // Verify EMI physical Z-corridor separation between Power, Actuator, Ground, and Sensor/CAN spines
    const powerZ = EFI_TRUNK_CORRIDORS.POWER_TRUNK.spineZ;
    const sensorZ = EFI_TRUNK_CORRIDORS.SENSOR_CAN_SPINE.spineZ;
    const actuatorZ = EFI_TRUNK_CORRIDORS.ACTUATOR_SPINE.spineZ;
    const groundZ = EFI_TRUNK_CORRIDORS.GROUND_BUS.spineZ;
    assert.ok(Math.abs(powerZ - sensorZ) >= 2.0, 'Power trunk must stay physically separated from low-noise sensor spine');
    assert.ok(Math.abs(actuatorZ - sensorZ) >= 2.0, 'High-noise actuator spine must stay separated from sensor/CAN spine');
    assert.ok(Math.abs(groundZ - powerZ) >= 0.8, 'Ground bus has its own dedicated corridor');

    assert.equal(classifyPinCircuitGroup('ecu-pin-3', 'VBAT'), 'CONSTANT_POWER_KL30');
    assert.equal(classifyPinCircuitGroup('ecu-pin-4', 'IGN_SW'), 'SWITCHED_IGNITION_KL15');
    assert.equal(classifyPinCircuitGroup('ecu-pin-6', 'SGND'), 'CHASSIS_ECU_GROUND');
    assert.equal(classifyPinCircuitGroup('ecu-pin-7', 'TPS_SIG'), 'SENSOR_VREF_5V');
    assert.equal(classifyPinCircuitGroup('ecu-pin-10', 'INJ_1'), 'ACTUATOR_DRIVERS');
    assert.equal(classifyPinCircuitGroup('ecu-pin-13', 'CAN_H'), 'CAN_BUS_COMMS');

    // Orthogonal trunk routing produces structured trunk waypoints sharing exact trunkZ without direct diagonal jump
    const pts = buildOrthogonalTrunkWaypoints(
      { x: -1.4, y: 0.7, z: 1.9 },
      { x: 2.2, y: 0.9, z: -2.6 },
      'ACTUATOR_SPINE',
      0
    );
    assert.ok(pts.length >= 5);
    const trunkPts = pts.filter((p) => Math.abs(p.z - actuatorZ) < 0.01);
    assert.ok(trunkPts.length >= 2, 'Route must run parallel along orthogonal trunk spine');
  });

  // 17. CHK-02/CHK-03 Standardized Connection Point Tags synchronized with Universal & OEM ECU Pinouts
  runTest('17. formatStandardConnectionTag generates [CONN-ID]:[PIN] | [SIGNAL] | [COLOR/GAUGE] with OEM sync', () => {
    const universalProfile = resolveEmsEcuSyncProfile(null, null, DEFAULT_ECU_PINS);
    const tpsTag = formatStandardConnectionTag('ecu-pin-7', DEFAULT_ECU_PINS, universalProfile);
    assert.match(tpsTag.formattedTag, /^ECU-A:07 \| .+ \| (GRY|BLU) 0\.5mm²$/);

    const kl30Tag = formatStandardConnectionTag('ecu-pin-3', DEFAULT_ECU_PINS, universalProfile);
    assert.match(kl30Tag.formattedTag, /^ECU-A:03 \| .+ \| RED 2\.5mm²$/);

    const canTag = formatStandardConnectionTag('ecu-pin-13', DEFAULT_ECU_PINS, universalProfile);
    assert.match(canTag.formattedTag, /^ECU-B:13 \| .+ \| TAN 0\.35mm²$/);

    // OEM Mitsubishi Denso sync overrides pin code dynamically
    const mitsCtx = getSelectedVehicleContext(
      'mitsubishi',
      'Montero Sport (4N15 2.4L MIVEC)',
      'mitsubishi-denso-diesel'
    );
    const mitsProfile = resolveEmsEcuSyncProfile(mitsCtx, 'mitsubishi-denso-diesel', DEFAULT_ECU_PINS);
    const oemKl30Tag = formatStandardConnectionTag('ecu-pin-3', DEFAULT_ECU_PINS, mitsProfile);
    assert.ok(oemKl30Tag.formattedTag.includes('101'), `Expected OEM pin 101 in ${oemKl30Tag.formattedTag}`);
    assert.ok(oemKl30Tag.formattedTag.includes('RED 2.5mm²'));
  });

  // 18. Procedural EMS Acoustic Physics & Bilingual Hands-Free 3D/Audio/Tour Voice Command Parser
  runTest('18. deriveEmsAcousticParams & parseThreeDVoiceCommand handle RPM acoustics, misfire & bilingual control', () => {
    const profile = resolveEmsEcuSyncProfile(null, null, DEFAULT_ECU_PINS);
    const sol = solveCircuit(
      PSU_ON,
      DEFAULT_ECU_PINS,
      [],
      DEFAULT_WIRES,
      DEFAULT_BENCH_COMPONENTS,
      DEFAULT_DMM
    );
    const runningState = evaluateEmsDigitalTwinState({
      profile,
      powerSupply: PSU_ON,
      nodeVoltages: sol.nodeVoltages,
      wireCurrentsMa: sol.wireCurrentsMa,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: [],
      wires: DEFAULT_WIRES,
      rpm: 2400,
      isRpmRunning: true,
      ckpSignalLost: false,
    });
    const acoustics = deriveEmsAcousticParams(runningState);
    assert.equal(acoustics.isEngineRunning, true);
    assert.equal(acoustics.firingHz, 80); // 2400 RPM / 30 = 80 Hz for 4-cyl 4-stroke
    assert.equal(acoustics.misfireSeverity, 0);
    assert.equal(acoustics.fuelPumpRunning, true);
    assert.ok(acoustics.fuelPumpGain > 0);

    // Short-to-ground on injector triggers misfire & short-circuit arc flag
    const faultedState = evaluateEmsDigitalTwinState({
      profile,
      powerSupply: PSU_ON,
      nodeVoltages: sol.nodeVoltages,
      wireCurrentsMa: sol.wireCurrentsMa,
      components: DEFAULT_BENCH_COMPONENTS,
      faults: [{ pinId: 'ecu-pin-10', faultType: 'SHORT_TO_GND', description: 'INJ short', timestamp: 1 }],
      wires: DEFAULT_WIRES,
      rpm: 1200,
      isRpmRunning: true,
      ckpSignalLost: false,
    });
    const faultAcoustics = deriveEmsAcousticParams(faultedState);
    assert.ok(faultAcoustics.misfireSeverity > 0);
    assert.equal(faultAcoustics.hasShortOrOcpFault, true);

    // Bilingual EN & TL hands-free 3D/Audio/Tour command parsing
    assert.equal(parseThreeDVoiceCommand('Start guided tour')?.action.type, 'START_GUIDED_TOUR');
    assert.equal(parseThreeDVoiceCommand('Ipakita ang engine block')?.action.type, 'SHOW_ENGINE_BLOCK');
    assert.equal(parseThreeDVoiceCommand('Buksan ang tunog')?.action.type, 'SET_AUDIO');
    assert.equal(parseThreeDVoiceCommand('Turn ignition on')?.action.type, 'SET_IGNITION');
    assert.equal(parseThreeDVoiceCommand('Explode ECU')?.action.type, 'SET_EXPLODE');
    assert.equal(parseThreeDVoiceCommand('Filter grounds')?.action.type, 'SET_CIRCUIT_LAYER');
    assert.equal(parseThreeDVoiceCommand('What causes high fuel trim on P0171?'), null);
  });

  console.log(`\nHarness & 3D Twin Suite: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
