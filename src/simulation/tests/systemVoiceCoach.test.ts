import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BANNED_DEEP_TAGALOG_WORDS,
  VOICE_DB_CONFIDENCE_THRESHOLD,
  createInitialVoiceSessionMemory,
  processVoiceCoachTurn,
  sanitizeToNaturalTaglish,
} from '../../services/ai/localVoiceBrain';
import { SYSTEM_VOICE_KNOWLEDGE_TOPICS } from '../../services/ai/systemVoiceKnowledgeBase';
import { DEFAULT_ECU_PINS } from '../../simulation/ecu/BenchCircuitSolver';
import type { BenchTelemetry } from '../../types/aiAssistant';

let passed = 0;

async function runTest(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

function assertNoBannedDeepTagalog(text: string): void {
  const lower = text.toLowerCase();
  for (const banned of BANNED_DEEP_TAGALOG_WORDS) {
    assert.equal(
      lower.includes(banned),
      false,
      `Response leaked banned archaic Tagalog term "${banned}": ${text}`
    );
  }
}

async function main() {
  console.log('\n[System-Wide Hands-Free Natural Taglish Voice Coach Suite]');

  const sampleTelemetry: Partial<BenchTelemetry> = {
    vehicleLabel: 'Toyota Hilux 1KD-FTV',
    ecuProfileLabel: 'Toyota Denso 1KD/2KD',
    psuEnabled: true,
    psuVoltageSetting: 12.6,
    psuCurrentLimitAmps: 2.0,
    psuCurrentDrawAmps: 0.48,
    isOcpTripped: false,
    activeDtcs: [
      { code: 'P0122', severity: 'CRITICAL', description: 'TPS Low Input' },
    ],
    activeFaults: [
      { pinId: 'ecu-pin-7', faultType: 'SHORT_TO_GND', description: 'TPS shorted to GND' },
    ],
    dmm: {
      isPowered: true,
      mode: 'V_DC',
      displayReading: '4.98',
      unit: 'V',
      redProbeLabel: 'Pin 5 (VREF_5V)',
      blackProbeLabel: 'Pin 1 (KL31)',
    },
  };

  const sampleVoltages: Record<string, number> = {
    'ecu-pin-3': 12.6,
    'ecu-pin-5': 4.98,
    'ecu-pin-7': 0.04,
  };

  await runTest('1. Answers "Paano gamitin ang BenchLab?", "pinouts", and "3D twin" in natural Taglish with 1-tap actions', () => {
    let mem = createInitialVoiceSessionMemory(undefined, 'BENCH_LAB', 'TL');

    const rBench = processVoiceCoachTurn({
      transcript: 'Paano gamitin ang BenchLab?',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
      telemetry: sampleTelemetry,
    });
    assert.equal(rBench.intent, 'SYSTEM_FEATURE_GUIDE');
    assert.equal(rBench.usedClarificationFallback, false);
    assert.ok(rBench.confidence >= VOICE_DB_CONFIDENCE_THRESHOLD);
    assert.equal(rBench.suggestedAction?.type, 'TAB');
    if (rBench.suggestedAction?.type === 'TAB') {
      assert.equal(rBench.suggestedAction.tab, 'BENCH_LAB');
    }
    assert.ok((rBench.detailsBullets?.length ?? 0) >= 3);
    assertNoBannedDeepTagalog(rBench.spokenText);
    mem = rBench.updatedMemory;

    const rPinouts = processVoiceCoachTurn({
      transcript: 'Paano gamitin ang pinouts?',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
      telemetry: sampleTelemetry,
    });
    assert.equal(rPinouts.intent, 'SYSTEM_FEATURE_GUIDE');
    assert.equal(rPinouts.usedClarificationFallback, false);
    assert.equal(rPinouts.suggestedAction?.type, 'TAB');
    if (rPinouts.suggestedAction?.type === 'TAB') {
      assert.equal(rPinouts.suggestedAction.tab, 'ECU_PINOUT');
    }
    assertNoBannedDeepTagalog(rPinouts.spokenText);
    mem = rPinouts.updatedMemory;

    const r3d = processVoiceCoachTurn({
      transcript: 'Paano gamitin ang 3D twin?',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
      telemetry: sampleTelemetry,
    });
    assert.equal(r3d.intent, 'SYSTEM_FEATURE_GUIDE');
    assert.equal(r3d.usedClarificationFallback, false);
    assert.equal(r3d.suggestedAction?.type, 'TAB');
    if (r3d.suggestedAction?.type === 'TAB') {
      assert.equal(r3d.suggestedAction.tab, 'THREE_D_TWIN');
    }
    assert.equal(r3d.updatedMemory.lastTopicId, 'sys-3d-twin');
    assertNoBannedDeepTagalog(r3d.spokenText);
  });

  await runTest('2. Follow-up "Anong meron doon?" resolves against last discussed module with anti-repetition', () => {
    let mem = createInitialVoiceSessionMemory(undefined, 'BENCH_LAB', 'TL');

    const r1 = processVoiceCoachTurn({
      transcript: 'Paano gamitin ang 3D twin?',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
    });
    mem = r1.updatedMemory;

    const f1 = processVoiceCoachTurn({
      transcript: 'Anong meron doon?',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
    });
    assert.equal(f1.intent, 'FOLLOW_UP_DETAILS');
    assert.equal(f1.usedClarificationFallback, false);
    assert.ok(f1.matchedSource.includes('sys-3d-twin'));
    assert.ok(/3d/i.test(f1.spokenText));
    assertNoBannedDeepTagalog(f1.spokenText);
    mem = f1.updatedMemory;

    const f2 = processVoiceCoachTurn({
      transcript: 'Anong meron doon?',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
    });
    assert.equal(f2.intent, 'FOLLOW_UP_DETAILS');
    assert.notEqual(f1.spokenText, f2.spokenText, 'Repeated follow-up must vary phrasing');
    assertNoBannedDeepTagalog(f2.spokenText);
  });

  await runTest('3. Voice navigation commands switch workspace tabs and open modals directly', () => {
    let mem = createInitialVoiceSessionMemory(undefined, 'BENCH_LAB', 'TL');

    const nav3d = processVoiceCoachTurn({
      transcript: 'Buksan ang 3D twin',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
    });
    assert.equal(nav3d.intent, 'WORKSPACE_NAVIGATION');
    assert.deepEqual(nav3d.navigationAction?.type, 'TAB');
    if (nav3d.navigationAction?.type === 'TAB') {
      assert.equal(nav3d.navigationAction.tab, 'THREE_D_TWIN');
    }
    mem = nav3d.updatedMemory;

    const navPinouts = processVoiceCoachTurn({
      transcript: 'Punta sa pinouts',
      memory: mem,
      activeTab: 'THREE_D_TWIN',
      lang: 'TL',
    });
    assert.equal(navPinouts.intent, 'WORKSPACE_NAVIGATION');
    if (navPinouts.navigationAction?.type === 'TAB') {
      assert.equal(navPinouts.navigationAction.tab, 'ECU_PINOUT');
    }
    mem = navPinouts.updatedMemory;

    const navReport = processVoiceCoachTurn({
      transcript: 'Buksan ang report studio',
      memory: mem,
      activeTab: 'ECU_PINOUT',
      lang: 'TL',
    });
    assert.equal(navReport.intent, 'WORKSPACE_NAVIGATION');
    assert.equal(navReport.navigationAction?.type, 'MODAL');
    if (navReport.navigationAction?.type === 'MODAL') {
      assert.equal(navReport.navigationAction.modal, 'REPORT_STUDIO');
    }
  });

  await runTest('4. Reads live MNA bench telemetry, specific ECU pin voltages, OEM profiles, and OBD-II DLC accurately', () => {
    const mem = createInitialVoiceSessionMemory(undefined, 'BENCH_LAB', 'TL');

    const statusTurn = processVoiceCoachTurn({
      transcript: 'Ano status ng bench?',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
      telemetry: sampleTelemetry,
    });
    assert.equal(statusTurn.intent, 'LIVE_BENCH_STATUS');
    assert.equal(statusTurn.usedClarificationFallback, false);
    assert.ok(statusTurn.spokenText.includes('12.6'));
    assert.ok(statusTurn.spokenText.includes('P0122'));
    assert.ok(/simulated/i.test(statusTurn.whyTip));
    assertNoBannedDeepTagalog(statusTurn.spokenText);

    const pinTurn = processVoiceCoachTurn({
      transcript: 'Ano ang Pin 5?',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
      pins: DEFAULT_ECU_PINS,
      nodeVoltages: sampleVoltages,
    });
    assert.equal(pinTurn.intent, 'PINOUT_OR_ECU_LOOKUP');
    assert.ok(pinTurn.spokenText.includes('VREF_5V'));
    assert.ok(pinTurn.spokenText.includes('4.98'));

    const obdTurn = processVoiceCoachTurn({
      transcript: 'Ano ang OBD-II DLC pins?',
      memory: mem,
      activeTab: 'ECU_PINOUT',
      lang: 'TL',
    });
    assert.equal(obdTurn.intent, 'PINOUT_OR_ECU_LOOKUP');
    assert.ok(obdTurn.spokenText.includes('Pin 6') && obdTurn.spokenText.includes('Pin 16'));

    const unknownTurn = processVoiceCoachTurn({
      transcript: 'xyzzy qwert blabla 99999',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
    });
    assert.equal(unknownTurn.usedClarificationFallback, true);
    assert.ok(unknownTurn.confidence < VOICE_DB_CONFIDENCE_THRESHOLD);
  });

  await runTest('5. Live MNA voice telemetry queries ("ano reading ngayon?", "ok ba to?", "saan nakakabit?", "bakit zero?") and 12 banned terms', () => {
    assert.ok(BANNED_DEEP_TAGALOG_WORDS.length >= 12, 'Expected expanded 12-term banned deep Tagalog list');
    const cleaned = sanitizeToNaturalTaglish(
      'Gamitin ang sonda at panukat ng boltahe sa kawad ng boltaheng sanggunian at daluyan para sa pagpapatunay at pagsisiyasat ng tagapagkontrol at kasangkapan.'
    );
    assertNoBannedDeepTagalog(cleaned);

    const mem = createInitialVoiceSessionMemory(undefined, 'BENCH_LAB', 'TL');

    const rReading = processVoiceCoachTurn({
      transcript: 'Ano reading ngayon?',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
      telemetry: sampleTelemetry,
    });
    assert.equal(rReading.intent, 'LIVE_BENCH_STATUS');
    assert.ok(rReading.spokenText.includes('4.98'), 'Must read live DMM value 4.98');
    assertNoBannedDeepTagalog(rReading.spokenText);

    const rOk = processVoiceCoachTurn({
      transcript: "Ok ba 'to?",
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
      telemetry: sampleTelemetry,
    });
    assert.equal(rOk.intent, 'LIVE_BENCH_STATUS');
    assert.ok(rOk.spokenText.includes('P0122') || rOk.spokenText.includes('4.98'));
    assertNoBannedDeepTagalog(rOk.spokenText);

    const rAttach = processVoiceCoachTurn({
      transcript: 'Saan nakakabit?',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
      telemetry: sampleTelemetry,
    });
    assert.equal(rAttach.intent, 'LIVE_BENCH_STATUS');
    assert.ok(rAttach.spokenText.includes('Pin 5') && rAttach.spokenText.includes('Pin 1'));
    assertNoBannedDeepTagalog(rAttach.spokenText);

    const zeroTelemetry: Partial<BenchTelemetry> = {
      ...sampleTelemetry,
      psuEnabled: false,
      psuVoltageSetting: 0,
      dmm: {
        isPowered: true,
        mode: 'V_DC',
        displayReading: '0.00',
        unit: 'V',
        redProbeLabel: 'Pin 7 (TPS_SIG)',
        blackProbeLabel: 'Pin 1 (KL31)',
      },
    };
    const rZero = processVoiceCoachTurn({
      transcript: 'Bakit zero?',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
      telemetry: zeroTelemetry,
    });
    assert.equal(rZero.intent, 'LIVE_BENCH_STATUS');
    assert.ok(/power supply|psu/i.test(rZero.spokenText) && /off/i.test(rZero.spokenText));
    assertNoBannedDeepTagalog(rZero.spokenText);

    for (const topic of SYSTEM_VOICE_KNOWLEDGE_TOPICS) {
      assertNoBannedDeepTagalog(topic.howToUseTL);
      assertNoBannedDeepTagalog(topic.whatsInsideTL);
      assertNoBannedDeepTagalog(topic.safetyTipTL);
    }
  });

  await runTest('6. UnifiedAiAssistantDrawer + HandsFreeVoiceCoach render non-blocking UI wired to App navigation', () => {
    const coachSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/ai/HandsFreeVoiceCoach.tsx'),
      'utf8'
    );
    assert.equal(
      coachSrc.includes('fixed inset-0'),
      false,
      'Floating Voice Dock must NOT block the workspace with a full-screen fixed inset-0 backdrop'
    );
    assert.ok(coachSrc.includes('aria-modal="false"'), 'Floating Voice Dock must be non-modal');
    assert.ok(coachSrc.includes('data-voice-dock-state'), 'Must support compact, expanded & embedded dock states');

    const unifiedSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/ai/UnifiedAiAssistantDrawer.tsx'),
      'utf8'
    );
    assert.equal(unifiedSrc.includes('fixed inset-0'), false, 'Unified AI Drawer must stay non-blocking');
    assert.ok(unifiedSrc.includes('aria-modal="false"'), 'Unified AI Drawer must be aria-modal="false"');

    const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    assert.ok(appSrc.includes('onNavigateTab={setActiveTab}'), 'App.tsx must wire voice tab navigation');
    assert.ok(appSrc.includes('onVoiceTranscript={handleTopBarVoiceTranscript}'), 'Voice capture must route into Unified AI Coach');
  });

  console.log(`\n[System-Wide Hands-Free Natural Taglish Voice Coach Suite] PASSED ${passed}/6 assertions.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
