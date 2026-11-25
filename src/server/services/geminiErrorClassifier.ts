/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { ImageAnalysisErrorCode } from './imageAnalysisTypes';

export interface ClassifiedUpstreamError {
  statusCode: number;
  category:
    | 'INVALID_REQUEST'
    | 'UNAUTHENTICATED'
    | 'PERMISSION_DENIED'
    | 'NOT_FOUND'
    | 'RATE_LIMITED'
    | 'TIMEOUT'
    | 'UPSTREAM_ERROR';
  imageErrorCode: ImageAnalysisErrorCode;
  retryNextModel: boolean;
  retryAfterSec?: number;
  userMessage: string;
  rawMessage: string;
}

function extractRetryAfterSeconds(err: unknown, rawMessage: string): number | undefined {
  if (err && typeof err === 'object') {
    const record = err as Record<string, unknown>;
    const direct = Number(record.retryAfterSeconds ?? record.retryAfterSec);
    if (Number.isFinite(direct) && direct > 0) {
      return Math.max(1, Math.min(180, Math.ceil(direct)));
    }
  }
  const msgMatch = rawMessage.match(/retry(?:\s+after|\s+in)?\s+(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?/i);
  if (msgMatch) {
    const parsed = Number(msgMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(1, Math.min(180, Math.ceil(parsed)));
    }
  }
  return undefined;
}

function extractNumericStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const record = err as Record<string, unknown>;
  const direct = record.status ?? record.statusCode ?? record.httpStatus;
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  if (record.error && typeof record.error === 'object') {
    const nested = (record.error as Record<string, unknown>).code;
    if (typeof nested === 'number' && Number.isFinite(nested)) return nested;
  }
  return null;
}

export function classifyGeminiError(
  err: unknown,
  wasAborted = false
): ClassifiedUpstreamError {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const lower = rawMessage.toLowerCase();
  const statusFromErr = extractNumericStatus(err);
  const retryAfterSec = extractRetryAfterSeconds(err, rawMessage);

  if (
    wasAborted ||
    statusFromErr === 504 ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('aborted')
  ) {
    return {
      statusCode: 504,
      category: 'TIMEOUT',
      imageErrorCode: 'TIMEOUT',
      retryNextModel: true,
      userMessage: 'AI service timed out before completing the request. Please retry.',
      rawMessage,
    };
  }

  if (
    statusFromErr === 401 ||
    lower.includes('unauthenticated') ||
    lower.includes('api key not valid') ||
    lower.includes('invalid api key') ||
    /\b401\b/.test(rawMessage)
  ) {
    return {
      statusCode: 401,
      category: 'UNAUTHENTICATED',
      imageErrorCode: 'UPSTREAM_ERROR',
      retryNextModel: false,
      userMessage:
        'Upstream Gemini API key was rejected (401 Unauthenticated). Verify GEMINI_API_KEY configuration.',
      rawMessage,
    };
  }

  if (
    statusFromErr === 403 ||
    lower.includes('permission_denied') ||
    lower.includes('permission denied') ||
    lower.includes('api has not been used') ||
    /\b403\b/.test(rawMessage)
  ) {
    return {
      statusCode: 403,
      category: 'PERMISSION_DENIED',
      imageErrorCode: 'UPSTREAM_ERROR',
      retryNextModel: false,
      userMessage:
        'Upstream Gemini API permission denied (403). Check project API enablement and key restrictions.',
      rawMessage,
    };
  }

  if (
    statusFromErr === 400 ||
    lower.includes('invalid_argument') ||
    lower.includes('invalid argument') ||
    lower.includes('unable to process input image') ||
    /\b400\b/.test(rawMessage)
  ) {
    return {
      statusCode: 400,
      category: 'INVALID_REQUEST',
      imageErrorCode: 'UPSTREAM_ERROR',
      retryNextModel: false,
      userMessage: 'AI request rejected as invalid (400). Check input format, image encoding, or prompt length.',
      rawMessage,
    };
  }

  if (
    statusFromErr === 404 ||
    lower.includes('not_found') ||
    (lower.includes('model') && lower.includes('not found')) ||
    /\b404\b/.test(rawMessage)
  ) {
    return {
      statusCode: 404,
      category: 'NOT_FOUND',
      imageErrorCode: 'UPSTREAM_ERROR',
      retryNextModel: true,
      userMessage: 'Configured Gemini model identifier was not found or is unavailable (404).',
      rawMessage,
    };
  }

  if (
    statusFromErr === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    /\b429\b/.test(rawMessage)
  ) {
    return {
      statusCode: 429,
      category: 'RATE_LIMITED',
      imageErrorCode: 'RATE_LIMITED',
      retryNextModel: true,
      retryAfterSec,
      userMessage:
        'Upstream AI quota or rate limit exceeded (429). Wait briefly before retrying or verify API billing quota.',
      rawMessage,
    };
  }

  return {
    statusCode: 502,
    category: 'UPSTREAM_ERROR',
    imageErrorCode: 'UPSTREAM_ERROR',
    retryNextModel: true,
    userMessage: 'Upstream AI provider returned an unexpected error (502). Please retry shortly.',
    rawMessage,
  };
}
