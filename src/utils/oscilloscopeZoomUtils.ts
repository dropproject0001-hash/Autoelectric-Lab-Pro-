/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

/**
 * Pure viewport & magnification math for lab-bench oscilloscope transient analysis.
 * Supports horizontal timebase magnification (1x-50x), horizontal window panning,
 * vertical voltage gain zoom (1x-10x), vertical centering, cursor-anchored wheel zoom,
 * and click-and-drag region box zoom.
 */

export interface ScopeZoomViewport {
  /** Horizontal magnification multiplier (1 = full capture window, up to 50x for rapid transients). */
  zoomX: number;
  /** Normalized horizontal start offset in [0, 1 - 1 / zoomX]. */
  panX: number;
  /** Vertical voltage magnification multiplier (1 = nominal V/div, up to 10x for ripple detail). */
  zoomY: number;
  /** Normalized vertical offset in [-(1 - 1 / zoomY) / 2, +(1 - 1 / zoomY) / 2] (0 = centered). */
  panY: number;
}

export interface VisibleTimeWindow {
  startMs: number;
  endMs: number;
  spanMs: number;
  msPerDiv: number;
}

export type ScopeDragInteractionMode = 'ZOOM_BOX' | 'PAN';

export const SCOPE_ZOOM_X_MIN = 1;
export const SCOPE_ZOOM_X_MAX = 50;
export const SCOPE_ZOOM_Y_MIN = 1;
export const SCOPE_ZOOM_Y_MAX = 10;

export const SCOPE_ZOOM_X_PRESETS = [1, 2, 5, 10, 20, 50] as const;
export const SCOPE_ZOOM_Y_PRESETS = [1, 2, 5, 10] as const;

/** Classic 1-2-5 lab oscilloscope detent sequence for horizontal magnification. */
const ZOOM_X_DETENTS = [1, 1.5, 2, 3, 5, 7.5, 10, 15, 20, 30, 50] as const;

/** Lab detent sequence for vertical voltage magnification. */
const ZOOM_Y_DETENTS = [1, 1.5, 2, 3, 5, 7.5, 10] as const;

export const DEFAULT_SCOPE_ZOOM: ScopeZoomViewport = {
  zoomX: 1,
  panX: 0,
  zoomY: 1,
  panY: 0,
};

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function isScopeZoomed(viewport: ScopeZoomViewport): boolean {
  return viewport.zoomX > 1.001 || viewport.zoomY > 1.001;
}

export function clampScopeZoom(
  partial: Partial<ScopeZoomViewport>
): ScopeZoomViewport {
  const rawZoomX = clampNumber(
    partial.zoomX ?? DEFAULT_SCOPE_ZOOM.zoomX,
    SCOPE_ZOOM_X_MIN,
    SCOPE_ZOOM_X_MAX
  );
  const rawZoomY = clampNumber(
    partial.zoomY ?? DEFAULT_SCOPE_ZOOM.zoomY,
    SCOPE_ZOOM_Y_MIN,
    SCOPE_ZOOM_Y_MAX
  );

  const zoomX = rawZoomX <= 1.001 ? 1 : Number(rawZoomX.toFixed(3));
  const zoomY = rawZoomY <= 1.001 ? 1 : Number(rawZoomY.toFixed(3));

  const maxPanX = Math.max(0, 1 - 1 / zoomX);
  const panX =
    zoomX <= 1
      ? 0
      : Number(clampNumber(partial.panX ?? 0, 0, maxPanX).toFixed(6));

  const maxAbsPanY = Math.max(0, (1 - 1 / zoomY) / 2);
  const panY =
    zoomY <= 1
      ? 0
      : Number(clampNumber(partial.panY ?? 0, -maxAbsPanY, maxAbsPanY).toFixed(6));

  return { zoomX, panX, zoomY, panY };
}

/**
 * Applies horizontal zoom while keeping the signal point at `anchorRatio` (0 = left edge,
 * 0.5 = center, 1 = right edge of the currently visible viewport) stationary on screen.
 */
export function zoomHorizontalAtAnchor(
  viewport: ScopeZoomViewport,
  nextZoomX: number,
  anchorRatio = 0.5
): ScopeZoomViewport {
  const safeAnchor = clampNumber(anchorRatio, 0, 1);
  const clampedNextX = clampNumber(nextZoomX, SCOPE_ZOOM_X_MIN, SCOPE_ZOOM_X_MAX);
  const currentSpan = 1 / Math.max(SCOPE_ZOOM_X_MIN, viewport.zoomX);
  const anchorGlobal = viewport.panX + safeAnchor * currentSpan;
  const nextSpan = 1 / clampedNextX;
  const nextPanX = anchorGlobal - safeAnchor * nextSpan;
  return clampScopeZoom({
    ...viewport,
    zoomX: clampedNextX,
    panX: nextPanX,
  });
}

