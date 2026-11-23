import rawPhScenarios from './phTroubleScenarios520.json';
import rawPhScenariosBatch2 from './phTroubleScenariosBatch2_520.json';
import rawPhScenariosBatch3 from './phTroubleScenariosBatch3_520.json';
import rawPhScenariosBatch4 from './phTroubleScenariosBatch4_520.json';

export type PhDomainNumber =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30
  | 31
  | 32
  | 33
  | 34
  | 35
  | 36
  | 37
  | 38
  | 39
  | 40
  | 41
  | 42
  | 43
  | 44
  | 45
  | 46
  | 47
  | 48;

export type PhBatchFilter = 'ALL' | 'BATCH_1' | 'BATCH_2' | 'BATCH_3' | 'BATCH_4';

export interface PhDiagnosticScenario {
  id: string;
  dtcCode: string;
  domainNumber: PhDomainNumber;
  domainName: string;
  title: string;
  phContext: string;
  symptoms: string;
  diagnosticSteps: string;
  sourcePage: number;
}

export interface PhDomainDefinition {
  domainNumber: PhDomainNumber;
  batch: 1 | 2 | 3 | 4;
  shortLabel: string;
  name: string;
  rangeLabel: string;
  expectedCount: number;
  summary: string;
}

export interface PhReferenceAttribution {
  documentTitle: string;
  totalScenarios: number;
  provenanceStatus: 'CROSS_REFERENCED';
  verificationNote: string;
  page79Sources: ReadonlyArray<{ category: string; sources: string }>;
  batch2Note: string;
  batch3Note: string;
  batch4Note: string;
}

export const PH_REFERENCE_ATTRIBUTION: PhReferenceAttribution = {
  documentTitle: 'Philippine Automotive Trouble Scenarios & Diagnostic Reference (Batches 1–4 · 2,080 Scenarios)',
  totalScenarios: 2080,
  provenanceStatus: 'CROSS_REFERENCED',
  verificationNote:
    'Field diagnostic reference compiled for Philippine vehicles, monsoon/typhoon flood conditions, GDI/CRDi diesels, ADAS, PCB bench repair, EV/HEV, platform-specific faults, scope waveforms, relays/grounds, 24V heavy-duty, pre-purchase checks, engine mechanical/turbo/driveline/chassis/brakes, UDS/DoIP/J1939 protocols, key/immobilizer, workshop safety, and multi-symptom case studies. Cross-check exact OEM workshop service manuals before physical wiring or component replacement.',
  page79Sources: [
    {
      category: 'PH Best-Selling Models & Fleet Mix (2025–2026)',
      sources: 'Manila Bulletin (2025 PH Sales Leaders), BestSellingCarsBlog (PH Market & BYD Growth), Focus2move (Philippines Vehicles Market)',
    },
    {
      category: 'Philippine Floodwater & Typhoon Damage Diagnostics',
      sources: 'CarProCars PH (Flooded Car Electrical & Fluid Signs), Motorist PH (Flooded Road Risks), ZigWheels PH (Assessing Flood Damage)',
    },
    {
      category: 'Common Mechanical, Battery & Overheating Issues',
      sources: 'AutoDeal PH (Common Mechanical Car Problems), Firestone (Battery Overheating & Overcharging)',
    },
    {
      category: 'Diesel CRDi / D-4D, CVT & ABS Diagnostics',
      sources: 'Unsealed 4X4 (Toyota D-4D Common Faults), UTI (Diesel Diagnostic Trouble Codes), AutoDeal PH (CVT Failure Symptoms), Silverstern PH (Wheel Speed Sensor Faults), AutoZone (OBD-II Code Reference)',
    },
  ],
  batch2Note:
    'Batch 2 (PH-521–PH-1040, Domains 13–24, 78 pages) extends coverage into Gasoline GDI/Turbo, Euro-4/5/6 Piezo & SCR Diesels, ADAS/TPMS, Cabin Infotainment, Electronic Chassis/4WD, ISS/Mild-Hybrid, EVAP, AutoElectric Lab PRO Bench PCB/Driver ICs, HEV/BEV Deep Diagnostics, PH Commuter Motorcycles, Modern PUVs, and Intermittent Post-Repair Calibrations.',
  batch3Note:
    'Batch 3 (PH-1041–PH-1560, Domains 25–36, 77 pages) adds PH brand-specific platforms (Toyota/Lexus, Mitsubishi, Ford/Mazda, Isuzu/Nissan/Suzuki, Honda/Hyundai/Kia, Chinese EV/PHEV BYD/Geely/MG/Chery), Oscilloscope Waveform Diagnostics, Relay/Fuse/Ground/Voltage-Drop Troubleshooting, Tropical A/C Electricals, 24V Heavy-Duty Buses/Dump Trucks, Aftermarket Accessory/GPS/CAN Interference, and Used-Car Pre-Purchase Hidden Defects.',
  batch4Note:
    'Batch 4 (PH-1561–PH-2080, Domains 37–48, 76 pages) completes coverage with Engine Mechanical/Compression/Valvetrain, Turbo/Supercharger/Intercooler Boost, LPG/CNG Bi-Fuel & Contamination, Clutch/Flywheel/Diff/Driveshaft, Steering/PS/Alignment, Braking Hydraulics, UDS/J1939/FlexRay/MOST/DoIP Networks, Key/Immo EEPROM, Commercial/Grab/TNVS High-Mileage PM, Coastal/Cordillera/Off-Road, Workshop Safety/HV PPE/ESD, and Multi-Symptom Case Studies.',
};

