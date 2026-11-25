/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import {
  buildUnifiedApiHeaders,
  getClientBearerToken,
  inspectAndHandleTrialErrorPayload,
} from './trialPinClientService';
import { ImageAnalysisResult } from '../server/services/imageAnalysisTypes';

const CLIENT_VISION_TIMEOUT_MS = 32_000;

export async function analyzePcbImage(input: {
  imageBase64: string;
  mimeType?: string;
  documentName: string;
  documentType: string;
  regionBox?: {
    ymin?: number;
    xmin?: number;
    ymax?: number;
    xmax?: number;
  } | null;
}): Promise<ImageAnalysisResult> {
  const bearerToken = await getClientBearerToken();
  if (!bearerToken) {
    throw new Error(
      'Enter an active 8-digit Trial PIN or Master Admin PIN to use AI Vision analysis. Local CV component scanning remains available.'
    );
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), CLIENT_VISION_TIMEOUT_MS);

  try {
    const headers = await buildUnifiedApiHeaders({ 'Content-Type': 'application/json' });
    const response = await fetch('/api/autoelectric/analyze-schematic', {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify(input),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      inspectAndHandleTrialErrorPayload(response.status, data);
      const serverError =
        data && typeof data.error === 'string' && data.error.trim().length > 0
          ? data.error.trim()
          : response.status === 401
            ? 'Session expired or unauthorized. Enter an active 8-digit Trial PIN or Master Admin PIN.'
            : `Analysis failed (HTTP ${response.status})`;
      throw new Error(serverError);
    }

    if (!data || !data.analysis) {
      throw new Error('Malformed analysis response from server');
    }

    return data.analysis as ImageAnalysisResult;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('AI vision request timed out after 32s');
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
