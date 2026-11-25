/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import {
  BenchHardwareVariant,
  BenchPinoutInfo,
  ECU_BRAND_PROFILES,
  EcuBrandProfile,
} from '../components/ecuPinoutData';
import { EcuPin } from '../types/ecu';
import { VerificationStatus } from '../types/provenance';
import { DEFAULT_ECU_PINS } from './circuitSolver';
import {
  EcuIngestionStatus,
  RESTRICTED_MODEL_DATABASE,
  TABLE16_DLC_INTERFACES,
  VERIFIED_VOICE_ECU_GUIDES,
  matchSafetyGatesForQuery,
} from './oemKnowledgeDatabase';

export interface BenchHardwareProfile {
  ecuFamily: string;               // e.g., "Denso 4N15", "Transtron SH7058", "Bosch EDC17C84"
  mcuArchitecture: string;         // e.g., "Renesas SH7058", "Infineon TC1782"
  hardwareVariant?: string;        // e.g., "Type 1 (Non-DPF)", "Type 2 (DPF + ETV)", "GPT Rev A"
  requiresMainRelayLoop: boolean;  // True for Denso/Melco/Transtron ECUs
  requiresCaseGround: boolean;     // True for Bosch EDC16/EDC17 & Isuzu Transtron
  canTerminationOhms: 0 | 60 | 120;
  provenanceStatus?: VerificationStatus;
  requiresOcrVerify?: boolean;
  conflictWarning?: string;
  benchTrapNote?: string;
  benchWakeupPins: {
    kl30: string[];
    kl15: string[];
    mainRelayControl?: string[];   // Low-side trigger from ECU
    mainRelayReturn?: string[];    // +12V feed from Main Relay
    mainRelayFeed?: string[];
    ground: string[];
    groundCase?: string[];         // Dedicated ECU case / shield ground pins (e.g. Pin 81, Case GND)
    canHigh?: string[];
    canLow?: string[];
    canH?: string[];
    canL?: string[];
    kLine?: string[];
    gpt1?: string[];
    gpt2?: string[];
    gptChannels?: string[];        // Combined GPT1/GPT2 wake-up pins
  };
}

export interface OemBenchPinGroup {
  powerAndRelay: Array<{ pin: string; signal: string; role: string }>;
  grounds: Array<{ pin: string; signal: string; role: string }>;
  communication: Array<{ pin: string; signal: string; role: string }>;
  fiveVoltReferences?: Array<{ pin: string; signal: string; role: string }>;
  coreSignals?: Array<{ pin: string; signal: string; role: string }>;
  actuators?: Array<{ pin: string; signal: string; role: string }>;
  gptWakeupSignals?: Array<{ pin: string; signal: string; role: string }>;
}

export interface OemBenchPinoutMapEntry {
  id: string;
  brandKey: string;
  linkedProfileId: string;
  vehicleModels: string[];
  engineAndEcuTitle: string;
  benchTrapToEncode: string;
  hardwareProfile: BenchHardwareProfile;
  pinGroups: OemBenchPinGroup;
  pinouts: BenchPinoutInfo[];
}

export interface RpmEmulatorState {
  isActive: boolean;
  rpm: number;
  soundEnabled: boolean;
  camPhaseOffsetDeg?: number;
  ckpSignalLost?: boolean;
}

export interface VehicleMakeEntry {
  brandKey: string;
  brandLabel: string;
  models: string[];
  profiles: EcuBrandProfile[];
}

export interface SelectedVehicleContext {
  brandKey: string;
  brandLabel: string;
  modelName: string;
  status: EcuIngestionStatus;
  gateAlert: string | null;
  spokenAlert: string | null;
  controllerNote: string;
  dlcProtocol: string;
  tableRef: string | null;
  hasVerifiedPinoutMap: boolean;
  benchHardwareProfile?: BenchHardwareProfile;
  oemBenchPinoutMap?: OemBenchPinoutMapEntry;
}

export const UNIVERSAL_BRAND_KEY = 'universal-bench';

/**
 * Structured OEM Bench Connection Maps for Mitsubishi L200, Isuzu D-Max, Nissan Navara (D40 & D23),
 * and Toyota Hilux. Tagged with explicit provenance (`AI_INFERRED` + `requiresOcrVerify: true`) and
 * bench traps so physical bench safety gates remain enforced until ECU part numbers are confirmed.
 */
