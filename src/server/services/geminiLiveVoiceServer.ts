import type http from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';
import { verifyAnyAccessBearerToken } from './firebaseAuthMiddleware';
import { classifyGeminiError } from './geminiErrorClassifier';
import {
  getGeminiClientForApiKey,
  hasConfiguredGeminiKeys,
  recordRouteAttemptStart,
  recordRouteFailure,
  recordRouteSuccess,
  selectFreeTierRoutes,
} from './geminiFreeTierRouter';

const LIVE_VOICE_WS_PATH = '/api/autoelectric/live-voice-ws';
const LIVE_VOICE_MODEL = 'gemini-3.8-live';
const MAX_WS_PAYLOAD_BYTES = 128 * 1024;
const ALLOWED_VOICES = new Set(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']);

interface LiveClientInitMessage {
  type: 'init';
  token?: string;
  deviceId?: string;
  voiceName?: string;
  benchContext?: string;
}

interface LiveClientAudioMessage {
  type: 'audio';
  data?: string;
}

interface LiveClientTextMessage {
  type: 'text';
  text?: string;
}

interface LiveClientStopMessage {
  type: 'stop';
}

type LiveClientMessage =
  | LiveClientInitMessage
  | LiveClientAudioMessage
  | LiveClientTextMessage
  | LiveClientStopMessage;

function safeSendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Ignore send failure on closing socket
    }
  }
}

export interface AttachedLiveVoiceServer {
  closeAll: () => void;
}

/**
 * Attaches the bidirectional real-time Gemini 3.8 Live audio WebSocket bridge
 * on /api/autoelectric/live-voice-ws without interfering with any other upgrade handlers.
 */
