/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import {
  authorizeBenchAction,
  buildBenchActionProposalFromCommand,
  clearBenchAuthorizationAuditLog,
  getBenchAuthorizationAuditLog,
  type BenchSafetyStateSnapshot,
} from '../../services/benchActionAuthorizationSystem';
import {
  buildDiagnosticEvidenceEnvelope,
  verifyEcuIdentityAndPinoutProvenance,
} from '../../services/diagnosticEvidenceSystem';
import {
  authorizeVoiceMacroSteps,
  executeUnifiedVoiceOrTextPipeline,
} from '../../services/offlineVoiceService';
import { MatrixSolver } from '../engine/MatrixSolver';
import { CircuitNetwork } from '../electrical/CircuitNetwork';
import {
  DEFAULT_BENCH_COMPONENTS,
  DEFAULT_ECU_PINS,
  DEFAULT_WIRES,
  solveCircuit,
} from '../../utils/circuitSolver';
import type { MultimeterState } from '../../types/ecu';
import {
  approveKnowledgeEntry,
  clearVerifiedKnowledgeStoreForTests,
  getAllVerifiedKnowledgeEntries,
  getKnowledgeCenterStats,
  rejectKnowledgeEntry,
  saveVerifiedKnowledgeEntry,
  searchLocalFirstKnowledge,
  synchronizeKnowledgeEntries,
  validateAndClassifyOnlineAiAnswer,
} from '../../services/ai/localKnowledgeDB';
import {
  queryAiDiagnosticRouter,
  resetAiRouterStateForTests,
  setAiRouterOnlineTransportForTests,
} from '../../services/ai/aiRouter';
import { evaluateStructuredTechnicianWorkflow } from '../../utils/diagnosticWorkflow';

const BASE_SIM_SNAPSHOT: BenchSafetyStateSnapshot = {
  environmentMode: 'SIMULATION_MODE',
  psuOutputEnabled: false,
  psuVoltageSetting: 12.6,
  psuCurrentLimitAmps: 2.5,
  ocpTripped: false,
  dmmMode: 'V_DC',
  brandKey: 'universal-bench',
  modelName: 'Universal Trainer',
  ecuProfileId: 'universal-16pin-bench-trainer',
  ecuStatus: 'VERIFIED',
  hasVerifiedPinoutMap: true,
};

