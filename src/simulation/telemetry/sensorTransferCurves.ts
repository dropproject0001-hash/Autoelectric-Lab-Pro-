/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { InjectedFault } from '../../types/ecu';
import {
  BAROMETRIC_PRESSURE_KPA,
  MapCalibrationPreset,
  MapSensorCalibration,
  SensorValidityState,
} from './telemetryTypes';

export const MAP_CALIBRATIONS: Record<MapCalibrationPreset, MapSensorCalibration> = {
  BAR_1_NA: {
    preset: 'BAR_1_NA',
    label: '1-Bar NA (20–100 kPa)',
    shortLabel: '1-Bar NA',
    minKpa: 20,
    maxKpa: 100,
    minVoltage: 0.5,
    maxVoltage: 4.5,
    vRefNominal: 5.0,
  },
  BAR_2_BOOST: {
    preset: 'BAR_2_BOOST',
    label: '2-Bar Boost (20–200 kPa)',
    shortLabel: '2-Bar',
    minKpa: 20,
    maxKpa: 200,
    minVoltage: 0.4,
    maxVoltage: 4.8,
    vRefNominal: 5.0,
  },
  BAR_3_BOOST: {
    preset: 'BAR_3_BOOST',
    label: '3-Bar Boost (20–300 kPa)',
    shortLabel: '3-Bar',
    minKpa: 20,
    maxKpa: 300,
    minVoltage: 0.3,
    maxVoltage: 4.8,
    vRefNominal: 5.0,
  },
};

export function getMapCalibration(preset?: string | null): MapSensorCalibration {
  if (preset && preset in MAP_CALIBRATIONS) {
    return MAP_CALIBRATIONS[preset as MapCalibrationPreset];
  }
  return MAP_CALIBRATIONS.BAR_1_NA;
}

/**
 * Forward transfer curve from Manifold Absolute Pressure (kPa) to transducer voltage.
 * Preserves the exact default 1-Bar NA formula (20-100 kPa -> 0.5-4.5V ratiometric)
 * while supporting 2-Bar and 3-Bar boost calibrations without premature saturation.
 */
export function calculateCalibratedMapVoltage(
  pressureKpa: number,
  vRef = 5.0,
  preset: MapCalibrationPreset = 'BAR_1_NA'
): { voltage: number; pressureKpa: number; calibration: MapSensorCalibration } {
  const calibration = getMapCalibration(preset);
  const safeVRef = Math.max(0, vRef);
  const ratio = safeVRef / calibration.vRefNominal;

  const clampedKpa =
    preset === 'BAR_1_NA'
      ? Math.max(10, Math.min(250, pressureKpa))
      : Math.max(10, Math.min(calibration.maxKpa, pressureKpa));

  const spanKpa = calibration.maxKpa - calibration.minKpa;
  const spanVoltage = calibration.maxVoltage - calibration.minVoltage;
  const normalized = (clampedKpa - calibration.minKpa) / spanKpa;
  const voltage = (calibration.minVoltage + normalized * spanVoltage) * ratio;

  return {
    voltage: Math.max(0, Math.min(safeVRef, voltage)),
    pressureKpa: clampedKpa,
    calibration,
  };
}

export interface MapInferenceResult {
  mapKpa: number | null;
  boostBar: number | null;
  validity: SensorValidityState;
  faultLabel: string | null;
}

/**
 * Inverse MAP inference directly from solved MNA node voltages (`ecu-pin-8`, `ecu-pin-5`, `ecu-pin-6`).
 */
