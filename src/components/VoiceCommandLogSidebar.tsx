/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Layers,
  Mic,
  MicOff,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  offlineVoiceAssistant,
  VoiceAssistantState,
  VoiceCommandLogEntry,
  VoiceCommandLogSource,
  VoiceCommandLogStatus,
} from '../services/offlineVoiceService';
import {
  COMMON_MACRO_STEP_SNIPPETS,
  VoiceMacro,
  voiceMacroService,
} from '../services/voiceMacroService';
import type {
  EcuPin,
  FaultType,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
} from '../types/ecu';
import type { RpmEmulatorState } from '../utils/vehicleEcuRegistry';
import { previewMacroStep } from '../utils/voiceCommandParser';
import { VoiceMacroMappingPanel } from './VoiceMacroMappingPanel';
import { LabDrawerIcon } from './icons/LabDrawerIcons';

export type VoiceSidebarSection = 'LOG' | 'MACROS';
type HistoryFilter = 'ALL' | 'EXECUTED' | 'ISSUES';

export interface VoiceCommandLogSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  history: VoiceCommandLogEntry[];
  voiceState: VoiceAssistantState;
  pins: EcuPin[];
  activeSection?: VoiceSidebarSection;
  onChangeActiveSection?: (section: VoiceSidebarSection) => void;
  onToggleListening: () => void;
  onToggleContinuousMode: () => void;
  onRunCommand: (transcript: string, source: VoiceCommandLogSource) => void;
  powerSupply?: PowerSupplyState;
  onChangePowerSupply?: React.Dispatch<React.SetStateAction<PowerSupplyState>>;
  multimeter?: MultimeterState;
  onChangeMultimeter?: React.Dispatch<React.SetStateAction<MultimeterState>>;
  manualRangeLabel?: string | null;
  onSetManualRangeLabel?: (label: string | null) => void;
  onAttachProbe?: (color: 'red' | 'black', pinId: string, label: string) => void;
  onAddWire?: (sourcePinId: string, targetPinId: string, color?: string, label?: string) => void;
  faults?: InjectedFault[];
  onAddFault?: (pinId: string, faultType: FaultType, description: string) => void;
  onRemoveFault?: (pinId: string) => void;
  onClearAllFaults?: () => void;
  rpmEmulator?: RpmEmulatorState;
  onChangeRpmEmulator?: React.Dispatch<React.SetStateAction<RpmEmulatorState>>;
  onOpenMacroLibrary?: () => void;
}

const SOURCE_LABELS: Record<VoiceCommandLogSource, string> = {
  SPEECH_API: 'Speech API',
  QUICK_CHIP: 'Quick Command',
  TEXT_INPUT: 'Manual Input',
};

const CATEGORY_LABELS: Record<string, string> = {
  WIRING: 'Wiring',
  MULTIMETER: 'Multimeter',
  POWER: 'Power Supply',
  PROBES: 'Probes',
  NAVIGATION: 'Navigation',
  FAULT: 'Fault Matrix',
  DIAGNOSTIC: 'Diagnostic',
  RPM: 'RPM Emulator',
  MACRO: 'Macro Sequence',
  SYSTEM: 'System',
};

function formatTimeTabular(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '--:--:--';
  }
}

function renderStatusLabel(status: VoiceCommandLogStatus) {
  switch (status) {
    case 'EXECUTED':
      return (
        <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px] font-mono">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Executed</span>
        </span>
      );
    case 'FALLBACK':
      return (
        <span className="inline-flex items-center gap-1 text-amber-300 font-semibold text-[11px] font-mono">
          <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>AI Diagnostic</span>
        </span>
      );
    case 'FAILED':
      return (
        <span className="inline-flex items-center gap-1 text-amber-400 font-semibold text-[11px] font-mono">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Partial / Unmatched</span>
        </span>
      );
    case 'ERROR':
      return (
        <span className="inline-flex items-center gap-1 text-rose-400 font-semibold text-[11px] font-mono">
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Mic Error</span>
        </span>
      );
  }
}

