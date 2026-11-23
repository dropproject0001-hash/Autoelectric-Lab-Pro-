import type {
  DiagnosticTroubleCode,
  EcuPin,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
} from '../types/ecu';
import { splitDiagnosticSteps } from '../data/phTroubleScenarios520';
import type { PhBenchTroubleScenario } from '../simulation/faults/benchTroubleScenarios';

export type ScenarioVoiceCoachVerdict =
  | 'READY_TO_EMULATE'
  | 'PROBE_FOCUS_PIN'
  | 'GROUND_BLACK_PROBE'
  | 'PSU_MISMATCH'
  | 'FAULT_CONFIRMED'
  | 'NOMINAL_RESTORED'
  | 'REFERENCE_SAFE_MODE';

export interface ScenarioVoiceCoachBenchState {
  powerSupply?: PowerSupplyState;
  multimeter?: MultimeterState;
  multimeterDisplay?: string;
  multimeterUnit?: string;
  multimeterWarning?: string;
  nodeVoltages?: Record<string, number>;
  faults?: InjectedFault[];
  activeDTCs?: DiagnosticTroubleCode[];
  pins?: EcuPin[];
  activeScenarioId?: string | null;
}

export interface ScenarioVoiceStepEvaluation {
  phId: string;
  cleanTitle: string;
  stepIndex: number;
  totalSteps: number;
  currentStepText: string;
  verdict: ScenarioVoiceCoachVerdict;
  verdictBadgeLabel: string;
  isStepVerified: boolean;
  isScenarioEmulated: boolean;
  isRedProbeOnFocusPin: boolean;
  isBlackProbeGrounded: boolean;
  focusPinVoltage: number;
  dmmReadingText: string;
  coachingHeadline: string;
  coachingDetail: string;
  spokenStepGuidance: string;
  spokenVerificationReply: string;
  spokenScenarioOverview: string;
}

function stripPhIdPrefix(title: string, phId: string): string {
  const prefix = `${phId}: `;
  return title.startsWith(prefix) ? title.slice(prefix.length) : title;
}

export type ScenarioVoiceGuidanceKind =
  | 'STEP_GUIDANCE'
  | 'STEP_COMPLETED'
  | 'VERIFICATION'
  | 'BRIEFING'
  | 'BENCH_ACTION';

export interface StepCompletionSpeechParams {
  phId: string;
  stepNumber: number;
  totalSteps: number;
  stepText: string;
  allCompleted: boolean;
  nextStepNumber?: number;
  nextStepText?: string;
  dmmReadingText?: string;
}

function normalizeStepTextForSpeech(stepText: string): string {
  const withoutLeadingNumber = stepText.replace(/^\s*(?:step\s*)?\d+[.):\s-]+/i, '').trim();
  return withoutLeadingNumber
    .replace(/\bV_DC\b/gi, 'volts DC')
    .replace(/\bVREF\b/gi, '5 volt reference')
    .replace(/\bKL30\b/gi, 'K L 30 battery supply')
    .replace(/\bKL15\b/gi, 'K L 15 switched ignition')
    .replace(/\bKL31\b/gi, 'K L 31 chassis ground')
    .replace(/\bGND\b/gi, 'ground')
    .replace(/\bDMM\b/gi, 'multimeter')
    .replace(/Ω/g, ' ohms');
}

function cleanStepForSpeech(stepText: string, index: number, total: number): string {
  return `Step ${index + 1} of ${total}: ${normalizeStepTextForSpeech(stepText)}`;
}

export function buildStepCompletionSpeech(params: StepCompletionSpeechParams): string {
  const phId = params.phId.toUpperCase();
  const safeTotal = Math.max(1, params.totalSteps);
  const safeStep = Math.max(1, Math.min(params.stepNumber, safeTotal));

  if (params.allCompleted) {
    const readingSuffix = params.dmmReadingText
      ? ` Live multimeter reads ${params.dmmReadingText}.`
      : '';
    return `Step ${safeStep} of ${safeTotal} completed for ${phId}. All ${safeTotal} diagnostic steps are now complete.${readingSuffix}`;
  }

  if (params.nextStepText && params.nextStepNumber) {
    const nextNormalized = normalizeStepTextForSpeech(params.nextStepText).replace(/\.$/, '');
    return `Step ${safeStep} of ${safeTotal} marked complete for ${phId}. Next is step ${params.nextStepNumber}: ${nextNormalized}.`;
  }

  return `Step ${safeStep} of ${safeTotal} marked complete for ${phId}.`;
}