export const OEM_BENCH_PINOUT_MAPS: OemBenchPinoutMapEntry[] = [
  // 1A. Mitsubishi L200 / Montero Sport / Strada (4N15 2.4L MIVEC — Denso ECU)
  {
    id: 'oem-map-mitsubishi-l200-4n15',
    brandKey: 'mitsubishi',
    linkedProfileId: 'mitsubishi-denso-diesel',
    vehicleModels: [
      'L200 / Strada / Triton (4N15 2.4L MIVEC)',
      'Montero Sport / Pajero Sport (4N15 2.4L MIVEC)',
      'Strada / Triton (4D56 / 4N15)',
      'Montero Sport (4D56 / 4M41 / 4N15)',
    ],
    engineAndEcuTitle: 'Mitsubishi L200 / Montero Sport / Strada (4N15 2.4L MIVEC — Denso ECU)',
    benchTrapToEncode:
      'Requires three separate battery feeds (BAT1, BAT2, BACK) plus IGN, and triggers the Engine Control Relay (C/R on Pin 118) to feed injector power (I/B2 on Pin 25).',
    hardwareProfile: {
      ecuFamily: 'Denso 4N15 MIVEC',
      mcuArchitecture: 'Renesas SH72543R / SH7058',
      hardwareVariant: '4N15 2.4L MIVEC (Gen 3 Common Rail)',
      requiresMainRelayLoop: true,
      requiresCaseGround: false,
      canTerminationOhms: 120,
      provenanceStatus: 'AI_INFERRED',
      requiresOcrVerify: true,
      conflictWarning:
        'OCR_VERIFY REQUIRED: Requires three battery feeds (101 BAT1, 102 BAT2, 103 BACK) + 104 IGN and Main Relay C/R (Pin 118 low-side) to close I/B2 (Pin 25). Verify Denso 1860Bxxx/1860Cxxx part number before energizing.',
      benchTrapNote:
        'Requires three separate battery feeds (BAT1, BAT2, BACK) plus IGN, and triggers the Engine Control Relay (C/R on Pin 118) to feed injector power (I/B2 on Pin 25).',
      benchWakeupPins: {
        kl30: ['101', '102', '103'],
        kl15: ['104'],
        mainRelayControl: ['118'],
        mainRelayReturn: ['25'],
        mainRelayFeed: ['25'],
        ground: ['145', '31', '34', '87', '88', '90', '91'],
        groundCase: ['145'],
        canHigh: ['108'],
        canLow: ['109'],
        canH: ['108'],
        canL: ['109'],
      },
    },
    pinGroups: {
      powerAndRelay: [
        { pin: '101', signal: 'BAT1 / KL30', role: 'Primary Battery Feed #1 (+12V)' },
        { pin: '102', signal: 'BAT2 / KL30', role: 'Primary Battery Feed #2 (+12V)' },
        { pin: '103', signal: 'BACK / KAM Backup', role: 'Keep-Alive Memory Battery Feed (+12V)' },
        { pin: '104', signal: 'IGN / KL15', role: 'Switched Ignition Wake-Up (+12V)' },
        { pin: '118', signal: 'C/R Main Relay Control', role: 'Engine Control Relay Low-Side Trigger (0V Active)' },
        { pin: '25', signal: 'I/B2 Injector Bank Power', role: '+12V Return Feed from Engine Control Relay' },
      ],
      grounds: [
        { pin: '145', signal: 'SGND ECU Earth', role: 'Main ECU Shield / Logic Ground Return' },
        { pin: '31', signal: 'MAPE', role: 'MAP Sensor Analog Earth' },
        { pin: '34', signal: 'TPSE', role: 'Throttle Position Sensor Earth' },
        { pin: '87', signal: 'WTSE', role: 'Water Temp Sensor Earth' },
        { pin: '88', signal: 'FPSE', role: 'Fuel Rail Pressure Sensor Earth' },
        { pin: '90', signal: 'SGCE', role: 'Camshaft Position Sensor Earth' },
        { pin: '91', signal: 'SGTG CKP Earth', role: 'Crankshaft Position Sensor Earth' },
      ],
      communication: [
        { pin: '108', signal: 'CAN-H', role: '500 kbps Diagnostic / Powertrain CAN High' },
        { pin: '109', signal: 'CAN-L', role: '500 kbps Diagnostic / Powertrain CAN Low' },
      ],
      fiveVoltReferences: [
        { pin: '68', signal: 'CKP 5V', role: '5.0V Crankshaft Sensor Supply' },
        { pin: '69', signal: 'CMP 5V', role: '5.0V Camshaft Sensor Supply' },
        { pin: '93', signal: 'TPS 5V', role: '5.0V Throttle Position Sensor Supply' },
        { pin: '134', signal: 'APP Sub 5V', role: '5.0V Accelerator Pedal Sub Sensor Supply' },
        { pin: '149', signal: 'APP Main 5V', role: '5.0V Accelerator Pedal Main Sensor Supply' },
      ],
      coreSignals: [
        { pin: '67', signal: 'SGT CKP Signal', role: 'Crankshaft Position Hall Pulse Input' },
        { pin: '66', signal: 'SGC CMP Signal', role: 'Camshaft Position Hall Sync Input' },
        { pin: '64', signal: 'FPS Rail Pressure', role: 'Common Rail Fuel Pressure Sensor Signal' },
        { pin: '63', signal: 'WTS Coolant Temp', role: 'Engine Coolant Temperature NTC Signal' },
        { pin: '37', signal: 'MAP', role: 'Manifold Absolute Boost Pressure Signal' },
        { pin: '60', signal: 'TPSM', role: 'Throttle Position Main Signal' },
        { pin: '150', signal: 'APSM Main', role: 'Accelerator Pedal Position Main Signal' },
        { pin: '135', signal: 'APSS Sub', role: 'Accelerator Pedal Position Sub Signal' },
      ],
      actuators: [
        { pin: '2', signal: 'INJ1', role: 'Cylinder 1 Injector Driver' },
        { pin: '75', signal: 'INJ2', role: 'Cylinder 2 Injector Driver' },
        { pin: '51', signal: 'INJ3', role: 'Cylinder 3 Injector Driver' },
        { pin: '1', signal: 'INJ4', role: 'Cylinder 4 Injector Driver' },
        { pin: '131', signal: 'SCV+', role: 'Suction Control Valve High-Side PWM' },
        { pin: '146', signal: 'SCV-', role: 'Suction Control Valve Low-Side Return' },
        { pin: '17', signal: 'VGT Solenoid', role: 'Variable Geometry Turbo Duty Solenoid' },
      ],
    },
    pinouts:
      ECU_BRAND_PROFILES.find((p) => p.id === 'mitsubishi-denso-diesel')?.pinouts.filter(
        (pin) => pin.plug === 'PLUG_4N15_MIVEC'
      ) ?? [],
  },

  // 1B. Isuzu D-Max / MU-X / N-Series (4JJ1-TC 3.0L — Transtron SH7058 ECU)
  {
    id: 'oem-map-isuzu-dmax-4jj1-sh7058',
    brandKey: 'isuzu',
    linkedProfileId: 'isuzu-transtron-4jj1',
    vehicleModels: [
      'D-Max (4JJ1-TC 3.0L Transtron SH7058)',
      'D-Max (4JJ1-TCX / 4JK1)',
      'mu-X (4JJ1-TCX / 4JJ3-TCX)',
      'Alterra (4JJ1-TC)',
      'NHR / NKR / NPR Trucks (4JJ1 / 4JK1)',
    ],
    engineAndEcuTitle: 'Isuzu D-Max / MU-X / N-Series (4JJ1-TC 3.0L — Transtron SH7058 ECU)',
    benchTrapToEncode:
      'Euro-4 and Euro-5 variants add Differential Pressure (DPF) and Exhaust Throttle pins; Case Ground (Pin 81) must be tied to KL31 for noise-free CAN/injector testing.',
    hardwareProfile: {
      ecuFamily: 'Transtron SH7058',
      mcuArchitecture: 'Renesas SH7058 / SH7059',
      hardwareVariant: 'Euro-4 / Euro-5 (DPF + Case Ground Pin 81)',
      requiresMainRelayLoop: true,
      requiresCaseGround: true,
      canTerminationOhms: 120,
      provenanceStatus: 'AI_INFERRED',
      requiresOcrVerify: true,
      conflictWarning:
        'CONFLICT & VOLTAGE TRAP: PH-market Table #8 specifies CAN-H on Pin 77, whereas Euro-4/Euro-5 Transtron SH7058 pinouts list CAN-H on Pin 58. Also verify 12V (D-Max/mu-X) vs 24V (N-Series Trucks) and bond Pin 81 Case Ground to KL31.',
      benchTrapNote:
        'Euro-4 and Euro-5 variants add Differential Pressure (DPF) and Exhaust Throttle pins; Case Ground (Pin 81) must be tied to KL31 for noise-free CAN/injector testing.',
      benchWakeupPins: {
        kl30: ['2', '5'],
        kl15: ['24'],
        ground: ['1', '3', '43', '62', '81'],
        groundCase: ['81'],
        canHigh: ['58'],
        canLow: ['78'],
        canH: ['58'],
        canL: ['78'],
      },
    },
    pinGroups: {
      powerAndRelay: [
        { pin: '2', signal: 'Battery Voltage KL30', role: 'ECM Main Power Feed #1 (+12V)' },
        { pin: '5', signal: 'Battery Voltage KL30', role: 'ECM Main Power Feed #2 (+12V)' },
        { pin: '24', signal: 'Ignition Voltage KL15', role: 'Switched Ignition Wake-Up (+12V)' },
      ],
      grounds: [
        { pin: '1', signal: 'ECM Power Ground', role: 'High-Current Driver Ground #1' },
        { pin: '3', signal: 'ECM Power Ground', role: 'High-Current Driver Ground #2' },
        { pin: '43', signal: 'ECM Signal Ground', role: 'Analog Sensor Ground #1' },
        { pin: '62', signal: 'ECM Signal Ground', role: 'Analog Sensor Ground #2' },
        { pin: '81', signal: 'ECM Case Ground', role: 'Mandatory Chassis Shield / Case Ground (Tie to KL31)' },
      ],
      communication: [
        { pin: '58', signal: 'CAN-H', role: 'High-Speed CAN High (Conflict check vs Table #8 Pin 77)' },
        { pin: '78', signal: 'CAN-L', role: 'High-Speed CAN Low' },
        { pin: '52', signal: 'Diagnostic Request Switch', role: 'Flash Code / Diagnostic Request Input' },
      ],
      fiveVoltReferences: [
        { pin: '61', signal: 'APP2 / BARO 5V', role: '5.0V Reference Rail (APP2 & Barometric Sensor)' },
        { pin: '95', signal: 'CKP / Boost / VNT 5V', role: '5.0V Reference Rail (Crank, Boost & VNT)' },
        { pin: '112', signal: 'CMP / FRP / EGR 5V', role: '5.0V Reference Rail (Cam, Rail Pressure & EGR)' },
      ],
      coreSignals: [
        { pin: '107', signal: 'CKP Signal', role: 'Crankshaft Position Sensor Input' },
        { pin: '98', signal: 'CMP Signal', role: 'Camshaft Position Sensor Input' },
        { pin: '82 / 90', signal: 'FRP Rail Pressure', role: 'Fuel Rail Pressure Main / Sub Inputs' },
        { pin: '84', signal: 'ECT', role: 'Engine Coolant Temperature NTC Input' },
        { pin: '83', signal: 'FT Fuel Temp', role: 'Fuel Temperature NTC Input' },
        { pin: '91', signal: 'Boost Pressure', role: 'Manifold Absolute Boost Sensor Input' },
        { pin: '71', signal: 'BARO', role: 'Barometric Pressure Sensor Input' },
      ],
      actuators: [
        { pin: '121', signal: 'Common 1 Inj #1 & #4 Charge', role: 'High-Voltage Boost Bank 1 (Cyl 1 & 4)' },
        { pin: '116', signal: 'Common 2 Inj #2 & #3 Charge', role: 'High-Voltage Boost Bank 2 (Cyl 2 & 3)' },
        { pin: '119', signal: 'INJ #1', role: 'Cylinder 1 Injector Low-Side Select' },
        { pin: '118', signal: 'INJ #2', role: 'Cylinder 2 Injector Low-Side Select' },
        { pin: '120', signal: 'INJ #3', role: 'Cylinder 3 Injector Low-Side Select' },
        { pin: '117', signal: 'INJ #4', role: 'Cylinder 4 Injector Low-Side Select' },
        { pin: '97', signal: 'FRP Regulator Low', role: 'Suction Control Valve (SCV) Low-Side' },
        { pin: '105', signal: 'FRP Regulator High', role: 'Suction Control Valve (SCV) High-Side' },
        { pin: '6', signal: 'MIL Control', role: 'Malfunction Indicator Lamp Low-Side Driver' },
      ],
    },
    pinouts:
      ECU_BRAND_PROFILES.find((p) => p.id === 'isuzu-transtron-4jj1')?.pinouts.filter(
        (pin) => pin.plug === 'BLOCK_EURO4_5_REF'
      ) ?? [],
  },

  // 1C. Nissan Navara D40 (YD25DDTi 2.5L — Denso ECU)
  {
    id: 'oem-map-nissan-navara-d40-yd25',
    brandKey: 'nissan',
    linkedProfileId: 'nissan-hitachi-mec11',
    vehicleModels: [
      'Navara D40 (YD25DDTi 2.5L Denso)',
      'Navara / Urvan NV350 (YD25DDTi)',
    ],
    engineAndEcuTitle: 'Nissan Navara D40 (YD25DDTi 2.5L — Denso ECU)',
    benchTrapToEncode:
      'Split into Type 1 (Non-DPF / Non-ETV) and Type 2 (DPF + Electronic Throttle). Diagnostics work over K-Line alone, but full bench flashing/live bus emulation requires both CAN and K-Line plus dual Main Relay activation loops.',
    hardwareProfile: {
      ecuFamily: 'Denso YD25DDTi (SH7058 / SH7059)',
      mcuArchitecture: 'Renesas SH7058 / SH7059',
      hardwareVariant: 'Type 1 (Non-DPF / Non-ETV) & Type 2 (DPF + ETV)',
      requiresMainRelayLoop: true,
      requiresCaseGround: false,
      canTerminationOhms: 120,
      provenanceStatus: 'AI_INFERRED',
      requiresOcrVerify: true,
      conflictWarning:
        'YEAR-SPLIT PINOUT CONFLICT: 2007–2009 vs 2010+ Navara D40 YD25 harnesses reassign Pins 105, 107, and 108 between Ignition, Main Relay Activation, and Ground. Verify Denso 23710-xxxxx part number and continuity before energizing.',
      benchTrapNote:
        'Split into Type 1 (Non-DPF / Non-ETV) and Type 2 (DPF + Electronic Throttle). Diagnostics work over K-Line alone, but full bench flashing/live bus emulation requires both CAN and K-Line plus dual Main Relay activation loops.',
      benchWakeupPins: {
        kl30: ['121'],
        kl15: ['107', '108'],
        mainRelayControl: ['113', '105'],
        mainRelayReturn: ['119', '120'],
        mainRelayFeed: ['119', '120'],
        ground: ['1', '2', '115', '116'],
        groundCase: ['1', '2'],
        canHigh: ['95'],
        canLow: ['87'],
        canH: ['95'],
        canL: ['87'],
        kLine: ['89'],
      },
    },
    pinGroups: {
      powerAndRelay: [
        { pin: '121', signal: '+30 KL30 Battery', role: 'Permanent Battery Memory Supply (+12V)' },
        { pin: '107 & 108', signal: '+15 KL15 Ignition', role: 'Switched Ignition Wake-Up Input (+12V — Check 2007-09 vs 2010+ split)' },
        { pin: '119 & 120', signal: '+12V Feed from Main Relay', role: 'Main ECM Relay Switched +12V Return Supply' },
        { pin: '113 & 105', signal: 'Main Relay Activation — low-side', role: 'Dual Main Relay Coil Low-Side Sink Outputs' },
      ],
      grounds: [
        { pin: '1 & 2 / 115 & 116', signal: 'ECM Power Ground (KL31)', role: 'Verify DMM continuity to case/ground lug before energizing' },
      ],
      communication: [
        { pin: '95', signal: 'CAN-H', role: '500 kbps Diagnostic & Powertrain CAN High' },
        { pin: '87', signal: 'CAN-L', role: '500 kbps Diagnostic & Powertrain CAN Low' },
        { pin: '89', signal: 'K-Line to OBD2 Pin 7', role: 'ISO 9141 / Consult Diagnostic & Flash K-Line' },
      ],
    },
    pinouts:
      ECU_BRAND_PROFILES.find((p) => p.id === 'nissan-hitachi-mec11')?.pinouts.filter(
        (pin) => pin.plug === 'PLUG_D40_YD25'
      ) ?? [],
  },

  // 1D. Nissan Navara D23 / Terra (YS23DDTT — Bosch EDC17C84 / TC1782)
  {
    id: 'oem-map-nissan-navara-d23-edc17c84',
    brandKey: 'nissan',
    linkedProfileId: 'nissan-bosch-edc17c84',
    vehicleModels: [
      'Navara D23 / NP300 (YS23DDTT EDC17C84)',
      'Terra (YS23DDTT EDC17C84)',
    ],
    engineAndEcuTitle: 'Nissan Navara D23 / Terra (YS23DDTT — Bosch EDC17C84 / TC1782)',
    benchTrapToEncode:
      'No-Open Service Mode requires GPT1/GPT2 square-wave wake-up signals alongside KL30 (Q4), KL15 (D1), and KL31 (H4). Hardware revisions alternate GPT pins between M2/K3 (Rev A) and F4/G4 (Rev B).',
    hardwareProfile: {
      ecuFamily: 'Bosch EDC17C84',
      mcuArchitecture: 'Infineon TriCore TC1782',
      hardwareVariant: 'GPT Rev A (M2 / K3) & GPT Rev B (F4 / G4)',
      requiresMainRelayLoop: false,
      requiresCaseGround: true,
      canTerminationOhms: 120,
      provenanceStatus: 'AI_INFERRED',
      requiresOcrVerify: true,
      conflictWarning:
        'OCR_VERIFY REQUIRED: Confirm Bosch 0281xxxxxx hardware revision before connecting GPT1/GPT2 to M2/K3 (Primary Rev A) vs F4/G4 (Alternate Rev B). Bond H4 and aluminum case to KL31.',
      benchTrapNote:
        'Primary GPT pair M2 (GPT1) & K3 (GPT2); alternate hardware revision pair F4 (GPT1) & G4 (GPT2).',
      benchWakeupPins: {
        kl30: ['Q4'],
        kl15: ['D1'],
        ground: ['H4', 'Case GND'],
        groundCase: ['H4', 'Case GND'],
        canHigh: ['A1'],
        canLow: ['A2'],
        canH: ['A1'],
        canL: ['A2'],
        gpt1: ['M2', 'F4'],
        gpt2: ['K3', 'G4'],
        gptChannels: ['M2', 'K3', 'F4', 'G4'],
      },
    },
    pinGroups: {
      powerAndRelay: [
        { pin: 'Q4', signal: '+12V KL30', role: 'Permanent Battery Supply (+12V)' },
        { pin: 'D1', signal: '+12V KL15 Ignition', role: 'Switched Ignition Wake-Up (+12V)' },
      ],
      grounds: [
        { pin: 'H4', signal: 'Ground KL31', role: 'Main Power Ground + Aluminum Case Bond' },
      ],
      communication: [
        { pin: 'A1', signal: 'CAN-H', role: '500 kbps Bench Diagnostic CAN High' },
        { pin: 'A2', signal: 'CAN-L', role: '500 kbps Bench Diagnostic CAN Low' },
      ],
      gptWakeupSignals: [
        { pin: 'M2 (Rev A) / F4 (Rev B)', signal: 'GPT1', role: 'General Purpose Timer 1 Bench Handshake Pulse (1.0 kHz 5V)' },
        { pin: 'K3 (Rev A) / G4 (Rev B)', signal: 'GPT2', role: 'General Purpose Timer 2 Bench Handshake Pulse (2.0 kHz 5V)' },
      ],
    },
    pinouts: ECU_BRAND_PROFILES.find((p) => p.id === 'nissan-bosch-edc17c84')?.pinouts ?? [],
  },

  // 1E. Toyota Hilux / Fortuner / Innova (1GD-FTV / 2GD-FTV — Denso Gen 3/4)
  {
    id: 'oem-map-toyota-hilux-1gd-2gd-gen34',
    brandKey: 'toyota',
    linkedProfileId: 'toyota-denso-175822',
    vehicleModels: [
      'Hilux / Fortuner / Innova (1GD-FTV 2.8L / 2GD-FTV 2.4L)',
      'Hilux (1GD-FTV / 2GD-FTV Denso Gen 3/4)',
      'HiAce Super Grandia / Commuter Deluxe (1GD-FTV 2.8L)',
    ],
    engineAndEcuTitle: 'Toyota Hilux / Fortuner / Innova (1GD-FTV / 2GD-FTV — Denso Gen 3/4)',
    benchTrapToEncode:
      'Connector-indexed sensor & actuator map across Connectors B, C, and D requires dedicated 5V reference rails (20D VCNE, 17D VCG, 25B VCVG, 30C VNVC, 29C VCVL) and isolated sensor returns (19D NE-, 18D G2-, 24B EVG, 22C VNE2, 20C EVLU). Verify against Table #1 89661-0Kxxx part number.',
    hardwareProfile: {
      ecuFamily: 'Denso Gen 3/4 1GD-FTV / 2GD-FTV',
      mcuArchitecture: 'Renesas RH850 / SH72546R',
      hardwareVariant: 'Connectors B / C / D Sensor & VNT Map',
      requiresMainRelayLoop: true,
      requiresCaseGround: false,
      canTerminationOhms: 120,
      provenanceStatus: 'AI_INFERRED',
      requiresOcrVerify: true,
      conflictWarning:
        'CONFLICT WARNING: Verified PH-market Table #1 maps power/CAN on Plug A (A1 +B, A2 BATT, A9 IGSW, A10 MREL, A4 E1, A24/A25 CAN). This Gen 3/4 sub-variant adds Connectors B, C, and D sensor/actuator cavities. Confirm 89661-0Kxxx sticker before probing.',
      benchTrapNote:
        'Keep Crank/Cam differential grounds (19D NE-, 18D G2-) and MAF/VNT sensor grounds (24B EVG, 22C VNE2, 20C EVLU) isolated from high-current actuator returns.',
      benchWakeupPins: {
        kl30: ['A2', 'A1'],
        kl15: ['A9'],
        mainRelayControl: ['A10'],
        mainRelayReturn: ['A1'],
        mainRelayFeed: ['A1'],
        ground: ['A4', 'B1', '24B', '19D', '18D'],
        groundCase: ['A4', 'B1'],
        canHigh: ['A24'],
        canLow: ['A25'],
        canH: ['A24'],
        canL: ['A25'],
      },
    },
    pinGroups: {
      powerAndRelay: [
        { pin: 'A2 (BATT)', signal: '+12V KL30 Battery Backup', role: 'Permanent Memory Feed (Table #1 Verified)' },
        { pin: 'A9 (IGSW)', signal: '+12V KL15 Ignition Switch', role: 'Switched Ignition Wake-Up (Table #1 Verified)' },
        { pin: 'A10 (MREL)', signal: 'Main Relay Control', role: 'EFI Main Relay Coil Output' },
        { pin: 'A1 (+B)', signal: '+12V Main Relay Return', role: 'Switched Main Relay Supply' },
      ],
      grounds: [
        { pin: 'A4 (E1) / B1 (E01)', signal: 'Engine & Chassis Ground', role: 'Primary ECU Power Ground (Table #1 Verified)' },
        { pin: '19D (NE-)', signal: 'CKP- Return', role: 'Crankshaft Sensor Differential Return (Connector D)' },
        { pin: '18D (G2-)', signal: 'CMP- Return', role: 'Camshaft Sensor Differential Return (Connector D)' },
        { pin: '24B (EVG)', signal: 'MAF Ground', role: 'Mass Air Flow Sensor Ground Return (Connector B)' },
        { pin: '22C (VNE2)', signal: 'VNT Sensor Ground', role: 'VNT Position Sensor Ground (Connector C)' },
        { pin: '20C (EVLU)', signal: 'Diesel Throttle Sensor Ground', role: 'VLU Sensor Ground Return (Connector C)' },
      ],
      communication: [
        { pin: 'A24', signal: 'CANH', role: '500 kbps Diagnostic CAN High (Table #1 Verified)' },
        { pin: 'A25', signal: 'CANL', role: '500 kbps Diagnostic CAN Low (Table #1 Verified)' },
      ],
      fiveVoltReferences: [
        { pin: '20D (VCNE)', signal: 'CKP 5V', role: '5.0V Crankshaft Sensor Supply (Connector D)' },
        { pin: '17D (VCG)', signal: 'CMP 5V', role: '5.0V Camshaft Sensor Supply (Connector D)' },
        { pin: '25B (VCVG)', signal: 'MAF 5V', role: '5.0V MAF Sensor Reference Supply (Connector B)' },
        { pin: '30C (VNVC)', signal: 'VNT 5V', role: '5.0V VNT Position Sensor Supply (Connector C)' },
        { pin: '29C (VCVL)', signal: 'Throttle 5V', role: '5.0V Diesel Intake Throttle Sensor Supply (Connector C)' },
      ],
      coreSignals: [
        { pin: '28D (NE+)', signal: 'CKP+ Signal', role: 'Crankshaft Position Sensor Signal (Connector D)' },
        { pin: '27D (G2+)', signal: 'CMP+ Signal', role: 'Camshaft Position Sensor Signal (Connector D)' },
        { pin: '33B (VG)', signal: 'MAF Signal', role: 'Mass Air Flow Sensor Signal (Connector B)' },
        { pin: '32B (THA)', signal: 'Intake Air Temp', role: 'Intake Air Temperature Thermistor Signal (Connector B)' },
        { pin: '23C (VNA)', signal: 'VNT Position Signal', role: 'Variable Nozzle Turbo Vane Position Feedback (Connector C)' },
        { pin: '21C (VLU)', signal: 'Throttle Position Signal', role: 'Diesel Intake Throttle Position Feedback (Connector C)' },
      ],
      actuators: [
        { pin: '1C (VNM+)', signal: 'VNT Motor (+)', role: 'VNT Actuator DC Motor Positive Drive (Connector C)' },
        { pin: '2C (VNM-)', signal: 'VNT Motor (-)', role: 'VNT Actuator DC Motor Negative Drive (Connector C)' },
      ],
    },
    pinouts:
      ECU_BRAND_PROFILES.find((p) => p.id === 'toyota-denso-175822')?.pinouts.filter(
        (pin) => pin.plug === 'PLUG_1GD_GEN34_BCD'
      ) ?? [],
  },
];

