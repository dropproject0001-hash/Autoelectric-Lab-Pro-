import type {
  BenchComponent,
  InjectedFault,
  PowerSupplyState,
  WireConnection,
} from '../../types/ecu';
import type { CircuitSolution } from '../../utils/circuitSolver';
import type { RpmEmulatorState } from '../../utils/vehicleEcuRegistry';
import { calculateEstimatedMaf } from './mafEstimator';
import { inferEctFromVoltage, inferMapFromVoltage } from './sensorTransferCurves';
import {
  BAROMETRIC_PRESSURE_KPA,
  GaugeMonitorState,
  GaugeTelemetrySnapshot,
  InstrumentStatusCode,
  PeakHoldSnapshot,
  SensorValidityState,
} from './telemetryTypes';
import { calculateSimulatedSpeedKmh } from './vehicleSpeedModel';

export interface EvaluateGaugeTelemetryInput {
  powerSupply: PowerSupplyState;
  circuitSolution: CircuitSolution;
  components: BenchComponent[];
  faults: InjectedFault[];
  wires: WireConnection[];
  rpmEmulator: RpmEmulatorState;
  gaugeMonitor: GaugeMonitorState;
  isSafetyLocked?: boolean;
  safetyLockReason?: string;
  timestampMs?: number;
}

