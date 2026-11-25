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
import {
  UNIVERSITY_LAB_MODULES,
  evaluateUniversityLabStep,
} from '../../data/universityLabCurriculum';
import { STANDARD_ECU_BENCH_PIN_SPECS } from '../diagnostics/physicalBenchFaultIsolationEngine';
import type { MultimeterState, PowerSupplyState } from '../../types/ecu';

let passed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function makeMultimeter(
  mode: MultimeterState['mode'],
  redPinId: string,
  blackPinId: string
): MultimeterState {
  return {
    isPowered: true,
    mode,
    redProbe: { attachedToPinId: redPinId, attachedLabel: redPinId },
    blackProbe: { attachedToPinId: blackPinId, attachedLabel: blackPinId },
    holdValue: false,
    rangeAuto: true,
  };
}

runTest('All 16 DEFAULT_ECU_PINS nominal voltages stay within <= 0.12V of live healthy MNA defaults', () => {
  const psu: PowerSupplyState = {
    isOutputEnabled: true,
    voltageSetting: 12.6,
    currentLimit: 3.0,
    preset: '12V_BENCH',
  };
  const sol = solveCircuit(
    psu,
    DEFAULT_ECU_PINS,
    [],
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    makeMultimeter('V_DC', 'ecu-pin-3', 'ecu-pin-1')
  );

  for (const pin of DEFAULT_ECU_PINS) {
    const live = sol.nodeVoltages[pin.id];
    assert.equal(Number.isFinite(live), true, `Pin ${pin.pinNumber} (${pin.label}) voltage must be finite`);
    const delta = Math.abs(live - pin.nominalVoltage);
    assert.ok(
      delta <= 0.12,
      `Pin ${pin.pinNumber} (${pin.label}) uncalibrated: nominal=${pin.nominalVoltage}V, live=${live.toFixed(3)}V (delta=${delta.toFixed(3)}V)`
    );
  }
});

runTest('Cold PSU-OFF resistance checks confirm CAN 60Ω, KL30 (Pin 3) healthy load, and KL31_2 (Pin 2) ground continuity', () => {
  const psuOff: PowerSupplyState = {
    isOutputEnabled: false,
    voltageSetting: 12.6,
    currentLimit: 3.0,
    preset: '12V_BENCH',
  };

  const canSol = solveCircuit(
    psuOff,
    DEFAULT_ECU_PINS,
    [],
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    makeMultimeter('RESISTANCE', 'ecu-pin-13', 'ecu-pin-14')
  );
  assert.ok(
    canSol.multimeterReading.value >= 55 && canSol.multimeterReading.value <= 65,
    `Expected CAN_H->CAN_L cold resistance ~60Ω, got ${canSol.multimeterReading.value}`
  );

  const kl30Sol = solveCircuit(
    psuOff,
    DEFAULT_ECU_PINS,
    [],
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    makeMultimeter('RESISTANCE', 'ecu-pin-3', 'ecu-pin-1')
  );
  assert.ok(
    kl30Sol.multimeterReading.value > 20,
    `Expected healthy KL30 (Pin 3) to KL31 (Pin 1) resistance > 20Ω, got ${kl30Sol.multimeterReading.value}`
  );

  const kl31DualSol = solveCircuit(
    psuOff,
    DEFAULT_ECU_PINS,
    [],
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    makeMultimeter('RESISTANCE', 'ecu-pin-2', 'ecu-pin-1')
  );
  assert.ok(
    kl31DualSol.multimeterReading.value < 1.0,
    `Expected KL31_2 (Pin 2) to KL31 (Pin 1) ground continuity < 1Ω, got ${kl31DualSol.multimeterReading.value}`
  );
});

