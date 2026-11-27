/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import express from 'express';
import { ThinkingLevel } from '@google/genai';
import {
  getImageAnalysisProvider,
  resolveImageAnalysisProviderName,
} from './services/imageAnalysisProvider';
import { ImageAnalysisProviderError } from './services/imageAnalysisTypes';
import { isStrictProductionSecrets } from './services/secretsPolicy';
import { resolveGeminiModelName } from './services/imageAnalysisNormalizer';
import {
  AuthenticatedRequest,
  requireAuthOrTrialSession,
  requireFirebaseAuth,
  verifyFirebaseIdToken,
} from './services/firebaseAuthMiddleware';
import {
  maskUidForDiagnostics,
  probePostgresConnection,
} from './services/connectionHealthService';
import { classifyGeminiError } from './services/geminiErrorClassifier';
import {
  getFreeTierPoolSnapshot,
  getGeminiClientForApiKey,
  getQuotaManagerSnapshot,
  hasConfiguredGeminiKeys,
  recordRouteAttemptStart,
  recordRouteFailure,
  recordRouteSuccess,
  resolveAdjustedThinkingLevel,
  selectFreeTierRoutes,
} from './services/geminiFreeTierRouter';
import {
  executeFreeTierGatewayPrompt,
  getGatewayUsageSnapshot,
} from './services/geminiFreeTierGateway';
import { validateImagePayload } from './services/imagePayloadValidator';
import {
  buildNhtsaProvenance,
  decodeVinViaNhtsa,
  fetchNhtsaRecallsAndComplaints,
  fetchVehicleMakesAndWmiViaNhtsa,
  maskVin,
  NHTSA_STALE_CACHE_WARNING,
  NHTSA_US_COVERAGE_NOTE,
  NhtsaUpstreamError,
  NhtsaVehicleLookupResponse,
} from './services/nhtsaService';
import {
  checkRedeemRateLimit,
  createLicenseCodeRecord,
  extendLicenseDuration,
  getUserLicenseStatus,
  isVerifiedAdminUser,
  LicenseDurationPlan,
  listAllLicensesForAdmin,
  redeemLicenseCode,
  requireActiveLicense,
  resetLicenseDevices,
  setLicenseRevocation,
} from './services/licenseService';
import {
  checkAdminPinRateLimit,
  checkTrialRedeemGlobalRateLimit,
  checkTrialRedeemRateLimit,
  createTrialPinRecord,
  getAdminPinConfigStatus,
  getAdminTrialAuditSnapshot,
  getTrialStatusForDevice,
  importHistoricalAuditCsv,
  redeemTrialPin,
  resetTrialPinDevice,
  revokeAdminSessionToken,
  revokeAllAdminSessionTokens,
  setTrialPinRevocation,
  setupFirstRunAdminPin,
  verifyAdminSessionToken,
  verifyMasterAdminPinAndIssueToken,
} from './services/trialPinService';
import {
  generateSignedOfflineLicense,
  getPublicVerificationKeyJwk,
  signLabReportHash,
  listIssuedOfflineLicenses,
  type SubscriptionDurationDays,
} from './services/offlineLicenseCrypto';
import { UNIVERSITY_LAB_MODULES } from '../data/universityLabCurriculum';
import type { EcuPin } from '../types/ecu';
import {
  buildGroundedStepSpec,
  buildStepTutorialPrompt,
  buildStepTutorialSubtitles,
  isStepTutorialEligibleTier,
  type TutorialDurationSec,
  type TutorialNarrationStyle,
} from '../utils/stepTutorialBuilder';

