/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  Binary,
  CheckCircle2,
  Info,
  Pause,
  Play,
  Radio,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { EcuPin, InjectedFault } from '../types/ecu';
import {
  analyzePinBinaryState,
  BinaryPinMonitorResult,
  SignalAnomalyNotification,
  SignalAnomalySeverity,
} from '../simulation/signals/BinaryStateDecoder';

export interface BinaryStateMonitorProps {
  /** Ordered array of 16 ECU connector pins. */
  pins: EcuPin[];
  /** Currently inspected ECU pin ID synchronized with WiringCanvas & Oscilloscope. */
  selectedPinId: string | null;
  /** Callback to switch active inspected ECU pin. */
  onSelectPin: (pinId: string) => void;
  /** Live MNA solver node voltages keyed by pin/node ID. */
  nodeVoltages: Record<string, number>;
  /** Currently injected electrical faults evaluated by MNA. */
  faults: InjectedFault[];
  /** Bench DC power supply output state. */
  isPowerOn: boolean;
  /** True if a fault affects CAN_H or CAN_L. */
  hasCanFault: boolean;
  /** True if a fault affects primary injector driver. */
  hasInjectorFault: boolean;
  /** True when bench injector pulse simulation is enabled. */
  isInjectorFiring: boolean;
  /** Active RPM from CKP/RPM emulator (or idle fallback when off). */
  rpm: number;
  /** Simulation speed multiplier (`0.25` to `4.0`). */
  simulationSpeed: number;
  /** Render density: 'full' for dedicated monitor mode, 'compact' when embedded inside Pin Scope. */
  variant?: 'full' | 'compact';
  /** True when crankshaft 60-2 VR sensor signal is lost (suppresses INJ_1/IGN_1 pulses). */
  ckpSignalLost?: boolean;
}

interface AnomalyLogEntry {
  key: string;
  pinNumber: number;
  pinLabel: string;
  code: SignalAnomalyNotification['code'];
  title: string;
  severity: SignalAnomalySeverity;
  transitionFreqHz: number;
  observedLabel: string;
  timestampLabel: string;
}

const DATA_PIN_QUICK_SELECT = [
  { id: 'ecu-pin-10', shortLabel: 'INJ_1', pinNum: 10, role: 'PWM' },
  { id: 'ecu-pin-11', shortLabel: 'IGN_1', pinNum: 11, role: '5V TRIG' },
  { id: 'ecu-pin-13', shortLabel: 'CAN_H', pinNum: 13, role: 'CAN 2.0' },
  { id: 'ecu-pin-14', shortLabel: 'CAN_L', pinNum: 14, role: 'CAN 2.0' },
  { id: 'ecu-pin-15', shortLabel: 'O2_SIG', pinNum: 15, role: 'LAMBDA' },
] as const;

const PWM_WINDOW_OPTIONS_MS = [40, 100, 200] as const;

function formatFreq(freqHz: number): string {
  if (!Number.isFinite(freqHz) || freqHz <= 0) return '0.0 Hz (DC)';
  if (freqHz >= 1000) return `${(freqHz / 1000).toFixed(0)} kbps (${(freqHz / 1000).toFixed(0)} kHz)`;
  return `${freqHz.toFixed(1)} Hz`;
}

function formatTransitionFreq(freqHz: number): string {
  if (!Number.isFinite(freqHz) || freqHz <= 0) return '0.0 Hz';
  if (freqHz >= 1000) return `${(freqHz / 1000).toFixed(2)} kHz`;
  return `${freqHz.toFixed(1)} Hz`;
}

function getSeverityStyle(severity: SignalAnomalySeverity): {
  containerCls: string;
  badgeCls: string;
  titleCls: string;
} {
  switch (severity) {
    case 'CRITICAL':
      return {
        containerCls: 'border-rose-500/60 bg-rose-950/60 text-rose-100',
        badgeCls: 'bg-rose-500/20 border-rose-400/70 text-rose-200',
        titleCls: 'text-rose-200',
      };
    case 'WARNING':
      return {
        containerCls: 'border-amber-500/60 bg-amber-950/50 text-amber-100',
        badgeCls: 'bg-amber-500/20 border-amber-400/70 text-amber-200',
        titleCls: 'text-amber-200',
      };
    default:
      return {
        containerCls: 'border-[#343c4b] bg-[#141820] text-slate-100',
        badgeCls: 'bg-amber-500/15 border-amber-500/50 text-amber-300',
        titleCls: 'text-amber-200',
      };
  }
}

