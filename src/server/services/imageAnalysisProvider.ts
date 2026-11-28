/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { ImageAnalysisProvider } from './imageAnalysisTypes';
import { createGeminiImageAnalysisProvider } from './geminiImageAnalysisProvider';
import { createManualImageAnalysisProvider } from './manualImageAnalysisProvider';
import { hasConfiguredGeminiKeys } from './geminiFreeTierRouter';

/**
 * Free-tier AI only (Master Developer Instruction v1.1, Section 4):
 * Paid providers (including OpenAI) are permanently disabled and cannot be selected.
 */
export function resolveImageAnalysisProviderName(): 'gemini' | 'manual' {
  const configured = process.env.IMAGE_ANALYSIS_PROVIDER?.trim().toLowerCase();
  if (configured === 'manual') return 'manual';
  if (configured === 'openai') {
    console.warn(
      '[ImageAnalysis] Paid OpenAI provider is permanently prohibited under Free-Tier AI Only policy; falling back to local manual CV review.'
    );
    return 'manual';
  }
  if (configured === 'gemini') return 'gemini';
  if (hasConfiguredGeminiKeys()) return 'gemini';
  return 'manual';
}

export function getImageAnalysisProvider(): ImageAnalysisProvider {
  const selected = resolveImageAnalysisProviderName();
  if (selected === 'gemini') {
    return createGeminiImageAnalysisProvider();
  }
  return createManualImageAnalysisProvider();
}
