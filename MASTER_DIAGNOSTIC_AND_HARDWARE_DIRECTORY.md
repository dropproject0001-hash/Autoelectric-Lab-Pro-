# AUTOELECTRIC LAB PRO — MASTER DIAGNOSTIC & HARDWARE DIRECTORY

**Centralized Core Intelligence Engine • OEM Bench Pinouts • DTC Workflows • MNA Circuit Physics • Semiconductor Specifications**

---

## 1. Overview & Operational Directive

This directory serves as the definitive technical authority and ingestion manual for AutoElectric Lab Pro. It connects abstract automotive electrical principles to concrete, verifiable bench measurements under the **Strict Zero-Fabrication Directive**.

All pinout coordinates, voltage thresholds, resistor values, and semiconductor packages documented herein are validated against OEM primary sources, factory service manuals, and semiconductor datasheets.

---

## 2. Verified OEM ECU Bench Pinouts & Power-Up Sequencing

All bench procedures must adhere to safe power-up sequencing:
$$\text{Grounds (KL31)} \longrightarrow \text{Constant Battery (+B / KL30)} \longrightarrow \text{Switched Ignition (+15 / IGSW via Toggle)} \longrightarrow \text{Diagnostic Lines (K-Line / CAN)}$$

### 2.1 Nissan Sentra / Almera N16 — Hitachi MEC11-251 & MEC22-251 ECM
*Engine: QG16DE / MCU: Renesas SH7055 / SH7058 / Source: Nissan ESM SM1E-1N16G0*
- **Constant Battery (+12V Fused 5A/10A)**: Pin 67 (or Pin 121)
- **Switched Ignition (+12V Toggle)**: Pin 36 (or Pin 109)
- **Chassis & Power Grounds**: Pin 48, Pin 1, Pin 57, Pins 115/116 (Bond directly to OBD-II Pins 4 & 5)
- **Diagnostic Communication Line**: **Pin 88 (or Pin 85) to OBD-II Pin 7 (Pure ISO-9141 K-Line UART)**
- **CRITICAL ARCHITECTURAL WARNING**: **Leave Pins 86 & 94 DISCONNECTED.** These are dedicated inter-module serial lines exclusively communicating with the Automatic Transmission Control Unit (TCU). They will **never** communicate with diagnostic scan tools and connecting them to OBD-II CAN pins will cause scanner timeout.

### 2.2 Toyota Hilux / Fortuner / HiAce — Denso 1KD-FTV & 2KD-FTV Common Rail ECM
*Engine: 1KD/2KD D-4D / Board: Denso 89661-0Kxxx / Source: Toyota Repair Manual RM1160E*
- **Constant Battery (+B, +B2)**: Connector E8 — Pin 1 (+B) & Pin 2 (+B2)
- **Switched Ignition (IGSW)**: Connector E8 — Pin 28
- **System Grounds**: E8 — Pin 7 (E1 - Power Ground) & Pin 17 (EC - Logic Ground)
- **Diagnostic Interface**:
  - **Pin E8-21 (SIL)** to OBD-II Pin 7 (K-Line / Techstream protocol)
  - **Pin E8-26 (CAN-H)** to OBD-II Pin 6 (60Ω differential bus)
  - **Pin E8-27 (CAN-L)** to OBD-II Pin 14
- **High-Voltage Boost Precaution**: The internal injector charging stage charges the high-voltage boost capacitor to **85V DC**. Always probe the 100µF/100V filter cap with a 10:1 scope probe to verify capacitor charge before probing injector driver outputs.

### 2.3 Nissan Navara D40 / Urvan NV350 — Denso 275800-xxxx ECM
*Engine: 2.5L YD25DDTi Common Rail / Board: Denso 275800 / MCU: Renesas SH7058/59 / EEPROM: 93C86*
- **Constant Battery (+12V)**: Pin 101 & Pin 102
- **Switched Ignition (+12V)**: Pin 104
- **Power Grounds**: Pin 105, Pin 106, Pin 118
- **CAN Bus Communication**: Pin 83 (CAN-H) to OBD-II Pin 6; Pin 84 (CAN-L) to OBD-II Pin 14
- **Hardware Failure Signature**: Common-rail harness shorting against the cylinder head burns the bank-select DPAK MOSFETs and blows the surface-mount **0.02Ω (R020) 1W** current-sense shunt resistor.

### 2.4 Nissan Terra / Navara Pro-4X — Bosch EDC17C84 / MD1CS006 ECM
*Engine: 2.3L YS23 Twin-Turbo / MCU: Infineon TriCore TC1782 / TC277 / Source: Bosch 028103xxxx*
- **Constant Battery (+12V)**: Pin 1, Pin 3, Pin 5
- **Switched Ignition (+12V)**: Pin 87
- **Power Grounds**: Pin 2, Pin 4, Pin 6
- **CAN Bus Communication**: Pin 65 (CAN-H) to OBD-II Pin 6; Pin 66 (CAN-L) to OBD-II Pin 14
- **Power Architecture**: Synchronous buck regulator generates 1.3V Core, 3.3V Logic, and 5.0V Sensor rails; dual-bank injector monitoring uses 0.010Ω precision shunts.

