# AutoElectric Lab Pro — Milestone M0 Architecture Audit Report

**Audit Date:** 2026-11-27  
**Baseline Branch / Commit:** `main` @ `9779f90`  
**Audit Feature Branch:** `milestone/m0-audit`  
**Governing Spec:** Master Developer Instruction v1.1  
**Primary Engineer:** Replica  

---

## 1. Executive Summary & M0 Gate Status

| Gate Criterion | Status | Evidence |
|---|---|---|
| Audit file delivered before code changes | **PASS** | `docs/M0_ARCHITECTURE_AUDIT.md` |
| TypeScript type check (`npm run lint`) | **PASS** | `tsc --noEmit` exited `0` (0 errors) |
| Production build (`npm run build`) | **PASS** | Vite `8.4.0` built in `2.59s` (+ SW `22ms`); 1 chunk warning (`index-*.js` `1,715.75 kB`) |
| Baseline tests (`npm test`) | **PASS** | 22/22 test suites passing (`exit 0`, including 104/104 MNA circuit tests, 18/18 Master Spec categories, 8/8 Fuse-Box.info tests, 4/4 Cockpit UI tests) |
| Dependency security audit (`npm audit --omit=dev`) | **WARN** | 4 high-severity transitive findings in `@grpc/grpc-js <=1.13.5` (via `firebase` → `@firebase/firestore` Node gRPC transport; browser bundle uses WebChannel) |

---

## 2. Test Tooling Selection

- **Unit, Domain, Simulation & Backend API Integration Tests:** `tsx` (`^4.21.0`) executing Node `node:assert/strict` and `node:test` suites under `src/simulation/tests/*.test.ts` (22 existing suites, runnable via `npm test`). All new M1–M10 unit and API integration suites will be added as `src/simulation/tests/*.test.ts` and registered in `package.json`.
- **Browser, Responsive, Offline & WebGPU Capability Verification:** Playwright Chromium (headless desktop & mobile/tablet viewports, offline emulation via `context.setOffline(true)`). Hardware-dependent Android WebGPU inference is tested where device hardware is available and otherwise documented honestly as `Blocked by external requirement` (no physical Android GPU in headless Linux workspace).
- **Release & Security Preflight:** `scripts/preflight-release-check.mjs` (`npm run release:check`) + `scripts/verify-firestore-rules.mjs` (`npm run rules:verify`).

---

## 3. Codebase Inventory & Feature Classification

### 3.1 Working Features (Preserve & Reuse)
1. **Virtual ECU Electrical Simulation Engine (`src/simulation/`)**:
   - Modified Nodal Analysis (MNA) solver (`MatrixSolver.ts`, `CircuitNetwork.ts`, `BenchCircuitSolver.ts`, `utils/circuitSolver.ts`) with floating/unresolved node detection (`UNRESOLVED`, `NON_FINITE`).
   - Automotive component models (`AutomotiveModels.ts`), signal generator (`SignalGenerator.ts`), binary decoder (`BinaryStateDecoder.ts`), fault injection (`FaultManager.ts`, `faultSequenceService.ts`, `benchTroubleScenarios.ts`), logic check rules (`LogicCheckEngine.ts`), PCB diagnostic engine (`PcbDiagnosticEngine.ts`), and gauge/harness digital twin (`gaugeTelemetryEngine.ts`, `emsDigitalTwinSync.ts`, `harnessDiagnostics.ts`).
2. **Backend Security, Auth & Licensing (`src/server/`)**:
   - Express API server (`server.ts`, `src/server/createApiApp.ts`) with hardened CSP, HSTS, `Permissions-Policy` (disables `usb=()`, `serial=()`, `payment=()`), route-scoped JSON parsers, and per-user/per-IP rate limiting.
   - Firebase RS256 JWKS verification (`firebaseAuthMiddleware.ts`), 8-digit Trial PIN & Master Admin PIN (`trialPinService.ts`), online license codes (`licenseService.ts`), and ECDSA P-256 offline license/lab-report signing (`offlineLicenseCrypto.ts`). **Protected by Section 2 — do NOT alter existing auth/licensing logic.**
3. **PWA App Shell & Service Worker (`vite.config.ts`, `src/sw.js`, `src/hooks/usePWA.ts`)**:
   - `vite-plugin-pwa` (`injectManifest`) with strict network-only bypass for `/api/*`, Firebase Auth, Firestore, and Gemini endpoints.
   - Offline mutation queue & local cache (`src/services/offlineSyncQueue.ts`) with monotonic version stamps, idempotency keys, exponential retry backoff, and tombstone support.
