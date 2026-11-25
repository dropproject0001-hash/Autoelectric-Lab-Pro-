/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  EcuPin,
  WireConnection,
  BenchComponent,
  MultimeterState,
  InjectedFault,
  FaultType,
  DiagnosticTroubleCode,
} from '../types/ecu';
import {
  Scissors,
  Wrench,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Link2,
  Disc,
  Sliders,
  Trash2,
  Activity,
  Flame,
  Check,
  X,
  ArrowRight,
  GripVertical,
  Plus,
  Layers,
  Pencil,
  Search,
  Share2,
  Cable,
  AlertTriangle,
  ZapOff,
} from 'lucide-react';
import { recordRenderCycle } from '../utils/perfMonitor';
import { BenchComponentLibrarySidebar } from './BenchComponentLibrarySidebar';
import {
  createBenchComponentFromTemplate,
  LibraryComponentTemplate,
} from '../data/benchComponentLibrary';
import {
  isCustomWireConnection,
  MAX_WIRE_LABEL_LENGTH,
  normalizeWireLabelInput,
} from '../utils/wireLabelUtils';
import { RotaryEncoderDial } from './HardwareControls';
import { LabDrawerIcon } from './icons/LabDrawerIcons';
import { evaluateTopologySearch } from '../simulation/telemetry/harnessDiagnostics';
import type { RpmEmulatorState } from '../utils/vehicleEcuRegistry';
import type { GaugeTransportMode } from '../simulation/telemetry/telemetryTypes';
import { HarnessDiagnosticsDeck } from './harness/HarnessDiagnosticsDeck';
import { VisualTopologyGraph } from './harness/VisualTopologyGraph';
import {
  formatProbeMoveBadge,
  useProbeTransitionMotion,
} from './harness/useProbeTransitionMotion';
import { ProbeTransitionOverlay } from './harness/ProbeTransitionOverlay';
import { WireOverviewMapPanel } from './harness/WireOverviewMapPanel';

interface WiringCanvasProps {
  pins: EcuPin[];
  wires: WireConnection[];
  components: BenchComponent[];
  nodeVoltages: Record<string, number>;
  wireCurrentsMa?: Record<string, number>;
  faults?: InjectedFault[];
  activeDTCs?: DiagnosticTroubleCode[];
  isSupplyTripped?: boolean;
  rpmEmulator?: RpmEmulatorState;
  gaugeTransportMode?: GaugeTransportMode;
  expandedDiagnosticsByDefault?: boolean;
  selectedPinId: string | null;
  onSelectPin: (pinId: string) => void;
  onAddWire: (sourcePinId: string, targetPinId: string, color?: string, label?: string) => void;
  onToggleCutWire: (wireId: string) => void;
  onDeleteWire: (wireId: string) => void;
  onRenameWire?: (wireId: string, newLabel: string) => void;
  onAddFault?: (pinId: string, faultType: FaultType, description: string) => void;
  onRemoveFault?: (pinId: string) => void;
  onClearAllFaults?: () => void;
  multimeter: MultimeterState;
  onAttachProbe: (color: 'red' | 'black', pinId: string, label: string) => void;
  onUpdateComponentState: (compId: string, updates: Record<string, number | boolean | string>) => void;
  isPowerOn: boolean;
  onOpenEcuPinouts?: () => void;
  simulationSpeed?: number;
  ecuProfileLabel?: string;
  hasInjectorFault?: boolean;
  onAddComponent?: (comp: BenchComponent) => void;
  onDeleteComponent?: (compId: string) => void;
  onUpdateComponentPosition?: (compId: string, x: number, y: number) => void;
}

const EMPTY_FAULTS: InjectedFault[] = [];
const EMPTY_DTCS: DiagnosticTroubleCode[] = [];
const EMPTY_CURRENTS: Record<string, number> = {};

const QUICK_PIN_FAULT_PRESETS: Array<{
  type: Exclude<FaultType, 'NONE' | 'HIGH_RESISTANCE_1K'>;
  shortCode: string;
  label: string;
  description: string;
  severity: 'critical' | 'warning';
}> = [
  {
    type: 'OPEN_CIRCUIT',
    shortCode: 'OPEN',
    label: 'Open Circuit (Break)',
    description: 'High impedance / disconnected terminal',
    severity: 'warning',
  },
  {
    type: 'SHORT_TO_GND',
    shortCode: 'GND!',
    label: 'Short to GND (KL31)',
    description: '0V hard short to chassis ground',
    severity: 'critical',
  },
  {
    type: 'SHORT_TO_VBAT',
    shortCode: 'VBAT!',
    label: 'Short to VBAT (+12V)',
    description: 'Direct battery voltage short',
    severity: 'critical',
  },
  {
    type: 'HIGH_RESISTANCE_50R',
    shortCode: '+50Ω',
    label: 'Corrosion (+50Ω)',
    description: 'Voltage drop across corroded connector pin',
    severity: 'warning',
  },
  {
    type: 'HIGH_RESISTANCE_250R',
    shortCode: '+250Ω',
    label: 'Severe Corrosion (+250Ω)',
    description: 'Severe voltage starvation at load',
    severity: 'warning',
  },
];

function getPinFaultMeta(faultType: FaultType): {
  shortCode: string;
  label: string;
  severity: 'critical' | 'warning';
} {
  const preset = QUICK_PIN_FAULT_PRESETS.find((p) => p.type === faultType);
  if (preset) {
    return {
      shortCode: preset.shortCode,
      label: preset.label,
      severity: preset.severity,
    };
  }
  if (faultType === 'HIGH_RESISTANCE_1K') {
    return {
      shortCode: '+1kΩ',
      label: 'Extreme Corrosion (+1kΩ)',
      severity: 'warning',
    };
  }
  return {
    shortCode: 'FAULT',
    label: faultType.replace(/_/g, ' '),
    severity: 'warning',
  };
}

const AUTOMOTIVE_WIRE_COLORS = [
  { name: 'Red (+12V Power / KL30)', hex: '#ef4444', category: 'power' },
  { name: 'Brown (Ground / KL31)', hex: '#78350f', category: 'ground' },
  { name: 'Violet (Ignition Wake / KL15)', hex: '#a855f7', category: 'ignition' },
  { name: 'Yellow (5V Sensor VREF)', hex: '#eab308', category: 'reference' },
  { name: 'Green (Signal / K-Line)', hex: '#22c55e', category: 'signal' },
  { name: 'Orange (CAN High Bus)', hex: '#f97316', category: 'comms' },
  { name: 'Blue (Injector / Actuator Drive)', hex: '#3b82f6', category: 'actuator' },
  { name: 'Black (Chassis Earth Return)', hex: '#1e293b', category: 'ground' },
  { name: 'White (Auxiliary / Data)', hex: '#cbd5e1', category: 'aux' },
];

