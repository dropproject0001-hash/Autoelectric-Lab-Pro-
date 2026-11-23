import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  Lock,
  PanelRightClose,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Square,
  Unlock,
  Zap,
} from 'lucide-react';
import type { EvaluatedWorkflowStep, WorkflowProgressSummary, WorkflowTelemetryStatus } from '../utils/diagnosticWorkflow';
import type { LabTab } from './LabTopNav';

type WorkflowFilter = 'ALL' | 'PRE_BENCH' | 'REMAINING';

export interface DiagnosticWorkflowPanelProps {
  steps: EvaluatedWorkflowStep[];
  progress: WorkflowProgressSummary;
  onToggleStep: (stepId: string) => void;
  onAutoVerifyPassing: () => void;
  onResetWorkflow: () => void;
  onSelectPin: (pinId: string) => void;
  onNavigateTab: (tab: LabTab) => void;
  onClose?: () => void;
  compactWidth?: boolean;
  isShortViewport?: boolean;
  headerSwitcher?: React.ReactNode;
  preBenchGateLocked?: boolean;
  preBenchGateBypassed?: boolean;
  onTogglePreBenchGate?: () => void;
  autoVerifyWorkflow?: boolean;
  onToggleAutoVerifyWorkflow?: () => void;
}

function renderTelemetryBadge(status: WorkflowTelemetryStatus) {
  switch (status) {
    case 'PASS':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-emerald-400">
          <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>Pass</span>
        </span>
      );
    case 'ATTENTION':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-amber-300">
          <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>Attention</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-slate-400">
          <Activity className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>Standby</span>
        </span>
      );
  }
}

