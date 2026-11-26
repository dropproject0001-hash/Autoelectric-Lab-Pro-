/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { EcuPin } from '../../types/ecu';
import type { EmsCircuitLayer, EmsEcuSyncProfile } from './emsDigitalTwinSync';

export type EfiCircuitGroupKey =
  | 'CONSTANT_POWER_KL30'
  | 'SWITCHED_IGNITION_KL15'
  | 'CHASSIS_ECU_GROUND'
  | 'SENSOR_VREF_5V'
  | 'ACTUATOR_DRIVERS'
  | 'CAN_BUS_COMMS';

export type EfiTrunkCorridor =
  | 'POWER_TRUNK'
  | 'GROUND_BUS'
  | 'ACTUATOR_SPINE'
  | 'SENSOR_CAN_SPINE';

export interface EfiColorStandardSpec {
  group: EfiCircuitGroupKey;
  label: string;
  standardColorName: string;
  colorCodeShort: string;
  primaryHex: number;
  secondaryHex: number;
  cssHex: string;
  gaugeMm2: string;
  corridor: EfiTrunkCorridor;
  emiRule: string;
}

/**
 * Functional Color-Coding & EMI Separation Standard (CHK-01 & CHK-02).
 * Matches the AutoElectric Lab PRO EFI Wiring Harness Specification.
 */
export const EFI_FUNCTIONAL_COLOR_STANDARD: Readonly<
  Record<EfiCircuitGroupKey, EfiColorStandardSpec>
> = {
  CONSTANT_POWER_KL30: {
    group: 'CONSTANT_POWER_KL30',
    label: 'Constant Power (KL30)',
    standardColorName: 'Red',
    colorCodeShort: 'RED',
    primaryHex: 0xef4444,
    secondaryHex: 0xdc2626,
    cssHex: '#ef4444',
    gaugeMm2: '2.5mm²',
    corridor: 'POWER_TRUNK',
    emiRule: 'High-current power trunk; isolated from 5V sensor & CAN looms',
  },
  SWITCHED_IGNITION_KL15: {
    group: 'SWITCHED_IGNITION_KL15',
    label: 'Switched Ignition (KL15)',
    standardColorName: 'Yellow / Orange',
    colorCodeShort: 'YEL/ORG',
    primaryHex: 0xf59e0b,
    secondaryHex: 0xf97316,
    cssHex: '#f59e0b',
    gaugeMm2: '1.5mm²',
    corridor: 'POWER_TRUNK',
    emiRule: 'Switched power trunk; fused branch distribution via Main Relay',
  },
  CHASSIS_ECU_GROUND: {
    group: 'CHASSIS_ECU_GROUND',
    label: 'Chassis & ECU Ground',
    standardColorName: 'Black / Brown',
    colorCodeShort: 'BLK/BRN',
    primaryHex: 0x1f2937,
    secondaryHex: 0x78716c,
    cssHex: '#64748b',
    gaugeMm2: '2.5mm²',
    corridor: 'GROUND_BUS',
    emiRule: 'Star-ground bus; isolated SGND return separated from high-current PGND',
  },
  SENSOR_VREF_5V: {
    group: 'SENSOR_VREF_5V',
    label: '5V Sensor Reference',
    standardColorName: 'Gray / Blue',
    colorCodeShort: 'BLU/GRY',
    primaryHex: 0x38bdf8,
    secondaryHex: 0x94a3b8,
    cssHex: '#38bdf8',
    gaugeMm2: '0.5mm²',
    corridor: 'SENSOR_CAN_SPINE',
    emiRule: 'Low-noise shielded sensor loom physically separated from power/coil drivers',
  },
  ACTUATOR_DRIVERS: {
    group: 'ACTUATOR_DRIVERS',
    label: 'Actuator Drivers',
    standardColorName: 'Green / Violet',
    colorCodeShort: 'GRN/VIO',
    primaryHex: 0x22c55e,
    secondaryHex: 0xa855f7,
    cssHex: '#22c55e',
    gaugeMm2: '1.0mm²',
    corridor: 'ACTUATOR_SPINE',
    emiRule: 'High-noise PWM injector & ignition coil driver loom; routed away from CKP/CAN',
  },
  CAN_BUS_COMMS: {
    group: 'CAN_BUS_COMMS',
    label: 'CAN Bus / Comms',
    standardColorName: 'Twisted Pair (Tan/Wht)',
    colorCodeShort: 'TAN/WHT',
    primaryHex: 0xd6c3a5,
    secondaryHex: 0xf1f5f9,
    cssHex: '#d6c3a5',
    gaugeMm2: '0.35mm²',
    corridor: 'SENSOR_CAN_SPINE',
    emiRule: 'Twisted-pair differential routing with 120-ohm termination',
  },
};

