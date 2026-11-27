/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import {
  getStartMyCarManifest,
  getAllIngestedVehicleProfiles,
  getStartMyCarProfile,
  searchStartMyCarKnowledge,
} from '../../services/startMyCarKnowledgeService';
import { classifyCircuitRole, determineVerificationTier } from '../../../scripts/ingestion/startMyCarIngestionEngine';

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
  console.log('\n=== STARTMYCAR HIGH-FIDELITY INGESTION & ZERO-FABRICATION TEST SUITE ===');

  await runTest('1. Manifest validates catalog schema, vehicle counts, and brand groupings', () => {
    const manifest = getStartMyCarManifest();
    assert.ok(manifest, 'Manifest must exist');
    assert.equal(manifest.schemaVersion, '1.0.0');
    assert.ok(manifest.totalVehicles >= 14, `Expected >= 14 vehicles, got ${manifest.totalVehicles}`);
    assert.ok(manifest.totalFusesAndRelays >= 1500, `Expected >= 1500 cavities, got ${manifest.totalFusesAndRelays}`);

    const brandSlugs = manifest.brands.map((b) => b.makeSlug);
    assert.ok(brandSlugs.includes('toyota'), 'Must include Toyota');
    assert.ok(brandSlugs.includes('ford'), 'Must include Ford');
    assert.ok(brandSlugs.includes('nissan'), 'Must include Nissan');
    assert.ok(brandSlugs.includes('honda'), 'Must include Honda');
    assert.ok(brandSlugs.includes('isuzu'), 'Must include Isuzu');
    assert.ok(brandSlugs.includes('suzuki'), 'Must include Suzuki');
  });

  await runTest('2. Zero-fabrication provenance stamps are enforced on every profile', () => {
    const profiles = getAllIngestedVehicleProfiles();
    assert.ok(profiles.length >= 14, 'Profiles must be populated');

    for (const p of profiles) {
      assert.equal(p.schemaVersion, '1.0.0');
      assert.equal(p.provenance.source, 'StartMyCar');
      assert.equal(p.provenance.zeroFabricationIntegrity, true);
      assert.ok(p.provenance.sourceUrl.startsWith('https://www.startmycar.com/'), `Invalid URL: ${p.provenance.sourceUrl}`);
      assert.ok(!isNaN(Date.parse(p.provenance.crawledAt)), 'crawledAt must be valid ISO date string');
      assert.ok(p.powerDistribution.totalCavities > 0, 'Total cavities must be > 0');
      assert.ok(p.powerDistribution.boxes.length > 0, 'Must have at least 1 fuse box');
    }
  });

  await runTest('3. Strict deduplication links existing repository seeds and presets', () => {
    const corolla2020 = getStartMyCarProfile('toyota', 'corolla', 2020);
    assert.ok(corolla2020, '2020 Corolla must exist');
    assert.equal(corolla2020.provenance.deduplicationStatus, 'AUGMENTED_EXISTING');
    assert.equal(corolla2020.provenance.matchedRepositoryRecordId, 'preset-toyota-corolla-2020');

    const ranger2019 = getStartMyCarProfile('ford', 'ranger', 2019);
    assert.ok(ranger2019, '2019 Ranger must exist');
    assert.equal(ranger2019.provenance.deduplicationStatus, 'AUGMENTED_EXISTING');
    assert.equal(ranger2019.provenance.matchedRepositoryRecordId, 'preset-ford-ranger-2019');

    const sentra2018 = getStartMyCarProfile('nissan', 'sentra', 2018);
    assert.ok(sentra2018, '2018 Sentra must exist');
    assert.equal(sentra2018.provenance.deduplicationStatus, 'AUGMENTED_EXISTING');
    assert.equal(sentra2018.provenance.matchedRepositoryRecordId, 'preset-nissan-sentra-2018');
  });

  await runTest('4. Circuit role classifier maps ECU, Sensor, Fuel Pump, and OBD circuits accurately', () => {
    assert.equal(classifyCircuitRole('(EFI NO.1) Multiport fuel injection system'), 'ECU_POWER');
    assert.equal(classifyCircuitRole('ECM Power Relay'), 'ECU_POWER');
    assert.equal(classifyCircuitRole('Fuel pump relay'), 'FUEL_PUMP');
    assert.equal(classifyCircuitRole('VVT Sensor Valve'), 'SENSOR_VREF');
    assert.equal(classifyCircuitRole('O2 Sensor Heater'), 'SENSOR_VREF');
    assert.equal(classifyCircuitRole('OBD II DLC Connector'), 'OBD2_DLC');
    assert.equal(classifyCircuitRole('Ignition Switch (KL15)'), 'IGNITION');
    assert.equal(classifyCircuitRole('ABS Actuator & Pump'), 'CHASSIS');
    assert.equal(classifyCircuitRole('Headlight High Beam Left'), 'LIGHTING');
    assert.equal(classifyCircuitRole('Rear Window Defogger Blower'), 'ACCESSORY');
  });

  await runTest('5. Structured Tier classification separates verified, unverified, and low-rating datasets', () => {
    const corolla2020 = getStartMyCarProfile('toyota', 'corolla', 2020);
    assert.ok(corolla2020);
    assert.equal(corolla2020.provenance.tier, 'VERIFIED');

    const civic2018 = getStartMyCarProfile('honda', 'civic', 2018);
    assert.ok(civic2018);
    assert.equal(civic2018.provenance.tier, 'COMMUNITY_UNVERIFIED');

    // Synthetic sparse check
    const sparseTier = determineVerificationTier(
      { brand: 'Unknown', makeSlug: 'unknown', model: 'Test', modelSlug: 'test', year: 2020 },
      [],
      2
    );
    assert.equal(sparseTier, 'LOW_RATING_RESTRICTED');
  });

  await runTest('6. Offline search engine filters by make, circuit role, and keyword query', () => {
    const efiMatches = searchStartMyCarKnowledge({ query: 'EFI', makeSlug: 'toyota' });
    assert.ok(efiMatches.length > 0, 'Should find EFI circuits in Toyota profiles');
    assert.ok(efiMatches[0].matchedCircuits.some((m) => m.item.circuitRole === 'ECU_POWER'));

    const obdMatches = searchStartMyCarKnowledge({ circuitRole: 'OBD2_DLC' });
    assert.ok(obdMatches.length > 0, 'Should find OBD2 DLC power circuits across fleet');

    const nonExistent = searchStartMyCarKnowledge({ makeSlug: 'ferrari' });
    assert.equal(nonExistent.length, 0, 'Unknown make should return empty array');
  });

  console.log(`\nStartMyCar Ingestion Tests Summary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main();
