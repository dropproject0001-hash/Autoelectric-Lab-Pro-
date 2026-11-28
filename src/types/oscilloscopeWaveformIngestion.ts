/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { SystemCategoryId } from './automotiveKnowledge';
import type { IngestionVerificationTier } from './startMyCarIngestion';

export type OscilloscopeGuideCategory =
  | 'sensors'
  | 'actuators'
  | 'communication'
  | 'ignition'
  | 'charging-starting'
  | 'system-tests';

export type OscilloscopeSignalFamily =
  | 'CKP_CRANKSHAFT'
  | 'CMP_CAMSHAFT'
  | 'MAF_AIRFLOW'
  | 'MAP_PRESSURE'
  | 'O2_LAMBDA_AFR'
  | 'TPS_APP_THROTTLE'
  | 'TEMP_ECT_IAT'
  | 'KNOCK_SENSOR'
  | 'ABS_WHEEL_SPEED'
  | 'FUEL_RAIL_PRESSURE'
  | 'INJECTOR_FUEL'
  | 'IGNITION_PRIMARY_SECONDARY'
  | 'CAN_LIN_NETWORK'
  | 'PWM_SOLENOID_VALVE'
  | 'CHARGING_STARTING_RIPPLE'
  | 'SYSTEM_COMPRESSION_CORRELATION'
  | 'OTHER_AUTOMOTIVE_SIGNAL';

export interface OscilloscopeKnownGoodSpec {
  waveformShape: string;
  extractedVoltageSpecs: string[];
  extractedFrequencyOrTimingSpecs: string[];
  testSetupSummary: string;
  knownGoodSummary: string;
}

export interface OscilloscopeFaultyComparison {
  faultIndicators: string[];
  symptomIndicators: string[];
  associatedDtcs: string[];
  goodVsFaultyDiagnosticRule: string;
}

export interface OscilloscopeWaveformRecord {
  id: string;
  agtCode: string;
  title: string;
  category: OscilloscopeGuideCategory;
  subCategory: string;
  signalFamily: OscilloscopeSignalFamily;
  systemCategoryId: SystemCategoryId;
  purposeSummary: string;
  knownGood: OscilloscopeKnownGoodSpec;
  faultyComparison: OscilloscopeFaultyComparison;
  provenance: {
    sourceSite: 'picoauto.com';
    sourceUrl: string;
    crawledAt: string;
    tier: IngestionVerificationTier;
    evidenceType: 'VERIFIED_OEM';
    copyrightNotice: 'Structured oscilloscope signal parameters, DTCs, and short technical extracts only; full guided test remains hosted on picoauto.com.';
  };
}

export interface OscilloscopeWaveformCatalogManifest {
  schemaVersion: '1.0.0';
  sourceSite: 'picoauto.com';
  sourceIndexUrl: string;
  generatedAt: string;
  zeroFabricationIntegrity: true;
  totalGuidesDiscovered: number;
  totalWaveformsIngested: number;
  totalDtcsIndexed: number;
  categoriesBreakdown: Record<OscilloscopeGuideCategory, number>;
  signalFamiliesBreakdown: Record<string, number>;
  records: OscilloscopeWaveformRecord[];
}
