/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import {
  getAllFuseBoxInfoProfiles,
  getCriticalEcuFeeds,
  getFuseBoxInfoManifest,
  getFuseBoxInfoProfile,
  getObdDiagnosticPowerFeed,
  searchFuseBoxInfoKnowledge,
  crossVerifyWithStartMyCar,
} from '../../services/fuseBoxInfoKnowledgeService';
import {
  classifyCircuitRole,
  determineVerificationTier,
} from '../../../scripts/ingestion/fuseBoxInfoIngestionEngine';

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
  console.log('\n=== FUSE-BOX.INFO OEM HIGH-FIDELITY INGESTION & ZERO-FABRICATION TEST SUITE ===');

  await runTest('1. Manifest validates catalog schema, vehicle counts, and OEM brand groupings', () => {
    const manifest = getFuseBoxInfoManifest();
    assert.ok(manifest, 'Manifest must exist');
    assert.equal(manifest.schemaVersion, '1.0.0');
    assert.equal(manifest.sourceDomain, 'fuse-box.info');
    assert.ok(manifest.totalProfiles >= 17, `Expected >= 17 profiles, got ${manifest.totalProfiles}`);
    assert.ok(manifest.totalCavitiesMapped >= 2000, `Expected >= 2000 cavities, got ${manifest.totalCavitiesMapped}`);

    const brandSlugs = manifest.brands.map((b) => b.makeSlug);
    assert.ok(brandSlugs.includes('toyota'), 'Must include Toyota');
    assert.ok(brandSlugs.includes('ford'), 'Must include Ford');
    assert.ok(brandSlugs.includes('nissan'), 'Must include Nissan');
    assert.ok(brandSlugs.includes('honda'), 'Must include Honda');
    assert.ok(brandSlugs.includes('isuzu'), 'Must include Isuzu');
    assert.ok(brandSlugs.includes('suzuki'), 'Must include Suzuki');
  });

  await runTest('2. Zero-fabrication provenance stamps are enforced on every profile', () => {
    const profiles = getAllFuseBoxInfoProfiles();
    assert.ok(profiles.length >= 17, 'Profiles must be populated');

    for (const p of profiles) {
      assert.equal(p.schemaVersion, '1.0.0');
      assert.equal(p.provenance.source, 'FuseBoxInfo');
      assert.equal(p.provenance.zeroFabricationIntegrity, true);
      assert.ok(p.provenance.sourceUrl.startsWith('https://fuse-box.info/'), `Invalid URL: ${p.provenance.sourceUrl}`);
      assert.ok(p.provenance.wpPostId > 0, 'wpPostId must be positive integer');
      assert.ok(!isNaN(Date.parse(p.provenance.crawledAt)), 'crawledAt must be valid ISO date string');
      assert.ok(p.powerDistribution.totalCavities > 0, 'Total cavities must be > 0');
      assert.ok(p.powerDistribution.boxes.length > 0, 'Must have at least 1 fuse box');
    }
  });

  await runTest('3. Strict deduplication links existing repository seeds and presets', () => {
    const corolla2020 = getFuseBoxInfoProfile('toyota', 'corolla', 2020);
    assert.ok(corolla2020, '2020 Corolla must exist');
    assert.equal(corolla2020.provenance.deduplicationStatus, 'AUGMENTED_EXISTING');
    assert.equal(corolla2020.provenance.matchedRepositoryRecordId, 'preset-toyota-corolla');

    const ranger2019 = getFuseBoxInfoProfile('ford', 'ranger', 2019);
    assert.ok(ranger2019, '2019 Ranger must exist');
    assert.equal(ranger2019.provenance.deduplicationStatus, 'AUGMENTED_EXISTING');
    assert.equal(ranger2019.provenance.matchedRepositoryRecordId, 'preset-ford-ranger');

    const sentra2018 = getFuseBoxInfoProfile('nissan', 'sentra', 2018);
    assert.ok(sentra2018, '2018 Sentra must exist');
    assert.equal(sentra2018.provenance.deduplicationStatus, 'AUGMENTED_EXISTING');
    assert.equal(sentra2018.provenance.matchedRepositoryRecordId, 'preset-nissan-sentra');
  });

  await runTest('4. Circuit role and relay detection maps ECU, Sensor, Fuel Pump, and OBD circuits accurately', () => {
    assert.equal(classifyCircuitRole('Multiport fuel injection system', 'EFI-MAIN'), 'ECU_POWER');
    assert.equal(classifyCircuitRole('Engine control module power feed', 'ECM'), 'ECU_POWER');
    assert.equal(classifyCircuitRole('Fuel pump control relay', 'FP RLY'), 'FUEL_PUMP');
    assert.equal(classifyCircuitRole('Variable Valve Timing solenoid', 'VVT'), 'SENSOR_VREF');
    assert.equal(classifyCircuitRole('Nitrogen Oxides Sensor', 'NOX PM'), 'SENSOR_VREF');
    assert.equal(classifyCircuitRole('On-board diagnostics DLC connector', 'OBD'), 'OBD2_DLC');
    assert.equal(classifyCircuitRole('Ignition switch power', 'IGN'), 'IGNITION');
    assert.equal(classifyCircuitRole('Anti-lock braking system', 'ABS-MAIN'), 'CHASSIS');
    assert.equal(classifyCircuitRole('Front fog lights', 'FOG FR'), 'LIGHTING');
    assert.equal(classifyCircuitRole('Rear window defogger blower', 'DEFOG'), 'ACCESSORY');
  });

  await runTest('5. Structured Tier classification separates verified, unverified, and low-rating datasets', () => {
    const corolla2020 = getFuseBoxInfoProfile('toyota', 'corolla', 2020);
    assert.ok(corolla2020);
    assert.equal(corolla2020.provenance.tier, 'VERIFIED');

    // Sparse check
    const sparseTier = determineVerificationTier([], 2);
    assert.equal(sparseTier, 'LOW_RATING_RESTRICTED');
  });

  await runTest('6. Offline search engine filters by make, circuit role, and keyword query', () => {
    const efiMatches = searchFuseBoxInfoKnowledge({ query: 'EFI', makeSlug: 'toyota' });
    assert.ok(efiMatches.length > 0, 'Should find EFI circuits in Toyota profiles');
    assert.ok(efiMatches[0].matchedCavity.circuitRole === 'ECU_POWER');

    const obdMatches = searchFuseBoxInfoKnowledge({ circuitRole: 'OBD2_DLC' });
    assert.ok(obdMatches.length > 0, 'Should find OBD2 DLC power circuits across fleet');

    const ecuFeeds = getCriticalEcuFeeds('toyota', 'corolla', 2020);
    assert.ok(ecuFeeds.length > 0, 'Should find dedicated ECU feeds for Corolla');

    const obdFeed = getObdDiagnosticPowerFeed('toyota', 'corolla', 2020);
    assert.ok(obdFeed, 'Should find OBD DLC feed for Corolla');
    assert.equal(obdFeed.circuitName, 'OBD');

    const nonExistent = searchFuseBoxInfoKnowledge({ makeSlug: 'ferrari' });
    assert.equal(nonExistent.length, 0, 'Unknown make should return empty array');
  });

  await runTest('7. Dual-OEM cross-verification service confirms cavity alignment between Fuse-Box.info and StartMyCar', () => {
    const corollaCross = crossVerifyWithStartMyCar('toyota', 'corolla', 2020);
    assert.equal(corollaCross.verified, true);
    assert.equal(corollaCross.confidenceRating, 'DUAL_OEM_CONFIRMED');
    assert.ok(corollaCross.commonCircuits.length > 20, 'Expected > 20 common circuits for Corolla');
    assert.ok(corollaCross.fuseBoxInfoCavitiesCount > 100);
    assert.ok(corollaCross.startMyCarCavitiesCount > 100);

    const f150Cross = crossVerifyWithStartMyCar('ford', 'f-150', 2016);
    assert.equal(f150Cross.verified, true);
    assert.equal(f150Cross.confidenceRating, 'DUAL_OEM_CONFIRMED');
    assert.ok(f150Cross.commonCircuits.length > 50, 'Expected > 50 common circuits for F-150');

    const unknownCross = crossVerifyWithStartMyCar('unknown', 'vehicle', 2020);
    assert.equal(unknownCross.verified, false);
    assert.equal(unknownCross.confidenceRating, 'COMMUNITY_UNVERIFIED');
    assert.equal(unknownCross.commonCircuits.length, 0);
  });

  console.log(`\nFuse-Box.info Ingestion Tests Summary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main();