export function inferMapFromVoltage(input: {
  mapVoltage: number;
  vRefVoltage: number;
  sgndVoltage: number;
  isPowerOn: boolean;
  mapFault?: InjectedFault;
  vrefFault?: InjectedFault;
  sgndFault?: InjectedFault;
  wireCut?: boolean;
  preset: MapCalibrationPreset;
  baroKpa?: number;
}): MapInferenceResult {
  const baroKpa = input.baroKpa ?? BAROMETRIC_PRESSURE_KPA;
  if (!input.isPowerOn) {
    return {
      mapKpa: null,
      boostBar: null,
      validity: 'PSU_OFF',
      faultLabel: 'PSU OFF',
    };
  }

  // Check reference rail and ground integrity first
  if (input.sgndVoltage > 0.65 || input.sgndFault?.faultType === 'OPEN_CIRCUIT') {
    return {
      mapKpa: null,
      boostBar: null,
      validity: 'INVALID_SOURCE',
      faultLabel: 'FAULT: SGND FLOAT/OPEN',
    };
  }
  if (input.vRefVoltage < 3.5 || input.vrefFault?.faultType === 'SHORT_TO_GND') {
    return {
      mapKpa: null,
      boostBar: null,
      validity: 'INVALID_SOURCE',
      faultLabel: 'FAULT: VREF 5V LOSS',
    };
  }

  const netSignalV = input.mapVoltage - input.sgndVoltage;
  if (input.mapFault?.faultType === 'SHORT_TO_VBAT' || netSignalV > Math.max(5.5, input.vRefVoltage + 0.5)) {
    return {
      mapKpa: null,
      boostBar: null,
      validity: 'FAULT_SHORT_VBAT',
      faultLabel: 'FAULT: MAP SHORT VBAT (P0108)',
    };
  }

  if (input.wireCut || input.mapFault?.faultType === 'OPEN_CIRCUIT') {
    return {
      mapKpa: null,
      boostBar: null,
      validity: 'FAULT_OPEN',
      faultLabel: 'FAULT: MAP OPEN (P0107)',
    };
  }

  if (netSignalV < 0.2 || input.mapFault?.faultType === 'SHORT_TO_GND') {
    return {
      mapKpa: null,
      boostBar: null,
      validity: 'FAULT_SHORT_GND',
      faultLabel: 'FAULT: MAP SHORT GND (P0107)',
    };
  }

  if (netSignalV > Math.min(4.85, input.vRefVoltage - 0.08)) {
    return {
      mapKpa: null,
      boostBar: null,
      validity: 'FAULT_SHORT_VBAT',
      faultLabel: 'FAULT: MAP HIGH INPUT (P0108)',
    };
  }

  const calibration = getMapCalibration(input.preset);
  const ratio = Math.max(0.1, input.vRefVoltage / calibration.vRefNominal);
  const scaledVoltage = netSignalV / ratio;
  const spanVoltage = calibration.maxVoltage - calibration.minVoltage;
  const spanKpa = calibration.maxKpa - calibration.minKpa;
  const normalized = (scaledVoltage - calibration.minVoltage) / spanVoltage;
  const estimatedKpa = Math.max(
    10,
    Math.min(calibration.maxKpa, calibration.minKpa + normalized * spanKpa)
  );
  const boostBar = Number(((estimatedKpa - baroKpa) / 100.0).toFixed(2));

  return {
    mapKpa: Number(estimatedKpa.toFixed(1)),
    boostBar,
    validity: 'VALID',
    faultLabel: null,
  };
}

export interface EctInferenceResult {
  coolantTempC: number | null;
  validity: SensorValidityState;
  faultLabel: string | null;
}

/**
 * Inverse ECT inference from solved MNA node voltage (`ecu-pin-9` with 2.2kΩ pull-up to VREF_5V).
 * Explicitly separates normal Steinhart-Hart curve (-40°C..+130°C) from OPEN/SHORT fail-safes.
 */
export function inferEctFromVoltage(input: {
  ectVoltage: number;
  vRefVoltage: number;
  sgndVoltage: number;
  isPowerOn: boolean;
  ectFault?: InjectedFault;
  vrefFault?: InjectedFault;
  sgndFault?: InjectedFault;
  wireCut?: boolean;
}): EctInferenceResult {
  if (!input.isPowerOn) {
    return {
      coolantTempC: null,
      validity: 'PSU_OFF',
      faultLabel: 'PSU OFF',
    };
  }

  if (input.sgndVoltage > 0.65 || input.sgndFault?.faultType === 'OPEN_CIRCUIT') {
    return {
      coolantTempC: null,
      validity: 'INVALID_SOURCE',
      faultLabel: 'FAULT: SGND OPEN',
    };
  }

  if (input.vRefVoltage < 3.5 || input.vrefFault?.faultType === 'SHORT_TO_GND') {
    return {
      coolantTempC: null,
      validity: 'INVALID_SOURCE',
      faultLabel: 'FAULT: VREF 5V LOSS',
    };
  }

  if (input.ectFault?.faultType === 'SHORT_TO_VBAT' || input.ectVoltage > Math.max(5.5, input.vRefVoltage + 0.5)) {
    return {
      coolantTempC: -40.0,
      validity: 'FAULT_SHORT_VBAT',
      faultLabel: 'FAULT: SHORT VBAT (P0118)',
    };
  }

  const netV = Math.max(0, input.ectVoltage - input.sgndVoltage);
  const effectiveVref = Math.max(3.5, input.vRefVoltage - input.sgndVoltage);

  // Open circuit: 2.2k pull-up pulls ADC rail >= 4.80V (or wire cut / pin OPEN fault)
  if (input.wireCut || input.ectFault?.faultType === 'OPEN_CIRCUIT' || netV >= effectiveVref - 0.20) {
    return {
      coolantTempC: -40.0,
      validity: 'FAULT_OPEN',
      faultLabel: 'FAULT: OPEN (-40°C FAILSAFE · P0118)',
    };
  }

  // Short to ground: ADC rail <= 0.15V
  if (input.ectFault?.faultType === 'SHORT_TO_GND' || netV <= 0.15) {
    return {
      coolantTempC: 140.0,
      validity: 'FAULT_SHORT_GND',
      faultLabel: 'FAULT: SHORT GND (+140°C FAILSAFE · P0117)',
    };
  }

  // Invert 2.2kΩ divider to find thermistor resistance
  const pullupOhms = 2200;
  const rThermistor = Math.max(10, (pullupOhms * netV) / Math.max(0.01, effectiveVref - netV));
  const R25 = 2500;
  const T25 = 298.15;
  const BETA = 3950;
  const invT = 1.0 / T25 + Math.log(rThermistor / R25) / BETA;
  const tempC = 1.0 / invT - 273.15;

  return {
    coolantTempC: Number(Math.max(-40, Math.min(130, tempC)).toFixed(1)),
    validity: 'VALID',
    faultLabel: null,
  };
}
