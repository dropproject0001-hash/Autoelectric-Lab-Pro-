/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_BENCH_COMPONENTS,
  DEFAULT_ECU_PINS,
  DEFAULT_WIRES,
  solveCircuit,
  type CircuitSolution,
} from '../../utils/circuitSolver';
import {
  createBenchReconciliationSnapshot,
  diffBenchReconciliationSnapshots,
  formatPinScopeSummary,
  getValidatedPinVoltage,
  isLiveTelemetryTurnIntent,
} from '../../utils/benchStateReconciliation';
import { buildBenchTelemetry } from '../../hooks/useBenchContext';
import { areUnifiedAiDrawerPropsEqual, type UnifiedAiAssistantDrawerProps } from '../../components/ai/UnifiedAiAssistantDrawer';
import {
  clearVoiceInteractionCache,
  isLiveTelemetryQuery,
} from '../../services/ai/voiceInteractionCache';
import {
  clearVerifiedKnowledgeStoreForTests,
} from '../../services/ai/localKnowledgeDB';
import {
  queryAiDiagnosticRouter,
  resetAiRouterStateForTests,
  setAiRouterOnlineTransportForTests,
} from '../../services/ai/aiRouter';
import {
  createInitialVoiceSessionMemory,
  processVoiceCoachTurn,
} from '../../services/ai/localVoiceBrain';
import type { InjectedFault, MultimeterState, PowerSupplyState } from '../../types/ecu';

function makeBasePsu(overrides: Partial<PowerSupplyState> = {}): PowerSupplyState {
  return {
    isOutputEnabled: true,
    voltageSetting: 12.6,
    currentLimit: 5.0,
    preset: '12V_BENCH',
    ...overrides,
  };
}

function makeBaseDmm(overrides: Partial<MultimeterState> = {}): MultimeterState {
  return {
    isPowered: true,
    mode: 'V_DC',
    rangeAuto: true,
    holdValue: false,
    redProbe: {
      attachedToPinId: 'ecu-pin-5',
      attachedLabel: 'VREF_5V (Pin 5)',
    },
    blackProbe: {
      attachedToPinId: 'chassis-gnd',
      attachedLabel: 'Chassis GND (KL31)',
    },
    ...overrides,
  };
}

function makeBaseSolution(overrides: Partial<CircuitSolution> = {}): CircuitSolution {
  return {
    nodeVoltages: {
      'ecu-pin-3': 12.58,
      'ecu-pin-5': 5.0,
      'ecu-pin-7': 1.28,
    },
    validatedNodeVoltages: {
      'ecu-pin-3': 12.58,
      'ecu-pin-5': 5.0,
      'ecu-pin-7': 1.28,
    },
    nodeMeasurementStatuses: {
      'ecu-pin-3': 'VALID',
      'ecu-pin-5': 'VALID',
      'ecu-pin-7': 'VALID',
    },
    unresolvedNodes: [],
    solverStatus: 'VALID',
    solverWarnings: [],
    nodeResistances: {},
    wireCurrentsMa: {},
    supplyCurrentDrawAmps: 0.36,
    isSupplyCurrentTripped: false,
    activeDTCs: [],
    multimeterReading: {
      display: '5.00',
      value: 5.0,
      unit: 'V',
      isOverLimit: false,
      isWarning: false,
      shouldBeep: false,
      evidenceStatus: 'VALID',
      evidenceSource: 'ELECTRICAL_SIMULATION',
    },
    ...overrides,
  };
}

