/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { ImageAnalysisProvider } from './imageAnalysisTypes';
import { createGeminiImageAnalysisProvider } from './geminiImageAnalysisProvider';
import { createOpenAIImageAnalysisProvider } from './openAIImageAnalysisProvider';
import { createManualImageAnalysisProvider } from './manualImageAnalysisProvider';
import { hasConfiguredGeminiKeys } from './geminiFreeTierRouter';

export function resolveImageAnalysisProviderName(): 'gemini' | 'openai' | 'manual' {
  const configured = process.env.IMAGE_ANALYSIS_PROVIDER?.trim().toLowerCase();
  if (configured === 'manual') return 'manual';
  if (configured === 'openai') return 'openai';
  if (configured === 'gemini') return 'gemini';
  if (hasConfiguredGeminiKeys()) return 'gemini';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'manual';
}

export function getImageAnalysisProvider(): ImageAnalysisProvider {
  const selected = resolveImageAnalysisProviderName();
  if (selected === 'openai') {
    return createOpenAIImageAnalysisProvider();
  }
  if (selected === 'gemini') {
    return createGeminiImageAnalysisProvider();
  }
  return createManualImageAnalysisProvider();
}
