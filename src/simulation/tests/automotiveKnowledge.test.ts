/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import {
  loadAutomotiveKnowledgeCatalog,
  searchAutomotiveKnowledge,
  getRelevantReferencesForAiContext,
  exportCatalogToJson,
  importCatalogFromJson,
} from '../../services/automotiveKnowledgeService';
import { normalizeSystemCategory } from '../../utils/automotiveTaxonomy';
import {
  buildOemCountingMonitorSnapshot,
  filterOemCorrelationRows,
  summarizeCorrelationRows,
} from '../../utils/oemCountingMonitor';

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(err);
  }
}

async function main() {
  console.log('\n=== AUTOMOTIVE KNOWLEDGE INDEX & REPAIR REFERENCE ENGINE TEST SUITE ===');

  await runTest('Catalog loads successfully with all 5 mandatory manufacturers', () => {
    const catalog = loadAutomotiveKnowledgeCatalog();
    assert.ok(catalog, 'Catalog should be defined');
    assert.equal(catalog.schemaVersion, '1.1.0');

    const makes = catalog.manufacturers.map((m) => m.slug);
    assert.ok(makes.includes('ford'), 'Must include Ford');
    assert.ok(makes.includes('toyota'), 'Must include Toyota');
    assert.ok(makes.includes('nissan'), 'Must include Nissan');
    assert.ok(makes.includes('suzuki'), 'Must include Suzuki');
    assert.ok(makes.includes('isuzu'), 'Must include Isuzu');
  });

  await runTest('System taxonomy normalization maps aliases correctly', () => {
    assert.equal(normalizeSystemCategory('fuel pump'), 'fuel_system');
    assert.equal(normalizeSystemCategory('alternator'), 'electrical_charging');
    assert.equal(normalizeSystemCategory('ecu'), 'engine_management_ecu');
    assert.equal(normalizeSystemCategory('automatic transmission'), 'transmission');
    assert.equal(normalizeSystemCategory('unknown category'), null);
  });

  await runTest('Search engine filters and ranks by vehicle make, model, and search query tokens', () => {
    const rangerResults = searchAutomotiveKnowledge({ query: 'Ford Ranger', make: 'ford' });
    assert.ok(rangerResults.length > 0, 'Should find Ford Ranger references');
    assert.equal(rangerResults[0].reference.make, 'Ford');
    assert.equal(rangerResults[0].reference.model, 'Ranger');

    const hiluxResults = searchAutomotiveKnowledge({ query: 'Toyota Dyna' });
    assert.ok(hiluxResults.length > 0, 'Should find Toyota Dyna references');

    const emptyResults = searchAutomotiveKnowledge({ query: 'NonExistentVehicleXYZ123' });
    assert.equal(emptyResults.length, 0, 'Should return empty array for non-existent vehicle');
  });

  await runTest('AI context retrieval returns up to 3 verified references for diagnostic queries', () => {
    const aiRefs = getRelevantReferencesForAiContext({ query: 'Ford Ranger Duratorq SID208' });
    assert.ok(aiRefs.length <= 3, 'Should return at most 3 references');
    assert.ok(aiRefs.length > 0, 'Should return at least 1 reference for Ford Ranger');
    assert.equal(aiRefs[0].verified, true, 'References returned to AI must be verified');
  });

  await runTest('JSON catalog export and import round-trip preserves integrity', () => {
    const jsonStr = exportCatalogToJson();
    assert.ok(jsonStr.length > 100, 'Exported JSON should be non-empty');

    const importRes = importCatalogFromJson(jsonStr);
    assert.equal(importRes.success, true, 'Import should succeed');
    assert.ok((importRes.count ?? 0) > 0, 'Imported count should be positive');

    const badImport = importCatalogFromJson('{"invalid": true}');
    assert.equal(badImport.success, false, 'Invalid JSON schema must be rejected');
  });

  await runTest('OEM Counting Monitor aggregates live Fuse-Box.info, StartMyCar, and Dual-OEM correlation counts accurately', () => {
    const catalog = loadAutomotiveKnowledgeCatalog();
    const snapshot = buildOemCountingMonitorSnapshot(catalog);

    assert.equal(snapshot.oemProfilesCount, 17, 'Expected 17 bundled OEM profiles');
    assert.equal(snapshot.brandCount, 6, 'Expected 6 major OEM brands');
    assert.equal(snapshot.fbiCavitiesMapped, 2464, 'Expected 2,464 Fuse-Box.info cavities mapped');
    assert.equal(snapshot.smcFleetCavities, 1790, 'Expected 1,790 StartMyCar fleet cavities');
    assert.equal(snapshot.totalCombinedCavities, 4254, 'Expected 4,254 total combined cavities');
    assert.equal(snapshot.dualOemCorrelatedCount, 13, 'Expected 13 Dual-OEM correlated profiles');
    assert.equal(snapshot.singleSourceCount, 4, 'Expected 4 single-source FBI profiles');
    assert.ok(snapshot.overallMatchRatePercent >= 95, `Expected >=95% match rate, got ${snapshot.overallMatchRatePercent}`);
    assert.equal(snapshot.integrityPolicyPercent, 100, 'Expected 100% zero-fabrication integrity');
    assert.equal(snapshot.zeroFabricationVerified, true, 'Zero-fabrication policy must verify true');
    assert.equal(snapshot.catalogReferenceCount, catalog.statistics.referenceCount);

    // First 5 canonical rows match Toyota ordering
    assert.equal(snapshot.rows[0].displayModel, 'Toyota Corolla');
    assert.equal(snapshot.rows[0].yearsLabel, '2019-2022');
    assert.equal(snapshot.rows[0].chassisCode, 'E210');
    assert.equal(snapshot.rows[0].fbiCavities, 126);
    assert.equal(snapshot.rows[0].smcCavities, 197);

    assert.equal(snapshot.rows[1].displayModel, 'Toyota Corolla Facelift');
    assert.equal(snapshot.rows[1].yearsLabel, '2023-2025');
    assert.equal(snapshot.rows[1].fbiCavities, 121);
    assert.equal(snapshot.rows[1].smcCavities, null);

    // Filtering and summary math
    const dualRows = filterOemCorrelationRows(snapshot.rows, { correlationFilter: 'DUAL_OEM' });
    assert.equal(dualRows.length, 13);
    const singleRows = filterOemCorrelationRows(snapshot.rows, { correlationFilter: 'SINGLE_SOURCE' });
    assert.equal(singleRows.length, 4);
    const toyotaRows = filterOemCorrelationRows(snapshot.rows, { makeSlug: 'toyota' });
    assert.equal(toyotaRows.length, 5);
    const toyotaSummary = summarizeCorrelationRows(toyotaRows);
    assert.equal(toyotaSummary.fbiCavitiesTotal, 126 + 121 + 151 + 89 + 110);
    assert.equal(toyotaSummary.dualOemCount, 4);
  });

  console.log(`\nAutomotive Knowledge Tests Summary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main();