### 2.5 Jatco Xtronic CVT TCM — 31036-xxxx (JF011E / JF015E / JF016E / JF017E)
*Transmission: CVT7 / CVT8 / Source: Jatco TSB CVT-17*
- **Constant Battery (+12V)**: Pin 19
- **Switched Ignition (+12V)**: Pin 28
- **Power Ground**: Pin 5 & Pin 42
- **CAN Bus Communication**: Pin 11 (CAN-H) to OBD-II Pin 6; Pin 12 (CAN-L) to OBD-II Pin 14
- **Solenoid Shunts**: Five onboard 0.05Ω (R050) 1% alloy current-sense shunts.
- **EEPROM Cloning Requirement**: The **95640 SOIC-8 EEPROM** stores unique factory valve-body flow calibration QR data. When replacing the TCM board, the 95640 EEPROM must be desoldered and read at 3.3V, then written to the replacement board to prevent transmission calibration lockup.

---

## 3. DTC Fault Isolation & Concrete Bench Procedures

### 3.1 DTC P0201 – P0204: Common Rail Injector Circuit / Boost Rail Collapse
- **Symptoms**: Engine cranks rapidly, fuel pump primes, 0.0V injector pulse, hard no-start.
- **Circuit Analysis**: Common-rail piezoelectric and solenoid injectors require a high-voltage boost step (85V on Denso, 65V on GDI, 48V on Bosch EDC17). If the step-up boost converter fails or the current-sense shunt blows, the MCU disables all injector firing to prevent FET runaway.
- **Bench Probing Procedure**:
  1. Set digital storage oscilloscope (DSO) Channel 1 to **20V/Div, 1ms/Div, DC Coupling, Normal Trigger (rising edge at 15V)**.
  2. Ground scope probe directly to ECU ground pin (not bench PSU chassis).
  3. Probe the positive lead of the 100µF/100V boost capacitor on the PCB.
  4. Crank/pulse the engine sync signal:
     - **Normal**: Voltage pulses rapidly to **80V–85V**.
     - **Fault**: Voltage stays flat at battery voltage (12.4V) or collapses to 0V.
  5. **Component Repair**: De-energize bench power. Measure continuity across the **0.02Ω (R020) 1W** shunt resistor. If reading is open (>1Ω), replace the shunt and test the adjacent N-channel DPAK switching MOSFET for drain-to-source punch-through.

### 3.2 DTC P2101 / P1122: Electronic Throttle Control (ETC) H-Bridge Thermal Latch
- **Symptoms**: Engine idles roughly at 1,500 RPM (default mechanical throttle stop), accelerator pedal completely unresponsive.
- **Circuit Analysis**: The Electronic Throttle Motor is driven by a full-H-bridge driver IC (Freescale **MC33186** or Infineon **TLE6209R**). When carbon accumulation in the throttle bore increases mechanical resistance, motor stall current exceeds **5.0A**, causing the internal thermal shutdown circuit to latch off.
- **Bench Probing Procedure**:
  1. Connect 12V bench power through a 5A fast-blow fuse.
  2. Connect DSO Ch1 and Ch2 to throttle motor drive pins (Pins 11 and 12 on MC33186).
  3. Cycle switched ignition (KL15): Observe initial 500ms self-test PWM pulse (1 kHz frequency).
  4. If voltage drop across driver output exceeds 1.8V under 2A test load, the H-bridge lower FET is degraded.
  5. Check throttle feedback redundancy: TPS 1 must sweep linearly from **0.5V to 4.5V**, while TPS 2 sweeps inversely from **4.5V down to 0.5V** (sum must equal **5.0V ± 0.2V** at all angles).

### 3.3 DTC P1778 / P0746: Jatco CVT Solenoid Current Regulation & Ratio Fault
- **Symptoms**: Transmission locked in fail-safe ratio (sluggish acceleration, no ratio change), fluid temperature sensor reads erratic.
- **Bench Probing Procedure**:
  1. Power TCM on bench (+12V on Pin 19/28, GND on Pin 5/42).
  2. Using a 4-wire milliohm meter or precision DMM, measure the resistance of the five **0.05Ω (R050) 1%** alloy current shunts on the PCB.
  3. If any shunt reads `> 0.055Ω` or open, thermal fatigue has broken the solder joint or cracked the resistive element.
  4. Read the 8-pin **95640 SPI EEPROM**: Verify checksum matches the factory calibration label on the transmission casing.

### 3.4 DTC P0606 / P0685: ECM Internal Processor / Main Relay Control Fault
- **Symptoms**: Scan tool reports intermittent communication; main power relay chatters or fails to hold.
- **Bench Probing Procedure**:
  1. Measure voltage across the internal 5.00V Low-Dropout (LDO) regulator (e.g., L9302 / L9779WD / TLF35584).
  2. Specification: **5.00V ± 0.02V**. If reading fluctuates or drops below 4.75V, microcontroller reset circuit trips.
  3. Measure voltage drop between ECU internal ground trace and bench ground wire: Must be `< 0.05V`. If `> 0.10V`, high-resistance internal PCB ground via is damaged.

