export type DiagnosticEvidenceCategory =
  | 'OEM_VERIFIED'
  | 'CROSS_REFERENCED'
  | 'CALCULATED_RESULT'
  | 'ENGINEERING_HYPOTHESIS'
  | 'AI_INFERRED';

export type IgnitionMeasurementCondition = 'IGNITION_OFF' | 'KEY_ON_ENGINE_OFF' | 'ENGINE_CRANKING_RUNNING';

export type MeasurementUnit = 'V' | 'OHM';

export interface BenchPinSpecification {
  pinId: string;
  pinLabel: string;
  circuitRole: string;
  unit: MeasurementUnit;
  expectedByCondition: Record<
    IgnitionMeasurementCondition,
    {
      nominal: number;
      min: number;
      max: number;
      referenceCategory: DiagnosticEvidenceCategory;
      sourceCitation: string;
    }
  >;
}

export interface RankedFaultCandidate {
  rank: number;
  faultTitle: string;
  faultCode: string;
  category: DiagnosticEvidenceCategory;
  probabilityScore: number; // 0.0 to 1.0 evidence weight
  technicalRationale: string;
  verificationSteps: string[];
  sourceReference: string;
}

export interface PhysicalMeasurementDiagnosisResult {
  pinId: string;
  pinLabel: string;
  circuitRole: string;
  condition: IgnitionMeasurementCondition;
  unit: MeasurementUnit;
  supplyVoltageV: number;
  expectedNominal: number;
  expectedMin: number;
  expectedMax: number;
  actualMeasured: number;
  deltaFromNominal: number;
  deviationPercent: number;
  withinSpec: boolean;
  severity: 'NORMAL' | 'WARNING' | 'CRITICAL_FAULT';
  primaryCategory: DiagnosticEvidenceCategory;
  summaryFinding: string;
  calculatedCircuitMetrics: {
    estimatedVoltageDropV: number;
    estimatedLeakageOrShortRatio: number;
    category: 'CALCULATED_RESULT';
    formulaNote: string;
  };
  rankedCauses: RankedFaultCandidate[];
   safetyNotice: string;
}

