import type {
  BenchComponent,
  EcuPin,
  InjectedFault,
  PowerSupplyState,
  WireConnection,
} from '../../types/ecu';

export type LogicExpectedState =
  | 'HIGH_12V'
  | 'HIGH_5V'
  | 'LOW_GND'
  | 'ANALOG_RANGE'
  | 'CAN_BUS'
  | 'PWM_ACTUATOR';

export type LogicCheckFaultClass =
  | 'NOMINAL'
  | 'STANDBY'
  | 'SHORT_TO_BATTERY'
  | 'SHORT_TO_GROUND'
  | 'OVERVOLTAGE'
  | 'UNDERVOLTAGE'
  | 'OPEN_CIRCUIT'
  | 'LOGIC_MISMATCH';

export type LogicRuleStatus = 'PASS' | 'WARNING' | 'CRITICAL' | 'STANDBY' | 'MUTED';

export type LogicWatchPreset = 'ALL' | 'POWER_GND' | 'REF_SENSORS' | 'BUS_DRIVERS';

export interface LogicCheckRule {
  id: string;
  pinId: string;
  pinNumber: number;
  pinLabel: string;
  expectedState: LogicExpectedState;
  minVoltage: number;
  maxVoltage: number;
  shortToBatteryThresholdV: number;
  enabled: boolean;
  isCustom?: boolean;
}

export interface LogicCheckRuleResult {
  rule: LogicCheckRule;
  measuredVoltage: number;
  observedLogicState: string;
  status: LogicRuleStatus;
  faultClass: LogicCheckFaultClass;
  summary: string;
  recommendation: string;
}

export interface LogicCheckAlert {
  id: string;
  pinId: string;
  pinNumber: number;
  pinLabel: string;
  severity: 'CRITICAL' | 'WARNING';
  faultClass: LogicCheckFaultClass;
  title: string;
  detail: string;
  measuredVoltage: number;
  expectedRangeLabel: string;
  recommendation: string;
}

export interface CrossPinCheckResult {
  id: string;
  title: string;
  measuredDeltaLabel: string;
  expectedLabel: string;
  status: 'PASS' | 'WARNING' | 'CRITICAL' | 'STANDBY';
  detail: string;
}

export interface LogicCheckSnapshot {
  isArmed: boolean;
  overallStatus: 'PASS' | 'WARNING' | 'CRITICAL' | 'STANDBY';
  monitoredCount: number;
  passingCount: number;
  warningCount: number;
  criticalCount: number;
  results: LogicCheckRuleResult[];
  crossChecks: CrossPinCheckResult[];
  alerts: LogicCheckAlert[];
  signature: string;
}

export interface LogicCheckRuleOverride {
  id?: string;
  pinId: string;
  expectedState?: LogicExpectedState;
  minVoltage?: number;
  maxVoltage?: number;
  shortToBatteryThresholdV?: number;
  enabled?: boolean;
  isCustom?: boolean;
}

export const LOGIC_CHECK_RULES_STORAGE_KEY = 'autoelectric_logic_check_rules_v1';
export const LOGIC_CHECK_ARMED_STORAGE_KEY = 'autoelectric_logic_check_armed_v1';

const WATCH_PRESET_PINS: Record<LogicWatchPreset, readonly string[] | null> = {
  ALL: null,
  POWER_GND: ['ecu-pin-1', 'ecu-pin-2', 'ecu-pin-3', 'ecu-pin-4', 'ecu-pin-6'],
  REF_SENSORS: ['ecu-pin-5', 'ecu-pin-6', 'ecu-pin-7', 'ecu-pin-8', 'ecu-pin-9', 'ecu-pin-15'],
  BUS_DRIVERS: ['ecu-pin-10', 'ecu-pin-11', 'ecu-pin-12', 'ecu-pin-13', 'ecu-pin-14', 'ecu-pin-16'],
};

