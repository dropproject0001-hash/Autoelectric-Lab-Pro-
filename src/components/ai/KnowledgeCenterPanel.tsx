/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import {
  getBenchAuthorizationAuditLog,
  type BenchAuthorizationAuditEntry,
} from '../../services/benchActionAuthorizationSystem';
import {
  approveKnowledgeEntry,
  getAllVerifiedKnowledgeEntries,
  getKnowledgeCenterStats,
  rejectKnowledgeEntry,
  subscribeVerifiedKnowledgeUpdates,
  synchronizeKnowledgeEntries,
} from '../../services/ai/localKnowledgeDB';
import type { BilingualLang, VerifiedKnowledgeRecord } from '../../types/aiAssistant';

export type KnowledgeFilterTab = 'ALL' | 'APPROVED' | 'AWAITING_REVIEW' | 'CONFLICT_FLAGGED';
export type KnowledgePanelSection = 'KNOWLEDGE_CENTER' | 'SAFETY_AUDIT';

export interface KnowledgeCenterPanelProps {
  compact?: boolean;
  lang?: BilingualLang;
  initialSection?: KnowledgePanelSection;
  hideSectionSwitcher?: boolean;
  onStatsChange?: (stats: {
    totalRecords: number;
    approvedCount: number;
    awaitingReviewCount: number;
    conflictCount: number;
    rejectedCount: number;
    syncedCloudCount: number;
    totalReuseHits: number;
    auditCount: number;
  }) => void;
}

