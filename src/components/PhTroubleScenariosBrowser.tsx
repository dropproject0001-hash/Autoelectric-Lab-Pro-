import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookmarkCheck,
  BookmarkPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Cpu,
  Database,
  Globe,
  Info,
  Play,
  Search,
} from 'lucide-react';
import {
  PH_BATCH1_DOMAIN_DEFINITIONS,
  PH_BATCH2_DOMAIN_DEFINITIONS,
  PH_BATCH3_DOMAIN_DEFINITIONS,
  PH_BATCH4_DOMAIN_DEFINITIONS,
  PH_DOMAIN_DEFINITIONS,
  PH_REFERENCE_ATTRIBUTION,
  PH_TROUBLE_SCENARIOS_ALL,
  searchPhScenarios,
  splitDiagnosticSteps,
  type PhBatchFilter,
  type PhDomainNumber,
} from '../data/phTroubleScenarios520';
import {
  PH_BENCH_TROUBLE_SCENARIOS,
  type BenchTroubleScenario,
  type PhBenchTroubleScenario,
  type PhEmulationFidelity,
} from '../simulation/faults/benchTroubleScenarios';
import { LOCAL_WORKSTATION_UID, saveDiagnosticLog } from '../services/benchStorageService';

export interface PhTroubleScenariosBrowserProps {
  externalSearchQuery?: string;
  onLaunchGroundedSearch: (prefill: {
    query: string;
    ecu: string;
    dtc: string;
  }) => void;
  onEmulateInBenchLab?: (scenario: BenchTroubleScenario) => void;
  onOpenSavedBenches?: () => void;
}

const PAGE_SIZE = 25;

const PH_BENCH_MAP = new Map<string, PhBenchTroubleScenario>(
  PH_BENCH_TROUBLE_SCENARIOS.map((s) => [s.phId, s])
);

