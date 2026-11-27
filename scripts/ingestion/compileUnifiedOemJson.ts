/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  crossVerifyWithStartMyCar,
  getAllFuseBoxInfoProfiles,
} from '../../src/services/fuseBoxInfoKnowledgeService';
import { getAllIngestedVehicleProfiles } from '../../src/services/startMyCarKnowledgeService';
import type {
  ManufacturerRecord,
  RepairReferenceRecord,
  VehicleModelRecord,
} from '../../src/types/automotiveKnowledge';

export interface CompiledCircuitEntry {
  source: 'FuseBoxInfo' | 'StartMyCar';
  box: string;
  cavityId: string;
  name: string;
  ampRating: string;
  description: string;
}

export interface CompiledOemVehicleRecord {
  id: string;
  brand: string;
  makeSlug: string;
  model: string;
  modelSlug: string;
  yearsString: string;
  yearStart: number;
  yearEnd: number;
  chassisCode: string | null;
  confidenceRating: 'DUAL_OEM_CONFIRMED' | 'SINGLE_SOURCE_VERIFIED' | 'COMMUNITY_UNVERIFIED';
  dualOemCorrelatedCircuitsCount: number;
  totalCavities: number;
  provenance: {
    fuseBoxInfo?: {
      wpPostId: number;
      sourceUrl: string;
      crawledAt: string;
      tier: string;
    };
    startMyCar?: {
      sourceUrl: string;
      crawledAt: string;
      tier: string;
    };
  };
  criticalDiagnosticCircuits: {
    ecuPowerFeeds: CompiledCircuitEntry[];
    obdDlcFeeds: CompiledCircuitEntry[];
    sensorVrefFeeds: CompiledCircuitEntry[];
    fuelPumpFeeds: CompiledCircuitEntry[];
    ignitionFeeds: CompiledCircuitEntry[];
  };
}

export interface UnifiedOemCompiledKnowledge {
  schemaVersion: '1.0.0';
  databaseName: string;
  generatedAt: string;
  zeroFabricationIntegrity: true;
  sources: string[];
  summary: {
    totalCompiledVehicles: number;
    fuseBoxInfoProfilesCount: number;
    startMyCarProfilesCount: number;
    totalCavitiesCompiled: number;
    dualOemConfirmedVehiclesCount: number;
  };
  manufacturers: ManufacturerRecord[];
  vehicleModelRecords: VehicleModelRecord[];
  knowledgeIndexEntries: RepairReferenceRecord[];
  compiledVehicles: CompiledOemVehicleRecord[];
}