export const PH_BATCH1_DOMAIN_DEFINITIONS: readonly PhDomainDefinition[] = [
  {
    domainNumber: 1,
    batch: 1,
    shortLabel: '1. Gas EFI/GDI',
    name: 'Engine Management & Fuel Delivery (Gasoline / EFI / GDI)',
    rangeLabel: 'PH-001–PH-060',
    expectedCount: 60,
    summary: 'Metro Manila thermal stress, E10 ethanol moisture separation, ignition, TPS/MAF/O2, and GDI faults.',
  },
  {
    domainNumber: 2,
    batch: 1,
    shortLabel: '2. Diesel CRDi',
    name: 'Common Rail Diesel (CRDi / D-4D / VGT / EGR / DPF)',
    rangeLabel: 'PH-061–PH-120',
    expectedCount: 60,
    summary: 'Fuel rail pressure, SCV/IMV, injector buzz/leakback, VGT boost, EGR soot, and DPF regen faults.',
  },
  {
    domainNumber: 3,
    batch: 1,
    shortLabel: '3. Power/Start',
    name: 'Charging, Starting & 12V/24V Power Distribution',
    rangeLabel: 'PH-121–PH-170',
    expectedCount: 50,
    summary: 'Battery sulfation, parasitic draw, alternator/LIN smart charging, starter drop, KL30/KL15 & ground loss.',
  },
  {
    domainNumber: 4,
    batch: 1,
    shortLabel: '4. Flood/Corrosion',
    name: 'Flood / Water-Ingress & Corrosion Electrical Faults (PH Typhoon Context)',
    rangeLabel: 'PH-171–PH-215',
    expectedCount: 45,
    summary: 'Hydrolock, submerged floor harness splices, ECU/SRS/EPS water ingress, and green-crust corrosion.',
  },
  {
    domainNumber: 5,
    batch: 1,
    shortLabel: '5. Cooling/HVAC',
    name: 'Engine Cooling & Tropical HVAC / Aircon Load Systems',
    rangeLabel: 'PH-216–PH-260',
    expectedCount: 45,
    summary: 'Traffic overheating under A/C load, PWM cooling fans, ECT drift, compressor clutch & pressure switches.',
  },
  {
    domainNumber: 6,
    batch: 1,
    shortLabel: '6. AT/CVT/DCT',
    name: 'Automatic, CVT & Dual-Clutch Transmission (AT / CVT / DCT)',
    rangeLabel: 'PH-261–PH-305',
    expectedCount: 45,
    summary: 'CVT judder/step-motor/pressure faults, Powershift/DCT clutch actuators, AT shift solenoids & ATF heat.',
  },
  {
    domainNumber: 7,
    batch: 1,
    shortLabel: '7. ABS/VSC/Brake',
    name: 'ABS, EBD, ESC/VSC & Wheel Speed / Braking Electronics',
    rangeLabel: 'PH-306–PH-345',
    expectedCount: 40,
    summary: 'WSS wiring/tone-ring faults, ABS pump motor, SAS/yaw zero-point calibration, EPB & brake switch logic.',
  },
  {
    domainNumber: 8,
    batch: 1,
    shortLabel: '8. EPS/SRS',
    name: 'Electric Power Steering (EPS), SRS Airbag & Restraints',
    rangeLabel: 'PH-346–PH-385',
    expectedCount: 40,
    summary: 'Column/rack EPS thermal derate, torque sensors, clockspring B1801 squib opens & seatbelt pretensioners.',
  },
  {
    domainNumber: 9,
    batch: 1,
    shortLabel: '9. CAN/LIN/Net',
    name: 'CAN Bus, LIN, K-Line & ECU Network Communication',
    rangeLabel: 'PH-386–PH-425',
    expectedCount: 40,
    summary: '60Ω/120Ω termination errors, U0073/U0100 bus-off shorts, LIN alternator/wiper faults & OBD-II DLC issues.',
  },
  {
    domainNumber: 10,
    batch: 1,
    shortLabel: '10. BCM/Immo',
    name: 'Body Control Module (BCM), Immobilizer, Keyless & Lighting',
    rangeLabel: 'PH-426–PH-460',
    expectedCount: 35,
    summary: 'B2799/P1614 immobilizer sync, push-start smart key RF interference, door actuators & BCM lighting drivers.',
  },
  {
    domainNumber: 11,
    batch: 1,
    shortLabel: '11. Hybrid/EV HV',
    name: 'Hybrid, EV (HEV/PHEV/BEV) & High-Voltage Systems (PH Emerging Fleet)',
    rangeLabel: 'PH-461–PH-490',
    expectedCount: 30,
    summary: 'HV isolation faults, dead 12V aux preventing READY mode, DC-DC converter, BMS thermal & inverter cooling.',
  },
  {
    domainNumber: 12,
    batch: 1,
    shortLabel: '12. 24V Trucks',
    name: '24V Commercial Trucks, Jeepneys & Heavy-Duty Diesel (Isuzu / Hino / Fuso)',
    rangeLabel: 'PH-491–PH-520',
    expectedCount: 30,
    summary: '24V uneven battery taps, SAE J1939 SPN codes, cab-tilt wiring breaks, exhaust brakes & heavy-duty SCR/DPF.',
  },
];

