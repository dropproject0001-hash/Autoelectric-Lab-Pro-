import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Gauge,
  GitBranch,
  Globe,
  Layers,
  Pause,
  Play,
  Presentation,
  ShieldCheck,
  Sliders,
  TrendingUp,
} from 'lucide-react';
import { APP_LOGO_SRC } from '../../constants/branding';
import type { LabTab } from '../LabTopNav';

import slideBenchOverviewImg from '../../assets/images/slide_bench_overview_1794934569395.jpg';
import slidePowerDmmImg from '../../assets/images/slide_power_dmm_1794934568868.jpg';
import slideHarnessTopologyImg from '../../assets/images/slide_harness_topology_1794934570054.jpg';
import slideOscilloscopeFaultsImg from '../../assets/images/slide_oscilloscope_faults_1794934570294.jpg';
import slide3dPcbScannerImg from '../../assets/images/slide_3d_pcb_scanner_1794934571496.jpg';
import slideCloudDiagnosticsImg from '../../assets/images/slide_cloud_diagnostics_1794934572812.jpg';

export interface WalkthroughSlide {
  id: string;
  indexLabel: string;
  track: 'Daily Shop Workflow' | 'Advanced Capabilities' | 'Credentials & Governance';
  title: string;
  subtitle: string;
  imageSrc: string;
  imageAlt: string;
  dailyBenefitHeadline: string;
  dailyBenefitSummary: string;
  highlights: readonly {
    label: string;
    detail: string;
  }[];
  primaryActionLabel: string;
  targetTab?: LabTab;
  secondaryActionLabel?: string;
  secondaryTargetTab?: LabTab;
  isCredentialsSlide?: boolean;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

export const WALKTHROUGH_SLIDES: readonly WalkthroughSlide[] = [
  {
    id: 'bench-foundation',
    indexLabel: '01',
    track: 'Daily Shop Workflow',
    title: '01. Zero-Risk ECU Bench Pre-Testing',
    subtitle: 'Verify electrical behavior before energizing a live vehicle harness.',
    imageSrc: slideBenchOverviewImg,
    imageAlt:
      'Bosch automotive ECU connected via breakout harness to multimeter probes and a programmable 12.6V bench power supply on an ESD charcoal mat.',
    dailyBenefitHeadline: 'Stops Blind Parts-Swapping & Board Burnouts',
    dailyBenefitSummary:
      'Technicians isolate whether a no-start or sensor dropout lives inside the ECU, the engine harness, or the sensor itself before touching a customer vehicle.',
    highlights: [
      {
        label: 'Deterministic MNA Solver',
        detail:
          'Computes true nodal voltages and branch currents across all 16 ECU pins using Modified Nodal Analysis—never hardcoded guesses.',
      },
      {
        label: 'Acoustic Safety Alerts',
        detail:
          'Instant audible feedback warns the technician the moment a short circuit, over-current trip, or voltage sag occurs on the bench.',
      },
      {
        label: 'Shop-Bay Offline Readiness',
        detail:
          'Runs natively offline via IndexedDB storage with automatic cloud reconciliation when shop Wi-Fi reconnects.',
      },
    ],
    primaryActionLabel: 'Open Bench Lab',
    targetTab: 'BENCH_LAB',
    icon: Cpu,
  },
  {
    id: 'power-and-dmm',
    indexLabel: '02',
    track: 'Daily Shop Workflow',
    title: '02. Programmable DC Supply, DMM & Fault Isolation',
    subtitle: 'Everyday bench power control paired with evidence-ranked measurement analysis.',
    imageSrc: slidePowerDmmImg,
    imageAlt:
      'Programmable laboratory DC power supply displaying 13.80V alongside red and black digital multimeter probes inspecting an ECU header.',
    dailyBenefitHeadline: 'Turns Raw Meter Numbers Into Ranked Root Causes',
    dailyBenefitSummary:
      'Instead of scrolling forums after probing KL30, KL15, or 5V reference pins, technicians enter actual shop DMM readings to isolate faults by physical evidence.',
    highlights: [
      {
        label: 'KL30 / KL15 & 0–30V Rails',
        detail:
          'Preset bench voltages (12V Bench, 14.4V Charging, 5V Sensor Rail) with adjustable current limit trips protect sensitive driver stages.',
      },
      {
        label: 'Interactive Red (+) & COM (-) Leads',
        detail:
          'Probe any ECU pin, component pad, or chassis ground with auto-ranging VDC, VAC, and resistance continuity readouts.',
      },
      {
        label: 'Evidence-Ranked Fault Isolation',
        detail:
          'Separates OEM-verified specifications, calculated circuit results, and engineering hypotheses so diagnosis stays defensible.',
      },
    ],
    primaryActionLabel: 'Open Power & DMM Bench',
    targetTab: 'BENCH_LAB',
    icon: Gauge,
  },
  {
    id: 'harness-topology',
    indexLabel: '03',
    track: 'Daily Shop Workflow',
    title: '03. Visual Harness Topology & 16-Pin Diagnostics',
    subtitle: 'See complex multi-wire harnesses as clear interactive electrical nets.',
    imageSrc: slideHarnessTopologyImg,
    imageAlt:
      'Technical diagram of an automotive ECU wiring harness network topology connecting central terminal nodes to sensors, injectors, ignition coils, and fuel pump.',
    dailyBenefitHeadline: 'Traces Intermittent Opens & Shared Grounds in Seconds',
    dailyBenefitSummary:
      'Visualizes how power rails, sensor reference buses, CAN differential pairs, and low-side injector returns connect across the loom without losing continuity.',
    highlights: [
      {
        label: 'Force, Radial & Bipartite Graph Modes',
        detail:
          'Switch seamlessly between the Schematic Blueprint and the D3 Force-Directed Topology Graph to untangle crowded circuits.',
      },
      {
        label: 'Equipotential Net Filtering',
        detail:
          'Hover or filter Power & Ground (KL30/KL31), 5V VREF Sensors, Actuators, or CAN Bus to dim unrelated branches instantly.',
      },
      {
        label: 'Click-to-Cut & CAN Bus Load Console',
        detail:
          'Toggle open-circuit wire cuts on the fly while monitoring all 16 live pin readouts and simulated CAN bus utilization below.',
      },
    ],
    primaryActionLabel: 'Open Harness Topology',
    targetTab: 'WIRING_DIAGRAM',
    icon: GitBranch,
  },
  {
    id: 'oscilloscope-faults',
    indexLabel: '04',
    track: 'Advanced Capabilities',
    title: '04. Dual-Trace Oscilloscope & Fault Injection Matrix',
    subtitle: 'Capture fast transient spikes and rehearse real failure modes safely.',
    imageSrc: slideOscilloscopeFaultsImg,
    imageAlt:
      'Automotive dual-channel digital oscilloscope displaying an emerald crankshaft square-wave signal above an amber fuel injector flyback spike.',
    dailyBenefitHeadline: 'Catches Fast Signals Standard OBD Scanners Miss',
    dailyBenefitSummary:
      'Reproduce and diagnose high-speed crank triggers, PWM actuator drives, and inductive flyback events alongside live OBD-II SAE J1979 DTC triggers.',
    highlights: [
      {
        label: 'High-Speed Signal Emulation',
        detail:
          'Inspect 60-2 missing-tooth CKP patterns, CMP phase sync, TPS/MAP/ECT sweeps, differential CAN frames, and >40V injector flyback spikes.',
      },
      {
        label: 'Controlled Fault Injection',
        detail:
          'Inject Shorts to GND/VBAT, High Resistance corrosion, or Open Circuits to verify P0335, P0201, P0107, and P0118 fault behavior.',
      },
      {
        label: 'Synchronized RPM & Gauge Telemetry',
        detail:
          'Drive simulated speed-density airflow and drivetrain telemetry directly from the shared MNA circuit solution.',
      },
    ],
    primaryActionLabel: 'Open Oscilloscope',
    targetTab: 'OSCILLOSCOPE',
    secondaryActionLabel: 'Open Pinouts',
    secondaryTargetTab: 'ECU_PINOUT',
    icon: Activity,
  },
  {
    id: '3d-twin-pcb',
    indexLabel: '05',
    track: 'Advanced Capabilities',
    title: '05. 3D Explodable Bench Twin & OEM PCB Scanner',
    subtitle: 'Bridge external harness connector symptoms directly to board-level silicon.',
    imageSrc: slide3dPcbScannerImg,
    imageAlt:
      'Isometric cutaway of an exploded automotive ECU housing showing microcontroller, power MOSFET injector drivers, thermal highlight, and 16-pin connector.',
    dailyBenefitHeadline: 'Connects Connector Pin Faults to Internal Driver ICs',
    dailyBenefitSummary:
      'Eliminate blind board probing by pairing an interactive 3D hardware twin with verified OEM PCB component layouts and electro-thermal cross-probing.',
    highlights: [
      {
        label: 'Interactive 3D ECU Hardware Twin',
        detail:
          'Explode aluminum covers cleanly to inspect internal PCBs, RPM-synced 36-1 crank trigger rotation, throttle encoder, and thermal overlays.',
      },
      {
        label: 'Verified Multi-OEM PCB Library',
        detail:
          'Built-in Toyota, Ford, Mitsubishi, and Nissan OEM PCB specs map QFP microcontrollers, MOSFETs, and 0.010Ω shunts to external harness pins.',
      },
      {
        label: 'Automated Multi-Pin Logic Check',
        detail:
          'Continuously audits critical pin sets simultaneously and flags unexpected voltage drops or electro-thermal stress hazards.',
      },
    ],
    primaryActionLabel: 'Open 3D Bench Twin',
    targetTab: 'THREE_D_TWIN',
    secondaryActionLabel: 'Open PCB Scanner',
    secondaryTargetTab: 'PCB_SCANNER',
    icon: Layers,
  },
  {
    id: 'ecosystem-workspace',
    indexLabel: '06',
    track: 'Advanced Capabilities',
    title: '06. AI Studio, OEM VIN Grounding, Voice & Workspace',
    subtitle: 'Complete repair documentation, recall checks, and hands-free shop commands.',
    imageSrc: slideCloudDiagnosticsImg,
    imageAlt:
      'Automotive diagnostic engineer desk with laptop displaying telemetry charts and rugged tablet displaying ECU schematic pinouts beside a harness connector.',
    dailyBenefitHeadline: 'Turns Bench Diagnostics Into Auditable Shop Records',
    dailyBenefitSummary:
      'Validate vehicle applicability with real NHTSA recall data, run hands-free voice macros while holding probes, and export live telemetry locally.',
    highlights: [
      {
        label: 'NHTSA vPIC VIN & Recall Verification',
        detail:
          'Enforces 17-character ISO 3779 check-digit validation and retrieves official safety recalls before live bench energizing is unlocked.',
      },
      {
        label: 'Gemini AI Studio & Offline Voice Macros',
        detail:
          'Separated PCB vision analysis, grounded technical search, and custom voice macros (“Set PSU 13.8V”, “Probe Pin 7”) for gloved work.',
      },
      {
        label: 'Local Diagnostics Export Suite',
        detail:
          'Export MNA pinout matrices, repair reports, training slide decks, checklists, and JSON snapshots directly to your workstation.',
      },
    ],
    primaryActionLabel: 'Open Repair Manuals',
    targetTab: 'REPAIR_GUIDE',
    icon: Globe,
  },
  {
    id: 'credentials-governance',
    indexLabel: '07',
    track: 'Credentials & Governance',
    title: '07. Official Credentials & Engineering Standards',
    subtitle: 'Platform leadership, ownership accountability, and verified security architecture.',
    imageSrc: slideBenchOverviewImg,
    imageAlt: 'AutoElectric Lab Pro platform emblem and leadership credentials.',
    dailyBenefitHeadline: 'Built for Accountable Workshop Operations',
    dailyBenefitSummary:
      'Every measurement tier, OEM specification, and workstation license in AutoElectric Lab Pro is anchored to transparent ownership and cryptographic verification.',
    highlights: [
      {
        label: 'Ruben Llego — Lead Systems Architect (Owner & Head Dev)',
        detail:
          'Architected the Modified Nodal Analysis circuit solver, ECU pinout diagnostic engine, visual topology framework, and real-time bench telemetry.',
      },
      {
        label: 'Elnombre Danong — VIP Investor & Co-Owner',
        detail:
          'Foundational early backer driving EV diagnostic innovation, dedicated hardware lab expansion, and global workshop deployment.',
      },
      {
        label: 'Verified Security & Compliance Standards',
        detail:
          'Firebase RS256 Authentication, SHA-256 Workstation License Control (1 Account · Max 2 Devices), HMAC Offline Leases, and ISO 3779 / SAE J1979 / ISO 11898 alignment.',
      },
    ],
    primaryActionLabel: 'Launch Virtual Bench',
    isCredentialsSlide: true,
    icon: ShieldCheck,
  },
];

interface WalkthroughSlideDeckProps {
  onNavigateTab?: (tab: LabTab) => void;
  onLaunchBench: () => void;
  onOpenWorkspaceSlides?: () => void;
  onOpenLicenseModal?: () => void;
}

const AUTO_ADVANCE_MS = 8000;

export const WalkthroughSlideDeck: React.FC<WalkthroughSlideDeckProps> = ({
  onNavigateTab,
  onLaunchBench,
  onOpenWorkspaceSlides,
  onOpenLicenseModal,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const [logoError, setLogoError] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const totalSlides = WALKTHROUGH_SLIDES.length;
  const activeSlide = WALKTHROUGH_SLIDES[activeIndex];

  const goToSlide = useCallback(
    (index: number) => {
      const normalized = ((index % totalSlides) + totalSlides) % totalSlides;
      setActiveIndex(normalized);
    },
    [totalSlides]
  );

  const goNext = useCallback(() => {
    goToSlide(activeIndex + 1);
  }, [activeIndex, goToSlide]);

  const goPrev = useCallback(() => {
    goToSlide(activeIndex - 1);
  }, [activeIndex, goToSlide]);

  useEffect(() => {
    if (!isAutoPlaying) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setIsAutoPlaying(false);
      return;
    }
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % totalSlides);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [isAutoPlaying, totalSlides]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    if (!touch || touchStartXRef.current === null || touchStartYRef.current === null) return;
    const dx = touch.clientX - touchStartXRef.current;
    const dy = touch.clientY - touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) {
        goNext();
      } else {
        goPrev();
      }
    }
  };

  const handleActionClick = (tab?: LabTab) => {
    if (tab && onNavigateTab) {
      onNavigateTab(tab);
      return;
    }
    onLaunchBench();
  };

  const ActiveIcon = activeSlide.icon;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Technician feature walkthrough and credentials presentation"
      className="flex flex-col gap-3"
    >
      {/* Top Presentation Control Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#252b36] pb-2.5">
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
          <span className="font-bold text-amber-400">
            Slide {activeSlide.indexLabel} / {String(totalSlides).padStart(2, '0')}
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="text-slate-300">{activeSlide.track}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onOpenWorkspaceSlides && (
            <button
              type="button"
              onClick={onOpenWorkspaceSlides}
              className="hw-btn min-h-[36px] px-3 py-1.5 rounded-[2px] font-mono text-[11px] font-medium text-slate-200 hover:text-amber-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              title="Export diagnostic training decks in Local Export Suite"
            >
              <Presentation className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
              <span>Training Deck</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsAutoPlaying((prev) => !prev)}
            aria-pressed={isAutoPlaying}
            className={`hw-btn min-h-[36px] px-3 py-1.5 rounded-[2px] font-mono text-[11px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              isAutoPlaying ? 'hw-btn-amber text-amber-200' : 'text-slate-300 hover:text-white'
            }`}
          >
            {isAutoPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Pause Deck</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>Auto Play</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous slide"
              className="hw-btn min-h-[36px] min-w-[36px] px-2.5 py-1.5 rounded-[2px] text-slate-200 hover:text-amber-300 inline-flex items-center justify-center cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next slide"
              className="hw-btn min-h-[36px] min-w-[36px] px-2.5 py-1.5 rounded-[2px] text-slate-200 hover:text-amber-300 inline-flex items-center justify-center cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Split Presentation Stage */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch"
      >
        {/* Left 7 Columns: Smooth Horizontal Sliding Visual Track */}
        <div className="lg:col-span-7 relative overflow-hidden rounded-[3px] border border-[#2c3442] bg-[#0a0c10] flex flex-col justify-between">
          <div className="relative w-full aspect-video overflow-hidden bg-[#0a0c10]">
            <div
              className="flex h-full w-full transition-transform duration-300 ease-out motion-reduce:transition-none"
              style={{ transform: `translateX(-${activeIndex * 100}%)` }}
            >
              {WALKTHROUGH_SLIDES.map((slide) => {
                const SlideIcon = slide.icon;
                const hasImgError = Boolean(imgErrors[slide.id]);

                if (slide.isCredentialsSlide) {
                  return (
                    <div
                      key={slide.id}
                      className="w-full h-full shrink-0 bg-[#0d1117] p-4 sm:p-6 flex flex-col justify-between overflow-y-auto"
                    >
                      {/* Official Brand & Platform Header */}
                      <div className="flex items-center justify-between gap-3 border-b border-[#252d3a] pb-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-[3px] border border-[#3a4354] bg-[#090b0f] p-1 flex items-center justify-center shrink-0">
                            {!logoError ? (
                              <img
                                src={APP_LOGO_SRC}
                                alt="AutoElectric Lab Pro emblem"
                                referrerPolicy="no-referrer"
                                onError={() => setLogoError(true)}
                                className="h-full w-full object-contain rounded-[2px]"
                              />
                            ) : (
                              <Cpu className="w-6 h-6 text-amber-400" aria-hidden="true" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-base sm:text-lg font-bold text-slate-100 truncate">
                              AutoElectric Lab Pro
                            </h3>
                            <p className="text-xs text-slate-400 font-mono truncate">
                              Deterministic Virtual ECU Workbench · Bosch ME7.5 Reference
                            </p>
                          </div>
                        </div>
                        <span className="hidden sm:inline font-mono text-xs text-emerald-400 font-semibold shrink-0">
                          Verified Architecture
                        </span>
                      </div>

                      {/* Executive Leadership Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-auto py-3">
                        <div className="rounded-[3px] border border-[#2c3442] bg-[#131720] p-3.5 flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                              Lead Systems Architect
                            </span>
                            <Cpu className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
                          </div>
                          <div>
                            <div className="text-base font-bold text-slate-100">Ruben Llego</div>
                            <div className="text-xs text-slate-400 font-mono">
                              Owner &amp; Head Developer · rubenlleg12@gmail.com
                            </div>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">
                            Designed the MNA circuit solver matrix, ECU pinout diagnostic engine,
                            D3 harness topology, and real-time bench telemetry architecture.
                          </p>
                        </div>

                        <div className="rounded-[3px] border border-[#2c3442] bg-[#131720] p-3.5 flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                              VIP Investor &amp; Co-Owner
                            </span>
                            <TrendingUp
                              className="w-4 h-4 text-amber-400 shrink-0"
                              aria-hidden="true"
                            />
                          </div>
                          <div>
                            <div className="text-base font-bold text-slate-100">Elnombre Danong</div>
                            <div className="text-xs text-slate-400 font-mono">
                              Executive Co-Owner &amp; Strategic Backer
                            </div>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">
                            Early strategic investor driving EV diagnostic capability, physical lab
                            tooling expansion, and worldwide technician accessibility.
                          </p>
                        </div>
                      </div>

                      {/* Engineering & Licensing Compliance Strip */}
                      <div className="border-t border-[#252d3a] pt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                        <span>
                          Compliance: ISO 3779 VIN · SAE J1979 OBD-II · ISO 11898 CAN · Toyota / Ford
                          / Mitsubishi / Nissan OEM PCB Specs
                        </span>
                        {onOpenLicenseModal && (
                          <button
                            type="button"
                            onClick={onOpenLicenseModal}
                            className="text-amber-300 hover:text-amber-200 underline underline-offset-4 cursor-pointer"
                          >
                            License Manager
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={slide.id} className="relative w-full h-full shrink-0 bg-[#0a0c10]">
                    {!hasImgError ? (
                      <img
                        src={slide.imageSrc}
                        alt={slide.imageAlt}
                        referrerPolicy="no-referrer"
                        onError={() => setImgErrors((prev) => ({ ...prev, [slide.id]: true }))}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#141922] via-[#0e1218] to-[#0a0c10] flex flex-col items-center justify-center p-6 text-center gap-3">
                        <SlideIcon className="w-12 h-12 text-amber-400" aria-hidden={true} />
                        <div className="text-sm font-semibold text-slate-200">{slide.title}</div>
                        <p className="text-xs text-slate-400 max-w-md">{slide.subtitle}</p>
                      </div>
                    )}

                    {/* Contrast Scrim for Overlaid Caption */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#080a0e]/95 via-[#080a0e]/60 to-transparent"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4 flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-mono text-amber-300 uppercase tracking-wider">
                          {slide.track} · Frame {slide.indexLabel}
                        </div>
                        <div className="text-sm sm:text-base font-semibold text-white truncate">
                          {slide.dailyBenefitHeadline}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Overlay Prev / Next Touch Controls on Image Edges */}
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous presentation slide"
              className="hidden sm:flex absolute left-2.5 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-[2px] border border-[#3a4354] bg-[#0b0e13]/85 text-slate-200 hover:border-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next presentation slide"
              className="hidden sm:flex absolute right-2.5 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-[2px] border border-[#3a4354] bg-[#0b0e13]/85 text-slate-200 hover:border-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Interactive Slide Progress Dots / Bar */}
          <div className="bg-[#12161d] border-t border-[#242a34] px-3 py-2 flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
            <span className="truncate">
              Swipe or press Left / Right arrows to step through slides
            </span>
            <div className="flex items-center gap-1.5 shrink-0" role="tablist" aria-label="Slide selector">
              {WALKTHROUGH_SLIDES.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={idx === activeIndex}
                  aria-label={`Jump to slide ${s.indexLabel}: ${s.title}`}
                  onClick={() => goToSlide(idx)}
                  className={`h-2 rounded-[1px] transition-all cursor-pointer ${
                    idx === activeIndex
                      ? 'w-6 bg-amber-400'
                      : 'w-2.5 bg-[#2f3746] hover:bg-slate-400'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Technician Value & Feature Breakdown */}
        <article className="lg:col-span-5 rounded-[3px] border border-[#2c3442] bg-[#141820] p-4 sm:p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3.5">
            <div className="space-y-1.5 border-b border-[#252c38] pb-3">
              <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
                <ActiveIcon className="w-4 h-4 shrink-0" aria-hidden={true} />
                <span>{activeSlide.track}</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-100 leading-snug text-balance">
                {activeSlide.title}
              </h2>
              <p className="text-xs sm:text-[13px] text-slate-300 leading-relaxed">
                {activeSlide.dailyBenefitSummary}
              </p>
            </div>

            {/* Structured Capability Details (No Pill Clutter, Clean Hairline Rows) */}
            <ul className="divide-y divide-[#232935] text-xs">
              {activeSlide.highlights.map((item) => (
                <li key={item.label} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-2.5">
                  <CheckCircle2
                    className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-semibold text-slate-100">{item.label}</div>
                    <p className="text-slate-400 leading-relaxed">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Primary Slide Action Footer */}
          <div className="pt-3 border-t border-[#252c38] flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleActionClick(activeSlide.targetTab)}
              className="flex-1 min-h-[42px] px-4 py-2 rounded-[3px] border border-emerald-400 bg-[#4ade80] hover:bg-[#22c55e] text-[#07140c] font-mono text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <span>{activeSlide.primaryActionLabel}</span>
              <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
            </button>

            {activeSlide.secondaryActionLabel && activeSlide.secondaryTargetTab && (
              <button
                type="button"
                onClick={() => handleActionClick(activeSlide.secondaryTargetTab)}
                className="hw-btn min-h-[42px] px-3.5 py-2 rounded-[3px] font-mono text-xs font-semibold text-amber-300 hover:text-amber-200 inline-flex items-center justify-center whitespace-nowrap cursor-pointer"
              >
                {activeSlide.secondaryActionLabel}
              </button>
            )}
          </div>
        </article>
      </div>

      {/* Bottom Interactive Slide Filmstrip (7 Visual Thumbnails) */}
      <div
        aria-label="Presentation slide thumbnails"
        className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2"
      >
        {WALKTHROUGH_SLIDES.map((slide, idx) => {
          const isCurrent = idx === activeIndex;
          return (
            <button
              key={slide.id}
              type="button"
              onClick={() => goToSlide(idx)}
              aria-current={isCurrent ? 'step' : undefined}
              className={`group text-left rounded-[2px] border p-1.5 transition-colors cursor-pointer flex flex-col gap-1.5 ${
                isCurrent
                  ? 'border-amber-400 bg-[#1c212b]'
                  : 'border-[#272e3a] bg-[#12161d] hover:border-[#424c5e]'
              }`}
            >
              <div className="relative w-full aspect-video rounded-[1px] overflow-hidden bg-[#0a0c10]">
                {slide.isCredentialsSlide ? (
                  <div className="w-full h-full bg-[#0e131a] flex items-center justify-center gap-1.5 px-2">
                    <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
                    <span className="font-mono text-[10px] font-bold text-slate-200 truncate">
                      CREDENTIALS
                    </span>
                  </div>
                ) : (
                  <img
                    src={slide.imageSrc}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-opacity"
                  />
                )}
              </div>
              <div className="flex items-center justify-between gap-1 font-mono text-[10px] leading-tight">
                <span className={`font-bold tabular-nums ${isCurrent ? 'text-amber-300' : 'text-slate-400'}`}>
                  {slide.indexLabel}
                </span>
                <span className={`truncate ${isCurrent ? 'text-slate-100' : 'text-slate-400'}`}>
                  {slide.title.replace(/^\d+\.\s*/, '')}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Persistent Executive Credentials & Attribution Bar */}
      <div className="rounded-[2px] border border-[#242a34] bg-[#0e1116] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            Lead Systems Architect: <strong className="text-amber-300">Ruben Llego</strong> (Owner
            &amp; Head Dev)
          </span>
          <span aria-hidden="true" className="text-slate-600 hidden sm:inline">
            ·
          </span>
          <span>
            VIP Investor &amp; Co-Owner: <strong className="text-slate-100">Elnombre Danong</strong>
          </span>
          <span aria-hidden="true" className="text-slate-600 hidden md:inline">
            ·
          </span>
          <span className="text-slate-400 font-mono text-[11px] hidden md:inline">
            Deterministic MNA Engine · SHA-256 Access Control
          </span>
        </div>
        <button
          type="button"
          onClick={() => goToSlide(WALKTHROUGH_SLIDES.length - 1)}
          className="font-mono text-[11px] text-amber-300 hover:text-amber-200 underline underline-offset-4 cursor-pointer shrink-0"
        >
          View Full Credentials
        </button>
      </div>
    </div>
  );
};
