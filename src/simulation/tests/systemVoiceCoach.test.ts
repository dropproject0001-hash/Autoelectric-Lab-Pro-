/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

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
import {
  VOICE_CACHE_MAX_ENTRIES,
  VOICE_INTERACTION_CACHE_DB_NAME,
  clearVoiceInteractionCache,
  getVoiceInteractionCacheStats,
  isLiveTelemetryQuery,
  listRecentVoiceInteractions,
  lookupVoiceInteractionCache,
  normalizeVoiceQueryKey,
  recordVoiceHistoryReplay,
  saveVoiceInteractionCache,
} from '../../services/ai/voiceInteractionCache';
import {
  queryAiDiagnosticRouter,
  resetAiRouterStateForTests,
  setAiRouterOnlineTransportForTests,
} from '../../services/ai/aiRouter';
import {
  evaluateVoiceCommandSafetyAndRisk,
  offlineVoiceAssistant,
} from '../../services/offlineVoiceService';
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

  await runTest('7. VoiceInteractionCache normalizes bilingual queries, bypasses live bench readings, enforces TTL & 100-entry LRU, and tracks replay hits', async () => {
    await clearVoiceInteractionCache();
    assert.equal(VOICE_INTERACTION_CACHE_DB_NAME, 'AutoLabPro_VoiceInteractionCache');

    // Bilingual stopword normalization maps equivalent questions to identical keys while preserving numbers
    const k1 = normalizeVoiceQueryKey('Ano ang P0122 sa TPS Pin 7?');
    const k2 = normalizeVoiceQueryKey('P0122 TPS Pin 7');
    assert.equal(k1.normalizedKey, k2.normalizedKey, 'Equivalent Taglish/English queries should normalize identically');
    assert.notEqual(
      normalizeVoiceQueryKey('Cylinder 1 misfire check').normalizedKey,
      normalizeVoiceQueryKey('Cylinder 2 misfire check').normalizedKey,
      'Numeric qualifiers must stay distinct'
    );

    // Strict live-reading bypass policy
    assert.equal(isLiveTelemetryQuery('Ano reading ngayon?'), true);
    assert.equal(isLiveTelemetryQuery("Ok ba 'to?"), true);
    assert.equal(isLiveTelemetryQuery('Saan nakakabit?'), true);
    assert.equal(isLiveTelemetryQuery('Bakit zero?'), true);
    assert.equal(isLiveTelemetryQuery('What is the bench status?'), true);
    assert.equal(isLiveTelemetryQuery('Check TPS Pin 7', 'LIVE_BENCH_STATUS'), true);
    assert.equal(isLiveTelemetryQuery('Check TPS Pin 7', 'READING_EVALUATION'), true);
    assert.equal(isLiveTelemetryQuery('Ano ang P0122 sa TPS Pin 7?', 'DTC_OR_COMPONENT_LOOKUP'), false);
    assert.equal(isLiveTelemetryQuery('Paano gamitin ang BenchLab?', 'SYSTEM_FEATURE_GUIDE'), false);

    // Live reading write must be rejected
    const liveSave = await saveVoiceInteractionCache({
      channel: 'VOICE_COACH',
      lang: 'TL',
      query: 'Ano reading ngayon?',
      intent: 'LIVE_BENCH_STATUS',
      spokenText: '4.98V live reading',
      displayText: '4.98V live reading',
      whyTip: 'Always check ground.',
      matchedSource: 'Live Telemetry',
      sourceOrigin: 'LOCAL_VOICE_BRAIN',
      confidence: 0.95,
    });
    assert.equal(liveSave.saved, false, 'Live bench reading must never be persisted to cache');

    // General diagnostic write -> cache hit -> manual replay hit
    const baseTime = 1_700_000_000_000;
    const saved = await saveVoiceInteractionCache({
      channel: 'VOICE_COACH',
      lang: 'TL',
      query: 'Ano ang P0122 sa TPS Pin 7?',
      intent: 'DTC_OR_COMPONENT_LOOKUP',
      spokenText: 'P0122 ibig sabihin mababa ang TPS signal sa Pin 7.',
      displayText: 'P0122 ibig sabihin mababa ang TPS signal sa Pin 7.',
      whyTip: 'Check 5V VREF muna.',
      matchedSource: 'Verified Bench DB',
      sourceOrigin: 'LOCAL_VOICE_BRAIN',
      confidence: 0.92,
      nowMs: baseTime,
      ttlMs: 10_000,
    });
    assert.equal(saved.saved, true);
    assert.ok(saved.entry);

    const hit = await lookupVoiceInteractionCache({
      query: 'P0122 TPS Pin 7',
      lang: 'TL',
      channel: 'VOICE_COACH',
      intent: 'DTC_OR_COMPONENT_LOOKUP',
      nowMs: baseTime + 500,
    });
    assert.ok(hit, 'Normalized equivalent query must hit cache');
    assert.equal(hit.hitCount, 1);

    const replayed = await recordVoiceHistoryReplay(hit.id, baseTime + 1_000);
    assert.ok(replayed);
    assert.equal(replayed.hitCount, 2);

    // TTL expiry eviction
    const expiredHit = await lookupVoiceInteractionCache({
      query: 'P0122 TPS Pin 7',
      lang: 'TL',
      channel: 'VOICE_COACH',
      intent: 'DTC_OR_COMPONENT_LOOKUP',
      nowMs: baseTime + 20_000,
    });
    assert.equal(expiredHit, null, 'Expired entry must not be served');

    // LRU cap enforcement (VOICE_CACHE_MAX_ENTRIES = 100)
    await clearVoiceInteractionCache();
    for (let i = 0; i < VOICE_CACHE_MAX_ENTRIES + 6; i += 1) {
      await saveVoiceInteractionCache({
        channel: 'VOICE_COACH',
        lang: 'EN',
        query: `DTC P0${String(100 + i).padStart(3, '0')} sensor circuit guide`,
        intent: 'DTC_OR_COMPONENT_LOOKUP',
        spokenText: `Guide for item ${i}`,
        displayText: `Guide for item ${i}`,
        whyTip: 'Verify ground.',
        matchedSource: 'Offline DB',
        sourceOrigin: 'LOCAL_VOICE_BRAIN',
        confidence: 0.9,
        nowMs: baseTime + i * 10,
      });
    }
    const recent = await listRecentVoiceInteractions({
      channel: 'VOICE_COACH',
      limit: 150,
      nowMs: baseTime + 5_000,
    });
    assert.equal(recent.length, VOICE_CACHE_MAX_ENTRIES, 'Cache must prune oldest entries at 100-entry LRU limit');
    assert.ok(recent[0].query.includes(`P0${100 + VOICE_CACHE_MAX_ENTRIES + 5}`), 'Most recent entry must be first');

    await clearVoiceInteractionCache();
    assert.equal(getVoiceInteractionCacheStats().entryCount, 0);
  });

  await runTest('8. Diagnostic Router short-circuits redundant online API calls via VoiceInteractionCache while bypassing live readings', async () => {
    resetAiRouterStateForTests();
    await clearVoiceInteractionCache();

    let transportCalls = 0;
    setAiRouterOnlineTransportForTests(async () => {
      transportCalls += 1;
      return {
        model: 'gemini-carbon-test',
        confidence: 0.94,
        reply: [
          'SAFETY_WARNING: Turn PSU OFF before ohmmeter checks on CAN bus pins.',
          'ROOT_CAUSE: U0001 indicates CAN_H/CAN_L termination or short fault.',
          'VERIFICATION_ACTION: Measure 60 ohms across Pin 13 and Pin 14 with PSU OFF.',
        ].join('\n'),
      };
    }, true);

    const firstRes = await queryAiDiagnosticRouter({
      query: 'Ano ang U0001 CAN 60 ohms test?',
      lang: 'TL',
      telemetry: {
        ...sampleTelemetry,
        psuVoltageSetting: 12.6,
      } as BenchTelemetry,
    });
    assert.equal(transportCalls, 1);
    assert.equal(firstRes.tierUsed, 'CARBON');
    assert.equal(Boolean(firstRes.servedFromInteractionCache), false);

    // Repeat equivalent diagnostic question with updated bench voltage -> MUST hit cache with 0 new API calls + fresh bench summary
    const secondRes = await queryAiDiagnosticRouter({
      query: 'U0001 CAN 60 ohms test',
      lang: 'TL',
      telemetry: {
        ...sampleTelemetry,
        psuVoltageSetting: 13.8,
      } as BenchTelemetry,
    });
    assert.equal(transportCalls, 1, 'Cached diagnostic query must avoid redundant online API call');
    assert.equal(secondRes.servedFromInteractionCache, true);
    assert.equal(secondRes.sourceProvenance, 'LOCAL_VERIFIED_CACHE');
    assert.equal(secondRes.cacheHitCount, 1);
    assert.equal(secondRes.attemptTrail[0]?.outcome, 'VOICE_CACHE_HIT');
    assert.ok(
      secondRes.benchSnapshotSummary.includes('13.8'),
      'Cached diagnostic reply must refresh live bench summary header'
    );

    // Live bench reading query MUST bypass cache and execute fresh transport call every time
    await queryAiDiagnosticRouter({
      query: 'What is the live bench reading right now?',
      lang: 'EN',
      telemetry: sampleTelemetry as BenchTelemetry,
    });
    await queryAiDiagnosticRouter({
      query: 'What is the live bench reading right now?',
      lang: 'EN',
      telemetry: sampleTelemetry as BenchTelemetry,
    });
    assert.equal(transportCalls, 3, 'Live telemetry queries must bypass cache on every invocation');

    resetAiRouterStateForTests();
    await clearVoiceInteractionCache();
  });

  await runTest('9. UnifiedAiAssistantDrawer, Voice Coach History UI, and 180ms Staggered Technical Cascade CSS satisfy motion & a11y contracts', () => {
    const unifiedSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/ai/UnifiedAiAssistantDrawer.tsx'),
      'utf8'
    );
    const coachSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/ai/HandsFreeVoiceCoach.tsx'),
      'utf8'
    );
    const diagSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/ai/AiDiagnosticAssistantPanel.tsx'),
      'utf8'
    );
    const cssSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');

    assert.ok(unifiedSrc.includes('key={activeSubTab}'), 'Unified drawer must key sub-tab container to trigger staggered entrance on switch');
    assert.ok(unifiedSrc.includes('data-testid="ai-drawer-panel-stage"'));

    assert.ok(coachSrc.includes('data-testid="voice-recent-history-section"'), 'Voice Coach must render collapsible Recent History section');
    assert.ok(coachSrc.includes('replayHistoryEntry('), 'Voice Coach history must wire 1-tap Replay handler');
    assert.ok(coachSrc.includes('clearHistory()'), 'Voice Coach history must wire Clear History handler');
    assert.ok(coachSrc.includes('ai-drawer-cascade-item ai-drawer-stagger-0'));
    assert.ok(coachSrc.includes('ai-drawer-cascade-item ai-drawer-stagger-3'));

    assert.ok(diagSrc.includes('data-testid="diagnostic-cache-hit-meta"'), 'Diagnostic panel must display cache-hit metadata');
    assert.ok(diagSrc.includes('ai-drawer-cascade-item ai-drawer-stagger-0'));
    assert.ok(diagSrc.includes('ai-drawer-stagger-3'));

    assert.ok(cssSrc.includes('@keyframes aiDrawerCascadeIn'), 'Global CSS must define aiDrawerCascadeIn keyframes');
    assert.ok(cssSrc.includes('180ms cubic-bezier(0.16, 1, 0.3, 1)'), 'Cascade animation must use 180ms settling curve');
    assert.ok(cssSrc.includes('.ai-drawer-stagger-3'), 'Stagger band classes 0..3 must be defined');
    assert.ok(
      cssSrc.includes('@media (prefers-reduced-motion: reduce)') &&
        cssSrc.includes('.ai-drawer-cascade-item'),
      'Reduced-motion media query must disable drawer cascade animations'
    );
  });

  await runTest('10. Supports natural English, Filipino Taglish, and mixed technical sentences while preserving automotive tokens', () => {
    const mem = createInitialVoiceSessionMemory(undefined, 'BENCH_LAB', 'TL');

    // 1. "Check mo yung voltage sa Pin 5."
    const checkPin5 = processVoiceCoachTurn({
      transcript: 'Check mo yung voltage sa Pin 5.',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
      pins: DEFAULT_ECU_PINS,
      nodeVoltages: sampleVoltages,
      telemetry: sampleTelemetry,
    });
    assert.equal(checkPin5.intent, 'LIVE_BENCH_STATUS');
    assert.ok(checkPin5.spokenText.includes('VREF_5V') && checkPin5.spokenText.includes('4.98'));
    assert.equal(checkPin5.provenance, 'SIMULATED_MNA_TELEMETRY');
    assert.ok(checkPin5.structuredDiagnostic?.finding);

    // 2. "Bakit zero volts yung reading?"
    const zeroRead = processVoiceCoachTurn({
      transcript: 'Bakit zero volts yung reading?',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
      telemetry: {
        ...sampleTelemetry,
        psuEnabled: false,
      },
    });
    assert.equal(zeroRead.intent, 'LIVE_BENCH_STATUS');
    assert.ok(/power supply|psu/i.test(zeroRead.spokenText));
    assert.equal(zeroRead.provenance, 'SIMULATED_MNA_TELEMETRY');

    // 3. "Open the ECU Pinouts."
    const openPinouts = processVoiceCoachTurn({
      transcript: 'Open the ECU Pinouts.',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'EN',
    });
    assert.equal(openPinouts.intent, 'WORKSPACE_NAVIGATION');
    assert.equal(openPinouts.navigationAction?.type, 'TAB');
    if (openPinouts.navigationAction?.type === 'TAB') {
      assert.equal(openPinouts.navigationAction.tab, 'ECU_PINOUT');
    }

    // 4. "Paki-check kung may short to ground."
    const shortCheck = processVoiceCoachTurn({
      transcript: 'Paki-check kung may short to ground.',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
      telemetry: sampleTelemetry,
    });
    assert.equal(shortCheck.intent, 'LIVE_BENCH_STATUS');
    assert.ok(shortCheck.spokenText.includes('SHORT_TO_GND') || shortCheck.spokenText.includes('P0122'));

    // 5. "Ano ang expected voltage ng TPS?"
    const tpsExpected = processVoiceCoachTurn({
      transcript: 'Ano ang expected voltage ng TPS?',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'TL',
      telemetry: sampleTelemetry,
    });
    assert.equal(tpsExpected.intent, 'EXPECTED_VALUE_QUERY');
    assert.ok(tpsExpected.spokenText.includes('0.45') && tpsExpected.spokenText.includes('4.55'));
    assert.equal(tpsExpected.updatedMemory.currentDiagnosticScenarioId, 'tps-p0122');

    // 6. "Proceed to the next diagnostic step."
    const nextStep = processVoiceCoachTurn({
      transcript: 'Proceed to the next diagnostic step.',
      memory: tpsExpected.updatedMemory,
      activeTab: 'BENCH_LAB',
      lang: 'EN',
      telemetry: sampleTelemetry,
    });
    assert.equal(nextStep.intent, 'STEP_NAVIGATION');
    assert.equal(nextStep.updatedMemory.currentDiagnosticScenarioId, 'tps-p0122');
  });

  await runTest('11. Maintains 4-turn conversational continuity ("How do I test the TPS?" -> "What should I measure?" -> "It\'s reading 0.04 volts." -> "What next?")', () => {
    let mem = createInitialVoiceSessionMemory(undefined, 'BENCH_LAB', 'EN');

    // Turn 1: Technician asks "How do I test the TPS?"
    const turn1 = processVoiceCoachTurn({
      transcript: 'How do I test the TPS?',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'EN',
      telemetry: sampleTelemetry,
    });
    assert.equal(turn1.intent, 'DTC_OR_COMPONENT_LOOKUP');
    assert.equal(turn1.updatedMemory.currentDiagnosticScenarioId, 'tps-p0122');
    assert.ok(/Pin 5|VREF_5V|5V/i.test(turn1.spokenText));
    assert.ok(turn1.structuredDiagnostic);
    assert.ok(turn1.structuredDiagnostic.finding.length > 0);
    assert.ok(turn1.structuredDiagnostic.check.length > 0);
    assert.ok(turn1.structuredDiagnostic.expectedResult.length > 0);
    assert.ok(turn1.structuredDiagnostic.safety.length > 0);
    assert.ok(turn1.structuredDiagnostic.nextStep.length > 0);
    mem = turn1.updatedMemory;

    // Turn 2: Technician asks "What should I measure?"
    const turn2 = processVoiceCoachTurn({
      transcript: 'What should I measure?',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'EN',
      telemetry: sampleTelemetry,
    });
    assert.equal(turn2.updatedMemory.currentDiagnosticScenarioId, 'tps-p0122');
    assert.ok(/0\.45|4\.55|5\.0|Pin 7|Pin 5/i.test(turn2.spokenText), 'Must know question refers to active TPS test');
    mem = turn2.updatedMemory;

    // Turn 3: Technician states "It's reading 0.04 volts."
    const turn3 = processVoiceCoachTurn({
      transcript: "It's reading 0.04 volts.",
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'EN',
      telemetry: sampleTelemetry,
    });
    assert.equal(turn3.intent, 'READING_EVALUATION');
    assert.equal(turn3.updatedMemory.currentDiagnosticScenarioId, 'tps-p0122');
    assert.ok((turn3.updatedMemory.measurementHistory?.length ?? 0) >= 1, 'Must record 0.04V in measurementHistory');
    assert.equal(turn3.updatedMemory.measurementHistory?.[0]?.value, 0.04);
    assert.ok(/P0122|short|open|low/i.test(turn3.spokenText));
    mem = turn3.updatedMemory;

    // Turn 4: Technician asks "What next?"
    const turn4 = processVoiceCoachTurn({
      transcript: 'What next?',
      memory: mem,
      activeTab: 'BENCH_LAB',
      lang: 'EN',
      telemetry: sampleTelemetry,
    });
    assert.equal(turn4.updatedMemory.currentDiagnosticScenarioId, 'tps-p0122');
    assert.ok(/disconnect|TPS|Pin 5|Pin 7|VREF/i.test(turn4.spokenText), 'Must continue the TPS procedure after 0.04V reading');
    assert.ok(turn4.updatedMemory.lastFiveResponses.length === 4);
  });

  await runTest('12. Enforces electrical safety interlocks and requires confirmation for state-changing bench commands', () => {
    // 1. Block applying 12V to Pin 5 / 5V VREF circuit
    const unsafe5v = evaluateVoiceCommandSafetyAndRisk({
      rawCommand: 'Apply 12 volts to Pin 5 VREF',
      lang: 'EN',
      powerSupply: {
        isOutputEnabled: true,
        voltageSetting: 12.6,
        currentLimit: 2.0,
        preset: '12V_BENCH',
      },
    });
    assert.equal(unsafe5v.riskLevel, 'REJECTED_SAFETY');
    assert.equal(unsafe5v.decision, 'REJECTED_SAFETY');
    assert.ok(/5V|regulator|VREF/i.test(unsafe5v.safetyReason || ''));

    // 2. Block switching multimeter to continuity or ohms while PSU output is ON
    const unsafeContinuity = evaluateVoiceCommandSafetyAndRisk({
      rawCommand: 'Set the multimeter to continuity',
      lang: 'EN',
      powerSupply: {
        isOutputEnabled: true,
        voltageSetting: 12.6,
        currentLimit: 2.0,
        preset: '12V_BENCH',
      },
    });
    assert.equal(unsafeContinuity.riskLevel, 'REJECTED_SAFETY');
    assert.equal(unsafeContinuity.decision, 'REJECTED_SAFETY');
    assert.ok(/OFF|energized/i.test(unsafeContinuity.spokenReplyEN));

    // When PSU is OFF, switching multimeter to continuity is allowed as a state-changing command requiring confirmation
    const safeContinuityWhenOff = evaluateVoiceCommandSafetyAndRisk({
      rawCommand: 'Set the multimeter to continuity',
      lang: 'EN',
      powerSupply: {
        isOutputEnabled: false,
        voltageSetting: 12.6,
        currentLimit: 2.0,
        preset: '12V_BENCH',
      },
    });
    assert.equal(safeContinuityWhenOff.decision, 'REQUIRES_CONFIRMATION');

    // 3. Block raising current limit while OCP is actively tripped
    const unsafeOcpRaise = evaluateVoiceCommandSafetyAndRisk({
      rawCommand: 'Set current limit to 5 amps',
      lang: 'EN',
      isSupplyCurrentTripped: true,
      powerSupply: {
        isOutputEnabled: true,
        voltageSetting: 12.6,
        currentLimit: 2.0,
        preset: '12V_BENCH',
      },
    });
    assert.equal(unsafeOcpRaise.riskLevel, 'REJECTED_SAFETY');
    assert.equal(unsafeOcpRaise.decision, 'REJECTED_SAFETY');

    // 4. Low-risk navigation command executes immediately without confirmation gate
    const lowRiskNav = evaluateVoiceCommandSafetyAndRisk({
      rawCommand: 'Open the ECU Pinouts',
      lang: 'EN',
    });
    assert.equal(lowRiskNav.riskLevel, 'LOW_RISK');
    assert.equal(lowRiskNav.decision, 'EXECUTE_IMMEDIATELY');

    // 5. Pending action confirmation & cancellation queue on offlineVoiceAssistant
    let executedCount = 0;
    offlineVoiceAssistant.setPendingAction({
      id: 'test-pending-1',
      rawCommand: 'Connect pin 5 to ground',
      actionSummary: 'Confirm bench state change: "Connect pin 5 to ground"',
      riskReason: 'Modifies bench wiring',
      source: 'TEXT_INPUT',
      createdAtMs: Date.now(),
      execute: () => {
        executedCount += 1;
      },
    });
    assert.ok(offlineVoiceAssistant.getPendingAction());
    assert.equal(
      evaluateVoiceCommandSafetyAndRisk({
        rawCommand: 'Confirm',
        hasPendingConfirmation: true,
      }).decision,
      'CONFIRMED_PENDING'
    );
    offlineVoiceAssistant.confirmPendingAction();
    assert.equal(executedCount, 1);
    assert.equal(offlineVoiceAssistant.getPendingAction(), null);
    assert.equal(offlineVoiceAssistant.getSessionMemory().lastExecutedCommand, 'Connect pin 5 to ground');
  });

  await runTest('13. Unified offlineVoiceAssistant reports honest offline vs browser Web Speech capabilities and synchronizes EN/TL language', () => {
    const caps = offlineVoiceAssistant.getCapabilities();
    assert.equal(caps.localDiagnosticIntelligence, 'OFFLINE_READY');
    assert.equal(caps.microphoneSpeechRecognition, 'BROWSER_WEB_SPEECH_ONLINE_OR_OS');
    assert.equal(caps.textCommandFallback, 'ALWAYS_AVAILABLE_OFFLINE');
    assert.equal(caps.onlineGeminiEnhancement, 'OPTIONAL_WHEN_ONLINE');

    offlineVoiceAssistant.setLanguage('EN');
    assert.equal(offlineVoiceAssistant.getLanguage(), 'EN');
    assert.equal(offlineVoiceAssistant.getSessionMemory().lang, 'EN');

    offlineVoiceAssistant.setLanguage('TL');
    assert.equal(offlineVoiceAssistant.getLanguage(), 'TL');
    assert.equal(offlineVoiceAssistant.getSessionMemory().lang, 'TL');
  });

  console.log(`\n[System-Wide Hands-Free Natural Taglish Voice Coach Suite] PASSED ${passed}/13 assertions.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
