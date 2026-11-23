import {
  ACADEMY_CURRICULUM_MODULES,
  type DiagnosticStepSpec,
  type LabModule,
} from '../../data/academy/universityCurriculum';
import { ECU_BRAND_PROFILES } from '../../components/ecuPinoutData';
import type { LabTab } from '../../components/LabTopNav';
import { DEFAULT_ECU_PINS } from '../../simulation/ecu/BenchCircuitSolver';
import type {
  BenchTelemetry,
  BilingualLang,
  VerifiedKnowledgeRecord,
} from '../../types/aiAssistant';
import type { EcuPin } from '../../types/ecu';
import { TABLE16_DLC_INTERFACES } from '../../utils/oemKnowledgeDatabase';
import { searchTroubleScenariosRanked } from '../../utils/troubleScenarioLookup';
import { CURATED_VERIFIED_BENCH_ENTRIES } from './offlineEngine';
import {
  getSystemTopicById,
  getSystemTopicByTab,
  matchSystemModuleTopic,
  type SystemVoiceModuleTopic,
  type VoiceModalAction,
} from './systemVoiceKnowledgeBase';

export type VoiceCoachIntent =
  | 'DIRECT_PROBE_QUERY'
  | 'EXPECTED_VALUE_QUERY'
  | 'READING_EVALUATION'
  | 'STEP_NAVIGATION'
  | 'SIMPLIFY_OR_REPEAT'
  | 'DTC_OR_COMPONENT_LOOKUP'
  | 'SYSTEM_FEATURE_GUIDE'
  | 'FOLLOW_UP_DETAILS'
  | 'WORKSPACE_NAVIGATION'
  | 'LIVE_BENCH_STATUS'
  | 'PINOUT_OR_ECU_LOOKUP';

export type VoiceActionTarget =
  | { type: 'TAB'; tab: LabTab; label: string }
  | { type: 'MODAL'; modal: VoiceModalAction; label: string };

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
  'kasangkapan',
  'daluyan',
  'kuryenteng dumadaloy',
  'tagapagkontrol',
  'panukat ng boltahe',
  'pagsisiyasat',
  'pangangasiwa',
] as const;

export interface VoiceSessionMemory {
  activeModuleId: string;
  currentStepIndex: number;
  lastFiveResponses: string[];
  confusionCountPerStep: Record<string, number>;
  lastIntent: VoiceCoachIntent | null;
  lastTopicId?: string | null;
  lastTopicType?:
    | 'SYSTEM_MODULE'
    | 'PIN'
    | 'DTC'
    | 'SCENARIO'
    | 'ECU_PROFILE'
    | 'ACADEMY_STEP'
    | null;
  activeTab?: LabTab;
  lang?: BilingualLang;
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
  /** Executed immediately when the user commands "Buksan ang 3D twin" / "Punta sa Pinouts" */
  navigationAction?: VoiceActionTarget | null;
  /** Rendered as a 1-tap button on the floating dock when discussing a module */
  suggestedAction?: VoiceActionTarget | null;
  /** Structured bullet points shown in the floating dock panel */
  detailsBullets?: string[];
  /** Contextual follow-up suggestion chips */
  followUpChips?: string[];
}

export function createInitialVoiceSessionMemory(
  activeModuleId: string = ACADEMY_CURRICULUM_MODULES[0].id,
  activeTab: LabTab = 'BENCH_LAB',
  lang: BilingualLang = 'TL'
): VoiceSessionMemory {
  return {
    activeModuleId,
    currentStepIndex: 0,
    lastFiveResponses: [],
    confusionCountPerStep: {},
    lastIntent: null,
    lastTopicId: getSystemTopicByTab(activeTab).id,
    lastTopicType: 'SYSTEM_MODULE',
    activeTab,
    lang,
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
    [/\bkuryenteng\s+dumadaloy\b/gi, 'current'],
    [/\bpanukat\s+ng\s+boltahe\b/gi, 'multimeter'],
    [/\bsonda\b/gi, 'red probe'],
    [/\btalatuntunan\b/gi, 'guide'],
    [/\bpagpapatunay\b/gi, 'check'],
    [/\bkawad\b/gi, 'wire'],
    [/\bkasangkapan\b/gi, 'tools'],
    [/\bdaluyan\b/gi, 'line'],
    [/\btagapagkontrol\b/gi, 'ECU controller'],
    [/\bpagsisiyasat\b/gi, 'inspection'],
    [/\bpangangasiwa\b/gi, 'management'],
  ];
  for (const [pattern, replacement] of replacements) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s+/g, ' ').trim();
}

function buildTopicAction(
  topic: SystemVoiceModuleTopic,
  lang: BilingualLang
): VoiceActionTarget | null {
  const label = lang === 'EN' ? topic.actionLabelEN : topic.actionLabelTL;
  if (topic.tabTarget) {
    return { type: 'TAB', tab: topic.tabTarget, label };
  }
  if (topic.modalTarget) {
    return { type: 'MODAL', modal: topic.modalTarget, label };
  }
  return null;
}

function matchEcuProfile(rawTranscript: string) {
  const q = rawTranscript.toLowerCase();
  return ECU_BRAND_PROFILES.find((profile) => {
    const tokens = [
      profile.brandName,
      profile.modelName,
      profile.popularVehiclesInPH,
      profile.benchHardwareProfile?.ecuFamily,
      profile.benchHardwareProfile?.mcuArchitecture,
    ]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase());
    return tokens.some((tok) => {
      if (tok.length < 3) return false;
      const parts = tok.split(/[\s/(),-]+/).filter((p) => p.length >= 4);
      return parts.some((p) => q.includes(p));
    });
  });
}

