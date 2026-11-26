/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Cpu, ShieldCheck, Sparkles } from 'lucide-react';
import { APP_ICON_SRC, CREATOR_CREDENTIALS } from '../constants/branding';
import { RamtiVectorEmblem } from './icons/RamtiBrandAssets';
import { playAccessGrantedChime } from '../utils/audioFeedback';

export interface WelcomeBenchOverlayProps {
  isOpen: boolean;
  accessLabel: string;
  userEmail?: string | null;
  workstationId?: string;
  onDismiss: () => void;
}

type WelcomeStage = 'BENCH_LAB' | 'PRO_CREDENTIALS';

export const WelcomeBenchOverlay: React.FC<WelcomeBenchOverlayProps> = ({
  isOpen,
  accessLabel,
  userEmail,
  workstationId,
  onDismiss,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [stage, setStage] = useState<WelcomeStage>('BENCH_LAB');
  const [iconFailed, setIconFailed] = useState(false);
  const onDismissRef = React.useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!isOpen) return;
    setStage('BENCH_LAB');
    playAccessGrantedChime();

    const phaseTimer = window.setTimeout(
      () => {
        setStage('PRO_CREDENTIALS');
      },
      shouldReduceMotion ? 900 : 1850
    );

    const autoCloseTimer = window.setTimeout(
      () => {
        onDismissRef.current();
      },
      shouldReduceMotion ? 2600 : 5600
    );

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        onDismissRef.current();
      }
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      window.clearTimeout(phaseTimer);
      window.clearTimeout(autoCloseTimer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, shouldReduceMotion]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="welcome-bench-overlay"
          data-testid="welcome-bench-overlay"
          data-welcome-phase={stage}
          role="dialog"
          aria-modal="true"
          aria-label="Workstation Welcome"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={shouldReduceMotion ? { duration: 0.01 } : { duration: 0.28 }}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#03070E]/90 backdrop-blur-[30px]"
        >
          {/* Subtle atmospheric radial sheen */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_62%_48%_at_50%_45%,rgba(25,200,245,0.14),transparent_70%)]"
          />

          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -8 }}
            transition={
              shouldReduceMotion
                ? { duration: 0.01 }
                : { duration: 0.35, ease: [0.16, 1, 0.3, 1] }
            }
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-[#19C8F5]/40 bg-[#0A1220]/88 p-6 sm:p-8 text-[#EAF3FF] shadow-[0_28px_90px_rgba(2,8,20,0.92)] backdrop-blur-[30px]"
          >
            {/* Top accent hairline */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#19C8F5] to-transparent"
            />

            {/* Header Status Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#203653] pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-[#19C8F5]/55 bg-[#050A12]">
                  {!iconFailed ? (
                    <img
                      src={APP_ICON_SRC}
                      alt="AutoElectric Lab PRO emblem"
                      referrerPolicy="no-referrer"
                      onError={() => setIconFailed(true)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Cpu className="h-5 w-5 text-[#19C8F5]" aria-hidden="true" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 font-mono text-[11px] font-semibold text-[#20D889]">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Verification Accepted · {accessLabel}</span>
                  </div>
                  <div className="font-mono text-[11px] text-[#91A4BD] tabular-nums">
                    {userEmail ? `${userEmail}` : workstationId ? `Workstation ${workstationId.slice(0, 14)}` : 'Authorized Session'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onDismiss}
                data-testid="welcome-overlay-enter-btn"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#19C8F5]/55 bg-[#0E2238] px-3.5 py-1.5 font-mono text-xs font-semibold text-[#EAF3FF] hover:bg-[#14304E] cursor-pointer whitespace-nowrap"
              >
                <span>Enter Bench Lab</span>
                <ArrowRight className="h-3.5 w-3.5 text-[#19C8F5]" aria-hidden="true" />
              </button>
            </div>

            {/* Centered Primary RAMTi Trademark Emblem & 3-Line Subtitle */}
            <div className="pt-4 flex flex-col items-center justify-center">
              <RamtiVectorEmblem
                size={52}
                variant="flat-white"
                showWordmark
                showSubtitle
              />
            </div>

            {/* Stage Transition Body */}
            <div className="py-4 min-h-[210px] flex flex-col justify-center">
              <AnimatePresence mode="wait">
                {stage === 'BENCH_LAB' ? (
                  <motion.div
                    key="stage-bench-lab"
                    initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                    transition={shouldReduceMotion ? { duration: 0.01 } : { duration: 0.35 }}
                    className="space-y-4 text-center"
                  >
                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#19C8F5]">
                      Bench Telemetry &amp; MNA Engine Initialized
                    </p>
                    <h2
                      className="font-hud text-3xl sm:text-4xl font-bold tracking-tight text-[#EAF3FF]"
                      style={{ textWrap: 'balance' }}
                    >
                      Welcome to the Bench Lab
                    </h2>
                    <p className="mx-auto max-w-md text-sm text-[#91A4BD] leading-relaxed">
                      Synchronizing 0–30V programmable power rail, Modified Nodal Analysis matrix,
                      digital multimeter probes, and 3D ECU digital twin.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="stage-pro-credentials"
                    initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                    transition={shouldReduceMotion ? { duration: 0.01 } : { duration: 0.38 }}
                    className="space-y-5"
                  >
                    <div className="text-center space-y-1.5">
                      <p className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[#FFB020]">
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{CREATOR_CREDENTIALS.shortOrg}</span>
                      </p>
                      <h2
                        className="font-hud text-3xl sm:text-4xl font-bold tracking-tight text-[#EAF3FF]"
                        style={{ textWrap: 'balance' }}
                      >
                        Welcome to AutoElectric Lab PRO
                      </h2>
                      <p className="text-xs text-[#91A4BD]">
                        {CREATOR_CREDENTIALS.organization}
                      </p>
                    </div>

                    {/* Dynamic Creator Credentials Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {CREATOR_CREDENTIALS.leaders.map((leader) => (
                        <div
                          key={leader.id}
                          className="rounded-xl border border-[#203653] bg-[#0E192A]/85 px-4 py-3 space-y-1"
                        >
                          <div
                            className={`font-mono text-[10.5px] font-bold uppercase tracking-wider ${
                              leader.accent === 'cyan' ? 'text-[#19C8F5]' : 'text-[#FFB020]'
                            }`}
                          >
                            {leader.roleTitle}
                          </div>
                          <div className="font-hud text-base font-bold text-[#EAF3FF]">
                            {leader.name}
                          </div>
                          <div className="text-xs text-[#91A4BD]">{leader.subtitle}</div>
                          {leader.email && (
                            <div className="font-mono text-[11px] text-[#EAF3FF]/80 pt-0.5 truncate">
                              {leader.email}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-[#203653] pt-3 text-center font-mono text-[11px] text-[#91A4BD]">
                      {CREATOR_CREDENTIALS.architectureSummary}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Stage Indicator Footer */}
            <div className="flex items-center justify-between border-t border-[#203653] pt-3 text-xs text-[#91A4BD]">
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <button
                  type="button"
                  onClick={() => setStage('BENCH_LAB')}
                  className={`cursor-pointer transition-colors ${
                    stage === 'BENCH_LAB' ? 'text-[#19C8F5] font-semibold' : 'hover:text-white'
                  }`}
                >
                  01. Bench Lab
                </button>
                <span aria-hidden="true">/</span>
                <button
                  type="button"
                  onClick={() => setStage('PRO_CREDENTIALS')}
                  className={`cursor-pointer transition-colors ${
                    stage === 'PRO_CREDENTIALS' ? 'text-[#FFB020] font-semibold' : 'hover:text-white'
                  }`}
                >
                  02. Credentials &amp; Pro Suite
                </button>
              </div>
              <span className="font-mono text-[10.5px] text-[#6F849F]">
                Press Enter or Esc to continue
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
