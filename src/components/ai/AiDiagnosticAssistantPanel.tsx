import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cpu,
  Database,
  Send,
  ShieldAlert,
  Sparkles,
  WifiOff,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import type {
  AiDiagnosticResult,
  BenchTelemetry,
  BilingualLang,
  DiagnosticStepCard,
} from '../../types/aiAssistant';
import { queryAiDiagnosticRouter } from '../../services/ai/aiRouter';

interface AiDiagnosticAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  lang: BilingualLang;
  telemetry: BenchTelemetry;
  benchSummaryText: string;
  quickFillPrompt: string;
  incomingVoiceTranscript?: string | null;
  onConsumedVoiceTranscript?: () => void;
}

function getCardStyles(card: DiagnosticStepCard): {
  container: string;
  badge: string;
  icon: React.ReactNode;
} {
  if (card.kind === 'SAFETY_WARNING') {
    return {
      container: 'border-rose-500/60 bg-rose-950/40',
      badge: 'bg-rose-500/20 text-rose-200 border-rose-500/50',
      icon: <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />,
    };
  }
  if (card.kind === 'ROOT_CAUSE_ASSESSMENT') {
    return {
      container: 'border-cyan-500/50 bg-cyan-950/30',
      badge: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/50',
      icon: <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />,
    };
  }
  return {
    container: 'border-emerald-500/50 bg-emerald-950/30',
    badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/50',
    icon: <Wrench className="w-4 h-4 text-emerald-400 shrink-0" />,
  };
}

