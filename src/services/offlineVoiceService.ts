/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { playStepCompletionTone } from '../utils/audioFeedback';
import {
  buildStepCompletionSpeech,
  type ScenarioVoiceGuidanceKind,
  type StepCompletionSpeechParams,
} from '../utils/troubleScenarioVoiceCoach';
import {
  createInitialVoiceSessionMemory,
  type VoiceKnowledgeProvenance,
  type VoiceSessionMemory,
} from './ai/localVoiceBrain';
import {
  authorizeBenchAction,
  buildBenchActionProposalFromCommand,
  recordTechnicianRejection,
  revalidateAndExecuteBenchAction,
  type BenchActionOriginChannel,
  type BenchActionProposal,
  type BenchAuthorizationEvaluation,
  type BenchExecutionEnvironmentMode,
  type BenchSafetyStateSnapshot,
} from './benchActionAuthorizationSystem';
import type { BilingualLang } from '../types/aiAssistant';
import type { EcuPin, MultimeterState, PowerSupplyState } from '../types/ecu';

export type VoiceCommandLogSource = 'SPEECH_API' | 'QUICK_CHIP' | 'TEXT_INPUT';

export type VoiceCommandLogStatus =
  | 'EXECUTED'
  | 'PENDING_CONFIRMATION'
  | 'REJECTED_SAFETY'
  | 'FALLBACK'
  | 'FAILED'
  | 'ERROR';

export interface VoiceCommandLogEntry {
  id: string;
  timestamp: number;
  source: VoiceCommandLogSource;
  rawTranscript: string;
  normalizedTranscript: string;
  confidence?: number;
  status: VoiceCommandLogStatus;
  category: string;
  actionDescription: string;
  spokenReply: string;
  scenarioPhId?: string;
  scenarioStepNumber?: number;
  guidanceKind?: ScenarioVoiceGuidanceKind;
  provenance?: VoiceKnowledgeProvenance;
}

export interface VoiceAssistantCapabilities {
  localDiagnosticIntelligence: 'OFFLINE_READY';
  microphoneSpeechRecognition: 'BROWSER_WEB_SPEECH_ONLINE_OR_OS';
  hasSpeechRecognitionApi: boolean;
  hasSpeechSynthesisApi: boolean;
  textCommandFallback: 'ALWAYS_AVAILABLE_OFFLINE';
  onlineGeminiEnhancement: 'OPTIONAL_WHEN_ONLINE';
  usingFallbackEnglishVoiceForTaglish: boolean;
}

export type VoiceActionRiskLevel = 'LOW_RISK' | 'STATE_CHANGING' | 'REJECTED_SAFETY';

export interface PendingVoiceAction {
  id: string;
  rawCommand: string;
  actionSummary: string;
  riskReason: string;
  source: VoiceCommandLogSource;
  confidence?: number;
  createdAtMs: number;
  proposal?: BenchActionProposal;
  authorization?: BenchAuthorizationEvaluation;
  execute: () => void;
}

export interface VoiceSafetyAndRiskEvaluation {
  riskLevel: VoiceActionRiskLevel;
  decision:
    | 'EXECUTE_IMMEDIATELY'
    | 'REQUIRES_CONFIRMATION'
    | 'REJECTED_SAFETY'
    | 'CONFIRMED_PENDING'
    | 'CANCELLED_PENDING';
  authorizationDecision: 'ALLOW' | 'CONFIRM' | 'BLOCK';
  proposal: BenchActionProposal;
  authorization: BenchAuthorizationEvaluation;
  actionSummary: string;
  spokenReplyEN: string;
  spokenReplyTL: string;
  safetyReason?: string;
}

export type UnifiedExecutionPipelineStage =
  | '1_VOICE_OR_TEXT_INPUT'
  | '2_INTENT_CLASSIFICATION'
  | '3_ACTION_PROPOSAL'
  | '4_SAFETY_AUTHORIZATION'
  | '5_TECHNICIAN_CONFIRMATION'
  | '6_STATE_REVALIDATION'
  | '7_EXECUTION'
  | '8_RESULT_VERIFICATION'
  | '9_RESPONSE';

export interface UnifiedPipelineExecutionReport {
  inputCommand: string;
  classifiedIntent: string;
  proposal: BenchActionProposal;
  authorization: BenchAuthorizationEvaluation;
  stagesCompleted: UnifiedExecutionPipelineStage[];
  outcome: 'EXECUTED' | 'AWAITING_TECHNICIAN_CONFIRMATION' | 'BLOCKED_BY_SAFETY' | 'REVALIDATION_FAILED';
  spokenReplyEN: string;
  spokenReplyTL: string;
}

const VOICE_CONFIRM_REGEX =
  /^\s*(?:confirm|yes|proceed|execute|approve|do it|go ahead|oo|sige|ituloy|oo\s+ituloy|kumpirmahin|tuloy)\s*[.!]?\s*$/i;
const VOICE_CANCEL_REGEX =
  /^\s*(?:cancel|no|abort|stop|dismiss|never\s*mind|huwag|wag|kansela|ihinto|itigil)\s*[.!]?\s*$/i;

