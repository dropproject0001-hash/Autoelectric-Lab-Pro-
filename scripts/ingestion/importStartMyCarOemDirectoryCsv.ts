/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ManufacturerRecord } from '../../src/types/automotiveKnowledge';
import {
  mergeOemManufacturersDeduplicated,
  parseStartMyCarOemCsv,
} from '../../src/utils/oemManufacturerCsvImporter';

interface UnifiedOemCompiledJson {
  schemaVersion: string;
  databaseName: string;
  generatedAt: string;
  zeroFabricationIntegrity: boolean;
  sources: string[];
  summary: {
    totalCompiledVehicles: number;
    fuseBoxInfoProfilesCount: number;
    startMyCarProfilesCount: number;
    totalCavitiesCompiled: number;
    dualOemConfirmedVehiclesCount: number;
    indexedManufacturersCount?: number;
    csvImportedManufacturersCount?: number;
    deduplicatedCsvDuplicatesSkipped?: number;
  };
  oemDirectoryImport?: {
    importedAt: string;
    sourceFiles: string[];
    totalRowsScanned: number;
    validOemLinksFound: number;
    ignoredNonOemRows: number;
    addedManufacturersCount: number;
    duplicatesSkippedCount: number;
    totalUniqueManufacturers: number;
  };
  manufacturers: ManufacturerRecord[];
  [key: string]: unknown;
}

const DEFAULT_CSV_FILES = [
  'public/assets/aistudio/links-startmycar.com__1__952f30fe.csv',
  'public/assets/aistudio/links-startmycar.com_7256e111.csv',
];

function main(): void {
  const cwd = process.cwd();
  const csvArgs = process.argv.slice(2);
  const targetCsvFiles = csvArgs.length > 0 ? csvArgs : DEFAULT_CSV_FILES;
  const dbPath = path.resolve(cwd, 'src/data/unifiedOemCompiledKnowledge.json');

  const rawDb = fs.readFileSync(dbPath, 'utf8');
  const db = JSON.parse(rawDb) as UnifiedOemCompiledJson;

  let totalRowsScanned = 0;
  let validOemLinksFound = 0;
  let ignoredNonOemRows = 0;
  let inFileDuplicatesSkipped = 0;
  const parsedIncoming: ManufacturerRecord[] = [];
  const processedSourceFiles: string[] = [];

  for (const relPath of targetCsvFiles) {
    const absPath = path.resolve(cwd, relPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`CSV file not found: ${absPath}`);
    }
    const csvText = fs.readFileSync(absPath, 'utf8');
    const parsed = parseStartMyCarOemCsv(csvText);

    totalRowsScanned += parsed.totalDataRows;
    validOemLinksFound += parsed.validOemLinksFound;
    ignoredNonOemRows += parsed.ignoredNonOemRows;
    inFileDuplicatesSkipped += parsed.inFileDuplicatesSkipped;
    parsedIncoming.push(...parsed.manufacturers);
    processedSourceFiles.push(path.basename(relPath));
  }

  // Sort net-new CSV entries alphabetically by display name before merging
  const existingVerifiedCount = db.manufacturers.length;
  const existingSlugSet = new Set(db.manufacturers.map((m) => m.slug.toLowerCase()));

  const mergeResult = mergeOemManufacturersDeduplicated(db.manufacturers, parsedIncoming);

  // Preserve original verified records first, then sort newly imported directory entries alphabetically
  const preservedExisting = mergeResult.manufacturers.filter((m) =>
    existingSlugSet.has(m.slug.toLowerCase())
  );
  const newlyImportedSorted = mergeResult.manufacturers
    .filter((m) => !existingSlugSet.has(m.slug.toLowerCase()))
    .sort((a, b) => a.make.localeCompare(b.make));

  const finalManufacturers = [...preservedExisting, ...newlyImportedSorted];

  // Final strict uniqueness assertion before writing
  const uniqueSlugs = new Set(finalManufacturers.map((m) => m.slug.toLowerCase()));
  if (uniqueSlugs.size !== finalManufacturers.length) {
    throw new Error('Deduplication assertion failed: duplicate manufacturer slugs detected.');
  }

  const importedAt = new Date().toISOString();
  const totalDuplicatesSkipped = inFileDuplicatesSkipped + mergeResult.duplicateCount;

  db.generatedAt = importedAt;
  db.manufacturers = finalManufacturers;
  db.summary = {
    ...db.summary,
    indexedManufacturersCount: finalManufacturers.length,
    csvImportedManufacturersCount: newlyImportedSorted.length,
    deduplicatedCsvDuplicatesSkipped: totalDuplicatesSkipped,
  };
  db.oemDirectoryImport = {
    importedAt,
    sourceFiles: processedSourceFiles,
    totalRowsScanned,
    validOemLinksFound,
    ignoredNonOemRows,
    addedManufacturersCount: mergeResult.addedCount,
    duplicatesSkippedCount: totalDuplicatesSkipped,
    totalUniqueManufacturers: finalManufacturers.length,
  };

  fs.writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        status: 'IMPORT_COMPLETE_ZERO_DUPLICATES',
        existingManufacturersBefore: existingVerifiedCount,
        totalRowsScanned,
        validOemLinksFound,
        ignoredNonOemRows,
        addedManufacturersCount: mergeResult.addedCount,
        duplicatesSkippedCount: totalDuplicatesSkipped,
        totalUniqueManufacturers: finalManufacturers.length,
        importedAt,
      },
      null,
      2
    )
  );
}

main();
