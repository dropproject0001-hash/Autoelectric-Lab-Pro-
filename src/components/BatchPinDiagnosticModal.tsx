/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  X,
  Play,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ArrowRight,
  Zap,
  CheckSquare,
  Square,
  Cable,
  Activity,
} from 'lucide-react';
import {
  BenchComponent,
  EcuPin,
  InjectedFault,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import {
  evaluateBulkPinContinuity,
  type BulkPinContinuityResult,
  type PinContinuityStatus,
} from '../utils/circuitSolver';

type LabTab =
  | 'BENCH_LAB'
  | 'WIRING_DIAGRAM'
  | 'THREE_D_TWIN'
  | 'ECU_PINOUT'
  | 'OSCILLOSCOPE'
  | 'PCB_SCANNER'
  | 'REPAIR_GUIDE';

export type BatchPinTestMode = 'CONTINUITY' | 'VOLTAGE';

interface BatchPinResult {
  pinId: string;
  pinNumber: number;
  label: string;
  category: string;
  measuredVoltage: number;
  expectedMin: number;
  expectedMax: number;
  status: 'NOMINAL' | 'DEVIATION' | 'PENDING' | 'SKIPPED';
  message: string;
  continuity?: BulkPinContinuityResult;
}

interface BatchPinDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  pins: EcuPin[];
  nodeVoltages: Record<string, number>;
  powerSupply: PowerSupplyState;
  onSelectPin: (pinId: string) => void;
  onNavigateTab: (tab: LabTab, pinId?: string) => void;
  wires?: WireConnection[];
  components?: BenchComponent[];
  faults?: InjectedFault[];
  selectedPinId?: string | null;
  selectedPinIds?: string[];
  onChangeSelectedPinIds?: (pinIds: string[]) => void;
  initialMode?: BatchPinTestMode;
  autoRunOnOpen?: boolean;
  autoRunNonce?: number;
  onAttachContinuityProbe?: (pinId: string, label: string) => void;
}

const EMPTY_WIRES: WireConnection[] = [];
const EMPTY_COMPONENTS: BenchComponent[] = [];
const EMPTY_FAULTS: InjectedFault[] = [];

function getContinuityBadgeMeta(status: PinContinuityStatus): {
  label: string;
  className: string;
  isError: boolean;
} {
  switch (status) {
    case 'CLOSED_CONTINUITY':
      return {
        label: 'CLOSED OK',
        className: 'text-emerald-400 bg-[#0b1a12] border-emerald-700/70',
        isError: false,
      };
    case 'HIGH_RESISTANCE':
      return {
        label: 'HIGH Ω',
        className: 'text-amber-300 bg-amber-950/60 border-amber-600/80',
        isError: true,
      };
    case 'OPEN_CIRCUIT':
      return {
        label: 'OPEN O.L',
        className: 'text-rose-400 bg-rose-950/70 border-rose-700',
        isError: true,
      };
    case 'SHORT_FAULT':
      return {
        label: 'SHORT FAULT',
        className: 'text-rose-300 bg-rose-950/85 border-rose-500',
        isError: true,
      };
    default:
      return {
        label: 'SKIPPED',
        className: 'text-slate-500 bg-[#151920] border-[#2b313c]',
        isError: false,
      };
  }
}

