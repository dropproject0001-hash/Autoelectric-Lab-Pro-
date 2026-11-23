import {
  PH_DOMAIN_DEFINITIONS,
  type PhBatchFilter,
  type PhDomainDefinition,
  type PhDomainNumber,
} from '../data/phTroubleScenarios520';
import {
  PH_BENCH_TROUBLE_SCENARIOS,
  type PhBenchTroubleScenario,
  type PhEmulationFidelity,
} from '../simulation/faults/benchTroubleScenarios';

export type TroubleTriagePresetId =
  | 'ALL'
  | 'NO_START_POWER'
  | 'NO_PULSE_CKP'
  | 'VREF_SENSORS'
  | 'CAN_UDS_NET'
  | 'FLOOD_GROUNDS'
  | 'DIESEL_CRDI_24V'
  | 'EV_HV_SAFETY';

export interface TroubleTriagePreset {
  id: TroubleTriagePresetId;
  label: string;
  shortLabel: string;
  description: string;
}

export const TROUBLE_TRIAGE_PRESETS: readonly TroubleTriagePreset[] = [
  {
    id: 'ALL',
    label: 'All Scenarios (2,080)',
    shortLabel: 'All 2,080',
    description: 'Complete Philippine Batches 1–4 catalog across all 48 automotive domains.',
  },
  {
    id: 'NO_START_POWER',
    label: 'No Start / KL30 · KL15',
    shortLabel: 'No Start / Power',
    description: 'Lost battery KL30, ignition KL15, main relay, starter drop, and charging faults.',
  },
  {
    id: 'NO_PULSE_CKP',
    label: 'No Pulse / CKP · IGN · INJ',
    shortLabel: 'No Pulse / CKP',
    description: 'Missing crank/cam sync, no injector pulse, coil primary opens, and misfire DTCs.',
  },
  {
    id: 'VREF_SENSORS',
    label: '5V VREF & Sensors',
    shortLabel: '5V VREF / Sensors',
    description: '5V reference rail collapses, TPS, MAP, MAF, ECT, O2, and analog pull-down shorts.',
  },
  {
    id: 'CAN_UDS_NET',
    label: 'CAN / UDS / LIN / J1939',
    shortLabel: 'CAN / UDS Bus',
    description: 'CAN bus-off, 60Ω/120Ω termination, U-codes, K-Line, LIN, FlexRay, DoIP & J1939.',
  },
  {
    id: 'FLOOD_GROUNDS',
    label: 'Flood / Typhoon & Grounds',
    shortLabel: 'Flood / Grounds',
    description: 'Water ingress, green-crust corrosion, KL31/G101 ground offsets & voltage drops.',
  },
  {
    id: 'DIESEL_CRDI_24V',
    label: 'CRDi / D-4D & 24V Fleet',
    shortLabel: 'CRDi / 24V',
    description: 'Common rail piezo/solenoid injectors, SCV/IMV, VGT turbo, DPF/SCR & 24V heavy trucks.',
  },
  {
    id: 'EV_HV_SAFETY',
    label: 'EV / HV / Immo & Safety',
    shortLabel: 'EV / HV / Safety',
    description: 'Hybrid/BEV isolation, Class 0 HV PPE, immobilizer/smart-key EEPROM & ESD gates.',
  },
];

interface IndexedScenarioEntry {
  scenario: PhBenchTroubleScenario;
  phIdLower: string;
  dtcTokensLower: string[];
  dtcJoinedLower: string;
  titleLower: string;
  contextLower: string;
  symptomsLower: string;
  stepsLower: string;
  domainLower: string;
  pinLower: string;
  fullHaystack: string;
}

const DOMAIN_META_BY_NUMBER = new Map<PhDomainNumber, PhDomainDefinition>(
  PH_DOMAIN_DEFINITIONS.map((d) => [d.domainNumber, d])
);