export const DiagnosticWorkflowPanel: React.FC<DiagnosticWorkflowPanelProps> = ({
  steps,
  progress,
  onToggleStep,
  onAutoVerifyPassing,
  onResetWorkflow,
  onSelectPin,
  onNavigateTab,
  onClose,
  compactWidth = false,
  isShortViewport = false,
  headerSwitcher,
  preBenchGateLocked = false,
  preBenchGateBypassed = false,
  onTogglePreBenchGate,
  autoVerifyWorkflow = false,
  onToggleAutoVerifyWorkflow,
}) => {
  const [filter, setFilter] = useState<WorkflowFilter>('ALL');
  const [expandedStepId, setExpandedStepId] = useState<string | null>(
    steps[0]?.id ?? null
  );

  const filteredSteps = useMemo(() => {
    if (filter === 'PRE_BENCH') {
      return steps.filter((step) => step.mandatoryPreBench);
    }
    if (filter === 'REMAINING') {
      return steps.filter((step) => !step.isChecked);
    }
    return steps;
  }, [steps, filter]);

  const progressPercent =
    progress.totalCount > 0
      ? Math.round((progress.checkedCount / progress.totalCount) * 100)
      : 0;

  return (
    <aside
      aria-label="Diagnostic Workflow Panel"
      data-testid="diagnostic-workflow-panel"
      className={`relative w-full hud-panel rounded-xl ${
        isShortViewport ? 'p-2.5 gap-2' : 'p-3 sm:p-3.5 gap-3'
      } flex flex-col flex-1 min-h-0 overflow-y-auto`}
    >
      {/* Header Switcher (when paired inside ECUDiagnosticView) */}
      {headerSwitcher}

      {/* Panel Title & Readiness Summary */}
      <div className="hud-panel-header flex items-center justify-between gap-2 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#0d1c33] border border-[#19c8f5]/45 flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-3.5 h-3.5 text-[#19c8f5]" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="font-hud text-sm font-bold uppercase tracking-wider text-[#eaf3ff] truncate">
              Diagnostic Workflow
            </h2>
            <p className="text-[10px] font-mono tabular-nums text-[#91a4bd] truncate">
              {progress.mandatoryChecked}/{progress.mandatoryTotal} Pre-Bench ·{' '}
              {progress.checkedCount}/{progress.totalCount} Complete
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onResetWorkflow}
            disabled={progress.checkedCount === 0}
            title="Reset diagnostic workflow checklist"
            aria-label="Reset diagnostic workflow checklist"
            className="hw-btn p-1.5 rounded-lg text-[#91a4bd] hover:text-white disabled:opacity-40 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="hw-btn p-1.5 rounded-lg text-[#91a4bd] hover:text-white transition cursor-pointer"
              title="Collapse Diagnostic Workflow panel"
              aria-label="Collapse Diagnostic Workflow panel"
            >
              <PanelRightClose className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Pre-Bench Gate Readiness & Progress Bar */}
      <div className="hw-lcd-well rounded-xl p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span
            className={`inline-flex items-center gap-1.5 font-semibold ${
              progress.mandatoryAllChecked ? 'text-[#20d889]' : 'text-[#ffb020]'
            }`}
          >
            {progress.mandatoryAllChecked ? (
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>
              {progress.mandatoryAllChecked
                ? 'Pre-Bench Verified'
                : 'Mandatory Pre-Bench Pending'}
            </span>
          </span>
          <span className="font-mono tabular-nums text-[#eaf3ff]">{progressPercent}%</span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Diagnostic workflow completion"
          className="h-1.5 w-full overflow-hidden rounded-full bg-[#0e192a] border border-[#203653]/70"
        >
          <div
            className={`h-full transition-all duration-200 ${
              progress.mandatoryAllChecked ? 'bg-[#20d889]' : 'bg-[#19c8f5]'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[10px] font-mono tabular-nums text-[#91a4bd] truncate">
            {progress.telemetryWarnings > 0
              ? `${progress.telemetryWarnings} live telemetry alert${progress.telemetryWarnings === 1 ? '' : 's'}`
              : 'All live telemetry checks nominal'}
          </span>
          <button
            type="button"
            onClick={onAutoVerifyPassing}
            className="text-[10px] font-mono font-semibold text-[#19c8f5] hover:text-[#7ee2ff] transition whitespace-nowrap shrink-0 cursor-pointer"
          >
            Check Passing
          </button>
        </div>

        {(onTogglePreBenchGate || onToggleAutoVerifyWorkflow) && (
          <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-[#203653]/80">
            {onTogglePreBenchGate && (
              <button
                type="button"
                role="switch"
                aria-checked={preBenchGateLocked}
                data-testid="toggle-pre-bench-gate-btn"
                onClick={onTogglePreBenchGate}
                title="Require mandatory Pre-Bench checks to be completed before energizing bench PSU output"
                className={`hw-btn min-w-0 flex items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[9.5px] xl:text-[10px] font-mono font-semibold transition whitespace-nowrap cursor-pointer ${
                  preBenchGateLocked
                    ? 'hw-btn-amber'
                    : 'text-[#91a4bd] hover:text-white'
                }`}
              >
                {preBenchGateLocked ? (
                  preBenchGateBypassed && !progress.mandatoryAllChecked ? (
                    <Unlock className="w-3 h-3 shrink-0" aria-hidden="true" />
                  ) : (
                    <Lock className="w-3 h-3 shrink-0" aria-hidden="true" />
                  )
                ) : (
                  <Unlock className="w-3 h-3 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">
                  {preBenchGateLocked
                    ? preBenchGateBypassed && !progress.mandatoryAllChecked
                      ? 'Gate Bypassed'
                      : 'PSU Gate ON'
                    : 'PSU Gate OFF'}
                </span>
              </button>
            )}
            {onToggleAutoVerifyWorkflow && (
              <button
                type="button"
                role="switch"
                aria-checked={autoVerifyWorkflow}
                data-testid="toggle-auto-verify-btn"
                onClick={onToggleAutoVerifyWorkflow}
                title="Automatically check off workflow steps when live MNA telemetry reports PASS"
                className={`hw-btn min-w-0 flex items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[9.5px] xl:text-[10px] font-mono font-semibold transition whitespace-nowrap cursor-pointer ${
                  autoVerifyWorkflow
                    ? 'hw-btn-green'
                    : 'text-[#91a4bd] hover:text-white'
                }`}
              >
                <Zap className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{autoVerifyWorkflow ? 'Auto-Verify ON' : 'Auto-Verify OFF'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filter Segmented Control */}
      <div
        role="tablist"
        aria-label="Filter diagnostic workflow steps"
        className="grid grid-cols-3 gap-1 rounded-xl bg-[#050a12] p-1 border border-[#203653]"
      >
        {(
          [
            { id: 'ALL', label: `All (${progress.totalCount})` },
            { id: 'PRE_BENCH', label: `Pre-Bench (${progress.mandatoryTotal})` },
            {
              id: 'REMAINING',
              label: `Pending (${progress.totalCount - progress.checkedCount})`,
            },
          ] as const
        ).map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(tab.id)}
              className={`min-w-0 truncate rounded-lg px-1 py-1.5 text-[9.5px] xl:text-[10px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'diag-tab-active font-semibold'
                  : 'text-[#91a4bd] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Checklist Items */}
      <div className="flex flex-col gap-2">
        {filteredSteps.length === 0 ? (
          <div className="hud-subwell p-4 text-center space-y-1.5">
            <p className="text-xs font-medium text-[#20d889]">
              {progress.checkedCount === progress.totalCount
                ? 'All workflow steps completed'
                : 'No steps match this filter'}
            </p>
            <p className="text-[11px] text-[#91a4bd]">
              {progress.checkedCount === progress.totalCount
                ? 'Every step in this repair workflow has been signed off.'
                : 'Switch back to All Steps to review or adjust items in this diagnostic sequence.'}
            </p>
          </div>
        ) : (
          filteredSteps.map((step) => {
            const isExpanded = expandedStepId === step.id;
            return (
              <div
                key={step.id}
                data-testid={`workflow-step-${step.id}`}
                className={`rounded-xl border p-2.5 transition-colors ${
                  step.isChecked
                    ? 'border-[#20d889]/50 bg-[#0b261c]/40'
                    : step.telemetryStatus === 'ATTENTION'
                    ? 'border-[#ffb020]/55 bg-[#2a1c0a]/35'
                    : 'border-[#203653] bg-[#0a1220]'
                }`}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={step.isChecked}
                    aria-label={`Mark "${step.title}" as ${step.isChecked ? 'incomplete' : 'complete'}`}
                    onClick={() => onToggleStep(step.id)}
                    className="mt-0.5 text-[#19c8f5] hover:text-[#7ee2ff] shrink-0 rounded cursor-pointer"
                  >
                    {step.isChecked ? (
                      <CheckSquare className="w-4 h-4 text-[#20d889]" aria-hidden="true" />
                    ) : (
                      <Square className="w-4 h-4 text-[#607694]" aria-hidden="true" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => setExpandedStepId(isExpanded ? null : step.id)}
                      aria-expanded={isExpanded}
                      className="w-full text-left rounded cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-semibold truncate ${
                            step.isChecked ? 'text-[#d4e3f6]' : 'text-[#eaf3ff]'
                          }`}
                        >
                          <span className="font-mono tabular-nums text-[#91a4bd] mr-1.5">
                            {String(step.order).padStart(2, '0')}.
                          </span>
                          {step.title}
                        </span>
                        {renderTelemetryBadge(step.telemetryStatus)}
                      </div>

                      <div className="mt-1 flex items-center gap-1.5 text-[10px] font-mono tabular-nums text-[#91a4bd] truncate">
                        <span>{step.mandatoryPreBench ? 'Mandatory Pre-Bench' : 'Bench Verification'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{step.telemetrySummary}</span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="mt-2 pt-2 border-t border-[#203653]/80 space-y-2">
                        <p className="text-[11px] text-[#d4e3f6] leading-relaxed">
                          {step.instruction}
                        </p>

                        {step.ctaLabel && (step.targetPinId || step.targetTab) && (
                          <button
                            type="button"
                            onClick={() => {
                              if (step.targetPinId) onSelectPin(step.targetPinId);
                              if (step.targetTab) onNavigateTab(step.targetTab);
                            }}
                            className="hw-btn hw-btn-blue inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-mono font-semibold transition whitespace-nowrap cursor-pointer"
                          >
                            <span>{step.ctaLabel}</span>
                            <ArrowRight className="w-3 h-3 shrink-0" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
