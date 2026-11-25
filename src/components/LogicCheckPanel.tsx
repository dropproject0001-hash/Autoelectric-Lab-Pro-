/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Crosshair,
  GitCompareArrows,
  PanelRightClose,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  formatFaultClassLabel,
  formatLogicStateLabel,
  type LogicCheckRule,
  type LogicCheckSnapshot,
  type LogicExpectedState,
  type LogicRuleStatus,
  type LogicWatchPreset,
} from '../simulation/ecu/LogicCheckEngine';

export interface LogicCheckIncidentEntry {
  id: string;
  timestampLabel: string;
  pinId: string;
  pinNumber: number;
  pinLabel: string;
  severity: 'CRITICAL' | 'WARNING';
  title: string;
  detail: string;
  measuredVoltage: number;
}

export interface LogicCheckPanelProps {
  snapshot: LogicCheckSnapshot;
  rules: LogicCheckRule[];
  isArmed: boolean;
  onToggleArmed: () => void;
  onToggleRuleEnabled: (pinId: string) => void;
  onUpdateRuleThresholds: (
    pinId: string,
    updates: Partial<Pick<LogicCheckRule, 'expectedState' | 'minVoltage' | 'maxVoltage' | 'shortToBatteryThresholdV'>>
  ) => void;
  onApplyPreset: (preset: LogicWatchPreset) => void;
  onResetRules: () => void;
  onSelectPin: (pinId: string) => void;
  onAttachRedProbe?: (pinId: string, label: string) => void;
  incidentLog: LogicCheckIncidentEntry[];
  onClearIncidentLog: () => void;
  onClose?: () => void;
  compactWidth?: boolean;
  isShortViewport?: boolean;
}

type ResultFilter = 'ALL' | 'ALERTS' | 'PASS';

const LOGIC_STATES: readonly LogicExpectedState[] = [
  'HIGH_12V',
  'HIGH_5V',
  'LOW_GND',
  'ANALOG_RANGE',
  'CAN_BUS',
  'PWM_ACTUATOR',
];

const WATCH_PRESET_BUTTONS: ReadonlyArray<{ id: LogicWatchPreset; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'POWER_GND', label: 'Pwr/Gnd' },
  { id: 'REF_SENSORS', label: '5V/Sens' },
  { id: 'BUS_DRIVERS', label: 'CAN/Drv' },
];

function renderStatusLabel(status: LogicRuleStatus, label: string) {
  switch (status) {
    case 'CRITICAL':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-rose-300">
          <ShieldAlert className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'WARNING':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-amber-300">
          <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'PASS':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-emerald-400">
          <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>PASS</span>
        </span>
      );
    case 'MUTED':
      return (
        <span className="text-[10px] font-mono text-slate-500">
          Muted
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400">
          <Activity className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>Standby</span>
        </span>
      );
  }
}

