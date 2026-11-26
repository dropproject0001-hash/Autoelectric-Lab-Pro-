/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { lazyWithRetry } from "../utils/lazyWithRetry";
import {
  Activity,
  AlertTriangle,
  Box,
  Columns2,
  Layers,
  Network,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
} from "lucide-react";
import type {
  BenchComponent,
  EcuPin,
  FaultType,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from "../types/ecu";
import type { CircuitSolution } from "../utils/circuitSolver";
import type {
  CloudSyncStatusSnapshot,
  SavedBenchSession,
  SavedDiagnosticLog,
} from "../services/benchStorageService";
import { playModuleActivationSound } from "../utils/audioFeedback";
import { ECUDiagnosticView } from "./ECUDiagnosticView";
import {
  FloatingLabNavigator,
} from "./FloatingLabNavigator";
import type { FloatingOpacityLevel } from "./FloatingLabNavigator";
import { InstrumentPanels } from "./InstrumentPanels";
import type { LabTab, MobileBenchPane, RackFilter } from "./LabTopNav";
import {
  VoiceCommandLogSidebar,
  type VoiceSidebarSection,
} from "./VoiceCommandLogSidebar";
import {
  offlineVoiceAssistant,
  VoiceAssistantState,
  VoiceCommandLogEntry,
  VoiceCommandLogSource,
  VoiceResultMetadata,
} from "../services/offlineVoiceService";
import { WiringCanvas } from "./WiringCanvas";
import {
  UNIVERSAL_BRAND_KEY,
  getSelectedVehicleContext,
} from "../utils/vehicleEcuRegistry";
import type { RpmEmulatorState } from "../utils/vehicleEcuRegistry";
import type { DiagnosticPanelMode } from "../utils/diagnosticWorkflow";
import type {
  LogicCheckRule,
  LogicCheckSnapshot,
  LogicWatchPreset,
} from "../simulation/ecu/LogicCheckEngine";
import type { LogicCheckIncidentEntry } from "./LogicCheckPanel";
import type { PinoutSafetyEvaluation } from "../utils/automotiveSafetyGuard";
import type { GaugeMonitorState } from "../simulation/telemetry/telemetryTypes";
import type { BenchVoiceSimulationAction } from "../simulation/telemetry/efiHarnessStandard";
import {
  PH_BENCH_TROUBLE_SCENARIOS,
  evaluateBenchPulseAndSignalStatus,
  type BenchTroubleScenario,
} from "../simulation/faults/benchTroubleScenarios";
import {
  getIndexedScenarioByPhId,
  loadRecentLookupIds,
  searchTroubleScenariosRanked,
} from "../utils/troubleScenarioLookup";
import { splitDiagnosticSteps } from "../data/phTroubleScenarios520";
import { evaluateScenarioVoiceCoach } from "../utils/troubleScenarioVoiceCoach";
import { LabDrawerIcon } from "./icons/LabDrawerIcons";
import { formatPinScopeSummary } from "../utils/benchStateReconciliation";

const Oscilloscope = lazyWithRetry(() =>
  import("./Oscilloscope").then((m) => ({ default: m.Oscilloscope })),
);
const PinWaveformOscilloscope = lazyWithRetry(() =>
  import("./PinWaveformOscilloscope").then((m) => ({
    default: m.PinWaveformOscilloscope,
  })),
);
const BinaryStateMonitor = lazyWithRetry(() =>
  import("./BinaryStateMonitor").then((m) => ({
    default: m.BinaryStateMonitor,
  })),
);
const SchematicPcbScanner = lazyWithRetry(() =>
  import("./SchematicPcbScanner").then((m) => ({
    default: m.SchematicPcbScanner,
  })),
);
const EcuConnectorPinouts = lazyWithRetry(() =>
  import("./EcuConnectorPinouts").then((m) => ({
    default: m.EcuConnectorPinouts,
  })),
);
const EcuRepairKnowledgeBase = lazyWithRetry(() =>
  import("./EcuRepairKnowledgeBase").then((m) => ({
    default: m.EcuRepairKnowledgeBase,
  })),
);
const ThreeBenchTwin = lazyWithRetry(() =>
  import("./ThreeBenchTwin").then((m) => ({ default: m.ThreeBenchTwin })),
);
const ThreeDViewport = lazyWithRetry(() =>
  import("./ThreeDViewport").then((m) => ({ default: m.ThreeDViewport })),
);
const D3OscilloscopeView = lazyWithRetry(() =>
  import("./D3OscilloscopeView").then((m) => ({ default: m.D3OscilloscopeView })),
);
const TroubleScenariosLookupDrawer = lazyWithRetry(() =>
  import("./TroubleScenariosLookupDrawer").then((m) => ({
    default: m.TroubleScenariosLookupDrawer,
  })),
);
const BenchTroubleScenarioDrawer = lazyWithRetry(() =>
  import("./BenchTroubleScenarioDrawer").then((m) => ({
    default: m.BenchTroubleScenarioDrawer,
  })),
);
const UniversityLabGuidanceCard = lazyWithRetry(() =>
  import("./UniversityLabGuidanceCard").then((m) => ({
    default: m.UniversityLabGuidanceCard,
  })),
);
const UniversityLabPdfModal = lazyWithRetry(() =>
  import("./UniversityLabPdfModal").then((m) => ({
    default: m.UniversityLabPdfModal,
  })),
);
const FaultBuilderModal = lazyWithRetry(() =>
  import("./FaultBuilderModal").then((m) => ({
    default: m.FaultBuilderModal,
  })),
);
import {
  computeNextFaultSequenceEdgeMs,
  evaluateFaultSequenceFrame,
  type CustomFaultSequence,
} from "../simulation/faults/faultSequenceService";
import {
  getUniversityLabModuleById,
  toBenchTroubleScenario,
  type CapturedLabStepEvidence,
  type LabGuidanceStep,
  type LabStepLiveEvaluation,
  type UniversityLabModule,
} from "../data/universityLabCurriculum";

export type ProbeColor = "red" | "black";
export type ComponentStateUpdates = Record<string, number | boolean | string>;

/** Public App.tsx contract: existing callers do not need new props. */
export interface LabNavigationProps {
  activeTab: LabTab;
  onNavigateTab: (tab: LabTab) => void;
  rackFilter: RackFilter;
  onChangeRackFilter: (filter: RackFilter) => void;
  mobileBenchPane: MobileBenchPane;
  onChangeMobileBenchPane: (pane: MobileBenchPane) => void;
  showDiagnosticGuide: boolean;
  onSetShowDiagnosticGuide: (open: boolean) => void;
  diagnosticPanelMode?: DiagnosticPanelMode;
  onChangeDiagnosticPanelMode?: (mode: DiagnosticPanelMode) => void;
  checkedWorkflowIds?: string[];
  onChangeCheckedWorkflowIds?: React.Dispatch<React.SetStateAction<string[]>>;
  preBenchGateLocked?: boolean;
  preBenchGateBypassed?: boolean;
  onTogglePreBenchGate?: () => void;
  onBypassPreBenchGate?: () => void;
  pinoutSafetyEvaluation?: PinoutSafetyEvaluation;
  selectedVehicleStatus?: string;
  onConfirmOcrVehicleBench?: () => void;
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
        "expectedState" | "minVoltage" | "maxVoltage" | "shortToBatteryThresholdV"
      >
    >,
  ) => void;
  onApplyLogicPreset?: (preset: LogicWatchPreset) => void;
  onResetLogicRules?: () => void;
  onClearLogicIncidents?: () => void;
  isVoiceLogOpen?: boolean;
  onToggleVoiceLog?: () => void;
  onSetVoiceLogOpen?: (open: boolean) => void;
  isLookupDrawerOpen?: boolean;
  onOpenLookupDrawer?: () => void;
  onCloseLookupDrawer?: () => void;
  academyLaunchRequest?: { moduleId: string; nonce: number } | null;
  onActiveUniversityModuleChange?: (moduleId: string | null) => void;
  isAiCoachOpen?: boolean;
  onOpenAiCoach?: () => void;
  benchVoiceActionRequest?: {
    action: BenchVoiceSimulationAction;
    nonce: number;
  } | null;
}
export interface LabSimulationProps {
  simulationSpeed: number;
  powerSupply: PowerSupplyState;
  onChangePowerSupply: React.Dispatch<React.SetStateAction<PowerSupplyState>>;
  multimeter: MultimeterState;
  onChangeMultimeter: React.Dispatch<React.SetStateAction<MultimeterState>>;
  circuitSolution: CircuitSolution;
  pins: EcuPin[];
  components: BenchComponent[];
  wires: WireConnection[];
  faults: InjectedFault[];
  selectedPinId: string | null;
  onSelectPin: (pinId: string | null) => void;
  hasCanFault: boolean;
  hasInjectorFault: boolean;
  selectedBrandKey?: string;
  selectedModelName?: string;
  selectedEcuProfileId?: string | null;
  onSelectVehicleEcu?: (
    brandKey: string,
    modelName: string,
    ecuProfileId: string | null,
  ) => void;
  rpmEmulator?: RpmEmulatorState;
  onChangeRpmEmulator?: React.Dispatch<React.SetStateAction<RpmEmulatorState>>;
  gaugeMonitor?: GaugeMonitorState;
  onChangeGaugeMonitor?: React.Dispatch<React.SetStateAction<GaugeMonitorState>>;
  twinSyncMode?: "LIVE_DATA" | "MANUAL_REVIEW";
  onToggleTwinSyncMode?: () => void;
}
export interface LabFaultCallbacks {
  onAddFault: (
    pinId: string,
    faultType: FaultType,
    description: string,
    customSeriesOhms?: number,
  ) => void;
  onReplaceFaults?: (faults: InjectedFault[]) => void;
  onRemoveFault: (pinId: string) => void;
  onClearAllFaults: () => void;
  onSearchDtc: (code: string, desc: string) => void;
}
export interface LabHarnessCallbacks {
  onAddWire: (
    sourcePinId: string,
    targetPinId: string,
    color?: string,
    label?: string,
  ) => void;
  onToggleCutWire: (wireId: string) => void;
  onDeleteWire: (wireId: string) => void;
  onRenameWire?: (wireId: string, newLabel: string) => void;
  onAttachProbe: (color: ProbeColor, pinId: string, label: string) => void;
  onUpdateComponentState: (
    compId: string,
    updates: ComponentStateUpdates,
  ) => void;
  onAddComponent?: (comp: BenchComponent) => void;
  onDeleteComponent?: (compId: string) => void;
  onUpdateComponentPosition?: (compId: string, x: number, y: number) => void;
}
export interface LabToolCallbacks {
  onOpenEcuPinouts: () => void;
  onOpenOfflineBot: (prompt?: string) => void;
  onOpenGroundedSearch: (query?: string, dtc?: string, ecu?: string) => void;
  onOpenCloudModal: () => void;
  onResetLab?: () => void;
  onCrossProbePin?: (pinId: string, label?: string, navigateToBench?: boolean) => void;
  onOpenVoiceMacroLibrary?: () => void;
  manualRangeLabel?: string | null;
  onSetManualRangeLabel?: React.Dispatch<React.SetStateAction<string | null>>;
}
export interface LabCloudDataProps {
  savedSessions: SavedBenchSession[];
  savedLogs: SavedDiagnosticLog[];
  savedFaultSequences?: CustomFaultSequence[];
  onSaveFaultSequence?: (sequence: CustomFaultSequence) => Promise<CustomFaultSequence>;
  onDeleteFaultSequence?: (sequenceId: string) => Promise<void>;
  faultSyncStatus?: CloudSyncStatusSnapshot;
  isCloudAuthenticated?: boolean;
  localWorkstationSequenceCount?: number;
  onSyncFaultSequences?: () => Promise<void>;
  onPromoteLocalFaultSequences?: () => Promise<number>;
}
export interface LabWorkspaceLayoutProps
  extends
    LabNavigationProps,
    LabSimulationProps,
    LabFaultCallbacks,
    LabHarnessCallbacks,
    LabToolCallbacks,
    LabCloudDataProps {}

export type WorkspaceLayoutTier =
  | "COMPACT_MOBILE"
  | "TABLET_SPLIT"
  | "COMPACT_DESKTOP"
  | "WIDE_DESKTOP";

type Size = Readonly<{ width: number; height: number }>;
type ScopeMode = "CRT" | "D3_SCOPE" | "RECHARTS_PIN" | "BINARY_MONITOR";
const VALID_LAB_TABS: readonly LabTab[] = [
  "BENCH_LAB",
  "WIRING_DIAGRAM",
  "THREE_D_TWIN",
  "ECU_PINOUT",
  "OSCILLOSCOPE",
  "PCB_SCANNER",
  "REPAIR_GUIDE",
];
const VALID_RACK_FILTERS: readonly RackFilter[] = [
  "ALL",
  "DMM_POWER",
  "FAULT_MATRIX",
];
const DEFAULT_PANE_ORDER: readonly MobileBenchPane[] = [
  "INSTRUMENTS",
  "CANVAS",
  "GUIDE",
];
const REQUIRED_CALLBACK_KEYS: readonly (keyof LabWorkspaceLayoutProps)[] = [
  "onNavigateTab",
  "onChangeRackFilter",
  "onChangeMobileBenchPane",
  "onSetShowDiagnosticGuide",
  "onChangePowerSupply",
  "onChangeMultimeter",
  "onSelectPin",
  "onAddFault",
  "onRemoveFault",
  "onClearAllFaults",
  "onSearchDtc",
  "onAddWire",
  "onToggleCutWire",
  "onDeleteWire",
  "onAttachProbe",
  "onUpdateComponentState",
  "onOpenEcuPinouts",
  "onOpenOfflineBot",
  "onOpenGroundedSearch",
  "onOpenCloudModal",
];
const OPTIONAL_CALLBACK_KEYS: readonly (keyof LabWorkspaceLayoutProps)[] = [
  "onResetLab",
  "onSelectVehicleEcu",
  "onChangeRpmEmulator",
  "onChangeGaugeMonitor",
  "onToggleVoiceLog",
  "onSetVoiceLogOpen",
  "onChangeDiagnosticPanelMode",
  "onChangeCheckedWorkflowIds",
  "onTogglePreBenchGate",
  "onBypassPreBenchGate",
  "onToggleAutoVerifyWorkflow",
  "onToggleLogicCheckArmed",
  "onToggleLogicRuleEnabled",
  "onUpdateLogicRuleThresholds",
  "onApplyLogicPreset",
  "onResetLogicRules",
  "onClearLogicIncidents",
  "onCrossProbePin",
  "onAddComponent",
  "onDeleteComponent",
  "onUpdateComponentPosition",
  "onRenameWire",
  "onOpenVoiceMacroLibrary",
  "onSetManualRangeLabel",
  "onReplaceFaults",
  "onSaveFaultSequence",
  "onDeleteFaultSequence",
  "onSyncFaultSequences",
  "onPromoteLocalFaultSequences",
];
const PANEL_LABELS: Record<MobileBenchPane, string> = {
  INSTRUMENTS: "Instruments",
  CANVAS: "Harness Canvas",
  GUIDE: "Workflow & Guide",
};
const EMPTY_SESSIONS: SavedBenchSession[] = [];
const EMPTY_LOGS: SavedDiagnosticLog[] = [];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isFiniteRecord = (value: unknown): value is Record<string, number> =>
  isRecord(value) && Object.values(value).every(isFiniteNumber);