export function isVoiceConfirmationPhrase(rawText: string): boolean {
  return VOICE_CONFIRM_REGEX.test(rawText.trim());
}

export function isVoiceCancellationPhrase(rawText: string): boolean {
  return VOICE_CANCEL_REGEX.test(rawText.trim());
}

export function evaluateVoiceCommandSafetyAndRisk(params: {
  rawCommand: string;
  lang?: BilingualLang;
  powerSupply?: PowerSupplyState;
  multimeter?: MultimeterState;
  isSupplyCurrentTripped?: boolean;
  vehicleStatus?: string;
  activeBrandKey?: string;
  activeVehicleModel?: string;
  executionMode?: BenchExecutionEnvironmentMode;
  physicalHardwareAuthorized?: boolean;
  pins?: EcuPin[];
  hasPendingConfirmation?: boolean;
}): VoiceSafetyAndRiskEvaluation {
  const {
    rawCommand,
    powerSupply,
    multimeter,
    isSupplyCurrentTripped = false,
    vehicleStatus,
    activeBrandKey,
    activeVehicleModel,
    executionMode = 'SIMULATION_MODE',
    physicalHardwareAuthorized = false,
    hasPendingConfirmation = false,
  } = params;
  const cleaned = rawCommand.trim();

  const isUnverifiedStatus = Boolean(
    vehicleStatus && /UNVERIFIED|OCR_PENDING|OCR_VERIFY|PART_METADATA_ONLY|MECHANICAL_NO_ECU|BLOCKED/i.test(vehicleStatus)
  );

  const snapshot: BenchSafetyStateSnapshot = {
    environmentMode: executionMode,
    isPhysicalBridgeConnected: physicalHardwareAuthorized,
    technicianPhysicalArmConfirmed: physicalHardwareAuthorized,
    psuOutputEnabled: Boolean(powerSupply?.isOutputEnabled),
    psuVoltageSetting: powerSupply?.voltageSetting ?? 12.6,
    psuCurrentLimitAmps: powerSupply?.currentLimit ?? 2.5,
    ocpTripped: isSupplyCurrentTripped,
    dmmMode: multimeter?.mode ?? 'V_DC',
    brandKey: activeBrandKey || (isUnverifiedStatus ? 'oem-check' : 'universal-bench'),
    modelName: activeVehicleModel || (isUnverifiedStatus ? 'Unverified OEM' : 'Universal Trainer'),
    ecuStatus: isUnverifiedStatus ? 'PART_METADATA_ONLY' : (vehicleStatus || 'VERIFIED'),
    hasVerifiedPinoutMap: !isUnverifiedStatus,
  };

  const proposal = buildBenchActionProposalFromCommand({
    commandText: cleaned,
    originChannel: 'VOICE_COMMAND',
  });

  if (hasPendingConfirmation && isVoiceConfirmationPhrase(cleaned)) {
    const auth = authorizeBenchAction(proposal, snapshot);
    return {
      riskLevel: 'LOW_RISK',
      decision: 'CONFIRMED_PENDING',
      authorizationDecision: 'ALLOW',
      proposal,
      authorization: auth,
      actionSummary: 'Confirmed pending bench command',
      spokenReplyEN: 'Confirmed. Revalidating bench conditions and executing the queued command now.',
      spokenReplyTL: 'Kumpirmado. Nire-revalidate ang bench state at isinasagawa na ang naka-queue na command.',
    };
  }

  if (hasPendingConfirmation && isVoiceCancellationPhrase(cleaned)) {
    const auth = authorizeBenchAction(proposal, snapshot);
    recordTechnicianRejection(auth, cleaned);
    return {
      riskLevel: 'LOW_RISK',
      decision: 'CANCELLED_PENDING',
      authorizationDecision: 'ALLOW',
      proposal,
      authorization: auth,
      actionSummary: 'Cancelled pending bench command',
      spokenReplyEN: 'Cancelled. The queued bench command was discarded without changing bench state.',
      spokenReplyTL: 'Kinansela. Hindi itinuloy ang naka-queue na bench command.',
    };
  }

  const authorization = authorizeBenchAction(proposal, snapshot);

  if (authorization.decision === 'BLOCK') {
    return {
      riskLevel: 'REJECTED_SAFETY',
      decision: 'REJECTED_SAFETY',
      authorizationDecision: 'BLOCK',
      proposal,
      authorization,
      actionSummary: authorization.summaryEN,
      safetyReason: authorization.safetyReasonEN || authorization.summaryEN,
      spokenReplyEN: authorization.safetyReasonEN || authorization.summaryEN,
      spokenReplyTL: authorization.safetyReasonTL || authorization.summaryTL,
    };
  }

  if (authorization.decision === 'CONFIRM') {
    return {
      riskLevel: 'STATE_CHANGING',
      decision: 'REQUIRES_CONFIRMATION',
      authorizationDecision: 'CONFIRM',
      proposal,
      authorization,
      actionSummary: `Confirm bench state change: "${cleaned}"`,
      safetyReason: authorization.summaryEN,
      spokenReplyEN: `Confirmation required to execute "${cleaned}". Say "Confirm" or tap Confirm to apply this bench change, or say "Cancel".`,
      spokenReplyTL: `Kailangan ng kumpirmasyon bago isagawa ang "${cleaned}". Sabihin ang "Confirm" o "Oo" o pindutin ang Confirm button, o sabihin ang "Cancel".`,
    };
  }

  return {
    riskLevel: 'LOW_RISK',
    decision: 'EXECUTE_IMMEDIATELY',
    authorizationDecision: 'ALLOW',
    proposal,
    authorization,
    actionSummary: cleaned,
    spokenReplyEN: `Executing "${cleaned}".`,
    spokenReplyTL: `Isinasagawa ang "${cleaned}".`,
  };
}