const INDEXED_ENTRIES: readonly IndexedScenarioEntry[] = PH_BENCH_TROUBLE_SCENARIOS.map(
  (scenario) => {
    const phIdLower = scenario.phId.toLowerCase();
    const dtcTokensLower = scenario.relatedDtcs.map((d) => d.toLowerCase());
    const dtcJoinedLower = `${dtcTokensLower.join(' ')} ${scenario.symptomTag.toLowerCase()}`;
    const titleLower = scenario.title.toLowerCase();
    const contextLower = scenario.phContext.toLowerCase();
    const symptomsLower = scenario.symptoms.toLowerCase();
    const stepsLower = scenario.diagnosticSteps.toLowerCase();
    const domainLower = scenario.domainName.toLowerCase();
    const pinLower = `${scenario.focusPinLabel.toLowerCase()} ${scenario.expectedProbeOutcome.toLowerCase()}`;
    const fullHaystack = [
      phIdLower,
      dtcJoinedLower,
      titleLower,
      contextLower,
      symptomsLower,
      stepsLower,
      domainLower,
      pinLower,
    ].join(' ');

    return {
      scenario,
      phIdLower,
      dtcTokensLower,
      dtcJoinedLower,
      titleLower,
      contextLower,
      symptomsLower,
      stepsLower,
      domainLower,
      pinLower,
      fullHaystack,
    };
  }
);

const ENTRY_BY_PH_ID = new Map<string, IndexedScenarioEntry>(
  INDEXED_ENTRIES.map((e) => [e.scenario.phId.toUpperCase(), e])
);

export function getPhDomainMeta(domainNumber: PhDomainNumber): PhDomainDefinition | undefined {
  return DOMAIN_META_BY_NUMBER.get(domainNumber);
}

export function getIndexedScenarioByPhId(phId: string): PhBenchTroubleScenario | undefined {
  return ENTRY_BY_PH_ID.get(phId.trim().toUpperCase())?.scenario;
}

export function matchesTriagePreset(
  scenario: PhBenchTroubleScenario,
  preset: TroubleTriagePresetId
): boolean {
  if (preset === 'ALL') return true;
  const entry = ENTRY_BY_PH_ID.get(scenario.phId.toUpperCase());
  const text = entry
    ? `${entry.dtcJoinedLower} ${entry.titleLower} ${entry.contextLower} ${entry.symptomsLower} ${entry.domainLower}`
    : `${scenario.title} ${scenario.phContext} ${scenario.symptoms} ${scenario.domainName}`.toLowerCase();

  switch (preset) {
    case 'NO_START_POWER':
      return (
        scenario.domainNumber === 3 ||
        scenario.category === 'POWER_IGNITION' ||
        /\b(kl30|kl15|igsw|main relay|battery|starter|alternator|no crank|no start|p0562|p0563|p0685)\b/.test(
          text
        )
      );
    case 'NO_PULSE_CKP':
      return (
        scenario.focusPinId === 'ecu-pin-10' ||
        scenario.focusPinId === 'ecu-pin-11' ||
        scenario.focusPinId === 'ecu-pin-6' ||
        /\b(no pulse|no spark|ckp|cmp|crankshaft|camshaft|injector|ignition coil|misfire|p033\d|p034\d|p035\d|p020\d|p030\d)\b/.test(
          text
        )
      );
    case 'VREF_SENSORS':
      return (
        scenario.focusPinId === 'ecu-pin-5' ||
        scenario.focusPinId === 'ecu-pin-7' ||
        scenario.focusPinId === 'ecu-pin-8' ||
        scenario.focusPinId === 'ecu-pin-9' ||
        scenario.focusPinId === 'ecu-pin-15' ||
        /\b(5v|vref|tps|map|maf|ect|oxygen|o2|p064\d|p010\d|p011\d|p012\d|p013\d|p022\d)\b/.test(
          text
        )
      );
    case 'CAN_UDS_NET':
      return (
        scenario.domainNumber === 9 ||
        scenario.domainNumber === 43 ||
        scenario.focusPinId === 'ecu-pin-13' ||
        scenario.focusPinId === 'ecu-pin-14' ||
        /\b(can|lin|k-line|uds|doip|j1939|flexray|60\s?ohm|120\s?ohm|termination|obd|dlc|nrc|u0\d{3}|u1\d{3})\b/.test(
          text
        )
      );
    case 'FLOOD_GROUNDS':
      return (
        scenario.domainNumber === 4 ||
        scenario.domainNumber === 32 ||
        scenario.domainNumber === 46 ||
        scenario.category === 'GROUND_WIRING' ||
        /\b(flood|typhoon|water|submerged|corrosion|green crust|kl31|ground|g101|voltage drop|splice)\b/.test(
          text
        )
      );
    case 'DIESEL_CRDI_24V':
      return (
        scenario.domainNumber === 2 ||
        scenario.domainNumber === 12 ||
        scenario.domainNumber === 14 ||
        scenario.domainNumber === 34 ||
        /\b(crdi|d-4d|diesel|vgt|dpf|scr|adblue|scv|imv|piezo|24v|hino|isuzu|fuso|hilux|montero|fortuner)\b/.test(
          text
        )
      );
    case 'EV_HV_SAFETY':
      return (
        scenario.domainNumber === 10 ||
        scenario.domainNumber === 11 ||
        scenario.domainNumber === 21 ||
        scenario.domainNumber === 30 ||
        scenario.domainNumber === 44 ||
        scenario.domainNumber === 47 ||
        scenario.emulationFidelity === 'DIAGNOSTIC_REFERENCE_ONLY' ||
        /\b(hybrid|hev|phev|bev|high-voltage|hv|inverter|bms|class 0|esd|immobilizer|smart key|b2799|eeprom)\b/.test(
          text
        )
      );
  }
}