function getProtocolStyle(result: BinaryPinMonitorResult): {
  badgeCls: string;
  accentText: string;
} {
  switch (result.detectedProtocol) {
    case 'CAN_BUS':
      return {
        badgeCls: 'bg-amber-500/15 border-amber-500/55 text-amber-300',
        accentText: 'text-amber-300',
      };
    case 'PWM_ACTUATOR':
      return {
        badgeCls: 'bg-emerald-950/85 border-emerald-500/55 text-[#4ade80]',
        accentText: 'text-[#4ade80]',
      };
    case 'LOGIC_PULSE':
      return {
        badgeCls: 'bg-amber-950/85 border-amber-500/55 text-amber-300',
        accentText: 'text-amber-300',
      };
    case 'ANALOG_SWITCHING':
      return {
        badgeCls: 'bg-[#1a1f28] border-[#3a4354] text-slate-200',
        accentText: 'text-slate-200',
      };
    case 'FAULT_OR_OFF':
      return {
        badgeCls: 'bg-rose-950/85 border-rose-500/65 text-rose-200',
        accentText: 'text-rose-300',
      };
    default:
      return {
        badgeCls: 'bg-[#141820] border-[#343c4b] text-slate-300',
        accentText: 'text-slate-300',
      };
  }
}

export const BinaryStateMonitor: React.FC<BinaryStateMonitorProps> = React.memo(({
  pins,
  selectedPinId,
  onSelectPin,
  nodeVoltages,
  faults,
  isPowerOn,
  hasCanFault,
  hasInjectorFault,
  isInjectorFiring,
  rpm,
  simulationSpeed,
  variant = 'full',
  ckpSignalLost = false,
}) => {
  const [isRunning, setIsRunning] = useState(true);
  const [simTimeSec, setSimTimeSec] = useState(0);
  const [pwmWindowMs, setPwmWindowMs] = useState<number>(100);
  const [showAlertLog, setShowAlertLog] = useState(false);
  const [anomalyLog, setAnomalyLog] = useState<AnomalyLogEntry[]>([]);
  const lastActiveAnomalyKeysRef = useRef<Set<string>>(new Set());

  const activePin = useMemo(() => {
    return (
      pins.find((p) => p.id === selectedPinId) ||
      pins.find((p) => p.id === 'ecu-pin-13') ||
      pins.find((p) => p.id === 'ecu-pin-10') ||
      pins[0]
    );
  }, [pins, selectedPinId]);

  const isCanPin = activePin?.id === 'ecu-pin-13' || activePin?.id === 'ecu-pin-14';
  const companionPinId =
    activePin?.id === 'ecu-pin-13'
      ? 'ecu-pin-14'
      : activePin?.id === 'ecu-pin-14'
        ? 'ecu-pin-13'
        : undefined;

  const activeFault = useMemo(
    () => (activePin ? faults.find((f) => f.pinId === activePin.id) : undefined),
    [faults, activePin]
  );

  const companionFault = useMemo(
    () => (companionPinId ? faults.find((f) => f.pinId === companionPinId) : undefined),
    [faults, companionPinId]
  );

  // Advance deterministic sample window at ~7 Hz when powered, running, and visible
  useEffect(() => {
    if (!isRunning || !isPowerOn) return;
    let rafId = 0;
    let lastTs = performance.now();
    let acc = 0;

    const tick = (now: number) => {
      if (document.hidden) {
        lastTs = now;
        rafId = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(0.15, (now - lastTs) / 1000);
      lastTs = now;
      acc += dt;
      if (acc >= 0.14) {
        const step = acc * simulationSpeed * (isCanPin ? 0.00045 : 0.28);
        acc = 0;
        setSimTimeSec((prev) => (prev + step) % 60);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isRunning, isPowerOn, simulationSpeed, isCanPin]);

  const analysis = useMemo<BinaryPinMonitorResult | null>(() => {
    if (!activePin) return null;
    const mnaV = nodeVoltages[activePin.id] ?? 0;
    const companionMnaV = companionPinId ? (nodeVoltages[companionPinId] ?? 0) : undefined;
    const kl30V = (nodeVoltages['ecu-pin-3'] ?? 12.6) - (nodeVoltages['ecu-pin-1'] ?? 0);
    const kl15V = (nodeVoltages['ecu-pin-4'] ?? 12.6) - (nodeVoltages['ecu-pin-2'] ?? 0);
    const isEcuAwake = isPowerOn && kl30V >= 6.5 && kl15V >= 6.5;
    const pinPulseMissing = ckpSignalLost && (activePin.id === 'ecu-pin-10' || activePin.id === 'ecu-pin-11');

    return analyzePinBinaryState({
      pinId: activePin.id,
      pinLabel: activePin.label,
      pinNumber: activePin.pinNumber,
      mnaNodeVoltage: mnaV,
      companionMnaVoltage: companionMnaV,
      faultType: activeFault?.faultType ?? 'NONE',
      companionFaultType: companionFault?.faultType ?? 'NONE',
      isPowerOn: isEcuAwake,
      hasCanFault: hasCanFault || !isEcuAwake,
      hasInjectorFault: hasInjectorFault || !isEcuAwake || pinPulseMissing,
      isInjectorFiring: isInjectorFiring && isEcuAwake && !pinPulseMissing,
      rpm,
      tStartSec: simTimeSec,
      windowMs: isCanPin ? undefined : activePin.id === 'ecu-pin-15' ? 1000 : pwmWindowMs,
    });
  }, [
    activePin,
    companionPinId,
    nodeVoltages,
    activeFault,
    companionFault,
    isPowerOn,
    hasCanFault,
    hasInjectorFault,
    isInjectorFiring,
    ckpSignalLost,
    rpm,
    simTimeSec,
    isCanPin,
    pwmWindowMs,
  ]);

  // Latch rising edges of CRITICAL / WARNING anomalies into the session alert log
  useEffect(() => {
    if (!analysis) return;
    const actionable = analysis.anomalies.filter(
      (a) => a.severity === 'CRITICAL' || a.severity === 'WARNING'
    );
    const nextActiveKeys = new Set(actionable.map((a) => `${analysis.pinId}:${a.code}`));
    const newlyTriggered = actionable.filter(
      (a) => !lastActiveAnomalyKeysRef.current.has(`${analysis.pinId}:${a.code}`)
    );
    lastActiveAnomalyKeysRef.current = nextActiveKeys;

    if (newlyTriggered.length === 0) return;

    const timestampLabel = new Date().toLocaleTimeString([], {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    setAnomalyLog((prev) => {
      const additions: AnomalyLogEntry[] = newlyTriggered.map((a) => ({
        key: `${analysis.pinId}:${a.code}:${Date.now()}`,
        pinNumber: analysis.pinNumber,
        pinLabel: analysis.pinLabel,
        code: a.code,
        title: a.title,
        severity: a.severity,
        transitionFreqHz: a.transitionFreqHz,
        observedLabel: a.observedLabel,
        timestampLabel,
      }));
      return [...additions, ...prev].slice(0, 15);
    });
  }, [analysis]);

  if (!analysis || !activePin) return null;

  const { badgeCls, accentText } = getProtocolStyle(analysis);
  const actionableAnomalies = analysis.anomalies.filter(
    (a) => a.severity === 'CRITICAL' || a.severity === 'WARNING'
  );
  const hasCriticalAnomaly = actionableAnomalies.some((a) => a.severity === 'CRITICAL');
  const slotCount = analysis.samples.length;
  const svgWidth = 480;
  const svgHeight = variant === 'compact' ? 58 : 74;
  const highY = 12;
  const lowY = svgHeight - 14;
  const slotW = svgWidth / Math.max(1, slotCount);

  // Build crisp orthogonal digital step polyline for SVG logic trace
  const stepPoints = analysis.samples
    .map((sample, idx) => {
      const x1 = idx * slotW;
      const x2 = (idx + 1) * slotW;
      const y = sample.logicState === 1 ? highY : lowY;
      return `${x1.toFixed(1)},${y} ${x2.toFixed(1)},${y}`;
    })
    .join(' ');

  const isCompact = variant === 'compact';

  return (
    <section
      aria-label="Binary State and Protocol Logic Monitor"
      data-testid="binary-state-monitor"
      className={`hud-panel rounded-[3px] font-mono text-slate-100 flex flex-col gap-2 ${
        isCompact
          ? 'p-2.5 border border-[#2b313c] bg-[#101318]'
          : 'p-2.5 sm:p-3.5 shrink-0'
      }`}
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2b313c] pb-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <Binary className="w-4 h-4 text-[#4ade80] shrink-0" />
          <h3 className="text-[11px] sm:text-xs font-mono font-bold uppercase tracking-wider text-slate-100">
            Binary State Monitor
          </h3>
          <span
            data-testid="binary-protocol-badge"
            className={`px-1.5 py-0.5 text-[9.5px] font-bold rounded-[2px] border ${badgeCls}`}
          >
            {analysis.protocolBadge}
          </span>
          {actionableAnomalies.length > 0 ? (
            <span
              data-testid="binary-header-anomaly-pill"
              className={`px-1.5 py-0.5 text-[9px] font-bold rounded-[2px] border flex items-center gap-1 ${
                hasCriticalAnomaly
                  ? 'bg-rose-950 border-rose-500/70 text-rose-200'
                  : 'bg-amber-950 border-amber-500/70 text-amber-200'
              }`}
            >
              <ShieldAlert className="w-2.5 h-2.5" />
              {actionableAnomalies.length}{' '}
              {actionableAnomalies.length === 1 ? 'ANOMALY' : 'ANOMALIES'}
            </span>
          ) : (
            isPowerOn && (
              <span
                data-testid="binary-header-nominal-pill"
                className="px-1.5 py-0.5 text-[9px] font-bold rounded-[2px] border bg-emerald-950/70 border-emerald-500/40 text-[#4ade80] flex items-center gap-1"
              >
                <CheckCircle2 className="w-2.5 h-2.5" />
                NOMINAL
              </span>
            )
          )}
          {activeFault && activeFault.faultType !== 'NONE' && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-[2px] bg-rose-950 border border-rose-500/50 text-rose-200 flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" />
              {activeFault.faultType}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <label className="flex items-center gap-1 text-[10px] text-amber-300 font-semibold">
            <span className="hidden sm:inline">PIN:</span>
            <select
              aria-label="Select ECU Pin for Binary State Monitor"
              value={activePin.id}
              onChange={(e) => onSelectPin(e.target.value)}
              className="bg-[#0c0f14] border border-[#343c4b] hover:border-amber-500/50 text-slate-100 text-[10px] rounded-[2px] px-1.5 py-1 focus:outline-none cursor-pointer max-w-[165px]"
            >
              {pins.map((pin) => (
                <option key={pin.id} value={pin.id} className="bg-[#0c0f14] text-slate-100">
                  #{pin.pinNumber} {pin.label} ({(nodeVoltages[pin.id] ?? 0).toFixed(2)}V)
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setShowAlertLog((prev) => !prev)}
            aria-expanded={showAlertLog}
            aria-label="Toggle signal anomaly notification log"
            data-testid="binary-alert-log-toggle"
            className={`px-2 py-1 text-[10px] rounded-[2px] border flex items-center gap-1 font-semibold transition cursor-pointer ${
              showAlertLog || anomalyLog.length > 0
                ? 'hw-btn-amber text-amber-200'
                : 'hw-btn text-slate-300'
            }`}
          >
            <Bell className="w-3 h-3" />
            <span>LOG ({anomalyLog.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setIsRunning((prev) => !prev)}
            aria-label={isRunning ? 'Pause binary monitor capture' : 'Resume binary monitor capture'}
            className={`px-2 py-1 text-[10px] rounded-[2px] border flex items-center gap-1 font-semibold transition cursor-pointer ${
              isRunning ? 'hw-btn-green text-emerald-300' : 'hw-btn-amber text-amber-300'
            }`}
          >
            {isRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>{isRunning ? 'LIVE' : 'HOLD'}</span>
          </button>
        </div>
      </div>

      {/* Quick-Select Data Pins & Capture Window */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Data pin quick select">
          <span className="text-slate-400 mr-0.5">DATA PINS:</span>
          {DATA_PIN_QUICK_SELECT.map((item) => {
            const isActive = activePin.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelectPin(item.id)}
                className={`px-1.5 py-0.5 rounded-[2px] text-[9.5px] font-semibold transition cursor-pointer ${
                  isActive
                    ? 'hw-btn-amber text-amber-300'
                    : 'hw-btn text-slate-300'
                }`}
              >
                #{item.pinNum} {item.shortLabel}
                <span className="hidden sm:inline text-slate-400 ml-1">· {item.role}</span>
              </button>
            );
          })}
        </div>

        {!isCanPin && activePin.id !== 'ecu-pin-15' && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-500">CAPTURE:</span>
            {PWM_WINDOW_OPTIONS_MS.map((ms) => (
              <button
                key={ms}
                type="button"
                aria-pressed={pwmWindowMs === ms}
                onClick={() => setPwmWindowMs(ms)}
                className={`px-1.5 py-0.5 rounded-[2px] text-[9.5px] transition cursor-pointer ${
                  pwmWindowMs === ms
                    ? 'hw-btn-amber text-amber-300 font-bold'
                    : 'hw-btn text-slate-400 hover:text-white'
                }`}
              >
                {ms}ms
              </button>
            ))}
          </div>
        )}

        {isCanPin && (
          <span className="text-[9.5px] text-[#4ade80] tabular-nums">
            WIN: {analysis.windowMs.toFixed(2)}ms (48 bit-slots)
          </span>
        )}
      </div>

      {/* Diagnostic Notification System (Transition-Frequency Anomaly Alerts) */}
      <div
        data-testid="binary-anomaly-notifications"
        role="status"
        aria-live="polite"
        className="flex flex-col gap-1.5"
      >
        {!isPowerOn ? (
          <div className="rounded-[2px] border border-[#2b313c] bg-[#11151c] px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Bench PSU Output OFF · Transition-frequency anomaly detection in standby.</span>
            </span>
            <span className="tabular-nums text-slate-500">Transitions: 0.0 Hz</span>
          </div>
        ) : analysis.anomalies.length === 0 ? (
          <div className="rounded-[2px] border border-emerald-500/35 bg-emerald-950/25 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-emerald-200">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#4ade80] shrink-0" />
              <span className="font-semibold">Signal Integrity Nominal</span>
              <span className="text-emerald-300/80 hidden sm:inline">
                · Framing &amp; transition cadence within expected physical bounds
              </span>
            </span>
            <span
              data-testid="binary-transition-rate-badge"
              className="tabular-nums font-semibold text-[#4ade80]"
            >
              Transition Rate: {formatTransitionFreq(analysis.metrics.transitionFreqHz)}
            </span>
          </div>
        ) : (
          analysis.anomalies.map((anomaly) => {
            const sevStyle = getSeverityStyle(anomaly.severity);
            const SevIcon =
              anomaly.severity === 'CRITICAL'
                ? ShieldAlert
                : anomaly.severity === 'WARNING'
                  ? AlertTriangle
                  : Info;
            return (
              <div
                key={anomaly.id}
                data-testid={`binary-anomaly-card-${anomaly.code}`}
                className={`rounded-[2px] border px-2.5 py-2 flex flex-col gap-1 text-[10px] ${sevStyle.containerCls}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <SevIcon className="w-3.5 h-3.5 shrink-0" />
                    <span
                      className={`px-1.5 py-0.5 rounded-[2px] border text-[8.5px] font-bold uppercase tracking-wider ${sevStyle.badgeCls}`}
                    >
                      {anomaly.severity}
                    </span>
                    <strong className={`text-[11px] font-bold tracking-wide ${sevStyle.titleCls}`}>
                      {anomaly.title}
                    </strong>
                  </div>
                  <span className="text-[9.5px] font-semibold tabular-nums opacity-90">
                    Transition Rate: {formatTransitionFreq(anomaly.transitionFreqHz)}
                  </span>
                </div>

                <p className="text-[10px] leading-snug opacity-95">{anomaly.detail}</p>

                <div className="flex flex-wrap items-center gap-1.5 text-[9px] tabular-nums">
                  <span className="px-1.5 py-0.5 rounded-[2px] bg-[#0c0f14] border border-[#2b313c]">
                    Observed: <strong>{anomaly.observedLabel}</strong>
                  </span>
                  <span className="px-1.5 py-0.5 rounded-[2px] bg-[#0c0f14] border border-[#2b313c] opacity-85">
                    Expected: {anomaly.expectedRangeLabel}
                  </span>
                </div>

                {!isCompact && (
                  <div className="text-[9.5px] text-slate-200/85">
                    <span className="font-semibold text-amber-300">Next Check:</span>{' '}
                    {anomaly.recommendation}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Collapsible Session Diagnostic Event Log */}
        {showAlertLog && (
          <div
            data-testid="binary-anomaly-log-drawer"
            className="rounded-[2px] border border-[#343c4b] bg-[#0e1218] p-2 flex flex-col gap-1.5 text-[9.5px]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[#2b313c] pb-1">
              <span className="font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <Bell className="w-3 h-3 text-amber-400" />
                Session Anomaly Notification Log ({anomalyLog.length})
              </span>
              {anomalyLog.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAnomalyLog([])}
                  className="hw-btn px-1.5 py-0.5 rounded-[2px] text-slate-300 hover:text-white flex items-center gap-1 text-[9px] cursor-pointer"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>
            {anomalyLog.length === 0 ? (
              <div className="text-slate-400 py-1">
                No critical or warning signal anomalies recorded in this session yet.
              </div>
            ) : (
              <ul className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                {anomalyLog.map((entry) => (
                  <li
                    key={entry.key}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[2px] bg-[#141820] border border-[#2b313c] px-2 py-1 tabular-nums"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`px-1 py-0.5 rounded-[2px] text-[8px] font-bold ${
                          entry.severity === 'CRITICAL'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {entry.severity}
                      </span>
                      <span className="font-semibold text-slate-100">{entry.title}</span>
                      <span className="text-amber-300">
                        #{entry.pinNumber} {entry.pinLabel}
                      </span>
                    </span>
                    <span className="text-slate-400">
                      {formatTransitionFreq(entry.transitionFreqHz)} · {entry.timestampLabel}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Digital Logic Step Timing Waveform (SVG) */}
      <div className="hw-lcd-well rounded-[2px] border border-[#2b313c] bg-[#040907] p-2 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[9.5px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-[#4ade80]" />
            <span>
              LOGIC TRACE ·{' '}
              <strong className="text-slate-200">
                #{analysis.pinNumber} {analysis.pinLabel}
              </strong>{' '}
              ({analysis.metrics.activePolarity.replace('_', '-')})
            </span>
          </span>
          <span className="tabular-nums text-slate-400">
            {isCanPin
              ? 'Threshold: V_diff ≥ 0.90V → DOM (0) | < 0.50V → REC (1)'
              : analysis.metrics.activePolarity === 'ACTIVE_LOW'
                ? `Active-Low ≤ ${analysis.metrics.lowThresholdV.toFixed(1)}V → 1 (Energized)`
                : `Threshold ≥ ${analysis.metrics.highThresholdV.toFixed(2)}V → 1 (High)`}
          </span>
        </div>

        <div className="flex items-stretch gap-1.5">
          <div className="flex flex-col justify-between py-1.5 text-[8.5px] font-bold text-slate-400 select-none shrink-0">
            <span>1</span>
            <span>0</span>
          </div>
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            preserveAspectRatio="none"
            className="w-full flex-1 h-16 sm:h-20 block rounded-[2px] bg-[#030705] border border-[#1f2924]"
            role="img"
            aria-label={`Digital binary logic waveform for pin ${analysis.pinNumber} ${analysis.pinLabel}`}
          >
            {/* Logic level guide lines */}
            <line
              x1={0}
              y1={highY}
              x2={svgWidth}
              y2={highY}
              stroke="#143226"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={0}
              y1={lowY}
              x2={svgWidth}
              y2={lowY}
              stroke="#143226"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />

            {/* Dominant / Active slot shading */}
            {analysis.samples.map((sample, idx) => {
              const x = idx * slotW;
              const isHighlighted = isCanPin
                ? sample.busState === 'DOMINANT'
                : sample.logicState === 1;
              const isFaultSlot = sample.busState === 'FAULT';
              if (!isHighlighted && !isFaultSlot && !sample.isFlyback) return null;
              return (
                <rect
                  key={sample.index}
                  x={x}
                  y={0}
                  width={Math.max(1, slotW - 0.5)}
                  height={svgHeight}
                  fill={
                    isFaultSlot
                      ? 'rgba(244,63,94,0.14)'
                      : sample.isFlyback && sample.logicState === 0
                        ? 'rgba(245,158,11,0.18)'
                        : isCanPin
                          ? 'rgba(245,158,11,0.16)'
                          : 'rgba(74,222,128,0.18)'
                  }
                />
              );
            })}

            {/* Byte boundary markers every 8 slots */}
            {[8, 16, 24, 32, 40].map((bitBoundary) => (
              <line
                key={bitBoundary}
                x1={bitBoundary * slotW}
                y1={0}
                x2={bitBoundary * slotW}
                y2={svgHeight}
                stroke="#1c2420"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* Digital square wave trace */}
            <polyline
              fill="none"
              stroke={
                analysis.detectedProtocol === 'FAULT_OR_OFF'
                  ? '#f43f5e'
                  : isCanPin
                    ? '#f59e0b'
                    : '#4ade80'
              }
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              points={stepPoints}
            />
          </svg>
        </div>

        {/* 48-Bit Discrete State Cell Strip */}
        <div className="flex flex-col gap-1">
          <div
            className="grid grid-cols-12 sm:grid-cols-24 gap-0.5"
            aria-label="48-bit sampled binary state cells"
          >
            {analysis.samples.map((sample) => {
              const cellTitle = isCanPin
                ? `Bit #${sample.index} @ ${sample.timeMs.toFixed(2)}ms · ${sample.busState} (logic ${sample.logicState}) · V_diff=${(sample.diffVoltage ?? 0).toFixed(2)}V`
                : `Slot #${sample.index} @ ${sample.timeMs.toFixed(1)}ms · Logic=${sample.logicState} · ${sample.voltage.toFixed(2)}V${sample.isFlyback ? ' (Flyback)' : ''}`;
              const isDom = isCanPin && sample.busState === 'DOMINANT';
              const isFault = sample.busState === 'FAULT' || analysis.detectedProtocol === 'FAULT_OR_OFF';

              return (
                <div
                  key={sample.index}
                  title={cellTitle}
                  className={`h-4 rounded-[2px] border text-[8.5px] font-bold flex items-center justify-center tabular-nums select-none ${
                    isFault
                      ? 'bg-rose-950/70 border-rose-500/40 text-rose-300'
                      : isCanPin
                        ? isDom
                          ? 'bg-amber-500/20 border-amber-400/70 text-amber-200'
                          : 'bg-[#12161d] border-[#2b313c] text-slate-400'
                        : sample.logicState === 1
                          ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-200'
                          : sample.isFlyback
                            ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                            : 'bg-[#12161d] border-[#262c36] text-slate-500'
                  }`}
                >
                  {isCanPin ? (sample.busState === 'DOMINANT' ? '0' : sample.busState === 'RECESSIVE' ? '1' : 'F') : sample.logicState}
                </div>
              );
            })}
          </div>

          {/* Decoded Hex Byte Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[9.5px] pt-0.5">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-slate-500">HEX BYTES:</span>
              {analysis.hexBytes.map((hex, i) => (
                <span
                  key={`${hex}-${i}`}
                  className="px-1.5 py-0.5 rounded-[2px] bg-[#12161d] border border-[#2e3644] text-amber-200 tabular-nums"
                >
                  {hex}
                </span>
              ))}
            </div>
            <span className="text-slate-500 tabular-nums">
              NOW:{' '}
              <strong className={accentText}>
                {analysis.metrics.currentLogicLevel === 1 ? 'LOGIC 1 (HIGH)' : 'LOGIC 0 (LOW)'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* CAN Frame Pattern Decode Panel (when CAN_H or CAN_L selected) */}
      {analysis.canFrameSummary && (
        <div
          data-testid="binary-can-frame-panel"
          className="rounded-[2px] border border-[#343c4b] bg-[#12161d] px-2.5 py-2 flex flex-col gap-1.5 text-[10px]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold uppercase tracking-wider text-amber-300">
                ISO 11898 CAN Bus Frame Pattern
              </span>
            </div>
            <span
              className={`px-1.5 py-0.5 rounded-[2px] border text-[9px] font-bold ${
                analysis.canFrameSummary.health === 'ACTIVE_500KBPS'
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-[#4ade80]'
                  : 'bg-rose-950/80 border-rose-500/50 text-rose-300'
              }`}
            >
              {analysis.canFrameSummary.health} · {analysis.canFrameSummary.nominalBaudKbps} kbps
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 tabular-nums">
            <div className="hw-lcd-well rounded-[2px] border border-[#2b313c] px-2 py-1">
              <div className="text-[8.5px] text-slate-400 uppercase">Arb ID (11-bit)</div>
              <div className="text-xs font-bold text-amber-300">
                {analysis.canFrameSummary.health === 'ACTIVE_500KBPS'
                  ? analysis.canFrameSummary.arbitrationIdHex
                  : 'N/A'}
              </div>
            </div>
            <div className="hw-lcd-well rounded-[2px] border border-[#2b313c] px-2 py-1">
              <div className="text-[8.5px] text-slate-400 uppercase">Peak V_diff</div>
              <div className="text-xs font-bold text-[#4ade80]">
                {analysis.canFrameSummary.vDiffMax.toFixed(2)} V
              </div>
            </div>
            <div className="hw-lcd-well rounded-[2px] border border-[#2b313c] px-2 py-1">
              <div className="text-[8.5px] text-slate-400 uppercase">Dominant (0) / Rec (1)</div>
              <div className="text-xs font-bold text-amber-300">
                {analysis.canFrameSummary.dominantPct.toFixed(0)}% /{' '}
                {analysis.canFrameSummary.recessivePct.toFixed(0)}%
              </div>
            </div>
            <div className="hw-lcd-well rounded-[2px] border border-[#2b313c] px-2 py-1">
              <div className="text-[8.5px] text-slate-400 uppercase">SOF & DLC</div>
              <div className="text-xs font-bold text-slate-200">
                {analysis.canFrameSummary.sofDetected
                  ? `SOF @ b${analysis.canFrameSummary.sofBitIndex} · DLC ${analysis.canFrameSummary.dlc}`
                  : 'No SOF Edge'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Duty Cycle, Timing & Voltage Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[10px] tabular-nums">
        <div className="hw-lcd-well rounded-[2px] px-2 py-1.5 flex flex-col gap-1">
          <span className="text-[8.5px] text-slate-400 uppercase">
            {isCanPin ? 'Dominant Duty' : 'Duty Cycle'}
          </span>
          <strong className={`text-xs ${accentText}`}>
            {analysis.metrics.dutyCyclePct.toFixed(1)}%
          </strong>
          <svg
            viewBox="0 0 100 4"
            preserveAspectRatio="none"
            className="h-1.5 w-full rounded-[1px] bg-[#1a2029] block overflow-hidden"
            aria-hidden="true"
          >
            <rect
              x={0}
              y={0}
              width={Math.min(100, Math.max(0, analysis.metrics.dutyCyclePct))}
              height={4}
              fill={
                analysis.detectedProtocol === 'FAULT_OR_OFF'
                  ? '#fb7185'
                  : isCanPin
                    ? '#f59e0b'
                    : '#4ade80'
              }
            />
          </svg>
        </div>

        <div className="hw-lcd-well rounded-[2px] px-2 py-1.5 flex flex-col justify-between">
          <span className="text-[8.5px] text-slate-400 uppercase">Frequency</span>
          <strong className="text-xs text-[#4ade80] truncate">
            {formatFreq(analysis.metrics.frequencyHz)}
          </strong>
        </div>

        <div className="hw-lcd-well rounded-[2px] px-2 py-1.5 flex flex-col justify-between">
          <span className="text-[8.5px] text-slate-400 uppercase">
            {isCanPin ? 'Bit Width' : 'Pulse Width'}
          </span>
          <strong className="text-xs text-amber-300">
            {analysis.metrics.pulseWidthMs > 0
              ? isCanPin
                ? `${(analysis.metrics.pulseWidthMs * 1000).toFixed(0)} µs`
                : `${analysis.metrics.pulseWidthMs.toFixed(2)} ms`
              : '0.00 ms'}
          </strong>
        </div>

        <div className="hw-lcd-well rounded-[2px] px-2 py-1.5 flex flex-col justify-between">
          <span className="text-[8.5px] text-slate-400 uppercase">Edges (0↔1)</span>
          <strong className="text-xs text-amber-300">{analysis.metrics.edgeCount}</strong>
          <span className="text-[8.5px] text-amber-200/80 tabular-nums">
            {formatTransitionFreq(analysis.metrics.transitionFreqHz)}
          </span>
        </div>

        <div className="hw-lcd-well rounded-[2px] px-2 py-1.5 flex flex-col justify-between col-span-2 sm:col-span-1">
          <span className="text-[8.5px] text-slate-400 uppercase">Voltage Span</span>
          <strong className="text-xs text-slate-200">
            {analysis.metrics.vMin.toFixed(2)}–{analysis.metrics.vMax.toFixed(2)} V
          </strong>
        </div>
      </div>

      {/* Diagnostic Physics Summary Footer */}
      <div
        data-testid="binary-diagnostic-summary"
        className="rounded-[2px] border border-[#2b313c] bg-[#12161d] px-2.5 py-1.5 text-[10px] text-slate-300 leading-relaxed"
      >
        {analysis.diagnosticSummary}
      </div>
    </section>
  );
});
