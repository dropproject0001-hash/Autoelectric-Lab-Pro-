import { useCallback, useEffect, useRef, useState } from 'react';
import type { LabTab } from '../components/LabTopNav';
import { getAllVerifiedKnowledgeEntries } from '../services/ai/localKnowledgeDB';
import {
  createInitialVoiceSessionMemory,
  processVoiceCoachTurn,
  type VoiceActionTarget,
  type VoiceCoachTurnResult,
  type VoiceSessionMemory,
} from '../services/ai/localVoiceBrain';
import type { VoiceModalAction } from '../services/ai/systemVoiceKnowledgeBase';
import type {
  BenchTelemetry,
  BilingualLang,
  VerifiedKnowledgeRecord,
} from '../types/aiAssistant';
import type { EcuPin } from '../types/ecu';

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
  resultIndex?: number;
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

function selectPreferredVoice(
  voices: SpeechSynthesisVoice[],
  lang: BilingualLang
): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined;
  if (lang === 'TL') {
    return (
      voices.find((v) => /^(fil|tl)(-ph)?/i.test(v.lang)) ||
      voices.find((v) => /filipino|tagalog/i.test(v.name)) ||
      voices.find((v) => /^en-ph/i.test(v.lang)) ||
      voices.find((v) => /^en-us/i.test(v.lang))
    );
  }
  return (
    voices.find((v) => /^en-us/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang))
  );
}

