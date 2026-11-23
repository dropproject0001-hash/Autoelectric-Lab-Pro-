import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Printer,
  Download,
  FileText,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Activity,
  Gauge,
  Zap,
  CheckSquare,
  Square,
  Sliders,
  Lock,
  GraduationCap,
} from 'lucide-react';
import { useTrialAccess } from '../context/TrialAccessContext';
import { UniversityLabPdfModal } from './UniversityLabPdfModal';
import { generateSignedClientDiagnosticPdf } from '../services/clientDiagnosticPdfService';
import {
  DiagnosticTroubleCode,
  EcuPin,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';

interface DiagnosticReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  powerSupply: PowerSupplyState;
  pins: EcuPin[];
  wires: WireConnection[];
  faults: InjectedFault[];
  activeDTCs: DiagnosticTroubleCode[];
  nodeVoltages: Record<string, number>;
  supplyCurrentDrawAmps: number;
  isSupplyCurrentTripped: boolean;
  multimeter: MultimeterState;
  multimeterReading: {
    display: string;
    unit: string;
    isWarning: boolean;
    warningMessage?: string;
  };
  selectedPinId: string | null;
}

export const DiagnosticReportModal: React.FC<DiagnosticReportModalProps> = ({
  isOpen,
  onClose,
  powerSupply,
  pins,
  wires,
  faults,
  activeDTCs,
  nodeVoltages,
  supplyCurrentDrawAmps,
  isSupplyCurrentTripped,
  multimeter,
  multimeterReading,
  selectedPinId,
}) => {
  // Section visibility toggle states
  const [showPsu, setShowPsu] = useState(true);
  const [showDtcs, setShowDtcs] = useState(true);
  const [showRails, setShowRails] = useState(true);
  const [showDmm, setShowDmm] = useState(true);
  const [showFaults, setShowFaults] = useState(true);
  const [isUniversityPdfOpen, setIsUniversityPdfOpen] = useState(false);
  const [isSigningClientPdf, setIsSigningClientPdf] = useState(false);
  const { canUseExports, openAccessModal } = useTrialAccess();

  if (!isOpen) return null;

  const cutWires = wires.filter((w) => w.isCut);
  const kl30V = nodeVoltages['ecu-pin-3'] ?? 0;
  const kl31V = nodeVoltages['ecu-pin-1'] ?? 0;
  const selectedPin = pins.find((p) => p.id === selectedPinId);
  const timestamp = new Date().toISOString();

  const handlePrint = () => {
    if (!canUseExports) {
      openAccessModal({
        tab: 'TRIAL_PIN',
        notice: 'Report PDF/Print exports are locked. Enter an active 8-digit Trial PIN or Master Admin PIN to unlock exports.',
      });
      return;
    }
    window.print();
  };

  const handlePrintSignedA4Pdf = async () => {
    if (!canUseExports) {
      openAccessModal({
        tab: 'TRIAL_PIN',
        notice: 'Signed A4 PDF exports are locked. Enter an active 8-digit Trial PIN or Master Admin PIN to unlock exports.',
      });
      return;
    }
    setIsSigningClientPdf(true);
    try {
      await generateSignedClientDiagnosticPdf({
        reportTitle: `ECU Bench Client Diagnostic Record - ${new Date().toISOString().slice(0, 10)}`,
        ecuProfileLabel: 'Universal ECU Bench',
        powerSupply,
        pins,
        wires,
        faults,
        multimeter,
        circuitSolution: {
          nodeVoltages,
          nodeResistances: {},
          wireCurrentsMa: {},
          supplyCurrentDrawAmps,
          isSupplyCurrentTripped,
          activeDTCs,
          multimeterReading: {
            display: multimeterReading.display,
            value: Number.parseFloat(multimeterReading.display) || 0,
            unit: multimeterReading.unit,
            isOverLimit: multimeterReading.display === 'O.L',
            isWarning: multimeterReading.isWarning,
            warningMessage: multimeterReading.warningMessage,
            shouldBeep: false,
          },
        },
      });
    } finally {
      setIsSigningClientPdf(false);
    }
  };

  const handleDownloadHtml = () => {
    if (!canUseExports) {
      openAccessModal({
        tab: 'TRIAL_PIN',
        notice: 'HTML diagnostic report exports are locked. Enter an active 8-digit Trial PIN or Master Admin PIN to unlock exports.',
      });
      return;
    }
    const reportHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AutoElectric Lab Pro - Diagnostic Report</title>
  <style>
    body { background-color: #0c0e12; color: #f8fafc; font-family: 'JetBrains Mono', monospace, sans-serif; padding: 24px; margin: 0; }
    .container { max-width: 800px; margin: 0 auto; background: #151920; border: 1px solid #3c4554; border-radius: 3px; padding: 32px; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.5); }
    header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f59e0b; padding-bottom: 16px; margin-bottom: 24px; }
    h1 { font-size: 20px; color: #fcd34d; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
    .meta { font-size: 11px; color: #94a3b8; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }
    .card { background: #090b0f; border: 1px solid #2b313c; border-radius: 2px; padding: 16px; }
    .card h3 { font-size: 12px; color: #f59e0b; margin: 0 0 8px 0; text-transform: uppercase; }
    .value { font-size: 14px; font-weight: bold; color: #f1f5f9; }
    .badge-red { background: #450a0a; color: #fca5a5; border: 1px solid #b91c1c; padding: 2px 6px; border-radius: 2px; font-size: 10px; }
    .badge-green { background: #062113; color: #4ade80; border: 1px solid #15803d; padding: 2px 6px; border-radius: 2px; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; }
    th, td { border: 1px solid #2b313c; padding: 8px; text-align: left; }
    th { background: #171b22; color: #f59e0b; }
    footer { margin-top: 32px; border-top: 1px solid #2b313c; padding-top: 16px; font-size: 10px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>AutoElectric Lab Pro</h1>
        <div class="meta">Virtual ECU Bench Diagnostic Certificate</div>
      </div>
      <div class="meta" style="text-align: right;">
        Generated: ${new Date().toLocaleString()}<br/>
        Solver Status: ${isSupplyCurrentTripped ? 'OCP TRIPPED' : 'NOMINAL'}
      </div>
    </header>

    <div class="grid">
      ${
        showPsu
          ? `<div class="card">
               <h3>Bench Power Supply</h3>
               <div class="value">${powerSupply.isOutputEnabled ? `${powerSupply.voltageSetting.toFixed(2)}V (ON)` : 'OFF'} · ${supplyCurrentDrawAmps.toFixed(2)} A Draw</div>
               <div class="meta" style="margin-top: 4px;">Preset: ${powerSupply.preset} (Limit: ${powerSupply.currentLimit.toFixed(1)}A)</div>
             </div>`
          : ''
      }
      ${
        showDtcs
          ? `<div class="card">
               <h3>OBD-II DTC Status</h3>
               <div class="value">${activeDTCs.length > 0 ? `<span class="badge-red">${activeDTCs.length} Fault(s) Detected</span>` : '<span class="badge-green">0 Active DTCs (Nominal)</span>'}</div>
               <div class="meta" style="margin-top: 4px;">${activeDTCs.map((d) => `${d.code}: ${d.description}`).join('; ') || 'All monitored systems verified.'}</div>
             </div>`
          : ''
      }
      ${
        showRails
          ? `<div class="card">
               <h3>Power Rails & Ground</h3>
               <div class="value">KL30: ${kl30V.toFixed(2)}V | KL31: ${kl31V.toFixed(2)}V</div>
               <div class="meta" style="margin-top: 4px;">Selected Pin: ${selectedPin ? `${selectedPin.label} (#${selectedPin.pinNumber})` : 'None'}</div>
             </div>`
          : ''
      }
      ${
        showDmm
          ? `<div class="card">
               <h3>Digital Multimeter</h3>
               <div class="value">${multimeterReading.display} ${multimeterReading.unit}</div>
               <div class="meta" style="margin-top: 4px;">Red: ${multimeter.redProbe.attachedLabel} | Black: ${multimeter.blackProbe.attachedLabel}</div>
             </div>`
          : ''
      }
    </div>

    ${
      showFaults
        ? `<div class="card" style="margin-bottom: 24px;">
             <h3>Active Faults & Injected Anomaly Matrix</h3>
             ${
               faults.length === 0 && cutWires.length === 0
                 ? '<p class="meta">No injected pin faults or cut harness leads present. Circuit topology is fully closed.</p>'
                 : `<table>
                      <tr><th>Type / Element</th><th>Fault / Status</th><th>Description</th></tr>
                      ${faults.map((f) => `<tr><td>Pin ${f.pinId}</td><td><span class="badge-red">${f.faultType}</span></td><td>${f.description}</td></tr>`).join('')}
                      ${cutWires.map((w) => `<tr><td>Harness Wire</td><td><span class="badge-red">OPEN_CIRCUIT</span></td><td>${w.label} is cut open</td></tr>`).join('')}
                    </table>`
             }
           </div>`
        : ''
    }

    <footer>
      AutoElectric Lab Pro · Modified Nodal Analysis (MNA) Professional Bench Simulation Platform<br/>
      Certified Report Timestamp: ${timestamp}
    </footer>
  </div>
</body>
</html>`;

    const blob = new Blob([reportHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autoelectric-diagnostic-report-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-5 bg-black/85 animate-in fade-in">
      <div className="relative w-full max-w-6xl max-h-[94vh] flex flex-col hud-panel rounded-[3px] shadow-2xl overflow-hidden font-mono text-slate-100 border-[#3c4554]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 hud-header shrink-0 border-b border-[#2b313c]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[2px] hw-lcd-well border-[#3c4554] flex items-center justify-center">
              <FileText className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-hud font-bold text-slate-100 tracking-wide uppercase">
                Diagnostic PDF Report · Side-by-Side Print Preview & Section Toggles
              </h2>
              <p className="text-[10px] text-slate-400 font-sans">
                Customize visible sections on the left sidebar before printing or exporting HTML
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsUniversityPdfOpen(true)}
              className="hw-btn flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] text-xs font-bold text-cyan-200 border-cyan-500/50 bg-cyan-950/40 hover:bg-cyan-900/50 transition cursor-pointer whitespace-nowrap"
              title="Export Cryptographically Verified University A4 PDF or Verify an Offline Sheet"
            >
              <GraduationCap className="w-3.5 h-3.5 text-cyan-300" />
              <span>University Verified PDF</span>
            </button>

            <button
              onClick={handleDownloadHtml}
              className={`hw-btn flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] text-xs font-semibold transition ${
                canUseExports ? 'text-slate-200' : 'text-rose-300 border-rose-700/60 bg-rose-950/30'
              }`}
              title={canUseExports ? 'Download standalone HTML report' : 'Exports locked — enter an active Trial PIN'}
            >
              {canUseExports ? (
                <Download className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-rose-400" />
              )}
              <span>Download HTML</span>
            </button>

            <button
              onClick={() => void handlePrintSignedA4Pdf()}
              disabled={isSigningClientPdf}
              className={`hw-btn flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] text-xs font-bold transition ${
                canUseExports ? 'hw-btn-amber' : 'text-rose-200 border-rose-700/60 bg-rose-950/40'
              }`}
              title={canUseExports ? 'Generate cryptographically signed A4 PDF with measurements, fault logs, and pinout diagram' : 'Exports locked — enter an active Trial PIN'}
            >
              {canUseExports ? <ShieldCheck className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5 text-rose-400" />}
              <span>{isSigningClientPdf ? 'Signing A4...' : 'Print to PDF (Signed A4)'}</span>
            </button>

            <button
              onClick={handlePrint}
              className={`hw-btn flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] text-xs font-semibold transition ${
                canUseExports ? 'text-slate-200' : 'text-rose-200 border-rose-700/60 bg-rose-950/40'
              }`}
              title={canUseExports ? 'Print via browser print dialog' : 'Exports locked — enter an active Trial PIN'}
            >
              {canUseExports ? <Printer className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5 text-rose-400" />}
              <span>Browser Print</span>
            </button>

            <button
              onClick={onClose}
              className="hw-btn p-1.5 rounded-[2px] text-slate-400 hover:text-white transition ml-2"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        {isUniversityPdfOpen && (
          <UniversityLabPdfModal
            isOpen={isUniversityPdfOpen}
            initialTab="EXPORT"
            onClose={() => setIsUniversityPdfOpen(false)}
            activeModule={null}
            capturedSteps={[]}
            powerSupply={powerSupply}
            supplyCurrentDrawAmps={supplyCurrentDrawAmps}
            faults={faults}
            wires={wires}
            activeDTCs={activeDTCs}
            rpm={850}
            ckpSignalLost={false}
            tpsVoltage={nodeVoltages['ecu-pin-7'] ?? 0}
          />
        )}

        {!canUseExports && (
          <div className="px-4 py-2 bg-rose-950/45 border-b border-rose-700/60 flex flex-wrap items-center justify-between gap-2 text-xs font-sans">
            <div className="flex items-center gap-2 text-rose-200">
              <Lock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>Trial expired or access locked — HTML &amp; Print/PDF exports require an active 8-digit Trial PIN or Master Admin PIN.</span>
            </div>
            <button
              type="button"
              onClick={() => openAccessModal({ tab: 'TRIAL_PIN' })}
              className="hw-btn hw-btn-amber px-2.5 py-1 rounded-[2px] font-mono text-[11px] font-bold"
            >
              Enter PIN / Unlock
            </button>
          </div>
        )}

        {/* Side-by-Side Layout: Left Sidebar for Section Toggles + Right Preview Panel */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 bg-[#0c0e12]">
          {/* Left Sidebar: Section Visibility Toggles */}
          <aside className="w-full lg:w-72 bg-[#111419] border-r border-[#2b313c] p-3.5 flex flex-col gap-3 shrink-0 overflow-y-auto">
            <div className="flex items-center gap-2 border-b border-[#2b313c] pb-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-xs text-slate-200 uppercase tracking-wider">
                Report Section Toggles
              </span>
            </div>

            <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
              Toggle specific sections below to include or exclude them from the generated print output and PDF certificate.
            </p>

            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => setShowPsu(!showPsu)}
                className={`w-full text-left p-2.5 rounded-[2px] border flex items-center justify-between text-xs transition ${
                  showPsu ? 'bg-[#1d170c] border-amber-500/60 text-amber-200 font-semibold' : 'bg-[#171b22] border-[#2b313c] text-slate-400'
                }`}
              >
                <span>Bench Power Supply (PSU)</span>
                {showPsu ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4 text-slate-600" />}
              </button>

              <button
                onClick={() => setShowDtcs(!showDtcs)}
                className={`w-full text-left p-2.5 rounded-[2px] border flex items-center justify-between text-xs transition ${
                  showDtcs ? 'bg-[#1d170c] border-amber-500/60 text-amber-200 font-semibold' : 'bg-[#171b22] border-[#2b313c] text-slate-400'
                }`}
              >
                <span>OBD-II DTC Monitor</span>
                {showDtcs ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4 text-slate-600" />}
              </button>

              <button
                onClick={() => setShowRails(!showRails)}
                className={`w-full text-left p-2.5 rounded-[2px] border flex items-center justify-between text-xs transition ${
                  showRails ? 'bg-[#1d170c] border-amber-500/60 text-amber-200 font-semibold' : 'bg-[#171b22] border-[#2b313c] text-slate-400'
                }`}
              >
                <span>Power Rails & Ground</span>
                {showRails ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4 text-slate-600" />}
              </button>

              <button
                onClick={() => setShowDmm(!showDmm)}
                className={`w-full text-left p-2.5 rounded-[2px] border flex items-center justify-between text-xs transition ${
                  showDmm ? 'bg-[#1d170c] border-amber-500/60 text-amber-200 font-semibold' : 'bg-[#171b22] border-[#2b313c] text-slate-400'
                }`}
              >
                <span>Digital Multimeter (DMM)</span>
                {showDmm ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4 text-slate-600" />}
              </button>

              <button
                onClick={() => setShowFaults(!showFaults)}
                className={`w-full text-left p-2.5 rounded-[2px] border flex items-center justify-between text-xs transition ${
                  showFaults ? 'bg-[#1d170c] border-amber-500/60 text-amber-200 font-semibold' : 'bg-[#171b22] border-[#2b313c] text-slate-400'
                }`}
              >
                <span>Active Faults & Harness Matrix</span>
                {showFaults ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4 text-slate-600" />}
              </button>
            </div>

            <div className="mt-auto pt-3 border-t border-[#2b313c] text-[10px] text-slate-500 font-sans">
              Sections update live in the preview pane as toggled.
            </div>
          </aside>

          {/* Right Preview Area: Hardware Certificate Template */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex items-start justify-center">
            <div className="w-full max-w-3xl bg-[#13171e] border border-[#3c4554] rounded-[3px] p-6 sm:p-8 shadow-2xl flex flex-col gap-6 text-slate-100 font-mono">
              {/* Report Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-amber-500/45 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[2px] hw-lcd-well border-amber-500/60 flex items-center justify-center shrink-0">
                    <Cpu className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h1 className="text-lg font-hud font-extrabold tracking-wide text-amber-300 uppercase">
                      AutoElectric Lab Pro
                    </h1>
                    <p className="text-[11px] text-slate-400 font-sans">
                      Virtual ECU Bench Diagnostic Certificate & Inspection Report
                    </p>
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-400">
                  <div>Generated: <span className="text-slate-200">{new Date().toLocaleString()}</span></div>
                  <div>Status:{' '}
                    <span className={activeDTCs.length > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                      {activeDTCs.length > 0 ? `${activeDTCs.length} Fault(s) Active` : 'Nominal System'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Grid Metrics Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {showPsu && (
                  <div className="hw-lcd-well rounded-[2px] p-3.5">
                    <span className="text-[10px] text-amber-400 uppercase block font-semibold mb-1">
                      Bench Power Supply (PSU)
                    </span>
                    <div className="text-sm font-bold text-slate-100 tabular-nums">
                      {powerSupply.isOutputEnabled ? `${powerSupply.voltageSetting.toFixed(2)} V (ON)` : 'OUTPUT OFF'}
                      <span className="text-xs text-amber-300 ml-2 font-normal">
                        ({supplyCurrentDrawAmps.toFixed(2)} A Draw)
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Preset: {powerSupply.preset} · Limit: {powerSupply.currentLimit.toFixed(1)}A
                    </div>
                  </div>
                )}

                {showDtcs && (
                  <div className="hw-lcd-well rounded-[2px] p-3.5">
                    <span className="text-[10px] text-amber-400 uppercase block font-semibold mb-1">
                      OBD-II Diagnostic Monitor
                    </span>
                    <div className="text-sm font-bold">
                      {activeDTCs.length > 0 ? (
                        <span className="text-rose-400 flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4" />
                          {activeDTCs.length} Active DTC Code(s)
                        </span>
                      ) : (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" />
                          0 DTCs Stored (Nominal)
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 truncate">
                      {activeDTCs.map((d) => `${d.code} (${d.system})`).join(', ') || 'All monitored sensor & CAN thresholds verified.'}
                    </div>
                  </div>
                )}

                {showRails && (
                  <div className="hw-lcd-well rounded-[2px] p-3.5">
                    <span className="text-[10px] text-amber-400 uppercase block font-semibold mb-1">
                      Power Rails & Selected Pin
                    </span>
                    <div className="text-sm font-bold text-slate-200 tabular-nums">
                      KL30: <span className="text-amber-300">{kl30V.toFixed(2)}V</span> | KL31: <span className="text-emerald-300">{kl31V.toFixed(2)}V</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Selected Probe Target: {selectedPin ? `${selectedPin.label} (#${selectedPin.pinNumber})` : 'None'}
                    </div>
                  </div>
                )}

                {showDmm && (
                  <div className="hw-lcd-well rounded-[2px] p-3.5">
                    <span className="text-[10px] text-amber-400 uppercase block font-semibold mb-1">
                      Digital Multimeter (DMM)
                    </span>
                    <div className="text-sm font-bold text-emerald-300 tabular-nums">
                      {multimeterReading.display} {multimeterReading.unit}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 truncate">
                      Red: {multimeter.redProbe.attachedLabel} · Black: {multimeter.blackProbe.attachedLabel}
                    </div>
                  </div>
                )}
              </div>

              {/* Injected Faults & Cut Wires Table */}
              {showFaults && (
                <div className="hw-lcd-well rounded-[2px] p-4 flex flex-col gap-2">
                  <span className="text-xs font-bold text-amber-300 uppercase">
                    Active Circuit Faults & Harness Integrity
                  </span>
                  {faults.length === 0 && cutWires.length === 0 ? (
                    <div className="text-xs text-emerald-400 font-sans py-2 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>No pin faults or cut harness wires present. The electrical topology is fully closed and nominal.</span>
                    </div>
                  ) : (
                    <div className="border border-[#2b313c] rounded-[2px] overflow-hidden text-xs mt-1">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-[#171b22] text-slate-400 font-mono text-[10px] uppercase border-b border-[#2b313c]">
                          <tr>
                            <th className="p-2">Element</th>
                            <th className="p-2">Fault Type</th>
                            <th className="p-2">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#242a34] font-mono text-[11px]">
                          {faults.map((f, i) => (
                            <tr key={i} className="hover:bg-[#171b22]">
                              <td className="p-2 font-bold text-amber-300">Pin {f.pinId}</td>
                              <td className="p-2">
                                <span className="bg-rose-950 text-rose-300 border border-rose-800 px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold">
                                  {f.faultType}
                                </span>
                              </td>
                              <td className="p-2 text-slate-300 font-sans">{f.description}</td>
                            </tr>
                          ))}
                          {cutWires.map((w, i) => (
                            <tr key={`w_${i}`} className="hover:bg-[#171b22]">
                              <td className="p-2 font-bold text-rose-400">Harness Lead</td>
                              <td className="p-2">
                                <span className="bg-rose-950 text-rose-300 border border-rose-800 px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold">
                                  OPEN_CIRCUIT
                                </span>
                              </td>
                              <td className="p-2 text-slate-300 font-sans">{w.label} is cut open on canvas</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Footer Certificate Note */}
              <div className="text-[10px] text-slate-500 font-sans border-t border-[#2b313c] pt-3 flex items-center justify-between">
                <span>AutoElectric Lab Pro · MNA Numerical Engine Verified Report</span>
                <span className="font-mono">{timestamp}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-3 bg-[#111419] border-t border-[#2b313c] flex items-center justify-between text-xs font-sans text-slate-400 shrink-0">
          <span>Customize sections on the left sidebar, then click "Print / Save PDF".</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="hw-btn px-4 py-1.5 text-slate-200 rounded-[2px] text-xs font-mono font-medium transition"
            >
              Close Preview
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
