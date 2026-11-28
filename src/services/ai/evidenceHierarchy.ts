/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { EvidenceHierarchyLevel } from '../../types/automotiveKnowledge';

export interface EvidenceLevelDescriptor {
  level: EvidenceHierarchyLevel;
  rank: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  shortBadge: string;
  description: string;
  isTrustedDatabaseEvidence: boolean;
}

export const EVIDENCE_HIERARCHY_MAP: Record<EvidenceHierarchyLevel, EvidenceLevelDescriptor> = {
  VERIFIED_OEM: {
    level: 'VERIFIED_OEM',
    rank: 1,
    label: '1. Verified OEM information',
    shortBadge: 'L1 · VERIFIED OEM',
    description: 'Backed by verified factory service manual or Dual-OEM catalog reference.',
    isTrustedDatabaseEvidence: true,
  },
  TECHNICIAN_CONFIRMED: {
    level: 'TECHNICIAN_CONFIRMED',
    rank: 2,
    label: '2. Technician-confirmed information',
    shortBadge: 'L2 · TECH CONFIRMED',
    description: 'Approved by an administrator or qualified technician with documented test conditions.',
    isTrustedDatabaseEvidence: true,
  },
  UNVERIFIED_DB: {
    level: 'UNVERIFIED_DB',
    rank: 3,
    label: '3. Unverified database information',
    shortBadge: 'L3 · UNVERIFIED DB',
    description: 'Present in the database but not yet verified by OEM documentation or technician approval.',
    isTrustedDatabaseEvidence: false,
  },
  GENERAL_AI: {
    level: 'GENERAL_AI',
    rank: 4,
    label: '4. General AI explanation (no database support)',
    shortBadge: 'L4 · GENERAL AI (NO DB)',
    description: 'General automotive electronics explanation without a matching database record.',
    isTrustedDatabaseEvidence: false,
  },
  SIMULATED_RESULT: {
    level: 'SIMULATED_RESULT',
    rank: 5,
    label: '5. Simulated result',
    shortBadge: 'L5 · SIMULATED',
    description: 'Computed by the Virtual ECU Bench MNA software simulator — not a physical ECU measurement.',
    isTrustedDatabaseEvidence: false,
  },
  USER_MEASUREMENT: {
    level: 'USER_MEASUREMENT',
    rank: 6,
    label: '6. User-entered measurement',
    shortBadge: 'L6 · USER MEASUREMENT',
    description: 'Measurement value supplied directly by the technician.',
    isTrustedDatabaseEvidence: false,
  },
};

export function getEvidenceDescriptor(level: EvidenceHierarchyLevel): EvidenceLevelDescriptor {
  return EVIDENCE_HIERARCHY_MAP[level];
}

export function formatEvidenceHeader(level: EvidenceHierarchyLevel): string {
  const desc = EVIDENCE_HIERARCHY_MAP[level];
  return `[Evidence Level: ${desc.label}]`;
}
