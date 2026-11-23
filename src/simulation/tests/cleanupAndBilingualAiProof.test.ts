import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_BENCH_COMPONENTS,
  DEFAULT_ECU_PINS,
  DEFAULT_WIRES,
  solveCircuit,
} from '../../utils/circuitSolver';
import {
  clearVerifiedKnowledgeStoreForTests,
  getAllVerifiedKnowledgeEntries,
  saveVerifiedKnowledgeEntry,
  VERIFIED_KNOWLEDGE_DB_NAME,
} from '../../services/ai/localKnowledgeDB';
import {
  OFFLINE_CONFIDENCE_THRESHOLD,
  runOfflineDiagnosticEngine,
  SCORE_GATE_CLARIFICATION_MESSAGES,
  stripBilingualStopwords,
} from '../../services/ai/offlineEngine';
import {
  AI_TIER_CASCADE,
  getAiRouterStatus,
  queryAiDiagnosticRouter,
  resetAiRouterStateForTests,
  setAiRouterOnlineTransportForTests,
  setAiRouterSoftLimitsForTests,
  subscribeAiRouterStatus,
} from '../../services/ai/aiRouter';
import {
  buildBenchTelemetry,
  buildQuickFillPrompt,
} from '../../hooks/useBenchContext';
import { INTERACTIVE_QUICK_GUIDES } from '../../components/help/FloatingHelpDrawer';
import { APP_ICON_SRC, APP_LOGO_SRC } from '../../constants/branding';
import type { AiRouterStatusSnapshot, AiTierId } from '../../types/aiAssistant';

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
  console.log('\n=== CLEANUP, GIT HYGIENE & BILINGUAL AI ARCHITECTURE PROOF SUITE ===');

  const root = process.cwd();

  // 1. Cleanup & Asset Integrity Proof
  await runTest('Zero residual PDFs, backups, or orphaned images remain while all active assets exist', () => {
    const skipDirs = new Set(['node_modules', '.git', 'dist', '.aistudio', '.data']);
    const assetExts = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.bak', '.tmp']);
    const textExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.html', '.css', '.webmanifest', '.md']);

    const assets: Array<{ rel: string; name: string; ext: string }> = [];
    const textFiles: Array<{ rel: string; content: string }> = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(root, full).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          if (skipDirs.has(entry.name)) continue;
          walk(full);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (assetExts.has(ext) || /copy/i.test(entry.name)) {
            assets.push({ rel, name: entry.name, ext });
          }
          if (textExts.has(ext)) {
            textFiles.push({ rel, content: fs.readFileSync(full, 'utf8') });
          }
        }
      }
    };
    walk(root);

    const pdfs = assets.filter((a) => a.ext === '.pdf');
    assert.equal(pdfs.length, 0, `Expected 0 residual PDFs, found: ${pdfs.map((p) => p.rel).join(', ')}`);

    const backups = assets.filter((a) => a.ext === '.bak' || a.ext === '.tmp' || /copy/i.test(a.name));
    assert.equal(backups.length, 0, `Expected 0 backup/copy files, found: ${backups.map((b) => b.rel).join(', ')}`);

    const orphaned = assets.filter(
      (a) => !textFiles.some((tf) => tf.rel !== a.rel && tf.content.includes(a.name))
    );
    assert.equal(orphaned.length, 0, `Expected 0 orphaned assets, found: ${orphaned.map((o) => o.rel).join(', ')}`);

    // Verify critical active brand & PWA assets still exist on disk
    const requiredPublicPaths = [
      `public${APP_LOGO_SRC}`,
      `public${APP_ICON_SRC}`,
      'public/favicon-32x32.png',
      'public/apple-touch-icon.png',
      'public/pwa-192x192.png',
      'public/pwa-512x512.png',
      'public/assets/images/ecu_connector_socket.jpg',
    ];
    for (const relPath of requiredPublicPaths) {
      assert.ok(fs.existsSync(path.join(root, relPath)), `Required active asset missing: ${relPath}`);
    }
  });

  // 2. Git Hygiene & Zero Hardcoded Secrets Proof
  await runTest('.gitignore enforces strict hygiene and src/ + server.ts contain zero hardcoded secrets', () => {
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    const requiredPatterns = [
      'node_modules/',
      'dist/',
      'build/',
      '.next/',
      '.DS_Store',
      'Thumbs.db',
      '.vscode/',
      '.env*',
      '!.env.example',
      '*.pdf',
      '*.bak',
      '*.tmp',
      'temp/',
      'uploads/',
      '.data/',
      'firebase-applet-config.json',
    ];
    for (const pat of requiredPatterns) {
      assert.ok(gitignore.includes(pat), `.gitignore missing required rule: ${pat}`);
    }

    const secretPatterns = [
      /AIza[0-9A-Za-z_-]{20,}/,
      /sk-[0-9A-Za-z]{20,}/,
      /ghp_[0-9A-Za-z]{20,}/,
      /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
    ];

    const checkFile = (fullPath: string) => {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const pat of secretPatterns) {
        assert.equal(pat.test(content), false, `Potential hardcoded secret found in ${fullPath}`);
      }
    };

    const walkSrc = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkSrc(full);
        } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
          checkFile(full);
        }
      }
    };
    walkSrc(path.join(root, 'src'));
    checkFile(path.join(root, 'server.ts'));
  });

  // 3. Micro-Task 1 Proof: 5 Bilingual Interactive Quick Guides & Control Bar
  await runTest('FloatingHelpDrawer contains all 5 bilingual Quick Guides including 12V vs 5V warning and OCP recovery', () => {
    assert.equal(INTERACTIVE_QUICK_GUIDES.length, 5, 'Expected exactly 5 interactive quick guides');

    const safeWiringGuide = INTERACTIVE_QUICK_GUIDES.find((g) => g.id === 'guide-safe-wiring');
    assert.ok(safeWiringGuide, 'Missing safe wiring guide');
    assert.ok(
      safeWiringGuide.boldSafetyWarningTL?.includes('12V') &&
        safeWiringGuide.boldSafetyWarningTL?.includes('5V') &&
        safeWiringGuide.boldSafetyWarningTL?.toLowerCase().includes('short-to-ground'),
      'Safe wiring TL warning must boldly warn about 12V vs 5V rail separation and short-to-ground check'
    );
    assert.ok(
      safeWiringGuide.boldSafetyWarningEN?.includes('12V') &&
        safeWiringGuide.boldSafetyWarningEN?.includes('5V') &&
        safeWiringGuide.boldSafetyWarningEN?.toLowerCase().includes('short-to-ground'),
      'Safe wiring EN warning must boldly warn about 12V vs 5V rail separation and short-to-ground check'
    );

    for (const guide of INTERACTIVE_QUICK_GUIDES) {
      assert.ok(guide.titleTL.length > 5 && guide.titleEN.length > 5);
      assert.ok(guide.stepsTL.length >= 3 && guide.stepsEN.length >= 3);
    }

    const unifiedDrawerSrc = fs.readFileSync(
      path.join(root, 'src/components/ai/UnifiedAiAssistantDrawer.tsx'),
      'utf8'
    );
    assert.ok(unifiedDrawerSrc.includes('tl-PH') && unifiedDrawerSrc.includes('en-US'), 'Web Speech API locales tl-PH & en-US required');
    assert.ok(unifiedDrawerSrc.includes('persistBilingualLang'), 'Language toggle must persist to localStorage');
    assert.ok(unifiedDrawerSrc.includes('subscribeAiRouterStatus'), 'Unified drawer must subscribe to live AI Router tier updates');
  });

  // 4. Micro-Task 2 Proof: Tagalog + English Stopword Filter
  await runTest('Stopword filter strips Tagalog + English fillers while keeping core technical tokens', () => {
    const tokens = stripBilingualStopwords(
      'Boss paki check naman po ano yung P0122 sa Toyota 1KD TPS Pin 7 ko?'
    );
    assert.ok(tokens.includes('p0122'), `Expected p0122 in ${JSON.stringify(tokens)}`);
    assert.ok(tokens.includes('toyota'), `Expected toyota in ${JSON.stringify(tokens)}`);
    assert.ok(tokens.includes('1kd'), `Expected 1kd in ${JSON.stringify(tokens)}`);
    assert.ok(tokens.includes('tps'), `Expected tps in ${JSON.stringify(tokens)}`);
    assert.ok(tokens.includes('pin 7'), `Expected "pin 7" in ${JSON.stringify(tokens)}`);
    assert.equal(tokens.includes('ano'), false, 'Stopword "ano" should be stripped');
    assert.equal(tokens.includes('yung'), false, 'Stopword "yung" should be stripped');
    assert.equal(tokens.includes('paki'), false, 'Stopword "paki" should be stripped');
    assert.equal(tokens.includes('naman'), false, 'Stopword "naman" should be stripped');
    assert.equal(tokens.includes('po'), false, 'Stopword "po" should be stripped');
  });

  // 5. Micro-Task 2 Proof: Strict 70% Confidence Score Gate (TL & EN)
  await runTest('70% Confidence Score Gate blocks vague/unclear queries in both TL and EN with exact clarification strings', async () => {
    await clearVerifiedKnowledgeStoreForTests();
    assert.equal(OFFLINE_CONFIDENCE_THRESHOLD, 0.7);

    const tlBlocked = await runOfflineDiagnosticEngine({
      query: 'Boss ano po yung problema nito hmm random',
      lang: 'TL',
    });
    assert.equal(tlBlocked.blockedByScoreGate, true);
    assert.equal(tlBlocked.confidence < 0.7, true);
    assert.equal(
      tlBlocked.conversationalSummary,
      SCORE_GATE_CLARIFICATION_MESSAGES.TL
    );
    assert.equal(
      tlBlocked.conversationalSummary,
      'Paumanhin, hindi malinaw ang tanong. Tungkol ba ito sa wiring, DTC, o bench test?'
    );

    const enBlocked = await runOfflineDiagnosticEngine({
      query: 'hey please help me with something weird xyzqwk',
      lang: 'EN',
    });
    assert.equal(enBlocked.blockedByScoreGate, true);
    assert.equal(enBlocked.confidence < 0.7, true);
    assert.equal(
      enBlocked.conversationalSummary,
      SCORE_GATE_CLARIFICATION_MESSAGES.EN
    );
    assert.equal(
      enBlocked.conversationalSummary,
      "Sorry, the query wasn't clear. Is this about wiring, a DTC, or a bench test?"
    );
  });

  // 6. Micro-Task 2 & 3 Proof: Live Bench Telemetry Injection + 3 Structured Repair Step Cards
  await runTest('High-confidence offline diagnosis injects live MNA bench telemetry and produces 3 structured Repair Step Cards', async () => {
    await clearVerifiedKnowledgeStoreForTests();

    const psu = {
      voltageSetting: 12.6,
      currentLimit: 2.0,
      isOutputEnabled: true,
      preset: '12V_BENCH' as const,
    };
    const faults = [
      {
        pinId: 'ecu-pin-7',
        faultType: 'SHORT_TO_GND' as const,
        description: 'TPS Signal shorted directly to KL31 ground',
        timestamp: Date.now(),
      },
    ];
    const multimeter = {
      isPowered: true,
      mode: 'V_DC' as const,
      rangeAuto: true,
      holdValue: false,
      redProbe: { attachedToPinId: 'ecu-pin-7', attachedLabel: 'Pin 7 (TPS_SIG)' },
      blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'Chassis GND (KL31)' },
    };

    const solution = solveCircuit(
      psu,
      DEFAULT_ECU_PINS,
      faults,
      DEFAULT_WIRES,
      DEFAULT_BENCH_COMPONENTS,
      multimeter
    );

    const telemetry = buildBenchTelemetry({
      vehicleLabel: 'Toyota Hilux 1KD-FTV',
      ecuProfileLabel: 'Denso 1KD Bench',
      powerSupply: psu,
      circuitSolution: solution,
      multimeter,
      multimeterDisplay: solution.multimeterReading.display,
      multimeterUnit: solution.multimeterReading.unit,
      multimeterWarning: solution.multimeterReading.warningMessage,
      pins: DEFAULT_ECU_PINS,
      faults,
      selectedPinId: 'ecu-pin-7',
      multimeterToleranceHook: { nominalVolts: 1.3, tolerancePercent: 10 },
      pcbOverlayHook: { boardId: 'sample-ldo', highlightedComponentId: 'ic-reg' },
    });

    assert.ok(telemetry.activeDtcs.some((d) => d.code === 'P0122'), 'Expected MNA solver to trigger P0122');
    assert.ok(telemetry.selectedPin?.label === 'TPS_SIG');
    assert.equal(telemetry.multimeterToleranceHook?.tolerancePercent, 10);
    assert.equal(telemetry.pcbOverlayHook?.boardId, 'sample-ldo');

    const quickPromptTL = buildQuickFillPrompt(telemetry, 'TL');
    assert.ok(quickPromptTL.includes('P0122'), 'Quick-fill prompt should reference active DTC P0122');

    const res = await runOfflineDiagnosticEngine({
      query: 'Boss paano ayusin ang P0122 sa TPS Pin 7?',
      lang: 'TL',
      telemetry,
    });

    assert.equal(res.blockedByScoreGate, false);
    assert.ok(res.confidence >= 0.7, `Expected confidence >= 0.70, got ${res.confidence}`);
    assert.ok(
      res.conversationalSummary.startsWith('Boss, batay sa verified data ng '),
      'TL synthesizer must use newbie-safe conversational mechanic tone'
    );
    assert.equal(res.cards.length, 3, 'Expected exactly 3 Repair Step Cards');
    assert.deepEqual(
      res.cards.map((c) => c.kind),
      ['SAFETY_WARNING', 'ROOT_CAUSE_ASSESSMENT', 'VERIFICATION_ACTION']
    );
    assert.ok(
      res.cards[1].body.includes('P0122') && res.cards[1].body.includes('TPS_SIG'),
      'Card 2 must include live bench telemetry (active DTC + probed pin)'
    );
  });

  // 7. Micro-Task 2 Proof: Multi-Tier Fallback Cascade (Carbon -> Hydrogen -> Argon -> Flash Lite -> Offline AI)
  await runTest('AI Router cascades Carbon -> Hydrogen -> Argon -> Flash Lite -> Offline AI on 429/timeout/403/network failure', async () => {
    resetAiRouterStateForTests();
    await clearVerifiedKnowledgeStoreForTests();

    assert.deepEqual(
      AI_TIER_CASCADE.map((t) => t.id),
      ['CARBON', 'HYDROGEN', 'ARGON', 'FLASH_LITE', 'OFFLINE_AI']
    );

    const observedTiers: AiTierId[] = [];
    const unsubscribe = subscribeAiRouterStatus((snap: AiRouterStatusSnapshot) => {
      observedTiers.push(snap.activeTier);
    });

    setAiRouterOnlineTransportForTests(async ({ tier }) => {
      if (tier.id === 'CARBON') {
        const err = new Error('HTTP 429 Quota exceeded on Carbon');
        (err as Error & { status?: number }).status = 429;
        throw err;
      }
      if (tier.id === 'HYDROGEN') {
        throw new Error('Tier Hydrogen timed out after 12000ms');
      }
      if (tier.id === 'ARGON') {
        const err = new Error('HTTP 403 Paid tier required');
        (err as Error & { status?: number }).status = 403;
        throw err;
      }
      throw new Error('Network unreachable on Flash Lite');
    }, true);

    const result = await queryAiDiagnosticRouter({
      query: 'U0001 CAN bus 60 ohm termination check',
      lang: 'EN',
    });

    unsubscribe();
    resetAiRouterStateForTests();

    assert.equal(result.tierUsed, 'OFFLINE_AI');
    assert.equal(result.blockedByScoreGate, false);
    assert.deepEqual(
      result.attemptTrail.map((a) => `${a.tier}:${a.outcome}`),
      [
        'CARBON:QUOTA_429',
        'HYDROGEN:TIMEOUT',
        'ARGON:AUTH_OR_TIER_BLOCKED',
        'FLASH_LITE:NETWORK_ERROR',
        'OFFLINE_AI:SUCCESS',
      ]
    );
    assert.ok(observedTiers.includes('CARBON'));
    assert.ok(observedTiers.includes('HYDROGEN'));
    assert.ok(observedTiers.includes('ARGON'));
    assert.ok(observedTiers.includes('FLASH_LITE'));
    assert.equal(observedTiers[observedTiers.length - 1], 'OFFLINE_AI');
  });

  // 8. Micro-Task 2 Proof: AutoLabPro_VerifiedKnowledge Auto-Cache & Offline Replay (Zero Manual Voting)
  await runTest('Verified online tier response auto-caches into AutoLabPro_VerifiedKnowledge and replays offline with zero voting APIs', async () => {
    resetAiRouterStateForTests();
    await clearVerifiedKnowledgeStoreForTests();
    assert.equal(VERIFIED_KNOWLEDGE_DB_NAME, 'AutoLabPro_VerifiedKnowledge');

    // Simulate Carbon 429 -> Hydrogen success
    setAiRouterOnlineTransportForTests(async ({ tier }) => {
      if (tier.id === 'CARBON') {
        const err = new Error('429 quota limit');
        (err as Error & { status?: number }).status = 429;
        throw err;
      }
      return {
        model: 'gemini-hydrogen-test',
        confidence: 0.93,
        reply: [
          'SAFETY_WARNING: Keep Bench PSU OFF before checking Denso SCV coil resistance to avoid inductive flyback.',
          'ROOT_CAUSE: P0093 fuel leak detection on 1KD-FTV frequently traces to a sticking Suction Control Valve or high injector return.',
          'VERIFICATION_ACTION: Measure SCV coil resistance with DMM in OHMS mode while PSU is OFF and confirm connector continuity.',
        ].join('\n'),
      };
    }, true);

    const onlineRes = await queryAiDiagnosticRouter({
      query: 'Toyota 1KD P0093 SCV coil bench check',
      lang: 'EN',
    });

    assert.equal(onlineRes.tierUsed, 'HYDROGEN');
    assert.equal(onlineRes.cachedLocally, true);
    assert.equal(onlineRes.cards.length, 3);

    const cachedRows = await getAllVerifiedKnowledgeEntries();
    assert.equal(cachedRows.length, 1);
    assert.equal(cachedRows[0].sourceTier, 'HYDROGEN');

    // Verify low-confidence online answers are NOT cached
    const rejectedLowConf = await saveVerifiedKnowledgeEntry({
      subject: 'Low confidence test',
      tokens: ['lowconf'],
      lang: 'EN',
      sourceTier: 'ARGON',
      confidence: 0.55,
      safetyWarning: 'w',
      rootCauseSummary: 'r',
      verificationStep: 'v',
      rawAnswer: 'raw',
    });
    assert.equal(rejectedLowConf.saved, false);

    // Now simulate completely offline workshop -> verify local verified cache hits cleanly
    setAiRouterOnlineTransportForTests(null, false);
    const offlineReplay = await queryAiDiagnosticRouter({
      query: 'Toyota 1KD P0093 SCV check',
      lang: 'TL',
    });
    resetAiRouterStateForTests();

    assert.equal(offlineReplay.tierUsed, 'OFFLINE_AI');
    assert.equal(offlineReplay.sourceProvenance, 'LOCAL_VERIFIED_CACHE');
    assert.equal(offlineReplay.blockedByScoreGate, false);
    assert.ok(offlineReplay.confidence >= 0.7);
    assert.ok(offlineReplay.cards[1].body.includes('P0093'));

    // Verify ZERO manual voting/rating UI or methods exist in localKnowledgeDB & assistant panel
    const dbSrc = fs.readFileSync(path.join(root, 'src/services/ai/localKnowledgeDB.ts'), 'utf8');
    const panelSrc = fs.readFileSync(path.join(root, 'src/components/ai/AiDiagnosticAssistantPanel.tsx'), 'utf8');
    assert.equal(/upvote|downvote|thumbsUp|thumbsDown|rateResponse|manualVote/i.test(dbSrc), false);
    assert.equal(/upvote|downvote|thumbsUp|thumbsDown|rateResponse|manualVote/i.test(panelSrc), false);
  });

  // 9. App.tsx Integration Proof
  await runTest('App.tsx cleanly mounts UnifiedAiAssistantDrawer, controlled FloatingHelpDrawer, NavigationDrawer auth/academy controls, and useBenchContext', () => {
    const appSrc = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
    assert.ok(appSrc.includes('UnifiedAiAssistantDrawer'));
    assert.ok(appSrc.includes('FloatingHelpDrawer'));
    assert.ok(appSrc.includes('hideFab={true}'));
    assert.ok(appSrc.includes('useBenchContext'));
    assert.equal(appSrc.includes('<AiWorkbenchControlBar'), false, 'Redundant AiWorkbenchControlBar ribbon must be removed from App.tsx');

    const navDrawerSrc = fs.readFileSync(path.join(root, 'src/components/NavigationDrawer.tsx'), 'utf8');
    assert.ok(navDrawerSrc.includes('signInWithGoogle'), 'NavigationDrawer must host Google Sign-In');
    assert.ok(navDrawerSrc.includes('LicenseStatusBadge'), 'NavigationDrawer must host LicenseStatusBadge');
    assert.ok(navDrawerSrc.includes('onOpenAcademyCurriculum'), 'NavigationDrawer must host Academy Lab trigger');
    assert.ok(navDrawerSrc.includes('onOpenHelpDrawer'), 'NavigationDrawer must host Gabay at Tulong trigger');
  });

  // 10. Pre-Quota Auto-Reroute & Cooldown Circuit Breaker Proof
  await runTest('AI Router proactively reroutes BEFORE hitting 429 soft quota and skips cooled-down tiers on subsequent calls', async () => {
    resetAiRouterStateForTests();
    await clearVerifiedKnowledgeStoreForTests();

    // Configure low soft limit (2/min per tier) to trigger proactive pre-quota switch cleanly
    setAiRouterSoftLimitsForTests({ perTierSoftRpm: 2 });
    const attemptedCalls: AiTierId[] = [];
    let should429Hydrogen = false;

    setAiRouterOnlineTransportForTests(async ({ tier }) => {
      attemptedCalls.push(tier.id);
      if (should429Hydrogen && tier.id === 'HYDROGEN') {
        const err = new Error('HTTP 429 Rate Limit on Hydrogen');
        (err as Error & { status?: number }).status = 429;
        throw err;
      }
      return {
        model: `mock-${tier.id.toLowerCase()}`,
        confidence: 0.92,
        reply: [
          'SAFETY_WARNING: Turn PSU OFF before measuring harness resistance.',
          'ROOT_CAUSE: Simulated bench check passed on selected free tier.',
          'VERIFICATION_ACTION: Verify 5.0V VREF with DMM in V_DC mode.',
        ].join('\n'),
      };
    }, true);

    // First 2 queries use CARBON cleanly (within 2/min soft cap)
    const r1 = await queryAiDiagnosticRouter({ query: 'P0122 TPS Pin 7 volt check 1', lang: 'EN' });
    const r2 = await queryAiDiagnosticRouter({ query: 'P0122 TPS Pin 7 volt check 2', lang: 'EN' });
    assert.equal(r1.tierUsed, 'CARBON');
    assert.equal(r2.tierUsed, 'CARBON');

    // 3rd query: CARBON is at 2/2 soft limit -> MUST proactively reroute to HYDROGEN WITHOUT calling CARBON!
    const r3 = await queryAiDiagnosticRouter({ query: 'P0122 TPS Pin 7 volt check 3', lang: 'EN' });
    assert.equal(r3.tierUsed, 'HYDROGEN');
    assert.deepEqual(
      r3.attemptTrail.map((a) => `${a.tier}:${a.outcome}`),
      ['CARBON:PRE_QUOTA_REROUTED', 'HYDROGEN:SUCCESS']
    );
    assert.deepEqual(attemptedCalls, ['CARBON', 'CARBON', 'HYDROGEN']);
    assert.equal(getAiRouterStatus().preQuotaRerouted, true);

    // 4th query: HYDROGEN throws 429 -> cascades to ARGON; 5th query MUST skip both CARBON (soft cap) and HYDROGEN (cooldown)
    should429Hydrogen = true;
    const r4 = await queryAiDiagnosticRouter({ query: 'U0100 CAN bus check 4', lang: 'EN' });
    assert.equal(r4.tierUsed, 'ARGON');
    assert.deepEqual(
      r4.attemptTrail.map((a) => `${a.tier}:${a.outcome}`),
      ['CARBON:PRE_QUOTA_REROUTED', 'HYDROGEN:QUOTA_429', 'ARGON:SUCCESS']
    );

    const callsBefore5 = attemptedCalls.length;
    const r5 = await queryAiDiagnosticRouter({ query: 'U0100 CAN bus check 5', lang: 'EN' });
    assert.equal(r5.tierUsed, 'ARGON');
    assert.deepEqual(
      r5.attemptTrail.map((a) => `${a.tier}:${a.outcome}`),
      ['CARBON:PRE_QUOTA_REROUTED', 'HYDROGEN:SKIPPED_COOLDOWN', 'ARGON:SUCCESS']
    );
    // Only 1 transport call made for r5 (directly to ARGON), zero calls to cooled-down HYDROGEN
    assert.equal(attemptedCalls.length - callsBefore5, 1);
    assert.equal(attemptedCalls[attemptedCalls.length - 1], 'ARGON');

    resetAiRouterStateForTests();
  });

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main();