test('getValidatedPinVoltage and formatPinScopeSummary never coerce unresolved or non-finite nodes to 0V', () => {
  const unresolvedSolution = makeBaseSolution({
    nodeVoltages: { 'ecu-pin-5': 0, 'ecu-pin-7': 1.28 },
    validatedNodeVoltages: { 'ecu-pin-5': null, 'ecu-pin-7': 1.28 },
    nodeMeasurementStatuses: { 'ecu-pin-5': 'UNRESOLVED', 'ecu-pin-7': 'VALID' },
    unresolvedNodes: ['ecu-pin-5'],
    solverStatus: 'UNRESOLVED',
  });

  const pin5 = DEFAULT_ECU_PINS.find((p) => p.id === 'ecu-pin-5')!;
  const pin7 = DEFAULT_ECU_PINS.find((p) => p.id === 'ecu-pin-7')!;

  const res5 = getValidatedPinVoltage(unresolvedSolution, 'ecu-pin-5');
  assert.equal(res5.voltage, null);
  assert.equal(res5.status, 'UNRESOLVED');
  assert.equal(formatPinScopeSummary(pin5, unresolvedSolution), '#5 · UNRESOLVED');

  const res7 = getValidatedPinVoltage(unresolvedSolution, 'ecu-pin-7');
  assert.equal(res7.voltage, 1.28);
  assert.equal(res7.status, 'VALID');
  assert.equal(formatPinScopeSummary(pin7, unresolvedSolution), '#7 · 1.28V');

  const nonFiniteSolution = makeBaseSolution({
    solverStatus: 'NON_FINITE',
  });
  const resNonFinite = getValidatedPinVoltage(nonFiniteSolution, 'ecu-pin-7');
  assert.equal(resNonFinite.voltage, null);
  assert.equal(resNonFinite.status, 'NON_FINITE');
  assert.equal(formatPinScopeSummary(pin7, nonFiniteSolution), '#7 · INVALID');
});

test('diffBenchReconciliationSnapshots detects fault type swaps, wire cuts, OCP trips, and downstream MNA changes', () => {
  const psu = makeBasePsu();
  const dmm = makeBaseDmm();
  const faultShort: InjectedFault = {
    pinId: 'ecu-pin-7',
    faultType: 'SHORT_TO_GND',
    description: 'TPS Signal Short to GND',
    timestamp: 1000,
  };
  const faultOpen: InjectedFault = {
    pinId: 'ecu-pin-7',
    faultType: 'OPEN_CIRCUIT',
    description: 'TPS Signal Open Circuit',
    timestamp: 2000,
  };

  const snapShort = createBenchReconciliationSnapshot({
    activeTab: 'BENCH_LAB',
    mobileBenchPane: 'INSTRUMENTS',
    powerSupply: psu,
    multimeter: dmm,
    faults: [faultShort],
    wires: DEFAULT_WIRES,
    selectedPinId: 'ecu-pin-7',
    circuitSolution: makeBaseSolution({
      multimeterReading: {
        display: '0.02',
        value: 0.02,
        unit: 'V',
        isOverLimit: false,
        isWarning: false,
        shouldBeep: false,
      },
    }),
  });

  // Equal faults.length (1 -> 1) but different faultType must NOT be masked
  const snapOpen = createBenchReconciliationSnapshot({
    activeTab: 'BENCH_LAB',
    mobileBenchPane: 'INSTRUMENTS',
    powerSupply: psu,
    multimeter: dmm,
    faults: [faultOpen],
    wires: DEFAULT_WIRES,
    selectedPinId: 'ecu-pin-7',
    circuitSolution: makeBaseSolution({
      multimeterReading: {
        display: '0.00',
        value: 0.0,
        unit: 'V',
        isOverLimit: false,
        isWarning: false,
        shouldBeep: false,
      },
    }),
  });

  const faultSwapDiff = diffBenchReconciliationSnapshots(snapShort, snapOpen);
  assert.equal(faultSwapDiff.changed, true);
  assert.equal(faultSwapDiff.faultChanged, true);
  assert.equal(faultSwapDiff.isSafetyAlert, true);

  // Downstream MNA voltage/DMM update with identical PSU, probes, faults, and wires
  const snapBaseline = createBenchReconciliationSnapshot({
    activeTab: 'BENCH_LAB',
    mobileBenchPane: 'INSTRUMENTS',
    powerSupply: psu,
    multimeter: dmm,
    faults: [],
    wires: DEFAULT_WIRES,
    selectedPinId: 'ecu-pin-7',
    circuitSolution: makeBaseSolution(),
  });
  const snapReadingUpdated = createBenchReconciliationSnapshot({
    activeTab: 'BENCH_LAB',
    mobileBenchPane: 'INSTRUMENTS',
    powerSupply: psu,
    multimeter: dmm,
    faults: [],
    wires: DEFAULT_WIRES,
    selectedPinId: 'ecu-pin-7',
    circuitSolution: makeBaseSolution({
      supplyCurrentDrawAmps: 0.72,
      multimeterReading: {
        display: '4.88',
        value: 4.88,
        unit: 'V',
        isOverLimit: false,
        isWarning: false,
        shouldBeep: false,
      },
    }),
  });
  const mnaDiff = diffBenchReconciliationSnapshots(snapBaseline, snapReadingUpdated);
  assert.equal(mnaDiff.changed, true);
  assert.equal(mnaDiff.readingChanged, true);
  assert.ok(mnaDiff.detail.includes('4.88 V'));

  // Wire cut detection
  const cutWires = DEFAULT_WIRES.map((w, idx) => (idx === 0 ? { ...w, isCut: true } : w));
  const snapWireCut = createBenchReconciliationSnapshot({
    activeTab: 'BENCH_LAB',
    mobileBenchPane: 'INSTRUMENTS',
    powerSupply: psu,
    multimeter: dmm,
    faults: [],
    wires: cutWires,
    selectedPinId: 'ecu-pin-7',
    circuitSolution: makeBaseSolution(),
  });
  const wireDiff = diffBenchReconciliationSnapshots(snapBaseline, snapWireCut);
  assert.equal(wireDiff.changed, true);
  assert.equal(wireDiff.wiringChanged, true);
  assert.equal(wireDiff.isSafetyAlert, true);
});

