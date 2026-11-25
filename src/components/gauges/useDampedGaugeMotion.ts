/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useMotionValueEvent, useReducedMotion, useSpring } from 'motion/react';

export interface GaugeSpringConfig {
  stiffness?: number;
  damping?: number;
  mass?: number;
}

export const DEFAULT_GAUGE_SPRING: Required<GaugeSpringConfig> = {
  stiffness: 185,
  damping: 23,
  mass: 0.5,
};

export function computeNormalizedGaugeRatio(value: number, min: number, max: number): number {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return 0;
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.max(min, Math.min(max, value));
  return (clamped - min) / span;
}

export function computeGaugeNeedleAngleDeg(
  normalizedRatio: number,
  startAngleDeg: number,
  sweepAngleDeg: number
): number {
  const safeRatio = Number.isFinite(normalizedRatio)
    ? Math.max(0, Math.min(1, normalizedRatio))
    : 0;
  return startAngleDeg + safeRatio * sweepAngleDeg;
}

export function computeArcDashOffset(
  normalizedRatio: number,
  pathLengthUnits = 1000
): number {
  const safeRatio = Number.isFinite(normalizedRatio)
    ? Math.max(0, Math.min(1, normalizedRatio))
    : 0;
  return pathLengthUnits * (1 - safeRatio);
}

export function buildClockwiseArcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
  angleOffsetDeg = -90
): string {
  const toXY = (deg: number) => {
    const rad = ((deg + angleOffsetDeg) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  };
  const start = toXY(startDeg);
  const end = toXY(endDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? '1' : '0';
  const sweepFlag = endDeg >= startDeg ? '1' : '0';
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export interface UseDampedGaugeMotionOptions {
  value: number;
  min: number;
  max: number;
  startAngleDeg: number;
  sweepAngleDeg: number;
  arcPathLengthUnits?: number;
  springConfig?: GaugeSpringConfig;
}

/**
 * Synchronizes an analog SVG gauge needle and active sweep arc using Framer Motion's
 * damped spring physics at 60-120fps without triggering per-frame React re-renders or
 * React reconciliation overwrite flicker on telemetry updates.
 * Respects `prefers-reduced-motion` by snapping instantaneously when requested.
 */
export function useDampedGaugeMotion({
  value,
  min,
  max,
  startAngleDeg,
  sweepAngleDeg,
  arcPathLengthUnits = 1000,
  springConfig = DEFAULT_GAUGE_SPRING,
}: UseDampedGaugeMotionOptions) {
  const shouldReduceMotion = useReducedMotion();
  const targetNormalized = computeNormalizedGaugeRatio(value, min, max);

  const springNormalized = useSpring(targetNormalized, {
    stiffness: springConfig.stiffness ?? DEFAULT_GAUGE_SPRING.stiffness,
    damping: springConfig.damping ?? DEFAULT_GAUGE_SPRING.damping,
    mass: springConfig.mass ?? DEFAULT_GAUGE_SPRING.mass,
  });

  const needleRef = useRef<SVGGElement | null>(null);
  const arcRef = useRef<SVGPathElement | null>(null);
  const currentRatioRef = useRef<number>(targetNormalized);

  const applyFrameToDom = useCallback(
    (ratio: number) => {
      currentRatioRef.current = ratio;
      const deg = computeGaugeNeedleAngleDeg(ratio, startAngleDeg, sweepAngleDeg);
      if (needleRef.current) {
        needleRef.current.style.transform = `rotate(${deg.toFixed(2)}deg)`;
      }
      if (arcRef.current) {
        const offset = computeArcDashOffset(ratio, arcPathLengthUnits);
        arcRef.current.style.strokeDashoffset = `${offset.toFixed(2)}`;
        arcRef.current.style.opacity = ratio <= 0.004 ? '0' : '1';
      }
    },
    [startAngleDeg, sweepAngleDeg, arcPathLengthUnits]
  );

  // Sync initial frame synchronously before first paint; never re-overwrites spring on value updates
  useLayoutEffect(() => {
    applyFrameToDom(currentRatioRef.current);
  }, [applyFrameToDom]);

  useEffect(() => {
    if (shouldReduceMotion) {
      springNormalized.jump(targetNormalized);
      applyFrameToDom(targetNormalized);
    } else {
      springNormalized.set(targetNormalized);
    }
  }, [targetNormalized, shouldReduceMotion, springNormalized, applyFrameToDom]);

  useMotionValueEvent(springNormalized, 'change', (latest) => {
    applyFrameToDom(latest);
  });

  return {
    needleRef,
    arcRef,
    arcPathLengthUnits,
    shouldReduceMotion: Boolean(shouldReduceMotion),
  };
}