export interface StandardConnectionTag {
  connectorId: string;
  pinCode: string;
  signalName: string;
  colorGauge: string;
  circuitGroup: EfiCircuitGroupKey;
  corridor: EfiTrunkCorridor;
  formattedTag: string;
}

export function classifyPinCircuitGroup(pinId: string, label?: string): EfiCircuitGroupKey {
  const key = `${pinId} ${label ?? ''}`.toLowerCase();
  if (
    /\b(can|can_h|can_l|can-term|k-line|ecu-pin-13|ecu-pin-14)\b/.test(key)
  ) {
    return 'CAN_BUS_COMMS';
  }
  if (
    /\b(kl30|batt|vbat|ecu-pin-3|relay-30|fp-30|fuse-main|fuse-ecu)\b/.test(key) ||
    key.includes('ems-batt-pos')
  ) {
    return 'CONSTANT_POWER_KL30';
  }
  if (
    /\b(kl15|ign_sw|ecu-pin-4|relay-86|relay-87|fp-86|fp-87|m_relay|ecu-pin-12|ecu-pin-16)\b/.test(key) ||
    key.includes('fuel-pump-pos')
  ) {
    return 'SWITCHED_IGNITION_KL15';
  }
  if (
    /\b(inj|inj_1|inj_2|inj_3|inj_4|coil|ign_1|ecu-pin-10|ecu-pin-11|relay-85|fp-85)\b/.test(key) ||
    key.includes('ems-inj-') ||
    key.includes('ems-coil-')
  ) {
    return 'ACTUATOR_DRIVERS';
  }
  if (
    /\b(gnd|sgnd|pgnd|kl31|ecu-pin-1|ecu-pin-2|ecu-pin-6)\b/.test(key) ||
    key.includes('-gnd') ||
    key.includes('gnd-') ||
    key.includes('batt-neg')
  ) {
    return 'CHASSIS_ECU_GROUND';
  }
  return 'SENSOR_VREF_5V';
}

function resolveColorGaugeForPin(
  pinId: string,
  group: EfiCircuitGroupKey
): string {
  const lower = pinId.toLowerCase();
  switch (group) {
    case 'CONSTANT_POWER_KL30':
      return 'RED 2.5mm²';
    case 'SWITCHED_IGNITION_KL15':
      return lower.includes('relay') || lower.includes('fp')
        ? 'ORG 1.5mm²'
        : 'YEL 1.5mm²';
    case 'CHASSIS_ECU_GROUND':
      return lower.includes('sgnd') || lower.includes('ecu-pin-6') || lower.includes('tps-gnd')
        ? 'BRN 0.75mm²'
        : 'BLK 2.5mm²';
    case 'SENSOR_VREF_5V':
      return lower.includes('vref') || lower.includes('ecu-pin-5') || lower.includes('vcc')
        ? 'BLU 0.5mm²'
        : 'GRY 0.5mm²';
    case 'ACTUATOR_DRIVERS':
      return lower.includes('coil') || lower.includes('ecu-pin-11')
        ? 'VIO 1.5mm²'
        : 'GRN 1.0mm²';
    case 'CAN_BUS_COMMS':
      return lower.includes('ecu-pin-14') || lower.includes('can-l') || lower.includes('can_l')
        ? 'WHT 0.35mm²'
        : 'TAN 0.35mm²';
  }
}

