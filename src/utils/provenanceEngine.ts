import {
  AutomotiveRecordProvenance,
  RegionalMarket,
  VerificationStatus,
} from '../types/provenance';

export type ProvenanceOriginKind =
  | 'NHTSA_PUBLIC_API'
  | 'OBDB_COMMUNITY_REPO'
  | 'THIRD_PARTY_WEB_REFERENCE'
  | 'GEMINI_GROUNDED_SEARCH'
  | 'LOCAL_OEM_GUIDE'
  | 'LOCAL_RESTRICTED_METADATA'
  | 'SIMULATION_TRAINER'
  | 'TECHNICIAN_INPUT'
  | 'UNKNOWN_SOURCE';

export interface VerificationBadgeMeta {
  status: VerificationStatus;
  label: string;
  shortLabel: string;
  canAuthorizeLiveVoltage: boolean;
  tone: 'emerald' | 'cyan' | 'amber' | 'rose' | 'slate';
  description: string;
}

const BADGE_META: Record<VerificationStatus, VerificationBadgeMeta> = {
  OEM_VERIFIED: {
    status: 'OEM_VERIFIED',
    label: 'OEM Verified Reference',
    shortLabel: 'OEM_VERIFIED',
    canAuthorizeLiveVoltage: true,
    tone: 'emerald',
    description:
      'Cross-referenced bench documentation. Always confirm physical ECU case part number and ground continuity before energizing.',
  },
  OFFICIAL_MANUFACTURER: {
    status: 'OFFICIAL_MANUFACTURER',
    label: 'Official Manufacturer Spec',
    shortLabel: 'OFFICIAL_MFR',
    canAuthorizeLiveVoltage: true,
    tone: 'emerald',
    description:
      'Factory manufacturer publication or WMI identification. Verify regional trim and connector revision before bench probing.',
  },
  OFFICIAL_GOVERNMENT: {
    status: 'OFFICIAL_GOVERNMENT',
    label: 'Official Government Regulator Data',
    shortLabel: 'OFFICIAL_GOV',
    canAuthorizeLiveVoltage: false,
    tone: 'cyan',
    description:
      'Official U.S. NHTSA vPIC, Recalls, or ODI Complaints data. Authoritative for U.S. FMVSS filings; does not supply ECU wiring pinouts or non-U.S. recalls.',
  },
  SIMULATION_ONLY: {
    status: 'SIMULATION_ONLY',
    label: 'Simulation-Only Virtual Trainer',
    shortLabel: 'SIMULATION_ONLY',
    canAuthorizeLiveVoltage: false,
    tone: 'cyan',
    description:
      'Generic 16-pin virtual training harness for software circuit simulation. Never use to energize a physical OEM ECU bench.',
  },
  COMMUNITY_UNVERIFIED: {
    status: 'COMMUNITY_UNVERIFIED',
    label: 'Community Open Dataset (Unverified)',
    shortLabel: 'COMMUNITY_UNVERIFIED',
    canAuthorizeLiveVoltage: false,
    tone: 'amber',
    description:
      'Community-contributed dataset (e.g., OBDb SAE J1979). Not OEM-confirmed; use for diagnostic PID reference only.',
  },
  AI_INFERRED: {
    status: 'AI_INFERRED',
    label: 'AI-Assisted / Grounded Inference',
    shortLabel: 'AI_INFERRED',
    canAuthorizeLiveVoltage: false,
    tone: 'rose',
    description:
      'Synthesized via AI from live search results. Must NEVER be used alone to energize ECU pins or infer power/ground polarity.',
  },
  USER_SUPPLIED: {
    status: 'USER_SUPPLIED',
    label: 'User / Technician Supplied',
    shortLabel: 'USER_SUPPLIED',
    canAuthorizeLiveVoltage: false,
    tone: 'amber',
    description:
      'Entered manually by technician or saved from bench session notes. Verify against factory service manual.',
  },
  UNKNOWN: {
    status: 'UNKNOWN',
    label: 'Unverified / Unknown Provenance',
    shortLabel: 'UNKNOWN',
    canAuthorizeLiveVoltage: false,
    tone: 'slate',
    description:
      'Origin or verification tier is unestablished. Do not apply bench voltage or assume pin assignments.',
  },
};

