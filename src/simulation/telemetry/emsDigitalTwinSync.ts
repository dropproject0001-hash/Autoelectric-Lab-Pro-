/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type {
  BenchComponent,
  EcuPin,
  InjectedFault,
  PowerSupplyState,
  WireConnection,
} from '../../types/ecu';
import {
  getEcuProfileById,
  SelectedVehicleContext,
  UNIVERSAL_BRAND_KEY,
} from '../../utils/vehicleEcuRegistry';

export type EmsCircuitLayer =
  | 'ALL'
  | 'POWER_FUSES'
  | 'RELAYS'
  | 'INJ_COILS'
  | 'FUEL_SYSTEM'
  | 'GROUNDS';

export type EmsPowertrainMode = 'GASOLINE_EFI' | 'DIESEL_CRDI';

export interface EmsOemPinMapping {
  kl30: string;
  kl15: string;
  gnd: string;
  sgnd: string;
  vref: string;
  tpsSig: string;
  inj1: string;
  inj2: string;
  inj3: string;
  inj4: string;
  coil1: string;
  coil2: string;
  coil3: string;
  coil4: string;
  mainRelayCtrl: string;
  fuelPumpRelayCtrl: string;
  canH: string;
  canL: string;
}

export interface EmsEcuSyncProfile {
  profileId: string;
  modelCode: string;
  ecuTitle: string;
  brandLabel: string;
  vehicleModel: string;
  mcuArchitecture: string;
  powertrainMode: EmsPowertrainMode;
  firingOrder: readonly [number, number, number, number];
  verificationStatus: SelectedVehicleContext['status'];
  isDefaultUniversalEfi: boolean;
  requiresMainRelayLoop: boolean;
  requiresCaseGround: boolean;
  canTerminationOhms: number;
  oemPinMapping: EmsOemPinMapping;
}

export interface EmsFuseTelemetry {
  id: 'fuse-main-50a' | 'fuse-inj-20a' | 'fuse-fp-20a' | 'fuse-ign-15a' | 'fuse-ecu-10a';
  label: string;
  ratingAmps: number;
  circuitName: string;
  colorHex: number;
  mappedPinId: string;
  voltageInV: number;
  voltageOutV: number;
  currentAmps: number;
  isEnergized: boolean;
  isBlown: boolean;
}

export interface EmsRelayTelemetry {
  id: 'main-relay' | 'fuel-pump-relay';
  label: string;
  pin30V: number;
  pin85V: number;
  pin86V: number;
  pin87V: number;
  coilCurrentMa: number;
  isLatched: boolean;
  isFaulted: boolean;
}

export interface EmsCylinderTelemetry {
  cylinder: 1 | 2 | 3 | 4;
  firingSlot: 0 | 1 | 2 | 3;
  injectorVoltageV: number;
  coilVoltageV: number;
  injectorDutyPercent: number;
  isInjectorFaulted: boolean;
  isCoilFaulted: boolean;
}

export interface EmsGroundTelemetry {
  sgndVoltageV: number;
  g1ChassisVoltageV: number;
  g2EngineVoltageV: number;
  groundOffsetMv: number;
  hasGroundFault: boolean;
}

export interface EmsFuelSystemTelemetry {
  isPumpRunning: boolean;
  pumpVoltageV: number;
  pumpCurrentAmps: number;
  railPressureBar: number;
  fuelLevelPercent: number;
  isFaulted: boolean;
}

export interface EmsDigitalTwinState {
  isPowerActive: boolean;
  isIgnitionOn: boolean;
  isSupplyTripped: boolean;
  batteryVoltageV: number;
  switchedRailVoltageV: number;
  vrefVoltageV: number;
  totalCurrentAmps: number;
  rpm: number;
  isEngineRunning: boolean;
  ckpSignalLost: boolean;
  tpsPercent: number;
  ectTempC: number;
  fuses: EmsFuseTelemetry[];
  mainRelay: EmsRelayTelemetry;
  fuelPumpRelay: EmsRelayTelemetry;
  cylinders: EmsCylinderTelemetry[];
  grounds: EmsGroundTelemetry;
  fuelSystem: EmsFuelSystemTelemetry;
}

export interface CylinderPhaseOutput {
  cylinder: 1 | 2 | 3 | 4;
  injectorPulse: number; // 0..1
  coilDwell: number; // 0..1
  sparkArc: number; // 0..1
}

