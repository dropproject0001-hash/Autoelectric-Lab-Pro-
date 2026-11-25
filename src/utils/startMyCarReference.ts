/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { AutomotiveRecordProvenance } from '../types/provenance';
import { buildProvenanceRecord } from './provenanceEngine';

export const STARTMYCAR_ORIGIN = 'https://www.startmycar.com';

export type StartMyCarScope =
  | 'FUSE_BOX'
  | 'ENGINE_BAY_RELAY'
  | 'INTERIOR_CABIN'
  | 'OWNERS_MANUAL';

export interface StartMyCarVehicleQuery {
  make?: string;
  model?: string;
  year?: string;
}

export interface StartMyCarReferenceLinks {
  homeUrl: string;
  makeModelsUrl: string;
  vehicleHubUrl: string;
  fuseBoxUrl: string;
  hasMakeSlug: boolean;
  hasVehicleSpecificPath: boolean;
  makeSlug: string;
  modelSlug: string;
  year?: string;
  displayLabel: string;
}

export interface StartMyCarPresetVehicle {
  label: string;
  make: string;
  model: string;
  year: string;
  focus: string;
}

export const STARTMYCAR_CIRCUIT_FOCUSES = [
  'All Fuses & Relays',
  'EFI / ECM Main Relay',
  'Fuel Pump Relay & Fuse',
  'OBD-II DLC Power Fuse',
  'Ignition Switch (KL15)',
  'Cooling Fan / Starter Relay',
] as const;

export const STARTMYCAR_PRESET_VEHICLES: StartMyCarPresetVehicle[] = [
  {
    label: '2020 Toyota Corolla',
    make: 'Toyota',
    model: 'Corolla',
    year: '2020',
    focus: 'EFI / ECM Main Relay',
  },
  {
    label: '2019 Ford Ranger',
    make: 'Ford',
    model: 'Ranger',
    year: '2019',
    focus: 'OBD-II DLC Power Fuse',
  },
  {
    label: '2018 Honda Civic',
    make: 'Honda',
    model: 'Civic',
    year: '2018',
    focus: 'Fuel Pump Relay & Fuse',
  },
  {
    label: '2016 Ford F-150',
    make: 'Ford',
    model: 'F-150',
    year: '2016',
    focus: 'All Fuses & Relays',
  },
  {
    label: '2018 Nissan Sentra',
    make: 'Nissan',
    model: 'Sentra',
    year: '2018',
    focus: 'EFI / ECM Main Relay',
  },
  {
    label: '2019 Toyota Hilux',
    make: 'Toyota',
    model: 'Hilux',
    year: '2019',
    focus: 'Ignition Switch (KL15)',
  },
];

/**
 * Normalizes a vehicle make or model string into a safe, lowercase URL path slug
 * matching StartMyCar routing conventions (ASCII letters, digits, and single hyphens only).
 */
export function normalizeStartMyCarSlug(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const stripped = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return stripped.slice(0, 64);
}

/**
 * Validates and normalizes a 4-digit automotive model year for StartMyCar routes.
 */
export function normalizeStartMyCarYear(raw?: string): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 4) return undefined;
  const numericYear = Number(digits);
  const maxAllowedYear = new Date().getUTCFullYear() + 2;
  if (!Number.isInteger(numericYear) || numericYear < 1975 || numericYear > maxAllowedYear) {
    return undefined;
  }
  return String(numericYear);
}

/**
 * Enforces strictly https://www.startmycar.com/... origin so malformed inputs
 * can never produce javascript:, data:, or off-origin redirect URLs.
 */
function ensureSafeStartMyCarUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const candidate = new URL(normalizedPath, STARTMYCAR_ORIGIN);
  if (candidate.protocol !== 'https:' || candidate.hostname !== 'www.startmycar.com') {
    return `${STARTMYCAR_ORIGIN}/`;
  }
  return candidate.toString();
}