export const LogicCheckPanel: React.FC<LogicCheckPanelProps> = ({
  snapshot,
  rules,
  isArmed,
  onToggleArmed,
  onToggleRuleEnabled,
  onUpdateRuleThresholds,
  onApplyPreset,
  onResetRules,
  onSelectPin,
  onAttachRedProbe,
  incidentLog,
  onClearIncidentLog,
  onClose,
  compactWidth = false,
  isShortViewport = false,
}) => {
  const [filter, setFilter] = useState<ResultFilter>('ALL');
  const [expandedPinId, setExpandedPinId] = useState<string | null>(null);
  const [showAllPinsConfig, setShowAllPinsConfig] = useState(false);

  const visibleResults = useMemo(() => {
    const base = showAllPinsConfig
      ? snapshot.results
      : snapshot.results.filter((r) => r.status !== 'MUTED');

    if (filter === 'ALERTS') {
      return base.filter((r) => r.status === 'CRITICAL' || r.status === 'WARNING');
    }
    if (filter === 'PASS') {
      return base.filter((r) => r.status === 'PASS');
    }
    return base;
  }, [snapshot.results, filter, showAllPinsConfig]);

  const alertCount = snapshot.criticalCount + snapshot.warningCount;
  const passPct =
    snapshot.monitoredCount > 0
      ? Math.round((snapshot.passingCount / snapshot.monitoredCount) * 100)
      : 0;

  return (
    <aside
      aria-label="Automated Multi-Pin Logic Check Panel"
      data-testid="logic-check-panel"
      className={`w-full hud-panel rounded-lg ${
        isShortViewport ? 'p-2.5 gap-2' : 'p-3 sm:p-3.5 gap-3'
      } flex flex-col flex-1 min-h-0 overflow-y-auto`}
    >
      {/* Header */}
      <div className="hud-panel-header flex items-center justify-between gap-2 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${
              snapshot.overallStatus === 'CRITICAL'
                ? 'bg-[#FF4D62]/15 border-[#FF4D62]/55'
                : snapshot.overallStatus === 'WARNING'
                ? 'bg-[#FFB020]/15 border-[#FFB020]/55'
                : 'bg-[#0E192A] border-[#19C8F5]/45'
            }`}
          >
            {snapshot.overallStatus === 'CRITICAL' ? (
              <ShieldAlert className="w-3.5 h-3.5 text-[#FF4D62]" aria-hidden="true" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-[#19C8F5]" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="font-hud text-sm font-bold uppercase tracking-wider text-[#EAF3FF] truncate">
              Logic Check
            </h2>
            <p className="text-[10px] font-mono tabular-nums text-[#91A4BD] truncate">
              {snapshot.monitoredCount} Pins Watched · {snapshot.passingCount} Pass · {alertCount} Alert
              {alertCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onResetRules}
            title="Reset all Logic Check rules to OEM bench defaults"
            aria-label="Reset Logic Check rules"
            className="hw-btn p-1.5 rounded-md text-slate-400 hover:text-slate-100 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="hw-btn p-1.5 rounded-md text-slate-400 hover:text-slate-100 transition cursor-pointer"
              title="Collapse Logic Check panel"
              aria-label="Collapse Logic Check panel"
            >
              <PanelRightClose className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* System Status & Arming Bar */}
      <div className="hw-lcd-well rounded-md p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span
            className={`inline-flex items-center gap-1.5 font-semibold ${
              snapshot.overallStatus === 'CRITICAL'
                ? 'text-rose-300'
                : snapshot.overallStatus === 'WARNING'
                ? 'text-amber-300'
                : snapshot.overallStatus === 'PASS'
                ? 'text-emerald-400'
                : 'text-slate-400'
            }`}
          >
            {snapshot.overallStatus === 'CRITICAL' ? (
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : snapshot.overallStatus === 'WARNING' ? (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>
              {snapshot.overallStatus === 'CRITICAL'
                ? `${snapshot.criticalCount} Critical Fault${snapshot.criticalCount === 1 ? '' : 's'}`
                : snapshot.overallStatus === 'WARNING'
                ? `${snapshot.warningCount} Threshold Warning${snapshot.warningCount === 1 ? '' : 's'}`
                : snapshot.overallStatus === 'PASS'
                ? 'All Monitored Logic Valid'
                : 'PSU Standby (Armed)'}
            </span>
          </span>

          <button
            type="button"
            role="switch"
            aria-checked={isArmed}
            data-testid="logic-check-arm-toggle"
            onClick={onToggleArmed}
            className={`hw-btn inline-flex items-center gap-1 rounded-[2px] px-2 py-0.5 text-[10px] font-mono font-semibold transition whitespace-nowrap cursor-pointer ${
              isArmed
                ? 'hw-btn-amber'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle automatic bench alert banner and warning tone on fault triggers"
          >
            {isArmed ? (
              <Bell className="w-3 h-3 shrink-0" aria-hidden="true" />
            ) : (
              <BellOff className="w-3 h-3 shrink-0" aria-hidden="true" />
            )}
            <span>{isArmed ? 'Alerts Armed' : 'Alerts Muted'}</span>
          </button>
        </div>

        <div
          role="progressbar"
          aria-valuenow={passPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Multi-pin logic pass ratio"
          className="h-1.5 w-full overflow-hidden rounded-[1px] bg-[#1a2029]"
        >
          <div
            className={`h-full transition-all duration-200 ${
              snapshot.overallStatus === 'CRITICAL'
                ? 'bg-rose-400'
                : snapshot.overallStatus === 'WARNING'
                ? 'bg-amber-400'
                : snapshot.overallStatus === 'PASS'
                ? 'bg-emerald-400'
                : 'bg-slate-500'
            }`}
            style={{ width: `${snapshot.overallStatus === 'STANDBY' ? 100 : Math.max(8, passPct)}%` }}
          />
        </div>

        {/* Preset Watch Groups */}
        <div className="flex items-center justify-between gap-1 pt-0.5">
          <div className="grid grid-cols-4 gap-1 flex-1">
            {WATCH_PRESET_BUTTONS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onApplyPreset(preset.id)}
                className="hw-btn rounded-[2px] hover:text-amber-300 px-1.5 py-1 text-[10px] font-mono text-slate-300 transition whitespace-nowrap cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowAllPinsConfig((v) => !v)}
            aria-pressed={showAllPinsConfig}
            title="Show or hide disabled pins to add/remove monitored pins"
            className={`hw-btn rounded-[2px] px-2 py-1 text-[10px] font-mono flex items-center gap-1 transition whitespace-nowrap shrink-0 cursor-pointer ${
              showAllPinsConfig
                ? 'hw-btn-amber'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-3 h-3" aria-hidden="true" />
            <span>Pins</span>
          </button>
        </div>
      </div>

      {/* Filter Segmented Control */}
      <div
        role="group"
        aria-label="Filter monitored pins"
        className="grid grid-cols-3 gap-1 rounded-xl bg-[#050A12] p-1 border border-[#203653] text-[10px] font-mono"
      >
        {(
          [
            { id: 'ALL', label: `All (${showAllPinsConfig ? rules.length : snapshot.monitoredCount})` },
            { id: 'ALERTS', label: `Alerts (${alertCount})` },
            { id: 'PASS', label: `Pass (${snapshot.passingCount})` },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            aria-pressed={filter === item.id}
            className={`py-1 px-1.5 rounded-lg transition whitespace-nowrap tabular-nums cursor-pointer ${
              filter === item.id
                ? 'diag-tab-active font-bold border'
                : 'text-[#91A4BD] hover:text-[#EAF3FF] border border-transparent'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Simultaneous Multi-Pin Monitor List */}
      <div className="flex flex-col gap-1.5">
        {visibleResults.length === 0 ? (
          <div className="hw-lcd-well rounded-xl px-3 py-4 text-center text-[11px] font-mono text-[#91A4BD]">
            {filter === 'ALERTS'
              ? 'No unexpected signals detected on monitored pins.'
              : 'No pins match the current filter.'}
          </div>
        ) : (
          visibleResults.map((item) => {
            const { rule } = item;
            const isExpanded = expandedPinId === rule.pinId;
            const span = Math.max(0.5, rule.shortToBatteryThresholdV - Math.min(0, rule.minVoltage));
            const rawPct = ((item.measuredVoltage - Math.min(0, rule.minVoltage)) / span) * 100;
            const markerPct = Math.max(2, Math.min(98, rawPct));
            const minZonePct = Math.max(0, ((rule.minVoltage - Math.min(0, rule.minVoltage)) / span) * 100);
            const maxZonePct = Math.min(100, ((rule.maxVoltage - Math.min(0, rule.minVoltage)) / span) * 100);

            return (
              <div
                key={rule.id}
                data-testid={`logic-rule-${rule.pinId}`}
                className={`rounded-xl border transition ${
                  item.status === 'CRITICAL'
                    ? 'border-[#FF4D62]/60 bg-[#FF4D62]/10'
                    : item.status === 'WARNING'
                    ? 'border-[#FFB020]/50 bg-[#FFB020]/10'
                    : item.status === 'PASS'
                    ? 'border-[#203653] bg-[#0E192A]/90 hover:border-[#19C8F5]/50'
                    : 'border-[#203653]/80 bg-[#0A1220] opacity-85'
                }`}
              >
                <div className="p-2 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectPin(rule.pinId);
                        setExpandedPinId(isExpanded ? null : rule.pinId);
                      }}
                      className="flex items-center gap-1.5 min-w-0 text-left flex-1 cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
                      )}
                      <span className="font-mono text-[10px] text-slate-400 tabular-nums shrink-0">
                        #{rule.pinNumber}
                      </span>
                      <span className="text-xs font-semibold text-slate-100 truncate">
                        {rule.pinLabel}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 truncate">
                        · {formatLogicStateLabel(rule.expectedState)}
                      </span>
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`font-mono text-xs font-bold tabular-nums ${
                          item.status === 'CRITICAL'
                            ? 'text-rose-300'
                            : item.status === 'WARNING'
                            ? 'text-amber-300'
                            : item.status === 'PASS'
                            ? 'text-emerald-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {item.measuredVoltage.toFixed(2)}V
                      </span>
                      {showAllPinsConfig && (
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => onToggleRuleEnabled(rule.pinId)}
                          aria-label={`Monitor ${rule.pinLabel}`}
                          className="h-3.5 w-3.5 accent-amber-400 cursor-pointer"
                        />
                      )}
                    </div>
                  </div>

                  {/* Valid Window Bar + Status Row */}
                  <div className="flex items-center justify-between gap-2 pl-5">
                    <div className="relative h-1.5 flex-1 rounded-[1px] bg-[#1e2430] overflow-hidden">
                      <div
                        className="absolute top-0 bottom-0 bg-emerald-500/35"
                        style={{
                          left: `${minZonePct}%`,
                          width: `${Math.max(4, maxZonePct - minZonePct)}%`,
                        }}
                      />
                      {item.status !== 'STANDBY' && item.status !== 'MUTED' && (
                        <div
                          className={`absolute top-0 bottom-0 w-1 rounded-[1px] ${
                            item.status === 'CRITICAL'
                              ? 'bg-rose-400'
                              : item.status === 'WARNING'
                              ? 'bg-amber-300'
                              : 'bg-emerald-400'
                          }`}
                          style={{ left: `calc(${markerPct}% - 2px)` }}
                        />
                      )}
                    </div>
                    <span className="text-[9.5px] font-mono text-slate-400 tabular-nums shrink-0">
                      {rule.minVoltage.toFixed(1)}–{rule.maxVoltage.toFixed(1)}V
                    </span>
                    <div className="shrink-0">
                      {renderStatusLabel(item.status, formatFaultClassLabel(item.faultClass))}
                    </div>
                  </div>
                </div>

                {/* Expanded Inline Detail & Custom Threshold Editor */}
                {isExpanded && (
                  <div className="border-t border-[#203653] px-2.5 py-2 space-y-2 text-[10.5px] bg-[#050A12] rounded-b-xl">
                    <p className="text-[#EAF3FF]/90 leading-relaxed">{item.summary}</p>
                    {item.status !== 'PASS' && item.status !== 'STANDBY' && (
                      <p className="text-[#FFB020] leading-relaxed">
                        <strong className="font-semibold">Action:</strong> {item.recommendation}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
                      <label className="flex flex-col gap-0.5 text-[#91A4BD]">
                        <span>Logic Profile</span>
                        <select
                          value={rule.expectedState}
                          onChange={(e) =>
                            onUpdateRuleThresholds(rule.pinId, {
                              expectedState: e.target.value as LogicExpectedState,
                            })
                          }
                          className="rounded-lg border border-[#203653] bg-[#0E192A] px-1.5 py-1 text-[#EAF3FF] focus:outline-none focus:border-[#19C8F5]"
                        >
                          {LOGIC_STATES.map((st) => (
                            <option key={st} value={st}>
                              {formatLogicStateLabel(st)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-0.5 text-[#91A4BD]">
                        <span>+VBAT Alert ≥ (V)</span>
                        <input
                          type="number"
                          step="0.25"
                          value={rule.shortToBatteryThresholdV}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) {
                              onUpdateRuleThresholds(rule.pinId, { shortToBatteryThresholdV: v });
                            }
                          }}
                          className="rounded-lg border border-[#203653] bg-[#0E192A] px-1.5 py-1 text-[#FF4D62] tabular-nums focus:outline-none focus:border-[#19C8F5]"
                        />
                      </label>

                      <label className="flex flex-col gap-0.5 text-[#91A4BD]">
                        <span>Min Valid (V)</span>
                        <input
                          type="number"
                          step="0.1"
                          value={rule.minVoltage}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) {
                              onUpdateRuleThresholds(rule.pinId, { minVoltage: v });
                            }
                          }}
                          className="rounded-lg border border-[#203653] bg-[#0E192A] px-1.5 py-1 text-[#EAF3FF] tabular-nums focus:outline-none focus:border-[#19C8F5]"
                        />
                      </label>

                      <label className="flex flex-col gap-0.5 text-[#91A4BD]">
                        <span>Max Valid (V)</span>
                        <input
                          type="number"
                          step="0.1"
                          value={rule.maxVoltage}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) {
                              onUpdateRuleThresholds(rule.pinId, { maxVoltage: v });
                            }
                          }}
                          className="rounded-lg border border-[#203653] bg-[#0E192A] px-1.5 py-1 text-[#EAF3FF] tabular-nums focus:outline-none focus:border-[#19C8F5]"
                        />
                      </label>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onToggleRuleEnabled(rule.pinId)}
                        className="hw-btn rounded-lg px-2 py-1 text-[10px] font-mono text-[#EAF3FF] transition cursor-pointer"
                      >
                        {rule.enabled ? 'Pause Pin Watch' : 'Resume Pin Watch'}
                      </button>

                      {onAttachRedProbe && (
                        <button
                          type="button"
                          onClick={() =>
                            onAttachRedProbe(rule.pinId, `${rule.pinLabel} (Pin ${rule.pinNumber})`)
                          }
                          className="hw-btn hw-btn-amber inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-mono font-semibold transition cursor-pointer"
                        >
                          <Crosshair className="w-3 h-3" aria-hidden="true" />
                          <span>Probe Red (+)</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Cross-Pin Differential Integrity Checks */}
      {snapshot.crossChecks.length > 0 && (
        <div className="hw-lcd-well rounded-xl p-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[#19C8F5]">
            <GitCompareArrows className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Multi-Pin Cross-Checks</span>
          </div>
          {snapshot.crossChecks.map((cc) => (
            <div
              key={cc.id}
              className="rounded-lg border border-[#203653] bg-[#0E192A]/90 px-2 py-1.5 text-[10px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-200 truncate">{cc.title}</span>
                <span
                  className={`font-mono font-bold shrink-0 ${
                    cc.status === 'PASS'
                      ? 'text-emerald-400'
                      : cc.status === 'CRITICAL'
                      ? 'text-rose-300'
                      : cc.status === 'WARNING'
                      ? 'text-amber-300'
                      : 'text-slate-400'
                  }`}
                >
                  {cc.status}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 font-mono text-[9.5px] text-slate-400 mt-0.5 tabular-nums">
                <span className="truncate">{cc.measuredDeltaLabel}</span>
                <span className="shrink-0">Spec: {cc.expectedLabel}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Incident History Log */}
      <div className="hw-lcd-well rounded-[2px] p-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-300 tabular-nums">
            Triggered Alert Log ({incidentLog.length})
          </span>
          {incidentLog.length > 0 && (
            <button
              type="button"
              onClick={onClearIncidentLog}
              className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-rose-300 transition cursor-pointer"
              title="Clear Logic Check incident log"
            >
              <Trash2 className="w-3 h-3" aria-hidden="true" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {incidentLog.length === 0 ? (
          <p className="text-[10px] font-mono text-slate-500">
            No unexpected logic events logged in this session.
          </p>
        ) : (
          <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5">
            {incidentLog.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelectPin(entry.pinId)}
                className={`w-full text-left rounded-[2px] border px-2 py-1.5 text-[10px] transition cursor-pointer ${
                  entry.severity === 'CRITICAL'
                    ? 'border-rose-500/45 bg-rose-950/35 hover:border-rose-400 text-rose-100'
                    : 'border-amber-500/45 bg-amber-950/30 hover:border-amber-400 text-amber-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2 font-mono">
                  <span className="font-bold truncate">{entry.title}</span>
                  <span className="text-[9px] text-slate-400 shrink-0 tabular-nums">
                    {entry.timestampLabel}
                  </span>
                </div>
                <p className="text-[9.5px] text-slate-300 mt-0.5 truncate">{entry.detail}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
