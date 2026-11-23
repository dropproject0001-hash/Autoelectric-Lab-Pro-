import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Cpu,
  ExternalLink,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  BenchComponent,
  InjectedFault,
  PowerSupplyState,
  WireConnection,
} from '../../types/ecu';
import type { CircuitSolution } from '../../utils/circuitSolver';
import { ECU_BRAND_PROFILES } from '../ecuPinoutData';
import {
  getEcuProfileById,
  getSelectedVehicleContext,
  resolveProfileForVehicle,
  resolveSelectionFromProfileId,
  RpmEmulatorState,
  UNIVERSAL_BRAND_KEY,
  VEHICLE_CATALOG,
} from '../../utils/vehicleEcuRegistry';
import { playModuleActivationSound } from '../../utils/audioFeedback';
import { RackCornerScrews } from '../HardwareControls';
import type { GaugeMonitorState } from '../../simulation/telemetry/telemetryTypes';
import { useGaugeTelemetry } from '../../hooks/useGaugeTelemetry';
import { CircularInstrumentGauge } from './CircularInstrumentGauge';
import { BoostVacuumGauge } from './BoostVacuumGauge';
import { TelemetryCards } from './TelemetryCards';
import { BenchLoadControls } from './BenchLoadControls';
import { GaugeTransportControls } from './GaugeTransportControls';

export interface LiveGaugeConsoleProps {
  selectedBrandKey: string;
  selectedModelName: string;
  selectedEcuProfileId: string | null;
  onSelectVehicleEcu: (brandKey: string, modelName: string, ecuProfileId: string | null) => void;
  onOpenEcuPinouts?: () => void;
  rpmEmulator: RpmEmulatorState;
  onChangeRpmEmulator: React.Dispatch<React.SetStateAction<RpmEmulatorState>>;
  gaugeMonitor: GaugeMonitorState;
  onChangeGaugeMonitor: React.Dispatch<React.SetStateAction<GaugeMonitorState>>;
  powerSupply: PowerSupplyState;
  circuitSolution: CircuitSolution;
  components: BenchComponent[];
  faults: InjectedFault[];
  wires: WireConnection[];
  onUpdateComponentState?: (compId: string, updates: Record<string, number | boolean | string>) => void;
  isSafetyLocked?: boolean;
  safetyLockReason?: string;
}

