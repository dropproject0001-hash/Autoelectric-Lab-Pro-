/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { EvidenceHierarchyLevel, SystemCategoryId } from './automotiveKnowledge';

export type EcuPcbComponentRole =
  | 'IGNITION_IGBT_DRIVER'
  | 'INJECTOR_SOLENOID_DRIVER'
  | 'ETC_H_BRIDGE_DRIVER'
  | 'CAN_LIN_KLINE_TRANSCEIVER'
  | 'VOLTAGE_REGULATOR_SBC'
  | 'SERIAL_EEPROM_FLASH'
  | 'ECU_MICROCONTROLLER'
  | 'POWER_PROTECTION_PASSIVE';

export interface EcuPcbRepairStep {
  stepNumber: number;
  title: string;
  action: string;
  targetSpec: string;
  safetyNote?: string;
}

export interface EcuPcbComponentRecord {
  id: string;
  partNumber: string;
  markingAliases: string[];
  refDesPrefixes: string[];
  manufacturer: string;
  role: EcuPcbComponentRole;
  systemCategoryId: SystemCategoryId;
  packageType: string;
  pinCount: number;
  oemEcuPlatforms: string[];
  crossReferences: string[];
  functionalSummary: string;
  electricalBenchSpecs: {
    supplyVoltage: string;
    keyPinChecks: string[];
    diodeOrResistanceCheck: string;
    thermalNote: string;
  };
  visualAndFaultSignatures: {
    visualInspectionClues: string[];
    commonFailureModes: string[];
    associatedDtcs: string[];
  };
  technicianProTips: string[];
  guidedRepairSteps: EcuPcbRepairStep[];
  provenance: {
    sourceSite: string;
    sourceUrl: string;
    liveVerifiedHttpStatus: number | null;
    liveScrapedSummary: string | null;
    crawledAt: string;
    evidenceType: EvidenceHierarchyLevel;
  };
}

export interface EcuPcbComponentsCatalogManifest {
  schemaVersion: '1.0.0';
  databaseName: string;
  generatedAt: string;
  zeroFabricationIntegrity: true;
  totalComponents: number;
  liveVerifiedPagesCount: number;
  rolesBreakdown: Record<EcuPcbComponentRole, number>;
  records: EcuPcbComponentRecord[];
}