export interface TroubleLookupFilterOptions {
  query?: string;
  batch?: PhBatchFilter;
  domain?: PhDomainNumber | 'ALL';
  fidelity?: PhEmulationFidelity | 'ALL';
  triagePreset?: TroubleTriagePresetId;
  onlyBookmarkedIds?: ReadonlySet<string>;
}

export function searchTroubleScenariosRanked(
  options: TroubleLookupFilterOptions
): PhBenchTroubleScenario[] {
  const {
    query = '',
    batch = 'ALL',
    domain = 'ALL',
    fidelity = 'ALL',
    triagePreset = 'ALL',
    onlyBookmarkedIds,
  } = options;

  const trimmed = query.trim().toLowerCase();
  const tokens = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
  const isExplicitPh = /^ph-\d/i.test(trimmed);

  const scored: Array<{ scenario: PhBenchTroubleScenario; score: number }> = [];

  for (const entry of INDEXED_ENTRIES) {
    const { scenario } = entry;

    if (onlyBookmarkedIds && !onlyBookmarkedIds.has(scenario.phId)) {
      continue;
    }

    if (!isExplicitPh) {
      if (batch === 'BATCH_1' && scenario.batch !== 1) continue;
      if (batch === 'BATCH_2' && scenario.batch !== 2) continue;
      if (batch === 'BATCH_3' && scenario.batch !== 3) continue;
      if (batch === 'BATCH_4' && scenario.batch !== 4) continue;
    }

    if (domain !== 'ALL' && scenario.domainNumber !== domain) {
      continue;
    }

    if (fidelity !== 'ALL' && scenario.emulationFidelity !== fidelity) {
      continue;
    }

    if (triagePreset !== 'ALL' && !matchesTriagePreset(scenario, triagePreset)) {
      continue;
    }

    if (tokens.length === 0) {
      scored.push({ scenario, score: 0 });
      continue;
    }

    let allMatch = true;
    for (const tok of tokens) {
      if (!entry.fullHaystack.includes(tok)) {
        allMatch = false;
        break;
      }
    }
    if (!allMatch) continue;

    let score = 0;
    for (const tok of tokens) {
      if (entry.phIdLower === tok) score += 1200;
      else if (entry.phIdLower.startsWith(tok)) score += 600;

      if (entry.dtcTokensLower.some((dtc) => dtc === tok)) score += 450;
      else if (entry.dtcJoinedLower.includes(tok)) score += 200;

      if (entry.titleLower.includes(tok)) score += 120;
      if (entry.contextLower.includes(tok)) score += 85;
      if (entry.symptomsLower.includes(tok)) score += 60;
      if (entry.domainLower.includes(tok)) score += 40;
      if (entry.pinLower.includes(tok)) score += 35;
      if (entry.stepsLower.includes(tok)) score += 20;
    }

    if (scenario.emulationFidelity === 'DIRECT_16PIN_FAULT') score += 8;
    else if (scenario.emulationFidelity === 'ELECTRICAL_PROXY') score += 4;

    scored.push({ scenario, score });
  }

  if (tokens.length === 0) {
    return scored.map((item) => item.scenario);
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.scenario.phId.localeCompare(b.scenario.phId, undefined, { numeric: true });
  });

  return scored.map((item) => item.scenario);
}