---

## 4. Modified Nodal Analysis (MNA) & Glitch Simulation Physics

AutoElectric Lab Pro's core physical simulation engine solves electrical behavior using **Modified Nodal Analysis (MNA)**:

$$\mathbf{A} \cdot \mathbf{x} = \mathbf{z}$$

### 4.1 The 25ms Sub-150ms Transient Glitch (`preset-tps-sub150-chatter-glitch`)
- **Electrical Mechanism**: A loose harness terminal or cracked wiper track opens the sensor line for exactly **25ms** every **100ms** (25% fault duty cycle).
- **Multimeter Averaging Limitation**:
  - DMMs use Dual-Slope or Delta-Sigma ADCs with display update intervals of **200ms to 400ms**.
  - The DMM integrates and computes the time-average voltage:
    $$V_{\text{DMM}} = (0.75 \times 4.95\text{V}) + (0.25 \times 0.00\text{V}) = 3.71\text{V}$$
  - The reading appears stable to the technician, while the ECM's 5ms ADC interrupt detects signal dropout and triggers limp mode.
- **MNA Engine Resolution**:
  - The MNA solver conducts a topological breadth-first search (BFS) from ground node `'0'`.
  - During the 25ms ON window, the wiper branch conductance is set to $G = 1\times 10^{-12}\text{ S}$ (Open circuit).
  - The node is verified as disconnected from reference ground and assigned `0.00V` (or flagged `UNRESOLVED`), which an oscilloscope trace or edge-triggered latch catches cleanly.

---

## 5. Board Semiconductor & Component-Level Specifications

| Semiconductor / Part ID | Package Footprint | Core Electrical Parameters | Typical OEM Vehicle Usage | Failure Mode & Diagnosis |
| :--- | :--- | :--- | :--- | :--- |
| **MC33186** | HSOP-20 (Heatsink Slug) | **5.0A Continuous Full-H-Bridge**, 5.0V–28V, internal charge pump, thermal warning flag | Electronic Throttle Control (Nissan Hitachi MEC90/100, Ford EEC-VI) | High stall current causes internal thermal latchup. Package blisters on bottom heatsink pad. Substitute with TLE6209R with SPI pinout adjustments. |
| **TLE6209R** | PG-DSO-20 | **6.0A Continuous Full-H-Bridge**, SPI diagnostics, short-circuit and open-load protection, 40V surge clamp | Electronic Throttle & Turbo Wastegate (Bosch ME7 / EDC16) | Thermal overstress. When replacing, verify copper ground plane underneath the exposed slug is flooded with thermal paste or reflow solder. |
| **L9302 / L9779WD** | QFP-64 / PowerSSO | Multi-channel low-side driver + integrated **5.0V / 3.3V LDO regulator** + watchdog | System Power & Drivers (Nissan Hitachi MEC93, MEC110) | Surge from reverse battery polarity or jump starting shorts internal LDO; VREF rail collapses to 0.8V. |
| **TLF35584** | LQFP-64 | **Automotive Functional Safety PMIC**, dual buck/boost regulators, window watchdog | Nissan Kicks e-Power HR12DE Generator Module (Hitachi BED50x) | Microcontroller power supervisor. If MCU watchdog heartbeat stops over SPI, PMIC cycles continuous reset pulses. |
| **R020 / R050 Current Shunts** | SMD 2512 | **0.020Ω / 0.050Ω 1W 1%** low-inductance alloy metal strip resistors | Denso Common Rail boost stage / Jatco CVT Solenoid Drivers | Opens due to overcurrent pulse when external actuator harness shorts to ground. Never replace with standard wirewound or carbon film resistors. |
| **95640 / 93C86 EEPROM** | SOIC-8 | **64Kbit SPI / 16Kbit Microwire** serial EEPROM, 5MHz, 100k write cycles | Jatco CVT valve body QR data; Denso 275800 immobilizer & injector codes | Corrupts during low-voltage cranking (<7V). Must be dumped and archived before desoldering. |

---

## 6. Bench Safety Interlocks & Protection Gates

1. **5V Rail Overvoltage Lockout**: Applying `> 5.5V` to Pin 5 (`5V VREF`) or internal sensor rails is **HARD BLOCKED**.
2. **Live Circuit Ohms Lockout**: Resistance, continuity, or diode mode selection while power supply output is active is **HARD BLOCKED** to prevent DMM shunt burnout.
3. **Over-Current Protection (OCP)**: Trips when bench current exceeds set threshold (default: 2.0A, maximum: 10.0A). Output latch prevents restart until current fault is resolved.
4. **85V Boost Capacitor Safety**: High-voltage boost capacitors must be discharged through a 1kΩ 10W resistor prior to physical handling or board rework.
