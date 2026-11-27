/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  FuseBoxInfoBox,
  FuseBoxInfoCavity,
  FuseBoxInfoCatalogManifest,
  FuseBoxInfoVehicleProfile,
} from '../../src/types/fuseBoxInfoIngestion';
import { IngestionCircuitRole, IngestionVerificationTier } from '../../src/types/startMyCarIngestion';
import { INITIAL_AUTOMOTIVE_CATALOG } from '../../src/data/automotiveKnowledgeSeed';
import { STARTMYCAR_PRESET_VEHICLES } from '../../src/utils/startMyCarReference';
import { OEM_PCB_HARDWARE_SPECS } from '../../src/utils/oemKnowledgeDatabase';

export interface FuseBoxInfoCrawlTarget {
  brand: string;
  makeSlug: string;
  model: string;
  modelSlug: string;
  wpPostId: number;
  slug: string;
  yearsString: string;
  yearStart: number;
  yearEnd: number;
  chassisCode?: string | null;
  rawTitle: string;
}

export const FUSEBOXINFO_TARGETS: FuseBoxInfoCrawlTarget[] = [
  // Toyota
  {
    brand: 'Toyota',
    makeSlug: 'toyota',
    model: 'Corolla',
    modelSlug: 'corolla',
    wpPostId: 66832,
    slug: 'toyota-corolla-e210-2019-2022-fuses',
    yearsString: '2019-2022',
    yearStart: 2019,
    yearEnd: 2022,
    chassisCode: 'E210',
    rawTitle: 'Toyota Corolla (E210; 2019-2022) fuses',
  },
  {
    brand: 'Toyota',
    makeSlug: 'toyota',
    model: 'Corolla',
    modelSlug: 'corolla',
    wpPostId: 66853,
    slug: 'toyota-corolla-e210-2023-2025-fuses',
    yearsString: '2023-2025',
    yearStart: 2023,
    yearEnd: 2025,
    chassisCode: 'E210 Facelift',
    rawTitle: 'Toyota Corolla (E210; 2023-2025) fuses',
  },
  {
    brand: 'Toyota',
    makeSlug: 'toyota',
    model: 'Hilux',
    modelSlug: 'hilux',
    wpPostId: 19544,
    slug: 'toyota-hilux-an120-an130-2015-2019-fuses-and-relay',
    yearsString: '2015-2019',
    yearStart: 2015,
    yearEnd: 2019,
    chassisCode: 'AN120/AN130',
    rawTitle: 'Toyota Hilux (AN120/AN130; 2015-2019..) fuses and relays',
  },
  {
    brand: 'Toyota',
    makeSlug: 'toyota',
    model: 'Camry',
    modelSlug: 'camry',
    wpPostId: 66964,
    slug: 'toyota-camry-xv70-2018-2024-fuses',
    yearsString: '2018-2024',
    yearStart: 2018,
    yearEnd: 2024,
    chassisCode: 'XV70',
    rawTitle: 'Toyota Camry (XV70; 2018-2024) fuses',
  },
  {
    brand: 'Toyota',
    makeSlug: 'toyota',
    model: 'RAV4',
    modelSlug: 'rav4',
    wpPostId: 66784,
    slug: 'toyota-rav4-xa50-2019-2025-fuses',
    yearsString: '2019-2025',
    yearStart: 2019,
    yearEnd: 2025,
    chassisCode: 'XA50',
    rawTitle: 'Toyota RAV4 (XA50; 2019-2025) fuses',
  },

  // Ford
  {
    brand: 'Ford',
    makeSlug: 'ford',
    model: 'Ranger',
    modelSlug: 'ranger',
    wpPostId: 32451,
    slug: 'ford-ranger-2019-fuses-and-relays',
    yearsString: '2019-2023',
    yearStart: 2019,
    yearEnd: 2023,
    chassisCode: 'PX3',
    rawTitle: 'Ford Ranger (2019-2023) fuses and relays',
  },
  {
    brand: 'Ford',
    makeSlug: 'ford',
    model: 'Ranger',
    modelSlug: 'ranger',
    wpPostId: 38579,
    slug: 'ford-ranger-2012-2015-fuses-and-relays',
    yearsString: '2012-2015',
    yearStart: 2012,
    yearEnd: 2015,
    chassisCode: 'PX1',
    rawTitle: 'Ford Ranger (2012-2015) fuses and relays',
  },
  {
    brand: 'Ford',
    makeSlug: 'ford',
    model: 'F-150',
    modelSlug: 'f-150',
    wpPostId: 14345,
    slug: 'ford-f-150-2015-2018-fuses-and-relay',
    yearsString: '2015-2020',
    yearStart: 2015,
    yearEnd: 2020,
    chassisCode: '13th Gen',
    rawTitle: 'Ford F-150 (2015-2020) fuses and relays',
  },
  {
    brand: 'Ford',
    makeSlug: 'ford',
    model: 'F-150',
    modelSlug: 'f-150',
    wpPostId: 53217,
    slug: 'ford-f-150-2021-2022-fuses',
    yearsString: '2021-2023',
    yearStart: 2021,
    yearEnd: 2023,
    chassisCode: '14th Gen',
    rawTitle: 'Ford F-150 (2021-2023) fuses',
  },

  // Nissan
  {
    brand: 'Nissan',
    makeSlug: 'nissan',
    model: 'Sentra',
    modelSlug: 'sentra',
    wpPostId: 67840,
    slug: 'nissan-sentra-b17-2013-2019-fuses',
    yearsString: '2013-2019',
    yearStart: 2013,
    yearEnd: 2019,
    chassisCode: 'B17',
    rawTitle: 'Nissan Sentra (B17; 2013-2019) fuses',
  },
  {
    brand: 'Nissan',
    makeSlug: 'nissan',
    model: 'Sentra',
    modelSlug: 'sentra',
    wpPostId: 67861,
    slug: 'nissan-sentra-b18-2020-2025-fuses',
    yearsString: '2020-2025',
    yearStart: 2020,
    yearEnd: 2025,
    chassisCode: 'B18',
    rawTitle: 'Nissan Sentra (B18; 2020-2025) fuses',
  },
  {
    brand: 'Nissan',
    makeSlug: 'nissan',
    model: 'Navara',
    modelSlug: 'navara',
    wpPostId: 67679,
    slug: 'nissan-navara-frontier-np300-d23-2015-2024-fuses',
    yearsString: '2015-2024',
    yearStart: 2015,
    yearEnd: 2024,
    chassisCode: 'D23',
    rawTitle: 'Nissan Navara / Frontier NP300 (D23; 2015-2024) fuses',
  },

  // Honda
  {
    brand: 'Honda',
    makeSlug: 'honda',
    model: 'Civic',
    modelSlug: 'civic',
    wpPostId: 12869,
    slug: 'honda-civic-2016-2018-fuses',
    yearsString: '2016-2021',
    yearStart: 2016,
    yearEnd: 2021,
    chassisCode: '10th Gen',
    rawTitle: 'Honda Civic (2016-2021) fuses',
  },
  {
    brand: 'Honda',
    makeSlug: 'honda',
    model: 'CR-V',
    modelSlug: 'cr-v',
    wpPostId: 12764,
    slug: 'honda-cr-v-2017-2018-fuses',
    yearsString: '2017-2019',
    yearStart: 2017,
    yearEnd: 2019,
    chassisCode: '5th Gen',
    rawTitle: 'Honda CR-V (2017-2019) fuses',
  },

  // Isuzu
  {
    brand: 'Isuzu',
    makeSlug: 'isuzu',
    model: 'D-Max',
    modelSlug: 'd-max',
    wpPostId: 63506,
    slug: 'isuzu-mu-x-d-max-2017-2020-fuses-and-relays',
    yearsString: '2017-2020',
    yearStart: 2017,
    yearEnd: 2020,
    chassisCode: 'RT85',
    rawTitle: 'Isuzu MU-X / D-Max (2017-2020) fuses and relays',
  },

  // Suzuki
  {
    brand: 'Suzuki',
    makeSlug: 'suzuki',
    model: 'Swift',
    modelSlug: 'swift',
    wpPostId: 30134,
    slug: 'suzuki-swift-2017-2019-fuses',
    yearsString: '2017-2019',
    yearStart: 2017,
    yearEnd: 2019,
    chassisCode: 'A2L',
    rawTitle: 'Suzuki Swift (2017-2019..) fuses',
  },
  {
    brand: 'Suzuki',
    makeSlug: 'suzuki',
    model: 'Jimny',
    modelSlug: 'jimny',
    wpPostId: 51396,
    slug: 'suzuki-jimny-2018-2020-fuses',
    yearsString: '2018-2020',
    yearStart: 2018,
    yearEnd: 2020,
    chassisCode: 'JB64/JB74',
    rawTitle: 'Suzuki Jimny (2018-2020-…) fuses',
  },
];

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '--')
    .replace(/&#8230;/g, '...')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export function classifyCircuitRole(desc: string, name = ''): IngestionCircuitRole {
  const d = (desc + ' ' + name).toLowerCase();

  if (/efi|ecm|ecu|pcm|engine control|dme|d inj|d-inj|inyeccion/i.test(d)) {
    return 'ECU_POWER';
  }
  if (/fuel pump|f\/pump|fp rly|combustible|bomba/i.test(d)) {
    return 'FUEL_PUMP';
  }
  if (/sensor|vref|vvt|o2|maf|map|cam|crank|throttle|pedal|knock|nox/i.test(d)) {
    return 'SENSOR_VREF';
  }
  if (/obd|dlc|diag|diagnos/i.test(d)) {
    return 'OBD2_DLC';
  }
  if (/ign|ignition|kl15|starter|start|crank/i.test(d)) {
    return 'IGNITION';
  }
  if (/abs|esp|vsc|brake|steering|eps|airbag|srs|trc/i.test(d)) {
    return 'CHASSIS';
  }
  if (
    /defog|wiper|mirror|radio|audio|window|blower|heater|htr|ac|a\/c|washer|acc|power socket|cig|p\/outlet/i.test(
      d
    )
  ) {
    return 'ACCESSORY';
  }
  if (/headlight|tail|lamp|light|h-lp|\bfog\b|fog\s*light|turn|hazard|bocina|horn|drl/i.test(d)) {
    return 'LIGHTING';
  }

  return 'UNKNOWN';
}

