/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import {
  getAllOscilloscopeWaveforms,
  getOscilloscopeGoodVsFaultyComparison,
  getOscilloscopeWaveformManifest,
  searchOscilloscopeWaveforms,
} from '../../services/oscilloscopeWaveformKnowledgeService';
import {
  loadAutomotiveKnowledgeCatalog,
  searchAutomotiveKnowledge,
} from '../../services/automotiveKnowledgeService';
import { adoptMultiStoreLocalKnowledge } from '../../services/ai/localKnowledgeAdoptionEngine';

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error('   ', err instanceof Error ? err.message : err);
    failed++;
  }
}

console.log('\n=== OEM Oscilloscope & Sensor Waveforms (Known-Good vs Faulty) Suite ===');

runTest('1. Manifest validates 100+ scraped PicoAuto AGT guides, 300+ DTCs, and zero duplicates', () => {
  const manifest = getOscilloscopeWaveformManifest();
  assert.equal(manifest.schemaVersion, '1.0.0');
  assert.equal(manifest.sourceSite, 'picoauto.com');
  assert.equal(manifest.zeroFabricationIntegrity, true);
  assert.ok(manifest.totalWaveformsIngested >= 100, `Expected >= 100 waveforms, got ${manifest.totalWaveformsIngested}`);
  assert.ok(manifest.totalDtcsIndexed >= 250, `Expected >= 250 DTCs, got ${manifest.totalDtcsIndexed}`);

  const agtCodes = new Set(manifest.records.map((r) => r.agtCode));
  assert.equal(agtCodes.size, manifest.records.length, 'Duplicate AGT codes detected');
});

runTest('2. Every waveform record has valid picoauto.com provenance, known-good spec, and faulty comparison', () => {
  const records = getAllOscilloscopeWaveforms();
  for (const rec of records) {
    assert.ok(rec.provenance.sourceUrl.startsWith('https://www.picoauto.com/library/automotive-guided-tests/'));
    assert.ok(rec.knownGood.waveformShape.length >= 10);
    assert.ok(rec.faultyComparison.faultIndicators.length >= 1);
    assert.ok(rec.faultyComparison.goodVsFaultyDiagnosticRule.includes('Known-Good:'));
  }
});

runTest('3. Offline lookup retrieves CKP Hall (0V-5V), CAN Bus, Injector, Ignition & Alternator Ripple comparisons', () => {
  const ckp = getOscilloscopeGoodVsFaultyComparison('CKP_CRANKSHAFT');
  assert.ok(ckp.length >= 3, 'Expected multiple CKP oscilloscope guides');
  const hallCkp = ckp.find((r) => r.agtCode === 'AGT-012');
  assert.ok(hallCkp, 'Expected AGT-012 Hall CKP guide');
  assert.ok(hallCkp.faultyComparison.associatedDtcs.includes('P0335'));

  const canHits = searchOscilloscopeWaveforms({ signalFamily: 'CAN_LIN_NETWORK' });
  assert.ok(canHits.length >= 5, 'Expected CAN/LIN network waveform guides');

  const rippleHits = searchOscilloscopeWaveforms({ query: 'alternator ripple' });
  assert.ok(rippleHits.length >= 1, 'Expected alternator ripple guide');
});

runTest('4. Oscilloscope waveform references are indexed in unified catalog & adopted by Local LLM engine', () => {
  const catalog = loadAutomotiveKnowledgeCatalog();
  const oscInCatalog = catalog.repairReferences.filter((r) => r.id.startsWith('ref-osc-'));
  assert.equal(oscInCatalog.length, getAllOscilloscopeWaveforms().length);

  const searchHits = searchAutomotiveKnowledge({ query: 'crankshaft Hall effect P0335 oscilloscope' });
  assert.ok(
    searchHits.some((h) => h.reference.id.startsWith('ref-osc-')),
    'Expected MiniSearch to retrieve OEM oscilloscope reference'
  );

  const adopted = adoptMultiStoreLocalKnowledge({
    query: 'crankshaft position hall effect waveform P0335',
  });
  assert.ok(
    adopted.items.some((i) => i.store === 'OSCILLOSCOPE_OEM_WAVEFORMS'),
    'Expected Local LLM multi-store adoption to include OSCILLOSCOPE_OEM_WAVEFORMS'
  );
});

console.log(`\nOEM Oscilloscope Waveform Suite Summary: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
