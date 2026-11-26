/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Database, Headphones, Mic, MicOff } from 'lucide-react';
import {
  getKnowledgeCenterStats,
  subscribeVerifiedKnowledgeUpdates,
} from '../../services/ai/localKnowledgeDB';
import type { BilingualLang } from '../../types/aiAssistant';
import type { UnifiedAiSubTab } from './UnifiedAiAssistantDrawer';

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

export interface FloatingVoiceKnowledgeFabProps {
  isDrawerOpen: boolean;
  lang: BilingualLang;
  onOpenDrawer: (subTab: UnifiedAiSubTab) => void;
  onVoiceTranscript: (transcript: string) => void;
}

export const FloatingVoiceKnowledgeFab: React.FC<FloatingVoiceKnowledgeFabProps> = ({
  isDrawerOpen,
  lang,
  onOpenDrawer,
  onVoiceTranscript,
}) => {
  const [knowledgeCount, setKnowledgeCount] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [micFallbackNotice, setMicFallbackNotice] = useState<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  useEffect(() => {
    let active = true;
    const refreshStats = () => {
      void getKnowledgeCenterStats()
        .then((stats) => {
          if (active) setKnowledgeCount(stats.totalRecords);
        })
        .catch(() => {});
    };
    refreshStats();
    const unsub = subscribeVerifiedKnowledgeUpdates(refreshStats);
    return () => {
      active = false;
      unsub();
    };
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

  const handleQuickMicClick = useCallback(() => {
    setMicFallbackNotice(null);
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
      setMicFallbackNotice(
        lang === 'TL'
          ? 'Walang Web Speech Mic dito — gamitin ang text input sa drawer.'
          : 'Web Speech Mic unavailable — opened Voice & Knowledge DB text fallback.'
      );
      onOpenDrawer('VOICE');
      return;
    }

    try {
      const recognition = new Ctor();
      recognition.lang = lang === 'TL' ? 'tl-PH' : 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => {
        setIsListening(false);
        setMicFallbackNotice(
          lang === 'TL'
            ? 'Mic blocked/offline — opened Voice Coach text mode.'
            : 'Mic unavailable — opened Voice Coach text mode.'
        );
        onOpenDrawer('VOICE');
      };
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        if (transcript) {
          onVoiceTranscript(transcript);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      onOpenDrawer('VOICE');
    }
  }, [isListening, lang, onOpenDrawer, onVoiceTranscript]);

  // Hide corner FAB while the right-side drawer covers the corner so nothing collides
  if (isDrawerOpen) {
    return null;
  }

  return (
    <div
      data-testid="floating-voice-knowledge-container"
      className="fixed bottom-48 right-3 sm:bottom-24 sm:right-4 z-40 max-w-[calc(100vw-24px)] flex flex-col items-end gap-1.5 pointer-events-none"
      role="region"
      aria-label="Floating Voice and End-to-End Knowledge Database Controls"
    >
      {micFallbackNotice && (
        <div
          role="status"
          className="pointer-events-auto max-w-[280px] rounded border border-amber-500/60 bg-[#0B1528] px-2.5 py-1.5 font-mono text-[10px] text-amber-200 shadow-lg flex items-center justify-between gap-2"
        >
          <span>{micFallbackNotice}</span>
          <button
            type="button"
            onClick={() => setMicFallbackNotice(null)}
            className="text-amber-300 hover:text-white cursor-pointer shrink-0"
            aria-label="Dismiss microphone notice"
          >
            ×
          </button>
        </div>
      )}

      <div className="pointer-events-auto flex items-center rounded-lg border border-cyan-500/60 bg-[#070E1B]/95 shadow-2xl overflow-hidden">
        <button
          type="button"
          data-testid="floating-fab-quick-mic"
          onClick={handleQuickMicClick}
          aria-pressed={isListening}
          aria-label={isListening ? 'Stop voice capture' : 'Start voice query'}
          title={
            lang === 'TL'
              ? 'Magsalita para magtanong sa AI at Knowledge DB'
              : 'Speak to query Voice Coach & Knowledge DB'
          }
          className={`min-h-[44px] px-2.5 sm:px-3 flex items-center justify-center border-r border-slate-800 transition-colors cursor-pointer whitespace-nowrap ${
            isListening
              ? 'bg-rose-950/80 text-rose-200'
              : 'bg-[#0B1528] text-cyan-300 hover:bg-cyan-950/60 hover:text-cyan-100'
          }`}
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        <button
          type="button"
          data-testid="floating-voice-knowledge-fab"
          onClick={() => onOpenDrawer('VOICE')}
          aria-label="Open Voice Coach and End-to-End Knowledge Database"
          title="Open Unified Voice Coach, Diagnostic AI & Knowledge DB"
          className="min-h-[44px] px-3 sm:px-3.5 flex items-center gap-2 bg-[#070E1B] hover:bg-[#0D1A30] text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Headphones className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="font-mono text-[11px] font-semibold tracking-tight">
            {lang === 'TL' ? 'Voice & AI' : 'Voice & AI'}
          </span>
        </button>

        <button
          type="button"
          data-testid="floating-fab-knowledge-btn"
          onClick={() => onOpenDrawer('KNOWLEDGE_DB')}
          aria-label="Open End-to-End Knowledge Database"
          title="Open End-to-End Verified Knowledge DB & Safety Audit"
          className="min-h-[44px] px-2.5 sm:px-3 flex items-center gap-1.5 border-l border-slate-800 bg-[#0B1528] hover:bg-cyan-950/60 text-emerald-300 hover:text-emerald-200 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Database className="w-3.5 h-3.5 shrink-0" />
          <span className="font-mono text-[10.5px] font-semibold tabular-nums">
            DB · {knowledgeCount}
          </span>
        </button>
      </div>
    </div>
  );
};
