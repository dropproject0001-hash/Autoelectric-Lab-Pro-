/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type {
  AutomotiveKnowledgeCatalog,
  EcuComponentIdentity,
  EvidenceHierarchyLevel,
  KnowledgeLifecycleStatus,
  RecordProvenanceEnvelope,
  RepairReferenceRecord,
  VehicleModelRecord,
} from '../types/automotiveKnowledge';

export const CATALOG_SCHEMA_V1 = '1.0';
export const CATALOG_SCHEMA_V2 = '2.0';

export interface CatalogBackupSnapshot {
  backupId: string;
  createdAt: string;
  sourceSchemaVersion: string;
  recordCount: number;
  checksum: string;
  serializedCatalogJson: string;
}

export interface MigrationAuditRecord {
  migrationId: string;
  fromVersion: string;
  toVersion: string;
  appliedAt: string;
  recordsProcessed: number;
  recordsUpgraded: number;
  backupId: string;
  rollbackInstructions: string;
}

export interface ProvenanceValidationResult {
  valid: boolean;
  missingFields: string[];
  warnings: string[];
}

function computeDeterministicChecksum(input: string): string {
  // Deterministic 64-bit-style dual FNV-1a hex digest (works identically in browser & Node)
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `fnv64-${part1}${part2}`;
}

export function createCatalogBackupSnapshot(
  catalog: AutomotiveKnowledgeCatalog,
  nowIso: string = new Date().toISOString()
): CatalogBackupSnapshot {
  const serializedCatalogJson = JSON.stringify(catalog);
  const checksum = computeDeterministicChecksum(serializedCatalogJson);
  return {
    backupId: `bkp-${nowIso.replace(/[^0-9]/g, '').slice(0, 14)}-${checksum.slice(-6)}`,
    createdAt: nowIso,
    sourceSchemaVersion: catalog.schemaVersion || CATALOG_SCHEMA_V1,
    recordCount: catalog.repairReferences.length,
    checksum,
    serializedCatalogJson,
  };
}

function inferLifecycleStatus(ref: RepairReferenceRecord): KnowledgeLifecycleStatus {
  if (ref.provenance?.verificationStatus) {
    return ref.provenance.verificationStatus;
  }
  const srcStatus = String(ref.source?.verificationStatus || '').toUpperCase();
  if (
    ref.verified &&
    (srcStatus === 'OEM_VERIFIED' ||
      srcStatus === 'OFFICIAL_MANUFACTURER' ||
      srcStatus === 'OFFICIAL_GOVERNMENT' ||
      srcStatus === 'VERIFIED_SOURCE')
  ) {
    return 'VERIFIED';
  }
  return 'PENDING';
}

function inferEvidenceType(
  ref: RepairReferenceRecord,
  lifecycleStatus: KnowledgeLifecycleStatus
): EvidenceHierarchyLevel {
  if (ref.provenance?.evidenceType) {
    return ref.provenance.evidenceType;
  }
  if (lifecycleStatus === 'VERIFIED') {
    return 'VERIFIED_OEM';
  }
  if (lifecycleStatus === 'TECHNICIAN_CONFIRMED') {
    return 'TECHNICIAN_CONFIRMED';
  }
  return 'UNVERIFIED_DB';
}

function buildEcuIdentityFromRecord(
  ref: RepairReferenceRecord,
  vehicle?: VehicleModelRecord
): EcuComponentIdentity {
  if (ref.ecuIdentity && ref.ecuIdentity.manufacturer) {
    return { ...ref.ecuIdentity };
  }
  const engineCode = vehicle?.engine?.engineCode ?? null;
  const partMatch = `${ref.title} ${ref.summary}`.match(
    /\b(?:89661-[A-Z0-9]{4,6}|37820-[A-Z0-9-]{5,10}|23710-[A-Z0-9]{4,6}|33920-[A-Z0-9]{4,6}|897[0-9]{6,8}|ME\d+\.\d+|EDC1[567][A-Z0-9]*|SID\d{3})\b/i
  );
  return {
    manufacturer: ref.make || vehicle?.make || 'UNKNOWN_MANUFACTURER',
    ecuModel: ref.systemCategoryId === 'engine_management_ecu' ? `${ref.make} ${ref.model} ECM/PCM` : null,
    partNumber: partMatch ? partMatch[0].toUpperCase() : null,
    hardwareId: null,
    softwareId: null,
    engineCode,
    connectorId: null,
    componentName: ref.title,
  };
}