export const AiDiagnosticAssistantPanel: React.FC<AiDiagnosticAssistantPanelProps> = ({
  isOpen,
  onClose,
  lang,
  telemetry,
  benchSummaryText,
  quickFillPrompt,
  incomingVoiceTranscript,
  onConsumedVoiceTranscript,
}) => {
  const [query, setQuery] = useState('');
  const [preferOfflineMode, setPreferOfflineMode] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<AiDiagnosticResult | null>(null);

  const runDiagnosis = useCallback(
    async (textToRun: string) => {
      const cleaned = textToRun.trim();
      if (!cleaned) return;
      setIsRunning(true);
      try {
        const res = await queryAiDiagnosticRouter({
          query: cleaned,
          lang,
          telemetry,
          forceOffline: preferOfflineMode,
        });
        setResult(res);
      } finally {
        setIsRunning(false);
      }
    },
    [lang, telemetry, preferOfflineMode]
  );

  useEffect(() => {
    if (isOpen && incomingVoiceTranscript && incomingVoiceTranscript.trim()) {
      const spoken = incomingVoiceTranscript.trim();
      setQuery(spoken);
      onConsumedVoiceTranscript?.();
      void runDiagnosis(spoken);
    }
  }, [isOpen, incomingVoiceTranscript, onConsumedVoiceTranscript, runDiagnosis]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runDiagnosis(query);
  };

  const handleQuickFill = () => {
    setQuery(quickFillPrompt);
    void runDiagnosis(quickFillPrompt);
  };

  return (
    <div
      data-testid="ai-diagnostic-assistant-panel"
      className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-[#070E1B] border-l border-slate-700/90 shadow-2xl flex flex-col text-slate-100"
      role="dialog"
      aria-modal="false"
      aria-label={
        lang === 'TL'
          ? 'AutoElectric Lab Pro AI Diagnostic Assistant'
          : 'AutoElectric Lab Pro AI Diagnostic Assistant'
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0B1528] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-[3px] border border-cyan-500/50 bg-cyan-950/60 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-cyan-300" />
          </div>
          <div className="min-w-0">
            <h2 className="font-hud text-sm font-bold tracking-wide text-slate-100 truncate">
              {lang === 'TL'
                ? 'AI Bench Diagnostic Assistant (TL/EN)'
                : 'AI Bench Diagnostic Assistant (EN/TL)'}
            </h2>
            <p className="font-mono text-[10px] text-slate-400 truncate">
              {lang === 'TL'
                ? 'Zero-Fabrication · 70% Score Gate · Live Bench Context'
                : 'Zero-Fabrication · 70% Score Gate · Live Bench Context'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-[3px] border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer"
          aria-label="Close AI Diagnostic Assistant"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Live Simulated Bench Context Strip */}
      <div className="px-4 py-2 border-b border-slate-800/80 bg-slate-950/80 shrink-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
            {lang === 'TL'
              ? 'Simulated Bench Telemetry (Live Injected)'
              : 'Simulated Bench Telemetry (Live Injected)'}
          </span>
          {telemetry.isOcpTripped && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] border border-rose-500/70 bg-rose-950/80 font-mono text-[10px] font-bold text-rose-200">
              <AlertTriangle className="w-3 h-3" />
              OCP TRIPPED
            </span>
          )}
        </div>
        <p className="font-mono text-[11px] text-slate-300 break-words">
          {benchSummaryText}
        </p>
      </div>

      {/* Compact Diagnostic Input Form */}
      <form
        onSubmit={handleSubmit}
        className="px-4 py-3 border-b border-slate-800 bg-[#0A1324] shrink-0 space-y-2.5"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleQuickFill}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] border border-amber-500/50 bg-amber-950/40 hover:bg-amber-900/50 text-amber-200 font-mono text-[11px] cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {lang === 'TL'
                ? 'Quick-Fill mula Active Bench'
                : 'Quick-Fill from Active Bench'}
            </span>
          </button>

          <label className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={preferOfflineMode}
              onChange={(e) => setPreferOfflineMode(e.target.checked)}
              className="accent-cyan-400"
            />
            <WifiOff className="w-3.5 h-3.5 text-amber-300" />
            <span>{lang === 'TL' ? 'Offline AI Muna' : 'Offline AI Only'}</span>
          </label>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              lang === 'TL'
                ? 'Hal. "Boss ano ang P0122 sa TPS Pin 7?" o "CAN 60 ohms test"'
                : 'e.g. "What causes P0122 on TPS Pin 7?" or "CAN 60 ohm test"'
            }
            className="flex-1 min-w-0 rounded-[3px] border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isRunning || !query.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[3px] border border-cyan-500/70 bg-cyan-600/30 hover:bg-cyan-500/40 disabled:opacity-50 text-cyan-100 font-mono text-xs font-semibold cursor-pointer shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isRunning ? '...' : lang === 'TL' ? 'Suriin' : 'Analyze'}</span>
          </button>
        </div>
      </form>

      {/* Scrollable Results Area: 3 Structured Repair Step Cards */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!result ? (
          <div className="rounded-[4px] border border-slate-800 bg-slate-900/50 p-4 space-y-2.5 text-xs text-slate-300">
            <div className="flex items-center gap-2 font-hud font-semibold text-cyan-300">
              <Sparkles className="w-4 h-4" />
              <span>
                {lang === 'TL'
                  ? 'Handa na ang Verified ECU Bench Assistant'
                  : 'Verified ECU Bench Assistant Ready'}
              </span>
            </div>
            <p className="leading-relaxed text-slate-400">
              {lang === 'TL'
                ? 'Mag-type ng DTC (hal. P0122, U0001), symptom (hal. OCP Trip), o pindutin ang Quick-Fill sa itaas. Awtomatikong sinasama ang live PSU voltage, active DTC, at probed pin sa bawat sagot.'
                : 'Enter a DTC (e.g. P0122, U0001), bench fault (e.g. OCP Trip), or click Quick-Fill above. Live PSU voltage, active DTCs, and selected pin telemetry are automatically injected into every query.'}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                lang === 'TL' ? 'P0122 TPS Pin 7 check' : 'P0122 TPS Pin 7 check',
                lang === 'TL' ? 'U0001 CAN 60 ohms test' : 'U0001 CAN 60 ohm test',
                lang === 'TL' ? 'Nag-OCP Trip ang PSU' : 'Power supply OCP trip recovery',
              ].map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => {
                    setQuery(sample);
                    void runDiagnosis(sample);
                  }}
                  className="px-2 py-1 rounded-[3px] border border-slate-700 bg-slate-950 hover:border-cyan-500/60 text-[11px] font-mono text-slate-200 cursor-pointer"
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Provenance & Confidence Meta Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-slate-800 bg-slate-900/80 px-3 py-2 font-mono text-[11px]">
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${
                    result.blockedByScoreGate ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                />
                <span className="font-semibold text-slate-100">{result.tierLabel}</span>
                <span className="text-slate-400">
                  · {Math.round(result.confidence * 100)}% conf
                </span>
              </div>
              {result.cachedLocally && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
                  <Database className="w-3 h-3" />
                  AutoLabPro_VerifiedKnowledge
                </span>
              )}
            </div>

            {/* Conversational Summary */}
            <div className="rounded-[4px] border border-slate-700/80 bg-slate-900/60 p-3 text-xs leading-relaxed text-slate-200">
              {result.conversationalSummary}
            </div>

            {/* 3 Structured Repair Step Cards */}
            <div className="space-y-2.5" data-testid="repair-step-cards-list">
              {result.cards.map((card) => {
                const tone = getCardStyles(card);
                return (
                  <article
                    key={card.id}
                    data-card-kind={card.kind}
                    className={`rounded-[4px] border p-3.5 space-y-2 ${tone.container}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {tone.icon}
                        <h3 className="font-hud text-xs font-bold tracking-wide text-slate-100 truncate">
                          {card.title}
                        </h3>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded-[2px] border font-mono text-[9px] font-bold shrink-0 ${tone.badge}`}
                      >
                        {card.badge}
                      </span>
                    </div>

                    <p className="text-xs leading-relaxed text-slate-200 whitespace-pre-line">
                      {card.body}
                    </p>

                    {card.bulletPoints && card.bulletPoints.length > 0 && (
                      <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-300">
                        {card.bulletPoints.map((bp, idx) => (
                          <li key={idx}>{bp}</li>
                        ))}
                      </ul>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
