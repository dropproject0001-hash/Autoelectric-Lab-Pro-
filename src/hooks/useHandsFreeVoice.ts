import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createInitialVoiceSessionMemory,
  processVoiceCoachTurn,
  type VoiceCoachTurnResult,
  type VoiceSessionMemory,
} from '../services/ai/localVoiceBrain';
import type { BenchTelemetry } from '../types/aiAssistant';

export type HandsFreeVoiceStatus =
  | 'STANDBY'
  | 'NAKIKINIG'
  | 'CHINE_CHECK_SA_DB'
  | 'NAGSASALITA';

export const HANDS_FREE_TTS_RATE = 0.94;
export const HANDS_FREE_TTS_PITCH = 1.0;
export const HANDS_FREE_CHIME_HZ = 660;
export const HANDS_FREE_CHIME_MS = 70;
export const HANDS_FREE_AUTO_RESUME_MS = 400;

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
  abort: () => void;
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

function playReadyChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(HANDS_FREE_CHIME_HZ, ctx.currentTime);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + HANDS_FREE_CHIME_MS / 1000
    );
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + HANDS_FREE_CHIME_MS / 1000);
    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, HANDS_FREE_CHIME_MS + 80);
  } catch {
    // Ignore audio context autoplay blocks
  }
}

