/**
 * Canonical OEM Vehicle, ECU Verification Gating, Boot-Mode, & Table 16 DLC Database.
 *
 * Single source of truth consumed by:
 * - `vehicleEcuRegistry.ts` (Bench Test Car/Model/ECU selector & gating alerts)
 * - `offlineChatbotEngine.ts` (MiniSearch RAG index & anti-fabrication guardrails)
 * - `voiceCommandParser.ts` & `FloatingLabNavigator.tsx` (hands-free voice pinout/DLC/OCR_VERIFY guidance)
 *
 * Ingestion Rules Enforced:
 * 1. VERIFIED — Verified bench power-up, pinouts, boot-mode protocols, and Table 16 DLC maps.
 * 2. OCR_VERIFY — Mandatory physical ECU part number & harness continuity verification prompts prior to energizing/probing.
 * 3. PART_METADATA_ONLY / MECHANICAL_NO_ECU — Strictly metadata, controller identifiers, DLC protocols,
 *    or mechanical-injection notices ONLY. Zero fabricated ECU pin numbers.
 * 4. BENCH_TEST_SCENARIOS — Verified OEM bench fault simulation scenarios mapped to DTCs & lab behavior.
 */

import { FaultType } from '../types/ecu';

export type EcuIngestionStatus =
  | 'VERIFIED'
  | 'OCR_VERIFY'
  | 'PART_METADATA_ONLY'
  | 'MECHANICAL_NO_ECU';

export interface VerifiedVoiceEcuGuide {
  id: string;
  brandKey: string;
  brandLabel: string;
  ecuName: string;
  status: 'VERIFIED' | 'OCR_VERIFY';
  linkedProfileId: string | null;
  models: string[];
  tableRef: string;
  keyBenchPins: string;
  bootOrPowerRule: string;
  ocrVerifyGate?: string;
  dlcProtocol: string;
  voicePrompt: string;
}

export interface RestrictedModelEntry {
  id: string;
  brandKey: string;
  brandLabel: string;
  modelName: string;
  status: 'PART_METADATA_ONLY' | 'MECHANICAL_NO_ECU';
  oemControllerNote: string;
  dlcProtocol: string;
  restrictionReason: string;
}

export interface DlcInterfaceEntry {
  id: string;
  brandKey: string;
  brandLabel: string;
  connectorTypes: string;
  obd2Pins: string;
  legacyDlcPins: string;
  protocolNotes: string;
  voiceSummary: string;
}

export interface OcrVerifyRule {
  id: string;
  matchTerms: string[];
  title: string;
  prompt: string;
  spokenAlert: string;
}

export interface BenchTestScenarioEntry {
  id: string;
  scenarioNumber: number;
  brandKey: string;
  brandLabel: string;
  market: string;
  targetModuleAndModels: string;
  dtcCode: string;
  faultDescription: string;
  benchSimulationSetup: string;
  expectedEcuBehavior: string;
  recommendedPinId: string;
  recommendedFaultType: FaultType;
  faultPresetLabel: string;
}

/**
 * Rule 1: Voice-Ready Verified & OCR_VERIFY ECU Bench & Boot Guides
 * (Complements `ECU_BRAND_PROFILES` without duplicating pin arrays).
 */
export const VERIFIED_VOICE_ECU_GUIDES: VerifiedVoiceEcuGuide[] = [
  {
    id: 'guide-toyota-1gd-2gd-hilux',
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    ecuName: 'Hilux / Fortuner / Innova (2.8L 1GD-FTV & 2.4L 2GD-FTV, Denso)',
    status: 'VERIFIED',
    linkedProfileId: 'toyota-denso-175822',
    models: [
      'Hilux / Fortuner / Innova (2.8L 1GD-FTV & 2.4L 2GD-FTV)',
      'Hilux (1GD-FTV / 2GD-FTV)',
      'Fortuner (1GD-FTV / 2GD-FTV)',
      'Innova (2.8L 1GD-FTV)',
    ],
    tableRef: 'Toyota OEM Bench Pinouts #1 (1GD-FTV & 2GD-FTV)',
    keyBenchPins:
      'Constant Power (+B / +B2): A1, A2 | Switched Ignition (IGSW): A28 | Ground (E1 / ME01): A3, A4, B1 | CAN Bus: A41 (H) / A42 (L) | Sensors & Actuators: NE+ (CKP): B14, G2+ (CMP): B15, PCR1 (FRP): B32, SCV+: B48.',
    bootOrPowerRule:
      'WARNING: Always cross-check the exact Denso/Fujitsu Ten part number on the ECU case and verify ground continuity with a multimeter before applying +12V bench power. Connect +B/+B2 to A1 and A2, IGSW to A28, Grounds E1/ME01 to A3, A4, and B1, CANH to A41, CANL to A42, NE+ CKP to B14, G2+ CMP to B15, PCR1 FRP to B32, and SCV+ to B48.',
    ocrVerifyGate:
      '⚠️ WARNING: Pinout Verification & Polarity — Cross-check the exact Denso/Fujitsu Ten part number on the ECU case (and i-ART vs. non-i-ART spec) and verify ground continuity on A3, A4, B1 before applying +12V bench power.',
    dlcProtocol: 'High-Speed CAN ISO 15765-4 (ECU Pins A41 CANH / A42 CANL · OBD-II Pins 6 & 14)',
    voicePrompt:
      'For the Toyota Hilux, Fortuner, and Innova 2.8L 1GD-FTV and 2.4L 2GD-FTV Denso ECU: constant power +B goes to A1 and A2, switched ignition IGSW to A28, ground E1 and ME01 to A3, A4, and B1, CAN High to A41, CAN Low to A42, NE+ crank sensor to B14, G2+ cam sensor to B15, PCR1 fuel rail pressure to B32, and SCV+ to B48. Warning: always cross-check the Denso part number and verify ground continuity before applying 12 volts.',
  },
  {
    id: 'guide-toyota-1kd-2kd',
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    ecuName: 'Hilux / Fortuner / Hiace (3.0L 1KD-FTV & 2.5L 2KD-FTV, Denso)',
    status: 'VERIFIED',
    linkedProfileId: 'toyota-denso-175822',
    models: [
      'Hilux / Fortuner / Hiace (3.0L 1KD-FTV & 2.5L 2KD-FTV)',
      'Hilux (1KD/2KD-FTV)',
      'Fortuner (1KD/2KD-FTV)',
      'Hiace (1KD/2KD-FTV)',
    ],
    tableRef: 'Toyota OEM Bench Pinouts #2 (1KD-FTV & 2KD-FTV)',
    keyBenchPins:
      'Constant Power (+B / +B2): E5-1, E5-2 | Switched Ignition (IGSW): E5-9 | Ground (E1 / ME01): E5-3, E6-1 | CAN Bus: E5-23 (H) / E5-24 (L) | Sensors & Actuators: NE+ (CKP): E6-12, G2+ (CMP): E6-13, PCR1 (FRP): E6-25, SCV+: E6-31.',
    bootOrPowerRule:
      'WARNING: Always cross-check the exact Denso/Fujitsu Ten part number on the ECU case and verify ground continuity with a multimeter before applying +12V bench power. Connect +B/+B2 to E5-1 and E5-2, IGSW to E5-9, Grounds E1/ME01 to E5-3 and E6-1, CANH to E5-23, CANL to E5-24, NE+ CKP to E6-12, G2+ CMP to E6-13, PCR1 FRP to E6-25, and SCV+ to E6-31.',
    dlcProtocol: 'ISO 15765-4 CAN (ECU Pins E5-23 CANH / E5-24 CANL · OBD-II Pins 6 & 14) / ISO-9141 SIL (OBD2 Pin 7)',
    voicePrompt:
      'For the Toyota Hilux, Fortuner, and Hiace 3.0L 1KD-FTV and 2.5L 2KD-FTV Denso ECU: constant power +B connects to E5-1 and E5-2, switched ignition IGSW to E5-9, ground E1 and ME01 to E5-3 and E6-1, CAN High to E5-23, CAN Low to E5-24, NE+ CKP to E6-12, G2+ CMP to E6-13, PCR1 FRP to E6-25, and SCV+ to E6-31. Always verify ground continuity and Denso part number before applying 12 volts.',
  },
  {
    id: 'guide-toyota-1trfe-innova',
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    ecuName: 'Innova (2.0L 1TR-FE VVT-i Gasoline, Denso)',
    status: 'VERIFIED',
    linkedProfileId: 'toyota-denso-175822',
    models: ['Innova (2.0L 1TR-FE VVT-i Gasoline)', 'Innova 2.0L 1TR-FE'],
    tableRef: 'Toyota OEM Bench Pinouts #3 (Innova 2.0L 1TR-FE)',
    keyBenchPins:
      'Constant Power (+B): A1, A2 | Switched Ignition (IGSW): A18 | Ground (E1): A3, B1 | CAN Bus: A33 (H) / A34 (L) | Sensors & Actuators: NE+ (CKP): B11, G2+ (CMP): B12, VTA1 (TPS): B21, IGT1: B36.',
    bootOrPowerRule:
      'WARNING: Always cross-check the exact Denso/Fujitsu Ten part number on the ECU case and verify ground continuity with a multimeter before applying +12V bench power. Connect +B to A1 and A2, IGSW to A18, Ground E1 to A3 and B1, CANH to A33, CANL to A34, NE+ CKP to B11, G2+ CMP to B12, VTA1 TPS to B21, and IGT1 to B36.',
    dlcProtocol: 'ISO 15765-4 CAN (ECU Pins A33 CANH / A34 CANL · OBD-II Pins 6 & 14)',
    voicePrompt:
      'For the Toyota Innova 2.0L 1TR-FE VVT-i Gasoline Denso ECU: constant power +B connects to A1 and A2, switched ignition IGSW to A18, ground E1 to A3 and B1, CAN High to A33, CAN Low to A34, NE+ CKP to B11, G2+ CMP to B12, VTA1 TPS to B21, and IGT1 to B36.',
  },
  {
    id: 'guide-toyota-hiace-1gd',
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    ecuName: 'Hiace Commuter / GL Grandia (2.8L 1GD-FTV, Denso)',
    status: 'VERIFIED',
    linkedProfileId: 'toyota-denso-175822',
    models: [
      'Hiace Commuter / GL Grandia (2.8L 1GD-FTV)',
      'Hiace Commuter Deluxe (2.8L 1GD-FTV)',
      'Hiace GL Grandia / Super Grandia (2.8L 1GD-FTV)',
    ],
    tableRef: 'Toyota OEM Bench Pinouts #4 (Hiace 2.8L 1GD-FTV)',
    keyBenchPins:
      'Constant Power (+B / +B2): A1, A2 | Switched Ignition (IGSW): A28 | Ground (E1): A3, A4, B1 | CAN Bus: A41 (H) / A42 (L) | Sensors & Actuators: NE+ (CKP): B14, G2+ (CMP): B15, PCR1 (FRP): B32, EGR PWM: B54.',
    bootOrPowerRule:
      'WARNING: Always cross-check the exact Denso/Fujitsu Ten part number on the ECU case and verify ground continuity with a multimeter before applying +12V bench power. Connect +B/+B2 to A1 and A2, IGSW to A28, Ground E1 to A3, A4, and B1, CANH to A41, CANL to A42, NE+ CKP to B14, G2+ CMP to B15, PCR1 FRP to B32, and EGR PWM to B54.',
    dlcProtocol: 'High-Speed CAN ISO 15765-4 (ECU Pins A41 CANH / A42 CANL · OBD-II Pins 6 & 14)',
    voicePrompt:
      'For the Toyota Hiace Commuter and GL Grandia 2.8L 1GD-FTV Denso ECU: constant power +B goes to A1 and A2, switched ignition IGSW to A28, ground E1 to A3, A4, and B1, CAN High to A41, CAN Low to A42, NE+ CKP to B14, G2+ CMP to B15, PCR1 FRP to B32, and EGR PWM to B54.',
  },
  {
    id: 'guide-toyota-1nz-2nz-vios',
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    ecuName: 'Vios / Yaris (1.5L 1NZ-FE & 1.3L 2NZ-FE, Denso)',
    status: 'VERIFIED',
    linkedProfileId: 'toyota-denso-175822',
    models: ['Vios / Yaris (1.5L 1NZ-FE & 1.3L 2NZ-FE)', 'Vios (1NZ-FE / 2NZ-FE)', 'Yaris (1NZ-FE)'],
    tableRef: 'Toyota OEM Bench Pinouts #5 (Vios/Yaris 1NZ-FE & 2NZ-FE)',
    keyBenchPins:
      'Constant Power (+B / BATT): A1, A2 | Switched Ignition (IGSW): A15 | Ground (E1): A3, B1 | CAN Bus: A27 (H) / A28 (L) | Sensors & Actuators: NE+ (CKP): B10, G2+ (CMP): B11, VTA1 (TPS): B19, IGT1: B32.',
    bootOrPowerRule:
      'WARNING: Always cross-check the exact Denso/Fujitsu Ten part number on the ECU case and verify ground continuity with a multimeter before applying +12V bench power. Connect +B/BATT to A1 and A2, IGSW to A15, Ground E1 to A3 and B1, CANH to A27, CANL to A28, NE+ CKP to B10, G2+ CMP to B11, VTA1 TPS to B19, and IGT1 to B32.',
    dlcProtocol: 'ISO 15765-4 CAN (ECU Pins A27 CANH / A28 CANL · OBD-II Pins 6 & 14) / Pin 7 SIL on early Gen-1',
    voicePrompt:
      'For the Toyota Vios and Yaris 1.5L 1NZ-FE and 1.3L 2NZ-FE Denso ECU: constant power +B and BATT goes to A1 and A2, switched ignition IGSW to A15, ground E1 to A3 and B1, CAN High to A27, CAN Low to A28, NE+ CKP to B10, G2+ CMP to B11, VTA1 TPS to B19, and IGT1 to B32.',
  },
  {
    id: 'guide-toyota-2nr-1nr-vios',
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    ecuName: 'Vios / Yaris (1.5L 2NR-FE & 1.3L 1NR-FE Dual VVT-i, Denso)',
    status: 'VERIFIED',
    linkedProfileId: 'toyota-denso-175822',
    models: [
      'Vios / Yaris (1.5L 2NR-FE & 1.3L 1NR-FE Dual VVT-i)',
      'Vios (1NR-FE / 2NR-FE)',
      'Yaris (1NR-FE / 2NR-FE)',
    ],
    tableRef: 'Toyota OEM Bench Pinouts #6 (Vios/Yaris 2NR-FE & 1NR-FE)',
    keyBenchPins:
      'Constant Power (+B / BATT): A1, A2 | Switched Ignition (IGSW): A21 | Ground (E1): A3, A4, B1 | CAN Bus: A37 (H) / A38 (L) | Sensors & Actuators: NE+ (CKP): B12, G2+ (CMP): B13, VTA1 (TPS): B24, IGT1: B40.',
    bootOrPowerRule:
      'WARNING: Always cross-check the exact Denso/Fujitsu Ten part number on the ECU case and verify ground continuity with a multimeter before applying +12V bench power. Connect +B/BATT to A1 and A2, IGSW to A21, Ground E1 to A3, A4, and B1, CANH to A37, CANL to A38, NE+ CKP to B12, G2+ CMP to B13, VTA1 TPS to B24, and IGT1 to B40.',
    dlcProtocol: 'SAE J1962 OBD-II CAN (ECU Pins A37 CANH / A38 CANL · OBD-II Pins 6 & 14)',
    voicePrompt:
      'For the Toyota Vios and Yaris 1.5L 2NR-FE and 1.3L 1NR-FE Dual VVT-i Denso ECU: constant power +B and BATT goes to A1 and A2, switched ignition IGSW to A21, ground E1 to A3, A4, and B1, CAN High to A37, CAN Low to A38, NE+ CKP to B12, G2+ CMP to B13, VTA1 TPS to B24, and IGT1 to B40.',
  },
  {
    id: 'guide-toyota-1kr-wigo',
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    ecuName: 'Wigo / Agya (1.0L 1KR-FE / 1KR-VE, Denso)',
    status: 'VERIFIED',
    linkedProfileId: 'toyota-denso-175822',
    models: ['Wigo / Agya (1.0L 1KR-FE / 1KR-VE)', 'Wigo (1KR-FE)', 'Agya (1KR-FE / 1KR-VE)'],
    tableRef: 'Toyota OEM Bench Pinouts #7 (Wigo/Agya 1.0L 1KR-FE / 1KR-VE)',
    keyBenchPins:
      'Constant Power (+B / BATT): A1, A2 | Switched Ignition (IGSW): A12 | Ground (E1): A3, B1 | CAN Bus: A22 (H) / A23 (L) | Sensors & Actuators: NE+ (CKP): B8, G2+ (CMP): B9, PIM (MAP): B16, IGT1: B28.',
    bootOrPowerRule:
      'WARNING: Always cross-check the exact Denso/Fujitsu Ten part number on the ECU case and verify ground continuity with a multimeter before applying +12V bench power. Connect +B/BATT to A1 and A2, IGSW to A12, Ground E1 to A3 and B1, CANH to A22, CANL to A23, NE+ CKP to B8, G2+ CMP to B9, PIM MAP to B16, and IGT1 to B28.',
    ocrVerifyGate:
      '⚠️ WARNING: Pinout Verification & Polarity — Cross-check the exact Denso/Fujitsu Ten part number on the 1KR-FE / 1KR-VE ECU case and verify ground continuity on A3, B1 before applying +12V bench power.',
    dlcProtocol: 'OBD-II Pin 6/14 ISO 15765-4 CAN (ECU Pins A22 CANH / A23 CANL · 500 kbps)',
    voicePrompt:
      'For the Toyota Wigo and Agya 1.0L 1KR-FE and 1KR-VE Denso ECU: constant power +B and BATT goes to A1 and A2, switched ignition IGSW to A12, ground E1 to A3 and B1, CAN High to A22, CAN Low to A23, NE+ CKP to B8, G2+ CMP to B9, PIM MAP to B16, and IGT1 to B28. Warning: cross-check the Denso or Fujitsu Ten part number and verify ground continuity before applying 12 volts.',
  },
  {
    id: 'guide-toyota-avanza-rush-nrve',
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    ecuName: 'Avanza / Rush (1.5L 2NR-VE & 1.3L 1NR-VE, Denso)',
    status: 'VERIFIED',
    linkedProfileId: 'toyota-denso-175822',
    models: ['Avanza / Rush (1.5L 2NR-VE & 1.3L 1NR-VE)', 'Avanza (1NR-VE / 2NR-VE)', 'Rush (1.5L 2NR-VE)'],
    tableRef: 'Toyota OEM Bench Pinouts #8 (Avanza/Rush 2NR-VE & 1NR-VE)',
    keyBenchPins:
      'Constant Power (+B / BATT): A1, A2 | Switched Ignition (IGSW): A19 | Ground (E1): A3, B1 | CAN Bus: A31 (H) / A32 (L) | Sensors & Actuators: NE+ (CKP): B11, G2+ (CMP): B12, PIM (MAP): B20, IGT1: B35.',
    bootOrPowerRule:
      'WARNING: Always cross-check the exact Denso/Fujitsu Ten part number on the ECU case and verify ground continuity with a multimeter before applying +12V bench power. Connect +B/BATT to A1 and A2, IGSW to A19, Ground E1 to A3 and B1, CANH to A31, CANL to A32, NE+ CKP to B11, G2+ CMP to B12, PIM MAP to B20, and IGT1 to B35.',
    dlcProtocol: 'OBD-II ISO 15765-4 CAN (ECU Pins A31 CANH / A32 CANL · OBD-II Pins 6 & 14)',
    voicePrompt:
      'For the Toyota Avanza and Rush 1.5L 2NR-VE and 1.3L 1NR-VE Denso ECU: constant power +B and BATT goes to A1 and A2, switched ignition IGSW to A19, ground E1 to A3 and B1, CAN High to A31, CAN Low to A32, NE+ CKP to B11, G2+ CMP to B12, PIM MAP to B20, and IGT1 to B35.',
  },
  {
    id: 'guide-toyota-altis-1zr-2zr',
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    ecuName: 'Corolla Altis (1.6L 1ZR-FE & 1.8L 2ZR-FE Dual VVT-i, Denso)',
    status: 'VERIFIED',
    linkedProfileId: 'toyota-denso-175822',
    models: ['Corolla Altis (1.6L 1ZR-FE & 1.8L 2ZR-FE Dual VVT-i)', 'Corolla Altis (1ZR-FE / 2ZR-FE)', 'Altis'],
    tableRef: 'Toyota OEM Bench Pinouts #9 (Corolla Altis 1ZR-FE & 2ZR-FE)',
    keyBenchPins:
      'Constant Power (+B / +B2): A1, A2 | Switched Ignition (IGSW): A24 | Ground (E1): A3, A4, B1 | CAN Bus: A39 (H) / A40 (L) | Sensors & Actuators: NE+ (CKP): B13, G2+ (CMP): B14, VG (MAF): B22, IGT1: B42.',
    bootOrPowerRule:
      'WARNING: Always cross-check the exact Denso/Fujitsu Ten part number on the ECU case and verify ground continuity with a multimeter before applying +12V bench power. Connect +B/+B2 to A1 and A2, IGSW to A24, Ground E1 to A3, A4, and B1, CANH to A39, CANL to A40, NE+ CKP to B13, G2+ CMP to B14, VG MAF to B22, and IGT1 to B42.',
    dlcProtocol: 'OBD-II ISO 15765-4 CAN (ECU Pins A39 CANH / A40 CANL · OBD-II Pins 6 & 14)',
    voicePrompt:
      'For the Toyota Corolla Altis 1.6L 1ZR-FE and 1.8L 2ZR-FE Dual VVT-i Denso ECU: constant power +B and +B2 goes to A1 and A2, switched ignition IGSW to A24, ground E1 to A3, A4, and B1, CAN High to A39, CAN Low to A40, NE+ CKP to B13, G2+ CMP to B14, VG MAF to B22, and IGT1 to B42.',
  },
  {
    id: 'guide-toyota-ac60-6at-tcm',
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    ecuName: 'Fortuner / Hilux 6AT TCM (Aisin AC60E / AC60F)',
    status: 'VERIFIED',
    linkedProfileId: 'toyota-denso-175822',
    models: ['Fortuner / Hilux 6AT TCM (Aisin AC60E / AC60F)', 'Fortuner 6AT TCM (AC60)', 'Hilux 6AT TCM (AC60)'],
    tableRef: 'Toyota OEM Bench Pinouts #10 (Fortuner/Hilux 6AT TCM AC60E/AC60F)',
    keyBenchPins:
      'Constant Power (+B): Pin 1, Pin 2 | Switched Ignition (IG): Pin 11 | Ground (E1): Pin 15, Pin 16 | CAN Bus: Pin 21 (H) / Pin 22 (L) | Sensors & Actuators: NT (Input Spd): Pin 5, SP2 (Output Spd): Pin 6, SL1: Pin 12.',
    bootOrPowerRule:
      'WARNING: Always cross-check the exact Aisin/Denso/Fujitsu Ten part number on the TCM case and verify ground continuity on Pins 15 and 16 with a multimeter before applying +12V bench power. Connect +B to Pin 1 and Pin 2, IG to Pin 11, Ground E1 to Pin 15 and Pin 16, CANH to Pin 21, CANL to Pin 22, NT Input Speed to Pin 5, SP2 Output Speed to Pin 6, and SL1 Solenoid to Pin 12.',
    dlcProtocol: 'High-Speed CAN ISO 15765-4 (TCM Pins 21 CANH / 22 CANL · OBD-II Pins 6 & 14)',
    voicePrompt:
      'For the Toyota Fortuner and Hilux 6AT TCM Aisin AC60E and AC60F: constant power +B connects to Pin 1 and Pin 2, switched ignition IG to Pin 11, ground E1 to Pin 15 and Pin 16, CAN High to Pin 21, CAN Low to Pin 22, NT input speed sensor to Pin 5, SP2 output speed sensor to Pin 6, and SL1 shift solenoid to Pin 12.',
  },
  {
    id: 'guide-honda-r18a2-fn2',
    brandKey: 'honda',
    brandLabel: 'Honda',
    ecuName: 'Honda Keihin R18A2 / FN2 (Connectors A / B / C)',
    status: 'OCR_VERIFY',
    linkedProfileId: 'honda-keihin-pgmfi',
    models: ['Civic (R18A2 / FN2)'],
    tableRef: 'Tables 11A–11B',
    keyBenchPins: 'Connectors A/B/C; mandatory verification required prior to probing Pin A16 and Pins B37–B39 / C37.',
    bootOrPowerRule: 'Verify exact Keihin/Honda R18A2 vs FN2 Type-R harness revision on case label before energizing power/sensor buses.',
    ocrVerifyGate: 'OCR_VERIFY REQUIRED: Verify physical ECU part number and harness continuity before probing Honda A16 and B37–B39 / C37.',
    dlcProtocol: 'Honda CAN Pins 6/14 & K-Line Pin 7 (F-CAN / K-Line)',
    voicePrompt: 'Honda R18A2 and FN2 alert: confirm physical ECU part number and harness continuity before probing pins A16, B37 through B39, or C37.',
  },
  {
    id: 'guide-honda-obd2a',
    brandKey: 'honda',
    brandLabel: 'Honda',
    ecuName: 'Honda OBD2A PGM-FI ECU',
    status: 'VERIFIED',
    linkedProfileId: 'honda-keihin-pgmfi',
    models: ['Civic (OBD2A Legacy)'],
    tableRef: 'Table 11A / 11B & Table 16',
    keyBenchPins: 'OBD2A multi-plug A/C/D layout: logic/power grounds, VBAT constant +12V, IG1 switched ignition, Main Relay PGM-FI feed, and K-Line / SCS service check.',
    bootOrPowerRule: 'Bond logic and power grounds cleanly before powering IG1; use 3-pin / 5-pin legacy DLC K-Line & SCS short jumper for flash codes.',
    dlcProtocol: 'Honda 3-Pin / 5-Pin Legacy DLC (K-Line + SCS) / OBD2 Pin 7',
    voicePrompt: 'Honda OBD2A ECU: bond main logic grounds, apply VBAT and IG1 12 volts, and read diagnostics on the Honda K-Line and SCS connector.',
  },
  {
    id: 'guide-nissan-d40',
    brandKey: 'nissan',
    brandLabel: 'Nissan',
    ecuName: 'Nissan Navara D40 YD25DDTi Denso ECM (2007–2009 vs. 2010+)',
    status: 'OCR_VERIFY',
    linkedProfileId: 'nissan-hitachi-mec11',
    models: ['Navara D40 (YD25DDTi)'],
    tableRef: 'Table 12A',
    keyBenchPins: 'Critical Pins 105, 107, 108 power/relay allocation differs between 2007–2009 and 2010+ D40 YD25DDTi ECM revisions.',
    bootOrPowerRule: 'Inspect physical ECM aluminum label and measure resistance from Pins 105/107/108 to ground before applying +12V bench power.',
    ocrVerifyGate: 'OCR_VERIFY REQUIRED: Verify physical ECU part number (2007–2009 vs. 2010+) and harness continuity before energizing Nissan D40 Pins 105, 107, or 108.',
    dlcProtocol: 'Nissan CAN (OBD-II Pins 6 & 14) / Legacy K-Line check',
    voicePrompt: 'Nissan D40 YD25DDTi alert: verify physical ECU part number for 2007 to 2009 versus 2010 revision and check harness continuity before energizing pins 105, 107, or 108.',
  },
  {
    id: 'guide-nissan-qr25de',
    brandKey: 'nissan',
    brandLabel: 'Nissan',
    ecuName: 'Nissan QR25DE Hitachi ECM',
    status: 'VERIFIED',
    linkedProfileId: 'nissan-hitachi-mec11',
    models: ['X-Trail / Teana (QR25DE)'],
    tableRef: 'Table 12B',
    keyBenchPins: '121-pin Hitachi chamber A/B layout: constant +BATT, switched IGN, ECM relay self-shutoff, chassis grounds, and OBD2 K-Line / CAN.',
    bootOrPowerRule: 'Never use ECM sensor ground pins as probe reference for high-current +12V tests; always reference chassis battery negative.',
    dlcProtocol: 'OBD-II CAN Pins 6/14 (late QR25DE) or ISO-9141 Pin 7 (early)',
    voicePrompt: 'Nissan QR25DE Hitachi bench test: verify constant battery, switched ignition, chassis grounds, and never use ECM sensor ground to probe battery circuits.',
  },
  {
    id: 'guide-nissan-d23-edc17c84',
    brandKey: 'nissan',
    brandLabel: 'Nissan / Bosch',
    ecuName: 'Nissan Navara D23 / Terra YS23DDTT (Bosch EDC17C84 / TC1782)',
    status: 'OCR_VERIFY',
    linkedProfileId: 'nissan-bosch-edc17c84',
    models: ['Navara D23 / NP300 (YS23DDTT EDC17C84)', 'Terra (YS23DDTT EDC17C84)'],
    tableRef: 'Bench Service Mode GPT Rev A/B (AI-Inferred Reference)',
    keyBenchPins: 'Q4 (+12V KL30), D1 (+12V KL15), H4 (Ground KL31 + Case Bond), A1/A2 (CAN-H/L), and GPT1/GPT2 pair M2/K3 (Rev A) or F4/G4 (Rev B).',
    bootOrPowerRule: 'Confirm exact Bosch 0281xxxxxx hardware revision on aluminum housing before wiring GPT1/GPT2 channels.',
    ocrVerifyGate: 'OCR_VERIFY REQUIRED (AI-Inferred Reference): Verify Bosch EDC17C84 part number, case ground H4 continuity, and GPT revision (M2/K3 vs F4/G4) before energizing.',
    dlcProtocol: 'High-Speed CAN ISO 15765-4 (OBD-II Pins 6 & 14 · 500 kbps)',
    voicePrompt: 'Nissan Navara D23 and Terra Bosch EDC17C84 alert: verify physical Bosch part number and whether your unit uses GPT pair M2 and K3 or F4 and G4 before energizing Q4, D1, and H4.',
  },
  {
    id: 'guide-mitsubishi-4d56-4m41',
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    ecuName: 'Mitsubishi Denso SH7058 / SH72543 (4D56 / 4M41 121-Pin A/B & Ep7)',
    status: 'VERIFIED',
    linkedProfileId: 'mitsubishi-denso-diesel',
    models: ['Montero Sport (4D56 / 4M41)', 'Strada / L200 (4D56 DI-D)', 'Pajero (4M41 DI-D)', 'L300 Euro-4 (4N14)'],
    tableRef: 'Tables 13A–13B',
    keyBenchPins: '121-pin Connectors A & B + Ep7 bench/boot pin assignment; main power ground, permanent +BATT, switched IG1, CAN-H / CAN-L (60Ω terminated).',
    bootOrPowerRule: 'Follow Ep7 bench/boot sequence: verify stable 12.6V bench PSU before applying boot/watchdog clock signals during SH7058/SH72543 read.',
    dlcProtocol: 'OBD-II CAN (Pins 6 & 14) + MUT-II/III Pin 1 / Pin 7 where equipped',
    voicePrompt: 'Mitsubishi 4D56 and 4M41 121-pin A and B with Ep7 protocol: bond engine grounds, apply constant 12V and IG1, terminate CAN with 120 Ohms, and verify Ep7 sequence.',
  },
  {
    id: 'guide-mitsubishi-4n15',
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    ecuName: 'Mitsubishi 4N15 2.4L MIVEC Denso (SH72543R — Main Relay Self-Hold Loop)',
    status: 'OCR_VERIFY',
    linkedProfileId: 'mitsubishi-denso-diesel',
    models: ['Montero Sport (2.4L 4N15 MIVEC)', 'Strada / L200 (2.4L 4N15 MIVEC)'],
    tableRef: '4N15 MIVEC Denso Variant (AI-Inferred Reference)',
    keyBenchPins: '101/102/103 (BAT1/BAT2/BACK), 104 (IGN), 118 (C/R Main Relay Low-Side -> feeds I/B2 Pin 25), 145 (SGND), 108/109 (CAN-H/L).',
    bootOrPowerRule: '4N15 requires BAT1/BAT2/BACK + IGN and a closed Main Relay loop (Pin 118 sinking Coil 85 to feed Pin 25 I/B2) for injector bank power.',
    ocrVerifyGate: 'OCR_VERIFY REQUIRED (AI-Inferred Reference): Confirm Denso 275700-7422 / 1860C711 case P/N and ground continuity on Pin 145 before energizing Pins 101–104.',
    dlcProtocol: 'High-Speed CAN ISO 15765-4 (ECU Pins 108 CAN-H / 109 CAN-L · OBD-II Pins 6 & 14)',
    voicePrompt: 'Mitsubishi 4N15 2.4L MIVEC alert: confirm the Denso case part number and ground on Pin 145 before energizing BAT1, BAT2, BACK, and IGN, and close the Main Relay loop from Pin 118 to Pin 25.',
  },
  {
    id: 'guide-isuzu-4hk1',
    brandKey: 'isuzu',
    brandLabel: 'Isuzu',
    ecuName: 'Isuzu Transtron 4HK1 ECM (12V vs. 24V Dual-Voltage Caution)',
    status: 'OCR_VERIFY',
    linkedProfileId: 'isuzu-transtron-4jj1',
    models: ['NHR / NKR / NPR / NQR Trucks (4HK1)'],
    tableRef: 'Section 2 Isuzu 4HK1 Voltage Gate',
    keyBenchPins: 'Main Relay feed, +BATT, IGN_SW, Chassis GND, CAN-H / CAN-L — strictly confirm 12V light-duty vs. 24V commercial chassis spec.',
    bootOrPowerRule: 'DO NOT set Bench Power Supply to 24V until the physical Transtron ECU part number confirms a 24V commercial rating.',
    ocrVerifyGate: 'OCR_VERIFY REQUIRED: Confirm 12V vs. 24V ECU hardware voltage rating on the Isuzu 4HK1 part number label before energizing the Bench Power Supply.',
    dlcProtocol: 'J1962 OBD-II CAN (Pins 6 & 14) / J1939 Heavy-Duty Bridge',
    voicePrompt: 'Isuzu 4HK1 critical alert: confirm whether this ECU is 12 volt or 24 volt from the physical part number before energizing power.',
  },
  {
    id: 'guide-suzuki-f6a-m16-j20',
    brandKey: 'suzuki',
    brandLabel: 'Suzuki',
    ecuName: 'Suzuki Legacy F6A (A/T / ECT) & M16A / J20A (Restricted from K15B)',
    status: 'OCR_VERIFY',
    linkedProfileId: null,
    models: ['F6A Kei / Multi-Cab (A/T / ECT)', 'Grand Vitara / SX4 (J20A / M16A)'],
    tableRef: 'Section 2 Suzuki Verified Legacy & Restriction Rule',
    keyBenchPins: 'Verified legacy F6A A/T/ECT & M16/J20 bench wakeup tables only; STRICTLY RESTRICTED from cross-application onto Suzuki K15B.',
    bootOrPowerRule: 'Confirm physical engine code and ECU connector before energizing. NEVER substitute M16/J20 or Delphi MT20U pinouts onto K15B.',
    ocrVerifyGate: 'RESTRICTION GATE: Suzuki M16/J20 pinouts are strictly prohibited on K15B (Jimny/Ertiga/XL7). Verify engine family before bench wiring.',
    dlcProtocol: 'Suzuki 6-Pin / 12-Pin SDL Legacy DLC & OBD-II K-Line/CAN',
    voicePrompt: 'Suzuki verified legacy note: F6A, M16, and J20 are verified only for their matching harnesses and strictly restricted from Suzuki K15B models.',
  },
  {
    id: 'guide-hyundai-accent-cpeg',
    brandKey: 'hyundai-kia',
    brandLabel: 'Hyundai & Kia',
    ecuName: 'Hyundai 2014 Accent [EGGA-AG]/[EGGA-KG], CPEGP2.10.1, CPEGD2 & G4-J (39110-24550)',
    status: 'VERIFIED',
    linkedProfileId: 'hyundai-kia-edc16c39',
    models: ['Accent 2014 ([EGGA-AG] / [EGGA-KG])', 'Soluto / Reina (CPEGD2 / CPEGP2.10.1 Bench)', 'G4-J (39110-24550)'],
    tableRef: 'Tables 14A–14C',
    keyBenchPins: 'Bench power/GND/IG15/CAN pins per Tables 14A–14C for [EGGA-AG]/[EGGA-KG], CPEGP2.10.1, CPEGD2, and 39110-24550 G4-J controllers.',
    bootOrPowerRule: 'Verify exact ECU code ([EGGA-AG] vs [EGGA-KG], CPEGP2.10.1, CPEGD2, or 39110-24550) and supply clean 12.6V bench voltage with 60Ω CAN termination.',
    dlcProtocol: 'OBD-II CAN Pins 6 & 14 + K-Line Pin 7 (legacy diagnostics)',
    voicePrompt: 'Hyundai verified bench group covers 2014 Accent EGGA-AG and EGGA-KG, CPEGP2.10.1, CPEGD2, and G4-J 39110-24550 per Tables 14A through 14C.',
  },
  {
    id: 'guide-ford-sid209',
    brandKey: 'ford',
    brandLabel: 'Ford',
    ecuName: 'Ford FoMoCo Continental SID209 (A/B/C Grid & Boot Protocol)',
    status: 'VERIFIED',
    linkedProfileId: 'ford-fomoco-sid208',
    models: ['Ranger (SID209 Euro-5 / 2.2L / 3.2L)', 'Everest (SID209)'],
    tableRef: 'Table 15',
    keyBenchPins: 'Triple-chamber Connector A / B / C grid (50P / 54P / 50P): Grounds, KL30 Battery, KL15 Ignition, HS-CAN (6/14), and TC1797 Boot Pad.',
    bootOrPowerRule: 'Bench unlock & full EEPROM/Flash read requires TriCore TC1797 boot resistor/GPT clock protocol per Table 15 (do not apply 18V FEPS to HS-CAN SID209).',
    dlcProtocol: 'Ford HS-CAN (OBD-II Pins 6 & 14) + MS-CAN (Pins 3 & 11)',
    voicePrompt: 'Ford SID209 per Table 15 uses triple-chamber A, B, and C connectors with TriCore TC1797 boot protocol and High-Speed CAN on pins 6 and 14.',
  },
  {
    id: 'guide-ford-ranger-everest-t6',
    brandKey: 'ford',
    brandLabel: 'Ford',
    ecuName: 'Ford Ranger & Everest T6 PCM (C1E Connector)',
    status: 'VERIFIED',
    linkedProfileId: 'ford-fomoco-sid208',
    models: ['Ranger T6', 'Everest T6', 'Ranger & Everest T6'],
    tableRef: 'Ford OEM Pinouts (T6 C1E)',
    keyBenchPins: 'Power (+12V): Pin C1E148 | Switched Ignition (+12V): Pin C1E142 | Grounds (0V): Pins C1E139 and C1E140.',
    bootOrPowerRule: 'For the Ranger and Everest T6, connect constant power to Pin C1E148, switched ignition to Pin C1E142, and grounds to Pins C1E139 and C1E140.',
    dlcProtocol: 'Ford HS-CAN (OBD-II Pins 6 & 14) + MS-CAN (Pins 3 & 11)',
    voicePrompt: 'For the Ford Ranger and Everest T6, power goes to Pin C1E148, switched ignition to Pin C1E142, and grounds to Pins C1E139 and C1E140.',
  },
  {
    id: 'guide-ford-nextgen-ecoblue',
    brandKey: 'ford',
    brandLabel: 'Ford',
    ecuName: 'Ford Next-Gen Ranger & Everest 2.0L EcoBlue PCM (CBR Connector)',
    status: 'VERIFIED',
    linkedProfileId: 'ford-fomoco-sid208',
    models: ['Next-Gen Ranger EcoBlue', 'Next-Gen Everest EcoBlue', 'Next-Gen Ranger & Everest EcoBlue'],
    tableRef: 'Ford OEM Pinouts (EcoBlue CBR)',
    keyBenchPins: 'Constant Power (+12V): CBR Pin 1 | Switched Ignition (+12V): CBR Pin 3 | Grounds (0V): CBR Pins 2 and 4.',
    bootOrPowerRule: 'For the Next-Gen Ranger and Everest EcoBlue, constant power connects to CBR pin 1, ignition to CBR pin 3, and grounds to CBR pins 2 and 4.',
    dlcProtocol: 'Ford HS-CAN / FD-CAN (OBD-II Pins 6 & 14)',
    voicePrompt: 'For the Next-Gen Ranger and Everest EcoBlue, constant power connects to Pin CBR pin 1, ignition to CBR pin 3, and grounds to CBR pins 2 and 4.',
  },
  {
    id: 'guide-ford-ecosport-fiesta-15l',
    brandKey: 'ford',
    brandLabel: 'Ford',
    ecuName: 'Ford EcoSport & Fiesta 1.5L Ti-VCT EMS / PCM',
    status: 'VERIFIED',
    linkedProfileId: 'ford-fomoco-sid208',
    models: ['EcoSport 1.5L', 'Fiesta 1.5L', 'EcoSport & Fiesta 1.5L'],
    tableRef: 'Ford OEM Pinouts (EcoSport/Fiesta 1.5L)',
    keyBenchPins: 'Power (+12V): Pin 1 | Switched Ignition (+12V): Pin 2 | Grounds (0V): Pins 3 and 4.',
    bootOrPowerRule: 'For the EcoSport and Fiesta 1.5L, connect power to Pin 1, ignition to Pin 2, and ground to Pins 3 and 4.',
    dlcProtocol: 'Ford HS-CAN (OBD-II Pins 6 & 14) + MS-CAN (Pins 3 & 11)',
    voicePrompt: 'For the Ford EcoSport and Fiesta 1.5L, connect power to Pin 1, ignition to Pin 2, and ground to Pins 3 and 4.',
  },
  {
    id: 'guide-ford-focus-ecosport-gdi',
    brandKey: 'ford',
    brandLabel: 'Ford',
    ecuName: 'Ford Focus & EcoSport GDI Direct Injection PCM',
    status: 'VERIFIED',
    linkedProfileId: 'ford-fomoco-sid208',
    models: ['Focus GDI', 'EcoSport GDI', 'Focus & EcoSport GDI'],
    tableRef: 'Ford OEM Pinouts (Focus/EcoSport GDI)',
    keyBenchPins: 'Power (+12V): Pin 61 | Switched Ignition (+12V): Pin 16 | Ground (0V): Pin 32.',
    bootOrPowerRule: 'The Focus and EcoSport GDI require power on Pin 61, ignition on Pin 16, and ground on Pin 32.',
    dlcProtocol: 'Ford HS-CAN (OBD-II Pins 6 & 14) + MS-CAN (Pins 3 & 11)',
    voicePrompt: 'The Ford Focus and EcoSport GDI require power on Pin 61, ignition on Pin 16, and ground on Pin 32.',
  },
  {
    id: 'guide-ford-powershift-tcm',
    brandKey: 'ford',
    brandLabel: 'Ford',
    ecuName: 'Ford PowerShift TCM (6DCT250 Dual-Clutch Transmission Control Module)',
    status: 'VERIFIED',
    linkedProfileId: 'ford-fomoco-sid208',
    models: ['PowerShift TCM (EcoSport / Fiesta / Focus 6DCT250)', 'PowerShift TCM'],
    tableRef: 'Ford OEM Pinouts (PowerShift TCM)',
    keyBenchPins: 'Power (+12V): Pins 1 and 2 | Switched Ignition (+12V): Pin 3 | Grounds (0V): Pins 4 and 5.',
    bootOrPowerRule: 'For the PowerShift TCM, power is applied to Pins 1 and 2, ignition to Pin 3, and grounds to Pins 4 and 5.',
    dlcProtocol: 'Ford HS-CAN (OBD-II Pins 6 & 14, 500 kbps)',
    voicePrompt: 'For the Ford PowerShift TCM, power is applied to Pins 1 and 2, ignition to Pin 3, and grounds to Pins 4 and 5.',
  },
  {
    id: 'guide-ford-territory-ecoboost',
    brandKey: 'ford',
    brandLabel: 'Ford',
    ecuName: 'Ford Territory 1.5L EcoBoost PCM / EMS',
    status: 'VERIFIED',
    linkedProfileId: 'ford-fomoco-sid208',
    models: ['Territory 1.5L EcoBoost', 'Territory (PH)'],
    tableRef: 'Ford OEM Pinouts (Territory 1.5L EcoBoost)',
    keyBenchPins: 'Power (+12V): Pin 8 | Switched Ignition (+12V): Pin 9 | Grounds (0V): Pins 10 and 11.',
    bootOrPowerRule: 'The Territory 1.5L EcoBoost uses Pin 8 for power, Pin 9 for ignition, and Pins 10 and 11 for ground.',
    dlcProtocol: 'OBD-II ISO 15765-4 HS-CAN (Pins 6 & 14)',
    voicePrompt: 'The Ford Territory 1.5L EcoBoost uses Pin 8 for power, Pin 9 for ignition, and Pins 10 and 11 for ground.',
  },
  {
    id: 'guide-ford-ranger-25na',
    brandKey: 'ford',
    brandLabel: 'Ford',
    ecuName: 'Ford Ranger 2.5L NA Petrol PCM',
    status: 'VERIFIED',
    linkedProfileId: 'ford-fomoco-sid208',
    models: ['Ranger 2.5L NA'],
    tableRef: 'Ford OEM Pinouts (Ranger 2.5L NA)',
    keyBenchPins: 'Power (+12V): Pin 1 | Switched Ignition (+12V): Pin 2 | Grounds (0V): Pins 3 and 4.',
    bootOrPowerRule: 'Connecting the Ranger 2.5L NA requires power on Pin 1, ignition on Pin 2, and ground on Pins 3 and 4.',
    dlcProtocol: 'Ford HS-CAN (OBD-II Pins 6 & 14)',
    voicePrompt: 'Connecting the Ford Ranger 2.5L NA requires power on Pin 1, ignition on Pin 2, and ground on Pins 3 and 4.',
  },
  {
    id: 'guide-ford-escape-focus-duratec',
    brandKey: 'ford',
    brandLabel: 'Ford',
    ecuName: 'Older Ford Escape, Focus & Duratec PCM',
    status: 'VERIFIED',
    linkedProfileId: 'ford-fomoco-sid208',
    models: ['Older Escape / Focus / Duratec', 'Escape Duratec', 'Focus Duratec'],
    tableRef: 'Ford OEM Pinouts (Escape/Focus Duratec)',
    keyBenchPins: 'Power (+12V): Pin 15 | Switched Ignition (+12V): Pin 6 | Ground (0V): Pin 61.',
    bootOrPowerRule: 'Older Escape, Focus, and Duratec models take power on Pin 15, ignition on Pin 6, and ground on Pin 61.',
    dlcProtocol: 'Ford HS-CAN (OBD-II Pins 6 & 14) / SAE J1850 PWM',
    voicePrompt: 'Older Ford Escape, Focus, and Duratec models take power on Pin 15, ignition on Pin 6, and ground on Pin 61.',
  },
  {
    id: 'guide-ford-explorer',
    brandKey: 'ford',
    brandLabel: 'Ford',
    ecuName: 'Ford Explorer PCM',
    status: 'VERIFIED',
    linkedProfileId: 'ford-fomoco-sid208',
    models: ['Explorer', 'Ford Explorer'],
    tableRef: 'Ford OEM Pinouts (Explorer)',
    keyBenchPins: 'Power (+12V): Pin 103 | Switched Ignition (+12V): Pin 105 | Ground (0V): Pin 116.',
    bootOrPowerRule: 'For the Explorer, power goes to Pin 103, ignition to Pin 105, and ground to Pin 116.',
    dlcProtocol: 'Ford HS-CAN (OBD-II Pins 6 & 14) + MS-CAN (Pins 3 & 11)',
    voicePrompt: 'For the Ford Explorer, power goes to Pin 103, ignition to Pin 105, and ground to Pin 116.',
  },
  {
    id: 'guide-ford-transit-22tdci',
    brandKey: 'ford',
    brandLabel: 'Ford',
    ecuName: 'Ford Transit 2.2L TDCi PCM',
    status: 'VERIFIED',
    linkedProfileId: 'ford-fomoco-sid208',
    models: ['Transit 2.2L TDCi', 'Ford Transit 2.2L TDCi'],
    tableRef: 'Ford OEM Pinouts (Transit 2.2L TDCi)',
    keyBenchPins: 'Power (+12V): Pin B20 | Switched Ignition (+12V): Pin B22 | Grounds (0V): Pins B23 and B24.',
    bootOrPowerRule: 'The Transit 2.2L TDCi needs power on Pin B20, ignition on Pin B22, and ground on Pins B23 and B24.',
    dlcProtocol: 'Ford HS-CAN (OBD-II Pins 6 & 14) + MS-CAN (Pins 3 & 11)',
    voicePrompt: 'The Ford Transit 2.2L TDCi needs power on Pin B20, ignition on Pin B22, and ground on Pins B23 and B24.',
  },
];

