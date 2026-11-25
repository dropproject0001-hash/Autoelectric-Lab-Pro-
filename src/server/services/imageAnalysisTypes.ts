/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

export interface PcbNormalizedBox {
  ymin: number; // 0 - 1000 normalized top
  xmin: number; // 0 - 1000 normalized left
  ymax: number; // 0 - 1000 normalized bottom
  xmax: number; // 0 - 1000 normalized right
}

export interface ImageAnalysisPinSpec {
  pinNumber: number;
  pinName: string;
  category: 'power' | 'ground' | 'signal_in' | 'signal_out' | 'driver_out' | 'bus';
  nominalVoltage: number;
  connectedNetId: string;
  notes: string;
}

export interface ImageAnalysisHotspot {
  id: string;
  label: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  bbox: PcbNormalizedBox;
  suspectComponentRef?: string;
  notes: string;
  source: 'AI' | 'LOCAL_CV';
}

export interface ImageAnalysisResult {
  documentType: string;
  confidenceScore: number;
  detectionMethod: "AI_ANALYZED" | "MANUAL_ONLY";
  analysisSummary: string;
  components: ImageAnalysisComponent[];
  terminals: ImageAnalysisTerminal[];
  nets: ImageAnalysisNet[];
  hotspots?: ImageAnalysisHotspot[];
  warnings: string[];
  model: string;
  provider: string;
}

export interface ImageAnalysisComponent {
  refDes: string;
  category: string;
  marking: string;
  decodedValue: string;
  packageType: string;
  bbox: PcbNormalizedBox;
  confidenceScore: number;
  verificationStatus: "VERIFIED" | "CROSS_REFERENCED" | "UNVERIFIED" | "UNKNOWN";
  circuitFunction: string;
  terminalIds: string[];
  notes?: string;
  operatingVoltageRange?: string;
  maxCurrentRating?: string;
  datasheetSummary?: string;
  pinSpecs?: ImageAnalysisPinSpec[];
  source?: 'AI' | 'LOCAL_CV' | 'MANUAL';
}

export interface ImageAnalysisTerminal {
  id: string;
  componentRefDes: string;
  terminalName: string;
  bbox: PcbNormalizedBox;
  confidenceScore: number;
}

export interface ImageAnalysisNet {
  name: string;
  signalType: string;
  connectedComponentRefs: string[];
  connectedTerminalIds: string[];
  tracePoints: { x: number; y: number; }[];
  confidenceScore: number;
  verificationStatus: "VERIFIED" | "CROSS_REFERENCED" | "UNVERIFIED" | "UNKNOWN";
  isComplete: boolean;
  incompleteNotes?: string;
}

export interface ImageAnalysisProvider {
  analyzeImage(input: {
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
  }): Promise<ImageAnalysisResult>;
}

export type ImageAnalysisErrorCode =
  | 'MISSING_API_KEY'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'INVALID_RESPONSE'
  | 'UPSTREAM_ERROR';

export class ImageAnalysisProviderError extends Error {
  public readonly statusCode: number;
  public readonly provider: string;
  public readonly code: ImageAnalysisErrorCode;

  constructor(
    message: string,
    statusCode: number,
    provider: string,
    code: ImageAnalysisErrorCode
  ) {
    super(message);
    this.name = 'ImageAnalysisProviderError';
    this.statusCode = statusCode;
    this.provider = provider;
    this.code = code;
  }
}