export const PH_BATCH2_DOMAIN_DEFINITIONS: readonly PhDomainDefinition[] = [
  {
    domainNumber: 13,
    batch: 2,
    shortLabel: '13. GDI/Turbo/VVT',
    name: 'Gasoline GDI, Turbo-Gasoline & VVT/Valvetrain Faults',
    rangeLabel: 'PH-521–PH-570',
    expectedCount: 50,
    summary: 'HPFP cam followers, LSPI knock, electronic wastegate rattle, intake carbon coking & VVT phaser/OCV timing faults.',
  },
  {
    domainNumber: 14,
    batch: 2,
    shortLabel: '14. Euro4/5/6/SCR',
    name: 'Common Rail Diesel Euro-4/5/6, AdBlue/SCR & Piezo Injectors',
    rangeLabel: 'PH-571–PH-620',
    expectedCount: 50,
    summary: 'Piezo 140V+ injector shorts, AdBlue crystal dosing/NOx faults, EGT probes, ash-clogged DPFs & EGR cooler leaks.',
  },
  {
    domainNumber: 15,
    batch: 2,
    shortLabel: '15. ADAS/TPMS',
    name: 'ADAS, Radar, Forward Camera, TPMS & Parking Assist Systems',
    rangeLabel: 'PH-621–PH-660',
    expectedCount: 40,
    summary: 'Millimeter-wave radar misalignment, post-windshield camera calibration, TPMS RF interference & sonar sensor faults.',
  },
  {
    domainNumber: 16,
    batch: 2,
    shortLabel: '16. Cabin/Cluster',
    name: 'Infotainment, Telematics, Cluster, Gauges & Cabin Electronics',
    rangeLabel: 'PH-661–PH-700',
    expectedCount: 40,
    summary: 'Dead headunits, CarPlay dropouts, instrument cluster CAN wake issues, GPS fleet trackers & HVAC blower resistors.',
  },
  {
    domainNumber: 17,
    batch: 2,
    shortLabel: '17. 4WD/Chassis',
    name: 'Electronic Suspension, AWD/4WD Couplings, Diff Locks & Chassis',
    rangeLabel: 'PH-701–PH-745',
    expectedCount: 45,
    summary: 'Transfer-case shift actuators, flooded 4WD switches, Haldex/AWD couplings, e-diff locks & air suspension compressors.',
  },
  {
    domainNumber: 18,
    batch: 2,
    shortLabel: '18. ISS/Mild-HEV',
    name: 'Starting/Charging Edge Cases, Smart Alternators, Stop-Start (ISS) & Mild Hybrid',
    rangeLabel: 'PH-746–PH-790',
    expectedCount: 45,
    summary: 'Mazda i-Stop / EFB battery resets, Suzuki SHVS lithium sub-batteries, negative-post BMS sensors & ELD smart charging.',
  },
  {
    domainNumber: 19,
    batch: 2,
    shortLabel: '19. EVAP/Exhaust',
    name: 'Fuel Tank, EVAP Leaks, Charcoal Canister & Exhaust Aftertreatment',
    rangeLabel: 'PH-791–PH-835',
    expectedCount: 45,
    summary: 'EVAP purge/vent valves, charcoal canister saturation from topping off, FTP sensors & catalytic converter degradation.',
  },
  {
    domainNumber: 20,
    batch: 2,
    shortLabel: '20. Bench PCB/ICs',
    name: 'Bench ECU Testing, PCB Component & Driver IC Faults (AutoElectric Lab PRO)',
    rangeLabel: 'PH-836–PH-880',
    expectedCount: 45,
    summary: 'Shorted SMBJ TVS diodes, 5V TLE4267 regulator dropout, IGBT/MOSFET driver shorts, TJA1040 CAN, SGND traces & BGA cracks.',
  },
  {
    domainNumber: 21,
    batch: 2,
    shortLabel: '21. EV/BMS/HV+',
    name: 'Hybrid & EV (HEV / PHEV / BEV) Thermal, BMS & Inverter Deep Diagnostics',
    rangeLabel: 'PH-881–PH-925',
    expectedCount: 45,
    summary: 'BYD Blade LFP balancing, CCS2/CP handshake, P0AA7 isolation leaks, DC-DC converter dropouts & EV chiller valves.',
  },
  {
    domainNumber: 22,
    batch: 2,
    shortLabel: '22. Moto/Scooter',
    name: 'Motorcycle / Tricycle EFI & Scooter Diagnostics (PH Commuter Fleet)',
    rangeLabel: 'PH-926–PH-965',
    expectedCount: 40,
    summary: 'Honda ACG Code 52, Yamaha Aerox/NMAX Error 12 stator plugs, scooter TPS/IACV, tip-over sensors & tricolor carb/EFI.',
  },
  {
    domainNumber: 23,
    batch: 2,
    shortLabel: '23. PUV/Van/Fleet',
    name: 'Light Commercial Vans, Modern PUVs (Class 1–3) & Reefer/Fleet Trucks',
    rangeLabel: 'PH-966–PH-1005',
    expectedCount: 40,
    summary: 'Modern Jeepney Class 2/3 PTO/speed limiters, L300/Hiace fleet vans, refrigerated box compressor alternators & door interlocks.',
  },
  {
    domainNumber: 24,
    batch: 2,
    shortLabel: '24. Intermittent',
    name: 'Intermittent, Mechanical-Electrical Crossover & Post-Repair Calibration Faults',
    rangeLabel: 'PH-1006–PH-1040',
    expectedCount: 35,
    summary: 'Thermal wiggle-test dropouts, post-battery idle/throttle relearns, vacuum-vs-MAF crossovers & Mode $06 freeze-frame capture.',
  },
];