function inferDefaultSpecForPin(pin: EcuPin): Omit<LogicCheckRule, 'id' | 'pinId' | 'pinNumber' | 'pinLabel'> {
  const upper = `${pin.label} ${pin.name}`.toUpperCase();

  if (pin.category === 'ground' || upper.includes('KL31') || upper.includes('SGND')) {
    return {
      expectedState: 'LOW_GND',
      minVoltage: -0.2,
      maxVoltage: 0.5,
      shortToBatteryThresholdV: 6.5,
      enabled: pin.id !== 'ecu-pin-2',
    };
  }

  if (pin.category === 'reference' || upper.includes('VREF') || Math.abs(pin.nominalVoltage - 5.0) <= 0.25) {
    return {
      expectedState: 'HIGH_5V',
      minVoltage: 4.75,
      maxVoltage: 5.25,
      shortToBatteryThresholdV: 6.5,
      enabled: true,
    };
  }

  if (upper.includes('CAN_H') || upper.includes('CANH')) {
    return {
      expectedState: 'CAN_BUS',
      minVoltage: 2.2,
      maxVoltage: 3.8,
      shortToBatteryThresholdV: 5.5,
      enabled: true,
    };
  }

  if (upper.includes('CAN_L') || upper.includes('CANL')) {
    return {
      expectedState: 'CAN_BUS',
      minVoltage: 1.2,
      maxVoltage: 2.8,
      shortToBatteryThresholdV: 5.5,
      enabled: true,
    };
  }

  if (pin.category === 'power' || upper.includes('KL30') || upper.includes('KL15')) {
    return {
      expectedState: 'HIGH_12V',
      minVoltage: 10.5,
      maxVoltage: 15.0,
      shortToBatteryThresholdV: 15.6,
      enabled: pin.id === 'ecu-pin-3' || pin.id === 'ecu-pin-4',
    };
  }

  if (
    pin.id === 'ecu-pin-11' ||
    (pin.category === 'actuator_out' && /\bIGN(?:_|\d|\b)/.test(pin.label.toUpperCase()))
  ) {
    return {
      expectedState: 'PWM_ACTUATOR',
      minVoltage: 0.0,
      maxVoltage: 5.4,
      shortToBatteryThresholdV: 6.5,
      enabled: true,
    };
  }

  if (pin.nominalVoltage >= 10.0 || pin.category === 'actuator_out') {
    return {
      expectedState: pin.category === 'actuator_out' ? 'PWM_ACTUATOR' : 'HIGH_12V',
      minVoltage: 10.5,
      maxVoltage: 15.0,
      shortToBatteryThresholdV: 15.6,
      enabled: pin.id === 'ecu-pin-10',
    };
  }

  if (pin.id === 'ecu-pin-15' || upper.includes('O2')) {
    return {
      expectedState: 'ANALOG_RANGE',
      minVoltage: 0.05,
      maxVoltage: 1.15,
      shortToBatteryThresholdV: 3.5,
      enabled: true,
    };
  }

  return {
    expectedState: 'ANALOG_RANGE',
    minVoltage: 0.2,
    maxVoltage: 4.85,
    shortToBatteryThresholdV: 6.5,
    enabled: true,
  };
}

export function buildDefaultLogicCheckRules(pins: EcuPin[]): LogicCheckRule[] {
  return pins.map((pin) => {
    const spec = inferDefaultSpecForPin(pin);
    return {
      id: `lc-${pin.id}`,
      pinId: pin.id,
      pinNumber: pin.pinNumber,
      pinLabel: pin.label,
      ...spec,
    };
  });
}

export function applyWatchPresetToRules(
  rules: LogicCheckRule[],
  preset: LogicWatchPreset
): LogicCheckRule[] {
  const allowList = WATCH_PRESET_PINS[preset];
  return rules.map((r) => ({
    ...r,
    enabled: allowList === null ? r.pinId !== 'ecu-pin-2' : allowList.includes(r.pinId),
  }));
}

