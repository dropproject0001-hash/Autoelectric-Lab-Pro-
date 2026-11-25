/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Share2,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import type {
  DiagnosticTroubleCode,
  EcuPin,
  InjectedFault,
  WireConnection,
} from '../../types/ecu';
import type { RpmEmulatorState } from '../../utils/vehicleEcuRegistry';
import type { GaugeTransportMode } from '../../simulation/telemetry/telemetryTypes';
import {
  buildHarnessFaultEntries,
  evaluatePinDiagnosticMatrix,
  evaluateSimulatedCanBusLoad,
} from '../../simulation/telemetry/harnessDiagnostics';

interface HarnessDiagnosticsDeckProps {
  pins: EcuPin[];
  wires: WireConnection[];
  nodeVoltages: Record<string, number>;
  wireCurrentsMa: Record<string, number>;
  faults: InjectedFault[];
  activeDTCs: DiagnosticTroubleCode[];
  selectedPinId: string | null;
  isPowerOn: boolean;
  isSupplyTripped?: boolean;
  rpmEmulator?: RpmEmulatorState;
  gaugeTransportMode?: GaugeTransportMode;
  expandedByDefault?: boolean;
  onSelectPin: (pinId: string) => void;
  onAttachProbe: (color: 'red' | 'black', pinId: string, label: string) => void;
  onToggleCutWire: (wireId: string) => void;
  onRemoveFault?: (pinId: string) => void;
  onClearAllFaults?: () => void;
  onOpenEcuPinouts?: () => void;
  onToggleTopologyGraph?: () => void;
  isTopologyGraphActive?: boolean;
}

const MAX_CAN_HISTORY_POINTS = 44;