export const PH_BATCH3_DOMAIN_DEFINITIONS: readonly PhDomainDefinition[] = [
  {
    domainNumber: 25,
    batch: 3,
    shortLabel: '25. Toyota/Lexus',
    name: 'Toyota / Lexus Specific Platform Faults (Vios, Innova, Hilux, Fortuner, HiAce, Wigo)',
    rangeLabel: 'PH-1041–PH-1090',
    expectedCount: 50,
    summary: '1NR/2NR timing chain rattle, P1300 IGF cutout, ETCS P2118 fuse, 1GD/2GD DPF & SCV, clockspring B1801, fusible links.',
  },
  {
    domainNumber: 26,
    batch: 3,
    shortLabel: '26. Mitsubishi',
    name: 'Mitsubishi Specific Platform Faults (Xpander, Montero Sport, Strada, Mirage, L300)',
    rangeLabel: 'PH-1091–PH-1135',
    expectedCount: 45,
    summary: '4N15 VGT & DPF sensor hoses, Xpander throttle/fuel pump, P0685 ECI main relay corrosion, Super Select 4WD & ETACS.',
  },
  {
    domainNumber: 27,
    batch: 3,
    shortLabel: '27. Ford/Mazda',
    name: 'Ford & Mazda Specific Platform Faults (Ranger, Everest, Territory, EcoSport, Mazda)',
    rangeLabel: 'PH-1136–PH-1180',
    expectedCount: 45,
    summary: 'DPS6 TCM/clutch forks, Bi-Turbo 10R80 CDF sleeve, 2.2 TDCi EGR cooler, PATS/MS-CAN, Skyactiv i-Stop & Mazda cluster joints.',
  },
  {
    domainNumber: 28,
    batch: 3,
    shortLabel: '28. Isuzu/Nissan/Suzuki',
    name: 'Isuzu, Nissan & Suzuki Specific Platform Faults (D-Max, mu-X, Navara, Urvan, Ertiga)',
    rangeLabel: 'PH-1181–PH-1225',
    expectedCount: 45,
    summary: '4JJ1/4JJ3 suction valves, Nissan IPDM/U1000 ground corrosion, QR25/YD25 chain & boost, Suzuki K15B/SHVS & AMT.',
  },
  {
    domainNumber: 29,
    batch: 3,
    shortLabel: '29. Honda/Hyundai/Kia',
    name: 'Honda, Hyundai & Kia Specific Platform Faults (City, Civic, BR-V, Accent, Staria, Soluto)',
    rangeLabel: 'PH-1226–PH-1270',
    expectedCount: 45,
    summary: 'Honda 1.5T injectors & EPS racks, Gamma 1.4/1.6 CKP P0335 hot stall, C1611 CAN timeout, MDPS coupler & CRDi pump relay.',
  },
  {
    domainNumber: 30,
    batch: 3,
    shortLabel: '30. CN Brands & EV',
    name: 'Emerging Chinese & EV/PHEV Brands in PH (BYD, Geely, MG, Chery, GAC, Changan)',
    rangeLabel: 'PH-1271–PH-1315',
    expectedCount: 45,
    summary: 'BYD LFP 12V sleep cutout, SGW U0100 gateway blocks, 7DCT clutch calibration, HV skid plate checks, V2L & DC charge locks.',
  },
  {
    domainNumber: 31,
    batch: 3,
    shortLabel: '31. Scope Waveforms',
    name: 'Oscilloscope Waveform & Sensor Signal Diagnostics',
    rangeLabel: 'PH-1316–PH-1360',
    expectedCount: 45,
    summary: 'VR/Hall CKP waveforms, primary coil current ramps, CRDi boost spikes, CAN ringing/mirroring, LIN low shorts, SGND bounce.',
  },
  {
    domainNumber: 32,
    batch: 3,
    shortLabel: '32. Relay/Fuse/GND',
    name: 'Automotive Relay, Fuse, Grounding & Voltage-Drop Troubleshooting',
    rangeLabel: 'PH-1361–PH-1400',
    expectedCount: 40,
    summary: 'Dynamic loaded voltage drops, flyback diode driver spikes, painted ground studs, green-crust crimps & fuse taps.',
  },
  {
    domainNumber: 33,
    batch: 3,
    shortLabel: '33. A/C Electrical',
    name: 'Air Conditioning Electrical, Dual-Zone Climate & Compressor Control Faults',
    rangeLabel: 'PH-1401–PH-1440',
    expectedCount: 40,
    summary: 'Magnetic clutch gaps/thermal protectors, ECV variable valve PWM, blend/mode actuators, thermistor drift & relay dropouts.',
  },
  {
    domainNumber: 34,
    batch: 3,
    shortLabel: '34. 24V Heavy-Duty',
    name: 'Heavy-Duty 24V Bus, Trailer, Dump Truck & Equipment (Hino / Fuso / Volvo / Giga)',
    rangeLabel: 'PH-1441–PH-1480',
    expectedCount: 40,
    summary: '24V starter solenoid drop, SPN 168 battery bus loss, 30V+ sense-wire overcharge, PTO air valves, trailer EBS & arc-weld damage.',
  },
  {
    domainNumber: 35,
    batch: 3,
    shortLabel: '35. Aftermarket/GPS',
    name: 'Aftermarket Accessory Integration, Security, GPS & Audio Interference Faults',
    rangeLabel: 'PH-1481–PH-1520',
    expectedCount: 40,
    summary: 'GPS kill-switch relay stranding, OBD-II CAN dongle corruption, dashcam drain, HID RF noise, pedal-box P2135 & wiring taps.',
  },
  {
    domainNumber: 36,
    batch: 3,
    shortLabel: '36. Pre-Purchase',
    name: 'Pre-Purchase Used Car Inspection & Hidden Defect Scenarios (PH Market)',
    rangeLabel: 'PH-1521–PH-1560',
    expectedCount: 40,
    summary: 'Tampered odometer, taped/bypassed MIL & SRS resistors, hidden flood silt, incomplete monitors, LTO CR engine-serial & paint.',
  },
];