function extractOemPinToken(
  pinId: string,
  emsProfile?: EmsEcuSyncProfile | null
): string | null {
  if (!emsProfile || emsProfile.isDefaultUniversalEfi) return null;
  const m = emsProfile.oemPinMapping;
  const map: Record<string, string | undefined> = {
    'ecu-pin-1': m.gnd,
    'ecu-pin-2': m.gnd,
    'ecu-pin-3': m.kl30,
    'ecu-pin-4': m.kl15,
    'ecu-pin-5': m.vref,
    'ecu-pin-6': m.sgnd,
    'ecu-pin-7': m.tpsSig,
    'ecu-pin-10': m.inj1,
    'ecu-pin-11': m.coil1,
    'ecu-pin-12': m.mainRelayCtrl,
    'ecu-pin-13': m.canH,
    'ecu-pin-14': m.canL,
    'ecu-pin-16': m.fuelPumpRelayCtrl,
    'ems-inj-1': m.inj1,
    'ems-inj-2': m.inj2,
    'ems-inj-3': m.inj3,
    'ems-inj-4': m.inj4,
    'ems-coil-1': m.coil1,
    'ems-coil-2': m.coil2,
    'ems-coil-3': m.coil3,
    'ems-coil-4': m.coil4,
  };
  const raw = map[pinId];
  if (!raw) return null;
  // Normalize e.g. "B31 / A1" or "A24-14" -> first clean OEM terminal code
  const first = raw.split(/[\/,]/)[0]?.trim() || raw.trim();
  return first.replace(/\s+/g, '');
}

/**
 * Generates the standardized CHK-02 connection point label:
 *   [CONN-ID]:[PIN] | [SIGNAL_NAME] | [COLOR/GAUGE]
 * Automatically syncs to the loaded vehicle's OEM connector/pinout when active.
 */
