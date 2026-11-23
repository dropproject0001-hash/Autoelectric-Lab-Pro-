import rawSaeJ1979 from './saej1979-v3-default.json';
import { AutomotiveRecordProvenance } from '../../types/provenance';
import { buildProvenanceRecord } from '../../utils/provenanceEngine';

export const OBDB_SOURCE_REPO = 'https://github.com/OBDb/SAEJ1979';
export const OBDB_PINNED_COMMIT = 'af749a5c2611455566374c5321b2d38cd25ac563';
export const OBDB_LICENSE_SPDX = 'CC-BY-SA-4.0';
export const OBDB_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';

export interface ObdbSignalFormat {
  bix?: number;
  len: number;
  min?: number;
  max?: number;
  mul?: number;
  div?: number;
  add?: number;
  unit?: string;
  signed?: boolean;
  map?: Record<string, { description?: string; value?: string }>;
}

export interface ObdbRawSignal {
  id: string;
  path: string;
  name: string;
  description?: string;
  fmt: ObdbSignalFormat;
}

export interface ObdbRawCommand {
  hdr: string;
  rax?: string;
  cmd: Record<string, string>;
  freq?: number;
  signals: ObdbRawSignal[];
}

export interface ObdbSignalsetDocument {
  commands: ObdbRawCommand[];
}

export interface ObdbNormalizedPidEntry {
  uid: string;
  serviceModeHex: string;
  pidHex: string;
  txHeader: string;
  rxHeader: string;
  signalId: string;
  path: string;
  name: string;
  description: string;
  unit: string;
  bitOffset: number;
  bitLength: number;
  minValue: number | null;
  maxValue: number | null;
  scalingSummary: string;
  verificationStatus: 'COMMUNITY_UNVERIFIED';
  provenance: AutomotiveRecordProvenance;
}

export interface ObdbSchemaValidationResult {
  valid: boolean;
  commandCount: number;
  signalCount: number;
  errors: string[];
}

/**
 * Validates the structural integrity of an OBDb v3 signalset JSON document.
 */
export function validateObdbSignalsetSchema(doc: unknown): ObdbSchemaValidationResult {
  const errors: string[] = [];
  if (!doc || typeof doc !== 'object') {
    return { valid: false, commandCount: 0, signalCount: 0, errors: ['Root value must be an object.'] };
  }

  const commands = (doc as { commands?: unknown }).commands;
  if (!Array.isArray(commands) || commands.length === 0) {
    return {
      valid: false,
      commandCount: 0,
      signalCount: 0,
      errors: ['Root "commands" must be a non-empty array.'],
    };
  }

  let signalCount = 0;
  commands.forEach((cmdObj, cIdx) => {
    if (!cmdObj || typeof cmdObj !== 'object') {
      errors.push(`commands[${cIdx}] must be an object.`);
      return;
    }
    const c = cmdObj as Record<string, unknown>;
    if (typeof c.hdr !== 'string' || !c.hdr.trim()) {
      errors.push(`commands[${cIdx}].hdr must be a non-empty string.`);
    }
    if (!c.cmd || typeof c.cmd !== 'object' || Object.keys(c.cmd as object).length === 0) {
      errors.push(`commands[${cIdx}].cmd must be a non-empty command map.`);
    }
    if (!Array.isArray(c.signals) || c.signals.length === 0) {
      errors.push(`commands[${cIdx}].signals must be a non-empty array.`);
      return;
    }

    c.signals.forEach((sigObj, sIdx) => {
      signalCount += 1;
      if (!sigObj || typeof sigObj !== 'object') {
        errors.push(`commands[${cIdx}].signals[${sIdx}] must be an object.`);
        return;
      }
      const s = sigObj as Record<string, unknown>;
      if (typeof s.id !== 'string' || !s.id.trim()) {
        errors.push(`commands[${cIdx}].signals[${sIdx}].id missing.`);
      }
      if (typeof s.name !== 'string' || !s.name.trim()) {
        errors.push(`commands[${cIdx}].signals[${sIdx}].name missing.`);
      }
      if (!s.fmt || typeof s.fmt !== 'object') {
        errors.push(`commands[${cIdx}].signals[${sIdx}].fmt missing.`);
      } else {
        const fmt = s.fmt as Record<string, unknown>;
        if (typeof fmt.len !== 'number' || !Number.isFinite(fmt.len) || fmt.len <= 0) {
          errors.push(`commands[${cIdx}].signals[${sIdx}].fmt.len must be > 0.`);
        }
      }
    });
  });

  return {
    valid: errors.length === 0,
    commandCount: commands.length,
    signalCount,
    errors: errors.slice(0, 20),
  };
}

