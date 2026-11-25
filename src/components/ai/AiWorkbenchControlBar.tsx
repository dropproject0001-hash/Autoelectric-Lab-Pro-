/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Cpu,
  Globe,
  GraduationCap,
  Headphones,
  KeyRound,
  Mic,
  MicOff,
  Radio,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { LicenseStatusBadge } from '../billing/LicenseStatusBadge';
import type {
  AiRouterStatusSnapshot,
  AiTierId,
  BenchTelemetry,
  BilingualLang,
} from '../../types/aiAssistant';
import {
  AI_TIER_CASCADE,
  getAiRouterStatus,
  subscribeAiRouterStatus,
} from '../../services/ai/aiRouter';

export const BILINGUAL_LANG_STORAGE_KEY = 'vecl_bilingual_lang_v1';

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

export function loadPersistedBilingualLang(): BilingualLang {
  if (typeof window === 'undefined') return 'TL';
  try {
    const saved = window.localStorage.getItem(BILINGUAL_LANG_STORAGE_KEY);
    if (saved === 'EN' || saved === 'TL') return saved;
  } catch {
    // Ignore storage access restriction
  }
  return 'TL';
}

export function persistBilingualLang(lang: BilingualLang): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BILINGUAL_LANG_STORAGE_KEY, lang);
  } catch {
    // Ignore storage access restriction
  }
}

interface AiWorkbenchControlBarProps {
  lang: BilingualLang;
  onChangeLang: (lang: BilingualLang) => void;
  telemetry: BenchTelemetry;
  isAssistantOpen: boolean;
  onOpenAssistant: (prefillQuery?: string) => void;
  onVoiceTranscript?: (transcript: string) => void;
  isHandsFreeOpen?: boolean;
  onOpenHandsFreeCoach?: () => void;
  onOpenAcademyCurriculum?: () => void;
  onOpenSubscriptionModal?: () => void;
  onOpenAdminBillingModal?: () => void;
  isAdminUnlocked?: boolean;
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

export const AiWorkbenchControlBar: React.FC<AiWorkbenchControlBarProps> = ({
  lang,
  onChangeLang,
  telemetry,
  isAssistantOpen,
  onOpenAssistant,
  onVoiceTranscript,
  isHandsFreeOpen = false,
  onOpenHandsFreeCoach,
  onOpenAcademyCurriculum,
  onOpenSubscriptionModal,
  onOpenAdminBillingModal,
  isAdminUnlocked = false,
}) => {
  const [routerSnapshot, setRouterSnapshot] = useState<AiRouterStatusSnapshot>(() =>
    getAiRouterStatus()
  );
  const [isListening, setIsListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
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
      setVoiceNotice(null);
    },
    [onChangeLang]
  );

  const handleToggleVoiceMic = useCallback(() => {
    setVoiceNotice(null);
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      setIsListening(false);
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setVoiceNotice(
        lang === 'TL'
          ? 'Walang Web Speech Mic sa browser na ito — i-type ang tanong sa AI Assistant.'
          : 'Web Speech API unavailable in this browser — type your question in the AI Assistant.'
      );
      onOpenAssistant();
      return;
    }

    try {
      const recognition = new Ctor();
      recognition.lang = lang === 'TL' ? 'tl-PH' : 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => {
        setIsListening(true);
      };
      recognition.onend = () => {
        setIsListening(false);
      };
      recognition.onerror = (ev) => {
        setIsListening(false);
        setVoiceNotice(
          lang === 'TL'
            ? `Mic error (${ev.error || 'blocked'}): i-check ang microphone permission.`
            : `Mic error (${ev.error || 'blocked'}): verify microphone permission.`
        );
      };
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        if (transcript) {
          if (onVoiceTranscript) {
            onVoiceTranscript(transcript);
          } else {
            onOpenAssistant(transcript);
          }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      setVoiceNotice(
        lang === 'TL'
          ? 'Hindi masimulan ang Voice Mic.'
          : 'Could not start Voice Mic.'
      );
    }
  }, [isListening, lang, onOpenAssistant, onVoiceTranscript]);

  const activeTierMeta =
    AI_TIER_CASCADE.find((t) => t.id === routerSnapshot.activeTier) ||
    AI_TIER_CASCADE[0];

  const badgeTone = getTierBadgeStyle(
    routerSnapshot.activeTier,
    routerSnapshot.isOfflineFallback
  );

