import {
  ACADEMY_CURRICULUM_MODULES,
  type DiagnosticStepSpec,
  type LabModule,
} from '../../data/academy/universityCurriculum';
import { CURATED_VERIFIED_BENCH_ENTRIES } from './offlineEngine';
import type { BenchTelemetry } from '../../types/aiAssistant';

export type VoiceCoachIntent =
  | 'DIRECT_PROBE_QUERY'
  | 'EXPECTED_VALUE_QUERY'
  | 'READING_EVALUATION'
  | 'STEP_NAVIGATION'
  | 'SIMPLIFY_OR_REPEAT'
  | 'DTC_OR_COMPONENT_LOOKUP';

export const VOICE_DB_CONFIDENCE_THRESHOLD = 0.75;

/**
 * Strictly prohibited archaic/dictionary Tagalog terms that sound robotic to Filipino mechanics.
 * Any voice response passing through sanitizeToNaturalTaglish() is guaranteed to replace/ban them.
 */
export const BANNED_DEEP_TAGALOG_WORDS = [
  'sonda',
  'boltaheng sanggunian',
  'talatuntunan',
  'pagpapatunay',
  'kawad',
] as const;

export interface VoiceSessionMemory {
  activeModuleId: string;
  currentStepIndex: number;
  lastFiveResponses: string[];
  confusionCountPerStep: Record<string, number>;
  lastIntent: VoiceCoachIntent | null;
}

export interface VoiceCoachTurnResult {
  intent: VoiceCoachIntent;
  confidence: number;
  spokenText: string;
  displayText: string;
  whyTip: string;
  nextStepIndex: number;
  matchedSource: string;
  usedClarificationFallback: boolean;
  updatedMemory: VoiceSessionMemory;
}

export function createInitialVoiceSessionMemory(
  activeModuleId: string = ACADEMY_CURRICULUM_MODULES[0].id
): VoiceSessionMemory {
  return {
    activeModuleId,
    currentStepIndex: 0,
    lastFiveResponses: [],
    confusionCountPerStep: {},
    lastIntent: null,
  };
}

/**
 * Natural Taglish Lexicon Filter: strips deep/archaic Tagalog and normalizes to warm,
 * respectful Filipino workshop Taglish ("red probe", "5V supply", "wire", "ground", "reading").
 */