export function attachGeminiLiveVoiceWebSocket(httpServer: http.Server): AttachedLiveVoiceServer {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_WS_PAYLOAD_BYTES,
  });

  const handleUpgrade = (request: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    let pathname = '';
    try {
      const parsed = new URL(request.url || '/', 'http://localhost');
      pathname = parsed.pathname;
    } catch {
      return;
    }

    if (pathname !== LIVE_VOICE_WS_PATH) {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  };

  httpServer.on('upgrade', handleUpgrade);

  wss.on('connection', (ws: WebSocket) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let initialized = false;
    let initializing = false;
    let closed = false;

    const cleanupSession = (reason?: string) => {
      if (closed) return;
      closed = true;
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // Ignore close errors
        }
        liveSession = null;
      }
      if (reason) {
        safeSendJson(ws, { type: 'closed', reason });
      }
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        try {
          ws.close();
        } catch {
          // Ignore
        }
      }
    };

    // Require init handshake within 15 seconds
    const initTimeout = setTimeout(() => {
      if (!initialized && !closed) {
        safeSendJson(ws, {
          type: 'error',
          code: 'INIT_TIMEOUT',
          message: 'Live voice session timed out waiting for authentication handshake.',
        });
        cleanupSession();
      }
    }, 15_000);

    ws.on('message', async (rawData: RawData) => {
      if (closed) return;

      let msg: LiveClientMessage;
      try {
        const text = typeof rawData === 'string' ? rawData : rawData.toString('utf8');
        msg = JSON.parse(text) as LiveClientMessage;
      } catch {
        safeSendJson(ws, {
          type: 'error',
          code: 'INVALID_JSON',
          message: 'Malformed WebSocket message payload.',
        });
        return;
      }

      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
        return;
      }

      if (msg.type === 'stop') {
        clearTimeout(initTimeout);
        cleanupSession('Session stopped by technician.');
        return;
      }

      if (msg.type === 'init') {
        if (initialized || initializing) return;
        initializing = true;
        clearTimeout(initTimeout);

        const token = typeof msg.token === 'string' ? msg.token.trim() : '';
        const deviceId = typeof msg.deviceId === 'string' ? msg.deviceId.trim() : '';

        const authResult = await verifyAnyAccessBearerToken(token, deviceId);
        if (!authResult.valid || !authResult.authUser) {
          safeSendJson(ws, {
            type: 'error',
            code: authResult.code || 'AUTH_REQUIRED',
            message:
              authResult.error ||
              'Authentication required. Sign in with Google or enter an active Trial PIN.',
          });
          cleanupSession();
          return;
        }

        if (!hasConfiguredGeminiKeys()) {
          safeSendJson(ws, {
            type: 'error',
            code: 'MISSING_API_KEY',
            message: 'Gemini API Key is not configured on the server.',
          });
          cleanupSession();
          return;
        }

        const routePlan = selectFreeTierRoutes(LIVE_VOICE_MODEL, []);
        const selectedRoute = routePlan.selected;
        if (routePlan.allInCooldown || !selectedRoute || !selectedRoute.apiKey) {
          safeSendJson(ws, {
            type: 'error',
            code: 'RATE_LIMITED',
            message: `Live voice quota is cooling down. Retry in ~${routePlan.earliestRetryAfterSec || 30}s.`,
          });
          cleanupSession();
          return;
        }

        const requestedVoice = typeof msg.voiceName === 'string' ? msg.voiceName.trim() : 'Zephyr';
        const safeVoice = ALLOWED_VOICES.has(requestedVoice) ? requestedVoice : 'Zephyr';
        const cleanBenchContext =
          typeof msg.benchContext === 'string' ? msg.benchContext.trim().slice(0, 3500) : '';

        const systemInstruction = `You are the Real-Time Hands-Free Automotive Electronics & ECU Bench Voice Assistant for AutoElectric Lab Pro.
Speak clearly, concisely, and naturally while the technician holds multimeter or oscilloscope probes.
Rules:
1. Never invent OEM ECU pin numbers, wire colors, resistance specs, or manufacturer torque/repair procedures. If a specific ECU hardware part number is unknown, state that explicitly and advise cross-checking the factory service manual.
2. Distinguish simulated bench readings from real physical measurements.
3. Keep spoken responses practical, structured, and direct (2–4 sentences unless the technician asks for deeper root-cause theory).
${cleanBenchContext ? `\nLive Bench Telemetry Context:\n${cleanBenchContext}` : ''}`;

        try {
          recordRouteAttemptStart(selectedRoute);
          const ai = getGeminiClientForApiKey(selectedRoute.apiKey);

          const session = await ai.live.connect({
            model: LIVE_VOICE_MODEL,
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: safeVoice },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction,
            },
            callbacks: {
              onopen: () => {
                if (closed) return;
                initialized = true;
                initializing = false;
                safeSendJson(ws, {
                  type: 'ready',
                  model: LIVE_VOICE_MODEL,
                  voiceName: safeVoice,
                });
              },
              onmessage: (serverMsg: LiveServerMessage) => {
                if (closed) return;

                if (serverMsg.serverContent?.interrupted) {
                  safeSendJson(ws, { type: 'interrupted' });
                }

                const inputText = serverMsg.serverContent?.inputTranscription?.text;
                if (inputText) {
                  safeSendJson(ws, { type: 'input_transcript', text: inputText });
                }

                const outputText = serverMsg.serverContent?.outputTranscription?.text;
                if (outputText) {
                  safeSendJson(ws, { type: 'output_transcript', text: outputText });
                }

                const parts = serverMsg.serverContent?.modelTurn?.parts;
                if (Array.isArray(parts)) {
                  for (const part of parts) {
                    const inlineData = part?.inlineData;
                    if (inlineData?.data) {
                      safeSendJson(ws, {
                        type: 'audio',
                        data: inlineData.data,
                        mimeType: inlineData.mimeType || 'audio/pcm;rate=24000',
                      });
                    }
                  }
                }

                if (serverMsg.serverContent?.turnComplete) {
                  safeSendJson(ws, { type: 'turn_complete' });
                }
              },
              onerror: (errEvent: unknown) => {
                if (closed) return;
                const classified = classifyGeminiError(errEvent);
                safeSendJson(ws, {
                  type: 'error',
                  code: classified.category,
                  message: classified.userMessage,
                });
              },
              onclose: () => {
                if (!closed) {
                  cleanupSession('Gemini Live voice stream closed.');
                }
              },
            },
          });

          if (closed) {
            try {
              session.close();
            } catch {
              // Ignore
            }
            return;
          }

          recordRouteSuccess(selectedRoute);
          liveSession = session;
          // Ensure ready event is sent even if onopen fired synchronously before assignment
          if (!initialized) {
            initialized = true;
            initializing = false;
            safeSendJson(ws, {
              type: 'ready',
              model: LIVE_VOICE_MODEL,
              voiceName: safeVoice,
            });
          }
        } catch (err: unknown) {
          const classified = classifyGeminiError(err);
          recordRouteFailure(selectedRoute, classified);
          safeSendJson(ws, {
            type: 'error',
            code: classified.category,
            message: classified.userMessage,
          });
          cleanupSession();
        }
        return;
      }

      if (!initialized || !liveSession) {
        return;
      }

      if (msg.type === 'audio' && typeof msg.data === 'string' && msg.data.length > 0) {
        try {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } catch (err: unknown) {
          const classified = classifyGeminiError(err);
          safeSendJson(ws, {
            type: 'error',
            code: classified.category,
            message: classified.userMessage,
          });
        }
        return;
      }

      if (msg.type === 'text' && typeof msg.text === 'string') {
        const cleanText = msg.text.trim().slice(0, 2000);
        if (!cleanText) return;
        try {
          liveSession.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: cleanText }] }],
            turnComplete: true,
          });
        } catch (err: unknown) {
          const classified = classifyGeminiError(err);
          safeSendJson(ws, {
            type: 'error',
            code: classified.category,
            message: classified.userMessage,
          });
        }
      }
    });

    ws.on('close', () => {
      clearTimeout(initTimeout);
      cleanupSession();
    });

    ws.on('error', () => {
      clearTimeout(initTimeout);
      cleanupSession();
    });
  });

  return {
    closeAll: () => {
      httpServer.off('upgrade', handleUpgrade);
      for (const client of wss.clients) {
        try {
          client.close();
        } catch {
          // Ignore
        }
      }
      try {
        wss.close();
      } catch {
        // Ignore
      }
    },
  };
}
