/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import {
  buildArchiveOrgToyotaRepairReferences,
  getAllArchiveOrgToyotaManuals,
  getArchiveOrgToyotaManifest,
  getArchiveOrgToyotaManualsForVehicle,
  searchArchiveOrgToyotaManuals,
} from '../../services/archiveOrgToyotaKnowledgeService';
import {
  loadAutomotiveKnowledgeCatalog,
  searchAutomotiveKnowledge,
} from '../../services/automotiveKnowledgeService';

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

console.log('\n=== Archive.org Toyota Manual PDF (Page 2) Ingestion Verification ===');

runTest('1. Manifest metadata, source page 2 provenance, and zero-fabrication flags are intact', () => {
  const manifest = getArchiveOrgToyotaManifest();
  assert.equal(manifest.schemaVersion, '1.0.0');
  assert.equal(manifest.sourceSite, 'archive.org');
  assert.equal(manifest.sourcePage, 2);
  assert.equal(manifest.zeroFabricationIntegrity, true);
  assert.equal(
    manifest.sourceSearchUrl,
    'https://archive.org/search?tab=all&query=Toyota+manual+pdf&page=2'
  );
  assert.ok(manifest.rawPageDocsFetched >= 40, 'Expected full page-2 batch fetched');
  assert.ok(manifest.automotiveManualsIngested >= 40, 'Expected >= 40 automotive manuals ingested');
  assert.ok(manifest.totalPdfAssetsIndexed >= 40, 'Expected >= 40 PDF assets indexed');
  assert.equal(manifest.records.length, manifest.automotiveManualsIngested);
});

runTest('2. Non-automotive items (sewing machines & audio podcasts) are filtered out cleanly', () => {
  const manifest = getArchiveOrgToyotaManifest();
  const ids = new Set(manifest.records.map((r) => r.identifier));
  assert.equal(ids.has('toyota-830-user-guide'), false, 'Sewing machine guide must be excluded');
  assert.equal(ids.has('The_Tech_Guy_Audio_196'), false, 'Audio podcast must be excluded');
  assert.ok(manifest.filteredOutNonAutomotiveCount >= 2, 'Expected non-automotive items logged in filteredOutItems');
});

runTest('3. Every record enforces UNVERIFIED provenance, valid archive.org URLs, and short excerpt limit', () => {
  const records = getAllArchiveOrgToyotaManuals();
  assert.ok(records.length > 0);
  for (const rec of records) {
    assert.equal(rec.make, 'Toyota');
    assert.equal(rec.provenance.sourceSite, 'archive.org');
    assert.equal(rec.provenance.tier, 'COMMUNITY_UNVERIFIED');
    assert.equal(rec.provenance.evidenceType, 'UNVERIFIED_DATABASE_RECORD');
    assert.ok(
      rec.provenance.detailsUrl.startsWith('https://archive.org/details/'),
      `Invalid detailsUrl: ${rec.provenance.detailsUrl}`
    );
    assert.ok(
      rec.descriptionExcerpt.length <= 330,
      `Excerpt too long (${rec.descriptionExcerpt.length}) for ${rec.identifier}`
    );
    for (const pdf of rec.pdfAssets) {
      assert.ok(
        pdf.downloadUrl.startsWith('https://archive.org/download/'),
        `Invalid PDF URL: ${pdf.downloadUrl}`
      );
    }
  }
});

runTest('4. Offline search locates Celica ST185 wiring diagram and AE86 Corolla repair manual', () => {
  const st185 = searchArchiveOrgToyotaManuals({ query: 'ST185 wiring' });
  assert.ok(st185.length >= 1, 'Expected Celica ST185 wiring diagram match');
  assert.equal(st185[0].record.category, 'WIRING_DIAGRAM');
  assert.ok(st185[0].record.chassisCodes.includes('ST185'));

  const ae86 = searchArchiveOrgToyotaManuals({ query: 'Corolla GTS' });
  assert.ok(ae86.length >= 1, 'Expected AE86 Corolla GTS repair manual match');
  assert.equal(ae86[0].record.modelSlug, 'corolla');

  const camryList = getArchiveOrgToyotaManualsForVehicle('camry');
  assert.ok(camryList.length >= 2, 'Expected multiple Toyota Camry manuals');
});

runTest('5. Archive.org Toyota references are indexed into unified automotiveKnowledgeService', () => {
  const refs = buildArchiveOrgToyotaRepairReferences();
  assert.equal(refs.length, getAllArchiveOrgToyotaManuals().length);

  const catalog = loadAutomotiveKnowledgeCatalog();
  const archiveRefsInCatalog = catalog.repairReferences.filter((r) =>
    r.id.startsWith('ref-archiveorg-toyota-')
  );
  assert.equal(
    archiveRefsInCatalog.length,
    refs.length,
    'Expected all Archive.org Toyota references hydrated into default catalog'
  );

  const searchHits = searchAutomotiveKnowledge({
    query: 'ST185 wiring diagram',
    includeUnverified: true,
  });
  assert.ok(
    searchHits.some((hit) => hit.reference.id.startsWith('ref-archiveorg-toyota-')),
    'Expected MiniSearch in automotiveKnowledgeService to retrieve Archive.org Toyota manual when includeUnverified is enabled'
  );
});

console.log(`\nArchive.org Toyota Ingestion Tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
