# AUTOELECTRIC LAB PRO — STARTMYCAR DATA INGESTION REPORT

**High-Fidelity Recursive Crawling • Zero-Fabrication Integrity • 3-Tier Classification • Offline Normalization**

---

## 1. Executive Summary

As the Master Data Ingestion Architect, a recursive crawl and offline data normalization pipeline was designed, executed, and integrated for StartMyCar electrical power distribution diagrams and vehicle identification profiles.

The engine crawled and parsed **14 vehicle profiles** across **6 major OEM brands** (Toyota, Ford, Nissan, Honda, Isuzu, Suzuki), extracting **1,790 individual electrical cavities** (fuses, relays, and multi-fuse blocks). Every record is strictly stamped with zero-fabrication provenance and classified into structured verification tiers for offline ingestion into the AutoElectric Lab Pro diagnostic knowledge base.

---

## 2. Ingestion Pipeline Architecture

```
[StartMyCar Web Source]
        │
        ▼ (Recursive Fetch with Exponential Backoff & 301 Redirect Follow)
[startMyCarIngestionEngine.ts]
        │
        ├─► [Deduplication Engine] ── Cross-reference against INITIAL_AUTOMOTIVE_CATALOG,
        │                             STARTMYCAR_PRESET_VEHICLES, & OEM_PCB_HARDWARE_SPECS
        │
        ├─► [Circuit Role Classifier] ── Categorize each fuse/relay:
        │                                 • ECU_POWER (EFI, ECM, PCM, Engine Control)
        │                                 • SENSOR_VREF (5V VREF, VVT, O2, MAF, MAP)
        │                                 • OBD2_DLC (Diagnostic Pin 16 power)
        │                                 • FUEL_PUMP (Fuel pump motor & relay)
        │                                 • IGNITION (Switched KL15 & Starter)
        │                                 • CHASSIS (ABS, VSC, ESP, Airbag)
        │                                 • LIGHTING (Headlights, Fog lamps, Signals)
        │                                 • ACCESSORY (Wiper, Defogger, Blower, Audio)
        │
        ├─► [Zero-Fabrication Tier Classifier]
        │     • VERIFIED (Tier 1: OEM-matched, complete multi-box layout, positive amperage)
        │     • COMMUNITY_UNVERIFIED (Tier 2: Single box / community diagram awaiting bench verification)
        │     • LOW_RATING_RESTRICTED (Tier 3: Sparse / partial metadata only)
        │
        └─► [Materialized Output]
              • src/data/startmycar/{brand}/{model}/{year}.json (14 profiles)
              • src/data/startmycar/startmycarCatalog.json (Master Manifest)
              • src/services/startMyCarKnowledgeService.ts (Offline Search Engine)
              • src/components/GroundedSearchPanel.tsx (Interactive In-App Viewer)
```

---

## 3. Ingested Fleet Directory & Deduplication Results

