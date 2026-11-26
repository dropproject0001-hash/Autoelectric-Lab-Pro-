# AutoElectric Lab Pro — Unified Offline AI Voice Assistant, Diagnostic Intelligence & Persistent Floating Navigator
## Complete End-to-End Architecture Inspection & Engineering Verification Report

---

## 1. Architecture Findings (End-to-End Trace Map)

### 1.1 Application Entry Points & Workspace Hierarchy
- **`src/App.tsx`**: Root state container holding active `LabTab`, `PowerSupplyState`, `MultimeterState`, `EcuPin[]`, `WireConnection[]`, `InjectedFault[]`, `CircuitSolution` (from MNA solver `BenchCircuitSolver.ts` / `circuitSolver.ts`), `SelectedVehicleContext` (`vehicleEcuRegistry.ts`), `SavedBenchSession[]`, `SavedDiagnosticLog[]`, and modal toggles (`Academy Lab`, `AI Diagnostic Studio`, `Saved Sessions`, `Report Studio`, `Credentials`, `Admin Console`).
- **`src/components/LabWorkspaceLayout.tsx`**: Workspace shell rendering:
  1. Primary views (`BENCH_LAB`, `CONNECTOR_PINOUTS`, `THREE_D_TWIN`, `WIRING_DIAGRAM`, `OSCILLOSCOPE`, `PCB_DIAGNOSTICS`, `REPAIR_GUIDES`).
  2. Persistent bottom-docked **`FloatingLabNavigator.tsx`** (`Docked Lab Console Controls`).
  3. Slide-out **`VoiceCommandLogSidebar.tsx`** (Voice history, command replay, and sequential macro builder/runner).
  4. Non-blocking **`UnifiedAiAssistantDrawer.tsx`** embedding **`HandsFreeVoiceCoach.tsx`** and **`AiDiagnosticAssistantPanel.tsx`**.

### 1.2 Information Flow: Live Bench Telemetry → Voice Assistant → Application Actions
1. **Physics & MNA Solver (`src/simulation/ecu/BenchCircuitSolver.ts` & `src/utils/circuitSolver.ts`)**:
   - Computes real-time node voltages (`nodeVoltages`), PSU current draw (`supplyCurrentDrawAmps`), over-current protection trip state (`isSupplyCurrentTripped`), active DTCs (`activeDTCs`), and virtual DMM display/unit/warnings (`multimeterReading`).
2. **Unified Voice Orchestrator (`src/services/offlineVoiceService.ts` — `offlineVoiceAssistant`)**:
   - Holds the single shared `BilingualLang` (`'TL' | 'EN'`), shared `VoiceSessionMemory`, pending state-changing action queue (`PendingVoiceAction`), command audit log (`VoiceCommandLogEntry[]`), and honest capability descriptor (`getCapabilities()`).
3. **Safety Interlock & Risk Classifier (`evaluateVoiceCommandSafetyAndRisk` in `src/services/offlineVoiceService.ts`)**:
   - Intercepts every incoming voice or text command before execution to classify it as `REJECTED_SAFETY`, `STATE_CHANGING` (`REQUIRES_CONFIRMATION`), or `LOW_RISK` (`EXECUTE_IMMEDIATELY`), and handles voice confirmation/cancellation (`"Confirm"` / `"Oo"` vs `"Cancel"` / `"Huwag"`).
4. **Local Voice Brain (`src/services/ai/localVoiceBrain.ts` — `processVoiceCoachTurn`)**:
   - Evaluates 11 intents (`LIVE_BENCH_STATUS`, `PINOUT_OR_ECU_LOOKUP`, `WORKSPACE_NAVIGATION`, `SYSTEM_FEATURE_GUIDE`, `FOLLOW_UP_DETAILS`, `STEP_EXPLAIN`, `READING_EVALUATION`, `DTC_OR_COMPONENT_LOOKUP`, `STEP_NEXT`, `STEP_REPEAT`, `CLARIFICATION_NEEDED`) against live MNA telemetry, `systemVoiceKnowledgeBase.ts`, `ecuPinoutData.ts`, `vehicleEcuRegistry.ts`, and `localKnowledgeDB.ts`.
   - Tags every response with a 6-category `VoiceKnowledgeProvenance` and builds a 5-part + 9-point `StructuredDiagnosticSections` card.
