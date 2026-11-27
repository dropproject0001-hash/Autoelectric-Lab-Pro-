/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import unifiedOemCompiledJson from '../../data/unifiedOemCompiledKnowledge.json';
import {
  loadAutomotiveKnowledgeCatalog,
  searchAutomotiveKnowledge,
  getRelevantReferencesForAiContext,
  exportCatalogToJson,
  importCatalogFromJson,
  importOemManufacturersFromCsv,
  resetAutomotiveKnowledgeCatalogCache,
} from '../../services/automotiveKnowledgeService';
import { normalizeSystemCategory } from '../../utils/automotiveTaxonomy';
import {
  buildOemCountingMonitorSnapshot,
  filterOemCorrelationRows,
  formatOemLastUpdatedTimestamp,
  resolveLatestOemKnowledgeTimestamp,
  summarizeCorrelationRows,
} from '../../utils/oemCountingMonitor';
import {
  mergeOemManufacturersDeduplicated,
  parseStartMyCarOemCsv,
} from '../../utils/oemManufacturerCsvImporter';

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

  await runTest('Catalog loads successfully with all 96 deduplicated OEM manufacturers including mandatory brands', () => {
    resetAutomotiveKnowledgeCatalogCache();
    const catalog = loadAutomotiveKnowledgeCatalog();
    assert.ok(catalog, 'Catalog should be defined');
    assert.equal(catalog.schemaVersion, '1.1.0');
    assert.equal(catalog.manufacturers.length, 96, 'Expected 96 unique deduplicated OEM manufacturers');
    assert.equal(catalog.statistics.manufacturerCount, 96);

    const slugs = catalog.manufacturers.map((m) => m.slug.toLowerCase());
    const uniqueSlugs = new Set(slugs);
    assert.equal(uniqueSlugs.size, slugs.length, 'Catalog manufacturers must have zero duplicate slugs');

    assert.ok(uniqueSlugs.has('ford'), 'Must include Ford');
    assert.ok(uniqueSlugs.has('toyota'), 'Must include Toyota');
    assert.ok(uniqueSlugs.has('nissan'), 'Must include Nissan');
    assert.ok(uniqueSlugs.has('suzuki'), 'Must include Suzuki');
    assert.ok(uniqueSlugs.has('isuzu'), 'Must include Isuzu');
    assert.ok(uniqueSlugs.has('honda'), 'Must include Honda');
    assert.ok(uniqueSlugs.has('chevrolet'), 'Must include imported Chevrolet');
    assert.ok(uniqueSlugs.has('mercedes-benz'), 'Must include imported Mercedes-Benz');
    assert.ok(uniqueSlugs.has('lynk-co'), 'Must include imported Lynk & Co');

    const lynk = catalog.manufacturers.find((m) => m.slug === 'lynk-co');
    assert.equal(lynk?.make, 'Lynk & Co', 'HTML entities in CSV anchor text must be decoded');
    assert.equal(lynk?.verified, false, 'CSV directory-only entries must not fabricate deep verification');

    const merc = catalog.manufacturers.find((m) => m.slug === 'mercedes-benz');
    assert.equal(merc?.make, 'Mercedes-Benz', 'Empty CSV anchor text must resolve canonical brand casing');

    const toyota = catalog.manufacturers.find((m) => m.slug === 'toyota');
    assert.equal(toyota?.verified, true, 'Existing verified OEM manufacturer must remain verified');
  });

  await runTest('System taxonomy normalization maps aliases correctly', () => {
    assert.equal(normalizeSystemCategory('fuel pump'), 'fuel_system');
    assert.equal(normalizeSystemCategory('alternator'), 'electrical_charging');
    assert.equal(normalizeSystemCategory('ecu'), 'engine_management_ecu');
    assert.equal(normalizeSystemCategory('automatic transmission'), 'transmission');
    assert.equal(normalizeSystemCategory('unknown category'), null);
  });

  await runTest('Search engine filters and ranks by vehicle make, model, system category, and query tokens', () => {
    const allResults = searchAutomotiveKnowledge({ systemCategoryId: 'all' });
    assert.ok(allResults.length >= 17, 'Default "all" system category must return indexed repair references');

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

  await runTest('JSON catalog export and import round-trip preserves integrity without duplication', () => {
    const before = loadAutomotiveKnowledgeCatalog();
    const jsonStr = exportCatalogToJson();
    assert.ok(jsonStr.length > 100, 'Exported JSON should be non-empty');

    const importRes = importCatalogFromJson(jsonStr);
    assert.equal(importRes.success, true, 'Import should succeed');
    assert.ok((importRes.count ?? 0) > 0, 'Imported count should be positive');
    assert.equal(importRes.addedManufacturers, 0, 'Re-importing same JSON must add 0 duplicate manufacturers');
    assert.equal(importRes.addedReferences, 0, 'Re-importing same JSON must add 0 duplicate references');

    const after = loadAutomotiveKnowledgeCatalog();
    assert.equal(after.manufacturers.length, before.manufacturers.length);
    assert.equal(after.repairReferences.length, before.repairReferences.length);

    const badImport = importCatalogFromJson('{"invalid": true}');
    assert.equal(badImport.success, false, 'Invalid JSON schema must be rejected');
  });

  await runTest('StartMyCar OEM CSV importer filters non-OEM links and guarantees zero data duplication', () => {
    const csv1Path = path.resolve(
      process.cwd(),
      'public/assets/aistudio/links-startmycar.com__1__952f30fe.csv'
    );
    const csv2Path = path.resolve(
      process.cwd(),
      'public/assets/aistudio/links-startmycar.com_7256e111.csv'
    );
    const csv1 = fs.readFileSync(csv1Path, 'utf8');
    const csv2 = fs.readFileSync(csv2Path, 'utf8');

    const parsed1 = parseStartMyCarOemCsv(csv1);
    assert.equal(parsed1.validOemLinksFound, 96);
    assert.equal(parsed1.manufacturers.length, 96);
    assert.equal(parsed1.ignoredNonOemRows, 10);

    const parsed2 = parseStartMyCarOemCsv(csv2);
    assert.equal(parsed2.validOemLinksFound, 6);
    assert.equal(parsed2.manufacturers.length, 6);
    assert.equal(parsed2.ignoredNonOemRows, 10);

    // Merging CSV2 into CSV1 must add 0 new makes (all 6 are duplicates)
    const mergedBoth = mergeOemManufacturersDeduplicated(
      parsed1.manufacturers,
      parsed2.manufacturers
    );
    assert.equal(mergedBoth.addedCount, 0);
    assert.equal(mergedBoth.duplicateCount, 6);
    assert.equal(mergedBoth.totalCount, 96);

    // Re-importing both CSVs into the already-populated local database must be 100% idempotent
    const reimport1 = importOemManufacturersFromCsv(csv1);
    assert.equal(reimport1.success, true);
    assert.equal(reimport1.addedCount, 0, 'Re-importing CSV 1 must add 0 duplicates');
    assert.equal(reimport1.duplicateCount, 96);
    assert.equal(reimport1.totalManufacturers, 96);

    const reimport2 = importOemManufacturersFromCsv(csv2);
    assert.equal(reimport2.success, true);
    assert.equal(reimport2.addedCount, 0, 'Re-importing CSV 2 must add 0 duplicates');
    assert.equal(reimport2.duplicateCount, 6);
    assert.equal(reimport2.totalManufacturers, 96);
  });

  await runTest('OEM Counting Monitor aggregates live Fuse-Box.info, StartMyCar, and Dual-OEM correlation counts accurately', () => {
    resetAutomotiveKnowledgeCatalogCache();
    const catalog = loadAutomotiveKnowledgeCatalog();
    const snapshot = buildOemCountingMonitorSnapshot(catalog);

    assert.equal(snapshot.oemProfilesCount, 17, 'Expected 17 bundled OEM profiles');
    assert.equal(snapshot.brandCount, 6, 'Expected 6 major cavity-mapped OEM brands');
    assert.equal(snapshot.catalogManufacturerCount, 96, 'Expected 96 deduplicated OEM directory manufacturers');
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

    // Compiled OEM knowledge metadata last-updated timestamp derivation & formatting
    const meta = resolveLatestOemKnowledgeTimestamp();
    assert.equal(
      meta.latestIso,
      unifiedOemCompiledJson.generatedAt,
      'Latest compiled file timestamp should match unifiedOemCompiledKnowledge.json'
    );
    assert.equal(meta.sourceLabel, 'Unified OEM Compiled');
    assert.equal(
      meta.formattedUtc,
      formatOemLastUpdatedTimestamp(unifiedOemCompiledJson.generatedAt)
    );
    assert.equal(meta.sources.length, 3, 'Should aggregate all 3 compiled OEM catalog files');
    assert.equal(snapshot.lastUpdatedMeta.latestIso, meta.latestIso);

    const newerOverride = resolveLatestOemKnowledgeTimestamp({
      catalogGeneratedAt: '2026-12-05T09:15:00.000Z',
    });
    assert.equal(newerOverride.latestIso, '2026-12-05T09:15:00.000Z');
    assert.equal(newerOverride.formattedUtc, 'Dec 05, 2026 · 09:15 UTC');
    assert.equal(formatOemLastUpdatedTimestamp('not-a-date'), 'Unavailable');
  });

  console.log(`\nAutomotive Knowledge Tests Summary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main();
