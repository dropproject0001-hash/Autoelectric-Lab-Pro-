/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  Bot,
  Cpu,
  Database,
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
import type { BenchVoiceSimulationAction } from '../../simulation/telemetry/efiHarnessStandard';
import {
  AI_TIER_CASCADE,
  getAiRouterStatus,
  subscribeAiRouterStatus,
} from '../../services/ai/aiRouter';
import {
  getKnowledgeCenterStats,
  subscribeVerifiedKnowledgeUpdates,
} from '../../services/ai/localKnowledgeDB';
import {
  getLocalAiRuntimeStatus,
  subscribeLocalAiStatus,
  type LocalAiRuntimeStatus,
} from '../../services/ai/localWebLlmService';
import {
  formatMicrophoneError,
  microphoneManager,
} from '../../services/ai/microphoneManager';
import {
  BILINGUAL_LANG_STORAGE_KEY,
  loadPersistedBilingualLang,
  persistBilingualLang,
} from './AiWorkbenchControlBar';
import { HandsFreeVoiceCoach } from './HandsFreeVoiceCoach';
import { AiDiagnosticAssistantPanel } from './AiDiagnosticAssistantPanel';
import { KnowledgeCenterPanel } from './KnowledgeCenterPanel';

export type UnifiedAiSubTab = 'VOICE' | 'DIAGNOSTIC' | 'KNOWLEDGE_DB';

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

function areTelemetryPropsEqual(prev: BenchTelemetry, next: BenchTelemetry): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;

  // 1. Voltage metrics & DMM readings
  if (prev.psuEnabled !== next.psuEnabled) return false;
  if (prev.psuVoltageSetting !== next.psuVoltageSetting) return false;
  if (prev.selectedPin?.id !== next.selectedPin?.id) return false;
  if (prev.selectedPin?.measuredVoltage !== next.selectedPin?.measuredVoltage) return false;
  if (prev.dmm.isPowered !== next.dmm.isPowered) return false;
  if (prev.dmm.mode !== next.dmm.mode) return false;
  if (prev.dmm.displayReading !== next.dmm.displayReading) return false;
  if (prev.dmm.unit !== next.dmm.unit) return false;
  if (prev.dmm.redProbeLabel !== next.dmm.redProbeLabel) return false;
  if (prev.dmm.blackProbeLabel !== next.dmm.blackProbeLabel) return false;
  if (prev.dmm.evidenceStatus !== next.dmm.evidenceStatus) return false;

  // 2. Current metrics, OCP & solver status
  if (prev.psuCurrentDrawAmps !== next.psuCurrentDrawAmps) return false;
  if (prev.psuCurrentLimitAmps !== next.psuCurrentLimitAmps) return false;
  if (prev.isOcpTripped !== next.isOcpTripped) return false;
  if (prev.solverStatus !== next.solverStatus) return false;

  // 3. Faults & DTCs
  if (prev.activeFaults.length !== next.activeFaults.length) return false;
  for (let i = 0; i < prev.activeFaults.length; i++) {
    const pf = prev.activeFaults[i];
    const nf = next.activeFaults[i];
    if (pf.pinId !== nf.pinId || pf.faultType !== nf.faultType) return false;
  }
  if (prev.activeDtcs.length !== next.activeDtcs.length) return false;
  for (let i = 0; i < prev.activeDtcs.length; i++) {
    const pd = prev.activeDtcs[i];
    const nd = next.activeDtcs[i];
    if (pd.code !== nd.code || pd.severity !== nd.severity) return false;
  }

  return true;
}

function areNodeVoltagesEqual(
  prev: Record<string, number>,
  next: Record<string, number>
): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) return false;
  for (const k of prevKeys) {
    if (prev[k] !== next[k]) return false;
  }
  return true;
}

export function areUnifiedAiDrawerPropsEqual(
  prev: UnifiedAiAssistantDrawerProps,
  next: UnifiedAiAssistantDrawerProps
): boolean {
  // If drawer is closed in both renders, completely skip re-rendering
  if (!prev.isOpen && !next.isOpen) return true;
  // If open state toggled, must re-render
  if (prev.isOpen !== next.isOpen) return false;

  // Drawer UI state changes must trigger re-render
  if (prev.activeSubTab !== next.activeSubTab) return false;
  if (prev.lang !== next.lang) return false;
  if (prev.activeTab !== next.activeTab) return false;
  if (prev.activeModuleId !== next.activeModuleId) return false;
  if (prev.incomingVoiceCommand !== next.incomingVoiceCommand) return false;
  if (prev.incomingDiagnosticTranscript !== next.incomingDiagnosticTranscript) return false;
  if (prev.quickFillPrompt !== next.quickFillPrompt) return false;
  if (prev.benchSummaryText !== next.benchSummaryText) return false;

  // Pin structure changes (count / ids)
  if (prev.pins.length !== next.pins.length) return false;

  // Core bench telemetry equality (voltage, current, faults)
  if (!areTelemetryPropsEqual(prev.telemetry, next.telemetry)) {
    return false;
  }

  // Node voltages equality
  if (!areNodeVoltagesEqual(prev.nodeVoltages, next.nodeVoltages)) {
    return false;
  }

  return true;
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
  onBenchVoiceAction?: (action: BenchVoiceSimulationAction) => void;
}

