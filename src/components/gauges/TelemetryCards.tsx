/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React from 'react';
import type { GaugeTelemetrySnapshot, PeakHoldSnapshot } from '../../simulation/telemetry/telemetryTypes';

export interface TelemetryCardsProps {
  telemetry: GaugeTelemetrySnapshot;
  peakHold: PeakHoldSnapshot;
  showPeakHold: boolean;
}

export const TelemetryCards: React.FC<TelemetryCardsProps> = ({
  telemetry,
  peakHold,
  showPeakHold,
}) => {
  const isPsuOff = telemetry.statusCode === 'PSU_OFF';

  const mafFaulted = telemetry.mafValidity === 'INVALID_SOURCE';
  const mafDisplay = isPsuOff
    ? '—'
    : mafFaulted || telemetry.estimatedMafGps === null
    ? 'ERR'
    : telemetry.estimatedMafGps.toFixed(1);
  const mafStatusText = isPsuOff
    ? 'PSU OFF'
    : mafFaulted
    ? 'INVALID SOURCE'
    : telemetry.statusCode === 'LIVE_SIMULATED'
    ? 'LIVE · EST.'
    : telemetry.statusLabel;
  const mafStatusColor = isPsuOff
    ? 'text-[#748aa8]'
    : mafFaulted
    ? 'text-[#ff4d62]'
    : telemetry.statusCode === 'LIVE_SIMULATED'
    ? 'text-[#20d889]'
    : 'text-[#91a4bd]';

  const ectFaulted =
    telemetry.coolantValidity === 'FAULT_OPEN' ||
    telemetry.coolantValidity === 'FAULT_SHORT_GND' ||
    telemetry.coolantValidity === 'FAULT_SHORT_VBAT' ||
    telemetry.coolantValidity === 'INVALID_SOURCE';
  const ectDisplay =
    isPsuOff || telemetry.coolantTempC === null
      ? '—'
      : telemetry.coolantTempC.toFixed(1);
  const ectStatusText = isPsuOff
    ? 'PSU OFF'
    : telemetry.coolantValidity === 'FAULT_OPEN'
    ? 'FAULT: OPEN'
    : telemetry.coolantValidity === 'FAULT_SHORT_GND'
    ? 'FAULT: SHORT GND'
    : telemetry.coolantValidity === 'FAULT_SHORT_VBAT'
    ? 'FAULT: SHORT +B'
    : telemetry.coolantValidity === 'INVALID_SOURCE'
    ? 'INVALID SOURCE'
    : `MNA Pin 9 · ${telemetry.coolantVoltage.toFixed(2)}V`;
  const ectStatusColor = isPsuOff
    ? 'text-[#748aa8]'
    : ectFaulted
    ? 'text-[#ff4d62]'
    : telemetry.statusCode === 'LIVE_SIMULATED'
    ? 'text-[#20d889]'
    : 'text-[#b7c8dd]';

  const supplyFaulted =
    telemetry.supplyValidity === 'FAULT_OPEN' ||
    telemetry.supplyValidity === 'FAULT_SHORT_GND';
  const supplyDisplay =
    isPsuOff || telemetry.supplyVoltageV === null
      ? '—'
      : telemetry.supplyVoltageV.toFixed(2);
  const supplyStatusText = isPsuOff
    ? 'PSU OFF'
    : telemetry.supplyValidity === 'FAULT_OPEN'
    ? 'KL30 OPEN'
    : telemetry.supplyValidity === 'FAULT_SHORT_GND'
    ? 'KL30 SHORT/CC'
    : telemetry.supplyVoltageV !== null && telemetry.supplyVoltageV < 10.5
    ? 'LOW VOLTAGE'
    : 'KL30 PIN 3 · MNA';
  const supplyStatusColor = isPsuOff
    ? 'text-[#748aa8]'
    : supplyFaulted
    ? 'text-[#ff4d62]'
    : telemetry.supplyVoltageV !== null && telemetry.supplyVoltageV < 10.5
    ? 'text-[#ffb020]'
    : 'text-[#20d889]';

  return (
    <div className="grid grid-cols-2 gap-2 font-mono tabular-nums">
      {/* Card 1: ESTIMATED MAF */}
      <div className="hw-lcd-well rounded-xl p-2.5 border border-[#203653] flex flex-col justify-between gap-1">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#91a4bd] truncate">
            ESTIMATED MAF
          </span>
          {showPeakHold && peakHold.maxMafGps !== null && (
            <span className="text-[8.5px] text-[#ffb020] shrink-0">
              PK {peakHold.maxMafGps.toFixed(1)}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className={`text-lg font-bold leading-none ${
              mafFaulted ? 'text-[#ff4d62]' : isPsuOff ? 'text-[#748aa8]' : 'text-[#eaf3ff]'
            }`}
          >
            {mafDisplay}
          </span>
          <span className="text-[10px] text-[#91a4bd]">g/s</span>
        </div>
        <span className={`text-[9px] font-bold uppercase truncate ${mafStatusColor}`}>
          {mafStatusText}
        </span>
      </div>

      {/* Card 2: Coolant temperature */}
      <div className="hw-lcd-well rounded-xl p-2.5 border border-[#203653] flex flex-col justify-between gap-1">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#91a4bd] truncate">
            Coolant temp
          </span>
          {showPeakHold && peakHold.maxCoolantC !== null && (
            <span className="text-[8.5px] text-[#ffb020] shrink-0">
              PK {peakHold.maxCoolantC.toFixed(0)}°C
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className={`text-lg font-bold leading-none ${
              ectFaulted ? 'text-[#ff4d62]' : isPsuOff ? 'text-[#748aa8]' : 'text-[#eaf3ff]'
            }`}
          >
            {ectDisplay}
          </span>
          <span className="text-[10px] text-[#91a4bd]">°C</span>
        </div>
        <span
          className={`text-[9px] font-bold uppercase truncate ${ectStatusColor}`}
          title={telemetry.coolantFaultLabel || ectStatusText}
        >
          {ectStatusText}
        </span>
      </div>

      {/* Card 3: Intake temperature */}
      <div className="hw-lcd-well rounded-xl p-2.5 border border-[#203653] flex flex-col justify-between gap-1">
        <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#91a4bd] truncate">
          Intake temp
        </span>
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold leading-none text-[#eaf3ff]">
            {telemetry.intakeTempC.toFixed(1)}
          </span>
          <span className="text-[10px] text-[#91a4bd]">°C</span>
        </div>
        <span className="text-[9px] font-bold uppercase truncate text-[#20d889]">
          {telemetry.statusCode === 'LIVE_SIMULATED' ? 'LIVE · IAT CONFIG' : 'IAT CONFIG'}
        </span>
      </div>

      {/* Card 4: ECU supply voltage */}
      <div className="hw-lcd-well rounded-xl p-2.5 border border-[#203653] flex flex-col justify-between gap-1">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#91a4bd] truncate">
            ECU supply V
          </span>
          {showPeakHold && peakHold.minSupplyV !== null && peakHold.maxSupplyV !== null && (
            <span className="text-[8.5px] text-[#ffb020] shrink-0">
              {peakHold.minSupplyV.toFixed(1)}–{peakHold.maxSupplyV.toFixed(1)}V
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className={`text-lg font-bold leading-none ${
              supplyFaulted
                ? 'text-[#ff4d62]'
                : isPsuOff
                ? 'text-[#748aa8]'
                : 'text-[#19c8f5]'
            }`}
          >
            {supplyDisplay}
          </span>
          <span className="text-[10px] text-[#91a4bd]">V</span>
        </div>
        <span className={`text-[9px] font-bold uppercase truncate ${supplyStatusColor}`}>
          {supplyStatusText}
        </span>
      </div>
    </div>
  );
};