export function mergeLogicCheckRules(
  pins: EcuPin[],
  overrides: LogicCheckRuleOverride[] = []
): LogicCheckRule[] {
  const base = buildDefaultLogicCheckRules(pins);
  const byPin = new Map<string, LogicCheckRuleOverride>();
  for (const ov of overrides) {
    if (ov && typeof ov.pinId === 'string') {
      byPin.set(ov.pinId, ov);
    }
  }
  return base.map((rule) => {
    const ov = byPin.get(rule.pinId);
    if (!ov) return rule;
    const nextMin =
      typeof ov.minVoltage === 'number' && Number.isFinite(ov.minVoltage)
        ? ov.minVoltage
        : rule.minVoltage;
    const nextMax =
      typeof ov.maxVoltage === 'number' && Number.isFinite(ov.maxVoltage) && ov.maxVoltage >= nextMin
        ? ov.maxVoltage
        : Math.max(nextMin, rule.maxVoltage);
    const nextShortVbat =
      typeof ov.shortToBatteryThresholdV === 'number' &&
      Number.isFinite(ov.shortToBatteryThresholdV)
        ? Math.max(nextMax + 0.2, ov.shortToBatteryThresholdV)
        : rule.shortToBatteryThresholdV;
    return {
      ...rule,
      expectedState: ov.expectedState ?? rule.expectedState,
      minVoltage: nextMin,
      maxVoltage: nextMax,
      shortToBatteryThresholdV: nextShortVbat,
      enabled: typeof ov.enabled === 'boolean' ? ov.enabled : rule.enabled,
      isCustom: ov.isCustom ?? rule.isCustom,
    };
  });
}

function classifyObservedLogicState(voltage: number, expected: LogicExpectedState): string {
  if (voltage >= 9.5) return 'HIGH (VBAT)';
  if (voltage >= 4.4 && voltage <= 5.6) return 'HIGH (5V)';
  if (voltage >= 1.8 && voltage <= 3.9 && expected === 'CAN_BUS') return 'CAN ACTIVE';
  if (voltage >= 0.0 && voltage <= 0.55) return 'LOW (GND)';
  if (voltage > 0.55 && voltage < 4.4) return 'ANALOG / MID';
  return `${voltage.toFixed(2)}V`;
}

function isWireConnectedAndCut(pinId: string, wires: WireConnection[]): boolean {
  const connected = wires.filter(
    (w) => w.sourcePinId === pinId || w.targetPinId === pinId
  );
  return connected.length > 0 && connected.every((w) => w.isCut);
}

export function formatLogicStateLabel(state: LogicExpectedState): string {
  switch (state) {
    case 'HIGH_12V':
      return 'HIGH 12V';
    case 'HIGH_5V':
      return 'HIGH 5V';
    case 'LOW_GND':
      return 'LOW GND';
    case 'CAN_BUS':
      return 'CAN BUS';
    case 'PWM_ACTUATOR':
      return 'PWM / TRIG';
    default:
      return 'ANALOG V';
  }
}

export function formatFaultClassLabel(faultClass: LogicCheckFaultClass): string {
  switch (faultClass) {
    case 'SHORT_TO_BATTERY':
      return 'SHORT TO BATTERY';
    case 'SHORT_TO_GROUND':
      return 'SHORT TO GND';
    case 'OVERVOLTAGE':
      return 'OVERVOLTAGE';
    case 'UNDERVOLTAGE':
      return 'UNDERVOLTAGE';
    case 'OPEN_CIRCUIT':
      return 'OPEN CIRCUIT';
    case 'LOGIC_MISMATCH':
      return 'LOGIC MISMATCH';
    case 'STANDBY':
      return 'STANDBY';
    default:
      return 'PASS';
  }
}

