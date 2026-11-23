import React, { useEffect, useRef, useState } from 'react';
import {
  CloudUpload,
  Download,
  FileJson,
  Flame,
  FolderOpen,
  Lock,
  MoreHorizontal,
  Plus,
  ShieldAlert,
  Sparkles,
  Upload,
  Zap,
} from 'lucide-react';
import { PowerSupplyState } from '../../types/ecu';
import { useTrialAccess } from '../../context/TrialAccessContext';
import { LabDrawerIcon } from '../icons/LabDrawerIcons';
import { InspectorSubTab, PartTemplateId, SampleBoard } from './pcbScannerTypes';

interface PcbToolbarProps {
  sampleBoards: SampleBoard[];
  oemBoards: SampleBoard[];
  selectedBoard: SampleBoard;
  boardTitle?: string;
  boardType?: string;
  componentsCount?: number;
  netsCount?: number;
  uploadedImageUrl: string | null;
  powerSupply?: PowerSupplyState;
  peakBoardTempC: number;
  criticalAuditCount: number;
  auditCount: number;
  isAnalyzing: boolean;
  statusMessage: string;
  showAddPartMenu: boolean;
  isSavingScan: boolean;
  showSavedScansPanel: boolean;
  savedScansCount: number;
  onLoadSample: (board: SampleBoard) => void;
  onSelectThermalTab: () => void;
  onSelectAuditTab: () => void;
  onToggleAddPartMenu: () => void;
  onRerunLocalCv: () => void;
  onSavePcbToCloud: () => void;
  onToggleSavedScansPanel: () => void;
  onUploadFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImportJsonFile?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExportJson: () => void;
  onAddCustomComponent: (template: PartTemplateId) => void;
  onSetInspectorTab?: (tab: InspectorSubTab) => void;
}

const PART_TEMPLATES: readonly { id: PartTemplateId; label: string }[] = [
  { id: 'TEST_POINT', label: 'TEST POINT' },
  { id: 'RESISTOR', label: 'RESISTOR (100R)' },
  { id: 'CAPACITOR', label: 'CAPACITOR (100nF)' },
  { id: 'DIODE', label: 'DIODE (B540C)' },
  { id: 'MOSFET_DRIVER', label: 'MOSFET DRIVER (BTS141)' },
  { id: 'VOLTAGE_REGULATOR', label: 'VOLTAGE REGULATOR (TLE4275G)' },
];

