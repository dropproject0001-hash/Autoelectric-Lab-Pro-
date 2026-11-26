/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { useMemo, useRef } from 'react';
import type {
  BenchComponent,
  DiagnosticTroubleCode,
  EcuPin,
  FaultType,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import type {
  RpmEmulatorState,
  SelectedVehicleContext,
} from '../utils/vehicleEcuRegistry';
import {
  DEFAULT_GAUGE_MONITOR_STATE,
  GaugeMonitorState,
  GaugeTelemetrySnapshot,
} from '../simulation/telemetry/telemetryTypes';
import { evaluateGaugeTelemetry } from '../simulation/telemetry/gaugeTelemetryEngine';
import {
  EmsCircuitLayer,
  EmsDigitalTwinState,
  EmsEcuSyncProfile,
  evaluateEmsDigitalTwinState,
  resolveEmsEcuSyncProfile,
} from '../simulation/telemetry/emsDigitalTwinSync';
import type {
  BenchOverlayMode,
  BenchTelemetrySnapshot,
} from '../components/three/BenchSceneManager';

export type EngineBlockZoneStatus = 'OK' | 'OPEN' | 'HIGH_R' | 'SHORT' | 'FAULT';

export interface EngineBlockZoneFault {
  status: EngineBlockZoneStatus;
  label: string;
  pinId?: string;
}

export interface EngineBlockFaultOverlayState {
  overallSeverity: 'NORMAL' | 'WARNING' | 'CRITICAL';
  hasActiveFault: boolean;
  blockShellStatus: EngineBlockZoneStatus;
  injectors: [
    EngineBlockZoneFault,
    EngineBlockZoneFault,
    EngineBlockZoneFault,
    EngineBlockZoneFault,
  ];
  coils: [
    EngineBlockZoneFault,
    EngineBlockZoneFault,
    EngineBlockZoneFault,
    EngineBlockZoneFault,
  ];
  sensorBus: EngineBlockZoneFault;
  groundStrap: EngineBlockZoneFault;
  activeFaultLabels: string[];
}

export interface EmsSensorSignalsSnapshot {
  tpsVoltageV: number;
  tpsPercent: number;
  mapVoltageV: number;
  ectVoltageV: number;
  ectTempC: number;
  vrefVoltageV: number;
  sgndVoltageV: number;
  canHighV: number;
  canLowV: number;
  ckpActive: boolean;
}

export interface EmsFiringOrderCylinderState {
  cylinder: 1 | 2 | 3 | 4;
  firingSlot: 0 | 1 | 2 | 3;
  injectorDutyPercent: number;
  injectorVoltageV: number;
  coilVoltageV: number;
  injectorStatus: EngineBlockZoneStatus;
  coilStatus: EngineBlockZoneStatus;
}

export interface EmsFiringOrderSnapshot {
  sequence: readonly [number, number, number, number];
  isFiring: boolean;
  rpm: number;
  powertrainMode: EmsEcuSyncProfile['powertrainMode'];
  cylinders: EmsFiringOrderCylinderState[];
}

export interface UseEmsTelemetrySyncParams {
  pins: EcuPin[];
  wires: WireConnection[];
  components: BenchComponent[];
  faults: InjectedFault[];
  activeDTCs: DiagnosticTroubleCode[];
  nodeVoltages: Record<string, number>;
  wireCurrentsMa: Record<string, number>;
  supplyCurrentDrawAmps?: number;
  isSupplyCurrentTripped?: boolean;
  multimeter: MultimeterState;
  powerSupply: PowerSupplyState;
  selectedPinId: string | null;
  simulationSpeed: number;
  overlayMode: BenchOverlayMode;
  explodeAmount: number;
  showEngineBlock: boolean;
  showFaultWireOverlay: boolean;
  circuitLayerFilter: EmsCircuitLayer;
  rpmEmulator?: RpmEmulatorState;
  gaugeMonitor?: GaugeMonitorState;
  vehicleContext?: SelectedVehicleContext | null;
  selectedEcuProfileId?: string | null;
  twinSyncMode?: 'LIVE_DATA' | 'MANUAL_REVIEW';
}

export interface UseEmsTelemetrySyncResult {
  emsProfile: EmsEcuSyncProfile;
  gaugeTelemetry: GaugeTelemetrySnapshot;
  emsState: EmsDigitalTwinState;
  displayedEmsState: EmsDigitalTwinState;
  sensorSignals: EmsSensorSignalsSnapshot;
  firingOrder: EmsFiringOrderSnapshot;
  engineBlockFaultOverlay: EngineBlockFaultOverlayState;
  telemetrySnapshot: BenchTelemetrySnapshot;
  displayedNodeVoltages: Record<string, number>;
  displayedFaults: InjectedFault[];
  displayedActiveDtcs: DiagnosticTroubleCode[];
  isManualReview: boolean;
}

const FALLBACK_RPM_EMULATOR: RpmEmulatorState = {
  isActive: false,
  rpm: 850,
  soundEnabled: true,
};

function mapFaultTypeToZoneStatus(faultType: FaultType): EngineBlockZoneStatus {
  switch (faultType) {
    case 'SHORT_TO_GND':
    case 'SHORT_TO_VBAT':
      return 'SHORT';
    case 'OPEN_CIRCUIT':
      return 'OPEN';
    case 'HIGH_RESISTANCE_1K':
      return 'HIGH_R';
    default:
      return 'OK';
  }
}

function zoneSeverityRank(status: EngineBlockZoneStatus): number {
  switch (status) {
    case 'SHORT':
      return 4;
    case 'FAULT':
      return 3;
    case 'OPEN':
      return 2;
    case 'HIGH_R':
      return 1;
    default:
      return 0;
  }
}

function upgradeZone(
  current: EngineBlockZoneFault,
  nextStatus: EngineBlockZoneStatus,
  label: string,
  pinId?: string
): EngineBlockZoneFault {
  if (zoneSeverityRank(nextStatus) > zoneSeverityRank(current.status)) {
    return { status: nextStatus, label, pinId };
  }
  return current;
}

/**
 * Pure MNA-to-3D-Engine-Block fault overlay classifier.
 * Maps active pin faults, cut/high-resistance harness wires, fuse trips, and ground lift
 * onto the 3D DOHC 4-cylinder engine block wire-mesh overlay zones.
 */
export function deriveEngineBlockFaultOverlay(params: {
  faults: InjectedFault[];
  wires: WireConnection[];
  emsState: EmsDigitalTwinState;
  activeDTCs?: DiagnosticTroubleCode[];
  isSupplyCurrentTripped?: boolean;
  ckpSignalLost?: boolean;
}): EngineBlockFaultOverlayState {
  const {
    faults,
    wires,
    emsState,
    isSupplyCurrentTripped = false,
    ckpSignalLost = false,
  } = params;

  const injectors: [
    EngineBlockZoneFault,
    EngineBlockZoneFault,
    EngineBlockZoneFault,
    EngineBlockZoneFault,
  ] = [
    { status: 'OK', label: 'INJ #1 OK', pinId: 'ecu-pin-10' },
    { status: 'OK', label: 'INJ #2 OK', pinId: 'ems-inj-2' },
    { status: 'OK', label: 'INJ #3 OK', pinId: 'ems-inj-3' },
    { status: 'OK', label: 'INJ #4 OK', pinId: 'ems-inj-4' },
  ];

  const coils: [
    EngineBlockZoneFault,
    EngineBlockZoneFault,
    EngineBlockZoneFault,
    EngineBlockZoneFault,
  ] = [
    { status: 'OK', label: 'COIL #1 OK', pinId: 'ecu-pin-11' },
    { status: 'OK', label: 'COIL #2 OK', pinId: 'ems-coil-2' },
    { status: 'OK', label: 'COIL #3 OK', pinId: 'ems-coil-3' },
    { status: 'OK', label: 'COIL #4 OK', pinId: 'ems-coil-4' },
  ];

  let sensorBus: EngineBlockZoneFault = {
    status: 'OK',
    label: 'SENSOR BUS OK',
    pinId: 'ecu-pin-7',
  };
  let groundStrap: EngineBlockZoneFault = {
    status: 'OK',
    label: 'ENGINE GND OK',
    pinId: 'ecu-pin-6',
  };
  let blockShellStatus: EngineBlockZoneStatus = 'OK';

  const activeFaultLabels: string[] = [];
  const pushLabel = (label: string) => {
    if (!activeFaultLabels.includes(label)) {
      activeFaultLabels.push(label);
    }
  };

  // 1. Inspect injected pin faults from the MNA fault manager
  for (const fault of faults) {
    if (fault.faultType === 'NONE') continue;
    const status = mapFaultTypeToZoneStatus(fault.faultType);
    const shortTag =
      fault.faultType === 'SHORT_TO_GND'
        ? 'SHORT GND'
        : fault.faultType === 'SHORT_TO_VBAT'
          ? 'SHORT VBAT'
          : fault.faultType === 'OPEN_CIRCUIT'
            ? 'OPEN CKT'
            : 'HIGH-R 1kΩ';

    if (fault.pinId === 'ecu-pin-10' || fault.pinId === 'inj-ctrl' || fault.pinId === 'inj-vbat') {
      const label = `INJ #1 ${shortTag}`;
      injectors[0] = upgradeZone(injectors[0], status, label, fault.pinId);
      pushLabel(label);
      if (status === 'SHORT') {
        for (let i = 1; i < 4; i++) {
          injectors[i] = upgradeZone(
            injectors[i],
            'FAULT',
            `INJ #${i + 1} 20A FUSE BLOWN`,
            `ems-inj-${i + 1}`
          );
        }
        pushLabel('20A INJ FUSE BLOWN');
      }
    } else if (fault.pinId.startsWith('ems-inj-')) {
      const cylIdx = Number(fault.pinId.replace('ems-inj-', '')) - 1;
      if (cylIdx >= 0 && cylIdx < 4) {
        const label = `INJ #${cylIdx + 1} ${shortTag}`;
        injectors[cylIdx] = upgradeZone(injectors[cylIdx], status, label, fault.pinId);
        pushLabel(label);
      }
    } else if (fault.pinId === 'ecu-pin-11' || fault.pinId === 'ems-coil-1') {
      const label = `COIL #1 ${shortTag}`;
      coils[0] = upgradeZone(coils[0], status, label, fault.pinId);
      pushLabel(label);
      if (status === 'SHORT') {
        for (let i = 1; i < 4; i++) {
          coils[i] = upgradeZone(
            coils[i],
            'FAULT',
            `COIL #${i + 1} 15A FUSE BLOWN`,
            `ems-coil-${i + 1}`
          );
        }
        pushLabel('15A COIL FUSE BLOWN');
      }
    } else if (fault.pinId.startsWith('ems-coil-')) {
      const cylIdx = Number(fault.pinId.replace('ems-coil-', '')) - 1;
      if (cylIdx >= 0 && cylIdx < 4) {
        const label = `COIL #${cylIdx + 1} ${shortTag}`;
        coils[cylIdx] = upgradeZone(coils[cylIdx], status, label, fault.pinId);
        pushLabel(label);
      }
    } else if (
      fault.pinId === 'ecu-pin-5' ||
      fault.pinId === 'ecu-pin-7' ||
      fault.pinId === 'ecu-pin-8' ||
      fault.pinId === 'ecu-pin-9' ||
      fault.pinId.startsWith('tps-') ||
      fault.pinId.startsWith('map-') ||
      fault.pinId.startsWith('ect-')
    ) {
      const sensorName =
        fault.pinId === 'ecu-pin-5'
          ? '5V VREF'
          : fault.pinId === 'ecu-pin-7' || fault.pinId.startsWith('tps-')
            ? 'TPS'
            : fault.pinId === 'ecu-pin-8' || fault.pinId.startsWith('map-')
              ? 'MAP'
              : 'ECT';
      const label = `${sensorName} ${shortTag}`;
      sensorBus = upgradeZone(sensorBus, status, label, fault.pinId);
      pushLabel(label);
    } else if (
      fault.pinId === 'ecu-pin-1' ||
      fault.pinId === 'ecu-pin-2' ||
      fault.pinId === 'ecu-pin-6' ||
      fault.pinId === 'chassis-gnd'
    ) {
      const gndName = fault.pinId === 'ecu-pin-6' ? 'SGND' : 'ENGINE GND';
      const label = `${gndName} ${shortTag}`;
      groundStrap = upgradeZone(groundStrap, status, label, fault.pinId);
      pushLabel(label);
    } else if (
      fault.pinId === 'ecu-pin-3' ||
      fault.pinId === 'ecu-pin-4' ||
      fault.pinId === 'ecu-pin-12' ||
      fault.pinId === 'ecu-pin-16'
    ) {
      const railName =
        fault.pinId === 'ecu-pin-12'
          ? 'MAIN RELAY'
          : fault.pinId === 'ecu-pin-16'
            ? 'FUEL PUMP'
            : fault.pinId === 'ecu-pin-3'
              ? 'KL30 B+'
              : 'KL15 IGN';
      const label = `${railName} ${shortTag}`;
      if (zoneSeverityRank(status) > zoneSeverityRank(blockShellStatus)) {
        blockShellStatus = status;
      }
      pushLabel(label);
    }
  }

  // 2. Inspect cut or high-resistance harness wires solved by MNA
  for (const wire of wires) {
    const joined = `${wire.sourcePinId}:${wire.targetPinId}`.toLowerCase();
    const isCut = Boolean(wire.isCut);
    const isHighR = !isCut && wire.resistance > 10;
    if (!isCut && !isHighR) continue;

    const status: EngineBlockZoneStatus = isCut ? 'OPEN' : 'HIGH_R';
    const tag = isCut ? 'WIRE CUT' : `HIGH-R (${Math.round(wire.resistance)}Ω)`;

    if (joined.includes('ecu-pin-10') || joined.includes('inj-ctrl') || joined.includes('inj-vbat')) {
      const label = `INJ #1 ${tag}`;
      injectors[0] = upgradeZone(injectors[0], status, label, 'ecu-pin-10');
      pushLabel(label);
    } else if (joined.includes('ecu-pin-11') || joined.includes('coil')) {
      const label = `COIL #1 ${tag}`;
      coils[0] = upgradeZone(coils[0], status, label, 'ecu-pin-11');
      pushLabel(label);
    } else if (
      joined.includes('tps') ||
      joined.includes('map') ||
      joined.includes('ect') ||
      joined.includes('ecu-pin-5') ||
      joined.includes('ecu-pin-7') ||
      joined.includes('ecu-pin-8') ||
      joined.includes('ecu-pin-9')
    ) {
      const label = `SENSOR HARNESS ${tag}`;
      sensorBus = upgradeZone(sensorBus, status, label, wire.sourcePinId);
      pushLabel(label);
    } else if (
      joined.includes('gnd') ||
      joined.includes('ecu-pin-1') ||
      joined.includes('ecu-pin-2') ||
      joined.includes('ecu-pin-6')
    ) {
      const label = `GROUND STRAP ${tag}`;
      groundStrap = upgradeZone(groundStrap, status, label, wire.sourcePinId);
      pushLabel(label);
    } else if (joined.includes('relay') || joined.includes('ecu-pin-12')) {
      if (zoneSeverityRank(status) > zoneSeverityRank(blockShellStatus)) {
        blockShellStatus = status;
      }
      pushLabel(`MAIN RELAY ${tag}`);
    }
  }

  // 3. Cross-check live MNA telemetry outputs (ground lift, CKP dropout, OCP trip)
  if (emsState.grounds.hasGroundFault && groundStrap.status === 'OK') {
    const label = `SGND LIFT (${emsState.grounds.groundOffsetMv}mV)`;
    groundStrap = upgradeZone(groundStrap, 'HIGH_R', label, 'ecu-pin-6');
    pushLabel(label);
  }

  if (ckpSignalLost) {
    sensorBus = upgradeZone(sensorBus, 'OPEN', 'CKP NO SIGNAL', 'ecu-pin-15');
    pushLabel('CKP NO SIGNAL');
  }

  if (isSupplyCurrentTripped || emsState.isSupplyTripped) {
    blockShellStatus = 'SHORT';
    pushLabel('PSU OCP SHORT TRIP');
  }

  const allStatuses: EngineBlockZoneStatus[] = [
    blockShellStatus,
    sensorBus.status,
    groundStrap.status,
    ...injectors.map((z) => z.status),
    ...coils.map((z) => z.status),
  ];

  const maxRank = allStatuses.reduce((acc, s) => Math.max(acc, zoneSeverityRank(s)), 0);
  const overallSeverity: EngineBlockFaultOverlayState['overallSeverity'] =
    maxRank >= 3 ? 'CRITICAL' : maxRank >= 1 ? 'WARNING' : 'NORMAL';

  return {
    overallSeverity,
    hasActiveFault: maxRank > 0,
    blockShellStatus,
    injectors,
    coils,
    sensorBus,
    groundStrap,
    activeFaultLabels,
  };
}

/**
 * Pure helper extracting normalized live sensor bus voltages from the MNA node solution.
 */
export function extractEmsSensorSignals(params: {
  nodeVoltages: Record<string, number>;
  components: BenchComponent[];
  emsState: EmsDigitalTwinState;
}): EmsSensorSignalsSnapshot {
  const { nodeVoltages, components, emsState } = params;
  const active = emsState.isPowerActive;
  const tpsComp = components.find((c) => c.id === 'comp-tps');
  const ectComp = components.find((c) => c.id === 'comp-ect');

  const safeV = (pinId: string) =>
    active ? Number((nodeVoltages[pinId] ?? 0).toFixed(2)) : 0;

  return {
    tpsVoltageV: safeV('ecu-pin-7'),
    tpsPercent: Number(tpsComp?.state?.throttleAnglePercent ?? emsState.tpsPercent),
    mapVoltageV: safeV('ecu-pin-8'),
    ectVoltageV: safeV('ecu-pin-9'),
    ectTempC: Number(ectComp?.state?.tempCelsius ?? emsState.ectTempC),
    vrefVoltageV: Number(emsState.vrefVoltageV.toFixed(2)),
    sgndVoltageV: Number(emsState.grounds.sgndVoltageV.toFixed(3)),
    canHighV: safeV('ecu-pin-13'),
    canLowV: safeV('ecu-pin-14'),
    ckpActive: emsState.isEngineRunning && !emsState.ckpSignalLost,
  };
}

/**
 * Real-time synchronization hook mapping the MNA circuit solution (voltages, currents,
 * ignition/injector states, and faults) to the 3D EMS engine telemetry, visual 1-3-4-2
 * firing order, sensor signals, and 3D engine-block wire-mesh fault overlay.
 */
export function useEmsTelemetrySync(
  params: UseEmsTelemetrySyncParams
): UseEmsTelemetrySyncResult {
  const {
    pins,
    wires,
    components,
    faults,
    activeDTCs,
    nodeVoltages,
    wireCurrentsMa,
    supplyCurrentDrawAmps = 0,
    isSupplyCurrentTripped = false,
    multimeter,
    powerSupply,
    selectedPinId,
    simulationSpeed,
    overlayMode,
    explodeAmount,
    showEngineBlock,
    showFaultWireOverlay,
    circuitLayerFilter,
    rpmEmulator = FALLBACK_RPM_EMULATOR,
    gaugeMonitor = DEFAULT_GAUGE_MONITOR_STATE,
    vehicleContext = null,
    selectedEcuProfileId = null,
    twinSyncMode = 'LIVE_DATA',
  } = params;

  const emsProfile = useMemo(
    () => resolveEmsEcuSyncProfile(vehicleContext, selectedEcuProfileId, pins),
    [vehicleContext, selectedEcuProfileId, pins]
  );

  const gaugeTelemetry = useMemo(
    () =>
      evaluateGaugeTelemetry({
        powerSupply,
        circuitSolution: {
          nodeVoltages,
          nodeResistances: {},
          wireCurrentsMa,
          activeDTCs,
          supplyCurrentDrawAmps,
          isSupplyCurrentTripped,
          multimeterReading: {
            display: '0.00 V',
            value: 0,
            unit: 'V',
            isOverLimit: false,
            isWarning: false,
            shouldBeep: false,
          },
        },
        components,
        faults,
        wires,
        rpmEmulator,
        gaugeMonitor,
      }),
    [
      powerSupply,
      nodeVoltages,
      wireCurrentsMa,
      activeDTCs,
      supplyCurrentDrawAmps,
      isSupplyCurrentTripped,
      components,
      faults,
      wires,
      rpmEmulator,
      gaugeMonitor,
    ]
  );

  const emsState = useMemo(
    () =>
      evaluateEmsDigitalTwinState({
        profile: emsProfile,
        powerSupply,
        nodeVoltages,
        wireCurrentsMa,
        components,
        faults,
        wires,
        rpm: gaugeTelemetry.rpm,
        isRpmRunning: gaugeTelemetry.statusCode === 'LIVE_SIMULATED',
        ckpSignalLost: Boolean(rpmEmulator.ckpSignalLost),
        supplyCurrentDrawAmps,
        isSupplyCurrentTripped,
      }),
    [
      emsProfile,
      powerSupply,
      nodeVoltages,
      wireCurrentsMa,
      components,
      faults,
      wires,
      gaugeTelemetry.rpm,
      gaugeTelemetry.statusCode,
      rpmEmulator.ckpSignalLost,
      supplyCurrentDrawAmps,
      isSupplyCurrentTripped,
    ]
  );

  const liveFaultOverlay = useMemo(
    () =>
      deriveEngineBlockFaultOverlay({
        faults,
        wires,
        emsState,
        activeDTCs,
        isSupplyCurrentTripped,
        ckpSignalLost: Boolean(rpmEmulator.ckpSignalLost),
      }),
    [faults, wires, emsState, activeDTCs, isSupplyCurrentTripped, rpmEmulator.ckpSignalLost]
  );

  const liveTelemetrySnapshot = useMemo<BenchTelemetrySnapshot>(
    () => ({
      pins,
      wires,
      components,
      faults,
      activeDTCs,
      nodeVoltages,
      wireCurrentsMa,
      multimeter,
      powerSupply,
      selectedPinId,
      simulationSpeed,
      overlayMode,
      explodeAmount,
      rpm: emsState.rpm,
      isRpmRunning: emsState.isEngineRunning,
      ckpSignalLost: Boolean(rpmEmulator.ckpSignalLost),
      showEngineBlock,
      showFaultWireOverlay,
      circuitLayerFilter,
      emsProfile,
      emsState,
      engineBlockFaultOverlay: liveFaultOverlay,
    }),
    [
      pins,
      wires,
      components,
      faults,
      activeDTCs,
      nodeVoltages,
      wireCurrentsMa,
      multimeter,
      powerSupply,
      selectedPinId,
      simulationSpeed,
      overlayMode,
      explodeAmount,
      emsState,
      rpmEmulator.ckpSignalLost,
      showEngineBlock,
      showFaultWireOverlay,
      circuitLayerFilter,
      emsProfile,
      liveFaultOverlay,
    ]
  );

  // Freeze MNA electrical snapshot cleanly during Manual Review while keeping 3D inspection interactive
  const frozenSnapshotRef = useRef<BenchTelemetrySnapshot | null>(null);
  if (twinSyncMode === 'LIVE_DATA') {
    frozenSnapshotRef.current = null;
  } else if (!frozenSnapshotRef.current) {
    frozenSnapshotRef.current = liveTelemetrySnapshot;
  }

  const isManualReview = twinSyncMode === 'MANUAL_REVIEW';

  const telemetrySnapshot = useMemo<BenchTelemetrySnapshot>(() => {
    if (isManualReview && frozenSnapshotRef.current) {
      return {
        ...frozenSnapshotRef.current,
        selectedPinId,
        overlayMode,
        explodeAmount,
        showEngineBlock,
        showFaultWireOverlay,
        circuitLayerFilter,
        simulationSpeed: 0,
        isRpmRunning: false,
      };
    }
    return liveTelemetrySnapshot;
  }, [
    isManualReview,
    liveTelemetrySnapshot,
    selectedPinId,
    overlayMode,
    explodeAmount,
    showEngineBlock,
    showFaultWireOverlay,
    circuitLayerFilter,
  ]);

  const displayedEmsState = telemetrySnapshot.emsState ?? emsState;
  const displayedNodeVoltages = telemetrySnapshot.nodeVoltages;
  const displayedFaults = telemetrySnapshot.faults;
  const displayedActiveDtcs = telemetrySnapshot.activeDTCs;
  const engineBlockFaultOverlay =
    telemetrySnapshot.engineBlockFaultOverlay ?? liveFaultOverlay;

  const sensorSignals = useMemo(
    () =>
      extractEmsSensorSignals({
        nodeVoltages: displayedNodeVoltages,
        components: telemetrySnapshot.components,
        emsState: displayedEmsState,
      }),
    [displayedNodeVoltages, telemetrySnapshot.components, displayedEmsState]
  );

  const firingOrder = useMemo<EmsFiringOrderSnapshot>(
    () => ({
      sequence: emsProfile.firingOrder,
      isFiring: displayedEmsState.isEngineRunning && !isManualReview,
      rpm: displayedEmsState.rpm,
      powertrainMode: emsProfile.powertrainMode,
      cylinders: displayedEmsState.cylinders.map((cyl, idx) => ({
        cylinder: cyl.cylinder,
        firingSlot: cyl.firingSlot,
        injectorDutyPercent: cyl.injectorDutyPercent,
        injectorVoltageV: cyl.injectorVoltageV,
        coilVoltageV: cyl.coilVoltageV,
        injectorStatus: engineBlockFaultOverlay.injectors[idx]?.status ?? 'OK',
        coilStatus: engineBlockFaultOverlay.coils[idx]?.status ?? 'OK',
      })),
    }),
    [emsProfile, displayedEmsState, engineBlockFaultOverlay, isManualReview]
  );

  return {
    emsProfile,
    gaugeTelemetry,
    emsState,
    displayedEmsState,
    sensorSignals,
    firingOrder,
    engineBlockFaultOverlay,
    telemetrySnapshot,
    displayedNodeVoltages,
    displayedFaults,
    displayedActiveDtcs,
    isManualReview,
  };
}
