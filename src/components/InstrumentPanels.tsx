/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useMemo, useState } from 'react';
import { Bot, Cable, ClipboardCheck, Cpu, Database, Globe } from 'lucide-react';
import {
  BenchComponent,
  EcuPin,
  FaultType,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import { CircuitSolution } from '../utils/circuitSolver';
import { BenchPowerSupply } from './BenchPowerSupply';
import { LiveGaugeConsole } from './gauges/LiveGaugeConsole';
import { DigitalMultimeter } from './DigitalMultimeter';
import { FaultInjector } from './FaultInjector';
import { VoiceMacroMappingPanel } from './VoiceMacroMappingPanel';
import { RackFilter } from './LabTopNav';
import { RpmEmulatorState, UNIVERSAL_BRAND_KEY } from '../utils/vehicleEcuRegistry';
import type { PinoutSafetyEvaluation } from '../utils/automotiveSafetyGuard';
import { canEnergizeWithPreBenchGate } from '../utils/diagnosticWorkflow';
import {
  DEFAULT_GAUGE_MONITOR_STATE,
  GaugeMonitorState,
} from '../simulation/telemetry/telemetryTypes';
import { LabDrawerIcon } from './icons/LabDrawerIcons';
import { playCockpitTabDetent } from '../utils/audioFeedback';

interface InstrumentPanelsProps {
  visibleOnMobile: boolean;
  rackFilter: RackFilter;
  onChangeRackFilter: (filter: RackFilter) => void;
  powerSupply: PowerSupplyState;
  onChangePowerSupply: React.Dispatch<React.SetStateAction<PowerSupplyState>>;
  multimeter: MultimeterState;
  onChangeMultimeter: React.Dispatch<React.SetStateAction<MultimeterState>>;
  circuitSolution: CircuitSolution;
  pins: EcuPin[];
  components: BenchComponent[];
  wires?: WireConnection[];
  faults: InjectedFault[];
  selectedPinId: string | null;
  onSelectPin: (pinId: string | null) => void;
  onAddFault: (pinId: string, faultType: FaultType, description: string) => void;
  onRemoveFault: (pinId: string) => void;
  onClearAllFaults: () => void;
  onSearchDtc: (code: string, desc: string) => void;
  selectedBrandKey?: string;
  selectedModelName?: string;
  selectedEcuProfileId?: string | null;
  onSelectVehicleEcu?: (brandKey: string, modelName: string, ecuProfileId: string | null) => void;
  onOpenEcuPinouts?: () => void;
  rpmEmulator?: RpmEmulatorState;
  onChangeRpmEmulator?: React.Dispatch<React.SetStateAction<RpmEmulatorState>>;
  gaugeMonitor?: GaugeMonitorState;
  onChangeGaugeMonitor?: React.Dispatch<React.SetStateAction<GaugeMonitorState>>;
  onUpdateComponentState?: (compId: string, updates: Record<string, number | boolean | string>) => void;
  manualRangeLabel?: string | null;
  onClearManualRange?: () => void;
  onSetManualRangeLabel?: (label: string | null) => void;
  onAttachProbe?: (color: 'red' | 'black', pinId: string, label: string) => void;
  onAddWire?: (sourcePinId: string, targetPinId: string, color?: string, label?: string) => void;
  onRunVoiceCommand?: (transcript: string) => void;
  compactWidth?: boolean;
  isShortViewport?: boolean;
  moveControls?: React.ReactNode;
  preBenchGateLocked?: boolean;
  preBenchGateBypassed?: boolean;
  workflowCheckedIds?: string[];
  onBypassPreBenchGate?: () => void;
  onOpenWorkflowPanel?: () => void;
  pinoutSafetyEvaluation?: PinoutSafetyEvaluation;
  selectedVehicleStatus?: string;
  onConfirmOcrVehicleBench?: () => void;
  onOpenVoiceMacroLibrary?: () => void;
  onOpenOfflineBot?: (prompt?: string) => void;
  onOpenGroundedSearch?: (query?: string, dtc?: string, ecu?: string) => void;
  onOpenLookupDrawer?: () => void;
  onOpenWiringTab?: () => void;
  onOpenFaultBuilder?: () => void;
}

const FALLBACK_RPM_EMULATOR: RpmEmulatorState = {
  isActive: false,
  rpm: 850,
  soundEnabled: true,
};

const EMPTY_WIRES: WireConnection[] = [];

export const InstrumentPanels: React.FC<InstrumentPanelsProps> = ({
  visibleOnMobile,
  rackFilter,
  onChangeRackFilter,
  powerSupply,
  onChangePowerSupply,
  multimeter,
  onChangeMultimeter,
  circuitSolution,
  pins,
  components,
  wires = EMPTY_WIRES,
  faults,
  selectedPinId,
  onSelectPin,
  onAddFault,
  onRemoveFault,
  onClearAllFaults,
  onSearchDtc,
  selectedBrandKey = UNIVERSAL_BRAND_KEY,
  selectedModelName = 'Generic 16-Pin Bench',
  selectedEcuProfileId = null,
  onSelectVehicleEcu,
  onOpenEcuPinouts,
  rpmEmulator = FALLBACK_RPM_EMULATOR,
  onChangeRpmEmulator,
  gaugeMonitor: controlledGaugeMonitor,
  onChangeGaugeMonitor: controlledSetGaugeMonitor,
  onUpdateComponentState,
  manualRangeLabel,
  onClearManualRange,
  onSetManualRangeLabel,
  onAttachProbe,
  onAddWire,
  onRunVoiceCommand,
  compactWidth = false,
  isShortViewport = false,
  moveControls,
  preBenchGateLocked = false,
  preBenchGateBypassed = false,
  workflowCheckedIds = [],
  onBypassPreBenchGate,
  onOpenWorkflowPanel,
  pinoutSafetyEvaluation,
  selectedVehicleStatus,
  onConfirmOcrVehicleBench,
  onOpenVoiceMacroLibrary,
  onOpenOfflineBot,
  onOpenGroundedSearch,
  onOpenLookupDrawer,
  onOpenWiringTab,
  onOpenFaultBuilder,
}) => {
  const [fallbackGaugeMonitor, setFallbackGaugeMonitor] = useState<GaugeMonitorState>(
    DEFAULT_GAUGE_MONITOR_STATE
  );
  const effectiveGaugeMonitor = controlledGaugeMonitor ?? fallbackGaugeMonitor;
  const effectiveSetGaugeMonitor = controlledSetGaugeMonitor ?? setFallbackGaugeMonitor;

  const { isSafetyLocked, safetyLockReason } = useMemo(() => {
    const canEnergizeVirtual =
      pinoutSafetyEvaluation
        ? pinoutSafetyEvaluation.canEnergizeSimulatedBench ??
          pinoutSafetyEvaluation.canEnergizePhysicalBench
        : true;
    if (pinoutSafetyEvaluation && !canEnergizeVirtual) {
      return {
        isSafetyLocked: true,
        safetyLockReason:
          pinoutSafetyEvaluation.warnings[0] ||
          'Confirm OEM connector orientation before energizing.',
      };
    }
    const gate = canEnergizeWithPreBenchGate({
      preBenchGateLocked,
      preBenchGateBypassed,
      checkedWorkflowIds: workflowCheckedIds,
    });
    if (!gate.allowed) {
      return {
        isSafetyLocked: true,
        safetyLockReason:
          gate.pendingTitles.length > 0
            ? `Pre-Bench Gate: complete ${gate.pendingTitles.join(', ')}`
            : `Pre-Bench Safety Gate active (${gate.mandatoryChecked}/${gate.mandatoryTotal}).`,
      };
    }
    return { isSafetyLocked: false, safetyLockReason: undefined };
  }, [pinoutSafetyEvaluation, preBenchGateLocked, preBenchGateBypassed, workflowCheckedIds]);

  return (
    <section
      aria-label="Bench Instrument Panels"
      className={`w-full ${
        compactWidth
          ? 'xl:w-[340px] 2xl:w-[364px]'
          : 'xl:w-[362px] 2xl:w-[386px]'
      } flex-col ${
        isShortViewport ? 'gap-1.5' : 'gap-2'
      } shrink-0 overflow-hidden flex-1 xl:flex-initial min-h-0 transition-[width] duration-150 animate-cockpit-module ${
        visibleOnMobile ? 'flex' : 'hidden xl:flex'
      }`}
    >
      {moveControls}
      {/* Hardware Segmented Rack Filter Strip — aligned 42px desktop rail */}
      <div
        role="tablist"
        aria-label="Instrument Rack Filter"
        className="grid grid-cols-3 items-stretch gap-1 hud-panel h-[42px] p-1 rounded-xl text-[10px] xl:text-[10.5px] font-mono shrink-0"
      >
        <button
          type="button"
          role="tab"
          aria-selected={rackFilter === 'ALL'}
          onClick={() => {
            if (rackFilter !== 'ALL') playCockpitTabDetent();
            onChangeRackFilter('ALL');
          }}
          className={`h-full px-1.5 xl:px-2 rounded-lg inline-flex items-center justify-center gap-1 text-center uppercase tracking-wider transition whitespace-nowrap cursor-pointer ${
            rackFilter === 'ALL'
              ? 'hw-btn-blue font-bold text-white'
              : 'border border-transparent text-[#91a4bd] hover:text-[#eaf3ff]'
          }`}
        >
          <LabDrawerIcon name="cabinet" size={24} className="w-3.5 h-3.5 shrink-0" />
          <span className="2xl:hidden">All</span>
          <span className="hidden 2xl:inline">All Rack</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={rackFilter === 'DMM_POWER'}
          onClick={() => {
            if (rackFilter !== 'DMM_POWER') playCockpitTabDetent();
            onChangeRackFilter('DMM_POWER');
          }}
          className={`h-full px-1.5 xl:px-2 rounded-lg inline-flex items-center justify-center gap-1 text-center uppercase tracking-wider transition whitespace-nowrap cursor-pointer ${
            rackFilter === 'DMM_POWER'
              ? 'hw-btn-blue font-bold text-white'
              : 'border border-transparent text-[#91a4bd] hover:text-[#eaf3ff]'
          }`}
        >
          <LabDrawerIcon name="modular" size={24} className="w-3.5 h-3.5 shrink-0" />
          <span className="2xl:hidden">Power</span>
          <span className="hidden 2xl:inline">DMM &amp; Power</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={rackFilter === 'FAULT_MATRIX'}
          onClick={() => {
            if (rackFilter !== 'FAULT_MATRIX') playCockpitTabDetent();
            onChangeRackFilter('FAULT_MATRIX');
          }}
          className={`h-full px-1.5 xl:px-2 rounded-lg inline-flex items-center justify-center gap-1 text-center uppercase tracking-wider transition whitespace-nowrap cursor-pointer ${
            rackFilter === 'FAULT_MATRIX'
              ? 'hw-btn-blue font-bold text-white'
              : 'border border-transparent text-[#91a4bd] hover:text-[#eaf3ff]'
          }`}
        >
          <LabDrawerIcon name="trouble-drawer" size={24} className="w-3.5 h-3.5 shrink-0" />
          <span className="2xl:hidden">Faults</span>
          <span className="hidden 2xl:inline">Fault Matrix</span>
        </button>
      </div>

      {/* Scrollable Instrument Rack — 1-Col Mobile · 2-Col Diagnostic Tablet · 1-Col Desktop Rail */}
      <div className="flex-1 overflow-y-auto pr-0.5 min-h-0">
        <div
          className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 items-start ${
            isShortViewport ? 'gap-2' : 'gap-2.5'
          }`}
        >
        {(rackFilter === 'ALL' || rackFilter === 'DMM_POWER') && (
          <>
            {onSelectVehicleEcu && onChangeRpmEmulator && (
              <LiveGaugeConsole
                selectedBrandKey={selectedBrandKey}
                selectedModelName={selectedModelName}
                selectedEcuProfileId={selectedEcuProfileId}
                onSelectVehicleEcu={onSelectVehicleEcu}
                onOpenEcuPinouts={onOpenEcuPinouts}
                rpmEmulator={rpmEmulator}
                onChangeRpmEmulator={onChangeRpmEmulator}
                gaugeMonitor={effectiveGaugeMonitor}
                onChangeGaugeMonitor={effectiveSetGaugeMonitor}
                powerSupply={powerSupply}
                circuitSolution={circuitSolution}
                components={components}
                faults={faults}
                wires={wires}
                onUpdateComponentState={onUpdateComponentState}
                isSafetyLocked={isSafetyLocked}
                safetyLockReason={safetyLockReason}
              />
            )}

            <BenchPowerSupply
              powerSupply={powerSupply}
              onChange={onChangePowerSupply}
              actualCurrentAmps={circuitSolution.supplyCurrentDrawAmps}
              isTripped={circuitSolution.isSupplyCurrentTripped}
              actualOutputVoltage={circuitSolution.nodeVoltages['bench-vbat']}
              preBenchGateLocked={preBenchGateLocked}
              preBenchGateBypassed={preBenchGateBypassed}
              workflowCheckedIds={workflowCheckedIds}
              onBypassPreBenchGate={onBypassPreBenchGate}
              onOpenWorkflowPanel={onOpenWorkflowPanel}
              pinoutSafetyEvaluation={pinoutSafetyEvaluation}
              selectedVehicleStatus={selectedVehicleStatus}
              onConfirmOcrVehicleBench={onConfirmOcrVehicleBench}
            />

            <DigitalMultimeter
              multimeter={multimeter}
              onChange={onChangeMultimeter}
              manualRangeLabel={manualRangeLabel}
              onClearManualRange={onClearManualRange}
              reading={circuitSolution.multimeterReading}
              pins={pins}
              components={components}
              selectedPinId={selectedPinId}
            />

            <VoiceMacroMappingPanel
              pins={pins}
              components={components}
              powerSupply={powerSupply}
              onChangePowerSupply={onChangePowerSupply}
              multimeter={multimeter}
              onChangeMultimeter={onChangeMultimeter}
              manualRangeLabel={manualRangeLabel}
              onSetManualRangeLabel={onSetManualRangeLabel}
              onAttachProbe={onAttachProbe}
              onAddWire={onAddWire}
              faults={faults}
              onAddFault={onAddFault}
              onRemoveFault={onRemoveFault}
              onClearAllFaults={onClearAllFaults}
              rpmEmulator={rpmEmulator}
              onChangeRpmEmulator={onChangeRpmEmulator}
              onOpenMacroLibrary={onOpenVoiceMacroLibrary}
              onRunVoiceTranscript={onRunVoiceCommand}
              variant="rack"
            />
          </>
        )}

        {(rackFilter === 'ALL' || rackFilter === 'FAULT_MATRIX') && (
          <FaultInjector
            pins={pins}
            faults={faults}
            activeDTCs={circuitSolution.activeDTCs}
            onAddFault={onAddFault}
            onRemoveFault={onRemoveFault}
            onClearAll={onClearAllFaults}
            selectedPinId={selectedPinId}
            onSelectPin={onSelectPin}
            onSearchDtc={onSearchDtc}
            selectedBrandKey={selectedBrandKey}
            nodeVoltages={circuitSolution.nodeVoltages}
            onOpenFaultBuilder={onOpenFaultBuilder}
          />
        )}

        {(onOpenOfflineBot || onOpenLookupDrawer || onOpenGroundedSearch || onOpenWorkflowPanel || onOpenEcuPinouts) && (
          <section
            aria-label="AI Technician Assistant shortcuts"
            className="hud-panel md:col-span-2 xl:col-span-1 rounded-xl p-3 flex flex-col gap-2 shrink-0"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[#203653] pb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Bot className="h-4 w-4 text-[#19c8f5] shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <h3 className="font-hud text-[11.5px] font-bold uppercase tracking-wider text-[#eaf3ff] truncate">
                    AI Technician Assistant
                  </h3>
                  <p className="font-mono text-[9.5px] text-[#91a4bd] truncate">
                    Quick bench tools · {circuitSolution.activeDTCs.length > 0 ? `${circuitSolution.activeDTCs.length} active DTC` : 'Ready'}
                  </p>
                </div>
              </div>
              {onOpenOfflineBot && (
                <button
                  type="button"
                  onClick={() => onOpenOfflineBot()}
                  className="hw-btn hw-btn-blue min-h-[34px] rounded-lg px-2.5 py-1 font-mono text-[10px] font-bold shrink-0 cursor-pointer"
                >
                  Open Bot
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
              {onOpenLookupDrawer && (
                <button
                  type="button"
                  onClick={onOpenLookupDrawer}
                  className="hw-btn min-h-[38px] rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 text-left text-[#eaf3ff] cursor-pointer"
                >
                  <Database className="h-3.5 w-3.5 text-[#19c8f5] shrink-0" aria-hidden="true" />
                  <span className="truncate">Fault Lookup</span>
                </button>
              )}
              {onOpenWorkflowPanel && (
                <button
                  type="button"
                  onClick={onOpenWorkflowPanel}
                  className="hw-btn min-h-[38px] rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 text-left text-[#eaf3ff] cursor-pointer"
                >
                  <ClipboardCheck className="h-3.5 w-3.5 text-[#20d889] shrink-0" aria-hidden="true" />
                  <span className="truncate">Test Workflow</span>
                </button>
              )}
              {onOpenWiringTab && (
                <button
                  type="button"
                  onClick={onOpenWiringTab}
                  className="hw-btn min-h-[38px] rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 text-left text-[#eaf3ff] cursor-pointer"
                >
                  <Cable className="h-3.5 w-3.5 text-[#19c8f5] shrink-0" aria-hidden="true" />
                  <span className="truncate">Wiring View</span>
                </button>
              )}
              {onOpenEcuPinouts && (
                <button
                  type="button"
                  onClick={onOpenEcuPinouts}
                  className="hw-btn min-h-[38px] rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 text-left text-[#eaf3ff] cursor-pointer"
                >
                  <Cpu className="h-3.5 w-3.5 text-[#ffb020] shrink-0" aria-hidden="true" />
                  <span className="truncate">ECU Pinouts</span>
                </button>
              )}
              {onOpenGroundedSearch && (
                <button
                  type="button"
                  onClick={() => onOpenGroundedSearch()}
                  className="hw-btn col-span-2 min-h-[38px] rounded-lg px-2.5 py-1.5 flex items-center justify-center gap-1.5 text-[#eaf3ff] cursor-pointer"
                >
                  <Globe className="h-3.5 w-3.5 text-[#20d889] shrink-0" aria-hidden="true" />
                  <span className="truncate">Search OEM Service Data &amp; TSBs</span>
                </button>
              )}
            </div>
          </section>
        )}
        </div>
      </div>
    </section>
  );
};