export function createAutoelectricApiApp(): express.Express {
  const app = express();

  // Disable X-Powered-By header and respect X-Forwarded-For behind Cloud Run / reverse proxies
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Hardened HTTP security headers middleware (CSP + HSTS + anti-sniffing)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Avoid blocking cross-origin iframe preview when served behind the AI Studio nginx proxy
    // (which manages Content-Security-Policy frame-ancestors directly).
    if (req.path.startsWith('/api/') || (!process.env.NGINX_PORT && process.env.NODE_ENV === 'production')) {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader(
      'Permissions-Policy',
      'camera=(self), microphone=(self), geolocation=(), usb=(), serial=(), payment=()'
    );
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://apis.google.com https://accounts.google.com https://www.gstatic.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "media-src 'self' data: blob:",
        "connect-src 'self' ws: wss: https://*.googleapis.com https://*.google.com https://*.firebaseio.com https://*.gstatic.com https://vpic.nhtsa.dot.gov https://api.nhtsa.gov",
        "worker-src 'self' blob:",
        "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    );
    const forwardedProto = req.headers['x-forwarded-proto'];
    const protoStr = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    const isHttps =
      req.secure ||
      (typeof protoStr === 'string' && protoStr.split(',')[0].trim().toLowerCase() === 'https');
    if (isHttps || process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }
    next();
  });

  // Route-scoped JSON parsers placed AFTER Firebase Authentication to prevent pre-auth memory exhaustion
  const smallJsonParser = express.json({ limit: '64kb' });
  const csvImportJsonParser = express.json({ limit: '1200kb' });
  // Allow 12mb JSON envelope ONLY on authenticated schematic/PCB image route so 8MB binary images (~10.67MB base64) hit our structured 8MB 413 JSON guard
  const imageJsonParser = express.json({ limit: '12mb' });

  // Per-user + per-IP sliding-window rate limiter & bounded concurrency guard for AI endpoints
  const rateLimitWindowMs = 60_000;
  const userRateLimitMax = 15;
  const ipRateLimitMax = 30;
  const maxConcurrentAiRequests = 6;
  const userBuckets = new Map<string, number[]>();
  const ipBuckets = new Map<string, number[]>();
  let activeAiRequests = 0;

  const pruneBuckets = (buckets: Map<string, number[]>, windowStart: number) => {
    if (buckets.size > 128) {
      for (const [key, list] of buckets.entries()) {
        const active = list.filter((t) => t > windowStart);
        if (active.length === 0) {
          buckets.delete(key);
        } else if (active.length !== list.length) {
          buckets.set(key, active);
        }
      }
    }
  };

  const checkBucket = (buckets: Map<string, number[]>, key: string, max: number, now: number) => {
    const windowStart = now - rateLimitWindowMs;
    const timestamps = (buckets.get(key) || []).filter((t) => t > windowStart);
    if (timestamps.length >= max) {
      buckets.set(key, timestamps);
      const oldest = timestamps[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldest + rateLimitWindowMs - now) / 1000));
      return { allowed: false as const, retryAfterSec };
    }
    timestamps.push(now);
    buckets.set(key, timestamps);
    pruneBuckets(buckets, windowStart);
    return { allowed: true as const };
  };

  const aiRateAndConcurrencyGuard: express.RequestHandler = (
    req: AuthenticatedRequest,
    res,
    next
  ) => {
    const now = Date.now();
    const uidKey = req.authUser?.uid ? `uid:${req.authUser.uid}` : null;
    const ipKey = `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;

    if (uidKey) {
      const userCheck = checkBucket(userBuckets, uidKey, userRateLimitMax, now);
      if (!userCheck.allowed) {
        res.setHeader('Retry-After', String(userCheck.retryAfterSec));
        return res.status(429).json({
          error: `Per-user AI rate limit exceeded (max ${userRateLimitMax}/minute). Retry in ${userCheck.retryAfterSec}s.`,
          code: 'USER_RATE_LIMITED',
        });
      }
    }

    const ipCheck = checkBucket(ipBuckets, ipKey, ipRateLimitMax, now);
    if (!ipCheck.allowed) {
      res.setHeader('Retry-After', String(ipCheck.retryAfterSec));
      return res.status(429).json({
        error: `IP rate limit exceeded (max ${ipRateLimitMax}/minute). Retry in ${ipCheck.retryAfterSec}s.`,
        code: 'IP_RATE_LIMITED',
      });
    }

    if (activeAiRequests >= maxConcurrentAiRequests) {
      res.setHeader('Retry-After', '5');
      return res.status(503).json({
        error: 'AI processing queue is at capacity. Please retry in a few seconds.',
        code: 'SERVER_BUSY',
      });
    }

    activeAiRequests += 1;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        activeAiRequests = Math.max(0, activeAiRequests - 1);
      }
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };

  // Dedicated lightweight rate limiter for public NHTSA proxy routes (30 req/min per user, 60/min per IP)
  const nhtsaUserBuckets = new Map<string, number[]>();
  const nhtsaIpBuckets = new Map<string, number[]>();
  const nhtsaRateGuard: express.RequestHandler = (req: AuthenticatedRequest, res, next) => {
    const now = Date.now();
    const uidKey = req.authUser?.uid ? `uid:${req.authUser.uid}` : null;
    const ipKey = `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;

    if (uidKey) {
      const userCheck = checkBucket(nhtsaUserBuckets, uidKey, 30, now);
      if (!userCheck.allowed) {
        res.setHeader('Retry-After', String(userCheck.retryAfterSec));
        return res.status(429).json({
          error: `Per-user NHTSA lookup rate limit exceeded (max 30/minute). Retry in ${userCheck.retryAfterSec}s.`,
          code: 'USER_RATE_LIMITED',
        });
      }
    }

    const ipCheck = checkBucket(nhtsaIpBuckets, ipKey, 60, now);
    if (!ipCheck.allowed) {
      res.setHeader('Retry-After', String(ipCheck.retryAfterSec));
      return res.status(429).json({
        error: `IP NHTSA lookup rate limit exceeded (max 60/minute). Retry in ${ipCheck.retryAfterSec}s.`,
        code: 'IP_RATE_LIMITED',
      });
    }
    next();
  };

  // ============================================================================
  // LICENSE & ACCESS CONTROL ENDPOINTS (Owner-Only Admin + Code Redemption)
  // ============================================================================
  app.get(
    '/api/autoelectric/license/status',
    requireFirebaseAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const deviceId =
        typeof req.query.deviceId === 'string'
          ? req.query.deviceId
          : typeof req.headers['x-vecl-device-id'] === 'string'
            ? req.headers['x-vecl-device-id']
            : '';
      const licenseStatus = getUserLicenseStatus(user, deviceId);
      return res.json({
        requestStatus: 'SUCCESS',
        ...licenseStatus,
      });
    }
  );

  app.post(
    '/api/autoelectric/license/redeem',
    requireFirebaseAuth,
    smallJsonParser,
    async (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const rateKey = `redeem:${user.uid}:${req.ip || 'unknown'}`;
      const rate = checkRedeemRateLimit(rateKey);
      if (!rate.allowed) {
        res.setHeader('Retry-After', String(rate.retryAfterSec || 60));
        return res.status(429).json({
          error: `Too many activation attempts. Please wait ${rate.retryAfterSec}s before trying again.`,
          code: 'REDEEM_RATE_LIMITED',
        });
      }

      try {
        const { code, deviceId, deviceLabel } = req.body || {};
        if (!code || typeof code !== 'string') {
          return res.status(400).json({
            error: 'Missing license code (expected format VECL-XXXX-XXXX-XXXX).',
            code: 'INVALID_CODE_FORMAT',
          });
        }
        const resolvedDeviceId =
          typeof deviceId === 'string' && deviceId.trim()
            ? deviceId.trim()
            : typeof req.headers['x-vecl-device-id'] === 'string'
              ? req.headers['x-vecl-device-id'].trim()
              : '';

        const result = await redeemLicenseCode({
          user,
          rawCode: code,
          deviceId: resolvedDeviceId,
          deviceLabel: typeof deviceLabel === 'string' ? deviceLabel : undefined,
        });

        return res.json({
          status: 'SUCCESS',
          newlyActivated: result.newlyActivated,
          licenseStatus: result.status,
          license: result.record,
          leaseToken: result.leaseToken,
        });
      } catch (err: unknown) {
        const code = err instanceof Error ? err.message : 'REDEEM_FAILED';
        const statusMap: Record<string, { http: number; message: string }> = {
          INVALID_CODE_FORMAT: {
            http: 400,
            message: 'Invalid license code format. Expected VECL-XXXX-XXXX-XXXX.',
          },
          DEVICE_ID_REQUIRED: {
            http: 400,
            message: 'Workstation device identifier is required for license binding.',
          },
          CODE_NOT_FOUND: {
            http: 404,
            message: 'License code not recognized. Verify the code with the administrator.',
          },
          LICENSE_REVOKED: {
            http: 403,
            message: 'This license code has been revoked by the administrator.',
          },
          UNUSED_CODE_EXPIRED: {
            http: 403,
            message: 'This unused license code has passed its activation window.',
          },
          LICENSE_EXPIRED: {
            http: 403,
            message: 'This license code has expired. Contact the administrator for an extension.',
          },
          CODE_ALREADY_ASSIGNED_TO_ANOTHER_USER: {
            http: 403,
            message: 'This license code is already permanently bound to another Google account.',
          },
          DEVICE_LIMIT_REACHED: {
            http: 403,
            message:
              'Maximum of 2 registered devices reached for this license. Ask the administrator to reset device registrations.',
          },
          REDEMPTION_IN_PROGRESS: {
            http: 409,
            message: 'License activation is already in progress. Please wait a moment.',
          },
        };
        const mapped = statusMap[code] || {
          http: 400,
          message: 'Unable to activate license code.',
        };
        return res.status(mapped.http).json({
          error: mapped.message,
          code,
        });
      }
    }
  );

  app.get(
    '/api/autoelectric/license/admin/list',
    requireFirebaseAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      if (!isVerifiedAdminUser(user)) {
        return res.status(403).json({
          error: 'Administrator privileges required (verified Admin UID only).',
          code: 'FORBIDDEN_ADMIN_ONLY',
        });
      }
      const licenses = listAllLicensesForAdmin(user);
      return res.json({
        status: 'SUCCESS',
        adminUid: user.uid,
        licenses,
      });
    }
  );

  app.post(
    '/api/autoelectric/license/admin/generate',
    requireFirebaseAuth,
    smallJsonParser,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      if (!isVerifiedAdminUser(user)) {
        return res.status(403).json({
          error: 'Administrator privileges required (verified Admin UID only).',
          code: 'FORBIDDEN_ADMIN_ONLY',
        });
      }
      try {
        const { plan, customDays, unusedExpiryDays, maxDevices, notes } = req.body || {};
        const validPlans: LicenseDurationPlan[] = [
          'TRIAL_1D',
          'SHORT_7D',
          'MONTHLY_30D',
          'QUARTERLY_90D',
          'SEMI_ANNUAL_180D',
          'ANNUAL_365D',
          'CUSTOM',
        ];
        const selectedPlan: LicenseDurationPlan = validPlans.includes(plan)
          ? plan
          : 'MONTHLY_30D';

        const created = createLicenseCodeRecord({
          adminUser: user,
          plan: selectedPlan,
          customDays: typeof customDays === 'number' ? customDays : Number(customDays),
          unusedExpiryDays:
            typeof unusedExpiryDays === 'number' ? unusedExpiryDays : Number(unusedExpiryDays),
          maxDevices: typeof maxDevices === 'number' ? maxDevices : undefined,
          notes: typeof notes === 'string' ? notes : '',
        });

        return res.status(201).json({
          status: 'SUCCESS',
          plainCode: created.plainCode,
          license: {
            ...created.record,
            status: 'UNUSED',
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to generate license code.';
        return res.status(400).json({ error: msg, code: 'INVALID_LICENSE_PARAMETERS' });
      }
    }
  );

  app.post(
    '/api/autoelectric/license/admin/extend',
    requireFirebaseAuth,
    smallJsonParser,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      if (!isVerifiedAdminUser(user)) {
        return res.status(403).json({
          error: 'Administrator privileges required (verified Admin UID only).',
          code: 'FORBIDDEN_ADMIN_ONLY',
        });
      }
      try {
        const { licenseId, additionalDays } = req.body || {};
        if (!licenseId || typeof licenseId !== 'string') {
          return res.status(400).json({ error: 'Missing licenseId', code: 'INVALID_REQUEST' });
        }
        const updated = extendLicenseDuration({
          adminUser: user,
          licenseId,
          additionalDays: Number(additionalDays),
        });
        return res.json({
          status: 'SUCCESS',
          license: updated,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to extend license.';
        const status = msg === 'LICENSE_NOT_FOUND' ? 404 : 400;
        return res.status(status).json({ error: msg, code: msg });
      }
    }
  );

  app.post(
    '/api/autoelectric/license/admin/reset-devices',
    requireFirebaseAuth,
    smallJsonParser,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      if (!isVerifiedAdminUser(user)) {
        return res.status(403).json({
          error: 'Administrator privileges required (verified Admin UID only).',
          code: 'FORBIDDEN_ADMIN_ONLY',
        });
      }
      try {
        const { licenseId } = req.body || {};
        if (!licenseId || typeof licenseId !== 'string') {
          return res.status(400).json({ error: 'Missing licenseId', code: 'INVALID_REQUEST' });
        }
        const updated = resetLicenseDevices({
          adminUser: user,
          licenseId,
        });
        return res.json({
          status: 'SUCCESS',
          license: updated,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to reset devices.';
        const status = msg === 'LICENSE_NOT_FOUND' ? 404 : 400;
        return res.status(status).json({ error: msg, code: msg });
      }
    }
  );

  app.post(
    '/api/autoelectric/license/admin/revoke',
    requireFirebaseAuth,
    smallJsonParser,
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      if (!isVerifiedAdminUser(user)) {
        return res.status(403).json({
          error: 'Administrator privileges required (verified Admin UID only).',
          code: 'FORBIDDEN_ADMIN_ONLY',
        });
      }
      try {
        const { licenseId, revoked, reason } = req.body || {};
        if (!licenseId || typeof licenseId !== 'string') {
          return res.status(400).json({ error: 'Missing licenseId', code: 'INVALID_REQUEST' });
        }
        const updated = setLicenseRevocation({
          adminUser: user,
          licenseId,
          revoked: revoked !== false,
          reason: typeof reason === 'string' ? reason : undefined,
        });
        return res.json({
          status: 'SUCCESS',
          license: updated,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to update revocation state.';
        const status = msg === 'LICENSE_NOT_FOUND' ? 404 : 400;
        return res.status(status).json({ error: msg, code: msg });
      }
    }
  );

  // ============================================================================
  // 8-DIGIT NUMERIC TRIAL PIN & MASTER ADMIN PIN ROUTES
  // ============================================================================
  const requirePinOrFirebaseAdmin: express.RequestHandler = async (
    req: AuthenticatedRequest,
    res,
    next
  ) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Administrator authentication required. Unlock with the Master Admin PIN.',
        code: 'AUTH_REQUIRED',
      });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return res.status(401).json({
        error: 'Administrator authentication required. Unlock with the Master Admin PIN.',
        code: 'AUTH_REQUIRED',
      });
    }
    if (token.startsWith('vecl_admin_v1.')) {
      const check = verifyAdminSessionToken(token);
      if (!check.valid) {
        return res.status(401).json({
          error: check.error || 'Admin session token invalid or expired.',
          code: check.code || 'INVALID_TOKEN',
        });
      }
      req.isPinAdmin = true;
      req.authUser = { uid: 'pin-admin:master', email: null, emailVerified: true };
      next();
      return;
    }

    return res.status(401).json({
      error: 'Master Admin PIN authentication is required for administrator endpoints.',
      code: 'INVALID_TOKEN',
    });
  };

  const TRIAL_SESSION_COOKIE_NAME = 'vecl_trial_session';

  const readCookieValue = (req: express.Request, name: string): string | undefined => {
    const rawCookie = req.headers.cookie;
    if (!rawCookie || typeof rawCookie !== 'string') return undefined;
    for (const part of rawCookie.split(';')) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const key = part.slice(0, idx).trim();
      if (key === name) {
        const val = part.slice(idx + 1).trim();
        try {
          return decodeURIComponent(val);
        } catch {
          return val;
        }
      }
    }
    return undefined;
  };

  const isHttpsRequest = (req: express.Request): boolean => {
    if (req.secure) return true;
    const proto = req.headers['x-forwarded-proto'];
    const raw = Array.isArray(proto) ? proto[0] : proto;
    return typeof raw === 'string' && raw.split(',')[0].trim().toLowerCase() === 'https';
  };

  const setTrialSessionCookie = (
    req: express.Request,
    res: express.Response,
    token: string,
    expiresAtMs: number | null
  ) => {
    const maxAgeSec = expiresAtMs
      ? Math.max(60, Math.min(365 * 24 * 3600, Math.floor((expiresAtMs - Date.now()) / 1000)))
      : 3600;
    const secureAttr = isHttpsRequest(req) ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `${TRIAL_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/api/autoelectric/trial; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secureAttr}`
    );
  };

  const clearTrialSessionCookie = (req: express.Request, res: express.Response) => {
    const secureAttr = isHttpsRequest(req) ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `${TRIAL_SESSION_COOKIE_NAME}=; Path=/api/autoelectric/trial; HttpOnly; SameSite=Lax; Max-Age=0${secureAttr}`
    );
  };

  const trialStatusIpBuckets = new Map<string, number[]>();

  app.get('/api/autoelectric/trial/status', (req, res) => {
    const ipKey = `trial-status:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    const rateCheck = checkBucket(trialStatusIpBuckets, ipKey, 30, Date.now());
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(rateCheck.retryAfterSec));
      return res.status(429).json({
        error: `Too many trial status requests. Retry in ${rateCheck.retryAfterSec}s.`,
        code: 'TRIAL_STATUS_RATE_LIMITED',
      });
    }

    // Read deviceId strictly from request header (never query string) to avoid URL/log leakage
    const deviceId =
      typeof req.headers['x-vecl-device-id'] === 'string'
        ? req.headers['x-vecl-device-id'].trim()
        : '';
    const authHeader = req.headers.authorization;
    const headerBearer =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : undefined;
    const cookieToken = readCookieValue(req, TRIAL_SESSION_COOKIE_NAME);
    const candidateToken = headerBearer || cookieToken;

    if (!candidateToken || !candidateToken.startsWith('vecl_trial_v1.')) {
      if (cookieToken) {
        clearTrialSessionCookie(req, res);
      }
      return res.json({
        status: 'SUCCESS',
        accessState: 'UNLICENSED',
        hasAccess: false,
        trial: null,
        trialToken: null,
        serverNowMs: Date.now(),
      });
    }

    const status = getTrialStatusForDevice(deviceId, candidateToken);
    if (!status.hasAccess) {
      if (cookieToken) {
        clearTrialSessionCookie(req, res);
      }
      // Do not leak trial metadata or mint a token if bearer/cookie verification failed
      const safeAccessState =
        status.accessState === 'TRIAL_REVOKED' || status.accessState === 'TRIAL_EXPIRED'
          ? status.accessState
          : 'UNLICENSED';
      return res.json({
        status: 'SUCCESS',
        accessState: safeAccessState,
        hasAccess: false,
        trial: safeAccessState === 'UNLICENSED' ? null : status.trial,
        trialToken: null,
        serverNowMs: status.serverNowMs,
      });
    }

    return res.json({
      status: 'SUCCESS',
      ...status,
    });
  });

  app.post('/api/autoelectric/trial/redeem', smallJsonParser, async (req, res) => {
    const { pin, deviceId, deviceLabel } = req.body || {};
    const resolvedDeviceId =
      typeof deviceId === 'string' && deviceId.trim()
        ? deviceId.trim()
        : typeof req.headers['x-vecl-device-id'] === 'string'
          ? req.headers['x-vecl-device-id'].trim()
          : '';
    // Enforce per-IP rate limit first so rotating client-supplied deviceId cannot bypass PIN throttling
    const ipRate = checkTrialRedeemRateLimit(
      `trial-redeem-ip:${req.ip || req.socket.remoteAddress || 'unknown'}`
    );
    if (!ipRate.allowed) {
      res.setHeader('Retry-After', String(ipRate.retryAfterSec || 60));
      return res.status(429).json({
        error: `Too many trial PIN attempts. Please wait ${ipRate.retryAfterSec}s before trying again.`,
        code: 'TRIAL_RATE_LIMITED',
      });
    }

    const globalRate = checkTrialRedeemGlobalRateLimit();
    if (!globalRate.allowed) {
      res.setHeader('Retry-After', String(globalRate.retryAfterSec || 60));
      return res.status(429).json({
        error: `Trial activation is temporarily busy. Please wait ${globalRate.retryAfterSec}s before trying again.`,
        code: 'TRIAL_RATE_LIMITED',
      });
    }

    if (resolvedDeviceId) {
      const deviceRate = checkTrialRedeemRateLimit(`trial-redeem-dev:${resolvedDeviceId.slice(0, 80)}`);
      if (!deviceRate.allowed) {
        res.setHeader('Retry-After', String(deviceRate.retryAfterSec || 60));
        return res.status(429).json({
          error: `Too many trial PIN attempts. Please wait ${deviceRate.retryAfterSec}s before trying again.`,
          code: 'TRIAL_RATE_LIMITED',
        });
      }
    }

    try {
      if (!pin || typeof pin !== 'string') {
        return res.status(400).json({
          error: 'Enter a valid 8-digit numeric trial PIN (XXXX-XXXX).',
          code: 'INVALID_PIN_FORMAT',
        });
      }

      const result = await redeemTrialPin({
        rawPin: pin,
        deviceId: resolvedDeviceId,
        deviceLabel: typeof deviceLabel === 'string' ? deviceLabel : undefined,
      });

      setTrialSessionCookie(req, res, result.trialToken, result.record.expiresAtMs);

      return res.json({
        status: 'SUCCESS',
        newlyActivated: result.newlyActivated,
        trial: result.record,
        trialToken: result.trialToken,
        serverNowMs: result.serverNowMs,
      });
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'TRIAL_REDEEM_FAILED';
      const map: Record<string, { http: number; message: string }> = {
        INVALID_PIN_FORMAT: {
          http: 400,
          message: 'Trial PIN must be exactly 8 numeric digits (XXXX-XXXX).',
        },
        DEVICE_ID_REQUIRED: {
          http: 400,
          message: 'Workstation device identifier is required for single-device trial binding.',
        },
        PIN_NOT_FOUND: {
          http: 404,
          message: 'Trial PIN not recognized. Verify the 8-digit PIN with your administrator.',
        },
        TRIAL_REVOKED: {
          http: 403,
          message: 'This trial PIN has been revoked by the administrator.',
        },
        UNUSED_TRIAL_EXPIRED: {
          http: 403,
          message: 'This unused trial PIN has passed its pickup expiration window.',
        },
        TRIAL_EXPIRED: {
          http: 403,
          message:
            'Your trial PIN has expired. AI tools and local exports are locked. Enter a new 8-digit Trial PIN.',
        },
        DEVICE_LIMIT_REACHED: {
          http: 403,
          message:
            'Single-device limit reached. This 8-digit trial PIN is already bound to another workstation.',
        },
        REDEMPTION_IN_PROGRESS: {
          http: 409,
          message: 'Trial activation is already in progress. Please wait a moment.',
        },
      };
      const mapped = map[code] || { http: 400, message: 'Unable to activate trial PIN.' };
      return res.status(mapped.http).json({ error: mapped.message, code });
    }
  });

  app.get('/api/autoelectric/trial/admin/config', (_req, res) => {
    const cfg = getAdminPinConfigStatus();
    return res.json({
      status: 'SUCCESS',
      masterEnvConfigured: cfg.masterEnvConfigured,
      setupEnabled: cfg.setupEnabled,
      // Never disclose unclaimed state to unauthenticated HTTP probes when first-run setup is disabled
      adminClaimed: cfg.setupEnabled ? cfg.adminClaimed : true,
    });
  });

  app.post('/api/autoelectric/trial/admin/setup', smallJsonParser, (req, res) => {
    const rateKey = `admin-setup:${req.ip || 'unknown'}`;
    const rate = checkAdminPinRateLimit(rateKey);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSec || 60));
      return res.status(429).json({
        error: `Too many Admin PIN setup attempts. Retry in ${rate.retryAfterSec}s.`,
        code: 'ADMIN_RATE_LIMITED',
      });
    }
    try {
      const { masterPin } = req.body || {};
      if (!masterPin || typeof masterPin !== 'string') {
        return res.status(400).json({
          error: 'Master Admin PIN must be 6 to 12 numeric digits.',
          code: 'INVALID_ADMIN_PIN_FORMAT',
        });
      }
      const session = setupFirstRunAdminPin(masterPin);
      return res.status(201).json({
        status: 'SUCCESS',
        adminToken: session.adminToken,
        expiresAtMs: session.expiresAtMs,
      });
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'ADMIN_SETUP_FAILED';
      const statusMap: Record<string, { http: number; message: string }> = {
        ADMIN_SETUP_DISABLED: {
          http: 403,
          message:
            'Unauthenticated first-run Admin PIN setup is disabled by default. Configure VECL_ADMIN_MASTER_PIN on the server environment.',
        },
        ADMIN_ENV_MANAGED: {
          http: 409,
          message: 'Master Admin PIN is managed by server environment configuration (VECL_ADMIN_MASTER_PIN).',
        },
        ADMIN_ALREADY_CLAIMED: {
          http: 409,
          message: 'Master Admin PIN has already been initialized. Please sign in with the existing PIN.',
        },
        INVALID_ADMIN_PIN_FORMAT: {
          http: 400,
          message: 'Master Admin PIN must be 6 to 12 numeric digits.',
        },
      };
      const mapped = statusMap[code] || { http: 400, message: 'Failed to initialize Admin PIN.' };
      return res.status(mapped.http).json({ error: mapped.message, code });
    }
  });

  app.post('/api/autoelectric/trial/admin/login', smallJsonParser, (req, res) => {
    const rateKey = `admin-login:${req.ip || 'unknown'}`;
    const rate = checkAdminPinRateLimit(rateKey);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSec || 60));
      return res.status(429).json({
        error: `Too many Master Admin PIN attempts. Retry in ${rate.retryAfterSec}s.`,
        code: 'ADMIN_RATE_LIMITED',
      });
    }

    try {
      const { masterPin } = req.body || {};
      if (!masterPin || typeof masterPin !== 'string') {
        return res.status(400).json({
          error: 'Enter your Master Admin PIN.',
          code: 'INVALID_MASTER_PIN',
        });
      }
      const session = verifyMasterAdminPinAndIssueToken(masterPin);
      return res.json({
        status: 'SUCCESS',
        adminToken: session.adminToken,
        expiresAtMs: session.expiresAtMs,
      });
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'INVALID_MASTER_PIN';
      if (code === 'ADMIN_PIN_NOT_INITIALIZED') {
        return res.status(409).json({
          error: 'Master Admin PIN is not set up yet. Configure VECL_ADMIN_MASTER_PIN on the server environment.',
          code,
        });
      }
      if (code === 'ADMIN_ENV_PIN_TOO_WEAK') {
        return res.status(409).json({
          error: 'Server Master Admin PIN is too weak for strict production mode. Use at least 10 characters in VECL_ADMIN_MASTER_PIN.',
          code,
        });
      }
      return res.status(401).json({
        error: 'Incorrect Master Admin PIN.',
        code: 'INVALID_MASTER_PIN',
      });
    }
  });

  app.post('/api/autoelectric/trial/admin/logout', requirePinOrFirebaseAdmin, (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    const result = revokeAdminSessionToken(token);
    return res.json({
      status: 'SUCCESS',
      revoked: result.revoked,
    });
  });

  app.post(
    '/api/autoelectric/trial/admin/revoke-all-sessions',
    requirePinOrFirebaseAdmin,
    (_req, res) => {
      const result = revokeAllAdminSessionTokens();
      return res.json({
        status: 'SUCCESS',
        revokedBeforeMs: result.revokedBeforeMs,
      });
    }
  );

  const resolveAdminActor = (req: AuthenticatedRequest): string => {
    if (req.isPinAdmin) return 'Master Admin';
    return 'Admin';
  };

  app.get('/api/autoelectric/trial/admin/list', requirePinOrFirebaseAdmin, (_req, res) => {
    const snapshot = getAdminTrialAuditSnapshot();
    return res.json({
      status: 'SUCCESS',
      trials: snapshot.trials,
      auditLog: snapshot.auditLog,
      summary: snapshot.summary,
      serverNowMs: snapshot.serverNowMs,
    });
  });

  app.post(
    '/api/autoelectric/trial/admin/generate',
    requirePinOrFirebaseAdmin,
    smallJsonParser,
    (req: AuthenticatedRequest, res) => {
      try {
        const { durationHours, unusedExpiryHours, notes } = req.body || {};
        const created = createTrialPinRecord({
          durationHours: Number(durationHours),
          unusedExpiryHours:
            unusedExpiryHours !== undefined ? Number(unusedExpiryHours) : undefined,
          notes: typeof notes === 'string' ? notes : '',
          actor: resolveAdminActor(req),
        });
        return res.status(201).json({
          status: 'SUCCESS',
          plainPin: created.plainPin,
          formattedPin: created.formattedPin,
          trial: created.record,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to generate trial PIN.';
        return res.status(400).json({ error: msg, code: 'INVALID_TRIAL_PARAMETERS' });
      }
    }
  );

  app.post(
    '/api/autoelectric/trial/admin/revoke',
    requirePinOrFirebaseAdmin,
    smallJsonParser,
    (req: AuthenticatedRequest, res) => {
      try {
        const { trialId, revoked, reason } = req.body || {};
        if (!trialId || typeof trialId !== 'string') {
          return res.status(400).json({ error: 'Missing trialId', code: 'INVALID_REQUEST' });
        }
        const updated = setTrialPinRevocation({
          trialId,
          revoked: revoked !== false,
          reason: typeof reason === 'string' ? reason : undefined,
          actor: resolveAdminActor(req),
        });
        return res.json({
          status: 'SUCCESS',
          trial: updated,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to update trial status.';
        return res.status(msg === 'TRIAL_NOT_FOUND' ? 404 : 400).json({ error: msg, code: msg });
      }
    }
  );

  app.post(
    '/api/autoelectric/trial/admin/reset-device',
    requirePinOrFirebaseAdmin,
    smallJsonParser,
    (req: AuthenticatedRequest, res) => {
      try {
        const { trialId } = req.body || {};
        if (!trialId || typeof trialId !== 'string') {
          return res.status(400).json({ error: 'Missing trialId', code: 'INVALID_REQUEST' });
        }
        const updated = resetTrialPinDevice(trialId, Date.now(), resolveAdminActor(req));
        return res.json({
          status: 'SUCCESS',
          trial: updated,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to reset device binding.';
        return res.status(msg === 'TRIAL_NOT_FOUND' ? 404 : 400).json({ error: msg, code: msg });
      }
    }
  );

  app.post(
    '/api/autoelectric/trial/admin/import',
    requirePinOrFirebaseAdmin,
    csvImportJsonParser,
    (req: AuthenticatedRequest, res) => {
      try {
        const { csvContent, filename } = req.body || {};
        if (typeof csvContent !== 'string' || !csvContent.trim()) {
          return res.status(400).json({
            error: 'Uploaded CSV content is empty or missing.',
            code: 'INVALID_CSV_FORMAT',
          });
        }
        const result = importHistoricalAuditCsv({
          csvContent,
          filename: typeof filename === 'string' ? filename : undefined,
          actor: resolveAdminActor(req),
        });
        return res.json({
          status: 'SUCCESS',
          importedEvents: result.importedEvents,
          skippedDuplicateEvents: result.skippedDuplicateEvents,
          importedTrials: result.importedTrials,
          skippedExistingTrials: result.skippedExistingTrials,
          skippedInvalidRows: result.skippedInvalidRows,
          trials: result.snapshot.trials,
          auditLog: result.snapshot.auditLog,
          summary: result.snapshot.summary,
          serverNowMs: result.snapshot.serverNowMs,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to import audit logs CSV.';
        const code = msg.startsWith('INVALID_CSV_SIZE')
          ? 'INVALID_CSV_SIZE'
          : 'INVALID_CSV_FORMAT';
        return res.status(400).json({ error: msg, code });
      }
    }
  );

  // API Routes (Firebase ID Token OR Active Trial PIN Protected BEFORE JSON body parsing)
  app.post(
    '/api/autoelectric/analyze-schematic',
    requireAuthOrTrialSession,
    requireActiveLicense,
    aiRateAndConcurrencyGuard,
    imageJsonParser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { imageBase64, mimeType, documentName, documentType, regionBox } = req.body || {};
        if (!imageBase64 || typeof imageBase64 !== 'string') {
          return res.status(400).json({ error: 'Missing or invalid imageBase64 payload' });
        }
        if (!documentName || typeof documentName !== 'string' || documentName.trim().length > 200) {
          return res.status(400).json({ error: 'Missing or invalid documentName' });
        }
        if (!documentType || typeof documentType !== 'string' || documentType.trim().length > 80) {
          return res.status(400).json({ error: 'Missing or invalid documentType' });
        }

        const validation = validateImagePayload(
          imageBase64,
          typeof mimeType === 'string' ? mimeType : 'image/jpeg'
        );
        if (!validation.ok) {
          return res.status(validation.statusCode).json({ error: validation.error });
        }

        const cleanBase64 = imageBase64
          .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
          .trim();

        const provider = getImageAnalysisProvider();
        const result = await provider.analyzeImage({
          imageBase64: cleanBase64,
          mimeType: validation.normalizedMimeType,
          documentName: documentName.trim(),
          documentType: documentType.trim(),
          regionBox,
        });

        res.json({
          status: 'SUCCESS',
          analysis: result,
          model: result.model,
        });
      } catch (e: unknown) {
        if (e instanceof ImageAnalysisProviderError) {
          console.error(
            `Schematic analysis provider error (${e.provider}/${e.code}):`,
            e.message
          );
          return res.status(e.statusCode).json({
            error: e.message,
            code: e.code,
            provider: e.provider,
          });
        }
        const msg = e instanceof Error ? e.message : 'Analysis failed';
        console.error('Schematic analysis error:', msg);
        res
          .status(500)
          .json({ error: 'Image analysis service failure. Local CV review remains available.' });
      }
    }
  );

  // Google Search Grounding for Live OEM Bulletins, ECU Pinouts, & Diagnostic Procedures
  app.post(
    '/api/autoelectric/grounded-search',
    requireAuthOrTrialSession,
    requireActiveLicense,
    aiRateAndConcurrencyGuard,
    smallJsonParser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { query, ecuModel, dtcCode, contextType, customPrompt } = req.body || {};
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
          return res.status(400).json({ error: 'Missing or invalid search query' });
        }
        if (query.length > 2000) {
          return res.status(400).json({ error: 'Search query exceeds 2000 character limit' });
        }

        if (!hasConfiguredGeminiKeys()) {
          return res.status(503).json({
            error: 'Gemini API Key is not configured. Please check Settings > Secrets.',
            code: 'MISSING_API_KEY',
          });
        }

        const cleanEcu = typeof ecuModel === 'string' ? ecuModel.slice(0, 160) : '';
        const cleanDtc = typeof dtcCode === 'string' ? dtcCode.slice(0, 40) : '';
        const cleanContext = typeof contextType === 'string' ? contextType.slice(0, 80) : '';
        const cleanNotes = typeof customPrompt === 'string' ? customPrompt.slice(0, 1000) : '';
        const isFuseRelayContext = cleanContext === 'FUSE_RELAY_DIAGRAM';

        const systemInstruction = `You are a Master Automotive Electronics Engineer, ECU Bench Specialist, and Diagnostic Researcher.
Provide factory-grade diagnostic procedures and distinguish explicitly between OEM-verified documentation and general automotive architecture references. Never fabricate pin numbers, wire colors, fuse slot numbers, amperage ratings, resistance values, or part numbers — state "${
          isFuseRelayContext
            ? 'VERIFY PHYSICAL FUSE COVER LEGEND & FACTORY WIRING DIAGRAM FOR EXACT VIN/MARKET TRIM'
            : 'VERIFY AGAINST FACTORY SERVICE MANUAL FOR EXACT VIN/ECU PART NUMBER'
        }" when exact specifications are absent in retrieved search sources.
Specify physical test parameters: DC Volts, Resistance in Ohms, current draw in Amps, and oscilloscope waveform characteristics.
Structure findings cleanly:
${
  isFuseRelayContext
    ? `- Fuse Box Compartments Identified (distinguish Engine Bay Power Distribution Box vs. Interior Cabin Junction Block)
- Retrieved Fuse / Relay Assignments & Amperage Ratings (cite retrieved sources verbatim; note LHD/RHD & market trim differences)
- Bench & Vehicle Power Verification Steps (KL30 constant battery, KL15 switched ignition, EFI/ECM Main Relay, OBD-II DLC Pin 16 feed)
- Safety & Continuity Checks (verify fuse cover legend and test with DMM before applying bench power)`
    : `- Diagnostic Summary & Known OEM Issues / TSBs (cite retrieved sources)
- Verified Wiring & Bench Verification Steps (distinguish ECU connector pins from SAE J1962 OBD-II DLC pins)
- Step-by-Step Bench Testing & Voltage/Ohmic Specifications
- Component-Level PCB Inspection Guidance (state verification requirements)`
}`;

        const prompt = `Vehicle / ECU Diagnostic Inquiry:
Target Issue / Query: "${query.trim()}"
${cleanEcu ? `Vehicle / ECU Hardware: ${cleanEcu}` : ''}
${cleanDtc ? `Diagnostic Trouble Code / Focus: ${cleanDtc}` : ''}
${cleanContext ? `Operational Context: ${cleanContext}` : ''}
${cleanNotes ? `Additional Field Observations: ${cleanNotes}` : ''}

Execute Google Search Grounding to retrieve ${
          isFuseRelayContext
            ? 'StartMyCar fuse box diagrams, relay locations, amperage ratings, and documented power distribution checks.'
            : 'OEM technical service bulletins, factory wiring references, and documented technician diagnostics.'
        }`;

        const preferredSearchModel = resolveGeminiModelName(
          process.env.GEMINI_SEARCH_MODEL,
          'gemini-4-hydrogen'
        );
        const plan = selectFreeTierRoutes(preferredSearchModel, ['gemini-3.1-flash-lite']);

        if (plan.allInCooldown || plan.candidates.length === 0) {
          res.setHeader('Retry-After', String(plan.earliestRetryAfterSec || 30));
          return res.status(429).json({
            error: `Free-tier Gemini Search models are cooling down after quota limits. Retry in ${plan.earliestRetryAfterSec}s.`,
            code: 'ALL_FREE_TIERS_COOLDOWN',
            retryAfterSec: plan.earliestRetryAfterSec,
            attemptedModels: [],
            allFreeTiersExhausted: true,
            freeTierPoolStatus: getFreeTierPoolSnapshot(),
          });
        }

        let response = null;
        let usedRoute = plan.candidates[0];
        const attemptedModels: string[] = [];
        const attemptedKeyIds: string[] = [];
        const modelErrors: Record<string, string> = {};
        let lastClassified = classifyGeminiError(new Error('No models attempted'));
        let observedRetryAfterSec = 0;

        for (let i = 0; i < plan.candidates.length; i++) {
          const currentRoute = plan.candidates[i];
          usedRoute = currentRoute;
          if (!attemptedModels.includes(currentRoute.model)) {
            attemptedModels.push(currentRoute.model);
          }
          if (!attemptedKeyIds.includes(currentRoute.keyId)) {
            attemptedKeyIds.push(currentRoute.keyId);
          }
          recordRouteAttemptStart(currentRoute);

          const ai = getGeminiClientForApiKey(currentRoute.apiKey);
          const controller = new AbortController();
          const timeoutHandle = setTimeout(() => controller.abort(), 25_000);
          try {
            response = await Promise.race([
              ai.models.generateContent({
                model: currentRoute.model,
                contents: prompt,
                config: {
                  abortSignal: controller.signal,
                  systemInstruction,
                  tools: [{ googleSearch: {} }],
                },
              }),
              new Promise<never>((_resolve, reject) => {
                controller.signal.addEventListener(
                  'abort',
                  () => reject(new Error(`Search grounding timed out on ${currentRoute.model}`)),
                  { once: true }
                );
              }),
            ]);
            if (response) {
              recordRouteSuccess(currentRoute, response.usageMetadata?.totalTokenCount);
              break;
            }
          } catch (err: unknown) {
            const classified = classifyGeminiError(err, controller.signal.aborted);
            const failureResult = recordRouteFailure(
              currentRoute,
              classified,
              Date.now(),
              plan.candidates.length - 1 - i
            );
            if (failureResult.cooldownSec > observedRetryAfterSec) {
              observedRetryAfterSec = failureResult.cooldownSec;
            }
            lastClassified = classified;
            modelErrors[`${currentRoute.keyId}/${currentRoute.model}`] =
              `[${classified.category}/${classified.statusCode}] ${classified.rawMessage}`;
            console.warn(
              `[GroundedSearch] Route ${currentRoute.keyId}/${currentRoute.model} failed (${classified.category} ${classified.statusCode}): ${classified.rawMessage}`
            );
            if (!failureResult.shouldTryNextRoute) {
              break;
            }
          } finally {
            clearTimeout(timeoutHandle);
          }
        }

        if (!response) {
          if (observedRetryAfterSec > 0 && lastClassified.statusCode === 429) {
            res.setHeader('Retry-After', String(observedRetryAfterSec));
          }
          console.error('[GroundedSearch] All candidate routes failed:', JSON.stringify(modelErrors));
          return res.status(lastClassified.statusCode).json({
            error: lastClassified.userMessage,
            code: lastClassified.category,
            attemptedModels,
            attemptedKeyIds,
            retryAfterSec: observedRetryAfterSec || lastClassified.retryAfterSec,
            allFreeTiersExhausted: lastClassified.statusCode === 429,
            freeTierPoolStatus: getFreeTierPoolSnapshot(),
          });
        }

        const candidate = response.candidates?.[0];
        const groundingMetadata = candidate?.groundingMetadata;
        const rawChunks =
          (
            groundingMetadata as {
              groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
            }
          )?.groundingChunks || [];
        const searchQueries =
          (groundingMetadata as { webSearchQueries?: string[] })?.webSearchQueries || [];

        const webSources = rawChunks
          .map((chunk) => {
            if (chunk.web && chunk.web.uri) {
              let domain = '';
              try {
                domain = new URL(chunk.web.uri).hostname.replace('www.', '');
              } catch {
                domain = 'web';
              }
              return {
                title: chunk.web.title || domain,
                uri: chunk.web.uri,
                domain,
              };
            }
            return null;
          })
          .filter((s): s is { title: string; uri: string; domain: string } => s !== null);

        const reroutedFrom =
          plan.switchedFromEndpointId ||
          (attemptedModels.length > 1 ? attemptedModels[0] : undefined);

        res.json({
          status: 'SUCCESS',
          answer: response.text || 'No diagnostic response generated.',
          sources: webSources,
          searchQueries,
          model: usedRoute.model,
          activeKeyId: usedRoute.keyId,
          switchedKeyFrom:
            plan.switchedFromKeyId ||
            (attemptedKeyIds.length > 1 ? attemptedKeyIds[0] : undefined),
          attemptedModels,
          reroutedFrom,
          preQuotaRerouted: plan.preQuotaSwitched,
          rerouteReason: plan.switchReason || undefined,
          freeTierPoolStatus: getFreeTierPoolSnapshot(),
          safetyVerification: {
            provenanceStatus: 'AI_INFERRED',
            canEnergizePhysicalBench: false,
            requiresOemManualCrossCheck: true,
            ecuHardwareIdentified: Boolean(cleanEcu && cleanEcu.trim().length > 0),
            evidenceSourceCount: webSources.length,
            mandatorySafetyGateNotice:
              'AI_INFERRED output must be cross-checked against the factory service manual, exact ECU hardware part number, and DMM ground continuity before applying physical bench power.',
          },
          timestamp: new Date().toISOString(),
        });
      } catch (e: unknown) {
        const classified = classifyGeminiError(e);
        console.error('Grounding search error:', classified.rawMessage);
        res.status(classified.statusCode).json({
          error: classified.userMessage,
          code: classified.category,
        });
      }
    }
  );

  // ==========================================================================
  // GEMINI MULTI-TURN CHATBOT (Roles: Carbon, Argon, Hydrogen, Flash-Lite)
  // ==========================================================================
  app.post(
    '/api/autoelectric/gemini-chat',
    requireAuthOrTrialSession,
    requireActiveLicense,
    aiRateAndConcurrencyGuard,
    smallJsonParser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { messages, role, benchContext } = req.body || {};
        if (!Array.isArray(messages) || messages.length === 0) {
          return res.status(400).json({
            error: 'Messages array is required.',
            code: 'INVALID_REQUEST',
          });
        }

        const formattedContents = messages
          .slice(-16)
          .map((m: { role?: string; text?: string }) => ({
            role: m?.role === 'model' || m?.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: typeof m?.text === 'string' ? m.text.trim().slice(0, 3000) : '' }],
          }))
          .filter((entry) => entry.parts[0].text.length > 0);

        if (formattedContents.length === 0) {
          return res.status(400).json({
            error: 'At least one non-empty message is required.',
            code: 'INVALID_REQUEST',
          });
        }

        if (!hasConfiguredGeminiKeys()) {
          return res.status(503).json({
            error: 'Gemini API Key is not configured. Please check Settings > Secrets.',
            code: 'MISSING_API_KEY',
          });
        }

        // Role-based routing using verified free-tier Gemini 4 Hydrogen (with ThinkingLevel) & Flash-Lite
        let targetModel = 'gemini-4-hydrogen';
        let thinkingLevel: ThinkingLevel | undefined;
        let roleInstruction =
          'You are a Master Automotive Electronics Engineer and ECU Bench Specialist.';

        if (role === 'DEEP_REASONING') {
          targetModel = 'gemini-4-hydrogen';
          thinkingLevel = ThinkingLevel.HIGH;
          roleInstruction =
            'You are a Senior Automotive Electronics Research Scientist and Deep Root-Cause Diagnostic Specialist. Analyze electrical schematics, semiconductor failures, inductive transient spikes, ground loops, and CAN bus bus-off errors with deep mathematical and physical rigor. Explain physical mechanisms and exact failure modes. Never invent OEM pinouts or wire colors.';
        } else if (role === 'COMPLEX_INTERACTIVE') {
          targetModel = 'gemini-4-hydrogen';
          thinkingLevel = ThinkingLevel.MEDIUM;
          roleInstruction =
            'You are an Interactive ECU Bench Testing Specialist. Guide the technician step-by-step through interactive multimeter measurements, oscilloscope probing, pin voltage checks, and safe isolation testing on automotive ECUs. Never invent OEM pinouts or wire colors.';
        } else if (role === 'FAST') {
          targetModel = 'gemini-3.1-flash-lite';
          roleInstruction =
            'You are a High-Speed Automotive Bench Assistant. Give concise, direct, rapid diagnostic checks, general sensor test methods, and safety precautions with zero fluff. Never invent OEM pin numbers.';
        } else {
          targetModel = 'gemini-4-hydrogen';
          thinkingLevel = ThinkingLevel.LOW;
          roleInstruction =
            'You are a Master Automotive Electronics Engineer and ECU Bench Testing Instructor. Provide professional, physically accurate automotive diagnostics. Specify DC volts, Ohms, and waveform signatures. Never invent fake pin numbers.';
        }

        const cleanBenchContext =
          typeof benchContext === 'string' ? benchContext.trim().slice(0, 4000) : '';
        const systemText = `${roleInstruction}${cleanBenchContext ? `\n\n[Active Bench Telemetry Context]:\n${cleanBenchContext}` : ''}`;

        const plan = selectFreeTierRoutes(targetModel, [
          'gemini-4-hydrogen',
          'gemini-3.1-flash-lite',
        ]);

        if (plan.allInCooldown || plan.candidates.length === 0) {
          res.setHeader('Retry-After', String(plan.earliestRetryAfterSec || 30));
          return res.status(429).json({
            error: `All free-tier Gemini chat models are cooling down after quota limits. Retry in ${plan.earliestRetryAfterSec}s or use Offline AI.`,
            code: 'ALL_FREE_TIERS_COOLDOWN',
            retryAfterSec: plan.earliestRetryAfterSec,
            attemptedModels: [],
            allFreeTiersExhausted: true,
            freeTierPoolStatus: getFreeTierPoolSnapshot(),
          });
        }

        let response = null;
        let usedRoute = plan.candidates[0];
        let appliedThinkingLevel: ThinkingLevel | undefined;
        let lastClassified = classifyGeminiError(new Error('No models attempted'));
        const attemptedModels: string[] = [];
        const attemptedKeyIds: string[] = [];
        let observedRetryAfterSec = 0;
        let clientDisconnected = false;

        for (let i = 0; i < plan.candidates.length; i++) {
          if (clientDisconnected || res.writableEnded) {
            break;
          }
          const currentRoute = plan.candidates[i];
          const remainingCandidates = plan.candidates.length - 1 - i;
          usedRoute = currentRoute;
          if (!attemptedModels.includes(currentRoute.model)) {
            attemptedModels.push(currentRoute.model);
          }
          if (!attemptedKeyIds.includes(currentRoute.keyId)) {
            attemptedKeyIds.push(currentRoute.keyId);
          }
          recordRouteAttemptStart(currentRoute);

          const ai = getGeminiClientForApiKey(currentRoute.apiKey);
          const controller = new AbortController();
          const candidateTimeoutMs =
            remainingCandidates > 0
              ? role === 'DEEP_REASONING'
                ? 16_000
                : 12_000
              : 24_000;
          let timedOut = false;
          const timeoutHandle = setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, candidateTimeoutMs);
          const onReqClose = () => {
            if (!res.writableEnded) {
              clientDisconnected = true;
              controller.abort();
            }
          };
          req.on('close', onReqClose);

          try {
            appliedThinkingLevel = resolveAdjustedThinkingLevel(currentRoute.model, thinkingLevel);
            const requestConfig: {
              abortSignal: AbortSignal;
              systemInstruction: string;
              thinkingConfig?: { thinkingLevel: ThinkingLevel };
            } = {
              abortSignal: controller.signal,
              systemInstruction: systemText,
            };
            if (appliedThinkingLevel && currentRoute.model === 'gemini-4-hydrogen') {
              requestConfig.thinkingConfig = { thinkingLevel: appliedThinkingLevel };
            }

            response = await Promise.race([
              ai.models.generateContent({
                model: currentRoute.model,
                contents: formattedContents,
                config: requestConfig,
              }),
              new Promise<never>((_resolve, reject) => {
                controller.signal.addEventListener(
                  'abort',
                  () =>
                    reject(
                      new Error(
                        clientDisconnected
                          ? `Client disconnected during Gemini chat on ${currentRoute.model}`
                          : `Gemini chat timed out on ${currentRoute.model} after ${candidateTimeoutMs}ms`
                      )
                    ),
                  { once: true }
                );
              }),
            ]);
            if (response && response.text) {
              recordRouteSuccess(currentRoute, response.usageMetadata?.totalTokenCount);
              break;
            }
          } catch (modelErr: unknown) {
            if (clientDisconnected) {
              break;
            }
            const classified = classifyGeminiError(modelErr, timedOut || controller.signal.aborted);
            const failureResult = recordRouteFailure(
              currentRoute,
              classified,
              Date.now(),
              remainingCandidates
            );
            if (failureResult.cooldownSec > observedRetryAfterSec) {
              observedRetryAfterSec = failureResult.cooldownSec;
            }
            lastClassified = classified;
            if (failureResult.shouldTryNextRoute) {
              console.info(
                `[GeminiChat] Failover from ${currentRoute.keyId}/${currentRoute.model} (${classified.category} ${classified.statusCode}) to next healthy route.`
              );
            } else {
              console.warn(
                `[GeminiChat] ${currentRoute.keyId}/${currentRoute.model} failed (${classified.category} ${classified.statusCode}): ${classified.rawMessage}`
              );
              break;
            }
          } finally {
            clearTimeout(timeoutHandle);
            req.off('close', onReqClose);
          }
        }

        if (clientDisconnected || res.writableEnded) {
          return;
        }

        if (!response || !response.text) {
          if (observedRetryAfterSec > 0 && lastClassified.statusCode === 429) {
            res.setHeader('Retry-After', String(observedRetryAfterSec));
          }
          return res.status(lastClassified.statusCode).json({
            error: lastClassified.userMessage,
            code: lastClassified.category,
            attemptedModels,
            attemptedKeyIds,
            retryAfterSec: observedRetryAfterSec || lastClassified.retryAfterSec,
            allFreeTiersExhausted: lastClassified.statusCode === 429,
            freeTierPoolStatus: getFreeTierPoolSnapshot(),
          });
        }

        const reroutedFrom =
          plan.switchedFromEndpointId ||
          (attemptedModels.length > 1 ? attemptedModels[0] : undefined);

        return res.json({
          status: 'SUCCESS',
          reply: response.text,
          model: usedRoute.model,
          activeKeyId: usedRoute.keyId,
          switchedKeyFrom:
            plan.switchedFromKeyId ||
            (attemptedKeyIds.length > 1 ? attemptedKeyIds[0] : undefined),
          attemptedModels,
          reroutedFrom,
          preQuotaRerouted: plan.preQuotaSwitched,
          rerouteReason: plan.switchReason || undefined,
          thinkingLevel:
            usedRoute.model === 'gemini-4-hydrogen' ? appliedThinkingLevel : undefined,
          freeTierPoolStatus: getFreeTierPoolSnapshot(),
          timestamp: new Date().toISOString(),
        });
      } catch (err: unknown) {
        const classified = classifyGeminiError(err);
        return res.status(classified.statusCode).json({
          error: classified.userMessage,
          code: classified.category,
        });
      }
    }
  );

  // ==========================================================================
  // AUDIO TRANSCRIPTION (gemini-3.5-transcribe)
  // ==========================================================================
  const ALLOWED_AUDIO_MIME_TYPES = new Set([
    'audio/webm',
    'audio/wav',
    'audio/x-wav',
    'audio/mp3',
    'audio/mpeg',
    'audio/ogg',
    'audio/mp4',
    'audio/aac',
    'audio/flac',
  ]);
  const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

  app.post(
    '/api/autoelectric/transcribe-audio',
    requireAuthOrTrialSession,
    requireActiveLicense,
    aiRateAndConcurrencyGuard,
    imageJsonParser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { audioBase64, mimeType } = req.body || {};
        if (!audioBase64 || typeof audioBase64 !== 'string') {
          return res.status(400).json({
            error: 'Missing audioBase64 data.',
            code: 'INVALID_REQUEST',
          });
        }

        const normalizedMime = (
          typeof mimeType === 'string' && mimeType.trim() ? mimeType : 'audio/webm'
        )
          .split(';')[0]
          .trim()
          .toLowerCase();
        if (!ALLOWED_AUDIO_MIME_TYPES.has(normalizedMime)) {
          return res.status(400).json({
            error: `Unsupported audio MIME type "${normalizedMime}".`,
            code: 'INVALID_REQUEST',
          });
        }

        const cleanBase64 = audioBase64
          .replace(/^data:audio\/[a-zA-Z0-9.+-]+(?:;[^,;]+)*;base64,/, '')
          .trim();
        if (
          !cleanBase64 ||
          cleanBase64.length < 16 ||
          !/^[A-Za-z0-9+/=]+$/.test(cleanBase64)
        ) {
          return res.status(400).json({
            error: 'Invalid base64 audio encoding.',
            code: 'INVALID_REQUEST',
          });
        }

        const approxBytes = Math.ceil((cleanBase64.length * 3) / 4);
        const decodedBytes =
          approxBytes > MAX_AUDIO_BYTES
            ? MAX_AUDIO_BYTES + 1
            : Buffer.from(cleanBase64, 'base64').length;
        if (decodedBytes > MAX_AUDIO_BYTES) {
          return res.status(413).json({
            error: 'Audio payload exceeds maximum 8MB size limit.',
            code: 'PAYLOAD_TOO_LARGE',
          });
        }

        if (!hasConfiguredGeminiKeys()) {
          return res.status(503).json({
            error: 'Gemini API Key is not configured. Please check Settings > Secrets.',
            code: 'MISSING_API_KEY',
          });
        }

        const plan = selectFreeTierRoutes('gemini-3.5-transcribe', []);
        const selectedRoute = plan.selected;
        if (plan.allInCooldown || !selectedRoute || !selectedRoute.apiKey) {
          res.setHeader('Retry-After', String(plan.earliestRetryAfterSec || 30));
          return res.status(429).json({
            error: `Gemini transcription quota is cooling down. Retry in ${plan.earliestRetryAfterSec}s.`,
            code: 'ALL_FREE_TIERS_COOLDOWN',
            retryAfterSec: plan.earliestRetryAfterSec,
          });
        }

        recordRouteAttemptStart(selectedRoute);
        const ai = getGeminiClientForApiKey(selectedRoute.apiKey);

        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), 60_000);
        try {
          const response = await Promise.race([
            ai.models.generateContent({
              model: 'gemini-3.5-transcribe',
              contents: {
                parts: [
                  {
                    inlineData: {
                      mimeType: normalizedMime,
                      data: cleanBase64,
                    },
                  },
                  {
                    text: 'Transcribe this automotive diagnostic audio recording clearly and accurately. Preserve vehicle terms, pin names, DTC codes, and technician measurements verbatim.',
                  },
                ],
              },
              config: {
                abortSignal: controller.signal,
              },
            }),
            new Promise<never>((_resolve, reject) => {
              controller.signal.addEventListener(
                'abort',
                () => reject(new Error('Audio transcription timed out on gemini-3.5-transcribe')),
                { once: true }
              );
            }),
          ]);

          recordRouteSuccess(selectedRoute, response.usageMetadata?.totalTokenCount);
          const transcription = response.text || '';
          return res.json({
            status: 'SUCCESS',
            transcription: transcription.trim(),
            model: 'gemini-3.5-transcribe',
            activeKeyId: selectedRoute.keyId,
            timestamp: new Date().toISOString(),
          });
        } catch (innerErr: unknown) {
          recordRouteFailure(selectedRoute, classifyGeminiError(innerErr, controller.signal.aborted));
          throw innerErr;
        } finally {
          clearTimeout(timeoutHandle);
        }
      } catch (err: unknown) {
        const classified = classifyGeminiError(err);
        return res.status(classified.statusCode).json({
          error: classified.userMessage,
          code: classified.category,
        });
      }
    }
  );

  // ==========================================================================
  // GOOGLE MAPS GROUNDING (gemini-4-hydrogen + google_maps)
  // ==========================================================================
  app.post(
    '/api/autoelectric/grounded-maps',
    requireAuthOrTrialSession,
    requireActiveLicense,
    aiRateAndConcurrencyGuard,
    smallJsonParser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { query, location } = req.body || {};
        const cleanQuery = typeof query === 'string' ? query.trim() : '';
        if (!cleanQuery) {
          return res.status(400).json({
            error: 'Missing or empty query string.',
            code: 'INVALID_REQUEST',
          });
        }
        if (cleanQuery.length > 500) {
          return res.status(400).json({
            error: 'Query exceeds maximum length of 500 characters.',
            code: 'INVALID_REQUEST',
          });
        }

        const cleanLocation =
          typeof location === 'string' ? location.trim().slice(0, 200) : '';

        if (!hasConfiguredGeminiKeys()) {
          return res.status(503).json({
            error: 'Gemini API Key is not configured. Please check Settings > Secrets.',
            code: 'MISSING_API_KEY',
          });
        }

        const plan = selectFreeTierRoutes('gemini-4-hydrogen', []);
        const selectedRoute = plan.selected;
        if (plan.allInCooldown || !selectedRoute || !selectedRoute.apiKey) {
          res.setHeader('Retry-After', String(plan.earliestRetryAfterSec || 30));
          return res.status(429).json({
            error: `Gemini Maps grounding quota is cooling down. Retry in ${plan.earliestRetryAfterSec}s.`,
            code: 'ALL_FREE_TIERS_COOLDOWN',
            retryAfterSec: plan.earliestRetryAfterSec,
          });
        }

        recordRouteAttemptStart(selectedRoute);
        const ai = getGeminiClientForApiKey(selectedRoute.apiKey);

        const prompt = cleanLocation ? `${cleanQuery} in or near ${cleanLocation}` : cleanQuery;

        try {
          const interaction = await ai.interactions.create(
            {
              model: 'gemini-4-hydrogen',
              input: prompt,
              tools: [{ type: 'google_maps' }],
            },
            { timeout: 45_000 }
          );

          recordRouteSuccess(selectedRoute);
          const answer = interaction.output_text || 'No location results found.';
          return res.json({
            status: 'SUCCESS',
            answer,
            model: 'gemini-4-hydrogen',
            activeKeyId: selectedRoute.keyId,
            timestamp: new Date().toISOString(),
          });
        } catch (innerErr: unknown) {
          recordRouteFailure(selectedRoute, classifyGeminiError(innerErr));
          throw innerErr;
        }
      } catch (err: unknown) {
        const classified = classifyGeminiError(err);
        return res.status(classified.statusCode).json({
          error: classified.userMessage,
          code: classified.category,
        });
      }
    }
  );

  // ==========================================================================
  // ANIMATE IMAGES INTO VIDEO (gemini-omni-1.2-flash via Interactions API)
  // ==========================================================================
  app.post(
    '/api/autoelectric/animate-video',
    requireAuthOrTrialSession,
    requireActiveLicense,
    aiRateAndConcurrencyGuard,
    imageJsonParser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { imageBase64, mimeType, prompt, aspectRatio } = req.body || {};
        if (!imageBase64 || typeof imageBase64 !== 'string') {
          return res.status(400).json({
            error: 'Missing imageBase64 payload.',
            code: 'INVALID_REQUEST',
          });
        }

        const validation = validateImagePayload(
          imageBase64,
          typeof mimeType === 'string' ? mimeType : undefined
        );
        if (!validation.ok) {
          return res.status(validation.statusCode).json({
            error: validation.error,
            code: validation.statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_IMAGE_PAYLOAD',
          });
        }

        // Section 4: Paid billing-required video models are permanently prohibited
        return res.status(403).json({
          error:
            'Paid video generation (gemini-omni-1.2-flash) is disabled under the Free-Tier AI Only policy. Local interactive simulation remains available.',
          code: 'PAID_MODEL_PROHIBITED',
          fallbackToLocalAi: true,
        });
      } catch (err: unknown) {
        const classified = classifyGeminiError(err);
        const raw = classified.rawMessage.toLowerCase();
        if (
          classified.statusCode === 403 ||
          classified.statusCode === 429 ||
          raw.includes('billing') ||
          raw.includes('quota') ||
          raw.includes('paid')
        ) {
          return res.status(403).json({
            error:
              'Video animation with gemini-omni-1.2-flash requires a billing-enabled Gemini API key. Add a paid key in AI Studio Settings > Secrets > GEMINI_API_KEY.',
            code: 'PAID_MODEL_REQUIRED',
            model: 'gemini-omni-1.2-flash',
          });
        }
        return res.status(classified.statusCode).json({
          error: classified.userMessage,
          code: classified.category,
        });
      }
    }
  );

  // ==========================================================================
  // GROUNDED LAB STEP VIDEO TUTORIALS (Level 1 & Level 2 · gemini-omni-1.2-flash)
  // ==========================================================================
  app.post(
    '/api/autoelectric/step-tutorial-video',
    requireAuthOrTrialSession,
    requireActiveLicense,
    aiRateAndConcurrencyGuard,
    smallJsonParser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const body = (req.body || {}) as Record<string, unknown>;
        const moduleId = typeof body.moduleId === 'string' ? body.moduleId.trim() : '';
        const stepId = typeof body.stepId === 'string' ? body.stepId.trim() : '';
        const rawStyle = typeof body.narrationStyle === 'string' ? body.narrationStyle : 'TAGLISH_COACH';
        const rawDuration = Number(body.durationSec);

        if (!moduleId || !stepId) {
          return res.status(400).json({
            error: 'Missing moduleId or stepId.',
            code: 'INVALID_REQUEST',
          });
        }

        const labModule = UNIVERSITY_LAB_MODULES.find((m) => m.id === moduleId);
        if (!labModule) {
          return res.status(404).json({
            error: `Unknown lab module: ${moduleId}`,
            code: 'MODULE_NOT_FOUND',
          });
        }

        if (!isStepTutorialEligibleTier(labModule.tier)) {
          return res.status(400).json({
            error: 'Step tutorial videos are available exclusively for Level 1 and Level 2 lab exercises.',
            code: 'TIER_NOT_ELIGIBLE',
          });
        }

        const labStep = labModule.steps.find((s) => s.id === stepId);
        if (!labStep) {
          return res.status(404).json({
            error: `Unknown lab step: ${stepId}`,
            code: 'STEP_NOT_FOUND',
          });
        }

        const narrationStyle: TutorialNarrationStyle =
          rawStyle === 'CONCISE_BENCH' ||
          rawStyle === 'INSTRUCTOR_DETAILED' ||
          rawStyle === 'TAGLISH_COACH'
            ? rawStyle
            : 'TAGLISH_COACH';

        const durationSec: TutorialDurationSec =
          rawDuration === 5 || rawDuration === 6 || rawDuration === 8 ? rawDuration : 6;

        const cleanPins: EcuPin[] = Array.isArray(body.ecuPins)
          ? body.ecuPins
              .slice(0, 32)
              .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object'))
              .map((p, idx) => ({
                id: typeof p.id === 'string' ? p.id.slice(0, 48) : `pin-${idx + 1}`,
                pinNumber: Number.isFinite(Number(p.pinNumber)) ? Number(p.pinNumber) : idx + 1,
                label: typeof p.label === 'string' ? p.label.slice(0, 32) : `PIN_${idx + 1}`,
                name: typeof p.name === 'string' ? p.name.slice(0, 64) : `Pin ${idx + 1}`,
                category: 'sensor_in' as const,
                nominalVoltage: Number.isFinite(Number(p.nominalVoltage))
                  ? Number(p.nominalVoltage)
                  : 0,
                internalResistance: 1000,
                description: '',
              }))
          : [];

        const grounded = buildGroundedStepSpec(labModule, labStep, cleanPins);
        const subtitles = buildStepTutorialSubtitles(grounded, narrationStyle, durationSec);
        const prompt = buildStepTutorialPrompt(grounded, narrationStyle, durationSec);

        if (!hasConfiguredGeminiKeys()) {
          return res.status(503).json({
            error: 'Gemini API Key is not configured. Using interactive animated schematic fallback.',
            code: 'MISSING_API_KEY',
            grounded,
            subtitles,
          });
        }

        const routePlan = selectFreeTierRoutes('gemini-omni-1.2-flash', []);
        const selectedKey = routePlan.selected?.apiKey || process.env.GEMINI_API_KEY;
        if (!selectedKey) {
          return res.status(503).json({
            error: 'Gemini API Key is not configured. Using interactive animated schematic fallback.',
            code: 'MISSING_API_KEY',
            grounded,
            subtitles,
          });
        }

        const ai = getGeminiClientForApiKey(selectedKey);
        const interaction = await ai.interactions.create(
          {
            model: 'gemini-omni-1.2-flash',
            input: [
              {
                type: 'text',
                text: prompt,
              },
            ],
            background: false,
            store: false,
            stream: false,
            response_format: {
              type: 'video',
              aspect_ratio: '16:9',
              duration: `${durationSec}s`,
              resolution: '720p',
            },
          },
          { timeout: 300_000 }
        );

        const videoPart = interaction.output_video;
        if (videoPart && videoPart.data) {
          const videoDataUrl = `data:${videoPart.mime_type || 'video/mp4'};base64,${videoPart.data}`;
          return res.json({
            status: 'SUCCESS',
            videoUrl: videoDataUrl,
            model: 'gemini-omni-1.2-flash',
            aspectRatio: '16:9',
            durationSec,
            grounded,
            subtitles,
            timestamp: new Date().toISOString(),
          });
        }

        return res.status(502).json({
          error: 'Video generation returned no video payload. Switching to interactive schematic.',
          code: 'VIDEO_GENERATION_FAILED',
          grounded,
          subtitles,
        });
      } catch (err: unknown) {
        const classified = classifyGeminiError(err);
        const raw = classified.rawMessage.toLowerCase();
        if (
          classified.statusCode === 403 ||
          classified.statusCode === 429 ||
          raw.includes('billing') ||
          raw.includes('quota') ||
          raw.includes('paid')
        ) {
          return res.status(classified.statusCode === 429 ? 429 : 403).json({
            error:
              classified.statusCode === 429
                ? 'Gemini video quota exceeded. Interactive animated schematic with voice guidance is active.'
                : 'AI video generation requires a billing-enabled Gemini API key. Interactive schematic fallback is active.',
            code: classified.statusCode === 429 ? 'QUOTA_EXCEEDED' : 'PAID_MODEL_REQUIRED',
            model: 'gemini-omni-1.2-flash',
          });
        }
        return res.status(classified.statusCode).json({
          error: classified.userMessage,
          code: classified.category,
        });
      }
    }
  );

  // ==========================================================================
  // CREATE & EDIT IMAGES (gemini-nano-banana-2.1)
  // ==========================================================================
  app.post(
    '/api/autoelectric/generate-image',
    requireAuthOrTrialSession,
    requireActiveLicense,
    aiRateAndConcurrencyGuard,
    imageJsonParser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { prompt, baseImageBase64, mimeType, aspectRatio } = req.body || {};
        const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';
        if (!cleanPrompt) {
          return res.status(400).json({
            error: 'Missing or empty prompt string.',
            code: 'INVALID_REQUEST',
          });
        }
        if (cleanPrompt.length > 2000) {
          return res.status(400).json({
            error: 'Prompt exceeds maximum length of 2000 characters.',
            code: 'INVALID_REQUEST',
          });
        }

        let validatedBaseImage: { base64: string; mimeType: string } | null = null;
        if (baseImageBase64 !== undefined && baseImageBase64 !== null && baseImageBase64 !== '') {
          if (typeof baseImageBase64 !== 'string') {
            return res.status(400).json({
              error: 'baseImageBase64 must be a base64 string.',
              code: 'INVALID_IMAGE_PAYLOAD',
            });
          }
          const validation = validateImagePayload(
            baseImageBase64,
            typeof mimeType === 'string' ? mimeType : undefined
          );
          if (!validation.ok) {
            return res.status(validation.statusCode).json({
              error: validation.error,
              code:
                validation.statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_IMAGE_PAYLOAD',
            });
          }
          validatedBaseImage = {
            base64: baseImageBase64
              .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
              .trim(),
            mimeType: validation.normalizedMimeType,
          };
        }

        // Section 4: Paid billing-required image generation models are permanently prohibited
        return res.status(403).json({
          error:
            'Paid image generation (gemini-nano-banana-2.1) is disabled under the Free-Tier AI Only policy.',
          code: 'PAID_MODEL_PROHIBITED',
          fallbackToLocalAi: true,
        });
      } catch (err: unknown) {
        const classified = classifyGeminiError(err);
        const raw = classified.rawMessage.toLowerCase();
        if (
          classified.statusCode === 403 ||
          classified.statusCode === 429 ||
          raw.includes('billing') ||
          raw.includes('quota') ||
          raw.includes('paid')
        ) {
          return res.status(403).json({
            error:
              'Image generation with gemini-nano-banana-2.1 requires a billing-enabled Gemini API key. Add a paid key in AI Studio Settings > Secrets > GEMINI_API_KEY.',
            code: 'PAID_MODEL_REQUIRED',
            model: 'gemini-nano-banana-2.1',
          });
        }
        return res.status(classified.statusCode).json({
          error: classified.userMessage,
          code: classified.category,
        });
      }
    }
  );

  // ==========================================================================
  // HANDS-FREE VOICE READOUT ASSISTANT (gemini-4-hydrogen)
  // ==========================================================================
  app.post(
    '/api/autoelectric/live-voice',
    requireAuthOrTrialSession,
    requireActiveLicense,
    aiRateAndConcurrencyGuard,
    smallJsonParser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { speechText, benchContext } = req.body || {};
        const cleanSpeech = typeof speechText === 'string' ? speechText.trim() : '';
        if (!cleanSpeech) {
          return res.status(400).json({
            error: 'Missing or empty speechText string.',
            code: 'INVALID_REQUEST',
          });
        }
        if (cleanSpeech.length > 2000) {
          return res.status(400).json({
            error: 'speechText exceeds maximum length of 2000 characters.',
            code: 'INVALID_REQUEST',
          });
        }

        if (!hasConfiguredGeminiKeys()) {
          return res.status(503).json({
            error: 'Gemini API Key is not configured. Please check Settings > Secrets.',
            code: 'MISSING_API_KEY',
          });
        }

        const cleanBenchContext =
          typeof benchContext === 'string' ? benchContext.trim().slice(0, 4000) : '';
        const systemInstruction = `You are the Hands-Free Voice Technician Assistant for AutoElectric Lab Pro.
Provide brief, direct, hands-free automotive test instructions suitable for voice readout while the technician is operating test probes. Never invent OEM pin numbers or wiring specs.
${cleanBenchContext ? `Live Bench Context: ${cleanBenchContext}` : ''}`;

        const plan = selectFreeTierRoutes('gemini-4-hydrogen', ['gemini-3.1-flash-lite']);
        if (plan.allInCooldown || plan.candidates.length === 0) {
          res.setHeader('Retry-After', String(plan.earliestRetryAfterSec || 30));
          return res.status(429).json({
            error: `Free-tier Gemini Voice models are cooling down after quota limits. Retry in ${plan.earliestRetryAfterSec}s.`,
            code: 'ALL_FREE_TIERS_COOLDOWN',
            retryAfterSec: plan.earliestRetryAfterSec,
            allFreeTiersExhausted: true,
            freeTierPoolStatus: getFreeTierPoolSnapshot(),
          });
        }

        let voiceReply = '';
        let usedRoute = plan.candidates[0];
        let lastClassified = classifyGeminiError(new Error('No voice models attempted'));
        let observedRetryAfterSec = 0;

        for (let i = 0; i < plan.candidates.length; i++) {
          const currentRoute = plan.candidates[i];
          usedRoute = currentRoute;
          recordRouteAttemptStart(currentRoute);
          const ai = getGeminiClientForApiKey(currentRoute.apiKey);

          try {
            if (currentRoute.model === 'gemini-4-hydrogen') {
              const interaction = await ai.interactions.create(
                {
                  model: 'gemini-4-hydrogen',
                  input: cleanSpeech,
                  system_instruction: systemInstruction,
                  generation_config: {
                    thinking_level: 'low',
                  },
                },
                { timeout: 30_000 }
              );
              voiceReply = interaction.output_text || '';
              if (voiceReply.trim()) {
                recordRouteSuccess(currentRoute);
                break;
              }
            } else {
              const controller = new AbortController();
              const timeoutHandle = setTimeout(() => controller.abort(), 25_000);
              try {
                const genRes = await Promise.race([
                  ai.models.generateContent({
                    model: currentRoute.model,
                    contents: cleanSpeech,
                    config: {
                      abortSignal: controller.signal,
                      systemInstruction,
                    },
                  }),
                  new Promise<never>((_resolve, reject) => {
                    controller.signal.addEventListener(
                      'abort',
                      () => reject(new Error(`Voice turn timed out on ${currentRoute.model}`)),
                      { once: true }
                    );
                  }),
                ]);
                voiceReply = genRes.text || '';
                if (voiceReply.trim()) {
                  recordRouteSuccess(currentRoute, genRes.usageMetadata?.totalTokenCount);
                  break;
                }
              } finally {
                clearTimeout(timeoutHandle);
              }
            }
          } catch (modelErr: unknown) {
            const classified = classifyGeminiError(modelErr);
            const failureResult = recordRouteFailure(
              currentRoute,
              classified,
              Date.now(),
              plan.candidates.length - 1 - i
            );
            if (failureResult.cooldownSec > observedRetryAfterSec) {
              observedRetryAfterSec = failureResult.cooldownSec;
            }
            lastClassified = classified;
            if (!failureResult.shouldTryNextRoute) {
              break;
            }
          }
        }

        if (!voiceReply.trim()) {
          if (observedRetryAfterSec > 0 && lastClassified.statusCode === 429) {
            res.setHeader('Retry-After', String(observedRetryAfterSec));
          }
          return res.status(lastClassified.statusCode).json({
            error: lastClassified.userMessage,
            code: lastClassified.category,
            retryAfterSec: observedRetryAfterSec || lastClassified.retryAfterSec,
            allFreeTiersExhausted: lastClassified.statusCode === 429,
          });
        }

        return res.json({
          status: 'SUCCESS',
          reply: voiceReply.trim(),
          model: usedRoute.model,
          activeKeyId: usedRoute.keyId,
          switchedKeyFrom: plan.switchedFromKeyId || undefined,
          reroutedFrom: plan.switchedFromEndpointId || undefined,
          preQuotaRerouted: plan.preQuotaSwitched,
          rerouteReason: plan.switchReason || undefined,
          freeTierPoolStatus: getFreeTierPoolSnapshot(),
          timestamp: new Date().toISOString(),
        });
      } catch (err: unknown) {
        const classified = classifyGeminiError(err);
        return res.status(classified.statusCode).json({
          error: classified.userMessage,
          code: classified.category,
        });
      }
    }
  );

  // Official NHTSA vPIC VIN Decoder, WMI/Makes Directory & Safety Recalls/Complaints Lookup
  async function executeVinLookup(
    rawVin: string,
    modelYear: string | undefined,
    includeRecalls: boolean
  ): Promise<NhtsaVehicleLookupResponse> {
    const vinResult = await decodeVinViaNhtsa(rawVin, modelYear);
    const decoded = vinResult.decoded;

    let recalls: NhtsaVehicleLookupResponse['recalls'] = [];
    let complaints: NhtsaVehicleLookupResponse['complaints'] = [];
    let complaintCount = 0;
    let recallsCached = false;
    let recallsStale = false;

    if (includeRecalls && decoded.make && decoded.model && /^\d{4}$/.test(decoded.modelYear)) {
      try {
        const recallRes = await fetchNhtsaRecallsAndComplaints(
          decoded.make,
          decoded.model,
          decoded.modelYear
        );
        recalls = recallRes.recalls;
        complaints = recallRes.complaints;
        complaintCount = recallRes.complaintCount;
        recallsCached = recallRes.cached;
        recallsStale = recallRes.stale;
      } catch (recallErr) {
        console.warn(
          `[NHTSA] Non-fatal recalls/complaints lookup failed after VIN decode (${maskVin(decoded.vin)}):`,
          recallErr instanceof Error ? recallErr.message : 'Upstream failure'
        );
      }
    }

    const anyStale = vinResult.stale || recallsStale;
    return {
      status: 'SUCCESS',
      source: 'NHTSA_OFFICIAL_PUBLIC_API',
      verificationStatus: 'OFFICIAL_GOVERNMENT',
      provenance: buildNhtsaProvenance({
        sourceName: 'NHTSA Official vPIC & Safety Recalls API',
        sourceUrlOrRef: 'https://vpic.nhtsa.dot.gov/api/',
        manufacturer: decoded.manufacturer || decoded.make || 'NHTSA vPIC',
        applicableVehicle:
          [decoded.modelYear, decoded.make, decoded.model].filter(Boolean).join(' ') ||
          maskVin(decoded.vin),
        engineCode: [decoded.engineModel, decoded.displacementL ? `${decoded.displacementL}L` : '']
          .filter(Boolean)
          .join(' '),
        dateRetrieved: vinResult.fetchedAt,
      }),
      regionalNote: NHTSA_US_COVERAGE_NOTE,
      decodedVin: decoded,
      recalls,
      complaints,
      recallCount: recalls.length,
      complaintCount,
      cached: vinResult.cached || recallsCached,
      stale: anyStale,
      staleWarning: anyStale ? NHTSA_STALE_CACHE_WARNING : undefined,
      fetchedAt: vinResult.fetchedAt,
      expiresAt: vinResult.expiresAt,
      timestamp: new Date().toISOString(),
    };
  }

  app.get(
    '/api/autoelectric/vin/:vin',
    requireAuthOrTrialSession,
    nhtsaRateGuard,
    async (req: AuthenticatedRequest, res) => {
      try {
        const rawVin = typeof req.params.vin === 'string' ? req.params.vin : '';
        const modelYear = typeof req.query.year === 'string' ? req.query.year : undefined;
        const includeRecalls = req.query.includeRecalls !== '0';
        return res.json(await executeVinLookup(rawVin, modelYear, includeRecalls));
      } catch (err: unknown) {
        if (err instanceof NhtsaUpstreamError) {
          return res.status(err.statusCode).json({ error: err.message, code: 'NHTSA_ERROR' });
        }
        const msg = err instanceof Error ? err.message : 'NHTSA VIN lookup failed.';
        console.error('[NHTSA] VIN decode error:', msg);
        return res.status(502).json({
          error: 'Unable to reach the official NHTSA VIN service right now. Please try again shortly.',
          code: 'NHTSA_UPSTREAM_ERROR',
        });
      }
    }
  );

  app.get(
    '/api/autoelectric/vehicle/decode-vin',
    requireAuthOrTrialSession,
    nhtsaRateGuard,
    async (req: AuthenticatedRequest, res) => {
      try {
        const rawVin = typeof req.query.vin === 'string' ? req.query.vin : '';
        const modelYear = typeof req.query.year === 'string' ? req.query.year : undefined;
        const includeRecalls = req.query.includeRecalls !== '0';
        return res.json(await executeVinLookup(rawVin, modelYear, includeRecalls));
      } catch (err: unknown) {
        if (err instanceof NhtsaUpstreamError) {
          return res.status(err.statusCode).json({ error: err.message, code: 'NHTSA_ERROR' });
        }
        const msg = err instanceof Error ? err.message : 'NHTSA VIN lookup failed.';
        console.error('[NHTSA] VIN decode error:', msg);
        return res.status(502).json({
          error: 'Unable to reach the official NHTSA VIN service right now. Please try again shortly.',
          code: 'NHTSA_UPSTREAM_ERROR',
        });
      }
    }
  );

  const handleVehicleRecallsOrComplaints = async (
    req: AuthenticatedRequest,
    res: express.Response,
    mode: 'ALL' | 'RECALLS_ONLY' | 'COMPLAINTS_ONLY'
  ) => {
    try {
      const make = typeof req.query.make === 'string' ? req.query.make : '';
      const model = typeof req.query.model === 'string' ? req.query.model : '';
      const year = typeof req.query.year === 'string' ? req.query.year : '';

      const recallRes = await fetchNhtsaRecallsAndComplaints(make, model, year);
      const recalls = mode === 'COMPLAINTS_ONLY' ? [] : recallRes.recalls;
      const complaints = mode === 'RECALLS_ONLY' ? [] : recallRes.complaints;
      const payload: NhtsaVehicleLookupResponse = {
        status: 'SUCCESS',
        source: 'NHTSA_OFFICIAL_PUBLIC_API',
        verificationStatus: 'OFFICIAL_GOVERNMENT',
        provenance: buildNhtsaProvenance({
          sourceName: 'NHTSA Official Safety Recalls & ODI Complaints API',
          sourceUrlOrRef: 'https://api.nhtsa.gov/',
          manufacturer: make.trim(),
          applicableVehicle: `${year.trim()} ${make.trim()} ${model.trim()}`.trim(),
          dateRetrieved: recallRes.fetchedAt,
        }),
        regionalNote: NHTSA_US_COVERAGE_NOTE,
        recalls,
        complaints,
        recallCount: recalls.length,
        complaintCount: mode === 'RECALLS_ONLY' ? 0 : recallRes.complaintCount,
        cached: recallRes.cached,
        stale: recallRes.stale,
        staleWarning: recallRes.stale ? NHTSA_STALE_CACHE_WARNING : undefined,
        fetchedAt: recallRes.fetchedAt,
        expiresAt: recallRes.expiresAt,
        timestamp: new Date().toISOString(),
      };
      return res.json(payload);
    } catch (err: unknown) {
      if (err instanceof NhtsaUpstreamError) {
        return res.status(err.statusCode).json({ error: err.message, code: 'NHTSA_ERROR' });
      }
      const msg = err instanceof Error ? err.message : 'NHTSA vehicle safety lookup failed.';
      console.error('[NHTSA] Vehicle safety lookup error:', msg);
      return res.status(502).json({
        error: 'Unable to reach the official NHTSA safety lookup service right now. Please try again shortly.',
        code: 'NHTSA_UPSTREAM_ERROR',
      });
    }
  };

  app.get('/api/autoelectric/recalls', requireAuthOrTrialSession, nhtsaRateGuard, (req, res) =>
    handleVehicleRecallsOrComplaints(req, res, 'ALL')
  );

  app.get('/api/autoelectric/vehicle/recalls', requireAuthOrTrialSession, nhtsaRateGuard, (req, res) =>
    handleVehicleRecallsOrComplaints(req, res, 'RECALLS_ONLY')
  );

  app.get('/api/autoelectric/vehicle/complaints', requireAuthOrTrialSession, nhtsaRateGuard, (req, res) =>
    handleVehicleRecallsOrComplaints(req, res, 'COMPLAINTS_ONLY')
  );

  app.get(
    '/api/autoelectric/vehicle/makes',
    requireAuthOrTrialSession,
    nhtsaRateGuard,
    async (req: AuthenticatedRequest, res) => {
      try {
        const result = await fetchVehicleMakesAndWmiViaNhtsa({
          wmi: typeof req.query.wmi === 'string' ? req.query.wmi : undefined,
          manufacturer:
            typeof req.query.manufacturer === 'string' ? req.query.manufacturer : undefined,
          make: typeof req.query.make === 'string' ? req.query.make : undefined,
          year: typeof req.query.year === 'string' ? req.query.year : undefined,
        });
        return res.json(result);
      } catch (err: unknown) {
        if (err instanceof NhtsaUpstreamError) {
          return res.status(err.statusCode).json({ error: err.message, code: 'NHTSA_ERROR' });
        }
        const msg = err instanceof Error ? err.message : 'NHTSA vehicle makes lookup failed.';
        console.error('[NHTSA] Vehicle makes lookup error:', msg);
        return res.status(502).json({
          error: 'Unable to reach the official NHTSA vehicle directory right now. Please try again shortly.',
          code: 'NHTSA_UPSTREAM_ERROR',
        });
      }
    }
  );

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ONLINE',
      uptimeSec: Math.floor(process.uptime()),
      persistence: {
        durableDataDirConfigured: Boolean(process.env.VECL_DATA_DIR?.trim()),
        strictProductionSecrets: isStrictProductionSecrets(),
      },
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/autoelectric/health', (_req, res) => {
    const provider = resolveImageAnalysisProviderName();
    const hasGeminiKey = hasConfiguredGeminiKeys();
    res.json({
      status: 'ONLINE',
      authProtected: true,
      serviceMode: provider === 'manual' ? 'MANUAL_REVIEW' : 'AI_IMAGE_ANALYSIS',
      hasApiKey: hasGeminiKey,
      hasGeminiKey,
      imageAnalysisProvider: provider,
      freeTierGateway: {
        cloudShutoffActive: getGatewayUsageSnapshot().cloudShutoffActive,
        enabledAllowlistModels: getGatewayUsageSnapshot()
          .allowlist.filter((m) => m.enabled)
          .map((m) => m.modelId),
      },
      timestamp: new Date().toISOString(),
    });
  });

  // ==========================================================================
  // M4: GEMINI FREE-TIER GATEWAY (Default-Disabled Allowlist, Quota Shutoff, Privacy Filter)
  // ==========================================================================
  app.post(
    '/api/autoelectric/ai/gateway',
    requireAuthOrTrialSession,
    requireActiveLicense,
    aiRateAndConcurrencyGuard,
    smallJsonParser,
    async (req: AuthenticatedRequest, res) => {
      const { model, prompt, systemInstruction } = req.body || {};
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({
          error: 'Missing or empty prompt.',
          code: 'INVALID_REQUEST',
        });
      }
      if (prompt.length > 6000) {
        return res.status(400).json({
          error: 'Prompt exceeds maximum length (6000 chars).',
          code: 'INVALID_REQUEST',
        });
      }

      const requestedModel = typeof model === 'string' ? model.trim() : '';
      const result = await executeFreeTierGatewayPrompt({
        modelId: requestedModel,
        prompt,
        systemInstruction:
          typeof systemInstruction === 'string' ? systemInstruction.slice(0, 2000) : undefined,
        actor: req.authUser?.uid || 'authenticated-user',
      });

      if (!result.ok) {
        return res.status(result.statusCode).json({
          error: result.error,
          code: result.code,
          fallbackToLocalAi: result.fallbackToLocalAi,
        });
      }

      return res.json({
        status: 'SUCCESS',
        reply: result.reply,
        model: result.model,
        privacyRedactions: result.privacyRedactions ?? 0,
        timestamp: new Date().toISOString(),
      });
    }
  );

  app.get(
    '/api/autoelectric/ai/quota-status',
    requireAuthOrTrialSession,
    (_req: AuthenticatedRequest, res) => {
      return res.json({
        status: 'SUCCESS',
        pool: getFreeTierPoolSnapshot(),
        quotaManager: getQuotaManagerSnapshot(),
        checkedAt: new Date().toISOString(),
      });
    }
  );

  app.get(
    '/api/autoelectric/diagnostics/connection-health',
    requireAuthOrTrialSession,
    async (req: AuthenticatedRequest, res) => {
      try {
        let authKind: 'FIREBASE_ID_TOKEN' | 'TRIAL_PIN' | 'MASTER_ADMIN_PIN' = req.isPinAdmin
          ? 'MASTER_ADMIN_PIN'
          : req.trialAccess
            ? 'TRIAL_PIN'
            : 'FIREBASE_ID_TOKEN';
        let serverFirebaseVerified = authKind === 'FIREBASE_ID_TOKEN';
        let uidMasked = maskUidForDiagnostics(req.authUser?.uid);
        let emailVerified = Boolean(req.authUser?.emailVerified);

        // If authenticated via Trial/Admin PIN while also signed into Firebase Google Auth,
        // verify the accompanying Firebase ID token via RS256 JWKS as well.
        const extraFirebaseToken =
          typeof req.headers['x-firebase-id-token'] === 'string'
            ? req.headers['x-firebase-id-token'].trim()
            : '';
        if (!serverFirebaseVerified && extraFirebaseToken) {
          try {
            const decoded = await verifyFirebaseIdToken(extraFirebaseToken);
            serverFirebaseVerified = true;
            uidMasked = maskUidForDiagnostics(decoded.uid);
            emailVerified = Boolean(decoded.emailVerified);
          } catch {
            serverFirebaseVerified = false;
          }
        }

        const cloudSqlPostgres = await probePostgresConnection();
        const overallStatus =
          cloudSqlPostgres.status === 'CONNECTED'
            ? 'HEALTHY'
            : cloudSqlPostgres.status === 'NOT_CONFIGURED'
              ? 'POSTGRES_UNCONFIGURED'
              : 'DEGRADED';

        return res.json({
          status: overallStatus,
          checkedAt: new Date().toISOString(),
          firebaseAuth: {
            serverVerified: serverFirebaseVerified,
            authKind,
            uidMasked,
            emailVerified,
          },
          cloudSqlPostgres,
        });
      } catch (err: unknown) {
        console.error('[ConnectionHealth] Diagnostic probe error:', err);
        return res.status(500).json({
          error: 'Connection health diagnostic failed.',
          code: 'CONNECTION_HEALTH_ERROR',
        });
      }
    }
  );

  // ============================================================================
  // OFFLINE SUBSCRIPTION PIN & ECDSA P-256 PUBLIC KEY ROUTES
  // ============================================================================
  const requireBillingMasterAdmin: express.RequestHandler = (
    req: AuthenticatedRequest,
    res,
    next
  ) => {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer vecl_admin_v1.')) {
      const token = authHeader.slice('Bearer '.length).trim();
      const check = verifyAdminSessionToken(token);
      if (check.valid) {
        req.isPinAdmin = true;
        req.authUser = { uid: 'pin-admin:master', email: null, emailVerified: true };
        next();
        return;
      }
      return res.status(401).json({
        error: check.error || 'Admin session token invalid or expired.',
        code: check.code || 'INVALID_TOKEN',
      });
    }

    const headerPin =
      typeof req.headers['x-admin-pin'] === 'string' ? req.headers['x-admin-pin'].trim() : '';
    if (headerPin) {
      const rateKey = `billing-admin-pin:${req.ip || 'unknown'}`;
      const limit = checkAdminPinRateLimit(rateKey);
      if (!limit.allowed) {
        return res.status(429).json({
          error: 'Too many failed Master Admin PIN attempts. Try again later.',
          code: 'RATE_LIMITED',
        });
      }
      try {
        verifyMasterAdminPinAndIssueToken(headerPin);
        req.isPinAdmin = true;
        req.authUser = { uid: 'pin-admin:master', email: null, emailVerified: true };
        next();
        return;
      } catch {
        return res.status(401).json({
          error: 'Invalid Master Admin PIN.',
          code: 'INVALID_MASTER_PIN',
        });
      }
    }

    return res.status(401).json({
      error: 'Master Admin PIN authentication is required for offline license signing.',
      code: 'AUTH_REQUIRED',
    });
  };

  app.get('/api/billing/public-key', (_req, res) => {
    const publicKeyJwk = getPublicVerificationKeyJwk();
    return res.json({
      status: 'SUCCESS',
      algorithm: 'ECDSA-P256-SHA256',
      publicKeyJwk,
    });
  });

  // Server-side ECDSA attestation for Academy lab-report digests (see src/services/labReportSignatureClient.ts)
  app.post(
    '/api/autoelectric/academy/sign-report',
    requireAuthOrTrialSession,
    nhtsaRateGuard,
    smallJsonParser,
    (req, res) => {
      const sha256Hash = typeof req.body?.sha256Hash === 'string' ? req.body.sha256Hash.trim() : '';
      if (!/^[a-fA-F0-9]{64}$/.test(sha256Hash)) {
        return res.status(400).json({
          error: 'sha256Hash must be a 64-character hexadecimal SHA-256 digest.',
          code: 'INVALID_LAB_REPORT_HASH',
        });
      }
      try {
        return res.json({ status: 'SUCCESS', signature: signLabReportHash(sha256Hash) });
      } catch (err: unknown) {
        console.error(
          '[Academy] Lab report signing failed:',
          err instanceof Error ? err.message : 'Unknown error'
        );
        return res.status(500).json({
          error: 'Failed to sign lab report digest.',
          code: 'LAB_REPORT_SIGNING_FAILED',
        });
      }
    }
  );

  app.post(
    '/api/admin/generate-license',
    requireBillingMasterAdmin,
    smallJsonParser,
    (req, res) => {
      try {
        const allowedDurations = new Set<number>([30, 90, 180, 365, 36500]);
        const rawDays = Number(req.body?.durationDays);
        if (!Number.isFinite(rawDays) || !allowedDurations.has(rawDays)) {
          return res.status(400).json({
            error: 'durationDays must be one of 30, 90, 180, 365, or 36500 (Lifetime).',
            code: 'INVALID_DURATION_DAYS',
          });
        }
        const technicianNote =
          typeof req.body?.technicianNote === 'string' ? req.body.technicianNote : '';
        const record = generateSignedOfflineLicense({
          durationDays: rawDays as SubscriptionDurationDays,
          technicianNote,
        });
        return res.json({
          status: 'SUCCESS',
          record,
          publicKeyJwk: getPublicVerificationKeyJwk(),
        });
      } catch (err: unknown) {
        console.error(
          '[AdminBilling] Offline license generation failed:',
          err instanceof Error ? err.message : 'Unknown error'
        );
        return res.status(500).json({
          error: 'Failed to generate offline license record.',
          code: 'OFFLINE_LICENSE_GENERATION_FAILED',
        });
      }
    }
  );

  app.get('/api/admin/licenses', requireBillingMasterAdmin, (_req, res) => {
    return res.json({
      status: 'SUCCESS',
      licenses: listIssuedOfflineLicenses(),
    });
  });

  app.use('/api', (req, res) => {
    const safePath = String(req.path || '').replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 120);
    res.status(404).json({
      error: `API endpoint not found: ${req.method} /api${safePath}`,
      code: 'API_ROUTE_NOT_FOUND',
    });
  });

  // Structured JSON error handler for route-specific body parser limits (413) and malformed JSON (400)
  app.use(
    (
      err: { status?: number; statusCode?: number; type?: string; message?: string },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (res.headersSent) {
        return next(err);
      }
      if (err && (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413)) {
        return res.status(413).json({
          error: 'Request payload exceeds the maximum allowed size for this endpoint.',
          code: 'PAYLOAD_TOO_LARGE',
        });
      }
      if (err && (err.type === 'entity.parse.failed' || err.status === 400 || err.statusCode === 400)) {
        return res.status(400).json({
          error: 'Malformed JSON request payload.',
          code: 'INVALID_JSON_BODY',
        });
      }
      return next(err);
    }
  );

  return app;
}

