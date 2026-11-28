/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type {
  EvidenceHierarchyLevel,
  RepairReferenceRecord,
} from '../../types/automotiveKnowledge';
import type { BenchTelemetry, BilingualLang } from '../../types/aiAssistant';
import { searchAutomotiveKnowledge, type ScoredReference } from '../automotiveKnowledgeService';
import {
  formatEvidenceHeader,
  getEvidenceDescriptor,
  type EvidenceLevelDescriptor,
} from './evidenceHierarchy';
import {
  validateResponseNumbersAgainstEvidence,
  type NumericValidationReport,
} from './numericValidator';
import { scrubSensitiveDataForCloud, type PrivacyScrubResult } from './privacyFilter';
import {
  adoptMultiStoreLocalKnowledge,
  type AdoptedKnowledgeItem,
} from './localKnowledgeAdoptionEngine';
import { getActiveLocalExplainer } from './localWebLlmService';

export type OrchestratorRequestKind =
  | 'SPEC_LOOKUP'
  | 'SIMULATION_DIAGNOSTIC'
  | 'TROUBLESHOOTING_PROCEDURE'
  | 'GENERAL_CONCEPT';

export type OrchestratorExecutionMode =
  | 'DATABASE_ONLY'
  | 'LOCAL_WEBGPU_LLM'
  | 'LOCAL_FALLBACK_EXPLAINER'
  | 'GEMINI_FREE_TIER_ASSIST';

export interface OrchestratorSimulationContext {
  ecuName?: string;
  ecuPartNumber?: string;
  selectedComponent?: string;
  injectedFaults?: string[];
  activeDtcs?: string[];
  dmmReadingSummary?: string;
  psuSummary?: string;
  rpm?: number;
  telemetry?: BenchTelemetry;
}

export interface OrchestratorUserMeasurement {
  label: string;
  valueText: string;
}

export interface UnifiedOrchestratorRequest {
  query: string;
  lang?: BilingualLang;
  make?: string;
  model?: string;
  ecuPartNumber?: string;
  hardwareId?: string;
  softwareId?: string;
  includeUnverifiedDb?: boolean;
  /** Default false in M2 (database-only first). Enabled in M3 when local WebGPU model is loaded. */
  allowLocalLlm?: boolean;
  /** Default false unless admin allowlist & free-tier gateway are active (M4). */
  allowGeminiFreeTier?: boolean;
  isOffline?: boolean;
  simulationContext?: OrchestratorSimulationContext;
  userMeasurements?: OrchestratorUserMeasurement[];
  /** Optional local LLM explainer callback injected by M3 LocalWebLlmService */
  localExplainerFn?: (prompt: string) => Promise<string>;
  /** Optional Gemini free-tier gateway callback injected by M4 */
  cloudExplainerFn?: (sanitizedPrompt: string) => Promise<{ text: string; model: string }>;
}

export interface OrchestratorSourceAttribution {
  id: string;
  title: string;
  sourceDocument: string;
  pageOrSection: string;
  revision: string;
  evidenceLevel: EvidenceHierarchyLevel;
  incompleteIdentificationDisclosure?: string;
}

export interface UnifiedOrchestratorResponse {
  requestId: string;
  requestKind: OrchestratorRequestKind;
  executionMode: OrchestratorExecutionMode;
  evidenceLevel: EvidenceHierarchyLevel;
  evidenceDescriptor: EvidenceLevelDescriptor;
  hasEvidenceGap: boolean;
  answer: string;
  sources: OrchestratorSourceAttribution[];
  incompleteIdentificationDisclosures: string[];
  numericValidation: NumericValidationReport;
  privacyScrub?: PrivacyScrubResult;
  repairDisclaimer: string;
  createdAt: string;
}

export const REPAIR_GUIDANCE_DISCLAIMER =
  'DISCLAIMER: Diagnostic procedures are for trained automotive technicians. All virtual bench readings are SIMULATED and are not physical ECU measurements. Always follow OEM service manuals and workshop electrical safety procedures.';

