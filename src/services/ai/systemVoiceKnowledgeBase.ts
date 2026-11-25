/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { LabTab } from '../../components/LabTopNav';

export type VoiceModalAction =
  | 'ACADEMY_LAB'
  | 'REPORT_STUDIO'
  | 'DIAGNOSTIC_ASSISTANT'
  | 'SAVED_SESSIONS';

export interface SystemVoiceModuleTopic {
  id: string;
  tabTarget?: LabTab;
  modalTarget?: VoiceModalAction;
  actionLabelTL: string;
  actionLabelEN: string;
  titleTL: string;
  titleEN: string;
  /** High-signal keywords/phrases (lowercase) for Taglish & English voice recognition */
  aliases: string[];
  /** Concise 2-3 sentence spoken Taglish guide for "Paano gamitin..." */
  howToUseTL: string;
  /** Concise 2-3 sentence spoken English guide for "How to use..." */
  howToUseEN: string;
  /** Natural spoken Taglish answer for follow-up "Anong meron doon?" */
  whatsInsideTL: string;
  /** Natural spoken English answer for follow-up "What's inside there?" */
  whatsInsideEN: string;
  /** Alternative spoken variant for anti-repetition if user asks again */
  whatsInsideAltTL: string;
  whatsInsideAltEN: string;
  /** Structured on-screen checklist shown in the floating Voice Dock */
  whatsInsideBulletsTL: string[];
  whatsInsideBulletsEN: string[];
  /** Short safety / best-practice reminder */
  safetyTipTL: string;
  safetyTipEN: string;
  /** Suggested one-tap follow-up prompts for this topic */
  followUpChipsTL: string[];
  followUpChipsEN: string[];
}

