import React, { useState } from 'react';
import {
  ArrowRight,
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
import {
  useHandsFreeVoice,
  type HandsFreeVoiceStatus,
} from '../../hooks/useHandsFreeVoice';
import type { BenchTelemetry } from '../../types/aiAssistant';

interface HandsFreeVoiceCoachProps {
  isOpen: boolean;
  onClose: () => void;
  activeModuleId?: string | null;
  telemetry?: Partial<BenchTelemetry>;
}

const STATUS_BADGE_MAP: Record<
  HandsFreeVoiceStatus,
  { label: string; className: string }
> = {
  STANDBY: {
    label: 'STANDBY',
    className: 'border-slate-600 bg-slate-900 text-slate-300',
  },
  NAKIKINIG: {
    label: 'NAKIKINIG (Hands-Free)',
    className: 'border-emerald-400/80 bg-emerald-950/70 text-emerald-200 animate-pulse',
  },
  CHINE_CHECK_SA_DB: {
    label: 'CHINE-CHECK SA DB',
    className: 'border-amber-400/80 bg-amber-950/70 text-amber-200',
  },
  NAGSASALITA: {
    label: 'NAGSASALITA',
    className: 'border-cyan-400/80 bg-cyan-950/70 text-cyan-200',
  },
};

export const HandsFreeVoiceCoach: React.FC<HandsFreeVoiceCoachProps> = ({
  isOpen,
  onClose,
  activeModuleId,
  telemetry,
}) => {
  const [selectedModuleId, setSelectedModuleId] = useState(
    activeModuleId || ACADEMY_CURRICULUM_MODULES[0].id
  );
  const [manualText, setManualText] = useState('');

  const {
    isHandsFreeActive,
    status,
    memory,
    lastTranscript,
    lastTurn,
    errorNotice,
    startHandsFree,
    stopHandsFree,
    bargeInInterrupt,
    triggerQuickCommand,
  } = useHandsFreeVoice({
    activeModuleId: activeModuleId || selectedModuleId,
    telemetry,
  });

  if (!isOpen) return null;

  const activeModule =
    ACADEMY_CURRICULUM_MODULES.find((m) => m.id === memory.activeModuleId) ||
    ACADEMY_CURRICULUM_MODULES[0];
  const currentStep =
    activeModule.steps[memory.currentStepIndex] || activeModule.steps[0];
  const badge = STATUS_BADGE_MAP[status];

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim()) return;
    triggerQuickCommand(manualText.trim());
    setManualText('');
  };

  return (
    <div
      data-testid="hands-free-voice-coach"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Hands-Free Local AI Voice Coach"
    >
      <div className="w-full max-w-2xl max-h-[92dvh] rounded-xl border border-cyan-500/50 bg-[#070E1B] shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0B1528] gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg border border-cyan-500/50 bg-cyan-950/60 flex items-center justify-center shrink-0">
              <Headphones className="w-5 h-5 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <h2 className="font-hud text-sm font-bold text-slate-100 truncate">
                Hands-Free Local AI Voice Coach (Natural Taglish)
              </h2>
              <p className="font-mono text-[10px] text-slate-400 truncate">
                Zero-Cloud Local DB · Echo Shield · 0.75 Confidence Lock
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              data-voice-status={status}
              className={`px-2.5 py-1 rounded border font-mono text-[10.5px] font-bold ${badge.className}`}
            >
              {badge.label}
            </span>
            <button
              type="button"
              onClick={() => {
                stopHandsFree();
                onClose();
              }}
              className="p-1.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer"
              aria-label="Close Hands-Free Voice Coach"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Module Selector + Hands-Free Start/Stop Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <select
              value={activeModule.id}
              onChange={(e) => setSelectedModuleId(e.target.value)}
              className="flex-1 min-w-[220px] rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 font-mono text-xs text-slate-100"
              aria-label="Select Coaching Lab Module"
            >
              {ACADEMY_CURRICULUM_MODULES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.exerciseCode} — {m.titleTaglish}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={isHandsFreeActive ? stopHandsFree : startHandsFree}
              className={`px-4 py-2 rounded-md border font-mono text-xs font-bold inline-flex items-center gap-2 cursor-pointer ${
                isHandsFreeActive
                  ? 'border-rose-500/75 bg-rose-950/70 text-rose-100 hover:bg-rose-900/70'
                  : 'border-emerald-500/75 bg-emerald-600/30 text-emerald-100 hover:bg-emerald-500/40'
              }`}
            >
              {isHandsFreeActive ? (
                <>
                  <MicOff className="w-4 h-4" />
                  <span>Stop Hands-Free</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  <span>Start Hands-Free Loop</span>
                </>
              )}
            </button>
          </div>

          {errorNotice && (
            <div className="rounded-lg border border-amber-500/60 bg-amber-950/40 px-3 py-2 font-mono text-[11px] text-amber-200">
              {errorNotice}
            </div>
          )}

          {/* Large Readable Active Step Card */}
          <div className="rounded-xl border border-cyan-500/40 bg-[#0B1528]/90 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-bold text-cyan-300 uppercase">
                Step {currentStep.stepNumber} of {activeModule.steps.length} ·{' '}
                {currentStep.dmmModeDisplay}
              </span>
              {currentStep.requiredPsuState === 'OFF' && (
                <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/60 font-mono text-[10px] font-bold text-rose-200">
                  COLD CHECK · PSU OFF
                </span>
              )}
            </div>

            <h3 className="font-hud text-base font-bold text-slate-100 leading-snug">
              {currentStep.titleTaglish}
            </h3>

            {/* Exact Red / Black Probe Placement & Expected Reading */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono text-xs">
              <div className="rounded-lg border border-rose-500/50 bg-rose-950/35 p-2.5">
                <span className="text-[10px] uppercase text-rose-300 block">Red Probe (+)</span>
                <strong className="text-sm text-rose-100">{currentStep.redProbeLabel}</strong>
              </div>
              <div className="rounded-lg border border-slate-600 bg-slate-900/90 p-2.5">
                <span className="text-[10px] uppercase text-slate-400 block">Black Probe (COM)</span>
                <strong className="text-sm text-slate-100">{currentStep.blackProbeLabel}</strong>
              </div>
              <div className="rounded-lg border border-emerald-500/50 bg-emerald-950/35 p-2.5">
                <span className="text-[10px] uppercase text-emerald-300 block">Expected Spec</span>
                <strong className="text-sm text-emerald-100">
                  {currentStep.expectedReadingLabel}
                </strong>
              </div>
            </div>

            {/* "Bakit natin ito tine-test?" Short Educational Tip */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/85 p-3 flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 leading-relaxed">
                <span className="font-mono text-[10.5px] font-bold text-cyan-300 block mb-0.5">
                  Bakit natin ito tine-test?
                </span>
                {lastTurn?.whyTip || currentStep.whyWeTestTaglish}
              </div>
            </div>
          </div>

          {/* Live Coach Transcript & Spoken Response */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-3.5 space-y-2">
            {lastTranscript && (
              <div className="font-mono text-[11px] text-slate-400">
                Ikaw: <span className="text-slate-200">&ldquo;{lastTranscript}&rdquo;</span>
              </div>
            )}
            <div className="flex items-start gap-2">
              <Volume2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-100 leading-relaxed">
                {lastTurn?.displayText ||
                  `Sige po, ready na tayo sa Step ${currentStep.stepNumber}. Magtanong lang tulad ng "Saan itutusok ang red probe?" o "Ilan ang expected reading?"`}
              </p>
            </div>
          </div>

          {/* Quick-Tap Override Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => triggerQuickCommand('Ulitin nang mas simple')}
              className="px-3 py-2 rounded-lg border border-amber-500/60 bg-amber-950/45 hover:bg-amber-900/55 font-mono text-[11px] font-semibold text-amber-100 inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Ulitin nang Mas Simple</span>
            </button>
            <button
              type="button"
              onClick={() => triggerQuickCommand('Tapos na next step')}
              className="px-3 py-2 rounded-lg border border-emerald-500/60 bg-emerald-950/45 hover:bg-emerald-900/55 font-mono text-[11px] font-semibold text-emerald-100 inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>Tapos Na / Next Step</span>
            </button>
            <button
              type="button"
              onClick={bargeInInterrupt}
              className="px-3 py-2 rounded-lg border border-rose-500/65 bg-rose-950/50 hover:bg-rose-900/60 font-mono text-[11px] font-semibold text-rose-100 inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Stop / Magsalita Ako</span>
            </button>
          </div>

          {/* Optional Text Fallback Input for Noisy Shops */}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder='Mag-type ng command (hal. "Saan ang probe?", "5.0V ang reading ko", "P0118")...'
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!manualText.trim()}
              className="px-3.5 py-2 rounded-lg border border-cyan-500/70 bg-cyan-600/30 hover:bg-cyan-500/40 disabled:opacity-45 font-mono text-xs font-semibold text-cyan-100 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Ask</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
