/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Copy,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  FolderDown,
  Lock,
  Upload,
  X,
} from 'lucide-react';
import { useTrialAccess } from '../context/TrialAccessContext';
import { buildBenchReportText } from '../services/googleDocsService';
import {
  buildDriveBenchSnapshot,
  DriveBenchSnapshot,
  parseDriveBenchSnapshot,
} from '../services/googleDriveService';
import type { VoiceMacro } from '../services/voiceMacroService';
import {
  BenchComponent,
  EcuPin,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import { CircuitSolution } from '../utils/circuitSolver';
import type { RpmEmulatorState } from '../utils/vehicleEcuRegistry';
import type { GaugeMonitorState } from '../simulation/telemetry/telemetryTypes';
import type { WorkspaceTab } from './workspace/workspaceTypes';

export type { WorkspaceTab } from './workspace/workspaceTypes';

type LocalExportTab = 'SNAPSHOT' | 'PINOUT_CSV' | 'REPORT_TXT' | 'CHECKLIST_MD';

interface GoogleWorkspaceModalProps {
  isOpen: boolean;
  initialTab?: WorkspaceTab;
  onClose: () => void;
  powerSupply: PowerSupplyState;
  pins: EcuPin[];
  components: BenchComponent[];
  wires: WireConnection[];
  faults: InjectedFault[];
  multimeter: MultimeterState;
  circuitSolution: CircuitSolution;
  selectedBrandKey?: string;
  selectedModelName?: string;
  selectedEcuProfileId?: string | null;
  rpmEmulator?: RpmEmulatorState;
  gaugeMonitor?: GaugeMonitorState;
  checkedWorkflowIds?: string[];
  preBenchGateLocked?: boolean;
  voiceMacros?: VoiceMacro[];
  onLoadBenchSnapshot?: (snapshot: DriveBenchSnapshot) => void;
}

function mapLegacyInitialTab(tab?: WorkspaceTab): LocalExportTab {
  switch (tab) {
    case 'SHEETS':
      return 'PINOUT_CSV';
    case 'GMAIL':
    case 'SLIDES':
      return 'REPORT_TXT';
    case 'TASKS':
    case 'KEEP':
      return 'CHECKLIST_MD';
    case 'DRIVE':
    default:
      return 'SNAPSHOT';
  }
}

function sanitizeFileSlug(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'ecu-bench-export'
  );
}

function escapeCsvCell(value: unknown): string {
  const raw = String(value ?? '');
  const formulaSafe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(formulaSafe)) {
    return `"${formulaSafe.replace(/"/g, '""')}"`;
  }
  return formulaSafe;
}