export function useHandsFreeVoice(params: {
  activeModuleId: string;
  activeTab?: LabTab;
  lang?: BilingualLang;
  telemetry?: Partial<BenchTelemetry>;
  pins?: EcuPin[];
  nodeVoltages?: Record<string, number>;
  onNavigateTab?: (tab: LabTab) => void;
  onOpenModal?: (modal: VoiceModalAction) => void;
}) {
  const {
    activeModuleId,
    activeTab = 'BENCH_LAB',
    lang = 'TL',
    telemetry,
    pins,
    nodeVoltages,
    onNavigateTab,
    onOpenModal,
  } = params;

  const [isHandsFreeActive, setIsHandsFreeActive] = useState(false);
  const [status, setStatus] = useState<HandsFreeVoiceStatus>('STANDBY');
  const [memory, setMemory] = useState<VoiceSessionMemory>(() =>
    createInitialVoiceSessionMemory(activeModuleId, activeTab, lang)
  );
  const [lastTranscript, setLastTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [lastTurn, setLastTurn] = useState<VoiceCoachTurnResult | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const isHandsFreeRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const ttsWatchdogRef = useRef<number | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const cachedKnowledgeRef = useRef<VerifiedKnowledgeRecord[]>([]);

  const memoryRef = useRef(memory);
  const telemetryRef = useRef(telemetry);
  const activeTabRef = useRef(activeTab);
  const langRef = useRef(lang);
  const pinsRef = useRef(pins);
  const nodeVoltagesRef = useRef(nodeVoltages);
  const onNavigateTabRef = useRef(onNavigateTab);
  const onOpenModalRef = useRef(onOpenModal);

  useEffect(() => {
    memoryRef.current = memory;
  }, [memory]);

  useEffect(() => {
    telemetryRef.current = telemetry;
  }, [telemetry]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);

  useEffect(() => {
    nodeVoltagesRef.current = nodeVoltages;
  }, [nodeVoltages]);

  useEffect(() => {
    onNavigateTabRef.current = onNavigateTab;
  }, [onNavigateTab]);

  useEffect(() => {
    onOpenModalRef.current = onOpenModal;
  }, [onOpenModal]);

  // Hydrate browser TTS voices asynchronously (Chrome loads voices on `voiceschanged`)
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const loadVoices = () => {
      try {
        voicesRef.current = window.speechSynthesis.getVoices?.() || [];
      } catch {
        voicesRef.current = [];
      }
    };
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, []);

  // Load verified local IndexedDB knowledge cache once on mount so offline voice stays fully informed
  useEffect(() => {
    let active = true;
    void getAllVerifiedKnowledgeEntries()
      .then((rows) => {
        if (active) cachedKnowledgeRef.current = rows;
      })
      .catch(() => {
        // Non-blocking fallback
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setMemory((prev) =>
      prev.activeModuleId === activeModuleId
        ? prev
        : createInitialVoiceSessionMemory(activeModuleId, activeTabRef.current, langRef.current)
    );
  }, [activeModuleId]);

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  const clearTtsWatchdog = useCallback(() => {
    if (ttsWatchdogRef.current !== null) {
      window.clearTimeout(ttsWatchdogRef.current);
      ttsWatchdogRef.current = null;
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
    clearTtsWatchdog();
    isSpeakingRef.current = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore synthesis cancel errors
      }
    }
  }, [clearTtsWatchdog]);

  const executeAction = useCallback((action: VoiceActionTarget | null | undefined) => {
    if (!action) return;
    if (action.type === 'TAB') {
      onNavigateTabRef.current?.(action.tab);
    } else if (action.type === 'MODAL') {
      onOpenModalRef.current?.(action.modal);
    }
  }, []);

  const startListeningLoopRef = useRef<() => void>(() => {});

  const speakWithEchoShield = useCallback(
    (text: string) => {
      // Strict Echo Shield: always stop microphone BEFORE speaking so AI never hears itself
      stopRecognitionStrict();
      cancelSpeechStrict();
      setInterimTranscript('');
      setStatus('NAGSASALITA');

      let resumed = false;
      const scheduleAutoResume = () => {
        if (resumed) return;
        resumed = true;
        clearTtsWatchdog();
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
        const currentLang = langRef.current;
        utterance.lang = currentLang === 'EN' ? 'en-US' : 'tl-PH';
        utterance.rate = HANDS_FREE_TTS_RATE;
        utterance.pitch = HANDS_FREE_TTS_PITCH;
        const availableVoices =
          voicesRef.current.length > 0
            ? voicesRef.current
            : window.speechSynthesis.getVoices?.() || [];
        const preferred = selectPreferredVoice(availableVoices, currentLang);
        if (preferred) {
          utterance.voice = preferred;
        }
        isSpeakingRef.current = true;
        utterance.onend = () => scheduleAutoResume();
        utterance.onerror = () => scheduleAutoResume();

        // Safety watchdog: prevents browser speechSynthesis silent-stall from locking Hands-Free mode
        const watchdogMs = Math.min(26000, Math.max(5500, text.length * 110));
        ttsWatchdogRef.current = window.setTimeout(() => {
          if (isSpeakingRef.current) {
            try {
              window.speechSynthesis.cancel();
            } catch {
              // Ignore cancel errors
            }
            scheduleAutoResume();
          }
        }, watchdogMs);

        if (window.speechSynthesis.paused) {
          try {
            window.speechSynthesis.resume();
          } catch {
            // Ignore resume errors
          }
        }
        window.speechSynthesis.speak(utterance);
      } catch {
        scheduleAutoResume();
      }
    },
    [cancelSpeechStrict, clearResumeTimer, clearTtsWatchdog, stopRecognitionStrict]
  );

  const handleUserCommand = useCallback(
    (rawTranscript: string, speakReply = true) => {
      const cleaned = rawTranscript.trim();
      if (!cleaned) return;
      setLastTranscript(cleaned);
      setInterimTranscript('');
      setStatus('CHINE_CHECK_SA_DB');

      const result = processVoiceCoachTurn({
        transcript: cleaned,
        memory: memoryRef.current,
        telemetry: telemetryRef.current,
        activeTab: activeTabRef.current,
        lang: langRef.current,
        pins: pinsRef.current,
        nodeVoltages: nodeVoltagesRef.current,
        cachedKnowledge: cachedKnowledgeRef.current,
      });

      memoryRef.current = result.updatedMemory;
      setMemory(result.updatedMemory);
      setLastTurn(result);

      // Execute voice-commanded tab/modal navigation immediately
      if (result.navigationAction) {
        executeAction(result.navigationAction);
      }

      if (speakReply) {
        speakWithEchoShield(result.spokenText);
      } else {
        setStatus(isHandsFreeRef.current ? 'NAKIKINIG' : 'STANDBY');
      }
    },
    [executeAction, speakWithEchoShield]
  );

  const startListeningLoop = useCallback(() => {
    if (!isHandsFreeRef.current || isSpeakingRef.current) return;
    stopRecognitionStrict();
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setErrorNotice(
        langRef.current === 'EN'
          ? 'Web Speech Recognition is unavailable in this browser — use the quick buttons or text box below.'
          : 'Walang Web Speech Recognition sa browser na ito — gamitin ang quick buttons o text box sa ibaba.'
      );
      setStatus('STANDBY');
      return;
    }

    try {
      const recognition = new Ctor();
      recognition.lang = langRef.current === 'EN' ? 'en-US' : 'tl-PH';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => {
        setErrorNotice(null);
        setInterimTranscript('');
        setStatus('NAKIKINIG');
      };

      recognition.onresult = (event) => {
        let finalText = '';
        let interimText = '';
        const startIdx = typeof event.resultIndex === 'number' ? event.resultIndex : 0;
        for (let i = startIdx; i < event.results.length; i++) {
          const item = event.results[i];
          const text = item?.[0]?.transcript || '';
          if (item?.isFinal) {
            finalText += text;
          } else {
            interimText += text;
          }
        }
        if (interimText.trim()) {
          setInterimTranscript(interimText.trim());
        }
        const resolvedFinal = finalText.trim();
        if (resolvedFinal) {
          stopRecognitionStrict();
          handleUserCommand(resolvedFinal, true);
        }
      };

      recognition.onerror = (ev) => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          isHandsFreeRef.current = false;
          setIsHandsFreeActive(false);
          setStatus('STANDBY');
          setErrorNotice(
            langRef.current === 'EN'
              ? 'Microphone permission blocked. Allow mic access or type below.'
              : 'Naka-block ang microphone permission. I-allow ang mic access o mag-type sa ibaba.'
          );
          return;
        }
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
      setErrorNotice(
        langRef.current === 'EN'
          ? 'Could not start Hands-Free microphone loop.'
          : 'Hindi masimulan ang Hands-Free microphone loop.'
      );
      setStatus('STANDBY');
    }
  }, [clearResumeTimer, handleUserCommand, stopRecognitionStrict]);

  useEffect(() => {
    startListeningLoopRef.current = startListeningLoop;
  }, [startListeningLoop]);

  const startHandsFree = useCallback(
    (withGreeting = true) => {
      isHandsFreeRef.current = true;
      setIsHandsFreeActive(true);
      setErrorNotice(null);
      if (withGreeting) {
        const greeting =
          langRef.current === 'EN'
            ? 'Hands-Free Coach is ready. Ask me how to use BenchLab, Pinouts, or the 3D Twin anytime.'
            : 'Handa na po ang Hands-Free Coach. Magtanong lang tungkol sa BenchLab, Pinouts, 3D Twin, o kahit anong sensor test.';
        speakWithEchoShield(greeting);
      } else {
        playReadyChime();
        startListeningLoop();
      }
    },
    [speakWithEchoShield, startListeningLoop]
  );

  const stopHandsFree = useCallback(() => {
    isHandsFreeRef.current = false;
    setIsHandsFreeActive(false);
    setInterimTranscript('');
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
    interimTranscript,
    lastTurn,
    errorNotice,
    startHandsFree,
    stopHandsFree,
    bargeInInterrupt,
    executeAction,
    triggerQuickCommand: (phrase: string) => handleUserCommand(phrase, true),
  };
}
