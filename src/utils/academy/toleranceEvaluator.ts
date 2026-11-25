/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import {
  evaluateUniversityLabStep,
  type LabStepLiveEvaluation,
  type LiveBenchEvaluationInput,
} from '../../data/universityLabCurriculum';
import type { DiagnosticStepSpec, LabModule } from '../../data/academy/universityCurriculum';

export interface AcademyStepEvaluationResult {
  stepId: string;
  stepNumber: number;
  status: 'PASSED' | 'FAILED' | 'SAFETY_BLOCKED' | 'WAITING';
  safetyBlocked: boolean;
  safetyWarningTaglish: string | null;
  safetyWarningEnglish: string | null;
  /** Read-only MNA measured value — never editable by student */
  readOnlyMeasuredDisplay: string;
  expectedToleranceDisplay: string;
  feedbackTaglish: string;
  rawEvaluation: LabStepLiveEvaluation;
}

export interface AcademyModuleProgressSnapshot {
  moduleId: string;
  stepResults: AcademyStepEvaluationResult[];
  completedCount: number;
  totalSteps: number;
  allStepsExecuted: boolean;
  conclusionUnlocked: boolean;
}

/**
 * Deterministic live MNA tolerance evaluator.
 * Enforces electrical safety prerequisite: if a step requires PSU OFF (cold resistance/continuity)
 * and Bench PSU is currently energized, flags a safety warning and strictly blocks completion.
 */
export function evaluateAcademyStepTolerance(
  step: DiagnosticStepSpec,
  bench: LiveBenchEvaluationInput
): AcademyStepEvaluationResult {
  const raw = evaluateUniversityLabStep(step, bench);
  const psuIsEnergized = bench.powerSupply.isOutputEnabled && bench.powerSupply.voltageSetting > 0.4;

  // Hard electrical safety order gate: Cold check MUST NOT pass while PSU is ON
  if (step.requiredPsuState === 'OFF' && psuIsEnergized) {
    return {
      stepId: step.id,
      stepNumber: step.stepNumber,
      status: 'SAFETY_BLOCKED',
      safetyBlocked: true,
      safetyWarningTaglish:
        'SAFETY LOCK: I-OFF muna ang Bench Power Supply bago mag-resistance o continuity test para hindi masira ang ECU at Multimeter.',
      safetyWarningEnglish:
        'SAFETY LOCK: Switch Bench Power Supply OFF before performing cold resistance or continuity checks to protect the ECU and Multimeter.',
      readOnlyMeasuredDisplay: `${bench.multimeterReading.display} ${bench.multimeterReading.unit}`.trim(),
      expectedToleranceDisplay: `${step.expectedReadingLabel} (${step.toleranceLabel})`,
      feedbackTaglish:
        'Naka-ON pa ang Power Supply. I-OFF muna ang PSU Output bago kunin ang cold reading.',
      rawEvaluation: raw,
    };
  }

  let status: AcademyStepEvaluationResult['status'] = 'WAITING';
  if (raw.status === 'PASSED' || raw.status === 'FAULT_CONFIRMED') {
    status = 'PASSED';
  } else if (raw.status === 'OUT_OF_RANGE') {
    status = 'FAILED';
  }

  return {
    stepId: step.id,
    stepNumber: step.stepNumber,
    status,
    safetyBlocked: false,
    safetyWarningTaglish: null,
    safetyWarningEnglish: null,
    readOnlyMeasuredDisplay: `${raw.liveDisplay} ${raw.liveUnit}`.trim(),
    expectedToleranceDisplay: `${step.expectedReadingLabel} (${step.toleranceLabel})`,
    feedbackTaglish: raw.feedbackTaglish,
    rawEvaluation: raw,
  };
}

export function evaluateAcademyModuleProgress(
  module: LabModule,
  bench: LiveBenchEvaluationInput,
  capturedStepIds: readonly string[] = []
): AcademyModuleProgressSnapshot {
  const capturedSet = new Set(capturedStepIds);
  const stepResults = module.steps.map((step) => evaluateAcademyStepTolerance(step, bench));
  const completedCount = stepResults.filter(
    (r) => r.status === 'PASSED' || capturedSet.has(r.stepId)
  ).length;
  const totalSteps = module.steps.length;
  const allStepsExecuted = totalSteps > 0 && completedCount === totalSteps;

  return {
    moduleId: module.id,
    stepResults,
    completedCount,
    totalSteps,
    allStepsExecuted,
    conclusionUnlocked: allStepsExecuted,
  };
}
