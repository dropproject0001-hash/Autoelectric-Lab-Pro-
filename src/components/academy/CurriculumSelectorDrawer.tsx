/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React from 'react';
import {
  BookOpen,
  Cpu,
  GraduationCap,
  Play,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  ACADEMY_CURRICULUM_MODULES,
  ACADEMY_TRAINING_LEVELS,
  type LabModule,
} from '../../data/academy/universityCurriculum';
import type { BilingualLang } from '../../types/aiAssistant';

interface CurriculumSelectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  lang: BilingualLang;
  activeModuleId: string | null;
  onStartLabExercise: (module: LabModule) => void;
  onOpenInstructorVerifier?: () => void;
}

export const CurriculumSelectorDrawer: React.FC<CurriculumSelectorDrawerProps> = ({
  isOpen,
  onClose,
  lang,
  activeModuleId,
  onStartLabExercise,
  onOpenInstructorVerifier,
}) => {
  if (!isOpen) return null;

  return (
    <div
      data-testid="curriculum-selector-drawer"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="University 3-Tier Curriculum Selector"
    >
      <div className="w-full max-w-6xl max-h-[90dvh] rounded-xl border border-cyan-500/40 bg-[#070E1B] shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0B1528] gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg border border-cyan-500/50 bg-cyan-950/60 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <h2 className="font-hud text-sm sm:text-base font-bold tracking-wide text-slate-100 truncate">
                {lang === 'TL'
                  ? 'University Automotive Lab — 3-Tier Curriculum Matrix'
                  : 'University Automotive Lab — 3-Tier Curriculum Matrix'}
              </h2>
              <p className="font-mono text-[10.5px] text-slate-400 truncate">
                {lang === 'TL'
                  ? 'Verified MNA Physics · Cold-Check Safety Order · Anti-Cheating SHA-256 Exam PDF'
                  : 'Verified MNA Physics · Cold-Check Safety Order · Anti-Cheating SHA-256 Exam PDF'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenInstructorVerifier && (
              <button
                type="button"
                onClick={onOpenInstructorVerifier}
                className="hw-btn hw-btn-amber px-2.5 py-1.5 rounded-md font-mono text-[11px] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{lang === 'TL' ? 'Instructor QR Verifier' : 'Instructor QR Verifier'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer"
              aria-label="Close Curriculum Selector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3-Column Difficulty Selector Grid */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {ACADEMY_TRAINING_LEVELS.map((tier) => {
            const tierModules = ACADEMY_CURRICULUM_MODULES.filter((m) => m.level === tier.id);
            const accentBorder =
              tier.accentTone === 'emerald'
                ? 'border-emerald-500/45 bg-emerald-950/15'
                : tier.accentTone === 'amber'
                  ? 'border-amber-500/45 bg-amber-950/15'
                  : 'border-rose-500/45 bg-rose-950/15';
            const badgeClass =
              tier.accentTone === 'emerald'
                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/50'
                : tier.accentTone === 'amber'
                  ? 'bg-amber-500/20 text-amber-200 border-amber-500/50'
                  : 'bg-rose-500/20 text-rose-200 border-rose-500/50';

            return (
              <section
                key={tier.id}
                data-tier-column={tier.id}
                className={`rounded-xl border p-3 flex flex-col gap-3 ${accentBorder}`}
              >
                <div className="space-y-1 border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2 py-0.5 rounded border font-mono text-[10px] font-bold uppercase ${badgeClass}`}
                    >
                      {tier.shortLabel}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {tierModules.length} Modules
                    </span>
                  </div>
                  <h3 className="font-hud text-sm font-bold text-slate-100">
                    {tier.titleTaglish}
                  </h3>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    {tier.subtitleTaglish}
                  </p>
                </div>

                <div className="space-y-2.5">
                  {tierModules.map((mod) => {
                    const isActive = activeModuleId === mod.id;
                    return (
                      <article
                        key={mod.id}
                        className={`rounded-lg border p-3 space-y-2 transition-colors ${
                          isActive
                            ? 'border-cyan-400 bg-cyan-950/35'
                            : 'border-slate-800 bg-slate-900/75 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] font-bold text-cyan-300">
                            {mod.exerciseCode}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-700 bg-slate-950 font-mono text-[9.5px] text-slate-300 truncate max-w-[170px]">
                            <Cpu className="w-3 h-3 text-cyan-400 shrink-0" />
                            <span className="truncate">{mod.targetUnit}</span>
                          </span>
                        </div>

                        <h4 className="font-hud text-xs font-bold text-slate-100 leading-snug">
                          {mod.titleTaglish}
                        </h4>
                        <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                          {mod.objectiveTaglish}
                        </p>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="font-mono text-[10px] text-slate-400 inline-flex items-center gap-1">
                            <BookOpen className="w-3 h-3" />
                            {mod.steps.length} steps
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              onStartLabExercise(mod);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-cyan-500/70 bg-cyan-600/25 hover:bg-cyan-500/35 text-cyan-100 font-mono text-[10.5px] font-semibold cursor-pointer"
                          >
                            <Play className="w-3 h-3" />
                            <span>
                              {lang === 'TL' ? 'Start Lab Exercise' : 'Start Lab Exercise'}
                            </span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};