export const KnowledgeCenterPanel: React.FC<KnowledgeCenterPanelProps> = ({
  compact = false,
  lang = 'EN',
  initialSection = 'KNOWLEDGE_CENTER',
  hideSectionSwitcher = false,
  onStatsChange,
}) => {
  const [section, setSection] = useState<KnowledgePanelSection>(initialSection);
  const [records, setRecords] = useState<VerifiedKnowledgeRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<KnowledgeFilterTab>('ALL');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [auditEntries, setAuditEntries] = useState<BenchAuthorizationAuditEntry[]>([]);
  const [stats, setStats] = useState({
    totalRecords: 0,
    approvedCount: 0,
    awaitingReviewCount: 0,
    conflictCount: 0,
    rejectedCount: 0,
    syncedCloudCount: 0,
    totalReuseHits: 0,
  });

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const refreshData = useCallback(async () => {
    try {
      const [nextRecords, nextStats] = await Promise.all([
        getAllVerifiedKnowledgeEntries(),
        getKnowledgeCenterStats(),
      ]);
      const nextAudits = [...getBenchAuthorizationAuditLog()];
      setRecords(nextRecords);
      setStats(nextStats);
      setAuditEntries(nextAudits);
      onStatsChange?.({
        ...nextStats,
        auditCount: nextAudits.length,
      });
    } finally {
      setIsLoading(false);
    }
  }, [onStatsChange]);

  useEffect(() => {
    void refreshData();
    return subscribeVerifiedKnowledgeUpdates(() => {
      void refreshData();
    });
  }, [refreshData]);

  const handleApprove = async (id: string) => {
    await approveKnowledgeEntry(id);
    await refreshData();
  };

  const handleReject = async (id: string) => {
    await rejectKnowledgeEntry(id);
    await refreshData();
  };

  const handleSync = async () => {
    const result = await synchronizeKnowledgeEntries();
    await refreshData();
    setSyncNotice(
      result.syncedCount > 0
        ? `Synchronized ${result.syncedCount} approved entry(s) (${result.totalApproved} total).`
        : `All ${result.totalApproved} approved entries are already synchronized.`
    );
  };

  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      const status = rec.reviewStatus || 'APPROVED';
      if (filterTab === 'APPROVED' && status !== 'APPROVED') return false;
      if (filterTab === 'AWAITING_REVIEW' && status !== 'AWAITING_REVIEW') return false;
      if (
        filterTab === 'CONFLICT_FLAGGED' &&
        status !== 'CONFLICT_FLAGGED' &&
        rec.classification !== 'CONFLICTING_INFORMATION'
      ) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        rec.subject.toLowerCase().includes(q) ||
        rec.rootCauseSummary.toLowerCase().includes(q) ||
        rec.tokens.some((t) => t.toLowerCase().includes(q)) ||
        (rec.originalQuestion && rec.originalQuestion.toLowerCase().includes(q))
      );
    });
  }, [records, filterTab, searchQuery]);

  return (
    <div
      data-testid="knowledge-center-panel"
      className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#070E1B] text-slate-100"
    >
      {!hideSectionSwitcher && (
        <div className="px-3.5 py-2 border-b border-slate-800 bg-[#091222] flex items-center justify-between gap-2 shrink-0">
          <div
            className="inline-flex items-center rounded-md border border-slate-700/80 bg-slate-950/90 p-0.5"
            role="tablist"
            aria-label="Knowledge and Safety View"
          >
            <button
              type="button"
              role="tab"
              aria-selected={section === 'KNOWLEDGE_CENTER'}
              onClick={() => setSection('KNOWLEDGE_CENTER')}
              className={`px-2.5 py-1 rounded text-[10.5px] font-mono font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
                section === 'KNOWLEDGE_CENTER'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/45'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Database className="w-3 h-3" />
              <span>{lang === 'TL' ? 'Verified DB' : 'Verified DB'}</span>
              <span className="tabular-nums text-slate-300">{stats.totalRecords}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={section === 'SAFETY_AUDIT'}
              onClick={() => setSection('SAFETY_AUDIT')}
              className={`px-2.5 py-1 rounded text-[10.5px] font-mono font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
                section === 'SAFETY_AUDIT'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/45'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              <span>Safety Audit</span>
              <span className="tabular-nums text-slate-300">{auditEntries.length}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleSync()}
            className="px-2.5 py-1 rounded border border-emerald-500/55 bg-emerald-950/45 hover:bg-emerald-900/55 font-mono text-[10px] font-semibold text-emerald-200 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Sync DB</span>
          </button>
        </div>
      )}

      {section === 'KNOWLEDGE_CENTER' ? (
        <div
          className={`flex-1 overflow-y-auto flex flex-col gap-3 ${
            compact ? 'p-3.5' : 'p-4'
          }`}
        >
          {/* Compact Quantitative Metrics Grid */}
          <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
            <div className="rounded border border-slate-800 bg-[#0B1528] p-2.5">
              <div className="font-mono text-[10px] text-slate-400">Approved Local</div>
              <div className="text-lg font-mono font-semibold text-emerald-300 tabular-nums">
                {stats.approvedCount}
              </div>
              <div className="text-[10px] text-slate-500">Served before online AI</div>
            </div>
            <div className="rounded border border-slate-800 bg-[#0B1528] p-2.5">
              <div className="font-mono text-[10px] text-slate-400">Awaiting Review</div>
              <div className="text-lg font-mono font-semibold text-amber-300 tabular-nums">
                {stats.awaitingReviewCount}
              </div>
              <div className="text-[10px] text-slate-500">Verification queue</div>
            </div>
            <div className="rounded border border-slate-800 bg-[#0B1528] p-2.5">
              <div className="font-mono text-[10px] text-slate-400">Conflicts Flagged</div>
              <div className="text-lg font-mono font-semibold text-rose-300 tabular-nums">
                {stats.conflictCount}
              </div>
              <div className="text-[10px] text-slate-500">Overwrite protected</div>
            </div>
            <div className="rounded border border-slate-800 bg-[#0B1528] p-2.5">
              <div className="font-mono text-[10px] text-slate-400">Offline Reuse Hits</div>
              <div className="text-lg font-mono font-semibold text-cyan-300 tabular-nums">
                {stats.totalReuseHits}
              </div>
              <div className="text-[10px] text-slate-500 tabular-nums">
                {stats.syncedCloudCount} Cloud-Synced
              </div>
            </div>
          </div>

          {/* Search & Segmented Filter Bar */}
          <div className="rounded border border-slate-800 bg-[#0B1528] p-2.5 space-y-2">
            <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search verified knowledge database"
                placeholder={
                  lang === 'TL'
                    ? 'Mag-search ng DTC, pinout, o diagnostic answer...'
                    : 'Search saved answers, DTCs, pinouts, or symptoms...'
                }
                className="bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none w-full font-sans"
              />
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div
                className="inline-flex items-center gap-1 flex-wrap"
                role="group"
                aria-label="Filter knowledge records"
              >
                {(
                  [
                    { id: 'ALL', label: 'All' },
                    { id: 'APPROVED', label: 'Approved' },
                    { id: 'AWAITING_REVIEW', label: 'Review' },
                    { id: 'CONFLICT_FLAGGED', label: 'Conflicts' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterTab(tab.id)}
                    className={`px-2 py-1 rounded text-[10px] font-mono font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                      filterTab === tab.id
                        ? 'bg-cyan-500/20 border border-cyan-500/60 text-cyan-200'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {hideSectionSwitcher && (
                <button
                  type="button"
                  onClick={() => void handleSync()}
                  className="px-2.5 py-1 rounded border border-emerald-500/55 bg-emerald-950/45 hover:bg-emerald-900/55 font-mono text-[10px] font-semibold text-emerald-200 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Sync DB</span>
                </button>
              )}
            </div>
          </div>

          {syncNotice && (
            <div className="px-3 py-2 rounded border border-emerald-700/70 bg-emerald-950/40 text-emerald-200 text-[11px] flex items-center justify-between gap-2">
              <span>{syncNotice}</span>
              <button
                type="button"
                onClick={() => setSyncNotice(null)}
                className="font-mono text-[10px] text-emerald-300 hover:text-white cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="rounded border border-slate-800 bg-[#0B1528] p-5 text-center font-mono text-xs text-slate-400">
              Loading AutoLabPro Verified Knowledge DB...
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="rounded border border-slate-800 bg-[#0B1528] p-5 text-center text-xs text-slate-400 leading-relaxed">
              {lang === 'TL'
                ? 'Wala pang naka-save na tugma sa filter. Kapag sumagot ang AI sa bagong tanong, awtomatiko itong nava-validate at nase-save rito para magamit offline.'
                : 'No learned knowledge records match the current filter. When AI answers a new question, it is automatically validated, classified, versioned, and stored here for offline reuse.'}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredRecords.map((rec) => (
                <article
                  key={rec.id}
                  className="rounded border border-slate-800 bg-[#0B1528] p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <h3 className="text-xs font-semibold text-slate-100 leading-snug">
                        {rec.subject}
                      </h3>
                      <div className="font-mono text-[10px] text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="text-cyan-300">
                          {(rec.classification || 'UNIVERSAL_TRAINER_KNOWLEDGE').replace(/_/g, ' ')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">v{rec.version || 1}</span>
                        <span aria-hidden="true">·</span>
                        <span>{rec.technicalCategory || 'GENERAL_BENCH'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{rec.evidenceStatus || 'VALID'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {rec.reviewStatus !== 'APPROVED' && (
                        <button
                          type="button"
                          onClick={() => void handleApprove(rec.id)}
                          className="px-2 py-1 rounded border border-emerald-500/60 bg-emerald-950/50 hover:bg-emerald-900/60 font-mono text-[10px] font-semibold text-emerald-200 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Approve</span>
                        </button>
                      )}
                      {rec.reviewStatus !== 'REJECTED' && (
                        <button
                          type="button"
                          onClick={() => void handleReject(rec.id)}
                          className="px-2 py-1 rounded border border-rose-700/70 bg-rose-950/35 hover:bg-rose-900/50 font-mono text-[10px] text-rose-300 cursor-pointer whitespace-nowrap"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </div>

                  {rec.conflictReason && (
                    <div className="p-2 rounded bg-rose-950/50 border border-rose-600/60 text-rose-200 text-[10.5px] flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>{rec.conflictReason}</span>
                    </div>
                  )}

                  <div className="text-[11.5px] text-slate-200 font-sans leading-relaxed">
                    <span className="font-semibold text-slate-300">Root Cause: </span>
                    {rec.rootCauseSummary}
                  </div>
                  <div className="text-[11px] text-amber-200/90 font-sans">
                    <span className="font-semibold">Safety: </span>
                    {rec.safetyWarning}
                  </div>
                  <div className="text-[11px] text-emerald-300/90 font-sans">
                    <span className="font-semibold">Verify: </span>
                    {rec.verificationStep}
                  </div>

                  <div className="flex items-center justify-between font-mono text-[10px] text-slate-500 pt-1.5 border-t border-slate-800/80 flex-wrap gap-2">
                    <span>
                      {rec.ecuApplicability?.isUniversalTrainer !== false
                        ? 'Universal Trainer'
                        : `${rec.ecuApplicability?.brandKey || 'OEM'} ${rec.ecuApplicability?.modelName || ''}`}
                    </span>
                    <span className="tabular-nums">
                      {rec.hitCount || 0}× hits · {rec.syncStatus || 'LOCAL_ONLY'}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          className={`flex-1 overflow-y-auto flex flex-col gap-2.5 ${
            compact ? 'p-3.5' : 'p-4'
          }`}
        >
          <p className="text-xs text-slate-300 font-sans leading-relaxed">
            Every AI, voice command, macro step, and bench operation passes through the centralized
            Bench Action Authorization System (<span className="font-mono text-amber-300">ALLOW | CONFIRM | BLOCK</span>).
          </p>
          {auditEntries.length === 0 ? (
            <div className="rounded border border-slate-800 bg-[#0B1528] p-5 text-center font-mono text-xs text-slate-400">
              No bench authorization events recorded in this session yet.
            </div>
          ) : (
            auditEntries.map((entry) => (
              <div
                key={entry.id}
                className="rounded border border-slate-800 bg-[#0B1528] p-2.5 space-y-1"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap font-mono text-[10px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`font-bold ${
                        entry.decision === 'ALLOW'
                          ? 'text-emerald-300'
                          : entry.decision === 'CONFIRM'
                            ? 'text-amber-300'
                            : 'text-rose-300'
                      }`}
                    >
                      {entry.decision}
                    </span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="font-semibold text-slate-200">{entry.actionType}</span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="text-slate-400">{entry.environmentMode}</span>
                  </div>
                  <span className="text-slate-500 tabular-nums">
                    {new Date(entry.timestampMs).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-[11px] text-slate-200 font-sans">
                  Command: <code className="font-mono text-amber-200">{entry.commandText}</code>
                </div>
                <div className="text-[10.5px] text-slate-400 font-sans">{entry.details}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
