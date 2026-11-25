/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Gauge, Radio, Sliders, Zap } from 'lucide-react';
import type { BenchComponent } from '../../types/ecu';
import type { RpmEmulatorState } from '../../utils/vehicleEcuRegistry';
import {
  GaugeMonitorState,
  GearSelection,
  MapCalibrationPreset,
} from '../../simulation/telemetry/telemetryTypes';
import { MAP_CALIBRATIONS } from '../../simulation/telemetry/sensorTransferCurves';
import { RotaryEncoderDial } from '../HardwareControls';
import { computeRpmAudioProfile, playModuleActivationSound } from '../../utils/audioFeedback';

export interface BenchLoadControlsProps {
  rpmEmulator: RpmEmulatorState;
  onChangeRpmEmulator: React.Dispatch<React.SetStateAction<RpmEmulatorState>>;
  gaugeMonitor: GaugeMonitorState;
  onChangeGaugeMonitor: React.Dispatch<React.SetStateAction<GaugeMonitorState>>;
  components: BenchComponent[];
  onUpdateComponentState?: (compId: string, updates: Record<string, number | boolean | string>) => void;
  isPowerOn: boolean;
}

const RPM_PRESETS = [
  { label: 'IDLE', rpm: 800 },
  { label: '2.5K', rpm: 2500 },
  { label: '4.5K', rpm: 4500 },
  { label: '6.5K', rpm: 6500 },
];

const GEARS: GearSelection[] = ['N', '1', '2', '3', '4', '5', '6'];

