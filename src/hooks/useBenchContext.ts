/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { useMemo } from 'react';
import type {
  BilingualLang,
  BenchTelemetry,
  MultimeterToleranceHook,
  PcbOverlayHook,
} from '../types/aiAssistant';
import type {
  EcuPin,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
} from '../types/ecu';
import type { CircuitSolution } from '../utils/circuitSolver';
import { getValidatedPinVoltage } from '../utils/benchStateReconciliation';
import { formatBenchSnapshotSummary } from '../services/ai/offlineEngine';

export interface UseBenchContextInput {
  vehicleLabel?: string;
  ecuProfileLabel?: string;
  powerSupply: PowerSupplyState;
  circuitSolution: CircuitSolution;
  multimeter: MultimeterState;
  multimeterDisplay: string;
  multimeterUnit: string;
  multimeterWarning?: string;
  pins: EcuPin[];
  faults: InjectedFault[];
  selectedPinId: string | null;
  multimeterToleranceHook?: MultimeterToleranceHook;
  pcbOverlayHook?: PcbOverlayHook;
}

export function buildBenchTelemetry(input: UseBenchContextInput): BenchTelemetry {
  const selectedPinObj = input.selectedPinId
    ? input.pins.find((p) => p.id === input.selectedPinId)
    : undefined;

  const resolvedPin = selectedPinObj
    ? getValidatedPinVoltage(input.circuitSolution, selectedPinObj.id)
    : { voltage: null, status: 'UNAVAILABLE' as const };
  const measuredVoltage = resolvedPin.voltage;

  return {
    vehicleLabel: input.vehicleLabel || 'Universal ECU Bench',
    ecuProfileLabel: input.ecuProfileLabel || 'Standard Automotive ECU Bench',
    psuEnabled: input.powerSupply.isOutputEnabled,
    psuVoltageSetting: input.powerSupply.voltageSetting,
    psuCurrentLimitAmps: input.powerSupply.currentLimit,
    psuCurrentDrawAmps: input.circuitSolution.supplyCurrentDrawAmps,
    isOcpTripped: input.circuitSolution.isSupplyCurrentTripped,
    activeDtcs: input.circuitSolution.activeDTCs.map((d) => ({
      code: d.code,
      severity: d.severity,
      description: d.description,
    })),
    activeFaults: input.faults.map((f) => ({
      pinId: f.pinId,
      faultType: f.faultType,
      description: f.description,
    })),
    selectedPin: selectedPinObj
      ? {
          id: selectedPinObj.id,
          pinNumber: selectedPinObj.pinNumber,
          label: selectedPinObj.label,
          name: selectedPinObj.name,
          measuredVoltage,
          nominalVoltage: selectedPinObj.nominalVoltage,
        }
      : undefined,
    dmm: {
      isPowered: input.multimeter.isPowered,
      mode: input.multimeter.mode,
      displayReading: input.multimeterDisplay,
      unit: input.multimeterUnit,
      redProbeLabel: input.multimeter.redProbe.attachedLabel,
      blackProbeLabel: input.multimeter.blackProbe.attachedLabel,
      warning: input.multimeterWarning,
      evidenceStatus: input.circuitSolution.multimeterReading.evidenceStatus,
    },
    solverStatus: input.circuitSolution.solverStatus,
    unresolvedNodes: input.circuitSolution.unresolvedNodes,
    validatedNodeVoltages: input.circuitSolution.validatedNodeVoltages,
    multimeterToleranceHook: input.multimeterToleranceHook,
    pcbOverlayHook: input.pcbOverlayHook,
  };
}

