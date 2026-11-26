/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type {
  LabGuidanceStep,
  UniversityDifficultyTier,
  UniversityLabModule,
} from '../data/universityLabCurriculum';
import type { EcuPin } from '../types/ecu';

export type TutorialNarrationStyle =
  | 'CONCISE_BENCH'
  | 'INSTRUCTOR_DETAILED'
  | 'TAGLISH_COACH';

export type TutorialDurationSec = 5 | 6 | 8;

export interface GroundedStepTutorialSpec {
  moduleId: string;
  exerciseCode: string;
  tier: UniversityDifficultyTier;
  moduleTitle: string;
  targetUnit: string;
  stepId: string;
  stepNumber: number;
  stepTitle: string;
  instructionTaglish: string;
  requiredPsuState: 'OFF' | 'ON' | 'ANY';
  psuVoltageSetting: number;
  requiredDmmMode: string;
  dmmModeDisplay: string;
  focusPinId: string;
  focusPinLabel: string;
  focusPinDetail: string;
  redProbeLabel: string;
  blackProbeLabel: string;
  expectedReadingLabel: string;
  toleranceLabel: string;
  unitLabel: string;
  stepKind: 'HEALTHY_CHECK' | 'FAULT_CONFIRMATION';
  oscilloscopeSignal: UniversityLabModule['oscilloscopeSignal'];
  verifiedPinNames: readonly string[];
  passFeedbackTaglish: string;
  failHintTaglish: string;
}

export interface StepTutorialSubtitleCue {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  voiceText: string;
  focusArea: 'PSU' | 'DMM_DIAL' | 'PROBES' | 'READING' | 'CONCLUSION';
  highlightPinLabel: string;
}

export interface InstructorTutorialSettings {
  narrationStyle: TutorialNarrationStyle;
  durationSec: TutorialDurationSec;
  voiceGuidanceEnabled: boolean;
}

export const DEFAULT_INSTRUCTOR_TUTORIAL_SETTINGS: InstructorTutorialSettings = {
  narrationStyle: 'TAGLISH_COACH',
  durationSec: 6,
  voiceGuidanceEnabled: true,
};

export function isStepTutorialEligibleTier(tier: UniversityDifficultyTier): boolean {
  return tier === 'LEVEL_1_BEGINNER' || tier === 'LEVEL_2_INTERMEDIATE';
}

export function buildStepTutorialCacheKey(
  moduleId: string,
  stepId: string,
  narrationStyle: TutorialNarrationStyle,
  durationSec: TutorialDurationSec
): string {
  return `${moduleId}::${stepId}::${narrationStyle}::${durationSec}s`;
}

export function buildGroundedStepSpec(
  module: UniversityLabModule,
  step: LabGuidanceStep,
  ecuPins: readonly EcuPin[] = []
): GroundedStepTutorialSpec {
  const matchedPin = ecuPins.find(
    (p) =>
      p.id === step.focusPinId ||
      p.label.toUpperCase() === step.focusPinLabel.split(' ')[0]?.toUpperCase()
  );

  const verifiedSet = new Set<string>([
    step.focusPinLabel,
    step.redProbeLabel,
    step.blackProbeLabel,
  ]);
  if (matchedPin) {
    verifiedSet.add(`${matchedPin.label} (Pin ${matchedPin.pinNumber} · ${matchedPin.name})`);
  }

  return {
    moduleId: module.id,
    exerciseCode: module.exerciseCode,
    tier: module.tier,
    moduleTitle: module.titleTaglish,
    targetUnit: module.targetUnit,
    stepId: step.id,
    stepNumber: step.stepNumber,
    stepTitle: step.titleTaglish,
    instructionTaglish: step.instructionTaglish,
    requiredPsuState: step.requiredPsuState,
    psuVoltageSetting: module.psuOverride.voltageSetting,
    requiredDmmMode: step.requiredDmmMode,
    dmmModeDisplay: step.dmmModeDisplay,
    focusPinId: step.focusPinId,
    focusPinLabel: step.focusPinLabel,
    focusPinDetail: matchedPin
      ? `${matchedPin.name} (Nominal ${matchedPin.nominalVoltage.toFixed(2)}V)`
      : step.focusPinLabel,
    redProbeLabel: step.redProbeLabel,
    blackProbeLabel: step.blackProbeLabel,
    expectedReadingLabel: step.expectedReadingLabel,
    toleranceLabel: step.toleranceLabel,
    unitLabel: step.unitLabel,
    stepKind: step.stepKind,
    oscilloscopeSignal: module.oscilloscopeSignal,
    verifiedPinNames: Array.from(verifiedSet),
    passFeedbackTaglish: step.passFeedbackTaglish,
    failHintTaglish: step.failHintTaglish,
  };
}

