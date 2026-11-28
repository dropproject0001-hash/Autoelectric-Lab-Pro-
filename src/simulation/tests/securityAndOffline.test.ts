/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Request, Response } from 'express';
import { createAutoelectricApiApp } from '../../server/createApiApp';
import {
  getMasterAdminPinPolicyStatus,
  isValidMasterAdminProof,
  MASTER_ADMIN_ACTOR_UID,
  resetAdminMasterPinServiceForTests,
  verifyMasterAdminPinAgainstEnvHash,
} from '../../server/services/adminMasterPinService';
import {
  isSecondaryConfirmationSatisfied,
  maskMasterAdminPin,
  validateMasterPinModification,
} from '../../utils/adminPinValidation';
import {
  FirebaseTokenVerificationError,
  logFirebaseAuthStartupDiagnostics,
  requireFirebaseAuth,
  resetFirebaseAuthCacheForTests,
  resolveFirebaseProjectId,
  setJwksFetcherForTests,
  verifyFirebaseIdToken,
} from '../../server/services/firebaseAuthMiddleware';
import { classifyGeminiError } from '../../server/services/geminiErrorClassifier';
import {
  getFreeTierPoolSnapshot,
  recordModelAttemptStart,
  recordModelFailure,
  recordModelSuccess,
  resetFreeTierRouterForTests,
  resolveAdjustedThinkingLevel,
  selectFreeTierCandidates,
} from '../../server/services/geminiFreeTierRouter';
import {
  QuotaManager,
  computeSoftLimit,
  loadConfiguredGeminiKeysFromEnv,
} from '../../server/services/quotaManager';
import { ThinkingLevel } from '@google/genai';
import { validateImagePayload } from '../../server/services/imagePayloadValidator';
import { isAllowedLiveVoiceOrigin } from '../../server/services/geminiLiveVoiceServer';
import { toSafeExternalHttpUrl } from '../../utils/safeExternalUrl';
import {
  DEFAULT_SCOPE_ZOOM,
  clampScopeZoom,
  formatScopeTimeAxisTick,
  formatScopeTimeUnit,
  formatZoomFactor,
  getVisibleTimeWindowMs,
  getVisibleVoltageDomain,
  isScopeZoomed,
  panScopeViewport,
  setScopePanCenter,
  stepScopeZoomX,
  stepScopeZoomY,
  zoomHorizontalAtAnchor,
  zoomToSelectionRange,
  zoomVerticalAtAnchor,
} from '../../utils/oscilloscopeZoomUtils';
import { SignalGenerator } from '../signals/SignalGenerator';
import {
  getSavedOfflineLeaseToken,
  saveOfflineLeaseToken,
} from '../../services/licenseClientService';
import {
  cacheLocalDocument,
  enqueueOfflineMutation,
  flushOfflineMutations,
  getLocalCachedDocuments,
  getPendingMutations,
  getSyncStatusSnapshot,
  markMutationSynced,
  reserveMutationStamp,
  resetOfflineQueueForTests,
} from '../../services/offlineSyncQueue';
import {
  DEFAULT_BENCH_COMPONENTS,
  DEFAULT_ECU_PINS,
  DEFAULT_WIRES,
  solveCircuit,
  UNIVERSAL_SIMULATION_PROFILE,
} from '../ecu/BenchCircuitSolver';
import {
  evaluateUniversityLabStep,
  getUniversityLabModuleById,
  UNIVERSITY_LAB_MODULES,
} from '../../data/universityLabCurriculum';
import {
  buildSignedLabReportEnvelope,
  generateAndDownloadUniversityLabPdf,
  sanitizeInstitutionalText,
  validateStudentForm,
  verifyOfflineLabReportToken,
} from '../../services/universityLabPdfService';
import {
  normalizeVin,
  parseNhtsaComplaintsPayload,
  parseNhtsaRecallsPayload,
  parseNhtsaVinResult,
} from '../../server/services/nhtsaService';
import {
  getCustomWires,
  isCustomWireConnection,
  MAX_WIRE_LABEL_LENGTH,
  normalizeWireLabelInput,
  renameWireInList,
  sanitizeWiresForSession,
} from '../../utils/wireLabelUtils';
import {
  BENCH_PREFERENCES_DOC_ID,
  buildBenchSessionUpdatePayload,
  buildConflictCopyFaultSequence,
  buildConflictCopySessionPayload,
  cancelScheduledBenchSyncRetries,
  countLocalWorkstationFaultSequences,
  deleteFaultSequence,
  extractRemoteUpdatedAtMs,
  flushQueuedBenchSync,
  formatConflictCopyTitle,
  formatFaultSequenceConflictCopyTitle,
  hasRemoteSessionConflict,
  LOCAL_WORKSTATION_UID,
  migrateLegacyLocalFaultSequencesToStore,
  promoteLocalWorkstationFaultSequencesToUser,
  saveFaultSequence,
  SCHEMA_VERSION_SUBCOLLECTIONS,
  setBenchSyncExecutorForTests,
  subscribeBenchSessions,
  subscribeDiagnosticLogs,
  subscribeFaultSequences,
  subscribePcbScans,
  subscribeUserBenchPreferences,
  syncFordOemPinoutsToDatabase,
  syncToyotaOemPinoutsToDatabase,
  syncUserProfile,
  toSafeFirestoreDocId,
} from '../../services/benchStorageService';
import { describeFooterSyncIndicator } from '../../components/LabStatusFooter';
import {
  buildFirebaseAuthorizedDomainsConsoleUrl,
  formatFirebaseAuthError,
  formatFirebaseAuthErrorDetails,
} from '../../context/AuthContext';
import {
  createQuotaManagerFromEnv,
  getSanitizedQuotaStatus,
  isServerQuotaRuntime,
  loadApiKeysFromEnv,
} from '../../services/ai/QuotaManager';
import {
  BUILT_IN_FAULT_SEQUENCES,
  CUSTOM_FAULT_SEQUENCES_STORAGE_KEY,
  mergeFaultSequencesWithBuiltIns,
  resetFaultSequenceStoreForTests,
  saveCustomFaultSequence,
} from '../faults/faultSequenceService';
import {
  formatCloudSyncError,
  isSuppressedOfflineOrPinOnlyCloudError,
} from '../../utils/cloudSyncErrorUtils';
import {
  resolveFirebaseClientConfig,
  resolvedFirebaseConfig,
  sanitizeFirestoreDatabaseId,
} from '../../lib/firebase';
import React from 'react';
import {
  importWithRetry,
  isTransientDynamicImportError,
  lazyWithRetry,
} from '../../utils/lazyWithRetry';
import {
  createLicenseCodeRecord,
  extendLicenseDuration,
  getUserLicenseStatus,
  hashLicenseCode,
  isValidLicenseCodeFormat,
  isVerifiedAdminUser,
  redeemLicenseCode,
  reloadLicenseStoreFromDisk,
  resetLicenseDevices,
  resetLicenseStoreForTests,
  setAdminUidForTests,
  setLicenseRevocation,
  setLicenseStoreFilePathForTests,
  signOfflineLeaseToken,
  verifyOfflineLeaseToken,
} from '../../server/services/licenseService';
import {
  evaluatePhysicalBenchMeasurement,
  STANDARD_ECU_BENCH_PIN_SPECS,
} from '../diagnostics/physicalBenchFaultIsolationEngine';
import {
  detectPwaPlatformProfile,
  evaluateSwRequestSecurityPolicy,
} from '../../hooks/usePWA';
import {
  extractGoogleConsoleUrl,
  formatWorkspaceBannerText,
  GoogleWorkspaceAuthError,
  parseGoogleWorkspaceHttpError,
} from '../../services/googleDocsService';
import { OfflineDiagnosticChatbot } from '../../services/offlineChatbotEngine';
import { loadWorkflowPreferences } from '../../utils/diagnosticWorkflow';
import {
  authorizePhysicalBenchPowerControl,
  inspectBenchHardwareAbstractionStatus,
} from '../../services/benchHardwareAbstractionLayer';
import { evaluateVehicleBenchSafety } from '../../utils/automotiveSafetyGuard';

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(err);
  }
}

function toBase64Url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signTestJwt(
  privateKey: crypto.KeyObject,
  kid: string,
  claims: Record<string, unknown>
): string {
  const header = toBase64Url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const payload = toBase64Url(JSON.stringify(claims));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  const signature = toBase64Url(signer.sign(privateKey));
  return `${header}.${payload}.${signature}`;
}

function makeMockResponse() {
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
      return res;
    },
  };
  return {
    res: res as unknown as Response,
    getStatus: () => statusCode,
    getBody: () => body,
  };
}