/**
 * 9-Stage Unified Voice or Text Execution Pipeline (Section 6):
 * VOICE OR TEXT INPUT → INTENT CLASSIFICATION → ACTION PROPOSAL → SAFETY AUTHORIZATION
 * → TECHNICIAN CONFIRMATION → STATE REVALIDATION → EXECUTION → RESULT VERIFICATION → RESPONSE
 */
export function executeUnifiedVoiceOrTextPipeline(params: {
  rawInput: string;
  originChannel?: BenchActionOriginChannel;
  snapshot: BenchSafetyStateSnapshot;
  technicianConfirmed?: boolean;
  approvalTimestampMs?: number;
  approvalSnapshot?: BenchSafetyStateSnapshot;
  executeAction: () => void;
  verifyAfterExecution?: () => boolean;
}): UnifiedPipelineExecutionReport {
  const stagesCompleted: UnifiedExecutionPipelineStage[] = [
    '1_VOICE_OR_TEXT_INPUT',
    '2_INTENT_CLASSIFICATION',
  ];

  const proposal = buildBenchActionProposalFromCommand({
    commandText: params.rawInput,
    originChannel: params.originChannel || 'VOICE_COMMAND',
  });
  stagesCompleted.push('3_ACTION_PROPOSAL');

  const initialAuth = authorizeBenchAction(
    proposal,
    params.approvalSnapshot || params.snapshot,
    params.approvalTimestampMs
  );
  stagesCompleted.push('4_SAFETY_AUTHORIZATION');

  if (initialAuth.decision === 'BLOCK') {
    stagesCompleted.push('9_RESPONSE');
    return {
      inputCommand: params.rawInput,
      classifiedIntent: proposal.actionType,
      proposal,
      authorization: initialAuth,
      stagesCompleted,
      outcome: 'BLOCKED_BY_SAFETY',
      spokenReplyEN: initialAuth.safetyReasonEN || initialAuth.summaryEN,
      spokenReplyTL: initialAuth.safetyReasonTL || initialAuth.summaryTL,
    };
  }

  if (initialAuth.decision === 'CONFIRM' && !params.technicianConfirmed) {
    stagesCompleted.push('5_TECHNICIAN_CONFIRMATION', '9_RESPONSE');
    return {
      inputCommand: params.rawInput,
      classifiedIntent: proposal.actionType,
      proposal,
      authorization: initialAuth,
      stagesCompleted,
      outcome: 'AWAITING_TECHNICIAN_CONFIRMATION',
      spokenReplyEN: initialAuth.summaryEN,
      spokenReplyTL: initialAuth.summaryTL,
    };
  }

  if (initialAuth.decision === 'CONFIRM' && params.technicianConfirmed) {
    stagesCompleted.push('5_TECHNICIAN_CONFIRMATION');
  }

  stagesCompleted.push('6_STATE_REVALIDATION');
  const verification = revalidateAndExecuteBenchAction({
    evaluation: initialAuth,
    currentSnapshot: params.snapshot,
    proposal,
    technicianConfirmed: Boolean(params.technicianConfirmed),
    executeFn: params.executeAction,
    verifyResultFn: params.verifyAfterExecution ? () => params.verifyAfterExecution!() : undefined,
  });

  if (!verification.executed) {
    stagesCompleted.push('9_RESPONSE');
    return {
      inputCommand: params.rawInput,
      classifiedIntent: proposal.actionType,
      proposal,
      authorization: initialAuth,
      stagesCompleted,
      outcome: !verification.revalidationPassed ? 'REVALIDATION_FAILED' : 'BLOCKED_BY_SAFETY',
      spokenReplyEN: verification.failureReasonEN || initialAuth.summaryEN,
      spokenReplyTL: verification.failureReasonTL || initialAuth.summaryTL,
    };
  }

  stagesCompleted.push('7_EXECUTION', '8_RESULT_VERIFICATION', '9_RESPONSE');

  return {
    inputCommand: params.rawInput,
    classifiedIntent: proposal.actionType,
    proposal,
    authorization: initialAuth,
    stagesCompleted,
    outcome: 'EXECUTED',
    spokenReplyEN: `Executed and verified "${params.rawInput}".`,
    spokenReplyTL: `Naisagawa at na-verify ang "${params.rawInput}".`,
  };
}