const DIESEL_PATTERN =
  /diesel|crdi|4n15|4jj1|4jj3|4jk1|yd25|ys23|1gd|2gd|2kd|1kd|4d56|edc17|transtron|d4cb|wl-c|puma|tdci/i;

function pickFirstPin(pins: string[] | undefined, fallback: string): string {
  if (!pins || pins.length === 0) return fallback;
  return pins.slice(0, 2).join('/');
}

function findOemPinLabel(
  pins: EcuPin[],
  simPinId: string,
  fallback: string
): string {
  const match = pins.find((p) => p.id === simPinId);
  if (!match) return fallback;
  const bracketMatch = match.name.match(/\[([^\]]+)\]/);
  if (bracketMatch?.[1]) {
    return `${match.label} (${bracketMatch[1]})`;
  }
  return `Pin ${match.pinNumber} · ${match.label}`;
}

/**
 * Resolves the active 3D Engine Management System (EMS) ECU configuration from the
 * currently selected vehicle & physical ECU profile, defaulting cleanly to a
 * 4-Cylinder Gasoline Sequential EFI architecture (`EMS-32-801`).
 */
export function resolveEmsEcuSyncProfile(
  vehicleContext?: SelectedVehicleContext | null,
  selectedEcuProfileId?: string | null,
  pins: EcuPin[] = []
): EmsEcuSyncProfile {
  const isUniversal =
    !vehicleContext ||
    vehicleContext.brandKey === UNIVERSAL_BRAND_KEY ||
    vehicleContext.modelName === 'Generic 16-Pin Bench';

  const brandProfile = getEcuProfileById(selectedEcuProfileId ?? null);
  const hwProfile = vehicleContext?.benchHardwareProfile || brandProfile?.benchHardwareProfile;
  const oemMap = vehicleContext?.oemBenchPinoutMap;

  if (isUniversal && !brandProfile) {
    return {
      profileId: 'universal-4cyl-efi',
      modelCode: 'EMS-32-801',
      ecuTitle: '4-Cyl Sequential EFI EMS',
      brandLabel: 'Universal Bench',
      vehicleModel: '4-Cylinder Gasoline EFI',
      mcuArchitecture: '32-Bit Automotive MCU',
      powertrainMode: 'GASOLINE_EFI',
      firingOrder: [1, 3, 4, 2],
      verificationStatus: 'VERIFIED',
      isDefaultUniversalEfi: true,
      requiresMainRelayLoop: true,
      requiresCaseGround: false,
      canTerminationOhms: 120,
      oemPinMapping: {
        kl30: 'Pin 3 · BATT (+12V KL30)',
        kl15: 'Pin 4 · IGN (+12V KL15)',
        gnd: 'Pin 1/2 · SYS GND (KL31)',
        sgnd: 'Pin 6 · SENSOR GND (SGND)',
        vref: 'Pin 5 · 5V VREF',
        tpsSig: 'Pin 7 · TPS_SIG',
        inj1: 'Pin 10 · INJ_1 (Cyl 1)',
        inj2: 'Pin 10B · INJ_2 (Cyl 2)',
        inj3: 'Pin 10C · INJ_3 (Cyl 3)',
        inj4: 'Pin 10D · INJ_4 (Cyl 4)',
        coil1: 'Pin 11 · COIL_1 (Cyl 1)',
        coil2: 'Pin 11B · COIL_2 (Cyl 2)',
        coil3: 'Pin 11C · COIL_3 (Cyl 3)',
        coil4: 'Pin 11D · COIL_4 (Cyl 4)',
        mainRelayCtrl: 'Pin 12 · MRELAY (Pin 85)',
        fuelPumpRelayCtrl: 'Pin 16 · FP_RELAY (Pin 85)',
        canH: 'Pin 13 · CAN_H (120Ω)',
        canL: 'Pin 14 · CAN_L (120Ω)',
      },
    };
  }

  const descriptor = [
    vehicleContext?.brandLabel,
    vehicleContext?.modelName,
    vehicleContext?.controllerNote,
    brandProfile?.modelName,
    hwProfile?.ecuFamily,
    oemMap?.engineAndEcuTitle,
  ]
    .filter(Boolean)
    .join(' ');

  const powertrainMode: EmsPowertrainMode = DIESEL_PATTERN.test(descriptor)
    ? 'DIESEL_CRDI'
    : 'GASOLINE_EFI';

  const modelCode =
    hwProfile?.ecuFamily ||
    brandProfile?.modelName?.split('(')[0]?.trim() ||
    vehicleContext?.modelName?.slice(0, 18) ||
    'EMS-32-801';

  const wake = hwProfile?.benchWakeupPins;
  const actPins = oemMap?.pinGroups?.actuators ?? [];
  const findActPin = (pattern: RegExp, fallback: string): string => {
    const found = actPins.find((a) => pattern.test(a.signal));
    return found ? `OEM Pin ${found.pin} · ${found.signal}` : fallback;
  };

  return {
    profileId: brandProfile?.id || oemMap?.id || `${vehicleContext?.brandKey || 'ecu'}-synced`,
    modelCode: modelCode.slice(0, 22),
    ecuTitle:
      oemMap?.engineAndEcuTitle ||
      brandProfile?.modelName ||
      vehicleContext?.controllerNote ||
      'Synced OEM EMS Controller',
    brandLabel: vehicleContext?.brandLabel || brandProfile?.brandName || 'OEM ECU',
    vehicleModel: vehicleContext?.modelName || brandProfile?.modelName || 'Synced Vehicle',
    mcuArchitecture: hwProfile?.mcuArchitecture || '32-Bit OEM Powertrain MCU',
    powertrainMode,
    firingOrder: [1, 3, 4, 2],
    verificationStatus: vehicleContext?.status || 'VERIFIED',
    isDefaultUniversalEfi: false,
    requiresMainRelayLoop: hwProfile?.requiresMainRelayLoop ?? true,
    requiresCaseGround: hwProfile?.requiresCaseGround ?? false,
    canTerminationOhms: hwProfile?.canTerminationOhms ?? 120,
    oemPinMapping: {
      kl30: wake?.kl30?.length
        ? `OEM Pin ${pickFirstPin(wake.kl30, '3')} · KL30`
        : findOemPinLabel(pins, 'ecu-pin-3', 'Pin 3 · KL30'),
      kl15: wake?.kl15?.length
        ? `OEM Pin ${pickFirstPin(wake.kl15, '4')} · KL15`
        : findOemPinLabel(pins, 'ecu-pin-4', 'Pin 4 · KL15'),
      gnd: wake?.ground?.length
        ? `OEM Pin ${pickFirstPin(wake.ground, '1')} · KL31`
        : findOemPinLabel(pins, 'ecu-pin-1', 'Pin 1 · KL31'),
      sgnd: findOemPinLabel(pins, 'ecu-pin-6', 'Pin 6 · SGND'),
      vref: findOemPinLabel(pins, 'ecu-pin-5', 'Pin 5 · VREF 5V'),
      tpsSig: findOemPinLabel(pins, 'ecu-pin-7', 'Pin 7 · TPS_SIG'),
      inj1: findActPin(/INJ\s*#?1\b/i, findOemPinLabel(pins, 'ecu-pin-10', 'Pin 10 · INJ 1')),
      inj2: findActPin(/INJ\s*#?2\b/i, 'Bank B · INJ 2'),
      inj3: findActPin(/INJ\s*#?3\b/i, 'Bank C · INJ 3'),
      inj4: findActPin(/INJ\s*#?4\b/i, 'Bank D · INJ 4'),
      coil1:
        powertrainMode === 'DIESEL_CRDI'
          ? 'Glow / Rail Stage 1'
          : findOemPinLabel(pins, 'ecu-pin-11', 'Pin 11 · COIL 1'),
      coil2: powertrainMode === 'DIESEL_CRDI' ? 'Glow / Rail Stage 2' : 'IGN_2 · COIL 2',
      coil3: powertrainMode === 'DIESEL_CRDI' ? 'Glow / Rail Stage 3' : 'IGN_3 · COIL 3',
      coil4: powertrainMode === 'DIESEL_CRDI' ? 'Glow / Rail Stage 4' : 'IGN_4 · COIL 4',
      mainRelayCtrl: wake?.mainRelayControl?.length
        ? `OEM Pin ${pickFirstPin(wake.mainRelayControl, '12')} · MRELAY`
        : findOemPinLabel(pins, 'ecu-pin-12', 'Pin 12 · MRELAY'),
      fuelPumpRelayCtrl: findOemPinLabel(pins, 'ecu-pin-16', 'Pin 16 · FP_RELAY'),
      canH: wake?.canHigh?.length
        ? `OEM Pin ${pickFirstPin(wake.canHigh, '13')} · CAN_H`
        : findOemPinLabel(pins, 'ecu-pin-13', 'Pin 13 · CAN_H'),
      canL: wake?.canLow?.length
        ? `OEM Pin ${pickFirstPin(wake.canLow, '14')} · CAN_L`
        : findOemPinLabel(pins, 'ecu-pin-14', 'Pin 14 · CAN_L'),
    },
  };
}

/**
 * Evaluates full live 3D EMS digital twin telemetry (fuses, Main & Fuel Pump relays,
 * 4-cylinder injectors/coils, fuel rail pressure, and SGND vs G1/G2 grounds) strictly
 * from the active MNA circuit solution, Bench PSU, fault injector, and RPM emulator.
 */
export function evaluateEmsDigitalTwinState(params: {
  profile: EmsEcuSyncProfile;
  powerSupply: PowerSupplyState;
  nodeVoltages: Record<string, number>;
  wireCurrentsMa: Record<string, number>;
  components: BenchComponent[];
  faults: InjectedFault[];
  wires: WireConnection[];
  rpm: number;
  isRpmRunning: boolean;
  ckpSignalLost: boolean;
  supplyCurrentDrawAmps?: number;
  isSupplyCurrentTripped?: boolean;
}): EmsDigitalTwinState {
  const {
    profile,
    powerSupply,
    nodeVoltages,
    wireCurrentsMa,
    components,
    faults,
    wires,
    rpm,
    isRpmRunning,
    ckpSignalLost,
    supplyCurrentDrawAmps = 0,
    isSupplyCurrentTripped = false,
  } = params;

  const faultByPin = new Map<string, InjectedFault>();
  for (const f of faults) {
    if (f.faultType !== 'NONE') {
      faultByPin.set(f.pinId, f);
    }
  }

  const isPowerActive = Boolean(powerSupply.isOutputEnabled) && !isSupplyCurrentTripped;
  const kl30V = isPowerActive ? Number(nodeVoltages['ecu-pin-3'] ?? powerSupply.voltageSetting) : 0;
  const kl15V = isPowerActive ? Number(nodeVoltages['ecu-pin-4'] ?? kl30V) : 0;
  const vrefV = isPowerActive ? Number(nodeVoltages['ecu-pin-5'] ?? 0) : 0;

  const isIgnitionOn = isPowerActive && kl15V >= 6.5;

  const kl30Fault = faultByPin.get('ecu-pin-3');
  const kl15Fault = faultByPin.get('ecu-pin-4');
  const injFault = faultByPin.get('ecu-pin-10');
  const ignFault = faultByPin.get('ecu-pin-11');
  const mRelayFault = faultByPin.get('ecu-pin-12');
  const fpRelayFault = faultByPin.get('ecu-pin-16');
  const sgndFault = faultByPin.get('ecu-pin-6');
  const gnd1Fault = faultByPin.get('ecu-pin-1');
  const gnd2Fault = faultByPin.get('ecu-pin-2');

  const isInjWireCut = wires.some(
    (w) => (w.sourcePinId === 'ecu-pin-10' || w.targetPinId === 'inj-ctrl') && w.isCut
  );

  const relayComp = components.find((c) => c.id === 'comp-relay');
  const relayCompLatched = relayComp?.state?.isLatched !== false;
  const mainRelayFaulted = Boolean(
    mRelayFault &&
      (mRelayFault.faultType === 'OPEN_CIRCUIT' || mRelayFault.faultType === 'SHORT_TO_VBAT')
  );
  const mainRelayLatched =
    isIgnitionOn && relayCompLatched && !mainRelayFaulted && kl30Fault?.faultType !== 'OPEN_CIRCUIT';

  const switchedRailVoltageV = mainRelayLatched ? Math.max(0, kl30V - 0.12) : 0;

  const mainRelay: EmsRelayTelemetry = {
    id: 'main-relay',
    label: 'Main Relay (12V SW)',
    pin30V: Number(nodeVoltages['relay-30'] ?? kl30V),
    pin86V: Number(nodeVoltages['relay-86'] ?? kl15V),
    pin85V: Number(nodeVoltages['relay-85'] ?? (mainRelayLatched ? 0.15 : kl15V)),
    pin87V: Number(nodeVoltages['relay-87'] ?? switchedRailVoltageV),
    coilCurrentMa: mainRelayLatched ? Math.round((kl15V / 85) * 1000) : 0,
    isLatched: mainRelayLatched,
    isFaulted: mainRelayFaulted,
  };

  const fpRelayFaulted = Boolean(
    fpRelayFault &&
      (fpRelayFault.faultType === 'OPEN_CIRCUIT' || fpRelayFault.faultType === 'SHORT_TO_VBAT')
  );
  const isEngineRunning =
    isIgnitionOn && mainRelayLatched && isRpmRunning && !ckpSignalLost && rpm > 120;
  // Fuel pump energizes when Main Relay is latched and ECU triggers FP_RELAY (key-on prime or running)
  const fpRelayLatched = mainRelayLatched && !fpRelayFaulted && isIgnitionOn;
  const fpOutV = fpRelayLatched ? Math.max(0, switchedRailVoltageV - 0.18) : 0;

  const fuelPumpRelay: EmsRelayTelemetry = {
    id: 'fuel-pump-relay',
    label: 'Fuel Pump Relay',
    pin30V: kl30V,
    pin86V: switchedRailVoltageV,
    pin85V: Number(nodeVoltages['ecu-pin-16'] ?? (fpRelayLatched ? 0.18 : switchedRailVoltageV)),
    pin87V: fpOutV,
    coilCurrentMa: fpRelayLatched ? Math.round((switchedRailVoltageV / 85) * 1000) : 0,
    isLatched: fpRelayLatched,
    isFaulted: fpRelayFaulted,
  };

  const injShort = injFault?.faultType === 'SHORT_TO_GND';
  const ignShort = ignFault?.faultType === 'SHORT_TO_GND';
  const fpShort = fpRelayFault?.faultType === 'SHORT_TO_GND';
  const ecuShort = kl30Fault?.faultType === 'SHORT_TO_GND' || kl15Fault?.faultType === 'SHORT_TO_GND';

  const baseInjDuty = isEngineRunning
    ? Math.min(82, Math.max(8, 10 + (rpm / 6000) * 58))
    : 0;
  const injBranchAmps =
    mainRelayLatched && !injShort && !isInjWireCut && isEngineRunning
      ? Number(((baseInjDuty / 100) * 4 * (switchedRailVoltageV / 12.5)).toFixed(2))
      : 0;
  const ignBranchAmps =
    mainRelayLatched && !ignShort && isEngineRunning
      ? Number((0.8 + (rpm / 6000) * 3.4).toFixed(2))
      : 0;
  const pumpCurrentAmps =
    fpRelayLatched && !fpShort
      ? Number((isEngineRunning ? 3.8 + (rpm / 6000) * 1.4 : 2.9).toFixed(2))
      : 0;
  const ecuLogicAmps = isPowerActive && !ecuShort ? 0.45 : 0;

  const fuses: EmsFuseTelemetry[] = [
    {
      id: 'fuse-main-50a',
      label: '50A MAIN',
      ratingAmps: 50,
      circuitName: 'Primary Battery Bus -> Main Relay & PDU',
      colorHex: 0xef4444,
      mappedPinId: 'ecu-pin-3',
      voltageInV: powerSupply.isOutputEnabled ? powerSupply.voltageSetting : 0,
      voltageOutV: isSupplyCurrentTripped ? 0 : kl30V,
      currentAmps: Number((injBranchAmps + ignBranchAmps + pumpCurrentAmps + ecuLogicAmps).toFixed(2)),
      isEnergized: isPowerActive && !isSupplyCurrentTripped,
      isBlown: isSupplyCurrentTripped,
    },
    {
      id: 'fuse-inj-20a',
      label: '20A INJ',
      ratingAmps: 20,
      circuitName: 'Fuel Rail & Injectors 1–4 (+12V SW)',
      colorHex: 0xfacc15,
      mappedPinId: 'ecu-pin-10',
      voltageInV: switchedRailVoltageV,
      voltageOutV: injShort ? 0 : switchedRailVoltageV,
      currentAmps: injBranchAmps,
      isEnergized: mainRelayLatched && !injShort,
      isBlown: Boolean(injShort),
    },
    {
      id: 'fuse-fp-20a',
      label: '20A FUEL',
      ratingAmps: 20,
      circuitName: 'Fuel Pump Relay & Submerged Pump Module',
      colorHex: 0xeab308,
      mappedPinId: 'ecu-pin-16',
      voltageInV: kl30V,
      voltageOutV: fpShort ? 0 : fpOutV,
      currentAmps: pumpCurrentAmps,
      isEnergized: fpRelayLatched && !fpShort,
      isBlown: Boolean(fpShort),
    },
    {
      id: 'fuse-ign-15a',
      label: '15A COIL',
      ratingAmps: 15,
      circuitName:
        profile.powertrainMode === 'DIESEL_CRDI'
          ? 'Glow Plug / High-Pressure Rail Stage'
          : 'Ignition Coils 1–4 (Coil-on-Plug)',
      colorHex: 0x3b82f6,
      mappedPinId: 'ecu-pin-11',
      voltageInV: switchedRailVoltageV,
      voltageOutV: ignShort ? 0 : switchedRailVoltageV,
      currentAmps: ignBranchAmps,
      isEnergized: mainRelayLatched && !ignShort,
      isBlown: Boolean(ignShort),
    },
    {
      id: 'fuse-ecu-10a',
      label: '10A ECU',
      ratingAmps: 10,
      circuitName: 'ECU Constant BATT (KL30) & Logic Rail',
      colorHex: 0xf97316,
      mappedPinId: 'ecu-pin-4',
      voltageInV: kl30V,
      voltageOutV: ecuShort ? 0 : kl15V,
      currentAmps: ecuLogicAmps,
      isEnergized: isIgnitionOn && !ecuShort,
      isBlown: Boolean(ecuShort),
    },
  ];

  const firingOrderSlots: Record<1 | 2 | 3 | 4, 0 | 1 | 2 | 3> = {
    1: 0,
    3: 1,
    4: 2,
    2: 3,
  };

  const cylinders: EmsCylinderTelemetry[] = ([1, 2, 3, 4] as const).map((cyl) => {
    const isInjFaulted =
      cyl === 1
        ? Boolean(injFault || isInjWireCut)
        : Boolean(injShort || !mainRelayLatched);
    const isCoilFaulted =
      cyl === 1 ? Boolean(ignFault) : Boolean(ignShort || !mainRelayLatched);
    return {
      cylinder: cyl,
      firingSlot: firingOrderSlots[cyl],
      injectorVoltageV: !isInjFaulted && mainRelayLatched ? switchedRailVoltageV : 0,
      coilVoltageV: !isCoilFaulted && mainRelayLatched ? switchedRailVoltageV : 0,
      injectorDutyPercent: !isInjFaulted && isEngineRunning ? Math.round(baseInjDuty) : 0,
      isInjectorFaulted: isInjFaulted,
      isCoilFaulted: isCoilFaulted,
    };
  });

  const sgndVoltageV = Number(nodeVoltages['ecu-pin-6'] ?? 0);
  const g1ChassisVoltageV = Number(nodeVoltages['chassis-gnd'] ?? 0);
  const g2EngineVoltageV = Math.max(
    Number(nodeVoltages['ecu-pin-1'] ?? 0),
    Number(nodeVoltages['ecu-pin-2'] ?? 0)
  );
  const groundOffsetMv = Math.round(
    Math.max(Math.abs(sgndVoltageV - g1ChassisVoltageV), Math.abs(g2EngineVoltageV - g1ChassisVoltageV)) *
      1000
  );
  const hasGroundFault = Boolean(sgndFault || gnd1Fault || gnd2Fault || groundOffsetMv > 180);

  const railPressureBar = !fpRelayLatched || fpShort
    ? 0
    : profile.powertrainMode === 'DIESEL_CRDI'
      ? Math.round(isEngineRunning ? 320 + (rpm / 4500) * 1280 : 45)
      : Number((isEngineRunning ? 3.6 + (rpm / 6500) * 0.6 : 3.2).toFixed(1));

  const tpsComp = components.find((c) => c.id === 'comp-tps');
  const ectComp = components.find((c) => c.id === 'comp-ect');
  const wireLoadAmps =
    Object.values(wireCurrentsMa).reduce((sum, ma) => sum + Math.abs(ma), 0) / 1000;
  const totalCurrentAmps =
    supplyCurrentDrawAmps > 0.01
      ? Number(supplyCurrentDrawAmps.toFixed(2))
      : Number(Math.max(wireLoadAmps, injBranchAmps + ignBranchAmps + pumpCurrentAmps + ecuLogicAmps).toFixed(2));

  return {
    isPowerActive,
    isIgnitionOn,
    isSupplyTripped: isSupplyCurrentTripped,
    batteryVoltageV: Number(kl30V.toFixed(2)),
    switchedRailVoltageV: Number(switchedRailVoltageV.toFixed(2)),
    vrefVoltageV: Number(vrefV.toFixed(2)),
    totalCurrentAmps,
    rpm: isEngineRunning ? rpm : 0,
    isEngineRunning,
    ckpSignalLost,
    tpsPercent: Number(tpsComp?.state?.throttleAnglePercent ?? 20),
    ectTempC: Number(ectComp?.state?.tempCelsius ?? 85),
    fuses,
    mainRelay,
    fuelPumpRelay,
    cylinders,
    grounds: {
      sgndVoltageV: Number(sgndVoltageV.toFixed(3)),
      g1ChassisVoltageV: Number(g1ChassisVoltageV.toFixed(3)),
      g2EngineVoltageV: Number(g2EngineVoltageV.toFixed(3)),
      groundOffsetMv,
      hasGroundFault,
    },
    fuelSystem: {
      isPumpRunning: fpRelayLatched && !fpShort,
      pumpVoltageV: Number(fpOutV.toFixed(2)),
      pumpCurrentAmps,
      railPressureBar,
      fuelLevelPercent: 68,
      isFaulted: Boolean(fpRelayFaulted || fpShort),
    },
  };
}

/**
 * Deterministic 4-stroke 1-3-4-2 sequential firing sequencer for the 3D EMS rig.
 * Visually scales cycle frequency so human eyes can clearly observe 1-3-4-2 sequencing
 * at idle (850 RPM) through high-RPM (6000 RPM) without aliasing.
 */
export function evaluateSequentialFiringPhase(params: {
  elapsedSec: number;
  rpm: number;
  isEngineRunning: boolean;
  powertrainMode: EmsPowertrainMode;
  cylinders: EmsCylinderTelemetry[];
}): CylinderPhaseOutput[] {
  const { elapsedSec, rpm, isEngineRunning, powertrainMode, cylinders } = params;

  if (!isEngineRunning || rpm <= 0) {
    return cylinders.map((c) => ({
      cylinder: c.cylinder,
      injectorPulse: 0,
      coilDwell: 0,
      sparkArc: 0,
    }));
  }

  // Visually clear cycle rate: 1.0 Hz at 800 RPM up to 4.2 Hz at 6000 RPM
  const cycleHz = Math.min(4.2, Math.max(0.85, 0.65 + (rpm / 6000) * 3.55));
  const cyclePhase = (elapsedSec * cycleHz) % 1;

  return cylinders.map((c) => {
    const slotStart = c.firingSlot * 0.25;
    let local = cyclePhase - slotStart;
    if (local < 0) local += 1;

    // Injector spray occurs during the first 20% of the cylinder's 0.25 slot window
    let injectorPulse = 0;
    if (!c.isInjectorFaulted && local >= 0 && local < 0.16) {
      injectorPulse = Math.sin((local / 0.16) * Math.PI);
    }

    // Ignition coil dwell precedes spark arc; in Diesel CRDi, glow/rail stays steady low
    let coilDwell = 0;
    let sparkArc = 0;
    if (!c.isCoilFaulted) {
      if (powertrainMode === 'DIESEL_CRDI') {
        coilDwell = local < 0.14 ? 0.55 : 0.12;
        sparkArc = 0;
      } else {
        if (local >= 0.08 && local < 0.19) {
          coilDwell = (local - 0.08) / 0.11;
        }
        if (local >= 0.18 && local < 0.235) {
          sparkArc = 1 - (local - 0.18) / 0.055;
        }
      }
    }

    return {
      cylinder: c.cylinder,
      injectorPulse,
      coilDwell,
      sparkArc,
    };
  });
}
