import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import {
  Activity,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  Filter,
  Flame,
  Gauge,
  Layers,
  Link2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Scissors,
  Share2,
  ShieldAlert,
  Sparkles,
  Wrench,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  BenchComponent,
  EcuPin,
  InjectedFault,
  MultimeterState,
  WireConnection,
} from '../../types/ecu';
import type { CircuitSolution } from '../../utils/circuitSolver';
import {
  computeHarnessGraphTopology,
  HarnessGraphTopologyResult,
  TopologyElectricalNetData,
  TopologyGraphLinkData,
  TopologyGraphNodeData,
} from '../../simulation/telemetry/harnessDiagnostics';
import {
  formatProbeMoveBadge,
  useProbeTransitionMotion,
} from './useProbeTransitionMotion';
import { ProbeTransitionOverlay } from './ProbeTransitionOverlay';

export type TopologyLayoutMode = 'FORCE_DYNAMIC' | 'RADIAL_CLUSTER' | 'BIPARTITE_FLOW';
export type TopologyNetFilter = 'ALL' | 'POWER_GROUND' | 'SENSORS_VREF' | 'ACTUATORS' | 'CAN_BUS';

interface SimNode extends TopologyGraphNodeData, d3.SimulationNodeDatum {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  sourcePinId: string;
  targetPinId: string;
  color: string;
  label: string;
  isCut: boolean;
  resistance: number;
  sourceVoltage: number;
  targetVoltage: number;
  voltageDrop: number;
  isEnergized: boolean;
  source: SimNode | string | number;
  target: SimNode | string | number;
}

export interface VisualTopologyGraphProps {
  pins: EcuPin[];
  components: BenchComponent[];
  wires: WireConnection[];
  nodeVoltages: Record<string, number>;
  faults?: InjectedFault[];
  isPowerOn: boolean;
  onToggleCutWire: (wireId: string) => void;
  onRemoveWire?: (wireId: string) => void;
  onAttachProbe?: (color: 'red' | 'black', pinId: string, label: string) => void;
  onSelectPin?: (pinId: string) => void;
  onStartWireFromPin?: (pin: { id: string; label: string }) => void;
  multimeter?: MultimeterState;
  selectedPinId?: string | null;
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  onClose?: () => void;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}

const CATEGORY_COLORS: Record<TopologyGraphNodeData['category'], { ring: string; bg: string; text: string; glow: string }> = {
  power: { ring: '#f59e0b', bg: '#291b06', text: '#fbbf24', glow: 'rgba(245, 158, 11, 0.45)' },
  ground: { ring: '#10b981', bg: '#042217', text: '#34d399', glow: 'rgba(16, 185, 129, 0.45)' },
  can: { ring: '#06b6d4', bg: '#06242c', text: '#22d3ee', glow: 'rgba(6, 182, 212, 0.45)' },
  reference: { ring: '#8b5cf6', bg: '#1c1033', text: '#a78bfa', glow: 'rgba(139, 92, 246, 0.45)' },
  actuator: { ring: '#ef4444', bg: '#280c0c', text: '#f87171', glow: 'rgba(239, 68, 68, 0.45)' },
  sensor: { ring: '#3b82f6', bg: '#0c1a32', text: '#60a5fa', glow: 'rgba(59, 130, 246, 0.45)' },
  general: { ring: '#64748b', bg: '#131a24', text: '#94a3b8', glow: 'rgba(100, 116, 139, 0.3)' },
};

