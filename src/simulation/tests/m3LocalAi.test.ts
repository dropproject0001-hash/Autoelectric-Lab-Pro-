/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import {
  LOCAL_MODEL_PROFILES,
  MAX_LOCAL_MODEL_STORAGE_BUDGET_MB,
  detectPlatformClass,
  getActiveLocalExplainer,
  getLocalAiRuntimeStatus,
  grantModelDownloadConsent,
  inspectLocalAiCapabilities,
  loadLocalWebGpuModel,
  resetLocalAiServiceForTests,
  selectRecommendedModelProfile,
  setLocalModelLoaderForTests,
} from '../../services/ai/localWebLlmService';
import { runUnifiedAiOrchestrator } from '../../services/ai/unifiedAiOrchestrator';

async function runM3LocalAiTests(): Promise<void> {
  console.log('\n=== M3 LOCAL AI (WEBGPU / WEBLLM PROFILES, CONSENT & GRACEFUL FALLBACK) SUITE ===');
  await resetLocalAiServiceForTests();

  // 1. Capability-based profile selection for Android vs Laptop vs Desktop
  const androidClass = detectPlatformClass('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/128', 4);
  assert.equal(androidClass, 'ANDROID_MOBILE');
  const androidProfile = selectRecommendedModelProfile(androidClass, 4);
  assert.equal(androidProfile.profileId, 'android-compact-q4');
  assert.ok(androidProfile.downloadSizeMb <= 300, 'Android compact model must stay small');

  const desktopClass = detectPlatformClass('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128', 16);
  assert.equal(desktopClass, 'DESKTOP_WORKSTATION');
  const desktopProfile = selectRecommendedModelProfile(desktopClass, 16);
  assert.equal(desktopProfile.profileId, 'desktop-pro-q4');
  assert.ok(desktopProfile.storageBudgetMb <= MAX_LOCAL_MODEL_STORAGE_BUDGET_MB);
  console.log('  PASS: 1. Capability-based model profiles select compact Android vs Desktop models within budget');

  // 2. Explicit user consent is required before downloading any model
  const blockedWithoutConsent = await loadLocalWebGpuModel('android-compact-q4');
  assert.equal(blockedWithoutConsent.ok, false);
  assert.equal(blockedWithoutConsent.requiresConsent, true);
  assert.equal(blockedWithoutConsent.downloadSizeMb, 240);
  assert.equal(blockedWithoutConsent.executionState, 'DATABASE_ONLY');
  console.log('  PASS: 2. Download consent gate blocks unconsented downloads and reports size');

  // 3. Storage budget enforcement rejects download when available storage is insufficient
  grantModelDownloadConsent('desktop-pro-q4');
  const insufficientStorage = await loadLocalWebGpuModel('desktop-pro-q4', {
    availableStorageMb: 500,
  });
  assert.equal(insufficientStorage.ok, false);
  assert.equal(insufficientStorage.executionState, 'DATABASE_ONLY');
  assert.ok(insufficientStorage.error?.includes('Insufficient storage'));
  console.log('  PASS: 3. Storage budget guard prevents exceeding device quota');

  // 4. Forced model load failure drops gracefully to DATABASE_ONLY without crashing
  grantModelDownloadConsent('android-compact-q4');
  setLocalModelLoaderForTests(async () => {
    throw new Error('Simulated WebGPU OOM / shader compilation failure');
  });
  const forcedFailure = await loadLocalWebGpuModel('android-compact-q4');
  assert.equal(forcedFailure.ok, false);
  assert.equal(forcedFailure.executionState, 'DATABASE_ONLY');
  assert.equal(getLocalAiRuntimeStatus().executionState, 'DATABASE_ONLY');
  assert.equal(getActiveLocalExplainer(), null);

  // Database search & orchestrator remain 100% usable after forced load failure
  const dbResAfterFail = await runUnifiedAiOrchestrator({
    query: 'Toyota Hilux fuse relay electrical',
    make: 'toyota',
    allowLocalLlm: true,
    localExplainerFn: getActiveLocalExplainer() || undefined,
  });
  assert.equal(dbResAfterFail.executionMode, 'DATABASE_ONLY');
  assert.equal(dbResAfterFail.hasEvidenceGap, false);
  assert.ok(dbResAfterFail.sources.length > 0);
  console.log('  PASS: 4. Forced model load failure drops cleanly to DATABASE_ONLY without crashing');

  // 5. Successful local model load transitions to LOCAL_WEBGPU_INFERENCE and powers orchestrator
  setLocalModelLoaderForTests(async (profile) => ({
    explain: async () =>
      `Local ${profile.displayName} explanation: Refer to verified Toyota Hilux fuse and relay catalog record.`,
  }));
  const loaded = await loadLocalWebGpuModel('android-compact-q4');
  assert.equal(loaded.ok, true);
  assert.equal(loaded.executionState, 'LOCAL_WEBGPU_INFERENCE');
  const localRes = await runUnifiedAiOrchestrator({
    query: 'Toyota Hilux fuse relay electrical',
    make: 'toyota',
    allowLocalLlm: true,
    localExplainerFn: getActiveLocalExplainer() || undefined,
  });
  assert.equal(localRes.executionMode, 'LOCAL_WEBGPU_LLM');
  assert.ok(localRes.answer.includes('SmolLM2 360M'));

  const capReport = await inspectLocalAiCapabilities({
    userAgent: 'Mozilla/5.0 (Linux; Android 14)',
    deviceMemoryGb: 4,
    availableStorageMb: 2000,
  });
  assert.equal(capReport.withinStorageBudget, true);
  assert.equal(LOCAL_MODEL_PROFILES.length, 3);

  await resetLocalAiServiceForTests();
  console.log('  PASS: 5. Local WebGPU runtime integrates with Unified AI Orchestrator cleanly');

  console.log('\nM3 Local AI Suite Summary: 5 passed, 0 failed\n');
}

runM3LocalAiTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