export function getVerificationBadgeMeta(status: VerificationStatus): VerificationBadgeMeta {
  return BADGE_META[status] || BADGE_META.UNKNOWN;
}

/**
 * Classifies source provenance strictly. AI-generated and community records can never
 * elevate directly to OEM_VERIFIED.
 */
export function classifyProvenanceStatus(
  origin: ProvenanceOriginKind,
  requestedStatus?: VerificationStatus
): VerificationStatus {
  if (origin === 'GEMINI_GROUNDED_SEARCH') {
    return 'AI_INFERRED';
  }
  if (origin === 'OBDB_COMMUNITY_REPO' || origin === 'THIRD_PARTY_WEB_REFERENCE') {
    return 'COMMUNITY_UNVERIFIED';
  }
  if (origin === 'NHTSA_PUBLIC_API') {
    return 'OFFICIAL_GOVERNMENT';
  }
  if (origin === 'TECHNICIAN_INPUT') {
    return 'USER_SUPPLIED';
  }
  if (origin === 'SIMULATION_TRAINER') {
    return 'SIMULATION_ONLY';
  }
  if (origin === 'LOCAL_OEM_GUIDE') {
    return requestedStatus === 'OFFICIAL_MANUFACTURER' ? 'OFFICIAL_MANUFACTURER' : 'OEM_VERIFIED';
  }
  if (origin === 'LOCAL_RESTRICTED_METADATA') {
    return requestedStatus === 'OFFICIAL_MANUFACTURER' ? 'OFFICIAL_MANUFACTURER' : 'UNKNOWN';
  }
  return 'UNKNOWN';
}

/**
 * Prevents automated promotion of AI_INFERRED, SIMULATION_ONLY, COMMUNITY_UNVERIFIED, USER_SUPPLIED, or UNKNOWN
 * statuses to OEM_VERIFIED or OFFICIAL_MANUFACTURER without an explicit factory manual citation.
 */
export function guardProvenanceTransition(
  current: VerificationStatus,
  proposed: VerificationStatus,
  hasManualFactoryCitation: boolean
): VerificationStatus {
  if (current === 'AI_INFERRED' || current === 'SIMULATION_ONLY') {
    return current;
  }
  if (
    (current === 'COMMUNITY_UNVERIFIED' || current === 'UNKNOWN' || current === 'USER_SUPPLIED') &&
    (proposed === 'OEM_VERIFIED' || proposed === 'OFFICIAL_MANUFACTURER') &&
    !hasManualFactoryCitation
  ) {
    return current;
  }
  return proposed;
}

export function buildProvenanceRecord(
  params: {
    origin: ProvenanceOriginKind;
    sourceName: string;
    sourceUrlOrRef: string;
    manufacturer: string;
    applicableVehicle: string;
    publicationOrRevision: string;
    confidenceOrUncertainty: string;
    regionalApplicability: RegionalMarket[];
    engineCode?: string;
    ecuPartNumber?: string;
    dateRetrieved?: string;
    requestedStatus?: VerificationStatus;
    licenseNotice?: string;
  }
): AutomotiveRecordProvenance {
  const verificationStatus = classifyProvenanceStatus(params.origin, params.requestedStatus);
  return {
    sourceName: params.sourceName,
    sourceUrlOrRef: params.sourceUrlOrRef,
    manufacturer: params.manufacturer,
    applicableVehicle: params.applicableVehicle,
    engineCode: params.engineCode,
    ecuPartNumber: params.ecuPartNumber,
    publicationOrRevision: params.publicationOrRevision,
    verificationStatus,
    dateRetrieved: params.dateRetrieved || new Date().toISOString(),
    confidenceOrUncertainty: params.confidenceOrUncertainty,
    regionalApplicability:
      params.regionalApplicability.length > 0 ? params.regionalApplicability : ['GLOBAL'],
    licenseNotice: params.licenseNotice,
  };
}

export const REGIONAL_MARKET_LABELS: Record<RegionalMarket, string> = {
  PHILIPPINES: 'Philippines (PH)',
  ASEAN: 'ASEAN',
  JAPAN_DOMESTIC: 'Japan Domestic (JDM)',
  NORTH_AMERICA: 'North America (US/CA/MX)',
  EUROPE: 'Europe (ECE)',
  GLOBAL: 'Global / Multi-Market',
};
