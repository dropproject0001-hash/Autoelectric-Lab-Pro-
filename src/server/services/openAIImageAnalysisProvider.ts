/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import {
  ImageAnalysisProvider,
  ImageAnalysisProviderError,
  ImageAnalysisResult,
} from './imageAnalysisTypes';
import {
  buildPcbPromptText,
  normalizeVisionPayload,
  RawVisionPayload,
  resolveOpenAIModelName,
  resolveVisionTimeoutMs,
} from './imageAnalysisNormalizer';

export function createOpenAIImageAnalysisProvider(): ImageAnalysisProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ImageAnalysisProviderError(
      'OPENAI_API_KEY is not configured for OpenAI vision analysis.',
      503,
      'openai',
      'MISSING_API_KEY'
    );
  }

  const modelName = resolveOpenAIModelName(process.env.OPENAI_MODEL, 'gpt-4o-mini');
  const timeoutMs = resolveVisionTimeoutMs();

  return {
    async analyzeImage(input: {
      imageBase64: string;
      mimeType?: string;
      documentName: string;
      documentType: string;
      regionBox?: { ymin?: number; xmin?: number; ymax?: number; xmax?: number } | null;
    }): Promise<ImageAnalysisResult> {
      const mimeType =
        input.mimeType && input.mimeType.startsWith('image/')
          ? input.mimeType
          : 'image/jpeg';

      const isMacroCrop = Boolean(
        input.regionBox &&
          (input.regionBox.xmin !== undefined || input.regionBox.ymin !== undefined)
      );

      const promptText = `${buildPcbPromptText(input.documentName, isMacroCrop)}

Return ONLY valid JSON with keys: confidenceScore (number 0..1), analysisSummary (string), components (array of { refDes, category, marking, decodedValue, packageType, bbox: { ymin, xmin, ymax, xmax }, confidenceScore, circuitFunction, operatingVoltageRange, maxCurrentRating, datasheetSummary, terminalIds, pinSpecs: [{ pinNumber, pinName, category, nominalVoltage, connectedNetId, notes }] }), nets (array of { name, signalType, connectedComponentRefs, connectedTerminalIds, tracePoints: [{ x, y }], confidenceScore }), hotspots (array of { id, label, severity, suspectComponentRef, notes, bbox: { ymin, xmin, ymax, xmax } }), warnings (string array). Do NOT fabricate unreadable fields — use "UNREADABLE", "UNKNOWN", "NET_UNASSIGNED", or 0 when unverified.`;

      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            response_format: { type: 'json_object' },
            max_tokens: 4096,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: promptText },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mimeType};base64,${input.imageBase64}`,
                      detail: 'high',
                    },
                  },
                ],
              },
            ],
          }),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          if (res.status === 429) {
            throw new ImageAnalysisProviderError(
              'OpenAI vision rate limit or quota exceeded.',
              429,
              'openai',
              'RATE_LIMITED'
            );
          }
          console.error(
            `[OpenAIVision] Upstream HTTP ${res.status}:`,
            errBody.slice(0, 200)
          );
          throw new ImageAnalysisProviderError(
            `OpenAI vision upstream returned HTTP ${res.status}.`,
            502,
            'openai',
            'UPSTREAM_ERROR'
          );
        }

        const payload = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const rawText = (payload.choices?.[0]?.message?.content ?? '').trim();
        if (!rawText) {
          throw new ImageAnalysisProviderError(
            'OpenAI vision returned an empty response.',
            502,
            'openai',
            'INVALID_RESPONSE'
          );
        }

        const cleanedText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        let parsed: RawVisionPayload;
        try {
          parsed = JSON.parse(cleanedText) as RawVisionPayload;
        } catch {
          throw new ImageAnalysisProviderError(
            'OpenAI vision returned malformed JSON payload.',
            502,
            'openai',
            'INVALID_RESPONSE'
          );
        }

        return normalizeVisionPayload(parsed, {
          documentType: input.documentType,
          model: modelName,
          provider: 'openai',
          providerDisplayName: `OpenAI (${modelName})`,
        });
      } catch (e: unknown) {
        if (e instanceof ImageAnalysisProviderError) {
          throw e;
        }
        const msg = e instanceof Error ? e.message : String(e);
        if (controller.signal.aborted || msg.toLowerCase().includes('abort')) {
          throw new ImageAnalysisProviderError(
            `OpenAI vision timed out after ${timeoutMs}ms.`,
            504,
            'openai',
            'TIMEOUT'
          );
        }
        console.error('[OpenAIVision] Unexpected upstream error:', msg);
        throw new ImageAnalysisProviderError(
          'OpenAI vision upstream request failed. Please retry shortly.',
          502,
          'openai',
          'UPSTREAM_ERROR'
        );
      } finally {
        clearTimeout(timeoutHandle);
      }
    },
  };
}
