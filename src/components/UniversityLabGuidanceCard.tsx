import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crosshair,
  FileCheck2,
  GraduationCap,
  Lock,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  evaluateUniversityLabModule,
  getUniversityTierMeta,
  type CapturedLabStepEvidence,
  type LabGuidanceStep,
  type LabStepLiveEvaluation,
  type LiveBenchEvaluationInput,
  type UniversityLabModule,
} from '../data/universityLabCurriculum';

export interface UniversityLabGuidanceCardProps {
  module: UniversityLabModule;
  liveBench: LiveBenchEvaluationInput;
  capturedByStepId: Record<string, CapturedLabStepEvidence>;
  onCaptureStep: (step: LabGuidanceStep, evaluation: LabStepLiveEvaluation) => void;
  onFocusProbePin: (pinId: string, label: string, openScope?: boolean) => void;
  onOpenVerifiedPdfExport: (tab?: 'EXPORT' | 'VERIFY') => void;
  onExitModule: () => void;
}

export const UniversityLabGuidanceCard: React.FC<UniversityLabGuidanceCardProps> = ({
  module,
  liveBench,
  capturedByStepId,
  onCaptureStep,
  onFocusProbePin,
  onOpenVerifiedPdfExport,
  onExitModule,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const tierMeta = useMemo(() => getUniversityTierMeta(module.tier), [module.tier]);
  const evaluations = useMemo(
    () => evaluateUniversityLabModule(module, liveBench),
    [module, liveBench]
  );

  const capturedCount = useMemo(
    () => module.steps.filter((s) => Boolean(capturedByStepId[s.id])).length,
    [module.steps, capturedByStepId]
  );

  const tierAccentClass =
    tierMeta.accentTone === 'emerald'
      ? 'text-emerald-400'
      : tierMeta.accentTone === 'amber'
        ? 'text-amber-400'
        : 'text-rose-400';

  return (
    <section
      aria-label="University Lab Step-by-Step Guidance Card"
      className="shrink-0 rounded-xl border border-[#203653] bg-[#0a1220] text-[#eaf3ff]"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#203653] bg-[#0e192a] px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#91a4bd]">
            <GraduationCap className={`h-3.5 w-3.5 shrink-0 ${tierAccentClass}`} aria-hidden="true" />
            <span className={`font-semibold ${tierAccentClass}`}>{tierMeta.titleTaglish}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono font-semibold text-[#eaf3ff]">{module.exerciseCode}</span>
            {module.dtcCodes.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-amber-300">DTC {module.dtcCodes.join(', ')}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-cyan-300">
              {capturedCount}/{module.steps.length} Steps Captured
            </span>
          </div>
          <h3 className="mt-0.5 truncate text-sm font-semibold text-[#eaf3ff]">
            {module.titleTaglish}
          </h3>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpenVerifiedPdfExport('EXPORT')}
            className="hw-btn hw-btn-amber inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[11px] font-bold text-amber-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileCheck2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Export Verified Lab PDF</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenVerifiedPdfExport('VERIFY')}
            className="hw-btn inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-cyan-200 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Offline Verifier</span>
          </button>
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Palawakin ang lab guidance' : 'Itupi ang lab guidance'}
            className="hw-btn inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-[#91a4bd] hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Show Steps</span>
              </>
            ) : (
              <>
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Hide</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onExitModule}
            aria-label="Isara ang University Lab module"
            className="hw-btn inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg text-[#91a4bd] hover:text-white cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Collapsible Step-by-Step Interactive Guidance Body */}
      {!isCollapsed && (
        <div className="max-h-[270px] overflow-y-auto p-3.5 space-y-2.5">
          {/* Target Unit & Taglish Objective */}
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-[#91a4bd]">
            <div>
              <span className="font-semibold text-[#eaf3ff]">Target Unit:</span> {module.targetUnit}
              <span className="mx-2" aria-hidden="true">·</span>
              <span className="font-semibold text-[#eaf3ff]">Layunin:</span> {module.objectiveTaglish}
            </div>
            <span className="font-mono text-[10.5px] text-slate-400">
              Simulated Bench MNA Auto-Grade
            </span>
          </div>

          {/* Interactive Step Rows */}
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
            {module.steps.map((step, idx) => {
              const evalResult = evaluations[idx];
              const captured = capturedByStepId[step.id];

              const statusVisual =
                evalResult.status === 'PASSED'
                  ? {
                      text: 'PASSED',
                      color: 'text-emerald-300',
                      border: 'border-emerald-500/40 bg-[#082119]/45',
                      icon: <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />,
                    }
                  : evalResult.status === 'FAULT_CONFIRMED'
                    ? {
                        text: 'FAULT CONFIRMED',
                        color: 'text-amber-300',
                        border: 'border-amber-500/45 bg-[#261a08]/45',
                        icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />,
                      }
                    : evalResult.status === 'OUT_OF_RANGE'
                      ? {
                          text: 'OUT OF TOLERANCE',
                          color: 'text-rose-300',
                          border: 'border-rose-500/45 bg-[#290c16]/45',
                          icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden="true" />,
                        }
                      : {
                          text: 'WAITING SETUP',
                          color: 'text-slate-300',
                          border: 'border-[#203653] bg-[#0e1726]',
                          icon: <Crosshair className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />,
                        };

              const canCapture =
                evalResult.setupReady &&
                !evalResult.hasDmmWarning &&
                (evalResult.status === 'PASSED' ||
                  evalResult.status === 'FAULT_CONFIRMED' ||
                  evalResult.status === 'OUT_OF_RANGE');

              return (
                <div
                  key={step.id}
                  className={`flex flex-col justify-between gap-2 rounded-lg border p-3 ${statusVisual.border}`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-mono text-[11.5px] font-bold text-[#eaf3ff] leading-snug">
                        {step.titleTaglish}
                      </h4>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 font-mono text-[10.5px] font-bold whitespace-nowrap ${statusVisual.color}`}
                      >
                        {statusVisual.icon}
                        <span>{statusVisual.text}</span>
                      </span>
                    </div>

                    <p className="text-[11.5px] leading-relaxed text-slate-300">
                      {step.instructionTaglish}
                    </p>

                    {/* Clean Unboxed Technical Metadata */}
                    <div className="space-y-0.5 border-t border-white/10 pt-1.5 font-mono text-[10.5px] text-slate-300 tabular-nums">
                      <div>
                        <span className="text-slate-400">DMM:</span> {step.dmmModeDisplay}
                        <span className="mx-1.5 text-slate-500" aria-hidden="true">·</span>
                        <span className="text-slate-400">PSU:</span>{' '}
                        <span className={evalResult.psuOk ? 'text-emerald-300' : 'text-amber-300'}>
                          {step.requiredPsuState} {evalResult.psuOk ? 'OK' : 'Check'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Probes:</span> Red (+) {step.redProbeLabel} → Black (-) {step.blackProbeLabel}
                      </div>
                      <div>
                        <span className="text-slate-400">Criteria:</span> {step.expectedReadingLabel}
                        <span className="mx-1.5 text-slate-500" aria-hidden="true">·</span>
                        <span className="text-slate-400">{step.toleranceLabel}</span>
                      </div>
                    </div>

                    {/* Live MNA Reading + Feedback */}
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-[#070d17] px-2.5 py-1.5 font-mono tabular-nums">
                      <span className="text-[10.5px] text-slate-400">Live DMM:</span>
                      <span className={`text-xs font-bold ${statusVisual.color}`}>
                        {evalResult.setupReady
                          ? `${evalResult.liveDisplay} ${evalResult.liveUnit}`
                          : 'I-setup ang probes/DMM'}
                      </span>
                    </div>

                    <p className="text-[11px] leading-snug text-slate-300">
                      {evalResult.feedbackTaglish}
                    </p>
                  </div>

                  {/* Step Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-white/10 pt-2">
                    <button
                      type="button"
                      onClick={() => onFocusProbePin(step.focusPinId, step.focusPinLabel, false)}
                      className="hw-btn inline-flex min-h-[30px] items-center gap-1 rounded-md px-2 py-1 font-mono text-[10.5px] text-cyan-200 hover:text-white whitespace-nowrap cursor-pointer"
                    >
                      <Crosshair className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>Focus {step.focusPinLabel}</span>
                    </button>

                    <button
                      type="button"
                      disabled={!canCapture}
                      onClick={() => onCaptureStep(step, evalResult)}
                      className={`inline-flex min-h-[30px] items-center gap-1 rounded-md border px-2.5 py-1 font-mono text-[10.5px] font-bold whitespace-nowrap transition-colors ${
                        captured
                          ? 'border-emerald-500/50 bg-emerald-950/60 text-emerald-200 cursor-pointer hover:bg-emerald-900/60'
                          : canCapture
                            ? 'border-amber-400/60 bg-amber-950/60 text-amber-100 cursor-pointer hover:bg-amber-900/60'
                            : 'border-slate-700 bg-slate-900/50 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>
                        {captured
                          ? `Locked (${captured.measuredDisplay} ${captured.measuredUnit})`
                          : 'Capture Reading'}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
