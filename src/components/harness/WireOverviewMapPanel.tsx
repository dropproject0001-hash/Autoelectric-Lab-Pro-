/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Cable,
  Crosshair,
  Disc,
  Scissors,
  Search,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import type { BenchComponent, EcuPin, WireConnection } from '../../types/ecu';
import {
  buildWireOverviewMap,
  filterWireOverviewEntries,
  type WireOverviewEntry,
  type WireOverviewFilterMode,
  type WireOverviewSortMode,
} from '../../simulation/telemetry/harnessDiagnostics';
import { isCustomWireConnection } from '../../utils/wireLabelUtils';

export interface WireOverviewMapPanelProps {
  isOpen: boolean;
  onClose: () => void;
  pins: EcuPin[];
  components: BenchComponent[];
  wires: WireConnection[];
  nodeVoltages: Record<string, number>;
  wireCurrentsMa?: Record<string, number>;
  isPowerOn: boolean;
  focusedWireId: string | null;
  onFocusWire: (wireId: string | null) => void;
  onSelectPin: (pinId: string) => void;
  onAttachProbe: (color: 'red' | 'black', pinId: string, label: string) => void;
  onToggleCutWire: (wireId: string) => void;
  onDeleteWire?: (wireId: string) => void;
}

const GROUP_BADGE: Record<WireOverviewEntry['sourceGroup'], { text: string; cls: string }> = {
  ECU: { text: 'ECU', cls: 'border-amber-700/70 bg-amber-950/50 text-amber-300' },
  COMPONENT: { text: 'CMP', cls: 'border-cyan-700/70 bg-cyan-950/50 text-cyan-300' },
  RAIL: { text: 'RAIL', cls: 'border-slate-600/80 bg-slate-900/70 text-slate-300' },
};

