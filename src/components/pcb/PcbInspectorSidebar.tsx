import React from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Bot,
  Cable,
  Camera,
  CheckCircle,
  Cpu,
  Crosshair,
  Globe,
  Link2,
  Plus,
  Search,
  ShieldAlert,
  Thermometer,
  Trash2,
  Waypoints,
} from 'lucide-react';
import { ImageAnalysisHotspot } from '../../server/services/imageAnalysisTypes';
import {
  computeComponentPinCoords,
  DualProbeMeasurement,
  PcbAuditFinding,
  ProbeNodeTarget,
} from '../../simulation/pcb/PcbDiagnosticEngine';
import {
  ComponentThermalProfile,
  DetailedPcbComponent,
  ExtendedImageAnalysisNet,
  InspectorSubTab,
  InteractionMode,
  ResolveMnaFn,
} from './pcbScannerTypes';

interface PcbInspectorSidebarProps {
  mobileTab: 'CANVAS' | 'DRAWER';
  onSetMobileTab?: (tab: 'CANVAS' | 'DRAWER') => void;
  boardTitle?: string;
  uploadedImageUrl?: string | null;
  inspectorSubTab: InspectorSubTab;
  onSetInspectorSubTab: (tab: InspectorSubTab) => void;
  selectedComponent?: DetailedPcbComponent;
  selectedCompRef: string | null;
  selectedPinNumber: number | null;
  onSelectCompRef: (refDes: string) => void;
  onSelectPinNumber: (pinNumber: number) => void;
  components: DetailedPcbComponent[];
  filteredComponents: DetailedPcbComponent[];
  nets: ExtendedImageAnalysisNet[];
  effectiveNetId: string | null;
  onSetActiveNetId: (netName: string) => void;
  hotspots: ImageAnalysisHotspot[];
  selectedHotspotId: string | null;
  onSelectHotspotId: (id: string) => void;
  onSetShowHotspots: (show: boolean) => void;
  componentThermalMap: Record<string, ComponentThermalProfile>;
  peakBoardTempC: number;
  showThermalHeatmap: boolean;
  onSetShowThermalHeatmap: (val: boolean) => void;
  boardAuditFindings: PcbAuditFinding[];
  criticalAuditCount: number;
  interactionMode: InteractionMode;
  onSetInteractionMode: (mode: InteractionMode) => void;
  probeA: ProbeNodeTarget | null;
  probeB: ProbeNodeTarget | null;
  nextProbeSlot: 'A' | 'B';
  dualProbeMeasurement: DualProbeMeasurement | null;
  onPlaceProbe: (target: ProbeNodeTarget) => void;
  onSwapProbes: () => void;
  onClearProbes: () => void;
  searchTerm: string;
  onChangeSearchTerm: (q: string) => void;
  filterMode: 'ALL' | 'VERIFIED' | 'UNVERIFIED';
  onChangeFilterMode: (mode: 'ALL' | 'VERIFIED' | 'UNVERIFIED') => void;
  newNetName: string;
  onChangeNewNetName: (name: string) => void;
  resolveMnaNodeDetails: ResolveMnaFn;
  getNetColor: (netName: string) => string;
  onDeleteComponent: (refDes: string) => void;
  onUpdateComponentField: (refDes: string, updates: Partial<DetailedPcbComponent>) => void;
  onAddPinToComponent: (refDes: string) => void;
  onUpdatePinNet: (
    compRefDes: string,
    pinNumber: number,
    nextNetId: string,
    nextPinName?: string,
    nextVoltage?: number
  ) => void;
  onCreateAndLinkNet: () => void;
  onVerifyComponent: (refDes: string) => void;
  onAddWaypointToActiveNet: () => void;
  onDeleteLastVertexFromActiveNet: () => void;
  onAutoRouteNet: (netName: string) => void;
  onAddManualHotspot: (severity: 'CRITICAL' | 'WARNING' | 'INFO') => void;
  onDeleteHotspot: (id: string) => void;
  onSetStatusMessage: (msg: string) => void;
  onOpenGroundedSearch?: (query?: string, dtc?: string, ecu?: string) => void;
  onOpenOfflineBot?: (prompt?: string) => void;
  onCrossProbePin?: (pinId: string, label?: string, navigateToBench?: boolean) => void;
}

