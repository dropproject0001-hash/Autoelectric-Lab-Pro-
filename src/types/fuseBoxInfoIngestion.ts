/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { IngestionCircuitRole, IngestionVerificationTier } from './startMyCarIngestion';

export interface FuseBoxInfoCavity {
  cavityId: string;
  ampRatingString: string;
  ampNumeric: number | null;
  circuitName: string;
  description: string;
  circuitRole: IngestionCircuitRole;
  isRelay: boolean;
}

export interface FuseBoxInfoBox {
  boxIndex: number;
  boxTitle: string;
  location: 'ENGINE_COMPARTMENT' | 'INSTRUMENT_PANEL' | 'LUGGAGE_COMPARTMENT' | 'RELAY_BLOCK' | 'OTHER';
  cavities: FuseBoxInfoCavity[];
  keyCircuits: {
    ecuFeeds: FuseBoxInfoCavity[];
    sensorFeeds: FuseBoxInfoCavity[];
    obdFeeds: FuseBoxInfoCavity[];
    fuelPumpFeeds: FuseBoxInfoCavity[];
    ignitionFeeds: FuseBoxInfoCavity[];
  };
}

export interface FuseBoxInfoVehicleProfile {
  schemaVersion: '1.0.0';
  provenance: {
    source: 'FuseBoxInfo';
    sourceUrl: string;
    wpPostId: number;
    crawledAt: string;
    zeroFabricationIntegrity: true;
    tier: IngestionVerificationTier;
    deduplicationStatus: 'NEW_RECORD' | 'AUGMENTED_EXISTING' | 'MATCHED_SEED';
    matchedRepositoryRecordId?: string;
  };
  identification: {
    make: string;
    makeSlug: string;
    model: string;
    modelSlug: string;
    yearsString: string;
    yearStart: number;
    yearEnd: number;
    chassisCode?: string | null;
    rawTitle: string;
  };
  powerDistribution: {
    totalBoxes: number;
    totalCavities: number;
    boxes: FuseBoxInfoBox[];
  };
  ecuAndSensorsSummary: {
    hasDedicatedEcmFeed: boolean;
    hasSensorVrefFeed: boolean;
    hasObdDlcFeed: boolean;
    hasFuelPumpRelay: boolean;
    circuitHighlights: string[];
  };
  crossVerificationStatus: {
    crossReferencedWithStartMyCar: boolean;
    startMyCarMatchingFile?: string;
    confirmedCavitiesCount?: number;
  };
}

export interface FuseBoxInfoCatalogManifest {
  schemaVersion: '1.0.0';
  generatedAt: string;
  sourceDomain: 'fuse-box.info';
  totalProfiles: number;
  totalCavitiesMapped: number;
  tierSummary: {
    verified: number;
    communityUnverified: number;
    lowRatingRestricted: number;
  };
  brands: {
    brand: string;
    makeSlug: string;
    models: {
      model: string;
      modelSlug: string;
      yearsString: string;
      chassisCode?: string | null;
      filePath: string;
    }[];
  }[];
}

export interface DualOemCrossVerificationResult {
  make: string;
  model: string;
  year: number;
  verified: boolean;
  startMyCarCavitiesCount: number;
  fuseBoxInfoCavitiesCount: number;
  commonCircuits: {
    name: string;
    startMyCarAmp: number | null;
    fuseBoxInfoAmp: number | null;
    ampMatch: boolean;
    role: IngestionCircuitRole;
  }[];
  confidenceRating: 'DUAL_OEM_CONFIRMED' | 'SINGLE_SOURCE_VERIFIED' | 'COMMUNITY_UNVERIFIED';
}