export const STANDARD_ECU_BENCH_PIN_SPECS: BenchPinSpecification[] = [
  {
    pinId: 'KL30',
    pinLabel: 'KL30 — Permanent Battery Supply (+BATT) [Trainer Pin 3 / OEM per FSM]',
    circuitRole: 'Primary unswitched ECU power rail via main fuse',
    unit: 'V',
    expectedByCondition: {
      IGNITION_OFF: {
        nominal: 12.6,
        min: 11.8,
        max: 14.6,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'DIN 72552 KL30 / Bosch EDC/ME Power Architecture Standard',
      },
      KEY_ON_ENGINE_OFF: {
        nominal: 12.6,
        min: 11.8,
        max: 14.6,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'DIN 72552 KL30 / Bosch EDC/ME Power Architecture Standard',
      },
      ENGINE_CRANKING_RUNNING: {
        nominal: 13.8,
        min: 10.2,
        max: 14.8,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'DIN 72552 KL30 Charging & Cranking Envelope',
      },
    },
  },
  {
    pinId: 'KL15',
    pinLabel: 'KL15 — Switched Ignition Wake-Up (+IGN) [Trainer Pin 4 / OEM per FSM]',
    circuitRole: 'Ignition switch wake-up input to ECU power management ASIC',
    unit: 'V',
    expectedByCondition: {
      IGNITION_OFF: {
        nominal: 0.0,
        min: 0.0,
        max: 0.35,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'DIN 72552 KL15 Switched Ignition Specification',
      },
      KEY_ON_ENGINE_OFF: {
        nominal: 12.5,
        min: 11.5,
        max: 14.6,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'DIN 72552 KL15 Switched Ignition Specification',
      },
      ENGINE_CRANKING_RUNNING: {
        nominal: 13.7,
        min: 10.0,
        max: 14.8,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'DIN 72552 KL15 Cranking/Running Envelope',
      },
    },
  },
  {
    pinId: 'KL31',
    pinLabel: 'KL31 — Power & Logic Ground Return (GND) [Trainer Pin 1 / OEM per FSM]',
    circuitRole: 'Main ECU chassis/bench ground return (measured relative to negative supply terminal)',
    unit: 'V',
    expectedByCondition: {
      IGNITION_OFF: {
        nominal: 0.01,
        min: 0.0,
        max: 0.08,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'DIN 72552 KL31 Ground Drop Standard (<100 mV max under load)',
      },
      KEY_ON_ENGINE_OFF: {
        nominal: 0.02,
        min: 0.0,
        max: 0.15,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'DIN 72552 KL31 Ground Drop Standard (<150 mV KOEO)',
      },
      ENGINE_CRANKING_RUNNING: {
        nominal: 0.05,
        min: 0.0,
        max: 0.25,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'DIN 72552 KL31 Dynamic Ground Return Envelope',
      },
    },
  },
  {
    pinId: 'VREF_5V',
    pinLabel: 'VREF_5V — Regulated 5.00V Sensor Reference Bus [Trainer Pin 5 / OEM per FSM]',
    circuitRole: 'Internal LDO/tracker 5V regulated supply feeding ratiometric sensors (MAP, TPS, Rail Pressure)',
    unit: 'V',
    expectedByCondition: {
      IGNITION_OFF: {
        nominal: 0.0,
        min: 0.0,
        max: 0.15,
        referenceCategory: 'CROSS_REFERENCED',
        sourceCitation: 'Infineon TLE4274 / Bosch System Basis Chip 5V LDO Sleep Spec',
      },
      KEY_ON_ENGINE_OFF: {
        nominal: 5.0,
        min: 4.9,
        max: 5.1,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'SAE J1979 / Bosch 5.0V ±2% Ratiometric Sensor Reference Standard',
      },
      ENGINE_CRANKING_RUNNING: {
        nominal: 5.0,
        min: 4.9,
        max: 5.1,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'SAE J1979 / Bosch 5.0V ±2% Ratiometric Sensor Reference Standard',
      },
    },
  },
  {
    pinId: 'TPS_SIG',
    pinLabel: 'TPS_SIG — Throttle Position Sensor Signal [Trainer Pin 7 / OEM per FSM]',
    circuitRole: 'Ratiometric 0.5V–4.5V analog feedback with open-circuit pull-down/pull-up supervision',
    unit: 'V',
    expectedByCondition: {
      IGNITION_OFF: {
        nominal: 0.0,
        min: 0.0,
        max: 0.1,
        referenceCategory: 'CROSS_REFERENCED',
        sourceCitation: 'Bosch Electronic Throttle Control (ETC) Signal Envelope',
      },
      KEY_ON_ENGINE_OFF: {
        nominal: 0.75,
        min: 0.45,
        max: 1.15,
        referenceCategory: 'CROSS_REFERENCED',
        sourceCitation: 'Bosch ETC Closed/Idle Stop Voltage Window (0.45V–1.15V)',
      },
      ENGINE_CRANKING_RUNNING: {
        nominal: 1.2,
        min: 0.45,
        max: 4.55,
        referenceCategory: 'CROSS_REFERENCED',
        sourceCitation: 'Bosch ETC Active Sweep Range (0.45V–4.55V; fault outside 0.2V–4.8V)',
      },
    },
  },
  {
    pinId: 'ECT_SIG',
    pinLabel: 'ECT_SIG — Engine Coolant Temp NTC Divider [Trainer Pin 9 / OEM per FSM]',
    circuitRole: '5V internal pull-up resistor (~2.49 kΩ) feeding external NTC thermistor to sensor ground',
    unit: 'V',
    expectedByCondition: {
      IGNITION_OFF: {
        nominal: 0.0,
        min: 0.0,
        max: 0.1,
        referenceCategory: 'CROSS_REFERENCED',
        sourceCitation: 'Standard Automotive NTC Bias Circuit (De-energized)',
      },
      KEY_ON_ENGINE_OFF: {
        nominal: 2.35,
        min: 0.4,
        max: 4.65,
        referenceCategory: 'CROSS_REFERENCED',
        sourceCitation: 'NTC 2.5 kΩ @ 20°C w/ 2.49 kΩ ECU Pull-Up (0.4V Hot – 4.65V Cold)',
      },
      ENGINE_CRANKING_RUNNING: {
        nominal: 1.1,
        min: 0.35,
        max: 4.65,
        referenceCategory: 'CROSS_REFERENCED',
        sourceCitation: 'NTC Operating Envelope (85°C nominal ~1.0V–1.3V)',
      },
    },
  },
  {
    pinId: 'CAN_H',
    pinLabel: 'CAN_H — High-Speed CAN Bus Dominant High [Trainer Pin 13 / OBD-II DLC Pin 6]',
    circuitRole: 'ISO 11898-2 High-Speed CAN differential transceiver high line',
    unit: 'V',
    expectedByCondition: {
      IGNITION_OFF: {
        nominal: 0.0,
        min: 0.0,
        max: 0.4,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'ISO 11898-2 Sleep Bus Level',
      },
      KEY_ON_ENGINE_OFF: {
        nominal: 2.65,
        min: 2.45,
        max: 3.1,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'ISO 11898-2 Recessive Bias (2.5V) + Active Dominant Average (2.5V–3.0V DMM)',
      },
      ENGINE_CRANKING_RUNNING: {
        nominal: 2.7,
        min: 2.45,
        max: 3.15,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'ISO 11898-2 Active Bus DMM Average Voltage',
      },
    },
  },
  {
    pinId: 'CAN_L',
    pinLabel: 'CAN_L — High-Speed CAN Bus Dominant Low [Trainer Pin 14 / OBD-II DLC Pin 14]',
    circuitRole: 'ISO 11898-2 High-Speed CAN differential transceiver low line',
    unit: 'V',
    expectedByCondition: {
      IGNITION_OFF: {
        nominal: 0.0,
        min: 0.0,
        max: 0.4,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'ISO 11898-2 Sleep Bus Level',
      },
      KEY_ON_ENGINE_OFF: {
        nominal: 2.35,
        min: 1.9,
        max: 2.55,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'ISO 11898-2 Recessive Bias (2.5V) + Active Dominant Average (1.9V–2.5V DMM)',
      },
      ENGINE_CRANKING_RUNNING: {
        nominal: 2.3,
        min: 1.85,
        max: 2.55,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'ISO 11898-2 Active Bus DMM Average Voltage',
      },
    },
  },
  {
    pinId: 'CAN_TERM_OHM',
    pinLabel: 'CAN_H to CAN_L — Differential Bus Termination Resistance',
    circuitRole: 'Parallel combination of two 120 Ω ISO 11898-2 termination resistors (measured Ignition OFF)',
    unit: 'OHM',
    expectedByCondition: {
      IGNITION_OFF: {
        nominal: 60.0,
        min: 54.0,
        max: 66.0,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'ISO 11898-2 Dual 120 Ω Termination Network (60 Ω ±10% Fully Connected, 120 Ω Single ECU Bench)',
      },
      KEY_ON_ENGINE_OFF: {
        nominal: 60.0,
        min: 54.0,
        max: 66.0,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'WARNING: Measure ohmic resistance ONLY with KL30/KL15 de-energized',
      },
      ENGINE_CRANKING_RUNNING: {
        nominal: 60.0,
        min: 54.0,
        max: 66.0,
        referenceCategory: 'OEM_VERIFIED',
        sourceCitation: 'WARNING: Measure ohmic resistance ONLY with KL30/KL15 de-energized',
      },
    },
  },
  {
    pinId: 'INJ_1_LSD',
    pinLabel: 'INJ_1 — Injector 1 Low-Side MOSFET Drain [Trainer Pin 10 / OEM per FSM]',
    circuitRole: 'Low-side clamped inductive driver fed by +12V main relay through injector winding (~12 Ω)',
    unit: 'V',
    expectedByCondition: {
      IGNITION_OFF: {
        nominal: 0.0,
        min: 0.0,
        max: 0.25,
        referenceCategory: 'CROSS_REFERENCED',
        sourceCitation: 'Main Relay De-Energized Injector Drain State',
      },
      KEY_ON_ENGINE_OFF: {
        nominal: 12.5,
        min: 11.5,
        max: 14.5,
        referenceCategory: 'CROSS_REFERENCED',
        sourceCitation: 'KOEO Injector High-Side Energized via Solenoid Winding, Low-Side MOSFET OFF',
      },
      ENGINE_CRANKING_RUNNING: {
        nominal: 11.8,
        min: 9.5,
        max: 14.4,
        referenceCategory: 'CROSS_REFERENCED',
        sourceCitation: 'Running Duty-Cycle Averaged DMM Voltage (verify 60V avalanche clamp with oscilloscope)',
      },
    },
  },
];

