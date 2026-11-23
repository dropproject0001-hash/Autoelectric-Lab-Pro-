import React, { useEffect, useMemo, useState } from 'react';
import { EcuPin, FaultType, InjectedFault, DiagnosticTroubleCode } from '../types/ecu';
import {
  AlertTriangle,
  ShieldCheck,
  Trash2,
  ZapOff,
  CheckCircle2,
  Flame,
  Wrench,
  Sparkles,
  Globe,
  Activity,
  ChevronDown,
  ChevronUp,
  Layers,
  Play,
} from 'lucide-react';
import { recordRenderCycle } from '../utils/perfMonitor';
import { BENCH_TEST_SCENARIOS, getBenchTestScenarios } from '../utils/oemKnowledgeDatabase';
import { RackCornerScrews } from './HardwareControls';
import { LabDrawerIcon } from './icons/LabDrawerIcons';

interface FaultInjectorProps {
  pins: EcuPin[];
  faults: InjectedFault[];
  activeDTCs: DiagnosticTroubleCode[];
  onAddFault: (pinId: string, faultType: FaultType, description: string) => void;
  onRemoveFault: (pinId: string) => void;
  onClearAll: () => void;
  selectedPinId: string | null;
  onSelectPin: (pinId: string) => void;
  onSearchDtc?: (dtcCode: string, description: string) => void;
  selectedBrandKey?: string;
  nodeVoltages?: Record<string, number>;
  onOpenFaultBuilder?: () => void;
}

