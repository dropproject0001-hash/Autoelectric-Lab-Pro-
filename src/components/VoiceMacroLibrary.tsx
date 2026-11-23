import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleDot,
  Copy,
  Download,
  Gauge,
  Layers,
  Lock,
  Mic,
  MicOff,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import type {
  EcuPin,
  FaultType,
  InjectedFault,
  MultimeterMode,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import type { RpmEmulatorState } from '../utils/vehicleEcuRegistry';
import type { LabTab } from './LabTopNav';
import {
  appendRecordedSteps,
  type BenchRecorderSnapshot,
  diffBenchSnapshotsToInstructions,
} from '../services/benchActionRecorder';
import {
  captureBenchInstrumentSequence,
  classifyMacroStepInstrument,
  COMMON_MACRO_STEP_SNIPPETS,
  compileInstrumentStepToInstruction,
  DMM_MANUAL_RANGE_OPTIONS,
  PSU_PRESET_METADATA,
  type PsuPresetOption,
  type VoiceMacro,
  voiceMacroService,
} from '../services/voiceMacroService';
import {
  executeMacroSequence,
  type MacroExecutionResult,
  parseAndExecuteVoiceCommand,
  previewMacroStep,
  type VoiceCommandActions,
} from '../utils/voiceCommandParser';
import { offlineVoiceAssistant } from '../services/offlineVoiceService';
import { useTrialAccess } from '../context/TrialAccessContext';

export interface VoiceMacroLibraryProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  pins: EcuPin[];
  powerSupply: PowerSupplyState;
  onChangePowerSupply: React.Dispatch<React.SetStateAction<PowerSupplyState>>;
  multimeter: MultimeterState;
  onChangeMultimeter: React.Dispatch<React.SetStateAction<MultimeterState>>;
  manualRangeLabel?: string | null;
  onSetManualRangeLabel?: (label: string | null) => void;
  faults: InjectedFault[];
  onAddFault: (pinId: string, faultType: FaultType, description: string) => void;
  onRemoveFault: (pinId: string) => void;
  onClearAllFaults: () => void;
  wires: WireConnection[];
  onAddWire: (sourcePinId: string, targetPinId: string, color?: string, label?: string) => void;
  onToggleCutWire: (wireId: string) => void;
  onDeleteWire: (wireId: string) => void;
  rpmEmulator: RpmEmulatorState;
  onChangeRpmEmulator: React.Dispatch<React.SetStateAction<RpmEmulatorState>>;
  onAttachProbe: (color: 'red' | 'black', pinId: string, label: string) => void;
  onResetLab: () => void;
  onNavigateTab: (tab: LabTab) => void;
}

type LibraryCategoryFilter =
  | 'ALL'
  | 'CUSTOM'
  | 'PRESET'
  | 'COLD_START_POWER'
  | 'FAULTS'
  | 'DMM_PROBES';

type ComposerTab = 'FAULT' | 'RPM' | 'PSU' | 'DMM' | 'SNIPPETS';
type RecordingStatus = 'IDLE' | 'RECORDING' | 'PAUSED';

const FAULT_PHRASE_OPTIONS: ReadonlyArray<{ label: string; phrase: string }> = [
  { label: 'Open Circuit', phrase: 'open circuit' },
  { label: 'Short to Ground (KL31)', phrase: 'short to ground' },
  { label: 'Short to +12V VBat', phrase: 'short to 12v' },
  { label: 'High Resistance (250Ω)', phrase: 'high resistance' },
];

const DMM_MODES: ReadonlyArray<{ value: MultimeterMode; label: string }> = [
  { value: 'V_DC', label: 'V DC' },
  { value: 'V_AC', label: 'V AC' },
  { value: 'RESISTANCE', label: 'Ω Ohms' },
  { value: 'CONTINUITY', label: 'Continuity' },
  { value: 'FREQUENCY', label: 'Hz / Duty' },
  { value: 'DIODE', label: 'Diode' },
];

