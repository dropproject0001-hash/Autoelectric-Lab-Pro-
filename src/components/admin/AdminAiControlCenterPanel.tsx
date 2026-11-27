/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  KeyRound,
  PowerOff,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { LOCAL_MODEL_PROFILES, getLocalAiRuntimeStatus } from '../../services/ai/localWebLlmService';

interface AdminAiOverviewPayload {
  gateway: {
    cloudShutoffActive: boolean;
    shutoffReason: string | null;
    totalRequestsToday: number;
    dailyQuotaLimit: number;
    requestsInLastMinute: number;
    rpmLimit: number;
    blockedPaidAttempts: number;
    blockedUnallowlistedAttempts: number;
    privacyRedactionsCount: number;
    privacyRuleNotice: string;
    allowlist: Array<{
      modelId: string;
      displayName: string;
      enabled: boolean;
      freeTierEligibilityVerified: boolean;
      verifiedByAdmin: string | null;
      verifiedAt: string | null;
      verificationNotes: string;
      rpmLimit: number;
      rpdLimit: number;
    }>;
    credentialRotation: {
      rotationIntervalDays: number;
      lastRotatedAt: string | null;
      nextDueAt: string | null;
      isConfigured: boolean;
      keyFingerprintMasked: string;
      checklistSteps: string[];
      rotationHistory: Array<{ rotatedAt: string; actor: string; note: string }>;
    };
  };
  knowledgeAnalytics: {
    totalCaptured: number;
    pendingReviewCount: number;
    conflictCount: number;
    trustedCount: number;
  };
  knowledgeQueue: {
    pendingReview: Array<{
      id: string;
      title: string;
      content: string;
      lifecycleStatus: string;
      sourceDocument: string;
      conflict?: { reason: string; conflictingRecordId: string };
    }>;
    conflicts: Array<{
      id: string;
      title: string;
      conflict?: { reason: string; conflictingRecordId: string };
    }>;
  };
  auditLog: Array<{
    id: string;
    timestamp: string;
    actor: string;
    action: string;
    target: string;
    outcome: string;
    detail: string;
  }>;
}

export interface AdminAiControlCenterPanelProps {
  adminToken: string;
}