/** Checks the consumed hardware boundary; domain-specific nested schemas remain in their owners. */
function getHardwareErrors(props: Partial<LabWorkspaceLayoutProps>): string[] {
  const errors: string[] = [];
  const supply: unknown = props.powerSupply;
  if (!isRecord(supply)) errors.push('Prop "powerSupply" must be an object.');
  else {
    if (!isFiniteNumber(supply.voltageSetting) || supply.voltageSetting < 0)
      errors.push(
        'Prop "powerSupply.voltageSetting" must be finite and non-negative.',
      );
    if (!isFiniteNumber(supply.currentLimit) || supply.currentLimit < 0)
      errors.push(
        'Prop "powerSupply.currentLimit" must be finite and non-negative.',
      );
    if (typeof supply.isOutputEnabled !== "boolean")
      errors.push('Prop "powerSupply.isOutputEnabled" must be a boolean.');
  }
  const meter: unknown = props.multimeter;
  if (!isRecord(meter)) errors.push('Prop "multimeter" must be an object.');
  else {
    if (typeof meter.mode !== "string")
      errors.push('Prop "multimeter.mode" must be a string.');
    if (!isRecord(meter.redProbe) || !isRecord(meter.blackProbe))
      errors.push("Multimeter redProbe and blackProbe must be objects.");
  }
  const solution: unknown = props.circuitSolution;
  if (!isRecord(solution))
    errors.push('Prop "circuitSolution" must be an MNA snapshot.');
  else {
    for (const key of ["nodeVoltages", "wireCurrentsMa"]) {
      if (!isFiniteRecord(solution[key]))
        errors.push(
          `Prop "circuitSolution.${key}" must contain only finite numbers.`,
        );
    }
    if (!isRecord(solution.multimeterReading))
      errors.push(
        'Prop "circuitSolution.multimeterReading" must be an object.',
      );
    if (!Array.isArray(solution.activeDTCs))
      errors.push('Prop "circuitSolution.activeDTCs" must be an array.');
    if (!isFiniteNumber(solution.supplyCurrentDrawAmps))
      errors.push(
        'Prop "circuitSolution.supplyCurrentDrawAmps" must be finite.',
      );
  }
  for (const key of ["pins", "components", "wires", "faults"] as const) {
    const items: unknown = props[key];
    if (!Array.isArray(items)) errors.push(`Prop "${key}" must be an array.`);
    else if (!items.every(isRecord))
      errors.push(`Prop "${key}" must contain only objects.`);
  }
  if (
    Array.isArray(props.pins) &&
    !props.pins.every(
      (pin) =>
        isRecord(pin) &&
        typeof pin.id === "string" &&
        isFiniteNumber(pin.pinNumber),
    )
  )
    errors.push("Every pin must have a string id and finite pinNumber.");
  if (
    Array.isArray(props.components) &&
    !props.components.every(
      (component) =>
        isRecord(component) &&
        typeof component.id === "string" &&
        (component.state === undefined || isRecord(component.state)),
    )
  )
    errors.push(
      "Every component needs a string id and an object state when provided.",
    );
  for (const key of REQUIRED_CALLBACK_KEYS) {
    if (typeof props[key] !== "function")
      errors.push(`Callback prop "${key}" must be a function.`);
  }
  for (const key of OPTIONAL_CALLBACK_KEYS) {
    if (props[key] !== undefined && typeof props[key] !== "function")
      errors.push(
        `Optional callback "${key}" must be a function when provided.`,
      );
  }
  if (props.rpmEmulator !== undefined) {
    const rpm: unknown = props.rpmEmulator;
    if (
      !isRecord(rpm) ||
      typeof rpm.isActive !== "boolean" ||
      !isFiniteNumber(rpm.rpm) ||
      rpm.rpm < 0 ||
      typeof rpm.soundEnabled !== "boolean"
    )
      errors.push(
        "rpmEmulator requires boolean isActive/soundEnabled and finite non-negative rpm.",
      );
  }
  for (const key of [
    "showDiagnosticGuide",
    "hasCanFault",
    "hasInjectorFault",
  ] as const) {
    if (typeof props[key] !== "boolean")
      errors.push(`Prop "${key}" must be a boolean.`);
  }
  if (props.selectedPinId !== null && typeof props.selectedPinId !== "string")
    errors.push('Prop "selectedPinId" must be a string or null.');
  for (const key of ["selectedBrandKey", "selectedModelName"] as const) {
    if (props[key] !== undefined && typeof props[key] !== "string")
      errors.push(`Optional prop "${key}" must be a string.`);
  }
  if (
    props.selectedEcuProfileId !== undefined &&
    props.selectedEcuProfileId !== null &&
    typeof props.selectedEcuProfileId !== "string"
  )
    errors.push("selectedEcuProfileId must be a string, null, or undefined.");
  return errors;
}

/** Navigation and saved-data issues that the workspace can safely normalize. */
function getRecoverableErrors(
  props: Partial<LabWorkspaceLayoutProps>,
): string[] {
  const errors: string[] = [];
  if (!props.activeTab || !VALID_LAB_TABS.includes(props.activeTab))
    errors.push(`Invalid "activeTab": received "${String(props.activeTab)}".`);
  if (!props.rackFilter || !VALID_RACK_FILTERS.includes(props.rackFilter))
    errors.push(
      `Invalid "rackFilter": received "${String(props.rackFilter)}".`,
    );
  if (
    !props.mobileBenchPane ||
    !DEFAULT_PANE_ORDER.includes(props.mobileBenchPane)
  )
    errors.push(
      `Invalid "mobileBenchPane": received "${String(props.mobileBenchPane)}".`,
    );
  if (!isFiniteNumber(props.simulationSpeed) || props.simulationSpeed <= 0)
    errors.push('Prop "simulationSpeed" must be a positive finite number.');
  for (const key of ["savedSessions", "savedLogs"] as const) {
    if (!Array.isArray(props[key]) || !props[key]?.every(isRecord))
      errors.push(`Prop "${key}" must be an array of objects.`);
  }
  return errors;
}

/** Returns boundary violations without throwing for malformed nested hardware data. */
export function validateLabWorkspaceProps(
  props: Partial<LabWorkspaceLayoutProps>,
): string[] {
  return [...getHardwareErrors(props), ...getRecoverableErrors(props)];
}