/**
 * Curated verified models per `EcuBrandProfile` that aren't already enumerated in
 * `VERIFIED_VOICE_ECU_GUIDES`, eliminating mid-parenthesis splits and model duplication.
 */
const PROFILE_VERIFIED_MODELS: Record<string, string[]> = {
  'toyota-denso-175822': [
    'Hilux (1GD-FTV / 2GD-FTV Denso Gen 3/4)',
  ],
  'isuzu-transtron-4jj1': [
    'D-Max (4JJ1-TC 3.0L Transtron SH7058)',
    'D-Max (4JJ1-TCX / 4JK1)',
    'mu-X (4JJ1-TCX / 4JJ3-TCX)',
    'Alterra (4JJ1-TC)',
    'NHR / NKR / NPR Trucks (4JJ1 / 4JK1)',
  ],
  'mitsubishi-denso-diesel': [
    'L200 / Strada / Triton (4N15 2.4L MIVEC)',
    'Montero Sport / Pajero Sport (4N15 2.4L MIVEC)',
  ],
  'mitsubishi-melco-e6t': [
    'Lancer EX (4B11)',
    'Lancer Cedia (4G18)',
    'ASX (4B11)',
    'Outlander (4B12)',
  ],
  'nissan-hitachi-mec11': [
    'Sentra N16 (QG16DE MEC11 / MEC22)',
    'Navara D40 (YD25DDTi 2.5L Denso)',
  ],
  'nissan-bosch-edc17c84': [
    'Navara D23 / NP300 (YS23DDTT EDC17C84)',
    'Terra (YS23DDTT EDC17C84)',
  ],
  'hyundai-kia-edc16c39': [
    'Grand Starex (D4CB EDC16C39)',
    'H-100 / K2500 (D4CB)',
    'Sportage (D4EA / EDC16C39)',
  ],
  'magneti-marelli-iaw-5nf': [
    'Fiat Stilo (1.6L 16V IAW 5NF)',
    'Fiat Palio / Punto / Siena',
    'Fiat Idea / Doblo (1.6L / 1.8L)',
  ],
  'bosch-me75': [
    'Volkswagen Polo / Golf (ME7.5)',
    'Audi A4 / A6 (ME7.1.1 / ME7.5)',
    'VW Beetle (1.8T / 2.0L Petrol)',
  ],
  'ford-fomoco-sid208': [
    'Ranger 2.2L / 3.2L (SID208)',
    'Ranger Raptor (FoMoCo PCM)',
  ],
  'delphi-mt20u': [
    'Geely Coolray / Emgrand (MT20U / MT80)',
    'Changan CS35 (Delphi MT20U)',
    'Chery Tiggo (Delphi MT20U)',
  ],
};

