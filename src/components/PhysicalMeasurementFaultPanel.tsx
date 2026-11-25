/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Gauge,
  Wrench,
  X,
} from 'lucide-react';
import {
  DiagnosticEvidenceCategory,
  evaluatePhysicalBenchMeasurement,
  IgnitionMeasurementCondition,
  STANDARD_ECU_BENCH_PIN_SPECS,
} from '../simulation/diagnostics/physicalBenchFaultIsolationEngine';

export interface PhysicalMeasurementFaultPanelProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSupplyVoltageV?: number;
}

const CATEGORY_BADGE_STYLES: Record<
  DiagnosticEvidenceCategory,
  { label: string; badgeClass: string; description: string }
> = {
  OEM_VERIFIED: {
    label: 'OEM Verified',
    badgeClass: 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300',
    description: 'Confirmed manufacturer / DIN / ISO electrical specification',
  },
  CROSS_REFERENCED: {
    label: 'Cross Referenced',
    badgeClass: 'border-sky-500/60 bg-sky-500/15 text-sky-300',
    description: 'Supported by Bosch / Infineon / NXP transceiver or system basis datasheet',
  },
  CALCULATED_RESULT: {
    label: 'Calculated Result',
    badgeClass: 'border-amber-500/60 bg-amber-500/15 text-amber-300',
    description: 'Derived deterministically from measured values and circuit voltage-drop formulas',
  },
  ENGINEERING_HYPOTHESIS: {
    label: 'Engineering Hypothesis',
    badgeClass: 'border-purple-500/60 bg-purple-500/15 text-purple-300',
    description: 'Plausible hardware failure mode requiring physical technician verification',
  },
  AI_INFERRED: {
    label: 'AI Inferred',
    badgeClass: 'border-rose-500/60 bg-rose-500/15 text-rose-300',
    description: 'AI-generated suggestion — not confirmed technical data',
  },
};

const CONDITION_OPTIONS: Array<{ value: IgnitionMeasurementCondition; label: string }> = [
  { value: 'KEY_ON_ENGINE_OFF', label: 'Ignition ON / Engine OFF (KOEO)' },
  { value: 'ENGINE_CRANKING_RUNNING', label: 'Engine Cranking / Running (KOER)' },
  { value: 'IGNITION_OFF', label: 'Ignition OFF (Sleep / Ohmic Check)' },
];

