/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { GearSelection } from './telemetryTypes';

export const GEAR_RATIOS: Record<GearSelection, number> = {
  N: 0,
  '1': 3.54,
  '2': 2.05,
  '3': 1.38,
  '4': 1.03,
  '5': 0.82,
  '6': 0.69,
};

export interface VehicleSpeedInput {
  rpm: number;
  selectedGear: GearSelection;
  finalDriveRatio: number;
  tireCircumferenceMm: number;
  speedKmhOverride: number | null;
  isLive: boolean;
}

export interface VehicleSpeedResult {
  speedKmh: number;
  sourceLabel: string;
}

/**
 * Computes simulated vehicle road speed from engine RPM, active gear ratio,
 * final drive ratio, and rolling tire circumference (or manual VSS override).
 * Explicitly identified as SIMULATED SPEED (never claimed as vehicle cluster VSS).
 */
export function calculateSimulatedSpeedKmh(input: VehicleSpeedInput): VehicleSpeedResult {
  if (!input.isLive || input.rpm <= 0) {
    return {
      speedKmh: 0,
      sourceLabel: 'SIMULATED · STOPPED',
    };
  }

  if (input.speedKmhOverride !== null && Number.isFinite(input.speedKmhOverride)) {
    const clampedOverride = Math.max(0, Math.min(260, Math.round(input.speedKmhOverride)));
    return {
      speedKmh: clampedOverride,
      sourceLabel: 'SIMULATED VSS OVERRIDE',
    };
  }

  const gearRatio = GEAR_RATIOS[input.selectedGear] ?? 0;
  if (gearRatio <= 0) {
    return {
      speedKmh: 0,
      sourceLabel: 'SIMULATED · NEUTRAL (N)',
    };
  }

  const safeFinalDrive = Math.max(2.0, Math.min(7.0, input.finalDriveRatio));
  const safeCircumferenceMm = Math.max(1200, Math.min(3000, input.tireCircumferenceMm));
  const wheelRpm = input.rpm / (gearRatio * safeFinalDrive);
  const kmPerHour = (wheelRpm * safeCircumferenceMm * 60.0) / 1_000_000.0;
  const clamped = Math.max(0, Math.min(260, Math.round(kmPerHour)));

  return {
    speedKmh: clamped,
    sourceLabel: `SIMULATED · GEAR ${input.selectedGear}`,
  };
}
