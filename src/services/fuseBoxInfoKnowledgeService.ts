/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import {
  DualOemCrossVerificationResult,
  FuseBoxInfoBox,
  FuseBoxInfoCavity,
  FuseBoxInfoCatalogManifest,
  FuseBoxInfoVehicleProfile,
} from '../types/fuseBoxInfoIngestion';
import { IngestionCircuitRole, IngestionVerificationTier } from '../types/startMyCarIngestion';
import { getStartMyCarProfile } from './startMyCarKnowledgeService';

import catalogManifestJson from '../data/fuseboxinfo/fuseboxinfoCatalog.json';

// Static bundled profiles for 100% offline knowledge retrieval
import toyotaCorollaE210_2019 from '../data/fuseboxinfo/toyota/corolla/toyota-corolla-e210-2019-2022-fuses.json';
import toyotaCorollaE210_2023 from '../data/fuseboxinfo/toyota/corolla/toyota-corolla-e210-2023-2025-fuses.json';
import toyotaHiluxAN120 from '../data/fuseboxinfo/toyota/hilux/toyota-hilux-an120-an130-2015-2019-fuses-and-relay.json';
import toyotaCamryXV70 from '../data/fuseboxinfo/toyota/camry/toyota-camry-xv70-2018-2024-fuses.json';
import toyotaRav4XA50 from '../data/fuseboxinfo/toyota/rav4/toyota-rav4-xa50-2019-2025-fuses.json';
import fordRangerPX3 from '../data/fuseboxinfo/ford/ranger/ford-ranger-2019-fuses-and-relays.json';
import fordRangerPX1 from '../data/fuseboxinfo/ford/ranger/ford-ranger-2012-2015-fuses-and-relays.json';
import fordF150_2015 from '../data/fuseboxinfo/ford/f-150/ford-f-150-2015-2018-fuses-and-relay.json';
import fordF150_2021 from '../data/fuseboxinfo/ford/f-150/ford-f-150-2021-2022-fuses.json';
import nissanSentraB17 from '../data/fuseboxinfo/nissan/sentra/nissan-sentra-b17-2013-2019-fuses.json';
import nissanSentraB18 from '../data/fuseboxinfo/nissan/sentra/nissan-sentra-b18-2020-2025-fuses.json';
import nissanNavaraD23 from '../data/fuseboxinfo/nissan/navara/nissan-navara-frontier-np300-d23-2015-2024-fuses.json';
import hondaCivicGen10 from '../data/fuseboxinfo/honda/civic/honda-civic-2016-2018-fuses.json';
import hondaCrvGen5 from '../data/fuseboxinfo/honda/cr-v/honda-cr-v-2017-2018-fuses.json';
import isuzuDMax from '../data/fuseboxinfo/isuzu/d-max/isuzu-mu-x-d-max-2017-2020-fuses-and-relays.json';
import suzukiSwift from '../data/fuseboxinfo/suzuki/swift/suzuki-swift-2017-2019-fuses.json';
import suzukiJimny from '../data/fuseboxinfo/suzuki/jimny/suzuki-jimny-2018-2020-fuses.json';

const BUNDLED_FUSEBOXINFO_PROFILES: FuseBoxInfoVehicleProfile[] = [
  toyotaCorollaE210_2019 as unknown as FuseBoxInfoVehicleProfile,
  toyotaCorollaE210_2023 as unknown as FuseBoxInfoVehicleProfile,
  toyotaHiluxAN120 as unknown as FuseBoxInfoVehicleProfile,
  toyotaCamryXV70 as unknown as FuseBoxInfoVehicleProfile,
  toyotaRav4XA50 as unknown as FuseBoxInfoVehicleProfile,
  fordRangerPX3 as unknown as FuseBoxInfoVehicleProfile,
  fordRangerPX1 as unknown as FuseBoxInfoVehicleProfile,
  fordF150_2015 as unknown as FuseBoxInfoVehicleProfile,
  fordF150_2021 as unknown as FuseBoxInfoVehicleProfile,
  nissanSentraB17 as unknown as FuseBoxInfoVehicleProfile,
  nissanSentraB18 as unknown as FuseBoxInfoVehicleProfile,
  nissanNavaraD23 as unknown as FuseBoxInfoVehicleProfile,
  hondaCivicGen10 as unknown as FuseBoxInfoVehicleProfile,
  hondaCrvGen5 as unknown as FuseBoxInfoVehicleProfile,
  isuzuDMax as unknown as FuseBoxInfoVehicleProfile,
  suzukiSwift as unknown as FuseBoxInfoVehicleProfile,
  suzukiJimny as unknown as FuseBoxInfoVehicleProfile,
];

export function getFuseBoxInfoManifest(): FuseBoxInfoCatalogManifest {
  return catalogManifestJson as unknown as FuseBoxInfoCatalogManifest;
}

export function getAllFuseBoxInfoProfiles(): FuseBoxInfoVehicleProfile[] {
  return BUNDLED_FUSEBOXINFO_PROFILES;
}

export function getFuseBoxInfoProfile(
  makeSlug: string,
  modelSlug: string,
  year: number
): FuseBoxInfoVehicleProfile | null {
  const normMake = makeSlug.toLowerCase().trim();
  const normModel = modelSlug.toLowerCase().trim();

  const found = BUNDLED_FUSEBOXINFO_PROFILES.find(
    (p) =>
      p.identification.makeSlug.toLowerCase() === normMake &&
      p.identification.modelSlug.toLowerCase() === normModel &&
      year >= p.identification.yearStart &&
      year <= p.identification.yearEnd
  );

  return found || null;
}

