import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BenchComponent,
  EcuPin,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import { CircuitSolution } from '../utils/circuitSolver';
import {
  DiagnosticPanelMode,
  evaluateWorkflowSteps,
  getWorkflowProgress,
  loadCheckedWorkflowIds,
  saveCheckedWorkflowIds,
} from '../utils/diagnosticWorkflow';
import {
  applyWatchPresetToRules,
  buildDefaultLogicCheckRules,
  evaluateLogicCheck,
  type LogicCheckRule,
  type LogicCheckSnapshot,
  type LogicWatchPreset,
} from '../simulation/ecu/LogicCheckEngine';
import { DiagnosticGuidePanel } from './DiagnosticGuidePanel';
import { DiagnosticWorkflowPanel } from './DiagnosticWorkflowPanel';
import { LogicCheckPanel, type LogicCheckIncidentEntry } from './LogicCheckPanel';
import { LabTab } from './LabTopNav';
import { LabDrawerIcon } from './icons/LabDrawerIcons';

interface ECUDiagnosticViewProps {
  visibleOnMobile: boolean;
  isOpen: boolean;
  onClose: () => void;
  powerSupply: PowerSupplyState;
  pins: EcuPin[];
  wires: WireConnection[];
  faults: InjectedFault[];
  components?: BenchComponent[];
  circuitSolution: CircuitSolution;
  multimeter: MultimeterState;
  selectedPinId: string | null;
  onSelectPin: (pinId: string | null) => void;
  onNavigateTab: (tab: LabTab) => void;
  onOpenOfflineBot: (prompt?: string) => void;
  compactWidth?: boolean;
  isShortViewport?: boolean;
  moveControls?: React.ReactNode;
  ecuProfileLabel?: string;
  diagnosticPanelMode?: DiagnosticPanelMode;
  onChangeDiagnosticPanelMode?: (mode: DiagnosticPanelMode) => void;
  checkedWorkflowIds?: string[];
  onChangeCheckedWorkflowIds?: React.Dispatch<React.SetStateAction<string[]>>;
  preBenchGateLocked?: boolean;
  preBenchGateBypassed?: boolean;
  onTogglePreBenchGate?: () => void;
  autoVerifyWorkflow?: boolean;
  onToggleAutoVerifyWorkflow?: () => void;
  logicCheckSnapshot?: LogicCheckSnapshot;
  logicCheckRules?: LogicCheckRule[];
  isLogicCheckArmed?: boolean;
  logicCheckIncidents?: LogicCheckIncidentEntry[];
  onToggleLogicCheckArmed?: () => void;
  onToggleLogicRuleEnabled?: (pinId: string) => void;
  onUpdateLogicRuleThresholds?: (
    pinId: string,
    updates: Partial<
      Pick<
        LogicCheckRule,
        'expectedState' | 'minVoltage' | 'maxVoltage' | 'shortToBatteryThresholdV'
      >
    >
  ) => void;
  onApplyLogicPreset?: (preset: LogicWatchPreset) => void;
  onResetLogicRules?: () => void;
  onClearLogicIncidents?: () => void;
  onAttachRedProbe?: (pinId: string, label: string) => void;
}