export function evaluateGaugeTelemetry(
  input: EvaluateGaugeTelemetryInput
): GaugeTelemetrySnapshot {
  const {
    powerSupply,
    circuitSolution,
    components,
    faults,
    wires,
    rpmEmulator,
    gaugeMonitor,
    isSafetyLocked = false,
    safetyLockReason,
  } = input;
  const timestampMs = input.timestampMs ?? Date.now();
  const isPowerOn = Boolean(powerSupply.isOutputEnabled);

  const vRefVoltage = circuitSolution.nodeVoltages['ecu-pin-5'] ?? 0;
  const sgndVoltage = circuitSolution.nodeVoltages['ecu-pin-6'] ?? 0;
  const mapVoltage = circuitSolution.nodeVoltages['ecu-pin-8'] ?? 0;
  const ectVoltage = circuitSolution.nodeVoltages['ecu-pin-9'] ?? 0;
  const kl30Voltage = circuitSolution.nodeVoltages['ecu-pin-3'] ?? 0;

  const tpsComp = components.find((c) => c.id === 'comp-tps');
  const injComp = components.find((c) => c.id === 'comp-inj');
  const relayComp = components.find((c) => c.id === 'comp-relay');

  const tpsPercent = Number(tpsComp?.state?.throttleAnglePercent ?? 20);
  const isInjectorFiring = Boolean(injComp?.state?.isFiring ?? true);
  const isRelayLatched = Boolean(relayComp?.state?.isLatched ?? true);

  const mapFault = faults.find((f) => f.pinId === 'ecu-pin-8');
  const ectFault = faults.find((f) => f.pinId === 'ecu-pin-9');
  const vrefFault = faults.find((f) => f.pinId === 'ecu-pin-5');
  const sgndFault = faults.find((f) => f.pinId === 'ecu-pin-6');
  const kl30Fault = faults.find((f) => f.pinId === 'ecu-pin-3');

  const mapWireCut = wires.some((w) => w.id === 'wire-6' && w.isCut);
  const ectWireCut = wires.some((w) => w.id === 'wire-7' && w.isCut);
  const vrefWireCut = wires.some((w) => w.id === 'wire-4' && w.isCut);
  const kl30WireCut = wires.some((w) => w.id === 'wire-1' && w.isCut);

  let statusCode: InstrumentStatusCode;
  let statusLabel: string;
  let statusDetail: string;

  if (!isPowerOn) {
    statusCode = 'PSU_OFF';
    statusLabel = 'PSU OFF';
    statusDetail = 'Bench DC power supply output is disabled.';
  } else if (isSafetyLocked) {
    statusCode = 'SAFETY_LOCKED';
    statusLabel = 'SAFETY LOCKED';
    statusDetail = safetyLockReason || 'Pre-bench or OEM connector safety interlock is active.';
  } else if (gaugeMonitor.transportMode === 'PAUSED') {
    statusCode = 'PAUSED';
    statusLabel = 'PAUSED';
    statusDetail = 'Live gauge sweep paused; holding snapshot.';
  } else if (gaugeMonitor.transportMode === 'STOPPED' || !rpmEmulator.isActive) {
    statusCode = 'ECU_STANDBY';
    statusLabel = 'ECU STANDBY';
    statusDetail = 'Bench energized; press Start live view to engage CKP excitation.';
  } else if (rpmEmulator.ckpSignalLost) {
    statusCode = 'CKP_NO_SIGNAL';
    statusLabel = 'CKP NO SIGNAL';
    statusDetail = 'Crankshaft 60-2 dropout active (DTC P0335) — RPM & injection halted.';
  } else {
    statusCode = 'LIVE_SIMULATED';
    statusLabel = 'LIVE · SIMULATED';
    statusDetail = 'Synchronized with MNA solver and CKP/CMP emulator.';
  }

  const isRunning = statusCode === 'LIVE_SIMULATED';
  const activeRpm = isRunning ? Math.max(0, Math.round(rpmEmulator.rpm)) : 0;

  // Supply Voltage from KL30 (Pin 3)
  let supplyVoltageV: number | null = null;
  let supplyValidity: SensorValidityState = 'PSU_OFF';
  if (isPowerOn) {
    if (kl30WireCut || kl30Fault?.faultType === 'OPEN_CIRCUIT') {
      supplyVoltageV = Number(kl30Voltage.toFixed(2));
      supplyValidity = 'FAULT_OPEN';
    } else if (kl30Fault?.faultType === 'SHORT_TO_GND' || circuitSolution.isSupplyCurrentTripped) {
      supplyVoltageV = Number(kl30Voltage.toFixed(2));
      supplyValidity = 'FAULT_SHORT_GND';
    } else {
      supplyVoltageV = Number(kl30Voltage.toFixed(2));
      supplyValidity = 'VALID';
    }
  }

  // MAP / Boost from MNA Pin 8 + VREF + SGND
  const mapResult = inferMapFromVoltage({
    mapVoltage,
    vRefVoltage,
    sgndVoltage,
    isPowerOn,
    mapFault,
    vrefFault,
    sgndFault,
    wireCut: mapWireCut || vrefWireCut,
    preset: gaugeMonitor.mapCalibrationPreset,
    baroKpa: BAROMETRIC_PRESSURE_KPA,
  });

  // ECT from MNA Pin 9 + VREF + SGND
  const ectResult = inferEctFromVoltage({
    ectVoltage,
    vRefVoltage,
    sgndVoltage,
    isPowerOn,
    ectFault,
    vrefFault,
    sgndFault,
    wireCut: ectWireCut || vrefWireCut,
  });

  // Speed-Density Estimated MAF
  const mafResult = calculateEstimatedMaf({
    rpm: activeRpm,
    mapKpa: mapResult.mapKpa,
    intakeTempCelsius: gaugeMonitor.intakeTempCelsius,
    engineDisplacementLiters: gaugeMonitor.engineDisplacementLiters,
    volumetricEfficiency: gaugeMonitor.volumetricEfficiency,
    isLive: isRunning,
    isPowerOn,
    hasValidMapSource: mapResult.validity === 'VALID',
    invalidReason: mapResult.faultLabel,
  });

  const mafValidity: SensorValidityState = !isPowerOn
    ? 'PSU_OFF'
    : !mafResult.isValid
    ? 'INVALID_SOURCE'
    : !isRunning
    ? 'STANDBY'
    : 'VALID';

  // Drivetrain Simulated Speed
  const speedResult = calculateSimulatedSpeedKmh({
    rpm: activeRpm,
    selectedGear: gaugeMonitor.selectedGear,
    finalDriveRatio: gaugeMonitor.finalDriveRatio,
    tireCircumferenceMm: gaugeMonitor.tireCircumferenceMm,
    speedKmhOverride: gaugeMonitor.speedKmhOverride,
    isLive: isRunning,
  });

  return {
    statusCode,
    statusLabel,
    statusDetail,
    timestampMs,
    rpm: activeRpm,
    simulatedSpeedKmh: speedResult.speedKmh,
    speedSourceLabel: speedResult.sourceLabel,
    mapKpa: mapResult.mapKpa,
    baroKpa: BAROMETRIC_PRESSURE_KPA,
    boostBar: mapResult.boostBar,
    mapVoltage: Number(mapVoltage.toFixed(2)),
    mapValidity: mapResult.validity,
    mapFaultLabel: mapResult.faultLabel,
    estimatedMafGps: mafResult.mafGps,
    mafValidity,
    mafSourceLabel: mafResult.sourceLabel,
    coolantTempC: ectResult.coolantTempC,
    coolantVoltage: Number(ectVoltage.toFixed(2)),
    coolantValidity: ectResult.validity,
    coolantFaultLabel: ectResult.faultLabel,
    intakeTempC: Number(gaugeMonitor.intakeTempCelsius.toFixed(1)),
    supplyVoltageV,
    supplyValidity,
    vRefVoltage: Number(vRefVoltage.toFixed(2)),
    sgndVoltage: Number(sgndVoltage.toFixed(3)),
    tpsPercent,
    isInjectorFiring,
    isRelayLatched,
    activeDtcCodes: circuitSolution.activeDTCs.map((d) => d.code),
  };
}

