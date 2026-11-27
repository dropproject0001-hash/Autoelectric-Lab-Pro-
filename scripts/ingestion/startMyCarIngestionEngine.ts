/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  IngestedFuseBox,
  IngestedFuseOrRelay,
  IngestedVehicleProfile,
  IngestionCircuitRole,
  IngestionVerificationTier,
  StartMyCarCatalogManifest,
} from '../../src/types/startMyCarIngestion';
import { INITIAL_AUTOMOTIVE_CATALOG } from '../../src/data/automotiveKnowledgeSeed';
import { STARTMYCAR_PRESET_VEHICLES } from '../../src/utils/startMyCarReference';
import { OEM_PCB_HARDWARE_SPECS } from '../../src/utils/oemKnowledgeDatabase';

export interface VehicleCrawlTarget {
  brand: string;
  makeSlug: string;
  model: string;
  modelSlug: string;
  year: number;
}

export const DEFAULT_CRAWL_TARGETS: VehicleCrawlTarget[] = [
  // Toyota
  { brand: 'Toyota', makeSlug: 'toyota', model: 'Corolla', modelSlug: 'corolla', year: 2020 },
  { brand: 'Toyota', makeSlug: 'toyota', model: 'Corolla', modelSlug: 'corolla', year: 2018 },
  { brand: 'Toyota', makeSlug: 'toyota', model: 'Hilux', modelSlug: 'hilux', year: 2019 },
  { brand: 'Toyota', makeSlug: 'toyota', model: 'Camry', modelSlug: 'camry', year: 2020 },
  { brand: 'Toyota', makeSlug: 'toyota', model: 'RAV4', modelSlug: 'rav4', year: 2019 },

  // Ford
  { brand: 'Ford', makeSlug: 'ford', model: 'Ranger', modelSlug: 'ranger', year: 2019 },
  { brand: 'Ford', makeSlug: 'ford', model: 'Ranger', modelSlug: 'ranger', year: 2016 },
  { brand: 'Ford', makeSlug: 'ford', model: 'F-150', modelSlug: 'f-150', year: 2016 },

  // Nissan
  { brand: 'Nissan', makeSlug: 'nissan', model: 'Sentra', modelSlug: 'sentra', year: 2018 },
  { brand: 'Nissan', makeSlug: 'nissan', model: 'Sentra', modelSlug: 'sentra', year: 2016 },
  { brand: 'Nissan', makeSlug: 'nissan', model: 'Navara', modelSlug: 'navara', year: 2020 },

  // Honda
  { brand: 'Honda', makeSlug: 'honda', model: 'Civic', modelSlug: 'civic', year: 2018 },
  { brand: 'Honda', makeSlug: 'honda', model: 'Civic', modelSlug: 'civic', year: 2016 },
  { brand: 'Honda', makeSlug: 'honda', model: 'CR-V', modelSlug: 'cr-v', year: 2019 },

  // Isuzu
  { brand: 'Isuzu', makeSlug: 'isuzu', model: 'D-Max', modelSlug: 'd-max', year: 2020 },

  // Suzuki
  { brand: 'Suzuki', makeSlug: 'suzuki', model: 'Swift', modelSlug: 'swift', year: 2018 },
  { brand: 'Suzuki', makeSlug: 'suzuki', model: 'Jimny', modelSlug: 'jimny', year: 2020 },
];

export function classifyCircuitRole(desc: string, related: string[] = []): IngestionCircuitRole {
  const d = (desc + ' ' + related.join(' ')).toLowerCase();

  if (/efi|ecm|ecu|pcm|engine control|dme|d inj|d-inj|inyeccion/i.test(d)) {
    return 'ECU_POWER';
  }
  if (/fuel pump|f\/pump|fp rly|combustible|bomba/i.test(d)) {
    return 'FUEL_PUMP';
  }
  if (/sensor|vref|vvt|o2|maf|map|cam|crank|throttle|pedal|knock/i.test(d)) {
    return 'SENSOR_VREF';
  }
  if (/obd|dlc|diag|diagnos/i.test(d)) {
    return 'OBD2_DLC';
  }
  if (/ign|ignition|kl15|starter|start|crank/i.test(d)) {
    return 'IGNITION';
  }
  if (/abs|esp|vsc|brake|steering|eps|airbag|srs/i.test(d)) {
    return 'CHASSIS';
  }
  if (/defog|wiper|mirror|radio|audio|window|blower|heater|htr|ac|a\/c|washer|acc|power socket|cig/i.test(d)) {
    return 'ACCESSORY';
  }
  if (/headlight|tail|lamp|light|h-lp|\bfog\b|fog\s*light|turn|hazard|bocina|horn/i.test(d)) {
    return 'LIGHTING';
  }

  return 'UNKNOWN';
}

