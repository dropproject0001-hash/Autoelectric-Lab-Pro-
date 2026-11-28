/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getAllOscilloscopeWaveforms } from '../../services/oscilloscopeWaveformKnowledgeService';
import { synthesizeOemWaveform } from '../signals/OemWaveformSynthesizer';
import { parseScopeAndDrawerVoiceCommand } from '../../services/ai/oscilloscopeVoiceControlService';

console.log('=== Realistic DSO-4000, OEM Reference Drawer & Sliding AI Voice Control Tests ===');

const allRecords = getAllOscilloscopeWaveforms();
assert.ok(allRecords.length >= 118, `Expected at least 118 OEM waveform guides, got ${allRecords.length}`);

// 1. Test deterministic synthesis across representative OEM signal families
const familiesToVerify = [
  'INJECTOR_FUEL',
  'CKP_CRANKSHAFT',
  'CAN_LIN_NETWORK',
  'IGNITION_PRIMARY_SECONDARY',
  'CHARGING_STARTING_RIPPLE',
  'O2_LAMBDA_AFR',
  'ABS_WHEEL_SPEED',
] as const;

for (const family of familiesToVerify) {
  const rec = allRecords.find((r) => r.signalFamily === family);
  assert.ok(rec, `Missing OEM guide for family ${family}`);

  const synth = synthesizeOemWaveform({
    signalFamily: rec.signalFamily,
    rpm: 1500,
    timebaseScale: 1.0,
    sampleCount: 360,
  });
  assert.equal(synth.goodCh1.length, 360, `${family} goodCh1 length mismatch`);
  assert.equal(synth.faultyCh1.length, 360, `${family} faultyCh1 length mismatch`);
  assert.ok(Number.isFinite(synth.metricsGood.vMax), `${family} metricsGood.vMax must be finite`);
  assert.ok(Number.isFinite(synth.metricsFaulty.vMax), `${family} metricsFaulty.vMax must be finite`);
  assert.ok(synth.vMaxDisplay > synth.vMinDisplay, `${family} vMaxDisplay must exceed vMinDisplay`);

  if (family === 'INJECTOR_FUEL') {
    assert.ok(
      synth.metricsGood.vMax >= 55,
      `Injector known-good inductive kick must be >= 55V, got ${synth.metricsGood.vMax}`
    );
    assert.ok(
      synth.metricsFaulty.vMax < 25,
      `Injector faulty coil must suppress inductive spike (<25V), got ${synth.metricsFaulty.vMax}`
    );
  }
  if (family === 'CAN_LIN_NETWORK') {
    assert.ok(synth.goodCh2 && synth.goodCh2.length === 360, 'CAN bus must synthesize dual differential CH1/CH2 traces');
  }
}
console.log('PASS: Deterministic OEM waveform synthesizer verified across 7 automotive signal families');

// 2. Test voice & text command parser for scope + drawer control (EN & Taglish)
const baseScopeState = { voltDiv: 1.0, timeDiv: 1.0, rpm: 850, isRunning: true };

const cmdVolt = parseScopeAndDrawerVoiceCommand('Adjust voltage to 5V per division', baseScopeState);
assert.equal(cmdVolt.type, 'SET_VOLT_DIV');
if (cmdVolt.type === 'SET_VOLT_DIV') {
  assert.equal(cmdVolt.voltDiv, 5.0);
}

const cmdTimeFast = parseScopeAndDrawerVoiceCommand('Speed up the oscilloscope sweep', baseScopeState);
assert.equal(cmdTimeFast.type, 'SET_TIME_DIV');
if (cmdTimeFast.type === 'SET_TIME_DIV') {
  assert.ok(cmdTimeFast.timeDiv >= 1.5);
}

const cmdTimeTaglish = parseScopeAndDrawerVoiceCommand('Bagalan ang scope timebase', baseScopeState);
assert.equal(cmdTimeTaglish.type, 'SET_TIME_DIV');
if (cmdTimeTaglish.type === 'SET_TIME_DIV') {
  assert.ok(cmdTimeTaglish.timeDiv <= 0.75);
}

const cmdRpm = parseScopeAndDrawerVoiceCommand('Set RPM to 2500', baseScopeState);
assert.equal(cmdRpm.type, 'SET_RPM');
if (cmdRpm.type === 'SET_RPM') {
  assert.equal(cmdRpm.rpm, 2500);
}

const cmdCompareFaulty = parseScopeAndDrawerVoiceCommand('Show faulty waveform', baseScopeState);
assert.equal(cmdCompareFaulty.type, 'SET_COMPARE_MODE');
if (cmdCompareFaulty.type === 'SET_COMPARE_MODE') {
  assert.equal(cmdCompareFaulty.mode, 'FAULTY');
}