5. **Online Hybrid Router (`src/services/ai/aiRouter.ts` & `src/services/geminiService.ts`)**:
   - Optional online tier (`CARBON` → `SILICON` → ` QUANTUM` → `OFFLINE`) routed through Express `/api/ai/*` (`src/server/createApiApp.ts`) so Gemini API keys never leak to the browser bundle.

---

## 2. Problems Discovered During Technical Inspection

1. **Dual Disconnected Voice Pipelines**:
   - *Pathway A* (`FloatingLabNavigator.tsx` → `offlineVoiceService.ts` → `voiceCommandParser.ts` → `OfflineDiagnosticChatbot`) and *Pathway B* (`HandsFreeVoiceCoach.tsx` → `useHandsFreeVoice.ts` → `localVoiceBrain.ts`) previously maintained separate `SpeechRecognition` instances, separate language settings, and separate conversational states.
2. **Hardcoded `'en-US'` Recognition Locale in `offlineVoiceService.ts`**:
   - `offlineVoiceService.ts` initialized `this.recognition.lang = 'en-US'` and selected only English `SpeechSynthesis` voices, causing Filipino/Taglish commands spoken into the `FloatingLabNavigator` mic to be misrecognized or spoken without Taglish locale synchronization.
3. **Unconfirmed Execution of State-Changing Bench Mutations**:
   - `FloatingLabNavigator.tsx` previously executed state-changing commands (changing PSU voltage/current, connecting/cutting wires, injecting faults, running multi-step macros) immediately upon transcript arrival without a confirmation gate or safety interlock check.
4. **Missing Electrical Safety Interlocks in Voice Command Execution**:
   - Voice commands attempting to apply 12V to a 5V sensor reference pin (`Pin 5` / `VREF_5V`), switch the multimeter to `OHMS`/`CONTINUITY` while PSU output is energized (`isOutputEnabled === true`), or raise the PSU current limit while Over-Current Protection (`isSupplyCurrentTripped`) is tripped were not intercepted before mutation.
5. **Incomplete Multi-Turn Diagnostic Memory in `VoiceSessionMemory`**:
   - `VoiceSessionMemory` tracked `lastTopicId` and `lastFiveResponses`, but lacked explicit `currentDiagnosticScenarioId` (e.g. `TPS_BENCH_TEST`), `measurementHistory` (`0.04V` recorded during a multi-turn test), `lastExecutedCommand`, and `pendingConfirmation`, preventing seamless 4-turn sequences (`"How do I test the TPS?"` → `"What should I measure?"` → `"It's reading 0.04 volts."` → `"What next?"`).

---

## 3. Exact Files Modified

1. `src/services/ai/localVoiceBrain.ts`
2. `src/services/offlineVoiceService.ts`
3. `src/components/FloatingLabNavigator.tsx`
4. `src/hooks/useHandsFreeVoice.ts`
5. `src/simulation/tests/systemVoiceCoach.test.ts`

*(Plus earlier session modifications verified in-tree: `src/constants/branding.ts`, `src/context/TrialAccessContext.tsx`, `src/components/IntroductionPinLandingPage.tsx`, `src/components/CredentialsModal.tsx`, `src/components/AdminLicenseModal.tsx`, `src/simulation/tests/landingAndStepTutorials.test.ts`.)*

---

## 4. New Files Created

1. `VOICE_ARCHITECTURE_INSPECTION_REPORT.md` — Complete 12-section Architecture Inspection & Verification Report stored in the repository root.

---

## 5. Explanation of Every Important Modification

