/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { getClientBearerToken } from './trialPinClientService';
import { getOrCreateWorkstationDeviceId } from './licenseClientService';

export type LiveVoicePersona = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';

export type LiveVoiceConnectionState =
  | 'IDLE'
  | 'CONNECTING'
  | 'LIVE'
  | 'ERROR';

export interface LiveVoiceClientCallbacks {
  onStateChange?: (state: LiveVoiceConnectionState) => void;
  onInputTranscript?: (deltaText: string) => void;
  onOutputTranscript?: (deltaText: string) => void;
  onTurnComplete?: () => void;
  onInterrupted?: () => void;
  onMicLevel?: (rms: number) => void;
  onModelSpeakingChange?: (speaking: boolean) => void;
  onError?: (message: string) => void;
  onClosed?: (reason?: string) => void;
}

const TARGET_INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

function encodeBytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const CHUNK_SIZE = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(chunks.join(''));
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Downsamples Float32 mono audio to 16kHz signed Int16 LE PCM.
 */
function downsampleFloat32ToInt16Pcm(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate = TARGET_INPUT_SAMPLE_RATE
): Int16Array {
  if (inputSampleRate === targetSampleRate) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const clamped = Math.max(-1, Math.min(1, input[i]));
      out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    return out;
  }

  const ratio = inputSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const idx0 = Math.floor(srcIndex);
    const idx1 = Math.min(input.length - 1, idx0 + 1);
    const frac = srcIndex - idx0;
    const sample = input[idx0] * (1 - frac) + input[idx1] * frac;
    const clamped = Math.max(-1, Math.min(1, sample));
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return out;
}

function resolveLiveVoiceWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/autoelectric/live-voice-ws`;
}

/**
 * Browser-side bidirectional audio client for Gemini 3.8 Live.
 * Captures 16kHz PCM from the microphone, streams over WebSocket to our backend bridge,
 * and schedules gapless 24kHz PCM audio playback with instant interruption flush.
 */
export class GeminiLiveVoiceSession {
  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private silentGainNode: GainNode | null = null;
  private activePlaybackSources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  private isMuted = false;
  private isRunning = false;
  private isServerReady = false;
  private callbacks: LiveVoiceClientCallbacks;

  constructor(callbacks: LiveVoiceClientCallbacks) {
    this.callbacks = callbacks;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public async start(options: {
    voiceName?: LiveVoicePersona;
    benchContext?: string;
  }): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isServerReady = false;
    this.callbacks.onStateChange?.('CONNECTING');

    try {
      const token = await getClientBearerToken();
      if (!token) {
        throw new Error(
          'Authentication required for Live Voice. Sign in with Google or enter an active Trial PIN.'
        );
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone audio capture is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (!this.isRunning) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      this.mediaStream = stream;

      const AudioCtxCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      const inputCtx = new AudioCtxCtor({ sampleRate: TARGET_INPUT_SAMPLE_RATE });
      const outputCtx = new AudioCtxCtor({ sampleRate: OUTPUT_SAMPLE_RATE });
      this.inputAudioCtx = inputCtx;
      this.outputAudioCtx = outputCtx;

      if (inputCtx.state === 'suspended') {
        await inputCtx.resume();
      }
      if (outputCtx.state === 'suspended') {
        await outputCtx.resume();
      }
      this.nextStartTime = outputCtx.currentTime;

      const wsUrl = resolveLiveVoiceWebSocketUrl();
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (!this.isRunning) {
          ws.close();
          return;
        }
        ws.send(
          JSON.stringify({
            type: 'init',
            token,
            deviceId: getOrCreateWorkstationDeviceId(),
            voiceName: options.voiceName || 'Zephyr',
            benchContext: options.benchContext || '',
          })
        );
      };

      ws.onmessage = (event) => {
        if (!this.isRunning) return;
        let payload: {
          type?: string;
          data?: string;
          text?: string;
          message?: string;
          reason?: string;
        };
        try {
          payload = JSON.parse(String(event.data));
        } catch {
          return;
        }

        if (payload.type === 'ready') {
          this.isServerReady = true;
          this.callbacks.onStateChange?.('LIVE');
          this.startMicrophonePump();
        } else if (payload.type === 'audio' && payload.data) {
          this.enqueueOutputPcm24k(payload.data);
        } else if (payload.type === 'input_transcript' && payload.text) {
          this.callbacks.onInputTranscript?.(payload.text);
        } else if (payload.type === 'output_transcript' && payload.text) {
          this.callbacks.onOutputTranscript?.(payload.text);
        } else if (payload.type === 'interrupted') {
          this.flushOutputAudioQueue();
          this.callbacks.onInterrupted?.();
        } else if (payload.type === 'turn_complete') {
          this.callbacks.onTurnComplete?.();
        } else if (payload.type === 'error') {
          this.callbacks.onError?.(payload.message || 'Live Voice session encountered an error.');
          this.callbacks.onStateChange?.('ERROR');
          this.stop();
        } else if (payload.type === 'closed') {
          this.callbacks.onClosed?.(payload.reason);
          this.stop();
        }
      };

      ws.onerror = () => {
        if (!this.isRunning) return;
        this.callbacks.onError?.('Unable to connect to the Live Voice WebSocket bridge.');
        this.callbacks.onStateChange?.('ERROR');
        this.stop();
      };

      ws.onclose = () => {
        if (this.isRunning) {
          this.stop();
        }
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to start Gemini 3.8 Live audio session.';
      this.callbacks.onError?.(message);
      this.callbacks.onStateChange?.('ERROR');
      this.stop();
    }
  }

  public sendTextMessage(text: string): boolean {
    const clean = text.trim();
    if (!clean || !this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isServerReady) {
      return false;
    }
    this.ws.send(JSON.stringify({ type: 'text', text: clean }));
    return true;
  }

  private startMicrophonePump(): void {
    if (!this.inputAudioCtx || !this.mediaStream || this.processorNode) return;

    const source = this.inputAudioCtx.createMediaStreamSource(this.mediaStream);
    const processor = this.inputAudioCtx.createScriptProcessor(4096, 1, 1);
    const silentGain = this.inputAudioCtx.createGain();
    silentGain.gain.value = 0;

    processor.onaudioprocess = (audioEvent) => {
      if (!this.isRunning || !this.isServerReady || this.isMuted) {
        this.callbacks.onMicLevel?.(0);
        return;
      }
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const inputFloat32 = audioEvent.inputBuffer.getChannelData(0);

      // Compute RMS mic level for visual meter
      let sumSquares = 0;
      for (let i = 0; i < inputFloat32.length; i++) {
        sumSquares += inputFloat32[i] * inputFloat32[i];
      }
      const rms = Math.sqrt(sumSquares / inputFloat32.length);
      this.callbacks.onMicLevel?.(Math.min(1, rms * 6));

      const pcm16 = downsampleFloat32ToInt16Pcm(
        inputFloat32,
        this.inputAudioCtx?.sampleRate || TARGET_INPUT_SAMPLE_RATE,
        TARGET_INPUT_SAMPLE_RATE
      );
      const base64 = encodeBytesToBase64(new Uint8Array(pcm16.buffer));
      this.ws.send(JSON.stringify({ type: 'audio', data: base64 }));
    };

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(this.inputAudioCtx.destination);

    this.sourceNode = source;
    this.processorNode = processor;
    this.silentGainNode = silentGain;
  }

  private enqueueOutputPcm24k(base64Pcm: string): void {
    const ctx = this.outputAudioCtx;
    if (!ctx || !this.isRunning) return;

    const rawBytes = decodeBase64ToBytes(base64Pcm);
    const sampleCount = Math.floor(rawBytes.byteLength / 2);
    if (sampleCount <= 0) return;

    const int16View = new Int16Array(rawBytes.buffer, rawBytes.byteOffset, sampleCount);
    const audioBuffer = ctx.createBuffer(1, sampleCount, OUTPUT_SAMPLE_RATE);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      channelData[i] = int16View[i] / 32768.0;
    }

    const bufferSource = ctx.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(ctx.destination);

    const startTime = Math.max(this.nextStartTime, ctx.currentTime + 0.01);
    bufferSource.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;

    this.activePlaybackSources.add(bufferSource);
    this.callbacks.onModelSpeakingChange?.(true);

    bufferSource.onended = () => {
      this.activePlaybackSources.delete(bufferSource);
      if (this.activePlaybackSources.size === 0) {
        this.callbacks.onModelSpeakingChange?.(false);
      }
    };
  }

  private flushOutputAudioQueue(): void {
    for (const src of this.activePlaybackSources) {
      try {
        src.stop();
      } catch {
        // Ignore already-stopped buffers
      }
    }
    this.activePlaybackSources.clear();
    if (this.outputAudioCtx) {
      this.nextStartTime = this.outputAudioCtx.currentTime;
    }
    this.callbacks.onModelSpeakingChange?.(false);
  }

  public stop(): void {
    const wasRunning = this.isRunning;
    this.isRunning = false;
    this.isServerReady = false;

    this.flushOutputAudioQueue();

    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      try {
        this.processorNode.disconnect();
      } catch {
        // Ignore
      }
      this.processorNode = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // Ignore
      }
      this.sourceNode = null;
    }
    if (this.silentGainNode) {
      try {
        this.silentGainNode.disconnect();
      } catch {
        // Ignore
      }
      this.silentGainNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    if (this.inputAudioCtx) {
      void this.inputAudioCtx.close().catch(() => {});
      this.inputAudioCtx = null;
    }

    if (this.outputAudioCtx) {
      void this.outputAudioCtx.close().catch(() => {});
      this.outputAudioCtx = null;
    }

    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'stop' }));
        }
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }

    this.callbacks.onMicLevel?.(0);
    this.callbacks.onModelSpeakingChange?.(false);
    if (wasRunning) {
      this.callbacks.onStateChange?.('IDLE');
    }
  }
}