export const PcbToolbar: React.FC<PcbToolbarProps> = ({
  sampleBoards,
  oemBoards,
  selectedBoard,
  componentsCount,
  netsCount,
  uploadedImageUrl,
  powerSupply,
  peakBoardTempC,
  criticalAuditCount,
  auditCount,
  isAnalyzing,
  showAddPartMenu,
  isSavingScan,
  showSavedScansPanel,
  savedScansCount,
  onLoadSample,
  onSelectThermalTab,
  onSelectAuditTab,
  onToggleAddPartMenu,
  onRerunLocalCv,
  onSavePcbToCloud,
  onToggleSavedScansPanel,
  onUploadFile,
  onImportJsonFile,
  onExportJson,
  onAddCustomComponent,
}) => {
  const [showMobileActions, setShowMobileActions] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const { accessMode, canUseExports, openAccessModal } = useTrialAccess();

  const handleGuardedExport = () => {
    if (!canUseExports) {
      openAccessModal({
        tab: 'TRIAL_PIN',
        notice:
          accessMode === 'TRIAL_EXPIRED' || accessMode === 'TRIAL_REVOKED'
            ? 'Trial expired — PCB JSON & thermal project exports are locked. Enter a new 8-digit Trial PIN.'
            : 'Enter an active 8-digit Trial PIN or Master Admin PIN to export PCB JSON projects.',
      });
      return;
    }
    onExportJson();
  };

  const partTotal = componentsCount ?? selectedBoard.components.length;
  const netTotal = netsCount ?? selectedBoard.nets.length;
  const isBenchEnergized = powerSupply?.isOutputEnabled !== false;

  useEffect(() => {
    if (!showMobileActions) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setShowMobileActions(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showMobileActions]);

  return (
    <header className="shrink-0 border-b border-[#203653] bg-[#0A1220]/90 px-2.5 sm:px-3 py-1.5 font-body text-[#EAF3FF]">
      <div className="flex items-center justify-between gap-2 min-w-0">
        {/* Left: Compact PCB Vision Mark + Unified Board Profile Selector */}
        <div className="flex items-center gap-2 min-w-0 flex-1 lg:flex-initial">
          <div className="hidden sm:flex h-8 w-8 rounded-lg border border-[#203653] bg-[#050A12] items-center justify-center shrink-0">
            <LabDrawerIcon name="tray-stack" size={24} className="w-4 h-4" />
          </div>

          <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-initial">
            <select
              aria-label="Load reference preset or OEM ECU PCB Profile"
              value={selectedBoard.id}
              onChange={(e) => {
                const allBoards = [...sampleBoards, ...oemBoards];
                const chosen = allBoards.find((b) => b.id === e.target.value);
                if (chosen) onLoadSample(chosen);
              }}
              className="h-8 min-w-0 flex-1 sm:flex-initial sm:max-w-[260px] lg:max-w-[290px] px-2.5 text-[11.5px] font-semibold bg-[#050A12] text-[#EAF3FF] border border-[#203653] hover:border-[#19C8F5]/60 rounded-lg focus:outline-none focus:border-[#19C8F5] cursor-pointer truncate"
              title="Load Reference Stage or Real OEM ECU PCB Photography"
            >
              <optgroup label="Reference Stage Presets">
                {sampleBoards.map((sb) => (
                  <option key={sb.id} value={sb.id}>
                    {sb.name}
                  </option>
                ))}
              </optgroup>
              {oemBoards.length > 0 && (
                <optgroup label={`OEM ECU PCB Photography (${oemBoards.length})`}>
                  {oemBoards.map((oem) => (
                    <option key={oem.id} value={oem.id}>
                      {oem.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <span className="hidden md:inline-flex items-center gap-1.5 font-mono text-[10.5px] text-[#91A4BD] whitespace-nowrap tabular-nums">
              <strong className="text-[#FFB020]">{partTotal}</strong> parts
              <span className="text-[#203653]">·</span>
              <strong className="text-[#20D889]">{netTotal}</strong> nets
            </span>
          </div>
        </div>

        {/* Center Telemetry Status Pods (Wide Desktop) */}
        <div className="hidden xl:flex items-center gap-1.5 text-[10.5px] font-mono tabular-nums shrink-0">
          <div className="inline-flex h-8 items-center gap-1.5 px-2.5 rounded-lg border border-[#203653] bg-[#050A12] text-[#EAF3FF] whitespace-nowrap">
            <LabDrawerIcon
              name={isBenchEnergized ? 'status-ok' : 'status-inactive'}
              size={24}
              className="w-3.5 h-3.5 shrink-0"
            />
            <span className={isBenchEnergized ? 'text-[#20D889] font-bold' : 'text-[#91A4BD]'}>
              {isBenchEnergized ? 'Live' : 'Standby'}
            </span>
            <span className="text-[#203653]">|</span>
            <Zap
              className={`w-3.5 h-3.5 ${
                isBenchEnergized ? 'text-[#20D889]' : 'text-[#91A4BD]/60'
              }`}
            />
            <span className="font-bold">
              {isBenchEnergized
                ? `${(powerSupply?.voltageSetting ?? 12.6).toFixed(1)}V`
                : '0.0V'}
            </span>
          </div>

          <button
            type="button"
            onClick={onSelectAuditTab}
            className={`inline-flex h-8 items-center gap-1.5 px-2.5 rounded-lg border transition whitespace-nowrap cursor-pointer ${
              criticalAuditCount > 0
                ? 'bg-rose-950/60 border-[#FF4D62]/70 text-rose-200'
                : auditCount > 0
                ? 'bg-amber-950/50 border-[#FFB020]/60 text-amber-200'
                : 'bg-[#050A12] border-[#203653] hover:border-[#20D889]/60 text-[#20D889]'
            }`}
            title="Automated MNA, Thermal & ERC Audit Findings"
          >
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span className="font-bold">
              {criticalAuditCount > 0
                ? `${criticalAuditCount} CRIT`
                : auditCount > 0
                ? `${auditCount} WARN`
                : 'ERC OK'}
            </span>
          </button>

          <button
            type="button"
            onClick={onSelectThermalTab}
            className={`inline-flex h-8 items-center gap-1.5 px-2.5 rounded-lg border transition whitespace-nowrap cursor-pointer ${
              peakBoardTempC >= 110
                ? 'bg-rose-950/60 border-[#FF4D62]/70 text-rose-200'
                : peakBoardTempC >= 80
                ? 'bg-amber-950/50 border-[#FFB020]/60 text-amber-200'
                : 'bg-[#050A12] border-[#203653] hover:border-[#19C8F5]/55 text-[#EAF3FF]'
            }`}
            title="Peak Component Junction Temperature (Click to open IR Thermal Telemetry)"
          >
            <Flame
              className={`w-3.5 h-3.5 ${
                peakBoardTempC >= 80 ? 'text-[#FF4D62]' : 'text-[#FFB020]'
              }`}
            />
            <span className="font-bold">{peakBoardTempC.toFixed(1)}°C</span>
          </button>
        </div>

        {/* Right Actions: Primary Upload CTA + Inline Desktop Tools / Compact Mobile Popover */}
        <div className="flex items-center gap-1.5 shrink-0 font-mono">
          {/* Desktop Inline Secondary Actions */}
          <div className="hidden lg:flex items-center gap-1.5">
            {uploadedImageUrl && (
              <button
                type="button"
                onClick={onRerunLocalCv}
                disabled={isAnalyzing}
                className="hw-btn-amber h-8 px-2.5 rounded-lg text-[10.5px] font-bold inline-flex items-center gap-1.5 transition disabled:opacity-40 whitespace-nowrap cursor-pointer"
                title="Run Local CV Burn/Oxidation & Pad Cluster Scan"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Local CV</span>
              </button>
            )}

            <button
              type="button"
              onClick={onSavePcbToCloud}
              disabled={isSavingScan || isAnalyzing}
              className="hw-btn h-8 px-2.5 rounded-lg text-[10.5px] font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-40 whitespace-nowrap cursor-pointer"
              title="Save Mapped PCB Components, Nets & Hotspots to Cloud Storage"
            >
              <CloudUpload className="w-3.5 h-3.5 text-[#FFB020]" />
              <span>{isSavingScan ? 'Saving…' : 'Save'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleSavedScansPanel}
              aria-expanded={showSavedScansPanel}
              className={`h-8 px-2.5 rounded-lg text-[10.5px] inline-flex items-center gap-1.5 transition whitespace-nowrap tabular-nums cursor-pointer ${
                showSavedScansPanel ? 'hw-btn-blue font-bold' : 'hw-btn font-semibold'
              }`}
              title="Load Saved Cloud PCB Scans"
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#19C8F5]" />
              <span>Saved ({savedScansCount})</span>
            </button>

            {onImportJsonFile && (
              <label
                className="hw-btn h-8 px-2.5 rounded-lg text-[10.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap"
                title="Import Bounded Schema v1 PCB JSON Project"
              >
                <FileJson className="w-3.5 h-3.5 text-[#FFB020]" />
                <span>Import</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={onImportJsonFile}
                  className="hidden"
                />
              </label>
            )}

            <button
              type="button"
              onClick={handleGuardedExport}
              disabled={isAnalyzing}
              className="hw-btn h-8 px-2.5 rounded-lg text-[10.5px] font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-40 whitespace-nowrap cursor-pointer"
              title={
                canUseExports
                  ? 'Export Schema v1 JSON Project & Thermal Backup'
                  : 'Exports locked — enter an active Trial PIN'
              }
            >
              {canUseExports ? (
                <Download className="w-3.5 h-3.5 text-[#91A4BD]" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-[#FF4D62]" />
              )}
              <span>{canUseExports ? 'Export' : 'Locked'}</span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={onToggleAddPartMenu}
                aria-expanded={showAddPartMenu}
                className={`h-8 px-2.5 rounded-lg text-[10.5px] inline-flex items-center gap-1 transition whitespace-nowrap cursor-pointer ${
                  showAddPartMenu ? 'hw-btn-amber font-bold' : 'hw-btn font-semibold'
                }`}
                title="Insert Test Point, Resistor, Capacitor, Diode, MOSFET, or LDO onto Board"
              >
                <Plus className="w-3.5 h-3.5 text-[#FFB020]" />
                <span>Add</span>
              </button>

              {showAddPartMenu && (
                <div className="absolute right-0 top-[36px] z-50 w-[230px] rounded-xl border border-[#203653] bg-[#0A1220]/98 p-1.5 shadow-[0_14px_34px_rgba(2,6,14,0.82)] flex flex-col gap-1">
                  {PART_TEMPLATES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onAddCustomComponent(item.id)}
                      className="hw-btn w-full text-left px-2.5 py-1.5 rounded-lg text-[#EAF3FF] hover:text-[#19C8F5] text-[10.5px] font-mono transition cursor-pointer"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Primary Upload PCB CTA (Always Visible) */}
          <label
            className={`diag-cta-blue h-8 px-2.5 sm:px-3 rounded-lg font-bold text-[11px] inline-flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
              isAnalyzing ? 'opacity-40 pointer-events-none' : ''
            }`}
            title="Upload ECU PCB Photo for Hybrid AI + Local CV Mapping"
          >
            <Upload className="w-3.5 h-3.5 text-white shrink-0" />
            <span className="sm:hidden">Upload</span>
            <span className="hidden sm:inline">Upload PCB</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              disabled={isAnalyzing}
              onChange={onUploadFile}
              className="hidden"
            />
          </label>

          {/* Mobile/Tablet Consolidated Actions Popover */}
          <div ref={mobileMenuRef} className="relative lg:hidden">
            <button
              type="button"
              onClick={() => setShowMobileActions((prev) => !prev)}
              aria-expanded={showMobileActions}
              aria-label="More PCB board actions"
              title="Board actions: Save, Saved Scans, Local CV, Import, Export & Add Part"
              className={`h-8 w-8 rounded-lg inline-flex items-center justify-center transition cursor-pointer ${
                showMobileActions ? 'diag-tab-active' : 'hw-btn text-[#19C8F5]'
              }`}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {showMobileActions && (
              <div className="absolute right-0 top-[38px] z-50 w-[240px] rounded-xl border border-[#203653] bg-[#0A1220]/98 p-2 shadow-[0_16px_40px_rgba(2,6,14,0.88)] flex flex-col gap-1.5">
                <div className="flex items-center justify-between border-b border-[#203653]/80 px-1.5 pb-1.5 text-[10px] font-mono text-[#91A4BD]">
                  <span>BOARD ACTIONS</span>
                  <span className="tabular-nums">
                    <strong className="text-[#FFB020]">{partTotal}</strong>p ·{' '}
                    <strong className="text-[#20D889]">{netTotal}</strong>n
                  </span>
                </div>

                {uploadedImageUrl && (
                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={() => {
                      setShowMobileActions(false);
                      onRerunLocalCv();
                    }}
                    className="hw-btn-amber w-full px-2.5 py-2 rounded-lg text-[11px] font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Run Local CV Scan</span>
                  </button>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={isSavingScan || isAnalyzing}
                    onClick={() => {
                      setShowMobileActions(false);
                      onSavePcbToCloud();
                    }}
                    className="hw-btn px-2 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                  >
                    <CloudUpload className="w-3.5 h-3.5 text-[#FFB020]" />
                    <span>{isSavingScan ? 'Saving…' : 'Save'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileActions(false);
                      onToggleSavedScansPanel();
                    }}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                      showSavedScansPanel ? 'hw-btn-blue' : 'hw-btn'
                    }`}
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[#19C8F5]" />
                    <span>Saved ({savedScansCount})</span>
                  </button>

                  {onImportJsonFile && (
                    <label className="hw-btn px-2 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
                      <FileJson className="w-3.5 h-3.5 text-[#FFB020]" />
                      <span>Import</span>
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={(e) => {
                          setShowMobileActions(false);
                          onImportJsonFile(e);
                        }}
                        className="hidden"
                      />
                    </label>
                  )}

                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={() => {
                      setShowMobileActions(false);
                      handleGuardedExport();
                    }}
                    className="hw-btn px-2 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                  >
                    {canUseExports ? (
                      <Download className="w-3.5 h-3.5 text-[#91A4BD]" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-[#FF4D62]" />
                    )}
                    <span>{canUseExports ? 'Export' : 'Locked'}</span>
                  </button>
                </div>

                <div className="border-t border-[#203653]/80 pt-1.5">
                  <div className="px-1.5 pb-1 text-[9.5px] font-mono uppercase tracking-wider text-[#91A4BD]">
                    Add Component
                  </div>
                  <div className="flex flex-col gap-1">
                    {PART_TEMPLATES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setShowMobileActions(false);
                          onAddCustomComponent(item.id);
                        }}
                        className="hw-btn w-full text-left px-2.5 py-1.5 rounded-lg text-[10.5px] font-mono text-[#EAF3FF] hover:text-[#19C8F5] flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3 h-3 text-[#FFB020] shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
