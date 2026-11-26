/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { jsPDF } from 'jspdf';
import { CREATOR_CREDENTIALS } from '../constants/branding';
import {
  canonicalJsonStringify,
  computeOfflineSha256Hex,
} from './universityLabPdfService';

export const SYSTEM_BLUEPRINT_PDF_FILENAME = 'AutoElectric_Lab_PRO_System_Blueprint.pdf';

export interface SystemBlueprintSection {
  number: string;
  title: string;
  subtitle: string;
  subsections: Array<{
    heading: string;
    paragraphs?: string[];
    bullets?: string[];
    codeBlock?: string[];
  }>;
}

export const AUTOELECTRIC_SYSTEM_BLUEPRINT_SECTIONS: readonly SystemBlueprintSection[] = [
  {
    number: '01',
    title: 'System Architecture & Tech Stack',
    subtitle:
      'Frontend framework, hardened backend services, database schemas for credentials & lab states, and zero-state-loss synchronization.',
    subsections: [
      {
        heading: '1.1 Full-Stack Technology Matrix',
        bullets: [
          'Frontend Framework: React 19 + TypeScript 7 (strict) + Vite 8 SPA with modular lazyWithRetry views and scoped error boundaries.',
          'Styling & Motion: Tailwind CSS v4 (@tailwindcss/vite) + Motion (motion/react) industrial ESD workbench theme (#060B14-#0E192A) respecting useReducedMotion().',
          '3D Digital Twin & Topologies: Three.js (r187) + D3.js (v7.9) + Recharts rendering the closed-loop 3D Engine Management System (EMS) bench rig, toggleable 4-Cylinder Engine Block, procedural materials, catenary harness splines, and dual-channel oscilloscope.',
          'Physics & Circuit Engine: Custom Modified Nodal Analysis (MNA) linear/non-linear conductance matrix solver (G * V = I in BenchCircuitSolver.ts & MatrixSolver.ts) solving node voltages, branch currents, PSU OCP foldback, DMM modes (V_DC, OHM, CONTINUITY, DIODE), and fault resistances at 60Hz.',
          'Audio & Voice Subsystem: Procedural Web Audio API sound engine (audioFeedback.ts) + Web Speech API + MiniSearch (v7.2) indexing 2,080+ offline PH automotive diagnostic scenarios with bilingual English/Taglish Hands-Free Voice Coach.',
          'Backend API & Realtime: Node.js + Express 4 (server.ts, createApiApp.ts) + ws WebSocket server with route-scoped JSON limits (64kb / 1200kb / 12mb), sliding-window rate limiters, Origin-validated Live Voice proxy, and NHTSA vPIC/Recalls API integration.',
          'AI & Multimodal Pipeline: Google GenAI SDK (@google/genai ^3.6.1) server-side ai.interactions.create (gemini-omni-1.2-flash for 16:9 step tutorial videos), gemini-nano-banana-2.1 for schematic/PCB imagery, and multi-key free-tier rotation (QuotaManager.ts).',
          'Persistence & Auth: Firebase Auth (RS256) + Cloud Firestore + IndexedDB + Service Worker PWA with Optimistic Concurrency Control ([Conflict Copy]), HMAC-SHA256 offline leases, and scrypt-hashed trial PINs.',
        ],
      },
      {
        heading: '1.2 Database Schemas (User Credentials, Licensing & Lab States)',
        paragraphs: [
          'Cloud Firestore enforces owner-only access (request.auth.uid == userId), strict schema validation, bounded string lengths, and Optimistic Concurrency Control (updatedAtMs & baseUpdatedAtMs). Server-side Trial & Admin PINs are salted and hashed with crypto.scryptSync and verified via crypto.timingSafeEqual.',
        ],
        codeBlock: [
          '// Cloud Firestore: /users/{userId}/benchSessions/{sessionId}',
          'interface SavedBenchSessionDoc {',
          '  id: string;                      // Regex: ^[a-zA-Z0-9_-]{4,64}$',
          '  uid: string;                     // Owner UID or local_workstation',
          '  title: string;                   // Max 100 chars (supports [Conflict Copy])',
          '  selectedBrandKey: string;        // UNIVERSAL | TOYOTA | HONDA | BOSCH',
          '  selectedModelName: string;',
          '  selectedEcuProfileId: string | null;',
          '  powerSupply: { voltageSetting: number; currentLimit: number; isOutputEnabled: boolean };',
          '  multimeter: { isPowered: boolean; mode: string; redProbe: ProbeRef; blackProbe: ProbeRef };',
          '  wires: WireConnection[];         // Source/target pins, color, cut state, resistance',
          '  faults: InjectedFault[];         // OPEN_CIRCUIT | SHORT_TO_GND | SHORT_TO_VBAT | HIGH_R',
          '  rpmEmulator: { isActive: boolean; rpm: number; camPhaseOffsetDeg: number; ckpSignalLost: boolean };',
          '  workflowCheckedIds: string[];    // Mandatory pre-bench safety checklist IDs',
          '  preBenchGateLocked: boolean;     // Hardware energizing interlock state',
          '  baseUpdatedAtMs: number;         // OCC ancestor timestamp',
          '  updatedAtMs: number;',
          '}',
          '',
          '// Cloud Firestore: /users/{userId}/diagnosticLogs/{logId}',
          'interface SavedDiagnosticLogDoc {',
          '  id: string; uid: string; exerciseCode?: string; // LAB-01 .. LAB-12',
          '  measuredEvidence: Record<string, CapturedLabStepEvidence>;',
          '  studentConclusion: string;',
          '  sha256Signature: string;         // 64-char hex digest over canonical payload',
          '  createdAtMs: number;',
          '}',
          '',
          '// Server Credential Store: trialPinService.ts (scrypt + timingSafeEqual)',
          'interface ServerTrialPinRecord {',
          '  trialId: string; pinHashHex: string; pinSaltHex: string; maskedPin: string;',
          '  durationHours: 3 | 4 | 5 | 6 | 720 | 2160 | 4320 | 8760; // 3h-6h or 30d/3m/6m/1y',
          '  status: "UNUSED" | "ACTIVE" | "EXPIRED" | "REVOKED";',
          '  boundDeviceId: string | null;    // Strict 1-device workstation lock',
          '  totalDevicesUsed: number;        // Monotonic counter preserved across admin resets',
          '  totalActivations: number; expiresAtMs: number | null;',
          '}',
        ],
      },
      {
        heading: '1.3 Zero-State-Loss State Management Strategy',
        bullets: [
          'Tier 1 (Synchronous 60Hz React State + Mirror Refs): Every MNA circuit tick (solveCircuit), probe snap, and actuator PWM transition executes in memory with zero network blocking.',
          'Tier 2 (Durable Local-First IndexedDB): Dual IndexedDB databases (autoelectric-bench-offline-v1 and autoelectric-step-tutorials-v1) persist sessions, fault sequences, mutation queues (_deleted tombstones), and cached step tutorials under LOCAL_WORKSTATION_UID even in 100% offline PIN-only mode.',
          'Tier 3 (Cloud Firestore OCC & Non-Destructive Conflict Forking): Upon Google Sign-In, local drills promote idempotently to the user account. If remote.updatedAtMs > local.baseUpdatedAtMs, the sync engine automatically forks a [Conflict Copy] session (capped at 100 chars) rather than overwriting technician work.',
          'Scoped Fault Isolation Boundaries: Independent AppErrorBoundary and ModuleErrorBoundary wrappers isolate the 3D WebGL canvas, Oscilloscope, and Modals so a shader reset never drops MNA solver state or captured exam evidence.',
        ],
      },
    ],
  },
  {
    number: '02',
    title: 'Core Module Specifications',
    subtitle:
      'Glassmorphic Landing & PIN Verification with Web Audio SFX, University Automotive Lab & 3D EMS Twin, and Grounded Step Video Tutorials.',
    subsections: [
      {
        heading: '2.1 Landing & PIN Verification Flow (IntroductionPinLandingPage.tsx)',
        bullets: [
          'Strict Pre-Bench Entry Gate: The Bench Lab DOM remains unmounted until isBenchEntryAuthorized is satisfied via an 8-Digit Technician Trial PIN, Master Admin PIN, or Firebase Google Sign-In.',
          'Futuristic Glassmorphic Console: Frosted midnight-navy surface (bg-[#0A1220]/78 backdrop-blur-xl border-[#19C8F5]/30) with top cyan laser hairline, glowing status badge (pairing Lock/Unlock/AlertTriangle icons with explicit text and AES/SHA-256 badge), 8-slot segmented PIN readout, and tactile 3x4 keypad.',
          'Procedural Web Audio API Synthesis (audioFeedback.ts): Zero-asset real-time oscillator synthesis including playPinKeypadClick("digit" | "clear" | "backspace") (1180Hz->760Hz triangle transient), playAccessGrantedChime() (C5-E5-G5-C6 ascending harmonic arpeggio), and playSystemLockSound("lock" | "error") (220Hz->138Hz dual pulse).',
          'Two-Phase Post-Verification Welcome Overlay (WelcomeBenchOverlay.tsx): Automatically triggers on landing-to-bench entry. Phase 1 displays "Welcome to the Bench Lab" with MNA initialization status; Phase 2 cross-fades to "Welcome to AutoElectric Lab PRO", dynamically incorporating CREATOR_CREDENTIALS (Ruben Llego, Elnombre Danong, RMATi).',
        ],
      },
      {
        heading: '2.2 University Automotive Lab & Closed-Loop 3D EMS Bench Interface',
        bullets: [
          '3-Tier Taglish/English Curriculum (LAB-01 to LAB-12): Level 1 Beginner (cold resistance, 5V reference, TPS sweep, ECT/IAT thermistor, injector coil ohms), Level 2 Intermediate (powered relay control, COP ignition drop, ground offset, MAP response), and Level 3 Advanced (60-2 CKP/CMP timing, CAN bus termination, intermittent faults).',
          'Tail-to-Bench 3D Digital Twin (ThreeBenchTwin.tsx & BenchSceneManager.ts): Dynamically instantiates the active ECU housing, connector pin count, 4x Port Fuel Injectors (INJ_1-4), 4x Coil-on-Plug (COIL_1-4) firing in 1-3-4-2 order, translucent Fuel Pump Module, PDU Relay/Fuse Block, and toggleable 4-Cylinder Engine Block.',
          'Live Telemetry & Fault Mesh Overlay (useEmsTelemetrySync.ts & LabStatusFooter.tsx): Animates current pulses, injector spray, spark arcs, blown fuses, and 3D wire-mesh fault overlays directly from BenchCircuitSolver.ts, with a footer Sync Status badge and Live Data / Manual Review toggle.',
        ],
      },
      {
        heading: '2.3 Automated Step Video Tutorial Pipeline (Level 1 & Level 2 Exercises)',
        bullets: [
          'Per-Step Integration: Every step card in Level 1 and Level 2 modules renders a "Watch Step Tutorial" button (UniversityLabGuidanceCard.tsx & GuidedLabStepCard.tsx) opening StepTutorialVideoModal.tsx.',
          'Server-Side @google/genai Pipeline (POST /api/autoelectric/step-tutorial-video): Validates tier eligibility and invokes gemini-omni-1.2-flash via ai.interactions.create with response_format: { type: "video", aspect_ratio: "16:9", duration: "5s"|"6s"|"8s", resolution: "720p" }.',
          'Strict Curriculum Grounding (stepTutorialBuilder.ts): Prompts and 4-segment time-synced subtitles are built deterministically from verified step metadata (focusPinLabel, redProbeLabel, blackProbeLabel, dmmModeDisplay, requiredPsuState, expectedReadingLabel, toleranceLabel)—eliminating hallucinated pin names or ranges.',
          'Interactive Animated Schematic + Voice Guidance Fallback: When video generation encounters HTTP 403/429/503 or offline conditions, the modal automatically falls back to InteractiveStepSchematic (16:9 animated SVG showing PSU switch, DMM rotary dial, Red/Black probe contact, current pulses, and stabilized LCD reading) paired with Web Speech API + Web Audio cue tones.',
          'Step Caching & Instructor Customization Panel: Caches clips in IndexedDB (stepTutorialCacheService.ts) and provides a collapsible instructor panel to configure Narration Style (Taglish Coach, Concise Bench, Instructor Detailed), Duration (5s/6s/8s), Voice Guidance default, cache clearing, and Batch Pre-Generation.',
        ],
      },
    ],
  },
  {
    number: '03',
    title: 'Security & Exam Integrity: 3-Layer Assessment Model',
    subtitle:
      'Defense-in-depth anti-cheating architecture for university practical automotive diagnostics.',
    subsections: [
      {
        heading: '3.1 Layer 1 — Cryptographic Workstation Gate & Single-Device Binding',
        bullets: [
          'Pre-Authentication DOM Isolation: Practical lab tools and AI routes remain inaccessible until verified.',
          'Scrypt & Timing-Safe PIN Hashing: Trial PINs and Master Admin PINs use 16-byte random salts + crypto.scryptSync (64-byte key) + crypto.timingSafeEqual. Zero admin secrets exist in client bundles or Web Storage.',
          'Single-Device Workstation Lock: Each 8-digit trial PIN binds strictly to one workstation deviceId. Concurrent login attempts from a second device are rejected with HTTP 403 DEVICE_LIMIT_REACHED, while cumulative device history is preserved in the audit log.',
        ],
      },
      {
        heading: '3.2 Layer 2 — Read-Only MNA Physics Telemetry Lock & Safety Interlock',
        bullets: [
          'Zero Manual Input Spoofing: Students cannot type or override voltage/resistance values; readings are bound read-only to circuitSolution.multimeterReading solved live by the MNA matrix engine.',
          'Four-Point Physical Setup Validation: Capturing a step requires simultaneous verification of (1) PSU state (OFF for cold ohmmeter checks, ON for live voltage checks), (2) DMM rotary selector mode, (3) Red (+) and Black (-) probe terminal attachment, and (4) tolerance window evaluation.',
          'Ohmmeter-on-Live-Rail Safety Block: Probing an energized circuit in OHM/CONTINUITY mode triggers SAFETY_BLOCKED and prevents step capture.',
          'Sequential Conclusion Interlock: The Student Diagnostic Conclusion and Exam PDF Export button unlock strictly after 100% of measurement steps are captured from live MNA states.',
        ],
      },
      {
        heading: '3.3 Layer 3 — Canonical SHA-256 Tamper-Proof Stamp & Offline QR Verifier',
        bullets: [
          'Canonical Payload Serialization: All captured step measurements, probe terminals, timestamps, student metadata, and conclusions are serialized into a key-sorted canonical JSON envelope.',
          '64-Character SHA-256 Cryptographic Seal: A SHA-256 digest and machine-readable QR verification token are embedded into the exported A4 vector PDF.',
          'Air-Gapped Instructor Verifier (InstructorVerifierView.tsx): Instructors verify student PDFs or QR tokens 100% offline. Any single-byte modification to a measured reading or student identifier invalidates the SHA-256 signature and flags TAMPER_DETECTED.',
        ],
      },
    ],
  },
  {
    number: '04',
    title: 'Phased Integration Roadmap',
    subtitle:
      'End-to-end engineering execution from backend hardening to multimodal AI and 13-suite stress verification.',
    subsections: [
      {
        heading: 'Phase 1 — Core MNA Physics Engine, Security Hardening & Backend Deployment',
        bullets: [
          'Deploy Express API (createApiApp.ts) with hardened security headers, route-scoped JSON limits, sliding-window rate limiters, and RS256 Firebase + Trial PIN middleware.',
          'Verify and deploy Cloud Firestore rules (firestore.rules) with owner-only subcollection isolation and 100-char OCC title bounds.',
          'Validate MNA conductance matrix solver across OEM ECU profiles and fault injection states (circuitEngine.test.ts, securityAndOffline.test.ts).',
        ],
      },
      {
        heading: 'Phase 2 — Glassmorphic Landing Gate, Procedural Audio & Welcome Credentials',
        bullets: [
          'Deliver glassmorphic PIN verification console (IntroductionPinLandingPage.tsx) with glowing status badges, 8-slot segmented readout, tactile keypad, and unauthorized-domain self-recovery.',
          'Integrate procedural Web Audio API sound synthesis (audioFeedback.ts) and two-phase post-login WelcomeBenchOverlay.tsx dynamically displaying CREATOR_CREDENTIALS.',
        ],
      },
      {
        heading: 'Phase 3 — Grounded AI Step Video Tutorials, 3D EMS Twin & Bilingual Voice Coach',
        bullets: [
          'Launch POST /api/autoelectric/step-tutorial-video (gemini-omni-1.2-flash) with grounded prompt/subtitle builders, InteractiveStepSchematic animated SVG fallback, IndexedDB step cache, and collapsible Instructor Customization Panel.',
          'Synchronize 3D EMS Bench Twin (ThreeBenchTwin.tsx, 4-Cylinder Engine Block, firing order 1-3-4-2, wire-mesh fault overlay) and bilingual Hands-Free Voice Coach with live MNA telemetry.',
        ],
      },
      {
        heading: 'Phase 4 — 3-Layer Exam Integrity Stress Testing & Production Release',
        bullets: [
          'Execute stress tests across all 13 automated test suites (circuitEngine, pcbDiagnostic, securityAndOffline, automotiveIntegration, gaugeTelemetry, harnessAndTwin, cleanupAndBilingualAiProof, connectionHealth, blueprintMasterSuite, clientDiagnosticPdf, systemVoiceCoach, calibrationAudit, landingAndStepTutorials).',
          'Audit offline PWA Service Worker caching policies, 60 FPS WebGL frame budget, and air-gapped SHA-256 exam PDF verification.',
        ],
      },
    ],
  },
] as const;

