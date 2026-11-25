/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { playStepCompletionTone } from '../utils/audioFeedback';
import {
  buildStepCompletionSpeech,
  type ScenarioVoiceGuidanceKind,
  type StepCompletionSpeechParams,
} from '../utils/troubleScenarioVoiceCoach';

export type VoiceCommandLogSource = 'SPEECH_API' | 'QUICK_CHIP' | 'TEXT_INPUT';

export type VoiceCommandLogStatus = 'EXECUTED' | 'FALLBACK' | 'FAILED' | 'ERROR';

export interface VoiceCommandLogEntry {
  id: string;
  timestamp: number;
  source: VoiceCommandLogSource;
  rawTranscript: string;
  normalizedTranscript: string;
  confidence?: number;
  status: VoiceCommandLogStatus;
  category: string;
  actionDescription: string;
  spokenReply: string;
  scenarioPhId?: string;
  scenarioStepNumber?: number;
  guidanceKind?: ScenarioVoiceGuidanceKind;
}

export interface StepCompletionConfirmationOptions extends StepCompletionSpeechParams {
  source?: VoiceCommandLogSource;
  rawTranscript?: string;
  recordLog?: boolean;
}

export interface StepCompletionConfirmationResult {
  actionDescription: string;
  spokenReply: string;
  logEntry: VoiceCommandLogEntry | null;
  chimePlayedAt: number;
}

export type VoiceHistoryListener = (entries: VoiceCommandLogEntry[]) => void;

export interface VoiceResultMetadata {
  confidence?: number;
}

export interface VoiceAssistantState {
  isSupported: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  hasSpeechRecognition: boolean;
  hasSpeechSynthesis: boolean;
  autoSpeakReplies: boolean;
  continuousMode: boolean;
  selectedVoiceName: string | null;
  interimTranscript: string;
  lastTranscript: string;
  lastStepCompleteChimeAt: number | null;
  stepCompleteChimeCount: number;
  error: string | null;
}

export type VoiceStateListener = (state: VoiceAssistantState) => void;

export interface StartListeningOptions {
  continuous?: boolean;
  onInterim?: (interimText: string) => void;
}

interface SpeechRecognitionAlternativeLike {
  transcript?: string;
  confidence?: number;
}

interface SpeechRecognitionResultLike {
  isFinal?: boolean;
  0?: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results?: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
  message?: string;
}

interface IWindowWithSpeech extends Window {
  SpeechRecognition?: new () => any;
  webkitSpeechRecognition?: new () => any;
}

function mapRecognitionError(errorCode: string | undefined): string | null {
  switch (errorCode) {
    case 'no-speech':
      return null;
    case 'aborted':
      return null;
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission denied. Enable mic access in browser site settings.';
    case 'audio-capture':
      return 'No microphone input device detected. Connect or enable a microphone.';
    case 'network':
      return 'Browser speech service network error. Check connectivity or type a command.';
    default:
      return errorCode ? `Speech recognition notice: ${errorCode}` : 'Voice input failed.';
  }
}

/**
 * Browser Web Speech API Voice Controller
 * Built on standard W3C SpeechRecognition / webkitSpeechRecognition + SpeechSynthesis.
 * Supports push-to-talk and hands-free continuous bench commands with live interim transcripts.
 */
class OfflineVoiceAssistantService {
  private recognition: any = null;
  private synthesis: SpeechSynthesis | null = null;
  private listeners: Set<VoiceStateListener> = new Set();
  private historyListeners: Set<VoiceHistoryListener> = new Set();
  private commandHistory: VoiceCommandLogEntry[] = [];
  private readonly maxHistoryEntries = 50;
  private autoSpeak = true;
  private continuousMode = false;
  private isListening = false;
  private isSpeaking = false;
  private shouldRestartOnEnd = false;
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private interimTranscript = '';
  private lastTranscript = '';
  private lastStepCompleteChimeAt: number | null = null;
  private stepCompleteChimeCount = 0;
  private lastError: string | null = null;
  private activeResultCallback: ((spokenText: string, meta?: VoiceResultMetadata) => void) | null = null;
  private activeInterimCallback: ((interimText: string) => void) | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const win = window as unknown as IWindowWithSpeech;
      const RecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;

