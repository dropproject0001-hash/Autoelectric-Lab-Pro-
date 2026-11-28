/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { InjectedFault, MultimeterState, PowerSupplyState } from '../../types/ecu';
import {
  runUnifiedAiOrchestrator,
  type UnifiedOrchestratorResponse,
} from './unifiedAiOrchestrator';

export interface SimulationGuidanceInput {
  query: string;
  make?: string;
  model?: string;
  ecuName: string;
  ecuPartNumber?: string;
  selectedComponent?: string;
  injectedFaults: InjectedFault[];
  activeDtcs: string[];
  powerSupply: PowerSupplyState;
  multimeter: MultimeterState;
  dmmDisplayValue: string;
  rpm?: number;
}

/**
 * Connects live Virtual ECU Bench context (ECU, component, injected faults, DTCs,
 * simulated DMM & PSU readings) into the Unified AI Orchestrator so guidance
 * dynamically reflects the active simulation state + retrieved database evidence.
 */
export async function generateSimulationGuidedDiagnostic(
  input: SimulationGuidanceInput
): Promise<UnifiedOrchestratorResponse> {
  const faultLabels = input.injectedFaults
    .filter((f) => f.faultType !== 'NONE')
    .map((f) => `${f.pinId}:${f.faultType}${f.description ? ` (${f.description})` : ''}`);

  const psuSummary = input.powerSupply.isOutputEnabled
    ? `SIMULATED PSU ON @ ${input.powerSupply.voltageSetting.toFixed(1)}V / ${input.powerSupply.currentLimit.toFixed(1)}A limit`
    : 'SIMULATED PSU OFF (Key-OFF)';

  const dmmSummary = input.multimeter.isPowered
    ? `SIMULATED DMM [${input.multimeter.mode}] = ${input.dmmDisplayValue} (Red: ${input.multimeter.redProbe.attachedLabel}, Black: ${input.multimeter.blackProbe.attachedLabel})`
    : 'SIMULATED DMM OFF';

  return runUnifiedAiOrchestrator({
    query: input.query,
    make: input.make,
    model: input.model,
    ecuPartNumber: input.ecuPartNumber,
    simulationContext: {
      ecuName: input.ecuName,
      ecuPartNumber: input.ecuPartNumber,
      selectedComponent: input.selectedComponent,
      injectedFaults: faultLabels,
      activeDtcs: input.activeDtcs,
      psuSummary,
      dmmReadingSummary: dmmSummary,
      rpm: input.rpm,
    },
  });
}
