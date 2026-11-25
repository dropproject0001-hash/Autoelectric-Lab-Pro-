/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Camera,
  CheckCircle2,
  Copy,
  Gauge,
  Layers,
  Mic,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type {
  BenchComponent,
  EcuPin,
  FaultType,
  InjectedFault,
  MultimeterMode,
  MultimeterState,
  PowerSupplyState,
} from '../types/ecu';
import type { RpmEmulatorState } from '../utils/vehicleEcuRegistry';
import {
  captureBenchInstrumentSequence,
  classifyMacroStepInstrument,
  COMMON_MACRO_STEP_SNIPPETS,
  compileInstrumentStepToInstruction,
  DMM_MANUAL_RANGE_OPTIONS,
  type PsuPresetOption,
  PSU_PRESET_METADATA,
  type VoiceMacro,
  voiceMacroService,
} from '../services/voiceMacroService';
import {
  executeMacroSequence,
  type MacroExecutionResult,
  previewMacroStep,
  type VoiceCommandActions,
} from '../utils/voiceCommandParser';
import { RackCornerScrews } from './HardwareControls';

export interface VoiceMacroMappingPanelProps {
  pins: EcuPin[];
  components?: BenchComponent[];
  powerSupply: PowerSupplyState;
  onChangePowerSupply: React.Dispatch<React.SetStateAction<PowerSupplyState>>;
  multimeter: MultimeterState;
  onChangeMultimeter: React.Dispatch<React.SetStateAction<MultimeterState>>;
  manualRangeLabel?: string | null;
  onSetManualRangeLabel?: (label: string | null) => void;
  onAttachProbe?: (color: 'red' | 'black', pinId: string, label: string) => void;
  onAddWire?: (sourcePinId: string, targetPinId: string, color?: string, label?: string) => void;
  onToggleCutWire?: (wireId: string) => void;
  onDeleteWire?: (wireId: string) => void;
  faults?: InjectedFault[];
  onAddFault?: (pinId: string, faultType: FaultType, description: string) => void;
  onRemoveFault?: (pinId: string) => void;
  onClearAllFaults?: () => void;
  rpmEmulator?: RpmEmulatorState;
  onChangeRpmEmulator?: React.Dispatch<React.SetStateAction<RpmEmulatorState>>;
  onOpenMacroLibrary?: () => void;
  onRunVoiceTranscript?: (transcript: string) => void;
  variant?: 'rack' | 'sidebar';
  defaultCollapsed?: boolean;
}

type PsuComposerAction =
  | 'APPLY_PRESET'
  | 'SET_VOLTAGE'
  | 'SET_CURRENT_LIMIT'
  | 'SET_OUTPUT'
  | 'RAIL_SHORTHAND';

type DmmComposerAction =
  | 'SET_MODE_RANGE'
  | 'ATTACH_RED_PROBE'
  | 'ATTACH_BLACK_PROBE'
  | 'SET_HOLD'
  | 'PROBE_UTILITY'
  | 'SET_POWER';

type MacroListFilter = 'ALL' | 'CUSTOM' | 'PRESET';

const DMM_MODE_LABELS: Record<MultimeterMode, string> = {
  V_DC: 'V DC (Direct Voltage)',
  V_AC: 'V AC~ (Alternating RMS)',
  RESISTANCE: 'Ω Ohms (Resistance)',
  CONTINUITY: 'BEEP (Continuity <30Ω)',
  FREQUENCY: 'Hz / % (Frequency / PWM)',
  DIODE: '-▷|- (Diode Junction 1mA)',
};

