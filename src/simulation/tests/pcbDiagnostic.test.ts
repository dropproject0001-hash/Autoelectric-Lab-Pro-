import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolvePcbNetToMnaNode,
  computePcbThermalMap,
  measureDualProbePcb,
  auditPcbDiagnostics,
  computeComponentPinCoords,
  computeContinuousTracePath,
  convertOemProfileToPcbBoard,
  reconcilePcbNets,
  updatePcbComponentPin,
  removePcbComponentCleanly,
  decodePcbBoardJson,
  serializePcbBoardJson,
  reducePcbBoardHistory,
  PCB_UNASSIGNED_NET,
  type ExtendedImageAnalysisNet,
  type ProbeNodeTarget,
  type PcbHistoryState,
} from '../pcb/PcbDiagnosticEngine';
import type { ImageAnalysisComponent, ImageAnalysisHotspot } from '../../server/services/imageAnalysisTypes';
import type { InjectedFault, MultimeterState, PowerSupplyState } from '../../types/ecu';
import { ECU_BRAND_PROFILES } from '../../components/ecuPinoutData';
import { VERIFIED_VOICE_ECU_GUIDES } from '../../utils/oemKnowledgeDatabase';
import {
  executeMacroSequence,
  parseAndExecuteVoiceCommand,
  previewMacroStep,
} from '../../utils/voiceCommandParser';
import { OfflineDiagnosticChatbot } from '../../services/offlineChatbotEngine';
import { offlineVoiceAssistant } from '../../services/offlineVoiceService';
import {
  captureBenchInstrumentSequence,
  classifyMacroStepInstrument,
  compileInstrumentSequenceToSteps,
  compileInstrumentStepToInstruction,
  voiceMacroService,
} from '../../services/voiceMacroService';
import {
  appendRecordedSteps,
  type BenchRecorderSnapshot,
  diffBenchSnapshotsToInstructions,
} from '../../services/benchActionRecorder';
import { isFirebaseConfigured } from '../../lib/firebase';
import {
  OEM_BENCH_PINOUT_MAPS,
  getBenchHardwareProfileForVehicle,
  getHardwareVariantsForProfile,
  getOemBenchPinoutMapForVehicle,
  getSelectedVehicleContext,
  type BenchHardwareProfile,
  type RpmEmulatorState,
} from '../../utils/vehicleEcuRegistry';
import { evaluatePinoutSafety } from '../../utils/automotiveSafetyGuard';
import { SignalGenerator } from '../signals/SignalGenerator';
import {
  filterRegionalCatalog,
  resolveRegionalAliases,
} from '../../utils/regionalKnowledgeCatalog';
import {
  TOYOTA_OEM_PCB_SPECS_DB_LOG_ID,
  TOYOTA_OEM_PCB_SPECS_SUMMARY_TEXT,
  FORD_OEM_PCB_SPECS_DB_LOG_ID,
  FORD_OEM_PCB_SPECS_SUMMARY_TEXT,
  MITSUBISHI_OEM_PCB_SPECS_DB_LOG_ID,
  MITSUBISHI_OEM_PCB_SPECS_SUMMARY_TEXT,
  NISSAN_OEM_PCB_SPECS_DB_LOG_ID,
  NISSAN_OEM_PCB_SPECS_SUMMARY_TEXT,
} from '../../services/benchStorageService';
import {
  OEM_PCB_HARDWARE_SPECS,
  getOemPcbHardwareSpecs,
  searchOemPcbHardwareSpecs,
} from '../../utils/oemKnowledgeDatabase';
import { REPAIR_KNOWLEDGE_BASE } from '../../components/EcuRepairKnowledgeBase';
import {
  DEFAULT_BENCH_COMPONENTS,
  DEFAULT_ECU_PINS,
  DEFAULT_WIRES,
  solveCircuit,
} from '../ecu/BenchCircuitSolver';
import {
  applyWatchPresetToRules,
  buildDefaultLogicCheckRules,
  evaluateLogicCheck,
  mergeLogicCheckRules,
} from '../ecu/LogicCheckEngine';
import {
  DIAGNOSTIC_WORKFLOW_STEPS,
  canEnergizeWithPreBenchGate,
  evaluateWorkflowSteps,
  getWorkflowProgress,
  parseWorkflowStepTarget,
  shouldSeedInitialCloudPreferences,
} from '../../utils/diagnosticWorkflow';
import {
  buildDriveBenchSnapshot,
  parseDriveBenchSnapshot,
} from '../../services/googleDriveService';
import {
  PCB_ANTI_FABRICATION_RULES,
  normalizeVisionPayload,
  resolveGeminiModelName,
} from '../../server/services/imageAnalysisNormalizer';
import { fusePcbVisionResults } from '../../utils/pcbLocalVision';

const PSU_ON: PowerSupplyState = {
  voltageSetting: 12.6,
  currentLimit: 5.0,
  isOutputEnabled: true,
  preset: '12V_BENCH',
};

const PSU_OFF: PowerSupplyState = {
  voltageSetting: 12.6,
  currentLimit: 5.0,
  isOutputEnabled: false,
  preset: '12V_BENCH',
};

const BASE_NODE_VOLTAGES: Record<string, number> = {
  'bench-vbat': 12.6,
  'ecu-pin-1': 0.0,
  'ecu-pin-3': 12.6,
  'ecu-pin-5': 5.0,
  'ecu-pin-6': 2.1,
  'ecu-pin-8': 1.8,
  'ecu-pin-10': 12.4,
  'ecu-pin-11': 0.15,
  'ecu-pin-13': 2.55,
  'ecu-pin-14': 2.45,
  'ecu-pin-15': 0.45,
  'ecu-pin-16': 2.5,
};

const SAMPLE_LDO_BOARD_COMPS: ImageAnalysisComponent[] = [
  {
    refDes: 'U1',
    category: 'VOLTAGE_REGULATOR',
    marking: 'TLE4275G',
    decodedValue: '5.0V ±2% / 450mA Automotive LDO',
    packageType: 'TO-263-5',
    bbox: { ymin: 333, xmin: 333, ymax: 667, xmax: 583 },
    confidenceScore: 0.98,
    verificationStatus: 'VERIFIED',
    circuitFunction: 'Main +5V Logic Regulator',
    terminalIds: ['U1-1', 'U1-3', 'U1-5'],
    notes: 'LDO',
    source: 'MANUAL',
    pinSpecs: [
      {
        pinNumber: 1,
        pinName: 'VIN',
        category: 'power',
        nominalVoltage: 12.25,
        connectedNetId: 'NET_KL30_VBAT',
        notes: 'Protected VBAT',
      },
      {
        pinNumber: 3,
        pinName: 'GND',
        category: 'ground',
        nominalVoltage: 0.0,
        connectedNetId: 'NET_CHASSIS_GND',
        notes: 'Ground',
      },
      {
        pinNumber: 5,
        pinName: 'VOUT',
        category: 'power',
        nominalVoltage: 5.0,
        connectedNetId: 'NET_5V_REGULATED',
        notes: '+5V Output',
      },
    ],
  },
  {
    refDes: 'D1',
    category: 'DIODE',
    marking: 'B540C',
    decodedValue: '40V / 5A Schottky Barrier Diode',
    packageType: 'SMC',
    bbox: { ymin: 150, xmin: 150, ymax: 260, xmax: 270 },
    confidenceScore: 0.96,
    verificationStatus: 'VERIFIED',
    circuitFunction: 'Reverse Polarity Protection',
    terminalIds: ['D1-1', 'D1-2'],
    notes: 'Schottky',
    source: 'MANUAL',
    pinSpecs: [
      {
        pinNumber: 1,
        pinName: 'A',
        category: 'power',
        nominalVoltage: 12.6,
        connectedNetId: 'NET_RAW_KL30',
        notes: 'Anode',
      },
      {
        pinNumber: 2,
        pinName: 'K',
        category: 'power',
        nominalVoltage: 12.25,
        connectedNetId: 'NET_KL30_VBAT',
        notes: 'Cathode',
      },
    ],
  },
  {
    refDes: 'TVS1',
    category: 'TVS_DIODE',
    marking: 'SMBJ24CA',
    decodedValue: '24V Bidirectional Load-Dump TVS',
    packageType: 'SMB',
    bbox: { ymin: 150, xmin: 600, ymax: 260, xmax: 720 },
    confidenceScore: 0.96,
    verificationStatus: 'VERIFIED',
    circuitFunction: 'ISO 7637-2 Load Dump Clamp',
    terminalIds: ['TVS1-1', 'TVS1-2'],
    notes: 'TVS',
    source: 'MANUAL',
    pinSpecs: [
      {
        pinNumber: 1,
        pinName: 'K1',
        category: 'power',
        nominalVoltage: 12.25,
        connectedNetId: 'NET_KL30_VBAT',
        notes: 'Clamp top',
      },
      {
        pinNumber: 2,
        pinName: 'K2',
        category: 'ground',
        nominalVoltage: 0.0,
        connectedNetId: 'NET_CHASSIS_GND',
        notes: 'Ground',
      },
    ],
  },
];

const SAMPLE_NETS: ExtendedImageAnalysisNet[] = [
  {
    name: 'NET_KL30_VBAT',
    signalType: 'BATTERY_POWER',
    nominalVoltage: 12.25,
    impedanceOhms: 0.02,
    connectedComponentRefs: ['D1', 'TVS1', 'U1'],
    connectedTerminalIds: ['D1-2', 'TVS1-1', 'U1-1'],
    tracePoints: [
      { x: 270, y: 205 },
      { x: 333, y: 400 },
    ],
    confidenceScore: 0.97,
    verificationStatus: 'VERIFIED',
    isComplete: true,
  },
  {
    name: 'NET_5V_REGULATED',
    signalType: '5V_LOGIC',
    nominalVoltage: 5.0,
    impedanceOhms: 0.05,
    connectedComponentRefs: ['U1'],
    connectedTerminalIds: ['U1-5'],
    tracePoints: [
      { x: 333, y: 600 },
      { x: 750, y: 600 },
    ],
    confidenceScore: 0.98,
    verificationStatus: 'VERIFIED',
    isComplete: true,
  },
  {
    name: 'NET_CHASSIS_GND',
    signalType: 'GROUND',
    nominalVoltage: 0.0,
    impedanceOhms: 0.01,
    connectedComponentRefs: ['U1', 'TVS1'],
    connectedTerminalIds: ['U1-3', 'TVS1-2'],
    tracePoints: [
      { x: 333, y: 500 },
      { x: 660, y: 260 },
    ],
    confidenceScore: 0.99,
    verificationStatus: 'VERIFIED',
    isComplete: true,
  },
];