function triggerLocalDownload(filename: string, content: string, mimeType: string): void {
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

export const GoogleWorkspaceModal: React.FC<GoogleWorkspaceModalProps> = ({
  isOpen,
  initialTab = 'DRIVE',
  onClose,
  powerSupply,
  pins,
  components,
  wires,
  faults,
  multimeter,
  circuitSolution,
  selectedBrandKey,
  selectedModelName,
  selectedEcuProfileId,
  rpmEmulator,
  gaugeMonitor,
  checkedWorkflowIds = [],
  preBenchGateLocked,
  voiceMacros = [],
  onLoadBenchSnapshot,
}) => {
  const { canUseExports, openAccessModal } = useTrialAccess();
  const [activeTab, setActiveTab] = useState<LocalExportTab>(() =>
    mapLegacyInitialTab(initialTab)
  );
  const [exportTitle, setExportTitle] = useState(
    () => `ECU Bench Export - ${new Date().toISOString().slice(0, 10)}`
  );
  const [techNotes, setTechNotes] = useState('');
  const [importedSnapshot, setImportedSnapshot] = useState<DriveBenchSnapshot | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(mapLegacyInitialTab(initialTab));
      setBanner(null);
    }
  }, [isOpen, initialTab]);

  const ecuProfileLabel = useMemo(() => {
    const parts = [selectedBrandKey, selectedModelName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Universal ECU Bench';
  }, [selectedBrandKey, selectedModelName]);

  const liveSnapshot = useMemo(
    () =>
      buildDriveBenchSnapshot({
        title: exportTitle,
        ecuProfileLabel,
        selectedBrandKey,
        selectedModelName,
        selectedEcuProfileId,
        powerSupply,
        wires,
        faults,
        components,
        rpmEmulator,
        gaugeMonitor,
        multimeter,
        activeDtcs: circuitSolution.activeDTCs.map((d) => d.code),
        supplyCurrentDrawAmps: circuitSolution.supplyCurrentDrawAmps,
        workflowCheckedIds: checkedWorkflowIds,
        preBenchGateLocked,
        voiceMacros,
      }),
    [
      exportTitle,
      ecuProfileLabel,
      selectedBrandKey,
      selectedModelName,
      selectedEcuProfileId,
      powerSupply,
      wires,
      faults,
      components,
      rpmEmulator,
      gaugeMonitor,
      multimeter,
      circuitSolution,
      checkedWorkflowIds,
      preBenchGateLocked,
      voiceMacros,
    ]
  );

  const snapshotJson = useMemo(() => JSON.stringify(liveSnapshot, null, 2), [liveSnapshot]);

  const pinoutMatrixCsv = useMemo(() => {
    const activeFaults = faults.filter((f) => f.faultType !== 'NONE');
    const header = [
      'Pin Number',
      'Pin ID',
      'Label',
      'Signal Name',
      'Category',
      'Measured Voltage (V)',
      'Nominal Voltage (V)',
      'Status',
      'PSU State',
      'PSU Voltage Setting (V)',
      'Total Bench Draw (A)',
    ];
    const rows = pins.map((pin) => {
      const v = circuitSolution.nodeVoltages[pin.id];
      const pinFault = activeFaults.find((f) => f.pinId === pin.id);
      const status = pinFault
        ? pinFault.faultType
        : powerSupply.isOutputEnabled
          ? 'NOMINAL'
          : 'STANDBY';
      return [
        pin.pinNumber,
        pin.id,
        pin.label,
        pin.name,
        pin.category,
        Number.isFinite(v) ? v.toFixed(3) : '0.000',
        pin.nominalVoltage.toFixed(2),
        status,
        powerSupply.isOutputEnabled ? 'ON' : 'OFF',
        powerSupply.voltageSetting.toFixed(2),
        circuitSolution.supplyCurrentDrawAmps.toFixed(3),
      ];
    });
    return [header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  }, [pins, faults, circuitSolution, powerSupply]);

  const diagnosticReportTxt = useMemo(
    () =>
      buildBenchReportText({
        ecuProfileLabel,
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

  const repairChecklistMd = useMemo(() => {
    const activeFaults = faults.filter((f) => f.faultType !== 'NONE');
    const lines = [
      `# ECU Repair & Verification Checklist — ${exportTitle.trim() || ecuProfileLabel}`,
      '',
      `- **Generated At:** ${new Date().toISOString()}`,
      `- **Vehicle / ECU Profile:** ${ecuProfileLabel}`,
      `- **Simulated Bench PSU:** ${powerSupply.isOutputEnabled ? 'ENABLED' : 'STANDBY'} (${powerSupply.voltageSetting.toFixed(2)}V / ${circuitSolution.supplyCurrentDrawAmps.toFixed(3)}A)`,
      `- **Completed Workflow Steps:** ${checkedWorkflowIds.length}`,
      '',
      '## Active Diagnostic Trouble Codes (DTCs)',
      ...(circuitSolution.activeDTCs.length > 0
        ? circuitSolution.activeDTCs.map(
            (dtc) => `- [ ] **${dtc.code}** (${dtc.severity}) — ${dtc.description}`
          )
        : ['- [x] No active simulated DTCs detected on current bench configuration.']),
      '',
      '## Active Injected Bench Faults',
      ...(activeFaults.length > 0
        ? activeFaults.map(
            (fault) => `- [ ] **${fault.pinId}** (${fault.faultType}) — ${fault.description}`
          )
        : ['- [x] No active faults injected.']),
      '',
      '## Bench Verification Sign-Off',
      '- [ ] Confirm KL30 / KL15 supply rails and KL31 ground integrity under load',
      '- [ ] Verify 5V sensor reference stability across all sensor branches',
      '- [ ] Confirm CAN-H / CAN-L bus bias voltages (~2.5V idle) and termination resistance',
      '- [ ] Re-verify post-repair waveform capture and clear stored fault codes',
    ];

    if (voiceMacros.length > 0) {
      lines.push(
        '',
        '## Saved Bench Macros',
        ...voiceMacros.map(
          (macro) => `- **${macro.name}** (${macro.steps.length} steps): ${macro.description}`
        )
      );
    }

    if (techNotes.trim()) {
      lines.push('', '## Technician Notes', techNotes.trim());
    }

    return lines.join('\n');
  }, [
    exportTitle,
    ecuProfileLabel,
    powerSupply,
    circuitSolution,
    faults,
    checkedWorkflowIds,
    voiceMacros,
    techNotes,
  ]);

  if (!isOpen) return null;

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setBanner({ type: 'success', text: `Copied ${label} to clipboard.` });
    } catch {
      setBanner({
        type: 'error',
        text: `Clipboard copy was blocked by the browser. Use Download instead.`,
      });
    }
  };

  const handleImportSnapshotFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setBanner({ type: 'error', text: 'Snapshot file exceeds the 5 MB safety limit.' });
      return;
    }
    try {
      const rawText = await file.text();
      const parsed = parseDriveBenchSnapshot(rawText);
      if (!parsed) {
        setBanner({
          type: 'error',
          text: 'Invalid ECU bench snapshot JSON. Select a file exported by AutoElectric Lab Pro.',
        });
        return;
      }
      setImportedSnapshot(parsed);
      setBanner({
        type: 'success',
        text: `Parsed local snapshot "${parsed.title}" (${parsed.wires.length} wires, ${parsed.faults.length} faults). Click "Apply Snapshot to Bench" to load it.`,
      });
    } catch {
      setBanner({ type: 'error', text: 'Unable to read selected snapshot file.' });
    }
  };

  const handleApplyImportedSnapshot = () => {
    if (!importedSnapshot || !onLoadBenchSnapshot) return;
    onLoadBenchSnapshot(importedSnapshot);
    setBanner({
      type: 'success',
      text: `Loaded bench snapshot "${importedSnapshot.title}" into the live workbench.`,
    });
    setImportedSnapshot(null);
  };

  const tabs: Array<{
    id: LocalExportTab;
    label: string;
    ext: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'SNAPSHOT', label: 'Bench Snapshot', ext: '.JSON', icon: FileJson },
    { id: 'PINOUT_CSV', label: 'Pinout Matrix', ext: '.CSV', icon: FileSpreadsheet },
    { id: 'REPORT_TXT', label: 'Diagnostic Report', ext: '.TXT', icon: FileText },
    { id: 'CHECKLIST_MD', label: 'Repair Checklist', ext: '.MD', icon: CheckSquare },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="relative flex flex-col w-full max-w-5xl max-h-[92vh] bg-slate-900 border border-sky-500/30 rounded-xl shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-400 shrink-0">
              <FolderDown className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                Local Bench Export Hub
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Download &amp; restore JSON bench snapshots, CSV pinout matrices, TXT reports, and
                Markdown checklists locally
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300">
              <CheckCircle2 className="w-3 h-3" />
              Offline-Ready Exports
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              aria-label="Close Bench Export Hub"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Banner */}
        {banner && (
          <div
            className={`px-5 py-2.5 text-xs flex items-center justify-between gap-2 border-b ${
              banner.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-700/40 text-emerald-200'
                : 'bg-rose-950/70 border-rose-700/40 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {banner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{banner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
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
              Bench Export Hub Requires an Active PIN
            </h3>
            <p className="text-xs text-slate-400 max-w-md mb-5 leading-relaxed">
              Your 3–6 hour trial PIN session has expired or is currently locked. Local bench
              simulation stays open; enter an active 8-digit Trial PIN or Master Admin PIN to unlock
              local bench exports.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                openAccessModal({
                  tab: 'TRIAL_PIN',
                  notice:
                    'Enter an active 8-digit Trial PIN or Master Admin PIN to unlock local bench exports.',
                });
              }}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer"
            >
              Enter 8-Digit Trial PIN
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tab Bar */}
            <div className="flex flex-wrap items-center gap-1.5 px-4 sm:px-5 py-2.5 bg-slate-950/70 border-b border-slate-800">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setBanner(null);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      isActive
                        ? 'bg-sky-600 text-white border border-sky-400/50'
                        : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                    <span className="font-mono text-[10px] opacity-80">{tab.ext}</span>
                  </button>
                );
              })}
            </div>

            {/* Export Controls & Preview */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Export File Title
                  </label>
                  <input
                    type="text"
                    value={exportTitle}
                    onChange={(e) => setExportTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Optional Technician Notes
                  </label>
                  <input
                    type="text"
                    value={techNotes}
                    onChange={(e) => setTechNotes(e.target.value)}
                    placeholder="Add bench findings or test notes..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {activeTab === 'SNAPSHOT' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const filename = `${sanitizeFileSlug(exportTitle)}.json`;
                        triggerLocalDownload(filename, snapshotJson, 'application/json');
                        setBanner({
                          type: 'success',
                          text: `Downloaded local bench snapshot "${filename}".`,
                        });
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Bench Snapshot (.JSON)
                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleImportSnapshotFile}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Import Local Snapshot (.JSON)
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopy(snapshotJson, 'Bench Snapshot JSON')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy JSON
                    </button>
                  </div>

                  {importedSnapshot && (
                    <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs">
                        <div className="font-semibold text-emerald-200">
                          Ready to Load: {importedSnapshot.title}
                        </div>
                        <div className="text-[11px] text-emerald-300/80">
                          {importedSnapshot.ecuProfileLabel} · {importedSnapshot.wires.length} wires
                          · {importedSnapshot.faults.length} faults ·{' '}
                          {importedSnapshot.powerSupply.voltageSetting.toFixed(1)}V PSU
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleApplyImportedSnapshot}
                          disabled={!onLoadBenchSnapshot}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-bold transition cursor-pointer"
                        >
                          Apply Snapshot to Bench
                        </button>
                        <button
                          type="button"
                          onClick={() => setImportedSnapshot(null)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-slate-800 bg-slate-950/90 overflow-hidden">
                    <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900/90 border-b border-slate-800">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">
                        Live Bench JSON Snapshot Preview
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {wires.length} wires · {faults.length} faults · {components.length}{' '}
                        components
                      </span>
                    </div>
                    <pre className="p-3.5 text-[11px] font-mono text-slate-300 leading-relaxed overflow-x-auto max-h-72 overflow-y-auto">
                      {snapshotJson}
                    </pre>
                  </div>
                </div>
              )}

              {activeTab === 'PINOUT_CSV' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const filename = `${sanitizeFileSlug(exportTitle)}-pinouts.csv`;
                        triggerLocalDownload(filename, pinoutMatrixCsv, 'text/csv');
                        setBanner({
                          type: 'success',
                          text: `Downloaded live MNA pinout matrix "${filename}".`,
                        });
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Pinout Matrix (.CSV)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(pinoutMatrixCsv, 'Pinout Matrix CSV')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy CSV
                    </button>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/90 overflow-x-auto max-h-80 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-[11px] font-mono">
                      <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="px-3 py-2">Pin</th>
                          <th className="px-3 py-2">Label</th>
                          <th className="px-3 py-2">Signal Name</th>
                          <th className="px-3 py-2 text-right">Voltage (V)</th>
                          <th className="px-3 py-2 text-right">Nominal (V)</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {pins.map((pin) => {
                          const v = circuitSolution.nodeVoltages[pin.id];
                          const pinFault = faults.find(
                            (f) => f.pinId === pin.id && f.faultType !== 'NONE'
                          );
                          const status = pinFault
                            ? pinFault.faultType
                            : powerSupply.isOutputEnabled
                              ? 'NOMINAL'
                              : 'STANDBY';
                          return (
                            <tr key={pin.id} className="hover:bg-slate-900/60">
                              <td className="px-3 py-1.5 text-sky-400 font-semibold">
                                #{pin.pinNumber}
                              </td>
                              <td className="px-3 py-1.5 text-white">{pin.label}</td>
                              <td className="px-3 py-1.5 text-slate-400">{pin.name}</td>
                              <td className="px-3 py-1.5 text-right text-emerald-300 tabular-nums">
                                {Number.isFinite(v) ? v.toFixed(3) : '0.000'}
                              </td>
                              <td className="px-3 py-1.5 text-right text-amber-300 tabular-nums">
                                {pin.nominalVoltage.toFixed(2)}
                              </td>
                              <td className="px-3 py-1.5 text-slate-300">{status}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'REPORT_TXT' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const filename = `${sanitizeFileSlug(exportTitle)}-report.txt`;
                        triggerLocalDownload(filename, diagnosticReportTxt, 'text/plain');
                        setBanner({
                          type: 'success',
                          text: `Downloaded diagnostic report "${filename}".`,
                        });
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Diagnostic Report (.TXT)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(diagnosticReportTxt, 'Diagnostic Report')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Report
                    </button>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/90 overflow-hidden">
                    <pre className="p-3.5 text-[11px] font-mono text-slate-300 leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto">
                      {diagnosticReportTxt}
                    </pre>
                  </div>
                </div>
              )}

              {activeTab === 'CHECKLIST_MD' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const filename = `${sanitizeFileSlug(exportTitle)}-checklist.md`;
                        triggerLocalDownload(filename, repairChecklistMd, 'text/markdown');
                        setBanner({
                          type: 'success',
                          text: `Downloaded repair checklist "${filename}".`,
                        });
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Repair Checklist (.MD)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(repairChecklistMd, 'Repair Checklist Markdown')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Markdown
                    </button>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/90 overflow-hidden">
                    <pre className="p-3.5 text-[11px] font-mono text-slate-300 leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto">
                      {repairChecklistMd}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