export const HarnessDiagnosticsDeck: React.FC<HarnessDiagnosticsDeckProps> = ({
  pins,
  wires,
  nodeVoltages,
  wireCurrentsMa,
  faults,
  activeDTCs,
  selectedPinId,
  isPowerOn,
  isSupplyTripped = false,
  rpmEmulator,
  gaugeTransportMode = 'STOPPED',
  expandedByDefault = false,
  onSelectPin,
  onAttachProbe,
  onToggleCutWire,
  onRemoveFault,
  onClearAllFaults,
  onOpenEcuPinouts,
  onToggleTopologyGraph,
  isTopologyGraphActive = false,
}) => {
  const [isOpen, setIsOpen] = useState(expandedByDefault);
  const [faultTab, setFaultTab] = useState<'FAULTS' | 'CONTINUITY'>('FAULTS');
  const [phaseRad, setPhaseRad] = useState(0);
  const [canHistory, setCanHistory] = useState<number[]>(() =>
    Array.from({ length: MAX_CAN_HISTORY_POINTS }, () => 0)
  );

  useEffect(() => {
    setIsOpen(expandedByDefault);
  }, [expandedByDefault]);

  const pinMatrix = useMemo(
    () =>
      evaluatePinDiagnosticMatrix({
        pins,
        nodeVoltages,
        wireCurrentsMa,
        wires,
        faults,
        activeDTCs,
        isPowerOn,
        rpmEmulator,
      }),
    [pins, nodeVoltages, wireCurrentsMa, wires, faults, activeDTCs, isPowerOn, rpmEmulator]
  );

  const faultEntries = useMemo(
    () =>
      buildHarnessFaultEntries({
        pins,
        wires,
        faults,
        activeDTCs,
        isSupplyTripped,
      }),
    [pins, wires, faults, activeDTCs, isSupplyTripped]
  );

  const canSnapshot = useMemo(
    () =>
      evaluateSimulatedCanBusLoad({
        isPowerOn,
        nodeVoltages,
        faults,
        wires,
        rpmEmulator,
        transportMode: gaugeTransportMode,
        samplePhaseRad: phaseRad,
      }),
    [isPowerOn, nodeVoltages, faults, wires, rpmEmulator, gaugeTransportMode, phaseRad]
  );

  const latestCanLoadRef = useRef(canSnapshot.loadPercent);
  latestCanLoadRef.current = canSnapshot.loadPercent;

  // Controlled 4Hz CAN bus rolling sample buffer strictly while deck is expanded
  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = window.setInterval(() => {
      setPhaseRad((prev) => (prev + 0.45) % (Math.PI * 20));
      setCanHistory((prev) => [...prev.slice(1), latestCanLoadRef.current]);
    }, 250);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  // Immediate baseline snap when CAN state transitions (e.g. PSU toggled or CAN fault injected)
  useEffect(() => {
    setCanHistory((prev) => [...prev.slice(1), canSnapshot.loadPercent]);
  }, [canSnapshot.busState, canSnapshot.hasBusFault]);

  const activePinEntry =
    pinMatrix.find((entry) => entry.pinId === selectedPinId) ?? pinMatrix[0] ?? null;

  const continuousWireCount = wires.filter((w) => !w.isCut).length;
  const avgCanLoad =
    canHistory.length > 0
      ? canHistory.reduce((acc, val) => acc + val, 0) / canHistory.length
      : canSnapshot.loadPercent;

  // Build crisp SVG points for CAN Bus Load chart (280x64 coordinate box)
  const chartW = 280;
  const chartH = 64;
  const canPolylinePoints = canHistory
    .map((val, idx) => {
      const x = (idx / Math.max(1, canHistory.length - 1)) * chartW;
      const y = chartH - (Math.max(0, Math.min(100, val)) / 100) * (chartH - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const canAreaPath =
    canHistory.length > 1
      ? `M 0,${chartH} L ${canPolylinePoints} L ${chartW},${chartH} Z`
      : '';

  return (
    <div className="border-t border-[#203653] bg-[#0A1220] shrink-0 font-mono">
      {/* Compact Header Strip */}
      <div className="px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 bg-[#0A1220]/96">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-wider text-[#eaf3ff] hover:text-[#19c8f5] cursor-pointer min-w-0"
        >
          <Activity className="w-3.5 h-3.5 text-[#20d889] shrink-0" />
          <span className="truncate">
            Harness Diagnostics · {continuousWireCount}/{wires.length} Wires ·{' '}
            <span className={faultEntries.length > 0 ? 'text-[#ff4d62]' : 'text-[#20d889]'}>
              {faultEntries.length} {faultEntries.length === 1 ? 'Fault' : 'Faults'}
            </span>{' '}
            · CAN {canSnapshot.loadPercent.toFixed(0)}%
          </span>
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-[#19c8f5] shrink-0" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-[#19c8f5] shrink-0" />
          )}
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {faultEntries.length > 0 && onClearAllFaults && (
            <button
              type="button"
              onClick={onClearAllFaults}
              className="hw-btn px-2 py-0.5 rounded-md text-[10px] font-semibold text-rose-300 border-[#ff4d62]/60 hover:text-white cursor-pointer"
              title="Clear all injected pin faults"
            >
              Clear Faults
            </button>
          )}
          {onToggleTopologyGraph && (
            <button
              type="button"
              onClick={onToggleTopologyGraph}
              className={`hw-btn px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1 cursor-pointer ${
                isTopologyGraphActive
                  ? 'hw-btn-blue text-white'
                  : 'text-[#d9e8fa] hover:text-white'
              }`}
              title={isTopologyGraphActive ? 'Switch back to Schematic View' : 'Switch to Dynamic Interactive Topology Graph'}
            >
              <Share2 className="w-3 h-3 text-[#19c8f5]" />
              <span>{isTopologyGraphActive ? 'Schematic' : 'Topology'}</span>
            </button>
          )}
          {onOpenEcuPinouts && (
            <button
              type="button"
              onClick={onOpenEcuPinouts}
              className="hw-btn px-2 py-0.5 rounded-md text-[10px] font-semibold text-[#ffb020] flex items-center gap-1 cursor-pointer"
            >
              <span>Pinouts</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded 3-Module Hardware Diagnostics Console */}
      {isOpen && (
        <div className="border-t border-[#203653] p-2.5 grid grid-cols-1 lg:grid-cols-3 gap-2.5 max-h-[320px] overflow-y-auto bg-[#060B14]">
          {/* Module 1: 16-Pin Live Status Matrix + Active Pin Readout */}
          <div className="bg-[#0E192A] border border-[#203653] rounded-lg p-2 flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-[#252b36] pb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-200">
                Live Pin Status (16-Pin)
              </span>
              <span className="text-[9px] text-slate-400 uppercase">
                {isPowerOn ? 'MNA LIVE' : 'STANDBY'}
              </span>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-8 lg:grid-cols-4 gap-1">
              {pinMatrix.map((entry) => {
                const isSelected = selectedPinId === entry.pinId;
                let cellStyle =
                  'bg-[#0d1117] border-[#262d39] text-slate-400 hover:border-[#495366]';
                if (entry.status === 'FAULT') {
                  cellStyle =
                    'bg-rose-950/60 border-rose-600/80 text-rose-200 hover:border-rose-400';
                } else if (entry.status === 'WARNING') {
                  cellStyle =
                    'bg-amber-950/60 border-amber-500/80 text-amber-200 hover:border-amber-400';
                } else if (entry.status === 'ACTIVE') {
                  cellStyle =
                    'bg-[#0d2215] border-emerald-700/70 text-emerald-300 hover:border-emerald-400';
                }

                return (
                  <button
                    key={entry.pinId}
                    type="button"
                    onClick={() => onSelectPin(entry.pinId)}
                    title={`Pin ${entry.pinNumber} ${entry.label}: ${entry.voltage.toFixed(2)}V (${entry.status})`}
                    className={`px-1 py-1 rounded-[2px] border text-left transition cursor-pointer flex flex-col leading-tight ${cellStyle} ${
                      isSelected ? 'ring-1 ring-amber-400 border-amber-400' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-0.5 text-[9.5px] font-bold">
                      <span>{entry.pinNumber}</span>
                      <span className="truncate text-[8px] opacity-80">
                        {entry.label.replace(/_SIG|_2/g, '').slice(0, 4)}
                      </span>
                    </div>
                    <span className="text-[9px] tabular-nums font-semibold truncate">
                      {entry.compactReadout}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active Pin Detail Strip */}
            {activePinEntry && (
              <div className="hw-lcd-well px-2 py-1.5 rounded-[2px] text-[9.5px] flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-200 truncate">
                    PIN {activePinEntry.pinNumber} ({activePinEntry.label}) ·{' '}
                    <span
                      className={
                        activePinEntry.status === 'FAULT'
                          ? 'text-rose-400'
                          : activePinEntry.status === 'WARNING'
                          ? 'text-amber-300'
                          : activePinEntry.status === 'ACTIVE'
                          ? 'text-emerald-400'
                          : 'text-slate-400'
                      }
                    >
                      {activePinEntry.status}
                    </span>
                  </span>
                  <span className="text-slate-300 tabular-nums shrink-0">
                    HEALTH:{' '}
                    <strong
                      className={
                        activePinEntry.healthPercent === null
                          ? 'text-slate-500'
                          : activePinEntry.healthPercent >= 85
                          ? 'text-emerald-400'
                          : activePinEntry.healthPercent >= 50
                          ? 'text-amber-300'
                          : 'text-rose-400'
                      }
                    >
                      {activePinEntry.healthPercent !== null
                        ? `${activePinEntry.healthPercent}%`
                        : '—'}
                    </strong>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-slate-400">
                  <span className="truncate">SIGNAL: {activePinEntry.signalKind}</span>
                  <span className="tabular-nums shrink-0 text-amber-300 font-semibold">
                    {activePinEntry.voltage.toFixed(2)}V · {activePinEntry.currentMa.toFixed(1)}mA
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Module 2: Fault Diagnostics & Harness Continuity Switcher */}
          <div className="bg-[#151921] border border-[#2c3340] rounded-[2px] p-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between border-b border-[#252b36] pb-1 gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFaultTab('FAULTS')}
                  className={`px-1.5 py-0.5 rounded-[2px] text-[9.5px] font-bold uppercase cursor-pointer ${
                    faultTab === 'FAULTS'
                      ? 'bg-[#252c38] text-amber-300 border border-[#424d60]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Fault Diagnostics ({faultEntries.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFaultTab('CONTINUITY')}
                  className={`px-1.5 py-0.5 rounded-[2px] text-[9.5px] font-bold uppercase cursor-pointer ${
                    faultTab === 'CONTINUITY'
                      ? 'bg-[#252c38] text-emerald-300 border border-[#424d60]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Wires ({continuousWireCount}/{wires.length})
                </button>
              </div>
              <span className="text-[9px] text-slate-500 uppercase">PRIORITY</span>
            </div>

            {faultTab === 'FAULTS' ? (
              <div className="flex flex-col gap-1 max-h-44 overflow-y-auto pr-0.5">
                {faultEntries.length === 0 ? (
                  <div className="hw-lcd-well rounded-[2px] px-2.5 py-4 text-center flex flex-col items-center justify-center gap-1 text-[10px]">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-emerald-300 uppercase">
                      No Active Harness Faults
                    </span>
                    <span className="text-[9px] text-slate-500">
                      Click any wire on the canvas to simulate an open circuit, or inject faults in the Fault Matrix.
                    </span>
                  </div>
                ) : (
                  faultEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2 bg-[#0d1016] border border-[#262d39] px-2 py-1 rounded-[2px] text-[9.5px]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                          <span className="font-bold text-slate-200 shrink-0">
                            {entry.pinLabel}
                          </span>
                          <span className="text-slate-400 truncate">| {entry.condition}</span>
                        </div>
                        <div className="text-[8.5px] text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>Logged: {entry.timestampLabel}</span>
                          {entry.dtcCode && (
                            <span className="text-amber-300 font-bold">{entry.dtcCode}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={`px-1.5 py-0.5 rounded-[2px] text-[8.5px] font-bold uppercase border ${
                            entry.priority === 'CRITICAL'
                              ? 'bg-rose-950/90 border-rose-600/80 text-rose-200'
                              : 'bg-amber-950/90 border-amber-600/80 text-amber-200'
                          }`}
                        >
                          {entry.priority}
                        </span>
                        {entry.pinId && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectPin(entry.pinId!);
                              onAttachProbe('red', entry.pinId!, entry.pinLabel);
                            }}
                            title="Attach Red Probe (+) to this pin"
                            className="p-1 rounded-[2px] bg-[#1a202c] border border-[#343e50] text-slate-300 hover:text-amber-300 cursor-pointer"
                          >
                            <Crosshair className="w-3 h-3" />
                          </button>
                        )}
                        {entry.source === 'WIRE_CUT' && entry.wireId && (
                          <button
                            type="button"
                            onClick={() => onToggleCutWire(entry.wireId!)}
                            title="Repair Cut Wire"
                            className="p-1 rounded-[2px] bg-emerald-950/70 border border-emerald-700/70 text-emerald-300 hover:text-white cursor-pointer"
                          >
                            <Wrench className="w-3 h-3" />
                          </button>
                        )}
                        {entry.source === 'PIN_FAULT' && entry.pinId && onRemoveFault && (
                          <button
                            type="button"
                            onClick={() => onRemoveFault(entry.pinId!)}
                            title="Clear Pin Fault"
                            className="p-1 rounded-[2px] bg-emerald-950/70 border border-emerald-700/70 text-emerald-300 hover:text-white cursor-pointer"
                          >
                            <Wrench className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1 max-h-44 overflow-y-auto pr-0.5">
                {wires.map((w) => {
                  const continuous = !w.isCut;
                  return (
                    <div
                      key={`cont-${w.id}`}
                      className="flex items-center justify-between gap-2 bg-[#0d1016] border border-[#232934] px-2 py-1 rounded-[2px] text-[9.5px]"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleCutWire(w.id)}
                        className="flex items-center gap-2 min-w-0 cursor-pointer text-left flex-1"
                        title="Toggle wire continuity (Simulate Open Circuit / Repair)"
                      >
                        <span
                          className={`w-6 h-3.5 rounded-full p-0.5 flex items-center transition shrink-0 ${
                            continuous ? 'bg-emerald-600/80 justify-end' : 'bg-[#2a313e] justify-start'
                          }`}
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-white block" />
                        </span>
                        <span className="text-slate-200 font-semibold truncate">{w.label}</span>
                      </button>
                      <span
                        className={`font-bold shrink-0 ${
                          continuous ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {continuous ? 'CONTINUOUS' : 'OPEN'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Module 3: Simulated CAN Bus Load Chart */}
          <div className="bg-[#151921] border border-[#2c3340] rounded-[2px] p-2 flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between border-b border-[#252b36] pb-1">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-200">
                  CAN Bus Load
                </span>
                <span className="text-[8.5px] text-slate-500 uppercase">
                  {canSnapshot.sourceLabel}
                </span>
              </div>
              <div className="text-right">
                <div
                  className={`text-xs font-bold tabular-nums ${
                    canSnapshot.busState === 'BUS_OFF'
                      ? 'text-rose-400'
                      : canSnapshot.busState === 'DEGRADED'
                      ? 'text-amber-300'
                      : canSnapshot.busState === 'ACTIVE_SIMULATED'
                      ? 'text-emerald-400'
                      : 'text-slate-400'
                  }`}
                >
                  {canSnapshot.busState === 'BUS_OFF'
                    ? 'BUS OFF'
                    : `${avgCanLoad.toFixed(0)}% Avg.`}
                </div>
                <div className="text-[8.5px] text-slate-400 tabular-nums">
                  {canSnapshot.bitrateKbps > 0 ? `${canSnapshot.bitrateKbps} Kbps` : '0 Kbps'} ·{' '}
                  Δ{canSnapshot.differentialVoltageV.toFixed(2)}V
                </div>
              </div>
            </div>

            <div className="hw-lcd-well rounded-[2px] p-1.5 flex flex-col gap-1">
              <svg
                viewBox={`0 0 ${chartW} ${chartH}`}
                className="w-full h-16 overflow-visible"
                role="img"
                aria-label={`Simulated CAN Bus Load ${canSnapshot.loadPercent.toFixed(0)} percent`}
              >
                <defs>
                  <linearGradient id="canLoadAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={
                        canSnapshot.hasBusFault
                          ? '#ef4444'
                          : canSnapshot.busState === 'ACTIVE_SIMULATED'
                          ? '#22c55e'
                          : '#64748b'
                      }
                      stopOpacity="0.32"
                    />
                    <stop offset="100%" stopColor="#0b0e13" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {/* Reference grid lines at 25%, 50%, 75%, 100% */}
                {[0.25, 0.5, 0.75].map((pct) => {
                  const y = chartH - pct * (chartH - 8) - 4;
                  return (
                    <line
                      key={pct}
                      x1="0"
                      y1={y}
                      x2={chartW}
                      y2={y}
                      stroke="rgba(148, 163, 184, 0.14)"
                      strokeWidth="0.8"
                      strokeDasharray="2,3"
                    />
                  );
                })}
                {canAreaPath && <path d={canAreaPath} fill="url(#canLoadAreaGrad)" />}
                {canPolylinePoints && (
                  <polyline
                    fill="none"
                    stroke={
                      canSnapshot.hasBusFault
                        ? '#f87171'
                        : canSnapshot.busState === 'ACTIVE_SIMULATED'
                        ? '#34d399'
                        : '#64748b'
                    }
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                    points={canPolylinePoints}
                  />
                )}
              </svg>
              <div className="flex items-center justify-between text-[8.5px] text-slate-500 tabular-nums border-t border-[#1e2430] pt-1">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span className="text-slate-300 font-semibold">{canSnapshot.stateLabel}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
