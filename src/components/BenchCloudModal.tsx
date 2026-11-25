/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Save,
  FolderOpen,
  Trash2,
  FileText,
  Download,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Plus,
  Wrench,
  HardDrive,
} from 'lucide-react';
import { toSafeExternalHttpUrl } from '../utils/safeExternalUrl';
import {
  LOCAL_WORKSTATION_UID,
  SavedBenchSession,
  SavedDiagnosticLog,
  saveBenchSession,
  updateBenchSession,
  subscribeBenchSessions,
  deleteBenchSession,
  saveDiagnosticLog,
  subscribeDiagnosticLogs,
  deleteDiagnosticLog,
} from '../services/benchStorageService';
import {
  BenchComponent,
  DiagnosticTroubleCode,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import type { RpmEmulatorState } from '../utils/vehicleEcuRegistry';
import type { GaugeMonitorState } from '../simulation/telemetry/telemetryTypes';
import { getCustomWires } from '../utils/wireLabelUtils';
import { formatCloudSyncError } from '../utils/cloudSyncErrorUtils';
import { LabDrawerIcon } from './icons/LabDrawerIcons';
import { useAuth } from '../context/AuthContext';

interface BenchCloudModalProps {
  isOpen: boolean;
  onClose: () => void;
  powerSupply: PowerSupplyState;
  wires: WireConnection[];
  faults: InjectedFault[];
  components: BenchComponent[];
  activeDTCs: DiagnosticTroubleCode[];
  supplyCurrentDrawAmps: number;
  selectedBrandKey?: string;
  selectedModelName?: string;
  selectedEcuProfileId?: string | null;
  rpmEmulator?: RpmEmulatorState;
  gaugeMonitor?: GaugeMonitorState;
  multimeter?: MultimeterState;
  checkedWorkflowIds?: string[];
  preBenchGateLocked?: boolean;
  activeSessionId?: string | null;
  onSessionSaved?: (sessionId: string) => void;
  onSessionDeleted?: (sessionId: string) => void;
  onLoadBenchSession: (session: SavedBenchSession) => void;
}

export const BenchCloudModal: React.FC<BenchCloudModalProps> = ({
  isOpen,
  onClose,
  powerSupply,
  wires,
  faults,
  components,
  activeDTCs,
  supplyCurrentDrawAmps,
  selectedBrandKey,
  selectedModelName,
  selectedEcuProfileId,
  rpmEmulator,
  gaugeMonitor,
  multimeter,
  checkedWorkflowIds,
  preBenchGateLocked,
  activeSessionId,
  onSessionSaved,
  onSessionDeleted,
  onLoadBenchSession,
}) => {
  const { user } = useAuth();
  const activeStorageUid = user?.uid || LOCAL_WORKSTATION_UID;
  const [activeTab, setActiveTab] = useState<'BENCH_SESSIONS' | 'DIAGNOSTIC_LOGS'>('BENCH_SESSIONS');

  // Saved items
  const [sessions, setSessions] = useState<SavedBenchSession[]>([]);
  const [logs, setLogs] = useState<SavedDiagnosticLog[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Save Bench Session form
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [ecuLabel, setEcuLabel] = useState(selectedModelName || 'Universal ECU Bench');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const saveBannerTimerRef = useRef<number | null>(null);

  const scheduleClearSaveSuccess = useCallback((delayMs: number) => {
    if (saveBannerTimerRef.current !== null) {
      window.clearTimeout(saveBannerTimerRef.current);
    }
    saveBannerTimerRef.current = window.setTimeout(() => {
      saveBannerTimerRef.current = null;
      if (isMountedRef.current) {
        setSaveSuccess(null);
      }
    }, delayMs);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (saveBannerTimerRef.current !== null) {
        window.clearTimeout(saveBannerTimerRef.current);
        saveBannerTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen && selectedModelName) {
      setEcuLabel(selectedModelName);
    }
  }, [isOpen, selectedModelName]);

  // New Diagnostic Note form
  const [noteTitle, setNoteTitle] = useState('');
  const [noteDtc, setNoteDtc] = useState('');
  const [noteEcu, setNoteEcu] = useState('');
  const [noteSummary, setNoteSummary] = useState('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setLoadError(null);
    const unsubSessions = subscribeBenchSessions(
      activeStorageUid,
      (items) => setSessions(items),
      (err) => {
        const formatted = formatCloudSyncError(err, { isPinOnlyLocalMode: !user });
        if (formatted) setLoadError(formatted);
      }
    );
    const unsubLogs = subscribeDiagnosticLogs(
      activeStorageUid,
      (items) => setLogs(items),
      (err) => {
        const formatted = formatCloudSyncError(err, { isPinOnlyLocalMode: !user });
        if (formatted) setLoadError(formatted);
      }
    );

    return () => {
      unsubSessions();
      unsubLogs();
    };
  }, [isOpen, activeStorageUid, user]);

  if (!isOpen) return null;

  const handleDownloadSessionJson = (sess: SavedBenchSession) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = (sess.title || 'ecu-bench')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    const payload = JSON.stringify(
      {
        schema: 'autoelectric-lab-pro/bench-snapshot/v2',
        exportedAt: new Date().toISOString(),
        session: sess,
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug || 'ecu-bench'}-${stamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaveSuccess(`Exported "${sess.title}" as local JSON snapshot.`);
    scheduleClearSaveSuccess(3500);
  };

  const handleSaveCurrentBench = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionTitle.trim()) return;
    setIsSaving(true);
    setSaveSuccess(null);
    setLoadError(null);
    try {
      const res = await saveBenchSession(activeStorageUid, {
        title: sessionTitle,
        notes: sessionNotes,
        ecuProfileLabel: ecuLabel,
        powerSupply,
        wires,
        faults,
        components,
        activeDtcs: activeDTCs.map((d) => d.code),
        supplyCurrentDrawAmps,
        selectedBrandKey,
        selectedModelName,
        selectedEcuProfileId,
        rpmEmulator,
        gaugeMonitor,
        multimeter,
        workflowCheckedIds: checkedWorkflowIds,
        preBenchGateLocked,
      });
      if (!isMountedRef.current) return;
      setSessionTitle('');
      setSessionNotes('');
      onSessionSaved?.(res.id);
      setSaveSuccess(
        user
          ? res.syncState === 'SYNCED_CLOUD'
            ? 'Bench workspace saved and synced to Firestore Cloud.'
            : 'Bench workspace saved locally (IndexedDB) and queued for Firestore sync.'
          : 'Bench workspace saved locally to this workstation (IndexedDB).'
      );
      scheduleClearSaveSuccess(4000);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        setLoadError(err instanceof Error ? err.message : 'Unable to save bench session.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  const handleUpdateActiveBench = async (targetSession: SavedBenchSession) => {
    setIsSaving(true);
    setSaveSuccess(null);
    setLoadError(null);
    try {
      const baseUpdatedAtMs = targetSession.updatedAt?.toMillis?.();
      const res = await updateBenchSession(activeStorageUid, targetSession.id, {
        title: sessionTitle.trim() || targetSession.title,
        notes: sessionNotes.trim() || targetSession.notes || '',
        ecuProfileLabel: ecuLabel.trim() || targetSession.ecuProfileLabel || 'Universal ECU Bench',
        powerSupply,
        wires,
        faults,
        components,
        activeDtcs: activeDTCs.map((d) => d.code),
        supplyCurrentDrawAmps,
        selectedBrandKey,
        selectedModelName,
        selectedEcuProfileId,
        rpmEmulator,
        gaugeMonitor,
        multimeter,
        workflowCheckedIds: checkedWorkflowIds,
        preBenchGateLocked,
        baseUpdatedAtMs,
      });
      if (!isMountedRef.current) return;
      onSessionSaved?.(res.id);
      setSaveSuccess(
        user
          ? res.syncState === 'SYNCED_CLOUD'
            ? `Updated "${targetSession.title}" in Firestore Cloud & IndexedDB.`
            : `Updated "${targetSession.title}" locally and queued for Firestore sync.`
          : `Updated "${targetSession.title}" in local workstation storage.`
      );
      scheduleClearSaveSuccess(4500);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        setLoadError(err instanceof Error ? err.message : 'Unable to update active bench session.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  const handleSaveDiagnosticNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteSummary.trim()) return;
    setIsSaving(true);
    setSaveSuccess(null);
    setLoadError(null);
    try {
      const savedLog = await saveDiagnosticLog(activeStorageUid, {
        title: noteTitle,
        dtcCode: noteDtc,
        ecuModel: noteEcu,
        sourceType: 'BENCH_SNAPSHOT',
        summary: noteSummary,
        sources: [],
      });
      if (!isMountedRef.current) return;
      setNoteTitle('');
      setNoteDtc('');
      setNoteEcu('');
      setNoteSummary('');
      setSaveSuccess(
        user
          ? savedLog.syncState === 'SYNCED_CLOUD'
            ? 'Diagnostic case note saved and synced to Firestore Cloud.'
            : 'Diagnostic case note saved locally and queued for Firestore sync.'
          : 'Diagnostic case note saved locally to this workstation.'
      );
      scheduleClearSaveSuccess(4000);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        setLoadError(err instanceof Error ? err.message : 'Unable to save diagnostic log.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80">
      <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col hud-panel rounded-[3px] border-[#3c4554] shadow-2xl overflow-hidden font-mono text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 hud-header">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[2px] hw-lcd-well border-[#3c4554] flex items-center justify-center">
              <LabDrawerIcon name="archive" size={32} className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-hud font-bold text-slate-100 tracking-wide uppercase">
                Local Bench Workspaces &amp; Diagnostic Case Logs
              </h2>
              <p className="text-[11px] text-slate-400 font-sans">
                Saved directly in local workstation storage (IndexedDB) with one-click JSON export
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 hw-lcd-well px-2.5 py-1 rounded-[2px] text-[11px] text-emerald-400">
              <HardDrive className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Local Storage Active</span>
            </div>
            <button
              onClick={onClose}
              className="hw-btn p-1.5 rounded-[2px] text-slate-400 hover:text-white transition"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#0c0e12] flex flex-col gap-4">
          {/* Tab Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-[#111419] p-1 rounded-[2px] border border-[#2b313c] text-xs">
              <button
                onClick={() => setActiveTab('BENCH_SESSIONS')}
                className={`px-3 py-1.5 rounded-[2px] font-bold transition flex items-center gap-1.5 ${
                  activeTab === 'BENCH_SESSIONS'
                    ? 'hw-btn-amber'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Bench Workspaces ({sessions.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('DIAGNOSTIC_LOGS')}
                className={`px-3 py-1.5 rounded-[2px] font-bold transition flex items-center gap-1.5 ${
                  activeTab === 'DIAGNOSTIC_LOGS'
                    ? 'hw-btn-amber'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Diagnostic &amp; TSB Logs ({logs.length})</span>
              </button>
            </div>
          </div>

              {saveSuccess && (
                <div className="p-2.5 rounded-[2px] bg-[#0b1a12] border border-emerald-700/70 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{saveSuccess}</span>
                </div>
              )}

              {loadError && (
                <div className="p-2.5 rounded-[2px] bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="truncate">{loadError}</span>
                </div>
              )}

              {/* TAB 1: SAVED BENCH SESSIONS */}
              {activeTab === 'BENCH_SESSIONS' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Left: Save Current Bench Snapshot */}
                  <form
                    onSubmit={handleSaveCurrentBench}
                    className="lg:col-span-5 hud-panel rounded-[2px] p-3.5 flex flex-col gap-3 h-fit"
                  >
                    <div className="flex items-center justify-between border-b border-[#2b313c] pb-2">
                      <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase">
                        <Plus className="w-4 h-4" />
                        Save Current Live Bench State
                      </span>
                      <span className="text-[10px] text-slate-400 tabular-nums">
                        {wires.length} Wires · {faults.length} Faults
                      </span>
                    </div>

                    <div className="hw-lcd-well p-2.5 rounded-[2px] text-[11px] flex flex-wrap gap-3 text-slate-300 tabular-nums">
                      <span>
                        PSU: <strong className="text-amber-300">{powerSupply.voltageSetting.toFixed(1)}V</strong>
                      </span>
                      <span>
                        Draw: <strong className="text-emerald-300">{supplyCurrentDrawAmps.toFixed(2)}A</strong>
                      </span>
                      <span>
                        DTCs: <strong className={activeDTCs.length > 0 ? 'text-rose-400' : 'text-emerald-400'}>{activeDTCs.length}</strong>
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400 uppercase">Session Title *</label>
                      <input
                        type="text"
                        required
                        maxLength={120}
                        value={sessionTitle}
                        onChange={(e) => setSessionTitle(e.target.value)}
                        placeholder="e.g., TPS Short-to-GND Training Case"
                        className="hw-lcd-well rounded-[2px] px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400 uppercase">ECU Profile / Unit</label>
                      <input
                        type="text"
                        maxLength={120}
                        value={ecuLabel}
                        onChange={(e) => setEcuLabel(e.target.value)}
                        placeholder="e.g., Hitachi MEC11-251 / Universal"
                        className="hw-lcd-well rounded-[2px] px-3 py-1.5 text-xs text-amber-300 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400 uppercase">Technician Notes</label>
                      <textarea
                        rows={3}
                        maxLength={1000}
                        value={sessionNotes}
                        onChange={(e) => setSessionNotes(e.target.value)}
                        placeholder="Observations, expected DMM measurements, or test sequence..."
                        className="hw-lcd-well rounded-[2px] px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSaving || !sessionTitle.trim()}
                      className="hw-btn hw-btn-amber w-full py-2 disabled:opacity-50 font-bold text-xs rounded-[2px] transition flex items-center justify-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSaving ? 'Saving...' : 'Save Bench Snapshot'}</span>
                    </button>
                  </form>

                  {/* Right: Saved Bench Sessions List */}
                  <div className="lg:col-span-7 flex flex-col gap-2.5">
                    {sessions.length === 0 ? (
                      <div className="p-8 hud-panel rounded-[2px] text-center text-xs text-slate-400 font-sans">
                        No saved bench workspaces yet. Capture your current harness, sensor values, and faults on the left.
                      </div>
                    ) : (
                      sessions.map((sess) => {
                        const customWires = getCustomWires(sess.wires);
                        const isActiveSession = activeSessionId === sess.id;
                        return (
                          <div
                            key={sess.id}
                            className={`hud-panel rounded-[2px] p-3.5 flex flex-col gap-2 transition ${
                              isActiveSession
                                ? 'border-amber-500/80'
                                : 'hover:border-[#4b5668]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <h4 className="text-xs font-bold text-slate-100">{sess.title}</h4>
                                  {isActiveSession && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-[2px] bg-[#1c1507] border border-amber-500/70 text-amber-300 font-bold uppercase">
                                      ACTIVE BENCH
                                    </span>
                                  )}
                                  {sess.syncState === 'QUEUED_OFFLINE' && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-[2px] bg-[#1c1507] border border-amber-600/80 text-amber-300 font-bold uppercase">
                                      QUEUED SYNC
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-amber-300/90">{sess.ecuProfileLabel}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {isActiveSession && (
                                  <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() => {
                                      void handleUpdateActiveBench(sess);
                                    }}
                                    className="hw-btn hw-btn-amber px-2.5 py-1 rounded-[2px] text-[11px] font-bold flex items-center gap-1 transition disabled:opacity-50"
                                    title="Overwrite this active workspace with your current live bench harness, faults, and instrument state"
                                  >
                                    <Save className="w-3 h-3" />
                                    <span>{isSaving ? 'Updating...' : 'Update Active'}</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    onLoadBenchSession(sess);
                                    onClose();
                                  }}
                                  className="hw-btn hw-btn-green px-2.5 py-1 rounded-[2px] text-[11px] font-bold flex items-center gap-1 transition"
                                >
                                  <Wrench className="w-3 h-3" />
                                  <span>Load Bench</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadSessionJson(sess)}
                                  className="hw-btn p-1.5 rounded-[2px] hover:border-amber-500/70 text-slate-300 hover:text-amber-300 transition"
                                  title="Export Session as Local JSON"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      await deleteBenchSession(activeStorageUid, sess.id);
                                      onSessionDeleted?.(sess.id);
                                    } catch (err: unknown) {
                                      setLoadError(
                                        err instanceof Error ? err.message : 'Unable to delete bench session.'
                                      );
                                    }
                                  }}
                                  className="hw-btn p-1.5 rounded-[2px] hover:border-rose-700 text-slate-400 hover:text-rose-300 transition"
                                  title="Delete Workspace"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {sess.notes && (
                              <p className="text-[11px] text-slate-300 font-sans leading-relaxed">
                                {sess.notes}
                              </p>
                            )}

                            {customWires.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                <span className="text-slate-500 uppercase">Custom Wires:</span>
                                {customWires.slice(0, 6).map((cw) => (
                                  <span
                                    key={cw.id}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] hw-lcd-well text-slate-200"
                                  >
                                    <span
                                      className="w-1.5 h-1.5 rounded-full shrink-0"
                                      style={{ backgroundColor: cw.isCut ? '#64748b' : cw.color }}
                                    />
                                    <span className="truncate max-w-[140px]">{cw.label}</span>
                                  </span>
                                ))}
                                {customWires.length > 6 && (
                                  <span className="text-slate-500">+{customWires.length - 6} more</span>
                                )}
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-2 text-[10px] pt-1 border-t border-[#2b313c] text-slate-400 tabular-nums">
                              <span>PSU: {sess.powerSupply?.voltageSetting?.toFixed(1) ?? '12.6'}V</span>
                              <span>·</span>
                              <span>{sess.wires?.length ?? 0} Wires</span>
                              <span>·</span>
                              <span>{sess.faults?.length ?? 0} Faults</span>
                              {Array.isArray(sess.workflowCheckedIds) && (
                                <>
                                  <span>·</span>
                                  <span className="text-emerald-400">
                                    {sess.workflowCheckedIds.length} Workflow Checks
                                  </span>
                                </>
                              )}
                              {sess.activeDtcs?.length > 0 && (
                                <>
                                  <span>·</span>
                                  <span className="text-rose-400 font-bold">
                                    DTCs: {sess.activeDtcs.join(', ')}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: DIAGNOSTIC & TSB LOGS */}
              {activeTab === 'DIAGNOSTIC_LOGS' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Left: Add Diagnostic Log Entry */}
                  <form
                    onSubmit={handleSaveDiagnosticNote}
                    className="lg:col-span-5 hud-panel rounded-[2px] p-3.5 flex flex-col gap-3 h-fit"
                  >
                    <div className="border-b border-[#2b313c] pb-2">
                      <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase">
                        <Plus className="w-4 h-4" />
                        Record Diagnostic Case Note
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400 uppercase">Case Title *</label>
                      <input
                        type="text"
                        required
                        maxLength={160}
                        value={noteTitle}
                        onChange={(e) => setNoteTitle(e.target.value)}
                        placeholder="e.g., MEC22-251 R701 Shunt Open Fix"
                        className="hw-lcd-well rounded-[2px] px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-400 uppercase">DTC Code</label>
                        <input
                          type="text"
                          maxLength={32}
                          value={noteDtc}
                          onChange={(e) => setNoteDtc(e.target.value)}
                          placeholder="P0201"
                          className="hw-lcd-well rounded-[2px] px-2.5 py-1.5 text-xs text-amber-300 placeholder-slate-500 focus:outline-none focus:border-amber-500 uppercase"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-400 uppercase">ECU Model</label>
                        <input
                          type="text"
                          maxLength={120}
                          value={noteEcu}
                          onChange={(e) => setNoteEcu(e.target.value)}
                          placeholder="MEC22-251"
                          className="hw-lcd-well rounded-[2px] px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400 uppercase">Diagnostic Findings *</label>
                      <textarea
                        rows={4}
                        required
                        maxLength={12000}
                        value={noteSummary}
                        onChange={(e) => setNoteSummary(e.target.value)}
                        placeholder="Measured shunt resistance, oscilloscope waveform findings, or repair verification..."
                        className="hw-lcd-well rounded-[2px] px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSaving || !noteTitle.trim() || !noteSummary.trim()}
                      className="hw-btn hw-btn-amber w-full py-2 disabled:opacity-50 font-bold text-xs rounded-[2px] transition flex items-center justify-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSaving ? 'Saving...' : 'Save Diagnostic Log'}</span>
                    </button>
                  </form>

                  {/* Right: Saved Logs & Grounded TSB Bookmarks */}
                  <div className="lg:col-span-7 flex flex-col gap-2.5">
                    {logs.length === 0 ? (
                      <div className="p-8 hud-panel rounded-[2px] text-center text-xs text-slate-400 font-sans">
                        No diagnostic logs or bookmarked TSBs yet. Record notes here or save Google Search Grounding results directly.
                      </div>
                    ) : (
                      logs.map((log) => (
                        <div
                          key={log.id}
                          className="hud-panel rounded-[2px] p-3.5 flex flex-col gap-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[9px] px-1.5 py-0.5 rounded-[2px] bg-[#1d222b] border border-[#3c4554] text-slate-300 font-bold">
                                  {log.sourceType.replace('_', ' ')}
                                </span>
                                {log.syncState === 'QUEUED_OFFLINE' && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-[2px] bg-[#1c1507] border border-amber-600/80 text-amber-300 font-bold uppercase">
                                    QUEUED SYNC
                                  </span>
                                )}
                                {log.dtcCode && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-[2px] bg-[#1c1507] border border-amber-700 text-amber-300 font-bold">
                                    {log.dtcCode}
                                  </span>
                                )}
                                {log.ecuModel && (
                                  <span className="text-[10px] text-slate-400">{log.ecuModel}</span>
                                )}
                              </div>
                              <h4 className="text-xs font-bold text-slate-100">{log.title}</h4>
                            </div>

                            <button
                              onClick={() => void deleteDiagnosticLog(activeStorageUid, log.id)}
                              className="hw-btn p-1.5 rounded-[2px] hover:border-rose-700 text-slate-400 hover:text-rose-300 transition shrink-0"
                              title="Delete Log"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="hw-lcd-well text-[11px] text-slate-300 font-sans whitespace-pre-wrap max-h-40 overflow-y-auto p-2.5 rounded-[2px] leading-relaxed">
                            {log.summary}
                          </div>

                          {log.sources && log.sources.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {log.sources.map((src, idx) => {
                                const safeHref = toSafeExternalHttpUrl(src.uri);
                                if (!safeHref) {
                                  return (
                                    <span
                                      key={idx}
                                      className="hw-btn text-[10px] px-2 py-0.5 rounded-[2px] text-slate-400 flex items-center gap-1"
                                    >
                                      <span className="truncate max-w-[160px]">{src.title}</span>
                                    </span>
                                  );
                                }
                                return (
                                  <a
                                    key={idx}
                                    href={safeHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hw-btn text-[10px] px-2 py-0.5 rounded-[2px] hover:border-amber-500/60 text-amber-300 flex items-center gap-1 transition"
                                  >
                                    <ExternalLink className="w-2.5 h-2.5" />
                                    <span className="truncate max-w-[160px]">{src.title}</span>
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
        </div>
      </div>
    </div>
  );
};
