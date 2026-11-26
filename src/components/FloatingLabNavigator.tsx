/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Globe,
  Headphones,
  Layers,
  Mic,
  MicOff,
  Move,
  RotateCcw,
  Send,
  ShieldAlert,
  Volume2,
  X,
} from 'lucide-react';
import { SavedBenchSession, SavedDiagnosticLog } from '../services/benchStorageService';
import { LiveBenchContext, OfflineDiagnosticChatbot } from '../services/offlineChatbotEngine';
import {
  authorizeVoiceMacroSteps,
  evaluateVoiceCommandSafetyAndRisk,
  offlineVoiceAssistant,
  VoiceAssistantState,
  VoiceCommandLogSource,
  VoiceResultMetadata,
} from '../services/offlineVoiceService';
import {
  processVoiceCoachTurn,
  type StructuredDiagnosticSections,
  type VoiceKnowledgeProvenance,
} from '../services/ai/localVoiceBrain';
import type { BenchTelemetry, BilingualLang } from '../types/aiAssistant';
import {
  EcuPin,
  FaultType,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import { CircuitSolution } from '../utils/circuitSolver';
import { RpmEmulatorState, SelectedVehicleContext } from '../utils/vehicleEcuRegistry';
import {
  executeMacroSequence,
  parseAndExecuteVoiceCommand,
  ScenarioVoiceCallbackResult,
  VoiceCommandActions,
} from '../utils/voiceCommandParser';
import { evaluateWorkflowSteps } from '../utils/diagnosticWorkflow';
import { buildBenchTelemetry } from '../hooks/useBenchContext';
import {
  BenchReconciliationSnapshot,
  createBenchReconciliationSnapshot,
  diffBenchReconciliationSnapshots,
} from '../utils/benchStateReconciliation';
import { voiceMacroService } from '../services/voiceMacroService';
import { LabTab, MobileBenchPane } from './LabTopNav';
import { LabDrawerIcon } from './icons/LabDrawerIcons';

export type FloatingOpacityLevel = 0.25 | 0.5 | 0.75 | 1;

export const FLOATING_OPACITY_LEVELS: readonly FloatingOpacityLevel[] = [0.25, 0.5, 0.75, 1];

const PANE_LABELS: Record<MobileBenchPane, string> = {
  INSTRUMENTS: 'Instruments',
  CANVAS: 'Canvas',
  GUIDE: 'Guide',
};

export interface FloatingLabNavigatorProps {
  /** Measured `<main>` workspace dimensions from `ResizeObserver`. */
  containerSize: { width: number; height: number };
  activeTab: LabTab;
  mobileBenchPane: MobileBenchPane;
  paneOrder: MobileBenchPane[];
  isContainerMoveMode: boolean;
  onToggleContainerMoveMode: () => void;
  onMovePane: (pane: MobileBenchPane, direction: 'prev' | 'next') => void;
  onResetPaneOrder: () => void;
  onSelectMobilePane: (pane: MobileBenchPane) => void;
  onNavigateTab: (tab: LabTab) => void;
  powerSupply: PowerSupplyState;
  onChangePowerSupply: React.Dispatch<React.SetStateAction<PowerSupplyState>>;
  multimeter: MultimeterState;
  onChangeMultimeter?: React.Dispatch<React.SetStateAction<MultimeterState>>;
  onSetManualRangeLabel?: (label: string | null) => void;
  pins: EcuPin[];
  wires: WireConnection[];
  onAddWire?: (sourcePinId: string, targetPinId: string, color?: string, label?: string) => void;
  onToggleCutWire?: (wireId: string) => void;
  onDeleteWire?: (wireId: string) => void;
  faults: InjectedFault[];
  onAddFault?: (pinId: string, faultType: FaultType, description: string) => void;
  onRemoveFault?: (pinId: string) => void;
  onChangeRpmEmulator?: React.Dispatch<React.SetStateAction<RpmEmulatorState>>;
  circuitSolution: CircuitSolution;
  selectedPinId: string | null;
  onAttachProbe: (color: 'red' | 'black', pinId: string, label: string) => void;
  onClearAllFaults: () => void;
  onResetLab?: () => void;
  savedSessions: SavedBenchSession[];
  savedLogs: SavedDiagnosticLog[];
  vehicleContext?: SelectedVehicleContext;
  /** Controlled offline AI voice navigator enabled state managed by LabWorkspaceLayout. */
  voiceNavEnabled?: boolean;
  /** Controlled updater for offline AI voice navigator enabled state. */
  onVoiceNavEnabledChange?: (next: boolean) => void;
  /** Controlled opacity level (kept for backward API compatibility). */
  dockOpacity?: FloatingOpacityLevel;
  /** Controlled updater for opacity level. */
  onDockOpacityChange?: (next: FloatingOpacityLevel) => void;
  /** Visual voice command log sidebar open state. */
  isVoiceLogOpen?: boolean;
  /** Toggle visual voice command log sidebar. */
  onToggleVoiceLog?: () => void;
  /** Open visual voice command log sidebar automatically when SpeechRecognition runs. */
  onOpenVoiceLog?: () => void;
  /** Open the Macros builder/runner tab inside the voice sidebar. */
  onOpenVoiceMacros?: () => void;
  /** Open the dedicated Voice Macro Library & live action recorder modal. */
  onOpenVoiceMacroLibrary?: () => void;
  /** Switch right panel to the Pre-Bench Diagnostic Workflow checklist. */
  onOpenDiagnosticWorkflow?: () => void;
  /** Switch right panel to the Automated Multi-Pin Logic Check monitor. */
  onOpenLogicCheck?: () => void;
  /** Checked Diagnostic Workflow step IDs for voice check-off commands. */
  checkedWorkflowIds?: string[];
  /** State setter for checked Diagnostic Workflow step IDs. */
  onChangeCheckedWorkflowIds?: React.Dispatch<React.SetStateAction<string[]>>;
  /** Mutable ref allowing sibling VoiceCommandLogSidebar to replay or run commands against live MNA state. */
  commandExecutorRef?: React.MutableRefObject<
    ((rawQuery: string, source?: VoiceCommandLogSource, meta?: VoiceResultMetadata) => void) | null
  >;
  /** Docked Pin Scope toggle state & handler. */
  showPinScopeButton?: boolean;
  isPinScopeOpen?: boolean;
  onTogglePinScope?: () => void;
  pinScopeSummary?: string;
  /** Trouble Scenarios Lookup & Step-by-Step Voice Coach callbacks */
  onOpenTroubleLookup?: (query?: string) => ScenarioVoiceCallbackResult | void;
  onEmulateTroubleScenario?: (phId?: string) => ScenarioVoiceCallbackResult | void;
  onNextScenarioStep?: () => ScenarioVoiceCallbackResult | void;
  onPrevScenarioStep?: () => ScenarioVoiceCallbackResult | void;
  onRepeatScenarioStep?: (stepNumber?: number) => ScenarioVoiceCallbackResult | void;
  onVerifyScenarioStep?: () => ScenarioVoiceCallbackResult | void;
  onCompleteScenarioStep?: (stepNumber?: number) => ScenarioVoiceCallbackResult | void;
  onProbeScenarioFocusPin?: () => ScenarioVoiceCallbackResult | void;
  /** Unified AI Coach drawer toggle & open state. */
  isAiCoachOpen?: boolean;
  onOpenAiCoach?: () => void;
}

export const FloatingLabNavigator: React.FC<FloatingLabNavigatorProps> = ({
  activeTab,
  mobileBenchPane,
  paneOrder,
  isContainerMoveMode,
  onToggleContainerMoveMode,
  onMovePane,
  onResetPaneOrder,
  onSelectMobilePane,
  onNavigateTab,
  powerSupply,
  onChangePowerSupply,
  multimeter,
  onChangeMultimeter,
  onSetManualRangeLabel,
  pins,
  wires,
  onAddWire,
  onToggleCutWire,
  onDeleteWire,
  faults,
  onAddFault,
  onRemoveFault,
  onChangeRpmEmulator,
  circuitSolution,
  selectedPinId,
  onAttachProbe,
  onClearAllFaults,
  onResetLab,
  savedSessions,
  savedLogs,
  vehicleContext,
  voiceNavEnabled: controlledVoiceNavEnabled,
  onVoiceNavEnabledChange,
  isVoiceLogOpen,
  onToggleVoiceLog,
  onOpenVoiceLog,
  onOpenVoiceMacros,
  onOpenVoiceMacroLibrary,
  onOpenDiagnosticWorkflow,
  onOpenLogicCheck,
  checkedWorkflowIds,
  onChangeCheckedWorkflowIds,
  commandExecutorRef,
  showPinScopeButton = false,
  isPinScopeOpen = false,
  onTogglePinScope,
  pinScopeSummary,
  onOpenTroubleLookup,
  onEmulateTroubleScenario,
  onNextScenarioStep,
  onPrevScenarioStep,
  onRepeatScenarioStep,
  onVerifyScenarioStep,
  onCompleteScenarioStep,
  onProbeScenarioFocusPin,
  isAiCoachOpen = false,
  onOpenAiCoach,
}) => {
  const [internalVoiceNavEnabled, setInternalVoiceNavEnabled] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const dockRef = useRef<HTMLDivElement>(null);

  const voiceNavEnabled = controlledVoiceNavEnabled ?? internalVoiceNavEnabled;

  const setVoiceNavEnabled = useCallback(
    (updater: boolean | ((prev: boolean) => boolean)) => {
      const next =
        typeof updater === 'function' ? updater(voiceNavEnabled) : updater;
      if (onVoiceNavEnabledChange) {
        onVoiceNavEnabledChange(next);
      } else {
        setInternalVoiceNavEnabled(next);
      }
    },
    [onVoiceNavEnabledChange, voiceNavEnabled]
  );

  const [voiceResult, setVoiceResult] = useState<{
    title: string;
    detail: string;
    timestamp: number;
    provenance?: VoiceKnowledgeProvenance;
    structuredDiagnostic?: StructuredDiagnosticSections;
    isSafetyAlert?: boolean;
  } | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceAssistantState>(() =>
    offlineVoiceAssistant.getState()
  );

  const botEngine = useMemo(() => {
    if (!voiceNavEnabled && !isExpanded && !isVoiceLogOpen) return null;
    return new OfflineDiagnosticChatbot(savedLogs, savedSessions);
  }, [voiceNavEnabled, isExpanded, isVoiceLogOpen, savedLogs, savedSessions]);

  useEffect(() => {
    const unsub = offlineVoiceAssistant.subscribe((next) => setVoiceState(next));
    return () => {
      unsub();
      offlineVoiceAssistant.stopListening();
      offlineVoiceAssistant.stopSpeaking();
    };
  }, []);

  const liveContext = useMemo<LiveBenchContext>(
    () => ({
      powerSupply,
      pins,
      wires,
      faults,
      activeDTCs: circuitSolution.activeDTCs,
      nodeVoltages: circuitSolution.nodeVoltages,
      supplyCurrentDrawAmps: circuitSolution.supplyCurrentDrawAmps,
      isSupplyCurrentTripped: circuitSolution.isSupplyCurrentTripped,
      multimeter,
      multimeterDisplay: circuitSolution.multimeterReading.display,
      multimeterUnit: circuitSolution.multimeterReading.unit,
      multimeterWarning: circuitSolution.multimeterReading.warningMessage,
      selectedPinId,
    }),
    [powerSupply, pins, wires, faults, circuitSolution, multimeter, selectedPinId]
  );

  const benchTelemetryForCoach = useMemo<BenchTelemetry>(
    () =>
      buildBenchTelemetry({
        vehicleLabel: vehicleContext
          ? `${vehicleContext.brandLabel} ${vehicleContext.modelName}`
          : 'Universal 4-Cyl EFI',
        ecuProfileLabel: vehicleContext?.modelName ?? 'Universal 16-Pin EFI ECU',
        powerSupply,
        circuitSolution,
        multimeter,
        multimeterDisplay: circuitSolution.multimeterReading.display,
        multimeterUnit: circuitSolution.multimeterReading.unit,
        multimeterWarning: circuitSolution.multimeterReading.warningMessage,
        pins,
        faults,
        selectedPinId,
      }),
    [
      pins,
      selectedPinId,
      vehicleContext,
      powerSupply,
      circuitSolution,
      faults,
      multimeter,
    ]
  );

  // Synchronous render-time snapshot ref prevents stale closures during deferred confirmations,
  // multi-step voice macros, and cross-render commandExecutorRef invocations.
  const latestBenchRef = useRef({
    pins,
    wires,
    faults,
    powerSupply,
    multimeter,
    circuitSolution,
    selectedPinId,
    vehicleContext,
    activeTab,
    mobileBenchPane,
    checkedWorkflowIds,
    savedLogs,
    savedSessions,
    botEngine,
    voiceNavEnabled,
    voiceState,
    liveContext,
    benchTelemetryForCoach,
  });
  latestBenchRef.current = {
    pins,
    wires,
    faults,
    powerSupply,
    multimeter,
    circuitSolution,
    selectedPinId,
    vehicleContext,
    activeTab,
    mobileBenchPane,
    checkedWorkflowIds,
    savedLogs,
    savedSessions,
    botEngine,
    voiceNavEnabled,
    voiceState,
    liveContext,
    benchTelemetryForCoach,
  };

  const announceVoiceResult = useCallback(
    (title: string, detail: string, speakText?: string) => {
      setVoiceResult({ title, detail, timestamp: Date.now() });
      if (latestBenchRef.current.voiceNavEnabled) {
        offlineVoiceAssistant.speak(speakText ?? detail, true);
      }
    },
    []
  );

  const prevLabSnapshotRef = useRef<BenchReconciliationSnapshot | null>(null);
  useEffect(() => {
    const nextSnapshot = createBenchReconciliationSnapshot({
      activeTab,
      mobileBenchPane,
      powerSupply,
      multimeter,
      faults,
      wires,
      selectedPinId,
      circuitSolution,
    });

    if (!voiceNavEnabled && !isExpanded) {
      prevLabSnapshotRef.current = nextSnapshot;
      return;
    }

    const prevSnapshot = prevLabSnapshotRef.current;
    prevLabSnapshotRef.current = nextSnapshot;
    if (!prevSnapshot) return;

    const diff = diffBenchReconciliationSnapshots(prevSnapshot, nextSnapshot);
    if (!diff.changed) return;

    if (diff.isSafetyAlert) {
      setVoiceResult({
        title: diff.title,
        detail: diff.detail,
        timestamp: Date.now(),
        provenance: 'SIMULATED_MNA_TELEMETRY',
        isSafetyAlert: true,
      });
      if (voiceNavEnabled) {
        offlineVoiceAssistant.speak(diff.spokenText, true);
      }
    } else {
      announceVoiceResult(diff.title, diff.detail, diff.spokenText);
    }
  }, [
    voiceNavEnabled,
    isExpanded,
    activeTab,
    mobileBenchPane,
    powerSupply,
    multimeter,
    faults,
    wires,
    selectedPinId,
    circuitSolution,
    announceVoiceResult,
  ]);

  const prevVehicleSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (!vehicleContext) return;
    const sig = `${vehicleContext.brandKey}|${vehicleContext.modelName}|${vehicleContext.status}`;
    if (!voiceNavEnabled) {
      prevVehicleSigRef.current = sig;
      return;
    }
    const prev = prevVehicleSigRef.current;
    prevVehicleSigRef.current = sig;
    if (!prev || prev === sig) return;

    const title = `${vehicleContext.brandLabel} ${vehicleContext.modelName} · ${vehicleContext.status}`;
    const detail = vehicleContext.gateAlert || vehicleContext.controllerNote;
    const spoken =
      vehicleContext.spokenAlert ||
      `Selected ${vehicleContext.brandLabel} ${vehicleContext.modelName}. Status: ${vehicleContext.status}.`;
    announceVoiceResult(title, detail, spoken);
  }, [voiceNavEnabled, vehicleContext, announceVoiceResult]);

  const executeVoiceOrTextQuery = useCallback(
    (
      rawQuery: string,
      source: VoiceCommandLogSource = 'TEXT_INPUT',
      meta?: VoiceResultMetadata
    ) => {
      const trimmed = rawQuery.trim();
      if (!trimmed) return;

      const buildLiveVoiceActions = (): VoiceCommandActions => ({
        setVoltage: (volts) =>
          onChangePowerSupply((prev) => ({
            ...prev,
            voltageSetting: volts,
            preset: 'CUSTOM',
          })),
        setCurrentLimit: (amps) =>
          onChangePowerSupply((prev) => ({
            ...prev,
            currentLimit: Math.max(0.2, Math.min(10.0, parseFloat(amps.toFixed(2)))),
          })),
        setPowerSupplyPreset: (preset, volts, currentLimit) =>
          onChangePowerSupply((prev) => ({
            ...prev,
            preset,
            voltageSetting: volts,
            currentLimit,
          })),
        resetLab: () => {
          onSetManualRangeLabel?.(null);
          onResetLab?.();
        },
        attachProbeToPin: (pinId, label) => onAttachProbe('red', pinId, label),
        attachBlackProbeToPin: (pinId, label) => onAttachProbe('black', pinId, label),
        swapProbes: () =>
          onChangeMultimeter?.((prev) => ({
            ...prev,
            redProbe: prev.blackProbe,
            blackProbe: prev.redProbe,
          })),
        disconnectProbes: () =>
          onChangeMultimeter?.((prev) => ({
            ...prev,
            redProbe: { attachedToPinId: null, attachedLabel: 'Unconnected' },
            blackProbe: { attachedToPinId: null, attachedLabel: 'Unconnected' },
          })),
        setMultimeterState: onChangeMultimeter
          ? (updates, rangeLabel) => {
              if (rangeLabel !== undefined) {
                onSetManualRangeLabel?.(rangeLabel);
              }
              onChangeMultimeter((prev) => ({
                ...prev,
                ...(updates.mode !== undefined ? { mode: updates.mode } : {}),
                ...(updates.isPowered !== undefined ? { isPowered: updates.isPowered } : {}),
                ...(updates.rangeAuto !== undefined ? { rangeAuto: updates.rangeAuto } : {}),
                ...(updates.holdValue !== undefined ? { holdValue: updates.holdValue } : {}),
              }));
            }
          : undefined,
        connectWire: onAddWire
          ? (sourcePinId, targetPinId, color, label) => {
              onAddWire(sourcePinId, targetPinId, color, label);
              return true;
            }
          : undefined,
        disconnectWireByPin: onDeleteWire
          ? (pinId) => {
              const liveWires = latestBenchRef.current.wires;
              const matching = liveWires.filter(
                (w) => w.sourcePinId === pinId || w.targetPinId === pinId
              );
              matching.forEach((w) => onDeleteWire(w.id));
              return matching.length;
            }
          : undefined,
        toggleCutWireByPin: onToggleCutWire
          ? (pinId, cut) => {
              const liveWires = latestBenchRef.current.wires;
              const matching = liveWires.filter((w) => {
                const touchesPin = w.sourcePinId === pinId || w.targetPinId === pinId;
                if (!touchesPin) return false;
                if (typeof cut === 'boolean') return w.isCut !== cut;
                return true;
              });
              matching.forEach((w) => onToggleCutWire(w.id));
              return matching.length;
            }
          : undefined,
        injectFault: onAddFault,
        toggleFault:
          onAddFault && onRemoveFault
            ? (pinId, faultType, description) => {
                const existing = latestBenchRef.current.faults.find((f) => f.pinId === pinId);
                if (existing && (faultType === 'NONE' || existing.faultType === faultType)) {
                  onRemoveFault(pinId);
                  return false;
                }
                onAddFault(pinId, faultType, description);
                return true;
              }
            : onAddFault
            ? (pinId, faultType, description) => {
                onAddFault(pinId, faultType, description);
                return true;
              }
            : undefined,
        removeFault: onRemoveFault
          ? (pinId) => {
              const existed = latestBenchRef.current.faults.some((f) => f.pinId === pinId);
              onRemoveFault(pinId);
              return existed;
            }
          : undefined,
        setRpmEmulator: onChangeRpmEmulator
          ? (updates) =>
              onChangeRpmEmulator((prev) => ({
                ...prev,
                ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
                ...(updates.rpm !== undefined ? { rpm: updates.rpm } : {}),
              }))
          : undefined,
        setPowerSupplyOutput: (enabled) =>
          onChangePowerSupply((prev) => ({ ...prev, isOutputEnabled: enabled })),
        switchTab: (tab) => onNavigateTab(tab),
        switchMobilePane: (pane) => onSelectMobilePane(pane),
        openDiagnosticWorkflow: onOpenDiagnosticWorkflow,
        openLogicCheck: onOpenLogicCheck,
        toggleWorkflowStep: onChangeCheckedWorkflowIds
          ? (stepId, checked) => {
              onOpenDiagnosticWorkflow?.();
              onChangeCheckedWorkflowIds((prev) => {
                const currentlyChecked = prev.includes(stepId);
                const nextChecked = typeof checked === 'boolean' ? checked : !currentlyChecked;
                if (nextChecked) {
                  return currentlyChecked ? prev : [...prev, stepId];
                }
                return prev.filter((id) => id !== stepId);
              });
            }
          : undefined,
        checkPassingWorkflow: onChangeCheckedWorkflowIds
          ? () => {
              onOpenDiagnosticWorkflow?.();
              const snap = latestBenchRef.current;
              const currentSet = new Set(snap.checkedWorkflowIds ?? []);
              const evaluated = evaluateWorkflowSteps(
                {
                  powerSupply: snap.powerSupply,
                  pins: snap.pins,
                  wires: snap.wires,
                  faults: snap.faults,
                  activeDTCs: snap.circuitSolution.activeDTCs,
                  nodeVoltages: snap.circuitSolution.nodeVoltages,
                  supplyCurrentDrawAmps: snap.circuitSolution.supplyCurrentDrawAmps,
                  isSupplyCurrentTripped: snap.circuitSolution.isSupplyCurrentTripped,
                  multimeter: snap.multimeter,
                  multimeterReading: snap.circuitSolution.multimeterReading,
                  ecuProfileLabel: snap.vehicleContext?.modelName,
                },
                currentSet
              );
              const newlyPassing = evaluated
                .filter((s) => s.telemetryStatus === 'PASS' && !currentSet.has(s.id))
                .map((s) => s.id);
              if (newlyPassing.length > 0) {
                onChangeCheckedWorkflowIds((prev) =>
                  Array.from(new Set([...prev, ...newlyPassing]))
                );
              }
              return newlyPassing.length;
            }
          : undefined,
        resetWorkflow: onChangeCheckedWorkflowIds
          ? () => {
              onOpenDiagnosticWorkflow?.();
              onChangeCheckedWorkflowIds([]);
            }
          : undefined,
        clearFaults: onClearAllFaults,
        openTroubleLookup: onOpenTroubleLookup,
        emulateTroubleScenario: onEmulateTroubleScenario,
        nextScenarioStep: onNextScenarioStep,
        prevScenarioStep: onPrevScenarioStep,
        repeatScenarioStep: onRepeatScenarioStep,
        verifyScenarioStep: onVerifyScenarioStep,
        completeScenarioStep: onCompleteScenarioStep,
        probeScenarioFocusPin: onProbeScenarioFocusPin,
        readMeter: () => {
          const snap = latestBenchRef.current;
          return {
            display: snap.circuitSolution.multimeterReading.display,
            unit: snap.circuitSolution.multimeterReading.unit,
            dtcCount: snap.circuitSolution.activeDTCs.length,
            supplyVolts: snap.powerSupply.voltageSetting,
            isPowerOn: snap.powerSupply.isOutputEnabled,
            supplyAmps: snap.circuitSolution.supplyCurrentDrawAmps,
          };
        },
      });

      const voiceActions = buildLiveVoiceActions();
      const snapNow = latestBenchRef.current;
      const currentLang: BilingualLang = snapNow.voiceState.language || 'TL';

      const safetyEval = evaluateVoiceCommandSafetyAndRisk({
        rawCommand: trimmed,
        lang: currentLang,
        powerSupply: snapNow.powerSupply,
        multimeter: snapNow.multimeter,
        isSupplyCurrentTripped: snapNow.circuitSolution.isSupplyCurrentTripped,
        vehicleStatus: snapNow.vehicleContext?.status,
        pins: snapNow.pins,
        hasPendingConfirmation: Boolean(offlineVoiceAssistant.getPendingAction()),
      });

      if (safetyEval.decision === 'CONFIRMED_PENDING') {
        const confirmed = offlineVoiceAssistant.confirmPendingAction();
        const reply =
          currentLang === 'EN' ? safetyEval.spokenReplyEN : safetyEval.spokenReplyTL;
        offlineVoiceAssistant.addCommandLog({
          source,
          rawTranscript: trimmed,
          normalizedTranscript: trimmed.toLowerCase(),
          confidence: meta?.confidence,
          status: 'EXECUTED',
          category: 'CONFIRMATION',
          actionDescription: confirmed
            ? `Confirmed & executed: ${confirmed.rawCommand}`
            : safetyEval.actionSummary,
          spokenReply: reply,
        });
        announceVoiceResult('Confirmed Bench Action', confirmed?.rawCommand || reply, reply);
        return;
      }

      if (safetyEval.decision === 'CANCELLED_PENDING') {
        const cancelled = offlineVoiceAssistant.cancelPendingAction();
        const reply =
          currentLang === 'EN' ? safetyEval.spokenReplyEN : safetyEval.spokenReplyTL;
        offlineVoiceAssistant.addCommandLog({
          source,
          rawTranscript: trimmed,
          normalizedTranscript: trimmed.toLowerCase(),
          confidence: meta?.confidence,
          status: 'EXECUTED',
          category: 'CONFIRMATION',
          actionDescription: cancelled
            ? `Cancelled pending action: ${cancelled.rawCommand}`
            : safetyEval.actionSummary,
          spokenReply: reply,
        });
        announceVoiceResult('Cancelled Bench Action', reply, reply);
        return;
      }

      if (safetyEval.decision === 'REJECTED_SAFETY') {
        const reply =
          currentLang === 'EN' ? safetyEval.spokenReplyEN : safetyEval.spokenReplyTL;
        offlineVoiceAssistant.addCommandLog({
          source,
          rawTranscript: trimmed,
          normalizedTranscript: trimmed.toLowerCase(),
          confidence: meta?.confidence,
          status: 'REJECTED_SAFETY',
          category: 'SAFETY_INTERLOCK',
          actionDescription: safetyEval.safetyReason || safetyEval.actionSummary,
          spokenReply: reply,
          provenance: 'UNIVERSAL_BENCH_TRAINER',
        });
        if (source === 'SPEECH_API') {
          onOpenVoiceLog?.();
        }
        setVoiceResult({
          title: currentLang === 'EN' ? 'Safety Interlock Blocked' : 'Hinarang ng Safety Interlock',
          detail: safetyEval.safetyReason || reply,
          timestamp: Date.now(),
          provenance: 'UNIVERSAL_BENCH_TRAINER',
          isSafetyAlert: true,
        });
        if (voiceNavEnabled) {
          offlineVoiceAssistant.speak(reply, true);
        }
        return;
      }

      const matchedMacro = voiceMacroService.findMatchingMacro(trimmed);
      if (matchedMacro) {
        const macroAuth = authorizeVoiceMacroSteps({
          macroName: matchedMacro.name,
          steps: matchedMacro.steps,
          snapshot: {
            environmentMode: 'SIMULATION_MODE',
            psuOutputEnabled: snapNow.powerSupply.isOutputEnabled,
            psuVoltageSetting: snapNow.powerSupply.voltageSetting,
            psuCurrentLimitAmps: snapNow.powerSupply.currentLimit,
            ocpTripped: snapNow.circuitSolution.isSupplyCurrentTripped,
            dmmMode: snapNow.multimeter.mode,
            brandKey: snapNow.vehicleContext?.brandKey || 'universal-bench',
            modelName: snapNow.vehicleContext?.modelName || 'Universal Trainer',
            ecuStatus: snapNow.vehicleContext?.status || 'VERIFIED',
            hasVerifiedPinoutMap: !/UNVERIFIED|OCR_PENDING|PART_METADATA_ONLY|MECHANICAL_NO_ECU/i.test(
              snapNow.vehicleContext?.status || ''
            ),
          },
        });

        if (macroAuth.overallDecision === 'BLOCK') {
          const blockedMsg =
            macroAuth.blockedReasonEN ||
            `Macro "${matchedMacro.name}" blocked by centralized electrical safety interlock.`;
          offlineVoiceAssistant.addCommandLog({
            source,
            rawTranscript: trimmed,
            normalizedTranscript: trimmed.toLowerCase(),
            confidence: meta?.confidence,
            status: 'REJECTED_SAFETY',
            category: 'SAFETY_INTERLOCK',
            actionDescription: blockedMsg,
            spokenReply: blockedMsg,
            provenance: 'UNIVERSAL_BENCH_TRAINER',
          });
          setVoiceResult({
            title: currentLang === 'EN' ? 'Macro Blocked by Safety' : 'Hinarang ang Macro',
            detail: blockedMsg,
            timestamp: Date.now(),
            provenance: 'UNIVERSAL_BENCH_TRAINER',
            isSafetyAlert: true,
          });
          if (voiceNavEnabled) {
            offlineVoiceAssistant.speak(blockedMsg, true);
          }
          return;
        }

        const runMacroNow = () => {
          const liveSnap = latestBenchRef.current;
          const macroResult = executeMacroSequence(
            matchedMacro,
            liveSnap.pins,
            buildLiveVoiceActions()
          );
          offlineVoiceAssistant.addCommandLog({
            source,
            rawTranscript: trimmed,
            normalizedTranscript: `Macro: ${matchedMacro.name} (${macroResult.stepResults.length} steps)`,
            confidence: meta?.confidence,
            status: macroResult.status === 'EXECUTED' ? 'EXECUTED' : 'FAILED',
            category: 'MACRO',
            actionDescription: macroResult.actionDescription,
            spokenReply: macroResult.spokenReply,
          });
          if (source === 'SPEECH_API') {
            onOpenVoiceLog?.();
          }
          announceVoiceResult(
            `Macro: ${matchedMacro.name}`,
            macroResult.actionDescription,
            macroResult.spokenReply
          );
        };

        offlineVoiceAssistant.setPendingAction({
          id: `pending-macro-${Date.now()}`,
          rawCommand: trimmed,
          actionSummary: `Run multi-step macro "${matchedMacro.name}" (${matchedMacro.steps.length} steps)`,
          riskReason:
            currentLang === 'EN'
              ? 'Multi-step bench macro modifies power, wiring, or instrument state.'
              : 'Babaguhin ng multi-step macro ang power, wiring, o instrument state.',
          source,
          confidence: meta?.confidence,
          createdAtMs: Date.now(),
          execute: runMacroNow,
        });
        const confirmPrompt =
          currentLang === 'EN'
            ? `Confirmation required to run macro "${matchedMacro.name}". Say "Confirm" or tap Confirm.`
            : `Kailangan ng kumpirmasyon para patakbuhin ang macro "${matchedMacro.name}". Sabihin ang "Confirm" o "Oo" o pindutin ang Confirm.`;
        offlineVoiceAssistant.addCommandLog({
          source,
          rawTranscript: trimmed,
          normalizedTranscript: trimmed.toLowerCase(),
          confidence: meta?.confidence,
          status: 'PENDING_CONFIRMATION',
          category: 'MACRO',
          actionDescription: `Awaiting confirmation: Macro ${matchedMacro.name}`,
          spokenReply: confirmPrompt,
        });
        announceVoiceResult('Confirmation Required', confirmPrompt, confirmPrompt);
        return;
      }

      if (safetyEval.decision === 'REQUIRES_CONFIRMATION') {
        const executeConfirmedCommand = () => {
          const liveSnap = latestBenchRef.current;
          const cmd = parseAndExecuteVoiceCommand(
            trimmed,
            liveSnap.pins,
            buildLiveVoiceActions()
          );
          if (cmd.matched) {
            offlineVoiceAssistant.addCommandLog({
              source,
              rawTranscript: trimmed,
              normalizedTranscript: cmd.normalizedTranscript || trimmed.toLowerCase(),
              confidence: meta?.confidence,
              status: cmd.status === 'FAILED' ? 'FAILED' : 'EXECUTED',
              category: cmd.category || 'DIAGNOSTIC',
              actionDescription: cmd.actionDescription,
              spokenReply: cmd.spokenReply,
              scenarioPhId: cmd.scenarioPhId,
              scenarioStepNumber: cmd.scenarioStepNumber,
              guidanceKind: cmd.guidanceKind,
            });
            if (source === 'SPEECH_API') {
              onOpenVoiceLog?.();
            }
            announceVoiceResult(`Executed: "${trimmed}"`, cmd.actionDescription, cmd.spokenReply);
          }
        };

        offlineVoiceAssistant.setPendingAction({
          id: `pending-cmd-${Date.now()}`,
          rawCommand: trimmed,
          actionSummary: safetyEval.actionSummary,
          riskReason:
            currentLang === 'EN'
              ? 'State-changing bench command requires technician confirmation.'
              : 'Kailangan ng kumpirmasyon ng technician bago baguhin ang bench state.',
          source,
          confidence: meta?.confidence,
          createdAtMs: Date.now(),
          execute: executeConfirmedCommand,
        });

        const promptText =
          currentLang === 'EN' ? safetyEval.spokenReplyEN : safetyEval.spokenReplyTL;
        offlineVoiceAssistant.addCommandLog({
          source,
          rawTranscript: trimmed,
          normalizedTranscript: trimmed.toLowerCase(),
          confidence: meta?.confidence,
          status: 'PENDING_CONFIRMATION',
          category: 'SAFETY_CONFIRMATION',
          actionDescription: safetyEval.actionSummary,
          spokenReply: promptText,
        });
        announceVoiceResult(
          currentLang === 'EN' ? 'Confirmation Required' : 'Kailangan ng Kumpirmasyon',
          safetyEval.actionSummary,
          promptText
        );
        return;
      }

      const cmd = parseAndExecuteVoiceCommand(trimmed, snapNow.pins, voiceActions);

      if (cmd.matched) {
        const currentMem = offlineVoiceAssistant.getSessionMemory();
        offlineVoiceAssistant.setSessionMemory({
          ...currentMem,
          lastExecutedCommand: trimmed,
          activeTab: snapNow.activeTab,
          lang: currentLang,
        });
        offlineVoiceAssistant.addCommandLog({
          source,
          rawTranscript: trimmed,
          normalizedTranscript: cmd.normalizedTranscript || trimmed.toLowerCase(),
          confidence: meta?.confidence,
          status: cmd.status === 'FAILED' ? 'FAILED' : 'EXECUTED',
          category: cmd.category || 'DIAGNOSTIC',
          actionDescription: cmd.actionDescription,
          spokenReply: cmd.spokenReply,
          scenarioPhId: cmd.scenarioPhId,
          scenarioStepNumber: cmd.scenarioStepNumber,
          guidanceKind: cmd.guidanceKind,
          provenance: 'SIMULATED_MNA_TELEMETRY',
        });
        if (source === 'SPEECH_API') {
          onOpenVoiceLog?.();
        }
        if (cmd.alreadySpoken) {
          setVoiceResult({
            title: `Voice Cmd: "${trimmed}"`,
            detail: cmd.actionDescription,
            timestamp: Date.now(),
            provenance: 'SIMULATED_MNA_TELEMETRY',
          });
        } else {
          announceVoiceResult(`Voice Cmd: "${trimmed}"`, cmd.actionDescription, cmd.spokenReply);
        }
        return;
      }

      // Unified Local Voice Brain (`processVoiceCoachTurn`) for natural bilingual EN/Taglish,
      // multi-turn diagnostic continuity ("How do I test the TPS?" -> "What should I measure?" -> "It's reading 0.04 volts" -> "What next?"),
      // live bench telemetry awareness, and 6-tier knowledge provenance.
      const coachTurn = processVoiceCoachTurn({
        transcript: trimmed,
        memory: offlineVoiceAssistant.getSessionMemory(),
        telemetry: snapNow.benchTelemetryForCoach,
        activeTab: snapNow.activeTab,
        lang: currentLang,
        pins: snapNow.pins,
        nodeVoltages: snapNow.circuitSolution.nodeVoltages,
      });

      offlineVoiceAssistant.setSessionMemory(coachTurn.updatedMemory);

      if (coachTurn.navigationAction?.type === 'TAB') {
        onNavigateTab(coachTurn.navigationAction.tab);
      }

      if (!coachTurn.usedClarificationFallback || coachTurn.confidence >= 0.55) {
        offlineVoiceAssistant.addCommandLog({
          source,
          rawTranscript: trimmed,
          normalizedTranscript: trimmed.toLowerCase(),
          confidence: meta?.confidence ?? coachTurn.confidence,
          status: coachTurn.navigationAction ? 'EXECUTED' : 'FALLBACK',
          category: coachTurn.intent,
          actionDescription: coachTurn.displayText,
          spokenReply: coachTurn.spokenText,
          provenance: coachTurn.provenance,
        });
        if (source === 'SPEECH_API') {
          onOpenVoiceLog?.();
        }
        setVoiceResult({
          title: `${coachTurn.matchedSource}`,
          detail: coachTurn.displayText,
          timestamp: Date.now(),
          provenance: coachTurn.provenance,
          structuredDiagnostic: coachTurn.structuredDiagnostic,
        });
        if (snapNow.voiceNavEnabled) {
          offlineVoiceAssistant.speak(coachTurn.spokenText, true);
        }
        return;
      }

      const engine =
        snapNow.botEngine ?? new OfflineDiagnosticChatbot(snapNow.savedLogs, snapNow.savedSessions);
      const reply = engine.ask(trimmed, snapNow.liveContext);
      const cleanSummary = reply.answer
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/•\s*/g, '')
        .split('\n')
        .filter(Boolean)
        .slice(0, 2)
        .join(' · ');

      offlineVoiceAssistant.addCommandLog({
        source,
        rawTranscript: trimmed,
        normalizedTranscript: cmd.normalizedTranscript || trimmed.toLowerCase(),
        confidence: meta?.confidence,
        status: 'FALLBACK',
        category: 'DIAGNOSTIC',
        actionDescription: cleanSummary || 'Routed to offline diagnostic assistant',
        spokenReply: reply.answer,
        provenance: 'CURATED_DIAGNOSTIC_DATABASE',
      });
      if (source === 'SPEECH_API') {
        onOpenVoiceLog?.();
      }
      setVoiceResult({
        title: `Offline AI: "${trimmed}"`,
        detail: cleanSummary,
        timestamp: Date.now(),
        provenance: 'CURATED_DIAGNOSTIC_DATABASE',
        structuredDiagnostic: coachTurn.structuredDiagnostic,
      });
      if (snapNow.voiceNavEnabled) {
        offlineVoiceAssistant.speak(reply.answer, true);
      }
    },
    [
      pins,
      wires,
      onChangePowerSupply,
      onChangeMultimeter,
      onSetManualRangeLabel,
      onAddWire,
      onDeleteWire,
      onToggleCutWire,
      onAddFault,
      onRemoveFault,
      onChangeRpmEmulator,
      onResetLab,
      onAttachProbe,
      onNavigateTab,
      onSelectMobilePane,
      onClearAllFaults,
      circuitSolution.multimeterReading.display,
      circuitSolution.multimeterReading.unit,
      circuitSolution.activeDTCs.length,
      circuitSolution.supplyCurrentDrawAmps,
      powerSupply.voltageSetting,
      powerSupply.isOutputEnabled,
      announceVoiceResult,
      botEngine,
      savedLogs,
      savedSessions,
      liveContext,
      benchTelemetryForCoach,
      activeTab,
      voiceNavEnabled,
      voiceState.language,
      vehicleContext?.status,
      onOpenVoiceLog,
      onOpenDiagnosticWorkflow,
      onOpenLogicCheck,
      checkedWorkflowIds,
      onChangeCheckedWorkflowIds,
      powerSupply,
      faults,
      multimeter,
      circuitSolution.activeDTCs,
      circuitSolution.nodeVoltages,
      circuitSolution.isSupplyCurrentTripped,
      circuitSolution.multimeterReading,
      vehicleContext?.modelName,
      onOpenTroubleLookup,
      onEmulateTroubleScenario,
      onNextScenarioStep,
      onPrevScenarioStep,
      onRepeatScenarioStep,
      onVerifyScenarioStep,
      onCompleteScenarioStep,
      onProbeScenarioFocusPin,
    ]
  );

  const prevVoiceNavEnabledRef = useRef(voiceNavEnabled);
  useEffect(() => {
    const wasEnabled = prevVoiceNavEnabledRef.current;
    prevVoiceNavEnabledRef.current = voiceNavEnabled;
    if (wasEnabled === voiceNavEnabled) return;

    if (voiceNavEnabled) {
      offlineVoiceAssistant.setAutoSpeak(true);
      const intro = `Voice Navigator ON · DMM ${circuitSolution.multimeterReading.display} ${circuitSolution.multimeterReading.unit} · ${circuitSolution.activeDTCs.length} DTC`;
      setVoiceResult({ title: 'Offline Voice Active', detail: intro, timestamp: Date.now() });
      offlineVoiceAssistant.speak(
        `Offline voice navigator active. Multimeter reads ${circuitSolution.multimeterReading.display} ${circuitSolution.multimeterReading.unit}.`,
        true
      );
    } else {
      offlineVoiceAssistant.stopListening();
      offlineVoiceAssistant.stopSpeaking();
    }
  }, [
    voiceNavEnabled,
    circuitSolution.multimeterReading.display,
    circuitSolution.multimeterReading.unit,
    circuitSolution.activeDTCs.length,
  ]);

  const handleToggleVoiceNav = () => {
    setVoiceNavEnabled((prev) => !prev);
  };

  const handleToggleLanguage = () => {
    const nextLang: BilingualLang = voiceState.language === 'EN' ? 'TL' : 'EN';
    offlineVoiceAssistant.setLanguage(nextLang);
  };

  const handleConfirmPendingAction = () => {
    const confirmed = offlineVoiceAssistant.confirmPendingAction();
    if (!confirmed) return;
    const msg =
      voiceState.language === 'EN'
        ? `Confirmed & executed: ${confirmed.rawCommand}`
        : `Kumpirmado at isinagawa: ${confirmed.rawCommand}`;
    announceVoiceResult('Confirmed Bench Action', msg, msg);
  };

  const handleCancelPendingAction = () => {
    const cancelled = offlineVoiceAssistant.cancelPendingAction();
    if (!cancelled) return;
    const msg =
      voiceState.language === 'EN'
        ? `Cancelled pending command: ${cancelled.rawCommand}`
        : `Kinansela ang command: ${cancelled.rawCommand}`;
    announceVoiceResult('Cancelled Bench Action', msg, msg);
  };

  const latestQueryExecutorRef = useRef(executeVoiceOrTextQuery);
  latestQueryExecutorRef.current = executeVoiceOrTextQuery;
  useEffect(() => {
    if (commandExecutorRef) {
      commandExecutorRef.current = (rawQuery, source, meta) =>
        latestQueryExecutorRef.current(rawQuery, source, meta);
    }
    return () => {
      if (commandExecutorRef) {
        commandExecutorRef.current = null;
      }
    };
  }, [commandExecutorRef]);

  const handleToggleContinuousMode = () => {
    const nextContinuous = !voiceState.continuousMode;
    offlineVoiceAssistant.setContinuousMode(nextContinuous);
    if (voiceState.isListening) {
      offlineVoiceAssistant.stopListening();
      offlineVoiceAssistant.startListening(
        (spokenText, meta) => latestQueryExecutorRef.current(spokenText, 'SPEECH_API', meta),
        { continuous: nextContinuous }
      );
    }
  };

  const handleStartListening = () => {
    if (!voiceNavEnabled) {
      setVoiceNavEnabled(true);
      offlineVoiceAssistant.setAutoSpeak(true);
    }
    if (voiceState.isListening) {
      offlineVoiceAssistant.stopListening();
      return;
    }
    if (!voiceState.hasSpeechRecognition) {
      setIsExpanded(true);
      setVoiceResult({
        title: 'Browser SpeechRecognition Unavailable',
        detail:
          'Local Diagnostic Intelligence is 100% offline-ready, but Browser SpeechRecognition API is unavailable in this browser. Type a command or tap any quick chip below.',
        timestamp: Date.now(),
      });
      return;
    }
    offlineVoiceAssistant.startListening(
      (spokenText, meta) => latestQueryExecutorRef.current(spokenText, 'SPEECH_API', meta),
      { continuous: voiceState.continuousMode }
    );
  };

  const handleSubmitCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    executeVoiceOrTextQuery(commandInput, 'TEXT_INPUT');
    setCommandInput('');
  };

  return (
    <div
      ref={dockRef}
      aria-label="Docked Lab Console Controls"
      className="relative z-30 shrink-0 w-full"
    >
      {/* Upward-Anchored Notices & Quick Navigator Drawer (Never floats over instruments when closed) */}
      {(voiceState.isListening ||
        voiceState.error ||
        voiceState.pendingAction ||
        (voiceNavEnabled && voiceResult) ||
        isExpanded) && (
        <div className="absolute bottom-full left-0 right-0 mb-2 flex flex-col items-end gap-2 pointer-events-none z-40">
          {voiceState.pendingAction && (
            <div
              role="alertdialog"
              aria-label="Pending bench command confirmation"
              data-testid="voice-pending-confirmation-bar"
              className="pointer-events-auto w-full sm:w-[392px] hud-panel border-[#ffb020]/80 bg-[#171105]/95 rounded-xl px-3.5 py-2.5 shadow-2xl text-[11px]"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono font-bold text-[#ffb020] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#ffb020] shrink-0" />
                  {voiceState.language === 'EN'
                    ? 'Confirm State-Changing Action'
                    : 'Kumpirmahin ang Bench Command'}
                </span>
                <span className="font-mono text-[9.5px] text-[#91a4bd]">
                  {voiceState.language === 'EN' ? 'Say "Confirm" / "Cancel"' : 'Sabihin: "Oo" / "Cancel"'}
                </span>
              </div>
              <p className="text-[#eaf3ff] font-mono text-[10.5px] leading-snug mb-2">
                {voiceState.pendingAction.actionSummary}
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  data-testid="voice-cancel-action-btn"
                  onClick={handleCancelPendingAction}
                  className="hw-btn px-2.5 py-1 rounded-lg border-[#ff4d62]/60 text-[#ff8594] font-mono text-[10px] inline-flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  <span>{voiceState.language === 'EN' ? 'Cancel' : 'Kansela'}</span>
                </button>
                <button
                  type="button"
                  data-testid="voice-confirm-action-btn"
                  onClick={handleConfirmPendingAction}
                  className="hw-btn hw-btn-green px-2.5 py-1 rounded-lg font-mono font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                  <span>{voiceState.language === 'EN' ? 'Confirm & Execute' : 'Confirm / Ituloy'}</span>
                </button>
              </div>
            </div>
          )}

          {voiceState.isListening && (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-auto w-full sm:w-[392px] hud-panel border-[#ff4d62]/70 rounded-xl px-3.5 py-2.5 shadow-2xl text-[11px]"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono font-bold text-[#ff8594] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#ff4d62] animate-ping" />
                  Listening ({voiceState.language === 'TL' ? 'Taglish / fil-PH' : 'English / en-US'})
                  {voiceState.continuousMode ? ' · Continuous' : ''}...
                </span>
                <button
                  type="button"
                  onClick={() => offlineVoiceAssistant.stopListening()}
                  className="hw-btn px-2 py-1 rounded-lg border-[#ff4d62]/55 text-[9.5px] font-mono text-[#ff8594] cursor-pointer"
                >
                  Stop Mic
                </button>
              </div>
              <p className="text-[#eaf3ff] font-mono text-[10.5px] leading-snug">
                {voiceState.interimTranscript
                  ? `"${voiceState.interimTranscript}"`
                  : voiceState.language === 'TL'
                  ? 'Say: "Check mo yung voltage sa Pin 5" or "Paano mag-test ng TPS?"'
                  : 'Say: "How do I test the TPS?" or "Read meter"'}
              </p>
            </div>
          )}

          {voiceState.error && (
            <div
              role="alert"
              className="pointer-events-auto w-full sm:w-[392px] hud-panel border-[#ffb020]/60 rounded-xl px-3.5 py-2.5 shadow-2xl text-[11px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-[#ffb020] text-[10.5px]">
                  Voice Input Notice
                </span>
                <button
                  type="button"
                  onClick={() => offlineVoiceAssistant.clearError()}
                  className="text-[#91a4bd] hover:text-white font-mono text-xs px-1.5 py-0.5 cursor-pointer"
                  aria-label="Dismiss voice notice"
                >
                  ×
                </button>
              </div>
              <p className="text-[#eaf3ff] font-sans text-[10.5px] leading-snug mt-0.5">{voiceState.error}</p>
            </div>
          )}

          {(voiceNavEnabled || isExpanded) && voiceResult && (
            <div
              role="status"
              aria-live="polite"
              data-testid="floating-voice-result-card"
              className={`pointer-events-auto w-full sm:w-[392px] hud-panel rounded-xl px-3.5 py-2.5 shadow-2xl text-[11px] ${
                voiceResult.isSafetyAlert
                  ? 'border-[#ff4d62]/80 bg-[#1e0b10]/95'
                  : 'border-[#20d889]/55'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span
                  className={`font-mono font-bold flex items-center gap-1.5 truncate ${
                    voiceResult.isSafetyAlert ? 'text-[#ff8594]' : 'text-[#20d889]'
                  }`}
                >
                  {voiceResult.isSafetyAlert ? (
                    <ShieldAlert className="w-3.5 h-3.5 text-[#ff4d62] shrink-0" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-[#20d889] shrink-0" />
                  )}
                  {voiceResult.title}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {voiceResult.provenance && (
                    <span
                      data-testid="voice-provenance-badge"
                      className="px-1.5 py-0.5 rounded bg-[#0b1829] border border-[#203653] font-mono text-[8.5px] text-[#19c8f5]"
                    >
                      {voiceResult.provenance}
                    </span>
                  )}
                  {voiceState.isSpeaking && (
                    <button
                      type="button"
                      onClick={() => offlineVoiceAssistant.stopSpeaking()}
                      className="hw-btn px-2 py-0.5 rounded-lg border-[#ff4d62]/55 text-[9.5px] font-mono text-[#ff8594] cursor-pointer"
                      title="Stop Speaking"
                    >
                      Stop
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setVoiceResult(null)}
                    className="text-[#91a4bd] hover:text-white font-mono text-xs px-1.5 py-0.5 cursor-pointer"
                    aria-label="Dismiss voice result"
                  >
                    ×
                  </button>
                </div>
              </div>
              <p className="text-[#eaf3ff] font-sans leading-snug line-clamp-3">{voiceResult.detail}</p>
              {voiceResult.structuredDiagnostic && (
                <div
                  data-testid="voice-structured-diagnostic-card"
                  className="mt-2 pt-2 border-t border-[#203653]/80 space-y-1 text-[10px] font-mono text-[#d4e3f6]"
                >
                  <div>
                    <span className="text-[#19c8f5] font-bold">Finding: </span>
                    <span>{voiceResult.structuredDiagnostic.finding}</span>
                  </div>
                  <div>
                    <span className="text-[#20d889] font-bold">Check: </span>
                    <span>{voiceResult.structuredDiagnostic.check}</span>
                  </div>
                  <div>
                    <span className="text-[#ffb020] font-bold">Expected: </span>
                    <span>{voiceResult.structuredDiagnostic.expectedResult}</span>
                  </div>
                  <div>
                    <span className="text-[#ff8594] font-bold">Safety: </span>
                    <span>{voiceResult.structuredDiagnostic.safety}</span>
                  </div>
                  <div>
                    <span className="text-[#a5b4fc] font-bold">Next step: </span>
                    <span>{voiceResult.structuredDiagnostic.nextStep}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {isExpanded && (
            <div
              aria-label="Quick Navigator Drawer"
              className="pointer-events-auto w-full sm:w-[408px] hud-panel border-[#203653] rounded-xl p-3 shadow-2xl space-y-3 text-[11px]"
            >
              {/* Container Move Mode & Quick Reorder */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-[10px] uppercase tracking-wider text-[#eaf3ff] flex items-center gap-1.5">
                    <Move className="w-3.5 h-3.5 text-[#19c8f5]" />
                    Bench Containers
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={onToggleContainerMoveMode}
                      aria-pressed={isContainerMoveMode}
                      className={`hw-btn px-2.5 py-1 rounded-lg font-mono text-[10px] cursor-pointer ${
                        isContainerMoveMode ? 'hw-btn-amber font-bold' : 'text-[#d4e3f6]'
                      }`}
                    >
                      {isContainerMoveMode ? 'Done Moving' : 'Move Mode'}
                    </button>
                    <button
                      type="button"
                      onClick={onResetPaneOrder}
                      className="hw-btn p-1.5 rounded-lg text-[#91a4bd] hover:text-white cursor-pointer"
                      title="Reset Container Order"
                      aria-label="Reset container order"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsExpanded(false)}
                      className="hw-btn px-2 py-1 rounded-lg text-[#91a4bd] hover:text-white font-mono text-[11px] cursor-pointer"
                      aria-label="Close navigator drawer"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {paneOrder.map((pane, idx) => {
                    const isSelected = activeTab === 'BENCH_LAB' && mobileBenchPane === pane;
                    return (
                      <div
                        key={pane}
                        className={`rounded-lg border p-1.5 flex flex-col gap-1 transition-colors ${
                          isSelected
                            ? 'bg-[#122645] border-[#19c8f5]/75'
                            : 'bg-[#081120] border-[#203653]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onNavigateTab('BENCH_LAB');
                            onSelectMobilePane(pane);
                          }}
                          className={`text-[10.5px] font-mono font-semibold truncate text-center py-0.5 cursor-pointer ${
                            isSelected ? 'text-[#19c8f5]' : 'text-[#d4e3f6] hover:text-white'
                          }`}
                        >
                          {PANE_LABELS[pane]}
                        </button>
                        {isContainerMoveMode && (
                          <div className="flex items-center justify-between gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => onMovePane(pane, 'prev')}
                              className="hw-btn flex-1 py-0.5 rounded-md disabled:opacity-30 text-[#ffb020] font-mono text-[10px] cursor-pointer"
                              aria-label={`Move ${PANE_LABELS[pane]} earlier`}
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              disabled={idx === paneOrder.length - 1}
                              onClick={() => onMovePane(pane, 'next')}
                              className="hw-btn flex-1 py-0.5 rounded-md disabled:opacity-30 text-[#ffb020] font-mono text-[10px] cursor-pointer"
                              aria-label={`Move ${PANE_LABELS[pane]} later`}
                            >
                              →
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Direct Workspace Module Navigation Bar */}
                <div className="flex flex-wrap gap-1 pt-1">
                  {(
                    [
                      { label: 'Bench Lab', tab: 'BENCH_LAB' as LabTab },
                      { label: 'ECU Pinouts', tab: 'CONNECTOR_PINOUTS' as LabTab },
                      { label: '3D Twin', tab: 'THREE_D_TWIN' as LabTab },
                      { label: 'Wiring', tab: 'WIRING_DIAGRAM' as LabTab },
                      { label: 'Scope', tab: 'OSCILLOSCOPE' as LabTab },
                      { label: 'PCB Scan', tab: 'PCB_DIAGNOSTICS' as LabTab },
                      { label: 'Repair KB', tab: 'REPAIR_GUIDES' as LabTab },
                    ] as const
                  ).map((mod) => (
                    <button
                      key={mod.tab}
                      type="button"
                      onClick={() => onNavigateTab(mod.tab)}
                      className={`hw-btn px-2 py-0.5 rounded-md font-mono text-[9.5px] cursor-pointer ${
                        activeTab === mod.tab
                          ? 'border-[#19c8f5] text-[#19c8f5] font-bold'
                          : 'text-[#91a4bd] hover:text-white'
                      }`}
                    >
                      {mod.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Offline AI Voice Quick Actions & Command Input */}
              <div className="border-t border-[#203653]/80 pt-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#20d889] flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5" />
                      Unified Voice AI
                    </span>
                    <span
                      title="Local diagnostic brain works 100% offline. Browser Web Speech mic depends on browser/OS speech engine."
                      className="px-1.5 py-0.5 rounded bg-[#081326] border border-[#203653] font-mono text-[8.5px] text-[#91a4bd]"
                    >
                      Offline Brain · {voiceState.hasSpeechRecognition ? 'Web Speech Mic' : 'Text Mode'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      type="button"
                      onClick={handleToggleLanguage}
                      title="Switch shared voice recognition & diagnostic reply language (Taglish TL / English EN)"
                      className="hw-btn px-2 py-1 rounded-lg font-mono text-[9.5px] text-[#19c8f5] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Globe className="w-3 h-3" />
                      <span>{voiceState.language === 'TL' ? 'TL Taglish' : 'EN English'}</span>
                    </button>
                    {onOpenVoiceMacroLibrary && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsExpanded(false);
                          onOpenVoiceMacroLibrary();
                        }}
                        title="Open Voice Macro Library & Live Action Recorder"
                        className="hw-btn px-2 py-1 rounded-lg font-mono text-[9.5px] text-[#20d889] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Layers className="w-3 h-3" aria-hidden="true" />
                        <span>Library</span>
                      </button>
                    )}
                    {onOpenVoiceMacros && (
                      <button
                        type="button"
                        onClick={onOpenVoiceMacros}
                        title="Create or run custom sequential voice macros"
                        className="hw-btn px-2 py-1 rounded-lg font-mono text-[9.5px] text-[#ffb020] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Layers className="w-3 h-3" aria-hidden="true" />
                        <span>Macros</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleToggleContinuousMode}
                      aria-pressed={voiceState.continuousMode}
                      title="Keep microphone active across multiple voice commands"
                      className={`hw-btn px-2 py-1 rounded-lg font-mono text-[9.5px] cursor-pointer ${
                        voiceState.continuousMode ? 'hw-btn-amber font-bold' : 'text-[#91a4bd]'
                      }`}
                    >
                      {voiceState.continuousMode ? 'Hands-Free' : 'Single Cmd'}
                    </button>
                    <button
                      type="button"
                      onClick={handleStartListening}
                      className={`hw-btn px-2.5 py-1 rounded-lg font-mono text-[10px] flex items-center gap-1 cursor-pointer ${
                        voiceState.isListening
                          ? 'bg-[#2a1019] border-[#ff4d62] text-[#ff8594]'
                          : 'hw-btn-green'
                      }`}
                    >
                      {voiceState.isListening ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                      {voiceState.isListening ? 'Listening...' : 'Speak'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    {
                      label: voiceState.language === 'TL' ? 'Check Pin 5 V' : 'Check Pin 5 V',
                      cmd:
                        voiceState.language === 'TL'
                          ? 'Check mo yung voltage sa Pin 5'
                          : 'What is the voltage on Pin 5?',
                    },
                    {
                      label: voiceState.language === 'TL' ? 'Test TPS' : 'How to test TPS',
                      cmd:
                        voiceState.language === 'TL'
                          ? 'Ano ang expected voltage ng TPS?'
                          : 'How do I test the TPS?',
                    },
                    { label: 'Read Meter', cmd: 'Read meter' },
                    { label: 'Black → GND', cmd: 'Attach black probe to ground' },
                    { label: 'ECU Pinouts', cmd: 'Open the ECU Pinouts' },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => {
                        if (!voiceNavEnabled) setVoiceNavEnabled(true);
                        executeVoiceOrTextQuery(chip.cmd, 'QUICK_CHIP');
                      }}
                      className="hw-btn px-2 py-1 rounded-lg text-[10px] font-mono text-[#d4e3f6] hover:text-white cursor-pointer"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSubmitCommand} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    placeholder={
                      voiceState.language === 'TL'
                        ? 'Say or type: "Check mo yung voltage sa Pin 5"'
                        : 'Say or type: "How do I test the TPS?"'
                    }
                    aria-label="Offline voice command input"
                    className="flex-1 min-w-0 min-h-[36px] bg-[#050a12] border border-[#203653] focus:border-[#19c8f5] rounded-lg px-2.5 py-1 text-[11px] text-[#eaf3ff] placeholder:text-[#6f87a6] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="hw-btn hw-btn-blue min-h-[36px] px-2.5 py-1.5 rounded-lg font-bold shrink-0 cursor-pointer"
                    aria-label="Execute offline voice command"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Non-Floating Docked Hardware Console Bar */}
      <div className="hud-panel rounded-xl border-[#203653] px-2 lg:px-2.5 py-1.5 lg:py-1 flex flex-wrap lg:flex-nowrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 flex-wrap lg:flex-nowrap min-w-0">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            title="Open quick bench container & voice drawer"
            className={`hw-btn min-h-[36px] lg:min-h-[30px] flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer ${
              isExpanded || isContainerMoveMode ? 'hw-btn-blue' : 'text-[#eaf3ff]'
            }`}
          >
            <LabDrawerIcon name="mini-slider" size={24} className="w-3.5 h-3.5 shrink-0" />
            <span>{isContainerMoveMode ? 'MOVE' : 'NAV'}</span>
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>

          {showPinScopeButton && onTogglePinScope && (
            <button
              type="button"
              onClick={onTogglePinScope}
              aria-expanded={isPinScopeOpen}
              aria-label="Toggle pin oscilloscope inspector"
              className={`hw-btn min-h-[36px] lg:min-h-[30px] flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer ${
                isPinScopeOpen ? 'hw-btn-green' : 'text-[#eaf3ff]'
              }`}
            >
              <LabDrawerIcon name="active-drawer" size={24} className="w-3.5 h-3.5 shrink-0" />
              <span className="sm:hidden">Scope</span>
              <span className="hidden sm:inline">Pin Scope</span>
              {pinScopeSummary && (
                <span className="hidden sm:inline text-[#19c8f5] tabular-nums">{pinScopeSummary}</span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const curIdx = paneOrder.indexOf(mobileBenchPane);
              const nextPane = paneOrder[(curIdx + 1) % paneOrder.length];
              onNavigateTab('BENCH_LAB');
              onSelectMobilePane(nextPane);
            }}
            className="hw-btn flex lg:hidden min-h-[36px] items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono text-[#eaf3ff] cursor-pointer"
            title="Switch next mobile bench container"
            aria-label="Next bench container"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-[#19c8f5] shrink-0" />
            <span className="sm:hidden">
              {mobileBenchPane === 'INSTRUMENTS' ? 'Rack' : mobileBenchPane === 'CANVAS' ? 'Map' : 'Guide'}
            </span>
            <span className="hidden sm:inline">{PANE_LABELS[mobileBenchPane]}</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap lg:flex-nowrap shrink-0">
          <button
            type="button"
            data-testid="floating-voice-lang-toggle"
            onClick={handleToggleLanguage}
            title="Toggle shared voice language between Taglish (TL) and English (EN)"
            className="hw-btn min-h-[36px] lg:min-h-[30px] flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono font-bold text-[#19c8f5] whitespace-nowrap cursor-pointer"
          >
            <Globe className="w-3 h-3 shrink-0" />
            <span>{voiceState.language}</span>
          </button>

          <button
            type="button"
            data-testid="floating-voice-fab"
            aria-pressed={onOpenAiCoach ? isAiCoachOpen : voiceNavEnabled}
            onClick={onOpenAiCoach ?? handleToggleVoiceNav}
            className={`hw-btn min-h-[36px] lg:min-h-[30px] flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer ${
              (onOpenAiCoach ? isAiCoachOpen : voiceNavEnabled) ? 'hw-btn-green' : 'text-[#d4e3f6]'
            }`}
            title="Open Unified AI Coach (Natural Taglish Voice Coach & Diagnostic Assistant)"
          >
            <Headphones className="w-3.5 h-3.5 shrink-0 text-[#19c8f5]" />
            <span>AI Coach</span>
          </button>

          {onToggleVoiceLog && (
            <button
              type="button"
              onClick={onToggleVoiceLog}
              aria-pressed={isVoiceLogOpen}
              aria-label="Toggle voice command log sidebar"
              className={`hw-btn min-h-[36px] lg:min-h-[30px] flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold whitespace-nowrap cursor-pointer ${
                isVoiceLogOpen ? 'hw-btn-blue' : 'text-[#d4e3f6]'
              }`}
            >
              <LabDrawerIcon name="slide-out" size={24} className="w-3.5 h-3.5 shrink-0" />
              <span>Log</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
