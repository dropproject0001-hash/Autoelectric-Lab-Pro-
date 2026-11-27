/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  ExternalLink,
  Globe,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Copy,
  ShieldCheck,
  Radio,
  BookmarkPlus,
  Car,
  CircuitBoard,
} from 'lucide-react';
import {
  performGroundedSearch,
  GroundedSearchResult,
} from '../services/groundedSearchService';
import { useTrialAccess } from '../context/TrialAccessContext';
import { LOCAL_WORKSTATION_UID, saveDiagnosticLog } from '../services/benchStorageService';
import { ProvenanceBadgeBar } from './ProvenanceBadgeBar';
import { buildProvenanceRecord } from '../utils/provenanceEngine';
import { toSafeExternalHttpUrl } from '../utils/safeExternalUrl';
import {
  buildStartMyCarGroundedQuery,
  buildStartMyCarProvenance,
  buildStartMyCarReferenceUrls,
  STARTMYCAR_CIRCUIT_FOCUSES,
  STARTMYCAR_PRESET_VEHICLES,
  StartMyCarScope,
} from '../utils/startMyCarReference';
import { getStartMyCarProfile } from '../services/startMyCarKnowledgeService';

export type GroundedSearchPanelMode = 'ECU_BENCH' | 'STARTMYCAR_FUSE';

interface GroundedSearchPanelProps {
  initialQuery?: string;
  initialDtc?: string;
  initialEcu?: string;
  initialVehicle?: { make?: string; model?: string; year?: string };
  initialMode?: GroundedSearchPanelMode;
  onApplyPinTarget?: (pinId: string) => void;
  className?: string;
}

const PRESET_QUERIES = [
  {
    label: 'Nissan MEC11/MEC22 K-Line Wakeup',
    query: 'Hitachi MEC11-251 MEC22-251 Nissan N16 QG16 bench pinout K-line Pin 88 wake-up wiring',
    ecu: 'Hitachi MEC11-251 / MEC22-251',
    dtc: 'K-LINE / NO-COMM',
  },
  {
    label: 'Toyota 1KD-FTV P0093 & Dual-CPU',
    query: 'Toyota Hilux 1KD-FTV 2KD-FTV DTC P0093 fuel leak CPU 2 fast flashing engine light crystal oscillator',
    ecu: 'Denso 1KD/2KD Dual-CPU',
    dtc: 'P0093',
  },
  {
    label: 'Marelli 5NF TLE9135PD Jumper',
    query: 'Magneti Marelli IAW 5NF TLE9135PD pin 10 water temperature sensor jumper pin 35 36 1R resistor',
    ecu: 'Magneti Marelli IAW 5NF',
    dtc: 'IAW-5NF-TEMP',
  },
  {
    label: 'P0122 TPS Low Voltage Bench Test',
    query: 'DTC P0122 Throttle Position Sensor Circuit Low Input bench diagnostic voltage 5V reference ground test',
    ecu: 'Universal Bench Testing',
    dtc: 'P0122',
  },
  {
    label: 'CAN Bus 60Ω Termination Fault',
    query: 'CAN Bus 60 Ohm split termination 120 ohm resistance fault U0100 bench diagnostic oscilloscope',
    ecu: 'High-Speed Powertrain CAN',
    dtc: 'U0100',
  },
  {
    label: 'Bosch ME7.5 Boot Pin 65 Recovery',
    query: 'Bosch ME7.5 C167 ST10 boot mode pin 65 1k ohm ground bench flash K-Line recovery',
    ecu: 'Bosch ME7.5 / ME7.1.1',
    dtc: 'P0606',
  },
  {
    label: 'Ford SID208 18V FEPS Protocol',
    query: 'Ford Ranger SID208 PCM bench flashing 18V FEPS Pin B12 programming voltage HS-CAN',
    ecu: 'Ford Continental SID208',
    dtc: 'P0215',
  },
];

