/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { EcuPin, MultimeterState, PowerSupplyState } from '../types/ecu';
import {
  Cpu,
  Disc,
  Search,
  CheckCircle2,
  ShieldAlert,
  Layers,
  ArrowRight,
  Terminal,
  Car,
  Check,
  Globe,
  Database,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';
import {
  ECU_BRAND_PROFILES,
  ECU_BENCH_PINOUTS,
  BenchPinoutInfo,
  PcbComponentPoint,
  EcuBrandProfile,
  BenchHardwareProfile,
  BenchHardwareVariant,
} from './ecuPinoutData';
import { OemConnectorDiagram } from './OemConnectorDiagram';
import {
  FORD_OEM_PINOUTS_SUMMARY_TEXT,
  LOCAL_WORKSTATION_UID,
  TOYOTA_OEM_PINOUTS_SUMMARY_TEXT,
  saveDiagnosticLog,
} from '../services/benchStorageService';
import { APP_LOGO_SRC } from '../constants/branding';
import { evaluatePinoutSafety } from '../utils/automotiveSafetyGuard';
import { VERIFIED_VOICE_ECU_GUIDES } from '../utils/oemKnowledgeDatabase';
import { RackCornerScrews } from './HardwareControls';

export { ECU_BRAND_PROFILES, ECU_BENCH_PINOUTS };
export type {
  BenchPinoutInfo,
  PcbComponentPoint,
  EcuBrandProfile,
  BenchHardwareProfile,
  BenchHardwareVariant,
};

interface EcuConnectorPinoutsProps {
  pins: EcuPin[];
  nodeVoltages: Record<string, number>;
  selectedPinId: string | null;
  onSelectPin: (pinId: string) => void;
  multimeter: MultimeterState;
  onAttachProbe: (color: 'red' | 'black', pinId: string, label: string) => void;
  powerSupply: PowerSupplyState;
  onSearchLivePinout?: (brandOrModel: string) => void;
  externalBrandId?: string | null;
}

/**
 * Downscales oversized local photos (e.g. >1280px) to <= maxWidth WebP
 * and revokes object URLs on unmount/change to prevent bitmap RAM spikes.
 */
function useDownscaledImage(src?: string, maxWidth = 1280): string | undefined {
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(src);

  useEffect(() => {
    if (!src) {
      setResolvedSrc(undefined);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;

    const img = new Image();
    img.decoding = 'async';
    img.src = src;

    img.onload = () => {
      if (!active) return;
      if (img.naturalWidth <= maxWidth) {
        setResolvedSrc(src);
        return;
      }

      const scale = maxWidth / img.naturalWidth;
      const canvas = document.createElement('canvas');
      canvas.width = maxWidth;
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setResolvedSrc(src);
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          canvas.width = 0;
          canvas.height = 0;
          if (!active || !blob) return;
          objectUrl = URL.createObjectURL(blob);
          setResolvedSrc(objectUrl);
        },
        'image/webp',
        0.82
      );
    };

    img.onerror = () => {
      if (active) setResolvedSrc(src);
    };

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, maxWidth]);

  return resolvedSrc;
}

const LiveVoltageValue = React.memo<{
  simPinId?: string;
  nominalVoltage: number;
  nodeVoltages: Record<string, number>;
  decimals?: number;
  className?: string;
}>(({ simPinId, nominalVoltage, nodeVoltages, decimals = 1, className }) => {
  const val =
    simPinId && nodeVoltages[simPinId] !== undefined
      ? nodeVoltages[simPinId]
      : nominalVoltage;
  return <span className={className}>{val.toFixed(decimals)}V</span>;
});
LiveVoltageValue.displayName = 'LiveVoltageValue';