test('buildBenchTelemetry propagates unresolved solver state and live MNA solveCircuit results', () => {
  const psu = makeBasePsu({ isOutputEnabled: true, voltageSetting: 13.8 });
  const dmm = makeBaseDmm();
  const realSolution = solveCircuit(
    psu,
    DEFAULT_ECU_PINS,
    [],
    DEFAULT_WIRES,
    DEFAULT_BENCH_COMPONENTS,
    dmm
  );

  const liveTel = buildBenchTelemetry({
    powerSupply: psu,
    circuitSolution: realSolution,
    multimeter: dmm,
    multimeterDisplay: realSolution.multimeterReading.display,
    multimeterUnit: realSolution.multimeterReading.unit,
    multimeterWarning: realSolution.multimeterReading.warningMessage,
    pins: DEFAULT_ECU_PINS,
    faults: [],
    selectedPinId: 'ecu-pin-3',
  });

  assert.equal(liveTel.psuEnabled, true);
  assert.equal(liveTel.psuVoltageSetting, 13.8);
  assert.equal(liveTel.solverStatus, 'VALID');
  assert.ok(
    liveTel.selectedPin?.measuredVoltage !== null &&
      liveTel.selectedPin!.measuredVoltage > 12.5
  );

  // Now check unresolved node propagation into BenchTelemetry
  const unresolvedSol = makeBaseSolution({
    nodeVoltages: { 'ecu-pin-7': 0 },
    validatedNodeVoltages: { 'ecu-pin-7': null },
    nodeMeasurementStatuses: { 'ecu-pin-7': 'UNRESOLVED' },
    unresolvedNodes: ['ecu-pin-7'],
    solverStatus: 'UNRESOLVED',
    multimeterReading: {
      display: 'UNRESOLVED',
      value: 0,
      unit: 'V',
      isOverLimit: false,
      isWarning: true,
      warningMessage: 'Floating node on ecu-pin-7',
      shouldBeep: false,
      evidenceStatus: 'UNRESOLVED',
      evidenceSource: 'ELECTRICAL_SIMULATION',
    },
  });

  const unresolvedTel = buildBenchTelemetry({
    powerSupply: psu,
    circuitSolution: unresolvedSol,
    multimeter: dmm,
    multimeterDisplay: unresolvedSol.multimeterReading.display,
    multimeterUnit: unresolvedSol.multimeterReading.unit,
    multimeterWarning: unresolvedSol.multimeterReading.warningMessage,
    pins: DEFAULT_ECU_PINS,
    faults: [],
    selectedPinId: 'ecu-pin-7',
  });

  assert.equal(unresolvedTel.solverStatus, 'UNRESOLVED');
  assert.deepEqual(unresolvedTel.unresolvedNodes, ['ecu-pin-7']);
  assert.equal(unresolvedTel.selectedPin?.measuredVoltage, null);
  assert.equal(unresolvedTel.dmm.evidenceStatus, 'UNRESOLVED');
});

