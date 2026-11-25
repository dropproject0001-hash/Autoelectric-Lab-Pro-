/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Hand,
  RotateCcw,
  ScanSearch,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  DEFAULT_SCOPE_ZOOM,
  SCOPE_ZOOM_X_MAX,
  SCOPE_ZOOM_X_MIN,
  SCOPE_ZOOM_X_PRESETS,
  SCOPE_ZOOM_Y_MAX,
  SCOPE_ZOOM_Y_MIN,
  ScopeDragInteractionMode,
  ScopeZoomViewport,
  formatScopeTimeUnit,
  formatZoomFactor,
  getVisibleTimeWindowMs,
  isScopeZoomed,
  panScopeViewport,
  setScopePanCenter,
  stepScopeZoomX,
  stepScopeZoomY,
  zoomHorizontalAtAnchor,
} from '../utils/oscilloscopeZoomUtils';

export interface OscilloscopeZoomControlsProps {
  viewport: ScopeZoomViewport;
  onChangeViewport: (next: ScopeZoomViewport) => void;
  baseWindowMs: number;
  interactionMode: ScopeDragInteractionMode;
  onChangeInteractionMode: (mode: ScopeDragInteractionMode) => void;
  /** Optional normalized overview samples in [0..1] to draw a miniature capture trace inside the zoom lens rail. */
  overviewTrace?: number[];
  /** Compact density for floating overlay scopes. */
  compact?: boolean;
  /** Optional visual accent theme matching CRT cyan-slate or D3/Recharts phosphor chassis. */
  theme?: 'crt' | 'chassis';
  /** Number of horizontal graticule divisions used for time/div readout (default 10). */
  divisionsX?: number;
}