export function compileUnifiedOemKnowledge(): UnifiedOemCompiledKnowledge {
  const fbiProfiles = getAllFuseBoxInfoProfiles();
  const smcProfiles = getAllIngestedVehicleProfiles();

  const compiledVehicles: CompiledOemVehicleRecord[] = [];
  const vehicleModelRecords: VehicleModelRecord[] = [];
  const knowledgeIndexEntries: RepairReferenceRecord[] = [];
  const matchedSmcKeys = new Set<string>();

  let fbiCavitiesTotal = 0;
  let smcCavitiesTotal = 0;
  for (const s of smcProfiles) {
    smcCavitiesTotal += s.powerDistribution.totalCavities;
  }

  for (const fbi of fbiProfiles) {
    fbiCavitiesTotal += fbi.powerDistribution.totalCavities;
    const midYear = Math.floor((fbi.identification.yearStart + fbi.identification.yearEnd) / 2);

    // Find all matching StartMyCar profiles within range for strict deduplication
    const matchingSmcList = smcProfiles.filter(
      (s) =>
        s.identification.makeSlug.toLowerCase() === fbi.identification.makeSlug.toLowerCase() &&
        s.identification.modelSlug.toLowerCase() === fbi.identification.modelSlug.toLowerCase() &&
        s.identification.year >= fbi.identification.yearStart - 1 &&
        s.identification.year <= fbi.identification.yearEnd + 1
    );
    const matchingSmc = matchingSmcList[0];

    for (const smcItem of matchingSmcList) {
      matchedSmcKeys.add(
        `${smcItem.identification.makeSlug}:${smcItem.identification.modelSlug}:${smcItem.identification.year}`
      );
    }

    const crossYear = matchingSmc ? matchingSmc.identification.year : midYear;
    const crossResult = crossVerifyWithStartMyCar(
      fbi.identification.makeSlug,
      fbi.identification.modelSlug,
      crossYear
    );

    const ecuPowerFeeds: CompiledCircuitEntry[] = [];
    const obdDlcFeeds: CompiledCircuitEntry[] = [];
    const sensorVrefFeeds: CompiledCircuitEntry[] = [];
    const fuelPumpFeeds: CompiledCircuitEntry[] = [];
    const ignitionFeeds: CompiledCircuitEntry[] = [];

    for (const box of fbi.powerDistribution.boxes) {
      for (const c of box.keyCircuits.ecuFeeds) {
        ecuPowerFeeds.push({
          source: 'FuseBoxInfo',
          box: box.boxTitle,
          cavityId: c.cavityId,
          name: c.circuitName || c.cavityId,
          ampRating: c.ampRatingString,
          description: c.description,
        });
      }
      for (const c of box.keyCircuits.obdFeeds) {
        obdDlcFeeds.push({
          source: 'FuseBoxInfo',
          box: box.boxTitle,
          cavityId: c.cavityId,
          name: c.circuitName || c.cavityId,
          ampRating: c.ampRatingString,
          description: c.description,
        });
      }
      for (const c of box.keyCircuits.sensorFeeds) {
        sensorVrefFeeds.push({
          source: 'FuseBoxInfo',
          box: box.boxTitle,
          cavityId: c.cavityId,
          name: c.circuitName || c.cavityId,
          ampRating: c.ampRatingString,
          description: c.description,
        });
      }
      for (const c of box.keyCircuits.fuelPumpFeeds) {
        fuelPumpFeeds.push({
          source: 'FuseBoxInfo',
          box: box.boxTitle,
          cavityId: c.cavityId,
          name: c.circuitName || c.cavityId,
          ampRating: c.ampRatingString,
          description: c.description,
        });
      }
      for (const c of box.keyCircuits.ignitionFeeds) {
        ignitionFeeds.push({
          source: 'FuseBoxInfo',
          box: box.boxTitle,
          cavityId: c.cavityId,
          name: c.circuitName || c.cavityId,
          ampRating: c.ampRatingString,
          description: c.description,
        });
      }
    }

    const slugTail = fbi.provenance.sourceUrl.split('/').pop() || fbi.identification.yearsString;
    const recordId = `oem-fbi-${slugTail}`;

    const compiledRecord: CompiledOemVehicleRecord = {
      id: recordId,
      brand: fbi.identification.make,
      makeSlug: fbi.identification.makeSlug,
      model: fbi.identification.model,
      modelSlug: fbi.identification.modelSlug,
      yearsString: fbi.identification.yearsString,
      yearStart: fbi.identification.yearStart,
      yearEnd: fbi.identification.yearEnd,
      chassisCode: fbi.identification.chassisCode || null,
      confidenceRating: crossResult.confidenceRating,
      dualOemCorrelatedCircuitsCount: crossResult.commonCircuits.length,
      totalCavities: fbi.powerDistribution.totalCavities,
      provenance: {
        fuseBoxInfo: {
          wpPostId: fbi.provenance.wpPostId,
          sourceUrl: fbi.provenance.sourceUrl,
          crawledAt: fbi.provenance.crawledAt,
          tier: fbi.provenance.tier,
        },
        ...(matchingSmc
          ? {
              startMyCar: {
                sourceUrl: matchingSmc.provenance.sourceUrl,
                crawledAt: matchingSmc.provenance.crawledAt,
                tier: matchingSmc.provenance.tier,
              },
            }
          : {}),
      },
      criticalDiagnosticCircuits: {
        ecuPowerFeeds: ecuPowerFeeds.slice(0, 12),
        obdDlcFeeds: obdDlcFeeds.slice(0, 6),
        sensorVrefFeeds: sensorVrefFeeds.slice(0, 12),
        fuelPumpFeeds: fuelPumpFeeds.slice(0, 6),
        ignitionFeeds: ignitionFeeds.slice(0, 10),
      },
    };

    compiledVehicles.push(compiledRecord);

    const vehicleId = `veh-${slugTail}`;
    vehicleModelRecords.push({
      id: vehicleId,
      makeSlug: fbi.identification.makeSlug,
      make: fbi.identification.make,
      model: fbi.identification.model,
      generation: fbi.identification.chassisCode || null,
      yearStart: fbi.identification.yearStart,
      yearEnd: fbi.identification.yearEnd,
      market: 'Global / OEM Factory Reference',
      engine: {
        engineCode: matchingSmc?.identification.enginesDetected[0] || null,
        displacement: null,
        fuelType: 'Unknown',
        configuration: null,
      },
      transmission: {
        type: 'Unknown',
        code: null,
      },
      systems: ['electrical_charging', 'engine_management_ecu', 'diagnostics_obd_dtc', 'fuel_system'],
      sourceUrls: [
        fbi.provenance.sourceUrl,
        ...(matchingSmc ? [matchingSmc.provenance.sourceUrl] : []),
      ],
    });

    const ecuFeedSummary = ecuPowerFeeds
      .slice(0, 5)
      .map((c) => `[#${c.cavityId} ${c.name} ${c.ampRating}: ${c.description}]`)
      .join('; ');
    const obdFeedSummary = obdDlcFeeds
      .slice(0, 3)
      .map((c) => `[#${c.cavityId} ${c.name} ${c.ampRating}: ${c.description}]`)
      .join('; ');
    const sensorSummary = sensorVrefFeeds
      .slice(0, 4)
      .map((c) => `[#${c.cavityId} ${c.name} ${c.ampRating}: ${c.description}]`)
      .join('; ');

    const isVerified = fbi.provenance.tier === 'VERIFIED';

    knowledgeIndexEntries.push({
      id: `ref-fbi-${slugTail}`,
      vehicleId,
      make: fbi.identification.make,
      model: fbi.identification.model,
      years: fbi.identification.yearsString,
      systemCategoryId: 'electrical_charging',
      title: `${fbi.identification.make} ${fbi.identification.model} (${fbi.identification.yearsString}${
        fbi.identification.chassisCode ? ` · ${fbi.identification.chassisCode}` : ''
      }) — OEM Fuse, Relay & ECU Power Distribution`,
      referenceType: 'electrical_system',
      summary: [
        `Verified OEM Power Distribution (${fbi.powerDistribution.totalCavities} cavities across ${fbi.powerDistribution.totalBoxes} compartments; WP Post #${fbi.provenance.wpPostId}; ${crossResult.confidenceRating}).`,
        ecuFeedSummary ? `ECU/ECM Feeds: ${ecuFeedSummary}.` : '',
        obdFeedSummary ? `OBD-II DLC Feeds: ${obdFeedSummary}.` : '',
        sensorSummary ? `Sensor/VVT Feeds: ${sensorSummary}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
      source: {
        sourceName:
          crossResult.confidenceRating === 'DUAL_OEM_CONFIRMED'
            ? 'Fuse-Box.info + StartMyCar Dual-OEM Verified Archive'
            : 'Fuse-Box.info OEM Technical Archive',
        originalUrl: fbi.provenance.sourceUrl,
        sourceType: 'OEM Fuse & Relay Technical Specification',
        collectedAt: fbi.provenance.crawledAt,
        language: 'en',
        verificationStatus: isVerified ? 'verified_source' : 'unverified',
        confidenceScore: crossResult.confidenceRating === 'DUAL_OEM_CONFIRMED' ? 0.98 : 0.92,
      },
      tags: [
        fbi.identification.makeSlug,
        fbi.identification.modelSlug,
        ...(fbi.identification.chassisCode ? [fbi.identification.chassisCode.toLowerCase()] : []),
        'fuse',
        'relay',
        'power distribution',
        'ecu feed',
        'obd2',
        crossResult.confidenceRating.toLowerCase(),
      ],
      verified: isVerified,
    });
  }

  // Include any standalone StartMyCar profiles not already paired with a Fuse-Box.info range
  for (const smc of smcProfiles) {
    const key = `${smc.identification.makeSlug}:${smc.identification.modelSlug}:${smc.identification.year}`;
    if (matchedSmcKeys.has(key)) continue;

    const recordId = `oem-smc-${smc.identification.makeSlug}-${smc.identification.modelSlug}-${smc.identification.year}`;
    const ecuPowerFeeds: CompiledCircuitEntry[] = [];
    const obdDlcFeeds: CompiledCircuitEntry[] = [];
    const sensorVrefFeeds: CompiledCircuitEntry[] = [];
    const fuelPumpFeeds: CompiledCircuitEntry[] = [];
    const ignitionFeeds: CompiledCircuitEntry[] = [];

    for (const box of smc.powerDistribution.boxes) {
      for (const f of box.activeEcuAndSensors.ecuFuses) {
        ecuPowerFeeds.push({
          source: 'StartMyCar',
          box: box.boxName,
          cavityId: f.id,
          name: f.id,
          ampRating: f.amp ? `${f.amp}A` : 'Relay',
          description: f.description,
        });
      }
      for (const f of box.activeEcuAndSensors.obdDlcFuses) {
        obdDlcFeeds.push({
          source: 'StartMyCar',
          box: box.boxName,
          cavityId: f.id,
          name: f.id,
          ampRating: f.amp ? `${f.amp}A` : 'Relay',
          description: f.description,
        });
      }
      for (const f of box.activeEcuAndSensors.sensorPowerFuses) {
        sensorVrefFeeds.push({
          source: 'StartMyCar',
          box: box.boxName,
          cavityId: f.id,
          name: f.id,
          ampRating: f.amp ? `${f.amp}A` : 'Relay',
          description: f.description,
        });
      }
      for (const f of box.fuses.filter((x) => x.circuitRole === 'FUEL_PUMP')) {
        fuelPumpFeeds.push({
          source: 'StartMyCar',
          box: box.boxName,
          cavityId: f.id,
          name: f.id,
          ampRating: f.amp ? `${f.amp}A` : 'Relay',
          description: f.description,
        });
      }
      for (const f of box.activeEcuAndSensors.ignitionFuses) {
        ignitionFeeds.push({
          source: 'StartMyCar',
          box: box.boxName,
          cavityId: f.id,
          name: f.id,
          ampRating: f.amp ? `${f.amp}A` : 'Relay',
          description: f.description,
        });
      }
    }

    compiledVehicles.push({
      id: recordId,
      brand: smc.identification.make,
      makeSlug: smc.identification.makeSlug,
      model: smc.identification.model,
      modelSlug: smc.identification.modelSlug,
      yearsString: String(smc.identification.year),
      yearStart: smc.identification.year,
      yearEnd: smc.identification.year,
      chassisCode: smc.identification.generation ?? null,
      confidenceRating:
        smc.provenance.tier === 'VERIFIED' ? 'SINGLE_SOURCE_VERIFIED' : 'COMMUNITY_UNVERIFIED',
      dualOemCorrelatedCircuitsCount: 0,
      totalCavities: smc.powerDistribution.totalCavities,
      provenance: {
        startMyCar: {
          sourceUrl: smc.provenance.sourceUrl,
          crawledAt: smc.provenance.crawledAt,
          tier: smc.provenance.tier,
        },
      },
      criticalDiagnosticCircuits: {
        ecuPowerFeeds: ecuPowerFeeds.slice(0, 12),
        obdDlcFeeds: obdDlcFeeds.slice(0, 6),
        sensorVrefFeeds: sensorVrefFeeds.slice(0, 12),
        fuelPumpFeeds: fuelPumpFeeds.slice(0, 6),
        ignitionFeeds: ignitionFeeds.slice(0, 10),
      },
    });
  }

  compiledVehicles.sort(
    (a, b) =>
      a.brand.localeCompare(b.brand) ||
      a.model.localeCompare(b.model) ||
      a.yearStart - b.yearStart
  );

  const manufacturers: ManufacturerRecord[] = [
    { id: 'm-toyota', make: 'Toyota', slug: 'toyota', catalogUrl: 'https://fuse-box.info/toyota', verified: true },
    { id: 'm-ford', make: 'Ford', slug: 'ford', catalogUrl: 'https://fuse-box.info/ford', verified: true },
    { id: 'm-nissan', make: 'Nissan', slug: 'nissan', catalogUrl: 'https://fuse-box.info/nissan', verified: true },
    { id: 'm-honda', make: 'Honda', slug: 'honda', catalogUrl: 'https://fuse-box.info/honda', verified: true },
    { id: 'm-isuzu', make: 'Isuzu', slug: 'isuzu', catalogUrl: 'https://fuse-box.info/isuzu', verified: true },
    { id: 'm-suzuki', make: 'Suzuki', slug: 'suzuki', catalogUrl: 'https://fuse-box.info/suzuki', verified: true },
  ];

  const dualConfirmedCount = compiledVehicles.filter(
    (v) => v.confidenceRating === 'DUAL_OEM_CONFIRMED'
  ).length;

  return {
    schemaVersion: '1.0.0',
    databaseName: 'AutoElectric Lab Pro — Unified Dual-OEM Compiled Knowledge Base',
    generatedAt: new Date().toISOString(),
    zeroFabricationIntegrity: true,
    sources: ['fuse-box.info', 'startmycar.com'],
    summary: {
      totalCompiledVehicles: compiledVehicles.length,
      fuseBoxInfoProfilesCount: fbiProfiles.length,
      startMyCarProfilesCount: smcProfiles.length,
      totalCavitiesCompiled: fbiCavitiesTotal + smcCavitiesTotal,
      dualOemConfirmedVehiclesCount: dualConfirmedCount,
    },
    manufacturers,
    vehicleModelRecords,
    knowledgeIndexEntries,
    compiledVehicles,
  };
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('compileUnifiedOemJson.ts')
) {
  const compiled = compileUnifiedOemKnowledge();
  const outputPath = path.resolve(process.cwd(), 'src/data/unifiedOemCompiledKnowledge.json');
  fs.writeFileSync(outputPath, JSON.stringify(compiled, null, 2), 'utf-8');
  console.log(
    `✓ Compiled Unified OEM Knowledge JSON -> ${outputPath} (${compiled.summary.totalCompiledVehicles} vehicles, ${compiled.summary.totalCavitiesCompiled} cavities, ${compiled.summary.dualOemConfirmedVehiclesCount} Dual-OEM confirmed)`
  );
}