| Brand | Model | Year | Generation / Engines | Box Count | Total Cavities | Tier | Deduplication Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Toyota** | Corolla | 2020 | 12th Gen (M20A-FKS, 2ZR-FAE, 2ZR-FXE) | 4 boxes | 197 | `VERIFIED` | `AUGMENTED_EXISTING` (`preset-toyota-corolla-2020`) |
| **Toyota** | Hilux | 2019 | AN120 (1GD-FTV, 2GD-FTV) | 4 boxes | 179 | `VERIFIED` | `AUGMENTED_EXISTING` (`preset-toyota-hilux-2019`) |
| **Toyota** | Camry | 2020 | XV70 (A25A-FKS) | 2 boxes | 114 | `VERIFIED` | `NEW_RECORD` |
| **Toyota** | RAV4 | 2019 | XA50 (M20A, A25A) | 3 boxes | 139 | `VERIFIED` | `NEW_RECORD` |
| **Ford** | Ranger | 2019 | T6 Facelift (Duratorq 2.2L / 3.2L) | 4 boxes | 162 | `VERIFIED` | `AUGMENTED_EXISTING` (`preset-ford-ranger-2019`) |
| **Ford** | F-150 | 2016 | 13th Gen (EcoBoost 2.7L / 3.5L, 5.0L V8) | 2 boxes | 168 | `VERIFIED` | `AUGMENTED_EXISTING` (`preset-ford-f-150-2016`) |
| **Nissan** | Sentra | 2018 | B17 (MRA8DE, MR16DDT) | 3 boxes | 82 | `VERIFIED` | `AUGMENTED_EXISTING` (`preset-nissan-sentra-2018`) |
| **Nissan** | Sentra | 2016 | B17 (MRA8DE) | 3 boxes | 82 | `VERIFIED` | `AUGMENTED_EXISTING` (`nissan-sentra-b17`) |
| **Nissan** | Navara | 2020 | D23 NP300 (YD25DDTi, YS23DDT) | 3 boxes | 92 | `VERIFIED` | `AUGMENTED_EXISTING` (`pcb-nissan-navara-yd25`) |
| **Honda** | Civic | 2018 | 10th Gen (L15B7 Turbo, K20C2) | 2 boxes | 112 | `COMMUNITY_UNVERIFIED` | `AUGMENTED_EXISTING` (`preset-honda-civic-2018`) |
| **Honda** | CR-V | 2019 | 5th Gen (L15B Turbo) | 2 boxes | 128 | `COMMUNITY_UNVERIFIED` | `NEW_RECORD` |
| **Isuzu** | D-Max | 2020 | 3rd Gen (4JJ3-TCX 3.0L, RZ4E 1.9L) | 2 boxes | 98 | `VERIFIED` | `NEW_RECORD` |
| **Suzuki** | Swift | 2018 | A2L (K12C, K10C Boosterjet) | 5 boxes | 155 | `VERIFIED` | `NEW_RECORD` |
| **Suzuki** | Jimny | 2020 | JB64 / JB74 (K15B 1.5L) | 2 boxes | 82 | `VERIFIED` | `NEW_RECORD` |

---

## 4. UI Integration & Offline In-App Search

The ingested StartMyCar dataset is directly surfaced inside [src/components/GroundedSearchPanel.tsx](file:///home/user/workspaces/Autoelectric-Lab-Pro-/src/components/GroundedSearchPanel.tsx):
- When a technician selects a preset or searches for an ingested vehicle (e.g. 2020 Toyota Corolla), the panel dynamically loads the full power distribution directory from local memory.
- Shows total cavities, verification tier, detected engine variants, box selector tabs (Engine Fuse Panel, Interior Fuse Panel, Relays), and a filterable cavity table.
- Categorizes circuit roles (`ECU_POWER`, `SENSOR_VREF`, `OBD2_DLC`, `FUEL_PUMP`, `IGNITION`) with dedicated color badges.
- Operates 100% offline with zero external network requests or iframe dependencies.

---

## 5. Verification & Testing

- **Ingestion Test Suite ([src/simulation/tests/startMyCarIngestion.test.ts](file:///home/user/workspaces/Autoelectric-Lab-Pro-/src/simulation/tests/startMyCarIngestion.test.ts))**:
  1. Manifest schema and vehicle count verification (`totalVehicles >= 14`, `totalCavities >= 1500`).
  2. Zero-fabrication provenance stamps on every profile (`sourceUrl`, `crawledAt`, `zeroFabricationIntegrity: true`).
  3. Deduplication linking with existing repository seeds.
  4. Accurate circuit role classification across powertrain and sensor circuits.
  5. 3-tier classification enforcement.
  6. Offline search and query retrieval.
- **Overall System Health**:
  - `npm run lint` (`tsc --noEmit`): **PASS (0 errors)**
  - `npm test`: **PASS (All 20 test suites, 100% green)**
  - `npm run release:check:quick`: **PASS (`READY TO MERGE & PUBLISH`)**
