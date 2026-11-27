/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

export type IngestionVerificationTier =
  | 'VERIFIED'
  | 'COMMUNITY_UNVERIFIED'
  | 'LOW_RATING_RESTRICTED';

export type IngestionCircuitRole =
  | 'ECU_POWER'
  | 'SENSOR_VREF'
  | 'FUEL_PUMP'
  | 'OBD2_DLC'
  | 'IGNITION'
  | 'CHASSIS'
  | 'LIGHTING'
  | 'ACCESSORY'
  | 'UNKNOWN';

export interface IngestedFuseOrRelay {
  id: string;
  type: 'fuse' | 'relay' | 'fuse-block' | 'fusible-link' | 'diode' | 'unknown';
  format?: string;
  amp?: number | null;
  description: string;
  circuitRole: IngestionCircuitRole;
  relatedEntities: string[];
  notUsed: boolean;
}

export interface IngestedFuseBox {
  boxIndex: number;
  boxName: string;
  location: 'ENGINE_BAY' | 'INTERIOR_CABIN' | 'TRUNK_LUGGAGE' | 'RELAY_BLOCK' | 'OTHER';
  diagramUrl?: string;
  thumbnailUrl?: string;
  fuses: IngestedFuseOrRelay[];
  activeEcuAndSensors: {
    ecuFuses: IngestedFuseOrRelay[];
    sensorPowerFuses: IngestedFuseOrRelay[];
    obdDlcFuses: IngestedFuseOrRelay[];
    ignitionFuses: IngestedFuseOrRelay[];
  };
}

export interface IngestedVehicleProfile {
  schemaVersion: '1.0.0';
  provenance: {
    source: 'StartMyCar';
    sourceUrl: string;
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
    year: number;
    generation?: string | null;
    platformCode?: string | null;
    marketRegions: string[];
    enginesDetected: string[];
  };
  powerDistribution: {
    totalBoxes: number;
    totalCavities: number;
    totalFuses: number;
    totalRelays: number;
    boxes: IngestedFuseBox[];
  };
  ecuAndSensorCircuits: {
    hasDedicatedEcmFeed: boolean;
    hasObdDlcFeed: boolean;
    hasFuelPumpRelay: boolean;
    hasSensorVrefFeed: boolean;
    circuitHighlights: string[];
  };
  offlineIngestionReady: boolean;
}

export interface StartMyCarCatalogManifest {
  schemaVersion: '1.0.0';
  generatedAt: string;
  totalVehicles: number;
  totalFusesAndRelays: number;
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
      years: number[];
      filePathTemplate: string;
    }[];
  }[];
}
