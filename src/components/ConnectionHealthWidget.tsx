/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Info,
  LogIn,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  FullConnectionHealthSnapshot,
  runConnectionHealthDiagnostics,
} from '../services/connectionHealthClient';
import {
  CloudSyncStatusSnapshot,
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
  const { user, authReady, isSigningIn, signInWithGoogle } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [dbPulseActive, setDbPulseActive] = useState(false);
  const [showErrorTooltip, setShowErrorTooltip] = useState(false);
  const [snapshot, setSnapshot] = useState<FullConnectionHealthSnapshot | null>(null);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatusSnapshot>(() =>
    getSyncStatusSnapshot()
  );
  const pulseTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return subscribeSyncStatus(setSyncStatus);
  }, []);

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(pulseTimeoutRef.current);
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

  const isRealtimeDbActivity =
    isChecking || dbPulseActive || syncStatus.state === 'SYNCING';

  const overallTone = isChecking && !snapshot ? 'CHECKING' : snapshot?.overall || 'CHECKING';
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
        title="Verify Firebase Auth, Cloud SQL PostgreSQL ping, and Cloud Firestore connection health"
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
                <span className="px-1.5 py-0.5 rounded bg-rose-950 border border-rose-500/50 text-[9px] text-rose-200">
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

      {/* Expandable Upward Connection Health Diagnostic Popover */}
      {isExpanded && (
        <div
          role="region"
          data-testid="connection-health-popover"
          aria-label="Firebase Auth & Database Connection Health Diagnostics"
          className="fixed sm:absolute bottom-14 sm:bottom-full left-2 right-2 sm:left-auto sm:right-0 mb-0 sm:mb-2 sm:w-[420px] max-h-[75dvh] overflow-y-auto hud-panel border-[#203653] rounded-xl p-3 shadow-2xl z-50 text-[11px] font-mono text-[#eaf3ff]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#203653] pb-2 mb-2.5 gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <ShieldCheck className="w-3.5 h-3.5 text-[#19c8f5] shrink-0" />
              <span className="font-hud text-xs font-bold tracking-wider text-[#eaf3ff] uppercase truncate">
                Auth &amp; Database Connection Health
              </span>
            </div>
            <button
              type="button"
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
            {/* 1. Firebase Authentication Card */}
            <div className="hw-lcd-well rounded-lg p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-[#91a4bd] font-semibold">
                  1. Firebase Authentication
                </span>
                {snapshot?.firebaseAuth.signedIn && snapshot.firebaseAuth.serverTokenVerified ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#20d889]">
                    <CheckCircle2 className="w-3 h-3" /> VERIFIED
                  </span>
                ) : snapshot?.firebaseAuth.signedIn ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#19c8f5]">
                    <CheckCircle2 className="w-3 h-3" /> SIGNED IN
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ffb020]">
                    <AlertTriangle className="w-3 h-3" /> SIGNED OUT
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
                    {snapshot?.firebaseAuth.serverTokenVerified ? 'RS256 Valid' : 'Not Verified'}
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
                {snapshot?.firebaseAuth.detail || 'Checking Firebase Auth status...'}
              </p>

              {snapshot && !snapshot.firebaseAuth.signedIn && snapshot.firebaseAuth.configured && (
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  disabled={isSigningIn}
                  className="mt-1 hw-btn hw-btn-blue px-2.5 py-1 rounded-md text-[10px] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <LogIn className="w-3 h-3" />
                  <span>{isSigningIn ? 'Signing in...' : 'Sign in with Google to Verify'}</span>
                </button>
              )}
            </div>

            {/* 2. Cloud SQL PostgreSQL Ping Card */}
            <div className="hw-lcd-well rounded-lg p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-[#91a4bd] font-semibold">
                  2. Cloud SQL PostgreSQL Ping
                </span>
                {snapshot?.cloudSqlPostgres.status === 'CONNECTED' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#20d889]">
                    <CheckCircle2 className="w-3 h-3" /> CONNECTED ({snapshot.cloudSqlPostgres.latencyMs}ms)
                  </span>
                ) : snapshot?.cloudSqlPostgres.status === 'UNREACHABLE' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ff4d62]">
                    <XCircle className="w-3 h-3" /> UNREACHABLE
                  </span>
                ) : snapshot?.cloudSqlPostgres.status === 'AUTH_REQUIRED' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ffb020]">
                    <AlertTriangle className="w-3 h-3" /> AUTH REQUIRED
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ffb020]">
                    <AlertTriangle className="w-3 h-3" /> NOT CONFIGURED
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-300">
                <div>
                  Runtime Env:{' '}
                  <strong className={snapshot?.cloudSqlPostgres.configured ? 'text-[#20d889]' : 'text-[#ffb020]'}>
                    {snapshot?.cloudSqlPostgres.configured ? 'SQL_* Set' : 'Not Provisioned'}
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

            {/* 3. Active Cloud Firestore Read Ping Card */}
            <div className="hw-lcd-well rounded-lg p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-[#91a4bd] font-semibold">
                  3. Cloud Firestore Server Read
                </span>
                {snapshot?.firestore.status === 'CONNECTED' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#20d889]">
                    <CheckCircle2 className="w-3 h-3" /> REACHABLE ({snapshot.firestore.latencyMs}ms)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ffb020]">
                    <AlertTriangle className="w-3 h-3" /> {snapshot?.firestore.status || 'CHECKING'}
                  </span>
                )}
              </div>

              <div className="text-[10px] text-slate-300 truncate">
                DB ID:{' '}
                <strong className="text-slate-100">
                  {snapshot?.firestore.databaseId || '(default)'}
                </strong>
                {snapshot?.firestore.profileReadVerified && (
                  <span className="ml-1.5 text-[#20d889]">· Profile Read OK</span>
                )}
              </div>

              <p className="text-[10px] font-sans text-slate-400 leading-snug">
                {snapshot?.firestore.detail || 'Running Firestore getDocFromServer check...'}
              </p>
            </div>
          </div>

          <div className="mt-2 pt-1.5 border-t border-[#242b36] flex items-center justify-between text-[10px] text-slate-400">
            <span>On-demand probe · subtle pulse on activity</span>
            <span className="tabular-nums">Last checked: {errorDetails.checkedAtLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
};
