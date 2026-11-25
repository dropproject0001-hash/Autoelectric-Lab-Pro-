/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { PinoutSafetyEvaluation } from '../utils/automotiveSafetyGuard';
import type { PreBenchGateStatus } from '../utils/diagnosticWorkflow';

export type BenchAcquisitionMode = 'SOFTWARE_SIMULATION_ONLY' | 'PHYSICAL_HARDWARE_BRIDGE';

export type PhysicalTransportKind =
  | 'WEB_SERIAL'
  | 'WEB_USB'
  | 'WEB_BLUETOOTH'
  | 'J2534_PASSTHRU'
  | 'SOCKETCAN_BRIDGE'
  | 'PHYSICAL_DSO';

export interface TransportCapabilityReport {
  transport: PhysicalTransportKind;
  browserApiAvailable: boolean;
  connectedDeviceName: string | null;
  isConnected: boolean;
  statusNote: string;
}

export interface HardwareAbstractionStatus {
  mode: BenchAcquisitionMode;
  isPhysicalHardwareConnected: boolean;
  measurementOriginLabel: 'SIMULATED_BENCH_VALUE' | 'VERIFIED_PHYSICAL_ACQUISITION';
  transports: TransportCapabilityReport[];
  disclosureNotice: string;
}

export interface PhysicalBenchEnergizeAuthorization {
  authorized: boolean;
  blockedReasons: string[];
  requiredProvenance: 'OEM_VERIFIED' | 'OFFICIAL_MANUFACTURER';
  actualProvenance: string;
}

/**
 * Probes the current runtime environment for physical hardware communication APIs
 * (Web Serial, Web USB, Web Bluetooth) and reports honest simulation vs. hardware status.
 * Unless an external hardware bridge is explicitly connected and verified, all measurements
 * are strictly labeled SOFTWARE_SIMULATION_ONLY / SIMULATED_BENCH_VALUE.
 */
export function inspectBenchHardwareAbstractionStatus(): HardwareAbstractionStatus {
  const nav =
    typeof navigator !== 'undefined'
      ? (navigator as unknown as Record<string, unknown>)
      : {};

  const hasWebSerial = Boolean(nav && typeof nav.serial === 'object' && nav.serial !== null);
  const hasWebUsb = Boolean(nav && typeof nav.usb === 'object' && nav.usb !== null);
  const hasWebBluetooth = Boolean(
    nav && typeof nav.bluetooth === 'object' && nav.bluetooth !== null
  );

  const transports: TransportCapabilityReport[] = [
    {
      transport: 'WEB_SERIAL',
      browserApiAvailable: hasWebSerial,
      connectedDeviceName: null,
      isConnected: false,
      statusNote: hasWebSerial
        ? 'Web Serial API present; no physical programmable PSU or UART adapter paired.'
        : 'Web Serial API unavailable in this browser context.',
    },
    {
      transport: 'WEB_USB',
      browserApiAvailable: hasWebUsb,
      connectedDeviceName: null,
      isConnected: false,
      statusNote: hasWebUsb
        ? 'Web USB API present; no USB oscilloscope or logic analyzer paired.'
        : 'Web USB API unavailable in this browser context.',
    },
    {
      transport: 'WEB_BLUETOOTH',
      browserApiAvailable: hasWebBluetooth,
      connectedDeviceName: null,
      isConnected: false,
      statusNote: hasWebBluetooth
        ? 'Web Bluetooth API present; no BLE OBD/DMM probe paired.'
        : 'Web Bluetooth API unavailable in this browser context.',
    },
    {
      transport: 'J2534_PASSTHRU',
      browserApiAvailable: false,
      connectedDeviceName: null,
      isConnected: false,
      statusNote: 'SAE J2534 PassThru local daemon not connected (Software MNA simulation active).',
    },
    {
      transport: 'SOCKETCAN_BRIDGE',
      browserApiAvailable: false,
      connectedDeviceName: null,
      isConnected: false,
      statusNote: 'Physical CAN transceiver bridge not connected (Simulated CAN bus frame generator active).',
    },
    {
      transport: 'PHYSICAL_DSO',
      browserApiAvailable: false,
      connectedDeviceName: null,
      isConnected: false,
      statusNote: 'Physical DSO acquisition channel not connected (Mathematical SignalGenerator active).',
    },
  ];

  const isPhysicalHardwareConnected = transports.some((t) => t.isConnected);

  return {
    mode: isPhysicalHardwareConnected ? 'PHYSICAL_HARDWARE_BRIDGE' : 'SOFTWARE_SIMULATION_ONLY',
    isPhysicalHardwareConnected,
    measurementOriginLabel: isPhysicalHardwareConnected
      ? 'VERIFIED_PHYSICAL_ACQUISITION'
      : 'SIMULATED_BENCH_VALUE',
    transports,
    disclosureNotice:
      'All DMM, oscilloscope, power supply, gauge, and 3D twin readouts are computed by the Modified Nodal Analysis (MNA) software simulator unless a verified physical hardware acquisition bridge is paired.',
  };
}

/**
 * Safety interlock gate for any future physical power supply or relay actuation hardware.
 * Rejects SIMULATION_ONLY (universal trainer), AI_INFERRED, COMMUNITY_UNVERIFIED, or unconfirmed
 * pre-bench checklist states.
 */
export function authorizePhysicalBenchPowerControl(params: {
  safetyEval: PinoutSafetyEvaluation;
  preBenchGate: PreBenchGateStatus;
  technicianExplicitConfirm: boolean;
}): PhysicalBenchEnergizeAuthorization {
  const blockedReasons: string[] = [];

  if (params.safetyEval.provenanceStatus === 'SIMULATION_ONLY') {
    blockedReasons.push(
      'SIMULATION_ONLY provenance (Universal 16-Pin Trainer) cannot authorize energizing physical bench hardware.'
    );
  }

  if (!params.safetyEval.canEnergizePhysicalBench) {
    blockedReasons.push(
      ...params.safetyEval.warnings.filter((w) => !blockedReasons.includes(w))
    );
    if (blockedReasons.length === 0) {
      blockedReasons.push(
        'Physical bench energizing requires an OEM_VERIFIED or OFFICIAL_MANUFACTURER pinout with confirmed ECU part number and connector orientation.'
      );
    }
  }

  if (params.preBenchGate.mandatoryChecked < params.preBenchGate.mandatoryTotal) {
    blockedReasons.push(
      `Pre-Bench Safety Checklist incomplete (${params.preBenchGate.mandatoryChecked}/${params.preBenchGate.mandatoryTotal} mandatory checks verified). Bypass is not permitted for physical hardware power control.`
    );
  }

  if (!params.technicianExplicitConfirm) {
    blockedReasons.push(
      'Explicit technician physical-bench arming confirmation is required.'
    );
  }

  return {
    authorized: blockedReasons.length === 0,
    blockedReasons,
    requiredProvenance: 'OEM_VERIFIED',
    actualProvenance: params.safetyEval.provenanceStatus,
  };
}
