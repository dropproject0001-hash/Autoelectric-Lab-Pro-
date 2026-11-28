/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

/**
 * Dedicated Web Worker for Local WebGPU / WebLLM Inference (Master Developer Instruction v1.1, Section 9).
 * Runs model loading and token generation off the main UI thread so bench instruments,
 * oscilloscopes, and MNA circuit simulation never stall.
 */

export interface WebLlmWorkerInitRequest {
  type: 'INIT_MODEL';
  requestId: string;
  modelId: string;
}

export interface WebLlmWorkerGenerateRequest {
  type: 'GENERATE';
  requestId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

export interface WebLlmWorkerUnloadRequest {
  type: 'UNLOAD';
  requestId: string;
}

export type WebLlmWorkerRequest =
  | WebLlmWorkerInitRequest
  | WebLlmWorkerGenerateRequest
  | WebLlmWorkerUnloadRequest;

export interface WebLlmWorkerResponse {
  type: 'PROGRESS' | 'READY' | 'RESULT' | 'UNLOADED' | 'ERROR';
  requestId: string;
  progress?: number;
  statusText?: string;
  text?: string;
  error?: string;
}

interface DynamicMlcEngine {
  chat: {
    completions: {
      create: (opts: {
        messages: Array<{ role: 'system' | 'user'; content: string }>;
        temperature?: number;
        max_tokens?: number;
      }) => Promise<{ choices?: Array<{ message?: { content?: string } }> }>;
    };
  };
  unload?: () => Promise<void>;
}

let activeEngine: DynamicMlcEngine | null = null;
let loadedModelId: string | null = null;

function postWorkerMessage(msg: WebLlmWorkerResponse): void {
  if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
    self.postMessage(msg);
  }
}

async function handleInitModel(req: WebLlmWorkerInitRequest): Promise<void> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    postWorkerMessage({
      type: 'ERROR',
      requestId: req.requestId,
      error: 'WebGPU API (navigator.gpu) is unavailable in this worker environment.',
    });
    return;
  }

  try {
    // Direct ESM dynamic import (no unsafe new Function / eval; @mlc-ai/web-llm is declared in package.json)
    const webllmModule = (await import('@mlc-ai/web-llm')) as unknown as {
      CreateMLCEngine?: (
        modelId: string,
        opts?: { initProgressCallback?: (report: { progress?: number; text?: string }) => void }
      ) => Promise<DynamicMlcEngine>;
    };
    if (!webllmModule?.CreateMLCEngine) {
      throw new Error('CreateMLCEngine export not available in @mlc-ai/web-llm.');
    }

    const engine = await webllmModule.CreateMLCEngine(req.modelId, {
      initProgressCallback: (report) => {
        postWorkerMessage({
          type: 'PROGRESS',
          requestId: req.requestId,
          progress: typeof report?.progress === 'number' ? report.progress : 0,
          statusText: report?.text || 'Loading local quantized model...',
        });
      },
    });

    // Detection of WebGPU is not proof inference works: execute a minimal verification turn
    const probe = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: 'Reply with OK only.' },
        { role: 'user', content: 'Self-test.' },
      ],
      temperature: 0,
      max_tokens: 8,
    });
    const probeText = probe?.choices?.[0]?.message?.content?.trim();
    if (!probeText) {
      throw new Error('WebGPU inference self-test returned an empty completion.');
    }

    activeEngine = engine;
    loadedModelId = req.modelId;
    postWorkerMessage({
      type: 'READY',
      requestId: req.requestId,
      statusText: `Loaded ${req.modelId} and passed WebGPU inference self-test.`,
    });
  } catch (err: unknown) {
    activeEngine = null;
    loadedModelId = null;
    postWorkerMessage({
      type: 'ERROR',
      requestId: req.requestId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleGenerate(req: WebLlmWorkerGenerateRequest): Promise<void> {
  if (!activeEngine || !loadedModelId) {
    postWorkerMessage({
      type: 'ERROR',
      requestId: req.requestId,
      error: 'No local WebGPU model is loaded.',
    });
    return;
  }

  try {
    const completion = await activeEngine.chat.completions.create({
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userPrompt },
      ],
      temperature: 0.1,
      max_tokens: req.maxTokens ?? 384,
    });
    const text = completion?.choices?.[0]?.message?.content?.trim() || '';
    if (!text) {
      throw new Error('Local WebLLM model returned an empty response.');
    }
    postWorkerMessage({
      type: 'RESULT',
      requestId: req.requestId,
      text,
    });
  } catch (err: unknown) {
    postWorkerMessage({
      type: 'ERROR',
      requestId: req.requestId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleUnload(req: WebLlmWorkerUnloadRequest): Promise<void> {
  try {
    if (activeEngine?.unload) {
      await activeEngine.unload();
    }
  } finally {
    activeEngine = null;
    loadedModelId = null;
    postWorkerMessage({
      type: 'UNLOADED',
      requestId: req.requestId,
    });
  }
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('message', (event: MessageEvent<WebLlmWorkerRequest>) => {
    const req = event.data;
    if (!req || typeof req !== 'object') return;
    if (req.type === 'INIT_MODEL') {
      void handleInitModel(req);
    } else if (req.type === 'GENERATE') {
      void handleGenerate(req);
    } else if (req.type === 'UNLOAD') {
      void handleUnload(req);
    }
  });
}