export function evaluateLogicCheck(params: {
  rules: LogicCheckRule[];
  pins: EcuPin[];
  nodeVoltages: Record<string, number>;
  powerSupply: PowerSupplyState;
  wires: WireConnection[];
  faults: InjectedFault[];
  components?: BenchComponent[];
  requiresMainRelayLoop?: boolean;
  isArmed?: boolean;
}): LogicCheckSnapshot {
  const {
    rules,
    pins,
    nodeVoltages,
    powerSupply,
    wires,
    faults,
    components,
    requiresMainRelayLoop = true,
    isArmed = true,
  } = params;

  const pinById = new Map(pins.map((p) => [p.id, p]));
  const isPowered = Boolean(powerSupply.isOutputEnabled);
  const psuTargetV = Number.isFinite(powerSupply.voltageSetting) ? powerSupply.voltageSetting : 12.6;

  const results: LogicCheckRuleResult[] = [];
  const alerts: LogicCheckAlert[] = [];

  let monitoredCount = 0;
  let passingCount = 0;
  let warningCount = 0;
  let criticalCount = 0;

  for (const rule of rules) {
    const pin = pinById.get(rule.pinId);
    const pinLabel = pin?.label ?? rule.pinLabel;
    const pinNumber = pin?.pinNumber ?? rule.pinNumber;
    const measuredVoltage = nodeVoltages[rule.pinId] ?? 0;
    const observedLogicState = isPowered
      ? classifyObservedLogicState(measuredVoltage, rule.expectedState)
      : 'PSU OFF';

    if (!rule.enabled) {
      results.push({
        rule: { ...rule, pinLabel, pinNumber },
        measuredVoltage,
        observedLogicState,
        status: 'MUTED',
        faultClass: 'NOMINAL',
        summary: 'Monitoring paused for this pin.',
        recommendation: 'Enable rule to include in simultaneous sweep.',
      });
      continue;
    }

    monitoredCount += 1;

    if (!isPowered) {
      results.push({
        rule: { ...rule, pinLabel, pinNumber },
        measuredVoltage,
        observedLogicState: 'PSU STANDBY',
        status: 'STANDBY',
        faultClass: 'STANDBY',
        summary: `Bench PSU OFF — awaiting energized sweep (${rule.minVoltage.toFixed(2)}–${rule.maxVoltage.toFixed(2)}V).`,
        recommendation: 'Enable bench DC power output to begin live logic validation.',
      });
      continue;
    }

    const activeFault = faults.find((f) => f.pinId === rule.pinId && f.faultType !== 'NONE');
    const allWiresCut = isWireConnectedAndCut(rule.pinId, wires);
    const rangeLabel = `${rule.minVoltage.toFixed(2)}V–${rule.maxVoltage.toFixed(2)}V`;

    const isLowLogicExpected =
      rule.expectedState === 'LOW_GND' ||
      rule.expectedState === 'HIGH_5V' ||
      rule.expectedState === 'ANALOG_RANGE' ||
      rule.expectedState === 'CAN_BUS' ||
      (rule.expectedState === 'PWM_ACTUATOR' && rule.maxVoltage <= 6.0);

    // 1. Detect Short to Battery (+VBAT excursion on lower-voltage/ground/logic/CAN pin, or explicit fault)
    const isShortToVbat =
      activeFault?.faultType === 'SHORT_TO_VBAT' ||
      (isLowLogicExpected &&
        (measuredVoltage >= rule.shortToBatteryThresholdV ||
          (psuTargetV >= 9.0 && measuredVoltage >= Math.max(rule.maxVoltage + 2.0, psuTargetV - 2.0))));

    // 2. Detect Short to Ground on rails/signals that should be energized (> 1.0V nominal floor)
    const isShortToGnd =
      activeFault?.faultType === 'SHORT_TO_GND' ||
      (!allWiresCut &&
        rule.minVoltage >= 1.0 &&
        measuredVoltage <= 0.45 &&
        rule.expectedState !== 'LOW_GND');

    // 3. Detect Open Circuit (cut harness wire or injected OPEN_CIRCUIT fault)
    const isOpenCircuit =
      activeFault?.faultType === 'OPEN_CIRCUIT' || allWiresCut;

    // 4. General Overvoltage / Undervoltage / Logic mismatch outside [minVoltage, maxVoltage]
    const outOfRangeHigh = measuredVoltage > rule.maxVoltage + 0.05;
    const outOfRangeLow = measuredVoltage < rule.minVoltage - 0.05;

    if (isShortToVbat) {
      criticalCount += 1;
      const summary = `Short to Battery (+VBAT) detected: ${measuredVoltage.toFixed(2)}V (expected ${rangeLabel}).`;
      const recommendation = `Disconnect load / inspect ${pinLabel} (#${pinNumber}) harness for crossed +12V battery feed immediately.`;
      results.push({
        rule: { ...rule, pinLabel, pinNumber },
        measuredVoltage,
        observedLogicState: 'SHORT +VBAT',
        status: 'CRITICAL',
        faultClass: 'SHORT_TO_BATTERY',
        summary,
        recommendation,
      });
      alerts.push({
        id: `alert-${rule.pinId}-SHORT_TO_BATTERY`,
        pinId: rule.pinId,
        pinNumber,
        pinLabel,
        severity: 'CRITICAL',
        faultClass: 'SHORT_TO_BATTERY',
        title: `${pinLabel} (#${pinNumber}): Unexpected Short to Battery`,
        detail: `Measured ${measuredVoltage.toFixed(2)} V DC exceeds ${formatLogicStateLabel(rule.expectedState)} ceiling (${rangeLabel}).`,
        measuredVoltage,
        expectedRangeLabel: rangeLabel,
        recommendation,
      });
      continue;
    }

    if (isShortToGnd) {
      criticalCount += 1;
      const summary = `Short to Ground detected: ${measuredVoltage.toFixed(2)}V (expected ${rangeLabel}).`;
      const recommendation = `Check ${pinLabel} (#${pinNumber}) for dead short to KL31 chassis ground or clamped sensor supply.`;
      results.push({
        rule: { ...rule, pinLabel, pinNumber },
        measuredVoltage,
        observedLogicState: 'SHORT GND',
        status: 'CRITICAL',
        faultClass: 'SHORT_TO_GROUND',
        summary,
        recommendation,
      });
      alerts.push({
        id: `alert-${rule.pinId}-SHORT_TO_GROUND`,
        pinId: rule.pinId,
        pinNumber,
        pinLabel,
        severity: 'CRITICAL',
        faultClass: 'SHORT_TO_GROUND',
        title: `${pinLabel} (#${pinNumber}): Short to Ground Collapse`,
        detail: `Measured ${measuredVoltage.toFixed(2)} V DC collapsed below valid window (${rangeLabel}).`,
        measuredVoltage,
        expectedRangeLabel: rangeLabel,
        recommendation,
      });
      continue;
    }

    if (isOpenCircuit && (outOfRangeLow || outOfRangeHigh || activeFault?.faultType === 'OPEN_CIRCUIT' || allWiresCut)) {
      const severity = rule.expectedState === 'HIGH_12V' || rule.expectedState === 'HIGH_5V' ? 'CRITICAL' : 'WARNING';
      if (severity === 'CRITICAL') criticalCount += 1;
      else warningCount += 1;
      const summary = `Open circuit detected on ${pinLabel} (#${pinNumber}) at ${measuredVoltage.toFixed(2)}V.`;
      const recommendation = `Verify terminal crimps and harness continuity on ${pinLabel} (#${pinNumber}).`;
      results.push({
        rule: { ...rule, pinLabel, pinNumber },
        measuredVoltage,
        observedLogicState: 'OPEN / FLOAT',
        status: severity,
        faultClass: 'OPEN_CIRCUIT',
        summary,
        recommendation,
      });
      alerts.push({
        id: `alert-${rule.pinId}-OPEN_CIRCUIT`,
        pinId: rule.pinId,
        pinNumber,
        pinLabel,
        severity,
        faultClass: 'OPEN_CIRCUIT',
        title: `${pinLabel} (#${pinNumber}): Open Harness / Discontinuity`,
        detail: `Measured ${measuredVoltage.toFixed(2)} V DC with open circuit condition (expected ${rangeLabel}).`,
        measuredVoltage,
        expectedRangeLabel: rangeLabel,
        recommendation,
      });
      continue;
    }

    if (outOfRangeHigh || outOfRangeLow) {
      const faultClass: LogicCheckFaultClass = outOfRangeHigh
        ? rule.expectedState === 'LOW_GND'
          ? 'LOGIC_MISMATCH'
          : 'OVERVOLTAGE'
        : 'UNDERVOLTAGE';
      const severity: 'CRITICAL' | 'WARNING' =
        (rule.expectedState === 'LOW_GND' && measuredVoltage >= 1.5) ||
        (rule.expectedState === 'HIGH_5V' && Math.abs(measuredVoltage - 5.0) >= 1.0) ||
        measuredVoltage >= rule.maxVoltage + 2.5
          ? 'CRITICAL'
          : 'WARNING';
      if (severity === 'CRITICAL') criticalCount += 1;
      else warningCount += 1;

      const summary = `${formatFaultClassLabel(faultClass)}: ${measuredVoltage.toFixed(2)}V outside ${rangeLabel}.`;
      const recommendation =
        rule.expectedState === 'LOW_GND'
          ? `Ground offset of ${measuredVoltage.toFixed(2)}V on ${pinLabel} (#${pinNumber}); inspect ground lug for high resistance.`
          : `Inspect ${pinLabel} (#${pinNumber}) supply/load resistance — voltage outside ${rangeLabel}.`;

      results.push({
        rule: { ...rule, pinLabel, pinNumber },
        measuredVoltage,
        observedLogicState,
        status: severity,
        faultClass,
        summary,
        recommendation,
      });
      alerts.push({
        id: `alert-${rule.pinId}-${faultClass}`,
        pinId: rule.pinId,
        pinNumber,
        pinLabel,
        severity,
        faultClass,
        title: `${pinLabel} (#${pinNumber}): ${formatFaultClassLabel(faultClass)}`,
        detail: `Measured ${measuredVoltage.toFixed(2)} V DC outside expected ${rangeLabel}.`,
        measuredVoltage,
        expectedRangeLabel: rangeLabel,
        recommendation,
      });
      continue;
    }

    passingCount += 1;
    results.push({
      rule: { ...rule, pinLabel, pinNumber },
      measuredVoltage,
      observedLogicState,
      status: 'PASS',
      faultClass: 'NOMINAL',
      summary: `Valid ${formatLogicStateLabel(rule.expectedState)} (${measuredVoltage.toFixed(2)}V within ${rangeLabel}).`,
      recommendation: 'No action required.',
    });
  }

  // Multi-Pin Differential Cross-Checks (evaluate simultaneously across paired pins)
  const crossChecks: CrossPinCheckResult[] = [];
  const vCanH = nodeVoltages['ecu-pin-13'];
  const vCanL = nodeVoltages['ecu-pin-14'];
  if (typeof vCanH === 'number' && typeof vCanL === 'number') {
    if (!isPowered) {
      crossChecks.push({
        id: 'cross-can-symmetry',
        title: 'CAN_H + CAN_L Differential Symmetry',
        measuredDeltaLabel: 'PSU OFF',
        expectedLabel: 'Sum 4.15–5.85V',
        status: 'STANDBY',
        detail: 'Energize bench PSU to verify recessive/dominant symmetry.',
      });
    } else {
      const canSum = vCanH + vCanL;
      const symmetric = canSum >= 4.15 && canSum <= 5.85 && vCanH <= 4.5 && vCanL <= 4.5;
      const severe = canSum > 7.0 || canSum < 1.5;
      crossChecks.push({
        id: 'cross-can-symmetry',
        title: 'CAN_H + CAN_L Differential Symmetry',
        measuredDeltaLabel: `${vCanH.toFixed(2)}V + ${vCanL.toFixed(2)}V = ${canSum.toFixed(2)}V`,
        expectedLabel: '4.15–5.85V',
        status: symmetric ? 'PASS' : severe ? 'CRITICAL' : 'WARNING',
        detail: symmetric
          ? 'Twisted pair common-mode voltage centered cleanly around 5.0V.'
          : 'Asymmetric CAN bus bias detected (possible bus short to VBAT/GND or missing terminator).',
      });
    }
  }

  const vRef = nodeVoltages['ecu-pin-5'];
  const vSgnd = nodeVoltages['ecu-pin-6'];
  if (typeof vRef === 'number' && typeof vSgnd === 'number') {
    if (!isPowered) {
      crossChecks.push({
        id: 'cross-vref-sgnd',
        title: 'VREF_5V − SGND Reference Headroom',
        measuredDeltaLabel: 'PSU OFF',
        expectedLabel: '4.50–5.40V Δ',
        status: 'STANDBY',
        detail: 'Energize bench PSU to validate clean ratiometric sensor headroom.',
      });
    } else {
      const refDelta = vRef - vSgnd;
      const healthy = refDelta >= 4.5 && refDelta <= 5.4;
      const severe = refDelta > 6.5 || refDelta < 2.0;
      crossChecks.push({
        id: 'cross-vref-sgnd',
        title: 'VREF_5V − SGND Reference Headroom',
        measuredDeltaLabel: `Δ ${refDelta.toFixed(2)}V`,
        expectedLabel: '4.50–5.40V Δ',
        status: healthy ? 'PASS' : severe ? 'CRITICAL' : 'WARNING',
        detail: healthy
          ? '5V sensor supply minus analog return within ratiometric tolerance.'
          : 'Ratiometric 5V reference collapsed or over-biased relative to SGND.',
      });
    }
  }

  // Main Relay Self-Hold Feedback Loop Check (KL15 + 5V VREF Active vs Pin 87 Actuator Rail)
  const vKl15 = nodeVoltages['ecu-pin-4'];
  const vRelay87 = nodeVoltages['relay-87'];
  const relayComp = components?.find((c) => c.id === 'comp-relay');
  const relayLatched = relayComp ? Boolean(relayComp.state?.isLatched ?? true) : true;
  const mrelFault = faults.find((f) => f.pinId === 'ecu-pin-12' && f.faultType !== 'NONE');
  const isMrelOpen =
    mrelFault?.faultType === 'OPEN_CIRCUIT' || isWireConnectedAndCut('ecu-pin-12', wires);

  if (!isPowered) {
    crossChecks.push({
      id: 'cross-main-relay-loop',
      title: 'Main Relay Self-Hold Loop (KL15 → MREL → Pin 87)',
      measuredDeltaLabel: 'PSU OFF',
      expectedLabel: 'Pin 87 ≥ 9.0V (Latched)',
      status: 'STANDBY',
      detail: 'Energize bench PSU to verify Main Relay self-hold coil & Pin 87 actuator feed.',
    });
  } else {
    const logicPowered =
      typeof vKl15 === 'number' &&
      vKl15 >= 9.0 &&
      typeof vRef === 'number' &&
      vRef >= 4.4 &&
      vRef <= 5.6;
    const pin87FloatOpen = typeof vRelay87 === 'number' && vRelay87 < 9.0;
    const mainRelayLoopOpen = !relayLatched || pin87FloatOpen || isMrelOpen;

    if (logicPowered && mainRelayLoopOpen) {
      const pin87Label = typeof vRelay87 === 'number' ? `${vRelay87.toFixed(2)}V` : relayLatched ? 'OPEN' : 'UNLATCHED';
      const loopMessage =
        'ECU Logic Powered (5V VREF Active), but Actuator Power Rail (+B / I/B2 via Pin 87) Open — Close Main Relay Loop.';
      crossChecks.push({
        id: 'cross-main-relay-loop',
        title: 'Main Relay Self-Hold Loop (KL15 → MREL → Pin 87)',
        measuredDeltaLabel: `5V ${vRef.toFixed(2)}V · 87 ${pin87Label}`,
        expectedLabel: 'Pin 87 ≥ 9.0V (Latched)',
        status: 'WARNING',
        detail: loopMessage,
      });

      if (requiresMainRelayLoop && !alerts.some((a) => a.pinId === 'ecu-pin-12')) {
        warningCount += 1;
        alerts.push({
          id: 'alert-ecu-pin-12-MAIN_RELAY_LOOP',
          pinId: 'ecu-pin-12',
          pinNumber: 12,
          pinLabel: pinById.get('ecu-pin-12')?.label ?? 'MRELAY',
          severity: 'WARNING',
          faultClass: 'LOGIC_MISMATCH',
          title: 'ECU Logic Powered (5V VREF Active), but Actuator Power Rail (+B / I/B2) Open',
          detail: loopMessage,
          measuredVoltage: typeof vRelay87 === 'number' ? vRelay87 : nodeVoltages['ecu-pin-12'] ?? 0,
          expectedRangeLabel: 'Pin 87 ≥ 9.00V (Main Relay Closed)',
          recommendation:
            'Latch Main System Relay (comp-relay) and verify MREL Pin 12 continuity to relay coil 85.',
        });
      }
    } else if (logicPowered) {
      crossChecks.push({
        id: 'cross-main-relay-loop',
        title: 'Main Relay Self-Hold Loop (KL15 → MREL → Pin 87)',
        measuredDeltaLabel: `5V ${vRef.toFixed(2)}V · 87 ${(vRelay87 ?? psuTargetV).toFixed(2)}V`,
        expectedLabel: 'Pin 87 ≥ 9.0V (Latched)',
        status: 'PASS',
        detail: 'Main Relay self-hold loop closed; actuator power rail (+B / Pin 87) energized.',
      });
    } else {
      crossChecks.push({
        id: 'cross-main-relay-loop',
        title: 'Main Relay Self-Hold Loop (KL15 → MREL → Pin 87)',
        measuredDeltaLabel: `KL15 ${(vKl15 ?? 0).toFixed(2)}V · 5V ${(vRef ?? 0).toFixed(2)}V`,
        expectedLabel: 'KL15 ≥ 9V & VREF ~5V',
        status: 'STANDBY',
        detail: 'Awaiting valid KL15 & 5V VREF rails to confirm Main Relay self-hold engagement.',
      });
    }
  }

  // Escalate critical/warning counts cleanly based on alert severities (prioritize CRITICAL first)
  alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'CRITICAL' ? -1 : 1;
    return a.pinNumber - b.pinNumber;
  });

  const overallStatus: LogicCheckSnapshot['overallStatus'] = !isPowered
    ? 'STANDBY'
    : criticalCount > 0
      ? 'CRITICAL'
      : warningCount > 0
        ? 'WARNING'
        : 'PASS';

  const signature = isArmed && isPowered && alerts.length > 0
    ? alerts.map((a) => `${a.id}:${a.faultClass}`).join('|')
    : '';

  return {
    isArmed,
    overallStatus,
    monitoredCount,
    passingCount,
    warningCount,
    criticalCount,
    results,
    crossChecks,
    alerts,
    signature,
  };
}

export function loadSavedLogicCheckRules(): LogicCheckRuleOverride[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOGIC_CHECK_RULES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLogicCheckRules(rules: LogicCheckRule[]): void {
  if (typeof window === 'undefined') return;
  try {
    const compact: LogicCheckRuleOverride[] = rules.map((r) => ({
      pinId: r.pinId,
      expectedState: r.expectedState,
      minVoltage: r.minVoltage,
      maxVoltage: r.maxVoltage,
      shortToBatteryThresholdV: r.shortToBatteryThresholdV,
      enabled: r.enabled,
      isCustom: r.isCustom,
    }));
    window.localStorage.setItem(LOGIC_CHECK_RULES_STORAGE_KEY, JSON.stringify(compact));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadLogicCheckArmed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(LOGIC_CHECK_ARMED_STORAGE_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export function saveLogicCheckArmed(armed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOGIC_CHECK_ARMED_STORAGE_KEY, String(armed));
  } catch {
    // Ignore storage errors
  }
}
