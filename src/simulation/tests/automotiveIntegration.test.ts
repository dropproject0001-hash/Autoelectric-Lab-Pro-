/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { Request, Response } from 'express';
import { createAutoelectricApiApp } from '../../server/createApiApp';
import {
  AuthenticatedRequest,
  requireFirebaseAuth,
  resetFirebaseAuthCacheForTests,
  resolveFirebaseProjectId,
  setJwksFetcherForTests,
} from '../../server/services/firebaseAuthMiddleware';
import { classifyGeminiError } from '../../server/services/geminiErrorClassifier';
import {
  recordModelFailure,
  resetFreeTierRouterForTests,
} from '../../server/services/geminiFreeTierRouter';
import { getUpgradeClientIp } from '../../server/services/geminiLiveVoiceServer';
import {
  resetLicenseStoreForTests,
  setAdminUidForTests,
} from '../../server/services/licenseService';
import {
  computeIso3779CheckDigit,
  decodeVinViaNhtsa,
  fetchNhtsaRecallsAndComplaints,
  fetchVehicleMakesAndWmiViaNhtsa,
  maskVin,
  NhtsaUpstreamError,
  resetNhtsaStateForTests,
  setNhtsaFetchForTests,
} from '../../server/services/nhtsaService';
import {
  lookupRecallsByVehicle,
  lookupVinWithRecalls,
  setNhtsaClientAuthForTests,
} from '../../services/nhtsaClientService';
import {
  OBDB_DATASET_VALIDATION,
  OBDB_LICENSE_SPDX,
  OBDB_PINNED_COMMIT,
  OBDB_PROVENANCE,
  OBDB_SAEJ1979_PIDS,
  validateObdbSignalsetSchema,
} from '../../data/obdb/obdbLoader';
import {
  classifyProvenanceStatus,
  guardProvenanceTransition,
} from '../../utils/provenanceEngine';
import {
  evaluatePinoutSafety,
  evaluateVehicleBenchSafety,
} from '../../utils/automotiveSafetyGuard';
import { filterRegionalCatalog } from '../../utils/regionalKnowledgeCatalog';
import {
  buildStartMyCarGroundedQuery,
  buildStartMyCarProvenance,
  buildStartMyCarReferenceUrls,
  normalizeStartMyCarSlug,
  normalizeStartMyCarYear,
} from '../../utils/startMyCarReference';
import {
  changeClaimedAdminPin,
  createTrialPinRecord,
  getAdminPinConfigStatus,
  getAdminTrialAuditSnapshot,
  getTrialStatusForDevice,
  importHistoricalAuditCsv,
  isValidTrialPinFormat,
  redeemTrialPin,
  reloadTrialStoreFromDisk,
  resetTrialPinDevice,
  resetTrialStoreForTests,
  revokeAdminSessionToken,
  revokeAllAdminSessionTokens,
  setTrialPinRevocation,
  setTrialStoreFilePathForTests,
  setupFirstRunAdminPin,
  verifyAdminSessionToken,
  verifyMasterAdminPinAndIssueToken,
  verifyTrialBearerToken,
} from '../../server/services/trialPinService';
import {
  formatTrialDurationLabel,
  TRIAL_DURATION_PRESETS,
  type TrialDurationHours,
} from '../../services/trialPinClientService';
import {
  buildTrialAuditCsv,
  computeRemainingPercentForTrial,
  escapeAuditCsvCell,
  scrubAuditActor,
  scrubSensitiveAuditText,
} from '../../utils/auditCsvExport';
import { formatTrialCountdown } from '../../context/TrialAccessContext';
import {
  deleteBenchSession,
  deleteDiagnosticLog,
  LOCAL_WORKSTATION_UID,
  saveBenchSession,
  saveDiagnosticLog,
  subscribeBenchSessions,
  subscribeDiagnosticLogs,
} from '../../services/benchStorageService';

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