/**
 * Derives canonical `brandKey` and `brandLabel` from a profile's `brandName`.
 */
export function normalizeBrandKey(brandName: string): { brandKey: string; brandLabel: string } {
  const rawMake = brandName.split('/')[0].trim();
  const brandKey = rawMake.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return { brandKey, brandLabel: rawMake };
}

function addUniqueModel(models: string[], model: string) {
  if (model && !models.includes(model)) {
    models.push(model);
  }
}

/**
 * Builds structured Car Make -> Vehicle Model -> ECU Hardware options cleanly from
 * `VERIFIED_VOICE_ECU_GUIDES`, curated `PROFILE_VERIFIED_MODELS`, and `RESTRICTED_MODEL_DATABASE`
 * with zero duplicate model names or broken comma-split fragments.
 */
export function buildVehicleCatalog(): VehicleMakeEntry[] {
  const makeMap = new Map<string, VehicleMakeEntry>();

  const ensureMake = (brandKey: string, brandLabel: string): VehicleMakeEntry => {
    let entry = makeMap.get(brandKey);
    if (!entry) {
      entry = { brandKey, brandLabel, models: [], profiles: [] };
      makeMap.set(brandKey, entry);
    }
    return entry;
  };

  for (const profile of ECU_BRAND_PROFILES) {
    const { brandKey, brandLabel } = normalizeBrandKey(profile.brandName);
    const entry = ensureMake(brandKey, brandLabel);
    entry.profiles.push(profile);
    const extraModels = PROFILE_VERIFIED_MODELS[profile.id] || [];
    for (const m of extraModels) {
      addUniqueModel(entry.models, m);
    }
  }

  for (const guide of VERIFIED_VOICE_ECU_GUIDES) {
    const entry = ensureMake(guide.brandKey, guide.brandLabel);
    for (const m of guide.models) {
      addUniqueModel(entry.models, m);
    }
  }

  for (const restricted of RESTRICTED_MODEL_DATABASE) {
    const entry = ensureMake(restricted.brandKey, restricted.brandLabel);
    addUniqueModel(entry.models, restricted.modelName);
  }

  return Array.from(makeMap.values());
}

