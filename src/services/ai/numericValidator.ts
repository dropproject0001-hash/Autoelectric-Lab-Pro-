/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

/**
 * Numeric Validator (Anti-Hallucination Guard — Master Developer Instruction v1.1, Section 6.1).
 * Checks every pin number, voltage, resistance, and frequency mentioned in an AI response
 * against the retrieved evidence corpus. Values absent from retrieved evidence are flagged
 * or stripped so small local LLMs or cloud models can never fabricate electrical specifications.
 */

export type NumericClaimKind = 'PIN' | 'VOLTAGE' | 'RESISTANCE' | 'FREQUENCY';

export interface ExtractedNumericClaim {
  kind: NumericClaimKind;
  rawMatch: string;
  normalizedValue: string;
  verifiedInEvidence: boolean;
}

export interface NumericValidationReport {
  isClean: boolean;
  hasUnverifiedNumbers: boolean;
  totalClaimsChecked: number;
  verifiedClaims: ExtractedNumericClaim[];
  unverifiedClaims: ExtractedNumericClaim[];
  sanitizedText: string;
  warnings: string[];
}

interface PatternSpec {
  kind: NumericClaimKind;
  regex: RegExp;
  normalize: (match: RegExpMatchArray) => string;
}

const NUMERIC_PATTERNS: readonly PatternSpec[] = [
  {
    kind: 'PIN',
    regex: /\b(?:pin|terminal|cavity)\s*#?\s*([A-Za-z]?\d{1,3}[A-Za-z]?)\b/gi,
    normalize: (m) => `pin:${String(m[1]).toLowerCase().replace(/^0+(\d)/, '$1')}`,
  },
  {
    kind: 'VOLTAGE',
    regex: /\b(-?\d+(?:\.\d+)?)\s*(?:mV|V|VDC|VAC|volts?)\b/gi,
    normalize: (m) => {
      const val = parseFloat(m[1]);
      const isMilli = /\bmv\b/i.test(m[0]);
      const volts = isMilli ? val / 1000 : val;
      return `v:${Number(volts.toFixed(3))}`;
    },
  },
  {
    kind: 'RESISTANCE',
    regex: /\b(\d+(?:\.\d+)?)\s*(?:kΩ|kohm|kohms|MΩ|mohm|Ω|ohms?|R)\b/gi,
    normalize: (m) => {
      const val = parseFloat(m[1]);
      const raw = m[0].toLowerCase();
      const ohms = raw.includes('mΩ') || raw.includes('mohm')
        ? val * 1_000_000
        : raw.includes('k')
          ? val * 1_000
          : val;
      return `r:${Number(ohms.toFixed(3))}`;
    },
  },
  {
    kind: 'FREQUENCY',
    regex: /\b(\d+(?:\.\d+)?)\s*(?:kHz|MHz|Hz)\b/gi,
    normalize: (m) => {
      const val = parseFloat(m[1]);
      const raw = m[0].toLowerCase();
      const hz = raw.includes('mhz') ? val * 1_000_000 : raw.includes('khz') ? val * 1_000 : val;
      return `hz:${Number(hz.toFixed(3))}`;
    },
  },
];

export function extractNormalizedNumericSet(text: string): Set<string> {
  const result = new Set<string>();
  if (!text) return result;
  for (const spec of NUMERIC_PATTERNS) {
    const matches = text.matchAll(spec.regex);
    for (const m of matches) {
      result.add(spec.normalize(m));
    }
  }
  return result;
}

export function validateResponseNumbersAgainstEvidence(params: {
  candidateText: string;
  evidenceTexts: string[];
  mode?: 'FLAG' | 'STRIP';
}): NumericValidationReport {
  const mode = params.mode ?? 'FLAG';
  const evidenceCorpus = params.evidenceTexts.filter(Boolean).join('\n');
  const allowedSet = extractNormalizedNumericSet(evidenceCorpus);

  const verifiedClaims: ExtractedNumericClaim[] = [];
  const unverifiedClaims: ExtractedNumericClaim[] = [];
  const seenUnverifiedRaw = new Set<string>();

  let sanitizedText = params.candidateText;

  for (const spec of NUMERIC_PATTERNS) {
    const matches = Array.from(params.candidateText.matchAll(spec.regex));
    for (const m of matches) {
      const rawMatch = m[0];
      const normalizedValue = spec.normalize(m);
      const isVerified = allowedSet.has(normalizedValue);
      const claim: ExtractedNumericClaim = {
        kind: spec.kind,
        rawMatch,
        normalizedValue,
        verifiedInEvidence: isVerified,
      };
      if (isVerified) {
        verifiedClaims.push(claim);
      } else {
        unverifiedClaims.push(claim);
        seenUnverifiedRaw.add(rawMatch);
      }
    }
  }

  if (unverifiedClaims.length > 0) {
    // Replace longest raw strings first so partial overlaps don't corrupt annotations
    const sortedRaws = Array.from(seenUnverifiedRaw).sort((a, b) => b.length - a.length);
    for (const raw of sortedRaws) {
      const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const replacement =
        mode === 'STRIP'
          ? '[REMOVED: UNVERIFIED SPEC NOT IN DATABASE]'
          : `${raw} [UNVERIFIED — NOT IN RETRIEVED EVIDENCE]`;
      sanitizedText = sanitizedText.replace(new RegExp(escaped, 'g'), replacement);
    }
  }

  const warnings: string[] = [];
  if (unverifiedClaims.length > 0) {
    warnings.push(
      `Numeric Validator flagged ${unverifiedClaims.length} specification value(s) not found in retrieved evidence: ${Array.from(seenUnverifiedRaw).join(', ')}.`
    );
  }

  return {
    isClean: unverifiedClaims.length === 0,
    hasUnverifiedNumbers: unverifiedClaims.length > 0,
    totalClaimsChecked: verifiedClaims.length + unverifiedClaims.length,
    verifiedClaims,
    unverifiedClaims,
    sanitizedText,
    warnings,
  };
}
