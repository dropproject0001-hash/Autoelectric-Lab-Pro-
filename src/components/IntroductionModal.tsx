/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Cpu,
  Gauge,
  GitBranch,
  Layers,
  LayoutGrid,
  MonitorPlay,
  Plug,
  ShieldCheck,
  Sliders,
  TrendingUp,
  X,
} from 'lucide-react';
import { APP_LOGO_SRC } from '../constants/branding';
import type { LabTab } from './LabTopNav';
import { RackCornerScrews } from './HardwareControls';
import { WalkthroughSlideDeck } from './walkthrough/WalkthroughSlideDeck';

interface IntroductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tab: LabTab) => void;
  onOpenWorkspaceSlides?: () => void;
  onOpenLicenseModal?: () => void;
}

type ModalViewMode = 'SLIDES' | 'OVERVIEW';

interface CapabilityCard {
  number: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  tone: 'amber' | 'green' | 'steel';
}

const CAPABILITY_CARDS: readonly CapabilityCard[] = [
  {
    number: '01',
    title: 'ECU Bench & Power',
    description:
      '0–30V DC programmable rail, current limiting, KL30/KL15 presets (12V Bench, 5V Sensor Rail, 14.4V Charging).',
    icon: Sliders,
    tone: 'amber',
  },
  {
    number: '02',
    title: 'Digital Multimeter (DMM)',
    description:
      'Red (+) and Black (-) bench probes on any ECU pin, component pad, or chassis ground. Auto-scales VDC, VAC & Ω.',
    icon: Gauge,
    tone: 'green',
  },
  {
    number: '03',
    title: 'Fault Injection Matrix',
    description:
      'Inject Shorts to GND/VBAT, High Corrosion, or Open Circuits to inspect live MNA response & DTC triggers.',
    icon: AlertTriangle,
    tone: 'amber',
  },
  {
    number: '04',
    title: 'Harness Topology & Wiring',
    description:
      'Force-directed Topology Graph and schematic blueprint with click-to-cut conductors and live 16-pin telemetry.',
    icon: GitBranch,
    tone: 'green',
  },
  {
    number: '05',
    title: 'PCB / 3D Bench Twin',
    description:
      'Explodable 3D ECU housing, microcontroller/MOSFET mapping, thermal overlays, and OEM PCB cross-probing.',
    icon: Cpu,
    tone: 'steel',
  },
  {
    number: '06',
    title: 'Oscilloscope Analyzers',
    description:
      'Monitor PWM control, injector MOSFET flyback spikes (>40V), CAN frames, and 60-2 tooth CKP signals.',
    icon: Activity,
    tone: 'green',
  },
];