export interface FuseBoxInfoSearchFilter {
  query?: string;
  makeSlug?: string;
  modelSlug?: string;
  year?: number;
  tier?: IngestionVerificationTier;
  circuitRole?: IngestionCircuitRole;
}

export interface FuseBoxInfoSearchResult {
  profile: FuseBoxInfoVehicleProfile;
  matchedBox: FuseBoxInfoBox;
  matchedCavity: FuseBoxInfoCavity;
  score: number;
}

export function searchFuseBoxInfoKnowledge(
  filter: FuseBoxInfoSearchFilter
): FuseBoxInfoSearchResult[] {
  const q = (filter.query || '').toLowerCase().trim();
  const makeFilter = (filter.makeSlug || '').toLowerCase().trim();
  const modelFilter = (filter.modelSlug || '').toLowerCase().trim();
  const results: FuseBoxInfoSearchResult[] = [];

  for (const prof of BUNDLED_FUSEBOXINFO_PROFILES) {
    if (makeFilter && prof.identification.makeSlug.toLowerCase() !== makeFilter) continue;
    if (modelFilter && prof.identification.modelSlug.toLowerCase() !== modelFilter) continue;
    if (
      typeof filter.year === 'number' &&
      (filter.year < prof.identification.yearStart || filter.year > prof.identification.yearEnd)
    ) {
      continue;
    }
    if (filter.tier && prof.provenance.tier !== filter.tier) continue;

    for (const box of prof.powerDistribution.boxes) {
      for (const cav of box.cavities) {
        if (filter.circuitRole && cav.circuitRole !== filter.circuitRole) continue;

        let score = 0;
        if (q) {
          const matchCav = cav.cavityId.toLowerCase().includes(q);
          const matchName = cav.circuitName.toLowerCase().includes(q);
          const matchDesc = cav.description.toLowerCase().includes(q);

          if (matchName) score += 15;
          if (matchDesc) score += 10;
          if (matchCav) score += 5;

          if (score === 0) continue;
        } else {
          score = 1;
        }

        results.push({
          profile: prof,
          matchedBox: box,
          matchedCavity: cav,
          score,
        });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export function crossVerifyWithStartMyCar(
  makeSlug: string,
  modelSlug: string,
  year: number
): DualOemCrossVerificationResult {
  const fbiProfile = getFuseBoxInfoProfile(makeSlug, modelSlug, year);
  const smcProfile = getStartMyCarProfile(makeSlug, modelSlug, year);

  if (!fbiProfile && !smcProfile) {
    return {
      make: makeSlug,
      model: modelSlug,
      year,
      verified: false,
      startMyCarCavitiesCount: 0,
      fuseBoxInfoCavitiesCount: 0,
      commonCircuits: [],
      confidenceRating: 'COMMUNITY_UNVERIFIED',
    };
  }

  const fbiCavities = fbiProfile
    ? fbiProfile.powerDistribution.boxes.flatMap((b) => b.cavities)
    : [];
  const smcFuses = smcProfile
    ? smcProfile.powerDistribution.boxes.flatMap((b) => b.fuses)
    : [];

  const commonCircuits: DualOemCrossVerificationResult['commonCircuits'] = [];

  for (const cav of fbiCavities) {
    if (!cav.circuitName && cav.description.includes('Unassigned')) continue;

    const matchedSmc = smcFuses.find(
      (sf) =>
        sf.id === cav.cavityId ||
        (cav.circuitName && sf.description?.toLowerCase().includes(cav.circuitName.toLowerCase())) ||
        (cav.ampNumeric && sf.amp === cav.ampNumeric && sf.circuitRole === cav.circuitRole)
    );

    if (matchedSmc) {
      commonCircuits.push({
        name: cav.circuitName || cav.description,
        fuseBoxInfoAmp: cav.ampNumeric,
        startMyCarAmp: matchedSmc.amp ?? null,
        ampMatch: cav.ampNumeric === matchedSmc.amp,
        role: cav.circuitRole,
      });
    }
  }

  const bothPresent = Boolean(fbiProfile && smcProfile);
  const confidenceRating =
    bothPresent && commonCircuits.length > 5
      ? 'DUAL_OEM_CONFIRMED'
      : fbiProfile || smcProfile
      ? 'SINGLE_SOURCE_VERIFIED'
      : 'COMMUNITY_UNVERIFIED';

  return {
    make: fbiProfile?.identification.make || smcProfile?.identification.make || makeSlug,
    model: fbiProfile?.identification.model || smcProfile?.identification.model || modelSlug,
    year,
    verified: Boolean(fbiProfile || smcProfile),
    startMyCarCavitiesCount: smcFuses.length,
    fuseBoxInfoCavitiesCount: fbiCavities.length,
    commonCircuits,
    confidenceRating,
  };
}

export function getCriticalEcuFeeds(
  makeSlug: string,
  modelSlug: string,
  year: number
): FuseBoxInfoCavity[] {
  const prof = getFuseBoxInfoProfile(makeSlug, modelSlug, year);
  if (!prof) return [];

  const ecuFeeds: FuseBoxInfoCavity[] = [];
  for (const box of prof.powerDistribution.boxes) {
    ecuFeeds.push(...box.keyCircuits.ecuFeeds);
  }
  return ecuFeeds;
}

export function getObdDiagnosticPowerFeed(
  makeSlug: string,
  modelSlug: string,
  year: number
): FuseBoxInfoCavity | null {
  const prof = getFuseBoxInfoProfile(makeSlug, modelSlug, year);
  if (!prof) return null;

  for (const box of prof.powerDistribution.boxes) {
    const obd = box.keyCircuits.obdFeeds[0];
    if (obd) return obd;
  }
  return null;
}
