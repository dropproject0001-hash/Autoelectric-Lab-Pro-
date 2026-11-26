/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Lock,
  Printer,
  Save,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTrialAccess } from '../context/TrialAccessContext';
import {
  appendToGoogleDoc,
  buildBenchReportText,
  createBenchReportDoc,
  extractGoogleConsoleUrl,
  formatWorkspaceBannerText,
  getGoogleDoc,
  GoogleDriveDocItem,
  GoogleWorkspaceAuthError,
  listGoogleDocs,
  ParsedGoogleDoc,
  replaceGoogleDocBody,
  trashGoogleDoc,
} from '../services/googleDocsService';
import {
  generateSignedClientDiagnosticPdf,
  verifySignedClientDiagnosticToken,
  type GeneratedClientDiagnosticPdfResult,
} from '../services/clientDiagnosticPdfService';
import { LOCAL_WORKSTATION_UID, saveDiagnosticLog } from '../services/benchStorageService';
import {
  EcuPin,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import { CircuitSolution } from '../utils/circuitSolver';
import { toSafeExternalHttpUrl } from '../utils/safeExternalUrl';
import { GoogleDocsTab } from './workspace/GoogleDocsTab';
import {
  GoogleSignInButton,
  WorkspaceActionConfirmDialog,
} from './workspace/WorkspaceAuthBanner';
import type { PendingWorkspaceAction } from './workspace/workspaceTypes';

interface GoogleDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
  powerSupply: PowerSupplyState;
  pins: EcuPin[];
  wires: WireConnection[];
  faults: InjectedFault[];
  multimeter: MultimeterState;
  circuitSolution: CircuitSolution;
  defaultVehicleLabel?: string;
  defaultEcuProfileLabel?: string;
}

type DocsStudioMode = 'LOCAL_PDF' | 'GOOGLE_DOCS';

function sanitizeFileSlug(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'ecu-bench-report'
  );
}

function triggerLocalTextDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const GoogleDocsModal: React.FC<GoogleDocsModalProps> = ({
  isOpen,
  onClose,
  powerSupply,
  pins,
  wires,
  faults,
  multimeter,
  circuitSolution,
  defaultVehicleLabel,
  defaultEcuProfileLabel,
}) => {
  const { canUseExports, openAccessModal } = useTrialAccess();
  const {
    user,
    workspaceToken,
    needsWorkspaceAuth,
    isSigningIn,
    connectGoogleWorkspace,
    invalidateWorkspaceToken,
  } = useAuth();

  const [studioMode, setStudioMode] = useState<DocsStudioMode>('LOCAL_PDF');
  const [reportTitle, setReportTitle] = useState(
    () => `ECU Bench Report - ${new Date().toISOString().slice(0, 10)}`
  );
  const [ecuProfileLabel, setEcuProfileLabel] = useState(
    () => defaultEcuProfileLabel || 'Universal ECU Bench'
  );
  const [clientName, setClientName] = useState('');
  const [workOrderNumber, setWorkOrderNumber] = useState(
    () => `RO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-01`
  );
  const [vehicleInfo, setVehicleInfo] = useState(
    () => defaultVehicleLabel || 'Universal Automotive ECU Bench'
  );
  const [technicianName, setTechnicianName] = useState('');
  const [techNotes, setTechNotes] = useState('');
  const [isSavingLog, setIsSavingLog] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [signedPdfResult, setSignedPdfResult] = useState<{
    result: GeneratedClientDiagnosticPdfResult;
    selfVerified: boolean;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
    linkUrl?: string;
    linkLabel?: string;
  } | null>(null);

  // Live Google Docs API state
  const [docsList, setDocsList] = useState<GoogleDriveDocItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docSearch, setDocSearch] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<ParsedGoogleDoc | null>(null);
  const [docDetailLoading, setDocDetailLoading] = useState(false);
  const [docEditableBody, setDocEditableBody] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingWorkspaceAction | null>(null);
  const [isExecutingDocAction, setIsExecutingDocAction] = useState(false);

  const liveReportPreview = useMemo(
    () =>
      buildBenchReportText({
        ecuProfileLabel: ecuProfileLabel.trim() || 'Universal ECU Bench',
        powerSupply,
        pins,
        wires,
        faults,
        multimeter,
        circuitSolution,
        technicianNotes: techNotes,
      }),
    [ecuProfileLabel, powerSupply, pins, wires, faults, multimeter, circuitSolution, techNotes]
  );

  const markdownReportContent = useMemo(() => {
    const activeFaults = faults.filter((f) => f.faultType !== 'NONE');
    const lines = [
      `# ${reportTitle.trim() || 'ECU Bench Diagnostic Report'}`,
      '',
      `- **Generated At:** ${new Date().toISOString()}`,
      `- **ECU Profile:** ${ecuProfileLabel.trim() || 'Universal ECU Bench'}`,
      `- **Measurement Source:** Simulated MNA Bench Telemetry (not physical probe readings)`,
      `- **Bench PSU:** ${powerSupply.isOutputEnabled ? 'ON' : 'OFF'} | ${powerSupply.voltageSetting.toFixed(2)}V / ${circuitSolution.supplyCurrentDrawAmps.toFixed(3)}A`,
      `- **Active Faults:** ${activeFaults.length} | **Active DTCs:** ${circuitSolution.activeDTCs.length}`,
      '',
      '## Live Pinout Telemetry Matrix',
      '',
      '| Pin | Label | Signal Name | Category | Voltage (V) | Nominal (V) | Status |',
      '| --- | --- | --- | --- | ---: | ---: | --- |',
      ...pins.map((pin) => {
        const v = circuitSolution.nodeVoltages[pin.id];
        const volts = Number.isFinite(v) ? v.toFixed(2) : '0.00';
        const pinFault = activeFaults.find((f) => f.pinId === pin.id);
        const status = pinFault
          ? pinFault.faultType
          : powerSupply.isOutputEnabled
            ? 'NOMINAL'
            : 'STANDBY';
        return `| ${pin.pinNumber} | ${pin.label} | ${pin.name} | ${pin.category} | ${volts} | ${pin.nominalVoltage.toFixed(2)} | ${status} |`;
      }),
      '',
      '## Full Bench Diagnostic Transcript',
      '',
      '```text',
      liveReportPreview,
      '```',
    ];
    return lines.join('\n');
  }, [
    reportTitle,
    ecuProfileLabel,
    powerSupply,
    circuitSolution,
    faults,
    pins,
    liveReportPreview,
  ]);

  const reportDocError = useCallback(
    (err: unknown) => {
      if (err instanceof GoogleWorkspaceAuthError) {
        invalidateWorkspaceToken();
      }
      const raw = err instanceof Error ? err.message : 'Google Docs request failed.';
      const consoleUrl = extractGoogleConsoleUrl(raw);
      setStatusMessage({
        type: 'error',
        text: formatWorkspaceBannerText(raw, Boolean(consoleUrl)),
        linkUrl: consoleUrl || undefined,
        linkLabel: consoleUrl ? 'Enable API in Console' : undefined,
      });
    },
    [invalidateWorkspaceToken]
  );

  const refreshGoogleDocs = useCallback(
    async (qOverride?: string, tokenOverride?: string) => {
      const token = tokenOverride ?? workspaceToken;
      if (!token) return;
      setDocsLoading(true);
      try {
        const docs = await listGoogleDocs(token, qOverride ?? docSearch);
        setDocsList(docs);
      } catch (err) {
        reportDocError(err);
      } finally {
        setDocsLoading(false);
      }
    },
    [workspaceToken, docSearch, reportDocError]
  );

  useEffect(() => {
    if (isOpen && studioMode === 'GOOGLE_DOCS' && workspaceToken) {
      void refreshGoogleDocs(undefined, workspaceToken);
    }
  }, [isOpen, studioMode, workspaceToken, refreshGoogleDocs]);

  const handleOpenGoogleDoc = useCallback(
    async (item: GoogleDriveDocItem) => {
      if (!workspaceToken) return;
      setDocDetailLoading(true);
      try {
        const parsed = await getGoogleDoc(workspaceToken, item.id);
        setSelectedDoc(parsed);
        setDocEditableBody(parsed.plainText);
      } catch (err) {
        reportDocError(err);
      } finally {
        setDocDetailLoading(false);
      }
    },
    [workspaceToken, reportDocError]
  );

  const handleConfirmDocAction = useCallback(async () => {
    if (!pendingAction || !workspaceToken) return;
    setIsExecutingDocAction(true);
    setStatusMessage(null);
    try {
      if (pendingAction.kind === 'CREATE_GOOGLE_DOC') {
        const created = await createBenchReportDoc(
          workspaceToken,
          pendingAction.title,
          pendingAction.bodyText
        );
        setStatusMessage({
          type: 'success',
          text: `Created Google Doc "${created.title}".`,
          linkUrl: created.webViewLink,
          linkLabel: 'Open in Docs',
        });
        await refreshGoogleDocs(undefined, workspaceToken);
        const loaded = await getGoogleDoc(workspaceToken, created.documentId);
        setSelectedDoc(loaded);
        setDocEditableBody(loaded.plainText);
      } else if (pendingAction.kind === 'APPEND_GOOGLE_DOC') {
        const updated = await appendToGoogleDoc(
          workspaceToken,
          pendingAction.documentId,
          pendingAction.textToAppend
        );
        setSelectedDoc(updated);
        setDocEditableBody(updated.plainText);
        setStatusMessage({
          type: 'success',
          text: `Appended live MNA report to Google Doc "${updated.title}".`,
        });
      } else if (pendingAction.kind === 'REPLACE_GOOGLE_DOC') {
        const updated = await replaceGoogleDocBody(
          workspaceToken,
          pendingAction.documentId,
          pendingAction.newBodyText
        );
        setSelectedDoc(updated);
        setDocEditableBody(updated.plainText);
        setStatusMessage({
          type: 'success',
          text: `Saved updated text to Google Doc "${updated.title}".`,
        });
      } else if (pendingAction.kind === 'TRASH_GOOGLE_DOC') {
        await trashGoogleDoc(workspaceToken, pendingAction.documentId);
        if (selectedDoc?.documentId === pendingAction.documentId) {
          setSelectedDoc(null);
        }
        setStatusMessage({
          type: 'success',
          text: `Moved Google Doc "${pendingAction.title}" to Drive Trash.`,
        });
        await refreshGoogleDocs(undefined, workspaceToken);
      }
      setPendingAction(null);
    } catch (err) {
      reportDocError(err);
    } finally {
      setIsExecutingDocAction(false);
    }
  }, [pendingAction, workspaceToken, selectedDoc?.documentId, refreshGoogleDocs, reportDocError]);

  if (!isOpen) return null;

  const handleDownloadTxt = () => {
    const filename = `${sanitizeFileSlug(reportTitle)}.txt`;
    triggerLocalTextDownload(filename, liveReportPreview, 'text/plain');
    setStatusMessage({
      type: 'success',
      text: `Downloaded local text report "${filename}".`,
    });
  };

  const handleDownloadMarkdown = () => {
    const filename = `${sanitizeFileSlug(reportTitle)}.md`;
    triggerLocalTextDownload(filename, markdownReportContent, 'text/markdown');
    setStatusMessage({
      type: 'success',
      text: `Downloaded Markdown report "${filename}".`,
    });
  };

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(liveReportPreview);
      setStatusMessage({
        type: 'success',
        text: 'Copied full MNA diagnostic report to clipboard.',
      });
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Clipboard access was blocked by the browser. Use Download .TXT instead.',
      });
    }
  };

  const handlePrintToSignedPdf = async () => {
    setIsExportingPdf(true);
    setStatusMessage(null);
    try {
      const result = await generateSignedClientDiagnosticPdf({
        reportTitle: reportTitle.trim() || `ECU Bench Report - ${new Date().toISOString().slice(0, 10)}`,
        clientName: clientName.trim() || undefined,
        workOrderNumber: workOrderNumber.trim() || undefined,
        vehicleInfo: vehicleInfo.trim() || undefined,
        ecuProfileLabel: ecuProfileLabel.trim() || 'Universal ECU Bench',
        technicianName: technicianName.trim() || undefined,
        technicianNotes: techNotes.trim() || undefined,
        powerSupply,
        pins,
        wires,
        faults,
        multimeter,
        circuitSolution,
      });
      const verifyCheck = await verifySignedClientDiagnosticToken(result.envelope.qrToken);
      setSignedPdfResult({ result, selfVerified: verifyCheck.valid });
      setStatusMessage({
        type: 'success',
        text: `Generated cryptographically signed A4 PDF "${result.filename}" (${result.pageCount} page${result.pageCount > 1 ? 's' : ''}, SHA-256 sealed).`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to generate signed A4 PDF report.',
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleCopySealValue = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatusMessage({ type: 'success', text: `Copied ${label} to clipboard.` });
    } catch {
      setStatusMessage({ type: 'error', text: `Clipboard blocked — copy ${label} manually.` });
    }
  };

  const handleBrowserPrintReport = () => {
    window.print();
  };

  const handleSaveLocalDiagnosticLog = async () => {
    setIsSavingLog(true);
    setStatusMessage(null);
    try {
      await saveDiagnosticLog(user?.uid || LOCAL_WORKSTATION_UID, {
        title: reportTitle.trim() || `ECU Bench Report - ${new Date().toISOString().slice(0, 10)}`,
        dtcCode: circuitSolution.activeDTCs.map((d) => d.code).join(', ') || 'NOMINAL',
        ecuModel: ecuProfileLabel.trim() || 'Universal ECU Bench',
        sourceType: 'BENCH_SNAPSHOT',
        summary: (techNotes.trim() ? `${techNotes.trim()}\n\n` : '') + liveReportPreview.slice(0, 1800),
      });
      setStatusMessage({
        type: 'success',
        text: user?.uid
          ? 'Saved diagnostic report snapshot to Firebase Cloud & Local Saved Benches.'
          : 'Saved diagnostic report snapshot into Local Saved Benches > Diagnostic Logs.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save diagnostic log.',
      });
    } finally {
      setIsSavingLog(false);
    }
  };

  return (
    <div
      data-testid="google-docs-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4"
    >
      <div className="relative flex flex-col w-full max-w-5xl max-h-[92vh] bg-slate-900 border border-sky-500/30 rounded-xl shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-400 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                Google Docs &amp; Diagnostic Report Studio
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Publish live MNA telemetry reports to Google Docs or export Signed A4 PDF, TXT, Markdown &amp; Logs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1 border border-slate-800">
              <button
                type="button"
                data-testid="docs-mode-local-btn"
                onClick={() => setStudioMode('LOCAL_PDF')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                  studioMode === 'LOCAL_PDF'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Signed PDF &amp; Local
              </button>
              <button
                type="button"
                data-testid="docs-mode-cloud-btn"
                onClick={() => setStudioMode('GOOGLE_DOCS')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                  studioMode === 'GOOGLE_DOCS'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Cloud className="w-3 h-3" />
                <span>Google Docs Cloud</span>
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              aria-label="Close Diagnostic Report Studio"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Banner */}
        {statusMessage && (
          <div
            className={`px-5 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 border-b shrink-0 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-700/40 text-emerald-200'
                : 'bg-rose-950/70 border-rose-700/40 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
              {statusMessage.linkUrl && toSafeExternalHttpUrl(statusMessage.linkUrl) && (
                <a
                  href={toSafeExternalHttpUrl(statusMessage.linkUrl)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline font-semibold"
                >
                  <span>{statusMessage.linkLabel || 'Open'}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-white cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Body */}
        {!canUseExports ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-amber-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              Diagnostic Report Exports Require an Active PIN
            </h3>
            <p className="text-xs text-slate-400 max-w-md mb-5 leading-relaxed">
              Your 3–6 hour trial PIN session has expired or is not active. Enter an active 8-digit Trial PIN or Master Admin PIN to unlock diagnostic report exports.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                openAccessModal({
                  tab: 'TRIAL_PIN',
                  notice:
                    'Enter an active 8-digit Trial PIN or Master Admin PIN to unlock diagnostic report exports.',
                });
              }}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer"
            >
              Enter 8-Digit Trial PIN
            </button>
          </div>
        ) : studioMode === 'GOOGLE_DOCS' ? (
          needsWorkspaceAuth || !workspaceToken ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-400">
                <FileText className="w-7 h-7" />
              </div>
              <div className="space-y-1.5 max-w-md">
                <h3 className="text-base font-bold text-white">
                  Connect Google Docs to Sync Bench Reports
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Sign in with Google to browse existing Google Docs, publish live ECU telemetry reports directly to Google Docs, or append new diagnostic findings with confirmation.
                </p>
              </div>
              <GoogleSignInButton
                testId="docs-google-signin-btn"
                disabled={isSigningIn}
                label={isSigningIn ? 'Authorizing Google Docs...' : 'Sign in with Google'}
                onClick={() => void connectGoogleWorkspace(true)}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-[480px] overflow-hidden">
              <GoogleDocsTab
                docsList={docsList}
                docsLoading={docsLoading}
                docSearch={docSearch}
                onChangeDocSearch={setDocSearch}
                selectedDoc={selectedDoc}
                docDetailLoading={docDetailLoading}
                docEditableBody={docEditableBody}
                onChangeDocEditableBody={setDocEditableBody}
                defaultNewTitle={reportTitle}
                liveReportBody={liveReportPreview}
                isExecuting={isExecutingDocAction}
                onRefreshDocs={(qOverride) => void refreshGoogleDocs(qOverride)}
                onOpenDoc={(item) => void handleOpenGoogleDoc(item)}
                onSetPendingAction={setPendingAction}
              />
            </div>
          )
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Metadata Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Report Title / Filename
                </label>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  ECU / Vehicle Profile Label
                </label>
                <input
                  type="text"
                  value={ecuProfileLabel}
                  onChange={(e) => setEcuProfileLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Client Record Metadata Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Client / Customer Name
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. R. Santos Auto Works"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Work Order / RO #
                </label>
                <input
                  type="text"
                  value={workOrderNumber}
                  onChange={(e) => setWorkOrderNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Vehicle / VIN Reference
                </label>
                <input
                  type="text"
                  value={vehicleInfo}
                  onChange={(e) => setVehicleInfo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Technician Name
                </label>
                <input
                  type="text"
                  value={technicianName}
                  onChange={(e) => setTechnicianName(e.target.value)}
                  placeholder="e.g. Master Tech A. Reyes"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Technician Bench Notes (included in report)
              </label>
              <textarea
                rows={3}
                value={techNotes}
                onChange={(e) => setTechNotes(e.target.value)}
                placeholder="Document observed symptoms, pin voltage checks, continuity findings, or confirmed repair actions..."
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 resize-y"
              />
            </div>

            {/* Action Toolbar */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                data-testid="studio-print-to-pdf-btn"
                disabled={isExportingPdf}
                onClick={() => void handlePrintToSignedPdf()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-55 text-slate-950 text-xs font-bold shadow-sm transition cursor-pointer"
                title="Generate cryptographically signed A4 client PDF with bench measurements, fault logs, and vector pinout diagram"
              >
                <ShieldCheck className="w-4 h-4" />
                {isExportingPdf ? 'Signing A4 PDF...' : 'Print to PDF (Signed A4)'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (workspaceToken) {
                    setPendingAction({
                      kind: 'CREATE_GOOGLE_DOC',
                      title: reportTitle.trim() || `ECU Bench Report - ${new Date().toISOString().slice(0, 10)}`,
                      bodyText: liveReportPreview,
                    });
                  } else {
                    setStudioMode('GOOGLE_DOCS');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer"
              >
                <Cloud className="w-3.5 h-3.5" />
                Publish to Google Docs
              </button>
              <button
                type="button"
                onClick={handleDownloadTxt}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download .TXT
              </button>
              <button
                type="button"
                onClick={handleDownloadMarkdown}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                Download .MD
              </button>
              <button
                type="button"
                onClick={() => void handleCopyReport()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Text
              </button>
              <button
                type="button"
                onClick={handleBrowserPrintReport}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                title="Open native browser print dialog"
              >
                <Printer className="w-3.5 h-3.5" />
                Browser Print
              </button>
              <button
                type="button"
                disabled={isSavingLog}
                onClick={() => void handleSaveLocalDiagnosticLog()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer sm:ml-auto"
              >
                <Save className="w-3.5 h-3.5" />
                {isSavingLog ? 'Saving...' : 'Save to Logs'}
              </button>
            </div>

            {/* Cryptographic Signature Seal Summary (shown after Signed A4 PDF export) */}
            {signedPdfResult && (
              <div
                data-testid="studio-signed-pdf-seal"
                className="rounded-xl border border-emerald-500/45 bg-emerald-950/30 p-3.5 flex flex-col sm:flex-row items-start sm:items-center gap-3.5"
              >
                {signedPdfResult.result.qrDataUrl && (
                  <div className="bg-white p-1.5 rounded-lg shrink-0 border border-emerald-400/50">
                    <img
                      src={signedPdfResult.result.qrDataUrl}
                      alt="Signed A4 Client Report QR Code"
                      className="w-16 h-16 block"
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      SHA-256 Signed A4 Client PDF Ready
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/50 font-mono text-[10px] font-bold text-emerald-200">
                      {signedPdfResult.result.envelope.reportId}
                    </span>
                    {signedPdfResult.selfVerified && (
                      <span className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/50 font-mono text-[10px] font-bold text-cyan-200">
                        SELF-VERIFIED GENUINE
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[10.5px] text-slate-300 break-all">
                    SHA-256:{' '}
                    <span className="text-emerald-200">
                      {signedPdfResult.result.envelope.sha256Hash}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopySealValue(
                          'SHA-256 Hash',
                          signedPdfResult.result.envelope.sha256Hash
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-emerald-500/50 bg-emerald-950/60 hover:bg-emerald-900/60 font-mono text-[10.5px] text-emerald-200 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      Copy SHA-256 Hash
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopySealValue(
                          'Verification Token',
                          signedPdfResult.result.envelope.qrToken
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-cyan-500/50 bg-cyan-950/60 hover:bg-cyan-900/60 font-mono text-[10.5px] text-cyan-200 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      Copy Verification Token
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Live MNA Report Preview */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/90 overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900/90 border-b border-slate-800">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">
                  Live MNA Telemetry Report Preview
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {pins.length} pins · {wires.length} wires · {circuitSolution.activeDTCs.length}{' '}
                  DTCs
                </span>
              </div>
              <pre className="p-3.5 text-[11px] font-mono text-slate-300 leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-72 overflow-y-auto">
                {liveReportPreview}
              </pre>
            </div>
          </div>
        )}
      </div>

      <WorkspaceActionConfirmDialog
        action={pendingAction}
        isExecuting={isExecutingDocAction}
        onCancel={() => {
          if (!isExecutingDocAction) setPendingAction(null);
        }}
        onConfirm={() => void handleConfirmDocAction()}
      />
    </div>
  );
};