export const PhTroubleScenariosBrowser: React.FC<PhTroubleScenariosBrowserProps> = ({
  externalSearchQuery = '',
  onLaunchGroundedSearch,
  onEmulateInBenchLab,
  onOpenSavedBenches,
}) => {
  const [localQuery, setLocalQuery] = useState(externalSearchQuery);
  const [batchFilter, setBatchFilter] = useState<PhBatchFilter>('ALL');
  const [selectedDomain, setSelectedDomain] = useState<PhDomainNumber | 'ALL'>('ALL');
  const [fidelityFilter, setFidelityFilter] = useState<PhEmulationFidelity | 'ALL'>('ALL');
  const [page, setPage] = useState(0);
  const [showSources, setShowSources] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    if (externalSearchQuery !== undefined && externalSearchQuery !== localQuery) {
      setLocalQuery(externalSearchQuery);
    }
  }, [externalSearchQuery]);

  useEffect(() => {
    setPage(0);
  }, [localQuery, batchFilter, selectedDomain, fidelityFilter]);

  const filteredItems = useMemo(() => {
    const base = searchPhScenarios(localQuery, selectedDomain, batchFilter);
    if (fidelityFilter === 'ALL') return base;
    return base.filter((item) => PH_BENCH_MAP.get(item.id)?.emulationFidelity === fidelityFilter);
  }, [localQuery, batchFilter, selectedDomain, fidelityFilter]);

  const visibleDomainDefs = useMemo(
    () =>
      batchFilter === 'BATCH_1'
        ? PH_BATCH1_DOMAIN_DEFINITIONS
        : batchFilter === 'BATCH_2'
          ? PH_BATCH2_DOMAIN_DEFINITIONS
          : batchFilter === 'BATCH_3'
            ? PH_BATCH3_DOMAIN_DEFINITIONS
            : batchFilter === 'BATCH_4'
              ? PH_BATCH4_DOMAIN_DEFINITIONS
              : PH_DOMAIN_DEFINITIONS,
    [batchFilter]
  );

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = useMemo(() => {
    const start = safePage * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, safePage]);

  const activeDomainMeta = useMemo(
    () =>
      selectedDomain === 'ALL'
        ? null
        : PH_DOMAIN_DEFINITIONS.find((d) => d.domainNumber === selectedDomain) ?? null,
    [selectedDomain]
  );

  const handleSaveToCloud = async (id: string) => {
    const item = PH_TROUBLE_SCENARIOS_ALL.find((s) => s.id === id);
    if (!item) return;
    const benchInfo = PH_BENCH_MAP.get(item.id);
    setSavingId(item.id);
    setSaveNotice(null);
    try {
      await saveDiagnosticLog(LOCAL_WORKSTATION_UID, {
        title: `${item.id} (${item.dtcCode}) — ${item.title}`,
        dtcCode: item.dtcCode,
        ecuModel: item.phContext,
        sourceType: 'BENCH_SNAPSHOT',
        summary: [
          `Domain ${item.domainNumber}: ${item.domainName} (PH Reference p.${item.sourcePage} · ${PH_REFERENCE_ATTRIBUTION.provenanceStatus})`,
          `PH Context: ${item.phContext}`,
          `Symptoms: ${item.symptoms}`,
          `Diagnostic Steps: ${item.diagnosticSteps}`,
          benchInfo ? `Bench Emulation (${benchInfo.emulationFidelity}): ${benchInfo.emulationNote}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      });
      setSavedIds((prev) => ({ ...prev, [item.id]: true }));
      setSaveNotice(`Saved ${item.id} (${item.dtcCode}) to Local Diagnostic Logs.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save scenario log';
      setSaveNotice(`Local save failed: ${msg}`);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto min-h-0 hud-panel rounded-[3px] p-3 sm:p-4">
      {/* Header & Attribution */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-[#2b313c] pb-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs sm:text-sm font-hud font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
              <Database className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Philippine 2,080 Trouble Scenarios Reference (PH-001 – PH-2080)</span>
            </h3>
            <span className="text-[9.5px] px-2 py-0.5 rounded-[2px] bg-[#1b160a] border border-amber-600/60 text-amber-300 font-bold uppercase">
              {PH_REFERENCE_ATTRIBUTION.provenanceStatus}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-sans mt-1 leading-relaxed">
            {PH_REFERENCE_ATTRIBUTION.verificationNote}
          </p>
        </div>

        <div className="flex items-center gap-1.5 self-start shrink-0">
          <button
            type="button"
            onClick={() => setShowSources((prev) => !prev)}
            className="hw-btn px-2.5 py-1 rounded-[2px] text-[10px] font-bold text-slate-200 flex items-center gap-1 cursor-pointer"
          >
            <Info className="w-3 h-3 text-cyan-400" />
            <span>Sources &amp; Batches</span>
            {showSources ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <span className="text-[11px] px-2.5 py-1 rounded-[2px] bg-[#0c1a1f] border border-cyan-700/60 text-cyan-300 font-semibold">
            {filteredItems.length} / {PH_TROUBLE_SCENARIOS_ALL.length}
          </span>
        </div>
      </div>

      {showSources && (
        <div className="rounded-[2px] border border-cyan-700/50 bg-[#0b141a] p-3 text-[11px] space-y-1.5 font-sans">
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-300">
            {PH_REFERENCE_ATTRIBUTION.documentTitle} — Batch 1 Sources (Page 79), Batches 2–4 Coverage
          </div>
          {PH_REFERENCE_ATTRIBUTION.page79Sources.map((src) => (
            <div key={src.category} className="text-slate-300">
              <strong className="text-slate-100">{src.category}:</strong> {src.sources}
            </div>
          ))}
          <div className="border-t border-cyan-900/50 pt-1.5 text-cyan-200/90">
            <strong className="text-cyan-300">Batch 2 Coverage (PH-521–PH-1040):</strong>{' '}
            {PH_REFERENCE_ATTRIBUTION.batch2Note}
          </div>
          <div className="border-t border-cyan-900/50 pt-1.5 text-cyan-200/90">
            <strong className="text-cyan-300">Batch 3 Coverage (PH-1041–PH-1560):</strong>{' '}
            {PH_REFERENCE_ATTRIBUTION.batch3Note}
          </div>
          <div className="border-t border-cyan-900/50 pt-1.5 text-cyan-200/90">
            <strong className="text-cyan-300">Batch 4 Coverage (PH-1561–PH-2080):</strong>{' '}
            {PH_REFERENCE_ATTRIBUTION.batch4Note}
          </div>
        </div>
      )}

      {saveNotice && (
        <div className="px-3 py-2 rounded-[2px] bg-[#1e170a] border border-amber-500/50 text-xs text-amber-200 flex items-center justify-between gap-2">
          <span className="font-sans">{saveNotice}</span>
          <button
            type="button"
            onClick={() => setSaveNotice(null)}
            className="text-[10px] text-amber-300 hover:text-white underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Batch Switcher + Search & Filters */}
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
        <span className="text-slate-400 uppercase mr-1">Dataset Batch:</span>
        {(
          [
            { id: 'ALL', label: 'All Batches (2,080 · PH-001–2080)' },
            { id: 'BATCH_1', label: 'Batch 1 (520 · D1–12 · PH-001–520)' },
            { id: 'BATCH_2', label: 'Batch 2 (520 · D13–24 · PH-521–1040)' },
            { id: 'BATCH_3', label: 'Batch 3 (520 · D25–36 · PH-1041–1560)' },
            { id: 'BATCH_4', label: 'Batch 4 (520 · D37–48 · PH-1561–2080)' },
          ] as const
        ).map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => {
              setBatchFilter(b.id);
              setSelectedDomain('ALL');
            }}
            className={`hw-btn px-2.5 py-1 rounded-[2px] font-bold cursor-pointer ${
              batchFilter === b.id ? 'hw-btn-amber text-amber-200' : 'text-slate-300'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
        <div className="relative lg:col-span-5">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Search PH-001, PH-1853, PH-2041, P0335, Vios, UDS, LPG..."
            aria-label="Search all 2,080 PH trouble scenarios"
            className="hw-lcd-well rounded-[2px] pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 w-full"
          />
        </div>

        <div className="lg:col-span-4">
          <select
            aria-label="Filter by 48 PH diagnostic domains"
            value={selectedDomain}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedDomain(val === 'ALL' ? 'ALL' : (Number(val) as PhDomainNumber));
            }}
            className="w-full hw-lcd-well rounded-[2px] px-2.5 py-1.5 text-xs text-cyan-200 font-semibold focus:outline-none focus:border-cyan-400 cursor-pointer"
          >
            <option value="ALL" className="bg-[#0e1116]">
              {batchFilter === 'BATCH_1'
                ? 'All Batch 1 Domains (520 Scenarios)'
                : batchFilter === 'BATCH_2'
                  ? 'All Batch 2 Domains (520 Scenarios)'
                  : batchFilter === 'BATCH_3'
                    ? 'All Batch 3 Domains (520 Scenarios)'
                    : batchFilter === 'BATCH_4'
                      ? 'All Batch 4 Domains (520 Scenarios)'
                      : 'All 48 System Domains (2,080 Scenarios)'}
            </option>
            {(batchFilter === 'ALL' || batchFilter === 'BATCH_1') && (
              <optgroup label="Batch 1 · Domains 1–12 (PH-001–PH-520)" className="bg-[#0e1116]">
                {PH_BATCH1_DOMAIN_DEFINITIONS.map((d) => (
                  <option key={d.domainNumber} value={d.domainNumber} className="bg-[#0e1116]">
                    {d.domainNumber}. {d.name} ({d.expectedCount})
                  </option>
                ))}
              </optgroup>
            )}
            {(batchFilter === 'ALL' || batchFilter === 'BATCH_2') && (
              <optgroup label="Batch 2 · Domains 13–24 (PH-521–PH-1040)" className="bg-[#0e1116]">
                {PH_BATCH2_DOMAIN_DEFINITIONS.map((d) => (
                  <option key={d.domainNumber} value={d.domainNumber} className="bg-[#0e1116]">
                    {d.domainNumber}. {d.name} ({d.expectedCount})
                  </option>
                ))}
              </optgroup>
            )}
            {(batchFilter === 'ALL' || batchFilter === 'BATCH_3') && (
              <optgroup label="Batch 3 · Domains 25–36 (PH-1041–PH-1560)" className="bg-[#0e1116]">
                {PH_BATCH3_DOMAIN_DEFINITIONS.map((d) => (
                  <option key={d.domainNumber} value={d.domainNumber} className="bg-[#0e1116]">
                    {d.domainNumber}. {d.name} ({d.expectedCount})
                  </option>
                ))}
              </optgroup>
            )}
            {(batchFilter === 'ALL' || batchFilter === 'BATCH_4') && (
              <optgroup label="Batch 4 · Domains 37–48 (PH-1561–PH-2080)" className="bg-[#0e1116]">
                {PH_BATCH4_DOMAIN_DEFINITIONS.map((d) => (
                  <option key={d.domainNumber} value={d.domainNumber} className="bg-[#0e1116]">
                    {d.domainNumber}. {d.name} ({d.expectedCount})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className="lg:col-span-3">
          <select
            aria-label="Filter by bench emulation fidelity"
            value={fidelityFilter}
            onChange={(e) => setFidelityFilter(e.target.value as PhEmulationFidelity | 'ALL')}
            className="w-full hw-lcd-well rounded-[2px] px-2.5 py-1.5 text-xs text-amber-200 font-semibold focus:outline-none focus:border-amber-400 cursor-pointer"
          >
            <option value="ALL" className="bg-[#0e1116]">All Bench Modes</option>
            <option value="DIRECT_16PIN_FAULT" className="bg-[#0e1116]">Direct 16-Pin MNA</option>
            <option value="ELECTRICAL_PROXY" className="bg-[#0e1116]">Electrical Proxy</option>
            <option value="DIAGNOSTIC_REFERENCE_ONLY" className="bg-[#0e1116]">Reference Procedure Only</option>
          </select>
        </div>
      </div>

      {/* Domain Quick Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0">
        <button
          type="button"
          onClick={() => setSelectedDomain('ALL')}
          className={`hw-btn px-2.5 py-1 rounded-[2px] text-[10px] font-bold whitespace-nowrap cursor-pointer ${
            selectedDomain === 'ALL' ? 'hw-btn-amber text-amber-200' : 'text-slate-300'
          }`}
        >
          All ({batchFilter === 'ALL' ? PH_TROUBLE_SCENARIOS_ALL.length : 520})
        </button>
        {visibleDomainDefs.map((dom) => (
          <button
            key={dom.domainNumber}
            type="button"
            onClick={() => setSelectedDomain(dom.domainNumber)}
            title={`${dom.name} (${dom.rangeLabel})`}
            className={`hw-btn px-2 py-1 rounded-[2px] text-[10px] font-semibold whitespace-nowrap cursor-pointer ${
              selectedDomain === dom.domainNumber ? 'hw-btn-amber text-amber-200 font-bold' : 'text-slate-300'
            }`}
          >
            {dom.shortLabel} ({dom.expectedCount})
          </button>
        ))}
      </div>

      {activeDomainMeta && (
        <div className="rounded-[2px] border border-[#2b3545] bg-[#101620] px-3 py-2 text-[11px] font-sans text-slate-300 flex flex-wrap items-center justify-between gap-2">
          <div>
            <strong className="text-cyan-300 font-mono">{activeDomainMeta.rangeLabel}:</strong>{' '}
            {activeDomainMeta.summary}
          </div>
          <span className="font-mono text-[10px] text-slate-400">
            {activeDomainMeta.expectedCount} Scenarios
          </span>
        </div>
      )}

      {/* Pagination Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[2px] border border-[#28303e] bg-[#0e131b] px-3 py-1.5 text-[11px] font-mono">
        <span className="text-slate-300">
          Showing{' '}
          {filteredItems.length === 0 ? 0 : safePage * PAGE_SIZE + 1}–
          {Math.min((safePage + 1) * PAGE_SIZE, filteredItems.length)} of{' '}
          <strong className="text-cyan-300">{filteredItems.length}</strong> scenarios
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="hw-btn px-2 py-1 rounded-[2px] flex items-center gap-1 disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>
          <span className="px-2 text-slate-400">
            Page {safePage + 1} of {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="hw-btn px-2 py-1 rounded-[2px] flex items-center gap-1 disabled:opacity-40 cursor-pointer"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scenario Cards */}
      {pageItems.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-[#343c4b] rounded-[2px]">
          No PH diagnostic scenarios match "{localQuery}". Clear the search or select All 48 Domains.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 pb-2">
          {pageItems.map((item) => {
            const benchMeta = PH_BENCH_MAP.get(item.id);
            const steps = splitDiagnosticSteps(item.diagnosticSteps);
            const isSaved = Boolean(savedIds[item.id]);
            const isSaving = savingId === item.id;

            return (
              <article
                key={item.id}
                className="bg-[#0e1116] p-3 rounded-[2px] border border-[#262d3b] flex flex-col gap-2 shadow-sm hover:border-[#3c485e] transition-colors"
              >
                {/* Top Badges */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-[#1f2633] pb-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-[2px] bg-[#131d2b] border border-cyan-600/70 text-cyan-200 font-bold text-[10.5px]">
                      {item.id}
                    </span>
                    <span className="px-2 py-0.5 rounded-[2px] bg-[#1e170a] border border-amber-600/70 text-amber-300 font-bold text-[10.5px]">
                      {item.dtcCode}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-[2px] bg-[#161b22] border border-[#303846] text-slate-300 text-[9.5px]">
                      D{item.domainNumber} · p.{item.sourcePage}
                    </span>
                  </div>

                  {benchMeta && (
                    <span
                      className={`px-1.5 py-0.5 rounded-[2px] border text-[9.5px] font-bold uppercase ${
                        benchMeta.emulationFidelity === 'DIRECT_16PIN_FAULT'
                          ? 'border-emerald-600/60 bg-emerald-950/40 text-emerald-300'
                          : benchMeta.emulationFidelity === 'ELECTRICAL_PROXY'
                            ? 'border-amber-600/60 bg-amber-950/40 text-amber-300'
                            : 'border-slate-600/60 bg-slate-900 text-slate-300'
                      }`}
                    >
                      {benchMeta.emulationFidelity === 'DIRECT_16PIN_FAULT'
                        ? 'Direct 16-Pin MNA'
                        : benchMeta.emulationFidelity === 'ELECTRICAL_PROXY'
                          ? 'Electrical Proxy'
                          : 'Reference Only'}
                    </span>
                  )}
                </div>

                {/* Title & Context */}
                <div>
                  <h4 className="font-bold text-slate-100 text-xs sm:text-[13px] leading-snug">
                    {item.title}
                  </h4>
                  <p className="text-[11px] text-cyan-200/90 font-sans mt-0.5">
                    <strong className="text-slate-400 font-mono text-[10px]">PH Context:</strong>{' '}
                    {item.phContext}
                  </p>
                </div>

                {/* Symptoms */}
                <div className="rounded-[2px] border border-[#2d2226] bg-[#171115] px-2.5 py-1.5 text-[11px] font-sans text-rose-200 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-rose-300 font-mono text-[10px] uppercase mr-1">
                      Symptoms:
                    </strong>
                    {item.symptoms}
                  </div>
                </div>

                {/* Steps & Specs */}
                <div className="rounded-[2px] border border-[#1f2633] bg-[#090d12] p-2.5 space-y-1 text-[11px] font-sans text-slate-200">
                  <div className="font-mono text-[9.5px] uppercase tracking-wider text-emerald-400 font-bold mb-1 flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    <span>Diagnostic Steps &amp; Specs</span>
                  </div>
                  {steps.map((step, i) => (
                    <div key={i} className="leading-relaxed text-slate-200">
                      {step}
                    </div>
                  ))}
                </div>

                {/* Emulation Note */}
                {benchMeta && (
                  <div className="rounded-[2px] border border-[#252c39] bg-[#111620] px-2.5 py-1.5 text-[10px] font-mono text-slate-300 flex items-center justify-between gap-2">
                    <span className="truncate" title={benchMeta.emulationNote}>
                      <Cpu className="w-3 h-3 inline mr-1 text-amber-400" />
                      {benchMeta.focusPinLabel} · {benchMeta.expectedProbeOutcome}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 mt-auto">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onLaunchGroundedSearch({
                          query: `${item.phContext} ${item.dtcCode} ${item.title} wiring diagram TSB`,
                          ecu: item.phContext,
                          dtc: item.dtcCode,
                        })
                      }
                      className="hw-btn px-2 py-1 rounded-[2px] text-amber-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Globe className="w-3 h-3" />
                      <span>Live TSB</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleSaveToCloud(item.id)}
                      className={`px-2 py-1 rounded-[2px] border text-[10px] font-bold flex items-center gap-1 transition cursor-pointer ${
                        isSaved ? 'hw-btn-green text-emerald-300' : 'hw-btn text-slate-200'
                      }`}
                    >
                      {isSaved ? (
                        <>
                          <BookmarkCheck className="w-3 h-3" />
                          <span>Saved</span>
                        </>
                      ) : (
                        <>
                          <BookmarkPlus className="w-3 h-3" />
                          <span>{isSaving ? 'Saving...' : 'Save Log'}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {onEmulateInBenchLab && benchMeta && (
                    <button
                      type="button"
                      onClick={() => onEmulateInBenchLab(benchMeta)}
                      className="hw-btn hw-btn-amber px-2.5 py-1 rounded-[2px] text-[10px] font-bold uppercase flex items-center gap-1 cursor-pointer"
                    >
                      <Play className="w-3 h-3" />
                      <span>Emulate in Bench Lab</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