export const PH_BATCH4_DOMAIN_DEFINITIONS: readonly PhDomainDefinition[] = [
  {
    domainNumber: 37,
    batch: 4,
    shortLabel: '37. Engine Mech',
    name: 'Engine Mechanical, Cylinder Head, Compression & Valvetrain Diagnostics',
    rangeLabel: 'PH-1561–PH-1605',
    expectedCount: 45,
    summary: 'Dry/wet compression & leak-down, burnt valves, head gasket breaches, hydraulic lifters, crank thrust & timing integrity.',
  },
  {
    domainNumber: 38,
    batch: 4,
    shortLabel: '38. Turbo/Boost',
    name: 'Turbocharger, Supercharger, Intercooler & Boost Plumbing Faults',
    rangeLabel: 'PH-1606–PH-1650',
    expectedCount: 45,
    summary: 'VGT vane sticking, P0299/P0234 boost leaks & overboost, oil drain coking, boost solenoids, MAP/BOV & intercooler heat soak.',
  },
  {
    domainNumber: 39,
    batch: 4,
    shortLabel: '39. Bi-Fuel/Contam',
    name: 'Fuel Injection, Bi-Fuel LPG/CNG & Fuel Contamination Faults',
    rangeLabel: 'PH-1651–PH-1695',
    expectedCount: 45,
    summary: 'LPG vaporizer/emulator cut-off boxes, E10 phase separation, Diesel bug/ALGAE, misfuel rescues, FRP P0192 & injector circuits.',
  },
  {
    domainNumber: 40,
    batch: 4,
    shortLabel: '40. Clutch/Diff',
    name: 'Manual Clutch, Flywheel, Differential & Driveshaft Mechanics',
    rangeLabel: 'PH-1696–PH-1740',
    expectedCount: 45,
    summary: 'Hydraulic slave/master air, worn clutch/DMF chatter, differential whine, CV axles, center bearings & axle oil seals.',
  },
  {
    domainNumber: 41,
    batch: 4,
    shortLabel: '41. Steering/Align',
    name: 'Steering Rack, Hydraulic Power Steering & Wheel Alignment Geometry',
    rangeLabel: 'PH-1741–PH-1780',
    expectedCount: 40,
    summary: 'Toe/camber/caster tire wear patterns, PSF leaks, rack play, steering U-joints, ball joints & post-alignment SAS zeroing.',
  },
  {
    domainNumber: 42,
    batch: 4,
    shortLabel: '42. Brake Hydraulics',
    name: 'Braking Hydraulics, Drum/Disc Mechanics & Parking Brake Systems',
    rangeLabel: 'PH-1781–PH-1820',
    expectedCount: 40,
    summary: 'Collapsed brake hoses, master cylinder bypass, rotor runout, drum adjusters, parking cables, boiling DOT3/4 & HSA holds.',
  },
  {
    domainNumber: 43,
    batch: 4,
    shortLabel: '43. UDS/J1939/DoIP',
    name: 'Automotive Network Protocols: UDS, J1939, FlexRay, MOST & DoIP Diagnostics',
    rangeLabel: 'PH-1821–PH-1865',
    expectedCount: 45,
    summary: 'UDS NRC 0x33/0x22/0x31/0x78, SGW bypass, DoIP, SAE J1939 PGN/BAM, CAN-FD, 120Ω termination, CAN-H/L swapped & 12V/0V shorts.',
  },
  {
    domainNumber: 44,
    batch: 4,
    shortLabel: '44. Key/Immo EEPROM',
    name: 'Key Programming, Immobilizer EEPROM, Smart Key RF & Theft Lockouts',
    rangeLabel: 'PH-1866–PH-1910',
    expectedCount: 45,
    summary: 'Transponder chip ID, antenna coils, Ford PATS 10-min wait, Toyota B2795, EEPROM sync losses, RF tint jam & all-keys-lost.',
  },
  {
    domainNumber: 45,
    batch: 4,
    shortLabel: '45. Grab/Fleet PM',
    name: 'Commercial Fleet, Delivery Van & Grab/TNVS High-Mileage Preventive Faults',
    rangeLabel: 'PH-1911–PH-1955',
    expectedCount: 45,
    summary: '200k+ km Vios/Mirage/L300/Hiace endurance PM, timing intervals, valve clearance, alternator brushes, cooling hoses & mounts.',
  },
  {
    domainNumber: 46,
    batch: 4,
    shortLabel: '46. Coast/Highland',
    name: 'Coastal Salt-Air, Mountain Highland (Baguio/Sagada) & Provincial Off-Road Faults',
    rangeLabel: 'PH-1956–PH-1995',
    expectedCount: 40,
    summary: '1,500–2,200m Baguio P0172 baro rich, steep climb overheating, coastal salt corrosion, deep mud/river shock & ABS ring jacking.',
  },
  {
    domainNumber: 47,
    batch: 4,
    shortLabel: '47. Safety/HV PPE',
    name: 'Workshop Safety, HV PPE, ESD Protection & Diagnostic Tool Edge Cases',
    rangeLabel: 'PH-1996–PH-2035',
    expectedCount: 40,
    summary: 'Class 0 1000V HV discharge wait, SRS ohmmeter prohibition, CRDi 1600-bar injury, ESD wrist straps, PSU 10A limit & 1x/10x scope probe.',
  },
  {
    domainNumber: 48,
    batch: 4,
    shortLabel: '48. Multi-Symptom',
    name: 'Multi-Symptom Complex Case Studies & Differential Diagnosis Matrices',
    rangeLabel: 'PH-2036–PH-2080',
    expectedCount: 45,
    summary: 'Cascading faults: G101 ground, P0642 5V collapse, dead 12V blocking 400V HV Ready, 16V+ sense fuse, thermal CKP & 5-step protocol.',
  },
];