export interface GeneratedSystemBlueprintPdfResult {
  pdfBytes: Uint8Array;
  sha256Hash: string;
  pageCount: number;
  fileName: string;
}

/**
 * Generates the complete multi-page A4 vector PDF for the AutoElectric Lab PRO
 * End-to-End System Blueprint using jsPDF. Works in both Node.js and browser runtimes.
 */
export async function generateSystemBlueprintPdf(options?: {
  generatedAtIso?: string;
  skipBrowserDownload?: boolean;
}): Promise<GeneratedSystemBlueprintPdfResult> {
  const generatedAtIso = options?.generatedAtIso || new Date().toISOString();

  const canonicalPayload = canonicalJsonStringify({
    document: 'AUTOELECTRIC_LAB_PRO_SYSTEM_BLUEPRINT_V1',
    organization: CREATOR_CREDENTIALS.organization,
    leaders: CREATOR_CREDENTIALS.leaders.map((l) => ({
      name: l.name,
      roleTitle: l.roleTitle,
      subtitle: l.subtitle,
      email: l.email || null,
    })),
    sections: AUTOELECTRIC_SYSTEM_BLUEPRINT_SECTIONS.map((s) => ({
      number: s.number,
      title: s.title,
      headings: s.subsections.map((sub) => sub.heading),
    })),
  });
  const sha256Hash = await computeOfflineSha256Hex(canonicalPayload);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  let cursorY = 18;

  const drawPageChrome = (isFirstPage: boolean) => {
    // Dark Navy Top Header Banner
    doc.setFillColor(10, 18, 32);
    doc.rect(0, 0, pageWidth, isFirstPage ? 38 : 16, 'F');

    // Cyan Accent Line
    doc.setDrawColor(25, 200, 245);
    doc.setLineWidth(0.5);
    doc.line(0, isFirstPage ? 38 : 16, pageWidth, isFirstPage ? 38 : 16);

    if (isFirstPage) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(234, 243, 255);
      doc.text('AUTOELECTRIC LAB PRO — END-TO-END SYSTEM BLUEPRINT', marginX, 13);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(25, 200, 245);
      doc.text(
        `${CREATOR_CREDENTIALS.organization} · Principal Systems Architecture Specification`,
        marginX,
        19.5
      );

      // Creator Credentials Box in Banner
      const lead = CREATOR_CREDENTIALS.leaders[0];
      const coOwner = CREATOR_CREDENTIALS.leaders[1];
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(255, 176, 32);
      doc.text(
        `Lead Architect: ${lead.name} (${lead.subtitle} · ${lead.email})   |   VIP Co-Owner: ${coOwner.name} (${coOwner.subtitle})`,
        marginX,
        26
      );

      doc.setFont('courier', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(145, 164, 189);
      doc.text(
        `Generated: ${generatedAtIso.slice(0, 19).replace('T', ' ')} UTC   ·   Blueprint SHA-256: ${sha256Hash.slice(0, 32)}...`,
        marginX,
        32.5
      );
      cursorY = 46;
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(234, 243, 255);
      doc.text('AUTOELECTRIC LAB PRO — PRINCIPAL SYSTEM ARCHITECTURE BLUEPRINT', marginX, 10.5);

      doc.setFont('courier', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(25, 200, 245);
      doc.text('RMATi Verified Architecture', pageWidth - marginX, 10.5, { align: 'right' });
      cursorY = 24;
    }
  };

  const ensureSpace = (neededMm: number) => {
    if (cursorY + neededMm > pageHeight - 18) {
      doc.addPage();
      drawPageChrome(false);
    }
  };

  drawPageChrome(true);

  for (const section of AUTOELECTRIC_SYSTEM_BLUEPRINT_SECTIONS) {
    ensureSpace(22);

    // Section Header Bar
    doc.setFillColor(14, 25, 42);
    doc.setDrawColor(32, 54, 83);
    doc.setLineWidth(0.35);
    doc.roundedRect(marginX, cursorY, contentWidth, 13.5, 1.5, 1.5, 'FD');

    doc.setFont('courier', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(25, 200, 245);
    doc.text(`SECTION ${section.number}`, marginX + 3.5, cursorY + 5.3);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(234, 243, 255);
    doc.text(section.title.toUpperCase(), marginX + 31, cursorY + 5.3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(168, 187, 212);
    doc.text(section.subtitle, marginX + 3.5, cursorY + 10.8);

    cursorY += 17.5;

    for (const sub of section.subsections) {
      ensureSpace(12);

      // Subsection Heading
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.8);
      doc.setTextColor(15, 35, 66);
      doc.text(sub.heading, marginX, cursorY);

      doc.setDrawColor(25, 200, 245);
      doc.setLineWidth(0.3);
      doc.line(marginX, cursorY + 1.4, marginX + contentWidth, cursorY + 1.4);
      cursorY += 5.5;

      if (sub.paragraphs) {
        for (const para of sub.paragraphs) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.6);
          doc.setTextColor(30, 41, 59);
          const lines = doc.splitTextToSize(para, contentWidth) as string[];
          ensureSpace(lines.length * 4.1 + 2);
          doc.text(lines, marginX, cursorY);
          cursorY += lines.length * 4.1 + 1.8;
        }
      }

      if (sub.bullets) {
        for (const bullet of sub.bullets) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(24, 34, 52);
          const wrapped = doc.splitTextToSize(bullet, contentWidth - 5) as string[];
          ensureSpace(wrapped.length * 4 + 1.6);

          doc.setFillColor(22, 119, 255);
          doc.circle(marginX + 1.5, cursorY - 1.1, 0.75, 'F');
          doc.text(wrapped, marginX + 4.5, cursorY);
          cursorY += wrapped.length * 4 + 1.4;
        }
      }

      if (sub.codeBlock && sub.codeBlock.length > 0) {
        const lineHeight = 3.5;
        const boxHeight = sub.codeBlock.length * lineHeight + 5;
        ensureSpace(boxHeight + 4);

        doc.setFillColor(8, 15, 27);
        doc.setDrawColor(32, 54, 83);
        doc.setLineWidth(0.3);
        doc.roundedRect(marginX, cursorY - 2.5, contentWidth, boxHeight, 1.2, 1.2, 'FD');

        doc.setFont('courier', 'normal');
        doc.setFontSize(7.1);
        let codeY = cursorY + 1.2;
        for (const codeLine of sub.codeBlock) {
          if (codeLine.trim().startsWith('//')) {
            doc.setTextColor(25, 200, 245);
          } else {
            doc.setTextColor(226, 236, 249);
          }
          doc.text(codeLine, marginX + 3, codeY);
          codeY += lineHeight;
        }
        cursorY += boxHeight + 3;
      }

      cursorY += 2.2;
    }

    cursorY += 3;
  }

  // Final Cryptographic Seal & Governance Block
  ensureSpace(26);
  doc.setFillColor(10, 18, 32);
  doc.setDrawColor(25, 200, 245);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginX, cursorY, contentWidth, 22, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(32, 216, 137);
  doc.text('VERIFIED ARCHITECTURE & EXAM INTEGRITY SEAL (SHA-256)', marginX + 4, cursorY + 6);

  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(234, 243, 255);
  doc.text(`SHA-256 Digest: ${sha256Hash}`, marginX + 4, cursorY + 11.5);
  doc.text(
    `Standards: ${CREATOR_CREDENTIALS.architectureSummary}`,
    marginX + 4,
    cursorY + 16.5
  );

  // Stamp page numbers on all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `AutoElectric Lab PRO · RMATi System Blueprint · Lead Architect: ${CREATOR_CREDENTIALS.leaders[0].name}`,
      marginX,
      pageHeight - 7.5
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 7.5, {
      align: 'right',
    });
  }

  const arrayBuffer = doc.output('arraybuffer');
  const pdfBytes = new Uint8Array(arrayBuffer);

  if (
    !options?.skipBrowserDownload &&
    typeof window !== 'undefined' &&
    typeof document !== 'undefined'
  ) {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = SYSTEM_BLUEPRINT_PDF_FILENAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  return {
    pdfBytes,
    sha256Hash,
    pageCount: totalPages,
    fileName: SYSTEM_BLUEPRINT_PDF_FILENAME,
  };
}