/**
 * Applies vertical gain zoom while anchoring around `anchorRatio` (0 = bottom, 0.5 = center, 1 = top).
 */
export function zoomVerticalAtAnchor(
  viewport: ScopeZoomViewport,
  nextZoomY: number,
  anchorRatio = 0.5
): ScopeZoomViewport {
  const safeAnchor = clampNumber(anchorRatio, 0, 1);
  const clampedNextY = clampNumber(nextZoomY, SCOPE_ZOOM_Y_MIN, SCOPE_ZOOM_Y_MAX);
  const currentSpan = 1 / Math.max(SCOPE_ZOOM_Y_MIN, viewport.zoomY);
  const currentBottom = 0.5 + viewport.panY - currentSpan / 2;
  const anchorGlobal = currentBottom + safeAnchor * currentSpan;
  const nextSpan = 1 / clampedNextY;
  const nextBottom = anchorGlobal - safeAnchor * nextSpan;
  const nextPanY = nextBottom + nextSpan / 2 - 0.5;
  return clampScopeZoom({
    ...viewport,
    zoomY: clampedNextY,
    panY: nextPanY,
  });
}

function findNextDetent(
  current: number,
  detents: readonly number[],
  direction: 'in' | 'out'
): number {
  const eps = 1e-3;
  if (direction === 'in') {
    for (let i = 0; i < detents.length; i++) {
      if (detents[i] > current + eps) return detents[i];
    }
    return detents[detents.length - 1];
  }
  for (let i = detents.length - 1; i >= 0; i--) {
    if (detents[i] < current - eps) return detents[i];
  }
  return detents[0];
}

export function stepScopeZoomX(
  viewport: ScopeZoomViewport,
  direction: 'in' | 'out',
  anchorRatio = 0.5
): ScopeZoomViewport {
  const nextZoomX = findNextDetent(viewport.zoomX, ZOOM_X_DETENTS, direction);
  return zoomHorizontalAtAnchor(viewport, nextZoomX, anchorRatio);
}

export function stepScopeZoomY(
  viewport: ScopeZoomViewport,
  direction: 'in' | 'out',
  anchorRatio = 0.5
): ScopeZoomViewport {
  const nextZoomY = findNextDetent(viewport.zoomY, ZOOM_Y_DETENTS, direction);
  return zoomVerticalAtAnchor(viewport, nextZoomY, anchorRatio);
}

/**
 * Pans the oscilloscope viewport by screen-space drag deltas.
 * Positive `deltaXScreenRatio` (dragging mouse right) reveals earlier time (decreases `panX`).
 * Positive `deltaYScreenRatio` (dragging mouse down) reveals higher voltages (increases `panY`).
 */
export function panScopeViewport(
  viewport: ScopeZoomViewport,
  deltaXScreenRatio: number,
  deltaYScreenRatio = 0
): ScopeZoomViewport {
  const safeDx = Number.isFinite(deltaXScreenRatio) ? deltaXScreenRatio : 0;
  const safeDy = Number.isFinite(deltaYScreenRatio) ? deltaYScreenRatio : 0;
  const nextPanX = viewport.panX - safeDx / Math.max(1, viewport.zoomX);
  const nextPanY = viewport.panY + safeDy / Math.max(1, viewport.zoomY);
  return clampScopeZoom({
    ...viewport,
    panX: nextPanX,
    panY: nextPanY,
  });
}

/**
 * Jumps horizontal pan directly so the overview minimap viewport centers on `centerGlobalRatio` (0..1).
 */
export function setScopePanCenter(
  viewport: ScopeZoomViewport,
  centerGlobalRatio: number
): ScopeZoomViewport {
  const span = 1 / Math.max(1, viewport.zoomX);
  const nextPanX = clampNumber(centerGlobalRatio, 0, 1) - span / 2;
  return clampScopeZoom({
    ...viewport,
    panX: nextPanX,
  });
}

/**
 * Zooms horizontally into a user-dragged region `[startScreenRatio, endScreenRatio]`
 * expressed in 0..1 coordinates of the current visible screen.
 * Ignores accidental micro-drags narrower than 2% of the viewport width.
 */
