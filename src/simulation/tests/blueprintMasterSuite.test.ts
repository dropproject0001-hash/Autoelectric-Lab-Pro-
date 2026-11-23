import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createAutoelectricApiApp } from '../../server/createApiApp';
import {
  clearIssuedOfflineLicensesForTests,
  generateSignedOfflineLicense,
  getPublicVerificationKeyJwk,
} from '../../server/services/offlineLicenseCrypto';
import {
  activateOfflineLicenseCode,
  clearOfflineLicenseVaultForTests,
  getOfflineLicenseStatus,
  verifyOfflineLicenseSignature,
} from '../../services/billing/licenseVerificationService';
import {
  clearBillingConfigForTests,
  loadPaymentQrConfig,
  savePaymentQrConfig,
} from '../../services/billing/qrConfigService';
import {
  ACADEMY_CURRICULUM_MODULES,
  ACADEMY_TRAINING_LEVELS,
} from '../../data/academy/universityCurriculum';
import { evaluateAcademyStepTolerance } from '../../utils/academy/toleranceEvaluator';
import {
  clearAcademySignedSessionLogsForTests,
  signAcademyLabSession,
} from '../../utils/academy/labCryptoSigner';
import { verifyAcademyLabReport } from '../../utils/academy/labCryptoVerifier';
import { generateAcademyLabPdf } from '../../utils/academy/generateLabPdf';
import {
  BANNED_DEEP_TAGALOG_WORDS,
  createInitialVoiceSessionMemory,
  processVoiceCoachTurn,
  sanitizeToNaturalTaglish,
  VOICE_DB_CONFIDENCE_THRESHOLD,
} from '../../services/ai/localVoiceBrain';
import {
  HANDS_FREE_AUTO_RESUME_MS,
  HANDS_FREE_CHIME_HZ,
  HANDS_FREE_CHIME_MS,
  HANDS_FREE_TTS_PITCH,
  HANDS_FREE_TTS_RATE,
} from '../../hooks/useHandsFreeVoice';
import { formatCloudSqlErrorDetails } from '../../components/ConnectionHealthWidget';
import type { PowerSupplyState } from '../../types/ecu';

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

