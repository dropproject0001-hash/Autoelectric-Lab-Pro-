/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import { INITIAL_AUTOMOTIVE_CATALOG } from '../../data/automotiveKnowledgeSeed';
import {
  CATALOG_SCHEMA_V2,
  migrateCatalogV1ToV2,
  rollbackCatalogMigration,
  validateKnowledgeRecordProvenance,
} from '../../services/knowledgeMigrationService';
import {
  loadAutomotiveKnowledgeCatalog,
  resetAutomotiveKnowledgeCacheForTests,
  searchAutomotiveKnowledge,
  upsertKnowledgeRecordWithProvenance,
} from '../../services/automotiveKnowledgeService';
import type { AutomotiveKnowledgeCatalog, RepairReferenceRecord } from '../../types/automotiveKnowledge';

function runM1DatabaseFoundationTests(): void {
  console.log('\n=== M1 DATABASE FOUNDATION & REVERSIBLE MIGRATION TEST SUITE ===');

  // 1. Reversible migration applies and rolls back cleanly on an isolated copy of the data
  const copyBefore: AutomotiveKnowledgeCatalog = JSON.parse(
    JSON.stringify(INITIAL_AUTOMOTIVE_CATALOG)
  );
  const originalJson = JSON.stringify(copyBefore);

  const { migratedCatalog, backupSnapshot, migrationRecord } = migrateCatalogV1ToV2(
    copyBefore,
    '2026-11-27T00:00:00.000Z'
  );

  assert.equal(migratedCatalog.schemaVersion, CATALOG_SCHEMA_V2, 'Migrated catalog must be schema v2.0');
  assert.equal(
    migratedCatalog.repairReferences.length,
    copyBefore.repairReferences.length,
    'Existing record count must remain intact after migration'
  );
  assert.ok(backupSnapshot.checksum.startsWith('fnv64-'), 'Backup snapshot must include integrity checksum');
  assert.ok(migrationRecord.rollbackInstructions.includes('rollbackCatalogMigration'));

  for (const ref of migratedCatalog.repairReferences) {
    const check = validateKnowledgeRecordProvenance(ref);
    assert.equal(
      check.valid,
      true,
      `Every migrated record must pass provenance validation (${ref.id}: ${check.missingFields.join(', ')})`
    );
  }

  const rollback = rollbackCatalogMigration(backupSnapshot);
  assert.equal(rollback.checksumVerified, true, 'Rollback must verify backup checksum');
  assert.equal(
    JSON.stringify(rollback.restoredCatalog),
    originalJson,
    'Rolled-back catalog must match original pre-migration data byte-for-byte'
  );
  console.log('  PASS: 1. Reversible v1->v2 migration applies and rolls back cleanly on isolated copy');

  // 2. Tampered backup snapshot refuses rollback
  assert.throws(
    () =>
      rollbackCatalogMigration({
        ...backupSnapshot,
        serializedCatalogJson: backupSnapshot.serializedCatalogJson + ' ',
      }),
    /checksum mismatch/i,
    'Tampered backup snapshot must abort rollback'
  );
  console.log('  PASS: 2. Checksum guard aborts rollback on tampered backup snapshot');

  // 3. Provenance enforcement blocks incomplete records
  resetAutomotiveKnowledgeCacheForTests();
  const catalog = loadAutomotiveKnowledgeCatalog();
  assert.ok(catalog.repairReferences.length >= 12);
  assert.ok(
    catalog.repairReferences.every((r) => validateKnowledgeRecordProvenance(r).valid),
    'All default catalog records must be hydrated with valid M1 provenance'
  );

  const invalidRecord: RepairReferenceRecord = {
    id: 'invalid-no-provenance',
    vehicleId: 'veh-test',
    make: 'Toyota',
    model: 'Hilux',
    years: '2020',
    systemCategoryId: 'engine_management_ecu',
    title: 'Incomplete Record',
    referenceType: 'service_manual',
    summary: 'Missing provenance fields',
    source: {
      sourceName: 'Unknown',
      originalUrl: '',
      sourceType: 'manual',
      collectedAt: '',
      language: 'en',
      verificationStatus: 'unverified',
      confidenceScore: 0.2,
    },
    tags: [],
    verified: false,
  };
  const rejected = upsertKnowledgeRecordWithProvenance(invalidRecord, 'test-runner');
  assert.equal(rejected.success, false, 'Record missing mandatory provenance must be rejected');
  assert.ok(rejected.error?.includes('provenance'), 'Error must report missing provenance');
  console.log('  PASS: 3. Provenance validator enforces required fields and blocks incomplete inserts');

  // 4. Exact ECU part-number match ranks strictly above general matches & discloses incomplete ID
  const exactRecord: RepairReferenceRecord = {
    id: 'ref-toyota-89661-0k120-exact',
    vehicleId: catalog.vehicles[0].id,
    make: 'Toyota',
    model: 'Hilux',
    years: '2016-2022',
    systemCategoryId: 'engine_management_ecu',
    title: 'Toyota Hilux 2GD-FTV ECM 89661-0K120 Pinout Reference',
    referenceType: 'wiring_diagram',
    summary: 'Verified OEM connector reference for Denso ECM 89661-0K120: Pin 12 VREF 5.0V +/-0.2V Key-ON.',
    source: {
      sourceName: 'Toyota Technical Information System (EWD)',
      originalUrl: 'https://techinfo.toyota.com',
      sourceType: 'oem_reference',
      collectedAt: '2026-11-27T00:00:00.000Z',
      language: 'en',
      verificationStatus: 'OEM_VERIFIED',
      confidenceScore: 1,
    },
    tags: ['toyota', 'hilux', '89661-0k120', 'vref'],
    verified: true,
    ecuIdentity: {
      manufacturer: 'Toyota / Denso',
      ecuModel: 'Denso 2GD-FTV ECM',
      partNumber: '89661-0K120',
      hardwareId: 'HW-2GD-REV3',
      softwareId: 'SW-89663-0K120',
      engineCode: '2GD-FTV',
      connectorId: 'E8/E9',
      componentName: 'Engine Control Module',
    },
    provenance: {
      sourceDocument: 'Toyota Hilux EWD RM3120E',
      pageOrSection: 'Section EM-44 / ECM Connector E8',
      revision: 'Rev 2021.2',
      captureDate: '2026-11-27T00:00:00.000Z',
      verificationStatus: 'VERIFIED',
      evidenceType: 'VERIFIED_OEM',
      testConditions: 'IG-ON, Engine OFF, 25C ambient, DMM referenced to E1 sensor ground',
      versionHistory: [
        {
          version: 1,
          updatedAt: '2026-11-27T00:00:00.000Z',
          actor: 'admin:oem-ingest',
          lifecycleStatus: 'VERIFIED',
          changeSummary: 'Initial OEM-verified record',
        },
      ],
    },
    electricalSpecs: [
      {
        pinNumber: 'Pin 12',
        signalName: 'VC / 5V VREF',
        voltageRange: '4.8V - 5.2V',
        testCondition: 'IG-ON Engine OFF',
      },
    ],
  };

  const inserted = upsertKnowledgeRecordWithProvenance(exactRecord, 'admin:oem-ingest');
  assert.equal(inserted.success, true, 'Valid provenance record must upsert cleanly');

  const exactHits = searchAutomotiveKnowledge({
    make: 'toyota',
    ecuPartNumber: '89661-0K120',
    query: 'Hilux VREF',
    verifiedOnly: true,
  });
  assert.ok(exactHits.length > 0, 'Exact ECU lookup must return results');
  assert.equal(
    exactHits[0].reference.id,
    'ref-toyota-89661-0k120-exact',
    'Exact ECU part-number match must rank #1 above general Toyota matches'
  );
  assert.equal(exactHits[0].matchTier, 'EXACT_ECU_PART_NUMBER');
  assert.equal(exactHits[0].incompleteIdentificationDisclosure, undefined);

  // Requesting a different part number must disclose incomplete/mismatched identification
  const mismatchedHits = searchAutomotiveKnowledge({
    make: 'toyota',
    ecuPartNumber: '89661-99999',
    query: 'Hilux',
  });
  assert.ok(mismatchedHits.length > 0);
  assert.ok(
    mismatchedHits[0].incompleteIdentificationDisclosure?.includes('Never assume two ECUs are identical'),
    'Non-exact ECU match must explicitly disclose incomplete identification'
  );
  console.log('  PASS: 4. Exact ECU part-number precedence and incomplete identification disclosure verified');

  // 5. Update appends immutable versionHistory entry
  const updated = upsertKnowledgeRecordWithProvenance(
    {
      ...exactRecord,
      summary: exactRecord.summary + ' Updated connector pin check note.',
    },
    'admin:reviewer'
  );
  assert.equal(updated.success, true);
  assert.equal(updated.record?.recordVersion, 2);
  assert.equal(updated.record?.provenance?.versionHistory.length, 2);
  resetAutomotiveKnowledgeCacheForTests();
  console.log('  PASS: 5. Record update increments version and preserves full versionHistory');

  console.log('\nM1 Database Foundation Suite Summary: 5 passed, 0 failed\n');
}

runM1DatabaseFoundationTests();