  return (
    <div
      data-testid="ai-workbench-control-bar"
      className="w-full shrink-0 border-b border-slate-800/80 bg-[#08101E]/95 px-2 sm:px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs"
    >
      {/* Left: Bilingual Toggle + Voice Mic */}
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className="inline-flex items-center rounded-[3px] border border-slate-700/80 bg-slate-900/90 p-0.5"
          role="group"
          aria-label="Assistant language toggle"
        >
          <span className="px-1.5 text-[10px] font-mono text-slate-400 hidden sm:inline-flex items-center gap-1">
            <Globe className="w-3 h-3 text-cyan-400" />
            LANG
          </span>
          <button
            type="button"
            onClick={() => handleToggleLang('TL')}
            aria-pressed={lang === 'TL'}
            className={`px-2 py-0.5 rounded-[2px] font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
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
            className={`px-2 py-0.5 rounded-[2px] font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
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
          onClick={handleToggleVoiceMic}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] border font-mono text-[11px] font-medium transition-colors cursor-pointer ${
            isListening
              ? 'border-rose-500/80 bg-rose-950/70 text-rose-200 animate-pulse'
              : 'border-slate-700 bg-slate-900/90 text-slate-200 hover:border-cyan-500/60 hover:text-cyan-200'
          }`}
          title={
            lang === 'TL'
              ? 'Magsalita sa Taglish o English (tl-PH)'
              : 'Speak diagnostic question (en-US)'
          }
        >
          {isListening ? (
            <MicOff className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <Mic className="w-3.5 h-3.5 text-cyan-400" />
          )}
          <span>
            {isListening
              ? lang === 'TL'
                ? 'Nakikinig (tl-PH)...'
                : 'Listening (en-US)...'
              : lang === 'TL'
                ? 'Voice Mic (TL)'
                : 'Voice Mic (EN)'}
          </span>
        </button>

        {onOpenHandsFreeCoach && (
          <button
            type="button"
            onClick={onOpenHandsFreeCoach}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] border font-mono text-[11px] font-medium transition-colors cursor-pointer ${
              isHandsFreeOpen
                ? 'border-emerald-400 bg-emerald-500/25 text-emerald-100'
                : 'border-emerald-500/60 bg-emerald-950/50 text-emerald-200 hover:bg-emerald-900/60'
            }`}
            title="Hands-Free Local AI Voice Coach (Natural Taglish — Full System DB)"
          >
            <Headphones className="w-3.5 h-3.5 text-emerald-400" />
            <span>{lang === 'TL' ? 'Hands-Free Coach' : 'Hands-Free Coach'}</span>
          </button>
        )}

        {onOpenAcademyCurriculum && (
          <button
            type="button"
            onClick={onOpenAcademyCurriculum}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] border border-indigo-500/60 bg-indigo-950/50 text-indigo-200 hover:bg-indigo-900/60 font-mono text-[11px] font-medium transition-colors cursor-pointer"
            title="University 3-Tier Curriculum Matrix & SHA-256 Exam PDF"
          >
            <GraduationCap className="w-3.5 h-3.5 text-indigo-300" />
            <span>Academy Lab</span>
          </button>
        )}

        {voiceNotice && (
          <span className="text-[11px] font-mono text-amber-300 truncate max-w-[260px]">
            {voiceNotice}
          </span>
        )}
      </div>

      {/* Right: Live AI Tier Status + License Badge + Bench Snapshot + Assistant Button */}
      <div className="flex items-center gap-2 flex-wrap">
        {onOpenSubscriptionModal && (
          <LicenseStatusBadge
            lang={lang}
            onClick={onOpenSubscriptionModal}
          />
        )}

        {onOpenAdminBillingModal && isAdminUnlocked && (
          <button
            type="button"
            onClick={onOpenAdminBillingModal}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-[3px] border border-amber-500/60 bg-amber-950/50 text-amber-200 hover:bg-amber-900/60 font-mono text-[10.5px] font-semibold cursor-pointer"
            title="Master Admin Offline PIN Generator & GCash/Maya QR Uploader"
          >
            <KeyRound className="w-3 h-3" />
            <span>Admin PIN/QR</span>
          </button>
        )}
        <div
          data-testid="ai-tier-status-badge"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] border font-mono text-[11px] ${badgeTone}`}
          title="Fallback cascade: Carbon → Hydrogen → Argon → Flash Lite → Offline AI"
        >
          {routerSnapshot.activeTier === 'OFFLINE_AI' ? (
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
          ) : routerSnapshot.phase === 'ROUTING' || routerSnapshot.phase === 'FALLBACK' ? (
            <Radio className="w-3.5 h-3.5 shrink-0 animate-pulse" />
          ) : (
            <Cpu className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="font-semibold">AI: {activeTierMeta.label}</span>
          <span className="hidden lg:inline text-[10px] opacity-80">
            (Carbon ➔ Hydrogen ➔ Argon ➔ Flash Lite ➔ Offline AI)
          </span>
        </div>

        <div className="hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-[3px] border border-slate-700/80 bg-slate-900/80 font-mono text-[10px] text-slate-300">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>
            PSU {telemetry.isOcpTripped ? 'OCP TRIP' : telemetry.psuEnabled ? `${telemetry.psuVoltageSetting.toFixed(1)}V` : 'OFF'}
            {' · '}
            {telemetry.activeDtcs.length} DTC
          </span>
        </div>

        <button
          type="button"
          onClick={() => onOpenAssistant()}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-[3px] border font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
            isAssistantOpen
              ? 'border-cyan-400 bg-cyan-500/25 text-cyan-100'
              : 'border-cyan-600/60 bg-cyan-950/60 text-cyan-200 hover:bg-cyan-900/70'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>
            {lang === 'TL' ? 'AI Bench Assistant' : 'AI Bench Assistant'}
          </span>
        </button>
      </div>
    </div>
  );
};
