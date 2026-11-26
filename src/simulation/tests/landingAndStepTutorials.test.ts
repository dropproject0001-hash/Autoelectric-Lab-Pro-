/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  APP_ACADEMY_BANNER_SRC,
  APP_BRANDING_GUIDE_SRC,
  APP_LOGO_SRC,
  APP_MODULE_ICONS_SHEET_SRC,
  APP_STUDIO_CARDS_SHEET_SRC,
  CREATOR_CREDENTIALS,
  isVerifiedOwnerEmail,
  RAMTI_SUBTITLE_LINES,
  RAMTI_TRADEMARK_WORDMARK,
} from '../../constants/branding';
import { RAMTI_CORE_AND_HARDWARE_ICONS } from '../../components/icons/RamtiBrandAssets';
import { buildTutorialStoryboardChapters } from '../../components/academy/StepTutorialVideoModal';
import { UNIVERSITY_LAB_MODULES } from '../../data/universityLabCurriculum';
import { DEFAULT_ECU_PINS } from '../../simulation/ecu/BenchCircuitSolver';
import {
  buildGroundedStepSpec,
  buildStepTutorialCacheKey,
  buildStepTutorialPrompt,
  buildStepTutorialSubtitles,
  isStepTutorialEligibleTier,
} from '../../utils/stepTutorialBuilder';
import { createAutoelectricApiApp } from '../../server/createApiApp';
import {
  resetTrialStoreForTests,
  setTrialStoreFilePathForTests,
} from '../../server/services/trialPinService';
import { resetLicenseStoreForTests } from '../../server/services/licenseService';
import {
  AUTOELECTRIC_SYSTEM_BLUEPRINT_SECTIONS,
  generateSystemBlueprintPdf,
  SYSTEM_BLUEPRINT_PDF_FILENAME,
} from '../../services/systemBlueprintPdfService';