/**
 * Rule 2: Mandatory OCR_VERIFY & Hardware-Conflict Prompts
 */
export const OCR_VERIFY_RULES: OcrVerifyRule[] = [
  {
    id: 'gate-nissan-d40',
    matchTerms: ['d40', 'yd25', 'yd25ddti', 'navara', '105', '107', '108'],
    title: 'OCR_VERIFY: Nissan D40 YD25DDTi (2007–2009 vs. 2010+)',
    prompt: 'Verify the physical ECU part number and harness continuity BEFORE energizing Nissan D40 Pins 105, 107, or 108 (pinout differs between 2007–2009 and 2010+ revisions).',
    spokenAlert: 'Verification required before energizing Nissan D40 pins 105, 107, or 108. Confirm the physical ECU part number for 2007 to 2009 versus 2010 plus, and check harness continuity.',
  },
  {
    id: 'gate-toyota-1krfe',
    matchTerms: ['1kr', '1kr-fe', '1krfe', '1kr-ve', 'wigo', 'agya'],
    title: 'WARNING: Pinout Verification & Polarity — Toyota Wigo / Agya (1.0L 1KR-FE / 1KR-VE, Denso)',
    prompt:
      'Always cross-check the exact Denso/Fujitsu Ten part number on the ECU case and verify ground continuity with a multimeter before applying +12V bench power. Verified Wigo/Agya 1.0L 1KR-FE/1KR-VE Pins: +B/BATT: A1, A2 | IGSW: A12 | GND (E1): A3, B1 | CAN: A22 (H) / A23 (L) | NE+ (CKP): B8 | G2+ (CMP): B9 | PIM (MAP): B16 | IGT1: B28.',
    spokenAlert:
      'For the Toyota Wigo and Agya 1.0L 1KR-FE and 1KR-VE Denso ECU: constant power +B and BATT goes to A1 and A2, switched ignition IGSW to A12, ground E1 to A3 and B1, CAN High to A22, CAN Low to A23, NE+ CKP to B8, G2+ CMP to B9, PIM MAP to B16, and IGT1 to B28. Warning: always cross-check the Denso or Fujitsu Ten part number and verify ground continuity before applying 12 volts.',
  },
  {
    id: 'gate-toyota-1gdftv',
    matchTerms: ['1gd', '1gd-ftv', '1gdftv', '2gd', '2gd-ftv', 'i-art', 'iart'],
    title: 'WARNING: Pinout Verification & Polarity — Toyota 1GD-FTV / 2GD-FTV Denso ECM',
    prompt:
      'Always cross-check the exact Denso/Fujitsu Ten part number on the ECU case (and i-ART vs. non-i-ART spec) and verify ground continuity with a multimeter before applying +12V bench power. Verified 1GD/2GD Pins: +B/+B2: A1, A2 | IGSW: A28 | GND (E1/ME01): A3, A4, B1 | CAN: A41 (H) / A42 (L) | NE+ (CKP): B14 | G2+ (CMP): B15 | PCR1 (FRP): B32 | SCV+: B48 (Hilux/Fortuner/Innova) / EGR PWM: B54 (Hiace 1GD).',
    spokenAlert:
      'For the Toyota 2.8L 1GD-FTV and 2.4L 2GD-FTV Denso ECU: constant power +B goes to A1 and A2, switched ignition IGSW to A28, ground E1 and ME01 to A3, A4, and B1, CAN High to A41, CAN Low to A42, NE+ CKP to B14, G2+ CMP to B15, PCR1 FRP to B32, SCV+ to B48 on Hilux, Fortuner, and Innova, and EGR PWM to B54 on Hiace Commuter and GL Grandia. Warning: always cross-check the Denso part number and verify ground continuity before applying 12 volts.',
  },
  {
    id: 'gate-isuzu-4hk1',
    matchTerms: ['4hk1', '4hk', 'npr', 'nqr'],
    title: 'OCR_VERIFY: Isuzu 4HK1 12V vs. 24V System Check',
    prompt: 'Confirm 12V vs. 24V rating from the physical Isuzu 4HK1 ECU part number BEFORE adjusting Bench Power Supply voltage.',
    spokenAlert: 'Critical voltage check for Isuzu 4HK1. Confirm 12 volt versus 24 volt rating on the physical ECU label before energizing power.',
  },
  {
    id: 'gate-honda-a16-b37',
    matchTerms: ['r18a2', 'fn2', 'a16', 'b37', 'b38', 'b39', 'c37'],
    title: 'OCR_VERIFY: Honda R18A2 / FN2 Critical Cavities',
    prompt: 'Verify physical Honda ECU part number and harness continuity BEFORE probing Pin A16 and Pins B37–B39 / C37.',
    spokenAlert: 'Verification required before probing Honda A16 or B37 through B39 and C37. Confirm the physical ECU part number and harness continuity first.',
  },
  {
    id: 'gate-suzuki-k15b-restriction',
    matchTerms: ['k15b', 'm16', 'j20', 'jimny', 'ertiga', 'xl7', 's-presso', 'dzire', 'swift', 'celerio', 'apv'],
    title: 'RESTRICTION GATE: Suzuki K15B Isolation',
    prompt: 'Suzuki M16 / J20 pinouts are STRICTLY RESTRICTED from K15B platforms. Pin-by-pin factory wiring is unavailable for K15B / S-Presso / Ertiga / Jimny / Dzire / XL7 / Swift / Celerio / APV — never fabricate pin numbers.',
    spokenAlert: 'Suzuki restriction alert. Never apply M16 or J20 pinouts to Suzuki K15B models. K15B, Ertiga, and Jimny are restricted to metadata and DLC protocols only.',
  },
];