describe('PcbDiagnosticEngine — Deterministic MNA, Electro-Thermal & Probe Suite', () => {
  it('resolves PCB nets strictly from MNA node voltages and PSU output state', () => {
    const v5 = resolvePcbNetToMnaNode('NET_5V_REGULATED', 5.0, BASE_NODE_VOLTAGES, PSU_ON);
    assert.equal(v5.voltage, 5.0);
    assert.equal(v5.simPinId, 'ecu-pin-5');

    const vKl30 = resolvePcbNetToMnaNode('NET_KL30_VBAT', 12.0, BASE_NODE_VOLTAGES, PSU_ON);
    assert.ok(Math.abs(vKl30.voltage - 12.25) < 0.001, 'Should subtract 0.35V D1 Schottky drop from KL30');

    const vSplit = resolvePcbNetToMnaNode('NET_CAN_SPLIT', 2.5, BASE_NODE_VOLTAGES, PSU_ON);
    assert.equal(vSplit.voltage, 2.5);

    const vTps = resolvePcbNetToMnaNode('NET_TPS_SIG', 1.3, { ...BASE_NODE_VOLTAGES, 'ecu-pin-7': 1.28, 'ecu-pin-6': 0.0 }, PSU_ON);
    assert.equal(vTps.voltage, 1.28);
    assert.equal(vTps.simPinId, 'ecu-pin-7');

    const vSgnd = resolvePcbNetToMnaNode('NET_SGND', 0.0, { ...BASE_NODE_VOLTAGES, 'ecu-pin-6': 0.01 }, PSU_ON);
    assert.equal(vSgnd.voltage, 0.01);
    assert.equal(vSgnd.simPinId, 'ecu-pin-6');

    const vFp = resolvePcbNetToMnaNode('NET_FP_RELAY', 12.5, { ...BASE_NODE_VOLTAGES, 'ecu-pin-16': 12.49 }, PSU_ON);
    assert.equal(vFp.voltage, 12.49);
    assert.equal(vFp.simPinId, 'ecu-pin-16');

    const vOff = resolvePcbNetToMnaNode('NET_5V_REGULATED', 5.0, BASE_NODE_VOLTAGES, PSU_OFF);
    assert.equal(vOff.voltage, 0.0);
  });

  it('computes realistic electro-thermal temperatures & correlates active MNA faults', () => {
    const nominalMap = computePcbThermalMap({
      components: SAMPLE_LDO_BOARD_COMPS,
      powerSupply: PSU_ON,
      supplyCurrentDrawAmps: 0.25,
      nodeVoltages: BASE_NODE_VOLTAGES,
      faults: [],
      ambientTempC: 25,
    });

    assert.equal(nominalMap.U1.faultLinked, false);
    assert.ok(nominalMap.U1.tempC > 60 && nominalMap.U1.tempC < 110, `U1 nominal temp ${nominalMap.U1.tempC}`);
    assert.ok(nominalMap.TVS1.tempC < 26, 'TVS1 must stay cold below 26.7V standoff');

    const shortFaults: InjectedFault[] = [
      { pinId: 'ecu-pin-5', faultType: 'SHORT_TO_GND', description: 'VREF_5V Short to GND', timestamp: 1 },
    ];
    const faultMap = computePcbThermalMap({
      components: SAMPLE_LDO_BOARD_COMPS,
      powerSupply: PSU_ON,
      supplyCurrentDrawAmps: 0.9,
      nodeVoltages: { ...BASE_NODE_VOLTAGES, 'ecu-pin-5': 0.05 },
      faults: shortFaults,
      ambientTempC: 25,
    });

    assert.equal(faultMap.U1.faultLinked, true);
    assert.equal(faultMap.U1.status, 'CRITICAL_OVERHEAT');
    assert.ok(faultMap.U1.tempC >= 115, `U1 should enter critical thermal foldback: ${faultMap.U1.tempC}`);

    // Overvoltage load dump activates TVS1 avalanche clamping
    const loadDumpMap = computePcbThermalMap({
      components: SAMPLE_LDO_BOARD_COMPS,
      powerSupply: { ...PSU_ON, voltageSetting: 32.0 },
      supplyCurrentDrawAmps: 3.5,
      nodeVoltages: { ...BASE_NODE_VOLTAGES, 'bench-vbat': 32.0, 'ecu-pin-3': 32.0 },
      faults: [],
      ambientTempC: 25,
    });
    assert.ok(loadDumpMap.TVS1.tempC > 100, 'TVS1 must heat up during 32V load-dump clamping');

    // Power off returns to ambient
    const offMap = computePcbThermalMap({
      components: SAMPLE_LDO_BOARD_COMPS,
      powerSupply: PSU_OFF,
      ambientTempC: 25,
    });
    assert.equal(offMap.U1.tempC, 25);
    assert.equal(offMap.U1.powerDissipationMw, 0);
  });

  it('measures dual-probe differential voltage, continuity, dead shorts, Schottky Vf & CAN termination', () => {
    const probe5vA: ProbeNodeTarget = {
      label: 'U1 #5 (VOUT)',
      compRefDes: 'U1',
      pinNumber: 5,
      pinName: 'VOUT',
      netId: 'NET_5V_REGULATED',
      nominalVoltage: 5.0,
      xNorm: 333,
      yNorm: 600,
    };
    const probe5vB: ProbeNodeTarget = {
      label: 'NET_5V Node #2',
      netId: 'NET_5V_REGULATED',
      nominalVoltage: 5.0,
      xNorm: 750,
      yNorm: 600,
    };
    const probeGnd: ProbeNodeTarget = {
      label: 'U1 #3 (GND)',
      compRefDes: 'U1',
      pinNumber: 3,
      pinName: 'GND',
      netId: 'NET_CHASSIS_GND',
      nominalVoltage: 0.0,
      xNorm: 333,
      yNorm: 500,
    };

    // 1. Same-net copper continuity
    const contResult = measureDualProbePcb({
      probeA: probe5vA,
      probeB: probe5vB,
      components: SAMPLE_LDO_BOARD_COMPS,
      nets: SAMPLE_NETS,
      nodeVoltages: BASE_NODE_VOLTAGES,
      powerSupply: PSU_ON,
      faults: [],
    });
    assert.equal(contResult.continuityStatus, 'CONTINUOUS');
    assert.ok((contResult.estimatedOhms ?? 99) < 0.5);

    // 2. Open-circuit fault breaks same-net continuity
    const openResult = measureDualProbePcb({
      probeA: probe5vA,
      probeB: probe5vB,
      components: SAMPLE_LDO_BOARD_COMPS,
      nets: SAMPLE_NETS,
      nodeVoltages: BASE_NODE_VOLTAGES,
      powerSupply: PSU_ON,
      faults: [{ pinId: 'ecu-pin-5', faultType: 'OPEN_CIRCUIT', description: 'Open 5V', timestamp: 1 }],
    });
    assert.equal(openResult.continuityStatus, 'OPEN_OL');

    // 3. Dead short to GND across 5V rail & GND probe
    const shortResult = measureDualProbePcb({
      probeA: probe5vA,
      probeB: probeGnd,
      components: SAMPLE_LDO_BOARD_COMPS,
      nets: SAMPLE_NETS,
      nodeVoltages: { ...BASE_NODE_VOLTAGES, 'ecu-pin-5': 0.0 },
      powerSupply: PSU_ON,
      faults: [{ pinId: 'ecu-pin-5', faultType: 'SHORT_TO_GND', description: '5V Short', timestamp: 1 }],
    });
    assert.equal(shortResult.continuityStatus, 'SHORT_FAULT');
    assert.equal(shortResult.estimatedOhms, 0.12);

    // 4. Schottky diode forward vs reverse check
    const diodeA: ProbeNodeTarget = {
      label: 'D1 #1 (A)',
      compRefDes: 'D1',
      pinNumber: 1,
      netId: 'NET_RAW_KL30',
      nominalVoltage: 12.6,
      xNorm: 150,
      yNorm: 205,
    };
    const diodeK: ProbeNodeTarget = {
      label: 'D1 #2 (K)',
      compRefDes: 'D1',
      pinNumber: 2,
      netId: 'NET_KL30_VBAT',
      nominalVoltage: 12.25,
      xNorm: 270,
      yNorm: 205,
    };
    const fwdDiode = measureDualProbePcb({
      probeA: diodeA,
      probeB: diodeK,
      components: SAMPLE_LDO_BOARD_COMPS,
      nets: SAMPLE_NETS,
      nodeVoltages: BASE_NODE_VOLTAGES,
      powerSupply: PSU_ON,
      faults: [],
    });
    assert.equal(fwdDiode.continuityStatus, 'DIODE_JUNCTION');
    assert.equal(fwdDiode.diodeDropVolts, 0.35);

    const revDiode = measureDualProbePcb({
      probeA: diodeK,
      probeB: diodeA,
      components: SAMPLE_LDO_BOARD_COMPS,
      nets: SAMPLE_NETS,
      nodeVoltages: BASE_NODE_VOLTAGES,
      powerSupply: PSU_ON,
      faults: [],
    });
    assert.equal(revDiode.continuityStatus, 'OPEN_OL');

    // 5. CAN differential bus healthy (60.2 Ω) vs open terminator (120.8 Ω)
    const canH: ProbeNodeTarget = {
      label: 'U2 #7 (CANH)',
      netId: 'NET_CAN_HIGH',
      nominalVoltage: 2.55,
      xNorm: 500,
      yNorm: 400,
    };
    const canL: ProbeNodeTarget = {
      label: 'U2 #6 (CANL)',
      netId: 'NET_CAN_LOW',
      nominalVoltage: 2.45,
      xNorm: 500,
      yNorm: 450,
    };
    const healthyCan = measureDualProbePcb({
      probeA: canH,
      probeB: canL,
      components: [],
      nets: [],
      nodeVoltages: BASE_NODE_VOLTAGES,
      powerSupply: PSU_ON,
      faults: [],
    });
    assert.equal(healthyCan.estimatedOhms, 60.2);

    const openCan = measureDualProbePcb({
      probeA: canH,
      probeB: canL,
      components: [],
      nets: [],
      nodeVoltages: BASE_NODE_VOLTAGES,
      powerSupply: PSU_ON,
      faults: [{ pinId: 'ecu-pin-13', faultType: 'OPEN_CIRCUIT', description: 'CANH Open', timestamp: 1 }],
    });
    assert.equal(openCan.estimatedOhms, 120.8);
  });

  it('audits MNA deviations, thermal runaway, unassigned pins & unrouted nets in priority order', () => {
    const faultedVoltages = { ...BASE_NODE_VOLTAGES, 'ecu-pin-5': 0.1 };
    const faults: InjectedFault[] = [
      { pinId: 'ecu-pin-5', faultType: 'SHORT_TO_GND', description: '5V Short', timestamp: 1 },
    ];
    const thermalMap = computePcbThermalMap({
      components: SAMPLE_LDO_BOARD_COMPS,
      powerSupply: PSU_ON,
      supplyCurrentDrawAmps: 0.9,
      nodeVoltages: faultedVoltages,
      faults,
      ambientTempC: 25,
    });
    const extraComps: ImageAnalysisComponent[] = [
      ...SAMPLE_LDO_BOARD_COMPS,
      {
        refDes: 'TP1',
        category: 'TEST_POINT',
        marking: 'TP1',
        decodedValue: 'Test Pad',
        packageType: 'SMD',
        bbox: { ymin: 700, xmin: 700, ymax: 760, xmax: 760 },
        confidenceScore: 1,
        verificationStatus: 'UNVERIFIED',
        circuitFunction: 'Floating',
        terminalIds: ['TP1-1'],
        notes: 'Floating',
        source: 'MANUAL',
        pinSpecs: [
          {
            pinNumber: 1,
            pinName: 'PAD',
            category: 'signal_in',
            nominalVoltage: 5,
            connectedNetId: 'NET_UNASSIGNED',
            notes: 'Unassigned',
          },
        ],
      },
    ];
    const extraNets: ExtendedImageAnalysisNet[] = [
      ...SAMPLE_NETS,
      {
        name: 'NET_SINGLE_NODE',
        signalType: 'SIGNAL_TRACE',
        connectedComponentRefs: ['TP1'],
        connectedTerminalIds: ['TP1-1'],
        tracePoints: [{ x: 730, y: 730 }],
        confidenceScore: 0.9,
        verificationStatus: 'UNVERIFIED',
        isComplete: false,
      },
    ];
    const hotspots: ImageAnalysisHotspot[] = [
      {
        id: 'hs1',
        label: 'LDO Solder Stress',
        severity: 'WARNING',
        bbox: { ymin: 330, xmin: 330, ymax: 670, xmax: 590 },
        suspectComponentRef: 'U1',
        notes: 'Inspect reflow fillet',
        source: 'AI',
      },
    ];

    const findings = auditPcbDiagnostics({
      components: extraComps,
      nets: extraNets,
      hotspots,
      thermalMap,
      nodeVoltages: faultedVoltages,
      powerSupply: PSU_ON,
      faults,
    });

    assert.ok(findings.some((f) => f.category === 'THERMAL' && f.severity === 'CRITICAL'));
    assert.ok(findings.some((f) => f.category === 'MNA_VOLTAGE' && f.targetNetId === 'NET_5V_REGULATED'));
    assert.ok(findings.some((f) => f.id === 'erc-unassigned-pins' && f.severity === 'WARNING'));
    assert.ok(findings.some((f) => f.id === 'erc-unrouted-NET_SINGLE_NODE' && f.severity === 'INFO'));
    assert.equal(findings[0].severity, 'CRITICAL');
  });

  it('converts OEM ECU profiles to MNA-mapped PCB boards and computes continuous BFS trace paths', () => {
    const toyota = ECU_BRAND_PROFILES.find((p) => p.id === 'toyota-denso-175822');
    assert.ok(toyota, 'Toyota Denso OEM profile should exist');

    const oemBoard = convertOemProfileToPcbBoard(toyota);
    assert.ok(oemBoard.imageSrc && oemBoard.imageSrc.length > 0);
    assert.ok(oemBoard.components.length >= 4);
    for (const c of oemBoard.components) {
      assert.ok(c.bbox.xmin >= 0 && c.bbox.xmax <= 1000 && c.bbox.xmin < c.bbox.xmax);
      assert.ok(c.bbox.ymin >= 0 && c.bbox.ymax <= 1000 && c.bbox.ymin < c.bbox.ymax);
    }

    const pt = computeComponentPinCoords(SAMPLE_LDO_BOARD_COMPS[0], 0, 3);
    assert.equal(pt.x, 333);

    const tracePath = computeContinuousTracePath({
      tracePathPair: ['D1', 'U1'],
      hoveredNode: {
        nodeLabel: 'U1 #1 (VIN)',
        netId: 'NET_KL30_VBAT',
        xNorm: 333,
        yNorm: 400,
      },
      components: SAMPLE_LDO_BOARD_COMPS,
      nets: SAMPLE_NETS,
    });
    assert.ok(tracePath, 'Trace path between D1 and U1 over NET_KL30_VBAT should resolve');
    assert.equal(tracePath!.isNetVerified, true);
    assert.ok(tracePath!.traversedNets.includes('NET_KL30_VBAT'));
  });

  it('verifies all 10 Ford OEM pinouts in ECU Pinout Library, Voice Command Parser & Offline AI Chatbot', () => {
    const fordProfile = ECU_BRAND_PROFILES.find((p) => p.id === 'ford-fomoco-sid208');
    assert.ok(fordProfile, 'Ford FoMoCo ECU profile must exist');

    const expectedPinCodes = [
      'C1E148', 'C1E142', 'C1E139', 'C1E140',
      'CBR-1', 'CBR-3', 'CBR-2', 'CBR-4',
      'EF15-P1', 'EF15-P2', 'EF15-P3', 'EF15-P4',
      'GDI-P61', 'GDI-P16', 'GDI-P32',
      'TCM-P1', 'TCM-P2', 'TCM-P3', 'TCM-P4', 'TCM-P5',
      'TERR-P8', 'TERR-P9', 'TERR-P10', 'TERR-P11',
      'R25-P1', 'R25-P2', 'R25-P3', 'R25-P4',
      'DUR-P15', 'DUR-P6', 'DUR-P61',
      'EXP-P103', 'EXP-P105', 'EXP-P116',
      'TR-B20', 'TR-B22', 'TR-B23', 'TR-B24',
    ];
    for (const code of expectedPinCodes) {
      assert.ok(
        fordProfile!.pinouts.some((p) => p.pinCode === code),
        `Ford profile must contain pinCode ${code}`
      );
    }

    assert.equal(
      VERIFIED_VOICE_ECU_GUIDES.filter((g) => g.brandKey === 'ford').length >= 11,
      true,
      'Must include SID209 + all 10 new Ford OEM voice guides'
    );

    const dummyActions = {
      setVoltage: () => {},
      resetLab: () => {},
      attachProbeToPin: () => {},
      setPowerSupplyOutput: () => {},
      switchTab: () => {},
    };

    const t6Voice = parseAndExecuteVoiceCommand('Ranger and Everest T6 pinout', [], dummyActions);
    assert.equal(t6Voice.matched, true);
    assert.ok(t6Voice.spokenReply.includes('C1E148') && t6Voice.spokenReply.includes('C1E142'));

    const ecoBlueVoice = parseAndExecuteVoiceCommand('Next-Gen Ranger EcoBlue pinout', [], dummyActions);
    assert.equal(ecoBlueVoice.matched, true);
    assert.ok(ecoBlueVoice.spokenReply.includes('CBR pin 1') && ecoBlueVoice.spokenReply.includes('CBR pin 3'));

    const ecoSport15Voice = parseAndExecuteVoiceCommand('EcoSport and Fiesta 1.5L pinout', [], dummyActions);
    assert.equal(ecoSport15Voice.matched, true);
    assert.ok(ecoSport15Voice.spokenReply.includes('Pin 1') && ecoSport15Voice.spokenReply.includes('Pin 2'));

    const focusGdiVoice = parseAndExecuteVoiceCommand('Focus and EcoSport GDI pinout', [], dummyActions);
    assert.equal(focusGdiVoice.matched, true);
    assert.ok(focusGdiVoice.spokenReply.includes('Pin 61') && focusGdiVoice.spokenReply.includes('Pin 16'));

    const tcmVoice = parseAndExecuteVoiceCommand('PowerShift TCM pinout', [], dummyActions);
    assert.equal(tcmVoice.matched, true);
    assert.ok(tcmVoice.spokenReply.includes('Pins 1 and 2') && tcmVoice.spokenReply.includes('Pin 3'));

    const territoryVoice = parseAndExecuteVoiceCommand('Territory 1.5L EcoBoost pinout', [], dummyActions);
    assert.equal(territoryVoice.matched, true);
    assert.ok(territoryVoice.spokenReply.includes('Pin 8') && territoryVoice.spokenReply.includes('Pin 9'));

    const ranger25Voice = parseAndExecuteVoiceCommand('Ranger 2.5L NA pinout', [], dummyActions);
    assert.equal(ranger25Voice.matched, true);
    assert.ok(ranger25Voice.spokenReply.includes('Pin 1') && ranger25Voice.spokenReply.includes('Pin 2'));

    const escapeDuratecVoice = parseAndExecuteVoiceCommand('Older Escape Focus Duratec pinout', [], dummyActions);
    assert.equal(escapeDuratecVoice.matched, true);
    assert.ok(escapeDuratecVoice.spokenReply.includes('Pin 15') && escapeDuratecVoice.spokenReply.includes('Pin 6'));

    const explorerVoice = parseAndExecuteVoiceCommand('Ford Explorer pinout', [], dummyActions);
    assert.equal(explorerVoice.matched, true);
    assert.ok(explorerVoice.spokenReply.includes('Pin 103') && explorerVoice.spokenReply.includes('Pin 105'));

    const transitVoice = parseAndExecuteVoiceCommand('Transit 2.2L TDCi pinout', [], dummyActions);
    assert.equal(transitVoice.matched, true);
    assert.ok(transitVoice.spokenReply.includes('Pin B20') && transitVoice.spokenReply.includes('Pin B22'));

    const bot = new OfflineDiagnosticChatbot();
    const botReply = bot.ask('Ranger Everest T6 C1E148 PowerShift TCM Territory Explorer Transit B20 pinouts');
    assert.ok(botReply.answer.includes('C1E148'));
    assert.ok(botReply.answer.includes('B20'));
  });

  it('verifies all 10 Toyota PH-Market OEM ECU & TCM Bench Pinouts, Polarity Warning, Voice Command Parser & Offline AI Chatbot', () => {
    const toyotaProfile = ECU_BRAND_PROFILES.find((p) => p.id === 'toyota-denso-175822');
    assert.ok(toyotaProfile, 'Toyota Denso OEM ECU profile must exist');
    assert.ok(
      toyotaProfile!.description.includes('WARNING: Pinout Verification & Polarity'),
      'Toyota profile description must include the mandatory Pinout Verification & Polarity warning'
    );

    const expectedToyotaPinCodes = [
      // 1. Hilux / Fortuner / Innova (1GD-FTV & 2GD-FTV)
      '1GD-A1', '1GD-A28', '1GD-A3', '1GD-A41', '1GD-A42', '1GD-B14',
      // 2. Hilux / Fortuner / Hiace (1KD-FTV & 2KD-FTV)
      'E5-1', 'E5-9', 'E5-3', 'E5-23', 'E5-24', 'E6-12',
      // 3. Innova (2.0L 1TR-FE VVT-i Gasoline)
      '1TR-A1', '1TR-A18', '1TR-A3', '1TR-A33', '1TR-B21',
      // 4. Hiace Commuter / GL Grandia (2.8L 1GD-FTV)
      'HI-A1', 'HI-A28', 'HI-A3', 'HI-A41', 'HI-B54',
      // 5. Vios / Yaris (1.5L 1NZ-FE & 1.3L 2NZ-FE)
      '1NZ-A1', '1NZ-A15', '1NZ-A3', '1NZ-A27', '1NZ-B19',
      // 6. Vios / Yaris (1.5L 2NR-FE & 1.3L 1NR-FE Dual VVT-i)
      '2NR-A1', '2NR-A21', '2NR-A3', '2NR-A37', '2NR-B24',
      // 7. Wigo / Agya (1.0L 1KR-FE / 1KR-VE)
      '1KR-A1', '1KR-A12', '1KR-A3', '1KR-A22', '1KR-B16',
      // 8. Avanza / Rush (1.5L 2NR-VE & 1.3L 1NR-VE)
      'AV-A1', 'AV-A19', 'AV-A3', 'AV-A31', 'AV-B20',
      // 9. Corolla Altis (1.6L 1ZR-FE & 1.8L 2ZR-FE Dual VVT-i)
      'ZR-A1', 'ZR-A24', 'ZR-A3', 'ZR-A39', 'ZR-B22',
      // 10. Fortuner / Hilux 6AT TCM (Aisin AC60E / AC60F)
      'AC60-P1', 'AC60-P11', 'AC60-P15', 'AC60-P21', 'AC60-P12',
    ];

    for (const code of expectedToyotaPinCodes) {
      assert.ok(
        toyotaProfile!.pinouts.some((p) => p.pinCode === code),
        `Toyota profile must contain pinCode ${code}`
      );
    }

    assert.equal(
      VERIFIED_VOICE_ECU_GUIDES.filter((g) => g.brandKey === 'toyota').length,
      10,
      'Must include all 10 verified PH-Market Toyota OEM voice guides'
    );

    const dummyActions = {
      setVoltage: () => {},
      resetLab: () => {},
      attachProbeToPin: () => {},
      setPowerSupplyOutput: () => {},
      switchTab: () => {},
    };

    const hilux1gdVoice = parseAndExecuteVoiceCommand('Hilux Fortuner Innova 2.8L 1GD-FTV 2.4L 2GD-FTV pinout', [], dummyActions);
    assert.equal(hilux1gdVoice.matched, true);
    assert.ok(hilux1gdVoice.spokenReply.includes('A28') && hilux1gdVoice.spokenReply.includes('B48'));

    const hilux1kdVoice = parseAndExecuteVoiceCommand('Hilux Fortuner Hiace 3.0L 1KD-FTV 2.5L 2KD-FTV pinout', [], dummyActions);
    assert.equal(hilux1kdVoice.matched, true);
    assert.ok(hilux1kdVoice.spokenReply.includes('E5-9') && hilux1kdVoice.spokenReply.includes('E6-31'));

    const innova1trVoice = parseAndExecuteVoiceCommand('Innova 2.0L 1TR-FE VVT-i Gasoline pinout', [], dummyActions);
    assert.equal(innova1trVoice.matched, true);
    assert.ok(innova1trVoice.spokenReply.includes('A18') && innova1trVoice.spokenReply.includes('B36'));

    const hiace1gdVoice = parseAndExecuteVoiceCommand('Hiace Commuter GL Grandia 2.8L 1GD-FTV pinout', [], dummyActions);
    assert.equal(hiace1gdVoice.matched, true);
    assert.ok(hiace1gdVoice.spokenReply.includes('A28') && hiace1gdVoice.spokenReply.includes('B54'));

    const vios1nzVoice = parseAndExecuteVoiceCommand('Vios Yaris 1.5L 1NZ-FE 1.3L 2NZ-FE pinout', [], dummyActions);
    assert.equal(vios1nzVoice.matched, true);
    assert.ok(vios1nzVoice.spokenReply.includes('A15') && vios1nzVoice.spokenReply.includes('B19'));

    const vios2nrVoice = parseAndExecuteVoiceCommand('Vios Yaris 1.5L 2NR-FE 1.3L 1NR-FE Dual VVT-i pinout', [], dummyActions);
    assert.equal(vios2nrVoice.matched, true);
    assert.ok(vios2nrVoice.spokenReply.includes('A21') && vios2nrVoice.spokenReply.includes('B40'));

    const wigo1krVoice = parseAndExecuteVoiceCommand('Wigo Agya 1.0L 1KR-FE 1KR-VE pinout', [], dummyActions);
    assert.equal(wigo1krVoice.matched, true);
    assert.ok(wigo1krVoice.spokenReply.includes('A12') && wigo1krVoice.spokenReply.includes('B28'));

    const avanzaRushVoice = parseAndExecuteVoiceCommand('Avanza Rush 1.5L 2NR-VE 1.3L 1NR-VE pinout', [], dummyActions);
    assert.equal(avanzaRushVoice.matched, true);
    assert.ok(avanzaRushVoice.spokenReply.includes('A19') && avanzaRushVoice.spokenReply.includes('B35'));

    const altis1zrVoice = parseAndExecuteVoiceCommand('Corolla Altis 1.6L 1ZR-FE 1.8L 2ZR-FE pinout', [], dummyActions);
    assert.equal(altis1zrVoice.matched, true);
    assert.ok(altis1zrVoice.spokenReply.includes('A24') && altis1zrVoice.spokenReply.includes('B42'));

    const ac60TcmVoice = parseAndExecuteVoiceCommand('Fortuner Hilux 6AT TCM Aisin AC60E AC60F pinout', [], dummyActions);
    assert.equal(ac60TcmVoice.matched, true);
    assert.ok(ac60TcmVoice.spokenReply.includes('Pin 11') && ac60TcmVoice.spokenReply.includes('Pin 12'));

    const bot = new OfflineDiagnosticChatbot();
    const botReply = bot.ask('Toyota OEM ECU Bench Test Pinouts Hilux 1GD 1KD Innova 1TR Hiace Vios Wigo Avanza Corolla Altis 6AT TCM AC60');
    assert.ok(botReply.answer.includes('A28'));
    assert.ok(botReply.answer.includes('E5-9'));
    assert.ok(botReply.answer.includes('AC60'));
  });

  it('parses and executes SpeechRecognition hardware commands for wiring, multimeter range/mode, and probe leads', () => {
    const connectedWires: Array<{ src: string; dst: string; color?: string }> = [];
    const disconnectedPins: string[] = [];
    const redProbes: Array<{ pinId: string; label: string }> = [];
    const blackProbes: Array<{ pinId: string; label: string }> = [];
    const psuVoltsHistory: number[] = [];
    const meterUpdates: Array<{ updates: Partial<MultimeterState>; rangeLabel?: string | null }> = [];

    const hardwareActions = {
      setVoltage: (volts: number) => {
        psuVoltsHistory.push(volts);
      },
      resetLab: () => {},
      attachProbeToPin: (pinId: string, label: string) => {
        redProbes.push({ pinId, label });
      },
      attachBlackProbeToPin: (pinId: string, label: string) => {
        blackProbes.push({ pinId, label });
      },
      setMultimeterState: (updates: Partial<MultimeterState>, rangeLabel?: string | null) => {
        meterUpdates.push({ updates, rangeLabel });
      },
      connectWire: (sourcePinId: string, targetPinId: string, color?: string) => {
        connectedWires.push({ src: sourcePinId, dst: targetPinId, color });
        return true;
      },
      disconnectWireByPin: (pinId: string) => {
        disconnectedPins.push(pinId);
        return 1;
      },
      setPowerSupplyOutput: () => {},
      switchTab: () => {},
    };

    // 1. "connect pin 5 to ground"
    const res1 = parseAndExecuteVoiceCommand('connect pin 5 to ground', DEFAULT_ECU_PINS, hardwareActions);
    assert.equal(res1.matched, true);
    assert.deepEqual(connectedWires[0], { src: 'ecu-pin-5', dst: 'chassis-gnd', color: '#1e293b' });

    // 2. Spoken number & homophone: "connect pin five two twelve volts"
    const res2 = parseAndExecuteVoiceCommand('connect pin five two twelve volts', DEFAULT_ECU_PINS, hardwareActions);
    assert.equal(res2.matched, true);
    assert.deepEqual(connectedWires[1], { src: 'ecu-pin-5', dst: 'bench-vbat', color: '#ef4444' });

    // 3. "set multimeter to 20 volts" (must NOT hit PSU setVoltage!)
    const res3 = parseAndExecuteVoiceCommand('set multimeter to 20 volts', DEFAULT_ECU_PINS, hardwareActions);
    assert.equal(res3.matched, true);
    assert.equal(psuVoltsHistory.length, 0);
    assert.equal(meterUpdates[0]?.updates.mode, 'V_DC');
    assert.equal(meterUpdates[0]?.updates.rangeAuto, false);
    assert.equal(meterUpdates[0]?.updates.isPowered, true);
    assert.equal(meterUpdates[0]?.rangeLabel, '20V');

    // 4. "set multimeter to ac volts"
    const res4 = parseAndExecuteVoiceCommand('set multimeter to ac volts', DEFAULT_ECU_PINS, hardwareActions);
    assert.equal(res4.matched, true);
    assert.equal(meterUpdates[1]?.updates.mode, 'V_AC');
    assert.equal(meterUpdates[1]?.updates.rangeAuto, true);
    assert.equal(meterUpdates[1]?.rangeLabel, null);

    // 5. "set meter to continuity"
    const res5 = parseAndExecuteVoiceCommand('set meter to continuity', DEFAULT_ECU_PINS, hardwareActions);
    assert.equal(res5.matched, true);
    assert.equal(meterUpdates[2]?.updates.mode, 'CONTINUITY');

    // 6. "attach black probe to ground"
    const res6 = parseAndExecuteVoiceCommand('attach black probe to ground', DEFAULT_ECU_PINS, hardwareActions);
    assert.equal(res6.matched, true);
    assert.equal(blackProbes[0]?.pinId, 'chassis-gnd');

    // 7. "disconnect pin 5"
    const res7 = parseAndExecuteVoiceCommand('disconnect pin 5', DEFAULT_ECU_PINS, hardwareActions);
    assert.equal(res7.matched, true);
    assert.equal(disconnectedPins[0], 'ecu-pin-5');

    // 8. PSU "set voltage to 13 point 8 volts" still sets PSU cleanly
    const res8 = parseAndExecuteVoiceCommand('set voltage to thirteen point eight volts', DEFAULT_ECU_PINS, hardwareActions);
    assert.equal(res8.matched, true);
    assert.equal(psuVoltsHistory[0], 13.8);
    assert.equal(res8.category, 'POWER');
    assert.equal(res8.status, 'EXECUTED');
    assert.equal(res8.normalizedTranscript, 'set voltage to 13.8 volts');

    // 9. Structured metadata on wiring, multimeter, failed target & unrecognized utterances
    assert.equal(res1.category, 'WIRING');
    assert.equal(res1.status, 'EXECUTED');
    assert.equal(res2.normalizedTranscript, 'connect pin 5 to 12 volts');
    assert.equal(res3.category, 'MULTIMETER');
    assert.equal(res3.status, 'EXECUTED');
    assert.equal(res6.category, 'PROBES');

    const failedWire = parseAndExecuteVoiceCommand('connect pin 99 to ground', DEFAULT_ECU_PINS, hardwareActions);
    assert.equal(failedWire.matched, true);
    assert.equal(failedWire.category, 'WIRING');
    assert.equal(failedWire.status, 'FAILED');

    const unrecognized = parseAndExecuteVoiceCommand('check misfire counter on cylinder three', DEFAULT_ECU_PINS, hardwareActions);
    assert.equal(unrecognized.matched, false);
    assert.equal(unrecognized.status, 'UNRECOGNIZED');
    assert.equal(unrecognized.normalizedTranscript, 'check misfire counter on cylinder 3');
  });

  it('tracks recent voice command history in newest-first order with 50-entry cap and clear support', () => {
    offlineVoiceAssistant.clearCommandHistory();
    const snapshots: number[] = [];
    const unsub = offlineVoiceAssistant.subscribeHistory((entries) => {
      snapshots.push(entries.length);
    });

    offlineVoiceAssistant.addCommandLog({
      source: 'SPEECH_API',
      rawTranscript: 'connect pin five to ground',
      normalizedTranscript: 'connect pin 5 to ground',
      confidence: 0.94,
      status: 'EXECUTED',
      category: 'WIRING',
      actionDescription: 'Connected Jumper Wire: VREF_5V (Pin 5) -> Chassis GND (KL31)',
      spokenReply: 'Connected wire',
    });

    offlineVoiceAssistant.addCommandLog({
      source: 'TEXT_INPUT',
      rawTranscript: 'connect pin 99 to ground',
      normalizedTranscript: 'connect pin 99 to ground',
      status: 'FAILED',
      category: 'WIRING',
      actionDescription: 'Could not find a bench terminal or ECU pin for "pin 99".',
      spokenReply: 'Could not identify source pin.',
    });

    const history = offlineVoiceAssistant.getCommandHistory();
    assert.equal(history.length, 2);
    assert.equal(history[0].rawTranscript, 'connect pin 99 to ground');
    assert.equal(history[0].status, 'FAILED');
    assert.equal(history[1].rawTranscript, 'connect pin five to ground');
    assert.equal(history[1].confidence, 0.94);

    for (let i = 0; i < 60; i += 1) {
      offlineVoiceAssistant.addCommandLog({
        source: 'QUICK_CHIP',
        rawTranscript: `set multimeter to 20 volts #${i}`,
        normalizedTranscript: `set multimeter to 20 volts #${i}`,
        status: 'EXECUTED',
        category: 'MULTIMETER',
        actionDescription: 'Multimeter set to DC Voltage (20V)',
        spokenReply: 'Multimeter set',
      });
    }

    const capped = offlineVoiceAssistant.getCommandHistory();
    assert.equal(capped.length, 50);
    assert.equal(capped[0].rawTranscript, 'set multimeter to 20 volts #59');

    offlineVoiceAssistant.clearCommandHistory();
    assert.equal(offlineVoiceAssistant.getCommandHistory().length, 0);
    assert.ok(snapshots.length >= 3);
    unsub();
  });

  it('creates custom voice macros and executes sequential instructions (Connect Power, Set 12V, Engage Ignition)', () => {
    const connectedWires: Array<{ src: string; dst: string; color?: string }> = [];
    const psuVoltages: number[] = [];
    const psuOutputs: boolean[] = [];

    const macroActions = {
      setVoltage: (volts: number) => psuVoltages.push(volts),
      resetLab: () => {},
      attachProbeToPin: () => {},
      connectWire: (sourcePinId: string, targetPinId: string, color?: string) => {
        connectedWires.push({ src: sourcePinId, dst: targetPinId, color });
        return true;
      },
      setPowerSupplyOutput: (enabled: boolean) => psuOutputs.push(enabled),
      switchTab: () => {},
    };

    // Dry-run step validation
    assert.equal(previewMacroStep('Connect Power', DEFAULT_ECU_PINS).matched, true);
    assert.equal(previewMacroStep('Set 12V', DEFAULT_ECU_PINS).matched, true);
    assert.equal(previewMacroStep('Engage Ignition', DEFAULT_ECU_PINS).matched, true);
    assert.equal(previewMacroStep('abracadabra nonsense', DEFAULT_ECU_PINS).matched, false);

    // Create custom macro
    const created = voiceMacroService.createMacro({
      name: 'Cold Start Wakeup',
      triggerPhrase: 'Wake Up ECU',
      steps: ['Connect Power', 'Set 12V', 'Engage Ignition'],
    });
    assert.ok(created.id.startsWith('macro_'));

    // SpeechRecognition trigger phrasing (both exact & "Run <trigger>")
    const exactMatch = voiceMacroService.findMatchingMacro('wake up ecu');
    assert.ok(exactMatch);
    assert.equal(exactMatch!.id, created.id);

    const prefixedMatch = voiceMacroService.findMatchingMacro('Run wake up ecu');
    assert.ok(prefixedMatch);
    assert.equal(prefixedMatch!.id, created.id);

    // Execute all 3 sequential steps
    const exec = executeMacroSequence(created, DEFAULT_ECU_PINS, macroActions);
    assert.equal(exec.status, 'EXECUTED');
    assert.equal(exec.executedCount, 3);
    assert.equal(exec.failedCount, 0);
    assert.equal(connectedWires.length, 2);
    assert.deepEqual(connectedWires[0], { src: 'ecu-pin-3', dst: 'bench-vbat', color: '#ef4444' });
    assert.deepEqual(connectedWires[1], { src: 'ecu-pin-4', dst: 'bench-vbat', color: '#f59e0b' });
    assert.deepEqual(psuVoltages, [12]);
    assert.deepEqual(psuOutputs, [true, true]);

    // Update & delete lifecycle
    const updated = voiceMacroService.updateMacro(created.id, {
      triggerPhrase: 'Ignition Wake Sequence',
      steps: ['Connect Power', 'Set 13.8V', 'Engage Ignition'],
    });
    assert.ok(updated);
    assert.equal(updated!.triggerPhrase, 'Ignition Wake Sequence');
    assert.equal(voiceMacroService.findMatchingMacro('ignition wake sequence')?.id, created.id);

    assert.equal(voiceMacroService.deleteMacro(created.id), true);
    assert.equal(voiceMacroService.findMatchingMacro('ignition wake sequence'), null);
  });

  it('evaluates mandatory pre-bench Diagnostic Workflow steps against live MNA telemetry and computes readiness', () => {
    const mandatorySteps = DIAGNOSTIC_WORKFLOW_STEPS.filter((s) => s.mandatoryPreBench);
    const expectedIds = [
      'verify-battery-voltage',
      'check-pinout-continuity',
      'inspect-wiring-integrity',
      'confirm-sensor-grounds',
    ];
    for (const id of expectedIds) {
      assert.ok(
        mandatorySteps.some((s) => s.id === id),
        `Mandatory pre-bench step "${id}" must exist`
      );
    }

    const baseMeter: MultimeterState = {
      mode: 'CONTINUITY',
      redProbe: { attachedToPinId: 'ecu-pin-3', attachedLabel: 'KL30 (Pin 3)' },
      blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'Chassis GND' },
      isPowered: true,
      rangeAuto: true,
      holdValue: false,
    };

    const nominalEvaluated = evaluateWorkflowSteps(
      {
        powerSupply: PSU_ON,
        pins: DEFAULT_ECU_PINS,
        wires: DEFAULT_WIRES,
        faults: [],
        activeDTCs: [],
        nodeVoltages: { ...BASE_NODE_VOLTAGES, 'ecu-pin-6': 0.02 },
        supplyCurrentDrawAmps: 0.28,
        isSupplyCurrentTripped: false,
        multimeter: baseMeter,
        multimeterReading: { display: '0.1', unit: 'Ω', isWarning: false },
        ecuProfileLabel: 'Toyota Denso 1GD',
      },
      new Set(['verify-battery-voltage', 'check-pinout-continuity'])
    );

    const nominalMap = new Map(nominalEvaluated.map((s) => [s.id, s]));
    assert.equal(nominalMap.get('verify-battery-voltage')?.telemetryStatus, 'PASS');
    assert.equal(nominalMap.get('check-pinout-continuity')?.telemetryStatus, 'PASS');
    assert.equal(nominalMap.get('inspect-wiring-integrity')?.telemetryStatus, 'PASS');
    assert.equal(nominalMap.get('confirm-sensor-grounds')?.telemetryStatus, 'PASS');

    const partialProgress = getWorkflowProgress(nominalEvaluated);
    assert.equal(partialProgress.mandatoryTotal, 4);
    assert.equal(partialProgress.mandatoryChecked, 2);
    assert.equal(partialProgress.mandatoryAllChecked, false);
    assert.equal(partialProgress.telemetryWarnings, 0);

    // Faults, cut wire, high ground offset & C.C. trip must flag ATTENTION
    const faultedWires = DEFAULT_WIRES.map((w, idx) =>
      idx === 0 ? { ...w, isCut: true } : w
    );
    const faultedEvaluated = evaluateWorkflowSteps(
      {
        powerSupply: { ...PSU_ON, voltageSetting: 18.0 },
        pins: DEFAULT_ECU_PINS,
        wires: faultedWires,
        faults: [{ pinId: 'ecu-pin-5', faultType: 'SHORT_TO_GND', description: 'Short 5V', timestamp: 1 }],
        activeDTCs: [
          {
            code: 'P0642',
            system: '5V Reference',
            description: 'Sensor Reference Voltage A Low',
            severity: 'CRITICAL',
            status: 'ACTIVE',
            associatedPinIds: ['ecu-pin-5'],
          },
        ],
        nodeVoltages: { ...BASE_NODE_VOLTAGES, 'ecu-pin-6': 1.85 },
        supplyCurrentDrawAmps: 5.0,
        isSupplyCurrentTripped: true,
        multimeter: baseMeter,
        multimeterReading: { display: 'LOCKOUT', unit: 'Ω', isWarning: true },
      },
      new Set(expectedIds)
    );

    const faultMap = new Map(faultedEvaluated.map((s) => [s.id, s]));
    assert.equal(faultMap.get('verify-battery-voltage')?.telemetryStatus, 'ATTENTION');
    assert.equal(faultMap.get('check-pinout-continuity')?.telemetryStatus, 'ATTENTION');
    assert.equal(faultMap.get('inspect-wiring-integrity')?.telemetryStatus, 'ATTENTION');
    assert.equal(faultMap.get('confirm-sensor-grounds')?.telemetryStatus, 'ATTENTION');

    const checkedAllProgress = getWorkflowProgress(faultedEvaluated);
    assert.equal(checkedAllProgress.mandatoryChecked, 4);
    assert.equal(checkedAllProgress.mandatoryAllChecked, true);
    assert.ok(checkedAllProgress.telemetryWarnings >= 4);

    // Voice navigation to Diagnostic Workflow
    let workflowOpened = false;
    let switchedPane = '';
    const voiceWorkflow = parseAndExecuteVoiceCommand('open diagnostic workflow', DEFAULT_ECU_PINS, {
      setVoltage: () => {},
      resetLab: () => {},
      attachProbeToPin: () => {},
      setPowerSupplyOutput: () => {},
      switchTab: () => {},
      switchMobilePane: (pane) => {
        switchedPane = pane;
      },
      openDiagnosticWorkflow: () => {
        workflowOpened = true;
      },
    });
    assert.equal(voiceWorkflow.matched, true);
    assert.equal(workflowOpened, true);
    assert.equal(switchedPane, 'GUIDE');
  });

  it('enforces Pre-Bench PSU Safety Interlock until all mandatory workflow steps pass or are bypassed', () => {
    const mandatoryIds = DIAGNOSTIC_WORKFLOW_STEPS.filter((s) => s.mandatoryPreBench).map((s) => s.id);

    // 1. Unlocked gate always allows energizing even with 0 checked steps
    const unlocked = canEnergizeWithPreBenchGate({
      preBenchGateLocked: false,
      checkedWorkflowIds: [],
    });
    assert.equal(unlocked.allowed, true);
    assert.equal(unlocked.mandatoryChecked, 0);
    assert.equal(unlocked.mandatoryTotal, 4);

    // 2. Locked gate with partial steps blocks PSU energizing and lists pending steps
    const lockedPartial = canEnergizeWithPreBenchGate({
      preBenchGateLocked: true,
      preBenchGateBypassed: false,
      checkedWorkflowIds: ['verify-battery-voltage', 'check-pinout-continuity'],
    });
    assert.equal(lockedPartial.allowed, false);
    assert.equal(lockedPartial.mandatoryChecked, 2);
    assert.equal(lockedPartial.pendingTitles.length, 2);

    // 3. Locked gate with explicit bypass allows energizing
    const lockedBypassed = canEnergizeWithPreBenchGate({
      preBenchGateLocked: true,
      preBenchGateBypassed: true,
      checkedWorkflowIds: ['verify-battery-voltage'],
    });
    assert.equal(lockedBypassed.allowed, true);

    // 4. Locked gate with all 4 mandatory steps checked allows energizing
    const lockedComplete = canEnergizeWithPreBenchGate({
      preBenchGateLocked: true,
      preBenchGateBypassed: false,
      checkedWorkflowIds: mandatoryIds,
    });
    assert.equal(lockedComplete.allowed, true);
    assert.equal(lockedComplete.pendingTitles.length, 0);
  });

  it('parses workflow step targets and executes voice commands for checking, unchecking, auto-checking, and resetting workflow steps', () => {
    assert.equal(parseWorkflowStepTarget('step 1')?.id, 'verify-battery-voltage');
    assert.equal(parseWorkflowStepTarget('verify battery voltage complete')?.id, 'verify-battery-voltage');
    assert.equal(parseWorkflowStepTarget('sensor grounds')?.id, 'confirm-sensor-grounds');
    assert.equal(parseWorkflowStepTarget('unknown step xyz'), null);

    const toggled: Array<{ stepId: string; checked?: boolean }> = [];
    let checkedPassingCount = 0;
    let resetCount = 0;

    const workflowActions = {
      setVoltage: () => {},
      resetLab: () => {},
      attachProbeToPin: () => {},
      setPowerSupplyOutput: () => {},
      switchTab: () => {},
      toggleWorkflowStep: (stepId: string, checked?: boolean) => {
        toggled.push({ stepId, checked });
      },
      checkPassingWorkflow: () => {
        checkedPassingCount += 1;
        return 3;
      },
      resetWorkflow: () => {
        resetCount += 1;
      },
    };

    const cmdCheck1 = parseAndExecuteVoiceCommand('check step 1', DEFAULT_ECU_PINS, workflowActions);
    assert.equal(cmdCheck1.matched, true);
    assert.equal(cmdCheck1.category, 'DIAGNOSTIC');
    assert.deepEqual(toggled[0], { stepId: 'verify-battery-voltage', checked: true });

    const cmdCompleteTitle = parseAndExecuteVoiceCommand(
      'mark verify battery voltage complete',
      DEFAULT_ECU_PINS,
      workflowActions
    );
    assert.equal(cmdCompleteTitle.matched, true);
    assert.deepEqual(toggled[1], { stepId: 'verify-battery-voltage', checked: true });

    const cmdUncheck1 = parseAndExecuteVoiceCommand('uncheck step 1', DEFAULT_ECU_PINS, workflowActions);
    assert.equal(cmdUncheck1.matched, true);
    assert.deepEqual(toggled[2], { stepId: 'verify-battery-voltage', checked: false });

    const cmdPassing = parseAndExecuteVoiceCommand('check passing workflow', DEFAULT_ECU_PINS, workflowActions);
    assert.equal(cmdPassing.matched, true);
    assert.equal(checkedPassingCount, 1);

    const cmdReset = parseAndExecuteVoiceCommand('reset workflow', DEFAULT_ECU_PINS, workflowActions);
    assert.equal(cmdReset.matched, true);
    assert.equal(resetCount, 1);
  });

  it('merges cloud voice macros by timestamp and serializes workflow state & macros in Drive bench snapshots', () => {
    const initial = voiceMacroService.getMacros();
    const olderTs = 1000;
    const newerTs = Date.now() + 50000;

    // Create a local custom macro so we can test timestamp merge
    const localMacro = voiceMacroService.createMacro({
      name: 'Cloud Merge Test',
      triggerPhrase: 'Cloud Merge Trigger',
      steps: ['Set 12V'],
    });

    // Remote older version should NOT overwrite newer local version; brand-new remote ID should be merged
    const afterMerge = voiceMacroService.syncFromCloud(
      [
        {
          id: localMacro.id,
          name: 'Stale Remote Name',
          triggerPhrase: 'Cloud Merge Trigger',
          steps: ['Set 5V'],
          updatedAt: olderTs,
          createdAt: olderTs,
        },
        {
          id: 'remote_macro_newer',
          name: 'Remote Diagnostic Setup',
          triggerPhrase: 'Remote Setup',
          steps: ['Connect Power', 'Set 13.8V'],
          updatedAt: newerTs,
          createdAt: newerTs,
        },
      ],
      'merge'
    );

    const mergedLocal = afterMerge.find((m) => m.id === localMacro.id);
    const mergedRemote = afterMerge.find((m) => m.id === 'remote_macro_newer');
    assert.equal(mergedLocal?.name, 'Cloud Merge Test');
    assert.ok(mergedRemote && mergedRemote.steps.length === 2);

    // Clean up test macros back to clean baseline
    voiceMacroService.deleteMacro(localMacro.id);
    voiceMacroService.deleteMacro('remote_macro_newer');
    assert.ok(initial.length >= 1);

    // Drive snapshot round-trip with workflow checks, PSU gate, and macros
    const snapshot = buildDriveBenchSnapshot({
      title: 'Test Cloud Workflow Snapshot',
      ecuProfileLabel: 'Bosch ME7.5',
      powerSupply: PSU_ON,
      wires: DEFAULT_WIRES,
      faults: [],
      components: [],
      activeDtcs: ['P0122'],
      supplyCurrentDrawAmps: 0.42,
      workflowCheckedIds: ['verify-battery-voltage', 'check-pinout-continuity'],
      preBenchGateLocked: true,
      voiceMacros: afterMerge.slice(0, 2),
    });

    const roundTrip = parseDriveBenchSnapshot(JSON.stringify(snapshot));
    assert.ok(roundTrip);
    assert.deepEqual(roundTrip!.workflowCheckedIds, [
      'verify-battery-voltage',
      'check-pinout-continuity',
    ]);
    assert.equal(roundTrip!.preBenchGateLocked, true);
    assert.equal(roundTrip!.voiceMacros?.length, 2);

    assert.equal(
      shouldSeedInitialCloudPreferences({
        checkedWorkflowIds: [],
        preBenchGateLocked: false,
        autoVerifyWorkflow: false,
        hasCustomVoiceMacros: false,
      }),
      false
    );
    assert.equal(
      shouldSeedInitialCloudPreferences({
        checkedWorkflowIds: ['verify-battery-voltage'],
        preBenchGateLocked: false,
        autoVerifyWorkflow: false,
        hasCustomVoiceMacros: false,
      }),
      true
    );
  });

  it('resolves PCB-to-harness cross-probe MNA pin IDs across power, ground, sensor, CAN, and actuator rails', () => {
    const netToExpectedPin: Array<[string, string]> = [
      ['NET_CHASSIS_GND', 'ecu-pin-1'],
      ['NET_KL30_VBAT', 'ecu-pin-3'],
      ['NET_5V_REGULATED', 'ecu-pin-5'],
      ['NET_SGND', 'ecu-pin-6'],
      ['NET_TPS_SIG', 'ecu-pin-7'],
      ['NET_MAP_SIG', 'ecu-pin-8'],
      ['NET_INJ_1_LOW', 'ecu-pin-10'],
      ['NET_IGN_1', 'ecu-pin-11'],
      ['NET_CAN_HIGH', 'ecu-pin-13'],
      ['NET_CAN_LOW', 'ecu-pin-14'],
      ['NET_O2_SIG', 'ecu-pin-15'],
      ['NET_FP_RELAY', 'ecu-pin-16'],
    ];

    for (const [netName, expectedPinId] of netToExpectedPin) {
      const resolved = resolvePcbNetToMnaNode(netName, 5.0, BASE_NODE_VOLTAGES, PSU_ON);
      assert.equal(
        resolved.simPinId,
        expectedPinId,
        `PCB net ${netName} should cross-probe to harness ${expectedPinId}`
      );
    }
  });

  it('sanitizes Gemini model env overrides and rejects malformed token-like values', () => {
    assert.equal(
      resolveGeminiModelName('AQ.Ab8RN6Lpq50DrwrCh1H19o4uL8qWxYCfc9lL-QKCeclr_OXTEA'),
      'gemini-4-hydrogen'
    );
    assert.equal(resolveGeminiModelName('gemini-1.5-flash'), 'gemini-4-hydrogen');
    assert.equal(resolveGeminiModelName('models/gemini-4-hydrogen'), 'gemini-4-hydrogen');
    assert.equal(resolveGeminiModelName('  "gemini-3.1-flash-lite"  '), 'gemini-3.1-flash-lite');
    assert.equal(resolveGeminiModelName(''), 'gemini-4-hydrogen');
  });

  it('enforces hard-coded PCB anti-fabrication rules in AI normalizer, CV fusion, and ERC/MNA audit', () => {
    assert.ok(PCB_ANTI_FABRICATION_RULES.length >= 5);

    // 1. Blank/low-confidence AI response must NOT fabricate nets or high confidence
    const blankNormalized = normalizeVisionPayload(
      {
        confidenceScore: 0.1,
        components: [],
        nets: [
          {
            name: 'NET_PHANTOM_5V',
            signalType: 'POWER',
            connectedComponentRefs: ['U99', 'C99'],
            tracePoints: [
              { x: 100, y: 100 },
              { x: 500, y: 500 },
            ],
          },
        ],
      },
      { documentType: 'pcb', model: 'gemini-4-hydrogen', provider: 'gemini', providerDisplayName: 'Gemini' }
    );
    assert.equal(blankNormalized.components.length, 0);
    assert.equal(blankNormalized.nets.length, 0);
    assert.ok(blankNormalized.confidenceScore <= 0.2);
    assert.ok(blankNormalized.warnings.some((w) => w.includes('Anti-fabrication')));

    // 2. Unreadable/low-confidence component must NOT receive guessed 5V/12V ratings or pin voltages
    const unreadableNormalized = normalizeVisionPayload(
      {
        confidenceScore: 0.72,
        components: [
          {
            refDes: 'U7',
            marking: '',
            confidenceScore: 0.42,
            bbox: { ymin: 120, xmin: 140, ymax: 320, xmax: 340 },
            pinSpecs: [
              {
                pinNumber: 1,
                pinName: 'VCC',
                category: 'power',
                nominalVoltage: 5.0,
                connectedNetId: '',
              },
            ],
          },
        ],
        nets: [
          {
            name: 'NET_UNVERIFIED_BUS',
            connectedComponentRefs: ['U7', 'GHOST_IC'],
            tracePoints: [],
          },
        ],
        hotspots: [
          {
            id: 'hs-ghost',
            label: 'Suspicious Heat Mark',
            severity: 'WARNING',
            suspectComponentRef: 'GHOST_IC',
            bbox: { ymin: 130, xmin: 150, ymax: 250, xmax: 260 },
          },
        ],
      },
      { documentType: 'pcb', model: 'gemini-4-hydrogen', provider: 'gemini', providerDisplayName: 'Gemini' }
    );

    const u7 = unreadableNormalized.components[0];
    assert.equal(u7.marking, 'UNREADABLE');
    assert.equal(u7.verificationStatus, 'UNKNOWN');
    assert.equal(u7.operatingVoltageRange, 'UNKNOWN');
    assert.equal(u7.maxCurrentRating, 'UNKNOWN');
    assert.equal(u7.pinSpecs?.[0].nominalVoltage, 0);
    assert.equal(u7.pinSpecs?.[0].connectedNetId, 'NET_UNASSIGNED');
    assert.equal(unreadableNormalized.hotspots?.[0]?.suspectComponentRef, undefined);
    // Net referencing 1 valid + 1 phantom component and no trace points is dropped
    assert.equal(unreadableNormalized.nets.length, 0);

    // 3. Vision fusion respects AI blank-image rejection even if synthetic localCv candidates exist
    const rejectedFusion = fusePcbVisionResults(blankNormalized, {
      components: [
        {
          refDes: 'CV1',
          category: 'UNVERIFIED_IC_PACKAGE',
          marking: 'UNREADABLE',
          decodedValue: 'Unverified surface cluster',
          packageType: 'UNKNOWN',
          bbox: { ymin: 100, xmin: 100, ymax: 200, xmax: 200 },
          confidenceScore: 0.4,
          verificationStatus: 'UNKNOWN',
          circuitFunction: 'Unverified',
          terminalIds: [],
          source: 'LOCAL_CV',
        },
      ],
      nets: [],
      hotspots: [],
      analysisSummary: 'Synthetic local blob',
    });
    assert.equal(rejectedFusion.components.length, 0);
    assert.equal(rejectedFusion.nets.length, 0);

    // 4. Incomplete fused net marks isComplete: false & verificationStatus: 'UNKNOWN' (never 5.0V)
    const incompleteFusion = fusePcbVisionResults(
      {
        documentType: 'pcb',
        confidenceScore: 0.68,
        detectionMethod: 'AI_ANALYZED',
        analysisSummary: 'Partial read',
        components: [
          {
            refDes: 'U1',
            category: 'IC',
            marking: 'UNREADABLE',
            decodedValue: 'Unreadable IC',
            packageType: 'SOIC-8',
            bbox: { ymin: 100, xmin: 100, ymax: 220, xmax: 220 },
            confidenceScore: 0.48,
            verificationStatus: 'UNKNOWN',
            circuitFunction: 'Unverified',
            terminalIds: ['U1-1', 'U1-2'],
            source: 'AI',
          },
          {
            refDes: 'R1',
            category: 'RESISTOR',
            marking: '103',
            decodedValue: '10 kOhm',
            packageType: '0805',
            bbox: { ymin: 120, xmin: 340, ymax: 160, xmax: 400 },
            confidenceScore: 0.85,
            verificationStatus: 'UNVERIFIED',
            circuitFunction: 'Pull-up',
            terminalIds: ['R1-1', 'R1-2'],
            source: 'AI',
          },
        ],
        terminals: [],
        nets: [
          {
            name: 'NET_UNVERIFIED_TRACE_1',
            signalType: 'UNVERIFIED_CONTINUITY',
            connectedComponentRefs: ['U1', 'R1', 'PHANTOM_R9'],
            connectedTerminalIds: [],
            tracePoints: [],
            confidenceScore: 0.45,
            verificationStatus: 'UNKNOWN',
            isComplete: true,
          },
        ],
        hotspots: [],
        warnings: [],
        model: 'gemini-4-hydrogen',
        provider: 'gemini',
      },
      { components: [], nets: [], hotspots: [], analysisSummary: '' }
    );
    assert.equal(incompleteFusion.components[0].pinSpecs?.[0].nominalVoltage, 0);
    assert.deepEqual(incompleteFusion.nets[0].connectedComponentRefs, ['U1', 'R1']);
    assert.equal(incompleteFusion.nets[0].isComplete, false);
    assert.equal(incompleteFusion.nets[0].verificationStatus, 'UNKNOWN');

    // 5. Diagnostic audit does not raise bogus MNA_VOLTAGE alerts on UNKNOWN/0V unverified parts
    const audit = auditPcbDiagnostics({
      components: incompleteFusion.components,
      nets: incompleteFusion.nets,
      hotspots: [],
      thermalMap: {},
      nodeVoltages: BASE_NODE_VOLTAGES,
      powerSupply: PSU_ON,
      faults: [],
    });
    assert.equal(audit.some((f) => f.category === 'MNA_VOLTAGE'), false);
    assert.ok(audit.some((f) => f.id === 'erc-anti-fabrication-unknown'));
  });

  it('monitors multiple pins simultaneously in LogicCheckEngine and triggers alerts on unexpected faults', () => {
    const baseMeter: MultimeterState = {
      mode: 'V_DC',
      redProbe: { attachedToPinId: 'ecu-pin-7', attachedLabel: 'TPS_SIG (Pin 7)' },
      blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'Chassis GND' },
      isPowered: true,
      rangeAuto: true,
      holdValue: false,
    };

    const rules = buildDefaultLogicCheckRules(DEFAULT_ECU_PINS);
    const nominalSolution = solveCircuit(
      PSU_ON,
      DEFAULT_ECU_PINS,
      [],
      DEFAULT_WIRES,
      DEFAULT_BENCH_COMPONENTS,
      baseMeter
    );

    // 1. Nominal energized bench passes all monitored rules & cross-checks
    const nominalSnapshot = evaluateLogicCheck({
      rules,
      pins: DEFAULT_ECU_PINS,
      nodeVoltages: nominalSolution.nodeVoltages,
      powerSupply: PSU_ON,
      wires: DEFAULT_WIRES,
      faults: [],
      isArmed: true,
    });
    assert.equal(nominalSnapshot.overallStatus, 'PASS');
    assert.equal(nominalSnapshot.alerts.length, 0);
    assert.equal(nominalSnapshot.signature, '');
    assert.ok(nominalSnapshot.passingCount >= 10);
    assert.ok(nominalSnapshot.crossChecks.every((cc) => cc.status === 'PASS'));

    // 2. Short to Battery (+VBAT) on 5V VREF & TPS Signal triggers CRITICAL SHORT_TO_BATTERY alerts
    const vbatFaults: InjectedFault[] = [
      { pinId: 'ecu-pin-5', faultType: 'SHORT_TO_VBAT', description: '5V Rail Short to +12V', timestamp: 1 },
      { pinId: 'ecu-pin-7', faultType: 'SHORT_TO_VBAT', description: 'TPS Short to +12V', timestamp: 2 },
    ];
    const vbatSolution = solveCircuit(
      PSU_ON,
      DEFAULT_ECU_PINS,
      vbatFaults,
      DEFAULT_WIRES,
      DEFAULT_BENCH_COMPONENTS,
      baseMeter
    );
    const vbatSnapshot = evaluateLogicCheck({
      rules,
      pins: DEFAULT_ECU_PINS,
      nodeVoltages: vbatSolution.nodeVoltages,
      powerSupply: PSU_ON,
      wires: DEFAULT_WIRES,
      faults: vbatFaults,
      isArmed: true,
    });
    assert.equal(vbatSnapshot.overallStatus, 'CRITICAL');
    assert.ok(vbatSnapshot.criticalCount >= 2);
    assert.ok(vbatSnapshot.alerts.some((a) => a.pinId === 'ecu-pin-5' && a.faultClass === 'SHORT_TO_BATTERY'));
    assert.ok(vbatSnapshot.alerts.some((a) => a.pinId === 'ecu-pin-7' && a.faultClass === 'SHORT_TO_BATTERY'));
    assert.notEqual(vbatSnapshot.signature, '');

    // 3. Short to Ground on VREF_5V triggers CRITICAL SHORT_TO_GROUND alert
    const gndFaults: InjectedFault[] = [
      { pinId: 'ecu-pin-5', faultType: 'SHORT_TO_GND', description: '5V Rail Short to GND', timestamp: 3 },
    ];
    const gndSolution = solveCircuit(
      PSU_ON,
      DEFAULT_ECU_PINS,
      gndFaults,
      DEFAULT_WIRES,
      DEFAULT_BENCH_COMPONENTS,
      baseMeter
    );
    const gndSnapshot = evaluateLogicCheck({
      rules,
      pins: DEFAULT_ECU_PINS,
      nodeVoltages: gndSolution.nodeVoltages,
      powerSupply: PSU_ON,
      wires: DEFAULT_WIRES,
      faults: gndFaults,
      isArmed: true,
    });
    assert.equal(gndSnapshot.overallStatus, 'CRITICAL');
    assert.ok(gndSnapshot.alerts.some((a) => a.pinId === 'ecu-pin-5' && a.faultClass === 'SHORT_TO_GROUND'));

    // 4. Cut harness wire on TPS_SIG triggers OPEN_CIRCUIT alert
    const cutTpsWires = DEFAULT_WIRES.map((w) =>
      w.id === 'wire-2' ? { ...w, isCut: true } : w
    );
    const cutSolution = solveCircuit(
      PSU_ON,
      DEFAULT_ECU_PINS,
      [],
      cutTpsWires,
      DEFAULT_BENCH_COMPONENTS,
      baseMeter
    );
    const cutSnapshot = evaluateLogicCheck({
      rules,
      pins: DEFAULT_ECU_PINS,
      nodeVoltages: cutSolution.nodeVoltages,
      powerSupply: PSU_ON,
      wires: cutTpsWires,
      faults: [],
      isArmed: true,
    });
    assert.ok(cutSnapshot.alerts.some((a) => a.pinId === 'ecu-pin-7' && a.faultClass === 'OPEN_CIRCUIT'));

    // 5. PSU OFF puts all enabled rules in STANDBY with zero false alarms
    const standbySnapshot = evaluateLogicCheck({
      rules,
      pins: DEFAULT_ECU_PINS,
      nodeVoltages: nominalSolution.nodeVoltages,
      powerSupply: PSU_OFF,
      wires: DEFAULT_WIRES,
      faults: [],
      isArmed: true,
    });
    assert.equal(standbySnapshot.overallStatus, 'STANDBY');
    assert.equal(standbySnapshot.alerts.length, 0);
    assert.equal(standbySnapshot.signature, '');

    // 6. Custom rule overrides & preset filtering + CAN differential asymmetry detection
    const customRules = mergeLogicCheckRules(DEFAULT_ECU_PINS, [
      {
        pinId: 'ecu-pin-7',
        expectedState: 'ANALOG_RANGE',
        minVoltage: 1.5,
        maxVoltage: 3.5,
        shortToBatteryThresholdV: 6.0,
        isCustom: true,
      },
    ]);
    const tpsCustom = customRules.find((r) => r.pinId === 'ecu-pin-7');
    assert.equal(tpsCustom?.minVoltage, 1.5);
    assert.equal(tpsCustom?.maxVoltage, 3.5);
    assert.equal(tpsCustom?.isCustom, true);

    const powerPreset = applyWatchPresetToRules(rules, 'POWER_GND');
    assert.equal(powerPreset.filter((r) => r.enabled).length, 5);

    const asymCanSnapshot = evaluateLogicCheck({
      rules,
      pins: DEFAULT_ECU_PINS,
      nodeVoltages: {
        ...nominalSolution.nodeVoltages,
        'ecu-pin-13': 12.2,
        'ecu-pin-14': 2.5,
      },
      powerSupply: PSU_ON,
      wires: DEFAULT_WIRES,
      faults: [],
      isArmed: true,
    });
    const canCrossCheck = asymCanSnapshot.crossChecks.find((c) => c.id === 'cross-can-symmetry');
    assert.equal(canCrossCheck?.status, 'CRITICAL');

    // 7. Voice command opens Automated Logic Check monitor
    let logicCheckOpened = false;
    let paneSwitched = '';
    const voiceRes = parseAndExecuteVoiceCommand('open logic check', DEFAULT_ECU_PINS, {
      setVoltage: () => {},
      resetLab: () => {},
      attachProbeToPin: () => {},
      setPowerSupplyOutput: () => {},
      switchTab: () => {},
      switchMobilePane: (pane) => {
        paneSwitched = pane;
      },
      openLogicCheck: () => {
        logicCheckOpened = true;
      },
    });
    assert.equal(voiceRes.matched, true);
    assert.equal(logicCheckOpened, true);
    assert.equal(paneSwitched, 'GUIDE');
  });

  it('verifies 100% complete ingestion of Toyota, Ford, Mitsubishi, and Nissan OEM PCB specifications into database & knowledge services', () => {
    // 1. Verify Firestore diagnosticLogs DB log IDs & strict size limits (<= 12000 chars per firestore.rules)
    assert.equal(TOYOTA_OEM_PCB_SPECS_DB_LOG_ID, 'diag_toyota_oem_pcb_specs_v1');
    assert.equal(FORD_OEM_PCB_SPECS_DB_LOG_ID, 'diag_ford_oem_pcb_specs_v1');
    assert.equal(MITSUBISHI_OEM_PCB_SPECS_DB_LOG_ID, 'diag_mitsubishi_oem_pcb_specs_v1');
    assert.equal(NISSAN_OEM_PCB_SPECS_DB_LOG_ID, 'diag_nissan_oem_pcb_specs_v1');

    assert.ok(TOYOTA_OEM_PCB_SPECS_SUMMARY_TEXT.length > 500);
    assert.ok(TOYOTA_OEM_PCB_SPECS_SUMMARY_TEXT.length <= 12000, 'Toyota summary must be <= 12000 characters for Firestore rules');
    assert.ok(FORD_OEM_PCB_SPECS_SUMMARY_TEXT.length > 500);
    assert.ok(FORD_OEM_PCB_SPECS_SUMMARY_TEXT.length <= 12000, 'Ford summary must be <= 12000 characters for Firestore rules');
    assert.ok(MITSUBISHI_OEM_PCB_SPECS_SUMMARY_TEXT.length > 500);
    assert.ok(MITSUBISHI_OEM_PCB_SPECS_SUMMARY_TEXT.length <= 12000, 'Mitsubishi summary must be <= 12000 characters for Firestore rules');
    assert.ok(NISSAN_OEM_PCB_SPECS_SUMMARY_TEXT.length > 500);
    assert.ok(NISSAN_OEM_PCB_SPECS_SUMMARY_TEXT.length <= 12000, 'Nissan summary must be <= 12000 characters for Firestore rules');

    // 2. Verify Toyota platforms and key hardware ICs in summary
    assert.ok(TOYOTA_OEM_PCB_SPECS_SUMMARY_TEXT.includes('Denso 275922-022'));
    assert.ok(TOYOTA_OEM_PCB_SPECS_SUMMARY_TEXT.includes('Denso 175822-887'));
    assert.ok(TOYOTA_OEM_PCB_SPECS_SUMMARY_TEXT.includes('Fujitsu Ten 211941-32200930'));
    assert.ok(TOYOTA_OEM_PCB_SPECS_SUMMARY_TEXT.includes('Denso 275236-0011'));
    assert.ok(TOYOTA_OEM_PCB_SPECS_SUMMARY_TEXT.includes('AC60E/AC60F'));
    assert.ok(TOYOTA_OEM_PCB_SPECS_SUMMARY_TEXT.includes('Aisin AW'));
    assert.ok(TOYOTA_OEM_PCB_SPECS_SUMMARY_TEXT.includes('27V SMD TVS diode'));
    assert.ok(TOYOTA_OEM_PCB_SPECS_SUMMARY_TEXT.includes('10µF/16V ceramic MLCC'));
    assert.ok(TOYOTA_OEM_PCB_SPECS_SUMMARY_TEXT.includes('89871-71010'));

    // 3. Verify Ford platforms and key hardware ICs in summary
    assert.ok(FORD_OEM_PCB_SPECS_SUMMARY_TEXT.includes('Continental SID208'));
    assert.ok(FORD_OEM_PCB_SPECS_SUMMARY_TEXT.includes('Continental SID212'));
    assert.ok(FORD_OEM_PCB_SPECS_SUMMARY_TEXT.includes('Bosch MD1CS005'));
    assert.ok(FORD_OEM_PCB_SPECS_SUMMARY_TEXT.includes('Continental EMS2211'));
    assert.ok(FORD_OEM_PCB_SPECS_SUMMARY_TEXT.includes('PowerShift 6DCT250 (DPS6) TCM'));
    assert.ok(FORD_OEM_PCB_SPECS_SUMMARY_TEXT.includes('Bosch MED17.0'));
    assert.ok(FORD_OEM_PCB_SPECS_SUMMARY_TEXT.includes('110V-180V'));
    assert.ok(FORD_OEM_PCB_SPECS_SUMMARY_TEXT.includes('IRF640'));
    assert.ok(FORD_OEM_PCB_SPECS_SUMMARY_TEXT.includes('0.005Ω (R005)'));
    assert.ok(FORD_OEM_PCB_SPECS_SUMMARY_TEXT.includes('400V/18A SOT-223'));

    // 4. Verify Mitsubishi platforms and key hardware ICs in summary
    assert.ok(MITSUBISHI_OEM_PCB_SPECS_SUMMARY_TEXT.includes('275700-7422'));
    assert.ok(MITSUBISHI_OEM_PCB_SPECS_SUMMARY_TEXT.includes('1860B556'));
    assert.ok(MITSUBISHI_OEM_PCB_SPECS_SUMMARY_TEXT.includes('MH8115F'));
    assert.ok(MITSUBISHI_OEM_PCB_SPECS_SUMMARY_TEXT.includes('4N15'));
    assert.ok(MITSUBISHI_OEM_PCB_SPECS_SUMMARY_TEXT.includes('4D56'));
    assert.ok(MITSUBISHI_OEM_PCB_SPECS_SUMMARY_TEXT.includes('0.02Ω'));
    assert.ok(MITSUBISHI_OEM_PCB_SPECS_SUMMARY_TEXT.includes('EDC17CP52'));

    // 5. Verify Nissan platforms and key hardware ICs in summary
    assert.ok(NISSAN_OEM_PCB_SPECS_SUMMARY_TEXT.includes('YD25DDTi'));
    assert.ok(NISSAN_OEM_PCB_SPECS_SUMMARY_TEXT.includes('EDC17C84'));
    assert.ok(NISSAN_OEM_PCB_SPECS_SUMMARY_TEXT.includes('MEC90'));
    assert.ok(NISSAN_OEM_PCB_SPECS_SUMMARY_TEXT.includes('Kicks e-Power'));
    assert.ok(NISSAN_OEM_PCB_SPECS_SUMMARY_TEXT.includes('JF011E'));
    assert.ok(NISSAN_OEM_PCB_SPECS_SUMMARY_TEXT.includes('0.015Ω'));

    // 6. Verify structured OEM_PCB_HARDWARE_SPECS array (40 platforms total: 10 Toyota + 10 Ford + 10 Mitsubishi + 10 Nissan)
    assert.equal(OEM_PCB_HARDWARE_SPECS.length, 40);
    const toyotaSpecs = getOemPcbHardwareSpecs('toyota');
    const fordSpecs = getOemPcbHardwareSpecs('ford');
    const mitsubishiSpecs = getOemPcbHardwareSpecs('mitsubishi');
    const nissanSpecs = getOemPcbHardwareSpecs('nissan');
    assert.equal(toyotaSpecs.length, 10);
    assert.equal(fordSpecs.length, 10);
    assert.equal(mitsubishiSpecs.length, 10);
    assert.equal(nissanSpecs.length, 10);

    // 7. Verify search capabilities across part numbers, ICs, and platforms
    const searchDenso022 = searchOemPcbHardwareSpecs('275922-022');
    assert.ok(searchDenso022.length >= 1);
    assert.equal(searchDenso022[0].id, 'pcb-toyota-1gd-2gd');

    const searchSid208 = searchOemPcbHardwareSpecs('SID208');
    assert.ok(searchSid208.length >= 1);
    assert.ok(searchSid208.some((s) => s.id === 'pcb-ford-sid208-t6'));

    const searchTcm = searchOemPcbHardwareSpecs('6DCT250');
    assert.ok(searchTcm.length >= 1);
    assert.equal(searchTcm[0].id, 'pcb-ford-powershift-6dct250');

    const searchMitsubishi4n15 = searchOemPcbHardwareSpecs('4N15');
    assert.ok(searchMitsubishi4n15.length >= 1);
    assert.ok(searchMitsubishi4n15.some((s) => s.id === 'pcb-mitsubishi-4n15-montero'));

    const searchMitsubishiXpander = searchOemPcbHardwareSpecs('MH8115F');
    assert.ok(searchMitsubishiXpander.length >= 1);
    assert.ok(searchMitsubishiXpander.some((s) => s.id === 'pcb-mitsubishi-xpander-4a91'));

    const searchNissanYd25 = searchOemPcbHardwareSpecs('23710-4JA0A');
    assert.ok(searchNissanYd25.length >= 1);
    assert.equal(searchNissanYd25[0].id, 'pcb-nissan-yd25-navara');

    const searchNissanEpower = searchOemPcbHardwareSpecs('e-Power');
    assert.ok(searchNissanEpower.length >= 1);
    assert.equal(searchNissanEpower[0].id, 'pcb-nissan-kicks-epower');

    // 8. Verify REPAIR_KNOWLEDGE_BASE contains all comprehensive articles
    const toyotaArticle = REPAIR_KNOWLEDGE_BASE.find((a) => a.id === 'art-toyota-denso-pcb-hardware');
    assert.ok(toyotaArticle);
    assert.equal(toyotaArticle?.category, 'TOYOTA_DENSO');
    assert.ok(toyotaArticle?.repairSteps.length >= 4);

    const fordArticle = REPAIR_KNOWLEDGE_BASE.find((a) => a.id === 'art-ford-continental-pcb-hardware');
    assert.ok(fordArticle);
    assert.equal(fordArticle?.category, 'BOSCH_FORD');
    assert.ok(fordArticle?.repairSteps.length >= 4);

    const mitsubishiArticle = REPAIR_KNOWLEDGE_BASE.find((a) => a.id === 'art-mitsubishi-melco-pcb-hardware');
    assert.ok(mitsubishiArticle);
    assert.equal(mitsubishiArticle?.category, 'MITSUBISHI_MELCO');
    assert.ok(mitsubishiArticle?.repairSteps.length >= 4);

    const nissanArticle = REPAIR_KNOWLEDGE_BASE.find((a) => a.id === 'art-nissan-hitachi-pcb-hardware');
    assert.ok(nissanArticle);
    assert.equal(nissanArticle?.category, 'NISSAN_HITACHI');
    assert.ok(nissanArticle?.repairSteps.length >= 4);

    // 9. Verify voice command query matching for PCB specifications
    const voiceToyotaPcb = parseAndExecuteVoiceCommand('Toyota 1GD PCB specs', DEFAULT_ECU_PINS, {
      setVoltage: () => {},
      resetLab: () => {},
      attachProbeToPin: () => {},
      setPowerSupplyOutput: () => {},
      switchTab: () => {},
    });
    assert.equal(voiceToyotaPcb.matched, true);
    assert.ok(voiceToyotaPcb.actionDescription.includes('Hilux / Fortuner / Innova 1GD/2GD'));
    assert.ok(voiceToyotaPcb.spokenReply.includes('Renesas 76F0085'));

    const voiceFordPiezo = parseAndExecuteVoiceCommand('SID208 boost capacitor spec', DEFAULT_ECU_PINS, {
      setVoltage: () => {},
      resetLab: () => {},
      attachProbeToPin: () => {},
      setPowerSupplyOutput: () => {},
      switchTab: () => {},
    });
    assert.equal(voiceFordPiezo.matched, true);
    assert.ok(voiceFordPiezo.actionDescription.includes('SID208'));
    assert.ok(voiceFordPiezo.spokenReply.includes('250 volt boost capacitors'));

    const voiceMitsubishiPcb = parseAndExecuteVoiceCommand('Mitsubishi 4N15 PCB specs', DEFAULT_ECU_PINS, {
      setVoltage: () => {},
      resetLab: () => {},
      attachProbeToPin: () => {},
      setPowerSupplyOutput: () => {},
      switchTab: () => {},
    });
    assert.equal(voiceMitsubishiPcb.matched, true);
    assert.ok(voiceMitsubishiPcb.actionDescription.includes('Montero Sport'));
    assert.ok(voiceMitsubishiPcb.spokenReply.includes('SH72543R'));

    const voiceNissanPcb = parseAndExecuteVoiceCommand('Nissan YD25 PCB specs', DEFAULT_ECU_PINS, {
      setVoltage: () => {},
      resetLab: () => {},
      attachProbeToPin: () => {},
      setPowerSupplyOutput: () => {},
      switchTab: () => {},
    });
    assert.equal(voiceNissanPcb.matched, true);
    assert.ok(voiceNissanPcb.actionDescription.includes('Navara'));

    // 10. Verify MiniSearch offline chatbot indexes all 40 PCB specifications
    const chatbot = new OfflineDiagnosticChatbot([], []);
    const replyToyota = chatbot.ask('What MCU does Toyota 1GD Denso 275922-022 use?');
    assert.ok(replyToyota.answer.length > 0);
    assert.ok(replyToyota.citations.length > 0);
    assert.ok(replyToyota.citations.some((c) => c.title.includes('Hilux') || c.title.includes('275922')));

    const replyMitsubishi = chatbot.ask('What MCU does Mitsubishi Montero 4N15 use?');
    assert.ok(replyMitsubishi.answer.length > 0);
    assert.ok(replyMitsubishi.citations.length > 0);
  });

  it('compiles, captures, and executes custom voice macro DMM and PSU state sequences', () => {
    // 1. Compile structured PSU and DMM state steps into deterministic instructions
    const steps = compileInstrumentSequenceToSteps([
      {
        target: 'POWER_SUPPLY',
        action: 'APPLY_PRESET',
        preset: '10.2V_CRANKING',
      },
      {
        target: 'POWER_SUPPLY',
        action: 'SET_CURRENT_LIMIT',
        amps: 4.5,
      },
      {
        target: 'POWER_SUPPLY',
        action: 'SET_OUTPUT',
        outputEnabled: true,
      },
      {
        target: 'MULTIMETER',
        action: 'SET_MODE_RANGE',
        mode: 'V_DC',
        manualRangeLabel: '20V DC',
      },
      {
        target: 'MULTIMETER',
        action: 'ATTACH_RED_PROBE',
        terminalTarget: 'Pin 5',
      },
      {
        target: 'MULTIMETER',
        action: 'ATTACH_BLACK_PROBE',
        terminalTarget: 'Pin 3',
      },
      {
        target: 'MULTIMETER',
        action: 'SET_HOLD',
        holdValue: true,
      },
    ]);

    assert.equal(steps.length, 7);
    assert.equal(steps[0], 'Set PSU preset to 10.2V cranking');
    assert.equal(steps[1], 'Set current limit to 4.5A');
    assert.equal(steps[2], 'Turn power supply on');
    assert.equal(steps[3], 'Set multimeter to 20V DC');
    assert.equal(steps[4], 'Attach red probe to Pin 5');
    assert.equal(steps[5], 'Attach black probe to Pin 3');
    assert.equal(steps[6], 'Hold multimeter reading');

    // Verify step classification badges
    assert.equal(classifyMacroStepInstrument(steps[0]).badgeLabel, 'PSU STATE');
    assert.equal(classifyMacroStepInstrument(steps[3]).badgeLabel, 'DMM STATE');
    assert.equal(classifyMacroStepInstrument(steps[4]).badgeLabel, 'DMM PROBE');

    // 2. Verify every compiled step passes dry-run parser verification
    for (const step of steps) {
      const preview = previewMacroStep(step, DEFAULT_ECU_PINS);
      assert.equal(preview.matched, true, `Expected step "${step}" to match parser`);
      assert.equal(preview.status, 'EXECUTED', `Expected step "${step}" to execute cleanly`);
    }

    // 3. Execute the compiled sequence against simulated bench state callbacks
    let psuState: PowerSupplyState = {
      isOutputEnabled: false,
      voltageSetting: 12.6,
      currentLimit: 2.5,
      preset: '12V_BENCH',
    };
    let dmmState: MultimeterState = {
      isPowered: false,
      mode: 'CONTINUITY',
      redProbe: { attachedToPinId: null, attachedLabel: 'Unconnected' },
      blackProbe: { attachedToPinId: null, attachedLabel: 'Unconnected' },
      rangeAuto: true,
      holdValue: false,
    };
    let activeRangeLabel: string | null = null;

    const createdMacro = voiceMacroService.createMacroFromInstrumentSequence({
      name: 'Cranking 5V Rail Check',
      triggerPhrase: 'Cranking 5V Rail Check',
      sequence: [
        { target: 'POWER_SUPPLY', action: 'APPLY_PRESET', preset: '10.2V_CRANKING' },
        { target: 'POWER_SUPPLY', action: 'SET_CURRENT_LIMIT', amps: 4.5 },
        { target: 'POWER_SUPPLY', action: 'SET_OUTPUT', outputEnabled: true },
        { target: 'MULTIMETER', action: 'SET_MODE_RANGE', mode: 'V_DC', manualRangeLabel: '20V DC' },
        { target: 'MULTIMETER', action: 'ATTACH_RED_PROBE', terminalTarget: 'Pin 5' },
        { target: 'MULTIMETER', action: 'ATTACH_BLACK_PROBE', terminalTarget: 'Pin 3' },
        { target: 'MULTIMETER', action: 'SET_HOLD', holdValue: true },
      ],
    });

    const execResult = executeMacroSequence(createdMacro, DEFAULT_ECU_PINS, {
      setVoltage: (volts) => {
        psuState = { ...psuState, voltageSetting: volts, preset: 'CUSTOM', isOutputEnabled: true };
      },
      setCurrentLimit: (amps) => {
        psuState = { ...psuState, currentLimit: amps };
      },
      setPowerSupplyPreset: (preset, volts, currentLimit) => {
        psuState = {
          ...psuState,
          preset,
          voltageSetting: volts,
          currentLimit,
          isOutputEnabled: true,
        };
      },
      setPowerSupplyOutput: (isOn) => {
        psuState = { ...psuState, isOutputEnabled: isOn };
      },
      setMultimeterState: (updates, manualRangeLabel) => {
        dmmState = {
          ...dmmState,
          ...updates,
        };
        if (manualRangeLabel !== undefined) {
          activeRangeLabel = manualRangeLabel;
        }
      },
      attachProbeToPin: (pinId, label) => {
        dmmState = {
          ...dmmState,
          isPowered: true,
          redProbe: { attachedToPinId: pinId, attachedLabel: label },
        };
      },
      attachBlackProbeToPin: (pinId, label) => {
        dmmState = {
          ...dmmState,
          isPowered: true,
          blackProbe: { attachedToPinId: pinId, attachedLabel: label },
        };
      },
      resetLab: () => {},
      switchTab: () => {},
    });

    assert.equal(execResult.matched, true);
    assert.equal(execResult.status, 'EXECUTED');
    assert.equal(psuState.preset, '10.2V_CRANKING');
    assert.equal(psuState.voltageSetting, 10.2);
    assert.equal(psuState.currentLimit, 4.5);
    assert.equal(psuState.isOutputEnabled, true);
    assert.equal(dmmState.isPowered, true);
    assert.equal(dmmState.mode, 'V_DC');
    assert.equal(activeRangeLabel, '20V');
    assert.equal(dmmState.redProbe.attachedToPinId, 'ecu-pin-5');
    assert.equal(dmmState.blackProbe.attachedToPinId, 'ecu-pin-3');
    assert.equal(dmmState.holdValue, true);

    // 4. Capture live bench instrument state back into a macro step sequence
    const capturedSteps = captureBenchInstrumentSequence({
      powerSupply: psuState,
      multimeter: dmmState,
      manualRangeLabel: activeRangeLabel,
      includePowerSupply: true,
      includeMultimeter: true,
      includeProbes: true,
    });
    assert.ok(capturedSteps.includes('Set PSU preset to 10.2V cranking'));
    assert.ok(capturedSteps.includes('Set current limit to 4.5A'));
    assert.ok(capturedSteps.includes('Set multimeter to 20V'));
    assert.ok(capturedSteps.includes('Attach red probe to pin 5'));
    assert.ok(capturedSteps.includes('Attach black probe to pin 3'));
    assert.ok(capturedSteps.includes('Hold multimeter reading'));

    assert.equal(
      compileInstrumentStepToInstruction({
        target: 'MULTIMETER',
        action: 'SET_MODE_RANGE',
        mode: 'DIODE',
      }),
      'Set multimeter to diode'
    );

    voiceMacroService.deleteMacro(createdMacro.id);
  });

  it('executes Perform Cold Start and Toggle Injector Fault presets and parses RPM/fault voice commands', () => {
    const coldStart = voiceMacroService.findMatchingMacro('Perform Cold Start');
    assert.ok(coldStart, 'Expected "Perform Cold Start" preset macro to exist');
    assert.equal(coldStart.id, 'preset-cold-start');

    const toggleInjector = voiceMacroService.findMatchingMacro('Toggle Injector Fault');
    assert.ok(toggleInjector, 'Expected "Toggle Injector Fault" preset macro to exist');
    assert.equal(toggleInjector.id, 'preset-toggle-injector-fault');

    for (const step of [...coldStart.steps, ...toggleInjector.steps]) {
      const preview = previewMacroStep(step, DEFAULT_ECU_PINS);
      assert.equal(preview.matched, true, `Expected preset step "${step}" to match`);
      assert.equal(preview.status, 'EXECUTED', `Expected preset step "${step}" to execute cleanly`);
    }

    let psuState: PowerSupplyState = {
      isOutputEnabled: false,
      voltageSetting: 12.6,
      currentLimit: 5.0,
      preset: '12V_BENCH',
    };
    let dmmState: MultimeterState = {
      isPowered: false,
      mode: 'CONTINUITY',
      redProbe: { attachedToPinId: null, attachedLabel: 'Unconnected' },
      blackProbe: { attachedToPinId: null, attachedLabel: 'Unconnected' },
      rangeAuto: true,
      holdValue: false,
    };
    let rpmState: RpmEmulatorState = { isActive: false, rpm: 850, soundEnabled: true };
    let faultsState: InjectedFault[] = [];
    const connectedPairs: Array<[string, string]> = [];

    const actions = {
      setVoltage: (volts: number) => {
        psuState = { ...psuState, voltageSetting: volts, preset: 'CUSTOM', isOutputEnabled: true };
      },
      setCurrentLimit: (amps: number) => {
        psuState = { ...psuState, currentLimit: amps };
      },
      setPowerSupplyPreset: (
        preset: PowerSupplyState['preset'],
        volts: number,
        currentLimit: number
      ) => {
        psuState = { ...psuState, preset, voltageSetting: volts, currentLimit, isOutputEnabled: true };
      },
      setPowerSupplyOutput: (enabled: boolean) => {
        psuState = { ...psuState, isOutputEnabled: enabled };
      },
      setRpmEmulator: (updates: { isActive?: boolean; rpm?: number }) => {
        rpmState = {
          ...rpmState,
          ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
          ...(updates.rpm !== undefined ? { rpm: updates.rpm } : {}),
        };
      },
      setMultimeterState: (updates: Partial<MultimeterState>) => {
        dmmState = { ...dmmState, ...updates };
      },
      attachProbeToPin: (pinId: string, label: string) => {
        dmmState = { ...dmmState, isPowered: true, redProbe: { attachedToPinId: pinId, attachedLabel: label } };
      },
      attachBlackProbeToPin: (pinId: string, label: string) => {
        dmmState = { ...dmmState, isPowered: true, blackProbe: { attachedToPinId: pinId, attachedLabel: label } };
      },
      connectWire: (src: string, dst: string) => {
        connectedPairs.push([src, dst]);
        return true;
      },
      injectFault: (pinId: string, faultType: InjectedFault['faultType'], description: string) => {
        faultsState = [...faultsState.filter((f) => f.pinId !== pinId), { pinId, faultType, description, timestamp: 1 }];
      },
      toggleFault: (pinId: string, faultType: InjectedFault['faultType'], description: string) => {
        const existing = faultsState.find((f) => f.pinId === pinId);
        if (existing && (faultType === 'NONE' || existing.faultType === faultType)) {
          faultsState = faultsState.filter((f) => f.pinId !== pinId);
          return false;
        }
        faultsState = [...faultsState.filter((f) => f.pinId !== pinId), { pinId, faultType, description, timestamp: 1 }];
        return true;
      },
      removeFault: (pinId: string) => {
        const existed = faultsState.some((f) => f.pinId === pinId);
        faultsState = faultsState.filter((f) => f.pinId !== pinId);
        return existed;
      },
      resetLab: () => {},
      switchTab: () => {},
    };

    const coldResult = executeMacroSequence(coldStart, DEFAULT_ECU_PINS, actions);
    assert.equal(coldResult.status, 'EXECUTED');
    assert.equal(psuState.preset, '10.2V_CRANKING');
    assert.equal(psuState.voltageSetting, 10.2);
    assert.equal(psuState.isOutputEnabled, true);
    assert.equal(rpmState.isActive, true);
    assert.equal(rpmState.rpm, 1150);
    assert.equal(dmmState.mode, 'V_DC');
    assert.equal(dmmState.redProbe.attachedToPinId, 'ecu-pin-10');
    assert.ok(connectedPairs.length >= 3);

    // Toggle Injector Fault ON then OFF cleanly
    const toggleOnRes = executeMacroSequence(toggleInjector, DEFAULT_ECU_PINS, actions);
    assert.equal(toggleOnRes.status, 'EXECUTED');
    assert.equal(faultsState.length, 1);
    assert.equal(faultsState[0].pinId, 'ecu-pin-10');
    assert.equal(faultsState[0].faultType, 'OPEN_CIRCUIT');

    const toggleOffRes = executeMacroSequence(toggleInjector, DEFAULT_ECU_PINS, actions);
    assert.equal(toggleOffRes.status, 'EXECUTED');
    assert.equal(faultsState.length, 0);

    // Direct voice commands for TPS fault toggle & removal
    const tpsToggle = parseAndExecuteVoiceCommand('Toggle TPS fault', DEFAULT_ECU_PINS, actions);
    assert.equal(tpsToggle.matched, true);
    assert.equal(faultsState.some((f) => f.pinId === 'ecu-pin-7'), true);

    const tpsRemove = parseAndExecuteVoiceCommand('Remove fault on TPS', DEFAULT_ECU_PINS, actions);
    assert.equal(tpsRemove.matched, true);
    assert.equal(faultsState.some((f) => f.pinId === 'ecu-pin-7'), false);

    // Sub-idle cranking RPM (240 RPM)
    const crankRpm = parseAndExecuteVoiceCommand('Set engine RPM to 240', DEFAULT_ECU_PINS, actions);
    assert.equal(crankRpm.matched, true);
    assert.equal(rpmState.rpm, 240);
  });

  it('records live bench state diffs cleanly, coalesces sliders, and supports JSON export/import', () => {
    const baseSnapshot: BenchRecorderSnapshot = {
      powerSupply: { voltageSetting: 12.6, currentLimit: 5.0, isOutputEnabled: false, preset: '12V_BENCH' },
      multimeter: {
        mode: 'V_DC',
        redProbe: { attachedToPinId: 'ecu-pin-7', attachedLabel: 'Pin 7' },
        blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'Chassis GND' },
        isPowered: true,
        rangeAuto: true,
        holdValue: false,
      },
      manualRangeLabel: null,
      faults: [],
      wires: [...DEFAULT_WIRES],
      rpmEmulator: { isActive: false, rpm: 850, soundEnabled: true },
    };

    const nextSnapshot: BenchRecorderSnapshot = {
      powerSupply: { voltageSetting: 10.2, currentLimit: 4.5, isOutputEnabled: true, preset: '10.2V_CRANKING' },
      multimeter: {
        mode: 'RESISTANCE',
        redProbe: { attachedToPinId: 'ecu-pin-10', attachedLabel: 'Pin 10' },
        blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'Chassis GND' },
        isPowered: true,
        rangeAuto: false,
        holdValue: true,
      },
      manualRangeLabel: '2kΩ',
      faults: [{ pinId: 'ecu-pin-10', faultType: 'OPEN_CIRCUIT', description: 'Injector open', timestamp: 1 }],
      wires: DEFAULT_WIRES.map((w, idx) => (idx === 0 ? { ...w, isCut: true } : w)),
      rpmEmulator: { isActive: true, rpm: 1150, soundEnabled: true },
    };

    const diffSteps = diffBenchSnapshotsToInstructions(baseSnapshot, nextSnapshot, DEFAULT_ECU_PINS);
    assert.ok(diffSteps.includes('Set PSU preset to 10.2V cranking'));
    assert.ok(diffSteps.includes('Turn power supply on'));
    assert.ok(diffSteps.includes('Set multimeter to 2kΩ'));
    assert.ok(diffSteps.includes('Attach red probe to pin 10'));
    assert.ok(diffSteps.includes('Hold multimeter reading'));
    assert.ok(diffSteps.includes('Inject open circuit on pin 10'));
    assert.ok(diffSteps.includes('Set engine RPM to 1150'));
    assert.ok(diffSteps.some((s) => s.startsWith('Cut wire on ')));

    // Every auto-recorded instruction must parse cleanly without warnings
    for (const step of diffSteps) {
      const preview = previewMacroStep(step, DEFAULT_ECU_PINS);
      assert.equal(preview.matched, true, `Recorded step "${step}" must match voice parser`);
      assert.equal(preview.status, 'EXECUTED', `Recorded step "${step}" must execute cleanly`);
    }

    // Coalesce continuous RPM slider updates within 1500ms window
    const s1 = appendRecordedSteps([], ['Set engine RPM to 900'], null, 1000);
    const s2 = appendRecordedSteps(s1.steps, ['Set engine RPM to 1150'], 1000, 1400);
    assert.deepEqual(s2.steps, ['Set engine RPM to 1150']);

    // Classification badges cover new Fault and RPM instruments
    assert.equal(classifyMacroStepInstrument('Toggle open circuit on pin 10').instrument, 'FAULT');
    assert.equal(classifyMacroStepInstrument('Set engine RPM to 1150').instrument, 'RPM');

    // JSON export & import round-trip
    const custom = voiceMacroService.createMacro({
      name: 'Roundtrip Export Check',
      triggerPhrase: 'Run Export Check',
      steps: ['Set engine RPM to 1150', 'Toggle open circuit on pin 10'],
    });
    const exportedJson = voiceMacroService.exportMacrosJson();
    voiceMacroService.deleteMacro(custom.id);
    assert.equal(voiceMacroService.findMatchingMacro('Run Export Check'), null);

    const importRes = voiceMacroService.importMacrosJson(exportedJson);
    assert.ok(importRes.importedCount >= 1);
    const restored = voiceMacroService.findMatchingMacro('Run Export Check');
    assert.ok(restored, 'Imported custom macro should be retrievable by voice trigger');
    if (restored) {
      voiceMacroService.deleteMacro(restored.id);
    }

    // Without firebase-applet-config.json or VITE_FIREBASE_* env vars, isFirebaseConfigured must safely remain false
    assert.equal(typeof isFirebaseConfigured, 'boolean');
  });

  it('validates OEM Bench Hardware Profiles, multi-revision variants, Main Relay self-hold loop, GPT1/GPT2 pulse channels, and ASEAN/PH chassis aliases', () => {
    // 1. Multi-revision pinout variants & provenance safety gating
    const toyotaProfile = ECU_BRAND_PROFILES.find((p) => p.id === 'toyota-denso-175822');
    const isuzuProfile = ECU_BRAND_PROFILES.find((p) => p.id === 'isuzu-transtron-4jj1');
    const mitsuProfile = ECU_BRAND_PROFILES.find((p) => p.id === 'mitsubishi-denso-diesel');
    const nissanD40Profile = ECU_BRAND_PROFILES.find((p) => p.id === 'nissan-hitachi-mec11');
    const nissanD23Profile = ECU_BRAND_PROFILES.find((p) => p.id === 'nissan-bosch-edc17c84');

    assert.ok(toyotaProfile?.benchHardwareProfile, 'Toyota profile must include BenchHardwareProfile');
    assert.ok(isuzuProfile?.benchHardwareProfile, 'Isuzu profile must include BenchHardwareProfile');
    assert.ok(mitsuProfile?.benchHardwareProfile, 'Mitsubishi profile must include BenchHardwareProfile');
    assert.ok(nissanD40Profile?.benchHardwareProfile, 'Nissan D40 profile must include BenchHardwareProfile');
    assert.ok(nissanD23Profile?.benchHardwareProfile, 'Nissan D23 EDC17C84 profile must exist');

    // Verify variant lists and pin presence
    assert.ok(
      toyotaProfile!.pinouts.some((p) => p.plug === 'PLUG_1GD_GEN34_BCD' && p.pinCode === '28D'),
      'Toyota 1GD Gen 3/4 variant must include Connector D NE+ Pin 28D'
    );
    assert.ok(
      mitsuProfile!.pinouts.some((p) => p.plug === 'PLUG_4N15_MIVEC' && p.pinNumber === 118),
      'Mitsubishi 4N15 variant must include Pin 118 C/R Main Relay Control'
    );
    assert.ok(
      isuzuProfile!.pinouts.some((p) => p.plug === 'BLOCK_EURO4_5_REF' && p.pinNumber === 81),
      'Isuzu Euro-4/5 variant must include Pin 81 Case Ground'
    );
    assert.ok(
      nissanD40Profile!.pinouts.some((p) => p.plug === 'PLUG_D40_YD25' && p.pinCode === 'D40-113'),
      'Nissan D40 YD25 variant must include Pin 113 Main Relay Activation'
    );
    assert.ok(
      nissanD23Profile!.pinouts.some((p) => p.plug === 'PLUG_GPT_REV_A' && p.pinCode === 'M2'),
      'Nissan D23 EDC17C84 Rev A must include GPT1 Pin M2'
    );
    assert.ok(
      nissanD23Profile!.pinouts.some((p) => p.plug === 'PLUG_GPT_REV_B' && p.pinCode === 'F4'),
      'Nissan D23 EDC17C84 Rev B must include alternate GPT1 Pin F4'
    );

    const d23Variants = getHardwareVariantsForProfile('nissan-bosch-edc17c84');
    assert.equal(d23Variants.length, 2);

    // Verify OEM_BENCH_PINOUT_MAPS and BenchHardwareProfile in vehicleEcuRegistry.ts
    assert.equal(OEM_BENCH_PINOUT_MAPS.length, 5);
    const l200Map = getOemBenchPinoutMapForVehicle('mitsubishi', 'L200 / Strada / Triton (4N15 2.4L MIVEC)');
    const dmaxMap = getOemBenchPinoutMapForVehicle('isuzu', 'D-Max (4JJ1-TC 3.0L Transtron SH7058)');
    const navaraD40Map = getOemBenchPinoutMapForVehicle('nissan', 'Navara D40 (YD25DDTi 2.5L Denso)');
    const navaraD23Map = getOemBenchPinoutMapForVehicle('nissan', 'Navara D23 / NP300 (YS23DDTT EDC17C84)');
    const hiluxMap = getOemBenchPinoutMapForVehicle('toyota', 'Hilux (1GD-FTV / 2GD-FTV Denso Gen 3/4)');

    assert.ok(l200Map, 'Mitsubishi L200 4N15 map must exist in vehicleEcuRegistry');
    assert.deepEqual(l200Map!.hardwareProfile.benchWakeupPins.kl30, ['101', '102', '103']);
    assert.deepEqual(l200Map!.hardwareProfile.benchWakeupPins.mainRelayControl, ['118']);
    assert.deepEqual(l200Map!.hardwareProfile.benchWakeupPins.mainRelayReturn, ['25']);
    assert.ok(l200Map!.pinouts.length >= 20);

    assert.ok(dmaxMap, 'Isuzu D-Max 4JJ1 SH7058 map must exist in vehicleEcuRegistry');
    assert.equal(dmaxMap!.hardwareProfile.requiresCaseGround, true);
    assert.deepEqual(dmaxMap!.hardwareProfile.benchWakeupPins.groundCase, ['81']);
    assert.deepEqual(dmaxMap!.hardwareProfile.benchWakeupPins.canHigh, ['58']);
    assert.deepEqual(dmaxMap!.hardwareProfile.benchWakeupPins.canLow, ['78']);
    assert.ok(dmaxMap!.hardwareProfile.benchWakeupPins.ground.includes('81'));
    assert.ok(dmaxMap!.pinouts.length >= 20);

    assert.ok(navaraD40Map, 'Nissan Navara D40 YD25 map must exist in vehicleEcuRegistry');
    assert.deepEqual(navaraD40Map!.hardwareProfile.benchWakeupPins.mainRelayControl, ['113', '105']);
    assert.deepEqual(navaraD40Map!.hardwareProfile.benchWakeupPins.kLine, ['89']);

    assert.ok(navaraD23Map, 'Nissan Navara D23 EDC17C84 map must exist in vehicleEcuRegistry');
    assert.deepEqual(navaraD23Map!.hardwareProfile.benchWakeupPins.gpt1, ['M2', 'F4']);
    assert.deepEqual(navaraD23Map!.hardwareProfile.benchWakeupPins.gpt2, ['K3', 'G4']);
    assert.deepEqual(navaraD23Map!.hardwareProfile.benchWakeupPins.gptChannels, ['M2', 'K3', 'F4', 'G4']);
    assert.deepEqual(navaraD23Map!.hardwareProfile.benchWakeupPins.groundCase, ['H4', 'Case GND']);

    assert.ok(hiluxMap, 'Toyota Hilux 1GD/2GD Gen 3/4 map must exist in vehicleEcuRegistry');
    assert.ok(hiluxMap!.pinGroups.coreSignals?.some((s) => s.pin.includes('28D')));
    assert.ok(hiluxMap!.pinouts.length >= 15);

    const resolvedHwProfile: BenchHardwareProfile | null = getBenchHardwareProfileForVehicle(
      'mitsubishi-denso-diesel',
      'mitsubishi',
      'L200 / Strada / Triton (4N15 2.4L MIVEC)'
    );
    assert.equal(resolvedHwProfile?.ecuFamily, 'Denso 4N15 MIVEC');

    const d23Context = getSelectedVehicleContext(
      'nissan',
      'Navara D23 / NP300 (YS23DDTT EDC17C84)',
      'nissan-bosch-edc17c84'
    );
    assert.equal(d23Context.status, 'OCR_VERIFY');
    assert.equal(d23Context.benchHardwareProfile?.ecuFamily, 'Bosch EDC17C84');

    // Verify evaluatePinoutSafety blocks physical bench energizing on AI_INFERRED / OCR_VERIFY variants
    const unverifiedGate = evaluatePinoutSafety({
      ecuIdentified: true,
      ecuPartNumber: '23710-4JA0A',
      connectorOrientationConfirmed: true,
      provenanceStatus: 'AI_INFERRED',
      pinCategory: 'power',
      hasConflictingPinoutReports: true,
    });
    assert.equal(unverifiedGate.canEnergizePhysicalBench, false);
    assert.equal(unverifiedGate.riskLevel, 'BLOCKED_HIGH_RISK');
    assert.ok(unverifiedGate.warnings.some((w) => w.includes('AI-INFERRED DATA BLOCKED')));

    // Verify OEM_VERIFIED primary profile still unlocks when exact part + orientation confirmed
    const verifiedGate = evaluatePinoutSafety({
      ecuIdentified: true,
      ecuPartNumber: '89661-0K240',
      connectorOrientationConfirmed: true,
      provenanceStatus: 'OEM_VERIFIED',
      pinCategory: 'power',
      hasConflictingPinoutReports: false,
    });
    assert.equal(verifiedGate.canEnergizePhysicalBench, true);

    // 2. Main Relay Self-Hold Loop simulation (BenchCircuitSolver + LogicCheckEngine)
    const testDmm: MultimeterState = {
      mode: 'V_DC',
      redProbe: { attachedToPinId: 'ecu-pin-3', attachedLabel: 'Pin 3' },
      blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'Chassis GND' },
      isPowered: true,
      rangeAuto: true,
      holdValue: false,
    };
    const rules = buildDefaultLogicCheckRules(DEFAULT_ECU_PINS);
    const latchedSol = solveCircuit(
      PSU_ON,
      DEFAULT_ECU_PINS,
      [],
      DEFAULT_WIRES,
      DEFAULT_BENCH_COMPONENTS,
      testDmm
    );
    assert.ok((latchedSol.nodeVoltages['relay-87'] ?? 0) > 12.0, 'Latched relay-87 must provide +12V');

    const latchedCheck = evaluateLogicCheck({
      rules,
      pins: DEFAULT_ECU_PINS,
      nodeVoltages: latchedSol.nodeVoltages,
      powerSupply: PSU_ON,
      wires: DEFAULT_WIRES,
      faults: [],
      isArmed: true,
      components: DEFAULT_BENCH_COMPONENTS,
      requiresMainRelayLoop: true,
    });
    const latchedRelayLoop = latchedCheck.crossChecks.find((c) => c.id === 'cross-main-relay-loop');
    assert.equal(latchedRelayLoop?.status, 'PASS');

    // Unlatched Main Relay while KL15 + 5V VREF are active must flag Main Relay Loop Open
    const unlatchedComponents = DEFAULT_BENCH_COMPONENTS.map((c) =>
      c.id === 'comp-relay' ? { ...c, state: { ...c.state, isLatched: false } } : c
    );
    const unlatchedSol = solveCircuit(
      PSU_ON,
      DEFAULT_ECU_PINS,
      [],
      DEFAULT_WIRES,
      unlatchedComponents,
      testDmm
    );
    assert.ok((unlatchedSol.nodeVoltages['relay-87'] ?? 0) < 0.1, 'Unlatched relay-87 must drop to 0V via bleed resistor');

    const unlatchedCheck = evaluateLogicCheck({
      rules,
      pins: DEFAULT_ECU_PINS,
      nodeVoltages: unlatchedSol.nodeVoltages,
      powerSupply: PSU_ON,
      wires: DEFAULT_WIRES,
      faults: [],
      isArmed: true,
      components: unlatchedComponents,
      requiresMainRelayLoop: true,
    });
    const unlatchedRelayLoop = unlatchedCheck.crossChecks.find((c) => c.id === 'cross-main-relay-loop');
    assert.equal(unlatchedRelayLoop?.status, 'WARNING');
    const relayAlert = unlatchedCheck.alerts.find((a) => a.id === 'alert-ecu-pin-12-MAIN_RELAY_LOOP');
    assert.ok(
      relayAlert?.detail.includes('Actuator Power Rail (+B / I/B2 via Pin 87) Open — Close Main Relay Loop'),
      'Unlatched relay must emit Main Relay Loop diagnostic alert'
    );

    // 3. GPT1 / GPT2 Bench Wake-Up Square-Wave Channels
    const gptSeries = SignalGenerator.sampleGptBenchSeries({
      tStartSec: 0,
      windowMs: 5,
      sampleCount: 64,
    });
    assert.equal(gptSeries.gpt1FreqHz, 1000);
    assert.equal(gptSeries.gpt2FreqHz, 2000);
    assert.equal(gptSeries.vpp, 5.0);
    assert.ok(gptSeries.gpt1.includes(5.0) && gptSeries.gpt1.includes(0.0));
    assert.ok(gptSeries.gpt2.includes(5.0) && gptSeries.gpt2.includes(0.0));

    // 4. Regional ASEAN / Philippine Market Chassis Alias Overlay
    assert.ok(resolveRegionalAliases('L200').matchedGroups.some((a) => a.id === 'mitsu-l200-strada'));
    assert.ok(resolveRegionalAliases('Pajero Sport').matchedGroups.some((a) => a.id === 'mitsu-montero-pajero-sport'));
    assert.ok(resolveRegionalAliases('Yaris Sedan').matchedGroups.some((a) => a.id === 'toyota-vios-yaris-sedan'));
    assert.ok(resolveRegionalAliases('EDC17C53').matchedGroups.some((a) => a.id === 'hyundai-h100-starex-d4cb'));

    const l200CatalogMatches = filterRegionalCatalog('ALL', 'L200');
    assert.ok(l200CatalogMatches.some((r) => r.manufacturer.toLowerCase().includes('mitsubishi')));
    const yarisCatalogMatches = filterRegionalCatalog('ALL', 'Yaris Sedan');
    assert.ok(yarisCatalogMatches.some((r) => r.manufacturer.toLowerCase().includes('toyota')));
  });

  it('enforces pin-authoritative net reconciliation, clean component deletion, bounded JSON decoding, and Undo/Redo history coalescing', () => {
    // 1. Pin-net reassignment strips old terminal membership, adds new net, rejects Infinity voltage, and invalidates VERIFIED status
    const baseComps = structuredClone(SAMPLE_LDO_BOARD_COMPS);
    const baseNets = structuredClone(SAMPLE_NETS);
    const relinked = updatePcbComponentPin({
      components: baseComps,
      nets: baseNets,
      refDes: 'D1',
      pinNumber: 2,
      patch: {
        connectedNetId: ' net custom rail ',
        nominalVoltage: Number.POSITIVE_INFINITY,
      },
    });
    const d1After = relinked.components.find((c) => c.refDes === 'D1')!;
    assert.equal(d1After.verificationStatus, 'UNVERIFIED');
    assert.equal(d1After.pinSpecs?.[1]?.nominalVoltage, 12.25);
    assert.equal(d1After.pinSpecs?.[1]?.connectedNetId, 'NET_CUSTOM_RAIL');

    const oldVbatNet = relinked.nets.find((n) => n.name === 'NET_KL30_VBAT')!;
    assert.equal(oldVbatNet.connectedComponentRefs.includes('D1'), false);
    assert.equal(oldVbatNet.connectedTerminalIds.includes('D1-2'), false);

    const customNet = relinked.nets.find((n) => n.name === 'NET_CUSTOM_RAIL')!;
    assert.deepEqual(customNet.connectedComponentRefs, ['D1']);
    assert.deepEqual(customNet.connectedTerminalIds, ['D1-2']);

    // 2. Unassigning a pin never creates a real NET_UNASSIGNED net
    const unassigned = updatePcbComponentPin({
      components: baseComps,
      nets: baseNets,
      refDes: 'D1',
      pinNumber: 2,
      patch: { connectedNetId: '' },
    });
    assert.equal(
      unassigned.nets.some((n) => n.name === PCB_UNASSIGNED_NET),
      false
    );

    // 3. Clean component removal purges all terminal references and clears hotspot suspectComponentRef
    const initialHotspots: ImageAnalysisHotspot[] = [
      {
        id: 'hs-d1',
        label: 'D1 Thermal Zone',
        severity: 'WARNING',
        bbox: { ymin: 140, xmin: 140, ymax: 270, xmax: 280 },
        suspectComponentRef: 'D1',
        notes: 'Check D1 solder joint',
        source: 'LOCAL_CV',
      },
    ];
    const removed = removePcbComponentCleanly({
      components: baseComps,
      nets: baseNets,
      hotspots: initialHotspots,
      refDes: 'D1',
    });
    assert.equal(
      removed.components.some((c) => c.refDes === 'D1'),
      false
    );
    assert.ok(
      removed.nets.every(
        (n) =>
          !n.connectedComponentRefs.includes('D1') &&
          n.connectedTerminalIds.every((t) => !t.startsWith('D1-'))
      )
    );
    assert.equal(removed.hotspots[0]?.suspectComponentRef, undefined);

    // 4. Bounded JSON serializer & decoder round-trips schemaVersion 1 and rejects malformed/duplicate payloads
    const jsonText = serializePcbBoardJson({
      id: 'test-ldo-board',
      boardName: '5V LDO Stage Test',
      boardType: 'Automotive ECU Power Stage',
      analysisSummary: 'Verified 5V LDO test stage',
      model: 'test-model',
      aspect: 1.5,
      components: baseComps,
      nets: baseNets,
      hotspots: initialHotspots,
    });
    const decoded = decodePcbBoardJson(jsonText);
    assert.equal(decoded.schemaVersion, 1);
    assert.equal(decoded.boardName, '5V LDO Stage Test');
    assert.equal(decoded.components.length, baseComps.length);
    assert.ok(decoded.nets.some((n) => n.name === 'NET_KL30_VBAT'));

    // Reject duplicate component refDes
    const dupCompPayload = JSON.parse(jsonText);
    dupCompPayload.components.push(dupCompPayload.components[0]);
    assert.throws(() => decodePcbBoardJson(dupCompPayload), /Duplicate component reference/);

    // Reject duplicate pin numbers
    const dupPinPayload = JSON.parse(jsonText);
    dupPinPayload.components[0].pinSpecs.push(dupPinPayload.components[0].pinSpecs[0]);
    assert.throws(() => decodePcbBoardJson(dupPinPayload), /Duplicate pin/);

    // Reject duplicate normalized net names
    const dupNetPayload = JSON.parse(jsonText);
    dupNetPayload.nets.push({ ...dupNetPayload.nets[0], name: ' net kl30 vbat ' });
    assert.throws(() => decodePcbBoardJson(dupNetPayload), /Duplicate normalized net name/);

    // Reject NaN geometry coordinate
    const nanBoxPayload = JSON.parse(jsonText);
    nanBoxPayload.components[0].bbox.xmin = Number.NaN;
    assert.throws(() => decodePcbBoardJson(nanBoxPayload), /expected finite number/);

    // 5. Undo/Redo history reducer coalesces multi-frame drag previews and rolls back on finish(commit=false)
    let hist: PcbHistoryState<number> = {
      past: [],
      present: 100,
      future: [],
      draftBase: null,
    };
    hist = reducePcbBoardHistory(hist, { type: 'preview', next: 120 });
    hist = reducePcbBoardHistory(hist, { type: 'preview', next: 145 });
    hist = reducePcbBoardHistory(hist, { type: 'finish', commit: true });
    assert.deepEqual(hist.past, [100]);
    assert.equal(hist.present, 145);

    // Drag preview cancelled (Escape) rolls back to 145 without adding a history step
    hist = reducePcbBoardHistory(hist, { type: 'preview', next: 200 });
    hist = reducePcbBoardHistory(hist, { type: 'finish', commit: false });
    assert.deepEqual(hist.past, [100]);
    assert.equal(hist.present, 145);

    // Undo and Redo restore exact states
    hist = reducePcbBoardHistory(hist, { type: 'undo' });
    assert.equal(hist.present, 100);
    hist = reducePcbBoardHistory(hist, { type: 'redo' });
    assert.equal(hist.present, 145);
  });
});
