/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useMemo, useState } from 'react';
import {
  Car,
  Search,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  BookmarkPlus,
  Globe,
  Radio,
  Info,
  Flame,
  Cpu,
  Clock,
  Layers,
  Database,
  RefreshCw,
  ExternalLink,
  CircuitBoard,
} from 'lucide-react';
import { useTrialAccess } from '../context/TrialAccessContext';
import { buildStartMyCarReferenceUrls } from '../utils/startMyCarReference';
import { LOCAL_WORKSTATION_UID, saveDiagnosticLog } from '../services/benchStorageService';
import {
  lookupComplaintsByVehicle,
  lookupRecallsByVehicle,
  lookupVehicleMakesAndWmi,
  lookupVinWithRecalls,
  NhtsaMakeModelDirectoryResponse,
  NhtsaVehicleLookupResponse,
} from '../services/nhtsaClientService';
import { ProvenanceBadgeBar } from './ProvenanceBadgeBar';
import {
  OBDB_DATASET_VALIDATION,
  OBDB_LICENSE_SPDX,
  OBDB_PINNED_COMMIT,
  OBDB_PROVENANCE,
  OBDB_SAEJ1979_PIDS,
  searchObdbPids,
} from '../data/obdb/obdbLoader';
import { RegionalMarket } from '../types/provenance';
import { filterRegionalCatalog, resolveRegionalAliases } from '../utils/regionalKnowledgeCatalog';
import { REGIONAL_MARKET_LABELS } from '../utils/provenanceEngine';

interface NhtsaVinRecallPanelProps {
  onLaunchGroundedSearch?: (prefill: {
    query: string;
    ecu: string;
    dtc: string;
    vehicle?: { make: string; model: string; year?: string };
    openStartMyCar?: boolean;
  }) => void;
  className?: string;
}

const EXAMPLE_VIN_PRESETS = [
  {
    label: '2016 Ford F-150 5.0L Example VIN',
    vin: '1FTEW1EF3GKE12345',
    year: '2016',
  },
  {
    label: '2018 Honda Civic 1.5T Example VIN',
    vin: '2HGFC1F3XJH123456',
    year: '2018',
  },
];

const EXAMPLE_VEHICLE_PRESETS = [
  { label: '2020 Toyota Corolla', make: 'Toyota', model: 'Corolla', year: '2020' },
  { label: '2019 Ford Ranger', make: 'Ford', model: 'Ranger', year: '2019' },
  { label: '2018 Nissan Sentra', make: 'Nissan', model: 'Sentra', year: '2018' },
];

type LookupTab = 'VIN' | 'RECALLS_COMPLAINTS' | 'WMI_DIRECTORY' | 'REGIONAL_OBDB';

