export type GaugeTransportMode = 'LIVE' | 'PAUSED' | 'STOPPED';

export type MapCalibrationPreset = 'BAR_1_NA' | 'BAR_2_BOOST' | 'BAR_3_BOOST';

export type GearSelection = 'N' | '1' | '2' | '3' | '4' | '5' | '6';

export interface MapSensorCalibration {
  preset: MapCalibrationPreset;
  label: string;
  shortLabel: string;
  minKpa: number;
  maxKpa: number;
  minVoltage: number;
  maxVoltage: number;
  vRefNominal: number;
}

export interface PeakHoldSnapshot {
  maxRpm: number | null;
  maxSpeedKmh: number | null;
  maxBoostBar: number | null;
  maxMafGps: number | null;
  maxCoolantC: number | null;
  minSupplyV: number | null;
  maxSupplyV: number | null;
}

export interface GaugeMonitorState {
  transportMode: GaugeTransportMode;
  intakeTempCelsius: number;
  mapCalibrationPreset: MapCalibrationPreset;
  engineDisplacementLiters: number;
  volumetricEfficiency: number;
  selectedGear: GearSelection;
  finalDriveRatio: number;
  tireCircumferenceMm: number;
  speedKmhOverride: number | null;
  showPeakHold: boolean;
  peakHold: PeakHoldSnapshot;
}

export type InstrumentStatusCode =
  | 'PSU_OFF'
  | 'SAFETY_LOCKED'
  | 'ECU_STANDBY'
  | 'CKP_NO_SIGNAL'
  | 'PAUSED'
  | 'LIVE_SIMULATED';

export type SensorValidityState =
  | 'VALID'
  | 'FAULT_OPEN'
  | 'FAULT_SHORT_GND'
  | 'FAULT_SHORT_VBAT'
  | 'INVALID_SOURCE'
  | 'PSU_OFF'
  | 'STANDBY';

export interface GaugeTelemetrySnapshot {
  statusCode: InstrumentStatusCode;
  statusLabel: string;
  statusDetail: string;
  timestampMs: number;
  rpm: number;
  simulatedSpeedKmh: number;
  speedSourceLabel: string;
  mapKpa: number | null;
  baroKpa: number;
  boostBar: number | null;
  mapVoltage: number;
  mapValidity: SensorValidityState;
  mapFaultLabel: string | null;
  estimatedMafGps: number | null;
  mafValidity: SensorValidityState;
  mafSourceLabel: string;
  coolantTempC: number | null;
  coolantVoltage: number;
  coolantValidity: SensorValidityState;
  coolantFaultLabel: string | null;
  intakeTempC: number;
  supplyVoltageV: number | null;
  supplyValidity: SensorValidityState;
  vRefVoltage: number;
  sgndVoltage: number;
  tpsPercent: number;
  isInjectorFiring: boolean;
  isRelayLatched: boolean;
  activeDtcCodes: string[];
}

export const BAROMETRIC_PRESSURE_KPA = 101.3;

export const DEFAULT_PEAK_HOLD: PeakHoldSnapshot = {
  maxRpm: null,
  maxSpeedKmh: null,
  maxBoostBar: null,
  maxMafGps: null,
  maxCoolantC: null,
  minSupplyV: null,
  maxSupplyV: null,
};

export const DEFAULT_GAUGE_MONITOR_STATE: GaugeMonitorState = {
  transportMode: 'STOPPED',
  intakeTempCelsius: 32.0,
  mapCalibrationPreset: 'BAR_1_NA',
  engineDisplacementLiters: 2.0,
  volumetricEfficiency: 0.85,
  selectedGear: '2',
  finalDriveRatio: 3.9,
  tireCircumferenceMm: 1980,
  speedKmhOverride: null,
  showPeakHold: true,
  peakHold: { ...DEFAULT_PEAK_HOLD },
};

const VALID_TRANSPORT_MODES = new Set<GaugeTransportMode>(['LIVE', 'PAUSED', 'STOPPED']);
const VALID_MAP_PRESETS = new Set<MapCalibrationPreset>(['BAR_1_NA', 'BAR_2_BOOST', 'BAR_3_BOOST']);
const VALID_GEARS = new Set<GearSelection>(['N', '1', '2', '3', '4', '5', '6']);

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeNullableNumber(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Number(Math.max(min, Math.min(max, n)).toFixed(3));
}

export function sanitizePeakHoldSnapshot(raw: unknown): PeakHoldSnapshot {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PEAK_HOLD };
  }
  const src = raw as Record<string, unknown>;
  return {
    maxRpm: sanitizeNullableNumber(src.maxRpm, 0, 12000),
    maxSpeedKmh: sanitizeNullableNumber(src.maxSpeedKmh, 0, 400),
    maxBoostBar: sanitizeNullableNumber(src.maxBoostBar, -1.2, 5.0),
    maxMafGps: sanitizeNullableNumber(src.maxMafGps, 0, 1500),
    maxCoolantC: sanitizeNullableNumber(src.maxCoolantC, -50, 200),
    minSupplyV: sanitizeNullableNumber(src.minSupplyV, 0, 40),
    maxSupplyV: sanitizeNullableNumber(src.maxSupplyV, 0, 40),
  };
}

export function sanitizeGaugeMonitorState(raw: unknown): GaugeMonitorState {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_GAUGE_MONITOR_STATE,
      peakHold: { ...DEFAULT_PEAK_HOLD },
    };
  }
  const src = raw as Record<string, unknown>;
  const transportMode = VALID_TRANSPORT_MODES.has(src.transportMode as GaugeTransportMode)
    ? (src.transportMode as GaugeTransportMode)
    : 'STOPPED';
  const mapCalibrationPreset = VALID_MAP_PRESETS.has(src.mapCalibrationPreset as MapCalibrationPreset)
    ? (src.mapCalibrationPreset as MapCalibrationPreset)
    : 'BAR_1_NA';
  const selectedGear = VALID_GEARS.has(src.selectedGear as GearSelection)
    ? (src.selectedGear as GearSelection)
    : '2';

  return {
    transportMode,
    intakeTempCelsius: Number(clampNum(src.intakeTempCelsius, -40, 120, 32.0).toFixed(1)),
    mapCalibrationPreset,
    engineDisplacementLiters: Number(clampNum(src.engineDisplacementLiters, 0.6, 8.0, 2.0).toFixed(2)),
    volumetricEfficiency: Number(clampNum(src.volumetricEfficiency, 0.4, 1.15, 0.85).toFixed(2)),
    selectedGear,
    finalDriveRatio: Number(clampNum(src.finalDriveRatio, 2.5, 6.0, 3.9).toFixed(2)),
    tireCircumferenceMm: Math.round(clampNum(src.tireCircumferenceMm, 1400, 2800, 1980)),
    speedKmhOverride:
      src.speedKmhOverride === null || src.speedKmhOverride === undefined
        ? null
        : Math.round(clampNum(src.speedKmhOverride, 0, 260, 0)),
    showPeakHold: typeof src.showPeakHold === 'boolean' ? src.showPeakHold : true,
    peakHold: sanitizePeakHoldSnapshot(src.peakHold),
  };
}

/**
 * Forces restored session / Drive import states into safe STOPPED mode while
 * preserving calibration presets, drivetrain configuration, and Peak-Hold history.
 */
export function forceSafeStoppedGaugeState(raw: unknown): GaugeMonitorState {
  const clean = sanitizeGaugeMonitorState(raw);
  return {
    ...clean,
    transportMode: 'STOPPED',
  };
}
