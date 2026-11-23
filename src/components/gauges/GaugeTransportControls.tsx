import React from 'react';
import { Pause, Play, RotateCcw, Square } from 'lucide-react';
import type { GaugeTransportMode } from '../../simulation/telemetry/telemetryTypes';

export interface GaugeTransportControlsProps {
  transportMode: GaugeTransportMode;
  isPowerOn: boolean;
  isSafetyLocked: boolean;
  safetyLockReason?: string;
  showPeakHold: boolean;
  onStartLive: () => void;
  onPause: () => void;
  onStop: () => void;
  onResetPeaks: () => void;
  onToggleShowPeaks: () => void;
}

export const GaugeTransportControls: React.FC<GaugeTransportControlsProps> = ({
  transportMode,
  isPowerOn,
  isSafetyLocked,
  safetyLockReason,
  showPeakHold,
  onStartLive,
  onPause,
  onStop,
  onResetPeaks,
  onToggleShowPeaks,
}) => {
  const canStart = isPowerOn && !isSafetyLocked;
  const startBlockedMsg = !isPowerOn
    ? 'Enable Bench Power Supply below to stream live gauges.'
    : isSafetyLocked
    ? safetyLockReason || 'Safety interlock active — complete checklist or verify ECU housing.'
    : null;

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-[#203653]/80 font-mono">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onStartLive}
          disabled={!canStart}
          title={startBlockedMsg || 'Start 10 Hz synchronized live gauge monitoring'}
          className={`min-h-[38px] px-3 py-1.5 rounded-lg text-[10.5px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
            transportMode === 'LIVE' && canStart
              ? 'hw-btn hw-btn-green'
              : 'diag-cta-blue'
          }`}
        >
          <Play className="w-3.5 h-3.5 shrink-0" />
          <span>Start live view</span>
        </button>

        <button
          type="button"
          onClick={onPause}
          disabled={transportMode !== 'LIVE'}
          className={`hw-btn min-h-[38px] px-2.5 py-1.5 rounded-lg text-[10.5px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            transportMode === 'PAUSED' ? 'hw-btn-amber' : 'text-[#eaf3ff]'
          }`}
        >
          <Pause className="w-3.5 h-3.5 shrink-0" />
          <span>Pause</span>
        </button>

        <button
          type="button"
          onClick={onStop}
          disabled={transportMode === 'STOPPED'}
          className="hw-btn min-h-[38px] px-2.5 py-1.5 rounded-lg text-[10.5px] font-bold flex items-center gap-1 text-[#eaf3ff] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Square className="w-3 h-3 shrink-0" />
          <span>Stop</span>
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleShowPeaks}
            aria-pressed={showPeakHold}
            className={`hw-btn min-h-[38px] px-2.5 py-1.5 rounded-lg text-[9.5px] font-bold cursor-pointer ${
              showPeakHold ? 'hw-btn-blue' : 'text-[#91a4bd]'
            }`}
          >
            Peak
          </button>
          <button
            type="button"
            onClick={onResetPeaks}
            title="Clear all captured Peak-Hold extrema"
            className="hw-btn min-h-[38px] px-2.5 py-1.5 rounded-lg text-[9.5px] font-bold text-[#d4e3f6] hover:text-[#19c8f5] flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {startBlockedMsg && (
        <div className="text-[10px] font-sans text-[#ffb020] bg-[#1c1508] border border-[#ffb020]/45 rounded-lg px-2.5 py-1.5 leading-snug">
          {startBlockedMsg}
        </div>
      )}

      <p className="text-[9px] font-sans text-[#7c93b2] leading-tight">
        Simulated MNA &amp; Speed-Density telemetry — MAF &amp; Speed are calculated model outputs, not physical vehicle gauges.
      </p>
    </div>
  );
};