function buildScalingSummary(fmt: ObdbSignalFormat): string {
  const parts: string[] = [];
  if (typeof fmt.mul === 'number') parts.push(`×${fmt.mul}`);
  if (typeof fmt.div === 'number' && fmt.div !== 1) parts.push(`÷${fmt.div}`);
  if (typeof fmt.add === 'number' && fmt.add !== 0) {
    parts.push(`${fmt.add >= 0 ? '+' : ''}${fmt.add}`);
  }
  const mathStr = parts.length > 0 ? `raw ${parts.join(' ')}` : '1:1 raw';
  if (fmt.map && Object.keys(fmt.map).length > 0) {
    return `${mathStr} (${Object.keys(fmt.map).length} enum states)`;
  }
  return mathStr;
}

const OBDB_SHARED_PROVENANCE: AutomotiveRecordProvenance = buildProvenanceRecord({
  origin: 'OBDB_COMMUNITY_REPO',
  sourceName: 'OBDb / SAEJ1979 Open OBD Database',
  sourceUrlOrRef: `${OBDB_SOURCE_REPO}/tree/${OBDB_PINNED_COMMIT}`,
  manufacturer: 'SAE J1979 Generic OBD-II',
  applicableVehicle: 'SAE J1979 OBD-II Compliant Vehicles (Reference Only)',
  publicationOrRevision: `Commit ${OBDB_PINNED_COMMIT.slice(0, 10)} (signalsets/v3/default.json)`,
  confidenceOrUncertainty:
    'COMMUNITY_UNVERIFIED — Community-maintained PID definitions; verify bit scaling and ECU support via live scan or OEM service manual.',
  regionalApplicability: ['GLOBAL', 'NORTH_AMERICA', 'EUROPE', 'JAPAN_DOMESTIC', 'ASEAN', 'PHILIPPINES'],
  dateRetrieved: '2026-11-12T06:05:41Z',
  licenseNotice: `CC BY-SA 4.0 (${OBDB_LICENSE_URL}) — Attribution & ShareAlike required.`,
});

export function loadObdbSaeJ1979Dataset(
  doc: unknown = rawSaeJ1979
): {
  validation: ObdbSchemaValidationResult;
  entries: ObdbNormalizedPidEntry[];
  provenance: AutomotiveRecordProvenance;
} {
  const validation = validateObdbSignalsetSchema(doc);
  if (!validation.valid) {
    return { validation, entries: [], provenance: OBDB_SHARED_PROVENANCE };
  }

  const parsed = doc as ObdbSignalsetDocument;
  const entries: ObdbNormalizedPidEntry[] = [];

  for (const cmd of parsed.commands) {
    const modeEntries = Object.entries(cmd.cmd);
    const [serviceModeHex, pidHex] = modeEntries[0] || ['01', '00'];
    const rxHeader = cmd.rax || '7E8';

    for (const sig of cmd.signals) {
      entries.push({
        uid: `${cmd.hdr}:${serviceModeHex}${pidHex}:${sig.id}`,
        serviceModeHex: serviceModeHex.toUpperCase(),
        pidHex: pidHex.toUpperCase(),
        txHeader: cmd.hdr.toUpperCase(),
        rxHeader: rxHeader.toUpperCase(),
        signalId: sig.id,
        path: sig.path || 'Generic',
        name: sig.name,
        description: sig.description || '',
        unit: sig.fmt.unit || 'scalar',
        bitOffset: typeof sig.fmt.bix === 'number' ? sig.fmt.bix : 0,
        bitLength: sig.fmt.len,
        minValue: typeof sig.fmt.min === 'number' ? sig.fmt.min : null,
        maxValue: typeof sig.fmt.max === 'number' ? sig.fmt.max : null,
        scalingSummary: buildScalingSummary(sig.fmt),
        verificationStatus: 'COMMUNITY_UNVERIFIED',
        provenance: OBDB_SHARED_PROVENANCE,
      });
    }
  }

  return { validation, entries, provenance: OBDB_SHARED_PROVENANCE };
}

const CACHED_DATASET = loadObdbSaeJ1979Dataset();

export const OBDB_DATASET_VALIDATION = CACHED_DATASET.validation;
export const OBDB_SAEJ1979_PIDS = CACHED_DATASET.entries;
export const OBDB_PROVENANCE = CACHED_DATASET.provenance;

export function searchObdbPids(query: string, limit = 40): ObdbNormalizedPidEntry[] {
  const clean = query.trim().toLowerCase();
  if (!clean) {
    return OBDB_SAEJ1979_PIDS.slice(0, limit);
  }
  const matches: ObdbNormalizedPidEntry[] = [];
  for (const entry of OBDB_SAEJ1979_PIDS) {
    const pidCode = `${entry.serviceModeHex}${entry.pidHex}`.toLowerCase();
    const haystack = `${entry.signalId} ${entry.name} ${entry.path} ${pidCode} ${entry.pidHex} ${entry.description}`.toLowerCase();
    if (haystack.includes(clean)) {
      matches.push(entry);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}
