import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Compass,
  GraduationCap,
  Headphones,
  HelpCircle,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Volume2,
  X,
} from 'lucide-react';
import { ACADEMY_CURRICULUM_MODULES } from '../../data/academy/universityCurriculum';
import type { LabTab } from '../LabTopNav';
import {
  useHandsFreeVoice,
  type HandsFreeVoiceStatus,
} from '../../hooks/useHandsFreeVoice';
import type { VoiceModalAction } from '../../services/ai/systemVoiceKnowledgeBase';
import type { BenchTelemetry, BilingualLang } from '../../types/aiAssistant';
import type { EcuPin } from '../../types/ecu';

interface HandsFreeVoiceCoachProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
  activeModuleId?: string | null;
  activeTab?: LabTab;
  lang?: BilingualLang;
  telemetry?: Partial<BenchTelemetry>;
  pins?: EcuPin[];
  nodeVoltages?: Record<string, number>;
  incomingCommand?: string | null;
  onConsumedIncomingCommand?: () => void;
  onNavigateTab?: (tab: LabTab) => void;
  onOpenModal?: (modal: VoiceModalAction) => void;
}

const STATUS_META: Record<
  HandsFreeVoiceStatus,
  { glyph: string; labelTL: string; labelEN: string; textClass: string }
> = {
  STANDBY: {
    glyph: '○',
    labelTL: 'Standby',
    labelEN: 'Standby',
    textClass: 'text-slate-400',
  },
  NAKIKINIG: {
    glyph: '●',
    labelTL: 'Nakikinig',
    labelEN: 'Listening',
    textClass: 'text-emerald-400',
  },
  CHINE_CHECK_SA_DB: {
    glyph: '●',
    labelTL: 'Chine-check sa DB',
    labelEN: 'Checking DB',
    textClass: 'text-amber-400',
  },
  NAGSASALITA: {
    glyph: '●',
    labelTL: 'Nagsasalita',
    labelEN: 'Speaking',
    textClass: 'text-cyan-400',
  },
};

const DEFAULT_SYSTEM_CHIPS_TL = [
  'Ano reading ngayon?',
  "Ok ba 'to?",
  'Paano gamitin ang BenchLab?',
  'Paano gamitin ang 3D twin?',
  'Saan nakakabit?',
];

const DEFAULT_SYSTEM_CHIPS_EN = [
  'What is the bench status?',
  'How to use BenchLab?',
  'How to use pinouts?',
  'How to use 3D twin?',
  "What's inside there?",
];