4. **OEM & Diagnostic Reference Data (`src/data/`, `src/utils/`, `src/services/`)**:
   - `src/data/automotiveKnowledgeSeed.ts`, `src/data/unifiedOemCompiledKnowledge.json` (17 architectures, 4,254 cavities, 13 Dual-OEM confirmed), `src/data/startmycar/`, `src/data/fuseboxinfo/`, `src/data/obdb/saej1979-v3-default.json`, `src/data/phTroubleScenarios*.json` (2,080 PH scenarios), `src/components/ecuPinoutData.ts`, `src/utils/vehicleEcuRegistry.ts`, `src/utils/oemKnowledgeDatabase.ts`.
5. **Cockpit UI & Tactile Acoustics (`src/components/`)**:
   - Multi-device aligned Mobile/Tablet/Desktop cockpit (`LabTopNav.tsx`, `InstrumentPanels.tsx`, `FloatingLabNavigator.tsx`, `LabStatusFooter.tsx`, `IntroductionPinLandingPage.tsx`) and Web Audio DSP (`audioFeedback.ts`).
6. **NHTSA Official Public API Proxy (`src/server/services/nhtsaService.ts`)**:
   - VIN decode, WMI/makes, recalls, and complaints with bounded retries, stale-cache fallback, and `OFFICIAL_GOVERNMENT` provenance.

### 3.2 Incomplete Features (Missing or Partial Against v1.1 Spec)
1. **No Unified AI Orchestrator (Section 6 / M2)**:
   - Currently 6 parallel AI entry paths exist (`aiRouter.ts`, `geminiIntelligenceService.ts`, `groundedSearchService.ts`, `offlineChatbotEngine.ts`, `offlineEngine.ts`, `localVoiceBrain.ts`) with no single orchestrator enforcing request classification, DB-first retrieval, 6-tier Evidence Hierarchy, Numeric Validator, privacy filter, and controlled capture.
2. **No Numeric Validator (Section 6.1 / M2)**:
   - No post-generation validator verifies every pin number, voltage, resistance, and frequency against retrieved database evidence.
3. **No 6-Tier Evidence Hierarchy Enforcement (Section 5 / M2)**:
   - Existing `diagnosticEvidenceSystem.ts` uses 5 simulation/cache labels, not the mandatory 6-level hierarchy (`1. Verified OEM`, `2. Technician-confirmed`, `3. Unverified database`, `4. General AI explanation`, `5. Simulated result`, `6. User-entered measurement`).
4. **No Local WebGPU / WebLLM Engine (Section 9 / M3)**:
   - Zero `@mlc-ai/web-llm` or WebGPU Worker implementation exists (`grep` confirms 0 references).
5. **No Database Schema Versioning / Reversible Migrations / Complete Provenance Fields (Section 7 / M1)**:
   - `automotiveKnowledgeService.ts` lacks `ecuPartNumber`, `hardwareId`, `softwareId`, `sourceDocument`, `pageOrSection`, `revision`, `captureDate`, `testConditions`, `versionHistory`, exact ECU/part-number-first lookup, and reversible migration tooling.
6. **No Admin AI Control Center (Section 13 / M8)**:
   - Only Trial/License admin modals exist; no backend-enforced controls for AI overview, local model profiles, Gemini model allowlist, quota monitoring, cloud shutoff / emergency kill switch, knowledge verification queue, conflict resolution, credential rotation checklist, or AI audit logs.
7. **Incomplete `SIMULATED` Labeling (Section 4 / M6)**:
   - `Oscilloscope.tsx`, `D3OscilloscopeView.tsx`, and `LiveGaugeConsole.tsx` display `SIMULATED`, but `DigitalMultimeter.tsx`, `BenchPowerSupply.tsx`, and `PinWaveformOscilloscope.tsx` lack explicit visible `SIMULATED` badges.
8. **No Knowledge-to-Cloud Incremental Sync Guard (Section 12 / M7)**:
   - `localKnowledgeDB.ts:synchronizeKnowledgeEntries()` only flips local `syncStatus` in memory/IndexedDB; it does not perform real incremental delta sync, deletion propagation, or server-side anti-overwrite protection for approved records.