export const AdminAiControlCenterPanel: React.FC<AdminAiControlCenterPanelProps> = ({
  adminToken,
}) => {
  const [data, setData] = useState<AdminAiOverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dailyLimitInput, setDailyLimitInput] = useState('200');
  const [rotationNote, setRotationNote] = useState('');
  const localStatus = getLocalAiRuntimeStatus();

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
  };

  const fetchOverview = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/autoelectric/admin/ai/overview', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setData(json as AdminAiOverviewPayload);
      setDailyLimitInput(String(json.gateway.dailyQuotaLimit));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load Admin AI Control Center.');
    } finally {
      setBusy(false);
    }
  }, [adminToken]);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  const handleToggleModel = async (modelId: string, nextEnabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/autoelectric/admin/ai/allowlist', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          modelId,
          enabled: nextEnabled,
          freeTierEligibilityVerified: nextEnabled,
          verificationNotes: nextEnabled
            ? 'Admin verified free-tier eligibility in Control Center'
            : 'Disabled by administrator',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      await fetchOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update allowlist.');
      setBusy(false);
    }
  };

  const handleToggleShutoff = async (nextActive: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/autoelectric/admin/ai/shutoff', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          active: nextActive,
          reason: nextActive ? 'Emergency cloud shutoff triggered in Admin AI Control Center' : '',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      await fetchOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update shutoff state.');
      setBusy(false);
    }
  };

  const handleUpdateQuota = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/autoelectric/admin/ai/quota', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ dailyQuotaLimit: Number(dailyLimitInput) || 200 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      await fetchOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update quota limits.');
      setBusy(false);
    }
  };

  const handleRecordRotation = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/autoelectric/admin/ai/credential-rotation', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          note: rotationNote || 'Completed 8-step manual key rotation checklist',
          intervalDays: 90,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setRotationNote('');
      await fetchOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to log credential rotation.');
      setBusy(false);
    }
  };

  const handleKnowledgeAction = async (id: string, action: 'approve' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/autoelectric/admin/ai/knowledge/${action}`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(
          action === 'approve'
            ? { id, targetStatus: 'VERIFIED', reviewNote: 'Verified by Master Admin' }
            : { id, targetStatus: 'REJECTED', reason: 'Rejected in Admin Control Center' }
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      await fetchOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${action} record.`);
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="admin-ai-control-center"
      className="flex flex-col gap-4 text-slate-100 font-mono text-xs"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-700/80 pb-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold uppercase tracking-wider text-cyan-200">
            Admin AI Control Center (Free-Tier Enforced)
          </h3>
        </div>
        <button
          type="button"
          onClick={() => void fetchOverview()}
          disabled={busy}
          className="px-2.5 py-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-2.5 rounded border border-rose-500/60 bg-rose-950/50 text-rose-200">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Core: Privacy Policy Notice + Emergency Cloud Shutoff */}
          <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/25 text-amber-200 text-[11px]">
            {data.gateway.privacyRuleNotice}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Cloud Shutoff & Quota Monitor */}
            <div className="p-3 rounded-lg border border-slate-700 bg-slate-950/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200 uppercase">Cloud Shutoff & Quota</span>
                <button
                  type="button"
                  onClick={() => void handleToggleShutoff(!data.gateway.cloudShutoffActive)}
                  disabled={busy}
                  className={`px-2.5 py-1 rounded font-bold inline-flex items-center gap-1 cursor-pointer ${
                    data.gateway.cloudShutoffActive
                      ? 'bg-emerald-700 text-white'
                      : 'bg-rose-700 text-white'
                  }`}
                >
                  <PowerOff className="w-3 h-3" />
                  <span>
                    {data.gateway.cloudShutoffActive ? 'Re-Open Cloud' : 'Emergency Shutoff'}
                  </span>
                </button>
              </div>
              <div className="text-[11px] text-slate-300 space-y-1">
                <div>
                  Status:{' '}
                  <strong className={data.gateway.cloudShutoffActive ? 'text-rose-400' : 'text-emerald-400'}>
                    {data.gateway.cloudShutoffActive ? 'SHUT OFF' : 'ACTIVE (ALLOWLISTED ONLY)'}
                  </strong>
                </div>
                <div>
                  Daily Usage: {data.gateway.totalRequestsToday} / {data.gateway.dailyQuotaLimit} RPD | RPM:{' '}
                  {data.gateway.requestsInLastMinute} / {data.gateway.rpmLimit}
                </div>
                <div>
                  Blocked Paid Attempts: {data.gateway.blockedPaidAttempts} | Privacy Redactions:{' '}
                  {data.gateway.privacyRedactionsCount}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={dailyLimitInput}
                  onChange={(e) => setDailyLimitInput(e.target.value)}
                  className="w-24 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                  aria-label="Daily RPD Limit"
                />
                <button
                  type="button"
                  onClick={() => void handleUpdateQuota()}
                  disabled={busy}
                  className="px-2.5 py-1 rounded bg-cyan-800 hover:bg-cyan-700 text-white cursor-pointer"
                >
                  Save Daily Cap
                </button>
              </div>
            </div>

            {/* Local WebGPU Model Profiles */}
            <div className="p-3 rounded-lg border border-slate-700 bg-slate-950/80 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-200 uppercase">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>Local WebGPU AI ({localStatus.executionState})</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Storage Budget: {localStatus.storageBudgetMb} MB max · Explicit download consent required.
              </div>
              <div className="space-y-1">
                {LOCAL_MODEL_PROFILES.map((p) => (
                  <div
                    key={p.profileId}
                    className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-slate-900/90 border border-slate-800"
                  >
                    <span>{p.displayName}</span>
                    <span className="text-cyan-300">~{p.downloadSizeMb} MB</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Core: Gemini Free-Tier Model Allowlist (Default Disabled) */}
          <div className="p-3 rounded-lg border border-slate-700 bg-slate-950/80 space-y-2">
            <div className="font-bold text-slate-200 uppercase">
              Gemini Free-Tier Model Allowlist (Default Disabled · Paid Models Permanently Blocked)
            </div>
            <div className="space-y-1.5">
              {data.gateway.allowlist.map((entry) => (
                <div
                  key={entry.modelId}
                  className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-slate-900 border border-slate-800"
                >
                  <div>
                    <div className="font-semibold text-white">{entry.displayName}</div>
                    <div className="text-[10px] text-slate-400">{entry.verificationNotes}</div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleToggleModel(entry.modelId, !entry.enabled)}
                    className={`px-2.5 py-1 rounded font-bold cursor-pointer ${
                      entry.enabled
                        ? 'bg-emerald-700 text-white'
                        : 'bg-slate-800 border border-slate-600 text-slate-200'
                    }`}
                  >
                    {entry.enabled ? 'Enabled (Disable)' : 'Verify Free-Tier & Enable'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Core: Knowledge Verification Queue & Conflict Manager */}
          <div className="p-3 rounded-lg border border-slate-700 bg-slate-950/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 uppercase">
                Knowledge Verification Queue ({data.knowledgeAnalytics.pendingReviewCount} pending ·{' '}
                {data.knowledgeAnalytics.conflictCount} conflicts)
              </span>
              <span className="text-emerald-300">Trusted: {data.knowledgeAnalytics.trustedCount}</span>
            </div>
            {data.knowledgeQueue.pendingReview.length === 0 ? (
              <div className="text-slate-400 text-[11px]">No pending captured items awaiting review.</div>
            ) : (
              <div className="space-y-1.5">
                {data.knowledgeQueue.pendingReview.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-slate-900 border border-slate-800"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate">{item.title}</div>
                      {item.conflict && (
                        <div className="text-[10px] text-amber-300 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> {item.conflict.reason}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleKnowledgeAction(item.id, 'approve')}
                        disabled={busy}
                        className="px-2 py-1 rounded bg-emerald-700 text-white inline-flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleKnowledgeAction(item.id, 'reject')}
                        disabled={busy}
                        className="px-2 py-1 rounded bg-rose-700 text-white inline-flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3 h-3" /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Secondary: Credential Rotation (90-day checklist) & Audit Log */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border border-slate-700 bg-slate-950/80 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-200 uppercase">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>Credential Rotation ({data.gateway.credentialRotation.rotationIntervalDays}d)</span>
              </div>
              <div className="text-[11px] text-slate-300">
                Key: {data.gateway.credentialRotation.keyFingerprintMasked}
              </div>
              <ol className="text-[10px] text-slate-400 space-y-0.5 list-none">
                {data.gateway.credentialRotation.checklistSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={rotationNote}
                  onChange={(e) => setRotationNote(e.target.value)}
                  placeholder="Rotation note..."
                  className="flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                />
                <button
                  type="button"
                  onClick={() => void handleRecordRotation()}
                  disabled={busy}
                  className="px-2.5 py-1 rounded bg-amber-700 text-white cursor-pointer"
                >
                  Log Rotation
                </button>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-700 bg-slate-950/80 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-200 uppercase">
                <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
                <span>Backend Audit Trail ({data.auditLog.length})</span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1 text-[10px]">
                {data.auditLog.slice(0, 15).map((entry) => (
                  <div key={entry.id} className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    <span className="text-cyan-300 font-bold">{entry.action}</span> · {entry.target}{' '}
                    <span className="text-slate-400">({entry.actor})</span>
                    <div className="text-slate-400">{entry.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