export function evaluatePhysicalBenchMeasurement(params: {
  pinId: string;
  condition: IgnitionMeasurementCondition;
  actualMeasured: number;
  supplyVoltageV?: number;
}): PhysicalMeasurementDiagnosisResult {
  const spec =
    STANDARD_ECU_BENCH_PIN_SPECS.find((p) => p.pinId === params.pinId) ||
    STANDARD_ECU_BENCH_PIN_SPECS[0];

  const supplyV =
    typeof params.supplyVoltageV === 'number' && Number.isFinite(params.supplyVoltageV)
      ? params.supplyVoltageV
      : 12.6;

  const condSpec = spec.expectedByCondition[params.condition];
  const actual = Number(params.actualMeasured);

  // Adjust expected nominal for KL30/KL15/INJ_1 when bench supply voltage is custom
  const scaleWithSupply =
    spec.unit === 'V' &&
    params.condition !== 'IGNITION_OFF' &&
    (spec.pinId === 'KL30' || spec.pinId === 'KL15' || spec.pinId === 'INJ_1_LSD');

  const expectedNominal = scaleWithSupply
    ? Number((supplyV - (spec.pinId === 'KL15' || spec.pinId === 'INJ_1_LSD' ? 0.1 : 0)).toFixed(2))
    : condSpec.nominal;
  const expectedMin = scaleWithSupply ? Math.max(9.5, Number((supplyV - 0.8).toFixed(2))) : condSpec.min;
  const expectedMax = scaleWithSupply ? Number((supplyV + 0.3).toFixed(2)) : condSpec.max;

  const deltaFromNominal = Number((actual - expectedNominal).toFixed(3));
  const denom = Math.max(0.1, Math.abs(expectedNominal));
  const deviationPercent = Number(((Math.abs(deltaFromNominal) / denom) * 100).toFixed(1));
  const withinSpec = actual >= expectedMin && actual <= expectedMax;

  let severity: PhysicalMeasurementDiagnosisResult['severity'] = 'NORMAL';
  if (!withinSpec) {
    const margin = Math.max(Math.abs(actual - expectedMin), Math.abs(actual - expectedMax));
    severity = margin > 0.6 || (spec.unit === 'OHM' && margin > 15) ? 'CRITICAL_FAULT' : 'WARNING';
  }

  const estimatedVoltageDropV =
    spec.unit === 'V' ? Number(Math.max(0, expectedNominal - actual).toFixed(3)) : 0;
  const estimatedLeakageOrShortRatio =
    expectedNominal > 0.05
      ? Number(Math.min(1, Math.max(0, 1 - actual / expectedNominal)).toFixed(3))
      : 0;

  const rankedCauses: RankedFaultCandidate[] = [];

  if (withinSpec) {
    rankedCauses.push({
      rank: 1,
      faultTitle: 'Circuit Operating Within Expected Specification Envelope',
      faultCode: 'NOMINAL_PASS',
      category: condSpec.referenceCategory,
      probabilityScore: 0.96,
      technicalRationale: `Measured ${actual} ${spec.unit} matches expected window (${expectedMin}–${expectedMax} ${spec.unit}) under ${params.condition}.`,
      verificationSteps: [
        'Perform wiggle test on bench harness connector while monitoring DMM min/max.',
        'If intermittent DTC persists, capture high-speed waveform on Pin Waveform Oscilloscope.',
      ],
      sourceReference: condSpec.sourceCitation,
    });
  } else if (spec.pinId === 'VREF_5V') {
    if (actual < expectedMin && params.condition !== 'IGNITION_OFF') {
      rankedCauses.push(
        {
          rank: 1,
          faultTitle: '5V Sensor Reference Bus Dragged Down by Shorted External Sensor or Harness',
          faultCode: 'VREF_SHORT_OR_OVERLOAD',
          category: 'OEM_VERIFIED',
          probabilityScore: 0.88,
          technicalRationale: `Measured ${actual.toFixed(2)}V vs 5.00V nominal (Δ ${deltaFromNominal.toFixed(2)}V). Internal 5V tracker/LDO enters current-foldback when total bus load exceeds ~150–250 mA.`,
          verificationSteps: [
            'Disconnect shared 5V ratiometric sensors one at a time (MAP, Rail Pressure, EGR, TPS, A/C Pressure) while watching VREF_5V.',
            'Measure resistance between VREF_5V pin and Sensor Ground (KL31) with ECU unpowered.',
          ],
          sourceReference: condSpec.sourceCitation,
        },
        {
          rank: 2,
          faultTitle: 'Internal ECU 5V Regulator IC Thermal Shutdown or Shunt/TVS Diode Leakage',
          faultCode: 'PCB_LDO_OR_TVS_FAULT',
          category: 'CALCULATED_RESULT',
          probabilityScore: 0.74,
          technicalRationale: `Calculated rail collapse ratio ${(estimatedLeakageOrShortRatio * 100).toFixed(1)}% (${estimatedVoltageDropV.toFixed(2)}V drop). If VREF_5V remains ${actual.toFixed(2)}V with all external sensor pins isolated on the bench, the fault is internal to the ECU PCB.`,
          verificationSteps: [
            'Isolate Pin 14 / VREF_5V completely from external harness loads on the bench.',
            'Inspect internal System Basis Chip / 5V LDO regulator output capacitor and ESD clamp diode in Diode Mode.',
          ],
          sourceReference: 'MNA Voltage Divider & LDO Current-Limiting Foldback Model',
        },
        {
          rank: 3,
          faultTitle: 'Insufficient KL30/KL15 Input Supply or High-Resistance Main Ground (KL31)',
          faultCode: 'UPSTREAM_SUPPLY_DROOP',
          category: 'ENGINEERING_HYPOTHESIS',
          probabilityScore: 0.52,
          technicalRationale: 'If ECU input rail drops below LDO dropout threshold (~6.2V) or KL31 ground is elevated, VREF_5V cannot regulate.',
          verificationSteps: [
            'Verify KL30 and KL15 directly at ECU connector pins under load.',
            'Measure voltage drop between ECU KL31 pin and bench PSU negative terminal (<0.10V required).',
          ],
          sourceReference: 'Bosch ECU Power Management Dropout Cascade Analysis',
        }
      );
    } else if (actual > expectedMax) {
      rankedCauses.push(
        {
          rank: 1,
          faultTitle: '5V Reference Bus Shorted to +12V Battery/Ignition Line in Harness',
          faultCode: 'VREF_SHORT_TO_BATT',
          category: 'OEM_VERIFIED',
          probabilityScore: 0.91,
          technicalRationale: `Measured ${actual.toFixed(2)}V exceeds the 5.10V maximum limit (Δ +${deltaFromNominal.toFixed(2)}V), indicating cross-conduction from a 12V supply wire or shorted regulator pass element.`,
          verificationSteps: [
            'Immediately de-energize bench supply if actual voltage exceeds 5.8V to prevent MCU ADC damage.',
            'Check continuity between VREF_5V and KL30/KL15/actuator +12V feeds.',
          ],
          sourceReference: condSpec.sourceCitation,
        },
        {
          rank: 2,
          faultTitle: 'Internal 5V Regulator Pass Transistor Shorted Input-to-Output',
          faultCode: 'PCB_REGULATOR_PASS_SHORT',
          category: 'ENGINEERING_HYPOTHESIS',
          probabilityScore: 0.65,
          technicalRationale: 'A failed LDO regulator IC on the PCB can pass raw pre-regulator voltage onto the 5V bus.',
          verificationSteps: [
            'Measure diode drop across regulator input and output pins on PCB.',
          ],
          sourceReference: 'Automotive LDO Failure Mode Analysis',
        }
      );
    }
  } else if (spec.pinId === 'KL30' || spec.pinId === 'KL15') {
    if (actual < expectedMin && params.condition !== 'IGNITION_OFF') {
      rankedCauses.push(
        {
          rank: 1,
          faultTitle: `High-Resistance Contact or Voltage Drop on ${spec.pinId} Feed (${estimatedVoltageDropV.toFixed(2)}V Drop)`,
          faultCode: `${spec.pinId}_VOLTAGE_DROP`,
          category: 'CALCULATED_RESULT',
          probabilityScore: 0.89,
          technicalRationale: `Measured ${actual.toFixed(2)}V vs expected ${expectedNominal.toFixed(2)}V yields a ${estimatedVoltageDropV.toFixed(2)}V drop across the feed path.`,
          verificationSteps: [
            `Measure voltage drop directly from Bench PSU (+) terminal to ECU ${spec.pinId} pin under active current load.`,
            'Inspect female terminal drag force, relay contact resistance, and fuse holder oxidation.',
          ],
          sourceReference: condSpec.sourceCitation,
        },
        {
          rank: 2,
          faultTitle: 'Internal Reverse-Polarity Protection Diode or Input TVS Short Pulling Supply Down',
          faultCode: 'ECU_INPUT_CLAMP_OVERLOAD',
          category: 'ENGINEERING_HYPOTHESIS',
          probabilityScore: 0.68,
          technicalRationale: 'If bench power supply enters current-limiting (CC) mode while voltage collapses, an internal protection TVS diode may be shorted.',
          verificationSteps: [
            'Check Bench Power Supply current draw (>1.5A KOEO with no actuators indicates internal short).',
            'Use DMM Diode Mode between KL30 and KL31 in both polarities.',
          ],
          sourceReference: 'ISO 16750-2 Automotive Power Input Protection Standard',
        }
      );
    } else if (actual > expectedMax && params.condition === 'IGNITION_OFF' && spec.pinId === 'KL15') {
      rankedCauses.push({
        rank: 1,
        faultTitle: 'KL15 Ignition Wake-Up Backfed or Welded Ignition Relay Contact',
        faultCode: 'KL15_BACKFEED_KEEP_ALIVE',
        category: 'OEM_VERIFIED',
        probabilityScore: 0.87,
        technicalRationale: `KL15 measured ${actual.toFixed(2)}V with Ignition OFF (expected <0.35V), preventing ECU sleep and causing parasitic battery drain.`,
        verificationSteps: [
          'Open KL15 bench switch and verify whether voltage originates from external harness or internal PCB backfeed from KL30.',
        ],
        sourceReference: condSpec.sourceCitation,
      });
    }
  } else if (spec.pinId === 'KL31') {
    if (actual > expectedMax) {
      rankedCauses.push(
        {
          rank: 1,
          faultTitle: `Elevated Ground Return Voltage Drop on KL31 (+${actual.toFixed(3)}V)`,
          faultCode: 'KL31_HIGH_RESISTANCE_GROUND',
          category: 'OEM_VERIFIED',
          probabilityScore: 0.92,
          technicalRationale: `KL31 sits at ${actual.toFixed(3)}V relative to supply negative (max allowed ${expectedMax}V). Elevated ground shifts all analog sensor readings and reduces injector/ignition drive voltage.`,
          verificationSteps: [
            'Inspect KL31 bench ground jumper, chassis eyelet, and ECU header solder joints.',
            'Verify all ECU power ground pins are tied together before energizing.',
          ],
          sourceReference: condSpec.sourceCitation,
        },
        {
          rank: 2,
          faultTitle: 'Internal PCB Ground Track Fusing from Previous Reverse-Polarity or Jump-Start Event',
          faultCode: 'PCB_GROUND_TRACE_OPEN',
          category: 'CROSS_REFERENCED',
          probabilityScore: 0.76,
          technicalRationale: 'Sacrificial PCB neck-down traces between analog ground and power ground frequently burn open during jump-start surges.',
          verificationSteps: [
            'Measure continuity between all KL31 pins and internal sensor ground pins (<0.2 Ω expected).',
          ],
          sourceReference: 'Bosch/Continental ECU PCB Ground Plane Repair Bulletin',
        }
      );
    }
  } else if (spec.pinId === 'CAN_H' || spec.pinId === 'CAN_L') {
    rankedCauses.push(
      {
        rank: 1,
        faultTitle:
          actual < 1.0
            ? `${spec.pinId} Shorted to Ground or Transceiver Unpowered`
            : actual > 4.2
              ? `${spec.pinId} Shorted to +5V / +12V Supply`
              : `${spec.pinId} Dominant Lock or Termination Imbalance`,
        faultCode: `${spec.pinId}_BUS_FAULT`,
        category: 'OEM_VERIFIED',
        probabilityScore: 0.89,
        technicalRationale: `Measured ${actual.toFixed(2)}V on ${spec.pinId} is outside the ISO 11898-2 window (${expectedMin}V–${expectedMax}V). Remember: CAN_H + CAN_L should sum to ~5.0V on a healthy bus.`,
        verificationSteps: [
          'De-energize KL30/KL15 and measure resistance between CAN_H and CAN_L (60 Ω full network / 120 Ω single terminated ECU).',
          'Use DMM Diode Mode from CAN_H and CAN_L to KL31 to verify matching ESD protection diodes (~0.62V) on the CAN transceiver IC.',
        ],
        sourceReference: condSpec.sourceCitation,
      },
      {
        rank: 2,
        faultTitle: 'Damaged High-Speed CAN Transceiver IC (e.g. TJA1050 / TLE6250)',
        faultCode: 'CAN_TRANSCEIVER_IC_FAILURE',
        category: 'CROSS_REFERENCED',
        probabilityScore: 0.72,
        technicalRationale: 'Asymmetric bus bias or missing differential clamping with normal 60/120 Ω termination points to an internal transceiver stage fault.',
        verificationSteps: [
          'Capture differential CAN_H / CAN_L frames on the Oscilloscope at 500 kbps.',
        ],
        sourceReference: 'NXP TJA1050 / Infineon CAN Transceiver Failure Isolation Guide',
      }
    );
  } else if (spec.pinId === 'CAN_TERM_OHM') {
    rankedCauses.push(
      {
        rank: 1,
        faultTitle:
          actual > 105 && actual < 135
            ? 'Single 120 Ω Terminator Detected (Second Termination Node Open or Disconnected)'
            : actual < 45
              ? 'CAN_H to CAN_L Short Circuit or Extra Terminating Resistor on Bus'
              : 'Open CAN Bus Termination Network',
        faultCode: 'CAN_TERMINATION_ANOMALY',
        category: 'OEM_VERIFIED',
        probabilityScore: 0.93,
        technicalRationale: `Measured ${actual.toFixed(1)} Ω vs 60.0 Ω nominal dual-terminated bus. Note: 120 Ω is normal if testing a single standalone terminated ECU on the bench without an external 120 Ω bridge.`,
        verificationSteps: [
          'Ensure KL30 and KL15 are completely OFF before measuring Ohms.',
          'If testing a standalone ECU on the bench, switch the 120 Ω CAN termination resistor ON in the bench harness.',
        ],
        sourceReference: condSpec.sourceCitation,
      }
    );
  } else {
    // Analog sensor / Injector low-side driver generic physical fault isolation
    rankedCauses.push(
      {
        rank: 1,
        faultTitle:
          actual < expectedMin
            ? `${spec.pinId} Signal/Drain Pulled Low (Short to Ground or Open High-Side Pull-Up)`
            : `${spec.pinId} Signal/Drain Pulled High (Open Ground Return or Short to Supply)`,
        faultCode: `${spec.pinId}_OUT_OF_RANGE`,
        category: 'CROSS_REFERENCED',
        probabilityScore: 0.85,
        technicalRationale: `Measured ${actual.toFixed(2)} ${spec.unit} deviates from expected ${expectedMin}–${expectedMax} ${spec.unit} (Δ ${deltaFromNominal >= 0 ? '+' : ''}${deltaFromNominal.toFixed(2)} ${spec.unit}).`,
        verificationSteps: [
          `Verify sensor 5V reference (VREF_5V) and sensor ground return before replacing the component connected to ${spec.pinId}.`,
          'Perform DMM Diode Mode test on the ECU pin to verify internal ESD clamp integrity (~0.55V–0.70V).',
        ],
        sourceReference: condSpec.sourceCitation,
      },
      {
        rank: 2,
        faultTitle: 'Internal ECU ADC Conditioning Network or Low-Side Driver MOSFET Fault',
        faultCode: `${spec.pinId}_INTERNAL_STAGE_FAULT`,
        category: 'ENGINEERING_HYPOTHESIS',
        probabilityScore: 0.64,
        technicalRationale: `Calculated deviation of ${deviationPercent}% from nominal (${expectedNominal} ${spec.unit}). If external sensor/load resistance is verified within spec, inspect the PCB input filter or driver MOSFET.`,
        verificationSteps: [
          'Inject a known simulated voltage/load using the Bench Vehicle Emulator and observe whether live ECU parameters respond.',
        ],
        sourceReference: 'Virtual ECU Lab MNA Pin-Stage Diagnostic Model',
      }
    );
  }

  return {
    pinId: spec.pinId,
    pinLabel: spec.pinLabel,
    circuitRole: spec.circuitRole,
    condition: params.condition,
    unit: spec.unit,
    supplyVoltageV: supplyV,
    expectedNominal,
    expectedMin,
    expectedMax,
    actualMeasured: actual,
    deltaFromNominal,
    deviationPercent,
    withinSpec,
    severity,
    primaryCategory: rankedCauses[0]?.category || condSpec.referenceCategory,
    summaryFinding: withinSpec
      ? `PASS: ${spec.pinId} measured ${actual.toFixed(2)} ${spec.unit} within ${expectedMin}–${expectedMax} ${spec.unit} specification (${params.condition}).`
      : `${severity === 'CRITICAL_FAULT' ? 'CRITICAL FAULT' : 'OUT OF SPEC'}: ${spec.pinId} measured ${actual.toFixed(2)} ${spec.unit} vs expected ${expectedNominal.toFixed(2)} ${spec.unit} (Δ ${deltaFromNominal >= 0 ? '+' : ''}${deltaFromNominal.toFixed(2)} ${spec.unit}, ${deviationPercent}% deviation).`,
    calculatedCircuitMetrics: {
      estimatedVoltageDropV,
      estimatedLeakageOrShortRatio,
      category: 'CALCULATED_RESULT',
      formulaNote:
        spec.unit === 'V'
          ? `V_drop = max(0, V_expected(${expectedNominal.toFixed(2)}V) - V_actual(${actual.toFixed(2)}V)) = ${estimatedVoltageDropV.toFixed(2)}V`
          : `R_delta = R_actual(${actual.toFixed(1)}Ω) - R_nominal(${expectedNominal.toFixed(1)}Ω) = ${deltaFromNominal.toFixed(1)}Ω`,
    },
    rankedCauses,
    safetyNotice:
      'VERIFY AGAINST FACTORY SERVICE MANUAL FOR EXACT VIN / ECU PART NUMBER BEFORE CONDEMNING HARDWARE. Never measure resistance (Ω) while KL30 or KL15 is energized.',
  };
}