export const PhysicalMeasurementFaultPanel: React.FC<PhysicalMeasurementFaultPanelProps> = ({
  isOpen,
  onClose,
  defaultSupplyVoltageV = 12.6,
}) => {
  const [selectedPinId, setSelectedPinId] = useState<string>('VREF_5V');
  const [condition, setCondition] =
    useState<IgnitionMeasurementCondition>('KEY_ON_ENGINE_OFF');
  const [measuredValue, setMeasuredValue] = useState<string>('2.10');
  const [supplyVoltage, setSupplyVoltage] = useState<string>(
    defaultSupplyVoltageV.toFixed(1)
  );

  const selectedSpec = useMemo(
    () =>
      STANDARD_ECU_BENCH_PIN_SPECS.find((s) => s.pinId === selectedPinId) ||
      STANDARD_ECU_BENCH_PIN_SPECS[0],
    [selectedPinId]
  );

  const diagnosis = useMemo(() => {
    const parsedActual = Number(measuredValue);
    const parsedSupply = Number(supplyVoltage);
    return evaluatePhysicalBenchMeasurement({
      pinId: selectedPinId,
      condition,
      actualMeasured: Number.isFinite(parsedActual) ? parsedActual : 0,
      supplyVoltageV: Number.isFinite(parsedSupply) ? parsedSupply : 12.6,
    });
  }, [selectedPinId, condition, measuredValue, supplyVoltage]);

  if (!isOpen) return null;

  const handlePresetScenario = (
    pinId: string,
    cond: IgnitionMeasurementCondition,
    val: string
  ) => {
    setSelectedPinId(pinId);
    setCondition(cond);
    setMeasuredValue(val);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="ECU Repair Intelligence Physical Bench Measurement Fault Isolation"
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[4px] border border-[#384152] bg-[#11151d] text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#29303d] bg-[#161b24] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-5 w-5 text-amber-400" />
            <div>
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-slate-100">
                ECU Repair Intelligence — Physical Bench Voltage &amp; Fault Isolation
              </h2>
              <p className="font-mono text-[10px] text-slate-400">
                Enter Real Physical Multimeter Measurements · Evidence-Ranked Fault Isolation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close ECU Repair Intelligence modal"
            className="rounded-[2px] border border-[#343d4b] bg-[#1b2029] p-1.5 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 font-mono text-xs">
          {/* Quick Technician Case Presets */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-[3px] border border-[#28303e] bg-[#0d1017] px-3 py-2">
            <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">
              Quick Bench Cases:
            </span>
            <button
              type="button"
              onClick={() => handlePresetScenario('VREF_5V', 'KEY_ON_ENGINE_OFF', '2.10')}
              className="rounded-[2px] border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-500/20 cursor-pointer"
            >
              5V Ref Pulled Low (2.10V)
            </button>
            <button
              type="button"
              onClick={() => handlePresetScenario('KL30', 'KEY_ON_ENGINE_OFF', '9.40')}
              className="rounded-[2px] border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-500/20 cursor-pointer"
            >
              KL30 Supply Drop (9.40V)
            </button>
            <button
              type="button"
              onClick={() => handlePresetScenario('KL31', 'KEY_ON_ENGINE_OFF', '0.68')}
              className="rounded-[2px] border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-500/20 cursor-pointer"
            >
              Elevated KL31 Ground (0.68V)
            </button>
            <button
              type="button"
              onClick={() => handlePresetScenario('CAN_H', 'KEY_ON_ENGINE_OFF', '0.15')}
              className="rounded-[2px] border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-500/20 cursor-pointer"
            >
              CAN_H Short to GND (0.15V)
            </button>
            <button
              type="button"
              onClick={() => handlePresetScenario('CAN_TERM_OHM', 'IGNITION_OFF', '120')}
              className="rounded-[2px] border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-500/20 cursor-pointer"
            >
              Single CAN Terminator (120 Ω)
            </button>
          </div>

          {/* Technician Measurement Inputs */}
          <div className="grid grid-cols-1 gap-3 rounded-[3px] border border-[#2d3544] bg-[#151a24] p-3.5 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="mb-1 block text-[10px] uppercase text-slate-400">
                Target ECU Pin / Circuit Under Test
              </label>
              <select
                value={selectedPinId}
                onChange={(e) => setSelectedPinId(e.target.value)}
                className="w-full rounded-[2px] border border-[#364052] bg-[#0b0e14] px-2.5 py-2 text-xs text-white"
              >
                {STANDARD_ECU_BENCH_PIN_SPECS.map((spec) => (
                  <option key={spec.pinId} value={spec.pinId}>
                    {spec.pinLabel}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-slate-400">{selectedSpec.circuitRole}</p>
            </div>

            <div>
              <label className="mb-1 block text-[10px] uppercase text-slate-400">
                Test Condition
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as IgnitionMeasurementCondition)}
                className="w-full rounded-[2px] border border-[#364052] bg-[#0b0e14] px-2.5 py-2 text-xs text-white"
              >
                {CONDITION_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] uppercase text-amber-300">
                  Measured ({selectedSpec.unit})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={measuredValue}
                  onChange={(e) => setMeasuredValue(e.target.value)}
                  className="w-full rounded-[2px] border border-amber-500/60 bg-[#0b0e14] px-2.5 py-2 font-bold text-amber-300"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase text-slate-400">
                  Bench PSU (V)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={supplyVoltage}
                  onChange={(e) => setSupplyVoltage(e.target.value)}
                  className="w-full rounded-[2px] border border-[#364052] bg-[#0b0e14] px-2.5 py-2 text-slate-200"
                />
              </div>
            </div>
          </div>

          {/* Expected vs Actual & Delta Telemetry Bar */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-[3px] border border-[#2a3140] bg-[#0d1118] p-3">
              <div className="text-[10px] uppercase text-slate-400">Expected Window</div>
              <div className="mt-1 text-sm font-bold text-slate-100">
                {diagnosis.expectedNominal.toFixed(2)} {diagnosis.unit}
              </div>
              <div className="text-[10px] text-slate-400">
                Range: {diagnosis.expectedMin.toFixed(2)} – {diagnosis.expectedMax.toFixed(2)}{' '}
                {diagnosis.unit}
              </div>
            </div>

            <div className="rounded-[3px] border border-[#2a3140] bg-[#0d1118] p-3">
              <div className="text-[10px] uppercase text-slate-400">Actual Technician Reading</div>
              <div className="mt-1 text-sm font-bold text-amber-300">
                {diagnosis.actualMeasured.toFixed(2)} {diagnosis.unit}
              </div>
              <div className="text-[10px] text-slate-400">Physical Bench Input</div>
            </div>

            <div className="rounded-[3px] border border-[#2a3140] bg-[#0d1118] p-3">
              <div className="text-[10px] uppercase text-slate-400">Delta / Deviation</div>
              <div
                className={`mt-1 text-sm font-bold ${
                  diagnosis.withinSpec ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {diagnosis.deltaFromNominal >= 0 ? '+' : ''}
                {diagnosis.deltaFromNominal.toFixed(2)} {diagnosis.unit} (
                {diagnosis.deviationPercent}%)
              </div>
              <div className="text-[10px] text-slate-400">
                {diagnosis.calculatedCircuitMetrics.formulaNote}
              </div>
            </div>

            <div className="rounded-[3px] border border-[#2a3140] bg-[#0d1118] p-3">
              <div className="text-[10px] uppercase text-slate-400">Diagnostic Verdict</div>
              <div className="mt-1 flex items-center gap-1.5">
                {diagnosis.withinSpec ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-rose-400" />
                )}
                <span
                  className={`text-xs font-bold uppercase ${
                    diagnosis.withinSpec ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {diagnosis.severity.replace('_', ' ')}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                Primary Basis: {CATEGORY_BADGE_STYLES[diagnosis.primaryCategory].label}
              </div>
            </div>
          </div>

          {/* Ranked Possible Causes & Verification Steps */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-200">
                <Activity className="h-4 w-4 text-amber-400" />
                <span>Evidence-Ranked Fault Isolation &amp; Verification Procedure</span>
              </h3>
              <span className="text-[10px] text-slate-400">
                Multiple candidate causes ranked by circuit physics &amp; OEM evidence
              </span>
            </div>

            {diagnosis.rankedCauses.map((candidate) => {
              const catInfo = CATEGORY_BADGE_STYLES[candidate.category];
              return (
                <div
                  key={candidate.faultCode}
                  className="rounded-[3px] border border-[#2e3646] bg-[#141923] p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 font-bold text-amber-300">
                        #{candidate.rank}
                      </span>
                      <span className="font-bold text-slate-100">{candidate.faultTitle}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        title={catInfo.description}
                        className={`rounded-[2px] border px-2 py-0.5 text-[10px] font-bold uppercase ${catInfo.badgeClass}`}
                      >
                        {catInfo.label}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-[2px] border border-[#343d4d] bg-[#0c0f15] px-2 py-0.5 text-[10px] text-slate-300">
                        <Gauge className="h-3 w-3 text-amber-400" />
                        Evidence Weight: {(candidate.probabilityScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <p className="mt-2 text-slate-300">{candidate.technicalRationale}</p>

                  <div className="mt-2.5 rounded-[2px] border border-[#252c3a] bg-[#0d1118] p-2.5">
                    <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-amber-300">
                      <Wrench className="h-3 w-3" />
                      <span>Recommended Bench Verification Steps</span>
                    </div>
                    <ul className="list-inside list-disc space-y-1 text-[11px] text-slate-300">
                      {candidate.verificationSteps.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-2 text-[10px] text-slate-400">
                    Reference Source: <span className="text-slate-300">{candidate.sourceReference}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Evidence Classification Legend & Safety Notice */}
          <div className="rounded-[3px] border border-[#2a3140] bg-[#0d1118] p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Diagnostic Evidence Categories
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
              {(Object.keys(CATEGORY_BADGE_STYLES) as DiagnosticEvidenceCategory[]).map((cat) => {
                const info = CATEGORY_BADGE_STYLES[cat];
                return (
                  <div
                    key={cat}
                    className="rounded-[2px] border border-[#232a36] bg-[#121721] p-2"
                  >
                    <span
                      className={`inline-block rounded-[2px] border px-1.5 py-0.5 text-[9px] font-bold uppercase ${info.badgeClass}`}
                    >
                      {info.label}
                    </span>
                    <p className="mt-1 text-[10px] text-slate-400">{info.description}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-2.5 border-t border-[#232a36] pt-2 text-[10px] text-amber-300/90">
              {diagnosis.safetyNotice}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