test('isLiveTelemetryQuery & queryAiDiagnosticRouter always bypass cache for live bench telemetry while keeping educational caching', async () => {
  resetAiRouterStateForTests();
  await clearVoiceInteractionCache();
  await clearVerifiedKnowledgeStoreForTests();

  assert.equal(isLiveTelemetryQuery('What is the bench status?'), true);
  assert.equal(isLiveTelemetryQuery('Read meter right now'), true);
  assert.equal(isLiveTelemetryQuery('Check voltage on Pin 5'), true);
  assert.equal(isLiveTelemetryQuery('Ano ang boltahe sa Pin 7?'), true);
  assert.equal(isLiveTelemetryQuery('Do I have any faults?'), true);
  assert.equal(isLiveTelemetryQuery('Ano ang P0122 sa TPS Pin 7?', 'DTC_OR_COMPONENT_LOOKUP'), false);
  assert.equal(isLiveTelemetryQuery('Paano gamitin ang BenchLab?', 'SYSTEM_FEATURE_GUIDE'), false);

  assert.equal(isLiveTelemetryTurnIntent('LIVE_BENCH_STATUS', 'status'), true);
  assert.equal(isLiveTelemetryTurnIntent('PINOUT_OR_ECU_LOOKUP', 'check pin 5'), true);
  assert.equal(isLiveTelemetryTurnIntent('SYSTEM_FEATURE_GUIDE', 'Paano gamitin ang BenchLab?'), false);

  let transportCalls = 0;
  setAiRouterOnlineTransportForTests(async ({ benchContextText }) => {
    transportCalls += 1;
    return {
      model: 'mock-carbon',
      confidence: 0.92,
      reply: [
        'SAFETY_WARNING: Verify probe rating before measurement.',
        `ROOT_CAUSE: Live telemetry checked (${benchContextText}).`,
        'VERIFICATION_ACTION: Confirm DMM reading matches PSU setting.',
      ].join('\n'),
    };
  }, true);

  const tel12 = buildBenchTelemetry({
    powerSupply: makeBasePsu({ voltageSetting: 12.4 }),
    circuitSolution: makeBaseSolution({
      multimeterReading: {
        display: '12.40',
        value: 12.4,
        unit: 'V',
        isOverLimit: false,
        isWarning: false,
        shouldBeep: false,
      },
    }),
    multimeter: makeBaseDmm(),
    multimeterDisplay: '12.40',
    multimeterUnit: 'V',
    pins: DEFAULT_ECU_PINS,
    faults: [],
    selectedPinId: 'ecu-pin-3',
  });

  const firstLive = await queryAiDiagnosticRouter({
    query: 'Check voltage on Pin 3',
    lang: 'EN',
    telemetry: tel12,
  });
  assert.equal(transportCalls, 1);
  assert.equal(firstLive.servedFromInteractionCache, undefined);
  assert.ok(firstLive.benchSnapshotSummary.includes('12.4V'));

  const tel14 = buildBenchTelemetry({
    powerSupply: makeBasePsu({ voltageSetting: 14.2 }),
    circuitSolution: makeBaseSolution({
      multimeterReading: {
        display: '14.20',
        value: 14.2,
        unit: 'V',
        isOverLimit: false,
        isWarning: false,
        shouldBeep: false,
      },
    }),
    multimeter: makeBaseDmm(),
    multimeterDisplay: '14.20',
    multimeterUnit: 'V',
    pins: DEFAULT_ECU_PINS,
    faults: [],
    selectedPinId: 'ecu-pin-3',
  });

  const secondLive = await queryAiDiagnosticRouter({
    query: 'Check voltage on Pin 3',
    lang: 'EN',
    telemetry: tel14,
  });
  assert.equal(transportCalls, 2, 'Live telemetry query must bypass cache and recompute');
  assert.equal(secondLive.servedFromInteractionCache, undefined);
  assert.ok(secondLive.benchSnapshotSummary.includes('14.2V'));

  resetAiRouterStateForTests();
  await clearVoiceInteractionCache();
  await clearVerifiedKnowledgeStoreForTests();
});