export function classifyDiagnosticRequest(
  query: string,
  simContext?: OrchestratorSimulationContext
): OrchestratorRequestKind {
  const lower = query.toLowerCase();
  if (
    simContext &&
    (simContext.injectedFaults?.length ||
      simContext.selectedComponent ||
      /\b(?:bench|simulated|dmm|psu|oscilloscope|reading|current\s+fault|active\s+dtc)\b/i.test(lower))
  ) {
    return 'SIMULATION_DIAGNOSTIC';
  }
  if (
    /\b(?:pinout|pin\s*\d+|voltage|ohms?|resistance|frequency|hz|spec|specification|fuse|relay|wiring|part\s*number|89661|37820|23710)\b/i.test(
      lower
    )
  ) {
    return 'SPEC_LOOKUP';
  }
  if (
    /\b(?:how\s+to|diagnose|troubleshoot|test\s+step|procedure|no\s+start|crank|short|open\s+circuit|p0\d{3}|u0\d{3})\b/i.test(
      lower
    )
  ) {
    return 'TROUBLESHOOTING_PROCEDURE';
  }
  return 'GENERAL_CONCEPT';
}

function buildDatabaseOnlyAnswer(params: {
  query: string;
  hits: ScoredReference[];
  adoptedItems?: AdoptedKnowledgeItem[];
  requestKind: OrchestratorRequestKind;
  simContext?: OrchestratorSimulationContext;
  userMeasurements?: OrchestratorUserMeasurement[];
}): {
  text: string;
  evidenceLevel: EvidenceHierarchyLevel;
  hasEvidenceGap: boolean;
} {
  const { query, hits, adoptedItems = [], requestKind, simContext, userMeasurements } = params;

  // Case A: Retrieved database records (primary catalog or multi-store local adoption) exist
  if (hits.length > 0 || adoptedItems.length > 0) {
    const top = hits[0];
    const evidenceLevel: EvidenceHierarchyLevel = top
      ? top.reference.provenance?.evidenceType ||
        (top.reference.verified ? 'VERIFIED_OEM' : 'UNVERIFIED_DB')
      : adoptedItems[0].evidenceLevel;

    const lines: string[] = [formatEvidenceHeader(evidenceLevel)];

    if (simContext) {
      const simParts: string[] = [];
      if (simContext.ecuName) simParts.push(`ECU: ${simContext.ecuName}`);
      if (simContext.selectedComponent) simParts.push(`Component: ${simContext.selectedComponent}`);
      if (simContext.injectedFaults?.length) {
        simParts.push(`Injected Faults: ${simContext.injectedFaults.join(', ')}`);
      }
      if (simContext.dmmReadingSummary) simParts.push(`DMM: ${simContext.dmmReadingSummary}`);
      if (simParts.length > 0) {
        lines.push(`[SIMULATED BENCH CONTEXT — ${formatEvidenceHeader('SIMULATED_RESULT')}] ${simParts.join(' | ')}`);
      }
    }

    if (userMeasurements?.length) {
      lines.push(
        `[${formatEvidenceHeader('USER_MEASUREMENT')}] ${userMeasurements
          .map((m) => `${m.label}: ${m.valueText}`)
          .join(' | ')}`
      );
    }

    const seenTitles = new Set<string>();
    for (const hit of hits.slice(0, 3)) {
      const ref: RepairReferenceRecord = hit.reference;
      const prov = ref.provenance;
      seenTitles.add(ref.title.toLowerCase().trim());
      const unverifiedTag =
        !ref.verified || prov?.verificationStatus === 'PENDING' || prov?.verificationStatus === 'CAPTURED'
          ? ' [UNVERIFIED RECORD]'
          : '';
      lines.push(
        `• ${ref.make} ${ref.model} (${ref.years}) — ${ref.title}${unverifiedTag}: ${ref.summary}`
      );
      if (ref.electricalSpecs?.length) {
        for (const sp of ref.electricalSpecs) {
          const specBits = [
            sp.pinNumber,
            sp.signalName,
            sp.voltageRange,
            sp.resistanceRange,
            sp.frequencyRange,
            sp.testCondition ? `(${sp.testCondition})` : '',
          ].filter(Boolean);
          lines.push(`  - Spec: ${specBits.join(' | ')}`);
        }
      }
      if (prov) {
        lines.push(
          `  - Source: ${prov.sourceDocument} (${prov.pageOrSection}, Rev: ${prov.revision}) | Test Conditions: ${prov.testConditions}`
        );
      }
      if (hit.incompleteIdentificationDisclosure) {
        lines.push(`  - Identification Notice: ${hit.incompleteIdentificationDisclosure}`);
      }
    }

    for (const item of adoptedItems.slice(0, 3)) {
      const normTitle = item.title.toLowerCase().trim();
      if (seenTitles.has(normTitle)) continue;
      seenTitles.add(normTitle);
      const badge = item.evidenceLevel === 'UNVERIFIED_DB' ? ' [UNVERIFIED RECORD]' : '';
      lines.push(`• [${item.store}] ${item.title}${badge}: ${item.summary}`);
      lines.push(`  - Source: ${item.sourceDocument} (${item.pageOrSection}, Rev: ${item.revision})`);
    }

    return {
      text: lines.join('\n'),
      evidenceLevel,
      hasEvidenceGap: false,
    };
  }

  // Case B: Simulation diagnostic with live virtual bench context but no OEM DB match
  if (requestKind === 'SIMULATION_DIAGNOSTIC' && simContext) {
    const lines: string[] = [
      formatEvidenceHeader('SIMULATED_RESULT'),
      `SIMULATED Virtual Bench Context (not a physical ECU measurement):`,
    ];
    if (simContext.ecuName) lines.push(`• Selected Virtual ECU: ${simContext.ecuName}`);
    if (simContext.selectedComponent) lines.push(`• Active Component: ${simContext.selectedComponent}`);
    if (simContext.injectedFaults?.length) {
      lines.push(`• Active Simulated Faults: ${simContext.injectedFaults.join(', ')}`);
    }
    if (simContext.activeDtcs?.length) {
      lines.push(`• Simulated DTCs: ${simContext.activeDtcs.join(', ')}`);
    }
    if (simContext.dmmReadingSummary) {
      lines.push(`• SIMULATED DMM Reading: ${simContext.dmmReadingSummary}`);
    }
    if (simContext.psuSummary) {
      lines.push(`• SIMULATED PSU State: ${simContext.psuSummary}`);
    }
    lines.push(
      'Information Gap: No exact OEM database record matched this specific ECU/component query. Verify exact factory wiring diagram before physical testing.'
    );
    return {
      text: lines.join('\n'),
      evidenceLevel: 'SIMULATED_RESULT',
      hasEvidenceGap: true,
    };
  }

  // Case C: Missing evidence / Information Gap — NEVER invent specs
  const gapMessage = [
    formatEvidenceHeader('GENERAL_AI'),
    `Information Gap — Missing Database Evidence: No verified OEM or technician-confirmed record was found in the AutoElectric Lab Pro database for "${query.trim()}".`,
    'AutoElectric Lab Pro does not fabricate pin numbers, voltages, resistances, frequencies, or OEM repair procedures when database evidence is absent.',
    'Next Step: Verify the exact vehicle VIN, ECU part number, hardware/software ID, and consult the official OEM factory service manual.',
  ].join('\n');

  return {
    text: gapMessage,
    evidenceLevel: 'GENERAL_AI',
    hasEvidenceGap: true,
  };
}

