import {
  buildUnifiedApiHeaders,
  inspectAndHandleTrialErrorPayload,
} from './trialPinClientService';

export type GeminiChatRole =
  | 'DEEP_REASONING'
  | 'COMPLEX_INTERACTIVE'
  | 'GENERAL'
  | 'FAST';

export interface ChatMessageEntry {
  role: 'user' | 'model';
  text: string;
  timestamp?: number;
}

export interface ChatResponsePayload {
  status: 'SUCCESS';
  reply: string;
  model: string;
  timestamp: string;
}

export interface TranscribeAudioPayload {
  status: 'SUCCESS';
  transcription: string;
  model: string;
  timestamp: string;
}

export interface MapsGroundingPayload {
  status: 'SUCCESS';
  answer: string;
  model: string;
  timestamp: string;
}

export interface VideoAnimationPayload {
  status: 'SUCCESS';
  videoUrl: string;
  aspectRatio: '16:9' | '9:16';
  model: string;
  timestamp: string;
}

export interface ImageGenerationPayload {
  status: 'SUCCESS';
  imageUrl: string;
  model: string;
  timestamp: string;
}

async function buildAuthHeaders(): Promise<Record<string, string>> {
  return buildUnifiedApiHeaders({ 'Content-Type': 'application/json' });
}

export async function sendGeminiChat(params: {
  messages: ChatMessageEntry[];
  role?: GeminiChatRole;
  benchContext?: string;
}): Promise<ChatResponsePayload> {
  const headers = await buildAuthHeaders();
  const res = await fetch('/api/autoelectric/gemini-chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages: params.messages,
      role: params.role || 'GENERAL',
      benchContext: params.benchContext,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    inspectAndHandleTrialErrorPayload(res.status, data);
    const err = new Error(data?.error || `Gemini Chat failed (${res.status})`);
    (err as Error & { code?: string }).code = data?.code;
    throw err;
  }
  return data as ChatResponsePayload;
}

export async function transcribeAudioBlob(
  blob: Blob
): Promise<TranscribeAudioPayload> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const chunks: string[] = [];
  const CHUNK_SIZE = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE)));
  }
  const base64 = btoa(chunks.join(''));

  const headers = await buildAuthHeaders();
  const res = await fetch('/api/autoelectric/transcribe-audio', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      audioBase64: base64,
      mimeType: blob.type || 'audio/webm',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    inspectAndHandleTrialErrorPayload(res.status, data);
    const err = new Error(data?.error || `Audio transcription failed (${res.status})`);
    (err as Error & { code?: string }).code = data?.code;
    throw err;
  }
  return data as TranscribeAudioPayload;
}

export async function searchMapsGrounding(params: {
  query: string;
  location?: string;
}): Promise<MapsGroundingPayload> {
  const headers = await buildAuthHeaders();
  const res = await fetch('/api/autoelectric/grounded-maps', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    inspectAndHandleTrialErrorPayload(res.status, data);
    const err = new Error(data?.error || `Maps grounding search failed (${res.status})`);
    (err as Error & { code?: string }).code = data?.code;
    throw err;
  }
  return data as MapsGroundingPayload;
}

export async function animateImageToVideo(params: {
  imageBase64: string;
  mimeType?: string;
  prompt?: string;
  aspectRatio?: '16:9' | '9:16';
}): Promise<VideoAnimationPayload> {
  const headers = await buildAuthHeaders();
  const res = await fetch('/api/autoelectric/animate-video', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    inspectAndHandleTrialErrorPayload(res.status, data);
    const err = new Error(data?.error || `Video animation failed (${res.status})`);
    (err as Error & { code?: string }).code = data?.code;
    throw err;
  }
  return data as VideoAnimationPayload;
}

export async function generateOrEditCircuitImage(params: {
  prompt: string;
  baseImageBase64?: string;
  mimeType?: string;
  aspectRatio?: '1:1' | '16:9' | '4:3';
}): Promise<ImageGenerationPayload> {
  const headers = await buildAuthHeaders();
  const res = await fetch('/api/autoelectric/generate-image', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    inspectAndHandleTrialErrorPayload(res.status, data);
    const err = new Error(data?.error || `Image generation failed (${res.status})`);
    (err as Error & { code?: string }).code = data?.code;
    throw err;
  }
  return data as ImageGenerationPayload;
}

export async function sendLiveVoiceTurn(params: {
  speechText: string;
  benchContext?: string;
}): Promise<{ status: 'SUCCESS'; reply: string; model: string }> {
  const headers = await buildAuthHeaders();
  const res = await fetch('/api/autoelectric/live-voice', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    inspectAndHandleTrialErrorPayload(res.status, data);
    const err = new Error(data?.error || `Live voice failed (${res.status})`);
    (err as Error & { code?: string }).code = data?.code;
    throw err;
  }
  return data;
}