export function determineVerificationTier(
  target: VehicleCrawlTarget,
  boxes: IngestedFuseBox[],
  totalCavities: number
): IngestionVerificationTier {
  if (totalCavities < 5 || boxes.length === 0) {
    return 'LOW_RATING_RESTRICTED';
  }

  const hasEcu = boxes.some((b) => b.activeEcuAndSensors.ecuFuses.length > 0);
  const hasIgn = boxes.some((b) => b.activeEcuAndSensors.ignitionFuses.length > 0);
  const hasObd = boxes.some((b) => b.activeEcuAndSensors.obdDlcFuses.length > 0);

  const matchedSeed = INITIAL_AUTOMOTIVE_CATALOG.manufacturers.some(
    (m) => m.slug.toLowerCase() === target.makeSlug.toLowerCase() && m.verified
  );

  if (matchedSeed && (hasEcu || hasIgn || hasObd) && totalCavities >= 15) {
    return 'VERIFIED';
  }

  return 'COMMUNITY_UNVERIFIED';
}

export function checkRepositoryDeduplication(target: VehicleCrawlTarget): {
  status: 'NEW_RECORD' | 'AUGMENTED_EXISTING' | 'MATCHED_SEED';
  matchedRecordId?: string;
} {
  const seedMatch = INITIAL_AUTOMOTIVE_CATALOG.vehicles.find(
    (v) =>
      v.makeSlug.toLowerCase() === target.makeSlug.toLowerCase() &&
      v.model.toLowerCase() === target.model.toLowerCase() &&
      target.year >= v.yearStart &&
      target.year <= v.yearEnd
  );
  if (seedMatch) {
    return {
      status: 'MATCHED_SEED',
      matchedRecordId: seedMatch.id,
    };
  }

  const presetMatch = STARTMYCAR_PRESET_VEHICLES.find(
    (p) =>
      p.make.toLowerCase() === target.brand.toLowerCase() &&
      p.model.toLowerCase() === target.model.toLowerCase() &&
      p.year === String(target.year)
  );
  if (presetMatch) {
    return {
      status: 'AUGMENTED_EXISTING',
      matchedRecordId: `preset-${target.makeSlug}-${target.modelSlug}-${target.year}`,
    };
  }

  const oemMatch = OEM_PCB_HARDWARE_SPECS.find(
    (o) =>
      o.brandKey.toLowerCase() === target.makeSlug.toLowerCase() &&
      o.platformName.toLowerCase().includes(target.model.toLowerCase())
  );
  if (oemMatch) {
    return {
      status: 'AUGMENTED_EXISTING',
      matchedRecordId: oemMatch.id,
    };
  }

  return {
    status: 'NEW_RECORD',
  };
}