### 3.3 Broken / Policy-Violating Features (Must Fix)
1. **PAID AI VIOLATION — OpenAI Provider (`src/server/services/openAIImageAnalysisProvider.ts`, `src/server/services/imageAnalysisProvider.ts`)**:
   - Supports paid OpenAI `gpt-4o-mini` via `OPENAI_API_KEY`. Direct violation of Section 4 (*"Free-tier AI only... Prohibited: any paid model or API, paid fallback, automatic upgrade, or billing activation. Admins cannot override this prohibition."*).
2. **PAID AI VIOLATION — Paid Gemini Video/Image Routes (`src/server/createApiApp.ts:1925-2337`)**:
   - `/api/autoelectric/animate-video`, `/api/autoelectric/step-tutorial-video`, and `/api/autoelectric/generate-image` invoke `gemini-omni-1.2-flash` and `gemini-nano-banana-2.1` and return `PAID_MODEL_REQUIRED` prompting users to add a billing-enabled Gemini API key.
3. **MULTI-KEY QUOTA POOLING VIOLATION (`src/server/services/quotaManager.ts`, `src/server/services/geminiFreeTierRouter.ts`, `src/services/ai/QuotaManager.ts`)**:
   - Loads `GEMINI_API_KEYS` and `GEMINI_API_KEY_1..10` to multiply free-tier quota. Direct violation of Section 10 (*"Do not treat extra keys or projects as extra quota."*).
4. **MISSING DEFAULT-DISABLED ALLOWLIST (`src/server/services/geminiFreeTierRouter.ts`, `src/server/createApiApp.ts`)**:
   - Models (`gemini-4-hydrogen`, `gemini-3.1-flash-lite`, `gemini-3.5-transcribe`, `gemini-3.8-live`) are enabled by default without an admin-verified free-tier allowlist. Violates Section 10 (*"Allowlist defaults to disabled. A model is enabled only after an admin verifies free-tier eligibility... Unknown eligibility means blocked."*).
5. **ANTI-POISONING VIOLATION (`src/services/ai/localKnowledgeDB.ts:407-447`)**:
   - `validateAndClassifyOnlineAiAnswer()` auto-sets `reviewStatus: 'APPROVED'` and `VERIFIED_TECHNICAL_KNOWLEDGE` when `confidence >= 0.80` without human approval. Direct violation of Section 5 (*"A confidence score is not proof of correctness"*) and Section 8 (*"AI-generated content is never auto-verified."*).
6. **HARDWARE API PROBING (`src/services/benchHardwareAbstractionLayer.ts:48-110`)**:
   - Probes `navigator.serial`, `navigator.usb`, `navigator.bluetooth` and defines `PHYSICAL_HARDWARE_BRIDGE` / `J2534_PASSTHRU` / `SOCKETCAN_BRIDGE`. Violates Section 4 (*"Virtual simulation only... Do not build hardware drivers."*).

### 3.4 Duplicates & Architecture Inconsistencies
- **Duplicate Component Name:** `src/components/KnowledgeCenterPanel.tsx` (OEM reference catalog) vs. `src/components/ai/KnowledgeCenterPanel.tsx` (IndexedDB verified knowledge + safety audit).
- **Duplicate Quota Managers:** `src/server/services/quotaManager.ts` vs. `src/services/ai/QuotaManager.ts`.
- **Fragmented Knowledge Stores (6 stores):**
  1. `src/services/automotiveKnowledgeService.ts` (`localStorage` + `automotiveKnowledgeSeed.ts` + `unifiedOemCompiledKnowledge.json`)
  2. `src/services/ai/localKnowledgeDB.ts` (`IndexedDB AutoLabPro_VerifiedKnowledge`)
  3. `src/utils/oemKnowledgeDatabase.ts` (static TS catalog)
  4. `src/data/ecuRepairKnowledgeBaseData.ts` (static TS repair KB)
  5. `src/services/startMyCarKnowledgeService.ts`
  6. `src/services/fuseBoxInfoKnowledgeService.ts`
- **Fragmented AI Callers:** Components call `aiRouter.ts`, `geminiIntelligenceService.ts`, `groundedSearchService.ts`, `offlineChatbotEngine.ts`, and `localVoiceBrain.ts` independently instead of one Unified AI Orchestrator.

