/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useEffect, useMemo } from 'react';
import { Power, Zap, AlertCircle, ShieldAlert, ClipboardList, Unlock, ShieldCheck } from 'lucide-react';
import { PowerSupplyState } from '../types/ecu';
import { recordRenderCycle } from '../utils/perfMonitor';
import { canEnergizeWithPreBenchGate } from '../utils/diagnosticWorkflow';
import type { PinoutSafetyEvaluation } from '../utils/automotiveSafetyGuard';
import { RackCornerScrews, RotaryEncoderDial } from './HardwareControls';
import { playAutomotiveRelayClunk, playRotaryEncoderTick } from '../utils/audioFeedback';

interface BenchPowerSupplyProps {
  powerSupply: PowerSupplyState;
  onChange: (updated: PowerSupplyState) => void;
  actualCurrentAmps: number;
  isTripped: boolean;
  actualOutputVoltage?: number;
  preBenchGateLocked?: boolean;
  preBenchGateBypassed?: boolean;
  workflowCheckedIds?: string[];
  onBypassPreBenchGate?: () => void;
  onOpenWorkflowPanel?: () => void;
  pinoutSafetyEvaluation?: PinoutSafetyEvaluation;
  selectedVehicleStatus?: string;
  onConfirmOcrVehicleBench?: () => void;
}

