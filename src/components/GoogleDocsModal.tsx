import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  FileText,
  Lock,
  Printer,
  Save,
  X,
} from 'lucide-react';
import { useTrialAccess } from '../context/TrialAccessContext';
import { buildBenchReportText } from '../services/googleDocsService';
import { LOCAL_WORKSTATION_UID, saveDiagnosticLog } from '../services/benchStorageService';
import {
  EcuPin,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import { CircuitSolution } from '../utils/circuitSolver';

interface GoogleDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
  powerSupply: PowerSupplyState;
  pins: EcuPin[];
  wires: WireConnection[];
  faults: InjectedFault[];
  multimeter: MultimeterState;
  circuitSolution: CircuitSolution;
}

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
}) => {
  const { canUseExports, openAccessModal } = useTrialAccess();

  const [reportTitle, setReportTitle] = useState(
    () => `ECU Bench Report - ${new Date().toISOString().slice(0, 10)}`
  );
  const [ecuProfileLabel, setEcuProfileLabel] = useState('Universal ECU Bench');
  const [techNotes, setTechNotes] = useState('');
  const [isSavingLog, setIsSavingLog] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

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

  const handlePrintReport = () => {
    window.print();
  };

  const handleSaveLocalDiagnosticLog = async () => {
    setIsSavingLog(true);
    setStatusMessage(null);
    try {
      await saveDiagnosticLog(LOCAL_WORKSTATION_UID, {
        title: reportTitle.trim() || `ECU Bench Report - ${new Date().toISOString().slice(0, 10)}`,
        dtcCode: circuitSolution.activeDTCs.map((d) => d.code).join(', ') || 'NOMINAL',
        ecuModel: ecuProfileLabel.trim() || 'Universal ECU Bench',
        sourceType: 'BENCH_SNAPSHOT',
        summary: (techNotes.trim() ? `${techNotes.trim()}\n\n` : '') + liveReportPreview.slice(0, 1800),
      });
      setStatusMessage({
        type: 'success',
        text: 'Saved diagnostic report snapshot into Local Saved Benches > Diagnostic Logs.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save diagnostic log locally.',
      });
    } finally {
      setIsSavingLog(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[92vh] bg-slate-900 border border-sky-500/30 rounded-xl shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-400 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                Local ECU Diagnostic Report Studio
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Export live MNA telemetry reports as local TXT, Markdown, Print/PDF, or IndexedDB Logs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300">
              <CheckCircle2 className="w-3 h-3" />
              Local Workstation
            </span>
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
            className={`px-5 py-2.5 text-xs flex items-center justify-between gap-2 border-b ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-700/40 text-emerald-200'
                : 'bg-rose-950/70 border-rose-700/40 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-white"
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
              Your 3–6 hour trial PIN session has expired or is not active. Local bench simulation
              remains open; enter an active 8-digit Trial PIN or Master Admin PIN to unlock local
              report downloads.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                openAccessModal({
                  tab: 'TRIAL_PIN',
                  notice:
                    'Enter an active 8-digit Trial PIN or Master Admin PIN to unlock local diagnostic report exports.',
                });
              }}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer"
            >
              Enter 8-Digit Trial PIN
            </button>
          </div>
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
                onClick={handleDownloadTxt}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download .TXT
              </button>
              <button
                type="button"
                onClick={handleDownloadMarkdown}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                Download .MD
              </button>
              <button
                type="button"
                onClick={handleCopyReport}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Text
              </button>
              <button
                type="button"
                onClick={handlePrintReport}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print / Save PDF
              </button>
              <button
                type="button"
                disabled={isSavingLog}
                onClick={handleSaveLocalDiagnosticLog}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer sm:ml-auto"
              >
                <Save className="w-3.5 h-3.5" />
                {isSavingLog ? 'Saving...' : 'Save to Local Logs'}
              </button>
            </div>

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
    </div>
  );
};
