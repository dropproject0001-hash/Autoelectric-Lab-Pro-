/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
  Bot,
  ChevronDown,
  ChevronUp,
  Headphones,
  History,
  Layers,
  Mic,
  MicOff,
  Move,
  RotateCcw,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { SavedBenchSession, SavedDiagnosticLog } from '../services/benchStorageService';
import { LiveBenchContext, OfflineDiagnosticChatbot } from '../services/offlineChatbotEngine';
import {
  offlineVoiceAssistant,
  VoiceAssistantState,
  VoiceCommandLogSource,
  VoiceResultMetadata,
} from '../services/offlineVoiceService';
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

  const announceVoiceResult = useCallback(
    (title: string, detail: string, speakText?: string) => {
      setVoiceResult({ title, detail, timestamp: Date.now() });
      if (voiceNavEnabled) {
        offlineVoiceAssistant.speak(speakText ?? detail, true);
      }
    },
    [voiceNavEnabled]
  );

  const prevLabSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    const dtcCodes = circuitSolution.activeDTCs.map((d) => d.code).join(',');
    const signature = [
      activeTab,
      mobileBenchPane,
      powerSupply.isOutputEnabled ? '1' : '0',
      powerSupply.voltageSetting.toFixed(1),
      multimeter.mode,
      multimeter.redProbe.attachedToPinId || 'none',
      multimeter.blackProbe.attachedToPinId || 'none',
      faults.length,
      dtcCodes,
    ].join('|');

    if (!voiceNavEnabled) {
      prevLabSignatureRef.current = signature;
      return;
    }

    const prev = prevLabSignatureRef.current;
    prevLabSignatureRef.current = signature;
    if (!prev || prev === signature) return;

    const prevParts = prev.split('|');
    const [
      prevTab,
      prevPane,
      prevPwrOn,
      prevVolts,
      prevMode,
      prevRed,
      prevBlack,
      prevFaultCount,
      prevDtcs,
    ] = prevParts;

    if (dtcCodes !== prevDtcs || String(faults.length) !== prevFaultCount) {
      if (circuitSolution.activeDTCs.length > 0) {
        const dtcMsg = `${circuitSolution.activeDTCs.length} Active DTC: ${circuitSolution.activeDTCs
          .map((d) => `${d.code} ${d.description}`)
          .join('; ')}`;
        announceVoiceResult(
          'Fault / DTC Alert',
          dtcMsg,
          `Fault detected. Active D T C ${circuitSolution.activeDTCs.map((d) => d.code).join(' and ')}.`
        );
      } else if (faults.length > 0) {
        const latestFault = faults[faults.length - 1];
        const msg = `${latestFault.description} (${latestFault.faultType}) · DMM ${circuitSolution.multimeterReading.display} ${circuitSolution.multimeterReading.unit} · 0 DTC`;
        announceVoiceResult(
          'Fault Injected',
          msg,
          `Fault injected: ${latestFault.description}. Multimeter reads ${circuitSolution.multimeterReading.display} ${circuitSolution.multimeterReading.unit}.`
        );
      } else {
        const msg = `Nominal recovery · 0 active DTCs · PSU drawing ${circuitSolution.supplyCurrentDrawAmps.toFixed(2)}A`;
        announceVoiceResult(
          'Nominal Recovery',
          msg,
          'All faults cleared. Nominal bench state restored.'
        );
      }
      return;
    }

    if (
      multimeter.redProbe.attachedToPinId !== prevRed ||
      multimeter.blackProbe.attachedToPinId !== prevBlack ||
      multimeter.mode !== prevMode
    ) {
      const targetLabel = multimeter.redProbe.attachedLabel || 'probe';
      const warning = circuitSolution.multimeterReading.warningMessage;
      const readingText = warning
        ? warning
        : `${targetLabel} (${multimeter.mode}): ${circuitSolution.multimeterReading.display} ${circuitSolution.multimeterReading.unit}`;
      announceVoiceResult(
        `DMM · ${multimeter.mode}`,
        readingText,
        warning
          ? `Multimeter warning. ${warning}`
          : `Probe on ${targetLabel}. Reading ${circuitSolution.multimeterReading.display} ${circuitSolution.multimeterReading.unit}.`
      );
      return;
    }

    if (
      (powerSupply.isOutputEnabled ? '1' : '0') !== prevPwrOn ||
      powerSupply.voltageSetting.toFixed(1) !== prevVolts
    ) {
      const msg = powerSupply.isOutputEnabled
        ? `PSU ON · ${powerSupply.voltageSetting.toFixed(1)}V · ${circuitSolution.supplyCurrentDrawAmps.toFixed(2)}A`
        : 'PSU Output OFF (Key-OFF)';
      announceVoiceResult(
        'Power Supply Updated',
        msg,
        powerSupply.isOutputEnabled
          ? `Power supply on at ${powerSupply.voltageSetting.toFixed(1)} volts, drawing ${circuitSolution.supplyCurrentDrawAmps.toFixed(2)} amps.`
          : 'Power supply output switched off.'
      );
      return;
    }

    if (activeTab !== prevTab || mobileBenchPane !== prevPane) {
      const viewLabel =
        activeTab === 'BENCH_LAB'
          ? `Bench Lab · ${PANE_LABELS[mobileBenchPane]}`
          : activeTab.replace(/_/g, ' ');
      announceVoiceResult('Workspace Navigation', viewLabel, `Focused ${viewLabel}.`);
    }
  }, [
    voiceNavEnabled,
    activeTab,
    mobileBenchPane,
    powerSupply.isOutputEnabled,
    powerSupply.voltageSetting,
    multimeter.mode,
    multimeter.redProbe.attachedToPinId,
    multimeter.redProbe.attachedLabel,
    multimeter.blackProbe.attachedToPinId,
    faults,
    circuitSolution.activeDTCs,
    circuitSolution.supplyCurrentDrawAmps,
    circuitSolution.multimeterReading.display,
    circuitSolution.multimeterReading.unit,
    circuitSolution.multimeterReading.warningMessage,
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

      const voiceActions: VoiceCommandActions = {
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
              const matching = wires.filter(
                (w) => w.sourcePinId === pinId || w.targetPinId === pinId
              );
              matching.forEach((w) => onDeleteWire(w.id));
              return matching.length;
            }
          : undefined,
        toggleCutWireByPin: onToggleCutWire
          ? (pinId, cut) => {
              const matching = wires.filter((w) => {
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
                const existing = faults.find((f) => f.pinId === pinId);
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
              const existed = faults.some((f) => f.pinId === pinId);
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
              const currentSet = new Set(checkedWorkflowIds ?? []);
              const evaluated = evaluateWorkflowSteps(
                {
                  powerSupply,
                  pins,
                  wires,
                  faults,
                  activeDTCs: circuitSolution.activeDTCs,
                  nodeVoltages: circuitSolution.nodeVoltages,
                  supplyCurrentDrawAmps: circuitSolution.supplyCurrentDrawAmps,
                  isSupplyCurrentTripped: circuitSolution.isSupplyCurrentTripped,
                  multimeter,
                  multimeterReading: circuitSolution.multimeterReading,
                  ecuProfileLabel: vehicleContext?.modelName,
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
        readMeter: () => ({
          display: circuitSolution.multimeterReading.display,
          unit: circuitSolution.multimeterReading.unit,
          dtcCount: circuitSolution.activeDTCs.length,
          supplyVolts: powerSupply.voltageSetting,
          isPowerOn: powerSupply.isOutputEnabled,
          supplyAmps: circuitSolution.supplyCurrentDrawAmps,
        }),
      };

      const matchedMacro = voiceMacroService.findMatchingMacro(trimmed);
      if (matchedMacro) {
        const macroResult = executeMacroSequence(matchedMacro, pins, voiceActions);
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
        return;
      }

      const cmd = parseAndExecuteVoiceCommand(trimmed, pins, voiceActions);

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
        if (cmd.alreadySpoken) {
          setVoiceResult({
            title: `Voice Cmd: "${trimmed}"`,
            detail: cmd.actionDescription,
            timestamp: Date.now(),
          });
        } else {
          announceVoiceResult(`Voice Cmd: "${trimmed}"`, cmd.actionDescription, cmd.spokenReply);
        }
        return;
      }

      const engine = botEngine ?? new OfflineDiagnosticChatbot(savedLogs, savedSessions);
      const reply = engine.ask(trimmed, liveContext);
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
      });
      if (source === 'SPEECH_API') {
        onOpenVoiceLog?.();
      }
      announceVoiceResult(`Offline AI: "${trimmed}"`, cleanSummary, reply.answer);
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

  const latestQueryExecutorRef = useRef(executeVoiceOrTextQuery);
  useEffect(() => {
    latestQueryExecutorRef.current = executeVoiceOrTextQuery;
    if (commandExecutorRef) {
      commandExecutorRef.current = executeVoiceOrTextQuery;
    }
    return () => {
      if (commandExecutorRef) {
        commandExecutorRef.current = null;
      }
    };
  }, [executeVoiceOrTextQuery, commandExecutorRef]);

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
        detail: 'Use Chrome, Edge, or Safari for microphone voice commands, or type a command below (e.g. "Connect pin 5 to ground", "Set multimeter to 20 volts").',
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
      {(voiceState.isListening || voiceState.error || (voiceNavEnabled && voiceResult) || isExpanded) && (
        <div className="absolute bottom-full left-0 right-0 mb-2 flex flex-col items-end gap-2 pointer-events-none z-40">
          {voiceState.isListening && (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-auto w-full sm:w-[368px] hud-panel border-[#ff4d62]/70 rounded-xl px-3.5 py-2.5 shadow-2xl text-[11px]"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono font-bold text-[#ff8594] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#ff4d62] animate-ping" />
                  Listening{voiceState.continuousMode ? ' (Continuous)' : ''}...
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
                  : 'Say: "Connect pin 5 to ground" or "Set multimeter to 20 volts"'}
              </p>
            </div>
          )}

          {voiceState.error && (
            <div
              role="alert"
              className="pointer-events-auto w-full sm:w-[368px] hud-panel border-[#ffb020]/60 rounded-xl px-3.5 py-2.5 shadow-2xl text-[11px]"
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

          {voiceNavEnabled && voiceResult && (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-auto w-full sm:w-[368px] hud-panel border-[#20d889]/55 rounded-xl px-3.5 py-2.5 shadow-2xl text-[11px]"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono font-bold text-[#20d889] flex items-center gap-1.5 truncate">
                  <Volume2 className="w-3.5 h-3.5 text-[#20d889] shrink-0" />
                  {voiceResult.title}
                </span>
                <div className="flex items-center gap-1 shrink-0">
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
            </div>
          )}

          {isExpanded && (
            <div
              aria-label="Quick Navigator Drawer"
              className="pointer-events-auto w-full sm:w-[392px] hud-panel border-[#203653] rounded-xl p-3 shadow-2xl space-y-3 text-[11px]"
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
              </div>

              {/* Offline AI Voice Quick Actions & Command Input */}
              <div className="border-t border-[#203653]/80 pt-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#20d889] flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5" />
                    Voice Bench Control
                  </span>
                  <div className="flex items-center gap-1 flex-wrap">
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
                    { label: 'Pin 5 → GND', cmd: 'Connect pin 5 to ground' },
                    { label: 'DMM 20V', cmd: 'Set multimeter to 20 volts' },
                    { label: 'Read Meter', cmd: 'Read meter' },
                    { label: 'Black → GND', cmd: 'Attach black probe to ground' },
                    { label: 'Oscilloscope', cmd: 'Open oscilloscope' },
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
                    placeholder='Say or type: "Connect pin 5 to ground"'
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