export const PH_DOMAIN_DEFINITIONS: readonly PhDomainDefinition[] = [
  ...PH_BATCH1_DOMAIN_DEFINITIONS,
  ...PH_BATCH2_DOMAIN_DEFINITIONS,
  ...PH_BATCH3_DOMAIN_DEFINITIONS,
  ...PH_BATCH4_DOMAIN_DEFINITIONS,
];

export const PH_TROUBLE_SCENARIOS_520: readonly PhDiagnosticScenario[] =
  rawPhScenarios as PhDiagnosticScenario[];

export const PH_TROUBLE_SCENARIOS_BATCH2_520: readonly PhDiagnosticScenario[] =
  rawPhScenariosBatch2 as PhDiagnosticScenario[];

export const PH_TROUBLE_SCENARIOS_BATCH3_520: readonly PhDiagnosticScenario[] =
  rawPhScenariosBatch3 as PhDiagnosticScenario[];

export const PH_TROUBLE_SCENARIOS_BATCH4_520: readonly PhDiagnosticScenario[] =
  rawPhScenariosBatch4 as PhDiagnosticScenario[];

export const PH_TROUBLE_SCENARIOS_ALL: readonly PhDiagnosticScenario[] = [
  ...PH_TROUBLE_SCENARIOS_520,
  ...PH_TROUBLE_SCENARIOS_BATCH2_520,
  ...PH_TROUBLE_SCENARIOS_BATCH3_520,
  ...PH_TROUBLE_SCENARIOS_BATCH4_520,
];