export const SYSTEM_VOICE_KNOWLEDGE_TOPICS: readonly SystemVoiceModuleTopic[] = [
  {
    id: 'sys-bench-lab',
    tabTarget: 'BENCH_LAB',
    actionLabelTL: 'Buksan ang Bench Lab',
    actionLabelEN: 'Open Bench Lab',
    titleTL: 'ECU Bench Lab Workstation',
    titleEN: 'ECU Bench Lab Workstation',
    aliases: [
      'benchlab',
      'bench lab',
      'bench',
      'ecu bench',
      'workstation',
      'simulator',
      'main lab',
      'lab',
    ],
    howToUseTL:
      'Sige po, dito sa Bench Lab, i-set muna natin ang Bench Power Supply sa 12.6V at 1.5A to 2.0A limit bago i-ON ang output. Pwede niyo pong galawin ang Multimeter probes sa kaliwa o i-click ang kahit anong ECU pin para makita ang live voltage at ma-test ang faults.',
    howToUseEN:
      'In Bench Lab, set the Bench Power Supply to 12.6V with a 1.5A to 2.0A current limit before enabling output. Use the Digital Multimeter probes or click any ECU pin to inspect live MNA voltages and test fault scenarios.',
    whatsInsideTL:
      'Nandito po sa Bench Lab ang Power Supply na may OCP protection, Digital Multimeter, Interactive Wiring Canvas, Fault Injection Matrix, Sensor at Actuator sliders, RPM Emulator, at Live Gauge Monitor.',
    whatsInsideEN:
      'Inside Bench Lab you have the OCP-protected Bench Power Supply, Digital Multimeter, Interactive Wiring Canvas, Fault Injection Matrix, Sensor and Actuator controls, RPM Emulator, and Live Gauge Monitor.',
    whatsInsideAltTL:
      'Kumpleto po ang Bench Lab natin: may PSU para sa KL30 at KL15, DMM para sa voltage at ohms, live wiring board na pwedeng putulan ng wire, at fault injector para sa TPS, MAP, ECT, Injector, at CAN bus.',
    whatsInsideAltEN:
      'Bench Lab combines the virtual PSU for KL30/KL15 power, a multi-mode DMM for voltage and resistance, an interactive wiring canvas with cut-wire testing, and fault injection for sensors, injectors, and CAN bus.',
    whatsInsideBulletsTL: [
      'Bench Power Supply (KL30 / KL15, adjustable Voltage & Current Limit, OCP Trip protection)',
      'Digital Multimeter (V_DC, OHMS, CONTINUITY, DIODE modes with Red & Black probes)',
      'Interactive Wiring Canvas & Fault Matrix (Open, Short to GND, Short to VBAT, Cut Wire)',
      'RPM Emulator, Sensor/Actuator Sliders (TPS, MAP, ECT, Injector) at Live Gauge Monitor',
    ],
    whatsInsideBulletsEN: [
      'Bench Power Supply (KL30 / KL15, adjustable Voltage & Current Limit, OCP Trip)',
      'Digital Multimeter (V_DC, OHMS, CONTINUITY, DIODE with movable Red & Black probes)',
      'Interactive Wiring Canvas & Fault Matrix (Open, Short to GND, Short to VBAT, Cut Wire)',
      'RPM Emulator, Sensor/Actuator Controls (TPS, MAP, ECT, Injector) & Live Gauge Monitor',
    ],
    safetyTipTL:
      'Paalala lang po: i-OFF muna ang Bench Power Supply bago mag-OHMS o magkabit ng wire, at huwag maglalagay ng 12V sa 5V sensor pin.',
    safetyTipEN:
      'Safety reminder: Turn Bench Power Supply OFF before OHMS checks or wiring changes, and never apply 12V to a 5V sensor rail.',
    followUpChipsTL: [
      'Anong meron doon?',
      'Buksan ang Bench Lab',
      'Ano status ng bench?',
      'Paano gamitin ang pinouts?',
    ],
    followUpChipsEN: [
      "What's inside there?",
      'Open Bench Lab',
      'What is the bench status?',
      'How to use pinouts?',
    ],
  },
  {
    id: 'sys-ecu-pinouts',
    tabTarget: 'ECU_PINOUT',
    actionLabelTL: 'Buksan ang ECU Pinouts',
    actionLabelEN: 'Open ECU Pinouts',
    titleTL: 'ECU Connector Pinouts & OEM Wake-Up Reference',
    titleEN: 'ECU Connector Pinouts & OEM Wake-Up Reference',
    aliases: [
      'pinout',
      'pinouts',
      'pin out',
      'pin outs',
      'ecu pinout',
      'ecu pinouts',
      'connector',
      'connector pinout',
      'obd pinout',
      'dlc pin',
    ],
    howToUseTL:
      'Sige po, dito sa ECU Pinouts tab, piliin muna ang brand at eksaktong ECU profile para makita natin ang KL30, KL15, Ground, 5V supply, at CAN bus pins. I-verify po muna ang ECU part number at connector orientation bago mag-power up sa totoong unit.',
    howToUseEN:
      'In the ECU Pinouts tab, select your vehicle brand and exact ECU profile to view KL30, KL15, Ground, 5V reference, and CAN pins. Always verify the exact ECU part number and connector face orientation before energizing real hardware.',
    whatsInsideTL:
      'Nandoon po sa ECU Pinouts ang interactive 16-pin bench trainer diagram, OEM ECU profiles tulad ng Toyota Denso, Mitsubishi 4N15, Isuzu Transtron, at Bosch EDC17, pati OBD-II DLC pin mapping at Bench Safety Guard.',
    whatsInsideEN:
      'Inside ECU Pinouts you will find the 16-pin bench trainer layout, OEM ECU brand profiles (Toyota Denso, Mitsubishi 4N15, Isuzu Transtron, Bosch EDC17), SAE J1962 OBD-II DLC pin mapping, and the Bench Safety Guard.',
    whatsInsideAltTL:
      'May color-coded connector view po doon na hiwalay ang Power, Ground, 5V Supply, Sensor Input, Actuator Output, at CAN lines — may malinaw ding label kung bench trainer lang o OEM-verified reference.',
    whatsInsideAltEN:
      'It provides a color-coded connector face view separating Power, Ground, 5V VREF, Sensors, Actuators, and CAN lines, complete with verification provenance labels and bench trap warnings.',
    whatsInsideBulletsTL: [
      '16-Pin Universal Bench Trainer pinout map na naka-sync sa live MNA voltages',
      'OEM ECU Brand Profiles (Toyota 1KD/2KD, Mitsubishi 4N15, Isuzu Transtron, Bosch EDC17, atbp.)',
      'OBD-II DLC Pin Mapping (Pin 4/5 GND, Pin 6 CAN_H, Pin 14 CAN_L, Pin 16 +12V)',
      'Bench Trap Warnings at Provenance Safety Guard (hiwalay ang simulated trainer sa actual OEM)',
    ],
    whatsInsideBulletsEN: [
      '16-Pin Universal Bench Trainer map synced with live MNA voltages',
      'OEM ECU Brand Profiles (Toyota 1KD/2KD, Mitsubishi 4N15, Isuzu Transtron, Bosch EDC17, etc.)',
      'OBD-II DLC Pin Mapping (Pin 4/5 GND, Pin 6 CAN_H, Pin 14 CAN_L, Pin 16 +12V)',
      'Bench Trap Warnings & Provenance Safety Guard separating trainer pins from physical OEM units',
    ],
    safetyTipTL:
      'Huwag gagamitin ang 16-pin trainer numbers sa totoong ECU sa shop — laging i-confirm ang totoong ECU part number at connector orientation.',
    safetyTipEN:
      'Never apply 16-pin bench trainer numbers to a real vehicle ECU — always confirm the exact OEM part number and connector orientation.',
    followUpChipsTL: [
      'Anong meron doon?',
      'Buksan ang Pinouts',
      'Ano ang Pin 5?',
      'Paano gamitin ang 3D twin?',
    ],
    followUpChipsEN: [
      "What's inside there?",
      'Open ECU Pinouts',
      'What is Pin 5?',
      'How to use 3D twin?',
    ],
  },
  {
    id: 'sys-3d-twin',
    tabTarget: 'THREE_D_TWIN',
    actionLabelTL: 'Buksan ang 3D Bench Twin',
    actionLabelEN: 'Open 3D Bench Twin',
    titleTL: '3D ECU Bench Twin (Interactive 3D View)',
    titleEN: '3D ECU Bench Twin (Interactive 3D View)',
    aliases: [
      '3d twin',
      '3d bench twin',
      'three d twin',
      '3d',
      'three d',
      '3d view',
      '3d ecu',
      'twin',
      'digital twin',
    ],
    howToUseTL:
      'Tara sa 3D Bench Twin po! I-drag lang ang screen para maikot ang 3D ECU bench, scroll para mag-zoom, at i-click ang kahit anong pin o sensor para lumipat doon ang multimeter probes. Nasa bottom dock din ang mabilisang camera angles.',
    howToUseEN:
      'In the 3D Bench Twin, drag to orbit around the 3D ECU bench, scroll to zoom, and click any 3D pin or sensor to animate multimeter probes directly to that node. Use the bottom dock for camera presets and layer controls.',
    whatsInsideTL:
      'Nandito po sa 3D Twin ang 3D ECU module, wiring harness na umiilaw kapag may kuryente o fault, animated Red at Black DMM probes, sensor/actuator 3D models, at bottom camera control dock.',
    whatsInsideEN:
      'Inside the 3D Bench Twin you get a realistic 3D ECU housing, live-highlighted wiring harness, animated Red and Black DMM probes, 3D sensor/actuator assemblies, and a bottom camera and telemetry dock.',
    whatsInsideAltTL:
      'Naka-sync po ang 3D Twin sa live MNA simulation natin — kapag nag-inject tayo ng short o nag-cut ng wire, makikita niyo agad ang fault highlight sa 3D harness at gagalaw ang virtual probes sa pin na pinili niyo.',
    whatsInsideAltEN:
      'The 3D Twin stays synced to the live MNA circuit solver: injected shorts, cut wires, and probe placements animate in real time directly on the 3D harness and ECU connector.',
    whatsInsideBulletsTL: [
      'Interactive 3D Studio PBR ECU module na pwedeng i-orbit, i-pan, at i-zoom',
      'Animated Red (+) at Black (COM) DMM probes na lumilipad papunta sa pin na pinili',
      'Live harness current/fault glow indicators at crank/sensor motion animation',
      'Bottom Camera Dock para sa mabilis na Front, Top, Connector, at Harness views',
    ],
    whatsInsideBulletsEN: [
      'Interactive 3D Studio PBR ECU model with orbit, pan, and zoom controls',
      'Animated Red (+) and Black (COM) DMM probes gliding onto targeted pins',
      'Live harness energization, fault highlights, and sensor motion indicators',
      'Bottom Camera Dock for instant Front, Top, Connector, and Harness angles',
    ],
    safetyTipTL:
      'Tip: Kung mabagal ang 3D view sa lumang device, gamitin ang camera presets sa bottom dock at i-check ang live readings sa Bench Lab.',
    safetyTipEN:
      'Tip: Use the bottom dock camera presets for fast pin inspection, and always treat 3D voltages as simulated bench telemetry.',
    followUpChipsTL: [
      'Anong meron doon?',
      'Buksan ang 3D Twin',
      'Paano gamitin ang BenchLab?',
      'Paano gamitin ang Oscilloscope?',
    ],
    followUpChipsEN: [
      "What's inside there?",
      'Open 3D Twin',
      'How to use BenchLab?',
      'How to use Oscilloscope?',
    ],
  },
  {
    id: 'sys-wiring-diagram',
    tabTarget: 'WIRING_DIAGRAM',
    actionLabelTL: 'Buksan ang Harness Wiring',
    actionLabelEN: 'Open Harness Wiring',
    titleTL: 'Harness Wiring & Circuit Schematic View',
    titleEN: 'Harness Wiring & Circuit Schematic View',
    aliases: [
      'wiring',
      'wiring diagram',
      'harness',
      'harness wiring',
      'wiring canvas',
      'schematic',
      'wire',
      'wires',
    ],
    howToUseTL:
      'Dito po sa Harness Wiring tab, makikita niyo ang buong koneksyon ng ECU pins papunta sa sensors at actuators. I-click lang ang wire para makita ang resistance at current, o subukan ang cut-wire test para makita kung paano nagbabago ang reading.',
    howToUseEN:
      'In the Harness Wiring tab, trace every connection between ECU pins, sensors, and actuators. Click any wire to inspect resistance and current flow, or toggle cut-wire faults to test open-circuit behavior.',
    whatsInsideTL:
      'Nandito po ang buong harness map, wire resistance at current reading, cut-wire simulator, search filter ng pins at components, at malinis na trace ng power, ground, 5V, at signal lines.',
    whatsInsideEN:
      'Inside Harness Wiring you will find the interactive node-to-node harness topology, wire resistance and current readouts, cut-wire testing, pin/component search, and clean power/ground/signal tracing.',
    whatsInsideAltTL:
      'Madali niyo pong mahahanap dito kung aling wire ang papunta sa TPS, MAP, ECT, Injector, Relay, o CAN bus, at kita agad kung aling linya ang may putol o active fault.',
    whatsInsideAltEN:
      'You can quickly filter which harness wire feeds the TPS, MAP, ECT, Injector, Relay, or CAN bus, and spot open or faulted lines immediately.',
    whatsInsideBulletsTL: [
      'Interactive ECU-to-Sensor at Actuator harness graph na naka-sync sa MNA solver',
      'Wire resistance, voltage drop, at branch current inspection per wire',
      'Cut-Wire & Open Circuit test controls para sa troubleshooting practice',
      'Mabilis na Topology Search ayon sa pin number o component name',
    ],
    whatsInsideBulletsEN: [
      'Interactive ECU-to-Sensor and Actuator harness graph synced to MNA solver',
      'Per-wire resistance, voltage drop, and branch current inspection',
      'Cut-Wire & Open Circuit toggles for fault isolation practice',
      'Fast Topology Search by pin number or component keyword',
    ],
    safetyTipTL:
      'Palaging siguraduhing naka-OFF ang Bench PSU bago magkabit o magtanggal ng wire sa circuit.',
    safetyTipEN:
      'Always keep the Bench PSU turned OFF before adding, moving, or reconnecting harness wires.',
    followUpChipsTL: [
      'Anong meron doon?',
      'Buksan ang Wiring',
      'Paano gamitin ang BenchLab?',
      'Ano status ng bench?',
    ],
    followUpChipsEN: [
      "What's inside there?",
      'Open Harness Wiring',
      'How to use BenchLab?',
      'What is the bench status?',
    ],
  },
  {
    id: 'sys-oscilloscope',
    tabTarget: 'OSCILLOSCOPE',
    actionLabelTL: 'Buksan ang Oscilloscope',
    actionLabelEN: 'Open Oscilloscope',
    titleTL: 'Multi-Channel Oscilloscope & Waveform Lab',
    titleEN: 'Multi-Channel Oscilloscope & Waveform Lab',
    aliases: [
      'oscilloscope',
      'scope',
      'waveform',
      'waveforms',
      'signal',
      'signals',
      'binary monitor',
      'logic analyzer',
    ],
    howToUseTL:
      'Sige po, sa Oscilloscope tab, piliin lang ang signal tulad ng CKP, CMP, CAN Bus, Injector, o Ignition, tapos i-adjust ang timebase at voltage scale para malinaw ang pulse. Siguraduhing naka-ON ang Bench PSU at RPM Emulator para gumalaw ang live waveform.',
    howToUseEN:
      'In the Oscilloscope tab, pick a signal channel such as CKP, CMP, CAN Bus, Injector, or Ignition, then adjust the timebase and voltage scale to inspect the pulse train. Keep Bench PSU and RPM Emulator enabled for live dynamic traces.',
    whatsInsideTL:
      'Nandito po sa Oscilloscope ang Multi-Channel Lab Scope, Per-Pin Waveform Scope, Binary Logic Monitor, at D3 Scope para sa CKP/CMP missing-tooth, CAN_H/CAN_L mirror signals, PWM, at Injector pulse width.',
    whatsInsideEN:
      'Inside the Oscilloscope tab you have the Multi-Channel Lab Scope, Per-Pin Waveform Scope, Binary Logic State Decoder, and D3 Precision Scope covering CKP/CMP missing-tooth patterns, CAN_H/CAN_L symmetry, PWM, and Injector pulse width.',
    whatsInsideAltTL:
      'Makikita niyo po agad dito ang duty cycle, frequency, amplitude, at warnings kung nawawala ang CKP pulse o nagkaproblema ang CAN signal.',
    whatsInsideAltEN:
      'It displays live duty cycle, frequency, amplitude, and anomaly flags whenever CKP sync drops out or CAN differential symmetry breaks.',
    whatsInsideBulletsTL: [
      'Multi-Channel Oscilloscope para sa CKP, CMP, CAN_H/CAN_L, Injector, Ignition at PWM',
      'Per-Pin Waveform Scope at Binary Logic State Monitor (HIGH/LOW/PWM/CAN decoding)',
      'Configurable timebase, trigger, noise, at missing-tooth signal simulation',
      'Malinaw na pagkakaiba ng calculated circuit behavior at generated demo waveforms',
    ],
    whatsInsideBulletsEN: [
      'Multi-Channel Scope for CKP, CMP, CAN_H/CAN_L, Injector, Ignition & PWM signals',
      'Per-Pin Waveform Scope & Binary Logic State Decoder (HIGH/LOW/PWM/CAN)',
      'Adjustable timebase, trigger, noise, and missing-tooth waveform controls',
      'Clear separation between live MNA circuit voltages and synthesized demo waveforms',
    ],
    safetyTipTL:
      'Huwag gagamit ng 12V incandescent test light sa CKP, CMP, o CAN bus pins — laging high-impedance DMM o Oscilloscope probe lang.',
    safetyTipEN:
      'Never probe CKP, CMP, or CAN lines with a 12V incandescent test light — use only a high-impedance DMM or Oscilloscope.',
    followUpChipsTL: [
      'Anong meron doon?',
      'Buksan ang Oscilloscope',
      'Paano i-test ang CAN bus?',
      'Paano i-test ang CKP?',
    ],
    followUpChipsEN: [
      "What's inside there?",
      'Open Oscilloscope',
      'How to test CAN bus?',
      'How to test CKP?',
    ],
  },
  {
    id: 'sys-pcb-scanner',
    tabTarget: 'PCB_SCANNER',
    actionLabelTL: 'Buksan ang PCB Scanner',
    actionLabelEN: 'Open PCB Scanner',
    titleTL: 'Schematic & ECU PCB Diagnostic Scanner',
    titleEN: 'Schematic & ECU PCB Diagnostic Scanner',
    aliases: [
      'pcb',
      'pcb scanner',
      'board scanner',
      'scanner',
      'circuit board',
      'ecu board',
      'mosfet',
      'ldo',
      'regulator',
    ],
    howToUseTL:
      'Dito sa PCB Scanner tab po, pumili lang ng sample ECU board o mag-upload ng malinaw na photo ng ECU PCB para ma-inspect natin ang MOSFETs, 5V/3.3V regulators, TVS diodes, at shunts. Paalala lang po: visual guide ito kaya kailangan pa ring i-test sa DMM.',
    howToUseEN:
      'In the PCB Scanner tab, load a sample ECU board or upload a clear ECU PCB photo to inspect MOSFET drivers, 5V/3.3V LDO regulators, TVS diodes, and shunts. Treat visual markings as inspection leads and always confirm continuity physically with a DMM.',
    whatsInsideTL:
      'Nandoon po sa PCB Scanner ang sample ECU board overlays, component hotspots para sa MOSFETs, diodes, LDO regulators, capacitors, at track/solder defect checklists na may confidence scores.',
    whatsInsideEN:
      'Inside the PCB Scanner you will find sample ECU board layouts, component hotspot inspection for MOSFETs, TVS diodes, LDO regulators, capacitors, and solder/trace defect checklists with confidence scores.',
    whatsInsideAltTL:
      'Tinutulungan tayo nito na makita agad kung nasaan ang power section, injector/coil driver ICs, at TVS diodes sa PCB bago ka mag-cold diode-drop test.',
    whatsInsideAltEN:
      'It helps you locate power management rails, injector/ignition driver ICs, and TVS protection diodes quickly before performing cold diode-drop checks.',
    whatsInsideBulletsTL: [
      'ECU PCB photo upload & built-in sample ECU boards para sa training',
      'Component classification: MOSFETs, LDO regulators, TVS diodes, resistors, capacitors, shunts',
      'Coordinate hotspots, confidence scores, at technician verification checklist',
      'Strict safety rule: huwag i-assume ang electrical continuity mula sa photo lang',
    ],
    whatsInsideBulletsEN: [
      'ECU PCB image upload & built-in sample boards for structured inspection',
      'Component tagging: MOSFETs, LDO regulators, TVS diodes, resistors, capacitors, shunts',
      'Original image coordinate hotspots, confidence scores & manual technician sign-off',
      'Safety rule: never infer electrical continuity from visual appearance alone',
    ],
    safetyTipTL:
      'Huwag mag-assume na walang short base lang sa itsura ng PCB — laging gumamit ng DMM diode/ohms test habang walang kuryente ang board.',
    safetyTipEN:
      'Never assume a board has no short from visual appearance alone — always confirm with a power-OFF DMM ohms or diode check.',
    followUpChipsTL: [
      'Anong meron doon?',
      'Buksan ang PCB Scanner',
      'Paano gamitin ang 3D twin?',
      'Paano gamitin ang Repair Manuals?',
    ],
    followUpChipsEN: [
      "What's inside there?",
      'Open PCB Scanner',
      'How to use 3D twin?',
      'How to use Repair Manuals?',
    ],
  },
  {
    id: 'sys-repair-guide',
    tabTarget: 'REPAIR_GUIDE',
    actionLabelTL: 'Buksan ang Repair Manuals',
    actionLabelEN: 'Open Repair Manuals',
    titleTL: 'ECU Repair Manuals & Trouble Scenarios Database',
    titleEN: 'ECU Repair Manuals & Trouble Scenarios Database',
    aliases: [
      'repair guide',
      'repair manual',
      'repair manuals',
      'manuals',
      'manual',
      'knowledge base',
      'trouble scenario',
      'trouble scenarios',
      'dtc guide',
    ],
    howToUseTL:
      'Sa Repair Manuals tab po, mag-search ng DTC code, sensor, o sintomas para makita ang step-by-step troubleshooting checklist at safety gates. Pwede mo ring buksan ang Trouble Scenarios lookup para sa 2,080 Philippine automotive repair scenarios.',
    howToUseEN:
      'In the Repair Manuals tab, search any DTC code, sensor, or symptom to follow structured troubleshooting checklists and safety gates. You can also search the 2,080 Philippine automotive trouble scenarios catalog.',
    whatsInsideTL:
      'Nandoon po ang ECU Repair Knowledge Base, step-by-step diagnostic workflows mula power/ground hanggang waveform check, at 2,080 Philippine Trouble Scenarios sa 48 automotive domains tulad ng CRDi diesel, flood/ground faults, at CAN bus.',
    whatsInsideEN:
      'Inside Repair Manuals you have the ECU Repair Knowledge Base, step-by-step power/ground-to-waveform workflows, and 2,080 Philippine Trouble Scenarios spanning 48 domains including CRDi diesel, flood/ground faults, and CAN bus.',
    whatsInsideAltTL:
      'May malinaw na verification tags po doon para alam mo kung alin ang OEM-verified procedure at alin ang generic workshop reference.',
    whatsInsideAltEN:
      'Every guide clearly labels provenance so you always know what is verified versus generic workshop guidance.',
    whatsInsideBulletsTL: [
      'Traceable diagnostic workflow: Power/Ground -> 5V VREF -> Sensor/Signal -> Fault Isolation',
      '2,080 Philippine Trouble Scenarios (No Start, No Pulse, VREF, CAN/UDS, Flood Grounds, CRDi 24V)',
      'DTC quick lookup (P0122, P0123, P0117, P0118, P0335, U0001, atbp.)',
      'Malinaw na provenance at electrical safety checklist bago mag-live test',
    ],
    whatsInsideBulletsEN: [
      'Traceable workflow: Power/Ground -> 5V VREF -> Sensor/Signal -> Fault Isolation',
      '2,080 Philippine Trouble Scenarios (No Start, No Pulse, VREF, CAN/UDS, Flood Grounds, CRDi)',
      'Fast DTC lookup (P0122, P0123, P0117, P0118, P0335, U0001, and more)',
      'Explicit provenance labels and electrical safety checks before live testing',
    ],
    safetyTipTL:
      'Unahin palagi ang KL30, KL15, KL31 ground, at 5V VREF verification bago magpalit ng kahit anong sensor o ECU.',
    safetyTipEN:
      'Always verify KL30, KL15, KL31 grounds, and 5V VREF before replacing any sensor or ECU.',
    followUpChipsTL: [
      'Anong meron doon?',
      'Buksan ang Repair Manuals',
      'Ano ibig sabihin ng P0122?',
      'Paano gamitin ang Academy Lab?',
    ],
    followUpChipsEN: [
      "What's inside there?",
      'Open Repair Manuals',
      'What does P0122 mean?',
      'How to use Academy Lab?',
    ],
  },
  {
    id: 'sys-academy-lab',
    modalTarget: 'ACADEMY_LAB',
    actionLabelTL: 'Buksan ang Academy Lab',
    actionLabelEN: 'Open Academy Lab',
    titleTL: 'University Automotive Lab (3-Tier Curriculum & Exam PDF)',
    titleEN: 'University Automotive Lab (3-Tier Curriculum & Exam PDF)',
    aliases: [
      'academy',
      'academy lab',
      'university',
      'curriculum',
      'training',
      'exam',
      'exercise',
      'exercises',
      'student lab',
    ],
    howToUseTL:
      'Sa Academy Lab po, pumili ng module sa Beginner, Intermediate, o Advanced tier, tapos i-click ang Start Lab Exercise. Sundin ang bawat guided step sa live bench — automatic na mag-PASS o FAIL ang tolerance evaluator at pwede kang mag-export ng SHA-256 verified exam PDF.',
    howToUseEN:
      'In Academy Lab, pick a module from the Beginner, Intermediate, or Advanced tier and click Start Lab Exercise. Complete each guided step on the live bench so the tolerance evaluator grades live MNA readings and unlocks the SHA-256 verified exam PDF.',
    whatsInsideTL:
      'May 12 structured lab modules po sa Academy Lab sa 3 difficulty tiers, live anti-cheating tolerance evaluator na naka-lock sa MNA simulator, Cold PSU-OFF safety gate, SHA-256 PDF exam exporter, at Instructor QR Verifier.',
    whatsInsideEN:
      'Academy Lab includes 12 structured exercises across 3 skill tiers, an anti-cheating live MNA tolerance evaluator, Cold PSU-OFF safety gates, a SHA-256 PDF exam exporter, and an Instructor QR Verifier.',
    whatsInsideAltTL:
      'Kasama po doon ang Level 1 PSU Safety at P0122 TPS test, Level 2 CKP/CMP waveforms at 60-ohm CAN Bus test, at Level 3 ECU 5V LDO short at cold diode-drop diagnostics.',
    whatsInsideAltEN:
      'It covers Level 1 PSU Safety and P0122 TPS testing, Level 2 CKP/CMP waveforms and 60-ohm CAN Bus tests, and Level 3 ECU 5V LDO shorts and cold diode-drop diagnostics.',
    whatsInsideBulletsTL: [
      '3-Tier Curriculum (12 Modules): Beginner, Intermediate, at Advanced automotive lab exercises',
      'Anti-Cheating Live Tolerance Evaluator (read-only MNA readings, walang manual edit)',
      'Cold-Check Safety Gate: bawal mag-Ohms kapag naka-ON ang Bench PSU',
      'SHA-256 Cryptographic Exam PDF + Instructor QR & Hash Verifier',
    ],
    whatsInsideBulletsEN: [
      '3-Tier Curriculum (12 Modules): Beginner, Intermediate & Advanced lab exercises',
      'Anti-Cheating Live Tolerance Evaluator reading directly from MNA telemetry',
      'Cold-Check Safety Gate blocking resistance steps while Bench PSU is energized',
      'SHA-256 Cryptographic Exam PDF & Instructor QR/Hash Verification page',
    ],
    safetyTipTL:
      'Sa bawat lab exercise, laging unahin ang Cold Resistance check (PSU OFF) bago mag-Live Voltage test (PSU ON).',
    safetyTipEN:
      'In every lab exercise, complete Cold Resistance checks (PSU OFF) before Live Voltage tests (PSU ON).',
    followUpChipsTL: [
      'Anong meron doon?',
      'Buksan ang Academy Lab',
      'Saan itutusok ang red probe?',
      'Ilan ang expected reading?',
    ],
    followUpChipsEN: [
      "What's inside there?",
      'Open Academy Lab',
      'Where does the red probe go?',
      'What is the expected reading?',
    ],
  },
  {
    id: 'sys-report-studio',
    modalTarget: 'REPORT_STUDIO',
    actionLabelTL: 'Buksan ang Report Studio',
    actionLabelEN: 'Open Report Studio',
    titleTL: 'Diagnostic Report Studio (Signed A4 PDF)',
    titleEN: 'Diagnostic Report Studio (Signed A4 PDF)',
    aliases: [
      'report',
      'report studio',
      'diagnostic report',
      'print to pdf',
      'pdf',
      'client report',
      'certificate',
      'export pdf',
    ],
    howToUseTL:
      'Sa Diagnostic Report Studio po, ilagay ang pangalan ng client, work order number, sasakyan, at technician notes, tapos pindutin ang Print to PDF (Signed A4). Automatic itong gagawa ng A4 report na may live measurements, fault logs, vector pinout diagram, at SHA-256 QR seal.',
    howToUseEN:
      'In the Diagnostic Report Studio, fill in the client name, work order number, vehicle reference, and technician notes, then click Print to PDF (Signed A4). It generates an A4 PDF with bench measurements, fault logs, a vector pinout diagram, and a SHA-256 QR seal.',
    whatsInsideTL:
      'Nandito po sa Report Studio ang Client Record metadata form, live PSU at DMM summary, kumpletong 16-pin voltage table, active faults at DTC logs, vector ECU connector pinout diagram, at Cryptographic SHA-256 QR authenticity seal.',
    whatsInsideEN:
      'Inside the Report Studio you get client/work-order metadata fields, live PSU and DMM snapshots, full pin voltage tables, fault/DTC logs, a vector ECU connector diagram, and a verifiable SHA-256 QR seal.',
    whatsInsideAltTL:
      'May malinaw na label din po sa A4 PDF na simulated MNA bench telemetry ang mga numero para propesyonal at tapat ang record ng shop.',
    whatsInsideAltEN:
      'Every exported A4 PDF also prints an explicit simulated-telemetry provenance banner and self-verifies its SHA-256 signature immediately.',
    whatsInsideBulletsTL: [
      'One-click Print to PDF (Signed A4) na may offline SHA-256 signature at QR code',
      'Vector ECU Connector Pinout Diagram na may fault highlights at live terminal voltages',
      'Kumpletong Bench Measurements (PSU, DMM, 16 ECU Pins) at Fault / DTC Logs',
      'Explicit provenance notice na malinaw ang pagkakaiba ng simulated vs physical readings',
    ],
    whatsInsideBulletsEN: [
      'One-click Print to PDF (Signed A4) with offline SHA-256 digest & scannable QR seal',
      'Vector ECU Connector Pinout Diagram with fault highlights & terminal voltages',
      'Complete Bench Measurements (PSU, DMM, 16 ECU Pins) & Fault / DTC Logs',
      'Clear provenance notice separating simulated MNA bench telemetry from physical tests',
    ],
    safetyTipTL:
      'Siguraduhing kumpleto muna ang test readings at technician notes bago i-generate ang signed A4 PDF.',
    safetyTipEN:
      'Confirm all bench measurements and technician notes are captured before signing the A4 PDF.',
    followUpChipsTL: [
      'Anong meron doon?',
      'Buksan ang Report Studio',
      'Ano status ng bench?',
      'Paano gamitin ang BenchLab?',
    ],
    followUpChipsEN: [
      "What's inside there?",
      'Open Report Studio',
      'What is the bench status?',
      'How to use BenchLab?',
    ],
  },
  {
    id: 'sys-instruments',
    tabTarget: 'BENCH_LAB',
    actionLabelTL: 'Punta sa Instruments (Bench Lab)',
    actionLabelEN: 'Go to Instruments (Bench Lab)',
    titleTL: 'Bench Power Supply (PSU) & Digital Multimeter (DMM)',
    titleEN: 'Bench Power Supply (PSU) & Digital Multimeter (DMM)',
    aliases: [
      'power supply',
      'psu',
      'multimeter',
      'dmm',
      'tester',
      'instruments',
      'ocp',
      'current limit',
    ],
    howToUseTL:
      'Para sa ligtas na paggamit ng PSU at Multimeter: i-OFF muna ang PSU kapag magsu-sukat ng OHMS o Continuity, at i-set sa 12.6V with 1.5A to 2.0A limit kapag mag-ON para sa V_DC test. Black probe muna sa KL31 ground, saka Red probe sa target pin.',
    howToUseEN:
      'For safe PSU and DMM use: keep PSU OFF for OHMS or Continuity checks, then set 12.6V with a 1.5A to 2.0A current limit when enabling power for V_DC tests. Connect Black COM probe to KL31 ground first, then probe with Red.',
    whatsInsideTL:
      'Ang PSU ay may voltage dial, current limit protection, at automatic OCP trip kapag may short. Ang DMM naman ay may V_DC, OHMS, CONTINUITY, at DIODE modes na may live safety lockout warning kapag mali ang mode.',
    whatsInsideEN:
      'The PSU includes adjustable voltage, current limiting, and automatic OCP trip on shorts. The DMM supports V_DC, OHMS, CONTINUITY, and DIODE modes with live safety lockout warnings.',
    whatsInsideAltTL:
      'Kapag nag-OCP trip ang PSU, i-OFF agad ang output at hanapin muna ang short-to-ground sa Wiring Canvas o Fault Matrix — huwag kailanman tataasan ang amps para pilitin ito.',
    whatsInsideAltEN:
      'If the PSU trips OCP, turn output OFF immediately and isolate the short-to-ground on the Wiring Canvas or Fault Matrix instead of raising the current limit.',
    whatsInsideBulletsTL: [
      'PSU: 12.6V nominal bench bring-up, 1.5A–2.0A current limit, automatic OCP Trip',
      'DMM V_DC Mode (PSU ON): KL30 ~12.6V, VREF_5V ~5.00V, Sensor signals 0.5V–4.5V',
      'DMM OHMS / CONTINUITY (PSU OFF ONLY): KL31 ground < 1Ω, CAN Bus ~60Ω',
      'Safety Lockout kapag sinubukang mag-OHMS sa energized circuit',
    ],
    whatsInsideBulletsEN: [
      'PSU: 12.6V nominal bring-up, 1.5A–2.0A current limit, automatic OCP Trip',
      'DMM V_DC Mode (PSU ON): KL30 ~12.6V, VREF_5V ~5.00V, Sensor signals 0.5V–4.5V',
      'DMM OHMS / CONTINUITY (PSU OFF ONLY): KL31 ground < 1Ω, CAN Bus ~60Ω',
      'Safety Lockout alert if OHMS mode is attempted on a live energized circuit',
    ],
    safetyTipTL:
      'KRITIKAL: Huwag tataasan ang Amps limit kapag nag-OCP Trip, at huwag mag-OHMS habang naka-ON ang Power Supply.',
    safetyTipEN:
      'CRITICAL: Never raise the current limit to bypass an OCP Trip, and never measure OHMS while PSU is energized.',
    followUpChipsTL: [
      'Ano status ng bench?',
      'Anong meron doon?',
      'Paano gamitin ang Oscilloscope?',
      'Buksan ang Bench Lab',
    ],
    followUpChipsEN: [
      'What is the bench status?',
      "What's inside there?",
      'How to use Oscilloscope?',
      'Open Bench Lab',
    ],
  },
  {
    id: 'sys-overview',
    tabTarget: 'BENCH_LAB',
    actionLabelTL: 'Buksan ang Bench Lab',
    actionLabelEN: 'Open Bench Lab',
    titleTL: 'AutoElectric Lab Pro — Buong System Overview',
    titleEN: 'AutoElectric Lab Pro — Full System Overview',
    aliases: [
      'autoelectric',
      'virtual ecu lab',
      'buong system',
      'whole system',
      'ano ang system',
      'anong meron sa system',
      'anong meron dito',
      'features',
      'paano magsimula',
      'paano mag start',
      'tulungan mo ako',
      'ano kaya mong gawin',
      'what can you do',
    ],
    howToUseTL:
      'Sige po, ang AutoElectric Lab Pro ay kumpletong ECU bench simulator at diagnostic workstation. Magsimula po tayo sa Bench Lab para sa live voltage at fault checks, tapos pwede ring mag-open ng ECU Pinouts, 3D Bench Twin, Oscilloscope, PCB Scanner, Repair Manuals, Academy Lab, o Signed A4 PDF Report Studio.',
    howToUseEN:
      'AutoElectric Lab Pro is an end-to-end ECU bench simulation and diagnostic workstation. Start in Bench Lab for live voltage and fault testing, then switch anytime to ECU Pinouts, 3D Bench Twin, Oscilloscope, PCB Scanner, Repair Manuals, Academy Lab, or the Signed A4 Report Studio.',
    whatsInsideTL:
      'May 7 workspace tabs po tayo dito: Bench Lab, Harness Wiring, 3D Bench Twin, ECU Pinouts, Oscilloscope, PCB Scanner, at Repair Manuals — plus 3-Tier Academy Lab, 2,080 PH Trouble Scenarios, at Signed A4 PDF Report Studio.',
    whatsInsideEN:
      'The platform features 7 core workspaces: Bench Lab, Harness Wiring, 3D Bench Twin, ECU Pinouts, Oscilloscope, PCB Scanner, and Repair Manuals — plus the 3-Tier Academy Lab, 2,080 PH Trouble Scenarios, and Signed A4 PDF Report Studio.',
    whatsInsideAltTL:
      'Pwede po kayong magtanong sa akin ng "Paano gamitin ang BenchLab?", "Ano reading ngayon?", "Ok ba \'to?", o utusan ako ng "Buksan ang 3D twin" at "Buksan ang Pinouts".',
    whatsInsideAltEN:
      'You can ask me "How to use BenchLab?", "How to use pinouts?", "How to use 3D twin?", "What is the bench status?", or say "Open 3D twin" and "Open Pinouts" to jump right there.',
    whatsInsideBulletsTL: [
      'Bench Lab & Harness Wiring: Live MNA circuit solver, PSU, DMM, Fault Matrix & Gauges',
      'ECU Pinouts & 3D Bench Twin: Connector maps, OEM profiles & interactive 3D PBR ECU',
      'Oscilloscope & PCB Scanner: CKP/CMP/CAN waveforms & ECU board component inspection',
      'Repair Manuals, Academy Lab & Signed A4 PDF Studio: 2,080 PH scenarios & SHA-256 reports',
    ],
    whatsInsideBulletsEN: [
      'Bench Lab & Harness Wiring: Live MNA circuit solver, PSU, DMM, Fault Matrix & Gauges',
      'ECU Pinouts & 3D Bench Twin: Connector maps, OEM profiles & interactive 3D PBR ECU',
      'Oscilloscope & PCB Scanner: CKP/CMP/CAN waveforms & ECU board component inspection',
      'Repair Manuals, Academy Lab & Signed A4 PDF Studio: 2,080 PH scenarios & SHA-256 reports',
    ],
    safetyTipTL:
      'Paalala lang po: Simulated MNA Bench Telemetry lahat ng readings dito — i-check pa rin ang totoong sasakyan gamit ang OEM data.',
    safetyTipEN:
      'All simulator readings are clearly marked as Simulated MNA Bench Telemetry — always confirm real vehicles against OEM documentation.',
    followUpChipsTL: [
      'Paano gamitin ang BenchLab?',
      'Ano reading ngayon?',
      "Ok ba 'to?",
      'Paano gamitin ang 3D twin?',
    ],
    followUpChipsEN: [
      'How to use BenchLab?',
      'How to use pinouts?',
      'How to use 3D twin?',
      'What is the bench status?',
    ],
  },
];