/**
 * Rule 3: Restricted / Publicly Unavailable OEM Schematics & Mechanical No-ECU Vehicles
 * (Strictly PART_METADATA_ONLY or MECHANICAL_NO_ECU — zero fabricated pin numbers).
 */
export const RESTRICTED_MODEL_DATABASE: RestrictedModelEntry[] = [
  // MG Cars — all 10 models (including hybrid / EV / TRQ-L platforms)
  ...([
    ['MG 3 (Hybrid+ / Petrol)', 'SAIC / Bosch / VCU Hybrid Metadata Only · OBD-II CAN / DoIP'],
    ['MG 4 EV (MSP EV)', 'SAIC VCU / BMS / PEB Traction Inverter (EV High-Voltage Safety)'],
    ['MG 5 (1.5L / GT)', 'SAIC / Bosch MED17 / EMS Metadata Only · ISO 15765 CAN'],
    ['MG ZS (1.5L / T)', 'SAIC EMS Metadata Only · OBD-II ISO 15765-4 CAN (500 kbps)'],
    ['MG ZS EV', 'SAIC VCU / BMS / MCU High-Voltage EV Platform (HV Lockout Required)'],
    ['MG HS (1.5T / PHEV)', 'SAIC / Bosch MED17 / PHEV Hybrid TRQ-L Control Metadata'],
    ['MG RX5', 'SAIC / Bosch Engine Management & TCM Metadata Only'],
    ['MG GT', 'SAIC / 1.5T GDI EMS Metadata Only · ISO 15765 CAN'],
    ['MG One (TRQ-L / Sigma)', 'SAIC Sigma Architecture / TRQ-L Powertrain Metadata Only'],
    ['MG Cyberster (EV)', 'SAIC Dual-Motor EV VCU / BMS / Inverter Architecture Metadata'],
  ] as const).map(([modelName, note], idx) => ({
    id: `mg-model-${idx + 1}`,
    brandKey: 'mg-cars',
    brandLabel: 'MG Cars',
    modelName,
    status: 'PART_METADATA_ONLY' as const,
    oemControllerNote: note,
    dlcProtocol: 'SAE J1962 OBD-II CAN Pins 6 & 14 (500 kbps) / DoIP Ethernet (EV/TRQ-L)',
    restrictionReason: 'Factory pin-by-pin ECU cavity table not in verified public technical record. Zero pin numbers fabricated.',
  })),

  // Hyundai PART_METADATA_ONLY models
  ...([
    'Stargazer',
    'Staria',
    'Creta',
    'Tucson',
    'Reina',
    'Eon',
    'Santa Fe',
    'Kona',
  ]).map((modelName, idx) => ({
    id: `hyundai-meta-${idx + 1}`,
    brandKey: 'hyundai-kia',
    brandLabel: 'Hyundai & Kia',
    modelName: `${modelName} (Metadata Only)`,
    status: 'PART_METADATA_ONLY' as const,
    oemControllerNote: 'Hyundai Kefico / Continental / Bosch EMS Metadata Only (verified pinout limited to Accent EGGA, CPEGP2.10.1, CPEGD2, G4-J 39110-24550 & EDC16C39)',
    dlcProtocol: 'OBD-II ISO 15765-4 CAN (Pins 6 & 14) / K-Line Pin 7 on legacy Eon',
    restrictionReason: 'No verified pin-by-pin cavity table ingested for this model trim; metadata & DLC protocol only.',
  })),

  // Ford PART_METADATA_ONLY models (Mustang & Expedition remain metadata-only; Ranger/Everest T6 & EcoBlue, EcoSport, Fiesta, Focus, PowerShift TCM, Territory, Escape/Duratec, Explorer, Transit 2.2L TDCi are now VERIFIED)
  ...([
    'Mustang',
    'Expedition',
  ]).map((modelName, idx) => ({
    id: `ford-meta-${idx + 1}`,
    brandKey: 'ford',
    brandLabel: 'Ford',
    modelName: `${modelName} (Metadata Only)`,
    status: 'PART_METADATA_ONLY' as const,
    oemControllerNote: 'FoMoCo PCM Metadata Only (verified pinouts available for Ranger/Everest T6 & EcoBlue, EcoSport/Fiesta 1.5L, Focus/EcoSport GDI, PowerShift TCM, Territory 1.5L EcoBoost, Ranger 2.5L NA, Escape/Focus Duratec, Explorer, and Transit 2.2L TDCi)',
    dlcProtocol: 'Ford HS-CAN (Pins 6 & 14) + MS-CAN (Pins 3 & 11)',
    restrictionReason: 'No verified pin-by-pin PCM cavity map ingested for this model; do not substitute other FoMoCo pins.',
  })),

  // Toyota PART_METADATA_ONLY models (Hilux/Fortuner/Innova 1GD/2GD, Hilux/Fortuner/Hiace 1KD/2KD, Innova 1TR-FE, Hiace 1GD-FTV, Vios/Yaris 1NZ/2NZ & 2NR/1NR, Wigo/Agya 1KR-FE/VE, Avanza/Rush 2NR-VE/1NR-VE, Corolla Altis 1ZR/2ZR, and Fortuner/Hilux 6AT TCM AC60 are now VERIFIED)
  ...([
    ['Raize (1.2L WA-VE / 1.0T 1KR-VET)', 'Daihatsu / Denso DNGA Controller Metadata Only (Do not mix with Wigo 1KR-FE)'],
  ] as const).map(([modelName, note], idx) => ({
    id: `toyota-meta-${idx + 1}`,
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    modelName,
    status: 'PART_METADATA_ONLY' as const,
    oemControllerNote: note,
    dlcProtocol: 'OBD-II ISO 15765 CAN (Pins 6 & 14)',
    restrictionReason: 'Factory pin-by-pin wiring table unavailable in retrieved record; stored as part metadata only.',
  })),

  // Mitsubishi PART_METADATA_ONLY + MECHANICAL_NO_ECU models
  {
    id: 'mitsubishi-xpander',
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    modelName: 'Xpander (4A91)',
    status: 'PART_METADATA_ONLY',
    oemControllerNote: 'Mitsubishi MIVEC 4A91 EMS Metadata Only',
    dlcProtocol: 'OBD-II CAN Pins 6 & 14',
    restrictionReason: 'Factory pin-by-pin cavity table unavailable; metadata and DLC only.',
  },
  {
    id: 'mitsubishi-mirage-3a92',
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    modelName: 'Mirage / G4 (3A92)',
    status: 'PART_METADATA_ONLY',
    oemControllerNote: 'Mitsubishi 3A92 1.2L MIVEC EMS Metadata Only',
    dlcProtocol: 'OBD-II CAN Pins 6 & 14',
    restrictionReason: 'Factory pin-by-pin cavity table unavailable; metadata and DLC only.',
  },
  {
    id: 'mitsubishi-xforce',
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    modelName: 'Xforce (4A91)',
    status: 'PART_METADATA_ONLY',
    oemControllerNote: 'Mitsubishi Xforce EMS Metadata Only',
    dlcProtocol: 'OBD-II CAN Pins 6 & 14',
    restrictionReason: 'Factory pin-by-pin cavity table unavailable; metadata and DLC only.',
  },
  {
    id: 'mitsubishi-l300-mech',
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    modelName: 'L300 (4D56 Mechanical Diesel — NO ECU)',
    status: 'MECHANICAL_NO_ECU',
    oemControllerNote: 'Mechanical rotary injection pump (VE-type) & fuel cut solenoid — NO Engine Control Unit (ECU). (Only Euro-4 4N14 uses Denso ECM).',
    dlcProtocol: 'None (Mechanical Diesel Fuel Injection — Verify 12V fuel cut solenoid directly)',
    restrictionReason: 'Mechanical 4D56 diesel carries NO Engine ECU. Do not search for ECM pinouts.',
  },
  {
    id: 'mitsubishi-adventure-mech',
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    modelName: 'Adventure (4D56 Mech Diesel / 4G63 Carb — NO ECU)',
    status: 'MECHANICAL_NO_ECU',
    oemControllerNote: 'Mechanical VE injection pump (4D56) or Carbureted (4G63) — NO Engine Control Unit (ECU).',
    dlcProtocol: 'None / Glow Timer Relay only (No OBD-II Engine ECU)',
    restrictionReason: 'Legacy mechanical diesel / carbureted platform carries NO Engine ECU.',
  },

  // Suzuki PART_METADATA_ONLY models (strictly isolated from M16/J20 & Delphi)
  ...([
    'S-Presso (K10B / K10C)',
    'Ertiga (K15B)',
    'Jimny (K15B)',
    'Dzire (K12M / K12N)',
    'XL7 (K15B)',
    'Swift (K12M / K14B)',
    'Celerio (K10B / K10C)',
    'APV (G16A)',
  ]).map((modelName, idx) => ({
    id: `suzuki-meta-${idx + 1}`,
    brandKey: 'suzuki',
    brandLabel: 'Suzuki',
    modelName,
    status: 'PART_METADATA_ONLY' as const,
    oemControllerNote: 'Suzuki Bosch / Denso / Mitsubishi EMS Metadata Only (M16/J20 pinouts STRICTLY RESTRICTED from K15B)',
    dlcProtocol: 'OBD-II CAN (Pins 6 & 14) / Suzuki 6-Pin & 12-Pin SDL Legacy where fitted',
    restrictionReason: 'Factory pin-by-pin table restricted; strictly prohibited from inheriting M16/J20 or Delphi MT20U pinouts.',
  })),

  // Honda PART_METADATA_ONLY models & L15A1 cavity map restriction
  ...([
    'BR-V',
    'CR-V',
    'Brio',
    'HR-V',
    'Mobilio',
    'Accord',
    'City / Jazz L15A1 (Cavity Maps Restricted)',
  ]).map((modelName, idx) => ({
    id: `honda-meta-${idx + 1}`,
    brandKey: 'honda',
    brandLabel: 'Honda',
    modelName,
    status: 'PART_METADATA_ONLY' as const,
    oemControllerNote: 'Honda Keihin PGM-FI Part Metadata & DLC Protocol Only (L15A1 cavity pin map unavailable)',
    dlcProtocol: 'OBD-II CAN (Pins 6 & 14) / K-Line Pin 7 / Legacy 3-Pin or 5-Pin SCS DLC',
    restrictionReason: 'Factory cavity-by-cavity pinout map unavailable in retrieved technical record; never fabricate pin numbers.',
  })),

  // Nissan PART_METADATA_ONLY models
  ...([
    'Terra (YD25 / YS23)',
    'NV350 Urvan (YD25DDTi)',
    'Almera (N17 / N18 HRA0/HR15)',
    'Livina',
    'Kicks e-Power',
    'Patrol',
    'Juke',
  ]).map((modelName, idx) => ({
    id: `nissan-meta-${idx + 1}`,
    brandKey: 'nissan',
    brandLabel: 'Nissan',
    modelName,
    status: 'PART_METADATA_ONLY' as const,
    oemControllerNote: 'Nissan / Hitachi / Denso / e-Power VCU Metadata Only (Do not mix N17/N18 or NV350 with N16 MEC11/D40)',
    dlcProtocol: 'OBD-II ISO 15765 CAN (Pins 6 & 14)',
    restrictionReason: 'Factory pin-by-pin wiring table unavailable in retrieved record; metadata and DLC only.',
  })),

  // Isuzu PART_METADATA_ONLY + MECHANICAL_NO_ECU models
  ...([
    'D-Max (RZ4E / Non-4JJ1 Trims)',
    'mu-X (RZ4E / Non-4JJ1 Trims)',
    'Traviz (4JA1-L Euro-4)',
    'Alterra (Unverified Trim Metadata)',
    'Trooper',
    'F-Series (6HK1 / Heavy Duty)',
  ]).map((modelName, idx) => ({
    id: `isuzu-meta-${idx + 1}`,
    brandKey: 'isuzu',
    brandLabel: 'Isuzu',
    modelName,
    status: 'PART_METADATA_ONLY' as const,
    oemControllerNote: 'Isuzu Transtron / Denso Part Metadata Only (Verify 12V vs 24V on commercial F-Series)',
    dlcProtocol: 'OBD-II CAN (Pins 6 & 14) / J1939 Heavy-Duty',
    restrictionReason: 'Factory pin-by-pin wiring table restricted to verified 4JJ1 and gated 4HK1 guides.',
  })),
  ...([
    'Crosswind (4JA1 Mechanical Diesel — NO ECU)',
    'Hi-Lander (4JA1 Mechanical Diesel — NO ECU)',
    'Fuego (4JA1 Mechanical Diesel — NO ECU)',
  ]).map((modelName, idx) => ({
    id: `isuzu-mech-${idx + 1}`,
    brandKey: 'isuzu',
    brandLabel: 'Isuzu',
    modelName,
    status: 'MECHANICAL_NO_ECU' as const,
    oemControllerNote: 'Mechanical 4JA1 direct-injection diesel pump — NO Engine Control Unit (ECU). Only glow plug timer & fuel cut solenoid exist.',
    dlcProtocol: 'None (Legacy Mechanical Injection — No OBD-II Engine ECU)',
    restrictionReason: 'No Engine ECU fitted on 4JA1 mechanical Crosswind / Hi-Lander / Fuego.',
  })),
];

/**
 * Table 16: Vehicle-Side OBD-II (SAE J1962 16-Pin) & Legacy OEM DLC Interfaces
 */
export const TABLE16_DLC_INTERFACES: DlcInterfaceEntry[] = [
  {
    id: 'dlc-toyota',
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    connectorTypes: '16-Pin SAE J1962 OBD-II + Legacy 22-Pin / 17-Pin TDCL',
    obd2Pins: 'Pin 4: Chassis GND | Pin 5: Signal GND | Pin 6: CAN-H | Pin 14: CAN-L | Pin 7: SIL (ISO-9141 / K-Line) | Pin 13: TC (Blink/ABS Reset) | Pin 9: TAC | Pin 16: +12V BATT',
    legacyDlcPins: '22-Pin / 17-Pin Engine Bay TDCL: +B (+12V), E1 (GND), TE1/TC (Blink Code Jumper to E1), VF1 (O2 Feedback), W (MIL)',
    protocolNotes: 'Gen-1 1NZ/1KD/2KD uses Pin 7 SIL or MOBD; newer 1NR/2NR/1GD uses CAN 6 & 14. Jump Pin 13 (TC) to Pin 4 (CG) for manual blink codes.',
    voiceSummary: 'Toyota DLC Table 16: OBD2 Pin 16 battery, 4 and 5 ground, 6 and 14 CAN, Pin 7 SIL K-Line, Pin 13 TC test. Legacy 22-pin and 17-pin TDCL uses TE1 to E1 jumper.',
  },
  {
    id: 'dlc-honda',
    brandKey: 'honda',
    brandLabel: 'Honda',
    connectorTypes: '16-Pin SAE J1962 OBD-II + Legacy 3-Pin & 2-Pin SCS DLC',
    obd2Pins: 'Pin 4: Chassis GND | Pin 5: Signal GND | Pin 6: F-CAN H | Pin 14: F-CAN L | Pin 7: K-Line (PGM-FI) | Pin 16: +12V BATT',
    legacyDlcPins: 'Legacy 3-Pin DLC (Light Blue/Blue): K-Line Data, +12V IGN, GND · Paired with 2-Pin SCS (Service Check Signal) short plug for MIL blink codes.',
    protocolNotes: 'OBD2A and early PGM-FI use 3-Pin + 2-Pin SCS or OBD2 Pin 7 K-Line; R18A2/FN2 and late models use F-CAN on Pins 6 and 14.',
    voiceSummary: 'Honda DLC Table 16: OBD2 Pin 7 K-Line and Pins 6 and 14 F-CAN, Pin 16 battery, 4 and 5 ground. Legacy OBD2A uses 3-pin K-Line plus 2-pin SCS blink jumper.',
  },
  {
    id: 'dlc-nissan',
    brandKey: 'nissan',
    brandLabel: 'Nissan',
    connectorTypes: '16-Pin SAE J1962 OBD-II + Legacy 14-Pin Grey CONSULT-I DLC',
    obd2Pins: 'Pin 4: Chassis GND | Pin 5: Signal GND | Pin 6: CAN-H | Pin 14: CAN-L | Pin 7: ISO-9141 K-Line (MEC11/MEC22) | Pin 8: IGN SW (some) | Pin 16: +12V BATT',
    legacyDlcPins: '14-Pin CONSULT-I Trapezoid Connector: RX (Data In), TX (Data Out), CLK (Sync Clock), CHK (Diag Trigger), IGN (+12V), GND',
    protocolNotes: 'Sentra/Almera N16 Hitachi MEC11/MEC22 uses pure K-Line Pin 7 (ignore TCU Pins 86/94). Navara D40 YD25DDTi uses CAN 6/14.',
    voiceSummary: 'Nissan DLC Table 16: OBD2 Pin 7 K-Line for N16 MEC11 and MEC22, Pins 6 and 14 CAN for D40 and modern models, and 14-pin CONSULT-I for legacy RX, TX, and CLK.',
  },
  {
    id: 'dlc-mitsubishi',
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    connectorTypes: '16-Pin SAE J1962 OBD-II + Legacy 12-Pin MUT-II DLC',
    obd2Pins: 'Pin 1: MUT-II Trigger /ABS | Pin 4/5: GND | Pin 6: CAN-H | Pin 14: CAN-L | Pin 7: K-Line (ISO-9141) | Pin 16: +12V BATT',
    legacyDlcPins: '12-Pin Legacy MUT-II Connector: Pin 1 SCI/K-Line, Pin 10 Diagnostics Request, Pin 12 Ground',
    protocolNotes: '4D56 / 4M41 DI-D common-rail uses CAN 6/14 (with MUT-III). Verify L300/Adventure is Euro-4 4N14 before scanning — mechanical 4D56 has NO Engine ECU.',
    voiceSummary: 'Mitsubishi DLC Table 16: OBD2 Pins 6 and 14 CAN, Pin 7 K-Line, Pin 1 MUT trigger, and legacy 12-pin MUT-II connector. Mechanical 4D56 L300 has no engine ECU.',
  },
  {
    id: 'dlc-suzuki',
    brandKey: 'suzuki',
    brandLabel: 'Suzuki',
    connectorTypes: '16-Pin SAE J1962 OBD-II + Legacy 6-Pin / 12-Pin SDL DLC',
    obd2Pins: 'Pin 4/5: GND | Pin 6: CAN-H | Pin 14: CAN-L | Pin 7: ISO-9141 K-Line / SDL | Pin 9: Suzuki SDL (older J20/M16) | Pin 16: +12V BATT',
    legacyDlcPins: '6-Pin / 12-Pin Suzuki Data Link (SDL): SDL Data, Diag Switch Ground Terminal (blink code trigger), +12V, GND',
    protocolNotes: 'Legacy F6A/J20 uses SDL Pin 7 or Pin 9; modern K15B (Jimny/Ertiga/XL7) uses CAN 6/14 ONLY (never cross-wire M16/J20 pinouts onto K15B).',
    voiceSummary: 'Suzuki DLC Table 16: OBD2 Pins 6 and 14 CAN on modern K15B, Pin 7 or Pin 9 SDL on older M16 and J20, plus 6-pin and 12-pin SDL test connectors.',
  },
  {
    id: 'dlc-standard-j1962',
    brandKey: 'universal-bench',
    brandLabel: 'Standard SAE J1962 / Isuzu / Hyundai / Ford / MG',
    connectorTypes: '16-Pin SAE J1962 Universal Bench DLC',
    obd2Pins: 'Pin 4: Chassis GND | Pin 5: Signal GND | Pin 6: HS-CAN High | Pin 14: HS-CAN Low | Pin 7: K-Line (ISO-9141 / KWP2000) | Pin 3/11: Ford MS-CAN | Pin 16: +12V BATT (60Ω CAN Term)',
    legacyDlcPins: 'MG EV / TRQ-L platforms may carry DoIP Ethernet lines alongside HS-CAN; Isuzu F-Series/4HK1 verify 12V vs 24V VBAT on Pin 16 before plugging scanner!',
    protocolNotes: 'Standard universal bench breakout wires Pin 16 -> KL30 (+12V fused), Pins 4 & 5 -> KL31 GND, Pin 6 -> CAN_H, Pin 14 -> CAN_L, Pin 7 -> K-Line.',
    voiceSummary: 'Standard SAE J1962 DLC: Pin 16 battery positive, Pins 4 and 5 ground, Pins 6 and 14 High-Speed CAN terminated at 60 Ohms, Pin 7 K-Line, and Pins 3 and 11 Ford Medium-Speed CAN.',
  },
];

/**
 * Finds all matching OCR_VERIFY or restriction rules for a query or vehicle/ECU string.
 */
export function matchSafetyGatesForQuery(text: string): OcrVerifyRule[] {
  const q = text.toLowerCase();
  return OCR_VERIFY_RULES.filter((rule) =>
    rule.matchTerms.some((term) => q.includes(term.toLowerCase()))
  );
}

/**
 * Finds matching PART_METADATA_ONLY or MECHANICAL_NO_ECU records for anti-fabrication guardrails.
 */