export function buildQuickFillPrompt(
  telemetry: BenchTelemetry,
  lang: BilingualLang
): string {
  if (telemetry.isOcpTripped) {
    return lang === 'TL'
      ? `Nag-OCP Trip ang Power Supply ko sa ${telemetry.psuCurrentDrawAmps.toFixed(2)}A, ano ang ligtas na unang hakbang?`
      : `My Bench Power Supply tripped OCP at ${telemetry.psuCurrentDrawAmps.toFixed(2)}A, what is the safe first check?`;
  }

  if (telemetry.activeDtcs.length > 0) {
    const dtc = telemetry.activeDtcs[0];
    return lang === 'TL'
      ? `Boss ano ang sanhi ng ${dtc.code} sa bench at paano i-verify gamit ang multimeter?`
      : `What causes ${dtc.code} on the bench and how do I verify it safely with a multimeter?`;
  }

  if (telemetry.selectedPin) {
    const p = telemetry.selectedPin;
    return lang === 'TL'
      ? `Paano i-test ang Pin ${p.pinNumber} (${p.label}) nang ligtas sa bench?`
      : `How do I safely test Pin ${p.pinNumber} (${p.label}) on the ECU bench?`;
  }

  return lang === 'TL'
    ? 'Paano i-check ang CAN Bus 60 ohms termination sa Pin 13 at Pin 14?'
    : 'How do I verify the 60 ohm CAN Bus termination on Pin 13 and Pin 14?';
}

export function useBenchContext(input: UseBenchContextInput, lang: BilingualLang) {
  const telemetry = useMemo(() => {
    const nextTelemetry = buildBenchTelemetry(input);

    // Diagnostic debugging log: verify live data flow from circuitSolution into BenchTelemetry
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[useBenchContext] Reconciled live circuitSolution into BenchTelemetry:', {
        solverStatus: nextTelemetry.solverStatus,
        psu: {
          enabled: nextTelemetry.psuEnabled,
          voltageSetting: nextTelemetry.psuVoltageSetting,
          currentDrawAmps: nextTelemetry.psuCurrentDrawAmps,
          isOcpTripped: nextTelemetry.isOcpTripped,
        },
        dmm: {
          isPowered: nextTelemetry.dmm.isPowered,
          reading: `${nextTelemetry.dmm.displayReading} ${nextTelemetry.dmm.unit}`,
          mode: nextTelemetry.dmm.mode,
          evidenceStatus: nextTelemetry.dmm.evidenceStatus,
        },
        selectedPin: nextTelemetry.selectedPin
          ? {
              id: nextTelemetry.selectedPin.id,
              pinNumber: nextTelemetry.selectedPin.pinNumber,
              label: nextTelemetry.selectedPin.label,
              measuredVoltage: nextTelemetry.selectedPin.measuredVoltage,
            }
          : null,
        activeDtcsCount: nextTelemetry.activeDtcs.length,
        activeFaultsCount: nextTelemetry.activeFaults.length,
      });
    }

    return nextTelemetry;
  }, [
    input.circuitSolution,
    input.circuitSolution.supplyCurrentDrawAmps,
    input.circuitSolution.isSupplyCurrentTripped,
    input.circuitSolution.activeDTCs,
    input.circuitSolution.nodeVoltages,
    input.circuitSolution.validatedNodeVoltages,
    input.circuitSolution.unresolvedNodes,
    input.circuitSolution.nodeMeasurementStatuses,
    input.circuitSolution.solverStatus,
    input.circuitSolution.multimeterReading.value,
    input.circuitSolution.multimeterReading.display,
    input.circuitSolution.multimeterReading.unit,
    input.circuitSolution.multimeterReading.warningMessage,
    input.circuitSolution.multimeterReading.evidenceStatus,
    input.powerSupply,
    input.powerSupply.isOutputEnabled,
    input.powerSupply.voltageSetting,
    input.powerSupply.currentLimit,
    input.multimeter,
    input.multimeter.isPowered,
    input.multimeter.mode,
    input.multimeter.redProbe.attachedLabel,
    input.multimeter.redProbe.attachedToPinId,
    input.multimeter.blackProbe.attachedLabel,
    input.multimeter.blackProbe.attachedToPinId,
    input.multimeterDisplay,
    input.multimeterUnit,
    input.multimeterWarning,
    input.pins,
    input.faults,
    input.selectedPinId,
    input.vehicleLabel,
    input.ecuProfileLabel,
    input.multimeterToleranceHook,
    input.pcbOverlayHook,
  ]);

  const summaryText = useMemo(
    () => formatBenchSnapshotSummary(telemetry, lang),
    [telemetry, lang]
  );

  const quickFillPrompt = useMemo(
    () => buildQuickFillPrompt(telemetry, lang),
    [telemetry, lang]
  );

  return {
    telemetry,
    summaryText,
    quickFillPrompt,
  };
}
