/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { BenchComponent, BenchComponentType } from '../types/ecu';

export type LibraryComponentCategory = 'ALL' | 'LEDS' | 'RESISTORS' | 'DIODES' | 'SWITCHES' | 'PASSIVES';

export interface LibraryComponentPinDef {
  idSuffix: string;
  label: string;
  type: 'input' | 'output' | 'power' | 'ground';
  nominalVoltage?: number;
  description: string;
}

export interface LibraryComponentTemplate {
  id: string;
  name: string;
  category: LibraryComponentCategory;
  categoryLabel: string;
  type: BenchComponentType;
  badge: string;
  colorHex: string;
  description: string;
  benchRole: string;
  schematicSymbol: 'LED' | 'RESISTOR' | 'POTENTIOMETER' | 'DIODE' | 'TVS' | 'SWITCH' | 'RELAY' | 'CAPACITOR' | 'LOAD' | 'LAMP';
  pins: LibraryComponentPinDef[];
  defaultState: Record<string, number | boolean | string>;
  specs: {
    nominalValue: string;
    maxVoltage?: string;
    maxCurrent?: string;
    powerRating?: string;
    tolerance?: string;
    internalResistanceOhms?: number;
  };
}

export const BENCH_COMPONENT_LIBRARY: LibraryComponentTemplate[] = [
  // =========================================================================
  // 1. INDICATORS & TEST LIGHTS (LEDS & BULBS)
  // =========================================================================
  {
    id: 'lib-led-12v-green',
    name: '12V Test LED Indicator (Green)',
    category: 'LEDS',
    categoryLabel: 'Indicators & LEDs',
    type: 'led',
    badge: '12V DC · 680Ω BALLAST',
    colorHex: '#22c55e',
    description: 'High-visibility green LED with built-in 680Ω current-limiting resistor. Safely connects to 12V ignition, fuel pump relay, or main power rails.',
    benchRole: 'Connect between switched +12V power outputs and ground to monitor ignition wake-up (KL15) or main relay latch state.',
    schematicSymbol: 'LED',
    pins: [
      { idSuffix: 'anode', label: 'ANODE (+)', type: 'power', nominalVoltage: 12.6, description: 'Positive supply terminal (connected through 680Ω resistor to LED)' },
      { idSuffix: 'cathode', label: 'CATHODE (−)', type: 'ground', nominalVoltage: 0.0, description: 'Negative ground return terminal' },
    ],
    defaultState: {
      color: 'green',
      seriesResistorOhms: 680,
      forwardDropVolts: 2.1,
      isIlluminated: false,
    },
    specs: {
      nominalValue: '680 Ω Ballast / 2.1V Vf',
      maxVoltage: '16.0 V DC',
      maxCurrent: '20 mA',
      powerRating: '0.25 W',
      internalResistanceOhms: 680,
    },
  },
  {
    id: 'lib-led-12v-red',
    name: '12V Solenoid Drive Monitor LED (Red)',
    category: 'LEDS',
    categoryLabel: 'Indicators & LEDs',
    type: 'led',
    badge: 'INJECTOR / RELAY MONITOR',
    colorHex: '#ef4444',
    description: 'Fast-response red LED with 680Ω ballast. Ideal for monitoring ECU low-side ground switching drivers (injectors, relay coils, purge valves).',
    benchRole: 'Connect ANODE to +12V battery and CATHODE to ECU injector drive (Pin 10) to visually verify ground switching pulses.',
    schematicSymbol: 'LED',
    pins: [
      { idSuffix: 'anode', label: 'ANODE (+12V)', type: 'power', nominalVoltage: 12.6, description: 'Connect to +12V Battery / KL30 bus' },
      { idSuffix: 'cathode', label: 'SINK CTRL (−)', type: 'input', nominalVoltage: 12.6, description: 'Connect to low-side ground switching ECU driver pin' },
    ],
    defaultState: {
      color: 'red',
      seriesResistorOhms: 680,
      forwardDropVolts: 1.85,
      isIlluminated: false,
    },
    specs: {
      nominalValue: '680 Ω Ballast / 1.85V Vf',
      maxVoltage: '18.0 V DC',
      maxCurrent: '25 mA',
      powerRating: '0.25 W',
      internalResistanceOhms: 680,
    },
  },
  {
    id: 'lib-led-5v-blue',
    name: '5V Logic State Indicator (Blue)',
    category: 'LEDS',
    categoryLabel: 'Indicators & LEDs',
    type: 'led',
    badge: '5V LOGIC · 330Ω BALLAST',
    colorHex: '#38bdf8',
    description: 'Low-voltage high-efficiency blue indicator designed specifically for 5.0V sensor supply and logic lines (VREF, Hall signals, 5V trigger pulses).',
    benchRole: 'Connect to ECU 5V VREF (Pin 5) or sensor signal lines to monitor 5V regulator health and logic transitions without overloading.',
    schematicSymbol: 'LED',
    pins: [
      { idSuffix: 'anode', label: '5V SIG (+)', type: 'input', nominalVoltage: 5.0, description: 'Connect to 5.0V reference rail or logic signal' },
      { idSuffix: 'cathode', label: 'GND RETURN (−)', type: 'ground', nominalVoltage: 0.0, description: 'Connect to clean sensor ground (SGND / Pin 6)' },
    ],
    defaultState: {
      color: 'blue',
      seriesResistorOhms: 330,
      forwardDropVolts: 2.8,
      isIlluminated: false,
    },
    specs: {
      nominalValue: '330 Ω Ballast / 2.8V Vf',
      maxVoltage: '6.5 V DC',
      maxCurrent: '12 mA',
      powerRating: '0.125 W',
      internalResistanceOhms: 330,
    },
  },
  {
    id: 'lib-led-can-activity',
    name: 'CAN Bus Dual Activity Monitor',
    category: 'LEDS',
    categoryLabel: 'Indicators & LEDs',
    type: 'led',
    badge: 'DIFFERENTIAL BUS PROBE',
    colorHex: '#a855f7',
    description: 'Anti-parallel differential LED network across CAN-H and CAN-L with 4.7kΩ isolation resistors to monitor live differential arbitration and dominant frames without corrupting bus impedance.',
    benchRole: 'Connect across CAN-H (Pin 13) and CAN-L (Pin 14) to confirm active diagnostic or inter-module message transmission on the bench.',
    schematicSymbol: 'LED',
    pins: [
      { idSuffix: 'canh', label: 'CAN-H IN', type: 'input', nominalVoltage: 2.5, description: 'Connect to CAN High bus (Pin 13)' },
      { idSuffix: 'canl', label: 'CAN-L IN', type: 'input', nominalVoltage: 2.5, description: 'Connect to CAN Low bus (Pin 14)' },
    ],
    defaultState: {
      color: 'purple',
      seriesResistorOhms: 4700,
      forwardDropVolts: 1.9,
      isIlluminated: false,
    },
    specs: {
      nominalValue: '4.7 kΩ Isolation / Differential',
      maxVoltage: '36.0 V DC (Fault tolerant)',
      maxCurrent: '5 mA',
      powerRating: '0.25 W',
      internalResistanceOhms: 4700,
    },
  },
  {
    id: 'lib-lamp-12v-21w',
    name: '12V 21W Incandescent Test Lamp',
    category: 'LEDS',
    categoryLabel: 'Indicators & LEDs',
    type: 'load',
    badge: '1.75A LOAD · VOLTAGE DROP TEST',
    colorHex: '#f59e0b',
    description: 'High-current automotive tungsten incandescent bulb (7.5Ω cold filament, draws ~1.75A at 12.6V). Mandatory for testing relay contact voltage drops under real electrical load.',
    benchRole: 'Wire across relay Pin 87 and ground to verify power delivery under genuine current draw rather than floating high-impedance multimeter false readings.',
    schematicSymbol: 'LAMP',
    pins: [
      { idSuffix: 'lead1', label: 'LOAD IN (PIN 87)', type: 'input', nominalVoltage: 12.6, description: 'Connect to switched load supply from relay or ECU' },
      { idSuffix: 'lead2', label: 'POWER GND', type: 'ground', nominalVoltage: 0.0, description: 'Connect to chassis ground power return' },
    ],
    defaultState: {
      resistanceOhms: 7.5,
      isIlluminated: false,
    },
    specs: {
      nominalValue: '21 W @ 12V (7.5 Ω cold)',
      maxVoltage: '14.8 V DC',
      maxCurrent: '1.85 A',
      powerRating: '21 W',
      internalResistanceOhms: 7.5,
    },
  },

  // =========================================================================
  // 2. PULL-UP & PULL-DOWN RESISTORS & SHUNTS
  // =========================================================================
  {
    id: 'lib-res-1k-pullup',
    name: '1.0 kΩ Precision Pull-Up Resistor',
    category: 'RESISTORS',
    categoryLabel: 'Pull-Ups & Resistors',
    type: 'resistor',
    badge: '1.0 kΩ · 1% METAL FILM',
    colorHex: '#3b82f6',
    description: 'Precision 1.0 kΩ 1/4W 1% metal film resistor. Essential for biasing open-collector hall-effect speed sensors, camshaft triggers, and diagnostic K-Line pull-ups.',
    benchRole: 'Wire Pin 1 to +5V (or +12V) and Pin 2 to sensor signal pin to provide active pull-up current when sensor output transistor is off.',
    schematicSymbol: 'RESISTOR',
    pins: [
      { idSuffix: 'p1', label: 'TERMINAL 1 (VCC)', type: 'input', nominalVoltage: 5.0, description: 'Connect to pull-up supply rail (+5V VREF or +12V)' },
      { idSuffix: 'p2', label: 'TERMINAL 2 (SIG)', type: 'output', nominalVoltage: 5.0, description: 'Connect to open-collector signal line' },
    ],
    defaultState: {
      resistanceOhms: 1000,
    },
    specs: {
      nominalValue: '1.0 kΩ ±1%',
      maxVoltage: '250 V',
      maxCurrent: '25 mA',
      powerRating: '0.25 W',
      tolerance: '±1%',
      internalResistanceOhms: 1000,
    },
  },
  {
    id: 'lib-res-4k7-pullup',
    name: '4.7 kΩ Automotive Pull-Up Resistor',
    category: 'RESISTORS',
    categoryLabel: 'Pull-Ups & Resistors',
    type: 'resistor',
    badge: '4.7 kΩ · STANDARD AUTOMOTIVE',
    colorHex: '#06b6d4',
    description: 'Standard 4.7 kΩ automotive pull-up resistor. Widely used on crankshaft VR/Hall pre-amplifiers, AC compressor request switches, and LIN bus pull-up networks.',
    benchRole: 'Pull up floating ECU digital inputs or simulate vehicle harness pull-up impedance.',
    schematicSymbol: 'RESISTOR',
    pins: [
      { idSuffix: 'p1', label: 'TERMINAL 1 (BIAS)', type: 'input', nominalVoltage: 5.0, description: 'Connect to +5V or +12V bias rail' },
      { idSuffix: 'p2', label: 'TERMINAL 2 (LINE)', type: 'output', nominalVoltage: 5.0, description: 'Connect to ECU sensor input pin' },
    ],
    defaultState: {
      resistanceOhms: 4700,
    },
    specs: {
      nominalValue: '4.7 kΩ ±1%',
      maxVoltage: '250 V',
      maxCurrent: '5.5 mA',
      powerRating: '0.25 W',
      tolerance: '±1%',
      internalResistanceOhms: 4700,
    },
  },
  {
    id: 'lib-res-10k-pulldown',
    name: '10.0 kΩ Pull-Up / Pull-Down Resistor',
    category: 'RESISTORS',
    categoryLabel: 'Pull-Ups & Resistors',
    type: 'resistor',
    badge: '10.0 kΩ · HIGH IMPEDANCE',
    colorHex: '#6366f1',
    description: 'High-impedance 10.0 kΩ stabilizing resistor. Used to prevent floating inputs on high-impedance microcontroller ADC channels (TPS, pedal sensors, pressure inputs).',
    benchRole: 'Connect to ground to create a pull-down termination, or to +5V to pull up high-impedance sensing nodes.',
    schematicSymbol: 'RESISTOR',
    pins: [
      { idSuffix: 'p1', label: 'TERMINAL 1', type: 'input', nominalVoltage: 5.0, description: 'Terminal 1' },
      { idSuffix: 'p2', label: 'TERMINAL 2', type: 'output', nominalVoltage: 0.0, description: 'Terminal 2' },
    ],
    defaultState: {
      resistanceOhms: 10000,
    },
    specs: {
      nominalValue: '10.0 kΩ ±1%',
      maxVoltage: '250 V',
      maxCurrent: '2.5 mA',
      powerRating: '0.25 W',
      tolerance: '±1%',
      internalResistanceOhms: 10000,
    },
  },
  {
    id: 'lib-res-120-can',
    name: '120 Ω CAN Bus Termination Resistor',
    category: 'RESISTORS',
    categoryLabel: 'Pull-Ups & Resistors',
    type: 'resistor',
    badge: '120 Ω · ISO 11898 TERMINATOR',
    colorHex: '#f97316',
    description: 'Precision 120 Ω 1% 0.5W metal film resistor matching ISO 11898 high-speed CAN specification. Essential for bench harnesses to achieve standard 60 Ω total parallel bus impedance.',
    benchRole: 'Bridge between CAN-H (Pin 13) and CAN-L (Pin 14) to eliminate transmission line reflections and enable scan tool diagnostic communication.',
    schematicSymbol: 'RESISTOR',
    pins: [
      { idSuffix: 'canh', label: 'CAN-H TERMINAL', type: 'input', nominalVoltage: 2.5, description: 'Connect to CAN-High line (Pin 13)' },
      { idSuffix: 'canl', label: 'CAN-L TERMINAL', type: 'input', nominalVoltage: 2.5, description: 'Connect to CAN-Low line (Pin 14)' },
    ],
    defaultState: {
      resistanceOhms: 120,
    },
    specs: {
      nominalValue: '120 Ω ±1%',
      maxVoltage: '50 V',
      maxCurrent: '65 mA',
      powerRating: '0.5 W',
      tolerance: '±1%',
      internalResistanceOhms: 120,
    },
  },
  {
    id: 'lib-res-560-load',
    name: '560 Ω Shunt / Load Resistor',
    category: 'RESISTORS',
    categoryLabel: 'Pull-Ups & Resistors',
    type: 'resistor',
    badge: '560 Ω · 2W POWER SHUNT',
    colorHex: '#14b8a6',
    description: '2-Watt power resistor for bleeding inductive spikes, simulating light relay loads, and checking small solenoid driver outputs.',
    benchRole: 'Connect across relay coil driver or lamp driver to sink ~22mA from 12V and confirm clean transistor saturation without thermal overload.',
    schematicSymbol: 'RESISTOR',
    pins: [
      { idSuffix: 'p1', label: 'LEAD 1 (+)', type: 'input', nominalVoltage: 12.6, description: 'Lead 1' },
      { idSuffix: 'p2', label: 'LEAD 2 (−)', type: 'output', nominalVoltage: 0.0, description: 'Lead 2' },
    ],
    defaultState: {
      resistanceOhms: 560,
    },
    specs: {
      nominalValue: '560 Ω ±5%',
      maxVoltage: '350 V',
      maxCurrent: '60 mA',
      powerRating: '2.0 W',
      internalResistanceOhms: 560,
    },
  },
  {
    id: 'lib-res-r020-shunt',
    name: '0.02 Ω Current Sensing Shunt (R020)',
    category: 'RESISTORS',
    categoryLabel: 'Pull-Ups & Resistors',
    type: 'resistor',
    badge: '0.02 Ω (R020) · 3W SHUNT',
    colorHex: '#10b981',
    description: 'Precision Kelvin current sensing shunt (0.020 Ω 3W 1%). Insert in series with injectors or ignition coils to measure oscilloscope current ramp (20mV = 1 Ampere).',
    benchRole: 'Insert in series with injector wire to view current rise time and detect shorted injector solenoid windings on the oscilloscope.',
    schematicSymbol: 'RESISTOR',
    pins: [
      { idSuffix: 'in', label: 'CURRENT IN', type: 'input', nominalVoltage: 12.6, description: 'Current entry terminal' },
      { idSuffix: 'out', label: 'CURRENT OUT', type: 'output', nominalVoltage: 12.6, description: 'Current exit terminal to load' },
    ],
    defaultState: {
      resistanceOhms: 0.02,
    },
    specs: {
      nominalValue: '0.020 Ω ±1%',
      maxVoltage: '50 V',
      maxCurrent: '12.0 A',
      powerRating: '3.0 W',
      internalResistanceOhms: 0.02,
    },
  },
  {
    id: 'lib-pot-10k-sensor',
    name: '10 kΩ Rotary Potentiometer (Sensor Simulator)',
    category: 'RESISTORS',
    categoryLabel: 'Pull-Ups & Resistors',
    type: 'potentiometer',
    badge: '10 kΩ · 3-PIN VARIABLE DIVIDER',
    colorHex: '#8b5cf6',
    description: 'Precision linear potentiometer with adjustable center wiper (0% to 100%). Generates clean analog 0.0V to 5.0V voltage signals to simulate TPS, MAP, or accelerator pedal sensors.',
    benchRole: 'Connect VCC to 5V VREF (Pin 5), GND to SGND (Pin 6), and WIPER to TPS/MAP/APP input pins to sweep sensor voltage dynamically.',
    schematicSymbol: 'POTENTIOMETER',
    pins: [
      { idSuffix: 'vcc', label: 'VCC (+5V)', type: 'power', nominalVoltage: 5.0, description: 'Connect to 5.0V reference supply' },
      { idSuffix: 'wiper', label: 'WIPER OUT', type: 'output', nominalVoltage: 2.5, description: 'Adjustable analog voltage output (0–100% of VCC)' },
      { idSuffix: 'gnd', label: 'GND RETURN', type: 'ground', nominalVoltage: 0.0, description: 'Connect to sensor ground' },
    ],
    defaultState: {
      resistanceOhms: 10000,
      wiperPercent: 50,
    },
    specs: {
      nominalValue: '10.0 kΩ Linear',
      maxVoltage: '30 V',
      maxCurrent: '10 mA',
      powerRating: '0.5 W',
      internalResistanceOhms: 10000,
    },
  },

  // =========================================================================
  // 3. DIODES & TRANSIENT CLAMPS
  // =========================================================================
  {
    id: 'lib-diode-1n4007',
    name: '1N4007 Flyback Suppression Diode',
    category: 'DIODES',
    categoryLabel: 'Diodes & Clamps',
    type: 'diode',
    badge: '1000V / 1A · FLYBACK CLAMP',
    colorHex: '#e11d48',
    description: 'High-voltage standard silicon rectifier diode (1000V VRRM, 1A IF). Essential for quenching high-voltage inductive flyback spikes generated by relay coils and solenoids when de-energized.',
    benchRole: 'Install across relay coil (cathode to +12V, anode to ECU ground driver) to protect ECU MOSFET driver from breakdown.',
    schematicSymbol: 'DIODE',
    pins: [
      { idSuffix: 'anode', label: 'ANODE (A)', type: 'input', nominalVoltage: 0.0, description: 'Anode terminal' },
      { idSuffix: 'cathode', label: 'CATHODE (K / BAND)', type: 'output', nominalVoltage: 12.6, description: 'Cathode terminal (white band on body)' },
    ],
    defaultState: {
      forwardDropVolts: 0.7,
      isReverse: false,
    },
    specs: {
      nominalValue: '1000V / 1A (Vf ≈ 0.7V)',
      maxVoltage: '1000 V (VRRM)',
      maxCurrent: '1.0 A continuous',
      internalResistanceOhms: 0.25,
    },
  },
  {
    id: 'lib-diode-b540c',
    name: 'B540C Schottky Barrier Diode',
    category: 'DIODES',
    categoryLabel: 'Diodes & Clamps',
    type: 'diode',
    badge: '40V / 5A · LOW-DROP 0.35V',
    colorHex: '#ea580c',
    description: 'High-current automotive Schottky barrier rectifier with ultra-low forward voltage drop (Vf ≈ 0.35V @ 1A). Ideal for reverse polarity bench protection.',
    benchRole: 'Insert in series with +12V battery power lead to block negative voltage if bench power supply leads are accidentally reversed.',
    schematicSymbol: 'DIODE',
    pins: [
      { idSuffix: 'anode', label: 'ANODE (+12V IN)', type: 'power', nominalVoltage: 12.6, description: 'Raw battery input' },
      { idSuffix: 'cathode', label: 'CATHODE (+12V OUT)', type: 'power', nominalVoltage: 12.25, description: 'Protected power output to ECU' },
    ],
    defaultState: {
      forwardDropVolts: 0.35,
      isReverse: false,
    },
    specs: {
      nominalValue: '40V / 5A (Vf ≈ 0.35V)',
      maxVoltage: '40 V (VRRM)',
      maxCurrent: '5.0 A continuous',
      internalResistanceOhms: 0.08,
    },
  },
  {
    id: 'lib-diode-smbj24ca',
    name: 'SMBJ24CA 24V TVS Surge Suppressor',
    category: 'DIODES',
    categoryLabel: 'Diodes & Clamps',
    type: 'diode',
    badge: '24V / 600W · ISO 7637-2 CLAMP',
    colorHex: '#d97706',
    description: 'Automotive bidirectional Transient Voltage Suppressor (TVS). Clamps ISO 7637-2 load dump overvoltage spikes, shunting surges above 26.7V safely to ground.',
    benchRole: 'Wire across +12V battery rail and chassis ground to protect sensitive bench instruments and microcontrollers from bench supply voltage surges.',
    schematicSymbol: 'TVS',
    pins: [
      { idSuffix: 't1', label: 'TERMINAL 1 (LINE)', type: 'input', nominalVoltage: 12.6, description: 'Connect to protected supply line' },
      { idSuffix: 't2', label: 'TERMINAL 2 (GND)', type: 'ground', nominalVoltage: 0.0, description: 'Connect to chassis ground plane' },
    ],
    defaultState: {
      breakdownVolts: 26.7,
      clampingVolts: 38.9,
    },
    specs: {
      nominalValue: '24V Standoff / 600W Peak',
      maxVoltage: '26.7 V Breakdown',
      maxCurrent: '15.4 A Peak Pulse',
      powerRating: '600 W Peak',
      internalResistanceOhms: 1e7,
    },
  },
  {
    id: 'lib-diode-zener-5v1',
    name: '5.1V Zener Voltage Clamp (BZX55C5V1)',
    category: 'DIODES',
    categoryLabel: 'Diodes & Clamps',
    type: 'diode',
    badge: '5.1V · 500mW ADC CLAMP',
    colorHex: '#ca8a04',
    description: 'Precision 5.1V 500mW Zener diode. Shunts overvoltage on sensitive 5V analog sensor ADC lines (MAP, TPS, O2, ECT) to prevent destroying internal microcontroller ADC inputs.',
    benchRole: 'Wire cathode to 5V sensor signal and anode to ground to strictly clamp voltages > 5.1V during fault injection experiments.',
    schematicSymbol: 'DIODE',
    pins: [
      { idSuffix: 'cathode', label: 'CATHODE (5V SIG)', type: 'input', nominalVoltage: 5.0, description: 'Connect to protected 5V signal line' },
      { idSuffix: 'anode', label: 'ANODE (GND)', type: 'ground', nominalVoltage: 0.0, description: 'Connect to sensor ground return' },
    ],
    defaultState: {
      zenerVoltage: 5.1,
    },
    specs: {
      nominalValue: '5.1 V Zener Breakdown',
      maxVoltage: '5.1 V Clamping',
      maxCurrent: '90 mA',
      powerRating: '0.5 W',
      internalResistanceOhms: 1e6,
    },
  },

  // =========================================================================
  // 4. SWITCHES, RELAYS & JUMPERS
  // =========================================================================
  {
    id: 'lib-sw-toggle-spst',
    name: 'SPST Heavy-Duty Bench Toggle Switch',
    category: 'SWITCHES',
    categoryLabel: 'Switches & Relays',
    type: 'switch',
    badge: '12V / 20A · MECHANICAL TOGGLE',
    colorHex: '#38bdf8',
    description: 'Automotive toggle switch with clickable state. Used to simulate switched ignition power (KL15), AC request, or brake switch inputs.',
    benchRole: 'Insert between +12V supply and ECU Pin 4 (KL15) to toggle ignition on/off during bench wake-up and flash programming routines.',
    schematicSymbol: 'SWITCH',
    pins: [
      { idSuffix: 'in', label: 'SWITCH IN', type: 'power', nominalVoltage: 12.6, description: 'Power entry terminal' },
      { idSuffix: 'out', label: 'SWITCHED OUT', type: 'output', nominalVoltage: 12.6, description: 'Switched power output terminal' },
    ],
    defaultState: {
      isOpen: false,
      contactResistanceOhms: 0.02,
    },
    specs: {
      nominalValue: 'SPST ON/OFF Toggle',
      maxVoltage: '30 V DC',
      maxCurrent: '20 A',
      internalResistanceOhms: 0.02,
    },
  },
  {
    id: 'lib-sw-push-no',
    name: 'Normally-Open (NO) Pushbutton Switch',
    category: 'SWITCHES',
    categoryLabel: 'Switches & Relays',
    type: 'switch',
    badge: 'MOMENTARY CONTACT · START/CRANK',
    colorHex: '#0ea5e9',
    description: 'Spring-loaded normally open pushbutton switch. Simulates starter crank signal (STA / 50), horn switch, or clutch interlock signals.',
    benchRole: 'Click to momentarily bridge +12V or GND to ECU start input pin to initiate starter crank state in diagnostic data.',
    schematicSymbol: 'SWITCH',
    pins: [
      { idSuffix: 'p1', label: 'TERMINAL A', type: 'input', nominalVoltage: 12.6, description: 'Terminal A' },
      { idSuffix: 'p2', label: 'TERMINAL B', type: 'output', nominalVoltage: 0.0, description: 'Terminal B' },
    ],
    defaultState: {
      isOpen: true,
      contactResistanceOhms: 0.02,
    },
    specs: {
      nominalValue: 'Momentary Pushbutton (NO)',
      maxVoltage: '24 V DC',
      maxCurrent: '10 A',
      internalResistanceOhms: 0.02,
    },
  },
  {
    id: 'lib-relay-5pin-spdt',
    name: '5-Pin ISO Automotive Relay (SPDT)',
    category: 'SWITCHES',
    categoryLabel: 'Switches & Relays',
    type: 'relay',
    badge: '12V / 40A · ISO MICRO RELAY',
    colorHex: '#8b5cf6',
    description: 'Standard automotive SPDT micro relay with 85Ω coil. Has common (30), normally closed (87a), normally open (87), coil positive (86), and coil control (85).',
    benchRole: 'Test ECU relay driver circuits and verify armature transfer between 87a (NC) and 87 (NO) under coil excitation.',
    schematicSymbol: 'RELAY',
    pins: [
      { idSuffix: 'pin30', label: 'PIN 30 (COMMON +)', type: 'power', nominalVoltage: 12.6, description: 'Main fused power input' },
      { idSuffix: 'pin87', label: 'PIN 87 (NO LOAD)', type: 'output', nominalVoltage: 12.6, description: 'Normally open contact to load' },
      { idSuffix: 'pin87a', label: 'PIN 87a (NC LOAD)', type: 'output', nominalVoltage: 0.0, description: 'Normally closed contact' },
      { idSuffix: 'pin86', label: 'PIN 86 (COIL +)', type: 'power', nominalVoltage: 12.6, description: 'Coil positive supply' },
      { idSuffix: 'pin85', label: 'PIN 85 (COIL −)', type: 'input', nominalVoltage: 0.2, description: 'Coil ground control from ECU' },
    ],
    defaultState: {
      isLatched: true,
      coilResistanceOhms: 85,
    },
    specs: {
      nominalValue: '85 Ω Coil / 40A Contacts',
      maxVoltage: '16.0 V DC',
      maxCurrent: '40 A (Pin 30-87)',
      internalResistanceOhms: 85,
    },
  },
  {
    id: 'lib-jumper-fused-10a',
    name: '10A Fused Bench Jumper Lead',
    category: 'SWITCHES',
    categoryLabel: 'Switches & Relays',
    type: 'switch',
    badge: '10A FUSED · CIRCUIT PROTECTION',
    colorHex: '#eab308',
    description: 'Heavy-duty 14 AWG jumper lead with integrated transparent 10A mini automotive blade fuse. Protects ECU power pins and traces during manual wiring experiments.',
    benchRole: 'Safely jump power or ground between pins with guaranteed current trip protection if an accidental short occurs.',
    schematicSymbol: 'SWITCH',
    pins: [
      { idSuffix: 'in', label: 'JUMPER IN', type: 'input', nominalVoltage: 12.6, description: 'Lead A' },
      { idSuffix: 'out', label: 'JUMPER OUT', type: 'output', nominalVoltage: 12.6, description: 'Lead B' },
    ],
    defaultState: {
      isOpen: false,
      fuseBlown: false,
      fuseRatingAmps: 10,
    },
    specs: {
      nominalValue: '10 A Blade Fuse (0.015 Ω)',
      maxVoltage: '32 V DC',
      maxCurrent: '10 A Continuous',
      internalResistanceOhms: 0.015,
    },
  },

  // =========================================================================
  // 5. PASSIVE FILTERS & DUMMY SOLENOID LOADS
  // =========================================================================
  {
    id: 'lib-cap-100nf-mlcc',
    name: '100 nF High-Frequency Decoupling Capacitor',
    category: 'PASSIVES',
    categoryLabel: 'Passives & Loads',
    type: 'capacitor',
    badge: '100 nF · 50V X7R MLCC',
    colorHex: '#06b6d4',
    description: 'Ceramic multilayer capacitor for filtering radio-frequency ripple and noise spikes off sensor reference rails and ADC signal inputs.',
    benchRole: 'Place across 5V VREF and sensor ground to suppress ADC noise jitter during analog sensor simulation.',
    schematicSymbol: 'CAPACITOR',
    pins: [
      { idSuffix: 'pos', label: 'FILTER (+)', type: 'input', nominalVoltage: 5.0, description: 'Positive / signal terminal' },
      { idSuffix: 'neg', label: 'GND RETURN (−)', type: 'ground', nominalVoltage: 0.0, description: 'Clean ground plane terminal' },
    ],
    defaultState: {
      capacitanceUf: 0.1,
    },
    specs: {
      nominalValue: '100 nF (0.1 µF) ±10%',
      maxVoltage: '50 V DC',
      internalResistanceOhms: 1e6,
    },
  },
  {
    id: 'lib-cap-470uf-bulk',
    name: '470 µF / 35V Low-ESR Reservoir Capacitor',
    category: 'PASSIVES',
    categoryLabel: 'Passives & Loads',
    type: 'capacitor',
    badge: '470 µF / 35V · LOW-ESR',
    colorHex: '#0284c7',
    description: 'High-capacity aluminum electrolytic capacitor (ESR < 0.12Ω). Absorbs inductive battery line kickback and stabilizes +12V power input during high-current injector pulses.',
    benchRole: 'Connect across KL30 (+12V) and ground to simulate vehicle battery capacitance and smooth alternator ripple.',
    schematicSymbol: 'CAPACITOR',
    pins: [
      { idSuffix: 'pos', label: 'CAP POS (+)', type: 'power', nominalVoltage: 12.6, description: 'Positive +12V terminal' },
      { idSuffix: 'neg', label: 'CAP NEG (−)', type: 'ground', nominalVoltage: 0.0, description: 'Negative ground terminal' },
    ],
    defaultState: {
      capacitanceUf: 470,
    },
    specs: {
      nominalValue: '470 µF / 35V',
      maxVoltage: '35 V DC',
      internalResistanceOhms: 1e5,
    },
  },
  {
    id: 'lib-load-inj-12ohm',
    name: '12.0 Ω / 50W Dummy Solenoid Injector Coil',
    category: 'PASSIVES',
    categoryLabel: 'Passives & Loads',
    type: 'load',
    badge: '12.0 Ω · 50W SOLENOID DUMMY',
    colorHex: '#ec4899',
    description: 'Chassis-mounted aluminum wirewound power resistor replicating authentic common-rail / port injector solenoid coil inductance and DC resistance (12.0Ω).',
    benchRole: 'Connect between +12V and ECU injector driver pin to test driver circuit under full 1 Amp peak current load without actual fuel injectors.',
    schematicSymbol: 'LOAD',
    pins: [
      { idSuffix: 'vbat', label: '+12V SUPPLY', type: 'power', nominalVoltage: 12.6, description: 'Connect to +12V Battery' },
      { idSuffix: 'sink', label: 'ECU SINK IN', type: 'input', nominalVoltage: 0.2, description: 'Connect to ECU injector low-side driver' },
    ],
    defaultState: {
      resistanceOhms: 12.0,
      inductanceMh: 3.5,
    },
    specs: {
      nominalValue: '12.0 Ω ±5%',
      maxVoltage: '100 V Flyback Peak',
      maxCurrent: '2.0 A Continuous',
      powerRating: '50 W (Heatsink mount)',
      internalResistanceOhms: 12.0,
    },
  },
  {
    id: 'lib-load-actuator-500ohm',
    name: '500 Ω Bench Dummy Actuator Load',
    category: 'PASSIVES',
    categoryLabel: 'Passives & Loads',
    type: 'load',
    badge: '500 Ω / 5W · ACTUATOR DUMMY',
    colorHex: '#d946ef',
    description: '500 Ω power dummy load for testing EVAP purge valve, variable valve timing (VVT) solenoid, and transmission pressure solenoid driver outputs.',
    benchRole: 'Sinks ~25mA from +12V to verify ECU output stage driver operation without triggering open-circuit diagnostic trouble codes (DTCs).',
    schematicSymbol: 'LOAD',
    pins: [
      { idSuffix: 'p1', label: 'LOAD LEAD A', type: 'input', nominalVoltage: 12.6, description: 'Lead A' },
      { idSuffix: 'p2', label: 'LOAD LEAD B', type: 'output', nominalVoltage: 0.0, description: 'Lead B' },
    ],
    defaultState: {
      resistanceOhms: 500,
    },
    specs: {
      nominalValue: '500 Ω ±5%',
      maxVoltage: '100 V',
      maxCurrent: '100 mA',
      powerRating: '5.0 W',
      internalResistanceOhms: 500,
    },
  },
];