export const ECUDiagnosticView: React.FC<ECUDiagnosticViewProps> = ({
  visibleOnMobile,
  isOpen,
  onClose,
  powerSupply,
  pins,
  wires,
  faults,
  components,
  circuitSolution,
  multimeter,
  selectedPinId,
  onSelectPin,
  onNavigateTab,
  onOpenOfflineBot,
  compactWidth = false,
  isShortViewport = false,
  moveControls,
  ecuProfileLabel,
  diagnosticPanelMode: controlledMode,
  onChangeDiagnosticPanelMode,
  checkedWorkflowIds: controlledCheckedIds,
  onChangeCheckedWorkflowIds,
  preBenchGateLocked = false,
  preBenchGateBypassed = false,
  onTogglePreBenchGate,
  autoVerifyWorkflow = false,
  onToggleAutoVerifyWorkflow,
  logicCheckSnapshot: controlledSnapshot,
  logicCheckRules: controlledRules,
  isLogicCheckArmed: controlledArmed,
  logicCheckIncidents = [],
  onToggleLogicCheckArmed,
  onToggleLogicRuleEnabled,
  onUpdateLogicRuleThresholds,
  onApplyLogicPreset,
  onResetLogicRules,
  onClearLogicIncidents,
  onAttachRedProbe,
}) => {
  const [internalMode, setInternalMode] = useState<DiagnosticPanelMode>('WORKFLOW');
  const [internalCheckedIds, setInternalCheckedIds] = useState<string[]>(() =>
    loadCheckedWorkflowIds()
  );
  const [internalLogicRules, setInternalLogicRules] = useState<LogicCheckRule[]>(() =>
    buildDefaultLogicCheckRules(pins)
  );
  const [internalLogicArmed, setInternalLogicArmed] = useState(true);

  const activeMode = controlledMode ?? internalMode;
  const checkedIds = controlledCheckedIds ?? internalCheckedIds;

  useEffect(() => {
    if (controlledCheckedIds === undefined) {
      saveCheckedWorkflowIds(internalCheckedIds);
    }
  }, [controlledCheckedIds, internalCheckedIds]);

  const handleModeChange = useCallback(
    (mode: DiagnosticPanelMode) => {
      if (onChangeDiagnosticPanelMode) {
        onChangeDiagnosticPanelMode(mode);
      } else {
        setInternalMode(mode);
      }
    },
    [onChangeDiagnosticPanelMode]
  );

  const updateCheckedIds = useCallback(
    (updater: React.SetStateAction<string[]>) => {
      if (onChangeCheckedWorkflowIds) {
        onChangeCheckedWorkflowIds(updater);
      } else {
        setInternalCheckedIds(updater);
      }
    },
    [onChangeCheckedWorkflowIds]
  );

  const checkedIdSet = useMemo(() => new Set(checkedIds), [checkedIds]);

  const evaluatedSteps = useMemo(
    () =>
      evaluateWorkflowSteps(
        {
          powerSupply,
          pins,
          wires,
          faults,
          activeDTCs: circuitSolution.activeDTCs,
          nodeVoltages: circuitSolution.nodeVoltages,
          supplyCurrentDrawAmps: circuitSolution.supplyCurrentDrawAmps,
          isSupplyCurrentTripped: circuitSolution.isSupplyCurrentTripped,
          multimeter,
          multimeterReading: circuitSolution.multimeterReading,
          ecuProfileLabel,
        },
        checkedIdSet
      ),
    [
      powerSupply,
      pins,
      wires,
      faults,
      circuitSolution.activeDTCs,
      circuitSolution.nodeVoltages,
      circuitSolution.supplyCurrentDrawAmps,
      circuitSolution.isSupplyCurrentTripped,
      multimeter,
      circuitSolution.multimeterReading,
      ecuProfileLabel,
      checkedIdSet,
    ]
  );

  const workflowProgress = useMemo(
    () => getWorkflowProgress(evaluatedSteps),
    [evaluatedSteps]
  );

  const activeLogicRules = controlledRules ?? internalLogicRules;
  const activeLogicArmed = controlledArmed ?? internalLogicArmed;

  const activeLogicSnapshot = useMemo(
    () =>
      controlledSnapshot ??
      evaluateLogicCheck({
        rules: activeLogicRules,
        pins,
        nodeVoltages: circuitSolution.nodeVoltages,
        powerSupply,
        wires,
        faults,
        components,
        isArmed: activeLogicArmed,
      }),
    [
      controlledSnapshot,
      activeLogicRules,
      pins,
      circuitSolution.nodeVoltages,
      powerSupply,
      wires,
      faults,
      components,
      activeLogicArmed,
    ]
  );

  const handleToggleArmedFallback = useCallback(() => {
    if (onToggleLogicCheckArmed) onToggleLogicCheckArmed();
    else setInternalLogicArmed((prev) => !prev);
  }, [onToggleLogicCheckArmed]);

  const handleToggleRuleEnabledFallback = useCallback(
    (pinId: string) => {
      if (onToggleLogicRuleEnabled) {
        onToggleLogicRuleEnabled(pinId);
      } else {
        setInternalLogicRules((prev) =>
          prev.map((r) => (r.pinId === pinId ? { ...r, enabled: !r.enabled } : r))
        );
      }
    },
    [onToggleLogicRuleEnabled]
  );

  const handleUpdateThresholdsFallback = useCallback(
    (
      pinId: string,
      updates: Partial<
        Pick<
          LogicCheckRule,
          'expectedState' | 'minVoltage' | 'maxVoltage' | 'shortToBatteryThresholdV'
        >
      >
    ) => {
      if (onUpdateLogicRuleThresholds) {
        onUpdateLogicRuleThresholds(pinId, updates);
      } else {
        setInternalLogicRules((prev) =>
          prev.map((r) => (r.pinId === pinId ? { ...r, ...updates, isCustom: true } : r))
        );
      }
    },
    [onUpdateLogicRuleThresholds]
  );

  const handleApplyPresetFallback = useCallback(
    (preset: LogicWatchPreset) => {
      if (onApplyLogicPreset) {
        onApplyLogicPreset(preset);
      } else {
        setInternalLogicRules((prev) => applyWatchPresetToRules(prev, preset));
      }
    },
    [onApplyLogicPreset]
  );

  const handleResetLogicRulesFallback = useCallback(() => {
    if (onResetLogicRules) {
      onResetLogicRules();
    } else {
      setInternalLogicRules(buildDefaultLogicCheckRules(pins));
    }
  }, [onResetLogicRules, pins]);

  const handleToggleStep = useCallback(
    (stepId: string) => {
      updateCheckedIds((prev) =>
        prev.includes(stepId) ? prev.filter((id) => id !== stepId) : [...prev, stepId]
      );
    },
    [updateCheckedIds]
  );

  const handleAutoVerifyPassing = useCallback(() => {
    const passingIds = evaluatedSteps
      .filter((step) => step.telemetryStatus === 'PASS')
      .map((step) => step.id);
    updateCheckedIds((prev) => Array.from(new Set([...prev, ...passingIds])));
  }, [evaluatedSteps, updateCheckedIds]);

  const handleResetWorkflow = useCallback(() => {
    updateCheckedIds([]);
  }, [updateCheckedIds]);

  useEffect(() => {
    if (!autoVerifyWorkflow) return;
    const newlyPassingIds = evaluatedSteps
      .filter((step) => step.telemetryStatus === 'PASS' && !step.isChecked)
      .map((step) => step.id);
    if (newlyPassingIds.length === 0) return;
    updateCheckedIds((prev) => Array.from(new Set([...prev, ...newlyPassingIds])));
  }, [autoVerifyWorkflow, evaluatedSteps, updateCheckedIds]);

  if (!isOpen) {
    return null;
  }

  const widthClass = compactWidth
    ? 'w-full lg:w-[274px] xl:w-[294px]'
    : 'w-full lg:w-[304px] xl:w-[322px] 2xl:w-[340px]';

  const logicAlertCount =
    activeLogicSnapshot.criticalCount + activeLogicSnapshot.warningCount;

  return (
    <section
      aria-label="ECU Diagnostic View"
      className={`${widthClass} flex-1 lg:flex-initial lg:shrink-0 min-h-0 flex-col ${
        isShortViewport ? 'gap-1.5' : 'gap-2'
      } overflow-hidden transition-[width] duration-150 ${
        visibleOnMobile ? 'flex' : 'hidden lg:flex'
      }`}
    >
      {moveControls}

      <div
        role="tablist"
        aria-label="Diagnostic panel view"
        className="w-full hud-panel rounded-xl h-[44px] p-1 grid grid-cols-3 items-stretch gap-1 shrink-0"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'WORKFLOW'}
          data-testid="diagnostic-tab-workflow"
          onClick={() => handleModeChange('WORKFLOW')}
          className={`h-full flex items-center justify-center gap-1 rounded-lg px-1.5 text-[10px] xl:text-[10.5px] font-mono transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19c8f5] cursor-pointer ${
            activeMode === 'WORKFLOW'
              ? 'hw-btn-blue font-bold text-white'
              : 'border border-transparent text-[#91a4bd] hover:text-[#eaf3ff]'
          }`}
        >
          <LabDrawerIcon name="tray-stack" size={24} className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Workflow</span>
          <span className="tabular-nums text-[9.5px] opacity-90 shrink-0">
            {workflowProgress.mandatoryChecked}/{workflowProgress.mandatoryTotal}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'LOGIC_CHECK'}
          data-testid="diagnostic-tab-logic-check"
          onClick={() => handleModeChange('LOGIC_CHECK')}
          className={`h-full flex items-center justify-center gap-1 rounded-lg px-1.5 text-[10px] xl:text-[10.5px] font-mono transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19c8f5] cursor-pointer ${
            activeMode === 'LOGIC_CHECK'
              ? activeLogicSnapshot.overallStatus === 'CRITICAL'
                ? 'bg-rose-950/90 border border-[#ff4d62] text-rose-200 font-bold'
                : 'hw-btn-blue font-bold text-white'
              : activeLogicSnapshot.overallStatus === 'CRITICAL'
              ? 'border border-[#ff4d62]/55 bg-rose-950/35 text-rose-300 hover:text-rose-100'
              : 'border border-transparent text-[#91a4bd] hover:text-[#eaf3ff]'
          }`}
        >
          {activeLogicSnapshot.overallStatus === 'CRITICAL' ? (
            <LabDrawerIcon name="status-fault" size={24} className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <LabDrawerIcon name="active-drawer" size={24} className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>Logic</span>
          {logicAlertCount > 0 && (
            <span className="tabular-nums text-[9.5px] font-bold">
              ({logicAlertCount})
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'MNA_GUIDE'}
          data-testid="diagnostic-tab-mna-guide"
          onClick={() => handleModeChange('MNA_GUIDE')}
          className={`h-full flex items-center justify-center gap-1 rounded-lg px-1.5 text-[10px] xl:text-[10.5px] font-mono transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19c8f5] cursor-pointer ${
            activeMode === 'MNA_GUIDE'
              ? 'hw-btn-blue font-bold text-white'
              : 'border border-transparent text-[#91a4bd] hover:text-[#eaf3ff]'
          }`}
        >
          <LabDrawerIcon name="slide-out" size={24} className="w-3.5 h-3.5 shrink-0" />
          <span>5-Step</span>
        </button>
      </div>

      {activeMode === 'WORKFLOW' ? (
        <DiagnosticWorkflowPanel
          steps={evaluatedSteps}
          progress={workflowProgress}
          onToggleStep={handleToggleStep}
          onAutoVerifyPassing={handleAutoVerifyPassing}
          onResetWorkflow={handleResetWorkflow}
          onSelectPin={(pinId) => onSelectPin(pinId)}
          onNavigateTab={onNavigateTab}
          onClose={onClose}
          compactWidth={compactWidth}
          isShortViewport={isShortViewport}
          preBenchGateLocked={preBenchGateLocked}
          preBenchGateBypassed={preBenchGateBypassed}
          onTogglePreBenchGate={onTogglePreBenchGate}
          autoVerifyWorkflow={autoVerifyWorkflow}
          onToggleAutoVerifyWorkflow={onToggleAutoVerifyWorkflow}
        />
      ) : activeMode === 'LOGIC_CHECK' ? (
        <LogicCheckPanel
          snapshot={activeLogicSnapshot}
          rules={activeLogicRules}
          isArmed={activeLogicArmed}
          onToggleArmed={handleToggleArmedFallback}
          onToggleRuleEnabled={handleToggleRuleEnabledFallback}
          onUpdateRuleThresholds={handleUpdateThresholdsFallback}
          onApplyPreset={handleApplyPresetFallback}
          onResetRules={handleResetLogicRulesFallback}
          onSelectPin={(pinId) => onSelectPin(pinId)}
          onAttachRedProbe={onAttachRedProbe}
          incidentLog={logicCheckIncidents}
          onClearIncidentLog={onClearLogicIncidents ?? (() => {})}
          onClose={onClose}
          compactWidth={compactWidth}
          isShortViewport={isShortViewport}
        />
      ) : (
        <DiagnosticGuidePanel
          isOpen={isOpen}
          onClose={onClose}
          powerSupply={powerSupply}
          pins={pins}
          wires={wires}
          faults={faults}
          activeDTCs={circuitSolution.activeDTCs}
          nodeVoltages={circuitSolution.nodeVoltages}
          supplyCurrentDrawAmps={circuitSolution.supplyCurrentDrawAmps}
          isSupplyCurrentTripped={circuitSolution.isSupplyCurrentTripped}
          multimeter={multimeter}
          multimeterReading={circuitSolution.multimeterReading}
          selectedPinId={selectedPinId}
          onSelectPin={onSelectPin}
          onNavigateTab={onNavigateTab}
          onOpenOfflineBot={onOpenOfflineBot}
          compactWidth={compactWidth}
          isShortViewport={isShortViewport}
        />
      )}
    </section>
  );
};