export const NhtsaVinRecallPanel: React.FC<NhtsaVinRecallPanelProps> = ({
  onLaunchGroundedSearch,
  className = '',
}) => {
  const { canUseAi, openAccessModal } = useTrialAccess();
  const [lookupMode, setLookupMode] = useState<LookupTab>('VIN');

  // VIN form
  const [vinInput, setVinInput] = useState('');
  const [vinYearInput, setVinYearInput] = useState('');

  // Make/Model/Year Recalls + Complaints form
  const [makeInput, setMakeInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [yearInput, setYearInput] = useState('');
  const [safetyScope, setSafetyScope] = useState<'BOTH' | 'RECALLS_ONLY' | 'COMPLAINTS_ONLY'>('BOTH');

  // WMI / Makes Directory form
  const [wmiInput, setWmiInput] = useState('');
  const [mfrInput, setMfrInput] = useState('');
  const [dirMakeInput, setDirMakeInput] = useState('');
  const [dirYearInput, setDirYearInput] = useState('');
  const [dirResult, setDirResult] = useState<NhtsaMakeModelDirectoryResponse | null>(null);

  // Regional & OBDb browser state
  const [regionFilter, setRegionFilter] = useState<RegionalMarket | 'ALL'>('PHILIPPINES');
  const [regionalSearch, setRegionalSearch] = useState('');
  const [pidQuery, setPidQuery] = useState('');
  const [subDatasetTab, setSubDatasetTab] = useState<'REGIONAL' | 'OBDB_PIDS'>('REGIONAL');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<NhtsaVehicleLookupResponse | null>(null);
  const [activeVehicleLabel, setActiveVehicleLabel] = useState('');

  const [isSavingLog, setIsSavingLog] = useState(false);
  const [savedState, setSavedState] = useState<'NONE' | 'SYNCED' | 'QUEUED'>('NONE');

  const filteredRegionalRecords = useMemo(
    () => filterRegionalCatalog(regionFilter, regionalSearch),
    [regionFilter, regionalSearch]
  );

  const filteredObdbPids = useMemo(() => searchObdbPids(pidQuery, 50), [pidQuery]);

  const runVinSearch = async (vinOverride?: string, yearOverride?: string) => {
    const vin = (vinOverride ?? vinInput).trim().toUpperCase();
    const yr = (yearOverride ?? vinYearInput).trim();
    if (!vin) return;

    setIsLoading(true);
    setErrorMsg(null);
    setResult(null);
    setSavedState('NONE');
    try {
      const res = await lookupVinWithRecalls(vin, yr || undefined);
      setResult(res);
      const v = res.decodedVin;
      const label = v
        ? [v.modelYear, v.make, v.model, v.displacementL ? `${v.displacementL}L` : '']
            .filter(Boolean)
            .join(' ') || v.vin
        : vin;
      setActiveVehicleLabel(label);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'VIN lookup failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const runVehicleSearch = async (
    makeOverride?: string,
    modelOverride?: string,
    yearOverride?: string
  ) => {
    const mk = (makeOverride ?? makeInput).trim();
    const md = (modelOverride ?? modelInput).trim();
    const yr = (yearOverride ?? yearInput).trim();
    if (!mk || !md || !yr) return;

    setIsLoading(true);
    setErrorMsg(null);
    setResult(null);
    setSavedState('NONE');
    try {
      const res =
        safetyScope === 'COMPLAINTS_ONLY'
          ? await lookupComplaintsByVehicle(mk, md, yr)
          : await lookupRecallsByVehicle(mk, md, yr);
      setResult(res);
      setActiveVehicleLabel(`${yr} ${mk} ${md}`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Vehicle safety lookup failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const runDirectoryLookup = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    setDirResult(null);
    try {
      const res = await lookupVehicleMakesAndWmi({
        wmi: wmiInput.trim() || undefined,
        manufacturer: mfrInput.trim() || undefined,
        make: dirMakeInput.trim() || undefined,
        year: dirYearInput.trim() || undefined,
      });
      setDirResult(res);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'NHTSA vPIC directory lookup failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveToLogs = async () => {
    if (!result || isSavingLog) return;
    setIsSavingLog(true);
    try {
      const v = result.decodedVin;
      const lines: string[] = [
        `Verification Status: ${result.verificationStatus} (${result.provenance.sourceName})`,
        `Retrieved At: ${result.fetchedAt} | Cache Status: ${result.stale ? 'STALE_FALLBACK' : result.cached ? 'CACHED' : 'LIVE'}`,
        `Vehicle: ${activeVehicleLabel}`,
      ];
      if (v) {
        lines.push(`VIN: ${v.vin} (WMI: ${v.wmi})`);
        if (v.engineModel || v.displacementL || v.engineCylinders) {
          lines.push(
            `Engine: ${[v.displacementL ? `${v.displacementL}L` : '', v.engineCylinders ? `${v.engineCylinders}-Cyl` : '', v.engineModel, v.fuelTypePrimary].filter(Boolean).join(' · ')}`
          );
        }
        if (v.transmissionStyle || v.driveType) {
          lines.push(`Drivetrain: ${[v.driveType, v.transmissionStyle].filter(Boolean).join(' · ')}`);
        }
        if (v.hasCheckDigitWarning && v.errorText) {
          lines.push(`VIN Check Notice: ${v.errorText}`);
        }
      }
      lines.push(`NHTSA Safety Recalls Found: ${result.recallCount}`);
      lines.push(`NHTSA ODI Complaints Logged: ${result.complaintCount}`);
      if (result.recalls.length > 0) {
        lines.push('', 'Top Recall Campaigns:');
        result.recalls.slice(0, 5).forEach((r) => {
          lines.push(`- [${r.campaignNumber}] ${r.component}: ${r.summary.slice(0, 260)}`);
        });
      }
      lines.push('', `Regional Scope Notice: ${result.regionalNote}`);

      const res = await saveDiagnosticLog(LOCAL_WORKSTATION_UID, {
        title: `NHTSA Report: ${activeVehicleLabel}`.slice(0, 150),
        dtcCode: v?.vin || `${result.recallCount}-RECALLS`,
        ecuModel: v?.engineModel || activeVehicleLabel,
        sourceType: 'GROUNDED_TSB',
        summary: lines.join('\n'),
        sources: [
          {
            title: 'NHTSA Official vPIC & Recalls Database',
            uri: v?.vin
              ? `https://www.nhtsa.gov/recalls?vin=${encodeURIComponent(v.vin)}`
              : 'https://www.nhtsa.gov/recalls',
            domain: 'nhtsa.gov',
          },
        ],
      });
      setSavedState(res.queuedOffline ? 'QUEUED' : 'SYNCED');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save NHTSA report to logs.');
    } finally {
      setIsSavingLog(false);
    }
  };

  const activeVehicleSpecs = useMemo(() => {
    const v = result?.decodedVin;
    if (v?.make && v?.model) {
      return {
        make: v.make,
        model: v.model,
        year: v.modelYear || vinYearInput.trim() || undefined,
      };
    }
    if (makeInput.trim() && modelInput.trim()) {
      return {
        make: makeInput.trim(),
        model: modelInput.trim(),
        year: yearInput.trim() || undefined,
      };
    }
    return null;
  }, [result, vinYearInput, makeInput, modelInput, yearInput]);

  const startMyCarLinks = useMemo(
    () => (activeVehicleSpecs ? buildStartMyCarReferenceUrls(activeVehicleSpecs) : null),
    [activeVehicleSpecs]
  );

  const handleSearchOemTsbs = () => {
    if (!onLaunchGroundedSearch || !activeVehicleLabel) return;
    const engineSpec = result?.decodedVin?.engineModel || result?.decodedVin?.displacementL || '';
    onLaunchGroundedSearch({
      query: `${activeVehicleLabel} ${engineSpec} ECU pinout wiring diagram technical service bulletin`.trim(),
      ecu: result?.decodedVin?.engineModel || activeVehicleLabel,
      dtc: '',
      vehicle: activeVehicleSpecs || undefined,
      openStartMyCar: false,
    });
  };

  const handleSearchStartMyCarFuse = () => {
    if (!onLaunchGroundedSearch || !activeVehicleSpecs) return;
    onLaunchGroundedSearch({
      query: `site:startmycar.com ${[activeVehicleSpecs.year, activeVehicleSpecs.make, activeVehicleSpecs.model].filter(Boolean).join(' ')} fuse box diagram relay`,
      ecu: [activeVehicleSpecs.year, activeVehicleSpecs.make, activeVehicleSpecs.model].filter(Boolean).join(' '),
      dtc: 'FUSE-RELAY',
      vehicle: activeVehicleSpecs,
      openStartMyCar: true,
    });
  };

  return (
    <div className={`flex flex-col gap-3 hud-panel rounded-[3px] p-3.5 font-mono ${className}`}>
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 border-b border-[#2b313c] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[2px] bg-[#0e1410] border border-emerald-600/60 flex items-center justify-center shrink-0">
            <Car className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-hud font-bold text-xs sm:text-sm text-slate-100 tracking-wide uppercase">
                Vehicle Intel: Official NHTSA, Regional Catalog &amp; OBDb PIDs
              </span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-[2px] bg-[#0d1912] border border-emerald-700/70 text-emerald-300 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Provenance Tagged
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans mt-0.5">
              Official NHTSA vPIC/Recalls/Complaints (U.S. FMVSS), Regional PH/ASEAN/JDM/EU catalog, and pinned CC BY-SA 4.0 OBDb SAE J1979 PIDs.
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center gap-1 bg-[#090b0f] p-1 rounded-[2px] border border-[#2b313c] text-[10.5px] overflow-x-auto scrollbar-none self-start lg:self-auto max-w-full">
          <button
            type="button"
            onClick={() => setLookupMode('VIN')}
            className={`px-2.5 py-1 rounded-[2px] font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
              lookupMode === 'VIN' ? 'hw-btn-green text-emerald-200' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            VIN Decoder
          </button>
          <button
            type="button"
            onClick={() => setLookupMode('RECALLS_COMPLAINTS')}
            className={`px-2.5 py-1 rounded-[2px] font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
              lookupMode === 'RECALLS_COMPLAINTS'
                ? 'hw-btn-amber text-amber-200'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Recalls &amp; Complaints
          </button>
          <button
            type="button"
            onClick={() => setLookupMode('WMI_DIRECTORY')}
            className={`px-2.5 py-1 rounded-[2px] font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
              lookupMode === 'WMI_DIRECTORY'
                ? 'hw-btn-amber text-amber-200'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            WMI &amp; Makes
          </button>
          <button
            type="button"
            onClick={() => setLookupMode('REGIONAL_OBDB')}
            className={`px-2.5 py-1 rounded-[2px] font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
              lookupMode === 'REGIONAL_OBDB'
                ? 'hw-btn-amber text-amber-200'
                : 'text-slate-400 hover:text-amber-300'
            }`}
          >
            Regional &amp; OBDb ({OBDB_SAEJ1979_PIDS.length})
          </button>
        </div>
      </div>

      {/* Trial PIN Prompt Banner for live NHTSA API tabs */}
      {!canUseAi && lookupMode !== 'REGIONAL_OBDB' && (
        <div className="p-2.5 rounded-[2px] bg-[#1e170a] border border-amber-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-start gap-2 text-amber-200">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span className="font-sans text-[11px]">
              Live NHTSA backend endpoints require an active 8-digit Trial PIN or Master Admin PIN. Regional Catalog &amp; OBDb SAE J1979 PIDs work 100% offline.
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              openAccessModal({
                tab: 'TRIAL_PIN',
                notice:
                  'Enter an active 8-digit Trial PIN or Master Admin PIN to query live NHTSA vehicle & recall records.',
              })
            }
            className="hw-btn-amber px-3 py-1.5 rounded-[2px] text-[11px] font-bold shrink-0 self-start sm:self-auto cursor-pointer"
          >
            Enter Trial PIN
          </button>
        </div>
      )}

      {/* TAB 1: VIN DECODER */}
      {lookupMode === 'VIN' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Sample VIN Lookups:
            </span>
            {EXAMPLE_VIN_PRESETS.map((preset) => (
              <button
                key={preset.vin}
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setVinInput(preset.vin);
                  setVinYearInput(preset.year);
                  void runVinSearch(preset.vin, preset.year);
                }}
                className="hw-btn text-[10px] px-2 py-1 rounded-[2px] hover:border-emerald-500/70 hover:text-emerald-300 text-slate-300 disabled:opacity-50 cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runVinSearch();
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <input
              type="text"
              value={vinInput}
              onChange={(e) => setVinInput(e.target.value.toUpperCase())}
              maxLength={24}
              placeholder="Enter 17-character ISO 3779 VIN (no I, O, Q)..."
              disabled={isLoading}
              className="flex-1 hw-lcd-well rounded-[2px] px-3 py-2 text-xs text-emerald-300 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono uppercase tracking-wider"
            />
            <input
              type="text"
              value={vinYearInput}
              onChange={(e) => setVinYearInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Year (Opt)"
              disabled={isLoading}
              className="w-28 hw-lcd-well rounded-[2px] px-2.5 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 text-center font-mono"
            />
            <button
              type="submit"
              disabled={isLoading || vinInput.trim().length < 17}
              className="hw-btn-green px-4 py-2 disabled:opacity-50 rounded-[2px] text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Radio className="w-3.5 h-3.5 animate-spin" />
                  <span>Querying NHTSA...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Decode VIN &amp; Recalls</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: RECALLS & COMPLAINTS */}
      {lookupMode === 'RECALLS_COMPLAINTS' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                Example Vehicles:
              </span>
              {EXAMPLE_VEHICLE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    setMakeInput(preset.make);
                    setModelInput(preset.model);
                    setYearInput(preset.year);
                    void runVehicleSearch(preset.make, preset.model, preset.year);
                  }}
                  className="hw-btn text-[10px] px-2 py-1 rounded-[2px] hover:border-amber-500/70 hover:text-amber-300 text-slate-300 disabled:opacity-50 cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <select
              aria-label="Filter NHTSA safety scope"
              value={safetyScope}
              onChange={(e) => setSafetyScope(e.target.value as typeof safetyScope)}
              className="hw-lcd-well rounded-[2px] px-2 py-1 text-[10px] text-amber-300 font-bold"
            >
              <option value="BOTH" className="bg-[#0e1116]">Recalls + ODI Complaints</option>
              <option value="RECALLS_ONLY" className="bg-[#0e1116]">Recalls Only</option>
              <option value="COMPLAINTS_ONLY" className="bg-[#0e1116]">ODI Complaints Only</option>
            </select>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runVehicleSearch();
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <input
              type="text"
              value={makeInput}
              onChange={(e) => setMakeInput(e.target.value)}
              placeholder="Make (e.g. Toyota)"
              disabled={isLoading}
              className="flex-1 hw-lcd-well rounded-[2px] px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
            />
            <input
              type="text"
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              placeholder="Model (e.g. Corolla)"
              disabled={isLoading}
              className="flex-1 hw-lcd-well rounded-[2px] px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
            />
            <input
              type="text"
              value={yearInput}
              onChange={(e) => setYearInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Year (YYYY)"
              disabled={isLoading}
              className="w-28 hw-lcd-well rounded-[2px] px-2.5 py-2 text-xs text-amber-300 placeholder-slate-600 focus:outline-none focus:border-amber-500 text-center font-mono"
            />
            <button
              type="submit"
              disabled={isLoading || !makeInput.trim() || !modelInput.trim() || yearInput.trim().length !== 4}
              className="hw-btn-amber px-4 py-2 disabled:opacity-50 rounded-[2px] text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Radio className="w-3.5 h-3.5 animate-spin" />
                  <span>Querying...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Lookup Safety Records</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: WMI, MANUFACTURER & MAKES/MODELS DIRECTORY */}
      {lookupMode === 'WMI_DIRECTORY' && (
        <div className="flex flex-col gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runDirectoryLookup();
            }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2"
          >
            <input
              type="text"
              value={wmiInput}
              onChange={(e) => setWmiInput(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="WMI (3 chars, e.g. 1FT)"
              className="hw-lcd-well rounded-[2px] px-3 py-2 text-xs text-amber-300 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono uppercase"
            />
            <input
              type="text"
              value={mfrInput}
              onChange={(e) => setMfrInput(e.target.value)}
              placeholder="Manufacturer (e.g. Honda)"
              className="hw-lcd-well rounded-[2px] px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
            />
            <input
              type="text"
              value={dirMakeInput}
              onChange={(e) => setDirMakeInput(e.target.value)}
              placeholder="Make (e.g. Toyota)"
              className="hw-lcd-well rounded-[2px] px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
            />
            <input
              type="text"
              value={dirYearInput}
              onChange={(e) => setDirYearInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Year (Opt YYYY)"
              className="hw-lcd-well rounded-[2px] px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono text-center"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="hw-btn-amber px-4 py-2 disabled:opacity-50 rounded-[2px] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{isLoading ? 'Querying...' : 'Query NHTSA vPIC'}</span>
            </button>
          </form>

          {dirResult && (
            <div className="flex flex-col gap-2.5">
              {dirResult.staleWarning && (
                <div className="p-2.5 rounded-[2px] bg-[#1e170a] border border-amber-600 text-amber-200 text-[11px] font-sans flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{dirResult.staleWarning}</span>
                </div>
              )}

              <ProvenanceBadgeBar provenance={dirResult.provenance} />

              {dirResult.wmiInfo && (
                <div className="hw-lcd-well rounded-[2px] p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div>
                    <div className="text-[9px] text-slate-500">WMI</div>
                    <div className="text-amber-300 font-bold">{dirResult.wmiInfo.wmi}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-500">MANUFACTURER</div>
                    <div className="text-slate-100 font-semibold">{dirResult.wmiInfo.manufacturerName || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-500">VEHICLE TYPE</div>
                    <div className="text-slate-200">{dirResult.wmiInfo.vehicleType || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-500">COUNTRY</div>
                    <div className="text-slate-200">{dirResult.wmiInfo.country || '—'}</div>
                  </div>
                </div>
              )}

              {dirResult.models.length > 0 && (
                <div className="hw-lcd-well rounded-[2px] p-3">
                  <div className="text-[10px] font-bold text-amber-300 uppercase mb-2">
                    NHTSA Supported Models ({dirResult.models.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                    {dirResult.models.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setMakeInput(dirMakeInput || dirResult.wmiInfo?.make || '');
                          setModelInput(m);
                          setYearInput(dirYearInput || '2020');
                          setLookupMode('RECALLS_COMPLAINTS');
                        }}
                        className="hw-btn px-2 py-0.5 rounded-[2px] hover:border-amber-500 text-[10px] text-slate-200 cursor-pointer"
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {dirResult.makes.length > 0 && (
                <div className="hw-lcd-well rounded-[2px] p-3">
                  <div className="text-[10px] font-bold text-slate-300 uppercase mb-2">
                    NHTSA Makes ({dirResult.makes.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
                    {dirResult.makes.map((mk) => (
                      <button
                        key={mk}
                        type="button"
                        onClick={() => setDirMakeInput(mk)}
                        className="hw-btn px-2 py-0.5 rounded-[2px] hover:border-amber-500 text-[10px] text-slate-300 cursor-pointer"
                      >
                        {mk}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: REGIONAL CATALOG & OBDB COMMUNITY PIDS */}
      {lookupMode === 'REGIONAL_OBDB' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0e1116] p-2 rounded-[2px] border border-[#2b313c]">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSubDatasetTab('REGIONAL')}
                className={`px-2.5 py-1 rounded-[2px] text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                  subDatasetTab === 'REGIONAL'
                    ? 'hw-btn-green text-emerald-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Regional Vehicle / ECU Catalog</span>
              </button>
              <button
                type="button"
                onClick={() => setSubDatasetTab('OBDB_PIDS')}
                className={`px-2.5 py-1 rounded-[2px] text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                  subDatasetTab === 'OBDB_PIDS'
                    ? 'hw-btn-amber text-amber-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>OBDb SAE J1979 PIDs ({OBDB_SAEJ1979_PIDS.length})</span>
              </button>
            </div>
            <span className="text-[10px] text-slate-400 font-sans">
              Works 100% offline · Local provenance-verified assets
            </span>
          </div>

          {subDatasetTab === 'REGIONAL' ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  aria-label="Filter regional catalog by market"
                  value={regionFilter}
                  onChange={(e) => setRegionFilter(e.target.value as RegionalMarket | 'ALL')}
                  className="hw-lcd-well rounded-[2px] px-2.5 py-1.5 text-xs text-emerald-300 font-bold"
                >
                  <option value="ALL" className="bg-[#0e1116]">All Regions</option>
                  {(Object.keys(REGIONAL_MARKET_LABELS) as RegionalMarket[]).map((r) => (
                    <option key={r} value={r} className="bg-[#0e1116]">
                      {REGIONAL_MARKET_LABELS[r]}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={regionalSearch}
                  onChange={(e) => setRegionalSearch(e.target.value)}
                  placeholder="Filter by brand, model, ASEAN/USDM alias (e.g. L200, Strada, Montero, Pajero Sport, Yaris Sedan, Porter II)..."
                  className="flex-1 hw-lcd-well rounded-[2px] px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>

              {regionalSearch.trim().length > 0 && resolveRegionalAliases(regionalSearch).matchedGroups.length > 0 && (
                <div className="bg-[#0d1912] border border-emerald-800/70 rounded-[2px] px-2.5 py-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="font-mono font-bold text-emerald-300 uppercase tracking-wider">
                    ASEAN / Global Alias Match:
                  </span>
                  {resolveRegionalAliases(regionalSearch).matchedGroups.map((alias) => (
                    <span
                      key={alias.id}
                      className="px-1.5 py-0.5 rounded-[2px] bg-[#12241a] border border-emerald-700/60 text-emerald-200 font-mono"
                    >
                      {alias.canonicalLabel}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                {filteredRegionalRecords.map((rec) => (
                  <div
                    key={rec.id}
                    className="hw-lcd-well rounded-[2px] p-3 flex flex-col gap-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-100">
                        {rec.manufacturer} · {rec.model}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-[2px] font-bold border ${
                            rec.nhtsaCoverageExpected
                              ? 'bg-[#1a222d] border-slate-500 text-slate-200'
                              : 'bg-[#1e170a] border-amber-700 text-amber-300'
                          }`}
                        >
                          {rec.nhtsaCoverageExpected ? 'NHTSA Partial Coverage' : 'Non-US Regional Vehicle'}
                        </span>
                        <span className="text-[9px] px-2 py-0.5 rounded-[2px] bg-[#0d1912] border border-emerald-700/70 text-emerald-300 font-bold">
                          {rec.provenance.verificationStatus}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[10px] text-slate-300 font-sans">
                      <div>
                        <strong className="text-slate-400">Engine / ECU:</strong> {rec.engineCode}
                      </div>
                      <div>
                        <strong className="text-slate-400">ECU Part Ref:</strong> {rec.ecuPartNumber}
                      </div>
                      <div>
                        <strong className="text-slate-400">Connector Ref:</strong> {rec.connectorIdentity}
                      </div>
                    </div>
                    {rec.regionalAliases && rec.regionalAliases.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 text-[9.5px] font-mono text-slate-400">
                        <span className="text-emerald-400 font-bold">Cross-Market Chassis:</span>
                        {rec.regionalAliases.map((alias) => (
                          <span
                            key={alias}
                            className="px-1.5 py-0.5 rounded-[2px] bg-[#141a22] border border-[#2b3340] text-slate-300"
                          >
                            {alias}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[10.5px] text-slate-400 font-sans">{rec.regionalCoverageNote}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <ProvenanceBadgeBar provenance={OBDB_PROVENANCE} />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <input
                  type="text"
                  value={pidQuery}
                  onChange={(e) => setPidQuery(e.target.value)}
                  placeholder="Search OBDb SAE J1979 PIDs (e.g., RPM, COOLANT, 010C, TPS, MAF, FUEL)..."
                  className="flex-1 hw-lcd-well rounded-[2px] px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
                />
                <span className="text-[10px] text-amber-300 bg-[#1e170a] border border-amber-700/60 px-2 py-1 rounded-[2px]">
                  Schema Validated: {OBDB_DATASET_VALIDATION.commandCount} cmds / {OBDB_DATASET_VALIDATION.signalCount} signals · Commit {OBDB_PINNED_COMMIT.slice(0, 8)} · {OBDB_LICENSE_SPDX}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 max-h-96 overflow-y-auto pr-1">
                {filteredObdbPids.map((pid) => (
                  <div
                    key={pid.uid}
                    className="hw-lcd-well rounded-[2px] p-2.5 flex flex-col gap-1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded-[2px] bg-[#1e170a] border border-amber-700 text-amber-300 text-[10px] font-bold">
                          ${pid.serviceModeHex} ${pid.pidHex}
                        </span>
                        <span className="text-xs font-bold text-slate-100">{pid.signalId}</span>
                        <span className="text-[11px] text-slate-300 font-sans">{pid.name}</span>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-[2px] bg-[#1e170a] border border-amber-700/70 text-amber-300 font-bold">
                        {pid.verificationStatus}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
                      <span>CAN {pid.txHeader} → {pid.rxHeader}</span>
                      <span>Bit {pid.bitOffset} · {pid.bitLength}b</span>
                      <span>Scale: {pid.scalingSummary}</span>
                      <span>Unit: {pid.unit}</span>
                      {pid.minValue !== null && pid.maxValue !== null && (
                        <span>Range: {pid.minValue}..{pid.maxValue}</span>
                      )}
                    </div>
                    {pid.description && (
                      <p className="text-[10.5px] text-slate-400 font-sans">{pid.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error Box with Retry + Offline Local Fallback Guidance */}
      {errorMsg && lookupMode !== 'REGIONAL_OBDB' && (
        <div className="p-3 rounded-[2px] bg-[#2a1215] border border-rose-800 text-rose-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="font-sans text-[11px]">{errorMsg}</span>
              <span className="text-[10px] text-slate-400 font-sans">
                Offline? Local OEM Manuals, Bench Scenarios DB, and Regional/OBDb datasets remain fully operational.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (lookupMode === 'VIN') void runVinSearch();
                else if (lookupMode === 'RECALLS_COMPLAINTS') void runVehicleSearch();
                else void runDirectoryLookup();
              }}
              className="hw-btn px-2.5 py-1 rounded-[2px] text-slate-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
            <button
              type="button"
              onClick={() => setLookupMode('REGIONAL_OBDB')}
              className="hw-btn-amber px-2.5 py-1 rounded-[2px] text-[10px] font-bold cursor-pointer"
            >
              Open Local Regional DB
            </button>
            {!canUseAi && (
              <button
                type="button"
                onClick={() =>
                  openAccessModal({
                    tab: 'TRIAL_PIN',
                    notice:
                      'Enter an active 8-digit Trial PIN or Master Admin PIN to query live NHTSA records.',
                  })
                }
                className="hw-btn-green px-2.5 py-1 rounded-[2px] text-[10px] font-bold cursor-pointer"
              >
                Enter Trial PIN
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results View for VIN & Safety Lookups */}
      {result && (lookupMode === 'VIN' || lookupMode === 'RECALLS_COMPLAINTS') && (
        <div className="flex flex-col gap-3">
          {/* Stale / Offline Fallback Warning */}
          {result.staleWarning && (
            <div className="p-2.5 rounded-[2px] bg-[#1e170a] border border-amber-500 text-amber-200 text-[11px] font-sans flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{result.staleWarning}</span>
            </div>
          )}

          {/* Action + Cache Timestamp Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 hw-lcd-well p-2.5 rounded-[2px] text-[10px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded-[2px] bg-[#0d1912] border border-emerald-700 text-emerald-300 font-bold">
                {result.verificationStatus}
              </span>
              <span className="text-slate-200 font-bold">{activeVehicleLabel}</span>
              <span className="text-slate-600">|</span>
              <span className="text-amber-300 font-bold">{result.recallCount} Recalls</span>
              <span className="text-slate-300 font-bold">{result.complaintCount} ODI Complaints</span>
              <span className="px-1.5 py-0.5 rounded-[2px] bg-[#13171f] border border-[#2b313c] text-slate-400 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {result.stale ? 'Stale Cache' : result.cached ? 'Cached' : 'Live'} ·{' '}
                {new Date(result.fetchedAt).toLocaleTimeString()}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {startMyCarLinks && (
                <a
                  href={startMyCarLinks.fuseBoxUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hw-btn flex items-center gap-1 px-2.5 py-1 rounded-[2px] text-amber-200 text-[10px] font-bold whitespace-nowrap"
                  title={`Open StartMyCar fuse box & relay reference (${startMyCarLinks.fuseBoxUrl})`}
                >
                  <ExternalLink className="w-3 h-3 text-amber-400" />
                  <span>StartMyCar Fuse Box</span>
                </a>
              )}
              {onLaunchGroundedSearch && activeVehicleSpecs && (
                <button
                  type="button"
                  onClick={handleSearchStartMyCarFuse}
                  className="hw-btn flex items-center gap-1 px-2.5 py-1 rounded-[2px] text-emerald-200 text-[10px] font-bold cursor-pointer whitespace-nowrap"
                >
                  <CircuitBoard className="w-3 h-3 text-emerald-400" />
                  <span>Fuse &amp; Relay Intel</span>
                </button>
              )}
              {onLaunchGroundedSearch && (
                <button
                  type="button"
                  onClick={handleSearchOemTsbs}
                  className="hw-btn flex items-center gap-1 px-2.5 py-1 rounded-[2px] text-slate-200 text-[10px] font-bold cursor-pointer whitespace-nowrap"
                >
                  <Globe className="w-3 h-3 text-amber-400" />
                  <span>Search OEM TSBs (AI-Inferred)</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveToLogs}
                disabled={isSavingLog || savedState !== 'NONE'}
                className="hw-btn-amber flex items-center gap-1 px-2.5 py-1 rounded-[2px] disabled:opacity-75 text-[10px] font-bold cursor-pointer"
              >
                {savedState === 'SYNCED' ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-300">Saved to Logs</span>
                  </>
                ) : savedState === 'QUEUED' ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-amber-400" />
                    <span className="text-amber-300">Queued Offline</span>
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="w-3 h-3 text-amber-400" />
                    <span>{isSavingLog ? 'Saving...' : 'Save NHTSA Report'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Full Source Attribution & Provenance Panel */}
          <ProvenanceBadgeBar provenance={result.provenance} />

          {/* Regional Coverage Notice */}
          <div className="px-3 py-2 rounded-[2px] bg-[#0e1116] border border-[#2b313c] text-[11px] text-slate-400 font-sans flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>{result.regionalNote}</span>
          </div>

          {/* Decoded VIN Specs Grid */}
          {result.decodedVin && (
            <div className="hw-lcd-well p-3 rounded-[2px] border border-emerald-800/60 flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#242a34] pb-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                    vPIC Decoded Vehicle Architecture — {result.decodedVin.vin} (WMI: {result.decodedVin.wmi})
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {typeof result.decodedVin.localCheckDigitValid === 'boolean' && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-[2px] border ${
                        result.decodedVin.localCheckDigitValid
                          ? 'bg-[#0d1912] border-emerald-700 text-emerald-300'
                          : 'bg-[#1e170a] border-amber-700 text-amber-300'
                      }`}
                    >
                      {result.decodedVin.localCheckDigitValid
                        ? 'ISO 3779 Check Digit: Valid'
                        : `ISO 3779 Check Digit: Advisory Mismatch (Expected ${result.decodedVin.expectedCheckDigit ?? '?'} for NA VINs)`}
                    </span>
                  )}
                  {result.decodedVin.hasCheckDigitWarning && (
                    <span className="text-[10px] px-2 py-0.5 rounded-[2px] bg-[#1e170a] border border-amber-700 text-amber-300">
                      Check Digit / Partial Decode (Code {result.decodedVin.errorCode})
                    </span>
                  )}
                </div>
              </div>

              {result.decodedVin.hasCheckDigitWarning && result.decodedVin.errorText && (
                <p className="text-[11px] text-amber-300/90 font-sans bg-[#1e170a] border border-amber-800/50 rounded-[2px] px-2.5 py-1.5">
                  {result.decodedVin.errorText}
                </p>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-[11px]">
                {[
                  ['Make', result.decodedVin.make],
                  ['Model', result.decodedVin.model],
                  ['Year', result.decodedVin.modelYear],
                  ['Series / Trim', [result.decodedVin.series, result.decodedVin.trim].filter(Boolean).join(' ')],
                  ['Engine Model', result.decodedVin.engineModel],
                  [
                    'Displacement / Cyl',
                    [
                      result.decodedVin.displacementL ? `${result.decodedVin.displacementL}L` : '',
                      result.decodedVin.engineCylinders ? `${result.decodedVin.engineCylinders} cyl` : '',
                      result.decodedVin.engineHp ? `${result.decodedVin.engineHp} HP` : '',
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  ],
                  ['Fuel System', result.decodedVin.fuelTypePrimary],
                  ['Drive / Trans', [result.decodedVin.driveType, result.decodedVin.transmissionStyle].filter(Boolean).join(' · ')],
                  ['Body Class', result.decodedVin.bodyClass],
                  ['Vehicle Type', result.decodedVin.vehicleType],
                  ['Manufacturer', result.decodedVin.manufacturer],
                  ['Plant Country', result.decodedVin.plantCountry],
                ].map(([label, val]) => (
                  <div key={label} className="bg-[#13171f] border border-[#2b313c] rounded-[2px] p-2">
                    <div className="text-[9px] text-slate-500 uppercase">{label}</div>
                    <div className="text-slate-200 font-semibold truncate" title={val || 'Not provided by NHTSA vPIC'}>
                      {val || <span className="text-slate-600">—</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Safety Recalls */}
          {safetyScope !== 'COMPLAINTS_ONLY' && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>NHTSA Safety Recall Campaigns ({result.recallCount})</span>
              </span>

              {result.recalls.length === 0 ? (
                <div className="p-3 rounded-[2px] hw-lcd-well text-xs text-slate-400 font-sans">
                  No U.S. NHTSA recall campaigns returned for this query. Confirm market region (PH/ASEAN/JDM/EU models may have separate regional OEM campaigns; cached results are not proof of zero recalls).
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                  {result.recalls.map((rec, idx) => (
                    <div
                      key={`${rec.campaignNumber}-${idx}`}
                      className="hw-lcd-well rounded-[2px] p-3 flex flex-col gap-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-[2px] bg-[#1e170a] border border-amber-700 text-amber-300 text-[10px] font-bold">
                            {rec.campaignNumber}
                          </span>
                          <span className="text-xs font-bold text-slate-100">{rec.component}</span>
                          {rec.parkIt && (
                            <span className="px-1.5 py-0.5 rounded-[2px] bg-[#2a1215] border border-rose-600 text-rose-300 text-[9px] font-bold">
                              DO NOT DRIVE / PARK OUTSIDE
                            </span>
                          )}
                        </div>
                        {rec.reportReceivedDate && (
                          <span className="text-[10px] text-slate-500">Filed: {rec.reportReceivedDate}</span>
                        )}
                      </div>
                      {rec.summary && (
                        <p className="text-[11px] text-slate-300 font-sans leading-relaxed">{rec.summary}</p>
                      )}
                      {rec.consequence && (
                        <p className="text-[11px] text-rose-300/90 font-sans">
                          <strong className="text-rose-400">Consequence:</strong> {rec.consequence}
                        </p>
                      )}
                      {rec.remedy && (
                        <p className="text-[11px] text-emerald-300/90 font-sans">
                          <strong className="text-emerald-400">Remedy:</strong> {rec.remedy}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ODI Complaints */}
          {safetyScope !== 'RECALLS_ONLY' && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>
                  NHTSA ODI Field Failure Complaints (Showing {result.complaints.length} of {result.complaintCount})
                </span>
              </span>

              {result.complaints.length === 0 ? (
                <div className="p-3 rounded-[2px] hw-lcd-well text-xs text-slate-400 font-sans">
                  No NHTSA ODI consumer failure complaints returned for this query.
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
                  {result.complaints.map((c, idx) => (
                    <div
                      key={`${c.odiNumber}-${idx}`}
                      className="hw-lcd-well rounded-[2px] p-2.5 flex flex-col gap-1"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-amber-300 font-bold">ODI #{c.odiNumber || idx + 1}</span>
                          <span className="text-slate-200 font-semibold">{c.components}</span>
                          {c.crash && (
                            <span className="px-1.5 py-0.5 rounded-[2px] bg-[#2a1215] border border-rose-700 text-rose-300 font-bold">
                              CRASH
                            </span>
                          )}
                          {c.fire && (
                            <span className="px-1.5 py-0.5 rounded-[2px] bg-[#2a170a] border border-orange-600 text-orange-300 font-bold flex items-center gap-0.5">
                              <Flame className="w-2.5 h-2.5" /> FIRE
                            </span>
                          )}
                        </div>
                        {c.dateOfIncident && (
                          <span className="text-slate-500">Incident: {c.dateOfIncident}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 font-sans leading-relaxed">{c.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