export function sanitizeToNaturalTaglish(input: string): string {
  let out = String(input || '');
  const replacements: Array<[RegExp, string]> = [
    [/\bboltaheng\s+sanggunian\b/gi, '5V supply'],
    [/\bsonda\b/gi, 'red probe'],
    [/\btalatuntunan\b/gi, 'guide'],
    [/\bpagpapatunay\b/gi, 'check'],
    [/\bkawad\b/gi, 'wire'],
  ];
  for (const [pattern, replacement] of replacements) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function classifyVoiceIntent(rawTranscript: string): {
  intent: VoiceCoachIntent;
  confidence: number;
  extractedNumber: number | null;
  extractedDtc: string | null;
} {
  const q = rawTranscript.toLowerCase().trim();
  const dtcMatch = rawTranscript.toUpperCase().match(/\b[PBCU][0-3][0-9A-F]{3}\b/);
  const numberMatch = rawTranscript.match(/-?\d+(?:\.\d+)?/);
  const extractedNumber = numberMatch ? Number(numberMatch[0]) : null;

  // 1. SIMPLIFY_OR_REPEAT
  if (
    /\b(ulitin|hindi ko gets|di ko gets|hindi maintindihan|mas simple|simplify|repeat|pakiulit|ulit|huh|ano daw)\b/i.test(
      q
    )
  ) {
    return {
      intent: 'SIMPLIFY_OR_REPEAT',
      confidence: 0.96,
      extractedNumber,
      extractedDtc: dtcMatch?.[0] ?? null,
    };
  }

  // 2. STEP_NAVIGATION
  if (
    /\b(next step|susunod|tapos na|done|next|back|previous|balik|nakaraan|proceed)\b/i.test(q)
  ) {
    return {
      intent: 'STEP_NAVIGATION',
      confidence: 0.95,
      extractedNumber,
      extractedDtc: dtcMatch?.[0] ?? null,
    };
  }

  // 3. READING_EVALUATION (technician reports a numeric reading or asks if their reading is OK)
  if (
    (extractedNumber !== null &&
      /\b(reading|volts?|v\b|ohms?|ohm|amps?|a\b|mv|lumabas|nakuha|tama ba|ok ba|normal ba|meron akong)\b/i.test(
        q
      )) ||
    /\b(tama ba ang reading|ok ba ang reading|zero volts|0 volts|walang boltahe|shorted)\b/i.test(q)
  ) {
    return {
      intent: 'READING_EVALUATION',
      confidence: 0.91,
      extractedNumber,
      extractedDtc: dtcMatch?.[0] ?? null,
    };
  }

  // 4. DIRECT_PROBE_QUERY
  if (
    /\b(saan|where|probe|red probe|black probe|itusok|ikabit|pin|terminal|dmm|multimeter|ground)\b/i.test(
      q
    )
  ) {
    return {
      intent: 'DIRECT_PROBE_QUERY',
      confidence: 0.9,
      extractedNumber,
      extractedDtc: dtcMatch?.[0] ?? null,
    };
  }

  // 5. EXPECTED_VALUE_QUERY
  if (
    /\b(ilan|magkano|expected|spec|dapat|boltahe|voltage|resistance|ohms?|reading dapat|normal|tolerance)\b/i.test(
      q
    )
  ) {
    return {
      intent: 'EXPECTED_VALUE_QUERY',
      confidence: 0.89,
      extractedNumber,
      extractedDtc: dtcMatch?.[0] ?? null,
    };
  }

  // 6. DTC_OR_COMPONENT_LOOKUP
  if (dtcMatch) {
    return {
      intent: 'DTC_OR_COMPONENT_LOOKUP',
      confidence: 0.94,
      extractedNumber,
      extractedDtc: dtcMatch[0],
    };
  }

  const matchedEntry = CURATED_VERIFIED_BENCH_ENTRIES.find((entry) =>
    entry.keywords.some((kw) => q.includes(kw.toLowerCase()))
  );
  if (matchedEntry) {
    return {
      intent: 'DTC_OR_COMPONENT_LOOKUP',
      confidence: 0.84,
      extractedNumber,
      extractedDtc: matchedEntry.dtcCodes?.[0] ?? null,
    };
  }

  return {
    intent: 'DTC_OR_COMPONENT_LOOKUP',
    confidence: 0.42,
    extractedNumber,
    extractedDtc: null,
  };
}

function getModuleAndStep(memory: VoiceSessionMemory): {
  module: LabModule;
  step: DiagnosticStepSpec;
  stepIndex: number;
} {
  const module =
    ACADEMY_CURRICULUM_MODULES.find((m) => m.id === memory.activeModuleId) ||
    ACADEMY_CURRICULUM_MODULES[0];
  const clampedIdx = Math.max(0, Math.min(module.steps.length - 1, memory.currentStepIndex));
  return { module, step: module.steps[clampedIdx], stepIndex: clampedIdx };
}

function pickNonRepeatingVariant(variants: string[], history: string[]): string {
  const cleaned = variants.map(sanitizeToNaturalTaglish);
  for (const candidate of cleaned) {
    if (!history.includes(candidate)) {
      return candidate;
    }
  }
  return cleaned[cleaned.length - 1];
}

function appendHistory(history: string[], nextResponse: string): string[] {
  const updated = [...history, nextResponse];
  return updated.slice(-5);
}

/**
 * Pure local zero-cloud Hands-Free Voice Coach Brain.
 * Enforces 0.75 DB confidence lock, anti-repetition memory, adaptive simplification,
 * and natural Filipino workshop Taglish phrasing.
 */
export function processVoiceCoachTurn(params: {
  transcript: string;
  memory: VoiceSessionMemory;
  telemetry?: Partial<BenchTelemetry>;
}): VoiceCoachTurnResult {
  const { transcript, memory, telemetry } = params;
  const { module, step, stepIndex } = getModuleAndStep(memory);
  const classified = classifyVoiceIntent(transcript);

  const stepKey = `${module.id}:${step.id}`;
  const currentConfusion = memory.confusionCountPerStep[stepKey] || 0;
  const nextConfusionMap = { ...memory.confusionCountPerStep };
  let nextStepIndex = stepIndex;

  // Enforce strict 0.75 DB match threshold before generating technical assertions
  if (classified.confidence < VOICE_DB_CONFIDENCE_THRESHOLD) {
    const clarification = pickNonRepeatingVariant(
      [
        'Sige po, linawin lang natin para sigurado tayo sa verified spec. Aling pin, sensor, o DTC code ang gusto nating i-check ngayon?',
        'Dahan-dahan lang po tayo — hindi ako manghuhula ng pinout. Sabihin lang po kung saan itutusok ang probe, anong expected reading, o anong DTC ang lalabas.',
      ],
      memory.lastFiveResponses
    );
    return {
      intent: classified.intent,
      confidence: classified.confidence,
      spokenText: clarification,
      displayText: clarification,
      whyTip: sanitizeToNaturalTaglish(
        `Active Step ${step.stepNumber}: ${step.titleTaglish} (${step.expectedReadingLabel}).`
      ),
      nextStepIndex,
      matchedSource: 'STRICT_CONFIDENCE_CLARIFICATION',
      usedClarificationFallback: true,
      updatedMemory: {
        ...memory,
        lastIntent: classified.intent,
        lastFiveResponses: appendHistory(memory.lastFiveResponses, clarification),
      },
    };
  }

  let spokenText = '';
  let matchedSource = `${module.exerciseCode}:${step.id}`;
  let whyTip = sanitizeToNaturalTaglish(step.whyWeTestTaglish);

  if (classified.intent === 'DIRECT_PROBE_QUERY') {
    const modeLabel =
      step.requiredPsuState === 'OFF'
        ? `${step.dmmModeDisplay} at siguraduhing OFF muna ang PSU`
        : `${step.dmmModeDisplay}`;
    const variants = [
      `Sige po, sa Step ${step.stepNumber}, ilagay ang black probe sa ${step.blackProbeLabel} at ang red probe sa ${step.redProbeLabel}. I-set ang DMM sa ${modeLabel}.`,
      `Dahan-dahan lang po tayo: black probe muna sa ${step.blackProbeLabel} para sa ground reference, tapos red probe sa ${step.redProbeLabel} gamit ang ${modeLabel}.`,
      `Simple lang po ito — red probe sa ${step.redProbeLabel}, black probe sa ${step.blackProbeLabel}. Huwag kalimutan ang ${modeLabel}.`,
    ];
    spokenText = pickNonRepeatingVariant(variants, memory.lastFiveResponses);
  } else if (classified.intent === 'EXPECTED_VALUE_QUERY') {
    const variants = [
      `Sa Step ${step.stepNumber}, ang expected reading dapat ay ${step.expectedReadingLabel}, na may tolerance na ${step.toleranceLabel}.`,
      `Target reading po natin dito sa ${step.redProbeLabel} ay ${step.expectedReadingLabel} (${step.toleranceLabel}). Kapag lumabas diyan, goods ang circuit.`,
      `Ang normal spec sa verified DB para sa Step ${step.stepNumber} ay ${step.expectedReadingLabel}. Sabihin lang po sa akin kung ano ang lumabas sa DMM mo.`,
    ];
    spokenText = pickNonRepeatingVariant(variants, memory.lastFiveResponses);
  } else if (classified.intent === 'READING_EVALUATION') {
    const measured = classified.extractedNumber;

    if (step.requiredPsuState === 'OFF' && telemetry?.psuEnabled) {
      spokenText = sanitizeToNaturalTaglish(
        'Teka lang po — naka-ON pa ang PSU! I-OFF muna ang Bench Power Supply bago mag-resistance check para ligtas ang ECU at DMM.'
      );
    } else if (measured !== null && Number.isFinite(step.minValue) && Number.isFinite(step.maxValue)) {
      const withinTolerance = measured >= step.minValue && measured <= step.maxValue;
      if (withinTolerance) {
        spokenText = pickNonRepeatingVariant(
          [
            `Ayos, tama po 'yan! Pasok ang ${measured} sa verified spec na ${step.expectedReadingLabel}. Sabihin lang po "Next Step" kapag ready ka na.`,
            `Sakto po! Good reading ang ${measured} kumpara sa target na ${step.expectedReadingLabel}. Pwede na tayong mag-proceed sa susunod na step.`,
          ],
          memory.lastFiveResponses
        );
      } else {
        spokenText = pickNonRepeatingVariant(
          [
            `Napansin ko pong ${measured} ang reading — labas ito sa expected na ${step.expectedReadingLabel}. I-check po natin ang wire continuity, ground sa ${step.blackProbeLabel}, at power supply.`,
            `Medyo mababa o mataas ang ${measured} kumpara sa ${step.expectedReadingLabel}. Subukan muna i-recheck ang red probe sa ${step.redProbeLabel} at tingnan kung may active fault.`,
          ],
          memory.lastFiveResponses
        );
      }
    } else {
      spokenText = pickNonRepeatingVariant(
        [
          `Sige po, i-compare natin ang reading mo sa verified target na ${step.expectedReadingLabel} (${step.toleranceLabel}).`,
          `Expected po natin sa Step ${step.stepNumber} ay ${step.expectedReadingLabel}. Kung malayo ang reading, i-check ang wire at ground connection.`,
        ],
        memory.lastFiveResponses
      );
    }
  } else if (classified.intent === 'STEP_NAVIGATION') {
    const isBack = /\b(back|previous|balik|nakaraan)\b/i.test(transcript);
    if (isBack) {
      nextStepIndex = Math.max(0, stepIndex - 1);
    } else {
      nextStepIndex = Math.min(module.steps.length - 1, stepIndex + 1);
    }
    const targetStep = module.steps[nextStepIndex];
    const atEnd = !isBack && stepIndex === module.steps.length - 1;
    spokenText = atEnd
      ? sanitizeToNaturalTaglish(
          `Ayos, tama po 'yan! Nasa huling step na tayo ng ${module.exerciseCode}. Pwede mo nang isulat ang conclusion at i-export ang SHA-256 verified PDF.`
        )
      : sanitizeToNaturalTaglish(
          `Sige po, lipat tayo sa Step ${targetStep.stepNumber}: ${targetStep.titleTaglish}. Ilagay ang red probe sa ${targetStep.redProbeLabel} at black probe sa ${targetStep.blackProbeLabel}. Expected reading: ${targetStep.expectedReadingLabel}.`
        );
    matchedSource = `${module.exerciseCode}:${targetStep.id}`;
    whyTip = sanitizeToNaturalTaglish(targetStep.whyWeTestTaglish);
  } else if (classified.intent === 'SIMPLIFY_OR_REPEAT') {
    const nextCount = currentConfusion + 1;
    nextConfusionMap[stepKey] = nextCount;
    const isCold = step.requiredPsuState === 'OFF';
    const coldWarning = isCold ? 'Siguraduhing OFF muna ang PSU. ' : '';
    const simplifiedVariants = [
      `Dahan-dahan lang po tayo. ${coldWarning}Sa Step ${step.stepNumber}, dalawang wire lang: red probe sa ${step.redProbeLabel}, black probe sa ${step.blackProbeLabel}. Dapat makita mo ay ${step.expectedReadingLabel}.`,
      `Mas simple pa po: ${coldWarning}tignan lang ang DMM sa ${step.dmmModeDisplay}. Itusok ang black probe sa ${step.blackProbeLabel}, tapos red probe sa ${step.redProbeLabel}. Target reading: ${step.expectedReadingLabel}.`,
      `Step-by-step po tayo — una, ${isCold ? 'patayin ang PSU' : 'i-ON ang PSU'}. Pangalawa, black probe sa ${step.blackProbeLabel}. Pangatlo, red probe sa ${step.redProbeLabel}. Hanapin ang ${step.expectedReadingLabel}.`,
    ];
    spokenText = pickNonRepeatingVariant(simplifiedVariants, memory.lastFiveResponses);
  } else {
    // DTC_OR_COMPONENT_LOOKUP
    if (classified.extractedDtc) {
      const dtcEntry = CURATED_VERIFIED_BENCH_ENTRIES.find((entry) =>
        entry.dtcCodes?.includes(classified.extractedDtc!)
      );
      if (dtcEntry) {
        matchedSource = `LOCAL_VERIFIED_DB:${classified.extractedDtc}`;
        spokenText = pickNonRepeatingVariant(
          [
            `Ang ${classified.extractedDtc} (${dtcEntry.subject}) — ${dtcEntry.rootCauseTL} Unang i-check: ${dtcEntry.verificationStepTL}`,
            `Sa verified DB natin para sa ${classified.extractedDtc}: ${dtcEntry.verificationStepTL}`,
          ],
          memory.lastFiveResponses
        );
        whyTip = sanitizeToNaturalTaglish(
          `${dtcEntry.subject}: ${dtcEntry.verificationBulletsTL[0] || dtcEntry.rootCauseTL}`
        );
      } else {
        const notFound = sanitizeToNaturalTaglish(
          `Wala sa offline DTC table ang ${classified.extractedDtc}. I-check muna ang power, ground, at 5V supply bago magpalit ng pyesa.`
        );
        spokenText = notFound;
        matchedSource = 'DTC_NOT_IN_LOCAL_DB';
      }
    } else {
      const q = transcript.toLowerCase();
      const matchedEntry = CURATED_VERIFIED_BENCH_ENTRIES.find((entry) =>
        entry.keywords.some((kw) => q.includes(kw.toLowerCase()))
      );
      if (matchedEntry) {
        matchedSource = `LOCAL_VERIFIED_DB:${matchedEntry.id}`;
        spokenText = pickNonRepeatingVariant(
          [
            `Sige po, para sa ${matchedEntry.subject}: ${matchedEntry.rootCauseTL} ${matchedEntry.verificationStepTL}`,
            `Dahan-dahan lang po tayo — ${matchedEntry.verificationStepTL}`,
          ],
          memory.lastFiveResponses
        );
        whyTip = sanitizeToNaturalTaglish(
          matchedEntry.verificationBulletsTL[0] || matchedEntry.rootCauseTL
        );
      } else {
        spokenText = sanitizeToNaturalTaglish(
          `Naka-focus tayo ngayon sa Step ${step.stepNumber} (${step.titleTaglish}). Expected reading: ${step.expectedReadingLabel}.`
        );
      }
    }
  }

  const sanitized = sanitizeToNaturalTaglish(spokenText);

  return {
    intent: classified.intent,
    confidence: classified.confidence,
    spokenText: sanitized,
    displayText: sanitized,
    whyTip,
    nextStepIndex,
    matchedSource,
    usedClarificationFallback: false,
    updatedMemory: {
      ...memory,
      currentStepIndex: nextStepIndex,
      lastIntent: classified.intent,
      confusionCountPerStep: nextConfusionMap,
      lastFiveResponses: appendHistory(memory.lastFiveResponses, sanitized),
    },
  };
}
