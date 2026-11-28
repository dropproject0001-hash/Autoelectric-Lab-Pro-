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
 * Strict Virtual Simulation Enforcer (Master Developer Instruction v1.1, Section 4).
 * AutoElectric Lab Pro is strictly virtual simulation only: NO ELM327, OBD-II live, J1939 live,
 * Bluetooth/USB/Serial ECU communication, ECU flashing, or physical output activation.
 * Never probes browser hardware APIs; always reports SOFTWARE_SIMULATION_ONLY / SIMULATED_BENCH_VALUE.
 */
export function inspectBenchHardwareAbstractionStatus(): HardwareAbstractionStatus {
  const transports: TransportCapabilityReport[] = [
    {
      transport: 'WEB_SERIAL',
      browserApiAvailable: false,
      connectedDeviceName: null,
      isConnected: false,
      statusNote: 'Disabled by design: Virtual simulation only (no physical serial/ECU bridge).',
    },
    {
      transport: 'WEB_USB',
      browserApiAvailable: false,
      connectedDeviceName: null,
      isConnected: false,
      statusNote: 'Disabled by design: Virtual simulation only (no physical USB hardware bridge).',
    },
    {
      transport: 'WEB_BLUETOOTH',
      browserApiAvailable: false,
      connectedDeviceName: null,
      isConnected: false,
      statusNote: 'Disabled by design: Virtual simulation only (no physical Bluetooth/ELM327 bridge).',
    },
    {
      transport: 'J2534_PASSTHRU',
      browserApiAvailable: false,
      connectedDeviceName: null,
      isConnected: false,
      statusNote: 'Disabled by design: Virtual simulation only (no J2534 flashing or live ECU comm).',
    },
    {
      transport: 'SOCKETCAN_BRIDGE',
      browserApiAvailable: false,
      connectedDeviceName: null,
      isConnected: false,
      statusNote: 'Disabled by design: Virtual simulation only (simulated CAN bus frame model active).',
    },
    {
      transport: 'PHYSICAL_DSO',
      browserApiAvailable: false,
      connectedDeviceName: null,
      isConnected: false,
      statusNote: 'Disabled by design: Virtual simulation only (mathematical SignalGenerator active).',
    },
  ];

  return {
    mode: 'SOFTWARE_SIMULATION_ONLY',
    isPhysicalHardwareConnected: false,
    measurementOriginLabel: 'SIMULATED_BENCH_VALUE',
    transports,
    disclosureNotice:
      'SIMULATED VIRTUAL BENCH ONLY: All DMM, oscilloscope, power supply, gauge, and 3D twin readouts are computed by the Modified Nodal Analysis (MNA) software simulator and are not physical ECU measurements.',
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