### 5.1 `src/services/ai/localVoiceBrain.ts`
- **6-Category Knowledge Provenance (`VoiceKnowledgeProvenance`)**:
  - Added `'VERIFIED_OEM_REFERENCE' | 'UNIVERSAL_BENCH_TRAINER' | 'SIMULATED_MNA_TELEMETRY' | 'CURATED_DIAGNOSTIC_DATABASE' | 'LOCAL_VERIFIED_CACHE' | 'UNVERIFIED_INFORMATION'` and `resolveVoiceProvenance(...)`.
- **5-Part & 9-Point Workshop Diagnostic Structure (`StructuredDiagnosticSections`)**:
  - Every diagnostic turn now populates `finding`, `check`, `expectedResult`, `safety`, and `nextStep` (plus full 9-point workshop fields `likelyCauses`, `exactPointsToCheck`, `expectedReading`, `meaningOfAbnormalReading`, `nextAction`, `safetyPrecautions`).
- **Expanded `VoiceSessionMemory` & 4-Turn TPS Conversational Continuity**:
  - Added `currentDiagnosticScenarioId`, `selectedEcuProfileLabel`, `measurementHistory`, `lastExecutedCommand`, and `pendingConfirmation`.
  - Implemented multi-turn context handlers for `"How do I test the TPS?"` → `"What should I measure?"` → `"It's reading 0.04 volts."` → `"What next?"` in both English (`EN`) and Taglish (`TL`).
- **Expanded Bilingual Intent Classification (`classifyVoiceIntent`)**:
  - Added natural Taglish and English patterns for `"Check mo yung voltage sa Pin 5"`, `"Bakit zero volts yung reading?"`, `"Open the ECU Pinouts"`, `"Paki-check kung may short to ground"`, `"Ano ang expected voltage ng TPS?"`, and `"Proceed to the next diagnostic step"`.

### 5.2 `src/services/offlineVoiceService.ts`
- **Unified Shared Language & Voice Selection**:
  - Added `getLanguage()`, `setLanguage(lang: BilingualLang)`, and updated `initVoice()` to select `fil-PH`/`tl-PH` voices for Taglish (`TL`) with graceful fallback to `en-PH`/`en-US` (`usingFallbackEnglishVoiceForTaglish: boolean`).
- **Shared Conversational Session Memory & Pending Confirmation Queue**:
  - Added `getSessionMemory()`, `setSessionMemory()`, `resetSessionMemory()`, `getPendingAction()`, `setPendingAction()`, `confirmPendingAction()`, and `cancelPendingAction()`.
- **Electrical Safety Interlocks & Risk Classifier (`evaluateVoiceCommandSafetyAndRisk`)**:
  - Blocks applying >5.5V (12V/KL30) to `Pin 5` / `VREF_5V` / 5V reference circuits.
  - Blocks switching DMM to `OHMS`, `CONTINUITY`, or `DIODE` while `powerSupply.isOutputEnabled === true`.
  - Blocks raising PSU current limit while `isSupplyCurrentTripped === true`.
  - Blocks energizing PSU output on unverified OEM pinout profiles.
  - Classifies state-changing bench mutations as `REQUIRES_CONFIRMATION` while keeping read-only and navigation actions as `EXECUTE_IMMEDIATELY`.
- **Honest Capability Reporting (`getCapabilities()`)**:
  - Explicitly distinguishes `localDiagnosticIntelligence: 'OFFLINE_READY'` from `microphoneSpeechRecognition: 'BROWSER_WEB_SPEECH_ONLINE_OR_OS'` and `textCommandFallback: 'ALWAYS_AVAILABLE_OFFLINE'`.

### 5.3 `src/components/FloatingLabNavigator.tsx`
- **Unified Orchestration & Safety Gate**:
  - Wired `executeVoiceOrTextQuery` through `evaluateVoiceCommandSafetyAndRisk` and `processVoiceCoachTurn`.
- **Pending Confirmation Bar (`data-testid="voice-pending-confirmation-bar"`)**:
  - Renders an upward-anchored confirmation dialog with 1-tap **Confirm** (`data-testid="voice-confirm-action-btn"`) and **Cancel** (`data-testid="voice-cancel-action-btn"`) buttons whenever a state-changing command or macro is queued, and also accepts spoken `"Confirm"` / `"Yes"` / `"Oo"` or `"Cancel"` / `"Huwag"`.