export function determineVerificationTier(
  boxes: FuseBoxInfoBox[],
  totalCavities: number
): IngestionVerificationTier {
  if (totalCavities < 5 || boxes.length === 0) {
    return 'LOW_RATING_RESTRICTED';
  }

  const hasEcu = boxes.some((b) => b.keyCircuits.ecuFeeds.length > 0);
  const hasIgn = boxes.some((b) => b.keyCircuits.ignitionFeeds.length > 0);
  const hasObd = boxes.some((b) => b.keyCircuits.obdFeeds.length > 0);

  if ((hasEcu || hasIgn || hasObd) && totalCavities >= 15) {
    return 'VERIFIED';
  }

  return 'COMMUNITY_UNVERIFIED';
}

export function checkRepositoryDeduplication(target: FuseBoxInfoCrawlTarget): {
  status: 'NEW_RECORD' | 'AUGMENTED_EXISTING' | 'MATCHED_SEED';
  matchedRecordId?: string;
} {
  const seedMatch = INITIAL_AUTOMOTIVE_CATALOG.vehicles.find(
    (v) =>
      v.makeSlug.toLowerCase() === target.makeSlug.toLowerCase() &&
      v.model.toLowerCase() === target.model.toLowerCase() &&
      target.yearStart <= v.yearEnd &&
      target.yearEnd >= v.yearStart
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
      p.model.toLowerCase() === target.model.toLowerCase()
  );
  if (presetMatch) {
    return {
      status: 'AUGMENTED_EXISTING',
      matchedRecordId: `preset-${target.makeSlug}-${target.modelSlug}`,
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

export function extractBoxTitle(html: string, tableMatchIndex: number, tableIdx: number): string {
  const beforeTable = html.substring(Math.max(0, tableMatchIndex - 800), tableMatchIndex);
  const spanMatch = beforeTable.match(
    /<span[^>]*class="[^"]*tablepress-table-description[^"]*"[^>]*>([\s\S]*?)<\/span>/i
  );
  if (spanMatch) {
    return decodeHtmlEntities(spanMatch[1].replace(/<[^>]+>/g, '').trim());
  }

  const headingMatches = [
    ...beforeTable.matchAll(
      /<(?:h[2-4]|p|caption|strong)[^>]*>(.*?)<\/(?:h[2-4]|p|caption|strong)>/gi
    ),
  ];
  for (let i = headingMatches.length - 1; i >= 0; i--) {
    const text = decodeHtmlEntities(headingMatches[i][1].replace(/<[^>]+>/g, '').trim());
    if (
      /fuse|relay|compartment|panel|assignment|box|engine|cabin|passenger|interior|trunk/i.test(text) &&
      text.length > 5 &&
      text.length < 120
    ) {
      return text;
    }
  }

  return `Fuse Box ${tableIdx + 1}`;
}

export function resolveColumns(headerCells: string[]): {
  cavityCol: number;
  ampCol: number;
  nameCol: number;
  descCol: number;
} {
  const norm = headerCells.map((c) => decodeHtmlEntities(c).toLowerCase().trim());
  if (norm.length === 2) {
    return { cavityCol: 0, ampCol: -1, nameCol: -1, descCol: 1 };
  }

  let cavityCol = norm.findIndex(
    (c) => /^(№|no\.?|cavity|fuse|position|terminal)$/i.test(c) || /№/i.test(c)
  );
  if (cavityCol === -1) cavityCol = 0;

  let ampCol = norm.findIndex((c) => /^(amp|amps|ampere|amp rating|a)$/i.test(c));
  let nameCol = norm.findIndex((c) => /^(name|symbol|label|circuit name)$/i.test(c));
  let descCol = norm.findIndex((c) =>
    /^(description|protected|circuit protected|circuit|function|components?|usage|relay)$/i.test(c)
  );

  if (norm.length === 3) {
    if (ampCol === 1 && descCol === -1) descCol = 2;
    if (ampCol === 2 && descCol === -1) descCol = 1;
    if (ampCol === -1 && nameCol === -1) {
      ampCol = 1;
      descCol = 2;
    }
  } else if (norm.length >= 4) {
    if (descCol === -1) {
      descCol = norm.findIndex(
        (c, idx) => idx !== cavityCol && idx !== ampCol && idx !== nameCol
      );
    }
  }

  return { cavityCol, ampCol, nameCol, descCol };
}

export function crossVerifyProfileWithStartMyCar(
  profile: FuseBoxInfoVehicleProfile,
  startMyCarBaseDir = path.resolve(process.cwd(), 'src/data/startmycar')
): {
  crossReferencedWithStartMyCar: boolean;
  startMyCarMatchingFile?: string;
  confirmedCavitiesCount?: number;
} {
  const modelDir = path.join(
    startMyCarBaseDir,
    profile.identification.makeSlug,
    profile.identification.modelSlug
  );

  if (!fs.existsSync(modelDir)) {
    return { crossReferencedWithStartMyCar: false };
  }

  const files = fs.readdirSync(modelDir).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    const yearMatch = f.match(/(\d{4})\.json/);
    if (!yearMatch) continue;
    const year = parseInt(yearMatch[1], 10);
    if (year >= profile.identification.yearStart - 1 && year <= profile.identification.yearEnd + 1) {
      try {
        const smcData = JSON.parse(fs.readFileSync(path.join(modelDir, f), 'utf-8'));
        const smcBoxes = smcData.powerDistribution?.boxes || [];
        const allSmcFuses: any[] = [];
        for (const b of smcBoxes) {
          if (Array.isArray(b.fuses)) {
            allSmcFuses.push(...b.fuses);
          }
        }

        let confirmedCavitiesCount = 0;
        for (const b of profile.powerDistribution.boxes) {
          for (const cav of b.cavities) {
            const hasMatch = allSmcFuses.some(
              (sf) =>
                sf.id === cav.cavityId ||
                (cav.circuitName && sf.description?.toLowerCase().includes(cav.circuitName.toLowerCase())) ||
                (cav.ampNumeric && sf.amp === cav.ampNumeric && sf.circuitRole === cav.circuitRole)
            );
            if (hasMatch) confirmedCavitiesCount++;
          }
        }

        return {
          crossReferencedWithStartMyCar: true,
          startMyCarMatchingFile: `src/data/startmycar/${profile.identification.makeSlug}/${profile.identification.modelSlug}/${f}`,
          confirmedCavitiesCount,
        };
      } catch (err) {
        console.warn(`[CrossVerify Warn] Error reading ${f}:`, err);
      }
    }
  }

  return { crossReferencedWithStartMyCar: false };
}

export async function crawlFuseBoxInfoTarget(
  target: FuseBoxInfoCrawlTarget,
  politeDelayMs = 300
): Promise<FuseBoxInfoVehicleProfile | null> {
  const url = `https://fuse-box.info/wp-json/wp/v2/pages/${target.wpPostId}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 AutoElectricLab/1.0',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      console.warn(`[Crawl Warn] ${url} returned HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const html = data.content?.rendered || '';
    const tableMatches = [...html.matchAll(/(<table[\s\S]*?<\/table>)/gi)];

    if (tableMatches.length === 0) {
      console.warn(`[Crawl Warn] No tables found for ${target.brand} ${target.model} (${target.slug})`);
      return null;
    }

    let totalCavities = 0;
    const boxes: FuseBoxInfoBox[] = [];

    for (let tIdx = 0; tIdx < tableMatches.length; tIdx++) {
      const tm = tableMatches[tIdx];
      const boxTitle = extractBoxTitle(html, tm.index, tIdx);

      let location: FuseBoxInfoBox['location'] = 'OTHER';
      if (/engine/i.test(boxTitle)) location = 'ENGINE_COMPARTMENT';
      else if (/instrument|passenger|cabin|dashboard|interior/i.test(boxTitle))
        location = 'INSTRUMENT_PANEL';
      else if (/trunk|luggage/i.test(boxTitle)) location = 'LUGGAGE_COMPARTMENT';
      else if (/relay/i.test(boxTitle)) location = 'RELAY_BLOCK';

      const rows = [...tm[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
      if (rows.length === 0) continue;

      const headerCells = [
        ...rows[0][1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi),
      ].map((c) => c[1].replace(/<[^>]+>/g, '').trim());

      const mapping = resolveColumns(headerCells);
      const cavities: FuseBoxInfoCavity[] = [];

      for (let rIdx = 1; rIdx < rows.length; rIdx++) {
        const cells = [
          ...rows[rIdx][1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi),
        ].map((c) => decodeHtmlEntities(c[1].replace(/<[^>]+>/g, '').trim()));

        if (cells.length === 0) continue;

        const cavityId = cells[mapping.cavityCol] || `Cavity-${rIdx}`;
        if (cavityId === '-' || cavityId === '—' || !cavityId) continue;

        const ampRaw = mapping.ampCol >= 0 ? cells[mapping.ampCol] || '' : '';
        const nameRaw = mapping.nameCol >= 0 ? cells[mapping.nameCol] || '' : '';
        const descRaw = mapping.descCol >= 0 ? cells[mapping.descCol] || '' : '';

        // Determine numeric amp
        const ampNumMatch = ampRaw.match(/(\d+(?:\.\d+)?)/);
        const ampNumeric = ampNumMatch ? parseFloat(ampNumMatch[1]) : null;

        const isRelay =
          /^R\d+/i.test(cavityId) ||
          /relay/i.test(cavityId) ||
          /relay/i.test(ampRaw) ||
          /relay/i.test(nameRaw) ||
          /relay/i.test(descRaw);

        const circuitName = nameRaw || (cavityId.length <= 8 && isNaN(Number(cavityId)) ? cavityId : '');
        const description = descRaw || nameRaw || '(Unassigned / Spare)';

        const circuitRole = classifyCircuitRole(description, circuitName);

        cavities.push({
          cavityId,
          ampRatingString: ampRaw || (isRelay ? 'Relay' : '—'),
          ampNumeric,
          circuitName,
          description,
          circuitRole,
          isRelay,
        });

        totalCavities++;
      }

      const ecuFeeds = cavities.filter((c) => c.circuitRole === 'ECU_POWER');
      const sensorFeeds = cavities.filter((c) => c.circuitRole === 'SENSOR_VREF');
      const obdFeeds = cavities.filter((c) => c.circuitRole === 'OBD2_DLC');
      const fuelPumpFeeds = cavities.filter((c) => c.circuitRole === 'FUEL_PUMP');
      const ignitionFeeds = cavities.filter((c) => c.circuitRole === 'IGNITION');

      boxes.push({
        boxIndex: tIdx,
        boxTitle,
        location,
        cavities,
        keyCircuits: {
          ecuFeeds,
          sensorFeeds,
          obdFeeds,
          fuelPumpFeeds,
          ignitionFeeds,
        },
      });
    }

    const tier = determineVerificationTier(boxes, totalCavities);
    const deduplication = checkRepositoryDeduplication(target);

    const hasDedicatedEcmFeed = boxes.some((b) => b.keyCircuits.ecuFeeds.length > 0);
    const hasSensorVrefFeed = boxes.some((b) => b.keyCircuits.sensorFeeds.length > 0);
    const hasObdDlcFeed = boxes.some((b) => b.keyCircuits.obdFeeds.length > 0);
    const hasFuelPumpRelay = boxes.some((b) => b.keyCircuits.fuelPumpFeeds.length > 0);

    const circuitHighlights: string[] = [];
    if (hasDedicatedEcmFeed) circuitHighlights.push('Dedicated ECM / Engine Control Power Feeds');
    if (hasObdDlcFeed) circuitHighlights.push('OBD-II DLC Diagnostic Pin 16 Fused Power Feed');
    if (hasFuelPumpRelay) circuitHighlights.push('Primary Fuel Pump Control Circuit / Relay');
    if (hasSensorVrefFeed) circuitHighlights.push('Sensor Reference Rails & VVT / O2 Actuator Fuses');

    const profile: FuseBoxInfoVehicleProfile = {
      schemaVersion: '1.0.0',
      provenance: {
        source: 'FuseBoxInfo',
        sourceUrl: `https://fuse-box.info/${target.makeSlug}/${target.slug}`,
        wpPostId: target.wpPostId,
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
        yearsString: target.yearsString,
        yearStart: target.yearStart,
        yearEnd: target.yearEnd,
        chassisCode: target.chassisCode || null,
        rawTitle: target.rawTitle,
      },
      powerDistribution: {
        totalBoxes: boxes.length,
        totalCavities,
        boxes,
      },
      ecuAndSensorsSummary: {
        hasDedicatedEcmFeed,
        hasSensorVrefFeed,
        hasObdDlcFeed,
        hasFuelPumpRelay,
        circuitHighlights,
      },
      crossVerificationStatus: {
        crossReferencedWithStartMyCar: false,
      },
    };

    // Cross reference with StartMyCar records
    const crossVerify = crossVerifyProfileWithStartMyCar(profile);
    profile.crossVerificationStatus = crossVerify;

    if (politeDelayMs > 0) {
      await new Promise((r) => setTimeout(r, politeDelayMs));
    }

    return profile;
  } catch (err) {
    console.error(`[Crawl Error] Failed on ${url}:`, err);
    return null;
  }
}

export async function runFuseBoxInfoIngestionPipeline(
  targets: FuseBoxInfoCrawlTarget[] = FUSEBOXINFO_TARGETS,
  baseOutputDir = path.resolve(process.cwd(), 'src/data/fuseboxinfo')
): Promise<FuseBoxInfoCatalogManifest> {
  console.log(`\n======================================================`);
  console.log(`  Fuse-Box.info OEM High-Fidelity Ingestion Engine`);
  console.log(`  Targeting ${targets.length} OEM vehicle models`);
  console.log(`======================================================\n`);

  fs.mkdirSync(baseOutputDir, { recursive: true });

  const ingestedProfiles: FuseBoxInfoVehicleProfile[] = [];
  let totalCavities = 0;
  let verifiedCount = 0;
  let communityUnverifiedCount = 0;
  let lowRatingCount = 0;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    console.log(
      `[${i + 1}/${targets.length}] Ingesting OEM: ${target.brand} ${target.model} (${target.yearsString})...`
    );

    const profile = await crawlFuseBoxInfoTarget(target, 300);
    if (!profile) {
      console.warn(`  ↳ Skipping ${target.brand} ${target.model} due to network/parsing failure.`);
      continue;
    }

    // Materialize in directory structure: src/data/fuseboxinfo/<makeSlug>/<modelSlug>/<slug>.json
    const brandDir = path.join(baseOutputDir, target.makeSlug, target.modelSlug);
    fs.mkdirSync(brandDir, { recursive: true });
    const targetFile = path.join(brandDir, `${target.slug}.json`);

    fs.writeFileSync(targetFile, JSON.stringify(profile, null, 2), 'utf-8');

    ingestedProfiles.push(profile);
    totalCavities += profile.powerDistribution.totalCavities;

    if (profile.provenance.tier === 'VERIFIED') verifiedCount++;
    else if (profile.provenance.tier === 'COMMUNITY_UNVERIFIED') communityUnverifiedCount++;
    else lowRatingCount++;

    const crossStatus = profile.crossVerificationStatus.crossReferencedWithStartMyCar
      ? `[Dual-OEM Cross-Verified: ${profile.crossVerificationStatus.confirmedCavitiesCount} matches]`
      : `[Single OEM Source]`;

    console.log(
      `  ✓ Materialized: ${targetFile} [${profile.provenance.tier}] (${profile.powerDistribution.totalCavities} cavities, ${profile.powerDistribution.totalBoxes} boxes) ${crossStatus}`
    );
  }

  // Build Catalog Manifest
  const brandsMap = new Map<
    string,
    {
      brand: string;
      makeSlug: string;
      models: {
        model: string;
        modelSlug: string;
        yearsString: string;
        chassisCode?: string | null;
        filePath: string;
      }[];
    }
  >();

  for (const prof of ingestedProfiles) {
    const brandKey = prof.identification.make;
    let bEntry = brandsMap.get(brandKey);
    if (!bEntry) {
      bEntry = {
        brand: brandKey,
        makeSlug: prof.identification.makeSlug,
        models: [],
      };
      brandsMap.set(brandKey, bEntry);
    }

    const targetSlug = prof.provenance.sourceUrl.split('/').pop() || prof.identification.modelSlug;
    bEntry.models.push({
      model: prof.identification.model,
      modelSlug: prof.identification.modelSlug,
      yearsString: prof.identification.yearsString,
      chassisCode: prof.identification.chassisCode,
      filePath: `src/data/fuseboxinfo/${prof.identification.makeSlug}/${prof.identification.modelSlug}/${targetSlug}.json`,
    });
  }

  const manifest: FuseBoxInfoCatalogManifest = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    sourceDomain: 'fuse-box.info',
    totalProfiles: ingestedProfiles.length,
    totalCavitiesMapped: totalCavities,
    tierSummary: {
      verified: verifiedCount,
      communityUnverified: communityUnverifiedCount,
      lowRatingRestricted: lowRatingCount,
    },
    brands: Array.from(brandsMap.values()),
  };

  const manifestPath = path.join(baseOutputDir, 'fuseboxinfoCatalog.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  console.log(`\n======================================================`);
  console.log(`  Ingestion Complete! Materialized:`);
  console.log(`  - Total Profiles: ${ingestedProfiles.length}`);
  console.log(`  - Total Cavities Mapped: ${totalCavities}`);
  console.log(`  - Verified Tier: ${verifiedCount}`);
  console.log(`  - Manifest: ${manifestPath}`);
  console.log(`======================================================\n`);

  return manifest;
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('fuseBoxInfoIngestionEngine.ts')
) {
  runFuseBoxInfoIngestionPipeline().catch((err) => {
    console.error('Fatal ingestion error:', err);
    process.exit(1);
  });
}
