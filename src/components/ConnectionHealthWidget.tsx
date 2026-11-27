/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  ExternalLink,
  Info,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getFirebaseTargetSummary } from '../lib/firebase';
import {
  buildFirebaseFixGuideItems,
  type FullConnectionHealthSnapshot,
  runConnectionHealthDiagnostics,
} from '../services/connectionHealthClient';
import {
  type CloudSyncStatusSnapshot,
  getSyncStatusSnapshot,
  subscribeSyncStatus,
} from '../services/benchStorageService';

export interface FormattedConnectionErrorDetails {
  hasError: boolean;
  severity: 'CRITICAL' | 'WARNING' | 'NONE';
  headline: string;
  errorCode: string;
  formattedMessage: string;
  probeSummary: string;
  remediationHint: string;
  checkedAtLabel: string;
}

export function formatCloudSqlErrorDetails(
  snapshot: FullConnectionHealthSnapshot | null
): FormattedConnectionErrorDetails {
  if (!snapshot) {
    return {
      hasError: false,
      severity: 'NONE',
      headline: 'Checking Cloud SQL connection...',
      errorCode: 'CHECKING',
      formattedMessage: 'Awaiting initial database diagnostic response.',
      probeSummary: 'Probe pending',
      remediationHint: 'Click Re-Ping to test connectivity manually.',
      checkedAtLabel: 'Pending',
    };
  }

  const pg = snapshot.cloudSqlPostgres;
  const checkedAtLabel = new Date(snapshot.checkedAtIso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (pg.status === 'UNREACHABLE') {
    const codeMatch = pg.detail.match(/\b(ECONNREFUSED|ENOENT|ETIMEDOUT|ENOTFOUND|EACCES|HTTP \d{3})\b/i);
    const errorCode = codeMatch ? codeMatch[1].toUpperCase() : 'PG_UNREACHABLE';
    return {
      hasError: true,
      severity: 'CRITICAL',
      headline: 'Cloud SQL PostgreSQL Unreachable',
      errorCode,
      formattedMessage: `[${errorCode}] ${pg.detail}`,
      probeSummary: `Method: ${pg.probeMethod} · Latency: ${pg.latencyMs}ms`,
      remediationHint:
        'Verify Cloud SQL Auth Proxy / SQL_HOST availability. Cloud Firestore & local IndexedDB offline sync remain operational.',
      checkedAtLabel,
    };
  }

  if (pg.status === 'AUTH_REQUIRED') {
    return {
      hasError: true,
      severity: 'WARNING',
      headline: 'Authentication Required for Cloud SQL Ping',
      errorCode: 'AUTH_REQUIRED',
      formattedMessage: `[AUTH_REQUIRED] ${pg.detail}`,
      probeSummary: 'Method: NONE · Guarded by RS256 / PIN auth',
      remediationHint:
        'Sign in with Google or unlock an active Trial/Admin PIN, then click Re-Ping.',
      checkedAtLabel,
    };
  }

  if (pg.status === 'NOT_CONFIGURED') {
    return {
      hasError: true,
      severity: 'WARNING',
      headline: 'Cloud SQL PostgreSQL Not Configured',
      errorCode: 'SQL_NOT_CONFIGURED',
      formattedMessage: `[SQL_NOT_CONFIGURED] ${pg.detail}`,
      probeSummary: 'Method: NONE · Runtime SQL_* vars unset',
      remediationHint:
        'Active persistence is handled by Cloud Firestore & IndexedDB offline vault until Cloud SQL runtime variables are provisioned.',
      checkedAtLabel,
    };
  }

  return {
    hasError: false,
    severity: 'NONE',
    headline: 'Cloud SQL PostgreSQL Connected',
    errorCode: 'OK',
    formattedMessage: pg.detail,
    probeSummary: `Method: ${pg.probeMethod} · Latency: ${pg.latencyMs}ms`,
    remediationHint: 'Connection healthy.',
    checkedAtLabel,
  };
}

export const ConnectionHealthWidget: React.FC = () => {
  const { user, authReady, isSigningIn, authErrorDetails, signInWithGoogle } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [dbPulseActive, setDbPulseActive] = useState(false);
  const [showErrorTooltip, setShowErrorTooltip] = useState(false);
  const [copiedHostname, setCopiedHostname] = useState(false);
  const [snapshot, setSnapshot] = useState<FullConnectionHealthSnapshot | null>(null);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatusSnapshot>(() =>
    getSyncStatusSnapshot()
  );
  const pulseTimeoutRef = useRef<number | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return subscribeSyncStatus(setSyncStatus);
  }, []);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        if (pulseTimeoutRef.current !== null) window.clearTimeout(pulseTimeoutRef.current);
        if (copyTimeoutRef.current !== null) window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const triggerSubtleDbPulse = useCallback(() => {
    setDbPulseActive(true);
    if (typeof window !== 'undefined') {
      if (pulseTimeoutRef.current !== null) {
        window.clearTimeout(pulseTimeoutRef.current);
      }
      pulseTimeoutRef.current = window.setTimeout(() => {
        setDbPulseActive(false);
      }, 1500);
    }
  }, []);

  const runProbe = useCallback(async () => {
    setIsChecking(true);
    try {
      const next = await runConnectionHealthDiagnostics({ user, authReady });
      setSnapshot(next);
      triggerSubtleDbPulse();
    } finally {
      setIsChecking(false);
    }
  }, [user, authReady, triggerSubtleDbPulse]);

  // Run once after Firebase Auth finishes hydrating, and again if auth user changes (no polling loop).
  useEffect(() => {
    if (!authReady) return;
    void runProbe();
  }, [authReady, user?.uid, runProbe]);

  const firebaseTarget = useMemo(
    () => snapshot?.firebaseTarget ?? getFirebaseTargetSummary(),
    [snapshot]
  );

  const fixGuideItems = useMemo(
    () => buildFirebaseFixGuideItems(snapshot, authErrorDetails),
    [snapshot, authErrorDetails]
  );

  const handleCopyHostname = useCallback(async () => {
    const hostname = firebaseTarget.currentHostname;
    if (!hostname) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(hostname);
      }
      setCopiedHostname(true);
      if (typeof window !== 'undefined') {
        if (copyTimeoutRef.current !== null) window.clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = window.setTimeout(() => setCopiedHostname(false), 2000);
      }
    } catch {
      setCopiedHostname(false);
    }
  }, [firebaseTarget.currentHostname]);

  const isRealtimeDbActivity =
    isChecking || dbPulseActive || syncStatus.state === 'SYNCING';

  const hasCriticalAuthError = Boolean(
    authErrorDetails &&
      authErrorDetails.code !== 'auth/popup-closed-by-user' &&
      authErrorDetails.code !== 'auth/cancelled-popup-request'
  );

  const overallTone = isChecking && !snapshot
    ? 'CHECKING'
    : hasCriticalAuthError
      ? 'DEGRADED'
      : snapshot?.overall || 'CHECKING';

  const errorDetails = formatCloudSqlErrorDetails(snapshot);

  const statusDotClass =
    overallTone === 'HEALTHY'
      ? 'bg-[#20d889] shadow-[0_0_8px_rgba(32,216,137,0.75)]'
      : overallTone === 'PARTIAL'
        ? 'bg-[#ffb020] shadow-[0_0_8px_rgba(255,176,32,0.7)]'
        : overallTone === 'DEGRADED'
          ? 'bg-[#ff4d62] shadow-[0_0_8px_rgba(255,77,98,0.75)]'
          : 'bg-[#19c8f5]';

  const pulseRingClass =
    overallTone === 'DEGRADED'
      ? 'bg-[#ff4d62]/60'
      : overallTone === 'PARTIAL'
        ? 'bg-[#ffb020]/55'
        : 'bg-[#20d889]/60';

  const authShort = !snapshot
    ? '...'
    : hasCriticalAuthError
      ? 'FIX'
      : snapshot.firebaseAuth.signedIn
        ? snapshot.firebaseAuth.serverTokenVerified
          ? 'OK'
          : 'CLIENT'
        : 'GUEST';

  const pgShort = !snapshot
    ? '...'
    : snapshot.cloudSqlPostgres.status === 'CONNECTED'
      ? `${snapshot.cloudSqlPostgres.latencyMs}ms`
      : snapshot.cloudSqlPostgres.status === 'NOT_CONFIGURED'
        ? 'N/A'
        : snapshot.cloudSqlPostgres.status === 'AUTH_REQUIRED'
          ? 'LOCKED'
          : 'ERR';

  const fsShort = !snapshot
    ? '...'
    : snapshot.firestore.status === 'CONNECTED'
      ? `${snapshot.firestore.latencyMs}ms`
      : snapshot.firestore.status === 'OFFLINE'
        ? 'OFFLINE'
        : 'ERR';

  return (
    <div className="relative flex items-center gap-1" data-testid="connection-health-widget">
      {/* Compact Footer Status Button with Subtle Real-Time DB Activity Pulse */}
      <button
        type="button"
        data-testid="footer-connection-health-btn"
        onClick={() => {
          setShowErrorTooltip(false);
          setIsExpanded((prev) => !prev);
        }}
        aria-expanded={isExpanded}
        title="Inspect Firebase project, custom Firestore database, auth status, and Fix Guide"
        className={`hw-btn flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono transition cursor-pointer whitespace-nowrap ${
          isExpanded ? 'hw-btn-blue' : 'text-[#d9e8fa]'
        }`}
      >
        <span
          className="relative inline-flex h-2.5 w-2.5 items-center justify-center shrink-0"
          data-testid="db-activity-pulse"
          data-active={isRealtimeDbActivity ? 'true' : 'false'}
        >
          {isRealtimeDbActivity && (
            <span
              aria-hidden="true"
              className={`absolute inline-flex h-full w-full rounded-full animate-ping opacity-70 ${pulseRingClass}`}
            />
          )}
          <span
            aria-hidden="true"
            className={`relative inline-flex h-2 w-2 rounded-full ${statusDotClass} ${
              isRealtimeDbActivity ? 'animate-pulse' : ''
            }`}
          />
        </span>

        <Database
          className={`w-3 h-3 shrink-0 transition-colors ${
            isRealtimeDbActivity ? 'text-[#20d889] animate-pulse' : 'text-[#19c8f5]'
          }`}
          aria-hidden="true"
        />
        <span className="tabular-nums">
          AUTH:{' '}
          <strong
            className={
              authShort === 'OK'
                ? 'text-[#20d889]'
                : authShort === 'FIX'
                  ? 'text-[#ff4d62]'
                  : authShort === 'GUEST'
                    ? 'text-[#ffb020]'
                    : 'text-[#19c8f5]'
            }
          >
            {authShort}
          </strong>
        </span>
        <span className="text-[#203653] hidden sm:inline">·</span>
        <span className="tabular-nums hidden sm:inline">
          PG:{' '}
          <strong
            className={
              snapshot?.cloudSqlPostgres.status === 'CONNECTED'
                ? 'text-[#20d889]'
                : snapshot?.cloudSqlPostgres.status === 'UNREACHABLE'
                  ? 'text-[#ff4d62]'
                  : 'text-[#ffb020]'
            }
          >
            {pgShort}
          </strong>
        </span>
        <span className="text-[#203653] hidden xl:inline">·</span>
        <span className="tabular-nums hidden xl:inline">
          FS:{' '}
          <strong
            className={
              snapshot?.firestore.status === 'CONNECTED'
                ? 'text-[#20d889]'
                : 'text-[#ffb020]'
            }
          >
            {fsShort}
          </strong>
        </span>
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-[#91a4bd]" aria-hidden="true" />
        ) : (
          <ChevronUp className="w-3 h-3 text-[#91a4bd]" aria-hidden="true" />
        )}
      </button>

      {/* Dedicated 'Error Details' Tooltip Trigger when Cloud SQL is Unreachable / Unconfigured */}
      {errorDetails.hasError && (
        <div
          className="relative flex items-center"
          onMouseEnter={() => setShowErrorTooltip(true)}
          onMouseLeave={() => setShowErrorTooltip(false)}
        >
          <button
            type="button"
            data-testid="cloudsql-error-details-trigger"
            onClick={() => {
              setIsExpanded(false);
              setShowErrorTooltip((prev) => !prev);
            }}
            onFocus={() => setShowErrorTooltip(true)}
            onBlur={() => setShowErrorTooltip(false)}
            aria-expanded={showErrorTooltip}
            aria-describedby="cloudsql-error-details-tooltip"
            className={`hw-btn px-1.5 py-1 rounded-md text-[10px] font-mono inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
              errorDetails.severity === 'CRITICAL'
                ? 'border-[#ff4d62]/70 bg-rose-950/75 text-rose-200 hover:bg-rose-900/80'
                : 'border-[#ffb020]/55 bg-amber-950/50 text-[#ffb020] hover:bg-amber-900/60'
            }`}
          >
            <Info className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>Error Details</span>
          </button>

          {showErrorTooltip && (
            <div
              id="cloudsql-error-details-tooltip"
              data-testid="cloudsql-error-details-tooltip"
              role="tooltip"
              className="fixed sm:absolute bottom-14 sm:bottom-full left-2 right-2 sm:left-auto sm:right-0 mb-0 sm:mb-2 sm:w-80 rounded-lg border border-[#ff4d62]/60 bg-[#08101f]/98 p-3 shadow-2xl z-50 text-[10.5px] font-mono text-[#eaf3ff] space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 border-b border-[#203653] pb-1.5">
                <span className="font-hud text-[11px] font-bold text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#ff4d62] shrink-0" />
                  <span>{errorDetails.headline}</span>
                </span>
                <span className="text-[9.5px] font-bold text-rose-200 uppercase">
                  {errorDetails.errorCode}
                </span>
              </div>
              <p className="text-slate-200 break-words leading-relaxed">
                {errorDetails.formattedMessage}
              </p>
              <div className="text-[10px] text-[#19c8f5]">{errorDetails.probeSummary}</div>
              <p className="text-[10px] font-sans text-slate-400 leading-snug pt-1 border-t border-[#203653]/80">
                {errorDetails.remediationHint}
              </p>
              <div className="text-[9.5px] text-slate-500 text-right tabular-nums">
                Checked: {errorDetails.checkedAtLabel}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expandable Upward Firebase Status & Fix Guide Popover */}
      {isExpanded && (
        <div
          role="region"
          data-testid="connection-health-popover"
          aria-label="Firebase Status, Database Connection Health & Fix Guide"
          className="fixed sm:absolute bottom-14 sm:bottom-full left-2 right-2 sm:left-auto sm:right-0 mb-0 sm:mb-2 sm:w-[440px] max-h-[78dvh] overflow-y-auto bg-[#0a1220] border border-[#203653] rounded-xl p-3 shadow-2xl z-50 text-[11px] font-mono text-[#eaf3ff]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#203653] pb-2 mb-2.5 gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <ShieldCheck className="w-3.5 h-3.5 text-[#19c8f5] shrink-0" aria-hidden="true" />
              <span className="font-hud text-xs font-bold tracking-wider text-[#eaf3ff] uppercase truncate">
                Firebase Status &amp; Fix Guide
              </span>
            </div>
            <button
              type="button"
              data-testid="firebase-reping-btn"
              onClick={() => void runProbe()}
              disabled={isChecking}
              className="hw-btn px-2 py-0.5 rounded-md text-[10px] text-[#19c8f5] hover:text-white flex items-center gap-1 transition cursor-pointer disabled:opacity-50 shrink-0"
              title="Run live Firebase Auth and database ping check now"
            >
              <RefreshCw
                className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{isChecking ? 'Pinging...' : 'Re-Ping'}</span>
            </button>
          </div>

          <div className="space-y-2">
            {/* Active Firebase Target Metadata Block */}
            <div
              data-testid="firebase-active-target"
              className="rounded-lg border border-[#203653] bg-[#050a14] p-2.5 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 border-b border-[#203653]/70 pb-1">
                <span className="text-[10px] uppercase tracking-wider text-[#8fa7c7] font-semibold">
                  Active Firebase Target
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-bold ${
                    firebaseTarget.configured ? 'text-[#20d889]' : 'text-[#ff4d62]'
                  }`}
                >
                  {firebaseTarget.configured ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> CONFIGURED
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3" aria-hidden="true" /> UNCONFIGURED
                    </>
                  )}
                </span>
              </div>

              <dl className="grid grid-cols-[88px_1fr] gap-y-1 gap-x-2 text-[10px] tabular-nums">
                <dt className="text-[#8fa7c7]">Project ID</dt>
                <dd
                  data-testid="firebase-target-project-id"
                  className="text-[#eaf3ff] font-semibold truncate"
                  title={firebaseTarget.projectId}
                >
                  {firebaseTarget.projectId || 'Not set'}
                </dd>

                <dt className="text-[#8fa7c7]">Firestore DB</dt>
                <dd
                  data-testid="firebase-target-database-id"
                  className="text-[#19c8f5] font-semibold truncate"
                  title={firebaseTarget.firestoreDatabaseId}
                >
                  {firebaseTarget.firestoreDatabaseId || '(default)'}
                </dd>

                <dt className="text-[#8fa7c7]">Auth Domain</dt>
                <dd
                  className="text-slate-300 truncate"
                  title={firebaseTarget.authDomain}
                >
                  {firebaseTarget.authDomain || 'Not set'}
                </dd>

                <dt className="text-[#8fa7c7]">Preview Host</dt>
                <dd
                  data-testid="firebase-target-hostname"
                  className="text-slate-200 truncate"
                  title={firebaseTarget.currentHostname}
                >
                  {firebaseTarget.currentHostname}
                </dd>
              </dl>

              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#203653]/70">
                <button
                  type="button"
                  data-testid="copy-firebase-hostname-btn"
                  onClick={() => void handleCopyHostname()}
                  className="hw-btn px-2 py-0.5 rounded-md text-[10px] text-slate-200 hover:text-white inline-flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {copiedHostname ? (
                    <>
                      <Check className="w-3 h-3 text-[#20d889]" aria-hidden="true" />
                      <span className="text-[#20d889]">Copied Hostname</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-[#19c8f5]" aria-hidden="true" />
                      <span>Copy Hostname</span>
                    </>
                  )}
                </button>

                {firebaseTarget.consoleAuthorizedDomainsUrl && (
                  <a
                    href={firebaseTarget.consoleAuthorizedDomainsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="open-authorized-domains-link"
                    className="hw-btn px-2 py-0.5 rounded-md text-[10px] text-[#19c8f5] hover:text-white inline-flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    <span>Authorized Domains</span>
                  </a>
                )}

                {firebaseTarget.consoleFirestoreUrl && (
                  <a
                    href={firebaseTarget.consoleFirestoreUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hw-btn px-2 py-0.5 rounded-md text-[10px] text-slate-300 hover:text-white inline-flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    <span>Firestore Console</span>
                  </a>
                )}
              </div>
            </div>

            {/* 1. Firebase Authentication Card */}
            <div className="rounded-lg border border-[#203653] bg-[#050a14] p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-[#8fa7c7] font-semibold">
                  1. Firebase Authentication
                </span>
                {hasCriticalAuthError ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ff4d62]">
                    <XCircle className="w-3 h-3" aria-hidden="true" /> ACTION REQUIRED
                  </span>
                ) : snapshot?.firebaseAuth.signedIn && snapshot.firebaseAuth.serverTokenVerified ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#20d889]">
                    <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> VERIFIED
                  </span>
                ) : snapshot?.firebaseAuth.signedIn ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#19c8f5]">
                    <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> SIGNED IN
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ffb020]">
                    <AlertTriangle className="w-3 h-3" aria-hidden="true" /> GUEST LOCAL
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-300">
                <div>
                  SDK Config:{' '}
                  <strong className={snapshot?.firebaseAuth.configured ? 'text-[#20d889]' : 'text-[#ff4d62]'}>
                    {snapshot?.firebaseAuth.configured ? 'Loaded' : 'Missing'}
                  </strong>
                </div>
                <div>
                  Server Token:{' '}
                  <strong className={snapshot?.firebaseAuth.serverTokenVerified ? 'text-[#20d889]' : 'text-[#ffb020]'}>
                    {snapshot?.firebaseAuth.serverTokenVerified ? 'RS256 Valid' : 'Guest / Local'}
                  </strong>
                </div>
                {snapshot?.firebaseAuth.uidMasked && (
                  <div className="col-span-2 truncate text-slate-300">
                    Account:{' '}
                    <strong className="text-slate-100">
                      {snapshot.firebaseAuth.email || snapshot.firebaseAuth.uidMasked}
                    </strong>{' '}
                    ({snapshot.firebaseAuth.emailVerified ? 'email verified' : 'unverified'})
                  </div>
                )}
              </div>

              <p className="text-[10px] font-sans text-slate-400 leading-snug">
                {authErrorDetails?.message || snapshot?.firebaseAuth.detail || 'Checking Firebase Auth status...'}
              </p>

              {snapshot && !snapshot.firebaseAuth.signedIn && snapshot.firebaseAuth.configured && (
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  disabled={isSigningIn}
                  className="mt-1 hw-btn hw-btn-blue px-2.5 py-1 rounded-md text-[10px] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <LogIn className="w-3 h-3" aria-hidden="true" />
                  <span>{isSigningIn ? 'Signing in...' : 'Sign in with Google to Verify'}</span>
                </button>
              )}
            </div>

            {/* 2. Active Cloud Firestore Read Ping Card */}
            <div className="rounded-lg border border-[#203653] bg-[#050a14] p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-[#8fa7c7] font-semibold">
                  2. Cloud Firestore Target &amp; Rules
                </span>
                {snapshot?.firestore.status === 'CONNECTED' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#20d889] tabular-nums">
                    <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> CONNECTED ({snapshot.firestore.latencyMs}ms)
                  </span>
                ) : snapshot?.firestore.status === 'UNREACHABLE' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ff4d62]">
                    <XCircle className="w-3 h-3" aria-hidden="true" /> BLOCKED
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ffb020]">
                    <AlertTriangle className="w-3 h-3" aria-hidden="true" /> {snapshot?.firestore.status || 'CHECKING'}
                  </span>
                )}
              </div>

              <div className="text-[10px] text-slate-300 truncate">
                Rules Gate:{' '}
                <strong className="text-slate-100">
                  {snapshot?.firestore.profileReadVerified
                    ? 'Verified Owner Read OK'
                    : 'Verified Email + Owner Scoped'}
                </strong>
              </div>

              <p className="text-[10px] font-sans text-slate-400 leading-snug">
                {snapshot?.firestore.detail || 'Running Firestore getDocFromServer check...'}
              </p>
            </div>

            {/* 3. Cloud SQL PostgreSQL Ping Card */}
            <div className="rounded-lg border border-[#203653] bg-[#050a14] p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-[#8fa7c7] font-semibold">
                  3. Cloud SQL PostgreSQL Ping
                </span>
                {snapshot?.cloudSqlPostgres.status === 'CONNECTED' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#20d889] tabular-nums">
                    <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> CONNECTED ({snapshot.cloudSqlPostgres.latencyMs}ms)
                  </span>
                ) : snapshot?.cloudSqlPostgres.status === 'UNREACHABLE' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ff4d62]">
                    <XCircle className="w-3 h-3" aria-hidden="true" /> UNREACHABLE
                  </span>
                ) : snapshot?.cloudSqlPostgres.status === 'AUTH_REQUIRED' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ffb020]">
                    <AlertTriangle className="w-3 h-3" aria-hidden="true" /> AUTH REQUIRED
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ffb020]">
                    <AlertTriangle className="w-3 h-3" aria-hidden="true" /> NOT CONFIGURED
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-300">
                <div>
                  Runtime Env:{' '}
                  <strong className={snapshot?.cloudSqlPostgres.configured ? 'text-[#20d889]' : 'text-[#ffb020]'}>
                    {snapshot?.cloudSqlPostgres.configured ? 'SQL_* Set' : 'Auth Needed / Local'}
                  </strong>
                </div>
                <div>
                  Probe:{' '}
                  <strong className="text-slate-200">
                    {snapshot?.cloudSqlPostgres.probeMethod || 'NONE'}
                  </strong>
                </div>
              </div>

              <p className="text-[10px] font-sans text-slate-400 leading-snug">
                {errorDetails.hasError
                  ? errorDetails.formattedMessage
                  : snapshot?.cloudSqlPostgres.detail || 'Running PostgreSQL server ping...'}
              </p>
            </div>

            {/* Context-Aware Fix Guide */}
            {fixGuideItems.length > 0 && (
              <div
                data-testid="firebase-fix-guide"
                className="rounded-lg border border-[#203653] bg-[#050a14] p-2.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 border-b border-[#203653]/70 pb-1">
                  <span className="text-[10px] uppercase tracking-wider text-[#8fa7c7] font-semibold inline-flex items-center gap-1">
                    <Wrench className="w-3 h-3 text-[#19c8f5]" aria-hidden="true" />
                    <span>Context-Aware Fix Guide</span>
                  </span>
                  <span className="text-[9.5px] text-slate-400 tabular-nums">
                    {fixGuideItems.length} {fixGuideItems.length === 1 ? 'item' : 'items'}
                  </span>
                </div>

                <ul className="space-y-2">
                  {fixGuideItems.map((item) => (
                    <li
                      key={item.id}
                      className={`rounded-md border p-2 space-y-1 ${
                        item.severity === 'ERROR'
                          ? 'border-[#ff4d62]/50 bg-rose-950/25'
                          : item.severity === 'WARNING'
                            ? 'border-[#ffb020]/45 bg-amber-950/20'
                            : 'border-[#203653] bg-[#0a1220]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[10.5px] font-semibold ${
                            item.severity === 'ERROR'
                              ? 'text-[#ff8a98]'
                              : item.severity === 'WARNING'
                                ? 'text-[#ffd07a]'
                                : 'text-[#eaf3ff]'
                          }`}
                        >
                          {item.title}
                        </span>
                        <span
                          className={`text-[9px] font-bold uppercase shrink-0 ${
                            item.severity === 'ERROR'
                              ? 'text-[#ff4d62]'
                              : item.severity === 'WARNING'
                                ? 'text-[#ffb020]'
                                : 'text-[#19c8f5]'
                          }`}
                        >
                          {item.severity}
                        </span>
                      </div>
                      <p className="text-[10px] font-sans text-slate-300 leading-snug">
                        {item.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {item.actionKind === 'OPEN_AUTH_DOMAINS' && (
                          <button
                            type="button"
                            onClick={() => void handleCopyHostname()}
                            className="hw-btn px-2 py-0.5 rounded-md text-[10px] text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="w-3 h-3 text-[#19c8f5]" aria-hidden="true" />
                            <span>{copiedHostname ? 'Copied!' : 'Copy Hostname'}</span>
                          </button>
                        )}
                        {(item.actionKind === 'OPEN_AUTH_DOMAINS' ||
                          item.actionKind === 'OPEN_QUOTA_UPGRADE') &&
                          item.actionUrl && (
                            <a
                              href={item.actionUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hw-btn hw-btn-blue px-2 py-0.5 rounded-md text-[10px] inline-flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" aria-hidden="true" />
                              <span>{item.actionLabel || 'Open Firebase Console'}</span>
                            </a>
                          )}
                        {item.actionKind === 'SIGN_IN' && (
                          <button
                            type="button"
                            onClick={() => void signInWithGoogle()}
                            disabled={isSigningIn}
                            className="hw-btn hw-btn-blue px-2 py-0.5 rounded-md text-[10px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <LogIn className="w-3 h-3" aria-hidden="true" />
                            <span>{isSigningIn ? 'Signing in...' : item.actionLabel || 'Sign In'}</span>
                          </button>
                        )}
                        {item.actionKind === 'REPING' && (
                          <button
                            type="button"
                            onClick={() => void runProbe()}
                            disabled={isChecking}
                            className="hw-btn px-2 py-0.5 rounded-md text-[10px] text-[#19c8f5] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} aria-hidden="true" />
                            <span>{item.actionLabel || 'Re-Ping'}</span>
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="mt-2 pt-1.5 border-t border-[#203653] flex items-center justify-between text-[10px] text-slate-400">
            <span>On-demand probe · zero guest 401 noise</span>
            <span className="tabular-nums">Last checked: {errorDetails.checkedAtLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
};