export const FaultInjector: React.FC<FaultInjectorProps> = React.memo(({
  pins,
  faults,
  activeDTCs,
  onAddFault,
  onRemoveFault,
  onClearAll,
  selectedPinId,
  onSelectPin,
  onSearchDtc,
  selectedBrandKey,
  nodeVoltages = {},
  onOpenFaultBuilder,
}) => {
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [showAllBrands, setShowAllBrands] = useState(true);
  useEffect(() => {
    recordRenderCycle('FaultInjector');
  });

  const visibleBenchScenarios = useMemo(() => {
    if (showAllBrands || !selectedBrandKey || selectedBrandKey === 'universal-bench') {
      return BENCH_TEST_SCENARIOS;
    }
    const brandFiltered = getBenchTestScenarios(selectedBrandKey);
    return brandFiltered.length > 0 ? brandFiltered : BENCH_TEST_SCENARIOS;
  }, [showAllBrands, selectedBrandKey]);

  const activePinById = useMemo(() => {
    const map = new Map<string, EcuPin>();
    for (const p of pins) {
      map.set(p.id, p);
    }
    return map;
  }, [pins]);

  const currentPin = pins.find(p => p.id === selectedPinId) || pins[0] || null;
  if (!currentPin) {
    return (
      <div className="hud-panel rounded-lg p-3 text-xs font-mono text-slate-400 shrink-0">
        No ECU pins loaded for fault injection.
      </div>
    );
  }
  const activeFaultForPin = faults.find(f => f.pinId === currentPin.id);

  const faultOptions: { type: FaultType; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
    { type: 'NONE', label: 'Nominal (No Fault)', desc: 'Clean OEM pin connection without electrical fault', icon: <ShieldCheck className="w-4 h-4 text-emerald-400" />, color: 'hover:border-emerald-500/70' },
    { type: 'OPEN_CIRCUIT', label: 'Open Circuit (Harness Break)', desc: 'Terminal pushed out, broken copper strand, or unseated pin', icon: <ZapOff className="w-4 h-4 text-amber-400" />, color: 'hover:border-amber-500/70' },
    { type: 'SHORT_TO_GND', label: 'Short to Ground (KL31)', desc: 'Harness pinched against chassis metal / engine block ground', icon: <AlertTriangle className="w-4 h-4 text-rose-400" />, color: 'hover:border-rose-500/70' },
    { type: 'SHORT_TO_VBAT', label: 'Short to Battery (+12V)', desc: 'Harness melted/shorted to constant unswitched +12V battery rail', icon: <Flame className="w-4 h-4 text-amber-400" />, color: 'hover:border-amber-500/70' },
    { type: 'HIGH_RESISTANCE_50R', label: 'High Resistance (+50Ω)', desc: 'Mild connector pin fretting corrosion / oxidation', icon: <Wrench className="w-4 h-4 text-amber-300" />, color: 'hover:border-amber-400/70' },
    { type: 'HIGH_RESISTANCE_250R', label: 'High Resistance (+250Ω)', desc: 'Moderate water intrusion & terminal green-crust corrosion', icon: <Wrench className="w-4 h-4 text-amber-400" />, color: 'hover:border-amber-500/70' },
  ];

  const runScenario = (pinId: string, faultType: FaultType, desc: string) => {
    onSelectPin(pinId);
    onAddFault(pinId, faultType, desc);
  };

  return (
    <div className="relative hud-panel rounded-xl p-3 flex flex-col gap-3 text-[#eaf3ff] shrink-0 overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#19c8f5]/40 to-transparent"
      />
      <RackCornerScrews />

      {/* Header */}
      <div className="hud-panel-header flex items-center justify-between gap-2 pb-2 px-2">
        <div className="flex items-center gap-2 min-w-0">
          <LabDrawerIcon name="trouble-drawer" size={24} className="w-4 h-4 shrink-0" />
          <span className="text-xs sm:text-sm font-hud font-bold tracking-wider text-[#eaf3ff] uppercase truncate">
            Fault Injection Matrix
          </span>
        </div>
        {faults.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="hw-btn text-[9.5px] font-mono text-[#ff8594] hover:text-white flex items-center gap-1 bg-[#2a1019] px-2 py-1 rounded-lg border-[#ff4d62]/70 shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" /> Clear All ({faults.length})
          </button>
        )}
      </div>

      {/* Quick Scenario Presets */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-mono text-[#91a4bd] uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-[#19c8f5]" />
            <span>Diagnostic Scenarios</span>
          </div>
          <div className="flex items-center gap-1.5">
            {onOpenFaultBuilder && (
              <button
                type="button"
                onClick={onOpenFaultBuilder}
                className="hw-btn hw-btn-blue flex items-center gap-1 px-2 py-1 rounded-lg text-[#19c8f5] normal-case text-[10px] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Layers className="w-3 h-3" aria-hidden="true" />
                <span>Fault Builder</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setScenariosOpen((prev) => !prev)}
              className="hw-btn flex items-center gap-1 px-2 py-1 rounded-lg text-[#ffb020] normal-case text-[10px] whitespace-nowrap shrink-0 cursor-pointer"
              aria-expanded={scenariosOpen}
            >
              <LabDrawerIcon name="expand" size={24} className="w-3.5 h-3.5" />
              <span>OEM Scenarios DB ({BENCH_TEST_SCENARIOS.length})</span>
              {scenariosOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
          <button
            type="button"
            onClick={() => runScenario('ecu-pin-7', 'OPEN_CIRCUIT', 'TPS Signal Wire Break')}
            className="hw-btn p-2 rounded-lg text-left text-[#d4e3f6] cursor-pointer"
          >
            <span className="text-[#ffb020] font-semibold block">TPS Wire Break</span>
            <span className="text-[9px] text-[#7c93b2]">Triggers P0122</span>
          </button>
          <button
            type="button"
            onClick={() => runScenario('ecu-pin-13', 'SHORT_TO_GND', 'CAN_H Shorted to GND')}
            className="hw-btn p-2 rounded-lg text-left text-[#d4e3f6] cursor-pointer"
          >
            <span className="text-[#ff4d62] font-semibold block">CAN Bus Short</span>
            <span className="text-[9px] text-[#7c93b2]">Triggers U0001</span>
          </button>
          <button
            type="button"
            onClick={() => runScenario('ecu-pin-10', 'OPEN_CIRCUIT', 'Injector 1 Open Circuit')}
            className="hw-btn p-2 rounded-lg text-left text-[#d4e3f6] cursor-pointer"
          >
            <span className="text-[#ffb020] font-semibold block">Injector 1 Open</span>
            <span className="text-[9px] text-[#7c93b2]">Triggers P0201</span>
          </button>
          <button
            type="button"
            onClick={() => runScenario('ecu-pin-1', 'HIGH_RESISTANCE_50R', 'Main Ground Fretting')}
            className="hw-btn p-2 rounded-lg text-left text-[#d4e3f6] cursor-pointer"
          >
            <span className="text-[#ffb020] font-semibold block">Ground Corrosion</span>
            <span className="text-[9px] text-[#7c93b2]">+50Ω Ground Offset</span>
          </button>
        </div>

        {/* Expandable OEM Bench Test Scenarios Database */}
        {scenariosOpen && (
          <div className="mt-1 p-2.5 rounded-xl hw-lcd-well flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-[10px] font-mono border-b border-[#203653]/85 pb-1.5">
              <span className="text-[#19c8f5] font-semibold">
                PH Market Bench Scenarios ({visibleBenchScenarios.length})
              </span>
              {selectedBrandKey && selectedBrandKey !== 'universal-bench' && (
                <button
                  type="button"
                  onClick={() => setShowAllBrands((prev) => !prev)}
                  className="hw-btn px-2 py-0.5 rounded-lg text-[#d4e3f6] hover:text-[#19c8f5] text-[9px] cursor-pointer"
                >
                  {showAllBrands ? `Filter: ${selectedBrandKey.toUpperCase()}` : 'Show All Brands'}
                </button>
              )}
            </div>

            <div className="max-h-56 overflow-y-auto pr-1 flex flex-col gap-1.5">
              {visibleBenchScenarios.map((sc) => {
                const targetPin = activePinById.get(sc.recommendedPinId);
                const isFaultInjected = faults.some(
                  (f) =>
                    f.pinId === sc.recommendedPinId &&
                    f.faultType === sc.recommendedFaultType &&
                    f.description === sc.faultPresetLabel
                );
                return (
                  <div
                    key={sc.id}
                    className={`p-2 rounded-lg border text-[10px] font-mono flex flex-col gap-1 transition ${
                      isFaultInjected
                        ? 'bg-[#2a1019]/70 border-[#ff4d62]/70'
                        : 'bg-[#0a1220] border-[#203653] hover:border-[#38a3ff]/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="px-1.5 py-0.5 rounded-md bg-[#132238] text-[#eaf3ff] border border-[#203653] font-bold shrink-0">
                          #{sc.scenarioNumber} {sc.brandLabel}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-md bg-[#2a1c0a] text-[#ffb020] border border-[#ffb020]/55 font-bold shrink-0">
                          {sc.dtcCode}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          runScenario(sc.recommendedPinId, sc.recommendedFaultType, sc.faultPresetLabel)
                        }
                        className="hw-btn hw-btn-amber px-2 py-0.5 rounded-lg font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                        title={`Inject ${sc.recommendedFaultType} on ${targetPin?.label ?? sc.recommendedPinId}`}
                      >
                        <Play className="w-2.5 h-2.5" />
                        <span>Simulate Fault</span>
                      </button>
                    </div>
                    <div className="text-[#eaf3ff] font-semibold leading-snug">
                      {sc.targetModuleAndModels} — {sc.faultDescription}
                    </div>
                    <div className="text-[9px] text-[#d4e3f6] font-sans leading-snug">
                      <span className="text-[#ffb020] font-semibold">Setup:</span> {sc.benchSimulationSetup}
                    </div>
                    <div className="text-[9px] text-[#91a4bd] font-sans leading-snug">
                      <span className="text-[#20d889] font-semibold">Expected:</span> {sc.expectedEcuBehavior}
                    </div>
                    <div className="text-[9px] text-[#7c93b2] flex items-center justify-between pt-0.5 gap-2">
                      <span>
                        Bench Pin: {targetPin ? `${targetPin.label} (#${targetPin.pinNumber})` : sc.recommendedPinId}
                        {nodeVoltages[sc.recommendedPinId] !== undefined
                          ? ` (${nodeVoltages[sc.recommendedPinId].toFixed(2)}V)`
                          : ''}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {isFaultInjected && (
                          <span className="px-1.5 py-0.5 rounded-md bg-[#0b261c] border border-[#20d889]/55 text-[#20d889] font-bold text-[8px]">
                            {activeDTCs.some((d) => sc.dtcCode.includes(d.code))
                              ? 'MNA VERIFIED · DTC ACTIVE'
                              : 'MNA FAULT ACTIVE'}
                          </span>
                        )}
                        <span>{sc.recommendedFaultType}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Target Pin Selector */}
      <div className="flex flex-col gap-1.5 pt-2 border-t border-[#203653]/85">
        <label className="text-[9.5px] font-mono text-[#91a4bd] uppercase tracking-wider">
          Target ECU Pin Under Test
        </label>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 max-h-28 overflow-y-auto pr-1">
          {pins.map(p => {
            const hasFault = faults.some(f => f.pinId === p.id);
            const isSelected = p.id === currentPin.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPin(p.id)}
                className={`px-1.5 py-1 text-[9.5px] font-mono rounded-lg border flex flex-col items-center justify-center transition cursor-pointer ${
                  isSelected
                    ? 'bg-[#122645] border-[#19c8f5] text-[#eaf3ff] font-bold shadow-[0_0_10px_rgba(25,200,245,0.2)]'
                    : hasFault
                    ? 'bg-[#2a1019] border-[#ff4d62]/70 text-[#ff8594] font-semibold'
                    : 'bg-[#081120] border-[#203653] text-[#91a4bd] hover:border-[#38a3ff]/60 hover:text-[#eaf3ff]'
                }`}
              >
                <span className="truncate max-w-full">{p.label}</span>
                {hasFault && <span className="text-[8px] text-[#ff4d62] font-bold">FAULT</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Pin Readout */}
      <div className="hw-lcd-well px-2.5 py-2 rounded-xl flex items-center justify-between text-xs font-mono">
        <div className="truncate">
          <span className="text-[#19c8f5] font-bold">{currentPin.label}</span>
          <span className="text-[#91a4bd] ml-2">Pin #{currentPin.pinNumber}: {currentPin.name}</span>
        </div>
        <div className="text-[10px] text-[#91a4bd] tabular-nums shrink-0 ml-2">
          Nom: {currentPin.nominalVoltage.toFixed(1)}V
        </div>
      </div>

      {/* Fault Injection Keys */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {faultOptions.map(opt => {
          const isActive = (opt.type === 'NONE' && !activeFaultForPin) || (activeFaultForPin?.faultType === opt.type);
          return (
            <button
              key={opt.type}
              type="button"
              onClick={() => {
                if (opt.type === 'NONE') {
                  onRemoveFault(currentPin.id);
                } else {
                  onAddFault(currentPin.id, opt.type, opt.label);
                }
              }}
              className={`hw-btn p-2 rounded-lg text-left flex items-start gap-2 cursor-pointer ${
                isActive
                  ? opt.type === 'NONE'
                    ? 'hw-btn-green'
                    : 'hw-btn-amber'
                  : `text-[#d4e3f6] ${opt.color}`
              }`}
            >
              <div className="mt-0.5 shrink-0">{opt.icon}</div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-mono font-semibold leading-tight">{opt.label}</span>
                <span className="text-[9px] text-[#91a4bd] leading-tight mt-0.5">{opt.desc}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Live ECU OBD-II Diagnostic Trouble Codes */}
      <div className="flex flex-col gap-1.5 pt-2 border-t border-[#203653]/85">
        <div className="flex items-center justify-between">
          <span className="text-[9.5px] font-mono text-[#91a4bd] uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-[#19c8f5]" />
            LIVE OBD-II DTC MONITOR
          </span>
          <span className="text-[9.5px] font-mono text-[#7c93b2] tabular-nums">{activeDTCs.length} Stored</span>
        </div>

        {activeDTCs.length === 0 ? (
          <div className="bg-[#0b261c]/70 border border-[#20d889]/45 p-2.5 rounded-xl text-[10.5px] font-mono text-[#20d889] flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#20d889] shrink-0" />
            <span>ECU Status: All circuits nominal. Zero DTCs logged.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
            {activeDTCs.map(dtc => (
              <div
                key={dtc.code}
                className="bg-[#0a1220] border border-[#ff4d62]/60 p-2 rounded-xl flex items-center justify-between text-xs font-mono"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="bg-[#2a1019] text-[#ff8594] border border-[#ff4d62]/70 px-1.5 py-0.5 rounded-md font-bold text-[10px]">
                    {dtc.code}
                  </span>
                  <div className="flex flex-col truncate">
                    <span className="text-[#eaf3ff] font-semibold text-[10px] truncate">{dtc.system}</span>
                    <span className="text-[#91a4bd] text-[9px] truncate">{dtc.description}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-md bg-[#2a1019] text-[#ff8594] border border-[#ff4d62]/55 font-semibold">
                    {dtc.severity}
                  </span>
                  {onSearchDtc && (
                    <button
                      type="button"
                      onClick={() => onSearchDtc(dtc.code, dtc.description)}
                      className="hw-btn hw-btn-amber px-2 py-0.5 rounded-lg flex items-center gap-1 text-[9px] font-bold cursor-pointer"
                      title={`Search Live Google Grounding for ${dtc.code}`}
                    >
                      <Globe className="w-2.5 h-2.5" />
                      <span>Search TSB</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