export function formatStandardConnectionTag(
  pinId: string,
  pins: EcuPin[],
  emsProfile?: EmsEcuSyncProfile | null
): StandardConnectionTag {
  const ecuPin = pins.find((p) => p.id === pinId);
  const group = classifyPinCircuitGroup(pinId, ecuPin?.label);
  const spec = EFI_FUNCTIONAL_COLOR_STANDARD[group];
  const colorGauge = resolveColorGaugeForPin(pinId, group);
  const oemPin = extractOemPinToken(pinId, emsProfile);

  let connectorId = 'ECU-A';
  let pinCode = ecuPin ? String(ecuPin.pinNumber).padStart(2, '0') : '01';
  let signalName = ecuPin?.label || pinId.toUpperCase();

  if (ecuPin) {
    if (oemPin) {
      if (oemPin.includes(':') || oemPin.includes('-')) {
        const parts = oemPin.split(/[:\-]/);
        connectorId = parts[0] || 'ECU-A';
        pinCode = parts.slice(1).join('-') || pinCode;
      } else {
        connectorId = emsProfile?.modelCode.split(/[\s(]/)[0] || 'ECU-A';
        pinCode = oemPin;
      }
    } else {
      connectorId = ecuPin.pinNumber <= 8 ? 'ECU-A' : 'ECU-B';
      pinCode = String(ecuPin.pinNumber).padStart(2, '0');
    }
  } else if (pinId.startsWith('ems-inj-')) {
    const c = pinId.slice(-1);
    connectorId = `INJ-${c}`;
    pinCode = oemPin || '02';
    signalName = `INJ_${c}_CTRL`;
  } else if (pinId.startsWith('ems-coil-')) {
    const c = pinId.slice(-1);
    connectorId = `COP-${c}`;
    pinCode = oemPin || '03';
    signalName = `IGN_COIL_${c}`;
  } else if (pinId.startsWith('relay-')) {
    connectorId = 'RLY-MAIN';
    pinCode = pinId.replace('relay-', '');
    signalName = `MAIN_RLY_${pinCode}`;
  } else if (pinId.startsWith('ems-fp-')) {
    connectorId = 'RLY-FP';
    pinCode = pinId.replace('ems-fp-', '');
    signalName = `FP_RLY_${pinCode}`;
  } else if (pinId.startsWith('ems-fuel-pump-')) {
    connectorId = 'FP-MOD';
    pinCode = pinId.endsWith('pos') ? '01' : '02';
    signalName = pinId.endsWith('pos') ? 'FUEL_PUMP_12V' : 'FUEL_PUMP_GND';
  } else if (pinId === 'ems-batt-pos' || pinId === 'ems-batt-neg') {
    connectorId = 'BATT';
    pinCode = pinId.endsWith('pos') ? 'POS' : 'NEG';
    signalName = pinId.endsWith('pos') ? 'KL30_BATT_12V' : 'KL31_BATT_GND';
  } else if (pinId === 'ems-sgnd-bus') {
    connectorId = 'BUS-SGND';
    pinCode = 'S1';
    signalName = 'SENSOR_GND_BUS';
  } else if (pinId === 'chassis-gnd' || pinId === 'ems-gnd-g2') {
    connectorId = pinId === 'chassis-gnd' ? 'GND-G1' : 'GND-G2';
    pinCode = 'ST1';
    signalName = pinId === 'chassis-gnd' ? 'CHASSIS_GND_G1' : 'ENGINE_GND_G2';
  } else if (pinId.startsWith('tps-')) {
    connectorId = 'CONN-TPS';
    pinCode = pinId === 'tps-vcc' ? '01' : pinId === 'tps-sig' ? '02' : '03';
    signalName = pinId.toUpperCase().replace('-', '_');
  } else if (pinId.startsWith('map-')) {
    connectorId = 'CONN-MAP';
    pinCode = pinId === 'map-vcc' ? '01' : pinId === 'map-sig' ? '02' : '03';
    signalName = pinId.toUpperCase().replace('-', '_');
  } else if (pinId.startsWith('can-term-')) {
    connectorId = 'OBD-CAN';
    pinCode = pinId.endsWith('h') ? '06' : '14';
    signalName = pinId.endsWith('h') ? 'CAN_HIGH' : 'CAN_LOW';
  }

  return {
    connectorId,
    pinCode,
    signalName,
    colorGauge,
    circuitGroup: group,
    corridor: spec.corridor,
    formattedTag: `${connectorId}:${pinCode} | ${signalName} | ${colorGauge}`,
  };
}

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

/**
 * Physical EMI Corridor Z/Y Trunk Coordinates on the 3D ESD Bench Mat.
 * Strictly separates High-Current Power & Actuator trunks from Low-Voltage Sensor & CAN looms.
 */
export const EFI_TRUNK_CORRIDORS: Readonly<
  Record<EfiTrunkCorridor, { spineZ: number; spineY: number; label: string }>
> = {
  POWER_TRUNK: {
    spineZ: 3.35,
    spineY: 0.24,
    label: 'Main +12V Power Trunk (KL30/KL15)',
  },
  GROUND_BUS: {
    spineZ: 4.35,
    spineY: 0.16,
    label: 'Star-Topology Ground Bus (PGND / SGND)',
  },
  ACTUATOR_SPINE: {
    spineZ: -2.18,
    spineY: 0.26,
    label: 'High-Noise Actuator Driver Spine (INJ / COIL)',
  },
  SENSOR_CAN_SPINE: {
    spineZ: 0.25,
    spineY: 0.19,
    label: 'Shielded Low-Noise Sensor & Twisted CAN Spine',
  },
};

/**
 * Generates clean 90-degree orthogonal chassis-trunk waypoints with rounded corner
 * transitions, eliminating diagonal point-to-point jumpers while preserving EMI separation.
 */
export function buildOrthogonalTrunkWaypoints(
  start: Vec3Tuple,
  end: Vec3Tuple,
  corridor: EfiTrunkCorridor,
  laneOffset = 0,
  bypassX?: number
): Vec3Tuple[] {
  const spec = EFI_TRUNK_CORRIDORS[corridor];
  const trunkZ = Number((spec.spineZ + laneOffset * 0.09).toFixed(3));
  const trunkY = Number((spec.spineY + Math.abs(laneOffset % 2) * 0.035).toFixed(3));

  const points: Vec3Tuple[] = [
    { x: start.x, y: start.y, z: start.z },
    // Clean orthogonal drop/breakout from source terminal onto bench trunk elevation
    { x: start.x, y: Math.max(trunkY + 0.06, Math.min(start.y, trunkY + 0.22)), z: start.z },
  ];

  if (typeof bypassX === 'number') {
    // Route along a clean orthogonal side-bus rail (e.g., around the ECU mounting plate)
    const railX = Number((bypassX + laneOffset * 0.08).toFixed(3));
    points.push({ x: start.x, y: trunkY, z: start.z + (trunkZ > start.z ? 0.35 : -0.35) });
    points.push({ x: railX, y: trunkY, z: start.z + (trunkZ > start.z ? 0.35 : -0.35) });
    points.push({ x: railX, y: trunkY, z: trunkZ });
    points.push({ x: end.x, y: trunkY, z: trunkZ });
  } else {
    // Pure orthogonal breakout: Source -> Trunk Z at Source X -> Trunk Z at Dest X -> Dest
    points.push({ x: start.x, y: trunkY, z: trunkZ });
    if (Math.abs(end.x - start.x) > 0.18) {
      points.push({ x: end.x, y: trunkY, z: trunkZ });
    }
  }

  points.push({
    x: end.x,
    y: Math.max(trunkY + 0.06, Math.min(end.y, trunkY + 0.22)),
    z: end.z,
  });
  points.push({ x: end.x, y: end.y, z: end.z });

  return points;
}

export type BenchVoiceSimulationAction =
  | { type: 'SHOW_ENGINE_BLOCK'; enabled: boolean }
  | { type: 'TOGGLE_FAULT_MESH'; enabled: boolean }
  | { type: 'SET_CAMERA_PRESET'; preset: 'OVERVIEW' | 'ECU_EXPLODED' | 'POWER_RELAYS' | 'FUEL_IGNITION' | 'ENGINE_BAY' }
  | { type: 'SET_EXPLODE'; exploded: boolean }
  | { type: 'SET_IGNITION'; enabled: boolean }
  | { type: 'SET_AUDIO'; enabled: boolean }
  | { type: 'SET_SYNC_MODE'; mode: 'LIVE_DATA' | 'MANUAL_REVIEW' }
  | { type: 'SET_CIRCUIT_LAYER'; layer: EmsCircuitLayer }
  | { type: 'START_GUIDED_TOUR' };

export interface ParsedBenchVoiceAction {
  action: BenchVoiceSimulationAction;
  spokenReplyEN: string;
  spokenReplyTL: string;
}

/**
 * Bilingual (English / Tagalog) hands-free command parser for direct 3D EMS Twin,
 * camera focus, audio synthesizer, ignition, and guided tour interaction.
 */
export function parseThreeDVoiceCommand(transcript: string): ParsedBenchVoiceAction | null {
  const q = transcript.trim().toLowerCase();
  if (!q) return null;

  if (/\b(guided tour|start tour|walk me through|tour the bench|turuan mo ako|guide me|ituro ang bench)\b/i.test(q)) {
    return {
      action: { type: 'START_GUIDED_TOUR' },
      spokenReplyEN:
        'Starting the interactive EFI bench tour. First, notice the clean chassis-trunk harness separating red high-current KL30 power and green-violet actuator lines from the shielded blue sensor and twisted CAN bus. Turn ignition on to hear the fuel pump prime and see the 1-3-4-2 firing sequence.',
      spokenReplyTL:
        'Sisimulan natin ang interactive EFI bench tour. Una, pansinin ang malinis na chassis-trunk harness na naghihiwalay sa red high-current KL30 power at actuator lines mula sa shielded sensor at CAN bus. I-on ang ignition para marinig ang fuel pump prime at makita ang 1-3-4-2 firing order.',
    };
  }

  if (/\b(show|enable|open|ipakita|buksan|display).*(engine block|4-cyl|4 cyl|makina|engine)\b/i.test(q)) {
    return {
      action: { type: 'SHOW_ENGINE_BLOCK', enabled: true },
      spokenReplyEN: '4-cylinder DOHC engine block enabled with live wire-mesh diagnostic overlay.',
      spokenReplyTL: 'Ipinapakita na ang 4-cylinder DOHC engine block kasama ang live fault wire-mesh overlay.',
    };
  }

  if (/\b(hide|remove|close|itago|isara).*(engine block|4-cyl|4 cyl|makina)\b/i.test(q)) {
    return {
      action: { type: 'SHOW_ENGINE_BLOCK', enabled: false },
      spokenReplyEN: 'Engine block hidden. Returning to standalone EFI bench assembly view.',
      spokenReplyTL: 'Naitago na ang engine block. Balik sa standalone EFI bench assembly view.',
    };
  }

  if (/\b(show|enable|turn on|ipakita|buksan).*(fault mesh|wire mesh|fault overlay)\b/i.test(q)) {
    return {
      action: { type: 'TOGGLE_FAULT_MESH', enabled: true },
      spokenReplyEN: 'Engine block wire-mesh electrical fault overlay activated.',
      spokenReplyTL: 'Naka-on na ang 3D engine block fault wire-mesh overlay.',
    };
  }

  if (/\b(hide|disable|turn off|itago|patayin).*(fault mesh|wire mesh|fault overlay)\b/i.test(q)) {
    return {
      action: { type: 'TOGGLE_FAULT_MESH', enabled: false },
      spokenReplyEN: 'Fault wire-mesh overlay hidden.',
      spokenReplyTL: 'Naka-off na ang fault wire-mesh overlay.',
    };
  }

  if (/\b(explode|disassemble|open ecu|buksan ang ecu|exploded)\b/i.test(q)) {
    return {
      action: { type: 'SET_EXPLODE', exploded: true },
      spokenReplyEN: 'Exploding the ECU aluminum housing so you can inspect the internal PCB and MOSFET drivers.',
      spokenReplyTL: 'Binubuksan ang ECU exploded view para makita ang internal PCB at MOSFET drivers.',
    };
  }

  if (/\b(assemble|close ecu|collapse ecu|isara ang ecu)\b/i.test(q)) {
    return {
      action: { type: 'SET_EXPLODE', exploded: false },
      spokenReplyEN: 'Reassembling the ECU housing.',
      spokenReplyTL: 'Isinasara na ang ECU housing.',
    };
  }

  if (/\b(focus|zoom|show|view|tingnan).*(power|relay|fuse|battery|pdu)\b/i.test(q)) {
    return {
      action: { type: 'SET_CAMERA_PRESET', preset: 'POWER_RELAYS' },
      spokenReplyEN: 'Focusing camera on the Power Distribution Unit, 12-volt battery, blade fuses, and ISO relays.',
      spokenReplyTL: 'Naka-focus na ang camera sa Power Distribution Unit, battery, fuses, at relays.',
    };
  }

  if (/\b(focus|zoom|show|view|tingnan).*(fuel|injector|coil|ignition|spark)\b/i.test(q)) {
    return {
      action: { type: 'SET_CAMERA_PRESET', preset: 'FUEL_IGNITION' },
      spokenReplyEN: 'Focusing camera on the 4-cylinder fuel rail, sequential injectors, and coil-on-plug ignition bank.',
      spokenReplyTL: 'Naka-focus na ang camera sa 4-cylinder fuel rail, injectors, at ignition coils.',
    };
  }

  if (/\b(focus|zoom|show|view|reset).*(overview|full bench|buong bench)\b/i.test(q)) {
    return {
      action: { type: 'SET_CAMERA_PRESET', preset: 'OVERVIEW' },
      spokenReplyEN: 'Resetting 3D camera to the full EFI bench overview.',
      spokenReplyTL: 'Ibinalik na ang 3D camera sa full EFI bench overview.',
    };
  }

  if (
    /\b(turn on|enable|start|buksan|i-on).*(ignition|power|psu|engine|kl15)\b/i.test(q) ||
    /\b(turn\s+)?(ignition|power|psu|kl15)\s+on\b/i.test(q)
  ) {
    return {
      action: { type: 'SET_IGNITION', enabled: true },
      spokenReplyEN: 'Energizing bench supply and KL15 ignition. Listen for the main relay latch and fuel pump prime.',
      spokenReplyTL: 'Naka-on na ang bench power at KL15 ignition. Pakinggan ang main relay click at fuel pump prime.',
    };
  }

  if (
    /\b(turn off|disable|stop|patayin|i-off).*(ignition|power|psu|engine|kl15)\b/i.test(q) ||
    /\b(turn\s+)?(ignition|power|psu|kl15)\s+off\b/i.test(q)
  ) {
    return {
      action: { type: 'SET_IGNITION', enabled: false },
      spokenReplyEN: 'Bench power and KL15 ignition switched off safely.',
      spokenReplyTL: 'Pinatay na ang bench power at KL15 ignition.',
    };
  }

  if (/\b(sound on|enable sound|audio on|unmute|buksan ang tunog|turn on sound)\b/i.test(q)) {
    return {
      action: { type: 'SET_AUDIO', enabled: true },
      spokenReplyEN: 'Realistic EMS procedural sound effects enabled: engine rumble, injector clicks, spark snap, and relay acoustics.',
      spokenReplyTL: 'Naka-on na ang realistic EMS sound effects para sa makina, injectors, spark, fuel pump, at relays.',
    };
  }

  if (/\b(sound off|mute|silence|patayin ang tunog|turn off sound)\b/i.test(q)) {
    return {
      action: { type: 'SET_AUDIO', enabled: false },
      spokenReplyEN: 'Simulation sound effects muted.',
      spokenReplyTL: 'Naka-mute na ang simulation sound effects.',
    };
  }

  if (/\b(manual review|pause sync|freeze twin|i-pause ang sync)\b/i.test(q)) {
    return {
      action: { type: 'SET_SYNC_MODE', mode: 'MANUAL_REVIEW' },
      spokenReplyEN: 'Switched 3D EMS synchronization to Manual Review snapshot mode.',
      spokenReplyTL: 'Naka-Manual Review mode na ang 3D EMS digital twin.',
    };
  }

  if (/\b(live data|resume sync|live sync|ibalik sa live)\b/i.test(q)) {
    return {
      action: { type: 'SET_SYNC_MODE', mode: 'LIVE_DATA' },
      spokenReplyEN: 'Resumed real-time Live Data synchronization between Bench Lab and 3D Twin.',
      spokenReplyTL: 'Binalik na sa real-time Live Data synchronization ang Bench Lab at 3D Twin.',
    };
  }

  if (/\b(filter|isolate|highlight).*(grounds?|sgnd)\b/i.test(q)) {
    return {
      action: { type: 'SET_CIRCUIT_LAYER', layer: 'GROUNDS' },
      spokenReplyEN: 'Isolating the star-topology Chassis Ground G1, Engine Ground G2, and Sensor Ground SGND bus.',
      spokenReplyTL: 'Naka-filter na sa Ground Bus at Sensor Ground SGND circuits.',
    };
  }

  return null;
}