export const LiveGaugeConsole: React.FC<LiveGaugeConsoleProps> = ({
  selectedBrandKey,
  selectedModelName,
  selectedEcuProfileId,
  onSelectVehicleEcu,
  onOpenEcuPinouts,
  rpmEmulator,
  onChangeRpmEmulator,
  gaugeMonitor,
  onChangeGaugeMonitor,
  powerSupply,
  circuitSolution,
  components,
  faults,
  wires,
  onUpdateComponentState,
  isSafetyLocked = false,
  safetyLockReason,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const selectedMake = useMemo(
    () => VEHICLE_CATALOG.find((m) => m.brandKey === selectedBrandKey) || null,
    [selectedBrandKey]
  );
  const activeProfile = useMemo(
    () => getEcuProfileById(selectedEcuProfileId),
    [selectedEcuProfileId]
  );
  const vehicleCtx = useMemo(
    () => getSelectedVehicleContext(selectedBrandKey, selectedModelName, selectedEcuProfileId),
    [selectedBrandKey, selectedModelName, selectedEcuProfileId]
  );
  const availableEcuProfiles = selectedMake ? selectedMake.profiles : ECU_BRAND_PROFILES;

  const telemetry = useGaugeTelemetry({
    powerSupply,
    circuitSolution,
    components,
    faults,
    wires,
    rpmEmulator,
    gaugeMonitor,
    onChangeGaugeMonitor,
    isSafetyLocked,
    safetyLockReason,
  });

  const handleBrandChange = (brandKey: string) => {
    if (rpmEmulator.soundEnabled) playModuleActivationSound(true, 'sensor');
    if (brandKey === UNIVERSAL_BRAND_KEY) {
      onSelectVehicleEcu(UNIVERSAL_BRAND_KEY, 'Generic 16-Pin Bench', null);
      return;
    }
    const make = VEHICLE_CATALOG.find((m) => m.brandKey === brandKey);
    const firstModel = make?.models[0] || '';
    const profile = resolveProfileForVehicle(brandKey, firstModel);
    onSelectVehicleEcu(brandKey, firstModel, profile?.id || null);
  };

  const handleModelChange = (modelName: string) => {
    if (rpmEmulator.soundEnabled) playModuleActivationSound(true, 'sensor');
    const profile = resolveProfileForVehicle(selectedBrandKey, modelName);
    onSelectVehicleEcu(selectedBrandKey, modelName, profile?.id || selectedEcuProfileId);
  };

  const handleEcuChange = (profileId: string) => {
    if (rpmEmulator.soundEnabled) playModuleActivationSound(true, 'sensor');
    if (!profileId || profileId === UNIVERSAL_BRAND_KEY) {
      onSelectVehicleEcu(UNIVERSAL_BRAND_KEY, 'Generic 16-Pin Bench', null);
      return;
    }
    const resolved = resolveSelectionFromProfileId(profileId);
    onSelectVehicleEcu(resolved.brandKey, resolved.modelName, resolved.ecuProfileId);
  };

  const handleToggleSoundFx = () => {
    const nextSound = !rpmEmulator.soundEnabled;
    if (nextSound) playModuleActivationSound(true, 'sensor');
    onChangeRpmEmulator((prev) => ({ ...prev, soundEnabled: nextSound }));
  };

  const handleStartLive = () => {
    if (!powerSupply.isOutputEnabled || isSafetyLocked) return;
    if (rpmEmulator.soundEnabled) playModuleActivationSound(true, 'rpm');
    onChangeRpmEmulator((prev) => ({ ...prev, isActive: true }));
    onChangeGaugeMonitor((prev) => ({ ...prev, transportMode: 'LIVE' }));
  };

  const handlePause = () => {
    onChangeGaugeMonitor((prev) => ({ ...prev, transportMode: 'PAUSED' }));
  };

  const handleStop = () => {
    if (rpmEmulator.soundEnabled && rpmEmulator.isActive) {
      playModuleActivationSound(false, 'rpm');
    }
    onChangeRpmEmulator((prev) => ({ ...prev, isActive: false }));
    onChangeGaugeMonitor((prev) => ({ ...prev, transportMode: 'STOPPED' }));
  };

  const handleResetPeaks = () => {
    onChangeGaugeMonitor((prev) => ({
      ...prev,
      peakHold: {
        maxRpm: null,
        maxSpeedKmh: null,
        maxBoostBar: null,
        maxMafGps: null,
        maxCoolantC: null,
        minSupplyV: null,
        maxSupplyV: null,
      },
    }));
  };

  const handleToggleShowPeaks = () => {
    onChangeGaugeMonitor((prev) => ({ ...prev, showPeakHold: !prev.showPeakHold }));
  };

  const statusBadgeClass =
    telemetry.statusCode === 'LIVE_SIMULATED'
      ? 'hw-btn-green'
      : telemetry.statusCode === 'CKP_NO_SIGNAL' || telemetry.statusCode === 'SAFETY_LOCKED'
      ? 'bg-rose-950/75 border-rose-500/70 text-rose-300'
      : telemetry.statusCode === 'PAUSED'
      ? 'hw-btn-amber'
      : 'text-slate-400';

  const statusDotClass =
    telemetry.statusCode === 'LIVE_SIMULATED'
      ? 'bg-emerald-400'
      : telemetry.statusCode === 'CKP_NO_SIGNAL' || telemetry.statusCode === 'SAFETY_LOCKED'
      ? 'bg-rose-400'
      : telemetry.statusCode === 'PAUSED'
      ? 'bg-amber-400'
      : 'bg-slate-600';

  const dialFooter =
    telemetry.statusCode === 'LIVE_SIMULATED'
      ? 'LIVE'
      : telemetry.statusCode === 'PAUSED'
      ? 'PAUSED'
      : telemetry.statusCode === 'PSU_OFF'
      ? 'PSU OFF'
      : telemetry.statusCode === 'CKP_NO_SIGNAL'
      ? 'CKP LOSS'
      : telemetry.statusCode === 'SAFETY_LOCKED'
      ? 'LOCKED'
      : 'STANDBY';

  return (
    <div className="relative hud-panel rounded-xl border-[#203653] p-3 text-[#eaf3ff] flex flex-col gap-2.5 shrink-0 overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#19c8f5]/45 to-transparent"
      />
      <RackCornerScrews />

      {/* Responding ECU Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[#203653]/80 pb-2 px-1">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer min-h-[34px]"
          aria-expanded={isExpanded}
        >
          <div className="w-7 h-7 rounded-lg bg-[#0d1c33] border border-[#19c8f5]/35 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(25,200,245,0.14)]">
            <Cpu className="w-4 h-4 text-[#19c8f5]" />
          </div>
          <div className="min-w-0">
            <span className="text-[11.5px] font-hud font-bold tracking-wider uppercase text-[#eaf3ff] block truncate leading-tight">
              Live ECU Console
            </span>
            <span className="text-[10px] font-mono text-[#91a4bd] block truncate">
              {activeProfile
                ? `${selectedMake?.brandLabel || activeProfile.brandName} · ${selectedModelName}`
                : 'Universal 16-Pin Bench'}
            </span>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-[#91a4bd] shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-[#91a4bd] shrink-0" />
          )}
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {powerSupply.isOutputEnabled && (
            <span
              className={`px-2 py-1 rounded-lg border text-[9.5px] font-mono font-bold tabular-nums flex items-center gap-1 whitespace-nowrap ${
                circuitSolution.isSupplyCurrentTripped
                  ? 'bg-[#2a1c0a] border-[#ffb020]/60 text-[#ffb020]'
                  : 'bg-[#0b261c] border-[#20d889]/55 text-[#20d889]'
              }`}
              title={`Bench PSU energized at ${powerSupply.voltageSetting.toFixed(1)}V${circuitSolution.isSupplyCurrentTripped ? ' (Current Trip / Limiting)' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`w-1.5 h-1.5 rounded-full ${
                  circuitSolution.isSupplyCurrentTripped ? 'bg-[#ffb020]' : 'bg-[#20d889]'
                }`}
              />
              <span>
                {circuitSolution.isSupplyCurrentTripped
                  ? `CC ${powerSupply.voltageSetting.toFixed(1)}V`
                  : `${powerSupply.voltageSetting.toFixed(1)}V`}
              </span>
            </span>
          )}

          <button
            type="button"
            onClick={handleToggleSoundFx}
            title={rpmEmulator.soundEnabled ? 'Mute Emulator Audio FX' : 'Enable Emulator Audio FX'}
            aria-label={rpmEmulator.soundEnabled ? 'Mute Emulator Sound' : 'Unmute Emulator Sound'}
            className={`hw-btn h-7 w-7 rounded-lg text-[10px] font-mono flex items-center justify-center shrink-0 cursor-pointer ${
              rpmEmulator.soundEnabled
                ? 'text-[#20d889] border-[#20d889]/45'
                : 'text-[#91a4bd]'
            }`}
          >
            {rpmEmulator.soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
          </button>

          <span
            className={`hw-btn px-2 py-1 rounded-lg text-[9.5px] font-mono font-bold flex items-center gap-1 tabular-nums whitespace-nowrap ${statusBadgeClass}`}
            title={telemetry.statusDetail}
          >
            <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${statusDotClass}`} />
            <span>{telemetry.statusLabel}</span>
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="flex flex-col gap-2 text-[11px] font-mono">
          {/* 1. Responding ECU Selector Bay */}
          <div className="hw-lcd-well rounded-xl p-2 border border-[#203653]/85 flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="bench-car-brand"
                  className="text-[9.5px] text-[#91a4bd] uppercase tracking-wider font-semibold"
                >
                  Vehicle Make
                </label>
                <select
                  id="bench-car-brand"
                  aria-label="Select Car Brand"
                  value={selectedBrandKey}
                  onChange={(e) => handleBrandChange(e.target.value)}
                  className="min-h-[38px] bg-[#0b1628] border border-[#203653] hover:border-[#38a3ff]/60 rounded-lg px-2.5 py-1.5 text-[11px] text-[#eaf3ff] focus:outline-none focus:border-[#19c8f5] truncate cursor-pointer transition-colors"
                >
                  <option value={UNIVERSAL_BRAND_KEY}>Universal ECU</option>
                  {VEHICLE_CATALOG.map((make) => (
                    <option key={make.brandKey} value={make.brandKey}>
                      {make.brandLabel}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="bench-car-model"
                  className="text-[9.5px] text-[#91a4bd] uppercase tracking-wider font-semibold"
                >
                  Vehicle Model
                </label>
                <select
                  id="bench-car-model"
                  aria-label="Select Vehicle Model"
                  value={selectedBrandKey === UNIVERSAL_BRAND_KEY ? 'Generic 16-Pin Bench' : selectedModelName}
                  disabled={selectedBrandKey === UNIVERSAL_BRAND_KEY}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="min-h-[38px] bg-[#0b1628] border border-[#203653] hover:border-[#38a3ff]/60 rounded-lg px-2.5 py-1.5 text-[11px] text-[#eaf3ff] focus:outline-none focus:border-[#19c8f5] disabled:opacity-55 truncate cursor-pointer transition-colors"
                >
                  {selectedMake ? (
                    selectedMake.models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))
                  ) : (
                    <option value="Generic 16-Pin Bench">16-Pin Universal</option>
                  )}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="bench-ecu-unit"
                  className="text-[9.5px] text-[#91a4bd] uppercase tracking-wider font-semibold flex items-center gap-1"
                >
                  <span>Responding ECU</span>
                </label>
                {activeProfile && onOpenEcuPinouts && (
                  <button
                    type="button"
                    onClick={onOpenEcuPinouts}
                    className="text-[10px] text-[#19c8f5] hover:text-[#7ee2ff] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <span>OEM Pinouts</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
              <select
                id="bench-ecu-unit"
                aria-label="Select ECU Model"
                value={selectedEcuProfileId || UNIVERSAL_BRAND_KEY}
                disabled={
                  vehicleCtx.status === 'PART_METADATA_ONLY' ||
                  vehicleCtx.status === 'MECHANICAL_NO_ECU'
                }
                onChange={(e) => handleEcuChange(e.target.value)}
                className="min-h-[38px] bg-[#0b1628] border border-[#203653] hover:border-[#38a3ff]/60 rounded-lg px-2.5 py-1.5 text-[11px] text-[#ffb020] font-semibold focus:outline-none focus:border-[#19c8f5] disabled:opacity-60 truncate cursor-pointer transition-colors"
              >
                <option value={UNIVERSAL_BRAND_KEY}>
                  OBD responder 7E8 · Universal 16-Pin Bench
                </option>
                {availableEcuProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.modelName}
                  </option>
                ))}
              </select>
            </div>

            {selectedBrandKey !== UNIVERSAL_BRAND_KEY && (
              <div className="rounded-lg px-2.5 py-1.5 text-[10px] border bg-[#081120] border-[#203653]/80 text-[#d4e3f6] flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{activeProfile ? activeProfile.cavityInfo : vehicleCtx.controllerNote}</span>
                <span
                  className={`px-2 py-0.5 rounded-md font-bold text-[8.5px] uppercase border shrink-0 ${
                    vehicleCtx.status === 'VERIFIED'
                      ? 'bg-[#0b261c] text-[#20d889] border-[#20d889]/50'
                      : 'bg-[#2a1c0a] text-[#ffb020] border-[#ffb020]/50'
                  }`}
                >
                  {vehicleCtx.status}
                </span>
              </div>
            )}
          </div>

          {/* 2. Dual Circular Analog-Digital Gauges */}
          <div className="grid grid-cols-2 gap-1.5">
            <CircularInstrumentGauge
              title="ENGINE"
              subtitle="×1000 rpm"
              value={telemetry.rpm}
              min={0}
              max={8000}
              unit="rpm"
              majorStep={1000}
              minorStepsPerMajor={4}
              labelDivisor={1000}
              redlineStart={6500}
              peakValue={gaugeMonitor.peakHold.maxRpm}
              showPeakHold={gaugeMonitor.showPeakHold}
              statusCode={telemetry.statusCode}
              statusFooterLabel={dialFooter}
              accent="amber"
              ariaLabel="Engine RPM Gauge"
            />

            <CircularInstrumentGauge
              title="SIMULATED"
              subtitle="SPEED km/h"
              value={telemetry.simulatedSpeedKmh}
              min={0}
              max={260}
              unit="km/h"
              majorStep={20}
              minorStepsPerMajor={2}
              labelDivisor={1}
              peakValue={gaugeMonitor.peakHold.maxSpeedKmh}
              showPeakHold={gaugeMonitor.showPeakHold}
              statusCode={telemetry.statusCode}
              statusFooterLabel={
                telemetry.statusCode === 'LIVE_SIMULATED'
                  ? telemetry.speedSourceLabel
                  : dialFooter
              }
              accent="amber"
              ariaLabel="Simulated Vehicle Speed Gauge"
            />
          </div>

          {/* 3. Centered Boost / Vacuum Bar Callout */}
          <BoostVacuumGauge
            telemetry={telemetry}
            peakHold={gaugeMonitor.peakHold}
            showPeakHold={gaugeMonitor.showPeakHold}
            mapCalibrationPreset={gaugeMonitor.mapCalibrationPreset}
          />

          {/* 4. Digital Telemetry Cards (ESTIMATED MAF · Coolant · Intake · Supply V) */}
          <TelemetryCards
            telemetry={telemetry}
            peakHold={gaugeMonitor.peakHold}
            showPeakHold={gaugeMonitor.showPeakHold}
          />

          {/* 5. Collapsible Bench Load & Sensor Controls */}
          <BenchLoadControls
            rpmEmulator={rpmEmulator}
            onChangeRpmEmulator={onChangeRpmEmulator}
            gaugeMonitor={gaugeMonitor}
            onChangeGaugeMonitor={onChangeGaugeMonitor}
            components={components}
            onUpdateComponentState={onUpdateComponentState}
            isPowerOn={powerSupply.isOutputEnabled}
          />

          {/* 6. Transport Actions */}
          <GaugeTransportControls
            transportMode={gaugeMonitor.transportMode}
            isPowerOn={powerSupply.isOutputEnabled}
            isSafetyLocked={isSafetyLocked}
            safetyLockReason={safetyLockReason}
            showPeakHold={gaugeMonitor.showPeakHold}
            onStartLive={handleStartLive}
            onPause={handlePause}
            onStop={handleStop}
            onResetPeaks={handleResetPeaks}
            onToggleShowPeaks={handleToggleShowPeaks}
          />
        </div>
      )}
    </div>
  );
};