export const BenchLoadControls: React.FC<BenchLoadControlsProps> = ({
  rpmEmulator,
  onChangeRpmEmulator,
  gaugeMonitor,
  onChangeGaugeMonitor,
  components,
  onUpdateComponentState,
  isPowerOn,
}) => {
  const [isOpen, setIsOpen] = useState(true);

  const mapComp = components.find((c) => c.id === 'comp-map');
  const ectComp = components.find((c) => c.id === 'comp-ect');
  const tpsComp = components.find((c) => c.id === 'comp-tps');
  const injComp = components.find((c) => c.id === 'comp-inj');
  const relayComp = components.find((c) => c.id === 'comp-relay');

  const mapCal = MAP_CALIBRATIONS[gaugeMonitor.mapCalibrationPreset];
  const mapPressureKpa = Number(mapComp?.state?.pressureKpa ?? 42);
  const ectTempCelsius = Number(ectComp?.state?.tempCelsius ?? 85);
  const tpsPercent = Number(tpsComp?.state?.throttleAnglePercent ?? 20);
  const isInjectorActive = Boolean(injComp?.state?.isFiring ?? true);
  const isRelayActive = Boolean(relayComp?.state?.isLatched ?? true);
  const camPhaseDeg = rpmEmulator.camPhaseOffsetDeg ?? 0;

  const rpmAudioProfile = computeRpmAudioProfile(rpmEmulator.rpm);
  const activeSoundBars =
    !rpmEmulator.isActive ||
    !isPowerOn ||
    !rpmEmulator.soundEnabled ||
    rpmEmulator.ckpSignalLost
      ? 0
      : Math.max(1, Math.round(1 + rpmAudioProfile.normalizedRpm * 4));

  const handleRpmChange = (nextRpm: number) => {
    const rounded = Math.round(Math.max(600, Math.min(7000, nextRpm)));
    onChangeRpmEmulator((prev) => ({
      ...prev,
      rpm: rounded,
    }));
  };

  const handleMapPresetChange = (preset: MapCalibrationPreset) => {
    const targetCal = MAP_CALIBRATIONS[preset];
    const clampedKpa = Math.max(targetCal.minKpa, Math.min(targetCal.maxKpa, mapPressureKpa));
    onChangeGaugeMonitor((prev) => ({
      ...prev,
      mapCalibrationPreset: preset,
    }));
    onUpdateComponentState?.('comp-map', {
      calibrationPreset: preset,
      pressureKpa: clampedKpa,
    });
  };

  const handleToggleInjector = () => {
    const next = !isInjectorActive;
    if (rpmEmulator.soundEnabled) {
      playModuleActivationSound(next, 'injector');
    }
    onUpdateComponentState?.('comp-inj', { isFiring: next });
  };

  const handleToggleRelay = () => {
    const next = !isRelayActive;
    if (rpmEmulator.soundEnabled) {
      playModuleActivationSound(next, 'relay');
    }
    onUpdateComponentState?.('comp-relay', { isLatched: next });
  };

  return (
    <div className="hw-lcd-well rounded-xl border border-[#203653] flex flex-col">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left cursor-pointer hover:bg-[#132238]/80 transition rounded-xl"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Sliders className="w-3.5 h-3.5 text-[#19C8F5] shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#EAF3FF] truncate">
            Bench Load &amp; Sensor Controls
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-end gap-0.5 h-2.5" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((bar) => (
              <span
                key={bar}
                style={{ height: `${bar * 20}%` }}
                className={`w-0.5 ${
                  bar <= activeSoundBars
                    ? bar >= 4
                      ? 'bg-[#FFB020]'
                      : 'bg-[#20D889]'
                    : 'bg-[#203653]'
                }`}
              />
            ))}
          </div>
          {isOpen ? (
            <ChevronUp className="w-3.5 h-3.5 text-[#91A4BD]" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-[#91A4BD]" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="px-2.5 pb-2.5 pt-1.5 border-t border-[#203653] flex flex-col gap-2 text-[10px] font-mono">
          {/* RPM Rotary Encoder + Preset Keys */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-1 text-slate-300 font-bold">
                <Gauge className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>RPM Command</span>
              </div>
              <span className="text-[11px] font-bold text-amber-300 tabular-nums">
                {rpmEmulator.rpm} RPM
              </span>
              <div className="grid grid-cols-2 gap-1">
                {RPM_PRESETS.map((preset) => {
                  const selected = Math.abs(rpmEmulator.rpm - preset.rpm) <= 100;
                  return (
                    <button
                      key={preset.rpm}
                      type="button"
                      onClick={() => handleRpmChange(preset.rpm)}
                      className={`hw-btn px-2 py-0.5 rounded-md text-[9px] font-bold cursor-pointer ${
                        selected ? 'hw-btn-green' : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <RotaryEncoderDial
              ariaLabel="Engine RPM Command"
              value={rpmEmulator.rpm}
              min={600}
              max={7000}
              step={50}
              accent="amber"
              size="sm"
              inlineFlankButtons={{
                dec: { label: '-100', delta: -100 },
                inc: { label: '+100', delta: 100 },
              }}
              onChange={handleRpmChange}
            />
          </div>

          {/* MAP Calibration Selector & Manifold Pressure Slider/Controls */}
          <div className="pt-1.5 border-t border-[#203653] flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[9.5px] font-bold uppercase text-slate-400">
                MAP Transducer
              </span>
              <div className="flex items-center gap-1">
                {(['BAR_1_NA', 'BAR_2_BOOST', 'BAR_3_BOOST'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleMapPresetChange(preset)}
                    className={`hw-btn px-1.5 py-0.5 rounded-md text-[8.5px] font-bold cursor-pointer ${
                      gaugeMonitor.mapCalibrationPreset === preset
                        ? 'hw-btn-amber'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {MAP_CALIBRATIONS[preset].shortLabel}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="gauge-map-kpa" className="text-[9px] text-slate-400 shrink-0 w-16">
                MAP kPa
              </label>
              <input
                id="gauge-map-kpa"
                type="range"
                min={mapCal.minKpa}
                max={mapCal.maxKpa}
                step={1}
                value={Math.max(mapCal.minKpa, Math.min(mapCal.maxKpa, mapPressureKpa))}
                onChange={(e) =>
                  onUpdateComponentState?.('comp-map', {
                    calibrationPreset: gaugeMonitor.mapCalibrationPreset,
                    pressureKpa: Number(e.target.value),
                  })
                }
                className="flex-1 accent-amber-400 cursor-pointer h-1.5"
              />
              <span className="text-[10px] font-bold text-slate-200 tabular-nums w-14 text-right">
                {Math.round(mapPressureKpa)} kPa
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="gauge-tps-pct" className="text-[9px] text-slate-400 shrink-0 w-16">
                TPS Angle
              </label>
              <input
                id="gauge-tps-pct"
                type="range"
                min={0}
                max={100}
                step={1}
                value={tpsPercent}
                onChange={(e) =>
                  onUpdateComponentState?.('comp-tps', {
                    throttleAnglePercent: Number(e.target.value),
                  })
                }
                className="flex-1 accent-emerald-400 cursor-pointer h-1.5"
              />
              <span className="text-[10px] font-bold text-slate-200 tabular-nums w-14 text-right">
                {Math.round(tpsPercent)}%
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="gauge-ect-temp" className="text-[9px] text-slate-400 shrink-0 w-16">
                Coolant °C
              </label>
              <input
                id="gauge-ect-temp"
                type="range"
                min={-40}
                max={130}
                step={1}
                value={Math.max(-40, Math.min(130, ectTempCelsius))}
                onChange={(e) =>
                  onUpdateComponentState?.('comp-ect', {
                    tempCelsius: Number(e.target.value),
                  })
                }
                className="flex-1 accent-amber-400 cursor-pointer h-1.5"
              />
              <span className="text-[10px] font-bold text-slate-200 tabular-nums w-14 text-right">
                {Math.round(ectTempCelsius)}°C
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="gauge-iat-temp" className="text-[9px] text-slate-400 shrink-0 w-16">
                Intake °C
              </label>
              <input
                id="gauge-iat-temp"
                type="range"
                min={-20}
                max={80}
                step={0.5}
                value={gaugeMonitor.intakeTempCelsius}
                onChange={(e) =>
                  onChangeGaugeMonitor((prev) => ({
                    ...prev,
                    intakeTempCelsius: Number(e.target.value),
                  }))
                }
                className="flex-1 accent-emerald-400 cursor-pointer h-1.5"
              />
              <span className="text-[10px] font-bold text-slate-200 tabular-nums w-14 text-right">
                {gaugeMonitor.intakeTempCelsius.toFixed(1)}°C
              </span>
            </div>
          </div>

          {/* Drivetrain Gear / Speed & Engine Displacement + VE */}
          <div className="pt-1.5 border-t border-[#203653] flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9px] text-slate-400 uppercase font-bold">
                Drivetrain Gear
              </span>
              <div className="flex items-center gap-0.5">
                {GEARS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() =>
                      onChangeGaugeMonitor((prev) => ({
                        ...prev,
                        selectedGear: g,
                        speedKmhOverride: null,
                      }))
                    }
                    className={`hw-btn px-1.5 py-0.5 rounded-md text-[9px] font-bold cursor-pointer ${
                      gaugeMonitor.speedKmhOverride === null && gaugeMonitor.selectedGear === g
                        ? 'hw-btn-amber'
                        : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex items-center justify-between bg-[#0A1220] border border-[#203653] rounded-lg px-2 py-1">
                <label htmlFor="gauge-disp-l" className="text-[9px] text-[#91A4BD]">
                  Disp (L)
                </label>
                <input
                  id="gauge-disp-l"
                  type="number"
                  min={0.6}
                  max={8.0}
                  step={0.1}
                  value={gaugeMonitor.engineDisplacementLiters}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val)) {
                      onChangeGaugeMonitor((prev) => ({
                        ...prev,
                        engineDisplacementLiters: Math.max(0.6, Math.min(8.0, val)),
                      }));
                    }
                  }}
                  className="w-12 bg-transparent text-right text-[10px] font-bold text-[#EAF3FF] focus:outline-none tabular-nums"
                />
              </div>

              <div className="flex items-center justify-between bg-[#0A1220] border border-[#203653] rounded-lg px-2 py-1">
                <label htmlFor="gauge-ve" className="text-[9px] text-[#91A4BD]">
                  VE Ratio
                </label>
                <input
                  id="gauge-ve"
                  type="number"
                  min={0.4}
                  max={1.15}
                  step={0.05}
                  value={gaugeMonitor.volumetricEfficiency}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val)) {
                      onChangeGaugeMonitor((prev) => ({
                        ...prev,
                        volumetricEfficiency: Math.max(0.4, Math.min(1.15, val)),
                      }));
                    }
                  }}
                  className="w-12 bg-transparent text-right text-[10px] font-bold text-slate-100 focus:outline-none tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Actuator / CKP / CMP Hardware Keys (100% Preserved from BenchVehicleEmulatorPanel) */}
          <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-[#203653]">
            <button
              type="button"
              onClick={handleToggleInjector}
              aria-pressed={isInjectorActive}
              className={`hw-btn px-1.5 py-1 rounded-md text-[9px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                isInjectorActive ? 'hw-btn-green' : 'text-slate-400'
              }`}
            >
              <Zap className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">INJ1 {isInjectorActive ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleRelay}
              aria-pressed={isRelayActive}
              className={`hw-btn px-1.5 py-1 rounded-md text-[9px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                isRelayActive ? 'hw-btn-amber' : 'text-slate-400'
              }`}
            >
              <Radio className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">MREL {isRelayActive ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onChangeRpmEmulator((prev) => ({
                  ...prev,
                  ckpSignalLost: !prev.ckpSignalLost,
                }))
              }
              aria-pressed={Boolean(rpmEmulator.ckpSignalLost)}
              title="Simulate Crankshaft 60-2 VR sensor dropout (triggers P0335)"
              className={`hw-btn px-1.5 py-1 rounded-md text-[9px] font-bold truncate cursor-pointer ${
                rpmEmulator.ckpSignalLost
                  ? 'bg-rose-950/75 border-rose-500 text-rose-300'
                  : 'text-slate-300'
              }`}
            >
              {rpmEmulator.ckpSignalLost ? 'CKP LOST' : 'CKP 60-2'}
            </button>
          </div>

          {/* CMP Phase Correlation Rotary Control */}
          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#203653]">
            <div className="flex items-center gap-1.5 min-w-0 text-[9px]">
              <span className="text-slate-400">CMP Phase:</span>
              <span
                className={`font-bold tabular-nums ${
                  Math.abs(camPhaseDeg) > 15
                    ? 'text-rose-400'
                    : camPhaseDeg !== 0
                    ? 'text-amber-300'
                    : 'text-emerald-400'
                }`}
              >
                {camPhaseDeg > 0 ? '+' : ''}
                {camPhaseDeg}°
              </span>
              {camPhaseDeg !== 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onChangeRpmEmulator((prev) => ({ ...prev, camPhaseOffsetDeg: 0 }))
                  }
                  className="hw-btn px-1.5 py-0.5 rounded-md text-[8.5px] text-slate-300 cursor-pointer"
                >
                  0°
                </button>
              )}
            </div>

            <RotaryEncoderDial
              ariaLabel="CMP Camshaft Phase Offset Degrees"
              value={camPhaseDeg}
              min={-30}
              max={30}
              step={1}
              centerResetValue={0}
              accent={Math.abs(camPhaseDeg) > 15 ? 'red' : camPhaseDeg !== 0 ? 'amber' : 'green'}
              size="sm"
              inlineFlankButtons={{
                dec: { label: '-1°', delta: -1 },
                inc: { label: '+1°', delta: 1 },
              }}
              onChange={(deg) =>
                onChangeRpmEmulator((prev) => ({
                  ...prev,
                  camPhaseOffsetDeg: Math.round(deg),
                }))
              }
            />
          </div>
        </div>
      )}
    </div>
  );
};