export function buildStartMyCarReferenceUrls(
  input: StartMyCarVehicleQuery = {}
): StartMyCarReferenceLinks {
  const makeSlug = normalizeStartMyCarSlug(input.make);
  const modelSlug = normalizeStartMyCarSlug(input.model);
  const year = normalizeStartMyCarYear(input.year);

  const homeUrl = `${STARTMYCAR_ORIGIN}/`;
  const hasMakeSlug = makeSlug.length > 0;
  const hasVehicleSpecificPath = hasMakeSlug && modelSlug.length > 0;

  const makeModelsUrl = hasMakeSlug
    ? ensureSafeStartMyCarUrl(`/${makeSlug}/pickmodel`)
    : homeUrl;

  const vehicleHubUrl = hasVehicleSpecificPath
    ? ensureSafeStartMyCarUrl(`/${makeSlug}/${modelSlug}`)
    : makeModelsUrl;

  const fuseBoxUrl = hasVehicleSpecificPath
    ? ensureSafeStartMyCarUrl(
        year
          ? `/${makeSlug}/${modelSlug}/info/fusebox/${year}`
          : `/${makeSlug}/${modelSlug}/info/fusebox`
      )
    : makeModelsUrl;

  const displayParts = [
    year,
    input.make?.trim(),
    input.model?.trim(),
  ].filter((part): part is string => Boolean(part && part.length > 0));

  return {
    homeUrl,
    makeModelsUrl,
    vehicleHubUrl,
    fuseBoxUrl,
    hasMakeSlug,
    hasVehicleSpecificPath,
    makeSlug,
    modelSlug,
    year,
    displayLabel: displayParts.join(' ') || 'StartMyCar Fuse Box & Relay Directory',
  };
}

export function buildStartMyCarGroundedQuery(params: {
  make?: string;
  model?: string;
  year?: string;
  circuitFocus?: string;
  scope?: StartMyCarScope;
  includeSiteFilter?: boolean;
}): {
  query: string;
  ecu: string;
  dtc: string;
  contextType: 'FUSE_RELAY_DIAGRAM';
} {
  const links = buildStartMyCarReferenceUrls(params);
  const year = links.year || '';
  const make = (params.make || '').trim();
  const model = (params.model || '').trim();
  const circuitFocus = (params.circuitFocus || '').trim();
  const scope = params.scope || 'FUSE_BOX';
  const includeSiteFilter = params.includeSiteFilter !== false;

  const scopeTerms: Record<StartMyCarScope, string> = {
    FUSE_BOX: 'fuse box diagram relay layout amperage',
    ENGINE_BAY_RELAY: 'engine bay fuse box power distribution relay EFI main fuel pump',
    INTERIOR_CABIN: 'interior cabin fuse box diagram OBD2 DLC ignition fuse',
    OWNERS_MANUAL: 'fuse box diagram warning lights manual',
  };

  const focusTerm =
    circuitFocus && circuitFocus !== 'All Fuses & Relays' ? circuitFocus : '';

  const parts = [
    includeSiteFilter ? 'site:startmycar.com' : '',
    year,
    make,
    model,
    scopeTerms[scope],
    focusTerm,
  ].filter(Boolean);

  return {
    query: parts.join(' ').trim() || 'site:startmycar.com fuse box diagram relay',
    ecu: [year, make, model].filter(Boolean).join(' ') || 'Power Distribution / Fuse Box',
    dtc: scope === 'INTERIOR_CABIN' ? 'FUSE-CABIN' : 'FUSE-RELAY',
    contextType: 'FUSE_RELAY_DIAGRAM',
  };
}

export function buildStartMyCarProvenance(input: {
  make?: string;
  model?: string;
  year?: string;
  retrievedAt?: string;
  targetUrl?: string;
}): AutomotiveRecordProvenance {
  const links = buildStartMyCarReferenceUrls(input);
  const safeRef =
    input.targetUrl && input.targetUrl.startsWith(STARTMYCAR_ORIGIN)
      ? input.targetUrl
      : links.fuseBoxUrl;

  return buildProvenanceRecord({
    origin: 'THIRD_PARTY_WEB_REFERENCE',
    sourceName: 'StartMyCar Fuse Box & Relay Reference',
    sourceUrlOrRef: safeRef,
    manufacturer: input.make?.trim() || 'Multi-Make External Reference',
    applicableVehicle: links.displayLabel,
    publicationOrRevision: 'Interactive Fuse/Relay & Owner Reference',
    confidenceOrUncertainty:
      'Third-party vehicle reference (COMMUNITY_UNVERIFIED). Fuse cavity numbering, amperage ratings, and relay assignments vary by model year, engine trim, regional market (US/ASEAN/EU), and LHD/RHD configuration. Verify physical fuse cover legend and test continuity/polarity with a multimeter before energizing.',
    regionalApplicability: ['GLOBAL'],
    dateRetrieved: input.retrievedAt,
  });
}