export const IntroductionModal: React.FC<IntroductionModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
  onOpenWorkspaceSlides,
  onOpenLicenseModal,
}) => {
  const [viewMode, setViewMode] = useState<ModalViewMode>('SLIDES');
  const [logoLoadError, setLogoLoadError] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleQuickJump = (tab: LabTab) => {
    if (onNavigateTab) {
      onNavigateTab(tab);
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#090b0e]/95 font-body select-none"
    >
      <div className="relative w-full max-w-6xl rounded-[3px] border border-[#343c4b] bg-[#101318] shadow-[0_24px_70px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col max-h-[95dvh]">
        <RackCornerScrews />

        {/* Clean Instrument Console Header */}
        <header className="relative z-10 border-b border-[#2b313c] bg-[#161a21] px-4 py-2.5 sm:px-5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Cpu className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
            <h1
              id="intro-modal-title"
              className="text-xs sm:text-sm font-mono font-bold tracking-wider uppercase text-slate-100 truncate"
            >
              AutoElectric Lab Pro · Technician Walkthrough &amp; Credentials
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Segmented Mode Control */}
            <div
              role="group"
              aria-label="Briefing display mode"
              className="inline-flex items-center rounded-[2px] border border-[#2d3544] bg-[#0d1015] p-0.5"
            >
              <button
                type="button"
                onClick={() => setViewMode('SLIDES')}
                aria-pressed={viewMode === 'SLIDES'}
                className={`min-h-[32px] px-2.5 py-1 rounded-[1px] font-mono text-[10.5px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                  viewMode === 'SLIDES'
                    ? 'bg-[#212834] text-amber-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <MonitorPlay className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Slide Presentation</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('OVERVIEW')}
                aria-pressed={viewMode === 'OVERVIEW'}
                className={`min-h-[32px] px-2.5 py-1 rounded-[1px] font-mono text-[10.5px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                  viewMode === 'OVERVIEW'
                    ? 'bg-[#212834] text-amber-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Quick Brief &amp; Credits</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close walkthrough panel"
              className="hw-btn min-h-[34px] min-w-[34px] rounded-[2px] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Scrollable Content Body */}
        <div className="relative z-10 flex-1 overflow-y-auto p-3.5 sm:p-5 flex flex-col gap-4 text-slate-200">
          {viewMode === 'SLIDES' ? (
            <WalkthroughSlideDeck
              onNavigateTab={handleQuickJump}
              onLaunchBench={onClose}
              onOpenWorkspaceSlides={onOpenWorkspaceSlides}
              onOpenLicenseModal={onOpenLicenseModal}
            />
          ) : (
            <>
              {/* System Overview Section */}
              <section
                aria-label="System overview"
                className="hud-panel rounded-[3px] p-4 sm:p-5 flex flex-col gap-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-[3px] border border-[#3a4354] bg-[#0c0f14] p-1 flex items-center justify-center shrink-0">
                      {!logoLoadError ? (
                        <img
                          src={APP_LOGO_SRC}
                          alt="AutoElectric Lab Pro emblem"
                          referrerPolicy="no-referrer"
                          onError={() => setLogoLoadError(true)}
                          className="h-full w-full object-contain rounded-[2px]"
                        />
                      ) : (
                        <Cpu className="w-6 h-6 text-amber-400" aria-hidden="true" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-amber-400">
                        System Overview
                      </div>
                      <h2 className="text-lg sm:text-2xl font-bold tracking-tight text-slate-100 leading-tight mt-0.5">
                        AutoElectric Lab Pro
                      </h2>
                    </div>
                  </div>

                  <div className="hidden sm:flex items-center gap-1.5 text-amber-400/80 shrink-0 pt-1">
                    <Layers className="w-7 h-7 stroke-[1.5]" aria-hidden="true" />
                  </div>
                </div>

                <div className="text-xs sm:text-[13px] text-slate-300 leading-relaxed space-y-1">
                  <p>
                    The complete Virtual ECU Workbench. Harness Wiring, Visual Topology Graph, 3D
                    Bench Twin, Pinouts, PCB Scanner, and Fault Emulation from one interface.
                  </p>
                  <p className="text-slate-200 font-medium">
                    Lead Systems Architect: <span className="text-amber-300">Ruben Llego</span> ·
                    VIP Investor &amp; Co-Owner:{' '}
                    <span className="text-amber-300">Elnombre Danong</span>
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => handleQuickJump('WIRING_DIAGRAM')}
                    className="hw-btn min-h-[38px] px-3 py-1.5 rounded-[2px] text-xs font-mono font-medium text-slate-200 hover:text-amber-300 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <GitBranch className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                    <span>Harness Wiring</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickJump('THREE_D_TWIN')}
                    className="hw-btn min-h-[38px] px-3 py-1.5 rounded-[2px] text-xs font-mono font-medium text-slate-200 hover:text-amber-300 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <Cpu className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                    <span>3D Bench Twin</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickJump('ECU_PINOUT')}
                    className="hw-btn min-h-[38px] px-3 py-1.5 rounded-[2px] text-xs font-mono font-medium text-slate-200 hover:text-amber-300 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <Plug className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                    <span>Pinouts</span>
                  </button>
                </div>
              </section>

              {/* Lead Architect Profile & VIP Investor Brief */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <article className="hud-panel rounded-[3px] p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-[2px] border border-amber-500/45 bg-[#12151b] flex items-center justify-center shrink-0">
                        <Cpu className="w-5 h-5 text-amber-400" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10.5px] font-mono font-semibold uppercase tracking-[0.14em] text-amber-400">
                          Lead Architect Profile · Owner &amp; Head Dev
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-slate-100 uppercase tracking-wide mt-0.5">
                          RUBEN LLEGO
                        </h3>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 leading-relaxed space-y-1.5">
                    <p>
                      Ruben Llego, Lead Systems Architect. Designed the MNA circuit solver matrix,
                      ECU pinout diagnostics engine, and real-time bench telemetry framework.
                    </p>
                    <p className="italic text-slate-400">
                      A pioneer in scalable virtual bench architectures.
                    </p>
                  </div>
                </article>

                <article className="hud-panel rounded-[3px] p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-[2px] border border-amber-500/45 bg-[#12151b] flex items-center justify-center shrink-0">
                        <TrendingUp className="w-5 h-5 text-amber-400" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10.5px] font-mono font-semibold uppercase tracking-[0.14em] text-amber-400">
                          VIP Investor Brief · Co-Owner
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-slate-100 uppercase tracking-wide mt-0.5">
                          ELNOMBRE DANONG
                        </h3>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 leading-relaxed space-y-1.5">
                    <p>
                      Elnombre Danong, VIP Investor &amp; Co-Owner. An early backer whose foresight
                      into EV technology and software diagnostics propelled AutoElectric Lab
                      PRO&apos;s growth.
                    </p>
                    <p className="text-slate-400">
                      Dedicated support for hardware lab expansion &amp; global scale.
                    </p>
                  </div>
                </article>
              </div>

              {/* Compact Workstation Capability Matrix */}
              <section
                aria-label="Laboratory workstation capabilities"
                className="hud-panel rounded-[3px] p-3.5 sm:p-4 flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between gap-2 border-b border-[#2b313c] pb-2">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-[0.12em] text-slate-300">
                    Workstation Module Architecture
                  </span>
                  <span className="text-[11px] font-mono text-emerald-400 tabular-nums">
                    6 Core Subsystems Ready
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {CAPABILITY_CARDS.map((card) => {
                    const Icon = card.icon;
                    const accentText =
                      card.tone === 'amber'
                        ? 'text-amber-400'
                        : card.tone === 'green'
                          ? 'text-emerald-400'
                          : 'text-slate-300';
                    return (
                      <article
                        key={card.number}
                        className="rounded-[2px] border border-[#2a303b] bg-[#12161d] p-2.5 flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Icon className={`w-3.5 h-3.5 shrink-0 ${accentText}`} aria-hidden={true} />
                            <h4 className="text-xs font-semibold text-slate-100 truncate">
                              {card.title}
                            </h4>
                          </div>
                          <span className={`text-[10px] font-mono font-bold tabular-nums shrink-0 ${accentText}`}>
                            {card.number}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-snug">{card.description}</p>
                      </article>
                    );
                  })}
                </div>
              </section>

              {/* Launch Action Section */}
              <section
                aria-label="Launch virtual bench session"
                className="hud-panel rounded-[3px] p-4 flex flex-col gap-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h2 className="text-sm sm:text-base font-bold uppercase tracking-wide text-slate-100">
                    Start Your Virtual Bench Session
                  </h2>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                    <span>Bosch ME7.5 ECU Reference Architecture</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full min-h-[44px] px-5 py-2.5 rounded-[3px] border border-emerald-400 bg-[#4ade80] hover:bg-[#22c55e] text-[#07140c] font-mono text-xs sm:text-sm font-bold uppercase tracking-[0.1em] transition-colors duration-150 flex items-center justify-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 cursor-pointer"
                >
                  <span>LAUNCH VIRTUAL BENCH</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
