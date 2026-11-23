import { useEffect, useRef, useState } from 'react';
import { playProbeTapSound } from '../../utils/audioFeedback';

export interface ProbePoint {
  x: number;
  y: number;
}

export interface ProbeFlightFrame {
  coords: ProbePoint;
  groundCoords: ProbePoint;
  tiltAngle: number;
  scale: number;
  shadowOpacity: number;
  easedProgress: number;
  arcLiftPx: number;
}

export interface ProbeTransitionState {
  coords: ProbePoint | null;
  groundCoords: ProbePoint | null;
  fromCoords: ProbePoint | null;
  toCoords: ProbePoint | null;
  fromLabel: string | null;
  toLabel: string | null;
  trailPathD: string | null;
  progress: number;
  isMoving: boolean;
  justLanded: boolean;
  trailVisible: boolean;
  tiltAngle: number;
  scale: number;
  shadowOpacity: number;
}

export interface UseProbeTransitionMotionOptions {
  pinId: string | null;
  pinLabel: string | null;
  targetCoords: ProbePoint | null;
  color: 'red' | 'black';
  originCoords: ProbePoint;
  durationMs?: number;
  liftScale?: number;
  playAudio?: boolean;
}

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function easeInOutCubic(t: number): number {
  const c = clampUnit(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

export function computeArcLiftPx(
  from: ProbePoint,
  to: ProbePoint,
  liftScale = 1
): number {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const rawLift = Math.min(48, Math.max(14, dist * 0.14)) * liftScale;
  const maxSafeLift = Math.max(8, Math.min(from.y, to.y) - 18);
  return Math.min(rawLift, maxSafeLift);
}

export function computeProbeArcControlPoint(
  from: ProbePoint,
  to: ProbePoint,
  arcLiftPx?: number
): ProbePoint {
  const lift = arcLiftPx ?? computeArcLiftPx(from, to);
  const midX = (from.x + to.x) / 2;
  const minY = Math.min(from.y, to.y);
  return {
    x: midX,
    y: minY - lift * 1.15,
  };
}

export function buildProbeTrailPathD(
  from: ProbePoint,
  to: ProbePoint,
  arcLiftPx?: number
): string {
  const ctrl = computeProbeArcControlPoint(from, to, arcLiftPx);
  return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${ctrl.x.toFixed(1)} ${ctrl.y.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

export function computeProbeFlightFrame(params: {
  from: ProbePoint;
  to: ProbePoint;
  progress: number;
  color: 'red' | 'black';
  liftScale?: number;
}): ProbeFlightFrame {
  const p = clampUnit(params.progress);
  const eased = easeInOutCubic(p);
  const arcLiftPx = computeArcLiftPx(params.from, params.to, params.liftScale ?? 1);
  const liftCurve = p <= 0 || p >= 1 ? 0 : Math.sin(p * Math.PI);

  const groundX = params.from.x + (params.to.x - params.from.x) * eased;
  const groundY = params.from.y + (params.to.y - params.from.y) * eased;
  const liftOffsetY = -liftCurve * arcLiftPx;

  const baseDirection = params.color === 'red' ? -1 : 1;
  const horizontalBias =
    params.to.x !== params.from.x ? Math.sign(params.to.x - params.from.x) * 4 : 0;
  const rawTilt = liftCurve * (16 * baseDirection + horizontalBias);

  return {
    coords: {
      x: groundX,
      y: groundY + liftOffsetY,
    },
    groundCoords: {
      x: groundX,
      y: groundY,
    },
    tiltAngle: rawTilt === 0 ? 0 : rawTilt,
    scale: 1 + liftCurve * 0.16,
    shadowOpacity: 0.18 + liftCurve * 0.38,
    easedProgress: eased,
    arcLiftPx,
  };
}

export function formatShortPinTag(label: string | null | undefined): string {
  if (!label) return 'LEAD';
  const trimmed = label.trim();
  if (!trimmed || trimmed.toLowerCase() === 'unconnected') return 'LEAD';
  const parenIdx = trimmed.indexOf('(');
  const base = (parenIdx > 0 ? trimmed.slice(0, parenIdx) : trimmed).trim();
  return base.length > 14 ? `${base.slice(0, 13)}…` : base;
}

export function formatProbeMoveBadge(
  fromLabel: string | null | undefined,
  toLabel: string | null | undefined
): string {
  const fromTag = formatShortPinTag(fromLabel);
  const toTag = formatShortPinTag(toLabel);
  return `${fromTag} → ${toTag}`;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useProbeTransitionMotion({
  pinId,
  pinLabel,
  targetCoords,
  color,
  originCoords,
  durationMs = 420,
  liftScale = 1,
  playAudio = true,
}: UseProbeTransitionMotionOptions): ProbeTransitionState {
  const [state, setState] = useState<ProbeTransitionState>(() => ({
    coords: targetCoords,
    groundCoords: targetCoords,
    fromCoords: null,
    toCoords: targetCoords,
    fromLabel: null,
    toLabel: pinLabel,
    trailPathD: null,
    progress: 1,
    isMoving: false,
    justLanded: false,
    trailVisible: false,
    tiltAngle: 0,
    scale: 1,
    shadowOpacity: 0.2,
  }));

  const isFirstMountRef = useRef(true);
  const prevPinIdRef = useRef<string | null>(pinId);
  const prevLabelRef = useRef<string | null>(pinLabel);
  const currentCoordsRef = useRef<ProbePoint | null>(targetCoords);
  const animFrameRef = useRef<number | null>(null);
  const landTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trailFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cancelTimers = () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (landTimerRef.current !== null) {
        clearTimeout(landTimerRef.current);
        landTimerRef.current = null;
      }
      if (trailFadeTimerRef.current !== null) {
        clearTimeout(trailFadeTimerRef.current);
        trailFadeTimerRef.current = null;
      }
    };

    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      prevPinIdRef.current = pinId;
      prevLabelRef.current = pinLabel;
      currentCoordsRef.current = targetCoords;
      setState({
        coords: targetCoords,
        groundCoords: targetCoords,
        fromCoords: null,
        toCoords: targetCoords,
        fromLabel: null,
        toLabel: pinLabel,
        trailPathD: null,
        progress: 1,
        isMoving: false,
        justLanded: false,
        trailVisible: false,
        tiltAngle: 0,
        scale: 1,
        shadowOpacity: 0.2,
      });
      return;
    }

    const prevPinId = prevPinIdRef.current;
    const prevLabel = prevLabelRef.current;

    // Same pin attached (e.g. component card dragged or D3 node physics tick):
    // Track coordinates tightly without re-triggering a lift-and-land flight arc.
    if (prevPinId === pinId) {
      if (
        targetCoords &&
        (currentCoordsRef.current?.x !== targetCoords.x ||
          currentCoordsRef.current?.y !== targetCoords.y)
      ) {
        currentCoordsRef.current = targetCoords;
        setState((prev) =>
          prev.isMoving
            ? { ...prev, toCoords: targetCoords }
            : {
                ...prev,
                coords: targetCoords,
                groundCoords: targetCoords,
                toCoords: targetCoords,
              }
        );
      }
      return;
    }

    cancelTimers();

    // Probe detached -> retract smoothly toward lead origin or clear cleanly
    if (!pinId || !targetCoords) {
      const retractFrom = currentCoordsRef.current;
      prevPinIdRef.current = null;
      prevLabelRef.current = null;

      if (!retractFrom || prefersReducedMotion()) {
        currentCoordsRef.current = null;
        setState({
          coords: null,
          groundCoords: null,
          fromCoords: null,
          toCoords: null,
          fromLabel: null,
          toLabel: null,
          trailPathD: null,
          progress: 1,
          isMoving: false,
          justLanded: false,
          trailVisible: false,
          tiltAngle: 0,
          scale: 1,
          shadowOpacity: 0.2,
        });
        return;
      }

      const retractDuration = Math.min(260, durationMs);
      const startTime = performance.now();
      const trailD = buildProbeTrailPathD(retractFrom, originCoords, liftScale);

      const stepRetract = (now: number) => {
        const progress = clampUnit((now - startTime) / retractDuration);
        const frame = computeProbeFlightFrame({
          from: retractFrom,
          to: originCoords,
          progress,
          color,
          liftScale,
        });
        currentCoordsRef.current = frame.coords;

        if (progress < 1) {
          setState({
            coords: frame.coords,
            groundCoords: frame.groundCoords,
            fromCoords: retractFrom,
            toCoords: originCoords,
            fromLabel: prevLabel,
            toLabel: 'Unconnected',
            trailPathD: trailD,
            progress,
            isMoving: true,
            justLanded: false,
            trailVisible: true,
            tiltAngle: frame.tiltAngle,
            scale: frame.scale,
            shadowOpacity: frame.shadowOpacity * (1 - progress),
          });
          animFrameRef.current = requestAnimationFrame(stepRetract);
        } else {
          animFrameRef.current = null;
          currentCoordsRef.current = null;
          setState({
            coords: null,
            groundCoords: null,
            fromCoords: null,
            toCoords: null,
            fromLabel: null,
            toLabel: null,
            trailPathD: null,
            progress: 1,
            isMoving: false,
            justLanded: false,
            trailVisible: false,
            tiltAngle: 0,
            scale: 1,
            shadowOpacity: 0.2,
          });
        }
      };

      animFrameRef.current = requestAnimationFrame(stepRetract);
      return cancelTimers;
    }

    // Moving to a new pin (either from another pin or from Unconnected lead origin)
    const fromCoords = currentCoordsRef.current ?? originCoords;
    const fromLabel = prevPinId ? prevLabel : 'DMM Lead';
    const destCoords = targetCoords;
    const trailD = buildProbeTrailPathD(fromCoords, destCoords, liftScale);

    prevPinIdRef.current = pinId;
    prevLabelRef.current = pinLabel;

    if (prefersReducedMotion()) {
      currentCoordsRef.current = destCoords;
      if (playAudio) playProbeTapSound();
      setState({
        coords: destCoords,
        groundCoords: destCoords,
        fromCoords,
        toCoords: destCoords,
        fromLabel,
        toLabel: pinLabel,
        trailPathD: trailD,
        progress: 1,
        isMoving: false,
        justLanded: true,
        trailVisible: true,
        tiltAngle: 0,
        scale: 1,
        shadowOpacity: 0.2,
      });
      landTimerRef.current = setTimeout(() => {
        setState((prev) => ({ ...prev, justLanded: false }));
      }, 450);
      trailFadeTimerRef.current = setTimeout(() => {
        setState((prev) => ({ ...prev, trailVisible: false }));
      }, 600);
      return cancelTimers;
    }

    const startTime = performance.now();

    const stepFlight = (now: number) => {
      const progress = clampUnit((now - startTime) / durationMs);
      const frame = computeProbeFlightFrame({
        from: fromCoords,
        to: destCoords,
        progress,
        color,
        liftScale,
      });

      currentCoordsRef.current = frame.coords;

      if (progress < 1) {
        setState({
          coords: frame.coords,
          groundCoords: frame.groundCoords,
          fromCoords,
          toCoords: destCoords,
          fromLabel,
          toLabel: pinLabel,
          trailPathD: trailD,
          progress,
          isMoving: true,
          justLanded: false,
          trailVisible: true,
          tiltAngle: frame.tiltAngle,
          scale: frame.scale,
          shadowOpacity: frame.shadowOpacity,
        });
        animFrameRef.current = requestAnimationFrame(stepFlight);
      } else {
        animFrameRef.current = null;
        currentCoordsRef.current = destCoords;
        if (playAudio) playProbeTapSound();
        setState({
          coords: destCoords,
          groundCoords: destCoords,
          fromCoords,
          toCoords: destCoords,
          fromLabel,
          toLabel: pinLabel,
          trailPathD: trailD,
          progress: 1,
          isMoving: false,
          justLanded: true,
          trailVisible: true,
          tiltAngle: 0,
          scale: 1,
          shadowOpacity: 0.2,
        });

        landTimerRef.current = setTimeout(() => {
          setState((prev) => ({ ...prev, justLanded: false }));
        }, 500);
        trailFadeTimerRef.current = setTimeout(() => {
          setState((prev) => ({ ...prev, trailVisible: false }));
        }, 720);
      }
    };

    animFrameRef.current = requestAnimationFrame(stepFlight);
    return cancelTimers;
  }, [pinId, pinLabel, targetCoords?.x, targetCoords?.y, color, originCoords.x, originCoords.y, durationMs, liftScale, playAudio]);

  return state;
}
