/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { BilingualLang } from '../../types/aiAssistant';

/**
 * Centralized Microphone & Speech Recognition Lifecycle Manager (Phase 7D).
 *
 * Guarantees:
 * - Only ONE active speech recognition session runs at a time across the entire workstation
 *   (no duplicate sessions between UnifiedAiAssistantDrawer quick-mic and HandsFreeVoiceCoach).
 * - Reference-counted MediaStream ownership so closing the drawer releases hardware tracks cleanly.
 * - Clear, bilingual (EN / Taglish) permission and hardware error messages.
 */

export type MicSessionState = 'IDLE' | 'LISTENING' | 'SPEAKING' | 'RECORDING' | 'ERROR';

export interface StoppableRecognition {
  stop: () => void;
  abort?: () => void;
}

export interface MicLifecycleSnapshot {
  state: MicSessionState;
  activeRecognitionOwner: string | null;
  activeStreamConsumers: string[];
  lastError: string | null;
}

class CentralizedMicrophoneManager {
  private activeRecognitionOwner: string | null = null;
  private activeRecognitionHandle: StoppableRecognition | null = null;
  private sharedStream: MediaStream | null = null;
  private streamConsumers = new Set<string>();
  private state: MicSessionState = 'IDLE';
  private lastError: string | null = null;
  private listeners = new Set<(snapshot: MicLifecycleSnapshot) => void>();

  private notify(): void {
    const snap = this.getSnapshot();
    this.listeners.forEach((fn) => {
      try {
        fn(snap);
      } catch {
        // Ignore subscriber errors
      }
    });
  }

  public getSnapshot(): MicLifecycleSnapshot {
    return {
      state: this.state,
      activeRecognitionOwner: this.activeRecognitionOwner,
      activeStreamConsumers: Array.from(this.streamConsumers),
      lastError: this.lastError,
    };
  }

  public subscribe(listener: (snapshot: MicLifecycleSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Claims exclusive speech-recognition ownership for `ownerId`.
   * Any previously running recognition session from another owner is stopped cleanly first.
   */
  public claimRecognitionSession(
    ownerId: string,
    handle: StoppableRecognition
  ): { previousOwnerStopped: string | null } {
    let previousOwnerStopped: string | null = null;
    if (this.activeRecognitionHandle && this.activeRecognitionHandle !== handle) {
      previousOwnerStopped = this.activeRecognitionOwner;
      this.safeStopHandle(this.activeRecognitionHandle);
    }
    this.activeRecognitionOwner = ownerId;
    this.activeRecognitionHandle = handle;
    this.state = 'LISTENING';
    this.lastError = null;
    this.notify();
    return { previousOwnerStopped };
  }

  /**
   * Releases speech-recognition ownership for `ownerId` and stops the handle if still active.
   */
  public releaseRecognitionSession(ownerId: string): boolean {
    if (this.activeRecognitionOwner !== ownerId) {
      return false;
    }
    if (this.activeRecognitionHandle) {
      this.safeStopHandle(this.activeRecognitionHandle);
    }
    this.activeRecognitionOwner = null;
    this.activeRecognitionHandle = null;
    if (this.state === 'LISTENING') {
      this.state = this.streamConsumers.size > 0 ? 'RECORDING' : 'IDLE';
    }
    this.notify();
    return true;
  }

  /**
   * Stops ALL active recognition sessions and releases all media streams (e.g. when AI drawer closes).
   */
  public stopAllForDrawerClose(): void {
    if (this.activeRecognitionHandle) {
      this.safeStopHandle(this.activeRecognitionHandle);
    }
    this.activeRecognitionOwner = null;
    this.activeRecognitionHandle = null;
    this.releaseAllStreams();
    this.state = 'IDLE';
    this.notify();
  }

  public setSessionState(nextState: MicSessionState, error?: string | null): void {
    this.state = nextState;
    if (error !== undefined) {
      this.lastError = error;
    }
    this.notify();
  }

  /**
   * Acquires a reference-counted MediaStream via navigator.mediaDevices.getUserMedia.
   */
  public async acquireMediaStream(
    consumerId: string,
    lang: BilingualLang = 'EN'
  ): Promise<MediaStream> {
    if (
      this.sharedStream &&
      this.sharedStream.getTracks().every((t) => t.readyState === 'live')
    ) {
      this.streamConsumers.add(consumerId);
      this.state = 'RECORDING';
      this.lastError = null;
      this.notify();
      return this.sharedStream;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      const msg = formatMicrophoneError('not-supported', lang);
      this.lastError = msg;
      this.state = 'ERROR';
      this.notify();
      throw new Error(msg);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.sharedStream = stream;
      this.streamConsumers.add(consumerId);
      this.state = 'RECORDING';
      this.lastError = null;
      this.notify();
      return stream;
    } catch (err: unknown) {
      const code =
        err instanceof Error
          ? err.name || err.message
          : String(err || 'not-allowed');
      const msg = formatMicrophoneError(code, lang);
      this.lastError = msg;
      this.state = 'ERROR';
      this.notify();
      throw new Error(msg);
    }
  }

  public releaseMediaStream(consumerId: string): void {
    this.streamConsumers.delete(consumerId);
    if (this.streamConsumers.size === 0) {
      this.releaseAllStreams();
    }
    if (this.state === 'RECORDING' && this.streamConsumers.size === 0) {
      this.state = this.activeRecognitionOwner ? 'LISTENING' : 'IDLE';
    }
    this.notify();
  }

  private releaseAllStreams(): void {
    this.streamConsumers.clear();
    if (this.sharedStream) {
      try {
        this.sharedStream.getTracks().forEach((track) => track.stop());
      } catch {
        // Ignore hardware track stop errors
      }
      this.sharedStream = null;
    }
  }

  private safeStopHandle(handle: StoppableRecognition): void {
    try {
      if (typeof handle.abort === 'function') {
        handle.abort();
      } else {
        handle.stop();
      }
    } catch {
      try {
        handle.stop();
      } catch {
        // Ignore cleanup stop errors
      }
    }
  }

  public resetForTests(): void {
    this.stopAllForDrawerClose();
    this.lastError = null;
    this.listeners.clear();
  }
}

export function formatMicrophoneError(code: string, lang: BilingualLang = 'EN'): string {
  const lower = (code || '').toLowerCase();
  if (lower.includes('not-allowed') || lower.includes('notallowederror') || lower.includes('permission')) {
    return lang === 'TL'
      ? 'Naka-block ang microphone permission — i-allow ang mic sa browser settings o i-type ang tanong sa ibaba.'
      : 'Microphone permission denied — enable microphone access in browser settings or type your question below.';
  }
  if (lower.includes('audio-capture') || lower.includes('notfounderror') || lower.includes('no-mic')) {
    return lang === 'TL'
      ? 'Walang na-detect na microphone device — paki-check kung nakasaksak ang mic.'
      : 'No microphone hardware detected — verify your microphone connection.';
  }
  if (lower.includes('not-supported')) {
    return lang === 'TL'
      ? 'Hindi suportado ang microphone capture sa browser na ito — gamitin ang text input.'
      : 'Microphone capture is unavailable in this browser — use text input instead.';
  }
  return lang === 'TL'
    ? `Mic error (${code || 'blocked'}): paki-check po ang microphone permission.`
    : `Mic error (${code || 'blocked'}): verify microphone permission.`;
}

export const microphoneManager = new CentralizedMicrophoneManager();