/**
 * Constructs a strictly grounded 5-8s 16:9 macro tutorial prompt referencing ONLY verified
 * pin names, probe colors, DMM mode, PSU configuration, and expected tolerance values.
 */
export function buildStepTutorialPrompt(
  spec: GroundedStepTutorialSpec,
  narrationStyle: TutorialNarrationStyle,
  durationSec: TutorialDurationSec = 6
): string {
  const psuInstruction =
    spec.requiredPsuState === 'OFF'
      ? 'Bench Power Supply switched OFF (0.0V cold resistance/continuity check)'
      : spec.requiredPsuState === 'ON'
        ? `Bench Power Supply energized ON at ${spec.psuVoltageSetting.toFixed(1)}V DC`
        : `Bench Power Supply at ${spec.psuVoltageSetting.toFixed(1)}V setting`;

  const styleNote =
    narrationStyle === 'CONCISE_BENCH'
      ? 'Crisp, fast-paced workshop bench demonstration focusing directly on terminal probe contact and meter settling.'
      : narrationStyle === 'INSTRUCTOR_DETAILED'
        ? 'Methodical university automotive lab close-up highlighting safety order, probe polarity, and exact tolerance window.'
        : 'Practical bilingual automotive technician lab close-up emphasizing cold-check safety, Red (+)/Black (-) probe placement, and live meter confirmation.';

  return [
    `Create a ${durationSec}-second 16:9 macro close-up technical training video on a clean midnight-navy ESD automotive ECU diagnostic bench.`,
    `Subject: ${spec.exerciseCode} Step ${spec.stepNumber} — "${spec.stepTitle}" on ${spec.targetUnit}.`,
    `Tool Configuration: ${psuInstruction}; Digital Multimeter rotary selector set strictly to "${spec.dmmModeDisplay}" (${spec.requiredDmmMode}).`,
    `Verified Terminals: Focus pin "${spec.focusPinLabel}" (${spec.focusPinDetail}). Place Red (+) test probe onto "${spec.redProbeLabel}" and Black (-) reference probe onto "${spec.blackProbeLabel}".`,
    `Expected Measurement Readout: Meter LCD cleanly stabilizes to "${spec.expectedReadingLabel}" within "${spec.toleranceLabel}".`,
    `Visual Direction: ${styleNote} Steady studio macro camera tracking from the PSU switch, to the DMM dial, to the Red (+) and Black (-) probe tips contacting the labeled ECU breakout pins, ending on the stabilized digital readout. Realistic laboratory lighting, sharp focus on pin silkscreen labels, no distorted text.`,
  ].join(' ');
}

/**
 * Generates deterministic, time-synced subtitle cues across 0..durationSec strictly from
 * verified step metadata (zero hallucinated pin names or ranges).
 */
