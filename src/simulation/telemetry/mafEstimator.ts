/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

export interface EstimatedMafInput {
  rpm: number;
  mapKpa: number | null;
  intakeTempCelsius: number;
  engineDisplacementLiters: number;
  volumetricEfficiency: number;
  isLive: boolean;
  isPowerOn: boolean;
  hasValidMapSource: boolean;
  invalidReason?: string | null;
}

export interface EstimatedMafResult {
  mafGps: number | null;
  isValid: boolean;
  sourceLabel: string;
  invalidReason: string | null;
}

const R_AIR_SPECIFIC_J_PER_KG_K = 287.058;

/**
 * Speed-Density Ideal-Gas Airflow Estimator.
 * Derived mathematically from RPM, MNA-solved MAP pressure, IAT, displacement, and VE.
 * Explicitly labeled ESTIMATED MAF — never presented as a raw physical MAF sensor readout.
 */
export function calculateEstimatedMaf(input: EstimatedMafInput): EstimatedMafResult {
  if (!input.isPowerOn) {
    return {
      mafGps: null,
      isValid: false,
      sourceLabel: 'ESTIMATED MAF · PSU OFF',
      invalidReason: 'PSU OFF',
    };
  }

  if (!input.hasValidMapSource || input.mapKpa === null || !Number.isFinite(input.mapKpa)) {
    return {
      mafGps: null,
      isValid: false,
      sourceLabel: 'ESTIMATED MAF · INVALID SOURCE',
      invalidReason: input.invalidReason || 'INVALID SOURCE (MAP/VREF FAULT)',
    };
  }

  if (!input.isLive || input.rpm <= 0) {
    return {
      mafGps: 0.0,
      isValid: true,
      sourceLabel: 'ESTIMATED MAF · STANDBY',
      invalidReason: null,
    };
  }

  const safeRpm = Math.max(0, Math.min(10000, input.rpm));
  const safeMapPa = Math.max(5, Math.min(400, input.mapKpa)) * 1000.0;
  const safeIatK = Math.max(-40, Math.min(140, input.intakeTempCelsius)) + 273.15;
  const safeDisplacementM3 = Math.max(0.4, Math.min(10.0, input.engineDisplacementLiters)) / 1000.0;
  const safeVe = Math.max(0.25, Math.min(1.25, input.volumetricEfficiency));

  // Air density (kg/m^3) from Ideal Gas Law: rho = P / (R * T)
  const airDensityKgPerM3 = safeMapPa / (R_AIR_SPECIFIC_J_PER_KG_K * safeIatK);

  // 4-stroke engine intake strokes per second = RPM / 120
  const intakeVolumeFlowM3PerSec = safeDisplacementM3 * (safeRpm / 120.0);

  // Mass airflow in g/s
  const mafGps = airDensityKgPerM3 * intakeVolumeFlowM3PerSec * safeVe * 1000.0;

  return {
    mafGps: Number(Math.max(0, mafGps).toFixed(1)),
    isValid: true,
    sourceLabel: 'ESTIMATED MAF (SPEED-DENSITY)',
    invalidReason: null,
  };
}