test('localVoiceBrain reports UNRESOLVED/floating pins accurately instead of substituting nominalVoltage or 0V', () => {
  const mem = createInitialVoiceSessionMemory('mod-ecu-basics', 'BENCH_LAB', 'EN');
  const telUnresolved = buildBenchTelemetry({
    powerSupply: makeBasePsu(),
    circuitSolution: makeBaseSolution({
      nodeVoltages: { 'ecu-pin-7': 0 },
      validatedNodeVoltages: { 'ecu-pin-7': null },
      nodeMeasurementStatuses: { 'ecu-pin-7': 'UNRESOLVED' },
      unresolvedNodes: ['ecu-pin-7'],
      solverStatus: 'UNRESOLVED',
    }),
    multimeter: makeBaseDmm(),
    multimeterDisplay: 'UNRESOLVED',
    multimeterUnit: 'V',
    pins: DEFAULT_ECU_PINS,
    faults: [],
    selectedPinId: 'ecu-pin-7',
  });

  const pinLookupTurn = processVoiceCoachTurn({
    transcript: 'What is Pin 7 voltage?',
    memory: mem,
    telemetry: telUnresolved,
    activeTab: 'BENCH_LAB',
    lang: 'EN',
    pins: DEFAULT_ECU_PINS,
    nodeVoltages: { 'ecu-pin-7': 0 },
  });

  assert.match(pinLookupTurn.displayText, /UNRESOLVED|Floating/i);
  assert.equal(/Live:\s*0\.00V/i.test(pinLookupTurn.displayText), false);

  const liveStatusTurn = processVoiceCoachTurn({
    transcript: 'What is the bench status?',
    memory: mem,
    telemetry: telUnresolved,
    activeTab: 'BENCH_LAB',
    lang: 'EN',
    pins: DEFAULT_ECU_PINS,
    nodeVoltages: { 'ecu-pin-7': 0 },
  });

  assert.match(liveStatusTurn.displayText, /UNRESOLVED/i);
});

test('UI wiring maintains render-synced refs, persistent sub-tabs, and live reconciliation across all AI surfaces', () => {
  const root = process.cwd();
  const voiceHookSrc = fs.readFileSync(path.join(root, 'src/hooks/useHandsFreeVoice.ts'), 'utf8');
  const drawerSrc = fs.readFileSync(path.join(root, 'src/components/ai/UnifiedAiAssistantDrawer.tsx'), 'utf8');
  const panelSrc = fs.readFileSync(path.join(root, 'src/components/ai/AiDiagnosticAssistantPanel.tsx'), 'utf8');
  const navSrc = fs.readFileSync(path.join(root, 'src/components/FloatingLabNavigator.tsx'), 'utf8');
  const layoutSrc = fs.readFileSync(path.join(root, 'src/components/LabWorkspaceLayout.tsx'), 'utf8');

  assert.ok(voiceHookSrc.includes('telemetryReconcileKey'));
  assert.ok(voiceHookSrc.includes('lastLiveTurnSourceRef'));
  assert.ok(voiceHookSrc.includes('telemetryRef.current = telemetry'));

  assert.ok(drawerSrc.includes('drawer-solver-warning-badge'));
  assert.ok(drawerSrc.includes('drawer-live-telemetry-summary'));
  assert.ok(drawerSrc.includes('key={activeSubTab}'));
  assert.ok(drawerSrc.includes("aria-hidden={activeSubTab !== 'VOICE'}"));

  assert.ok(panelSrc.includes('diagnostic-live-drift-banner'));
  assert.ok(panelSrc.includes('diagnostic-resync-live-btn'));

  assert.ok(navSrc.includes('latestBenchRef'));
  assert.ok(navSrc.includes('createBenchReconciliationSnapshot'));
  assert.ok(navSrc.includes('diffBenchReconciliationSnapshots'));

  assert.ok(layoutSrc.includes('formatPinScopeSummary'));
});