export const VoiceMacroLibrary: React.FC<VoiceMacroLibraryProps> = ({
  isOpen,
  onOpen,
  onClose,
  pins,
  powerSupply,
  onChangePowerSupply,
  multimeter,
  onChangeMultimeter,
  manualRangeLabel = null,
  onSetManualRangeLabel,
  faults,
  onAddFault,
  onRemoveFault,
  onClearAllFaults,
  wires,
  onAddWire,
  onToggleCutWire,
  onDeleteWire,
  rpmEmulator,
  onChangeRpmEmulator,
  onAttachProbe,
  onResetLab,
  onNavigateTab,
}) => {
  const [macros, setMacros] = useState<VoiceMacro[]>(() => voiceMacroService.getMacros());
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<LibraryCategoryFilter>('ALL');

  // Live Bench Action Recorder state
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('IDLE');
  const [recordedSteps, setRecordedSteps] = useState<string[]>([]);
  const prevSnapshotRef = useRef<BenchRecorderSnapshot | null>(null);
  const lastStepTimestampRef = useRef<number | null>(null);

  // Draft Editor state
  const [isEditorVisible, setIsEditorVisible] = useState(true);
  const [editingMacroId, setEditingMacroId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftTrigger, setDraftTrigger] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftSteps, setDraftSteps] = useState<string[]>([
    'Connect Ground',
    'Set PSU preset to 10.2V cranking',
    'Connect Power',
    'Engage Ignition',
    'Set engine RPM to 1150',
  ]);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [composerTab, setComposerTab] = useState<ComposerTab>('FAULT');

  // Voice Test / Dictation state
  const [testPhraseInput, setTestPhraseInput] = useState('');
  const [isDictatingTrigger, setIsDictatingTrigger] = useState(false);
  const [isListeningRunner, setIsListeningRunner] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [executionFeedback, setExecutionFeedback] = useState<{
    title: string;
    detail: string;
    ok: boolean;
  } | null>(null);

  // Import/Export JSON state
  const [showImportBox, setShowImportBox] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // Composer inputs
  const [faultOp, setFaultOp] = useState<'TOGGLE' | 'INJECT' | 'REMOVE'>('TOGGLE');
  const [faultPinNum, setFaultPinNum] = useState<number>(10);
  const [faultPhrase, setFaultPhrase] = useState<string>('open circuit');

  const [rpmDraftValue, setRpmDraftValue] = useState<number>(1150);

  const [psuPresetChoice, setPsuPresetChoice] = useState<PsuPresetOption>('10.2V_CRANKING');
  const [psuVoltChoice, setPsuVoltChoice] = useState<number>(12.6);
  const [psuAmpChoice, setPsuAmpChoice] = useState<number>(4.0);

  const [dmmModeChoice, setDmmModeChoice] = useState<MultimeterMode>('V_DC');
  const [dmmRangeChoice, setDmmRangeChoice] = useState<string>('20V DC');
  const [redProbeChoice, setRedProbeChoice] = useState<string>('pin 10');
  const [blackProbeChoice, setBlackProbeChoice] = useState<string>('ground');

  useEffect(() => {
    return voiceMacroService.subscribeMacros(setMacros);
  }, []);

  useEffect(() => {
    if (!isOpen && (isDictatingTrigger || isListeningRunner)) {
      offlineVoiceAssistant.stopListening();
      setIsDictatingTrigger(false);
      setIsListeningRunner(false);
    }
  }, [isOpen, isDictatingTrigger, isListeningRunner]);

  useEffect(() => {
    return () => {
      offlineVoiceAssistant.stopListening();
    };
  }, []);

  useEffect(() => {
    const opts = DMM_MANUAL_RANGE_OPTIONS[dmmModeChoice] || [{ label: 'Auto-Range', value: 'AUTO' }];
    if (!opts.some((o) => o.value === dmmRangeChoice)) {
      setDmmRangeChoice(opts[0].value);
    }
  }, [dmmModeChoice, dmmRangeChoice]);

  const currentSnapshot = useMemo<BenchRecorderSnapshot>(
    () => ({
      powerSupply,
      multimeter,
      manualRangeLabel,
      faults,
      wires,
      rpmEmulator,
    }),
    [powerSupply, multimeter, manualRangeLabel, faults, wires, rpmEmulator]
  );

  // Live state-diff capture while recording is active
  useEffect(() => {
    if (recordingStatus !== 'RECORDING') {
      return;
    }
    const prev = prevSnapshotRef.current;
    if (!prev) {
      prevSnapshotRef.current = currentSnapshot;
      return;
    }

    const diffSteps = diffBenchSnapshotsToInstructions(prev, currentSnapshot, pins);
    prevSnapshotRef.current = currentSnapshot;

    if (diffSteps.length > 0) {
      const now = Date.now();
      setRecordedSteps((existing) => {
        const res = appendRecordedSteps(existing, diffSteps, lastStepTimestampRef.current, now);
        return res.steps;
      });
      lastStepTimestampRef.current = now;
    }
  }, [recordingStatus, currentSnapshot, pins]);

  const buildLiveVoiceActions = useCallback((): VoiceCommandActions => {
    return {
      setVoltage: (volts) =>
        onChangePowerSupply((prev) => ({
          ...prev,
          voltageSetting: Math.max(0, Math.min(28.0, parseFloat(volts.toFixed(2)))),
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
      setPowerSupplyOutput: (enabled) =>
        onChangePowerSupply((prev) => ({
          ...prev,
          isOutputEnabled: enabled,
        })),
      resetLab: () => {
        onSetManualRangeLabel?.(null);
        onResetLab();
      },
      switchTab: (tab) => onNavigateTab(tab),
      attachProbeToPin: (pinId, label) => onAttachProbe('red', pinId, label),
      attachBlackProbeToPin: (pinId, label) => onAttachProbe('black', pinId, label),
      swapProbes: () =>
        onChangeMultimeter((prev) => ({
          ...prev,
          redProbe: prev.blackProbe,
          blackProbe: prev.redProbe,
        })),
      disconnectProbes: () =>
        onChangeMultimeter((prev) => ({
          ...prev,
          redProbe: { attachedToPinId: null, attachedLabel: 'Unconnected' },
          blackProbe: { attachedToPinId: null, attachedLabel: 'Unconnected' },
        })),
      setMultimeterState: (updates, rangeLabel) => {
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
      },
      connectWire: (sourcePinId, targetPinId, color, label) => {
        onAddWire(sourcePinId, targetPinId, color, label);
        return true;
      },
      disconnectWireByPin: (pinId) => {
        const matching = wires.filter(
          (w) => w.sourcePinId === pinId || w.targetPinId === pinId
        );
        matching.forEach((w) => onDeleteWire(w.id));
        return matching.length;
      },
      toggleCutWireByPin: (pinId, cut) => {
        const matching = wires.filter((w) => {
          const touches = w.sourcePinId === pinId || w.targetPinId === pinId;
          if (!touches) return false;
          if (typeof cut === 'boolean') return w.isCut !== cut;
          return true;
        });
        matching.forEach((w) => onToggleCutWire(w.id));
        return matching.length;
      },
      injectFault: onAddFault,
      toggleFault: (pinId, faultType, description) => {
        const existing = faults.find((f) => f.pinId === pinId);
        if (existing && (faultType === 'NONE' || existing.faultType === faultType)) {
          onRemoveFault(pinId);
          return false;
        }
        onAddFault(pinId, faultType, description);
        return true;
      },
      removeFault: (pinId) => {
        const existed = faults.some((f) => f.pinId === pinId);
        onRemoveFault(pinId);
        return existed;
      },
      clearFaults: onClearAllFaults,
      setRpmEmulator: (updates) =>
        onChangeRpmEmulator((prev) => ({
          ...prev,
          ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
          ...(updates.rpm !== undefined ? { rpm: updates.rpm } : {}),
        })),
    };
  }, [
    faults,
    wires,
    onAddFault,
    onRemoveFault,
    onClearAllFaults,
    onAddWire,
    onDeleteWire,
    onToggleCutWire,
    onAttachProbe,
    onChangeMultimeter,
    onChangePowerSupply,
    onChangeRpmEmulator,
    onNavigateTab,
    onResetLab,
    onSetManualRangeLabel,
  ]);

  const runMacroObject = useCallback(
    (macro: { name: string; triggerPhrase: string; steps: string[] }) => {
      const result: MacroExecutionResult = executeMacroSequence(
        macro,
        pins,
        buildLiveVoiceActions()
      );
      offlineVoiceAssistant.addCommandLog({
        source: 'QUICK_CHIP',
        rawTranscript: macro.triggerPhrase,
        normalizedTranscript: `Macro: ${macro.name} (${result.stepResults.length} steps)`,
        status: result.status === 'EXECUTED' ? 'EXECUTED' : 'FAILED',
        category: 'MACRO',
        actionDescription: result.actionDescription,
        spokenReply: result.spokenReply,
      });
      setExecutionFeedback({
        title: `Executed “${macro.name}” (${result.executedCount}/${result.stepResults.length} steps)`,
        detail: result.actionDescription,
        ok: result.status === 'EXECUTED',
      });
    },
    [pins, buildLiveVoiceActions]
  );

  const runVoicePhraseInput = useCallback(
    (phrase: string, source: 'TEXT_INPUT' | 'SPEECH_API' = 'TEXT_INPUT') => {
      const trimmed = phrase.trim();
      if (!trimmed) return;
      const matchedMacro = voiceMacroService.findMatchingMacro(trimmed);
      if (matchedMacro) {
        runMacroObject(matchedMacro);
        return;
      }
      const cmdResult = parseAndExecuteVoiceCommand(trimmed, pins, buildLiveVoiceActions());
      offlineVoiceAssistant.addCommandLog({
        source,
        rawTranscript: trimmed,
        normalizedTranscript: cmdResult.normalizedTranscript || trimmed.toLowerCase(),
        status: cmdResult.matched && cmdResult.status !== 'FAILED' ? 'EXECUTED' : 'FAILED',
        category: cmdResult.category || 'DIAGNOSTIC',
        actionDescription:
          cmdResult.actionDescription || `No matching macro or command for "${trimmed}"`,
        spokenReply: cmdResult.spokenReply,
      });
      setExecutionFeedback({
        title: cmdResult.matched ? `Voice Command: “${trimmed}”` : `Unmatched Phrase: “${trimmed}”`,
        detail:
          cmdResult.actionDescription ||
          'No macro trigger phrase or direct bench command matched. Create a macro below with this trigger.',
        ok: cmdResult.matched && cmdResult.status !== 'FAILED',
      });
    },
    [pins, buildLiveVoiceActions, runMacroObject]
  );

  // Recorder controls
  const startLiveRecording = (appendToExistingDraft: boolean = false) => {
    prevSnapshotRef.current = currentSnapshot;
    lastStepTimestampRef.current = null;
    if (!appendToExistingDraft) {
      setRecordedSteps([]);
      setEditingMacroId(null);
      setDraftName('');
      setDraftTrigger('');
      setDraftDescription('Recorded from live ECU Bench interactions');
    } else {
      setRecordedSteps(draftSteps.filter((s) => s.trim().length > 0));
    }
    setRecordingStatus('RECORDING');
    onClose();
  };

  const finishRecordingToEditor = () => {
    setRecordingStatus('IDLE');
    prevSnapshotRef.current = null;
    if (recordedSteps.length > 0) {
      setDraftSteps([...recordedSteps]);
    }
    setIsEditorVisible(true);
    onOpen();
  };

  const discardRecording = () => {
    setRecordingStatus('IDLE');
    prevSnapshotRef.current = null;
    setRecordedSteps([]);
  };

  const undoLastRecordedStep = () => {
    setRecordedSteps((prev) => prev.slice(0, -1));
  };

  // Filtered macro list
  const filteredMacros = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return macros.filter((m) => {
      if (categoryFilter === 'CUSTOM' && m.isPreset) return false;
      if (categoryFilter === 'PRESET' && !m.isPreset) return false;
      if (categoryFilter === 'COLD_START_POWER') {
        const text = `${m.name} ${m.triggerPhrase} ${m.steps.join(' ')}`.toLowerCase();
        if (!/(cold\s*start|crank|power|ignition|rpm|kl30|kl15|psu)/i.test(text)) return false;
      }
      if (categoryFilter === 'FAULTS') {
        const text = `${m.name} ${m.triggerPhrase} ${m.steps.join(' ')}`.toLowerCase();
        if (!/(fault|injector|short|open\s+circuit|dtc|resistance|tps)/i.test(text)) return false;
      }
      if (categoryFilter === 'DMM_PROBES') {
        const text = `${m.name} ${m.triggerPhrase} ${m.steps.join(' ')}`.toLowerCase();
        if (!/(multimeter|meter|probe|diode|resistance|ohm|continuity|vref)/i.test(text)) {
          return false;
        }
      }
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.triggerPhrase.toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q) ||
        m.steps.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [macros, searchQuery, categoryFilter]);

  const stepPreviews = useMemo(
    () => draftSteps.map((step) => previewMacroStep(step, pins)),
    [draftSteps, pins]
  );

  const appendDraftStep = (instruction: string) => {
    const clean = instruction.trim();
    if (!clean) return;
    setDraftSteps((prev) => {
      const emptyIdx = prev.findIndex((s) => s.trim() === '');
      if (emptyIdx >= 0) {
        return prev.map((s, i) => (i === emptyIdx ? clean : s));
      }
      if (prev.length >= 20) return prev;
      return [...prev, clean];
    });
    setEditorError(null);
  };

  const handleLoadMacroIntoEditor = (macro: VoiceMacro) => {
    setEditingMacroId(macro.id);
    setDraftName(macro.name);
    setDraftTrigger(macro.triggerPhrase);
    setDraftDescription(macro.description || '');
    setDraftSteps(macro.steps.length > 0 ? [...macro.steps] : ['']);
    setEditorError(null);
    setIsEditorVisible(true);
  };

  const handleStartBlankMacro = () => {
    setEditingMacroId(null);
    setDraftName('');
    setDraftTrigger('');
    setDraftDescription('');
    setDraftSteps(['']);
    setEditorError(null);
    setIsEditorVisible(true);
  };

  const handleSnapshotFullBench = () => {
    const instSteps = captureBenchInstrumentSequence({
      powerSupply,
      multimeter,
      manualRangeLabel,
      includePowerSupply: true,
      includeMultimeter: true,
      includeProbes: true,
    });
    const extraSteps: string[] = [...instSteps];

    if (rpmEmulator.isActive) {
      extraSteps.push(`Set engine RPM to ${Math.max(100, Math.min(7500, Math.round(rpmEmulator.rpm)))}`);
    }
    for (const f of faults) {
      const pinObj = pins.find((p) => p.id === f.pinId);
      const pinTarget = pinObj ? `pin ${pinObj.pinNumber}` : f.pinId;
      const phrase =
        f.faultType === 'SHORT_TO_GND'
          ? 'short to ground'
          : f.faultType === 'SHORT_TO_VBAT'
          ? 'short to 12v'
          : f.faultType.startsWith('HIGH_RESISTANCE')
          ? 'high resistance'
          : 'open circuit';
      extraSteps.push(`Inject ${phrase} on ${pinTarget}`);
    }

    if (extraSteps.length === 0) {
      setEditorError('No active instrument, RPM, or fault settings found to snapshot.');
      return;
    }
    setDraftSteps(extraSteps.slice(0, 20));
    setEditorError(null);
  };

  const handleSaveDraft = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTrigger = draftTrigger.trim();
    const cleanSteps = draftSteps.map((s) => s.trim()).filter(Boolean);
    if (!cleanTrigger) {
      setEditorError('Enter a voice trigger phrase (e.g. "Perform Cold Start" or "My Injector Test").');
      return;
    }
    if (cleanSteps.length === 0) {
      setEditorError('Record or add at least one bench action step.');
      return;
    }

    if (editingMacroId) {
      const updated = voiceMacroService.updateMacro(editingMacroId, {
        name: draftName.trim() || cleanTrigger,
        triggerPhrase: cleanTrigger,
        description: draftDescription.trim() || undefined,
        steps: cleanSteps,
      });
      if (updated) {
        setExecutionFeedback({
          title: `Updated “${updated.name}”`,
          detail: `Say “${updated.triggerPhrase}” to run ${updated.steps.length} sequential bench actions.`,
          ok: true,
        });
      }
    } else {
      const created = voiceMacroService.createMacro({
        name: draftName.trim() || cleanTrigger,
        triggerPhrase: cleanTrigger,
        description: draftDescription.trim() || undefined,
        steps: cleanSteps,
      });
      setEditingMacroId(created.id);
      setExecutionFeedback({
        title: `Saved “${created.name}” to Library`,
        detail: `Say “${created.triggerPhrase}” anytime via Mic or Run it directly (${created.steps.length} steps).`,
        ok: true,
      });
    }
    setEditorError(null);
  };

  const handleDictateTrigger = () => {
    const state = offlineVoiceAssistant.getState();
    if (!state.hasSpeechRecognition) {
      setVoiceNotice('Browser SpeechRecognition is unavailable here. Type the trigger phrase manually.');
      return;
    }
    if (isDictatingTrigger) {
      offlineVoiceAssistant.stopListening();
      setIsDictatingTrigger(false);
      return;
    }
    setVoiceNotice(null);
    setIsDictatingTrigger(true);
    offlineVoiceAssistant.startListening(
      (spokenText) => {
        setDraftTrigger(spokenText.trim());
        setIsDictatingTrigger(false);
      },
      { continuous: false }
    );
  };

  const handleSpeakTestTrigger = () => {
    const state = offlineVoiceAssistant.getState();
    if (!state.hasSpeechRecognition) {
      setVoiceNotice('Browser SpeechRecognition unavailable. Type a macro trigger phrase to test.');
      return;
    }
    if (isListeningRunner) {
      offlineVoiceAssistant.stopListening();
      setIsListeningRunner(false);
      return;
    }
    setVoiceNotice(null);
    setIsListeningRunner(true);
    offlineVoiceAssistant.startListening(
      (spokenText) => {
        setIsListeningRunner(false);
        setTestPhraseInput(spokenText);
        runVoicePhraseInput(spokenText, 'SPEECH_API');
      },
      { continuous: false }
    );
  };

  const { accessMode, canUseExports, openAccessModal } = useTrialAccess();

  const handleExportJson = () => {
    if (!canUseExports) {
      openAccessModal({
        tab: 'TRIAL_PIN',
        notice:
          accessMode === 'TRIAL_EXPIRED' || accessMode === 'TRIAL_REVOKED'
            ? 'Trial expired — Voice Macro JSON exports are locked. Enter a new 8-digit Trial PIN.'
            : 'Enter an active 8-digit Trial PIN or Master Admin PIN to export voice macros.',
      });
      return;
    }
    const json = voiceMacroService.exportMacrosJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autoelectric-voice-macros-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJsonSubmit = () => {
    try {
      const res = voiceMacroService.importMacrosJson(importJsonText);
      setImportJsonText('');
      setShowImportBox(false);
      setExecutionFeedback({
        title: `Imported Voice Macros`,
        detail: `Merged ${res.importedCount} macro(s). Library now holds ${res.totalCount} total macros.`,
        ok: true,
      });
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Failed to parse macro JSON.');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setEditorError('Macro import file exceeds 2 MB limit.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImportJsonText(reader.result);
        setShowImportBox(true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Avoid mounting modal DOM when completely idle and closed
  if (!isOpen && recordingStatus === 'IDLE') {
    return null;
  }

  return (
    <>
      {/* Non-Blocking Live Bench Action Recorder Bar (visible when minimized while recording) */}
      {recordingStatus !== 'IDLE' && !isOpen && (
        <div
          role="region"
          aria-label="Live Voice Macro Action Recorder"
          data-testid="voice-macro-live-recorder-bar"
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 w-[min(680px,calc(100vw-1rem))] rounded-[3px] border border-rose-500/70 bg-[#12161e]/95 px-3 py-2.5 shadow-[0_12px_36px_rgba(0,0,0,0.75)] backdrop-blur-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {recordingStatus === 'RECORDING' ? (
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
              ) : (
                <Pause className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-mono text-xs font-bold uppercase tracking-wider text-slate-100">
                  {recordingStatus === 'RECORDING'
                    ? 'Recording Live Bench Actions'
                    : 'Macro Recording Paused'}
                </p>
                <p className="font-mono text-[11px] tabular-nums text-slate-400 truncate">
                  {recordedSteps.length} {recordedSteps.length === 1 ? 'step' : 'steps'} captured
                  {recordedSteps.length > 0 && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <span className="text-emerald-300">
                        Last: {recordedSteps[recordedSteps.length - 1]}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setRecordingStatus((prev) => (prev === 'RECORDING' ? 'PAUSED' : 'RECORDING'))
                }
                className="hw-btn px-2.5 py-1.5 rounded-[2px] font-mono text-[10.5px] font-semibold text-amber-300 inline-flex items-center gap-1 cursor-pointer"
              >
                {recordingStatus === 'RECORDING' ? (
                  <>
                    <Pause className="w-3 h-3" aria-hidden="true" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <CircleDot className="w-3 h-3" aria-hidden="true" />
                    <span>Resume</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={undoLastRecordedStep}
                disabled={recordedSteps.length === 0}
                className="hw-btn px-2 py-1.5 rounded-[2px] font-mono text-[10.5px] text-slate-300 disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
              >
                <Undo2 className="w-3 h-3" aria-hidden="true" />
                <span>Undo</span>
              </button>

              <button
                type="button"
                onClick={finishRecordingToEditor}
                data-testid="finish-macro-recording-btn"
                className="hw-btn hw-btn-green px-2.5 py-1.5 rounded-[2px] font-mono text-[10.5px] font-bold uppercase tracking-wider inline-flex items-center gap-1 cursor-pointer"
              >
                <Square className="w-3 h-3" aria-hidden="true" />
                <span>Finish &amp; Save ({recordedSteps.length})</span>
              </button>

              <button
                type="button"
                onClick={discardRecording}
                aria-label="Discard recorded macro steps"
                className="hw-btn px-2 py-1.5 rounded-[2px] font-mono text-[10.5px] text-rose-300 hover:text-rose-200 cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>

          <p className="mt-1.5 border-t border-[#252c38] pt-1.5 font-mono text-[10px] text-slate-400">
            Operate PSU, Fault Injector, RPM Emulator, DMM, Probes, or Harness Wires — every change is appended cleanly as a voice step.
          </p>
        </div>
      )}

      {/* Full Voice Macro Library Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Voice Macro Library"
          data-testid="voice-macro-library-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 backdrop-blur-[2px]"
          onClick={onClose}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[min(90dvh,840px)] w-[min(1180px,100%)] flex-col overflow-hidden rounded-[3px] border border-[#343d4d] bg-[#0f131a] text-slate-100 shadow-2xl"
          >
            {/* Header Bar */}
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#28303d] bg-[#151a23] px-4 py-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <Layers className="w-5 h-5 text-amber-400 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <h2 className="font-hud text-sm sm:text-base font-bold uppercase tracking-wider text-slate-100">
                    Voice Macro Library
                  </h2>
                  <p className="font-mono text-[11px] tabular-nums text-slate-400 truncate">
                    {macros.length} stored sequences
                    <span aria-hidden="true"> · </span>
                    {macros.filter((m) => !m.isPreset).length} custom
                    <span aria-hidden="true"> · </span>
                    Record live bench interactions &amp; trigger hands-free by voice
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => startLiveRecording(false)}
                  data-testid="start-live-macro-recording-btn"
                  className="hw-btn border-rose-500/70 bg-rose-950/60 text-rose-200 hover:border-rose-400 inline-flex min-h-[34px] items-center gap-1.5 rounded-[2px] px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider cursor-pointer"
                >
                  <CircleDot className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                  <span>Record Live Actions</span>
                </button>

                <button
                  type="button"
                  onClick={handleStartBlankMacro}
                  className="hw-btn hw-btn-green inline-flex min-h-[34px] items-center gap-1 rounded-[2px] px-2.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>New Macro</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportJson}
                  title={
                    canUseExports
                      ? 'Export all voice macros as JSON'
                      : 'Exports locked — enter an active Trial PIN'
                  }
                  className="hw-btn inline-flex min-h-[34px] items-center gap-1 rounded-[2px] px-2.5 py-1.5 font-mono text-[10.5px] text-slate-300 hover:text-white cursor-pointer"
                >
                  {canUseExports ? (
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline">{canUseExports ? 'Export' : 'Locked'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowImportBox((prev) => !prev)}
                  title="Import voice macros from JSON"
                  className="hw-btn inline-flex min-h-[34px] items-center gap-1 rounded-[2px] px-2.5 py-1.5 font-mono text-[10.5px] text-slate-300 hover:text-white cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Import</span>
                </button>

                <button
                  type="button"
                  onClick={() => voiceMacroService.resetPresets()}
                  title="Restore built-in bench presets while keeping custom macros"
                  className="hw-btn inline-flex min-h-[34px] items-center gap-1 rounded-[2px] px-2.5 py-1.5 font-mono text-[10.5px] text-slate-300 hover:text-white cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden md:inline">Restore Presets</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close Voice Macro Library"
                  className="hw-btn inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-[2px] text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </header>

            {/* Voice Trigger Runner Bar */}
            <div className="border-b border-[#242c38] bg-[#121720] px-4 py-2.5 flex flex-col gap-2 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSpeakTestTrigger}
                  className={`hw-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-[2px] px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider shrink-0 cursor-pointer ${
                    isListeningRunner
                      ? 'border-rose-500 bg-rose-950/70 text-rose-200 animate-pulse'
                      : 'hw-btn-amber'
                  }`}
                >
                  {isListeningRunner ? (
                    <MicOff className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>{isListeningRunner ? 'Listening...' : 'Speak Macro Trigger'}</span>
                </button>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    runVoicePhraseInput(testPhraseInput, 'TEXT_INPUT');
                  }}
                  className="flex flex-1 min-w-[220px] items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={testPhraseInput}
                    onChange={(e) => setTestPhraseInput(e.target.value)}
                    placeholder='Type or speak trigger: "Perform Cold Start", "Toggle Injector Fault", "Check 5V Reference"'
                    aria-label="Run voice macro by trigger phrase"
                    className="flex-1 min-w-0 rounded-[2px] border border-[#323a48] bg-[#090c11] px-3 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!testPhraseInput.trim()}
                    className="hw-btn hw-btn-green inline-flex min-h-[36px] items-center gap-1 rounded-[2px] px-3 py-1.5 font-mono text-xs font-bold uppercase disabled:opacity-40 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Trigger</span>
                  </button>
                </form>
              </div>

              {voiceNotice && (
                <p role="status" className="font-mono text-[11px] text-amber-300">
                  {voiceNotice}
                </p>
              )}

              {executionFeedback && (
                <div
                  role="status"
                  data-testid="voice-macro-library-feedback"
                  className={`flex items-start justify-between gap-2 rounded-[2px] border px-3 py-2 font-mono text-[11px] ${
                    executionFeedback.ok
                      ? 'border-emerald-500/50 bg-emerald-950/35 text-emerald-200'
                      : 'border-amber-500/50 bg-amber-950/35 text-amber-200'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-bold flex items-center gap-1.5">
                      {executionFeedback.ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      <span>{executionFeedback.title}</span>
                    </p>
                    <p className="mt-0.5 text-slate-300 break-words">{executionFeedback.detail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExecutionFeedback(null)}
                    className="text-slate-400 hover:text-white text-[10px] px-1 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {showImportBox && (
                <div className="rounded-[2px] border border-[#323a48] bg-[#0b0e14] p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold uppercase text-amber-300">
                      Import Macro Library JSON
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        ref={importFileInputRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={handleImportFile}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => importFileInputRef.current?.click()}
                        className="hw-btn px-2 py-1 rounded-[2px] font-mono text-[10px] text-slate-200 cursor-pointer"
                      >
                        Choose .json File
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowImportBox(false)}
                        className="text-slate-400 hover:text-white font-mono text-[10px] cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={3}
                    value={importJsonText}
                    onChange={(e) => setImportJsonText(e.target.value)}
                    placeholder='Paste exported JSON array or { "macros": [...] }'
                    className="w-full rounded-[2px] border border-[#323a48] bg-[#131822] p-2 font-mono text-[11px] text-slate-100 focus:border-amber-400 focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleImportJsonSubmit}
                      disabled={!importJsonText.trim()}
                      className="hw-btn hw-btn-green px-3 py-1 rounded-[2px] font-mono text-[11px] font-bold uppercase disabled:opacity-40 cursor-pointer"
                    >
                      Merge into Library
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Body Split: Catalog (Left) + Recorder & Sequence Composer (Right) */}
            <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-12 overflow-hidden">
              {/* Left Column: Search, Filters & Stored Macros */}
              <section
                aria-label="Stored Voice Macros"
                className="lg:col-span-7 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-[#242c38]"
              >
                <div className="p-3 border-b border-[#242c38] bg-[#131821] space-y-2 shrink-0">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search stored macros, trigger phrases, or steps..."
                      aria-label="Search voice macros"
                      className="w-full rounded-[2px] border border-[#323a48] bg-[#090c11] pl-8 pr-3 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div
                    role="tablist"
                    aria-label="Filter macros by category"
                    className="flex flex-wrap gap-1"
                  >
                    {(
                      [
                        { id: 'ALL', label: `All (${macros.length})` },
                        { id: 'CUSTOM', label: `Custom (${macros.filter((m) => !m.isPreset).length})` },
                        { id: 'PRESET', label: `Presets (${macros.filter((m) => m.isPreset).length})` },
                        { id: 'COLD_START_POWER', label: 'Cold Start & Power' },
                        { id: 'FAULTS', label: 'Faults & DTC' },
                        { id: 'DMM_PROBES', label: 'DMM & Probes' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={categoryFilter === tab.id}
                        onClick={() => setCategoryFilter(tab.id)}
                        className={`rounded-[2px] px-2.5 py-1 font-mono text-[10.5px] transition-colors cursor-pointer ${
                          categoryFilter === tab.id
                            ? 'hw-btn-amber font-bold'
                            : 'border border-[#262e3b] bg-[#0c1017] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
                  {filteredMacros.length === 0 ? (
                    <div className="hw-lcd-well rounded-[2px] p-5 text-center space-y-2">
                      <p className="font-mono text-xs font-semibold text-slate-200">
                        No voice macros match this filter
                      </p>
                      <p className="text-xs text-slate-400">
                        Try clearing your search or click Record Live Actions to capture a new bench workflow.
                      </p>
                    </div>
                  ) : (
                    filteredMacros.map((macro) => {
                      const isEditing = editingMacroId === macro.id;
                      return (
                        <article
                          key={macro.id}
                          data-testid={`library-macro-card-${macro.id}`}
                          className={`rounded-[2px] border p-3 space-y-2 transition-colors ${
                            isEditing
                              ? 'border-amber-500/70 bg-[#1a202c]'
                              : 'border-[#2b323f] bg-[#161b24]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
                                {macro.name}
                              </h3>
                              <p className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-400 truncate">
                                Say <span className="text-amber-300">“{macro.triggerPhrase}”</span>
                                <span aria-hidden="true"> · </span>
                                {macro.steps.length} {macro.steps.length === 1 ? 'step' : 'steps'}
                                <span aria-hidden="true"> · </span>
                                {macro.isPreset ? 'Preset' : 'Custom'}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => runMacroObject(macro)}
                              data-testid={`library-run-macro-${macro.id}`}
                              className="hw-btn hw-btn-green inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-[2px] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider cursor-pointer"
                            >
                              <Play className="w-3 h-3" aria-hidden="true" />
                              <span>Run</span>
                            </button>
                          </div>

                          {macro.description && (
                            <p className="text-xs text-slate-400 leading-snug">{macro.description}</p>
                          )}

                          <ol className="space-y-1 border-t border-[#252c38] pt-2 font-mono text-[11px] text-slate-300">
                            {macro.steps.map((step, idx) => {
                              const info = classifyMacroStepInstrument(step);
                              return (
                                <li
                                  key={`${macro.id}-step-${idx}`}
                                  className="flex items-baseline gap-2 min-w-0"
                                >
                                  <span className="text-slate-500 tabular-nums shrink-0">
                                    {String(idx + 1).padStart(2, '0')}.
                                  </span>
                                  <span className="text-[10px] uppercase tracking-wider text-slate-400 shrink-0 w-[68px]">
                                    {info.badgeLabel}
                                  </span>
                                  <span className="break-words min-w-0">{step}</span>
                                </li>
                              );
                            })}
                          </ol>

                          <div className="flex items-center justify-end gap-2 border-t border-[#252c38] pt-1.5 font-mono text-[11px]">
                            <button
                              type="button"
                              onClick={() => handleLoadMacroIntoEditor(macro)}
                              className="inline-flex items-center gap-1 text-slate-300 hover:text-amber-300 px-1.5 py-0.5 rounded-[2px] cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" aria-hidden="true" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => voiceMacroService.duplicateMacro(macro.id)}
                              className="inline-flex items-center gap-1 text-slate-300 hover:text-cyan-300 px-1.5 py-0.5 rounded-[2px] cursor-pointer"
                            >
                              <Copy className="w-3 h-3" aria-hidden="true" />
                              <span>Duplicate</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                voiceMacroService.deleteMacro(macro.id);
                                if (editingMacroId === macro.id) {
                                  handleStartBlankMacro();
                                }
                              }}
                              className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-300 px-1.5 py-0.5 rounded-[2px] cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" aria-hidden="true" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>

              {/* Right Column: Live Recorder Studio & Sequence Editor */}
              <section
                aria-label="Macro Sequence Recorder and Editor"
                className="lg:col-span-5 flex flex-col min-h-0 bg-[#12161f]"
              >
                <div className="border-b border-[#242c38] bg-[#161b24] px-3.5 py-2.5 flex items-center justify-between gap-2 shrink-0">
                  <div>
                    <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-amber-300">
                      {editingMacroId ? 'Edit Voice Macro Sequence' : 'Record & Store Custom Sequence'}
                    </h3>
                    <p className="font-mono text-[10.5px] text-slate-400">
                      Capture live clicks or compose PSU, DMM, RPM &amp; Fault steps
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startLiveRecording(false)}
                      className="hw-btn border-rose-500/60 bg-rose-950/50 text-rose-200 px-2 py-1 rounded-[2px] font-mono text-[10px] font-bold uppercase inline-flex items-center gap-1 cursor-pointer"
                    >
                      <CircleDot className="w-3 h-3 text-rose-400" aria-hidden="true" />
                      <span>Record Bench</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSnapshotFullBench}
                      title="Capture current PSU, DMM, Probes, RPM Emulator, and Active Faults into steps"
                      className="hw-btn hw-btn-amber px-2 py-1 rounded-[2px] font-mono text-[10px] font-bold uppercase inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" aria-hidden="true" />
                      <span>Snapshot</span>
                    </button>
                  </div>
                </div>

                {isEditorVisible && (
                  <form
                    onSubmit={handleSaveDraft}
                    className="flex-1 overflow-y-auto p-3.5 space-y-3 min-h-0"
                  >
                    {/* Voice Trigger & Name */}
                    <div className="space-y-2">
                      <div>
                        <label
                          htmlFor="library-trigger-input"
                          className="block font-mono text-[11px] text-slate-300 mb-1"
                        >
                          Spoken Voice Trigger Phrase *
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            id="library-trigger-input"
                            type="text"
                            value={draftTrigger}
                            onChange={(e) => {
                              setDraftTrigger(e.target.value);
                              setEditorError(null);
                            }}
                            placeholder='e.g. "Perform Cold Start" or "Toggle Injector Fault"'
                            className="flex-1 min-w-0 rounded-[2px] border border-[#323a48] bg-[#090c11] px-2.5 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleDictateTrigger}
                            title="Dictate voice trigger phrase using microphone"
                            className={`hw-btn inline-flex min-h-[32px] items-center gap-1 rounded-[2px] px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase shrink-0 cursor-pointer ${
                              isDictatingTrigger
                                ? 'border-rose-500 bg-rose-950/70 text-rose-200 animate-pulse'
                                : 'text-slate-200'
                            }`}
                          >
                            <Mic className="w-3 h-3 text-amber-400" aria-hidden="true" />
                            <span>{isDictatingTrigger ? 'Listening' : 'Dictate'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label
                            htmlFor="library-name-input"
                            className="block font-mono text-[11px] text-slate-300 mb-1"
                          >
                            Macro Name
                          </label>
                          <input
                            id="library-name-input"
                            type="text"
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            placeholder="Defaults to trigger phrase"
                            className="w-full rounded-[2px] border border-[#323a48] bg-[#090c11] px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="library-notes-input"
                            className="block font-mono text-[11px] text-slate-300 mb-1"
                          >
                            Technician Notes
                          </label>
                          <input
                            id="library-notes-input"
                            type="text"
                            value={draftDescription}
                            onChange={(e) => setDraftDescription(e.target.value)}
                            placeholder="Diagnostic purpose..."
                            className="w-full rounded-[2px] border border-[#323a48] bg-[#090c11] px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Quick Action Composers */}
                    <div className="rounded-[2px] border border-[#2a3240] bg-[#0d1118] p-2.5 space-y-2">
                      <div className="flex flex-wrap items-center gap-1 border-b border-[#222936] pb-1.5 font-mono text-[10px]">
                        {(
                          [
                            { id: 'FAULT', label: 'Fault Actions', icon: AlertTriangle },
                            { id: 'RPM', label: 'RPM / Cold Start', icon: Activity },
                            { id: 'PSU', label: 'Power Supply', icon: Zap },
                            { id: 'DMM', label: 'DMM & Probes', icon: Gauge },
                            { id: 'SNIPPETS', label: 'Snippets', icon: Layers },
                          ] as const
                        ).map((tab) => {
                          const Icon = tab.icon;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setComposerTab(tab.id)}
                              className={`inline-flex items-center gap-1 rounded-[2px] px-2 py-1 uppercase cursor-pointer ${
                                composerTab === tab.id
                                  ? 'hw-btn-amber font-bold'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <Icon className="w-3 h-3" aria-hidden="true" />
                              <span>{tab.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {composerTab === 'FAULT' && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 font-mono text-[11px]">
                          <select
                            value={faultOp}
                            onChange={(e) => setFaultOp(e.target.value as 'TOGGLE' | 'INJECT' | 'REMOVE')}
                            aria-label="Fault step operation"
                            className="rounded-[2px] border border-[#323a48] bg-[#151a24] px-2 py-1.5 text-slate-100 cursor-pointer"
                          >
                            <option value="TOGGLE">Toggle Fault</option>
                            <option value="INJECT">Inject Fault</option>
                            <option value="REMOVE">Remove Pin Fault</option>
                          </select>

                          <select
                            value={faultPinNum}
                            onChange={(e) => setFaultPinNum(Number(e.target.value))}
                            aria-label="Fault target ECU pin"
                            className="rounded-[2px] border border-[#323a48] bg-[#151a24] px-2 py-1.5 text-slate-100 cursor-pointer"
                          >
                            {pins.map((p) => (
                              <option key={p.id} value={p.pinNumber}>
                                Pin {p.pinNumber} · {p.label}
                              </option>
                            ))}
                          </select>

                          {faultOp !== 'REMOVE' ? (
                            <select
                              value={faultPhrase}
                              onChange={(e) => setFaultPhrase(e.target.value)}
                              aria-label="Fault type"
                              className="rounded-[2px] border border-[#323a48] bg-[#151a24] px-2 py-1.5 text-slate-100 cursor-pointer"
                            >
                              {FAULT_PHRASE_OPTIONS.map((opt) => (
                                <option key={opt.phrase} value={opt.phrase}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex items-center text-[10px] text-slate-400 px-1">
                              Clears pin {faultPinNum}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              if (faultOp === 'TOGGLE') {
                                appendDraftStep(`Toggle ${faultPhrase} on pin ${faultPinNum}`);
                              } else if (faultOp === 'INJECT') {
                                appendDraftStep(`Inject ${faultPhrase} on pin ${faultPinNum}`);
                              } else {
                                appendDraftStep(`Remove fault on pin ${faultPinNum}`);
                              }
                            }}
                            className="sm:col-span-3 hw-btn hw-btn-amber py-1.5 rounded-[2px] font-bold uppercase cursor-pointer"
                          >
                            + Add Fault Action Step
                          </button>
                        </div>
                      )}

                      {composerTab === 'RPM' && (
                        <div className="space-y-2 font-mono text-[11px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {[
                              { label: '240 RPM (Crank)', rpm: 240 },
                              { label: '850 RPM (Idle)', rpm: 850 },
                              { label: '1150 RPM (Cold High-Idle)', rpm: 1150 },
                              { label: '2500 RPM (Cruise)', rpm: 2500 },
                            ].map((preset) => (
                              <button
                                key={preset.rpm}
                                type="button"
                                onClick={() => appendDraftStep(`Set engine RPM to ${preset.rpm}`)}
                                className="hw-btn px-2 py-1 rounded-[2px] text-[10.5px] text-amber-300 cursor-pointer"
                              >
                                + {preset.label}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={100}
                              max={7500}
                              step={50}
                              value={rpmDraftValue}
                              onChange={(e) => setRpmDraftValue(parseInt(e.target.value, 10) || 850)}
                              aria-label="Target RPM"
                              className="w-24 rounded-[2px] border border-[#323a48] bg-[#151a24] px-2 py-1 text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                appendDraftStep(
                                  `Set engine RPM to ${Math.max(100, Math.min(7500, rpmDraftValue))}`
                                )
                              }
                              className="hw-btn hw-btn-green px-2.5 py-1 rounded-[2px] font-bold uppercase cursor-pointer"
                            >
                              + Set RPM Step
                            </button>
                            <button
                              type="button"
                              onClick={() => appendDraftStep('Turn RPM emulator off')}
                              className="hw-btn px-2.5 py-1 rounded-[2px] text-slate-300 cursor-pointer"
                            >
                              + RPM Off
                            </button>
                          </div>
                        </div>
                      )}

                      {composerTab === 'PSU' && (
                        <div className="space-y-2 font-mono text-[11px]">
                          <div className="flex flex-wrap items-center gap-1">
                            {(
                              [
                                'Connect Ground',
                                'Connect Power',
                                'Engage Ignition',
                                'Disengage Ignition',
                                'Turn power supply off',
                              ] as const
                            ).map((cmd) => (
                              <button
                                key={cmd}
                                type="button"
                                onClick={() => appendDraftStep(cmd)}
                                className="hw-btn px-2 py-1 rounded-[2px] text-[10.5px] text-emerald-300 cursor-pointer"
                              >
                                + {cmd}
                              </button>
                            ))}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            <div className="flex items-center gap-1">
                              <select
                                value={psuPresetChoice}
                                onChange={(e) => setPsuPresetChoice(e.target.value as PsuPresetOption)}
                                aria-label="PSU preset selector"
                                className="flex-1 min-w-0 rounded-[2px] border border-[#323a48] bg-[#151a24] px-2 py-1 text-slate-100 cursor-pointer"
                              >
                                {(Object.keys(PSU_PRESET_METADATA) as PsuPresetOption[]).map((k) => (
                                  <option key={k} value={k}>
                                    {PSU_PRESET_METADATA[k].label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  appendDraftStep(PSU_PRESET_METADATA[psuPresetChoice].instruction)
                                }
                                className="hw-btn hw-btn-green px-2 py-1 rounded-[2px] font-bold cursor-pointer"
                              >
                                +Preset
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={28}
                                step={0.1}
                                value={psuVoltChoice}
                                onChange={(e) => setPsuVoltChoice(parseFloat(e.target.value) || 0)}
                                aria-label="PSU voltage"
                                className="w-16 rounded-[2px] border border-[#323a48] bg-[#151a24] px-1.5 py-1 text-amber-300"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  appendDraftStep(
                                    compileInstrumentStepToInstruction({
                                      target: 'POWER_SUPPLY',
                                      action: 'SET_VOLTAGE',
                                      volts: psuVoltChoice,
                                    })
                                  )
                                }
                                className="hw-btn px-2 py-1 rounded-[2px] text-slate-200 cursor-pointer"
                              >
                                +V
                              </button>
                              <input
                                type="number"
                                min={0.2}
                                max={10}
                                step={0.1}
                                value={psuAmpChoice}
                                onChange={(e) => setPsuAmpChoice(parseFloat(e.target.value) || 0.2)}
                                aria-label="PSU current limit"
                                className="w-16 rounded-[2px] border border-[#323a48] bg-[#151a24] px-1.5 py-1 text-emerald-300"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  appendDraftStep(
                                    compileInstrumentStepToInstruction({
                                      target: 'POWER_SUPPLY',
                                      action: 'SET_CURRENT_LIMIT',
                                      amps: psuAmpChoice,
                                    })
                                  )
                                }
                                className="hw-btn px-2 py-1 rounded-[2px] text-slate-200 cursor-pointer"
                              >
                                +A
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {composerTab === 'DMM' && (
                        <div className="space-y-2 font-mono text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={dmmModeChoice}
                              onChange={(e) => setDmmModeChoice(e.target.value as MultimeterMode)}
                              aria-label="DMM mode selector"
                              className="flex-1 min-w-0 rounded-[2px] border border-[#323a48] bg-[#151a24] px-2 py-1 text-slate-100 cursor-pointer"
                            >
                              {DMM_MODES.map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </select>
                            <select
                              value={dmmRangeChoice}
                              onChange={(e) => setDmmRangeChoice(e.target.value)}
                              aria-label="DMM range selector"
                              className="flex-1 min-w-0 rounded-[2px] border border-[#323a48] bg-[#151a24] px-2 py-1 text-slate-100 cursor-pointer"
                            >
                              {(DMM_MANUAL_RANGE_OPTIONS[dmmModeChoice] || []).map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                appendDraftStep(
                                  compileInstrumentStepToInstruction({
                                    target: 'MULTIMETER',
                                    action: 'SET_MODE_RANGE',
                                    mode: dmmModeChoice,
                                    manualRangeLabel:
                                      dmmRangeChoice === 'AUTO' ? null : dmmRangeChoice,
                                  })
                                )
                              }
                              className="hw-btn hw-btn-amber px-2 py-1 rounded-[2px] font-bold cursor-pointer"
                            >
                              +Mode
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            <div className="flex items-center gap-1">
                              <select
                                value={redProbeChoice}
                                onChange={(e) => setRedProbeChoice(e.target.value)}
                                aria-label="Red probe target"
                                className="flex-1 min-w-0 rounded-[2px] border border-rose-500/40 bg-[#151a24] px-2 py-1 text-rose-200 cursor-pointer"
                              >
                                <option value="+12V VBat">+12V VBat Rail</option>
                                <option value="ground">Chassis GND</option>
                                {pins.map((p) => (
                                  <option key={`r-${p.id}`} value={`pin ${p.pinNumber}`}>
                                    Pin {p.pinNumber} · {p.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  appendDraftStep(`Attach red probe to ${redProbeChoice}`)
                                }
                                className="hw-btn px-2 py-1 rounded-[2px] text-rose-300 cursor-pointer"
                              >
                                +Red
                              </button>
                            </div>

                            <div className="flex items-center gap-1">
                              <select
                                value={blackProbeChoice}
                                onChange={(e) => setBlackProbeChoice(e.target.value)}
                                aria-label="Black COM probe target"
                                className="flex-1 min-w-0 rounded-[2px] border border-[#323a48] bg-[#151a24] px-2 py-1 text-slate-200 cursor-pointer"
                              >
                                <option value="ground">Chassis GND</option>
                                {pins.map((p) => (
                                  <option key={`b-${p.id}`} value={`pin ${p.pinNumber}`}>
                                    Pin {p.pinNumber} · {p.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  appendDraftStep(`Attach black probe to ${blackProbeChoice}`)
                                }
                                className="hw-btn px-2 py-1 rounded-[2px] text-slate-200 cursor-pointer"
                              >
                                +Blk
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {composerTab === 'SNIPPETS' && (
                        <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                          {COMMON_MACRO_STEP_SNIPPETS.map((snippet) => (
                            <button
                              key={snippet.label}
                              type="button"
                              onClick={() => appendDraftStep(snippet.instruction)}
                              className="hw-btn rounded-[2px] px-2 py-1 font-mono text-[10px] text-slate-300 hover:text-amber-200 cursor-pointer"
                            >
                              + {snippet.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Sequence Steps Timeline */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-bold uppercase text-slate-300">
                          Action Sequence ({draftSteps.filter((s) => s.trim()).length} steps)
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => startLiveRecording(true)}
                            className="hw-btn px-2 py-0.5 rounded-[2px] font-mono text-[10px] text-rose-300 cursor-pointer"
                          >
                            + Record More
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftSteps((prev) => (prev.length < 20 ? [...prev, ''] : prev))
                            }
                            className="hw-btn px-2 py-0.5 rounded-[2px] font-mono text-[10px] text-amber-300 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" aria-hidden="true" />
                            <span>Blank Step</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        {draftSteps.map((stepVal, idx) => {
                          const preview = stepPreviews[idx];
                          const hasText = stepVal.trim().length > 0;
                          const isValid = hasText && preview.matched && preview.status !== 'FAILED';
                          return (
                            <div
                              key={idx}
                              className="rounded-[2px] border border-[#28303e] bg-[#0a0d13] p-2 space-y-1"
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="w-5 font-mono text-[10.5px] tabular-nums text-slate-500 shrink-0">
                                  {String(idx + 1).padStart(2, '0')}.
                                </span>
                                <input
                                  type="text"
                                  value={stepVal}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setDraftSteps((prev) =>
                                      prev.map((s, i) => (i === idx ? val : s))
                                    );
                                    setEditorError(null);
                                  }}
                                  aria-label={`Sequence step ${idx + 1}`}
                                  placeholder='e.g. "Toggle open circuit on pin 10" or "Set engine RPM to 1150"'
                                  className="flex-1 min-w-0 rounded-[2px] border border-[#2d3544] bg-[#141923] px-2 py-1 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() =>
                                    setDraftSteps((prev) => {
                                      if (idx <= 0) return prev;
                                      const next = [...prev];
                                      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                      return next;
                                    })
                                  }
                                  aria-label={`Move step ${idx + 1} up`}
                                  className="hw-btn inline-flex h-6 w-6 items-center justify-center rounded-[2px] text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowUp className="w-3 h-3" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === draftSteps.length - 1}
                                  onClick={() =>
                                    setDraftSteps((prev) => {
                                      if (idx >= prev.length - 1) return prev;
                                      const next = [...prev];
                                      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                                      return next;
                                    })
                                  }
                                  aria-label={`Move step ${idx + 1} down`}
                                  className="hw-btn inline-flex h-6 w-6 items-center justify-center rounded-[2px] text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowDown className="w-3 h-3" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraftSteps((prev) =>
                                      prev.length <= 1 ? [''] : prev.filter((_, i) => i !== idx)
                                    )
                                  }
                                  aria-label={`Remove step ${idx + 1}`}
                                  className="hw-btn inline-flex h-6 w-6 items-center justify-center rounded-[2px] text-slate-400 hover:text-rose-300 cursor-pointer"
                                >
                                  <X className="w-3 h-3" aria-hidden="true" />
                                </button>
                              </div>

                              {hasText && (
                                <p
                                  className={`pl-6 font-mono text-[10px] ${
                                    isValid ? 'text-emerald-400' : 'text-amber-300'
                                  }`}
                                >
                                  {isValid
                                    ? `✓ ${preview.actionDescription}`
                                    : preview.matched
                                    ? `▲ ${preview.actionDescription}`
                                    : '▲ Unrecognized hardware phrase — adjust phrasing to ensure execution'}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {editorError && (
                      <p role="alert" className="font-mono text-[11px] text-amber-300">
                        {editorError}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#242c38] pt-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          const cleanSteps = draftSteps.map((s) => s.trim()).filter(Boolean);
                          if (cleanSteps.length === 0) return;
                          runMacroObject({
                            name: draftName.trim() || draftTrigger.trim() || 'Draft Sequence',
                            triggerPhrase: draftTrigger.trim() || 'Draft Sequence',
                            steps: cleanSteps,
                          });
                        }}
                        className="hw-btn hw-btn-amber inline-flex min-h-[34px] items-center gap-1 rounded-[2px] px-3 py-1.5 font-mono text-[11px] font-bold uppercase cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Test on Bench</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        {editingMacroId && (
                          <button
                            type="button"
                            onClick={handleStartBlankMacro}
                            className="hw-btn min-h-[34px] rounded-[2px] px-2.5 py-1.5 font-mono text-[11px] text-slate-300 hover:text-white cursor-pointer"
                          >
                            Clear Draft
                          </button>
                        )}
                        <button
                          type="submit"
                          data-testid="save-library-macro-btn"
                          className="hw-btn hw-btn-green min-h-[34px] rounded-[2px] px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider cursor-pointer"
                        >
                          {editingMacroId ? 'Update Macro' : 'Save to Library'}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