function matchSpecificPin(rawTranscript: string, pins: EcuPin[]): EcuPin | null {
  const q = rawTranscript.toLowerCase();
  const pinNumMatch = q.match(/\bpin\s*#?\s*(\d{1,2})\b/i);
  if (pinNumMatch) {
    const num = Number(pinNumMatch[1]);
    const found = pins.find((p) => p.pinNumber === num);
    if (found) return found;
  }
  // Match canonical pin signal names like KL30, KL15, KL31, VREF_5V, SGND, TPS_SIG, MAP_SIG, ECT_SIG, INJ_1, IGN_1, CAN_H, CAN_L, O2_SIG, FP_RELAY, MRELAY
  for (const pin of pins) {
    const labelLower = pin.label.toLowerCase();
    const labelSpaced = labelLower.replace(/_/g, ' ');
    if (
      q.includes(labelLower) ||
      (labelSpaced.length >= 4 && q.includes(labelSpaced))
    ) {
      return pin;
    }
  }
  return null;
}

export function classifyVoiceIntent(
  rawTranscript: string,
  pins: EcuPin[] = DEFAULT_ECU_PINS
): {
  intent: VoiceCoachIntent;
  confidence: number;
  extractedNumber: number | null;
  extractedDtc: string | null;
  matchedTopicId: string | null;
  matchedPinNumber: number | null;
} {
  const q = rawTranscript.toLowerCase().trim();
  const dtcMatch = rawTranscript.toUpperCase().match(/\b[PBCU][0-3][0-9A-F]{3}\b/);
  const numberMatch = rawTranscript.match(/-?\d+(?:\.\d+)?/);
  const extractedNumber = numberMatch ? Number(numberMatch[0]) : null;
  const topicMatch = matchSystemModuleTopic(q);
  const specificPin = matchSpecificPin(q, pins);

  // 1. SIMPLIFY_OR_REPEAT
  if (
    /\b(ulitin|hindi ko gets|di ko gets|hindi maintindihan|mas simple|simplify|repeat|pakiulit|ulit|huh|ano daw|hindi malinaw)\b/i.test(
      q
    )
  ) {
    return {
      intent: 'SIMPLIFY_OR_REPEAT',
      confidence: 0.96,
      extractedNumber,
      extractedDtc: dtcMatch?.[0] ?? null,
      matchedTopicId: topicMatch?.topic.id ?? null,
      matchedPinNumber: specificPin?.pinNumber ?? null,
    };
  }

  // 2. STEP_NAVIGATION (Academy lab step next/back)
  if (
    /\b(next step|susunod|tapos na|done|next|back|previous|balik|nakaraan|proceed)\b/i.test(q) &&
    !/\b(buksan|open|punta|lipat|switch)\b/i.test(q)
  ) {
    return {
      intent: 'STEP_NAVIGATION',
      confidence: 0.95,
      extractedNumber,
      extractedDtc: dtcMatch?.[0] ?? null,
      matchedTopicId: topicMatch?.topic.id ?? null,
      matchedPinNumber: specificPin?.pinNumber ?? null,
    };
  }

  // 3. WORKSPACE_NAVIGATION ("Buksan ang 3D twin", "Punta sa Pinouts", "Lipat sa BenchLab")
  const hasNavigationVerb =
    /\b(buksan|ibukas|punta|pumunta|lipat|lumipat|switch|open|go to|navigate|ipakita|show me|dalhin|ilabas)\b/i.test(
      q
    );
  const hasHowToVerb = /\b(paano|pano|how to|how do|ano ang|anong|what is|what's)\b/i.test(q);
  if (hasNavigationVerb && topicMatch && !hasHowToVerb) {
    return {
      intent: 'WORKSPACE_NAVIGATION',
      confidence: Math.max(0.94, topicMatch.score),
      extractedNumber,
      extractedDtc: dtcMatch?.[0] ?? null,
      matchedTopicId: topicMatch.topic.id,
      matchedPinNumber: specificPin?.pinNumber ?? null,
    };
  }

  // 4. FOLLOW_UP_DETAILS ("Anong meron doon?", "Ano nasa loob?", "What's inside?", "Ano pa?")
  const isFollowUpPattern =
    /\b(anong meron doon|ano meron doon|anong meron dun|ano meron dun|ano ang meron doon|ano ang meron dun|ano nasa loob|anong nasa loob|ano pa ang nasa loob|anong laman|ano laman|ano pwede gawin doon|ano gagawin doon|what'?s inside|what is inside|tell me more|more details|ano pa|paano simulan)\b/i.test(
      q
    );
  if (isFollowUpPattern) {
    return {
      intent: 'FOLLOW_UP_DETAILS',
      confidence: 0.93,
      extractedNumber,
      extractedDtc: dtcMatch?.[0] ?? null,
      matchedTopicId: topicMatch?.topic.id ?? null,
      matchedPinNumber: specificPin?.pinNumber ?? null,
    };
  }

  // 5. LIVE_BENCH_STATUS ("Ano status ng bench?", "Ano reading ngayon?", "Ok ba 'to?", "Saan nakakabit?", "Bakit zero?")
  if (
    /\b(status ng bench|bench status|status ng psu|status ng power|naka[- ]?on ba|anong fault|active fault|active dtc|anong dtc|reading ng dmm|reading ng multimeter|live reading|ilan amps|current draw|nag[- ]?trip ba|ocp status|ano nasa bench)\b/i.test(
      q
    ) ||
    (extractedNumber === null &&
      (/\b(ano|anong)\s+(ba\s+)?(ang\s+)?reading(\s+ngayon)?\b/i.test(q) ||
        /\b(ok|okay|goods|normal|tama)\s+ba\s+('?to|ito|iyan|yan)\b/i.test(q) ||
        /\b(saan\s+nakakabit(\s+ang\s+(red\s+probe|black\s+probe|probes?|dmm))?|anong\s+pin\s+naka[- ]?(probe|kabit)|which\s+pin\s+is\s+probed)\b/i.test(
          q
        ) ||
        /\b(bakit\s+(zero|0(\.0+)?v?|walang\s+reading|walang\s+boltahe)|why\s+is\s+(it|the\s+reading)\s+zero)\b/i.test(
          q
        )))
  ) {
    return {
      intent: 'LIVE_BENCH_STATUS',
      confidence: 0.94,
      extractedNumber,
      extractedDtc: dtcMatch?.[0] ?? null,
      matchedTopicId: topicMatch?.topic.id ?? null,
      matchedPinNumber: specificPin?.pinNumber ?? null,
    };
  }

  // 6. READING_EVALUATION (technician reports a numeric reading or asks if their reading is OK)
  if (
    (extractedNumber !== null &&
      !/\bpin\s*#?\s*\d+/i.test(q) &&
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
      matchedTopicId: topicMatch?.topic.id ?? null,
      matchedPinNumber: specificPin?.pinNumber ?? null,
    };
  }

  // 7. SYSTEM_FEATURE_GUIDE ("Paano gamitin ang BenchLab / pinouts / 3D twin / oscilloscope / PCB scanner?")
  if (
    topicMatch &&
    (/\b(paano|pano|how|gamitin|use|ano ang|anong|what|meron|guide|tulong|help|explain|ipaliwanag|para saan|silbi)\b/i.test(
      q
    ) ||
      topicMatch.score >= 0.93)
  ) {
    // Keep DIRECT_PROBE_QUERY and specific Pin/OBD-II DLC lookups higher priority than generic module guides
    const askingProbePlacement = /\b(red probe|black probe|itusok|ikabit ang probe|saan ang probe)\b/i.test(q);
    const askingSpecificPinOrObd = Boolean(specificPin) || /\b(obd[- ]?2|obd[- ]?ii|dlc)\b/i.test(q);
    if (!askingProbePlacement && !askingSpecificPinOrObd) {
      return {
        intent: 'SYSTEM_FEATURE_GUIDE',
        confidence: Math.max(0.9, topicMatch.score),
        extractedNumber,
        extractedDtc: dtcMatch?.[0] ?? null,
        matchedTopicId: topicMatch.topic.id,
        matchedPinNumber: specificPin?.pinNumber ?? null,
      };
    }
  }

  // 8. DIRECT_PROBE_QUERY ("Saan itutusok ang red probe?")
  if (
    /\b(saan|where|probe|red probe|black probe|itusok|ikabit|terminal|dmm|multimeter|ground)\b/i.test(
      q
    ) &&
    !specificPin
  ) {
    return {
      intent: 'DIRECT_PROBE_QUERY',
      confidence: 0.9,
      extractedNumber,
      extractedDtc: dtcMatch?.[0] ?? null,
      matchedTopicId: topicMatch?.topic.id ?? null,
      matchedPinNumber: null,
    };
  }

  // 9. PINOUT_OR_ECU_LOOKUP (Specific ECU pin number/label, OBD DLC pin, or OEM brand/model profile)
  const ecuProfile = matchEcuProfile(q);
  if (
    specificPin ||
    ecuProfile ||
    /\b(obd[- ]?2|obd[- ]?ii|dlc pin)\b/i.test(q)
  ) {
    return {
      intent: 'PINOUT_OR_ECU_LOOKUP',
      confidence: 0.91,
      extractedNumber,
      extractedDtc: dtcMatch?.[0] ?? null,
      matchedTopicId: 'sys-ecu-pinouts',
      matchedPinNumber: specificPin?.pinNumber ?? null,
    };
  }

  // 10. EXPECTED_VALUE_QUERY
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
      matchedTopicId: topicMatch?.topic.id ?? null,
      matchedPinNumber: null,
    };
  }

  // 11. DTC_OR_COMPONENT_LOOKUP (DTC code, Curated DB, or PH 2,080 Trouble Scenarios)
  if (dtcMatch) {
    return {
      intent: 'DTC_OR_COMPONENT_LOOKUP',
      confidence: 0.94,
      extractedNumber,
      extractedDtc: dtcMatch[0],
      matchedTopicId: topicMatch?.topic.id ?? null,
      matchedPinNumber: null,
    };
  }

  const matchedEntry = CURATED_VERIFIED_BENCH_ENTRIES.find((entry) =>
    entry.keywords.some((kw) => q.includes(kw.toLowerCase()))
  );
  if (matchedEntry) {
    return {
      intent: 'DTC_OR_COMPONENT_LOOKUP',
      confidence: 0.85,
      extractedNumber,
      extractedDtc: matchedEntry.dtcCodes?.[0] ?? null,
      matchedTopicId: topicMatch?.topic.id ?? null,
      matchedPinNumber: null,
    };
  }

  // Check PH 2,080 Trouble Scenarios ranked lookup (require meaningful automotive query tokens >= 4 chars)
  const meaningfulWords = q
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !/^(asdf|blah|test|xxxx|zzzz)/.test(w));
  if (meaningfulWords.length >= 1) {
    const scenarioMatches = searchTroubleScenariosRanked({ query: q });
    if (scenarioMatches.length > 0 && scenarioMatches.length <= 250) {
      return {
        intent: 'DTC_OR_COMPONENT_LOOKUP',
        confidence: 0.84,
        extractedNumber,
        extractedDtc: scenarioMatches[0].relatedDtcs?.[0] ?? null,
        matchedTopicId: 'sys-repair-guide',
        matchedPinNumber: null,
      };
    }
  }

  // 12. Warm Greeting / System Onboarding ("Hello", "Hi coach", "Kumusta", "Magandang araw")
  if (
    /\b(hello|hi|hey|kumusta|kamusta|magandang umaga|magandang hapon|magandang gabi|good morning|good afternoon|good evening|coach|hoy|boss)\b/i.test(
      q
    )
  ) {
    return {
      intent: 'SYSTEM_FEATURE_GUIDE',
      confidence: 0.88,
      extractedNumber,
      extractedDtc: null,
      matchedTopicId: 'sys-overview',
      matchedPinNumber: null,
    };
  }

  return {
    intent: 'DTC_OR_COMPONENT_LOOKUP',
    confidence: 0.42,
    extractedNumber,
    extractedDtc: null,
    matchedTopicId: null,
    matchedPinNumber: null,
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
 * Full-System Zero-Cloud Hands-Free Voice Coach Brain.
 * Grounded across the entire AutoElectric Lab Pro database:
 *  - All 7 Workspace Tabs & Tool Guides (BenchLab, Pinouts, 3D Twin, Wiring, Scope, PCB, Repair)
 *  - Live MNA Bench Telemetry, PSU/DMM & 16 ECU Pin Voltages
 *  - OEM ECU Brand Profiles & OBD-II DLC Mapping (Zero Fabrication)
 *  - Curated Verified Entries + IndexedDB Verified Knowledge + 2,080 PH Trouble Scenarios
 *  - 3-Tier University Academy Curriculum (12 Modules)
 */
export function processVoiceCoachTurn(params: {
  transcript: string;
  memory: VoiceSessionMemory;
  telemetry?: Partial<BenchTelemetry>;
  activeTab?: LabTab;
  lang?: BilingualLang;
  pins?: EcuPin[];
  nodeVoltages?: Record<string, number>;
  cachedKnowledge?: VerifiedKnowledgeRecord[];
}): VoiceCoachTurnResult {
  const {
    transcript,
    memory,
    telemetry,
    activeTab = memory.activeTab || 'BENCH_LAB',
    lang = memory.lang || 'TL',
    pins = DEFAULT_ECU_PINS,
    nodeVoltages = {},
    cachedKnowledge = [],
  } = params;

  const { module, step, stepIndex } = getModuleAndStep(memory);
  const classified = classifyVoiceIntent(transcript, pins);

  const stepKey = `${module.id}:${step.id}`;
  const currentConfusion = memory.confusionCountPerStep[stepKey] || 0;
  const nextConfusionMap = { ...memory.confusionCountPerStep };
  let nextStepIndex = stepIndex;
  let nextTopicId = classified.matchedTopicId ?? memory.lastTopicId ?? getSystemTopicByTab(activeTab).id;
  let nextTopicType: VoiceSessionMemory['lastTopicType'] = memory.lastTopicType || 'SYSTEM_MODULE';
  let navigationAction: VoiceActionTarget | null = null;
  let suggestedAction: VoiceActionTarget | null = null;
  let detailsBullets: string[] | undefined;
  let followUpChips: string[] | undefined;

  // Check IndexedDB Verified Knowledge cache before falling into low-confidence clarification
  if (classified.confidence < VOICE_DB_CONFIDENCE_THRESHOLD && cachedKnowledge.length > 0) {
    const qLower = transcript.toLowerCase();
    const cachedHit = cachedKnowledge.find((entry) => {
      const matchedTokens = entry.tokens.filter((tok) => tok.length >= 3 && qLower.includes(tok.toLowerCase()));
      return matchedTokens.length >= 2 || (entry.subject && qLower.includes(entry.subject.toLowerCase()));
    });
    if (cachedHit) {
      const reply = sanitizeToNaturalTaglish(
        lang === 'EN'
          ? `From verified local cache for ${cachedHit.subject}: ${cachedHit.rootCauseSummary} Next check: ${cachedHit.verificationStep}`
          : `Sige po, base sa verified local cache natin para sa ${cachedHit.subject}: ${cachedHit.rootCauseSummary} Tara, i-check muna ito: ${cachedHit.verificationStep}`
      );
      return {
        intent: 'DTC_OR_COMPONENT_LOOKUP',
        confidence: Math.max(0.82, cachedHit.confidence),
        spokenText: reply,
        displayText: reply,
        whyTip: sanitizeToNaturalTaglish(cachedHit.safetyWarning),
        nextStepIndex,
        matchedSource: `INDEXEDDB_VERIFIED_CACHE:${cachedHit.id}`,
        usedClarificationFallback: false,
        detailsBullets: [cachedHit.rootCauseSummary, cachedHit.verificationStep],
        followUpChips:
          lang === 'EN'
            ? ['What is the bench status?', 'How to use BenchLab?', 'Open ECU Pinouts']
            : ['Ano status ng bench?', 'Paano gamitin ang BenchLab?', 'Buksan ang Pinouts'],
        updatedMemory: {
          ...memory,
          activeTab,
          lang,
          lastIntent: 'DTC_OR_COMPONENT_LOOKUP',
          lastTopicType: 'DTC',
          lastFiveResponses: appendHistory(memory.lastFiveResponses, reply),
        },
      };
    }
  }

  // Enforce strict 0.75 DB match threshold before generating technical assertions
  if (classified.confidence < VOICE_DB_CONFIDENCE_THRESHOLD) {
    const clarification = pickNonRepeatingVariant(
      lang === 'EN'
        ? [
            'Let us clarify so we stay strictly on verified specs. You can ask how to use BenchLab, Pinouts, or the 3D Twin, check live bench status, or ask about any pin or DTC code.',
            'I never guess specs or pinouts. Try asking "How to use 3D Twin?", "What is the bench status?", or name a specific pin or DTC code.',
          ]
        : [
            'Wait lang po, linawin lang natin para sigurado tayo sa verified spec. Pwede po kayong magtanong ng "Paano gamitin ang BenchLab?", "Ano reading ngayon?", o banggitin ang pin number o DTC code.',
            'Sandali lang po — hindi po ako manghuhula ng pinout. Sabihin lang po kung aling module (BenchLab, Pinouts, 3D Twin, Oscilloscope), pin number, o DTC ang gusto nating i-check.',
          ],
      memory.lastFiveResponses
    );
    return {
      intent: classified.intent,
      confidence: classified.confidence,
      spokenText: clarification,
      displayText: clarification,
      whyTip: sanitizeToNaturalTaglish(
        lang === 'EN'
          ? `Active workspace: ${getSystemTopicByTab(activeTab).titleEN}. Try one of the quick questions below.`
          : `Nandito po tayo ngayon sa ${getSystemTopicByTab(activeTab).titleTL}. Subukan lang po ang mabilisang tanong sa ibaba.`
      ),
      nextStepIndex,
      matchedSource: 'STRICT_CONFIDENCE_CLARIFICATION',
      usedClarificationFallback: true,
      followUpChips:
        lang === 'EN'
          ? ['How to use BenchLab?', 'How to use pinouts?', 'How to use 3D twin?', 'What is the bench status?']
          : ['Paano gamitin ang BenchLab?', 'Ano reading ngayon?', 'Paano gamitin ang 3D twin?', 'Ano status ng bench?'],
      updatedMemory: {
        ...memory,
        activeTab,
        lang,
        lastIntent: classified.intent,
        lastFiveResponses: appendHistory(memory.lastFiveResponses, clarification),
      },
    };
  }

  let spokenText = '';
  let matchedSource = `${module.exerciseCode}:${step.id}`;
  let whyTip = sanitizeToNaturalTaglish(step.whyWeTestTaglish);

  // ---------------------------------------------------------------------------
  // A. WORKSPACE_NAVIGATION ("Buksan ang 3D twin", "Punta sa Pinouts")
  // ---------------------------------------------------------------------------
  if (classified.intent === 'WORKSPACE_NAVIGATION') {
    const topic =
      getSystemTopicById(classified.matchedTopicId) || getSystemTopicByTab(activeTab);
    nextTopicId = topic.id;
    nextTopicType = 'SYSTEM_MODULE';
    const action = buildTopicAction(topic, lang);
    navigationAction = action;
    suggestedAction = action;
    matchedSource = `SYSTEM_NAVIGATION:${topic.id}`;
    whyTip = sanitizeToNaturalTaglish(lang === 'EN' ? topic.safetyTipEN : topic.safetyTipTL);
    detailsBullets = lang === 'EN' ? topic.whatsInsideBulletsEN : topic.whatsInsideBulletsTL;
    followUpChips = lang === 'EN' ? topic.followUpChipsEN : topic.followUpChipsTL;

    spokenText = pickNonRepeatingVariant(
      lang === 'EN'
        ? [
            `Opening ${topic.titleEN} now. ${topic.howToUseEN}`,
            `Switching to ${topic.titleEN}. Ask "What's inside there?" anytime for a quick tour.`,
          ]
        : [
            `Sige po, binubuksan ko na ang ${topic.titleTL}. ${topic.howToUseTL}`,
            `Lipat na po tayo sa ${topic.titleTL}. Sabihin lang po "Anong meron doon?" kung gusto mo ng mabilis na guide.`,
          ],
      memory.lastFiveResponses
    );
  }
  // ---------------------------------------------------------------------------
  // B. FOLLOW_UP_DETAILS ("Anong meron doon?", "Ano nasa loob?")
  // ---------------------------------------------------------------------------
  else if (classified.intent === 'FOLLOW_UP_DETAILS') {
    const topic =
      getSystemTopicById(classified.matchedTopicId) ||
      getSystemTopicById(memory.lastTopicId) ||
      getSystemTopicByTab(activeTab);
    nextTopicId = topic.id;
    nextTopicType = 'SYSTEM_MODULE';
    suggestedAction = buildTopicAction(topic, lang);
    matchedSource = `SYSTEM_FOLLOWUP:${topic.id}`;
    whyTip = sanitizeToNaturalTaglish(lang === 'EN' ? topic.safetyTipEN : topic.safetyTipTL);
    detailsBullets = lang === 'EN' ? topic.whatsInsideBulletsEN : topic.whatsInsideBulletsTL;
    followUpChips = lang === 'EN' ? topic.followUpChipsEN : topic.followUpChipsTL;

    spokenText = pickNonRepeatingVariant(
      lang === 'EN'
        ? [topic.whatsInsideEN, topic.whatsInsideAltEN]
        : [topic.whatsInsideTL, topic.whatsInsideAltTL],
      memory.lastFiveResponses
    );
  }
  // ---------------------------------------------------------------------------
  // C. SYSTEM_FEATURE_GUIDE ("Paano gamitin ang BenchLab / Pinouts / 3D Twin?")
  // ---------------------------------------------------------------------------
  else if (classified.intent === 'SYSTEM_FEATURE_GUIDE') {
    const topic =
      getSystemTopicById(classified.matchedTopicId) || getSystemTopicByTab(activeTab);
    nextTopicId = topic.id;
    nextTopicType = 'SYSTEM_MODULE';
    suggestedAction = buildTopicAction(topic, lang);
    matchedSource = `SYSTEM_MANUAL:${topic.id}`;
    whyTip = sanitizeToNaturalTaglish(lang === 'EN' ? topic.safetyTipEN : topic.safetyTipTL);
    detailsBullets = lang === 'EN' ? topic.whatsInsideBulletsEN : topic.whatsInsideBulletsTL;
    followUpChips = lang === 'EN' ? topic.followUpChipsEN : topic.followUpChipsTL;

    const isGreeting =
      /\b(hello|hi|hey|kumusta|kamusta|magandang umaga|magandang hapon|magandang gabi|good morning|good afternoon|good evening)\b/i.test(
        transcript
      );
    if (isGreeting && topic.id === 'sys-overview') {
      spokenText = pickNonRepeatingVariant(
        lang === 'EN'
          ? [
              'Hello! I am your Hands-Free Lab Coach. Ask me how to use BenchLab, ECU Pinouts, or the 3D Twin, check live bench readings, or say "Open 3D Twin" to switch tabs.',
              'Ready to assist! You can ask about any workspace tool, live pin voltages, DTC codes, or Academy lab steps.',
            ]
          : [
              'Hello po! Handa na akong tumulong sa buong AutoElectric Lab Pro. Magtanong lang ng "Paano gamitin ang BenchLab?", "Paano gamitin ang pinouts?", "Paano gamitin ang 3D twin?", o sabihing "Buksan ang 3D twin".',
              'Kumusta po! Naka-connect na ako sa buong database ng bench. Itanong lang ang kahit anong module, live pin voltage, o DTC code.',
            ],
        memory.lastFiveResponses
      );
    } else {
      spokenText = pickNonRepeatingVariant(
        lang === 'EN'
          ? [
              topic.howToUseEN,
              `${topic.howToUseEN} Ask "What's inside there?" if you want the full feature breakdown.`,
            ]
          : [
              topic.howToUseTL,
              `${topic.howToUseTL} Pwede mo ring itanong ang "Anong meron doon?" para isa-isahin natin ang laman.`,
            ],
        memory.lastFiveResponses
      );
    }
  }
  // ---------------------------------------------------------------------------
  // D. LIVE_BENCH_STATUS (Real-time MNA Bench Telemetry, DMM Reading & Probe Readout)
  // ---------------------------------------------------------------------------
  else if (classified.intent === 'LIVE_BENCH_STATUS') {
    const psuEnabled = Boolean(telemetry?.psuEnabled);
    const psuVolts = typeof telemetry?.psuVoltageSetting === 'number' ? telemetry.psuVoltageSetting : 12.6;
    const psuAmps = typeof telemetry?.psuCurrentDrawAmps === 'number' ? telemetry.psuCurrentDrawAmps : 0;
    const isOcp = Boolean(telemetry?.isOcpTripped);
    const dmmReading = telemetry?.dmm?.displayReading ?? '0.00';
    const dmmUnit = telemetry?.dmm?.unit ?? 'V';
    const dmmMode = telemetry?.dmm?.mode ?? 'V_DC';
    const redLabel = telemetry?.dmm?.redProbeLabel || 'Red Probe';
    const blackLabel = telemetry?.dmm?.blackProbeLabel || 'COM Ground';
    const selectedPin = telemetry?.selectedPin;
    const dtcList = telemetry?.activeDtcs || [];
    const faultList = telemetry?.activeFaults || [];
    const activeTabTopic = getSystemTopicByTab(activeTab);
    const qLower = transcript.toLowerCase();

    nextTopicId = 'sys-bench-lab';
    nextTopicType = 'SYSTEM_MODULE';
    matchedSource = 'LIVE_MNA_BENCH_TELEMETRY';
    suggestedAction = buildTopicAction(activeTabTopic, lang);

    const psuSummaryTL = isOcp
      ? 'Naku, naka-OCP TRIP po ngayon ang Bench Power Supply dahil may short o sobrang current draw!'
      : psuEnabled
        ? `Naka-ON po ang Bench Power Supply sa ${psuVolts.toFixed(1)}V at kumukuha ng ${psuAmps.toFixed(2)}A.`
        : 'Naka-OFF po ngayon ang Bench Power Supply — safe na safe para sa cold resistance check.';

    const psuSummaryEN = isOcp
      ? 'Bench Power Supply is in OCP TRIP due to a short or over-current draw!'
      : psuEnabled
        ? `Bench Power Supply is ON at ${psuVolts.toFixed(1)}V drawing ${psuAmps.toFixed(2)}A.`
        : 'Bench Power Supply is currently OFF — safe for cold resistance checks.';

    const faultSummaryTL =
      faultList.length > 0 || dtcList.length > 0
        ? `May ${faultList.length} active fault at ${dtcList.length} DTC (${dtcList.map((d) => d.code).join(', ') || 'none'}).`
        : 'Malinis po ang bench — walang active fault o DTC ngayon.';

    const faultSummaryEN =
      faultList.length > 0 || dtcList.length > 0
        ? `There are ${faultList.length} active faults and ${dtcList.length} DTCs (${dtcList.map((d) => d.code).join(', ') || 'none'}).`
        : 'No active injected faults or DTCs right now.';

    const askingWhyZero =
      /\b(bakit\s+(zero|0(\.0+)?v?|walang\s+reading|walang\s+boltahe)|why\s+is\s+(it|the\s+reading)\s+zero)\b/i.test(
        qLower
      );
    const askingProbeAttach =
      /\b(saan\s+nakakabit|nakakabit\s+ba|anong\s+pin\s+naka[- ]?(probe|kabit)|which\s+pin\s+is\s+probed)\b/i.test(
        qLower
      );
    const askingOkCheck =
      /\b(ok|okay|goods|normal|tama)\s+ba\s+('?to|ito|iyan|yan)\b/i.test(qLower);
    const askingReadingNow =
      /\b(ano|anong)\s+(ba\s+)?(ang\s+)?reading(\s+ngayon)?\b/i.test(qLower);

    if (askingWhyZero) {
      spokenText =
        lang === 'EN'
          ? isOcp
            ? `Your reading is zero because the Bench PSU is in OCP TRIP (${psuAmps.toFixed(2)}A). Switch PSU OFF, clear the short on ${faultList[0]?.pinId || 'the harness'}, then check ohms.`
            : !psuEnabled
              ? `It reads ${dmmReading} ${dmmUnit} because the Bench Power Supply is currently OFF. Turn PSU ON at ${psuVolts.toFixed(1)}V if you want a live voltage check.`
              : `It reads ${dmmReading} ${dmmUnit} on ${redLabel} even with PSU ON at ${psuVolts.toFixed(1)}V. Check for an open wire or short-to-ground (${faultList.length} active faults, DTCs: ${dtcList.map((d) => d.code).join(', ') || 'none'}).`
          : isOcp
            ? `Wait lang po — zero po ang boltahe dahil nag-OCP TRIP ang Power Supply (${psuAmps.toFixed(2)}A). I-OFF muna ang PSU at tanggalin ang short bago subukan ulit.`
            : !psuEnabled
              ? `Sandali lang po, kaya ${dmmReading} ${dmmUnit} ang reading sa ${redLabel} ay dahil naka-OFF pa po ang Bench Power Supply. I-ON po muna sa ${psuVolts.toFixed(1)}V kung magche-check ng live voltage.`
              : `Tara, i-check natin — naka-ON ang PSU sa ${psuVolts.toFixed(1)}V pero ${dmmReading} ${dmmUnit} lang ang lumalabas sa ${redLabel}. Posibleng may putol na wire o short-to-ground po (${faultSummaryTL}).`;
    } else if (askingProbeAttach) {
      const selectedNoteTL = selectedPin
        ? ` Naka-highlight din ngayon ang Pin ${selectedPin.pinNumber} (${selectedPin.label}).`
        : '';
      const selectedNoteEN = selectedPin
        ? ` Selected pin is Pin ${selectedPin.pinNumber} (${selectedPin.label}).`
        : '';
      spokenText =
        lang === 'EN'
          ? `Red probe is attached to ${redLabel} and Black COM probe is on ${blackLabel}, reading ${dmmReading} ${dmmUnit} in ${dmmMode} mode.${selectedNoteEN}`
          : `Sige po — naka-kabit ngayon ang red probe sa ${redLabel} at ang black probe sa ${blackLabel}, kaya nagbabasa ito ng ${dmmReading} ${dmmUnit} (${dmmMode}).${selectedNoteTL}`;
    } else if (askingOkCheck) {
      const pinMeasured = selectedPin?.measuredVoltage;
      const pinNominal = selectedPin?.nominalVoltage;
      const outOfSpec =
        isOcp ||
        faultList.length > 0 ||
        dtcList.length > 0 ||
        (psuEnabled &&
          typeof pinMeasured === 'number' &&
          typeof pinNominal === 'number' &&
          Math.abs(pinMeasured - pinNominal) > Math.max(0.8, pinNominal * 0.25));

      spokenText =
        lang === 'EN'
          ? outOfSpec
            ? `Hold on — something looks off on the bench. ${psuSummaryEN} DMM reads ${dmmReading} ${dmmUnit} on ${redLabel}. ${faultSummaryEN}`
            : `Looks good! ${psuSummaryEN} DMM reads ${dmmReading} ${dmmUnit} on ${redLabel} with ${faultSummaryEN.toLowerCase()}`
          : outOfSpec
            ? `Wait lang po, may napapansin akong problema sa bench! ${psuSummaryTL} Sa ${redLabel}, ${dmmReading} ${dmmUnit} ang lumalabas at ${faultSummaryTL} Tara, i-check natin ang wiring at faults.`
            : `Goods po 'yan! Normal ang bench reading ngayon: ${psuSummaryTL} Nasa ${dmmReading} ${dmmUnit} ang DMM sa ${redLabel} at walang active fault.`;
    } else if (askingReadingNow) {
      spokenText =
        lang === 'EN'
          ? `Live DMM reading right now is ${dmmReading} ${dmmUnit} (${dmmMode}) from ${redLabel} to ${blackLabel}. ${psuSummaryEN} ${faultSummaryEN}`
          : `Sige po, ang live DMM reading ngayon ay ${dmmReading} ${dmmUnit} sa ${dmmMode} mode (${redLabel} papuntang ${blackLabel}). ${psuSummaryTL} ${faultSummaryTL}`;
    } else {
      spokenText = pickNonRepeatingVariant(
        lang === 'EN'
          ? [
              `Live simulated bench status: ${psuSummaryEN} Multimeter reads ${dmmReading} ${dmmUnit} in ${dmmMode} mode. ${faultSummaryEN}`,
              `Simulated bench telemetry: ${psuSummaryEN} ${faultSummaryEN} DMM is showing ${dmmReading} ${dmmUnit}.`,
            ]
          : [
              `Sige po, ito ang live simulated bench status ngayon: ${psuSummaryTL} Ang DMM ay nagbabasa ng ${dmmReading} ${dmmUnit} (${dmmMode}) sa ${redLabel}. ${faultSummaryTL}`,
              `Sandali lang po, base sa live bench simulator: ${psuSummaryTL} Reading ng DMM: ${dmmReading} ${dmmUnit}. ${faultSummaryTL}`,
            ],
        memory.lastFiveResponses
      );
    }

    whyTip = sanitizeToNaturalTaglish(
      lang === 'EN'
        ? 'Simulated MNA Bench Telemetry — not a physical vehicle measurement.'
        : 'Paalala lang po: Simulated MNA Bench Telemetry ito — hindi aktwal na reading sa totoong sasakyan.'
    );
    detailsBullets = [
      `PSU: ${isOcp ? 'OCP TRIP' : psuEnabled ? `ON · ${psuVolts.toFixed(1)}V / ${psuAmps.toFixed(2)}A` : 'OFF (Cold Safe)'}`,
      `DMM (${dmmMode}): ${dmmReading} ${dmmUnit} (${redLabel} → ${blackLabel})`,
      `Active Faults: ${faultList.length} · Active DTCs: ${dtcList.length > 0 ? dtcList.map((d) => d.code).join(', ') : 'None'}`,
      `Vehicle / ECU: ${telemetry?.vehicleLabel || 'Universal Trainer'} · ${telemetry?.ecuProfileLabel || '16-Pin Bench'}`,
    ];
    followUpChips =
      lang === 'EN'
        ? ['What is the reading right now?', 'Where are probes attached?', 'Why is it zero?', 'What is Pin 5?']
        : ['Ano reading ngayon?', "Ok ba 'to?", 'Saan nakakabit?', 'Bakit zero?'];
  }
  // ---------------------------------------------------------------------------
  // E. PINOUT_OR_ECU_LOOKUP (Specific Pin 1-16, OBD-II DLC, or OEM ECU Profile)
  // ---------------------------------------------------------------------------
  else if (classified.intent === 'PINOUT_OR_ECU_LOOKUP') {
    const specificPin = matchSpecificPin(transcript, pins);
    const ecuProfile = matchEcuProfile(transcript);
    const isObdDlcQuery = /\b(obd[- ]?2|obd[- ]?ii|dlc)\b/i.test(transcript);

    nextTopicId = 'sys-ecu-pinouts';
    suggestedAction = {
      type: 'TAB',
      tab: 'ECU_PINOUT',
      label: lang === 'EN' ? 'Open ECU Pinouts' : 'Buksan ang ECU Pinouts',
    };

    if (isObdDlcQuery) {
      nextTopicType = 'PIN';
      matchedSource = 'TABLE16_DLC_INTERFACES';
      spokenText = sanitizeToNaturalTaglish(
        lang === 'EN'
          ? 'Standard SAE J1962 OBD-II DLC pins: Pin 4 is Chassis Ground, Pin 5 is Signal Ground, Pin 6 is CAN High, Pin 14 is CAN Low, and Pin 16 is Battery +12V. Remember OBD-II DLC pins are separate from ECU harness connector pins.'
          : 'Sa standard OBD-II DLC connector: Pin 4 ay Chassis Ground, Pin 5 ay Signal Ground, Pin 6 ay CAN High, Pin 14 ay CAN Low, at Pin 16 ay Battery +12V. Tandaan po na iba ang OBD-II DLC pin numbers sa ECU connector pins.'
      );
      detailsBullets = TABLE16_DLC_INTERFACES.slice(0, 5).map(
        (row) => `${row.brandLabel}: ${row.obd2Pins}`
      );
      whyTip = sanitizeToNaturalTaglish(
        lang === 'EN'
          ? 'Always distinguish SAE J1962 OBD-II DLC pins from ECU harness connector pins.'
          : 'Laging paghiwalayin ang OBD-II DLC connector pins sa ECU harness pins.'
      );
    } else if (specificPin) {
      nextTopicType = 'PIN';
      matchedSource = `BENCH_PINOUT:${specificPin.id}`;
      const liveV = nodeVoltages[specificPin.id];
      const liveTextTL =
        typeof liveV === 'number'
          ? `Ang live simulated voltage ngayon ay ${liveV.toFixed(2)} volts.`
          : '';
      const liveTextEN =
        typeof liveV === 'number'
          ? `Current live simulated voltage is ${liveV.toFixed(2)}V.`
          : '';

      spokenText = sanitizeToNaturalTaglish(
        lang === 'EN'
          ? `Bench Trainer Pin ${specificPin.pinNumber} is ${specificPin.label} (${specificPin.name}). Nominal voltage is ${specificPin.nominalVoltage.toFixed(2)}V. ${liveTextEN} Note: this is the 16-pin bench trainer, not a vehicle-specific OEM pinout.`
          : `Ang Bench Trainer Pin ${specificPin.pinNumber} ay ${specificPin.label} (${specificPin.name}). Ang normal na spec ay ${specificPin.nominalVoltage.toFixed(2)} volts. ${liveTextTL} Paalala: bench trainer pin ito — i-check ang ECU Pinouts tab para sa OEM profile.`
      );
      detailsBullets = [
        `Pin ${specificPin.pinNumber} · ${specificPin.label} (${specificPin.name})`,
        `Category: ${specificPin.category.toUpperCase()} · Nominal: ${specificPin.nominalVoltage.toFixed(2)}V`,
        typeof liveV === 'number' ? `Live Simulated Voltage: ${liveV.toFixed(2)}V` : 'Live Simulated Voltage: PSU Standby',
        `Description: ${specificPin.description}`,
      ];
      whyTip = sanitizeToNaturalTaglish(
        lang === 'EN'
          ? 'Universal 16-Pin Bench Trainer spec — confirm exact OEM ECU part number before physical testing.'
          : 'Universal 16-Pin Bench Trainer spec ito — i-verify muna ang eksaktong OEM ECU part number bago mag-test sa totoong sasakyan.'
      );
    } else if (ecuProfile) {
      nextTopicType = 'ECU_PROFILE';
      matchedSource = `OEM_PROFILE:${ecuProfile.id}`;
      const powerPins = ecuProfile.pinouts
        .filter((p) => p.category === 'power' || p.category === 'ground')
        .slice(0, 4)
        .map((p) => `${p.pinCode || p.pinNumber} (${p.label})`)
        .join(', ');
      const mcuLabel = ecuProfile.benchHardwareProfile?.mcuArchitecture || 'OEM ECU MCU';
      spokenText = sanitizeToNaturalTaglish(
        lang === 'EN'
          ? `Found ECU profile ${ecuProfile.brandName} (${ecuProfile.modelName}, MCU ${mcuLabel}). Key reference pins include ${powerPins || 'see ECU Pinouts tab'}. Open ECU Pinouts to verify connector orientation before energizing.`
          : `Nahanap ko sa database ang ${ecuProfile.brandName} (${ecuProfile.modelName}, MCU ${mcuLabel}). Ilan sa key pins nito ay ${powerPins || 'tingnan sa ECU Pinouts tab'}. Buksan ang ECU Pinouts para i-confirm ang connector orientation bago mag-power up.`
      );
      detailsBullets = [
        `${ecuProfile.brandName} · ${ecuProfile.modelName}`,
        `PH Vehicles: ${ecuProfile.popularVehiclesInPH.slice(0, 110)}`,
        ...ecuProfile.pinouts
          .slice(0, 4)
          .map((p) => `Pin ${p.pinCode || p.pinNumber}: ${p.label} — ${p.signalName}`),
      ];
      whyTip = sanitizeToNaturalTaglish(
        lang === 'EN'
          ? 'Verify physical connector pin numbering and part number label on the ECU case before applying bench power.'
          : 'I-confirm ang totoong ECU part number label at connector orientation bago maglagay ng kuryente.'
      );
    } else {
      const topic = getSystemTopicById('sys-ecu-pinouts')!;
      spokenText = lang === 'EN' ? topic.howToUseEN : topic.howToUseTL;
      detailsBullets = lang === 'EN' ? topic.whatsInsideBulletsEN : topic.whatsInsideBulletsTL;
    }

    followUpChips =
      lang === 'EN'
        ? ['Open ECU Pinouts', 'What is the bench status?', 'How to use 3D twin?']
        : ['Buksan ang Pinouts', 'Ano status ng bench?', 'Paano gamitin ang 3D twin?'];
  }
  // ---------------------------------------------------------------------------
  // F. EXISTING 6 ACADEMY LAB & DIAGNOSTIC INTENTS (100% Backward-Compatible)
  // ---------------------------------------------------------------------------
  else if (classified.intent === 'DIRECT_PROBE_QUERY') {
    nextTopicType = 'ACADEMY_STEP';
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
    nextTopicType = 'ACADEMY_STEP';
    const variants = [
      `Sa Step ${step.stepNumber}, ang expected reading dapat ay ${step.expectedReadingLabel}, na may tolerance na ${step.toleranceLabel}.`,
      `Target reading po natin dito sa ${step.redProbeLabel} ay ${step.expectedReadingLabel} (${step.toleranceLabel}). Kapag lumabas diyan, goods ang circuit.`,
      `Ang normal spec sa verified DB para sa Step ${step.stepNumber} ay ${step.expectedReadingLabel}. Sabihin lang po sa akin kung ano ang lumabas sa DMM mo.`,
    ];
    spokenText = pickNonRepeatingVariant(variants, memory.lastFiveResponses);
  } else if (classified.intent === 'READING_EVALUATION') {
    nextTopicType = 'ACADEMY_STEP';
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
    nextTopicType = 'ACADEMY_STEP';
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
    // If last topic was a system module (not academy step), simplify that module explanation!
    if (memory.lastTopicType === 'SYSTEM_MODULE' && memory.lastTopicId && memory.lastIntent !== 'DIRECT_PROBE_QUERY' && memory.lastIntent !== 'EXPECTED_VALUE_QUERY' && memory.lastIntent !== 'READING_EVALUATION' && memory.lastIntent !== 'STEP_NAVIGATION' && memory.lastIntent !== 'SIMPLIFY_OR_REPEAT') {
      const topic = getSystemTopicById(memory.lastTopicId) || getSystemTopicByTab(activeTab);
      suggestedAction = buildTopicAction(topic, lang);
      detailsBullets = lang === 'EN' ? topic.whatsInsideBulletsEN : topic.whatsInsideBulletsTL;
      spokenText = pickNonRepeatingVariant(
        lang === 'EN'
          ? [
              `Let us make it simpler: ${topic.howToUseEN}`,
              `In short, ${topic.whatsInsideEN}`,
            ]
          : [
              `Dahan-dahan lang po tayo, mas simple: ${topic.howToUseTL}`,
              `Sa madaling salita po: ${topic.whatsInsideTL}`,
            ],
        memory.lastFiveResponses
      );
      matchedSource = `SYSTEM_SIMPLIFY:${topic.id}`;
    } else {
      const isCold = step.requiredPsuState === 'OFF';
      const coldWarning = isCold ? 'Siguraduhing OFF muna ang PSU. ' : '';
      const simplifiedVariants = [
        `Dahan-dahan lang po tayo. ${coldWarning}Sa Step ${step.stepNumber}, dalawang wire lang: red probe sa ${step.redProbeLabel}, black probe sa ${step.blackProbeLabel}. Dapat makita mo ay ${step.expectedReadingLabel}.`,
        `Mas simple pa po: ${coldWarning}tignan lang ang DMM sa ${step.dmmModeDisplay}. Itusok ang black probe sa ${step.blackProbeLabel}, tapos red probe sa ${step.redProbeLabel}. Target reading: ${step.expectedReadingLabel}.`,
        `Step-by-step po tayo — una, ${isCold ? 'patayin ang PSU' : 'i-ON ang PSU'}. Pangalawa, black probe sa ${step.blackProbeLabel}. Pangatlo, red probe sa ${step.redProbeLabel}. Hanapin ang ${step.expectedReadingLabel}.`,
      ];
      spokenText = pickNonRepeatingVariant(simplifiedVariants, memory.lastFiveResponses);
    }
  } else {
    // DTC_OR_COMPONENT_LOOKUP (Curated DB -> PH 2,080 Trouble Scenarios -> Fallback)
    nextTopicType = 'DTC';
    if (classified.extractedDtc) {
      const dtcEntry = CURATED_VERIFIED_BENCH_ENTRIES.find((entry) =>
        entry.dtcCodes?.includes(classified.extractedDtc!)
      );
      if (dtcEntry) {
        matchedSource = `LOCAL_VERIFIED_DB:${classified.extractedDtc}`;
        spokenText = pickNonRepeatingVariant(
        lang === 'EN'
          ? [
              `${classified.extractedDtc} (${dtcEntry.subject}): ${dtcEntry.rootCauseEN} First check: ${dtcEntry.verificationStepEN}`,
              `From verified DB for ${classified.extractedDtc}: ${dtcEntry.verificationStepEN}`,
            ]
          : [
              `Sige po, tungkol sa ${classified.extractedDtc} (${dtcEntry.subject}) — ${dtcEntry.rootCauseTL} Tara, i-check natin una: ${dtcEntry.verificationStepTL}`,
              `Base po sa verified DB natin para sa ${classified.extractedDtc}: ${dtcEntry.verificationStepTL}`,
            ],
        memory.lastFiveResponses
      );
      whyTip = sanitizeToNaturalTaglish(
        lang === 'EN' ? dtcEntry.safetyWarningEN : dtcEntry.safetyWarningTL
      );
      detailsBullets =
        lang === 'EN' ? dtcEntry.verificationBulletsEN : dtcEntry.verificationBulletsTL;
    } else {
      const scenarioHits = searchTroubleScenariosRanked({ query: classified.extractedDtc });
      if (scenarioHits.length > 0) {
        const sc = scenarioHits[0];
        matchedSource = `PH_TROUBLE_DB:${sc.phId}`;
        spokenText = sanitizeToNaturalTaglish(
          lang === 'EN'
            ? `Found ${classified.extractedDtc} in the PH Trouble Scenarios catalog (${sc.phId}: ${sc.title}). Symptom: ${sc.symptoms}. First step: ${sc.diagnosticSteps.split(/;\s*/)[0] || sc.diagnosticSteps}`
            : `Sandali lang po, nahanap ko ang ${classified.extractedDtc} sa PH Trouble Scenarios DB (${sc.phId}: ${sc.title}). Sintomas po: ${sc.symptoms}. Unang i-check: ${sc.diagnosticSteps.split(/;\s*/)[0] || sc.diagnosticSteps}`
        );
        detailsBullets = sc.diagnosticSteps
          .split(/;\s*/)
          .filter(Boolean)
          .slice(0, 4);
        suggestedAction = {
          type: 'TAB',
          tab: 'REPAIR_GUIDE',
          label: lang === 'EN' ? 'Open Repair Manuals' : 'Buksan ang Repair Manuals',
        };
      } else {
        spokenText = sanitizeToNaturalTaglish(
          lang === 'EN'
            ? `${classified.extractedDtc} is not in the offline DTC table. Verify KL30, KL15, KL31 ground, and 5V supply first before replacing parts.`
            : `Wait lang po, wala sa offline DTC table ang ${classified.extractedDtc}. I-check po muna natin ang power, ground, at 5V supply bago magpalit ng pyesa.`
        );
        matchedSource = 'DTC_NOT_IN_LOCAL_DB';
      }
    }
  } else {
    const q = transcript.toLowerCase();
    const matchedEntry = CURATED_VERIFIED_BENCH_ENTRIES.find((entry) =>
      entry.keywords.some((kw) => q.includes(kw.toLowerCase()))
    );
    if (matchedEntry) {
      matchedSource = `LOCAL_VERIFIED_DB:${matchedEntry.id}`;
      spokenText = pickNonRepeatingVariant(
        lang === 'EN'
          ? [
              `For ${matchedEntry.subject}: ${matchedEntry.rootCauseEN} ${matchedEntry.verificationStepEN}`,
              `Step by step: ${matchedEntry.verificationStepEN}`,
            ]
          : [
              `Sige po, para sa ${matchedEntry.subject}: ${matchedEntry.rootCauseTL} ${matchedEntry.verificationStepTL}`,
              `Dahan-dahan lang po tayo — ${matchedEntry.verificationStepTL}`,
            ],
        memory.lastFiveResponses
      );
      whyTip = sanitizeToNaturalTaglish(
        lang === 'EN' ? matchedEntry.safetyWarningEN : matchedEntry.safetyWarningTL
      );
      detailsBullets =
        lang === 'EN' ? matchedEntry.verificationBulletsEN : matchedEntry.verificationBulletsTL;
    } else {
      const scenarioHits = searchTroubleScenariosRanked({ query: q });
      if (scenarioHits.length > 0) {
        const sc = scenarioHits[0];
        nextTopicType = 'SCENARIO';
        matchedSource = `PH_TROUBLE_DB:${sc.phId}`;
        spokenText = sanitizeToNaturalTaglish(
          lang === 'EN'
            ? `From the PH Trouble Scenarios DB (${sc.phId} — ${sc.title}): ${sc.symptoms}. Recommended check: ${sc.diagnosticSteps.split(/;\s*/)[0] || sc.diagnosticSteps}`
            : `Sige po, sa PH Trouble Scenarios database natin (${sc.phId} — ${sc.title}): ${sc.symptoms}. Tara, i-check muna ito: ${sc.diagnosticSteps.split(/;\s*/)[0] || sc.diagnosticSteps}`
        );
        detailsBullets = sc.diagnosticSteps
          .split(/;\s*/)
          .filter(Boolean)
          .slice(0, 4);
        suggestedAction = {
          type: 'TAB',
          tab: 'REPAIR_GUIDE',
          label: lang === 'EN' ? 'Open Repair Manuals' : 'Buksan ang Repair Manuals',
        };
      } else {
        spokenText = sanitizeToNaturalTaglish(
          `Sige po, naka-focus tayo ngayon sa Step ${step.stepNumber} (${step.titleTaglish}). Target reading po: ${step.expectedReadingLabel}.`
        );
      }
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
    navigationAction,
    suggestedAction,
    detailsBullets,
    followUpChips,
    updatedMemory: {
      ...memory,
      activeTab,
      lang,
      currentStepIndex: nextStepIndex,
      lastIntent: classified.intent,
      lastTopicId: nextTopicId,
      lastTopicType: nextTopicType,
      confusionCountPerStep: nextConfusionMap,
      lastFiveResponses: appendHistory(memory.lastFiveResponses, sanitized),
    },
  };
}
