/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  ExternalLink,
  Lightbulb,
  Search,
  ShieldAlert,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  getAllEcuPcbComponents,
  identifyPcbComponentFromVisualScan,
  type VisualComponentIdentificationMatch,
} from '../../services/ecuPcbComponentKnowledgeService';
import type { DetailedPcbComponent } from './pcbScannerTypes';

interface PcbComponentScannerPanelProps {
  selectedComponent?: DetailedPcbComponent;
  onOpenOfflineBot?: (prompt?: string) => void;
}

const QUICK_MARKING_CHIPS = [
  'TJA1050',
  'TLE6240GP',
  'ISL9V5036P3',
  'TLE4275G',
  'L9637D',
  '93C56',
  'SMBJ18A',
  'R5F72531',
];

export const PcbComponentScannerPanel: React.FC<PcbComponentScannerPanelProps> = ({
  selectedComponent,
  onOpenOfflineBot,
}) => {
  const [manualMarking, setManualMarking] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState(true);

  const matches: VisualComponentIdentificationMatch[] = useMemo(() => {
    if (manualMarking.trim().length >= 2) {
      return identifyPcbComponentFromVisualScan({
        markingText: manualMarking.trim(),
        notes: manualMarking.trim(),
      });
    }
    if (selectedComponent) {
      return identifyPcbComponentFromVisualScan({
        refDes: selectedComponent.refDes,
        partNumber: selectedComponent.marking || selectedComponent.decodedValue,
        markingText: `${selectedComponent.marking || ''} ${selectedComponent.decodedValue || ''}`.trim(),
        label: selectedComponent.circuitFunction,
        category: selectedComponent.category,
        packageType: selectedComponent.packageType,
        notes: selectedComponent.notes,
      });
    }
    return [];
  }, [manualMarking, selectedComponent]);

  useEffect(() => {
    setSelectedMatchId(matches[0]?.component.id ?? null);
  }, [matches]);

  const activeMatch = useMemo(() => {
    if (!matches.length) return null;
    return matches.find((m) => m.component.id === selectedMatchId) || matches[0];
  }, [matches, selectedMatchId]);

  const activeComp = activeMatch?.component ?? null;
  const totalCatalogCount = getAllEcuPcbComponents().length;

  const toggleStep = (compId: string, stepNum: number) => {
    const key = `${compId}:${stepNum}`;
    setCompletedSteps((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const completedCount = activeComp
    ? activeComp.guidedRepairSteps.filter((s) => completedSteps[`${activeComp.id}:${s.stepNumber}`])
        .length
    : 0;

  return (
    <div className="rounded-xl border border-cyan-500/35 bg-slate-950/90 p-3 shadow-lg shadow-cyan-950/20">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-cyan-400" />
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
              ECU Component Scanner & Guided Repair
            </div>
            <div className="text-[10px] text-slate-400">
              {totalCatalogCount} OEM ECU ICs & Parts • Visual Scan Match + Pro Tips
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-md border border-slate-700 bg-slate-900 p-1 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300"
          title={expanded ? 'Collapse component scanner' : 'Expand component scanner'}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-2.5 space-y-2.5">
          {/* Manual IC Marking / Silkscreen Scanner Input */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={manualMarking}
              onChange={(e) => setManualMarking(e.target.value)}
              placeholder={
                selectedComponent
                  ? `Auto-matched ${selectedComponent.refDes} — or type IC marking (e.g. TJA1050, 30402)`
                  : 'Scan/type IC marking, part #, or DTC (e.g. TJA1050, ISL9V5036, P0351)'
              }
              className="w-full rounded-lg border border-slate-700/80 bg-slate-900/90 py-1.5 pl-8 pr-2.5 text-[11px] text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {/* Quick IC Chips */}
          <div className="flex flex-wrap gap-1">
            {QUICK_MARKING_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setManualMarking(chip)}
                className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] transition ${
                  manualMarking.toUpperCase() === chip.toUpperCase()
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                    : 'border-slate-700/80 bg-slate-900/70 text-slate-400 hover:border-cyan-500/40 hover:text-slate-200'
                }`}
              >
                {chip}
              </button>
            ))}
            {manualMarking && (
              <button
                type="button"
                onClick={() => setManualMarking('')}
                className="rounded-md border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-500/20"
              >
                Clear
              </button>
            )}
          </div>

          {/* Candidate selector when multiple parts match */}
          {matches.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {matches.slice(0, 4).map((m) => (
                <button
                  key={m.component.id}
                  type="button"
                  onClick={() => setSelectedMatchId(m.component.id)}
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                    activeComp?.id === m.component.id
                      ? 'border-emerald-400/70 bg-emerald-500/15 text-emerald-200'
                      : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m.component.partNumber} ({Math.round(m.matchConfidence * 100)}%)
                </button>
              ))}
            </div>
          )}

          {!activeComp ? (
            <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/50 p-2.5 text-[11px] text-slate-400">
              Click any visually scanned component on the PCB board or type its laser marking above
              to load full datasheet specs, cross-references, technician pro tips, and step-by-step
              guided repair.
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* Component Identity Header */}
              <div className="rounded-lg border border-slate-700/80 bg-slate-900/80 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-xs font-bold text-cyan-200">
                      {activeComp.partNumber}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {activeComp.manufacturer} • {activeComp.packageType} ({activeComp.pinCount}-pin)
                    </div>
                  </div>
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-300">
                    {Math.round((activeMatch?.matchConfidence || 0.8) * 100)}% Match
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-cyan-400/90">{activeMatch?.matchReason}</div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-200">
                  {activeComp.functionalSummary}
                </p>

                {activeComp.crossReferences.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px]">
                    <span className="font-semibold text-slate-400">Cross-Ref:</span>
                    {activeComp.crossReferences.map((xr) => (
                      <span
                        key={xr}
                        className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[9px] text-slate-300"
                      >
                        {xr}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Electrical Bench Specs */}
              <div className="rounded-lg border border-slate-700/80 bg-slate-900/70 p-2.5 text-[11px]">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-300">
                  <Zap className="h-3.5 w-3.5" />
                  Bench Electrical & Diode Checks
                </div>
                <div className="space-y-1 text-slate-300">
                  <div>
                    <span className="font-semibold text-slate-400">Supply:</span>{' '}
                    {activeComp.electricalBenchSpecs.supplyVoltage}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-400">Diode/Ohms:</span>{' '}
                    {activeComp.electricalBenchSpecs.diodeOrResistanceCheck}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-400">Thermal:</span>{' '}
                    {activeComp.electricalBenchSpecs.thermalNote}
                  </div>
                </div>
              </div>

              {/* Visual & Fault Signatures */}
              <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-2.5 text-[11px]">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Visual Damage Clues & Fault Modes
                </div>
                <ul className="list-disc space-y-0.5 pl-4 text-slate-200">
                  {activeComp.visualAndFaultSignatures.visualInspectionClues.map((clue, idx) => (
                    <li key={idx}>{clue}</li>
                  ))}
                  {activeComp.visualAndFaultSignatures.commonFailureModes.map((mode, idx) => (
                    <li key={`fm-${idx}`} className="text-rose-200/90">
                      {mode}
                    </li>
                  ))}
                </ul>
                {activeComp.visualAndFaultSignatures.associatedDtcs.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {activeComp.visualAndFaultSignatures.associatedDtcs.map((dtc) => (
                      <span
                        key={dtc}
                        className="rounded border border-rose-500/40 bg-rose-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-rose-200"
                      >
                        {dtc}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Technician Pro Tips */}
              {activeComp.technicianProTips.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-950/25 p-2.5 text-[11px]">
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                    <Lightbulb className="h-3.5 w-3.5" />
                    Technician Pro Tips
                  </div>
                  <ul className="space-y-1 text-amber-100/95">
                    {activeComp.technicianProTips.map((tip, idx) => (
                      <li key={idx} className="leading-snug">
                        • {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Fully Guided Step-by-Step Repair Checklist */}
              <div className="rounded-lg border border-emerald-500/35 bg-emerald-950/20 p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    <Wrench className="h-3.5 w-3.5" />
                    Guided Repair Procedure
                  </div>
                  <span className="font-mono text-[10px] text-emerald-300">
                    {completedCount}/{activeComp.guidedRepairSteps.length} Done
                  </span>
                </div>
                <div className="space-y-1.5">
                  {activeComp.guidedRepairSteps.map((step) => {
                    const checked = Boolean(completedSteps[`${activeComp.id}:${step.stepNumber}`]);
                    return (
                      <button
                        key={step.stepNumber}
                        type="button"
                        onClick={() => toggleStep(activeComp.id, step.stepNumber)}
                        className={`w-full rounded-md border p-2 text-left transition ${
                          checked
                            ? 'border-emerald-500/60 bg-emerald-500/15'
                            : 'border-slate-700/80 bg-slate-950/70 hover:border-emerald-500/40'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <CheckCircle2
                            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                              checked ? 'text-emerald-400' : 'text-slate-600'
                            }`}
                          />
                          <div className="min-w-0 flex-1 text-[11px]">
                            <div className="font-semibold text-slate-100">
                              Step {step.stepNumber}: {step.title}
                            </div>
                            <div className="mt-0.5 text-slate-300">{step.action}</div>
                            <div className="mt-0.5 font-mono text-[10px] text-emerald-300">
                              Target: {step.targetSpec}
                            </div>
                            {step.safetyNote && (
                              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-300">
                                <ShieldAlert className="h-3 w-3 shrink-0" />
                                {step.safetyNote}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer Actions: Ask Local AI / Official Datasheet Reference */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[10px]">
                <a
                  href={activeComp.provenance.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {activeComp.provenance.sourceSite} Reference
                </a>
                {onOpenOfflineBot && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenOfflineBot(
                        `Explain bench testing and guided repair for ECU PCB component ${activeComp.partNumber} (${activeComp.packageType})`
                      )
                    }
                    className="rounded-md border border-cyan-500/40 bg-cyan-500/15 px-2 py-0.5 font-semibold text-cyan-200 hover:bg-cyan-500/25"
                  >
                    Ask Local AI Coach
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
