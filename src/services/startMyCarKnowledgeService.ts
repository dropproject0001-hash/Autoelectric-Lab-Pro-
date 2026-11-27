/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import {
  IngestedFuseOrRelay,
  IngestedVehicleProfile,
  IngestionCircuitRole,
  IngestionVerificationTier,
  StartMyCarCatalogManifest,
} from '../types/startMyCarIngestion';
import catalogManifestJson from '../data/startmycar/startmycarCatalog.json';

// Direct static map of bundled vehicle profiles for offline ingestion
import toyotaCorolla2020 from '../data/startmycar/toyota/corolla/2020.json';
import toyotaHilux2019 from '../data/startmycar/toyota/hilux/2019.json';
import toyotaCamry2020 from '../data/startmycar/toyota/camry/2020.json';
import toyotaRav42019 from '../data/startmycar/toyota/rav4/2019.json';
import fordRanger2019 from '../data/startmycar/ford/ranger/2019.json';
import fordF1502016 from '../data/startmycar/ford/f-150/2016.json';
import nissanSentra2018 from '../data/startmycar/nissan/sentra/2018.json';
import nissanSentra2016 from '../data/startmycar/nissan/sentra/2016.json';
import nissanNavara2020 from '../data/startmycar/nissan/navara/2020.json';
import hondaCivic2018 from '../data/startmycar/honda/civic/2018.json';
import hondaCrV2019 from '../data/startmycar/honda/cr-v/2019.json';
import isuzuDMax2020 from '../data/startmycar/isuzu/d-max/2020.json';
import suzukiSwift2018 from '../data/startmycar/suzuki/swift/2018.json';
import suzukiJimny2020 from '../data/startmycar/suzuki/jimny/2020.json';

const BUNDLED_PROFILES: IngestedVehicleProfile[] = [
  toyotaCorolla2020 as unknown as IngestedVehicleProfile,
  toyotaHilux2019 as unknown as IngestedVehicleProfile,
  toyotaCamry2020 as unknown as IngestedVehicleProfile,
  toyotaRav42019 as unknown as IngestedVehicleProfile,
  fordRanger2019 as unknown as IngestedVehicleProfile,
  fordF1502016 as unknown as IngestedVehicleProfile,
  nissanSentra2018 as unknown as IngestedVehicleProfile,
  nissanSentra2016 as unknown as IngestedVehicleProfile,
  nissanNavara2020 as unknown as IngestedVehicleProfile,
  hondaCivic2018 as unknown as IngestedVehicleProfile,
  hondaCrV2019 as unknown as IngestedVehicleProfile,
  isuzuDMax2020 as unknown as IngestedVehicleProfile,
  suzukiSwift2018 as unknown as IngestedVehicleProfile,
  suzukiJimny2020 as unknown as IngestedVehicleProfile,
];

export function getStartMyCarManifest(): StartMyCarCatalogManifest {
  return catalogManifestJson as unknown as StartMyCarCatalogManifest;
}

export function getAllIngestedVehicleProfiles(): IngestedVehicleProfile[] {
  return BUNDLED_PROFILES;
}

export function getStartMyCarProfile(
  makeSlug: string,
  modelSlug: string,
  year: number
): IngestedVehicleProfile | null {
  const normMake = makeSlug.toLowerCase().trim();
  const normModel = modelSlug.toLowerCase().trim();

  const found = BUNDLED_PROFILES.find(
    (p) =>
      p.identification.makeSlug.toLowerCase() === normMake &&
      p.identification.modelSlug.toLowerCase() === normModel &&
      p.identification.year === year
  );

  return found || null;
}

export interface IngestionSearchFilter {
  query?: string;
  makeSlug?: string;
  modelSlug?: string;
  year?: number;
  tier?: IngestionVerificationTier;
  circuitRole?: IngestionCircuitRole;
}

export interface SearchMatchResult {
  profile: IngestedVehicleProfile;
  matchedCircuits: {
    boxName: string;
    item: IngestedFuseOrRelay;
  }[];
  score: number;
}

export function searchStartMyCarKnowledge(filter: IngestionSearchFilter): SearchMatchResult[] {
  const q = (filter.query || '').toLowerCase().trim();
  const makeFilter = (filter.makeSlug || '').toLowerCase().trim();
  const modelFilter = (filter.modelSlug || '').toLowerCase().trim();
  const results: SearchMatchResult[] = [];

  for (const prof of BUNDLED_PROFILES) {
    if (makeFilter && prof.identification.makeSlug.toLowerCase() !== makeFilter) continue;
    if (modelFilter && prof.identification.modelSlug.toLowerCase() !== modelFilter) continue;
    if (filter.year && prof.identification.year !== filter.year) continue;
    if (filter.tier && prof.provenance.tier !== filter.tier) continue;

    let score = 0;
    const matchedCircuits: SearchMatchResult['matchedCircuits'] = [];

    const textMatch =
      !q ||
      prof.identification.make.toLowerCase().includes(q) ||
      prof.identification.model.toLowerCase().includes(q) ||
      prof.identification.year.toString().includes(q) ||
      (prof.identification.generation && prof.identification.generation.toLowerCase().includes(q));

    if (textMatch) score += 10;

    for (const box of prof.powerDistribution.boxes) {
      for (const fuse of box.fuses) {
        let circuitMatch = false;

        if (filter.circuitRole && fuse.circuitRole === filter.circuitRole) {
          circuitMatch = true;
          score += 5;
        }

        if (q && (fuse.description.toLowerCase().includes(q) || fuse.id.toLowerCase() === q)) {
          circuitMatch = true;
          score += 15;
        }

        if (circuitMatch) {
          matchedCircuits.push({
            boxName: box.boxName,
            item: fuse,
          });
        }
      }
    }

    if (score > 0 || !q) {
      results.push({
        profile: prof,
        matchedCircuits,
        score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