async function runMasterSpecificationTests(): Promise<void> {
  console.log('Running Master System Implementation Specification Regression Suite (18 Categories)...');

  // ============================================================================
  // 1. Unsafe electrical operations (12V on 5V VREF Pin 5, direct +12V to GND short)
  // ============================================================================
  clearBenchAuthorizationAuditLog();
  const unsafeVrefProposal = buildBenchActionProposalFromCommand({
    commandText: 'Apply 12V to Pin 5 5V VREF',
    originChannel: 'VOICE_COMMAND',
  });
  const unsafeVrefAuth = authorizeBenchAction(unsafeVrefProposal, BASE_SIM_SNAPSHOT);
  assert.equal(unsafeVrefAuth.decision, 'BLOCK', 'Applying 12V to 5V VREF Pin 5 must be BLOCKED');
  assert.equal(unsafeVrefAuth.reasonCode, 'BLOCKED_5V_REF_OVERVOLTAGE');

  const directShortProposal = buildBenchActionProposalFromCommand({
    commandText: 'Connect Pin 3 KL30 directly to Pin 1 ground',
    originChannel: 'VOICE_COMMAND',
  });
  const directShortAuth = authorizeBenchAction(directShortProposal, BASE_SIM_SNAPSHOT);
  assert.equal(directShortAuth.decision, 'BLOCK', 'Direct +12V to ground short must be BLOCKED');
  assert.equal(directShortAuth.reasonCode, 'BLOCKED_DIRECT_VBAT_TO_GND_SHORT');

  // ============================================================================
  // 2. Invalid voltage (>16.5V) and current limits (>10A)
  // ============================================================================
  const overVoltageProposal = buildBenchActionProposalFromCommand({
    commandText: 'Set voltage to 24V',
    originChannel: 'UI_CONTROL',
  });
  const overVoltageAuth = authorizeBenchAction(overVoltageProposal, BASE_SIM_SNAPSHOT);
  assert.equal(overVoltageAuth.decision, 'BLOCK', '24V on 12V ECU bench must be BLOCKED');
  assert.equal(overVoltageAuth.reasonCode, 'BLOCKED_VOLTAGE_OUT_OF_RANGE');

  const overCurrentProposal = buildBenchActionProposalFromCommand({
    commandText: 'Set current limit to 15A',
    originChannel: 'UI_CONTROL',
  });
  const overCurrentAuth = authorizeBenchAction(overCurrentProposal, BASE_SIM_SNAPSHOT);
  assert.equal(overCurrentAuth.decision, 'BLOCK', '15A current limit (>10A max) must be BLOCKED');
  assert.equal(overCurrentAuth.reasonCode, 'BLOCKED_CURRENT_OUT_OF_RANGE');

  // ============================================================================
  // 3. Overcurrent protection (OCP trip lockout)
  // ============================================================================
  const raiseLimitDuringOcp = buildBenchActionProposalFromCommand({
    commandText: 'Set current limit to 5A',
    originChannel: 'VOICE_COMMAND',
  });
  const ocpRaiseAuth = authorizeBenchAction(raiseLimitDuringOcp, {
    ...BASE_SIM_SNAPSHOT,
    ocpTripped: true,
    psuOutputEnabled: true,
  });
  assert.equal(ocpRaiseAuth.decision, 'BLOCK', 'Raising current limit during active OCP trip must be BLOCKED');
  assert.equal(ocpRaiseAuth.reasonCode, 'BLOCKED_OCP_FAULT_LATCHED');

  // ============================================================================
  // 4. Unauthorized physical hardware activation (SIMULATION_MODE vs PHYSICAL_HARDWARE_MODE)
  // ============================================================================
  const physicalPowerOnProposal = buildBenchActionProposalFromCommand({
    commandText: 'Turn PSU on',
    originChannel: 'TEXT_ASSISTANT',
  });
  const unauthPhysicalResult = authorizeBenchAction(physicalPowerOnProposal, {
    ...BASE_SIM_SNAPSHOT,
    environmentMode: 'PHYSICAL_HARDWARE_MODE',
    isPhysicalBridgeConnected: false,
    technicianPhysicalArmConfirmed: false,
  });
  assert.equal(
    unauthPhysicalResult.decision,
    'BLOCK',
    'Simulated authorization must never permit physical hardware activation without explicit physical hardware unlock'
  );
  assert.equal(unauthPhysicalResult.reasonCode, 'BLOCKED_PHYSICAL_HARDWARE_UNAUTHORIZED');

  // ============================================================================
  // 5. Voice and macro step-by-step authorization & state revalidation
  // ============================================================================
  const unsafeMacroCheck = authorizeVoiceMacroSteps({
    macroName: 'Dangerous Macro Test',
    steps: [
      { command: 'Attach black probe to ground', delayMs: 0 },
      { command: 'Set voltage to 12 volts', delayMs: 200 },
      { command: 'Connect 12V to Pin 5 VREF', delayMs: 200 },
    ],
    snapshot: BASE_SIM_SNAPSHOT,
  });
  assert.equal(unsafeMacroCheck.overallDecision, 'BLOCK', 'Macro containing a blocked step must be BLOCKED');
  assert.equal(unsafeMacroCheck.blockedStepIndex, 2);

  // Test 9-stage pipeline with state revalidation catching ECU profile change between approval and execution
  let executedFlag = false;
  const stalePipelineReport = executeUnifiedVoiceOrTextPipeline({
    rawInput: 'Turn PSU on',
    originChannel: 'VOICE_COMMAND',
    technicianConfirmed: true,
    approvalTimestampMs: Date.now() - 1000,
    approvalSnapshot: {
      ...BASE_SIM_SNAPSHOT,
      brandKey: 'toyota',
      modelName: 'Vios 1NR-FE',
      ecuProfileId: 'toyota-1nr-fe',
    },
    snapshot: {
      ...BASE_SIM_SNAPSHOT,
      brandKey: 'honda',
      modelName: 'Civic R18A',
      ecuProfileId: 'honda-r18a',
    },
    executeAction: () => {
      executedFlag = true;
    },
  });
  assert.equal(executedFlag, false, 'Revalidation must block execution if ECU profile changed after confirmation');
  assert.equal(stalePipelineReport.outcome, 'REVALIDATION_FAILED');
  assert.ok(getBenchAuthorizationAuditLog().length >= 5, 'Safety audit log must record all authorization events');

  // ============================================================================
  // 6. Floating and unresolved circuit nodes (MatrixSolver & CircuitNetwork)
  // ============================================================================
  const net = new CircuitNetwork();
  net.addVoltageSource('V_BAT', 'NODE_12V', '0', 12.6, 0.05);
  net.addResistor('R_LOAD', 'NODE_12V', '0', 100);
  // Add an isolated floating node pair with no path to ground ('0')
  net.addResistor('R_FLOATING_ISLAND', 'FLOATING_NODE_A', 'FLOATING_NODE_B', 1000);
  const netResult = net.solve();
  assert.equal(netResult.solverStatus, 'UNRESOLVED', 'Network with floating nodes must report UNRESOLVED solverStatus');
  assert.ok(netResult.unresolvedNodes?.includes('FLOATING_NODE_A'), 'FLOATING_NODE_A must be flagged in unresolvedNodes');
  assert.equal(
    netResult.validatedNodeVoltages?.['FLOATING_NODE_A'],
    null,
    'Unresolved floating node must have null in validatedNodeVoltages instead of a silent valid 0V'
  );
  const inspectedFloating = net.inspectNodeMeasurement(netResult, 'FLOATING_NODE_A');
  assert.equal(inspectedFloating.status, 'UNRESOLVED');
  assert.equal(inspectedFloating.voltage, null);

  // ============================================================================
  // 7. Invalid / non-finite measurements & DMM UNRESOLVED display
  // ============================================================================
  const singularDiagnostics = MatrixSolver.solveWithDiagnostics(
    [
      [1, 0],
      [0, 0],
    ],
    [12.0, 0]
  );
  assert.equal(singularDiagnostics.status, 'UNRESOLVED');
  assert.ok(singularDiagnostics.unresolvedIndices.includes(1));
  assert.equal(singularDiagnostics.validatedSolution[1], null);

  const nonFiniteDiagnostics = MatrixSolver.solveWithDiagnostics(
    [
      [1, NaN],
      [0, 1],
    ],
    [12, 5]
  );
  assert.equal(nonFiniteDiagnostics.status, 'NON_FINITE');
  assert.equal(nonFiniteDiagnostics.hasNonFinite, true);

  // BenchCircuitSolver: cut wire to an open pin and verify solver diagnostics
  const benchPins = DEFAULT_ECU_PINS;
  const benchWires = DEFAULT_WIRES.map((w) =>
    w.targetPinId === 'ecu-pin-13' ? { ...w, isCut: true } : w
  );
  const defaultDmm: MultimeterState = {
    isPowered: true,
    mode: 'V_DC',
    rangeAuto: true,
    holdValue: false,
    redProbe: { attachedToPinId: 'ecu-pin-13', attachedLabel: 'Pin #13 (K-LINE)' },
    blackProbe: { attachedToPinId: 'ecu-pin-1', attachedLabel: 'Pin #1 (KL31)' },
  };
  const benchSol = solveCircuit(
    { preset: '12V', voltageSetting: 12.6, currentLimit: 2.5, isOutputEnabled: true },
    benchPins,
    [],
    benchWires,
    DEFAULT_BENCH_COMPONENTS,
    defaultDmm
  );
  assert.ok(Array.isArray(benchSol.unresolvedNodes));
  assert.equal(benchSol.multimeterReading.evidenceSource, 'ELECTRICAL_SIMULATION');

  // ============================================================================
  // 8. ECU profile mismatches & 9. Unverified pinouts (UNIVERSAL_TRAINER vs VERIFIED_OEM vs UNVERIFIED_OEM)
  // ============================================================================
  const universalProv = verifyEcuIdentityAndPinoutProvenance({
    brandKey: 'universal-bench',
    ecuProfileId: 'universal-16pin-bench-trainer',
  });
  assert.equal(universalProv.tier, 'UNIVERSAL_TRAINER');
  assert.equal(
    universalProv.canUseOemSpecifications,
    false,
    'Universal trainer must never allow OEM pin-specific claims'
  );

  const unverifiedOemProv = verifyEcuIdentityAndPinoutProvenance({
    brandKey: 'toyota',
    modelName: 'Vios 1NR-FE',
    ecuProfileId: 'toyota-1nr-fe',
    ecuStatus: 'PART_METADATA_ONLY',
    hasVerifiedPinoutMap: false,
  });
  assert.equal(unverifiedOemProv.tier, 'UNVERIFIED_OEM');
  assert.equal(unverifiedOemProv.canUseOemSpecifications, false);

  const verifiedOemProv = verifyEcuIdentityAndPinoutProvenance({
    brandKey: 'toyota',
    modelName: 'Vios 1NR-FE',
    ecuProfileId: 'toyota-1nr-fe',
    ecuStatus: 'VERIFIED',
    hasVerifiedPinoutMap: true,
    orientationConfirmed: true,
  });
  assert.equal(verifiedOemProv.tier, 'VERIFIED_OEM');
  assert.equal(verifiedOemProv.canUseOemSpecifications, true);

  const evidenceEnv = buildDiagnosticEvidenceEnvelope({
    source: 'ELECTRICAL_SIMULATION',
    status: 'VALID',
    ecuProvenanceTier: 'UNIVERSAL_TRAINER',
    isActualMeasurement: true,
    isExpectedReference: false,
  });
  assert.equal(evidenceEnv.status, 'VALID');
  assert.equal(evidenceEnv.isEducationalOnly, true);

  // ============================================================================
  // 10. Local-first question answering & 11. Semantic/keyword retrieval
  // ============================================================================
  await clearVerifiedKnowledgeStoreForTests();
  resetAiRouterStateForTests();

  let onlineTransportCallCount = 0;
  setAiRouterOnlineTransportForTests(async () => {
    onlineTransportCallCount += 1;
    return {
      reply: [
        'SAFETY_WARNING: Never apply +12V to the 5V VREF sensor rail on Pin 5; always verify with PSU OFF before ohms checks.',
        'ROOT_CAUSE: A shorted 5V VREF rail (Pin 5) pulls the internal 7805 LDO regulator into thermal foldback and disables TPS and MAP sensors.',
        'VERIFICATION_ACTION: Unplug sensors one at a time while monitoring Pin 5 VREF with the DMM in V_DC mode until 5.00V recovers.',
      ].join('\n'),
      model: 'gemini-4-hydrogen',
      confidence: 0.94,
    };
  }, true);

  // First query calls online AI once and saves into Local-First Knowledge DB
  const firstOnlineRes = await queryAiDiagnosticRouter({
    query: 'How to diagnose 5V VREF shorted rail on Pin 5?',
    lang: 'EN',
  });
  assert.equal(onlineTransportCallCount, 1, 'First novel question should invoke online transport once');
  assert.equal(firstOnlineRes.cachedLocally, true);

  // Rephrased semantic question should hit searchLocalFirstKnowledge with 0 new online calls
  const secondSemanticHit = await queryAiDiagnosticRouter({
    query: 'Pin 5 sensor reference voltage 5V regulator diagnosis steps',
    lang: 'EN',
  });
  assert.equal(
    onlineTransportCallCount,
    1,
    'Second rephrased question must be served from Local-First Knowledge DB with 0 additional online calls'
  );
  assert.equal(secondSemanticHit.sourceProvenance, 'LOCAL_VERIFIED_CACHE');

  // Verify ECU brand applicability mismatch does not return brand-locked OEM records for a different brand
  await saveVerifiedKnowledgeEntry({
    subject: 'TOYOTA VIOS SPECIFIC OEM PIN 44',
    tokens: ['oem', 'pin44', 'immobilizer', 'sync'],
    lang: 'EN',
    sourceTier: 'CARBON',
    confidence: 0.96,
    safetyWarning: 'Check Toyota EWD.',
    rootCauseSummary: 'Toyota Vios 1NR-FE Pin 44 is the IMO immobilizer communication line.',
    verificationStep: 'Check pulse with oscilloscope.',
    rawAnswer: 'Toyota Vios Pin 44 is IMO.',
    ecuApplicability: {
      brandKey: 'toyota',
      modelName: 'Vios',
      isUniversalTrainer: false,
    },
  });
  const mismatchedBrandHit = await searchLocalFirstKnowledge({
    query: 'oem pin44 immobilizer sync',
    brandKey: 'honda',
    lang: 'EN',
  });
  assert.equal(
    mismatchedBrandHit,
    null,
    'Toyota-specific OEM record must not be served when querying for Honda'
  );

  // ============================================================================
  // 12. Online answer validation (rejecting unsafe online advice)
  // ============================================================================
  const unsafeValidation = validateAndClassifyOnlineAiAnswer({
    query: 'How to test Pin 5 VREF?',
    subject: 'PIN 5 VREF TEST',
    tokens: ['pin5', 'vref'],
    rawAnswer: 'Apply +12V directly to Pin 5 5V VREF to wake up the sensor.',
    safetyWarning: 'Connect jumper wire.',
    rootCauseSummary: 'Apply +12V directly to Pin 5 5V VREF.',
    verificationStep: 'Check spark.',
    confidence: 0.95,
  });
  assert.equal(
    unsafeValidation.classification,
    'REJECTED_INFORMATION',
    'Unsafe online AI advice recommending 12V on 5V VREF must be classified as REJECTED_INFORMATION'
  );
  assert.equal(unsafeValidation.reviewStatus, 'REJECTED');

  const rejectedSaveAttempt = await saveVerifiedKnowledgeEntry({
    subject: 'UNSAFE VREF JUMPER',
    tokens: ['pin5', 'vref', '12v'],
    lang: 'EN',
    sourceTier: 'CARBON',
    confidence: 0.95,
    safetyWarning: 'Connect wire',
    rootCauseSummary: 'Apply +12V directly to Pin 5 5V VREF.',
    verificationStep: 'Measure current',
    rawAnswer: 'Apply +12V directly to Pin 5 5V VREF.',
  });
  assert.equal(rejectedSaveAttempt.saved, false);
  assert.equal(rejectedSaveAttempt.classification, 'REJECTED_INFORMATION');

  // ============================================================================
  // 13. Knowledge persistence across sessions & 14. Offline retrieval when network is disconnected
  // ============================================================================
  setAiRouterOnlineTransportForTests(null, false); // Simulate complete offline state
  const offlineKnowledgeHit = await searchLocalFirstKnowledge({
    query: 'What causes 5V reference voltage Pin 5 drop?',
    lang: 'EN',
  });
  assert.ok(offlineKnowledgeHit, 'Saved knowledge must remain retrievable while completely offline');
  assert.ok((offlineKnowledgeHit?.record.hitCount ?? 0) >= 1);

  // ============================================================================
  // 15. Database synchronization & 16. Duplicate detection / related question merging
  // ============================================================================
  const dupSave = await saveVerifiedKnowledgeEntry({
    subject: 'DIAGNOSE 5V VREF SHORTED',
    tokens: ['diagnose', '5v', 'vref', 'shorted', 'rail', 'pin', '5'],
    lang: 'EN',
    sourceTier: 'CARBON',
    confidence: 0.95,
    safetyWarning: 'Disconnect battery before Ohms checks.',
    rootCauseSummary: 'Shorted 5V VREF rail on Pin 5 overloads the 7805 LDO regulator.',
    verificationStep: 'Isolate sensor branches until 5.00V is restored.',
    rawAnswer: 'Updated duplicate answer',
    originalQuestion: 'Why is my 5V VREF rail dead on Pin 5?',
  });
  assert.equal(dupSave.saved, true);
  assert.ok((dupSave.record?.version ?? 1) >= 2, 'Duplicate merge must increment record version');
  assert.ok(
    dupSave.record?.relatedQuestions?.includes('Why is my 5V VREF rail dead on Pin 5?'),
    'Duplicate merge must append relatedQuestions'
  );

  // ============================================================================
  // 17. Conflicting information detection (never overwriting higher-authority knowledge)
  // ============================================================================
  await saveVerifiedKnowledgeEntry({
    subject: 'CAN BUS TERMINATION RESISTANCE',
    tokens: ['can', 'bus', 'termination', 'resistance'],
    lang: 'EN',
    sourceTier: 'CARBON',
    confidence: 0.96,
    safetyWarning: 'Turn PSU OFF before measuring CAN bus resistance.',
    rootCauseSummary: 'A healthy ISO 11898 high-speed CAN bus measures 60 Ohms across CAN_H and CAN_L due to two 120 Ohm terminating resistors in parallel.',
    verificationStep: 'Measure 60 Ohms between Pin 14 and Pin 15 with power OFF.',
    rawAnswer: 'Healthy CAN bus termination is 60 Ohms.',
    references: ['ISO 11898-2 Standard'],
    ecuProvenanceTier: 'VERIFIED_OEM',
  });

  const conflictingCanSave = await saveVerifiedKnowledgeEntry({
    subject: 'CAN BUS TERMINATION SPEC',
    tokens: ['can', 'bus', 'termination', 'resistance'],
    lang: 'EN',
    sourceTier: 'FLASH_LITE',
    confidence: 0.85,
    safetyWarning: 'Check resistance.',
    rootCauseSummary: 'A healthy CAN bus termination resistance across CAN_H and CAN_L is 950 Ohms.',
    verificationStep: 'Measure 950 Ohms.',
    rawAnswer: 'Healthy CAN bus termination is 950 Ohms.',
  });
  assert.equal(
    conflictingCanSave.classification,
    'CONFLICTING_INFORMATION',
    'Conflicting 950 Ohm CAN bus claim must be flagged as CONFLICTING_INFORMATION'
  );
  assert.equal(conflictingCanSave.conflictDetected, true);

  // Verify the authoritative 60 Ohm record was NOT overwritten and is returned by searchLocalFirstKnowledge
  const canSearchHit = await searchLocalFirstKnowledge({
    query: 'What is the CAN bus termination resistance in Ohms?',
    lang: 'EN',
  });
  assert.ok(canSearchHit);
  assert.match(canSearchHit.record.rootCauseSummary, /60 Ohms/i);

  // ============================================================================
  // 18. Knowledge versioning, approval history, sync & 10-stage workflow verification
  // ============================================================================
  if (conflictingCanSave.record) {
    const rejectedConflict = await rejectKnowledgeEntry(
      conflictingCanSave.record.id,
      'Rejected conflicting 950 Ohm claim'
    );
    assert.equal(rejectedConflict?.reviewStatus, 'REJECTED');
    assert.ok((rejectedConflict?.approvalHistory?.length ?? 0) >= 2);
  }

  const allEntriesBeforeSync = await getAllVerifiedKnowledgeEntries();
  const firstApproved = allEntriesBeforeSync.find((e) => e.reviewStatus === 'APPROVED');
  if (firstApproved) {
    const reApproved = await approveKnowledgeEntry(firstApproved.id, 'Technician verified on bench');
    assert.equal(reApproved?.reviewStatus, 'APPROVED');
  }

  const syncSummary = await synchronizeKnowledgeEntries();
  assert.ok(syncSummary.totalApproved >= 1);
  const stats = await getKnowledgeCenterStats();
  assert.ok(stats.approvedCount >= 1);
  assert.ok(stats.rejectedCount >= 1);

  // Structured 10-stage technician workflow verification (Section 9)
  const standbyWorkflow = evaluateStructuredTechnicianWorkflow({
    powerSupply: { preset: '12V', voltageSetting: 12.6, currentLimit: 2.5, isOutputEnabled: false },
    pins: benchPins,
    wires: DEFAULT_WIRES,
    faults: [],
    activeDTCs: [],
    nodeVoltages: {},
    supplyCurrentDrawAmps: 0,
    isSupplyCurrentTripped: false,
    multimeter: defaultDmm,
    multimeterReading: { display: '0.00', unit: 'V DC', isWarning: false },
    ecuProvenanceTier: 'UNIVERSAL_TRAINER',
  });
  assert.equal(standbyWorkflow.stages.length, 10, 'Structured workflow must contain all 10 required stages');
  assert.equal(
    standbyWorkflow.canConcludeDiagnosis,
    false,
    'Workflow must refuse to force a conclusion when live measurements are NOT_TESTED'
  );
  assert.equal(standbyWorkflow.overallStatus, 'INCONCLUSIVE');

  resetAiRouterStateForTests();
  console.log('ALL 18 MASTER SYSTEM SPECIFICATION REGRESSION CATEGORIES PASSED!');
}

runMasterSpecificationTests().catch((err) => {
  console.error('Master System Specification Regression Suite FAILED:', err);
  process.exit(1);
});