export const HandsFreeVoiceCoach: React.FC<HandsFreeVoiceCoachProps> = ({
  isOpen,
  onClose,
  embedded = false,
  activeModuleId,
  activeTab = 'BENCH_LAB',
  lang = 'TL',
  telemetry,
  pins,
  nodeVoltages,
  incomingCommand,
  onConsumedIncomingCommand,
  onNavigateTab,
  onOpenModal,
}) => {
  const [selectedModuleId, setSelectedModuleId] = useState(
    activeModuleId || ACADEMY_CURRICULUM_MODULES[0].id
  );
  const [isExpanded, setIsExpanded] = useState(true);
  const [dockMode, setDockMode] = useState<'SYSTEM' | 'ACADEMY'>('SYSTEM');
  const [manualText, setManualText] = useState('');

  const {
    isHandsFreeActive,
    status,
    memory,
    lastTranscript,
    interimTranscript,
    lastTurn,
    errorNotice,
    startHandsFree,
    stopHandsFree,
    bargeInInterrupt,
    executeAction,
    triggerQuickCommand,
  } = useHandsFreeVoice({
    activeModuleId: activeModuleId || selectedModuleId,
    activeTab,
    lang,
    telemetry,
    pins,
    nodeVoltages,
    onNavigateTab,
    onOpenModal,
  });

  // Consume external spoken transcript forwarded from top Voice Mic button
  useEffect(() => {
    if (isOpen && incomingCommand && incomingCommand.trim()) {
      setIsExpanded(true);
      triggerQuickCommand(incomingCommand.trim());
      onConsumedIncomingCommand?.();
    }
  }, [incomingCommand, isOpen, onConsumedIncomingCommand, triggerQuickCommand]);

  if (!isOpen) return null;

  const activeModule =
    ACADEMY_CURRICULUM_MODULES.find((m) => m.id === memory.activeModuleId) ||
    ACADEMY_CURRICULUM_MODULES[0];
  const currentStep =
    activeModule.steps[memory.currentStepIndex] || activeModule.steps[0];
  const statusMeta = STATUS_META[status];
  const statusText = lang === 'EN' ? statusMeta.labelEN : statusMeta.labelTL;

  const quickChips =
    lastTurn?.followUpChips && lastTurn.followUpChips.length > 0
      ? lastTurn.followUpChips
      : lang === 'EN'
        ? DEFAULT_SYSTEM_CHIPS_EN
        : DEFAULT_SYSTEM_CHIPS_TL;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim()) return;
    triggerQuickCommand(manualText.trim());
    setManualText('');
  };

  const handleCloseDock = () => {
    stopHandsFree();
    onClose();
  };

  // Compact Non-Blocking Floating Bar (keeps BenchLab, Pinouts, 3D Twin fully visible & interactive)
  if (!isExpanded && !embedded) {
    return (
      <div
        data-testid="hands-free-voice-coach"
        data-voice-dock-state="compact"
        className="fixed bottom-16 right-3 sm:right-4 z-40 max-w-[calc(100vw-1.5rem)] w-auto sm:w-[410px] rounded-lg border border-cyan-500/50 bg-[#070E1B]/95 shadow-xl text-slate-100"
        role="region"
        aria-label="Hands-Free Taglish Voice Dock"
      >
        <div className="h-11 px-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => (isHandsFreeActive ? stopHandsFree() : startHandsFree(true))}
              className={`h-7 px-2.5 rounded border font-mono text-[11px] font-semibold inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer transition-colors ${
                isHandsFreeActive
                  ? 'border-rose-500/75 bg-rose-950/70 text-rose-100 hover:bg-rose-900/70'
                  : 'border-cyan-500/70 bg-cyan-950/70 text-cyan-100 hover:bg-cyan-900/70'
              }`}
              title={isHandsFreeActive ? 'Stop Hands-Free' : 'Start Hands-Free'}
            >
              {isHandsFreeActive ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              <span>{isHandsFreeActive ? 'Stop' : 'Mic'}</span>
            </button>

            <span
              data-voice-status={status}
              className={`font-mono text-[11px] font-semibold shrink-0 whitespace-nowrap ${statusMeta.textClass}`}
            >
              {statusMeta.glyph} {statusText}
            </span>

            <span className="text-[11px] text-slate-300 truncate min-w-0">
              {interimTranscript
                ? `“${interimTranscript}”`
                : lastTurn?.displayText ||
                  (lang === 'EN'
                    ? 'Ask about BenchLab, Pinouts, or 3D Twin'
                    : 'Magtanong tungkol sa BenchLab, Pinouts, 3D Twin')}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {status === 'NAGSASALITA' && (
              <button
                type="button"
                onClick={bargeInInterrupt}
                className="h-7 px-2 rounded border border-amber-500/60 bg-amber-950/50 text-amber-200 font-mono text-[10px] font-semibold cursor-pointer whitespace-nowrap"
              >
                {lang === 'EN' ? 'Interrupt' : 'Magsalita'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="p-1.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 cursor-pointer"
              aria-label="Expand Hands-Free Voice Coach"
              title="Expand Voice Dock"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleCloseDock}
              className="p-1.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer"
              aria-label="Close Hands-Free Voice Coach"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Expanded Non-Blocking Floating Voice Dock (No backdrop overlay — full workspace stays clickable!)
  return (
    <div
      data-testid="hands-free-voice-coach"
      data-voice-dock-state={embedded ? 'embedded' : 'expanded'}
      className={
        embedded
          ? 'flex flex-col flex-1 min-h-0 overflow-hidden text-slate-100'
          : 'fixed bottom-16 right-3 sm:right-4 z-40 w-[min(430px,calc(100vw-1.5rem))] max-h-[min(76dvh,590px)] rounded-xl border border-cyan-500/50 bg-[#070E1B] shadow-2xl flex flex-col overflow-hidden text-slate-100'
      }
      role={embedded ? 'region' : 'dialog'}
      aria-modal="false"
      aria-label="Hands-Free Local AI Voice Coach"
    >
      {/* Instrument Header (hidden when embedded inside Unified AI Drawer) */}
      {!embedded && (
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800 bg-[#0B1528] gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg border border-cyan-500/45 bg-cyan-950/50 flex items-center justify-center shrink-0">
              <Headphones className="w-4 h-4 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <h2 className="font-hud text-[13px] font-bold text-slate-100 truncate">
                {lang === 'EN' ? 'Hands-Free Voice Coach' : 'Taglish Voice Coach'}
              </h2>
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400 truncate">
                <span data-voice-status={status} className={`font-semibold ${statusMeta.textClass}`}>
                  {statusMeta.glyph} {statusText}
                </span>
                <span aria-hidden="true">·</span>
                <span>{lang === 'TL' ? 'Buong Offline DB' : 'Full Offline DB'}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{activeTab.replace('_', ' ')}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="p-1.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer"
              aria-label="Minimize Hands-Free Voice Coach"
              title={lang === 'EN' ? 'Minimize to compact bar' : 'Paliitin sa compact bar'}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleCloseDock}
              className="p-1.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer"
              aria-label="Close Hands-Free Voice Coach"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Mode Switch + Primary Hands-Free Mic Trigger */}
      <div className="px-3.5 py-2.5 border-b border-slate-800/80 bg-[#091222] flex items-center justify-between gap-2 shrink-0">
        <div
          className="inline-flex items-center rounded-md border border-slate-700/80 bg-slate-950/90 p-0.5"
          role="tablist"
          aria-label="Voice Coach Mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={dockMode === 'SYSTEM'}
            onClick={() => setDockMode('SYSTEM')}
            className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap ${
              dockMode === 'SYSTEM'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/45'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Compass className="w-3 h-3" />
            <span>{lang === 'EN' ? 'System Guide' : 'Gabay sa System'}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={dockMode === 'ACADEMY'}
            onClick={() => setDockMode('ACADEMY')}
            className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap ${
              dockMode === 'ACADEMY'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/45'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <GraduationCap className="w-3 h-3" />
            <span>{lang === 'EN' ? 'Academy' : 'Academy Lab'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => (isHandsFreeActive ? stopHandsFree() : startHandsFree(true))}
          className={`px-3 py-1.5 rounded-md border font-mono text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
            isHandsFreeActive
              ? 'border-rose-500/75 bg-rose-950/70 text-rose-100 hover:bg-rose-900/70'
              : 'border-emerald-500/70 bg-emerald-600/25 text-emerald-100 hover:bg-emerald-500/35'
          }`}
        >
          {isHandsFreeActive ? (
            <>
              <MicOff className="w-3.5 h-3.5" />
              <span>{lang === 'EN' ? 'Stop Mic' : 'Ihinto ang Mic'}</span>
            </>
          ) : (
            <>
              <Mic className="w-3.5 h-3.5" />
              <span>{lang === 'EN' ? 'Start Hands-Free' : 'I-ON ang Mic'}</span>
            </>
          )}
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3">
        {errorNotice && (
          <div className="rounded-lg border border-amber-500/60 bg-amber-950/40 px-3 py-2 font-mono text-[11px] text-amber-200">
            {errorNotice}
          </div>
        )}

        {/* Live Interim Hearing Preview */}
        {interimTranscript && (
          <div className="rounded-lg border border-emerald-500/45 bg-emerald-950/30 px-3 py-1.5 font-mono text-[11px] text-emerald-200">
            {lang === 'EN' ? 'Hearing:' : 'Naririnig:'} &ldquo;{interimTranscript}&rdquo;
          </div>
        )}

        {/* Spoken Response & Active Context */}
        <div className="rounded-lg border border-slate-800 bg-[#0B1528]/90 p-3 space-y-2.5">
          {lastTranscript && (
            <div className="font-mono text-[11px] text-slate-400">
              {lang === 'EN' ? 'You:' : 'Ikaw:'}{' '}
              <span className="text-slate-200">&ldquo;{lastTranscript}&rdquo;</span>
            </div>
          )}

          <div className="flex items-start gap-2">
            <Volume2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-[13px] text-slate-100 leading-relaxed">
              {lastTurn?.displayText ||
                (lang === 'EN'
                  ? 'Ready to help across AutoElectric Lab Pro. Ask "How to use BenchLab?", "How to use pinouts?", "How to use 3D twin?", or say "Open 3D twin".'
                  : 'Handa na po ako sa buong AutoElectric Lab Pro. Magtanong ng "Paano gamitin ang BenchLab?", "Paano gamitin ang pinouts?", "Paano gamitin ang 3D twin?", o sabihing "Anong meron doon?"')}
            </p>
          </div>

          {lastTurn?.detailsBullets && lastTurn.detailsBullets.length > 0 && (
            <ul className="pt-2 border-t border-slate-800/90 space-y-1 text-xs text-slate-300 list-disc pl-4">
              {lastTurn.detailsBullets.map((item, idx) => (
                <li key={idx} className="leading-snug">
                  {item}
                </li>
              ))}
            </ul>
          )}

          {/* One-Tap Action Button for Referenced Module */}
          {lastTurn?.suggestedAction && (
            <div className="pt-1.5 flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-slate-400 truncate">
                {lastTurn.matchedSource}
              </span>
              <button
                type="button"
                onClick={() => executeAction(lastTurn.suggestedAction)}
                className="px-2.5 py-1 rounded border border-cyan-500/65 bg-cyan-500/15 hover:bg-cyan-500/25 font-mono text-[11px] font-semibold text-cyan-200 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>{lastTurn.suggestedAction.label}</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Academy Step Spec View (when Academy tab selected) */}
        {dockMode === 'ACADEMY' && (
          <div className="rounded-lg border border-slate-800 bg-[#0B1528]/80 p-3 space-y-2.5">
            <select
              value={activeModule.id}
              onChange={(e) => setSelectedModuleId(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-[11px] text-slate-100"
              aria-label="Select Coaching Lab Module"
            >
              {ACADEMY_CURRICULUM_MODULES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.exerciseCode} — {m.titleTaglish}
                </option>
              ))}
            </select>

            <div className="flex items-center justify-between gap-2 font-mono text-[10.5px] text-cyan-300">
              <span className="tabular-nums">
                Step {currentStep.stepNumber} / {activeModule.steps.length} ·{' '}
                {currentStep.dmmModeDisplay}
              </span>
              {currentStep.requiredPsuState === 'OFF' && (
                <span className="text-rose-300 font-bold">COLD CHECK · PSU OFF</span>
              )}
            </div>

            <div className="text-xs font-semibold text-slate-100">
              {currentStep.titleTaglish}
            </div>

            <div className="grid grid-cols-3 gap-2 font-mono text-[11px] tabular-nums pt-1 border-t border-slate-800">
              <div>
                <span className="text-[10px] text-rose-300 block">Red (+)</span>
                <strong className="text-slate-100">{currentStep.redProbeLabel}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Black (COM)</span>
                <strong className="text-slate-100">{currentStep.blackProbeLabel}</strong>
              </div>
              <div>
                <span className="text-[10px] text-emerald-300 block">Expected</span>
                <strong className="text-emerald-200">{currentStep.expectedReadingLabel}</strong>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => triggerQuickCommand('Ulitin nang mas simple')}
                className="px-2.5 py-1.5 rounded border border-amber-500/55 bg-amber-950/35 hover:bg-amber-900/45 font-mono text-[10.5px] font-semibold text-amber-100 inline-flex items-center justify-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{lang === 'EN' ? 'Simpler' : 'Mas Simple pa'}</span>
              </button>
              <button
                type="button"
                onClick={() => triggerQuickCommand('Tapos na next step')}
                className="px-2.5 py-1.5 rounded border border-emerald-500/55 bg-emerald-950/35 hover:bg-emerald-900/45 font-mono text-[10.5px] font-semibold text-emerald-100 inline-flex items-center justify-center gap-1 cursor-pointer"
              >
                <ArrowRight className="w-3 h-3" />
                <span>{lang === 'EN' ? 'Next Step' : 'Susunod na Step'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Safety / Educational Tip */}
        <div className="flex items-start gap-2 px-1 text-[11.5px] text-slate-400 leading-relaxed">
          <HelpCircle className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
          <span>{lastTurn?.whyTip || currentStep.whyWeTestTaglish}</span>
        </div>

        {/* Interactive Follow-Up & Quick-Ask Buttons */}
        <div className="space-y-1.5">
          <div className="font-mono text-[10px] text-slate-400">
            {lang === 'EN' ? 'Quick voice questions:' : 'Subukan itong itanong:'}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {quickChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => triggerQuickCommand(chip)}
                className="px-2.5 py-1 rounded border border-slate-700/90 bg-slate-900/90 hover:border-cyan-500/60 hover:text-cyan-200 font-mono text-[10.5px] text-slate-200 cursor-pointer transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer: Barge-In + Noisy-Shop Text Command Input */}
      <div className="px-3.5 py-2.5 border-t border-slate-800 bg-[#0B1528] space-y-2 shrink-0">
        <form onSubmit={handleManualSubmit} className="flex gap-1.5">
          <input
            type="text"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={
              lang === 'EN'
                ? 'Ask anything ("How to use 3D twin?", "Open Pinouts")...'
                : 'Magtanong ("Paano gamitin ang 3D twin?", "Anong meron doon?")...'
            }
            className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!manualText.trim()}
            className="px-3 py-1.5 rounded-md border border-cyan-500/70 bg-cyan-600/25 hover:bg-cyan-500/35 disabled:opacity-45 font-mono text-[11px] font-semibold text-cyan-100 inline-flex items-center gap-1 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{lang === 'EN' ? 'Ask' : 'Tanong'}</span>
          </button>
          <button
            type="button"
            onClick={bargeInInterrupt}
            className="px-2.5 py-1.5 rounded-md border border-rose-500/65 bg-rose-950/45 hover:bg-rose-900/55 font-mono text-[11px] font-semibold text-rose-100 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            title={lang === 'EN' ? 'Stop speaking and listen now' : 'Ihinto ang boses at makinig agad'}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>{lang === 'EN' ? 'Speak' : 'Magsalita'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
