/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Eye,
  Flame,
  Gauge,
  Layers,
  RotateCcw,
  Sliders,
  Zap,
  AlertTriangle,
  Bot,
  Globe,
  Cpu,
  Power,
  Filter,
} from 'lucide-react';
import {
  BenchComponent,
  DiagnosticTroubleCode,
  EcuPin,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import {
  BenchOverlayMode,
  BenchSceneManager,
  BenchTelemetrySnapshot,
  CameraPresetKey,
  ProjectedCallout,
} from './three/BenchSceneManager';
import { PickTargetMeta } from './three/ecuHardwareModels';
import { RotaryEncoderDial } from './HardwareControls';
import type {
  RpmEmulatorState,
  SelectedVehicleContext,
} from '../utils/vehicleEcuRegistry';
import {
  DEFAULT_GAUGE_MONITOR_STATE,
  GaugeMonitorState,
} from '../simulation/telemetry/telemetryTypes';
import { evaluateGaugeTelemetry } from '../simulation/telemetry/gaugeTelemetryEngine';
import {
  EmsCircuitLayer,
  evaluateEmsDigitalTwinState,
  resolveEmsEcuSyncProfile,
} from '../simulation/telemetry/emsDigitalTwinSync';
import {
  buildClockwiseArcPath,
  useDampedGaugeMotion,
} from './gauges/useDampedGaugeMotion';

interface ThreeBenchTwinProps {
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
  rpmEmulator?: RpmEmulatorState;
  gaugeMonitor?: GaugeMonitorState;
  vehicleContext?: SelectedVehicleContext | null;
  selectedEcuProfileId?: string | null;
  twinSyncMode?: 'LIVE_DATA' | 'MANUAL_REVIEW';
  onToggleTwinSyncMode?: () => void;
  onSelectPin: (pinId: string | null) => void;
  onAttachProbe: (color: 'red' | 'black', pinId: string, label: string) => void;
  onUpdateComponentState: (
    compId: string,
    stateUpdates: Record<string, number | boolean | string>
  ) => void;
  onToggleIgnition?: () => void;
  onOpenOfflineBot?: (prompt?: string) => void;
  onOpenGroundedSearch?: (query?: string, dtc?: string) => void;
}

const FALLBACK_RPM_EMULATOR: RpmEmulatorState = {
  isActive: false,
  rpm: 850,
  soundEnabled: true,
};

const MINI_RPM_START_DEG = -225;
const MINI_RPM_SWEEP_DEG = 270;
const MINI_RPM_TRACK_ARC = buildClockwiseArcPath(
  44,
  44,
  31,
  MINI_RPM_START_DEG,
  MINI_RPM_START_DEG + MINI_RPM_SWEEP_DEG,
  0
);

const CIRCUIT_LAYER_OPTIONS: [EmsCircuitLayer, string][] = [
  ['ALL', 'All'],
  ['POWER_FUSES', 'Power/Fuses'],
  ['RELAYS', 'Relays'],
  ['INJ_COILS', 'Inj/Coils'],
  ['FUEL_SYSTEM', 'Fuel'],
  ['GROUNDS', 'Grounds'],
];

const MiniRpmDial: React.FC<{
  rpm: number;
  statusLabel: string;
  isLive: boolean;
  hasCkpFault: boolean;
  wellClass?: string;
}> = ({ rpm, statusLabel, isLive, hasCkpFault, wellClass = 'bg-[#0d1016]' }) => {
  const maxRpm = 8000;
  const clamped = Math.max(0, Math.min(maxRpm, rpm));

  const { needleRef, arcRef, arcPathLengthUnits } = useDampedGaugeMotion({
    value: clamped,
    min: 0,
    max: maxRpm,
    startAngleDeg: MINI_RPM_START_DEG,
    sweepAngleDeg: MINI_RPM_SWEEP_DEG,
  });

  return (
    <div
      className={`flex flex-col items-center justify-center ${wellClass} border border-[#2a313e] rounded-[2px] px-1.5 py-1 shrink-0 transition-colors`}
    >
      <svg viewBox="0 0 88 88" className="w-[70px] h-[70px]" aria-label={`Engine RPM ${rpm}`}>
        <circle cx="44" cy="44" r="39" fill="#0b0e13" stroke="#2c3444" strokeWidth="2" />
        <path
          d={MINI_RPM_TRACK_ARC}
          fill="none"
          stroke="#1b2230"
          strokeWidth="2.5"
          strokeLinecap="butt"
        />
        <path
          ref={arcRef}
          d={MINI_RPM_TRACK_ARC}
          pathLength={arcPathLengthUnits}
          strokeDasharray={arcPathLengthUnits}
          fill="none"
          stroke={hasCkpFault ? '#ef4444' : isLive ? '#f59e0b' : '#64748b'}
          strokeOpacity={hasCkpFault ? 0.8 : isLive ? 0.75 : 0.4}
          strokeWidth="2.5"
          strokeLinecap="butt"
        />
        <path
          d="M 69.5 64.5 A 31 31 0 0 0 74.5 39"
          fill="none"
          stroke="#ef4444"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {Array.from({ length: 9 }, (_, i) => {
          const deg = MINI_RPM_START_DEG + (i / 8) * MINI_RPM_SWEEP_DEG;
          const rad = (deg * Math.PI) / 180;
          const x1 = 44 + Math.cos(rad) * 28;
          const y1 = 44 + Math.sin(rad) * 28;
          const x2 = 44 + Math.cos(rad) * 34;
          const y2 = 44 + Math.sin(rad) * 34;
          const tx = 44 + Math.cos(rad) * 22;
          const ty = 44 + Math.sin(rad) * 22 + 2.5;
          return (
            <g key={i}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={i >= 7 ? '#ef4444' : '#94a3b8'}
                strokeWidth="1.3"
              />
              <text
                x={tx}
                y={ty}
                textAnchor="middle"
                fontSize="6.5"
                fontFamily="monospace"
                fill={i >= 7 ? '#fca5a5' : '#cbd5e1'}
              >
                {i}
              </text>
            </g>
          );
        })}
        <g
          ref={needleRef}
          style={{
            transformOrigin: '44px 44px',
            willChange: 'transform',
          }}
        >
          <line
            x1="44"
            y1="44"
            x2="72"
            y2="44"
            stroke={hasCkpFault ? '#ef4444' : '#f59e0b'}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
        <circle cx="44" cy="44" r="3.5" fill="#cbd5e1" stroke="#0f172a" strokeWidth="1" />
        <text
          x="44"
          y="63"
          textAnchor="middle"
          fontSize="10"
          fontFamily="monospace"
          fontWeight="bold"
          fill={hasCkpFault ? '#fca5a5' : isLive ? '#f8fafc' : '#64748b'}
        >
          {clamped}
        </text>
        <text
          x="44"
          y="72"
          textAnchor="middle"
          fontSize="5.5"
          fontFamily="monospace"
          fill={hasCkpFault ? '#ef4444' : isLive ? '#4ade80' : '#64748b'}
        >
          {hasCkpFault ? 'NO CKP' : isLive ? 'LIVE RPM' : statusLabel.slice(0, 8)}
        </text>
      </svg>
    </div>
  );
};

const ThreeBenchTwinComponent: React.FC<ThreeBenchTwinProps> = ({
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
  rpmEmulator = FALLBACK_RPM_EMULATOR,
  gaugeMonitor = DEFAULT_GAUGE_MONITOR_STATE,
  vehicleContext = null,
  selectedEcuProfileId = null,
  twinSyncMode = 'LIVE_DATA',
  onToggleTwinSyncMode,
  onSelectPin,
  onAttachProbe,
  onUpdateComponentState,
  onToggleIgnition,
  onOpenOfflineBot,
  onOpenGroundedSearch,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<BenchSceneManager | null>(null);

  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [topHudCollapsed, setTopHudCollapsed] = useState(false);
  const [hudOpacityMode, setHudOpacityMode] = useState<'GLASS' | 'CLEAR' | 'SOLID'>('GLASS');
  const [showSyncedGauges, setShowSyncedGauges] = useState(false);
  const [showEngineBlock, setShowEngineBlock] = useState(false);
  const [circuitLayerFilter, setCircuitLayerFilter] = useState<EmsCircuitLayer>('ALL');
  const [activePreset, setActivePreset] = useState<CameraPresetKey>('OVERVIEW');
  const [overlayMode, setOverlayMode] = useState<BenchOverlayMode>('WIRE_ID');
  const [explodeAmount, setExplodeAmount] = useState(0);
  const [hoveredMeta, setHoveredMeta] = useState<PickTargetMeta | null>(null);
  const [selectedMeta, setSelectedMeta] = useState<PickTargetMeta | null>(null);
  const [projectedCallout, setProjectedCallout] = useState<ProjectedCallout | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const hudStyleTokens = useMemo(() => {
    switch (hudOpacityMode) {
      case 'CLEAR':
        return {
          percentLabel: '35%',
          panelSurface:
            'bg-[#0C1524]/40 border-[#203653]/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]',
          wellSurface: 'bg-[#050A12]/45 border-[#203653]/85',
          tabSurface: 'bg-[#0C1524]/50 border-[#203653]/85',
          nextTitle: 'Overlay 35% (Clear) — Click for 94% Solid HUD',
        };
      case 'SOLID':
        return {
          percentLabel: '94%',
          panelSurface: 'bg-[#0C1524]/95 border-[#203653]',
          wellSurface: 'bg-[#050A12]/95 border-[#203653]',
          tabSurface: 'bg-[#0C1524]/96 border-[#203653]',
          nextTitle: 'Overlay 94% (Solid) — Click for 82% Translucent HUD',
        };
      case 'GLASS':
      default:
        return {
          percentLabel: '82%',
          panelSurface:
            'bg-[#0C1524]/84 border-[#203653]/95 [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]',
          wellSurface: 'bg-[#050A12]/80 border-[#203653]/90',
          tabSurface: 'bg-[#0C1524]/88 border-[#203653]/95',
          nextTitle: 'Overlay 82% (Translucent) — Click for 35% Clear View',
        };
    }
  }, [hudOpacityMode]);

  const cycleHudOpacity = useCallback(() => {
    setHudOpacityMode((prev) =>
      prev === 'GLASS' ? 'CLEAR' : prev === 'CLEAR' ? 'SOLID' : 'GLASS'
    );
  }, []);

  const onSelectPinRef = useRef(onSelectPin);
  onSelectPinRef.current = onSelectPin;
  const onToggleIgnitionRef = useRef(onToggleIgnition);
  onToggleIgnitionRef.current = onToggleIgnition;

  // Auto-sync EMS digital twin hardware profile with selected physical ECU
  const emsProfile = useMemo(
    () => resolveEmsEcuSyncProfile(vehicleContext, selectedEcuProfileId, pins),
    [vehicleContext, selectedEcuProfileId, pins]
  );

  const syncedTelemetry = useMemo(
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

  // Full live EMS telemetry snapshot (fuses, dual relays, 4-cyl injectors/coils, fuel pump, grounds)
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
        rpm: syncedTelemetry.rpm,
        isRpmRunning: syncedTelemetry.statusCode === 'LIVE_SIMULATED',
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
      syncedTelemetry.rpm,
      syncedTelemetry.statusCode,
      rpmEmulator.ckpSignalLost,
      supplyCurrentDrawAmps,
      isSupplyCurrentTripped,
    ]
  );

  const liveTelemetry = useMemo<BenchTelemetrySnapshot>(
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
      circuitLayerFilter,
      emsProfile,
      emsState,
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
      circuitLayerFilter,
      emsProfile,
    ]
  );

  // Freeze MNA electrical snapshot when Manual Review mode is active while preserving 3D view & inspection controls
  const frozenSnapshotRef = useRef<BenchTelemetrySnapshot | null>(null);
  if (twinSyncMode === 'LIVE_DATA') {
    frozenSnapshotRef.current = null;
  } else if (!frozenSnapshotRef.current) {
    frozenSnapshotRef.current = liveTelemetry;
  }

  const latestTelemetry = useMemo<BenchTelemetrySnapshot>(() => {
    if (twinSyncMode === 'MANUAL_REVIEW' && frozenSnapshotRef.current) {
      return {
        ...frozenSnapshotRef.current,
        selectedPinId,
        overlayMode,
        explodeAmount,
        showEngineBlock,
        circuitLayerFilter,
        simulationSpeed: 0,
        isRpmRunning: false,
      };
    }
    return liveTelemetry;
  }, [
    twinSyncMode,
    liveTelemetry,
    selectedPinId,
    overlayMode,
    explodeAmount,
    showEngineBlock,
    circuitLayerFilter,
  ]);

  const displayedEmsState = latestTelemetry.emsState ?? emsState;
  const displayedNodeVoltages = latestTelemetry.nodeVoltages;
  const displayedFaults = latestTelemetry.faults;
  const displayedActiveDtcs = latestTelemetry.activeDTCs;

  const initialTelemetryRef = useRef(latestTelemetry);
  initialTelemetryRef.current = latestTelemetry;

  // Mount Three.js WebGL scene once inside isolated mountRef
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let mgr: BenchSceneManager | null = null;
    try {
      mgr = new BenchSceneManager(container, initialTelemetryRef.current, {
        onHoverTarget: (meta) => setHoveredMeta(meta),
        onSelectTarget: (meta) => {
          setSelectedMeta(meta);
          if (meta?.pinId) {
            onSelectPinRef.current(meta.pinId);
          }
        },
        onToggleIgnition: () => {
          onToggleIgnitionRef.current?.();
        },
        onContextLostChange: (lost) => setContextLost(lost),
        onExplodeTargetSync: (val) => setExplodeAmount(val),
        onCalloutProject: (callout) => setProjectedCallout(callout),
      });
      managerRef.current = mgr;
      setInitError(null);
    } catch (err) {
      setInitError(
        err instanceof Error ? err.message : 'WebGL2 3D viewport failed to initialize.'
      );
    }

    return () => {
      mgr?.dispose();
      managerRef.current = null;
    };
  }, []);

  // Push live MNA + ECU profile + EMS state updates into scene without recreating WebGL
  useEffect(() => {
    managerRef.current?.updateTelemetry(latestTelemetry);
  }, [latestTelemetry]);

  // Keyboard shortcut 'H' to toggle HUD dock
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handlePresetClick = useCallback((preset: CameraPresetKey) => {
    setActivePreset(preset);
    if (preset === 'ENGINE_BAY') {
      setShowEngineBlock(true);
    }
    managerRef.current?.flyToPreset(preset);
  }, []);

  const handleToggleEngineBlock = useCallback(() => {
    setShowEngineBlock((prev) => {
      const next = !prev;
      setActivePreset(next ? 'ENGINE_BAY' : 'OVERVIEW');
      return next;
    });
  }, []);

  // Resolve active inspected target (hovered takes live peek, else selectedMeta / selectedPinId)
  const activeMeta = hoveredMeta ?? selectedMeta;
  const inspectedPinId = activeMeta?.pinId ?? selectedPinId;
  const inspectedEcuPin = useMemo(
    () => pins.find((p) => p.id === inspectedPinId) || null,
    [pins, inspectedPinId]
  );

  const inspectedFuse = useMemo(
    () =>
      activeMeta?.fuseId
        ? displayedEmsState.fuses.find((f) => f.id === activeMeta.fuseId) || null
        : null,
    [activeMeta, displayedEmsState.fuses]
  );

  const inspectedLabel = useMemo(() => {
    if (activeMeta) return activeMeta.label;
    if (inspectedEcuPin) return `Pin ${inspectedEcuPin.pinNumber}: ${inspectedEcuPin.label}`;
    for (const c of components) {
      const cp = c.pins.find((p) => p.id === inspectedPinId);
      if (cp) return `${c.name.split('(')[0].trim()} · ${cp.label}`;
    }
    if (inspectedPinId === 'chassis-gnd') return 'SYSTEM GND G1 (KL31)';
    if (inspectedPinId === 'ems-sgnd-bus') return 'SENSOR GND BUS (SGND)';
    if (inspectedPinId === 'ems-gnd-g2') return 'ENGINE GND G2 (KL31)';
    return 'Click any 3D Pin, Fuse, Relay, Coil or Key';
  }, [activeMeta, inspectedEcuPin, components, inspectedPinId]);

  const inspectedOemMapNote = useMemo(() => {
    const m = emsProfile.oemPinMapping;
    switch (inspectedPinId) {
      case 'ecu-pin-3':
      case 'ems-batt-pos':
        return `Physical ECU: ${m.kl30}`;
      case 'ecu-pin-4':
        return `Physical ECU: ${m.kl15}`;
      case 'ecu-pin-1':
      case 'ecu-pin-2':
      case 'chassis-gnd':
      case 'ems-gnd-g2':
        return `Physical ECU: ${m.gnd}`;
      case 'ecu-pin-5':
      case 'tps-vcc':
        return `Physical ECU: ${m.vref}`;
      case 'ecu-pin-6':
      case 'ems-sgnd-bus':
      case 'tps-gnd':
        return `Physical ECU: ${m.sgnd}`;
      case 'ecu-pin-7':
      case 'tps-sig':
        return `Physical ECU: ${m.tpsSig}`;
      case 'ecu-pin-10':
      case 'inj-ctrl':
        return `Physical ECU: ${m.inj1}`;
      case 'ecu-pin-11':
      case 'ems-coil-1':
        return `Physical ECU: ${m.coil1}`;
      case 'ecu-pin-12':
      case 'relay-85':
        return `Physical ECU: ${m.mainRelayCtrl}`;
      case 'ecu-pin-16':
      case 'ems-fp-85':
      case 'ems-fuel-pump-pos':
        return `Physical ECU: ${m.fuelPumpRelayCtrl}`;
      case 'ecu-pin-13':
      case 'can-term-h':
        return `Physical ECU: ${m.canH}`;
      case 'ecu-pin-14':
      case 'can-term-l':
        return `Physical ECU: ${m.canL}`;
      default:
        return null;
    }
  }, [emsProfile, inspectedPinId]);

  const inspectedVoltage = useMemo(() => {
    if (inspectedFuse) return inspectedFuse.voltageOutV;
    if (inspectedPinId === 'ems-batt-pos') return displayedEmsState.batteryVoltageV;
    if (inspectedPinId === 'ems-fuel-pump-pos' || inspectedPinId === 'ems-fp-87') {
      return displayedEmsState.fuelSystem.pumpVoltageV;
    }
    if (inspectedPinId === 'ems-sgnd-bus') return displayedEmsState.grounds.sgndVoltageV;
    if (inspectedPinId === 'ems-gnd-g2') return displayedEmsState.grounds.g2EngineVoltageV;
    if (inspectedPinId?.startsWith('ems-coil-')) return displayedEmsState.switchedRailVoltageV;
    if (inspectedPinId?.startsWith('ems-inj-')) return displayedEmsState.switchedRailVoltageV;
    if (inspectedPinId && displayedNodeVoltages[inspectedPinId] !== undefined) {
      return displayedNodeVoltages[inspectedPinId];
    }
    return null;
  }, [inspectedFuse, inspectedPinId, displayedEmsState, displayedNodeVoltages]);

  const inspectedFault = useMemo(
    () => (inspectedPinId ? displayedFaults.find((f) => f.pinId === inspectedPinId) : undefined),
    [displayedFaults, inspectedPinId]
  );

  const inspectedDtc = useMemo(
    () =>
      inspectedPinId
        ? displayedActiveDtcs.find((d) => d.associatedPinIds.includes(inspectedPinId))
        : undefined,
    [displayedActiveDtcs, inspectedPinId]
  );

  const tpsComp = useMemo(() => components.find((c) => c.id === 'comp-tps'), [components]);
  const tpsThrottlePct = Number(tpsComp?.state?.throttleAnglePercent ?? 20);
  const showTpsQuickSlider =
    showSyncedGauges ||
    inspectedPinId === 'ecu-pin-7' ||
    inspectedPinId === 'tps-sig' ||
    inspectedPinId === 'tps-vcc' ||
    inspectedPinId === 'tps-gnd';

  const showCalloutLeader =
    Boolean(projectedCallout?.visible) &&
    projectedCallout!.x > 40 &&
    projectedCallout!.y > 140;

  return (
    <div className="relative flex-1 w-full h-full rounded-[3px] overflow-hidden border border-[#2f3745] bg-[#0b111b]">
      {/* Isolated WebGL Canvas Container */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Projected 3D Pin / Multi-Plug Callout Leader Line */}
      {showCalloutLeader && projectedCallout && (
        <div className="absolute inset-0 pointer-events-none z-[5] overflow-hidden">
          <svg className="w-full h-full">
            <polyline
              points={`${projectedCallout.x},${projectedCallout.y} ${projectedCallout.x},${Math.max(96, projectedCallout.y - 44)} ${projectedCallout.x + 28},${Math.max(96, projectedCallout.y - 44)}`}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.25"
              strokeDasharray="2,2"
            />
            <circle cx={projectedCallout.x} cy={projectedCallout.y} r="3" fill="#f59e0b" />
          </svg>
          <div
            style={{
              left: `${projectedCallout.x + 30}px`,
              top: `${Math.max(84, projectedCallout.y - 56)}px`,
            }}
            className="absolute bg-[#0C1524]/95 border border-[#19C8F5]/55 rounded-md px-2 py-0.5 text-[9.5px] font-mono font-bold text-[#EAF3FF] whitespace-nowrap shadow-lg"
          >
            {projectedCallout.label}
          </div>
        </div>
      )}

      {/* WebGL Error / Context Loss Fallback */}
      {(initError || contextLost) && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#060B14]/95 p-6">
          <div className="max-w-md rounded-xl border border-[#FFB020]/45 bg-[#0E192A] p-5 text-center font-mono">
            <AlertTriangle className="w-8 h-8 text-[#FFB020] mx-auto mb-2" />
            <h3 className="font-hud text-sm font-bold text-[#EAF3FF] uppercase tracking-wider">
              {contextLost ? 'WebGL Context Interrupted' : '3D EMS Viewport Unavailable'}
            </h3>
            <p className="mt-1.5 text-xs font-sans text-[#91A4BD]">
              {initError ||
                'Your browser temporarily paused the 3D GPU context. Switch tabs or reload to restore live EMS hardware rendering.'}
            </p>
          </div>
        </div>
      )}

      {/* Compact Top-Left Synced Physical ECU + Live EMS Telemetry Inspector */}
      <div
        className={`absolute top-2 sm:top-3 left-2 sm:left-3 right-2 sm:right-auto z-10 sm:w-[420px] rounded-lg border p-2 sm:p-2.5 shadow-xl pointer-events-auto transition-colors duration-150 ${hudStyleTokens.panelSurface}`}
      >
        <div
          className={`flex items-center justify-between gap-1.5 ${
            topHudCollapsed ? '' : 'border-b border-[#203653]/90 pb-1.5 mb-1.5'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                twinSyncMode === 'MANUAL_REVIEW'
                  ? 'bg-amber-400'
                  : displayedEmsState.isSupplyTripped
                    ? 'bg-rose-500'
                    : displayedEmsState.isPowerActive
                      ? 'bg-emerald-400'
                      : 'bg-slate-500'
              }`}
              title="Physical ECU Digital Twin Sync Status"
            />
            <Cpu className="w-3.5 h-3.5 text-[#19C8F5] shrink-0" />
            <span className="font-hud text-[11px] font-bold tracking-wider uppercase text-[#EAF3FF] truncate">
              {emsProfile.modelCode} · {emsProfile.powertrainMode === 'DIESEL_CRDI' ? 'CRDi' : '4-Cyl EFI'}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {twinSyncMode === 'MANUAL_REVIEW' && onToggleTwinSyncMode && (
              <button
                type="button"
                onClick={onToggleTwinSyncMode}
                title="Paused in Manual Review — Click to resume Live Data sync"
                className="hw-btn hw-btn-amber px-1.5 py-0.5 rounded-[2px] text-[9px] font-mono font-bold cursor-pointer whitespace-nowrap"
              >
                MANUAL
              </button>
            )}
            <button
              type="button"
              onClick={cycleHudOpacity}
              title={hudStyleTokens.nextTitle}
              aria-label={`Cycle 3D HUD overlay opacity (current ${hudStyleTokens.percentLabel})`}
              className={`hw-btn px-1.5 py-0.5 rounded-[2px] text-[9.5px] font-mono flex items-center gap-1 cursor-pointer ${
                hudOpacityMode !== 'SOLID' ? 'hw-btn-amber font-bold' : 'text-slate-200'
              }`}
            >
              <Eye className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span className="tabular-nums">{hudStyleTokens.percentLabel}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSyncedGauges((prev) => !prev)}
              className={`hw-btn px-1.5 py-0.5 rounded-[2px] text-[9.5px] font-mono flex items-center gap-1 cursor-pointer ${
                showSyncedGauges ? 'hw-btn-amber font-bold' : 'text-slate-300'
              }`}
              title="Toggle Synced Telemetry Gauges"
            >
              <Gauge className="w-3 h-3" />
              <span>Gauges</span>
            </button>
            <button
              type="button"
              onClick={() => setTopHudCollapsed((prev) => !prev)}
              aria-expanded={!topHudCollapsed}
              title={topHudCollapsed ? 'Expand EMS Inspector' : 'Collapse EMS Inspector'}
              aria-label={topHudCollapsed ? 'Expand EMS inspector' : 'Collapse EMS inspector'}
              className="hw-btn p-0.5 rounded-[2px] text-slate-300 hover:text-amber-300 cursor-pointer"
            >
              {topHudCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {!topHudCollapsed && (
          <>
            {/* Live / Frozen Synchronized EMS Telemetry Strip */}
            <div
              className={`grid grid-cols-4 gap-1 rounded-[3px] border px-2 py-1 mb-1.5 font-mono text-[9.5px] ${hudStyleTokens.wellSurface}`}
            >
              <div>
                <div className="text-[8px] text-slate-400 uppercase">KL30 / Load</div>
                <div
                  className={`font-bold tabular-nums ${
                    displayedEmsState.isSupplyTripped
                      ? 'text-rose-400'
                      : displayedEmsState.isPowerActive
                        ? 'text-amber-300'
                        : 'text-slate-500'
                  }`}
                >
                  {displayedEmsState.isSupplyTripped
                    ? 'OCP TRIP'
                    : `${displayedEmsState.batteryVoltageV.toFixed(1)}V · ${displayedEmsState.totalCurrentAmps.toFixed(1)}A`}
                </div>
              </div>
              <div>
                <div className="text-[8px] text-slate-400 uppercase">Relays</div>
                <div className="font-bold text-slate-200 tabular-nums">
                  <span
                    className={
                      displayedEmsState.mainRelay.isLatched ? 'text-emerald-400' : 'text-slate-500'
                    }
                  >
                    MR
                  </span>
                  {' / '}
                  <span
                    className={
                      displayedEmsState.fuelPumpRelay.isLatched ? 'text-cyan-300' : 'text-slate-500'
                    }
                  >
                    FP
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[8px] text-slate-400 uppercase">Fuel Rail</div>
                <div className="font-bold text-cyan-300 tabular-nums">
                  {displayedEmsState.fuelSystem.railPressureBar} bar
                </div>
              </div>
              <div>
                <div className="text-[8px] text-slate-400 uppercase">SGND Δ</div>
                <div
                  className={`font-bold tabular-nums ${
                    displayedEmsState.grounds.hasGroundFault ? 'text-rose-400' : 'text-emerald-300'
                  }`}
                >
                  {displayedEmsState.grounds.groundOffsetMv} mV
                </div>
              </div>
            </div>

            {/* Active Selected / Hovered 3D Node Details */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-mono font-bold text-emerald-300 truncate">
                  {inspectedLabel}
                </div>
                <div className="text-[10px] font-sans text-slate-300 truncate mt-0.5">
                  {activeMeta?.subtitle ||
                    inspectedEcuPin?.description ||
                    `${emsProfile.brandLabel} · ${emsProfile.vehicleModel} (${emsProfile.firingOrder.join('-')})`}
                </div>
                {inspectedOemMapNote && (
                  <div className="text-[9.5px] font-mono text-sky-300 truncate mt-0.5">
                    {inspectedOemMapNote}
                  </div>
                )}
              </div>
              {inspectedVoltage !== null && (
                <div className="text-right shrink-0 font-mono">
                  <div className="text-xs sm:text-sm font-bold text-amber-400 tabular-nums">
                    {inspectedVoltage.toFixed(2)} V
                  </div>
                  <div className="text-[8.5px] text-slate-400 uppercase">
                    {inspectedFuse
                      ? inspectedFuse.isBlown
                        ? 'BLOWN'
                        : `${inspectedFuse.currentAmps.toFixed(1)}A`
                      : 'Live MNA'}
                  </div>
                </div>
              )}
            </div>

            {inspectedFault && inspectedFault.faultType !== 'NONE' && (
              <div className="mt-1.5 rounded-[2px] border border-rose-500/40 bg-rose-950/70 px-2.5 py-1 text-[10px] font-mono text-rose-200 flex items-center justify-between gap-2">
                <span className="truncate font-semibold">
                  FAULT: {inspectedFault.faultType.replace(/_/g, ' ')}
                </span>
                {inspectedDtc && (
                  <span className="text-amber-300 font-bold shrink-0">{inspectedDtc.code}</span>
                )}
              </div>
            )}

            {/* Quick 3D Probe & Diagnostic Actions */}
            {inspectedPinId && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onAttachProbe('red', inspectedPinId, inspectedLabel)}
                  className="hw-btn flex-1 px-2 py-1 rounded-[2px] border-rose-700/80 text-[10px] font-mono font-semibold text-rose-200 transition cursor-pointer whitespace-nowrap"
                >
                  Probe Red (+)
                </button>
                <button
                  type="button"
                  onClick={() => onAttachProbe('black', inspectedPinId, inspectedLabel)}
                  className="hw-btn flex-1 px-2 py-1 rounded-[2px] text-[10px] font-mono font-semibold text-slate-200 transition cursor-pointer whitespace-nowrap"
                >
                  Probe Black (-)
                </button>
                {inspectedDtc && onOpenOfflineBot && (
                  <button
                    type="button"
                    onClick={() => onOpenOfflineBot(`${inspectedDtc.code} ${inspectedLabel}`)}
                    className="hw-btn hw-btn-amber px-2 py-1 rounded-[2px] text-[10px] font-mono flex items-center gap-1 transition cursor-pointer"
                    title="Ask Offline Diagnostic Bot"
                  >
                    <Bot className="w-3 h-3" />
                    <span>Guide</span>
                  </button>
                )}
                {inspectedDtc && onOpenGroundedSearch && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenGroundedSearch(`${inspectedDtc.code} automotive diagnostic`, inspectedDtc.code)
                    }
                    className="hw-btn px-2 py-1 rounded-[2px] text-[10px] font-mono text-slate-200 flex items-center gap-1 transition cursor-pointer"
                    title="Search OEM TSBs"
                  >
                    <Globe className="w-3 h-3 text-emerald-400" />
                  </button>
                )}
              </div>
            )}

            {/* Collapsible Synced Telemetry & 3D Throttle Encoder Row */}
            {showTpsQuickSlider && (
              <div className="mt-2 pt-2 border-t border-[#203653]/90 flex items-center justify-between gap-2">
                {showSyncedGauges && (
                  <MiniRpmDial
                    rpm={syncedTelemetry.rpm}
                    statusLabel={syncedTelemetry.statusLabel}
                    isLive={syncedTelemetry.statusCode === 'LIVE_SIMULATED'}
                    hasCkpFault={syncedTelemetry.statusCode === 'CKP_NO_SIGNAL'}
                    wellClass={hudStyleTokens.wellSurface}
                  />
                )}

                <div className="flex-1 min-w-0">
                  <RotaryEncoderDial
                    label="3D THROTTLE"
                    value={tpsThrottlePct}
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                    accent="amber"
                    size="sm"
                    inlineFlankButtons={{
                      dec: { label: '-5%', delta: -5 },
                      inc: { label: '+5%', delta: 5 },
                    }}
                    onChange={(nextVal) =>
                      onUpdateComponentState('comp-tps', { throttleAnglePercent: nextVal })
                    }
                  />
                </div>

                {showSyncedGauges && (
                  <div
                    className={`flex flex-col justify-between ${hudStyleTokens.wellSurface} border rounded-[2px] px-2 py-1.5 font-mono text-right shrink-0 min-w-[84px] transition-colors`}
                  >
                    <span className="text-[8.5px] uppercase text-slate-400">FIRING 1-3-4-2</span>
                    <div className="text-xs font-bold tabular-nums text-emerald-300">
                      {emsState.cylinders[0]?.injectorDutyPercent ?? 0}% INJ
                    </div>
                    <div className="text-[9.5px] tabular-nums text-amber-300 font-semibold">
                      {emsState.vrefVoltageV.toFixed(2)}V VREF
                    </div>
                    <div className="text-[8.5px] tabular-nums text-slate-300">
                      {emsState.ectTempC}°C ECT
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Unified Collapsible Bottom-Center EMS Control Dock */}
      <div className="absolute bottom-2 sm:bottom-3 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-20 flex flex-col items-center sm:max-w-[min(1040px,96vw)] pointer-events-auto">
        <button
          type="button"
          onClick={() => setDockCollapsed((prev) => !prev)}
          title="Toggle 3D EMS Controls (H)"
          className={`px-3 py-1 rounded-t-[2px] border border-b-0 ${hudStyleTokens.tabSurface} text-[10px] font-mono font-semibold text-amber-300 hover:text-white flex items-center gap-1.5 transition cursor-pointer`}
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3 h-3" />
              <span>Show 3D EMS Controls (H)</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              <span>Hide Controls (H)</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div
            className={`w-full rounded-[3px] border ${hudStyleTokens.panelSurface} px-2 sm:px-3 py-1.5 sm:py-2 shadow-2xl flex flex-col gap-1.5 text-[10px] font-mono max-h-[34vh] overflow-y-auto transition-colors duration-150`}
          >
            {/* Row 1: Camera Presets + Layout Toggle + Ignition Key + Explode + Reset */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
              <div
                className={`flex items-center gap-1 ${hudStyleTokens.wellSurface} p-1 rounded-[2px] border overflow-x-auto scrollbar-none max-w-full`}
              >
                <Crosshair className="w-3.5 h-3.5 text-amber-400 mx-1 shrink-0" />
                {(
                  [
                    ['OVERVIEW', 'Overview'],
                    ['ECU_EXPLODED', 'ECU Exploded'],
                    ['POWER_RELAYS', 'Power & Relays'],
                    ['FUEL_IGNITION', 'Fuel & Ignition'],
                    ['ENGINE_BAY', 'Engine Bay'],
                  ] as [CameraPresetKey, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handlePresetClick(key)}
                    className={`hw-btn px-2 py-1 rounded-[2px] text-[10px] transition whitespace-nowrap shrink-0 cursor-pointer ${
                      activePreset === key
                        ? 'hw-btn-amber font-bold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Bench Assembly vs +4-Cyl Engine Block Toggle */}
              <button
                type="button"
                onClick={handleToggleEngineBlock}
                className={`hw-btn px-2.5 py-1.5 rounded-[2px] text-[10px] flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                  showEngineBlock ? 'hw-btn-green font-bold' : 'text-slate-200 hover:text-white'
                }`}
                title="Toggle 4-Cylinder DOHC Engine Block Bay alongside Bench Assembly"
              >
                <Box className="w-3.5 h-3.5" />
                <span>{showEngineBlock ? '4-Cyl Block: ON' : '+ 4-Cyl Block'}</span>
              </button>

              {/* Direct Ignition Switch (KL15 / PSU) Quick Sync */}
              {onToggleIgnition && (
                <button
                  type="button"
                  onClick={onToggleIgnition}
                  className={`hw-btn px-2.5 py-1.5 rounded-[2px] text-[10px] flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                    emsState.isPowerActive
                      ? 'hw-btn-amber font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="Toggle Bench Power & KL15 Ignition Key Switch"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{emsState.isPowerActive ? 'IGN ON' : 'IGN OFF'}</span>
                </button>
              )}

              {/* Explode ECU Housing Rotary Control */}
              <div
                className={`flex items-center gap-1.5 ${hudStyleTokens.wellSurface} px-2 py-0.5 rounded-[2px] border`}
              >
                <Layers className="w-3 h-3 text-amber-400 shrink-0" />
                <RotaryEncoderDial
                  label="EXPLODE"
                  value={Math.round(explodeAmount * 100)}
                  min={0}
                  max={100}
                  step={5}
                  unit="%"
                  accent="amber"
                  size="sm"
                  inlineFlankButtons={{
                    dec: { label: '-10%', delta: -10 },
                    inc: { label: '+10%', delta: 10 },
                  }}
                  onChange={(nextVal) => setExplodeAmount(nextVal / 100)}
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setExplodeAmount(0);
                  setCircuitLayerFilter('ALL');
                  setOverlayMode('WIRE_ID');
                  handlePresetClick(showEngineBlock ? 'ENGINE_BAY' : 'OVERVIEW');
                }}
                className="hw-btn px-2 py-1.5 rounded-[2px] text-[10px] text-slate-200 flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                title="Reset 3D Camera, Filters & ECU Lid"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>

            {/* Row 2: Dedicated Circuit Layer Isolation Filter + Wire/Voltage/Thermal Overlay */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
              <div
                className={`flex items-center gap-1 ${hudStyleTokens.wellSurface} p-1 rounded-[2px] border overflow-x-auto scrollbar-none max-w-full`}
              >
                <Filter className="w-3 h-3 text-sky-400 mx-1 shrink-0" />
                {CIRCUIT_LAYER_OPTIONS.map(([layerKey, label]) => (
                  <button
                    key={layerKey}
                    type="button"
                    onClick={() => setCircuitLayerFilter(layerKey)}
                    className={`hw-btn px-2 py-0.5 rounded-[2px] text-[9.5px] transition whitespace-nowrap shrink-0 cursor-pointer ${
                      circuitLayerFilter === layerKey
                        ? 'hw-btn-amber font-bold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div
                className={`flex items-center gap-1 ${hudStyleTokens.wellSurface} p-1 rounded-[2px] border`}
              >
                <button
                  type="button"
                  onClick={() => setOverlayMode('WIRE_ID')}
                  className={`hw-btn px-2 py-0.5 rounded-[2px] text-[9.5px] flex items-center gap-1 transition whitespace-nowrap cursor-pointer ${
                    overlayMode === 'WIRE_ID'
                      ? 'hw-btn-amber font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Sliders className="w-3 h-3" />
                  <span>Wire Color</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOverlayMode('VOLTAGE')}
                  className={`hw-btn px-2 py-0.5 rounded-[2px] text-[9.5px] flex items-center gap-1 transition whitespace-nowrap cursor-pointer ${
                    overlayMode === 'VOLTAGE'
                      ? 'hw-btn-green font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Zap className="w-3 h-3" />
                  <span>Voltage</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOverlayMode('THERMAL')}
                  className={`hw-btn px-2 py-0.5 rounded-[2px] text-[9.5px] flex items-center gap-1 transition whitespace-nowrap cursor-pointer ${
                    overlayMode === 'THERMAL'
                      ? 'bg-rose-950/90 border-rose-500 text-rose-200 font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Flame className="w-3 h-3" />
                  <span>Thermal</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ThreeBenchTwin = React.memo(ThreeBenchTwinComponent);