export function buildStepTutorialSubtitles(
  spec: GroundedStepTutorialSpec,
  narrationStyle: TutorialNarrationStyle,
  durationSec: TutorialDurationSec = 6
): StepTutorialSubtitleCue[] {
  const seg1 = Number((durationSec * 0.24).toFixed(2));
  const seg2 = Number((durationSec * 0.52).toFixed(2));
  const seg3 = Number((durationSec * 0.78).toFixed(2));

  const psuLabel =
    spec.requiredPsuState === 'OFF'
      ? 'PSU OFF (Cold Check)'
      : spec.requiredPsuState === 'ON'
        ? `PSU ON (${spec.psuVoltageSetting.toFixed(1)}V)`
        : `PSU ${spec.psuVoltageSetting.toFixed(1)}V`;

  if (narrationStyle === 'TAGLISH_COACH') {
    return [
      {
        id: `${spec.stepId}-cue-1`,
        startSec: 0,
        endSec: seg1,
        text: `Step ${spec.stepNumber}: I-set ang ${psuLabel} at ilagay ang DMM sa ${spec.dmmModeDisplay}.`,
        voiceText: `Step ${spec.stepNumber}. Unang-una, siguraduhing naka-${psuLabel} at naka-set ang multimeter sa ${spec.dmmModeDisplay}.`,
        focusArea: 'PSU',
        highlightPinLabel: spec.focusPinLabel,
      },
      {
        id: `${spec.stepId}-cue-2`,
        startSec: seg1,
        endSec: seg2,
        text: `Ikabit ang Red (+) probe sa ${spec.redProbeLabel} at Black (-) probe sa ${spec.blackProbeLabel}.`,
        voiceText: `Ilapat ang Red positive probe sa ${spec.redProbeLabel} at ang Black negative probe sa ${spec.blackProbeLabel}.`,
        focusArea: 'PROBES',
        highlightPinLabel: spec.focusPinLabel,
      },
      {
        id: `${spec.stepId}-cue-3`,
        startSec: seg2,
        endSec: seg3,
        text: `Verified Pin: ${spec.focusPinLabel} · Target: ${spec.expectedReadingLabel} (${spec.toleranceLabel}).`,
        voiceText: `Bantayan ang reading sa ${spec.focusPinLabel}. Ang target ay ${spec.expectedReadingLabel}, tolerance ${spec.toleranceLabel}.`,
        focusArea: 'READING',
        highlightPinLabel: spec.focusPinLabel,
      },
      {
        id: `${spec.stepId}-cue-4`,
        startSec: seg3,
        endSec: durationSec,
        text: `${spec.passFeedbackTaglish}`,
        voiceText: spec.passFeedbackTaglish,
        focusArea: 'CONCLUSION',
        highlightPinLabel: spec.focusPinLabel,
      },
    ];
  }

  if (narrationStyle === 'CONCISE_BENCH') {
    return [
      {
        id: `${spec.stepId}-cue-1`,
        startSec: 0,
        endSec: seg1,
        text: `${psuLabel} · DMM: ${spec.dmmModeDisplay}`,
        voiceText: `Set ${psuLabel} and select ${spec.dmmModeDisplay} on the multimeter.`,
        focusArea: 'DMM_DIAL',
        highlightPinLabel: spec.focusPinLabel,
      },
      {
        id: `${spec.stepId}-cue-2`,
        startSec: seg1,
        endSec: seg2,
        text: `Red (+) → ${spec.redProbeLabel} | Black (-) → ${spec.blackProbeLabel}`,
        voiceText: `Probe Red positive to ${spec.redProbeLabel} and Black negative to ${spec.blackProbeLabel}.`,
        focusArea: 'PROBES',
        highlightPinLabel: spec.focusPinLabel,
      },
      {
        id: `${spec.stepId}-cue-3`,
        startSec: seg2,
        endSec: seg3,
        text: `Target on ${spec.focusPinLabel}: ${spec.expectedReadingLabel} (${spec.toleranceLabel})`,
        voiceText: `Confirm ${spec.focusPinLabel} reads ${spec.expectedReadingLabel} within ${spec.toleranceLabel}.`,
        focusArea: 'READING',
        highlightPinLabel: spec.focusPinLabel,
      },
      {
        id: `${spec.stepId}-cue-4`,
        startSec: seg3,
        endSec: durationSec,
        text: `Capture Reading once stabilized within ${spec.toleranceLabel}.`,
        voiceText: `Lock and capture the stabilized reading for ${spec.focusPinLabel}.`,
        focusArea: 'CONCLUSION',
        highlightPinLabel: spec.focusPinLabel,
      },
    ];
  }

  return [
    {
      id: `${spec.stepId}-cue-1`,
      startSec: 0,
      endSec: seg1,
      text: `Safety & Instrument Setup: Verify ${psuLabel} and dial DMM to ${spec.dmmModeDisplay}.`,
      voiceText: `Begin Step ${spec.stepNumber} by verifying ${psuLabel} and switching the digital multimeter to ${spec.dmmModeDisplay}.`,
      focusArea: 'PSU',
      highlightPinLabel: spec.focusPinLabel,
    },
    {
      id: `${spec.stepId}-cue-2`,
      startSec: seg1,
      endSec: seg2,
      text: `Terminal Probing: Contact Red (+) on ${spec.redProbeLabel} and Black (-) on ${spec.blackProbeLabel}.`,
      voiceText: `Connect the Red positive test lead to ${spec.redProbeLabel}, and ground the Black reference lead to ${spec.blackProbeLabel}.`,
      focusArea: 'PROBES',
      highlightPinLabel: spec.focusPinLabel,
    },
    {
      id: `${spec.stepId}-cue-3`,
      startSec: seg2,
      endSec: seg3,
      text: `Verification Window: ${spec.focusPinLabel} expects ${spec.expectedReadingLabel} (${spec.toleranceLabel}).`,
      voiceText: `Observe the live reading on ${spec.focusPinLabel}. Nominal specification is ${spec.expectedReadingLabel} with tolerance ${spec.toleranceLabel}.`,
      focusArea: 'READING',
      highlightPinLabel: spec.focusPinLabel,
    },
    {
      id: `${spec.stepId}-cue-4`,
      startSec: seg3,
      endSec: durationSec,
      text: `Diagnostic Criterion: ${spec.passFeedbackTaglish}`,
      voiceText: `Once verified, capture the reading. ${spec.passFeedbackTaglish}`,
      focusArea: 'CONCLUSION',
      highlightPinLabel: spec.focusPinLabel,
    },
  ];
}