export const GroundedSearchPanel: React.FC<GroundedSearchPanelProps> = ({
  initialQuery = '',
  initialDtc = '',
  initialEcu = '',
  initialVehicle,
  initialMode = 'ECU_BENCH',
  className = '',
}) => {
  const { canUseAi, openAccessModal } = useTrialAccess();
  const [panelMode, setPanelMode] = useState<GroundedSearchPanelMode>(initialMode);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [ecuModel, setEcuModel] = useState(initialEcu);
  const [dtcCode, setDtcCode] = useState(initialDtc);

  // StartMyCar Fuse Box & Relay Lookup state
  const [smcMake, setSmcMake] = useState(initialVehicle?.make || '');
  const [smcModel, setSmcModel] = useState(initialVehicle?.model || '');
  const [smcYear, setSmcYear] = useState(initialVehicle?.year || '');
  const [smcScope, setSmcScope] = useState<StartMyCarScope>('FUSE_BOX');
  const [smcFocus, setSmcFocus] = useState<string>(STARTMYCAR_CIRCUIT_FOCUSES[0]);
  const [smcSiteRestricted, setSmcSiteRestricted] = useState(true);
  const [smcSelectedBoxIndex, setSmcSelectedBoxIndex] = useState<number>(0);
  const [smcShowAllCavities, setSmcShowAllCavities] = useState<boolean>(false);

  const offlineVehicleProfile = useMemo(() => {
    if (!smcMake.trim() || !smcModel.trim()) return null;
    const yr = Number(smcYear) || 2020;
    return (
      getStartMyCarProfile(smcMake, smcModel, yr) ||
      getStartMyCarProfile(smcMake, smcModel, 2020) ||
      getStartMyCarProfile(smcMake, smcModel, 2019) ||
      getStartMyCarProfile(smcMake, smcModel, 2018) ||
      getStartMyCarProfile(smcMake, smcModel, 2016)
    );
  }, [smcMake, smcModel, smcYear]);

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<GroundedSearchResult | null>(null);
  const [lastContextType, setLastContextType] = useState<'ECU_BENCH_TESTING' | 'FUSE_RELAY_DIAGRAM'>('ECU_BENCH_TESTING');
  const [copied, setCopied] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);

  useEffect(() => {
    if (initialQuery) setSearchQuery(initialQuery);
    if (initialEcu) setEcuModel(initialEcu);
    if (initialDtc) setDtcCode(initialDtc);
  }, [initialQuery, initialEcu, initialDtc]);

  useEffect(() => {
    if (initialVehicle) {
      if (initialVehicle.make !== undefined) setSmcMake(initialVehicle.make);
      if (initialVehicle.model !== undefined) setSmcModel(initialVehicle.model);
      if (initialVehicle.year !== undefined) setSmcYear(initialVehicle.year);
    }
    if (initialMode) {
      setPanelMode(initialMode);
    }
  }, [initialVehicle, initialMode]);

  const startMyCarLinks = useMemo(
    () => buildStartMyCarReferenceUrls({ make: smcMake, model: smcModel, year: smcYear }),
    [smcMake, smcModel, smcYear]
  );

  const startMyCarProvenance = useMemo(
    () =>
      buildStartMyCarProvenance({
        make: smcMake,
        model: smcModel,
        year: smcYear,
        targetUrl: startMyCarLinks.fuseBoxUrl,
      }),
    [smcMake, smcModel, smcYear, startMyCarLinks.fuseBoxUrl]
  );

  const handleSearch = async (
    queryText?: string,
    ecuOverride?: string,
    dtcOverride?: string,
    contextOverride: 'ECU_BENCH_TESTING' | 'FUSE_RELAY_DIAGRAM' = 'ECU_BENCH_TESTING'
  ) => {
    const q = queryText !== undefined ? queryText : searchQuery;
    const ecu = ecuOverride !== undefined ? ecuOverride : ecuModel;
    const dtc = dtcOverride !== undefined ? dtcOverride : dtcCode;

    if (!q.trim()) return;

    setIsLoading(true);
    setResult(null);
    setIsBookmarked(false);
    setLastContextType(contextOverride);

    try {
      const res = await performGroundedSearch({
        query: q.trim(),
        ecuModel: ecu.trim() || undefined,
        dtcCode: dtc.trim() || undefined,
        contextType: contextOverride,
        customPrompt:
          contextOverride === 'FUSE_RELAY_DIAGRAM'
            ? `StartMyCar external diagram route: ${startMyCarLinks.fuseBoxUrl}`
            : undefined,
      });
      setResult(res);
    } catch (err: unknown) {
      console.error('Search error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPreset = (preset: typeof PRESET_QUERIES[0]) => {
    setPanelMode('ECU_BENCH');
    setSearchQuery(preset.query);
    setEcuModel(preset.ecu);
    setDtcCode(preset.dtc);
    void handleSearch(preset.query, preset.ecu, preset.dtc, 'ECU_BENCH_TESTING');
  };

  const handleStartMyCarSearch = (overrides?: {
    make?: string;
    model?: string;
    year?: string;
    focus?: string;
    scope?: StartMyCarScope;
  }) => {
    const makeVal = overrides?.make ?? smcMake;
    const modelVal = overrides?.model ?? smcModel;
    const yearVal = overrides?.year ?? smcYear;
    const focusVal = overrides?.focus ?? smcFocus;
    const scopeVal = overrides?.scope ?? smcScope;

    const payload = buildStartMyCarGroundedQuery({
      make: makeVal,
      model: modelVal,
      year: yearVal,
      circuitFocus: focusVal,
      scope: scopeVal,
      includeSiteFilter: smcSiteRestricted,
    });

    setSearchQuery(payload.query);
    setEcuModel(payload.ecu);
    setDtcCode(payload.dtc);
    void handleSearch(payload.query, payload.ecu, payload.dtc, 'FUSE_RELAY_DIAGRAM');
  };

  const handleCopyReport = async () => {
    if (!result?.answer) return;
    try {
      await navigator.clipboard.writeText(result.answer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const [bookmarkQueuedOffline, setBookmarkQueuedOffline] = useState(false);

  const handleBookmarkResult = async () => {
    if (!result || result.status !== 'SUCCESS' || isSavingBookmark) return;
    setIsSavingBookmark(true);
    try {
      const res = await saveDiagnosticLog(LOCAL_WORKSTATION_UID, {
        title:
          (lastContextType === 'FUSE_RELAY_DIAGRAM'
            ? `StartMyCar Fuse/Relay: ${startMyCarLinks.displayLabel}`
            : searchQuery.trim()
          ).slice(0, 150) || 'Grounded OEM TSB Lookup',
        dtcCode: dtcCode.trim(),
        ecuModel: ecuModel.trim(),
        sourceType: 'GROUNDED_TSB',
        summary: result.answer,
        sources: result.sources,
      });
      setBookmarkQueuedOffline(res.queuedOffline);
      setIsBookmarked(true);
    } catch (err) {
      console.error('Failed to bookmark TSB:', err);
    } finally {
      setIsSavingBookmark(false);
    }
  };

  return (
    <div className={`flex flex-col gap-3 hud-panel rounded-[3px] p-3.5 font-mono ${className}`}>
      {/* Header bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 border-b border-[#2b313c] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[2px] bg-[#0e1410] border border-emerald-600/60 flex items-center justify-center shrink-0">
            {panelMode === 'STARTMYCAR_FUSE' ? (
              <CircuitBoard className="w-4 h-4 text-amber-400" />
            ) : (
              <Globe className="w-4 h-4 text-emerald-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-hud font-bold text-xs sm:text-sm text-slate-100 tracking-wide uppercase">
                Google Search Grounded OEM &amp; Fuse Box Intel
              </span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-[2px] bg-[#1e170a] border border-amber-700/70 text-amber-300 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                Model Failover (Hydrogen / Flash-Lite)
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans mt-0.5">
              Live web retrieval for OEM bulletins, bench wiring, and StartMyCar fuse box &amp; relay references
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          {/* Segmented Mode Selector */}
          <div className="flex items-center gap-1 bg-[#090b0f] p-1 rounded-[2px] border border-[#2b313c] text-[10.5px]">
            <button
              type="button"
              onClick={() => setPanelMode('ECU_BENCH')}
              className={`px-2.5 py-1 rounded-[2px] font-bold transition whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                panelMode === 'ECU_BENCH'
                  ? 'hw-btn-green text-emerald-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe className="w-3 h-3" />
              <span>ECU &amp; DTC Intel</span>
            </button>
            <button
              type="button"
              onClick={() => setPanelMode('STARTMYCAR_FUSE')}
              className={`px-2.5 py-1 rounded-[2px] font-bold transition whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                panelMode === 'STARTMYCAR_FUSE'
                  ? 'hw-btn-amber text-amber-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CircuitBoard className="w-3 h-3" />
              <span>StartMyCar Fuse &amp; Relay</span>
            </button>
          </div>

          {result && (
            <div className="flex items-center gap-2">
              {result.status === 'SUCCESS' && (
                <button
                  type="button"
                  onClick={handleBookmarkResult}
                  disabled={isSavingBookmark || isBookmarked}
                  className="hw-btn-amber flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-[2px] disabled:opacity-75 text-amber-200 cursor-pointer whitespace-nowrap"
                  title="Save this TSB & sources to your Local Diagnostic Logs"
                >
                  {isBookmarked ? (
                    <>
                      <CheckCircle2 className={`w-3.5 h-3.5 ${bookmarkQueuedOffline ? 'text-amber-400' : 'text-emerald-400'}`} />
                      <span className={bookmarkQueuedOffline ? 'text-amber-300' : 'text-emerald-300'}>
                        {bookmarkQueuedOffline ? 'Queued Offline' : 'Saved to Logs'}
                      </span>
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="w-3.5 h-3.5 text-amber-400" />
                      <span>{isSavingBookmark ? 'Saving...' : 'Save Log'}</span>
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={handleCopyReport}
                className="hw-btn flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-[2px] text-slate-300 cursor-pointer whitespace-nowrap"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copy Intel</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {panelMode === 'STARTMYCAR_FUSE' ? (
        <div className="flex flex-col gap-3">
          {/* Preset Vehicles for StartMyCar */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Quick Vehicle Fuse Box &amp; Relay Presets (StartMyCar Companion):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {STARTMYCAR_PRESET_VEHICLES.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    setSmcMake(preset.make);
                    setSmcModel(preset.model);
                    setSmcYear(preset.year);
                    setSmcFocus(preset.focus);
                    handleStartMyCarSearch({
                      make: preset.make,
                      model: preset.model,
                      year: preset.year,
                      focus: preset.focus,
                    });
                  }}
                  className="hw-btn text-[10px] px-2.5 py-1 rounded-[2px] hover:border-amber-500/70 hover:text-amber-200 text-slate-300 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  <Car className="w-3 h-3 text-amber-400" />
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* StartMyCar Structured Vehicle Lookup Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleStartMyCarSearch();
            }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2"
          >
            <input
              type="text"
              aria-label="Vehicle Make for StartMyCar"
              value={smcMake}
              onChange={(e) => setSmcMake(e.target.value)}
              placeholder="Make (e.g. Toyota)"
              disabled={isLoading}
              className="hw-lcd-well rounded-[2px] px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
            />
            <input
              type="text"
              aria-label="Vehicle Model for StartMyCar"
              value={smcModel}
              onChange={(e) => setSmcModel(e.target.value)}
              placeholder="Model (e.g. Corolla)"
              disabled={isLoading}
              className="hw-lcd-well rounded-[2px] px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
            />
            <input
              type="text"
              aria-label="Vehicle Year for StartMyCar"
              value={smcYear}
              onChange={(e) => setSmcYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Year (Opt)"
              disabled={isLoading}
              className="hw-lcd-well rounded-[2px] px-2.5 py-2 text-xs text-amber-300 placeholder-slate-600 focus:outline-none focus:border-amber-500 text-center font-mono tabular-nums"
            />
            <select
              aria-label="StartMyCar Compartment Scope"
              value={smcScope}
              onChange={(e) => setSmcScope(e.target.value as StartMyCarScope)}
              disabled={isLoading}
              className="hw-lcd-well rounded-[2px] px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-sans"
            >
              <option value="FUSE_BOX" className="bg-[#0e1116]">All Fuse Boxes &amp; Relays</option>
              <option value="ENGINE_BAY_RELAY" className="bg-[#0e1116]">Engine Bay Relays / PDM</option>
              <option value="INTERIOR_CABIN" className="bg-[#0e1116]">Interior / Cabin Junction</option>
              <option value="OWNERS_MANUAL" className="bg-[#0e1116]">Owner&apos;s Manual / Indicators</option>
            </select>
            <select
              aria-label="Target Electrical Circuit Focus"
              value={smcFocus}
              onChange={(e) => setSmcFocus(e.target.value)}
              disabled={isLoading}
              className="hw-lcd-well rounded-[2px] px-2.5 py-2 text-xs text-emerald-300 focus:outline-none focus:border-amber-500 font-sans"
            >
              {STARTMYCAR_CIRCUIT_FOCUSES.map((focusOption) => (
                <option key={focusOption} value={focusOption} className="bg-[#0e1116]">
                  {focusOption}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={isLoading || (!smcMake.trim() && !smcModel.trim())}
              className="hw-btn-amber px-3 py-2 disabled:opacity-50 rounded-[2px] text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Radio className="w-3.5 h-3.5 animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Search StartMyCar</span>
                </>
              )}
            </button>
          </form>

          {/* Direct Verified External Links & Provenance Bar */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2 hw-lcd-well rounded-[2px] p-2.5 border border-[#2b313c]">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[11px] font-bold text-slate-100 truncate">
                  Direct Interactive Diagram Link: {startMyCarLinks.displayLabel}
                </span>
                <span className="text-[10px] text-slate-400 font-mono truncate">
                  {startMyCarLinks.fuseBoxUrl}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <label className="flex items-center gap-1.5 text-[10px] text-slate-300 font-sans cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={smcSiteRestricted}
                    onChange={(e) => setSmcSiteRestricted(e.target.checked)}
                    className="accent-amber-500"
                  />
                  <span>Restrict Google Search to startmycar.com</span>
                </label>
                <a
                  href={startMyCarLinks.fuseBoxUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hw-btn-green px-3 py-1.5 rounded-[2px] text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>
                    {startMyCarLinks.hasVehicleSpecificPath
                      ? 'Open Fuse Box Diagram'
                      : startMyCarLinks.hasMakeSlug
                        ? 'Open Make Models'
                        : 'Open StartMyCar'}
                  </span>
                </a>
                {startMyCarLinks.hasVehicleSpecificPath && (
                  <a
                    href={startMyCarLinks.vehicleHubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hw-btn px-2.5 py-1.5 rounded-[2px] text-[11px] text-slate-200 flex items-center gap-1 whitespace-nowrap"
                  >
                    <ExternalLink className="w-3 h-3 text-amber-400" />
                    <span>Vehicle Hub</span>
                  </a>
                )}
              </div>
            </div>

            <ProvenanceBadgeBar provenance={startMyCarProvenance} compact />

            {/* Offline Ingested Data Viewer */}
            {offlineVehicleProfile && (
              <div className="flex flex-col gap-2.5 bg-[#0e1116] border border-amber-500/30 rounded-[2px] p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2b313c] pb-2">
                  <div className="flex items-center gap-2">
                    <CircuitBoard className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-slate-100 text-[12px]">
                      Offline Ingested Fuse &amp; Relay Directory ({offlineVehicleProfile.identification.year} {offlineVehicleProfile.identification.make} {offlineVehicleProfile.identification.model})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-[2px] border ${
                      offlineVehicleProfile.provenance.tier === 'VERIFIED'
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                        : 'bg-blue-950/60 text-blue-300 border-blue-500/40'
                    }`}>
                      Tier: {offlineVehicleProfile.provenance.tier}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-[2px] border border-slate-700">
                      {offlineVehicleProfile.powerDistribution.totalCavities} Cavities ({offlineVehicleProfile.powerDistribution.totalBoxes} Boxes)
                    </span>
                  </div>
                </div>

                {offlineVehicleProfile.identification.enginesDetected.length > 0 && (
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                    <span className="text-slate-500 uppercase text-[9px] font-semibold">Engines Detected:</span>
                    {offlineVehicleProfile.identification.enginesDetected.map((eng, idx) => (
                      <span key={idx} className="bg-slate-800/80 text-amber-200/90 px-1.5 py-0.5 rounded-[2px] text-[10px] font-mono">
                        {eng}
                      </span>
                    ))}
                  </div>
                )}

                {/* Box Selector Tabs */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {offlineVehicleProfile.powerDistribution.boxes.map((box, bIdx) => (
                    <button
                      key={bIdx}
                      type="button"
                      onClick={() => {
                        setSmcSelectedBoxIndex(bIdx);
                        setSmcShowAllCavities(false);
                      }}
                      className={`text-[10px] px-2.5 py-1 rounded-[2px] font-medium transition-colors cursor-pointer border ${
                        smcSelectedBoxIndex === bIdx
                          ? 'bg-amber-500/20 text-amber-200 border-amber-500/60 font-bold'
                          : 'bg-slate-900/60 text-slate-400 border-slate-700/60 hover:text-slate-200'
                      }`}
                    >
                      {box.boxName} ({box.fuses.length})
                    </button>
                  ))}
                </div>

                {/* Active Box Cavity Table */}
                {(() => {
                  const currentBox = offlineVehicleProfile.powerDistribution.boxes[smcSelectedBoxIndex] || offlineVehicleProfile.powerDistribution.boxes[0];
                  if (!currentBox) return null;

                  const displayedFuses = smcShowAllCavities
                    ? currentBox.fuses
                    : currentBox.fuses.filter(f => f.circuitRole === 'ECU_POWER' || f.circuitRole === 'SENSOR_VREF' || f.circuitRole === 'OBD2_DLC' || f.circuitRole === 'FUEL_PUMP' || f.circuitRole === 'IGNITION');

                  const finalFuses = displayedFuses.length > 0 ? displayedFuses : currentBox.fuses.slice(0, 10);

                  return (
                    <div className="flex flex-col gap-2 pt-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                          <span>{currentBox.boxName}</span>
                          <span className="text-slate-500 font-normal">({currentBox.location})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setSmcShowAllCavities(!smcShowAllCavities)}
                          className="text-[10px] text-amber-400 hover:text-amber-300 underline cursor-pointer"
                        >
                          {smcShowAllCavities
                            ? 'Show Key Powertrain & Sensor Feeds Only'
                            : `View All ${currentBox.fuses.length} Cavities`}
                        </button>
                      </div>

                      <div className="overflow-x-auto max-h-56 overflow-y-auto border border-[#2b313c] rounded-[2px]">
                        <table className="w-full text-left text-[11px] border-collapse">
                          <thead className="bg-[#1a202c] text-slate-400 text-[10px] uppercase font-semibold sticky top-0">
                            <tr>
                              <th className="py-1 px-2">No.</th>
                              <th className="py-1 px-2">Type</th>
                              <th className="py-1 px-2">Rating</th>
                              <th className="py-1 px-2">Description</th>
                              <th className="py-1 px-2">Circuit Role</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                            {finalFuses.map((fuse) => (
                              <tr key={fuse.id} className="hover:bg-slate-800/40">
                                <td className="py-1 px-2 font-bold text-amber-300">{fuse.id}</td>
                                <td className="py-1 px-2 text-slate-400 text-[10px] uppercase">{fuse.type}</td>
                                <td className="py-1 px-2 text-emerald-400 font-bold">{fuse.amp ? `${fuse.amp}A` : '—'}</td>
                                <td className="py-1 px-2 font-sans text-slate-200">{fuse.description}</td>
                                <td className="py-1 px-2">
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded-[2px] font-bold ${
                                    fuse.circuitRole === 'ECU_POWER'
                                      ? 'bg-blue-900/60 text-blue-300'
                                      : fuse.circuitRole === 'SENSOR_VREF'
                                      ? 'bg-amber-900/60 text-amber-300'
                                      : fuse.circuitRole === 'FUEL_PUMP'
                                      ? 'bg-emerald-900/60 text-emerald-300'
                                      : fuse.circuitRole === 'OBD2_DLC'
                                      ? 'bg-purple-900/60 text-purple-300'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}>
                                    {fuse.circuitRole}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Query Preset Badges */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Automotive Bench Presets (Click to Search Live Google Grounding):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_QUERIES.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  disabled={isLoading}
                  className="hw-btn text-[10px] px-2 py-1 rounded-[2px] hover:border-amber-500/70 hover:text-amber-200 text-slate-300 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Zap className="w-2.5 h-2.5 text-amber-400" />
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Main Search Input Form */}
          <form
            onSubmit={e => {
              e.preventDefault();
              void handleSearch(undefined, undefined, undefined, 'ECU_BENCH_TESTING');
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search ECU part number, DTC code, pinout wiring, or failure mode..."
                disabled={isLoading}
                className="w-full hw-lcd-well rounded-[2px] pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
              />
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={ecuModel}
                onChange={e => setEcuModel(e.target.value)}
                placeholder="ECU (Optional)"
                disabled={isLoading}
                className="w-32 sm:w-36 hw-lcd-well rounded-[2px] px-2.5 py-2 text-xs text-emerald-300 placeholder-slate-600 focus:outline-none focus:border-amber-500 text-center font-mono"
              />

              <input
                type="text"
                value={dtcCode}
                onChange={e => setDtcCode(e.target.value)}
                placeholder="DTC (Opt)"
                disabled={isLoading}
                className="w-24 hw-lcd-well rounded-[2px] px-2.5 py-2 text-xs text-amber-300 placeholder-slate-600 focus:outline-none focus:border-amber-500 text-center font-mono uppercase"
              />

              <button
                type="submit"
                disabled={isLoading || !searchQuery.trim()}
                className="hw-btn-green px-4 py-2 disabled:opacity-50 rounded-[2px] text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Radio className="w-3.5 h-3.5 animate-spin" />
                    <span>Searching Google...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5" />
                    <span>Search Live</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </>
      )}

      {/* Loading state indicator */}
      {isLoading && (
        <div className="p-6 rounded-[2px] hw-lcd-well border border-amber-600/50 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-amber-500/20 border-t-amber-400 animate-spin flex items-center justify-center">
            <Globe className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-slate-200">Executing Google Search Grounding with Gemini 4 Hydrogen</p>
            <p className="text-[11px] text-slate-400 font-sans mt-0.5">
              Querying OEM automotive databases, technical service bulletins, and bench wiring specifications...
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {result?.status === 'ERROR' && (
        <div className="p-3.5 rounded-[2px] bg-[#2a1215] border border-rose-800 text-rose-300 text-xs flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="font-bold">Google Grounding Query Notice:</span>
              <span className="font-sans text-[11px]">{result.error || result.answer}</span>
            </div>
          </div>
          {!canUseAi && (
            <button
              type="button"
              onClick={() =>
                openAccessModal({
                  tab: 'TRIAL_PIN',
                  notice:
                    'Enter an active 8-digit Trial PIN or Master Admin PIN to run Live OEM AI Search.',
                })
              }
              className="hw-btn-amber shrink-0 px-2.5 py-1.5 rounded-[2px] text-[11px] font-bold cursor-pointer"
            >
              Enter Trial PIN
            </button>
          )}
        </div>
      )}

      {/* Grounding Results Display */}
      {result?.status === 'SUCCESS' && (
        <div className="flex flex-col gap-3">
          <ProvenanceBadgeBar
            provenance={buildProvenanceRecord({
              origin: 'GEMINI_GROUNDED_SEARCH',
              sourceName: `Gemini Live Grounding (${result.model})`,
              sourceUrlOrRef: result.sources[0]?.uri || 'https://ai.google.dev/',
              manufacturer: ecuModel.trim() || 'Cross-OEM Grounded Search',
              applicableVehicle: searchQuery.trim().slice(0, 100) || 'Diagnostic Query',
              publicationOrRevision: `${result.sources.length} Web Sources Retrieved`,
              confidenceOrUncertainty:
                'AI_INFERRED — Do NOT apply physical bench voltage or assume ECU pinouts from AI output alone. Cross-check retrieved factory manuals first.',
              regionalApplicability: ['GLOBAL'],
              dateRetrieved: result.timestamp,
            })}
          />
          {/* Grounding Metadata Pill Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 hw-lcd-well p-2.5 rounded-[2px] text-[10px]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-400">ACTIVE MODEL:</span>
              <span className="text-amber-300 font-bold">{result.model}</span>
              {result.reroutedFrom && (
                <span className="bg-[#1e170a] border border-amber-600/70 text-amber-300 px-2 py-0.5 rounded-[2px] font-bold flex items-center gap-1">
                  <RotateCcw className="w-3 h-3 text-amber-400" />
                  Fallback from {result.reroutedFrom} (Transient failure)
                </span>
              )}
              <span className="text-slate-700">|</span>
              <span className="text-slate-400">SEARCH SOURCES:</span>
              <span className="text-emerald-400 font-bold">{result.sources.length} Verified Web Sources</span>
            </div>
            {result.searchQueries.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-500">QUERIES:</span>
                {result.searchQueries.map((q, idx) => (
                  <span
                    key={idx}
                    className="bg-[#13171f] px-2 py-0.5 rounded-[2px] border border-[#2b313c] text-slate-300 font-mono text-[9px]"
                  >
                    "{q}"
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Web Sources Grid (Grounding Links) */}
          {result.sources.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <ExternalLink className="w-3 h-3 text-amber-400" />
                <span>Verified OEM &amp; Automotive Technical Sources:</span>
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {result.sources.map((source, idx) => {
                  const safeHref = toSafeExternalHttpUrl(source.uri);
                  if (!safeHref) {
                    return (
                      <div
                        key={idx}
                        className="bg-[#0e1116] p-2.5 rounded-[2px] border border-[#2b313c] flex flex-col justify-between gap-1"
                      >
                        <span className="font-sans font-semibold text-xs text-slate-300 line-clamp-1">
                          {source.title}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono truncate">{source.domain}</span>
                      </div>
                    );
                  }
                  return (
                    <a
                      key={idx}
                      href={safeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-[#0e1116] hover:bg-[#151a22] p-2.5 rounded-[2px] border border-[#2b313c] hover:border-amber-500/60 transition flex flex-col justify-between gap-1 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-sans font-semibold text-xs text-slate-200 group-hover:text-amber-300 line-clamp-1">
                          {source.title}
                        </span>
                        <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-amber-400 shrink-0 mt-0.5" />
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono truncate">{source.domain}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Diagnostic Answer / Technical Guide Body */}
          <div className="hw-lcd-well p-4 rounded-[2px] flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[#242a34] pb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-xs text-slate-200 uppercase tracking-wider">
                  Grounding Diagnostic Analysis &amp; Bench Procedures
                </span>
              </div>
              <span className="text-[10px] text-slate-500">
                Retrieved: {new Date(result.timestamp).toLocaleTimeString()}
              </span>
            </div>

            {/* Structured Markdown Rendering */}
            <div className="text-xs text-slate-300 font-sans leading-relaxed whitespace-pre-wrap break-words selection:bg-amber-900">
              {result.answer}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