export const VoiceMacroMappingPanel: React.FC<VoiceMacroMappingPanelProps> = ({
  pins,
  components = [],
  powerSupply,
  onChangePowerSupply,
  multimeter,
  onChangeMultimeter,
  manualRangeLabel = null,
  onSetManualRangeLabel,
  onAttachProbe,
  onAddWire,
  faults = [],
  onAddFault,
  onRemoveFault,
  onClearAllFaults,
  onChangeRpmEmulator,
  onOpenMacroLibrary,
  onRunVoiceTranscript,
  variant = 'rack',
  defaultCollapsed = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [macros, setMacros] = useState<VoiceMacro[]>(() => voiceMacroService.getMacros());
  const [listFilter, setListFilter] = useState<MacroListFilter>('ALL');

  // Builder state
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingMacroId, setEditingMacroId] = useState<string | null>(null);
  const [macroName, setMacroName] = useState('');
  const [triggerPhrase, setTriggerPhrase] = useState('');
  const [macroDescription, setMacroDescription] = useState('');
  const [steps, setSteps] = useState<string[]>([
    'Set PSU preset to 12.6V battery',
    'Turn power supply on',
    'Set multimeter to 20V DC',
    'Attach red probe to pin 7',
    'Attach black probe to ground',
  ]);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [lastExecutionResult, setLastExecutionResult] = useState<MacroExecutionResult | null>(null);

  // PSU Step Composer state
  const [psuAction, setPsuAction] = useState<PsuComposerAction>('APPLY_PRESET');
  const [psuPreset, setPsuPreset] = useState<PsuPresetOption>('12V_BENCH');
  const [psuVolts, setPsuVolts] = useState<number>(12.6);
  const [psuAmps, setPsuAmps] = useState<number>(4.0);
  const [psuOutputEnabled, setPsuOutputEnabled] = useState<boolean>(true);
  const [psuRailShorthand, setPsuRailShorthand] = useState<
    'Connect Power' | 'Engage Ignition' | 'Disengage Ignition' | 'Connect Ground'
  >('Connect Power');

  // DMM Step Composer state
  const [dmmAction, setDmmAction] = useState<DmmComposerAction>('SET_MODE_RANGE');
  const [dmmMode, setDmmMode] = useState<MultimeterMode>('V_DC');
  const [dmmRangeOption, setDmmRangeOption] = useState<string>('20V DC');
  const [dmmProbeTarget, setDmmProbeTarget] = useState<string>('pin 7');
  const [dmmBlackProbeTarget, setDmmBlackProbeTarget] = useState<string>('ground');
  const [dmmHoldValue, setDmmHoldValue] = useState<boolean>(true);
  const [dmmUtility, setDmmUtility] = useState<'SWAP_PROBES' | 'DISCONNECT_PROBES' | 'AUTO_RANGE'>(
    'AUTO_RANGE'
  );
  const [dmmPowerState, setDmmPowerState] = useState<boolean>(true);

  // Live Capture options
  const [capturePsu, setCapturePsu] = useState(true);
  const [captureDmm, setCaptureDmm] = useState(true);
  const [captureProbes, setCaptureProbes] = useState(true);

  useEffect(() => {
    return voiceMacroService.subscribeMacros(setMacros);
  }, []);

  // Keep range dropdown valid when DMM mode changes
  useEffect(() => {
    const options = DMM_MANUAL_RANGE_OPTIONS[dmmMode] || [{ label: 'Auto-Range', value: 'AUTO' }];
    if (!options.some((o) => o.value === dmmRangeOption)) {
      setDmmRangeOption(options[0].value);
    }
  }, [dmmMode, dmmRangeOption]);

  const terminalOptions = useMemo(() => {
    const list: Array<{ value: string; label: string; group: string }> = [
      { value: 'ground', label: 'Chassis Ground (KL31)', group: 'Reference Rails' },
      { value: '+12V VBat', label: '+12V VBat Power Rail (KL30)', group: 'Reference Rails' },
      ...pins.map((p) => ({
        value: `pin ${p.pinNumber}`,
        label: `Pin ${p.pinNumber} · ${p.label} (${p.name})`,
        group: 'ECU Connector Pins',
      })),
      { value: 'TPS VCC', label: 'TPS Sensor: 5V VCC', group: 'Bench Components' },
      { value: 'TPS signal', label: 'TPS Sensor: Wiper Signal', group: 'Bench Components' },
      { value: 'TPS GND', label: 'TPS Sensor: Ground', group: 'Bench Components' },
      { value: 'MAP VCC', label: 'MAP Sensor: 5V VCC', group: 'Bench Components' },
      { value: 'MAP signal', label: 'MAP Sensor: Pressure Signal', group: 'Bench Components' },
      { value: 'MAP GND', label: 'MAP Sensor: Ground', group: 'Bench Components' },
      { value: 'ECT signal', label: 'ECT Thermistor: Signal (+)', group: 'Bench Components' },
      { value: 'ECT GND', label: 'ECT Thermistor: Ground (-)', group: 'Bench Components' },
      { value: 'injector 12V', label: 'Fuel Injector: +12V Feed', group: 'Bench Components' },
      { value: 'injector control', label: 'Fuel Injector: Low-Side Control', group: 'Bench Components' },
      { value: 'CAN-H', label: 'CAN Bus: CAN-H Terminator', group: 'Bench Components' },
      { value: 'CAN-L', label: 'CAN Bus: CAN-L Terminator', group: 'Bench Components' },
      { value: 'relay pin 30', label: 'Main Relay: Pin 30', group: 'Bench Components' },
      { value: 'relay pin 87', label: 'Main Relay: Pin 87', group: 'Bench Components' },
      { value: 'relay pin 86', label: 'Main Relay: Pin 86', group: 'Bench Components' },
      { value: 'relay pin 85', label: 'Main Relay: Pin 85', group: 'Bench Components' },
    ];
    return list;
  }, [pins, components.length]);

  const stepPreviews = useMemo(
    () => steps.map((step) => previewMacroStep(step, pins)),
    [steps, pins]
  );

  const filteredMacros = useMemo(() => {
    if (listFilter === 'CUSTOM') return macros.filter((m) => !m.isPreset);
    if (listFilter === 'PRESET') return macros.filter((m) => m.isPreset);
    return macros;
  }, [macros, listFilter]);

  const buildLocalVoiceActions = (): VoiceCommandActions => ({
    setVoltage: (volts) =>
      onChangePowerSupply((prev) => ({
        ...prev,
        voltageSetting: Math.max(0, Math.min(28.0, parseFloat(volts.toFixed(2)))),
        preset: 'CUSTOM',
      })),
    setCurrentLimit: (amps) =>
      onChangePowerSupply((prev) => ({
        ...prev,
        currentLimit: Math.max(0.2, Math.min(10.0, parseFloat(amps.toFixed(2)))),
      })),
    setPowerSupplyPreset: (preset, volts, currentLimit) =>
      onChangePowerSupply((prev) => ({
        ...prev,
        preset,
        voltageSetting: volts,
        currentLimit,
      })),
    setPowerSupplyOutput: (enabled) =>
      onChangePowerSupply((prev) => ({
        ...prev,
        isOutputEnabled: enabled,
      })),
    resetLab: () => {},
    switchTab: () => {},
    attachProbeToPin: (pinId, label) => {
      if (onAttachProbe) {
        onAttachProbe('red', pinId, label);
      } else {
        onChangeMultimeter((prev) => ({
          ...prev,
          redProbe: { attachedToPinId: pinId, attachedLabel: label },
        }));
      }
    },
    attachBlackProbeToPin: (pinId, label) => {
      if (onAttachProbe) {
        onAttachProbe('black', pinId, label);
      } else {
        onChangeMultimeter((prev) => ({
          ...prev,
          blackProbe: { attachedToPinId: pinId, attachedLabel: label },
        }));
      }
    },
    swapProbes: () =>
      onChangeMultimeter((prev) => ({
        ...prev,
        redProbe: prev.blackProbe,
        blackProbe: prev.redProbe,
      })),
    disconnectProbes: () =>
      onChangeMultimeter((prev) => ({
        ...prev,
        redProbe: { attachedToPinId: null, attachedLabel: 'Unconnected' },
        blackProbe: { attachedToPinId: null, attachedLabel: 'Unconnected' },
      })),
    setMultimeterState: (updates, rangeLabel) => {
      if (rangeLabel !== undefined) {
        onSetManualRangeLabel?.(rangeLabel);
      }
      onChangeMultimeter((prev) => ({
        ...prev,
        ...(updates.mode !== undefined ? { mode: updates.mode } : {}),
        ...(updates.isPowered !== undefined ? { isPowered: updates.isPowered } : {}),
        ...(updates.rangeAuto !== undefined ? { rangeAuto: updates.rangeAuto } : {}),
        ...(updates.holdValue !== undefined ? { holdValue: updates.holdValue } : {}),
      }));
    },
    connectWire: onAddWire
      ? (sourcePinId, targetPinId, color, label) => {
          onAddWire(sourcePinId, targetPinId, color, label);
          return true;
        }
      : undefined,
    injectFault: onAddFault,
    toggleFault:
      onAddFault && onRemoveFault
        ? (pinId, faultType, description) => {
            const existing = faults.find((f) => f.pinId === pinId);
            if (existing && (faultType === 'NONE' || existing.faultType === faultType)) {
              onRemoveFault(pinId);
              return false;
            }
            onAddFault(pinId, faultType, description);
            return true;
          }
        : onAddFault
        ? (pinId, faultType, description) => {
            onAddFault(pinId, faultType, description);
            return true;
          }
        : undefined,
    removeFault: onRemoveFault
      ? (pinId) => {
          const existed = faults.some((f) => f.pinId === pinId);
          onRemoveFault(pinId);
          return existed;
        }
      : undefined,
    clearFaults: onClearAllFaults,
    setRpmEmulator: onChangeRpmEmulator
      ? (updates) =>
          onChangeRpmEmulator((prev) => ({
            ...prev,
            ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
            ...(updates.rpm !== undefined ? { rpm: updates.rpm } : {}),
          }))
      : undefined,
  });

  const handleExecuteMacro = (macro: VoiceMacro) => {
    if (onRunVoiceTranscript) {
      onRunVoiceTranscript(macro.triggerPhrase);
      const stepResults = macro.steps
        .map((s) => s.trim())
        .filter(Boolean)
        .map((instruction) => {
          const preview = previewMacroStep(instruction, pins);
          const status = preview.status ?? (preview.matched ? 'EXECUTED' : 'UNRECOGNIZED');
          return {
            instruction,
            matched: preview.matched,
            status,
            actionDescription:
              preview.actionDescription || `Unrecognized instruction: "${instruction}"`,
            spokenReply: preview.spokenReply,
            category: preview.category ?? 'DIAGNOSTIC',
          };
        });
      const executedCount = stepResults.filter((r) => r.matched && r.status === 'EXECUTED').length;
      const failedCount = stepResults.filter((r) => r.matched && r.status === 'FAILED').length;
      const unrecognizedCount = stepResults.length - executedCount - failedCount;
      setLastExecutionResult({
        matched: true,
        macroName: macro.name,
        triggerPhrase: macro.triggerPhrase,
        stepResults,
        executedCount,
        failedCount,
        unrecognizedCount,
        status:
          failedCount === 0 && unrecognizedCount === 0 && stepResults.length > 0
            ? 'EXECUTED'
            : 'FAILED',
        actionDescription: `Triggered “${macro.triggerPhrase}” (${executedCount}/${stepResults.length} steps)`,
        spokenReply: `Executed macro ${macro.name}.`,
      });
      return;
    }
    const result = executeMacroSequence(macro, pins, buildLocalVoiceActions());
    setLastExecutionResult(result);
  };

  const appendInstructionStep = (instruction: string) => {
    const trimmed = instruction.trim();
    if (!trimmed) return;
    setSteps((prev) => {
      const emptyIdx = prev.findIndex((s) => s.trim() === '');
      if (emptyIdx >= 0) {
        return prev.map((s, i) => (i === emptyIdx ? trimmed : s));
      }
      if (prev.length >= 20) return prev;
      return [...prev, trimmed];
    });
    setBuilderError(null);
  };

  const handleAppendPsuStep = () => {
    let instruction = '';
    if (psuAction === 'APPLY_PRESET') {
      instruction = compileInstrumentStepToInstruction({
        target: 'POWER_SUPPLY',
        action: 'APPLY_PRESET',
        preset: psuPreset,
      });
    } else if (psuAction === 'SET_VOLTAGE') {
      instruction = compileInstrumentStepToInstruction({
        target: 'POWER_SUPPLY',
        action: 'SET_VOLTAGE',
        volts: psuVolts,
      });
    } else if (psuAction === 'SET_CURRENT_LIMIT') {
      instruction = compileInstrumentStepToInstruction({
        target: 'POWER_SUPPLY',
        action: 'SET_CURRENT_LIMIT',
        amps: psuAmps,
      });
    } else if (psuAction === 'SET_OUTPUT') {
      instruction = compileInstrumentStepToInstruction({
        target: 'POWER_SUPPLY',
        action: 'SET_OUTPUT',
        outputEnabled: psuOutputEnabled,
      });
    } else if (psuAction === 'RAIL_SHORTHAND') {
      instruction = compileInstrumentStepToInstruction({
        target: 'POWER_SUPPLY',
        action: 'RAIL_SHORTHAND',
        shorthand: psuRailShorthand,
      });
    }
    appendInstructionStep(instruction);
  };

  const handleAppendDmmStep = () => {
    let instruction = '';
    if (dmmAction === 'SET_MODE_RANGE') {
      instruction = compileInstrumentStepToInstruction({
        target: 'MULTIMETER',
        action: 'SET_MODE_RANGE',
        mode: dmmMode,
        manualRangeLabel: dmmRangeOption === 'AUTO' ? null : dmmRangeOption,
      });
    } else if (dmmAction === 'ATTACH_RED_PROBE') {
      instruction = compileInstrumentStepToInstruction({
        target: 'MULTIMETER',
        action: 'ATTACH_RED_PROBE',
        terminalTarget: dmmProbeTarget,
      });
    } else if (dmmAction === 'ATTACH_BLACK_PROBE') {
      instruction = compileInstrumentStepToInstruction({
        target: 'MULTIMETER',
        action: 'ATTACH_BLACK_PROBE',
        terminalTarget: dmmBlackProbeTarget,
      });
    } else if (dmmAction === 'SET_HOLD') {
      instruction = compileInstrumentStepToInstruction({
        target: 'MULTIMETER',
        action: 'SET_HOLD',
        holdValue: dmmHoldValue,
      });
    } else if (dmmAction === 'PROBE_UTILITY') {
      instruction = compileInstrumentStepToInstruction({
        target: 'MULTIMETER',
        action: 'PROBE_UTILITY',
        utility: dmmUtility,
      });
    } else if (dmmAction === 'SET_POWER') {
      instruction = compileInstrumentStepToInstruction({
        target: 'MULTIMETER',
        action: 'SET_POWER',
        isPowered: dmmPowerState,
      });
    }
    appendInstructionStep(instruction);
  };

  const handleCaptureLiveBenchState = () => {
    const captured = captureBenchInstrumentSequence({
      powerSupply,
      multimeter,
      manualRangeLabel,
      includePowerSupply: capturePsu,
      includeMultimeter: captureDmm,
      includeProbes: captureProbes,
    });
    if (captured.length === 0) {
      setBuilderError('Select at least one instrument group (PSU, DMM, or Probes) to capture.');
      return;
    }
    setSteps(captured);
    setBuilderError(null);
    if (!isBuilderOpen) {
      setIsBuilderOpen(true);
    }
  };

  const openNewBuilder = () => {
    setEditingMacroId(null);
    setMacroName('');
    setTriggerPhrase('');
    setMacroDescription('');
    setSteps(
      captureBenchInstrumentSequence({
        powerSupply,
        multimeter,
        manualRangeLabel,
        includePowerSupply: true,
        includeMultimeter: true,
        includeProbes: true,
      })
    );
    setBuilderError(null);
    setIsBuilderOpen(true);
  };

  const openEditBuilder = (macro: VoiceMacro) => {
    setEditingMacroId(macro.id);
    setMacroName(macro.name);
    setTriggerPhrase(macro.triggerPhrase);
    setMacroDescription(macro.description || '');
    setSteps(macro.steps.length > 0 ? [...macro.steps] : ['']);
    setBuilderError(null);
    setIsBuilderOpen(true);
  };

  const handleMoveStep = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    setSteps((prev) => {
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleRemoveStep = (index: number) => {
    setSteps((prev) => (prev.length <= 1 ? [''] : prev.filter((_, i) => i !== index)));
  };

  const handleSaveMacro = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTrigger = triggerPhrase.trim();
    const cleanSteps = steps.map((s) => s.trim()).filter(Boolean);
    if (!cleanTrigger) {
      setBuilderError('Enter a spoken voice trigger phrase (e.g. "Check TPS Voltage").');
      return;
    }
    if (cleanSteps.length === 0) {
      setBuilderError('Add at least one PSU or DMM state sequence step.');
      return;
    }

    if (editingMacroId) {
      voiceMacroService.updateMacro(editingMacroId, {
        name: macroName.trim() || cleanTrigger,
        triggerPhrase: cleanTrigger,
        description: macroDescription.trim() || undefined,
        steps: cleanSteps,
      });
    } else {
      voiceMacroService.createMacro({
        name: macroName.trim() || cleanTrigger,
        triggerPhrase: cleanTrigger,
        description: macroDescription.trim() || undefined,
        steps: cleanSteps,
      });
    }
    setIsBuilderOpen(false);
    setEditingMacroId(null);
    setBuilderError(null);
  };

  const renderStepInstrumentBadge = (instruction: string) => {
    const info = classifyMacroStepInstrument(instruction);
    const badgeColor =
      info.instrument === 'POWER_SUPPLY'
        ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-300'
        : info.instrument === 'MULTIMETER'
        ? 'border-amber-500/50 bg-amber-950/50 text-amber-300'
        : info.instrument === 'PROBES'
        ? 'border-rose-500/50 bg-rose-950/50 text-rose-300'
        : info.instrument === 'FAULT'
        ? 'border-red-500/50 bg-red-950/50 text-red-300'
        : info.instrument === 'RPM'
        ? 'border-purple-500/50 bg-purple-950/50 text-purple-300'
        : 'border-cyan-500/50 bg-cyan-950/50 text-cyan-300';

    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded-[2px] border text-[9px] font-mono font-bold uppercase tracking-wider shrink-0 ${badgeColor}`}
      >
        {info.badgeLabel}
      </span>
    );
  };

  return (
    <div
      data-testid={`voice-macro-mapping-panel-${variant}`}
      className="relative hud-panel text-slate-100 rounded-[3px] p-3 flex flex-col gap-2.5 shrink-0"
    >
      {variant === 'rack' && <RackCornerScrews />}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2b313c] pb-2 pl-2 pr-1">
        <div className="flex items-center gap-2 min-w-0 flex-1 basis-[170px]">
          <Mic className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] sm:text-xs font-hud font-bold tracking-wider text-amber-300 uppercase truncate">
                Voice Macro Sequencer
              </span>
              <span className="text-[9.5px] font-mono text-slate-400 hidden sm:inline">
                DMM &amp; PSU STATE MAPPER
              </span>
            </div>
            <p className="text-[10px] font-mono text-slate-400 truncate">
              {macros.length} voice sequences · Live PSU {powerSupply.voltageSetting.toFixed(1)}V / DMM {multimeter.mode.replace('_', ' ')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 shrink-0">
          {onOpenMacroLibrary && (
            <button
              type="button"
              onClick={onOpenMacroLibrary}
              data-testid={`open-macro-library-from-${variant}`}
              title="Open full Voice Macro Library & Live Action Recorder"
              className="hw-btn hw-btn-amber inline-flex items-center gap-1 px-2 py-1 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer"
            >
              <Layers className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span>Library &amp; Record</span>
            </button>
          )}
          <button
            type="button"
            onClick={openNewBuilder}
            data-testid="open-voice-macro-sequencer-btn"
            className="hw-btn hw-btn-green inline-flex items-center gap-1 px-2 py-1 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>Map Sequence</span>
          </button>
          {variant === 'rack' && (
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="hw-btn px-2 py-1 rounded-[2px] text-[10px] font-mono text-slate-300 hover:text-white whitespace-nowrap cursor-pointer"
            >
              {isCollapsed ? 'Expand' : 'Collapse'}
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Live Bench State Snapshot Bar */}
          <div className="hw-lcd-well rounded-[2px] p-2 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-300">
                <Camera className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                <span className="font-bold uppercase tracking-wide text-slate-200">
                  Snapshot Live Bench into Sequence:
                </span>
              </div>
              <button
                type="button"
                onClick={handleCaptureLiveBenchState}
                data-testid="capture-live-instrument-state-btn"
                className="hw-btn hw-btn-amber inline-flex items-center gap-1 px-2.5 py-1 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
              >
                <Camera className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>Capture DMM + PSU State</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-slate-300">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={capturePsu}
                  onChange={(e) => setCapturePsu(e.target.checked)}
                  className="accent-amber-400"
                />
                <span>
                  PSU ({powerSupply.voltageSetting.toFixed(1)}V / {powerSupply.currentLimit.toFixed(1)}A /{' '}
                  {powerSupply.isOutputEnabled ? 'ON' : 'OFF'})
                </span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={captureDmm}
                  onChange={(e) => setCaptureDmm(e.target.checked)}
                  className="accent-amber-400"
                />
                <span>
                  DMM ({multimeter.isPowered ? multimeter.mode.replace('_', ' ') : 'OFF'})
                </span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={captureProbes}
                  onChange={(e) => setCaptureProbes(e.target.checked)}
                  className="accent-amber-400"
                />
                <span>
                  Probes (+{multimeter.redProbe.attachedLabel.split(' ')[0]} / -
                  {multimeter.blackProbe.attachedLabel.split(' ')[0]})
                </span>
              </label>
            </div>
          </div>

          {/* Dedicated Instrument State Sequence Builder */}
          {isBuilderOpen && (
            <form
              onSubmit={handleSaveMacro}
              aria-label="Voice Macro Instrument State Sequencer"
              data-testid="voice-macro-sequence-builder-form"
              className="rounded-[2px] border border-amber-500/50 bg-[#141922] p-3 space-y-3"
            >
              <div className="flex items-center justify-between gap-2 border-b border-[#262e3d] pb-2">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
                    {editingMacroId ? 'Edit Instrument Voice Sequence' : 'Map Custom Voice Command Sequence'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsBuilderOpen(false);
                    setEditingMacroId(null);
                    setBuilderError(null);
                  }}
                  className="text-[11px] font-mono text-slate-400 hover:text-slate-100 px-1.5 py-0.5 rounded-[2px] cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              {/* Voice Trigger & Name Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10.5px] font-mono text-slate-300 mb-1">
                    Spoken Voice Trigger Phrase *
                  </label>
                  <input
                    type="text"
                    value={triggerPhrase}
                    onChange={(e) => {
                      setTriggerPhrase(e.target.value);
                      setBuilderError(null);
                    }}
                    placeholder='e.g. "Check TPS Voltage" or "Cranking Sag Test"'
                    data-testid="macro-sequencer-trigger-input"
                    className="w-full rounded-[2px] border border-[#323a48] bg-[#0b0e14] px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-mono text-slate-300 mb-1">
                    Sequence Title (optional)
                  </label>
                  <input
                    type="text"
                    value={macroName}
                    onChange={(e) => setMacroName(e.target.value)}
                    placeholder="Defaults to voice trigger phrase"
                    data-testid="macro-sequencer-name-input"
                    className="w-full rounded-[2px] border border-[#323a48] bg-[#0b0e14] px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10.5px] font-mono text-slate-300 mb-1">
                  Diagnostic Purpose / Notes (optional)
                </label>
                <input
                  type="text"
                  value={macroDescription}
                  onChange={(e) => setMacroDescription(e.target.value)}
                  placeholder="e.g. Energizes 12.6V bench rail and measures Pin 7 TPS signal on 20V DC range"
                  className="w-full rounded-[2px] border border-[#323a48] bg-[#0b0e14] px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </div>

              {/* Dual Instrument State Step Composers: PSU State + DMM State */}
              <div className="grid grid-cols-1 gap-2.5">
                {/* 1. Power Supply (PSU) State Step Composer */}
                <div className="rounded-[2px] border border-emerald-500/35 bg-[#0e131a] p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-mono font-bold uppercase tracking-wider text-emerald-300">
                      <Zap className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                      <span>1. Bench Power Supply (PSU) State Step</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleAppendPsuStep}
                      data-testid="append-psu-step-btn"
                      className="hw-btn hw-btn-green inline-flex items-center gap-1 px-2 py-1 rounded-[2px] text-[10px] font-mono font-bold uppercase cursor-pointer"
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" />
                      <span>Add PSU Step</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">PSU Action Type</label>
                      <select
                        value={psuAction}
                        onChange={(e) => setPsuAction(e.target.value as PsuComposerAction)}
                        aria-label="Power Supply State Action Type"
                        className="w-full rounded-[2px] border border-[#323a48] bg-[#151a24] px-2 py-1.5 text-[11px] text-slate-100 focus:border-emerald-400 focus:outline-none cursor-pointer"
                      >
                        <option value="APPLY_PRESET">Apply Automotive Rail Preset</option>
                        <option value="SET_VOLTAGE">Set Target Voltage (0.0V – 28.0V)</option>
                        <option value="SET_CURRENT_LIMIT">Set Current Limit (0.2A – 10.0A)</option>
                        <option value="SET_OUTPUT">Switch Output Enable (ON / OFF)</option>
                        <option value="RAIL_SHORTHAND">ECU Harness Power / Ignition Rail</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Target Parameter</label>
                      {psuAction === 'APPLY_PRESET' && (
                        <select
                          value={psuPreset}
                          onChange={(e) => setPsuPreset(e.target.value as PsuPresetOption)}
                          aria-label="PSU Automotive Preset"
                          className="w-full rounded-[2px] border border-[#323a48] bg-[#151a24] px-2 py-1.5 text-[11px] text-slate-100 focus:border-emerald-400 focus:outline-none cursor-pointer"
                        >
                          {(Object.keys(PSU_PRESET_METADATA) as PsuPresetOption[]).map((key) => (
                            <option key={key} value={key}>
                              {PSU_PRESET_METADATA[key].label}
                            </option>
                          ))}
                        </select>
                      )}

                      {psuAction === 'SET_VOLTAGE' && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            max={28}
                            step={0.1}
                            value={psuVolts}
                            onChange={(e) => setPsuVolts(parseFloat(e.target.value) || 0)}
                            aria-label="PSU Target Voltage"
                            className="w-20 rounded-[2px] border border-[#323a48] bg-[#151a24] px-2 py-1 text-[11px] text-amber-300 font-bold"
                          />
                          <div className="flex flex-wrap gap-1">
                            {[5.0, 12.0, 12.6, 14.4, 24.0].map((v) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setPsuVolts(v)}
                                className="hw-btn px-1.5 py-0.5 rounded-[2px] text-[9.5px] text-slate-300 hover:text-amber-300 cursor-pointer"
                              >
                                {v.toFixed(1)}V
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {psuAction === 'SET_CURRENT_LIMIT' && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0.2}
                            max={10}
                            step={0.1}
                            value={psuAmps}
                            onChange={(e) => setPsuAmps(parseFloat(e.target.value) || 0.2)}
                            aria-label="PSU Current Limit"
                            className="w-20 rounded-[2px] border border-[#323a48] bg-[#151a24] px-2 py-1 text-[11px] text-emerald-300 font-bold"
                          />
                          <div className="flex flex-wrap gap-1">
                            {[1.0, 2.0, 4.0, 5.0, 8.0].map((a) => (
                              <button
                                key={a}
                                type="button"
                                onClick={() => setPsuAmps(a)}
                                className="hw-btn px-1.5 py-0.5 rounded-[2px] text-[9.5px] text-slate-300 hover:text-emerald-300 cursor-pointer"
                              >
                                {a.toFixed(1)}A
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {psuAction === 'SET_OUTPUT' && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPsuOutputEnabled(true)}
                            className={`hw-btn py-1 rounded-[2px] text-[10px] font-bold cursor-pointer ${
                              psuOutputEnabled ? 'hw-btn-green' : 'text-slate-400'
                            }`}
                          >
                            OUTPUT ON
                          </button>
                          <button
                            type="button"
                            onClick={() => setPsuOutputEnabled(false)}
                            className={`hw-btn py-1 rounded-[2px] text-[10px] font-bold cursor-pointer ${
                              !psuOutputEnabled
                                ? 'border-rose-500/70 bg-rose-950/60 text-rose-200'
                                : 'text-slate-400'
                            }`}
                          >
                            STANDBY OFF
                          </button>
                        </div>
                      )}

                      {psuAction === 'RAIL_SHORTHAND' && (
                        <select
                          value={psuRailShorthand}
                          onChange={(e) =>
                            setPsuRailShorthand(
                              e.target.value as
                                | 'Connect Power'
                                | 'Engage Ignition'
                                | 'Disengage Ignition'
                                | 'Connect Ground'
                            )
                          }
                          aria-label="ECU Harness Power Shorthand"
                          className="w-full rounded-[2px] border border-[#323a48] bg-[#151a24] px-2 py-1.5 text-[11px] text-slate-100 focus:border-emerald-400 focus:outline-none cursor-pointer"
                        >
                          <option value="Connect Power">Connect Power (KL30 +12V &amp; PSU ON)</option>
                          <option value="Engage Ignition">Engage Ignition (KL15 +12V &amp; PSU ON)</option>
                          <option value="Disengage Ignition">Disengage Ignition (Open KL15)</option>
                          <option value="Connect Ground">Connect Ground (KL31 Chassis GND)</option>
                        </select>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Digital Multimeter (DMM) State Step Composer */}
                <div className="rounded-[2px] border border-amber-500/35 bg-[#0e131a] p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-mono font-bold uppercase tracking-wider text-amber-300">
                      <Gauge className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                      <span>2. Digital Multimeter (DMM) State Step</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleAppendDmmStep}
                      data-testid="append-dmm-step-btn"
                      className="hw-btn hw-btn-amber inline-flex items-center gap-1 px-2 py-1 rounded-[2px] text-[10px] font-mono font-bold uppercase cursor-pointer"
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" />
                      <span>Add DMM Step</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">DMM Action Type</label>
                      <select
                        value={dmmAction}
                        onChange={(e) => setDmmAction(e.target.value as DmmComposerAction)}
                        aria-label="Multimeter State Action Type"
                        className="w-full rounded-[2px] border border-[#323a48] bg-[#151a24] px-2 py-1.5 text-[11px] text-slate-100 focus:border-amber-400 focus:outline-none cursor-pointer"
                      >
                        <option value="SET_MODE_RANGE">Set Measurement Mode &amp; Range</option>
                        <option value="ATTACH_RED_PROBE">Place (+) RED Probe Terminal</option>
                        <option value="ATTACH_BLACK_PROBE">Place (-) BLACK COM Terminal</option>
                        <option value="SET_HOLD">Latch / Release Reading HOLD</option>
                        <option value="PROBE_UTILITY">Swap / Disconnect Probes / Auto-Range</option>
                        <option value="SET_POWER">Switch Multimeter Power (ON / OFF)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Target State</label>
                      {dmmAction === 'SET_MODE_RANGE' && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <select
                            value={dmmMode}
                            onChange={(e) => setDmmMode(e.target.value as MultimeterMode)}
                            aria-label="Multimeter Mode"
                            className="w-full rounded-[2px] border border-[#323a48] bg-[#151a24] px-1.5 py-1.5 text-[10.5px] text-amber-300 font-bold focus:border-amber-400 focus:outline-none cursor-pointer"
                          >
                            {(Object.keys(DMM_MODE_LABELS) as MultimeterMode[]).map((m) => (
                              <option key={m} value={m}>
                                {DMM_MODE_LABELS[m]}
                              </option>
                            ))}
                          </select>
                          <select
                            value={dmmRangeOption}
                            onChange={(e) => setDmmRangeOption(e.target.value)}
                            aria-label="Multimeter Range"
                            className="w-full rounded-[2px] border border-[#323a48] bg-[#151a24] px-1.5 py-1.5 text-[10.5px] text-slate-100 focus:border-amber-400 focus:outline-none cursor-pointer"
                          >
                            {(DMM_MANUAL_RANGE_OPTIONS[dmmMode] || []).map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {dmmAction === 'ATTACH_RED_PROBE' && (
                        <select
                          value={dmmProbeTarget}
                          onChange={(e) => setDmmProbeTarget(e.target.value)}
                          aria-label="Red Probe Target Terminal"
                          className="w-full rounded-[2px] border border-rose-500/50 bg-[#151a24] px-2 py-1.5 text-[11px] text-rose-200 focus:border-rose-400 focus:outline-none cursor-pointer"
                        >
                          {terminalOptions.map((t) => (
                            <option key={`red-${t.value}`} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      )}

                      {dmmAction === 'ATTACH_BLACK_PROBE' && (
                        <select
                          value={dmmBlackProbeTarget}
                          onChange={(e) => setDmmBlackProbeTarget(e.target.value)}
                          aria-label="Black COM Probe Target Terminal"
                          className="w-full rounded-[2px] border border-[#384150] bg-[#151a24] px-2 py-1.5 text-[11px] text-slate-200 focus:border-slate-400 focus:outline-none cursor-pointer"
                        >
                          {terminalOptions.map((t) => (
                            <option key={`blk-${t.value}`} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      )}

                      {dmmAction === 'SET_HOLD' && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDmmHoldValue(true)}
                            className={`hw-btn py-1 rounded-[2px] text-[10px] font-bold cursor-pointer ${
                              dmmHoldValue ? 'hw-btn-amber' : 'text-slate-400'
                            }`}
                          >
                            HOLD LATCH ON
                          </button>
                          <button
                            type="button"
                            onClick={() => setDmmHoldValue(false)}
                            className={`hw-btn py-1 rounded-[2px] text-[10px] font-bold cursor-pointer ${
                              !dmmHoldValue ? 'hw-btn-green' : 'text-slate-400'
                            }`}
                          >
                            RELEASE HOLD
                          </button>
                        </div>
                      )}

                      {dmmAction === 'PROBE_UTILITY' && (
                        <select
                          value={dmmUtility}
                          onChange={(e) =>
                            setDmmUtility(
                              e.target.value as 'SWAP_PROBES' | 'DISCONNECT_PROBES' | 'AUTO_RANGE'
                            )
                          }
                          aria-label="Multimeter Probe Utility"
                          className="w-full rounded-[2px] border border-[#323a48] bg-[#151a24] px-2 py-1.5 text-[11px] text-slate-100 focus:border-amber-400 focus:outline-none cursor-pointer"
                        >
                          <option value="AUTO_RANGE">Enable DMM Auto-Range</option>
                          <option value="SWAP_PROBES">Swap Red (+) and Black COM (-) Probes</option>
                          <option value="DISCONNECT_PROBES">Disconnect Both DMM Probes</option>
                        </select>
                      )}

                      {dmmAction === 'SET_POWER' && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDmmPowerState(true)}
                            className={`hw-btn py-1 rounded-[2px] text-[10px] font-bold cursor-pointer ${
                              dmmPowerState ? 'hw-btn-green' : 'text-slate-400'
                            }`}
                          >
                            METER PWR ON
                          </button>
                          <button
                            type="button"
                            onClick={() => setDmmPowerState(false)}
                            className={`hw-btn py-1 rounded-[2px] text-[10px] font-bold cursor-pointer ${
                              !dmmPowerState
                                ? 'border-rose-500/70 bg-rose-950/60 text-rose-200'
                                : 'text-slate-400'
                            }`}
                          >
                            METER PWR OFF
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Ordered Sequence Steps List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold text-slate-200 uppercase tracking-wide">
                    Mapped State Sequence ({steps.filter((s) => s.trim()).length} Steps)
                  </span>
                  <button
                    type="button"
                    onClick={() => setSteps((prev) => (prev.length < 20 ? [...prev, ''] : prev))}
                    className="hw-btn inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] text-[10px] font-mono text-amber-300 hover:text-amber-200 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" aria-hidden="true" />
                    <span>Add Custom Step</span>
                  </button>
                </div>

                <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                  {steps.map((stepVal, idx) => {
                    const preview = stepPreviews[idx];
                    const hasText = stepVal.trim().length > 0;
                    const isValidStep =
                      hasText && preview.matched && preview.status !== 'FAILED';

                    return (
                      <div
                        key={idx}
                        className="rounded-[2px] border border-[#2a313e] bg-[#0b0e14] p-2 space-y-1"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 text-[10.5px] font-mono tabular-nums text-slate-400 shrink-0">
                            {String(idx + 1).padStart(2, '0')}.
                          </span>
                          {hasText && renderStepInstrumentBadge(stepVal)}
                          <input
                            type="text"
                            value={stepVal}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSteps((prev) => prev.map((s, i) => (i === idx ? val : s)));
                              setBuilderError(null);
                            }}
                            aria-label={`Sequence step ${idx + 1}`}
                            placeholder='e.g. "Set PSU preset to 14.4V charging" or "Set multimeter to diode"'
                            className="flex-1 min-w-0 rounded-[2px] border border-[#2d3544] bg-[#131822] px-2 py-1 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleMoveStep(idx, -1)}
                            disabled={idx === 0}
                            aria-label={`Move step ${idx + 1} up`}
                            className="hw-btn inline-flex h-6 w-6 items-center justify-center rounded-[2px] text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3 h-3" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveStep(idx, 1)}
                            disabled={idx === steps.length - 1}
                            aria-label={`Move step ${idx + 1} down`}
                            className="hw-btn inline-flex h-6 w-6 items-center justify-center rounded-[2px] text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3 h-3" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveStep(idx)}
                            aria-label={`Remove step ${idx + 1}`}
                            className="hw-btn inline-flex h-6 w-6 items-center justify-center rounded-[2px] text-slate-400 hover:text-rose-300 cursor-pointer"
                          >
                            <X className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </div>

                        {hasText && (
                          <p
                            className={`pl-6 text-[10px] font-mono ${
                              isValidStep ? 'text-emerald-400' : 'text-amber-300'
                            }`}
                          >
                            {isValidStep
                              ? `✓ Verified: ${preview.actionDescription}`
                              : preview.matched
                              ? `▲ ${preview.actionDescription}`
                              : '▲ Unmatched hardware phrase (will fallback to Offline AI)'}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Quick Snippets Bar */}
                <div className="pt-1 space-y-1">
                  <span className="block text-[10px] font-mono text-slate-400">
                    Quick-Insert Common Instrument Chips:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {COMMON_MACRO_STEP_SNIPPETS.map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => appendInstructionStep(chip.instruction)}
                        className="hw-btn rounded-[2px] px-1.5 py-0.5 text-[9.5px] font-mono text-slate-300 hover:text-amber-200 cursor-pointer"
                      >
                        + {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {builderError && (
                <p role="alert" className="text-[11px] font-mono text-amber-300">
                  {builderError}
                </p>
              )}

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#262e3d]">
                <button
                  type="button"
                  onClick={() => {
                    const cleanSteps = steps.map((s) => s.trim()).filter(Boolean);
                    if (cleanSteps.length === 0) return;
                    const previewResult = executeMacroSequence(
                      {
                        name: macroName.trim() || triggerPhrase.trim() || 'Test Sequence',
                        triggerPhrase: triggerPhrase.trim() || 'Test Sequence',
                        steps: cleanSteps,
                      },
                      pins,
                      buildLocalVoiceActions()
                    );
                    setLastExecutionResult(previewResult);
                  }}
                  data-testid="test-run-macro-sequence-btn"
                  className="hw-btn hw-btn-amber inline-flex items-center gap-1 rounded-[2px] px-2.5 py-1.5 text-[10.5px] font-mono font-bold uppercase cursor-pointer"
                >
                  <Play className="w-3 h-3" aria-hidden="true" />
                  <span>Test Sequence Live</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsBuilderOpen(false);
                      setEditingMacroId(null);
                      setBuilderError(null);
                    }}
                    className="hw-btn rounded-[2px] px-2.5 py-1.5 text-[10.5px] font-mono text-slate-300 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-testid="save-voice-macro-sequence-btn"
                    className="hw-btn hw-btn-green rounded-[2px] px-3 py-1.5 text-[10.5px] font-mono font-bold uppercase tracking-wider cursor-pointer"
                  >
                    {editingMacroId ? 'Update Sequence' : 'Save Voice Macro'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Last Sequence Execution Feedback Banner */}
          {lastExecutionResult && (
            <div
              role="status"
              data-testid="macro-execution-feedback-banner"
              className="rounded-[2px] border border-emerald-500/60 bg-emerald-950/35 px-2.5 py-2 text-[10.5px] font-mono space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-bold text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    Executed “{lastExecutionResult.macroName}” ({lastExecutionResult.executedCount}/
                    {lastExecutionResult.stepResults.length} steps applied)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setLastExecutionResult(null)}
                  className="text-slate-400 hover:text-white text-[10px] cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
              <p className="text-slate-300 text-[10px] leading-snug break-words">
                {lastExecutionResult.actionDescription}
              </p>
            </div>
          )}

          {/* Filter & Restore Bar */}
          <div className="flex items-center justify-between gap-1.5">
            <div className="inline-flex rounded-[2px] bg-[#0b0e14] p-0.5 border border-[#2a313d] text-[10px] font-mono">
              {(
                [
                  { id: 'ALL', label: `All (${macros.length})` },
                  { id: 'CUSTOM', label: `Custom (${macros.filter((m) => !m.isPreset).length})` },
                  { id: 'PRESET', label: `Presets (${macros.filter((m) => m.isPreset).length})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setListFilter(tab.id)}
                  className={`px-2 py-1 rounded-[2px] transition cursor-pointer ${
                    listFilter === tab.id
                      ? 'bg-[#262d38] text-amber-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => voiceMacroService.resetPresets()}
              title="Restore factory PSU & DMM voice macro presets"
              className="hw-btn inline-flex items-center gap-1 px-2 py-1 rounded-[2px] text-[10px] font-mono text-slate-300 hover:text-white cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>Restore Presets</span>
            </button>
          </div>

          {/* Mapped Voice Macro Cards */}
          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-0.5">
            {filteredMacros.map((macro) => (
              <article
                key={macro.id}
                data-testid={`mapped-macro-card-${macro.id}`}
                className="rounded-[2px] border border-[#2b323f] bg-[#151922] p-2.5 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-slate-100 truncate">{macro.name}</h4>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-[2px] border border-[#364052] bg-[#0e1218] text-slate-300 shrink-0">
                        {macro.isPreset ? 'PRESET' : 'CUSTOM'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10.5px] font-mono text-amber-300 truncate">
                      Voice Trigger: “{macro.triggerPhrase}”
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleExecuteMacro(macro)}
                    data-testid={`execute-mapped-macro-${macro.id}`}
                    className="hw-btn hw-btn-green inline-flex items-center gap-1 px-2.5 py-1 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider shrink-0 cursor-pointer"
                  >
                    <Play className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span>Run</span>
                  </button>
                </div>

                {macro.description && (
                  <p className="text-[10.5px] text-slate-400 leading-snug">{macro.description}</p>
                )}

                <ol className="space-y-1 border-t border-[#232a36] pt-1.5 text-[10.5px] font-mono text-slate-300">
                  {macro.steps.map((step, idx) => (
                    <li
                      key={`${macro.id}-step-${idx}`}
                      className="flex items-center gap-1.5 min-w-0"
                    >
                      <span className="text-slate-500 tabular-nums shrink-0">
                        {String(idx + 1).padStart(2, '0')}.
                      </span>
                      {renderStepInstrumentBadge(step)}
                      <span className="truncate">{step}</span>
                    </li>
                  ))}
                </ol>

                <div className="flex items-center justify-end gap-2 border-t border-[#232a36] pt-1.5 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => openEditBuilder(macro)}
                    className="inline-flex items-center gap-1 text-slate-300 hover:text-amber-300 px-1.5 py-0.5 rounded-[2px] cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" aria-hidden="true" />
                    <span>Edit Sequence</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => voiceMacroService.duplicateMacro(macro.id)}
                    className="inline-flex items-center gap-1 text-slate-300 hover:text-cyan-300 px-1.5 py-0.5 rounded-[2px] cursor-pointer"
                  >
                    <Copy className="w-3 h-3" aria-hidden="true" />
                    <span>Duplicate</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => voiceMacroService.deleteMacro(macro.id)}
                    className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-300 px-1.5 py-0.5 rounded-[2px] cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" aria-hidden="true" />
                    <span>Delete</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