- **5-Part Structured Diagnostic Card & Provenance Badge**:
  - Renders `data-testid="voice-provenance-badge"` and `data-testid="voice-structured-diagnostic-card"` (`Finding`, `Check`, `Expected`, `Safety`, `Next step`).
- **Shared 1-Tap `EN | TL` Language Toggle & Module Navigation Bar**:
  - Added `data-testid="floating-voice-lang-toggle"` and direct workspace module shortcuts (`Bench Lab`, `ECU Pinouts`, `3D Twin`, `Wiring`, `Scope`, `PCB Scan`, `Repair KB`).

### 5.4 `src/hooks/useHandsFreeVoice.ts`
- Synchronized `memory` and `lang` with `offlineVoiceAssistant` (`offlineVoiceAssistant.setSessionMemory(memory)` and `offlineVoiceAssistant.setLanguage(lang)`) so switching languages or continuing a diagnostic conversation across the Floating Lab Navigator and the Hands-Free AI Coach Drawer preserves full state continuity.

---

## 6. Final Unified Voice Architecture

```
+-----------------------------------------------------------------------------------+
|                        USER INPUT CHANNELS (Bilingual EN / TL)                    |
|  1. Microphone (Browser Web Speech API: fil-PH / tl-PH / en-US)                   |
|  2. Always-Available Offline Text Command Input & Quick Action Chips              |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|             UNIFIED VOICE ORCHESTRATOR (`offlineVoiceAssistant`)                  |
|  - Shared Language (`TL` | `EN`) & TTS Voice Selector (with EN fallback flag)     |
|  - Shared `VoiceSessionMemory` (Topic, Scenario, Step, 5 Replies, Measurements)   |
|  - Honest Capability Descriptor (`getCapabilities()`)                             |
|  - Command Audit Log (`VoiceCommandLogEntry[]` with `VoiceKnowledgeProvenance`)   |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|       ELECTRICAL SAFETY INTERLOCK & RISK GATE (`evaluateVoiceCommandSafetyAndRisk`)|
|  - REJECTED_SAFETY: Blocks 12V->5V VREF, Ohms with PSU ON, OCP bypass, unverified |
|  - REQUIRES_CONFIRMATION: Queues `PendingVoiceAction` (Voice "Confirm"/"Oo" or UI)|
|  - EXECUTE_IMMEDIATELY: Navigation, readouts, diagnostic queries, probe attach    |
+--------------------+-----------------------------------------+--------------------+
                     |                                         |
        [Deterministic Bench Action]              [Conversational / Diagnostic Turn]
                     v                                         v
+----------------------------------------+   +--------------------------------------+
| `voiceCommandParser.ts` / Macro Runner |   | `localVoiceBrain.ts` (`processVoice`)|
| - Executes confirmed PSU, DMM, Wire,   |   | - 11 Intents + 4-Turn Continuity     |
|   Fault, Scenario & Tab actions        |   | - Live MNA Telemetry Interpretation  |
+----------------------------------------+   | - 6-Tier Provenance + 5-Part Card    |
                                             | - Optional Online `aiRouter.ts` tier |
                                             +--------------------------------------+
```

---

## 7. Offline vs. Online Capability Breakdown

