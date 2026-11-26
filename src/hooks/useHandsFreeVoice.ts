/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LabTab } from '../components/LabTopNav';
import { getAllVerifiedKnowledgeEntries } from '../services/ai/localKnowledgeDB';
import {
  classifyVoiceIntent,
  createInitialVoiceSessionMemory,
  processVoiceCoachTurn,
  type VoiceActionTarget,
  type VoiceCoachTurnResult,
  type VoiceSessionMemory,
} from '../services/ai/localVoiceBrain';
import {
  VOICE_CACHE_MIN_CONFIDENCE,
  clearVoiceInteractionCache,
  getVoiceInteractionCacheStats,
  isLiveTelemetryQuery,
  listRecentVoiceInteractions,
  lookupVoiceInteractionCache,
  lookupVoiceInteractionMemorySync,
  recordVoiceHistoryReplay,
  saveVoiceInteractionCache,
  subscribeVoiceInteractionCache,
  type VoiceInteractionCacheEntry,
  type VoiceInteractionCacheStats,
} from '../services/ai/voiceInteractionCache';
import type { VoiceModalAction } from '../services/ai/systemVoiceKnowledgeBase';
import { queryAiDiagnosticRouter } from '../services/ai/aiRouter';
import {
  parseThreeDVoiceCommand,
  type BenchVoiceSimulationAction,
} from '../simulation/telemetry/efiHarnessStandard';
import type {
  BenchTelemetry,
  BilingualLang,
  VerifiedKnowledgeRecord,
} from '../types/aiAssistant';
import type { EcuPin } from '../types/ecu';

