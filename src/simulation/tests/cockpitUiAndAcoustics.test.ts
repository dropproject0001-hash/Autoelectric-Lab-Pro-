/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isUiSoundEnabled,
  playAutomotiveRelayClunk,
  playCockpitTabDetent,
  playDrawerPneumaticSlide,
  playRotaryEncoderTick,
  setUiSoundEnabled,
  subscribeUiSoundPreference,
  toggleUiSoundEnabled,
} from '../../utils/audioFeedback';

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(err);
  }
}

async function main() {
  console.log('\n=== AUTOMOTIVE COCKPIT MULTI-DEVICE UI ALIGNMENT & ACOUSTIC DSP SUITE ===');

  await runTest('1. Persisted UI Sound state toggles, notifies subscribers, and runs safely headless', () => {
    const events: boolean[] = [];
    const unsubscribe = subscribeUiSoundPreference((state) => events.push(state));

    setUiSoundEnabled(false);
    assert.equal(isUiSoundEnabled(), false);
    // Safe no-op calls when muted or in Node environment
    playCockpitTabDetent();
    playRotaryEncoderTick();
    playAutomotiveRelayClunk(true);
    playDrawerPneumaticSlide(true);

    const toggled = toggleUiSoundEnabled();
    assert.equal(toggled, true);
    assert.equal(isUiSoundEnabled(), true);
    assert.deepEqual(events, [false, true]);

    unsubscribe();
    setUiSoundEnabled(true);
    assert.equal(events.length, 2, 'Unsubscribed listener must not receive further events');
  });

  await runTest('2. LabTopNav aligns all 8 diagnostic tabs on a single horizontal grid on lg+ with Framer Motion laser indicator', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/components/LabTopNav.tsx'),
      'utf8'
    );
    assert.ok(src.includes('lg:grid-cols-8'), 'LabTopNav must use lg:grid-cols-8 for the 8 workspace tabs');
    assert.equal(src.includes('lg:grid-cols-7'), false, 'Legacy 7-col orphan wrap must not remain');
    assert.ok(src.includes('layoutId="labTopNavActiveLaser"'), 'Sliding spring laser underline must be wired');
    assert.ok(src.includes('toggleUiSoundEnabled'), 'Top bar must expose global tactile SFX mute/enable control');
  });

  await runTest('3. FloatingVoiceKnowledgeFab docks inline in Cockpit Command Rail with zero floating overlap', () => {
    const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
    const navSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/FloatingLabNavigator.tsx'),
      'utf8'
    );
    const fabSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/ai/FloatingVoiceKnowledgeFab.tsx'),
      'utf8'
    );

    assert.ok(appSrc.includes('dockedInline={true}'), 'App.tsx must dock FloatingVoiceKnowledgeFab inline');
    assert.ok(navSrc.includes('voiceKnowledgeSlot'), 'FloatingLabNavigator must mount voiceKnowledgeSlot');
    assert.ok(fabSrc.includes('dockedInline'), 'FloatingVoiceKnowledgeFab must support inline docked mode');
  });

  await runTest('4. Adaptive Mobile 1-Col -> Tablet 2-Col Grid -> Desktop 3-Col Workstation & Reduced-Motion Safety', () => {
    const panelsSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/InstrumentPanels.tsx'),
      'utf8'
    );
    const landingSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/IntroductionPinLandingPage.tsx'),
      'utf8'
    );
    const cssSrc = fs.readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8');

    assert.ok(
      panelsSrc.includes('grid-cols-1 md:grid-cols-2 xl:grid-cols-1'),
      'InstrumentPanels must use 1-col mobile, 2-col tablet, and 1-col desktop rail grid'
    );
    assert.ok(
      landingSrc.includes('preventScroll: true'),
      'IntroductionPinLandingPage must guard focus against initial scroll jumping'
    );
    assert.ok(cssSrc.includes('animate-cockpit-module'));
    assert.ok(cssSrc.includes('animate-hud-laser-sweep'));
    assert.ok(cssSrc.includes('animate-bus-energized'));
    assert.ok(cssSrc.includes('prefers-reduced-motion: reduce'));
  });

  console.log(`\nCockpit UI & Acoustic DSP Suite Summary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main();