| Capability | Offline Availability | Underlying Engine & Honest Status |
| :--- | :--- | :--- |
| **Local Intent Classification (11 Intents)** | **100% Offline** | `localVoiceBrain.ts` + `voiceCommandParser.ts` deterministic bilingual classifier |
| **Live MNA Circuit & Telemetry Analysis** | **100% Offline** | `BenchCircuitSolver.ts` real-time nodal matrix solver (`nodeVoltages`, `OCP`, `DMM`) |
| **Curated Diagnostic & Pinout Knowledge** | **100% Offline** | `systemVoiceKnowledgeBase.ts`, `ecuPinoutData.ts`, `phTroubleScenarios520.ts`, `localKnowledgeDB.ts` |
| **Verified Interaction LRU Cache (100 Entries)** | **100% Offline** | `voiceInteractionCache.ts` (IndexedDB `AutoLabPro_VoiceInteractionCache` with live-telemetry bypass) |
| **Text Command & Quick-Chip Fallback** | **100% Offline** | `FloatingLabNavigator.tsx` & `HandsFreeVoiceCoach.tsx` text input forms |
| **Speech Synthesis (Text-to-Speech)** | **Offline if OS voice installed** | Browser `window.speechSynthesis` (local OS TTS voices; auto-falls back from `fil-PH` to `en-PH`/`en-US`) |
| **Microphone Speech-to-Text (`SpeechRecognition`)** | **Browser/OS Dependent (Not Guaranteed Offline)** | W3C `SpeechRecognition` / `webkitSpeechRecognition`. Explicitly labeled `BROWSER_WEB_SPEECH_ONLINE_OR_OS` because Chromium routes audio to cloud STT unless OS offline speech packs are used. |
| **Cloud Generative AI Reasoning (`/api/ai/*`)** | **Online Optional Enhancement** | `aiRouter.ts` (`CARBON` / `SILICON` / `QUANTUM` Gemini tiers via server proxy; automatically falls back to `OFFLINE` tier on network failure). |

---

## 8. Bilingual (English & Filipino Taglish) Capability Breakdown

1. **Single Shared Language Preference (`TL` | `EN`)**:
   - Toggling `EN | TL` in `FloatingLabNavigator` or `UnifiedAiAssistantDrawer` updates `offlineVoiceAssistant.setLanguage(lang)`, synchronizing both recognition (`tl-PH` vs `en-US`) and synthesis without restarting the app.
2. **Natural Workshop Taglish (Zero Archaic Literal Translations)**:
   - Enforces a 12-word banned archaic Tagalog filter (`BANNED_DEEP_TAGALOG_WORDS`, e.g., `boltaheng sanggunian`, `panukat ng boltahe`, `sonda`, `tagapagkontrol`) via `sanitizeToNaturalTaglish()`.
3. **Preserved Automotive Identifiers**:
   - Never translates technical identifiers: `KL30`, `KL15`, `KL31`, `CAN_H`, `CAN_L`, `TPS`, `MAP`, `CKP`, `CMP`, `VREF_5V`, `SGND`, `ECU`, `DMM`, `OCP`, and `DTC` codes (`P0122`, `P0335`, `U0001`).
4. **Verified Natural Bilingual Command Examples**:
   - `"Check mo yung voltage sa Pin 5."`
   - `"Bakit zero volts yung reading?"`
   - `"Open the ECU Pinouts."`
   - `"Paki-check kung may short to ground."`
   - `"Set the multimeter to continuity."`
   - `"Ano ang expected voltage ng TPS?"`
   - `"Proceed to the next diagnostic step."`

---

## 9. Electrical & Application Safety Improvements

1. **5V Sensor Reference Over-Voltage Protection**:
   - Rejects any command attempting to apply 12V/14V/24V/KL30 to `Pin 5`, `VREF_5V`, or 5V sensor reference circuits (`REJECTED_SAFETY`), explaining that 12V destroys the internal 5V LDO regulator and ADC bus.
2. **Live Circuit Ohmmeter / Continuity Interlock**:
   - Rejects switching the multimeter to `OHMS`, `CONTINUITY`, or `DIODE` mode while `powerSupply.isOutputEnabled === true`, instructing the technician to turn PSU output OFF first.
3. **Active Over-Current Protection (OCP) Trip Interlock**:
   - Rejects raising the PSU current limit while `isSupplyCurrentTripped === true`, preventing forced current injection into an active short circuit.
4. **Unverified OEM Pinout Gate**:
   - Blocks bench PSU power-on commands when the selected vehicle profile has unverified/OCR-pending pinouts, maintaining strict separation between the Universal 16-Pin EFI Trainer and real OEM ECU profiles.
