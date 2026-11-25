/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Lock,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type { LabModule } from '../../data/academy/universityCurriculum';
import type { AcademyModuleProgressSnapshot } from '../../utils/academy/toleranceEvaluator';
import type { BilingualLang } from '../../types/aiAssistant';

interface GuidedLabStepCardProps {
  module: LabModule;
  progress: AcademyModuleProgressSnapshot;
  lang: BilingualLang;
  studentConclusion: string;
  onChangeConclusion: (val: string) => void;
  onOpenVerifiedPdfModal: () => void;
}

export const GuidedLabStepCard: React.FC<GuidedLabStepCardProps> = ({
  module,
  progress,
  lang,
  studentConclusion,
  onChangeConclusion,
  onOpenVerifiedPdfModal,
}) => {
  return (
    <div
      data-testid="guided-lab-step-card"
      className="rounded-xl border border-cyan-500/40 bg-[#081122] p-4 space-y-3 text-slate-100"
    >
      {/* Module Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
        <div>
          <span className="font-mono text-[10px] font-bold text-cyan-300 uppercase">
            {module.exerciseCode} · {module.targetUnit}
          </span>
          <h3 className="font-hud text-sm font-bold text-slate-100">{module.titleTaglish}</h3>
        </div>
        <span className="px-2 py-0.5 rounded border border-cyan-500/40 bg-cyan-950/60 font-mono text-[11px] text-cyan-200 tabular-nums">
          {progress.completedCount}/{progress.totalSteps}{' '}
          {lang === 'TL' ? 'Steps Verified' : 'Steps Verified'}
        </span>
      </div>

      {/* Live Read-Only Step Evaluations */}
      <div className="space-y-2.5">
        {module.steps.map((step) => {
          const ev = progress.stepResults.find((r) => r.stepId === step.id);
          const status = ev?.status || 'WAITING';

          return (
            <article
              key={step.id}
              data-step-status={status}
              className={`rounded-lg border p-3 space-y-2 ${
                status === 'SAFETY_BLOCKED'
                  ? 'border-rose-500/70 bg-rose-950/40'
                  : status === 'PASSED'
                    ? 'border-emerald-500/50 bg-emerald-950/25'
                    : status === 'FAILED'
                      ? 'border-amber-500/50 bg-amber-950/25'
                      : 'border-slate-800 bg-slate-900/70'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-hud text-xs font-bold text-slate-100">
                  Step {step.stepNumber}: {step.titleTaglish}
                </span>

                {status === 'PASSED' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/50 font-mono text-[10px] font-bold text-emerald-200">
                    <CheckCircle2 className="w-3 h-3" /> PASSED
                  </span>
                )}
                {status === 'FAILED' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 font-mono text-[10px] font-bold text-amber-200">
                    <XCircle className="w-3 h-3" /> FAILED
                  </span>
                )}
                {status === 'SAFETY_BLOCKED' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/25 border border-rose-500/70 font-mono text-[10px] font-bold text-rose-100">
                    <ShieldAlert className="w-3 h-3" /> SAFETY BLOCKED
                  </span>
                )}
                {status === 'WAITING' && (
                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-300">
                    WAITING
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{step.instructionTaglish}</p>

              {ev?.safetyBlocked && (
                <div className="rounded border border-rose-500/60 bg-rose-950/70 p-2 flex items-start gap-2 text-[11px] text-rose-100 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{lang === 'TL' ? ev.safetyWarningTaglish : ev.safetyWarningEnglish}</span>
                </div>
              )}

              {/* Anti-Cheating Read-Only Live Telemetry Values */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
                <div className="rounded border border-slate-800 bg-slate-950/90 px-2.5 py-1.5">
                  <span className="text-[9.5px] uppercase text-slate-400 block">
                    Expected Tolerance
                  </span>
                  <strong className="text-cyan-200">
                    {ev?.expectedToleranceDisplay || `${step.expectedReadingLabel} (${step.toleranceLabel})`}
                  </strong>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950/90 px-2.5 py-1.5">
                  <span className="text-[9.5px] uppercase text-slate-400 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5 text-amber-400" />
                    Auto-Populated MNA Reading (Read-Only)
                  </span>
                  <strong className="text-amber-300 tabular-nums">
                    {ev?.readOnlyMeasuredDisplay || '---'}
                  </strong>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Student Conclusion (Unlocks strictly once all measurement steps execute) */}
      <div className="pt-2 border-t border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor="academy-student-conclusion"
            className="font-mono text-[11px] font-semibold text-slate-200"
          >
            {lang === 'TL' ? 'Student Diagnostic Conclusion' : 'Student Diagnostic Conclusion'}
          </label>
          {!progress.conclusionUnlocked && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-amber-300">
              <Lock className="w-3 h-3" />
              {lang === 'TL'
                ? 'Tapusin muna ang lahat ng steps'
                : 'Complete all measurement steps to unlock'}
            </span>
          )}
        </div>

        <textarea
          id="academy-student-conclusion"
          value={studentConclusion}
          onChange={(e) => onChangeConclusion(e.target.value)}
          disabled={!progress.conclusionUnlocked}
          rows={3}
          placeholder={
            progress.conclusionUnlocked
              ? lang === 'TL'
                ? 'Isulat ang iyong konklusyon batay sa MNA readings at fault isolation...'
                : 'Summarize your diagnostic finding based on verified MNA readings...'
              : lang === 'TL'
                ? 'Naka-lock hanggang makumpleto ang lahat ng bench measurements.'
                : 'Locked until all bench measurement steps are verified.'
          }
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 disabled:opacity-50 focus:border-cyan-400 focus:outline-none"
        />

        <button
          type="button"
          disabled={!progress.conclusionUnlocked}
          onClick={onOpenVerifiedPdfModal}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-emerald-500/70 bg-emerald-600/25 hover:bg-emerald-500/35 disabled:opacity-45 text-emerald-100 font-mono text-xs font-semibold cursor-pointer"
        >
          <FileCheck2 className="w-4 h-4" />
          <span>
            {lang === 'TL'
              ? 'Export Tamper-Proof SHA-256 Exam PDF'
              : 'Export Tamper-Proof SHA-256 Exam PDF'}
          </span>
        </button>
      </div>
    </div>
  );
};
