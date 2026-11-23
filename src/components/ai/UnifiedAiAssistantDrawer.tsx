import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Cpu,
  Globe,
  Headphones,
  Mic,
  MicOff,
  Radio,
  ShieldCheck,
  WifiOff,
  X,
} from 'lucide-react';
import type {
  AiRouterStatusSnapshot,
  AiTierId,
  BenchTelemetry,
  BilingualLang,
} from '../../types/aiAssistant';
import type { EcuPin } from '../../types/ecu';
import type { LabTab } from '../LabTopNav';
import type { VoiceModalAction } from '../../services/ai/systemVoiceKnowledgeBase';
import {
  AI_TIER_CASCADE,
  getAiRouterStatus,
  subscribeAiRouterStatus,
} from '../../services/ai/aiRouter';
import {
  BILINGUAL_LANG_STORAGE_KEY,
  loadPersistedBilingualLang,
  persistBilingualLang,
} from './AiWorkbenchControlBar';
import { HandsFreeVoiceCoach } from './HandsFreeVoiceCoach';
import { AiDiagnosticAssistantPanel } from './AiDiagnosticAssistantPanel';

export type UnifiedAiSubTab = 'VOICE' | 'DIAGNOSTIC';

export {
  BILINGUAL_LANG_STORAGE_KEY,
  loadPersistedBilingualLang,
  persistBilingualLang,
};

interface BrowserSpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: { transcript: string };
      isFinal?: boolean;
    };
    length: number;
  };
}

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

function getTierBadgeStyle(tier: AiTierId, isOfflineFallback: boolean): string {
  if (tier === 'OFFLINE_AI' || isOfflineFallback) {
    return 'border-amber-500/60 bg-amber-950/60 text-amber-200';
  }
  if (tier === 'CARBON') {
    return 'border-emerald-500/60 bg-emerald-950/60 text-emerald-200';
  }
  if (tier === 'HYDROGEN') {
    return 'border-cyan-500/60 bg-cyan-950/60 text-cyan-200';
  }
  if (tier === 'ARGON') {
    return 'border-sky-500/60 bg-sky-950/60 text-sky-200';
  }
  return 'border-indigo-500/60 bg-indigo-950/60 text-indigo-200';
}

export interface UnifiedAiAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeSubTab: UnifiedAiSubTab;
  onChangeSubTab: (tab: UnifiedAiSubTab) => void;
  lang: BilingualLang;
  onChangeLang: (lang: BilingualLang) => void;
  telemetry: BenchTelemetry;
  benchSummaryText: string;
  quickFillPrompt: string;
  activeModuleId?: string | null;
  activeTab: LabTab;
  pins: EcuPin[];
  nodeVoltages: Record<string, number>;
  incomingVoiceCommand?: string | null;
  onConsumedIncomingVoiceCommand?: () => void;
  incomingDiagnosticTranscript?: string | null;
  onConsumedDiagnosticTranscript?: () => void;
  onNavigateTab?: (tab: LabTab) => void;
  onOpenModal?: (modal: VoiceModalAction) => void;
  onVoiceTranscript?: (transcript: string) => void;
}

