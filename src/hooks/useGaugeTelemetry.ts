import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BenchComponent,
  InjectedFault,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import type { CircuitSolution } from '../utils/circuitSolver';
import type { RpmEmulatorState } from '../utils/vehicleEcuRegistry';
import {
  computeUpdatedPeakHold,
  evaluateGaugeTelemetry,
} from '../simulation/telemetry/gaugeTelemetryEngine';
import {
  GaugeMonitorState,
  GaugeTelemetrySnapshot,
} from '../simulation/telemetry/telemetryTypes';

export interface UseGaugeTelemetryArgs {
  powerSupply: PowerSupplyState;
  circuitSolution: CircuitSolution;
  components: BenchComponent[];
  faults: InjectedFault[];
  wires: WireConnection[];
  rpmEmulator: RpmEmulatorState;
  gaugeMonitor: GaugeMonitorState;
  onChangeGaugeMonitor: React.Dispatch<React.SetStateAction<GaugeMonitorState>>;
  isSafetyLocked?: boolean;
  safetyLockReason?: string;
  sampleIntervalMs?: number;
}

/**
 * Controlled 10 Hz gauge telemetry sampling controller.
 * - Reads solved MNA CircuitSolution outputs without invoking extra matrix solves per frame.
 * - Freezes displayed telemetry when transportMode === 'PAUSED'.
 * - Updates Peak-Hold extrema strictly on valid LIVE_SIMULATED samples.
 */
export function useGaugeTelemetry(args: UseGaugeTelemetryArgs): GaugeTelemetrySnapshot {
  const {
    powerSupply,
    circuitSolution,
    components,
    faults,
    wires,
    rpmEmulator,
    gaugeMonitor,
    onChangeGaugeMonitor,
    isSafetyLocked = false,
    safetyLockReason,
    sampleIntervalMs = 100,
  } = args;

  const latestLiveCandidate = useMemo(
    () =>
      evaluateGaugeTelemetry({
        powerSupply,
        circuitSolution,
        components,
        faults,
        wires,
        rpmEmulator,
        gaugeMonitor,
        isSafetyLocked,
        safetyLockReason,
      }),
    [
      powerSupply,
      circuitSolution,
      components,
      faults,
      wires,
      rpmEmulator,
      gaugeMonitor,
      isSafetyLocked,
      safetyLockReason,
    ]
  );

  const latestCandidateRef = useRef(latestLiveCandidate);
  latestCandidateRef.current = latestLiveCandidate;

  const [sampledSnapshot, setSampledSnapshot] = useState<GaugeTelemetrySnapshot>(
    () => latestLiveCandidate
  );
  const frozenPausedSnapshotRef = useRef<GaugeTelemetrySnapshot | null>(null);

  // Immediately reflect non-PAUSED structural transitions (PSU OFF, SAFETY LOCK, STOPPED, faults, etc.)
  // While PAUSED, keep the frozen numeric readings until unpaused or stopped/unpowered.
  useEffect(() => {
    if (
      gaugeMonitor.transportMode === 'PAUSED' &&
      powerSupply.isOutputEnabled &&
      !isSafetyLocked
    ) {
      if (!frozenPausedSnapshotRef.current) {
        frozenPausedSnapshotRef.current = {
          ...sampledSnapshot,
          statusCode: 'PAUSED',
          statusLabel: 'PAUSED',
          statusDetail: 'Live gauge sweep paused; holding snapshot.',
        };
      }
      setSampledSnapshot(frozenPausedSnapshotRef.current);
      return;
    }

    frozenPausedSnapshotRef.current = null;
    setSampledSnapshot(latestLiveCandidate);
  }, [
    gaugeMonitor.transportMode,
    powerSupply.isOutputEnabled,
    isSafetyLocked,
    latestLiveCandidate,
  ]);

  // Controlled 10 Hz sampling loop strictly while LIVE telemetry is running
  useEffect(() => {
    const isActivelyStreaming =
      gaugeMonitor.transportMode === 'LIVE' &&
      powerSupply.isOutputEnabled &&
      !isSafetyLocked;

    if (!isActivelyStreaming) {
      return undefined;
    }

    const tick = () => {
      const next = {
        ...latestCandidateRef.current,
        timestampMs: Date.now(),
      };
      setSampledSnapshot(next);

      if (next.statusCode === 'LIVE_SIMULATED') {
        onChangeGaugeMonitor((prev) => {
          const nextPeak = computeUpdatedPeakHold(prev.peakHold, next);
          if (nextPeak === prev.peakHold) return prev;
          return {
            ...prev,
            peakHold: nextPeak,
          };
        });
      }
    };

    // Initial capture immediately upon entering LIVE
    tick();
    const timer = window.setInterval(tick, Math.max(66, Math.min(250, sampleIntervalMs)));
    return () => window.clearInterval(timer);
  }, [
    gaugeMonitor.transportMode,
    powerSupply.isOutputEnabled,
    isSafetyLocked,
    sampleIntervalMs,
    onChangeGaugeMonitor,
  ]);

  return sampledSnapshot;
}