export function matchRestrictedModelsForQuery(text: string): RestrictedModelEntry[] {
  const q = text.toLowerCase().trim();
  if (!q) return [];
  const results: RestrictedModelEntry[] = [];
  const stopTokens = new Set(['cars', 'metadata', 'only', 'mech', 'diesel', 'mechanical', 'ecu', 'no', 'non', 'ev', 'trims', 'unverified', 'trim', 'heavy', 'duty', 'cavity', 'maps', 'restricted', 'platforms']);

  for (const entry of RESTRICTED_MODEL_DATABASE) {
    if (entry.brandKey === 'mg-cars') {
      if (/\bmg\b|\bcyberster\b|\brx5\b|\btrq-l\b/i.test(q)) {
        results.push(entry);
      }
      continue;
    }

    // Special guards so verified engine variants do not trigger restricted sibling trims
    if (entry.id === 'mitsubishi-l300-mech' && (/4n14|euro[\s-]*4/i.test(q) || (!/\bl300\b/i.test(q) && /4d56|121[\s-]*pin|ep7/i.test(q)))) {
      continue;
    }
    if (entry.id === 'mitsubishi-adventure-mech' && !/\badventure\b/i.test(q)) {
      continue;
    }
    if ((entry.id === 'isuzu-meta-1' || entry.id === 'isuzu-meta-2') && /4jj1|4jj3|4jk1/i.test(q)) {
      continue;
    }
    // Raize (1KR-VET / WA-VE) is PART_METADATA_ONLY; Wigo / Agya (1KR-FE / 1KR-VE) is VERIFIED
    if (entry.id === 'toyota-meta-1' && (!/\braize\b|\b1kr-vet\b|\bwa-ve\b/i.test(q) || /\bwigo\b|\bagya\b|\b1kr-fe\b|\b1kr-ve\b/i.test(q))) {
      continue;
    }

    const baseName = entry.modelName.replace(/\([^)]*\)/g, '').trim().toLowerCase();
    const parenContent = (entry.modelName.match(/\(([^)]*)\)/)?.[1] || '').toLowerCase();
    const modelTokens = [...baseName.split(/[\s/,-]+/), ...parenContent.split(/[\s/,-]+/)]
      .map((t) => t.trim())
      .filter((t) => t.length >= 3 && !stopTokens.has(t) && t !== '4d56');

    // Include explicit short model tokens like 'gt', 'xl7', 'apv', 'br-v', 'cr-v', 'hr-v'
    const exactBase = baseName.replace(/\s+/g, ' ');
    const matchedBase = exactBase.length >= 2 && new RegExp(`\\b${exactBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(q);
    const matchedToken = modelTokens.some((tok) =>
      new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(q)
    );

    if (matchedBase || matchedToken) {
      results.push(entry);
    }
  }
  return results;
}

/**
 * Brand-by-Brand OEM Bench Test Scenarios Database.
 * - Batch 1: Toyota (PH Market — Vios, Hilux, Fortuner, Innova, Yaris, Avanza, Altis).
 * - Batch 2: Ford (PH Market — Ranger, Everest, EcoSport, Fiesta, Territory).
 * - Batch 3: Mitsubishi (PH Market — Montero Sport, Strada, L300, Mirage/Mirage G4, Xpander, Lancer EX).
 * - Batch 4: Nissan (PH Market — Navara, Terra, Almera, Urvan NV350, Sylphy, Juke, X-Trail).
 * - Batch 5: Isuzu (PH Market — D-Max, mu-X, Traviz, N-Series).
 * - Batch 6: Hyundai (PH Market — Accent CRDi/Gas, Starex / Staria, Tucson, Reina, Elantra).
 * - Batch 7: Suzuki (PH Market — Ertiga, Swift, Dzire, Celerio, Jimny, S-Presso).
 * - Batch 8: Honda (PH Market — City, Civic, BR-V, CR-V, Brio).
 */
export const BENCH_TEST_SCENARIOS: BenchTestScenarioEntry[] = [
  {
    id: 'scenario-toyota-1',
    scenarioNumber: 1,
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Vios 1NR-FE / 2NR-FE)',
    dtcCode: 'P0351 – P0354',
    faultDescription: 'Ignition Coil "A"–"D" Primary/Secondary Circuit',
    benchSimulationSetup:
      'Disconnect IGF (Ignition Confirmation) return line or pull coil trigger load on bench simulator.',
    expectedEcuBehavior:
      'ECU sets code within 2–3 crank/run cycles and cuts fuel injector pulse to the affected cylinder.',
    recommendedPinId: 'ecu-pin-11',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Toyota #1: Ignition Coil / IGF Open (P0351–P0354)',
  },
  {
    id: 'scenario-toyota-2',
    scenarioNumber: 2,
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Hilux / Fortuner 1GD-FTV / 2GD-FTV)',
    dtcCode: 'P0087',
    faultDescription: 'Fuel Rail/System Pressure - Too Low',
    benchSimulationSetup:
      'Lower the fuel rail pressure sensor signal voltage below 0.5V (simulating < 20 MPa at idle) using a potentiometer.',
    expectedEcuBehavior:
      'ECU enters limp mode, caps RPM, and increases Suction Control Valve (SCV) duty cycle to compensate.',
    recommendedPinId: 'ecu-pin-8',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Toyota #2: Fuel Rail Pressure Low <0.5V (P0087)',
  },
  {
    id: 'scenario-toyota-3',
    scenarioNumber: 3,
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Hilux / Fortuner / Innova 2KD / 1GD)',
    dtcCode: 'P0400',
    faultDescription: 'Exhaust Gas Recirculation Flow',
    benchSimulationSetup:
      'Set EGR position sensor feedback voltage static while commanding EGR stepper/DC motor movement.',
    expectedEcuBehavior:
      'ECU flags flow deviation fault and disables EGR motor driver output until key cycle.',
    recommendedPinId: 'ecu-pin-9',
    recommendedFaultType: 'HIGH_RESISTANCE_250R',
    faultPresetLabel: 'Toyota #3: EGR Position Feedback Deviation (P0400)',
  },
  {
    id: 'scenario-toyota-4',
    scenarioNumber: 4,
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Vios / Yaris / Avanza)',
    dtcCode: 'P0102',
    faultDescription: 'Mass or Volume Air Flow "A" Circuit Low',
    benchSimulationSetup:
      'Drop MAF sensor signal frequency/voltage below 0.2V (open circuit simulation).',
    expectedEcuBehavior:
      'ECU switches to fail-safe alpha-N (TPS/RPM) fueling map; air-fuel trim calculation freezes.',
    recommendedPinId: 'ecu-pin-7',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Toyota #4: MAF Signal Open <0.2V (P0102)',
  },
  {
    id: 'scenario-toyota-5',
    scenarioNumber: 5,
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Vios / Innova 1TR-FE)',
    dtcCode: 'P2118',
    faultDescription: 'Throttle Actuator Control Motor Current Range',
    benchSimulationSetup:
      'Open the dedicated ETCS (Electronic Throttle Control System) power supply fuse/pin on the bench harness.',
    expectedEcuBehavior:
      'ECU immediately cuts power to the throttle motor driver; throttle plate snaps to default mechanical limp angle (~7°).',
    recommendedPinId: 'ecu-pin-12',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Toyota #5: ETCS Power Supply Fuse Open (P2118)',
  },
  {
    id: 'scenario-toyota-6',
    scenarioNumber: 6,
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (All Toyota Gasoline & Diesel)',
    dtcCode: 'P0500',
    faultDescription: 'Vehicle Speed Sensor "A"',
    benchSimulationSetup:
      'Cut or ground the SPD (Vehicle Speed) pulse input signal from the ABS/combination meter simulator while simulating RPM > 2000.',
    expectedEcuBehavior:
      'ECU registers speed mismatch after ~10 seconds of simulated drive load; disables overdrive/top gear lockup.',
    recommendedPinId: 'ecu-pin-13',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Toyota #6: SPD Pulse Signal Grounded (P0500)',
  },
  {
    id: 'scenario-toyota-7',
    scenarioNumber: 7,
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    market: 'PH Market',
    targetModuleAndModels: 'TCM / ECM (Vios CVT / Altis)',
    dtcCode: 'P2757',
    faultDescription: 'Torque Converter Clutch Pressure Control Solenoid',
    benchSimulationSetup:
      'Introduce high resistance (> 25 Ω) or open circuit on the SLU (Lock-Up) linear solenoid load resistor.',
    expectedEcuBehavior:
      'Module detects current draw anomaly on the PWM driver and forces transmission into hydraulic fail-safe (fixed gear ratio).',
    recommendedPinId: 'ecu-pin-10',
    recommendedFaultType: 'HIGH_RESISTANCE_50R',
    faultPresetLabel: 'Toyota #7: SLU Solenoid High Resistance >25Ω (P2757)',
  },
  {
    id: 'scenario-toyota-8',
    scenarioNumber: 8,
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    market: 'PH Market',
    targetModuleAndModels: 'TCM / ECM (Fortuner / Hilux 6-Speed AT)',
    dtcCode: 'P0751',
    faultDescription: 'Shift Solenoid "A" Performance / Stuck Off',
    benchSimulationSetup:
      'Leave solenoid coil electrically connected, but fail to trigger the corresponding hydraulic pressure switch feedback input.',
    expectedEcuBehavior:
      'TCM logs mechanical/hydraulic performance fault on the 2nd consecutive drive cycle and locks transmission in 3rd/4th gear.',
    recommendedPinId: 'ecu-pin-16',
    recommendedFaultType: 'HIGH_RESISTANCE_250R',
    faultPresetLabel: 'Toyota #8: Shift Solenoid A Pressure Feedback Fault (P0751)',
  },
  {
    id: 'scenario-toyota-9',
    scenarioNumber: 9,
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    market: 'PH Market',
    targetModuleAndModels: 'ABS / VSC ECU (Hilux / Fortuner / Vios)',
    dtcCode: 'C0200 / C0205',
    faultDescription: 'Right/Left Front Wheel Speed Sensor Signal',
    benchSimulationSetup:
      'Inject a noisy AC/square wave signal or drop signal amplitude below 0.1V on the FR/FL wheel speed inputs.',
    expectedEcuBehavior:
      'ABS module illuminates warning flag over CAN bus and disables ABS/VSC/TRC solenoid relay drivers.',
    recommendedPinId: 'ecu-pin-14',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Toyota #9: Front Wheel Speed Sensor Drop <0.1V (C0200/C0205)',
  },
  {
    id: 'scenario-toyota-10',
    scenarioNumber: 10,
    brandKey: 'toyota',
    brandLabel: 'Toyota',
    market: 'PH Market',
    targetModuleAndModels: 'Airbag SRS ECU (All Toyota Models)',
    dtcCode: 'B1801',
    faultDescription: 'Driving Side Squib Circuit Open',
    benchSimulationSetup:
      'Replace the standard 2.2 Ω simulator resistor on the driver airbag squib pins with an open circuit (or > 6 Ω).',
    expectedEcuBehavior:
      'SRS ECU immediately logs an active fault in EEPROM and broadcasts SRS warning lamp ON via CAN.',
    recommendedPinId: 'ecu-pin-15',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Toyota #10: Driver Airbag Squib Circuit Open >6Ω (B1801)',
  },
  // Batch 2: Ford (PH Market — Ranger, Everest, EcoSport, Fiesta, Territory)
  {
    id: 'scenario-ford-1',
    scenarioNumber: 1,
    brandKey: 'ford',
    brandLabel: 'Ford',
    market: 'PH Market',
    targetModuleAndModels: 'BCM (Body Control Module - Ranger / Everest T6 & Next-Gen)',
    dtcCode: 'U3000:49',
    faultDescription: 'Control Module - Internal Electronic Failure',
    benchSimulationSetup:
      'Simulate low battery cranking voltage drop (< 8.5V) during bench boot-up or inject corrupted EEPROM checksum sector.',
    expectedEcuBehavior:
      'BCM locks out specific high-side FET outputs (e.g., low beam headlights or washer pump) permanently until flash/counter reset.',
    recommendedPinId: 'ecu-pin-3',
    recommendedFaultType: 'HIGH_RESISTANCE_250R',
    faultPresetLabel: 'Ford #1: BCM Undervoltage Drop / Internal Lockout (U3000:49)',
  },
  {
    id: 'scenario-ford-2',
    scenarioNumber: 2,
    brandKey: 'ford',
    brandLabel: 'Ford',
    market: 'PH Market',
    targetModuleAndModels: 'PCM / BCM (Ranger / Everest / EcoSport)',
    dtcCode: 'U0100',
    faultDescription: 'Lost Communication With ECM/PCM "A"',
    benchSimulationSetup:
      'Disconnect HS-CAN (High-Speed CAN) high or low line between the PCM and BCM/Gateway on the bench breakout box.',
    expectedEcuBehavior:
      'Dependent modules log loss-of-communication flags within 500ms; instrument cluster simulator drops RPM/temp gauges.',
    recommendedPinId: 'ecu-pin-13',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Ford #2: HS-CAN Line Open / Lost PCM Comm (U0100)',
  },
  {
    id: 'scenario-ford-3',
    scenarioNumber: 3,
    brandKey: 'ford',
    brandLabel: 'Ford',
    market: 'PH Market',
    targetModuleAndModels: 'TCM (EcoSport / Fiesta 6DCT250 PowerShift)',
    dtcCode: 'P07A3 / P07A5',
    faultDescription: 'Transmission Friction Element "A" / "B" Stuck On',
    benchSimulationSetup:
      'Hold clutch fork position hall-effect sensor signal static while TCM commands clutch actuator motor sweep.',
    expectedEcuBehavior:
      'TCM flags mechanical/actuator correlation fault, disables odd or even gear engagement, and triggers "Transmission Malfunction" message.',
    recommendedPinId: 'ecu-pin-7',
    recommendedFaultType: 'HIGH_RESISTANCE_250R',
    faultPresetLabel: 'Ford #3: PowerShift Clutch Fork Hall Signal Static (P07A3/P07A5)',
  },
  {
    id: 'scenario-ford-4',
    scenarioNumber: 4,
    brandKey: 'ford',
    brandLabel: 'Ford',
    market: 'PH Market',
    targetModuleAndModels: 'TCM (EcoSport / Fiesta 6DCT250 PowerShift)',
    dtcCode: 'P0606',
    faultDescription: 'Control Module Processor',
    benchSimulationSetup:
      'Introduce voltage ripple (> 1.5V AC) on the TCM 12V main power supply pin under load.',
    expectedEcuBehavior:
      'Internal watchdog resets TCM microprocessor; module drops off CAN bus briefly and logs internal processor fault.',
    recommendedPinId: 'ecu-pin-4',
    recommendedFaultType: 'HIGH_RESISTANCE_50R',
    faultPresetLabel: 'Ford #4: TCM 12V Supply Ripple / Watchdog Reset (P0606)',
  },
  {
    id: 'scenario-ford-5',
    scenarioNumber: 5,
    brandKey: 'ford',
    brandLabel: 'Ford',
    market: 'PH Market',
    targetModuleAndModels: 'PCM (Ranger / Everest 2.2L & 3.2L Duratorq)',
    dtcCode: 'P0089',
    faultDescription: 'Fuel Pressure Regulator 1 Performance',
    benchSimulationSetup:
      'Create a > 15 MPa discrepancy between commanded VCV (Volume Control Valve) PWM duty cycle and simulated FRP sensor voltage.',
    expectedEcuBehavior:
      'PCM limits fuel rail pressure target, enters limp mode (capped at ~2,500 RPM), and disables turbo boost solenoid duty.',
    recommendedPinId: 'ecu-pin-10',
    recommendedFaultType: 'HIGH_RESISTANCE_50R',
    faultPresetLabel: 'Ford #5: VCV / FRP Pressure Performance Mismatch (P0089)',
  },
  {
    id: 'scenario-ford-6',
    scenarioNumber: 6,
    brandKey: 'ford',
    brandLabel: 'Ford',
    market: 'PH Market',
    targetModuleAndModels: 'PCM (Ranger / Everest 2.0L Bi-Turbo / Single Turbo)',
    dtcCode: 'P0299',
    faultDescription: 'Turbocharger/Supercharger "A" Underboost',
    benchSimulationSetup:
      'Hold MAP (Manifold Absolute Pressure) sensor voltage below 1.8V while simulating high engine load and boost solenoid actuation.',
    expectedEcuBehavior:
      'PCM detects boost deviation after ~5 seconds under simulated load and disables VGT/wastegate actuator control.',
    recommendedPinId: 'ecu-pin-8',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Ford #6: MAP Below 1.8V Under Boost Load (P0299)',
  },
  {
    id: 'scenario-ford-7',
    scenarioNumber: 7,
    brandKey: 'ford',
    brandLabel: 'Ford',
    market: 'PH Market',
    targetModuleAndModels: 'PCM (Ranger / Everest 2.2L / 3.2L / 2.0L)',
    dtcCode: 'P0405',
    faultDescription: 'Exhaust Gas Recirculation Sensor "A" Circuit Low',
    benchSimulationSetup:
      'Pull the EGR valve position feedback signal pin to ground (< 0.15V) on the bench harness.',
    expectedEcuBehavior:
      'PCM immediately logs low-input circuit fault, sets EGR commanded position to 0%, and illuminates MIL.',
    recommendedPinId: 'ecu-pin-9',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Ford #7: EGR Position Feedback Grounded <0.15V (P0405)',
  },
  {
    id: 'scenario-ford-8',
    scenarioNumber: 8,
    brandKey: 'ford',
    brandLabel: 'Ford',
    market: 'PH Market',
    targetModuleAndModels: 'TCM (Ranger / Everest 6R80 6-Speed AT)',
    dtcCode: 'P0720 / P0722',
    faultDescription: 'Output Shaft Speed (OSS) Sensor Circuit No Signal',
    benchSimulationSetup:
      'Cut or ground the OSS hall-effect square-wave signal input on the lead-frame simulator harness.',
    expectedEcuBehavior:
      'TCM loses output speed reference, forces transmission into 3rd or 5th gear hydraulic limp mode, and disables torque converter lockup.',
    recommendedPinId: 'ecu-pin-14',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Ford #8: 6R80 OSS Hall Signal Open / No Signal (P0720/P0722)',
  },
  {
    id: 'scenario-ford-9',
    scenarioNumber: 9,
    brandKey: 'ford',
    brandLabel: 'Ford',
    market: 'PH Market',
    targetModuleAndModels: 'ABS / DSC Module (Ranger / Everest / EcoSport)',
    dtcCode: 'C0034 / C0037',
    faultDescription: 'Right Front / Left Rear Wheel Speed Sensor',
    benchSimulationSetup:
      'Open-circuit the active magneto-resistive wheel speed sensor loop (current drops outside 7mA–14mA normal window).',
    expectedEcuBehavior:
      'ABS module immediately sets active sensor circuit fault and broadcasts ABS/Traction Control/Hill Descent disable flags over CAN.',
    recommendedPinId: 'ecu-pin-15',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Ford #9: Active WSS Loop Open Outside 7–14mA (C0034/C0037)',
  },
  {
    id: 'scenario-ford-10',
    scenarioNumber: 10,
    brandKey: 'ford',
    brandLabel: 'Ford',
    market: 'PH Market',
    targetModuleAndModels: 'RCM (Restraints Control Module - All Ford Models)',
    dtcCode: 'B0001:13',
    faultDescription: 'Driver Frontal Stage 1 Deployment Control - Circuit Open',
    benchSimulationSetup:
      'Remove the 2.2 Ω load resistor from the Stage 1 driver squib pins on the bench breakout harness.',
    expectedEcuBehavior:
      'RCM detects open squib loop on startup self-test (< 2 seconds) and commands the airbag warning indicator ON.',
    recommendedPinId: 'ecu-pin-11',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Ford #10: Stage 1 Driver Squib 2.2Ω Resistor Open (B0001:13)',
  },
  // Batch 3: Mitsubishi (PH Market — Montero Sport, Strada, L300, Mirage/Mirage G4, Xpander, Lancer EX)
  {
    id: 'scenario-mitsubishi-1',
    scenarioNumber: 1,
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Montero Sport / Strada 4D56 & 4N15)',
    dtcCode: 'P0089 / P0629',
    faultDescription: 'Suction Control Valve (SCV) / Fuel Pump Control Circuit',
    benchSimulationSetup:
      'Introduce high resistance (> 15 Ω) or open circuit on the SCV PWM low-side driver pin on the bench load box.',
    expectedEcuBehavior:
      'ECM cuts SCV duty cycle, sets rail pressure fault, and limits engine speed to ~2,000 RPM limp mode.',
    recommendedPinId: 'ecu-pin-16',
    recommendedFaultType: 'HIGH_RESISTANCE_50R',
    faultPresetLabel: 'Mitsubishi #1: SCV PWM High Resistance >15Ω (P0089/P0629)',
  },
  {
    id: 'scenario-mitsubishi-2',
    scenarioNumber: 2,
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Montero Sport / Strada 4N15 MIVEC)',
    dtcCode: 'P0093',
    faultDescription: 'Fuel System Leak Detected - Large Leak',
    benchSimulationSetup:
      'Drop simulated Fuel Rail Pressure (FRP) sensor voltage rapidly (> 30 MPa drop within 1 second) under high simulated RPM.',
    expectedEcuBehavior:
      'ECM immediately cuts injector firing pulses (engine stall simulation) and latches a hard rail-leak DTC.',
    recommendedPinId: 'ecu-pin-8',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Mitsubishi #2: FRP Rapid Drop >30 MPa / Large Leak (P0093)',
  },
  {
    id: 'scenario-mitsubishi-3',
    scenarioNumber: 3,
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Montero Sport / Strada / L300 Euro 4)',
    dtcCode: 'P0401 / P0403',
    faultDescription: 'EGR Flow Insufficient / EGR Control Circuit',
    benchSimulationSetup:
      'Disconnect the DC EGR motor coil load or freeze the EGR lift sensor feedback voltage during duty-cycle sweep.',
    expectedEcuBehavior:
      'ECM disables EGR motor H-bridge driver, logs emission fault, and restricts turbo boost targets.',
    recommendedPinId: 'ecu-pin-9',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Mitsubishi #3: DC EGR Motor / Lift Sensor Fault (P0401/P0403)',
  },
  {
    id: 'scenario-mitsubishi-4',
    scenarioNumber: 4,
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Montero Sport / Strada 4D56 / 4N15)',
    dtcCode: 'P1272 / P0088',
    faultDescription: 'Fuel Rail Pressure Relief Valve / Too High',
    benchSimulationSetup:
      'Raise FRP sensor input voltage above 4.3V (simulating > 200 MPa) while holding SCV duty cycle at minimum.',
    expectedEcuBehavior:
      'ECM enters severe limp mode, triggers check engine lamp, and commands full fuel-cut if voltage exceeds 4.5V.',
    recommendedPinId: 'ecu-pin-5',
    recommendedFaultType: 'SHORT_TO_VBAT',
    faultPresetLabel: 'Mitsubishi #4: FRP Overpressure >4.3V / >200 MPa (P1272/P0088)',
  },
  {
    id: 'scenario-mitsubishi-5',
    scenarioNumber: 5,
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Mirage / Mirage G4 3A92 & Xpander 4A91)',
    dtcCode: 'P0606',
    faultDescription: 'ECM/PCM Processor Internal Fault',
    benchSimulationSetup:
      'Inject brief voltage drop (< 6.5V for 200ms) on the main ignition-switched +12V pin while simulating crank/cam signals.',
    expectedEcuBehavior:
      'Internal watchdog detects processor logic mismatch, resets fuel/ignition drivers, and logs internal CPU error.',
    recommendedPinId: 'ecu-pin-4',
    recommendedFaultType: 'HIGH_RESISTANCE_250R',
    faultPresetLabel: 'Mitsubishi #5: KL15 +12V Drop <6.5V Watchdog Reset (P0606)',
  },
  {
    id: 'scenario-mitsubishi-6',
    scenarioNumber: 6,
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Mirage / Xpander / Lancer EX)',
    dtcCode: 'P0122 / P0223',
    faultDescription: 'Throttle Position Sensor (TPS) Sub/Main Circuit Range',
    benchSimulationSetup:
      'Cross-short TPS1 and TPS2 analog return lines or pull TPS1 below 0.2V on the electronic throttle simulator.',
    expectedEcuBehavior:
      'ECM immediately shuts down the throttle actuator motor relay, locking throttle plate at ~6° mechanical fail-safe.',
    recommendedPinId: 'ecu-pin-7',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Mitsubishi #6: TPS1/TPS2 Sub/Main Range Fault <0.2V (P0122/P0223)',
  },
  {
    id: 'scenario-mitsubishi-7',
    scenarioNumber: 7,
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    market: 'PH Market',
    targetModuleAndModels: 'TCM / CVT-ECU (Mirage / Mirage G4 / Lancer CVT)',
    dtcCode: 'P0868 / P0746',
    faultDescription: 'Secondary Fluid Pressure Low / Pressure Control Solenoid "A"',
    benchSimulationSetup:
      'Hold secondary pressure sensor input below 0.8V while commanding line pressure solenoid current to maximum.',
    expectedEcuBehavior:
      'CVT module sets hydraulic fail-safe mode, locks pulley ratio to low/safe gear, and flashes "D" or warning indicator over CAN.',
    recommendedPinId: 'ecu-pin-10',
    recommendedFaultType: 'HIGH_RESISTANCE_250R',
    faultPresetLabel: 'Mitsubishi #7: CVT Secondary Fluid Pressure Low <0.8V (P0868/P0746)',
  },
  {
    id: 'scenario-mitsubishi-8',
    scenarioNumber: 8,
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    market: 'PH Market',
    targetModuleAndModels: 'TCM (Montero Sport 8-Speed AT / Strada 5-Speed AT)',
    dtcCode: 'P0715 / P0720',
    faultDescription: 'Input/Turbine Speed Sensor or Output Speed Sensor Circuit',
    benchSimulationSetup:
      'Cut or ground the Hall-effect square-wave signal on the input or output shaft speed pin on the bench harness.',
    expectedEcuBehavior:
      'TCM loses gear-ratio calculation, locks transmission into 3rd or 4th gear limp mode, and disables manual/paddle shift mode.',
    recommendedPinId: 'ecu-pin-14',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Mitsubishi #8: Turbine/Output Speed Hall Grounded (P0715/P0720)',
  },
  {
    id: 'scenario-mitsubishi-9',
    scenarioNumber: 9,
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    market: 'PH Market',
    targetModuleAndModels: 'ETACS-ECU (Body Control - Montero / Strada / Xpander)',
    dtcCode: 'U0141 / B1A25',
    faultDescription: 'Lost Communication with ETACS / Immobilizer Key Error',
    benchSimulationSetup:
      'Disconnect B-CAN line between ECM and ETACS or leave transponder antenna coil open-circuit during ignition-ON simulation.',
    expectedEcuBehavior:
      'ETACS blocks starter relay ground trigger and sends fuel-cut inhibit message to ECM via CAN bus.',
    recommendedPinId: 'ecu-pin-13',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Mitsubishi #9: ETACS B-CAN / Transponder Open (U0141/B1A25)',
  },
  {
    id: 'scenario-mitsubishi-10',
    scenarioNumber: 10,
    brandKey: 'mitsubishi',
    brandLabel: 'Mitsubishi',
    market: 'PH Market',
    targetModuleAndModels: 'ABS / ASC-ECU (Montero Sport / Strada / Xpander)',
    dtcCode: 'C1011 / C1022',
    faultDescription: 'Front Right / Rear Left Wheel Speed Sensor Circuit',
    benchSimulationSetup:
      'Open-circuit or short-to-ground the active wheel speed sensor current loop on the ABS bench breakout box.',
    expectedEcuBehavior:
      'ABS module disables ABS, Active Stability Control (ASC), and Hill Start Assist, broadcasting warning flags over CAN.',
    recommendedPinId: 'ecu-pin-15',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Mitsubishi #10: Active WSS Loop Open / Grounded (C1011/C1022)',
  },
  // Batch 4: Nissan (PH Market — Navara, Terra, Almera, Urvan NV350, Sylphy, Juke, X-Trail)
  {
    id: 'scenario-nissan-1',
    scenarioNumber: 1,
    brandKey: 'nissan',
    brandLabel: 'Nissan',
    market: 'PH Market',
    targetModuleAndModels: 'TCM / CVT-ECU (Almera / Sylphy / Juke RE0F11A CVT)',
    dtcCode: 'P1778',
    faultDescription: 'Step Motor Function',
    benchSimulationSetup:
      'Open-circuit or introduce high resistance (> 30 Ω) on one of the 4 stepper motor coil driver pins on the bench load box.',
    expectedEcuBehavior:
      'TCM detects coil current mismatch, locks pulley ratio into mechanical fail-safe mode, and disables manual/sport mode.',
    recommendedPinId: 'ecu-pin-10',
    recommendedFaultType: 'HIGH_RESISTANCE_50R',
    faultPresetLabel: 'Nissan #1: CVT Step Motor Coil High Resistance >30Ω (P1778)',
  },
  {
    id: 'scenario-nissan-2',
    scenarioNumber: 2,
    brandKey: 'nissan',
    brandLabel: 'Nissan',
    market: 'PH Market',
    targetModuleAndModels: 'TCM / CVT-ECU (Almera / X-Trail / Sylphy CVT)',
    dtcCode: 'P0868 / P0746',
    faultDescription: 'Secondary Fluid Pressure Low / Pressure Control Solenoid "A"',
    benchSimulationSetup:
      'Hold secondary pressure sensor input below 0.7V while commanding line pressure solenoid PWM duty cycle to maximum.',
    expectedEcuBehavior:
      'TCM forces hydraulic limp mode, illuminates MIL via CAN request to ECM, and prevents torque converter lockup.',
    recommendedPinId: 'ecu-pin-16',
    recommendedFaultType: 'HIGH_RESISTANCE_250R',
    faultPresetLabel: 'Nissan #2: CVT Secondary Pressure Low <0.7V (P0868/P0746)',
  },
  {
    id: 'scenario-nissan-3',
    scenarioNumber: 3,
    brandKey: 'nissan',
    brandLabel: 'Nissan',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Navara NP300 / Terra YD25DDTi)',
    dtcCode: 'P0089 / P1275',
    faultDescription: 'Fuel Pump / Suction Control Valve (SCV) Control Function',
    benchSimulationSetup:
      'Create > 15 MPa discrepancy between commanded SCV current duty cycle and simulated Fuel Rail Pressure (FRP) sensor voltage.',
    expectedEcuBehavior:
      'ECM enters limp mode (caps engine speed at ~2,000–2,500 RPM) and disables VGT turbo boost control solenoid.',
    recommendedPinId: 'ecu-pin-12',
    recommendedFaultType: 'HIGH_RESISTANCE_50R',
    faultPresetLabel: 'Nissan #3: YD25 SCV / FRP Pressure Mismatch (P0089/P1275)',
  },
  {
    id: 'scenario-nissan-4',
    scenarioNumber: 4,
    brandKey: 'nissan',
    brandLabel: 'Nissan',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Urvan NV350 / Navara YD25DDTi)',
    dtcCode: 'P0234 / P0299',
    faultDescription: 'Turbocharger Overboost / Underboost Condition',
    benchSimulationSetup:
      'Hold Boost Pressure Sensor voltage static (< 1.5V or > 4.2V) while varying simulated RPM and throttle load on the bench.',
    expectedEcuBehavior:
      'ECM logs boost deviation fault after ~5 seconds under load and cuts PWM duty to the electronic turbo actuator / vacuum solenoid.',
    recommendedPinId: 'ecu-pin-8',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Nissan #4: Static Boost Sensor <1.5V Under Load (P0234/P0299)',
  },
  {
    id: 'scenario-nissan-5',
    scenarioNumber: 5,
    brandKey: 'nissan',
    brandLabel: 'Nissan',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Navara / Terra / Urvan NV350)',
    dtcCode: 'P0403 / P0409',
    faultDescription: 'Exhaust Gas Recirculation Control Circuit / Sensor "A"',
    benchSimulationSetup:
      'Disconnect the DC EGR motor load or pull the EGR position feedback voltage to ground (< 0.15V) on the breakout harness.',
    expectedEcuBehavior:
      'ECM immediately cuts H-bridge motor driver power, logs active emission fault, and sets EGR target position to 0%.',
    recommendedPinId: 'ecu-pin-9',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Nissan #5: EGR Feedback Grounded <0.15V (P0403/P0409)',
  },
  {
    id: 'scenario-nissan-6',
    scenarioNumber: 6,
    brandKey: 'nissan',
    brandLabel: 'Nissan',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Almera / Urvan / Navara)',
    dtcCode: 'P0102 / P0103',
    faultDescription: 'Mass Air Flow (MAF) Sensor Circuit Low / High',
    benchSimulationSetup:
      'Drop MAF sensor analog output voltage below 0.3V (open circuit) or pull above 4.8V (short to 5V reference).',
    expectedEcuBehavior:
      'ECM switches to fail-safe alpha-N (TPS/RPM) fueling calculation and caps maximum RPM at ~2,400 RPM.',
    recommendedPinId: 'ecu-pin-5',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Nissan #6: MAF Signal Open <0.3V / High >4.8V (P0102/P0103)',
  },
  {
    id: 'scenario-nissan-7',
    scenarioNumber: 7,
    brandKey: 'nissan',
    brandLabel: 'Nissan',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (All Nissan Electronic Throttle Models)',
    dtcCode: 'P1122 / P2135',
    faultDescription: 'Electric Throttle Control Function / TPS Correlation',
    benchSimulationSetup:
      'Cross-short TPS1 and TPS2 analog return pins or open the throttle motor power relay pin on the bench harness.',
    expectedEcuBehavior:
      'ECM immediately cuts power to the throttle actuator driver, allowing the return spring to lock the plate at ~6° fail-safe angle.',
    recommendedPinId: 'ecu-pin-7',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Nissan #7: ETC Relay Open / TPS Correlation Fault (P1122/P2135)',
  },
  {
    id: 'scenario-nissan-8',
    scenarioNumber: 8,
    brandKey: 'nissan',
    brandLabel: 'Nissan',
    market: 'PH Market',
    targetModuleAndModels: 'BCM / IPDM E/R (Navara / Terra / Almera)',
    dtcCode: 'U1000 / B2193',
    faultDescription: 'CAN Communication Circuit / NATS Chain of ECM-IMMU',
    benchSimulationSetup:
      'Disconnect the CAN-H or CAN-L line between the ECM, BCM, and IPDM, or leave the NATS immobilizer antenna coil open-circuit.',
    expectedEcuBehavior:
      'BCM/IPDM blocks starter relay ground trigger and broadcasts security/immobilizer fuel-cut inhibit over CAN.',
    recommendedPinId: 'ecu-pin-13',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Nissan #8: CAN-H / NATS IMMU Chain Open (U1000/B2193)',
  },
  {
    id: 'scenario-nissan-9',
    scenarioNumber: 9,
    brandKey: 'nissan',
    brandLabel: 'Nissan',
    market: 'PH Market',
    targetModuleAndModels: 'ABS Actuator & Electric Unit (Navara / Terra / Almera)',
    dtcCode: 'C1101 – C1104',
    faultDescription: 'Front/Rear Wheel Speed Sensor Circuit',
    benchSimulationSetup:
      'Open-circuit or short-to-ground the active wheel speed sensor current loop on the ABS bench simulator box.',
    expectedEcuBehavior:
      'ABS ECU disables ABS, EBD, and Vehicle Dynamic Control (VDC), broadcasting warning lamp flags over CAN.',
    recommendedPinId: 'ecu-pin-14',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Nissan #9: Active WSS Current Loop Open (C1101–C1104)',
  },
  {
    id: 'scenario-nissan-10',
    scenarioNumber: 10,
    brandKey: 'nissan',
    brandLabel: 'Nissan',
    market: 'PH Market',
    targetModuleAndModels: 'Airbag Diagnosis Sensor Unit (All Nissan Models)',
    dtcCode: 'B1049 / B1054',
    faultDescription: 'Driver Airbag Module Open Circuit',
    benchSimulationSetup:
      'Replace the 2.2 Ω squib simulator resistor on the driver frontal airbag pins with an open circuit (> 6 Ω).',
    expectedEcuBehavior:
      'SRS module immediately logs active fault in EEPROM and sends airbag warning indicator ON signal over CAN.',
    recommendedPinId: 'ecu-pin-15',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Nissan #10: Driver Airbag Squib Open >6Ω (B1049/B1054)',
  },
  // Batch 5: Isuzu (PH Market — D-Max, mu-X, Traviz, N-Series)
  {
    id: 'scenario-isuzu-1',
    scenarioNumber: 1,
    brandKey: 'isuzu',
    brandLabel: 'Isuzu',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (D-Max / mu-X 4JJ1-TCX & 4JK1-TC)',
    dtcCode: 'P0087 / P1093',
    faultDescription: 'Fuel Rail/System Pressure - Too Low',
    benchSimulationSetup:
      'Lower the simulated Fuel Rail Pressure (FRP) sensor voltage below 0.5V while commanding high RPM load on the crank/cam simulator.',
    expectedEcuBehavior:
      'ECM enters derate/limp mode, caps engine RPM, and drives Suction Control Valve (SCV) PWM duty cycle to maximum.',
    recommendedPinId: 'ecu-pin-8',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Isuzu #1: FRP Sensor Low <0.5V Under Load (P0087/P1093)',
  },
  {
    id: 'scenario-isuzu-2',
    scenarioNumber: 2,
    brandKey: 'isuzu',
    brandLabel: 'Isuzu',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (D-Max / mu-X / N-Series 4JJ1 / 4HK1)',
    dtcCode: 'P0089 / P0091',
    faultDescription: 'Fuel Pressure Regulator (SCV) Performance / Circuit Low',
    benchSimulationSetup:
      'Introduce high resistance (> 15 Ω) or short-to-ground on the SCV low-side driver pin on the bench load box.',
    expectedEcuBehavior:
      'ECM cuts SCV current control, logs Flash Code 151/247, and restricts fuel injection quantity.',
    recommendedPinId: 'ecu-pin-16',
    recommendedFaultType: 'HIGH_RESISTANCE_50R',
    faultPresetLabel: 'Isuzu #2: SCV Driver High Resistance >15Ω / Flash 151/247 (P0089/P0091)',
  },
  {
    id: 'scenario-isuzu-3',
    scenarioNumber: 3,
    brandKey: 'isuzu',
    brandLabel: 'Isuzu',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (D-Max / mu-X / Traviz 4JA1 / 4JJ3)',
    dtcCode: 'P0404 / P0409',
    faultDescription: 'EGR Control Circuit Range / Sensor Circuit',
    benchSimulationSetup:
      'Freeze the EGR valve position sensor analog feedback voltage while sweeping the DC EGR motor PWM output.',
    expectedEcuBehavior:
      'ECM detects position-command mismatch (Flash Code 44/45), disables EGR motor H-bridge output, and illuminates MIL.',
    recommendedPinId: 'ecu-pin-9',
    recommendedFaultType: 'HIGH_RESISTANCE_250R',
    faultPresetLabel: 'Isuzu #3: EGR Position Mismatch / Flash 44/45 (P0404/P0409)',
  },
  {
    id: 'scenario-isuzu-4',
    scenarioNumber: 4,
    brandKey: 'isuzu',
    brandLabel: 'Isuzu',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (D-Max / mu-X 4JJ1 / RZ4E)',
    dtcCode: 'P0234 / P0045',
    faultDescription: 'Turbocharger Overboost / Boost Control Solenoid Circuit',
    benchSimulationSetup:
      'Hold Boost/MAP sensor voltage above 4.2V under simulated load, or open-circuit the VGT actuator/solenoid coil load.',
    expectedEcuBehavior:
      'ECM logs Flash Code 42/33, cuts boost actuator PWM duty to 0%, and caps maximum fuel delivery.',
    recommendedPinId: 'ecu-pin-12',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Isuzu #4: VGT Boost Solenoid Open / Overboost (P0234/P0045)',
  },
  {
    id: 'scenario-isuzu-5',
    scenarioNumber: 5,
    brandKey: 'isuzu',
    brandLabel: 'Isuzu',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (All Isuzu Common Rail Models)',
    dtcCode: 'P1261 / P1262',
    faultDescription: 'Injection Nozzle Common 1 / 2 Drive System Fault',
    benchSimulationSetup:
      'Open-circuit or short-to-ground one of the injector bank high-side boost capacitor driver lines (Cylinders 1&4 or 2&3).',
    expectedEcuBehavior:
      'ECM immediately shuts down the affected injector bank driver (Flash Code 34) to protect the internal DC-DC boost converter.',
    recommendedPinId: 'ecu-pin-10',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Isuzu #5: Injector Common 1/2 Bank Open / Flash 34 (P1261/P1262)',
  },
  {
    id: 'scenario-isuzu-6',
    scenarioNumber: 6,
    brandKey: 'isuzu',
    brandLabel: 'Isuzu',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (D-Max / mu-X / N-Series)',
    dtcCode: 'P0016 / P0340',
    faultDescription: 'Crankshaft-Camshaft Correlation / Cam Sensor No Signal',
    benchSimulationSetup:
      'Phase-shift the simulated Camshaft (CMP) square wave by > 15° relative to the Crankshaft (CKP) missing-tooth signal, or drop CMP signal.',
    expectedEcuBehavior:
      'ECM logs Flash Code 16 or 14, switches to crank-only limp synchronization, and delays injector firing.',
    recommendedPinId: 'ecu-pin-11',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Isuzu #6: CKP-CMP Phase Shift / CMP No Signal (P0016/P0340)',
  },
  {
    id: 'scenario-isuzu-7',
    scenarioNumber: 7,
    brandKey: 'isuzu',
    brandLabel: 'Isuzu',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (D-Max / mu-X / Traviz)',
    dtcCode: 'P0102 / P0103',
    faultDescription: 'Mass Air Flow (MAF) Sensor Circuit Low / High',
    benchSimulationSetup:
      'Drop MAF sensor signal frequency/voltage below 0.2V (open circuit) or pull above 4.8V on the bench breakout box.',
    expectedEcuBehavior:
      'ECM sets Flash Code 91, ignores MAF input, and reverts to default barometric/boost-based airflow estimation.',
    recommendedPinId: 'ecu-pin-7',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Isuzu #7: MAF Signal Low <0.2V / Flash 91 (P0102/P0103)',
  },
  {
    id: 'scenario-isuzu-8',
    scenarioNumber: 8,
    brandKey: 'isuzu',
    brandLabel: 'Isuzu',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (All Isuzu Electronic Diesel Models)',
    dtcCode: 'P0606 / P0601',
    faultDescription: 'ECM Processor / Internal Memory Checksum Error',
    benchSimulationSetup:
      'Simulate cranking voltage sag (< 6.5V for 250ms) on the main +12V battery feed or inject corrupted EEPROM checksum sector.',
    expectedEcuBehavior:
      'Internal watchdog resets main CPU (Flash Code 51/53), inhibits injector/SCV outputs, and flags critical ECU fault.',
    recommendedPinId: 'ecu-pin-3',
    recommendedFaultType: 'HIGH_RESISTANCE_250R',
    faultPresetLabel: 'Isuzu #8: Cranking Sag <6.5V / Watchdog Reset (P0606/P0601)',
  },
  {
    id: 'scenario-isuzu-9',
    scenarioNumber: 9,
    brandKey: 'isuzu',
    brandLabel: 'Isuzu',
    market: 'PH Market',
    targetModuleAndModels: 'TCM (D-Max / mu-X 6-Speed Aisin AT)',
    dtcCode: 'P0751 – P0775',
    faultDescription: 'Shift Solenoid Performance / Valve Body Solenoid Circuit',
    benchSimulationSetup:
      'Open-circuit a shift solenoid load resistor or fail to toggle the corresponding transmission fluid pressure switch input.',
    expectedEcuBehavior:
      'TCM enters hydraulic fail-safe mode, locks transmission into 3rd gear, and disables manual shift mode.',
    recommendedPinId: 'ecu-pin-14',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Isuzu #9: Aisin 6AT Shift Solenoid / Pressure Switch Open (P0751–P0775)',
  },
  {
    id: 'scenario-isuzu-10',
    scenarioNumber: 10,
    brandKey: 'isuzu',
    brandLabel: 'Isuzu',
    market: 'PH Market',
    targetModuleAndModels: 'ABS / ESC Control Module (D-Max / mu-X)',
    dtcCode: 'C0031 – C0040',
    faultDescription: 'Front/Rear Wheel Speed Sensor Circuit',
    benchSimulationSetup:
      'Open-circuit or short-to-ground the active magneto-resistive wheel speed sensor loop on the ABS bench simulator.',
    expectedEcuBehavior:
      'ABS ECU immediately disables ABS, Traction Control, and ESC, broadcasting warning lamp ON flags via CAN bus.',
    recommendedPinId: 'ecu-pin-15',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Isuzu #10: Active WSS Loop Open / Grounded (C0031–C0040)',
  },
  // Batch 6: Hyundai (PH Market — Accent CRDi/Gas, Starex / Staria, Tucson, Reina, Elantra)
  {
    id: 'scenario-hyundai-1',
    scenarioNumber: 1,
    brandKey: 'hyundai-kia',
    brandLabel: 'Hyundai',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Accent / Starex / Tucson CRDi U2 & A2)',
    dtcCode: 'P0087 / P1186',
    faultDescription: 'Fuel Rail/System Pressure - Too Low at Monitoring',
    benchSimulationSetup:
      'Lower the simulated Fuel Rail Pressure (FRP) sensor voltage below 0.5V while simulating engine load (> 2,000 RPM).',
    expectedEcuBehavior:
      'ECM enters limp mode (caps engine speed at ~2,800 RPM) and drives the Rail Pressure Regulator Valve (RPCV) / IMV to maximum duty.',
    recommendedPinId: 'ecu-pin-8',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Hyundai #1: CRDi FRP Low <0.5V Under Load (P0087/P1186)',
  },
  {
    id: 'scenario-hyundai-2',
    scenarioNumber: 2,
    brandKey: 'hyundai-kia',
    brandLabel: 'Hyundai',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Accent / Starex CRDi)',
    dtcCode: 'P0088 / P1185',
    faultDescription: 'Fuel Rail/System Pressure - Too High',
    benchSimulationSetup:
      'Raise FRP sensor input voltage above 4.3V while commanding minimum IMV/RPCV duty cycle on the bench load box.',
    expectedEcuBehavior:
      'ECM cuts injector firing pulses (engine stall simulation) to protect the rail and latches a hard overpressure DTC.',
    recommendedPinId: 'ecu-pin-5',
    recommendedFaultType: 'SHORT_TO_VBAT',
    faultPresetLabel: 'Hyundai #2: CRDi FRP Overpressure >4.3V (P0088/P1185)',
  },
  {
    id: 'scenario-hyundai-3',
    scenarioNumber: 3,
    brandKey: 'hyundai-kia',
    brandLabel: 'Hyundai',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Accent / Starex / Tucson CRDi)',
    dtcCode: 'P0401 / P0404',
    faultDescription: 'Exhaust Gas Recirculation Flow / Control Circuit Range',
    benchSimulationSetup:
      'Hold the EGR position feedback voltage static while sweeping the DC EGR motor PWM output on the bench harness.',
    expectedEcuBehavior:
      'ECM detects position deviation, disables EGR motor H-bridge driver output, and illuminates MIL.',
    recommendedPinId: 'ecu-pin-9',
    recommendedFaultType: 'HIGH_RESISTANCE_250R',
    faultPresetLabel: 'Hyundai #3: CRDi EGR Feedback Deviation (P0401/P0404)',
  },
  {
    id: 'scenario-hyundai-4',
    scenarioNumber: 4,
    brandKey: 'hyundai-kia',
    brandLabel: 'Hyundai',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Accent / Starex CRDi VGT)',
    dtcCode: 'P0299 / P0234',
    faultDescription: 'Turbocharger Underboost / Overboost Condition',
    benchSimulationSetup:
      'Hold Boost Pressure Sensor (BPS) voltage static (< 1.5V or > 4.2V) during simulated high-load acceleration.',
    expectedEcuBehavior:
      'ECM logs boost control fault after ~5 seconds and cuts PWM duty to the electronic VGT actuator or vacuum solenoid.',
    recommendedPinId: 'ecu-pin-12',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Hyundai #4: Static BPS / VGT Boost Actuator Cut (P0299/P0234)',
  },
  {
    id: 'scenario-hyundai-5',
    scenarioNumber: 5,
    brandKey: 'hyundai-kia',
    brandLabel: 'Hyundai',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Accent Gas / Reina / Elantra)',
    dtcCode: 'P0335 / P0340',
    faultDescription: 'Crankshaft / Camshaft Position Sensor "A" Circuit',
    benchSimulationSetup:
      'Drop the Crankshaft (CKP) inductive/Hall signal or phase-shift the Camshaft (CMP) square wave by > 15° on the bench simulator.',
    expectedEcuBehavior:
      'Dropping CKP immediately halts injector and ignition coil drivers; CMP loss forces extended cranking and batch-fire limp mode.',
    recommendedPinId: 'ecu-pin-11',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Hyundai #5: CKP Drop / CMP Phase Shift Fault (P0335/P0340)',
  },
  {
    id: 'scenario-hyundai-6',
    scenarioNumber: 6,
    brandKey: 'hyundai-kia',
    brandLabel: 'Hyundai',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Accent / Reina / Tucson Gasoline)',
    dtcCode: 'P2110 / P2135',
    faultDescription: 'Throttle Actuator Control System - Forced Limited RPM / TPS Correlation',
    benchSimulationSetup:
      'Cross-short TPS1 and TPS2 analog feedback pins or open-circuit the Electronic Throttle Control (ETC) motor power feed.',
    expectedEcuBehavior:
      'ECM cuts power to the throttle actuator driver, locking the throttle plate at ~7° mechanical limp angle and capping RPM at ~1,500.',
    recommendedPinId: 'ecu-pin-7',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Hyundai #6: ETC Power / TPS Correlation Limp ~1500 RPM (P2110/P2135)',
  },
  {
    id: 'scenario-hyundai-7',
    scenarioNumber: 7,
    brandKey: 'hyundai-kia',
    brandLabel: 'Hyundai',
    market: 'PH Market',
    targetModuleAndModels: 'TCM / PCM (Accent / Elantra / Tucson 6-Speed AT)',
    dtcCode: 'P0717 / P0722',
    faultDescription: 'Input/Turbine Speed Sensor or Output Speed Sensor No Signal',
    benchSimulationSetup:
      'Cut or ground the Hall-effect square-wave signal on the input or output shaft speed pin on the transmission simulator harness.',
    expectedEcuBehavior:
      'TCM loses gear-ratio calculation, forces transmission into 3rd or 4th gear hydraulic fail-safe mode, and disables manual shift mode.',
    recommendedPinId: 'ecu-pin-14',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Hyundai #7: 6AT Input/Output Speed No Signal (P0717/P0722)',
  },
  {
    id: 'scenario-hyundai-8',
    scenarioNumber: 8,
    brandKey: 'hyundai-kia',
    brandLabel: 'Hyundai',
    market: 'PH Market',
    targetModuleAndModels: 'TCM / PCM (Accent / Starex AT)',
    dtcCode: 'P0741 / P0753',
    faultDescription: 'Torque Converter Clutch / Shift Solenoid "A" Electrical',
    benchSimulationSetup:
      'Open-circuit or introduce high resistance (> 25 Ω) on a shift solenoid or Damper Clutch Control Solenoid (DCCS) load resistor.',
    expectedEcuBehavior:
      'Module detects current draw anomaly on the low-side PWM driver and locks transmission into fail-safe gear.',
    recommendedPinId: 'ecu-pin-10',
    recommendedFaultType: 'HIGH_RESISTANCE_50R',
    faultPresetLabel: 'Hyundai #8: DCCS / Shift Solenoid A High Resistance >25Ω (P0741/P0753)',
  },
  {
    id: 'scenario-hyundai-9',
    scenarioNumber: 9,
    brandKey: 'hyundai-kia',
    brandLabel: 'Hyundai',
    market: 'PH Market',
    targetModuleAndModels: 'BCM / Smart Key Module (Accent / Tucson / Staria)',
    dtcCode: 'B1603 / U0140',
    faultDescription: 'CAN Communication Bus Off / Lost Communication with BCM',
    benchSimulationSetup:
      'Disconnect B-CAN / C-CAN lines between ECM and BCM or leave the immobilizer coil antenna open during ignition-ON simulation.',
    expectedEcuBehavior:
      'ECM blocks fuel injector/ignition coil enable flags (crank-no-start) and logs immobilizer/CAN communication fault.',
    recommendedPinId: 'ecu-pin-13',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Hyundai #9: B-CAN / C-CAN Bus Off & BCM Lost Comm (B1603/U0140)',
  },
  {
    id: 'scenario-hyundai-10',
    scenarioNumber: 10,
    brandKey: 'hyundai-kia',
    brandLabel: 'Hyundai',
    market: 'PH Market',
    targetModuleAndModels: 'ABS / ESC Module (Accent / Tucson / Starex)',
    dtcCode: 'C1200 – C1211',
    faultDescription: 'Front/Rear Wheel Speed Sensor Open or Short',
    benchSimulationSetup:
      'Open-circuit or short-to-ground the active magneto-resistive wheel speed sensor loop on the ABS bench breakout box.',
    expectedEcuBehavior:
      'ABS ECU disables ABS, EBD, and ESC systems, broadcasting warning lamp ON flags over the CAN bus.',
    recommendedPinId: 'ecu-pin-15',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Hyundai #10: Active WSS Loop Open / Short (C1200–C1211)',
  },
  // Batch 7: Suzuki (PH Market — Ertiga, Swift, Dzire, Celerio, Jimny, S-Presso)
  {
    id: 'scenario-suzuki-1',
    scenarioNumber: 1,
    brandKey: 'suzuki',
    brandLabel: 'Suzuki',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Ertiga / Swift / Jimny K15B & K12M)',
    dtcCode: 'P2119 / P2135',
    faultDescription: 'Throttle Actuator Control Throttle Body Range / TPS Correlation',
    benchSimulationSetup:
      'Cross-short TPS1 and TPS2 analog return lines or hold TPS feedback static while commanding throttle motor PWM.',
    expectedEcuBehavior:
      'ECM immediately cuts power to the Electronic Throttle Control (ETC) motor driver, locking the throttle plate at ~6° mechanical limp angle.',
    recommendedPinId: 'ecu-pin-7',
    recommendedFaultType: 'HIGH_RESISTANCE_250R',
    faultPresetLabel: 'Suzuki #1: K15B/K12M ETC Range & TPS Correlation (P2119/P2135)',
  },
  {
    id: 'scenario-suzuki-2',
    scenarioNumber: 2,
    brandKey: 'suzuki',
    brandLabel: 'Suzuki',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Dzire / Celerio AGS / Swift)',
    dtcCode: 'P0335 / P0340',
    faultDescription: 'Crankshaft / Camshaft Position Sensor "A" Circuit',
    benchSimulationSetup:
      'Drop the Crankshaft (CKP) Hall-effect square wave or phase-shift the Camshaft (CMP) signal by > 15° on the bench simulator.',
    expectedEcuBehavior:
      'Dropping CKP immediately halts injector and coil firing; CMP loss forces extended cranking and batch-fire fail-safe synchronization.',
    recommendedPinId: 'ecu-pin-12',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Suzuki #2: CKP Signal Drop / CMP Phase Shift (P0335/P0340)',
  },
  {
    id: 'scenario-suzuki-3',
    scenarioNumber: 3,
    brandKey: 'suzuki',
    brandLabel: 'Suzuki',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (All Suzuki K-Series Gasoline Models)',
    dtcCode: 'P0351 – P0354',
    faultDescription: 'Ignition Coil "A"–"D" Primary/Secondary Circuit',
    benchSimulationSetup:
      'Open-circuit or introduce high resistance (> 20 Ω) on an ignition coil trigger driver pin on the bench load box.',
    expectedEcuBehavior:
      'ECM detects primary circuit current anomaly within 2–3 crank/run cycles and cuts fuel injector pulse to the affected cylinder.',
    recommendedPinId: 'ecu-pin-11',
    recommendedFaultType: 'HIGH_RESISTANCE_50R',
    faultPresetLabel: 'Suzuki #3: K-Series Ignition Coil Primary >20Ω (P0351–P0354)',
  },
  {
    id: 'scenario-suzuki-4',
    scenarioNumber: 4,
    brandKey: 'suzuki',
    brandLabel: 'Suzuki',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (Ertiga / Swift / Celerio / S-Presso)',
    dtcCode: 'P0107 / P0108',
    faultDescription: 'Manifold Absolute Pressure (MAP) Sensor Circuit Low / High',
    benchSimulationSetup:
      'Pull the MAP sensor analog input pin below 0.2V (short to ground) or above 4.8V (short to 5V reference).',
    expectedEcuBehavior:
      'ECM switches to fail-safe TPS/RPM alpha-N fueling map, disables closed-loop fuel trim, and illuminates MIL.',
    recommendedPinId: 'ecu-pin-8',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Suzuki #4: MAP Sensor Low <0.2V / High >4.8V (P0107/P0108)',
  },
  {
    id: 'scenario-suzuki-5',
    scenarioNumber: 5,
    brandKey: 'suzuki',
    brandLabel: 'Suzuki',
    market: 'PH Market',
    targetModuleAndModels: 'ECM (All Suzuki Electronic Models)',
    dtcCode: 'P0606 / P0602',
    faultDescription: 'ECM/PCM Processor / Control Module Programming Error',
    benchSimulationSetup:
      'Simulate cranking voltage sag (< 6.5V for 250ms) on the main +12V battery feed or inject corrupted EEPROM checksum sector.',
    expectedEcuBehavior:
      'Internal watchdog resets main CPU, inhibits fuel pump/injector relay ground drivers, and latches internal ECU fault.',
    recommendedPinId: 'ecu-pin-3',
    recommendedFaultType: 'HIGH_RESISTANCE_250R',
    faultPresetLabel: 'Suzuki #5: Cranking Sag <6.5V Watchdog Reset (P0606/P0602)',
  },
  {
    id: 'scenario-suzuki-6',
    scenarioNumber: 6,
    brandKey: 'suzuki',
    brandLabel: 'Suzuki',
    market: 'PH Market',
    targetModuleAndModels: 'TCM / AGS Controller (Dzire / Celerio / S-Presso Auto Gear Shift)',
    dtcCode: 'P0900 / P0919',
    faultDescription: 'Clutch Actuator Circuit Open / Gear Shift Position Control Error',
    benchSimulationSetup:
      'Open-circuit the clutch actuator DC motor load or freeze the gear shift stroke sensor analog feedback during shift command.',
    expectedEcuBehavior:
      'AGS controller halts gear engagement, flashes the gear indicator warning light on the cluster over CAN, and locks transmission in neutral or current gear.',
    recommendedPinId: 'ecu-pin-16',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Suzuki #6: AGS Clutch Actuator Open / Stroke Error (P0900/P0919)',
  },
  {
    id: 'scenario-suzuki-7',
    scenarioNumber: 7,
    brandKey: 'suzuki',
    brandLabel: 'Suzuki',
    market: 'PH Market',
    targetModuleAndModels: 'TCM / CVT-ECU (Swift / Celerio CVT)',
    dtcCode: 'P0868 / P0746',
    faultDescription: 'Secondary Fluid Pressure Low / Pressure Control Solenoid "A"',
    benchSimulationSetup:
      'Hold secondary pressure sensor input below 0.7V while driving line pressure solenoid PWM duty cycle to maximum.',
    expectedEcuBehavior:
      'CVT module enters hydraulic limp mode, locks pulley ratio to low/safe gear, and disables torque converter lockup.',
    recommendedPinId: 'ecu-pin-10',
    recommendedFaultType: 'HIGH_RESISTANCE_250R',
    faultPresetLabel: 'Suzuki #7: CVT Secondary Pressure Low <0.7V (P0868/P0746)',
  },
  {
    id: 'scenario-suzuki-8',
    scenarioNumber: 8,
    brandKey: 'suzuki',
    brandLabel: 'Suzuki',
    market: 'PH Market',
    targetModuleAndModels: 'TCM (Ertiga / Jimny 4-Speed AT)',
    dtcCode: 'P0751 / P0756',
    faultDescription: 'Shift Solenoid "A" or "B" Performance / Stuck Off',
    benchSimulationSetup:
      'Open-circuit a shift solenoid load resistor on the bench harness while simulating vehicle speed > 30 km/h.',
    expectedEcuBehavior:
      'TCM detects solenoid circuit/ratio error and locks transmission into 3rd gear hydraulic fail-safe mode.',
    recommendedPinId: 'ecu-pin-14',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Suzuki #8: 4AT Shift Solenoid A/B Open Circuit (P0751/P0756)',
  },
  {
    id: 'scenario-suzuki-9',
    scenarioNumber: 9,
    brandKey: 'suzuki',
    brandLabel: 'Suzuki',
    market: 'PH Market',
    targetModuleAndModels: 'BCM / Immobilizer Module (Ertiga / Swift / Jimny)',
    dtcCode: 'B1150 / U0140',
    faultDescription: 'Immobilizer Transponder Communication / Lost Communication with BCM',
    benchSimulationSetup:
      'Disconnect CAN-H/CAN-L between ECM and BCM or leave the transponder antenna coil open during ignition-ON simulation.',
    expectedEcuBehavior:
      'BCM blocks starter relay ground trigger and broadcasts immobilizer fuel-cut inhibit message over CAN bus.',
    recommendedPinId: 'ecu-pin-13',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Suzuki #9: BCM CAN / Transponder Coil Open (B1150/U0140)',
  },
  {
    id: 'scenario-suzuki-10',
    scenarioNumber: 10,
    brandKey: 'suzuki',
    brandLabel: 'Suzuki',
    market: 'PH Market',
    targetModuleAndModels: 'ABS / ESP Control Module (Ertiga / Swift / Jimny)',
    dtcCode: 'C1021 – C1028',
    faultDescription: 'Front/Rear Wheel Speed Sensor Circuit Open or Short',
    benchSimulationSetup:
      'Open-circuit or short-to-ground the active wheel speed sensor current loop on the ABS bench breakout box.',
    expectedEcuBehavior:
      'ABS module disables ABS, EBD, and ESP systems, broadcasting warning lamp ON flags over the CAN bus.',
    recommendedPinId: 'ecu-pin-15',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Suzuki #10: Active WSS Loop Open / Grounded (C1021–C1028)',
  },
  // Batch 8: Honda (PH Market — City, Civic, BR-V, CR-V, Brio)
  {
    id: 'scenario-honda-1',
    scenarioNumber: 1,
    brandKey: 'honda',
    brandLabel: 'Honda',
    market: 'PH Market',
    targetModuleAndModels: 'PCM (City / BR-V / Civic L15Z1 & R18Z1)',
    dtcCode: 'P2135 / P2118',
    faultDescription: 'Throttle Position Sensor (TPS) 1/2 Correlation / Actuator Current',
    benchSimulationSetup:
      'Cross-short TPS1 and TPS2 analog return lines or open-circuit the Electronic Throttle Control (ETCS) motor power relay pin.',
    expectedEcuBehavior:
      'PCM immediately cuts power to the throttle motor H-bridge driver, locking the throttle plate at ~6° mechanical fail-safe angle.',
    recommendedPinId: 'ecu-pin-7',
    recommendedFaultType: 'HIGH_RESISTANCE_250R',
    faultPresetLabel: 'Honda #1: TPS1/2 Correlation & ETCS Cut ~6° Limp (P2135/P2118)',
  },
  {
    id: 'scenario-honda-2',
    scenarioNumber: 2,
    brandKey: 'honda',
    brandLabel: 'Honda',
    market: 'PH Market',
    targetModuleAndModels: 'PCM (Civic / CR-V 1.5L VTEC Turbo L15B7)',
    dtcCode: 'P0299 / P0234',
    faultDescription: 'Turbocharger Underboost / Overboost Condition',
    benchSimulationSetup:
      'Hold MAP/Boost sensor voltage static (< 1.5V or > 4.2V) while varying simulated engine RPM and throttle load on the bench.',
    expectedEcuBehavior:
      'PCM logs boost deviation fault after ~5 seconds under load and cuts PWM duty to the electronic wastegate actuator.',
    recommendedPinId: 'ecu-pin-8',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Honda #2: L15B7 Static Boost Sensor / Wastegate Cut (P0299/P0234)',
  },
  {
    id: 'scenario-honda-3',
    scenarioNumber: 3,
    brandKey: 'honda',
    brandLabel: 'Honda',
    market: 'PH Market',
    targetModuleAndModels: 'PCM (City / BR-V / Brio / Civic)',
    dtcCode: 'P0335 / P0340',
    faultDescription: 'Crankshaft (CKP) / Camshaft (CMP) Position Sensor Circuit',
    benchSimulationSetup:
      'Drop the CKP Hall-effect square wave or phase-shift the CMP signal by > 15° relative to CKP on the bench simulator.',
    expectedEcuBehavior:
      'Dropping CKP immediately halts injector and coil firing; CMP loss forces extended cranking and batch-fire limp synchronization.',
    recommendedPinId: 'ecu-pin-11',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Honda #3: CKP Signal Drop / CMP Phase Shift (P0335/P0340)',
  },
  {
    id: 'scenario-honda-4',
    scenarioNumber: 4,
    brandKey: 'honda',
    brandLabel: 'Honda',
    market: 'PH Market',
    targetModuleAndModels: 'PCM (All Honda i-VTEC / Earth Dreams Models)',
    dtcCode: 'P2646 / P2647',
    faultDescription: 'VTEC Oil Pressure Switch / Rocker Arm Oil Control Solenoid',
    benchSimulationSetup:
      'Open-circuit the VTEC spool valve solenoid load resistor or fail to toggle the VTEC oil pressure switch input when RPM exceeds 4,500.',
    expectedEcuBehavior:
      'PCM logs VTEC system fault, illuminates MIL, and caps engine speed at ~3,000–3,500 RPM limp mode.',
    recommendedPinId: 'ecu-pin-10',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Honda #4: VTEC Spool Solenoid Open / Oil Switch Fault (P2646/P2647)',
  },
  {
    id: 'scenario-honda-5',
    scenarioNumber: 5,
    brandKey: 'honda',
    brandLabel: 'Honda',
    market: 'PH Market',
    targetModuleAndModels: 'PCM (City / Civic / CR-V)',
    dtcCode: 'P0102 / P0103',
    faultDescription: 'Mass Air Flow (MAF) Sensor Circuit Low / High',
    benchSimulationSetup:
      'Drop MAF sensor frequency/voltage below 0.2V (open circuit) or pull above 4.8V (short to 5V reference) on the breakout box.',
    expectedEcuBehavior:
      'PCM ignores MAF input, switches to fail-safe speed-density (MAP/RPM) fueling map, and disables closed-loop fuel trim.',
    recommendedPinId: 'ecu-pin-8',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Honda #5: MAF Sensor Open <0.2V / Speed-Density Fail-Safe (P0102/P0103)',
  },
  {
    id: 'scenario-honda-6',
    scenarioNumber: 6,
    brandKey: 'honda',
    brandLabel: 'Honda',
    market: 'PH Market',
    targetModuleAndModels: 'PCM (All Honda Electronic Models)',
    dtcCode: 'P0606 / P0602',
    faultDescription: 'PCM Processor / Control Module Programming Error',
    benchSimulationSetup:
      'Simulate cranking voltage sag (< 6.5V for 250ms) on the main +12V battery feed or inject corrupted EEPROM checksum sector.',
    expectedEcuBehavior:
      'Internal watchdog resets main CPU, inhibits PGM-FI main relay/injector drivers, and latches internal ECU fault.',
    recommendedPinId: 'ecu-pin-3',
    recommendedFaultType: 'HIGH_RESISTANCE_250R',
    faultPresetLabel: 'Honda #6: Cranking Sag <6.5V Watchdog Reset (P0606/P0602)',
  },
  {
    id: 'scenario-honda-7',
    scenarioNumber: 7,
    brandKey: 'honda',
    brandLabel: 'Honda',
    market: 'PH Market',
    targetModuleAndModels: 'PCM / TCM (City / BR-V / Civic Earth Dreams CVT)',
    dtcCode: 'P0842 / P0843',
    faultDescription: 'Transmission Fluid Pressure (TFP) Sensor/Switch "A" Circuit Low / High',
    benchSimulationSetup:
      'Pull the CVT secondary/pulley pressure sensor analog input below 0.3V or above 4.8V on the transmission simulator harness.',
    expectedEcuBehavior:
      'PCM/TCM enters hydraulic fail-safe mode, locks pulley ratio to low/safe gear, and flashes the "D" indicator over CAN.',
    recommendedPinId: 'ecu-pin-9',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Honda #7: Earth Dreams CVT TFP Sensor Low <0.3V (P0842/P0843)',
  },
  {
    id: 'scenario-honda-8',
    scenarioNumber: 8,
    brandKey: 'honda',
    brandLabel: 'Honda',
    market: 'PH Market',
    targetModuleAndModels: 'PCM / TCM (City / Civic / CR-V CVT & 5AT)',
    dtcCode: 'P0715 / P0720',
    faultDescription: 'Input/Turbine Speed Sensor or Output/Countershaft Speed Sensor',
    benchSimulationSetup:
      'Cut or ground the Hall-effect square-wave signal on the input or output shaft speed pin while simulating drive load.',
    expectedEcuBehavior:
      'Module loses gear-ratio calculation, forces transmission into hydraulic fail-safe mode, and disables paddle/sport shift mode.',
    recommendedPinId: 'ecu-pin-14',
    recommendedFaultType: 'SHORT_TO_GND',
    faultPresetLabel: 'Honda #8: CVT/5AT Input/Output Speed No Signal (P0715/P0720)',
  },
  {
    id: 'scenario-honda-9',
    scenarioNumber: 9,
    brandKey: 'honda',
    brandLabel: 'Honda',
    market: 'PH Market',
    targetModuleAndModels: 'BCM / MICU (Multiplex Integrated Control Unit)',
    dtcCode: 'U0155 / B1000',
    faultDescription: 'Lost Communication with Gauge Control Module / F-CAN Bus Off',
    benchSimulationSetup:
      'Disconnect F-CAN (Fast CAN) or B-CAN lines between PCM, MICU, and cluster simulator, or leave immobilizer unit unplugged.',
    expectedEcuBehavior:
      'MICU blocks starter cut relay ground trigger and broadcasts immobilizer fuel-cut inhibit message over CAN bus.',
    recommendedPinId: 'ecu-pin-13',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Honda #9: MICU F-CAN / B-CAN Bus Off & Lost Cluster Comm (U0155/B1000)',
  },
  {
    id: 'scenario-honda-10',
    scenarioNumber: 10,
    brandKey: 'honda',
    brandLabel: 'Honda',
    market: 'PH Market',
    targetModuleAndModels: 'VSA Modulator-Control Unit (City / Civic / CR-V / BR-V)',
    dtcCode: 'C0031 – C0040',
    faultDescription: 'Front/Rear Wheel Speed Sensor Circuit Open or Short',
    benchSimulationSetup:
      'Open-circuit or short-to-ground the active wheel speed sensor current loop on the VSA bench breakout box.',
    expectedEcuBehavior:
      'VSA ECU immediately disables ABS, EBD, Vehicle Stability Assist (VSA), and Hill Start Assist, broadcasting warning flags over CAN.',
    recommendedPinId: 'ecu-pin-15',
    recommendedFaultType: 'OPEN_CIRCUIT',
    faultPresetLabel: 'Honda #10: VSA Active WSS Loop Open / Grounded (C0031–C0040)',
  },
];

export function getBenchTestScenarios(brandKey?: string): BenchTestScenarioEntry[] {
  if (!brandKey || brandKey === 'ALL' || brandKey === 'universal-bench') {
    return BENCH_TEST_SCENARIOS;
  }
  return BENCH_TEST_SCENARIOS.filter((s) => s.brandKey === brandKey);
}

export interface OemPcbPlatformSpec {
  id: string;
  brandKey: 'toyota' | 'ford' | 'mitsubishi' | 'nissan';
  platformName: string;
  engineOrTransmission: string;
  boardPartNumbers: string[];
  mcuArchitecture: string;
  memoryAndEeprom: string;
  powerAndDriverLsi: string;
  canOrInterface: string;
  bulkCapacitors: string;
  passiveAndProtection: string;
  crystalFrequency: string;
  benchCheckNotes: string;
  voiceSummary: string;
}

export const OEM_PCB_HARDWARE_SPECS: OemPcbPlatformSpec[] = [
  // --- TOYOTA 10 PLATFORMS (Batch 1 of 8: Denso / Fujitsu Ten) ---
  {
    id: 'pcb-toyota-1gd-2gd',
    brandKey: 'toyota',
    platformName: 'Hilux / Fortuner / Innova 1GD/2GD',
    engineOrTransmission: '2.8L 1GD-FTV & 2.4L 2GD-FTV Common Rail Diesel',
    boardPartNumbers: ['Denso 275922-022', 'Denso 275922-450'],
    mcuArchitecture: 'Renesas/NEC 76F0085 (32-bit RISC)',
    memoryAndEeprom: 'EEPROM 93C86 (TSSOP-8 / SOIC-8)',
    powerAndDriverLsi: 'Power/Driver LSI Denso SE811 / SE921; EDU high-speed trigger interface to external 89871-71010',
    canOrInterface: 'CAN Transceiver TJA1051 / PCA82C250 (V230)',
    bulkCapacitors: '4× 220 µF / 35V Low-ESR SMD electrolytic filter capacitors',
    passiveAndProtection: 'CAN Termination: 2× 60.4 Ω + 4.7 nF split cap; SCV / VNT Turbo FETs: N-Channel 60V / 30A DPAK',
    crystalFrequency: '16.000 MHz SMD (Main Clock)',
    benchCheckNotes: 'Denso 275922-022 features low-ESR SMD electrolytic capacitors (100-220µF, 35V/50V) on +12V battery rail. Check 27V TVS diode on +B for polarity reversal. Injectors driven by external EDU 89871-71010: verify 5V square-wave IJt#1-#4 triggers & IJf feedback.',
    voiceSummary: 'Toyota 1GD/2GD Denso 275922-022 uses Renesas 76F0085 MCU, 16 MHz crystal, 93C86 EEPROM, Denso SE811/SE921 LSI, 4 bulk 220 microfarad 35 volt SMD caps, and 60V 30A DPAK MOSFETs for the suction control valve and turbo actuator.',
  },
  {
    id: 'pcb-toyota-1kd-2kd',
    brandKey: 'toyota',
    platformName: 'Hilux / Fortuner / Hiace 1KD/2KD',
    engineOrTransmission: '3.0L 1KD-FTV & 2.5L 2KD-FTV D-4D Common Rail',
    boardPartNumbers: ['Denso 175822-887', 'Denso 175822-799'],
    mcuArchitecture: 'Dual Processor NEC 76F0038AGD (Main) / NEC 76F0040AGD (Sub/Watchdog)',
    memoryAndEeprom: 'EEPROM 93C86 (SOIC-8, mask L86 / S330 storing immobilizer & injector codes)',
    powerAndDriverLsi: 'Denso SE627 System Power IC (5V / 3.3V regulators + hardware watchdog); Precision 5.0V LDO for Sensor VC',
    canOrInterface: 'CAN Transceiver TJA1050 / PCA82C250 located directly behind CANH/CANL pins',
    bulkCapacitors: '3× 220 µF / 35V + 2× 100 µF / 35V SMD capacitors protecting +B and IGSW lines',
    passiveAndProtection: 'TVS Diode: 27V / 600W SMB across +B and E1; Current Shunts: 0.02 Ω (R020) 1W SMD',
    crystalFrequency: '20.000 MHz Clock Crystal (CPU #1) & Sub-Crystal (CPU #2)',
    benchCheckNotes: 'Jump-start polarity reversal shorts the 27V SMB TVS diode across +B and E1 dead to ground, blowing the external EFI MAIN fuse. A cracked 10µF ceramic MLCC bypass capacitor near SE627 pulls 5V VC below 2.0V, shutting down CKP, CMP, FRP, and TPS simultaneously.',
    voiceSummary: 'Toyota 1KD/2KD Denso 175822-887 has dual NEC 76F0038 processors, 20 MHz crystal, 93C86 EEPROM, SE627 power IC, 27V TVS protection diode on plus battery, and three 220 microfarad 35 volt bulk caps.',
  },
  {
    id: 'pcb-toyota-1tr-fe',
    brandKey: 'toyota',
    platformName: 'Innova 2.0L Gasoline',
    engineOrTransmission: '2.0L 1TR-FE VVT-i DOHC Gasoline',
    boardPartNumbers: ['Denso 175822-666', 'Denso 275036-2880'],
    mcuArchitecture: 'NEC 76F0039GD / 76F0040GD 32-bit MCU',
    memoryAndEeprom: 'EEPROM 93C56 or 93C66 (SOIC-8)',
    powerAndDriverLsi: 'Throttle H-Bridge: Denso SE616 / TLE6209R; Injector & Coil Pre-Driver: Denso SE654 Octal Low-Side',
    canOrInterface: 'CAN Transceiver TJA1050',
    bulkCapacitors: '2× 220 µF / 35V + 2× 47 µF / 35V electrolytic capacitors',
    passiveAndProtection: 'IGT Pull-ups: 1.0 kΩ (0603) to 5V logic; O2 Heater FET: N-Channel 60V / 15A SOT-223',
    crystalFrequency: '16.000 MHz Resonator',
    benchCheckNotes: 'Denso SE616 H-bridge driver controls the electronic throttle motor. SE654 octal low-side driver sinks injector pulses. Check 1.0kΩ IGT pull-up resistors if no ignition trigger pulse.',
    voiceSummary: 'Toyota Innova 1TR-FE gasoline Denso board uses NEC 76F0039 MCU, 16 MHz clock, SE616 throttle H-bridge, SE654 octal low-side injector driver, and 220 microfarad plus 47 microfarad bulk capacitors.',
  },
  {
    id: 'pcb-toyota-hiace-1gd',
    brandKey: 'toyota',
    platformName: 'Hiace Commuter / GL Grandia 1GD',
    engineOrTransmission: '2.8L 1GD-FTV Diesel (Euro 4 / Euro 5)',
    boardPartNumbers: ['Denso 275922-022', 'Denso 276100-6832'],
    mcuArchitecture: 'Renesas 76F0085 / 76F0196 32-bit RISC MCU',
    memoryAndEeprom: 'EEPROM 93C86 (TSSOP-8)',
    powerAndDriverLsi: 'Power/System LSI Denso SE921; EGR H-Bridge: Integrated full-bridge motor IC',
    canOrInterface: 'Dual Network: TJA1020 (LIN Bus) + TJA1051 (CAN Bus)',
    bulkCapacitors: '4× 220 µF / 35V Low-ESR SMD capacitors',
    passiveAndProtection: 'EGR Current Sense: 0.015 Ω (R015) 2W SMD; NE/G2 Crank/Cam Filters: 1.0 kΩ series + 1000 pF to GND',
    crystalFrequency: '20.000 MHz SMD Crystal',
    benchCheckNotes: 'Euro 4/5 Hiace ECM integrates dedicated EGR DC motor H-bridge driver with 0.015Ω shunt resistor. Low-pass RC filter on NE/G2 (1.0kΩ + 1000pF) filters out starter motor electrical ripple.',
    voiceSummary: 'Hiace 1GD-FTV Denso board uses Renesas 76F0085 or 76F0196, 20 MHz crystal, Denso SE921 LSI, LIN and CAN transceivers, and 0.015 ohm EGR current sense shunt.',
  },
  {
    id: 'pcb-toyota-1nz-2nz',
    brandKey: 'toyota',
    platformName: 'Vios / Yaris 1NZ/2NZ-FE',
    engineOrTransmission: '1.5L 1NZ-FE & 1.3L 2NZ-FE VVT-i Gasoline',
    boardPartNumbers: ['Fujitsu Ten 211941-32200930', 'Denso 275036-1152'],
    mcuArchitecture: 'Fujitsu MB91F362 / NEC 76F0038GD 32-bit MCU',
    memoryAndEeprom: 'EEPROM 93C56 (SOIC-8, mask S220)',
    powerAndDriverLsi: 'Fujitsu Ten Custom Multi-Regulator System LSI (3.3V / 5V / 8V); ETC Driver: BA6285 / SE616 H-Bridge',
    canOrInterface: 'CAN Transceiver PCA82C250 (V230) / TJA1050',
    bulkCapacitors: '3× 100 µF / 35V + 1× 220 µF / 25V filter capacitors',
    passiveAndProtection: 'Injector Drivers: 4× N-Channel 60V / 10A SOT-223; Knock Filter: Bandpass 6.5–7.5 kHz RC network',
    crystalFrequency: '16.000 MHz Crystal Resonator',
    benchCheckNotes: 'Fujitsu Ten custom multi-regulator supplies 3.3V to MCU core, 5V to sensors, and 8V internal gate bias. SOT-223 injector FETs can short drain-to-source if injector wiring rubs against engine block.',
    voiceSummary: 'Toyota Vios 1NZ/2NZ-FE Fujitsu Ten board features MB91F362 MCU, 16 MHz resonator, 93C56 EEPROM, custom 3.3V/5V/8V system LSI, BA6285 throttle driver, and 60V 10A SOT-223 injector FETs.',
  },
  {
    id: 'pcb-toyota-2nr-1nr',
    brandKey: 'toyota',
    platformName: 'Vios / Yaris 2NR/1NR-FE Dual VVT-i',
    engineOrTransmission: '1.5L 2NR-FE & 1.3L 1NR-FE Dual VVT-i',
    boardPartNumbers: ['Denso 275236-0011', 'Denso 275036-9170'],
    mcuArchitecture: 'Renesas/NEC 76F0038GD / 76F0085 High-Speed MCU',
    memoryAndEeprom: 'EEPROM 93C66 (TSSOP-8)',
    powerAndDriverLsi: 'Power/Pre-Driver LSI Denso SE811; Dual VVT OCV: Dual PWM low-side drivers',
    canOrInterface: 'CAN Transceiver TJA1051',
    bulkCapacitors: '3× 220 µF / 35V SMD capacitors',
    passiveAndProtection: 'OCV Flyback Diodes: 40V / 3A Schottky (SMB); TPS/MAP Pull-downs: 10 kΩ (0603) 1%',
    crystalFrequency: '20.000 MHz Clock Crystal',
    benchCheckNotes: 'Denso 275236-0011 board architecture features dedicated intake and exhaust VVT oil control valve drivers protected by 40V/3A Schottky flyback diodes against inductive turn-off voltage spikes.',
    voiceSummary: 'Vios Dual VVT-i 2NR-FE Denso 275236-0011 uses Renesas 76F0085, 20 MHz crystal, SE811 LSI, dual PWM VVT drivers with 40V 3A Schottky diodes, and 93C66 EEPROM.',
  },
  {
    id: 'pcb-toyota-wigo-1kr',
    brandKey: 'toyota',
    platformName: 'Wigo / Agya 1.0L',
    engineOrTransmission: '1.0L 1KR-FE & 1KR-VE 3-Cylinder Gasoline',
    boardPartNumbers: ['Denso 275036-7341', 'Denso 112700-3410'],
    mcuArchitecture: 'NEC 76F0038GD / 76F0039AGD',
    memoryAndEeprom: 'EEPROM 93C56 (SOIC-8)',
    powerAndDriverLsi: 'System Power IC Denso SE627; 3-Cyl Driver: Denso SE654 Multi-Channel Octal Driver',
    canOrInterface: 'CAN Transceiver TJA1050',
    bulkCapacitors: '2× 100 µF / 35V + 1× 220 µF / 25V',
    passiveAndProtection: 'Coil Triggers (IGT1–3): 470 Ω + 100 pF RF filter; TVS Diode: 24V / 600W SMB on switched ignition',
    crystalFrequency: '16.000 MHz SMD Crystal',
    benchCheckNotes: 'Compact 3-cylinder board layout. IGT1-3 ignition coil trigger lines feature 470Ω series resistors with 100pF bypass capacitors. TVS diode protects against alternator load-dump spikes.',
    voiceSummary: 'Toyota Wigo 1KR-FE Denso board uses NEC 76F0038 MCU, 16 MHz crystal, 93C56 EEPROM, SE627 power IC, SE654 driver, and 470 ohm ignition coil trigger filters.',
  },
  {
    id: 'pcb-toyota-avanza-rush',
    brandKey: 'toyota',
    platformName: 'Avanza / Rush 2NR/1NR-VE',
    engineOrTransmission: '1.5L 2NR-VE & 1.3L 1NR-VE Dual VVT-i (Daihatsu/Toyota Platform)',
    boardPartNumbers: ['Denso 275236-0011', 'Denso 89560-BZxxx'],
    mcuArchitecture: 'Renesas/NEC 76F0038GD 32-bit MCU',
    memoryAndEeprom: 'EEPROM 93C66 (SOIC-8)',
    powerAndDriverLsi: 'Power/Driver LSI Denso SE811; ETC Motor: Integrated full-bridge H-bridge IC',
    canOrInterface: 'CAN Transceiver TJA1051',
    bulkCapacitors: '3× 220 µF / 35V SMD capacitors',
    passiveAndProtection: 'Sensor 5V Ref (VC): 5.00V ± 0.05V with 10 µF bypass capacitor; Injector Clamps: 45V active Zener clamp',
    crystalFrequency: '20.000 MHz Crystal',
    benchCheckNotes: 'Electronic throttle motor driven by integrated full-bridge IC. Sensor 5.00V reference has 10µF bypass capacitor; check for short to ground if VC reads < 2.0V.',
    voiceSummary: 'Avanza and Rush 2NR-VE Denso board has Renesas 76F0038 MCU, 20 MHz crystal, SE811 LSI, 93C66 EEPROM, and 45V active Zener injector voltage clamps.',
  },
  {
    id: 'pcb-toyota-corolla-altis',
    brandKey: 'toyota',
    platformName: 'Corolla Altis 1ZR/2ZR-FE',
    engineOrTransmission: '1.6L 1ZR-FE & 1.8L 2ZR-FE Dual VVT-i / Valvematic',
    boardPartNumbers: ['Denso 275036-9050', 'Denso 275236-0011'],
    mcuArchitecture: 'Renesas/NEC 76F0038GD / 76F0085',
    memoryAndEeprom: 'EEPROM 93C66 (SOIC-8)',
    powerAndDriverLsi: 'System LSI Denso SE811 / SE921; Valvematic / VVT: Dedicated PWM driver IC',
    canOrInterface: 'CAN Transceiver TJA1051',
    bulkCapacitors: '3× 220 µF / 35V SMD capacitors',
    passiveAndProtection: 'MAF Input (VG): 2.2 kΩ series + 4.7 nF filter; A/F Sensor (A1A+/-): 100 Ω differential shunt',
    crystalFrequency: '20.000 MHz SMD Crystal',
    benchCheckNotes: 'Dense SMD resistor/capacitor filtering banks below main white header. Air/Fuel ratio sensor stage includes 100Ω precision differential shunt for microamp pump current sensing.',
    voiceSummary: 'Corolla Altis 1ZR/2ZR-FE Denso board has Renesas 76F0085 MCU, 20 MHz crystal, SE811/SE921 LSI, 93C66 EEPROM, and 100 ohm differential shunt for the air fuel sensor.',
  },
  {
    id: 'pcb-toyota-ac60-tcm',
    brandKey: 'toyota',
    platformName: 'Fortuner / Hilux 6AT TCM AC60',
    engineOrTransmission: 'Aisin AC60E / AC60F 6-Speed Automatic Transmission',
    boardPartNumbers: ['Aisin AW / Denso 89530-71xxx'],
    mcuArchitecture: 'Renesas SH7058 / 76F0038 32-bit Microcontroller',
    memoryAndEeprom: 'EEPROM 93C66 (stores shift adaptation & clutch learn values)',
    powerAndDriverLsi: 'Linear Solenoid Drivers: 4× Constant-current PWM closed-loop driver ICs (SL1–SL4, SLU, SLT)',
    canOrInterface: 'CAN Transceiver TJA1050',
    bulkCapacitors: '2× 220 µF / 35V High-Temperature (125°C rated) electrolytic capacitors',
    passiveAndProtection: 'Solenoid Current Sense: 0.05 Ω (R050) 1% shunts; Speed Sensor Pull-ups (NT/SP2): 2.2 kΩ to 5V',
    crystalFrequency: '16.000 MHz Clock Crystal',
    benchCheckNotes: 'Dedicated transmission control unit board. Constant-current PWM closed-loop driver ICs drive shift solenoids SL1-SL4, lockup SLU, and line pressure SLT. Solenoid current sense resistors are 0.05Ω 1%.',
    voiceSummary: 'Toyota 6AT AC60 TCM Aisin board features Renesas SH7058 MCU, 16 MHz crystal, 93C66 adaptation EEPROM, closed loop PWM solenoid drivers, and 0.05 ohm current sense shunts.',
  },

  // --- FORD 10 PLATFORMS (Batch 2 of 8: Continental / Bosch / FoMoCo) ---
  {
    id: 'pcb-ford-sid208-t6',
    brandKey: 'ford',
    platformName: 'Ranger / Everest T6 2.2L/3.2L Duratorq',
    engineOrTransmission: '2.2L & 3.2L Duratorq TDCi Common Rail Turbo Diesel',
    boardPartNumbers: ['Continental SID208', 'Continental SID209'],
    mcuArchitecture: 'Infineon Tricore TC1797 (BGA-292, 180 MHz 32-bit RISC)',
    memoryAndEeprom: 'Internal 4MB Flash + 64KB D-Flash EEPROM Emulation',
    powerAndDriverLsi: 'Continental ATIC91 System IC / Infineon TLE7368; Piezo High-Side: IRF640 / STD25NF20 N-Channel FETs',
    canOrInterface: 'CAN Transceivers TJA1041 / TJA1042',
    bulkCapacitors: '3× 220 µF / 35V SMD bulk capacitors; Piezo Boost: 2× 47 µF / 250V + 100 µH toroidal power inductor',
    passiveAndProtection: 'CAN Termination: 2× 60.4 Ω + 4.7 nF; Current Sense: 0.010 Ω (R010) shunt; TVS Diode: 27V / 600W SMB',
    crystalFrequency: '20.000 MHz SMD Crystal',
    benchCheckNotes: 'Continental SID208/209 incorporates high-energy DC-DC boost converter generating 110V–180V for piezo injectors. A shorted IRF640/STD25NF20 high-side MOSFET or open 0.01Ω current sense resistor collapses the piezo rail, triggering P0201-P0204 or P062D and disabling all 4 injectors.',
    voiceSummary: 'Ford Ranger T6 SID208 Continental ECU uses Infineon Tricore TC1797 BGA, 20 MHz crystal, ATIC91 power IC, toroidal inductor with 250 volt boost capacitors for 110 to 180 volt piezo rail, and 0.01 ohm current shunt.',
  },
  {
    id: 'pcb-ford-sid212-ecoblue',
    brandKey: 'ford',
    platformName: 'Next-Gen Ranger / Everest 2.0L EcoBlue',
    engineOrTransmission: '2.0L EcoBlue Single-Turbo & Bi-Turbo Diesel',
    boardPartNumbers: ['Continental SID212', 'Bosch MD1CS005'],
    mcuArchitecture: 'Multi-Core Infineon Aurix TC297TP (300 MHz) / TC277 BGA Processor',
    memoryAndEeprom: 'Internal 8MB P-Flash + Emulated EEPROM with HSM Security Core',
    powerAndDriverLsi: 'Bosch 40184 / CJ327 System Power IC; Dual-bank solenoid/piezo injector driver stage',
    canOrInterface: 'FD-CAN Transceivers TJA1043 / TJA1145 (5 Mbps CAN Flexible Data-Rate)',
    bulkCapacitors: '4× 220 µF / 35V Low-ESR SMD filter capacitors with dual-stage synchronous buck regulators',
    passiveAndProtection: 'Current Shunts: 0.010 Ω (R010) 2W 1%; TVS Protection: 28V / 1500W SMC transient suppressor',
    crystalFrequency: '20.000 MHz SMD Crystal',
    benchCheckNotes: 'Advanced Aurix TC297 multicore architecture with dual-stage synchronous buck regulators and shielded ferrite inductors. CAN-FD communication over TJA1043. High-surge 28V 1500W TVS protects power entrance.',
    voiceSummary: 'Next-Gen Ranger 2.0L EcoBlue SID212 uses Infineon Aurix TC297 multicore MCU, 20 MHz crystal, Bosch 40184 power IC, CAN FD transceivers, and 28V 1500W TVS surge protection.',
  },
  {
    id: 'pcb-ford-ems2211-ecosport',
    brandKey: 'ford',
    platformName: 'EcoSport / Fiesta 1.5L Ti-VCT',
    engineOrTransmission: '1.5L Ti-VCT Sigma & 1.5L Dragon 3-Cylinder Gasoline',
    boardPartNumbers: ['Continental EMS2211', 'Continental EMS2510'],
    mcuArchitecture: 'Infineon Tricore TC1738 / TC1782 QFP Microcontroller',
    memoryAndEeprom: 'Internal 2MB / 2.5MB Flash + D-Flash EEPROM Emulation',
    powerAndDriverLsi: 'Continental ATIC111 / Infineon TLE8888 Multi-Output Power & Injector LSI; ETC H-Bridge: TLE7209-2R',
    canOrInterface: 'CAN Transceiver TJA1042',
    bulkCapacitors: '2× 220 µF / 35V SMD capacitors',
    passiveAndProtection: 'Ignition Coil Drivers: 4× 400V / 18A IGBTs (ISL9V3040D3S / STGD18N40LZ in SOT-223); TPS Pull-ups: 4.7 kΩ (0603) 1%',
    crystalFrequency: '20.000 MHz SMD Crystal',
    benchCheckNotes: 'A shorted ignition coil primary winding on the vehicle frequently burns the 400V/18A SOT-223 IGBT on the PCB and opens the 100Ω gate drive resistor from the ATIC111 driver IC, causing P0351-P0354 DTCs.',
    voiceSummary: 'EcoSport 1.5L EMS2211 board uses Infineon Tricore TC1738, 20 MHz crystal, ATIC111 power IC, TLE7209 throttle H-bridge, and four 400V 18A IGBT coil drivers.',
  },
  {
    id: 'pcb-ford-med17-focus',
    brandKey: 'ford',
    platformName: 'Focus / EcoSport 2.0L/1.5L GDI',
    engineOrTransmission: '2.0L & 1.5L Ti-VCT Gasoline Direct Injection (GDI)',
    boardPartNumbers: ['Bosch MED17.0', 'Bosch MED17.2', 'Continental EMS2511'],
    mcuArchitecture: 'Infineon Tricore TC1767 / TC1793 32-bit MCU',
    memoryAndEeprom: 'Internal Flash + 64KB EEPROM',
    powerAndDriverLsi: 'Bosch 30622 / 40048 System Power IC; GDI High-Voltage Booster Driver: Bosch 30682 (generates 65V boost rail)',
    canOrInterface: 'CAN Transceiver TJA1040',
    bulkCapacitors: '3× 220 µF / 35V SMD capacitors; GDI Boost: 100 µF / 100V capacitor + 47 µH power inductor',
    passiveAndProtection: 'Fuel Pressure Shunt: 0.02 Ω (R020) 1W SMD; Flyback Schottky Diodes for DI Injectors',
    crystalFrequency: '20.000 MHz SMD Crystal',
    benchCheckNotes: 'Direct injection system incorporates Bosch 30682 boost driver IC generating a 65V spike to open high-pressure gasoline direct injectors in under 1 millisecond. Test 100µF/100V boost capacitor for ESR degradation.',
    voiceSummary: 'Ford Focus GDI Bosch MED17 board has Infineon Tricore TC1767, 20 MHz crystal, Bosch 30622 power IC, Bosch 30682 65V GDI boost driver, and 100 microfarad 100V boost cap.',
  },
  {
    id: 'pcb-ford-powershift-6dct250',
    brandKey: 'ford',
    platformName: 'PowerShift 6AT TCM (6DCT250 DPS6)',
    engineOrTransmission: '6-Speed Dual-Clutch Dry Automatic Transmission (Fiesta, EcoSport, Focus)',
    boardPartNumbers: ['Continental A2C53377498', 'FoMoCo AE8Z-7Z369-F'],
    mcuArchitecture: 'Infineon Tricore TC1766 (BGA-176, 80 MHz 32-bit)',
    memoryAndEeprom: 'Internal 1.5MB Flash + 32KB D-Flash (stores clutch kiss points & shift adaptation)',
    powerAndDriverLsi: 'Infineon TLE7183F / TLE7189F 3-phase/dual H-bridge gate drivers; TLE6251DS CAN transceiver',
    canOrInterface: 'High-Speed CAN over TLE6251DS transceiver',
    bulkCapacitors: '4× 100 µF / 35V High-Temperature (125°C rated) SMD capacitors',
    passiveAndProtection: 'Shift Drum FETs: 8× N-Channel 40V / 90A DPAK MOSFETs (BSC016N04LS / IPD90N04S4); Motor Shunts: 2× 0.005 Ω (R005) 3W',
    crystalFrequency: '20.000 MHz SMD Crystal',
    benchCheckNotes: 'High-failure TCM module. Inspect the eight 40V/90A DPAK MOSFETs forming the two motor H-bridges and 0.005Ω (R005) shunts. Thermal fatigue on BGA solder balls under the TC1766 MCU or cracked sense resistors causes U0100, P0902, or P090C clutch actuator fault codes.',
    voiceSummary: 'Ford PowerShift 6DCT250 TCM Continental board integrates Infineon Tricore TC1766 BGA, 20 MHz crystal, TLE7183 gate driver, eight 40V 90A DPAK MOSFETs for clutch motors A and B, and 0.005 ohm 3W shunts.',
  },
  {
    id: 'pcb-ford-territory-15t',
    brandKey: 'ford',
    platformName: 'Territory 1.5L EcoBoost',
    engineOrTransmission: '1.5L Turbo Gasoline (4G15T6 EcoBoost)',
    boardPartNumbers: ['Bosch MED17.8.10', 'FoMoCo JS1-12A650'],
    mcuArchitecture: 'Infineon Tricore TC1728 / TC1782 32-bit MCU',
    memoryAndEeprom: 'Internal 1.5MB / 2.5MB Flash Memory',
    powerAndDriverLsi: 'Bosch 40076 / 40114 Power/Driver LSI; GDI Booster: Bosch 30682',
    canOrInterface: 'CAN Transceiver TJA1042',
    bulkCapacitors: '3× 220 µF / 35V SMD capacitors',
    passiveAndProtection: 'Electronic Wastegate FET: N-Channel 60V / 20A DPAK; MAP/Boost Sensor Filter: 1.0 kΩ + 10 nF MLCC',
    crystalFrequency: '20.000 MHz Crystal',
    benchCheckNotes: 'Bosch MED17.8.10 architecture. N-channel 60V/20A DPAK MOSFET drives the electronic turbocharger wastegate actuator. 1.0kΩ + 10nF RC filter buffers the intake manifold pressure sensor.',
    voiceSummary: 'Ford Territory 1.5T Bosch MED17.8.10 board has Infineon Tricore TC1728, 20 MHz crystal, Bosch 40076 power LSI, 30682 GDI boost driver, and 60V 20A wastegate MOSFET.',
  },
  {
    id: 'pcb-ford-ranger-25-na',
    brandKey: 'ford',
    platformName: 'Ranger 2.5L NA Duratec',
    engineOrTransmission: '2.5L Duratec iVCT Naturally Aspirated Gasoline',
    boardPartNumbers: ['FoMoCo / Continental EMS2204', 'FoMoCo AB39-12A650'],
    mcuArchitecture: 'Infineon Tricore TC1738 Microcontroller',
    memoryAndEeprom: 'Internal 2MB Flash + Emulated EEPROM',
    powerAndDriverLsi: 'Continental ATIC111 / TLE7368 System IC; ETC Driver: TLE7209-2R',
    canOrInterface: 'CAN Transceiver TJA1041',
    bulkCapacitors: '2× 220 µF / 35V + 1× 100 µF / 35V capacitors',
    passiveAndProtection: 'Ignition Drivers: 4× 400V / 15A IGBTs; VCT Solenoid Diode: 40V / 3A Schottky',
    crystalFrequency: '20.000 MHz SMD Crystal',
    benchCheckNotes: 'Electronic throttle driven by TLE7209-2R H-bridge. Variable cam timing solenoid has 40V/3A Schottky clamp. Four internal 400V/15A IGBTs fire ignition coils directly without external igniter.',
    voiceSummary: 'Ford Ranger 2.5L gasoline EMS2204 board features Infineon Tricore TC1738, 20 MHz crystal, ATIC111 power IC, TLE7209 throttle driver, and four 400V 15A IGBTs.',
  },
  {
    id: 'pcb-ford-escape-focus-older',
    brandKey: 'ford',
    platformName: 'Escape / Focus Older Gen Duratec & TDCi',
    engineOrTransmission: '2.0L / 2.3L Duratec Gasoline & 2.0L TDCi Diesel',
    boardPartNumbers: ['Visteon ESU-131', 'Visteon ESU-411', 'Siemens SID803A'],
    mcuArchitecture: 'Motorola / NXP MPC561 / MPC555 32-bit PowerPC Processor',
    memoryAndEeprom: 'External AM29BL802C Flash (1MB) + 95320 SPI EEPROM (4KB)',
    powerAndDriverLsi: 'Infineon TLE6240GP Smart 16-Channel Low-Side Switch + TLE6209R ETC Driver',
    canOrInterface: 'CAN Transceiver TJA1050',
    bulkCapacitors: '3× 220 µF / 35V Radial & SMD capacitors',
    passiveAndProtection: 'Coil Drivers: 4× 5503DM Ignition IGBTs; Sensor 5V Ref: 5.00V LDO with 10 µF tantalum bypass; CKP VR Filter: 2.2 kΩ + 4.7 nF differential',
    crystalFrequency: '4.000 MHz (PLL Base) / 20.000 MHz System Clock',
    benchCheckNotes: 'Visteon ESU series utilizes external parallel Flash memory AM29BL802C and SPI EEPROM 95320. Crank position VR sensor input is conditioned via 2.2kΩ differential resistors and 4.7nF capacitors.',
    voiceSummary: 'Ford Escape and Focus older gen Visteon ESU board has Motorola MPC561 processor, external AM29BL802C flash, 95320 EEPROM, TLE6240GP multi switch, and 5503DM ignition IGBTs.',
  },
  {
    id: 'pcb-ford-explorer-ecoboost',
    brandKey: 'ford',
    platformName: 'Explorer 2.0L/2.3L EcoBoost & 3.5L V6',
    engineOrTransmission: '2.0L & 2.3L EcoBoost Turbo / 3.5L Duratec V6',
    boardPartNumbers: ['Bosch MEDG17.0', 'FoMoCo / Continental'],
    mcuArchitecture: 'Infineon Tricore TC1797 (BGA-292, 180 MHz)',
    memoryAndEeprom: 'Internal 4MB Flash + 64KB EEPROM',
    powerAndDriverLsi: 'Bosch 30622 / 40048 System Power IC; GDI & Coil Driver: Bosch 30682 + 6× High-Current IGBTs',
    canOrInterface: 'Dual High-Speed CAN: Dual TJA1042 transceivers (HS1 Powertrain CAN + HS2 Chassis CAN)',
    bulkCapacitors: '4× 220 µF / 35V SMD bulk capacitors',
    passiveAndProtection: 'GDI High-Side FETs: 60V / 35A DPAK; O2 Sensor Pump Current Shunt: 61.9 Ω 0.1% precision',
    crystalFrequency: '20.000 MHz SMD Crystal',
    benchCheckNotes: 'Dual high-speed CAN architecture (HS1 and HS2). Direct injection booster rail powered by Bosch 30682. Wideband upstream oxygen sensor circuit includes 61.9Ω 0.1% precision shunt for pump cell calibration.',
    voiceSummary: 'Ford Explorer EcoBoost Bosch MEDG17 board uses Infineon Tricore TC1797, 20 MHz crystal, dual CAN transceivers, Bosch 30682 GDI driver, and 61.9 ohm 0.1% oxygen sensor precision shunt.',
  },
  {
    id: 'pcb-ford-transit-22-tdci',
    brandKey: 'ford',
    platformName: 'Transit Van 2.2L TDCi',
    engineOrTransmission: '2.2L Duratorq TDCi Diesel',
    boardPartNumbers: ['Continental SID208', 'Visteon DCU-102', 'Visteon DCU-201'],
    mcuArchitecture: 'Infineon TC1797 (SID208) or STMicroelectronics ST10F276 (DCU)',
    memoryAndEeprom: 'Internal Flash Memory with Security Boot Sector',
    powerAndDriverLsi: 'Continental ATIC91 / Infineon TLE6240GP; SCV/IMV Driver: Low-side PWM MOSFET',
    canOrInterface: 'CAN Transceivers TJA1041 / TJA1050',
    bulkCapacitors: '3× 220 µF / 35V SMD capacitors; Piezo Boost: 47 µF / 250V (SID208)',
    passiveAndProtection: 'TVS Protection: 27V / 600W SMB on main power rail; SCV Current Sense: 0.02 Ω 2W SMD',
    crystalFrequency: '20.000 MHz SMD Crystal',
    benchCheckNotes: 'Transit models deploy either Continental SID208 (piezo common-rail) or Visteon DCU (solenoid common-rail). Verify high-voltage boost capacitor (47µF/250V) on SID208 variants before condemning injectors.',
    voiceSummary: 'Ford Transit 2.2L TDCi board uses Infineon TC1797 or ST10F276, 20 MHz crystal, ATIC91 power IC, 27V TVS protection diode, and 47 microfarad 250 volt piezo boost capacitor.',
  },

  // --- MITSUBISHI 10 PLATFORMS (Batch 3 of 8: Denso & Melco) ---
  {
    id: 'pcb-mitsubishi-4n15-montero',
    brandKey: 'mitsubishi',
    platformName: 'Montero Sport / Strada 2.4L 4N15 MIVEC',
    engineOrTransmission: '2.4L 4N15 MIVEC Clean Diesel Common Rail',
    boardPartNumbers: ['Denso 275700-7422', '1860C711', '1860D215'],
    mcuArchitecture: 'Renesas SH72543R (32-bit QFP)',
    memoryAndEeprom: 'Internal 2MB Flash + 128KB D-Flash EEPROM',
    powerAndDriverLsi: 'Denso SE921 / SE811 System Power IC; Integrated DC-DC boost controller',
    canOrInterface: 'CAN Transceiver TJA1051',
    bulkCapacitors: '9× 100 µF–220 µF / 35V Low-ESR SMD electrolytic capacitors',
    passiveAndProtection: 'Injector FETs: 6× N-Channel 100V / 30A DPAK; SCV Current Shunt: 0.02 Ω (R020) 1W SMD',
    crystalFrequency: '16.000 MHz SMD Crystal',
    benchCheckNotes: 'Denso 275700-7422 features central bank of nine 100-220µF/35V SMD filter caps supporting piezo/solenoid boost rail and row of 6 DPAK N-channel FETs below main white connector. Check 0.02Ω SCV shunt.',
    voiceSummary: 'Mitsubishi Montero Sport 2.4L 4N15 Denso board uses Renesas SH72543R MCU, 16 MHz crystal, SE921 power IC, 9 bulk SMD capacitors, and 6 100V 30A DPAK injector MOSFETs.',
  },
  {
    id: 'pcb-mitsubishi-4d56-4m41',
    brandKey: 'mitsubishi',
    platformName: 'Montero Sport / Strada 2.5L 4D56 & 3.2L 4M41',
    engineOrTransmission: '2.5L 4D56 & 3.2L 4M41 DI-D Common Rail Turbo Diesel',
    boardPartNumbers: ['Denso 1860B556', 'Denso 275800-8833', '1860A698'],
    mcuArchitecture: 'Dual Renesas SH7058 / SH7059 QFP Processors',
    memoryAndEeprom: 'EEPROM 93C86 (SOIC-8, stores injector QR codes & immobilizer)',
    powerAndDriverLsi: 'Denso SE627 System Power IC (5V/3.3V LDO + watchdog); High-voltage 85V DC-DC injector stage',
    canOrInterface: 'CAN Transceiver TJA1050',
    bulkCapacitors: '6× 220 µF / 35V + 2× 100 µF / 100V capacitors near main header',
    passiveAndProtection: 'TVS Diode: 27V / 600W SMB on +B; CAN Term: 2× 60.4 Ω + 4.7 nF split cap',
    crystalFrequency: '16.000 MHz / 20.000 MHz Crystals',
    benchCheckNotes: 'Denso 1860B556 injector boost stage fault (P0201-P0204 / P0628): inspect 100µF/100V high-voltage boost caps and 100V/30A DPAK boost FET. Leaking electrolyte corrodes adjacent vias, cutting 85V injector pulse.',
    voiceSummary: 'Montero 4D56 and 4M41 Denso 1860B556 board has dual Renesas SH7058 processors, 93C86 EEPROM, SE627 power IC, 85V boost stage, 27V TVS diode, and 100 microfarad 100V boost caps.',
  },
  {
    id: 'pcb-mitsubishi-l300-4n14',
    brandKey: 'mitsubishi',
    platformName: 'L300 Exceed / FB Euro 4 2.2L 4N14',
    engineOrTransmission: '2.2L 4N14 CRDi Diesel (Euro 4)',
    boardPartNumbers: ['Denso 1860D118', 'Denso 275700-6911'],
    mcuArchitecture: 'Renesas SH72531 / SH72543R 32-bit MCU',
    memoryAndEeprom: 'Internal Flash + Emulated EEPROM',
    powerAndDriverLsi: 'Power LSI: Denso SE811; EGR / VGT Driver: Full H-bridge + PWM MOSFET',
    canOrInterface: 'CAN Transceiver TJA1051',
    bulkCapacitors: '4× 220 µF / 35V Low-ESR SMD capacitors',
    passiveAndProtection: 'EGR Shunt: 0.015 Ω (R015) 2W SMD; CKP/CMP Filters: 1.0 kΩ + 1000 pF MLCC',
    crystalFrequency: '16.000 MHz Crystal',
    benchCheckNotes: 'L300 Euro 4 Denso ECU deploys full H-bridge for EGR valve motor and low-pass RC filters (1.0kΩ + 1000pF) on CKP/CMP inputs to suppress alternator ripple.',
    voiceSummary: 'L300 Euro 4 4N14 Denso board features Renesas SH72531 MCU, 16 MHz crystal, Denso SE811 power LSI, four 220 microfarad low ESR caps, and 0.015 ohm EGR current shunt.',
  },
  {
    id: 'pcb-mitsubishi-xpander-4a91',
    brandKey: 'mitsubishi',
    platformName: 'Xpander / Xpander Cross 1.5L 4A91',
    engineOrTransmission: '1.5L 4A91 MIVEC DOHC Gasoline',
    boardPartNumbers: ['Melco 1860D284', 'Melco E6T83xxx'],
    mcuArchitecture: 'Mitsubishi MH8115F (QFP-144, 32-bit)',
    memoryAndEeprom: 'Internal 1.5MB Flash + EEPROM',
    powerAndDriverLsi: 'Melco custom multi-regulator + watchdog; ETC H-Bridge: TLE7209-2R / BA6285',
    canOrInterface: 'CAN Transceiver TJA1042',
    bulkCapacitors: '4× 220 µF / 35V SMD capacitors',
    passiveAndProtection: 'Coil Drivers: 4× 400V / 15A IGBTs (DPAK); TPS Pull-downs: 10 kΩ (0603) 1%',
    crystalFrequency: '16.000 MHz SMD Crystal',
    benchCheckNotes: 'Melco E6T83xxx board uses MH8115F MCU with four discrete DPAK 400V/15A IGBT coil drivers and TLE7209-2R throttle motor H-bridge driver.',
    voiceSummary: 'Mitsubishi Xpander 4A91 Melco board has MH8115F MCU, 16 MHz crystal, TLE7209 electronic throttle driver, four 400V 15A IGBT coil drivers, and 10k ohm TPS pull downs.',
  },
  {
    id: 'pcb-mitsubishi-mirage-3a92',
    brandKey: 'mitsubishi',
    platformName: 'Mirage / Mirage G4 1.2L 3A92',
    engineOrTransmission: '1.2L 3A92 MIVEC 3-Cylinder Gasoline',
    boardPartNumbers: ['Melco 1860C298', 'Melco E6T79xxx', '1860B947'],
    mcuArchitecture: 'Mitsubishi MH8115F / MH8106F 32-bit MCU',
    memoryAndEeprom: 'Internal 1MB / 1.5MB Flash Memory',
    powerAndDriverLsi: 'Melco 5V/3.3V regulator LSI; 3-Cyl Ignition/Inj: Discrete DPAK IGBTs & FETs; ETC H-Bridge',
    canOrInterface: 'CAN Transceiver TJA1040 / TJA1050',
    bulkCapacitors: '6× 100 µF / 35V + 2× 220 µF / 25V capacitors',
    passiveAndProtection: 'Coil IGBTs: 3× 400V / 15A DPAK; O2 Heater FET: N-Channel 60V / 15A DPAK',
    crystalFrequency: '16.000 MHz Crystal',
    benchCheckNotes: 'Melco E6T79xxx No-Start / Throttle Limp Mode (P2119 / P0606): check TLE7209-2R / BA6285 ETC driver and 5.0V sensor ref. Water intrusion through cowl oxidizes black connector header pins.',
    voiceSummary: 'Mirage 1.2L Melco E6T79 board features Mitsubishi MH8115F MCU, 16 MHz crystal, Melco voltage regulator LSI, three 400V 15A DPAK coil IGBTs, and TLE7209 throttle H-bridge.',
  },
  {
    id: 'pcb-mitsubishi-adventure-4d56',
    brandKey: 'mitsubishi',
    platformName: 'Adventure / L300 Older 2.5L 4D56',
    engineOrTransmission: '2.5L 4D56 Mechanical Injection / Euro 2 (EGR & Glow Controller)',
    boardPartNumbers: ['Melco E6T38xxx', 'MD37xxxx'],
    mcuArchitecture: 'Mitsubishi MH7203FA / MH8206F Microcontroller',
    memoryAndEeprom: 'Internal 128KB–256KB Flash',
    powerAndDriverLsi: '5.0V LDO (TA78L05 / NJM2396); Solenoid Drivers: STA509A / M5269L transistor arrays',
    canOrInterface: 'Analog & K-Line Diagnostic Interface',
    bulkCapacitors: '2× 100 µF / 50V + 1× 47 µF / 35V Electrolytic capacitors',
    passiveAndProtection: 'EGR/Glow Drivers: N-Ch 60V / 20A TO-252; TVS Diode: 24V / 600W Zener',
    crystalFrequency: '12.000 MHz / 16.000 MHz Crystal',
    benchCheckNotes: 'Melco E6T38xxx dead module / no check engine light: inspect radial electrolytic caps (100µF/50V & 47µF/35V). Aged caps leak alkaline electrolyte onto PCB traces around 5V LDO and watchdog reset line.',
    voiceSummary: 'Mitsubishi Adventure 4D56 Melco board uses MH7203FA MCU, 5V LDO regulator, STA509A transistor arrays, and 100 microfarad 50V plus 47 microfarad 35V electrolytic caps prone to leakage.',
  },
  {
    id: 'pcb-mitsubishi-lancer-4b11',
    brandKey: 'mitsubishi',
    platformName: 'Lancer EX / ASX 2.0L 4B11 & 1.6L 4A92',
    engineOrTransmission: '2.0L 4B11 & 1.6L 4A92 MIVEC Gasoline',
    boardPartNumbers: ['Melco 1860A867', 'Melco 1860B428', 'Melco E6T76xxx'],
    mcuArchitecture: 'Mitsubishi MH8106F (QFP-144, 32-bit)',
    memoryAndEeprom: 'Internal 1MB Flash Memory',
    powerAndDriverLsi: 'Melco multi-rail LSI; ETC H-Bridge: TLE6209R / TLE7209',
    canOrInterface: 'CAN Transceiver TJA1050',
    bulkCapacitors: '4× 220 µF / 35V SMD capacitors',
    passiveAndProtection: 'Coil Drivers: 4× 400V / 18A IGBTs; MIVEC OCV Diode: 40V / 3A Schottky',
    crystalFrequency: '16.000 MHz SMD Crystal',
    benchCheckNotes: 'Melco E6T76xxx architecture incorporates TLE6209R throttle H-bridge and four discrete 400V/18A IGBTs for direct coil ignition. 40V/3A Schottky diode clamps MIVEC oil control valve inductive kickback.',
    voiceSummary: 'Lancer EX and ASX Melco board has MH8106F MCU, 16 MHz crystal, TLE6209 throttle driver, four 400V 18A IGBTs, and 40V 3A Schottky MIVEC clamp diode.',
  },
  {
    id: 'pcb-mitsubishi-pajero-4m41',
    brandKey: 'mitsubishi',
    platformName: 'Pajero BK Gen 4 3.2L 4M41',
    engineOrTransmission: '3.2L 4M41 DI-D Common Rail Turbo Diesel',
    boardPartNumbers: ['Denso 1860A751', 'Denso 275800-5442'],
    mcuArchitecture: 'Dual Renesas SH7058 32-bit Processors',
    memoryAndEeprom: 'EEPROM 93C86 (SOIC-8)',
    powerAndDriverLsi: 'Power/Driver LSI Denso SE627; Injector Driver: 85V boost converter + high/low side FETs',
    canOrInterface: 'CAN Transceiver TJA1050',
    bulkCapacitors: '4× 220 µF / 35V + 2× 100 µF / 100V capacitors',
    passiveAndProtection: 'Boost Inductor: 47 µH shielded ferrite; Current Shunts: 0.02 Ω (R020) 1W',
    crystalFrequency: '20.000 MHz Clock Crystal',
    benchCheckNotes: 'Heavy-duty 4M41 common-rail ECM board. High-voltage 85V injector DC-DC boost stage uses 47µH shielded power inductor and dual 100µF/100V capacitors. Check 0.02Ω R020 current shunt.',
    voiceSummary: 'Pajero BK 4M41 Denso board uses dual Renesas SH7058 processors, 20 MHz crystal, 93C86 EEPROM, SE627 power LSI, 47 microhenry boost inductor, and 85V injector DC-DC converter.',
  },
  {
    id: 'pcb-mitsubishi-fuso-canter',
    brandKey: 'mitsubishi',
    platformName: 'Canter FE71 / FE84 Fuso 3.0L & 3.9L',
    engineOrTransmission: '3.0L 4P10 & 3.9L 4D34 CRDi Diesel (24V System)',
    boardPartNumbers: ['Bosch EDC17CP52', 'Denso 275800-xxxx (24V)'],
    mcuArchitecture: 'Infineon TC1797 (Bosch) or Renesas SH7058 (Denso)',
    memoryAndEeprom: 'Internal Flash Memory with Security Sector',
    powerAndDriverLsi: 'Bosch 30622 / 40048 (24V rated); High-voltage injector driver bank',
    canOrInterface: 'Dual CAN: Dual TJA1042 transceivers',
    bulkCapacitors: '4× 220 µF / 50V (24V truck spec)',
    passiveAndProtection: 'TVS Protection: 36V / 1500W SMC Zener; Current Shunts: 0.01 Ω (R010) 2W',
    crystalFrequency: '20.000 MHz SMD Crystal',
    benchCheckNotes: '24V commercial vehicle ECM. High-voltage bulk capacitors are rated 50V. Overvoltage protection uses 36V/1500W SMC Zener diode. Check 0.01Ω 2W shunts if injector rail fault occurs.',
    voiceSummary: 'Fuso Canter 24V board uses Infineon TC1797 or Renesas SH7058, 20 MHz crystal, 36V 1500W TVS Zener diode, four 50V bulk caps, and dual TJA1042 CAN transceivers.',
  },
  {
    id: 'pcb-mitsubishi-cvt-tcm',
    brandKey: 'mitsubishi',
    platformName: 'Mirage / Lancer EX CVT-ECU (Jatco)',
    engineOrTransmission: 'INVECS-III CVT (Jatco JF015E / JF011E / F1CJC / W1CJC)',
    boardPartNumbers: ['Mitsubishi 8631A867', '8631B152', '10GOD38S'],
    mcuArchitecture: 'Renesas SH7055 / SH7058 QFP MCU',
    memoryAndEeprom: 'EEPROM 93C66 / 93C86 (ROM data & shift adaptation)',
    powerAndDriverLsi: 'Linear Solenoid Drivers: 6× Constant-current PWM MOSFETs; Power/CAN: TJA1050 + 5V LDO',
    canOrInterface: 'CAN Transceiver TJA1050',
    bulkCapacitors: '2× 220 µF / 35V High-Temp (125°C rated) capacitors',
    passiveAndProtection: 'Solenoid Shunts: 0.05 Ω (R050) 1%; Speed Sensor Pull-ups: 2.2 kΩ to 5V',
    crystalFrequency: '16.000 MHz SMD Crystal',
    benchCheckNotes: 'Mitsubishi / Jatco CVT-ECU 10GOD38S: inspect dense MLCC noise-filtering banks and six DPAK constant-current PWM MOSFETs driving pulley pressure and lockup solenoids. Solenoid shunts are 0.05Ω 1%.',
    voiceSummary: 'Mitsubishi Jatco CVT transmission ECU features Renesas SH7058 MCU, 16 MHz crystal, 93C86 EEPROM, six constant current PWM MOSFETs for pulley pressure, and 0.05 ohm current shunts.',
  },

  // --- NISSAN 10 PLATFORMS (Batch 4 of 8: Denso, Hitachi MEC/BED & Bosch) ---
  {
    id: 'pcb-nissan-yd25-navara',
    brandKey: 'nissan',
    platformName: 'Navara NP300 / D40 2.5L YD25DDTi',
    engineOrTransmission: '2.5L YD25DDTi Common Rail Turbo Diesel',
    boardPartNumbers: ['Denso 275800-xxxx', '23710-4JA0A', '23710-5X21B'],
    mcuArchitecture: 'Renesas SH7058 / SH7059 QFP-256 Microcontroller',
    memoryAndEeprom: 'EEPROM 93C86 (SOIC-8, stores injector QR codes & NATS immobilizer)',
    powerAndDriverLsi: 'Power/Driver LSI: Denso SE627 / SE811; Injector Stage: 85V DC-DC boost + bank FETs',
    canOrInterface: 'CAN Transceiver TJA1050 / TJA1051',
    bulkCapacitors: '6× 220 µF / 35V + 2× 100 µF / 100V SMD capacitors',
    passiveAndProtection: 'SCV Current Shunt: 0.02 Ω (R020) 1W; TVS Diode: 27V / 600W SMB on +B',
    crystalFrequency: '16.000 MHz / 20.000 MHz Crystals',
    benchCheckNotes: 'Navara YD25DDTi injector driver fault (P0201-P0204 / P0628): check 100µF/100V boost caps and 85V boost switching MOSFET. Shorted injector harness burns bank-select DPAK FETs and opens 0.02Ω R020 shunt.',
    voiceSummary: 'Nissan Navara YD25 Denso board uses Renesas SH7058 MCU, 16 and 20 MHz crystals, 93C86 EEPROM, SE627 power IC, 85V boost stage, 27V TVS diode, and 0.02 ohm SCV current shunt.',
  },
  {
    id: 'pcb-nissan-ys23-terra',
    brandKey: 'nissan',
    platformName: 'Terra / Navara Pro-4X 2.3L YS23',
    engineOrTransmission: '2.3L YS23DDT Single-Turbo & YS23DDTT Twin-Turbo Diesel',
    boardPartNumbers: ['Bosch EDC17C84', 'Bosch MD1CS006'],
    mcuArchitecture: 'Infineon Tricore TC1782 / TC277 BGA Processor',
    memoryAndEeprom: 'Internal 2.5MB–4MB Flash + D-Flash EEPROM',
    powerAndDriverLsi: 'System IC: Bosch 40114 / 30622; Solenoid/Piezo: Dual-bank driver ICs',
    canOrInterface: 'CAN Transceivers TJA1042 / TJA1043',
    bulkCapacitors: '6× 220 µF / 35V Low-ESR capacitors with dual-stage synchronous buck regulators',
    passiveAndProtection: 'Current Shunts: 0.010 Ω (R010) 2W 1%; CAN Term: 2× 60.4 Ω + 4.7 nF split cap',
    crystalFrequency: '20.000 MHz SMD Crystal',
    benchCheckNotes: 'Bosch EDC17C84 / MD1CS006 features TC1782/TC277 BGA MCU, dual-stage synchronous buck regulators with six shielded inductors, Bosch 40114 power IC, and TJA1043 CAN transceivers.',
    voiceSummary: 'Nissan Terra 2.3L YS23 Bosch EDC17C84 board has Infineon Tricore TC1782 BGA MCU, 20 MHz crystal, Bosch 40114 power IC, six bulk 220 microfarad caps, and 0.01 ohm 2W shunts.',
  },
  {
    id: 'pcb-nissan-nv350-yd25',
    brandKey: 'nissan',
    platformName: 'NV350 Urvan 2.5L YD25 Euro 4',
    engineOrTransmission: '2.5L YD25DDTi Diesel (Euro 4 NV350)',
    boardPartNumbers: ['Denso 275700-xxxx', '23710-3XN0A', '23710-5YA0A'],
    mcuArchitecture: 'Renesas SH7058 / SH72531 32-bit MCU',
    memoryAndEeprom: 'EEPROM 93C86 (SOIC-8)',
    powerAndDriverLsi: 'Power/System LSI: Denso SE811; EGR/VNT Driver: Full H-bridge + PWM FET',
    canOrInterface: 'CAN Transceiver TJA1051',
    bulkCapacitors: '4× 220 µF / 35V + 2× 100 µF / 100V SMD capacitors',
    passiveAndProtection: 'EGR Sense Shunt: 0.015 Ω (R015) 2W; CKP/CMP Filters: 1.0 kΩ + 1000 pF MLCC',
    crystalFrequency: '20.000 MHz Crystal',
    benchCheckNotes: 'NV350 Urvan Denso Euro 4 board uses SE811 power LSI, full H-bridge for EGR control with 0.015Ω shunt, and 1.0kΩ + 1000pF low-pass filter on CKP/CMP lines.',
    voiceSummary: 'Nissan Urvan NV350 YD25 Denso board has Renesas SH7058 MCU, 20 MHz crystal, 93C86 EEPROM, SE811 LSI, 0.015 ohm EGR shunt, and 100 microfarad 100V boost caps.',
  },
  {
    id: 'pcb-nissan-almera-hr15',
    brandKey: 'nissan',
    platformName: 'Almera N17 1.5L HR15DE & 1.2L HR12DE',
    engineOrTransmission: '1.5L HR15DE & 1.2L HR12DE Gasoline',
    boardPartNumbers: ['Hitachi MEC90-xxx', 'MEC100', '23710-3BAxx'],
    mcuArchitecture: 'Renesas SH7055 / SH7058 QFP Processor',
    memoryAndEeprom: 'EEPROM 93C66 / 95320 (SOIC-8)',
    powerAndDriverLsi: 'Driver LSI: Hitachi L9302-AD / STA509A; ETC H-Bridge: MC33186 / TLE6209R',
    canOrInterface: 'CAN Transceiver TJA1050',
    bulkCapacitors: '4× 220 µF / 35V SMD capacitors',
    passiveAndProtection: 'Coil Triggers: 1.0 kΩ series + 100 pF EMI cap; TPS Pull-downs: 10 kΩ (0603) 1%',
    crystalFrequency: '16.000 MHz Clock Crystal',
    benchCheckNotes: 'Hitachi MEC90/MEC100 Throttle Limp Mode (P2101 / P1122 / P1126): inspect MC33186 / TLE6209R throttle driver IC and ignition/throttle relay trace. Sticky throttle body overheats driver and blows thermal latch.',
    voiceSummary: 'Almera N17 Hitachi MEC90 board features Renesas SH7055 or SH7058 MCU, 16 MHz crystal, 93C66 EEPROM, L9302 driver array, and MC33186 throttle H-bridge.',
  },
  {
    id: 'pcb-nissan-almera-turbo',
    brandKey: 'nissan',
    platformName: 'Almera N18 1.0L Turbo DIG-T',
    engineOrTransmission: '1.0L HRA0DET 3-Cylinder Turbocharged Direct Injection',
    boardPartNumbers: ['Hitachi BED434-xxx', '23710-6LAxx'],
    mcuArchitecture: 'Infineon Tricore TC1767 / TC1782 QFP Microcontroller',
    memoryAndEeprom: 'Internal 2MB–2.5MB Flash Memory',
    powerAndDriverLsi: 'Power/Driver IC: Hitachi/Bosch 30682 GDI boost; ETC / Wastegate: Dual H-bridge drivers',
    canOrInterface: 'CAN Transceiver TJA1042',
    bulkCapacitors: '6× 220 µF / 35V Radial High-Temperature (125°C) Low-ESR capacitors',
    passiveAndProtection: 'GDI Boost Cap: 100 µF / 100V + 47 µH coil; 3-Cyl Coil IGBTs: 3× 400V / 18A DPAK',
    crystalFrequency: '20.000 MHz SMD Crystal',
    benchCheckNotes: 'Hitachi BED434 direct injection ECU. Features 30682 GDI boost driver generating 65V for direct injectors with 100µF/100V cap and dual H-bridge drivers for throttle and electronic turbo wastegate.',
    voiceSummary: 'Almera N18 1.0T Hitachi BED434 board uses Infineon Tricore TC1767, 20 MHz crystal, 30682 GDI boost driver, three 400V 18A DPAK coil IGBTs, and dual electronic wastegate H-bridges.',
  },
  {
    id: 'pcb-nissan-kicks-epower',
    brandKey: 'nissan',
    platformName: 'Kicks e-Power 1.2L HR12DE Series-Hybrid',
    engineOrTransmission: '1.2L HR12DE Series-Hybrid (Generator ECM & VCM)',
    boardPartNumbers: ['Hitachi BED50x', 'VCM 23710-5RYxx'],
    mcuArchitecture: 'Infineon Aurix TC275 / TC277 Multi-Core Processor',
    memoryAndEeprom: 'Internal 4MB Flash + D-Flash EEPROM',
    powerAndDriverLsi: 'System Power IC: TLF35584 Safety PMIC; e-Power Interface: Dual isolated CAN-FD',
    canOrInterface: 'Dual Isolated CAN-FD: TJA1043 / TJA1145 Transceivers',
    bulkCapacitors: '4× 220 µF / 35V Low-ESR SMD capacitors',
    passiveAndProtection: '3-Cyl Coil Drivers: 3× 400V / 15A DPAK; Sensor Ref (5V): Precision 5.00V ± 0.02V',
    crystalFrequency: '20.000 MHz SMD Crystal',
    benchCheckNotes: 'Advanced hybrid generator control module. Features Infineon Aurix TC275 multi-core processor, TLF35584 automotive safety PMIC, dual isolated CAN-FD transceivers, and precision 5.00V ± 0.02V sensor reference.',
    voiceSummary: 'Nissan Kicks e-Power Hitachi board uses Infineon Aurix TC275 multicore MCU, 20 MHz crystal, TLF35584 safety PMIC, dual isolated CAN FD transceivers, and precision 5.00 volt reference.',
  },
  {
    id: 'pcb-nissan-xtrail-mr20',
    brandKey: 'nissan',
    platformName: 'X-Trail T32 / T31 2.0L MR20DD & 2.5L QR25DE',
    engineOrTransmission: '2.0L MR20DD DIG & 2.5L QR25DE Gasoline',
    boardPartNumbers: ['Hitachi BED410', 'Hitachi MEC107', '23710-4BAxx', '23710-JGxx'],
    mcuArchitecture: 'Renesas SH72531 / SH7058 32-bit MCU',
    memoryAndEeprom: 'EEPROM 95320 / 95640 (SOIC-8)',
    powerAndDriverLsi: 'GDI/Driver IC: Hitachi custom 65V GDI boost + L9302; ETC H-Bridge: MC33186 / TLE7209',
    canOrInterface: 'CAN Transceiver TJA1050 / TJA1042',
    bulkCapacitors: '5× 220 µF / 35V SMD capacitors',
    passiveAndProtection: 'GDI Boost Cap: 100 µF / 100V Low-ESR; IVT OCV Diodes: 40V / 3A Schottky',
    crystalFrequency: '20.000 MHz SMD Crystal',
    benchCheckNotes: 'Hitachi BED410 direct injection ECM board. Custom 65V GDI boost stage powers MR20DD direct injectors. Intake variable valve timing solenoids protected by 40V/3A Schottky flyback diodes.',
    voiceSummary: 'X-Trail MR20DD Hitachi BED410 board features Renesas SH72531 MCU, 20 MHz crystal, 95320 EEPROM, Hitachi 65V GDI boost circuit, MC33186 throttle driver, and 40V 3A IVT Schottky diodes.',
  },
  {
    id: 'pcb-nissan-sylphy-juke',
    brandKey: 'nissan',
    platformName: 'Sylphy / Juke / Livina 1.6L & 1.8L',
    engineOrTransmission: '1.6L HR16DE & 1.8L MRA8DE Dual Injector Gasoline',
    boardPartNumbers: ['Hitachi MEC93', 'Hitachi MEC110', '23710-3SHxx', '23710-1KAxx'],
    mcuArchitecture: 'Renesas SH7058 / SH72531 Microcontroller',
    memoryAndEeprom: 'EEPROM 93C66 / 95320 (SOIC-8)',
    powerAndDriverLsi: 'System Power/Driver: Hitachi L9779WD / L9302; ETC H-Bridge: MC33186',
    canOrInterface: 'CAN Transceiver TJA1050',
    bulkCapacitors: '4× 220 µF / 35V SMD capacitors',
    passiveAndProtection: 'Coil Drivers: 4× 400V / 15A DPAK; O2 Heater FET: N-Ch 60V / 15A DPAK',
    crystalFrequency: '16.000 MHz / 20.000 MHz Crystals',
    benchCheckNotes: 'Hitachi MEC93/110 architecture supports dual-port fuel injection per cylinder. System power and pre-driver stages handled by Hitachi L9779WD LSI. Throttle driven by MC33186 H-bridge.',
    voiceSummary: 'Nissan Sylphy and Juke Hitachi MEC93 board has Renesas SH7058 MCU, 16 and 20 MHz crystals, 93C66 EEPROM, L9779WD power LSI, and MC33186 electronic throttle H-bridge.',
  },
  {
    id: 'pcb-nissan-patrol-y62',
    brandKey: 'nissan',
    platformName: 'Patrol Royale Y62 5.6L VK56VD V8',
    engineOrTransmission: '5.6L VK56VD V8 Direct Injection (DIG) with VVEL',
    boardPartNumbers: ['Hitachi BED310', 'Hitachi MEC120', '23710-1LBxx'],
    mcuArchitecture: 'Dual Renesas SH72543R High-Speed Processors',
    memoryAndEeprom: 'EEPROM 95640 (SOIC-8)',
    powerAndDriverLsi: 'GDI High-Volt Driver: Dual 65V boost stages (Bank 1 & 2); VVEL Actuator: Dedicated H-bridge',
    canOrInterface: 'Dual CAN: Dual TJA1042 transceivers',
    bulkCapacitors: '6× 220 µF / 35V + 4× 100 µF / 100V SMD capacitors',
    passiveAndProtection: 'V8 Coil Triggers: 8× 1.0 kΩ + 100 pF; Current Shunts: 0.015 Ω (R015) 2W',
    crystalFrequency: '20.000 MHz SMD Crystal',
    benchCheckNotes: 'Flagship dual-processor V8 ECM board. Incorporates two independent 65V GDI boost stages (one per cylinder bank) and dedicated high-current full-H-bridge driver for VVEL variable valve event and lift stepper.',
    voiceSummary: 'Patrol Royale Y62 V8 Hitachi BED310 board uses dual Renesas SH72543R processors, 20 MHz crystal, 95640 EEPROM, dual 65V GDI boost converters, and dedicated VVEL motor H-bridge.',
  },
  {
    id: 'pcb-nissan-xtronic-cvt',
    brandKey: 'nissan',
    platformName: 'Jatco Xtronic CVT TCM (JF011E/15E/16E/17E)',
    engineOrTransmission: 'Jatco Xtronic Continuously Variable Transmission (CVT7 / CVT8)',
    boardPartNumbers: ['Hitachi / Jatco 31036-xxxx', 'ETC94-xxxN'],
    mcuArchitecture: 'Renesas SH7055 / SH72531 32-bit Microcontroller',
    memoryAndEeprom: 'EEPROM 93C66 / 95640 (stores unique valve body calibration QR data)',
    powerAndDriverLsi: 'Linear Solenoid ICs: 5× Closed-loop PWM drivers; Step Motor: Quad-phase unipolar driver',
    canOrInterface: 'CAN Transceiver TJA1050',
    bulkCapacitors: '3× 220 µF / 35V 125°C High-Temperature capacitors',
    passiveAndProtection: 'Solenoid Shunts: 0.05 Ω (R050) 1%; Speed Sensor Pull-ups: 2.2 kΩ to 5V',
    crystalFrequency: '16.000 MHz SMD Crystal',
    benchCheckNotes: 'Jatco Xtronic CVT TCM Step-Motor / Solenoid Codes (P1778 / P0746 / P0868): inspect 0.05Ω R050 sense resistors and quad-driver IC traces. JF016E/17E store valve body calibration in 95640 EEPROM; transfer when cloning.',
    voiceSummary: 'Nissan Xtronic CVT TCM Jatco board uses Renesas SH7055 or SH72531 MCU, 16 MHz crystal, 95640 EEPROM with valve body calibration, 5 closed loop PWM drivers, and 0.05 ohm current sense shunts.',
  },
];

/**
 * Returns OEM PCB Hardware specifications, optionally filtered by brandKey ('toyota' | 'ford' | 'mitsubishi' | 'nissan').
 */
export function getOemPcbHardwareSpecs(brandKey?: 'toyota' | 'ford' | 'mitsubishi' | 'nissan' | 'ALL'): OemPcbPlatformSpec[] {
  if (!brandKey || brandKey === 'ALL') {
    return OEM_PCB_HARDWARE_SPECS;
  }
  return OEM_PCB_HARDWARE_SPECS.filter((p) => p.brandKey === brandKey);
}

/**
 * Searches OEM PCB Hardware specifications by keyword across platform names, part numbers, ICs, and MCUs.
 */
export function searchOemPcbHardwareSpecs(queryText: string): OemPcbPlatformSpec[] {
  const q = queryText.toLowerCase().trim();
  if (!q) return OEM_PCB_HARDWARE_SPECS;

  // Direct full-substring match check first
  const directMatches = OEM_PCB_HARDWARE_SPECS.filter(
    (spec) =>
      spec.platformName.toLowerCase().includes(q) ||
      spec.engineOrTransmission.toLowerCase().includes(q) ||
      spec.mcuArchitecture.toLowerCase().includes(q) ||
      spec.powerAndDriverLsi.toLowerCase().includes(q) ||
      spec.boardPartNumbers.some((p) => p.toLowerCase().includes(q)) ||
      spec.benchCheckNotes.toLowerCase().includes(q)
  );
  if (directMatches.length > 0) return directMatches;

  // Multi-term token scoring
  const stopWords = new Set([
    'pcb',
    'specs',
    'spec',
    'chip',
    'chips',
    'board',
    'boards',
    'hardware',
    'component',
    'components',
    'the',
    'for',
    'and',
    'what',
    'show',
    'tell',
    'about',
    'is',
    'in',
  ]);
  const tokens = q
    .split(/[\s/,()[\]&+-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !stopWords.has(t));
  if (tokens.length === 0) return OEM_PCB_HARDWARE_SPECS;

  const scored = OEM_PCB_HARDWARE_SPECS.map((spec) => {
    let score = 0;
    const haystack = [
      spec.brandKey,
      spec.platformName,
      spec.engineOrTransmission,
      ...spec.boardPartNumbers,
      spec.mcuArchitecture,
      spec.memoryAndEeprom,
      spec.powerAndDriverLsi,
      spec.canOrInterface,
      spec.bulkCapacitors,
      spec.passiveAndProtection,
      spec.crystalFrequency,
      spec.benchCheckNotes,
    ]
      .join(' ')
      .toLowerCase();

    for (const tok of tokens) {
      if (haystack.includes(tok)) {
        score +=
          spec.platformName.toLowerCase().includes(tok) ||
          spec.boardPartNumbers.some((p) => p.toLowerCase().includes(tok))
            ? 5
            : 2;
      }
    }
    return { spec, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.spec);
}