export const WiringCanvas: React.FC<WiringCanvasProps> = ({
  pins,
  wires,
  components,
  nodeVoltages,
  wireCurrentsMa = EMPTY_CURRENTS,
  faults = EMPTY_FAULTS,
  activeDTCs = EMPTY_DTCS,
  isSupplyTripped = false,
  rpmEmulator,
  gaugeTransportMode = 'STOPPED',
  expandedDiagnosticsByDefault = false,
  selectedPinId,
  onSelectPin,
  onAddWire,
  onToggleCutWire,
  onDeleteWire,
  onRenameWire,
  onAddFault,
  onRemoveFault,
  onClearAllFaults,
  multimeter,
  onAttachProbe,
  onUpdateComponentState,
  isPowerOn,
  onOpenEcuPinouts,
  simulationSpeed = 1.0,
  ecuProfileLabel,
  hasInjectorFault = false,
  onAddComponent,
  onDeleteComponent,
  onUpdateComponentPosition,
}) => {
  useEffect(() => {
    recordRenderCycle('WiringCanvas');
  });

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isWireOverviewOpen, setIsWireOverviewOpen] = useState(false);
  const [focusedOverviewWireId, setFocusedOverviewWireId] = useState<string | null>(null);
  const [topologyQuery, setTopologyQuery] = useState('');
  const [canvasViewMode, setCanvasViewMode] = useState<'SCHEMATIC' | 'TOPOLOGY_GRAPH'>('SCHEMATIC');
  const [isTopologyExpanded, setIsTopologyExpanded] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 0.58 : 0.78
  );
  const hasUserZoomedRef = useRef(false);

  const computeFitZoom = (container: HTMLDivElement | null) => {
    if (!container) return 0.78;
    const availW = Math.max(320, container.clientWidth - 20);
    const availH = Math.max(240, container.clientHeight - 20);
    const fitW = availW / 1060;
    const fitH = availH / 690;
    const raw = Math.min(fitW, fitH, 1.0);
    return Number(Math.max(0.48, Math.min(1.0, raw)).toFixed(2));
  };

  useEffect(() => {
    if (canvasViewMode !== 'SCHEMATIC') return;
    const container = canvasContainerRef.current;
    if (!container) return;

    const applyAutoFit = () => {
      if (hasUserZoomedRef.current) return;
      const next = computeFitZoom(container);
      setZoomLevel((prev) => (Math.abs(prev - next) >= 0.02 ? next : prev));
    };

    applyAutoFit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      applyAutoFit();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [canvasViewMode]);

  const handleManualZoomDelta = (delta: number) => {
    hasUserZoomedRef.current = true;
    setZoomLevel((prev) => Math.max(0.45, Math.min(1.4, +(prev + delta).toFixed(2))));
  };

  const handleFitCanvas = () => {
    hasUserZoomedRef.current = false;
    setZoomLevel(computeFitZoom(canvasContainerRef.current));
  };

  const handleResetZoom = () => {
    hasUserZoomedRef.current = true;
    setZoomLevel(1.0);
  };

  const [wireSourcePin, setWireSourcePin] = useState<{ id: string; label: string } | null>(null);
  const [hoveredWireId, setHoveredWireId] = useState<string | null>(null);
  const [editingWireId, setEditingWireId] = useState<string | null>(null);
  const [editingWireLabelDraft, setEditingWireLabelDraft] = useState<string>('');
  const wireLabelInputRef = useRef<HTMLInputElement | null>(null);
  const [activePinMenuId, setActivePinMenuId] = useState<string | null>(null);
  const [hoveredCompCardId, setHoveredCompCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!editingWireId) return;
    if (!wires.some((w) => w.id === editingWireId)) {
      setEditingWireId(null);
      setEditingWireLabelDraft('');
      return;
    }
    const timer = window.setTimeout(() => {
      wireLabelInputRef.current?.focus();
      wireLabelInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editingWireId, wires]);

  const startEditingWireLabel = (wire: WireConnection) => {
    setEditingWireId(wire.id);
    setEditingWireLabelDraft(wire.label);
    setActivePinMenuId(null);
  };

  const cancelEditingWireLabel = () => {
    setEditingWireId(null);
    setEditingWireLabelDraft('');
  };

  const commitEditingWireLabel = (wire: WireConnection) => {
    const normalized = normalizeWireLabelInput(editingWireLabelDraft);
    if (normalized && normalized !== wire.label) {
      onRenameWire?.(wire.id, normalized);
    }
    setEditingWireId(null);
    setEditingWireLabelDraft('');
  };

  // Component Dragging State (to reposition components smoothly on the bench)
  const [draggingCompId, setDraggingCompId] = useState<string | null>(null);
  const dragStartPosRef = useRef<{ clientX: number; clientY: number; startX: number; startY: number } | null>(null);

  useEffect(() => {
    if (!draggingCompId) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragStartPosRef.current) return;
      const dx = (e.clientX - dragStartPosRef.current.clientX) / zoomLevel;
      const dy = (e.clientY - dragStartPosRef.current.clientY) / zoomLevel;
      const newX = Math.max(260, Math.min(880, Math.round(dragStartPosRef.current.startX + dx)));
      const newY = Math.max(20, Math.min(620, Math.round(dragStartPosRef.current.startY + dy)));
      if (onUpdateComponentPosition) {
        onUpdateComponentPosition(draggingCompId, newX, newY);
      }
    };

    const handlePointerUp = () => {
      setDraggingCompId(null);
      dragStartPosRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingCompId, zoomLevel, onUpdateComponentPosition]);

  const handleComponentHeaderPointerDown = (e: React.PointerEvent, comp: BenchComponent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setDraggingCompId(comp.id);
    dragStartPosRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: comp.x,
      startY: comp.y,
    };
  };

  // Drag-and-drop from library onto canvas
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const template: LibraryComponentTemplate = JSON.parse(raw);
      if (!template || !template.id) return;

      const rect = canvasContainerRef.current?.getBoundingClientRect();
      let targetX = 600;
      let targetY = 160;
      if (rect) {
        const scrollLeft = canvasContainerRef.current?.scrollLeft ?? 0;
        const scrollTop = canvasContainerRef.current?.scrollTop ?? 0;
        const cX = (e.clientX - rect.left + scrollLeft) / zoomLevel;
        const cY = (e.clientY - rect.top + scrollTop) / zoomLevel;
        targetX = Math.max(280, Math.min(860, Math.round(cX - 115)));
        targetY = Math.max(30, Math.min(590, Math.round(cY - 20)));
      }

      const newComp = createBenchComponentFromTemplate(template, targetX, targetY);
      if (onAddComponent) {
        onAddComponent(newComp);
      }
    } catch (err) {
      console.error('Failed to parse dropped template:', err);
    }
  };

  useEffect(() => {
    if (!activePinMenuId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivePinMenuId(null);
    };
    const handlePointerDown = () => {
      setActivePinMenuId(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [activePinMenuId]);
  const [hoveredEcuPinId, setHoveredEcuPinId] = useState<string | null>(null);
  const [hoveredCompPinId, setHoveredCompPinId] = useState<string | null>(null);

  // Pending wire creation state for color selector modal
  const [pendingWire, setPendingWire] = useState<{
    sourceId: string;
    sourceLabel: string;
    targetId: string;
    targetLabel: string;
  } | null>(null);
  const [selectedWireColor, setSelectedWireColor] = useState<string>('#ef4444');
  const [selectedWireLabel, setSelectedWireLabel] = useState<string>('Automotive Harness Wire');

  // Exact Layout Constants for 100% Mathematical Terminal Alignment
  const ECU_BOX_X = 24;
  const ECU_BOX_Y = 24;
  const ECU_BOX_WIDTH = 236;
  const ECU_HEADER_HEIGHT = 40;
  const ECU_ROW_HEIGHT = 36; // 32px height + 4px gap

  const COMP_WIDTH = 230;
  const COMP_HEADER_HEIGHT = 38;
  const COMP_ROW_HEIGHT = 34; // 30px height + 4px gap

  const pinCoordsMap = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {
      'chassis-gnd': { x: ECU_BOX_X + ECU_BOX_WIDTH, y: 640 },
      'bench-vbat': { x: ECU_BOX_X + ECU_BOX_WIDTH, y: 15 },
    };

    for (let i = 0; i < pins.length; i++) {
      map[pins[i].id] = {
        x: ECU_BOX_X + ECU_BOX_WIDTH,
        y: ECU_BOX_Y + ECU_HEADER_HEIGHT + i * ECU_ROW_HEIGHT + 16,
      };
    }

    for (const comp of components) {
      for (let i = 0; i < comp.pins.length; i++) {
        map[comp.pins[i].id] = {
          x: comp.x,
          y: comp.y + COMP_HEADER_HEIGHT + i * COMP_ROW_HEIGHT + 15,
        };
      }
    }

    return map;
  }, [pins, components]);

  const DEFAULT_PIN_COORD = { x: 200, y: 200 };

  // Mathematical Coordinate Calculator (O(1) cached lookup)
  const getPinCoords = (pinId: string): { x: number; y: number } => {
    return pinCoordsMap[pinId] ?? DEFAULT_PIN_COORD;
  };

  // Compute collision-free midpoint coordinates for editable custom wire labels
  const customWireLabelAnchors = useMemo(() => {
    const rawItems = wires
      .filter((wire) => isCustomWireConnection(wire))
      .map((wire) => {
        const start = pinCoordsMap[wire.sourcePinId] ?? DEFAULT_PIN_COORD;
        const end = pinCoordsMap[wire.targetPinId] ?? DEFAULT_PIN_COORD;
        const x = (start.x + end.x) / 2;
        const y = (start.y + end.y) / 2 + (wire.isCut ? 22 : 0);
        return { wire, x, y };
      });

    const placed: { x: number; y: number }[] = [];
    return rawItems.map((item) => {
      let adjustedY = item.y;
      while (placed.some((p) => Math.abs(p.x - item.x) < 120 && Math.abs(p.y - adjustedY) < 26)) {
        adjustedY += 26;
      }
      adjustedY = Math.max(18, Math.min(670, adjustedY));
      placed.push({ x: item.x, y: adjustedY });
      return { ...item, y: adjustedY };
    });
  }, [wires, pinCoordsMap]);

  const handlePinAction = (pinId: string, label: string) => {
    onSelectPin(pinId);
    setActivePinMenuId(activePinMenuId === pinId ? null : pinId);

    if (wireSourcePin) {
      if (wireSourcePin.id !== pinId) {
        let defaultColor = '#ef4444';
        const l = label.toLowerCase();
        if (l.includes('gnd') || l.includes('ground') || l.includes('kl31')) defaultColor = '#78350f';
        else if (l.includes('can')) defaultColor = '#f97316';
        else if (l.includes('sig') || l.includes('vta') || l.includes('signal')) defaultColor = '#22c55e';
        else if (l.includes('5v') || l.includes('vref')) defaultColor = '#eab308';
        else if (l.includes('ign') || l.includes('kl15')) defaultColor = '#a855f7';

        setPendingWire({
          sourceId: wireSourcePin.id,
          sourceLabel: wireSourcePin.label,
          targetId: pinId,
          targetLabel: label,
        });
        setSelectedWireColor(defaultColor);
        setSelectedWireLabel(`${wireSourcePin.label} -> ${label}`);
      }
      setWireSourcePin(null);
      setActivePinMenuId(null);
    }
  };

  // Get coordinates for probes and connect physics transition hook
  const targetRedCoords = multimeter.redProbe.attachedToPinId
    ? getPinCoords(multimeter.redProbe.attachedToPinId)
    : null;
  const targetBlackCoords = multimeter.blackProbe.attachedToPinId
    ? getPinCoords(multimeter.blackProbe.attachedToPinId)
    : null;

  const redAnimated = useProbeTransitionMotion({
    pinId: multimeter.redProbe.attachedToPinId,
    pinLabel: multimeter.redProbe.attachedLabel,
    targetCoords: targetRedCoords,
    color: 'red',
    originCoords: { x: 15, y: 20 },
  });
  const blackAnimated = useProbeTransitionMotion({
    pinId: multimeter.blackProbe.attachedToPinId,
    pinLabel: multimeter.blackProbe.attachedLabel,
    targetCoords: targetBlackCoords,
    color: 'black',
    originCoords: { x: 15, y: 670 },
  });

  const isSearchActive = topologyQuery.trim().length > 0;
  const topologySearch = useMemo(
    () =>
      evaluateTopologySearch({
        query: topologyQuery,
        pins,
        wires,
        components,
      }),
    [topologyQuery, pins, wires, components]
  );

  return (
    <div className="relative flex-1 min-h-0 min-w-0 hud-panel rounded-xl border-[#203653] overflow-hidden flex flex-col select-none">
      {/* Docked Responsive Status, Topology Search & Zoom HUD Bar — aligned 44px desktop header */}
      <div className="shrink-0 z-20 min-h-[44px] border-b border-[#203653] bg-[#0A1220]/96 px-2 lg:px-2.5 py-1 flex flex-wrap xl:flex-nowrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 text-[10px] font-mono text-[#d9e8fa] min-w-0">
          <div className="flex items-center gap-0.5 bg-[#050A12] border border-[#203653] rounded-lg p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setCanvasViewMode('SCHEMATIC')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono font-bold uppercase whitespace-nowrap transition cursor-pointer ${
                canvasViewMode === 'SCHEMATIC'
                  ? 'hw-btn-blue text-white'
                  : 'text-[#91a4bd] hover:text-[#eaf3ff]'
              }`}
            >
              <Activity className={`w-3 h-3 shrink-0 ${canvasViewMode === 'SCHEMATIC' ? 'text-white' : 'text-[#19c8f5]'}`} />
              <span>Schematic</span>
            </button>
            <button
              type="button"
              onClick={() => setCanvasViewMode('TOPOLOGY_GRAPH')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono font-bold uppercase whitespace-nowrap transition cursor-pointer ${
                canvasViewMode === 'TOPOLOGY_GRAPH'
                  ? 'hw-btn-blue text-white'
                  : 'text-[#91a4bd] hover:text-[#eaf3ff]'
              }`}
              title="Interactive Dynamic Force-Directed Topology Graph"
            >
              <Share2 className={`w-3 h-3 shrink-0 ${canvasViewMode === 'TOPOLOGY_GRAPH' ? 'text-white' : 'text-[#19c8f5]'}`} />
              <span className="hidden 2xl:inline">Topology Graph</span>
              <span className="2xl:hidden">Topology</span>
            </button>
          </div>

          <div className="relative flex items-center bg-[#050A12] border border-[#203653] rounded-lg px-2 py-1 focus-within:border-[#19c8f5] min-w-0">
            <Search className="w-3 h-3 text-[#91a4bd] shrink-0 mr-1.5" />
            <input
              type="text"
              value={topologyQuery}
              onChange={(e) => setTopologyQuery(e.target.value)}
              placeholder="Search pins / nets..."
              aria-label="Search harness topology"
              className="w-24 sm:w-28 xl:w-32 2xl:w-44 bg-transparent text-[10.5px] font-mono text-[#eaf3ff] placeholder:text-[#6f87a6] focus:outline-none"
            />
            {isSearchActive && (
              <>
                <span className="text-[9.5px] text-[#ffb020] font-bold tabular-nums px-1 shrink-0">
                  {topologySearch.totalMatches}
                </span>
                <button
                  type="button"
                  onClick={() => setTopologyQuery('')}
                  className="text-[#91a4bd] hover:text-white cursor-pointer"
                  aria-label="Clear topology search"
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            )}
          </div>

          {wireSourcePin && (
            <div className="flex items-center gap-1.5 text-[#ffb020] font-medium truncate">
              <Link2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Connect &ldquo;{wireSourcePin.label}&rdquo; &rarr; Tap target</span>
              <button
                onClick={() => setWireSourcePin(null)}
                className="text-[10px] text-[#91a4bd] hover:text-white underline ml-1 shrink-0 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {(redAnimated.isMoving || blackAnimated.isMoving) && (
            <div
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-[#203653] bg-[#050A12] text-[10px] font-mono shrink-0"
              aria-live="polite"
            >
              <span
                className={`w-2 h-2 rounded-full animate-ping ${
                  redAnimated.isMoving ? 'bg-[#ff4d62]' : 'bg-[#eaf3ff]'
                }`}
              />
              <span className={redAnimated.isMoving ? 'text-rose-300 font-bold' : 'text-[#eaf3ff] font-bold'}>
                {redAnimated.isMoving
                  ? `RED: ${formatProbeMoveBadge(redAnimated.fromLabel, redAnimated.toLabel)}`
                  : `COM: ${formatProbeMoveBadge(blackAnimated.fromLabel, blackAnimated.toLabel)}`}
              </span>
            </div>
          )}
        </div>

        {/* Wire Overview Map, Component Library Toggle & Zoom / Fit / Reset HUD */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 bg-[#050A12] border border-[#203653] p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setIsWireOverviewOpen((prev) => !prev)}
              aria-expanded={isWireOverviewOpen}
              className={`hw-btn flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono font-bold whitespace-nowrap transition cursor-pointer ${
                isWireOverviewOpen
                  ? 'hw-btn-amber'
                  : 'text-[#d9e8fa] hover:text-white'
              }`}
              title="Open Searchable Wire Overview Map Panel"
            >
              <LabDrawerIcon name="split-drawer" size={24} className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden 2xl:inline">Wire Map</span>
              <span className="2xl:hidden">Wires</span>
              <span className="text-[10px] font-bold text-[#20d889] tabular-nums">
                ({wires.filter((w) => !w.isCut).length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsLibraryOpen((prev) => !prev)}
              className={`hw-btn flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono font-bold whitespace-nowrap transition cursor-pointer ${
                isLibraryOpen
                  ? 'hw-btn-amber'
                  : 'text-[#d9e8fa] hover:text-white'
              }`}
              title="Open Searchable Bench Component Library"
            >
              <LabDrawerIcon name="multi-comp" size={24} className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden 2xl:inline">Bench Library</span>
              <span className="2xl:hidden">Parts</span>
              {components.filter((c) => c.isAuxiliary).length > 0 && (
                <span className="text-[10px] font-bold text-[#ffb020] tabular-nums">
                  ({components.filter((c) => c.isAuxiliary).length})
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-0.5 bg-[#050A12] border border-[#203653] p-0.5 rounded-lg text-[#d9e8fa]">
            <button
              type="button"
              onClick={() => handleManualZoomDelta(-0.1)}
              className="p-1 hover:bg-[#132238] rounded-md text-[#91a4bd] hover:text-white cursor-pointer"
              title="Zoom Out"
              aria-label="Zoom out harness schematic"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono px-1 text-[#eaf3ff] tabular-nums min-w-[34px] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={() => handleManualZoomDelta(0.1)}
              className="p-1 hover:bg-[#132238] rounded-md text-[#91a4bd] hover:text-white cursor-pointer"
              title="Zoom In"
              aria-label="Zoom in harness schematic"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleFitCanvas}
              className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-[#0E192A] hover:bg-[#132238] border border-[#203653] hover:border-[#19c8f5]/60 rounded-md text-[#19c8f5] cursor-pointer whitespace-nowrap"
              title="Auto-Fit Full Harness to Stage"
            >
              Fit
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="p-1 hover:bg-[#132238] rounded-md text-[#91a4bd] hover:text-white cursor-pointer"
              title="Reset View 100%"
              aria-label="Reset zoom to 100 percent"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {canvasViewMode === 'TOPOLOGY_GRAPH' ? (
        <div className="flex-1 min-h-0 min-w-0 p-1.5 sm:p-2 flex flex-col">
          <VisualTopologyGraph
            pins={pins}
            components={components}
            wires={wires}
            nodeVoltages={nodeVoltages}
            faults={faults}
            isPowerOn={isPowerOn}
            onToggleCutWire={onToggleCutWire}
            onRemoveWire={onDeleteWire}
            onAttachProbe={onAttachProbe}
            onSelectPin={onSelectPin}
            onStartWireFromPin={(p) => setWireSourcePin(p)}
            multimeter={multimeter}
            selectedPinId={selectedPinId}
            searchQuery={topologyQuery}
            onSearchQueryChange={setTopologyQuery}
            expanded={isTopologyExpanded}
            onToggleExpanded={() => setIsTopologyExpanded((prev) => !prev)}
          />
        </div>
      ) : (
        /* Main Interactive Stage — exact scaled bounding box prevents left/right overflow clipping */
        <div
          ref={canvasContainerRef}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="flex-1 min-h-0 overflow-auto p-2.5 flex items-start justify-start hud-blueprint-grid"
        >
        <div
          style={{
            width: `${Math.round(1060 * zoomLevel)}px`,
            height: `${Math.round(690 * zoomLevel)}px`,
          }}
          className="relative m-auto shrink-0"
        >
        <div
          style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}
          className="relative transition-transform duration-100 w-[1060px] h-[690px]"
        >
          {/* SVG Connection Layer */}
          <svg className="absolute inset-0 w-[1060px] h-[690px] pointer-events-auto z-10 overflow-visible">
            {/* Engineering Grid */}
            <defs>
              <pattern id="benchCanvasGrid" width="28" height="28" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="0.8" fill="rgba(148, 163, 184, 0.16)" />
                <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(148, 163, 184, 0.06)" strokeWidth="0.6" />
              </pattern>

              <filter id="wireGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            <rect width="100%" height="100%" fill="url(#benchCanvasGrid)" />

            {/* Automotive Wires */}
            {wires.map(wire => {
              const start = getPinCoords(wire.sourcePinId);
              const end = getPinCoords(wire.targetPinId);
              const dx = end.x - start.x;
              const ctrl1X = start.x + dx * 0.45;
              const ctrl2X = end.x - dx * 0.45;
              const pathD = `M ${start.x} ${start.y} C ${ctrl1X} ${start.y}, ${ctrl2X} ${end.y}, ${end.x} ${end.y}`;

              const isHovered = hoveredWireId === wire.id || focusedOverviewWireId === wire.id;
              const isSearchMatch = !isSearchActive || topologySearch.matchingWireIds.has(wire.id);
              const midX = (start.x + end.x) / 2;
              const midY = (start.y + end.y) / 2;

              return (
                <g
                  key={wire.id}
                  className="cursor-pointer group"
                  onMouseEnter={() => setHoveredWireId(wire.id)}
                  onMouseLeave={() => setHoveredWireId(null)}
                >
                  {/* Broad invisible hit area for easy clicking */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="16"
                    onClick={() => onToggleCutWire(wire.id)}
                  />

                  {/* Wire Outer Jacket */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={wire.isCut ? '#475569' : wire.color}
                    strokeWidth={isHovered || (isSearchActive && isSearchMatch) ? '4.5' : '3'}
                    strokeDasharray={wire.isCut ? '6,6' : undefined}
                    opacity={
                      wire.isCut
                        ? isSearchMatch
                          ? 0.35
                          : 0.12
                        : isSearchMatch
                        ? 0.94
                        : 0.16
                    }
                    filter={(isHovered || (isSearchActive && isSearchMatch)) && !wire.isCut ? 'url(#wireGlow)' : undefined}
                    className="transition-all"
                  />

                  {/* Animated electron current flow particles (when powered & continuous based on voltage) */}
                  {(() => {
                    const srcVolt = nodeVoltages[wire.sourcePinId] ?? 0;
                    const tgtVolt = nodeVoltages[wire.targetPinId] ?? 0;
                    const avgVolt = (srcVolt + tgtVolt) / 2;
                    const isEnergized = isPowerOn && !wire.isCut && avgVolt > 0.4;

                    if (!isEnergized) return null;

                    return (
                      <g className="pointer-events-none">
                        {/* Energy glow stream */}
                        <path
                          d={pathD}
                          fill="none"
                          stroke={avgVolt > 10 ? '#f59e0b' : '#22c55e'}
                          strokeWidth="4.5"
                          opacity="0.35"
                          filter="url(#wireGlow)"
                        />
                        {/* Moving electron pulse particles */}
                        <path
                          d={pathD}
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth="2"
                          strokeDasharray="6,24"
                          className="animate-electron-flow"
                          style={{ animationDuration: `${0.75 / simulationSpeed}s` }}
                          opacity="0.95"
                        />
                      </g>
                    );
                  })()}

                  {/* Terminal Connection Beads */}
                  <circle cx={start.x} cy={start.y} r="3.5" fill={wire.isCut ? '#475569' : wire.color} />
                  <circle cx={end.x} cy={end.y} r="3.5" fill={wire.isCut ? '#475569' : wire.color} />

                  {/* Cut Wire Badge */}
                  {wire.isCut && (
                    <g transform={`translate(${midX}, ${midY})`}>
                      <circle r="11" fill="#dc2626" />
                      <Scissors className="w-3.5 h-3.5 text-white -translate-x-[7px] -translate-y-[7px]" />
                    </g>
                  )}

                  {/* Wire Interactive Hover Tooltip */}
                  {isHovered && editingWireId !== wire.id && (() => {
                    const isCustom = isCustomWireConnection(wire);
                    const boxWidth = isCustom ? 224 : 160;
                    return (
                      <g transform={`translate(${midX}, ${midY - 22})`} className="pointer-events-none">
                        <rect
                          x={-boxWidth / 2}
                          y="-14"
                          width={boxWidth}
                          height="28"
                          rx="2"
                          fill="#0d1016"
                          stroke="#f59e0b"
                          strokeWidth="1.2"
                          className="shadow-xl"
                        />
                        <text
                          x="0"
                          y="4"
                          fill="#e2e8f0"
                          fontSize="10"
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {isCustom
                            ? wire.isCut
                              ? 'Click wire to Repair · Label to Rename'
                              : 'Click wire to Cut · Label to Rename'
                            : wire.isCut
                            ? 'Click to Repair Harness Wire'
                            : 'Click to Cut Wire'}
                        </text>
                      </g>
                    );
                  })()}
                </g>
              );
            })}

            {/* Animated Virtual Multimeter Probe Leads & Flight Transitions */}
            <ProbeTransitionOverlay
              color="red"
              motionState={redAnimated}
              leadOrigin={{ x: 15, y: 20 }}
              instanceId="schematic"
            />
            <ProbeTransitionOverlay
              color="black"
              motionState={blackAnimated}
              leadOrigin={{ x: 15, y: 670 }}
              instanceId="schematic"
            />
          </svg>

          {/* HTML Overlay 1: ECU Module & Breakout Headers */}
          <div
            style={{
              position: 'absolute',
              top: `${ECU_BOX_Y}px`,
              left: `${ECU_BOX_X}px`,
              width: `${ECU_BOX_WIDTH}px`,
            }}
            className="bg-[#161a22] border border-[#343c4b] rounded-[3px] p-3 shadow-2xl"
          >
            {/* Header */}
            <div className="h-[36px] flex items-center justify-between border-b border-[#2a313d] pb-2 mb-2">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${isPowerOn ? 'bg-amber-400' : 'bg-slate-600'}`} />
                <span className="text-xs font-mono font-bold text-slate-100">ECU BREAKOUT</span>
              </div>
              <div className="flex items-center gap-1.5">
                {onOpenEcuPinouts && (
                  <button
                    onClick={onOpenEcuPinouts}
                    className="hw-btn text-[9px] font-mono text-slate-200 hover:text-amber-300 px-1.5 py-0.5 rounded-[2px] transition cursor-pointer"
                    title="Inspect Actual ECU Connector Socket & Pinout Tracking"
                  >
                    Socket View
                  </button>
                )}
                <span
                  className="text-[10px] font-mono text-slate-400 truncate max-w-[92px]"
                  title={
                    ecuProfileLabel && ecuProfileLabel !== 'Universal 16-Pin'
                      ? `${ecuProfileLabel} (Simulated Bench Node Model)`
                      : 'Universal 16-Pin Trainer (Non-OEM · Distinct from SAE J1962 OBD-II DLC)'
                  }
                >
                  {ecuProfileLabel || 'Trainer 16-Pin'}
                </span>
              </div>
            </div>

            {/* Pin Rows */}
            <div className="flex flex-col gap-1">
              {pins.map(pin => {
                const isSelected = selectedPinId === pin.id;
                const isWireSource = wireSourcePin?.id === pin.id;
                const isMenuOpen = activePinMenuId === pin.id;
                const isPinSearchMatch = !isSearchActive || topologySearch.matchingPinIds.has(pin.id);
                const v = nodeVoltages[pin.id] !== undefined ? nodeVoltages[pin.id] : pin.nominalVoltage;

                const isRedProbe = multimeter.redProbe.attachedToPinId === pin.id;
                const isBlackProbe = multimeter.blackProbe.attachedToPinId === pin.id;

                const activePinFault = faults.find(
                  (f) => f.pinId === pin.id && f.faultType !== 'NONE'
                );
                const activeFaultMeta = activePinFault
                  ? getPinFaultMeta(activePinFault.faultType)
                  : null;
                const isCriticalFault = activeFaultMeta?.severity === 'critical';

                let categoryBg = 'bg-[#0e1117] border-[#29303c] text-slate-300';
                if (pin.category === 'ground') categoryBg = 'border-stone-700 text-stone-300 bg-[#141311]';
                if (pin.category === 'power') categoryBg = 'border-amber-800/80 text-amber-300 bg-amber-950/35';
                if (pin.category === 'reference') categoryBg = 'border-yellow-800/80 text-yellow-300 bg-yellow-950/30';
                if (pin.category === 'communication') categoryBg = 'border-emerald-800/70 text-emerald-300 bg-emerald-950/25';

                const faultSurfaceOverride = activePinFault
                  ? isCriticalFault
                    ? 'border-rose-500 bg-rose-950/55 text-rose-100 ring-1 ring-rose-500/80 animate-pulse shadow-[0_0_12px_rgba(244,63,94,0.38)]'
                    : 'border-amber-400 bg-amber-950/50 text-amber-100 ring-1 ring-amber-400/75 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                  : '';

                return (
                  <div
                    key={pin.id}
                    className={`group relative h-[32px] transition-opacity ${
                      isPinSearchMatch ? 'opacity-100' : 'opacity-35'
                    }`}
                    onMouseEnter={() => setHoveredEcuPinId(pin.id)}
                    onMouseLeave={() => setHoveredEcuPinId(null)}
                  >
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => handlePinAction(pin.id, pin.label)}
                      className={`h-full flex items-center justify-between px-2 rounded-[2px] border text-[11px] font-mono cursor-pointer transition ${
                        activePinFault ? faultSurfaceOverride : categoryBg
                      } ${
                        !activePinFault && isSelected
                          ? 'ring-1 ring-amber-400 border-amber-400 font-bold'
                          : !activePinFault && isSearchActive && isPinSearchMatch
                          ? 'ring-1 ring-emerald-400 border-emerald-400 font-bold'
                          : !activePinFault
                          ? 'hover:border-[#4c5669]'
                          : ''
                      } ${isWireSource ? 'ring-2 ring-amber-400 animate-pulse' : ''}`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                        <span
                          className={`text-[10px] font-mono w-4 shrink-0 ${
                            activePinFault
                              ? isCriticalFault
                                ? 'text-rose-300 font-bold'
                                : 'text-amber-300 font-bold'
                              : 'text-slate-500'
                          }`}
                        >
                          {pin.pinNumber}
                        </span>
                        <span className="font-semibold truncate">{pin.label}</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Inline Active Fault Badge + One-Click Clear Button */}
                        {activePinFault && activeFaultMeta && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className={`inline-flex items-center gap-0.5 rounded-[2px] border px-1 py-0.5 text-[8.5px] font-bold tracking-tight ${
                              isCriticalFault
                                ? 'border-rose-400/80 bg-rose-900/80 text-rose-100'
                                : 'border-amber-400/80 bg-amber-900/75 text-amber-100'
                            }`}
                            title={`Active Fault: ${activeFaultMeta.label} (${activePinFault.description})`}
                          >
                            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                            <span>{activeFaultMeta.shortCode}</span>
                            {onRemoveFault && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveFault(pin.id);
                                }}
                                aria-label={`Clear ${activeFaultMeta.label} fault on Pin ${pin.pinNumber} (${pin.label})`}
                                title={`Clear ${activeFaultMeta.label} fault`}
                                className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-[2px] bg-black/40 hover:bg-black/75 text-white transition cursor-pointer"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Quick Fault Menu Icon Button */}
                        {onAddFault && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectPin(pin.id);
                              setActivePinMenuId((prev) => (prev === pin.id ? null : pin.id));
                            }}
                            aria-label={`Quick Fault menu for Pin ${pin.pinNumber} (${pin.label})`}
                            title={
                              activePinFault && activeFaultMeta
                                ? `Fault Active (${activeFaultMeta.label}) — Click to change or clear fault`
                                : `Quick Fault Menu — Inject short or open circuit on ${pin.label}`
                            }
                            className={`inline-flex h-5 w-5 items-center justify-center rounded-[2px] border transition cursor-pointer ${
                              activePinFault
                                ? isCriticalFault
                                  ? 'border-rose-400/80 bg-rose-900/70 text-rose-200 hover:bg-rose-800'
                                  : 'border-amber-400/80 bg-amber-900/70 text-amber-200 hover:bg-amber-800'
                                : isMenuOpen
                                ? 'border-amber-400/70 bg-amber-950/70 text-amber-300 opacity-100'
                                : 'border-[#333c4d] bg-[#12161f] text-slate-400 opacity-75 group-hover:opacity-100 hover:border-amber-400/60 hover:text-amber-300'
                            }`}
                          >
                            <ZapOff className="w-2.5 h-2.5" />
                          </button>
                        )}

                        <span
                          className={`text-[10px] tabular-nums ${
                            activePinFault
                              ? isCriticalFault
                                ? 'text-rose-200 font-bold'
                                : 'text-amber-200 font-bold'
                              : 'text-slate-300'
                          }`}
                        >
                          {v.toFixed(1)}V
                        </span>

                        {/* Terminal Jack Circle */}
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${
                            isWireSource
                              ? 'bg-amber-400 border-white'
                              : isRedProbe
                              ? 'bg-rose-500 border-white ring-2 ring-rose-400 animate-pulse shadow-sm shadow-rose-500/50'
                              : isBlackProbe
                              ? 'bg-slate-700 border-white ring-2 ring-slate-400 animate-pulse shadow-sm shadow-slate-400/50'
                              : activePinFault
                              ? isCriticalFault
                                ? 'bg-rose-500 border-rose-200 ring-1 ring-rose-400'
                                : 'bg-amber-400 border-amber-100 ring-1 ring-amber-300'
                              : 'bg-[#1a1f28] border-[#4b5567] group-hover:border-amber-400'
                          }`}
                        >
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${
                              isRedProbe
                                ? 'bg-white'
                                : isBlackProbe
                                ? 'bg-slate-200'
                                : activePinFault
                                ? 'bg-[#0b0d11]'
                                : 'bg-[#0b0d11]'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Lead Probe Indicators */}
                      {(isRedProbe || isBlackProbe) && (
                        <div className="absolute -left-3 flex flex-col gap-0.5">
                          {isRedProbe && <div className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white" />}
                          {isBlackProbe && <div className="w-2.5 h-2.5 rounded-full bg-slate-300 ring-2 ring-black" />}
                        </div>
                      )}
                    </div>

                    {/* Interactive ECU Pin Tooltip on Hover */}
                    {hoveredEcuPinId === pin.id && !isMenuOpen && !wireSourcePin && (
                      <div
                        className="absolute left-[244px] top-1/2 -translate-y-1/2 z-40 w-64 bg-[#141820] border border-[#4a5466] rounded-[3px] p-2.5 shadow-2xl pointer-events-none transition-all duration-150"
                      >
                        {/* Header: Pin Number, Label, Category */}
                        <div className="flex items-center justify-between border-b border-[#2b323e] pb-1.5 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-[2px] bg-[#0c0f14] border border-amber-500/60 font-bold flex items-center justify-center text-amber-300 text-[10px]">
                              #{pin.pinNumber}
                            </span>
                            <span className="font-bold text-slate-100 text-xs tracking-tight">
                              {pin.label}
                            </span>
                          </div>
                          <span className="text-[9px] font-semibold uppercase text-slate-300 bg-[#0e1218] border border-[#303744] px-1.5 py-0.5 rounded-[2px]">
                            {pin.category.replace('_', ' ')}
                          </span>
                        </div>

                        {/* Active Fault Alert Banner in Tooltip */}
                        {activePinFault && activeFaultMeta && (
                          <div
                            className={`mb-2 rounded-[2px] border px-2 py-1.5 text-[10px] ${
                              isCriticalFault
                                ? 'border-rose-500/75 bg-rose-950/80 text-rose-100'
                                : 'border-amber-400/75 bg-amber-950/80 text-amber-100'
                            }`}
                          >
                            <div className="flex items-center justify-between font-bold uppercase tracking-wider text-[9.5px]">
                              <span className="inline-flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>ACTIVE FAULT: {activeFaultMeta.shortCode}</span>
                              </span>
                              <span>CLICK × TO CLEAR</span>
                            </div>
                            <div className="mt-0.5 text-[9.5px] opacity-90">
                              {activeFaultMeta.label} — {activePinFault.description}
                            </div>
                          </div>
                        )}

                        {/* Full Pin Name */}
                        <div className="text-[11px] font-semibold text-slate-200 mb-1 leading-tight">
                          {pin.name}
                        </div>

                        {/* Purpose / Description */}
                        <div className="text-[10px] text-slate-400 font-sans leading-relaxed mb-2">
                          <strong className="text-slate-300 font-mono text-[9px] uppercase tracking-wider block">PURPOSE:</strong>
                          {pin.description}
                        </div>

                        {/* Voltage & Electrical Stats */}
                        <div className="bg-slate-950 p-1.5 rounded border border-slate-800 flex items-center justify-between text-[10px] mb-1.5">
                          <div className="flex flex-col">
                            <span className="text-[9px] text-slate-500 uppercase tracking-wider">CURRENT VOLTAGE</span>
                            <span className="text-amber-400 font-bold text-xs tabular-nums">
                              {v.toFixed(2)} V
                            </span>
                          </div>
                          <div className="flex flex-col text-right">
                            <span className="text-[9px] text-slate-500 uppercase tracking-wider">NOMINAL / IMPEDANCE</span>
                            <span className="text-slate-300 font-medium text-[10px] tabular-nums">
                              {pin.nominalVoltage.toFixed(1)}V · {pin.internalResistance >= 1000 ? `${(pin.internalResistance / 1000).toFixed(1)}kΩ` : `${pin.internalResistance}Ω`}
                            </span>
                          </div>
                        </div>

                        {/* Multimeter Probes Indicator */}
                        {(isRedProbe || isBlackProbe) && (
                          <div className="flex flex-col gap-0.5 text-[9px] border-t border-slate-800/80 pt-1">
                            {isRedProbe && (
                              <span className="text-rose-400 font-semibold flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                Red Multimeter Probe (+) Attached
                              </span>
                            )}
                            {isBlackProbe && (
                              <span className="text-slate-300 font-semibold flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                Black COM Multimeter Probe (-) Attached
                              </span>
                            )}
                          </div>
                        )}

                        {/* Indicator Pointer */}
                        <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#141820] border-l border-b border-[#4a5466] rotate-45" />
                      </div>
                    )}

                    {/* Contextual Pin Menu Popover + Integrated Quick Fault Menu */}
                    {isMenuOpen && (
                      <div
                        onPointerDown={(e) => e.stopPropagation()}
                        className="absolute left-[242px] top-0 z-30 w-56 bg-[#141820] border border-[#3e4756] rounded-[3px] p-1.5 shadow-2xl flex flex-col gap-1 text-[10px] font-mono"
                      >
                        <div className="flex items-center justify-between border-b border-[#28303e] px-1.5 pb-1">
                          <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-300">
                            Pin #{pin.pinNumber} · {pin.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => setActivePinMenuId(null)}
                            aria-label="Close pin menu"
                            className="rounded-[2px] p-0.5 text-slate-400 hover:bg-[#232934] hover:text-white cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          onClick={() => {
                            onAttachProbe('red', pin.id, `${pin.label} (${pin.name})`);
                            setActivePinMenuId(null);
                          }}
                          className="px-2 py-1 text-left text-rose-300 hover:bg-rose-950/60 rounded-[2px] flex items-center gap-1.5 cursor-pointer"
                        >
                          <Disc className="w-3 h-3 text-rose-400 shrink-0" />
                          <span>Attach Red Probe (+)</span>
                        </button>
                        <button
                          onClick={() => {
                            onAttachProbe('black', pin.id, `${pin.label} (${pin.name})`);
                            setActivePinMenuId(null);
                          }}
                          className="px-2 py-1 text-left text-slate-300 hover:bg-[#232934] rounded-[2px] flex items-center gap-1.5 cursor-pointer"
                        >
                          <Disc className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>Attach Black COM (-)</span>
                        </button>
                        <button
                          onClick={() => {
                            setWireSourcePin({ id: pin.id, label: pin.label });
                            setActivePinMenuId(null);
                          }}
                          className="px-2 py-1 text-left text-amber-300 hover:bg-amber-950/40 rounded-[2px] flex items-center gap-1.5 cursor-pointer"
                        >
                          <Link2 className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>Route Wire From Here</span>
                        </button>

                        {/* Quick Fault Injection Section */}
                        {(onAddFault || onRemoveFault) && (
                          <div className="mt-1 border-t border-[#2b3342] pt-1.5 flex flex-col gap-1">
                            <div className="flex items-center justify-between px-1.5">
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                                <ZapOff className="w-2.5 h-2.5 text-amber-400" />
                                <span>Quick Fault Injection</span>
                              </span>
                              {activePinFault && activeFaultMeta && (
                                <span
                                  className={`rounded-[2px] px-1 py-0.2 text-[8.5px] font-bold ${
                                    isCriticalFault
                                      ? 'bg-rose-900/80 text-rose-200 border border-rose-500/60'
                                      : 'bg-amber-900/80 text-amber-200 border border-amber-500/60'
                                  }`}
                                >
                                  {activeFaultMeta.shortCode}
                                </span>
                              )}
                            </div>

                            {activePinFault && onRemoveFault && (
                              <button
                                type="button"
                                onClick={() => {
                                  onRemoveFault(pin.id);
                                  setActivePinMenuId(null);
                                }}
                                className="px-2 py-1 text-left font-bold text-emerald-200 bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-500/60 rounded-[2px] flex items-center justify-between gap-1.5 cursor-pointer"
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                  <span>Clear Fault (Restore Nominal)</span>
                                </span>
                                <span className="text-[8.5px] uppercase text-emerald-300">OK</span>
                              </button>
                            )}

                            {onAddFault &&
                              QUICK_PIN_FAULT_PRESETS.map((preset) => {
                                const isThisFaultActive = activePinFault?.faultType === preset.type;
                                const isCrit = preset.severity === 'critical';
                                return (
                                  <button
                                    key={preset.type}
                                    type="button"
                                    onClick={() => {
                                      if (isThisFaultActive && onRemoveFault) {
                                        onRemoveFault(pin.id);
                                      } else {
                                        onAddFault(pin.id, preset.type, preset.description);
                                      }
                                      setActivePinMenuId(null);
                                    }}
                                    className={`px-2 py-1 text-left rounded-[2px] border flex items-center justify-between gap-1.5 transition cursor-pointer ${
                                      isThisFaultActive
                                        ? isCrit
                                          ? 'border-rose-400 bg-rose-900/75 text-rose-100 font-bold'
                                          : 'border-amber-400 bg-amber-900/75 text-amber-100 font-bold'
                                        : isCrit
                                        ? 'border-transparent text-rose-200/90 hover:border-rose-500/50 hover:bg-rose-950/50'
                                        : 'border-transparent text-amber-200/90 hover:border-amber-500/50 hover:bg-amber-950/45'
                                    }`}
                                    title={preset.description}
                                  >
                                    <span className="inline-flex items-center gap-1.5 truncate">
                                      <AlertTriangle
                                        className={`w-2.5 h-2.5 shrink-0 ${
                                          isCrit ? 'text-rose-400' : 'text-amber-400'
                                        }`}
                                      />
                                      <span className="truncate">{preset.label}</span>
                                    </span>
                                    <span
                                      className={`shrink-0 rounded-[2px] px-1 py-0.5 text-[8.5px] font-bold ${
                                        isCrit
                                          ? 'bg-rose-950/90 text-rose-300 border border-rose-500/40'
                                          : 'bg-amber-950/90 text-amber-300 border border-amber-500/40'
                                      }`}
                                    >
                                      {preset.shortCode}
                                    </span>
                                  </button>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* HTML Overlay 2: Bench Components */}
          {components.map(comp => {
            const p0 = comp.pins[0]?.id ? (nodeVoltages[comp.pins[0].id] ?? 0) : 0;
            const p1 = comp.pins[1]?.id ? (nodeVoltages[comp.pins[1].id] ?? 0) : p0;
            const vDrop = Math.abs(p0 - p1);
            const estResistance = comp.type === 'resistor' ? Number(comp.state?.resistanceOhms || 1000) : comp.type === 'led' ? 680 : comp.type === 'diode' ? 100000 : 50;
            const currentMa = estResistance > 0 ? (vDrop / estResistance) * 1000 : 0;
            const powerMw = vDrop * currentMa;
            const estTempC = 25 + (powerMw / 50);

            const isCompSearchMatch =
              !isSearchActive ||
              topologySearch.matchingComponentIds.has(comp.id) ||
              comp.pins.some((cp) => topologySearch.matchingPinIds.has(cp.id));

            return (
              <div
                key={comp.id}
                style={{
                  position: 'absolute',
                  left: `${comp.x}px`,
                  top: `${comp.y}px`,
                  width: `${COMP_WIDTH}px`,
                }}
                className={`bg-[#161a22] border rounded-[3px] p-3 shadow-xl relative group/compCard transition-opacity ${
                  isSearchActive && isCompSearchMatch
                    ? 'border-amber-400 ring-1 ring-amber-400/70 opacity-100'
                    : isCompSearchMatch
                    ? 'border-[#343c4b] opacity-100'
                    : 'border-[#252b36] opacity-35'
                }`}
                onMouseEnter={() => setHoveredCompCardId(comp.id)}
                onMouseLeave={() => setHoveredCompCardId(null)}
              >
                {/* Interactive Real-Time Operational Status Hover Tooltip */}
                {hoveredCompCardId === comp.id && (
                  <div className="absolute -top-2.5 translate-y-[-100%] left-0 right-0 z-50 bg-[#12161d] border border-[#4a5466] rounded-[3px] p-3 shadow-2xl pointer-events-none text-xs font-mono">
                    <div className="flex items-center justify-between border-b border-[#2b323e] pb-1.5 mb-2">
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="font-bold text-slate-100 uppercase tracking-wider">{comp.name}</span>
                      </div>
                      <span className="text-[9px] uppercase font-semibold text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded-[2px] border border-amber-700/60">
                        LIVE
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                      <div className="hw-lcd-well p-1.5 rounded-[2px] flex flex-col">
                        <span className="text-[9px] text-slate-400 uppercase">Voltage Drop:</span>
                        <span className="text-amber-400 font-bold tabular-nums">{vDrop.toFixed(2)} V</span>
                      </div>
                      <div className="hw-lcd-well p-1.5 rounded-[2px] flex flex-col">
                        <span className="text-[9px] text-slate-400 uppercase">Current Load:</span>
                        <span className="text-emerald-400 font-bold tabular-nums">{currentMa.toFixed(1)} mA</span>
                      </div>
                      <div className="hw-lcd-well p-1.5 rounded-[2px] flex flex-col">
                        <span className="text-[9px] text-slate-400 uppercase">Junction Temp:</span>
                        <span className={`font-bold tabular-nums ${estTempC >= 85 ? 'text-rose-400' : estTempC >= 60 ? 'text-amber-400' : 'text-slate-200'}`}>
                          {estTempC.toFixed(1)} °C
                        </span>
                      </div>
                      <div className="hw-lcd-well p-1.5 rounded-[2px] flex flex-col">
                        <span className="text-[9px] text-slate-400 uppercase">Firing / State:</span>
                        <span className="text-emerald-300 font-semibold truncate">
                          {comp.type === 'led' ? (vDrop >= 1.7 ? 'EMITTING' : 'OFF') :
                           comp.type === 'switch' ? (comp.state?.isOpen ? 'OPEN' : 'CLOSED') :
                           comp.id.includes('inj') ? (hasInjectorFault ? 'FAULTED' : isPowerOn ? 'PULSING' : 'STANDBY') :
                           comp.type === 'potentiometer' ? `${comp.state?.wiperPercent ?? 50}% Wiper` :
                           comp.id.includes('tps') ? `${comp.state?.throttleAnglePercent ?? 20}% TPS` :
                           comp.id.includes('map') ? `${comp.state?.pressureKpa ?? 42} kPa` :
                           comp.id.includes('ect') ? `${comp.state?.tempCelsius ?? 85}°C` :
                           'ACTIVE'}
                        </span>
                      </div>
                    </div>
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-[-6px] w-3 h-3 bg-[#12161d] border-r border-b border-[#4a5466] rotate-45" />
                  </div>
                )}
                {/* Component Card Header (Draggable on bench) */}
                <div
                  onPointerDown={(e) => handleComponentHeaderPointerDown(e, comp)}
                  className="h-[34px] flex items-center justify-between border-b border-[#2a313d] pb-1.5 mb-2 cursor-grab active:cursor-grabbing group/header"
                  title="Drag component header to reposition on bench"
                >
                <div className="flex items-center gap-1.5 min-w-0 pr-1">
                  <GripVertical className="w-3.5 h-3.5 text-slate-500 group-hover/header:text-amber-400 shrink-0" />
                  <span className="text-xs font-mono font-semibold text-slate-200 truncate">{comp.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">{comp.type}</span>
                  {comp.isAuxiliary && onDeleteComponent && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteComponent(comp.id);
                      }}
                      className="p-1 rounded-[2px] hover:bg-rose-950/80 text-slate-500 hover:text-rose-400 transition cursor-pointer"
                      title="Remove component from bench"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Component Pin Terminal Rows */}
              <div className="flex flex-col gap-1 mb-2">
                {comp.pins.map(cp => {
                  const isSelected = selectedPinId === cp.id;
                  const isWireSource = wireSourcePin?.id === cp.id;
                  const isMenuOpen = activePinMenuId === cp.id;
                  const v = nodeVoltages[cp.id] !== undefined ? nodeVoltages[cp.id] : 0.0;
                  const isRedProbe = multimeter.redProbe.attachedToPinId === cp.id;
                  const isBlackProbe = multimeter.blackProbe.attachedToPinId === cp.id;

                  return (
                    <div
                      key={cp.id}
                      className="relative h-[30px]"
                      onMouseEnter={() => setHoveredCompPinId(cp.id)}
                      onMouseLeave={() => setHoveredCompPinId(null)}
                    >
                      <div
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => handlePinAction(cp.id, `${comp.name}: ${cp.label}`)}
                        className={`h-full flex items-center justify-between px-2 rounded-[2px] border text-[10px] font-mono cursor-pointer transition bg-[#0e1117] ${
                          isSelected ? 'ring-1 ring-amber-400 border-amber-400 text-white' : 'border-[#29303c] text-slate-300 hover:border-[#4c5669]'
                        } ${isWireSource ? 'ring-1 ring-amber-400 animate-pulse' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          {/* Left Terminal Jack */}
                          <div
                            className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${
                              isWireSource
                                ? 'bg-amber-400 border-white'
                                : isRedProbe
                                ? 'bg-rose-500 border-white ring-2 ring-rose-400 animate-pulse shadow-sm shadow-rose-500/50'
                                : isBlackProbe
                                ? 'bg-slate-700 border-white ring-2 ring-slate-400 animate-pulse shadow-sm shadow-slate-400/50'
                                : 'bg-[#1a1f28] border-[#4b5567]'
                            }`}
                          >
                            <div className={`w-1.5 h-1.5 rounded-full ${isRedProbe ? 'bg-white' : isBlackProbe ? 'bg-slate-200' : 'bg-[#0b0d11]'}`} />
                          </div>
                          <span>{cp.label}</span>
                        </div>
                        <span className="text-slate-300 tabular-nums">{v.toFixed(2)}V</span>

                        {(isRedProbe || isBlackProbe) && (
                          <div className="absolute -left-2.5 flex flex-col gap-0.5">
                            {isRedProbe && <div className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-1 ring-white" />}
                            {isBlackProbe && <div className="w-2.5 h-2.5 rounded-full bg-slate-300 ring-1 ring-black" />}
                          </div>
                        )}
                      </div>

                      {/* Interactive Component Pin Tooltip on Hover */}
                      {hoveredCompPinId === cp.id && !isMenuOpen && !wireSourcePin && (
                        <div
                          className="absolute left-[236px] top-1/2 -translate-y-1/2 z-40 w-56 bg-[#141820] border border-[#4a5466] rounded-[3px] p-2 shadow-2xl pointer-events-none transition-all duration-150"
                        >
                          <div className="flex items-center justify-between border-b border-[#2b323e] pb-1 mb-1">
                            <span className="font-bold text-slate-100 text-[11px] truncate">{comp.name}</span>
                            <span className="text-[9px] uppercase font-semibold text-slate-300 bg-[#0e1218] px-1 rounded-[2px] border border-[#303744]">
                              {cp.type}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-300 font-semibold mb-1">
                            Terminal: {cp.label}
                          </div>
                          <div className="hw-lcd-well p-1.5 rounded-[2px] flex items-center justify-between text-[10px]">
                            <span className="text-[9px] text-slate-400 uppercase">CURRENT VOLTAGE:</span>
                            <span className="text-amber-400 font-bold tabular-nums">{v.toFixed(2)} V</span>
                          </div>
                          <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#141820] border-l border-b border-[#4a5466] rotate-45" />
                        </div>
                      )}

                      {/* Component Contextual Menu */}
                      {isMenuOpen && (
                        <div
                          onPointerDown={(e) => e.stopPropagation()}
                          className="absolute left-[236px] top-0 z-30 w-44 bg-[#141820] border border-[#3e4756] rounded-[2px] p-1.5 shadow-2xl flex flex-col gap-1 text-[10px] font-mono"
                        >
                          <button
                            onClick={() => {
                              onAttachProbe('red', cp.id, `${comp.name}: ${cp.label}`);
                              setActivePinMenuId(null);
                            }}
                            className="px-2 py-1 text-left text-rose-300 hover:bg-rose-950/60 rounded-[2px] flex items-center gap-1.5 cursor-pointer"
                          >
                            <Disc className="w-3 h-3 text-rose-400" />
                            <span>Attach Red Probe (+)</span>
                          </button>
                          <button
                            onClick={() => {
                              onAttachProbe('black', cp.id, `${comp.name}: ${cp.label}`);
                              setActivePinMenuId(null);
                            }}
                            className="px-2 py-1 text-left text-slate-300 hover:bg-[#232934] rounded-[2px] flex items-center gap-1.5 cursor-pointer"
                          >
                            <Disc className="w-3 h-3 text-slate-400" />
                            <span>Attach Black COM (-)</span>
                          </button>
                          <button
                            onClick={() => {
                              setWireSourcePin({ id: cp.id, label: `${comp.name}: ${cp.label}` });
                              setActivePinMenuId(null);
                            }}
                            className="px-2 py-1 text-left text-amber-300 hover:bg-amber-950/40 rounded-[2px] flex items-center gap-1.5 cursor-pointer"
                          >
                            <Link2 className="w-3 h-3 text-amber-400" />
                            <span>Route Wire From Here</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Live Physical Component Controls */}
              {comp.id === 'comp-tps' && (
                <div className="hw-lcd-well p-2 rounded-[2px] text-[10px] font-mono flex flex-col gap-1 mt-1">
                  <RotaryEncoderDial
                    label="THROTTLE ANGLE"
                    value={(comp.state?.throttleAnglePercent as number) ?? 20}
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
                      onUpdateComponentState(comp.id, { throttleAnglePercent: nextVal })
                    }
                  />
                  <div className="text-[9px] text-slate-500 flex justify-between">
                    <span>Closed (0.5V)</span>
                    <span>WOT (4.5V)</span>
                  </div>
                </div>
              )}

              {comp.id === 'comp-map' && (
                <div className="hw-lcd-well p-2 rounded-[2px] text-[10px] font-mono flex flex-col gap-1 mt-1">
                  <RotaryEncoderDial
                    label="MANIFOLD PRESS"
                    value={(comp.state?.pressureKpa as number) ?? 42}
                    min={20}
                    max={100}
                    step={1}
                    unit="kPa"
                    accent="green"
                    size="sm"
                    inlineFlankButtons={{
                      dec: { label: '-5', delta: -5 },
                      inc: { label: '+5', delta: 5 },
                    }}
                    onChange={(nextVal) =>
                      onUpdateComponentState(comp.id, { pressureKpa: nextVal })
                    }
                  />
                  <div className="text-[9px] text-slate-500 flex justify-between">
                    <span>Idle Vac (20 kPa)</span>
                    <span>Atmo (100 kPa)</span>
                  </div>
                </div>
              )}

              {comp.id === 'comp-ect' && (
                <div className="hw-lcd-well p-2 rounded-[2px] text-[10px] font-mono flex flex-col gap-1 mt-1">
                  <RotaryEncoderDial
                    label="COOLANT TEMP"
                    value={(comp.state?.tempCelsius as number) ?? 85}
                    min={10}
                    max={115}
                    step={1}
                    unit="°C"
                    accent="amber"
                    size="sm"
                    inlineFlankButtons={{
                      dec: { label: '-5°', delta: -5 },
                      inc: { label: '+5°', delta: 5 },
                    }}
                    onChange={(nextVal) =>
                      onUpdateComponentState(comp.id, { tempCelsius: nextVal })
                    }
                  />
                  <div className="text-[9px] text-slate-500 flex justify-between">
                    <span>Cold (10°C / 2.5kΩ)</span>
                    <span>Hot (90°C / 250Ω)</span>
                  </div>
                </div>
              )}

              {comp.id === 'comp-inj' && (() => {
                const isFiring = Boolean(comp.state?.isFiring ?? true);
                return (
                  <div className="bg-slate-950 p-2 rounded-md border border-slate-800 text-[10px] font-mono flex items-center justify-between mt-1">
                    <span className="text-slate-400">PULSE:</span>
                    {!isPowerOn ? (
                      <span className="text-slate-500 font-semibold">STANDBY (0V)</span>
                    ) : hasInjectorFault ? (
                      <span className="text-rose-400 font-semibold">FAULTED (P0201)</span>
                    ) : isFiring ? (
                      <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        PULSING 2.5ms
                      </span>
                    ) : (
                      <span className="text-amber-400 font-semibold">PAUSED</span>
                    )}
                  </div>
                );
              })()}

              {comp.id === 'comp-relay' && (() => {
                const isLatched = Boolean(comp.state?.isLatched ?? true);
                return (
                  <div className="hw-lcd-well p-2 rounded-[2px] text-[10px] font-mono flex items-center justify-between mt-1">
                    <span className="text-slate-400">CONTACTS:</span>
                    {isPowerOn && isLatched ? (
                      <span className="text-emerald-400 font-semibold">LATCHED 30&rarr;87</span>
                    ) : (
                      <span className="text-amber-400 font-semibold">OPEN 30-/-87</span>
                    )}
                  </div>
                );
              })()}

              {comp.id === 'comp-can' && (
                <div className="hw-lcd-well p-2 rounded-[2px] text-[10px] font-mono flex items-center justify-between text-slate-400 mt-1">
                  <span>RESISTOR:</span>
                  <span className="text-emerald-400 font-semibold">120Ω SPLIT (ISO 11898)</span>
                </div>
              )}

              {/* Auxiliary Component Visual Feedback & Interactive Controls */}
              {comp.type === 'led' && (() => {
                const pAnodeId = comp.pins[0]?.id;
                const pCathodeId = comp.pins[1]?.id;
                const vAnode = pAnodeId ? (nodeVoltages[pAnodeId] ?? 0) : 0;
                const vCathode = pCathodeId ? (nodeVoltages[pCathodeId] ?? 0) : 0;
                const vDiff = vAnode - vCathode;
                const isLit = isPowerOn && vDiff >= 1.7;
                const ledColor = (comp.state?.color as string) || 'green';
                const ballastR = Number(comp.state?.seriesResistorOhms ?? 680);
                const currentMa = isLit ? Math.max(0, ((vDiff - 1.8) / ballastR) * 1000) : 0;

                const colorConfig: Record<string, { bg: string; glow: string; text: string }> = {
                  green: { bg: '#22c55e', glow: 'rgba(34, 197, 94, 0.85)', text: 'text-emerald-400' },
                  red: { bg: '#ef4444', glow: 'rgba(239, 68, 68, 0.85)', text: 'text-rose-400' },
                  blue: { bg: '#38bdf8', glow: 'rgba(56, 189, 248, 0.85)', text: 'text-sky-400' },
                  purple: { bg: '#a855f7', glow: 'rgba(168, 85, 247, 0.85)', text: 'text-purple-400' },
                };
                const theme = colorConfig[ledColor] || colorConfig.green;

                return (
                  <div className="hw-lcd-well p-2 rounded-[2px] text-[10px] font-mono flex items-center justify-between mt-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded-full border border-white/40 transition-all duration-150 flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: isLit ? theme.bg : '#1e293b',
                          boxShadow: isLit ? `0 0 10px ${theme.glow}, 0 0 20px ${theme.glow}` : 'none',
                        }}
                      >
                        {isLit && <div className="w-1.5 h-1.5 rounded-full bg-white opacity-95" />}
                      </div>
                      <span className="text-slate-400">LED:</span>
                    </div>
                    {isLit ? (
                      <span className={`font-bold ${theme.text} tabular-nums`}>
                        ON ({vDiff.toFixed(1)}V / {currentMa.toFixed(0)}mA)
                      </span>
                    ) : (
                      <span className="text-slate-500">OFF (0 mA)</span>
                    )}
                  </div>
                );
              })()}

              {comp.type === 'switch' && (() => {
                const isOpen = Boolean(comp.state?.isOpen);
                const isFused = Boolean(comp.libraryTemplateId === 'lib-jumper-fused-10a');
                return (
                  <div className="hw-lcd-well p-2 rounded-[2px] text-[10px] font-mono flex items-center justify-between mt-1">
                    <span className="text-slate-400">{isFused ? 'FUSED JUMPER:' : 'CONTACT:'}</span>
                    <button
                      onClick={() => onUpdateComponentState(comp.id, { isOpen: !isOpen })}
                      className={`px-2 py-0.5 rounded-[2px] font-bold cursor-pointer transition flex items-center gap-1.5 ${
                        isOpen
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-700/80 hover:bg-amber-900'
                          : 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 hover:bg-emerald-900'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${isOpen ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                      <span>{isOpen ? 'OPEN' : 'CLOSED'}</span>
                    </button>
                  </div>
                );
              })()}

              {comp.type === 'resistor' && comp.isAuxiliary && (
                <div className="hw-lcd-well p-2 rounded-[2px] text-[10px] font-mono flex items-center justify-between mt-1">
                  <span className="text-slate-400">RESISTANCE:</span>
                  <span className="text-slate-200 font-bold tabular-nums">
                    {Number(comp.state?.resistanceOhms) >= 1000
                      ? `${(Number(comp.state?.resistanceOhms) / 1000).toFixed(1)} kΩ`
                      : `${comp.state?.resistanceOhms ?? 1000} Ω`}
                  </span>
                </div>
              )}

              {comp.type === 'diode' && (() => {
                const p0 = comp.pins[0]?.id;
                const p1 = comp.pins[1]?.id;
                const v0 = p0 ? (nodeVoltages[p0] ?? 0) : 0;
                const v1 = p1 ? (nodeVoltages[p1] ?? 0) : 0;
                const vf = v0 - v1;
                const isForward = isPowerOn && vf > 0.3;
                return (
                  <div className="hw-lcd-well p-2 rounded-[2px] text-[10px] font-mono flex items-center justify-between mt-1">
                    <span className="text-slate-400">STATE:</span>
                    <span className={isForward ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                      {isForward ? `FORWARD (${vf.toFixed(2)}V)` : 'BLOCKING / REVERSE'}
                    </span>
                  </div>
                );
              })()}

              {comp.type === 'potentiometer' && (() => {
                const wiperVal = (comp.state?.wiperPercent as number) ?? 50;
                const wiperPinId = comp.pins[1]?.id;
                const wiperVolt = wiperPinId ? (nodeVoltages[wiperPinId] ?? 0) : 0;
                return (
                  <div className="hw-lcd-well p-2 rounded-[2px] text-[10px] font-mono flex flex-col gap-1 mt-1">
                    <RotaryEncoderDial
                      label={`WIPER (${wiperVolt.toFixed(2)}V)`}
                      value={wiperVal}
                      min={0}
                      max={100}
                      step={1}
                      unit="%"
                      accent="steel"
                      size="sm"
                      inlineFlankButtons={{
                        dec: { label: '-5%', delta: -5 },
                        inc: { label: '+5%', delta: 5 },
                      }}
                      onChange={(nextVal) =>
                        onUpdateComponentState(comp.id, { wiperPercent: nextVal })
                      }
                    />
                  </div>
                );
              })()}

              {comp.type === 'capacitor' && (
                <div className="hw-lcd-well p-2 rounded-[2px] text-[10px] font-mono flex items-center justify-between mt-1 text-slate-400">
                  <span>FILTER:</span>
                  <span className="text-emerald-300 font-bold">
                    {comp.state?.capacitanceUf ? `${comp.state.capacitanceUf} µF` : '100 nF MLCC'}
                  </span>
                </div>
              )}

              {comp.type === 'load' && (() => {
                const p0 = comp.pins[0]?.id;
                const p1 = comp.pins[1]?.id;
                const v0 = p0 ? (nodeVoltages[p0] ?? 0) : 0;
                const v1 = p1 ? (nodeVoltages[p1] ?? 0) : 0;
                const vDrop = Math.abs(v0 - v1);
                const isLit = isPowerOn && vDrop > 2.0;
                const isLamp = comp.id.includes('lamp') || comp.libraryTemplateId?.includes('lamp');
                return (
                  <div className="hw-lcd-well p-2 rounded-[2px] text-[10px] font-mono flex items-center justify-between mt-1">
                    <span className="text-slate-400">{isLamp ? 'FILAMENT:' : 'SOLENOID:'}</span>
                    <span className={isLit ? 'text-amber-300 font-bold flex items-center gap-1' : 'text-slate-500'}>
                      {isLit && <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />}
                      {isLit ? (isLamp ? '21W GLOWING' : 'DUMMY SINKING') : 'COLD (0W)'}
                    </span>
                  </div>
                );
              })()}
              </div>
            );
          })}

          {/* HTML Overlay 3: Inline-Editable Labels on Custom Wire Connections */}
          {customWireLabelAnchors.length > 0 && (
            <div className="absolute inset-0 pointer-events-none z-20">
              {customWireLabelAnchors.map(({ wire, x, y }) => {
                const isEditing = editingWireId === wire.id;
                return (
                  <div
                    key={`wire-label-${wire.id}`}
                    style={{
                      position: 'absolute',
                      left: `${x}px`,
                      top: `${y}px`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    className="pointer-events-auto"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onMouseEnter={() => setHoveredWireId(wire.id)}
                    onMouseLeave={() => setHoveredWireId((prev) => (prev === wire.id ? null : prev))}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1 rounded-[2px] border border-amber-400 bg-[#0d1016] px-1.5 py-0.5 shadow-xl">
                        <span
                          className="w-2 h-2 rounded-full shrink-0 border border-white/40"
                          style={{ backgroundColor: wire.isCut ? '#64748b' : wire.color }}
                        />
                        <input
                          ref={wireLabelInputRef}
                          type="text"
                          aria-label={`Rename wire ${wire.label}`}
                          maxLength={MAX_WIRE_LABEL_LENGTH}
                          value={editingWireLabelDraft}
                          onChange={(e) => setEditingWireLabelDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitEditingWireLabel(wire);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelEditingWireLabel();
                            }
                          }}
                          onBlur={() => commitEditingWireLabel(wire)}
                          className="w-40 bg-[#151a22] text-[10px] font-mono text-slate-100 px-1.5 py-0.5 rounded-[2px] border border-[#3a4352] focus:outline-none focus:border-amber-400"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => commitEditingWireLabel(wire)}
                          className="p-0.5 rounded-[2px] text-emerald-400 hover:bg-emerald-950/80 cursor-pointer"
                          title="Save wire label"
                          aria-label="Save wire label"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => cancelEditingWireLabel()}
                          className="p-0.5 rounded-[2px] text-slate-400 hover:text-rose-300 hover:bg-rose-950/60 cursor-pointer"
                          title="Cancel rename"
                          aria-label="Cancel rename"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditingWireLabel(wire)}
                        title={`${wire.label} — Click to rename custom wire`}
                        aria-label={`Rename custom wire: ${wire.label}`}
                        className={`group/wireLabel flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-[10px] font-mono shadow-lg transition cursor-pointer ${
                          wire.isCut
                            ? 'bg-[#0e1117]/95 border-rose-700/70 text-slate-300 hover:border-amber-400'
                            : 'bg-[#0e1117]/95 border-[#384150] text-slate-100 hover:border-amber-400 hover:text-amber-200'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0 border border-white/40"
                          style={{ backgroundColor: wire.isCut ? '#64748b' : wire.color }}
                        />
                        <span className="max-w-[170px] truncate">{wire.label}</span>
                        <Pencil className="w-2.5 h-2.5 text-slate-400 group-hover/wireLabel:text-amber-300 shrink-0" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
      </div>
      )}

      {/* Docked 3-Module Harness Diagnostics Console */}
      <HarnessDiagnosticsDeck
        pins={pins}
        wires={wires}
        nodeVoltages={nodeVoltages}
        wireCurrentsMa={wireCurrentsMa}
        faults={faults}
        activeDTCs={activeDTCs}
        selectedPinId={selectedPinId}
        isPowerOn={isPowerOn}
        isSupplyTripped={isSupplyTripped}
        rpmEmulator={rpmEmulator}
        gaugeTransportMode={gaugeTransportMode}
        expandedByDefault={expandedDiagnosticsByDefault}
        onSelectPin={onSelectPin}
        onAttachProbe={onAttachProbe}
        onToggleCutWire={onToggleCutWire}
        onRemoveFault={onRemoveFault}
        onClearAllFaults={onClearAllFaults}
        onOpenEcuPinouts={onOpenEcuPinouts}
        onToggleTopologyGraph={() =>
          setCanvasViewMode((m) => (m === 'SCHEMATIC' ? 'TOPOLOGY_GRAPH' : 'SCHEMATIC'))
        }
        isTopologyGraphActive={canvasViewMode === 'TOPOLOGY_GRAPH'}
      />

      {/* Wire Color Selector Modal Dialog */}
      {pendingWire && (
        <div className="absolute inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#151921] border border-[#4a5466] rounded-[3px] p-5 max-w-md w-full shadow-2xl flex flex-col gap-4 font-mono">
            <div className="flex items-center justify-between border-b border-[#2b323e] pb-3">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                  New Harness Wire Connection
                </h3>
              </div>
              <button
                onClick={() => setPendingWire(null)}
                className="text-slate-400 hover:text-white p-1 rounded-[2px] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div className="hw-lcd-well p-2.5 rounded-[2px] flex items-center justify-between">
                <div>
                  <span className="text-[9px] text-slate-500 block">SOURCE TERMINAL</span>
                  <span className="font-bold text-emerald-300">{pendingWire.sourceLabel}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500" />
                <div className="text-right">
                  <span className="text-[9px] text-slate-500 block">TARGET TERMINAL</span>
                  <span className="font-bold text-amber-300">{pendingWire.targetLabel}</span>
                </div>
              </div>

              {/* Wire Label Input */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Wire Harness Label / Circuit Note:</label>
                <input
                  type="text"
                  maxLength={MAX_WIRE_LABEL_LENGTH}
                  value={selectedWireLabel}
                  onChange={e => setSelectedWireLabel(e.target.value)}
                  className="bg-[#0d1016] border border-[#323a48] rounded-[2px] px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Automotive Standard Color Selector Dropdown / Grid */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-400 font-bold uppercase">
                  Automotive Wire Color Standard:
                </label>
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto p-1 bg-[#0d1016] rounded-[2px] border border-[#2c3340]">
                  {AUTOMOTIVE_WIRE_COLORS.map(c => (
                    <button
                      key={c.hex}
                      onClick={() => setSelectedWireColor(c.hex)}
                      className={`flex items-center gap-2 p-2 rounded-[2px] border text-left transition cursor-pointer ${
                        selectedWireColor === c.hex
                          ? 'bg-[#252d3a] border-amber-400 text-white'
                          : 'bg-[#151a22] border-[#2c3340] text-slate-300 hover:border-[#465164]'
                      }`}
                    >
                      <div className="w-4 h-4 rounded-full border border-white/40 shrink-0" style={{ backgroundColor: c.hex }} />
                      <div className="flex flex-col truncate">
                        <span className="font-bold text-[11px] truncate">{c.name.split(' ')[0]}</span>
                        <span className="text-[9px] text-slate-400 truncate">{c.name.split('(')[1]?.replace(')', '') || c.category}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2b323e]">
              <button
                onClick={() => setPendingWire(null)}
                className="hw-btn px-3 py-1.5 text-xs rounded-[2px] text-slate-300 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onAddWire(pendingWire.sourceId, pendingWire.targetId, selectedWireColor, selectedWireLabel);
                  setPendingWire(null);
                }}
                className="hw-btn hw-btn-amber px-4 py-1.5 text-xs rounded-[2px] font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Route Color-Coded Wire</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wire Overview Map Panel */}
      <WireOverviewMapPanel
        isOpen={isWireOverviewOpen}
        onClose={() => {
          setIsWireOverviewOpen(false);
          setFocusedOverviewWireId(null);
        }}
        pins={pins}
        components={components}
        wires={wires}
        nodeVoltages={nodeVoltages}
        wireCurrentsMa={wireCurrentsMa}
        isPowerOn={isPowerOn}
        focusedWireId={focusedOverviewWireId}
        onFocusWire={setFocusedOverviewWireId}
        onSelectPin={onSelectPin}
        onAttachProbe={onAttachProbe}
        onToggleCutWire={onToggleCutWire}
        onDeleteWire={onDeleteWire}
      />

      {/* Searchable Bench Component Library Sidebar */}
      <BenchComponentLibrarySidebar
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onAddComponent={(newComp) => {
          onAddComponent?.(newComp);
        }}
        placedComponents={components}
        onDeleteComponent={(compId) => {
          onDeleteComponent?.(compId);
        }}
        onUpdateComponentState={onUpdateComponentState}
      />
    </div>
  );
};