// Valid 1x1 transparent PNG
const VALID_1X1_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function main() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const publicJwk = publicKey.export({ format: 'jwk' }) as {
    kty: string;
    n: string;
    e: string;
  };
  const testKid = 'test-rsa-key-1';
  const projectId = 'valued-zoo-9mvz5';

  // -------------------------------------------------------------------------
  // 1. Firebase RS256 ID Token Verification & Middleware
  // -------------------------------------------------------------------------
  await runTest('verifyFirebaseIdToken accepts valid RS256 token with expected claims', async () => {
    setJwksFetcherForTests(async () => ({
      keys: [{ kid: testKid, kty: publicJwk.kty, alg: 'RS256', use: 'sig', n: publicJwk.n, e: publicJwk.e }],
      maxAgeSec: 3600,
    }));

    const now = Math.floor(Date.now() / 1000);
    const token = signTestJwt(privateKey, testKid, {
      iss: `https://securetoken.google.com/${projectId}`,
      aud: projectId,
      sub: 'user_tech_001',
      email: 'tech@autoelectric.test',
      email_verified: true,
      iat: now - 10,
      auth_time: now - 10,
      exp: now + 3600,
    });

    const verified = await verifyFirebaseIdToken(token, projectId);
    assert.equal(verified.uid, 'user_tech_001');
    assert.equal(verified.email, 'tech@autoelectric.test');
    assert.equal(verified.emailVerified, true);
    resetFirebaseAuthCacheForTests();
  });

  await runTest('verifyFirebaseIdToken rejects expired token with TOKEN_EXPIRED', async () => {
    setJwksFetcherForTests(async () => ({
      keys: [{ kid: testKid, kty: publicJwk.kty, alg: 'RS256', use: 'sig', n: publicJwk.n, e: publicJwk.e }],
      maxAgeSec: 3600,
    }));

    const now = Math.floor(Date.now() / 1000);
    const token = signTestJwt(privateKey, testKid, {
      iss: `https://securetoken.google.com/${projectId}`,
      aud: projectId,
      sub: 'user_tech_001',
      iat: now - 7200,
      exp: now - 120,
    });

    await assert.rejects(
      () => verifyFirebaseIdToken(token, projectId),
      (err: unknown) =>
        err instanceof FirebaseTokenVerificationError &&
        err.code === 'TOKEN_EXPIRED' &&
        err.statusCode === 401
    );
    resetFirebaseAuthCacheForTests();
  });

  await runTest('verifyFirebaseIdToken rejects wrong audience / tampered signature', async () => {
    setJwksFetcherForTests(async () => ({
      keys: [{ kid: testKid, kty: publicJwk.kty, alg: 'RS256', use: 'sig', n: publicJwk.n, e: publicJwk.e }],
      maxAgeSec: 3600,
    }));

    const now = Math.floor(Date.now() / 1000);
    const wrongAudToken = signTestJwt(privateKey, testKid, {
      iss: `https://securetoken.google.com/${projectId}`,
      aud: 'malicious-project',
      sub: 'user_tech_001',
      iat: now - 5,
      exp: now + 3600,
    });

    const capturedWarnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      capturedWarnings.push(args.map((a) => String(a)).join(' '));
    };
    try {
      await assert.rejects(
        () => verifyFirebaseIdToken(wrongAudToken, projectId),
        (err: unknown) =>
          err instanceof FirebaseTokenVerificationError &&
          err.code === 'INVALID_TOKEN' &&
          err.statusCode === 401 &&
          !err.message.includes(projectId) &&
          !err.message.includes('malicious-project')
      );
    } finally {
      console.warn = origWarn;
    }
    assert.equal(
      capturedWarnings.some(
        (w) =>
          w.includes(projectId) &&
          w.includes('malicious-project') &&
          w.includes('expectedProjectId')
      ),
      true,
      'Audience mismatch must log expectedProjectId and received aud/iss on the server console without leaking into HTTP error message'
    );

    const validToken = signTestJwt(privateKey, testKid, {
      iss: `https://securetoken.google.com/${projectId}`,
      aud: projectId,
      sub: 'user_tech_001',
      iat: now - 5,
      exp: now + 3600,
    });
    const parts = validToken.split('.');
    const tamperedSig = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -4)}AAAA`;

    await assert.rejects(
      () => verifyFirebaseIdToken(tamperedSig, projectId),
      (err: unknown) =>
        err instanceof FirebaseTokenVerificationError &&
        err.code === 'INVALID_TOKEN' &&
        err.statusCode === 401
    );
    resetFirebaseAuthCacheForTests();
  });

  await runTest('resolveFirebaseProjectId matches resolveFirebaseClientConfig and logFirebaseAuthStartupDiagnostics warns on env mismatch', () => {
    const provisionedFile = {
      projectId: 'gen-lang-client-0822907731',
      apiKey: 'AIzaProvisionedTestKey',
    };
    const staleEnv = {
      FIREBASE_PROJECT_ID: 'stale-server-proj',
      VITE_FIREBASE_PROJECT_ID: 'stale-client-proj',
    };

    const clientCfg = resolveFirebaseClientConfig(provisionedFile, staleEnv);
    const serverProjectId = resolveFirebaseProjectId(provisionedFile, staleEnv);
    assert.equal(clientCfg.projectId, 'gen-lang-client-0822907731');
    assert.equal(serverProjectId, clientCfg.projectId);

    // Fallback when not provisioned
    assert.equal(
      resolveFirebaseProjectId({}, { FIREBASE_PROJECT_ID: 'srv-only', VITE_FIREBASE_PROJECT_ID: 'cli-only' }),
      'srv-only'
    );
    assert.equal(
      resolveFirebaseProjectId({}, { VITE_FIREBASE_PROJECT_ID: 'cli-only' }),
      'cli-only'
    );

    const warns: string[] = [];
    const infos: string[] = [];
    const origWarn = console.warn;
    const origInfo = console.info;
    console.warn = (...args: unknown[]) => warns.push(args.map(String).join(' '));
    console.info = (...args: unknown[]) => infos.push(args.map(String).join(' '));
    try {
      const result = logFirebaseAuthStartupDiagnostics(provisionedFile, staleEnv);
      assert.equal(result.resolvedProjectId, 'gen-lang-client-0822907731');
      assert.equal(
        warns.some((w) => w.includes('VITE_FIREBASE_PROJECT_ID') && w.includes('FIREBASE_PROJECT_ID')),
        true
      );
      assert.equal(
        infos.some((i) => i.includes('gen-lang-client-0822907731')),
        true
      );
    } finally {
      console.warn = origWarn;
      console.info = origInfo;
    }
  });

  await runTest('requireFirebaseAuth returns 401 JSON when Authorization header is missing', async () => {
    const mock = makeMockResponse();
    let calledNext = false;
    await requireFirebaseAuth(
      { headers: {} } as unknown as Request,
      mock.res,
      () => {
        calledNext = true;
      }
    );
    assert.equal(calledNext, false);
    assert.equal(mock.getStatus(), 401);
    assert.equal((mock.getBody() as { code: string }).code, 'AUTH_REQUIRED');
  });

  await runTest('requireFirebaseAuth rejects unverified email token with 403 EMAIL_NOT_VERIFIED', async () => {
    const prevProjectId = process.env.FIREBASE_PROJECT_ID;
    const activeProjectId = resolveFirebaseProjectId() || projectId;
    process.env.FIREBASE_PROJECT_ID = activeProjectId;
    try {
      setJwksFetcherForTests(async () => ({
        keys: [{ kid: testKid, kty: publicJwk.kty, alg: 'RS256', use: 'sig', n: publicJwk.n, e: publicJwk.e }],
        maxAgeSec: 3600,
      }));

      const now = Math.floor(Date.now() / 1000);
      const unverifiedToken = signTestJwt(privateKey, testKid, {
        iss: `https://securetoken.google.com/${activeProjectId}`,
        aud: activeProjectId,
        sub: 'user_tech_002',
        email: 'spoof@autoelectric.test',
        email_verified: false,
        iat: now - 5,
        exp: now + 3600,
      });

      const mock = makeMockResponse();
      let calledNext = false;
      await requireFirebaseAuth(
        { headers: { authorization: `Bearer ${unverifiedToken}` } } as unknown as Request,
        mock.res,
        () => {
          calledNext = true;
        }
      );
      assert.equal(calledNext, false);
      assert.equal(mock.getStatus(), 403);
      assert.equal((mock.getBody() as { code: string }).code, 'EMAIL_NOT_VERIFIED');
    } finally {
      if (prevProjectId === undefined) delete process.env.FIREBASE_PROJECT_ID;
      else process.env.FIREBASE_PROJECT_ID = prevProjectId;
      resetFirebaseAuthCacheForTests();
    }
  });

  // -------------------------------------------------------------------------
  // 2. Gemini Error Classifier
  // -------------------------------------------------------------------------
  await runTest('classifyGeminiError distinguishes 400, 401, 403, 404, 429, 504, and 502', () => {
    const c400 = classifyGeminiError(Object.assign(new Error('INVALID_ARGUMENT: bad part'), { status: 400 }));
    assert.equal(c400.statusCode, 400);
    assert.equal(c400.retryNextModel, false);

    const c401 = classifyGeminiError(new Error('401 UNAUTHENTICATED: API key not valid'));
    assert.equal(c401.statusCode, 401);
    assert.equal(c401.retryNextModel, false);

    const c403 = classifyGeminiError(new Error('403 PERMISSION_DENIED: API has not been used'));
    assert.equal(c403.statusCode, 403);
    assert.equal(c403.retryNextModel, false);

    const c404 = classifyGeminiError(new Error('404 NOT_FOUND: model not found'));
    assert.equal(c404.statusCode, 404);
    assert.equal(c404.retryNextModel, true);

    const c429 = classifyGeminiError(new Error('429 RESOURCE_EXHAUSTED: Quota exceeded. Please retry in 27s.'));
    assert.equal(c429.statusCode, 429);
    assert.equal(c429.retryNextModel, true);
    assert.equal(c429.retryAfterSec, 27);

    const c504 = classifyGeminiError(new Error('Request aborted'), true);
    assert.equal(c504.statusCode, 504);
    assert.equal(c504.retryNextModel, true);

    const c502 = classifyGeminiError(new Error('ECONNRESET socket hang up'));
    assert.equal(c502.statusCode, 502);
    assert.equal(c502.retryNextModel, true);
  });

  await runTest('geminiFreeTierRouter proactively switches BEFORE exceeding RPM soft limit, steps down ThinkingLevel, and short-circuits on full cooldown', () => {
    resetFreeTierRouterForTests();
    const baseNow = 1_760_000_000_000;

    // 1. Fresh pool starts with gemini-4-hydrogen at HIGH thinking
    const initial = selectFreeTierCandidates(
      'gemini-4-hydrogen',
      ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
      baseNow
    );
    assert.equal(initial.allInCooldown, false);
    assert.equal(initial.preQuotaReroutedFrom, null);
    assert.equal(initial.candidates[0], 'gemini-4-hydrogen');
    assert.equal(resolveAdjustedThinkingLevel('gemini-4-hydrogen', ThinkingLevel.HIGH, baseNow), ThinkingLevel.HIGH);

    // 2. At 50% (4/8) and 75% (6/8) soft cap, ThinkingLevel steps down HIGH -> MEDIUM -> LOW to conserve TPM
    for (let i = 0; i < 4; i++) {
      recordModelAttemptStart('gemini-4-hydrogen', baseNow + i * 100);
    }
    assert.equal(
      resolveAdjustedThinkingLevel('gemini-4-hydrogen', ThinkingLevel.HIGH, baseNow + 500),
      ThinkingLevel.MEDIUM
    );
    for (let i = 4; i < 6; i++) {
      recordModelAttemptStart('gemini-4-hydrogen', baseNow + i * 100);
    }
    assert.equal(
      resolveAdjustedThinkingLevel('gemini-4-hydrogen', ThinkingLevel.HIGH, baseNow + 700),
      ThinkingLevel.LOW
    );

    // 3. At 8/8 soft limit on gemini-4-hydrogen, router MUST proactively reroute BEFORE quota to gemini-3.1-flash-lite
    recordModelAttemptStart('gemini-4-hydrogen', baseNow + 800);
    recordModelAttemptStart('gemini-4-hydrogen', baseNow + 900);
    const rerouted = selectFreeTierCandidates(
      'gemini-4-hydrogen',
      ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
      baseNow + 1000
    );
    assert.equal(rerouted.allInCooldown, false);
    assert.equal(rerouted.preQuotaReroutedFrom, 'gemini-4-hydrogen');
    assert.equal(rerouted.candidates[0], 'gemini-3.1-flash-lite');

    // 4. Simulated 429 with retryAfter=20s on flash-lite -> both models cooling down triggers allInCooldown fast-fail
    recordModelFailure(
      'gemini-4-hydrogen',
      classifyGeminiError(new Error('429 RESOURCE_EXHAUSTED retry in 30s')),
      baseNow + 1000
    );
    recordModelFailure(
      'gemini-3.1-flash-lite',
      classifyGeminiError(new Error('429 RESOURCE_EXHAUSTED retry in 20s')),
      baseNow + 1000
    );
    const allCooldown = selectFreeTierCandidates(
      'gemini-4-hydrogen',
      ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
      baseNow + 2000
    );
    assert.equal(allCooldown.allInCooldown, true);
    assert.equal(allCooldown.candidates.length, 0);
    assert.equal(allCooldown.earliestRetryAfterSec, 19);

    // 5. After 20s flash-lite recovers while hydrogen still has 10s left -> direct route to flash-lite
    const partialRecovery = selectFreeTierCandidates(
      'gemini-4-hydrogen',
      ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
      baseNow + 22_000
    );
    assert.equal(partialRecovery.allInCooldown, false);
    assert.deepEqual(partialRecovery.candidates, ['gemini-3.1-flash-lite']);
    recordModelSuccess('gemini-3.1-flash-lite');
    const snap = getFreeTierPoolSnapshot(['gemini-4-hydrogen', 'gemini-3.1-flash-lite'], baseNow + 22_000);
    assert.equal(snap.find((s) => s.model === 'gemini-4-hydrogen')?.inCooldown, true);
    assert.equal(snap.find((s) => s.model === 'gemini-3.1-flash-lite')?.inCooldown, false);

    resetFreeTierRouterForTests();
  });

  await runTest('QuotaManager rotates keys on same tier, downgrades tiers after key saturation, switches on TPM threshold, isolates 401 keys, and never leaks secrets', () => {
    assert.equal(computeSoftLimit(5, 0.8), 4);
    assert.equal(computeSoftLimit(10, 0.8), 8);

    const secretA = 'AIza-secret-alpha-001';
    const secretB = 'AIza-secret-bravo-002';
    const baseNow = 1_760_100_000_000;

    const loaded = loadConfiguredGeminiKeysFromEnv({
      GEMINI_API_KEY: secretA,
      GEMINI_API_KEY_1: secretA, // duplicate should be deduplicated
      GEMINI_API_KEY_2: secretB,
      GEMINI_API_KEYS: `${secretB}, AIza-secret-charlie-003`,
    } as NodeJS.ProcessEnv);
    assert.equal(loaded.length, 3);
    assert.deepEqual(
      loaded.map((k) => k.id),
      ['gemini-key-1', 'gemini-key-2', 'gemini-key-3']
    );

    const manager = new QuotaManager({
      keys: [
        { id: 'gemini-key-1', apiKey: secretA, label: 'Primary Key', rpmLimit: 5, tpmLimit: 1000, priority: 1 },
        { id: 'gemini-key-2', apiKey: secretB, label: 'Backup Key', rpmLimit: 5, tpmLimit: 1000, priority: 2 },
      ],
      endpoints: [
        { id: 'tier-primary', model: 'gemini-4-hydrogen', rpmLimit: 5, priority: 1 },
        { id: 'tier-fallback', model: 'gemini-3.1-flash-lite', rpmLimit: 10, priority: 2 },
      ],
      switchThresholdRatio: 0.8,
      windowMs: 60_000,
    });

    // 1. Fresh state starts on primary key + primary tier
    const plan1 = manager.acquirePlan('tier-primary', ['tier-fallback'], baseNow);
    assert.equal(plan1.selected?.keyId, 'gemini-key-1');
    assert.equal(plan1.selected?.endpointId, 'tier-primary');
    assert.equal(plan1.selected?.switchKind, 'PRIMARY');
    assert.equal(plan1.preQuotaSwitched, false);

    // 2. Hit 4/5 soft limit (80%) on gemini-key-1 -> automatically switch to gemini-key-2 while staying on tier-primary
    for (let i = 0; i < 4; i++) {
      manager.recordAttemptStart({ keyId: 'gemini-key-1', endpointId: 'tier-primary', nowMs: baseNow + i * 50 });
    }
    const planKeySwitch = manager.acquirePlan('tier-primary', ['tier-fallback'], baseNow + 300);
    assert.equal(planKeySwitch.preQuotaSwitched, true);
    assert.equal(planKeySwitch.switchedFromKeyId, 'gemini-key-1');
    assert.equal(planKeySwitch.switchedFromEndpointId, null);
    assert.equal(planKeySwitch.selected?.keyId, 'gemini-key-2');
    assert.equal(planKeySwitch.selected?.endpointId, 'tier-primary');
    assert.equal(planKeySwitch.selected?.switchKind, 'KEY_SWITCH');

    // 3. Saturate gemini-key-2 on tier-primary via TPM (>= 800 tokens of 1000 limit) -> triggers tier downgrade
    manager.recordAttemptStart({ keyId: 'gemini-key-2', endpointId: 'tier-primary', nowMs: baseNow + 400 });
    manager.recordSuccess({
      keyId: 'gemini-key-2',
      endpointId: 'tier-primary',
      tokensUsed: 850,
      nowMs: baseNow + 450,
    });
    const planTierSwitch = manager.acquirePlan('tier-primary', ['tier-fallback'], baseNow + 500);
    assert.equal(planTierSwitch.preQuotaSwitched, true);
    assert.equal(planTierSwitch.switchedFromEndpointId, 'tier-primary');
    // gemini-key-1 only has 4/5 RPM (0 TPM) on key-1 & 0/10 on tier-fallback, whereas gemini-key-2 has 850/1000 TPM approaching limit
    assert.equal(planTierSwitch.selected?.keyId, 'gemini-key-1');
    assert.equal(planTierSwitch.selected?.endpointId, 'tier-fallback');

    // 4. Snapshot NEVER leaks raw API keys
    const snapJson = JSON.stringify(manager.getSnapshot(['tier-primary', 'tier-fallback'], baseNow + 500));
    assert.equal(snapJson.includes(secretA), false);
    assert.equal(snapJson.includes(secretB), false);

    // 5. Window expiry resets approaching state, and 401 UNAUTHENTICATED isolates bad key cleanly
    const afterWindowMs = baseNow + 65_000;
    const recoveredPlan = manager.acquirePlan('tier-primary', ['tier-fallback'], afterWindowMs);
    assert.equal(recoveredPlan.selected?.keyId, 'gemini-key-1');
    assert.equal(recoveredPlan.selected?.endpointId, 'tier-primary');

    manager.recordFailure(
      { keyId: 'gemini-key-1', endpointId: 'tier-primary' },
      { category: 'UNAUTHENTICATED', statusCode: 401 },
      afterWindowMs + 100
    );
    const failoverPlan = manager.acquirePlan('tier-primary', ['tier-fallback'], afterWindowMs + 200);
    assert.equal(failoverPlan.allInCooldown, false);
    assert.equal(failoverPlan.selected?.keyId, 'gemini-key-2');
    assert.equal(failoverPlan.selected?.endpointId, 'tier-primary');
    assert.equal(failoverPlan.switchedFromKeyId, 'gemini-key-1');
  });

  // -------------------------------------------------------------------------
  // 3. Image Payload Validator
  // -------------------------------------------------------------------------
  await runTest('validateImagePayload accepts real PNG and rejects spoofed/oversized/huge images', () => {
    const valid = validateImagePayload(VALID_1X1_PNG_BASE64, 'image/png');
    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.equal(valid.normalizedMimeType, 'image/png');
      assert.equal(valid.width, 1);
      assert.equal(valid.height, 1);
    }

    // Spoofed plain text claiming to be JPEG
    const spoofed = validateImagePayload(
      Buffer.from('not really a jpeg binary stream!!').toString('base64'),
      'image/jpeg'
    );
    assert.equal(spoofed.ok, false);
    if (!spoofed.ok) {
      assert.equal(spoofed.statusCode, 400);
    }

    // Disallowed MIME
    const badMime = validateImagePayload(VALID_1X1_PNG_BASE64, 'image/svg+xml');
    assert.equal(badMime.ok, false);
    if (!badMime.ok) {
      assert.equal(badMime.statusCode, 400);
    }

    // >8MB payload
    const oversizedBase64 = 'A'.repeat(11_500_000);
    const oversized = validateImagePayload(oversizedBase64, 'image/jpeg');
    assert.equal(oversized.ok, false);
    if (!oversized.ok) {
      assert.equal(oversized.statusCode, 413);
    }

    // PNG IHDR header declaring 20000x20000 dimensions
    const hugePng = Buffer.from(VALID_1X1_PNG_BASE64, 'base64');
    hugePng.writeUInt32BE(20000, 16);
    hugePng.writeUInt32BE(20000, 20);
    const hugeRes = validateImagePayload(hugePng.toString('base64'), 'image/png');
    assert.equal(hugeRes.ok, false);
    if (!hugeRes.ok) {
      assert.equal(hugeRes.statusCode, 400);
    }
  });

  // -------------------------------------------------------------------------
  // 4. Durable Offline Sync Queue (Queue, Idempotency, Retry, Replay)
  // -------------------------------------------------------------------------
  await runTest('offlineSyncQueue queues idempotently, preserves failed offline items, and flushes on reconnect', async () => {
    await resetOfflineQueueForTests();

    await enqueueOfflineMutation({
      uid: 'uid_1',
      collection: 'benchSessions',
      docId: 'sess_abc',
      payload: { id: 'sess_abc', ownerId: 'uid_1', title: 'Draft V1' },
    });
    // Idempotent overwrite for same uid + collection + docId
    await enqueueOfflineMutation({
      uid: 'uid_1',
      collection: 'benchSessions',
      docId: 'sess_abc',
      payload: { id: 'sess_abc', ownerId: 'uid_1', title: 'Draft V2' },
    });

    const pendingAfterEnqueue = await getPendingMutations('uid_1');
    assert.equal(pendingAfterEnqueue.length, 1);
    assert.equal((pendingAfterEnqueue[0].payload as { title: string }).title, 'Draft V2');
    assert.equal(getSyncStatusSnapshot().state, 'OFFLINE_QUEUED');

    const cached = await getLocalCachedDocuments<{ title: string }>('uid_1', 'benchSessions');
    assert.equal(cached.length, 1);
    assert.equal(cached[0].syncState, 'QUEUED_OFFLINE');

    // Simulate transient offline failure -> item remains queued and increments attempts
    const failedFlush = await flushOfflineMutations('uid_1', async () => {
      throw new Error('Failed to get document because the client is offline.');
    });
    assert.equal(failedFlush.synced, 0);
    assert.equal(failedFlush.failed, 1);
    assert.equal(failedFlush.remaining, 1);
    const pendingAfterFail = await getPendingMutations('uid_1');
    assert.equal(pendingAfterFail[0].attempts, 1);

    // Simulate online replay with forceRetry=true
    const replayedTitles: string[] = [];
    const okFlush = await flushOfflineMutations(
      'uid_1',
      async (rec) => {
        replayedTitles.push((rec.payload as { title: string }).title);
      },
      { forceRetry: true }
    );
    assert.equal(okFlush.synced, 1);
    assert.equal(okFlush.remaining, 0);
    assert.deepEqual(replayedTitles, ['Draft V2']);
    assert.equal(getSyncStatusSnapshot().state, 'IDLE');
    assert.equal(getSyncStatusSnapshot().pendingCount, 0);

    // Simulate non-transient permission/schema failure -> transitions status state to ERROR while preserving queue item
    await enqueueOfflineMutation({
      uid: 'uid_1',
      collection: 'benchSessions',
      docId: 'sess_perm_fail',
      payload: { id: 'sess_perm_fail', ownerId: 'uid_1', title: 'Perm Fail Draft' },
    });
    const permFailFlush = await flushOfflineMutations('uid_1', async () => {
      throw new Error('PERMISSION_DENIED: Missing or insufficient permissions.');
    });
    assert.equal(permFailFlush.failed, 1);
    assert.equal(permFailFlush.remaining, 1);
    assert.equal(getSyncStatusSnapshot().state, 'ERROR');
    assert.ok(getSyncStatusSnapshot().lastError?.includes('PERMISSION_DENIED'));

    const recoveredPermFlush = await flushOfflineMutations(
      'uid_1',
      async () => {},
      { forceRetry: true }
    );
    assert.equal(recoveredPermFlush.synced, 1);
    assert.equal(recoveredPermFlush.remaining, 0);
    assert.equal(getSyncStatusSnapshot().state, 'IDLE');

    await resetOfflineQueueForTests();
  });

  await runTest('offlineSyncQueue version & timestamp comparison prevents slower V1 sync or retry from overwriting newer V2 bench session mutations', async () => {
    await resetOfflineQueueForTests();

    // 1. Enqueue Bench Session V1
    const v1Rec = await enqueueOfflineMutation({
      uid: 'uid_tech_1',
      collection: 'benchSessions',
      docId: 'sess_race_1',
      payload: { id: 'sess_race_1', ownerId: 'uid_tech_1', title: 'Bench Session V1' },
    });
    assert.equal(v1Rec.version, 1);

    // 2. Start flushing V1; while V1 is in-flight, technician edits session -> V2 is enqueued
    const uploadedVersions: string[] = [];
    const firstFlush = await flushOfflineMutations('uid_tech_1', async (record) => {
      uploadedVersions.push((record.payload as { title: string }).title);
      // Concurrent technician edit creating V2 before V1 sync completes
      const v2Rec = await enqueueOfflineMutation({
        uid: 'uid_tech_1',
        collection: 'benchSessions',
        docId: 'sess_race_1',
        payload: { id: 'sess_race_1', ownerId: 'uid_tech_1', title: 'Bench Session V2 (Newer)' },
      });
      assert.equal(v2Rec.version > record.version, true);
      assert.equal(v2Rec.updatedAtMs > record.updatedAtMs, true);
    });

    // V1 completed upload, but V2 MUST remain in the queue and local cache MUST stay V2 (QUEUED_OFFLINE)
    assert.deepEqual(uploadedVersions, ['Bench Session V1']);
    assert.equal(firstFlush.remaining, 1, 'Newer V2 mutation must not be removed when V1 completes');
    assert.equal(getSyncStatusSnapshot().state, 'OFFLINE_QUEUED');

    const pendingAfterV1Sync = await getPendingMutations('uid_tech_1');
    assert.equal(pendingAfterV1Sync.length, 1);
    assert.equal(
      (pendingAfterV1Sync[0].payload as { title: string }).title,
      'Bench Session V2 (Newer)'
    );

    const cachedAfterV1Sync = await getLocalCachedDocuments<{ title: string }>(
      'uid_tech_1',
      'benchSessions'
    );
    assert.equal(cachedAfterV1Sync.length, 1);
    assert.equal(cachedAfterV1Sync[0].data.title, 'Bench Session V2 (Newer)');
    assert.equal(cachedAfterV1Sync[0].syncState, 'QUEUED_OFFLINE');

    // 3. Also test in-flight failure race: V2 starts syncing, V3 is enqueued mid-flight, V2 fails -> V3 payload preserved
    const failRaceFlush = await flushOfflineMutations(
      'uid_tech_1',
      async () => {
        await enqueueOfflineMutation({
          uid: 'uid_tech_1',
          collection: 'benchSessions',
          docId: 'sess_race_1',
          payload: { id: 'sess_race_1', ownerId: 'uid_tech_1', title: 'Bench Session V3 (Latest)' },
        });
        throw new Error('Failed to get document because the client is offline.');
      },
      { forceRetry: true }
    );
    assert.equal(failRaceFlush.failed, 1);
    assert.equal(failRaceFlush.remaining, 1);

    const pendingAfterV2Fail = await getPendingMutations('uid_tech_1');
    assert.equal(
      (pendingAfterV2Fail[0].payload as { title: string }).title,
      'Bench Session V3 (Latest)',
      'Failed older sync must not overwrite newer V3 payload in queue'
    );

    // 4. Subsequent flush uploads V3 and clears queue cleanly
    const finalFlush = await flushOfflineMutations(
      'uid_tech_1',
      async (record) => {
        uploadedVersions.push((record.payload as { title: string }).title);
      },
      { forceRetry: true }
    );
    assert.equal(finalFlush.synced, 1);
    assert.equal(finalFlush.remaining, 0);
    assert.deepEqual(uploadedVersions, ['Bench Session V1', 'Bench Session V3 (Latest)']);

    const cachedFinal = await getLocalCachedDocuments<{ title: string }>(
      'uid_tech_1',
      'benchSessions'
    );
    assert.equal(cachedFinal[0].data.title, 'Bench Session V3 (Latest)');
    assert.equal(cachedFinal[0].syncState, 'SYNCED_CLOUD');

    // 5. Out-of-order slow stamp protection: older reserved stamp cannot overwrite synced V3 in cache or queue
    const staleStamp = { version: 1, updatedAtMs: v1Rec.updatedAtMs };
    await enqueueOfflineMutation({
      uid: 'uid_tech_1',
      collection: 'benchSessions',
      docId: 'sess_race_1',
      payload: { id: 'sess_race_1', ownerId: 'uid_tech_1', title: 'Stale Delayed V1' },
      version: staleStamp.version,
      updatedAtMs: staleStamp.updatedAtMs,
    });
    await cacheLocalDocument({
      uid: 'uid_tech_1',
      collection: 'benchSessions',
      docId: 'sess_race_1',
      data: { id: 'sess_race_1', ownerId: 'uid_tech_1', title: 'Stale Delayed V1' },
      syncState: 'SYNCED_CLOUD',
      version: staleStamp.version,
      updatedAtMs: staleStamp.updatedAtMs,
    });
    const syncedStaleResult = await markMutationSynced(
      'uid_tech_1',
      'benchSessions',
      'sess_race_1',
      { id: 'sess_race_1', ownerId: 'uid_tech_1', title: 'Stale Delayed V1' },
      { expectedVersion: staleStamp.version, expectedUpdatedAtMs: staleStamp.updatedAtMs }
    );
    assert.equal(syncedStaleResult, true);

    const cachedAfterStale = await getLocalCachedDocuments<{ title: string }>(
      'uid_tech_1',
      'benchSessions'
    );
    assert.equal(
      cachedAfterStale[0].data.title,
      'Bench Session V3 (Latest)',
      'Slower older stamp must never overwrite newer cached document'
    );

    const s1 = reserveMutationStamp('uid_tech_1', 'benchSessions', 'sess_stamp_check');
    const s2 = reserveMutationStamp('uid_tech_1', 'benchSessions', 'sess_stamp_check');
    assert.equal(s2.version > s1.version, true);
    assert.equal(s2.updatedAtMs > s1.updatedAtMs, true);

    await resetOfflineQueueForTests();
  });

  await runTest('cross-device OCC preserves baseUpdatedAtMs across offline edits and formats non-destructive [Conflict Copy] sessions', async () => {
    await resetOfflineQueueForTests();

    const cloudRevT1 = 1_700_000_000_000;
    const cloudRevT2 = 1_700_000_060_000; // Device B saved 60s later while Device A was offline

    // Device A queues offline edit V1 branched from cloudRevT1, then edits V2 offline without passing baseUpdatedAtMs
    const offlineV1 = await enqueueOfflineMutation({
      uid: 'uid_tech_1',
      collection: 'benchSessions',
      docId: 'sess_cross_device',
      payload: { id: 'sess_cross_device', ownerId: 'uid_tech_1', title: 'Field Edit V1' },
      baseUpdatedAtMs: cloudRevT1,
    });
    assert.equal(offlineV1.baseUpdatedAtMs, cloudRevT1);

    const offlineV2 = await enqueueOfflineMutation({
      uid: 'uid_tech_1',
      collection: 'benchSessions',
      docId: 'sess_cross_device',
      payload: { id: 'sess_cross_device', ownerId: 'uid_tech_1', title: 'Field Edit V2' },
    });
    assert.equal(
      offlineV2.baseUpdatedAtMs,
      cloudRevT1,
      'Consecutive offline edits must preserve the original cloud baseUpdatedAtMs'
    );

    // Verify extractRemoteUpdatedAtMs across Firestore Timestamp shapes
    assert.equal(
      extractRemoteUpdatedAtMs({ updatedAt: { toMillis: () => cloudRevT2 } }),
      cloudRevT2
    );
    assert.equal(
      extractRemoteUpdatedAtMs({ updatedAt: { seconds: 1_700_000_060, nanoseconds: 0 } }),
      cloudRevT2
    );
    assert.equal(extractRemoteUpdatedAtMs({ updatedAtMs: cloudRevT2 }), cloudRevT2);
    assert.equal(extractRemoteUpdatedAtMs({}), null);

    // Verify conflict detection logic
    assert.equal(hasRemoteSessionConflict(cloudRevT1, cloudRevT1), false, 'Same revision -> no conflict');
    assert.equal(hasRemoteSessionConflict(cloudRevT2, cloudRevT1), false, 'Remote older -> no conflict');
    assert.equal(
      hasRemoteSessionConflict(offlineV2.baseUpdatedAtMs, cloudRevT2),
      true,
      'Remote newer than baseUpdatedAtMs -> conflict detected'
    );

    // Verify [Conflict Copy] title & payload formatting complies with 120-char firestore.rules limit
    const shortConflictTitle = formatConflictCopyTitle('Hilux 1GD Bench Setup');
    assert.equal(shortConflictTitle, 'Hilux 1GD Bench Setup [Conflict Copy]');
    assert.equal(
      formatConflictCopyTitle(shortConflictTitle),
      shortConflictTitle,
      'Must not duplicate [Conflict Copy] suffix'
    );

    const overlongTitle = `Toyota Hilux 1GD-FTV Common Rail Bench Diagnostic Session ${'X'.repeat(90)}`;
    const clampedConflictTitle = formatConflictCopyTitle(overlongTitle);
    assert.equal(clampedConflictTitle.length <= 120, true);
    assert.equal(clampedConflictTitle.endsWith(' [Conflict Copy]'), true);

    const forkedPayload = buildConflictCopySessionPayload('uid_tech_1', 'bench_conflict_999', {
      id: 'sess_cross_device',
      ownerId: 'uid_tech_1',
      title: overlongTitle,
    });
    assert.equal(forkedPayload.id, 'bench_conflict_999');
    assert.equal(forkedPayload.ownerId, 'uid_tech_1');
    assert.equal(forkedPayload.title, clampedConflictTitle);

    await resetOfflineQueueForTests();
  });

  // -------------------------------------------------------------------------
  // 5. ECU Trainer Profile vs SAE J1962 OBD-II DLC & Security Guards
  // -------------------------------------------------------------------------
  await runTest('UNIVERSAL_SIMULATION_PROFILE separates 16-pin bench trainer from OBD-II DLC', () => {
    assert.equal(UNIVERSAL_SIMULATION_PROFILE.isOemPinout, false);
    assert.equal(DEFAULT_ECU_PINS.length, 16);
    // In OBD-II SAE J1962, Pin 16 is +12V battery and Pin 6 is CAN-H; in our 16-pin bench trainer Pin 3 is KL30 and Pin 13 is CAN_H
    const obdPin16 = UNIVERSAL_SIMULATION_PROFILE.obd2DlcPinMapping.find((m) => m.dlcPin === 16);
    assert.ok(obdPin16);
    assert.equal(obdPin16.benchPinNumber, 3);
    assert.notEqual(obdPin16.dlcPin, obdPin16.benchPinNumber);
  });

  await runTest('firebase.ts enables Google Sign-In via Firebase Auth while excluding broad Google Workspace scopes', () => {
    const firebaseSrc = fs.readFileSync(path.resolve('src/lib/firebase.ts'), 'utf8');
    assert.equal(firebaseSrc.includes('getAuth'), true, 'Expected Firebase Auth getAuth in firebase.ts');
    assert.equal(firebaseSrc.includes('GoogleAuthProvider'), true, 'Expected GoogleAuthProvider in firebase.ts');
    const forbiddenWorkspaceScopes = [
      'WORKSPACE_SCOPES',
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/documents',
      'gmail.',
      'drive.scripts',
    ];
    for (const token of forbiddenWorkspaceScopes) {
      assert.equal(
        firebaseSrc.includes(token),
        false,
        `Forbidden Google Workspace scope token found in firebase.ts: ${token}`
      );
    }

    const liveServerSrc = fs.readFileSync(
      path.resolve('src/server/services/geminiLiveVoiceServer.ts'),
      'utf8'
    );
    assert.equal(liveServerSrc.includes("gemini-3.8-live"), true);
    assert.equal(liveServerSrc.includes('verifyAnyAccessBearerToken'), true);
    assert.equal(liveServerSrc.includes("mimeType: 'audio/pcm;rate=16000'"), true);
  });

  await runTest('Firestore rules match blueprint subcollections, lock reads/lists to verified owners, and validate individual sub-documents', () => {
    const rulesSrc = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
    const blueprint = JSON.parse(fs.readFileSync(path.resolve('firebase-blueprint.json'), 'utf8')) as {
      firestore: Record<string, unknown>;
    };
    const expectedPaths = [
      '/users/{userId}',
      '/users/{userId}/benchSessions/{sessionId}',
      '/users/{userId}/benchSessions/{sessionId}/wires/{wireId}',
      '/users/{userId}/benchSessions/{sessionId}/faults/{faultId}',
      '/users/{userId}/benchSessions/{sessionId}/componentStates/{componentId}',
      '/users/{userId}/diagnosticLogs/{logId}',
      '/users/{userId}/diagnosticLogs/{logId}/sources/{sourceId}',
      '/users/{userId}/pcbScans/{scanId}',
      '/users/{userId}/pcbScans/{scanId}/components/{componentId}',
      '/users/{userId}/pcbScans/{scanId}/nets/{netId}',
      '/users/{userId}/pcbScans/{scanId}/hotspots/{hotspotId}',
      '/users/{userId}/benchPreferences/{prefId}',
      '/users/{userId}/benchPreferences/{prefId}/voiceMacros/{macroId}',
      '/users/{userId}/faultSequences/{sequenceId}',
      '/users/{userId}/faultSequences/{sequenceId}/stages/{stageId}',
      '/users/{userId}/faultSequences/{sequenceId}/items/{itemId}',
    ];
    for (const expectedPath of expectedPaths) {
      assert.equal(expectedPath in blueprint.firestore, true, `Missing blueprint path: ${expectedPath}`);
    }

    assert.equal(rulesSrc.includes('allow read, write: if false;'), true);
    assert.equal(rulesSrc.includes('allow get: if isValidId(userId) && isVerified() && isOwner(userId);'), true);
    assert.equal(rulesSrc.includes('allow list: if isVerified() && isOwner(userId) && resource.data.ownerId == request.auth.uid;'), true);

    // Individual subcollection validators + parent Master Gates
    assert.equal(rulesSrc.includes('function isValidBenchWireDoc(data, userId, sessionId, wireId)'), true);
    assert.equal(rulesSrc.includes('function isValidBenchFaultDoc(data, userId, sessionId, faultId)'), true);
    assert.equal(rulesSrc.includes('function isValidBenchComponentStateDoc(data, userId, sessionId, componentId)'), true);
    assert.equal(rulesSrc.includes('function isValidDiagnosticLogSourceDoc(data, userId, logId, sourceId)'), true);
    assert.equal(rulesSrc.includes('function isValidPcbComponentDoc(data, userId, scanId, componentId)'), true);
    assert.equal(rulesSrc.includes('function isValidPcbNetDoc(data, userId, scanId, netId)'), true);
    assert.equal(rulesSrc.includes('function isValidPcbHotspotDoc(data, userId, scanId, docId)'), true);
    assert.equal(rulesSrc.includes('function isValidVoiceMacroDoc(data, userId, prefId, macroId)'), true);
    assert.equal(rulesSrc.includes('function isValidFaultSequence(data, userId, sequenceId)'), true);
    assert.equal(rulesSrc.includes('function isValidFaultSequenceStageDoc(data, userId, sequenceId, stageId)'), true);
    assert.equal(rulesSrc.includes('function isValidFaultSequenceItemDoc(data, userId, sequenceId, itemId)'), true);
    assert.equal(rulesSrc.includes('ownsSessionAfter(userId, sessionId)'), true);
    assert.equal(rulesSrc.includes('ownsPcbScanAfter(userId, scanId)'), true);
    assert.equal(rulesSrc.includes('ownsLogAfter(userId, logId)'), true);
    assert.equal(rulesSrc.includes('ownsPrefsAfter(userId, prefId)'), true);
    assert.equal(rulesSrc.includes('ownsFaultSequenceAfter(userId, sequenceId)'), true);
    assert.equal(rulesSrc.includes('data.schemaVersion == 2'), true);

    // Ensure old array-index[0] parent validators are replaced by subcollections
    assert.equal(rulesSrc.includes('isValidWireEntry(data.wires[0])'), false);
    assert.equal(rulesSrc.includes('isValidFaultEntry(data.faults[0])'), false);
    assert.equal(rulesSrc.includes('isValidGroundedSource(data.sources[0])'), false);
    assert.equal(rulesSrc.includes('isValidVoiceMacro(data.voiceMacros[0])'), false);
    assert.equal(rulesSrc.includes('isValidPcbComponentEntry(data.components[0])'), false);
  });

  // -------------------------------------------------------------------------
  // 6. Official NHTSA VIN Normalization & Payload Parsers
  // -------------------------------------------------------------------------
  await runTest('normalizeVin enforces 17-char ISO 3779 rules and strips dashes/spaces', () => {
    const valid = normalizeVin(' 1ftew1ef3-gke12345 ');
    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.equal(valid.vin, '1FTEW1EF3GKE12345');
    }

    const tooShort = normalizeVin('1FTEW1EF3GKE');
    assert.equal(tooShort.ok, false);

    const forbiddenCharI = normalizeVin('1FTEW1EF3GKE1234I');
    assert.equal(forbiddenCharI.ok, false);

    const forbiddenCharO = normalizeVin('1FTEW1EF3GKE1234O');
    assert.equal(forbiddenCharO.ok, false);

    const forbiddenCharQ = normalizeVin('1FTEW1EF3GKE1234Q');
    assert.equal(forbiddenCharQ.ok, false);
  });

  await runTest('parseNhtsaVinResult cleans "Not Applicable" placeholders and flags check-digit warnings', () => {
    const cleanRow = parseNhtsaVinResult('1FTEW1EF3GKE12345', {
      Make: 'FORD',
      Model: 'F-150',
      ModelYear: '2016',
      Series: 'Not Applicable',
      Trim: 'XLT',
      DisplacementL: '5.0',
      EngineCylinders: '8',
      ErrorCode: '0',
      ErrorText: '0 - VIN decoded clean. Check Digit (9th position) is correct',
    });
    assert.equal(cleanRow.make, 'FORD');
    assert.equal(cleanRow.model, 'F-150');
    assert.equal(cleanRow.series, '');
    assert.equal(cleanRow.hasCheckDigitWarning, false);

    const badCheckDigit = parseNhtsaVinResult('1FTEW1EF0GKE12345', {
      Make: 'FORD',
      Model: 'F-150',
      ModelYear: '2016',
      ErrorCode: '1',
      ErrorText: '1 - Check Digit (9th position) does not calculate properly',
    });
    assert.equal(badCheckDigit.hasCheckDigitWarning, true);
  });

  await runTest('parseNhtsaRecallsPayload and parseNhtsaComplaintsPayload bound output sizes and preserve safety flags', () => {
    const manyRecalls = Array.from({ length: 30 }, (_, i) => ({
      NHTSACampaignNumber: `24V${String(i).padStart(3, '0')}`,
      Component: 'FUEL SYSTEM',
      Summary: `Recall #${i}`,
      Consequence: 'Engine stall',
      Remedy: 'Replace module',
      ReportReceivedDate: '01/15/2024',
      parkIt: i === 0,
    }));
    const parsedRecalls = parseNhtsaRecallsPayload({ results: manyRecalls });
    assert.equal(parsedRecalls.length, 25);
    assert.equal(parsedRecalls[0].campaignNumber, '24V000');
    assert.equal(parsedRecalls[0].parkIt, true);
    assert.equal(parsedRecalls[1].parkIt, false);

    const longSummary = 'X'.repeat(1200);
    const parsedComplaints = parseNhtsaComplaintsPayload({
      count: 42,
      results: [
        {
          odiNumber: 11500001,
          components: 'ELECTRICAL SYSTEM',
          summary: longSummary,
          dateOfIncident: '2024-02-01',
          crash: false,
          fire: true,
        },
      ],
    });
    assert.equal(parsedComplaints.totalCount, 42);
    assert.equal(parsedComplaints.items.length, 1);
    assert.equal(parsedComplaints.items[0].odiNumber, '11500001');
    assert.equal(parsedComplaints.items[0].fire, true);
    assert.equal(parsedComplaints.items[0].summary.length, 800);
  });

  // -------------------------------------------------------------------------
  // 7. Custom Wire Renaming & Session Metadata Sync Integrity
  // -------------------------------------------------------------------------
  await runTest('wireLabelUtils distinguishes custom wires, sanitizes labels, and preserves electrical props on rename', () => {
    for (const defWire of DEFAULT_WIRES) {
      assert.equal(isCustomWireConnection(defWire), false);
    }

    const customWire = {
      id: 'wire-custom-a1b2',
      sourcePinId: 'ecu-pin-7',
      targetPinId: 'tps-sig',
      color: '#22c55e',
      label: 'TPS_SIG -> TPS: Signal',
      isCut: true,
      resistance: 0.12,
    };
    assert.equal(isCustomWireConnection(customWire), true);

    const combined = [...DEFAULT_WIRES, customWire];
    assert.equal(getCustomWires(combined).length, 1);
    assert.equal(getCustomWires(combined)[0].id, customWire.id);

    // Reject empty/whitespace or control-only labels
    assert.equal(normalizeWireLabelInput('   \n\t  '), null);

    // Clamp overly long labels and collapse control characters
    const clamped = normalizeWireLabelInput(`  TPS\nBypass\t${'X'.repeat(150)} `);
    assert.ok(clamped);
    assert.equal(clamped.length, MAX_WIRE_LABEL_LENGTH);
    assert.equal(clamped.startsWith('TPS Bypass X'), true);

    // Reject empty rename without altering existing wires
    const emptyRename = renameWireInList(combined, customWire.id, '   ');
    assert.equal(emptyRename.updated, false);
    assert.equal(emptyRename.wires, combined);

    // Valid rename preserves cut state, resistance, color, and pins
    const renamed = renameWireInList(combined, customWire.id, '  TPS Signal Test Lead  ');
    assert.equal(renamed.updated, true);
    assert.equal(renamed.sanitizedLabel, 'TPS Signal Test Lead');
    const updatedCustom = renamed.wires.find((w) => w.id === customWire.id);
    assert.ok(updatedCustom);
    assert.equal(updatedCustom.label, 'TPS Signal Test Lead');
    assert.equal(updatedCustom.isCut, true);
    assert.equal(updatedCustom.resistance, 0.12);
    assert.equal(updatedCustom.color, '#22c55e');
    assert.equal(updatedCustom.sourcePinId, 'ecu-pin-7');
    assert.equal(updatedCustom.targetPinId, 'tps-sig');

    const sanitizedSessionWires = sanitizeWiresForSession(renamed.wires);
    assert.equal(sanitizedSessionWires.find((w) => w.id === customWire.id)?.label, 'TPS Signal Test Lead');
  });

  await runTest('buildBenchSessionUpdatePayload strips immutable and legacy array fields, and toSafeFirestoreDocId enforces ID regex', () => {
    assert.equal(SCHEMA_VERSION_SUBCOLLECTIONS, 2);

    const updatePayload = buildBenchSessionUpdatePayload({
      id: 'bench_123',
      ownerId: 'uid_1',
      createdAt: 'should-not-overwrite',
      updatedAt: 'server-sets-this',
      syncState: 'QUEUED_OFFLINE',
      title: 'Updated ECU Title',
      wireCount: 4,
      wires: [
        {
          id: 'wire-custom-99',
          sourcePinId: 'ecu-pin-5',
          targetPinId: 'map-vcc',
          color: '#eab308',
          label: 'Renamed 5V Reference Jumper',
          isCut: false,
          resistance: 0.05,
        },
      ],
      faults: [],
      componentStates: {},
    });

    assert.equal('id' in updatePayload, false);
    assert.equal('ownerId' in updatePayload, false);
    assert.equal('createdAt' in updatePayload, false);
    assert.equal('updatedAt' in updatePayload, false);
    assert.equal('syncState' in updatePayload, false);
    assert.equal('wires' in updatePayload, false);
    assert.equal('faults' in updatePayload, false);
    assert.equal('componentStates' in updatePayload, false);
    assert.equal(updatePayload.title, 'Updated ECU Title');
    assert.equal(updatePayload.wireCount, 4);

    // Ensure unsafe chars (+, /, spaces) in net/component/wire IDs are sanitized cleanly
    const used = new Set<string>();
    const safe1 = toSafeFirestoreDocId('+5V_REF/Rail (A)', 'net', 0, used);
    const safe2 = toSafeFirestoreDocId('+5V_REF/Rail (A)', 'net', 1, used);
    assert.match(safe1, /^[a-zA-Z0-9_\-]+$/);
    assert.match(safe2, /^[a-zA-Z0-9_\-]+$/);
    assert.notEqual(safe1, safe2);
    assert.equal(toSafeFirestoreDocId('///', 'hs', 3), 'hs_3');
  });

  await runTest('importWithRetry retries transient dynamic import errors and fails fast on syntax/reference errors', async () => {
    assert.equal(
      isTransientDynamicImportError(new TypeError('Failed to fetch dynamically imported module: /src/components/ThreeBenchTwin.tsx')),
      true
    );
    assert.equal(
      isTransientDynamicImportError(new ReferenceError('Cannot access before initialization')),
      false
    );

    let attempts = 0;
    const loaded = await importWithRetry(async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new TypeError('Failed to fetch dynamically imported module: https://example.test/ThreeBenchTwin.tsx');
      }
      return { default: 'ThreeBenchTwinLoaded' };
    }, 2, 10);
    assert.equal(attempts, 2);
    assert.equal(loaded.default, 'ThreeBenchTwinLoaded');

    let nonRetryAttempts = 0;
    await assert.rejects(
      () =>
        importWithRetry(async () => {
          nonRetryAttempts += 1;
          throw new SyntaxError('Unexpected token');
        }, 2, 10),
      SyntaxError
    );
    assert.equal(nonRetryAttempts, 1);
  });

  await runTest('lazyWithRetry preserves stable React.lazy identity across Suspense retries and resets after rejection', async () => {
    let shouldFail = true;
    const DummyComponent: React.FC<{ label: string }> = ({ label }) => React.createElement('span', null, label);

    const LazyComp = lazyWithRetry(async () => {
      if (shouldFail) {
        throw new SyntaxError('Forced failure before retry');
      }
      return { default: DummyComponent };
    }, 0);

    // Calling the wrapper component directly (outside a full React commit, mirroring Suspense retry before mount)
    const firstEl = LazyComp({ label: 'a' }) as React.ReactElement;
    const secondEl = LazyComp({ label: 'b' }) as React.ReactElement;
    assert.equal(firstEl.type, secondEl.type, 'Must reuse same React.lazy target across Suspense retries');

    // Trigger React.lazy payload initialization so it rejects and triggers shouldReset
    const lazyType = firstEl.type as unknown as {
      _init?: (payload: unknown) => unknown;
      _payload?: unknown;
    };
    if (lazyType._init && lazyType._payload !== undefined) {
      try {
        lazyType._init(lazyType._payload);
      } catch (thrown) {
        if (thrown && typeof (thrown as Promise<unknown>).then === 'function') {
          await assert.rejects(() => thrown as Promise<unknown>, SyntaxError);
        }
      }
    }

    shouldFail = false;
    const recoveredEl = LazyComp({ label: 'c' }) as React.ReactElement;
    assert.notEqual(recoveredEl.type, firstEl.type, 'Must allocate a fresh React.lazy target after rejection');
  });

  // -------------------------------------------------------------------------
  // 8. Owner-Only Admin License Manager & Access Control (UID-Based + SHA-256 + 2 Devices)
  // -------------------------------------------------------------------------
  await runTest('Admin License Manager enforces verified Admin UID, SHA-256 hashing, 1-account + 2-device limit, device reset, extension, revocation, and HMAC offline lease', async () => {
    resetLicenseStoreForTests();
    setAdminUidForTests('uid_owner_admin_01');

    const adminUser = {
      uid: 'uid_owner_admin_01',
      email: 'rubenllego12@gmail.com',
      emailVerified: true,
    };
    const spoofedEmailNonAdmin = {
      uid: 'uid_spoof_attacker_99',
      email: 'rubenllego12@gmail.com',
      emailVerified: true,
    };
    const techUserA = {
      uid: 'uid_tech_customer_A',
      email: 'techA@workshop.test',
      emailVerified: true,
    };
    const techUserB = {
      uid: 'uid_tech_customer_B',
      email: 'techB@workshop.test',
      emailVerified: true,
    };

    // 1. Admin identity is anchored to verified Firebase UID, not email alone
    assert.equal(isVerifiedAdminUser(adminUser), true);
    assert.equal(
      isVerifiedAdminUser(spoofedEmailNonAdmin),
      false,
      'Must reject different UID even if email string matches'
    );
    assert.throws(
      () =>
        createLicenseCodeRecord({
          adminUser: spoofedEmailNonAdmin,
          plan: 'MONTHLY_30D',
        }),
      /FORBIDDEN_ADMIN_ONLY/
    );

    // 2. Generate license code -> VECL-XXXX-XXXX-XXXX, stored only as SHA-256 hash
    const t0 = 1_750_000_000_000;
    const created = createLicenseCodeRecord({
      adminUser,
      plan: 'MONTHLY_30D',
      unusedExpiryDays: 90,
      notes: 'Shop Bench License #1',
      nowMs: t0,
    });
    assert.equal(isValidLicenseCodeFormat(created.plainCode), true);
    assert.equal(created.record.codeHash, hashLicenseCode(created.plainCode));
    assert.equal(created.record.codeHash.includes(created.plainCode), false);
    assert.equal(created.record.maskedCode.includes('****'), true);
    assert.equal(created.record.durationDays, 30);
    assert.equal(created.record.maxDevices, 2);
    assert.equal(created.record.activatedAtMs, null);

    // 3. First activation binds to techUserA + Device #1 and starts 30-day clock
    const tActivate = t0 + 5 * 86_400_000; // 5 days after generation
    const redeemDev1 = await redeemLicenseCode({
      user: techUserA,
      rawCode: created.plainCode,
      deviceId: 'dev_laptop_1',
      deviceLabel: 'DiagnosticToughbook #1',
      nowMs: tActivate,
    });
    assert.equal(redeemDev1.newlyActivated, true);
    assert.equal(redeemDev1.status, 'ACTIVE');
    assert.equal(redeemDev1.record.assignedUid, techUserA.uid);
    assert.equal(redeemDev1.record.expiresAtMs, tActivate + 30 * 86_400_000);
    assert.equal(redeemDev1.record.devices.length, 1);

    // Verify HMAC-SHA256 offline lease token
    const leaseCheck = verifyOfflineLeaseToken(
      redeemDev1.leaseToken,
      techUserA.uid,
      'dev_laptop_1',
      tActivate + 3600_000
    );
    assert.equal(leaseCheck.valid, true);
    const wrongUidLease = verifyOfflineLeaseToken(
      redeemDev1.leaseToken,
      techUserB.uid,
      'dev_laptop_1',
      tActivate + 3600_000
    );
    assert.equal(wrongUidLease.valid, false);

    // 4. Second user (techUserB) cannot redeem a code bound to techUserA
    await assert.rejects(
      () =>
        redeemLicenseCode({
          user: techUserB,
          rawCode: created.plainCode,
          deviceId: 'dev_other_shop',
          nowMs: tActivate + 1000,
        }),
      /CODE_ALREADY_ASSIGNED_TO_ANOTHER_USER/
    );

    // 5. Same user (techUserA) can register Device #2 (up to 2 devices)
    const redeemDev2 = await redeemLicenseCode({
      user: techUserA,
      rawCode: created.plainCode,
      deviceId: 'dev_tablet_2',
      deviceLabel: 'Shop Tablet #2',
      nowMs: tActivate + 2000,
    });
    assert.equal(redeemDev2.newlyActivated, false);
    assert.equal(redeemDev2.record.devices.length, 2);

    // 6. Third device for techUserA is rejected with DEVICE_LIMIT_REACHED
    await assert.rejects(
      () =>
        redeemLicenseCode({
          user: techUserA,
          rawCode: created.plainCode,
          deviceId: 'dev_pc_3',
          nowMs: tActivate + 3000,
        }),
      /DEVICE_LIMIT_REACHED/
    );

    // 7. Admin resets device registrations -> techUserA can now register dev_pc_3
    resetLicenseDevices({
      adminUser,
      licenseId: created.record.licenseId,
    });
    const afterReset = await redeemLicenseCode({
      user: techUserA,
      rawCode: created.plainCode,
      deviceId: 'dev_pc_3',
      nowMs: tActivate + 4000,
    });
    assert.equal(afterReset.record.devices.length, 1);
    assert.equal(afterReset.record.devices[0].deviceId, 'dev_pc_3');

    // 8. Admin extends license by +15 days -> adds to existing expiration
    const prevExpiry = created.record.expiresAtMs!;
    const extended = extendLicenseDuration({
      adminUser,
      licenseId: created.record.licenseId,
      additionalDays: 15,
      nowMs: tActivate + 5000,
    });
    assert.equal(extended.expiresAtMs, prevExpiry + 15 * 86_400_000);

    // 9. Admin revokes license -> immediate REVOKED status
    setLicenseRevocation({
      adminUser,
      licenseId: created.record.licenseId,
      revoked: true,
      reason: 'Chargeback test',
      nowMs: tActivate + 6000,
    });
    const revokedStatus = getUserLicenseStatus(techUserA, 'dev_pc_3', tActivate + 7000);
    assert.equal(revokedStatus.status, 'REVOKED');
    assert.equal(revokedStatus.hasLicense, false);

    // 10. Durable persistence across simulated server restart
    const tmpStorePath = path.resolve('.data', `test-licenses-${process.pid}.store.json`);
    setLicenseStoreFilePathForTests(tmpStorePath);
    resetLicenseStoreForTests();
    setAdminUidForTests('uid_owner_admin_01');
    const durableCreated = createLicenseCodeRecord({
      adminUser,
      plan: 'QUARTERLY_90D',
      notes: 'Durable Restart Test',
      nowMs: t0,
    });
    await redeemLicenseCode({
      user: techUserA,
      rawCode: durableCreated.plainCode,
      deviceId: 'dev_durable_1',
      deviceLabel: 'Bench Toughbook Durable',
      nowMs: tActivate,
    });
    const reloaded = reloadLicenseStoreFromDisk();
    assert.equal(reloaded.loadedLicenses, 1);
    const statusAfterRestart = getUserLicenseStatus(techUserA, 'dev_durable_1', tActivate + 1000);
    assert.equal(statusAfterRestart.status, 'ACTIVE');
    assert.equal(statusAfterRestart.hasLicense, true);
    assert.equal(statusAfterRestart.deviceRegistered, true);

    resetLicenseStoreForTests();
    setLicenseStoreFilePathForTests(null);
  });

  // -------------------------------------------------------------------------
  // 9. Physical Bench Measurement & Evidence-Ranked Fault Isolation Engine
  // -------------------------------------------------------------------------
  await runTest('evaluatePhysicalBenchMeasurement ranks multiple fault causes with OEM_VERIFIED, CROSS_REFERENCED, CALCULATED_RESULT, and ENGINEERING_HYPOTHESIS categories', () => {
    assert.ok(STANDARD_ECU_BENCH_PIN_SPECS.length >= 10);

    // Low 5V reference (2.10V vs 5.00V nominal KOEO)
    const lowVref = evaluatePhysicalBenchMeasurement({
      pinId: 'VREF_5V',
      condition: 'KEY_ON_ENGINE_OFF',
      actualMeasured: 2.1,
      supplyVoltageV: 12.6,
    });
    assert.equal(lowVref.withinSpec, false);
    assert.equal(lowVref.severity, 'CRITICAL_FAULT');
    assert.equal(lowVref.expectedNominal, 5.0);
    assert.equal(lowVref.deltaFromNominal, -2.9);
    assert.equal(lowVref.calculatedCircuitMetrics.estimatedVoltageDropV, 2.9);
    assert.equal(lowVref.calculatedCircuitMetrics.category, 'CALCULATED_RESULT');
    assert.equal(lowVref.rankedCauses.length >= 3, true);
    assert.equal(lowVref.rankedCauses[0].category, 'OEM_VERIFIED');
    assert.equal(lowVref.rankedCauses[1].category, 'CALCULATED_RESULT');
    assert.equal(lowVref.rankedCauses[2].category, 'ENGINEERING_HYPOTHESIS');

    // Nominal 5V reference (5.01V KOEO)
    const okVref = evaluatePhysicalBenchMeasurement({
      pinId: 'VREF_5V',
      condition: 'KEY_ON_ENGINE_OFF',
      actualMeasured: 5.01,
      supplyVoltageV: 12.6,
    });
    assert.equal(okVref.withinSpec, true);
    assert.equal(okVref.severity, 'NORMAL');
  });

  // -------------------------------------------------------------------------
  // 10. Progressive Web App (PWA) Manifest, Icon Dimensions, SW Security & Platform Detection
  // -------------------------------------------------------------------------
  await runTest('PWA Web App Manifest, PNG icon dimensions, index.html head tags, and offline fallback page meet installability standards', () => {
    const manifestRaw = fs.readFileSync(path.resolve('public/manifest.webmanifest'), 'utf8');
    const manifest = JSON.parse(manifestRaw) as {
      id: string;
      name: string;
      short_name: string;
      description: string;
      start_url: string;
      scope: string;
      display: string;
      theme_color: string;
      background_color: string;
      orientation: string;
      icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
    };

    assert.equal(manifest.id, '/');
    assert.equal(manifest.name, 'AutoElectric Lab Pro');
    assert.equal(manifest.short_name, 'AutoElec Lab');
    assert.equal(manifest.short_name.length <= 12, true, 'short_name must be <= 12 characters');
    assert.equal(
      manifest.description,
      'Automotive Electronics Diagnostics, ECU Bench Testing and AI Repair Assistance.'
    );
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.theme_color, '#071426');
    assert.equal(manifest.background_color, '#071426');
    assert.equal(manifest.orientation, 'any');

    // Verify every manifest icon exists on disk and has exact matching PNG pixel dimensions
    for (const icon of manifest.icons) {
      const iconFile = path.resolve('public', icon.src.replace(/^\//, ''));
      assert.equal(fs.existsSync(iconFile), true, `Missing manifest icon: ${icon.src}`);
      const buf = fs.readFileSync(iconFile);
      assert.equal(buf.slice(0, 8).toString('hex'), '89504e470d0a1a0a', `${icon.src} must be valid PNG`);
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      assert.equal(`${width}x${height}`, icon.sizes, `Icon ${icon.src} pixel size mismatch`);
    }

    // Verify iOS apple-touch-icon.png (180x180 PNG) and offline.html exist
    const appleIconBuf = fs.readFileSync(path.resolve('public/apple-touch-icon.png'));
    assert.equal(appleIconBuf.readUInt32BE(16), 180);
    assert.equal(appleIconBuf.readUInt32BE(20), 180);
    assert.equal(fs.existsSync(path.resolve('public/offline.html')), true);
    assert.equal(fs.existsSync(path.resolve('src/sw.js')), true);

    const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
    assert.equal(indexHtml.includes('rel="manifest" href="/manifest.webmanifest"'), true);
    assert.equal(indexHtml.includes('name="theme-color" content="#071426"'), true);
    assert.equal(indexHtml.includes('rel="apple-touch-icon"'), true);
  });

  await runTest('Service Worker security policy never caches Firebase Auth, License, Admin, Firestore, Gemini API, or oversized dumps', () => {
    const swSrc = fs.readFileSync(path.resolve('src/sw.js'), 'utf8');
    assert.equal(swSrc.includes('/api/autoelectric/license'), true);
    assert.equal(swSrc.includes('securetoken.googleapis.com'), true);
    assert.equal(swSrc.includes('identitytoolkit.googleapis.com'), true);
    assert.equal(swSrc.includes('firestore.googleapis.com'), true);
    assert.equal(swSrc.includes('SKIP_WAITING'), true);

    // Verify pure security policy evaluator across sensitive & static routes
    assert.equal(
      evaluateSwRequestSecurityPolicy({
        method: 'GET',
        url: 'https://securetoken.googleapis.com/v1/token',
      }).allowCache,
      false
    );
    assert.equal(
      evaluateSwRequestSecurityPolicy({
        method: 'GET',
        url: '/api/autoelectric/license/status',
      }).allowCache,
      false
    );
    assert.equal(
      evaluateSwRequestSecurityPolicy({
        method: 'POST',
        url: '/api/autoelectric/license/redeem',
      }).allowCache,
      false
    );
    assert.equal(
      evaluateSwRequestSecurityPolicy({
        method: 'GET',
        url: '/api/autoelectric/license/admin/list',
      }).allowCache,
      false
    );
    assert.equal(
      evaluateSwRequestSecurityPolicy({
        method: 'POST',
        url: '/api/autoelectric/grounded-search',
      }).allowCache,
      false
    );
    assert.equal(
      evaluateSwRequestSecurityPolicy({
        method: 'GET',
        url: '/index.html',
        hasAuthHeader: true,
      }).allowCache,
      false
    );
    assert.equal(
      evaluateSwRequestSecurityPolicy({
        method: 'GET',
        url: '/assets/aistudio/pcb-workspace-enhanced_fcd94e06.zip',
      }).allowCache,
      false
    );
    assert.equal(
      evaluateSwRequestSecurityPolicy({
        method: 'GET',
        url: '/index.html',
      }).allowCache,
      true
    );
    assert.equal(
      evaluateSwRequestSecurityPolicy({
        method: 'GET',
        url: '/pwa-512x512.png',
      }).allowCache,
      true
    );

    // Verify platform detection for Android Chrome, Samsung Internet, iOS Safari, and Desktop Chrome
    assert.equal(
      detectPwaPlatformProfile(
        'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/124.0 SamsungBrowser/25.0 Mobile Safari/537.36'
      ).platform,
      'SAMSUNG_INTERNET'
    );
    assert.equal(
      detectPwaPlatformProfile(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36'
      ).platform,
      'ANDROID_CHROME'
    );
    assert.equal(
      detectPwaPlatformProfile(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1'
      ).isIOS,
      true
    );
    assert.equal(
      detectPwaPlatformProfile(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        5,
        true
      ).isStandalone,
      true
    );
  });

  // -------------------------------------------------------------------------
  // 11. Google Workspace 403 Error Classification & Auth Token Preservation
  // -------------------------------------------------------------------------
  await runTest('parseGoogleWorkspaceHttpError preserves token on disabled-API/quota 403s and invalidates only on auth/scope 401/403', () => {
    const disabledApiMsg =
      'Google Slides API has not been used in project 510152697443 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/slides.googleapis.com/overview?project=510152697443 then retry.';
    const disabledErr = parseGoogleWorkspaceHttpError(
      403,
      {
        error: {
          message: disabledApiMsg,
          errors: [{ reason: 'accessNotConfigured', message: disabledApiMsg }],
        },
      },
      'Google Slides',
      'Google Slides permission denied'
    );
    assert.equal(
      disabledErr instanceof GoogleWorkspaceAuthError,
      false,
      'Disabled API 403 must not invalidate valid OAuth workspaceToken'
    );
    assert.equal(
      extractGoogleConsoleUrl(disabledErr.message),
      'https://console.developers.google.com/apis/api/slides.googleapis.com/overview?project=510152697443'
    );

    const quotaErr = parseGoogleWorkspaceHttpError(
      403,
      {
        error: {
          message: 'User rate limit exceeded',
          status: 'RESOURCE_EXHAUSTED',
          errors: [{ reason: 'userRateLimitExceeded', message: 'User rate limit exceeded' }],
        },
      },
      'Google Sheets',
      'Google Sheets permission denied'
    );
    assert.equal(
      quotaErr instanceof GoogleWorkspaceAuthError,
      false,
      'Rate-limit 403 must not invalidate valid OAuth workspaceToken'
    );

    const unauthErr = parseGoogleWorkspaceHttpError(
      401,
      { error: { message: 'Invalid Credentials' } },
      'Google Drive',
      'Google Drive permission denied'
    );
    assert.equal(unauthErr instanceof GoogleWorkspaceAuthError, true);

    const insufficientScopeErr = parseGoogleWorkspaceHttpError(
      403,
      {
        error: {
          message: 'Request had insufficient authentication scopes.',
          errors: [{ reason: 'insufficientPermissions' }],
        },
      },
      'Google Slides',
      'Google Slides permission denied'
    );
    assert.equal(insufficientScopeErr instanceof GoogleWorkspaceAuthError, true);

    const cleanBanner = formatWorkspaceBannerText(disabledErr.message, true);
    assert.equal(cleanBanner.includes('https://console.'), false);
    assert.equal(cleanBanner.includes('Google Slides API is disabled for project 510152697443'), true);
  });

  // -------------------------------------------------------------------------
  // 12. Constant-Time Offline Lease Verification & Segment Validation
  // -------------------------------------------------------------------------
  await runTest('verifyOfflineLeaseToken enforces 2-segment structure and constant-time HMAC signature checks', () => {
    const nowMs = Date.now();
    const validToken = signOfflineLeaseToken({
      licenseId: 'lic_test_01',
      uid: 'uid_lease_01',
      deviceId: 'dev_bench_01',
      issuedAtMs: nowMs,
      leaseExpiresAtMs: nowMs + 86_400_000,
      licenseExpiresAtMs: nowMs + 30 * 86_400_000,
    });

    const validRes = verifyOfflineLeaseToken(validToken, 'uid_lease_01', 'dev_bench_01', nowMs + 1000);
    assert.equal(validRes.valid, true);
    assert.equal(validRes.payload?.licenseId, 'lic_test_01');

    // Reject extra dots
    assert.equal(
      verifyOfflineLeaseToken(`${validToken}.extra`, 'uid_lease_01', 'dev_bench_01', nowMs).valid,
      false
    );
    // Reject missing signature segment
    const [payloadOnly] = validToken.split('.');
    assert.equal(
      verifyOfflineLeaseToken(`${payloadOnly}.`, 'uid_lease_01', 'dev_bench_01', nowMs).valid,
      false
    );
    // Reject truncated signature (different byte length for timingSafeEqual safety)
    assert.equal(
      verifyOfflineLeaseToken(`${payloadOnly}.short`, 'uid_lease_01', 'dev_bench_01', nowMs).valid,
      false
    );
    // Reject flipped character in signature
    const [p, s] = validToken.split('.');
    const flipped = `${p}.${s[0] === 'A' ? 'B' : 'A'}${s.slice(1)}`;
    assert.equal(
      verifyOfflineLeaseToken(flipped, 'uid_lease_01', 'dev_bench_01', nowMs).valid,
      false
    );
  });

  // -------------------------------------------------------------------------
  // 13. Cross-Project Legacy Firebase Fallback Guard
  // -------------------------------------------------------------------------
  await runTest('verifyFirebaseIdToken blocks legacy valued-zoo-9mvz5 fallback unless ALLOW_LEGACY_FIREBASE_PROJECT_ID=true', async () => {
    setJwksFetcherForTests(async () => ({
      keys: [{ kid: testKid, kty: publicJwk.kty, alg: 'RS256', use: 'sig', n: publicJwk.n, e: publicJwk.e }],
      maxAgeSec: 3600,
    }));

    const prevLegacyEnv = process.env.ALLOW_LEGACY_FIREBASE_PROJECT_ID;
    delete process.env.ALLOW_LEGACY_FIREBASE_PROJECT_ID;
    try {
      const now = Math.floor(Date.now() / 1000);
      const legacyToken = signTestJwt(privateKey, testKid, {
        iss: 'https://securetoken.google.com/valued-zoo-9mvz5',
        aud: 'valued-zoo-9mvz5',
        sub: 'uid_legacy_user',
        email: 'tech@autoelectric.test',
        email_verified: true,
        iat: now - 10,
        auth_time: now - 10,
        exp: now + 3600,
      });

      await assert.rejects(
        () => verifyFirebaseIdToken(legacyToken, 'project-2c4384e3-ff21-4f7f-b91'),
        (err: unknown) =>
          err instanceof FirebaseTokenVerificationError &&
          err.code === 'INVALID_TOKEN' &&
          err.statusCode === 401
      );

      process.env.ALLOW_LEGACY_FIREBASE_PROJECT_ID = 'true';
      const accepted = await verifyFirebaseIdToken(legacyToken, 'project-2c4384e3-ff21-4f7f-b91');
      assert.equal(accepted.uid, 'uid_legacy_user');
    } finally {
      if (prevLegacyEnv === undefined) {
        delete process.env.ALLOW_LEGACY_FIREBASE_PROJECT_ID;
      } else {
        process.env.ALLOW_LEGACY_FIREBASE_PROJECT_ID = prevLegacyEnv;
      }
      resetFirebaseAuthCacheForTests();
    }
  });

  // -------------------------------------------------------------------------
  // 14. Offline Diagnostic Chatbot PH 2,080 Exact ID & Keyword Retrieval
  // -------------------------------------------------------------------------
  await runTest('OfflineDiagnosticChatbot indexes all 2,080 PH scenarios and prioritizes exact PH-xxx / PH-xxxx lookups', () => {
    const bot = new OfflineDiagnosticChatbot();
    assert.equal(bot.indexedCount >= 2080, true);

    for (const phId of ['PH-001', 'PH-171', 'PH-463', 'PH-520', 'PH-521', 'PH-840', 'PH-1040', 'PH-1041', 'PH-1271', 'PH-1323', 'PH-1560', 'PH-1561', 'PH-1853', 'PH-1996', 'PH-2041', 'PH-2080']) {
      const reply = bot.ask(`Explain ${phId} diagnostic steps`);
      assert.equal(reply.citations.length > 0, true, `Expected citations for ${phId}`);
      assert.equal(reply.citations[0].kind, 'PH_SCENARIO', `Top citation for ${phId} must be PH_SCENARIO`);
      assert.equal(
        reply.citations[0].title.startsWith(`${phId} `),
        true,
        `Top citation for ${phId} got "${reply.citations[0].title}"`
      );
      assert.equal(reply.answer.includes(phId), true, `Answer must reference ${phId}`);
    }
  });

  // -------------------------------------------------------------------------
  // 15. Technical Audit Phase 1 Guardrails: Safe Startup Defaults, HAL & SIMULATION_ONLY Gate
  // -------------------------------------------------------------------------
  await runTest('Safe electrical defaults initialize PSU OFF, pre-bench gate LOCKED, and HAL blocks physical power on SIMULATION_ONLY trainer', () => {
    const defaultPrefs = loadWorkflowPreferences();
    assert.equal(defaultPrefs.preBenchGateLocked, true, 'Pre-Bench Safety Gate must initialize LOCKED');

    const appSrc = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
    assert.equal(
      appSrc.includes("isOutputEnabled: false,\n    preset: '12V_BENCH'"),
      true,
      'Bench PSU must initialize in the OFF state'
    );

    const halStatus = inspectBenchHardwareAbstractionStatus();
    assert.equal(halStatus.mode, 'SOFTWARE_SIMULATION_ONLY');
    assert.equal(halStatus.isPhysicalHardwareConnected, false);
    assert.equal(halStatus.measurementOriginLabel, 'SIMULATED_BENCH_VALUE');

    const trainerSafety = evaluateVehicleBenchSafety({
      brandKey: 'universal-bench',
      modelName: 'Generic 16-Pin Bench',
      ecuProfileId: null,
      ecuStatus: 'VERIFIED',
      hasVerifiedPinoutMap: true,
      controllerNote: 'Trainer',
      orientationConfirmed: true,
    });
    const blockedPhysicalTrainer = authorizePhysicalBenchPowerControl({
      safetyEval: trainerSafety,
      preBenchGate: {
        allowed: true,
        mandatoryChecked: 4,
        mandatoryTotal: 4,
        pendingTitles: [],
      },
      technicianExplicitConfirm: true,
    });
    assert.equal(blockedPhysicalTrainer.authorized, false);
    assert.equal(blockedPhysicalTrainer.actualProvenance, 'SIMULATION_ONLY');

    const verifiedOemSafety = evaluateVehicleBenchSafety({
      brandKey: 'toyota',
      modelName: 'Hilux 2.8 1GD-FTV',
      ecuProfileId: 'toyota-1gd-edc17',
      ecuStatus: 'VERIFIED',
      hasVerifiedPinoutMap: true,
      controllerNote: 'OEM Verified',
      orientationConfirmed: true,
    });
    const authorizedOemPhysical = authorizePhysicalBenchPowerControl({
      safetyEval: verifiedOemSafety,
      preBenchGate: {
        allowed: true,
        mandatoryChecked: 4,
        mandatoryTotal: 4,
        pendingTitles: [],
      },
      technicianExplicitConfirm: true,
    });
    assert.equal(authorizedOemPhysical.authorized, true);
  });

  await runTest('Firebase CLI configs (firebase.json, .firebaserc, firestore.indexes.json) match provisioned project & DB and local UID guards safely no-op', async () => {
    const firebaseJson = JSON.parse(fs.readFileSync(path.resolve('firebase.json'), 'utf8')) as {
      firestore?: { database?: string; rules?: string; indexes?: string };
      hosting?: { public?: string };
      emulators?: { firestore?: { port?: number } };
    };
    const firebaserc = JSON.parse(fs.readFileSync(path.resolve('.firebaserc'), 'utf8')) as {
      projects?: { default?: string };
    };
    const indexesJson = JSON.parse(fs.readFileSync(path.resolve('firestore.indexes.json'), 'utf8')) as {
      indexes?: unknown[];
      fieldOverrides?: unknown[];
    };

    assert.equal(firebaseJson.firestore?.rules, 'firestore.rules');
    assert.equal(firebaseJson.firestore?.indexes, 'firestore.indexes.json');
    assert.equal(firebaseJson.hosting?.public, 'dist');
    assert.equal(firebaseJson.emulators?.firestore?.port, 8080);
    assert.ok(Array.isArray(indexesJson.indexes));
    assert.ok(Array.isArray(indexesJson.fieldOverrides));

    const appletConfigPath = path.resolve('firebase-applet-config.json');
    if (fs.existsSync(appletConfigPath)) {
      const appletConfig = JSON.parse(fs.readFileSync(appletConfigPath, 'utf8')) as {
        projectId?: string;
        firestoreDatabaseId?: string;
      };
      assert.equal(firebaserc.projects?.default, appletConfig.projectId);
      assert.equal(firebaseJson.firestore?.database, appletConfig.firestoreDatabaseId);
      assert.equal(
        resolvedFirebaseConfig.projectId,
        appletConfig.projectId,
        'Client resolvedFirebaseConfig.projectId must load directly from firebase-applet-config.json'
      );
      assert.equal(
        resolvedFirebaseConfig.firestoreDatabaseId,
        appletConfig.firestoreDatabaseId,
        'Client resolvedFirebaseConfig.firestoreDatabaseId must load directly from firebase-applet-config.json, never stale VITE_FIREBASE_DATABASE_ID'
      );
    }

    const firebaseSrc = fs.readFileSync(path.resolve('src/lib/firebase.ts'), 'utf8');
    assert.equal(firebaseSrc.includes('getDocFromServer'), true);
    assert.equal(firebaseSrc.includes('resolvedFirebaseConfig.firestoreDatabaseId'), true);
    assert.equal(
      firebaseSrc.includes("typeof meta.glob === 'function'"),
      false,
      'firebase.ts must not hide firebase-applet-config.json behind dead typeof import.meta.glob === function guard'
    );

    // Provisioned firebase-applet-config.json must override stale/corrupt VITE_FIREBASE_* env vars
    assert.equal(sanitizeFirestoreDatabaseId('/users/GpbGdGCaYgY0dsKSCWvretSIgSN2'), '(default)');
    assert.equal(
      sanitizeFirestoreDatabaseId('ai-studio-virtualeculab-4053ff7d-9ace-4b02-bde1-ef4cebdbc4d6'),
      'ai-studio-virtualeculab-4053ff7d-9ace-4b02-bde1-ef4cebdbc4d6'
    );
    const resolvedWithStaleEnv = resolveFirebaseClientConfig(
      {
        projectId: 'project-2c4384e3-ff21-4f7f-b91',
        apiKey: 'AIzaTestProvisionedKey',
        firestoreDatabaseId: 'ai-studio-virtualeculab-4053ff7d-9ace-4b02-bde1-ef4cebdbc4d6',
      },
      {
        VITE_FIREBASE_PROJECT_ID: 'gen-lang-client-0208299359',
        VITE_FIREBASE_API_KEY: 'AIzaStaleOldKey',
        VITE_FIREBASE_DATABASE_ID: '/users/GpbGdGCaYgY0dsKSCWvretSIgSN2',
      }
    );
    assert.equal(resolvedWithStaleEnv.projectId, 'project-2c4384e3-ff21-4f7f-b91');
    assert.equal(
      resolvedWithStaleEnv.firestoreDatabaseId,
      'ai-studio-virtualeculab-4053ff7d-9ace-4b02-bde1-ef4cebdbc4d6'
    );

    // Local workstation UID and invalid emails must safely no-op without throwing Firestore errors
    await syncUserProfile(LOCAL_WORKSTATION_UID, 'tech@local.test', 'Local Tech');
    await syncUserProfile('uid_valid_user_1', 'x', 'Invalid Email');
    await syncFordOemPinoutsToDatabase(LOCAL_WORKSTATION_UID);
    await syncToyotaOemPinoutsToDatabase(LOCAL_WORKSTATION_UID);
    const flushRes = await flushQueuedBenchSync(LOCAL_WORKSTATION_UID);
    assert.deepEqual(flushRes, { synced: 0, failed: 0, remaining: 0 });
  });

  // -------------------------------------------------------------------------
  // 16. PIN-Only Offline Mode: reportCloudSyncError & Non-Blocking Subscriptions
  // -------------------------------------------------------------------------
  await runTest('formatCloudSyncError suppresses offline & unauthenticated PIN-only Firestore errors while surfacing real storage errors', () => {
    // Transient offline & network errors must be suppressed (return null)
    assert.equal(formatCloudSyncError(new Error('FIRESTORE_OFFLINE_SUPPRESSED: offline')), null);
    assert.equal(formatCloudSyncError(new Error('Failed to get document because the client is offline.')), null);
    assert.equal(formatCloudSyncError(new Error('FirebaseError: [code=unavailable]: Service unavailable')), null);
    assert.equal(formatCloudSyncError(new TypeError('Failed to fetch')), null);
    assert.equal(
      isSuppressedOfflineOrPinOnlyCloudError(new Error('Arbitrary error while offline'), { isOffline: true }),
      true
    );

    // Unauthenticated FirestoreErrorInfo JSON in PIN-only mode must be suppressed
    const unauthPermJson = JSON.stringify({
      error: 'Missing or insufficient permissions.',
      operationType: 'list',
      path: 'users/uid_legacy/benchSessions',
      authInfo: { userId: null },
    });
    assert.equal(
      formatCloudSyncError(new Error(unauthPermJson), { isPinOnlyLocalMode: true }),
      null
    );
    assert.equal(
      formatCloudSyncError(new Error('Please check your Firebase configuration.'), { isPinOnlyLocalMode: true }),
      null
    );

    // Authenticated FirestoreErrorInfo permission error must NOT be suppressed and should be cleanly formatted
    const authPermJson = JSON.stringify({
      error: 'Missing or insufficient permissions.',
      operationType: 'write',
      path: 'users/uid_auth_1/benchSessions/sess_1',
      authInfo: { userId: 'uid_auth_1' },
    });
    const formattedAuthErr = formatCloudSyncError(new Error(authPermJson), { isPinOnlyLocalMode: true });
    assert.equal(
      formattedAuthErr,
      'Missing or insufficient permissions. (users/uid_auth_1/benchSessions/sess_1)'
    );

    // Real local IndexedDB storage errors must surface even in PIN-only mode
    const quotaErr = formatCloudSyncError(new Error('QuotaExceededError: IndexedDB storage quota exceeded'), {
      isPinOnlyLocalMode: true,
    });
    assert.equal(quotaErr, 'QuotaExceededError: IndexedDB storage quota exceeded');
  });

  await runTest('subscribeBenchSessions, subscribeDiagnosticLogs, subscribePcbScans, and subscribeUserBenchPreferences serve local IndexedDB state without firing cloud errors in PIN-only offline mode', async () => {
    await resetOfflineQueueForTests();

    const testUids = [LOCAL_WORKSTATION_UID, 'uid_pin_offline_fallback'];
    for (const uid of testUids) {
      await cacheLocalDocument({
        uid,
        collection: 'benchSessions',
        docId: `sess_${uid}`,
        data: {
          id: `sess_${uid}`,
          ownerId: uid,
          title: `Local Bench ${uid}`,
          selectedBrandKey: 'universal-bench',
          selectedModelName: 'Generic 16-Pin Bench',
          selectedEcuProfileId: null,
          powerSupply: {
            voltage: 12.6,
            currentLimit: 2.0,
            isOutputEnabled: false,
            preset: '12V_BENCH',
          },
          wires: [],
          faults: [],
          componentStates: {},
          activeDtcs: [],
          supplyCurrentDrawAmps: 0,
          updatedAtMs: Date.now(),
        },
        syncState: 'SYNCED_CLOUD',
        updatedAtMs: Date.now(),
      });

      await cacheLocalDocument({
        uid,
        collection: 'diagnosticLogs',
        docId: `log_${uid}`,
        data: {
          id: `log_${uid}`,
          ownerId: uid,
          title: `Local Log ${uid}`,
          dtcCode: 'P0335',
          ecuModel: 'Denso 1GD',
          sourceType: 'PINOUT_NOTE',
          summary: 'Cached local diagnostic note',
          sources: [],
          updatedAtMs: Date.now(),
        },
        syncState: 'SYNCED_CLOUD',
        updatedAtMs: Date.now(),
      });

      await cacheLocalDocument({
        uid,
        collection: 'pcbScans',
        docId: `pcb_${uid}`,
        data: {
          id: `pcb_${uid}`,
          ownerId: uid,
          title: `Local PCB ${uid}`,
          ecuType: 'Bosch EDC17',
          summary: 'Cached PCB inspection',
          boardPowerRailCheck: '5V OK',
          diagnosticFindings: [],
          components: [],
          nets: [],
          hotspots: [],
          updatedAtMs: Date.now(),
        },
        syncState: 'SYNCED_CLOUD',
        updatedAtMs: Date.now(),
      });

      await cacheLocalDocument({
        uid,
        collection: 'benchPreferences',
        docId: BENCH_PREFERENCES_DOC_ID,
        data: {
          id: BENCH_PREFERENCES_DOC_ID,
          ownerId: uid,
          workflowCheckedIds: ['step-1'],
          preBenchGateLocked: true,
          autoVerifyWorkflow: true,
          voiceMacros: [],
          updatedAtMs: Date.now(),
        },
        syncState: 'SYNCED_CLOUD',
        updatedAtMs: Date.now(),
      });

      const errors: Error[] = [];
      const sessionsPromise = new Promise<number>((resolve) => {
        const unsub = subscribeBenchSessions(
          uid,
          (items) => {
            unsub();
            resolve(items.length);
          },
          (err) => errors.push(err)
        );
      });
      const logsPromise = new Promise<number>((resolve) => {
        const unsub = subscribeDiagnosticLogs(
          uid,
          (items) => {
            unsub();
            resolve(items.length);
          },
          (err) => errors.push(err)
        );
      });
      const pcbPromise = new Promise<number>((resolve) => {
        const unsub = subscribePcbScans(
          uid,
          (items) => {
            unsub();
            resolve(items.length);
          },
          (err) => errors.push(err)
        );
      });
      const prefsPromise = new Promise<boolean>((resolve) => {
        const unsub = subscribeUserBenchPreferences(
          uid,
          (prefs) => {
            unsub();
            resolve(Boolean(prefs && prefs.workflowCheckedIds.includes('step-1')));
          },
          (err) => errors.push(err)
        );
      });

      const [sessionCount, logCount, pcbCount, prefsLoaded] = await Promise.all([
        sessionsPromise,
        logsPromise,
        pcbPromise,
        prefsPromise,
      ]);
      assert.equal(sessionCount, 1, `Expected 1 local bench session for ${uid}`);
      assert.equal(logCount, 1, `Expected 1 local diagnostic log for ${uid}`);
      assert.equal(pcbCount, 1, `Expected 1 local PCB scan for ${uid}`);
      assert.equal(prefsLoaded, true, `Expected local bench preferences hydrated for ${uid}`);
      assert.equal(errors.length, 0, `Expected 0 cloud errors in PIN-only mode for ${uid}`);
    }

    // Verify App.tsx, BenchCloudModal.tsx, and SchematicPcbScanner.tsx wire up non-blocking error suppression
    const appSrc = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
    const modalSrc = fs.readFileSync(path.resolve('src/components/BenchCloudModal.tsx'), 'utf8');
    const pcbSrc = fs.readFileSync(path.resolve('src/components/SchematicPcbScanner.tsx'), 'utf8');
    assert.equal(appSrc.includes("from './utils/cloudSyncErrorUtils'"), true);
    assert.equal(appSrc.includes('setCloudPrefsHydrated(true);'), true);
    assert.equal(modalSrc.includes("from '../utils/cloudSyncErrorUtils'"), true);
    assert.equal(pcbSrc.includes("from '../utils/cloudSyncErrorUtils'"), true);

    await resetOfflineQueueForTests();
  });

  // -------------------------------------------------------------------------
  // 13. University Automotive Lab: Live MNA Auto-Grading & Offline SHA-256 PDF
  // -------------------------------------------------------------------------
  await runTest('University Lab Curriculum has 12 Taglish modules across all 3 difficulty tiers and live MNA physics matches LAB-04, LAB-07, and LAB-12 tolerances', () => {
    assert.equal(UNIVERSITY_LAB_MODULES.length, 12);
    const l1 = UNIVERSITY_LAB_MODULES.filter((m) => m.tier === 'LEVEL_1_BEGINNER');
    const l2 = UNIVERSITY_LAB_MODULES.filter((m) => m.tier === 'LEVEL_2_INTERMEDIATE');
    const l3 = UNIVERSITY_LAB_MODULES.filter((m) => m.tier === 'LEVEL_3_ADVANCED');
    assert.equal(l1.length, 4);
    assert.equal(l2.length, 5);
    assert.equal(l3.length, 3);

    // Flagship LAB-04: TPS Circuit Low Voltage Input (DTC P0122) with wire-2 cut
    const lab04 = getUniversityLabModuleById('univ-l1-04-tps-low-p0122');
    assert.ok(lab04, 'LAB-04 must exist');
    const lab04Wires = DEFAULT_WIRES.map((w) =>
      w.id === 'wire-2' ? { ...w, isCut: true } : { ...w, isCut: false }
    );
    const basePsuOff = {
      voltageSetting: 12.6,
      currentLimit: 5.0,
      isOutputEnabled: false,
      actualVoltage: 0,
      actualCurrent: 0,
      isCurrentLimiting: false,
      preset: '12V_BENCH' as const,
    };
    const basePsuOn = {
      ...basePsuOff,
      isOutputEnabled: true,
      actualVoltage: 12.6,
      actualCurrent: 0.45,
    };

    // Step 1: Cold SGND resistance (PSU OFF, RESISTANCE, Pin 6 -> chassis-gnd)
    const dmmStep1 = {
      mode: 'RESISTANCE' as const,
      isPowered: true,
      rangeAuto: true,
      holdValue: false,
      redProbe: { color: 'red' as const, attachedToPinId: 'ecu-pin-6', attachedLabel: 'SGND' },
      blackProbe: { color: 'black' as const, attachedToPinId: 'chassis-gnd', attachedLabel: 'GND' },
    };
    const solLab04Step1 = solveCircuit(
      basePsuOff,
      DEFAULT_ECU_PINS,
      [],
      lab04Wires,
      DEFAULT_BENCH_COMPONENTS,
      dmmStep1
    );
    const evalLab04Step1 = evaluateUniversityLabStep(lab04.steps[0], {
      powerSupply: basePsuOff,
      multimeter: dmmStep1,
      multimeterReading: solLab04Step1.multimeterReading,
      nodeVoltages: solLab04Step1.nodeVoltages,
      faults: [],
      wires: lab04Wires,
    });
    assert.equal(evalLab04Step1.status, 'PASSED', `LAB-04 Step 1 expected PASSED, got ${evalLab04Step1.status} (${solLab04Step1.multimeterReading.display} ${solLab04Step1.multimeterReading.unit})`);

    // Safety check: Step 1 with PSU ON must remain WAITING_SETUP (requires PSU OFF)
    const evalLab04Step1Hot = evaluateUniversityLabStep(lab04.steps[0], {
      powerSupply: basePsuOn,
      multimeter: dmmStep1,
      multimeterReading: solLab04Step1.multimeterReading,
      nodeVoltages: solLab04Step1.nodeVoltages,
      faults: [],
      wires: lab04Wires,
    });
    assert.equal(evalLab04Step1Hot.status, 'WAITING_SETUP');
    assert.equal(evalLab04Step1Hot.psuOk, false);

    // Step 2: 5V Reference Check (PSU ON, V_DC, Pin 5 -> chassis-gnd)
    const dmmStep2 = {
      mode: 'V_DC' as const,
      isPowered: true,
      rangeAuto: true,
      holdValue: false,
      redProbe: { color: 'red' as const, attachedToPinId: 'ecu-pin-5', attachedLabel: 'VREF_5V' },
      blackProbe: { color: 'black' as const, attachedToPinId: 'chassis-gnd', attachedLabel: 'GND' },
    };
    const solLab04Step2 = solveCircuit(
      basePsuOn,
      DEFAULT_ECU_PINS,
      [],
      lab04Wires,
      DEFAULT_BENCH_COMPONENTS,
      dmmStep2
    );
    const evalLab04Step2 = evaluateUniversityLabStep(lab04.steps[1], {
      powerSupply: basePsuOn,
      multimeter: dmmStep2,
      multimeterReading: solLab04Step2.multimeterReading,
      nodeVoltages: solLab04Step2.nodeVoltages,
      faults: [],
      wires: lab04Wires,
    });
    assert.equal(evalLab04Step2.status, 'PASSED', `LAB-04 Step 2 expected PASSED, got ${evalLab04Step2.status} (${solLab04Step2.multimeterReading.display} ${solLab04Step2.multimeterReading.unit})`);

    // Step 3: TPS Signal Drop Confirmation (PSU ON, V_DC, Pin 7 -> chassis-gnd with wire-2 cut)
    const dmmStep3 = {
      mode: 'V_DC' as const,
      isPowered: true,
      rangeAuto: true,
      holdValue: false,
      redProbe: { color: 'red' as const, attachedToPinId: 'ecu-pin-7', attachedLabel: 'TPS_SIG' },
      blackProbe: { color: 'black' as const, attachedToPinId: 'chassis-gnd', attachedLabel: 'GND' },
    };
    const solLab04Step3 = solveCircuit(
      basePsuOn,
      DEFAULT_ECU_PINS,
      [],
      lab04Wires,
      DEFAULT_BENCH_COMPONENTS,
      dmmStep3
    );
    const evalLab04Step3 = evaluateUniversityLabStep(lab04.steps[2], {
      powerSupply: basePsuOn,
      multimeter: dmmStep3,
      multimeterReading: solLab04Step3.multimeterReading,
      nodeVoltages: solLab04Step3.nodeVoltages,
      faults: [],
      wires: lab04Wires,
    });
    assert.equal(evalLab04Step3.status, 'FAULT_CONFIRMED', `LAB-04 Step 3 expected FAULT_CONFIRMED, got ${evalLab04Step3.status} (${solLab04Step3.multimeterReading.display} ${solLab04Step3.multimeterReading.unit})`);

    // LAB-07: CAN-Bus 60Ω Termination Open (wire-10 cut -> ~120Ω between Pin 13 and Pin 14)
    const lab07 = getUniversityLabModuleById('univ-l2-07-can-60ohm-termination');
    assert.ok(lab07, 'LAB-07 must exist');
    const lab07Wires = DEFAULT_WIRES.map((w) =>
      w.id === 'wire-10' ? { ...w, isCut: true } : { ...w, isCut: false }
    );
    const dmmCan = {
      mode: 'RESISTANCE' as const,
      isPowered: true,
      rangeAuto: true,
      holdValue: false,
      redProbe: { color: 'red' as const, attachedToPinId: 'ecu-pin-13', attachedLabel: 'CAN_H' },
      blackProbe: { color: 'black' as const, attachedToPinId: 'ecu-pin-14', attachedLabel: 'CAN_L' },
    };
    const solLab07 = solveCircuit(
      basePsuOff,
      DEFAULT_ECU_PINS,
      [],
      lab07Wires,
      DEFAULT_BENCH_COMPONENTS,
      dmmCan
    );
    const evalLab07 = evaluateUniversityLabStep(lab07.steps[0], {
      powerSupply: basePsuOff,
      multimeter: dmmCan,
      multimeterReading: solLab07.multimeterReading,
      nodeVoltages: solLab07.nodeVoltages,
      faults: [],
      wires: lab07Wires,
    });
    assert.equal(evalLab07.status, 'FAULT_CONFIRMED', `LAB-07 Step 1 expected FAULT_CONFIRMED, got ${evalLab07.status} (${solLab07.multimeterReading.display} ${solLab07.multimeterReading.unit})`);

    // LAB-12: Cold Diode Drop MOSFET Gate Driver Short (Pin 7 healthy ~0.62V, Pin 11 shorted < 0.05V)
    const lab12 = getUniversityLabModuleById('univ-l3-12-mosfet-cold-diode-drop');
    assert.ok(lab12, 'LAB-12 must exist');
    const lab12Faults = [
      {
        id: 'fault-ign-short',
        pinId: 'ecu-pin-11',
        faultType: 'SHORT_TO_GND' as const,
        description: 'Ignition Driver #1 MOSFET Drain-Source Short to Ground',
        isActive: true,
        timestamp: 1_775_974_500_000,
      },
    ];
    const dmmDiodeHealthy = {
      mode: 'DIODE' as const,
      isPowered: true,
      rangeAuto: true,
      holdValue: false,
      redProbe: { color: 'red' as const, attachedToPinId: 'ecu-pin-7', attachedLabel: 'TPS_SIG' },
      blackProbe: { color: 'black' as const, attachedToPinId: 'chassis-gnd', attachedLabel: 'GND' },
    };
    const solLab12S1 = solveCircuit(
      basePsuOff,
      DEFAULT_ECU_PINS,
      lab12Faults,
      DEFAULT_WIRES,
      DEFAULT_BENCH_COMPONENTS,
      dmmDiodeHealthy
    );
    const evalLab12S1 = evaluateUniversityLabStep(lab12.steps[0], {
      powerSupply: basePsuOff,
      multimeter: dmmDiodeHealthy,
      multimeterReading: solLab12S1.multimeterReading,
      nodeVoltages: solLab12S1.nodeVoltages,
      faults: lab12Faults,
      wires: DEFAULT_WIRES,
    });
    assert.equal(evalLab12S1.status, 'PASSED', `LAB-12 Step 1 expected PASSED, got ${evalLab12S1.status} (${solLab12S1.multimeterReading.display} ${solLab12S1.multimeterReading.unit})`);

    const dmmDiodeShort = {
      mode: 'DIODE' as const,
      isPowered: true,
      rangeAuto: true,
      holdValue: false,
      redProbe: { color: 'red' as const, attachedToPinId: 'ecu-pin-11', attachedLabel: 'IGN_1' },
      blackProbe: { color: 'black' as const, attachedToPinId: 'chassis-gnd', attachedLabel: 'GND' },
    };
    const solLab12S2 = solveCircuit(
      basePsuOff,
      DEFAULT_ECU_PINS,
      lab12Faults,
      DEFAULT_WIRES,
      DEFAULT_BENCH_COMPONENTS,
      dmmDiodeShort
    );
    const evalLab12S2 = evaluateUniversityLabStep(lab12.steps[1], {
      powerSupply: basePsuOff,
      multimeter: dmmDiodeShort,
      multimeterReading: solLab12S2.multimeterReading,
      nodeVoltages: solLab12S2.nodeVoltages,
      faults: lab12Faults,
      wires: DEFAULT_WIRES,
    });
    assert.equal(evalLab12S2.status, 'FAULT_CONFIRMED', `LAB-12 Step 2 expected FAULT_CONFIRMED, got ${evalLab12S2.status} (${solLab12S2.multimeterReading.display} ${solLab12S2.multimeterReading.unit})`);
  });

  await runTest('University Lab Offline SHA-256 stamp signs canonically, catches any tampered field, sanitizes input, and generates A4 PDF cleanly without browser DOM', async () => {
    assert.equal(sanitizeInstitutionalText('  Juan\n\r\tDela\x00Cruz  ', 40), 'Juan Dela Cruz');
    assert.equal(sanitizeInstitutionalText('A'.repeat(200), 60).length, 60);

    const incomplete = validateStudentForm({
      firstName: '',
      lastName: 'Dela Cruz',
      studentAccountCode: '1',
      universityCampus: '',
      labTerminal: '',
      studentConclusion: 'ok',
    });
    assert.equal(incomplete.valid, false);
    assert.ok(incomplete.missingFields.length >= 4);

    const lab04 = getUniversityLabModuleById('univ-l1-04-tps-low-p0122')!;
    const student = {
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      studentAccountCode: 'BSAT-2026-041',
      universityCampus: 'Technological Institute of Automotive Engineering',
      labTerminal: 'Lab Station #04 (Desktop-Bench)',
      studentConclusion:
        'Open circuit natuklasan sa TPS signal harness wire-2 habang normal ang 5.00V VREF at 0.35 ohm SGND. Repair: i-repair o palitan ang TPS signal wire at i-clear ang DTC P0122.',
    };
    const psu = {
      voltageSetting: 12.6,
      currentLimit: 5.0,
      isOutputEnabled: true,
      actualVoltage: 12.6,
      actualCurrent: 0.45,
      isCurrentLimiting: false,
      preset: '12V_BENCH' as const,
    };
    const capturedSteps = [
      {
        stepId: 'l1-04-s1',
        stepNumber: 1,
        titleTaglish: 'STEP 1: Cold Ground Continuity Check (PSU OFF)',
        probeSetupLabel: 'Red: Pin 6 (SGND) -> Black: Chassis Ground (GND)',
        dmmMode: 'RESISTANCE' as const,
        psuEnabled: false,
        psuVoltage: 0,
        measuredDisplay: '0.35',
        measuredUnit: 'Ω',
        measuredNumeric: 0.35,
        expectedCriteria: '0.00 Ω – 1.50 Ω',
        status: 'PASSED' as const,
        capturedAtIso: '2026-04-12T06:20:00.000Z',
      },
      {
        stepId: 'l1-04-s3',
        stepNumber: 3,
        titleTaglish: 'STEP 3: TPS Signal Input Voltage Drop Test (Pin 7)',
        probeSetupLabel: 'Red: Pin 7 (TPS_SIG) -> Black: Chassis Ground (GND)',
        dmmMode: 'V_DC' as const,
        psuEnabled: true,
        psuVoltage: 12.6,
        measuredDisplay: '0.00',
        measuredUnit: 'V',
        measuredNumeric: 0,
        expectedCriteria: 'Fault Confirmed < 0.25V',
        status: 'FAULT_CONFIRMED' as const,
        capturedAtIso: '2026-04-12T06:22:00.000Z',
      },
    ];

    const envelope = await buildSignedLabReportEnvelope({
      student,
      boundSessionRef: 'PIN-LOCAL-TRIAL',
      module: lab04,
      powerSupply: psu,
      supplyCurrentDrawAmps: 0.45,
      faults: [],
      wires: DEFAULT_WIRES.map((w) => (w.id === 'wire-2' ? { ...w, isCut: true } : w)),
      activeDTCs: [
        {
          code: 'P0122',
          description: 'Throttle Position Sensor A Circuit Low Input',
          system: 'Fuel & Air Metering (TPS)',
          severity: 'CRITICAL',
          status: 'ACTIVE',
          associatedPinIds: ['ecu-pin-7'],
        },
      ],
      capturedSteps,
      waveformDigest: 'MNA-deadbeef01234567',
      generatedAtIso: '2026-04-12T06:25:00.000Z',
    });

    assert.match(envelope.sha256Hash, /^[a-f0-9]{64}$/);
    assert.equal(envelope.qrToken.startsWith('AELP1|'), true);
    assert.equal(envelope.payload.measurementProvenance, 'SIMULATED_BENCH_WORKSTATION');
    assert.equal(envelope.payload.verificationMode, 'OFFLINE_SHA256_WORKSTATION');

    // 1. Genuine token passes offline SHA-256 verification
    const genuineResult = await verifyOfflineLabReportToken(envelope.qrToken);
    assert.equal(genuineResult.valid, true);
    assert.equal(genuineResult.status, 'GENUINE');
    assert.equal(genuineResult.computedHash, envelope.sha256Hash);
    assert.equal(genuineResult.payload?.student.lastName, 'Dela Cruz');

    // 2. Tampering with student name inside token without recomputing hash MUST fail as TAMPERED
    const rawBody = envelope.qrToken.slice('AELP1|'.length);
    const decodedJson = JSON.parse(
      Buffer.from(rawBody.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    ) as { p: typeof envelope.payload; h: string };
    decodedJson.p.student.firstName = 'Pedro';
    const tamperedB64 = Buffer.from(JSON.stringify(decodedJson), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    const tamperedResult = await verifyOfflineLabReportToken(`AELP1|${tamperedB64}`);
    assert.equal(tamperedResult.valid, false);
    assert.equal(tamperedResult.status, 'TAMPERED');

    // 3. Garbage token returns INVALID_FORMAT
    const invalidResult = await verifyOfflineLabReportToken('NOT-A-VALID-TOKEN');
    assert.equal(invalidResult.valid, false);
    assert.equal(invalidResult.status, 'INVALID_FORMAT');

    // 4. Direct A4 PDF generation runs cleanly in headless Node test environment
    const pdfOut = await generateAndDownloadUniversityLabPdf({
      student,
      boundSessionRef: 'PIN-LOCAL-TRIAL',
      module: lab04,
      powerSupply: psu,
      supplyCurrentDrawAmps: 0.45,
      faults: [],
      wires: DEFAULT_WIRES.map((w) => (w.id === 'wire-2' ? { ...w, isCut: true } : w)),
      activeDTCs: [],
      capturedSteps,
      rpm: 850,
      ckpSignalLost: false,
      tpsVoltage: 0.0,
      skipBrowserDownload: true,
    });
    assert.equal(pdfOut.filename.startsWith('AutoElectricLab-LAB-04-BSAT-2026-041-'), true);
    assert.equal(pdfOut.filename.endsWith('.pdf'), true);
    const verifiedPdfToken = await verifyOfflineLabReportToken(pdfOut.envelope.qrToken);
    assert.equal(verifiedPdfToken.valid, true);
    assert.equal(verifiedPdfToken.status, 'GENUINE');
  });

  await runTest('Fault Builder sequences persist to durable IndexedDB cache, queue offline mutations/tombstones cleanly, and migrate legacy localStorage records', async () => {
    await resetOfflineQueueForTests();
    resetFaultSequenceStoreForTests();

    const samplePreset = BUILT_IN_FAULT_SEQUENCES[3] ?? BUILT_IN_FAULT_SEQUENCES[0];

    // 1. Legacy localStorage -> durable store migration (when window.localStorage is shimmed or in-memory store is populated)
    const { saved: legacySeq } = saveCustomFaultSequence({
      ...samplePreset,
      id: 'legacy-seq-001',
      title: 'Legacy Local Drill',
      isBuiltInPreset: false,
    });
    assert.equal(legacySeq.id, 'legacy-seq-001');
    const migratedCount = await migrateLegacyLocalFaultSequencesToStore(LOCAL_WORKSTATION_UID);
    assert.equal(migratedCount, 1);

    const localDocsAfterMigration = await getLocalCachedDocuments<Record<string, unknown>>(
      LOCAL_WORKSTATION_UID,
      'faultSequences'
    );
    assert.equal(localDocsAfterMigration.some((d) => d.docId === toSafeFirestoreDocId('legacy-seq-001', 'fseq', 0)), true);

    // 2. Local workstation save -> subscribe -> delete round-trip
    const savedLocal = await saveFaultSequence(LOCAL_WORKSTATION_UID, {
      ...samplePreset,
      id: 'bench_custom_25ms',
      title: 'Sub-150ms Pin 7 Chatter',
      isBuiltInPreset: false,
    });
    assert.equal(savedLocal.sequence.syncState, 'LOCAL_ONLY');

    let observedLocal: unknown[] = [];
    const unsubLocal = subscribeFaultSequences(LOCAL_WORKSTATION_UID, (list) => {
      observedLocal = list;
    });
    await new Promise((r) => setTimeout(r, 25));
    unsubLocal();
    assert.equal(
      mergeFaultSequencesWithBuiltIns(observedLocal as typeof BUILT_IN_FAULT_SEQUENCES).some(
        (s) => s.title === 'Sub-150ms Pin 7 Chatter'
      ),
      true
    );

    await deleteFaultSequence(LOCAL_WORKSTATION_UID, savedLocal.id);
    const localAfterDelete = await getLocalCachedDocuments<Record<string, unknown>>(
      LOCAL_WORKSTATION_UID,
      'faultSequences'
    );
    assert.equal(localAfterDelete.some((d) => d.docId === savedLocal.id), false);

    // 3. Authenticated offline UID save -> QUEUED_OFFLINE -> offline delete tombstone (_deleted: true) filtered from subscription
    const authUid = 'uid_fault_sync_tech';
    const queuedSave = await saveFaultSequence(authUid, {
      ...samplePreset,
      id: 'cloud_custom_chatter',
      title: 'Cloud Chatter Drill',
      isBuiltInPreset: false,
    });
    assert.equal(queuedSave.queuedOffline, true);
    assert.equal(queuedSave.sequence.syncState, 'QUEUED_OFFLINE');

    let authObservedBeforeDelete: Array<{ id: string; syncState?: string }> = [];
    const unsubAuth1 = subscribeFaultSequences(authUid, (list) => {
      authObservedBeforeDelete = list;
    });
    await new Promise((r) => setTimeout(r, 25));
    unsubAuth1();
    assert.equal(
      authObservedBeforeDelete.some(
        (s) => s.id === queuedSave.id && s.syncState === 'QUEUED_OFFLINE'
      ),
      true
    );

    const queuedDel = await deleteFaultSequence(authUid, queuedSave.id);
    assert.equal(queuedDel.queuedOffline, true);

    let authObservedAfterDelete: Array<{ id: string }> = [{ id: 'sentinel' }];
    const unsubAuth2 = subscribeFaultSequences(authUid, (list) => {
      authObservedAfterDelete = list;
    });
    await new Promise((r) => setTimeout(r, 25));
    unsubAuth2();
    assert.equal(
      authObservedAfterDelete.some((s) => s.id === queuedSave.id),
      false,
      'Tombstoned _deleted sequence must not appear in subscription before flush'
    );

    const pendingMutations = await getPendingMutations(authUid);
    assert.equal(
      pendingMutations.some(
        (m) =>
          m.collection === 'faultSequences' &&
          m.docId === queuedSave.id &&
          (m.payload as { _deleted?: boolean })._deleted === true
      ),
      true
    );

    // Ensure custom storage key constant remains intact for migration checks
    assert.equal(CUSTOM_FAULT_SEQUENCES_STORAGE_KEY, 'autoelectric_fault_builder_sequences_v1');

    resetFaultSequenceStoreForTests();
    await resetOfflineQueueForTests();
  });

  await runTest('Fault Builder [Conflict Copy] OCC respects 100-char firestore.rules title cap, promotes local_workstation drills idempotently, and cleans up _deleted tombstones on flush', async () => {
    await resetOfflineQueueForTests();
    resetFaultSequenceStoreForTests();

    const samplePreset = BUILT_IN_FAULT_SEQUENCES[2] ?? BUILT_IN_FAULT_SEQUENCES[0];

    // 1. Conflict Copy title formatting clamps strictly to <= 100 chars and does not double suffix
    const longTitle = 'Extremely Long Multi-Stage Bosch EDC17 Intermittent Sensor + Corrosion Buildup Sequence Name Over 100 Chars';
    const conflictTitle = formatFaultSequenceConflictCopyTitle(longTitle);
    assert.ok(conflictTitle.length <= 100, `Conflict title exceeded 100 chars (${conflictTitle.length})`);
    assert.equal(conflictTitle.endsWith(' [Conflict Copy]'), true);
    assert.equal(formatFaultSequenceConflictCopyTitle(conflictTitle), conflictTitle);

    const conflictSeq = buildConflictCopyFaultSequence('uid_tech_occ', 'fseq_conflict_1', {
      ...samplePreset,
      id: 'fseq_orig_1',
      title: longTitle,
      isBuiltInPreset: false,
    });
    assert.equal(conflictSeq.id, 'fseq_conflict_1');
    assert.equal(conflictSeq.ownerId, 'uid_tech_occ');
    assert.equal(conflictSeq.schemaVersion, SCHEMA_VERSION_SUBCOLLECTIONS);
    assert.ok(conflictSeq.title.length <= 100);
    assert.equal(hasRemoteSessionConflict(1_000_000, 1_005_000), true);
    assert.equal(hasRemoteSessionConflict(1_005_000, 1_005_000), false);

    // 2. Non-destructive concurrent/idempotent promotion from local_workstation -> authenticated UID
    const localSaved = await saveFaultSequence(LOCAL_WORKSTATION_UID, {
      ...samplePreset,
      id: 'local_drill_promote',
      title: 'Offline Bench Injector Drill',
      isBuiltInPreset: false,
    });
    assert.equal(await countLocalWorkstationFaultSequences(), 1);

    const authUid = 'uid_promoted_user';
    const [p1, p2] = await Promise.all([
      promoteLocalWorkstationFaultSequencesToUser(authUid),
      promoteLocalWorkstationFaultSequencesToUser(authUid),
    ]);
    assert.equal(p1 + p2, 1, 'Concurrent login promotions must promote exactly once');
    assert.equal(await promoteLocalWorkstationFaultSequencesToUser(authUid), 0, 'Repeat promotion must be idempotent');

    const localRemaining = await getLocalCachedDocuments<Record<string, unknown>>(
      LOCAL_WORKSTATION_UID,
      'faultSequences'
    );
    const userPromotedDocs = await getLocalCachedDocuments<Record<string, unknown>>(
      authUid,
      'faultSequences'
    );
    assert.equal(localRemaining.some((d) => d.docId === localSaved.id), true, 'Local workstation drill must be preserved');
    assert.equal(userPromotedDocs.some((d) => d.docId === localSaved.id), true, 'User library must receive promoted drill');

    // 3. markMutationSynced with _deleted tombstone deletes STORE_CACHE record rather than leaving stale tombstones
    await deleteFaultSequence(authUid, localSaved.id);
    const stampedDelete = reserveMutationStamp(authUid, 'faultSequences', localSaved.id);
    await enqueueOfflineMutation({
      uid: authUid,
      collection: 'faultSequences',
      docId: localSaved.id,
      payload: { _deleted: true, id: localSaved.id },
      version: stampedDelete.version,
      updatedAtMs: stampedDelete.updatedAtMs,
    });
    await flushOfflineMutations(authUid, async () => undefined);
    const userDocsAfterFlush = await getLocalCachedDocuments<Record<string, unknown>>(
      authUid,
      'faultSequences'
    );
    assert.equal(userDocsAfterFlush.some((d) => d.docId === localSaved.id), false);

    resetFaultSequenceStoreForTests();
    await resetOfflineQueueForTests();
  });

  await runTest('Google Auth diagnostics include preview hostname and NavigationDrawer surfaces authError alongside verified rules parity', async () => {
    const unauthorizedMsg = formatFirebaseAuthError(
      { code: 'auth/unauthorized-domain' },
      'ais-pre-example.asia-southeast1.run.app'
    );
    assert.ok(unauthorizedMsg.includes('ais-pre-example.asia-southeast1.run.app'));
    assert.ok(formatFirebaseAuthError({ code: 'auth/operation-not-allowed' }).includes('Google Sign-In provider'));
    assert.ok(formatFirebaseAuthError({ code: 'auth/cancelled-popup-request' }).includes('superseded'));
    assert.ok(formatFirebaseAuthError({ code: 'auth/popup-blocked' }).includes('popups'));

    const navDrawerSource = fs.readFileSync(
      path.join(process.cwd(), 'src/components/NavigationDrawer.tsx'),
      'utf8'
    );
    assert.ok(navDrawerSource.includes('authError'), 'NavigationDrawer must read authError from useAuth');
    assert.ok(navDrawerSource.includes('role="alert"'), 'NavigationDrawer must render visible role="alert" for auth/sync errors');

    const rulesSource = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');
    const blueprintRaw = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'firebase-blueprint.json'), 'utf8')
    ) as { firestore: Record<string, unknown> };
    assert.ok(rulesSource.includes('match /faultSequences/{sequenceId}'));
    assert.ok(rulesSource.includes('data.title.size() <= 100'));
    assert.ok('/users/{userId}/faultSequences/{sequenceId}' in blueprintRaw.firestore);
    assert.ok('/users/{userId}/faultSequences/{sequenceId}/stages/{stageId}' in blueprintRaw.firestore);
    assert.ok('/users/{userId}/faultSequences/{sequenceId}/items/{itemId}' in blueprintRaw.firestore);
  });

  await runTest('src/services/ai/QuotaManager.ts loads .env.example multi-key rotation, skips placeholders, switches before limits, and never leaks raw secrets', () => {
    assert.equal(isServerQuotaRuntime(), true);

    const envKeys = loadApiKeysFromEnv(
      {
        GEMINI_API_KEY: 'MY_GEMINI_API_KEY',
        GEMINI_API_KEY_2: 'test-key-alpha-1111',
        GEMINI_API_KEY_3: 'test-key-beta-2222',
        GEMINI_API_KEYS: 'YOUR_API_KEY, test-key-gamma-3333 , test-key-alpha-1111',
        GEMINI_KEY_RPM_LIMIT: '5',
        OPENAI_API_KEY: 'sk-test-vision-9999',
        OPENAI_MODEL: 'gpt-4o-mini',
      },
      { includeOpenAiVisionKey: true }
    );

    // MY_GEMINI_API_KEY and YOUR_API_KEY must be ignored, duplicate test-key-alpha-1111 deduplicated
    assert.equal(envKeys.length, 4);
    assert.deepEqual(
      envKeys.map((k) => k.apiKey),
      ['test-key-alpha-1111', 'test-key-beta-2222', 'test-key-gamma-3333', 'sk-test-vision-9999']
    );
    assert.equal(envKeys[3].provider, 'openai');

    const qm = createQuotaManagerFromEnv({
      GEMINI_API_KEY: 'rot-key-one-aaaa',
      GEMINI_API_KEY_2: 'rot-key-two-bbbb',
      GEMINI_API_KEY_3: 'rot-key-three-cccc',
      GEMINI_KEY_RPM_LIMIT: '5',
      GEMINI_QUOTA_SWITCH_RATIO: '0.8',
    });

    const t0 = 1_760_000_000_000;
    const plan1 = qm.acquirePlan('gemini-4-hydrogen', ['gemini-3.1-flash-lite'], t0);
    assert.ok(plan1.selected);
    const firstKeyId = plan1.selected.keyId;

    // Record 4 requests (80% of RPM limit 5) to trigger proactive rotation to the next key
    for (let i = 0; i < 4; i += 1) {
      qm.recordAttemptStart({
        keyId: firstKeyId,
        endpointId: 'gemini-4-hydrogen',
        nowMs: t0 + i * 100,
      });
    }
    const plan2 = qm.acquirePlan('gemini-4-hydrogen', ['gemini-3.1-flash-lite'], t0 + 500);
    assert.ok(plan2.selected);
    assert.notEqual(
      plan2.selected.keyId,
      firstKeyId,
      'QuotaManager must proactively rotate to next available key when approaching 80% threshold'
    );

    // 401 failure on the rotated key isolates only that key and routes to the 3rd key
    const secondKeyId = plan2.selected.keyId;
    qm.recordFailure(
      { keyId: secondKeyId, endpointId: 'gemini-4-hydrogen' },
      { category: 'UNAUTHENTICATED', statusCode: 401 },
      t0 + 600
    );
    const plan3 = qm.acquirePlan('gemini-4-hydrogen', ['gemini-3.1-flash-lite'], t0 + 700);
    assert.ok(plan3.selected);
    assert.notEqual(plan3.selected.keyId, secondKeyId);

    // Snapshots must never contain raw API key strings
    const snapJson = JSON.stringify(
      qm.getSnapshot(['gemini-4-hydrogen', 'gemini-3.1-flash-lite'], t0 + 800)
    );
    assert.equal(snapJson.includes('rot-key-one-aaaa'), false);
    assert.equal(snapJson.includes('rot-key-two-bbbb'), false);
    assert.equal(snapJson.includes('rot-key-three-cccc'), false);

    // TIMEOUT on a (key, gemini-4-hydrogen) pair immediately cools down that pair so the next acquirePlan skips it
    const timeoutPlanBefore = qm.acquirePlan('gemini-4-hydrogen', ['gemini-3.1-flash-lite'], t0 + 900);
    assert.ok(timeoutPlanBefore.selected);
    const timedOutPair = timeoutPlanBefore.selected;
    const timeoutCooldownSec = qm.recordFailure(
      { keyId: timedOutPair.keyId, endpointId: timedOutPair.endpointId },
      { category: 'TIMEOUT', statusCode: 504 },
      t0 + 950
    );
    assert.ok(timeoutCooldownSec >= 10, 'TIMEOUT must apply an immediate brief cooldown');
    const timeoutPlanAfter = qm.acquirePlan('gemini-4-hydrogen', ['gemini-3.1-flash-lite'], t0 + 1000);
    assert.ok(timeoutPlanAfter.selected);
    assert.ok(
      timeoutPlanAfter.selected.keyId !== timedOutPair.keyId ||
        timeoutPlanAfter.selected.endpointId !== timedOutPair.endpointId,
      'Next acquirePlan must skip the timed-out (key, model) pair and route to a healthy candidate'
    );

    const sharedStatus = getSanitizedQuotaStatus(t0 + 800);
    assert.equal(typeof sharedStatus.switchThresholdRatio, 'number');
  });

  await runTest('Firebase auth/unauthorized-domain recovery emits exact hostname + validated Console URL and wires PIN autofill + Copy Domain UI', () => {
    assert.equal(
      buildFirebaseAuthorizedDomainsConsoleUrl('gen-lang-client-0979131562'),
      'https://console.firebase.google.com/project/gen-lang-client-0979131562/authentication/settings'
    );
    assert.equal(
      buildFirebaseAuthorizedDomainsConsoleUrl('bad/project?evil=1'),
      null,
      'Invalid Firebase project IDs must be rejected before constructing external Console URLs'
    );

    const details = formatFirebaseAuthErrorDetails(
      { code: 'auth/unauthorized-domain' },
      'ais-dev-35pdrdt3cnp7dfv62o3vcs-490665088557.asia-southeast1.run.app',
      'gen-lang-client-0979131562'
    );
    assert.equal(details.code, 'auth/unauthorized-domain');
    assert.equal(
      details.hostname,
      'ais-dev-35pdrdt3cnp7dfv62o3vcs-490665088557.asia-southeast1.run.app'
    );
    assert.equal(
      details.consoleAuthorizedDomainsUrl,
      'https://console.firebase.google.com/project/gen-lang-client-0979131562/authentication/settings'
    );
    assert.ok(details.message.includes('ais-dev-35pdrdt3cnp7dfv62o3vcs-490665088557.asia-southeast1.run.app'));

    const landingSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/IntroductionPinLandingPage.tsx'),
      'utf8'
    );
    assert.ok(landingSrc.includes('data-testid="unauthorized-domain-recovery"'));
    assert.ok(landingSrc.includes('data-testid="copy-unauthorized-domain-btn"'));
    assert.ok(landingSrc.includes('rel="noopener noreferrer"'));
    assert.ok(landingSrc.includes('autoComplete="one-time-code"'));

    const navDrawerSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/NavigationDrawer.tsx'),
      'utf8'
    );
    assert.ok(navDrawerSrc.includes('authErrorDetails'));
    assert.ok(navDrawerSrc.includes('Copy Domain'));
    assert.ok(navDrawerSrc.includes('rel="noopener noreferrer"'));
  });

  await runTest('All primary TypeScript source files under src/ include the compact SPDX MIT license header', () => {
    const missing: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          const head = fs.readFileSync(full, 'utf8').split(/\r?\n/).slice(0, 12).join('\n');
          if (
            !head.includes('SPDX-License-Identifier: MIT') ||
            !head.includes('2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations')
          ) {
            missing.push(path.relative(process.cwd(), full));
          }
        }
      }
    };
    walk(path.join(process.cwd(), 'src'));
    assert.deepEqual(
      missing,
      [],
      `Expected SPDX MIT header in all src/**/*.ts(x) files, missing in: ${missing.join(', ')}`
    );
  });

  await runTest('Full audit safeguards: strict external http(s) URLs, Live Voice WS Origin check, in-memory lease tokens, rate limits, and sanitized upstream errors', () => {
    // 1. Strict external http(s) URL sanitizer blocks javascript:/data:/vbscript:/malformed links
    assert.equal(
      toSafeExternalHttpUrl('https://docs.example.com/manual?page=12#pinout'),
      'https://docs.example.com/manual?page=12#pinout'
    );
    assert.equal(
      toSafeExternalHttpUrl('http://localhost:3000/bench'),
      'http://localhost:3000/bench'
    );
    assert.equal(toSafeExternalHttpUrl('javascript:alert(document.cookie)'), null);
    assert.equal(toSafeExternalHttpUrl('JAVASCRIPT:void(0)'), null);
    assert.equal(toSafeExternalHttpUrl('data:text/html,<script>alert(1)</script>'), null);
    assert.equal(toSafeExternalHttpUrl('vbscript:msgbox(1)'), null);
    assert.equal(toSafeExternalHttpUrl('http:javascript:alert(1)'), null);
    assert.equal(toSafeExternalHttpUrl('https://example.com/\x00evil'), null);
    assert.equal(toSafeExternalHttpUrl(`https://example.com/${'a'.repeat(5000)}`), null);
    assert.equal(toSafeExternalHttpUrl(''), null);
    assert.equal(toSafeExternalHttpUrl(undefined), null);

    // 2. Live Voice WebSocket Origin validator allows same-host & proxy-forwarded origins and rejects cross-site origins
    assert.equal(
      isAllowedLiveVoiceOrigin(
        'https://ais-dev-35pdrdt3cnp7dfv62o3vcs-490665088557.asia-southeast1.run.app',
        '127.0.0.1:3000',
        'ais-dev-35pdrdt3cnp7dfv62o3vcs-490665088557.asia-southeast1.run.app'
      ),
      true
    );
    assert.equal(
      isAllowedLiveVoiceOrigin('http://localhost:3000', '127.0.0.1:3000'),
      true
    );
    assert.equal(
      isAllowedLiveVoiceOrigin(undefined, '127.0.0.1:3000'),
      true
    );
    assert.equal(
      isAllowedLiveVoiceOrigin(
        'https://attacker.example',
        '127.0.0.1:3000',
        'ais-dev-35pdrdt3cnp7dfv62o3vcs-490665088557.asia-southeast1.run.app'
      ),
      false
    );
    assert.equal(isAllowedLiveVoiceOrigin('null', 'localhost:3000'), false);
    assert.equal(isAllowedLiveVoiceOrigin('file:///tmp/evil.html', 'localhost:3000'), false);

    // 3. Offline lease token stays in memory and never writes to localStorage
    let localStorageSetCalled = false;
    let localStorageRemovedKey: string | null = null;
    const prevWindow = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = {
      localStorage: {
        setItem: () => {
          localStorageSetCalled = true;
        },
        removeItem: (k: string) => {
          localStorageRemovedKey = k;
        },
        getItem: () => null,
      },
    };
    try {
      saveOfflineLeaseToken('lease_payload.lease_sig');
      assert.equal(getSavedOfflineLeaseToken(), 'lease_payload.lease_sig');
      assert.equal(localStorageSetCalled, false, 'Offline lease token must never be written to localStorage');
      assert.equal(localStorageRemovedKey, 'vecl_offline_lease_token_v1');
      saveOfflineLeaseToken(null);
      assert.equal(getSavedOfflineLeaseToken(), null);
    } finally {
      if (prevWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window;
      } else {
        (globalThis as Record<string, unknown>).window = prevWindow;
      }
    }

    // 4. Server route rate-limiting & sanitized error wiring checks
    const apiAppSrc = fs.readFileSync(path.join(process.cwd(), 'src/server/createApiApp.ts'), 'utf8');
    assert.ok(apiAppSrc.includes('TRIAL_STATUS_RATE_LIMITED'));
    assert.ok(apiAppSrc.includes('admin-setup:'));
    assert.ok(apiAppSrc.includes('safePath'));

    const openAiSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/server/services/openAIImageAnalysisProvider.ts'),
      'utf8'
    );
    assert.ok(openAiSrc.includes('OpenAI vision upstream returned HTTP ${res.status}.'));
    assert.equal(openAiSrc.includes('${res.status}): ${errText'), false);
  });

  await runTest('Fault Builder IndexedDB optimistic sync re-queues background Firestore failures, auto-retries with backoff, flushes concurrent edits, and drives non-intrusive LabStatusFooter indicator', async () => {
    await resetOfflineQueueForTests();
    resetFaultSequenceStoreForTests();
    cancelScheduledBenchSyncRetries();

    const samplePreset = BUILT_IN_FAULT_SEQUENCES[0];
    const uid = 'uid_fault_retry_audit';

    try {
      // 1. Simulate transient background Firestore failure on 1st attempt -> re-queued in IndexedDB -> auto-retried & recovered on 2nd attempt
      let attemptCount = 0;
      const syncedTitles: string[] = [];
      setBenchSyncExecutorForTests(async (record) => {
        attemptCount += 1;
        if (attemptCount === 1) {
          throw new Error('FirebaseError: [code=unavailable]: Service unavailable');
        }
        syncedTitles.push(String((record.payload as { title?: string }).title || ''));
      }, 35);

      const saved = await saveFaultSequence(uid, {
        ...samplePreset,
        id: 'fseq_retry_test_01',
        title: 'CAN Bus Intermittent Drop',
        isBuiltInPreset: false,
      });

      // Optimistic local save completes immediately as QUEUED_OFFLINE
      assert.equal(saved.queuedOffline, true);
      assert.equal(saved.sequence.syncState, 'QUEUED_OFFLINE');

      // Wait briefly for first background flush failure to settle (before 35ms auto-retry)
      await new Promise((r) => setTimeout(r, 15));
      assert.equal(attemptCount, 1);

      const pendingAfterFirstFail = await getPendingMutations(uid);
      assert.equal(pendingAfterFirstFail.length, 1);
      assert.equal(pendingAfterFirstFail[0].attempts, 1);
      assert.ok(pendingAfterFirstFail[0].nextRetryAtMs > Date.now() - 100);

      const snapAfterTransientFail = getSyncStatusSnapshot();
      assert.equal(snapAfterTransientFail.state, 'OFFLINE_QUEUED');
      assert.equal(snapAfterTransientFail.pendingCount, 1);
      assert.equal(snapAfterTransientFail.failedCount, 1);
      assert.equal(snapAfterTransientFail.pendingCollections.includes('faultSequences'), true);

      const requeuedFooter = describeFooterSyncIndicator(snapAfterTransientFail);
      assert.equal(requeuedFooter.visible, true);
      assert.equal(requeuedFooter.tone, 'REQUEUED');
      assert.equal(requeuedFooter.label, 'Re-queued (1)');
      assert.ok(requeuedFooter.tooltip.includes('Fault Builder'));
      assert.ok(requeuedFooter.tooltip.includes('IndexedDB'));

      // Wait for automatic backoff retry timer to fire and recover cleanly
      await new Promise((r) => setTimeout(r, 90));
      assert.equal(attemptCount, 2, 'Auto-retry timer must automatically retry failed Fault Builder sync');
      assert.deepEqual(syncedTitles, ['CAN Bus Intermittent Drop']);

      const snapAfterAutoRecovery = getSyncStatusSnapshot();
      assert.equal(snapAfterAutoRecovery.state, 'IDLE');
      assert.equal(snapAfterAutoRecovery.pendingCount, 0);
      assert.equal(snapAfterAutoRecovery.failedCount, 0);
      assert.equal(describeFooterSyncIndicator(snapAfterAutoRecovery).visible, false);

      // 2. Concurrent rapid second optimistic edit during an in-flight flush must trigger automatic follow-up flush (never stranded)
      const uploadedOrder: string[] = [];
      const firstFlightGate: { release: (() => void) | null } = { release: null };
      setBenchSyncExecutorForTests(async (record) => {
        const title = String((record.payload as { title?: string }).title || '');
        if (title === 'Rapid Edit V1') {
          await new Promise<void>((resolve) => {
            firstFlightGate.release = resolve;
          });
        }
        uploadedOrder.push(title);
      }, 5000);

      await saveFaultSequence(uid, {
        ...samplePreset,
        id: 'fseq_rapid_edit',
        title: 'Rapid Edit V1',
        isBuiltInPreset: false,
      });
      await new Promise((r) => setTimeout(r, 10));
      // Enqueue V2 while V1 is still in-flight
      await saveFaultSequence(uid, {
        ...samplePreset,
        id: 'fseq_rapid_edit',
        title: 'Rapid Edit V2',
        isBuiltInPreset: false,
      });
      // Release V1; follow-up flush must automatically pick up V2
      firstFlightGate.release?.();
      await new Promise((r) => setTimeout(r, 40));

      assert.deepEqual(uploadedOrder, ['Rapid Edit V1', 'Rapid Edit V2']);
      assert.equal((await getPendingMutations(uid)).length, 0);

      // 3. Non-transient Firestore failure preserves lastError even when a sibling item succeeds in the same batch,
      //    and LabStatusFooter renders sanitized non-intrusive Sync Retry indicator (no raw JSON dump)
      setBenchSyncExecutorForTests(async (record) => {
        if (record.docId === 'fseq_perm_fail') {
          throw new Error(
            JSON.stringify({
              error: 'Missing or insufficient permissions.',
              operationType: 'write',
              path: `users/${uid}/faultSequences/fseq_perm_fail`,
              authInfo: { userId: uid },
            })
          );
        }
      }, 60_000);

      await enqueueOfflineMutation({
        uid,
        collection: 'faultSequences',
        docId: 'fseq_perm_fail',
        payload: { ...samplePreset, id: 'fseq_perm_fail', title: 'Perm Fail Drill' },
      });
      await enqueueOfflineMutation({
        uid,
        collection: 'faultSequences',
        docId: 'fseq_sibling_ok',
        payload: { ...samplePreset, id: 'fseq_sibling_ok', title: 'Sibling Success Drill' },
      });

      const mixedBatch = await flushQueuedBenchSync(uid, true);
      assert.equal(mixedBatch.failed, 1);
      assert.equal(mixedBatch.synced, 1);
      assert.equal(mixedBatch.remaining, 1);

      const errorSnap = getSyncStatusSnapshot();
      assert.equal(errorSnap.state, 'ERROR');
      assert.equal(errorSnap.pendingCount, 1);
      assert.equal(errorSnap.failedCount, 1);
      assert.ok(errorSnap.lastError?.includes('Missing or insufficient permissions.'));

      const errorFooter = describeFooterSyncIndicator(errorSnap);
      assert.equal(errorFooter.visible, true);
      assert.equal(errorFooter.tone, 'ERROR');
      assert.equal(errorFooter.label, 'Sync Retry (1)');
      assert.equal(errorFooter.tooltip.includes('{"error"'), false, 'Footer tooltip must never expose raw JSON');
      assert.ok(errorFooter.tooltip.includes('Missing or insufficient permissions.'));

      // Verify LabStatusFooter markup includes accessible non-intrusive status semantics
      const footerSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/LabStatusFooter.tsx'), 'utf8');
      assert.ok(footerSrc.includes('data-testid="footer-sync-status-btn"'));
      assert.ok(footerSrc.includes('role="status"'));
      assert.ok(footerSrc.includes('aria-live="polite"'));
      assert.ok(footerSrc.includes('describeFooterSyncIndicator'));
    } finally {
      setBenchSyncExecutorForTests(null);
      cancelScheduledBenchSyncRetries();
      resetFaultSequenceStoreForTests();
      await resetOfflineQueueForTests();
    }
  });

  // -------------------------------------------------------------------------
  // Oscilloscope Diagnostic Lab-Bench Transient Zoom Engine Verification
  // -------------------------------------------------------------------------
  await runTest('Oscilloscope zoom engine clamps magnification, preserves cursor anchors, supports drag-box transient selection, and formats sub-millisecond scales', () => {
    assert.equal(isScopeZoomed(DEFAULT_SCOPE_ZOOM), false);

    // Clamping bounds (H: 1x-50x, V: 1x-10x, pan clamped within remaining window)
    const clampedHigh = clampScopeZoom({ zoomX: 999, panX: 0.999, zoomY: 25, panY: 5 });
    assert.equal(clampedHigh.zoomX, 50);
    assert.equal(clampedHigh.zoomY, 10);
    assert.ok(Math.abs(clampedHigh.panX - 0.98) < 1e-5, `panX max at 50x should be 0.98, got ${clampedHigh.panX}`);
    assert.ok(Math.abs(clampedHigh.panY - 0.45) < 1e-5, `panY max at 10x should be 0.45, got ${clampedHigh.panY}`);
    assert.equal(isScopeZoomed(clampedHigh), true);

    const clampedReset = clampScopeZoom({ zoomX: 0.2, panX: 0.5, zoomY: 0.5, panY: -0.3 });
    assert.deepEqual(clampedReset, DEFAULT_SCOPE_ZOOM);

    // Cursor-anchored horizontal zoom keeps the signal feature under cursor fixed
    const anchor = 0.25;
    const zoomed4x = zoomHorizontalAtAnchor(DEFAULT_SCOPE_ZOOM, 4, anchor);
    assert.equal(zoomed4x.zoomX, 4);
    const globalAtAnchor = zoomed4x.panX + anchor * (1 / zoomed4x.zoomX);
    assert.ok(Math.abs(globalAtAnchor - 0.25) < 1e-5, `Anchor feature drifted: ${globalAtAnchor}`);

    // Drag-box region zoom around a narrow 0.4ms injector flyback spike in a 40ms window
    const boxZoom = zoomToSelectionRange(DEFAULT_SCOPE_ZOOM, 0.2, 0.25); // 5% width -> 20x zoom
    assert.equal(boxZoom.zoomX, 20);
    assert.ok(Math.abs(boxZoom.panX - 0.2) < 1e-5);
    const visBox = getVisibleTimeWindowMs(40, boxZoom, 10);
    assert.ok(Math.abs(visBox.startMs - 8.0) < 1e-4);
    assert.ok(Math.abs(visBox.endMs - 10.0) < 1e-4);
    assert.ok(Math.abs(visBox.spanMs - 2.0) < 1e-4);
    assert.ok(Math.abs(visBox.msPerDiv - 0.2) < 1e-4);
    assert.equal(formatScopeTimeUnit(visBox.msPerDiv), '200 µs');
    assert.equal(formatScopeTimeAxisTick(0.45, 0.5), '450µs');
    assert.equal(formatZoomFactor(20), '20×');

    // Micro-click below 2% width is ignored so clicks don't accidentally zoom
    const ignored = zoomToSelectionRange(DEFAULT_SCOPE_ZOOM, 0.4, 0.405);
    assert.deepEqual(ignored, DEFAULT_SCOPE_ZOOM);

    // Lab 1-2-5 detents step cleanly up and down
    const s1 = stepScopeZoomX(DEFAULT_SCOPE_ZOOM, 'in', 0.5);
    assert.equal(s1.zoomX, 1.5);
    const s2 = stepScopeZoomX(s1, 'in', 0.5);
    assert.equal(s2.zoomX, 2);
    const sBack = stepScopeZoomX(s2, 'out', 0.5);
    assert.equal(sBack.zoomX, 1.5);

    // Vertical zoom narrows visible voltage domain around midpoint and shifts with panY
    const vZoom2x = zoomVerticalAtAnchor(DEFAULT_SCOPE_ZOOM, 2, 0.5);
    const [vLo, vHi] = getVisibleVoltageDomain([0, 20], vZoom2x);
    assert.equal(vLo, 5);
    assert.equal(vHi, 15);
    const panned = panScopeViewport(vZoom2x, 0, 0.5);
    const [vLoPan, vHiPan] = getVisibleVoltageDomain([0, 20], panned);
    assert.ok(vLoPan > vLo && vHiPan > vHi, 'Vertical pan should shift zoomed voltage domain');

    const vStep = stepScopeZoomY(DEFAULT_SCOPE_ZOOM, 'in', 0.5);
    assert.equal(vStep.zoomY, 1.5);

    // Minimap pan center jump clamps cleanly
    const centered = setScopePanCenter(boxZoom, 0.5);
    assert.ok(Math.abs(centered.panX - 0.475) < 1e-5);

    // SignalGenerator sub-millisecond transient sampling resolves 400µs injector flyback spike at 50x zoom
    const flybackWindow = SignalGenerator.samplePinWaveformSeries({
      pinId: 'ecu-pin-10',
      pinLabel: 'INJ_1',
      mnaNodeVoltage: 12.6,
      faultType: 'NONE',
      isPowerOn: true,
      isEcuAwake: true,
      hasCanFault: false,
      hasInjectorFault: false,
      isInjectorFiring: true,
      rpm: 1200,
      tStartSec: 0.0024, // right before 2.5ms flyback edge
      windowMs: 0.6, // 600 µs zoomed window
      sampleCount: 120,
    });
    assert.equal(flybackWindow.samples.length, 120);
    const lastSampleMs = flybackWindow.samples[flybackWindow.samples.length - 1].timeMs;
    assert.ok(
      Math.abs(lastSampleMs - 0.6) < 0.02,
      `Sub-millisecond window must not be clamped to 2ms (got ${lastSampleMs}ms)`
    );
    assert.ok(
      flybackWindow.vMax > 50,
      `Zoomed 600µs window must resolve 65V inductive flyback spike (got vMax=${flybackWindow.vMax})`
    );

    // Verify all three oscilloscope views mount OscilloscopeZoomControls
    for (const file of [
      'src/components/Oscilloscope.tsx',
      'src/components/D3OscilloscopeView.tsx',
      'src/components/PinWaveformOscilloscope.tsx',
    ]) {
      const src = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      assert.ok(
        src.includes('OscilloscopeZoomControls'),
        `${file} must render OscilloscopeZoomControls`
      );
      assert.ok(
        src.includes('zoomToSelectionRange'),
        `${file} must support drag-box transient zoom`
      );
    }
  });

  await runTest('adminMasterPinService hashes VECL_ADMIN_MASTER_PIN with scrypt and exclusively gates /api/autoelectric/license/admin/* routes', async () => {
    const prevEnvPin = process.env.VECL_ADMIN_MASTER_PIN;
    const prevStrict = process.env.VECL_STRICT_PRODUCTION_SECRETS;
    const prevAdminUids = process.env.VECL_ADMIN_UIDS;

    resetAdminMasterPinServiceForTests();
    resetLicenseStoreForTests();

    const app = createAutoelectricApiApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Fails closed when VECL_ADMIN_MASTER_PIN is unset
      delete process.env.VECL_ADMIN_MASTER_PIN;
      resetAdminMasterPinServiceForTests();
      assert.equal(getMasterAdminPinPolicyStatus().envConfigured, false);
      const missingEnvRes = verifyMasterAdminPinAgainstEnvHash('1234-5678-90');
      assert.equal(missingEnvRes.valid, false);
      assert.equal(missingEnvRes.statusCode, 503);
      assert.equal(missingEnvRes.code, 'ADMIN_ENV_PIN_NOT_CONFIGURED');

      // 2. Rejects weak env PIN in strict mode
      process.env.VECL_STRICT_PRODUCTION_SECRETS = 'true';
      process.env.VECL_ADMIN_MASTER_PIN = 'short123';
      resetAdminMasterPinServiceForTests();
      const weakEnvRes = verifyMasterAdminPinAgainstEnvHash('short123');
      assert.equal(weakEnvRes.valid, false);
      assert.equal(weakEnvRes.statusCode, 503);
      assert.equal(weakEnvRes.code, 'ADMIN_ENV_PIN_TOO_WEAK');

      // 3. Strong env PIN is hashed via scrypt and verifies with timingSafeEqual
      process.env.VECL_ADMIN_MASTER_PIN = '9081-7263-5544';
      resetAdminMasterPinServiceForTests();
      const policy = getMasterAdminPinPolicyStatus();
      assert.equal(policy.envConfigured, true);
      assert.equal(policy.strictMode, true);
      assert.equal(policy.meetsStrengthRequirement, true);
      assert.equal(policy.algorithm, 'scrypt-timingSafeEqual');

      const exactOk = verifyMasterAdminPinAgainstEnvHash('9081-7263-5544');
      assert.equal(exactOk.valid, true);
      assert.ok(exactOk.proof);
      assert.equal(isValidMasterAdminProof(exactOk.proof), true);
      assert.equal(exactOk.proof.adminUid, MASTER_ADMIN_ACTOR_UID);

      // Normalized numeric format is accepted; forged proof objects are rejected
      const normalizedOk = verifyMasterAdminPinAgainstEnvHash('908172635544');
      assert.equal(normalizedOk.valid, true);
      assert.equal(
        isValidMasterAdminProof({ adminUid: MASTER_ADMIN_ACTOR_UID, verifiedAtMs: Date.now() }),
        false
      );

      // 4. Rate limits invalid PIN attempts per IP while allowing legitimate admin calls
      const badIp = '10.0.0.77';
      for (let i = 0; i < 8; i++) {
        const badAttempt = verifyMasterAdminPinAgainstEnvHash('0000-0000-0000', { ipKey: badIp });
        assert.equal(badAttempt.valid, false);
        assert.equal(badAttempt.statusCode, 401);
      }
      const throttled = verifyMasterAdminPinAgainstEnvHash('9081-7263-5544', { ipKey: badIp });
      assert.equal(throttled.valid, false);
      assert.equal(throttled.statusCode, 429);
      assert.equal(throttled.code, 'ADMIN_RATE_LIMITED');

      // 5. Env PIN rotation automatically re-hashes without retaining old PIN
      process.env.VECL_ADMIN_MASTER_PIN = 'A9x!BenchMaster2026';
      const oldPinAfterRotate = verifyMasterAdminPinAgainstEnvHash('9081-7263-5544', {
        ipKey: '10.0.0.88',
      });
      assert.equal(oldPinAfterRotate.valid, false);
      assert.equal(oldPinAfterRotate.statusCode, 401);
      const rotatedOk = verifyMasterAdminPinAgainstEnvHash('A9x!BenchMaster2026', {
        ipKey: '10.0.0.88',
      });
      assert.equal(rotatedOk.valid, true);

      // 6. HTTP route verification on /api/autoelectric/license/admin/*
      process.env.VECL_ADMIN_UIDS = 'uid_owner_admin_01';
      process.env.VECL_ADMIN_MASTER_PIN = 'LabMaster#2026Strict';
      resetAdminMasterPinServiceForTests();

      // Rejects unauthenticated request (401)
      const noAuthList = await fetch(`${baseUrl}/api/autoelectric/license/admin/list`);
      assert.equal(noAuthList.status, 401);

      // Rejects Firebase JWT / Bearer tokens — VECL_ADMIN_MASTER_PIN is exclusive
      const bearerRejected = await fetch(`${baseUrl}/api/autoelectric/license/admin/list`, {
        headers: { Authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.fake.sig' },
      });
      assert.equal(bearerRejected.status, 401);

      // Rejects malformed JSON BEFORE body parsing when Master PIN is invalid/missing (401 not 400)
      const preAuthInvalidJson = await fetch(`${baseUrl}/api/autoelectric/license/admin/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Pin': 'wrong-pin-attempt' },
        body: '{malformed-json',
      });
      assert.equal(preAuthInvalidJson.status, 401);

      // Accepts valid VECL_ADMIN_MASTER_PIN across /generate, /list, /extend, /reset-devices, /revoke
      const genRes = await fetch(`${baseUrl}/api/autoelectric/license/admin/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Pin': 'LabMaster#2026Strict',
        },
        body: JSON.stringify({ plan: 'MONTHLY_30D', notes: 'HTTP Master PIN Test' }),
      });
      assert.equal(genRes.status, 201);
      const genBody = (await genRes.json()) as {
        status: string;
        plainCode: string;
        license: { licenseId: string };
      };
      assert.equal(genBody.status, 'SUCCESS');
      assert.ok(genBody.license.licenseId);

      const listRes = await fetch(`${baseUrl}/api/autoelectric/license/admin/list`, {
        headers: { 'X-Admin-Pin': 'LabMaster#2026Strict' },
      });
      assert.equal(listRes.status, 200);
      const listBody = (await listRes.json()) as {
        authMode: string;
        licenses: Array<{ licenseId: string }>;
      };
      assert.equal(listBody.authMode, 'VECL_ADMIN_MASTER_PIN');
      assert.equal(
        listBody.licenses.some((l) => l.licenseId === genBody.license.licenseId),
        true
      );

      const extendRes = await fetch(`${baseUrl}/api/autoelectric/license/admin/extend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Pin': 'LabMaster#2026Strict',
        },
        body: JSON.stringify({ licenseId: genBody.license.licenseId, additionalDays: 10 }),
      });
      assert.equal(extendRes.status, 200);

      const resetRes = await fetch(`${baseUrl}/api/autoelectric/license/admin/reset-devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Pin': 'LabMaster#2026Strict',
        },
        body: JSON.stringify({ licenseId: genBody.license.licenseId }),
      });
      assert.equal(resetRes.status, 200);

      const revokeRes = await fetch(`${baseUrl}/api/autoelectric/license/admin/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Pin': 'LabMaster#2026Strict',
        },
        body: JSON.stringify({
          licenseId: genBody.license.licenseId,
          revoked: true,
          reason: 'Audit test',
        }),
      });
      assert.equal(revokeRes.status, 200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      resetAdminMasterPinServiceForTests();
      resetLicenseStoreForTests();
      if (prevEnvPin === undefined) delete process.env.VECL_ADMIN_MASTER_PIN;
      else process.env.VECL_ADMIN_MASTER_PIN = prevEnvPin;
      if (prevStrict === undefined) delete process.env.VECL_STRICT_PRODUCTION_SECRETS;
      else process.env.VECL_STRICT_PRODUCTION_SECRETS = prevStrict;
      if (prevAdminUids === undefined) delete process.env.VECL_ADMIN_UIDS;
      else process.env.VECL_ADMIN_UIDS = prevAdminUids;
    }
  });

  await runTest('AdminPinManagerModal masks currently active PIN, validates modifications, and enforces secondary confirmation', () => {
    const claimedConfig = {
      masterEnvConfigured: false,
      adminClaimed: true,
      setupEnabled: false,
      pinInitialized: true,
    };

    // 1. Active & proposed PIN masking never leaks plaintext characters
    const masked8 = maskMasterAdminPin('90817263');
    assert.equal(masked8, '••••••••');
    assert.equal(masked8.includes('9'), false);
    assert.equal(masked8.includes('3'), false);

    // 2. Rejects env-managed modification attempts
    const envLockedRes = validateMasterPinModification({
      currentPin: '90817263',
      newPin: '492817',
      confirmNewPin: '492817',
      config: { ...claimedConfig, masterEnvConfigured: true },
    });
    assert.equal(envLockedRes.valid, false);
    assert.equal(envLockedRes.checks.envNotLocked, false);

    // 3. Rejects trivial sequential/repeated PINs, matching current PIN, and mismatched confirmation
    const trivialRes = validateMasterPinModification({
      currentPin: '90817263',
      newPin: '123456',
      confirmNewPin: '123456',
      config: claimedConfig,
    });
    assert.equal(trivialRes.valid, false);
    assert.equal(trivialRes.checks.newPinNotTrivial, false);

    const samePinRes = validateMasterPinModification({
      currentPin: '90817263',
      newPin: '90817263',
      confirmNewPin: '90817263',
      config: claimedConfig,
    });
    assert.equal(samePinRes.valid, false);
    assert.equal(samePinRes.checks.newPinDiffersFromCurrent, false);

    const mismatchRes = validateMasterPinModification({
      currentPin: '90817263',
      newPin: '492817',
      confirmNewPin: '492818',
      config: claimedConfig,
    });
    assert.equal(mismatchRes.valid, false);
    assert.equal(mismatchRes.checks.confirmMatchesNewPin, false);

    // 4. Accepts strong valid modification & enforces secondary confirmation gate
    const validRes = validateMasterPinModification({
      currentPin: '90817263',
      newPin: '492817',
      confirmNewPin: '492817',
      config: claimedConfig,
    });
    assert.equal(validRes.valid, true);

    assert.equal(
      isSecondaryConfirmationSatisfied({ acknowledged: false, confirmationText: 'CONFIRM' }),
      false
    );
    assert.equal(
      isSecondaryConfirmationSatisfied({ acknowledged: true, confirmationText: 'yes' }),
      false
    );
    assert.equal(
      isSecondaryConfirmationSatisfied({ acknowledged: true, confirmationText: ' confirm ' }),
      true
    );

    // 5. Verify AdminPinManagerModal wires masked display, validation layer, and secondary confirmation
    const modalSrc = fs.readFileSync(
      path.resolve('src/components/billing/AdminPinManagerModal.tsx'),
      'utf8'
    );
    assert.ok(modalSrc.includes('masked-active-master-pin'));
    assert.ok(modalSrc.includes('maskMasterAdminPin'));
    assert.ok(modalSrc.includes('validateMasterPinModification'));
    assert.ok(modalSrc.includes('master-pin-secondary-confirmation'));
    assert.ok(modalSrc.includes('isSecondaryConfirmationSatisfied'));
  });

  console.log(`\nSecurity & Offline Test Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main();



