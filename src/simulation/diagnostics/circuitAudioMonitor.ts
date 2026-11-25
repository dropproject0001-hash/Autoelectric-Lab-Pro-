/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import {
  EcuPin,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../../types/ecu';
import { CircuitSolution } from '../../utils/circuitSolver';

export type CircuitAnomalyKind =
  | 'SHORT_CIRCUIT'
  | 'VOLTAGE_DROP'
  | 'ABNORMAL_BEHAVIOR';

export type CircuitAnomalySeverity = 'CRITICAL' | 'WARNING';

export interface CircuitAudioAlertItem {
  id: string;
  kind: CircuitAnomalyKind;
  severity: CircuitAnomalySeverity;
  title: string;
  detail: string;
  pinOrNodeLabel: string;
  measuredLabel: string;
  expectedLabel: string;
  recommendedAction: string;
}

export interface CircuitAnomalySnapshot {
  overallSeverity: 'NOMINAL' | 'WARNING' | 'CRITICAL';
  primaryKind: 'NONE' | CircuitAnomalyKind;
  signature: string;
  alerts: CircuitAudioAlertItem[];
}

export interface EvaluateCircuitAnomaliesParams {
  powerSupply: PowerSupplyState;
  pins: EcuPin[];
  wires: WireConnection[];
  faults: InjectedFault[];
  multimeter: MultimeterState;
  circuitSolution: CircuitSolution;
}

/**
 * Deterministic real-time MNA circuit anomaly detector for Short Circuits,
 * Voltage Drops / Rail Sag, and Abnormal Bench Behavior.
 */
export function evaluateCircuitAnomalies(
  params: EvaluateCircuitAnomaliesParams
): CircuitAnomalySnapshot {
  const {
    powerSupply,
    pins,
    wires,
    faults,
    multimeter,
    circuitSolution,
  } = params;

  const alerts: CircuitAudioAlertItem[] = [];
  const isEnergized = powerSupply.isOutputEnabled && powerSupply.voltageSetting > 0.5;
  const targetSupplyV = powerSupply.voltageSetting;

  // ---------------------------------------------------------------------------
  // 1. SHORT CIRCUIT & OVER-CURRENT PROTECTION DETECTION
  // ---------------------------------------------------------------------------
  if (isEnergized && circuitSolution.isSupplyCurrentTripped) {
    alerts.push({
      id: 'ocp-supply-trip',
      kind: 'SHORT_CIRCUIT',
      severity: 'CRITICAL',
      title: 'Bench PSU Over-Current Protection (OCP) Tripped',
      detail: `Supply current draw (${circuitSolution.supplyCurrentDrawAmps.toFixed(2)} A) exceeded the ${powerSupply.currentLimit.toFixed(2)} A limit due to a low-impedance short circuit.`,
      pinOrNodeLabel: 'PSU B+ BUS',
      measuredLabel: `${circuitSolution.supplyCurrentDrawAmps.toFixed(2)} A`,
      expectedLabel: `≤ ${powerSupply.currentLimit.toFixed(2)} A`,
      recommendedAction:
        'Isolate shorted B+ or 5V VREF branch immediately before increasing current limit.',
    });
  }

  // Check explicit injected short faults
  if (isEnergized) {
    for (const fault of faults) {
      if (fault.faultType === 'SHORT_TO_GND' || fault.faultType === 'SHORT_TO_VBAT') {
        const pin = pins.find((p) => p.id === fault.pinId);
        const pinLabel = pin ? `Pin ${pin.pinNumber} (${pin.label})` : fault.pinId;
        const measuredV = circuitSolution.nodeVoltages[fault.pinId];
        const measuredStr =
          typeof measuredV === 'number' && Number.isFinite(measuredV)
            ? `${measuredV.toFixed(2)} V`
            : 'N/A';

        alerts.push({
          id: `short-fault-${fault.pinId}-${fault.faultType}`,
          kind: 'SHORT_CIRCUIT',
          severity: 'CRITICAL',
          title:
            fault.faultType === 'SHORT_TO_GND'
              ? `Direct Short to Ground on ${pinLabel}`
              : `Short to Battery (+VBAT) on ${pinLabel}`,
          detail: `${fault.description}. Node clamped at ${measuredStr}.`,
          pinOrNodeLabel: pinLabel,
          measuredLabel: measuredStr,
          expectedLabel: pin ? `${pin.nominalVoltage.toFixed(2)} V` : 'Nominal',
          recommendedAction:
            fault.faultType === 'SHORT_TO_GND'
              ? 'Disconnect sensor/actuator harness branch and measure resistance to KL31 ground with PSU OFF.'
              : 'Inspect harness loom for chafed insulation shorting against KL30/KL15 +12V feed.',
        });
      }
    }
  }

  // Check 5V Reference Rail collapse or over-voltage (Short to GND or Short to B+)
  if (isEnergized) {
    const vrefPin = pins.find((p) => p.id === 'ecu-pin-5' || p.category === 'reference');
    if (vrefPin) {
      const vrefMeasured = circuitSolution.nodeVoltages[vrefPin.id];
      if (typeof vrefMeasured === 'number' && Number.isFinite(vrefMeasured)) {
        if (vrefMeasured < 1.5 && !alerts.some((a) => a.id.includes(vrefPin.id))) {
          alerts.push({
            id: `vref-short-collapse-${vrefPin.id}`,
            kind: 'SHORT_CIRCUIT',
            severity: 'CRITICAL',
            title: `5V Reference Rail Collapse (${vrefPin.label})`,
            detail: `Regulated 5.00V LDO output collapsed to ${vrefMeasured.toFixed(2)} V under heavy short-circuit load.`,
            pinOrNodeLabel: `Pin ${vrefPin.pinNumber} (${vrefPin.label})`,
            measuredLabel: `${vrefMeasured.toFixed(2)} V`,
            expectedLabel: '5.00 V ± 0.10 V',
            recommendedAction:
              'Unplug shared 5V sensors (TPS, MAP) one at a time while monitoring Pin 5 until 5.00V recovers.',
          });
        } else if (vrefMeasured > 5.8 && !alerts.some((a) => a.id.includes(vrefPin.id))) {
          alerts.push({
            id: `vref-overvoltage-${vrefPin.id}`,
            kind: 'SHORT_CIRCUIT',
            severity: 'CRITICAL',
            title: `5V Reference Over-Voltage Short (${vrefPin.label})`,
            detail: `5V sensor rail is back-fed to ${vrefMeasured.toFixed(2)} V (risk of ECU ADC/MCU damage).`,
            pinOrNodeLabel: `Pin ${vrefPin.pinNumber} (${vrefPin.label})`,
            measuredLabel: `${vrefMeasured.toFixed(2)} V`,
            expectedLabel: '5.00 V',
            recommendedAction:
              'Disable Bench PSU immediately and inspect 5V VREF wiring for contact with 12V KL30/KL15.',
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2. VOLTAGE DROP, RAIL SAG & GROUND OFFSET DETECTION
  // ---------------------------------------------------------------------------
  if (isEnergized && !circuitSolution.isSupplyCurrentTripped) {
    // 2a. Main Power Supply Pins (KL30 / KL15) voltage drop or brownout
    const powerPins = pins.filter((p) => p.category === 'power');
    for (const pPin of powerPins) {
      const vMeasured = circuitSolution.nodeVoltages[pPin.id];
      if (typeof vMeasured === 'number' && Number.isFinite(vMeasured)) {
        const dropV = targetSupplyV - vMeasured;
        if (dropV >= 0.8 || vMeasured < 10.5) {
          alerts.push({
            id: `vdrop-power-${pPin.id}`,
            kind: 'VOLTAGE_DROP',
            severity: vMeasured < 9.5 ? 'CRITICAL' : 'WARNING',
            title: `Supply Voltage Drop / Sag on Pin ${pPin.pinNumber} (${pPin.label})`,
            detail: `Measured ${vMeasured.toFixed(2)} V against ${targetSupplyV.toFixed(2)} V PSU setting (ΔV = -${dropV.toFixed(2)} V).`,
            pinOrNodeLabel: `Pin ${pPin.pinNumber} (${pPin.label})`,
            measuredLabel: `${vMeasured.toFixed(2)} V`,
            expectedLabel: `${targetSupplyV.toFixed(2)} V`,
            recommendedAction:
              'Perform voltage-drop test across B+ feed lead, ignition switch contact, and ECU header pins.',
          });
        }
      }
    }

    // 2b. 5V Reference Rail sag (between 1.50V and 4.65V)
    const vrefPin = pins.find((p) => p.id === 'ecu-pin-5' || p.category === 'reference');
    if (vrefPin) {
      const vrefMeasured = circuitSolution.nodeVoltages[vrefPin.id];
      if (
        typeof vrefMeasured === 'number' &&
        Number.isFinite(vrefMeasured) &&
        vrefMeasured >= 1.5 &&
        vrefMeasured <= 4.65
      ) {
        const dropV = 5.0 - vrefMeasured;
        alerts.push({
          id: `vdrop-vref-${vrefPin.id}`,
          kind: 'VOLTAGE_DROP',
          severity: 'WARNING',
          title: `5V Reference Voltage Sag (${vrefPin.label})`,
          detail: `Sensor 5V reference sagged to ${vrefMeasured.toFixed(2)} V (-${dropV.toFixed(2)} V below 5.00V nominal).`,
          pinOrNodeLabel: `Pin ${vrefPin.pinNumber} (${vrefPin.label})`,
          measuredLabel: `${vrefMeasured.toFixed(2)} V`,
          expectedLabel: '4.90 V – 5.10 V',
          recommendedAction:
            'Check for resistive overload on the 5V bus or high-resistance corroded terminal on Pin 5.',
        });
      }
    }

    // 2c. Ground Offset / Elevated Ground Return (KL31 / SGND > 0.25V)
    const groundPins = pins.filter((p) => p.category === 'ground');
    for (const gPin of groundPins) {
      const vGnd = circuitSolution.nodeVoltages[gPin.id];
      if (typeof vGnd === 'number' && Number.isFinite(vGnd) && Math.abs(vGnd) > 0.25) {
        alerts.push({
          id: `vdrop-gnd-${gPin.id}`,
          kind: 'VOLTAGE_DROP',
          severity: Math.abs(vGnd) > 0.8 ? 'CRITICAL' : 'WARNING',
          title: `Elevated Ground Voltage Drop on Pin ${gPin.pinNumber} (${gPin.label})`,
          detail: `Ground reference shifted to ${vGnd.toFixed(2)} V instead of 0.00 V, skewing sensor ADC readings.`,
          pinOrNodeLabel: `Pin ${gPin.pinNumber} (${gPin.label})`,
          measuredLabel: `${vGnd.toFixed(2)} V`,
          expectedLabel: '≤ 0.05 V',
          recommendedAction:
            'Inspect chassis/sensor ground strap (KL31 / SGND) for high resistance or open return path.',
        });
      }
    }

    // 2d. High-Resistance Injected Faults (50Ω, 250Ω, 1kΩ)
    for (const fault of faults) {
      if (
        fault.faultType === 'HIGH_RESISTANCE_50R' ||
        fault.faultType === 'HIGH_RESISTANCE_250R' ||
        fault.faultType === 'HIGH_RESISTANCE_1K'
      ) {
        const pin = pins.find((p) => p.id === fault.pinId);
        const pinLabel = pin ? `Pin ${pin.pinNumber} (${pin.label})` : fault.pinId;
        const vNode = circuitSolution.nodeVoltages[fault.pinId];
        const vStr =
          typeof vNode === 'number' && Number.isFinite(vNode) ? `${vNode.toFixed(2)} V` : 'N/A';

        alerts.push({
          id: `vdrop-highres-${fault.pinId}-${fault.faultType}`,
          kind: 'VOLTAGE_DROP',
          severity: 'WARNING',
          title: `Parasitic Voltage Drop / High Resistance on ${pinLabel}`,
          detail: `${fault.description}. Loaded node voltage shifted to ${vStr}.`,
          pinOrNodeLabel: pinLabel,
          measuredLabel: vStr,
          expectedLabel: pin ? `${pin.nominalVoltage.toFixed(2)} V` : 'Nominal',
          recommendedAction:
            'Measure voltage drop across the connector terminal under load and clean/re-tension pin contacts.',
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. ABNORMAL BENCH BEHAVIOR (DMM LIVE LOCKOUT, OPEN FAULTS, CUT WIRES, CAN BUS FAULT)
  // ---------------------------------------------------------------------------
  if (isEnergized) {
    for (const fault of faults) {
      if (fault.faultType === 'OPEN_CIRCUIT') {
        const pin = pins.find((p) => p.id === fault.pinId);
        const pinLabel = pin ? `Pin ${pin.pinNumber} (${pin.label})` : fault.pinId;
        const vNode = circuitSolution.nodeVoltages[fault.pinId];
        const vStr =
          typeof vNode === 'number' && Number.isFinite(vNode) ? `${vNode.toFixed(2)} V` : 'OPEN';
        alerts.push({
          id: `abnormal-open-fault-${fault.pinId}`,
          kind: 'ABNORMAL_BEHAVIOR',
          severity: 'WARNING',
          title: `Open Circuit Signal Interruption on ${pinLabel}`,
          detail: `${fault.description}. Terminal node floating/pulled to ${vStr}.`,
          pinOrNodeLabel: pinLabel,
          measuredLabel: vStr,
          expectedLabel: pin ? `${pin.nominalVoltage.toFixed(2)} V` : 'Connected',
          recommendedAction:
            'Perform end-to-end harness continuity check with PSU OFF and inspect connector terminal crimp.',
        });
      }
    }
  }
  if (multimeter.isPowered && circuitSolution.multimeterReading.isWarning) {
    alerts.push({
      id: `dmm-warning-${multimeter.mode}`,
      kind: 'ABNORMAL_BEHAVIOR',
      severity: 'WARNING',
      title: `DMM Live-Circuit Protection Warning (${multimeter.mode})`,
      detail:
        circuitSolution.multimeterReading.warningMessage ||
        'Attempting resistance/continuity/diode measurement on an energized circuit.',
      pinOrNodeLabel: `${multimeter.redProbe.attachedLabel} ↔ ${multimeter.blackProbe.attachedLabel}`,
      measuredLabel: circuitSolution.multimeterReading.display,
      expectedLabel: 'PSU OFF (0.00 V)',
      recommendedAction:
        'Switch DMM to DCV mode or disable Bench Power Supply output before probing resistance/continuity.',
    });
  }

  if (isEnergized) {
    const cutWires = wires.filter((w) => w.isCut);
    for (const cutWire of cutWires) {
      alerts.push({
        id: `abnormal-cut-wire-${cutWire.id}`,
        kind: 'ABNORMAL_BEHAVIOR',
        severity: 'WARNING',
        title: `Open / Cut Harness Lead: ${cutWire.label}`,
        detail: `Signal continuity interrupted between ${cutWire.sourcePinId} and ${cutWire.targetPinId} while bench is energized.`,
        pinOrNodeLabel: cutWire.label,
        measuredLabel: 'OPEN (∞ Ω)',
        expectedLabel: `${cutWire.resistance.toFixed(2)} Ω`,
        recommendedAction:
          'Reconnect or splice the open harness wire and clear resulting OBD-II trouble codes.',
      });
    }

    // Check CAN_H / CAN_L bus health when energized
    const canH = circuitSolution.nodeVoltages['ecu-pin-13'];
    const canL = circuitSolution.nodeVoltages['ecu-pin-14'];
    if (
      typeof canH === 'number' &&
      typeof canL === 'number' &&
      Number.isFinite(canH) &&
      Number.isFinite(canL)
    ) {
      const canSum = canH + canL;
      if (canH < 2.0 || canL > 3.0 || Math.abs(canSum - 5.0) > 1.1) {
        alerts.push({
          id: 'abnormal-can-bus-imbalance',
          kind: 'ABNORMAL_BEHAVIOR',
          severity: 'WARNING',
          title: 'CAN Bus Differential / Common-Mode Anomaly',
          detail: `CAN_H (${canH.toFixed(2)} V) + CAN_L (${canL.toFixed(2)} V) = ${canSum.toFixed(2)} V deviates from ISO 11898 5.00V balanced pair.`,
          pinOrNodeLabel: 'CAN_H / CAN_L (Pins 13 & 14)',
          measuredLabel: `${canH.toFixed(2)}V / ${canL.toFixed(2)}V`,
          expectedLabel: '2.50V / 2.50V (Sum ~5.0V)',
          recommendedAction:
            'Verify 60 Ω parallel termination resistance between Pins 13 and 14 with PSU OFF.',
        });
      }
    }
  }

  const hasCritical = alerts.some((a) => a.severity === 'CRITICAL');
  const overallSeverity: 'NOMINAL' | 'WARNING' | 'CRITICAL' =
    alerts.length === 0 ? 'NOMINAL' : hasCritical ? 'CRITICAL' : 'WARNING';

  const hasShort = alerts.some((a) => a.kind === 'SHORT_CIRCUIT');
  const hasVDrop = alerts.some((a) => a.kind === 'VOLTAGE_DROP');
  const primaryKind: 'NONE' | CircuitAnomalyKind =
    alerts.length === 0
      ? 'NONE'
      : hasShort
        ? 'SHORT_CIRCUIT'
        : hasVDrop
          ? 'VOLTAGE_DROP'
          : 'ABNORMAL_BEHAVIOR';

  const signature = alerts.map((a) => `${a.id}:${a.severity}`).join('|');

  return {
    overallSeverity,
    primaryKind,
    signature,
    alerts,
  };
}
