import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  Layers,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  SkipForward,
  Trash2,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import type {
  DiagnosticTroubleCode,
  EcuPin,
  WireConnection,
} from '../types/ecu';
import {
  createEmptyFaultSequence,
  deleteCustomFaultSequence,
  describeFaultMode,
  duplicateFaultSequence,
  evaluateDiagnosticReasoning,
  evaluateFaultSequenceFrame,
  exportFaultSequenceJson,
  importFaultSequenceJson,
  loadSavedFaultSequences,
  saveCustomFaultSequence,
  type CustomFaultMode,
  type CustomFaultSequence,
  type FaultBuilderStageItem,
  type FaultDifficultyLevel,
  type FaultSequenceFrameEvaluation,
  type IntermittentEffect,
  type ReasoningCheckResult,
  type ReasoningFaultCategory,
} from '../simulation/faults/faultSequenceService';

export interface FaultBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  pins: EcuPin[];
  wires: WireConnection[];
  nodeVoltages: Record<string, number>;
  activeDTCs: DiagnosticTroubleCode[];
  supplyCurrentDrawAmps: number;
  isPowerOn: boolean;
  activeSequence: CustomFaultSequence | null;
  isPlaying: boolean;
  elapsedMs: number;
  isBlindMode: boolean;
  onToggleBlindMode: (blind: boolean) => void;
  onRunSequence: (sequence: CustomFaultSequence, blindMode?: boolean) => void;
  onPauseToggle: () => void;
  onJumpToStage: (stageIndex: number) => void;
  onStopSequence: () => void;
  onFocusPin?: (pinId: string, label: string) => void;
}

const FAULT_MODE_OPTIONS: ReadonlyArray<{
  value: CustomFaultMode;
  label: string;
  summary: string;
}> = [
  {
    value: 'INTERMITTENT_SIGNAL',
    label: 'Intermittent Sensor Signal',
    summary: 'Periodic ON/OFF dropout, ground pinch, or resistance chatter',
  },
  {
    value: 'RESISTANCE_BUILDUP',
    label: 'Resistance Buildup',
    summary: 'Steady or ramping contact corrosion (Ω) along pin path',
  },
  {
    value: 'HARD_GROUND',
    label: 'Hard Ground (KL31 Short)',
    summary: 'Low-impedance 0.01Ω shunt directly to chassis ground',
  },
  {
    value: 'SHORT_TO_VBAT',
    label: 'Short to +12V VBAT',
    summary: 'Low-impedance 0.01Ω shunt directly to battery supply rail',
  },
  {
    value: 'OPEN_CIRCUIT',
    label: 'Open Circuit Break',
    summary: 'Disconnected terminal / infinite impedance open break',
  },
  {
    value: 'CUT_WIRE',
    label: 'Harness Wire Cut',
    summary: 'Severs a selected harness wire branch between ECU and load',
  },
  {
    value: 'CKP_DROPOUT',
    label: 'CKP Crank Signal Dropout',
    summary: 'Drops crankshaft 60-2 VR sync trigger pulses',
  },
];

const REASONING_CATEGORIES: ReadonlyArray<{
  value: ReasoningFaultCategory;
  label: string;
}> = [
  { value: 'INTERMITTENT', label: 'Intermittent Signal Dropout / Chatter' },
  { value: 'RESISTANCE_BUILDUP', label: 'Resistance Buildup / Terminal Corrosion' },
  { value: 'HARD_GROUND', label: 'Hard Short to Chassis Ground (KL31)' },
  { value: 'SHORT_TO_VBAT', label: 'Short to Battery +12V (VBAT)' },
  { value: 'OPEN_CIRCUIT', label: 'Open Circuit / Harness Break' },
  { value: 'CKP_DROPOUT', label: 'CKP Crank Sensor Signal Loss' },
  { value: 'MULTI_FAULT', label: 'Combined Multi-Fault Stack' },
];

const DIFFICULTY_LABELS: Record<FaultDifficultyLevel, string> = {
  APPRENTICE: 'Apprentice',
  TECHNICIAN: 'Technician',
  MASTER: 'Master',
};

function makeLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const FaultBuilderModal: React.FC<FaultBuilderModalProps> = ({
  isOpen,
  onClose,
  pins,
  wires,
  nodeVoltages,
  activeDTCs,
  supplyCurrentDrawAmps,
  isPowerOn,
  activeSequence,
  isPlaying,
  elapsedMs,
  isBlindMode,
  onToggleBlindMode,
  onRunSequence,
  onPauseToggle,
  onJumpToStage,
  onStopSequence,
  onFocusPin,
}) => {
  const [sequences, setSequences] = useState<CustomFaultSequence[]>(() =>
    loadSavedFaultSequences()
  );
  const [draft, setDraft] = useState<CustomFaultSequence>(
    () => activeSequence ?? loadSavedFaultSequences()[0] ?? createEmptyFaultSequence()
  );
  const [selectedStageIdx, setSelectedStageIdx] = useState(0);
  const [statusMessage, setStatusMessage] = useState<{
    tone: 'INFO' | 'SUCCESS' | 'ERROR';
    text: string;
  } | null>(null);
  const [guessPinId, setGuessPinId] = useState<string>(() => pins[6]?.id ?? pins[0]?.id ?? 'ecu-pin-7');
  const [guessCategory, setGuessCategory] = useState<ReasoningFaultCategory>('INTERMITTENT');
  const [reasoningResult, setReasoningResult] = useState<ReasoningCheckResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSequences(loadSavedFaultSequences());
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (selectedStageIdx >= draft.steps.length) {
      setSelectedStageIdx(Math.max(0, draft.steps.length - 1));
    }
  }, [draft.steps.length, selectedStageIdx]);

  const liveFrameEval: FaultSequenceFrameEvaluation | null = useMemo(() => {
    if (!activeSequence) return null;
    return evaluateFaultSequenceFrame(activeSequence, elapsedMs, pins);
  }, [activeSequence, elapsedMs, pins]);

  const totalSequenceDurationSec = useMemo(
    () => draft.steps.reduce((acc, s) => acc + Math.max(2, s.durationSec), 0),
    [draft.steps]
  );

  if (!isOpen) return null;

  const activeStage = draft.steps[selectedStageIdx] ?? draft.steps[0];
  const isDraftActiveOnBench = Boolean(activeSequence && activeSequence.id === draft.id);

  const selectSequenceForEdit = (seq: CustomFaultSequence) => {
    setDraft(JSON.parse(JSON.stringify(seq)) as CustomFaultSequence);
    setSelectedStageIdx(0);
    setReasoningResult(null);
    setStatusMessage(null);
  };

  const handleCreateNew = () => {
    const fresh = createEmptyFaultSequence(`Custom Drill ${sequences.filter((s) => !s.isBuiltInPreset).length + 1}`);
    setDraft(fresh);
    setSelectedStageIdx(0);
    setReasoningResult(null);
    setStatusMessage({ tone: 'INFO', text: 'New sequence draft ready. Add stages and save when complete.' });
  };

  const handleSaveDraft = (): CustomFaultSequence | null => {
    try {
      const { saved, allSequences } = saveCustomFaultSequence(draft);
      setSequences(allSequences);
      setDraft(saved);
      setStatusMessage({
        tone: 'SUCCESS',
        text: `Saved "${saved.title}" (${saved.steps.length} stages) to local bench storage.`,
      });
      return saved;
    } catch (err) {
      setStatusMessage({
        tone: 'ERROR',
        text: err instanceof Error ? err.message : 'Unable to save fault sequence.',
      });
      return null;
    }
  };

  const handleDuplicate = (seq: CustomFaultSequence) => {
    const { cloned, allSequences } = duplicateFaultSequence(seq);
    setSequences(allSequences);
    setDraft(cloned);
    setSelectedStageIdx(0);
    setStatusMessage({ tone: 'SUCCESS', text: `Cloned "${cloned.title}" for editing.` });
  };

  const handleDelete = (seqId: string) => {
    const nextList = deleteCustomFaultSequence(seqId);
    setSequences(nextList);
    if (draft.id === seqId) {
      const fallback = nextList[0] ?? createEmptyFaultSequence();
      setDraft(fallback);
      setSelectedStageIdx(0);
    }
    setStatusMessage({ tone: 'INFO', text: 'Deleted custom sequence from bench library.' });
  };

  const handleExportJson = () => {
    const json = exportFaultSequenceJson(draft);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${draft.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'fault-sequence'}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatusMessage({ tone: 'SUCCESS', text: 'Exported sequence JSON file.' });
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const raw = await file.text();
      const { imported, allSequences } = importFaultSequenceJson(raw);
      setSequences(allSequences);
      setDraft(imported);
      setSelectedStageIdx(0);
      setStatusMessage({ tone: 'SUCCESS', text: `Imported "${imported.title}".` });
    } catch (err) {
      setStatusMessage({
        tone: 'ERROR',
        text: err instanceof Error ? err.message : 'Failed to import sequence JSON.',
      });
    }
  };

  const updateStage = (idx: number, updater: (stage: CustomFaultSequence['steps'][number]) => CustomFaultSequence['steps'][number]) => {
    setDraft((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      steps: prev.steps.map((step, i) => (i === idx ? updater(step) : step)),
    }));
  };

  const handleAddStage = () => {
    setDraft((prev) => {
      const nextIdx = prev.steps.length + 1;
      const newStep = {
        id: makeLocalId('fstep'),
        name: `Stage ${nextIdx}: Follow-On Fault`,
        durationSec: 6,
        notes: 'Describe expected multimeter/oscilloscope symptom in this stage.',
        items: [
          {
            id: makeLocalId('fitem'),
            pinId: 'ecu-pin-7',
            mode: 'HARD_GROUND' as CustomFaultMode,
            label: 'TPS_SIG Short to KL31 Ground',
          },
        ],
      };
      return {
        ...prev,
        updatedAt: Date.now(),
        steps: [...prev.steps, newStep],
      };
    });
    setSelectedStageIdx(draft.steps.length);
  };

  const handleMoveStage = (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= draft.steps.length) return;
    setDraft((prev) => {
      const next = [...prev.steps];
      const [item] = next.splice(idx, 1);
      next.splice(targetIdx, 0, item);
      return { ...prev, updatedAt: Date.now(), steps: next };
    });
    setSelectedStageIdx(targetIdx);
  };

  const handleRemoveStage = (idx: number) => {
    if (draft.steps.length <= 1) return;
    setDraft((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      steps: prev.steps.filter((_, i) => i !== idx),
    }));
    setSelectedStageIdx(Math.max(0, idx - 1));
  };

  const handleAddFaultItem = () => {
    if (!activeStage) return;
    const defaultPin = pins.find((p) => p.id === 'ecu-pin-7') ?? pins[0];
    const newItem: FaultBuilderStageItem = {
      id: makeLocalId('fitem'),
      pinId: defaultPin?.id ?? 'ecu-pin-7',
      mode: 'RESISTANCE_BUILDUP',
      label: `${defaultPin?.label ?? 'Pin'} Resistance Buildup`,
      startOhms: 50,
      endOhms: 250,
      onDurationMs: 700,
      offDurationMs: 900,
      intermittentEffect: 'OPEN_DROPOUT',
    };
    updateStage(selectedStageIdx, (step) => ({
      ...step,
      items: [...step.items, newItem],
    }));
  };

  const handleUpdateFaultItem = (
    itemId: string,
    patch: Partial<FaultBuilderStageItem>
  ) => {
    updateStage(selectedStageIdx, (step) => ({
      ...step,
      items: step.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
    }));
  };

  const handleRemoveFaultItem = (itemId: string) => {
    updateStage(selectedStageIdx, (step) => ({
      ...step,
      items: step.items.filter((it) => it.id !== itemId),
    }));
  };

  const handleRunCurrentDraft = () => {
    const targetSeq = draft.isBuiltInPreset ? draft : handleSaveDraft() ?? draft;
    onRunSequence(targetSeq, isBlindMode);
    setReasoningResult(null);
    setStatusMessage({
      tone: 'SUCCESS',
      text: `Running "${targetSeq.title}" against the live MNA circuit solver.`,
    });
  };

  const handleVerifyReasoning = () => {
    const subject = activeSequence ?? draft;
    const result = evaluateDiagnosticReasoning(subject, guessPinId, guessCategory, pins);
    setReasoningResult(result);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fault-builder-modal-title"
    >
      <div className="flex h-full max-h-[92vh] w-full max-w-[1360px] flex-col overflow-hidden rounded-xl border border-[#203653] bg-[#060B14] text-[#eaf3ff]">
        {/* Top Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#203653] bg-[#0A1220] px-4 py-3">
          <div className="min-w-0">
            <h2
              id="fault-builder-modal-title"
              className="flex items-center gap-2 font-hud text-sm sm:text-base font-bold uppercase tracking-wider text-[#eaf3ff]"
            >
              <Layers className="h-4 w-4 text-[#19c8f5] shrink-0" aria-hidden="true" />
              <span>Fault Builder · Multi-Fault Sequence Composer</span>
            </h2>
            <p className="mt-0.5 text-xs text-[#91a4bd]">
              Compose and save sequential or stacked electrical faults (intermittent dropouts, resistance buildup ramps, hard ground shorts) driven by the MNA solver.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCreateNew}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#203653] bg-[#0F1B2E] px-3 py-1.5 font-mono text-xs font-semibold text-[#eaf3ff] hover:border-[#19c8f5]/60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 text-[#19c8f5]" aria-hidden="true" />
              <span>New Sequence</span>
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={draft.isBuiltInPreset}
              title={draft.isBuiltInPreset ? 'Clone this preset first to save edits' : 'Save custom sequence'}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#19c8f5]/50 bg-[#0d2738] px-3 py-1.5 font-mono text-xs font-semibold text-[#19c8f5] hover:bg-[#13354b] disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Save Sequence</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Fault Builder"
              className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-[#203653] bg-[#0F1B2E] text-[#91a4bd] hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Status Notification Bar */}
        {statusMessage && (
          <div
            role="status"
            className={`flex items-center justify-between gap-2 border-b px-4 py-2 font-mono text-xs ${
              statusMessage.tone === 'ERROR'
                ? 'border-[#ff4d62]/40 bg-[#260d16] text-[#ff8a99]'
                : statusMessage.tone === 'SUCCESS'
                  ? 'border-[#20d889]/40 bg-[#08241b] text-[#20d889]'
                  : 'border-[#203653] bg-[#0B1526] text-[#d4e3f6]'
            }`}
          >
            <span>{statusMessage.text}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-[11px] underline hover:text-white cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 3-Column Studio Body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[270px_1fr_340px] overflow-y-auto lg:overflow-hidden">
          {/* Column 1: Sequence Library */}
          <aside
            aria-label="Saved fault sequences library"
            className="flex flex-col gap-3 border-b lg:border-b-0 lg:border-r border-[#203653] bg-[#080F1C] p-4 lg:overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#91a4bd]">
                Saved Sequences ({sequences.length})
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Import fault sequence JSON"
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-[#203653] bg-[#0F1B2E] px-2 py-1 font-mono text-[11px] text-[#d4e3f6] hover:border-[#19c8f5]/60 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="h-3 w-3" aria-hidden="true" />
                  <span>Import</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  title="Export active draft JSON"
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-[#203653] bg-[#0F1B2E] px-2 py-1 font-mono text-[11px] text-[#d4e3f6] hover:border-[#19c8f5]/60 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="h-3 w-3" aria-hidden="true" />
                  <span>Export</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {sequences.map((seq) => {
                const isSelected = seq.id === draft.id;
                const isRunningThis = activeSequence?.id === seq.id;
                const seqTotalSec = seq.steps.reduce((a, s) => a + s.durationSec, 0);
                return (
                  <div
                    key={seq.id}
                    className={`rounded-lg border p-2.5 transition-colors ${
                      isSelected
                        ? 'border-[#19c8f5]/80 bg-[#0E1E33]'
                        : 'border-[#203653] bg-[#0A1220] hover:border-[#38a3ff]/50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectSequenceForEdit(seq)}
                      className="w-full text-left cursor-pointer"
                    >
                      <div className="font-mono text-xs font-semibold text-[#eaf3ff] leading-snug">
                        {seq.title}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[#91a4bd] font-mono tabular-nums">
                        <span>{seq.isBuiltInPreset ? 'Starter Drill' : 'Saved Custom'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{DIFFICULTY_LABELS[seq.difficulty]}</span>
                        <span aria-hidden="true">·</span>
                        <span>{seq.steps.length} stages ({seqTotalSec}s)</span>
                      </div>
                      {isRunningThis && (
                        <div className="mt-1 font-mono text-[11px] font-semibold text-[#20d889]">
                          {isPlaying ? '▶ Running on Bench' : '⏸ Loaded on Bench'}
                        </div>
                      )}
                    </button>

                    <div className="mt-2 flex items-center gap-1.5 border-t border-[#203653]/70 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          selectSequenceForEdit(seq);
                          onRunSequence(seq, isBlindMode);
                        }}
                        className="inline-flex min-h-[30px] items-center gap-1 rounded-md border border-[#ffb020]/50 bg-[#231907] px-2 py-1 font-mono text-[11px] font-semibold text-[#ffb020] hover:bg-[#33240a] whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Play className="h-3 w-3" aria-hidden="true" />
                        <span>Run</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(seq)}
                        className="inline-flex min-h-[30px] items-center gap-1 rounded-md border border-[#203653] bg-[#0F1B2E] px-2 py-1 font-mono text-[11px] text-[#d4e3f6] hover:border-[#19c8f5]/50 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        <span>Clone</span>
                      </button>
                      {!seq.isBuiltInPreset && (
                        <button
                          type="button"
                          onClick={() => handleDelete(seq.id)}
                          aria-label={`Delete ${seq.title}`}
                          className="ml-auto inline-flex min-h-[30px] items-center gap-1 rounded-md border border-[#ff4d62]/40 bg-[#240d15] px-2 py-1 font-mono text-[11px] text-[#ff8a99] hover:bg-[#381320] whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Column 2: Stage Timeline & Multi-Fault Composer */}
          <section
            aria-label="Fault sequence composer"
            className="flex flex-col gap-4 border-b lg:border-b-0 lg:border-r border-[#203653] bg-[#060B14] p-4 lg:overflow-y-auto"
          >
            {draft.isBuiltInPreset && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#ffb020]/45 bg-[#1c1406] px-3 py-2 text-xs text-[#ffe29e]">
                <span>
                  Viewing starter drill preset. Clone it to customize stages or resistances.
                </span>
                <button
                  type="button"
                  onClick={() => handleDuplicate(draft)}
                  className="inline-flex min-h-[32px] items-center gap-1.5 rounded-md border border-[#ffb020]/60 bg-[#2c1f08] px-2.5 py-1 font-mono text-xs font-semibold text-[#ffb020] hover:bg-[#3a280a] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Clone & Edit</span>
                </button>
              </div>
            )}

            {/* Sequence Metadata Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-[#203653] bg-[#0A1220] p-3">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="fault-seq-title"
                  className="font-mono text-[11px] uppercase tracking-wider text-[#91a4bd]"
                >
                  Sequence Name
                </label>
                <input
                  id="fault-seq-title"
                  type="text"
                  disabled={Boolean(draft.isBuiltInPreset)}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, title: e.target.value, updatedAt: Date.now() }))
                  }
                  maxLength={100}
                  className="min-h-[38px] rounded-md border border-[#203653] bg-[#060B14] px-2.5 py-1.5 text-xs text-[#eaf3ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19c8f5] disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="fault-seq-difficulty"
                    className="font-mono text-[11px] uppercase tracking-wider text-[#91a4bd]"
                  >
                    Difficulty
                  </label>
                  <select
                    id="fault-seq-difficulty"
                    disabled={Boolean(draft.isBuiltInPreset)}
                    value={draft.difficulty}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        difficulty: e.target.value as FaultDifficultyLevel,
                        updatedAt: Date.now(),
                      }))
                    }
                    className="min-h-[38px] rounded-md border border-[#203653] bg-[#060B14] px-2 py-1.5 text-xs text-[#eaf3ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19c8f5] disabled:opacity-60"
                  >
                    <option value="APPRENTICE">Apprentice</option>
                    <option value="TECHNICIAN">Technician</option>
                    <option value="MASTER">Master</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex min-h-[38px] items-center gap-2 rounded-md border border-[#203653] bg-[#060B14] px-2.5 py-1.5 text-xs text-[#d4e3f6] cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={Boolean(draft.isBuiltInPreset)}
                      checked={draft.loopPlayback}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          loopPlayback: e.target.checked,
                          updatedAt: Date.now(),
                        }))
                      }
                      className="h-4 w-4 accent-[#19c8f5]"
                    />
                    <span className="whitespace-nowrap">Loop Cycle</span>
                  </label>
                </div>
              </div>

              <div className="sm:col-span-2 flex flex-col gap-1">
                <label
                  htmlFor="fault-seq-desc"
                  className="font-mono text-[11px] uppercase tracking-wider text-[#91a4bd]"
                >
                  Diagnostic Scenario Brief
                </label>
                <input
                  id="fault-seq-desc"
                  type="text"
                  disabled={Boolean(draft.isBuiltInPreset)}
                  value={draft.description}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, description: e.target.value, updatedAt: Date.now() }))
                  }
                  maxLength={300}
                  className="min-h-[36px] rounded-md border border-[#203653] bg-[#060B14] px-2.5 py-1.5 text-xs text-[#eaf3ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19c8f5] disabled:opacity-60"
                />
              </div>
            </div>

            {/* Stage Timeline Tabs */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#91a4bd] tabular-nums">
                  Sequence Stages ({draft.steps.length}) · Total {totalSequenceDurationSec}s
                </span>
                {!draft.isBuiltInPreset && (
                  <button
                    type="button"
                    onClick={handleAddStage}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#19c8f5]/50 bg-[#0d2738] px-2.5 py-1 font-mono text-xs font-semibold text-[#19c8f5] hover:bg-[#13354b] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Add Stage</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {draft.steps.map((step, idx) => {
                  const isSelected = idx === selectedStageIdx;
                  const isLiveStage = isDraftActiveOnBench && liveFrameEval?.activeStepIndex === idx;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setSelectedStageIdx(idx)}
                      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-xs tabular-nums whitespace-nowrap shrink-0 cursor-pointer ${
                        isSelected
                          ? 'border-[#19c8f5] bg-[#102642] font-bold text-[#eaf3ff]'
                          : 'border-[#203653] bg-[#0A1220] text-[#91a4bd] hover:text-white'
                      }`}
                    >
                      <span>{String(idx + 1).padStart(2, '0')}.</span>
                      <span className="max-w-[140px] truncate">{step.name.replace(/^Stage \d+:\s*/i, '')}</span>
                      <span className="text-[#7c93b2]">({step.durationSec}s · {step.items.length})</span>
                      {isLiveStage && <span className="text-[#20d889] font-bold">LIVE</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Stage Editor */}
            {activeStage && (
              <div className="flex flex-col gap-3 rounded-lg border border-[#203653] bg-[#0A1220] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#203653] pb-2.5">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#19c8f5]">
                    Editing Stage {selectedStageIdx + 1} of {draft.steps.length}
                  </span>

                  {!draft.isBuiltInPreset && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleMoveStage(selectedStageIdx, -1)}
                        disabled={selectedStageIdx === 0}
                        aria-label="Move stage earlier"
                        className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md border border-[#203653] bg-[#060B14] text-[#d4e3f6] disabled:opacity-35 cursor-pointer"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveStage(selectedStageIdx, 1)}
                        disabled={selectedStageIdx === draft.steps.length - 1}
                        aria-label="Move stage later"
                        className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md border border-[#203653] bg-[#060B14] text-[#d4e3f6] disabled:opacity-35 cursor-pointer"
                      >
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveStage(selectedStageIdx)}
                        disabled={draft.steps.length <= 1}
                        className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-[#ff4d62]/40 bg-[#240d15] px-2 py-1 font-mono text-[11px] text-[#ff8a99] disabled:opacity-35 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                        <span>Remove Stage</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px] gap-3">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="stage-name-input"
                      className="font-mono text-[11px] uppercase tracking-wider text-[#91a4bd]"
                    >
                      Stage Label
                    </label>
                    <input
                      id="stage-name-input"
                      type="text"
                      disabled={Boolean(draft.isBuiltInPreset)}
                      value={activeStage.name}
                      onChange={(e) =>
                        updateStage(selectedStageIdx, (s) => ({ ...s, name: e.target.value }))
                      }
                      maxLength={100}
                      className="min-h-[36px] rounded-md border border-[#203653] bg-[#060B14] px-2.5 py-1.5 text-xs text-[#eaf3ff] disabled:opacity-60"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="stage-duration-input"
                      className="font-mono text-[11px] uppercase tracking-wider text-[#91a4bd]"
                    >
                      Duration (sec)
                    </label>
                    <input
                      id="stage-duration-input"
                      type="number"
                      min={2}
                      max={120}
                      disabled={Boolean(draft.isBuiltInPreset)}
                      value={activeStage.durationSec}
                      onChange={(e) =>
                        updateStage(selectedStageIdx, (s) => ({
                          ...s,
                          durationSec: Math.max(2, Math.min(120, Number(e.target.value) || 6)),
                        }))
                      }
                      className="min-h-[36px] rounded-md border border-[#203653] bg-[#060B14] px-2.5 py-1.5 font-mono tabular-nums text-xs text-[#eaf3ff] disabled:opacity-60"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="stage-notes-input"
                    className="font-mono text-[11px] uppercase tracking-wider text-[#91a4bd]"
                  >
                    Stage Diagnostic Notes
                  </label>
                  <input
                    id="stage-notes-input"
                    type="text"
                    disabled={Boolean(draft.isBuiltInPreset)}
                    value={activeStage.notes}
                    onChange={(e) =>
                      updateStage(selectedStageIdx, (s) => ({ ...s, notes: e.target.value }))
                    }
                    maxLength={280}
                    className="min-h-[36px] rounded-md border border-[#203653] bg-[#060B14] px-2.5 py-1.5 text-xs text-[#d4e3f6] disabled:opacity-60"
                  />
                </div>

                {/* Multi-Fault Items Stack */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#91a4bd]">
                    Simultaneous Faults in This Stage ({activeStage.items.length})
                  </span>
                  {!draft.isBuiltInPreset && (
                    <button
                      type="button"
                      onClick={handleAddFaultItem}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#ffb020]/55 bg-[#241a08] px-2.5 py-1 font-mono text-xs font-semibold text-[#ffb020] hover:bg-[#33240a] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Add Fault</span>
                    </button>
                  )}
                </div>

                {activeStage.items.length === 0 ? (
                  <div className="rounded-lg border border-[#203653] bg-[#060B14] p-3 font-mono text-xs text-[#91a4bd]">
                    Nominal baseline stage (0 faults active). Useful as a baseline comparison step before injecting faults.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {activeStage.items.map((item, itemIdx) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-[#203653] bg-[#060B14] p-3 flex flex-col gap-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-[#eaf3ff]">
                            Fault #{itemIdx + 1} · {describeFaultMode(item.mode)}
                          </span>
                          {!draft.isBuiltInPreset && (
                            <button
                              type="button"
                              onClick={() => handleRemoveFaultItem(item.id)}
                              className="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-[#ff4d62]/40 bg-[#240d15] px-2 py-0.5 font-mono text-[11px] text-[#ff8a99] whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                              <span>Remove</span>
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="flex flex-col gap-1">
                            <label className="font-mono text-[11px] text-[#91a4bd]">
                              Fault Mechanism
                            </label>
                            <select
                              disabled={Boolean(draft.isBuiltInPreset)}
                              value={item.mode}
                              onChange={(e) => {
                                const nextMode = e.target.value as CustomFaultMode;
                                handleUpdateFaultItem(item.id, {
                                  mode: nextMode,
                                  label: `${pins.find((p) => p.id === item.pinId)?.label ?? 'ECU'} ${describeFaultMode(nextMode)}`,
                                });
                              }}
                              className="min-h-[36px] rounded-md border border-[#203653] bg-[#0A1220] px-2 py-1.5 text-xs text-[#eaf3ff] disabled:opacity-60"
                            >
                              {FAULT_MODE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {item.mode === 'CUT_WIRE' ? (
                            <div className="flex flex-col gap-1">
                              <label className="font-mono text-[11px] text-[#91a4bd]">
                                Harness Wire to Cut
                              </label>
                              <select
                                disabled={Boolean(draft.isBuiltInPreset)}
                                value={item.wireId || wires[0]?.id || 'wire-2'}
                                onChange={(e) => {
                                  const selectedWire = wires.find((w) => w.id === e.target.value);
                                  handleUpdateFaultItem(item.id, {
                                    wireId: e.target.value,
                                    pinId: selectedWire?.sourcePinId || item.pinId,
                                  });
                                }}
                                className="min-h-[36px] rounded-md border border-[#203653] bg-[#0A1220] px-2 py-1.5 text-xs text-[#eaf3ff] disabled:opacity-60"
                              >
                                {wires.map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.label} ({w.id})
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : item.mode !== 'CKP_DROPOUT' ? (
                            <div className="flex flex-col gap-1">
                              <label className="font-mono text-[11px] text-[#91a4bd]">
                                Target ECU Pin
                              </label>
                              <select
                                disabled={Boolean(draft.isBuiltInPreset)}
                                value={item.pinId}
                                onChange={(e) =>
                                  handleUpdateFaultItem(item.id, { pinId: e.target.value })
                                }
                                className="min-h-[36px] rounded-md border border-[#203653] bg-[#0A1220] px-2 py-1.5 text-xs text-[#eaf3ff] disabled:opacity-60"
                              >
                                {pins.map((pin) => (
                                  <option key={pin.id} value={pin.id}>
                                    Pin #{pin.pinNumber} · {pin.label} ({pin.name})
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="flex flex-col justify-end font-mono text-[11px] text-[#91a4bd] pb-2">
                              Target: Crankshaft 60-2 VR Sync Signal
                            </div>
                          )}
                        </div>

                        {/* Resistance Buildup Controls */}
                        {item.mode === 'RESISTANCE_BUILDUP' && (
                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="flex flex-col gap-1">
                              <label className="font-mono text-[11px] text-[#91a4bd]">
                                Start Resistance (Ω)
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={100000}
                                step={5}
                                disabled={Boolean(draft.isBuiltInPreset)}
                                value={item.startOhms ?? 50}
                                onChange={(e) =>
                                  handleUpdateFaultItem(item.id, {
                                    startOhms: Math.max(1, Number(e.target.value) || 1),
                                  })
                                }
                                className="min-h-[36px] rounded-md border border-[#203653] bg-[#0A1220] px-2.5 py-1.5 font-mono tabular-nums text-xs text-[#eaf3ff] disabled:opacity-60"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="font-mono text-[11px] text-[#91a4bd]">
                                End Resistance (Ω)
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={100000}
                                step={5}
                                disabled={Boolean(draft.isBuiltInPreset)}
                                value={item.endOhms ?? item.startOhms ?? 250}
                                onChange={(e) =>
                                  handleUpdateFaultItem(item.id, {
                                    endOhms: Math.max(1, Number(e.target.value) || 1),
                                  })
                                }
                                className="min-h-[36px] rounded-md border border-[#203653] bg-[#0A1220] px-2.5 py-1.5 font-mono tabular-nums text-xs text-[#eaf3ff] disabled:opacity-60"
                              />
                            </div>
                          </div>
                        )}

                        {/* Intermittent Signal Controls */}
                        {item.mode === 'INTERMITTENT_SIGNAL' && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div className="flex flex-col gap-1">
                              <label className="font-mono text-[11px] text-[#91a4bd]">
                                Fault Pulse ON (ms)
                              </label>
                              <input
                                type="number"
                                min={150}
                                max={30000}
                                step={50}
                                disabled={Boolean(draft.isBuiltInPreset)}
                                value={item.onDurationMs ?? 700}
                                onChange={(e) =>
                                  handleUpdateFaultItem(item.id, {
                                    onDurationMs: Math.max(150, Number(e.target.value) || 700),
                                  })
                                }
                                className="min-h-[36px] rounded-md border border-[#203653] bg-[#0A1220] px-2.5 py-1.5 font-mono tabular-nums text-xs text-[#eaf3ff] disabled:opacity-60"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="font-mono text-[11px] text-[#91a4bd]">
                                Clean Recovery (ms)
                              </label>
                              <input
                                type="number"
                                min={150}
                                max={30000}
                                step={50}
                                disabled={Boolean(draft.isBuiltInPreset)}
                                value={item.offDurationMs ?? 900}
                                onChange={(e) =>
                                  handleUpdateFaultItem(item.id, {
                                    offDurationMs: Math.max(150, Number(e.target.value) || 900),
                                  })
                                }
                                className="min-h-[36px] rounded-md border border-[#203653] bg-[#0A1220] px-2.5 py-1.5 font-mono tabular-nums text-xs text-[#eaf3ff] disabled:opacity-60"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="font-mono text-[11px] text-[#91a4bd]">
                                Dropout Behavior
                              </label>
                              <select
                                disabled={Boolean(draft.isBuiltInPreset)}
                                value={item.intermittentEffect ?? 'OPEN_DROPOUT'}
                                onChange={(e) =>
                                  handleUpdateFaultItem(item.id, {
                                    intermittentEffect: e.target.value as IntermittentEffect,
                                  })
                                }
                                className="min-h-[36px] rounded-md border border-[#203653] bg-[#0A1220] px-2 py-1.5 text-xs text-[#eaf3ff] disabled:opacity-60"
                              >
                                <option value="OPEN_DROPOUT">Open Dropout</option>
                                <option value="SHORT_TO_GND">Short to GND</option>
                                <option value="HIGH_RESISTANCE">High Resistance (+250Ω)</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Column 3: Live Bench Runner & Diagnostic Reasoning Test */}
          <aside
            aria-label="Live runner and diagnostic reasoning challenge"
            className="flex flex-col gap-4 bg-[#080F1C] p-4 lg:overflow-y-auto"
          >
            {/* Playback Transport Card */}
            <div className="flex flex-col gap-3 rounded-lg border border-[#203653] bg-[#0A1220] p-3">
              <div className="flex items-center justify-between gap-2 border-b border-[#203653] pb-2">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#19c8f5]">
                  Live Bench Sequence Runner
                </span>
                <span className="font-mono text-[11px] text-[#91a4bd] tabular-nums">
                  {activeSequence ? (isPlaying ? 'ACTIVE' : 'PAUSED') : 'IDLE'}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleRunCurrentDraft}
                  className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#ffb020]/60 bg-[#281d08] px-3 py-1.5 font-mono text-xs font-bold text-[#ffb020] hover:bg-[#3a2a0b] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isDraftActiveOnBench ? 'Restart on Bench' : 'Run Sequence on Bench'}</span>
                </button>
              </div>

              {activeSequence && (
                <div className="flex flex-col gap-2 rounded-md border border-[#203653] bg-[#060B14] p-2.5">
                  <div className="flex items-center justify-between gap-2 font-mono text-xs">
                    <span className="truncate font-semibold text-[#eaf3ff]">
                      {isBlindMode ? 'Blind Diagnostic Drill Active' : activeSequence.title}
                    </span>
                    <span className="tabular-nums text-[#19c8f5] shrink-0">
                      Stage {(liveFrameEval?.activeStepIndex ?? 0) + 1}/{activeSequence.steps.length}
                    </span>
                  </div>

                  {liveFrameEval && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between font-mono text-[11px] text-[#91a4bd] tabular-nums">
                        <span>
                          {isBlindMode
                            ? `Stage ${liveFrameEval.activeStepIndex + 1}`
                            : liveFrameEval.activeStep.name}
                        </span>
                        <span>
                          {(liveFrameEval.stepElapsedMs / 1000).toFixed(1)}s /{' '}
                          {(liveFrameEval.stepDurationMs / 1000).toFixed(0)}s
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#132238]">
                        <div
                          className="h-full bg-[#19c8f5] transition-all duration-150"
                          style={{
                            width: `${Math.round(liveFrameEval.stepProgressRatio * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={onPauseToggle}
                      className="inline-flex min-h-[34px] flex-1 items-center justify-center gap-1 rounded-md border border-[#203653] bg-[#0F1B2E] px-2.5 py-1 font-mono text-xs text-[#eaf3ff] hover:border-[#19c8f5]/60 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      <span>{isPlaying ? 'Pause' : 'Resume'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextIdx =
                          ((liveFrameEval?.activeStepIndex ?? 0) + 1) % activeSequence.steps.length;
                        onJumpToStage(nextIdx);
                      }}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-[#203653] bg-[#0F1B2E] px-2.5 py-1 font-mono text-xs text-[#eaf3ff] hover:border-[#19c8f5]/60 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Next Stage</span>
                    </button>
                    <button
                      type="button"
                      onClick={onStopSequence}
                      title="Stop sequence and restore nominal bench state"
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-[#20d889]/45 bg-[#08241b] px-2.5 py-1 font-mono text-xs text-[#20d889] hover:bg-[#0d3527] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Stop</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Blind Mode Toggle */}
              <button
                type="button"
                onClick={() => onToggleBlindMode(!isBlindMode)}
                aria-pressed={isBlindMode}
                className={`inline-flex min-h-[38px] items-center justify-between gap-2 rounded-lg border px-3 py-1.5 font-mono text-xs cursor-pointer ${
                  isBlindMode
                    ? 'border-[#19c8f5] bg-[#0d2738] text-[#19c8f5]'
                    : 'border-[#203653] bg-[#060B14] text-[#d4e3f6]'
                }`}
              >
                <span className="flex items-center gap-2">
                  {isBlindMode ? (
                    <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>Blind Reasoning Mode</span>
                </span>
                <span className="font-bold">{isBlindMode ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {/* Live MNA Telemetry Snapshot (Strictly Real Solver Values) */}
            <div className="flex flex-col gap-2 rounded-lg border border-[#203653] bg-[#0A1220] p-3">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-[#91a4bd]">
                  <Activity className="h-3.5 w-3.5 text-[#19c8f5]" aria-hidden="true" />
                  Live MNA Telemetry
                </span>
                <span className="tabular-nums text-[#d4e3f6]">
                  PSU {isPowerOn ? `${supplyCurrentDrawAmps.toFixed(2)} A` : 'OFF'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] tabular-nums">
                {['ecu-pin-3', 'ecu-pin-5', 'ecu-pin-7', 'ecu-pin-8', 'ecu-pin-9', 'ecu-pin-13'].map(
                  (pid) => {
                    const pin = pins.find((p) => p.id === pid);
                    if (!pin) return null;
                    const volts = nodeVoltages[pid] ?? 0;
                    return (
                      <button
                        key={pid}
                        type="button"
                        onClick={() => onFocusPin?.(pid, `${pin.label} (Pin ${pin.pinNumber})`)}
                        className="flex items-center justify-between rounded border border-[#203653] bg-[#060B14] px-2 py-1 text-left hover:border-[#19c8f5]/50 cursor-pointer"
                      >
                        <span className="text-[#91a4bd] truncate">{pin.label}</span>
                        <span className="font-semibold text-[#eaf3ff]">{volts.toFixed(2)}V</span>
                      </button>
                    );
                  }
                )}
              </div>

              <div className="font-mono text-[11px] text-[#91a4bd]">
                Active DTCs:{' '}
                {activeDTCs.length === 0 ? (
                  <span className="text-[#20d889]">None stored</span>
                ) : (
                  <span className="text-[#ff8a99] font-semibold">
                    {activeDTCs.map((d) => d.code).join(', ')}
                  </span>
                )}
              </div>
            </div>

            {/* Diagnostic Reasoning Challenge */}
            <div className="flex flex-col gap-2.5 rounded-lg border border-[#203653] bg-[#0A1220] p-3">
              <div className="flex items-center gap-1.5 border-b border-[#203653] pb-2 font-mono text-xs font-bold uppercase tracking-wider text-[#eaf3ff]">
                <Wrench className="h-3.5 w-3.5 text-[#ffb020]" aria-hidden="true" />
                <span>Test Diagnostic Reasoning</span>
              </div>
              <p className="text-xs text-[#91a4bd] leading-relaxed">
                Probe the live circuit on the Bench Lab using your DMM and Oscilloscope, then log your suspected root-cause pin and fault mechanism.
              </p>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="reasoning-pin-select"
                  className="font-mono text-[11px] text-[#91a4bd]"
                >
                  Suspected Primary Pin
                </label>
                <select
                  id="reasoning-pin-select"
                  value={guessPinId}
                  onChange={(e) => setGuessPinId(e.target.value)}
                  className="min-h-[36px] rounded-md border border-[#203653] bg-[#060B14] px-2 py-1.5 text-xs text-[#eaf3ff]"
                >
                  {pins.map((pin) => (
                    <option key={pin.id} value={pin.id}>
                      Pin #{pin.pinNumber} · {pin.label} ({pin.name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="reasoning-cat-select"
                  className="font-mono text-[11px] text-[#91a4bd]"
                >
                  Suspected Fault Mechanism
                </label>
                <select
                  id="reasoning-cat-select"
                  value={guessCategory}
                  onChange={(e) => setGuessCategory(e.target.value as ReasoningFaultCategory)}
                  className="min-h-[36px] rounded-md border border-[#203653] bg-[#060B14] px-2 py-1.5 text-xs text-[#eaf3ff]"
                >
                  {REASONING_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleVerifyReasoning}
                className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-[#19c8f5]/60 bg-[#0d2738] px-3 py-1.5 font-mono text-xs font-bold text-[#19c8f5] hover:bg-[#13354b] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Verify Diagnosis</span>
              </button>

              {reasoningResult && (
                <div
                  className={`rounded-lg border p-2.5 text-xs ${
                    reasoningResult.overallCorrect
                      ? 'border-[#20d889]/55 bg-[#08241b] text-[#d4f7e7]'
                      : 'border-[#ffb020]/55 bg-[#231907] text-[#ffe29e]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-mono font-bold">
                    {reasoningResult.overallCorrect ? (
                      <CheckCircle2 className="h-4 w-4 text-[#20d889] shrink-0" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-[#ffb020] shrink-0" aria-hidden="true" />
                    )}
                    <span>{reasoningResult.feedbackTitle}</span>
                  </div>
                  <p className="mt-1 leading-relaxed text-[11.5px] opacity-90">
                    {reasoningResult.feedbackDetail}
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