export const OscilloscopeZoomControls: React.FC<OscilloscopeZoomControlsProps> = ({
  viewport,
  onChangeViewport,
  baseWindowMs,
  interactionMode,
  onChangeInteractionMode,
  overviewTrace,
  compact = false,
  theme = 'chassis',
  divisionsX = 10,
}) => {
  const railRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number;
    startClientX: number;
    startPanX: number;
  } | null>(null);

  const zoomed = isScopeZoomed(viewport);
  const visibleWindow = getVisibleTimeWindowMs(baseWindowMs, viewport, divisionsX);
  const windowFraction = 1 / Math.max(1, viewport.zoomX);
  const lensLeftPct = viewport.panX * 100;
  const lensWidthPct = Math.max(4, windowFraction * 100);

  const borderCls = theme === 'crt' ? 'border-[#203653]' : 'border-[#2b323e]';
  const railBgCls = theme === 'crt' ? 'bg-[#050A12]' : 'bg-[#090d0b]';
  const activeAccentBtn =
    theme === 'crt'
      ? 'bg-[#1677FF]/25 border-[#19C8F5]/65 text-[#19C8F5] font-bold'
      : 'hw-btn-amber text-amber-300 font-bold';
  const inactiveBtn =
    theme === 'crt'
      ? 'bg-[#0b1320] border-[#203653] text-[#CBD8EA] hover:text-[#EAF3FF] hover:border-[#34547d]'
      : 'hw-btn text-slate-300 hover:text-white';

  const handleRailPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (!rail || viewport.zoomX <= 1) return;
    const rect = rail.getBoundingClientRect();
    if (rect.width <= 0) return;

    const clickRatio = (e.clientX - rect.left) / rect.width;
    const insideLens =
      clickRatio >= viewport.panX && clickRatio <= viewport.panX + windowFraction;

    let initialPanX = viewport.panX;
    if (!insideLens) {
      const jumped = setScopePanCenter(viewport, clickRatio);
      initialPanX = jumped.panX;
      onChangeViewport(jumped);
    }

    rail.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startPanX: initialPanX,
    };
  };

  const handleRailPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    const rail = railRef.current;
    if (!state?.active || !rail) return;
    const rect = rail.getBoundingClientRect();
    if (rect.width <= 0) return;
    const deltaGlobal = (e.clientX - state.startClientX) / rect.width;
    const maxPanX = Math.max(0, 1 - 1 / viewport.zoomX);
    const nextPanX = Math.max(0, Math.min(maxPanX, state.startPanX + deltaGlobal));
    onChangeViewport({
      ...viewport,
      panX: Number(nextPanX.toFixed(6)),
    });
  };

  const handleRailPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (state?.active && railRef.current?.hasPointerCapture(e.pointerId)) {
      railRef.current.releasePointerCapture(e.pointerId);
    }
    dragStateRef.current = null;
  };

  const overviewPolylinePoints =
    overviewTrace && overviewTrace.length >= 2
      ? overviewTrace
          .map((normY, idx) => {
            const x = (idx / (overviewTrace.length - 1)) * 100;
            const y = 20 - Math.max(0, Math.min(1, normY)) * 16;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
          })
          .join(' ')
      : null;

  return (
    <div
      aria-label="Oscilloscope Transient Zoom Controls"
      className={`flex flex-col gap-1.5 font-mono text-[10px] rounded-[3px] border ${borderCls} ${railBgCls} px-2.5 py-1.5`}
    >
      {/* Primary Zoom Toolbar Row */}
      <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5">
        {/* Horizontal Magnification Controls */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mr-0.5 whitespace-nowrap">
            H-ZOOM
          </span>

          <button
            type="button"
            onClick={() => onChangeViewport(stepScopeZoomX(viewport, 'out', 0.5))}
            disabled={viewport.zoomX <= SCOPE_ZOOM_X_MIN}
            aria-label="Zoom out horizontally"
            title="Zoom out timebase (or scroll wheel down on waveform)"
            className={`px-1.5 py-0.5 rounded-[2px] border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${inactiveBtn}`}
          >
            <ZoomOut className="w-3 h-3" aria-hidden="true" />
          </button>

          <div
            role="group"
            aria-label="Horizontal Zoom Magnification Presets"
            className="inline-flex items-center gap-0.5"
          >
            {(compact ? ([1, 2, 5, 10, 20] as const) : SCOPE_ZOOM_X_PRESETS).map((preset) => {
              const isSelected = Math.abs(viewport.zoomX - preset) < 0.08;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() =>
                    onChangeViewport(zoomHorizontalAtAnchor(viewport, preset, 0.5))
                  }
                  aria-pressed={isSelected}
                  className={`px-1.5 py-0.5 rounded-[2px] border tabular-nums transition cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${
                    isSelected ? activeAccentBtn : inactiveBtn
                  }`}
                >
                  {preset}×
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onChangeViewport(stepScopeZoomX(viewport, 'in', 0.5))}
            disabled={viewport.zoomX >= SCOPE_ZOOM_X_MAX}
            aria-label="Zoom in horizontally"
            title="Zoom in timebase (or scroll wheel up on waveform)"
            className={`px-1.5 py-0.5 rounded-[2px] border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${inactiveBtn}`}
          >
            <ZoomIn className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>

        {/* Vertical Magnification + Drag Mode + Reset */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Vertical Gain Zoom */}
          <div
            role="group"
            aria-label="Vertical Voltage Magnification"
            className="inline-flex items-center gap-0.5"
          >
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mr-0.5 whitespace-nowrap">
              V-ZOOM
            </span>
            <button
              type="button"
              onClick={() => onChangeViewport(stepScopeZoomY(viewport, 'out', 0.5))}
              disabled={viewport.zoomY <= SCOPE_ZOOM_Y_MIN}
              aria-label="Decrease vertical magnification"
              title="Decrease vertical voltage magnification"
              className={`px-1.5 py-0.5 rounded-[2px] border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${inactiveBtn}`}
            >
              −
            </button>
            <span
              data-testid="scope-vzoom-readout"
              className="min-w-[30px] text-center font-bold tabular-nums text-amber-300"
            >
              {formatZoomFactor(viewport.zoomY)}
            </span>
            <button
              type="button"
              onClick={() => onChangeViewport(stepScopeZoomY(viewport, 'in', 0.5))}
              disabled={viewport.zoomY >= SCOPE_ZOOM_Y_MAX}
              aria-label="Increase vertical magnification"
              title="Magnify voltage axis to inspect ripple & transient spikes"
              className={`px-1.5 py-0.5 rounded-[2px] border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${inactiveBtn}`}
            >
              +
            </button>
          </div>

          {/* Pointer Tool Mode: Box Zoom vs Pan */}
          <div
            role="group"
            aria-label="Waveform Pointer Tool Mode"
            className="inline-flex items-center gap-0.5"
          >
            <button
              type="button"
              onClick={() => onChangeInteractionMode('ZOOM_BOX')}
              aria-pressed={interactionMode === 'ZOOM_BOX'}
              title="Drag across waveform to zoom directly into a transient window"
              className={`px-1.5 py-0.5 rounded-[2px] border flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${
                interactionMode === 'ZOOM_BOX' ? activeAccentBtn : inactiveBtn
              }`}
            >
              <ScanSearch className="w-3 h-3" aria-hidden="true" />
              <span className="hidden sm:inline">Box</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeInteractionMode('PAN')}
              aria-pressed={interactionMode === 'PAN'}
              title="Drag waveform to pan horizontally and vertically while zoomed"
              className={`px-1.5 py-0.5 rounded-[2px] border flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${
                interactionMode === 'PAN' ? activeAccentBtn : inactiveBtn
              }`}
            >
              <Hand className="w-3 h-3" aria-hidden="true" />
              <span className="hidden sm:inline">Pan</span>
            </button>
          </div>

          {/* Reset 1x */}
          <button
            type="button"
            onClick={() => onChangeViewport(DEFAULT_SCOPE_ZOOM)}
            disabled={!zoomed}
            aria-label="Reset oscilloscope zoom to 1x"
            title="Reset horizontal and vertical zoom to 1× (or double-click screen)"
            className={`px-1.5 py-0.5 rounded-[2px] border flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${inactiveBtn}`}
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            <span>1×</span>
          </button>
        </div>
      </div>

      {/* Calibrated Inline Zoom Telemetry Line (zero decorative pills, strict tabular monospace) */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[9.5px] text-slate-400 tabular-nums">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>
            SCALE:{' '}
            <strong className="text-emerald-300">
              {formatScopeTimeUnit(visibleWindow.msPerDiv)}/div
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            WINDOW:{' '}
            <strong className="text-slate-200">
              {formatScopeTimeUnit(visibleWindow.startMs)}–{formatScopeTimeUnit(visibleWindow.endMs)}
            </strong>{' '}
            ({formatScopeTimeUnit(visibleWindow.spanMs)})
          </span>
          {zoomed && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-cyan-300 font-semibold">
                MAG {formatZoomFactor(viewport.zoomX)} H / {formatZoomFactor(viewport.zoomY)} V
              </span>
            </>
          )}
        </div>
        <span className="hidden md:inline text-slate-500">
          Wheel: Zoom · Drag: {interactionMode === 'ZOOM_BOX' ? 'Select Transient' : 'Pan View'} · Dbl-Click: Reset
        </span>
      </div>

      {/* Hardware DSO Capture Overview Minimap Scrubber (shown whenever horizontally zoomed) */}
      {viewport.zoomX > 1.001 && (
        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => onChangeViewport(panScopeViewport(viewport, 0.25, 0))}
            disabled={viewport.panX <= 0.0001}
            aria-label="Pan waveform window left"
            title="Step zoomed window earlier in capture"
            className={`p-0.5 rounded-[2px] border cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${inactiveBtn}`}
          >
            <ChevronLeft className="w-3 h-3" aria-hidden="true" />
          </button>

          <div
            ref={railRef}
            role="slider"
            tabIndex={0}
            aria-label="Oscilloscope zoomed time window position"
            aria-valuemin={0}
            aria-valuemax={Number(baseWindowMs.toFixed(2))}
            aria-valuenow={Number(visibleWindow.startMs.toFixed(2))}
            aria-valuetext={`${formatScopeTimeUnit(visibleWindow.startMs)} to ${formatScopeTimeUnit(visibleWindow.endMs)}`}
            onPointerDown={handleRailPointerDown}
            onPointerMove={handleRailPointerMove}
            onPointerUp={handleRailPointerUp}
            onPointerCancel={handleRailPointerUp}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                onChangeViewport(panScopeViewport(viewport, 0.15, 0));
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                onChangeViewport(panScopeViewport(viewport, -0.15, 0));
              } else if (e.key === 'Home') {
                e.preventDefault();
                onChangeViewport({ ...viewport, panX: 0 });
              } else if (e.key === 'End') {
                e.preventDefault();
                onChangeViewport({
                  ...viewport,
                  panX: Math.max(0, 1 - 1 / viewport.zoomX),
                });
              }
            }}
            className={`relative flex-1 h-5 rounded-[2px] border ${borderCls} bg-[#03070b] overflow-hidden cursor-ew-resize select-none touch-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400`}
          >
            {/* Optional miniature full-capture waveform preview */}
            {overviewPolylinePoints && (
              <svg
                viewBox="0 0 100 22"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full pointer-events-none opacity-65"
                aria-hidden="true"
              >
                <polyline
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="1.2"
                  vectorEffect="non-scaling-stroke"
                  points={overviewPolylinePoints}
                />
              </svg>
            )}

            {/* Shaded out-of-window regions */}
            <div
              className="absolute inset-y-0 left-0 bg-black/55 pointer-events-none"
              style={{ width: `${lensLeftPct}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 bg-black/55 pointer-events-none"
              style={{ width: `${Math.max(0, 100 - lensLeftPct - lensWidthPct)}%` }}
            />

            {/* Highlighted active zoom viewport lens */}
            <div
              className="absolute inset-y-0 border-x-2 border-y border-cyan-400 bg-cyan-400/15 pointer-events-none"
              style={{
                left: `${lensLeftPct}%`,
                width: `${lensWidthPct}%`,
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => onChangeViewport(panScopeViewport(viewport, -0.25, 0))}
            disabled={viewport.panX >= 1 - windowFraction - 0.0001}
            aria-label="Pan waveform window right"
            title="Step zoomed window later in capture"
            className={`p-0.5 rounded-[2px] border cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${inactiveBtn}`}
          >
            <ChevronRight className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};