export function useHandsFreeVoice(params: {
  activeModuleId: string;
  telemetry?: Partial<BenchTelemetry>;
}) {
  const { activeModuleId, telemetry } = params;
  const [isHandsFreeActive, setIsHandsFreeActive] = useState(false);
  const [status, setStatus] = useState<HandsFreeVoiceStatus>('STANDBY');
  const [memory, setMemory] = useState<VoiceSessionMemory>(() =>
    createInitialVoiceSessionMemory(activeModuleId)
  );
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastTurn, setLastTurn] = useState<VoiceCoachTurnResult | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const isHandsFreeRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const memoryRef = useRef(memory);
  const telemetryRef = useRef(telemetry);

  useEffect(() => {
    memoryRef.current = memory;
  }, [memory]);

  useEffect(() => {
    telemetryRef.current = telemetry;
  }, [telemetry]);

  useEffect(() => {
    setMemory((prev) =>
      prev.activeModuleId === activeModuleId
        ? prev
        : createInitialVoiceSessionMemory(activeModuleId)
    );
  }, [activeModuleId]);

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  const stopRecognitionStrict = useCallback(() => {
    clearResumeTimer();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort();
      } catch {
        // Ignore abort errors
      }
      recognitionRef.current = null;
    }
  }, [clearResumeTimer]);

  const cancelSpeechStrict = useCallback(() => {
    isSpeakingRef.current = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore synthesis cancel errors
      }
    }
  }, []);

  const startListeningLoopRef = useRef<() => void>(() => {});

  const speakWithEchoShield = useCallback(
    (text: string) => {
      // Strict Echo Shield: always stop microphone BEFORE speaking so AI never hears itself
      stopRecognitionStrict();
      cancelSpeechStrict();
      setStatus('NAGSASALITA');

      const scheduleAutoResume = () => {
        isSpeakingRef.current = false;
        if (!isHandsFreeRef.current) {
          setStatus('STANDBY');
          return;
        }
        clearResumeTimer();
        resumeTimerRef.current = window.setTimeout(() => {
          if (isHandsFreeRef.current && !isSpeakingRef.current) {
            playReadyChime();
            startListeningLoopRef.current();
          }
        }, HANDS_FREE_AUTO_RESUME_MS);
      };

      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        scheduleAutoResume();
        return;
      }

      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'tl-PH';
        utterance.rate = HANDS_FREE_TTS_RATE;
        utterance.pitch = HANDS_FREE_TTS_PITCH;
        const voices = window.speechSynthesis.getVoices?.() || [];
        const preferred =
          voices.find((v) => /fil|tl-ph/i.test(v.lang)) ||
          voices.find((v) => /en-ph|en-us/i.test(v.lang));
        if (preferred) {
          utterance.voice = preferred;
        }
        isSpeakingRef.current = true;
        utterance.onend = () => scheduleAutoResume();
        utterance.onerror = () => scheduleAutoResume();
        window.speechSynthesis.speak(utterance);
      } catch {
        scheduleAutoResume();
      }
    },
    [cancelSpeechStrict, clearResumeTimer, stopRecognitionStrict]
  );

  const handleUserCommand = useCallback(
    (rawTranscript: string, speakReply = true) => {
      const cleaned = rawTranscript.trim();
      if (!cleaned) return;
      setLastTranscript(cleaned);
      setStatus('CHINE_CHECK_SA_DB');

      const result = processVoiceCoachTurn({
        transcript: cleaned,
        memory: memoryRef.current,
        telemetry: telemetryRef.current,
      });

      memoryRef.current = result.updatedMemory;
      setMemory(result.updatedMemory);
      setLastTurn(result);

      if (speakReply) {
        speakWithEchoShield(result.spokenText);
      } else {
        setStatus(isHandsFreeRef.current ? 'NAKIKINIG' : 'STANDBY');
      }
    },
    [speakWithEchoShield]
  );

  const startListeningLoop = useCallback(() => {
    if (!isHandsFreeRef.current || isSpeakingRef.current) return;
    stopRecognitionStrict();
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setErrorNotice(
        'Walang Web Speech Recognition sa browser na ito — gamitin ang quick buttons sa ibaba.'
      );
      setStatus('STANDBY');
      return;
    }

    try {
      const recognition = new Ctor();
      recognition.lang = 'tl-PH';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => {
        setErrorNotice(null);
        setStatus('NAKIKINIG');
      };

      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        if (transcript) {
          stopRecognitionStrict();
          handleUserCommand(transcript, true);
        }
      };

      recognition.onerror = (ev) => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          isHandsFreeRef.current = false;
          setIsHandsFreeActive(false);
          setStatus('STANDBY');
          setErrorNotice('Mic permission blocked. Allow microphone access for Hands-Free Coach.');
          return;
        }
        // Auto-recover from no-speech timeout while hands-free mode is active
        if (isHandsFreeRef.current && !isSpeakingRef.current) {
          clearResumeTimer();
          resumeTimerRef.current = window.setTimeout(() => {
            if (isHandsFreeRef.current && !isSpeakingRef.current) {
              startListeningLoopRef.current();
            }
          }, HANDS_FREE_AUTO_RESUME_MS);
        }
      };

      recognition.onend = () => {
        if (isHandsFreeRef.current && !isSpeakingRef.current) {
          clearResumeTimer();
          resumeTimerRef.current = window.setTimeout(() => {
            if (isHandsFreeRef.current && !isSpeakingRef.current) {
              startListeningLoopRef.current();
            }
          }, HANDS_FREE_AUTO_RESUME_MS);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setErrorNotice('Hindi masimulan ang Hands-Free microphone loop.');
      setStatus('STANDBY');
    }
  }, [clearResumeTimer, handleUserCommand, stopRecognitionStrict]);

  useEffect(() => {
    startListeningLoopRef.current = startListeningLoop;
  }, [startListeningLoop]);

  const startHandsFree = useCallback(() => {
    isHandsFreeRef.current = true;
    setIsHandsFreeActive(true);
    setErrorNotice(null);
    playReadyChime();
    startListeningLoop();
  }, [startListeningLoop]);

  const stopHandsFree = useCallback(() => {
    isHandsFreeRef.current = false;
    setIsHandsFreeActive(false);
    stopRecognitionStrict();
    cancelSpeechStrict();
    setStatus('STANDBY');
  }, [cancelSpeechStrict, stopRecognitionStrict]);

  /**
   * Instant Barge-In: immediately cancels AI speech mid-sentence and opens mic.
   */
  const bargeInInterrupt = useCallback(() => {
    cancelSpeechStrict();
    isHandsFreeRef.current = true;
    setIsHandsFreeActive(true);
    playReadyChime();
    startListeningLoop();
  }, [cancelSpeechStrict, startListeningLoop]);

  useEffect(() => {
    return () => {
      isHandsFreeRef.current = false;
      stopRecognitionStrict();
      cancelSpeechStrict();
    };
  }, [cancelSpeechStrict, stopRecognitionStrict]);

  return {
    isHandsFreeActive,
    status,
    memory,
    lastTranscript,
    lastTurn,
    errorNotice,
    startHandsFree,
    stopHandsFree,
    bargeInInterrupt,
    triggerQuickCommand: (phrase: string) => handleUserCommand(phrase, true),
  };
}