export function buildRecordProvenanceEnvelope(
  ref: RepairReferenceRecord,
  nowIso: string = new Date().toISOString()
): RecordProvenanceEnvelope {
  if (ref.provenance && ref.provenance.versionHistory?.length > 0) {
    return {
      ...ref.provenance,
      versionHistory: ref.provenance.versionHistory.map((h) => ({ ...h })),
    };
  }
  const lifecycleStatus = inferLifecycleStatus(ref);
  const evidenceType = inferEvidenceType(ref, lifecycleStatus);
  const captureDate = ref.source?.collectedAt || nowIso;
  const sourceDocument =
    ref.source?.sourceName?.trim() ||
    ref.source?.originalUrl?.trim() ||
    'UNSPECIFIED_REFERENCE_METADATA';

  return {
    sourceDocument,
    pageOrSection: ref.source?.pageCount
      ? `Indexed catalog metadata (${ref.source.pageCount} pages referenced)`
      : `Section: ${ref.systemCategoryId} / ${ref.referenceType}`,
    revision: ref.source?.sourceType || 'v1-catalog-index',
    captureDate,
    verificationStatus: lifecycleStatus,
    evidenceType,
    testConditions:
      ref.systemCategoryId === 'engine_management_ecu' || ref.systemCategoryId === 'electrical_charging'
        ? 'Verify exact VIN, ECU part number, and Key-OFF resistance / Key-ON DC voltage conditions per OEM manual.'
        : 'Confirm vehicle market trim, engine code, and model year before applying reference.',
    versionHistory: [
      {
        version: ref.recordVersion ?? 1,
        updatedAt: captureDate,
        actor: 'system:m1-migration',
        lifecycleStatus,
        changeSummary: 'Migrated from catalog schema v1.0 to v2.0 with structured provenance envelope.',
      },
    ],
    copyrightNotice:
      'Reference metadata & short technical extracts only; full copyrighted OEM manuals are not ingested.',
  };
}

/**
 * Enforces M1 provenance completeness on a RepairReferenceRecord.
 */
export function validateKnowledgeRecordProvenance(
  record: RepairReferenceRecord
): ProvenanceValidationResult {
  const missingFields: string[] = [];
  const warnings: string[] = [];

  if (!record.id || !record.id.trim()) missingFields.push('id');
  if (!record.summary || !record.summary.trim()) missingFields.push('summary');

  if (!record.ecuIdentity || !record.ecuIdentity.manufacturer?.trim()) {
    missingFields.push('ecuIdentity.manufacturer');
  } else if (!record.ecuIdentity.partNumber && !record.ecuIdentity.hardwareId) {
    warnings.push(
      'Incomplete ECU identification: partNumber and hardwareId are not specified; exact ECU verification required.'
    );
  }

  const prov = record.provenance;
  if (!prov) {
    missingFields.push('provenance');
  } else {
    if (!prov.sourceDocument?.trim()) missingFields.push('provenance.sourceDocument');
    if (!prov.pageOrSection?.trim()) missingFields.push('provenance.pageOrSection');
    if (!prov.revision?.trim()) missingFields.push('provenance.revision');
    if (!prov.captureDate?.trim()) missingFields.push('provenance.captureDate');
    if (!prov.verificationStatus) missingFields.push('provenance.verificationStatus');
    if (!prov.evidenceType) missingFields.push('provenance.evidenceType');
    if (!prov.testConditions?.trim()) missingFields.push('provenance.testConditions');
    if (!Array.isArray(prov.versionHistory) || prov.versionHistory.length === 0) {
      missingFields.push('provenance.versionHistory');
    }
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
    warnings,
  };
}