/**
 * Authorizes every single step of a voice macro through the centralized Bench Action Authorization System (Section 6).
 */
export function authorizeVoiceMacroSteps(params: {
  macroName: string;
  steps: ReadonlyArray<string | { command: string; delayMs?: number }>;
  snapshot: BenchSafetyStateSnapshot;
  technicianConfirmedMacro?: boolean;
}): {
  overallDecision: 'ALLOW' | 'CONFIRM' | 'BLOCK';
  stepReports: Array<{
    stepIndex: number;
    command: string;
    proposal: BenchActionProposal;
    authorization: BenchAuthorizationEvaluation;
  }>;
  blockedStepIndex?: number;
  blockedReasonEN?: string;
} {
  const stepReports: Array<{
    stepIndex: number;
    command: string;
    proposal: BenchActionProposal;
    authorization: BenchAuthorizationEvaluation;
  }> = [];

  let requiresConfirm = false;

  for (let idx = 0; idx < params.steps.length; idx++) {
    const rawStep = params.steps[idx];
    const stepCommand = typeof rawStep === 'string' ? rawStep : rawStep.command;
    const proposal = buildBenchActionProposalFromCommand({
      commandText: stepCommand,
      originChannel: 'VOICE_MACRO',
      isMacroStep: true,
      macroName: params.macroName,
      macroStepIndex: idx,
    });
    const authorization = authorizeBenchAction(proposal, params.snapshot);
    stepReports.push({
      stepIndex: idx,
      command: stepCommand,
      proposal,
      authorization,
    });

    if (authorization.decision === 'BLOCK') {
      return {
        overallDecision: 'BLOCK',
        stepReports,
        blockedStepIndex: idx,
        blockedReasonEN: `Macro "${params.macroName}" blocked at Step ${idx + 1} ("${stepCommand}"): ${authorization.safetyReasonEN || authorization.summaryEN}`,
      };
    }

    if (authorization.decision === 'CONFIRM') {
      requiresConfirm = true;
    }
  }

  if (requiresConfirm && !params.technicianConfirmedMacro) {
    return {
      overallDecision: 'CONFIRM',
      stepReports,
    };
  }

  return {
    overallDecision: 'ALLOW',
    stepReports,
  };
}

export interface StepCompletionConfirmationOptions extends StepCompletionSpeechParams {
  source?: VoiceCommandLogSource;
  rawTranscript?: string;
  recordLog?: boolean;
}

export interface StepCompletionConfirmationResult {
  actionDescription: string;
  spokenReply: string;
  logEntry: VoiceCommandLogEntry | null;
  chimePlayedAt: number;
}

export type VoiceHistoryListener = (entries: VoiceCommandLogEntry[]) => void;

export interface VoiceResultMetadata {
  confidence?: number;
}

export interface VoiceAssistantState {
  isSupported: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  hasSpeechRecognition: boolean;
  hasSpeechSynthesis: boolean;
  autoSpeakReplies: boolean;
  continuousMode: boolean;
  language: BilingualLang;
  usingFallbackEnglishVoiceForTaglish: boolean;
  selectedVoiceName: string | null;
  interimTranscript: string;
  lastTranscript: string;
  lastStepCompleteChimeAt: number | null;
  stepCompleteChimeCount: number;
  pendingAction: PendingVoiceAction | null;
  error: string | null;
}

export type VoiceStateListener = (state: VoiceAssistantState) => void;

export interface StartListeningOptions {
  continuous?: boolean;
  onInterim?: (interimText: string) => void;
}

interface SpeechRecognitionAlternativeLike {
  transcript?: string;
  confidence?: number;
}

interface SpeechRecognitionResultLike {
  isFinal?: boolean;
  0?: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results?: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
  message?: string;
}

interface IWindowWithSpeech extends Window {
  SpeechRecognition?: new () => any;
  webkitSpeechRecognition?: new () => any;
}

function mapRecognitionError(errorCode: string | undefined): string | null {
  switch (errorCode) {
    case 'no-speech':
      return null;
    case 'aborted':
      return null;
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission denied. Enable mic access in browser site settings.';
    case 'audio-capture':
      return 'No microphone input device detected. Connect or enable a microphone.';
    case 'network':
      return 'Browser speech service network error. Check connectivity or type a command.';
    default:
      return errorCode ? `Speech recognition notice: ${errorCode}` : 'Voice input failed.';
  }
}

/**
 * Unified Browser Web Speech API & Local Diagnostic Voice Orchestrator
 * Synchronizes bilingual language preference (EN / Taglish TL), conversational session memory,
 * pending state-changing command confirmation, and honest offline capability reporting across
 * FloatingLabNavigator and HandsFreeVoiceCoach.
 */