export const WireOverviewMapPanel: React.FC<WireOverviewMapPanelProps> = ({
  isOpen,
  onClose,
  pins,
  components,
  wires,
  nodeVoltages,
  wireCurrentsMa,
  isPowerOn,
  focusedWireId,
  onFocusWire,
  onSelectPin,
  onAttachProbe,
  onToggleCutWire,
  onDeleteWire,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<WireOverviewFilterMode>('ACTIVE');
  const [sortMode, setSortMode] = useState<WireOverviewSortMode>('DEFAULT');

  const wireById = useMemo(() => new Map(wires.map((w) => [w.id, w])), [wires]);

  const { entries, summary } = useMemo(
    () =>
      buildWireOverviewMap({
        pins,
        components,
        wires,
        nodeVoltages,
        wireCurrentsMa,
        isPowerOn,
      }),
    [pins, components, wires, nodeVoltages, wireCurrentsMa, isPowerOn]
  );

  const visibleEntries = useMemo(
    () =>
      filterWireOverviewEntries({
        entries,
        query: searchQuery,
        filterMode,
        sortMode,
      }),
    [entries, searchQuery, filterMode, sortMode]
  );

  if (!isOpen) return null;

  return (
    <aside
      data-testid="wire-overview-map-panel"
      aria-label="Wire Overview Map"
      className="absolute top-12 bottom-2 right-2 z-30 w-[calc(100%-1rem)] sm:w-[400px] lg:w-[430px] bg-[#11151d]/98 border border-[#3a4354] rounded-[3px] shadow-2xl flex flex-col overflow-hidden font-mono text-xs backdrop-blur-md"
    >
      {/* Panel Header */}
      <div className="px-3 py-2 bg-[#161b25] border-b border-[#2c3442] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Cable className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-100 truncate">
              Wire Overview Map
            </h3>
            <p className="text-[9.5px] text-slate-400 tabular-nums truncate">
              {summary.activeWires} active · {summary.energizedWires} energized
              {summary.cutWires > 0 ? ` · ${summary.cutWires} open` : ''}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close Wire Overview Map"
          className="p-1 rounded-[2px] text-slate-400 hover:text-white hover:bg-[#242b38] transition cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search & Filter Controls */}
      <div className="p-2.5 bg-[#0e1218] border-b border-[#252c38] flex flex-col gap-2 shrink-0">
        <div className="flex items-center gap-1.5 bg-[#090c11] border border-[#2f3848] rounded-[2px] px-2 py-1 focus-within:border-amber-400">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ID, pin, component, label, or Ω..."
            aria-label="Search Wire Overview Map"
            className="flex-1 min-w-0 bg-transparent text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear wire overview search"
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-[#151a24] border border-[#2a3140] rounded-[2px] p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setFilterMode('ACTIVE')}
              className={`px-2 py-0.5 rounded-[2px] font-bold cursor-pointer transition ${
                filterMode === 'ACTIVE'
                  ? 'bg-[#252d3c] text-emerald-300 border border-[#3e4a5f]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Active ({summary.activeWires})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('ALL')}
              className={`px-2 py-0.5 rounded-[2px] font-bold cursor-pointer transition ${
                filterMode === 'ALL'
                  ? 'bg-[#252d3c] text-amber-300 border border-[#3e4a5f]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({summary.totalWires})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('CUT')}
              className={`px-2 py-0.5 rounded-[2px] font-bold cursor-pointer transition ${
                filterMode === 'CUT'
                  ? 'bg-[#252d3c] text-rose-300 border border-[#3e4a5f]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Open ({summary.cutWires})
            </button>
          </div>

          <div className="flex items-center gap-1 text-[10px]">
            <label htmlFor="wire-overview-sort" className="text-slate-500 uppercase text-[9px]">
              Sort:
            </label>
            <select
              id="wire-overview-sort"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as WireOverviewSortMode)}
              className="bg-[#151a24] border border-[#2a3140] rounded-[2px] px-1.5 py-0.5 text-[10px] text-slate-200 focus:outline-none focus:border-amber-400 cursor-pointer"
            >
              <option value="DEFAULT">Harness Order</option>
              <option value="RESISTANCE_DESC">Resistance (High → Low)</option>
              <option value="RESISTANCE_ASC">Resistance (Low → High)</option>
              <option value="CURRENT_DESC">Current (mA ↓)</option>
              <option value="SOURCE_ID">Source ID (A → Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Scrollable Wire Connections List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1.5 bg-[#0b0e14]">
        {visibleEntries.length === 0 ? (
          <div className="hw-lcd-well rounded-[2px] p-6 text-center flex flex-col items-center justify-center gap-1.5 my-auto">
            <Cable className="w-5 h-5 text-slate-500" />
            <span className="text-[11px] font-bold text-slate-300">
              No matching wire connections
            </span>
            <span className="text-[10px] text-slate-500">
              {searchQuery
                ? 'Try searching a pin ID (e.g. ecu-pin-7, comp-tps), label, or Ω value.'
                : filterMode === 'CUT'
                ? 'All harness conductors are currently continuous.'
                : 'No wires are routed in this bench configuration.'}
            </span>
          </div>
        ) : (
          visibleEntries.map((entry) => {
            const wireObj = wireById.get(entry.wireId);
            const isCustom = wireObj ? isCustomWireConnection(wireObj) : false;
            const isFocused = focusedWireId === entry.wireId;
            const srcBadge = GROUP_BADGE[entry.sourceGroup];
            const tgtBadge = GROUP_BADGE[entry.targetGroup];

            return (
              <div
                key={entry.wireId}
                data-testid={`wire-overview-row-${entry.wireId}`}
                onMouseEnter={() => onFocusWire(entry.wireId)}
                onMouseLeave={() => onFocusWire(null)}
                className={`rounded-[2px] border p-2 transition flex flex-col gap-1.5 ${
                  isFocused
                    ? 'bg-[#171d28] border-amber-400/80 shadow-md'
                    : entry.isCut
                    ? 'bg-[#141116] border-rose-900/60 hover:border-rose-600/80'
                    : 'bg-[#12161f] border-[#252d3b] hover:border-[#3e495e]'
                }`}
              >
                {/* Row 1: Wire identity + Resistance + Status */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-white/40 shrink-0"
                      style={{ backgroundColor: entry.isCut ? '#475569' : entry.color }}
                    />
                    <span className="font-bold text-[11px] text-slate-100 truncate">
                      {entry.wireLabel}
                    </span>
                    <span className="text-[9px] text-slate-500 shrink-0">
                      [{entry.wireId}]
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`px-1.5 py-0.5 rounded-[2px] border text-[10px] font-bold tabular-nums ${
                        entry.isCut
                          ? 'bg-rose-950/70 border-rose-700/70 text-rose-300'
                          : entry.isHighResistance
                          ? 'bg-amber-950/70 border-amber-600/70 text-amber-300'
                          : 'bg-[#090c11] border-[#2e3746] text-emerald-300'
                      }`}
                      title="Configured conductor resistance"
                    >
                      {entry.resistanceFormatted}
                    </span>

                    <span
                      className={`px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold uppercase border ${
                        entry.isCut
                          ? 'bg-rose-950/80 border-rose-700 text-rose-300'
                          : entry.isEnergized
                          ? 'bg-amber-950/70 border-amber-600/80 text-amber-300'
                          : 'bg-emerald-950/60 border-emerald-700/70 text-emerald-300'
                      }`}
                    >
                      {entry.isCut ? 'OPEN' : entry.isEnergized ? 'LIVE' : 'ACTIVE'}
                    </span>
                  </div>
                </div>

                {/* Row 2: Source -> Target Endpoint Identifiers */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 bg-[#090c12] border border-[#1f2633] rounded-[2px] px-2 py-1.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span
                        className={`px-1 py-0 text-[8px] font-bold rounded-[2px] border shrink-0 ${srcBadge.cls}`}
                      >
                        {srcBadge.text}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-200 truncate">
                        {entry.sourceDisplayName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <code className="text-[9px] text-slate-400 truncate">
                        {entry.sourcePinId}
                      </code>
                      <span className="text-[9px] text-slate-300 tabular-nums shrink-0">
                        {entry.sourceVoltage.toFixed(2)}V
                      </span>
                    </div>
                  </div>

                  <ArrowRight
                    className={`w-3.5 h-3.5 shrink-0 ${
                      entry.isCut
                        ? 'text-rose-500 opacity-60'
                        : entry.isEnergized
                        ? 'text-amber-400'
                        : 'text-slate-500'
                    }`}
                  />

                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span
                        className={`px-1 py-0 text-[8px] font-bold rounded-[2px] border shrink-0 ${tgtBadge.cls}`}
                      >
                        {tgtBadge.text}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-200 truncate">
                        {entry.targetDisplayName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <code className="text-[9px] text-slate-400 truncate">
                        {entry.targetPinId}
                      </code>
                      <span className="text-[9px] text-slate-300 tabular-nums shrink-0">
                        {entry.targetVoltage.toFixed(2)}V
                      </span>
                    </div>
                  </div>
                </div>

                {/* Row 3: Live Current/Drop Telemetry + Quick Actions */}
                <div className="flex items-center justify-between gap-2 text-[9.5px]">
                  <div className="flex items-center gap-2 text-slate-400 tabular-nums">
                    <span>
                      I: <strong className="text-slate-200">{entry.currentMa.toFixed(1)} mA</strong>
                    </span>
                    <span>
                      ΔV: <strong className="text-slate-200">{entry.voltageDropV.toFixed(3)} V</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onFocusWire(entry.wireId);
                        onSelectPin(entry.sourcePinId);
                      }}
                      title={`Highlight wire & focus ${entry.sourcePinId}`}
                      className="px-1.5 py-0.5 rounded-[2px] bg-[#181f2c] border border-[#2f394b] text-slate-300 hover:text-amber-300 hover:border-amber-500/60 flex items-center gap-1 cursor-pointer"
                    >
                      <Crosshair className="w-3 h-3" />
                      <span>Focus</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onAttachProbe('red', entry.targetPinId, entry.targetDisplayName)}
                      title={`Move Red Probe (+) to ${entry.targetPinId}`}
                      className="px-1.5 py-0.5 rounded-[2px] bg-rose-950/40 border border-rose-700/60 text-rose-300 hover:bg-rose-900/60 flex items-center gap-1 cursor-pointer"
                    >
                      <Disc className="w-3 h-3 text-rose-400" />
                      <span>+Probe</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleCutWire(entry.wireId)}
                      title={entry.isCut ? 'Repair cut wire' : 'Cut wire to simulate open circuit'}
                      className={`px-1.5 py-0.5 rounded-[2px] border flex items-center gap-1 cursor-pointer ${
                        entry.isCut
                          ? 'bg-emerald-950/60 border-emerald-700/70 text-emerald-300 hover:text-white'
                          : 'bg-[#181f2c] border-[#2f394b] text-slate-300 hover:text-rose-300 hover:border-rose-700/70'
                      }`}
                    >
                      {entry.isCut ? (
                        <>
                          <Wrench className="w-3 h-3" />
                          <span>Repair</span>
                        </>
                      ) : (
                        <>
                          <Scissors className="w-3 h-3" />
                          <span>Cut</span>
                        </>
                      )}
                    </button>

                    {isCustom && onDeleteWire && (
                      <button
                        type="button"
                        onClick={() => onDeleteWire(entry.wireId)}
                        title="Delete custom wire"
                        aria-label={`Delete wire ${entry.wireLabel}`}
                        className="p-1 rounded-[2px] bg-[#181f2c] border border-[#2f394b] text-slate-400 hover:text-rose-400 hover:border-rose-700/70 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Panel Footer */}
      <div className="px-3 py-1.5 bg-[#141821] border-t border-[#262d3a] flex items-center justify-between text-[9.5px] text-slate-400 shrink-0">
        <span className="tabular-nums">
          Showing {visibleEntries.length} of {summary.totalWires} wires
        </span>
        <span className="text-slate-500">Hover row to highlight on harness</span>
      </div>
    </aside>
  );
};
