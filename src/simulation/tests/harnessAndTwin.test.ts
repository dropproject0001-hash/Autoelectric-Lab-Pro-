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
import type { RpmEmulatorState } from '../../utils/vehicleEcuRegistry';

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

  console.log(`\nHarness & 3D Twin Suite: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