export const VEHICLE_CATALOG: VehicleMakeEntry[] = buildVehicleCatalog();

/**
 * Looks up the structured OEM Bench Pinout Map entry for a given brand/model or ECU profile ID.
 */
export function getOemBenchPinoutMapForVehicle(
  brandKeyOrQuery: string,
  modelName?: string,
  ecuProfileId?: string | null
): OemBenchPinoutMapEntry | null {
  const q = `${brandKeyOrQuery} ${modelName || ''}`.trim().toLowerCase();
  if (modelName) {
    const exactModel = OEM_BENCH_PINOUT_MAPS.find(
      (m) =>
        m.brandKey === brandKeyOrQuery.toLowerCase() &&
        m.vehicleModels.some((vm) => vm.toLowerCase() === modelName.toLowerCase())
    );
    if (exactModel) return exactModel;
  }

  if (ecuProfileId) {
    const byProfile = OEM_BENCH_PINOUT_MAPS.find((m) => m.linkedProfileId === ecuProfileId);
    if (byProfile) return byProfile;
  }

  return (
    OEM_BENCH_PINOUT_MAPS.find(
      (m) =>
        m.id.toLowerCase() === q ||
        m.engineAndEcuTitle.toLowerCase().includes(q) ||
        m.vehicleModels.some((vm) => vm.toLowerCase().includes(q) || q.includes(vm.toLowerCase()))
    ) || null
  );
}