export const VisualTopologyGraph: React.FC<VisualTopologyGraphProps> = ({
  pins,
  components,
  wires,
  nodeVoltages,
  faults = [],
  isPowerOn,
  onToggleCutWire,
  onRemoveWire,
  onAttachProbe,
  onSelectPin,
  onStartWireFromPin,
  multimeter,
  selectedPinId,
  searchQuery: externalSearchQuery,
  onSearchQueryChange,
  expanded = false,
  onToggleExpanded,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [layoutMode, setLayoutMode] = useState<TopologyLayoutMode>('FORCE_DYNAMIC');
  const [netFilter, setNetFilter] = useState<TopologyNetFilter>('ALL');
  const [isPhysicsActive, setIsPhysicsActive] = useState(true);
  const [internalSearch, setInternalSearch] = useState('');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
  const [activeInspectedPinId, setActiveInspectedPinId] = useState<string | null>(null);

  const [zoomTransform, setZoomTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const activeSearch = externalSearchQuery !== undefined ? externalSearchQuery : internalSearch;
  const updateSearch = (val: string) => {
    if (onSearchQueryChange) onSearchQueryChange(val);
    else setInternalSearch(val);
  };

  // 1. Calculate deterministic topology and electrical nets
  const topology: HarnessGraphTopologyResult = useMemo(() => {
    return computeHarnessGraphTopology({
      pins,
      components,
      wires,
      nodeVoltages,
      faults,
      isPowerOn,
    });
  }, [pins, components, wires, nodeVoltages, faults, isPowerOn]);

  // Map of which net each node belongs to
  const netByNodeId = useMemo(() => {
    const map = new Map<string, TopologyElectricalNetData>();
    for (const net of topology.nets) {
      for (const nid of net.nodeIds) {
        map.set(nid, net);
      }
    }
    return map;
  }, [topology.nets]);

  // Determine active highlighted nodes/links based on hover or search
  const { highlightedNodeIds, highlightedLinkIds } = useMemo(() => {
    const hNodes = new Set<string>();
    const hLinks = new Set<string>();

    if (hoveredNodeId) {
      hNodes.add(hoveredNodeId);
      const net = netByNodeId.get(hoveredNodeId);
      if (net) {
        for (const nid of net.nodeIds) hNodes.add(nid);
        for (const wid of net.wireIds) hLinks.add(wid);
      }
    } else if (hoveredLinkId) {
      hLinks.add(hoveredLinkId);
      const link = topology.links.find((l) => l.id === hoveredLinkId);
      if (link) {
        hNodes.add(link.sourcePinId);
        hNodes.add(link.targetPinId);
      }
    } else if (activeSearch.trim().length > 0) {
      const q = activeSearch.trim().toLowerCase();
      for (const n of topology.nodes) {
        if (
          n.label.toLowerCase().includes(q) ||
          n.name.toLowerCase().includes(q) ||
          n.category.toLowerCase().includes(q) ||
          (n.componentName && n.componentName.toLowerCase().includes(q))
        ) {
          hNodes.add(n.id);
        }
      }
      for (const l of topology.links) {
        if (l.label.toLowerCase().includes(q) || hNodes.has(l.sourcePinId) || hNodes.has(l.targetPinId)) {
          hLinks.add(l.id);
        }
      }
    }

    return { highlightedNodeIds: hNodes, highlightedLinkIds: hLinks };
  }, [hoveredNodeId, hoveredLinkId, activeSearch, netByNodeId, topology.nodes, topology.links]);

  // Filtered nodes and links based on Net Filter
  const { filteredNodes, filteredLinks } = useMemo(() => {
    if (netFilter === 'ALL') {
      return { filteredNodes: topology.nodes, filteredLinks: topology.links };
    }

    const matchesFilter = (cat: TopologyGraphNodeData['category']) => {
      if (netFilter === 'POWER_GROUND') return cat === 'power' || cat === 'ground';
      if (netFilter === 'SENSORS_VREF') return cat === 'sensor' || cat === 'reference';
      if (netFilter === 'ACTUATORS') return cat === 'actuator';
      if (netFilter === 'CAN_BUS') return cat === 'can';
      return true;
    };

    const keepNodeIds = new Set(
      topology.nodes.filter((n) => matchesFilter(n.category) || n.degree > 0).map((n) => n.id)
    );

    const fLinks = topology.links.filter(
      (l) => keepNodeIds.has(l.sourcePinId) && keepNodeIds.has(l.targetPinId)
    );

    const linkConnectedIds = new Set<string>();
    for (const l of fLinks) {
      linkConnectedIds.add(l.sourcePinId);
      linkConnectedIds.add(l.targetPinId);
    }

    const fNodes = topology.nodes.filter((n) => linkConnectedIds.has(n.id) || matchesFilter(n.category));

    return { filteredNodes: fNodes, filteredLinks: fLinks };
  }, [topology, netFilter]);

  // Simulation State Refs
  const simNodesRef = useRef<SimNode[]>([]);
  const simLinksRef = useRef<SimLink[]>([]);
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const [, setSimTick] = useState(0);

  // Sync simulation nodes and links with filtered data
  useEffect(() => {
    const existingNodeMap = new Map(simNodesRef.current.map((n) => [n.id, n]));

    const width = containerRef.current?.clientWidth || 980;
    const height = containerRef.current?.clientHeight || 600;

    const newSimNodes: SimNode[] = filteredNodes.map((fn, idx) => {
      const existing = existingNodeMap.get(fn.id);
      if (existing) {
        return {
          ...fn,
          x: existing.x,
          y: existing.y,
          vx: existing.vx,
          vy: existing.vy,
          fx: existing.fx,
          fy: existing.fy,
        };
      }

      // Initial placement based on layout mode
      let initX = width / 2 + (Math.random() - 0.5) * 200;
      let initY = height / 2 + (Math.random() - 0.5) * 200;

      if (layoutMode === 'RADIAL_CLUSTER') {
        if (fn.kind === 'ECU_PIN') {
          const angle = (idx / Math.max(1, pins.length)) * Math.PI * 2;
          initX = width / 2 + Math.cos(angle) * 120;
          initY = height / 2 + Math.sin(angle) * 120;
        } else {
          const angle = (idx / Math.max(1, filteredNodes.length)) * Math.PI * 2;
          initX = width / 2 + Math.cos(angle) * 280;
          initY = height / 2 + Math.sin(angle) * 260;
        }
      } else if (layoutMode === 'BIPARTITE_FLOW') {
        if (fn.kind === 'ECU_PIN') {
          initX = width * 0.28;
          initY = height * 0.15 + (idx / Math.max(1, pins.length)) * (height * 0.7);
        } else {
          initX = width * 0.72;
          initY = height * 0.15 + (idx / Math.max(1, filteredNodes.length - pins.length)) * (height * 0.7);
        }
      }

      return {
        ...fn,
        x: initX,
        y: initY,
      };
    });

    const nodeLookup = new Map(newSimNodes.map((n) => [n.id, n]));

    const newSimLinks: SimLink[] = [];
    for (const fl of filteredLinks) {
      const src = nodeLookup.get(fl.sourcePinId);
      const tgt = nodeLookup.get(fl.targetPinId);
      if (src && tgt) {
        newSimLinks.push({
          ...fl,
          source: src,
          target: tgt,
        });
      }
    }

    simNodesRef.current = newSimNodes;
    simLinksRef.current = newSimLinks;

    // Create or update D3 force simulation
    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    const sim = d3
      .forceSimulation<SimNode>(newSimNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(newSimLinks)
          .id((d) => d.id)
          .distance((l) => (l.isCut ? 140 : 85))
          .strength(layoutMode === 'FORCE_DYNAMIC' ? 0.7 : 0.3)
      )
      .force('charge', d3.forceManyBody().strength(layoutMode === 'FORCE_DYNAMIC' ? -180 : -90))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.08))
      .force('collide', d3.forceCollide(34))
      .alphaDecay(layoutMode === 'FORCE_DYNAMIC' ? 0.025 : 0.045);

    if (layoutMode === 'BIPARTITE_FLOW') {
      sim.force(
        'x',
        d3.forceX<SimNode>((d) => (d.kind === 'ECU_PIN' ? width * 0.3 : width * 0.7)).strength(0.65)
      );
      sim.force('y', d3.forceY(height / 2).strength(0.05));
    }

    sim.on('tick', () => {
      setSimTick((t) => (t + 1) % 10000);
    });

    if (!isPhysicsActive) {
      sim.stop();
    } else {
      sim.alpha(0.8).restart();
    }

    simulationRef.current = sim;

    return () => {
      sim.stop();
    };
  }, [filteredNodes, filteredLinks, layoutMode, pins.length, isPhysicsActive]);

  // Setup Zoom & Pan via D3
  useEffect(() => {
    if (!svgRef.current) return;
    const svgEl = d3.select(svgRef.current);

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.35, 3.0])
      .on('zoom', (event) => {
        setZoomTransform(event.transform);
      });

    svgEl.call(zoom);
    zoomBehaviorRef.current = zoom;
  }, []);

  const handleZoomIn = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 1.25);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 0.8);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(350).call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  };

  const handleFitView = () => {
    if (!svgRef.current || !zoomBehaviorRef.current || simNodesRef.current.length === 0) return;
    const nodes = simNodesRef.current;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const n of nodes) {
      if (n.x !== undefined && n.y !== undefined) {
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y);
      }
    }
    const width = containerRef.current?.clientWidth || 980;
    const height = containerRef.current?.clientHeight || 600;
    const dx = maxX - minX || 200;
    const dy = maxY - minY || 200;
    const scale = Math.max(0.4, Math.min(1.8, 0.85 / Math.max(dx / width, dy / height)));
    const tx = width / 2 - scale * ((minX + maxX) / 2);
    const ty = height / 2 - scale * ((minY + maxY) / 2);

    const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
    d3.select(svgRef.current).transition().duration(400).call(zoomBehaviorRef.current.transform, t);
  };

  const togglePhysics = () => {
    setIsPhysicsActive((prev) => {
      const next = !prev;
      if (simulationRef.current) {
        if (next) simulationRef.current.alpha(0.5).restart();
        else simulationRef.current.stop();
      }
      return next;
    });
  };

  const reheatSimulation = () => {
    if (simulationRef.current) {
      simulationRef.current.alpha(0.85).restart();
      setIsPhysicsActive(true);
    }
  };

  // Node Drag Handler (Physics anchoring)
  const dragBehavior = useMemo(() => {
    return d3
      .drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active && simulationRef.current && isPhysicsActive) {
          simulationRef.current.alphaTarget(0.3).restart();
        }
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active && simulationRef.current && isPhysicsActive) {
          simulationRef.current.alphaTarget(0);
        }
        // Release fixed position in FORCE mode; keep fixed in manual layouts
        if (layoutMode === 'FORCE_DYNAMIC') {
          d.fx = null;
          d.fy = null;
        }
      });
  }, [layoutMode, isPhysicsActive]);

  // Bind drag events to node elements
  const nodeRefCallback = useCallback(
    (element: SVGGElement | null, node: SimNode) => {
      if (!element) return;
      d3.select(element).datum(node).call(dragBehavior);
    },
    [dragBehavior]
  );

  const inspectedNode = useMemo(() => {
    if (!activeInspectedPinId) return null;
    return topology.nodes.find((n) => n.id === activeInspectedPinId) || null;
  }, [activeInspectedPinId, topology.nodes]);

  const inspectedWires = useMemo(() => {
    if (!activeInspectedPinId) return [];
    return topology.links.filter(
      (l) => l.sourcePinId === activeInspectedPinId || l.targetPinId === activeInspectedPinId
    );
  }, [activeInspectedPinId, topology.links]);

  const redPinId = multimeter?.redProbe.attachedToPinId ?? null;
  const blackPinId = multimeter?.blackProbe.attachedToPinId ?? null;

  const redSimNode = redPinId
    ? simNodesRef.current.find((n) => n.id === redPinId)
    : undefined;
  const blackSimNode = blackPinId
    ? simNodesRef.current.find((n) => n.id === blackPinId)
    : undefined;

  const targetRedCoords =
    redSimNode && redSimNode.x !== undefined && redSimNode.y !== undefined
      ? { x: redSimNode.x - 15, y: redSimNode.y }
      : null;
  const targetBlackCoords =
    blackSimNode && blackSimNode.x !== undefined && blackSimNode.y !== undefined
      ? { x: blackSimNode.x - 15, y: blackSimNode.y }
      : null;

  const redProbeMotion = useProbeTransitionMotion({
    pinId: targetRedCoords ? redPinId : null,
    pinLabel: multimeter?.redProbe.attachedLabel ?? null,
    targetCoords: targetRedCoords,
    color: 'red',
    originCoords: { x: 24, y: 36 },
    playAudio: false,
  });

  const blackProbeMotion = useProbeTransitionMotion({
    pinId: targetBlackCoords ? blackPinId : null,
    pinLabel: multimeter?.blackProbe.attachedLabel ?? null,
    targetCoords: targetBlackCoords,
    color: 'black',
    originCoords: { x: 24, y: 540 },
    playAudio: false,
  });

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col w-full h-full bg-[#0a0d12] border border-[#232a36] rounded-[3px] overflow-hidden select-none font-mono text-xs ${
        expanded ? 'fixed inset-3 z-50 shadow-2xl border-amber-500/50' : ''
      }`}
    >
      {/* TOP HUD BAR */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 border-b border-[#232a36] bg-[#0f141d]/95 p-2 sm:px-3 text-slate-200">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 font-bold tracking-wider text-amber-400">
            <Share2 className="h-4 w-4 shrink-0 text-amber-400" />
            <span className="truncate">HARNESS TOPOLOGY GRAPH</span>
          </div>

          <div className="hidden md:flex items-center gap-1 text-[10px] text-slate-400 border-l border-[#2d3544] pl-2.5">
            <span className="font-bold text-amber-300">{topology.summary.totalNodes}</span>
            <span>Nodes</span>
            <span className="text-slate-600">·</span>
            <span className="font-bold text-emerald-400">{topology.summary.continuousWires}</span>
            <span>Intact</span>
            {topology.summary.cutWires > 0 && (
              <>
                <span className="text-slate-600">·</span>
                <span className="font-bold text-rose-400">{topology.summary.cutWires} Cut</span>
              </>
            )}
            <span className="text-slate-600">·</span>
            <span className="font-bold text-cyan-300">{topology.summary.independentNets}</span>
            <span>Nets</span>
          </div>

          {/* Search Bar */}
          <div className="relative flex items-center rounded-[2px] border border-[#2d3544] bg-[#07090e] px-2 py-0.5 focus-within:border-amber-400">
            <Search className="h-3 w-3 text-slate-400 mr-1 shrink-0" />
            <input
              type="text"
              value={activeSearch}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Filter Nodes / Wires (TPS, Pin 3, KL30)..."
              className="w-32 sm:w-48 bg-transparent text-[10px] font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
            {activeSearch && (
              <button
                type="button"
                onClick={() => updateSearch('')}
                className="text-slate-400 hover:text-white cursor-pointer ml-1"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {(redProbeMotion.isMoving || blackProbeMotion.isMoving) && (
            <div
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] border border-[#3a4354] bg-[#07090e] text-[10px] font-mono"
              aria-live="polite"
            >
              <span
                className={`w-2 h-2 rounded-full animate-ping ${
                  redProbeMotion.isMoving ? 'bg-rose-400' : 'bg-slate-300'
                }`}
              />
              <span className={redProbeMotion.isMoving ? 'text-rose-300 font-bold' : 'text-slate-200 font-bold'}>
                {redProbeMotion.isMoving
                  ? `RED: ${formatProbeMoveBadge(redProbeMotion.fromLabel, redProbeMotion.toLabel)}`
                  : `COM: ${formatProbeMoveBadge(blackProbeMotion.fromLabel, blackProbeMotion.toLabel)}`}
              </span>
            </div>
          )}
        </div>

        {/* CONTROLS RIGHT */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {/* Net Filter */}
          <div className="flex items-center gap-1 bg-[#151b26] border border-[#2d3544] rounded-[2px] p-0.5 text-[10px]">
            <Filter className="h-3 w-3 text-slate-400 ml-1 shrink-0" />
            <select
              value={netFilter}
              onChange={(e) => setNetFilter(e.target.value as TopologyNetFilter)}
              className="bg-transparent text-[10px] font-mono text-amber-300 focus:outline-none cursor-pointer pr-1"
            >
              <option value="ALL">All Nets ({topology.nodes.length})</option>
              <option value="POWER_GROUND">Power &amp; Ground (KL30/KL31)</option>
              <option value="SENSORS_VREF">5V Sensors &amp; Reference</option>
              <option value="ACTUATORS">Actuator Drivers (INJ/RELAY)</option>
              <option value="CAN_BUS">HS-CAN Bus Network</option>
            </select>
          </div>

          {/* Layout Mode */}
          <div className="flex items-center bg-[#151b26] border border-[#2d3544] rounded-[2px] p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setLayoutMode('FORCE_DYNAMIC')}
              className={`px-2 py-0.5 rounded-[2px] cursor-pointer transition ${
                layoutMode === 'FORCE_DYNAMIC'
                  ? 'bg-[#293242] text-amber-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Force-Directed Dynamic Spring Simulation"
            >
              Force
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('RADIAL_CLUSTER')}
              className={`px-2 py-0.5 rounded-[2px] cursor-pointer transition ${
                layoutMode === 'RADIAL_CLUSTER'
                  ? 'bg-[#293242] text-amber-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Radial ECU Hub & Component Perimeter"
            >
              Radial
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('BIPARTITE_FLOW')}
              className={`px-2 py-0.5 rounded-[2px] cursor-pointer transition ${
                layoutMode === 'BIPARTITE_FLOW'
                  ? 'bg-[#293242] text-amber-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Bipartite Harness Split: ECU vs Peripherals"
            >
              Flow
            </button>
          </div>

          {/* Physics & Zoom Actions */}
          <div className="flex items-center gap-0.5 bg-[#151b26] border border-[#2d3544] rounded-[2px] p-0.5 text-slate-300">
            <button
              type="button"
              onClick={togglePhysics}
              className="p-1 hover:bg-[#252d3b] rounded-[2px] text-slate-400 hover:text-white cursor-pointer"
              title={isPhysicsActive ? 'Pause Physics' : 'Resume Physics'}
            >
              {isPhysicsActive ? <Pause className="h-3 w-3 text-amber-400" /> : <Play className="h-3 w-3 text-emerald-400" />}
            </button>
            <button
              type="button"
              onClick={reheatSimulation}
              className="p-1 hover:bg-[#252d3b] rounded-[2px] text-slate-400 hover:text-white cursor-pointer"
              title="Re-heat Simulation (Untangle Clusters)"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
            <div className="h-3 w-px bg-[#2d3544] mx-0.5" />
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1 hover:bg-[#252d3b] rounded-[2px] text-slate-400 hover:text-white cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1 hover:bg-[#252d3b] rounded-[2px] text-slate-400 hover:text-white cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleFitView}
              className="px-1.5 py-0.5 text-[9px] font-bold hover:bg-[#252d3b] rounded-[2px] text-amber-300 cursor-pointer"
              title="Fit Full Harness Graph in Viewport"
            >
              Fit
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="p-1 hover:bg-[#252d3b] rounded-[2px] text-slate-400 hover:text-white cursor-pointer"
              title="Reset Zoom to 100%"
            >
              1:1
            </button>
            {onToggleExpanded && (
              <button
                type="button"
                onClick={onToggleExpanded}
                className="p-1 hover:bg-[#252d3b] rounded-[2px] text-slate-400 hover:text-white cursor-pointer ml-1"
                title={expanded ? 'Minimize Topology Window' : 'Expand Full Screen'}
              >
                {expanded ? <Minimize2 className="h-3.5 w-3.5 text-amber-300" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SVG GRAPH STAGE */}
      <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden cursor-grab active:cursor-grabbing">
        <svg
          ref={svgRef}
          className="w-full h-full pointer-events-auto"
          style={{ background: 'radial-gradient(circle at center, #10151f 0%, #06090f 100%)' }}
        >
          <defs>
            {/* Grid Pattern */}
            <pattern id="topologyGrid" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="0.75" fill="rgba(148, 163, 184, 0.12)" />
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(148, 163, 184, 0.04)" strokeWidth="0.5" />
            </pattern>

            <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="linkGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background Grid */}
          <rect width="100%" height="100%" fill="url(#topologyGrid)" />

          {/* Zoomable Container Group */}
          <g transform={zoomTransform.toString()}>
            {/* LINKS LAYER */}
            <g className="links-layer">
              {simLinksRef.current.map((link) => {
                const src = typeof link.source === 'object' ? link.source : null;
                const tgt = typeof link.target === 'object' ? link.target : null;
                if (!src || !tgt || src.x === undefined || src.y === undefined || tgt.x === undefined || tgt.y === undefined) {
                  return null;
                }

                const isHovered = hoveredLinkId === link.id;
                const isNetHighlighted =
                  highlightedLinkIds.has(link.id) ||
                  (hoveredNodeId && (link.sourcePinId === hoveredNodeId || link.targetPinId === hoveredNodeId));
                const isDimmed =
                  (hoveredNodeId || hoveredLinkId || activeSearch.trim().length > 0) &&
                  !isNetHighlighted;

                // Bezier curved link for cleaner visual routing
                const dx = tgt.x - src.x;
                const dy = tgt.y - src.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const curvature = Math.min(0.2, 35 / Math.max(1, dist));
                const midX = (src.x + tgt.x) / 2 - dy * curvature;
                const midY = (src.y + tgt.y) / 2 + dx * curvature;

                const pathData = `M ${src.x} ${src.y} Q ${midX} ${midY} ${tgt.x} ${tgt.y}`;

                return (
                  <g
                    key={link.id}
                    className="transition-opacity duration-150 cursor-pointer"
                    opacity={isDimmed ? 0.15 : 1}
                    onMouseEnter={() => setHoveredLinkId(link.id)}
                    onMouseLeave={() => setHoveredLinkId(null)}
                    onClick={() => onToggleCutWire(link.id)}
                  >
                    {/* Broad hit path */}
                    <path d={pathData} fill="none" stroke="transparent" strokeWidth="16" />

                    {/* Wire Base Conductor */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke={link.isCut ? '#475569' : link.color}
                      strokeWidth={isHovered || isNetHighlighted ? '3.5' : '2'}
                      strokeDasharray={link.isCut ? '6,6' : undefined}
                      filter={link.isEnergized && !link.isCut ? 'url(#linkGlow)' : undefined}
                    />

                    {/* Animated current flow for energized conductors */}
                    {link.isEnergized && !link.isCut && (
                      <path
                        d={pathData}
                        fill="none"
                        stroke="#fbbf24"
                        strokeWidth="1.8"
                        strokeDasharray="4,12"
                        className="animate-pulse"
                        opacity="0.85"
                      />
                    )}

                    {/* Midpoint Label Badge */}
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect
                        x="-24"
                        y="-8"
                        width="48"
                        height="16"
                        rx="2"
                        fill="#0b0e14"
                        stroke={link.isCut ? '#ef4444' : link.color}
                        strokeWidth="1"
                        opacity="0.92"
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={link.isCut ? '#f87171' : '#f1f5f9'}
                        fontSize="8.5"
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {link.isCut ? '✂ OPEN' : `${link.targetVoltage.toFixed(1)}V`}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>

            {/* NODES LAYER */}
            <g className="nodes-layer">
              {simNodesRef.current.map((node) => {
                if (node.x === undefined || node.y === undefined) return null;

                const catStyle = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.general;
                const isInspected = activeInspectedPinId === node.id || selectedPinId === node.id;
                const isHovered = hoveredNodeId === node.id;
                const isRedProbeNode = redPinId === node.id;
                const isBlackProbeNode = blackPinId === node.id;
                const isNetHighlighted = highlightedNodeIds.has(node.id);
                const isDimmed =
                  (hoveredNodeId || hoveredLinkId || activeSearch.trim().length > 0) &&
                  !isNetHighlighted &&
                  !isRedProbeNode &&
                  !isBlackProbeNode;

                return (
                  <g
                    key={node.id}
                    ref={(el) => nodeRefCallback(el, node)}
                    transform={`translate(${node.x}, ${node.y})`}
                    className="cursor-pointer transition-opacity duration-150"
                    opacity={isDimmed ? 0.2 : 1}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveInspectedPinId(node.id);
                      if (onSelectPin) onSelectPin(node.id);
                    }}
                  >
                    {/* Selection Ring */}
                    {isInspected && (
                      <circle
                        r="26"
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2.5"
                        strokeDasharray="4,4"
                        className="animate-spin"
                        style={{ transformOrigin: '0 0', animationDuration: '6s' }}
                      />
                    )}

                    {/* Outer Glow Halo for Energized / Faulted */}
                    {node.hasFault ? (
                      <circle r="22" fill="none" stroke="#ef4444" strokeWidth="2" filter="url(#nodeGlow)" />
                    ) : node.isEnergized ? (
                      <circle
                        r="20"
                        fill="none"
                        stroke={catStyle.ring}
                        strokeWidth="1.5"
                        opacity="0.6"
                        filter="url(#nodeGlow)"
                      />
                    ) : null}

                    {/* Main Node Disc */}
                    <circle
                      r="16"
                      fill={node.hasFault ? '#3b0d0d' : catStyle.bg}
                      stroke={node.hasFault ? '#ef4444' : catStyle.ring}
                      strokeWidth={isHovered || isNetHighlighted ? '2.5' : '1.5'}
                    />

                    {/* Icon or Short Label */}
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={node.hasFault ? '#fca5a5' : catStyle.text}
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {node.kind === 'ECU_PIN' ? 'ECU' : 'DEV'}
                    </text>

                    {/* Label Above Node */}
                    <g transform="translate(0, -22)">
                      <rect
                        x="-38"
                        y="-7"
                        width="76"
                        height="14"
                        rx="2"
                        fill="#07090e"
                        stroke={catStyle.ring}
                        strokeWidth="0.8"
                        opacity="0.9"
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#f8fafc"
                        fontSize="8.5"
                        fontWeight="600"
                        fontFamily="monospace"
                      >
                        {node.label.length > 13 ? `${node.label.slice(0, 12)}…` : node.label}
                      </text>
                    </g>

                    {/* Live Voltage Pill Below Node */}
                    <g transform="translate(0, 22)">
                      <rect
                        x="-24"
                        y="-6"
                        width="48"
                        height="13"
                        rx="2"
                        fill={node.voltage > 10 ? '#341a02' : node.voltage > 0.4 ? '#042217' : '#141a24'}
                        stroke={node.voltage > 10 ? '#f59e0b' : node.voltage > 0.4 ? '#10b981' : '#334155'}
                        strokeWidth="0.8"
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={node.voltage > 10 ? '#fbbf24' : node.voltage > 0.4 ? '#34d399' : '#94a3b8'}
                        fontSize="8"
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {node.voltage.toFixed(2)}V
                      </text>
                    </g>

                    {/* Fault Indicator Tag */}
                    {node.hasFault && (
                      <g transform="translate(12, -14)">
                        <circle r="5" fill="#ef4444" stroke="#ffffff" strokeWidth="0.8" />
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#ffffff"
                          fontSize="7"
                          fontWeight="bold"
                        >
                          !
                        </text>
                      </g>
                    )}

                    {/* Seated DMM Probe Pin Ring Indicators */}
                    {isRedProbeNode && (
                      <circle
                        r="21"
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="2"
                        strokeDasharray="3 2"
                        opacity="0.9"
                      />
                    )}
                    {isBlackProbeNode && (
                      <circle
                        r={isRedProbeNode ? 24 : 21}
                        fill="none"
                        stroke="#cbd5e1"
                        strokeWidth="2"
                        strokeDasharray="3 2"
                        opacity="0.85"
                      />
                    )}
                  </g>
                );
              })}
            </g>

            {/* ANIMATED MULTIMETER PROBE TRANSITION LAYER */}
            <g className="probes-layer pointer-events-none">
              <ProbeTransitionOverlay
                color="red"
                motionState={redProbeMotion}
                leadOrigin={{ x: 24, y: 36 }}
                instanceId="topology"
                compact
              />
              <ProbeTransitionOverlay
                color="black"
                motionState={blackProbeMotion}
                leadOrigin={{ x: 24, y: 540 }}
                instanceId="topology"
                compact
              />
            </g>
          </g>
        </svg>

        {/* FLOATING QUICK LEGEND HUD */}
        <div className="absolute bottom-2.5 left-2.5 z-20 hidden sm:flex items-center gap-2 bg-[#0d1118]/90 border border-[#232a36] px-2.5 py-1.5 rounded-[2px] text-[10px] text-slate-300 backdrop-blur-xs">
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span>Power (KL30/15)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Chassis GND (KL31)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            <span>Sensor ADC</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-purple-400" />
            <span>5V Ref</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            <span>CAN Bus</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-rose-400" />
            <span>Actuator Sink</span>
          </div>
        </div>

        {/* SELECTED NODE INSPECTOR DRAWER / PANEL */}
        {inspectedNode && (
          <div className="absolute top-2.5 right-2.5 z-30 w-72 sm:w-80 rounded-[3px] border border-amber-500/60 bg-[#0d121b]/98 p-3 shadow-2xl backdrop-blur-md text-slate-200 space-y-2.5">
            <div className="flex items-center justify-between border-b border-[#242d3d] pb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Cpu className="h-4 w-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-amber-300 truncate text-xs">{inspectedNode.label}</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                    {inspectedNode.kind === 'ECU_PIN' ? 'ECU Connector Terminal' : inspectedNode.componentName || 'Component Pin'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveInspectedPinId(null)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Voltage & Net Stats */}
            <div className="grid grid-cols-2 gap-2 bg-[#06090e] p-2 rounded-[2px] border border-[#1f2633] text-[10px]">
              <div>
                <span className="text-slate-500 block">MNA Node Voltage</span>
                <span className="text-base font-bold text-amber-300 font-mono">
                  {inspectedNode.voltage.toFixed(3)} V
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Category / Rail</span>
                <span className="font-bold text-slate-200 uppercase">{inspectedNode.category}</span>
              </div>
            </div>

            {/* DMM Probe Quick Attach */}
            {onAttachProbe && (
              <div className="flex gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => onAttachProbe('red', inspectedNode.id, inspectedNode.label)}
                  className="flex-1 hw-btn flex items-center justify-center gap-1 rounded-[2px] border border-rose-500/60 bg-rose-950/40 px-2 py-1.5 text-[10px] font-bold text-rose-300 hover:bg-rose-900/60 cursor-pointer"
                >
                  <Zap className="h-3 w-3 text-rose-400" />
                  Attach Red Probe
                </button>
                <button
                  type="button"
                  onClick={() => onAttachProbe('black', inspectedNode.id, inspectedNode.label)}
                  className="flex-1 hw-btn flex items-center justify-center gap-1 rounded-[2px] border border-slate-600 bg-slate-900/60 px-2 py-1.5 text-[10px] font-bold text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  <Zap className="h-3 w-3 text-slate-400" />
                  Attach Black Probe
                </button>
              </div>
            )}

            {/* Wiring Actions */}
            {onStartWireFromPin && (
              <button
                type="button"
                onClick={() => {
                  onStartWireFromPin({ id: inspectedNode.id, label: inspectedNode.label });
                  setActiveInspectedPinId(null);
                }}
                className="w-full hw-btn flex items-center justify-center gap-1.5 rounded-[2px] border border-amber-500/70 bg-amber-500/20 px-2 py-1.5 text-[10px] font-bold text-amber-300 hover:bg-amber-500/30 cursor-pointer"
              >
                <Link2 className="h-3.5 w-3.5" />
                Connect New Harness Wire From Here
              </button>
            )}

            {/* Connected Leads List */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Connected Harness Leads ({inspectedWires.length})
              </div>
              {inspectedWires.length === 0 ? (
                <div className="text-[10px] text-slate-500 italic py-1">No wires attached to this terminal.</div>
              ) : (
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                  {inspectedWires.map((wire) => {
                    const otherPinId = wire.sourcePinId === inspectedNode.id ? wire.targetPinId : wire.sourcePinId;
                    const otherNode = topology.nodes.find((n) => n.id === otherPinId);

                    return (
                      <div
                        key={wire.id}
                        className="flex items-center justify-between gap-1 p-1.5 rounded-[2px] bg-[#07090f] border border-[#1e2533] text-[10px]"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: wire.color || '#3b82f6' }}
                          />
                          <span className="truncate text-slate-300 font-medium">{otherNode?.label || otherPinId}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => onToggleCutWire(wire.id)}
                            className={`px-1.5 py-0.5 rounded-[2px] font-bold text-[9px] cursor-pointer ${
                              wire.isCut
                                ? 'bg-rose-950/70 text-rose-300 border border-rose-600/60 hover:bg-rose-900'
                                : 'bg-emerald-950/70 text-emerald-300 border border-emerald-600/60 hover:bg-emerald-900'
                            }`}
                          >
                            {wire.isCut ? 'Repaired' : 'Cut Open'}
                          </button>
                          {onRemoveWire && (
                            <button
                              type="button"
                              onClick={() => onRemoveWire(wire.id)}
                              className="text-slate-500 hover:text-rose-400 p-0.5 cursor-pointer"
                              title="Delete Wire"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
