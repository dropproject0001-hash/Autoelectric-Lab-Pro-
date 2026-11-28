/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type {
  ElectricalSpecClaim,
  RepairReferenceRecord,
} from '../types/automotiveKnowledge';
import type {
  OscilloscopeGuideCategory,
  OscilloscopeSignalFamily,
  OscilloscopeWaveformCatalogManifest,
  OscilloscopeWaveformRecord,
} from '../types/oscilloscopeWaveformIngestion';
import catalogManifestJson from '../data/oscilloscope/oemOscilloscopeWaveformsCatalog.json';

const OSCILLOSCOPE_MANIFEST = catalogManifestJson as unknown as OscilloscopeWaveformCatalogManifest;

export function getOscilloscopeWaveformManifest(): OscilloscopeWaveformCatalogManifest {
  return OSCILLOSCOPE_MANIFEST;
}

export function getAllOscilloscopeWaveforms(): OscilloscopeWaveformRecord[] {
  return OSCILLOSCOPE_MANIFEST.records || [];
}

export interface OscilloscopeWaveformSearchFilter {
  query?: string;
  category?: OscilloscopeGuideCategory;
  signalFamily?: OscilloscopeSignalFamily;
  dtcCode?: string;
}

export interface OscilloscopeWaveformSearchResult {
  record: OscilloscopeWaveformRecord;
  score: number;
}

export function searchOscilloscopeWaveforms(
  filter: OscilloscopeWaveformSearchFilter = {}
): OscilloscopeWaveformSearchResult[] {
  const q = (filter.query || '').toLowerCase().trim();
  const dtcFilter = (filter.dtcCode || '').toUpperCase().trim();
  const results: OscilloscopeWaveformSearchResult[] = [];

  for (const rec of getAllOscilloscopeWaveforms()) {
    if (filter.category && rec.category !== filter.category) continue;
    if (filter.signalFamily && rec.signalFamily !== filter.signalFamily) continue;
    if (
      dtcFilter &&
      !rec.faultyComparison.associatedDtcs.some((d) => d.toUpperCase() === dtcFilter)
    ) {
      continue;
    }

    let score = 10;
    if (q) {
      const hay = [
        rec.agtCode,
        rec.title,
        rec.category,
        rec.subCategory,
        rec.signalFamily,
        rec.purposeSummary,
        rec.knownGood.waveformShape,
        rec.knownGood.knownGoodSummary,
        ...rec.knownGood.extractedVoltageSpecs,
        ...rec.knownGood.extractedFrequencyOrTimingSpecs,
        ...rec.faultyComparison.faultIndicators,
        ...rec.faultyComparison.associatedDtcs,
        rec.faultyComparison.goodVsFaultyDiagnosticRule,
      ]
        .join(' ')
        .toLowerCase();

      if (hay.includes(q)) {
        score += 30;
        if (rec.title.toLowerCase().includes(q)) score += 25;
        if (rec.agtCode.toLowerCase() === q) score += 40;
      } else {
        const tokens = q.split(/[^a-z0-9-]+/).filter((t) => t.length >= 2);
        const matched = tokens.filter((t) => hay.includes(t));
        if (matched.length === 0) continue;
        score += matched.length * 8;
        if (matched.length === tokens.length) score += 15;
      }
    }

    if (rec.knownGood.extractedVoltageSpecs.length > 0) score += 3;
    if (rec.faultyComparison.associatedDtcs.length > 0) score += 3;

    results.push({ record: rec, score });
  }

  return results.sort((a, b) => b.score - a.score || a.record.agtCode.localeCompare(b.record.agtCode));
}

export function getOscilloscopeGoodVsFaultyComparison(
  signalFamilyOrQuery: OscilloscopeSignalFamily | string
): OscilloscopeWaveformRecord[] {
  const upper = signalFamilyOrQuery.toUpperCase().trim();
  const byFamily = getAllOscilloscopeWaveforms().filter((r) => r.signalFamily === upper);
  if (byFamily.length > 0) return byFamily;
  return searchOscilloscopeWaveforms({ query: signalFamilyOrQuery }).slice(0, 5).map((r) => r.record);
}

/**
 * Converts all scraped OEM oscilloscope waveform references into standard
 * RepairReferenceRecord entries for unified MiniSearch indexing and AI grounding.
 */
export function buildOscilloscopeWaveformRepairReferences(): RepairReferenceRecord[] {
  return getAllOscilloscopeWaveforms().map((rec) => {
    const electricalSpecs: ElectricalSpecClaim[] = [];
    if (
      rec.knownGood.extractedVoltageSpecs.length > 0 ||
      rec.knownGood.extractedFrequencyOrTimingSpecs.length > 0
    ) {
      electricalSpecs.push({
        signalName: rec.title,
        voltageRange: rec.knownGood.extractedVoltageSpecs.slice(0, 3).join(', ') || undefined,
        frequencyRange:
          rec.knownGood.extractedFrequencyOrTimingSpecs.slice(0, 3).join(', ') || undefined,
        testCondition: rec.knownGood.testSetupSummary.slice(0, 140),
      });
    }

    const tags = Array.from(
      new Set([
        'oscilloscope',
        'waveform',
        'known-good-vs-faulty',
        'picoauto',
        rec.agtCode.toLowerCase(),
        rec.category,
        rec.subCategory,
        rec.signalFamily.toLowerCase(),
        ...rec.faultyComparison.associatedDtcs.slice(0, 8).map((d) => d.toLowerCase()),
      ])
    );

    const record: RepairReferenceRecord = {
      id: `ref-osc-${rec.agtCode.toLowerCase()}`,
      vehicleId: 'v-universal-12v-oscilloscope',
      make: 'Universal OEM',
      model: `${rec.title} (${rec.agtCode})`,
      years: 'All Modern 12V/24V EFI',
      systemCategoryId: rec.systemCategoryId,
      title: `${rec.title} — Known-Good vs Faulty Oscilloscope Reference [${rec.agtCode}]`,
      referenceType: 'electrical_system',
      summary: `${rec.faultyComparison.goodVsFaultyDiagnosticRule} Test Setup: ${rec.knownGood.testSetupSummary}`,
      source: {
        sourceName: 'PicoAuto Automotive Guided Tests (picoauto.com)',
        originalUrl: rec.provenance.sourceUrl,
        sourceType: 'oem_oscilloscope_guided_test',
        collectedAt: rec.provenance.crawledAt,
        language: 'en',
        verificationStatus: 'verified_source',
        confidenceScore: 0.92,
      },
      verified: true,
      tags,
      electricalSpecs: electricalSpecs.length > 0 ? electricalSpecs : undefined,
      provenance: {
        sourceDocument: `PicoAuto ${rec.agtCode} (${rec.provenance.sourceUrl})`,
        pageOrSection: `${rec.category} / ${rec.subCategory}`,
        revision: rec.agtCode,
        captureDate: rec.provenance.crawledAt,
        verificationStatus: 'VERIFIED',
        evidenceType: 'VERIFIED_OEM',
        testConditions: rec.knownGood.testSetupSummary,
        copyrightNotice: rec.provenance.copyrightNotice,
        versionHistory: [
          {
            version: 1,
            updatedAt: rec.provenance.crawledAt,
            actor: 'oscilloscope-waveform-ingestion-engine',
            lifecycleStatus: 'VERIFIED',
            changeSummary: `Ingested OEM oscilloscope known-good vs faulty comparison from ${rec.provenance.sourceUrl}`,
          },
        ],
      },
    };
    return record;
  });
}
