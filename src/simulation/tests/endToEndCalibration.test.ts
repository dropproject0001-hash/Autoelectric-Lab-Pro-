/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import {
  adoptMultiStoreLocalKnowledge,
  formatOrchestratorResponseForVoice,
  runEndToEndCalibrationAudit,
} from '../../services/ai/localKnowledgeAdoptionEngine';
import { runUnifiedAiOrchestrator } from '../../services/ai/unifiedAiOrchestrator';

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error('   ', err instanceof Error ? err.message : err);
    failed++;
  }
}

async function main() {
  console.log('\n=== End-to-End Feature Calibration, Zero-Duplication & Local LLM Voice Adoption ===');

  await runTest('1. Zero data duplication verified across ALL 8 knowledge store audits', () => {
    const report = runEndToEndCalibrationAudit();
    assert.equal(report.allStoresZeroDuplicates, true, JSON.stringify(report.storeAudits, null, 2));
    assert.equal(report.logicalConnectivity.knowledgeCatalogHydrated, true);
    assert.equal(report.logicalConnectivity.archiveOrgIndexedInCatalog, true);
    assert.equal(report.logicalConnectivity.multiStoreAdoptionActive, true);
    assert.equal(report.logicalConnectivity.voiceOrchestratorBridgeReady, true);
    assert.ok(
      report.totalUniqueKnowledgeItems >= 2100,
      `Expected >= 2100 unique knowledge items, got ${report.totalUniqueKnowledgeItems}`
    );
  });

  await runTest('2. Multi-store local knowledge adoption retrieves ECU PCB KB, FuseBoxInfo, PH 2080 & Archive.org without duplicates', () => {
    const ecuKb = adoptMultiStoreLocalKnowledge({ query: 'Nissan Hitachi MEC11 K-Line Pin 88' });
    assert.ok(
      ecuKb.items.some((i) => i.store === 'ECU_REPAIR_KB'),
      'Expected ECU_REPAIR_KB hit for Hitachi MEC11'
    );
    assert.ok(ecuKb.localLlmContextBlock.includes('ECU_REPAIR_KB'));

    const fuseHit = adoptMultiStoreLocalKnowledge({ query: 'Toyota Corolla EFI fuse relay cavity' });
    assert.ok(
      fuseHit.items.some((i) => i.store === 'FUSE_BOX_INFO' || i.store === 'START_MY_CAR'),
      'Expected FuseBoxInfo or StartMyCar hit for Toyota Corolla EFI fuse'
    );

    const phHit = adoptMultiStoreLocalKnowledge({ query: 'P0335 crankshaft position sensor' });
    assert.ok(
      phHit.items.some((i) => i.store === 'PH_TROUBLE_SCENARIOS'),
      'Expected PH_TROUBLE_SCENARIOS hit for P0335'
    );

    const archiveHit = adoptMultiStoreLocalKnowledge({
      query: 'Toyota Celica ST185 wiring diagram',
      includeUnverified: true,
    });
    assert.ok(
      archiveHit.items.some((i) => i.store === 'ARCHIVE_ORG_TOYOTA'),
      'Expected ARCHIVE_ORG_TOYOTA hit when includeUnverified is true'
    );
  });

  await runTest('3. Unified AI Orchestrator feeds multi-store context into Local WebGPU LLM and validates numbers', async () => {
    let capturedPrompt = '';
    const res = await runUnifiedAiOrchestrator({
      query: 'Nissan Hitachi MEC11 K-Line Pin 88 bench wakeup',
      lang: 'EN',
      allowLocalLlm: true,
      localExplainerFn: async (prompt) => {
        capturedPrompt = prompt;
        return 'Hitachi MEC11 communicates via ISO-9141 K-Line on Pin 88 to OBD2 Pin 7 with battery +12V on Pin 67.';
      },
    });

    assert.equal(res.hasEvidenceGap, false);
    assert.equal(res.executionMode, 'LOCAL_WEBGPU_LLM');
    assert.ok(
      capturedPrompt.includes('Multi-Store Adopted Context'),
      'Expected Local LLM prompt to include Multi-Store Adopted Context'
    );
    assert.ok(res.sources.length >= 1, 'Expected source attribution');
    assert.equal(res.numericValidation.hasUnverifiedNumbers, false);
  });

  await runTest('4. Voice formatter produces clean EN & Taglish spoken output with SIMULATED disclosure', async () => {
    const res = await runUnifiedAiOrchestrator({
      query: 'P0335 crankshaft sensor',
      lang: 'TL',
      allowLocalLlm: false,
      simulationContext: {
        ecuName: 'Universal 16-Pin EFI ECU',
        activeDtcs: ['P0335'],
        dmmReadingSummary: 'V_DC: 0.00 V',
      },
    });

    const voiceTL = formatOrchestratorResponseForVoice({
      answer: res.answer,
      evidenceLevel: res.evidenceLevel,
      executionMode: res.executionMode,
      sources: res.sources,
      hasEvidenceGap: res.hasEvidenceGap,
      lang: 'TL',
      hasSimulationContext: true,
    });

    assert.ok(voiceTL.spokenText.includes('SIMULATED'), 'Taglish spoken reply must disclose SIMULATED');
    assert.equal(/[*#`_]/.test(voiceTL.spokenText), false, 'Spoken text must have no markdown syntax');
    assert.ok(voiceTL.followUpChips.length >= 3);
    assert.ok(voiceTL.detailsBullets.length >= 1);
  });

  await runTest('5. Missing/fabricated ECU spec still returns honest Information Gap (zero hallucination)', async () => {
    const res = await runUnifiedAiOrchestrator({
      query: 'What is the pinout voltage for fabricated ECU XQZ-999888-NONEXISTENT?',
      lang: 'EN',
      allowLocalLlm: true,
      includeUnverifiedDb: false,
    });

    assert.equal(res.hasEvidenceGap, true);
    assert.equal(res.executionMode, 'DATABASE_ONLY');
    assert.ok(res.answer.toLowerCase().includes('information gap'));
  });

  console.log(`\nEnd-to-End Calibration Suite Summary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