export const BenchPowerSupply: React.FC<BenchPowerSupplyProps> = React.memo(({
  powerSupply,
  onChange,
  actualCurrentAmps,
  isTripped,
  actualOutputVoltage,
  preBenchGateLocked = false,
  preBenchGateBypassed = false,
  workflowCheckedIds = [],
  onBypassPreBenchGate,
  onOpenWorkflowPanel,
  pinoutSafetyEvaluation,
  selectedVehicleStatus,
  onConfirmOcrVehicleBench,
}) => {
  useEffect(() => {
    recordRenderCycle('BenchPowerSupply');
  });

  const gateStatus = useMemo(
    () =>
      canEnergizeWithPreBenchGate({
        preBenchGateLocked,
        preBenchGateBypassed,
        checkedWorkflowIds: workflowCheckedIds,
      }),
    [preBenchGateLocked, preBenchGateBypassed, workflowCheckedIds]
  );

  const isInterlocked = preBenchGateLocked && !gateStatus.allowed;
  const canEnergizeVirtual = pinoutSafetyEvaluation
    ? pinoutSafetyEvaluation.canEnergizeSimulatedBench ??
      pinoutSafetyEvaluation.canEnergizePhysicalBench
    : true;
  const isPinoutSafetyBlocked = Boolean(pinoutSafetyEvaluation && !canEnergizeVirtual);
  const isSimulationOnlyTrainer =
    pinoutSafetyEvaluation?.provenanceStatus === 'SIMULATION_ONLY';
  const isEnergizeBlocked = isInterlocked || isPinoutSafetyBlocked;

  const handleVoltageChange = (val: number) => {
    const clamped = Math.max(0, Math.min(28.0, parseFloat(val.toFixed(2))));
    onChange({
      ...powerSupply,
      voltageSetting: clamped,
      preset: 'CUSTOM',
    });
  };

  const handleCurrentLimitChange = (val: number) => {
    const clamped = Math.max(0.2, Math.min(10.0, parseFloat(val.toFixed(2))));
    onChange({
      ...powerSupply,
      currentLimit: clamped,
    });
  };

  const setPreset = (preset: PowerSupplyState['preset'], volts: number, current: number = 3.0) => {
    playRotaryEncoderTick();
    onChange({
      ...powerSupply,
      preset,
      voltageSetting: volts,
      currentLimit: current,
    });
  };

  const effectiveVolts = powerSupply.isOutputEnabled
    ? actualOutputVoltage ?? powerSupply.voltageSetting
    : 0;
  const powerWatts = powerSupply.isOutputEnabled ? effectiveVolts * actualCurrentAmps : 0;

  return (
    <div className="relative hud-panel text-[#eaf3ff] rounded-xl p-3 flex flex-col gap-3 shrink-0 overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#19c8f5]/40 to-transparent"
      />
      <RackCornerScrews />

      {/* Rack Module Header */}
      <div className="hud-panel-header flex items-center justify-between gap-2 pb-2 px-2">
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="w-4 h-4 text-[#19c8f5] shrink-0" />
          <span className="text-[11px] sm:text-xs font-hud font-bold tracking-wider text-[#eaf3ff] uppercase truncate">
            Bench DC Power Supply Module
          </span>
          <span className="text-[9.5px] font-mono text-[#91a4bd] hidden sm:inline shrink-0">
            SIM 0-30V / 10A
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isTripped && (
            <span className="flex items-center gap-1 text-[9.5px] font-mono font-bold text-[#ff8594] bg-[#2a1019] border border-[#ff4d62]/70 px-1.5 py-0.5 rounded-md">
              <AlertCircle className="w-3 h-3" /> C.C. TRIP
            </span>
          )}
          <span
            className={`text-[9.5px] font-mono font-bold px-2 py-0.5 rounded-lg border flex items-center gap-1.5 ${
              powerSupply.isOutputEnabled
                ? 'bg-[#0b261c] border-[#20d889]/65 text-[#20d889]'
                : 'bg-[#0a1220] border-[#203653] text-[#91a4bd]'
            }`}
          >
            <span
              aria-hidden="true"
              className={`w-1.5 h-1.5 rounded-full ${
                powerSupply.isOutputEnabled ? 'bg-[#20d889]' : 'bg-[#607694]'
              }`}
            />
            <span className="sm:hidden">
              {powerSupply.isOutputEnabled ? 'OUT: ON' : 'STANDBY'}
            </span>
            <span className="hidden sm:inline">
              {powerSupply.isOutputEnabled ? 'OUTPUT: ACTIVE' : 'STANDBY'}
            </span>
          </span>
        </div>
      </div>

      {powerSupply.voltageSetting > 15.5 && (
        <div className="rounded-lg border border-[#ff4d62]/70 bg-[#2a1019]/80 px-2.5 py-1.5 text-[10px] font-mono text-[#ffc2cb] flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-[#ff4d62] shrink-0" />
          <span>
            HIGH-RAIL WARNING ({powerSupply.voltageSetting.toFixed(1)}V): Simulated bench model. Verify 12V vs 24V ECU rating before energizing physical hardware.
          </span>
        </div>
      )}

      {/* Recessed Multi-Channel LCD Readout + Guarded Main Output Switch */}
      <div className="grid grid-cols-12 gap-2 items-stretch">
        <div className="col-span-8 sm:col-span-9 hw-lcd-well rounded-xl p-2.5 grid grid-cols-3 gap-2">
          {/* Voltage Channel (Safety Amber) */}
          <div className="flex flex-col justify-between min-w-0 border-r border-[#203653]/80 pr-1.5">
            <span className="text-[8.5px] font-mono text-[#91a4bd] uppercase tracking-wider truncate">
              Voltage Out
            </span>
            <div
              className={`text-base xs:text-lg sm:text-xl font-mono font-bold tabular-nums leading-tight my-0.5 ${
                isTripped && powerSupply.isOutputEnabled
                  ? 'text-[#ff4d62]'
                  : powerSupply.isOutputEnabled
                  ? 'text-[#ffb020]'
                  : 'text-[#607694]'
              }`}
            >
              {powerSupply.isOutputEnabled ? effectiveVolts.toFixed(2) : '0.00'}
              <span className="text-[10px] sm:text-[11px] ml-0.5 font-semibold">V</span>
            </div>
            <span className="text-[9px] font-mono text-[#7c93b2] tabular-nums truncate">
              Set: {powerSupply.voltageSetting.toFixed(1)}V
            </span>
          </div>

          {/* Current Channel */}
          <div className="flex flex-col justify-between min-w-0 border-r border-[#203653]/80 pr-1.5">
            <span className="text-[8.5px] font-mono text-[#91a4bd] uppercase tracking-wider truncate">
              Current Draw
            </span>
            <div className="text-base xs:text-lg sm:text-xl font-mono font-bold text-[#eaf3ff] tabular-nums leading-tight my-0.5">
              {powerSupply.isOutputEnabled ? actualCurrentAmps.toFixed(3) : '0.000'}
              <span className="text-[10px] sm:text-[11px] ml-0.5 font-semibold text-[#91a4bd]">A</span>
            </div>
            <span className="text-[9px] font-mono text-[#7c93b2] tabular-nums truncate">
              Lim: {powerSupply.currentLimit.toFixed(1)}A
            </span>
          </div>

          {/* Power Channel (Phosphor Green) */}
          <div className="flex flex-col justify-between min-w-0">
            <span className="text-[8.5px] font-mono text-[#91a4bd] uppercase tracking-wider truncate">
              Power
            </span>
            <div
              className={`text-base xs:text-lg sm:text-xl font-mono font-bold tabular-nums leading-tight my-0.5 ${
                powerSupply.isOutputEnabled ? 'text-[#20d889]' : 'text-[#607694]'
              }`}
            >
              {powerWatts.toFixed(2)}
              <span className="text-[10px] sm:text-[11px] ml-0.5 font-semibold">W</span>
            </div>
            <span className="text-[9px] font-mono text-[#7c93b2] truncate">
              {powerSupply.isOutputEnabled ? (isTripped ? 'MODE C.C.' : 'MODE C.V.') : 'OFF'}
            </span>
          </div>
        </div>

        {/* Guarded Recessed Output Push-Button */}
        <div className="col-span-4 sm:col-span-3 hw-lcd-well rounded-xl p-1.5 flex flex-col items-center justify-between gap-1.5">
          <div
            aria-hidden="true"
            className={`w-full h-1.5 rounded-full ${
              powerSupply.isOutputEnabled
                ? 'bg-[#20d889] shadow-[0_0_8px_rgba(32,216,137,0.65)]'
                : isPinoutSafetyBlocked
                ? 'bg-[#ff4d62]'
                : isInterlocked
                ? 'bg-[#ffb020]'
                : 'bg-[#203653]'
            }`}
          />
          <button
            type="button"
            disabled={!powerSupply.isOutputEnabled && isEnergizeBlocked}
            onClick={() => {
              if (!powerSupply.isOutputEnabled && isEnergizeBlocked) return;
              const nextEnabled = !powerSupply.isOutputEnabled;
              playAutomotiveRelayClunk(nextEnabled);
              onChange({ ...powerSupply, isOutputEnabled: nextEnabled });
            }}
            aria-label={
              powerSupply.isOutputEnabled
                ? 'Deactivate Power Output'
                : isPinoutSafetyBlocked
                ? 'Energizing blocked: unverified pinout'
                : isInterlocked
                ? 'Interlocked: complete pre-bench workflow'
                : 'Enable Power Supply Output'
            }
            title={
              powerSupply.isOutputEnabled
                ? 'DEACTIVATE POWER OUTPUT'
                : isPinoutSafetyBlocked
                ? 'ENERGIZING BLOCKED: UNVERIFIED PINOUT'
                : isInterlocked
                ? 'INTERLOCKED: COMPLETE PRE-BENCH WORKFLOW'
                : 'ENABLE POWER SUPPLY (OUTPUT ON)'
            }
            className={`hw-btn w-full flex-1 min-h-[44px] rounded-lg flex flex-col items-center justify-center gap-0.5 font-mono text-[9px] font-bold uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed transition-all active:scale-[0.98] ${
              powerSupply.isOutputEnabled
                ? 'hw-btn-green animate-bus-energized'
                : isPinoutSafetyBlocked
                ? 'border-[#ff4d62]/70 bg-[#2a1019]/75 text-[#ff8594] opacity-90'
                : isInterlocked
                ? 'border-[#ffb020]/60 bg-[#2a1c0a]/75 text-[#ffb020] opacity-90'
                : 'text-[#d4e3f6]'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>{powerSupply.isOutputEnabled ? 'OUT ON' : isEnergizeBlocked ? 'LOCKED' : 'OUT OFF'}</span>
          </button>
        </div>
      </div>

      {/* Rotary Encoder Precision Controls */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="hw-lcd-well p-2.5 rounded-xl">
          <RotaryEncoderDial
            label="VOLTAGE ADJUST"
            value={powerSupply.voltageSetting}
            min={0}
            max={28}
            step={0.1}
            unit="V"
            accent="amber"
            formatValue={(v) => `${v.toFixed(1)} V`}
            onChange={handleVoltageChange}
            stepButtons={[
              { label: '-1.0', delta: -1.0 },
              { label: '-0.1', delta: -0.1 },
              { label: '+0.1', delta: 0.1 },
              { label: '+1.0', delta: 1.0 },
            ]}
          />
        </div>

        <div className="hw-lcd-well p-2.5 rounded-xl">
          <RotaryEncoderDial
            label="CURRENT LIMIT"
            value={powerSupply.currentLimit}
            min={0.2}
            max={10.0}
            step={0.1}
            unit="A"
            accent="steel"
            formatValue={(v) => `${v.toFixed(1)} A`}
            onChange={handleCurrentLimitChange}
            stepButtons={[
              { label: '-0.5', delta: -0.5 },
              { label: '-0.1', delta: -0.1 },
              { label: '+0.1', delta: 0.1 },
              { label: '+0.5', delta: 0.5 },
            ]}
          />
        </div>
      </div>

      {/* Automotive Bench Preset Push-Buttons */}
      <div className="flex flex-col gap-1">
        <span className="text-[9.5px] font-mono text-[#91a4bd] uppercase tracking-wider">
          Automotive Bench Presets
        </span>
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => setPreset('12V_BENCH', 12.6, 4.0)}
            className={`hw-btn px-1.5 py-1.5 text-[10px] font-mono font-bold rounded-md cursor-pointer ${
              powerSupply.preset === '12V_BENCH' ? 'hw-btn-blue' : 'text-slate-300 hover:text-white'
            }`}
          >
            12.6V BAT
          </button>
          <button
            type="button"
            onClick={() => setPreset('14.4V_RUNNING', 14.4, 5.0)}
            className={`hw-btn px-1.5 py-1.5 text-[10px] font-mono font-bold rounded-md cursor-pointer ${
              powerSupply.preset === '14.4V_RUNNING' ? 'hw-btn-blue' : 'text-slate-300 hover:text-white'
            }`}
          >
            14.4V CHG
          </button>
          <button
            type="button"
            onClick={() => setPreset('10.2V_CRANKING', 10.2, 8.0)}
            className={`hw-btn px-1.5 py-1.5 text-[10px] font-mono font-bold rounded-md cursor-pointer ${
              powerSupply.preset === '10.2V_CRANKING' ? 'hw-btn-blue' : 'text-slate-300 hover:text-white'
            }`}
          >
            10.2V CRK
          </button>
          <button
            type="button"
            onClick={() => setPreset('5V_LOGIC', 5.0, 2.0)}
            className={`hw-btn px-1.5 py-1.5 text-[10px] font-mono font-bold rounded-md cursor-pointer ${
              powerSupply.preset === '5V_LOGIC' ? 'hw-btn-blue' : 'text-slate-300 hover:text-white'
            }`}
          >
            5.0V LOG
          </button>
        </div>
      </div>

      {/* Simulation-Only Provenance Notice (Universal Trainer) */}
      {isSimulationOnlyTrainer && !isPinoutSafetyBlocked && (
        <div
          role="note"
          data-testid="psu-simulation-only-provenance-banner"
          className="rounded-md border border-cyan-500/40 bg-cyan-950/25 px-2.5 py-1.5 text-[10px] font-mono text-cyan-200 flex items-center justify-between gap-2"
        >
          <span>
            <strong>PROVENANCE: SIMULATION_ONLY</strong> · Virtual 16-pin trainer active (Physical Bench Voltage: NOT AUTHORIZED).
          </span>
        </div>
      )}

      {/* Automotive Pinout / Provenance Safety Block Banner */}
      {isPinoutSafetyBlocked && pinoutSafetyEvaluation && (
        <div
          role="alert"
          data-testid="psu-pinout-safety-block-banner"
          className="rounded-md border border-rose-500/70 bg-rose-950/45 p-2.5 flex flex-col gap-2 text-[11px]"
        >
          <div className="flex items-start gap-2 text-rose-200">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="font-mono font-bold uppercase tracking-wide text-rose-300">
                ECU Energizing Blocked ({pinoutSafetyEvaluation.riskLevel})
              </div>
              <p className="text-[10.5px] text-rose-100/90 mt-0.5 leading-snug">
                {pinoutSafetyEvaluation.warnings[0] ||
                  'Verified OEM pinout, exact ECU part number, and connector orientation are required before energizing.'}
              </p>
            </div>
          </div>
          {selectedVehicleStatus === 'OCR_VERIFY' && onConfirmOcrVehicleBench && (
            <button
              type="button"
              data-testid="confirm-ocr-ecu-safety-btn"
              onClick={onConfirmOcrVehicleBench}
              className="hw-btn hw-btn-green self-start inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-mono text-[10px] font-bold cursor-pointer"
            >
              <ShieldCheck className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span>Confirm ECU Part # &amp; Connector Orientation</span>
            </button>
          )}
        </div>
      )}

      {/* Pre-Bench Safety Gate Interlock Banner */}
      {isInterlocked && (
        <div
          role="status"
          data-testid="psu-safety-interlock-banner"
          className="rounded-md border border-amber-500/60 bg-amber-950/35 p-2.5 flex flex-col gap-2 text-[11px]"
        >
          <div className="flex items-start gap-2 text-amber-200">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="font-mono font-bold uppercase tracking-wide text-amber-300">
                Pre-Bench Safety Interlock ({gateStatus.mandatoryChecked}/{gateStatus.mandatoryTotal} Ready)
              </div>
              <p className="text-[10.5px] text-amber-100/90 mt-0.5 leading-snug">
                Pending: {gateStatus.pendingTitles.slice(0, 2).join(', ')}
                {gateStatus.pendingTitles.length > 2
                  ? ` +${gateStatus.pendingTitles.length - 2} more`
                  : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {onOpenWorkflowPanel && (
              <button
                type="button"
                onClick={onOpenWorkflowPanel}
                className="hw-btn inline-flex items-center gap-1 px-2.5 py-1 rounded-md border-amber-500/50 text-amber-200 font-mono text-[10px] font-semibold cursor-pointer"
              >
                <ClipboardList className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>Open Workflow</span>
              </button>
            )}
            {onBypassPreBenchGate && (
              <button
                type="button"
                data-testid="bypass-pre-bench-gate-btn"
                disabled={isPinoutSafetyBlocked}
                onClick={() => {
                  if (isPinoutSafetyBlocked) return;
                  onBypassPreBenchGate();
                  onChange({ ...powerSupply, isOutputEnabled: true });
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-mono text-[10px] font-bold transition cursor-pointer"
              >
                <Unlock className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>Bypass Gate &amp; Energize</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
