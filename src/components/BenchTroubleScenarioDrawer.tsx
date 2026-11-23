import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BatteryWarning,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Database,
  Gauge,
  GraduationCap,
  Power,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
  Zap,
  ZapOff,
} from 'lucide-react';
import {
  BENCH_TROUBLE_SCENARIOS,
  PH_BENCH_TROUBLE_SCENARIOS,
  type BenchPulseChannelStatus,
  type BenchSignalPulseEvaluation,
  type BenchTroubleScenario,
  type PhBenchTroubleScenario,
  type TroubleScenarioCategory,
} from '../simulation/faults/benchTroubleScenarios';
import {
  PH_BATCH1_DOMAIN_DEFINITIONS,
  PH_BATCH2_DOMAIN_DEFINITIONS,
  PH_BATCH3_DOMAIN_DEFINITIONS,
  PH_BATCH4_DOMAIN_DEFINITIONS,
  type PhBatchFilter,
  type PhDomainNumber,
} from '../data/phTroubleScenarios520';
import {
  UNIVERSITY_LAB_MODULES,
  UNIVERSITY_TIER_META,
  type UniversityDifficultyTier,
  type UniversityLabModule,
} from '../data/universityLabCurriculum';
import { LabDrawerIcon } from './icons/LabDrawerIcons';

export interface BenchTroubleScenarioDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  evaluation: BenchSignalPulseEvaluation;
  activeScenarioId: string | null;
  activeFaultCount: number;
  cutWireCount: number;
  selectedPinId: string | null;
  preBenchGateLocked?: boolean;
  preBenchGateBypassed?: boolean;
  canEnergizePhysicalBench?: boolean;
  onBypassPreBenchGate?: () => void;
  onApplyScenario: (scenario: BenchTroubleScenario) => void;
  onStartUniversityModule?: (module: UniversityLabModule) => void;
  onOpenUniversityPdfModal?: (tab?: 'EXPORT' | 'VERIFY') => void;
  activeUniversityModuleId?: string | null;
  onClearAllTroubles: () => void;
  onFocusProbePin: (pinId: string, label: string, openScope?: boolean) => void;
  onSetTestRpmMode?: (mode: 'CRANK_250' | 'IDLE_850' | 'STOP') => void;
}

type CategoryFilter = 'ALL' | TroubleScenarioCategory;

const CATEGORY_TABS: ReadonlyArray<{ id: CategoryFilter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'POWER_IGNITION', label: 'Battery / IG' },
  { id: 'NO_PULSE_SENSOR', label: 'No Pulse / CKP' },
  { id: 'ACTUATOR_BUS', label: 'INJ / IGN / CAN' },
  { id: 'GROUND_WIRING', label: 'Grounds' },
];

type CatalogScope = 'CORE' | 'PH_520' | 'UNIVERSITY_LAB';
const PH_PAGE_SIZE = 20;

