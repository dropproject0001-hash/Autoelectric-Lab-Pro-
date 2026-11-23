import React, { useMemo, useState } from 'react';
import {
  Car,
  ChevronDown,
  ChevronUp,
  Cpu,
  Gauge,
  Radio,
  Volume2,
  VolumeX,
  Zap,
  ExternalLink,
} from 'lucide-react';
import { BenchComponent } from '../types/ecu';
import { ECU_BRAND_PROFILES } from './ecuPinoutData';
import {
  RpmEmulatorState,
  UNIVERSAL_BRAND_KEY,
  VEHICLE_CATALOG,
  getEcuProfileById,
  getSelectedVehicleContext,
  resolveProfileForVehicle,
  resolveSelectionFromProfileId,
} from '../utils/vehicleEcuRegistry';
import {
  computeRpmAudioProfile,
  playModuleActivationSound,
} from '../utils/audioFeedback';
import { RackCornerScrews, RotaryEncoderDial } from './HardwareControls';

interface BenchVehicleEmulatorPanelProps {
  selectedBrandKey: string;
  selectedModelName: string;
  selectedEcuProfileId: string | null;
  onSelectVehicleEcu: (brandKey: string, modelName: string, ecuProfileId: string | null) => void;
  onOpenEcuPinouts?: () => void;
  rpmEmulator: RpmEmulatorState;
  onChangeRpmEmulator: React.Dispatch<React.SetStateAction<RpmEmulatorState>>;
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

export const BenchVehicleEmulatorPanel: React.FC<BenchVehicleEmulatorPanelProps> = ({
  selectedBrandKey,
  selectedModelName,
  selectedEcuProfileId,
  onSelectVehicleEcu,
  onOpenEcuPinouts,
  rpmEmulator,
  onChangeRpmEmulator,
  components,
  onUpdateComponentState,
  isPowerOn,
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

  const injComp = useMemo(() => components.find((c) => c.id === 'comp-inj'), [components]);
  const relayComp = useMemo(() => components.find((c) => c.id === 'comp-relay'), [components]);
  const tpsComp = useMemo(() => components.find((c) => c.id === 'comp-tps'), [components]);

  const isInjectorActive = Boolean(injComp?.state?.isFiring ?? true);
  const isRelayActive = Boolean(relayComp?.state?.isLatched ?? true);
  const tpsPercent = Number(tpsComp?.state?.throttleAnglePercent ?? 20);
  const isTpsBoosted = tpsPercent >= 50;

  const rpmAudioProfile = useMemo(
    () => computeRpmAudioProfile(rpmEmulator.rpm),
    [rpmEmulator.rpm]
  );

  const rpmNormalized = rpmAudioProfile.normalizedRpm;
  const activeSoundBars =
    !rpmEmulator.isActive || !isPowerOn || !rpmEmulator.soundEnabled
      ? 0
      : Math.max(1, Math.round(1 + rpmNormalized * 4));

  const soundIntensityLabel = !rpmEmulator.isActive
    ? 'STANDBY'
    : !isPowerOn
    ? 'PSU OFF'
    : !rpmEmulator.soundEnabled
    ? 'MUTED'
    : rpmEmulator.rpm < 1600
    ? 'IDLE PULSE'
    : rpmEmulator.rpm < 3800
    ? 'MID CADENCE'
    : 'HIGH RPM';

  const soundTooltip = !rpmEmulator.isActive || !isPowerOn || !rpmEmulator.soundEnabled
    ? soundIntensityLabel
    : `Web Audio FM: ${rpmAudioProfile.carrierHz.toFixed(0)} Hz carrier · ${rpmAudioProfile.fmModHz.toFixed(0)} Hz mod (±${rpmAudioProfile.fmDeviationHz.toFixed(1)} Hz)`;

  const handleBrandChange = (brandKey: string) => {
    if (rpmEmulator.soundEnabled) {
      playModuleActivationSound(true, 'sensor');
    }
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
    if (rpmEmulator.soundEnabled) {
      playModuleActivationSound(true, 'sensor');
    }
    const profile = resolveProfileForVehicle(selectedBrandKey, modelName);
    onSelectVehicleEcu(selectedBrandKey, modelName, profile?.id || selectedEcuProfileId);
  };

  const handleEcuChange = (profileId: string) => {
    if (rpmEmulator.soundEnabled) {
      playModuleActivationSound(true, 'sensor');
    }
    if (!profileId || profileId === UNIVERSAL_BRAND_KEY) {
      onSelectVehicleEcu(UNIVERSAL_BRAND_KEY, 'Generic 16-Pin Bench', null);
      return;
    }
    const resolved = resolveSelectionFromProfileId(profileId);
    onSelectVehicleEcu(resolved.brandKey, resolved.modelName, resolved.ecuProfileId);
  };

  const setRpmActiveState = (nextActive: boolean) => {
    onChangeRpmEmulator((prev) => ({ ...prev, isActive: nextActive }));
  };

  const handleToggleRpmEmulator = () => {
    const nextActive = !rpmEmulator.isActive;
    if (rpmEmulator.soundEnabled) {
      playModuleActivationSound(nextActive, 'rpm');
    }
    setRpmActiveState(nextActive);
  };

  const handleToggleSoundFx = () => {
    const nextSound = !rpmEmulator.soundEnabled;
    if (nextSound) {
      playModuleActivationSound(true, 'sensor');
    }
    onChangeRpmEmulator((prev) => ({ ...prev, soundEnabled: nextSound }));
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

  const handleToggleTpsStep = () => {
    const nextBoosted = !isTpsBoosted;
    if (rpmEmulator.soundEnabled) {
      playModuleActivationSound(nextBoosted, 'sensor');
    }
    onUpdateComponentState?.('comp-tps', { throttleAnglePercent: nextBoosted ? 68 : 20 });
  };

  const handleRpmValueChange = (nextRpm: number) => {
    if (!rpmEmulator.isActive && rpmEmulator.soundEnabled) {
      playModuleActivationSound(true, 'rpm');
    }
    onChangeRpmEmulator((prev) => ({
      ...prev,
      isActive: true,
      rpm: Math.round(nextRpm),
    }));
  };

  const handleCamPhaseChange = (deg: number) => {
    onChangeRpmEmulator((prev) => ({
      ...prev,
      isActive: true,
      camPhaseOffsetDeg: Math.round(deg),
    }));
  };

  const availableEcuProfiles = selectedMake ? selectedMake.profiles : ECU_BRAND_PROFILES;
  const camPhaseDeg = rpmEmulator.camPhaseOffsetDeg ?? 0;

  return (
    <div className="relative hud-panel rounded-[3px] p-3 text-slate-200 flex flex-col gap-2 shrink-0">
      <RackCornerScrews />

      {/* Rack Module Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[#2b313c] pb-2 pl-2 pr-1">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center gap-2 min-w-0 text-left group cursor-pointer"
          aria-expanded={isExpanded}
        >
          <Car className="w-4 h-4 text-slate-300 shrink-0" />
          <div className="min-w-0">
            <span className="text-[11px] font-hud font-bold tracking-wider uppercase text-slate-100 block truncate">
              Vehicle / ECU &amp; Emulators
            </span>
            <span className="text-[9.5px] font-mono text-slate-400 block truncate">
              {activeProfile
                ? `${selectedMake?.brandLabel || activeProfile.brandName} · ${selectedModelName}`
                : 'Universal 16-Pin ECU Bench'}
            </span>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          )}
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleToggleSoundFx}
            title={rpmEmulator.soundEnabled ? 'Mute Emulator Audio FX' : 'Enable Emulator Audio FX'}
            aria-label={rpmEmulator.soundEnabled ? 'Mute Emulator Sound' : 'Unmute Emulator Sound'}
            className={`hw-btn p-1.5 rounded-[2px] text-[10px] font-mono cursor-pointer ${
              rpmEmulator.soundEnabled
                ? 'text-emerald-400 border-emerald-500/40'
                : 'text-slate-500'
            }`}
          >
            {rpmEmulator.soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleToggleRpmEmulator}
            className={`hw-btn px-2 py-1 rounded-[2px] text-[10px] font-mono font-bold cursor-pointer flex items-center gap-1.5 tabular-nums ${
              rpmEmulator.isActive ? 'hw-btn-green' : 'text-slate-400'
            }`}
          >
            <span
              aria-hidden="true"
              className={`w-1.5 h-1.5 rounded-full ${
                rpmEmulator.isActive ? 'bg-emerald-400' : 'bg-slate-600'
              }`}
            />
            <span>{rpmEmulator.isActive ? `${rpmEmulator.rpm} RPM` : 'RPM OFF'}</span>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="flex flex-col gap-2 text-[11px] font-mono">
          {/* 1. Vehicle / ECU Selection Bay */}
          <div className="hw-lcd-well rounded-[2px] p-2 flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex flex-col gap-0.5">
                <label
                  htmlFor="bench-car-brand"
                  className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold"
                >
                  Car Make
                </label>
                <select
                  id="bench-car-brand"
                  aria-label="Select Car Brand"
                  value={selectedBrandKey}
                  onChange={(e) => handleBrandChange(e.target.value)}
                  className="bg-[#12151b] border border-[#323946] rounded-[2px] px-1.5 py-1 text-[10.5px] text-slate-100 focus:outline-none focus:border-amber-400 truncate cursor-pointer"
                >
                  <option value={UNIVERSAL_BRAND_KEY}>Universal ECU</option>
                  {VEHICLE_CATALOG.map((make) => (
                    <option key={make.brandKey} value={make.brandKey}>
                      {make.brandLabel}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-0.5">
                <label
                  htmlFor="bench-car-model"
                  className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold"
                >
                  Model
                </label>
                <select
                  id="bench-car-model"
                  aria-label="Select Vehicle Model"
                  value={selectedBrandKey === UNIVERSAL_BRAND_KEY ? 'Generic 16-Pin Bench' : selectedModelName}
                  disabled={selectedBrandKey === UNIVERSAL_BRAND_KEY}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="bg-[#12151b] border border-[#323946] rounded-[2px] px-1.5 py-1 text-[10.5px] text-slate-100 focus:outline-none focus:border-amber-400 disabled:opacity-55 truncate cursor-pointer"
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

            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="bench-ecu-unit"
                  className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-1"
                >
                  <Cpu className="w-2.5 h-2.5 text-amber-400" />
                  <span>ECU Module</span>
                </label>
                {activeProfile && onOpenEcuPinouts && (
                  <button
                    type="button"
                    onClick={onOpenEcuPinouts}
                    className="text-[9px] text-amber-300 hover:text-amber-200 flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>OEM Pinouts</span>
                    <ExternalLink className="w-2.5 h-2.5" />
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
                className="bg-[#12151b] border border-[#323946] rounded-[2px] px-1.5 py-1 text-[10.5px] text-amber-300 focus:outline-none focus:border-amber-400 disabled:opacity-60 truncate cursor-pointer"
              >
                <option value={UNIVERSAL_BRAND_KEY}>
                  Universal 16-Pin Trainer (KL30 / KL15 / TPS / CAN)
                </option>
                {availableEcuProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.modelName}
                  </option>
                ))}
              </select>
            </div>

            {selectedBrandKey !== UNIVERSAL_BRAND_KEY && (
              <div
                className={`rounded-[2px] px-2 py-1.5 text-[9.5px] border flex flex-col gap-1 ${
                  vehicleCtx.status === 'OCR_VERIFY'
                    ? 'bg-amber-950/35 border-amber-500/50 text-amber-200'
                    : vehicleCtx.status === 'PART_METADATA_ONLY'
                    ? 'bg-[#151820] border-rose-500/45 text-slate-300'
                    : vehicleCtx.status === 'MECHANICAL_NO_ECU'
                    ? 'bg-amber-950/35 border-amber-500/50 text-amber-200'
                    : 'bg-[#101319] border-[#2c3340] text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span
                    className={`px-1.5 py-0.5 rounded-[2px] font-bold text-[8.5px] uppercase tracking-wider border ${
                      vehicleCtx.status === 'VERIFIED'
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50'
                        : vehicleCtx.status === 'OCR_VERIFY'
                        ? 'bg-amber-950/60 text-amber-300 border-amber-500/50'
                        : vehicleCtx.status === 'MECHANICAL_NO_ECU'
                        ? 'bg-amber-950/60 text-amber-300 border-amber-500/50'
                        : 'bg-rose-950/60 text-rose-300 border-rose-500/50'
                    }`}
                  >
                    {vehicleCtx.status}
                  </span>
                  {vehicleCtx.tableRef && (
                    <span className="text-[9px] text-slate-400 truncate">{vehicleCtx.tableRef}</span>
                  )}
                </div>

                <div className="text-slate-200 font-semibold leading-snug">
                  {activeProfile ? activeProfile.cavityInfo : vehicleCtx.controllerNote}
                </div>

                {vehicleCtx.gateAlert && (
                  <div className="text-[9.5px] font-sans leading-snug text-amber-200 bg-black/40 rounded-[2px] px-1.5 py-1 border border-amber-500/35">
                    {vehicleCtx.gateAlert}
                  </div>
                )}

                <div className="text-[9px] text-slate-400 truncate" title={vehicleCtx.dlcProtocol}>
                  DLC: {vehicleCtx.dlcProtocol}
                </div>

                {activeProfile && (
                  <div className="text-slate-400 truncate">
                    Key Pins:{' '}
                    {activeProfile.essentialChecklist
                      .slice(0, 3)
                      .map((item) => item.pin)
                      .join(' · ')}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. RPM / CKP Emulator Deck with Rotary Encoder Dial */}
          <div className="hw-lcd-well rounded-[2px] p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Gauge className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-200 truncate">
                  RPM / CKP Emulator
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0" title={soundTooltip}>
                <div className="flex items-end gap-0.5 h-3" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((bar) => (
                    <span
                      key={bar}
                      style={{ height: `${bar * 20}%` }}
                      className={`w-1 transition-colors ${
                        bar <= activeSoundBars
                          ? bar >= 4
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                          : 'bg-[#2a313c]'
                      }`}
                    />
                  ))}
                </div>
                <span
                  className={`text-[11px] font-bold tabular-nums ${
                    rpmEmulator.isActive ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {rpmEmulator.rpm} RPM
                </span>
              </div>
            </div>

            {/* Power Toggle + Rotary Encoder + Fine Step Buttons */}
            <div className="flex items-center justify-between gap-2 py-0.5">
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handleToggleRpmEmulator}
                  aria-pressed={rpmEmulator.isActive}
                  className={`hw-btn min-h-[34px] px-2.5 py-1 rounded-[2px] text-[10px] font-bold tracking-wider uppercase cursor-pointer flex items-center gap-1.5 ${
                    rpmEmulator.isActive ? 'hw-btn-green' : 'text-slate-300'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-1.5 h-1.5 rounded-full ${
                      rpmEmulator.isActive ? 'bg-emerald-400' : 'bg-slate-600'
                    }`}
                  />
                  <span>{rpmEmulator.isActive ? 'ACTIVE' : 'TURN ON'}</span>
                </button>
                <span className="text-[8.5px] text-slate-500 uppercase tracking-wider text-center">
                  {soundIntensityLabel}
                </span>
              </div>

              <RotaryEncoderDial
                ariaLabel="RPM Emulator Speed"
                value={rpmEmulator.rpm}
                min={600}
                max={7000}
                step={50}
                accent="green"
                size="sm"
                inlineFlankButtons={{
                  dec: { label: '-100', delta: -100 },
                  inc: { label: '+100', delta: 100 },
                }}
                onChange={handleRpmValueChange}
              />
            </div>

            {/* Quick RPM Preset Keys */}
            <div className="grid grid-cols-4 gap-1">
              {RPM_PRESETS.map((preset) => {
                const isSelectedPreset =
                  rpmEmulator.isActive && Math.abs(rpmEmulator.rpm - preset.rpm) <= 100;
                return (
                  <button
                    key={preset.rpm}
                    type="button"
                    onClick={() => handleRpmValueChange(preset.rpm)}
                    className={`hw-btn py-1 rounded-[2px] text-[9.5px] font-bold tracking-wider cursor-pointer ${
                      isSelectedPreset
                        ? 'hw-btn-green'
                        : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Tactile Actuator / Sensor Keys */}
            <div className="grid grid-cols-3 gap-1 pt-1 border-t border-[#222833]">
              <button
                type="button"
                onClick={handleToggleInjector}
                aria-pressed={isInjectorActive}
                className={`hw-btn px-1.5 py-1.5 rounded-[2px] text-[9.5px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                  isInjectorActive ? 'hw-btn-green' : 'text-slate-400'
                }`}
              >
                <Zap className="w-3 h-3 shrink-0" />
                <span className="truncate">INJ1 {isInjectorActive ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleRelay}
                aria-pressed={isRelayActive}
                className={`hw-btn px-1.5 py-1.5 rounded-[2px] text-[9.5px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                  isRelayActive ? 'hw-btn-amber' : 'text-slate-400'
                }`}
              >
                <Radio className="w-3 h-3 shrink-0" />
                <span className="truncate">MREL {isRelayActive ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleTpsStep}
                aria-pressed={isTpsBoosted}
                className={`hw-btn px-1.5 py-1.5 rounded-[2px] text-[9.5px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                  isTpsBoosted ? 'hw-btn-amber' : 'text-slate-300'
                }`}
              >
                <span className="truncate">TPS {tpsPercent}%</span>
              </button>
            </div>

            {/* CKP Dropout & CMP Cam Phase Rotary Control */}
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#222833]">
              <div className="flex flex-col gap-1 min-w-0">
                <button
                  type="button"
                  onClick={() =>
                    onChangeRpmEmulator((prev) => ({
                      ...prev,
                      isActive: true,
                      ckpSignalLost: !prev.ckpSignalLost,
                    }))
                  }
                  aria-pressed={Boolean(rpmEmulator.ckpSignalLost)}
                  title="Simulate Crankshaft 60-2 VR sensor signal dropout (triggers P0335)"
                  className={`hw-btn px-2 py-1 rounded-[2px] text-[9px] font-bold uppercase tracking-wider cursor-pointer ${
                    rpmEmulator.ckpSignalLost
                      ? 'bg-rose-950/75 border-rose-500 text-rose-300'
                      : 'text-slate-300'
                  }`}
                >
                  {rpmEmulator.ckpSignalLost ? 'CKP: LOST (P0335)' : 'CKP: 60-2 OK'}
                </button>
                <div className="flex items-center gap-1.5 text-[9px] text-slate-400">
                  <span>CMP Phase:</span>
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
                      onClick={() => handleCamPhaseChange(0)}
                      className="hw-btn px-1 py-0.5 rounded-[2px] text-[8.5px] text-slate-300 cursor-pointer"
                    >
                      0°
                    </button>
                  )}
                </div>
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
                onChange={handleCamPhaseChange}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