class OfflineVoiceAssistantService {
  private recognition: any = null;
  private synthesis: SpeechSynthesis | null = null;
  private listeners: Set<VoiceStateListener> = new Set();
  private historyListeners: Set<VoiceHistoryListener> = new Set();
  private commandHistory: VoiceCommandLogEntry[] = [];
  private readonly maxHistoryEntries = 50;
  private autoSpeak = true;
  private continuousMode = false;
  private language: BilingualLang = 'TL';
  private usingFallbackEnglishVoiceForTaglish = false;
  private sessionMemory: VoiceSessionMemory = createInitialVoiceSessionMemory(
    'MOD1_7805_5V_REG',
    'BENCH_LAB',
    'TL'
  );
  private pendingAction: PendingVoiceAction | null = null;
  private isListening = false;
  private isSpeaking = false;
  private shouldRestartOnEnd = false;
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private interimTranscript = '';
  private lastTranscript = '';
  private lastStepCompleteChimeAt: number | null = null;
  private stepCompleteChimeCount = 0;
  private lastError: string | null = null;
  private activeResultCallback: ((spokenText: string, meta?: VoiceResultMetadata) => void) | null = null;
  private activeInterimCallback: ((interimText: string) => void) | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const win = window as unknown as IWindowWithSpeech;
      const RecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;