      if (RecognitionClass) {
        try {
          this.recognition = new RecognitionClass();
          this.recognition.continuous = false;
          this.recognition.interimResults = true;
          this.recognition.maxAlternatives = 1;
          this.recognition.lang = 'en-US';

          this.recognition.onstart = () => {
            this.isListening = true;
            this.lastError = null;
            this.interimTranscript = '';
            this.emitState();
          };

          this.recognition.onresult = (event: SpeechRecognitionEventLike) => {
            const results = event?.results;
            if (!results || results.length === 0) return;

            let interimBuffer = '';
            const finalChunks: string[] = [];
            const confidences: number[] = [];
            const startIdx = typeof event.resultIndex === 'number' ? event.resultIndex : 0;

            for (let i = startIdx; i < results.length; i += 1) {
              const item = results[i];
              const alt = item?.[0];
              const transcript = alt?.transcript;
              if (!transcript || typeof transcript !== 'string') continue;

              if (item.isFinal) {
                finalChunks.push(transcript.trim());
                if (typeof alt?.confidence === 'number' && alt.confidence > 0 && alt.confidence <= 1) {
                  confidences.push(alt.confidence);
                }
              } else {
                interimBuffer += `${transcript} `;
              }
            }

            const cleanInterim = interimBuffer.trim();
            if (cleanInterim !== this.interimTranscript) {
              this.interimTranscript = cleanInterim;
              this.activeInterimCallback?.(cleanInterim);
              this.emitState();
            }

            if (finalChunks.length > 0) {
              const finalText = finalChunks.join(' ').trim();
              if (finalText) {
                const avgConfidence =
                  confidences.length > 0
                    ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
                    : undefined;
                this.interimTranscript = '';
                this.lastTranscript = finalText;
                this.emitState();
                this.activeResultCallback?.(finalText, { confidence: avgConfidence });
              }
            }
          };

          this.recognition.onend = () => {
            this.isListening = false;
            this.interimTranscript = '';
            this.emitState();

            if (this.shouldRestartOnEnd && this.continuousMode && this.activeResultCallback) {
              this.clearRestartTimer();
              this.restartTimer = setTimeout(() => {
                if (this.shouldRestartOnEnd && this.continuousMode && !this.isSpeaking) {
                  this.safeStartRecognition();
                }
              }, 180);
            }
          };

          this.recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
            this.isListening = false;
            this.interimTranscript = '';
            const mapped = mapRecognitionError(event?.error);
            if (mapped) {
              this.lastError = mapped;
              this.addCommandLog({
                source: 'SPEECH_API',
                rawTranscript: `[SpeechRecognition: ${event?.error || 'error'}]`,
                normalizedTranscript: '',
                status: 'ERROR',
                category: 'SYSTEM',
                actionDescription: mapped,
                spokenReply: mapped,
              });
              // Permission or hardware capture errors cannot auto-recover
              if (
                event?.error === 'not-allowed' ||
                event?.error === 'service-not-allowed' ||
                event?.error === 'audio-capture'
              ) {
                this.shouldRestartOnEnd = false;
              }
            }
            this.emitState();
          };
        } catch (e) {
          console.warn('SpeechRecognition initialization error:', e);
          this.recognition = null;
        }
      }

      if ('speechSynthesis' in window) {
        this.synthesis = window.speechSynthesis;
        this.initVoice();
        if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
          window.speechSynthesis.onvoiceschanged = () => this.initVoice();
        }
      }
    }
  }

  private clearRestartTimer() {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private safeStartRecognition() {
    if (!this.recognition) return;
    try {
      this.recognition.continuous = this.continuousMode;
      this.recognition.interimResults = true;
      this.recognition.start();
    } catch (e: any) {
      if (e?.name === 'InvalidStateError') {
        try {
          this.recognition.stop();
          setTimeout(() => {
            try {
              if (this.shouldRestartOnEnd || !this.continuousMode) {
                this.recognition.continuous = this.continuousMode;
                this.recognition.interimResults = true;
                this.recognition.start();
              }
            } catch {
              // Ignore rapid double-start collisions
            }
          }, 120);
        } catch {
          // Ignore stop errors
        }
      } else {
        this.lastError = 'Unable to start browser speech recognition.';
        this.shouldRestartOnEnd = false;
        this.emitState();
      }
    }
  }

  private initVoice() {
    if (!this.synthesis) return;
    const voices = this.synthesis.getVoices();
    if (!voices || voices.length === 0) return;

    const preferred =
      voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Enhanced'))
      ) ||
      voices.find((v) => v.lang.startsWith('en') && v.default) ||
      voices.find((v) => v.lang.startsWith('en')) ||
      voices[0];

    this.selectedVoice = preferred || null;
    this.emitState();
  }

  public getState(): VoiceAssistantState {
    const hasRec = Boolean(this.recognition);
    const hasSyn = Boolean(this.synthesis);
    return {
      isSupported: hasRec || hasSyn,
      isListening: this.isListening,
      isSpeaking: this.isSpeaking,
      hasSpeechRecognition: hasRec,
      hasSpeechSynthesis: hasSyn,
      autoSpeakReplies: this.autoSpeak,
      continuousMode: this.continuousMode,
      selectedVoiceName: this.selectedVoice?.name || null,
      interimTranscript: this.interimTranscript,
      lastTranscript: this.lastTranscript,
      lastStepCompleteChimeAt: this.lastStepCompleteChimeAt,
      stepCompleteChimeCount: this.stepCompleteChimeCount,
      error: this.lastError,
    };
  }

  public subscribe(listener: VoiceStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitState() {
    const s = this.getState();
    this.listeners.forEach((fn) => fn(s));
  }

  public getCommandHistory(): VoiceCommandLogEntry[] {
    return this.commandHistory;
  }

  public subscribeHistory(listener: VoiceHistoryListener): () => void {
    this.historyListeners.add(listener);
    listener(this.commandHistory);
    return () => {
      this.historyListeners.delete(listener);
    };
  }

  private emitHistory() {
    const snapshot = [...this.commandHistory];
    this.historyListeners.forEach((fn) => fn(snapshot));
  }

  public addCommandLog(
    entry: Omit<VoiceCommandLogEntry, 'id' | 'timestamp'>
  ): VoiceCommandLogEntry {
    const record: VoiceCommandLogEntry = {
      ...entry,
      id: `vcmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };
    this.commandHistory = [record, ...this.commandHistory].slice(0, this.maxHistoryEntries);
    this.emitHistory();
    return record;
  }

  public clearCommandHistory() {
    if (this.commandHistory.length === 0) return;
    this.commandHistory = [];
    this.emitHistory();
  }

  public clearScenarioHistory(phId: string) {
    const normalized = phId.trim().toUpperCase();
    if (!normalized || this.commandHistory.length === 0) return;
    const phRegex = new RegExp(`\\b${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const next = this.commandHistory.filter((entry) => {
      if (entry.scenarioPhId) {
        return entry.scenarioPhId.trim().toUpperCase() !== normalized;
      }
      return !(
        phRegex.test(entry.actionDescription) ||
        phRegex.test(entry.spokenReply) ||
        phRegex.test(entry.rawTranscript)
      );
    });
    if (next.length === this.commandHistory.length) return;
    this.commandHistory = next;
    this.emitHistory();
  }

  /**
   * Triggers the 'Step Complete' Web Audio chime immediately when a user marks
   * a Trouble Scenario diagnostic step as finished (plays a richer completion
   * triad when all steps in the scenario are finished).
   */
  public playStepCompleteChime(allCompleted = false): number {
    playStepCompletionTone(allCompleted);
    const playedAt = Date.now();
    this.lastStepCompleteChimeAt = playedAt;
    this.stepCompleteChimeCount += 1;
    this.emitState();
    return playedAt;
  }

  /**
   * Real-time audio confirmation when a Trouble Scenario diagnostic step is marked completed:
   * triggers the 'Step Complete' audio chime, speaks concise confirmation via SpeechSynthesis,
   * and optionally records a tagged STEP_COMPLETED entry into the voice guidance transcript.
   */
  public confirmStepCompleted(
    options: StepCompletionConfirmationOptions
  ): StepCompletionConfirmationResult {
    const phId = options.phId.trim().toUpperCase();
    const safeTotal = Math.max(1, options.totalSteps);
    const safeStep = Math.max(1, Math.min(options.stepNumber, safeTotal));
    const spokenReply = buildStepCompletionSpeech({
      ...options,
      phId,
      stepNumber: safeStep,
      totalSteps: safeTotal,
    });
    const actionDescription = options.allCompleted
      ? `${phId} Step ${safeStep}/${safeTotal} Completed (All Steps Done)`
      : `${phId} Step ${safeStep}/${safeTotal} Marked Completed`;

    const chimePlayedAt = this.playStepCompleteChime(options.allCompleted);
    this.speak(spokenReply, true);

    let logEntry: VoiceCommandLogEntry | null = null;
    if (options.recordLog !== false) {
      const rawTranscript = options.rawTranscript ?? `mark ${phId} step ${safeStep} complete`;
      logEntry = this.addCommandLog({
        source: options.source ?? 'QUICK_CHIP',
        rawTranscript,
        normalizedTranscript: rawTranscript.toLowerCase(),
        status: 'EXECUTED',
        category: 'DIAGNOSTIC',
        actionDescription,
        spokenReply,
        scenarioPhId: phId,
        scenarioStepNumber: safeStep,
        guidanceKind: 'STEP_COMPLETED',
      });
    }

    return {
      actionDescription,
      spokenReply,
      logEntry,
      chimePlayedAt,
    };
  }

  public clearError() {
    if (this.lastError !== null) {
      this.lastError = null;
      this.emitState();
    }
  }

  public toggleAutoSpeak(): boolean {
    this.autoSpeak = !this.autoSpeak;
    if (!this.autoSpeak) {
      this.stopSpeaking();
    }
    this.emitState();
    return this.autoSpeak;
  }

  public setAutoSpeak(enabled: boolean) {
    this.autoSpeak = enabled;
    if (!enabled) this.stopSpeaking();
    this.emitState();
  }

  public setContinuousMode(enabled: boolean) {
    this.continuousMode = enabled;
    if (!enabled) {
      this.shouldRestartOnEnd = false;
    }
    if (this.recognition) {
      this.recognition.continuous = enabled;
    }
    this.emitState();
  }

  /**
   * Listen for user speech and invoke callback with final recognized automotive command.
   */
  public startListening(
    onResult: (spokenText: string, meta?: VoiceResultMetadata) => void,
    options?: StartListeningOptions
  ) {
    if (!this.recognition) {
      this.lastError = 'Browser SpeechRecognition API unavailable. Try Chrome, Edge, or Safari, or type a command.';
      this.emitState();
      return;
    }

    if (typeof options?.continuous === 'boolean') {
      this.continuousMode = options.continuous;
    }

    this.clearRestartTimer();
    this.stopSpeaking();
    this.lastError = null;
    this.interimTranscript = '';
    this.activeResultCallback = onResult;
    this.activeInterimCallback = options?.onInterim || null;
    this.shouldRestartOnEnd = this.continuousMode;
    this.emitState();

    this.safeStartRecognition();
  }

  public stopListening() {
    this.clearRestartTimer();
    this.shouldRestartOnEnd = false;
    this.activeResultCallback = null;
    this.activeInterimCallback = null;
    this.interimTranscript = '';

    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore stop errors when already idle
      }
    }
    this.isListening = false;
    this.emitState();
  }

  public setRecognitionLang(lang: 'TL' | 'EN') {
    if (this.recognition) {
      this.recognition.lang = lang === 'TL' ? 'tl-PH' : 'en-US';
    }
  }

  /**
   * Cleans technical markdown / bullet symbols for clear, natural speech synthesis.
   */
  public cleanTextForSpeech(rawMarkdown: string): string {
    return rawMarkdown
      .replace(/---/g, ' ')
      .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/\|/g, ' ')
      .replace(/•\s+/g, '. ')
      .replace(/-\s+/g, '. ')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/Ω/g, ' Ohms ')
      .replace(/µF/g, ' microfarads ')
      .replace(/µ/g, ' micro ')
      .replace(/KL30/g, ' K L 30 ')
      .replace(/KL15/g, ' K L 15 ')
      .replace(/KL31/g, ' K L 31 chassis ground ')
      .replace(/DTC/g, ' D T C ')
      .replace(/ECU/g, ' E C U ')
      .replace(/TPS/g, ' T P S ')
      .replace(/ECT/g, ' E C T ')
      .replace(/CAN_H/g, ' C A N high ')
      .replace(/CAN_L/g, ' C A N low ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Speak a concise automotive voice response.
   * Pauses continuous recognition while speaking so the assistant does not hear itself, then resumes if active.
   */
  public speak(text: string, force = false, queue = false) {
    if (!this.synthesis || (!this.autoSpeak && !force)) return;

    if (!queue) {
      this.stopSpeaking();
    }

    const clean = this.cleanTextForSpeech(text);
    if (!clean) return;

    const sentences = clean.split(/(?<=[.?!])\s+/).filter(Boolean);
    const spokenSlice = sentences.slice(0, 3).join(' ').slice(0, 320);

    try {
      const utterance = new SpeechSynthesisUtterance(spokenSlice);
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.emitState();
      };

      const finishSpeaking = () => {
        if (this.synthesis?.speaking || this.synthesis?.pending) {
          return;
        }
        this.isSpeaking = false;
        this.emitState();
        if (this.shouldRestartOnEnd && this.continuousMode && !this.isListening && this.activeResultCallback) {
          this.clearRestartTimer();
          this.restartTimer = setTimeout(() => {
            if (this.shouldRestartOnEnd && this.continuousMode && !this.isSpeaking) {
              this.safeStartRecognition();
            }
          }, 220);
        }
      };

      utterance.onend = finishSpeaking;
      utterance.onerror = finishSpeaking;

      this.synthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis speak error:', e);
      this.isSpeaking = false;
      this.emitState();
    }
  }

  public stopSpeaking() {
    if (this.synthesis) {
      try {
        this.synthesis.cancel();
      } catch {
        // Ignore cancel errors
      }
      this.isSpeaking = false;
      this.emitState();
    }
  }
}

export const offlineVoiceAssistant = new OfflineVoiceAssistantService();