export const VoiceCommandLogSidebar: React.FC<VoiceCommandLogSidebarProps> = ({
  isOpen,
  onClose,
  history,
  voiceState,
  pins,
  activeSection: controlledSection,
  onChangeActiveSection,
  onToggleListening,
  onToggleContinuousMode,
  onRunCommand,
  powerSupply,
  onChangePowerSupply,
  multimeter,
  onChangeMultimeter,
  manualRangeLabel,
  onSetManualRangeLabel,
  onAttachProbe,
  onAddWire,
  faults,
  onAddFault,
  onRemoveFault,
  onClearAllFaults,
  rpmEmulator,
  onChangeRpmEmulator,
  onOpenMacroLibrary,
}) => {
  const [internalSection, setInternalSection] = useState<VoiceSidebarSection>('LOG');
  const activeSection = controlledSection ?? internalSection;
  const setActiveSection = (next: VoiceSidebarSection) => {
    if (onChangeActiveSection) onChangeActiveSection(next);
    else setInternalSection(next);
  };

  const [filter, setFilter] = useState<HistoryFilter>('ALL');
  const [testInput, setTestInput] = useState('');

  // Custom voice macros state
  const [macros, setMacros] = useState<VoiceMacro[]>(() => voiceMacroService.getMacros());
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingMacroId, setEditingMacroId] = useState<string | null>(null);
  const [macroNameInput, setMacroNameInput] = useState('');
  const [triggerPhraseInput, setTriggerPhraseInput] = useState('');
  const [stepInputs, setStepInputs] = useState<string[]>([
    'Connect Power',
    'Set 12V',
    'Engage Ignition',
  ]);
  const [builderError, setBuilderError] = useState<string | null>(null);

  useEffect(() => {
    return voiceMacroService.subscribeMacros(setMacros);
  }, []);

  const counts = useMemo(() => {
    let executed = 0;
    let issues = 0;
    for (const item of history) {
      if (item.status === 'EXECUTED' || item.status === 'FALLBACK') executed += 1;
      else issues += 1;
    }
    return { total: history.length, executed, issues };
  }, [history]);

  const filteredHistory = useMemo(() => {
    if (filter === 'ALL') return history;
    if (filter === 'EXECUTED') {
      return history.filter((item) => item.status === 'EXECUTED' || item.status === 'FALLBACK');
    }
    return history.filter((item) => item.status === 'FAILED' || item.status === 'ERROR');
  }, [history, filter]);

  const stepPreviews = useMemo(
    () => stepInputs.map((step) => previewMacroStep(step, pins)),
    [stepInputs, pins]
  );

  if (!isOpen) return null;

  const handleSubmitTest = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = testInput.trim();
    if (!trimmed) return;
    onRunCommand(trimmed, 'TEXT_INPUT');
    setTestInput('');
  };

  const openNewMacroBuilder = () => {
    setEditingMacroId(null);
    setMacroNameInput('');
    setTriggerPhraseInput('');
    setStepInputs(['Connect Power', 'Set 12V', 'Engage Ignition']);
    setBuilderError(null);
    setIsBuilderOpen(true);
  };

  const openEditMacroBuilder = (macro: VoiceMacro) => {
    setEditingMacroId(macro.id);
    setMacroNameInput(macro.name);
    setTriggerPhraseInput(macro.triggerPhrase);
    setStepInputs(macro.steps.length > 0 ? [...macro.steps] : ['']);
    setBuilderError(null);
    setIsBuilderOpen(true);
  };

  const handleCancelBuilder = () => {
    setIsBuilderOpen(false);
    setEditingMacroId(null);
    setBuilderError(null);
  };

  const handleUpdateStep = (index: number, value: string) => {
    setStepInputs((prev) => prev.map((s, i) => (i === index ? value : s)));
  };

  const handleMoveStep = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    setStepInputs((prev) => {
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleRemoveStep = (index: number) => {
    setStepInputs((prev) => {
      if (prev.length <= 1) return [''];
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleAppendSnippet = (instruction: string) => {
    setStepInputs((prev) => {
      const emptyIdx = prev.findIndex((s) => s.trim() === '');
      if (emptyIdx >= 0) {
        return prev.map((s, i) => (i === emptyIdx ? instruction : s));
      }
      if (prev.length >= 20) return prev;
      return [...prev, instruction];
    });
  };

  const handleSaveMacro = (e: React.FormEvent) => {
    e.preventDefault();
    const trigger = triggerPhraseInput.trim();
    const cleanSteps = stepInputs.map((s) => s.trim()).filter(Boolean);
    if (!trigger) {
      setBuilderError('Enter a spoken voice trigger phrase (e.g. "Bench Power Up").');
      return;
    }
    if (cleanSteps.length === 0) {
      setBuilderError('Add at least one sequential bench instruction.');
      return;
    }

    if (editingMacroId) {
      voiceMacroService.updateMacro(editingMacroId, {
        name: macroNameInput.trim() || trigger,
        triggerPhrase: trigger,
        steps: cleanSteps,
      });
    } else {
      voiceMacroService.createMacro({
        name: macroNameInput.trim() || trigger,
        triggerPhrase: trigger,
        steps: cleanSteps,
      });
    }
    setIsBuilderOpen(false);
    setEditingMacroId(null);
    setBuilderError(null);
  };

  return (
    <aside
      aria-label="Voice Command Log Sidebar"
      data-testid="voice-command-log-sidebar"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[400px] flex-col border-l border-[#343c4b] bg-[#13171f] text-slate-100 shadow-[0_12px_36px_rgba(0,0,0,0.65)] sm:absolute sm:inset-y-0 sm:right-0"
    >
      {/* Sidebar Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[#2a313d] bg-[#171c25] px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-[2px] hw-lcd-well border-[#343c4b] flex items-center justify-center shrink-0">
            <LabDrawerIcon name="slide-out" size={24} className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="font-hud text-sm font-bold uppercase tracking-wider text-slate-100">
              Voice Control &amp; Macros
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-slate-400">
              <span>{counts.total} logged</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400">{counts.executed} parsed</span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-300">{macros.length} macros</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {activeSection === 'LOG' && (
            <button
              type="button"
              onClick={() => offlineVoiceAssistant.clearCommandHistory()}
              disabled={history.length === 0}
              title="Clear voice command log history"
              aria-label="Clear voice command log"
              className="hw-btn inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-[2px] text-slate-400 transition-colors hover:text-slate-100 disabled:opacity-40 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            title="Close voice command log sidebar"
            aria-label="Close voice command log sidebar"
            className="hw-btn inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-[2px] text-slate-300 transition-colors hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Live SpeechRecognition Telemetry & Mic Trigger */}
      <div className="border-b border-[#2a313d] bg-[#11151d] px-4 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onToggleListening}
            className={`hw-btn inline-flex min-h-[38px] flex-1 items-center justify-center gap-2 rounded-[2px] px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer ${
              voiceState.isListening
                ? 'border-rose-500/70 bg-rose-950/70 text-rose-200'
                : 'hw-btn-green'
            }`}
          >
            {voiceState.isListening ? (
              <MicOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Mic className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>{voiceState.isListening ? 'Stop Listening' : 'Listen for Command'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleContinuousMode}
            aria-pressed={voiceState.continuousMode}
            className={`hw-btn inline-flex min-h-[38px] shrink-0 items-center justify-center rounded-[2px] px-3 py-2 text-xs font-mono font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              voiceState.continuousMode
                ? 'hw-btn-amber'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {voiceState.continuousMode ? 'Hands-Free On' : 'Single Shot'}
          </button>
        </div>

        {/* Live Recognition Stream Readout */}
        <div className="hw-lcd-well rounded-[2px] px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-[1px] ${
                  voiceState.isListening ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
                }`}
                aria-hidden="true"
              />
              <span>
                {!voiceState.hasSpeechRecognition
                  ? 'SpeechRecognition unavailable'
                  : voiceState.isListening
                  ? 'Streaming SpeechRecognition...'
                  : 'SpeechRecognition ready'}
              </span>
            </span>
            {voiceState.selectedVoiceName && (
              <span className="truncate max-w-[130px] text-slate-500">en-US</span>
            )}
          </div>
          {voiceState.interimTranscript && (
            <p className="mt-1.5 font-mono text-xs text-emerald-300 break-words">
              “{voiceState.interimTranscript}”
            </p>
          )}
          {voiceState.error && (
            <p className="mt-1.5 text-[11px] text-amber-300">{voiceState.error}</p>
          )}
        </div>

        {/* Primary Section Segmented Switch: Command Log vs Macros */}
        <div
          role="tablist"
          aria-label="Voice sidebar sections"
          className="grid grid-cols-2 gap-1 rounded-[2px] bg-[#0b0e14] p-1 border border-[#2a313d]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'LOG'}
            onClick={() => setActiveSection('LOG')}
            className={`rounded-[2px] px-2 py-1.5 text-xs font-mono uppercase tracking-wide transition-colors whitespace-nowrap cursor-pointer ${
              activeSection === 'LOG'
                ? 'hw-btn-amber font-bold'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            Command Log ({counts.total})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'MACROS'}
            onClick={() => setActiveSection('MACROS')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-[2px] px-2 py-1.5 text-xs font-mono uppercase tracking-wide transition-colors whitespace-nowrap cursor-pointer ${
              activeSection === 'MACROS'
                ? 'hw-btn-amber font-bold'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Macros ({macros.length})</span>
          </button>
        </div>

        {/* Secondary Filter Tabs (Command Log view) */}
        {activeSection === 'LOG' && (
          <div
            role="tablist"
            aria-label="Filter voice command log"
            className="grid grid-cols-3 gap-1 rounded-[2px] bg-[#0b0e14] p-1 border border-[#2a313d]"
          >
            {(
              [
                { id: 'ALL', label: `All (${counts.total})` },
                { id: 'EXECUTED', label: `Parsed (${counts.executed})` },
                { id: 'ISSUES', label: `Issues (${counts.issues})` },
              ] as const
            ).map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(tab.id)}
                  className={`rounded-[2px] px-2 py-1.5 text-[11px] font-mono transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'hw-btn-green font-bold'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Scrollable Content */}
      {activeSection === 'LOG' ? (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 min-h-0">
          {filteredHistory.length === 0 ? (
            <div className="hw-lcd-well rounded-[2px] p-4 text-center space-y-2">
              <p className="text-xs font-mono font-semibold text-slate-200">
                {history.length === 0
                  ? 'No voice commands recorded yet'
                  : 'No commands match this filter'}
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Speak instructions such as “Connect pin 5 to ground”, “Set multimeter to 20 volts”,
                or trigger a custom macro like “Bench Power Up”.
              </p>
            </div>
          ) : (
            filteredHistory.map((entry) => {
              const showNormalized =
                Boolean(entry.normalizedTranscript) &&
                entry.normalizedTranscript !== entry.rawTranscript.trim().toLowerCase();

              return (
                <article
                  key={entry.id}
                  className="rounded-[2px] border border-[#2b323f] bg-[#171c25] p-3 space-y-1.5"
                >
                  {/* Row 1: Explicit Status + Unboxed Tabular Metadata */}
                  <div className="flex items-center justify-between gap-2">
                    {renderStatusLabel(entry.status)}
                    <div className="flex items-center gap-1.5 text-[10px] font-mono tabular-nums text-slate-400 truncate">
                      <span>{formatTimeTabular(entry.timestamp)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{SOURCE_LABELS[entry.source]}</span>
                      {typeof entry.confidence === 'number' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{Math.round(entry.confidence * 100)}%</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Verbatim Recognized Speech */}
                  <p className="text-xs font-medium text-slate-100 break-words">
                    “{entry.rawTranscript}”
                  </p>

                  {/* Row 3: Normalized Parser Interpretation */}
                  {showNormalized && (
                    <p className="text-[11px] font-mono text-amber-300 break-words">
                      Parsed as: {entry.normalizedTranscript}
                    </p>
                  )}

                  {/* Row 4: Action Summary */}
                  <p className="text-[11px] text-slate-300 leading-snug break-words">
                    {entry.actionDescription}
                  </p>

                  {/* Row 5: Unboxed Category & Replay Action */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#252c38] text-[10px] font-mono text-slate-400">
                    <span>{CATEGORY_LABELS[entry.category] || entry.category}</span>
                    {entry.status !== 'ERROR' && (
                      <button
                        type="button"
                        onClick={() => onRunCommand(entry.rawTranscript, 'QUICK_CHIP')}
                        className="hw-btn inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 font-medium transition-colors rounded-[2px] px-1.5 py-0.5 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" aria-hidden="true" />
                        <span>Replay</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {powerSupply && onChangePowerSupply && multimeter && onChangeMultimeter && (
            <VoiceMacroMappingPanel
              pins={pins}
              powerSupply={powerSupply}
              onChangePowerSupply={onChangePowerSupply}
              multimeter={multimeter}
              onChangeMultimeter={onChangeMultimeter}
              manualRangeLabel={manualRangeLabel}
              onSetManualRangeLabel={onSetManualRangeLabel}
              onAttachProbe={onAttachProbe}
              onAddWire={onAddWire}
              faults={faults}
              onAddFault={onAddFault}
              onRemoveFault={onRemoveFault}
              onClearAllFaults={onClearAllFaults}
              rpmEmulator={rpmEmulator}
              onChangeRpmEmulator={onChangeRpmEmulator}
              onOpenMacroLibrary={onOpenMacroLibrary}
              onRunVoiceTranscript={(phrase: string) => onRunCommand(phrase, 'QUICK_CHIP')}
              variant="sidebar"
            />
          )}

          {/* Macros Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={openNewMacroBuilder}
                className="hw-btn hw-btn-green inline-flex min-h-[36px] items-center gap-1.5 rounded-[2px] px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>New Macro</span>
              </button>

              {onOpenMacroLibrary && (
                <button
                  type="button"
                  onClick={onOpenMacroLibrary}
                  className="hw-btn hw-btn-amber inline-flex min-h-[36px] items-center gap-1.5 rounded-[2px] px-2.5 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Library &amp; Record</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => voiceMacroService.resetPresets()}
              className="hw-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-[2px] px-2.5 py-1.5 text-[11px] font-mono text-slate-300 transition-colors hover:text-white whitespace-nowrap cursor-pointer"
              title="Restore default factory bench macros"
            >
              <RotateCcw className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span>Restore Presets</span>
            </button>
          </div>

          {/* Inline Macro Builder Form */}
          {isBuilderOpen && (
            <form
              onSubmit={handleSaveMacro}
              aria-label="Custom Voice Macro Builder"
              className="rounded-[2px] border border-amber-500/45 bg-[#171c25] p-3 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
                  {editingMacroId ? 'Edit Voice Macro' : 'Create Voice Macro'}
                </h3>
                <button
                  type="button"
                  onClick={handleCancelBuilder}
                  className="text-[11px] font-mono text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded-[2px] cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div className="space-y-2">
                <div>
                  <label
                    htmlFor="macro-trigger-input"
                    className="block text-[11px] font-mono text-slate-300 mb-1"
                  >
                    Voice Trigger Phrase
                  </label>
                  <input
                    id="macro-trigger-input"
                    type="text"
                    value={triggerPhraseInput}
                    onChange={(e) => {
                      setTriggerPhraseInput(e.target.value);
                      setBuilderError(null);
                    }}
                    placeholder='e.g. "Bench Power Up" or "Start ECU Check"'
                    className="w-full rounded-[2px] border border-[#323a48] bg-[#0b0e14] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="macro-name-input"
                    className="block text-[11px] font-mono text-slate-300 mb-1"
                  >
                    Macro Title (optional)
                  </label>
                  <input
                    id="macro-name-input"
                    type="text"
                    value={macroNameInput}
                    onChange={(e) => setMacroNameInput(e.target.value)}
                    placeholder="Defaults to trigger phrase"
                    className="w-full rounded-[2px] border border-[#323a48] bg-[#0b0e14] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Ordered Steps Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-slate-300">
                    Sequential Bench Steps ({stepInputs.length})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setStepInputs((prev) => (prev.length < 20 ? [...prev, ''] : prev))
                    }
                    className="hw-btn inline-flex items-center gap-1 text-[11px] font-mono text-amber-300 hover:text-amber-200 px-2 py-0.5 rounded-[2px] cursor-pointer"
                  >
                    <Plus className="w-3 h-3" aria-hidden="true" />
                    <span>Add Step</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {stepInputs.map((stepVal, idx) => {
                    const preview = stepPreviews[idx];
                    const hasText = stepVal.trim().length > 0;
                    const isValidStep =
                      hasText && preview.matched && preview.status !== 'FAILED';

                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                            {String(idx + 1).padStart(2, '0')}.
                          </span>
                          <input
                            type="text"
                            value={stepVal}
                            onChange={(e) => {
                              handleUpdateStep(idx, e.target.value);
                              setBuilderError(null);
                            }}
                            aria-label={`Macro step ${idx + 1}`}
                            placeholder='e.g. "Connect Power", "Set 12V", "Engage Ignition"'
                            className="flex-1 min-w-0 rounded-[2px] border border-[#323a48] bg-[#0b0e14] px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleMoveStep(idx, -1)}
                            disabled={idx === 0}
                            aria-label={`Move step ${idx + 1} up`}
                            className="hw-btn inline-flex h-7 w-7 items-center justify-center rounded-[2px] text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3 h-3" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveStep(idx, 1)}
                            disabled={idx === stepInputs.length - 1}
                            aria-label={`Move step ${idx + 1} down`}
                            className="hw-btn inline-flex h-7 w-7 items-center justify-center rounded-[2px] text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3 h-3" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveStep(idx)}
                            aria-label={`Remove step ${idx + 1}`}
                            className="hw-btn inline-flex h-7 w-7 items-center justify-center rounded-[2px] text-slate-400 hover:text-rose-300 cursor-pointer"
                          >
                            <X className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </div>

                        {hasText && (
                          <p
                            className={`pl-6 text-[10px] font-mono ${
                              isValidStep ? 'text-emerald-400' : 'text-amber-300'
                            }`}
                          >
                            {isValidStep
                              ? `✓ ${CATEGORY_LABELS[preview.category || 'DIAGNOSTIC']} · ${preview.actionDescription}`
                              : preview.matched
                              ? `▲ ${preview.actionDescription}`
                              : '▲ Phrase not matched as hardware command (will check offline AI on run)'}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Quick Step Snippets */}
                <div className="pt-1 space-y-1">
                  <span className="block text-[10px] font-mono text-slate-400">
                    Insert bench instruction:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {COMMON_MACRO_STEP_SNIPPETS.map((snippet) => (
                      <button
                        key={snippet.label}
                        type="button"
                        onClick={() => handleAppendSnippet(snippet.instruction)}
                        className="hw-btn rounded-[2px] px-2 py-1 text-[10px] font-mono text-slate-300 hover:text-amber-200 transition-colors cursor-pointer"
                      >
                        + {snippet.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {builderError && (
                <p role="alert" className="text-[11px] font-mono text-amber-300">
                  {builderError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCancelBuilder}
                  className="hw-btn min-h-[34px] rounded-[2px] px-3 py-1.5 text-xs font-mono text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="hw-btn hw-btn-green min-h-[34px] rounded-[2px] px-3.5 py-1.5 text-xs font-mono font-bold uppercase tracking-wider cursor-pointer"
                >
                  {editingMacroId ? 'Update Macro' : 'Save Macro'}
                </button>
              </div>
            </form>
          )}

          {/* Saved Voice Macros List */}
          {macros.length === 0 ? (
            <div className="hw-lcd-well rounded-[2px] p-4 text-center space-y-2">
              <p className="text-xs font-mono font-medium text-slate-200">No voice macros configured</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Click New Macro to chain sequential instructions like “Connect Power”, “Set 12V”,
                and “Engage Ignition” under a single spoken trigger phrase.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {macros.map((macro) => (
                <article
                  key={macro.id}
                  data-testid={`voice-macro-card-${macro.id}`}
                  className="rounded-[2px] border border-[#2b323f] bg-[#171c25] p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-xs font-semibold text-slate-100 truncate">
                        {macro.name}
                      </h3>
                      <p className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-400 truncate">
                        Say “{macro.triggerPhrase}”
                        <span aria-hidden="true"> · </span>
                        {macro.steps.length} {macro.steps.length === 1 ? 'step' : 'steps'}
                        <span aria-hidden="true"> · </span>
                        {macro.isPreset ? 'Preset' : 'Custom'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRunCommand(macro.triggerPhrase, 'QUICK_CHIP')}
                      aria-label={`Run macro ${macro.name}`}
                      className="hw-btn hw-btn-green inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-[2px] px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer"
                    >
                      <Play className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>Run</span>
                    </button>
                  </div>

                  {macro.description && (
                    <p className="text-[11px] text-slate-400 leading-snug">{macro.description}</p>
                  )}

                  <ol className="space-y-1 border-t border-[#252c38] pt-2 text-[11px] font-mono text-slate-300">
                    {macro.steps.map((step, idx) => (
                      <li key={`${macro.id}-step-${idx}`} className="flex items-baseline gap-2">
                        <span className="text-slate-500 tabular-nums shrink-0">
                          {String(idx + 1).padStart(2, '0')}.
                        </span>
                        <span className="break-words">{step}</span>
                      </li>
                    ))}
                  </ol>

                  <div className="flex items-center justify-end gap-2 border-t border-[#252c38] pt-1.5 text-[11px] font-mono">
                    <button
                      type="button"
                      onClick={() => openEditMacroBuilder(macro)}
                      className="inline-flex items-center gap-1 text-slate-300 hover:text-amber-300 px-1.5 py-0.5 rounded-[2px] cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" aria-hidden="true" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => voiceMacroService.deleteMacro(macro.id)}
                      className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-300 px-1.5 py-0.5 rounded-[2px] cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" aria-hidden="true" />
                      <span>Delete</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer Quick Verification Input */}
      <form
        onSubmit={handleSubmitTest}
        className="border-t border-[#2a313d] bg-[#11151d] px-4 py-3 flex items-center gap-2 shrink-0"
      >
        <input
          type="text"
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
          placeholder='Run command or macro (e.g. "Bench Power Up")'
          aria-label="Test voice command or macro in log sidebar"
          className="flex-1 min-w-0 rounded-[2px] border border-[#323a48] bg-[#0b0e14] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!testInput.trim()}
          aria-label="Run test command"
          className="hw-btn hw-btn-amber inline-flex min-h-[36px] items-center justify-center rounded-[2px] px-3 py-2 text-xs font-mono font-bold disabled:opacity-40 cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </form>
    </aside>
  );
};