5. **Mandatory Confirmation for State-Changing Bench Commands**:
   - Commands that change PSU voltage/current, toggle PSU power, change DMM mode, connect/cut wires, inject/clear faults, reset the bench, or run multi-step macros enter `PENDING_CONFIRMATION` until confirmed by voice (`"Confirm"` / `"Yes"` / `"Oo"`) or the 1-tap **Confirm** button.

---

## 10. Automated Test Results

All unit and integration test suites executed and passed:
- **`src/simulation/tests/systemVoiceCoach.test.ts`**: **13/13 passed**
  - Tests 1–9: Taglish module guides, follow-up anti-repetition, tab/modal navigation, live MNA telemetry readouts, 12 banned archaic Tagalog words, non-blocking drawer UI, 100-entry LRU IndexedDB cache with live-reading bypass, AI router cache short-circuiting, and 180ms staggered cascade CSS.
  - Test 10: English, Filipino, and Taglish mixed technical sentences (`"Check mo yung voltage sa Pin 5"`, `"Bakit zero volts yung reading?"`, `"Open the ECU Pinouts"`, `"Paki-check kung may short to ground"`, `"Ano ang expected voltage ng TPS?"`, `"Proceed to the next diagnostic step"`).
  - Test 11: 4-turn conversational continuity (`"How do I test the TPS?"` → `"What should I measure?"` → `"It's reading 0.04 volts."` → `"What next?"`) with measurement history and 5-part structured diagnostic validation.
  - Test 12: Electrical safety interlocks (12V on Pin 5 VREF blocked, continuity with PSU ON blocked, raising current limit during OCP trip blocked) and state-changing confirmation queue (`setPendingAction` → `confirmPendingAction`).
  - Test 13: Honest capability descriptor (`getCapabilities()`) and shared `EN`/`TL` language synchronization.
- **`src/simulation/tests/landingAndStepTutorials.test.ts`**: **6/6 passed**
- **`src/simulation/tests/securityAndOffline.test.ts`**: **45/45 passed**
- **`src/simulation/tests/cleanupAndBilingualAiProof.test.ts`**: **All assertions passed**
- **Build & Lint (`compile_applet` + `lint_applet`)**: **0 TypeScript or bundle errors**

---

## 11. Remaining Limitations

1. **Browser Web Speech API Network Dependency**:
   - Standard browser `SpeechRecognition` / `webkitSpeechRecognition` in desktop/mobile Chromium sends audio frames to a browser vendor speech service unless the OS provides an on-device speech engine. No heavy multi-megabyte WASM whisper model was bundled to avoid bloating the PWA or breaking Google AI Studio build limits; instead, the UI honestly labels microphone recognition as `Web Speech Mic` and provides an always-available 100% offline text command input and quick-chip bar.
2. **Device-Dependent Filipino TTS Voices**:
   - Windows, macOS, Android, and iOS ship different `SpeechSynthesis` voice packs. When a native `fil-PH` or `tl-PH` voice is absent on the host OS, `offlineVoiceAssistant` automatically selects the clearest available `en-PH` or `en-US` voice and sets `usingFallbackEnglishVoiceForTaglish = true`.

---

## 12. Deployment & Verification Instructions

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Run Automated Verification Suites**:
   ```bash
   npx tsx src/simulation/tests/systemVoiceCoach.test.ts
   npx tsx src/simulation/tests/securityAndOffline.test.ts
   npx tsx src/simulation/tests/landingAndStepTutorials.test.ts
   npx tsx src/simulation/tests/cleanupAndBilingualAiProof.test.ts
   ```
3. **Type-Check & Build Production Bundle**:
   ```bash
   npm run lint
   npm run build
   ```
4. **Start Full-Stack Production Server (Port 3000)**:
   ```bash
   npm start
   ```
   *(Ensure `GEMINI_API_KEY` is configured in the server environment if optional online Gemini tiers are desired; all local voice intelligence, safety interlocks, and MNA bench diagnostics run 100% offline without an API key.)*
