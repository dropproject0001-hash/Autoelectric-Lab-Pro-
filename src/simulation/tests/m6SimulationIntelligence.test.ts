/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateSimulationGuidedDiagnostic } from '../../services/ai/simulationIntelligenceService';
import { inspectBenchHardwareAbstractionStatus } from '../../services/benchHardwareAbstractionLayer';
import {
  DEFAULT_BENCH_COMPONENTS,
  DEFAULT_ECU_PINS,
  DEFAULT_WIRES,
  solveCircuit,
} from '../../utils/circuitSolver';
import type { InjectedFault, MultimeterState, PowerSupplyState } from '../../types/ecu';

async function runM6SimulationIntelligenceTests(): Promise<void> {
  console.log('\n=== M6 SIMULATION INTELLIGENCE, SIMULATED LABELING & VIRTUAL-ONLY GUARD SUITE ===');

  // 1. Virtual-only hardware abstraction status strictly reports SOFTWARE_SIMULATION_ONLY
  const hal = inspectBenchHardwareAbstractionStatus();
  assert.equal(hal.mode, 'SOFTWARE_SIMULATION_ONLY');
  assert.equal(hal.isPhysicalHardwareConnected, false);
  assert.equal(hal.measurementOriginLabel, 'SIMULATED_BENCH_VALUE');
  assert.equal(
    hal.transports.every((t) => t.browserApiAvailable === false && t.isConnected === false),
    true,
    'No physical hardware transport may be probed or active'
  );
  console.log('  PASS: 1. Hardware abstraction layer strictly locked to SOFTWARE_SIMULATION_ONLY');

  // 2. All instrument UI components visibly display SIMULATED badges
  const rootDir = process.cwd();
  const instruments = [
    'src/components/DigitalMultimeter.tsx',
    'src/components/BenchPowerSupply.tsx',
    'src/components/PinWaveformOscilloscope.tsx',
    'src/components/Oscilloscope.tsx',
    'src/components/D3OscilloscopeView.tsx',
    'src/components/gauges/LiveGaugeConsole.tsx',
  ];
  for (const rel of instruments) {
    const content = fs.readFileSync(path.join(rootDir, rel), 'utf8');
    assert.ok(content.includes('SIMULATED'), `${rel} must visibly label simulated values as SIMULATED`);
  }
  console.log('  PASS: 2. All 6 bench instrument components visibly display SIMULATED labels');

  // 3. Guidance dynamically changes with selected ECU, component, and injected fault
  const psu: PowerSupplyState = {
    preset: '12V_BENCH',
    voltageSetting: 12.6,
    currentLimit: 2.5,
    isOutputEnabled: true,
  };
  const dmm: MultimeterState = {
    isPowered: true,
    mode: 'V_DC',
    rangeAuto: true,
    holdValue: false,
    redProbe: { attachedToPinId: 'ecu-pin-7', attachedLabel: 'Pin #7 (TPS_SIG)' },
    blackProbe: { attachedToPinId: 'ecu-pin-1', attachedLabel: 'Pin #1 (KL31)' },
  };

  const tpsFault: InjectedFault = {
    pinId: 'ecu-pin-7',
    faultType: 'SHORT_TO_GND',
    description: 'TPS Signal Shorted to Ground',
    timestamp: Date.now(),
  };
  const solvedTps = solveCircuit(psu, DEFAULT_ECU_PINS, [tpsFault], DEFAULT_WIRES, DEFAULT_BENCH_COMPONENTS, dmm);
  const dtcCodes = solvedTps.activeDTCs.map((d) => d.code);
  assert.ok(dtcCodes.some((code) => code.includes('P0122')), 'TPS short to GND must log P0122');

  const tpsGuidance = await generateSimulationGuidedDiagnostic({
    query: 'Analyze current simulated bench fault',
    ecuName: 'Universal 16-Pin Trainer',
    selectedComponent: 'TPS Sensor',
    injectedFaults: [tpsFault],
    activeDtcs: dtcCodes,
    powerSupply: psu,
    multimeter: dmm,
    dmmDisplayValue: solvedTps.multimeterReading.display,
  });

  const canFault: InjectedFault = {
    pinId: 'ecu-pin-14',
    faultType: 'OPEN_CIRCUIT',
    description: 'CAN_H Open Bus Wire',
    timestamp: Date.now(),
  };
  const canGuidance = await generateSimulationGuidedDiagnostic({
    query: 'Analyze current simulated bench fault',
    ecuName: 'Universal 16-Pin Trainer',
    selectedComponent: 'CAN Transceiver',
    injectedFaults: [canFault],
    activeDtcs: ['U0001'],
    powerSupply: psu,
    multimeter: dmm,
    dmmDisplayValue: '2.50 V',
  });

  assert.notEqual(
    tpsGuidance.answer,
    canGuidance.answer,
    'AI guidance must dynamically change when selected component and injected fault change'
  );
  assert.ok(tpsGuidance.answer.includes('TPS Sensor') && tpsGuidance.answer.includes('SHORT_TO_GND'));
  assert.ok(canGuidance.answer.includes('CAN Transceiver') && canGuidance.answer.includes('U0001'));
  assert.ok(tpsGuidance.answer.includes('SIMULATED'));
  console.log('  PASS: 3. Fault injection & context-aware guidance dynamically adapt and carry SIMULATED label');

  // 4. Automated code scan confirms zero physical ECU communication drivers in src/
  const forbiddenApiPatterns = [
    /navigator\.bluetooth\.requestDevice/,
    /navigator\.usb\.requestDevice/,
    /navigator\.serial\.requestPort/,
    /elm327.*connect/i,
  ];
  const scanDir = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'tests') continue;
        scanDir(full);
      } else if (/\.(ts|tsx|js)$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        for (const re of forbiddenApiPatterns) {
          assert.equal(
            re.test(text),
            false,
            `Forbidden physical hardware communication call (${re}) detected in ${full}`
          );
        }
      }
    }
  };
  scanDir(path.join(rootDir, 'src'));
  console.log('  PASS: 4. Source scan confirms zero physical Bluetooth/USB/Serial/ELM327 communication code');

  console.log('\nM6 Simulation Intelligence Suite Summary: 4 passed, 0 failed\n');
}

runM6SimulationIntelligenceTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
