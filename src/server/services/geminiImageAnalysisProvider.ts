import { GoogleGenAI, Type } from '@google/genai';
import {
  ImageAnalysisProvider,
  ImageAnalysisProviderError,
  ImageAnalysisResult,
} from './imageAnalysisTypes';
import { classifyGeminiError } from './geminiErrorClassifier';
import {
  buildPcbPromptText,
  normalizeVisionPayload,
  RawVisionPayload,
  resolveGeminiModelName,
  resolveVisionTimeoutMs,
} from './imageAnalysisNormalizer';

export function createGeminiImageAnalysisProvider(): ImageAnalysisProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ImageAnalysisProviderError(
      'GEMINI_API_KEY is not configured for Gemini vision analysis.',
      503,
      'gemini',
      'MISSING_API_KEY'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const modelName = resolveGeminiModelName(process.env.GEMINI_MODEL, 'gemini-4-hydrogen');
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

      const promptText = buildPcbPromptText(input.documentName, isMacroCrop);
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const generatePromise = ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: input.imageBase64,
                },
              },
              { text: promptText },
            ],
          },
          config: {
            abortSignal: controller.signal,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                confidenceScore: { type: Type.NUMBER },
                analysisSummary: { type: Type.STRING },
                components: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      refDes: { type: Type.STRING },
                      category: { type: Type.STRING },
                      marking: { type: Type.STRING },
                      decodedValue: { type: Type.STRING },
                      packageType: { type: Type.STRING },
                      bbox: {
                        type: Type.OBJECT,
                        properties: {
                          ymin: { type: Type.NUMBER },
                          xmin: { type: Type.NUMBER },
                          ymax: { type: Type.NUMBER },
                          xmax: { type: Type.NUMBER },
                        },
                        required: ['ymin', 'xmin', 'ymax', 'xmax'],
                      },
                      confidenceScore: { type: Type.NUMBER },
                      circuitFunction: { type: Type.STRING },
                      operatingVoltageRange: { type: Type.STRING },
                      maxCurrentRating: { type: Type.STRING },
                      datasheetSummary: { type: Type.STRING },
                      terminalIds: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      pinSpecs: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            pinNumber: { type: Type.INTEGER },
                            pinName: { type: Type.STRING },
                            category: { type: Type.STRING },
                            nominalVoltage: { type: Type.NUMBER },
                            connectedNetId: { type: Type.STRING },
                            notes: { type: Type.STRING },
                          },
                          required: ['pinNumber', 'pinName', 'connectedNetId'],
                        },
                      },
                    },
                    required: ['refDes', 'category', 'marking', 'bbox', 'circuitFunction'],
                  },
                },
                nets: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      signalType: { type: Type.STRING },
                      connectedComponentRefs: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      connectedTerminalIds: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      tracePoints: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            x: { type: Type.NUMBER },
                            y: { type: Type.NUMBER },
                          },
                          required: ['x', 'y'],
                        },
                      },
                      confidenceScore: { type: Type.NUMBER },
                    },
                    required: ['name', 'connectedComponentRefs', 'tracePoints'],
                  },
                },
                hotspots: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      label: { type: Type.STRING },
                      severity: { type: Type.STRING },
                      suspectComponentRef: { type: Type.STRING },
                      notes: { type: Type.STRING },
                      bbox: {
                        type: Type.OBJECT,
                        properties: {
                          ymin: { type: Type.NUMBER },
                          xmin: { type: Type.NUMBER },
                          ymax: { type: Type.NUMBER },
                          xmax: { type: Type.NUMBER },
                        },
                        required: ['ymin', 'xmin', 'ymax', 'xmax'],
                      },
                    },
                    required: ['label', 'severity', 'bbox', 'notes'],
                  },
                },
                warnings: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['analysisSummary', 'components', 'nets'],
            },
          },
        });

        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener(
            'abort',
            () =>
              reject(
                new ImageAnalysisProviderError(
                  `Gemini vision request timed out after ${timeoutMs}ms`,
                  504,
                  'gemini',
                  'TIMEOUT'
                )
              ),
            { once: true }
          );
        });

        const response = await Promise.race([generatePromise, timeoutPromise]);

        const rawText = (response.text ?? '').trim();
        if (!rawText) {
          throw new ImageAnalysisProviderError(
            'Gemini vision returned an empty response body.',
            502,
            'gemini',
            'INVALID_RESPONSE'
          );
        }

        const cleanedText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        let parsed: RawVisionPayload;
        try {
          parsed = JSON.parse(cleanedText) as RawVisionPayload;
        } catch {
          throw new ImageAnalysisProviderError(
            'Gemini vision returned malformed JSON payload.',
            502,
            'gemini',
            'INVALID_RESPONSE'
          );
        }

        return normalizeVisionPayload(parsed, {
          documentType: input.documentType,
          model: modelName,
          provider: 'gemini',
          providerDisplayName: modelName,
        });
      } catch (e: unknown) {
        if (e instanceof ImageAnalysisProviderError) {
          throw e;
        }
        const classified = classifyGeminiError(e, controller.signal.aborted);
        throw new ImageAnalysisProviderError(
          classified.userMessage,
          classified.statusCode,
          'gemini',
          classified.imageErrorCode
        );
      } finally {
        clearTimeout(timeoutHandle);
      }
    },
  };
}