/** Observes the actual mounted node, including replacements after validation errors. */
function useWorkspaceSize(element: HTMLElement | null): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useEffect(() => {
    if (!element) return;
    let frame: number | null = null;
    const measure = () => {
      frame = null;
      // clientWidth/clientHeight match the padding-box coordinates of absolute-positioned controls.
      const width = element.clientWidth;
      const height = element.clientHeight;
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(measure);
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
    observer?.observe(element);
    window.addEventListener("resize", schedule);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [element]);
  return size;
}

interface ModuleBoundaryProps {
  children: React.ReactNode;
  label: string;
  resetKey: string;
  onReturnToBench: () => void;
}
class ModuleErrorBoundary extends Component<
  ModuleBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[LabWorkspaceLayout] ${this.props.label} failed:`,
      error,
      info,
    );
  }
  componentDidUpdate(previous: ModuleBoundaryProps) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed)
      this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section
        role="alert"
        className="hud-panel rounded-[3px] border border-rose-500/40 p-4 min-w-0"
      >
        <h2 className="flex items-center gap-2 text-sm font-bold text-rose-300">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {this.props.label} is unavailable
        </h2>
        <p className="mt-2 text-xs text-slate-300">
          The module could not load or render. Return to the bench, or reload to
          fetch application assets. Reloading may discard unsaved changes.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => this.setState({ failed: false })}
            className="hw-btn hw-btn-amber rounded-[2px] px-3 py-2 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 cursor-pointer"
          >
            Retry module
          </button>
          <button
            type="button"
            onClick={this.props.onReturnToBench}
            className="hw-btn rounded-[2px] px-3 py-2 text-xs font-bold text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 cursor-pointer"
          >
            Return to bench
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="hw-btn rounded-[2px] px-3 py-2 text-xs text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 cursor-pointer"
          >
            Reload application
          </button>
        </div>
      </section>
    );
  }
}
function LoadingPanel({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="hud-panel flex min-h-[180px] w-full flex-1 items-center justify-center gap-2 rounded-[3px] p-4 text-xs font-mono text-amber-300"
    >
      <Activity
        className="h-4 w-4 motion-safe:animate-pulse"
        aria-hidden="true"
      />
      <span>Loading {label}…</span>
    </div>
  );
}
function LazyModule({
  children,
  label,
  resetKey,
  onReturnToBench,
}: ModuleBoundaryProps) {
  return (
    <ModuleErrorBoundary
      label={label}
      resetKey={resetKey}
      onReturnToBench={onReturnToBench}
    >
      <Suspense fallback={<LoadingPanel label={label} />}>{children}</Suspense>
    </ModuleErrorBoundary>
  );
}



/** Validation is outside the live workspace: malformed props cannot reach context derivation or children. */
export const LabWorkspaceLayout: React.FC<LabWorkspaceLayoutProps> = (
  props,
) => {
  const fatalErrors = getHardwareErrors(props);
  const errors = [...fatalErrors, ...getRecoverableErrors(props)];
  const signature = errors.join("\n");
  useEffect(() => {
    if (import.meta.env.DEV && signature)
      console.error(
        "[LabWorkspaceLayout] Runtime prop validation failed:\n" + signature,
      );
  }, [signature]);
  if (fatalErrors.length > 0) {
    return (
      <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-3">
        <section
          role="alert"
          aria-label="Workspace configuration error"
          className="hud-panel max-h-full w-full max-w-lg overflow-auto rounded-[3px] border border-rose-500/50 p-4 text-xs text-rose-200"
        >
          <h2 className="text-sm font-bold uppercase tracking-wide text-rose-300">
            Workspace configuration error
          </h2>
          <p className="my-2 text-slate-300">
            Required hardware data or callbacks are missing or malformed.
          </p>
          <ul className="list-disc space-y-1 pl-4 font-mono">
            {fatalErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </section>
      </main>
    );
  }
  return <WorkspaceContent {...props} />;
};

/** Layout-only controller. Electrical behavior remains owned by App.tsx and the solver. */
function WorkspaceContent(props: LabWorkspaceLayoutProps) {
  const {
    onNavigateTab,
    onChangeRackFilter,
    onChangeMobileBenchPane,
    showDiagnosticGuide,
    onSetShowDiagnosticGuide,
    powerSupply,
    onChangePowerSupply,
    multimeter,
    onChangeMultimeter,
    circuitSolution,
    pins,
    components,
    wires,
    faults,
    selectedPinId,
    onSelectPin,
    onAddFault,
    onRemoveFault,
    onClearAllFaults,
    onSearchDtc,
    onAddWire,
    onToggleCutWire,
    onDeleteWire,
    onRenameWire,
    onAttachProbe,
    onUpdateComponentState,
    onOpenEcuPinouts,
    onOpenOfflineBot,
    onOpenGroundedSearch,
    onOpenCloudModal,
    onResetLab,
    hasCanFault,
    hasInjectorFault,
    selectedBrandKey,
    selectedModelName,
    selectedEcuProfileId,
    onSelectVehicleEcu,
    rpmEmulator,
    onChangeRpmEmulator,
    gaugeMonitor,
    onChangeGaugeMonitor,
    onAddComponent,
    onDeleteComponent,
    onUpdateComponentPosition,
    twinSyncMode,
    onToggleTwinSyncMode,
  } = props;
  const activeTab = VALID_LAB_TABS.includes(props.activeTab)
    ? props.activeTab
    : "BENCH_LAB";
  const rackFilter = VALID_RACK_FILTERS.includes(props.rackFilter)
    ? props.rackFilter
    : "ALL";
  const mobileBenchPane = DEFAULT_PANE_ORDER.includes(props.mobileBenchPane)
    ? props.mobileBenchPane
    : "INSTRUMENTS";
  const simulationSpeed =
    isFiniteNumber(props.simulationSpeed) && props.simulationSpeed > 0
      ? props.simulationSpeed
      : 1;
  const safeSavedSessions = useMemo(
    () =>
      Array.isArray(props.savedSessions)
        ? props.savedSessions.filter(isRecord)
        : EMPTY_SESSIONS,
    [props.savedSessions],
  );
  const safeSavedLogs = useMemo(
    () =>
      Array.isArray(props.savedLogs)
        ? props.savedLogs.filter(isRecord)
        : EMPTY_LOGS,
    [props.savedLogs],
  );
  const [mainElement, setMainElement] = useState<HTMLElement | null>(null);
  const attachMain = useCallback((node: HTMLElement | null) => {
    setMainElement(node);
  }, []);
  const containerSize = useWorkspaceSize(mainElement);
  const [paneOrder, setPaneOrder] = useState<MobileBenchPane[]>(() => [
    ...DEFAULT_PANE_ORDER,
  ]);
  const [benchViewportMode, setBenchViewportMode] = useState<
    "2D_HARNESS" | "SPLIT" | "3D_EMS"
  >("SPLIT");
  useEffect(() => {
    if (!props.benchVoiceActionRequest) return;
    const t = props.benchVoiceActionRequest.action.type;
    if (
      t === "SHOW_ENGINE_BLOCK" ||
      t === "TOGGLE_FAULT_MESH" ||
      t === "SET_CAMERA_PRESET" ||
      t === "SET_EXPLODE" ||
      t === "START_GUIDED_TOUR"
    ) {
      setBenchViewportMode((prev) => (prev === "2D_HARNESS" ? "SPLIT" : prev));
    }
  }, [props.benchVoiceActionRequest]);
  const [isContainerMoveMode, setIsContainerMoveMode] = useState(false);
  const [showPinScopeOverlay, setShowPinScopeOverlay] = useState(false);
  const [isTroubleDrawerOpen, setIsTroubleDrawerOpen] = useState(false);
  const [hasOpenedTroubleDrawer, setHasOpenedTroubleDrawer] = useState(false);
  useEffect(() => {
    if (isTroubleDrawerOpen) {
      setHasOpenedTroubleDrawer(true);
    }
  }, [isTroubleDrawerOpen]);
  const [internalLookupDrawerOpen, setInternalLookupDrawerOpen] = useState(false);
  const [hasOpenedLookupDrawer, setHasOpenedLookupDrawer] = useState(false);
  const effectiveLookupOpen = props.isLookupDrawerOpen ?? internalLookupDrawerOpen;
  useEffect(() => {
    if (effectiveLookupOpen) {
      setHasOpenedLookupDrawer(true);
    }
  }, [effectiveLookupOpen]);
  const externalOpenLookup = props.onOpenLookupDrawer;
  const externalCloseLookup = props.onCloseLookupDrawer;
  const openLookupDrawer = useCallback(() => {
    setHasOpenedLookupDrawer(true);
    if (externalOpenLookup) {
      externalOpenLookup();
    } else {
      setInternalLookupDrawerOpen(true);
    }
  }, [externalOpenLookup]);
  const closeLookupDrawer = useCallback(() => {
    if (externalCloseLookup) {
      externalCloseLookup();
    } else {
      setInternalLookupDrawerOpen(false);
    }
  }, [externalCloseLookup]);
  const [activeTroubleScenarioId, setActiveTroubleScenarioId] = useState<
    string | null
  >(null);
  const [activeUniversityModuleId, setActiveUniversityModuleId] = useState<
    string | null
  >(null);
  const [capturedLabStepsByModule, setCapturedLabStepsByModule] = useState<
    Record<string, Record<string, CapturedLabStepEvidence>>
  >({});
  const [isUniversityPdfModalOpen, setIsUniversityPdfModalOpen] = useState(false);
  const [universityPdfModalTab, setUniversityPdfModalTab] = useState<'EXPORT' | 'VERIFY'>('EXPORT');
  const [isFaultBuilderOpen, setIsFaultBuilderOpen] = useState(false);
  const [activeFaultSequence, setActiveFaultSequence] = useState<CustomFaultSequence | null>(null);
  const [isSequencePlaying, setIsSequencePlaying] = useState(false);
  const [sequenceElapsedMs, setSequenceElapsedMs] = useState(0);
  const [sequenceEdgeHits, setSequenceEdgeHits] = useState(0);
  const [isSequenceBlindMode, setIsSequenceBlindMode] = useState(false);
  const lastAppliedSequenceSigRef = useRef<string>('');
  const sequenceElapsedRef = useRef<number>(0);
  const wasPulseEngagedRef = useRef<boolean>(false);
  const [lookupInitialQuery, setLookupInitialQuery] = useState<string>("");
  const [activeLookupPhId, setActiveLookupPhId] = useState<string>(() => {
    const recent = loadRecentLookupIds();
    return recent[0] || PH_BENCH_TROUBLE_SCENARIOS[0]?.phId || "PH-001";
  });
  const [activeLookupStepIndex, setActiveLookupStepIndex] = useState<number>(0);
  const [completedLookupStepsByPhId, setCompletedLookupStepsByPhId] = useState<
    Record<string, number[]>
  >({});
  const [oscilloscopeViewMode, setOscilloscopeViewMode] =
    useState<ScopeMode>("CRT");
  const [isVoiceAssistantActive, setIsVoiceAssistantActive] = useState(false);
  const [internalVoiceLogOpen, setInternalVoiceLogOpen] = useState(false);
  const [voiceSidebarSection, setVoiceSidebarSection] =
    useState<VoiceSidebarSection>("LOG");
  const [voiceState, setVoiceState] = useState<VoiceAssistantState>(() =>
    offlineVoiceAssistant.getState(),
  );
  const [voiceHistory, setVoiceHistory] = useState<VoiceCommandLogEntry[]>(() =>
    offlineVoiceAssistant.getCommandHistory(),
  );
  const [voiceFloatingOpacity, setVoiceFloatingOpacity] =
    useState<FloatingOpacityLevel>(0.75);
  const [voiceAnnouncement, setVoiceAnnouncement] = useState("");
  const [internalManualRangeLabel, setInternalManualRangeLabel] = useState<string | null>(null);
  const manualRangeLabel =
    props.manualRangeLabel !== undefined ? props.manualRangeLabel : internalManualRangeLabel;
  const setManualRangeLabel = useCallback(
    (next: React.SetStateAction<string | null>) => {
      if (props.onSetManualRangeLabel) {
        props.onSetManualRangeLabel(next);
      } else {
        setInternalManualRangeLabel(next);
      }
    },
    [props],
  );
  const clearManualRange = useCallback(
    () => setManualRangeLabel(null),
    [setManualRangeLabel],
  );
  const voiceExecutorRef = useRef<
    | ((
        rawQuery: string,
        source?: VoiceCommandLogSource,
        meta?: VoiceResultMetadata,
      ) => void)
    | null
  >(null);
  const previousVoiceState = useRef(isVoiceAssistantActive);
  const previousOpacity = useRef(voiceFloatingOpacity);
  const generatedId = useId();
  const paneId = (pane: MobileBenchPane) =>
    `${generatedId}-${pane.toLowerCase()}`;
  const scopeOverlayId = `${generatedId}-scope-overlay`;
  const selectedPin = useMemo(
    () => pins.find((pin) => pin.id === selectedPinId) ?? pins[0],
    [pins, selectedPinId],
  );
  const isInjectorFiring = useMemo(() => {
    const injector = components.find(
      (component) => component.id === "comp-inj",
    );
    return Boolean(injector?.state?.isFiring ?? true);
  }, [components]);
  const activeScopeRpm = rpmEmulator?.isActive ? rpmEmulator.rpm : 850;
  const activeCamPhaseOffsetDeg = rpmEmulator?.camPhaseOffsetDeg ?? 0;
  const isCkpSignalLost = Boolean(rpmEmulator?.ckpSignalLost);
  const cutWireCount = useMemo(
    () => wires.filter((wire) => wire.isCut).length,
    [wires],
  );
  const benchPulseEval = useMemo(
    () =>
      evaluateBenchPulseAndSignalStatus({
        powerSupply,
        circuitSolution,
        faults,
        wires,
        components,
        rpmEmulator,
      }),
    [
      powerSupply,
      circuitSolution,
      faults,
      wires,
      components,
      rpmEmulator,
    ],
  );

  const handleApplyTroubleScenario = useCallback(
    (scenario: BenchTroubleScenario, wiresToCut?: readonly string[]) => {
      onClearAllFaults();
      const targetCutSet = new Set(wiresToCut ?? []);
      for (const wire of wires) {
        const shouldBeCut = targetCutSet.has(wire.id);
        if (wire.isCut !== shouldBeCut) {
          onToggleCutWire(wire.id);
        }
      }

      const overrideMap = new Map(
        (scenario.componentOverrides ?? []).map((entry) => [
          entry.componentId,
          entry.state,
        ]),
      );
      onUpdateComponentState(
        "comp-relay",
        overrideMap.get("comp-relay") ?? { isLatched: true },
      );
      onUpdateComponentState(
        "comp-inj",
        overrideMap.get("comp-inj") ?? { isFiring: true },
      );
      onUpdateComponentState(
        "comp-tps",
        overrideMap.get("comp-tps") ?? { throttleAnglePercent: 20 },
      );
      onUpdateComponentState(
        "comp-map",
        overrideMap.get("comp-map") ?? { pressureKpa: 42 },
      );
      onUpdateComponentState(
        "comp-ect",
        overrideMap.get("comp-ect") ?? { tempCelsius: 85 },
      );
      for (const entry of scenario.componentOverrides ?? []) {
        if (
          entry.componentId !== "comp-relay" &&
          entry.componentId !== "comp-inj" &&
          entry.componentId !== "comp-tps" &&
          entry.componentId !== "comp-map" &&
          entry.componentId !== "comp-ect"
        ) {
          onUpdateComponentState(entry.componentId, entry.state);
        }
      }

      for (const faultSpec of scenario.faultsToInject) {
        onAddFault(faultSpec.pinId, faultSpec.faultType, faultSpec.description);
      }

      if (scenario.psuOverride) {
        if (scenario.psuOverride.isOutputEnabled !== false) {
          props.onBypassPreBenchGate?.();
        }
        onChangePowerSupply((previous) => {
          const nextV = scenario.psuOverride?.voltageSetting ?? previous.voltageSetting;
          const nextPreset: PowerSupplyState['preset'] =
            Math.abs(nextV - 12.6) < 0.05
              ? '12V_BENCH'
              : Math.abs(nextV - 14.4) < 0.05
                ? '14.4V_RUNNING'
                : Math.abs(nextV - 10.2) < 0.05
                  ? '10.2V_CRANKING'
                  : Math.abs(nextV - 5.0) < 0.05
                    ? '5V_LOGIC'
                    : 'CUSTOM';
          return {
            ...previous,
            isOutputEnabled:
              scenario.psuOverride?.isOutputEnabled ?? previous.isOutputEnabled,
            voltageSetting: nextV,
            preset: nextPreset,
          };
        });
      }

      if (onChangeRpmEmulator) {
        onChangeRpmEmulator((previous) => ({
          ...previous,
          isActive: scenario.rpmOverride.isActive,
          rpm: scenario.rpmOverride.rpm,
          ckpSignalLost: Boolean(scenario.rpmOverride.ckpSignalLost),
          camPhaseOffsetDeg: scenario.rpmOverride.camPhaseOffsetDeg ?? 0,
        }));
      }

      onSelectPin(scenario.focusPinId);
      onAttachProbe("red", scenario.focusPinId, scenario.focusPinLabel);
      setActiveTroubleScenarioId(scenario.id);
    },
    [
      onClearAllFaults,
      wires,
      onToggleCutWire,
      onUpdateComponentState,
      onAddFault,
      onChangePowerSupply,
      onChangeRpmEmulator,
      onSelectPin,
      onAttachProbe,
    ],
  );

  const handleStartUniversityModule = useCallback(
    (module: UniversityLabModule) => {
      const benchScenario = toBenchTroubleScenario(module);
      handleApplyTroubleScenario(benchScenario, module.wiresToCut);
      setActiveUniversityModuleId(module.id);
      setCapturedLabStepsByModule((prev) => ({
        ...prev,
        [module.id]: {},
      }));
      onNavigateTab("BENCH_LAB");
    },
    [handleApplyTroubleScenario, onNavigateTab],
  );

  const lastHandledAcademyNonceRef = useRef<number>(0);
  const { academyLaunchRequest, onActiveUniversityModuleChange } = props;

  useEffect(() => {
    if (
      !academyLaunchRequest ||
      academyLaunchRequest.nonce === lastHandledAcademyNonceRef.current
    ) {
      return;
    }
    const targetModule = getUniversityLabModuleById(academyLaunchRequest.moduleId);
    if (!targetModule) return;
    lastHandledAcademyNonceRef.current = academyLaunchRequest.nonce;
    handleStartUniversityModule(targetModule);
  }, [academyLaunchRequest, handleStartUniversityModule]);

  useEffect(() => {
    onActiveUniversityModuleChange?.(activeUniversityModuleId);
  }, [activeUniversityModuleId, onActiveUniversityModuleChange]);

  const handleCaptureUniversityStep = useCallback(
    (step: LabGuidanceStep, evaluation: LabStepLiveEvaluation) => {
      if (!activeUniversityModuleId) return;
      if (evaluation.status === "WAITING_SETUP") return;
      const record: CapturedLabStepEvidence = {
        stepId: step.id,
        stepNumber: step.stepNumber,
        titleTaglish: step.titleTaglish,
        probeSetupLabel: `Red: ${step.redProbeLabel} -> Black: ${step.blackProbeLabel}`,
        dmmMode: multimeter.mode,
        psuEnabled: powerSupply.isOutputEnabled,
        psuVoltage: powerSupply.voltageSetting,
        measuredDisplay: evaluation.liveDisplay,
        measuredUnit: evaluation.liveUnit,
        measuredNumeric: Number.isFinite(evaluation.liveNumericValue)
          ? evaluation.liveNumericValue
          : null,
        expectedCriteria: `${step.expectedReadingLabel} (${step.toleranceLabel})`,
        status: evaluation.status,
        capturedAtIso: new Date().toISOString(),
      };
      setCapturedLabStepsByModule((prev) => ({
        ...prev,
        [activeUniversityModuleId]: {
          ...(prev[activeUniversityModuleId] ?? {}),
          [step.id]: record,
        },
      }));
    },
    [activeUniversityModuleId, multimeter.mode, powerSupply.isOutputEnabled, powerSupply.voltageSetting],
  );

  const handleOpenUniversityPdfModal = useCallback((tab: 'EXPORT' | 'VERIFY' = 'EXPORT') => {
    setUniversityPdfModalTab(tab);
    setIsUniversityPdfModalOpen(true);
  }, []);

  const activeUniversityModule = useMemo(
    () => getUniversityLabModuleById(activeUniversityModuleId),
    [activeUniversityModuleId],
  );

  const activeCapturedStepsMap = useMemo(
    () => (activeUniversityModuleId ? capturedLabStepsByModule[activeUniversityModuleId] ?? {} : {}),
    [activeUniversityModuleId, capturedLabStepsByModule],
  );

  const activeCapturedStepsList = useMemo(
    () =>
      Object.values(activeCapturedStepsMap).sort(
        (a, b) => a.stepNumber - b.stepNumber,
      ),
    [activeCapturedStepsMap],
  );

  const {
    onReplaceFaults,
    onBypassPreBenchGate,
  } = props;

  const applyFaultSequenceEvaluation = useCallback(
    (seq: CustomFaultSequence, elapsed: number) => {
      const evalResult = evaluateFaultSequenceFrame(seq, elapsed, pins);
      const isPulseEngaged =
        evalResult.intermittentEngaged ||
        (evalResult.ckpSignalLost &&
          evalResult.activeSummaryItems.some(
            (item) => item.mode === "CKP_DROPOUT" && item.engaged,
          ));
      if (isPulseEngaged && !wasPulseEngagedRef.current) {
        setSequenceEdgeHits((count) => count + 1);
      }
      wasPulseEngagedRef.current = isPulseEngaged;

      const sig = JSON.stringify({
        faults: evalResult.injectedFaults.map((f) => ({
          p: f.pinId,
          t: f.faultType,
          r: f.customSeriesOhms ?? null,
        })),
        cuts: evalResult.cutWireIds,
        ckp: evalResult.ckpSignalLost,
      });

      if (sig === lastAppliedSequenceSigRef.current) {
        return evalResult;
      }
      lastAppliedSequenceSigRef.current = sig;

      if (onReplaceFaults) {
        onReplaceFaults(evalResult.injectedFaults);
      } else {
        onClearAllFaults();
        for (const f of evalResult.injectedFaults) {
          onAddFault(f.pinId, f.faultType, f.description, f.customSeriesOhms);
        }
      }

      const cutSet = new Set(evalResult.cutWireIds);
      for (const wire of wires) {
        const shouldBeCut = cutSet.has(wire.id);
        if (wire.isCut !== shouldBeCut) {
          onToggleCutWire(wire.id);
        }
      }

      if (onChangeRpmEmulator) {
        onChangeRpmEmulator((prev) =>
          Boolean(prev.ckpSignalLost) === evalResult.ckpSignalLost
            ? prev
            : { ...prev, ckpSignalLost: evalResult.ckpSignalLost }
        );
      }
      return evalResult;
    },
    [
      pins,
      onReplaceFaults,
      onClearAllFaults,
      onAddFault,
      wires,
      onToggleCutWire,
      onChangeRpmEmulator,
    ],
  );

  const handleRunFaultSequence = useCallback(
    (seq: CustomFaultSequence, blindMode?: boolean) => {
      onBypassPreBenchGate?.();
      onChangePowerSupply((previous) => ({
        ...previous,
        isOutputEnabled: true,
      }));
      setActiveTroubleScenarioId(null);
      setActiveUniversityModuleId(null);
      setActiveFaultSequence(seq);
      sequenceElapsedRef.current = 0;
      wasPulseEngagedRef.current = false;
      setSequenceElapsedMs(0);
      setSequenceEdgeHits(0);
      setIsSequencePlaying(true);
      if (blindMode !== undefined) {
        setIsSequenceBlindMode(blindMode);
      }
      lastAppliedSequenceSigRef.current = '';
      applyFaultSequenceEvaluation(seq, 0);
    },
    [onBypassPreBenchGate, onChangePowerSupply, applyFaultSequenceEvaluation],
  );

  const handleJumpFaultSequenceStage = useCallback(
    (stageIndex: number) => {
      if (!activeFaultSequence || activeFaultSequence.steps.length === 0) return;
      const clampedIdx = Math.max(
        0,
        Math.min(activeFaultSequence.steps.length - 1, stageIndex),
      );
      let targetMs = 0;
      for (let i = 0; i < clampedIdx; i++) {
        targetMs += Math.max(2000, Math.round(activeFaultSequence.steps[i].durationSec * 1000));
      }
      sequenceElapsedRef.current = targetMs;
      wasPulseEngagedRef.current = false;
      setSequenceElapsedMs(targetMs);
      lastAppliedSequenceSigRef.current = '';
      applyFaultSequenceEvaluation(activeFaultSequence, targetMs);
    },
    [activeFaultSequence, applyFaultSequenceEvaluation],
  );

  const handleStopFaultSequence = useCallback(() => {
    setActiveFaultSequence(null);
    setIsSequencePlaying(false);
    sequenceElapsedRef.current = 0;
    wasPulseEngagedRef.current = false;
    setSequenceElapsedMs(0);
    setSequenceEdgeHits(0);
    lastAppliedSequenceSigRef.current = '';
    onClearAllFaults();
    for (const wire of wires) {
      if (wire.isCut) {
        onToggleCutWire(wire.id);
      }
    }
    if (onChangeRpmEmulator) {
      onChangeRpmEmulator((prev) =>
        prev.ckpSignalLost ? { ...prev, ckpSignalLost: false } : prev
      );
    }
  }, [onClearAllFaults, wires, onToggleCutWire, onChangeRpmEmulator]);

  useEffect(() => {
    if (!activeFaultSequence || !isSequencePlaying) {
      setSequenceElapsedMs(sequenceElapsedRef.current);
      return;
    }

    let cancelled = false;
    let edgeTimeoutId: number | null = null;
    const speed = Math.max(0.5, simulationSpeed);
    const getNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    let lastWallMs = getNow();

    const advanceToNow = () => {
      const now = getNow();
      const wallDelta = Math.max(0, now - lastWallMs);
      lastWallMs = now;
      sequenceElapsedRef.current += wallDelta * speed;
      return sequenceElapsedRef.current;
    };

    const scheduleNextEdge = () => {
      if (cancelled) return;
      const currentSeqMs = advanceToNow();
      const evalRes = applyFaultSequenceEvaluation(activeFaultSequence, currentSeqMs);
      if (evalRes.completedNonLoop) {
        sequenceElapsedRef.current = evalRes.totalDurationMs;
        setSequenceElapsedMs(evalRes.totalDurationMs);
        setIsSequencePlaying(false);
        return;
      }

      const nextEdgeSeqMs = computeNextFaultSequenceEdgeMs(activeFaultSequence, currentSeqMs, 50);
      if (nextEdgeSeqMs === null) {
        setIsSequencePlaying(false);
        return;
      }

      const realDelayMs = Math.max(4, Math.ceil(nextEdgeSeqMs / speed));
      edgeTimeoutId = window.setTimeout(scheduleNextEdge, realDelayMs);
    };

    scheduleNextEdge();

    const uiRefreshTimerId = window.setInterval(() => {
      if (cancelled) return;
      setSequenceElapsedMs(advanceToNow());
    }, 150);

    return () => {
      cancelled = true;
      if (edgeTimeoutId !== null) {
        window.clearTimeout(edgeTimeoutId);
      }
      window.clearInterval(uiRefreshTimerId);
    };
  }, [
    activeFaultSequence,
    isSequencePlaying,
    simulationSpeed,
    applyFaultSequenceEvaluation,
  ]);

  const activeSequenceFrame = useMemo(
    () =>
      activeFaultSequence
        ? evaluateFaultSequenceFrame(activeFaultSequence, sequenceElapsedMs, pins)
        : null,
    [activeFaultSequence, sequenceElapsedMs, pins],
  );

  const handleClearTroubleScenarios = useCallback(() => {
    setActiveFaultSequence(null);
    setIsSequencePlaying(false);
    sequenceElapsedRef.current = 0;
    wasPulseEngagedRef.current = false;
    setSequenceElapsedMs(0);
    setSequenceEdgeHits(0);
    lastAppliedSequenceSigRef.current = '';
    onClearAllFaults();
    for (const wire of wires) {
      if (wire.isCut) {
        onToggleCutWire(wire.id);
      }
    }
    onUpdateComponentState("comp-relay", { isLatched: true });
    onUpdateComponentState("comp-inj", { isFiring: true });
    onUpdateComponentState("comp-tps", { throttleAnglePercent: 20 });
    onUpdateComponentState("comp-map", { pressureKpa: 42 });
    onUpdateComponentState("comp-ect", { tempCelsius: 85 });
    onChangePowerSupply((previous) => ({
      ...previous,
      isOutputEnabled: true,
      voltageSetting: 12.6,
      preset: "12V_BENCH",
    }));
    if (onChangeRpmEmulator) {
      onChangeRpmEmulator((previous) => ({
        ...previous,
        isActive: false,
        rpm: 850,
        ckpSignalLost: false,
        camPhaseOffsetDeg: 0,
      }));
    }
    setActiveTroubleScenarioId(null);
    setActiveUniversityModuleId(null);
  }, [
    onClearAllFaults,
    wires,
    onToggleCutWire,
    onUpdateComponentState,
    onChangePowerSupply,
    onChangeRpmEmulator,
  ]);

  const handleFocusProbePin = useCallback(
    (pinId: string, label: string, openScope?: boolean) => {
      onSelectPin(pinId);
      onAttachProbe("red", pinId, label);
      if (openScope) {
        setIsTroubleDrawerOpen(false);
        setShowPinScopeOverlay(true);
      }
    },
    [onSelectPin, onAttachProbe],
  );

  const handleSetTestRpmMode = useCallback(
    (mode: "CRANK_250" | "IDLE_850" | "STOP") => {
      if (!onChangeRpmEmulator) return;
      onChangeRpmEmulator((previous) => ({
        ...previous,
        isActive: mode !== "STOP",
        rpm: mode === "CRANK_250" ? 250 : 850,
      }));
    },
    [onChangeRpmEmulator],
  );

  const lookupBenchState = useMemo(
    () => ({
      powerSupply,
      multimeter,
      multimeterDisplay: circuitSolution.multimeterReading.display,
      multimeterUnit: circuitSolution.multimeterReading.unit,
      multimeterWarning: circuitSolution.multimeterReading.warningMessage,
      nodeVoltages: circuitSolution.nodeVoltages,
      faults,
      activeDTCs: circuitSolution.activeDTCs,
      pins,
      activeScenarioId: activeTroubleScenarioId,
    }),
    [
      powerSupply,
      multimeter,
      circuitSolution.multimeterReading.display,
      circuitSolution.multimeterReading.unit,
      circuitSolution.multimeterReading.warningMessage,
      circuitSolution.nodeVoltages,
      faults,
      circuitSolution.activeDTCs,
      pins,
      activeTroubleScenarioId,
    ],
  );

  const currentLookupScenario = useMemo(
    () =>
      getIndexedScenarioByPhId(activeLookupPhId) ??
      PH_BENCH_TROUBLE_SCENARIOS[0],
    [activeLookupPhId],
  );

  const handleToggleLookupStepCompleted = useCallback(
    (phId: string, stepIndex: number, forceCompleted?: boolean) => {
      const normalizedPh = phId.trim().toUpperCase();
      setCompletedLookupStepsByPhId((prev) => {
        const existing = prev[normalizedPh] ?? [];
        const isAlready = existing.includes(stepIndex);
        const shouldBeCompleted =
          typeof forceCompleted === "boolean" ? forceCompleted : !isAlready;
        if (shouldBeCompleted) {
          if (isAlready) return prev;
          return {
            ...prev,
            [normalizedPh]: [...existing, stepIndex].sort((a, b) => a - b),
          };
        }
        if (!isAlready) return prev;
        return {
          ...prev,
          [normalizedPh]: existing.filter((idx) => idx !== stepIndex),
        };
      });
    },
    [],
  );

  const handleVoiceOpenTroubleLookup = useCallback(
    (rawQuery?: string) => {
      openLookupDrawer();
      if (rawQuery && rawQuery.trim()) {
        const cleanQ = rawQuery.trim();
        setLookupInitialQuery(cleanQ);
        const exactPh = cleanQ.match(/\b(PH-\d{3,4})\b/i);
        const matched = exactPh
          ? getIndexedScenarioByPhId(exactPh[1].toUpperCase())
          : searchTroubleScenariosRanked({ query: cleanQ })[0];
        if (matched) {
          setActiveLookupPhId(matched.phId);
          setActiveLookupStepIndex(0);
          const evalCoach = evaluateScenarioVoiceCoach(
            matched,
            0,
            lookupBenchState,
          );
          return {
            actionDescription: `Opened Trouble Scenarios Lookup: ${matched.phId} (${evalCoach.cleanTitle})`,
            spokenReply: `Opened trouble scenario ${matched.phId}: ${evalCoach.cleanTitle}. ${evalCoach.spokenStepGuidance}`,
            scenarioPhId: matched.phId,
            scenarioStepNumber: 1,
            guidanceKind: "BRIEFING" as const,
          };
        }
      }
      const evalCoach = evaluateScenarioVoiceCoach(
        currentLookupScenario,
        activeLookupStepIndex,
        lookupBenchState,
      );
      return {
        actionDescription: `Opened Trouble Scenarios Lookup (${currentLookupScenario.phId})`,
        spokenReply: `Trouble scenarios lookup open on ${currentLookupScenario.phId}: ${evalCoach.cleanTitle}. ${evalCoach.spokenStepGuidance}`,
        scenarioPhId: currentLookupScenario.phId,
        scenarioStepNumber: evalCoach.stepIndex + 1,
        guidanceKind: "BRIEFING" as const,
      };
    },
    [
      openLookupDrawer,
      lookupBenchState,
      currentLookupScenario,
      activeLookupStepIndex,
    ],
  );

  const handleVoiceEmulateTroubleScenario = useCallback(
    (targetPhId?: string) => {
      const scenario = targetPhId
        ? getIndexedScenarioByPhId(targetPhId.toUpperCase()) ??
          currentLookupScenario
        : currentLookupScenario;
      setActiveLookupPhId(scenario.phId);
      setActiveLookupStepIndex(0);
      handleApplyTroubleScenario(scenario);
      const evalCoach = evaluateScenarioVoiceCoach(scenario, 0, {
        ...lookupBenchState,
        activeScenarioId: scenario.id,
      });
      return {
        actionDescription: `Emulated ${scenario.phId} (${evalCoach.cleanTitle}) on 16-Pin Bench · Red Probe on ${scenario.focusPinLabel}`,
        spokenReply: `Emulating ${scenario.phId}: ${evalCoach.cleanTitle} on the 16-pin bench. Red probe attached to ${scenario.focusPinLabel}. ${evalCoach.spokenStepGuidance}`,
        scenarioPhId: scenario.phId,
        scenarioStepNumber: 1,
        guidanceKind: "BENCH_ACTION" as const,
      };
    },
    [
      currentLookupScenario,
      handleApplyTroubleScenario,
      lookupBenchState,
    ],
  );

  const handleVoiceNextScenarioStep = useCallback(() => {
    const evalCurrent = evaluateScenarioVoiceCoach(
      currentLookupScenario,
      activeLookupStepIndex,
      lookupBenchState,
    );
    const nextIdx = Math.min(
      evalCurrent.totalSteps - 1,
      evalCurrent.stepIndex + 1,
    );
    setActiveLookupStepIndex(nextIdx);
    const evalNext = evaluateScenarioVoiceCoach(
      currentLookupScenario,
      nextIdx,
      lookupBenchState,
    );
    return {
      actionDescription: `${currentLookupScenario.phId} · Step ${evalNext.stepIndex + 1}/${evalNext.totalSteps}: ${evalNext.currentStepText}`,
      spokenReply: evalNext.spokenStepGuidance,
      scenarioPhId: currentLookupScenario.phId,
      scenarioStepNumber: evalNext.stepIndex + 1,
      guidanceKind: "STEP_GUIDANCE" as const,
    };
  }, [currentLookupScenario, activeLookupStepIndex, lookupBenchState]);

  const handleVoicePrevScenarioStep = useCallback(() => {
    const evalCurrent = evaluateScenarioVoiceCoach(
      currentLookupScenario,
      activeLookupStepIndex,
      lookupBenchState,
    );
    const prevIdx = Math.max(0, evalCurrent.stepIndex - 1);
    setActiveLookupStepIndex(prevIdx);
    const evalPrev = evaluateScenarioVoiceCoach(
      currentLookupScenario,
      prevIdx,
      lookupBenchState,
    );
    return {
      actionDescription: `${currentLookupScenario.phId} · Step ${evalPrev.stepIndex + 1}/${evalPrev.totalSteps}: ${evalPrev.currentStepText}`,
      spokenReply: evalPrev.spokenStepGuidance,
      scenarioPhId: currentLookupScenario.phId,
      scenarioStepNumber: evalPrev.stepIndex + 1,
      guidanceKind: "STEP_GUIDANCE" as const,
    };
  }, [currentLookupScenario, activeLookupStepIndex, lookupBenchState]);

  const handleVoiceRepeatScenarioStep = useCallback(
    (stepNumber?: number) => {
      const targetIdx =
        typeof stepNumber === "number" && stepNumber >= 1
          ? stepNumber - 1
          : activeLookupStepIndex;
      const evalTarget = evaluateScenarioVoiceCoach(
        currentLookupScenario,
        targetIdx,
        lookupBenchState,
      );
      setActiveLookupStepIndex(evalTarget.stepIndex);
      return {
        actionDescription: `${currentLookupScenario.phId} · Step ${evalTarget.stepIndex + 1}/${evalTarget.totalSteps}: ${evalTarget.currentStepText}`,
        spokenReply: evalTarget.spokenStepGuidance,
        scenarioPhId: currentLookupScenario.phId,
        scenarioStepNumber: evalTarget.stepIndex + 1,
        guidanceKind: "STEP_GUIDANCE" as const,
      };
    },
    [currentLookupScenario, activeLookupStepIndex, lookupBenchState],
  );

  const handleVoiceCompleteScenarioStep = useCallback(
    (stepNumber?: number) => {
      const steps = splitDiagnosticSteps(currentLookupScenario.diagnosticSteps);
      const targetIdx =
        typeof stepNumber === "number" && stepNumber >= 1
          ? stepNumber - 1
          : activeLookupStepIndex;
      const evalTarget = evaluateScenarioVoiceCoach(
        currentLookupScenario,
        targetIdx,
        lookupBenchState,
      );
      const clampedIdx = evalTarget.stepIndex;
      setActiveLookupStepIndex(clampedIdx);

      const normalizedPh = currentLookupScenario.phId.toUpperCase();
      const existingCompleted = completedLookupStepsByPhId[normalizedPh] ?? [];
      const nextCompletedSet = new Set([...existingCompleted, clampedIdx]);
      const allCompleted = nextCompletedSet.size >= evalTarget.totalSteps;

      handleToggleLookupStepCompleted(normalizedPh, clampedIdx, true);

      const nextIncompleteIdx = steps.findIndex(
        (_, idx) => idx > clampedIdx && !nextCompletedSet.has(idx),
      );
      const fallbackIncompleteIdx =
        nextIncompleteIdx >= 0
          ? nextIncompleteIdx
          : steps.findIndex((_, idx) => !nextCompletedSet.has(idx));

      const confirmation = offlineVoiceAssistant.confirmStepCompleted({
        phId: normalizedPh,
        stepNumber: clampedIdx + 1,
        totalSteps: evalTarget.totalSteps,
        stepText: evalTarget.currentStepText,
        allCompleted,
        nextStepNumber:
          fallbackIncompleteIdx >= 0 ? fallbackIncompleteIdx + 1 : undefined,
        nextStepText:
          fallbackIncompleteIdx >= 0 ? steps[fallbackIncompleteIdx] : undefined,
        dmmReadingText: evalTarget.dmmReadingText,
        recordLog: false,
      });

      return {
        actionDescription: confirmation.actionDescription,
        spokenReply: confirmation.spokenReply,
        scenarioPhId: normalizedPh,
        scenarioStepNumber: clampedIdx + 1,
        guidanceKind: "STEP_COMPLETED" as const,
        alreadySpoken: true,
      };
    },
    [
      currentLookupScenario,
      activeLookupStepIndex,
      lookupBenchState,
      completedLookupStepsByPhId,
      handleToggleLookupStepCompleted,
    ],
  );

  const handleVoiceVerifyScenarioStep = useCallback(() => {
    const evalCoach = evaluateScenarioVoiceCoach(
      currentLookupScenario,
      activeLookupStepIndex,
      lookupBenchState,
    );
    if (evalCoach.isStepVerified) {
      const normalizedPh = currentLookupScenario.phId.toUpperCase();
      const existingCompleted = completedLookupStepsByPhId[normalizedPh] ?? [];
      const nextCompletedCount = existingCompleted.includes(evalCoach.stepIndex)
        ? existingCompleted.length
        : existingCompleted.length + 1;
      handleToggleLookupStepCompleted(normalizedPh, evalCoach.stepIndex, true);
      offlineVoiceAssistant.playStepCompleteChime(
        nextCompletedCount >= evalCoach.totalSteps,
      );
    }
    return {
      actionDescription: `${currentLookupScenario.phId} Step ${evalCoach.stepIndex + 1} Verification [${evalCoach.verdictBadgeLabel}]: ${evalCoach.coachingHeadline}`,
      spokenReply: evalCoach.isStepVerified
        ? `${evalCoach.spokenVerificationReply} Step ${evalCoach.stepIndex + 1} marked complete.`
        : evalCoach.spokenVerificationReply,
      scenarioPhId: currentLookupScenario.phId,
      scenarioStepNumber: evalCoach.stepIndex + 1,
      guidanceKind: "VERIFICATION" as const,
    };
  }, [
    currentLookupScenario,
    activeLookupStepIndex,
    lookupBenchState,
    completedLookupStepsByPhId,
    handleToggleLookupStepCompleted,
  ]);

  const handleVoiceProbeScenarioFocusPin = useCallback(() => {
    handleFocusProbePin(
      currentLookupScenario.focusPinId,
      currentLookupScenario.focusPinLabel,
      false,
    );
    return {
      actionDescription: `Attached Red (+) DMM Probe to ${currentLookupScenario.focusPinLabel} for ${currentLookupScenario.phId}`,
      spokenReply: `Attached red multimeter probe to ${currentLookupScenario.focusPinLabel} for ${currentLookupScenario.phId}. Expected reading: ${currentLookupScenario.expectedProbeOutcome}.`,
      scenarioPhId: currentLookupScenario.phId,
      scenarioStepNumber: activeLookupStepIndex + 1,
      guidanceKind: "BENCH_ACTION" as const,
    };
  }, [currentLookupScenario, activeLookupStepIndex, handleFocusProbePin]);
  const vehicleContext = useMemo(
    () =>
      getSelectedVehicleContext(
        selectedBrandKey || UNIVERSAL_BRAND_KEY,
        selectedModelName || "Generic 16-Pin Bench",
        selectedEcuProfileId ?? null,
      ),
    [selectedBrandKey, selectedModelName, selectedEcuProfileId],
  );
  const activeProfileLabel =
    vehicleContext.brandKey === UNIVERSAL_BRAND_KEY
      ? "Universal 16-Pin"
      : vehicleContext.modelName;
  const layoutTier: WorkspaceLayoutTier =
    containerSize.width < 768
      ? "COMPACT_MOBILE"
      : containerSize.width < 1024
        ? "TABLET_SPLIT"
        : containerSize.width < 1360
          ? "COMPACT_DESKTOP"
          : "WIDE_DESKTOP";
  const isCompactDesktop = layoutTier === "COMPACT_DESKTOP";
  const isShortContainer =
    containerSize.height > 0 && containerSize.height < 700;

  // Updaters are pure. Audio and announcements run only after committed state changes.
  const voiceLogOpen = props.isVoiceLogOpen ?? internalVoiceLogOpen;
  const setVoiceLogOpen = useCallback(
    (open: boolean) => {
      if (props.onSetVoiceLogOpen) {
        props.onSetVoiceLogOpen(open);
      } else if (props.onToggleVoiceLog) {
        if (open !== voiceLogOpen) props.onToggleVoiceLog();
      } else {
        setInternalVoiceLogOpen(open);
      }
    },
    [props, voiceLogOpen],
  );
  const toggleVoiceLog = useCallback(() => {
    if (props.onToggleVoiceLog) {
      props.onToggleVoiceLog();
    } else if (props.onSetVoiceLogOpen) {
      props.onSetVoiceLogOpen(!voiceLogOpen);
    } else {
      setInternalVoiceLogOpen((previous) => !previous);
    }
  }, [props, voiceLogOpen]);
  const openVoiceLog = useCallback(() => {
    setVoiceSidebarSection("LOG");
    setVoiceLogOpen(true);
  }, [setVoiceLogOpen]);
  const openVoiceMacros = useCallback(() => {
    setVoiceSidebarSection("MACROS");
    setVoiceLogOpen(true);
  }, [setVoiceLogOpen]);
  const openDiagnosticWorkflowPanel = useCallback(() => {
    onNavigateTab("BENCH_LAB");
    props.onChangeDiagnosticPanelMode?.("WORKFLOW");
    onSetShowDiagnosticGuide(true);
    onChangeMobileBenchPane("GUIDE");
  }, [onNavigateTab, props, onSetShowDiagnosticGuide, onChangeMobileBenchPane]);
  const openLogicCheckPanel = useCallback(() => {
    onNavigateTab("BENCH_LAB");
    props.onChangeDiagnosticPanelMode?.("LOGIC_CHECK");
    onSetShowDiagnosticGuide(true);
    onChangeMobileBenchPane("GUIDE");
  }, [onNavigateTab, props, onSetShowDiagnosticGuide, onChangeMobileBenchPane]);
  const closeVoiceLog = useCallback(() => setVoiceLogOpen(false), [setVoiceLogOpen]);

  useEffect(() => {
    const unsubState = offlineVoiceAssistant.subscribe(setVoiceState);
    const unsubHistory = offlineVoiceAssistant.subscribeHistory(setVoiceHistory);
    return () => {
      unsubState();
      unsubHistory();
    };
  }, []);

  const handleSidebarToggleListening = useCallback(() => {
    if (!isVoiceAssistantActive) {
      setIsVoiceAssistantActive(true);
      offlineVoiceAssistant.setAutoSpeak(true);
    }
    if (voiceState.isListening) {
      offlineVoiceAssistant.stopListening();
      return;
    }
    offlineVoiceAssistant.startListening(
      (spokenText, meta) =>
        voiceExecutorRef.current?.(spokenText, "SPEECH_API", meta),
      { continuous: voiceState.continuousMode },
    );
  }, [
    isVoiceAssistantActive,
    voiceState.isListening,
    voiceState.continuousMode,
  ]);

  const handleSidebarToggleContinuousMode = useCallback(() => {
    const nextContinuous = !voiceState.continuousMode;
    offlineVoiceAssistant.setContinuousMode(nextContinuous);
    if (voiceState.isListening) {
      offlineVoiceAssistant.stopListening();
      offlineVoiceAssistant.startListening(
        (spokenText, meta) =>
          voiceExecutorRef.current?.(spokenText, "SPEECH_API", meta),
        { continuous: nextContinuous },
      );
    }
  }, [voiceState.continuousMode, voiceState.isListening]);

  const toggleVoice = useCallback((nextState?: boolean) => {
    setIsVoiceAssistantActive((previous) =>
      typeof nextState === "boolean" ? nextState : !previous,
    );
  }, []);
  useEffect(() => {
    if (previousVoiceState.current === isVoiceAssistantActive) return;
    previousVoiceState.current = isVoiceAssistantActive;
    if (rpmEmulator?.soundEnabled !== false) {
      try {
        playModuleActivationSound(isVoiceAssistantActive, "sensor");
      } catch (error) {
        if (import.meta.env.DEV)
          console.warn("Activation audio unavailable:", error);
      }
    }
    setVoiceAnnouncement(
      isVoiceAssistantActive
        ? "Offline AI voice assistant activated."
        : "Offline AI voice assistant paused.",
    );
  }, [isVoiceAssistantActive, rpmEmulator?.soundEnabled]);
  useEffect(() => {
    if (previousOpacity.current === voiceFloatingOpacity) return;
    previousOpacity.current = voiceFloatingOpacity;
    setVoiceAnnouncement(
      `Voice control opacity set to ${Math.round(voiceFloatingOpacity * 100)} percent.`,
    );
  }, [voiceFloatingOpacity]);
  const movePane = useCallback(
    (pane: MobileBenchPane, direction: "prev" | "next") => {
      setPaneOrder((previous) => {
        const index = previous.indexOf(pane);
        const target = index + (direction === "prev" ? -1 : 1);
        if (index < 0 || target < 0 || target >= previous.length)
          return previous;
        const next = [...previous];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      });
    },
    [],
  );
  const resetPaneOrder = useCallback(
    () => setPaneOrder([...DEFAULT_PANE_ORDER]),
    [],
  );
  const selectMobilePane = useCallback(
    (pane: MobileBenchPane) => {
      if (pane === "GUIDE") onSetShowDiagnosticGuide(true);
      onChangeMobileBenchPane(pane);
    },
    [onSetShowDiagnosticGuide, onChangeMobileBenchPane],
  );
  const returnToBench = useCallback(() => {
    setShowPinScopeOverlay(false);
    onNavigateTab("BENCH_LAB");
  }, [onNavigateTab]);
  const closeGuide = useCallback(() => {
    onSetShowDiagnosticGuide(false);
    onChangeMobileBenchPane("INSTRUMENTS");
  }, [onSetShowDiagnosticGuide, onChangeMobileBenchPane]);
  const openFullScope = useCallback(() => {
    setShowPinScopeOverlay(false);
    setOscilloscopeViewMode("RECHARTS_PIN");
    onNavigateTab("OSCILLOSCOPE");
  }, [onNavigateTab]);
  const closePinOverlay = useCallback(() => setShowPinScopeOverlay(false), []);

  useEffect(() => {
    if (
      activeTab !== "BENCH_LAB" &&
      activeTab !== "WIRING_DIAGRAM" &&
      activeTab !== "OSCILLOSCOPE"
    ) {
      setShowPinScopeOverlay(false);
    }
  }, [activeTab]);

  // One prop contract for all harness instances: fixes the missing pinout action in scope split view.
  const canvasProps = useMemo(
    () => ({
      pins,
      wires,
      components,
      nodeVoltages: circuitSolution.nodeVoltages,
      wireCurrentsMa: circuitSolution.wireCurrentsMa,
      faults,
      activeDTCs: circuitSolution.activeDTCs,
      isSupplyTripped: circuitSolution.isSupplyCurrentTripped,
      rpmEmulator,
      gaugeTransportMode: gaugeMonitor?.transportMode ?? ("STOPPED" as const),
      selectedPinId,
      onSelectPin,
      onAddWire,
      onToggleCutWire,
      onDeleteWire,
      onRenameWire,
      onAddFault,
      onRemoveFault,
      onClearAllFaults,
      multimeter,
      onAttachProbe,
      onUpdateComponentState,
      isPowerOn: powerSupply.isOutputEnabled,
      onOpenEcuPinouts,
      simulationSpeed,
      ecuProfileLabel: activeProfileLabel,
      hasInjectorFault,
      onAddComponent,
      onDeleteComponent,
      onUpdateComponentPosition,
    }),
    [
      pins,
      wires,
      components,
      circuitSolution.nodeVoltages,
      circuitSolution.wireCurrentsMa,
      faults,
      circuitSolution.activeDTCs,
      circuitSolution.isSupplyCurrentTripped,
      rpmEmulator,
      gaugeMonitor?.transportMode,
      selectedPinId,
      onSelectPin,
      onAddWire,
      onToggleCutWire,
      onDeleteWire,
      onRenameWire,
      onAddFault,
      onRemoveFault,
      onClearAllFaults,
      multimeter,
      onAttachProbe,
      onUpdateComponentState,
      powerSupply.isOutputEnabled,
      onOpenEcuPinouts,
      simulationSpeed,
      activeProfileLabel,
      hasInjectorFault,
      onAddComponent,
      onDeleteComponent,
      onUpdateComponentPosition,
    ],
  );
  const pinScopeProps = useMemo(
    () => ({
      pins,
      selectedPinId,
      onSelectPin,
      nodeVoltages: circuitSolution.nodeVoltages,
      faults,
      isPowerOn: powerSupply.isOutputEnabled,
      hasCanFault,
      hasInjectorFault,
      isInjectorFiring,
      ckpSignalLost: isCkpSignalLost,
      rpm: activeScopeRpm,
      simulationSpeed,
    }),
    [
      pins,
      selectedPinId,
      onSelectPin,
      circuitSolution.nodeVoltages,
      faults,
      powerSupply.isOutputEnabled,
      hasCanFault,
      hasInjectorFault,
      isInjectorFiring,
      isCkpSignalLost,
      activeScopeRpm,
      simulationSpeed,
    ],
  );
  const moveControls = (pane: MobileBenchPane) => {
    if (!isContainerMoveMode) return null;
    const index = paneOrder.indexOf(pane);
    return (
      <div
        role="group"
        aria-label={`Reorder ${PANEL_LABELS[pane]}`}
        className="flex shrink-0 items-center justify-between gap-2 rounded-md border border-amber-500/60 bg-[#1c1507] px-2.5 py-1 text-[10px] font-mono text-amber-200"
      >
        <span className="truncate font-bold">
          Move: {PANEL_LABELS[pane]} (#{index + 1})
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {(["prev", "next"] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              onClick={() => movePane(pane, direction)}
              disabled={
                direction === "prev"
                  ? index === 0
                  : index === paneOrder.length - 1
              }
              aria-label={`Move ${PANEL_LABELS[pane]} ${direction === "prev" ? "earlier" : "later"}`}
              className="hw-btn min-h-[32px] min-w-[32px] rounded-md px-2 disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 cursor-pointer"
            >
              {direction === "prev" ? "←" : "→"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setIsContainerMoveMode(false)}
            className="hw-btn hw-btn-amber min-h-[32px] rounded-md px-2.5 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    );
  };
  const module = (label: string, content: React.ReactNode, suffix = "") => (
    <LazyModule
      label={label}
      resetKey={`${activeTab}:${suffix}`}
      onReturnToBench={returnToBench}
    >
      {content}
    </LazyModule>
  );
  const fullPaneClass = "flex-1 min-h-0 min-w-0 flex overflow-hidden w-full";
  const isEmbeddedPinScope =
    activeTab === "OSCILLOSCOPE" &&
    (oscilloscopeViewMode === "RECHARTS_PIN" ||
      oscilloscopeViewMode === "BINARY_MONITOR");

  return (
    <main
      ref={attachMain}
      data-layout-tier={layoutTier}
      data-container-size={`${containerSize.width}x${containerSize.height}`}
      aria-label="Virtual ECU laboratory workspace"
      className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 lg:gap-2 overflow-hidden p-1.5 sm:p-2 lg:px-3 lg:py-2"
    >
      <span className="sr-only" role="status" aria-live="polite">
        {voiceAnnouncement}
      </span>
      {activeTab === "BENCH_LAB" && (
        <section
          aria-label="Bench Lab trouble scenario emulator and pulse monitor"
          className={`hud-panel flex shrink-0 flex-wrap lg:flex-nowrap items-center justify-between gap-2 rounded-xl border px-2.5 lg:px-3 py-1.5 text-[11px] font-mono ${
            benchPulseEval.headlineStatus === "ALL_SIGNALS_ACTIVE"
              ? "border-[#203653]"
              : !benchPulseEval.isPsuOn && faults.length === 0 && cutWireCount === 0 && !isCkpSignalLost
                ? "border-[#ffb020]/45 bg-[#191509]/70"
                : "border-[#ff4d62]/55 bg-[#200c14]/70"
          }`}
        >
          <div className="flex min-w-0 flex-1 flex-wrap lg:flex-nowrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsTroubleDrawerOpen(true)}
              aria-expanded={isTroubleDrawerOpen}
              className={`hw-btn inline-flex min-h-[36px] lg:min-h-[32px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide whitespace-nowrap cursor-pointer ${
                benchPulseEval.headlineStatus === "ALL_SIGNALS_ACTIVE"
                  ? "hw-btn-blue"
                  : !benchPulseEval.isPsuOn && faults.length === 0 && cutWireCount === 0 && !isCkpSignalLost
                    ? "hw-btn-amber"
                    : "border-[#ff4d62]/70 bg-rose-950/75 text-rose-100 hover:bg-rose-900/75"
              }`}
            >
              <LabDrawerIcon name="trouble-drawer" size={24} className="h-3.5 w-3.5 shrink-0" />
              <span>Trouble Scenarios</span>
              {faults.length > 0 && (
                <span className="rounded bg-black/40 px-1.5 py-0.5 text-[9.5px] tabular-nums">
                  {faults.length} Fault{faults.length === 1 ? "" : "s"}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsFaultBuilderOpen(true)}
              className="hw-btn hw-btn-blue inline-flex min-h-[36px] lg:min-h-[32px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide whitespace-nowrap cursor-pointer"
            >
              <Layers className="h-3.5 w-3.5 text-[#19c8f5] shrink-0" aria-hidden="true" />
              <span>Fault Builder</span>
            </button>

            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tabular-nums whitespace-nowrap ${
                benchPulseEval.headlineStatus === "ALL_SIGNALS_ACTIVE"
                  ? "border-[#20d889]/45 bg-[#08241b]/80 text-[#20d889]"
                  : !benchPulseEval.isPsuOn && faults.length === 0 && cutWireCount === 0 && !isCkpSignalLost
                    ? "border-[#ffb020]/50 bg-[#241a08]/80 text-[#ffb020]"
                    : "border-[#ff4d62]/60 bg-[#290c16]/85 text-[#ff8a99]"
              }`}
            >
              <LabDrawerIcon
                name={benchPulseEval.headlineStatus === "ALL_SIGNALS_ACTIVE" ? "status-ok" : "status-fault"}
                size={24}
                className="h-3.5 w-3.5 shrink-0"
              />
              <span>
                {benchPulseEval.headlineStatus === "ALL_SIGNALS_ACTIVE"
                  ? `PULSES ACTIVE (${benchPulseEval.injectorPulse.freqHz.toFixed(1)} Hz)`
                  : !benchPulseEval.isPsuOn && faults.length === 0 && cutWireCount === 0 && !isCkpSignalLost
                    ? "PSU STANDBY · 0.0 Hz"
                    : "NO PULSE / NO SIGNAL · 0.0 Hz"}
              </span>
            </span>

            <span
              className={`min-w-0 truncate text-[10.5px] ${
                benchPulseEval.headlineStatus === "ALL_SIGNALS_ACTIVE"
                  ? "text-[#91a4bd]"
                  : !benchPulseEval.isPsuOn && faults.length === 0 && cutWireCount === 0 && !isCkpSignalLost
                    ? "text-[#ffe29e]"
                    : "font-semibold text-rose-200"
              }`}
              title={benchPulseEval.headlineDetail}
            >
              {benchPulseEval.headlineTitle}
            </span>
          </div>

          <div className="flex shrink-0 flex-wrap lg:flex-nowrap items-center gap-1.5 text-[10px]">
            <span
              className={`hidden sm:inline-flex items-center rounded-md border px-2 py-1 tabular-nums whitespace-nowrap ${
                benchPulseEval.isBatteryKl30Ok
                  ? "border-[#20d889]/35 bg-[#082119]/60 text-[#20d889]"
                  : benchPulseEval.isPsuOn
                    ? "border-[#ff4d62]/55 bg-[#290c16]/75 text-rose-200 font-bold"
                    : "border-[#203653] bg-[#0a1220] text-[#91a4bd]"
              }`}
            >
              KL30 {benchPulseEval.kl30Volts.toFixed(1)}V
            </span>
            <span
              className={`hidden sm:inline-flex items-center rounded-md border px-2 py-1 tabular-nums whitespace-nowrap ${
                benchPulseEval.isIgnitionKl15Ok
                  ? "border-[#20d889]/35 bg-[#082119]/60 text-[#20d889]"
                  : benchPulseEval.isPsuOn
                    ? "border-[#ff4d62]/55 bg-[#290c16]/75 text-rose-200 font-bold"
                    : "border-[#203653] bg-[#0a1220] text-[#91a4bd]"
              }`}
            >
              KL15 {benchPulseEval.kl15Volts.toFixed(1)}V
            </span>
            <button
              type="button"
              onClick={() => setShowPinScopeOverlay(true)}
              className="hw-btn inline-flex min-h-[34px] lg:min-h-[32px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-[#19c8f5] hover:text-white whitespace-nowrap cursor-pointer"
            >
              <LabDrawerIcon name="active-drawer" size={24} className="h-3.5 w-3.5 shrink-0" />
              <span>Pulse Scope</span>
            </button>
            {(activeTroubleScenarioId || activeFaultSequence || faults.length > 0 || isCkpSignalLost || cutWireCount > 0) && (
              <button
                type="button"
                onClick={handleClearTroubleScenarios}
                className="hw-btn min-h-[34px] lg:min-h-[32px] rounded-lg border-[#20d889]/45 px-2.5 py-1 text-[#20d889] hover:text-emerald-100 whitespace-nowrap cursor-pointer"
              >
                Restore Nominal
              </button>
            )}
          </div>
        </section>
      )}
      {activeTab === "BENCH_LAB" && activeFaultSequence && activeSequenceFrame && (
        <section
          aria-label="Active custom fault sequence playback"
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-[#19c8f5]/45 bg-[#081526] px-3 py-1.5 font-mono text-[11px] text-[#eaf3ff]"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-[#19c8f5] shrink-0" aria-hidden="true" />
            <span className="font-bold text-[#19c8f5] truncate">
              {isSequenceBlindMode ? "Blind Reasoning Drill" : activeFaultSequence.title}
            </span>
            <span aria-hidden="true" className="text-[#567093]">·</span>
            <span className="tabular-nums text-[#d4e3f6]">
              Stage {activeSequenceFrame.activeStepIndex + 1}/{activeFaultSequence.steps.length}
              {!isSequenceBlindMode && `: ${activeSequenceFrame.activeStep.name}`}
            </span>
            <span aria-hidden="true" className="text-[#567093]">·</span>
            <span className="tabular-nums text-[#91a4bd]">
              {(activeSequenceFrame.stepElapsedMs / 1000).toFixed(1)}s / {(activeSequenceFrame.stepDurationMs / 1000).toFixed(0)}s
            </span>
            {!isSequenceBlindMode && activeSequenceFrame.activeSummaryItems.some((i) => i.mode === "INTERMITTENT_SIGNAL") && (
              <span className={activeSequenceFrame.intermittentEngaged ? "font-bold text-[#ff8a99]" : "text-[#20d889]"}>
                {activeSequenceFrame.intermittentEngaged ? "Pulse Fault Active" : "Clean Window"}
              </span>
            )}
            {sequenceEdgeHits > 0 && (
              <>
                <span aria-hidden="true" className="text-[#567093]">·</span>
                <span className="tabular-nums text-[#ffb020]">
                  Edges {sequenceEdgeHits}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsSequencePlaying((p) => !p)}
              className="hw-btn inline-flex min-h-[30px] items-center gap-1 rounded-md px-2 py-1 text-[10.5px] whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isSequencePlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              <span>{isSequencePlaying ? "Pause" : "Resume"}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                handleJumpFaultSequenceStage(
                  (activeSequenceFrame.activeStepIndex + 1) % activeFaultSequence.steps.length
                )
              }
              className="hw-btn inline-flex min-h-[30px] items-center gap-1 rounded-md px-2 py-1 text-[10.5px] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SkipForward className="h-3 w-3" aria-hidden="true" />
              <span>Next Stage</span>
            </button>
            <button
              type="button"
              onClick={() => setIsFaultBuilderOpen(true)}
              className="hw-btn hw-btn-blue inline-flex min-h-[30px] items-center gap-1 rounded-md px-2 py-1 text-[10.5px] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{isSequenceBlindMode ? "Check Diagnosis" : "Open Builder"}</span>
            </button>
            <button
              type="button"
              onClick={handleStopFaultSequence}
              className="hw-btn inline-flex min-h-[30px] items-center gap-1 rounded-md border-[#20d889]/45 px-2 py-1 text-[10.5px] text-[#20d889] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              <span>Stop</span>
            </button>
          </div>
        </section>
      )}
      {activeTab === "BENCH_LAB" && activeUniversityModule && (
        <Suspense fallback={null}>
          <UniversityLabGuidanceCard
            module={activeUniversityModule}
            ecuPins={pins}
            liveBench={{
              powerSupply,
              multimeter,
              multimeterReading: circuitSolution.multimeterReading,
              nodeVoltages: circuitSolution.nodeVoltages,
              faults,
              wires,
            }}
            capturedByStepId={activeCapturedStepsMap}
            onCaptureStep={handleCaptureUniversityStep}
            onFocusProbePin={handleFocusProbePin}
            onOpenVerifiedPdfExport={handleOpenUniversityPdfModal}
            onExitModule={() => setActiveUniversityModuleId(null)}
          />
        </Suspense>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden lg:flex-row lg:items-stretch lg:gap-2.5">
      <ModuleErrorBoundary
        label="Workspace view"
        resetKey={activeTab}
        onReturnToBench={returnToBench}
      >
        {activeTab === "BENCH_LAB" && (
          <>
            <nav
              aria-label="Mobile workspace panes"
              className="hud-panel flex shrink-0 items-center gap-1 rounded-xl p-1 text-[10.5px] font-mono lg:hidden"
            >
              {paneOrder.map((pane) => (
                <button
                  key={pane}
                  type="button"
                  aria-pressed={mobileBenchPane === pane}
                  onClick={() => selectMobilePane(pane)}
                  className={`min-h-[42px] min-w-0 flex-1 inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-1.5 sm:px-2.5 py-1.5 text-center uppercase tracking-wide sm:tracking-wider cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19c8f5] ${
                    mobileBenchPane === pane
                      ? "hw-btn-blue font-bold text-white"
                      : "border-transparent text-[#91a4bd] hover:text-[#eaf3ff]"
                  }`}
                >
                  {pane === "INSTRUMENTS" ? (
                    <>
                      <LabDrawerIcon name="cabinet" size={24} className="h-3.5 w-3.5 shrink-0" />
                      <span className="sm:hidden">
                        Rack ({circuitSolution.supplyCurrentDrawAmps.toFixed(1)}A)
                      </span>
                      <span className="hidden sm:inline">
                        Instruments ({circuitSolution.supplyCurrentDrawAmps.toFixed(1)}A)
                      </span>
                    </>
                  ) : pane === "GUIDE" ? (
                    <>
                      <LabDrawerIcon name="tray-stack" size={24} className="h-3.5 w-3.5 shrink-0" />
                      <span className="sm:hidden">
                        Guide ({circuitSolution.activeDTCs.length})
                      </span>
                      <span className="hidden sm:inline">
                        Workflow ({circuitSolution.activeDTCs.length} DTC)
                      </span>
                    </>
                  ) : (
                    <>
                      <LabDrawerIcon name="multi-comp" size={24} className="h-3.5 w-3.5 shrink-0" />
                      <span className="sm:hidden">Harness</span>
                      <span className="hidden sm:inline">Harness Canvas</span>
                    </>
                  )}
                </button>
              ))}
            </nav>
            {paneOrder.map((pane) => {
              if (pane === "INSTRUMENTS")
                return (
                  <React.Fragment key={pane}>
                    <InstrumentPanels
                      visibleOnMobile={mobileBenchPane === pane}
                      rackFilter={rackFilter}
                      onChangeRackFilter={onChangeRackFilter}
                      powerSupply={powerSupply}
                      onChangePowerSupply={onChangePowerSupply}
                      multimeter={multimeter}
                      onChangeMultimeter={onChangeMultimeter}
                      circuitSolution={circuitSolution}
                      pins={pins}
                      components={components}
                      wires={wires}
                      faults={faults}
                      selectedPinId={selectedPinId}
                      onSelectPin={onSelectPin}
                      onAddFault={onAddFault}
                      onRemoveFault={onRemoveFault}
                      onClearAllFaults={onClearAllFaults}
                      onSearchDtc={onSearchDtc}
                      selectedBrandKey={selectedBrandKey}
                      selectedModelName={selectedModelName}
                      selectedEcuProfileId={selectedEcuProfileId}
                      onSelectVehicleEcu={onSelectVehicleEcu}
                      onOpenEcuPinouts={onOpenEcuPinouts}
                      rpmEmulator={rpmEmulator}
                      onChangeRpmEmulator={onChangeRpmEmulator}
                      gaugeMonitor={gaugeMonitor}
                      onChangeGaugeMonitor={onChangeGaugeMonitor}
                      onUpdateComponentState={onUpdateComponentState}
                      manualRangeLabel={manualRangeLabel}
                      onClearManualRange={clearManualRange}
                      onSetManualRangeLabel={setManualRangeLabel}
                      onAttachProbe={onAttachProbe}
                      onAddWire={onAddWire}
                      onRunVoiceCommand={(transcript) =>
                        voiceExecutorRef.current?.(transcript, "QUICK_CHIP")
                      }
                      compactWidth={isCompactDesktop}
                      isShortViewport={isShortContainer}
                      moveControls={moveControls(pane)}
                      preBenchGateLocked={props.preBenchGateLocked}
                      preBenchGateBypassed={props.preBenchGateBypassed}
                      workflowCheckedIds={props.checkedWorkflowIds}
                      onBypassPreBenchGate={props.onBypassPreBenchGate}
                      onOpenWorkflowPanel={openDiagnosticWorkflowPanel}
                      pinoutSafetyEvaluation={props.pinoutSafetyEvaluation}
                      selectedVehicleStatus={props.selectedVehicleStatus}
                      onConfirmOcrVehicleBench={props.onConfirmOcrVehicleBench}
                      onOpenVoiceMacroLibrary={props.onOpenVoiceMacroLibrary}
                      onOpenOfflineBot={onOpenOfflineBot}
                      onOpenGroundedSearch={onOpenGroundedSearch}
                      onOpenLookupDrawer={openLookupDrawer}
                      onOpenWiringTab={() => onNavigateTab("WIRING_DIAGRAM")}
                      onOpenFaultBuilder={() => setIsFaultBuilderOpen(true)}
                    />
                  </React.Fragment>
                );
              if (pane === "CANVAS")
                return (
                  <section
                    key={pane}
                    id={paneId(pane)}
                    aria-label="Bench harness and 3D EMS viewport"
                    className={`min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-hidden ${mobileBenchPane === pane ? "flex" : "hidden lg:flex"}`}
                  >
                    {moveControls(pane)}
                    {/* Compact BENCH_LAB Center Workspace Mode Bar (2D Harness | Split 2D+3D | 3D EMS) */}
                    <div className="flex items-center justify-between gap-2 rounded-[3px] border border-[#203653] bg-[#0a1322] px-2 py-1 shrink-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-hud text-[10px] font-bold uppercase tracking-wider text-[#91a4bd] truncate">
                          Bench Stage
                        </span>
                        <span className="hidden sm:inline text-[9.5px] font-mono text-sky-300/90 truncate">
                          {activeProfileLabel}
                        </span>
                      </div>
                      <div
                        role="group"
                        aria-label="Bench viewport layout mode"
                        className="flex items-center gap-1 bg-[#050a12] p-0.5 rounded-[2px] border border-[#203653]"
                      >
                        <button
                          type="button"
                          onClick={() => setBenchViewportMode("2D_HARNESS")}
                          aria-pressed={benchViewportMode === "2D_HARNESS"}
                          className={`hw-btn px-2 py-0.5 rounded-[2px] text-[10px] font-mono flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                            benchViewportMode === "2D_HARNESS"
                              ? "hw-btn-amber font-bold"
                              : "text-slate-300 hover:text-white"
                          }`}
                        >
                          <Network className="w-3 h-3" aria-hidden="true" />
                          <span>2D Harness</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setBenchViewportMode("SPLIT")}
                          aria-pressed={benchViewportMode === "SPLIT"}
                          className={`hw-btn px-2 py-0.5 rounded-[2px] text-[10px] font-mono flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                            benchViewportMode === "SPLIT"
                              ? "hw-btn-green font-bold"
                              : "text-slate-300 hover:text-white"
                          }`}
                        >
                          <Columns2 className="w-3 h-3" aria-hidden="true" />
                          <span>Split 2D+3D</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setBenchViewportMode("3D_EMS")}
                          aria-pressed={benchViewportMode === "3D_EMS"}
                          className={`hw-btn px-2 py-0.5 rounded-[2px] text-[10px] font-mono flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                            benchViewportMode === "3D_EMS"
                              ? "hw-btn-amber font-bold"
                              : "text-slate-300 hover:text-white"
                          }`}
                        >
                          <Box className="w-3 h-3" aria-hidden="true" />
                          <span>3D EMS</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
                      {benchViewportMode !== "2D_HARNESS" && (
                        <div
                          className={`min-h-0 flex flex-col overflow-hidden ${
                            benchViewportMode === "SPLIT" ? "flex-[1.08]" : "flex-1"
                          }`}
                        >
                          {module(
                            "3D EMS Viewport",
                            <ThreeDViewport
                              compact={benchViewportMode === "SPLIT"}
                              pins={pins}
                              wires={wires}
                              components={components}
                              faults={faults}
                              activeDTCs={circuitSolution.activeDTCs}
                              nodeVoltages={circuitSolution.nodeVoltages}
                              wireCurrentsMa={circuitSolution.wireCurrentsMa}
                              supplyCurrentDrawAmps={
                                circuitSolution.supplyCurrentDrawAmps
                              }
                              isSupplyCurrentTripped={
                                circuitSolution.isSupplyCurrentTripped
                              }
                              multimeter={multimeter}
                              powerSupply={powerSupply}
                              selectedPinId={selectedPinId}
                              simulationSpeed={simulationSpeed}
                              rpmEmulator={rpmEmulator}
                              gaugeMonitor={gaugeMonitor}
                              vehicleContext={vehicleContext}
                              selectedEcuProfileId={selectedEcuProfileId}
                              twinSyncMode={twinSyncMode}
                              onToggleTwinSyncMode={onToggleTwinSyncMode}
                              onSelectPin={onSelectPin}
                              onAttachProbe={onAttachProbe}
                              onToggleIgnition={() =>
                                onChangePowerSupply((prev) => ({
                                  ...prev,
                                  isOutputEnabled: !prev.isOutputEnabled,
                                }))
                              }
                              onExpandFullView={() =>
                                onNavigateTab("THREE_D_TWIN")
                              }
                              onOpenVoiceGuide={props.onOpenAiCoach}
                              voiceActionRequest={props.benchVoiceActionRequest}
                            />,
                          )}
                        </div>
                      )}
                      {benchViewportMode !== "3D_EMS" && (
                        <div
                          className={`min-h-0 flex flex-col overflow-hidden ${
                            benchViewportMode === "SPLIT" ? "flex-[0.92]" : "flex-1"
                          }`}
                        >
                          <WiringCanvas {...canvasProps} />
                        </div>
                      )}
                    </div>
                  </section>
                );
              return (
                <React.Fragment key={pane}>
                  <ECUDiagnosticView
                    visibleOnMobile={mobileBenchPane === pane}
                    isOpen={showDiagnosticGuide || mobileBenchPane === pane}
                    onClose={closeGuide}
                    powerSupply={powerSupply}
                    pins={pins}
                    wires={wires}
                    faults={faults}
                    components={components}
                    circuitSolution={circuitSolution}
                    multimeter={multimeter}
                    selectedPinId={selectedPinId}
                    onSelectPin={onSelectPin}
                    onNavigateTab={onNavigateTab}
                    onOpenOfflineBot={onOpenOfflineBot}
                    compactWidth={isCompactDesktop}
                    isShortViewport={isShortContainer}
                    moveControls={moveControls(pane)}
                    ecuProfileLabel={activeProfileLabel}
                    diagnosticPanelMode={props.diagnosticPanelMode}
                    onChangeDiagnosticPanelMode={props.onChangeDiagnosticPanelMode}
                    checkedWorkflowIds={props.checkedWorkflowIds}
                    onChangeCheckedWorkflowIds={props.onChangeCheckedWorkflowIds}
                    preBenchGateLocked={props.preBenchGateLocked}
                    preBenchGateBypassed={props.preBenchGateBypassed}
                    onTogglePreBenchGate={props.onTogglePreBenchGate}
                    autoVerifyWorkflow={props.autoVerifyWorkflow}
                    onToggleAutoVerifyWorkflow={props.onToggleAutoVerifyWorkflow}
                    logicCheckSnapshot={props.logicCheckSnapshot}
                    logicCheckRules={props.logicCheckRules}
                    isLogicCheckArmed={props.isLogicCheckArmed}
                    logicCheckIncidents={props.logicCheckIncidents}
                    onToggleLogicCheckArmed={props.onToggleLogicCheckArmed}
                    onToggleLogicRuleEnabled={props.onToggleLogicRuleEnabled}
                    onUpdateLogicRuleThresholds={props.onUpdateLogicRuleThresholds}
                    onApplyLogicPreset={props.onApplyLogicPreset}
                    onResetLogicRules={props.onResetLogicRules}
                    onClearLogicIncidents={props.onClearLogicIncidents}
                    onAttachRedProbe={(pinId, label) =>
                      onAttachProbe("red", pinId, label)
                    }
                  />
                </React.Fragment>
              );
            })}
          </>
        )}
        {activeTab === "WIRING_DIAGRAM" && (
          <section
            aria-label="Expanded harness wiring canvas"
            className={`${fullPaneClass} flex-col`}
          >
            <WiringCanvas {...canvasProps} expandedDiagnosticsByDefault />
          </section>
        )}
        {activeTab === "THREE_D_TWIN" && (
          <section aria-label="3D ECU bench twin" className={fullPaneClass}>
            {module(
              "3D ECU Bench Twin",
              <ThreeBenchTwin
                pins={pins}
                wires={wires}
                components={components}
                faults={faults}
                activeDTCs={circuitSolution.activeDTCs}
                nodeVoltages={circuitSolution.nodeVoltages}
                wireCurrentsMa={circuitSolution.wireCurrentsMa}
                supplyCurrentDrawAmps={circuitSolution.supplyCurrentDrawAmps}
                isSupplyCurrentTripped={circuitSolution.isSupplyCurrentTripped}
                multimeter={multimeter}
                powerSupply={powerSupply}
                selectedPinId={selectedPinId}
                simulationSpeed={simulationSpeed}
                rpmEmulator={rpmEmulator}
                gaugeMonitor={gaugeMonitor}
                vehicleContext={vehicleContext}
                selectedEcuProfileId={selectedEcuProfileId}
                twinSyncMode={twinSyncMode}
                onToggleTwinSyncMode={onToggleTwinSyncMode}
                onSelectPin={onSelectPin}
                onAttachProbe={onAttachProbe}
                onUpdateComponentState={onUpdateComponentState}
                onToggleIgnition={() =>
                  onChangePowerSupply((prev) => ({
                    ...prev,
                    isOutputEnabled: !prev.isOutputEnabled,
                  }))
                }
                onOpenOfflineBot={onOpenOfflineBot}
                onOpenGroundedSearch={onOpenGroundedSearch}
                onOpenVoiceGuide={props.onOpenAiCoach}
                voiceActionRequest={props.benchVoiceActionRequest}
              />,
            )}
          </section>
        )}
        {activeTab === "ECU_PINOUT" && (
          <section
            aria-label="ECU connector pinout library"
            className={fullPaneClass}
          >
            {module(
              "ECU Pinouts Library",
              <EcuConnectorPinouts
                pins={pins}
                nodeVoltages={circuitSolution.nodeVoltages}
                selectedPinId={selectedPinId}
                onSelectPin={onSelectPin}
                multimeter={multimeter}
                onAttachProbe={onAttachProbe}
                powerSupply={powerSupply}
                externalBrandId={selectedEcuProfileId}
                onSearchLivePinout={(model) =>
                  onOpenGroundedSearch(
                    `${model} ECU bench pinout wiring diagram KL30 KL15 KL31 K-Line CAN`,
                    "",
                    model,
                  )
                }
              />,
            )}
          </section>
        )}
        {activeTab === "OSCILLOSCOPE" && (
          <section
            aria-label="Oscilloscope and harness split view"
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 overflow-y-auto sm:gap-3 lg:overflow-hidden"
          >
            <div className="hud-panel flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-[10px] font-mono sm:text-xs">
              <span className="hidden font-bold uppercase tracking-wider text-slate-400 sm:inline">
                Oscilloscope display mode
              </span>
              <div
                role="group"
                aria-label="Oscilloscope display mode"
                className="flex w-full flex-wrap gap-1.5 sm:w-auto"
              >
                {(["CRT", "D3_SCOPE", "RECHARTS_PIN", "BINARY_MONITOR"] as const).map(
                  (mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={oscilloscopeViewMode === mode}
                      onClick={() => {
                        setOscilloscopeViewMode(mode);
                        if (mode !== "CRT") setShowPinScopeOverlay(false);
                      }}
                      className={`hw-btn min-h-[38px] flex-1 rounded-md px-3 py-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 sm:flex-none cursor-pointer ${
                        oscilloscopeViewMode === mode
                          ? "hw-btn-blue"
                          : "text-slate-300 hover:text-white"
                      }`}
                    >
                      {mode === "CRT"
                        ? "2-CH CRT Storage Scope"
                        : mode === "D3_SCOPE"
                          ? "D3.js Storage Scope"
                          : mode === "RECHARTS_PIN"
                            ? "Selected Pin Trace (Recharts)"
                            : "Binary State Monitor (PWM / CAN)"}
                    </button>
                  ),
                )}
              </div>
            </div>
            <div className="min-w-0 shrink-0">
              {module(
                "Oscilloscope",
                oscilloscopeViewMode === "CRT" ? (
                  <Oscilloscope
                    isPowerOn={powerSupply.isOutputEnabled}
                    selectedSignal={hasCanFault ? "CAN_BUS" : "INJECTOR_PWM"}
                    hasCanFault={hasCanFault}
                    hasInjectorFault={hasInjectorFault}
                    simulationSpeed={simulationSpeed}
                    emulatorRpm={rpmEmulator?.rpm}
                    isRpmEmulatorActive={rpmEmulator?.isActive}
                    isInjectorFiring={isInjectorFiring}
                    camPhaseOffsetDeg={activeCamPhaseOffsetDeg}
                    ckpSignalLost={isCkpSignalLost}
                    pins={pins}
                    nodeVoltages={circuitSolution.nodeVoltages}
                    faults={faults}
                    selectedPinId={selectedPinId}
                    onSelectPin={(pinId) => onSelectPin(pinId)}
                  />
                ) : oscilloscopeViewMode === "D3_SCOPE" ? (
                  <D3OscilloscopeView
                    pins={pins}
                    selectedPinId={selectedPinId}
                    onSelectPin={onSelectPin}
                    nodeVoltages={circuitSolution.nodeVoltages}
                    faults={faults}
                    isPowerOn={powerSupply.isOutputEnabled}
                    hasCanFault={hasCanFault}
                    hasInjectorFault={hasInjectorFault}
                    isInjectorFiring={isInjectorFiring}
                    rpm={activeScopeRpm}
                    simulationSpeed={simulationSpeed}
                    camPhaseOffsetDeg={activeCamPhaseOffsetDeg}
                    ckpSignalLost={isCkpSignalLost}
                  />
                ) : oscilloscopeViewMode === "RECHARTS_PIN" ? (
                  <PinWaveformOscilloscope
                    variant="embedded"
                    {...pinScopeProps}
                  />
                ) : (
                  <BinaryStateMonitor variant="full" {...pinScopeProps} />
                ),
                oscilloscopeViewMode,
              )}
            </div>
            <section
              aria-label="Harness wiring canvas"
              className={`flex min-w-0 flex-1 flex-col overflow-hidden ${isShortContainer ? "min-h-[220px] sm:min-h-[260px]" : "min-h-[340px] sm:min-h-[360px]"}`}
            >
              <WiringCanvas {...canvasProps} />
            </section>
          </section>
        )}
        {activeTab === "PCB_SCANNER" && (
          <section aria-label="PCB schematic scanner" className={fullPaneClass}>
            {module(
              "PCB Scanner",
              <SchematicPcbScanner
                nodeVoltages={circuitSolution.nodeVoltages}
                supplyCurrentDrawAmps={circuitSolution.supplyCurrentDrawAmps}
                powerSupply={powerSupply}
                faults={faults}
                onOpenGroundedSearch={onOpenGroundedSearch}
                onOpenOfflineBot={onOpenOfflineBot}
                onOpenCloudModal={onOpenCloudModal}
                onCrossProbePin={props.onCrossProbePin}
              />,
            )}
          </section>
        )}
        {activeTab === "REPAIR_GUIDE" && (
          <section
            aria-label="ECU repair knowledge base"
            className={fullPaneClass}
          >
            {module(
              "Repair Knowledge Base",
              <EcuRepairKnowledgeBase
                savedSessions={safeSavedSessions}
                savedLogs={safeSavedLogs}
                liveActiveDtcs={circuitSolution.activeDTCs}
                onOpenSavedBenches={onOpenCloudModal}
                onEmulateTroubleScenario={(scenario) => {
                  handleApplyTroubleScenario(scenario);
                  onNavigateTab("BENCH_LAB");
                  setIsTroubleDrawerOpen(true);
                }}
              />,
            )}
          </section>
        )}
      </ModuleErrorBoundary>
      </div>

      {!isEmbeddedPinScope &&
        (activeTab === "BENCH_LAB" || activeTab === "WIRING_DIAGRAM") &&
        showPinScopeOverlay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4"
          onClick={closePinOverlay}
        >
          <section
            id={scopeOverlayId}
            aria-label="Selected pin oscilloscope overlay"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[82dvh] w-[min(560px,calc(100vw-1rem))] overflow-auto rounded-xl border border-[#2a4063] bg-[#0e1726] shadow-2xl"
          >
            {module(
              "Pin Oscilloscope",
              <PinWaveformOscilloscope
                variant="overlay"
                {...pinScopeProps}
                onClose={closePinOverlay}
                onOpenFullScopeTab={openFullScope}
              />,
              "overlay",
            )}
          </section>
        </div>
      )}

      <ModuleErrorBoundary
        label="Docked lab navigator"
        resetKey={activeTab}
        onReturnToBench={returnToBench}
      >
        <FloatingLabNavigator
          containerSize={containerSize}
          activeTab={activeTab}
          mobileBenchPane={mobileBenchPane}
          paneOrder={paneOrder}
          isContainerMoveMode={isContainerMoveMode}
          onToggleContainerMoveMode={() =>
            setIsContainerMoveMode((previous) => !previous)
          }
          onMovePane={movePane}
          onResetPaneOrder={resetPaneOrder}
          onSelectMobilePane={selectMobilePane}
          onNavigateTab={onNavigateTab}
          powerSupply={powerSupply}
          onChangePowerSupply={onChangePowerSupply}
          multimeter={multimeter}
          onChangeMultimeter={onChangeMultimeter}
          onSetManualRangeLabel={setManualRangeLabel}
          pins={pins}
          wires={wires}
          onAddWire={onAddWire}
          onToggleCutWire={onToggleCutWire}
          onDeleteWire={onDeleteWire}
          faults={faults}
          onAddFault={onAddFault}
          onRemoveFault={onRemoveFault}
          onChangeRpmEmulator={onChangeRpmEmulator}
          circuitSolution={circuitSolution}
          selectedPinId={selectedPinId}
          onAttachProbe={onAttachProbe}
          onClearAllFaults={onClearAllFaults}
          onResetLab={onResetLab}
          savedSessions={safeSavedSessions}
          savedLogs={safeSavedLogs}
          vehicleContext={vehicleContext}
          voiceNavEnabled={isVoiceAssistantActive}
          onVoiceNavEnabledChange={toggleVoice}
          dockOpacity={voiceFloatingOpacity}
          onDockOpacityChange={setVoiceFloatingOpacity}
          isVoiceLogOpen={voiceLogOpen}
          onToggleVoiceLog={toggleVoiceLog}
          onOpenVoiceLog={openVoiceLog}
          onOpenVoiceMacros={openVoiceMacros}
          onOpenVoiceMacroLibrary={props.onOpenVoiceMacroLibrary}
          onOpenDiagnosticWorkflow={openDiagnosticWorkflowPanel}
          onOpenLogicCheck={openLogicCheckPanel}
          checkedWorkflowIds={props.checkedWorkflowIds}
          onChangeCheckedWorkflowIds={props.onChangeCheckedWorkflowIds}
          commandExecutorRef={voiceExecutorRef}
          showPinScopeButton={
            !isEmbeddedPinScope &&
            (activeTab === "BENCH_LAB" || activeTab === "WIRING_DIAGRAM")
          }
          isPinScopeOpen={showPinScopeOverlay}
          onTogglePinScope={() =>
            setShowPinScopeOverlay((previous) => !previous)
          }
          pinScopeSummary={formatPinScopeSummary(selectedPin, circuitSolution)}
          onOpenTroubleLookup={handleVoiceOpenTroubleLookup}
          onEmulateTroubleScenario={handleVoiceEmulateTroubleScenario}
          onNextScenarioStep={handleVoiceNextScenarioStep}
          onPrevScenarioStep={handleVoicePrevScenarioStep}
          onRepeatScenarioStep={handleVoiceRepeatScenarioStep}
          onVerifyScenarioStep={handleVoiceVerifyScenarioStep}
          onCompleteScenarioStep={handleVoiceCompleteScenarioStep}
          onProbeScenarioFocusPin={handleVoiceProbeScenarioFocusPin}
          isAiCoachOpen={props.isAiCoachOpen}
          onOpenAiCoach={props.onOpenAiCoach}
        />
      </ModuleErrorBoundary>
      <VoiceCommandLogSidebar
        isOpen={voiceLogOpen}
        onClose={closeVoiceLog}
        history={voiceHistory}
        voiceState={voiceState}
        pins={pins}
        activeSection={voiceSidebarSection}
        onChangeActiveSection={setVoiceSidebarSection}
        onToggleListening={handleSidebarToggleListening}
        onToggleContinuousMode={handleSidebarToggleContinuousMode}
        onRunCommand={(transcript, source) =>
          voiceExecutorRef.current?.(transcript, source)
        }
        powerSupply={powerSupply}
        onChangePowerSupply={onChangePowerSupply}
        multimeter={multimeter}
        onChangeMultimeter={onChangeMultimeter}
        manualRangeLabel={manualRangeLabel}
        onSetManualRangeLabel={setManualRangeLabel}
        onAttachProbe={onAttachProbe}
        onAddWire={onAddWire}
        faults={faults}
        onAddFault={onAddFault}
        onRemoveFault={onRemoveFault}
        onClearAllFaults={onClearAllFaults}
        rpmEmulator={rpmEmulator}
        onChangeRpmEmulator={onChangeRpmEmulator}
        onOpenMacroLibrary={props.onOpenVoiceMacroLibrary}
      />
      {hasOpenedTroubleDrawer && (
        <Suspense fallback={null}>
          <BenchTroubleScenarioDrawer
            isOpen={isTroubleDrawerOpen}
            onClose={() => setIsTroubleDrawerOpen(false)}
            evaluation={benchPulseEval}
            activeScenarioId={activeTroubleScenarioId}
            activeFaultCount={faults.length}
            cutWireCount={cutWireCount}
            selectedPinId={selectedPinId}
            preBenchGateLocked={props.preBenchGateLocked}
            preBenchGateBypassed={props.preBenchGateBypassed}
            canEnergizePhysicalBench={
              props.pinoutSafetyEvaluation?.canEnergizePhysicalBench ?? true
            }
            onBypassPreBenchGate={props.onBypassPreBenchGate}
            onApplyScenario={handleApplyTroubleScenario}
            onStartUniversityModule={handleStartUniversityModule}
            onOpenUniversityPdfModal={handleOpenUniversityPdfModal}
            activeUniversityModuleId={activeUniversityModuleId}
            onClearAllTroubles={handleClearTroubleScenarios}
            onFocusProbePin={handleFocusProbePin}
            onSetTestRpmMode={onChangeRpmEmulator ? handleSetTestRpmMode : undefined}
          />
        </Suspense>
      )}
      {isUniversityPdfModalOpen && (
        <Suspense fallback={null}>
          <UniversityLabPdfModal
            isOpen={isUniversityPdfModalOpen}
            initialTab={universityPdfModalTab}
            onClose={() => setIsUniversityPdfModalOpen(false)}
            activeModule={activeUniversityModule}
            capturedSteps={activeCapturedStepsList}
            powerSupply={powerSupply}
            supplyCurrentDrawAmps={circuitSolution.supplyCurrentDrawAmps}
            faults={faults}
            wires={wires}
            activeDTCs={circuitSolution.activeDTCs}
            rpm={activeScopeRpm}
            ckpSignalLost={isCkpSignalLost}
            tpsVoltage={circuitSolution.nodeVoltages["ecu-pin-7"] ?? 0}
          />
        </Suspense>
      )}
      {hasOpenedLookupDrawer && (
        <Suspense fallback={null}>
          <TroubleScenariosLookupDrawer
            isOpen={effectiveLookupOpen}
            onClose={closeLookupDrawer}
            activeScenarioId={activeTroubleScenarioId}
            initialQuery={lookupInitialQuery}
            benchState={lookupBenchState}
            selectedPhId={activeLookupPhId}
            onSelectPhIdChange={setActiveLookupPhId}
            activeVoiceStepIndex={activeLookupStepIndex}
            onActiveVoiceStepIndexChange={setActiveLookupStepIndex}
            completedStepsByPhId={completedLookupStepsByPhId}
            onToggleStepCompleted={handleToggleLookupStepCompleted}
            voiceNavEnabled={isVoiceAssistantActive}
            onToggleVoiceNav={toggleVoice}
            onRunVoiceCommand={(transcript, source, meta) =>
              voiceExecutorRef.current?.(transcript, source, meta)
            }
            onEmulateScenario={(scenario) => {
              handleApplyTroubleScenario(scenario);
              onNavigateTab("BENCH_LAB");
              closeLookupDrawer();
            }}
            onFocusProbePin={(pinId, label, openScope) => {
              handleFocusProbePin(pinId, label, openScope);
              if (openScope) {
                closeLookupDrawer();
              }
            }}
            onLaunchGroundedSearch={(q, dtc, ecu) => {
              onOpenGroundedSearch(q, dtc, ecu);
            }}
            onOpenOfflineBot={(prompt) => {
              onOpenOfflineBot(prompt);
            }}
            onOpenSavedBenches={onOpenCloudModal}
            onOpenEmulatorDrawer={() => {
              setIsTroubleDrawerOpen(true);
            }}
          />
        </Suspense>
      )}
      {isFaultBuilderOpen && (
        <Suspense fallback={null}>
          <FaultBuilderModal
            isOpen={isFaultBuilderOpen}
            onClose={() => setIsFaultBuilderOpen(false)}
            pins={pins}
            wires={wires}
            nodeVoltages={circuitSolution.nodeVoltages}
            activeDTCs={circuitSolution.activeDTCs}
            supplyCurrentDrawAmps={circuitSolution.supplyCurrentDrawAmps}
            isPowerOn={powerSupply.isOutputEnabled}
            activeSequence={activeFaultSequence}
            isPlaying={isSequencePlaying}
            elapsedMs={sequenceElapsedMs}
            edgeHitCount={sequenceEdgeHits}
            isBlindMode={isSequenceBlindMode}
            onToggleBlindMode={setIsSequenceBlindMode}
            customSequences={props.savedFaultSequences}
            onSaveSequence={props.onSaveFaultSequence}
            onDeleteSequence={props.onDeleteFaultSequence}
            cloudSyncStatus={props.faultSyncStatus}
            isCloudAuthenticated={props.isCloudAuthenticated}
            localWorkstationSequenceCount={props.localWorkstationSequenceCount}
            onSyncNow={props.onSyncFaultSequences}
            onPromoteLocalSequences={props.onPromoteLocalFaultSequences}
            onRunSequence={handleRunFaultSequence}
            onPauseToggle={() => setIsSequencePlaying((p) => !p)}
            onJumpToStage={handleJumpFaultSequenceStage}
            onStopSequence={handleStopFaultSequence}
            onFocusPin={(pinId, label) => handleFocusProbePin(pinId, label, false)}
          />
        </Suspense>
      )}
      </main>
  );
}