/**
 * Applies a non-destructive, reversible v1.0 -> v2.0 migration on a copy of the catalog.
 * Always creates a checksummed backup snapshot prior to transformation.
 */
export function migrateCatalogV1ToV2(
  catalog: AutomotiveKnowledgeCatalog,
  nowIso: string = new Date().toISOString()
): {
  migratedCatalog: AutomotiveKnowledgeCatalog;
  backupSnapshot: CatalogBackupSnapshot;
  migrationRecord: MigrationAuditRecord;
} {
  const backupSnapshot = createCatalogBackupSnapshot(catalog, nowIso);
  const vehicleById = new Map<string, VehicleModelRecord>(
    catalog.vehicles.map((v) => [v.id, v])
  );

  let recordsUpgraded = 0;
  const upgradedRefs: RepairReferenceRecord[] = catalog.repairReferences.map((ref) => {
    const alreadyV2 = Boolean(ref.provenance && ref.ecuIdentity && ref.recordVersion);
    if (!alreadyV2) {
      recordsUpgraded += 1;
    }
    const vehicle = vehicleById.get(ref.vehicleId);
    const ecuIdentity = buildEcuIdentityFromRecord(ref, vehicle);
    const provenance = buildRecordProvenanceEnvelope(ref, nowIso);
    return {
      ...ref,
      ecuIdentity,
      provenance,
      recordVersion: ref.recordVersion ?? 1,
      deletedAt: ref.deletedAt ?? null,
    };
  });

  const verifiedCount = upgradedRefs.filter(
    (r) =>
      r.verified &&
      (r.provenance?.verificationStatus === 'VERIFIED' ||
        r.provenance?.verificationStatus === 'TECHNICIAN_CONFIRMED')
  ).length;

  const migratedCatalog: AutomotiveKnowledgeCatalog = {
    ...catalog,
    schemaVersion: CATALOG_SCHEMA_V2,
    repairReferences: upgradedRefs,
    statistics: {
      manufacturerCount: catalog.manufacturers.length,
      vehicleCount: catalog.vehicles.length,
      referenceCount: upgradedRefs.length,
      verifiedCount,
      unverifiedCount: upgradedRefs.length - verifiedCount,
    },
  };

  const migrationRecord: MigrationAuditRecord = {
    migrationId: `mig-v1-to-v2-${nowIso.replace(/[^0-9]/g, '').slice(0, 14)}`,
    fromVersion: backupSnapshot.sourceSchemaVersion,
    toVersion: CATALOG_SCHEMA_V2,
    appliedAt: nowIso,
    recordsProcessed: upgradedRefs.length,
    recordsUpgraded,
    backupId: backupSnapshot.backupId,
    rollbackInstructions:
      'Call rollbackCatalogMigration(backupSnapshot) to restore the exact pre-migration catalog JSON and verify checksum integrity.',
  };

  return {
    migratedCatalog,
    backupSnapshot,
    migrationRecord,
  };
}

/**
 * Deterministically rolls back a catalog migration using the pre-migration backup snapshot.
 * Verifies backup checksum before returning the restored catalog.
 */
export function rollbackCatalogMigration(
  backupSnapshot: CatalogBackupSnapshot
): {
  restoredCatalog: AutomotiveKnowledgeCatalog;
  checksumVerified: boolean;
} {
  const actualChecksum = computeDeterministicChecksum(backupSnapshot.serializedCatalogJson);
  if (actualChecksum !== backupSnapshot.checksum) {
    throw new Error(
      `Backup snapshot checksum mismatch (expected ${backupSnapshot.checksum}, got ${actualChecksum}). Rollback aborted to protect data integrity.`
    );
  }
  const restoredCatalog = JSON.parse(
    backupSnapshot.serializedCatalogJson
  ) as AutomotiveKnowledgeCatalog;
  return {
    restoredCatalog,
    checksumVerified: true,
  };
}