const GENERIC_QUERY_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'what', 'how', 'why', 'when', 'where', 'this', 'that',
  'ecu', 'ecm', 'pcm', 'pin', 'pinout', 'voltage', 'volts', 'resistance', 'ohms', 'frequency',
  'hz', 'spec', 'specs', 'specification', 'specifications', 'test', 'check', 'diagnose',
  'repair', 'manual', 'diagram', 'wiring', 'bench', 'circuit', 'sensor', 'system', 'module',
  'analyze', 'current', 'fault', 'unknown', 'trainer', 'is', 'on', 'in', 'of', 'to', 'a', 'an',
]);

function filterHighPrecisionHits(query: string, rawHits: ScoredReference[]): ScoredReference[] {
  if (rawHits.length === 0) return [];
  const entityTokens = query
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length >= 3 && !GENERIC_QUERY_WORDS.has(t));

  if (entityTokens.length === 0) {
    return rawHits;
  }

  return rawHits.filter((hit) => {
    if (
      hit.matchTier === 'EXACT_ECU_PART_NUMBER' ||
      hit.matchTier === 'EXACT_HARDWARE_SOFTWARE_ID'
    ) {
      return true;
    }
    const haystack = [
      hit.reference.make,
      hit.reference.model,
      hit.reference.years,
      hit.reference.title,
      hit.reference.summary,
      hit.reference.ecuIdentity?.partNumber || '',
      hit.reference.ecuIdentity?.hardwareId || '',
      hit.reference.ecuIdentity?.engineCode || '',
      ...(hit.reference.tags || []),
    ]
      .join(' ')
      .toLowerCase();

    const matchedEntities = entityTokens.filter((tok) => haystack.includes(tok));
    return matchedEntities.length > 0;
  });
}