test('UnifiedAiAssistantDrawer memoization layer triggers only when relevant telemetry (voltage, current, faults) changes', () => {
  const root = process.cwd();
  const drawerSrc = fs.readFileSync(path.join(root, 'src/components/ai/UnifiedAiAssistantDrawer.tsx'), 'utf8');
  const fabSrc = fs.readFileSync(path.join(root, 'src/components/ai/FloatingVoiceKnowledgeFab.tsx'), 'utf8');
  const contextHookSrc = fs.readFileSync(path.join(root, 'src/hooks/useBenchContext.ts'), 'utf8');

  // Verify visual indicators and debug logging hooks exist
  assert.ok(drawerSrc.includes('drawer-telemetry-streaming-indicator'));
  assert.ok(fabSrc.includes('fab-telemetry-streaming-indicator'));
  assert.ok(contextHookSrc.includes('[useBenchContext] Reconciled live circuitSolution into BenchTelemetry:'));
  assert.ok(drawerSrc.includes('[UnifiedAiAssistantDrawer] Received live telemetry update:'));

  const basePsu = makeBasePsu({ isOutputEnabled: true, voltageSetting: 13.8, currentLimit: 5.0 });
  const baseDmm = makeBaseDmm();
  const baseSolution = makeBaseSolution({
    supplyCurrentDrawAmps: 1.25,
    isSupplyCurrentTripped: false,
    activeDTCs: [],
    nodeVoltages: { 'ecu-pin-3': 13.8 },
  });

  const baseTelemetry = buildBenchTelemetry({
    powerSupply: basePsu,
    circuitSolution: baseSolution,
    multimeter: baseDmm,
    multimeterDisplay: '13.80',
    multimeterUnit: 'V',
    pins: DEFAULT_ECU_PINS,
    faults: [],
    selectedPinId: 'ecu-pin-3',
  });

  const baseProps: UnifiedAiAssistantDrawerProps = {
    isOpen: true,
    onClose: () => {},
    activeSubTab: 'VOICE',
    onChangeSubTab: () => {},
    lang: 'TL',
    onChangeLang: () => {},
    telemetry: baseTelemetry,
    benchSummaryText: 'PSU: 13.8V ON',
    quickFillPrompt: 'Test Pin 3',
    activeTab: 'BENCH_LAB',
    pins: DEFAULT_ECU_PINS,
    nodeVoltages: { 'ecu-pin-3': 13.8 },
  };

  // 1. Identical props should be equal (no re-render)
  assert.equal(areUnifiedAiDrawerPropsEqual(baseProps, { ...baseProps }), true);

  // 2. Closed drawer in both renders should be equal (skip re-render)
  assert.equal(
    areUnifiedAiDrawerPropsEqual(
      { ...baseProps, isOpen: false },
      { ...baseProps, isOpen: false, benchSummaryText: 'Changed summary while closed' }
    ),
    true
  );

  // 3. Opening/closing drawer must trigger re-render
  assert.equal(areUnifiedAiDrawerPropsEqual(baseProps, { ...baseProps, isOpen: false }), false);

  // 4. Sub-tab or language switch must trigger re-render
  assert.equal(areUnifiedAiDrawerPropsEqual(baseProps, { ...baseProps, activeSubTab: 'DIAGNOSTIC' }), false);
  assert.equal(areUnifiedAiDrawerPropsEqual(baseProps, { ...baseProps, lang: 'EN' }), false);

  // 5. Voltage change (PSU setting or pin measured voltage) must trigger re-render
  const voltageChangedTel = {
    ...baseTelemetry,
    psuVoltageSetting: 12.0,
  };
  assert.equal(areUnifiedAiDrawerPropsEqual(baseProps, { ...baseProps, telemetry: voltageChangedTel }), false);

  const pinVoltageChangedTel = {
    ...baseTelemetry,
    selectedPin: {
      ...baseTelemetry.selectedPin!,
      measuredVoltage: 5.0,
    },
  };
  assert.equal(areUnifiedAiDrawerPropsEqual(baseProps, { ...baseProps, telemetry: pinVoltageChangedTel }), false);

  // 6. Current draw change or OCP trip must trigger re-render
  const currentChangedTel = {
    ...baseTelemetry,
    psuCurrentDrawAmps: 4.80,
  };
  assert.equal(areUnifiedAiDrawerPropsEqual(baseProps, { ...baseProps, telemetry: currentChangedTel }), false);

  const ocpTrippedTel = {
    ...baseTelemetry,
    isOcpTripped: true,
  };
  assert.equal(areUnifiedAiDrawerPropsEqual(baseProps, { ...baseProps, telemetry: ocpTrippedTel }), false);

  // 7. Fault injection or new DTC must trigger re-render
  const faultInjectedTel = {
    ...baseTelemetry,
    activeFaults: [{ pinId: 'ecu-pin-7', faultType: 'SHORT_TO_GND' as const, description: 'Short' }],
  };
  assert.equal(areUnifiedAiDrawerPropsEqual(baseProps, { ...baseProps, telemetry: faultInjectedTel }), false);

  const dtcAddedTel = {
    ...baseTelemetry,
    activeDtcs: [{ code: 'P0122', severity: 'CRITICAL' as const, description: 'TPS Low' }],
  };
  assert.equal(areUnifiedAiDrawerPropsEqual(baseProps, { ...baseProps, telemetry: dtcAddedTel }), false);

  // 8. Node voltages dictionary changes must trigger re-render
  assert.equal(
    areUnifiedAiDrawerPropsEqual(baseProps, {
      ...baseProps,
      nodeVoltages: { 'ecu-pin-3': 13.8, 'ecu-pin-7': 0.05 },
    }),
    false
  );
});