/**
 * Resolves the active `BenchHardwareProfile` for a given ECU profile ID or vehicle selection.
 */
export function getBenchHardwareProfileForVehicle(
  ecuProfileId: string | null,
  brandKey?: string,
  modelName?: string
): BenchHardwareProfile | null {
  if (brandKey && modelName) {
    const mapMatch = getOemBenchPinoutMapForVehicle(brandKey, modelName, ecuProfileId);
    if (mapMatch) return mapMatch.hardwareProfile;
  }
  const profile = getEcuProfileById(ecuProfileId);
  return profile?.benchHardwareProfile ?? null;
}

/**
 * Picks the best matching verified ECU profile for a given Car Make and Vehicle Model.
 * Strictly returns `null` for `PART_METADATA_ONLY` and `MECHANICAL_NO_ECU` vehicles so
 * restricted models never inherit unrelated ECU pinout maps.
 */
export function resolveProfileForVehicle(
  brandKey: string,
  modelName: string
): EcuBrandProfile | null {
  if (brandKey === UNIVERSAL_BRAND_KEY) return null;

  const restrictedMatch = RESTRICTED_MODEL_DATABASE.find(
    (r) => r.brandKey === brandKey && r.modelName === modelName
  );
  if (restrictedMatch) {
    return null;
  }

  const guideMatch = VERIFIED_VOICE_ECU_GUIDES.find(
    (g) => g.brandKey === brandKey && g.models.includes(modelName)
  );
  if (guideMatch) {
    return guideMatch.linkedProfileId
      ? ECU_BRAND_PROFILES.find((p) => p.id === guideMatch.linkedProfileId) || null
      : null;
  }

  for (const [profileId, models] of Object.entries(PROFILE_VERIFIED_MODELS)) {
    if (models.includes(modelName)) {
      return ECU_BRAND_PROFILES.find((p) => p.id === profileId) || null;
    }
  }

  const make = VEHICLE_CATALOG.find((m) => m.brandKey === brandKey);
  if (!make || make.profiles.length === 0) return null;
  return make.profiles[0];
}