/**
 * Single Unified AI Orchestrator (Master Developer Instruction v1.1, Section 6).
 * Database-first truth -> Optional Local WebGPU LLM explainer -> Optional Gemini Free-Tier assist
 * -> Mandatory Numeric Validator -> Mandatory 6-tier Evidence Attribution.
 */
export async function runUnifiedAiOrchestrator(
  req: UnifiedOrchestratorRequest
): Promise<UnifiedOrchestratorResponse> {
  const createdAt = new Date().toISOString();
  const requestId = `orch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const query = req.query.trim();
  const requestKind = classifyDiagnosticRequest(query, req.simulationContext);

  // 1. Database-first retrieval (excludes unverified/captured/pending by default unless opted in)
  const rawHits = searchAutomotiveKnowledge({
    query,
    make: req.make,
    model: req.model,
    ecuPartNumber: req.ecuPartNumber || req.simulationContext?.ecuPartNumber,
    hardwareId: req.hardwareId,
    softwareId: req.softwareId,
    verifiedOnly: !req.includeUnverifiedDb,
    includeUnverified: Boolean(req.includeUnverifiedDb),
  });
  const hits = filterHighPrecisionHits(query, rawHits);

  // 1b. Multi-store local knowledge adoption (ECU PCB KB, FuseBoxInfo, StartMyCar, PH 2080, Adaptive KB, opt-in Archive.org)
  const adopted = adoptMultiStoreLocalKnowledge({
    query,
    make: req.make,
    model: req.model,
    includeUnverified: Boolean(req.includeUnverifiedDb),
    maxItems: 4,
  });

  // 2. Build deterministic database-only baseline answer
  const dbBaseline = buildDatabaseOnlyAnswer({
    query,
    hits,
    adoptedItems: adopted.items,
    requestKind,
    simContext: req.simulationContext,
    userMeasurements: req.userMeasurements,
  });

  // Build strict evidence corpus for the Numeric Validator
  const evidenceTexts: string[] = [
    ...hits.slice(0, 5).map((h) => {
      const specText = (h.reference.electricalSpecs || [])
        .map(
          (s) =>
            `${s.pinNumber || ''} ${s.signalName || ''} ${s.voltageRange || ''} ${s.resistanceRange || ''} ${s.frequencyRange || ''}`
        )
        .join(' ');
      return `${h.reference.title} ${h.reference.summary} ${specText} ${h.reference.ecuIdentity?.partNumber || ''}`;
    }),
    ...adopted.items.map((a) => `${a.title} ${a.summary} ${a.specsText}`),
  ];
  if (req.simulationContext) {
    evidenceTexts.push(
      [
        req.simulationContext.ecuName,
        req.simulationContext.ecuPartNumber,
        req.simulationContext.dmmReadingSummary,
        req.simulationContext.psuSummary,
        req.simulationContext.injectedFaults?.join(' '),
        req.simulationContext.activeDtcs?.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
    );
  }
  if (req.userMeasurements?.length) {
    evidenceTexts.push(req.userMeasurements.map((m) => `${m.label} ${m.valueText}`).join(' '));
  }

  let finalCandidateText = dbBaseline.text;
  let executionMode: OrchestratorExecutionMode = 'DATABASE_ONLY';
  let privacyScrub: PrivacyScrubResult | undefined;

  // 3. Optional Local WebGPU LLM explainer (auto-connects to loaded LocalWebLlmService when allowLocalLlm=true)
  const resolvedLocalExplainer = req.localExplainerFn ?? (req.allowLocalLlm ? getActiveLocalExplainer() : null);
  if (!dbBaseline.hasEvidenceGap && req.allowLocalLlm && resolvedLocalExplainer) {
    try {
      const localPrompt = [
        'Explain ONLY the retrieved automotive evidence below in concise, technician-friendly language. Quote exact values verbatim; do NOT invent new pin numbers, voltages, ohms, or frequencies.',
        `Language: ${req.lang === 'TL' ? 'Taglish / Filipino-English' : 'English'}`,
        `Query: ${query}`,
        adopted.localLlmContextBlock
          ? `Multi-Store Adopted Context:\n${adopted.localLlmContextBlock}`
          : '',
        `Evidence:\n${dbBaseline.text}`,
      ]
        .filter(Boolean)
        .join('\n\n');
      const llmOutput = await resolvedLocalExplainer(localPrompt);
      if (llmOutput && llmOutput.trim()) {
        finalCandidateText = `${formatEvidenceHeader(dbBaseline.evidenceLevel)}\n${llmOutput.trim()}`;
        executionMode = 'LOCAL_WEBGPU_LLM';
      }
    } catch {
      // Graceful fallback to database-only mode on local LLM failure (Section 9)
      executionMode = 'DATABASE_ONLY';
    }
  } else if (
    !req.isOffline &&
    req.allowGeminiFreeTier &&
    req.cloudExplainerFn &&
    !dbBaseline.hasEvidenceGap
  ) {
    // 4. Optional Gemini Free-Tier Gateway assist (strictly scrubbed of PII/identifiers)
    privacyScrub = scrubSensitiveDataForCloud(
      `Query: ${query}\nRetrieved Evidence:\n${dbBaseline.text}`
    );
    try {
      const cloudRes = await req.cloudExplainerFn(privacyScrub.sanitizedText);
      if (cloudRes?.text?.trim()) {
        finalCandidateText = `${formatEvidenceHeader(dbBaseline.evidenceLevel)}\n${cloudRes.text.trim()}`;
        executionMode = 'GEMINI_FREE_TIER_ASSIST';
      }
    } catch {
      // Free-tier quota exhausted or unavailable -> continue locally with zero paid fallback
      executionMode = 'DATABASE_ONLY';
    }
  }

  // 5. Mandatory Numeric Validator (Section 6.1)
  const numericValidation = validateResponseNumbersAgainstEvidence({
    candidateText: finalCandidateText,
    evidenceTexts,
    mode: 'FLAG',
  });

  const primarySources: OrchestratorSourceAttribution[] = hits.slice(0, 5).map((h) => ({
    id: h.reference.id,
    title: h.reference.title,
    sourceDocument: h.reference.provenance?.sourceDocument || h.reference.source.sourceName,
    pageOrSection: h.reference.provenance?.pageOrSection || h.reference.systemCategoryId,
    revision: h.reference.provenance?.revision || 'v1',
    evidenceLevel:
      h.reference.provenance?.evidenceType ||
      (h.reference.verified ? 'VERIFIED_OEM' : 'UNVERIFIED_DB'),
    incompleteIdentificationDisclosure: h.incompleteIdentificationDisclosure,
  }));

  const seenSourceIds = new Set(primarySources.map((s) => s.title.toLowerCase()));
  const adoptedSources: OrchestratorSourceAttribution[] = adopted.items
    .filter((a) => !seenSourceIds.has(a.title.toLowerCase()))
    .map((a) => ({
      id: a.id,
      title: a.title,
      sourceDocument: a.sourceDocument,
      pageOrSection: a.pageOrSection,
      revision: a.revision,
      evidenceLevel: a.evidenceLevel,
    }));

  const sources: OrchestratorSourceAttribution[] = [...primarySources, ...adoptedSources].slice(0, 6);

  const incompleteIdentificationDisclosures = Array.from(
    new Set(
      hits
        .slice(0, 5)
        .map((h) => h.incompleteIdentificationDisclosure)
        .filter((d): d is string => Boolean(d))
    )
  );

  return {
    requestId,
    requestKind,
    executionMode,
    evidenceLevel: dbBaseline.evidenceLevel,
    evidenceDescriptor: getEvidenceDescriptor(dbBaseline.evidenceLevel),
    hasEvidenceGap: dbBaseline.hasEvidenceGap,
    answer: numericValidation.sanitizedText,
    sources,
    incompleteIdentificationDisclosures,
    numericValidation,
    privacyScrub,
    repairDisclaimer: REPAIR_GUIDANCE_DISCLAIMER,
    createdAt,
  };
}
