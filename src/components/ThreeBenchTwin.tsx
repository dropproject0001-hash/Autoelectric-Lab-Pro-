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
import type { RpmEmulatorState } from '../utils/vehicleEcuRegistry';
import {
  DEFAULT_GAUGE_MONITOR_STATE,
  GaugeMonitorState,
} from '../simulation/telemetry/telemetryTypes';
import { evaluateGaugeTelemetry } from '../simulation/telemetry/gaugeTelemetryEngine';
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
  multimeter: MultimeterState;
  powerSupply: PowerSupplyState;
  selectedPinId: string | null;
  simulationSpeed: number;
  rpmEmulator?: RpmEmulatorState;
  gaugeMonitor?: GaugeMonitorState;
  onSelectPin: (pinId: string | null) => void;
  onAttachProbe: (color: 'red' | 'black', pinId: string, label: string) => void;
  onUpdateComponentState: (compId: string, stateUpdates: Record<string, number | boolean | string>) => void;
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
    <div className={`flex flex-col items-center justify-center ${wellClass} border border-[#2a313e] rounded-[2px] px-1.5 py-1 shrink-0 transition-colors`}>
      <svg viewBox="0 0 88 88" className="w-[72px] h-[72px]" aria-label={`Engine RPM ${rpm}`}>
        <circle cx="44" cy="44" r="39" fill="#0b0e13" stroke="#2c3444" strokeWidth="2" />
        {/* Background sweep track */}
        <path
          d={MINI_RPM_TRACK_ARC}
          fill="none"
          stroke="#1b2230"
          strokeWidth="2.5"
          strokeLinecap="butt"
        />
        {/* Spring-synchronized active RPM sweep arc */}
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
          style={{ transition: 'stroke 150ms ease, stroke-opacity 150ms ease' }}
        />
        {/* Redline arc (6500..8000 RPM) */}
        <path
          d="M 69.5 64.5 A 31 31 0 0 0 74.5 39"
          fill="none"
          stroke="#ef4444"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* Scale ticks 0..8 */}
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
        {/* Spring-Damped Needle */}
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
            style={{ transition: 'stroke 150ms ease' }}
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
  multimeter,
  powerSupply,
  selectedPinId,
  simulationSpeed,
  rpmEmulator = FALLBACK_RPM_EMULATOR,
  gaugeMonitor = DEFAULT_GAUGE_MONITOR_STATE,
  onSelectPin,
  onAttachProbe,
  onUpdateComponentState,
  onOpenOfflineBot,
  onOpenGroundedSearch,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<BenchSceneManager | null>(null);

  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [topHudCollapsed, setTopHudCollapsed] = useState(false);
  const [hudOpacityMode, setHudOpacityMode] = useState<'GLASS' | 'CLEAR' | 'SOLID'>('GLASS');
  const [showSyncedGauges, setShowSyncedGauges] = useState(false);
  const [activePreset, setActivePreset] = useState<CameraPresetKey>('OVERVIEW');
  const [overlayMode, setOverlayMode] = useState<BenchOverlayMode>('VOLTAGE');
  const [explodeAmount, setExplodeAmount] = useState(0);
  const [hoveredMeta, setHoveredMeta] = useState<PickTargetMeta | null>(null);
  const [projectedCallout, setProjectedCallout] = useState<ProjectedCallout | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const hudStyleTokens = useMemo(() => {
    switch (hudOpacityMode) {
      case 'CLEAR':
        return {
          percentLabel: '25%',
          panelSurface: 'bg-[#0E192A]/35 border-[#203653]/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]',
          wellSurface: 'bg-[#050A12]/40 border-[#203653]/85',
          tabSurface: 'bg-[#0E192A]/45 border-[#203653]/85',
          nextTitle: 'Overlay 25% (Clear) — Tap to restore 92% Solid HUD',
        };
      case 'SOLID':
        return {
          percentLabel: '92%',
          panelSurface: 'bg-[#0E192A]/95 border-[#203653]',
          wellSurface: 'bg-[#050A12]/94 border-[#203653]',
          tabSurface: 'bg-[#0E192A]/96 border-[#203653]',
          nextTitle: 'Overlay 92% (Solid) — Tap for 78% Translucent HUD',
        };
      case 'GLASS':
      default:
        return {
          percentLabel: '78%',
          panelSurface: 'bg-[#0E192A]/80 border-[#203653]/95 [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]',
          wellSurface: 'bg-[#050A12]/76 border-[#203653]/90',
          tabSurface: 'bg-[#0E192A]/86 border-[#203653]/95',
          nextTitle: 'Overlay 78% (Translucent) — Tap for 25% Clear View',
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

  const syncedTelemetry = useMemo(
    () =>
      evaluateGaugeTelemetry({
        powerSupply,
        circuitSolution: {
          nodeVoltages,
          nodeResistances: {},
          wireCurrentsMa,
          activeDTCs,
          supplyCurrentDrawAmps: 0,
          isSupplyCurrentTripped: false,
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
      components,
      faults,
      wires,
      rpmEmulator,
      gaugeMonitor,
    ]
  );

  const latestTelemetry = useMemo<BenchTelemetrySnapshot>(
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
      rpm: syncedTelemetry.rpm,
      isRpmRunning: syncedTelemetry.statusCode === 'LIVE_SIMULATED',
      ckpSignalLost: Boolean(rpmEmulator.ckpSignalLost),
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
      syncedTelemetry.rpm,
      syncedTelemetry.statusCode,
      rpmEmulator.ckpSignalLost,
    ]
  );

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
          if (meta?.pinId) {
            onSelectPinRef.current(meta.pinId);
          }
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

  // Push live MNA telemetry updates into scene without recreating WebGL
  useEffect(() => {
    managerRef.current?.updateTelemetry(latestTelemetry);
  }, [latestTelemetry]);

  // Keyboard shortcut 'H' to toggle Cinema / Zen HUD dock
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
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
    managerRef.current?.flyToPreset(preset);
  }, []);

  // Resolve active inspected pin info (hovered takes temporary peek, else selectedPinId)
  const inspectedPinId = hoveredMeta?.pinId ?? selectedPinId;
  const inspectedEcuPin = useMemo(
    () => pins.find((p) => p.id === inspectedPinId) || null,
    [pins, inspectedPinId]
  );

  const inspectedLabel = useMemo(() => {
    if (hoveredMeta) return hoveredMeta.label;
    if (inspectedEcuPin) return `Pin ${inspectedEcuPin.pinNumber}: ${inspectedEcuPin.label}`;
    for (const c of components) {
      const cp = c.pins.find((p) => p.id === inspectedPinId);
      if (cp) return `${c.name.split('(')[0].trim()} · ${cp.label}`;
    }
    if (inspectedPinId === 'chassis-gnd') return 'Chassis GND (KL31)';
    return 'Select a 3D Pin or Terminal';
  }, [hoveredMeta, inspectedEcuPin, components, inspectedPinId]);

  const inspectedVoltage =
    inspectedPinId && nodeVoltages[inspectedPinId] !== undefined
      ? nodeVoltages[inspectedPinId]
      : null;

  const inspectedFault = useMemo(
    () => (inspectedPinId ? faults.find((f) => f.pinId === inspectedPinId) : undefined),
    [faults, inspectedPinId]
  );

  const inspectedDtc = useMemo(
    () =>
      inspectedPinId
        ? activeDTCs.find((d) => d.associatedPinIds.includes(inspectedPinId))
        : undefined,
    [activeDTCs, inspectedPinId]
  );

  const tpsComp = useMemo(
    () => components.find((c) => c.id === 'comp-tps'),
    [components]
  );
  const tpsThrottlePct = Number(tpsComp?.state?.throttleAnglePercent ?? 20);
  const showTpsQuickSlider =
    showSyncedGauges ||
    inspectedPinId === 'ecu-pin-7' ||
    inspectedPinId === 'tps-sig' ||
    inspectedPinId === 'tps-vcc' ||
    inspectedPinId === 'tps-gnd';

  // Keep projected 3D callout strictly inside safe middle viewport area
  const showCalloutLeader =
    Boolean(projectedCallout?.visible) &&
    projectedCallout!.x > 40 &&
    projectedCallout!.y > 140;

  return (
    <div className="relative flex-1 w-full h-full rounded-[3px] overflow-hidden border border-[#2f3745] bg-[#0c0e12]">
      {/* Isolated WebGL Canvas Container */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Projected 3D Pin / 16-Pin Header Callout Leader Line */}
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
            className="absolute bg-[#0E192A]/95 border border-[#19C8F5]/55 rounded-md px-2 py-0.5 text-[9.5px] font-mono font-bold text-[#EAF3FF] whitespace-nowrap shadow-lg"
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
              {contextLost ? 'WebGL Context Interrupted' : '3D Bench Viewport Unavailable'}
            </h3>
            <p className="mt-1.5 text-xs font-sans text-[#91A4BD]">
              {initError ||
                'Your browser temporarily paused the 3D GPU context. Switch tabs or reload to restore live hardware rendering.'}
            </p>
          </div>
        </div>
      )}

      {/* Compact Top-Left 3D Terminal Inspector + Collapsible Synced Telemetry Strip */}
      <div
        className={`absolute top-2 sm:top-3 left-2 sm:left-3 right-2 sm:right-auto z-10 sm:w-[400px] rounded-xl border p-2 sm:p-2.5 shadow-xl pointer-events-auto transition-colors duration-150 ${hudStyleTokens.panelSurface}`}
      >
        <div
          className={`flex items-center justify-between gap-1.5 ${
            topHudCollapsed ? '' : 'border-b border-[#203653]/90 pb-1.5 mb-1.5'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Box className="w-3.5 h-3.5 text-[#19C8F5] shrink-0" />
            <span className="font-hud text-[11px] font-bold tracking-wider uppercase text-[#EAF3FF] truncate">
              <span className="xs:hidden">3D Twin</span>
              <span className="hidden xs:inline">3D Bench Twin · MNA Sync</span>
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
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
              <span className="hidden xs:inline">Opacity</span>
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
            <span
              className={`text-[10px] font-mono font-bold whitespace-nowrap ${
                powerSupply.isOutputEnabled ? 'text-amber-400' : 'text-slate-500'
              }`}
            >
              {powerSupply.isOutputEnabled ? `${powerSupply.voltageSetting.toFixed(1)}V ON` : 'PWR OFF'}
            </span>
            <button
              type="button"
              onClick={() => setTopHudCollapsed((prev) => !prev)}
              aria-expanded={!topHudCollapsed}
              title={topHudCollapsed ? 'Expand 3D Pin Inspector & Gauges' : 'Collapse 3D Pin Inspector for clear 3D view'}
              aria-label={topHudCollapsed ? 'Expand 3D pin inspector' : 'Collapse 3D pin inspector'}
              className="hw-btn p-0.5 rounded-[2px] text-slate-300 hover:text-amber-300 cursor-pointer"
            >
              {topHudCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {!topHudCollapsed && (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-mono font-bold text-emerald-300 truncate">
                  {inspectedLabel}
                </div>
                <div className="text-[10px] font-sans text-slate-300 truncate mt-0.5">
                  {hoveredMeta?.subtitle ||
                    inspectedEcuPin?.description ||
                    'Drag to orbit · Pinch/Scroll to zoom · Tap any pin'}
                </div>
              </div>
              {inspectedVoltage !== null && (
                <div className="text-right shrink-0 font-mono">
                  <div className="text-xs sm:text-sm font-bold text-amber-400 tabular-nums">
                    {inspectedVoltage.toFixed(2)} V
                  </div>
                  <div className="text-[9px] text-slate-400 uppercase">Live Node</div>
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
                    onClick={() => onOpenGroundedSearch(`${inspectedDtc.code} automotive diagnostic`, inspectedDtc.code)}
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
                  <div className={`flex flex-col justify-between ${hudStyleTokens.wellSurface} border rounded-[2px] px-2 py-1.5 font-mono text-right shrink-0 min-w-[82px] transition-colors`}>
                    <span className="text-[8.5px] uppercase text-slate-400">SIMULATED</span>
                    <div className="text-xs font-bold tabular-nums text-emerald-300">
                      {syncedTelemetry.boostBar !== null
                        ? `${syncedTelemetry.boostBar >= 0 ? '+' : ''}${syncedTelemetry.boostBar.toFixed(2)} bar`
                        : syncedTelemetry.mapFaultLabel || 'INVALID'}
                    </div>
                    <div className="text-[9.5px] tabular-nums text-amber-300 font-semibold">
                      {syncedTelemetry.supplyVoltageV !== null
                        ? `${syncedTelemetry.supplyVoltageV.toFixed(1)}V KL30`
                        : 'PSU OFF'}
                    </div>
                    <div className="text-[8.5px] tabular-nums text-slate-300">
                      {syncedTelemetry.simulatedSpeedKmh} km/h
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Collapsible Bottom-Center Unified Control Dock */}
      <div className="absolute bottom-2 sm:bottom-3 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-20 flex flex-col items-center sm:max-w-[min(940px,95vw)] pointer-events-auto">
        <button
          type="button"
          onClick={() => setDockCollapsed((prev) => !prev)}
          title="Toggle 3D Controls (H)"
          className={`px-3 py-1 rounded-t-[2px] border border-b-0 ${hudStyleTokens.tabSurface} text-[10px] font-mono font-semibold text-amber-300 hover:text-white flex items-center gap-1.5 transition cursor-pointer`}
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3 h-3" />
              <span>Show 3D Controls (H)</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              <span>Hide Controls (H)</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className={`w-full rounded-[3px] border ${hudStyleTokens.panelSurface} px-2 sm:px-3 py-1.5 sm:py-2 shadow-2xl flex flex-wrap items-center justify-center gap-1.5 sm:gap-3 text-[10px] sm:text-[11px] font-mono max-h-[30vh] overflow-y-auto transition-colors duration-150`}>
            {/* Camera Presets */}
            <div className={`flex items-center gap-1 ${hudStyleTokens.wellSurface} p-1 rounded-[2px] border overflow-x-auto scrollbar-none max-w-full`}>
              <Crosshair className="w-3.5 h-3.5 text-amber-400 mx-1 shrink-0" />
              {(
                [
                  ['OVERVIEW', 'Overview'],
                  ['ECU_EXPLODED', 'ECU Exploded'],
                  ['CONNECTOR_16PIN', '16-Pin Header'],
                  ['HARNESS_ACTUATORS', 'Actuators'],
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

            {/* Explode ECU Housing Rotary Control */}
            <div className={`flex items-center gap-2 ${hudStyleTokens.wellSurface} px-2.5 py-1 rounded-[2px] border`}>
              <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
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

            {/* Diagnostic Overlay Switcher */}
            <div className={`flex items-center gap-1 ${hudStyleTokens.wellSurface} p-1 rounded-[2px] border overflow-x-auto scrollbar-none max-w-full`}>
              <button
                type="button"
                onClick={() => setOverlayMode('VOLTAGE')}
                className={`hw-btn px-2 py-1 rounded-[2px] text-[10px] flex items-center gap-1 transition whitespace-nowrap shrink-0 cursor-pointer ${
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
                className={`hw-btn px-2 py-1 rounded-[2px] text-[10px] flex items-center gap-1 transition whitespace-nowrap shrink-0 cursor-pointer ${
                  overlayMode === 'THERMAL'
                    ? 'bg-rose-950/90 border-rose-500 text-rose-200 font-bold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Flame className="w-3 h-3" />
                <span>Thermal</span>
              </button>
              <button
                type="button"
                onClick={() => setOverlayMode('WIRE_ID')}
                className={`hw-btn px-2 py-1 rounded-[2px] text-[10px] flex items-center gap-1 transition whitespace-nowrap shrink-0 cursor-pointer ${
                  overlayMode === 'WIRE_ID'
                    ? 'hw-btn-amber font-bold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Sliders className="w-3 h-3" />
                <span>Wire ID</span>
              </button>
            </div>

            {/* Reset View */}
            <button
              type="button"
              onClick={() => {
                setExplodeAmount(0);
                handlePresetClick('OVERVIEW');
              }}
              className="hw-btn px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-[2px] text-[10px] text-slate-200 flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
              title="Reset 3D Camera & Enclosure"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const ThreeBenchTwin = React.memo(ThreeBenchTwinComponent);