export interface ScenarioTranscriptEntryLike {
  scenarioPhId?: string;
  actionDescription: string;
  spokenReply: string;
  rawTranscript: string;
  timestamp?: number;
}

/**
 * Filters voice assistant history entries to those belonging to the active
 * Trouble Scenario PH-ID and returns them in chronological order (oldest -> newest).
 */
export function filterVoiceTranscriptForScenario<T extends ScenarioTranscriptEntryLike>(
  entries: readonly T[],
  phId: string
): T[] {
  const normalizedPhId = phId.trim().toUpperCase();
  if (!normalizedPhId) return [];
  const phRegex = new RegExp(`\\b${normalizedPhId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

  return entries
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry }) => {
      if (entry.scenarioPhId) {
        return entry.scenarioPhId.trim().toUpperCase() === normalizedPhId;
      }
      return (
        phRegex.test(entry.actionDescription) ||
        phRegex.test(entry.spokenReply) ||
        phRegex.test(entry.rawTranscript)
      );
    })
    .sort((a, b) => {
      const tsDiff = (a.entry.timestamp ?? 0) - (b.entry.timestamp ?? 0);
      if (tsDiff !== 0) return tsDiff;
      // History is stored newest-first, so higher index means older entry when timestamps match
      return b.idx - a.idx;
    })
    .map(({ entry }) => entry);
}

export interface ScenarioStepProgress {
  completedCount: number;
  totalSteps: number;
  ratio: number;
  percent: number;
  statusLabel: 'NOT STARTED' | 'IN PROGRESS' | 'ALL COMPLETE';
  isAllComplete: boolean;
}

/**
 * Computes bounded, deduplicated step completion progress for a Trouble Scenario.
 */
export function computeScenarioStepProgress(
  completedStepIndices: readonly number[],
  totalSteps: number
): ScenarioStepProgress {
  const safeTotal = Math.max(0, Math.floor(totalSteps));
  if (safeTotal === 0) {
    return {
      completedCount: 0,
      totalSteps: 0,
      ratio: 0,
      percent: 0,
      statusLabel: 'NOT STARTED',
      isAllComplete: false,
    };
  }
  const uniqueValid = new Set(
    completedStepIndices.filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < safeTotal)
  );
  const completedCount = uniqueValid.size;
  const ratio = completedCount / safeTotal;
  const percent = Math.round(ratio * 100);
  const isAllComplete = completedCount >= safeTotal;
  const statusLabel: ScenarioStepProgress['statusLabel'] = isAllComplete
    ? 'ALL COMPLETE'
    : completedCount > 0
      ? 'IN PROGRESS'
      : 'NOT STARTED';

  return {
    completedCount,
    totalSteps: safeTotal,
    ratio,
    percent,
    statusLabel,
    isAllComplete,
  };
}

/**
 * Computes the next bounded 0-based diagnostic step index when cycling Previous (-1) or Next (+1).
 */
export function stepScenarioIndex(
  currentIndex: number,
  delta: -1 | 1,
  totalSteps: number
): number {
  const maxIndex = Math.max(0, Math.floor(totalSteps) - 1);
  return Math.max(0, Math.min(maxIndex, currentIndex + delta));
}

/**
 * Delay (in milliseconds) after marking a diagnostic step complete before Auto-Play
 * advances to the next step so the technician hears the 'Step Complete' chime clearly.
 */
export const AUTO_PLAY_STEP_DELAY_MS = 1000;

/**
 * Resolves the next 0-based diagnostic step index to advance to when Auto-Play
 * is enabled after a step is marked complete. Prefers the next incomplete step
 * after `completedStepIndex`, falls back to any earlier incomplete step, and
 * returns `null` once all steps in the scenario are finished.
 */
export function resolveAutoPlayNextStepIndex(
  completedStepIndex: number,
  completedStepIndices: readonly number[],
  totalSteps: number
): number | null {
  const safeTotal = Math.max(0, Math.floor(totalSteps));
  if (safeTotal <= 1) return null;
  const clampedCompleted = Math.max(
    0,
    Math.min(safeTotal - 1, Math.floor(completedStepIndex))
  );
  const completedSet = new Set(
    completedStepIndices.filter(
      (idx) => Number.isInteger(idx) && idx >= 0 && idx < safeTotal
    )
  );
  completedSet.add(clampedCompleted);
  if (completedSet.size >= safeTotal) return null;

  for (let idx = clampedCompleted + 1; idx < safeTotal; idx += 1) {
    if (!completedSet.has(idx)) return idx;
  }
  for (let idx = 0; idx < clampedCompleted; idx += 1) {
    if (!completedSet.has(idx)) return idx;
  }
  return null;
}

export function formatScenarioTranscriptText(
  phId: string,
  title: string,
  entries: readonly {
    timestamp: number;
    scenarioStepNumber?: number;
    guidanceKind?: string;
    rawTranscript: string;
    actionDescription: string;
    spokenReply: string;
  }[]
): string {
  const header = `AutoElectric Lab Pro — Voice Guidance Transcript\nScenario: ${phId} — ${title}\nEntries: ${entries.length}\n${'='.repeat(54)}`;
  if (entries.length === 0) {
    return `${header}\nNo voice guidance entries recorded yet for ${phId}.`;
  }
  const body = entries
    .map((entry, index) => {
      const time = new Date(entry.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const stepLabel = entry.scenarioStepNumber ? ` | Step ${entry.scenarioStepNumber}` : '';
      const kindLabel = entry.guidanceKind ? ` [${entry.guidanceKind}]` : '';
      return `[${index + 1}] ${time}${stepLabel}${kindLabel}\n  Trigger: "${entry.rawTranscript}"\n  Action:  ${entry.actionDescription}\n  Guide:   ${entry.spokenReply}`;
    })
    .join('\n\n');
  return `${header}\n\n${body}`;
}

export function evaluateScenarioVoiceCoach(
  scenario: PhBenchTroubleScenario,
  rawStepIndex: number,
  bench: ScenarioVoiceCoachBenchState = {}
): ScenarioVoiceStepEvaluation {
  const steps = splitDiagnosticSteps(scenario.diagnosticSteps);
  const totalSteps = Math.max(1, steps.length);
  const stepIndex = Math.max(0, Math.min(rawStepIndex, totalSteps - 1));
  const currentStepText =
    steps[stepIndex] || `Inspect ${scenario.focusPinLabel} and verify ${scenario.expectedProbeOutcome}.`;
  const cleanTitle = stripPhIdPrefix(scenario.title, scenario.phId);

  const isScenarioEmulated = bench.activeScenarioId === scenario.id;
  const redPinId = bench.multimeter?.redProbe?.attachedToPinId ?? null;
  const blackPinId = bench.multimeter?.blackProbe?.attachedToPinId ?? null;

  const isRedProbeOnFocusPin = redPinId === scenario.focusPinId;
  const isBlackProbeGrounded =
    blackPinId === 'chassis-gnd' ||
    blackPinId === 'ecu-pin-1' ||
    blackPinId === 'ecu-pin-2' ||
    blackPinId === 'ecu-pin-6' ||
    blackPinId === 'ecu-pin-14';

  const focusPinVoltage =
    bench.nodeVoltages?.[scenario.focusPinId] ??
    bench.pins?.find((p) => p.id === scenario.focusPinId)?.nominalVoltage ??
    0;

  const dmmDisplay = bench.multimeterDisplay ?? `${focusPinVoltage.toFixed(2)}`;
  const dmmUnit = bench.multimeterUnit ?? 'V DC';
  const dmmReadingText = bench.multimeterWarning
    ? `WARN: ${bench.multimeterWarning}`
    : `${dmmDisplay} ${dmmUnit}`;

  const activePinFault = (bench.faults ?? []).find(
    (f) => f.pinId === scenario.focusPinId && f.faultType !== 'NONE'
  );
  const totalActiveFaults = (bench.faults ?? []).filter((f) => f.faultType !== 'NONE').length;
  const stepLower = currentStepText.toLowerCase();
  const stepRequiresResistance =
    /\b(?:ohm|ohms|Ω|resistance|continuity|60\s*Ω|120\s*Ω|key[\s-]*off|power\s+off)\b/i.test(stepLower);
  const isPsuOn = bench.powerSupply?.isOutputEnabled ?? true;

  let verdict: ScenarioVoiceCoachVerdict = 'READY_TO_EMULATE';
  let verdictBadgeLabel = 'EMULATE ON BENCH';
  let isStepVerified = false;
  let coachingHeadline = '';
  let coachingDetail = '';
  let spokenVerificationReply = '';

  if (scenario.emulationFidelity === 'DIAGNOSTIC_REFERENCE_ONLY') {
    verdict = 'REFERENCE_SAFE_MODE';
    verdictBadgeLabel = 'SAFE REFERENCE MODE';
    isStepVerified = !isPsuOn || isRedProbeOnFocusPin;
    coachingHeadline = `${scenario.phId} Reference Procedure · Step ${stepIndex + 1}/${totalSteps}`;
    coachingDetail = isPsuOn
      ? `Safety reference scenario (${scenario.domainName}). Click "Emulate in Bench Lab" to de-energize PSU for safe key-off inspection on ${scenario.focusPinLabel}.`
      : `Bench PSU is safely OFF (Key-OFF). Follow Step ${stepIndex + 1} and verify ${scenario.focusPinLabel}.`;
    spokenVerificationReply = isPsuOn
      ? `Scenario ${scenario.phId} is a high-safety reference procedure. Click Emulate in Bench Lab to turn the power supply off before performing step ${stepIndex + 1}.`
      : `Power supply is safely off for ${scenario.phId}. ${cleanStepForSpeech(currentStepText, stepIndex, totalSteps)}`;
  } else if (stepRequiresResistance && isPsuOn) {
    verdict = 'PSU_MISMATCH';
    verdictBadgeLabel = 'TURN PSU OFF FOR OHMS';
    isStepVerified = false;
    coachingHeadline = `Step ${stepIndex + 1} Requires Key-OFF Resistance / Continuity Check`;
    coachingDetail = `Bench PSU is currently ON (${(bench.powerSupply?.voltageSetting ?? 12.6).toFixed(1)}V). Switch PSU OFF before measuring Ohms or Continuity on ${scenario.focusPinLabel}.`;
    spokenVerificationReply = `Step ${stepIndex + 1} measures resistance or continuity, but the bench power supply is currently on. Switch power supply output off first to avoid multimeter live-circuit lockout.`;
  } else if (!isRedProbeOnFocusPin) {
    verdict = 'PROBE_FOCUS_PIN';
    verdictBadgeLabel = `PROBE ${scenario.focusPinLabel.toUpperCase()}`;
    isStepVerified = false;
    const currentRedLabel = bench.multimeter?.redProbe?.attachedLabel || 'Unconnected';
    coachingHeadline = `Attach Red (+) Probe to ${scenario.focusPinLabel}`;
    coachingDetail = `Red probe is currently on ${currentRedLabel}. Attach it to ${scenario.focusPinLabel} to measure live telemetry against expected: ${scenario.expectedProbeOutcome}.`;
    spokenVerificationReply = `Your red multimeter probe is currently on ${currentRedLabel}. Attach the red probe to ${scenario.focusPinLabel} to verify step ${stepIndex + 1}. Expected outcome: ${scenario.expectedProbeOutcome}.`;
  } else if (!isBlackProbeGrounded) {
    verdict = 'GROUND_BLACK_PROBE';
    verdictBadgeLabel = 'GROUND BLACK COM (-)';
    isStepVerified = false;
    coachingHeadline = 'Attach Black (-) COM Probe to Chassis Ground (KL31)';
    coachingDetail = `Red probe is on ${scenario.focusPinLabel}, but Black COM (-) is not on a ground reference. Connect Black COM to Chassis GND (Pin 1/2).`;
    spokenVerificationReply = `Red probe is on ${scenario.focusPinLabel}, but your black COM probe is not grounded. Attach the black probe to chassis ground K L 31.`;
  } else if (!isScenarioEmulated && totalActiveFaults === 0) {
    verdict = 'NOMINAL_RESTORED';
    verdictBadgeLabel = 'NOMINAL VERIFIED';
    isStepVerified = true;
    coachingHeadline = `Probing ${scenario.focusPinLabel} · Live DMM: ${dmmReadingText} (Nominal)`;
    coachingDetail = `Red probe is on ${scenario.focusPinLabel} (${focusPinVoltage.toFixed(2)}V) with 0 active faults. Click "Emulate in Bench Lab" to inject ${scenario.phId} fault signature, or verify nominal recovery.`;
    spokenVerificationReply = `Red probe is on ${scenario.focusPinLabel}, reading ${dmmDisplay} ${dmmUnit} in nominal condition with zero faults. To observe the fault symptom for ${scenario.phId}, click Emulate in Bench Lab.`;
  } else {
    verdict = 'FAULT_CONFIRMED';
    verdictBadgeLabel = 'FAULT TELEMETRY MATCHED';
    isStepVerified = true;
    const activeDtcList = (bench.activeDTCs ?? []).map((d) => d.code).join(', ');
    const faultLabel = activePinFault
      ? `${activePinFault.faultType} (${activePinFault.description})`
      : `${totalActiveFaults} active bench fault(s)`;
    coachingHeadline = `Live Probe Confirmed on ${scenario.focusPinLabel} · DMM: ${dmmReadingText}`;
    coachingDetail = `Active fault: ${faultLabel}${activeDtcList ? ` · Active DTC: ${activeDtcList}` : ''}. Compare live ${focusPinVoltage.toFixed(2)}V against expected: ${scenario.expectedProbeOutcome}.`;
    spokenVerificationReply = `Probe verified on ${scenario.focusPinLabel}. Live multimeter reads ${dmmDisplay} ${dmmUnit} with ${activePinFault ? activePinFault.faultType.replace(/_/g, ' ').toLowerCase() : 'active fault emulation'}. Expected scenario signature is ${scenario.expectedProbeOutcome}.`;
  }

  const spokenStepGuidance = `${scenario.phId}. ${cleanStepForSpeech(currentStepText, stepIndex, totalSteps)} ${
    isRedProbeOnFocusPin
      ? `Live probe on ${scenario.focusPinLabel} reads ${dmmDisplay} ${dmmUnit}.`
      : `Target test point is ${scenario.focusPinLabel}.`
  }`;

  const dtcSpeech =
    scenario.relatedDtcs.length > 0
      ? `Associated D T C ${scenario.relatedDtcs.join(' and ')}.`
      : 'Field diagnostic scenario.';

  const spokenScenarioOverview = `${scenario.phId}: ${cleanTitle}. ${dtcSpeech} Vehicle context: ${scenario.phContext}. Symptoms: ${scenario.symptoms}. Target pin: ${scenario.focusPinLabel}. Expected probe reading: ${scenario.expectedProbeOutcome}. ${cleanStepForSpeech(
    currentStepText,
    stepIndex,
    totalSteps
  )}`;

  return {
    phId: scenario.phId,
    cleanTitle,
    stepIndex,
    totalSteps,
    currentStepText,
    verdict,
    verdictBadgeLabel,
    isStepVerified,
    isScenarioEmulated,
    isRedProbeOnFocusPin,
    isBlackProbeGrounded,
    focusPinVoltage,
    dmmReadingText,
    coachingHeadline,
    coachingDetail,
    spokenStepGuidance,
    spokenVerificationReply,
    spokenScenarioOverview,
  };
}