      if (RecognitionClass) {
        try {
          this.recognition = new RecognitionClass();
          this.recognition.continuous = false;
          this.recognition.interimResults = true;
          this.recognition.maxAlternatives = 1;
          this.recognition.lang = 'en-US';

          this.recognition.onstart = () => {
            this.isListening = true;
            this.lastError = null;
            this.interimTranscript = '';
            this.emitState();
          };

          this.recognition.onresult = (event: SpeechRecognitionEventLike) => {
            const results = event?.results;
            if (!results || results.length === 0) return;

            let interimBuffer = '';
            const finalChunks: string[] = [];
            const confidences: number[] = [];
            const startIdx = typeof event.resultIndex === 'number' ? event.resultIndex : 0;

            for (let i = startIdx; i < results.length; i += 1) {
              const item = results[i];
              const alt = item?.[0];
              const transcript = alt?.transcript;
              if (!transcript || typeof transcript !== 'string') continue;

              if (item.isFinal) {
                finalChunks.push(transcript.trim());
                if (typeof alt?.confidence === 'number' && alt.confidence > 0 && alt.confidence <= 1) {
                  confidences.push(alt.confidence);
                }
              } else {
                interimBuffer += `${transcript} `;
              }
            }

            const cleanInterim = interimBuffer.trim();
            if (cleanInterim !== this.interimTranscript) {
              this.interimTranscript = cleanInterim;
              this.activeInterimCallback?.(cleanInterim);
              this.emitState();
            }

            if (finalChunks.length > 0) {
              const finalText = finalChunks.join(' ').trim();
              if (finalText) {
                const avgConfidence =
                  confidences.length > 0
                    ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
                    : undefined;
                this.interimTranscript = '';
                this.lastTranscript = finalText;
                this.emitState();
                this.activeResultCallback?.(finalText, { confidence: avgConfidence });
              }
            }
          };

          this.recognition.onend = () => {
            this.isListening = false;
            this.interimTranscript = '';
            this.emitState();

            if (this.shouldRestartOnEnd && this.continuousMode && this.activeResultCallback) {
              this.clearRestartTimer();
              this.restartTimer = setTimeout(() => {
                if (this.shouldRestartOnEnd && this.continuousMode && !this.isSpeaking) {
                  this.safeStartRecognition();
                }
              }, 180);
            }
          };

          this.recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
            this.isListening = false;
            this.interimTranscript = '';
            const mapped = mapRecognitionError(event?.error);
            if (mapped) {
              this.lastError = mapped;
              this.addCommandLog({
                source: 'SPEECH_API',
                rawTranscript: `[SpeechRecognition: ${event?.error || 'error'}]`,
                normalizedTranscript: '',
                status: 'ERROR',
                category: 'SYSTEM',
                actionDescription: mapped,
                spokenReply: mapped,
              });
              // Permission or hardware capture errors cannot auto-recover
              if (
                event?.error === 'not-allowed' ||
                event?.error === 'service-not-allowed' ||
                event?.error === 'audio-capture'
              ) {
                this.shouldRestartOnEnd = false;
              }
            }
            this.emitState();
          };
        } catch (e) {
          console.warn('SpeechRecognition initialization error:', e);
          this.recognition = null;
        }
      }

      if ('speechSynthesis' in window) {
        this.synthesis = window.speechSynthesis;
        this.initVoice();
        if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
          window.speechSynthesis.onvoiceschanged = () => this.initVoice();
        }
      }
    }
  }

  private clearRestartTimer() {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private safeStartRecognition() {
    if (!this.recognition) return;
    try {
      this.recognition.continuous = this.continuousMode;
      this.recognition.interimResults = true;
      this.recognition.start();
    } catch (e: any) {
      if (e?.name === 'InvalidStateError') {
        try {
          this.recognition.stop();
          setTimeout(() => {
            try {
              if (this.shouldRestartOnEnd || !this.continuousMode) {
                this.recognition.continuous = this.continuousMode;
                this.recognition.interimResults = true;
                this.recognition.start();
              }
            } catch {
              // Ignore rapid double-start collisions
            }
          }, 120);
        } catch {
          // Ignore stop errors
        }
      } else {
        this.lastError = 'Unable to start browser speech recognition.';
        this.shouldRestartOnEnd = false;
        this.emitState();
      }
    }
  }

  private initVoice() {
    if (!this.synthesis) return;
    const voices = this.synthesis.getVoices();
    if (!voices || voices.length === 0) return;

    if (this.language === 'TL') {
      const nativeFilipino =
        voices.find((v) => /^(fil|tl)(-ph)?/i.test(v.lang)) ||
        voices.find((v) => /filipino|tagalog/i.test(v.name));
      if (nativeFilipino) {
        this.selectedVoice = nativeFilipino;
        this.usingFallbackEnglishVoiceForTaglish = false;
      } else {
        const fallbackEn =
          voices.find((v) => /^en-ph/i.test(v.lang)) ||
          voices.find(
            (v) =>
              v.lang.startsWith('en') &&
              (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Enhanced'))
          ) ||
          voices.find((v) => v.lang.startsWith('en') && v.default) ||
          voices.find((v) => v.lang.startsWith('en')) ||
          voices[0];
        this.selectedVoice = fallbackEn || null;
        this.usingFallbackEnglishVoiceForTaglish = true;
      }
    } else {
      const preferredEn =
        voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Enhanced'))
        ) ||
        voices.find((v) => v.lang.startsWith('en') && v.default) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        voices[0];
      this.selectedVoice = preferredEn || null;
      this.usingFallbackEnglishVoiceForTaglish = false;
    }

    this.emitState();
  }

  public getCapabilities(): VoiceAssistantCapabilities {
    return {
      localDiagnosticIntelligence: 'OFFLINE_READY',
      microphoneSpeechRecognition: 'BROWSER_WEB_SPEECH_ONLINE_OR_OS',
      hasSpeechRecognitionApi: Boolean(this.recognition),
      hasSpeechSynthesisApi: Boolean(this.synthesis),
      textCommandFallback: 'ALWAYS_AVAILABLE_OFFLINE',
      onlineGeminiEnhancement: 'OPTIONAL_WHEN_ONLINE',
      usingFallbackEnglishVoiceForTaglish: this.usingFallbackEnglishVoiceForTaglish,
    };
  }

  public getLanguage(): BilingualLang {
    return this.language;
  }

  public setLanguage(lang: BilingualLang) {
    this.language = lang;
    this.sessionMemory = {
      ...this.sessionMemory,
      lang,
    };
    if (this.recognition) {
      this.recognition.lang = lang === 'TL' ? 'tl-PH' : 'en-US';
    }
    this.initVoice();
    this.emitState();
  }

  public getSessionMemory(): VoiceSessionMemory {
    return this.sessionMemory;
  }

  public setSessionMemory(nextMemory: VoiceSessionMemory) {
    this.sessionMemory = nextMemory;
    if (nextMemory.lang && nextMemory.lang !== this.language) {
      this.language = nextMemory.lang;
      if (this.recognition) {
        this.recognition.lang = this.language === 'TL' ? 'tl-PH' : 'en-US';
      }
      this.initVoice();
    }
    this.emitState();
  }

  public resetSessionMemory(activeModuleId = 'MOD1_7805_5V_REG', activeTab: VoiceSessionMemory['activeTab'] = 'BENCH_LAB') {
    this.sessionMemory = createInitialVoiceSessionMemory(activeModuleId, activeTab, this.language);
    this.pendingAction = null;
    this.emitState();
    return this.sessionMemory;
  }

  public getPendingAction(): PendingVoiceAction | null {
    return this.pendingAction;
  }

  public setPendingAction(pending: PendingVoiceAction | null) {
    this.pendingAction = pending;
    this.sessionMemory = {
      ...this.sessionMemory,
      pendingConfirmation: pending
        ? {
            id: pending.id,
            commandQuery: pending.rawCommand,
            category: 'STATE_CHANGING',
            summaryEN: pending.actionSummary,
            summaryTL: pending.actionSummary,
            createdAt: pending.createdAtMs,
          }
        : null,
    };
    this.emitState();
  }

  public confirmPendingAction(): PendingVoiceAction | null {
    const current = this.pendingAction;
    if (!current) return null;
    this.pendingAction = null;
    this.sessionMemory = {
      ...this.sessionMemory,
      lastExecutedCommand: current.rawCommand,
      pendingConfirmation: null,
    };
    try {
      current.execute();
    } finally {
      this.emitState();
    }
    return current;
  }

  public cancelPendingAction(): PendingVoiceAction | null {
    const current = this.pendingAction;
    if (!current) return null;
    this.pendingAction = null;
    this.sessionMemory = {
      ...this.sessionMemory,
      pendingConfirmation: null,
    };
    this.emitState();
    return current;
  }

  public getState(): VoiceAssistantState {
    const hasRec = Boolean(this.recognition);
    const hasSyn = Boolean(this.synthesis);
    return {
      isSupported: hasRec || hasSyn,
      isListening: this.isListening,
      isSpeaking: this.isSpeaking,
      hasSpeechRecognition: hasRec,
      hasSpeechSynthesis: hasSyn,
      autoSpeakReplies: this.autoSpeak,
      continuousMode: this.continuousMode,
      language: this.language,
      usingFallbackEnglishVoiceForTaglish: this.usingFallbackEnglishVoiceForTaglish,
      selectedVoiceName: this.selectedVoice?.name || null,
      interimTranscript: this.interimTranscript,
      lastTranscript: this.lastTranscript,
      lastStepCompleteChimeAt: this.lastStepCompleteChimeAt,
      stepCompleteChimeCount: this.stepCompleteChimeCount,
      pendingAction: this.pendingAction,
      error: this.lastError,
    };
  }

  public subscribe(listener: VoiceStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitState() {
    const s = this.getState();
    this.listeners.forEach((fn) => fn(s));
  }

  public getCommandHistory(): VoiceCommandLogEntry[] {
    return this.commandHistory;
  }

  public subscribeHistory(listener: VoiceHistoryListener): () => void {
    this.historyListeners.add(listener);
    listener(this.commandHistory);
    return () => {
      this.historyListeners.delete(listener);
    };
  }

  private emitHistory() {
    const snapshot = [...this.commandHistory];
    this.historyListeners.forEach((fn) => fn(snapshot));
  }

  public addCommandLog(
    entry: Omit<VoiceCommandLogEntry, 'id' | 'timestamp'>
  ): VoiceCommandLogEntry {
    const record: VoiceCommandLogEntry = {
      ...entry,
      id: `vcmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };
    this.commandHistory = [record, ...this.commandHistory].slice(0, this.maxHistoryEntries);
    this.emitHistory();
    return record;
  }

  public clearCommandHistory() {
    if (this.commandHistory.length === 0) return;
    this.commandHistory = [];
    this.emitHistory();
  }

  public clearScenarioHistory(phId: string) {
    const normalized = phId.trim().toUpperCase();
    if (!normalized || this.commandHistory.length === 0) return;
    const phRegex = new RegExp(`\\b${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const next = this.commandHistory.filter((entry) => {
      if (entry.scenarioPhId) {
        return entry.scenarioPhId.trim().toUpperCase() !== normalized;
      }
      return !(
        phRegex.test(entry.actionDescription) ||
        phRegex.test(entry.spokenReply) ||
        phRegex.test(entry.rawTranscript)
      );
    });
    if (next.length === this.commandHistory.length) return;
    this.commandHistory = next;
    this.emitHistory();
  }

  /**
   * Triggers the 'Step Complete' Web Audio chime immediately when a user marks
   * a Trouble Scenario diagnostic step as finished (plays a richer completion
   * triad when all steps in the scenario are finished).
   */
  public playStepCompleteChime(allCompleted = false): number {
    playStepCompletionTone(allCompleted);
    const playedAt = Date.now();
    this.lastStepCompleteChimeAt = playedAt;
    this.stepCompleteChimeCount += 1;
    this.emitState();
    return playedAt;
  }

  /**
   * Real-time audio confirmation when a Trouble Scenario diagnostic step is marked completed:
   * triggers the 'Step Complete' audio chime, speaks concise confirmation via SpeechSynthesis,
   * and optionally records a tagged STEP_COMPLETED entry into the voice guidance transcript.
   */
  public confirmStepCompleted(
    options: StepCompletionConfirmationOptions
  ): StepCompletionConfirmationResult {
    const phId = options.phId.trim().toUpperCase();
    const safeTotal = Math.max(1, options.totalSteps);
    const safeStep = Math.max(1, Math.min(options.stepNumber, safeTotal));
    const spokenReply = buildStepCompletionSpeech({
      ...options,
      phId,
      stepNumber: safeStep,
      totalSteps: safeTotal,
    });
    const actionDescription = options.allCompleted
      ? `${phId} Step ${safeStep}/${safeTotal} Completed (All Steps Done)`
      : `${phId} Step ${safeStep}/${safeTotal} Marked Completed`;

    const chimePlayedAt = this.playStepCompleteChime(options.allCompleted);
    this.speak(spokenReply, true);

    let logEntry: VoiceCommandLogEntry | null = null;
    if (options.recordLog !== false) {
      const rawTranscript = options.rawTranscript ?? `mark ${phId} step ${safeStep} complete`;
      logEntry = this.addCommandLog({
        source: options.source ?? 'QUICK_CHIP',
        rawTranscript,
        normalizedTranscript: rawTranscript.toLowerCase(),
        status: 'EXECUTED',
        category: 'DIAGNOSTIC',
        actionDescription,
        spokenReply,
        scenarioPhId: phId,
        scenarioStepNumber: safeStep,
        guidanceKind: 'STEP_COMPLETED',
      });
    }

    return {
      actionDescription,
      spokenReply,
      logEntry,
      chimePlayedAt,
    };
  }

  public clearError() {
    if (this.lastError !== null) {
      this.lastError = null;
      this.emitState();
    }
  }

  public toggleAutoSpeak(): boolean {
    this.autoSpeak = !this.autoSpeak;
    if (!this.autoSpeak) {
      this.stopSpeaking();
    }
    this.emitState();
    return this.autoSpeak;
  }

  public setAutoSpeak(enabled: boolean) {
    this.autoSpeak = enabled;
    if (!enabled) this.stopSpeaking();
    this.emitState();
  }

  public setContinuousMode(enabled: boolean) {
    this.continuousMode = enabled;
    if (!enabled) {
      this.shouldRestartOnEnd = false;
    }
    if (this.recognition) {
      this.recognition.continuous = enabled;
    }
    this.emitState();
  }

  /**
   * Listen for user speech and invoke callback with final recognized automotive command.
   */
  public startListening(
    onResult: (spokenText: string, meta?: VoiceResultMetadata) => void,
    options?: StartListeningOptions
  ) {
    if (!this.recognition) {
      this.lastError = 'Browser SpeechRecognition API unavailable. Try Chrome, Edge, or Safari, or type a command.';
      this.emitState();
      return;
    }

    if (typeof options?.continuous === 'boolean') {
      this.continuousMode = options.continuous;
    }

    this.clearRestartTimer();
    this.stopSpeaking();
    this.lastError = null;
    this.interimTranscript = '';
    this.activeResultCallback = onResult;
    this.activeInterimCallback = options?.onInterim || null;
    this.shouldRestartOnEnd = this.continuousMode;
    this.emitState();

    this.safeStartRecognition();
  }

  public stopListening() {
    this.clearRestartTimer();
    this.shouldRestartOnEnd = false;
    this.activeResultCallback = null;
    this.activeInterimCallback = null;
    this.interimTranscript = '';

    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore stop errors when already idle
      }
    }
    this.isListening = false;
    this.emitState();
  }

  public setRecognitionLang(lang: 'TL' | 'EN') {
    this.setLanguage(lang);
  }

  /**
   * Cleans technical markdown / bullet symbols for clear, natural speech synthesis.
   * Preserves technical automotive tokens (KL30, KL15, KL31, CAN_H, CAN_L, TPS, MAP, ECU, DTC).
   */
  public cleanTextForSpeech(rawMarkdown: string): string {
    return rawMarkdown
      .replace(/---/g, ' ')
      .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/\|/g, ' ')
      .replace(/•\s+/g, '. ')
      .replace(/-\s+/g, '. ')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/Ω/g, ' Ohms ')
      .replace(/µF/g, ' microfarads ')
      .replace(/µ/g, ' micro ')
      .replace(/KL30/g, ' K L 30 ')
      .replace(/KL15/g, ' K L 15 ')
      .replace(/KL31/g, ' K L 31 chassis ground ')
      .replace(/DTC/g, ' D T C ')
      .replace(/ECU/g, ' E C U ')
      .replace(/TPS/g, ' T P S ')
      .replace(/ECT/g, ' E C T ')
      .replace(/CAN_H/g, ' C A N high ')
      .replace(/CAN_L/g, ' C A N low ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Speak a concise automotive voice response.
   * Pauses continuous recognition while speaking so the assistant does not hear itself, then resumes if active.
   */
  public speak(text: string, force = false, queue = false) {
    if (!this.synthesis || (!this.autoSpeak && !force)) return;

    if (!queue) {
      this.stopSpeaking();
    }

    const clean = this.cleanTextForSpeech(text);
    if (!clean) return;

    const sentences = clean.split(/(?<=[.?!])\s+/).filter(Boolean);
    const spokenSlice = sentences.slice(0, 3).join(' ').slice(0, 320);

    try {
      const utterance = new SpeechSynthesisUtterance(spokenSlice);
      utterance.lang = this.language === 'TL' ? 'tl-PH' : 'en-US';
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.emitState();
      };

      const finishSpeaking = () => {
        if (this.synthesis?.speaking || this.synthesis?.pending) {
          return;
        }
        this.isSpeaking = false;
        this.emitState();
        if (this.shouldRestartOnEnd && this.continuousMode && !this.isListening && this.activeResultCallback) {
          this.clearRestartTimer();
          this.restartTimer = setTimeout(() => {
            if (this.shouldRestartOnEnd && this.continuousMode && !this.isSpeaking) {
              this.safeStartRecognition();
            }
          }, 220);
        }
      };

      utterance.onend = finishSpeaking;
      utterance.onerror = finishSpeaking;

      this.synthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis speak error:', e);
      this.isSpeaking = false;
      this.emitState();
    }
  }

  public stopSpeaking() {
    if (this.synthesis) {
      try {
        this.synthesis.cancel();
      } catch {
        // Ignore cancel errors
      }
      this.isSpeaking = false;
      this.emitState();
    }
  }
}

export const offlineVoiceAssistant = new OfflineVoiceAssistantService();
