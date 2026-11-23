import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { GaugeTelemetrySnapshot, PeakHoldSnapshot } from '../../simulation/telemetry/telemetryTypes';
import { MAP_CALIBRATIONS } from '../../simulation/telemetry/sensorTransferCurves';
import type { MapCalibrationPreset } from '../../simulation/telemetry/telemetryTypes';

export interface BoostVacuumGaugeProps {
  telemetry: GaugeTelemetrySnapshot;
  peakHold: PeakHoldSnapshot;
  showPeakHold: boolean;
  mapCalibrationPreset: MapCalibrationPreset;
}

export const BoostVacuumGauge: React.FC<BoostVacuumGaugeProps> = ({
  telemetry,
  peakHold,
  showPeakHold,
  mapCalibrationPreset,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const isFaulted =
    telemetry.mapValidity !== 'VALID' &&
    telemetry.mapValidity !== 'PSU_OFF' &&
    telemetry.mapValidity !== 'STANDBY';

  const isPsuOff = telemetry.statusCode === 'PSU_OFF';
  const boostBar = telemetry.boostBar;
  const maxPositiveBar = Math.max(
    0.5,
    (MAP_CALIBRATIONS[mapCalibrationPreset].maxKpa - telemetry.baroKpa) / 100
  );

  // Normalized gauge ratio left of center for vacuum (-1.0..0) and right of center for boost (0..maxPositiveBar)
  const negRatio =
    boostBar !== null && boostBar < 0 ? Math.min(1, Math.abs(boostBar) / 1.0) : 0;
  const posRatio =
    boostBar !== null && boostBar > 0 ? Math.min(1, boostBar / maxPositiveBar) : 0;

  const barTransition = shouldReduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 210, damping: 24, mass: 0.45 };

  const formattedBoost =
    isPsuOff || isFaulted || boostBar === null
      ? '— bar'
      : `${boostBar > 0 ? '+' : ''}${boostBar.toFixed(2)} bar gauge`;

  const boostTextColor = isFaulted
    ? 'text-[#ff4d62]'
    : isPsuOff
    ? 'text-[#748aa8]'
    : boostBar !== null && boostBar > 0.02
    ? 'text-[#ffb020]'
    : 'text-[#20d889]';

  const sourceTag = isFaulted
    ? telemetry.mapFaultLabel || 'INVALID SOURCE'
    : isPsuOff
    ? 'PSU OFF'
    : telemetry.mapKpa !== null
    ? `${telemetry.mapKpa.toFixed(0)} kPa abs · Pin 8 ${telemetry.mapVoltage.toFixed(2)}V`
    : 'Calculated MAP − Baro';

  return (
    <div className="hw-lcd-well rounded-xl px-3 py-2.5 flex flex-col gap-2 border border-[#203653]">
      <div className="flex flex-wrap items-baseline justify-between gap-1.5 font-mono tabular-nums">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#91a4bd] shrink-0">
            BOOST / VACUUM
          </span>
          <span className={`text-[13.5px] font-bold truncate ${boostTextColor}`}>
            {formattedBoost}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[9.5px] text-[#91a4bd] shrink-0">
          <span
            className={`font-bold uppercase ${
              isFaulted
                ? 'text-[#ff4d62]'
                : telemetry.statusCode === 'LIVE_SIMULATED'
                ? 'text-[#20d889]'
                : 'text-[#91a4bd]'
            }`}
          >
            {isFaulted ? 'FAULT' : telemetry.statusCode === 'LIVE_SIMULATED' ? 'LIVE' : telemetry.statusLabel}
          </span>
          <span className="text-[#4a6282]">·</span>
          <span className="text-[#91a4bd] truncate max-w-[165px]" title={sourceTag}>
            {sourceTag}
          </span>
        </div>
      </div>

      {/* Dual Vacuum / Boost Bar (GPU scaleX composited) */}
      <div className="relative h-2.5 bg-[#050a12] border border-[#203653] rounded-full flex overflow-hidden">
        {/* Vacuum half (-1.0 to 0 bar) */}
        <div className="w-1/2 h-full flex justify-end border-r border-[#335178] overflow-hidden">
          <motion.div
            className="w-full h-full bg-[#19c8f5]/85 origin-right"
            initial={false}
            animate={{ scaleX: negRatio }}
            transition={barTransition}
          />
        </div>
        {/* Boost half (0 to +2.0 bar) */}
        <div className="w-1/2 h-full flex justify-start overflow-hidden">
          <motion.div
            className="w-full h-full bg-[#ffb020]/90 origin-left"
            initial={false}
            animate={{ scaleX: posRatio }}
            transition={barTransition}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] font-mono text-[#7c93b2] tabular-nums">
        <span>-1.0 bar (VAC)</span>
        <span>
          0.0 bar (Baro {telemetry.baroKpa.toFixed(1)} kPa)
          {showPeakHold && peakHold.maxBoostBar !== null && (
            <span className="text-[#ffb020] ml-1.5">
              · PK {peakHold.maxBoostBar > 0 ? '+' : ''}
              {peakHold.maxBoostBar.toFixed(2)}
            </span>
          )}
        </span>
        <span>+{maxPositiveBar.toFixed(1)} bar</span>
      </div>
    </div>
  );
};