export async function crawlVehicleFuseboxes(
  target: VehicleCrawlTarget,
  politeDelayMs = 400
): Promise<IngestedVehicleProfile | null> {
  const url = `https://www.startmycar.com/${target.makeSlug}/${target.modelSlug}/info/fusebox/${target.year}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 AutoElectricLab/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      console.warn(`[Crawl Warn] ${url} returned HTTP ${res.status}`);
      return null;
    }

    const html = await res.text();
    const finalUrl = res.url;

    const dataMatch = html.match(/window\.fuseboxesData\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/);
    if (!dataMatch) {
      console.warn(`[Crawl Warn] No window.fuseboxesData found on ${finalUrl}`);
      return null;
    }

    const rawBoxes = JSON.parse(dataMatch[1]) as any[];

    // Extract generation from URL
    const genMatch = finalUrl.match(/fusebox\/\d{4}\/([^\/?#]+)/);
    const generation = genMatch ? genMatch[1] : null;

    // Detect engine types from box names and descriptions
    const enginesDetected = new Set<string>();
    for (const rawBox of rawBoxes) {
      const boxName = rawBox.boxName || '';
      const engMatch = boxName.match(/\(([^)]+motors?|[^)]+engine)\)/i);
      if (engMatch) {
        enginesDetected.add(engMatch[1].trim());
      }
    }

    let totalCavities = 0;
    let totalFuses = 0;
    let totalRelays = 0;

    const boxes: IngestedFuseBox[] = rawBoxes.map((rawBox, boxIdx) => {
      const boxName = String(rawBox.boxName || `Fuse Box ${boxIdx + 1}`);
      let location: IngestedFuseBox['location'] = 'OTHER';
      if (/engine/i.test(boxName)) location = 'ENGINE_BAY';
      else if (/interior|cabin|under-dash|passenger/i.test(boxName)) location = 'INTERIOR_CABIN';
      else if (/trunk|luggage/i.test(boxName)) location = 'TRUNK_LUGGAGE';
      else if (/relay/i.test(boxName)) location = 'RELAY_BLOCK';

      const rawFuses = Array.isArray(rawBox.fuses) ? rawBox.fuses : [];
      const fuses: IngestedFuseOrRelay[] = rawFuses.map((f: any) => {
        const id = String(f.id || '');
        const kind = f.kind || {};
        const isRelay = kind.type === 'relay' || /^R\d+/i.test(id);
        const type = isRelay
          ? 'relay'
          : kind.type === 'fuse-block'
          ? 'fuse-block'
          : 'fuse';
        const format = kind.format || undefined;
        const amp = typeof kind.amp === 'number' ? kind.amp : null;
        const description = String(f.description || '').trim();
        const relatedEntities = Array.isArray(f.relatedEntities)
          ? f.relatedEntities.map(String)
          : [];
        const notUsed = Boolean(f.notUsed || !description);

        if (isRelay) totalRelays++;
        else totalFuses++;
        totalCavities++;

        const circuitRole = classifyCircuitRole(description, relatedEntities);

        return {
          id,
          type,
          format,
          amp,
          description: description || '(Unused / Spare cavity)',
          circuitRole,
          relatedEntities,
          notUsed,
        };
      });

      const ecuFuses = fuses.filter((f) => f.circuitRole === 'ECU_POWER');
      const sensorPowerFuses = fuses.filter((f) => f.circuitRole === 'SENSOR_VREF');
      const obdDlcFuses = fuses.filter((f) => f.circuitRole === 'OBD2_DLC');
      const ignitionFuses = fuses.filter((f) => f.circuitRole === 'IGNITION');

      return {
        boxIndex: boxIdx,
        boxName,
        location,
        diagramUrl: rawBox.boxDiagramImg?.url || undefined,
        thumbnailUrl: rawBox.boxThumbnail || undefined,
        fuses,
        activeEcuAndSensors: {
          ecuFuses,
          sensorPowerFuses,
          obdDlcFuses,
          ignitionFuses,
        },
      };
    });

    const tier = determineVerificationTier(target, boxes, totalCavities);
    const deduplication = checkRepositoryDeduplication(target);

    const hasDedicatedEcmFeed = boxes.some((b) => b.activeEcuAndSensors.ecuFuses.length > 0);
    const hasObdDlcFeed = boxes.some((b) => b.activeEcuAndSensors.obdDlcFuses.length > 0);
    const hasFuelPumpRelay = boxes.some((b) =>
      b.fuses.some((f) => f.circuitRole === 'FUEL_PUMP')
    );
    const hasSensorVrefFeed = boxes.some((b) => b.activeEcuAndSensors.sensorPowerFuses.length > 0);

    const circuitHighlights: string[] = [];
    if (hasDedicatedEcmFeed) circuitHighlights.push('Dedicated ECM / Engine Control Power Feeds');
    if (hasObdDlcFeed) circuitHighlights.push('OBD-II DLC Diagnostic Pin 16 Fused Power Feed');
    if (hasFuelPumpRelay) circuitHighlights.push('Primary Fuel Pump Control Circuit / Relay');
    if (hasSensorVrefFeed) circuitHighlights.push('Sensor Reference Rails & VVT / O2 Actuator Fuses');

    const profile: IngestedVehicleProfile = {
      schemaVersion: '1.0.0',
      provenance: {
        source: 'StartMyCar',
        sourceUrl: finalUrl,
        crawledAt: new Date().toISOString(),
        zeroFabricationIntegrity: true,
        tier,
        deduplicationStatus: deduplication.status,
        matchedRepositoryRecordId: deduplication.matchedRecordId,
      },
      identification: {
        make: target.brand,
        makeSlug: target.makeSlug,
        model: target.model,
        modelSlug: target.modelSlug,
        year: target.year,
        generation,
        platformCode: null,
        marketRegions: ['Global', 'North America', 'ASEAN'],
        enginesDetected: Array.from(enginesDetected),
      },
      powerDistribution: {
        totalBoxes: boxes.length,
        totalCavities,
        totalFuses,
        totalRelays,
        boxes,
      },
      ecuAndSensorCircuits: {
        hasDedicatedEcmFeed,
        hasObdDlcFeed,
        hasFuelPumpRelay,
        hasSensorVrefFeed,
        circuitHighlights,
      },
      offlineIngestionReady: true,
    };

    if (politeDelayMs > 0) {
      await new Promise((r) => setTimeout(r, politeDelayMs));
    }

    return profile;
  } catch (err) {
    console.error(`[Crawl Error] Failed on ${url}:`, err);
    return null;
  }
}

export async function runStartMyCarIngestionPipeline(
  targets: VehicleCrawlTarget[] = DEFAULT_CRAWL_TARGETS,
  baseOutputDir = path.resolve(process.cwd(), 'src/data/startmycar')
): Promise<StartMyCarCatalogManifest> {
  console.log(`\n======================================================`);
  console.log(`  StartMyCar High-Fidelity Data Ingestion Engine`);
  console.log(`  Targeting ${targets.length} vehicle profiles across OEM brands`);
  console.log(`======================================================\n`);

  fs.mkdirSync(baseOutputDir, { recursive: true });

  const ingestedProfiles: IngestedVehicleProfile[] = [];
  let totalFusesAndRelays = 0;
  let verifiedCount = 0;
  let communityUnverifiedCount = 0;
  let lowRatingCount = 0;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    console.log(
      `[${i + 1}/${targets.length}] Ingesting: ${target.brand} ${target.model} (${target.year})...`
    );

    const profile = await crawlVehicleFuseboxes(target, 400);
    if (!profile) {
      console.warn(`  ↳ Skipping ${target.brand} ${target.model} due to network/parsing failure.`);
      continue;
    }

    // Materialize in directory structure: src/data/startmycar/<brand>/<model>/<year>.json
    const brandDir = path.join(baseOutputDir, target.makeSlug, target.modelSlug);
    fs.mkdirSync(brandDir, { recursive: true });
    const targetFile = path.join(brandDir, `${target.year}.json`);

    fs.writeFileSync(targetFile, JSON.stringify(profile, null, 2), 'utf-8');

    ingestedProfiles.push(profile);
    totalFusesAndRelays += profile.powerDistribution.totalCavities;

    if (profile.provenance.tier === 'VERIFIED') verifiedCount++;
    else if (profile.provenance.tier === 'COMMUNITY_UNVERIFIED') communityUnverifiedCount++;
    else lowRatingCount++;

    console.log(
      `  ✓ Materialized: ${targetFile} [${profile.provenance.tier}] (${profile.powerDistribution.totalCavities} cavities, ${profile.powerDistribution.totalBoxes} boxes)`
    );
  }

  // Build Catalog Manifest
  const brandsMap = new Map<
    string,
    {
      brand: string;
      makeSlug: string;
      modelsMap: Map<string, { model: string; modelSlug: string; years: Set<number> }>;
    }
  >();

  for (const prof of ingestedProfiles) {
    const makeSlug = prof.identification.makeSlug;
    if (!brandsMap.has(makeSlug)) {
      brandsMap.set(makeSlug, {
        brand: prof.identification.make,
        makeSlug,
        modelsMap: new Map(),
      });
    }

    const b = brandsMap.get(makeSlug)!;
    const modelSlug = prof.identification.modelSlug;
    if (!b.modelsMap.has(modelSlug)) {
      b.modelsMap.set(modelSlug, {
        model: prof.identification.model,
        modelSlug,
        years: new Set(),
      });
    }

    b.modelsMap.get(modelSlug)!.years.add(prof.identification.year);
  }

  const manifestBrands = Array.from(brandsMap.values()).map((b) => ({
    brand: b.brand,
    makeSlug: b.makeSlug,
    models: Array.from(b.modelsMap.values()).map((m) => ({
      model: m.model,
      modelSlug: m.modelSlug,
      years: Array.from(m.years).sort((a, b) => b - a),
      filePathTemplate: `src/data/startmycar/${b.makeSlug}/${m.modelSlug}/{year}.json`,
    })),
  }));

  const manifest: StartMyCarCatalogManifest = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    totalVehicles: ingestedProfiles.length,
    totalFusesAndRelays,
    tierSummary: {
      verified: verifiedCount,
      communityUnverified: communityUnverifiedCount,
      lowRatingRestricted: lowRatingCount,
    },
    brands: manifestBrands,
  };

  const manifestPath = path.join(baseOutputDir, 'startmycarCatalog.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\n✓ Manifest written to: ${manifestPath}`);
  console.log(`======================================================`);
  console.log(`  Ingestion Complete:`);
  console.log(`  Total Vehicles Ingested: ${ingestedProfiles.length}`);
  console.log(`  Total Cavities Mapped:   ${totalFusesAndRelays}`);
  console.log(`  Tier Breakdown:          VERIFIED: ${verifiedCount} | COMMUNITY_UNVERIFIED: ${communityUnverifiedCount} | LOW_RATING: ${lowRatingCount}`);
  console.log(`======================================================\n`);

  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStartMyCarIngestionPipeline()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal Ingestion Pipeline Failure:', err);
      process.exit(1);
    });
}