export const UnifiedAiAssistantDrawer: React.FC<UnifiedAiAssistantDrawerProps> = ({
  isOpen,
  onClose,
  activeSubTab,
  onChangeSubTab,
  lang,
  onChangeLang,
  telemetry,
  benchSummaryText,
  quickFillPrompt,
  activeModuleId,
  activeTab,
  pins,
  nodeVoltages,
  incomingVoiceCommand,
  onConsumedIncomingVoiceCommand,
  incomingDiagnosticTranscript,
  onConsumedDiagnosticTranscript,
  onNavigateTab,
  onOpenModal,
  onVoiceTranscript,
}) => {
  const [routerSnapshot, setRouterSnapshot] = useState<AiRouterStatusSnapshot>(() =>
    getAiRouterStatus()
  );
  const [isQuickMicListening, setIsQuickMicListening] = useState(false);
  const [quickMicNotice, setQuickMicNotice] = useState<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  useEffect(() => {
    return subscribeAiRouterStatus((next) => {
      setRouterSnapshot(next);
    });
  }, []);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore cleanup stop errors
      }
    };
  }, []);

  const handleToggleLang = useCallback(
    (next: BilingualLang) => {
      persistBilingualLang(next);
      onChangeLang(next);
      setQuickMicNotice(null);
    },
    [onChangeLang]
  );

  const handleQuickSpeechCapture = useCallback(() => {
    setQuickMicNotice(null);
    if (isQuickMicListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop error
      }
      setIsQuickMicListening(false);
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setQuickMicNotice(
        lang === 'TL'
          ? 'Walang Web Speech Mic sa browser na ito — pwedeng i-type ang tanong sa ibaba po.'
          : 'Web Speech API unavailable in this browser — type your question below.'
      );
      return;
    }

    try {
      const recognition = new Ctor();
      recognition.lang = lang === 'TL' ? 'tl-PH' : 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => setIsQuickMicListening(true);
      recognition.onend = () => setIsQuickMicListening(false);
      recognition.onerror = (ev) => {
        setIsQuickMicListening(false);
        setQuickMicNotice(
          lang === 'TL'
            ? `Mic error (${ev.error || 'blocked'}): paki-check po ang microphone permission.`
            : `Mic error (${ev.error || 'blocked'}): verify microphone permission.`
        );
      };
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        if (transcript && onVoiceTranscript) {
          onVoiceTranscript(transcript);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsQuickMicListening(false);
      setQuickMicNotice(
        lang === 'TL' ? 'Hindi masimulan ang Voice Mic.' : 'Could not start Voice Mic.'
      );
    }
  }, [isQuickMicListening, lang, onVoiceTranscript]);

  if (!isOpen) return null;

  const activeTierMeta =
    AI_TIER_CASCADE.find((t) => t.id === routerSnapshot.activeTier) ||
    AI_TIER_CASCADE[0];
  const badgeTone = getTierBadgeStyle(
    routerSnapshot.activeTier,
    routerSnapshot.isOfflineFallback
  );

  return (
    <aside
      data-testid="unified-ai-assistant-drawer"
      role="dialog"
      aria-modal="false"
      aria-label={
        lang === 'TL'
          ? 'AutoElectric AI Bench Coach at Diagnostic Drawer'
          : 'AutoElectric AI Bench Coach and Diagnostic Drawer'
      }
      className="fixed inset-y-0 right-0 z-50 w-full max-w-[440px] bg-[#070E1B] border-l border-cyan-500/45 shadow-2xl flex flex-col text-slate-100"
    >
      {/* Unified Header */}
      <div className="px-3.5 py-2.5 border-b border-slate-800 bg-[#0B1528] space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg border border-cyan-500/50 bg-cyan-950/60 flex items-center justify-center shrink-0">
              {activeSubTab === 'VOICE' ? (
                <Headphones className="w-4 h-4 text-cyan-300" />
              ) : (
                <Bot className="w-4 h-4 text-cyan-300" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="font-hud text-[13px] font-bold tracking-wide text-slate-100 truncate">
                {lang === 'TL' ? 'AutoElectric AI Coach' : 'AutoElectric AI Coach'}
              </h2>
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400 truncate">
                <span>{lang === 'TL' ? 'Buong System DB' : 'Full System DB'}</span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{activeTab.replace(/_/g, ' ')}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Shared TL / EN Toggle */}
            <div
              className="inline-flex items-center rounded border border-slate-700/90 bg-slate-900/90 p-0.5"
              role="group"
              aria-label="Assistant language toggle"
            >
              <Globe className="w-3 h-3 text-cyan-400 mx-1 hidden sm:block" />
              <button
                type="button"
                onClick={() => handleToggleLang('TL')}
                aria-pressed={lang === 'TL'}
                className={`px-1.5 py-0.5 rounded-[2px] font-mono text-[10.5px] font-semibold cursor-pointer ${
                  lang === 'TL'
                    ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                TL
              </button>
              <button
                type="button"
                onClick={() => handleToggleLang('EN')}
                aria-pressed={lang === 'EN'}
                className={`px-1.5 py-0.5 rounded-[2px] font-mono text-[10.5px] font-semibold cursor-pointer ${
                  lang === 'EN'
                    ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                EN
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer"
              aria-label="Close AI Assistant Drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-tab Switcher + Live AI Tier Status + Quick Speech Mic */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div
            className="inline-flex items-center rounded-md border border-slate-700/80 bg-slate-950/90 p-0.5"
            role="tablist"
            aria-label="AI Assistant Mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'VOICE'}
              onClick={() => onChangeSubTab('VOICE')}
              className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                activeSubTab === 'VOICE'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/50'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>{lang === 'TL' ? 'Voice Coach' : 'Voice Coach'}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'DIAGNOSTIC'}
              onClick={() => onChangeSubTab('DIAGNOSTIC')}
              className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                activeSubTab === 'DIAGNOSTIC'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/50'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>{lang === 'TL' ? 'Diagnostic' : 'Diagnostic'}</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <div
              data-testid="ai-tier-status-badge"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded border font-mono text-[10px] ${badgeTone}`}
              title={
                routerSnapshot.rerouteReason ||
                routerSnapshot.lastErrorSummary ||
                'Cascade: Carbon → Hydrogen → Argon → Flash Lite → Offline AI'
              }
            >
              {routerSnapshot.activeTier === 'OFFLINE_AI' ? (
                <WifiOff className="w-3 h-3 shrink-0" />
              ) : routerSnapshot.phase === 'ROUTING' || routerSnapshot.phase === 'FALLBACK' ? (
                <Radio className="w-3 h-3 shrink-0 animate-pulse" />
              ) : (
                <Cpu className="w-3 h-3 shrink-0" />
              )}
              <span className="font-semibold">
                AI: {activeTierMeta.label}
                {routerSnapshot.preQuotaRerouted && routerSnapshot.activeTier !== 'OFFLINE_AI'
                  ? ' (Auto)'
                  : ''}
              </span>
            </div>

            {onVoiceTranscript && (
              <button
                type="button"
                onClick={handleQuickSpeechCapture}
                title={
                  lang === 'TL'
                    ? 'Quick Voice Capture (tl-PH)'
                    : 'Quick Voice Capture (en-US)'
                }
                aria-label={isQuickMicListening ? 'Stop Quick Voice Mic' : 'Start Quick Voice Mic'}
                className={`p-1.5 rounded border font-mono text-[10px] cursor-pointer ${
                  isQuickMicListening
                    ? 'border-rose-500/80 bg-rose-950/70 text-rose-200 animate-pulse'
                    : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500/60 hover:text-cyan-200'
                }`}
              >
                {isQuickMicListening ? (
                  <MicOff className="w-3.5 h-3.5" />
                ) : (
                  <Mic className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {quickMicNotice && (
          <div className="font-mono text-[10.5px] text-amber-300 bg-amber-950/40 border border-amber-500/40 rounded px-2 py-1">
            {quickMicNotice}
          </div>
        )}
      </div>

      {/* Live Simulated Bench Telemetry Context Strip */}
      <div className="px-3.5 py-2 border-b border-slate-800/80 bg-slate-950/85 shrink-0 space-y-1">
        <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
          <span className="inline-flex items-center gap-1.5 uppercase tracking-wider text-cyan-300 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            Simulated Bench Telemetry (Live)
          </span>
          {telemetry.isOcpTripped ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] border border-rose-500/70 bg-rose-950/80 font-bold text-rose-200">
              <AlertTriangle className="w-3 h-3" />
              OCP TRIP
            </span>
          ) : (
            <span className="text-slate-400 tabular-nums">
              {telemetry.psuEnabled ? `${telemetry.psuVoltageSetting.toFixed(1)}V` : 'PSU OFF'} ·{' '}
              {telemetry.activeDtcs.length} DTC
            </span>
          )}
        </div>
        <p className="font-mono text-[10.5px] text-slate-300 break-words leading-snug">
          {benchSummaryText}
        </p>
      </div>

      {/* Active Sub-Tab Content */}
      {activeSubTab === 'VOICE' ? (
        <HandsFreeVoiceCoach
          isOpen={isOpen}
          embedded={true}
          onClose={onClose}
          activeModuleId={activeModuleId}
          activeTab={activeTab}
          lang={lang}
          telemetry={telemetry}
          pins={pins}
          nodeVoltages={nodeVoltages}
          incomingCommand={incomingVoiceCommand}
          onConsumedIncomingCommand={onConsumedIncomingVoiceCommand}
          onNavigateTab={onNavigateTab}
          onOpenModal={onOpenModal}
        />
      ) : (
        <AiDiagnosticAssistantPanel
          isOpen={isOpen}
          embedded={true}
          onClose={onClose}
          lang={lang}
          telemetry={telemetry}
          benchSummaryText={benchSummaryText}
          quickFillPrompt={quickFillPrompt}
          incomingVoiceTranscript={incomingDiagnosticTranscript}
          onConsumedVoiceTranscript={onConsumedDiagnosticTranscript}
        />
      )}
    </aside>
  );
};
