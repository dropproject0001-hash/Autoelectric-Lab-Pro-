/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import { runUnifiedAiOrchestrator } from '../../services/ai/unifiedAiOrchestrator';
import { validateResponseNumbersAgainstEvidence } from '../../services/ai/numericValidator';
import { scrubSensitiveDataForCloud } from '../../services/ai/privacyFilter';
import {
  EVIDENCE_HIERARCHY_MAP,
  formatEvidenceHeader,
} from '../../services/ai/evidenceHierarchy';
import {
  loadAutomotiveKnowledgeCatalog,
  resetAutomotiveKnowledgeCacheForTests,
  upsertKnowledgeRecordWithProvenance,
} from '../../services/automotiveKnowledgeService';

async function runM2OrchestratorTests(): Promise<void> {
  console.log('\n=== M2 UNIFIED AI ORCHESTRATOR (DB-FIRST + NUMERIC VALIDATOR) TEST SUITE ===');

  // 1. All 6 Evidence Hierarchy tiers exist in strict rank order 1..6
  assert.equal(EVIDENCE_HIERARCHY_MAP.VERIFIED_OEM.rank, 1);
  assert.equal(EVIDENCE_HIERARCHY_MAP.TECHNICIAN_CONFIRMED.rank, 2);
  assert.equal(EVIDENCE_HIERARCHY_MAP.UNVERIFIED_DB.rank, 3);
  assert.equal(EVIDENCE_HIERARCHY_MAP.GENERAL_AI.rank, 4);
  assert.equal(EVIDENCE_HIERARCHY_MAP.SIMULATED_RESULT.rank, 5);
  assert.equal(EVIDENCE_HIERARCHY_MAP.USER_MEASUREMENT.rank, 6);
  assert.ok(formatEvidenceHeader('VERIFIED_OEM').includes('1. Verified OEM information'));
  console.log('  PASS: 1. 6-tier Evidence Hierarchy verified (ranks 1..6)');

  // 2. Database-only answer works end-to-end with zero LLM
  resetAutomotiveKnowledgeCacheForTests();
  const dbOnlyRes = await runUnifiedAiOrchestrator({
    query: 'Toyota Hilux fuse relay electrical',
    make: 'toyota',
    allowLocalLlm: false,
    allowGeminiFreeTier: false,
  });
  assert.equal(dbOnlyRes.executionMode, 'DATABASE_ONLY');
  assert.equal(dbOnlyRes.hasEvidenceGap, false);
  assert.ok(dbOnlyRes.sources.length > 0, 'Database-only mode must return attributed DB sources');
  assert.ok(
    dbOnlyRes.answer.includes('[Evidence Level:'),
    'Every answer must carry an explicit Evidence Level header'
  );
  assert.ok(dbOnlyRes.repairDisclaimer.includes('SIMULATED'));
  console.log('  PASS: 2. Database-only answer succeeds end-to-end with evidence label & source attribution');

  // 3. Acceptance test (Section 6.1): Ask for a spec NOT in the database -> explicit information gap
  const missingSpecRes = await runUnifiedAiOrchestrator({
    query: 'Pinout voltage and resistance for 2029 Zorgon Quantum ECU 99999-XYZ',
    allowLocalLlm: false,
    allowGeminiFreeTier: false,
  });
  assert.equal(missingSpecRes.hasEvidenceGap, true, 'Missing spec query must report hasEvidenceGap=true');
  assert.equal(missingSpecRes.sources.length, 0);
  assert.ok(
    /Information Gap|Missing Database Evidence/i.test(missingSpecRes.answer),
    'Missing spec must return an honest information-gap message'
  );
  assert.ok(
    missingSpecRes.answer.includes('4. General AI explanation (no database support)'),
    'Missing spec response must be labeled Level 4'
  );
  console.log('  PASS: 3. Missing specification returns honest information-gap message without guessing');

  // 4. Numeric Validator catches hallucinated pin, voltage, resistance, and frequency values
  const validation = validateResponseNumbersAgainstEvidence({
    candidateText:
      'Measure Pin 12 at 5.0V (verified). Also check Pin 88 at 9.7V, resistance 420 ohms, and frequency 777 Hz.',
    evidenceTexts: ['OEM Manual: Pin 12 is 5V VREF measuring 5.0V Key-ON.'],
    mode: 'FLAG',
  });
  assert.equal(validation.isClean, false);
  assert.equal(validation.hasUnverifiedNumbers, true);
  assert.ok(
    validation.verifiedClaims.some((c) => c.normalizedValue === 'pin:12'),
    'Pin 12 must pass verification'
  );
  assert.ok(
    validation.verifiedClaims.some((c) => c.normalizedValue === 'v:5'),
    '5.0V must pass verification'
  );
  assert.ok(
    validation.unverifiedClaims.some((c) => c.normalizedValue === 'pin:88'),
    'Hallucinated Pin 88 must be caught'
  );
  assert.ok(
    validation.unverifiedClaims.some((c) => c.normalizedValue === 'v:9.7'),
    'Hallucinated 9.7V must be caught'
  );
  assert.ok(
    validation.unverifiedClaims.some((c) => c.normalizedValue === 'r:420'),
    'Hallucinated 420 ohms must be caught'
  );
  assert.ok(
    validation.unverifiedClaims.some((c) => c.normalizedValue === 'hz:777'),
    'Hallucinated 777 Hz must be caught'
  );
  assert.ok(
    validation.sanitizedText.includes('[UNVERIFIED — NOT IN RETRIEVED EVIDENCE]'),
    'Sanitized output must visibly flag unverified numbers'
  );

  // Also test orchestrator running Numeric Validator over a hallucinating local LLM callback
  const catalog = loadAutomotiveKnowledgeCatalog();
  upsertKnowledgeRecordWithProvenance({
    id: 'ref-m2-denso-test',
    vehicleId: catalog.vehicles[0].id,
    make: 'Toyota',
    model: 'Hilux',
    years: '2018-2022',
    systemCategoryId: 'engine_management_ecu',
    title: 'Denso 89661-0K888 VREF Spec',
    referenceType: 'wiring_diagram',
    summary: 'Pin 12 supplies 5.0V VREF with 60 ohms CAN bus termination.',
    source: {
      sourceName: 'Toyota EWD',
      originalUrl: 'https://techinfo.toyota.com',
      sourceType: 'oem',
      collectedAt: '2026-11-27T00:00:00.000Z',
      language: 'en',
      verificationStatus: 'OEM_VERIFIED',
      confidenceScore: 1,
    },
    tags: ['denso', '89661-0k888', 'vref'],
    verified: true,
    ecuIdentity: {
      manufacturer: 'Toyota',
      partNumber: '89661-0K888',
    },
    provenance: {
      sourceDocument: 'Toyota EWD RM3120E',
      pageOrSection: 'EM-12',
      revision: '2021',
      captureDate: '2026-11-27T00:00:00.000Z',
      verificationStatus: 'VERIFIED',
      evidenceType: 'VERIFIED_OEM',
      testConditions: 'IG-ON Engine OFF',
      versionHistory: [
        {
          version: 1,
          updatedAt: '2026-11-27T00:00:00.000Z',
          actor: 'test',
          lifecycleStatus: 'VERIFIED',
          changeSummary: 'Seed',
        },
      ],
    },
  });

  const guardedLlmRes = await runUnifiedAiOrchestrator({
    query: 'What is VREF on Denso 89661-0K888?',
    make: 'toyota',
    ecuPartNumber: '89661-0K888',
    allowLocalLlm: true,
    localExplainerFn: async () =>
      'Check Pin 12 for 5.0V, and also probe fabricated Pin 77 for 14.9V at 999 Hz.',
  });
  assert.equal(guardedLlmRes.executionMode, 'LOCAL_WEBGPU_LLM');
  assert.equal(guardedLlmRes.numericValidation.hasUnverifiedNumbers, true);
  assert.ok(guardedLlmRes.answer.includes('Pin 77 [UNVERIFIED — NOT IN RETRIEVED EVIDENCE]'));
  console.log('  PASS: 4. Numeric Validator catches fabricated pins, voltages, resistances, and frequencies');

  // 5. Privacy filter strips PII/identifiers before cloud calls
  const scrubbed = scrubSensitiveDataForCloud(
    'Owner: Juan Dela Cruz, email tech@shop.com, phone 555-867-5309, VIN 1HGCM82633A004352, license VECL-1111-2222-3333, fault P0122 TPS low.'
  );
  assert.ok(!scrubbed.sanitizedText.includes('tech@shop.com'));
  assert.ok(!scrubbed.sanitizedText.includes('555-867-5309'));
  assert.ok(!scrubbed.sanitizedText.includes('1HGCM82633A004352'));
  assert.ok(!scrubbed.sanitizedText.includes('VECL-1111-2222-3333'));
  assert.ok(scrubbed.sanitizedText.includes('P0122 TPS low'));
  assert.ok(scrubbed.redactedCount >= 4);
  console.log('  PASS: 5. Privacy filter scrubs emails, phones, VINs, licenses, and owner IDs');

  // 6. Simulation context query carries Level 5 Simulated Result label
  const simRes = await runUnifiedAiOrchestrator({
    query: 'Analyze current bench fault on unknown Zorgon trainer',
    simulationContext: {
      ecuName: 'Virtual Trainer ECU',
      selectedComponent: 'TPS Sensor',
      injectedFaults: ['TPS_SHORT_TO_GND'],
      dmmReadingSummary: '0.02V DC on Pin 7',
    },
  });
  assert.equal(simRes.evidenceLevel, 'SIMULATED_RESULT');
  assert.ok(simRes.answer.includes('5. Simulated result'));
  assert.ok(simRes.answer.includes('TPS_SHORT_TO_GND'));
  resetAutomotiveKnowledgeCacheForTests();
  console.log('  PASS: 6. Simulation context responses are labeled Level 5 SIMULATED');

  console.log('\nM2 Unified AI Orchestrator Suite Summary: 6 passed, 0 failed\n');
}

runM2OrchestratorTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