export const BatchPinDiagnosticModal: React.FC<BatchPinDiagnosticModalProps> = ({
  isOpen,
  onClose,
  pins,
  nodeVoltages,
  powerSupply,
  onSelectPin,
  onNavigateTab,
  wires = EMPTY_WIRES,
  components = EMPTY_COMPONENTS,
  faults = EMPTY_FAULTS,
  selectedPinId = null,
  selectedPinIds: controlledSelectedPinIds,
  onChangeSelectedPinIds,
  initialMode = 'VOLTAGE',
  autoRunOnOpen = false,
  autoRunNonce = 0,
  onAttachContinuityProbe,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [testMode, setTestMode] = useState<BatchPinTestMode>(initialMode);
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>(() =>
    pins.map((p) => p.id)
  );
  const activeSelectedIds = controlledSelectedPinIds ?? internalSelectedIds;
  const setSelectedIds = useCallback(
    (updater: string[] | ((prev: string[]) => string[])) => {
      if (onChangeSelectedPinIds) {
        const next =
          typeof updater === 'function' ? updater(activeSelectedIds) : updater;
        onChangeSelectedPinIds(next);
      } else {
        setInternalSelectedIds(updater);
      }
    },
    [onChangeSelectedPinIds, activeSelectedIds]
  );

  const selectedSet = useMemo(() => new Set(activeSelectedIds), [activeSelectedIds]);

  const [isRunning, setIsRunning] = useState(false);
  const [scanQueue, setScanQueue] = useState<number[]>([]);
  const [scanCursor, setScanCursor] = useState(-1);
  const [results, setResults] = useState<BatchPinResult[]>([]);

  const nodeVoltagesRef = useRef(nodeVoltages);
  nodeVoltagesRef.current = nodeVoltages;
  const powerSupplyRef = useRef(powerSupply);
  powerSupplyRef.current = powerSupply;
  const wiresRef = useRef(wires);
  wiresRef.current = wires;
  const componentsRef = useRef(components);
  componentsRef.current = components;
  const faultsRef = useRef(faults);
  faultsRef.current = faults;

  const buildPendingRows = useCallback(
    (mode: BatchPinTestMode, selSet: Set<string>): BatchPinResult[] => {
      return pins.map((p) => {
        let expectedMin = 0;
        let expectedMax = 5;
        const label = p.label.toUpperCase();

        if (p.category === 'ground' || p.nominalVoltage === 0) {
          expectedMin = -0.2;
          expectedMax = 0.5;
        } else if (p.category === 'power' || p.nominalVoltage >= 11.0) {
          expectedMin = 10.5;
          expectedMax = 14.5;
        } else if (p.category === 'reference' || Math.abs(p.nominalVoltage - 5.0) < 0.25) {
          expectedMin = 4.75;
          expectedMax = 5.25;
        } else if (label.includes('CAN_H')) {
          expectedMin = 2.2;
          expectedMax = 3.8;
        } else if (label.includes('CAN_L')) {
          expectedMin = 1.2;
          expectedMax = 2.8;
        } else {
          expectedMin = 0.15;
          expectedMax = 4.85;
        }

        const isPinSelected = selSet.has(p.id);
        const volts = nodeVoltagesRef.current[p.id] ?? 0;
        return {
          pinId: p.id,
          pinNumber: p.pinNumber,
          label: p.label,
          category: p.category,
          measuredVoltage: volts,
          expectedMin,
          expectedMax,
          status: isPinSelected ? 'PENDING' : 'SKIPPED',
          message: !isPinSelected
            ? 'Unselected — excluded from batch test'
            : mode === 'CONTINUITY'
              ? 'Ready for electrical continuity check'
              : 'Awaiting batch execution',
        };
      });
    },
    [pins]
  );

  const continuityReportRef = useRef<ReturnType<typeof evaluateBulkPinContinuity> | null>(
    null
  );

  const triggerBatchRun = useCallback(
    (modeOverride?: BatchPinTestMode, customSelectedIds?: string[]) => {
      const modeToRun = modeOverride ?? testMode;
      const idsToRun = customSelectedIds ?? activeSelectedIds;
      const nextSet = new Set(idsToRun);

      if (modeToRun === 'CONTINUITY') {
        continuityReportRef.current = evaluateBulkPinContinuity(
          powerSupplyRef.current,
          pins,
          faultsRef.current,
          wiresRef.current,
          componentsRef.current,
          idsToRun
        );
      } else {
        continuityReportRef.current = null;
      }

      const indicesToRun: number[] = [];
      pins.forEach((p, idx) => {
        if (nextSet.has(p.id)) indicesToRun.push(idx);
      });

      setResults(buildPendingRows(modeToRun, nextSet));
      if (indicesToRun.length === 0) {
        setIsRunning(false);
        setScanQueue([]);
        setScanCursor(-1);
        return;
      }

      setScanQueue(indicesToRun);
      setScanCursor(0);
      setIsRunning(true);
    },
    [testMode, activeSelectedIds, pins, buildPendingRows]
  );

  // Reset / initialize when modal opens or autoRunNonce fires
  const lastHandledNonceRef = useRef<number>(-1);
  useEffect(() => {
    if (!isOpen) return;

    const effectiveIds =
      controlledSelectedPinIds !== undefined
        ? controlledSelectedPinIds
        : internalSelectedIds.length > 0
          ? internalSelectedIds
          : pins.map((p) => p.id);

    if (controlledSelectedPinIds === undefined && internalSelectedIds.length === 0) {
      setInternalSelectedIds(effectiveIds);
    }

    setTestMode(initialMode);

    const shouldAutoRun =
      autoRunOnOpen &&
      (autoRunNonce !== lastHandledNonceRef.current || autoRunNonce === 0) &&
      effectiveIds.length > 0;

    if (shouldAutoRun) {
      lastHandledNonceRef.current = autoRunNonce;
      triggerBatchRun(initialMode, effectiveIds);
    } else {
      setResults(buildPendingRows(initialMode, new Set(effectiveIds)));
      setIsRunning(false);
      setScanQueue([]);
      setScanCursor(-1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialMode, autoRunOnOpen, autoRunNonce]);

  // Sequential MNA step sweep across all selected ECU pins
  useEffect(() => {
    if (!isRunning || scanCursor < 0 || scanCursor >= scanQueue.length) {
      if (isRunning && scanCursor >= scanQueue.length) {
        setIsRunning(false);
        setScanCursor(-1);
      }
      return;
    }

    const pinIndex = scanQueue[scanCursor];
    const timer = setTimeout(() => {
      const pin = pins[pinIndex];
      if (!pin) {
        setScanCursor((prev) => prev + 1);
        return;
      }

      const volts = nodeVoltagesRef.current[pin.id] ?? 0;

      setResults((prev) => {
        const updated = [...prev];
        const item = updated[pinIndex];
        if (!item) return prev;

        if (testMode === 'CONTINUITY') {
          const cRes = continuityReportRef.current?.results.find(
            (r) => r.pinId === pin.id
          );
          const cStatus = cRes?.status ?? 'OPEN_CIRCUIT';
          const isPass = cStatus === 'CLOSED_CONTINUITY';
          updated[pinIndex] = {
            ...item,
            measuredVoltage: volts,
            status:
              cStatus === 'SKIPPED'
                ? 'SKIPPED'
                : isPass
                  ? 'NOMINAL'
                  : 'DEVIATION',
            message: cRes?.message ?? item.message,
            continuity: cRes,
          };
        } else {
          const isNominal = volts >= item.expectedMin && volts <= item.expectedMax;
          updated[pinIndex] = {
            ...item,
            measuredVoltage: volts,
            status: isNominal ? 'NOMINAL' : 'DEVIATION',
            message: isNominal
              ? `Within nominal spec (${item.expectedMin}V - ${item.expectedMax}V)`
              : `Threshold deviation detected! Measured ${volts.toFixed(2)}V (Expected ${item.expectedMin}V - ${item.expectedMax}V)`,
          };
        }
        return updated;
      });

      setScanCursor((prev) => prev + 1);
    }, testMode === 'CONTINUITY' ? 75 : 110);

    return () => clearTimeout(timer);
  }, [isRunning, scanCursor, scanQueue, pins, testMode]);

  const togglePinSelection = (pinId: string) => {
    if (isRunning) return;
    const exists = selectedSet.has(pinId);
    const nextIds = exists
      ? activeSelectedIds.filter((id) => id !== pinId)
      : [...activeSelectedIds, pinId];
    setSelectedIds(nextIds);
    const nextSet = new Set(nextIds);
    setResults((prev) =>
      prev.map((row) => {
        if (row.pinId !== pinId) return row;
        return nextSet.has(pinId)
          ? {
              ...row,
              status: 'PENDING',
              continuity: undefined,
              message:
                testMode === 'CONTINUITY'
                  ? 'Selected — ready for electrical continuity check'
                  : 'Selected — awaiting batch execution',
            }
          : {
              ...row,
              status: 'SKIPPED',
              continuity: undefined,
              message: 'Unselected — excluded from batch test',
            };
      })
    );
  };

  const applySelectionPreset = (presetIds: string[]) => {
    if (isRunning) return;
    setSelectedIds(presetIds);
    setResults(buildPendingRows(testMode, new Set(presetIds)));
  };

  const handleSwitchMode = (nextMode: BatchPinTestMode) => {
    if (isRunning || nextMode === testMode) return;
    setTestMode(nextMode);
    setResults(buildPendingRows(nextMode, selectedSet));
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const targetedCount = activeSelectedIds.length;
  const completedCount = results.filter(
    (r) => r.status === 'NOMINAL' || r.status === 'DEVIATION'
  ).length;
  const deviationCount = results.filter((r) => r.status === 'DEVIATION').length;
  const progressPercent =
    targetedCount > 0 ? Math.round((completedCount / targetedCount) * 100) : 0;

  const currentPinIndex =
    isRunning && scanCursor >= 0 && scanCursor < scanQueue.length
      ? scanQueue[scanCursor]
      : -1;
  const currentScanningPin =
    currentPinIndex >= 0 ? pins[currentPinIndex] : undefined;

  const activeFocusedPin = selectedPinId
    ? pins.find((p) => p.id === selectedPinId)
    : undefined;

  const isPowerLive = Boolean(
    powerSupply.isOutputEnabled && powerSupply.voltageSetting > 0.4
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ECU Pinout Batch Diagnostic & Continuity Run"
      className="fixed inset-0 z-[80] flex items-center justify-center p-2.5 sm:p-6 bg-black/80 backdrop-blur-[2px]"
    >
      <div className="relative w-full max-w-3xl max-h-[92dvh] sm:h-[88dvh] flex flex-col hud-panel rounded-xl border-[#203653] shadow-2xl overflow-hidden font-mono text-slate-100">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 sm:px-5 py-3 hud-header shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-[210px]">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg hw-lcd-well border-[#203653] flex items-center justify-center shrink-0">
              {testMode === 'CONTINUITY' ? (
                <Cable className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
              ) : (
                <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-hud font-bold text-slate-100 tracking-wide uppercase truncate">
                {testMode === 'CONTINUITY'
                  ? 'Batch Pin Continuity Check'
                  : 'ECU Pinout Batch Diagnostic Run'}
              </h2>
              <p className="text-[10.5px] sm:text-[11px] text-slate-400 font-sans mt-0.5 truncate">
                {testMode === 'CONTINUITY'
                  ? `Bulk MNA resistance & short-circuit check across ${targetedCount}/${pins.length} selected ECU pins`
                  : `Automated MNA voltage threshold check across ${targetedCount}/${pins.length} selected ECU pins`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {!isRunning && (
              <button
                type="button"
                disabled={targetedCount === 0}
                onClick={() => triggerBatchRun(testMode)}
                data-testid="start-batch-pin-run-btn"
                className={`hw-btn ${
                  testMode === 'CONTINUITY' ? 'hw-btn-green' : 'hw-btn-amber'
                } px-3 sm:px-3.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 whitespace-nowrap transition ${
                  targetedCount === 0
                    ? 'opacity-45 cursor-not-allowed'
                    : 'cursor-pointer'
                }`}
              >
                <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                <span>
                  {testMode === 'CONTINUITY'
                    ? completedCount > 0
                      ? 'Rerun Continuity'
                      : 'Run Continuity Check'
                    : completedCount > 0
                      ? 'Rerun Batch'
                      : 'Start Batch Run'}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Batch Pin Diagnostics"
              className="hw-btn p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer transition"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mode Switch + Pin Selection Controls */}
        <div className="px-3.5 sm:px-5 py-2.5 bg-[#0e141f] border-b border-[#203653] flex flex-col gap-2 text-[11px] shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Test Mode Tabs */}
            <div
              role="tablist"
              aria-label="Batch pin test mode"
              className="inline-flex rounded-lg border border-[#203653] bg-[#080d16] p-0.5 gap-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={testMode === 'CONTINUITY'}
                disabled={isRunning}
                onClick={() => handleSwitchMode('CONTINUITY')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  testMode === 'CONTINUITY'
                    ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/60'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Cable className="w-3.5 h-3.5 shrink-0" />
                <span>Continuity (Ω)</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={testMode === 'VOLTAGE'}
                disabled={isRunning}
                onClick={() => handleSwitchMode('VOLTAGE')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  testMode === 'VOLTAGE'
                    ? 'bg-amber-950/80 text-amber-300 border border-amber-500/60'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Zap className="w-3.5 h-3.5 shrink-0" />
                <span>Voltage (V DC)</span>
              </button>
            </div>

            {/* Pin Selection Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider mr-0.5">
                Selected:{' '}
                <strong className="text-[#19C8F5] tabular-nums">
                  {targetedCount}/{pins.length}
                </strong>
              </span>
              <motion.button
                type="button"
                disabled={isRunning}
                whileHover={shouldReduceMotion || isRunning ? undefined : { y: -1 }}
                whileTap={shouldReduceMotion || isRunning ? undefined : { scale: 0.95 }}
                onClick={() => applySelectionPreset(pins.map((p) => p.id))}
                className="hw-btn px-2 py-0.5 rounded text-[10px] text-slate-200 hover:text-white hover:border-[#19C8F5]/60 transition-colors cursor-pointer"
              >
                All ({pins.length})
              </motion.button>
              {activeFocusedPin && (
                <motion.button
                  type="button"
                  disabled={isRunning}
                  whileHover={shouldReduceMotion || isRunning ? undefined : { y: -1 }}
                  whileTap={shouldReduceMotion || isRunning ? undefined : { scale: 0.95 }}
                  onClick={() => applySelectionPreset([activeFocusedPin.id])}
                  className="hw-btn px-2 py-0.5 rounded text-[10px] text-cyan-300 hover:text-white hover:border-[#19C8F5]/60 transition-colors cursor-pointer"
                >
                  Active (#{activeFocusedPin.pinNumber})
                </motion.button>
              )}
              <motion.button
                type="button"
                disabled={isRunning}
                whileHover={shouldReduceMotion || isRunning ? undefined : { y: -1 }}
                whileTap={shouldReduceMotion || isRunning ? undefined : { scale: 0.95 }}
                onClick={() =>
                  applySelectionPreset(
                    pins
                      .filter(
                        (p) =>
                          p.category === 'power' ||
                          p.category === 'ground' ||
                          p.category === 'reference'
                      )
                      .map((p) => p.id)
                  )
                }
                className="hw-btn px-2 py-0.5 rounded text-[10px] text-amber-300 hover:text-white hover:border-amber-400/60 transition-colors cursor-pointer"
              >
                Power/GND
              </motion.button>
              <motion.button
                type="button"
                disabled={isRunning}
                whileHover={shouldReduceMotion || isRunning ? undefined : { y: -1 }}
                whileTap={shouldReduceMotion || isRunning ? undefined : { scale: 0.95 }}
                onClick={() => applySelectionPreset([])}
                className="hw-btn px-2 py-0.5 rounded text-[10px] text-slate-400 hover:text-slate-200 hover:border-slate-500/60 transition-colors cursor-pointer"
              >
                Clear
              </motion.button>
            </div>
          </div>
        </div>

        {/* Progress & Summary Bar */}
        <div className="px-3.5 sm:px-5 py-2.5 bg-[#12161d] border-b border-[#2b313c] flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-4 flex-wrap">
            <span>
              STATUS:{' '}
              <strong
                className={
                  isRunning
                    ? 'text-amber-400 animate-pulse'
                    : targetedCount > 0 && completedCount === targetedCount
                      ? 'text-emerald-400'
                      : 'text-slate-300'
                }
              >
                {isRunning && currentScanningPin
                  ? `Testing Pin #${currentScanningPin.pinNumber} (${currentScanningPin.label})...`
                  : targetedCount === 0
                    ? 'Select at least 1 ECU pin'
                    : completedCount === targetedCount
                      ? testMode === 'CONTINUITY'
                        ? 'Continuity Sweep Complete'
                        : 'Batch Scan Complete'
                      : 'Ready to Run'}
              </strong>
            </span>
            <span>
              {testMode === 'CONTINUITY' ? 'FAULTS:' : 'DEVIATIONS:'}{' '}
              <strong
                className={
                  deviationCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                }
              >
                {deviationCount} Flagged
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-48">
            <div className="hw-lcd-well flex-1 h-2 rounded-[2px] overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  testMode === 'CONTINUITY' ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 tabular-nums">
              {progressPercent}%
            </span>
          </div>
        </div>

        {/* Results Table */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 bg-[#0c0e12] flex flex-col gap-2">
          {testMode === 'CONTINUITY' && isPowerLive && (
            <div className="p-3 rounded-lg bg-[#1c1507] border border-amber-600/60 text-amber-200 text-xs flex items-start gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Bench DC Supply is energized (+{powerSupply.voltageSetting.toFixed(1)}V).
                MNA isolated the power rail safely to verify passive harness continuity, but on a physical vehicle ECU always switch KL30/KL15 OFF before probing Ω/Continuity.
              </span>
            </div>
          )}

          {testMode === 'VOLTAGE' && !powerSupply.isOutputEnabled && (
            <div className="p-3 rounded-lg bg-[#1c1507] border border-amber-600/60 text-amber-200 text-xs flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Bench DC Power Supply is currently OFF. Most powered pins will register 0V until power is enabled.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2">
            {results.map((res, idx) => {
              const isCurrent = isRunning && currentPinIndex === idx;
              const isPinChecked = selectedSet.has(res.pinId);
              const isFocusedPin = selectedPinId === res.pinId;
              const contBadge = res.continuity
                ? getContinuityBadgeMeta(res.continuity.status)
                : null;

              return (
                <motion.div
                  key={res.pinId}
                  initial={false}
                  animate={{
                    opacity: isPinChecked ? 1 : 0.62,
                    scale: isCurrent && !shouldReduceMotion ? 1.01 : 1,
                  }}
                  whileHover={
                    shouldReduceMotion || isRunning
                      ? undefined
                      : {
                          x: 3,
                          scale: 1.005,
                        }
                  }
                  transition={
                    shouldReduceMotion
                      ? { duration: 0.01 }
                      : {
                          type: 'spring',
                          stiffness: 420,
                          damping: 30,
                          mass: 0.65,
                        }
                  }
                  className={`group relative overflow-hidden p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors duration-200 will-change-transform ${
                    isCurrent
                      ? 'bg-[#101c16] border-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.22)]'
                      : !isPinChecked
                        ? 'bg-[#0b0e14] border-[#1b2230] hover:border-[#2e4363] hover:bg-[#0f1623]'
                        : res.status === 'DEVIATION'
                          ? 'bg-rose-950/30 border-rose-800/80 hover:border-rose-500/80'
                          : res.status === 'NOMINAL'
                            ? 'bg-[#151920] border-[#2b313c] hover:border-[#19C8F5]/60 hover:bg-[#172234]/85 hover:shadow-[0_0_16px_rgba(25,200,245,0.1)]'
                            : 'bg-[#101318] border-[#243247] hover:border-[#19C8F5]/65 hover:bg-[#142033]/90 hover:shadow-[0_0_16px_rgba(25,200,245,0.12)]'
                  }`}
                >
                  {/* Animated left selection rail */}
                  <motion.span
                    aria-hidden="true"
                    initial={false}
                    animate={{
                      opacity: isPinChecked ? 1 : 0.12,
                      scaleY: isPinChecked ? 1 : 0.3,
                    }}
                    transition={
                      shouldReduceMotion
                        ? { duration: 0.01 }
                        : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
                    }
                    className={`pointer-events-none absolute inset-y-1.5 left-0 w-[3px] rounded-r-full origin-center ${
                      res.status === 'DEVIATION'
                        ? 'bg-rose-400'
                        : testMode === 'CONTINUITY'
                          ? 'bg-emerald-400'
                          : 'bg-[#19C8F5]'
                    }`}
                  />

                  <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                    <motion.button
                      type="button"
                      disabled={isRunning}
                      whileHover={shouldReduceMotion || isRunning ? undefined : { scale: 1.14 }}
                      whileTap={shouldReduceMotion || isRunning ? undefined : { scale: 0.85 }}
                      onClick={() => togglePinSelection(res.pinId)}
                      aria-label={`${isPinChecked ? 'Deselect' : 'Select'} Pin #${res.pinNumber} ${res.label} for batch test`}
                      aria-pressed={isPinChecked}
                      className="mt-0.5 sm:mt-0 text-[#19C8F5] hover:text-white cursor-pointer shrink-0 disabled:opacity-50"
                      title={
                        isPinChecked
                          ? 'Include in Batch Pin Test (click to exclude)'
                          : 'Excluded (click to include)'
                      }
                    >
                      <motion.span
                        key={isPinChecked ? 'checked' : 'unchecked'}
                        initial={
                          shouldReduceMotion ? false : { scale: 0.72, opacity: 0.4 }
                        }
                        animate={{ scale: 1, opacity: 1 }}
                        transition={
                          shouldReduceMotion
                            ? { duration: 0.01 }
                            : { type: 'spring', stiffness: 520, damping: 24 }
                        }
                        className="inline-flex items-center justify-center"
                      >
                        {isPinChecked ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.45)]" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                        )}
                      </motion.span>
                    </motion.button>

                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => togglePinSelection(res.pinId)}
                      className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer disabled:cursor-default"
                    >
                      <div
                        className={`hw-lcd-well w-8 h-8 rounded-[4px] flex items-center justify-center font-bold text-xs shrink-0 transition-colors duration-200 ${
                          isPinChecked
                            ? 'text-amber-300 group-hover:border-[#19C8F5]/60'
                            : 'text-slate-500'
                        }`}
                      >
                        #{res.pinNumber}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs text-slate-100 group-hover:text-white transition-colors truncate">
                            {res.label}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1d222b] border border-[#2b313c] text-slate-300">
                            {res.category}
                          </span>
                          {isFocusedPin && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 font-bold">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <p className="text-[10.5px] text-slate-400 font-sans mt-0.5 line-clamp-2">
                          {res.message}
                        </p>
                      </div>
                    </button>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end pl-6 sm:pl-0">
                    {testMode === 'CONTINUITY' ? (
                      <div className="text-right tabular-nums">
                        <div
                          className={`text-xs font-bold ${
                            res.continuity
                              ? res.continuity.status === 'CLOSED_CONTINUITY'
                                ? 'text-emerald-300'
                                : 'text-rose-300'
                              : 'text-slate-500'
                          }`}
                        >
                          {res.continuity
                            ? res.continuity.displayOhms
                            : res.status === 'SKIPPED'
                              ? 'SKIPPED'
                              : '--- Ω'}
                        </div>
                        <div className="text-[9px] text-slate-500">
                          {res.continuity
                            ? `Spec ≤ ${res.continuity.expectedMaxOhms >= 1000 ? `${(res.continuity.expectedMaxOhms / 1000).toFixed(0)}kΩ` : `${res.continuity.expectedMaxOhms}Ω`}`
                            : 'MNA Continuity'}
                        </div>
                      </div>
                    ) : (
                      <div className="text-right tabular-nums">
                        <div className="text-xs font-bold text-amber-300">
                          {res.status === 'PENDING'
                            ? '--- V'
                            : res.status === 'SKIPPED'
                              ? 'SKIPPED'
                              : `${res.measuredVoltage.toFixed(2)} V`}
                        </div>
                        <div className="text-[9px] text-slate-500">
                          Spec: {res.expectedMin}V - {res.expectedMax}V
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      {testMode === 'CONTINUITY' && contBadge ? (
                        <span
                          className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded border ${contBadge.className}`}
                        >
                          {contBadge.isError ? (
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>{contBadge.label}</span>
                        </span>
                      ) : (
                        <>
                          {res.status === 'NOMINAL' && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-[#0b1a12] px-2 py-1 rounded border border-emerald-700/70">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>NOMINAL</span>
                            </span>
                          )}
                          {res.status === 'DEVIATION' && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-950/70 px-2 py-1 rounded border border-rose-700">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>DEVIATION</span>
                            </span>
                          )}
                          {res.status === 'PENDING' && (
                            <span className="text-[10px] text-slate-500 bg-[#151920] border border-[#2b313c] px-2 py-1 rounded">
                              PENDING
                            </span>
                          )}
                          {res.status === 'SKIPPED' && (
                            <span className="text-[10px] text-slate-500 bg-[#10141c] border border-[#202938] px-2 py-1 rounded">
                              SKIPPED
                            </span>
                          )}
                        </>
                      )}

                      {onAttachContinuityProbe && (
                        <button
                          type="button"
                          onClick={() => {
                            onAttachContinuityProbe(
                              res.pinId,
                              `${res.label} (Pin ${res.pinNumber})`
                            );
                            onSelectPin(res.pinId);
                            onClose();
                          }}
                          className="hw-btn p-1.5 rounded text-emerald-300 hover:text-white cursor-pointer transition"
                          title="Attach DMM Red Probe in Continuity Mode"
                          aria-label={`Probe Pin #${res.pinNumber} continuity on bench`}
                        >
                          <Activity className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          onSelectPin(res.pinId);
                          onNavigateTab('ECU_PINOUT', res.pinId);
                          onClose();
                        }}
                        className="hw-btn p-1.5 rounded text-slate-300 hover:text-white cursor-pointer transition"
                        title="Inspect pin in Pinout Library"
                        aria-label={`Inspect Pin #${res.pinNumber} in Pinout Library`}
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-3.5 sm:px-5 py-3 bg-[#12161d] border-t border-[#203653] flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <span className="text-slate-400 text-[11px]">
            {testMode === 'CONTINUITY'
              ? 'Verifies passive MNA harness path resistance (Ω), cut wires, open pins, and GND/+12V shorts.'
              : 'Deviations automatically highlight wiring faults, open circuits, or shorted sensors.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="hw-btn px-4 py-1.5 rounded-lg text-slate-200 font-bold cursor-pointer transition ml-auto"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