export const BenchTroubleScenarioDrawer: React.FC<BenchTroubleScenarioDrawerProps> = ({
  isOpen,
  onClose,
  evaluation,
  activeScenarioId,
  activeFaultCount,
  cutWireCount,
  selectedPinId,
  preBenchGateLocked,
  preBenchGateBypassed,
  canEnergizePhysicalBench = true,
  onBypassPreBenchGate,
  onApplyScenario,
  onStartUniversityModule,
  onOpenUniversityPdfModal,
  activeUniversityModuleId,
  onClearAllTroubles,
  onFocusProbePin,
  onSetTestRpmMode,
}) => {
  const [catalogScope, setCatalogScope] = useState<CatalogScope>('UNIVERSITY_LAB');
  const [universityTierFilter, setUniversityTierFilter] = useState<UniversityDifficultyTier | 'ALL'>('ALL');
  const [batchFilter, setBatchFilter] = useState<PhBatchFilter>('ALL');
  const [domainFilter, setDomainFilter] = useState<PhDomainNumber | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [phPage, setPhPage] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    setPhPage(0);
  }, [catalogScope, batchFilter, domainFilter, categoryFilter, searchQuery]);

  // If user types a PH-xxx or PH-xxxx code, auto-surface PH catalog results cleanly across all batches
  const isQueryPhExplicit = /^ph-\d/i.test(searchQuery.trim());
  const effectiveScope: CatalogScope = isQueryPhExplicit ? 'PH_520' : catalogScope;

  const filteredScenarios = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    const sourceList: ReadonlyArray<BenchTroubleScenario> =
      effectiveScope === 'CORE' ? BENCH_TROUBLE_SCENARIOS : PH_BENCH_TROUBLE_SCENARIOS;

    return sourceList.filter((s) => {
      if (effectiveScope === 'PH_520') {
        const ph = s as PhBenchTroubleScenario;
        if (!isQueryPhExplicit && batchFilter === 'BATCH_1' && ph.batch !== 1) return false;
        if (!isQueryPhExplicit && batchFilter === 'BATCH_2' && ph.batch !== 2) return false;
        if (!isQueryPhExplicit && batchFilter === 'BATCH_3' && ph.batch !== 3) return false;
        if (!isQueryPhExplicit && batchFilter === 'BATCH_4' && ph.batch !== 4) return false;
        if (domainFilter !== 'ALL' && ph.domainNumber !== domainFilter) return false;
      }
      if (categoryFilter !== 'ALL' && s.category !== categoryFilter) {
        return false;
      }
      if (tokens.length === 0) return true;
      const ph = s as Partial<PhBenchTroubleScenario>;
      const haystack = [
        s.title,
        s.subtitle,
        s.symptomTag,
        s.expectedProbeOutcome,
        s.diagnosticHint,
        s.focusPinLabel,
        ph.phId ?? '',
        ph.domainName ?? '',
        ph.phContext ?? '',
        ...s.relatedDtcs,
      ]
        .join(' ')
        .toLowerCase();
      return tokens.every((tok) => haystack.includes(tok));
    });
  }, [effectiveScope, isQueryPhExplicit, batchFilter, domainFilter, categoryFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredScenarios.length / PH_PAGE_SIZE));
  const safePage = Math.min(phPage, totalPages - 1);
  const filteredUniversityModules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    return UNIVERSITY_LAB_MODULES.filter((m) => {
      if (universityTierFilter !== 'ALL' && m.tier !== universityTierFilter) return false;
      if (tokens.length === 0) return true;
      const haystack = [
        m.exerciseCode,
        m.titleTaglish,
        m.subtitleTaglish,
        m.objectiveTaglish,
        m.targetUnit,
        ...m.dtcCodes,
      ]
        .join(' ')
        .toLowerCase();
      return tokens.every((tok) => haystack.includes(tok));
    });
  }, [universityTierFilter, searchQuery]);

  const visibleScenarios = useMemo(() => {
    if (effectiveScope === 'CORE') return filteredScenarios;
    const start = safePage * PH_PAGE_SIZE;
    return filteredScenarios.slice(start, start + PH_PAGE_SIZE);
  }, [effectiveScope, filteredScenarios, safePage]);

  if (!isOpen) return null;

  const channels: BenchPulseChannelStatus[] = [
    evaluation.injectorPulse,
    evaluation.ignitionPulse,
    evaluation.canSignal,
    evaluation.vrefRail,
  ];

  const isHealthy = evaluation.headlineStatus === 'ALL_SIGNALS_ACTIVE';
  const showGateUnlockHint =
    !evaluation.isPsuOn &&
    Boolean(preBenchGateLocked) &&
    !preBenchGateBypassed &&
    canEnergizePhysicalBench &&
    Boolean(onBypassPreBenchGate);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#02050b]/75 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="bench-trouble-drawer-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[468px] flex-col border-l border-[#203653] bg-[#0a1220] text-[#eaf3ff] shadow-2xl"
      >
        {/* Drawer Header */}
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-[#203653] bg-[#0e192a] px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <LabDrawerIcon name="trouble-drawer" size={24} className="h-5 w-5 shrink-0" />
              <h2
                id="bench-trouble-drawer-title"
                className="truncate font-mono text-xs font-bold uppercase tracking-wider text-[#eaf3ff] sm:text-sm"
              >
                Trouble Scenario Emulator
              </h2>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-[#91a4bd]">
              Emulate no-start, lost KL30 battery / KL15 ignition, CKP loss, and open/short faults inside live MNA simulation.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trouble scenario drawer"
            className="hw-btn inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#d9e8fa] hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {/* Scrollable Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3.5">
          {/* Live Supply & Pulse Probe Status Card */}
          <section
            aria-label="Live supply and pulse probe indicator"
            className={`rounded-xl border p-3 ${
              isHealthy
                ? 'border-[#20d889]/45 bg-[#082119]/50'
                : 'border-[#ff4d62]/60 bg-[#260c15]/55'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <LabDrawerIcon
                  name={isHealthy ? 'status-ok' : 'status-fault'}
                  size={24}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                        isHealthy
                          ? 'border-[#20d889]/50 bg-[#08291e]/80 text-[#20d889]'
                          : 'border-[#ff4d62]/60 bg-[#330d19]/80 text-[#ff8a99]'
                      }`}
                    >
                      {isHealthy ? 'PULSES & SIGNALS ACTIVE' : 'NO PULSE / NO SIGNAL'}
                    </span>
                    <span className="font-mono text-[9.5px] uppercase tracking-wide text-[#91a4bd]">
                      SIMULATED MNA TELEMETRY
                    </span>
                  </div>
                  <h3
                    className={`mt-1.5 font-mono text-xs font-bold leading-snug ${
                      isHealthy ? 'text-emerald-200' : 'text-rose-200'
                    }`}
                  >
                    {evaluation.headlineTitle}
                  </h3>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-300">
                    {evaluation.headlineDetail}
                  </p>
                </div>
              </div>
            </div>

            {showGateUnlockHint && (
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-[2px] border border-amber-500/50 bg-amber-950/40 px-2.5 py-2 text-[11px]">
                <span className="text-amber-200">
                  Pre-Bench Safety Gate is holding PSU OFF.
                </span>
                <button
                  type="button"
                  onClick={onBypassPreBenchGate}
                  className="hw-btn hw-btn-amber rounded-[2px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase cursor-pointer"
                >
                  <Power className="mr-1 inline h-3 w-3" aria-hidden="true" />
                  Unlock PSU Output
                </button>
              </div>
            )}

            {/* Key Supply & Crank Telemetry Grid */}
            <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4 font-mono text-[10.5px]">
              <div
                className={`rounded-[2px] border px-2 py-1.5 ${
                  evaluation.isBatteryKl30Ok
                    ? 'border-emerald-500/35 bg-[#11161f]'
                    : 'border-rose-500/60 bg-rose-950/40'
                }`}
              >
                <div className="text-[9.5px] uppercase text-slate-400">KL30 Pin 3</div>
                <div
                  className={`font-bold ${
                    evaluation.isBatteryKl30Ok ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {evaluation.kl30Volts.toFixed(2)}V
                </div>
              </div>
              <div
                className={`rounded-[2px] border px-2 py-1.5 ${
                  evaluation.isIgnitionKl15Ok
                    ? 'border-emerald-500/35 bg-[#11161f]'
                    : 'border-rose-500/60 bg-rose-950/40'
                }`}
              >
                <div className="text-[9.5px] uppercase text-slate-400">KL15 Pin 4</div>
                <div
                  className={`font-bold ${
                    evaluation.isIgnitionKl15Ok ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {evaluation.kl15Volts.toFixed(2)}V
                </div>
              </div>
              <div
                className={`rounded-[2px] border px-2 py-1.5 ${
                  evaluation.isVrefOk
                    ? 'border-emerald-500/35 bg-[#11161f]'
                    : 'border-rose-500/60 bg-rose-950/40'
                }`}
              >
                <div className="text-[9.5px] uppercase text-slate-400">VREF Pin 5</div>
                <div
                  className={`font-bold ${
                    evaluation.isVrefOk ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {evaluation.vrefVolts.toFixed(2)}V
                </div>
              </div>
              <div
                className={`rounded-[2px] border px-2 py-1.5 ${
                  evaluation.isCkpOk
                    ? 'border-cyan-500/35 bg-[#11161f]'
                    : 'border-rose-500/60 bg-rose-950/40'
                }`}
              >
                <div className="text-[9.5px] uppercase text-slate-400">CKP / RPM</div>
                <div
                  className={`font-bold ${
                    evaluation.isCkpOk ? 'text-cyan-300' : 'text-rose-300'
                  }`}
                >
                  {evaluation.isCkpOk
                    ? evaluation.isEngineTesting
                      ? `${evaluation.testRpm} RPM`
                      : '850 Bench'
                    : 'LOST'}
                </div>
              </div>
            </div>

            {/* Crank / Idle Test Controls */}
            {onSetTestRpmMode && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                <span className="inline-flex items-center gap-1 text-slate-400 mr-1">
                  <Gauge className="h-3 w-3 text-cyan-400" aria-hidden="true" />
                  Engine Test:
                </span>
                <button
                  type="button"
                  onClick={() => onSetTestRpmMode('CRANK_250')}
                  className={`hw-btn rounded-[2px] px-2 py-1 cursor-pointer ${
                    evaluation.isEngineTesting && evaluation.testRpm <= 350
                      ? 'hw-btn-amber font-bold'
                      : 'text-slate-300'
                  }`}
                >
                  Crank Test (250 RPM)
                </button>
                <button
                  type="button"
                  onClick={() => onSetTestRpmMode('IDLE_850')}
                  className={`hw-btn rounded-[2px] px-2 py-1 cursor-pointer ${
                    evaluation.isEngineTesting && evaluation.testRpm > 350
                      ? 'hw-btn-amber font-bold'
                      : 'text-slate-300'
                  }`}
                >
                  Idle (850 RPM)
                </button>
                {evaluation.isEngineTesting && (
                  <button
                    type="button"
                    onClick={() => onSetTestRpmMode('STOP')}
                    className="hw-btn rounded-[2px] px-2 py-1 text-slate-300 cursor-pointer"
                  >
                    Stop
                  </button>
                )}
              </div>
            )}

            {/* Live Pulse & Signal Channel Matrix */}
            <div className="mt-2.5 space-y-1.5">
              {channels.map((ch) => {
                const isSelected = selectedPinId === ch.pinId;
                return (
                  <div
                    key={ch.pinId}
                    className={`flex items-center justify-between gap-2 rounded-[2px] border px-2.5 py-1.5 text-[11px] ${
                      ch.hasOutput
                        ? 'border-emerald-500/30 bg-[#10151d]'
                        : 'border-rose-500/45 bg-[#1b1116]'
                    } ${isSelected ? 'ring-1 ring-amber-400/70' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 font-mono">
                        {ch.hasOutput ? (
                          <Zap
                            className="h-3.5 w-3.5 shrink-0 text-emerald-400"
                            aria-hidden="true"
                          />
                        ) : (
                          <ZapOff
                            className="h-3.5 w-3.5 shrink-0 text-rose-400"
                            aria-hidden="true"
                          />
                        )}
                        <span className="font-bold text-slate-100">{ch.label}</span>
                        <span
                          className={`rounded-[2px] px-1.5 py-0.5 text-[9.5px] font-bold ${
                            ch.hasOutput
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                              : 'bg-rose-950 text-rose-300 border border-rose-500/50'
                          }`}
                        >
                          {ch.statusLabel}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {ch.voltageV.toFixed(2)}V
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10.5px] text-slate-300" title={ch.reason}>
                        {ch.reason}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 font-mono text-[10px]">
                      <button
                        type="button"
                        onClick={() => onFocusProbePin(ch.pinId, `${ch.label} (Pin ${ch.pinNumber})`, false)}
                        title={`Attach Red DMM Probe & select Pin ${ch.pinNumber}`}
                        className="hw-btn rounded-[2px] px-2 py-1 text-slate-200 hover:text-amber-300 cursor-pointer"
                      >
                        Probe
                      </button>
                      <button
                        type="button"
                        onClick={() => onFocusProbePin(ch.pinId, `${ch.label} (Pin ${ch.pinNumber})`, true)}
                        title={`Probe & open Oscilloscope on Pin ${ch.pinNumber}`}
                        className="hw-btn rounded-[2px] px-2 py-1 text-cyan-300 hover:text-cyan-100 cursor-pointer"
                      >
                        Scope
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Restore / Clear Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-[#2b3341] bg-[#191f2a] px-2.5 py-2">
            <div className="font-mono text-[10.5px] text-slate-300">
              Active Faults:{' '}
              <span className={activeFaultCount > 0 ? 'font-bold text-rose-300' : 'text-emerald-300'}>
                {activeFaultCount}
              </span>
              {cutWireCount > 0 && (
                <span className="ml-2 text-amber-300">· {cutWireCount} Wire Cut</span>
              )}
            </div>
            <button
              type="button"
              onClick={onClearAllTroubles}
              className="hw-btn inline-flex items-center gap-1.5 rounded-[2px] border-emerald-500/50 bg-emerald-950/40 px-2.5 py-1.5 font-mono text-[10.5px] font-bold text-emerald-200 hover:bg-emerald-900/50 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Restore Nominal Bench
            </button>
          </div>

          {/* Catalog Switcher + Search & Category Filters */}
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
              <button
                type="button"
                onClick={() => setCatalogScope('UNIVERSITY_LAB')}
                className={`hw-btn inline-flex items-center justify-center gap-1 rounded-[2px] px-2 py-1.5 font-bold uppercase whitespace-nowrap cursor-pointer ${
                  effectiveScope === 'UNIVERSITY_LAB'
                    ? 'hw-btn-amber text-amber-200'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <GraduationCap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Univ Lab ({UNIVERSITY_LAB_MODULES.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setCatalogScope('CORE')}
                className={`hw-btn inline-flex items-center justify-center gap-1 rounded-[2px] px-2 py-1.5 font-bold uppercase whitespace-nowrap cursor-pointer ${
                  effectiveScope === 'CORE'
                    ? 'hw-btn-amber text-amber-200'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <LabDrawerIcon name="modular" size={24} className="h-3.5 w-3.5 shrink-0" />
                <span>Core ({BENCH_TROUBLE_SCENARIOS.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setCatalogScope('PH_520')}
                className={`hw-btn inline-flex items-center justify-center gap-1 rounded-[2px] px-2 py-1.5 font-bold uppercase whitespace-nowrap cursor-pointer ${
                  effectiveScope === 'PH_520'
                    ? 'hw-btn-amber text-amber-200'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <LabDrawerIcon name="server-drawer" size={24} className="h-3.5 w-3.5 shrink-0" />
                <span>PH ({PH_BENCH_TROUBLE_SCENARIOS.length})</span>
              </button>
            </div>

            {effectiveScope === 'UNIVERSITY_LAB' && (
              <div className="space-y-2 rounded-lg border border-[#203653] bg-[#0e192a] p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-mono text-[10.5px] font-bold uppercase tracking-wide text-amber-300">
                      University Automotive Lab — 3-Tier Curriculum
                    </div>
                    <p className="text-[10.5px] text-slate-400">
                      Pumili ng antas para sa live auto-graded MNA/DMM bench training at Verified A4 PDF exam sheet.
                    </p>
                  </div>
                  {onOpenUniversityPdfModal && (
                    <button
                      type="button"
                      onClick={() => onOpenUniversityPdfModal('VERIFY')}
                      className="hw-btn inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] text-cyan-200 hover:text-white whitespace-nowrap cursor-pointer"
                    >
                      <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>Verify Sheet</span>
                    </button>
                  )}
                </div>

                {/* 3-Tier Interactive Curriculum Selector Matrix */}
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                  {UNIVERSITY_TIER_META.map((tier) => {
                    const isSelected = universityTierFilter === tier.id;
                    const toneBorder =
                      tier.accentTone === 'emerald'
                        ? isSelected
                          ? 'border-emerald-400/80 bg-emerald-950/50 text-emerald-100'
                          : 'border-[#203653] bg-[#0a1220] text-slate-300 hover:border-emerald-500/40'
                        : tier.accentTone === 'amber'
                          ? isSelected
                            ? 'border-amber-400/80 bg-amber-950/50 text-amber-100'
                            : 'border-[#203653] bg-[#0a1220] text-slate-300 hover:border-amber-500/40'
                          : isSelected
                            ? 'border-rose-400/80 bg-rose-950/50 text-rose-100'
                            : 'border-[#203653] bg-[#0a1220] text-slate-300 hover:border-rose-500/40';
                    const titleTone =
                      tier.accentTone === 'emerald'
                        ? 'text-emerald-300'
                        : tier.accentTone === 'amber'
                          ? 'text-amber-300'
                          : 'text-rose-300';
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() =>
                          setUniversityTierFilter((prev) => (prev === tier.id ? 'ALL' : tier.id))
                        }
                        aria-pressed={isSelected}
                        className={`flex flex-col items-start rounded-lg border p-2 text-left transition-colors cursor-pointer ${toneBorder}`}
                      >
                        <span className={`font-mono text-[10px] font-bold uppercase ${titleTone}`}>
                          {tier.titleTaglish}
                        </span>
                        <ul className="mt-1 space-y-0.5 text-[9.5px] leading-snug text-slate-300">
                          {tier.curriculumTopics.slice(0, 3).map((topic) => (
                            <li key={topic} className="truncate max-w-full">
                              • {topic}
                            </li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
                </div>
                {universityTierFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setUniversityTierFilter('ALL')}
                    className="font-mono text-[10px] text-cyan-300 underline-offset-2 hover:underline cursor-pointer"
                  >
                    Ipakita lahat ng 3 Levels ({UNIVERSITY_LAB_MODULES.length} Modules)
                  </button>
                )}
              </div>
            )}

            {effectiveScope === 'PH_520' && (
              <div className="space-y-1.5 rounded-[2px] border border-[#2d3646] bg-[#10151e] p-2">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <label className="block font-mono text-[10px] uppercase tracking-wide text-amber-300">
                    PH System Domain (48 Domains · {PH_BENCH_TROUBLE_SCENARIOS.length.toLocaleString()} Scenarios)
                  </label>
                  <div className="flex flex-wrap items-center gap-1 font-mono text-[9.5px]">
                    {(
                      [
                        { id: 'ALL', label: 'All 2,080' },
                        { id: 'BATCH_1', label: 'B1 (1–520)' },
                        { id: 'BATCH_2', label: 'B2 (521–1040)' },
                        { id: 'BATCH_3', label: 'B3 (1041–1560)' },
                        { id: 'BATCH_4', label: 'B4 (1561–2080)' },
                      ] as const
                    ).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setBatchFilter(b.id);
                          setDomainFilter('ALL');
                        }}
                        className={`hw-btn rounded-[2px] px-1.5 py-0.5 cursor-pointer ${
                          batchFilter === b.id ? 'hw-btn-amber font-bold text-amber-200' : 'text-slate-300'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
                <select
                  aria-label="Filter PH scenarios by system domain"
                  value={domainFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDomainFilter(val === 'ALL' ? 'ALL' : (Number(val) as PhDomainNumber));
                  }}
                  className="w-full rounded-[2px] border border-[#343e4f] bg-[#0c1017] px-2 py-1.5 font-mono text-[11px] text-slate-100 focus:border-amber-400 focus:outline-none"
                >
                  <option value="ALL">
                    {batchFilter === 'BATCH_1'
                      ? 'All Batch 1 Domains (520 Scenarios: PH-001 – PH-520)'
                      : batchFilter === 'BATCH_2'
                        ? 'All Batch 2 Domains (520 Scenarios: PH-521 – PH-1040)'
                        : batchFilter === 'BATCH_3'
                          ? 'All Batch 3 Domains (520 Scenarios: PH-1041 – PH-1560)'
                          : batchFilter === 'BATCH_4'
                            ? 'All Batch 4 Domains (520 Scenarios: PH-1561 – PH-2080)'
                            : 'All 48 Domains (2,080 Scenarios: PH-001 – PH-2080)'}
                  </option>
                  {(batchFilter === 'ALL' || batchFilter === 'BATCH_1') && (
                    <optgroup label="Batch 1 · Domains 1–12 (PH-001–PH-520)">
                      {PH_BATCH1_DOMAIN_DEFINITIONS.map((d) => (
                        <option key={d.domainNumber} value={d.domainNumber}>
                          {d.domainNumber}. {d.name} ({d.expectedCount})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {(batchFilter === 'ALL' || batchFilter === 'BATCH_2') && (
                    <optgroup label="Batch 2 · Domains 13–24 (PH-521–PH-1040)">
                      {PH_BATCH2_DOMAIN_DEFINITIONS.map((d) => (
                        <option key={d.domainNumber} value={d.domainNumber}>
                          {d.domainNumber}. {d.name} ({d.expectedCount})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {(batchFilter === 'ALL' || batchFilter === 'BATCH_3') && (
                    <optgroup label="Batch 3 · Domains 25–36 (PH-1041–PH-1560)">
                      {PH_BATCH3_DOMAIN_DEFINITIONS.map((d) => (
                        <option key={d.domainNumber} value={d.domainNumber}>
                          {d.domainNumber}. {d.name} ({d.expectedCount})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {(batchFilter === 'ALL' || batchFilter === 'BATCH_4') && (
                    <optgroup label="Batch 4 · Domains 37–48 (PH-1561–PH-2080)">
                      {PH_BATCH4_DOMAIN_DEFINITIONS.map((d) => (
                        <option key={d.domainNumber} value={d.domainNumber}>
                          {d.domainNumber}. {d.name} ({d.expectedCount})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p className="text-[10px] leading-snug text-slate-400">
                  Cross-referenced PH field catalog (Batches 1–4). Direct 16-pin faults &amp; electrical proxies trigger live MNA simulation; mechanical/HV/safety/pre-purchase items load safe reference telemetry.
                </p>
              </div>
            )}

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  effectiveScope === 'PH_520'
                    ? 'Search PH-1323, PH-1853, PH-2041, P0351, Vios, UDS, safety...'
                    : 'Search no start, battery KL30, ignition KL15, no pulse, P0335...'
                }
                aria-label="Filter trouble scenarios"
                className="w-full rounded-[2px] border border-[#343e4f] bg-[#0f131a] py-1.5 pl-8 pr-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </div>

            {effectiveScope !== 'UNIVERSITY_LAB' && (
              <div
                role="tablist"
                aria-label="Trouble scenario categories"
                className="flex flex-wrap gap-1 font-mono text-[10px]"
              >
                {CATEGORY_TABS.map((tab) => {
                  const active = categoryFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setCategoryFilter(tab.id)}
                      className={`hw-btn rounded-[2px] px-2 py-1 uppercase tracking-wide cursor-pointer ${
                        active ? 'hw-btn-amber font-bold' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {effectiveScope === 'PH_520' && (
            <div className="flex items-center justify-between gap-2 rounded-[2px] border border-[#2a3342] bg-[#111620] px-2.5 py-1.5 font-mono text-[10px] text-slate-300">
              <span>
                Showing{' '}
                {filteredScenarios.length === 0
                  ? 0
                  : safePage * PH_PAGE_SIZE + 1}
                –{Math.min((safePage + 1) * PH_PAGE_SIZE, filteredScenarios.length)} of{' '}
                <strong className="text-amber-300">{filteredScenarios.length}</strong>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage <= 0}
                  onClick={() => setPhPage((p) => Math.max(0, p - 1))}
                  className="hw-btn inline-flex items-center rounded-[2px] px-1.5 py-0.5 disabled:opacity-40 cursor-pointer"
                  aria-label="Previous scenarios page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="px-1 text-slate-400">
                  {safePage + 1}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPhPage((p) => Math.min(totalPages - 1, p + 1))}
                  className="hw-btn inline-flex items-center rounded-[2px] px-1.5 py-0.5 disabled:opacity-40 cursor-pointer"
                  aria-label="Next scenarios page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Trouble Scenarios / University Lab Modules List */}
          <div className="space-y-2.5 pb-2">
            {effectiveScope === 'UNIVERSITY_LAB' ? (
              filteredUniversityModules.length === 0 ? (
                <div className="rounded-lg border border-[#203653] bg-[#0e192a] p-4 text-center font-mono text-xs text-slate-400">
                  Walang tugmang University Lab module. Subukang i-clear ang search o pumili ng ibang Level.
                </div>
              ) : (
                filteredUniversityModules.map((mod) => {
                  const isActiveMod = activeUniversityModuleId === mod.id || activeScenarioId === mod.id;
                  const tierLabel =
                    mod.tier === 'LEVEL_1_BEGINNER'
                      ? 'Level 1 · Beginner Trainee'
                      : mod.tier === 'LEVEL_2_INTERMEDIATE'
                        ? 'Level 2 · Intermediate'
                        : 'Level 3 · Advanced';
                  const tierTextTone =
                    mod.tier === 'LEVEL_1_BEGINNER'
                      ? 'text-emerald-300'
                      : mod.tier === 'LEVEL_2_INTERMEDIATE'
                        ? 'text-amber-300'
                        : 'text-rose-300';
                  return (
                    <article
                      key={mod.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        isActiveMod
                          ? 'border-amber-400/80 bg-[#1e1a12]'
                          : 'border-[#203653] bg-[#0e1726] hover:border-[#36547c]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[10.5px] font-mono">
                        <span className={`font-bold ${tierTextTone}`}>
                          {mod.exerciseCode} · {tierLabel}
                        </span>
                        <span className="text-slate-400 tabular-nums">
                          {mod.steps.length} Steps
                          {mod.dtcCodes.length > 0 ? ` · ${mod.dtcCodes.join(', ')}` : ''}
                        </span>
                      </div>
                      <h4 className="mt-1 text-xs font-semibold text-white sm:text-[13px]">
                        {mod.titleTaglish}
                      </h4>
                      <p className="mt-0.5 text-[11px] leading-snug text-slate-300">
                        {mod.objectiveTaglish}
                      </p>
                      <div className="mt-2 text-[10.5px] font-mono text-slate-400">
                        Target: {mod.targetUnit} · PSU Start: {mod.psuOverride.isOutputEnabled ? `${mod.psuOverride.voltageSetting.toFixed(1)}V ON` : 'OFF (Cold Check)'}
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onFocusProbePin(mod.focusPinId, mod.focusPinLabel, false)}
                          className="hw-btn inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] text-slate-300 hover:text-amber-300 cursor-pointer"
                        >
                          <Crosshair className="h-3 w-3" aria-hidden="true" />
                          <span>Focus {mod.focusPinLabel}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (onStartUniversityModule) {
                              onStartUniversityModule(mod);
                            }
                            onClose();
                          }}
                          className={`hw-btn inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[10.5px] font-bold uppercase cursor-pointer ${
                            isActiveMod
                              ? 'border-amber-400 bg-amber-500/25 text-amber-100'
                              : 'hw-btn-amber'
                          }`}
                        >
                          <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{isActiveMod ? 'Restart Lab Exercise' : 'Start Lab Exercise'}</span>
                        </button>
                      </div>
                    </article>
                  );
                })
              )
            ) : visibleScenarios.length === 0 ? (
              <div className="rounded-[3px] border border-[#2c3442] bg-[#181e28] p-4 text-center font-mono text-xs text-slate-400">
                No matching trouble scenarios found. Try clearing the search or domain filter.
              </div>
            ) : (
              visibleScenarios.map((scenario) => {
                const isActive = activeScenarioId === scenario.id;
                const phMeta = (scenario as Partial<PhBenchTroubleScenario>).phId
                  ? (scenario as PhBenchTroubleScenario)
                  : null;
                return (
                  <article
                    key={scenario.id}
                    className={`rounded-[3px] border p-3 transition-colors ${
                      isActive
                        ? 'border-amber-400/80 bg-[#221c12]'
                        : 'border-[#2f3848] bg-[#181e27] hover:border-[#49566e]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase ${
                          scenario.severity === 'CRITICAL'
                            ? 'border-rose-500/50 bg-rose-950/60 text-rose-200'
                            : 'border-amber-500/50 bg-amber-950/60 text-amber-200'
                        }`}
                      >
                        {scenario.category === 'POWER_IGNITION' ? (
                          <BatteryWarning className="h-3 w-3 shrink-0" aria-hidden="true" />
                        ) : scenario.category === 'NO_PULSE_SENSOR' ? (
                          <Activity className="h-3 w-3 shrink-0" aria-hidden="true" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                        )}
                        {scenario.symptomTag}
                      </span>

                      {scenario.relatedDtcs.length > 0 && (
                        <div className="flex flex-wrap gap-1 font-mono text-[9.5px]">
                          {scenario.relatedDtcs.map((dtc) => (
                            <span
                              key={dtc}
                              className="rounded-[2px] border border-cyan-500/40 bg-cyan-950/50 px-1.5 py-0.5 font-bold text-cyan-200"
                            >
                              {dtc}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {phMeta && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[9.5px] text-slate-400">
                        <span className="rounded-[2px] border border-[#344055] bg-[#101620] px-1.5 py-0.5 text-slate-300">
                          Domain {phMeta.domainNumber} · p.{phMeta.sourcePage}
                        </span>
                        <span
                          className={`rounded-[2px] border px-1.5 py-0.5 ${
                            phMeta.emulationFidelity === 'DIRECT_16PIN_FAULT'
                              ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                              : phMeta.emulationFidelity === 'ELECTRICAL_PROXY'
                                ? 'border-amber-500/40 bg-amber-950/40 text-amber-300'
                                : 'border-slate-500/40 bg-slate-900 text-slate-300'
                          }`}
                        >
                          {phMeta.emulationFidelity === 'DIRECT_16PIN_FAULT'
                            ? 'Direct 16-Pin MNA'
                            : phMeta.emulationFidelity === 'ELECTRICAL_PROXY'
                              ? 'Electrical Proxy'
                              : 'Reference Only'}
                        </span>
                      </div>
                    )}

                    <h4 className="mt-1.5 text-xs font-bold text-slate-100 sm:text-[13px]">
                      {scenario.title}
                    </h4>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-300">
                      {scenario.subtitle}
                    </p>

                    <div className="mt-2 rounded-[2px] border border-[#2a3342] bg-[#10141c] px-2 py-1.5 font-mono text-[10.5px] text-amber-200">
                      <span className="text-slate-400">Probe Result: </span>
                      {scenario.expectedProbeOutcome}
                    </div>

                    <p className="mt-1.5 text-[10.5px] leading-snug text-slate-400">
                      {scenario.diagnosticHint}
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onFocusProbePin(scenario.focusPinId, scenario.focusPinLabel, false)}
                        className="hw-btn inline-flex items-center gap-1 rounded-[2px] px-2 py-1 font-mono text-[10px] text-slate-300 hover:text-amber-300 cursor-pointer"
                      >
                        <Crosshair className="h-3 w-3" aria-hidden="true" />
                        Probe {scenario.focusPinLabel}
                      </button>

                      <button
                        type="button"
                        onClick={() => onApplyScenario(scenario)}
                        className={`hw-btn inline-flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 font-mono text-[10.5px] font-bold uppercase cursor-pointer ${
                          isActive
                            ? 'border-amber-400 bg-amber-500/25 text-amber-200'
                            : 'hw-btn-amber'
                        }`}
                      >
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        {isActive ? 'Re-Apply Trouble' : 'Emulate Trouble'}
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};