export function getSystemTopicById(id: string | null | undefined): SystemVoiceModuleTopic | null {
  if (!id) return null;
  return SYSTEM_VOICE_KNOWLEDGE_TOPICS.find((t) => t.id === id) || null;
}

export function getSystemTopicByTab(tab: LabTab | undefined): SystemVoiceModuleTopic {
  if (tab) {
    const found = SYSTEM_VOICE_KNOWLEDGE_TOPICS.find((t) => t.tabTarget === tab);
    if (found) return found;
  }
  return SYSTEM_VOICE_KNOWLEDGE_TOPICS[0];
}

export function matchSystemModuleTopic(rawQuery: string): {
  topic: SystemVoiceModuleTopic;
  score: number;
} | null {
  const q = rawQuery.toLowerCase().replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return null;

  let best: { topic: SystemVoiceModuleTopic; score: number } | null = null;

  for (const topic of SYSTEM_VOICE_KNOWLEDGE_TOPICS) {
    let topicBest = 0;
    for (const alias of topic.aliases) {
      const a = alias.toLowerCase();
      // Prefer whole-phrase / word-boundary matches over short substring accidents
      const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const boundaryRegex = new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`, 'i');
      if (boundaryRegex.test(q)) {
        // Longer multi-word aliases score higher (e.g. "3d twin" > "twin", "bench lab" > "lab")
        const candidateScore = a.includes(' ') ? 0.96 : a.length >= 6 ? 0.93 : 0.88;
        if (candidateScore > topicBest) topicBest = candidateScore;
      } else if (a.length >= 5 && q.includes(a)) {
        const candidateScore = 0.87;
        if (candidateScore > topicBest) topicBest = candidateScore;
      }
    }

    if (topicBest > 0 && (!best || topicBest > best.score)) {
      best = { topic, score: topicBest };
    }
  }

  return best;
}