async function main() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' }) as {
    kty: string;
    n: string;
    e: string;
  };
  const projectId = 'valued-zoo-9mvz5';
  const testKid = 'auto-int-rsa-1';

  // 1 & 2. Firebase Auth & Unauthorized Access
  await runTest('Firebase auth middleware accepts verified RS256 Bearer token and rejects unauthorized access', async () => {
    const prevProjectId = process.env.FIREBASE_PROJECT_ID;
    const activeProjectId = resolveFirebaseProjectId() || projectId;
    process.env.FIREBASE_PROJECT_ID = activeProjectId;
    try {
      setJwksFetcherForTests(async () => ({
        keys: [{ kid: testKid, kty: publicJwk.kty, alg: 'RS256', use: 'sig', n: publicJwk.n, e: publicJwk.e }],
        maxAgeSec: 3600,
      }));

      const now = Math.floor(Date.now() / 1000);
      const validToken = signTestJwt(privateKey, testKid, {
        iss: `https://securetoken.google.com/${activeProjectId}`,
        aud: activeProjectId,
        sub: 'uid_vehicle_tester',
        email: 'eng@autoelectric.test',
        email_verified: true,
        iat: now - 10,
        exp: now + 3600,
      });

      const authReq = { headers: { authorization: `Bearer ${validToken}` } } as unknown as AuthenticatedRequest;
      const okMock = makeMockResponse();
      let nextCalled = false;
      await requireFirebaseAuth(authReq, okMock.res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);
      assert.equal(authReq.authUser?.uid, 'uid_vehicle_tester');

      const unauthMock = makeMockResponse();
      let blockedNext = false;
      await requireFirebaseAuth({ headers: {} } as unknown as Request, unauthMock.res, () => {
        blockedNext = true;
      });
      assert.equal(blockedNext, false);
      assert.equal(unauthMock.getStatus(), 401);
      assert.equal((unauthMock.getBody() as { code: string }).code, 'AUTH_REQUIRED');
    } finally {
      if (prevProjectId === undefined) {
        delete process.env.FIREBASE_PROJECT_ID;
      } else {
        process.env.FIREBASE_PROJECT_ID = prevProjectId;
      }
      resetFirebaseAuthCacheForTests();
    }
  });

  // 3. Invalid VIN + Masking
  await runTest('Invalid VIN is rejected with HTTP 400 and maskVin redacts middle digits', async () => {
    resetNhtsaStateForTests();
    await assert.rejects(
      () => decodeVinViaNhtsa('1FTEW1EF3GKE1234I'),
      (err: unknown) => err instanceof NhtsaUpstreamError && err.statusCode === 400
    );
    await assert.rejects(
      () => decodeVinViaNhtsa('SHORTVIN'),
      (err: unknown) => err instanceof NhtsaUpstreamError && err.statusCode === 400
    );
    assert.equal(maskVin('1FTEW1EF3GKE12345'), '1FT********2345');
  });

  // 4. Valid VIN & WMI/Makes lookup (Mocked NHTSA vPIC)
  await runTest('Valid VIN decode and WMI/makes lookup parse mocked NHTSA vPIC responses', async () => {
    resetNhtsaStateForTests();
    setNhtsaFetchForTests(async (url) => {
      if (url.includes('decodevinvalues/1FTEW1EF3GKE12345')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            Results: [
              {
                Make: 'FORD',
                Model: 'F-150',
                ModelYear: '2016',
                DisplacementL: '5.0',
                EngineCylinders: '8',
                FuelTypePrimary: 'Gasoline',
                Manufacturer: 'FORD MOTOR COMPANY',
                ErrorCode: '0',
                ErrorText: '0 - VIN decoded clean',
              },
            ],
          }),
        };
      }
      if (url.includes('DecodeWMI/1FT')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            Results: [
              {
                Name: 'FORD MOTOR COMPANY',
                Make: 'Ford',
                VehicleType: 'Truck',
                Country: 'UNITED STATES (USA)',
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          Results: [{ Make_Name: 'FORD', Model_Name: 'F-150' }],
        }),
      };
    }, 0);

    const vinRes = await decodeVinViaNhtsa('1FTEW1EF3GKE12345');
    assert.equal(vinRes.decoded.make, 'FORD');
    assert.equal(vinRes.decoded.model, 'F-150');
    assert.equal(vinRes.decoded.wmi, '1FT');
    assert.equal(vinRes.cached, false);

    const dirRes = await fetchVehicleMakesAndWmiViaNhtsa({
      wmi: '1FT',
      make: 'Ford',
      year: '2016',
    });
    assert.equal(dirRes.verificationStatus, 'OFFICIAL_GOVERNMENT');
    assert.equal(dirRes.wmiInfo?.manufacturerName, 'FORD MOTOR COMPANY');
    assert.equal(dirRes.models.includes('F-150'), true);
    resetNhtsaStateForTests();
  });

  // 5, 6 & 7. Unsupported Regional Vehicle, Recall Results, Empty Complaint Results
  await runTest('Unsupported regional vehicle, recall results, and empty complaints behave honestly', async () => {
    resetNhtsaStateForTests();
    setNhtsaFetchForTests(async (url) => {
      if (url.includes('recallsByVehicle') && url.includes('Ford')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                NHTSACampaignNumber: '20V123000',
                Component: 'FUEL SYSTEM, GASOLINE',
                Summary: 'Fuel pump wire chafing',
                Consequence: 'Engine stall',
                Remedy: 'Inspect harness',
                ReportReceivedDate: '03/01/2020',
                parkIt: false,
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ count: 0, results: [] }),
      };
    }, 0);

    const fordRecalls = await fetchNhtsaRecallsAndComplaints('Ford', 'F-150', '2016');
    assert.equal(fordRecalls.recalls.length, 1);
    assert.equal(fordRecalls.recalls[0].campaignNumber, '20V123000');
    assert.equal(fordRecalls.complaints.length, 0);
    assert.equal(fordRecalls.complaintCount, 0);

    const hiluxAsean = await fetchNhtsaRecallsAndComplaints('Toyota', 'Hilux', '2018');
    assert.equal(hiluxAsean.recalls.length, 0);
    assert.equal(hiluxAsean.complaints.length, 0);

    const phCatalog = filterRegionalCatalog('PHILIPPINES', 'hilux');
    assert.ok(phCatalog.length > 0);
    assert.equal(phCatalog[0].nhtsaCoverageExpected, false);
    resetNhtsaStateForTests();
  });

  // 8, 9, 10 & 11. Timeout, HTTP 429, HTTP 500, and Malformed JSON
  await runTest('Timeout, HTTP 429, HTTP 500, and malformed JSON trigger bounded retries and proper status codes', async () => {
    // External timeout (AbortError)
    resetNhtsaStateForTests();
    let timeoutAttempts = 0;
    setNhtsaFetchForTests(async () => {
      timeoutAttempts += 1;
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }, 0);
    await assert.rejects(
      () => decodeVinViaNhtsa('1FTEW1EF3GKE12345'),
      (err: unknown) => err instanceof NhtsaUpstreamError && err.statusCode === 504
    );
    assert.equal(timeoutAttempts, 3); // 1 initial + 2 retries

    // HTTP 429 transient recovery on 2nd attempt
    resetNhtsaStateForTests();
    let rateAttempts = 0;
    setNhtsaFetchForTests(async () => {
      rateAttempts += 1;
      if (rateAttempts === 1) {
        return { ok: false, status: 429, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ Results: [{ Make: 'HONDA', Model: 'CIVIC', ModelYear: '2018', ErrorCode: '0' }] }),
      };
    }, 0);
    const recovered = await decodeVinViaNhtsa('2HGFC1F3XJH123456');
    assert.equal(rateAttempts, 2);
    assert.equal(recovered.decoded.make, 'HONDA');

    // HTTP 500 maps to 502 after retries
    resetNhtsaStateForTests();
    setNhtsaFetchForTests(async () => ({ ok: false, status: 500, json: async () => ({}) }), 0);
    await assert.rejects(
      () => decodeVinViaNhtsa('1FTEW1EF3GKE12345'),
      (err: unknown) => err instanceof NhtsaUpstreamError && err.statusCode === 502
    );

    // Malformed JSON maps to 502 without pointless retry spam
    resetNhtsaStateForTests();
    let malformedAttempts = 0;
    setNhtsaFetchForTests(async () => {
      malformedAttempts += 1;
      return {
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      };
    }, 0);
    await assert.rejects(
      () => decodeVinViaNhtsa('1FTEW1EF3GKE12345'),
      (err: unknown) => err instanceof NhtsaUpstreamError && err.statusCode === 502
    );
    assert.equal(malformedAttempts, 1);
    resetNhtsaStateForTests();
  });

  // 12 & 13. Cache Expiration & Stale Offline Fallback
  await runTest('Cache expiration re-fetches upstream and falls back to stale cache with warning on outage', async () => {
    resetNhtsaStateForTests();
    const prevTtl = process.env.NHTSA_CACHE_TTL_MS;
    process.env.NHTSA_CACHE_TTL_MS = '1000';

    let fetchCount = 0;
    let simulateOutage = false;
    setNhtsaFetchForTests(async () => {
      fetchCount += 1;
      if (simulateOutage) {
        return { ok: false, status: 503, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      };
    }, 0);

    const first = await fetchNhtsaRecallsAndComplaints('Toyota', 'Corolla', '2020');
    assert.equal(first.cached, false);
    assert.equal(first.stale, false);
    // Two parallel upstream fetches: recallsByVehicle + complaintsByVehicle
    assert.equal(fetchCount, 2);

    const second = await fetchNhtsaRecallsAndComplaints('Toyota', 'Corolla', '2020');
    assert.equal(second.cached, true);
    assert.equal(fetchCount, 2);

    // Wait >1s for TTL expiry, then simulate upstream 503 outage
    await new Promise((r) => setTimeout(r, 1050));
    simulateOutage = true;
    const staleFallback = await fetchNhtsaRecallsAndComplaints('Toyota', 'Corolla', '2020');
    assert.equal(staleFallback.cached, true);
    assert.equal(staleFallback.stale, true);

    if (prevTtl === undefined) delete process.env.NHTSA_CACHE_TTL_MS;
    else process.env.NHTSA_CACHE_TTL_MS = prevTtl;
    resetNhtsaStateForTests();
  });

  // 14. Provenance Classification & Anti-Promotion Guard
  await runTest('Provenance engine isolates AI_INFERRED, SIMULATION_ONLY & COMMUNITY_UNVERIFIED and blocks auto-promotion to OEM_VERIFIED', () => {
    assert.equal(classifyProvenanceStatus('GEMINI_GROUNDED_SEARCH'), 'AI_INFERRED');
    assert.equal(classifyProvenanceStatus('SIMULATION_TRAINER'), 'SIMULATION_ONLY');
    assert.equal(classifyProvenanceStatus('OBDB_COMMUNITY_REPO'), 'COMMUNITY_UNVERIFIED');
    assert.equal(classifyProvenanceStatus('NHTSA_PUBLIC_API'), 'OFFICIAL_GOVERNMENT');

    assert.equal(guardProvenanceTransition('AI_INFERRED', 'OEM_VERIFIED', true), 'AI_INFERRED');
    assert.equal(guardProvenanceTransition('SIMULATION_ONLY', 'OEM_VERIFIED', true), 'SIMULATION_ONLY');
    assert.equal(
      guardProvenanceTransition('COMMUNITY_UNVERIFIED', 'OEM_VERIFIED', false),
      'COMMUNITY_UNVERIFIED'
    );
    assert.equal(guardProvenanceTransition('UNKNOWN', 'OEM_VERIFIED', false), 'UNKNOWN');
    assert.equal(guardProvenanceTransition('USER_SUPPLIED', 'OEM_VERIFIED', true), 'OEM_VERIFIED');
  });

  // 15. Unknown / AI-Only ECU Pinout Safety Guard
  await runTest('Automotive Safety Guard blocks live bench energizing for AI_INFERRED, UNKNOWN, missing part#, or unconfirmed orientation', () => {
    const aiBlocked = evaluatePinoutSafety({
      ecuIdentified: true,
      ecuPartNumber: '89661-0K240',
      connectorOrientationConfirmed: true,
      provenanceStatus: 'AI_INFERRED',
      pinCategory: 'power',
    });
    assert.equal(aiBlocked.canEnergizePhysicalBench, false);
    assert.equal(aiBlocked.riskLevel, 'BLOCKED_HIGH_RISK');

    const unknownPin = evaluatePinoutSafety({
      ecuIdentified: false,
      connectorOrientationConfirmed: false,
      provenanceStatus: 'UNKNOWN',
      pinCategory: 'ground',
      isObd2DlcPin: true,
    });
    assert.equal(unknownPin.canInferPowerOrSignalPin, false);
    assert.equal(unknownPin.canEnergizePhysicalBench, false);
    assert.ok(unknownPin.warnings.some((w) => w.includes('OBD-II DLC')));

    const verifiedOk = evaluatePinoutSafety({
      ecuIdentified: true,
      ecuPartNumber: '89661-0K240',
      connectorOrientationConfirmed: true,
      provenanceStatus: 'OEM_VERIFIED',
      pinCategory: 'power',
      isSimulatedValue: true,
    });
    assert.equal(verifiedOk.canEnergizePhysicalBench, true);
    assert.equal(verifiedOk.measurementOriginLabel, 'SIMULATED_BENCH_VALUE');
  });

  // 16. Community Dataset (OBDb) Attribution & Schema Validation
  await runTest('OBDb SAEJ1979 local asset passes schema validation, pins commit SHA, preserves CC BY-SA 4.0, and tags COMMUNITY_UNVERIFIED', () => {
    assert.equal(OBDB_DATASET_VALIDATION.valid, true);
    assert.ok(OBDB_SAEJ1979_PIDS.length > 500);
    assert.equal(OBDB_PINNED_COMMIT, 'af749a5c2611455566374c5321b2d38cd25ac563');
    assert.equal(OBDB_LICENSE_SPDX, 'CC-BY-SA-4.0');
    assert.equal(OBDB_PROVENANCE.verificationStatus, 'COMMUNITY_UNVERIFIED');
    assert.equal(fs.existsSync(path.resolve('src/data/obdb/LICENSE')), true);
    assert.equal(fs.existsSync(path.resolve('src/data/obdb/ATTRIBUTION.md')), true);
    assert.equal(OBDB_SAEJ1979_PIDS.every((p) => p.verificationStatus === 'COMMUNITY_UNVERIFIED'), true);

    const invalidSchema = validateObdbSignalsetSchema({ commands: [{ hdr: '', signals: [] }] });
    assert.equal(invalidSchema.valid, false);
  });

  // 17. Independent ISO 3779 VIN Check Digit Calculation (North America & synthetic warning)
  await runTest('ISO 3779 check digit validator verifies valid NA VINs and flags mismatched check digits as advisory', async () => {
    const validCheck = computeIso3779CheckDigit('1M8GDM9AXKP042788');
    assert.ok(validCheck);
    assert.equal(validCheck.expectedCheckDigit, 'X');
    assert.equal(validCheck.actualCheckDigit, 'X');
    assert.equal(validCheck.valid, true);

    const mismatchCheck = computeIso3779CheckDigit('1FTEW1EF3GKE12345');
    assert.ok(mismatchCheck);
    assert.equal(mismatchCheck.actualCheckDigit, '3');
    assert.notEqual(mismatchCheck.expectedCheckDigit, '3');
    assert.equal(mismatchCheck.valid, false);

    resetNhtsaStateForTests();
    setNhtsaFetchForTests(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        Results: [{ Make: 'FORD', Model: 'F-150', ModelYear: '2016', ErrorCode: '0' }],
      }),
    }), 0);
    const res = await decodeVinViaNhtsa('1FTEW1EF3GKE12345');
    assert.equal(res.decoded.localCheckDigitValid, false);
    assert.equal(res.decoded.expectedCheckDigit, mismatchCheck.expectedCheckDigit);
    // NHTSA ErrorCode remains authoritative for hasCheckDigitWarning
    assert.equal(res.decoded.hasCheckDigitWarning, false);
    resetNhtsaStateForTests();
  });

  // 18. Vehicle Bench Power-On Gate (evaluateVehicleBenchSafety)
  await runTest('evaluateVehicleBenchSafety gates energizing for PART_METADATA_ONLY, MECHANICAL_NO_ECU, and unconfirmed OCR_VERIFY', () => {
    const partMetadataBlocked = evaluateVehicleBenchSafety({
      brandKey: 'toyota',
      modelName: 'Corolla 2020',
      ecuProfileId: null,
      ecuStatus: 'PART_METADATA_ONLY',
      hasVerifiedPinoutMap: false,
      controllerNote: 'OEM catalog metadata only',
      orientationConfirmed: false,
    });
    assert.equal(partMetadataBlocked.canEnergizePhysicalBench, false);
    assert.equal(partMetadataBlocked.riskLevel, 'BLOCKED_HIGH_RISK');

    const mechanicalBlocked = evaluateVehicleBenchSafety({
      brandKey: 'toyota',
      modelName: 'Old Carb Pickup',
      ecuProfileId: null,
      ecuStatus: 'MECHANICAL_NO_ECU',
      hasVerifiedPinoutMap: false,
      controllerNote: 'Mechanical ignition',
      orientationConfirmed: true,
    });
    assert.equal(mechanicalBlocked.canEnergizePhysicalBench, false);

    const ocrUnconfirmed = evaluateVehicleBenchSafety({
      brandKey: 'mitsubishi',
      modelName: 'Montero Sport',
      ecuProfileId: 'mitsu-4n15',
      ecuStatus: 'OCR_VERIFY',
      hasVerifiedPinoutMap: true,
      controllerNote: 'Verify connector pin view',
      orientationConfirmed: false,
    });
    assert.equal(ocrUnconfirmed.canEnergizePhysicalBench, false);
    assert.equal(ocrUnconfirmed.riskLevel, 'BLOCKED_HIGH_RISK');

    const ocrConfirmed = evaluateVehicleBenchSafety({
      brandKey: 'mitsubishi',
      modelName: 'Montero Sport',
      ecuProfileId: 'mitsu-4n15',
      ecuStatus: 'OCR_VERIFY',
      hasVerifiedPinoutMap: true,
      controllerNote: 'Verify connector pin view',
      orientationConfirmed: true,
    });
    assert.equal(ocrConfirmed.canEnergizePhysicalBench, true);

    const trainerEval = evaluateVehicleBenchSafety({
      brandKey: 'universal-bench',
      modelName: 'Generic 16-Pin Trainer',
      ecuProfileId: null,
      ecuStatus: 'VERIFIED',
      hasVerifiedPinoutMap: true,
      controllerNote: 'Trainer',
      orientationConfirmed: false,
    });
    assert.equal(trainerEval.provenanceStatus, 'SIMULATION_ONLY');
    assert.equal(trainerEval.canEnergizePhysicalBench, false);
    assert.equal(trainerEval.canEnergizeSimulatedBench, true);
  });

  // 19. Real Express HTTP Server Integration + PIN-Only Auth Enforcement + Concurrent Burst Rate Limiting
  await runTest('Real Express HTTP endpoints enforce PIN-only 401 auth, reject Firebase JWTs on AI/NHTSA/Admin routes, enforce 400 validation, 429 burst limits, and 502 upstream errors', async () => {
    resetNhtsaStateForTests();
    resetFirebaseAuthCacheForTests();
    const tmpTrialDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vecl-http-pin-only-'));
    const trialStorePath = path.join(tmpTrialDir, 'trials.store.json');
    const prevMasterPin = process.env.VECL_ADMIN_MASTER_PIN;
    process.env.VECL_ADMIN_MASTER_PIN = '62918475';
    setTrialStoreFilePathForTests(trialStorePath);
    resetTrialStoreForTests();

    const prevProjectId = process.env.FIREBASE_PROJECT_ID;
    const realProjectId = resolveFirebaseProjectId() || projectId;
    process.env.FIREBASE_PROJECT_ID = realProjectId;
    setJwksFetcherForTests(async () => ({
      keys: [{ kid: testKid, kty: publicJwk.kty, alg: 'RS256', use: 'sig', n: publicJwk.n, e: publicJwk.e }],
      maxAgeSec: 3600,
    }));

    const now = Math.floor(Date.now() / 1000);
    const firebaseJwt = signTestJwt(privateKey, testKid, {
      iss: `https://securetoken.google.com/${realProjectId}`,
      aud: realProjectId,
      sub: 'uid_http_burst_tester',
      email: 'audit@autoelectric.test',
      email_verified: true,
      iat: now - 10,
      exp: now + 3600,
    });

    const app = createAutoelectricApiApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind ephemeral HTTP test server');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // Unauthenticated 401 across all protected routes
      const unauthGetPaths = [
        '/api/autoelectric/vin/1FTEW1EF3GKE12345',
        '/api/autoelectric/vehicle/decode-vin?vin=1FTEW1EF3GKE12345',
        '/api/autoelectric/recalls?make=Ford&model=F-150&year=2016',
        '/api/autoelectric/vehicle/recalls?make=Ford&model=F-150&year=2016',
        '/api/autoelectric/vehicle/complaints?make=Ford&model=F-150&year=2016',
        '/api/autoelectric/vehicle/makes?wmi=1FT',
      ];
      for (const route of unauthGetPaths) {
        const res = await fetch(`${baseUrl}${route}`);
        assert.equal(res.status, 401, `Expected 401 on GET ${route}`);
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
        assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
        assert.ok(res.headers.get('cache-control')?.includes('no-store'));
        const body = (await res.json()) as { code?: string };
        assert.equal(body.code, 'AUTH_REQUIRED');
      }

      for (const postRoute of ['/api/autoelectric/grounded-search', '/api/autoelectric/analyze-schematic']) {
        const res = await fetch(`${baseUrl}${postRoute}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'P0300' }),
        });
        assert.equal(res.status, 401, `Expected 401 on POST ${postRoute}`);
      }

      // Unified Auth: verified Firebase JWTs are accepted on NHTSA/AI routes, while forged tokens and Admin Trial routes remain strictly blocked
      const acceptedVinRes = await fetch(`${baseUrl}/api/autoelectric/vin/1FTEW1EF3GKE12345`, {
        headers: { Authorization: `Bearer ${firebaseJwt}` },
      });
      assert.equal(acceptedVinRes.status, 200);
      resetNhtsaStateForTests();

      const forgedTokenRes = await fetch(`${baseUrl}/api/autoelectric/grounded-search`, {
        method: 'POST',
        headers: { Authorization: 'Bearer not-a-valid-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'P0300' }),
      });
      assert.equal(forgedTokenRes.status, 401);
      assert.equal(((await forgedTokenRes.json()) as { code?: string }).code, 'INVALID_TOKEN');

      const rejectedAdminListRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/list`, {
        headers: { Authorization: `Bearer ${firebaseJwt}` },
      });
      assert.equal(rejectedAdminListRes.status, 401);

      // Authenticate strictly via Master Admin PIN & generate + redeem an active 8-digit Trial PIN
      const adminLoginRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterPin: '62918475' }),
      });
      assert.equal(adminLoginRes.status, 200);
      const { adminToken } = (await adminLoginRes.json()) as { adminToken: string };
      assert.ok(adminToken.startsWith('vecl_admin_v1.'));

      const genTrialRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationHours: 3, notes: 'HTTP Integration Trial PIN' }),
      });
      assert.equal(genTrialRes.status, 201);
      const genTrialBody = (await genTrialRes.json()) as {
        plainPin: string;
        trial: { trialId: string };
      };

      const redeemTrialRes = await fetch(`${baseUrl}/api/autoelectric/trial/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: genTrialBody.plainPin,
          deviceId: 'http_trial_dev_1',
          deviceLabel: 'HTTP Trial Bench #1',
        }),
      });
      assert.equal(redeemTrialRes.status, 200);
      const redeemTrialBody = (await redeemTrialRes.json()) as { trialToken: string };
      assert.ok(redeemTrialBody.trialToken.startsWith('vecl_trial_v1.'));

      const authHeaders = {
        Authorization: `Bearer ${redeemTrialBody.trialToken}`,
        'X-VECL-Device-Id': 'http_trial_dev_1',
      };

      // 400 invalid VIN & invalid year via real Express handler
      const badVinRes = await fetch(`${baseUrl}/api/autoelectric/vin/INVALID_VIN_123`, {
        headers: authHeaders,
      });
      assert.equal(badVinRes.status, 400);

      const badYearRes = await fetch(
        `${baseUrl}/api/autoelectric/vehicle/recalls?make=Ford&model=F-150&year=20X6`,
        { headers: authHeaders }
      );
      assert.equal(badYearRes.status, 400);

      // Malformed upstream JSON -> 502 HTTP response (single attempt)
      let malformedCalls = 0;
      setNhtsaFetchForTests(async () => {
        malformedCalls += 1;
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('Malformed HTML instead of JSON');
          },
        };
      }, 0);
      const malformedRes = await fetch(`${baseUrl}/api/autoelectric/vin/1FTEW1EF3GKE12345`, {
        headers: authHeaders,
      });
      assert.equal(malformedRes.status, 502);
      assert.equal(malformedCalls, 1);

      // Upstream valid VIN decode -> 200 cached HTTP response, followed by concurrent burst > 30/min -> 429 Retry-After
      resetNhtsaStateForTests();
      setNhtsaFetchForTests(async (url) => {
        if (url.includes('decodevinvalues')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              Results: [{ Make: 'FORD', Model: 'F-150', ModelYear: '2016', ErrorCode: '0' }],
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ results: [] }) };
      }, 0);

      const okVinRes = await fetch(`${baseUrl}/api/autoelectric/vin/1FTEW1EF3GKE12345`, {
        headers: authHeaders,
      });
      assert.equal(okVinRes.status, 200);
      const okPayload = (await okVinRes.json()) as {
        status: string;
        decodedVin: { make: string };
      };
      assert.equal(okPayload.status, 'SUCCESS');
      assert.equal(okPayload.decodedVin.make, 'FORD');

      // Burst 32 concurrent requests against nhtsaRateGuard (30/min per-user limit -> hits 429)
      const burstStatuses = await Promise.all(
        Array.from({ length: 32 }, () =>
          fetch(`${baseUrl}/api/autoelectric/vin/1FTEW1EF3GKE12345`, {
            headers: authHeaders,
          }).then((r) => ({ status: r.status, retryAfter: r.headers.get('retry-after') }))
        )
      );
      const rateLimited = burstStatuses.filter((r) => r.status === 429);
      assert.ok(rateLimited.length > 0, 'Expected concurrent NHTSA burst to trigger 429 USER_RATE_LIMITED');
      assert.ok(
        rateLimited.every((r) => r.retryAfter && Number(r.retryAfter) >= 1),
        'Expected Retry-After header on 429 responses'
      );

      // AI route rate limit (15/min per-user limit on grounded-search)
      const aiBurstStatuses = await Promise.all(
        Array.from({ length: 18 }, () =>
          fetch(`${baseUrl}/api/autoelectric/grounded-search`, {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: '' }),
          }).then((r) => r.status)
        )
      );
      assert.ok(aiBurstStatuses.includes(400), 'Expected first 15 validation failures to return 400');
      assert.ok(aiBurstStatuses.includes(429), 'Expected AI burst > 15/min to return 429');

      // Unknown /api/* routes must return JSON 404 rather than HTML
      const notFoundRes = await fetch(`${baseUrl}/api/autoelectric/nonexistent-endpoint`, {
        headers: authHeaders,
      });
      assert.equal(notFoundRes.status, 404);
      const notFoundBody = (await notFoundRes.json()) as { code?: string };
      assert.equal(notFoundBody.code, 'API_ROUTE_NOT_FOUND');

      // Pre-auth oversized body rejection: unauthenticated >100KB request is rejected with 401 AUTH_REQUIRED BEFORE JSON body parsing
      const largePadding = 'A'.repeat(90_000);
      const unauthLargeRes = await fetch(`${baseUrl}/api/autoelectric/grounded-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: largePadding }),
      });
      assert.equal(unauthLargeRes.status, 401);
      const unauthLargeBody = (await unauthLargeRes.json()) as { code?: string };
      assert.equal(unauthLargeBody.code, 'AUTH_REQUIRED');

      // Authenticated >64KB request on standard JSON route (/api/autoelectric/trial/redeem) is rejected with 413 PAYLOAD_TOO_LARGE
      const authLargeRes = await fetch(`${baseUrl}/api/autoelectric/trial/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '12345678', deviceLabel: largePadding }),
      });
      assert.equal(authLargeRes.status, 413);
      const authLargeBody = (await authLargeRes.json()) as { code?: string };
      assert.equal(authLargeBody.code, 'PAYLOAD_TOO_LARGE');

      // PIN-Authenticated AI route input & media validation checks (fail cleanly at 400 before hitting upstream Gemini)
      const adminAiHeaders = {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      };
      const emptyChatRes = await fetch(`${baseUrl}/api/autoelectric/gemini-chat`, {
        method: 'POST',
        headers: adminAiHeaders,
        body: JSON.stringify({ messages: [{ role: 'user', text: '   ' }] }),
      });
      assert.equal(emptyChatRes.status, 400);

      const badAudioMimeRes = await fetch(`${baseUrl}/api/autoelectric/transcribe-audio`, {
        method: 'POST',
        headers: adminAiHeaders,
        body: JSON.stringify({
          audioBase64: 'AAAA'.repeat(12),
          mimeType: 'application/octet-stream',
        }),
      });
      assert.equal(badAudioMimeRes.status, 400);

      const badAudioB64Res = await fetch(`${baseUrl}/api/autoelectric/transcribe-audio`, {
        method: 'POST',
        headers: adminAiHeaders,
        body: JSON.stringify({
          audioBase64: 'not-valid-base64!!!',
          mimeType: 'audio/webm;codecs=opus',
        }),
      });
      assert.equal(badAudioB64Res.status, 400);

      const emptyMapsRes = await fetch(`${baseUrl}/api/autoelectric/grounded-maps`, {
        method: 'POST',
        headers: adminAiHeaders,
        body: JSON.stringify({ query: '   ' }),
      });
      assert.equal(emptyMapsRes.status, 400);

      const badVideoImgRes = await fetch(`${baseUrl}/api/autoelectric/animate-video`, {
        method: 'POST',
        headers: adminAiHeaders,
        body: JSON.stringify({
          imageBase64: Buffer.from('not-a-real-png-header-at-all').toString('base64'),
          mimeType: 'image/png',
        }),
      });
      assert.equal(badVideoImgRes.status, 400);

      const badGenImgRes = await fetch(`${baseUrl}/api/autoelectric/generate-image`, {
        method: 'POST',
        headers: adminAiHeaders,
        body: JSON.stringify({
          prompt: 'Draw ECU harness',
          baseImageBase64: Buffer.from('corrupt-image-bytes-here').toString('base64'),
          mimeType: 'image/png',
        }),
      });
      assert.equal(badGenImgRes.status, 400);

      const emptyVoiceRes = await fetch(`${baseUrl}/api/autoelectric/live-voice`, {
        method: 'POST',
        headers: adminAiHeaders,
        body: JSON.stringify({ speechText: '   ' }),
      });
      assert.equal(emptyVoiceRes.status, 400);

      // Admin revokes Trial PIN -> Technician is immediately blocked from /api/autoelectric/grounded-search with 403 TRIAL_REVOKED
      const revokeTrialRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/revoke`, {
        method: 'POST',
        headers: adminAiHeaders,
        body: JSON.stringify({
          trialId: genTrialBody.trial.trialId,
          revoked: true,
          reason: 'Security test revocation',
        }),
      });
      assert.equal(revokeTrialRes.status, 200);

      const blockedTrialAiRes = await fetch(`${baseUrl}/api/autoelectric/grounded-search`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'P0300' }),
      });
      assert.equal(blockedTrialAiRes.status, 403);
      const blockedTrialAiBody = (await blockedTrialAiRes.json()) as { code?: string };
      assert.equal(blockedTrialAiBody.code, 'TRIAL_REVOKED');

      // Free-tier quota status endpoint enforces auth and returns live pool state + fast-fail cooldown protection
      const unauthQuotaRes = await fetch(`${baseUrl}/api/autoelectric/ai/quota-status`);
      assert.equal(unauthQuotaRes.status, 401);

      resetFreeTierRouterForTests();
      const prevQuotaKey1 = process.env.GEMINI_API_KEY;
      const prevQuotaKey2 = process.env.GEMINI_API_KEY_2;
      process.env.GEMINI_API_KEY = 'test-key-quota-slot-alpha-secret';
      process.env.GEMINI_API_KEY_2 = 'test-key-quota-slot-beta-secret';
      try {
        const authQuotaRes = await fetch(`${baseUrl}/api/autoelectric/ai/quota-status`, {
          headers: adminAiHeaders,
        });
        assert.equal(authQuotaRes.status, 200);
        const authQuotaRaw = await authQuotaRes.text();
        assert.equal(authQuotaRaw.includes('test-key-quota-slot-alpha-secret'), false);
        assert.equal(authQuotaRaw.includes('test-key-quota-slot-beta-secret'), false);
        const authQuotaBody = JSON.parse(authQuotaRaw) as {
          status?: string;
          pool?: Array<{ model: string; inCooldown: boolean }>;
          quotaManager?: {
            totalConfiguredKeys: number;
            healthyKeys: number;
            switchThresholdRatio: number;
            keys: Array<{ keyId: string; inCooldown: boolean }>;
            endpoints: Array<{ endpointId: string; model: string }>;
          };
        };
        assert.equal(authQuotaBody.status, 'SUCCESS');
        assert.ok(authQuotaBody.pool?.some((m) => m.model === 'gemini-4-hydrogen'));
        assert.ok(authQuotaBody.pool?.some((m) => m.model === 'gemini-3.1-flash-lite'));
        assert.equal(authQuotaBody.quotaManager?.totalConfiguredKeys, 2);
        assert.equal(authQuotaBody.quotaManager?.healthyKeys, 2);
        assert.ok((authQuotaBody.quotaManager?.switchThresholdRatio || 0) > 0);
        assert.deepEqual(
          authQuotaBody.quotaManager?.keys.map((k) => k.keyId),
          ['gemini-key-1', 'gemini-key-2']
        );
      } finally {
        if (prevQuotaKey1 === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = prevQuotaKey1;
        if (prevQuotaKey2 === undefined) delete process.env.GEMINI_API_KEY_2;
        else process.env.GEMINI_API_KEY_2 = prevQuotaKey2;
        resetFreeTierRouterForTests();
      }

      // When all free-tier models are in cooldown, endpoints fast-fail with 429 ALL_FREE_TIERS_COOLDOWN + Retry-After before hitting upstream
      const prevGeminiKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = 'test-key-cooldown-check-only';
      try {
        const now = Date.now();
        recordModelFailure('gemini-4-hydrogen', classifyGeminiError(new Error('429 retry in 25s')), now);
        recordModelFailure('gemini-3.1-flash-lite', classifyGeminiError(new Error('429 retry in 25s')), now);

        const cooldownChatRes = await fetch(`${baseUrl}/api/autoelectric/gemini-chat`, {
          method: 'POST',
          headers: adminAiHeaders,
          body: JSON.stringify({
            messages: [{ role: 'user', text: 'Check P0122' }],
            role: 'DEEP_REASONING',
          }),
        });
        assert.equal(cooldownChatRes.status, 429);
        assert.ok(Number(cooldownChatRes.headers.get('retry-after')) >= 1);
        const cooldownChatBody = (await cooldownChatRes.json()) as {
          code?: string;
          allFreeTiersExhausted?: boolean;
          retryAfterSec?: number;
        };
        assert.equal(cooldownChatBody.code, 'ALL_FREE_TIERS_COOLDOWN');
        assert.equal(cooldownChatBody.allFreeTiersExhausted, true);
        assert.ok((cooldownChatBody.retryAfterSec || 0) >= 1);
      } finally {
        if (prevGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = prevGeminiKey;
        resetFreeTierRouterForTests();
      }
    } finally {
      if (prevProjectId === undefined) {
        delete process.env.FIREBASE_PROJECT_ID;
      } else {
        process.env.FIREBASE_PROJECT_ID = prevProjectId;
      }
      if (prevMasterPin === undefined) {
        delete process.env.VECL_ADMIN_MASTER_PIN;
      } else {
        process.env.VECL_ADMIN_MASTER_PIN = prevMasterPin;
      }
      server.close();
      resetLicenseStoreForTests();
      resetTrialStoreForTests();
      setTrialStoreFilePathForTests(null);
      fs.rmSync(tmpTrialDir, { recursive: true, force: true });
      resetNhtsaStateForTests();
      resetFirebaseAuthCacheForTests();
    }
  });

  // 20. Client Offline Fallback & Recovery Consistency (HTTP 500/503 + Offline -> Stale Warning -> Live 200 Clears Stale)
  await runTest('nhtsaClientService falls back to labeled stale cache on HTTP 500/outage and clears stale banner upon recovery', async () => {
    const store = new Map<string, string>();
    const prevWindow = (globalThis as { window?: unknown }).window;
    const prevFetch = globalThis.fetch;

    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    };
    setNhtsaClientAuthForTests(async () => ({
      Accept: 'application/json',
      Authorization: 'Bearer test-token',
    }));

    let mode: 'LIVE_ZERO' | 'HTTP_500' | 'NETWORK_ERR' | 'LIVE_RECOVERED' = 'LIVE_ZERO';
    globalThis.fetch = (async () => {
      if (mode === 'HTTP_500') {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: 'Internal Server Error' }),
        } as unknown as globalThis.Response;
      }
      if (mode === 'NETWORK_ERR') {
        throw new TypeError('Failed to fetch');
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'SUCCESS',
          source: 'NHTSA_OFFICIAL_PUBLIC_API',
          verificationStatus: 'OFFICIAL_GOVERNMENT',
          provenance: {
            sourceName: 'NHTSA Official Safety Recalls & ODI Complaints API',
            sourceType: 'NHTSA_PUBLIC_API',
            verificationStatus: 'OFFICIAL_GOVERNMENT',
            dateRetrieved: '2026-11-15T12:00:00Z',
          },
          regionalNote: 'US coverage',
          recalls:
            mode === 'LIVE_RECOVERED'
              ? [
                  {
                    campaignNumber: '25V001000',
                    component: 'ECU',
                    summary: 'Recovered recall',
                    consequence: 'Stall',
                    remedy: 'Reflash',
                    reportReceivedDate: '01/01/2025',
                    parkIt: false,
                  },
                ]
              : [],
          complaints: [],
          recallCount: mode === 'LIVE_RECOVERED' ? 1 : 0,
          complaintCount: 0,
          cached: false,
          stale: false,
          fetchedAt: '2026-11-15T12:00:00Z',
          expiresAt: '2026-11-15T12:15:00Z',
          timestamp: '2026-11-15T12:00:00Z',
        }),
      } as unknown as globalThis.Response;
    }) as typeof globalThis.fetch;

    try {
      // Initial live fetch (0 recalls) writes localStorage cache
      const liveZero = await lookupRecallsByVehicle('Toyota', 'Hilux', '2020');
      assert.equal(liveZero.stale, false);
      assert.equal(liveZero.recallCount, 0);

      // HTTP 500 backend failure must return stale cached 0-recall result WITH explicit staleWarning
      mode = 'HTTP_500';
      const fallback500 = await lookupRecallsByVehicle('Toyota', 'Hilux', '2020');
      assert.equal(fallback500.cached, true);
      assert.equal(fallback500.stale, true);
      assert.ok(fallback500.staleWarning && fallback500.staleWarning.includes('OFFLINE / STALE CACHE FALLBACK'));

      // Network disconnect also preserves stale fallback warning
      mode = 'NETWORK_ERR';
      const fallbackNet = await lookupRecallsByVehicle('Toyota', 'Hilux', '2020');
      assert.equal(fallbackNet.stale, true);
      assert.ok(fallbackNet.staleWarning);

      // Online recovery clears stale flag & warning and updates cache
      mode = 'LIVE_RECOVERED';
      const recovered = await lookupRecallsByVehicle('Toyota', 'Hilux', '2020');
      assert.equal(recovered.stale, false);
      assert.equal(recovered.staleWarning, undefined);
      assert.equal(recovered.recallCount, 1);

      // No-cache cold offline still rejects cleanly rather than fabricating empty success
      await assert.rejects(
        async () => {
          mode = 'HTTP_500';
          return lookupVinWithRecalls('1FTEW1EF3GKE99999');
        },
        (err: unknown) =>
          err instanceof Error &&
          err.name === 'NhtsaClientHttpError' &&
          (err as { status?: number }).status === 500
      );
    } finally {
      setNhtsaClientAuthForTests(null);
      globalThis.fetch = prevFetch;
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  });

  // 25. StartMyCar Reference URL Builder, Sanitization & Provenance Enforcement
  await runTest('StartMyCar reference helper normalizes vehicles safely, enforces https origin, and tags COMMUNITY_UNVERIFIED', () => {
    assert.equal(normalizeStartMyCarSlug('Toyota'), 'toyota');
    assert.equal(normalizeStartMyCarSlug('F-150'), 'f-150');
    assert.equal(normalizeStartMyCarSlug('CR-V / Hybrid!'), 'cr-v-hybrid');
    assert.equal(normalizeStartMyCarYear('2020'), '2020');
    assert.equal(normalizeStartMyCarYear('1800'), undefined);
    assert.equal(normalizeStartMyCarYear('abcd'), undefined);

    const corolla = buildStartMyCarReferenceUrls({ make: 'Toyota', model: 'Corolla', year: '2020' });
    assert.equal(corolla.fuseBoxUrl, 'https://www.startmycar.com/toyota/corolla/info/fusebox/2020');
    assert.equal(corolla.vehicleHubUrl, 'https://www.startmycar.com/toyota/corolla');
    assert.equal(corolla.hasVehicleSpecificPath, true);

    const makeOnly = buildStartMyCarReferenceUrls({ make: 'Honda' });
    assert.equal(makeOnly.fuseBoxUrl, 'https://www.startmycar.com/honda/pickmodel');
    assert.equal(makeOnly.hasMakeSlug, true);
    assert.equal(makeOnly.hasVehicleSpecificPath, false);

    // Malicious / unsafe schemes cannot escape https://www.startmycar.com/
    const malicious = buildStartMyCarReferenceUrls({
      make: 'javascript:alert(1)',
      model: '../../etc/passwd',
      year: '9999',
    });
    assert.ok(malicious.fuseBoxUrl.startsWith('https://www.startmycar.com/'));
    assert.ok(!malicious.fuseBoxUrl.includes('javascript:'));
    assert.ok(!malicious.fuseBoxUrl.includes('..'));

    const grounded = buildStartMyCarGroundedQuery({
      make: 'Ford',
      model: 'Ranger',
      year: '2019',
      circuitFocus: 'OBD-II DLC Power Fuse',
      scope: 'INTERIOR_CABIN',
    });
    assert.equal(grounded.contextType, 'FUSE_RELAY_DIAGRAM');
    assert.ok(grounded.query.includes('site:startmycar.com'));
    assert.ok(grounded.query.includes('2019 Ford Ranger'));
    assert.ok(grounded.query.includes('OBD-II DLC Power Fuse'));

    assert.equal(classifyProvenanceStatus('THIRD_PARTY_WEB_REFERENCE'), 'COMMUNITY_UNVERIFIED');
    const prov = buildStartMyCarProvenance({ make: 'Ford', model: 'Ranger', year: '2019' });
    assert.equal(prov.verificationStatus, 'COMMUNITY_UNVERIFIED');
    assert.equal(guardProvenanceTransition(prov.verificationStatus, 'OEM_VERIFIED', false), 'COMMUNITY_UNVERIFIED');
    assert.ok(prov.confidenceOrUncertainty.includes('Verify physical fuse cover legend'));

    // Ensure components do not use window.open or external iframes for StartMyCar
    const groundedPanelSrc = fs.readFileSync(path.resolve('src/components/GroundedSearchPanel.tsx'), 'utf8');
    assert.equal(groundedPanelSrc.includes('window.open('), false);
    assert.equal(groundedPanelSrc.includes('<iframe'), false);
  });

  // 26. Trial PIN Service Unit Lifecycle (First-Run & Env Master Admin PIN, 8-digit PINs, Single-Device Limit, Expiry, Revocation)
  await runTest('trialPinService enforces 3-6h durations, scrypt storage, single-device limit, expiry, and revocation', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vecl-trial-unit-'));
    const storePath = path.join(tmpDir, 'trials.store.json');
    const prevMasterPin = process.env.VECL_ADMIN_MASTER_PIN;
    delete process.env.VECL_ADMIN_MASTER_PIN;

    const prevAllowFirstRun = process.env.VECL_ALLOW_FIRST_RUN_ADMIN_SETUP;
    delete process.env.VECL_ALLOW_FIRST_RUN_ADMIN_SETUP;
    const prevStrictSecrets = process.env.VECL_STRICT_PRODUCTION_SECRETS;
    delete process.env.VECL_STRICT_PRODUCTION_SECRETS;

    setTrialStoreFilePathForTests(storePath);
    resetTrialStoreForTests();

    try {
      // Explicit VECL_ALLOW_FIRST_RUN_ADMIN_SETUP=false or strict production mode disables unauthenticated setup
      process.env.VECL_ALLOW_FIRST_RUN_ADMIN_SETUP = 'false';
      const cfgExplicitDisabled = getAdminPinConfigStatus();
      assert.equal(cfgExplicitDisabled.masterEnvConfigured, false);
      assert.equal(cfgExplicitDisabled.adminClaimed, false);
      assert.equal(cfgExplicitDisabled.setupEnabled, false);
      assert.equal(cfgExplicitDisabled.pinInitialized, false);
      assert.throws(() => setupFirstRunAdminPin('74920183'), /ADMIN_SETUP_DISABLED/);

      process.env.VECL_ALLOW_FIRST_RUN_ADMIN_SETUP = 'true';
      process.env.VECL_STRICT_PRODUCTION_SECRETS = 'true';
      assert.equal(getAdminPinConfigStatus().setupEnabled, false);
      assert.throws(() => setupFirstRunAdminPin('74920183'), /ADMIN_SETUP_DISABLED/);

      // In non-strict preview (default), first-run setup is enabled until claimed
      delete process.env.VECL_STRICT_PRODUCTION_SECRETS;
      delete process.env.VECL_ALLOW_FIRST_RUN_ADMIN_SETUP;
      const cfgPreview = getAdminPinConfigStatus();
      assert.equal(cfgPreview.setupEnabled, true);
      assert.equal(cfgPreview.pinInitialized, false);

      const firstRun = setupFirstRunAdminPin('74920183', 1_700_000_000_000);
      assert.ok(firstRun.adminToken.startsWith('vecl_admin_v1.'));
      assert.equal(verifyAdminSessionToken(firstRun.adminToken, 1_700_000_005_000).valid, true);
      assert.equal(getAdminPinConfigStatus().pinInitialized, true);
      assert.equal(getAdminPinConfigStatus().setupEnabled, false);

      // Single token revocation works cleanly
      const revokeSingle = revokeAdminSessionToken(firstRun.adminToken, 1_700_000_006_000);
      assert.equal(revokeSingle.revoked, true);
      const verifyRevoked = verifyAdminSessionToken(firstRun.adminToken, 1_700_000_007_000);
      assert.equal(verifyRevoked.valid, false);
      assert.equal(verifyRevoked.code, 'TOKEN_REVOKED');

      // Second first-run claim must be rejected
      assert.throws(() => setupFirstRunAdminPin('11223344'), /ADMIN_ALREADY_CLAIMED/);

      // Claimed local PIN can be rotated by verifying the current PIN
      const rotated = changeClaimedAdminPin('74920183', '83920174', 1_700_000_008_000);
      assert.ok(rotated.adminToken.startsWith('vecl_admin_v1.'));
      assert.throws(() => verifyMasterAdminPinAndIssueToken('74920183'), /INVALID_MASTER_PIN/);
      assert.ok(verifyMasterAdminPinAndIssueToken('83920174', 1_700_000_008_500).adminToken);

      // Env Master PIN override takes precedence cleanly
      process.env.VECL_ADMIN_MASTER_PIN = '9081-7263';
      assert.equal(getAdminPinConfigStatus().masterEnvConfigured, true);
      assert.equal(getAdminPinConfigStatus().pinInitialized, true);
      assert.throws(() => setupFirstRunAdminPin('55667788'), /ADMIN_ENV_MANAGED/);
      assert.throws(() => changeClaimedAdminPin('83920174', '55667788'), /ADMIN_ENV_MANAGED/);
      const envLogin = verifyMasterAdminPinAndIssueToken('90817263', 1_700_000_009_000);
      assert.ok(envLogin.adminToken.startsWith('vecl_admin_v1.'));
      assert.equal(verifyAdminSessionToken(envLogin.adminToken, 1_700_000_009_500).valid, true);

      // Revoke all sessions invalidates all previous tokens
      revokeAllAdminSessionTokens(1_700_000_010_000);
      const verifyAllRevoked = verifyAdminSessionToken(envLogin.adminToken, 1_700_000_011_000);
      assert.equal(verifyAllRevoked.valid, false);
      assert.equal(verifyAllRevoked.code, 'TOKEN_REVOKED');
      assert.throws(() => verifyMasterAdminPinAndIssueToken('00000000'), /INVALID_MASTER_PIN/);

      // Duration bounds (only 3h, 4h, 5h, 6h, 30d=720h, 3m=2160h, 6m=4320h, 1y=8760h allowed)
      assert.throws(() => createTrialPinRecord({ durationHours: 2 }), /Trial duration must be/);
      assert.throws(() => createTrialPinRecord({ durationHours: 7 }), /Trial duration must be/);
      assert.throws(() => createTrialPinRecord({ durationHours: 999 }), /Trial duration must be/);

      const t0 = 1_700_000_100_000;
      const created = createTrialPinRecord({
        durationHours: 4,
        notes: 'Shop Bay #4 Demo',
        nowMs: t0,
      });
      assert.equal(isValidTrialPinFormat(created.plainPin), true);
      assert.match(created.formattedPin, /^\d{4}-\d{4}$/);
      assert.equal(created.record.maxDevices, 1);
      assert.equal(created.record.status, 'UNUSED');

      // Plaintext PIN must never be stored on disk
      const diskRaw = fs.readFileSync(storePath, 'utf8');
      assert.equal(diskRaw.includes(created.plainPin), false);
      assert.equal(diskRaw.includes(created.formattedPin), false);

      // Reload from disk preserves hashed credential & records
      const reloaded = reloadTrialStoreFromDisk();
      assert.equal(reloaded.loadedTrials, 1);

      // Technician activates on Device A -> countdown starts from first login
      const tActivate = t0 + 60_000;
      const redeemedA = await redeemTrialPin({
        rawPin: created.formattedPin,
        deviceId: 'bench_device_alpha_01',
        deviceLabel: 'Bay 4 Tablet',
        nowMs: tActivate,
      });
      assert.equal(redeemedA.newlyActivated, true);
      assert.equal(redeemedA.record.status, 'ACTIVE');
      assert.equal(redeemedA.record.expiresAtMs, tActivate + 4 * 3_600_000);
      assert.ok(redeemedA.trialToken.startsWith('vecl_trial_v1.'));

      // Same device re-entering PIN recovers active session without resetting timer
      const redeemedSame = await redeemTrialPin({
        rawPin: created.plainPin,
        deviceId: 'bench_device_alpha_01',
        nowMs: tActivate + 300_000,
      });
      assert.equal(redeemedSame.newlyActivated, false);
      assert.equal(redeemedSame.record.expiresAtMs, redeemedA.record.expiresAtMs);

      // Second device rejected due to single-device limit
      await assert.rejects(
        () =>
          redeemTrialPin({
            rawPin: created.plainPin,
            deviceId: 'bench_device_beta_02',
            nowMs: tActivate + 400_000,
          }),
        /DEVICE_LIMIT_REACHED/
      );

      // Verify bearer token checks: valid while active, invalid if device mismatched, locked on expiry
      assert.equal(
        verifyTrialBearerToken(redeemedA.trialToken, 'bench_device_alpha_01', tActivate + 1_000_000).valid,
        true
      );
      const wrongDevCheck = verifyTrialBearerToken(
        redeemedA.trialToken,
        'bench_device_beta_02',
        tActivate + 1_000_000
      );
      assert.equal(wrongDevCheck.valid, false);
      assert.equal(wrongDevCheck.code, 'DEVICE_LIMIT_REACHED');

      const expiredCheck = verifyTrialBearerToken(
        redeemedA.trialToken,
        'bench_device_alpha_01',
        tActivate + 4 * 3_600_000 + 1
      );
      assert.equal(expiredCheck.valid, false);
      assert.equal(expiredCheck.code, 'TRIAL_EXPIRED');
      assert.equal(
        getTrialStatusForDevice('bench_device_alpha_01', undefined, tActivate + 4 * 3_600_000 + 1).accessState,
        'TRIAL_EXPIRED'
      );

      // Device reset allows Device B to bind while within window
      resetTrialPinDevice(created.record.trialId, tActivate + 500_000);
      const redeemedB = await redeemTrialPin({
        rawPin: created.plainPin,
        deviceId: 'bench_device_beta_02',
        nowMs: tActivate + 600_000,
      });
      assert.equal(redeemedB.record.boundDeviceId, 'bench_device_beta_02');

      // Revocation locks token immediately
      setTrialPinRevocation({
        trialId: created.record.trialId,
        revoked: true,
        reason: 'Ended demo early',
        nowMs: tActivate + 700_000,
      });
      const revokedCheck = verifyTrialBearerToken(
        redeemedB.trialToken,
        'bench_device_beta_02',
        tActivate + 750_000
      );
      assert.equal(revokedCheck.valid, false);
      assert.equal(revokedCheck.code, 'TRIAL_REVOKED');
    } finally {
      if (prevMasterPin === undefined) {
        delete process.env.VECL_ADMIN_MASTER_PIN;
      } else {
        process.env.VECL_ADMIN_MASTER_PIN = prevMasterPin;
      }
      if (prevAllowFirstRun === undefined) {
        delete process.env.VECL_ALLOW_FIRST_RUN_ADMIN_SETUP;
      } else {
        process.env.VECL_ALLOW_FIRST_RUN_ADMIN_SETUP = prevAllowFirstRun;
      }
      if (prevStrictSecrets === undefined) {
        delete process.env.VECL_STRICT_PRODUCTION_SECRETS;
      } else {
        process.env.VECL_STRICT_PRODUCTION_SECRETS = prevStrictSecrets;
      }
      resetTrialStoreForTests();
      setTrialStoreFilePathForTests(null);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 27. End-to-End HTTP Trial PIN & Master Admin Route Integration
  await runTest('HTTP /api/autoelectric/trial/* enforces Master Admin PIN, generates 8-digit PINs, and gates AI + NHTSA routes cleanly', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vecl-trial-http-'));
    const storePath = path.join(tmpDir, 'trials.store.json');
    const prevMasterPin = process.env.VECL_ADMIN_MASTER_PIN;
    process.env.VECL_ADMIN_MASTER_PIN = '48291736';

    setTrialStoreFilePathForTests(storePath);
    resetTrialStoreForTests();

    const app = createAutoelectricApiApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // Unauthenticated protected AI route remains blocked with 401 AUTH_REQUIRED
      const noAuthAi = await fetch(`${baseUrl}/api/autoelectric/gemini-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', text: 'hello' }] }),
      });
      assert.equal(noAuthAi.status, 401);
      assert.equal(((await noAuthAi.json()) as { code?: string }).code, 'AUTH_REQUIRED');

      // Admin config reports masterEnvConfigured = true and pinInitialized = true
      const cfgRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/config`);
      assert.equal(cfgRes.status, 200);
      const cfgBody = (await cfgRes.json()) as {
        masterEnvConfigured: boolean;
        adminClaimed: boolean;
        pinInitialized: boolean;
      };
      assert.equal(cfgBody.masterEnvConfigured, true);
      assert.equal(cfgBody.pinInitialized, true);

      // Invalid Master Admin PIN -> 401
      const badAdminRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterPin: '00000000' }),
      });
      assert.equal(badAdminRes.status, 401);

      // Valid Master Admin PIN -> 200 + adminToken
      const goodAdminRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterPin: '4829-1736' }),
      });
      assert.equal(goodAdminRes.status, 200);
      const goodAdminBody = (await goodAdminRes.json()) as { adminToken: string };
      assert.ok(goodAdminBody.adminToken.startsWith('vecl_admin_v1.'));

      // Generate a 5-hour 8-digit trial PIN
      const genRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${goodAdminBody.adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ durationHours: 5, notes: 'Customer Bench Trial' }),
      });
      assert.equal(genRes.status, 201);
      const genBody = (await genRes.json()) as {
        plainPin: string;
        formattedPin: string;
        trial: { trialId: string; durationHours: number };
      };
      assert.match(genBody.plainPin, /^\d{8}$/);
      assert.equal(genBody.trial.durationHours, 5);

      // Technician redeems 8-digit PIN on Device 1
      const redeem1Res = await fetch(`${baseUrl}/api/autoelectric/trial/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: genBody.formattedPin,
          deviceId: 'http_trial_dev_1',
          deviceLabel: 'Diagnostic Laptop 1',
        }),
      });
      assert.equal(redeem1Res.status, 200);
      const redeem1Body = (await redeem1Res.json()) as {
        trialToken: string;
        newlyActivated: boolean;
      };
      assert.equal(redeem1Body.newlyActivated, true);
      assert.ok(redeem1Body.trialToken.startsWith('vecl_trial_v1.'));

      // Device 2 attempting same PIN is blocked with 403 DEVICE_LIMIT_REACHED
      const redeem2Res = await fetch(`${baseUrl}/api/autoelectric/trial/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: genBody.plainPin,
          deviceId: 'http_trial_dev_2',
          deviceLabel: 'Unauthorized Second Laptop',
        }),
      });
      assert.equal(redeem2Res.status, 403);
      assert.equal(((await redeem2Res.json()) as { code?: string }).code, 'DEVICE_LIMIT_REACHED');

      // Active trial token grants Full Pro access past auth & license middleware onto AI & NHTSA handlers (hits 400 validation, not 401/403)
      const trialAiRes = await fetch(`${baseUrl}/api/autoelectric/gemini-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redeem1Body.trialToken}`,
          'Content-Type': 'application/json',
          'X-VECL-Device-Id': 'http_trial_dev_1',
        },
        body: JSON.stringify({ messages: [{ role: 'user', text: '   ' }] }),
      });
      assert.equal(trialAiRes.status, 400);

      const trialVinRes = await fetch(`${baseUrl}/api/autoelectric/vin/INVALID`, {
        headers: {
          Authorization: `Bearer ${redeem1Body.trialToken}`,
          'X-VECL-Device-Id': 'http_trial_dev_1',
        },
      });
      assert.equal(trialVinRes.status, 400);

      // Admin revokes the trial PIN -> AI access is immediately blocked with 403 TRIAL_REVOKED
      const revokeRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/revoke`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${goodAdminBody.adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trialId: genBody.trial.trialId, revoked: true }),
      });
      assert.equal(revokeRes.status, 200);

      const blockedTrialAiRes = await fetch(`${baseUrl}/api/autoelectric/grounded-search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redeem1Body.trialToken}`,
          'Content-Type': 'application/json',
          'X-VECL-Device-Id': 'http_trial_dev_1',
        },
        body: JSON.stringify({ query: 'P0300 misfire' }),
      });
      assert.equal(blockedTrialAiRes.status, 403);
      assert.equal(((await blockedTrialAiRes.json()) as { code?: string }).code, 'TRIAL_REVOKED');

      // Admin logout revokes session token immediately
      const logoutRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${goodAdminBody.adminToken}`,
          'Content-Type': 'application/json',
        },
      });
      assert.equal(logoutRes.status, 200);

      const loggedOutListRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/list`, {
        headers: { Authorization: `Bearer ${goodAdminBody.adminToken}` },
      });
      assert.equal(loggedOutListRes.status, 401);
      assert.equal(((await loggedOutListRes.json()) as { code?: string }).code, 'TOKEN_REVOKED');

      // Health endpoint returns security headers (CSP & HSTS) and durable data dir telemetry
      const healthRes = await fetch(`${baseUrl}/api/health`);
      assert.equal(healthRes.status, 200);
      assert.ok(healthRes.headers.get('content-security-policy'));
      const healthJson = (await healthRes.json()) as { status: string; persistence?: { durableDataDirConfigured: boolean } };
      assert.equal(healthJson.status, 'ONLINE');
      assert.equal(typeof healthJson.persistence?.durableDataDirConfigured, 'boolean');
    } finally {
      if (prevMasterPin === undefined) {
        delete process.env.VECL_ADMIN_MASTER_PIN;
      } else {
        process.env.VECL_ADMIN_MASTER_PIN = prevMasterPin;
      }
      server.close();
      resetTrialStoreForTests();
      setTrialStoreFilePathForTests(null);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 27b. End-to-End HTTP Preview First-Run Admin PIN Setup & Rotation
  await runTest('HTTP /api/autoelectric/trial/admin/setup and /change-pin work cleanly in preview without .env secrets', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vecl-trial-firstrun-http-'));
    const storePath = path.join(tmpDir, 'trials.store.json');
    const prevMasterPin = process.env.VECL_ADMIN_MASTER_PIN;
    const prevAllowFirstRun = process.env.VECL_ALLOW_FIRST_RUN_ADMIN_SETUP;
    const prevStrictSecrets = process.env.VECL_STRICT_PRODUCTION_SECRETS;
    delete process.env.VECL_ADMIN_MASTER_PIN;
    delete process.env.VECL_ALLOW_FIRST_RUN_ADMIN_SETUP;
    delete process.env.VECL_STRICT_PRODUCTION_SECRETS;

    setTrialStoreFilePathForTests(storePath);
    resetTrialStoreForTests();

    const app = createAutoelectricApiApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const cfgBeforeRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/config`);
      assert.equal(cfgBeforeRes.status, 200);
      const cfgBefore = (await cfgBeforeRes.json()) as {
        masterEnvConfigured: boolean;
        setupEnabled: boolean;
        adminClaimed: boolean;
        pinInitialized: boolean;
      };
      assert.equal(cfgBefore.masterEnvConfigured, false);
      assert.equal(cfgBefore.setupEnabled, true);
      assert.equal(cfgBefore.adminClaimed, false);
      assert.equal(cfgBefore.pinInitialized, false);

      // Claim initial Master Admin PIN
      const setupRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterPin: '592041' }),
      });
      assert.equal(setupRes.status, 201);
      const setupBody = (await setupRes.json()) as { adminToken: string };
      assert.ok(setupBody.adminToken.startsWith('vecl_admin_v1.'));

      // Config now reports initialized and first-run setup locked
      const cfgAfterRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/config`);
      const cfgAfter = (await cfgAfterRes.json()) as {
        setupEnabled: boolean;
        adminClaimed: boolean;
        pinInitialized: boolean;
      };
      assert.equal(cfgAfter.setupEnabled, false);
      assert.equal(cfgAfter.adminClaimed, true);
      assert.equal(cfgAfter.pinInitialized, true);

      // Re-claiming fails with 409 ADMIN_ALREADY_CLAIMED
      const secondSetupRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterPin: '112233' }),
      });
      assert.equal(secondSetupRes.status, 409);

      // Authenticated PIN change updates credential and invalidates old PIN
      const changeRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/change-pin`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${setupBody.adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentPin: '592041', newPin: '84729103' }),
      });
      assert.equal(changeRes.status, 200);
      const changeBody = (await changeRes.json()) as { adminToken: string };
      assert.ok(changeBody.adminToken.startsWith('vecl_admin_v1.'));

      const oldPinLoginRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterPin: '592041' }),
      });
      assert.equal(oldPinLoginRes.status, 401);

      const newPinLoginRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterPin: '84729103' }),
      });
      assert.equal(newPinLoginRes.status, 200);
    } finally {
      if (prevMasterPin === undefined) delete process.env.VECL_ADMIN_MASTER_PIN;
      else process.env.VECL_ADMIN_MASTER_PIN = prevMasterPin;
      if (prevAllowFirstRun === undefined) delete process.env.VECL_ALLOW_FIRST_RUN_ADMIN_SETUP;
      else process.env.VECL_ALLOW_FIRST_RUN_ADMIN_SETUP = prevAllowFirstRun;
      if (prevStrictSecrets === undefined) delete process.env.VECL_STRICT_PRODUCTION_SECRETS;
      else process.env.VECL_STRICT_PRODUCTION_SECRETS = prevStrictSecrets;
      server.close();
      resetTrialStoreForTests();
      setTrialStoreFilePathForTests(null);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 28. Introduction Login PIN Landing Page Gate Invariants
  await runTest('Bench Lab strictly requires verified PIN entry on IntroductionPinLandingPage and leaks no admin secrets client-side', () => {
    const appSrc = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
    const ctxSrc = fs.readFileSync(path.resolve('src/context/TrialAccessContext.tsx'), 'utf8');
    const landingSrc = fs.readFileSync(path.resolve('src/components/IntroductionPinLandingPage.tsx'), 'utf8');

    assert.ok(appSrc.includes('isBenchEntryAuthorized'));
    assert.ok(appSrc.includes('IntroductionPinLandingPage'));
    assert.ok(appSrc.includes('AuthorizedBenchLabWorkspace'));
    assert.ok(ctxSrc.includes('const canUseAi = hasActiveProAccess;'));
    assert.ok(ctxSrc.includes('const canUseExports = hasActiveProAccess;'));
    assert.ok(ctxSrc.includes('!isManuallyLocked'));
    assert.equal(landingSrc.includes('VECL_ADMIN_MASTER_PIN'), false);
    assert.equal(landingSrc.includes('localStorage'), false);
    assert.equal(landingSrc.includes('sessionStorage'), false);
  });

  // 29. Admin Audit Log, Cumulative Device History, Remaining Duration & Backward-Compatible v1 Store Backfill
  await runTest('trialPinService records sanitized audit events, retains cumulative device counts across resets, and computes remainingSeconds', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vecl-trial-audit-'));
    const storePath = path.join(tmpDir, 'trials.store.json');
    setTrialStoreFilePathForTests(storePath);
    resetTrialStoreForTests();

    try {
      const t0 = 1_710_000_000_000;
      const created = createTrialPinRecord({
        durationHours: 3,
        notes: 'Bay 1 Diagnostics',
        actor: 'Master Admin',
        nowMs: t0,
      });

      // Activation on Device 1
      const tActivate = t0 + 10_000;
      await redeemTrialPin({
        rawPin: created.plainPin,
        deviceId: 'unique_dev_one_aaaa',
        deviceLabel: 'Bay 1 Tablet',
        nowMs: tActivate,
      });

      // Same device re-verification logs REVERIFIED without inflating totalDevicesUsed
      await redeemTrialPin({
        rawPin: created.formattedPin,
        deviceId: 'unique_dev_one_aaaa',
        deviceLabel: 'Bay 1 Tablet',
        nowMs: tActivate + 60_000,
      });

      // Device reset clears boundDeviceId but preserves cumulative totalDevicesUsed = 1
      const afterReset = resetTrialPinDevice(created.record.trialId, tActivate + 120_000, 'Master Admin');
      assert.equal(afterReset.boundDeviceId, null);
      assert.equal(afterReset.totalDevicesUsed, 1);
      assert.equal(afterReset.totalActivations, 2);

      // Re-bind to a second unique device after reset logs DEVICE_BIND and increments totalDevicesUsed = 2
      const boundSecond = await redeemTrialPin({
        rawPin: created.plainPin,
        deviceId: 'unique_dev_two_bbbb',
        deviceLabel: 'Bay 2 Oscilloscope PC',
        nowMs: tActivate + 180_000,
      });
      assert.equal(boundSecond.record.totalDevicesUsed, 2);
      assert.equal(boundSecond.record.totalActivations, 3);
      assert.equal(boundSecond.record.usageHistory.length, 2);
      assert.equal(
        boundSecond.record.usageHistory.filter((h) => h.isCurrentlyBound).length,
        1
      );

      // Revoke then restore
      setTrialPinRevocation({
        trialId: created.record.trialId,
        revoked: true,
        reason: 'Audit pause check',
        actor: 'Master Admin',
        nowMs: tActivate + 200_000,
      });
      setTrialPinRevocation({
        trialId: created.record.trialId,
        revoked: false,
        actor: 'Master Admin',
        nowMs: tActivate + 210_000,
      });

      // Query snapshot inside last <30 minutes (25 minutes remaining = 1500s)
      const checkNow = (boundSecond.record.expiresAtMs ?? 0) - 1500 * 1000;
      const snap = getAdminTrialAuditSnapshot(checkNow);
      assert.equal(snap.summary.totalPins, 1);
      assert.equal(snap.summary.activePins, 1);
      assert.equal(snap.summary.expiringSoonPins, 1);
      assert.equal(snap.summary.totalUniqueDevicesUsed, 2);
      assert.equal(snap.summary.totalActivations, 3);
      assert.equal(snap.trials[0].remainingSeconds, 1500);

      const eventTypes = snap.auditLog.map((e) => e.eventType);
      assert.ok(eventTypes.includes('GENERATED'));
      assert.ok(eventTypes.includes('ACTIVATED'));
      assert.ok(eventTypes.includes('REVERIFIED'));
      assert.ok(eventTypes.includes('DEVICE_RESET'));
      assert.ok(eventTypes.includes('DEVICE_BIND'));
      assert.ok(eventTypes.includes('REVOKED'));
      assert.ok(eventTypes.includes('RESTORED'));

      // Plaintext PIN & full raw device ID must NEVER appear in auditLog or usageHistory
      const serializedSnap = JSON.stringify({ auditLog: snap.auditLog, usageHistory: snap.trials[0].usageHistory });
      assert.equal(serializedSnap.includes(created.plainPin), false);
      assert.equal(serializedSnap.includes(created.formattedPin), false);
      assert.equal(serializedSnap.includes('unique_dev_one_aaaa'), false);
      assert.equal(serializedSnap.includes('unique_dev_two_bbbb'), false);

      // Simulate backward-compatible v1 disk file without deviceHistory/auditLog
      const rawDisk = JSON.parse(fs.readFileSync(storePath, 'utf8')) as {
        schemaVersion: number;
        updatedAtMs: number;
        trials: Array<Record<string, unknown>>;
        adminCredential: unknown;
      };
      const v1Trials = rawDisk.trials.map((t) => {
        const copy = { ...t };
        delete copy.deviceHistory;
        delete copy.totalActivations;
        return copy;
      });
      fs.writeFileSync(
        storePath,
        JSON.stringify({
          schemaVersion: 1,
          updatedAtMs: tActivate,
          trials: v1Trials,
          adminCredential: rawDisk.adminCredential,
        }),
        'utf8'
      );
      reloadTrialStoreFromDisk();
      const v1Snap = getAdminTrialAuditSnapshot(checkNow);
      assert.equal(v1Snap.trials[0].totalDevicesUsed, 1);
      assert.equal(v1Snap.trials[0].usageHistory[0].isCurrentlyBound, true);
    } finally {
      resetTrialStoreForTests();
      setTrialStoreFilePathForTests(null);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 30. HTTP Admin Audit Endpoint + Footer <30m Countdown Alert & Context/Modal Integration Invariants
  await runTest('HTTP /trial/admin/list returns sanitized audit log & usage summary, and UI components wire <30m footer alert', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vecl-trial-audit-http-'));
    const storePath = path.join(tmpDir, 'trials.store.json');
    const prevMasterPin = process.env.VECL_ADMIN_MASTER_PIN;
    process.env.VECL_ADMIN_MASTER_PIN = '61928374';

    setTrialStoreFilePathForTests(storePath);
    resetTrialStoreForTests();

    const app = createAutoelectricApiApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // Unauthenticated request to /trial/admin/list rejected
      const unauthList = await fetch(`${baseUrl}/api/autoelectric/trial/admin/list`);
      assert.equal(unauthList.status, 401);

      const loginRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterPin: '61928374' }),
      });
      assert.equal(loginRes.status, 200);
      const { adminToken } = (await loginRes.json()) as { adminToken: string };

      const genRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationHours: 4, notes: 'HTTP Audit Check' }),
      });
      assert.equal(genRes.status, 201);
      const genBody = (await genRes.json()) as { plainPin: string; trial: { trialId: string } };

      const redeemRes = await fetch(`${baseUrl}/api/autoelectric/trial/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: genBody.plainPin,
          deviceId: 'http_audit_dev_9999',
          deviceLabel: 'Diagnostic Cart #9',
        }),
      });
      assert.equal(redeemRes.status, 200);

      const listRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/list`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(listRes.status, 200);
      const listBody = (await listRes.json()) as {
        trials: Array<{
          totalDevicesUsed: number;
          totalActivations: number;
          remainingSeconds: number | null;
          usageHistory: Array<{ maskedDeviceId: string }>;
        }>;
        auditLog: Array<{ eventType: string; maskedPin: string }>;
        summary: { totalPins: number; activePins: number; totalUniqueDevicesUsed: number };
      };
      assert.equal(listBody.summary.totalPins, 1);
      assert.equal(listBody.summary.activePins, 1);
      assert.equal(listBody.summary.totalUniqueDevicesUsed, 1);
      assert.equal(listBody.trials[0].totalDevicesUsed, 1);
      assert.equal(listBody.trials[0].totalActivations, 1);
      assert.ok((listBody.trials[0].remainingSeconds ?? 0) > 14_000);
      assert.ok(listBody.auditLog.some((e) => e.eventType === 'GENERATED'));
      assert.ok(listBody.auditLog.some((e) => e.eventType === 'ACTIVATED'));
      assert.equal(JSON.stringify(listBody).includes(genBody.plainPin), false);
      assert.equal(
        JSON.stringify({
          auditLog: listBody.auditLog,
          usageHistory: listBody.trials[0].usageHistory,
        }).includes('http_audit_dev_9999'),
        false
      );

      // Verify client context, AdminLicenseModal audit log, and LabStatusFooter <30m alert wiring
      const ctxSrc = fs.readFileSync(path.resolve('src/context/TrialAccessContext.tsx'), 'utf8');
      const footerSrc = fs.readFileSync(path.resolve('src/components/LabStatusFooter.tsx'), 'utf8');
      const modalSrc = fs.readFileSync(path.resolve('src/components/AdminLicenseModal.tsx'), 'utf8');

      assert.ok(ctxSrc.includes('remainingSeconds < 1800'));
      assert.ok(ctxSrc.includes('refreshAdminAuditData'));
      assert.ok(footerSrc.includes('footer-trial-lowtime-btn'));
      assert.ok(footerSrc.includes('isLowTimeWarning'));
      assert.ok(footerSrc.includes('openAccessModal'));
      assert.ok(modalSrc.includes('Secure Admin Audit Log'));
      assert.ok(modalSrc.includes('Security Audit Log'));
      assert.ok(modalSrc.includes('totalDevicesUsed'));
    } finally {
      if (prevMasterPin === undefined) {
        delete process.env.VECL_ADMIN_MASTER_PIN;
      } else {
        process.env.VECL_ADMIN_MASTER_PIN = prevMasterPin;
      }
      server.close();
      resetTrialStoreForTests();
      setTrialStoreFilePathForTests(null);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 31. Extended Durations (30d / 3m / 6m / 1y), Multi-Day Countdown & Remaining Duration % Calculations
  await runTest('Extended 30d/3m/6m/1y trial presets issue, redeem, calculate remainingSeconds/%, format multi-day countdowns, and revoke immediately', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vecl-trial-ext-'));
    const storePath = path.join(tmpDir, 'trials.store.json');
    const prevMasterPin = process.env.VECL_ADMIN_MASTER_PIN;
    process.env.VECL_ADMIN_MASTER_PIN = '73918264';

    setTrialStoreFilePathForTests(storePath);
    resetTrialStoreForTests();

    const app = createAutoelectricApiApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const extendedDurations: Array<{ hours: TrialDurationHours; shortLabel: string; fullLabel: string }> = [
        { hours: 720, shortLabel: '30d', fullLabel: '30 Days' },
        { hours: 2160, shortLabel: '3m', fullLabel: '3 Months' },
        { hours: 4320, shortLabel: '6m', fullLabel: '6 Months' },
        { hours: 8760, shortLabel: '1y', fullLabel: '1 Year' },
      ];

      assert.equal(TRIAL_DURATION_PRESETS.length, 8);
      for (const spec of extendedDurations) {
        assert.equal(formatTrialDurationLabel(spec.hours, 'short'), spec.shortLabel);
        assert.equal(formatTrialDurationLabel(spec.hours, 'full'), spec.fullLabel);
      }

      // Multi-day countdown formatting preserves HH:MM:SS <24h and DDd HH:MM:SS >=24h
      assert.equal(formatTrialCountdown(3661), '01:01:01');
      assert.equal(formatTrialCountdown(86400), '1d 00:00:00');
      assert.equal(formatTrialCountdown(720 * 3600), '30d 00:00:00');
      assert.equal(formatTrialCountdown(8760 * 3600 - 1), '364d 23:59:59');

      // Service-level verification for all 4 extended durations
      const baseNow = 1_720_000_000_000;
      for (let i = 0; i < extendedDurations.length; i += 1) {
        const spec = extendedDurations[i];
        const created = createTrialPinRecord({
          durationHours: spec.hours,
          unusedExpiryHours: 720,
          notes: `Extended Fleet ${spec.shortLabel}`,
          nowMs: baseNow + i * 1000,
        });
        assert.equal(created.record.durationHours, spec.hours);
        assert.equal(created.record.unusedExpiresAtMs, baseNow + i * 1000 + 720 * 3_600_000);

        const activateMs = baseNow + 60_000 + i * 1000;
        const redeemed = await redeemTrialPin({
          rawPin: created.plainPin,
          deviceId: `ext_device_${spec.shortLabel}`,
          deviceLabel: `Bay ${spec.shortLabel}`,
          nowMs: activateMs,
        });
        assert.equal(redeemed.record.expiresAtMs, activateMs + spec.hours * 3_600_000);

        // At 50% elapsed, remainingSeconds and percentage match 50%
        const midpointMs = activateMs + (spec.hours * 3_600_000) / 2;
        const statusMid = getTrialStatusForDevice(
          `ext_device_${spec.shortLabel}`,
          undefined,
          midpointMs
        );
        assert.equal(statusMid.accessState, 'TRIAL_ACTIVE');
        assert.ok(statusMid.trial);
        assert.equal(
          computeRemainingPercentForTrial({
            status: 'ACTIVE',
            durationHours: spec.hours,
            remainingSeconds: statusMid.trial.remainingSeconds,
          }),
          50
        );
      }

      // HTTP end-to-end 1-year (8760h) generation, redemption, immediate revocation, and restore
      const adminLoginRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterPin: '73918264' }),
      });
      assert.equal(adminLoginRes.status, 200);
      const { adminToken } = (await adminLoginRes.json()) as { adminToken: string };

      const genYearRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationHours: 8760, unusedExpiryHours: 720, notes: 'Annual Bay License' }),
      });
      assert.equal(genYearRes.status, 201);
      const genYearBody = (await genYearRes.json()) as {
        plainPin: string;
        trial: { trialId: string; durationHours: number };
      };
      assert.equal(genYearBody.trial.durationHours, 8760);

      const redeemYearRes = await fetch(`${baseUrl}/api/autoelectric/trial/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: genYearBody.plainPin,
          deviceId: 'annual_http_bay_01',
          deviceLabel: 'Master Diagnostic Cart',
        }),
      });
      assert.equal(redeemYearRes.status, 200);
      const { trialToken } = (await redeemYearRes.json()) as { trialToken: string };

      // Immediate Admin revocation returns updated REVOKED status and blocks AI calls immediately
      const revokeRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trialId: genYearBody.trial.trialId, revoked: true }),
      });
      assert.equal(revokeRes.status, 200);
      const revokeBody = (await revokeRes.json()) as { trial: { status: string } };
      assert.equal(revokeBody.trial.status, 'REVOKED');

      const blockedRes = await fetch(`${baseUrl}/api/autoelectric/gemini-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${trialToken}`,
          'Content-Type': 'application/json',
          'X-VECL-Device-Id': 'annual_http_bay_01',
        },
        body: JSON.stringify({ messages: [{ role: 'user', text: 'check pin' }] }),
      });
      assert.equal(blockedRes.status, 403);
      assert.equal(((await blockedRes.json()) as { code?: string }).code, 'TRIAL_REVOKED');

      // One-click Restore unlocks the same active 1-year session cleanly
      const restoreRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trialId: genYearBody.trial.trialId, revoked: false }),
      });
      assert.equal(restoreRes.status, 200);
      const restoreBody = (await restoreRes.json()) as { trial: { status: string } };
      assert.equal(restoreBody.trial.status, 'ACTIVE');
    } finally {
      if (prevMasterPin === undefined) {
        delete process.env.VECL_ADMIN_MASTER_PIN;
      } else {
        process.env.VECL_ADMIN_MASTER_PIN = prevMasterPin;
      }
      server.close();
      resetTrialStoreForTests();
      setTrialStoreFilePathForTests(null);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 32. CSV Audit Export Sanitization (PII Scrubbing + Formula Neutralization) & UI Controls Verification
  await runTest('buildTrialAuditCsv scrubs user IDs, emails, and device IDs, neutralizes formula injection, keeps usage stats, and leaks zero secrets', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vecl-trial-csv-'));
    const storePath = path.join(tmpDir, 'trials.store.json');
    setTrialStoreFilePathForTests(storePath);
    resetTrialStoreForTests();

    try {
      const t0 = 1_725_000_000_000;
      const created = createTrialPinRecord({
        durationHours: 2160,
        notes: '=CMD("calc") "Quote,Comma" tech.owner@shop.example uid:usr_secret9988 vecl_dev_abc12345',
        actor: 'admin@shop.example',
        nowMs: t0,
      });

      await redeemTrialPin({
        rawPin: created.plainPin,
        deviceId: 'csv_secret_raw_device_8842',
        deviceLabel: '+HYPERLINK("evil.example") Bay-PC-99',
        nowMs: t0 + 5000,
      });

      setTrialPinRevocation({
        trialId: created.record.trialId,
        revoked: true,
        reason: '+HYPERLINK("evil.example") for uid:tech_user_7741',
        actor: 'pin-admin:master',
        nowMs: t0 + 8000,
      });

      const snap = getAdminTrialAuditSnapshot(t0 + 10_000);
      const csv = buildTrialAuditCsv({
        trials: snap.trials,
        auditLog: snap.auditLog,
        exportedAtMs: t0 + 10_000,
      });

      // UTF-8 BOM + both structured sections present
      assert.ok(csv.startsWith('\uFEFF'));
      assert.ok(csv.includes('SECTION 1: SECURITY AUDIT EVENT LOG'));
      assert.ok(csv.includes('SECTION 2: TRIAL PIN & USAGE SUMMARY'));
      assert.ok(csv.includes('3 Months'));
      // Usage stats & device binding status preserved while sensitive columns removed
      assert.ok(csv.includes('Device Binding Status'));
      assert.ok(csv.includes('Unique Devices Used'));
      assert.ok(csv.includes('Total Activations'));
      assert.ok(csv.includes('Bound (1/1)'));
      assert.equal(csv.includes('Masked Device ID'), false);
      assert.equal(csv.includes('Workstation Label'), false);

      // RFC-4180 & spreadsheet formula injection neutralization checks
      assert.equal(escapeAuditCsvCell('=1+1'), "'=1+1");
      assert.equal(escapeAuditCsvCell('+SUM(A1:A2)'), "'+SUM(A1:A2)");
      assert.equal(escapeAuditCsvCell('-2+3'), "'-2+3");
      assert.equal(escapeAuditCsvCell('@cmd'), "'@cmd");
      assert.ok(csv.includes('"\'=CMD(""calc"") ""Quote,Comma""'));
      assert.ok(csv.includes("'+HYPERLINK("));

      // Sensitive identifier scrubbing invariants (emails, user IDs, device IDs)
      assert.equal(scrubAuditActor('admin@shop.example'), 'Admin');
      assert.equal(scrubAuditActor('pin-admin:master'), 'Master Admin');
      assert.equal(scrubAuditActor('uid:abc123456'), 'Admin');
      assert.equal(scrubAuditActor('technician'), 'Technician');
      assert.ok(scrubSensitiveAuditText('user=tech@shop.example').includes('[REDACTED_EMAIL]'));
      assert.ok(scrubSensitiveAuditText('deviceId=vecl_dev_998877').includes('[REDACTED_DEVICE_ID]'));
      assert.equal(csv.includes('tech.owner@shop.example'), false);
      assert.equal(csv.includes('admin@shop.example'), false);
      assert.equal(csv.includes('usr_secret9988'), false);
      assert.equal(csv.includes('tech_user_7741'), false);
      assert.equal(csv.includes('vecl_dev_abc12345'), false);
      assert.equal(csv.includes('csv_secret_raw_device_8842'), false);
      assert.equal(csv.includes('dev_•••8842'), false);
      assert.equal(csv.includes('Bay-PC-99'), false);

      // Secret PIN leakage invariants
      assert.equal(csv.includes(created.plainPin), false);
      assert.equal(csv.includes(created.formattedPin), false);

      // UI wiring verification for AdminLicenseModal & IntroductionPinLandingPage
      const modalSrc = fs.readFileSync(path.resolve('src/components/AdminLicenseModal.tsx'), 'utf8');
      const landingSrc = fs.readFileSync(path.resolve('src/components/IntroductionPinLandingPage.tsx'), 'utf8');

      assert.ok(modalSrc.includes('TRIAL_DURATION_PRESETS'));
      assert.ok(modalSrc.includes('admin-export-logs-btn'));
      assert.ok(modalSrc.includes('audit-status-badge-'));
      assert.ok(modalSrc.includes('role="progressbar"'));
      assert.ok(modalSrc.includes('audit-revoke-btn-'));
      assert.ok(modalSrc.includes('Export Logs'));
      assert.ok(landingSrc.includes('TRIAL_DURATION_PRESETS'));
      assert.ok(landingSrc.includes('formatTrialDurationLabel'));
    } finally {
      resetTrialStoreForTests();
      setTrialStoreFilePathForTests(null);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 33. Historical CSV Audit Import & Restoration Lifecycle
  await runTest('importHistoricalAuditCsv & POST /trial/admin/import restore audit history idempotently, preserve live credentials, and enforce auth/validation', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vecl-trial-import-'));
    const storePath = path.join(tmpDir, 'trials.store.json');
    const prevMasterPin = process.env.VECL_ADMIN_MASTER_PIN;
    process.env.VECL_ADMIN_MASTER_PIN = '51829473';

    setTrialStoreFilePathForTests(storePath);
    resetTrialStoreForTests();

    const app = createAutoelectricApiApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const t0 = 1_730_000_000_000;
      const histA = createTrialPinRecord({
        durationHours: 720,
        notes: '=SUM(A1:A2) Fleet Historical Note',
        actor: 'Master Admin',
        nowMs: t0,
      });
      await redeemTrialPin({
        rawPin: histA.plainPin,
        deviceId: 'hist_dev_alpha_101',
        deviceLabel: 'Service Bay #7',
        nowMs: t0 + 10_000,
      });
      setTrialPinRevocation({
        trialId: histA.record.trialId,
        revoked: true,
        reason: 'Ended fleet demo',
        actor: 'Master Admin',
        nowMs: t0 + 20_000,
      });

      const exportedSnap = getAdminTrialAuditSnapshot(t0 + 30_000);
      const exportedCsv = buildTrialAuditCsv({
        trials: exportedSnap.trials,
        auditLog: exportedSnap.auditLog,
        exportedAtMs: t0 + 30_000,
      });

      // Reset store completely (simulating fresh instance / store rotation)
      resetTrialStoreForTests();
      assert.equal(getAdminTrialAuditSnapshot().trials.length, 0);

      // Restore via unit helper
      const restored = importHistoricalAuditCsv({
        csvContent: exportedCsv,
        filename: 'fleet-backup.csv',
        actor: 'Master Admin',
        nowMs: t0 + 40_000,
      });
      assert.equal(restored.importedEvents, exportedSnap.auditLog.length);
      assert.equal(restored.importedTrials, 1);
      assert.equal(restored.skippedInvalidRows, 0);
      assert.equal(restored.snapshot.trials[0].trialId, histA.record.trialId);
      assert.equal(restored.snapshot.trials[0].status, 'REVOKED');
      assert.equal(restored.snapshot.trials[0].totalDevicesUsed, 1);
      assert.equal(restored.snapshot.trials[0].totalActivations, 1);
      // Formula prefix stripped cleanly on restore so re-export won't stack apostrophes
      assert.equal(restored.snapshot.trials[0].notes, '=SUM(A1:A2) Fleet Historical Note');
      assert.ok(restored.snapshot.auditLog.some((e) => e.eventType === 'IMPORTED'));

      // Reload from disk preserves imported audit records cleanly
      reloadTrialStoreFromDisk();
      assert.equal(getAdminTrialAuditSnapshot(t0 + 50_000).trials.length, 1);

      // Idempotency: importing the exact same CSV again skips all existing records/events
      const secondPass = importHistoricalAuditCsv({
        csvContent: exportedCsv,
        filename: 'fleet-backup.csv',
        actor: 'Master Admin',
        nowMs: t0 + 60_000,
      });
      assert.equal(secondPass.importedEvents, 0);
      assert.equal(secondPass.importedTrials, 0);
      assert.equal(secondPass.skippedDuplicateEvents, exportedSnap.auditLog.length);
      assert.equal(secondPass.skippedExistingTrials, 1);

      // HTTP endpoint checks: 401 unauthenticated, 400 malformed CSV, 200 valid CSV upload
      const unauthImport = await fetch(`${baseUrl}/api/autoelectric/trial/admin/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent: exportedCsv }),
      });
      assert.equal(unauthImport.status, 401);

      const loginRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterPin: '51829473' }),
      });
      assert.equal(loginRes.status, 200);
      const { adminToken } = (await loginRes.json()) as { adminToken: string };

      const badCsvRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent: 'colA,colB\n1,2\n', filename: 'wrong.csv' }),
      });
      assert.equal(badCsvRes.status, 400);
      assert.equal(((await badCsvRes.json()) as { code?: string }).code, 'INVALID_CSV_FORMAT');

      // Wipe store and restore via HTTP endpoint with live PIN conflict protection check
      resetTrialStoreForTests();
      const livePin = createTrialPinRecord({ durationHours: 3, notes: 'Live Active', nowMs: t0 });
      const liveAndHistSnap = {
        trials: exportedSnap.trials,
        auditLog: exportedSnap.auditLog,
      };
      const httpCsv = buildTrialAuditCsv({
        trials: liveAndHistSnap.trials,
        auditLog: liveAndHistSnap.auditLog,
        exportedAtMs: t0 + 70_000,
      });

      const okImportRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent: httpCsv, filename: 'http-restore.csv' }),
      });
      assert.equal(okImportRes.status, 200);
      const okImportBody = (await okImportRes.json()) as {
        importedEvents: number;
        importedTrials: number;
        trials: Array<{ trialId: string }>;
      };
      assert.equal(okImportBody.importedTrials, 1);
      assert.ok(okImportBody.importedEvents >= 1);
      assert.ok(okImportBody.trials.some((t) => t.trialId === livePin.record.trialId));
      assert.ok(okImportBody.trials.some((t) => t.trialId === histA.record.trialId));

      // Verify live PIN still redeems normally after CSV import
      const liveRedeem = await redeemTrialPin({
        rawPin: livePin.plainPin,
        deviceId: 'live_post_import_dev',
        nowMs: t0 + 80_000,
      });
      assert.equal(liveRedeem.newlyActivated, true);

      // Verify AdminLicenseModal UI contains Import Logs upload controls
      const modalSrc = fs.readFileSync(path.resolve('src/components/AdminLicenseModal.tsx'), 'utf8');
      assert.ok(modalSrc.includes('admin-import-logs-btn'));
      assert.ok(modalSrc.includes('admin-import-logs-input'));
      assert.ok(modalSrc.includes('Import Logs'));
      assert.ok(modalSrc.includes('importAdminTrialAuditCsv'));
    } finally {
      if (prevMasterPin === undefined) {
        delete process.env.VECL_ADMIN_MASTER_PIN;
      } else {
        process.env.VECL_ADMIN_MASTER_PIN = prevMasterPin;
      }
      server.close();
      resetTrialStoreForTests();
      setTrialStoreFilePathForTests(null);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 34. Local Workstation Offline Fallback Storage & Google Sign-In Cloud Sync Regression Guards
  await runTest('LOCAL_WORKSTATION_UID offline bench storage persists sessions & logs while Google Sign-In cloud sync is wired cleanly', async () => {
    let observedSessions: Array<{ id: string; title: string }> = [];
    let observedLogs: Array<{ id: string; title: string }> = [];

    const unsubSessions = subscribeBenchSessions(LOCAL_WORKSTATION_UID, (sessions) => {
      observedSessions = sessions.map((s) => ({ id: s.id, title: s.title }));
    });
    const unsubLogs = subscribeDiagnosticLogs(LOCAL_WORKSTATION_UID, (logs) => {
      observedLogs = logs.map((l) => ({ id: l.id, title: l.title }));
    });

    try {
      const savedSess = await saveBenchSession(LOCAL_WORKSTATION_UID, {
        title: 'Local Bench Session #1',
        ecuProfileLabel: 'Toyota Denso 175822',
        powerSupply: {
          voltageSetting: 14.4,
          currentLimit: 3.0,
          isOutputEnabled: true,
          preset: '14.4V_RUNNING',
        },
        wires: [],
        faults: [],
        components: [],
        activeDtcs: ['P0122'],
        supplyCurrentDrawAmps: 0.42,
      });
      assert.equal(savedSess.queuedOffline, false);

      const savedLog = await saveDiagnosticLog(LOCAL_WORKSTATION_UID, {
        title: 'Local Diagnostic Log #1',
        dtcCode: 'P0122',
        ecuModel: 'Toyota Denso 175822',
        sourceType: 'BENCH_SNAPSHOT',
        summary: 'TPS signal low test logged locally without Google Sign-In.',
      });
      assert.equal(savedLog.queuedOffline, false);

      // Wait a microtask tick for reactive local IndexedDB/cache subscriptions
      await new Promise((r) => setTimeout(r, 25));
      assert.ok(observedSessions.some((s) => s.id === savedSess.id && s.title === 'Local Bench Session #1'));
      assert.ok(observedLogs.some((l) => l.id === savedLog.id && l.title === 'Local Diagnostic Log #1'));

      await deleteBenchSession(LOCAL_WORKSTATION_UID, savedSess.id);
      await deleteDiagnosticLog(LOCAL_WORKSTATION_UID, savedLog.id);
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(observedSessions.some((s) => s.id === savedSess.id), false);
      assert.equal(observedLogs.some((l) => l.id === savedLog.id), false);

      // Verify Google Sign-In + Firestore cloud sync wiring + offline fallback in active shell components
      const landingSrc = fs.readFileSync(path.resolve('src/components/IntroductionPinLandingPage.tsx'), 'utf8');
      const navDrawerSrc = fs.readFileSync(path.resolve('src/components/NavigationDrawer.tsx'), 'utf8');
      const appSrc = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
      const cloudModalSrc = fs.readFileSync(path.resolve('src/components/BenchCloudModal.tsx'), 'utf8');

      assert.equal(landingSrc.includes('signInWithGoogle'), true);
      assert.equal(navDrawerSrc.includes('signInWithGoogle'), true);
      assert.equal(appSrc.includes('activeStorageUid'), true);
      assert.equal(cloudModalSrc.includes('activeStorageUid'), true);
      assert.equal(appSrc.includes('LOCAL_WORKSTATION_UID'), true);
      assert.equal(cloudModalSrc.includes('LOCAL_WORKSTATION_UID'), true);
    } finally {
      unsubSessions();
      unsubLogs();
    }
  });

  // 34. Security Hardening Regression Suite (Trial Session Recovery, Per-IP PIN Throttling, WS IP Spoof Guard, Error Sanitization)
  await runTest('Security hardening blocks unauthenticated trial token minting, deviceId-rotated PIN brute force, WS X-Forwarded-For spoofing, and raw error leakage', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vecl-sec-hardening-'));
    const storePath = path.join(tmpDir, 'trials.store.json');
    const prevMasterPin = process.env.VECL_ADMIN_MASTER_PIN;
    process.env.VECL_ADMIN_MASTER_PIN = '61948273';
    setTrialStoreFilePathForTests(storePath);
    resetTrialStoreForTests();

    const app = createAutoelectricApiApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // 1. Admin creates a trial PIN and legitimate workstation redeems it (receiving HttpOnly cookie)
      const adminRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterPin: '61948273' }),
      });
      assert.equal(adminRes.status, 200);
      const { adminToken } = (await adminRes.json()) as { adminToken: string };

      const genRes = await fetch(`${baseUrl}/api/autoelectric/trial/admin/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationHours: 4, notes: 'Security Regression Trial' }),
      });
      assert.equal(genRes.status, 201);
      const genBody = (await genRes.json()) as { plainPin: string };

      const victimDeviceId = 'vecl_dev_victim_workstation_9988';
      const redeemRes = await fetch(`${baseUrl}/api/autoelectric/trial/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VECL-Device-Id': victimDeviceId },
        body: JSON.stringify({ pin: genBody.plainPin, deviceId: victimDeviceId, deviceLabel: 'Victim Bay' }),
      });
      assert.equal(redeemRes.status, 200);
      const setCookieHeader = redeemRes.headers.get('set-cookie') || '';
      assert.ok(setCookieHeader.includes('vecl_trial_session='), 'Expected HttpOnly trial session cookie');
      assert.ok(setCookieHeader.toLowerCase().includes('httponly'), 'Trial session cookie must be HttpOnly');
      const cookiePair = setCookieHeader.split(';')[0];

      // 2. Unauthenticated attacker knowing victimDeviceId CANNOT mint a trialToken via query or header
      const attackStatusRes = await fetch(
        `${baseUrl}/api/autoelectric/trial/status?deviceId=${encodeURIComponent(victimDeviceId)}`,
        {
          method: 'GET',
          headers: { 'X-VECL-Device-Id': victimDeviceId },
        }
      );
      assert.equal(attackStatusRes.status, 200);
      const attackStatusBody = (await attackStatusRes.json()) as {
        hasAccess: boolean;
        trialToken: string | null;
        trial: unknown;
        accessState: string;
      };
      assert.equal(attackStatusBody.hasAccess, false);
      assert.equal(attackStatusBody.trialToken, null);
      assert.equal(attackStatusBody.trial, null);
      assert.equal(attackStatusBody.accessState, 'UNLICENSED');

      // 3. Legitimate browser sending HttpOnly session cookie + matching device header restores active session
      const legitCookieStatusRes = await fetch(`${baseUrl}/api/autoelectric/trial/status`, {
        method: 'GET',
        headers: {
          'X-VECL-Device-Id': victimDeviceId,
          Cookie: cookiePair,
        },
      });
      assert.equal(legitCookieStatusRes.status, 200);
      const legitCookieBody = (await legitCookieStatusRes.json()) as {
        hasAccess: boolean;
        trialToken: string | null;
        accessState: string;
      };
      assert.equal(legitCookieBody.hasAccess, true);
      assert.equal(legitCookieBody.accessState, 'TRIAL_ACTIVE');
      assert.ok(legitCookieBody.trialToken?.startsWith('vecl_trial_v1.'));

      // 4. Rotating deviceId on /api/autoelectric/trial/redeem from the same IP triggers 429 TRIAL_RATE_LIMITED
      let saw429 = false;
      for (let i = 0; i < 10; i += 1) {
        const bruteRes = await fetch(`${baseUrl}/api/autoelectric/trial/redeem`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pin: String(10000000 + i),
            deviceId: `attacker_rotating_device_${i}`,
          }),
        });
        if (bruteRes.status === 429) {
          saw429 = true;
          const body = (await bruteRes.json()) as { code?: string };
          assert.equal(body.code, 'TRIAL_RATE_LIMITED');
          break;
        }
      }
      assert.equal(saw429, true, 'Rotating deviceId must not bypass per-IP trial PIN rate limiting');

      // 5. WebSocket getUpgradeClientIp resists X-Forwarded-For spoofing
      const spoofedProxiedReq = {
        socket: { remoteAddress: '127.0.0.1' },
        headers: { 'x-forwarded-for': '203.0.113.99, 198.51.100.42' },
      } as unknown as http.IncomingMessage;
      assert.equal(
        getUpgradeClientIp(spoofedProxiedReq),
        '198.51.100.42',
        'Must select rightmost proxy-appended IP, not leftmost spoofable entry'
      );

      const spoofedDirectReq = {
        socket: { remoteAddress: '198.51.100.77' },
        headers: { 'x-forwarded-for': '203.0.113.10' },
      } as unknown as http.IncomingMessage;
      assert.equal(
        getUpgradeClientIp(spoofedDirectReq),
        '198.51.100.77',
        'Must ignore X-Forwarded-For when direct peer is not a trusted proxy'
      );

      // 6. Unexpected NHTSA errors do not leak internal error details to clients
      setNhtsaFetchForTests(async () => {
        throw new Error('INTERNAL_SOCKET_DETAIL: ECONNREFUSED 10.128.0.5:443');
      });
      try {
        const errVinRes = await fetch(`${baseUrl}/api/autoelectric/vin/1FTEW1EF3GKE12345`, {
          headers: {
            Authorization: `Bearer ${legitCookieBody.trialToken}`,
            'X-VECL-Device-Id': victimDeviceId,
          },
        });
        assert.equal(errVinRes.status, 502);
        const errVinText = await errVinRes.text();
        assert.equal(errVinText.includes('INTERNAL_SOCKET_DETAIL'), false);
        assert.equal(errVinText.includes('10.128.0.5'), false);
      } finally {
        resetNhtsaStateForTests();
      }
    } finally {
      if (prevMasterPin === undefined) {
        delete process.env.VECL_ADMIN_MASTER_PIN;
      } else {
        process.env.VECL_ADMIN_MASTER_PIN = prevMasterPin;
      }
      server.close();
      resetTrialStoreForTests();
      setTrialStoreFilePathForTests(null);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  console.log(`\nAutomotive Integration Test Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main();