runTest('All 12 University Lab modules and every diagnostic step pass live MNA calibration', () => {
  assert.equal(UNIVERSITY_LAB_MODULES.length, 12);
  let totalSteps = 0;

  for (const mod of UNIVERSITY_LAB_MODULES) {
    const cutSet = new Set(mod.wiresToCut ?? []);
    const wires = DEFAULT_WIRES.map((w) => ({ ...w, isCut: cutSet.has(w.id) }));
    const overrideMap = new Map(
      (mod.componentOverrides ?? []).map((entry) => [entry.componentId, entry.state])
    );
    const components = DEFAULT_BENCH_COMPONENTS.map((comp) =>
      overrideMap.has(comp.id)
        ? { ...comp, state: { ...comp.state, ...overrideMap.get(comp.id) } }
        : comp
    );
    const faults = mod.faultsToInject.map((f, idx) => ({
      pinId: f.pinId,
      faultType: f.faultType,
      description: f.description,
      timestamp: 1_700_000_000_000 + idx,
    }));

    for (const step of mod.steps) {
      totalSteps += 1;
      const psu: PowerSupplyState = {
        isOutputEnabled: step.requiredPsuState === 'ON',
        voltageSetting: mod.psuOverride?.voltageSetting ?? 12.6,
        currentLimit: 3.0,
        preset: '12V_BENCH',
      };
      const dmm = makeMultimeter(
        step.requiredDmmMode,
        step.redProbeTargets[0],
        step.blackProbeTargets[0]
      );
      const injComp = components.find((c) => c.id === 'comp-inj');
      const isInjectorFiring = Boolean(injComp?.state?.isFiring ?? true);
      const sol = solveCircuit(psu, DEFAULT_ECU_PINS, faults, wires, components, dmm, {
        rpm: mod.rpmOverride?.isActive ? mod.rpmOverride.rpm : 850,
        isInjectorFiring,
        camPhaseOffsetDeg: mod.rpmOverride?.camPhaseOffsetDeg ?? 0,
        ckpSignalLost: Boolean(mod.rpmOverride?.ckpSignalLost),
      });
      const evalResult = evaluateUniversityLabStep(step, {
        powerSupply: psu,
        multimeter: dmm,
        multimeterReading: sol.multimeterReading,
        nodeVoltages: sol.nodeVoltages,
        faults,
        wires,
      });

      const expectedStatus =
        step.stepKind === 'FAULT_CONFIRMATION' ? 'FAULT_CONFIRMED' : 'PASSED';
      assert.equal(
        evalResult.status,
        expectedStatus,
        `${mod.id} Step ${step.stepNumber} (${step.id}) expected ${expectedStatus}, got ${evalResult.status} (reading=${evalResult.liveDisplay} ${evalResult.liveUnit})`
      );
    }
  }

  assert.equal(totalSteps, 28, 'Expected 28 calibrated steps across 12 University Lab modules');
});

runTest('Zero miscalibrated KL30 (Pin 2) instructions remain in AI engine or Floating Help Drawer', () => {
  const files = [
    path.resolve('src/services/ai/offlineEngine.ts'),
    path.resolve('src/components/help/FloatingHelpDrawer.tsx'),
  ];
  const badPattern = /KL30\s*\(Pin 2\)|Pin 2\s*\(KL30\)/i;
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(
      badPattern.test(content),
      false,
      `Found miscalibrated KL30 Pin 2 reference in ${path.basename(filePath)}`
    );
  }
});

runTest('STANDARD_ECU_BENCH_PIN_SPECS labels eliminate conflicting/fabricated pin numbers and distinguish Trainer vs OBD-II DLC pins', () => {
  const forbidden = [
    'Pin 1 / KL30',
    'Pin 2 / KL15',
    'Pin 3 / KL31',
    'Pin 14 / VREF_5V',
    'Pin 21 / TPS_SIG',
    'Pin 24 / ECT_SIG',
    'Pin 45 / INJ_1',
  ];
  for (const spec of STANDARD_ECU_BENCH_PIN_SPECS) {
    for (const bad of forbidden) {
      assert.equal(
        spec.pinLabel.includes(bad),
        false,
        `Found conflicting/fabricated pin prefix "${bad}" in ${spec.pinId}`
      );
    }
  }
  const canH = STANDARD_ECU_BENCH_PIN_SPECS.find((s) => s.pinId === 'CAN_H');
  assert.ok(canH?.pinLabel.includes('Trainer Pin 13'));
  assert.ok(canH?.pinLabel.includes('OBD-II DLC Pin 6'));
});

runTest('App.tsx & LabWorkspaceLayout.tsx wire Academy Lab full launch sync and /api/admin/generate-license runs auth before JSON parsing', () => {
  const appSrc = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  const layoutSrc = fs.readFileSync(path.resolve('src/components/LabWorkspaceLayout.tsx'), 'utf8');
  const serverSrc = fs.readFileSync(path.resolve('src/server/createApiApp.ts'), 'utf8');

  assert.ok(appSrc.includes('academyLaunchRequest={academyLaunchRequest}'));
  assert.ok(appSrc.includes('onActiveUniversityModuleChange={setActiveAcademyModuleId}'));
  assert.ok(layoutSrc.includes('handleStartUniversityModule(targetModule)'));

  const routeIdx = serverSrc.indexOf("'/api/admin/generate-license'");
  assert.ok(routeIdx > 0);
  const routeSlice = serverSrc.slice(routeIdx, routeIdx + 140);
  assert.ok(
    routeSlice.indexOf('requireBillingMasterAdmin') < routeSlice.indexOf('smallJsonParser'),
    '/api/admin/generate-license must run requireBillingMasterAdmin before smallJsonParser'
  );
});

if (!process.exitCode) {
  console.log(`\nALL CALIBRATION & AUDIT REGRESSION TESTS PASSED (${passed}/${passed})`);
}