/**
 * Updates Peak-Hold extrema strictly from valid, non-faulted LIVE_SIMULATED readings.
 * Never contaminates peaks with fault fail-safe values (e.g., +140°C ECT short) or STANDBY/PAUSED states.
 */
export function computeUpdatedPeakHold(
  prev: PeakHoldSnapshot,
  snapshot: GaugeTelemetrySnapshot
): PeakHoldSnapshot {
  if (snapshot.statusCode !== 'LIVE_SIMULATED') {
    return prev;
  }

  let changed = false;
  const next: PeakHoldSnapshot = { ...prev };

  const maxOpt = (cur: number | null, incoming: number | null): number | null => {
    if (incoming === null || !Number.isFinite(incoming)) return cur;
    if (cur === null || incoming > cur) {
      changed = true;
      return incoming;
    }
    return cur;
  };

  const minOpt = (cur: number | null, incoming: number | null): number | null => {
    if (incoming === null || !Number.isFinite(incoming)) return cur;
    if (cur === null || incoming < cur) {
      changed = true;
      return incoming;
    }
    return cur;
  };

  next.maxRpm = maxOpt(prev.maxRpm, snapshot.rpm);
  next.maxSpeedKmh = maxOpt(prev.maxSpeedKmh, snapshot.simulatedSpeedKmh);

  if (snapshot.mapValidity === 'VALID') {
    next.maxBoostBar = maxOpt(prev.maxBoostBar, snapshot.boostBar);
  }
  if (snapshot.mafValidity === 'VALID') {
    next.maxMafGps = maxOpt(prev.maxMafGps, snapshot.estimatedMafGps);
  }
  if (snapshot.coolantValidity === 'VALID') {
    next.maxCoolantC = maxOpt(prev.maxCoolantC, snapshot.coolantTempC);
  }
  if (snapshot.supplyValidity === 'VALID' && snapshot.supplyVoltageV !== null) {
    next.minSupplyV = minOpt(prev.minSupplyV, snapshot.supplyVoltageV);
    next.maxSupplyV = maxOpt(prev.maxSupplyV, snapshot.supplyVoltageV);
  }

  return changed ? next : prev;
}
