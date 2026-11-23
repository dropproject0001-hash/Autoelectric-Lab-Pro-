import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Play,
  Sliders,
  Volume2,
  VolumeX,
  X,
  ZapOff,
} from 'lucide-react';
import {
  CircuitAnomalyKind,
  CircuitAnomalySnapshot,
} from '../simulation/diagnostics/circuitAudioMonitor';
import {
  CircuitAudioAlertToneKind,
  playCircuitAnomalyAlert,
} from '../utils/audioFeedback';

export interface CircuitAudioSettings {
  enabled: boolean;
  volume: number;
  repeatCriticalShorts: boolean;
  shortCircuitAlerts: boolean;
  voltageDropAlerts: boolean;
  abnormalBehaviorAlerts: boolean;
  recoveryChime: boolean;
}

const STORAGE_KEY = 'vecl_circuit_audio_settings_v1';

const DEFAULT_SETTINGS: CircuitAudioSettings = {
  enabled: true,
  volume: 0.85,
  repeatCriticalShorts: true,
  shortCircuitAlerts: true,
  voltageDropAlerts: true,
  abnormalBehaviorAlerts: true,
  recoveryChime: true,
};

function loadInitialSettings(): CircuitAudioSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<CircuitAudioSettings>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SETTINGS.enabled,
      volume:
        typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
          ? Math.min(1, Math.max(0.05, parsed.volume))
          : DEFAULT_SETTINGS.volume,
      repeatCriticalShorts:
        typeof parsed.repeatCriticalShorts === 'boolean'
          ? parsed.repeatCriticalShorts
          : DEFAULT_SETTINGS.repeatCriticalShorts,
      shortCircuitAlerts:
        typeof parsed.shortCircuitAlerts === 'boolean'
          ? parsed.shortCircuitAlerts
          : DEFAULT_SETTINGS.shortCircuitAlerts,
      voltageDropAlerts:
        typeof parsed.voltageDropAlerts === 'boolean'
          ? parsed.voltageDropAlerts
          : DEFAULT_SETTINGS.voltageDropAlerts,
      abnormalBehaviorAlerts:
        typeof parsed.abnormalBehaviorAlerts === 'boolean'
          ? parsed.abnormalBehaviorAlerts
          : DEFAULT_SETTINGS.abnormalBehaviorAlerts,
      recoveryChime:
        typeof parsed.recoveryChime === 'boolean'
          ? parsed.recoveryChime
          : DEFAULT_SETTINGS.recoveryChime,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface CircuitAudioAlertBarProps {
  snapshot: CircuitAnomalySnapshot;
  isSettingsPanelOpen: boolean;
  onToggleSettingsPanel: () => void;
}