/**
 * Resolves `brandKey`, default `modelName`, and `ecuProfileId` cleanly from an ECU profile ID.
 */
export function resolveSelectionFromProfileId(profileId: string): {
  brandKey: string;
  modelName: string;
  ecuProfileId: string | null;
} {
  const profile = ECU_BRAND_PROFILES.find((p) => p.id === profileId);
  if (!profile) {
    return {
      brandKey: UNIVERSAL_BRAND_KEY,
      modelName: 'Generic 16-Pin Bench',
      ecuProfileId: null,
    };
  }
  const { brandKey } = normalizeBrandKey(profile.brandName);
  const make = VEHICLE_CATALOG.find((m) => m.brandKey === brandKey);
  const curated = PROFILE_VERIFIED_MODELS[profile.id] || [];
  const linkedGuide = VERIFIED_VOICE_ECU_GUIDES.find((g) => g.linkedProfileId === profile.id);
  const matchedModel = curated[0] || linkedGuide?.models[0] || make?.models[0] || '';
  return {
    brandKey,
    modelName: matchedModel,
    ecuProfileId: profile.id,
  };
}

/**
 * Evaluates verification status (`VERIFIED`, `OCR_VERIFY`, `PART_METADATA_ONLY`, `MECHANICAL_NO_ECU`),
 * mandatory safety prompts, DLC protocol notes, and controller metadata for the selected vehicle.
 */
