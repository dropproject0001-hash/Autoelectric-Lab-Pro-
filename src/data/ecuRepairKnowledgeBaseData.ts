/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

export interface RepairArticle {
  id: string;
  dtcCode: string;
  title: string;
  vehicleModel: string;
  category: 'NISSAN_HITACHI' | 'MAGNETI_MARELLI' | 'TOYOTA_DENSO' | 'BOSCH_FORD' | 'MITSUBISHI_MELCO';
  symptoms: string[];
  rootCauses: { cause: string; description: string; severity: 'CRITICAL' | 'MODERATE' | 'WARNING' }[];
  hardwareNote?: string;
  cpuArchitecture?: string;
  images?: { url: string; caption: string }[];
  repairSteps: { stepNum: number; action: string; specification: string }[];
}

export const REPAIR_KNOWLEDGE_BASE: RepairArticle[] = [
  // 1. Nissan Hitachi MEC11-251 / MEC22-251 Bench Testing & K-Line Diagnostic Guide
  {
    id: 'art-nissan-mec11-bench',
    dtcCode: 'MEC11 / MEC22',
    title: 'Nissan Sentra/Almera N16 (Hitachi MEC11-251 / MEC22-251) - Pure K-Line Bench Diagnostic & Wakeup Manual',
    vehicleModel: 'Nissan Sentra N16 (Exalta / GX / GS), Almera N16, Sunny (QG16DE Engine / Hitachi MEC11-251 & MEC22-251 ECM)',
    category: 'NISSAN_HITACHI',
    symptoms: [
      'ECU bench wake-up fails to communicate with Ancel V7 HD or CONSULT-II scanner when technician erroneously hooks CAN lines instead of K-Line',
      'Engine crank but no start; fuel pump relay does not prime and no injector pulse output',
      'No diagnostic communication on OBD-II Pin 7 when Pin 88 or Pin 85 is not wired or Pin 36 toggle is open',
      'Confusion between internal TCU CAN bus (Pins 86 & 94) and diagnostic serial communication',
      'Internal main relay logic not latching during bench power-up',
    ],
    rootCauses: [
      {
        cause: 'Connecting Scan Tool to Pins 86 & 94 (TCU CAN) instead of Pin 88 (K-Line)',
        description: 'CRITICAL ARCHITECTURE FACT: Hitachi MEC11-251 and MEC22-251 ECMs communicate strictly via ISO-9141 K-Line on Pin 88 (or Pin 85) to OBD2 Pin 7. Pins 86 & 94 are dedicated inter-module lines exclusively to the Automatic Transmission Control Unit (TCU on automatic models) and will NEVER respond to diagnostic OBD2 scan tools.',
        severity: 'CRITICAL',
      },
      {
        cause: 'Missing Constant Battery (+12V) on Pin 67 (or Pin 121)',
        description: 'Microcontroller SRAM memory and internal supervisory circuits remain unpowered without permanent fused +12V battery power.',
        severity: 'CRITICAL',
      },
      {
        cause: 'Ignition Wake-Up Toggle (Pin 36 / Pin 109) Not Energized',
        description: 'Switched ignition input is required to trigger the internal EGI relay ground driver on Pin 111 and wake the CPU.',
        severity: 'CRITICAL',
      },
      {
        cause: 'Floating Ground or High-Resistance OBD2 Negative Return',
        description: 'OBD2 socket Pins 4 & 5 must be solidly bonded to ECU ground pins (Pins 48, 1, 57, 115, 116).',
        severity: 'MODERATE',
      },
      {
        cause: 'Missing 5A/10A Inline Fuse Protection',
        description: 'Direct car battery connections without inline fuse can destroy PCB traces if adjacent pins touch.',
        severity: 'WARNING',
      },
    ],
    hardwareNote: 'Hitachi MEC11-251 / MEC22-251 121-pin ECU connector is split into three horizontal rows. BENCH TEST HARNESS: Pin 67 (or 121) to +12V Constant, Pin 36 (or 109) to +12V Ignition switch toggle, Pin 48 (or 1/57) to Ground & OBD2 Pins 4/5, Pin 88 (or 85) to OBD2 Pin 7 (Pure ISO-9141 K-Line). ⚠️ LEAVE PINS 86 & 94 DISCONNECTED: They are dedicated internal TCU CAN lines, NOT diagnostic CAN!',
    cpuArchitecture: 'Hitachi Renesas SH705x Automotive Microcontroller with on-chip flash, ISO-9141 K-Line UART transceiver for all diagnostic sessions (OBD2 Pin 7), and dedicated TCU inter-module bus.',
    repairSteps: [
      { stepNum: 1, action: 'Connect Constant +12V Fused Power (+B)', specification: 'Connect ECU Pin 67 (or Pin 121) to battery positive (+) via 5A or 10A inline fuse' },
      { stepNum: 2, action: 'Connect Main Chassis & Diagnostic Ground', specification: 'Bond ECU Pin 48 (or Pin 1, Pin 57, Pin 115/116) to Battery (-) and OBD2 Socket Pins 4 & 5' },
      { stepNum: 3, action: 'Route Pure K-Line Diagnostic Lead to OBD2 Pin 7', specification: 'Connect ECU Pin 88 (or Pin 85) directly to OBD2 Socket Pin 7. Do NOT connect CAN Pins 6 & 14!' },
      { stepNum: 4, action: 'Apply Switched Ignition (+12V) via Toggle Switch', specification: 'Switch +12V into Pin 36 (or Pin 109) to trigger processor wake-up and internal EGI relay latching' },
      { stepNum: 5, action: 'Initiate Diagnostic Scanner Session over K-Line', specification: 'Plug Ancel V7 HD / scanner into OBD2 socket (Pins 4, 5, 7, 16); select Nissan -> Manual Diagnosis -> Sentra/Almera/Sunny (N16 Engine Controls via ISO-9141)' },
    ],
  },

  // 2. Nissan Hitachi MEC22-251 Physical Harness Socket Cavity Mapping & Multilayer PCB Component Topology
  {
    id: 'art-nissan-mec22-pcb-socket',
    dtcCode: 'MEC22-MAP',
    title: 'Nissan Hitachi MEC22-251 - Physical Socket Cavity Mapping & Internal PCB Component Topology Manual',
    vehicleModel: 'Nissan Sentra N16, Almera N16, Sunny (Hitachi MEC22-251 ECM / QG16DE 1.6L)',
    category: 'NISSAN_HITACHI',
    images: [
      {
        url: '/assets/images/IMG_20261031_102222_185ec4db.jpg',
        caption: 'Physical 121-Pin Receptacle: Dual-Chamber Grey Connector (Chamber A: 81 Pins with Green Power Terminal Retainers; Chamber B: 40 Pins including K-Line Pin 88)'
      },
      {
        url: '/assets/images/IMG_20261031_100429_ce48661e.jpg',
        caption: 'MEC22-251 Internal Multilayer PCB: R701-R703 (0.028Ω Current Sense Shunts), R704 (82Ω Pulldown), C844-C879 Filter Bank, Clamping Diodes D301-D302, & Solder Array'
      }
    ],
    symptoms: [
      'P0201 - P0204 Cylinder 1-4 Injector Circuit Malfunction caused by burnt current-sense shunts (R701, R702, R703)',
      'Erratic MAF or Cam/Crank sensor noise and timing jitters caused by dried or cracked SMD filter capacitors (C844 - C879)',
      'No power latch or blown fuse 5A/10A due to reverse polarity breakdown in TVS clamping diodes (D301, D302)',
      'Broken or oxidized harness terminal socket cavities (Chamber A Pin 1, 3, 48, 67 or Chamber B Pin 88)',
      'Main CPU reset under heavy alternator load due to high-resistance chassis ground bond screw connection'
    ],
    rootCauses: [
      {
        cause: 'Overcurrent Burnout of Injector Current Sense Shunts (R701, R702, R703 - Code 028 = 0.028Ω)',
        description: 'Short circuits in fuel injector solenoid coils cause massive current flow through precision current sense SMD resistors R701, R702, and R703 (labeled 028, 0.028Ω). If any shunt resistor goes high resistance or open circuit, the ECM CPU registers injector circuit fault (P0201-P0204) and cuts fuel delivery.',
        severity: 'CRITICAL',
      },
      {
        cause: 'Transient Spike Breakdown of Clamping Protection Diodes D301 & D302',
        description: 'Alternator load dumps or jump-start reverse voltage triggers conduction in high-speed clamping diodes D301 and D302. If they fail shorted to ground, the main +12V EGI relay immediately blows the vehicle 15A fuse.',
        severity: 'CRITICAL',
      },
      {
        cause: 'Degradation of Sensor Decoupling Capacitor Array C844 to C879',
        description: 'High frequency electromagnetic interference from ignition coils is filtered through ceramic surface-mount capacitor bank C844-C879. Micro-cracking causes intermittent signal clipping on Camshaft PHASE (Pin 14) and Crankshaft POS (Pin 13).',
        severity: 'MODERATE',
      },
      {
        cause: 'Corroded or Spread Female Terminal Terminals in Harness Socket',
        description: 'Chamber A green retention inserts secure the heavy-gauge terminals (Pins 1, 3, 48, 67). Drag-testing with a proper male test pin must show at least 1.5N retention force; loosened cavities cause sudden stall on bumps.',
        severity: 'MODERATE',
      },
    ],
    hardwareNote: 'PHYSICAL CONNECTOR TOPOLOGY: Chamber A spans Pins 1 to 81 with green terminal lock clips. Pin 67 is fused +12V battery; Pin 36 is switched ignition; Pins 48/57/1 are power grounds. Chamber B spans Pins 82 to 121: Pin 88 is ISO-9141 K-Line directly wired to OBD-II Pin 7. Pins 86 & 94 connect solely to the TCU.',
    cpuArchitecture: 'Hitachi Renesas Automotive MCU with dedicated injector low-side driver stage, external 0.028Ω shunts (R701-R703), and ISO-9141 serial transceiver for diagnostic protocol handling.',
    repairSteps: [
      { stepNum: 1, action: 'Inspect Shunt Resistors R701, R702, R703 on Internal PCB', specification: 'Measure cold resistance across R701-R703 with precision milliohmmeter. Each shunt must measure 0.028Ω ± 5%. Replace with 1W SMD shunt if discolored or open' },
      { stepNum: 2, action: 'Test Clamping Diodes D301 & D302 in Diode Mode', specification: 'Forward bias: 0.55V - 0.70V drop. Reverse bias: Infinite (O.L.). If reading ~0.00V, remove and replace shorted diode' },
      { stepNum: 3, action: 'Check Sensor Line Decoupling Capacitors (C844 - C879)', specification: 'Measure resistance from sensor lines (Pins 13, 14, 50) to chassis ground. Must exceed 100kΩ with no DC leakage' },
      { stepNum: 4, action: 'Clean and Re-torque Enclosure Ground Bond Screw', specification: 'Ensure star washer bites into bare copper ground ring on PCB for minimal impedance (< 0.05Ω to casing)' },
      { stepNum: 5, action: 'Terminal Drag Test on Socket Cavities (Chamber A & B)', specification: 'Insert Nissan 1.0mm & 2.3mm test pins into Pins 1, 3, 36, 48, 67, and Pin 88. Verify positive mechanical retention force' },
    ],
  },

  // 2. Nissan QG16 ECM Inspection Table & Voltage Specifications (EC-52 to EC-60)
  {
    id: 'art-nissan-qg16-spec',
    dtcCode: 'QG16-TABLE',
    title: 'Nissan QG16DE ECM Terminal Voltage Reference & Sensor Inspection Table (EC-52 to EC-60)',
    vehicleModel: 'Nissan Almera N16, Sentra N16 1.6L (QG16DE Twin Cam 16V Engine)',
    category: 'NISSAN_HITACHI',
    symptoms: [
      'Rough idle, engine hesitation, or stall during sudden acceleration',
      'Electronic Throttle Control motor relay unlatched or position tracking mismatch',
      'Mass Air Flow (MAF) out-of-range voltage causing rich/lean condition',
      'Camshaft (PHASE) / Crankshaft (POS) synchronization fault resulting in extended crank',
    ],
    rootCauses: [
      {
        cause: 'Degraded MAF Sensor Voltage (Pin 50)',
        description: 'Output must be 1.0V-1.7V at warm idle and 1.5V-2.1V at 2500 RPM. Values outside this window trigger fuel trim codes.',
        severity: 'CRITICAL',
      },
      {
        cause: 'Electronic Throttle Motor Relay / Drive Fault (Pins 3, 4, 5)',
        description: 'Pin 3 must receive 11-14V with ignition ON. Pin 4 (Close) and Pin 5 (Open) output 0-14V PWM drive waves.',
        severity: 'CRITICAL',
      },
      {
        cause: 'Ground Loop / Using ECM Ground For Voltage Probing',
        description: 'CAUTION FROM NISSAN MANUAL: Never use ECM ground terminals when probing input/output voltages; doing so damages internal driver transistors.',
        severity: 'CRITICAL',
      },
      {
        cause: 'ECT Coolant Sensor Voltage Drift (Pin 72)',
        description: 'NTC sensor output must read 0-4.8V varying smoothly with temperature (~3.5V cold, ~0.8V at 90°C).',
        severity: 'MODERATE',
      },
    ],
    hardwareNote: 'Reference Data from Nissan Service Manual EC-52 to EC-60. Positional sensors: POS Crankshaft (Pin 13) approx 3.0V AC; PHASE Camshaft (Pin 14) 1.0V-4.0V pulse. Dual TPS tracks: TPS 1 (Pin 49) >0.36V closed / <4.75V WOT; TPS 2 (Pin 68) inverted.',
    cpuArchitecture: 'Hitachi MEC11-251 ECM supporting Nissan CONSULT-II: Work Support, Self-Diagnostic Results, Data Monitor, Active Test, CAN Diagnostic Monitor.',
    repairSteps: [
      { stepNum: 1, action: 'Verify Electronic Throttle Motor Power (Pin 3)', specification: '11V - 14V Battery Voltage with Ignition ON' },
      { stepNum: 2, action: 'Probe Mass Air Flow Sensor Output (Pin 50)', specification: '1.0V - 1.7V at idle; 1.5V - 2.1V at 2500 RPM' },
      { stepNum: 3, action: 'Inspect Crankshaft POS (Pin 13) & Camshaft PHASE (Pin 14)', specification: 'POS: ~3.0V AC waveform; PHASE: 1.0V - 4.0V square pulses' },
      { stepNum: 4, action: 'Measure 5V Regulated Sensor Reference Rails', specification: 'Pin 46 (Refrigerant), Pin 47 (TPS), Pin 65 (Power Steering): Exactly 5.00V ± 0.05V' },
      { stepNum: 5, action: 'Check Fuel Pump Relay Control (Pin 113)', specification: '0V (Ground sink) for 1 second after ignition ON, then returns to 12V until cranking' },
    ],
  },

  // 3. Magneti Marelli IAW 5NF Water Temperature Sensor Failure
  {
    id: 'art-iaw-5nf-water-temp',
    dtcCode: 'IAW-5NF-01',
    title: 'Magneti Marelli IAW 5NF - Water Temperature Sensor & Acceleration Loss Jumper Guide',
    vehicleModel: 'Fiat Stilo 1.8L, Palio, Idea, Punto (Magneti Marelli IAW 5NF.T6 / 5NF.T7)',
    category: 'MAGNETI_MARELLI',
    images: [
      {
        url: '/assets/images/IMG_20261031_102222_185ec4db.jpg',
        caption: 'Diagnostic 1: Jumper from Pin 10 of Injector Driver IC (TLE9135PD) to Connector A Pin 35/36 restoring water temp sensor ground return'
      },
      {
        url: '/assets/images/ecu_connector_socket.jpg',
        caption: 'Component Topology Map of Magneti Marelli IAW 5NF: TLE9135PD (Magenta Arrow) & Connector A 64-pin layout'
      }
    ],
    symptoms: [
      'Dashboard temperature warning light is illuminated continuously',
      'Temperature gauge displays no reading on the instrument cluster',
      'Vehicle experiences total loss of acceleration / throttle pedal response',
    ],
    rootCauses: [
      {
        cause: 'Internal PCB Trace / Driver IC Pin 10 Disconnection',
        description: 'Broken internal substrate trace connecting Injector Driver IC (TLE9135PD) to temperature sensor low-side return.',
        severity: 'CRITICAL',
      },
    ],
    hardwareNote: 'Magneti Marelli IAW 5NF features 64 pins per connector (Connector A & B) with EEPROM SOIC 95160. Injector Driver IC is TLE9135PD (Magenta Arrow).',
    cpuArchitecture: 'Magneti Marelli IAW 5NF (Variants: 5NF.T6 1.8L, 5NF.T7 Flex Fuel, 5NF.TH, 5NF.F3 1.0L/1.3L 16V).',
    repairSteps: [
      { stepNum: 1, action: 'Locate Injector Driver IC (TLE9135PD)', specification: 'Identify Magenta Arrow IC on component topology map' },
      { stepNum: 2, action: 'Install Hardware Jumper Wire', specification: 'Solder jumper wire from Pin 10 of Injector Driver IC (TLE9135PD) to Connector A, Pin 35 or Pin 36 (internally interconnected)' },
      { stepNum: 3, action: 'Verify Temperature Signal Return', specification: 'Confirm dashboard gauge restores normal live temperature reading and throttle response normalizes' },
    ],
  },

  // 4. Magneti Marelli IAW 5NF Lambda Ground Fault
  {
    id: 'art-iaw-5nf-lambda',
    dtcCode: 'IAW-5NF-02',
    title: 'Magneti Marelli IAW 5NF - Lambda Probe (Oxygen Sensor) Ground Fault Repair',
    vehicleModel: 'Fiat Stilo 1.8L, Palio, Punto (Magneti Marelli IAW 5NF)',
    category: 'MAGNETI_MARELLI',
    images: [
      {
        url: '/assets/images/IMG_20261031_102222_185ec4db.jpg',
        caption: 'Diagnostic 2: Sonda não trabalha - Bridge sensor ground directly to Pin 35 / Pin 36 vias along the red arrow pathway'
      }
    ],
    symptoms: [
      'Lambda probe (Oxygen Sensor) is completely inactive / non-functional (Sonda não trabalha)',
      'High fuel consumption, rich exhaust odor, and persistent O2 sensor DTC logged',
    ],
    rootCauses: [
      {
        cause: 'Missing Oxygen Sensor Ground Return Trace',
        description: 'Internal ground trace fracture leading to oxygen sensor heater and signal ground floating.',
        severity: 'MODERATE',
      },
    ],
    hardwareNote: 'Lambda Probe Driver IC located on bottom board section. Ground return must be restored to signal ground plane.',
    repairSteps: [
      { stepNum: 1, action: 'Locate Lambda Driver Circuitry', specification: 'Bottom cyan arrow section on component topology map' },
      { stepNum: 2, action: 'Bridge Ground Connection Directly to Pin 35/36 Vias', specification: 'Connect sensor ground pad directly to Pin 35 / Pin 36 vias following schematic red pathway' },
    ],
  },

  // 5. Magneti Marelli IAW 5NF Electronic Throttle Malfunction & 1R Resistors
  {
    id: 'art-iaw-5nf-throttle',
    dtcCode: 'IAW-5NF-03',
    title: 'Magneti Marelli IAW 5NF - Electronic Throttle Malfunction & 1-Ohm (1R) Resistor Check',
    vehicleModel: 'Fiat Stilo 1.8L, Palio 1.8L (Magneti Marelli IAW 5NF)',
    category: 'MAGNETI_MARELLI',
    images: [
      {
        url: '/assets/images/IMG_20261031_102222_185ec4db.jpg',
        caption: 'Diagnostic 3: Electronic Throttle Driver MC33186DH and 1-Ohm (1R) current sense resistors verification'
      }
    ],
    symptoms: [
      'Electronic throttle body defect / malfunction (Limp mode active)',
      'Accelerator pedal unresponsive with throttle butterfly motor inactive',
    ],
    rootCauses: [
      {
        cause: 'Burnt 1-Ohm (1R) Current Sense Resistors or MC33186DH Failure',
        description: 'Electronic Throttle Controller IC (MC33186DH / 5NNX1) or current sense shunt resistors open-circuit.',
        severity: 'CRITICAL',
      },
    ],
    hardwareNote: 'Throttle Driver IC: MC33186DH (Cyan Arrow). Current sense resistors: Two surface-mount resistors marked 1R0 / 1R.',
    repairSteps: [
      { stepNum: 1, action: 'Measure Resistance on Current Sense Resistors (Yellow Arrow)', specification: 'Use DMM: Both resistors must read exactly 1.0 Ohm (1R). If open or drifting, replace immediately' },
      { stepNum: 2, action: 'Inspect Electronic Throttle Driver IC (MC33186DH)', specification: 'Check for thermal bubbling or short-circuit between H-bridge drive pins' },
      { stepNum: 3, action: 'Replace Defective Components via SMD Rework Station', specification: 'Install genuine 1Ω precision shunt resistors and MC33186DH controller' },
    ],
  },

  // 6. Magneti Marelli IAW 5NF Dead Module & 5V Regulator Trace Fracture
  {
    id: 'art-iaw-5nf-dead',
    dtcCode: 'IAW-5NF-04',
    title: 'Magneti Marelli IAW 5NF - Dead Module & Fuel Pump Relay Failure (5V Regulator Edge Trace)',
    vehicleModel: 'Fiat Stilo / Palio / Idea (Magneti Marelli IAW 5NF)',
    category: 'MAGNETI_MARELLI',
    images: [
      {
        url: '/assets/images/IMG_20261031_102222_185ec4db.jpg',
        caption: 'Diagnostic 4: Micro-jumper across broken edge trace to restore 5V to UE06AB6 regulator and fuel pump relay circuit'
      }
    ],
    symptoms: [
      'Module is completely unresponsive ("Dead Module" / No Communication)',
      'ECU fails to trigger the fuel pump relay at key-on',
      'Missing 5.0V regulated power supply at primary voltage regulator (UE06AB6)',
    ],
    rootCauses: [
      {
        cause: 'Board Edge Trace Fracture (5V Rail Pathway)',
        description: 'Micro-crack on PCB outer edge trace supplying 5V regulated power from UE06AB6 regulator.',
        severity: 'CRITICAL',
      },
    ],
    hardwareNote: '5V Voltage Regulator IC: UE06AB6 (Green Arrow). Edge trace fracture is frequent due to engine bay vibration and thermal cycling.',
    repairSteps: [
      { stepNum: 1, action: 'Trace 5V output line from UE06AB6 regulator to board edge', specification: 'Locate hairline fracture on PCB perimeter trace' },
      { stepNum: 2, action: 'Install micro-jumper across broken perimeter trace', specification: 'Solder fine insulated wire across the fractured trace to bridge 5V rail' },
      { stepNum: 3, action: 'Power Bench Test', specification: 'Confirm 5.00V restores across microcontroller and fuel pump relay latches normally' },
    ],
  },

  // 7. Toyota 1KD/2KD P0093 Fuel Leak & Dual-CPU #2 Fast Flashing
  {
    id: 'art-p0093-toyota-1kd',
    dtcCode: 'P0093',
    title: 'Toyota 1KD/2KD Fuel System Leak / P0093 & Dual-CPU #2 Fast-Flashing Diagnosis',
    vehicleModel: 'Toyota Hilux 1KD-FTV / 2KD-FTV, Fortuner, Innova (2005-2022)',
    category: 'TOYOTA_DENSO',
    images: [
      {
        url: '/assets/images/IMG_20261031_100429_ce48661e.jpg',
        caption: 'Dual-CPU Denso Architecture: CPU #1 (Denso/Toshiba Flash MCU) and CPU #2 (Sub-Processor) with 175822-887* board'
      },
      {
        url: '/assets/images/IMG_20261031_102222_185ec4db.jpg',
        caption: 'Fast-Flashing Engine Light Source: CPU #2 Clock Crystal Oscillator (X-Tal) and dual 22pF load capacitors'
      },
      {
        url: '/assets/images/ecu_connector_socket.jpg',
        caption: 'Diagnostic Trouble Code P0093: 4 Classic Symptoms & ECU Damage Causes in Toyota 1KD/2KD Repair Manual'
      }
    ],
    symptoms: [
      'The Engine light flashes rapidly (CPU #2 fault signal) and engine cannot be started',
      'Engine light is normal; engine starts then stalls after a while and will not restart until left to cool',
      'Rough idle; engine cuts out or stalls on acceleration',
      'Starts then stalls, stalls while driving, cuts out when accelerating to overtake',
    ],
    rootCauses: [
      {
        cause: 'Burnt ECU (Reverse Polarity Damage)',
        description: 'Caused by reversing positive and negative battery connections or jump-starting with reversed polarity.',
        severity: 'CRITICAL',
      },
      {
        cause: 'Electric Welder Spike Damage',
        description: 'Connecting an electric welder to the vehicle chassis without removing both battery terminals.',
        severity: 'CRITICAL',
      },
      {
        cause: 'Shorted Common Rail Injector Solenoid',
        description: 'Solenoid or piezo injector internal short circuit feeding high inductive kickback voltage back into ECU injector driver transistors.',
        severity: 'CRITICAL',
      },
    ],
    hardwareNote: 'Toyota 1KD/2KD ECU utilizes a dual-CPU architecture (CPU #1 and CPU #2). A fast-flashing Check Engine Light points directly to CPU #2 communication or crystal oscillator (X-Tal) failure.',
    cpuArchitecture: 'Dual-CPU System: CPU #1 manages main powertrain fuel delivery & injectors; CPU #2 monitors immobilizer, security, and watchdog safety loops. Fast-flashing = CPU #2 halt.',
    repairSteps: [
      { stepNum: 1, action: 'Inspect Main Power & Ground Terminals (KL30, KL31, IGSW)', specification: '12.6V constant on Pin 4 (+B), 0V solid ground on Pin 1 (E1)' },
      { stepNum: 2, action: 'Check CPU #2 Crystal Oscillator (X-Tal) & Peripheral Capacitors', specification: 'Measure 16MHz / 20MHz clock oscillation with oscilloscope' },
      { stepNum: 3, action: 'Test Injector Solenoid Resistance & Insulation Breakdown', specification: 'Resistance must be 12-16Ω (solenoid) or >10MΩ to ground' },
    ],
  },

  // 8. Bosch ME7.5 C167 Boot Mode Recovery
  {
    id: 'art-bosch-me75-boot',
    dtcCode: 'P0606',
    title: 'Bosch ME7.5 / ME7.1.1 C167 Microcontroller Boot Mode & Recovery Manual',
    vehicleModel: 'Volkswagen Golf 1.8T, Audi A4, VW Beetle, Skoda Octavia (ME7.5)',
    category: 'BOSCH_FORD',
    symptoms: [
      'ECU fails to communicate with VCDS or diagnostic scanner (No K-Line response)',
      'Engine crank but no start with corrupted flash memory or bricked flash session',
      'Constant high-speed radiator cooling fan run when key turned ON',
    ],
    rootCauses: [
      {
        cause: 'Corrupted Flash EEPROM Checksum',
        description: 'Improper tuning write or power drop during writing sequence.',
        severity: 'CRITICAL',
      },
      {
        cause: 'Boot Pin Not Grounded During Boot Sequence',
        description: 'Infineon C167 processor failed to enter internal hardware bootloader mode.',
        severity: 'MODERATE',
      },
    ],
    hardwareNote: 'Requires grounding Pin 65 (Boot pin) through a 1kΩ resistor during initial ECU power-up (KL30 + KL15) to halt internal execution and listen for bootloader commands.',
    cpuArchitecture: 'Infineon C167 / ST10 16-bit Automotive Microcontroller with on-chip bootstrap loader.',
    repairSteps: [
      { stepNum: 1, action: 'Connect bench harness power to Pin 3 (KL30) and Pin 1/2 (KL31)', specification: '12.6V DC Bench Power Supply' },
      { stepNum: 2, action: 'Ground Pin 65 (Boot Pin) via 1kΩ resistor', specification: 'Active LOW during power-up transition' },
      { stepNum: 3, action: 'Apply Switched Ignition (+12V) to Pin 4 (KL15)', specification: 'Wake up ECU micro' },
      { stepNum: 4, action: 'Flash original stock binary via K-Line (Pin 43)', specification: '10.4 kbps ISO 9141 transfer' },
    ],
  },

  // 9. Ford SID208 FEPS Protocol Manual
  {
    id: 'art-ford-sid208',
    dtcCode: 'P0215',
    title: 'Ford Ranger / Everest SID208 PCM Bench Flashing & 18V FEPS Protocol',
    vehicleModel: 'Ford Ranger 2.2L / 3.2L & 2.0L Bi-Turbo, Everest (2012-2023)',
    category: 'BOSCH_FORD',
    symptoms: [
      'Instrument cluster dead, PATS security light flashing rapidly',
      'PCM programming failure during Ford IDS / Forscan module update',
      'High-Speed CAN bus communication timeout (U0100)',
    ],
    rootCauses: [
      {
        cause: 'FEPS Voltage Drop During Programming',
        description: 'Flash Programming Voltage (FEPS Pin B-12) must rise to 18V to enable flash write protection disable.',
        severity: 'CRITICAL',
      },
      {
        cause: 'Corrupted MS-CAN / HS-CAN Gateway Termination',
        description: 'Missing 120Ω terminating resistor on bench network harness.',
        severity: 'WARNING',
      },
    ],
    hardwareNote: 'Ford Visteon SID208 requires a specialized 18V FEPS programming pulse on Plug B Pin 12 to unlock internal flash sectors for writing.',
    cpuArchitecture: 'TriCore Tricore AURIX / Freescale MPC55xx High-Performance Automotive Engine Controller.',
    repairSteps: [
      { stepNum: 1, action: 'Connect Dual HS-CAN (Pin B-20/21) with 120Ω resistor', specification: '500 kbps Powertrain CAN' },
      { stepNum: 2, action: 'Apply 12V permanent power to Pin A-03 (VBAT)', specification: '12.6V constant' },
      { stepNum: 3, action: 'Apply 18V pulse to FEPS Pin B-12 during flash write request', specification: '18.0V Flash Enable Voltage' },
    ],
  },

  // 10. Toyota Denso / Fujitsu Ten OEM ECU & TCM PCB Hardware Layouts & Component Specifications (10 Platforms)
  {
    id: 'art-toyota-denso-pcb-hardware',
    dtcCode: 'TOYOTA-PCB-SPECS',
    title: 'Toyota OEM ECU & TCM PCB Layouts, Component Specifications & Bench Repair Manual (10 PH Platforms)',
    vehicleModel: 'Hilux, Fortuner, Innova, Hiace, Vios, Yaris, Wigo, Avanza, Rush, Corolla Altis (Denso 275922-022, 175822-887, 275236-0011, Fujitsu Ten 211941, Aisin AC60 6AT TCM)',
    category: 'TOYOTA_DENSO',
    symptoms: [
      'No power / No communication with scan tool (+B / IGSW lines dead after reverse polarity jump-start)',
      '5V Sensor Reference (VC) shorted to ground (< 2.0V), triggering multiple DTCs across CKP, CMP, FRP, and TPS',
      'Cylinder misfire or injector stuck open on 1GD/2GD/1KD common-rail diesels',
      'Dual-CPU #2 fast-flashing check engine light on Denso 175822-887 motherboards',
      'Intermittent throttle limp mode on Fujitsu Ten 211941 or Denso 275236 Dual VVT boards',
    ],
    rootCauses: [
      {
        cause: 'Shorted 27V SMB TVS Diode Across +B / E1 (Jump-Start Polarity Reversal)',
        description: 'Directly across the +B and E1 pins near the main white header, a 27V 600W SMB TVS diode protects the ECU. Jump-starting with reversed cables causes it to short dead-to-ground, blowing the vehicle EFI MAIN fuse.',
        severity: 'CRITICAL',
      },
      {
        cause: 'Cracked 10µF / 16V Ceramic MLCC Bypass Capacitor on 5V VC Rail',
        description: 'Located adjacent to the Denso SE627 or SE811 system power LSI. Ceramic micro-fracturing pulls the precision 5.0V sensor reference line down below 2.0V, shutting down all analog sensor feedback simultaneously.',
        severity: 'CRITICAL',
      },
      {
        cause: 'External Injector Driver Unit (EDU 89871-71010) or Trigger Line Failure',
        description: 'Common-rail injectors on 1GD, 2GD, and 1KD engines are driven by an external high-voltage EDU module. ECM generates 5V square-wave IJt#1–#4 triggers and monitors IJf confirmation feedback.',
        severity: 'CRITICAL',
      },
    ],
    hardwareNote: 'Covers 10 verified Toyota platforms: 1GD/2GD (Denso 275922-022, Renesas 76F0085, 16MHz, 93C86, SE811/921, 4× 220µF/35V Low-ESR caps), 1KD/2KD (Denso 175822-887, Dual NEC 76F0038/40, 20MHz, 93C86, SE627, 27V TVS diode), 1TR-FE (Denso 175822-666, SE616 ETC, SE654 octal low-side), Hiace 1GD (Denso 275922-022, SE921, LIN/CAN, 0.015Ω EGR shunt), Vios 1NZ (Fujitsu Ten 211941, MB91F362, BA6285 ETC, 4× 60V/10A FETs), Vios 2NR (Denso 275236, 40V/3A Schottky VVT clamps), Wigo 1KR (Denso 275036, SE627, 470Ω coil filters), Avanza 2NR-VE (Denso 275236, 45V active Zener clamps), Altis 1ZR/2ZR (Denso 275036, 100Ω A/F shunt), and Fortuner/Hilux 6AT TCM (Aisin AC60, SH7058, 0.05Ω shunts).',
    cpuArchitecture: 'Renesas/NEC 76F0085 (32-bit RISC), Dual NEC 76F0038/76F0040, Fujitsu MB91F362, and Renesas SH7058 TCM Controller with on-chip flash & SPI EEPROMs.',
    repairSteps: [
      { stepNum: 1, action: 'Check 27V TVS Diode Continuity', specification: 'Measure resistance between +B (Pins A1/A2 or E5-1/2) and Ground (E1). If 0Ω, unsolder and replace the 27V 600W SMB TVS diode near the header.' },
      { stepNum: 2, action: 'Measure 5V VC Sensor Reference Voltage', specification: 'Measure voltage at VC pin. If < 2.0V, probe the 10µF/16V MLCC capacitors adjacent to Denso SE627 / SE811 for short to ground.' },
      { stepNum: 3, action: 'Oscilloscope Verification of Injector Triggers (IJt#1–#4 & IJf)', specification: 'Verify 5V square-wave pulses from ECM to EDU (89871-71010) and check return IJf confirmation signal.' },
      { stepNum: 4, action: 'Verify Clock Oscillator Stability', specification: 'Probe crystal pins (16.000 MHz / 20.000 MHz) with 10× oscilloscope probe; verify clean sinusoidal oscillation without jitter.' },
    ],
  },

  // 11. Ford Continental / Bosch / FoMoCo OEM PCM & PowerShift TCM PCB Hardware Layouts & Component Specifications (10 Platforms)
  {
    id: 'art-ford-continental-pcb-hardware',
    dtcCode: 'FORD-PCB-SPECS',
    title: 'Ford Continental / Bosch / FoMoCo OEM PCM & PowerShift TCM PCB Layouts & Component Specifications (10 PH Platforms)',
    vehicleModel: 'Ranger T6, Next-Gen Ranger, Everest, EcoSport, Fiesta, Focus, Territory, Explorer, Transit (Continental SID208/SID209/SID212/EMS2211, Bosch MED17, PowerShift 6DCT250 TCM)',
    category: 'BOSCH_FORD',
    symptoms: [
      'Ranger / Everest SID208 engine crank no-start with piezo injector fault codes P0201–P0204 or P062D',
      'PowerShift 6DCT250 TCM loss of communication (U0100) or clutch actuator motor fault codes P0902 / P090C',
      'EcoSport / Fiesta 1.5L cylinder misfire and no ignition pulse on cylinders 1–4 (P0351–P0354)',
      'Focus / EcoSport GDI limp mode with low direct-injection rail pressure',
      'Territory 1.5L EcoBoost turbo electronic wastegate unresponsive with boost under/overboost codes',
    ],
    rootCauses: [
      {
        cause: 'Collapsed 110V–180V DC-DC Piezo Boost Rail on Continental SID208 / SID209',
        description: 'A shorted IRF640 or STD25NF20 high-side MOSFET, open 0.010Ω (R010) 2W current-sense shunt, or damaged toroidal boost inductor collapses the 110V-180V rail, shutting down all four piezo injectors simultaneously.',
        severity: 'CRITICAL',
      },
      {
        cause: 'PowerShift 6DCT250 TCM TC1766 BGA Solder Fatigue & Shorted Motor DPAK MOSFETs',
        description: 'Severe thermal cycling inside the transmission bellhousing causes micro-cracking of BGA solder balls under the Infineon TC1766 MCU, open 0.005Ω (R005) 3W current-sense shunts, or shorted 40V/90A DPAK MOSFETs driving Shift Drum Motors A & B.',
        severity: 'CRITICAL',
      },
      {
        cause: 'Shorted 400V / 18A SOT-223 Ignition IGBT on Continental EMS2211 / EMS2510',
        description: 'A shorted ignition coil primary winding on the engine feeds continuous high current into the PCB, burning the SOT-223 IGBT and blowing the 100Ω gate resistor from the ATIC111 driver IC.',
        severity: 'CRITICAL',
      },
    ],
    hardwareNote: 'Covers 10 verified Ford platforms: Ranger T6 (Continental SID208/209, TC1797 BGA-292, 20MHz, ATIC91, 2× 47µF/250V boost caps, 0.010Ω shunt), Next-Gen Ranger 2.0L EcoBlue (SID212 / MD1CS005, Aurix TC297TP, 20MHz, 40184 LSI, CAN-FD, 28V/1500W TVS), EcoSport 1.5L (EMS2211, TC1738, 20MHz, ATIC111, 4× 400V/18A IGBTs), Focus GDI (Bosch MED17, TC1767, 30682 65V GDI boost, 100µF/100V cap), PowerShift 6DCT250 TCM (TC1766, 20MHz, 8× 40V/90A DPAKs, 2× 0.005Ω 3W shunts), Territory 1.5T (Bosch MED17.8.10, TC1728, 60V/20A wastegate FET), Ranger 2.5L NA (EMS2204, 4× 400V/15A IGBTs), Escape/Focus older gen (Visteon ESU, MPC561, AM29BL802C flash, 95320 EEPROM), Explorer EcoBoost (MEDG17, dual CAN, 61.9Ω 0.1% O2 shunt), and Transit 2.2L TDCi (SID208 / DCU-102, 47µF/250V boost cap).',
    cpuArchitecture: 'Infineon Tricore TC1797, Aurix TC297TP / TC277, TC1738 / TC1782, TC1766, and Motorola / NXP MPC561 32-bit automotive controllers.',
    repairSteps: [
      { stepNum: 1, action: 'Probe SID208 Piezo High-Voltage Boost Stage', specification: 'Check voltage across the 47µF/250V capacitors near the toroidal inductor. Must reach 110V–180V during cranking. Test IRF640 / STD25NF20 FETs and 0.01Ω current shunt.' },
      { stepNum: 2, action: 'Bench Test PowerShift 6DCT250 Clutch Motor H-Bridges', specification: 'Inspect the eight 40V/90A DPAK MOSFETs and 0.005Ω 3W shunts. If U0100 persists with valid 12V/GND, reflow or reball the TC1766 BGA MCU.' },
      { stepNum: 3, action: 'Test EMS2211 SOT-223 Ignition Drivers', specification: 'Check collector-to-emitter continuity on all 4 IGBTs. If shorted (0Ω), replace IGBT (ISL9V3040D3S / STGD18N40LZ) and inspect 100Ω gate resistor.' },
      { stepNum: 4, action: 'Verify 28V 1500W TVS Surge Diode on SID212', specification: 'Inspect entrance diode for shorting if main battery draw exceeds 2.5A at idle power-up.' },
    ],
  },

  // 12. Mitsubishi Denso & Melco OEM ECU PCB Layouts & Component Specifications (10 Platforms)
  {
    id: 'art-mitsubishi-melco-pcb-hardware',
    dtcCode: 'MITSUBISHI-PCB-SPECS',
    title: 'Mitsubishi Denso & Melco OEM ECU PCB Layouts, Component Specifications & Bench Repair Manual (10 PH Platforms)',
    vehicleModel: 'Montero Sport Gen 2/3, Strada, L300 Euro 4, Mirage, Xpander, Adventure, Lancer EX, Pajero BK, Fuso Canter, Jatco CVT-ECU',
    category: 'MITSUBISHI_MELCO',
    symptoms: [
      'Montero / Strada 4D56 / 4M41 injector misfire or high-voltage boost failure (P0201–P0204 / P0628)',
      'Mirage / Xpander Melco E6T79xxx engine no-start or throttle limp mode with P2119 / P0606',
      'Older Adventure / L300 Melco E6T38xxx dead module, no check-engine light or glow plug trigger',
      'Fuso Canter 24V EDC17CP52 high-voltage injector driver bank shutdown',
      'Mitsubishi / Jatco INVECS-III CVT transmission ratio errors or solenoid circuit codes P0746 / P0868',
    ],
    rootCauses: [
      {
        cause: 'Shorted 100V / 30A DPAK Boost MOSFET or Corroded Vias Under 100µF/100V Boost Capacitors',
        description: 'On Denso 1860B556 / 275800-8833 boards, leaking electrolytic fluid from aged 100µF/100V capacitors corrodes adjacent multi-layer circuit vias under the capacitor pads, cutting the 85V injector opening boost pulse.',
        severity: 'CRITICAL',
      },
      {
        cause: 'Cowl Seal Water Intrusion Shorting 5.0V Sensor Reference on Melco E6T79xxx / E6T83xxx',
        description: 'Water draining through defective firewall cowl seals drips onto the ECU connector, causing electrolytic corrosion and dead-shorting the 5V TPS/MAP sensor reference rail to ground.',
        severity: 'CRITICAL',
      },
      {
        cause: 'Aged Leaking Electrolytic Filter Capacitors (100µF/50V & 47µF/35V) on Older Melco Boards',
        description: 'On older Adventure / L300 Melco E6T38xxx modules, alkaline electrolyte seeps onto the PCB, etching power traces around the 5.0V LDO regulator (TA78L05/NJM2396) and keeping the reset line permanently LOW.',
        severity: 'CRITICAL',
      },
    ],
    hardwareNote: 'Covers 10 verified Mitsubishi platforms: Montero 4N15 (Denso 275700-7422, SH72543R, 9× 100-220µF/35V caps, 6× 100V/30A DPAKs), Montero 4D56/4M41 (Denso 1860B556, dual SH7058, 93C86, SE627, 85V boost, 27V TVS), L300 4N14 (Denso 1860D118, SE811, 0.015Ω EGR shunt), Xpander 4A91 (Melco 1860D284, MH8115F, TLE7209-2R ETC, 4× 400V/15A IGBTs), Mirage 3A92 (Melco 1860C298, MH8115F/06F, 3× 400V/15A IGBTs), Adventure (Melco E6T38xxx, MH7203FA, STA509A arrays, 100µF/50V caps), Lancer EX (Melco 1860A867, MH8106F, 4× 400V/18A IGBTs), Pajero BK (Denso 1860A751, 47µH boost inductor), Canter Fuso (Bosch EDC17CP52 / Denso 24V, 36V TVS Zener, 50V caps), and Jatco CVT-ECU (10GOD38S, 6× PWM MOSFETs, 0.05Ω shunts).',
    cpuArchitecture: 'Renesas SH72543R / SH72531, Dual Renesas SH7058 / SH7059, Mitsubishi MH8115F / MH8106F / MH7203FA, and Infineon TC1797 with on-chip flash & SPI EEPROMs.',
    repairSteps: [
      { stepNum: 1, action: 'Probe Denso 1860B556 85V Injector Boost Rail', specification: 'Check voltage across the 100µF/100V capacitors during cranking. If 0V, inspect the 100V/30A DPAK boost FET and check circuit vias underneath capacitor pads for electrolyte corrosion.' },
      { stepNum: 2, action: 'Measure 5.0V Sensor Reference on Melco E6T79xxx', specification: 'If TPS/MAP reads 0V with P2119/P0606, inspect black connector pins for blue-green copper oxidation. Clean header pins and replace TLE7209-2R / BA6285 driver if internal thermal latch is blown.' },
      { stepNum: 3, action: 'Replace Leaking Radial Caps on Adventure Melco E6T38xxx', specification: 'Unsolder aged 100µF/50V and 47µF/35V electrolytic capacitors. Clean etched PCB traces with isopropyl alcohol, repair corroded traces around the 5.0V LDO regulator, and install new low-ESR 105°C capacitors.' },
      { stepNum: 4, action: 'Verify 24V Fuso Canter Overvoltage Zener Diode', specification: 'On Bosch EDC17CP52 / Denso 24V boards, test 36V 1500W SMC Zener diode across +24V and GND. If alternator jumped to >36V, diode clamps and shorts to ground to protect TC1797 MCU.' },
    ],
  },

  // 13. Nissan OEM ECU PCB Layouts & Component Specifications (10 Platforms)
  {
    id: 'art-nissan-hitachi-pcb-hardware',
    dtcCode: 'NISSAN-PCB-SPECS',
    title: 'Nissan OEM ECU PCB Layouts, Component Specifications & Bench Repair Manual (10 PH Platforms)',
    vehicleModel: 'Navara NP300/D40, Terra, Urvan NV350, Almera N17, Almera N18 Turbo, Kicks e-Power, X-Trail, Sylphy, Patrol Royale Y62, Jatco Xtronic CVT',
    category: 'NISSAN_HITACHI',
    symptoms: [
      'Navara / Urvan YD25DDTi engine crank no-start with injector driver codes P0201–P0204 or P0628',
      'Terra / Navara Pro-4X 2.3L YS23 twin-turbo high-pressure common rail fuel delivery limp mode',
      'Almera / Sylphy / X-Trail Hitachi MEC throttle limp mode (P2101 / P1122 / P1126)',
      'Jatco Xtronic CVT TCM step-motor or primary/secondary pulley solenoid codes P1778 / P0746 / P0868',
      'Patrol Royale Y62 V8 DIG misfire on bank 1 or bank 2 high-pressure direct injection rail',
    ],
    rootCauses: [
      {
        cause: 'Navara / Urvan YD25 85V DC-DC Boost Stage Failure & Shorted DPAK Bank FETs',
        description: 'Shorted common rail injector wiring harness rubs against cylinder head, burning the bank-select DPAK MOSFETs on the Denso 275800 board and blowing the 0.02Ω (R020) 1W current-sense shunt resistor.',
        severity: 'CRITICAL',
      },
      {
        cause: 'Sticky Throttle Overheating MC33186 / TLE6209R H-Bridge on Hitachi MEC90 / MEC100',
        description: 'Carbon buildup on throttle plate causes excessive motor stall current, overheating the MC33186 / TLE6209R driver IC and blowing its internal thermal shutdown latch.',
        severity: 'CRITICAL',
      },
      {
        cause: 'Jatco Xtronic CVT TCM 0.05Ω (R050) Solenoid Shunt Burnout or Corrupted 95640 EEPROM',
        description: 'Thermal fatigue inside transmission fluid damages the 0.05Ω 1% solenoid shunts or quad-driver traces. Replacement boards fail calibration if unique valve body QR data in 95640 EEPROM is not cloned.',
        severity: 'CRITICAL',
      },
    ],
    hardwareNote: 'Covers 10 verified Nissan platforms: Navara YD25 (Denso 275800, SH7058/59, 93C86, 85V boost, 27V TVS), Terra YS23 (Bosch EDC17C84 / MD1CS006, TC1782/277, 40114 IC, 0.010Ω shunts), NV350 (Denso 275700, SE811, 0.015Ω EGR shunt), Almera N17 (Hitachi MEC90/100, SH7055/58, L9302 driver, MC33186 ETC), Almera N18 Turbo (Hitachi BED434, TC1767, 30682 GDI boost, dual wastegate H-bridges), Kicks e-Power (Hitachi BED50x, Aurix TC275, TLF35584 PMIC, dual CAN-FD), X-Trail (Hitachi BED410, SH72531, 65V GDI boost), Sylphy/Juke (Hitachi MEC93, L9779WD), Patrol Y62 V8 (Hitachi BED310, dual SH72543R, dual 65V GDI stages, VVEL H-bridge), and Jatco Xtronic CVT TCM (31036-xxxx, 5× PWM drivers, 0.05Ω shunts).',
    cpuArchitecture: 'Renesas SH7058 / SH7059 / SH7055 / SH72531 / SH72543R, Infineon Tricore TC1782 / TC1767, Aurix TC275 / TC277, and Bosch/Hitachi specialized drivers.',
    repairSteps: [
      { stepNum: 1, action: 'Probe Navara YD25 85V Boost Stage', specification: 'Measure voltage across 100µF/100V capacitors on Denso 275800 board. Verify 85V boost pulse during cranking. If missing, test 85V switching FET and 0.02Ω R020 current shunt.' },
      { stepNum: 2, action: 'Test Hitachi MC33186 / TLE6209R Electronic Throttle Driver', specification: 'If P2101/P1122 occurs, probe pin outputs to throttle motor while commanding throttle cycle. Check relay 12V feed and inspect driver IC for thermal package swelling.' },
      { stepNum: 3, action: 'Bench Test Jatco CVT Solenoid Shunts & EEPROM Cloning', specification: 'Measure resistance across the five 0.05Ω (R050) solenoid shunts. When replacing TCM, desolder and swap or clone the 95640 SOIC-8 EEPROM to preserve factory valve-body calibration.' },
      { stepNum: 4, action: 'Verify Terra YS23 Bosch Dual-Bank Driver Output', specification: 'Probe injector bank 1 and bank 2 high-side driver pins on Bosch EDC17C84 to verify synchronous buck regulator stability under simulated load.' },
    ],
  },
];