export const PcbInspectorSidebar: React.FC<PcbInspectorSidebarProps> = ({
  mobileTab,
  onSetMobileTab,
  boardTitle,
  uploadedImageUrl,
  inspectorSubTab,
  onSetInspectorSubTab,
  selectedComponent,
  selectedCompRef,
  selectedPinNumber,
  onSelectCompRef,
  onSelectPinNumber,
  components,
  filteredComponents,
  nets,
  effectiveNetId,
  onSetActiveNetId,
  hotspots,
  selectedHotspotId,
  onSelectHotspotId,
  onSetShowHotspots,
  componentThermalMap,
  peakBoardTempC,
  showThermalHeatmap,
  onSetShowThermalHeatmap,
  boardAuditFindings,
  criticalAuditCount,
  interactionMode,
  onSetInteractionMode,
  probeA,
  probeB,
  nextProbeSlot,
  dualProbeMeasurement,
  onPlaceProbe,
  onSwapProbes,
  onClearProbes,
  searchTerm,
  onChangeSearchTerm,
  filterMode,
  onChangeFilterMode,
  newNetName,
  onChangeNewNetName,
  resolveMnaNodeDetails,
  getNetColor,
  onDeleteComponent,
  onUpdateComponentField,
  onAddPinToComponent,
  onUpdatePinNet,
  onCreateAndLinkNet,
  onVerifyComponent,
  onAddWaypointToActiveNet,
  onDeleteLastVertexFromActiveNet,
  onAutoRouteNet,
  onAddManualHotspot,
  onDeleteHotspot,
  onSetStatusMessage,
  onOpenGroundedSearch,
  onOpenOfflineBot,
  onCrossProbePin,
}) => {
  const selectedPinObj =
    selectedComponent && selectedPinNumber !== null
      ? selectedComponent.pinSpecs?.find((p) => p.pinNumber === selectedPinNumber)
      : undefined;
  const selectedPinMna = selectedPinObj
    ? resolveMnaNodeDetails(selectedPinObj.connectedNetId, selectedPinObj.nominalVoltage)
    : null;

  return (
    <aside
      aria-label="Board inspector"
      className={`w-full md:w-[375px] xl:w-[400px] bg-[#131720] flex-col overflow-hidden text-xs font-body text-slate-100 border-t md:border-t-0 md:border-l border-[#2b313c] shrink-0 ${
        mobileTab === 'DRAWER' ? 'flex' : 'hidden md:flex'
      }`}
    >
      {/* Mobile Board Photo Quick-Access Banner */}
      <div className="md:hidden flex items-center justify-between p-2.5 bg-[#0f131a] border-b border-[#2b313c] text-xs shrink-0">
        <div
          className="flex items-center gap-2.5 min-w-0 cursor-pointer"
          onClick={() => onSetMobileTab?.('CANVAS')}
          role="button"
          tabIndex={0}
        >
          {uploadedImageUrl ? (
            <img
              src={uploadedImageUrl}
              alt="PCB Preview"
              className="w-11 h-9 rounded-[3px] object-cover border border-[#384150] shrink-0 bg-[#0c0e12]"
            />
          ) : (
            <div className="w-11 h-9 rounded-[3px] bg-[#0c0e12] border border-[#384150] flex items-center justify-center text-amber-400 shrink-0">
              <Camera className="w-4 h-4" />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-bold text-slate-100 truncate text-[11.5px]">
              {boardTitle || 'PCB Board'}
            </div>
            <div className="text-[10px] text-slate-400">
              Photo &amp; visual canvas available
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSetMobileTab?.('CANVAS')}
          className="hw-btn-blue px-2.5 py-1.5 rounded-[3px] font-bold text-[10.5px] font-mono flex items-center gap-1 shrink-0 cursor-pointer"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Board canvas</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* AutoElectric Lab Pro 5-Tab Inspector Navigation */}
      <nav
        aria-label="Inspector sections"
        className="grid grid-cols-5 gap-1 p-1.5 border-b border-[#2b313c] bg-[#0f131a] shrink-0 font-mono"
      >
        {(
          [
            { id: 'PART', label: 'PART' },
            { id: 'NETS', label: 'NETS' },
            { id: 'PROBE', label: 'PROBE' },
            { id: 'AUDIT', label: 'AUDIT', badge: boardAuditFindings.length },
            { id: 'THERMAL', label: 'IR' },
          ] as const
        ).map((t) => {
          const isActive = inspectorSubTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSetInspectorSubTab(t.id)}
              className={`min-h-[30px] py-1 px-1 rounded-[3px] text-[10px] font-bold tracking-[0.7px] flex items-center justify-center gap-1 transition whitespace-nowrap tabular-nums cursor-pointer ${
                isActive
                  ? 'hw-btn-blue'
                  : 'hw-btn text-slate-300 hover:text-white'
              }`}
            >
              <span>{t.label}</span>
              {'badge' in t && t.badge > 0 && (
                <span className="px-1 py-0.2 rounded-full bg-rose-950 border border-rose-500/70 text-rose-200 text-[9px]">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Scrollable Middle Inspector Content (.pcb-inspector-content) */}
      <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-3 min-h-0">
        {/* SUB-TAB 1: SELECTED COMPONENT DATASHEET & PINOUT EDITOR */}
        {inspectorSubTab === 'PART' && (
          <>
            {selectedComponent ? (
              <div className="flex flex-col gap-3">
                {/* AutoElectric Lab Pro Section Heading */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[9px] font-mono text-amber-400/90 tracking-[1.8px] font-bold uppercase">
                      COMPONENT INSPECTOR
                    </div>
                    <h2 className="text-[18px] font-bold font-mono text-slate-100 leading-tight mt-0.5">
                      {selectedComponent.refDes}
                      <span className="block text-[10.5px] font-sans font-normal text-slate-400 mt-0.5">
                        {selectedComponent.category.replace(/_/g, ' ')}
                      </span>
                    </h2>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${selectedComponent.refDes}`}
                    onClick={() => onDeleteComponent(selectedComponent.refDes)}
                    className="hw-btn min-h-[32px] px-2.5 py-1.5 rounded-[3px] text-slate-300 hover:border-rose-500 hover:text-rose-300 transition shrink-0 cursor-pointer"
                    title={`Remove ${selectedComponent.refDes}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Verification Status Button */}
                <div>
                  <button
                    type="button"
                    onClick={() => onVerifyComponent(selectedComponent.refDes)}
                    className={`min-h-[30px] px-3 py-1 rounded-[3px] text-[11px] font-mono inline-flex items-center gap-1.5 transition cursor-pointer ${
                      selectedComponent.verificationStatus === 'VERIFIED'
                        ? 'hw-btn-green font-bold'
                        : 'hw-btn-amber font-bold'
                    }`}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>
                      {selectedComponent.verificationStatus === 'VERIFIED'
                        ? 'Verified component'
                        : 'Unverified observation'}
                    </span>
                  </button>
                </div>

                {selectedComponent.verificationStatus === 'UNKNOWN' && (
                  <div className="px-2.5 py-2 rounded-[3px] bg-amber-950/50 border border-amber-500/60 text-[10.5px] text-amber-200 leading-snug">
                    <strong>Anti-Fabrication Guard:</strong> Marking or specs could not be verified from the image. Confirm physically before marking verified.
                  </div>
                )}

                {/* 2-Column Field Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="flex flex-col gap-1 text-[10px] text-slate-400 min-w-0">
                    <span>Marking</span>
                    <input
                      type="text"
                      value={selectedComponent.marking}
                      onChange={(e) =>
                        onUpdateComponentField(selectedComponent.refDes, {
                          marking: e.target.value,
                        })
                      }
                      className="min-h-[31px] px-2 py-1 rounded-[3px] bg-[#0c0e12] border border-[#384150] text-slate-100 text-[11.5px] font-mono focus:outline-none focus:border-[#3b82f6]"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[10px] text-slate-400 min-w-0">
                    <span>Package</span>
                    <input
                      type="text"
                      value={selectedComponent.packageType}
                      onChange={(e) =>
                        onUpdateComponentField(selectedComponent.refDes, {
                          packageType: e.target.value,
                        })
                      }
                      className="min-h-[31px] px-2 py-1 rounded-[3px] bg-[#0c0e12] border border-[#384150] text-slate-100 text-[11.5px] font-mono focus:outline-none focus:border-[#3b82f6]"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <label className="flex flex-col gap-1 text-[10px] text-slate-400 min-w-0">
                    <span>Decoded value</span>
                    <input
                      type="text"
                      value={selectedComponent.decodedValue}
                      onChange={(e) =>
                        onUpdateComponentField(selectedComponent.refDes, {
                          decodedValue: e.target.value,
                        })
                      }
                      className="min-h-[31px] px-2 py-1 rounded-[3px] bg-[#0c0e12] border border-[#384150] text-slate-100 text-[11.5px] font-mono focus:outline-none focus:border-[#3b82f6]"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[10px] text-slate-400 min-w-0">
                    <span>Operating range</span>
                    <input
                      type="text"
                      value={selectedComponent.operatingVoltageRange || ''}
                      onChange={(e) =>
                        onUpdateComponentField(selectedComponent.refDes, {
                          operatingVoltageRange: e.target.value,
                        })
                      }
                      className="min-h-[31px] px-2 py-1 rounded-[3px] bg-[#0c0e12] border border-[#384150] text-slate-100 text-[11.5px] font-mono focus:outline-none focus:border-[#3b82f6]"
                    />
                  </label>
                </div>

                {/* Ecosystem Action Buttons: Datasheet lookup & Diagnostic assistant */}
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <button
                    type="button"
                    onClick={() =>
                      onOpenGroundedSearch?.(
                        `${selectedComponent.marking || selectedComponent.decodedValue} ${selectedComponent.category} automotive ECU datasheet pinout`,
                        '',
                        selectedComponent.marking || selectedComponent.refDes
                      )
                    }
                    className="hw-btn min-h-[32px] px-2.5 py-1.5 rounded-[3px] text-slate-200 hover:text-white text-[10.5px] font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Globe className="w-3.5 h-3.5 text-[#3b82f6]" />
                    <span>Datasheet lookup</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenOfflineBot?.(
                        `Analyze ECU PCB component ${selectedComponent.refDes} (${selectedComponent.marking || selectedComponent.decodedValue}, ${selectedComponent.category}). Function: ${selectedComponent.circuitFunction}. What failure modes and multimeter checks apply?`
                      )
                    }
                    className="hw-btn min-h-[32px] px-2.5 py-1.5 rounded-[3px] text-slate-200 hover:text-white text-[10.5px] font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Bot className="w-3.5 h-3.5 text-amber-400" />
                    <span>Diagnostic assistant</span>
                  </button>
                </div>

                {selectedComponent.datasheetSummary && (
                  <div className="text-[10.5px] text-slate-300 bg-[#0c0e12] p-2.5 rounded-[3px] border border-[#2b313c] leading-relaxed shadow-inner">
                    <span className="text-[9px] font-mono text-amber-400/90 uppercase font-bold tracking-[1px] block mb-0.5">
                      OEM Datasheet &amp; Hardware Notes
                    </span>
                    {selectedComponent.datasheetSummary}
                  </div>
                )}

                {/* PINOUT & READINGS */}
                <div className="pt-2 border-t border-[#2b313c] flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-mono tracking-[1.2px] text-slate-300 font-bold uppercase">
                      PINOUT &amp; READINGS
                    </h3>
                    <button
                      type="button"
                      onClick={() => onAddPinToComponent(selectedComponent.refDes)}
                      className="hw-btn min-h-[26px] px-2 py-0.5 rounded-[3px] text-slate-200 hover:text-white text-[10px] font-mono inline-flex items-center gap-1 transition cursor-pointer"
                    >
                      <Plus className="w-3 h-3 text-amber-400" />
                      <span>Pin</span>
                    </button>
                  </div>

                  {selectedComponent.pinSpecs &&
                    selectedComponent.pinSpecs.map((pin, pinIdx) => {
                      const isPinSelected =
                        selectedPinNumber === pin.pinNumber &&
                        selectedCompRef === selectedComponent.refDes;
                      const mnaInfo = resolveMnaNodeDetails(
                        pin.connectedNetId,
                        pin.nominalVoltage
                      );
                      return (
                        <div
                          key={pin.pinNumber}
                          onClick={() => {
                            onSelectPinNumber(pin.pinNumber);
                            onSetActiveNetId(pin.connectedNetId);
                          }}
                          className={`p-2.5 rounded-[4px] border transition flex flex-col gap-2 cursor-pointer ${
                            isPinSelected
                              ? 'bg-[#131d31] border-[#3b82f6] shadow-[inset_0_1px_0_rgba(59,130,246,0.2)]'
                              : 'bg-[#0c0e12] border-[#2b313c] hover:border-[#3c4554]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <strong className="text-[11.5px] font-mono text-amber-300">
                              #{pin.pinNumber}
                            </strong>
                            <span className="ml-auto font-mono text-[11px] text-emerald-400 font-bold tabular-nums">
                              {mnaInfo.voltage.toFixed(3)} V{' '}
                              <small className="text-[8.5px] text-slate-400 font-normal uppercase">
                                {mnaInfo.simPinId ? 'MNA' : 'NOMINAL'}
                              </small>
                            </span>
                            <button
                              type="button"
                              aria-label={`Probe ${selectedComponent.refDes} pin ${pin.pinNumber}`}
                              title="Send to Probe A/B"
                              onClick={(e) => {
                                e.stopPropagation();
                                const pt = computeComponentPinCoords(
                                  selectedComponent,
                                  pinIdx,
                                  selectedComponent.pinSpecs?.length || 1
                                );
                                onPlaceProbe({
                                  label: `${selectedComponent.refDes} #${pin.pinNumber} (${pin.pinName})`,
                                  compRefDes: selectedComponent.refDes,
                                  pinNumber: pin.pinNumber,
                                  pinName: pin.pinName,
                                  netId: pin.connectedNetId,
                                  nominalVoltage: pin.nominalVoltage,
                                  xNorm: pt.x,
                                  yNorm: pt.y,
                                });
                              }}
                              className="hw-btn min-h-[24px] px-1.5 py-0.5 rounded-[3px] text-slate-200 hover:text-amber-300 cursor-pointer"
                            >
                              <Crosshair className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <label className="flex flex-col gap-1 text-[9.5px] text-slate-400">
                              <span>Signal</span>
                              <input
                                type="text"
                                value={pin.pinName}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  onUpdatePinNet(
                                    selectedComponent.refDes,
                                    pin.pinNumber,
                                    pin.connectedNetId,
                                    e.target.value
                                  )
                                }
                                className="min-h-[28px] px-2 py-0.5 rounded-[3px] bg-[#141820] border border-[#384150] text-slate-100 text-[11px] font-mono focus:outline-none focus:border-[#3b82f6]"
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-[9.5px] text-slate-400">
                              <span>Nominal V</span>
                              <input
                                type="number"
                                step="0.1"
                                value={pin.nominalVoltage}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  onUpdatePinNet(
                                    selectedComponent.refDes,
                                    pin.pinNumber,
                                    pin.connectedNetId,
                                    undefined,
                                    parseFloat(e.target.value)
                                  )
                                }
                                className="min-h-[28px] px-2 py-0.5 rounded-[3px] bg-[#141820] border border-[#384150] text-slate-100 text-[11px] font-mono tabular-nums focus:outline-none focus:border-[#3b82f6]"
                              />
                            </label>
                          </div>

                          <label className="flex flex-col gap-1 text-[9.5px] text-slate-400">
                            <span>Net ID</span>
                            <input
                              type="text"
                              value={pin.connectedNetId}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                onUpdatePinNet(
                                  selectedComponent.refDes,
                                  pin.pinNumber,
                                  e.target.value
                                )
                              }
                              className="min-h-[28px] px-2 py-0.5 rounded-[3px] bg-[#141820] border border-[#384150] text-slate-100 text-[11px] font-mono focus:outline-none focus:border-[#3b82f6]"
                            />
                          </label>

                          {onCrossProbePin && mnaInfo.simPinId && (
                            <div className="flex items-center justify-between pt-1 border-t border-[#262c36] text-[9.5px]">
                              <span className="text-slate-400 font-mono truncate">
                                {mnaInfo.mnaNodeId}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCrossProbePin(
                                    mnaInfo.simPinId!,
                                    `${selectedComponent.refDes} #${pin.pinNumber} (${pin.pinName})`,
                                    true
                                  );
                                }}
                                className="hw-btn-blue px-2 py-0.5 rounded-[3px] font-mono font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                              >
                                <Cable className="w-2.5 h-2.5" />
                                <span>Harness DMM</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {/* Quick Link Component to New or Existing Net */}
                  <div className="flex items-center gap-1.5 pt-1 font-mono">
                    <input
                      type="text"
                      placeholder="New net e.g. NET_5V_REF"
                      value={newNetName}
                      onChange={(e) => onChangeNewNetName(e.target.value)}
                      className="flex-1 min-h-[29px] bg-[#0c0e12] border border-[#384150] rounded-[3px] px-2 py-1 text-[10.5px] font-mono text-slate-100 focus:outline-none focus:border-[#3b82f6]"
                    />
                    <button
                      type="button"
                      onClick={onCreateAndLinkNet}
                      className="hw-btn min-h-[29px] px-2.5 py-1 rounded-[3px] text-slate-200 hover:text-white text-[10.5px] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Link2 className="w-3 h-3 text-amber-400" />
                      <span>Link #{selectedPinNumber || 1}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 px-3 text-center flex flex-col items-center justify-center gap-2 text-slate-400">
                <Cpu className="w-7 h-7 text-[#40d9dc]" />
                <h3 className="text-[14px] font-semibold text-[#d0dfec]">
                  No component selected
                </h3>
                <p className="text-[11px]">
                  Select a component on the board or from the part registry below.
                </p>
              </div>
            )}
          </>
        )}

      {/* SUB-TAB 2: COPPER TRACE NETS & ORTHOGONAL ROUTER */}
      {inspectorSubTab === 'NETS' && (
        <div className="bg-[#171b22] border border-[#2b313c] p-3 rounded-[3px] flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10.5px] font-bold text-amber-300 uppercase tabular-nums">
              Copper Trace Net Registry ({nets.length})
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onAddWaypointToActiveNet}
                disabled={!effectiveNetId}
                className="hw-btn-green text-[10px] px-2 py-0.5 rounded-[2px] disabled:opacity-40"
              >
                + Add Vertex
              </button>
              <button
                type="button"
                onClick={onDeleteLastVertexFromActiveNet}
                disabled={!effectiveNetId}
                className="hw-btn text-[10px] px-2 py-0.5 rounded-[2px] text-slate-300 hover:text-rose-200 disabled:opacity-40"
                title="Remove last waypoint vertex from active net"
              >
                − Del Vertex
              </button>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 font-sans">
            Click any net to highlight its connected pins and copper paths, or jump linked rails straight to the Bench Harness DMM.
          </p>
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
            {nets.map((net) => {
              const isSelected = effectiveNetId === net.name;
              const color = getNetColor(net.name);
              const mnaNetInfo = resolveMnaNodeDetails(net.name, net.nominalVoltage ?? 0);
              return (
                <div
                  key={net.name}
                  onClick={() => onSetActiveNetId(net.name)}
                  className={`p-2 rounded-[2px] border flex flex-col gap-1 cursor-pointer transition text-[11px] ${
                    isSelected
                      ? 'bg-amber-950/40 border-amber-500 text-white'
                      : 'hw-lcd-well border-[#2b313c] text-slate-300 hover:border-[#444e5e]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate min-w-0 font-bold">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="truncate">{net.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-[#4ade80] font-bold tabular-nums">
                        {mnaNetInfo.voltage.toFixed(2)}V
                      </span>
                      {onCrossProbePin && mnaNetInfo.simPinId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCrossProbePin(mnaNetInfo.simPinId!, net.name, true);
                          }}
                          className="hw-btn-green text-[9px] px-1.5 py-0.5 rounded-[2px] flex items-center gap-1"
                          title={`Probe ${net.name} (${mnaNetInfo.simPinId}) on Harness DMM`}
                        >
                          <Cable className="w-2.5 h-2.5" />
                          <span>DMM</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAutoRouteNet(net.name);
                        }}
                        className="hw-btn text-[9px] px-1.5 py-0.5 rounded-[2px] text-amber-300"
                        title="Rebuild orthogonal Manhattan copper trace across linked components"
                      >
                        Route
                      </button>
                    </div>
                  </div>
                  <div className="text-[9.5px] text-slate-400 flex items-center justify-between">
                    <span>Nodes: {net.connectedComponentRefs.join(', ') || 'None'}</span>
                    <span>{net.signalType}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: DUAL-PROBE BENCH METER (CONTINUITY / DIODE / ΔV) */}
      {inspectorSubTab === 'PROBE' && (
        <div className="bg-[#171b22] border border-[#2b313c] p-3 rounded-[3px] flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] font-bold text-[#4ade80] uppercase flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5 text-[#4ade80]" />
              Dual-Probe MNA &amp; Continuity Meter
            </span>
            <button
              type="button"
              onClick={() => onSetInteractionMode('PROBE')}
              className={`text-[9.5px] px-2 py-0.5 rounded-[2px] font-bold ${
                interactionMode === 'PROBE' ? 'hw-btn-green' : 'hw-btn text-slate-200'
              }`}
            >
              {interactionMode === 'PROBE' ? 'Probing Active' : 'Activate Probe Tool'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded-[2px] hw-lcd-well border border-rose-500/45 flex flex-col gap-0.5">
              <span className="text-[9px] text-rose-300 font-bold uppercase">
                Probe A (Red +) {nextProbeSlot === 'A' ? '· NEXT' : ''}
              </span>
              <span className="text-[11px] font-bold text-white truncate">
                {probeA ? probeA.label : 'Unplaced'}
              </span>
              <span className="text-[10px] text-amber-300 tabular-nums font-bold">
                {probeA
                  ? `${resolveMnaNodeDetails(probeA.netId, probeA.nominalVoltage).voltage.toFixed(3)} V DC`
                  : '—'}
              </span>
              <span className="text-[9px] text-slate-400 truncate">
                {probeA ? probeA.netId : 'Click any node on board'}
              </span>
            </div>

            <div className="p-2 rounded-[2px] hw-lcd-well border border-[#3c4554] flex flex-col gap-0.5">
              <span className="text-[9px] text-slate-300 font-bold uppercase">
                Probe B (Black −) {nextProbeSlot === 'B' ? '· NEXT' : ''}
              </span>
              <span className="text-[11px] font-bold text-white truncate">
                {probeB ? probeB.label : 'Unplaced'}
              </span>
              <span className="text-[10px] text-amber-300 tabular-nums font-bold">
                {probeB
                  ? `${resolveMnaNodeDetails(probeB.netId, probeB.nominalVoltage).voltage.toFixed(3)} V DC`
                  : '—'}
              </span>
              <span className="text-[9px] text-slate-400 truncate">
                {probeB ? probeB.netId : 'Click second node'}
              </span>
            </div>
          </div>

          {dualProbeMeasurement ? (
            <div className="p-2.5 rounded-[2px] hw-lcd-well border border-[#22c55e]/45 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[9px] text-slate-400 uppercase block font-sans">
                    Differential Potential ΔV (A − B)
                  </span>
                  <span className="text-base font-extrabold text-[#4ade80] tabular-nums">
                    {dualProbeMeasurement.differentialVoltage >= 0 ? '+' : ''}
                    {dualProbeMeasurement.differentialVoltage.toFixed(3)} V DC
                  </span>
                </div>
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-[2px] font-bold border uppercase ${
                    dualProbeMeasurement.continuityStatus === 'SHORT_FAULT'
                      ? 'bg-rose-950 border-rose-500 text-rose-200'
                      : dualProbeMeasurement.continuityStatus === 'CONTINUOUS'
                      ? 'bg-[#10261a] border-[#22c55e] text-[#4ade80]'
                      : dualProbeMeasurement.continuityStatus === 'DIODE_JUNCTION' ||
                        dualProbeMeasurement.continuityStatus === 'RESISTIVE'
                      ? 'bg-amber-950 border-amber-500 text-amber-200'
                      : 'bg-[#141820] border-[#3c4554] text-slate-300'
                  }`}
                >
                  {dualProbeMeasurement.continuityStatus.replace('_', ' ')}
                </span>
              </div>

              <div className="px-2 py-1.5 rounded-[2px] bg-[#0c0e12] border border-[#2b313c] text-[11px] font-bold text-amber-300 tabular-nums">
                {dualProbeMeasurement.continuityLabel}
              </div>

              {dualProbeMeasurement.activeFaultNote && (
                <div className="px-2 py-1.5 rounded-[2px] bg-rose-950/70 border border-rose-500/60 text-[10px] text-rose-200 font-sans">
                  <strong>Fault Correlation:</strong> {dualProbeMeasurement.activeFaultNote}
                </div>
              )}

              <p className="text-[10px] text-slate-300 font-sans leading-relaxed">
                {dualProbeMeasurement.guidance}
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-[2px] hw-lcd-well border border-[#2b313c] text-[10.5px] text-slate-400 font-sans text-center">
              Place both <strong>Probe A (+)</strong> and <strong>Probe B (−)</strong> on any pins or trace nodes to measure MNA ΔV, copper continuity, diode Vf, or CAN differential termination.
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!probeA || !probeB}
              onClick={onSwapProbes}
              className="hw-btn flex-1 py-1.5 px-2 rounded-[2px] disabled:opacity-40 text-slate-200 text-[10px] font-semibold flex items-center justify-center gap-1"
            >
              <ArrowLeftRight className="w-3 h-3" />
              <span>Swap A ↔ B</span>
            </button>
            <button
              type="button"
              disabled={!probeA && !probeB}
              onClick={onClearProbes}
              className="hw-btn py-1.5 px-3 rounded-[2px] disabled:opacity-40 text-slate-300 hover:text-rose-200 text-[10px] font-semibold"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: AUTOMATED MNA/ERC AUDIT & PHYSICAL HOTSPOTS */}
      {inspectorSubTab === 'AUDIT' && (
        <div className="bg-[#171b22] border border-[#2b313c] p-3 rounded-[3px] flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] text-amber-300 uppercase tracking-wider font-bold flex items-center gap-1.5 tabular-nums">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                Automated ERC / MNA Audit ({boardAuditFindings.length})
              </span>
              {criticalAuditCount > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-[2px] bg-rose-950 border border-rose-500 text-rose-200 font-bold tabular-nums">
                  {criticalAuditCount} CRITICAL
                </span>
              )}
            </div>

            {boardAuditFindings.length === 0 ? (
              <div className="text-[10.5px] text-[#4ade80] font-sans px-2.5 py-2.5 bg-[#10261a]/60 rounded-[2px] border border-[#22c55e]/50 text-center">
                All MNA voltage rails, thermal junctions, and netlist checks are nominal.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                {boardAuditFindings.map((finding) => (
                  <div
                    key={finding.id}
                    onClick={() => {
                      if (finding.targetCompRef) onSelectCompRef(finding.targetCompRef);
                      if (finding.targetNetId) onSetActiveNetId(finding.targetNetId);
                      if (finding.targetHotspotId) onSelectHotspotId(finding.targetHotspotId);
                      if (finding.category === 'THERMAL') onSetShowThermalHeatmap(true);
                      onSetStatusMessage(`AUDIT FOCUS: ${finding.title}`);
                    }}
                    className={`p-2 rounded-[2px] border cursor-pointer transition text-[10.5px] ${
                      finding.severity === 'CRITICAL'
                        ? 'bg-rose-950/50 border-rose-500/60 hover:border-rose-400 text-slate-100'
                        : finding.severity === 'WARNING'
                        ? 'bg-amber-950/40 border-amber-500/50 hover:border-amber-400 text-slate-200'
                        : 'hw-lcd-well border-[#2b313c] hover:border-amber-500/50 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 font-bold">
                      <span className="truncate">{finding.title}</span>
                      <span
                        className={`text-[8.5px] px-1.5 py-0.5 rounded-[2px] shrink-0 ${
                          finding.severity === 'CRITICAL'
                            ? 'bg-rose-900 text-rose-100'
                            : finding.severity === 'WARNING'
                            ? 'bg-amber-900 text-amber-100'
                            : 'bg-[#1c222d] text-slate-200 border border-[#3c4554]'
                        }`}
                      >
                        {finding.severity}
                      </span>
                    </div>
                    <p className="text-[9.5px] text-slate-300 font-sans mt-1 leading-snug">
                      {finding.detail}
                    </p>
                    <p className="text-[9px] text-amber-300/90 font-sans mt-1">
                      Action: {finding.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-[#2b313c] flex flex-col gap-2">
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <span className="text-[10.5px] text-rose-300 uppercase tracking-wider font-bold flex items-center gap-1.5 tabular-nums">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                Physical Hotspots ({hotspots.length})
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onAddManualHotspot('WARNING')}
                  className="hw-btn-amber text-[9.5px] px-1.5 py-0.5 rounded-[2px]"
                  title="Flag Warning Inspection Zone on Selected Component"
                >
                  + Warning
                </button>
                <button
                  type="button"
                  onClick={() => onAddManualHotspot('CRITICAL')}
                  className="text-[9.5px] px-1.5 py-0.5 rounded-[2px] bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-600/50"
                  title="Flag Critical Fault Zone on Selected Component"
                >
                  + Critical
                </button>
              </div>
            </div>

            {hotspots.length === 0 ? (
              <div className="text-[10.5px] text-slate-500 font-sans px-2 py-2.5 hw-lcd-well rounded-[2px] border border-[#2b313c] text-center">
                No physical hotspots flagged on this board.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                {hotspots.map((h) => (
                  <div
                    key={h.id}
                    onClick={() => {
                      onSelectHotspotId(h.id);
                      onSetShowHotspots(true);
                      if (h.suspectComponentRef) onSelectCompRef(h.suspectComponentRef);
                    }}
                    className={`p-2 rounded-[2px] border cursor-pointer transition text-[10.5px] ${
                      selectedHotspotId === h.id
                        ? 'bg-rose-950/60 border-rose-400 text-white'
                        : 'hw-lcd-well border-[#2b313c] text-slate-300 hover:border-[#444e5e]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 font-bold">
                      <span className="truncate">{h.label}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={`text-[8.5px] px-1.5 py-0.5 rounded-[2px] ${
                            h.severity === 'CRITICAL'
                              ? 'bg-rose-900 text-rose-200'
                              : h.severity === 'WARNING'
                              ? 'bg-amber-900 text-amber-200'
                              : 'bg-[#1c222d] text-slate-200 border border-[#3c4554]'
                          }`}
                        >
                          {h.severity}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteHotspot(h.id);
                          }}
                          className="p-0.5 text-slate-500 hover:text-rose-300"
                          title="Remove Hotspot Flag"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[9.5px] text-slate-300 font-sans mt-1 leading-relaxed">
                      {h.notes}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 5: ELECTRO-THERMAL IR SIMULATOR TELEMETRY */}
      {inspectorSubTab === 'THERMAL' && (
        <div className="bg-[#171b22] border border-[#2b313c] p-3 rounded-[3px] flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] font-bold text-amber-300 uppercase flex items-center gap-1.5 tabular-nums">
              <Thermometer className="w-3.5 h-3.5 text-rose-400" />
              Electro-Thermal (Peak {peakBoardTempC.toFixed(1)}°C)
            </span>
            <button
              type="button"
              onClick={() => onSetShowThermalHeatmap(!showThermalHeatmap)}
              className={`text-[9.5px] px-2 py-0.5 rounded-[2px] font-bold border transition ${
                showThermalHeatmap
                  ? 'bg-rose-950 border-rose-500 text-rose-200'
                  : 'hw-btn text-slate-300'
              }`}
            >
              {showThermalHeatmap ? 'IR Overlay: ON' : 'IR Overlay: OFF'}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
            Computes real steady-state junction temperature (
            <code className="text-amber-300">TJ = TA + PD × RθJA</code>) from bench supply voltage, load current, and active fault injections.
          </p>
          <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
            {components.map((comp) => {
              const th = componentThermalMap[comp.refDes];
              if (!th) return null;
              return (
                <div
                  key={`therm-row-${comp.refDes}`}
                  onClick={() => {
                    onSelectCompRef(comp.refDes);
                    onSetShowThermalHeatmap(true);
                  }}
                  className="p-2 rounded-[2px] hw-lcd-well border border-[#2b313c] hover:border-[#444e5e] cursor-pointer flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-bold text-amber-300 truncate">
                        {comp.refDes}{' '}
                        <span className="text-slate-400 font-normal">({comp.marking})</span>
                      </span>
                      {th.faultLinked && (
                        <span className="text-[8px] px-1 py-0.5 rounded-[2px] bg-rose-950 border border-rose-500/70 text-rose-200 font-bold shrink-0">
                          FAULT
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[2px] tabular-nums shrink-0 ${
                        th.tempC >= 110
                          ? 'bg-rose-950 text-rose-300 border border-rose-600'
                          : th.tempC >= 80
                          ? 'bg-amber-950 text-amber-300 border border-amber-600'
                          : 'bg-sky-950 text-sky-300 border border-sky-700'
                      }`}
                    >
                      {th.tempC.toFixed(1)}°C · {th.powerDissipationMw} mW
                    </span>
                  </div>
                  <div className="text-[9.5px] text-slate-400 font-sans">
                    {th.dominantHeatSource}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      </div>

      {/* AutoElectric Lab Pro Pinned Bottom Part Registry */}
      <div className="border-t border-[#2b313c] bg-[#0f131a] px-3.5 pt-2.5 pb-3 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between text-[10px] font-mono tracking-[1.2px] text-slate-300 font-bold uppercase tabular-nums">
          <h3>PART REGISTRY</h3>
          <span className="text-amber-300">
            {filteredComponents.length} / {components.length}
          </span>
        </div>

        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-slate-400" />
          <input
            type="text"
            aria-label="Search components"
            placeholder="Reference, marking, value…"
            value={searchTerm}
            onChange={(e) => onChangeSearchTerm(e.target.value)}
            className="w-full min-h-[30px] bg-[#0c0e12] border border-[#384150] rounded-[3px] pl-8 pr-2.5 py-1 text-[11px] font-mono text-slate-100 focus:outline-none focus:border-[#3b82f6]"
          />
        </div>

        <select
          value={filterMode}
          aria-label="Filter by verification"
          onChange={(e) =>
            onChangeFilterMode(e.target.value as 'ALL' | 'VERIFIED' | 'UNVERIFIED')
          }
          className="w-full min-h-[29px] bg-[#0c0e12] border border-[#384150] rounded-[3px] px-2 py-1 text-[10.5px] font-mono text-slate-100 focus:outline-none focus:border-[#3b82f6]"
        >
          <option value="ALL">All observations</option>
          <option value="VERIFIED">Technician verified</option>
          <option value="UNVERIFIED">Unverified</option>
        </select>

        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-0.5 font-mono">
          {filteredComponents.map((comp) => {
            const isSelected = selectedCompRef === comp.refDes;
            return (
              <button
                key={comp.refDes}
                type="button"
                onClick={() => {
                  onSelectCompRef(comp.refDes);
                  onSetInspectorSubTab('PART');
                  if (comp.pinSpecs?.[0]?.connectedNetId) {
                    onSetActiveNetId(comp.pinSpecs[0].connectedNetId);
                  }
                }}
                className={`w-full min-h-[32px] px-2.5 py-1 rounded-[3px] flex items-center gap-2 text-left transition text-[10.5px] cursor-pointer ${
                  isSelected
                    ? 'hw-btn-blue font-semibold'
                    : 'hw-btn text-slate-200 hover:text-white'
                }`}
              >
                <strong
                  className={`min-w-[26px] font-mono text-[11px] font-bold ${
                    isSelected ? 'text-amber-300' : 'text-amber-400'
                  }`}
                >
                  {comp.refDes}
                </strong>
                <span className="truncate text-slate-200 flex-1">
                  {comp.marking || comp.category}
                </span>
                {showThermalHeatmap && componentThermalMap[comp.refDes] && (
                  <span className="text-[9px] text-amber-300 font-mono tabular-nums shrink-0">
                    {Math.round(componentThermalMap[comp.refDes].tempC)}°C
                  </span>
                )}
                <small
                  className={`ml-auto text-[8.5px] font-mono uppercase shrink-0 ${
                    comp.verificationStatus === 'VERIFIED'
                      ? isSelected
                        ? 'text-emerald-300 font-bold'
                        : 'text-emerald-400'
                      : 'text-amber-300'
                  }`}
                >
                  {comp.verificationStatus === 'VERIFIED'
                    ? 'VERIFIED'
                    : comp.source || 'MANUAL'}
                </small>
              </button>
            );
          })}
          {filteredComponents.length === 0 && (
            <p className="py-3 text-center text-[11px] text-slate-400">
              No matching components.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
};
