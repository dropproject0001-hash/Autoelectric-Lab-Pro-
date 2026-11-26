/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Box,
  ChevronDown,
  ChevronUp,
  Cpu,
  Crosshair,
  Filter,
  Flame,
  Grid3X3,
  Headphones,
  Layers,
  Maximize2,
  Power,
  RotateCcw,
  Sliders,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import type {
  BenchComponent,
  DiagnosticTroubleCode,
  EcuPin,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import type {
  RpmEmulatorState,
  SelectedVehicleContext,
} from '../utils/vehicleEcuRegistry';
import type { GaugeMonitorState } from '../simulation/telemetry/telemetryTypes';
import type { EmsCircuitLayer } from '../simulation/telemetry/emsDigitalTwinSync';
import {
  BenchOverlayMode,
  BenchSceneManager,
  CameraPresetKey,
  ProjectedCallout,
} from './three/BenchSceneManager';
import type { PickTargetMeta } from './three/ecuHardwareModels';
import {
  EngineBlockZoneStatus,
  useEmsTelemetrySync,
} from '../hooks/useEmsTelemetrySync';
import {
  formatStandardConnectionTag,
  type BenchVoiceSimulationAction,
} from '../simulation/telemetry/efiHarnessStandard';
import { EmsAudioSynthesizer } from '../utils/emsAudioSynthesizer';

export interface ThreeDViewportProps {
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
  compact?: boolean;
  defaultShowEngineBlock?: boolean;
  onToggleTwinSyncMode?: () => void;
  onSelectPin: (pinId: string | null) => void;
  onAttachProbe: (color: 'red' | 'black', pinId: string, label: string) => void;
  onToggleIgnition?: () => void;
  onExpandFullView?: () => void;
  onOpenVoiceGuide?: () => void;
  voiceActionRequest?: { action: BenchVoiceSimulationAction; nonce: number } | null;
}

const CIRCUIT_LAYER_OPTIONS: [EmsCircuitLayer, string][] = [
  ['ALL', 'All'],
  ['POWER_FUSES', 'Power'],
  ['RELAYS', 'Relays'],
  ['INJ_COILS', 'Inj/Coils'],
  ['FUEL_SYSTEM', 'Fuel'],
  ['GROUNDS', 'Grounds'],
];

const CAMERA_PRESET_OPTIONS: [CameraPresetKey, string][] = [
  ['OVERVIEW', 'Overview'],
  ['ECU_EXPLODED', 'ECU'],
  ['POWER_RELAYS', 'Power'],
  ['FUEL_IGNITION', 'Fuel/Ign'],
  ['ENGINE_BAY', 'Engine Bay'],
];

function getCylinderChipTone(
  injStatus: EngineBlockZoneStatus,
  coilStatus: EngineBlockZoneStatus,
  isFiring: boolean
): string {
  if (injStatus === 'SHORT' || coilStatus === 'SHORT' || injStatus === 'FAULT' || coilStatus === 'FAULT') {
    return 'border-rose-500/80 bg-rose-950/90 text-rose-200';
  }
  if (injStatus === 'OPEN' || coilStatus === 'OPEN' || injStatus === 'HIGH_R' || coilStatus === 'HIGH_R') {
    return 'border-amber-500/80 bg-amber-950/90 text-amber-200';
  }
  if (isFiring) {
    return 'border-emerald-500/60 bg-emerald-950/75 text-emerald-200';
  }
  return 'border-[#203653] bg-[#07101d] text-slate-300';
}

const ThreeDViewportComponent: React.FC<ThreeDViewportProps> = ({
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
  rpmEmulator,
  gaugeMonitor,
  vehicleContext = null,
  selectedEcuProfileId = null,
  twinSyncMode = 'LIVE_DATA',
  compact = false,
  defaultShowEngineBlock = false,
  onToggleTwinSyncMode,
  onSelectPin,
  onAttachProbe,
  onToggleIgnition,
  onExpandFullView,
  onOpenVoiceGuide,
  voiceActionRequest = null,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<BenchSceneManager | null>(null);
  const audioSynthRef = useRef<EmsAudioSynthesizer | null>(null);
  const lastVoiceNonceRef = useRef<number>(0);

  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [hudCollapsed, setHudCollapsed] = useState(compact);
  const [showCompactFilters, setShowCompactFilters] = useState(false);
  const [showEngineBlock, setShowEngineBlock] = useState(defaultShowEngineBlock);
  const [showFaultWireOverlay, setShowFaultWireOverlay] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [circuitLayerFilter, setCircuitLayerFilter] = useState<EmsCircuitLayer>('ALL');
  const [activePreset, setActivePreset] = useState<CameraPresetKey>(
    defaultShowEngineBlock ? 'ENGINE_BAY' : 'OVERVIEW'
  );
  const [overlayMode, setOverlayMode] = useState<BenchOverlayMode>('WIRE_ID');
  const [explodeAmount, setExplodeAmount] = useState(0);
  const [hoveredMeta, setHoveredMeta] = useState<PickTargetMeta | null>(null);
  const [selectedMeta, setSelectedMeta] = useState<PickTargetMeta | null>(null);
  const [projectedCallout, setProjectedCallout] = useState<ProjectedCallout | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Keep Split 2D+3D viewport maximally unobstructed when entering compact mode
  useEffect(() => {
    setHudCollapsed(compact);
    if (compact) {
      setShowCompactFilters(false);
    }
  }, [compact]);

  const onSelectPinRef = useRef(onSelectPin);
  onSelectPinRef.current = onSelectPin;
  const onToggleIgnitionRef = useRef(onToggleIgnition);
  onToggleIgnitionRef.current = onToggleIgnition;

  const {
    emsProfile,
    displayedEmsState,
    sensorSignals,
    firingOrder,
    engineBlockFaultOverlay,
    telemetrySnapshot,
    displayedNodeVoltages,
    isManualReview,
  } = useEmsTelemetrySync({
    pins,
    wires,
    components,
    faults,
    activeDTCs,
    nodeVoltages,
    wireCurrentsMa,
    supplyCurrentDrawAmps,
    isSupplyCurrentTripped,
    multimeter,
    powerSupply,
    selectedPinId,
    simulationSpeed,
    overlayMode,
    explodeAmount,
    showEngineBlock,
    showFaultWireOverlay,
    circuitLayerFilter,
    rpmEmulator,
    gaugeMonitor,
    vehicleContext,
    selectedEcuProfileId,
    twinSyncMode,
  });

  const initialTelemetryRef = useRef(telemetrySnapshot);
  initialTelemetryRef.current = telemetrySnapshot;

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
        err instanceof Error ? err.message : 'WebGL2 3D EMS viewport failed to initialize.'
      );
    }

    return () => {
      mgr?.dispose();
      managerRef.current = null;
    };
  }, []);

  // Push synchronized MNA telemetry & 3D fault wire-mesh updates into Three.js without remounting
  useEffect(() => {
    managerRef.current?.updateTelemetry(telemetrySnapshot);
  }, [telemetrySnapshot]);

  // Procedural Web Audio EMS Acoustic Engine (engine rumble, injectors, sparks, pump, relays, arcs)
  useEffect(() => {
    return () => {
      audioSynthRef.current?.dispose();
      audioSynthRef.current = null;
    };
  }, []);

  useEffect(() => {
    audioSynthRef.current?.update(displayedEmsState);
  }, [displayedEmsState]);

  const handleToggleAudio = useCallback(() => {
    setAudioEnabled((prev) => {
      const next = !prev;
      if (!audioSynthRef.current) {
        audioSynthRef.current = new EmsAudioSynthesizer();
      }
      audioSynthRef.current.setEnabled(next);
      audioSynthRef.current.update(displayedEmsState);
      return next;
    });
  }, [displayedEmsState]);

  // Respond directly to hands-free voice simulation commands
  useEffect(() => {
    if (!voiceActionRequest || voiceActionRequest.nonce === lastVoiceNonceRef.current) {
      return;
    }
    lastVoiceNonceRef.current = voiceActionRequest.nonce;
    const { action } = voiceActionRequest;
    switch (action.type) {
      case 'SHOW_ENGINE_BLOCK':
        setShowEngineBlock(action.enabled);
        setActivePreset(action.enabled ? 'ENGINE_BAY' : 'OVERVIEW');
        managerRef.current?.flyToPreset(action.enabled ? 'ENGINE_BAY' : 'OVERVIEW');
        break;
      case 'TOGGLE_FAULT_MESH':
        setShowFaultWireOverlay(action.enabled);
        if (action.enabled) {
          setShowEngineBlock(true);
          setActivePreset('ENGINE_BAY');
          managerRef.current?.flyToPreset('ENGINE_BAY');
        }
        break;
      case 'SET_CAMERA_PRESET':
        setActivePreset(action.preset);
        if (action.preset === 'ENGINE_BAY') setShowEngineBlock(true);
        managerRef.current?.flyToPreset(action.preset);
        break;
      case 'SET_EXPLODE':
        setExplodeAmount(action.exploded ? 0.85 : 0);
        setActivePreset(action.exploded ? 'ECU_EXPLODED' : 'OVERVIEW');
        managerRef.current?.flyToPreset(action.exploded ? 'ECU_EXPLODED' : 'OVERVIEW');
        break;
      case 'SET_AUDIO':
        if (!audioSynthRef.current) {
          audioSynthRef.current = new EmsAudioSynthesizer();
        }
        audioSynthRef.current.setEnabled(action.enabled);
        audioSynthRef.current.update(displayedEmsState);
        setAudioEnabled(action.enabled);
        break;
      case 'SET_CIRCUIT_LAYER':
        setCircuitLayerFilter(action.layer);
        break;
      case 'START_GUIDED_TOUR':
        setShowEngineBlock(true);
        setShowFaultWireOverlay(true);
        setCircuitLayerFilter('ALL');
        setOverlayMode('WIRE_ID');
        setActivePreset('ENGINE_BAY');
        managerRef.current?.flyToPreset('ENGINE_BAY');
        break;
      default:
        break;
    }
  }, [voiceActionRequest, displayedEmsState]);

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

  const handleToggleFaultMesh = useCallback(() => {
    setShowFaultWireOverlay((prev) => {
      const next = !prev;
      if (next && !showEngineBlock) {
        setShowEngineBlock(true);
        setActivePreset('ENGINE_BAY');
      }
      return next;
    });
  }, [showEngineBlock]);

  const activeMeta = hoveredMeta ?? selectedMeta;
  const inspectedPinId = activeMeta?.pinId ?? selectedPinId;
  const inspectedLabel = useMemo(() => {
    if (activeMeta) return activeMeta.label;
    const matchPin = pins.find((p) => p.id === inspectedPinId);
    if (matchPin) return `Pin ${matchPin.pinNumber}: ${matchPin.label}`;
    return 'Click any 3D Pin, Fuse, Relay, Coil or Engine Zone';
  }, [activeMeta, pins, inspectedPinId]);

  const inspectedStandardTag = useMemo(() => {
    if (!inspectedPinId) return null;
    return formatStandardConnectionTag(inspectedPinId, pins, emsProfile).formattedTag;
  }, [inspectedPinId, pins, emsProfile]);

  const inspectedVoltage =
    inspectedPinId && displayedNodeVoltages[inspectedPinId] !== undefined
      ? displayedNodeVoltages[inspectedPinId]
      : null;

  // Suppress leader callout when it would collide with the top-left HUD or bottom dock
  const containerH = mountRef.current?.clientHeight ?? 600;
  const hudClearX = hudCollapsed ? 350 : compact ? 375 : 425;
  const hudClearY = hudCollapsed
    ? engineBlockFaultOverlay.hasActiveFault
      ? 88
      : 54
    : engineBlockFaultOverlay.hasActiveFault
      ? 235
      : 200;
  const dockClearY = Math.max(120, containerH - (dockCollapsed ? 42 : compact ? 74 : 112));
  const calloutInHudZone =
    Boolean(projectedCallout) &&
    projectedCallout!.x < hudClearX &&
    projectedCallout!.y < hudClearY + 48;
  const showCalloutLeader =
    Boolean(projectedCallout?.visible) &&
    !calloutInHudZone &&
    projectedCallout!.x > 40 &&
    projectedCallout!.y > 76 &&
    projectedCallout!.y < dockClearY;

  return (
    <div
      data-testid="three-d-viewport"
      data-engine-block={showEngineBlock ? 'on' : 'off'}
      data-fault-mesh={showFaultWireOverlay ? 'on' : 'off'}
      data-fault-severity={engineBlockFaultOverlay.overallSeverity}
      data-sync-mode={twinSyncMode}
      className="relative flex-1 min-h-[240px] w-full h-full rounded-[3px] overflow-hidden border border-[#2f3745] bg-[#0b111b]"
    >
      {/* Isolated WebGL Canvas Mount pinned to 100% viewport bounds */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Projected 3D Pin Callout Leader */}
      {showCalloutLeader && projectedCallout && (
        <div className="absolute inset-0 pointer-events-none z-[5] overflow-hidden">
          <svg className="w-full h-full">
            <polyline
              points={`${projectedCallout.x},${projectedCallout.y} ${projectedCallout.x},${Math.max(60, projectedCallout.y - 34)} ${projectedCallout.x + 22},${Math.max(60, projectedCallout.y - 34)}`}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.25"
              strokeDasharray="2,2"
            />
            <circle cx={projectedCallout.x} cy={projectedCallout.y} r="3" fill="#f59e0b" />
          </svg>
          <div
            style={{
              left: `${projectedCallout.x + 24}px`,
              top: `${Math.max(48, projectedCallout.y - 45)}px`,
            }}
            className="absolute bg-[#0C1524] border border-[#19C8F5]/60 rounded px-1.5 py-0.5 text-[9.5px] font-mono font-bold text-[#EAF3FF] whitespace-nowrap shadow-lg"
          >
            {projectedCallout.label}
          </div>
        </div>
      )}

      {/* WebGL Error / Context Loss Fallback */}
      {(initError || contextLost) && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#060B14]/95 p-4">
          <div className="max-w-sm rounded-lg border border-[#FFB020]/50 bg-[#0E192A] p-4 text-center font-mono">
            <AlertTriangle className="w-7 h-7 text-[#FFB020] mx-auto mb-2" />
            <h3 className="font-hud text-xs font-bold text-[#EAF3FF] uppercase tracking-wider">
              {contextLost ? 'WebGL Context Interrupted' : '3D EMS Viewport Unavailable'}
            </h3>
            <p className="mt-1.5 text-[11px] font-sans text-[#91A4BD]">
              {initError || 'GPU context paused. Switch view or reload to restore 3D rendering.'}
            </p>
          </div>
        </div>
      )}

      {/* Compact Top-Left Synchronized EMS Telemetry & Engine Block Fault Wire-Mesh HUD */}
      <div
        className={`absolute top-2 left-2 z-10 max-w-[calc(100%-1rem)] ${
          hudCollapsed
            ? 'w-auto'
            : compact
              ? 'sm:w-[350px]'
              : 'sm:w-[395px]'
        } rounded-md border border-[#203653] bg-[#0C1524]/92 px-2 py-1.5 shadow-xl pointer-events-auto`}
      >
        <div
          className={`flex items-center justify-between gap-2 ${
            hudCollapsed ? '' : 'border-b border-[#203653]/85 pb-1.5 mb-1.5'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                isManualReview
                  ? 'bg-amber-400'
                  : engineBlockFaultOverlay.overallSeverity === 'CRITICAL'
                    ? 'bg-rose-500'
                    : displayedEmsState.isPowerActive
                      ? 'bg-emerald-400'
                      : 'bg-slate-500'
              }`}
              aria-hidden="true"
            />
            <Cpu className="w-3.5 h-3.5 text-[#19C8F5] shrink-0" aria-hidden="true" />
            <span className="font-hud text-[10px] font-bold tracking-wider uppercase text-[#EAF3FF] truncate">
              {emsProfile.modelCode}
              {!hudCollapsed &&
                ` · ${emsProfile.powertrainMode === 'DIESEL_CRDI' ? 'CRDi' : '4-Cyl EFI'}`}
            </span>
            {hudCollapsed && (
              <span className="hidden sm:inline font-mono text-[9.5px] text-slate-300 tabular-nums whitespace-nowrap">
                · 1-3-4-2 ·{' '}
                <strong className={firingOrder.isFiring ? 'text-emerald-300' : 'text-slate-400'}>
                  {firingOrder.rpm} RPM
                </strong>{' '}
                ·{' '}
                <strong className="text-amber-300">
                  {displayedEmsState.batteryVoltageV.toFixed(1)}V
                </strong>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isManualReview && onToggleTwinSyncMode && (
              <button
                type="button"
                onClick={onToggleTwinSyncMode}
                title="Paused in Manual Review — Click to resume Live Data sync"
                className="hw-btn hw-btn-amber px-1.5 py-0.5 rounded-[2px] text-[9px] font-mono font-bold cursor-pointer"
              >
                MANUAL
              </button>
            )}
            {onExpandFullView && (
              <button
                type="button"
                onClick={onExpandFullView}
                title="Open full-screen 3D ECU Twin tab"
                aria-label="Open full-screen 3D ECU Twin tab"
                className="hw-btn p-1 rounded-[2px] text-slate-300 hover:text-amber-300 cursor-pointer"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setHudCollapsed((prev) => !prev)}
              aria-expanded={!hudCollapsed}
              aria-label={hudCollapsed ? 'Expand EMS telemetry HUD' : 'Collapse EMS telemetry HUD'}
              className="hw-btn p-0.5 rounded-[2px] text-slate-300 hover:text-amber-300 cursor-pointer"
            >
              {hudCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Always surface live MNA engine-block fault alerts even when HUD details are collapsed */}
        {hudCollapsed && engineBlockFaultOverlay.hasActiveFault && (
          <div
            data-testid="engine-fault-overlay-banner"
            className={`mt-1.5 rounded-[2px] border px-2 py-0.5 text-[9.5px] font-mono flex items-center justify-between gap-2 ${
              engineBlockFaultOverlay.overallSeverity === 'CRITICAL'
                ? 'border-rose-500/70 bg-rose-950/85 text-rose-100'
                : 'border-amber-500/70 bg-amber-950/85 text-amber-100'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span className="truncate font-bold">
                {engineBlockFaultOverlay.activeFaultLabels.slice(0, 2).join(' · ')}
              </span>
            </div>
            {!showEngineBlock && (
              <button
                type="button"
                onClick={() => {
                  setShowEngineBlock(true);
                  setShowFaultWireOverlay(true);
                  setActivePreset('ENGINE_BAY');
                }}
                className="hw-btn hw-btn-amber px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold whitespace-nowrap cursor-pointer shrink-0"
              >
                View Mesh
              </button>
            )}
          </div>
        )}

        {!hudCollapsed && (
          <div className="space-y-1.5 font-mono">
            {/* Live Firing Order (1-3-4-2) + RPM & Sensor Signal Telemetry Strip */}
            <div className="flex items-center justify-between gap-1.5 rounded-[2px] border border-[#203653] bg-[#060d18] px-2 py-1 text-[9.5px]">
              <div className="flex items-center gap-1">
                <span className="text-[8.5px] uppercase text-slate-400 mr-0.5">Order</span>
                {firingOrder.sequence.map((cylNum) => {
                  const cyl = firingOrder.cylinders.find((c) => c.cylinder === cylNum);
                  const tone = getCylinderChipTone(
                    cyl?.injectorStatus ?? 'OK',
                    cyl?.coilStatus ?? 'OK',
                    firingOrder.isFiring
                  );
                  return (
                    <span
                      key={cylNum}
                      title={`Cylinder ${cylNum}: INJ ${cyl?.injectorStatus ?? 'OK'} · COIL ${cyl?.coilStatus ?? 'OK'}`}
                      className={`inline-flex items-center justify-center w-4 h-4 rounded-[2px] border text-[9px] font-bold tabular-nums ${tone}`}
                    >
                      {cylNum}
                    </span>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 tabular-nums">
                <span className={firingOrder.isFiring ? 'text-emerald-300 font-bold' : 'text-slate-400'}>
                  {firingOrder.rpm} RPM
                </span>
                <span className="text-amber-300 font-bold">
                  {displayedEmsState.batteryVoltageV.toFixed(1)}V
                </span>
              </div>
            </div>

            {/* Synchronized Sensor Signal Bus Readout */}
            <div className="grid grid-cols-4 gap-1 rounded-[2px] border border-[#203653] bg-[#060d18] px-2 py-1 text-[9px] tabular-nums">
              <div>
                <div className="text-[8px] text-slate-400 uppercase">TPS</div>
                <div className="text-sky-300 font-bold">{sensorSignals.tpsVoltageV.toFixed(2)}V</div>
              </div>
              <div>
                <div className="text-[8px] text-slate-400 uppercase">MAP</div>
                <div className="text-sky-300 font-bold">{sensorSignals.mapVoltageV.toFixed(2)}V</div>
              </div>
              <div>
                <div className="text-[8px] text-slate-400 uppercase">VREF</div>
                <div className="text-emerald-300 font-bold">{sensorSignals.vrefVoltageV.toFixed(2)}V</div>
              </div>
              <div>
                <div className="text-[8px] text-slate-400 uppercase">SGND Δ</div>
                <div
                  className={
                    displayedEmsState.grounds.hasGroundFault
                      ? 'text-rose-400 font-bold'
                      : 'text-emerald-300 font-bold'
                  }
                >
                  {displayedEmsState.grounds.groundOffsetMv}mV
                </div>
              </div>
            </div>

            {/* Live 3D Engine Block Wire-Mesh Fault Alert Banner */}
            {engineBlockFaultOverlay.hasActiveFault && (
              <div
                data-testid="engine-fault-overlay-banner"
                className={`rounded-[2px] border px-2 py-1 text-[9.5px] flex items-center justify-between gap-2 ${
                  engineBlockFaultOverlay.overallSeverity === 'CRITICAL'
                    ? 'border-rose-500/70 bg-rose-950/85 text-rose-100'
                    : 'border-amber-500/70 bg-amber-950/85 text-amber-100'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate font-bold">
                    {engineBlockFaultOverlay.activeFaultLabels.slice(0, 2).join(' · ')}
                  </span>
                </div>
                {!showEngineBlock && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowEngineBlock(true);
                      setShowFaultWireOverlay(true);
                      setActivePreset('ENGINE_BAY');
                    }}
                    className="hw-btn hw-btn-amber px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold whitespace-nowrap cursor-pointer shrink-0"
                  >
                    View Mesh
                  </button>
                )}
              </div>
            )}

            {/* Selected / Hovered 3D Node Inspection + Standardized CHK-02 Tag */}
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="text-emerald-300 font-bold truncate" title={inspectedStandardTag ?? inspectedLabel}>
                {inspectedStandardTag ?? inspectedLabel}
              </span>
              {inspectedVoltage !== null && (
                <span className="text-amber-300 font-bold tabular-nums shrink-0">
                  {inspectedVoltage.toFixed(2)} V
                </span>
              )}
            </div>

            {inspectedPinId && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onAttachProbe('red', inspectedPinId, inspectedLabel)}
                  className="hw-btn flex-1 px-2 py-0.5 rounded-[2px] border-rose-700/80 text-[9.5px] font-semibold text-rose-200 cursor-pointer whitespace-nowrap"
                >
                  Probe Red (+)
                </button>
                <button
                  type="button"
                  onClick={() => onAttachProbe('black', inspectedPinId, inspectedLabel)}
                  className="hw-btn flex-1 px-2 py-0.5 rounded-[2px] text-[9.5px] font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
                >
                  Probe Black (-)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unified Collapsible Bottom-Center 3D EMS Control Dock (1-row in compact Split, max 2-row in full 3D) */}
      <div className="absolute bottom-1.5 left-1.5 right-1.5 z-20 flex flex-col items-center pointer-events-none">
        <button
          type="button"
          onClick={() => setDockCollapsed((prev) => !prev)}
          aria-expanded={!dockCollapsed}
          className="pointer-events-auto px-2 py-0.5 rounded-t-[2px] border border-b-0 border-[#203653] bg-[#0C1524]/92 text-[9px] font-mono font-semibold text-amber-300 hover:text-white flex items-center gap-1 cursor-pointer"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-2.5 h-2.5" />
              <span>3D Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-2.5 h-2.5" />
              <span>Hide</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto max-w-full rounded-[3px] border border-[#203653] bg-[#0C1524]/94 px-1.5 py-1 shadow-2xl flex flex-col gap-1 text-[9.5px] font-mono">
            {/* Row 1: Responsive compact strip for camera + 4-Cyl Block + Fault Mesh + Explode + IGN + SFX + Voice + Reset */}
            <div className="flex flex-wrap items-center justify-center gap-1 max-w-full">
              <div className="flex items-center gap-0.5 bg-[#060d18] p-0.5 rounded-[2px] border border-[#203653] shrink-0">
                <Crosshair className="w-3 h-3 text-amber-400 mx-0.5 shrink-0" aria-hidden="true" />
                {(compact
                  ? CAMERA_PRESET_OPTIONS.filter(([k]) => k === 'OVERVIEW' || k === 'ENGINE_BAY' || k === 'FUEL_IGNITION')
                  : CAMERA_PRESET_OPTIONS
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handlePresetClick(key)}
                    className={`hw-btn px-1.5 py-0.5 rounded-[2px] text-[9px] whitespace-nowrap shrink-0 cursor-pointer ${
                      activePreset === key ? 'hw-btn-amber font-bold' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {compact && key === 'ENGINE_BAY' ? 'Engine' : label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleToggleEngineBlock}
                aria-pressed={showEngineBlock}
                className={`hw-btn px-1.5 py-0.5 rounded-[2px] text-[9px] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                  showEngineBlock ? 'hw-btn-green font-bold' : 'text-slate-200 hover:text-white'
                }`}
                title="Toggle 4-Cylinder DOHC Engine Block alongside Bench Assembly"
              >
                <Box className="w-3 h-3 shrink-0" />
                <span>
                  {compact
                    ? showEngineBlock
                      ? '4-Cyl ON'
                      : '4-Cyl'
                    : showEngineBlock
                      ? '4-Cyl Block: ON'
                      : '+ 4-Cyl Block'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleToggleFaultMesh}
                aria-pressed={showFaultWireOverlay}
                className={`hw-btn px-1.5 py-0.5 rounded-[2px] text-[9px] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                  showFaultWireOverlay && showEngineBlock
                    ? engineBlockFaultOverlay.hasActiveFault
                      ? 'border-rose-500 bg-rose-950/90 text-rose-200 font-bold'
                      : 'hw-btn-amber font-bold'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Toggle 3D Engine Block Wire-Mesh Electrical Fault Overlay"
              >
                <Grid3X3 className="w-3 h-3 shrink-0" />
                <span>
                  {compact
                    ? showFaultWireOverlay && showEngineBlock
                      ? 'Mesh ON'
                      : 'Mesh'
                    : showFaultWireOverlay && showEngineBlock
                      ? 'Fault Mesh: ON'
                      : 'Fault Mesh'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setExplodeAmount((prev) => (prev > 0.2 ? 0 : 0.85))}
                aria-pressed={explodeAmount > 0.2}
                className={`hw-btn px-1.5 py-0.5 rounded-[2px] text-[9px] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                  explodeAmount > 0.2 ? 'hw-btn-amber font-bold' : 'text-slate-300 hover:text-white'
                }`}
                title="Toggle ECU Exploded Housing View"
              >
                <Layers className="w-3 h-3 shrink-0" />
                <span>Explode</span>
              </button>

              {onToggleIgnition && (
                <button
                  type="button"
                  onClick={onToggleIgnition}
                  className={`hw-btn px-1.5 py-0.5 rounded-[2px] text-[9px] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                    displayedEmsState.isPowerActive
                      ? 'hw-btn-amber font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="Toggle Bench Power & KL15 Ignition Key Switch"
                >
                  <Power className="w-3 h-3 shrink-0" />
                  <span>{displayedEmsState.isPowerActive ? 'IGN ON' : 'IGN OFF'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleToggleAudio}
                aria-pressed={audioEnabled}
                data-testid="ems-audio-fx-toggle"
                className={`hw-btn px-1.5 py-0.5 rounded-[2px] text-[9px] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                  audioEnabled ? 'hw-btn-green font-bold' : 'text-slate-300 hover:text-white'
                }`}
                title="Toggle Realistic EMS Sound FX (Combustion, Injectors, Sparks, Fuel Pump, Relays)"
              >
                {audioEnabled ? <Volume2 className="w-3 h-3 shrink-0" /> : <VolumeX className="w-3 h-3 shrink-0" />}
                <span>{audioEnabled ? 'SFX ON' : 'SFX'}</span>
              </button>

              {onOpenVoiceGuide && (
                <button
                  type="button"
                  onClick={onOpenVoiceGuide}
                  data-testid="ems-voice-guide-trigger"
                  className="hw-btn px-1.5 py-0.5 rounded-[2px] text-[9px] text-cyan-200 border-cyan-600/60 hover:text-white flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                  title="Open Hands-Free AI Voice Guide (Ask any question or control 3D EMS by voice)"
                >
                  <Headphones className="w-3 h-3 shrink-0 text-cyan-300" />
                  <span>{compact ? 'Voice' : 'Voice AI'}</span>
                </button>
              )}

              {compact && (
                <button
                  type="button"
                  onClick={() => setShowCompactFilters((prev) => !prev)}
                  aria-pressed={showCompactFilters}
                  title="Toggle circuit layer and thermal/voltage overlay filters"
                  className={`hw-btn px-1.5 py-0.5 rounded-[2px] text-[9px] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                    showCompactFilters ? 'hw-btn-blue font-bold' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Filter className="w-2.5 h-2.5 shrink-0" />
                  <span>Layers</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setExplodeAmount(0);
                  setCircuitLayerFilter('ALL');
                  setOverlayMode('WIRE_ID');
                  handlePresetClick(showEngineBlock ? 'ENGINE_BAY' : 'OVERVIEW');
                }}
                aria-label="Reset 3D viewport camera and filters"
                title="Reset 3D Camera & Filters"
                className="hw-btn px-1.5 py-0.5 rounded-[2px] text-[9px] text-slate-200 flex items-center cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            {/* Row 2: Circuit Layer Filter + Wire/Voltage/Thermal Overlay (expanded in full 3D or on demand in Split) */}
            {(!compact || showCompactFilters) && (
              <div className="flex flex-nowrap items-center justify-center gap-1 overflow-x-auto scrollbar-none max-w-full">
                <div className="flex items-center gap-0.5 bg-[#060d18] p-0.5 rounded-[2px] border border-[#203653] shrink-0">
                  <Filter className="w-3 h-3 text-sky-400 mx-0.5 shrink-0" aria-hidden="true" />
                  {CIRCUIT_LAYER_OPTIONS.map(([layerKey, label]) => (
                    <button
                      key={layerKey}
                      type="button"
                      onClick={() => setCircuitLayerFilter(layerKey)}
                      className={`hw-btn px-1.5 py-0.5 rounded-[2px] text-[9px] whitespace-nowrap shrink-0 cursor-pointer ${
                        circuitLayerFilter === layerKey
                          ? 'hw-btn-amber font-bold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-0.5 bg-[#060d18] p-0.5 rounded-[2px] border border-[#203653] shrink-0">
                  <button
                    type="button"
                    onClick={() => setOverlayMode('WIRE_ID')}
                    className={`hw-btn px-1.5 py-0.5 rounded-[2px] text-[9px] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                      overlayMode === 'WIRE_ID' ? 'hw-btn-amber font-bold' : 'text-slate-300'
                    }`}
                  >
                    <Sliders className="w-2.5 h-2.5" />
                    <span>Wire</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverlayMode('VOLTAGE')}
                    className={`hw-btn px-1.5 py-0.5 rounded-[2px] text-[9px] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                      overlayMode === 'VOLTAGE' ? 'hw-btn-green font-bold' : 'text-slate-300'
                    }`}
                  >
                    <Zap className="w-2.5 h-2.5" />
                    <span>Volts</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverlayMode('THERMAL')}
                    className={`hw-btn px-1.5 py-0.5 rounded-[2px] text-[9px] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                      overlayMode === 'THERMAL'
                        ? 'bg-rose-950/90 border-rose-500 text-rose-200 font-bold'
                        : 'text-slate-300'
                    }`}
                  >
                    <Flame className="w-2.5 h-2.5" />
                    <span>Thermal</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const ThreeDViewport = React.memo(ThreeDViewportComponent);
