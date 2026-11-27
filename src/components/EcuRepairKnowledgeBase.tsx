/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Search,
  AlertTriangle,
  Cpu,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  Layers,
  Wrench,
  Globe,
  Database,
  BookmarkPlus,
  BookmarkCheck,
  Car,
  SlidersHorizontal,
} from 'lucide-react';
import { GroundedSearchPanel } from './GroundedSearchPanel';
import { NhtsaVinRecallPanel } from './NhtsaVinRecallPanel';
import { OemComponentVerifiedDashboard } from './OemComponentVerifiedDashboard';
import { PhTroubleScenariosBrowser } from './PhTroubleScenariosBrowser';
import { DtcFrequencyWidget } from './DtcFrequencyWidget';
import { RackCornerScrews } from './HardwareControls';
import {
  LOCAL_WORKSTATION_UID,
  SavedBenchSession,
  SavedDiagnosticLog,
  saveDiagnosticLog,
} from '../services/benchStorageService';
import { PH_TROUBLE_SCENARIOS_ALL } from '../data/phTroubleScenarios520';
import type { BenchTroubleScenario } from '../simulation/faults/benchTroubleScenarios';
import { DiagnosticTroubleCode } from '../types/ecu';
import {
  BENCH_TEST_SCENARIOS,
  BenchTestScenarioEntry,
  OEM_PCB_HARDWARE_SPECS,
  getOemPcbHardwareSpecs,
  searchOemPcbHardwareSpecs,
} from '../utils/oemKnowledgeDatabase';
import { APP_LOGO_SRC } from '../constants/branding';
import { type RepairArticle, REPAIR_KNOWLEDGE_BASE } from '../data/ecuRepairKnowledgeBaseData';
export { type RepairArticle, REPAIR_KNOWLEDGE_BASE } from '../data/ecuRepairKnowledgeBaseData';

interface EcuRepairKnowledgeBaseProps {
  savedSessions?: SavedBenchSession[];
  savedLogs?: SavedDiagnosticLog[];
  liveActiveDtcs?: DiagnosticTroubleCode[];
  onOpenSavedBenches?: () => void;
  onEmulateTroubleScenario?: (scenario: BenchTroubleScenario) => void;
}