/**
 * Filter library templates by search query and category
 */
export function filterBenchComponentLibrary(
  query: string,
  category: LibraryComponentCategory
): LibraryComponentTemplate[] {
  const cleanQ = query.trim().toLowerCase();

  return BENCH_COMPONENT_LIBRARY.filter((tmpl) => {
    if (category !== 'ALL' && tmpl.category !== category) {
      return false;
    }
    if (!cleanQ) return true;

    return (
      tmpl.name.toLowerCase().includes(cleanQ) ||
      tmpl.description.toLowerCase().includes(cleanQ) ||
      tmpl.benchRole.toLowerCase().includes(cleanQ) ||
      tmpl.badge.toLowerCase().includes(cleanQ) ||
      tmpl.type.toLowerCase().includes(cleanQ) ||
      tmpl.categoryLabel.toLowerCase().includes(cleanQ) ||
      tmpl.specs.nominalValue.toLowerCase().includes(cleanQ) ||
      tmpl.pins.some((p) => p.label.toLowerCase().includes(cleanQ))
    );
  });
}

/**
 * Create a live BenchComponent instance from a library template
 */
let componentSequenceCounter = 1;

export function createBenchComponentFromTemplate(
  template: LibraryComponentTemplate,
  targetX?: number,
  targetY?: number
): BenchComponent {
  const timestamp = Date.now().toString(36).slice(-4);
  const seq = componentSequenceCounter++;
  const uniqueId = `aux-${template.type}-${seq}-${timestamp}`;

  // Default placement if coordinates not specified: offset on right of canvas
  const defaultX = targetX !== undefined ? Math.round(targetX) : 750 + ((seq % 3) * 30);
  const defaultY = targetY !== undefined ? Math.round(targetY) : 120 + ((seq % 4) * 85);

  const rowHeight = 32;
  const headerHeight = 44;

  const pins = template.pins.map((p, idx) => ({
    id: `${uniqueId}-${p.idSuffix}`,
    label: p.label,
    type: p.type,
    relativeX: 0,
    relativeY: headerHeight + idx * rowHeight,
    nominalVoltage: p.nominalVoltage,
    description: p.description,
  }));

  return {
    id: uniqueId,
    name: template.name,
    type: template.type,
    x: defaultX,
    y: defaultY,
    pins,
    state: {
      ...template.defaultState,
    },
    notes: template.benchRole,
    isAuxiliary: true,
    libraryTemplateId: template.id,
    category: template.categoryLabel,
  };
}