const cmdCompareOverlay = parseScopeAndDrawerVoiceCommand('Overlay compare known good vs faulty', baseScopeState);
assert.equal(cmdCompareOverlay.type, 'SET_COMPARE_MODE');
if (cmdCompareOverlay.type === 'SET_COMPARE_MODE') {
  assert.equal(cmdCompareOverlay.mode, 'OVERLAY');
}

const cmdHold = parseScopeAndDrawerVoiceCommand('Freeze the scope on hold', baseScopeState);
assert.equal(cmdHold.type, 'TOGGLE_RUN');
if (cmdHold.type === 'TOGGLE_RUN') {
  assert.equal(cmdHold.running, false);
}

const cmdPhosphor = parseScopeAndDrawerVoiceCommand('Turn off phosphor glow', baseScopeState);
assert.equal(cmdPhosphor.type, 'TOGGLE_PHOSPHOR');
if (cmdPhosphor.type === 'TOGGLE_PHOSPHOR') {
  assert.equal(cmdPhosphor.enabled, false);
}

const cmdLoadDtc = parseScopeAndDrawerVoiceCommand('Load waveform for P0335', baseScopeState);
assert.equal(cmdLoadDtc.type, 'LOAD_OEM_WAVEFORM');
if (cmdLoadDtc.type === 'LOAD_OEM_WAVEFORM') {
  assert.ok(cmdLoadDtc.record.id && cmdLoadDtc.record.title, 'Expected P0335 to resolve an OEM guide');
}

const cmdQaFallback = parseScopeAndDrawerVoiceCommand('Why is there no inductive kickback on a shorted injector?', baseScopeState);
assert.equal(cmdQaFallback.type, 'NONE', 'Diagnostic Q&A should route to Local LLM orchestrator');

console.log('PASS: Voice & text scope/drawer command parser verified (EN + Taglish + DTC lookup + LLM Q&A fallback)');

// 3. Structural UI & Hardware Authenticity Guards
const repoRoot = process.cwd();
const oscilloscopeSrc = fs.readFileSync(path.join(repoRoot, 'src/components/Oscilloscope.tsx'), 'utf8');
const drawerSrc = fs.readFileSync(path.join(repoRoot, 'src/components/OemOscilloscopeReferenceDrawer.tsx'), 'utf8');
const cssSrc = fs.readFileSync(path.join(repoRoot, 'src/index.css'), 'utf8');

assert.ok(oscilloscopeSrc.includes('dso-alloy-top-rail'), 'Oscilloscope must include brushed-aluminum top rail');
assert.ok(oscilloscopeSrc.includes('dso-alloy-frame'), 'Oscilloscope digital readouts must use flat alloy frames');
assert.ok(oscilloscopeSrc.includes('dso-led-green') && oscilloscopeSrc.includes('dso-led-red'), 'Oscilloscope readouts must use green/red instrument LED numerals');
assert.ok(oscilloscopeSrc.includes('ctx.lineWidth = 1.15'), 'Oscilloscope must render fine-beam 1.15px core traces');
assert.ok(oscilloscopeSrc.includes('SIMULATED'), 'Oscilloscope must retain honest SIMULATED labeling');
assert.ok(oscilloscopeSrc.includes('OemOscilloscopeReferenceDrawer'), 'Oscilloscope must mount OEM Reference Drawer');

assert.ok(drawerSrc.includes('SIMULATED REFERENCE'), 'OEM Reference Drawer must display honest SIMULATED REFERENCE badge');
assert.ok(drawerSrc.includes('isAiDrawerOpen'), 'OEM Reference Drawer must include bottom sliding Hands-Free AI drawer');
assert.ok(drawerSrc.includes('runUnifiedAiOrchestrator'), 'Sliding AI drawer must bridge to Local LLM Unified AI Orchestrator');
assert.ok(drawerSrc.includes('sendGeminiChat'), 'Sliding AI drawer must integrate Live Cloud AI alongside Offline AI & Local LLM');
assert.ok(
  drawerSrc.includes('AUTO_ALL') && drawerSrc.includes('OFFLINE_LLM') && drawerSrc.includes('LIVE_AI'),
  'Sliding AI popup drawer must expose unified Offline AI + Local LLM + Live AI modes in one drawer'
);
assert.ok(drawerSrc.includes('parseScopeAndDrawerVoiceCommand'), 'Sliding AI drawer must execute live voice/text scope controls');

assert.ok(cssSrc.includes('.dso-alloy-top-rail') && cssSrc.includes('.dso-alloy-frame') && cssSrc.includes('.dso-led-green') && cssSrc.includes('.dso-led-red'), 'index.css must define flat alloy frame and instrument LED classes');

console.log('PASS: Hardware authenticity, fine-beam rendering, flat alloy framing, and sliding AI drawer guards verified');
console.log('=== ALL REALISTIC DSO & OEM DRAWER TESTS PASSED ===');