export function zoomToSelectionRange(
  viewport: ScopeZoomViewport,
  startScreenRatio: number,
  endScreenRatio: number
): ScopeZoomViewport {
  const r0 = clampNumber(Math.min(startScreenRatio, endScreenRatio), 0, 1);
  const r1 = clampNumber(Math.max(startScreenRatio, endScreenRatio), 0, 1);
  const selectionWidth = r1 - r0;
  if (selectionWidth < 0.02) {
    return viewport;
  }

  const currentSpan = 1 / Math.max(1, viewport.zoomX);
  const globalStart = viewport.panX + r0 * currentSpan;
  const globalEnd = viewport.panX + r1 * currentSpan;
  const globalSpan = Math.max(1 / SCOPE_ZOOM_X_MAX, globalEnd - globalStart);
  const targetZoomX = clampNumber(1 / globalSpan, SCOPE_ZOOM_X_MIN, SCOPE_ZOOM_X_MAX);
  const centerGlobal = (globalStart + globalEnd) / 2;
  const actualSpan = 1 / targetZoomX;

  return clampScopeZoom({
    ...viewport,
    zoomX: targetZoomX,
    panX: centerGlobal - actualSpan / 2,
  });
}

export function getVisibleTimeWindowMs(
  baseWindowMs: number,
  viewport: ScopeZoomViewport,
  divisionsX = 10
): VisibleTimeWindow {
  const safeBase = Math.max(0.05, Number.isFinite(baseWindowMs) ? baseWindowMs : 40);
  const clamped = clampScopeZoom(viewport);
  const spanMs = safeBase / clamped.zoomX;
  const startMs = clamped.panX * safeBase;
  const endMs = startMs + spanMs;
  const msPerDiv = spanMs / Math.max(1, divisionsX);
  return {
    startMs,
    endMs,
    spanMs,
    msPerDiv,
  };
}

export function getVisibleVoltageDomain(
  baseDomain: [number, number],
  viewport: ScopeZoomViewport
): [number, number] {
  const low = Number.isFinite(baseDomain[0]) ? baseDomain[0] : -1;
  const high = Number.isFinite(baseDomain[1]) ? baseDomain[1] : 6;
  const safeHigh = high > low ? high : low + 1;
  const baseSpan = safeHigh - low;
  const clamped = clampScopeZoom(viewport);

  if (clamped.zoomY <= 1) {
    return [low, safeHigh];
  }

  const visibleSpan = baseSpan / clamped.zoomY;
  const center = (low + safeHigh) / 2 + clamped.panY * baseSpan;
  return [
    Number((center - visibleSpan / 2).toFixed(3)),
    Number((center + visibleSpan / 2).toFixed(3)),
  ];
}

/**
 * Formats a time value (in ms) cleanly using scientific lab bench units (µs or ms).
 */
export function formatScopeTimeUnit(ms: number): string {
  const absMs = Math.abs(ms);
  const sign = ms < 0 ? '-' : '';
  if (absMs < 0.01) {
    return `${sign}${(absMs * 1000).toFixed(1)} µs`;
  }
  if (absMs < 0.1) {
    return `${sign}${(absMs * 1000).toFixed(1)} µs`;
  }
  if (absMs < 1) {
    return `${sign}${Math.round(absMs * 1000)} µs`;
  }
  if (absMs < 10) {
    return `${sign}${absMs.toFixed(2)} ms`;
  }
  if (absMs < 100) {
    return `${sign}${absMs.toFixed(1)} ms`;
  }
  return `${sign}${Math.round(absMs)} ms`;
}

/**
 * Formats an X-axis tick label with precision calibrated to the current visible time span.
 */
export function formatScopeTimeAxisTick(ms: number, visibleSpanMs: number): string {
  if (visibleSpanMs < 1) {
    const us = ms * 1000;
    return visibleSpanMs < 0.2 ? `${us.toFixed(1)}µs` : `${Math.round(us)}µs`;
  }
  if (visibleSpanMs < 5) {
    return `${ms.toFixed(2)}ms`;
  }
  if (visibleSpanMs < 25) {
    return `${ms.toFixed(1)}ms`;
  }
  return `${Math.round(ms)}ms`;
}

export function formatZoomFactor(zoom: number): string {
  if (Math.abs(zoom - Math.round(zoom)) < 0.05) {
    return `${Math.round(zoom)}×`;
  }
  return `${zoom.toFixed(1)}×`;
}