### 3.5 Security Weaknesses & Performance Problems
- **Security:**
  - No backend PII / privacy scrubber before sending bench context or user queries to Gemini free tier (Section 10).
  - Unauthenticated/default-enabled cloud model routing without an admin cloud kill switch or explicit allowlist.
  - `.env.example` advertises `OPENAI_API_KEY`, `OPENAI_MODEL`, `GEMINI_API_KEYS`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`.
  - Transitive `@grpc/grpc-js <=1.13.5` high-severity advisory in `firebase` (Node gRPC transport; browser bundle unaffected, tracked in M9).
- **Performance:**
  - Main bundle `dist/assets/index-*.js` is `1,715.75 kB` (`473.78 kB` gzip), triggering Vite's >1200 kB chunk warning.
  - `automotiveKnowledgeService.ts` performs linear full-scan token matching on every search instead of an indexed lookup (MiniSearch `^7.2.0` is already installed in `package.json` and unused for the knowledge catalog!).

### 3.6 Missing Tests
- Reversible DB migration apply + rollback on isolated copy + provenance enforcement (M1).
- Unified AI Orchestrator DB-only routing, 6-tier evidence labels, information-gap refusal, and Numeric Validator anti-hallucination suite (M2).
- Local WebGPU/WebLLM worker profile selection, download consent gate, storage budget, and forced-failure fallback to DB-only mode (M3).
- Backend Gemini Free-Tier Gateway: default-disabled allowlist rejection, paid-model rejection, single-key policy, quota shutoff, privacy filter, unauthenticated rejection, and bundle secret scan (M4).
- Adaptive Knowledge Engine: captured/pending exclusion from default retrieval, opt-in unverified badge, anti-auto-verify, duplicate detection, conflict preservation (M5).
- Simulation-context-aware AI guidance & `SIMULATED` labeling verification + zero physical comm code check (M6).
- Offline-first + incremental sync + anti-overwrite of approved central records (M7).
- Admin AI Control Center backend RBAC enforcement + audit trail tests (M8).

---

## 4. Architecture Map & Reuse-vs-Rebuild Decisions

| System | Existing Modules | Decision | Target Architecture (M1–M10) |
|---|---|---|---|
| **Knowledge Database** | `automotiveKnowledgeService.ts`, `automotiveKnowledgeSeed.ts`, `unifiedOemCompiledKnowledge.json`, `ecuPinoutData.ts`, `vehicleEcuRegistry.ts`, `oemKnowledgeDatabase.ts`, `localKnowledgeDB.ts` | **EXTEND & UNIFY** (Do not replace) | Extend `automotiveKnowledgeService.ts` with v2 schema (`ProvenanceMetadata`, `versionHistory`, `ecuIdentity`, exact-match-first lookup, `MiniSearch` index, reversible migration engine `src/services/knowledgeMigrationService.ts`). Keep `localKnowledgeDB.ts` synced as device-local cache / adaptive store. |
| **AI Orchestration** | `aiRouter.ts`, `offlineEngine.ts`, `offlineChatbotEngine.ts`, `geminiIntelligenceService.ts`, `groundedSearchService.ts` | **UNIFY (Wrap & Consolidate)** | Create single `src/services/ai/unifiedAiOrchestrator.ts` + `src/services/ai/numericValidator.ts` + `src/services/ai/evidenceHierarchy.ts` + `src/services/ai/privacyFilter.ts`. Reuse existing offline retrieval & Gemini client under orchestrator control. |
| **Local AI (WebGPU)** | None | **BUILD NEW** | Build `src/services/ai/localWebLlmService.ts` + `src/workers/webLlmWorker.ts` with capability-based desktop/Android profiles, explicit download consent, storage budget, and 3-state graceful fallback (WebGPU → Local Fallback → DB-Only). |
| **Gemini Free-Tier Gateway** | `createApiApp.ts`, `geminiFreeTierRouter.ts`, `quotaManager.ts`, `imageAnalysisProvider.ts`, `openAIImageAnalysisProvider.ts` | **HARDEN & REFACTOR** | Create `src/server/services/geminiFreeTierGateway.ts` enforcing: single primary key (no multi-key quota pooling), **default-disabled admin allowlist**, hard block on paid models/OpenAI, daily/RPM quota shutoff, server-side privacy filter, and audit log. |
| **Adaptive Knowledge Engine** | `localKnowledgeDB.ts` | **EXTEND & HARDEN** | Build `src/services/ai/adaptiveKnowledgeEngine.ts` implementing strict 8-stage pipeline (`Capture → Extract → Normalize → Deduplicate → Validate → Approve → Index → Sync`), 6 statuses (`CAPTURED`, `PENDING`, `VERIFIED`, `TECHNICIAN_CONFIRMED`, `REJECTED`, `SUPERSEDED`), anti-poisoning exclusion of unverified items by default, and dual-record conflict preservation. |
| **Virtual ECU Simulation** | `src/simulation/**`, `DigitalMultimeter.tsx`, `BenchPowerSupply.tsx`, `Oscilloscope.tsx`, `PinWaveformOscilloscope.tsx`, `benchHardwareAbstractionLayer.ts` | **REUSE & HARDEN** | Preserve MNA solver and all 22 regression tests; add visible `SIMULATED` badges to DMM/PSU/PinWaveform; remove browser hardware API probing from `benchHardwareAbstractionLayer.ts` (strictly `SOFTWARE_SIMULATION_ONLY`); feed live ECU/component/fault context into Unified AI Orchestrator. |
| **Offline-First & Sync** | `src/sw.js`, `offlineSyncQueue.ts`, `benchStorageService.ts` | **EXTEND** | Keep 4 distinct layers (Authoritative DB, Device-Local Cache, Offline Document Storage, Search Index); add incremental delta sync with tombstone propagation and server-side protection so unverified local data never overwrites approved central records. |
| **Admin AI Control Center** | `AdminLicenseModal.tsx`, `AdminPinManagerModal.tsx` | **BUILD NEW (Reuse existing admin auth)** | Build `src/server/services/adminAiControlService.ts` + `/api/autoelectric/admin/ai/*` routes protected by existing `requirePinOrFirebaseAdmin`, plus `src/components/admin/AdminAiControlCenterModal.tsx` (Core + Secondary modules). Zero changes to existing auth/licensing logic. |
| **Auth & Licensing** | `firebaseAuthMiddleware.ts`, `licenseService.ts`, `trialPinService.ts`, `offlineLicenseCrypto.ts` | **REUSE AS-IS (Protected)** | Untouched per Section 2 Safety Rules. |

---

## 5. Milestone Execution Roadmap (M1–M10)

1. **M1 (`milestone/m1-database-foundation`):** Structured ECU/component provenance schema, version history, exact ECU/part-number-first lookup, MiniSearch index, backup/export + reversible migration engine tested on isolated data copies.
2. **M2 (`milestone/m2-unified-ai-orchestrator`):** Single Unified AI Orchestrator (DB-only mode first), 6-tier Evidence Hierarchy, Numeric Validator (pin/voltage/resistance/frequency verification), privacy scrubber, and honest information-gap refusal.
3. **M3 (`milestone/m3-local-ai`):** WebLLM Web Worker, desktop/Android capability profiles, explicit download consent & storage budget, 3-state execution ladder, and forced-failure drop to DB-only mode without crash.
4. **M4 (`milestone/m4-gemini-free-tier-gateway`):** Backend free-tier gateway, default-disabled admin allowlist, hard rejection of paid/OpenAI/non-allowlisted models, single-key quota tracking + auto-shutoff, server-side privacy filter, and client bundle secret scan.
5. **M5 (`milestone/m5-adaptive-knowledge-engine`):** 8-stage Adaptive Knowledge Engine (`Captured`, `Pending`, `Verified`, `Technician-confirmed`, `Rejected`, `Superseded`), strict anti-poisoning (default exclusion + opt-in unverified badge), deduplication, and dual-record conflict flagging.
6. **M6 (`milestone/m6-simulation-intelligence`):** Simulation-context-aware AI guidance (ECU + component + injected fault + DB retrieval), universal `SIMULATED` badges across all instruments, and strict virtual-only hardening.
7. **M7 (`milestone/m7-offline-and-sync`):** Distinct 4-layer offline storage architecture, incremental delta sync with deletion propagation, offline/sync UI indicators, and anti-overwrite protection for approved central records.
8. **M8 (`milestone/m8-admin-control-center`):** Backend-enforced Admin AI Control Center (Core: AI overview, local model profiles, Gemini allowlist, quota monitor, cloud kill switch, verification queue, conflict manager, audit logs; Secondary: analytics, sync monitor, credential rotation checklist, security center, usage/error monitor).
9. **M9 (`milestone/m9-security-and-regression`):** Full regression across all existing + new suites, rate-limiting verification, dependency audit review, repair-guidance disclaimer, accessibility & i18n string readiness.
10. **M10 (`milestone/m10-final-validation`):** End-to-end desktop/responsive/offline Playwright verification, acceptance test matrix, honest feature classification, and Final Report.