const UnifiedAiAssistantDrawerComponent: React.FC<UnifiedAiAssistantDrawerProps> = ({
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
  onBenchVoiceAction,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [routerSnapshot, setRouterSnapshot] = useState<AiRouterStatusSnapshot>(() =>
    getAiRouterStatus()
  );
  const [localWebLlmStatus, setLocalWebLlmStatus] = useState<LocalAiRuntimeStatus>(() =>
    getLocalAiRuntimeStatus()
  );
  const [isQuickMicListening, setIsQuickMicListening] = useState(false);
  const [quickMicNotice, setQuickMicNotice] = useState<string | null>(null);
  const [knowledgeCount, setKnowledgeCount] = useState(0);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  useEffect(() => {
    return subscribeAiRouterStatus((next) => {
      setRouterSnapshot(next);
    });
  }, []);

  useEffect(() => {
    return subscribeLocalAiStatus(setLocalWebLlmStatus);
  }, []);

  useEffect(() => {
    let active = true;
    const refreshDbCount = () => {
      void getKnowledgeCenterStats()
        .then((stats) => {
          if (active) setKnowledgeCount(stats.totalRecords);
        })
        .catch(() => {});
    };
    refreshDbCount();
    const unsub = subscribeVerifiedKnowledgeUpdates(refreshDbCount);
    return () => {
      active = false;
      unsub();
    };
  }, [isOpen]);

  // Centralized microphone cleanup whenever the drawer closes or unmounts
  useEffect(() => {
    if (!isOpen) {
      microphoneManager.stopAllForDrawerClose();
      recognitionRef.current = null;
      setIsQuickMicListening(false);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      microphoneManager.stopAllForDrawerClose();
      recognitionRef.current = null;
    };
  }, []);

  // Accessible Escape key close while open (non-blocking — does not lock body scroll)
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Diagnostic debugging log: verify live telemetry reception inside UnifiedAiAssistantDrawer
  useEffect(() => {
    if (isOpen && typeof console !== 'undefined' && console.debug) {
      console.debug('[UnifiedAiAssistantDrawer] Received live telemetry update:', {
        activeSubTab,
        psuVoltageSetting: telemetry.psuVoltageSetting,
        psuEnabled: telemetry.psuEnabled,
        psuCurrentDrawAmps: telemetry.psuCurrentDrawAmps,
        isOcpTripped: telemetry.isOcpTripped,
        dmmReading: `${telemetry.dmm.displayReading} ${telemetry.dmm.unit}`,
        selectedPinVoltage: telemetry.selectedPin?.measuredVoltage ?? null,
        activeDtcs: telemetry.activeDtcs.map((d) => d.code),
        activeFaults: telemetry.activeFaults.map((f) => `${f.pinId}:${f.faultType}`),
      });
    }
  }, [isOpen, activeSubTab, telemetry]);

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
      microphoneManager.releaseRecognitionSession('unified-drawer-quick-mic');
      recognitionRef.current = null;
      setIsQuickMicListening(false);
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setQuickMicNotice(formatMicrophoneError('not-supported', lang));
      return;
    }

    try {
      const recognition = new Ctor();
      recognition.lang = lang === 'TL' ? 'tl-PH' : 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      // Claim centralized mic ownership (stops any competing recognition session first)
      microphoneManager.claimRecognitionSession('unified-drawer-quick-mic', recognition);

      recognition.onstart = () => setIsQuickMicListening(true);
      recognition.onend = () => {
        setIsQuickMicListening(false);
        microphoneManager.releaseRecognitionSession('unified-drawer-quick-mic');
      };
      recognition.onerror = (ev) => {
        setIsQuickMicListening(false);
        microphoneManager.releaseRecognitionSession('unified-drawer-quick-mic');
        const message = formatMicrophoneError(ev.error || 'blocked', lang);
        microphoneManager.setSessionState('ERROR', message);
        setQuickMicNotice(message);
      };
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        if (transcript && onVoiceTranscript) {
          onVoiceTranscript(transcript);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setIsQuickMicListening(false);
      microphoneManager.releaseRecognitionSession('unified-drawer-quick-mic');
      const message = formatMicrophoneError(
        err instanceof Error ? err.name || err.message : 'blocked',
        lang
      );
      setQuickMicNotice(message);
    }
  }, [isQuickMicListening, lang, onVoiceTranscript]);

  if (typeof document === 'undefined') return null;

  const activeTierMeta =
    AI_TIER_CASCADE.find((t) => t.id === routerSnapshot.activeTier) ||
    AI_TIER_CASCADE[0];
  const badgeTone = getTierBadgeStyle(
    routerSnapshot.activeTier,
    routerSnapshot.isOfflineFallback
  );

  const localProviderLabel =
    localWebLlmStatus.executionState === 'LOCAL_WEBGPU_INFERENCE'
      ? `WebLLM: ${localWebLlmStatus.activeProfileId || 'GPU'}`
      : null;

  const panelVariants = {
    closed: {
      x: '100%',
      opacity: shouldReduceMotion ? 0 : 0.96,
      transition: shouldReduceMotion
        ? { duration: 0.01 }
        : { duration: 0.2, ease: [0.4, 0, 1, 1] as const },
    },
    open: {
      x: 0,
      opacity: 1,
      transition: shouldReduceMotion
        ? { duration: 0.01 }
        : { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const },
    },
  };

  const edgeScrimVariants = {
    closed: {
      opacity: 0,
      transition: shouldReduceMotion ? { duration: 0.01 } : { duration: 0.18 },
    },
    open: {
      opacity: 1,
      transition: shouldReduceMotion ? { duration: 0.01 } : { duration: 0.22 },
    },
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <React.Fragment key="unified-ai-drawer-portal">
          {/* Non-blocking subtle right-edge depth scrim (keeps bench instruments interactive) */}
          <motion.div
            key="unified-ai-drawer-scrim"
            aria-hidden="true"
            initial="closed"
            animate="open"
            exit="closed"
            variants={edgeScrimVariants}
            className="pointer-events-none fixed inset-y-0 right-0 z-40 w-[min(100vw,520px)] bg-gradient-to-l from-[#02050B]/55 via-[#02050B]/20 to-transparent"
          />

          {/* Right-Sliding Frosted-Glass AI Assistant Drawer (AutoElectric Lab Pro Palette) */}
          <motion.aside
            key="unified-ai-drawer-panel"
            data-testid="unified-ai-assistant-drawer"
            role="dialog"
            aria-modal="false"
            aria-label={
              lang === 'TL'
                ? 'AutoElectric AI Bench Coach at Diagnostic Drawer'
                : 'AutoElectric AI Bench Coach and Diagnostic Drawer'
            }
            initial="closed"
            animate="open"
            exit="closed"
            variants={panelVariants}
            className="hud-drawer-surface fixed inset-y-0 right-0 z-50 w-full max-w-[440px] h-[100dvh] bg-[#060C16]/88 backdrop-blur-[30px] border-l border-[#19C8F5]/35 shadow-[-14px_0_44px_rgba(2,6,14,0.75)] flex flex-col text-slate-100 will-change-transform"
          >
            {/* Electric Cyan Top Glass Reflection Edge */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[1.5px] bg-gradient-to-r from-transparent via-[#19C8F5]/85 to-[#1677FF]/45"
            />
            {/* Subtle Left Glass Rim Highlight */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 z-20 w-px bg-gradient-to-b from-[#19C8F5]/60 via-[#19C8F5]/20 to-transparent"
            />

      {/* Unified Header */}
      <div className="px-3.5 py-2.5 border-b border-[#203653]/85 bg-[#0A1220]/82 backdrop-blur-md space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg border border-cyan-500/50 bg-cyan-950/60 flex items-center justify-center shrink-0">
              {activeSubTab === 'VOICE' ? (
                <Headphones className="w-4 h-4 text-cyan-300" />
              ) : activeSubTab === 'KNOWLEDGE_DB' ? (
                <Database className="w-4 h-4 text-cyan-300" />
              ) : (
                <Bot className="w-4 h-4 text-cyan-300" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-hud text-[13px] font-bold tracking-wide text-slate-100 truncate">
                  {lang === 'TL' ? 'AutoElectric AI Coach' : 'AutoElectric AI Coach'}
                </h2>
                {/* Visual Indicator: Real-time bench data actively streaming to AI */}
                <div
                  data-testid="drawer-telemetry-streaming-indicator"
                  className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border border-cyan-500/40 bg-cyan-950/60 font-mono text-[9.5px] text-cyan-300 shrink-0"
                  title={
                    lang === 'TL'
                      ? 'Live Telemetry: Patuloy na nagsi-stream mula sa bench circuit solver'
                      : 'Live Telemetry: Actively streaming from bench circuit solver'
                  }
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                  </span>
                  <span className="uppercase tracking-wider font-semibold text-[9px] text-emerald-300">
                    Live Stream
                  </span>
                </div>
              </div>
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
              className={`px-2 py-1 rounded text-[11px] font-mono font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors ${
                activeSubTab === 'VOICE'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/50'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>Voice</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'DIAGNOSTIC'}
              onClick={() => onChangeSubTab('DIAGNOSTIC')}
              className={`px-2 py-1 rounded text-[11px] font-mono font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors ${
                activeSubTab === 'DIAGNOSTIC'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/50'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Diagnostic</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'KNOWLEDGE_DB'}
              onClick={() => onChangeSubTab('KNOWLEDGE_DB')}
              data-testid="drawer-tab-knowledge-db"
              className={`px-2 py-1 rounded text-[11px] font-mono font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors ${
                activeSubTab === 'KNOWLEDGE_DB'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/50'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Knowledge DB</span>
              <span className="tabular-nums text-[10px] text-slate-300">{knowledgeCount}</span>
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
                {localProviderLabel ? localProviderLabel : `AI: ${activeTierMeta.label}`}
                {!localProviderLabel &&
                routerSnapshot.preQuotaRerouted &&
                routerSnapshot.activeTier !== 'OFFLINE_AI'
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

      {/* Live Simulated Bench Telemetry Context Strip (keyed per sub-tab for 180ms cascade) */}
      <div
        key={activeSubTab}
        className="ai-drawer-cascade-item ai-drawer-stagger-0 px-3.5 py-2 border-b border-slate-800/80 bg-slate-950/85 shrink-0 space-y-1"
      >
        <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
          <span className="inline-flex items-center gap-1.5 uppercase tracking-wider text-cyan-300 font-semibold">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            Simulated Bench Telemetry (Live)
          </span>
          {telemetry.isOcpTripped ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] border border-rose-500/70 bg-rose-950/80 font-bold text-rose-200">
              <AlertTriangle className="w-3 h-3" />
              OCP TRIP
            </span>
          ) : telemetry.solverStatus === 'UNRESOLVED' ||
            telemetry.solverStatus === 'NON_FINITE' ? (
            <span
              data-testid="drawer-solver-warning-badge"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] border border-amber-500/70 bg-amber-950/80 font-bold text-amber-200"
            >
              <AlertTriangle className="w-3 h-3" />
              {telemetry.solverStatus}
            </span>
          ) : (
            <span className="text-slate-400 tabular-nums">
              {telemetry.psuEnabled ? `${telemetry.psuVoltageSetting.toFixed(1)}V` : 'PSU OFF'} ·{' '}
              {telemetry.activeDtcs.length} DTC
            </span>
          )}
        </div>
        <p
          data-testid="drawer-live-telemetry-summary"
          className="font-mono text-[10.5px] text-slate-300 break-words leading-snug"
        >
          {benchSummaryText}
        </p>
      </div>

      {/* Persistent Sub-Tab Stage (keeps live telemetry reconciliation active across tab switches) */}
      <div
        data-testid="ai-drawer-panel-stage"
        data-active-subtab={activeSubTab}
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
      >
        <div
          className={
            activeSubTab === 'VOICE'
              ? 'flex flex-col flex-1 min-h-0 overflow-hidden'
              : 'hidden'
          }
          aria-hidden={activeSubTab !== 'VOICE'}
        >
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
            onBenchVoiceAction={onBenchVoiceAction}
          />
        </div>
        <div
          className={
            activeSubTab === 'DIAGNOSTIC'
              ? 'flex flex-col flex-1 min-h-0 overflow-hidden'
              : 'hidden'
          }
          aria-hidden={activeSubTab !== 'DIAGNOSTIC'}
        >
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
        </div>
        <div
          className={
            activeSubTab === 'KNOWLEDGE_DB'
              ? 'flex flex-col flex-1 min-h-0 overflow-hidden'
              : 'hidden'
          }
          aria-hidden={activeSubTab !== 'KNOWLEDGE_DB'}
        >
          <KnowledgeCenterPanel compact={true} lang={lang} />
        </div>
      </div>
          </motion.aside>
        </React.Fragment>
      )}
    </AnimatePresence>,
    document.body
  );
};

export const UnifiedAiAssistantDrawer: React.FC<UnifiedAiAssistantDrawerProps> = React.memo(
  UnifiedAiAssistantDrawerComponent,
  areUnifiedAiDrawerPropsEqual
);