describe('Landing Credentials & Grounded Step Tutorial Pipeline', () => {
  it('exposes complete creator credentials and RAMTi brand assets for WelcomeBenchOverlay and CredentialsModal', () => {
    assert.ok(CREATOR_CREDENTIALS.organization.includes('RMATi'));
    assert.ok(CREATOR_CREDENTIALS.organization.includes('RAMTi'));
    assert.equal(RAMTI_TRADEMARK_WORDMARK, 'RAMTi');
    assert.deepEqual(RAMTI_SUBTITLE_LINES, [
      'Ruben AutoMotive',
      'Modern Technology',
      'Innovation',
    ]);
    assert.equal(CREATOR_CREDENTIALS.leaders.length, 2);
    const lead = CREATOR_CREDENTIALS.leaders[0];
    assert.equal(lead.name, 'Ruben Llego');
    assert.equal(lead.email, 'rubenllego12@gmail.com');
    const coOwner = CREATOR_CREDENTIALS.leaders[1];
    assert.equal(coOwner.name, 'Elnombre Danong');

    // Verify all 5 uploaded RAMTi branding & iconography assets exist in public/
    const assetPaths = [
      APP_LOGO_SRC,
      APP_BRANDING_GUIDE_SRC,
      APP_MODULE_ICONS_SHEET_SRC,
      APP_ACADEMY_BANNER_SRC,
      APP_STUDIO_CARDS_SHEET_SRC,
    ];
    for (const rel of assetPaths) {
      const fullPath = path.join(process.cwd(), 'public', rel);
      assert.ok(fs.existsSync(fullPath), `Missing RAMTi asset: ${fullPath}`);
    }

    // Verify 15 Core/Hardware flat-vector modules + 6 Studio/Tool visual cards (21 total)
    assert.equal(RAMTI_CORE_AND_HARDWARE_ICONS.length, 21);

    // Verify 5-chapter storyboard builder
    const firstMod = UNIVERSITY_LAB_MODULES[0];
    const spec = buildGroundedStepSpec(firstMod, firstMod.steps[0], DEFAULT_ECU_PINS);
    const chapters = buildTutorialStoryboardChapters(spec);
    assert.equal(chapters.length, 5);
    assert.equal(chapters[0].label, 'Chapter 1');
    assert.equal(chapters[4].label, 'Chapter 5');
    assert.ok(chapters[0].detail.includes(spec.focusPinLabel));
  });

  it('enforces Level 1 & Level 2 eligibility and deterministic cache keys', () => {
    assert.equal(isStepTutorialEligibleTier('LEVEL_1_BEGINNER'), true);
    assert.equal(isStepTutorialEligibleTier('LEVEL_2_INTERMEDIATE'), true);
    assert.equal(isStepTutorialEligibleTier('LEVEL_3_ADVANCED'), false);

    const k1 = buildStepTutorialCacheKey('LAB-01', 'step-1', 'TAGLISH_COACH', 6);
    const k2 = buildStepTutorialCacheKey('LAB-01', 'step-1', 'CONCISE_BENCH', 6);
    const k3 = buildStepTutorialCacheKey('LAB-01', 'step-1', 'TAGLISH_COACH', 8);
    assert.notEqual(k1, k2);
    assert.notEqual(k1, k3);
  });

  it('constructs strictly grounded step specs, prompts, and synced subtitles for all Level 1 & 2 modules', () => {
    const eligibleModules = UNIVERSITY_LAB_MODULES.filter((m) =>
      isStepTutorialEligibleTier(m.tier)
    );
    assert.ok(eligibleModules.length >= 2);

    for (const mod of eligibleModules) {
      for (const step of mod.steps) {
        const spec = buildGroundedStepSpec(mod, step, DEFAULT_ECU_PINS);
        assert.equal(spec.moduleId, mod.id);
        assert.equal(spec.stepId, step.id);
        assert.equal(spec.focusPinLabel, step.focusPinLabel);
        assert.equal(spec.redProbeLabel, step.redProbeLabel);
        assert.equal(spec.blackProbeLabel, step.blackProbeLabel);
        assert.equal(spec.dmmModeDisplay, step.dmmModeDisplay);

        const prompt = buildStepTutorialPrompt(spec, 'TAGLISH_COACH', 6);
        assert.ok(prompt.includes('16:9'));
        assert.ok(prompt.includes(step.focusPinLabel));
        assert.ok(prompt.includes(step.dmmModeDisplay));
        assert.ok(prompt.includes(step.redProbeLabel));
        assert.ok(prompt.includes(step.blackProbeLabel));
        assert.ok(prompt.includes(step.expectedReadingLabel));

        for (const style of [
          'TAGLISH_COACH',
          'CONCISE_BENCH',
          'INSTRUCTOR_DETAILED',
        ] as const) {
          const cues = buildStepTutorialSubtitles(spec, style, 8);
          assert.equal(cues.length, 4);
          assert.equal(cues[0].startSec, 0);
          assert.equal(cues[cues.length - 1].endSec, 8);
          for (let i = 0; i < cues.length; i += 1) {
            assert.ok(cues[i].endSec > cues[i].startSec);
            if (i > 0) {
              assert.equal(cues[i].startSec, cues[i - 1].endSec);
            }
            assert.ok(cues[i].text.length > 0);
            assert.ok(cues[i].voiceText.length > 0);
          }
        }
      }
    }
  });

  it('validates /api/autoelectric/step-tutorial-video auth, tier checks, and grounded fallback metadata', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vecl-step-tutorial-'));
    const storePath = path.join(tmpDir, 'trials.store.json');
    const prevMasterPin = process.env.VECL_ADMIN_MASTER_PIN;
    const prevGeminiKey = process.env.GEMINI_API_KEY;
    const prevGoogleKey = process.env.GOOGLE_API_KEY;

    process.env.VECL_ADMIN_MASTER_PIN = '774488';
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    setTrialStoreFilePathForTests(storePath);
    resetTrialStoreForTests();
    resetLicenseStoreForTests();

    const app = createAutoelectricApiApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // 1. Unauthenticated request blocked with 401
      const unauthRes = await fetch(`${baseUrl}/api/autoelectric/step-tutorial-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId: 'LAB-01', stepId: 'lab01-step1' }),
      });
      assert.equal(unauthRes.status, 401);

      // 2. Authenticate Admin Master -> obtain adminToken
      const adminLoginRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterPin: '774488' }),
      });
      assert.equal(adminLoginRes.status, 200);
      const { adminToken } = (await adminLoginRes.json()) as { adminToken: string };
      assert.ok(adminToken);

      const level1Mod = UNIVERSITY_LAB_MODULES.find((m) => m.tier === 'LEVEL_1_BEGINNER');
      const level3Mod = UNIVERSITY_LAB_MODULES.find((m) => m.tier === 'LEVEL_3_ADVANCED');
      assert.ok(level1Mod && level3Mod);

      // 3. Level 3 module rejected cleanly (Level 1 & Level 2 only)
      const lvl3Res = await fetch(`${baseUrl}/api/autoelectric/step-tutorial-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          moduleId: level3Mod.id,
          stepId: level3Mod.steps[0].id,
        }),
      });
      assert.equal(lvl3Res.status, 400);
      const lvl3Body = (await lvl3Res.json()) as { code?: string };
      assert.equal(lvl3Body.code, 'TIER_NOT_ELIGIBLE');

      // 4. Unknown module returns 404
      const unknownRes = await fetch(`${baseUrl}/api/autoelectric/step-tutorial-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          moduleId: 'NON_EXISTENT_MOD',
          stepId: 'step-1',
        }),
      });
      assert.equal(unknownRes.status, 404);

      // 5. Valid Level 1 step returns 503 MISSING_API_KEY WITH grounded spec & 4 synced subtitles
      const validRes = await fetch(`${baseUrl}/api/autoelectric/step-tutorial-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          moduleId: level1Mod.id,
          stepId: level1Mod.steps[0].id,
          narrationStyle: 'TAGLISH_COACH',
          durationSec: 6,
          ecuPins: DEFAULT_ECU_PINS.slice(0, 8),
        }),
      });
      assert.equal(validRes.status, 503);
      const validBody = (await validRes.json()) as {
        code?: string;
        grounded?: { focusPinLabel?: string; dmmModeDisplay?: string };
        subtitles?: unknown[];
      };
      assert.equal(validBody.code, 'MISSING_API_KEY');
      assert.equal(validBody.grounded?.focusPinLabel, level1Mod.steps[0].focusPinLabel);
      assert.equal(validBody.grounded?.dmmModeDisplay, level1Mod.steps[0].dmmModeDisplay);
      assert.equal(validBody.subtitles?.length, 4);
    } finally {
      if (prevMasterPin === undefined) delete process.env.VECL_ADMIN_MASTER_PIN;
      else process.env.VECL_ADMIN_MASTER_PIN = prevMasterPin;
      if (prevGeminiKey !== undefined) process.env.GEMINI_API_KEY = prevGeminiKey;
      if (prevGoogleKey !== undefined) process.env.GOOGLE_API_KEY = prevGoogleKey;
      server.close();
      resetTrialStoreForTests();
      setTrialStoreFilePathForTests(null);
      resetLicenseStoreForTests();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('generates multi-page A4 vector PDF for AutoElectric Lab PRO System Blueprint and saves downloadable public file', async () => {
    assert.equal(AUTOELECTRIC_SYSTEM_BLUEPRINT_SECTIONS.length, 4);
    const result = await generateSystemBlueprintPdf({
      generatedAtIso: '2026-11-26T06:00:00.000Z',
      skipBrowserDownload: true,
    });
    assert.equal(result.fileName, SYSTEM_BLUEPRINT_PDF_FILENAME);
    assert.match(result.sha256Hash, /^[a-f0-9]{64}$/);
    assert.ok(result.pageCount >= 2);
    assert.ok(result.pdfBytes.byteLength > 4000);

    const headerAscii = Buffer.from(result.pdfBytes.slice(0, 5)).toString('ascii');
    assert.equal(headerAscii, '%PDF-');

    const publicPdfPath = path.resolve(process.cwd(), 'public', SYSTEM_BLUEPRINT_PDF_FILENAME);
    fs.writeFileSync(publicPdfPath, Buffer.from(result.pdfBytes));
    assert.ok(fs.existsSync(publicPdfPath));
  });

  it('restricts System Blueprint PDF download visibility exclusively to Owner account and Master Admin across Landing, Credentials Modal, and Admin Console', () => {
    assert.equal(isVerifiedOwnerEmail('rubenllego12@gmail.com'), true);
    assert.equal(isVerifiedOwnerEmail('  RUBENLLEGO12@GMAIL.COM '), true);
    assert.equal(isVerifiedOwnerEmail('rubenlleg12@gmail.com'), true);
    assert.equal(isVerifiedOwnerEmail('student@example.edu'), false);
    assert.equal(isVerifiedOwnerEmail(null), false);
    assert.equal(isVerifiedOwnerEmail(undefined), false);

    const landingSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/IntroductionPinLandingPage.tsx'),
      'utf8'
    );
    assert.ok(
      landingSource.includes('{isMasterAdminOrOwner && (') &&
        landingSource.includes('data-testid="download-system-blueprint-pdf-btn"'),
      'Landing page must gate download-system-blueprint-pdf-btn behind isMasterAdminOrOwner'
    );

    const credentialsSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/CredentialsModal.tsx'),
      'utf8'
    );
    assert.ok(
      credentialsSource.includes('{canDownloadSystemBlueprint && (') &&
        credentialsSource.includes('data-testid="credentials-download-blueprint-pdf-btn"'),
      'CredentialsModal must gate credentials-download-blueprint-pdf-btn behind canDownloadSystemBlueprint'
    );

    const adminConsoleSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/AdminLicenseModal.tsx'),
      'utf8'
    );
    assert.ok(
      adminConsoleSource.includes('{isMasterAdminOrOwner && (') &&
        adminConsoleSource.includes('data-testid="admin-console-download-blueprint-pdf-btn"'),
      'AdminLicenseModal must expose admin-console-download-blueprint-pdf-btn exclusively when isMasterAdminOrOwner is true'
    );

    // Verify landing page layout realignment:
    // 1. Top cover banner and bottom post-footer cover banner both use object-contain
    assert.ok(landingSource.includes('data-testid="landing-top-cover-banner"'));
    assert.ok(landingSource.includes('data-testid="landing-bottom-cover-banner"'));
    const footerCloseIdx = landingSource.indexOf('</footer>');
    const bottomBannerIdx = landingSource.indexOf('data-testid="landing-bottom-cover-banner"');
    assert.ok(
      footerCloseIdx > 0 && bottomBannerIdx > footerCloseIdx,
      'Second cover banner must be placed below the footer'
    );
    const topBannerBlock = landingSource.slice(
      landingSource.indexOf('data-testid="landing-top-cover-banner"'),
      landingSource.indexOf('id="pin-verification-gate"')
    );
    const bottomBannerBlock = landingSource.slice(bottomBannerIdx);
    assert.ok(
      topBannerBlock.includes('object-contain') && !topBannerBlock.includes('object-cover'),
      'Top cover banner must use object-contain without object-cover cropping'
    );
    assert.ok(
      bottomBannerBlock.includes('object-contain') && !bottomBannerBlock.includes('object-cover'),
      'Bottom cover banner must use object-contain without object-cover cropping'
    );

    // 2. Central RAMTi emblem flanked by left and right circuit trace wings
    assert.ok(landingSource.includes('data-testid="ramti-emblem-left-wing"'));
    assert.ok(landingSource.includes('data-testid="ramti-emblem-right-wing"'));

    // 3. Equal 50/50 side-by-side split (lg:col-span-6) for Studios and Hardware Iconography
    assert.ok(landingSource.includes('data-testid="landing-ramti-studios-grid"'));
    assert.ok(landingSource.includes('data-testid="landing-ramti-module-icons-grid"'));
  });
});