export function findRelatedTroubleScenarios(
  target: PhBenchTroubleScenario,
  limit = 5
): PhBenchTroubleScenario[] {
  const dtcSet = new Set(target.relatedDtcs.map((d) => d.toUpperCase()));
  const dtcPrefixes = new Set(
    target.relatedDtcs
      .map((d) => d.trim().toUpperCase().slice(0, 4))
      .filter((prefix) => prefix.length >= 4)
  );

  const candidates: Array<{ scenario: PhBenchTroubleScenario; score: number }> = [];

  for (const item of PH_BENCH_TROUBLE_SCENARIOS) {
    if (item.phId === target.phId) continue;

    let score = 0;
    for (const dtc of item.relatedDtcs) {
      const upper = dtc.toUpperCase();
      if (dtcSet.has(upper)) score += 50;
      else if (dtcPrefixes.has(upper.slice(0, 4))) score += 20;
    }
    if (item.focusPinId === target.focusPinId) score += 15;
    if (item.domainNumber === target.domainNumber) score += 12;
    if (item.category === target.category) score += 5;

    if (score >= 15) {
      candidates.push({ scenario: item, score });
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Math.abs(a.scenario.domainNumber - target.domainNumber);
  });

  return candidates.slice(0, limit).map((c) => c.scenario);
}

export function formatScenarioClipboardText(scenario: PhBenchTroubleScenario): string {
  const dtcText = scenario.relatedDtcs.length > 0 ? scenario.relatedDtcs.join(', ') : 'Reference';
  return [
    `${scenario.phId} [${dtcText}] — ${scenario.title.replace(`${scenario.phId}: `, '')}`,
    `Domain ${scenario.domainNumber} (${scenario.domainName}) · Batch ${scenario.batch} · PDF p.${scenario.sourcePage} · Status: ${scenario.provenanceStatus}`,
    `PH Context: ${scenario.phContext}`,
    `Symptoms: ${scenario.symptoms}`,
    `Diagnostic Steps: ${scenario.diagnosticSteps}`,
    `16-Pin Bench Mapping (${scenario.emulationFidelity}): ${scenario.focusPinLabel} · ${scenario.expectedProbeOutcome}`,
    `Bench Note: ${scenario.emulationNote}`,
    'Verification Note: Cross-check exact OEM workshop manual and physical harness polarity before probe or repair.',
  ].join('\n');
}

const RECENT_STORAGE_KEY = 'autoelectric_lookup_recent_ph_ids_v1';
const PINNED_STORAGE_KEY = 'autoelectric_lookup_pinned_ph_ids_v1';
const MAX_RECENT_IDS = 12;

function safeReadIdList(key: string): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string' && ENTRY_BY_PH_ID.has(item.toUpperCase()))
      .map((item) => item.toUpperCase());
  } catch {
    return [];
  }
}

function safeWriteIdList(key: string, ids: string[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // ignore storage quota errors
  }
}

export function loadRecentLookupIds(): string[] {
  return safeReadIdList(RECENT_STORAGE_KEY);
}

export function recordRecentLookupId(phId: string, current?: string[]): string[] {
  const normalized = phId.trim().toUpperCase();
  if (!ENTRY_BY_PH_ID.has(normalized)) {
    return current ?? loadRecentLookupIds();
  }
  const base = current ?? loadRecentLookupIds();
  const next = [normalized, ...base.filter((id) => id !== normalized)].slice(0, MAX_RECENT_IDS);
  safeWriteIdList(RECENT_STORAGE_KEY, next);
  return next;
}

export function loadPinnedLookupIds(): string[] {
  return safeReadIdList(PINNED_STORAGE_KEY);
}

export function togglePinnedLookupId(phId: string, current?: string[]): string[] {
  const normalized = phId.trim().toUpperCase();
  if (!ENTRY_BY_PH_ID.has(normalized)) {
    return current ?? loadPinnedLookupIds();
  }
  const base = current ?? loadPinnedLookupIds();
  const exists = base.includes(normalized);
  const next = exists ? base.filter((id) => id !== normalized) : [normalized, ...base];
  safeWriteIdList(PINNED_STORAGE_KEY, next);
  return next;
}

export function loadFavoriteScenarioIds(): string[] {
  return loadPinnedLookupIds();
}

export function toggleFavoriteScenarioId(phId: string, current?: string[]): string[] {
  return togglePinnedLookupId(phId, current);
}

