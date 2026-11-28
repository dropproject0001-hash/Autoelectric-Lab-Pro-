/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import {
  getAllEcuPcbComponents,
  getEcuPcbComponentsManifest,
  identifyPcbComponentFromVisualScan,
} from '../../services/ecuPcbComponentKnowledgeService';
import { loadAutomotiveKnowledgeCatalog } from '../../services/automotiveKnowledgeService';
import {
  adoptMultiStoreLocalKnowledge,
  runEndToEndCalibrationAudit,
} from '../../services/ai/localKnowledgeAdoptionEngine';

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error('   ', err instanceof Error ? err.message : err);
    failed++;
  }
}

console.log('\n=== ECU PCB Component Scanner & Guided Repair Suite ===');

runTest('1. Manifest validates 20+ unique OEM ECU PCB components across all 8 hardware roles with zero duplicates', () => {
  const manifest = getEcuPcbComponentsManifest();
  assert.equal(manifest.schemaVersion, '1.0.0');
  assert.equal(manifest.zeroFabricationIntegrity, true);
  assert.ok(manifest.totalComponents >= 20, `Expected >= 20 components, got ${manifest.totalComponents}`);
  const uniqueParts = new Set(manifest.records.map((r) => r.partNumber.toLowerCase()));
  assert.equal(uniqueParts.size, manifest.records.length, 'Duplicate PCB part numbers found');
  for (const rec of manifest.records) {
    assert.ok(rec.technicianProTips.length >= 1, `Missing pro tips for ${rec.partNumber}`);
    assert.ok(rec.guidedRepairSteps.length >= 2, `Missing guided repair steps for ${rec.partNumber}`);
  }
});

runTest('2. Visual scan identification matches laser markings, aliases, cross-references & refDes/category', () => {
  const canMatch = identifyPcbComponentFromVisualScan({
    refDes: 'U4',
    markingText: 'A1050',
    packageType: 'SO-8',
  });
  assert.ok(canMatch.length >= 1 && canMatch[0].component.partNumber === 'TJA1050');

  const boschAlias = identifyPcbComponentFromVisualScan({
    refDes: 'U12',
    markingText: '30402',
  });
  assert.ok(boschAlias.length >= 1 && boschAlias[0].component.partNumber === 'TLE6240GP');

  const toyotaEeprom = identifyPcbComponentFromVisualScan({
    refDes: 'IC901',
    markingText: 'RH56',
  });
  assert.ok(toyotaEeprom.length >= 1 && toyotaEeprom[0].component.partNumber.includes('93C56'));

  const categoryOnly = identifyPcbComponentFromVisualScan({
    refDes: 'Q3',
    category: 'IGNITION_IGBT',
    notes: 'Shorted ignition coil driver P0351',
  });
  assert.ok(
    categoryOnly.length >= 1 && categoryOnly[0].component.role === 'IGNITION_IGBT_DRIVER',
    'Expected category + DTC fallback identification'
  );
});

runTest('3. ECU PCB components are indexed in unified catalog, adopted by Local LLM, and pass zero-duplicate audit', () => {
  const catalog = loadAutomotiveKnowledgeCatalog();
  const pcbRefs = catalog.repairReferences.filter((r) => r.id.startsWith('ref-pcb-'));
  assert.equal(pcbRefs.length, getAllEcuPcbComponents().length);

  const adopted = adoptMultiStoreLocalKnowledge({
    query: 'How to test and replace TJA1050 CAN transceiver on ECU PCB',
  });
  assert.ok(
    adopted.items.some((i) => i.store === 'ECU_PCB_COMPONENTS'),
    'Expected Local LLM multi-store adoption to include ECU_PCB_COMPONENTS'
  );

  const audit = runEndToEndCalibrationAudit();
  assert.equal(audit.allStoresZeroDuplicates, true);
  assert.ok(
    audit.storeAudits.some((s) => s.storeName.includes('ECU PCB Components') && s.duplicateCount === 0)
  );
});

console.log(`\nECU PCB Component Scanner Suite Summary: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