export interface VoiceTurnCacheMetadata {
  servedFromCache: boolean;
  cacheHitCount: number;
  bypassedForLiveTelemetry: boolean;
  cachedAtMs?: number;
}

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
  onBenchVoiceAction?: (action: BenchVoiceSimulationAction) => void;
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
    onBenchVoiceAction,
  } = params;

  const [isHandsFreeActive, setIsHandsFreeActive] = useState(false);
  const [status, setStatus] = useState<HandsFreeVoiceStatus>('STANDBY');
  const [memory, setMemory] = useState<VoiceSessionMemory>(() =>
    createInitialVoiceSessionMemory(activeModuleId, activeTab, lang)
  );
  const [lastTranscript, setLastTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [lastTurn, setLastTurn] = useState<VoiceCoachTurnResult | null>(null);
  const [lastTurnCacheMeta, setLastTurnCacheMeta] =
    useState<VoiceTurnCacheMetadata | null>(null);
  const [recentHistory, setRecentHistory] = useState<VoiceInteractionCacheEntry[]>([]);
  const [cacheStats, setCacheStats] = useState<VoiceInteractionCacheStats>(() =>
    getVoiceInteractionCacheStats()
  );
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
  const onBenchVoiceActionRef = useRef(onBenchVoiceAction);
  const aiRequestSeqRef = useRef(0);

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

  useEffect(() => {
    onBenchVoiceActionRef.current = onBenchVoiceAction;
  }, [onBenchVoiceAction]);

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

  // Hydrate voice interaction IndexedDB history & subscribe to updates across channels
  useEffect(() => {
    let active = true;
    const refreshHistory = () => {
      void listRecentVoiceInteractions({ channel: 'VOICE_COACH', limit: 24 })
        .then((rows) => {
          if (!active) return;
          setRecentHistory(rows);
          setCacheStats(getVoiceInteractionCacheStats());
        })
        .catch(() => {
          // Non-blocking fallback
        });
    };
    refreshHistory();
    const unsub = subscribeVoiceInteractionCache(refreshHistory);
    return () => {
      active = false;
      unsub();
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
      const reqSeq = ++aiRequestSeqRef.current;
      setLastTranscript(cleaned);
      setInterimTranscript('');
      setStatus('CHINE_CHECK_SA_DB');

      const currentLang = langRef.current;

      // 0. Direct 3D EMS Twin, Sound FX, Ignition, Sync Mode & Guided Tour Voice Commands
      const benchCommand = parseThreeDVoiceCommand(cleaned);
      if (benchCommand) {
        onBenchVoiceActionRef.current?.(benchCommand.action);
        const reply =
          currentLang === 'EN' ? benchCommand.spokenReplyEN : benchCommand.spokenReplyTL;
        const prevMem = memoryRef.current;
        const updatedMemory: VoiceSessionMemory = {
          ...prevMem,
          lastIntent: 'WORKSPACE_NAVIGATION',
          lastFiveResponses: [...prevMem.lastFiveResponses.slice(-4), reply],
          activeTab: activeTabRef.current,
          lang: currentLang,
        };
        const benchTurn: VoiceCoachTurnResult = {
          intent: 'WORKSPACE_NAVIGATION',
          confidence: 0.98,
          spokenText: reply,
          displayText: reply,
          whyTip:
            currentLang === 'EN'
              ? 'Voice commands directly control the 3D EMS rig, procedural acoustics, ignition KL15, and camera focus.'
              : 'Direktang kinokontrol ng boses ang 3D EMS rig, realistic sound effects, ignition KL15, at camera view.',
          nextStepIndex: prevMem.currentStepIndex,
          matchedSource: '3D EMS Voice Controller',
          usedClarificationFallback: false,
          updatedMemory,
          navigationAction: null,
          suggestedAction: null,
          detailsBullets:
            benchCommand.action.type === 'START_GUIDED_TOUR'
              ? currentLang === 'EN'
                ? [
                    '1. Power Trunk (Red KL30 / Amber KL15) is isolated from Sensor/CAN Spine.',
                    '2. Say "Turn ignition on" and "Sound on" to hear fuel pump prime & 1-3-4-2 firing.',
                    '3. Say "Show engine block" to inspect live 3D wire-mesh fault overlays.',
                    '4. Ask any automotive diagnostic question anytime — Hybrid AI will answer aloud.',
                  ]
                : [
                    '1. Hiwalay ang Power Trunk (Red KL30 / Amber KL15) sa Sensor at CAN bus.',
                    '2. Sabihin ang "I-on ang ignition" at "Buksan ang tunog" para sa fuel pump prime at 1-3-4-2 firing.',
                    '3. Sabihin ang "Ipakita ang engine block" para makita ang live fault wire-mesh overlay.',
                    '4. Magtanong ng kahit anong automotive diagnostic question — sasagutin ito ng Hybrid AI nang malakas.',
                  ]
              : undefined,
          followUpChips:
            currentLang === 'EN'
              ? [
                  'Turn ignition on',
                  'Sound on',
                  'Show engine block',
                  'Explode ECU',
                  'Why isolate SGND?',
                ]
              : [
                  'I-on ang ignition',
                  'Buksan ang tunog',
                  'Ipakita ang engine block',
                  'Buksan ang ECU',
                  'Bakit hiwalay ang SGND?',
                ],
        };
        memoryRef.current = updatedMemory;
        setMemory(updatedMemory);
        setLastTurn(benchTurn);
        setLastTurnCacheMeta({
          servedFromCache: false,
          cacheHitCount: 0,
          bypassedForLiveTelemetry: true,
        });
        if (speakReply) {
          speakWithEchoShield(reply);
        } else {
          setStatus(isHandsFreeRef.current ? 'NAKIKINIG' : 'STANDBY');
        }
        return;
      }

      const classified = classifyVoiceIntent(cleaned, pinsRef.current);
      const isLiveBypass = isLiveTelemetryQuery(cleaned, classified.intent);

      // Fast-path: serve cached general diagnostic / guide interactions from hydrated IndexedDB cache
      if (!isLiveBypass) {
        const cachedEntry = lookupVoiceInteractionMemorySync({
          query: cleaned,
          lang: currentLang,
          channel: 'VOICE_COACH',
          intent: classified.intent,
        });

        if (cachedEntry) {
          const prevMem = memoryRef.current;
          const updatedMemory: VoiceSessionMemory = {
            ...prevMem,
            lastIntent:
              cachedEntry.intent === 'DIAGNOSTIC_QUERY'
                ? 'DTC_OR_COMPONENT_LOOKUP'
                : cachedEntry.intent,
            lastFiveResponses: [
              ...prevMem.lastFiveResponses.slice(-4),
              cachedEntry.spokenText,
            ],
            activeTab: activeTabRef.current,
            lang: currentLang,
          };

          const cachedTurn: VoiceCoachTurnResult = {
            intent:
              cachedEntry.intent === 'DIAGNOSTIC_QUERY'
                ? 'DTC_OR_COMPONENT_LOOKUP'
                : cachedEntry.intent,
            confidence: cachedEntry.confidence,
            spokenText: cachedEntry.spokenText,
            displayText: cachedEntry.displayText,
            whyTip: cachedEntry.whyTip,
            nextStepIndex: prevMem.currentStepIndex,
            matchedSource: cachedEntry.matchedSource,
            usedClarificationFallback: false,
            updatedMemory,
            navigationAction: null,
            suggestedAction: cachedEntry.suggestedAction ?? null,
            detailsBullets: cachedEntry.detailsBullets,
            followUpChips: cachedEntry.followUpChips,
          };

          memoryRef.current = updatedMemory;
          setMemory(updatedMemory);
          setLastTurn(cachedTurn);
          setLastTurnCacheMeta({
            servedFromCache: true,
            cacheHitCount: cachedEntry.hitCount + 1,
            bypassedForLiveTelemetry: false,
            cachedAtMs: cachedEntry.lastAccessedAtMs,
          });

          // Persist hitCount & LRU recency asynchronously without blocking speech
          void lookupVoiceInteractionCache({
            query: cleaned,
            lang: currentLang,
            channel: 'VOICE_COACH',
            intent: classified.intent,
          }).catch(() => {});

          if (speakReply) {
            speakWithEchoShield(cachedTurn.spokenText);
          } else {
            setStatus(isHandsFreeRef.current ? 'NAKIKINIG' : 'STANDBY');
          }
          return;
        }
      }

      const result = processVoiceCoachTurn({
        transcript: cleaned,
        memory: memoryRef.current,
        telemetry: telemetryRef.current,
        activeTab: activeTabRef.current,
        lang: currentLang,
        pins: pinsRef.current,
        nodeVoltages: nodeVoltagesRef.current,
        cachedKnowledge: cachedKnowledgeRef.current,
      });

      const needsAiIntelligence =
        !result.navigationAction &&
        cleaned.length >= 6 &&
        (result.usedClarificationFallback || result.confidence < 0.72);

      if (needsAiIntelligence) {
        const partialTel = telemetryRef.current;
        const fullTelemetry: BenchTelemetry = {
          vehicleLabel: partialTel?.vehicleLabel ?? 'Universal 4-Cyl EFI',
          ecuProfileLabel: partialTel?.ecuProfileLabel ?? 'Universal 16-Pin EFI ECU',
          psuEnabled: Boolean(partialTel?.psuEnabled),
          psuVoltageSetting: Number(partialTel?.psuVoltageSetting ?? 12.6),
          psuCurrentLimitAmps: Number(partialTel?.psuCurrentLimitAmps ?? 5),
          psuCurrentDrawAmps: Number(partialTel?.psuCurrentDrawAmps ?? 0),
          isOcpTripped: Boolean(partialTel?.isOcpTripped),
          activeDtcs: partialTel?.activeDtcs ?? [],
          activeFaults: partialTel?.activeFaults ?? [],
          selectedPin: partialTel?.selectedPin,
          dmm: partialTel?.dmm ?? {
            isPowered: true,
            mode: 'V_DC',
            displayReading: '0.00',
            unit: 'V',
            redProbeLabel: 'Unattached',
            blackProbeLabel: 'GND',
          },
          multimeterToleranceHook: partialTel?.multimeterToleranceHook,
          pcbOverlayHook: partialTel?.pcbOverlayHook,
        };

        void queryAiDiagnosticRouter({
          query: cleaned,
          lang: currentLang,
          telemetry: fullTelemetry,
          timeoutMs: 9500,
        })
          .then((aiResult) => {
            if (reqSeq !== aiRequestSeqRef.current) return;
            const prevMem = memoryRef.current;
            const rootCard = aiResult.cards.find((c) => c.stepNumber === 2);
            const verifyCard = aiResult.cards.find((c) => c.stepNumber === 3);
            const safetyCard = aiResult.cards.find((c) => c.stepNumber === 1);

            const cleanDisplay = (aiResult.conversationalSummary || result.displayText).trim();
            const spokenClean = cleanDisplay
              .replace(/[*#`_]+/g, '')
              .replace(/\s+/g, ' ')
              .slice(0, 360);
            const bullets = [rootCard?.body, verifyCard?.body]
              .map((b) => (b || '').trim())
              .filter(Boolean);

            const updatedMemory: VoiceSessionMemory = {
              ...prevMem,
              lastIntent: 'DTC_OR_COMPONENT_LOOKUP',
              lastFiveResponses: [...prevMem.lastFiveResponses.slice(-4), spokenClean],
              activeTab: activeTabRef.current,
              lang: currentLang,
            };

            const aiTurn: VoiceCoachTurnResult = {
              intent: 'DTC_OR_COMPONENT_LOOKUP',
              confidence: aiResult.confidence,
              spokenText: spokenClean,
              displayText: cleanDisplay,
              whyTip: safetyCard?.body || result.whyTip,
              nextStepIndex: prevMem.currentStepIndex,
              matchedSource: `${aiResult.tierLabel} Intelligent Voice Guide`,
              usedClarificationFallback: false,
              updatedMemory,
              navigationAction: null,
              suggestedAction: null,
              detailsBullets: bullets.length > 0 ? bullets : undefined,
              followUpChips:
                currentLang === 'EN'
                  ? [
                      'What is the bench status?',
                      'Start guided tour',
                      'Show engine block',
                      'Focus power & relays',
                    ]
                  : [
                      'Ano reading ngayon?',
                      'Simulan ang guided tour',
                      'Ipakita ang engine block',
                      'Tingnan ang power at relays',
                    ],
            };

            memoryRef.current = updatedMemory;
            setMemory(updatedMemory);
            setLastTurn(aiTurn);
            setLastTurnCacheMeta({
              servedFromCache: Boolean(aiResult.servedFromInteractionCache),
              cacheHitCount: aiResult.cacheHitCount ?? 0,
              bypassedForLiveTelemetry: isLiveBypass,
            });

            if (!isLiveBypass && aiResult.confidence >= VOICE_CACHE_MIN_CONFIDENCE) {
              void saveVoiceInteractionCache({
                channel: 'VOICE_COACH',
                lang: currentLang,
                query: cleaned,
                intent: 'DTC_OR_COMPONENT_LOOKUP',
                spokenText: aiTurn.spokenText,
                displayText: aiTurn.displayText,
                whyTip: aiTurn.whyTip,
                matchedSource: aiTurn.matchedSource,
                detailsBullets: aiTurn.detailsBullets,
                followUpChips: aiTurn.followUpChips,
                suggestedAction: null,
                sourceOrigin: 'VERIFIED_ONLINE_AI',
                confidence: aiResult.confidence,
              }).catch(() => {});
            }

            if (speakReply) {
              speakWithEchoShield(aiTurn.spokenText);
            } else {
              setStatus(isHandsFreeRef.current ? 'NAKIKINIG' : 'STANDBY');
            }
          })
          .catch(() => {
            if (reqSeq !== aiRequestSeqRef.current) return;
            memoryRef.current = result.updatedMemory;
            setMemory(result.updatedMemory);
            setLastTurn(result);
            if (speakReply) {
              speakWithEchoShield(result.spokenText);
            } else {
              setStatus(isHandsFreeRef.current ? 'NAKIKINIG' : 'STANDBY');
            }
          });
        return;
      }

      memoryRef.current = result.updatedMemory;
      setMemory(result.updatedMemory);
      setLastTurn(result);

      const bypassedLive = isLiveBypass || isLiveTelemetryQuery(cleaned, result.intent);
      setLastTurnCacheMeta({
        servedFromCache: false,
        cacheHitCount: 0,
        bypassedForLiveTelemetry: bypassedLive,
      });

      if (
        !bypassedLive &&
        !result.usedClarificationFallback &&
        result.confidence >= VOICE_CACHE_MIN_CONFIDENCE
      ) {
        void saveVoiceInteractionCache({
          channel: 'VOICE_COACH',
          lang: currentLang,
          query: cleaned,
          intent: result.intent,
          spokenText: result.spokenText,
          displayText: result.displayText,
          whyTip: result.whyTip,
          matchedSource: result.matchedSource,
          detailsBullets: result.detailsBullets,
          followUpChips: result.followUpChips,
          suggestedAction: result.suggestedAction ?? null,
          sourceOrigin: 'LOCAL_VOICE_BRAIN',
          confidence: result.confidence,
        }).catch(() => {});
      }

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

  const replayHistoryEntry = useCallback(
    (entry: VoiceInteractionCacheEntry, speakReply = true) => {
      const prevMem = memoryRef.current;
      const resolvedIntent =
        entry.intent === 'DIAGNOSTIC_QUERY'
          ? 'DTC_OR_COMPONENT_LOOKUP'
          : entry.intent;
      const updatedMemory: VoiceSessionMemory = {
        ...prevMem,
        lastIntent: resolvedIntent,
        lastFiveResponses: [...prevMem.lastFiveResponses.slice(-4), entry.spokenText],
        activeTab: activeTabRef.current,
        lang: entry.lang,
      };

      const replayedTurn: VoiceCoachTurnResult = {
        intent: resolvedIntent,
        confidence: entry.confidence,
        spokenText: entry.spokenText,
        displayText: entry.displayText,
        whyTip: entry.whyTip,
        nextStepIndex: prevMem.currentStepIndex,
        matchedSource: entry.matchedSource,
        usedClarificationFallback: false,
        updatedMemory,
        navigationAction: null,
        suggestedAction: entry.suggestedAction ?? null,
        detailsBullets: entry.detailsBullets,
        followUpChips: entry.followUpChips,
      };

      setLastTranscript(entry.query);
      setInterimTranscript('');
      memoryRef.current = updatedMemory;
      setMemory(updatedMemory);
      setLastTurn(replayedTurn);
      setLastTurnCacheMeta({
        servedFromCache: true,
        cacheHitCount: entry.hitCount + 1,
        bypassedForLiveTelemetry: false,
        cachedAtMs: entry.lastAccessedAtMs,
      });

      void recordVoiceHistoryReplay(entry.id).catch(() => {});

      if (speakReply) {
        speakWithEchoShield(entry.spokenText);
      } else {
        setStatus(isHandsFreeRef.current ? 'NAKIKINIG' : 'STANDBY');
      }
    },
    [speakWithEchoShield]
  );

  const clearHistory = useCallback(async () => {
    await clearVoiceInteractionCache();
    setRecentHistory([]);
    setCacheStats(getVoiceInteractionCacheStats());
    setLastTurnCacheMeta((prev) =>
      prev?.servedFromCache
        ? { ...prev, servedFromCache: false, cacheHitCount: 0 }
        : prev
    );
  }, []);

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
    lastTurnCacheMeta,
    recentHistory,
    cacheStats,
    errorNotice,
    startHandsFree,
    stopHandsFree,
    bargeInInterrupt,
    executeAction,
    replayHistoryEntry,
    clearHistory,
    triggerQuickCommand: (phrase: string) => handleUserCommand(phrase, true),
  };
}
