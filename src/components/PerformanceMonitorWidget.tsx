/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useEffect, useState } from 'react';
import { Activity, Cpu, RotateCcw, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react';
import {
  getPerfSnapshot,
  PerfSnapshot,
  resetPerfCounters,
  subscribePerfReset,
} from '../utils/perfMonitor';

export const PerformanceMonitorWidget: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [snapshot, setSnapshot] = useState<PerfSnapshot>(() => getPerfSnapshot(false));

  useEffect(() => {
    const refresh = () => {
      setSnapshot(getPerfSnapshot(isExpanded));
    };

    refresh();

    const intervalMs = isExpanded ? 1000 : 1500;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refresh();
    }, intervalMs);

    const unsubReset = subscribePerfReset(refresh);

    const handleVisibility = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(timer);
      unsubReset();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isExpanded]);

  const { memory, counts, domNodes } = snapshot;

  const heapColorClass = !memory.supported
    ? 'text-slate-400'
    : memory.usagePercent >= 75
    ? 'text-rose-400'
    : memory.usagePercent >= 50
    ? 'text-amber-300'
    : 'text-emerald-300';

  const harnessRatio =
    counts.App > 0 ? Math.round((counts.WiringCanvas / counts.App) * 100) : 0;

  return (
    <div className="relative flex items-center">
      {/* Compact Inline Footer Readout Button */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        title="Toggle Runtime Heap & Render Cycle Monitor"
        className={`hw-btn flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono transition cursor-pointer whitespace-nowrap ${
          isExpanded
            ? 'hw-btn-blue'
            : 'text-[#d9e8fa]'
        }`}
      >
        <Cpu className="w-3 h-3 text-[#20d889] shrink-0" />
        <span className="tabular-nums">
          HEAP:{' '}
          <strong className={heapColorClass}>
            {memory.supported ? `${memory.usedMb.toFixed(1)} MB` : 'N/A'}
          </strong>
        </span>
        <span className="text-[#203653] hidden 2xl:inline">·</span>
        <span className="tabular-nums hidden 2xl:inline">
          HARNESS:{' '}
          <strong className="text-[#ffb020]">{counts.WiringCanvas}</strong>
          <span className="text-[#91a4bd]">/{counts.App}</span>
        </span>
        <span className="text-[#203653] hidden 2xl:inline">·</span>
        <span className="tabular-nums hidden 2xl:inline">
          MNA: <strong className="text-[#20d889]">{counts.MnaSolver}</strong>
        </span>
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-[#91a4bd]" />
        ) : (
          <ChevronUp className="w-3 h-3 text-[#91a4bd]" />
        )}
      </button>

      {/* Expandable Upward Diagnostic Popover */}
      {isExpanded && (
        <div
          role="region"
          aria-label="Runtime Performance & Render Cycle Monitor"
          className="fixed sm:absolute bottom-14 sm:bottom-full left-2 right-2 sm:left-auto sm:right-0 mb-0 sm:mb-2 sm:w-96 max-h-[70dvh] overflow-y-auto hud-panel border-[#203653] rounded-xl p-3 shadow-2xl z-50 text-[11px] font-mono text-[#eaf3ff]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#203653] pb-2 mb-2.5">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#19c8f5]" />
              <span className="font-hud text-xs font-bold tracking-wider text-[#eaf3ff] uppercase">
                Runtime Memory &amp; Render Telemetry
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSnapshot(getPerfSnapshot(true))}
                title="Refresh sample now"
                className="hw-btn p-1 rounded-md text-[#91a4bd] hover:text-[#19c8f5] transition cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={resetPerfCounters}
                title="Reset render cycle counters"
                className="hw-btn px-1.5 py-0.5 rounded-md text-[10px] text-[#d9e8fa] hover:text-[#ffb020] flex items-center gap-1 transition cursor-pointer"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* JS Heap Memory Section */}
          <div className="hw-lcd-well rounded-lg p-2.5 mb-2.5">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-[#91a4bd] uppercase tracking-wider">JS Heap Consumption</span>
              {memory.supported ? (
                <span className={`font-bold tabular-nums ${heapColorClass}`}>
                  {memory.usedMb.toFixed(1)} / {memory.totalMb.toFixed(1)} MB ({memory.usagePercent}%)
                </span>
              ) : (
                <span className="text-slate-500">Chromium performance.memory unavailable</span>
              )}
            </div>

            {memory.supported && (
              <>
                <div className="w-full h-1.5 bg-[#0a0c10] rounded-[1px] overflow-hidden border border-[#242b36] mb-1.5">
                  <div
                    className={`h-full transition-all duration-300 ${
                      memory.usagePercent >= 75
                        ? 'bg-rose-500'
                        : memory.usagePercent >= 50
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(4, (memory.usedMb / Math.max(1, memory.totalMb)) * 100)
                      )}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 tabular-nums">
                  <span>Heap Limit: {memory.limitMb.toFixed(0)} MB</span>
                  <span>DOM Nodes: {domNodes}</span>
                </div>
              </>
            )}

            {!memory.supported && (
              <div className="text-[10px] text-slate-400 tabular-nums">
                Active DOM Nodes: <strong className="text-emerald-300">{domNodes}</strong>
              </div>
            )}
          </div>

          {/* Render Cycle Counters */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider">
              <span>Committed Render Cycles</span>
              <span className="text-amber-300 tabular-nums">
                Harness/App Ratio: {harnessRatio}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <div className="hw-lcd-well rounded-[2px] px-2 py-1.5 flex items-center justify-between">
                <span className="text-amber-300 font-semibold">WiringCanvas</span>
                <span className="font-bold text-slate-100 tabular-nums">{counts.WiringCanvas}</span>
              </div>
              <div className="hw-lcd-well rounded-[2px] px-2 py-1.5 flex items-center justify-between">
                <span className="text-slate-200 font-semibold">App Shell</span>
                <span className="font-bold text-slate-100 tabular-nums">{counts.App}</span>
              </div>
              <div className="hw-lcd-well rounded-[2px] px-2 py-1.5 flex items-center justify-between">
                <span className="text-slate-300">DigitalMultimeter</span>
                <span className="font-bold text-slate-100 tabular-nums">{counts.DigitalMultimeter}</span>
              </div>
              <div className="hw-lcd-well rounded-[2px] px-2 py-1.5 flex items-center justify-between">
                <span className="text-slate-300">BenchPowerSupply</span>
                <span className="font-bold text-slate-100 tabular-nums">{counts.BenchPowerSupply}</span>
              </div>
              <div className="hw-lcd-well rounded-[2px] px-2 py-1.5 flex items-center justify-between">
                <span className="text-slate-300">FaultInjector</span>
                <span className="font-bold text-slate-100 tabular-nums">{counts.FaultInjector}</span>
              </div>
              <div className="hw-lcd-well rounded-[2px] px-2 py-1.5 flex items-center justify-between">
                <span className="text-emerald-300 font-semibold">MNA Solves</span>
                <span className="font-bold text-emerald-300 tabular-nums">{counts.MnaSolver}</span>
              </div>
            </div>
          </div>

          <p className="mt-2 pt-1.5 border-t border-[#242b36] text-[10px] font-sans text-slate-400 leading-snug">
            Isolated leaf monitor: polling does not trigger App or WiringCanvas re-renders. UI-only toggles should increment App without incrementing WiringCanvas or MNA Solves.
          </p>
        </div>
      )}
    </div>
  );
};