const PH_SCENARIO_BY_ID = new Map<string, PhDiagnosticScenario>(
  PH_TROUBLE_SCENARIOS_ALL.map((item) => [item.id.toUpperCase(), item])
);

export function getPhScenarioBatch(domainNumber: PhDomainNumber): 1 | 2 | 3 | 4 {
  if (domainNumber <= 12) return 1;
  if (domainNumber <= 24) return 2;
  if (domainNumber <= 36) return 3;
  return 4;
}

export function getPhScenarioById(id: string): PhDiagnosticScenario | undefined {
  return PH_SCENARIO_BY_ID.get(id.trim().toUpperCase());
}

export function getPhScenariosByDomain(
  domainNumber: PhDomainNumber | 'ALL',
  batchFilter: PhBatchFilter = 'ALL'
): readonly PhDiagnosticScenario[] {
  const pool =
    batchFilter === 'BATCH_1'
      ? PH_TROUBLE_SCENARIOS_520
      : batchFilter === 'BATCH_2'
        ? PH_TROUBLE_SCENARIOS_BATCH2_520
        : batchFilter === 'BATCH_3'
          ? PH_TROUBLE_SCENARIOS_BATCH3_520
          : batchFilter === 'BATCH_4'
            ? PH_TROUBLE_SCENARIOS_BATCH4_520
            : PH_TROUBLE_SCENARIOS_ALL;
  if (domainNumber === 'ALL') {
    return pool;
  }
  return pool.filter((item) => item.domainNumber === domainNumber);
}

export function searchPhScenarios(
  query: string,
  domainNumber: PhDomainNumber | 'ALL' = 'ALL',
  batchFilter: PhBatchFilter = 'ALL'
): PhDiagnosticScenario[] {
  const base = getPhScenariosByDomain(domainNumber, batchFilter);
  const q = query.trim().toLowerCase();
  if (!q) return [...base];
  const tokens = q.split(/\s+/).filter(Boolean);
  return base.filter((item) => {
    const haystack = `${item.id} ${item.dtcCode} ${item.domainName} ${item.title} ${item.phContext} ${item.symptoms} ${item.diagnosticSteps}`.toLowerCase();
    return tokens.every((tok) => haystack.includes(tok));
  });
}

export function splitDiagnosticSteps(diagnosticSteps: string): string[] {
  const parts = diagnosticSteps
    .split(/(?=(?:^|\s)[1-9]\.\s+(?!\d+\.\s))/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [diagnosticSteps];
}