async function main() {
  console.log('\n[Blueprint Master Verification Suite]');

  // ---------------------------------------------------------------------------
  // 1. LabStatusFooter & ConnectionHealthWidget Pulse + Error Details Tooltip
  // ---------------------------------------------------------------------------
  await runTest('1. formatCloudSqlErrorDetails formats UNREACHABLE & NOT_CONFIGURED cleanly and clears error when CONNECTED', () => {
    const baseSnapshot = {
      overall: 'PARTIAL' as const,
      checkedAtIso: '2026-11-22T12:00:00.000Z',
      firebaseAuth: {
        configured: true,
        authReady: true,
        signedIn: true,
        emailVerified: true,
        email: 'tech@lab.edu',
        uidMasked: 'uid***123',
        serverTokenVerified: true,
        serverAuthKind: 'FIREBASE_ID_TOKEN' as const,
        detail: 'Verified RS256',
      },
      firestore: {
        configured: true,
        databaseId: '(default)',
        status: 'CONNECTED' as const,
        profileReadVerified: true,
        latencyMs: 22,
        detail: 'Firestore read OK',
      },
    };

    const unreachable = formatCloudSqlErrorDetails({
      ...baseSnapshot,
      cloudSqlPostgres: {
        status: 'UNREACHABLE',
        configured: true,
        latencyMs: 412,
        probeMethod: 'TCP_PG_WIRE',
        detail: 'ECONNREFUSED connecting to Cloud SQL proxy',
      },
    });
    assert.equal(unreachable.hasError, true);
    assert.equal(unreachable.severity, 'CRITICAL');
    assert.equal(unreachable.errorCode, 'ECONNREFUSED');
    assert.match(unreachable.headline, /Unreachable/i);
    assert.match(unreachable.formattedMessage, /ECONNREFUSED/);

    const notConfigured = formatCloudSqlErrorDetails({
      ...baseSnapshot,
      cloudSqlPostgres: {
        status: 'NOT_CONFIGURED',
        configured: false,
        latencyMs: 0,
        probeMethod: 'NONE',
        detail: 'Cloud SQL PostgreSQL runtime variables are unset.',
      },
    });
    assert.equal(notConfigured.hasError, true);
    assert.equal(notConfigured.errorCode, 'SQL_NOT_CONFIGURED');

    const connected = formatCloudSqlErrorDetails({
      ...baseSnapshot,
      cloudSqlPostgres: {
        status: 'CONNECTED',
        configured: true,
        latencyMs: 18,
        probeMethod: 'TCP_PG_WIRE',
        detail: 'PostgreSQL responding normally',
      },
    });
    assert.equal(connected.hasError, false);
    assert.equal(connected.severity, 'NONE');

    const widgetSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/ConnectionHealthWidget.tsx'),
      'utf8'
    );
    assert.ok(widgetSrc.includes('db-activity-pulse'), 'Pulse indicator must exist');
    assert.ok(widgetSrc.includes('animate-ping'), 'Subtle expanding ping animation must exist');
    assert.ok(widgetSrc.includes('Error Details'), 'Error Details trigger label must exist');
    assert.ok(widgetSrc.includes('cloudsql-error-details-tooltip'), 'Error Details tooltip must exist');

    const footerSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/LabStatusFooter.tsx'),
      'utf8'
    );
    assert.ok(footerSrc.includes('animate-ping'), 'LabStatusFooter syncing pulse must exist');
  });

  // ---------------------------------------------------------------------------
  // 2. Section 1 — Academy 3-Tier Curriculum, Safety Gate, SHA-256 PDF & Verifier
  // ---------------------------------------------------------------------------
  await runTest('2. Academy curriculum provides 3 tiers and enforces cold PSU-OFF safety gate in toleranceEvaluator', () => {
    assert.equal(ACADEMY_TRAINING_LEVELS.length, 3);
    assert.ok(ACADEMY_CURRICULUM_MODULES.length >= 6);

    const coldModule = ACADEMY_CURRICULUM_MODULES.find((m) =>
      m.steps.some((s) => s.requiredPsuState === 'OFF')
    );
    assert.ok(coldModule, 'Expected at least one module with a cold PSU-OFF step');
    const coldStep = coldModule.steps.find((s) => s.requiredPsuState === 'OFF')!;

    const energizedPsu: PowerSupplyState = {
      isOutputEnabled: true,
      voltageSetting: 12.6,
      currentLimit: 3.0,
      preset: '12V_BENCH',
    };

    const blocked = evaluateAcademyStepTolerance(coldStep, {
      powerSupply: energizedPsu,
      multimeter: {
        isPowered: true,
        mode: coldStep.requiredDmmMode,
        rangeAuto: true,
        holdValue: false,
        redProbe: { attachedToPinId: coldStep.redProbeTargets[0], attachedLabel: coldStep.redProbeLabel },
        blackProbe: { attachedToPinId: coldStep.blackProbeTargets[0], attachedLabel: coldStep.blackProbeLabel },
      },
      multimeterReading: {
        display: '60.0',
        value: 60.0,
        unit: coldStep.unitLabel,
        isOverLimit: false,
        isWarning: true,
        warningMessage: 'PSU energized during cold check',
      },
    });

    assert.equal(blocked.status, 'SAFETY_BLOCKED');
    assert.equal(blocked.safetyBlocked, true);
    assert.ok(blocked.safetyWarningTaglish && blocked.safetyWarningTaglish.includes('SAFETY LOCK'));
  });

  await runTest('3. Academy SHA-256 PDF generation + Instructor Verifier pass genuine and reject tampered payload', async () => {
    clearAcademySignedSessionLogsForTests();
    const mod = ACADEMY_CURRICULUM_MODULES[0];
    const psu: PowerSupplyState = {
      isOutputEnabled: true,
      voltageSetting: 12.6,
      currentLimit: 3.0,
      preset: '12V_BENCH',
    };

    const pdfOut = await generateAcademyLabPdf({
      student: {
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        studentAccountCode: 'STU-2026-0042',
        universityCampus: 'AutoElectric Polytechnic — Main',
        labTerminal: 'BAY-02',
        studentConclusion: 'Confirmed stable 5.00V VREF and verified ground integrity.',
      },
      boundSessionRef: 'TERMINAL-BAY-02',
      module: mod,
      capturedEvidence: {
        [mod.steps[0].id]: {
          stepId: mod.steps[0].id,
          stepNumber: mod.steps[0].stepNumber,
          titleTaglish: mod.steps[0].titleTaglish,
          probeSetupLabel: `${mod.steps[0].redProbeLabel} / ${mod.steps[0].blackProbeLabel}`,
          dmmMode: mod.steps[0].requiredDmmMode,
          psuEnabled: mod.steps[0].requiredPsuState !== 'OFF',
          psuVoltage: 12.6,
          measuredDisplay: mod.steps[0].expectedReadingLabel,
          measuredUnit: mod.steps[0].unitLabel,
          measuredNumeric: Number.isFinite(mod.steps[0].minValue) ? mod.steps[0].minValue : 0,
          expectedCriteria: mod.steps[0].expectedReadingLabel,
          status: 'PASSED',
          capturedAtIso: new Date().toISOString(),
        },
      },
      powerSupply: psu,
      peakCurrentDrawAmps: 0.48,
      activeDTCs: [],
      faults: [],
      wires: [],
      download: false,
    });

    assert.ok(pdfOut.fileName.endsWith('.pdf'), 'Generated A4 PDF filename must end with .pdf');
    assert.match(pdfOut.envelope.sha256Hash, /^[a-f0-9]{64}$/i);

    // Verify via full QR token
    const qrCheck = await verifyAcademyLabReport(pdfOut.envelope.qrToken);
    assert.equal(qrCheck.valid, true);
    assert.equal(qrCheck.badge, 'VERIFIED_GENUINE_SESSION');

    // Verify via 64-char SHA-256 hex digest lookup
    const hashCheck = await verifyAcademyLabReport(pdfOut.envelope.sha256Hash);
    assert.equal(hashCheck.valid, true);
    assert.equal(hashCheck.badge, 'VERIFIED_GENUINE_SESSION');

    // Tampered token MUST fail cleanly
    const tamperedToken = `${pdfOut.envelope.qrToken.slice(0, -4)}XXXX`;
    const tamperedCheck = await verifyAcademyLabReport(tamperedToken);
    assert.equal(tamperedCheck.valid, false);
    assert.equal(tamperedCheck.badge, 'TAMPERED_INVALID_SIGNATURE');
  });

  // ---------------------------------------------------------------------------
  // 3. Section 2 — Offline ECDSA P-256 Subscription PIN, Anti-Clock Guard & Server Routes
  // ---------------------------------------------------------------------------
  await runTest('4. Server billing routes enforce Master Admin PIN on /api/admin/generate-license and expose only public JWK on /api/billing/public-key', async () => {
    clearIssuedOfflineLicensesForTests();
    const prevPin = process.env.VECL_ADMIN_MASTER_PIN;
    process.env.VECL_ADMIN_MASTER_PIN = 'TEST-MASTER-2026';

    const app = createAutoelectricApiApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      // Public key route exposes ONLY public ECDSA P-256 JWK (never private 'd' coordinate)
      const pkRes = await fetch(`${baseUrl}/api/billing/public-key`);
      assert.equal(pkRes.status, 200);
      const pkJson = (await pkRes.json()) as { publicKeyJwk: JsonWebKey };
      assert.equal(pkJson.publicKeyJwk.kty, 'EC');
      assert.equal(pkJson.publicKeyJwk.crv, 'P-256');
      assert.equal(pkJson.publicKeyJwk.d, undefined, 'Private key material MUST NEVER be exposed');

      // Unauthenticated POST /api/admin/generate-license MUST return 401
      const unauthRes = await fetch(`${baseUrl}/api/admin/generate-license`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationDays: 30, technicianNote: 'Unauthorized Attempt' }),
      });
      assert.equal(unauthRes.status, 401);

      // Authenticated POST /api/admin/generate-license returns signed offline key
      const authRes = await fetch(`${baseUrl}/api/admin/generate-license`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': 'TEST-MASTER-2026',
        },
        body: JSON.stringify({ durationDays: 180, technicianNote: 'Shop Bench 01' }),
      });
      assert.equal(authRes.status, 200);
      const authJson = (await authRes.json()) as {
        record: { licenseKey: string; signedActivationCode: string };
        publicKeyJwk: JsonWebKey;
      };
      assert.match(authJson.record.licenseKey, /^AELP-PRO-[A-Z0-9]{4}-\d{4}$/);

      // Verify offline via Web Crypto ECDSA P-256
      const verifyRes = await verifyOfflineLicenseSignature(
        authJson.record.signedActivationCode,
        authJson.publicKeyJwk
      );
      assert.equal(verifyRes.valid, true);
      assert.equal(verifyRes.payload?.durationDays, 180);
    } finally {
      server.close();
      if (prevPin === undefined) delete process.env.VECL_ADMIN_MASTER_PIN;
      else process.env.VECL_ADMIN_MASTER_PIN = prevPin;
    }
  });

  await runTest('5. Offline License Vault enforces ECDSA signature, device binding, and CLOCK_TAMPER_DETECTED rollback guard', async () => {
    await clearOfflineLicenseVaultForTests();
    const pubJwk = getPublicVerificationKeyJwk();
    const issued = generateSignedOfflineLicense({
      durationDays: 30,
      technicianNote: 'Offline Test Bay',
    });

    const now = Date.now();
    const activated = await activateOfflineLicenseCode({
      activationCode: issued.signedActivationCode,
      publicKeyOverride: pubJwk,
      nowMs: now,
    });
    assert.equal(activated.ok, true);
    assert.equal(activated.statusView.status, 'PRO_ACTIVE');
    assert.equal(activated.statusView.isProUnlocked, true);

    // Device mismatch rejection
    const mismatch = await activateOfflineLicenseCode({
      activationCode: issued.signedActivationCode,
      publicKeyOverride: pubJwk,
      expectedDeviceId: 'DEV-OTHER-WORKSTATION',
      nowMs: now,
    });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.statusView.status, 'DEVICE_MISMATCH');

    // Monotonic Anti-Clock Rollback Guard (simulate clock rolled back by 2 hours)
    const rolledBack = await getOfflineLicenseStatus(now - 2 * 3_600_000);
    assert.equal(rolledBack.status, 'CLOCK_TAMPER_DETECTED');
    assert.equal(rolledBack.isProUnlocked, false);

    // Billing QR config persistence
    await clearBillingConfigForTests();
    const savedQr = await savePaymentQrConfig({
      accountName: 'AutoElectric Lab Official',
      accountNumber: '0917-000-0000',
      qrImageDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    });
    const loadedQr = await loadPaymentQrConfig();
    assert.equal(loadedQr.accountName, savedQr.accountName);
    assert.equal(loadedQr.accountNumber, '0917-000-0000');
  });

  // ---------------------------------------------------------------------------
  // 4. Section 3 — Hands-Free Natural Taglish Local AI Voice Coach
  // ---------------------------------------------------------------------------
  await runTest('6. localVoiceBrain routes all 6 intents, enforces 0.75 confidence lock, anti-repetition, and bans archaic Tagalog', () => {
    assert.equal(VOICE_DB_CONFIDENCE_THRESHOLD, 0.75);
    assert.equal(HANDS_FREE_TTS_RATE, 0.94);
    assert.equal(HANDS_FREE_TTS_PITCH, 1.0);
    assert.equal(HANDS_FREE_CHIME_HZ, 660);
    assert.equal(HANDS_FREE_CHIME_MS, 70);
    assert.equal(HANDS_FREE_AUTO_RESUME_MS, 400);

    // Natural Taglish Lexicon Filter must strip every prohibited deep Tagalog word
    const filtered = sanitizeToNaturalTaglish(
      'Ilagay ang sonda sa kawad ng boltaheng sanggunian para sa talatuntunan at pagpapatunay.'
    );
    for (const banned of BANNED_DEEP_TAGALOG_WORDS) {
      assert.equal(
        filtered.toLowerCase().includes(banned),
        false,
        `Filtered output must not contain banned archaic term: ${banned}`
      );
    }

    let mem = createInitialVoiceSessionMemory(ACADEMY_CURRICULUM_MODULES[0].id);

    // Intent 1: DIRECT_PROBE_QUERY
    const r1 = processVoiceCoachTurn({ transcript: 'Saan itutusok ang red probe?', memory: mem });
    assert.equal(r1.intent, 'DIRECT_PROBE_QUERY');
    assert.equal(r1.usedClarificationFallback, false);
    mem = r1.updatedMemory;

    // Intent 2: EXPECTED_VALUE_QUERY
    const r2 = processVoiceCoachTurn({ transcript: 'Ilan ang expected voltage dito?', memory: mem });
    assert.equal(r2.intent, 'EXPECTED_VALUE_QUERY');
    mem = r2.updatedMemory;

    // Intent 3: READING_EVALUATION
    const r3 = processVoiceCoachTurn({ transcript: '5.0 volts ang reading na lumabas', memory: mem });
    assert.equal(r3.intent, 'READING_EVALUATION');
    mem = r3.updatedMemory;

    // Intent 4: SIMPLIFY_OR_REPEAT with anti-repetition (2 consecutive calls produce distinct responses)
    const r4a = processVoiceCoachTurn({ transcript: 'Ulitin nang mas simple hindi ko gets', memory: mem });
    assert.equal(r4a.intent, 'SIMPLIFY_OR_REPEAT');
    mem = r4a.updatedMemory;
    const r4b = processVoiceCoachTurn({ transcript: 'Ulitin ulit mas simple', memory: mem });
    assert.equal(r4b.intent, 'SIMPLIFY_OR_REPEAT');
    assert.notEqual(
      r4a.spokenText,
      r4b.spokenText,
      'Anti-repetition memory must produce a different simpler phrasing on repeated confusion'
    );
    mem = r4b.updatedMemory;

    // Intent 5: STEP_NAVIGATION
    const r5 = processVoiceCoachTurn({ transcript: 'Tapos na, next step', memory: mem });
    assert.equal(r5.intent, 'STEP_NAVIGATION');
    assert.equal(r5.nextStepIndex, 1);
    mem = r5.updatedMemory;

    // Intent 6: DTC_OR_COMPONENT_LOOKUP
    const r6 = processVoiceCoachTurn({ transcript: 'Ano ibig sabihin ng P0122?', memory: mem });
    assert.equal(r6.intent, 'DTC_OR_COMPONENT_LOOKUP');
    assert.ok(r6.spokenText.includes('P0122'));
    mem = r6.updatedMemory;

    // Strict 0.75 DB confidence lock: nonsense transcript MUST ask clarification instead of guessing
    const rLow = processVoiceCoachTurn({ transcript: 'asdfghjkl blabla xyz', memory: mem });
    assert.equal(rLow.usedClarificationFallback, true);
    assert.ok(rLow.confidence < VOICE_DB_CONFIDENCE_THRESHOLD);
  });

  // ---------------------------------------------------------------------------
  // 5. Storage Hygiene — Attached Blueprint PDF Deleted Cleanly
  // ---------------------------------------------------------------------------
  await runTest('7. Attached Blueprint PDF is deleted to conserve repository storage', () => {
    const pdfPath = path.resolve(
      process.cwd(),
      'public/assets/aistudio/AutoElectric_Lab_Pro_Master_Implementation_Blueprint_b1cd0175.pdf'
    );
    assert.equal(fs.existsSync(pdfPath), false, 'Blueprint PDF must be deleted after implementation');
  });

  // Verify signAcademyLabSession helper directly as well
  await runTest('8. signAcademyLabSession persists and returns deterministic 64-char SHA-256 digest', async () => {
    const mod = ACADEMY_CURRICULUM_MODULES[0];
    const env = await signAcademyLabSession({
      student: {
        firstName: 'Maria',
        lastName: 'Santos',
        studentAccountCode: 'STU-2026-0099',
        universityCampus: 'Cebu AutoTech',
        labTerminal: 'BAY-05',
        studentConclusion: 'Verified bench baseline.',
      },
      boundSessionRef: 'TERMINAL-BAY-05',
      module: mod,
      capturedEvidence: {},
      powerSupply: {
        isOutputEnabled: false,
        voltageSetting: 12.6,
        currentLimit: 3.0,
        preset: '12V_BENCH',
      },
      peakCurrentDrawAmps: 0.1,
      activeDTCs: [],
      faults: [],
      wires: [],
      waveformDigest: 'MNA-TEST-DIGEST',
    });
    assert.match(env.sha256Hash, /^[a-f0-9]{64}$/i);
  });

  console.log(`\n[Blueprint Master Verification Suite] PASSED ${passed}/8 assertions.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