export function getSelectedVehicleContext(
  brandKey: string,
  modelName: string,
  ecuProfileId: string | null
): SelectedVehicleContext {
  if (brandKey === UNIVERSAL_BRAND_KEY) {
    return {
      brandKey,
      brandLabel: 'Universal ECU',
      modelName: 'Generic 16-Pin Bench',
      status: 'VERIFIED',
      gateAlert: null,
      spokenAlert: null,
      controllerNote: 'Universal 16-Pin SAE Bench Trainer (KL30 / KL15 / TPS / CAN)',
      dlcProtocol:
        TABLE16_DLC_INTERFACES.find((d) => d.brandKey === 'universal-bench')?.obd2Pins ||
        'SAE J1962 CAN (6/14) & K-Line (7)',
      tableRef: null,
      hasVerifiedPinoutMap: true,
    };
  }

  const restrictedMatch = RESTRICTED_MODEL_DATABASE.find(
    (r) => r.brandKey === brandKey && r.modelName === modelName
  );
  if (restrictedMatch) {
    const isMech = restrictedMatch.status === 'MECHANICAL_NO_ECU';
    const spokenAlert = isMech
      ? `${restrictedMatch.brandLabel} ${restrictedMatch.modelName}: mechanical fuel injection or carbureted platform with no Engine ECU.`
      : `${restrictedMatch.brandLabel} ${restrictedMatch.modelName} is metadata only. Factory pin numbers are unavailable and will not be fabricated.`;

    return {
      brandKey,
      brandLabel: restrictedMatch.brandLabel,
      modelName: restrictedMatch.modelName,
      status: restrictedMatch.status,
      gateAlert: restrictedMatch.restrictionReason,
      spokenAlert,
      controllerNote: restrictedMatch.oemControllerNote,
      dlcProtocol: restrictedMatch.dlcProtocol,
      tableRef: null,
      hasVerifiedPinoutMap: false,
    };
  }

  const guideMatch = VERIFIED_VOICE_ECU_GUIDES.find(
    (g) => g.brandKey === brandKey && g.models.includes(modelName)
  );
  const profile = getEcuProfileById(ecuProfileId);
  const oemBenchMap = getOemBenchPinoutMapForVehicle(brandKey, modelName, ecuProfileId);
  const activeHardwareProfile =
    oemBenchMap?.hardwareProfile || profile?.benchHardwareProfile || undefined;
  const dlcEntry =
    TABLE16_DLC_INTERFACES.find((d) => d.brandKey === brandKey) ||
    TABLE16_DLC_INTERFACES.find((d) => d.brandKey === 'universal-bench');

  if (guideMatch) {
    const gates = matchSafetyGatesForQuery(
      `${guideMatch.brandLabel} ${modelName} ${guideMatch.ecuName}`
    );
    const gateAlert = guideMatch.ocrVerifyGate || gates[0]?.prompt || null;
    const spokenAlert = gates[0]?.spokenAlert || guideMatch.voicePrompt;

    return {
      brandKey,
      brandLabel: guideMatch.brandLabel,
      modelName,
      status: guideMatch.status,
      gateAlert,
      spokenAlert,
      controllerNote: `${guideMatch.ecuName} — ${guideMatch.keyBenchPins}`,
      dlcProtocol: guideMatch.dlcProtocol,
      tableRef: guideMatch.tableRef,
      hasVerifiedPinoutMap: Boolean(profile || guideMatch.linkedProfileId),
      benchHardwareProfile: activeHardwareProfile,
      oemBenchPinoutMap: oemBenchMap || undefined,
    };
  }

  const make = VEHICLE_CATALOG.find((m) => m.brandKey === brandKey);
  const gates = matchSafetyGatesForQuery(
    `${make?.brandLabel || brandKey} ${modelName} ${profile?.modelName || ''}`
  );
  const requiresOcrGate =
    gates.length > 0 || Boolean(activeHardwareProfile?.requiresOcrVerify);

  return {
    brandKey,
    brandLabel: make?.brandLabel || brandKey,
    modelName,
    status: requiresOcrGate ? 'OCR_VERIFY' : 'VERIFIED',
    gateAlert:
      gates[0]?.prompt ||
      activeHardwareProfile?.conflictWarning ||
      oemBenchMap?.benchTrapToEncode ||
      null,
    spokenAlert: gates[0]?.spokenAlert || null,
    controllerNote:
      oemBenchMap?.engineAndEcuTitle ||
      profile?.modelName ||
      'Verified Bench ECU Profile',
    dlcProtocol: dlcEntry?.obd2Pins || 'SAE J1962 OBD-II CAN (6/14) & K-Line (7)',
    tableRef: profile ? 'ECU Connector Pinout Library' : null,
    hasVerifiedPinoutMap: Boolean(profile),
    benchHardwareProfile: activeHardwareProfile,
    oemBenchPinoutMap: oemBenchMap || undefined,
  };
}

/**
 * Applies selected OEM ECU pinout metadata onto the 16 simulated bench ECU pins.
 * Strictly preserves `id` (`ecu-pin-1`..`ecu-pin-16`), `pinNumber`, `label`, `category`,
 * `nominalVoltage`, and `internalResistance` so MNA solver equations and voice commands
 * remain 100% deterministic and unchanged.
 */
export function applyEcuProfileToPins(
  ecuProfileId: string | null,
  basePins: EcuPin[] = DEFAULT_ECU_PINS
): EcuPin[] {
  if (!ecuProfileId) {
    return basePins.map((pin) => ({ ...pin }));
  }

  const profile = ECU_BRAND_PROFILES.find((p) => p.id === ecuProfileId);
  if (!profile) {
    return basePins.map((pin) => ({ ...pin }));
  }

  return basePins.map((basePin) => {
    const oemMatch = profile.pinouts.find((op) => op.associatedSimPinId === basePin.id);
    if (!oemMatch) {
      return { ...basePin };
    }
    const cavityTag = oemMatch.pinCode ? ` [${oemMatch.pinCode}]` : ` [Pin ${oemMatch.pinNumber}]`;
    return {
      ...basePin,
      name: `${oemMatch.label}${cavityTag} · ${basePin.name}`,
      description: `${oemMatch.signalName} — ${oemMatch.wireColor} (${oemMatch.electricalSpec})`,
    };
  });
}

export function getEcuProfileById(ecuProfileId: string | null): EcuBrandProfile | null {
  if (!ecuProfileId) return null;
  return ECU_BRAND_PROFILES.find((p) => p.id === ecuProfileId) || null;
}

export function getHardwareVariantsForProfile(
  ecuProfileId: string | null
): BenchHardwareVariant[] {
  const profile = getEcuProfileById(ecuProfileId);
  return profile?.hardwareVariants ?? [];
}