export const CircuitAudioAlertBar: React.FC<CircuitAudioAlertBarProps> = ({
  snapshot,
  isSettingsPanelOpen,
  onToggleSettingsPanel,
}) => {
  const [settings, setSettings] = useState<CircuitAudioSettings>(() => loadInitialSettings());
  const [acknowledgedSignature, setAcknowledgedSignature] = useState<string>('');
  const [isDetailsExpanded, setIsDetailsExpanded] = useState<boolean>(false);

  const prevSignatureRef = useRef<string>('');
  const hadActiveAnomalyRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage quota errors
    }
  }, [settings]);

  // Filter alerts based on user category toggles
  const filteredAlerts = useMemo(() => {
    return snapshot.alerts.filter((alert) => {
      if (alert.kind === 'SHORT_CIRCUIT' && !settings.shortCircuitAlerts) return false;
      if (alert.kind === 'VOLTAGE_DROP' && !settings.voltageDropAlerts) return false;
      if (alert.kind === 'ABNORMAL_BEHAVIOR' && !settings.abnormalBehaviorAlerts) return false;
      return true;
    });
  }, [
    snapshot.alerts,
    settings.shortCircuitAlerts,
    settings.voltageDropAlerts,
    settings.abnormalBehaviorAlerts,
  ]);

  const activePrimaryKind = useMemo<'NONE' | CircuitAnomalyKind>(() => {
    if (filteredAlerts.length === 0) return 'NONE';
    if (filteredAlerts.some((a) => a.kind === 'SHORT_CIRCUIT')) return 'SHORT_CIRCUIT';
    if (filteredAlerts.some((a) => a.kind === 'VOLTAGE_DROP')) return 'VOLTAGE_DROP';
    return 'ABNORMAL_BEHAVIOR';
  }, [filteredAlerts]);

  const filteredSignature = useMemo(
    () => filteredAlerts.map((a) => `${a.id}:${a.severity}`).join('|'),
    [filteredAlerts]
  );

  // Trigger acoustic alert when circuit anomaly signature changes
  useEffect(() => {
    if (!filteredSignature) {
      if (hadActiveAnomalyRef.current && settings.enabled && settings.recoveryChime) {
        playCircuitAnomalyAlert('NOMINAL_RECOVERY', settings.volume);
      }
      hadActiveAnomalyRef.current = false;
      prevSignatureRef.current = '';
      setAcknowledgedSignature('');
      return;
    }

    if (filteredSignature !== prevSignatureRef.current) {
      prevSignatureRef.current = filteredSignature;
      hadActiveAnomalyRef.current = true;
      setAcknowledgedSignature('');

      if (settings.enabled && activePrimaryKind !== 'NONE') {
        playCircuitAnomalyAlert(activePrimaryKind, settings.volume);
      }
    }
  }, [
    filteredSignature,
    activePrimaryKind,
    settings.enabled,
    settings.volume,
    settings.recoveryChime,
  ]);

  // Optional periodic acoustic reminder (every 4.5s) while an unacknowledged SHORT_CIRCUIT is active
  useEffect(() => {
    if (
      !settings.enabled ||
      !settings.repeatCriticalShorts ||
      activePrimaryKind !== 'SHORT_CIRCUIT' ||
      !filteredSignature ||
      acknowledgedSignature === filteredSignature
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      playCircuitAnomalyAlert('SHORT_CIRCUIT', settings.volume);
    }, 4500);

    return () => window.clearInterval(timer);
  }, [
    settings.enabled,
    settings.repeatCriticalShorts,
    settings.volume,
    activePrimaryKind,
    filteredSignature,
    acknowledgedSignature,
  ]);

  const isBannerVisible =
    (filteredAlerts.length > 0 && acknowledgedSignature !== filteredSignature) ||
    isSettingsPanelOpen;

  if (!isBannerVisible) return null;

  const isCritical = filteredAlerts.some((a) => a.severity === 'CRITICAL');
  const shortCount = filteredAlerts.filter((a) => a.kind === 'SHORT_CIRCUIT').length;
  const vdropCount = filteredAlerts.filter((a) => a.kind === 'VOLTAGE_DROP').length;
  const abnormalCount = filteredAlerts.filter((a) => a.kind === 'ABNORMAL_BEHAVIOR').length;

  const handleAuditionTone = (tone: CircuitAudioAlertToneKind) => {
    playCircuitAnomalyAlert(tone, settings.volume);
  };

  return (
    <div
      role="region"
      aria-label="Circuit acoustic anomaly monitor"
      className={`w-full shrink-0 border-b px-3 py-2 font-mono text-xs transition-colors ${
        filteredAlerts.length === 0
          ? 'bg-[#0A1220] border-[#203653] text-[#EAF3FF]'
          : isCritical
            ? 'bg-[#FF4D62]/15 border-[#FF4D62]/65 text-rose-100'
            : 'bg-[#FFB020]/15 border-[#FFB020]/60 text-amber-100'
      }`}
    >
      {/* Top Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-7 h-7 rounded-[2px] flex items-center justify-center shrink-0 border ${
              filteredAlerts.length === 0
                ? 'bg-emerald-950/60 border-emerald-600/60 text-emerald-400'
                : isCritical
                  ? 'bg-rose-900/80 border-rose-400 text-rose-200 animate-pulse'
                  : 'bg-amber-900/70 border-amber-400 text-amber-200'
            }`}
          >
            {filteredAlerts.length === 0 ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : activePrimaryKind === 'SHORT_CIRCUIT' ? (
              <AlertOctagon className="w-4 h-4" />
            ) : activePrimaryKind === 'VOLTAGE_DROP' ? (
              <ZapOff className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold uppercase tracking-wider text-[11px]">
                {filteredAlerts.length === 0
                  ? 'Circuit Acoustic Monitor — Nominal'
                  : activePrimaryKind === 'SHORT_CIRCUIT'
                    ? 'SHORT CIRCUIT / OCP AUDIO ALARM ACTIVE'
                    : activePrimaryKind === 'VOLTAGE_DROP'
                      ? 'VOLTAGE DROP / RAIL SAG AUDIO ALERT'
                      : 'ABNORMAL CIRCUIT BEHAVIOR ALERT'}
              </span>

              {shortCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-[2px] bg-rose-800/80 border border-rose-400/70 text-[10px] font-bold text-white">
                  {shortCount} SHORT{shortCount > 1 ? 'S' : ''}
                </span>
              )}
              {vdropCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-[2px] bg-amber-800/80 border border-amber-400/70 text-[10px] font-bold text-amber-100">
                  {vdropCount} V-DROP{vdropCount > 1 ? 'S' : ''}
                </span>
              )}
              {abnormalCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-[2px] bg-sky-900/80 border border-sky-400/70 text-[10px] font-bold text-sky-100">
                  {abnormalCount} ABNORMAL
                </span>
              )}
            </div>

            {filteredAlerts[0] ? (
              <p className="text-[11px] opacity-90 truncate font-sans mt-0.5">
                <strong>{filteredAlerts[0].pinOrNodeLabel}:</strong> {filteredAlerts[0].title} —{' '}
                {filteredAlerts[0].detail}
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                Real-time MNA acoustic synthesis armed for short circuits, rail voltage sag, ground offsets, and live DMM lockouts.
              </p>
            )}
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {filteredAlerts.length > 0 && (
            <button
              type="button"
              onClick={() =>
                playCircuitAnomalyAlert(
                  activePrimaryKind === 'NONE' ? 'ABNORMAL_BEHAVIOR' : activePrimaryKind,
                  settings.volume
                )
              }
              className="hw-btn px-2 py-1 rounded-[2px] text-[10px] font-bold uppercase flex items-center gap-1 text-slate-100"
              title="Replay current acoustic alert pattern"
            >
              <Bell className="w-3 h-3" />
              <span>Replay Tone</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))}
            className={`hw-btn px-2 py-1 rounded-[2px] text-[10px] font-bold uppercase flex items-center gap-1 ${
              settings.enabled ? 'text-emerald-300 border-emerald-600/60' : 'text-slate-400'
            }`}
            title={settings.enabled ? 'Mute Circuit Audio Alerts' : 'Unmute Circuit Audio Alerts'}
          >
            {settings.enabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span>{settings.enabled ? 'AUDIO ON' : 'MUTED'}</span>
          </button>

          {filteredAlerts.length > 0 && (
            <button
              type="button"
              onClick={() => setIsDetailsExpanded((prev) => !prev)}
              className="hw-btn px-2 py-1 rounded-[2px] text-[10px] font-bold uppercase flex items-center gap-1 text-slate-200"
            >
              <span>
                {isDetailsExpanded ? 'Hide' : `Inspect (${filteredAlerts.length})`}
              </span>
              {isDetailsExpanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onToggleSettingsPanel}
            className={`hw-btn px-2 py-1 rounded-[2px] text-[10px] font-bold uppercase flex items-center gap-1 ${
              isSettingsPanelOpen ? 'border-amber-400 text-amber-300' : 'text-slate-200'
            }`}
            title="Configure Audio Alert Thresholds & Test Tones"
          >
            <Sliders className="w-3 h-3" />
            <span className="hidden sm:inline">Audio Setup</span>
          </button>

          {filteredAlerts.length > 0 && (
            <button
              type="button"
              onClick={() => setAcknowledgedSignature(filteredSignature)}
              className="hw-btn px-2 py-1 rounded-[2px] text-[10px] font-bold uppercase flex items-center gap-1 text-slate-300 hover:text-white"
              title="Silence & Acknowledge Current Alert"
            >
              <X className="w-3.5 h-3.5" />
              <span>Silence</span>
            </button>
          )}
        </div>
      </div>

      {/* Expandable Active Alert Cards */}
      {isDetailsExpanded && filteredAlerts.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-white/15 grid grid-cols-1 md:grid-cols-2 gap-2">
          {filteredAlerts.map((item) => (
            <div
              key={item.id}
              className="p-2.5 rounded-[2px] bg-black/45 border border-white/15 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[11px] uppercase tracking-wide text-white">
                  [{item.kind.replace('_', ' ')}] {item.title}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-[2px] bg-black/50 border border-white/20">
                  {item.measuredLabel} (Exp: {item.expectedLabel})
                </span>
              </div>
              <p className="text-[11px] opacity-90 font-sans">{item.detail}</p>
              <p className="text-[10px] text-emerald-300 font-sans">
                <strong>Bench Action:</strong> {item.recommendedAction}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Configurable Audio Synthesizer Settings & Tone Audition Deck */}
      {isSettingsPanelOpen && (
        <div className="mt-2.5 pt-2.5 border-t border-[#203653] bg-[#050A12]/95 p-3 rounded-xl space-y-3 text-[#EAF3FF]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#19C8F5]" />
              <span className="font-bold uppercase tracking-wider text-[11px]">
                Bench Circuit Audio Alert Synthesizer &amp; Pattern Tester
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-[#91A4BD]">Volume:</span>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={settings.volume}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, volume: Number(e.target.value) }))
                }
                className="w-24 accent-[#19C8F5] cursor-pointer"
              />
              <span className="w-9 text-right tabular-nums text-[#19C8F5]">
                {Math.round(settings.volume * 100)}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
            <label className="flex items-center gap-2 p-2 rounded-lg bg-[#0E192A] border border-[#203653] cursor-pointer">
              <input
                type="checkbox"
                checked={settings.shortCircuitAlerts}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, shortCircuitAlerts: e.target.checked }))
                }
                className="accent-rose-500"
              />
              <span>Short Circuits / OCP</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg bg-[#0E192A] border border-[#203653] cursor-pointer">
              <input
                type="checkbox"
                checked={settings.voltageDropAlerts}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, voltageDropAlerts: e.target.checked }))
                }
                className="accent-amber-500"
              />
              <span>Voltage Drop / Sag</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg bg-[#0E192A] border border-[#203653] cursor-pointer">
              <input
                type="checkbox"
                checked={settings.abnormalBehaviorAlerts}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    abnormalBehaviorAlerts: e.target.checked,
                  }))
                }
                className="accent-sky-500"
              />
              <span>Abnormal Behavior</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg bg-[#0E192A] border border-[#203653] cursor-pointer">
              <input
                type="checkbox"
                checked={settings.repeatCriticalShorts}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    repeatCriticalShorts: e.target.checked,
                  }))
                }
                className="accent-rose-500"
              />
              <span>Repeat Short Alarm</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg bg-[#0E192A] border border-[#203653] cursor-pointer">
              <input
                type="checkbox"
                checked={settings.recoveryChime}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, recoveryChime: e.target.checked }))
                }
                className="accent-emerald-500"
              />
              <span>All-Clear Recovery Chime</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-[#91A4BD] mr-1">
                Audition Alert Tones:
              </span>
              <button
                type="button"
                onClick={() => handleAuditionTone('SHORT_CIRCUIT')}
                className="hw-btn px-2.5 py-1 rounded-lg text-[10px] font-bold text-rose-300 border-rose-700/60 flex items-center gap-1"
              >
                <Play className="w-2.5 h-2.5" />
                <span>Short Circuit Alarm</span>
              </button>
              <button
                type="button"
                onClick={() => handleAuditionTone('VOLTAGE_DROP')}
                className="hw-btn px-2.5 py-1 rounded-lg text-[10px] font-bold text-[#FFB020] border-[#FFB020]/50 flex items-center gap-1"
              >
                <Play className="w-2.5 h-2.5" />
                <span>Voltage Drop Sag</span>
              </button>
              <button
                type="button"
                onClick={() => handleAuditionTone('ABNORMAL_BEHAVIOR')}
                className="hw-btn px-2.5 py-1 rounded-lg text-[10px] font-bold text-[#19C8F5] border-[#19C8F5]/50 flex items-center gap-1"
              >
                <Play className="w-2.5 h-2.5" />
                <span>Abnormal Behavior</span>
              </button>
              <button
                type="button"
                onClick={() => handleAuditionTone('NOMINAL_RECOVERY')}
                className="hw-btn px-2.5 py-1 rounded-lg text-[10px] font-bold text-[#20D889] border-[#20D889]/50 flex items-center gap-1"
              >
                <Play className="w-2.5 h-2.5" />
                <span>Nominal Recovery</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onToggleSettingsPanel}
              className="hw-btn px-2.5 py-1 rounded-lg text-[10px] text-[#91A4BD] hover:text-white"
            >
              Close Audio Setup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
