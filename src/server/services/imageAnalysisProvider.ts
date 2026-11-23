import { ImageAnalysisProvider } from './imageAnalysisTypes';
import { createGeminiImageAnalysisProvider } from './geminiImageAnalysisProvider';
import { createOpenAIImageAnalysisProvider } from './openAIImageAnalysisProvider';
import { createManualImageAnalysisProvider } from './manualImageAnalysisProvider';

export function resolveImageAnalysisProviderName(): 'gemini' | 'openai' | 'manual' {
  const configured = process.env.IMAGE_ANALYSIS_PROVIDER?.trim().toLowerCase();
  if (configured === 'manual') return 'manual';
  if (configured === 'openai') return 'openai';
  if (configured === 'gemini') return 'gemini';
  if (process.env.GEMINI_API_KEY) return 'gemini';
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