const PinDirectoryRow = React.memo<{
  pin: BenchPinoutInfo;
  isSelected: boolean;
  isRedProbe: boolean;
  isBlackProbe: boolean;
  nodeVoltages: Record<string, number>;
  onSelect: (pin: BenchPinoutInfo) => void;
}>(({ pin, isSelected, isRedProbe, isBlackProbe, nodeVoltages, onSelect }) => {
  return (
    <div
      onClick={() => onSelect(pin)}
      className={`p-2 rounded-[2px] border text-xs cursor-pointer transition flex flex-col gap-1 ${
        isSelected
          ? 'bg-amber-500/12 border-amber-500 ring-1 ring-amber-500/35'
          : 'bg-[#11151c] border-[#2b313c] hover:border-[#3e4756]'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`px-1.5 min-w-[26px] h-6 rounded-[2px] border font-bold flex items-center justify-center text-[11px] shrink-0 ${
              isSelected
                ? 'bg-amber-500/20 border-amber-500/70 text-amber-300'
                : 'bg-[#0c0f14] border-[#343c4b] text-[#4ade80]'
            }`}
          >
            {pin.pinCode || `#${pin.pinNumber}`}
          </span>
          <div className="truncate">
            <span className="font-bold text-slate-100">{pin.label}</span>
            <span className="text-[10px] text-slate-400 ml-1.5">{pin.signalName}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-1">
          <LiveVoltageValue
            simPinId={pin.associatedSimPinId}
            nominalVoltage={pin.nominalVoltage}
            nodeVoltages={nodeVoltages}
            decimals={2}
            className="text-[#4ade80] font-bold tabular-nums text-[11px]"
          />
          {isRedProbe && (
            <span
              className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-1 ring-white"
              title="Red DMM Probe Attached"
            />
          )}
          {isBlackProbe && (
            <span
              className="w-2.5 h-2.5 rounded-full bg-slate-300 ring-1 ring-black"
              title="Black COM Probe Attached"
            />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-[#232934] pt-1 mt-0.5">
        <div className="flex items-center gap-1.5 truncate">
          <span
            className="w-2 h-2 rounded-[1px] shrink-0"
            style={{ backgroundColor: pin.colorHex }}
          />
          <span className="truncate">{pin.wireColor}</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400 truncate max-w-[180px] sm:max-w-[230px]">
            {pin.benchRole}
          </span>
        </div>
        <span className="text-slate-500 font-mono shrink-0 ml-1">{pin.plug}</span>
      </div>
    </div>
  );
});
PinDirectoryRow.displayName = 'PinDirectoryRow';

export const EcuConnectorPinouts: React.FC<EcuConnectorPinoutsProps> = ({
  nodeVoltages,
  onSelectPin,
  multimeter,
  onAttachProbe,
  onSearchLivePinout,
  externalBrandId,
}) => {
  const [selectedBrandId, setSelectedBrandId] = useState<string>(
    externalBrandId || 'toyota-denso-175822'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlugFilter, setSelectedPlugFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [showOverlayMarkers, setShowOverlayMarkers] = useState(true);
  const [viewMode, setViewMode] = useState<'MATRIX' | 'PHYSICAL' | 'PCB' | 'LOGICAL'>('MATRIX');
  const [mobilePinoutTab, setMobilePinoutTab] = useState<'DIAGRAM' | 'DIRECTORY'>('DIAGRAM');
  const [showFiltersBar, setShowFiltersBar] = useState<boolean>(false);
  const [dbSaveState, setDbSaveState] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'QUEUED' | 'ERROR'>('IDLE');

  const activeBrand = useMemo(
    () => ECU_BRAND_PROFILES.find((b) => b.id === selectedBrandId) || ECU_BRAND_PROFILES[0],
    [selectedBrandId]
  );

  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    () => activeBrand.hardwareVariants?.[0]?.id ?? ''
  );

  const activeVariant = useMemo<BenchHardwareVariant | null>(() => {
    const variants = activeBrand.hardwareVariants;
    if (!variants || variants.length === 0) return null;
    return variants.find((v) => v.id === selectedVariantId) || variants[0];
  }, [activeBrand, selectedVariantId]);

  const activeHwProfile: BenchHardwareProfile | null =
    activeVariant?.benchHardwareProfile ?? activeBrand.benchHardwareProfile ?? null;

  const [activePinDetail, setActivePinDetail] = useState<BenchPinoutInfo>(
    () => activeBrand.pinouts[0]
  );
  const [selectedPcbComponent, setSelectedPcbComponent] = useState<PcbComponentPoint | null>(
    () => activeBrand.pcbComponents?.[0] ?? null
  );
  const [confirmedOrientationBrands, setConfirmedOrientationBrands] = useState<Record<string, boolean>>({});

  // Only decode PCB raster image when PCB view is active
  const activePcbImg = useDownscaledImage(
    viewMode === 'PCB' ? activeBrand.pcbImageSrc : undefined,
    1280
  );

  const handleBrandChange = useCallback((brandId: string) => {
    setSelectedBrandId(brandId);
    setDbSaveState('IDLE');
    const newBrand =
      ECU_BRAND_PROFILES.find((b) => b.id === brandId) || ECU_BRAND_PROFILES[0];
    setSelectedVariantId(newBrand.hardwareVariants?.[0]?.id ?? '');
    setSelectedPlugFilter('ALL');
    setActivePinDetail(newBrand.pinouts[0]);
    if (newBrand.pcbComponents && newBrand.pcbComponents.length > 0) {
      setSelectedPcbComponent(newBrand.pcbComponents[0]);
    } else {
      setSelectedPcbComponent(null);
      setViewMode((prev) => (prev === 'PCB' ? 'MATRIX' : prev));
    }
  }, []);

  const handleVariantChange = useCallback(
    (variantId: string) => {
      setSelectedVariantId(variantId);
      const variant = activeBrand.hardwareVariants?.find((v) => v.id === variantId);
      if (!variant) return;
      const plugId = variant.plugFilterId || 'ALL';
      setSelectedPlugFilter(plugId);
      const matchingPin =
        plugId === 'ALL'
          ? activeBrand.pinouts[0]
          : activeBrand.pinouts.find((p) => p.plug === plugId) || activeBrand.pinouts[0];
      if (matchingPin) {
        setActivePinDetail(matchingPin);
      }
    },
    [activeBrand]
  );

  useEffect(() => {
    if (externalBrandId && externalBrandId !== selectedBrandId) {
      handleBrandChange(externalBrandId);
    }
  }, [externalBrandId, selectedBrandId, handleBrandChange]);

  const handleSelectPinRow = useCallback(
    (pin: BenchPinoutInfo) => {
      setActivePinDetail(pin);
      if (pin.associatedSimPinId) onSelectPin(pin.associatedSimPinId);
    },
    [onSelectPin]
  );

  const handleSavePinoutsToDb = useCallback(async () => {
    setDbSaveState('SAVING');
    try {
      const checklistLines = activeBrand.essentialChecklist
        .map((item) => `• ${item.pin}: ${item.role}`)
        .join('\n');
      const pinLines = activeBrand.pinouts
        .map(
          (p) =>
            `Pin ${p.pinCode || p.pinNumber} (${p.plug}) — ${p.signalName} [${p.label}]: ${p.nominalVoltage}V (${p.wireColor}) · ${p.connectionInstruction}`
        )
        .join('\n');
      const summary =
        activeBrand.id === 'ford-fomoco-sid208'
          ? `${FORD_OEM_PINOUTS_SUMMARY_TEXT}\n\nChecklist:\n${checklistLines}\n\nPinouts:\n${pinLines}`
          : activeBrand.id === 'toyota-denso-175822'
          ? `${TOYOTA_OEM_PINOUTS_SUMMARY_TEXT}\n\nChecklist:\n${checklistLines}\n\nPinouts:\n${pinLines}`
          : `${activeBrand.description}\nVehicles: ${activeBrand.popularVehiclesInPH}\n\nChecklist:\n${checklistLines}\n\nPinouts:\n${pinLines}`;

      const res = await saveDiagnosticLog(LOCAL_WORKSTATION_UID, {
        title: `OEM Pinout Reference: ${activeBrand.brandName} — ${activeBrand.modelName.slice(0, 90)}`,
        dtcCode: 'PINOUT_NOTE',
        ecuModel: `${activeBrand.brandName} ${activeBrand.modelName}`.slice(0, 120),
        sourceType: 'PINOUT_NOTE',
        summary: summary.slice(0, 11800),
        sources: [],
      });
      setDbSaveState(res.queuedOffline ? 'QUEUED' : 'SAVED');
    } catch {
      setDbSaveState('ERROR');
    }
  }, [activeBrand]);

  const filteredPins = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return activeBrand.pinouts.filter((p) => {
      const matchesSearch =
        q === '' ||
        p.pinNumber.toString().includes(q) ||
        (p.pinCode && p.pinCode.toLowerCase().includes(q)) ||
        p.label.toLowerCase().includes(q) ||
        p.signalName.toLowerCase().includes(q) ||
        p.benchRole.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (q === 'ground' &&
          (p.category === 'ground' ||
            p.benchRole.toLowerCase().includes('ground') ||
            p.signalName.toLowerCase().includes('ground'))) ||
        ((q === 'k-line' || q === 'kline') &&
          (p.category === 'communication' ||
            p.label.toLowerCase().includes('k-line') ||
            p.signalName.toLowerCase().includes('k-line') ||
            p.benchRole.toLowerCase().includes('k-line') ||
            p.label.toLowerCase().includes('sil'))) ||
        (q === 'can' &&
          (p.category === 'communication' ||
            p.signalName.toLowerCase().includes('can') ||
            p.label.toLowerCase().includes('can'))) ||
        (q === 'injector' &&
          (p.category === 'actuator_out' ||
            p.signalName.toLowerCase().includes('injector') ||
            p.benchRole.toLowerCase().includes('injector'))) ||
        ((q === 'sensor' || q === 'sensor signal') && p.category === 'sensor_in') ||
        (q === 'power' && p.category === 'power');

      const matchesPlug = selectedPlugFilter === 'ALL' || p.plug === selectedPlugFilter;
      const matchesCategory = categoryFilter === 'ALL' || p.category === categoryFilter;

      return matchesSearch && matchesPlug && matchesCategory;
    });
  }, [activeBrand.pinouts, searchQuery, selectedPlugFilter, categoryFilter]);

  return (
    <div className="flex-1 min-h-0 min-w-0 w-full flex flex-col gap-2 overflow-y-auto lg:overflow-hidden text-slate-100 p-0.5 sm:p-1 font-mono select-none">
      {/* 1. Compact Hardware Header Bar (matches SOCKET BENCH TEST PINOUTS) */}
      <div className="relative hud-panel rounded-[3px] px-2.5 sm:px-3.5 py-2 flex flex-col gap-2 shrink-0 w-full min-w-0">
        <RackCornerScrews />
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={APP_LOGO_SRC}
              alt="AutoElectric Lab Pro Official Logo"
              width={24}
              height={24}
              decoding="async"
              className="h-6 w-auto object-contain rounded-[2px] border border-[#343c4b] bg-[#0c0f14] p-0.5 shrink-0 hidden sm:block"
            />
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="text-xs sm:text-sm font-mono font-bold text-slate-100 tracking-wider uppercase truncate">
              SOCKET BENCH TEST PINOUTS
            </h2>
            <span className="hidden xl:inline text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/45 px-1.5 py-0.5 rounded-[2px] font-semibold truncate">
              {activeBrand.modelName.split('(')[0].trim()} · {activeBrand.cavityInfo}
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowFiltersBar((prev) => !prev)}
              className={`px-2 py-1 rounded-[2px] border flex items-center gap-1 text-[10.5px] font-bold transition cursor-pointer ${
                showFiltersBar || searchQuery || selectedPlugFilter !== 'ALL' || categoryFilter !== 'ALL'
                  ? 'hw-btn-amber text-amber-300'
                  : 'hw-btn text-slate-300 hover:text-white'
              }`}
              title="Toggle Brand Chips, Search & Plug Filters"
            >
              <SlidersHorizontal className="w-3 h-3 shrink-0" />
              <span>Filters</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setMobilePinoutTab((prev) => (prev === 'DIAGRAM' ? 'DIRECTORY' : 'DIAGRAM'))
              }
              className={`lg:hidden px-2 py-1 rounded-[2px] border text-[10.5px] font-bold transition cursor-pointer ${
                mobilePinoutTab === 'DIRECTORY'
                  ? 'hw-btn-amber text-amber-300'
                  : 'hw-btn text-slate-300 hover:text-white'
              }`}
              title="Switch between Socket Grid and Full Pin Directory"
            >
              {mobilePinoutTab === 'DIRECTORY'
                ? 'Grid'
                : `Directory (${filteredPins.length})`}
            </button>

            <button
              type="button"
              onClick={handleSavePinoutsToDb}
              disabled={dbSaveState === 'SAVING'}
              className={`px-2 py-1 rounded-[2px] border flex items-center gap-1 text-[10.5px] font-bold transition whitespace-nowrap cursor-pointer shrink-0 ${
                dbSaveState === 'SAVED'
                  ? 'hw-btn-green text-emerald-300'
                  : dbSaveState === 'QUEUED'
                  ? 'hw-btn-amber text-amber-200'
                  : dbSaveState === 'ERROR'
                  ? 'bg-rose-950/90 border-rose-500/80 text-rose-300'
                  : 'hw-btn text-amber-300'
              }`}
              title="Save this OEM Pinout Reference to Local Diagnostic Logs"
            >
              <Database className="w-3 h-3 text-amber-400" />
              <span className="hidden sm:inline">
                {dbSaveState === 'SAVING'
                  ? 'Saving...'
                  : dbSaveState === 'SAVED'
                  ? 'Saved'
                  : dbSaveState === 'QUEUED'
                  ? 'Queued'
                  : dbSaveState === 'ERROR'
                  ? 'Retry'
                  : 'Save Log'}
              </span>
            </button>

            {onSearchLivePinout && (
              <button
                type="button"
                onClick={() => onSearchLivePinout(activeBrand.modelName)}
                className="hw-btn px-2 py-1 rounded-[2px] text-slate-100 hover:text-amber-300 flex items-center gap-1 text-[10.5px] font-bold transition whitespace-nowrap cursor-pointer shrink-0"
                title="Search live Grounded OEM bench pinouts"
              >
                <Globe className="w-3 h-3 text-amber-400" />
                <span className="hidden sm:inline">Live Search</span>
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Tools / Search / Brand Strip (hidden by default so grid sits above the fold) */}
        {showFiltersBar && (
          <div className="flex flex-col gap-2 pt-2 border-t border-[#2b313c] min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
              <span className="text-slate-400 font-sans truncate">
                <strong className="text-amber-400">PH Vehicles:</strong>{' '}
                {activeBrand.popularVehiclesInPH}
              </span>
              <span className="text-amber-300 bg-amber-500/10 border border-amber-500/45 px-1.5 py-0.5 rounded-[2px] font-semibold">
                {activeBrand.cavityInfo}
              </span>
            </div>

            {/* Brand Selector Strip */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5 w-full min-w-0">
              {ECU_BRAND_PROFILES.map((brand) => {
                const isSelected = brand.id === selectedBrandId;
                return (
                  <button
                    key={brand.id}
                    type="button"
                    onClick={() => handleBrandChange(brand.id)}
                    className={`px-2 py-1 rounded-[2px] text-[10.5px] font-bold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'hw-btn-amber text-amber-300'
                        : 'hw-btn text-slate-400 hover:text-white'
                    }`}
                  >
                    <Car className="w-3 h-3 shrink-0" />
                    <span>{brand.brandName}</span>
                    {isSelected && <Check className="w-3 h-3 text-amber-300 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Search & Quick Category Filter Bars */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-2 text-xs min-w-0">
              <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-1.5 w-full sm:w-auto min-w-0">
                  <div className="relative flex-1 sm:w-64 min-w-0">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1.5" />
                    <input
                      type="text"
                      placeholder="Search function (Ground, CAN, Injector)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-[#0c0f14] border border-[#343c4b] rounded-[2px] pl-8 pr-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400 w-full min-w-0"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowOverlayMarkers((prev) => !prev)}
                    className={`px-2 py-1 rounded-[2px] text-[10.5px] flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0 ${
                      showOverlayMarkers
                        ? 'hw-btn-amber text-amber-300 font-semibold'
                        : 'hw-btn text-slate-400'
                    }`}
                    title="Toggle Interactive Pin Markers"
                  >
                    <Layers className="w-3 h-3" />
                    <span>Overlay: {showOverlayMarkers ? 'ON' : 'OFF'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-1 bg-[#11151c] p-1 rounded-[2px] border border-[#2b313c] text-[10.5px] overflow-x-auto scrollbar-none max-w-full">
                  {['', 'Ground', 'K-Line', 'CAN', 'Injector', 'Sensor'].map((term) => {
                    const active =
                      (term === '' && searchQuery === '') ||
                      (term !== '' &&
                        (searchQuery.toLowerCase() === term.toLowerCase() ||
                          (term === 'K-Line' && searchQuery.toLowerCase() === 'kline')));
                    return (
                      <button
                        key={term || 'all'}
                        type="button"
                        onClick={() => setSearchQuery(term)}
                        className={`px-2 py-0.5 rounded-[2px] transition cursor-pointer whitespace-nowrap shrink-0 ${
                          active
                            ? term === 'K-Line'
                              ? 'bg-emerald-500/20 border border-emerald-500/60 text-[#4ade80] font-bold'
                              : 'bg-amber-500/20 border border-amber-500/60 text-amber-300 font-bold'
                            : term === 'K-Line'
                            ? 'text-emerald-400 hover:text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {term === ''
                          ? 'All'
                          : term === 'K-Line'
                          ? 'K-Line (ISO-9141)'
                          : term === 'Sensor'
                          ? 'Sensor Signal'
                          : term}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Hardware Variant & Bench Profile Bar (Always accessible when variants/specs exist) */}
        {(activeBrand.hardwareVariants?.length || activeHwProfile) && (
          <div className="flex flex-col gap-1.5 pt-1.5 border-t border-[#232934] text-[10px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {activeBrand.hardwareVariants && activeBrand.hardwareVariants.length > 0 && (
                <label className="flex items-center gap-1.5 min-w-0">
                  <span className="text-slate-400 font-bold uppercase shrink-0">HW Variant:</span>
                  <select
                    aria-label="Select ECU hardware variant"
                    value={activeVariant?.id || ''}
                    onChange={(e) => handleVariantChange(e.target.value)}
                    className="bg-[#0c0f14] border border-[#343c4b] rounded-[2px] px-2 py-0.5 text-[10px] text-amber-200 font-semibold focus:outline-none focus:border-amber-400 cursor-pointer max-w-full"
                  >
                    {activeBrand.hardwareVariants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {activeHwProfile && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded-[2px] bg-[#11151c] border border-[#2b313c] text-slate-300">
                    MCU: <strong className="text-slate-100">{activeHwProfile.mcuArchitecture}</strong>
                  </span>
                  {activeHwProfile.requiresMainRelayLoop && (
                    <span className="px-1.5 py-0.5 rounded-[2px] bg-amber-500/10 border border-amber-500/40 text-amber-300 font-bold">
                      MAIN RELAY LOOP REQ
                    </span>
                  )}
                  {activeHwProfile.requiresCaseGround && (
                    <span className="px-1.5 py-0.5 rounded-[2px] bg-emerald-500/10 border border-emerald-500/40 text-[#4ade80] font-bold">
                      CASE GND REQ
                    </span>
                  )}
                  {activeHwProfile.canTerminationOhms > 0 && (
                    <span className="px-1.5 py-0.5 rounded-[2px] bg-[#11151c] border border-[#2b313c] text-slate-300">
                      CAN {activeHwProfile.canTerminationOhms}Ω
                    </span>
                  )}
                  {activeHwProfile.benchWakeupPins.gpt1 && activeHwProfile.benchWakeupPins.gpt2 && (
                    <span className="px-1.5 py-0.5 rounded-[2px] bg-sky-500/10 border border-sky-500/45 text-sky-300 font-bold">
                      GPT: {activeHwProfile.benchWakeupPins.gpt1.join('/')} &amp; {activeHwProfile.benchWakeupPins.gpt2.join('/')}
                    </span>
                  )}
                  <span
                    className={`px-1.5 py-0.5 rounded-[2px] border font-bold ${
                      activeHwProfile.provenanceStatus === 'OEM_VERIFIED'
                        ? 'bg-emerald-500/10 border-emerald-500/45 text-[#4ade80]'
                        : 'bg-rose-500/15 border-rose-500/50 text-rose-300'
                    }`}
                  >
                    {activeHwProfile.provenanceStatus}
                    {activeHwProfile.requiresOcrVerify ? ' · OCR_VERIFY' : ''}
                  </span>
                </div>
              )}
            </div>

            {activeHwProfile?.conflictWarning && (
              <div className="px-2 py-1 rounded-[2px] bg-amber-950/50 border border-amber-500/50 text-amber-200 font-sans text-[10.5px] leading-snug flex items-start gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>{activeHwProfile.conflictWarning}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Main Two-Column Layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-2.5 overflow-y-auto lg:overflow-hidden min-h-0">
        {/* Left Column: Socket Pinout Mapping Grid / Housing / PCB / Logic + Inspection Card */}
        <div
          className={`hud-panel flex-1 flex-col gap-2.5 rounded-[3px] p-2.5 sm:p-3 overflow-visible lg:overflow-y-auto min-w-0 ${
            mobilePinoutTab === 'DIAGRAM' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Compact View Mode Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2b313c] pb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-bold text-slate-100 text-[11px] sm:text-xs truncate uppercase tracking-wider">
                {viewMode === 'MATRIX'
                  ? 'SOCKET PINOUT MAPPING GRID'
                  : viewMode === 'PHYSICAL'
                  ? 'OEM CONNECTOR HOUSING DIAGRAM'
                  : viewMode === 'PCB'
                  ? 'INTERNAL ECU PCB TOPOLOGY'
                  : 'LOGICAL ELECTRICAL SCHEMATIC'}
              </span>
            </div>

            <div className="flex items-center gap-1 bg-[#11151c] p-0.5 rounded-[2px] border border-[#2b313c] text-[10px] overflow-x-auto scrollbar-none max-w-full">
              <button
                type="button"
                onClick={() => setViewMode('MATRIX')}
                className={`px-2 py-0.5 rounded-[2px] transition font-bold cursor-pointer whitespace-nowrap shrink-0 ${
                  viewMode === 'MATRIX'
                    ? 'hw-btn-amber text-amber-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Socket Matrix
              </button>
              <button
                type="button"
                onClick={() => setViewMode('PHYSICAL')}
                className={`px-2 py-0.5 rounded-[2px] transition font-bold cursor-pointer whitespace-nowrap shrink-0 ${
                  viewMode === 'PHYSICAL'
                    ? 'hw-btn-amber text-amber-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                OEM Housing
              </button>
              {activeBrand.pcbImageSrc && (
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('PCB');
                    if (!selectedPcbComponent && activeBrand.pcbComponents?.length) {
                      setSelectedPcbComponent(activeBrand.pcbComponents[0]);
                    }
                  }}
                  className={`px-2 py-0.5 rounded-[2px] transition font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                    viewMode === 'PCB'
                      ? 'hw-btn-green text-[#4ade80]'
                      : 'text-emerald-400 hover:text-white'
                  }`}
                >
                  <Cpu className="w-3 h-3 text-[#4ade80] shrink-0" />
                  <span>PCB</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewMode('LOGICAL')}
                className={`px-2 py-0.5 rounded-[2px] transition font-bold cursor-pointer whitespace-nowrap shrink-0 ${
                  viewMode === 'LOGICAL'
                    ? 'hw-btn-amber text-amber-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Logic
              </button>
            </div>
          </div>

          {/* Viewport */}
          {viewMode === 'MATRIX' ? (
            <div className="flex flex-col gap-2.5">
              {/* Top-Right Hardware Preset Controls & Side-by-Side Socket Grid (always 12-col even on mobile) */}
              <div className="grid grid-cols-12 gap-1.5 sm:gap-2.5 items-start">
                {/* Left (col-span-5): Vertical Machined Connector Shroud with Left Locking Tab + 3-Col Pin Matrix */}
                <div className="col-span-5 min-w-0 pt-0.5">
                  <div className="relative pl-1.5">
                    {/* Mechanical Left Connector Locking Latch Tab */}
                    <div
                      aria-hidden="true"
                      className="absolute left-0 top-[30%] bottom-[30%] w-[7px] rounded-l-[2px] bg-[#242a35] border border-r-0 border-[#485366]"
                    />
                    <div className="rounded-[6px] border-2 border-[#3c4556] bg-[#10141c] p-1 sm:p-1.5 shadow-inner">
                      <div className="rounded-[3px] border border-[#242b37] bg-[#0a0d12] p-1 sm:p-1.5 max-h-[420px] overflow-y-auto scrollbar-none">
                        {filteredPins.length === 0 ? (
                          <div className="py-8 text-center text-[10px] text-slate-400 flex flex-col items-center gap-2">
                            <span>No pins match</span>
                            <button
                              type="button"
                              onClick={() => {
                                setSearchQuery('');
                                setSelectedPlugFilter('ALL');
                                setCategoryFilter('ALL');
                              }}
                              className="hw-btn-amber px-2 py-0.5 rounded-[2px] text-amber-300 text-[9.5px] font-bold cursor-pointer"
                            >
                              Reset
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-1">
                            {filteredPins.slice(0, 48).map((pin) => {
                              const pinTag = pin.pinCode || `A${pin.pinNumber}`;
                              const isSelected =
                                activePinDetail.pinNumber === pin.pinNumber &&
                                activePinDetail.plug === pin.plug;
                              const simId =
                                pin.associatedSimPinId || `ecu-pin-${pin.pinNumber}`;
                              const isProbed =
                                multimeter.redProbe.attachedToPinId === simId ||
                                multimeter.blackProbe.attachedToPinId === simId;
                              const isPower = pin.category === 'power';
                              return (
                                <button
                                  key={`mat-key-${pin.plug}-${pin.pinNumber}`}
                                  type="button"
                                  onClick={() => handleSelectPinRow(pin)}
                                  title={`${pinTag}: ${pin.label} (${pin.signalName})`}
                                  className={`h-6 sm:h-7 rounded-[2px] border text-[9px] sm:text-[10.5px] font-bold font-mono transition cursor-pointer flex items-center justify-center px-0.5 truncate ${
                                    isProbed
                                      ? 'bg-[#10331f] border-[#4ade80] text-[#4ade80] ring-1 ring-emerald-400/50'
                                      : isSelected
                                      ? 'bg-[#3b2c10] border-amber-400 text-amber-200 ring-1 ring-amber-400/50'
                                      : isPower
                                      ? 'bg-[#31230c] border-amber-600/80 text-amber-300 hover:border-amber-400'
                                      : 'bg-[#1b2029] border-[#394252] text-slate-200 hover:border-[#55637a]'
                                  }`}
                                >
                                  {pinTag}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right (col-span-7): Stacked SOCKET TYPE + PIN MAP PRESET + VOLTAGE READOUT + CONTINUITY Switches */}
                <div className="col-span-7 flex flex-col gap-1.5 min-w-0">
                  {/* Stacked Hardware Selects matching reference */}
                  <div className="flex flex-col gap-1.5 bg-[#0e1218] border border-[#2b313c] rounded-[2px] p-1.5 sm:p-2">
                    <label className="flex flex-col gap-0.5 text-[9px] sm:text-[9.5px] text-slate-400 uppercase tracking-wider font-bold">
                      <span>SOCKET TYPE</span>
                      <select
                        aria-label="Socket Type ECU Profile"
                        value={selectedBrandId}
                        onChange={(e) => handleBrandChange(e.target.value)}
                        className="bg-[#090c10] border border-[#343c4b] rounded-[2px] px-1.5 sm:px-2 py-1 text-[10px] sm:text-[11px] text-slate-100 font-bold focus:outline-none focus:border-amber-400 cursor-pointer truncate"
                      >
                        {ECU_BRAND_PROFILES.map((brand) => (
                          <option key={brand.id} value={brand.id} className="bg-[#0c0f14]">
                            {brand.brandName} ({brand.pinouts.length}-pin)
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-0.5 text-[9px] sm:text-[9.5px] text-slate-400 uppercase tracking-wider font-bold">
                      <span>PIN MAP PRESET</span>
                      <select
                        aria-label="Pin Map Preset Connector Plug"
                        value={selectedPlugFilter}
                        onChange={(e) => setSelectedPlugFilter(e.target.value)}
                        className="bg-[#090c10] border border-[#343c4b] rounded-[2px] px-1.5 sm:px-2 py-1 text-[10px] sm:text-[11px] text-amber-300 font-bold focus:outline-none focus:border-amber-400 cursor-pointer truncate"
                      >
                        {activeBrand.plugs.map((plug) => (
                          <option key={plug.id} value={plug.id} className="bg-[#0c0f14]">
                            {plug.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {/* VOLTAGE READOUT + CONTINUITY Rows */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[8.5px] sm:text-[9.5px] text-slate-400 uppercase tracking-wider font-bold px-0.5">
                      <span>VOLTAGE READOUT</span>
                      <span>CONTINUITY</span>
                    </div>

                    <div className="flex flex-col gap-1 max-h-[312px] overflow-y-auto pr-0.5">
                      {filteredPins.slice(0, 16).map((pin) => {
                        const pinTag = pin.pinCode || `A${pin.pinNumber}`;
                        const simId =
                          pin.associatedSimPinId || `ecu-pin-${pin.pinNumber}`;
                        const liveV =
                          pin.associatedSimPinId &&
                          nodeVoltages[pin.associatedSimPinId] !== undefined
                            ? nodeVoltages[pin.associatedSimPinId]
                            : pin.nominalVoltage;
                        const isRed = multimeter.redProbe.attachedToPinId === simId;
                        const isBlack = multimeter.blackProbe.attachedToPinId === simId;
                        const isProbed = isRed || isBlack;
                        const isOpen =
                          !isProbed && liveV <= 0.05 && pin.category !== 'ground';
                        const isSelected =
                          activePinDetail.pinNumber === pin.pinNumber &&
                          activePinDetail.plug === pin.plug;

                        return (
                          <div
                            key={`mat-row-${pin.plug}-${pin.pinNumber}`}
                            onClick={() => handleSelectPinRow(pin)}
                            className={`flex items-center justify-between gap-1 sm:gap-1.5 rounded-[2px] cursor-pointer transition ${
                              isSelected ? 'ring-1 ring-amber-400/70' : ''
                            }`}
                          >
                            {/* Recessed Green LCD Readout Box */}
                            <div
                              className={`hw-lcd-well flex-1 min-w-0 px-1.5 sm:px-2 py-1 rounded-[2px] border flex items-center justify-between gap-1 text-[9.5px] sm:text-[10.5px] font-mono ${
                                isProbed
                                  ? 'border-emerald-500/80 bg-[#08190e]'
                                  : isSelected
                                  ? 'border-amber-500/70 bg-[#0b150e]'
                                  : 'border-[#22362a] bg-[#08120c]'
                              }`}
                            >
                              <span className="text-[#4ade80] font-bold truncate tabular-nums">
                                {isProbed
                                  ? `${pinTag} CONTINUITY: CLOSED`
                                  : `${pinTag}: ${liveV.toFixed(2)} VDC`}
                              </span>
                            </div>

                            {/* Continuity Hardware Pill Rocker Switch */}
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="hidden md:inline text-[8.5px] text-slate-400 font-bold uppercase tracking-wider">
                                CONTINUITY:
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectPinRow(pin);
                                  onAttachProbe(
                                    pin.category === 'ground' ? 'black' : 'red',
                                    simId,
                                    `Pin ${pinTag} - ${pin.label}`
                                  );
                                }}
                                aria-label={`Test continuity on ${pinTag}`}
                                title={
                                  isProbed
                                    ? `${pinTag}: Probed / Continuity Closed`
                                    : isOpen
                                    ? `${pinTag}: Open circuit — tap to probe`
                                    : `${pinTag}: Tap to attach DMM probe`
                                }
                                className={`relative w-10 sm:w-12 h-5 rounded-full border transition cursor-pointer flex items-center px-0.5 shrink-0 ${
                                  isProbed
                                    ? 'bg-[#15803d] border-[#4ade80] justify-end'
                                    : isOpen
                                    ? 'bg-[#854d0e] border-amber-400 justify-between pl-1.5'
                                    : 'bg-[#1a202c] border-[#3d4759] justify-start'
                                }`}
                              >
                                {isOpen && (
                                  <span className="text-[7px] font-bold text-amber-100 leading-none tracking-tighter">
                                    OPEN
                                  </span>
                                )}
                                <span
                                  className={`w-3.5 h-3.5 rounded-full shadow-sm transition ${
                                    isProbed
                                      ? 'bg-[#86efac]'
                                      : isOpen
                                      ? 'bg-amber-300'
                                      : 'bg-slate-400'
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom PIN LEGEND | SIGNAL DESCRIPTION Two-Column Hardware Table */}
              <div className="bg-[#0c0f14] border border-[#2b313c] rounded-[2px] overflow-hidden">
                <div className="grid grid-cols-12 bg-[#141820] border-b border-[#2b313c] px-2.5 py-1 text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-300">
                  <span className="col-span-4 sm:col-span-3">PIN LEGEND</span>
                  <span className="col-span-8 sm:col-span-9 text-center sm:text-left">
                    SIGNAL DESCRIPTION
                  </span>
                </div>
                <div className="grid grid-cols-2 divide-x divide-[#232934] max-h-40 overflow-y-auto">
                  {filteredPins.slice(0, 16).map((pin) => {
                    const pinTag = pin.pinCode || `A${pin.pinNumber}`;
                    const isSelected =
                      activePinDetail.pinNumber === pin.pinNumber &&
                      activePinDetail.plug === pin.plug;
                    return (
                      <button
                        key={`leg-${pin.plug}-${pin.pinNumber}`}
                        type="button"
                        onClick={() => handleSelectPinRow(pin)}
                        className={`px-2 py-1 text-left flex items-center gap-1.5 text-[9.5px] sm:text-[10.5px] font-mono border-b border-[#1c222d] cursor-pointer transition min-w-0 ${
                          isSelected
                            ? 'bg-[#211a0d] text-amber-200'
                            : 'bg-[#0e1218] hover:bg-[#161c26]'
                        }`}
                      >
                        <span className="font-bold text-slate-300 shrink-0">{pinTag}:</span>
                        <span className="text-slate-200 truncate flex-1">{pin.signalName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : viewMode === 'PHYSICAL' ? (
            <OemConnectorDiagram
              brand={activeBrand}
              activePinDetail={activePinDetail}
              selectedPlugFilter={selectedPlugFilter}
              showOverlayMarkers={showOverlayMarkers}
              multimeter={multimeter}
              nodeVoltages={nodeVoltages}
              onSelectPin={handleSelectPinRow}
            />
          ) : viewMode === 'PCB' && activeBrand.pcbImageSrc ? (
            <div className="relative min-h-[240px] h-64 sm:h-80 lg:flex-1 bg-[#080a0d] rounded-[2px] overflow-hidden border border-emerald-500/45 flex items-center justify-center shrink-0">
              <img
                key={activePcbImg || activeBrand.pcbImageSrc}
                src={activePcbImg || activeBrand.pcbImageSrc}
                alt={`${activeBrand.modelName} Internal PCB Inspection`}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-contain select-none"
              />

              <div className="absolute inset-0 pointer-events-auto">
                {activeBrand.pcbComponents?.map((comp) => {
                  const isSelected = selectedPcbComponent?.id === comp.id;
                  return (
                    <div
                      key={comp.id}
                      onClick={() => setSelectedPcbComponent(comp)}
                      style={{
                        position: 'absolute',
                        left: `${comp.xPercent}%`,
                        top: `${comp.yPercent}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      className="cursor-pointer group/comp z-10"
                      title={`${comp.designation}: ${comp.name}`}
                    >
                      <div
                        className={`px-2 py-0.5 rounded-[2px] border text-[9px] font-bold font-mono flex items-center gap-1 transition-transform shadow ${
                          isSelected
                            ? 'bg-[#4ade80] text-[#07140c] border-white ring-1 ring-emerald-300 scale-110 z-20'
                            : 'bg-[#0e1410]/95 text-[#4ade80] border-emerald-500/70 hover:scale-110'
                        }`}
                      >
                        <Cpu className="w-2.5 h-2.5 shrink-0" />
                        <span className="whitespace-nowrap">
                          {comp.designation.split(' ')[0]}
                        </span>
                      </div>

                      <div className="opacity-0 group-hover/comp:opacity-100 pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#0c0f14] border border-emerald-400 text-white text-[10px] px-2.5 py-1 rounded-[2px] shadow-xl whitespace-nowrap z-30 transition-opacity">
                        <strong className="text-[#4ade80]">{comp.designation}</strong>:{' '}
                        {comp.name}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="absolute bottom-2 left-2 right-2 sm:right-auto bg-[#0c0f14]/90 px-2.5 py-1 rounded-[2px] border border-emerald-500/50 text-[10px] text-[#4ade80] truncate">
                {activeBrand.brandName} PCB Inspection · Tap any hotspot to inspect SMD test points
              </div>
            </div>
          ) : (
            <div className="relative min-h-[240px] h-64 sm:h-80 lg:flex-1 hw-lcd-well bg-[#060a08] rounded-[2px] overflow-hidden border border-[#2b313c] p-2 sm:p-3 flex flex-col items-center justify-center shrink-0">
              <svg viewBox="0 0 700 280" className="w-full h-full">
                <rect width="700" height="280" fill="#070c0a" />
                <path
                  d="M 0 50 L 700 50 M 0 100 L 700 100 M 0 150 L 700 150 M 0 200 L 700 200 M 0 250 L 700 250"
                  stroke="#13251e"
                  strokeWidth="0.8"
                  strokeDasharray="4,4"
                />
                <rect
                  x="230"
                  y="40"
                  width="240"
                  height="200"
                  rx="3"
                  fill="#0d1814"
                  stroke="#f59e0b"
                  strokeWidth="1.8"
                />
                <text
                  x="350"
                  y="75"
                  fill="#f59e0b"
                  fontSize="12"
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {activeBrand.brandName.toUpperCase()} MCU
                </text>
                <text
                  x="350"
                  y="95"
                  fill="#4ade80"
                  fontSize="9.5"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {activeBrand.modelName.split('(')[0]}
                </text>
                <text
                  x="350"
                  y="222"
                  fill="#94a3b8"
                  fontSize="8.5"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  LOGICAL SCHEMATIC VIEW · ACTIVE BENCH
                </text>

                {activeBrand.pinouts.slice(0, 14).map((pin, idx) => {
                  const yPos = 55 + Math.floor(idx / 2) * 26;
                  const isLeft = idx % 2 === 0;
                  const xNode = isLeft ? 230 : 470;
                  const xExt = isLeft ? 135 : 565;
                  const isSelected =
                    activePinDetail.pinNumber === pin.pinNumber &&
                    activePinDetail.plug === pin.plug;
                  const color = pin.colorHex || '#4ade80';

                  return (
                    <g
                      key={`${pin.plug}-${pin.pinNumber}`}
                      onClick={() => handleSelectPinRow(pin)}
                      className="cursor-pointer"
                    >
                      <line
                        x1={xNode}
                        y1={yPos}
                        x2={xExt}
                        y2={yPos}
                        stroke={isSelected ? '#f59e0b' : color}
                        strokeWidth={isSelected ? 3 : 1.75}
                      />
                      <circle
                        cx={xNode}
                        cy={yPos}
                        r={isSelected ? 5 : 3.5}
                        fill={isSelected ? '#f59e0b' : color}
                        stroke="#ffffff"
                        strokeWidth="1.2"
                      />
                      <rect
                        x={isLeft ? 25 : 565}
                        y={yPos - 9}
                        width="110"
                        height="18"
                        rx="2"
                        fill="#0b100e"
                        stroke={isSelected ? '#f59e0b' : '#263a30'}
                        strokeWidth="1.2"
                      />
                      <text
                        x={isLeft ? 80 : 620}
                        y={yPos + 3.5}
                        fill={isSelected ? '#fbbf24' : '#cbd5e1'}
                        fontSize="8.5"
                        fontFamily="monospace"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {pin.pinCode || `#${pin.pinNumber}`} {pin.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <div className="absolute bottom-2 left-2 bg-[#0c0f14]/90 px-2.5 py-1 rounded-[2px] border border-[#343c4b] text-[10px] text-amber-300">
                Logical Electrical Schematic · Tap any pin node to select
              </div>
            </div>
          )}

          {/* Bottom Inspection Card */}
          {viewMode === 'PCB' && selectedPcbComponent ? (
            <div className="bg-[#12161d] border border-emerald-500/45 rounded-[2px] p-2.5 sm:p-3 flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between border-b border-[#2b313c] pb-1.5 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-3 h-3 rounded-[2px] bg-[#4ade80] border border-white shrink-0" />
                  <span className="font-bold text-xs sm:text-sm text-[#4ade80] truncate">
                    {selectedPcbComponent.designation} · {selectedPcbComponent.name}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-[#4ade80] bg-emerald-950/70 border border-emerald-800 px-2 py-0.5 rounded-[2px] uppercase shrink-0">
                  {selectedPcbComponent.type.replace('_', ' ')}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                <div className="hw-lcd-well p-2 rounded-[2px] border border-[#2b313c]">
                  <span className="text-slate-500 block text-[9px]">COMPONENT SPECIFICATION</span>
                  <span className="font-semibold text-[#4ade80]">
                    {selectedPcbComponent.spec}
                  </span>
                </div>
                <div className="hw-lcd-well p-2 rounded-[2px] border border-[#2b313c]">
                  <span className="text-slate-500 block text-[9px]">
                    ASSOCIATED HARNESS CONNECTOR PINS
                  </span>
                  <span className="font-semibold text-slate-200">
                    {selectedPcbComponent.associatedPins || 'Internal Power/Ground Plane'}
                  </span>
                </div>
              </div>

              <p className="text-slate-300 text-[11px] font-sans leading-relaxed bg-[#0c0f14] p-2 rounded-[2px] border border-[#2b313c]">
                {selectedPcbComponent.diagnosticRole}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onAttachProbe(
                        'red',
                        selectedPcbComponent.associatedSimPinId || 'ecu-pin-10',
                        `${selectedPcbComponent.designation} Test Point`
                      )
                    }
                    className="hw-btn px-2.5 py-1 text-xs rounded-[2px] border-rose-600/70 text-rose-300 font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Disc className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
                    <span>Attach Red Probe</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onAttachProbe('black', 'ecu-pin-1', 'PCB Chassis Ground')}
                    className="hw-btn px-2.5 py-1 text-xs rounded-[2px] text-slate-300 font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Disc className="w-3.5 h-3.5 text-slate-400 fill-slate-400" />
                    <span>Attach Black COM</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setViewMode('PHYSICAL')}
                  className="hw-btn-amber px-2.5 py-1 text-xs rounded-[2px] text-amber-300 font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Inspect Harness Socket Pins</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#12161d] border border-[#2b313c] rounded-[2px] p-2.5 sm:p-3 flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between border-b border-[#2b313c] pb-1.5 gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <div
                    className="w-3 h-3 rounded-[2px] border border-white/80 shrink-0"
                    style={{ backgroundColor: activePinDetail.colorHex }}
                  />
                  <span className="font-bold text-xs sm:text-sm text-amber-300 truncate">
                    {activePinDetail.pinCode || `PIN #${activePinDetail.pinNumber}`} ·{' '}
                    {activePinDetail.label}
                  </span>
                  <span className="text-slate-400 text-[11px] sm:text-xs truncate">
                    ({activePinDetail.signalName})
                  </span>
                </div>
                <div className="hw-lcd-well px-2.5 py-0.5 rounded-[2px] border border-[#2b313c] flex items-center gap-1.5 text-xs shrink-0">
                  <span className="text-slate-400 text-[10px]">VDC:</span>
                  <LiveVoltageValue
                    simPinId={activePinDetail.associatedSimPinId}
                    nominalVoltage={activePinDetail.nominalVoltage}
                    nodeVoltages={nodeVoltages}
                    decimals={2}
                    className="text-[#4ade80] font-bold tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                <div className="hw-lcd-well p-2 rounded-[2px] border border-[#2b313c] min-w-0">
                  <span className="text-slate-500 block text-[9px]">CONNECTOR PLUG</span>
                  <span className="font-semibold text-slate-200 truncate block">{activePinDetail.plug}</span>
                </div>
                <div className="hw-lcd-well p-2 rounded-[2px] border border-[#2b313c] min-w-0">
                  <span className="text-slate-500 block text-[9px]">HARNESS WIRE COLOR</span>
                  <span className="font-semibold truncate block" style={{ color: activePinDetail.colorHex }}>
                    {activePinDetail.wireColor}
                  </span>
                </div>
                <div className="hw-lcd-well p-2 rounded-[2px] border border-[#2b313c] min-w-0">
                  <span className="text-slate-500 block text-[9px]">SIGNAL CATEGORY</span>
                  <span className="font-semibold text-amber-300 uppercase truncate block">
                    {activePinDetail.category.replace('_', ' ')}
                  </span>
                </div>
                <div className="hw-lcd-well p-2 rounded-[2px] border border-[#2b313c] min-w-0">
                  <span className="text-slate-500 block text-[9px]">BENCH ROLE</span>
                  <span className="font-semibold text-[#4ade80] truncate block">
                    {activePinDetail.benchRole}
                  </span>
                </div>
              </div>

              <div className="bg-[#0c0f14] p-2 rounded-[2px] border border-[#2b313c] text-[11px] flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[10px]">
                  <Terminal className="w-3 h-3 shrink-0" />
                  <span>BENCH CONNECTION INSTRUCTION:</span>
                </div>
                <p className="text-slate-300 text-[11px] font-sans">
                  {activePinDetail.connectionInstruction}
                </p>
                <div className="text-[10px] text-slate-400 font-sans">
                  <strong className="text-slate-300">Spec:</strong>{' '}
                  {activePinDetail.electricalSpec}
                </div>
                {(() => {
                  const linkedGuide = VERIFIED_VOICE_ECU_GUIDES.find(
                    (g) => g.linkedProfileId === activeBrand.id
                  );
                  const provenanceStatus =
                    activeHwProfile?.provenanceStatus ?? 'OEM_VERIFIED';
                  const requiresOcrGate =
                    linkedGuide?.status === 'OCR_VERIFY' ||
                    Boolean(activeHwProfile?.requiresOcrVerify) ||
                    activePinDetail.signalName.includes('OCR_VERIFY');
                  const orientationConfirmed = Boolean(confirmedOrientationBrands[activeBrand.id]);
                  const hasConflictNotice = Boolean(activeHwProfile?.conflictWarning);
                  const safety = evaluatePinoutSafety({
                    ecuIdentified: Boolean(activeBrand.id && activeBrand.modelName),
                    ecuPartNumber: activeBrand.modelName,
                    connectorOrientationConfirmed: !requiresOcrGate || orientationConfirmed,
                    provenanceStatus,
                    pinCategory: activePinDetail.category,
                    hasConflictingPinoutReports:
                      hasConflictNotice || (requiresOcrGate && !orientationConfirmed),
                    isSimulatedValue: true,
                  });
                  return (
                    <div className="mt-1 pt-1 border-t border-[#232934] flex flex-wrap items-center justify-between gap-2 text-[9.5px]">
                      <span
                        className={`font-bold ${
                          safety.canEnergizePhysicalBench ? 'text-[#4ade80]' : 'text-amber-300'
                        }`}
                      >
                        {provenanceStatus} · {safety.measurementOriginLabel} · {safety.riskLevel} · {safety.obd2DlcSeparationNotice}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {requiresOcrGate && !orientationConfirmed && (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmedOrientationBrands((prev) => ({
                                ...prev,
                                [activeBrand.id]: true,
                              }))
                            }
                            className="px-2 py-0.5 rounded-[2px] bg-amber-600 hover:bg-amber-500 text-slate-950 font-mono font-bold text-[9px] cursor-pointer"
                          >
                            Confirm Housing Part # &amp; Connector View
                          </button>
                        )}
                        <span className="text-amber-300 font-sans">
                          {safety.warnings[0] || 'Confirm case Part # & DMM ground continuity before energizing physical harness.'}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const simId =
                        activePinDetail.associatedSimPinId ||
                        `ecu-pin-${activePinDetail.pinNumber}`;
                      onAttachProbe(
                        'red',
                        simId,
                        `Pin ${activePinDetail.pinCode || activePinDetail.pinNumber} - ${activePinDetail.label}`
                      );
                    }}
                    className="hw-btn px-2.5 py-1 text-xs rounded-[2px] border-rose-600/70 text-rose-300 font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Disc className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
                    <span>Attach Red Probe (+)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const simId =
                        activePinDetail.associatedSimPinId ||
                        `ecu-pin-${activePinDetail.pinNumber}`;
                      onAttachProbe(
                        'black',
                        simId,
                        `Pin ${activePinDetail.pinCode || activePinDetail.pinNumber} - ${activePinDetail.label}`
                      );
                    }}
                    className="hw-btn px-2.5 py-1 text-xs rounded-[2px] text-slate-300 font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Disc className="w-3.5 h-3.5 text-slate-400 fill-slate-400" />
                    <span>Attach Black COM (-)</span>
                  </button>
                </div>

                {activePinDetail.category === 'boot' && (
                  <div className="text-[10px] text-amber-400 bg-amber-950/50 border border-amber-500/45 px-2 py-1 rounded-[2px] flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>Boot Mode Pin: Requires 1kΩ pull-down to GND</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Bench Pinout Directory */}
        <div
          className={`hud-panel w-full lg:w-[480px] flex-col gap-2 rounded-[3px] p-2.5 sm:p-3 overflow-hidden shrink-0 flex-1 lg:flex-initial min-h-0 ${
            mobilePinoutTab === 'DIRECTORY' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <div className="flex items-center justify-between text-xs border-b border-[#2b313c] pb-2 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-slate-200 truncate uppercase tracking-wider">
                VOLTAGE &amp; PINOUT LEGEND
              </span>
              <span className="text-slate-400 text-[10px] shrink-0">
                ({filteredPins.length} Pins)
              </span>
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-[#0c0f14] border border-[#343c4b] rounded-[2px] px-2 py-0.5 text-[10px] text-slate-300 focus:outline-none cursor-pointer shrink-0"
            >
              <option value="ALL">All Categories</option>
              <option value="power">Power Supplies (+12V / 5V)</option>
              <option value="ground">Grounds (Chassis / Sensor Return)</option>
              <option value="communication">CAN & Diagnostic Comms</option>
              <option value="sensor_in">Analog Sensor Inputs</option>
              <option value="actuator_out">Actuators & Injector Drivers</option>
              <option value="boot">Boot Mode Recovery</option>
            </select>
          </div>

          <div className="bg-[#11151c] p-2.5 rounded-[2px] border border-[#2b313c] text-[11px] flex flex-col gap-1.5 shrink-0">
            <div className="flex items-center justify-between text-[#4ade80] font-bold text-[10px] gap-2">
              <span className="flex items-center gap-1 min-w-0 truncate">
                <CheckCircle2 className="w-3 h-3 text-[#4ade80] shrink-0" />
                <span className="truncate">MINIMUM BENCH WIRING ({activeBrand.brandName}):</span>
              </span>
              <span className="text-slate-400 font-normal shrink-0">
                {activeBrand.essentialChecklist.length} Wires
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px] text-slate-300">
              {activeBrand.essentialChecklist.map((item, idx) => (
                <div key={idx} className="truncate">
                  • <strong>{item.pin}</strong>: {item.role}
                </div>
              ))}
            </div>
            {activeBrand.description && (
              <p className="text-[10px] text-slate-400 font-sans border-t border-[#232934] pt-1.5 mt-0.5 leading-snug">
                {activeBrand.description}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-1.5 min-h-[260px] lg:max-h-none">
            {filteredPins.map((pin) => {
              const isSelected =
                activePinDetail.pinNumber === pin.pinNumber &&
                activePinDetail.plug === pin.plug;
              const isRedProbe =
                !!pin.associatedSimPinId &&
                multimeter.redProbe.attachedToPinId === pin.associatedSimPinId;
              const isBlackProbe =
                !!pin.associatedSimPinId &&
                multimeter.blackProbe.attachedToPinId === pin.associatedSimPinId;

              return (
                <PinDirectoryRow
                  key={`${pin.plug}-${pin.pinCode || pin.pinNumber}`}
                  pin={pin}
                  isSelected={isSelected}
                  isRedProbe={isRedProbe}
                  isBlackProbe={isBlackProbe}
                  nodeVoltages={nodeVoltages}
                  onSelect={(selectedPin) => {
                    handleSelectPinRow(selectedPin);
                    setMobilePinoutTab('DIAGRAM');
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
