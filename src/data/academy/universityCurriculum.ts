import {
  UNIVERSITY_LAB_MODULES,
  UNIVERSITY_TIER_META,
  type LabGuidanceStep,
  type UniversityDifficultyTier,
  type UniversityLabModule,
  type UniversityTierMeta,
} from '../universityLabCurriculum';

export type TrainingLevel = UniversityDifficultyTier;

export interface DiagnosticStepSpec extends LabGuidanceStep {
  whyWeTestTaglish: string;
  whyWeTestEnglish: string;
}

export interface LabModule extends Omit<UniversityLabModule, 'steps'> {
  level: TrainingLevel;
  steps: readonly DiagnosticStepSpec[];
}

function buildWhyWeTestTip(step: LabGuidanceStep): {
  tl: string;
  en: string;
} {
  if (step.requiredPsuState === 'OFF') {
    return {
      tl: `Sinusukat muna natin ito habang OFF ang Power Supply (${step.dmmModeDisplay}) para sigurado tayong walang short o putol na wire bago magpasok ng kuryente sa ECU.`,
      en: `We measure this with Power Supply OFF (${step.dmmModeDisplay}) first to confirm there is no short or open circuit before energizing the ECU.`,
    };
  }
  return {
    tl: `Tine-test natin ang ${step.focusPinLabel} habang ON ang Power Supply (${step.dmmModeDisplay}) para malaman kung pasok sa ${step.expectedReadingLabel} ang live reading ng circuit.`,
    en: `We test ${step.focusPinLabel} with Power Supply ON (${step.dmmModeDisplay}) to confirm the live circuit reading stays within ${step.expectedReadingLabel}.`,
  };
}

export const ACADEMY_TRAINING_LEVELS: readonly UniversityTierMeta[] = UNIVERSITY_TIER_META;

export const ACADEMY_CURRICULUM_MODULES: readonly LabModule[] = UNIVERSITY_LAB_MODULES.map(
  (mod) => ({
    ...mod,
    level: mod.tier,
    steps: mod.steps.map((step) => {
      const tip = buildWhyWeTestTip(step);
      return {
        ...step,
        whyWeTestTaglish: tip.tl,
        whyWeTestEnglish: tip.en,
      };
    }),
  })
);

export function getAcademyModulesByLevel(level: TrainingLevel): LabModule[] {
  return ACADEMY_CURRICULUM_MODULES.filter((m) => m.level === level);
}

export function getAcademyModuleById(moduleId: string | null | undefined): LabModule | null {
  if (!moduleId) return null;
  return ACADEMY_CURRICULUM_MODULES.find((m) => m.id === moduleId) || null;
}

export { UNIVERSITY_LAB_MODULES, UNIVERSITY_TIER_META };