export const EcuRepairKnowledgeBase: React.FC<EcuRepairKnowledgeBaseProps> = ({
  savedSessions = [],
  savedLogs = [],
  liveActiveDtcs = [],
  onOpenSavedBenches,
  onEmulateTroubleScenario,
}) => {
  const [activeMode, setActiveMode] = useState<
    | 'OEM_MANUALS'
    | 'BENCH_SCENARIOS'
    | 'PH_520_SCENARIOS'
    | 'LIVE_GROUNDING_SEARCH'
    | 'VIN_RECALL_LOOKUP'
    | 'OEM_PCB_PARTS'
    | 'OEM_COMPONENT_VERIFIED'
  >('OEM_MANUALS');
  const [groundingPrefill, setGroundingPrefill] = useState<{
    query: string;
    ecu: string;
    dtc: string;
    vehicle?: { make: string; model: string; year?: string };
    openStartMyCar?: boolean;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedArticle, setSelectedArticle] = useState<RepairArticle>(REPAIR_KNOWLEDGE_BASE[0]);
  const [mobileManualPane, setMobileManualPane] = useState<'INDEX' | 'ARTICLE'>('ARTICLE');

  const [scenarioQuery, setScenarioQuery] = useState('');
  const [scenarioBrandFilter, setScenarioBrandFilter] = useState<string>('ALL');

  const [pcbPartsQuery, setPcbPartsQuery] = useState('');
  const [pcbBrandFilter, setPcbBrandFilter] = useState<'toyota' | 'ford' | 'mitsubishi' | 'nissan' | 'ALL'>('ALL');

  const filteredPcbSpecs = useMemo(() => {
    const q = pcbPartsQuery.trim();
    const base = getOemPcbHardwareSpecs(pcbBrandFilter);
    if (!q) return base;
    return searchOemPcbHardwareSpecs(q).filter(
      (spec) => pcbBrandFilter === 'ALL' || spec.brandKey === pcbBrandFilter
    );
  }, [pcbPartsQuery, pcbBrandFilter]);
  const [savingScenarioId, setSavingScenarioId] = useState<string | null>(null);
  const [savedScenarioIds, setSavedScenarioIds] = useState<Record<string, boolean>>({});
  const [scenarioSaveStatus, setScenarioSaveStatus] = useState<string | null>(null);

  const scenarioBrands = useMemo(() => {
    const map = new Map<string, string>();
    for (const sc of BENCH_TEST_SCENARIOS) {
      map.set(sc.brandKey, sc.brandLabel);
    }
    return Array.from(map.entries());
  }, []);

  const filteredScenarios = useMemo(() => {
    const q = scenarioQuery.toLowerCase().trim();
    return BENCH_TEST_SCENARIOS.filter((sc) => {
      const matchesBrand = scenarioBrandFilter === 'ALL' || sc.brandKey === scenarioBrandFilter;
      if (!matchesBrand) return false;
      if (!q) return true;
      return (
        sc.dtcCode.toLowerCase().includes(q) ||
        sc.targetModuleAndModels.toLowerCase().includes(q) ||
        sc.faultDescription.toLowerCase().includes(q) ||
        sc.benchSimulationSetup.toLowerCase().includes(q) ||
        sc.expectedEcuBehavior.toLowerCase().includes(q) ||
        sc.brandLabel.toLowerCase().includes(q)
      );
    });
  }, [scenarioQuery, scenarioBrandFilter]);

  const handleSaveScenarioToCloud = async (sc: BenchTestScenarioEntry) => {
    setSavingScenarioId(sc.id);
    setScenarioSaveStatus(null);
    try {
      await saveDiagnosticLog(LOCAL_WORKSTATION_UID, {
        title: `${sc.brandLabel} #${sc.scenarioNumber} (${sc.dtcCode}) — ${sc.faultDescription}`,
        dtcCode: sc.dtcCode,
        ecuModel: sc.targetModuleAndModels,
        sourceType: 'BENCH_SNAPSHOT',
        summary: [
          `Market: ${sc.market}`,
          `Bench Simulation Setup: ${sc.benchSimulationSetup}`,
          `Expected ECU / Lab Behavior: ${sc.expectedEcuBehavior}`,
          `Recommended Bench Pin Fault: ${sc.recommendedPinId} (${sc.recommendedFaultType})`,
        ].join('\n'),
      });
      setSavedScenarioIds((prev) => ({ ...prev, [sc.id]: true }));
      setScenarioSaveStatus(
        `Saved Scenario #${sc.scenarioNumber} (${sc.dtcCode}) to Local Diagnostic Logs.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save scenario log';
      setScenarioSaveStatus(`Local save failed: ${msg}`);
    } finally {
      setSavingScenarioId(null);
    }
  };

  const filteredArticles = REPAIR_KNOWLEDGE_BASE.filter(art => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      q === '' ||
      art.dtcCode.toLowerCase().includes(q) ||
      art.title.toLowerCase().includes(q) ||
      art.vehicleModel.toLowerCase().includes(q) ||
      art.symptoms.some(s => s.toLowerCase().includes(q));

    const matchesCat = selectedCategory === 'ALL' || art.category === selectedCategory;

    return matchesSearch && matchesCat;
  });

  const handleLaunchArticleGrounding = (art: RepairArticle) => {
    setGroundingPrefill({
      query: `${art.vehicleModel} ${art.dtcCode} ${art.title} bench testing wiring diagnostic bulletin`,
      ecu: art.vehicleModel,
      dtc: art.dtcCode,
    });
    setActiveMode('LIVE_GROUNDING_SEARCH');
  };

  const handleSelectDtcFromChart = (dtcCode: string) => {
    const codeUpper = dtcCode.toUpperCase();
    const matched = REPAIR_KNOWLEDGE_BASE.find(
      (art) =>
        art.dtcCode.toUpperCase().includes(codeUpper) ||
        art.title.toUpperCase().includes(codeUpper) ||
        art.symptoms.some((s) => s.toUpperCase().includes(codeUpper))
    );

    if (matched) {
      setSelectedCategory('ALL');
      setSearchQuery(dtcCode);
      setSelectedArticle(matched);
      setActiveMode('OEM_MANUALS');
      setMobileManualPane('ARTICLE');
    } else {
      setGroundingPrefill({
        query: `${dtcCode} automotive ECU bench diagnostic procedure pinout TSB`,
        ecu: 'Universal ECU Bench',
        dtc: dtcCode,
      });
      setActiveMode('LIVE_GROUNDING_SEARCH');
    }
  };

  const handleSearchGroundingForDtc = (dtcCode: string) => {
    setGroundingPrefill({
      query: `${dtcCode} automotive ECU diagnostic procedure wiring pinout bulletin`,
      ecu: 'Universal ECU Bench',
      dtc: dtcCode,
    });
    setActiveMode('LIVE_GROUNDING_SEARCH');
  };

  const [showDtcAnalytics, setShowDtcAnalytics] = useState(false);

  return (
    <div className="flex-1 min-h-0 min-w-0 w-full flex flex-col gap-2 sm:gap-2.5 overflow-y-auto lg:overflow-hidden text-slate-100 p-0.5 sm:p-1 font-mono select-none">
      {/* Top Industrial Header + Search + 2x2 Hardware Module Selector */}
      <div className="hud-panel relative rounded-[3px] p-2.5 sm:p-3 flex flex-col gap-2.5 shrink-0 min-w-0">
        <RackCornerScrews />

        {/* Compact Title & Search Row */}
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src={APP_LOGO_SRC}
                alt="AutoElectric Lab Pro Official Logo"
                className="h-6 sm:h-7 w-auto object-contain rounded-[2px] border border-[#323947] bg-[#090b0f] shrink-0"
              />
              <h2 className="text-sm sm:text-base font-hud font-bold text-slate-100 tracking-wider uppercase truncate">
                REPAIR MANUALS
              </h2>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-[2px] bg-[#1e170a] border border-amber-500/70 text-amber-400 uppercase tracking-widest shrink-0">
                PRO
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowDtcAnalytics((prev) => !prev)}
                className={`hw-btn px-2 py-1 rounded-[2px] text-[10px] font-semibold cursor-pointer whitespace-nowrap ${
                  showDtcAnalytics ? 'hw-btn-amber' : 'text-slate-300'
                }`}
                title="Toggle Stored DTC Frequency Analytics Chart"
              >
                {showDtcAnalytics ? 'Hide DTC Chart' : 'DTC Stats'}
              </button>
              <span className="hidden sm:inline-block text-[9.5px] text-emerald-400 bg-[#0d1912] border border-emerald-700/60 px-2 py-0.5 rounded-[2px] font-semibold">
                {REPAIR_KNOWLEDGE_BASE.length} GUIDES · {BENCH_TEST_SCENARIOS.length} OEM · {PH_TROUBLE_SCENARIOS_ALL.length} PH CASES
              </span>
            </div>
          </div>

          {/* Full-Width Search Manuals & Filter Bar */}
          {(activeMode === 'OEM_MANUALS' || activeMode === 'BENCH_SCENARIOS') && (
            <div className="flex items-center gap-1.5 w-full min-w-0">
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  placeholder={
                    activeMode === 'OEM_MANUALS'
                      ? 'Search Manuals & Diagrams...'
                      : 'Search DTC, model, fault...'
                  }
                  value={activeMode === 'OEM_MANUALS' ? searchQuery : scenarioQuery}
                  onChange={(e) =>
                    activeMode === 'OEM_MANUALS'
                      ? setSearchQuery(e.target.value)
                      : setScenarioQuery(e.target.value)
                  }
                  className="hw-lcd-well rounded-[2px] pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 w-full min-w-0"
                />
              </div>
              <div className="flex items-center gap-1 hw-lcd-well rounded-[2px] px-2 py-1 shrink-0">
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                {activeMode === 'OEM_MANUALS' ? (
                  <select
                    aria-label="Filter repair manual category"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="bg-transparent text-[11px] text-amber-300 font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="ALL" className="bg-[#0e1116]">All OEMs</option>
                    <option value="TOYOTA_DENSO" className="bg-[#0e1116]">Toyota Denso</option>
                    <option value="BOSCH_FORD" className="bg-[#0e1116]">Ford & Bosch</option>
                    <option value="MITSUBISHI_MELCO" className="bg-[#0e1116]">Mitsubishi</option>
                    <option value="NISSAN_HITACHI" className="bg-[#0e1116]">Nissan Hitachi</option>
                    <option value="MAGNETI_MARELLI" className="bg-[#0e1116]">Marelli 5NF</option>
                  </select>
                ) : (
                  <select
                    aria-label="Filter bench scenarios by OEM"
                    value={scenarioBrandFilter}
                    onChange={(e) => setScenarioBrandFilter(e.target.value)}
                    className="bg-transparent text-[11px] text-emerald-300 font-bold focus:outline-none cursor-pointer shrink-0"
                  >
                    <option value="ALL" className="bg-[#0e1116]">All ({BENCH_TEST_SCENARIOS.length})</option>
                    {scenarioBrands.map(([key, label]) => (
                      <option key={key} value={key} className="bg-[#0e1116]">
                        {label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 7-Column Hardware Module Selector Cards (Centered Icon + Label) */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <button
            type="button"
            onClick={() => setActiveMode('OEM_MANUALS')}
            className={`px-2.5 py-2.5 rounded-[2px] border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeMode === 'OEM_MANUALS'
                ? 'bg-[#1a1f28] border-amber-500/80 text-white shadow-[inset_0_1px_0_rgba(245,158,11,0.18)]'
                : 'bg-[#12161d] border-[#2b313c] hover:border-[#414b5c] text-slate-300'
            }`}
          >
            <Search className={`w-4 h-4 shrink-0 ${activeMode === 'OEM_MANUALS' ? 'text-amber-400' : 'text-slate-300'}`} />
            <div className="text-[11px] font-bold truncate max-w-full">1. Searchable KB</div>
            <div className="text-[9px] text-slate-400 truncate max-w-full font-sans hidden sm:block">
              {REPAIR_KNOWLEDGE_BASE.length} OEM Repair Manuals
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('VIN_RECALL_LOOKUP')}
            className={`px-2.5 py-2.5 rounded-[2px] border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeMode === 'VIN_RECALL_LOOKUP'
                ? 'bg-[#1a1f28] border-amber-500/80 text-white shadow-[inset_0_1px_0_rgba(245,158,11,0.18)]'
                : 'bg-[#12161d] border-[#2b313c] hover:border-[#414b5c] text-slate-300'
            }`}
          >
            <Car className={`w-4 h-4 shrink-0 ${activeMode === 'VIN_RECALL_LOOKUP' ? 'text-amber-400' : 'text-amber-500/90'}`} />
            <div className="text-[11px] font-bold truncate max-w-full">2. DTC &amp; VIN Lookup</div>
            <div className="text-[9px] text-slate-400 truncate max-w-full font-sans hidden sm:block">
              NHTSA + Regional &amp; OBDb
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('BENCH_SCENARIOS')}
            className={`px-2.5 py-2.5 rounded-[2px] border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeMode === 'BENCH_SCENARIOS'
                ? 'bg-[#1a1f28] border-amber-500/80 text-white shadow-[inset_0_1px_0_rgba(245,158,11,0.18)]'
                : 'bg-[#12161d] border-[#2b313c] hover:border-[#414b5c] text-slate-300'
            }`}
          >
            <BookOpen className={`w-4 h-4 shrink-0 ${activeMode === 'BENCH_SCENARIOS' ? 'text-amber-400' : 'text-amber-400/90'}`} />
            <div className="text-[11px] font-bold truncate max-w-full">3. Step-by-Step Guides</div>
            <div className="text-[9px] text-slate-400 truncate max-w-full font-sans hidden sm:block">
              {BENCH_TEST_SCENARIOS.length} Bench Scenarios
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('LIVE_GROUNDING_SEARCH')}
            className={`px-2.5 py-2.5 rounded-[2px] border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeMode === 'LIVE_GROUNDING_SEARCH'
                ? 'bg-[#1a1f28] border-emerald-500/80 text-white shadow-[inset_0_1px_0_rgba(34,197,94,0.18)]'
                : 'bg-[#12161d] border-[#2b313c] hover:border-[#414b5c] text-slate-300'
            }`}
          >
            <Globe className={`w-4 h-4 shrink-0 ${activeMode === 'LIVE_GROUNDING_SEARCH' ? 'text-emerald-400' : 'text-emerald-400/90'}`} />
            <div className="text-[11px] font-bold truncate max-w-full">4. Wiring Schematics</div>
            <div className="text-[9px] text-slate-400 truncate max-w-full font-sans hidden sm:block">
              Live Web TSBs &amp; StartMyCar Fuses
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('OEM_PCB_PARTS')}
            className={`px-2.5 py-2.5 rounded-[2px] border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeMode === 'OEM_PCB_PARTS'
                ? 'bg-[#1a1f28] border-amber-500/80 text-white shadow-[inset_0_1px_0_rgba(245,158,11,0.18)]'
                : 'bg-[#12161d] border-[#2b313c] hover:border-[#414b5c] text-slate-300'
            }`}
          >
            <Cpu className={`w-4 h-4 shrink-0 ${activeMode === 'OEM_PCB_PARTS' ? 'text-amber-400' : 'text-amber-400/90'}`} />
            <div className="text-[11px] font-bold truncate max-w-full">5. OEM PCB Parts</div>
            <div className="text-[9px] text-slate-400 truncate max-w-full font-sans hidden sm:block">
              {OEM_PCB_HARDWARE_SPECS.length} ECU Platforms
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('OEM_COMPONENT_VERIFIED')}
            className={`px-2.5 py-2.5 rounded-[2px] border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeMode === 'OEM_COMPONENT_VERIFIED'
                ? 'bg-[#1a1f28] border-emerald-500/80 text-white shadow-[inset_0_1px_0_rgba(34,197,94,0.18)]'
                : 'bg-[#12161d] border-[#2b313c] hover:border-[#414b5c] text-slate-300'
            }`}
          >
            <ShieldCheck className={`w-4 h-4 shrink-0 ${activeMode === 'OEM_COMPONENT_VERIFIED' ? 'text-emerald-400' : 'text-emerald-400/90'}`} />
            <div className="text-[11px] font-bold truncate max-w-full">6. Verified Dashboard</div>
            <div className="text-[9px] text-slate-400 truncate max-w-full font-sans hidden sm:block">
              Grouped by Function
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('PH_520_SCENARIOS')}
            className={`px-2.5 py-2.5 rounded-[2px] border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer col-span-2 md:col-span-2 lg:col-span-1 ${
              activeMode === 'PH_520_SCENARIOS'
                ? 'bg-[#131d28] border-cyan-400/80 text-white shadow-[inset_0_1px_0_rgba(34,211,238,0.2)]'
                : 'bg-[#12161d] border-[#2b313c] hover:border-[#414b5c] text-slate-300'
            }`}
          >
            <Database className={`w-4 h-4 shrink-0 ${activeMode === 'PH_520_SCENARIOS' ? 'text-cyan-300' : 'text-cyan-400/90'}`} />
            <div className="text-[11px] font-bold truncate max-w-full">7. PH 2,080 Scenarios</div>
            <div className="text-[9px] text-slate-400 truncate max-w-full font-sans hidden sm:block">
              48 Domains · PH-001–2080
            </div>
          </button>
        </div>
      </div>

      {/* Mode Content */}
      {activeMode === 'PH_520_SCENARIOS' ? (
        <PhTroubleScenariosBrowser
          onLaunchGroundedSearch={(prefill) => {
            setGroundingPrefill(prefill);
            setActiveMode('LIVE_GROUNDING_SEARCH');
          }}
          onEmulateInBenchLab={onEmulateTroubleScenario}
          onOpenSavedBenches={onOpenSavedBenches}
        />
      ) : activeMode === 'OEM_COMPONENT_VERIFIED' ? (
        <div className="flex-1 overflow-y-auto">
          <OemComponentVerifiedDashboard
            onLaunchGroundedSearch={(prefill) => {
              setGroundingPrefill(prefill);
              setActiveMode('LIVE_GROUNDING_SEARCH');
            }}
          />
        </div>
      ) : activeMode === 'OEM_PCB_PARTS' ? (
        <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto min-h-0 hud-panel rounded-[3px] p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#2b313c] pb-2.5">
            <div>
              <h3 className="text-xs sm:text-sm font-hud font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-amber-400" />
                <span>OEM-Verified Automotive PCB Component &amp; Parts Information ({OEM_PCB_HARDWARE_SPECS.length} Platforms)</span>
              </h3>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                Detailed microcontroller architectures, EEPROM/Flash chips, driver LSIs, bulk filter capacitors, TVS protection diodes, shunt resistors, and crystal frequencies across Toyota, Ford, Mitsubishi, and Nissan ECU platforms.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <select
                aria-label="Filter OEM PCB specs by brand"
                value={pcbBrandFilter}
                onChange={(e) => setPcbBrandFilter(e.target.value as any)}
                className="bg-[#12161d] border border-[#343c4b] text-amber-300 text-[11px] font-bold px-2.5 py-1 rounded-[2px] focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Brands ({OEM_PCB_HARDWARE_SPECS.length})</option>
                <option value="toyota">Toyota ({getOemPcbHardwareSpecs('toyota').length})</option>
                <option value="ford">Ford ({getOemPcbHardwareSpecs('ford').length})</option>
                <option value="mitsubishi">Mitsubishi ({getOemPcbHardwareSpecs('mitsubishi').length})</option>
                <option value="nissan">Nissan ({getOemPcbHardwareSpecs('nissan').length})</option>
              </select>
              <span className="text-[11px] px-2.5 py-1 rounded-[2px] bg-[#1e170a] border border-amber-700/60 text-amber-300 font-semibold">
                Showing {filteredPcbSpecs.length}
              </span>
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search by part number, MCU (e.g. TC1797, SH7058), driver IC, or platform name..."
              value={pcbPartsQuery}
              onChange={(e) => setPcbPartsQuery(e.target.value)}
              className="hw-lcd-well rounded-[2px] pl-8 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 w-full"
            />
          </div>

          {filteredPcbSpecs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-[#343c4b] rounded-[2px]">
              No OEM PCB hardware specifications match "{pcbPartsQuery}".
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-2">
              {filteredPcbSpecs.map((spec) => (
                <div key={spec.id} className="bg-[#0e1116] p-3 rounded-[2px] border border-[#262c37] flex flex-col gap-2 shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b border-[#222834] pb-2">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-[2px] bg-[#1a1f28] border border-amber-600/60 text-amber-300 font-bold text-[10px] uppercase">
                          {spec.brandKey}
                        </span>
                        <h4 className="font-bold text-slate-100 text-xs sm:text-sm">{spec.platformName}</h4>
                      </div>
                      <span className="text-[11px] text-slate-400 font-sans">{spec.engineOrTransmission}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setGroundingPrefill({
                          query: `${spec.platformName} ${spec.boardPartNumbers.join(' ')} ECU wiring schematic TSB`,
                          ecu: spec.platformName,
                          dtc: spec.boardPartNumbers[0] || 'PCB',
                        });
                        setActiveMode('LIVE_GROUNDING_SEARCH');
                      }}
                      className="hw-btn px-2.5 py-1.5 rounded-[2px] text-amber-300 text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                      title="Search live web TSBs for this ECU platform"
                    >
                      <Globe className="w-3 h-3 text-amber-300" />
                      <span>Live TSB</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-[10px] text-slate-400 font-semibold">Part Numbers:</span>
                    {spec.boardPartNumbers.map((partNum, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 rounded-[2px] bg-[#161b22] border border-[#303846] text-emerald-300 font-mono text-[10px]">
                        {partNum}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] bg-[#090d11] p-2 rounded-[2px] border border-[#1f2633]">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-400 text-[10px] uppercase font-semibold">MCU Architecture:</span>
                      <span className="text-slate-200 font-mono">{spec.mcuArchitecture}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-400 text-[10px] uppercase font-semibold">Memory / EEPROM:</span>
                      <span className="text-slate-200 font-mono">{spec.memoryAndEeprom}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-400 text-[10px] uppercase font-semibold">Power &amp; Driver LSI:</span>
                      <span className="text-slate-200 font-sans">{spec.powerAndDriverLsi}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-400 text-[10px] uppercase font-semibold">CAN / Interface:</span>
                      <span className="text-slate-200 font-sans">{spec.canOrInterface}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-400 text-[10px] uppercase font-semibold">Bulk Capacitors:</span>
                      <span className="text-slate-200 font-sans">{spec.bulkCapacitors}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-400 text-[10px] uppercase font-semibold">Protection &amp; Shunts:</span>
                      <span className="text-slate-200 font-sans">{spec.passiveAndProtection}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 bg-[#12161d] px-2 py-1 rounded-[2px]">
                    <span className="font-mono text-amber-300">Crystal: {spec.crystalFrequency}</span>
                    <span className="font-sans italic">OEM Verified Specification</span>
                  </div>

                  <p className="text-[11px] text-slate-300 font-sans bg-[#12161d] p-2 rounded-[2px] border border-[#2b313c] leading-relaxed">
                    <strong className="text-amber-400 font-semibold">Bench &amp; Repair Note:</strong> {spec.benchCheckNotes}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeMode === 'LIVE_GROUNDING_SEARCH' ? (
        <div className="flex-1 overflow-y-auto">
          <GroundedSearchPanel
            initialQuery={groundingPrefill?.query || ''}
            initialEcu={groundingPrefill?.ecu || ''}
            initialDtc={groundingPrefill?.dtc || ''}
            initialVehicle={groundingPrefill?.vehicle}
            initialMode={groundingPrefill?.openStartMyCar ? 'STARTMYCAR_FUSE' : 'ECU_BENCH'}
          />
        </div>
      ) : activeMode === 'VIN_RECALL_LOOKUP' ? (
        <div className="flex-1 overflow-y-auto">
          <NhtsaVinRecallPanel
            onLaunchGroundedSearch={(prefill) => {
              setGroundingPrefill(prefill);
              setActiveMode('LIVE_GROUNDING_SEARCH');
            }}
          />
        </div>
      ) : activeMode === 'BENCH_SCENARIOS' ? (
        <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto min-h-0 hud-panel rounded-[3px] p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#2b313c] pb-2.5">
            <div>
              <h3 className="text-xs sm:text-sm font-hud font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>OEM Bench Test Scenarios Database (PH / Regional Batches)</span>
              </h3>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                Verified fault simulation setups, target ECUs, and expected lab behaviors indexed for Fault Matrix, Offline AI, and Voice Assistant.
              </p>
            </div>
            <span className="text-[11px] px-2.5 py-1 rounded-[2px] bg-[#0d1912] border border-emerald-700/60 text-emerald-300 font-semibold self-start sm:self-auto shrink-0">
              Showing {filteredScenarios.length} of {BENCH_TEST_SCENARIOS.length} Scenarios
            </span>
          </div>

          {scenarioSaveStatus && (
            <div className="px-3 py-2 rounded-[2px] bg-[#1e170a] border border-amber-500/50 text-xs text-amber-200 flex items-center justify-between gap-2">
              <span className="font-sans">{scenarioSaveStatus}</span>
              <button
                type="button"
                onClick={() => setScenarioSaveStatus(null)}
                className="text-[10px] text-amber-300 hover:text-white underline shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {filteredScenarios.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-[#343c4b] rounded-[2px]">
              No bench test scenarios match "{scenarioQuery}".
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#2b313c] text-[10px] uppercase tracking-wider text-slate-400 bg-[#0d1015]">
                    <th className="py-2 px-2.5">#</th>
                    <th className="py-2 px-2.5">Brand / Market</th>
                    <th className="py-2 px-2.5">Target Module / Models</th>
                    <th className="py-2 px-2.5">DTC Code</th>
                    <th className="py-2 px-2.5">Fault Description</th>
                    <th className="py-2 px-2.5">Bench Simulation Setup</th>
                    <th className="py-2 px-2.5">Expected ECU / Lab Behavior</th>
                    <th className="py-2 px-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232934]">
                  {filteredScenarios.map((sc) => {
                    const isSaved = Boolean(savedScenarioIds[sc.id]);
                    const isSaving = savingScenarioId === sc.id;
                    return (
                      <tr key={sc.id} className="hover:bg-[#12161d] align-top">
                        <td className="py-2.5 px-2.5 font-bold text-slate-300 whitespace-nowrap">
                          #{sc.scenarioNumber}
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded-[2px] bg-[#1b212b] border border-[#343c4b] text-slate-200 text-[10px] font-semibold block w-fit">
                            {sc.brandLabel}
                          </span>
                          <span className="text-[10px] text-slate-500 font-sans block mt-0.5">{sc.market}</span>
                        </td>
                        <td className="py-2.5 px-2.5 font-semibold text-slate-100 min-w-[170px]">
                          {sc.targetModuleAndModels}
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-[2px] bg-[#1e170a] border border-amber-700/80 text-amber-300 font-bold text-[11px]">
                            {sc.dtcCode}
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5 text-slate-200 font-sans min-w-[160px]">
                          {sc.faultDescription}
                        </td>
                        <td className="py-2.5 px-2.5 text-slate-300 font-sans min-w-[220px] leading-relaxed">
                          {sc.benchSimulationSetup}
                        </td>
                        <td className="py-2.5 px-2.5 text-emerald-300 font-sans min-w-[220px] leading-relaxed">
                          {sc.expectedEcuBehavior}
                        </td>
                        <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                          <div className="flex flex-col items-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleSearchGroundingForDtc(`${sc.brandLabel} ${sc.dtcCode} ${sc.targetModuleAndModels}`)}
                              className="hw-btn px-2 py-1 rounded-[2px] text-amber-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Globe className="w-3 h-3" />
                              <span>Live TSB</span>
                            </button>
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleSaveScenarioToCloud(sc)}
                              className={`px-2 py-1 rounded-[2px] border text-[10px] font-bold flex items-center gap-1 transition cursor-pointer ${
                                isSaved
                                  ? 'hw-btn-green text-emerald-300'
                                  : 'hw-btn text-slate-200'
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-2 sm:gap-2.5 overflow-y-auto lg:overflow-hidden min-h-0">
          {showDtcAnalytics && (
            <DtcFrequencyWidget
              savedSessions={savedSessions}
              savedLogs={savedLogs}
              liveActiveDtcs={liveActiveDtcs}
              onSelectDtc={handleSelectDtcFromChart}
              onSearchGroundingDtc={handleSearchGroundingForDtc}
              onOpenSavedBenches={onOpenSavedBenches}
            />
          )}

          {/* Mobile Segmented Switcher (< lg): Manual Index vs Read Active Manual */}
          <div className="flex lg:hidden items-center gap-1 bg-[#0e1116] p-1 rounded-[2px] border border-[#2b313c] text-xs shrink-0">
            <button
              type="button"
              onClick={() => setMobileManualPane('INDEX')}
              className={`flex-1 py-1.5 px-2 rounded-[2px] text-center font-bold transition whitespace-nowrap ${
                mobileManualPane === 'INDEX'
                  ? 'hw-btn-amber text-amber-200'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Recent Guides ({filteredArticles.length})
            </button>
            <button
              type="button"
              onClick={() => setMobileManualPane('ARTICLE')}
              className={`flex-1 py-1.5 px-2 rounded-[2px] text-center font-bold transition whitespace-nowrap truncate ${
                mobileManualPane === 'ARTICLE'
                  ? 'hw-btn-amber text-amber-200'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Read Manual: {selectedArticle.dtcCode}
            </button>
          </div>

          <div className="flex-1 flex flex-col lg:flex-row gap-2.5 overflow-y-auto lg:overflow-hidden min-h-0">
            {/* Left Column: Recent Guides & DTCs */}
            <div
              className={`w-full lg:w-[370px] flex-col gap-2 hud-panel rounded-[3px] p-3 overflow-hidden shrink-0 flex-1 lg:flex-initial min-h-[260px] ${
                mobileManualPane === 'INDEX' ? 'flex' : 'hidden lg:flex'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] border-b border-[#2b313c] pb-2">
                <span className="font-hud font-bold text-slate-300 uppercase tracking-wider">
                  RECENT GUIDES &amp; DTCs
                </span>
                <span className="text-slate-500 text-[10px]">{filteredArticles.length} Manuals</span>
              </div>

              <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
                {filteredArticles.map((art) => {
                  const isSelected = selectedArticle.id === art.id;
                  return (
                    <div
                      key={art.id}
                      onClick={() => {
                        setSelectedArticle(art);
                        setMobileManualPane('ARTICLE');
                      }}
                      className={`p-2.5 rounded-[2px] border text-xs cursor-pointer transition flex items-center justify-between gap-2.5 ${
                        isSelected
                          ? 'bg-[#1c222d] border-amber-500/80 text-white'
                          : 'bg-[#101319] border-[#262c37] hover:border-[#3c4556] text-slate-300'
                      }`}
                    >
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-100 line-clamp-1">
                            {art.dtcCode} · {art.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-sans">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isSelected ? 'bg-amber-400' : 'bg-emerald-400'
                            }`}
                          />
                          <span className="text-amber-300 font-medium truncate">
                            {art.category.replace('_', ' ')}
                          </span>
                          <span className="text-emerald-400 truncate">
                            · {art.vehicleModel}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedArticle(art);
                          setMobileManualPane('ARTICLE');
                        }}
                        className={`px-2.5 py-1 rounded-[2px] text-[10px] font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                          isSelected ? 'hw-btn-amber text-amber-200' : 'hw-btn text-slate-200'
                        }`}
                      >
                        {art.images?.length ? 'View Schema' : 'View Guide'}
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setActiveMode('BENCH_SCENARIOS')}
                className="w-full py-2.5 px-3 rounded-[2px] bg-[#4c6183] hover:bg-[#587096] border border-[#6c83aa] text-white text-xs font-hud font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shrink-0"
              >
                <CheckCircle2 className="w-4 h-4 text-[#4ade80]" />
                <span>START A REPAIR WORKFLOW</span>
              </button>
            </div>

            {/* Right Column: Detailed Repair Manual View */}
            <div
              className={`flex-1 flex-col gap-3 hud-panel rounded-[3px] p-3 sm:p-4 overflow-y-auto min-h-0 ${
                mobileManualPane === 'ARTICLE' ? 'flex' : 'hidden lg:flex'
              }`}
            >
              {/* Article Header */}
              <div className="flex flex-col gap-1.5 border-b border-[#2b313c] pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setMobileManualPane('INDEX')}
                      className="lg:hidden hw-btn px-2 py-1 rounded-[2px] text-amber-300 text-[10px] font-bold"
                    >
                      &larr; All Manuals
                    </button>
                    <span className="px-2.5 py-1 rounded-[2px] bg-[#1e170a] border border-amber-600/80 text-amber-300 font-bold font-mono text-xs">
                      {selectedArticle.dtcCode}
                    </span>
                    <span className="text-[10px] text-emerald-400 font-semibold uppercase bg-[#0d1912] border border-emerald-800/70 px-2 py-0.5 rounded-[2px]">
                      {selectedArticle.category.replace('_', ' ')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLaunchArticleGrounding(selectedArticle)}
                    className="self-start sm:self-auto text-[11px] px-3 py-1.5 rounded-[2px] hw-btn-amber text-amber-200 flex items-center gap-1.5 font-mono font-semibold cursor-pointer"
                    title="Search live Google Search Grounding for this specific ECU & DTC"
                  >
                    <Globe className="w-3.5 h-3.5 text-amber-300" />
                    <span>Search Live OEM TSBs on Google</span>
                  </button>
                </div>
                <h1 className="text-base font-bold text-slate-100 tracking-wide mt-1">
                  {selectedArticle.title}
                </h1>
                <p className="text-xs text-slate-400 font-sans">
                  <strong className="text-slate-300">Vehicle Models:</strong> {selectedArticle.vehicleModel}
                </p>
              </div>

              {/* CPU Architecture & Hardware Note Box */}
              {selectedArticle.cpuArchitecture && (
                <div className="hw-lcd-well p-3 rounded-[2px] border border-[#2b313c] text-xs flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-[11px]">
                    <Cpu className="w-4 h-4 text-amber-400" />
                    <span>HARDWARE ARCHITECTURE NOTE:</span>
                  </div>
                  <p className="text-slate-300 font-sans text-xs leading-relaxed">
                    {selectedArticle.cpuArchitecture}
                  </p>
                  {selectedArticle.hardwareNote && (
                    <p className="text-amber-300 font-sans text-[11px] bg-[#1e170a] p-2 rounded-[2px] border border-amber-700/60 mt-1">
                      <strong>Bench Insight:</strong> {selectedArticle.hardwareNote}
                    </p>
                  )}
                </div>
              )}

              {/* Hardware Photographic Documentation Gallery */}
              {selectedArticle.images && selectedArticle.images.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-amber-400" />
                    <span>Physical Hardware &amp; PCB Photographic Documentation:</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedArticle.images.map((img, idx) => (
                      <div key={idx} className="hw-lcd-well p-2.5 rounded-[2px] border border-[#2b313c] flex flex-col gap-2">
                        <div className="relative aspect-video rounded-[2px] overflow-hidden border border-[#343c4b] bg-black flex items-center justify-center">
                          <img
                            src={img.url}
                            alt={img.caption}
                            className="w-full h-full object-contain hover:scale-105 transition-transform duration-200"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                        <p className="text-[11px] text-emerald-300 font-sans leading-relaxed">
                          <strong className="text-slate-200 font-semibold">Photo {idx + 1}:</strong> {img.caption}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Symptoms List */}
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Classic Symptoms &amp; Fault Manifestations:</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {selectedArticle.symptoms.map((symptom, idx) => (
                    <div key={idx} className="bg-[#0e1116] p-2.5 rounded-[2px] border border-[#262c37] text-xs text-slate-300 flex items-start gap-2">
                      <span className="w-5 h-5 rounded-[2px] bg-[#2a1215] border border-rose-700/80 text-rose-300 font-bold flex items-center justify-center shrink-0 text-[10px]">
                        {idx + 1}
                      </span>
                      <span className="font-sans leading-snug">{symptom}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Root Causes */}
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>Primary Root Causes &amp; ECU Damage Sources:</span>
                </h3>
                <div className="flex flex-col gap-2">
                  {selectedArticle.rootCauses.map((rc, idx) => (
                    <div key={idx} className="bg-[#0e1116] p-2.5 rounded-[2px] border border-[#262c37] flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-100 text-xs flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          {rc.cause}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-[2px] border ${
                            rc.severity === 'CRITICAL'
                              ? 'bg-[#2a1215] text-rose-300 border-rose-700/80'
                              : 'bg-[#1e170a] text-amber-300 border-amber-700/80'
                          }`}
                        >
                          {rc.severity}
                        </span>
                      </div>
                      <p className="text-slate-400 font-sans text-xs">{rc.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Repair Steps */}
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-emerald-400" />
                  <span>Step-by-Step Bench Repair &amp; Testing Procedure:</span>
                </h3>
                <div className="flex flex-col gap-2">
                  {selectedArticle.repairSteps.map((step) => (
                    <div key={step.stepNum} className="bg-[#0e1116] p-3 rounded-[2px] border border-[#262c37] flex items-start gap-3">
                      <span className="w-6 h-6 rounded-[2px] bg-[#0d1912] border border-emerald-600/80 font-bold text-emerald-300 flex items-center justify-center text-xs shrink-0 font-mono">
                        {step.stepNum}
                      </span>
                      <div className="flex flex-col gap-1 flex-1">
                        <span className="font-bold text-slate-100 text-xs">{step.action}</span>
                        <span className="text-[11px] text-emerald-300 bg-[#090d11] px-2 py-1 rounded-[2px] border border-[#242c37] font-mono">
                          <strong>Specification / Routing:</strong> {step.specification}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
