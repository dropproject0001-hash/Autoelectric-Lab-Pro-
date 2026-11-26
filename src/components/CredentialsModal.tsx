/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Cpu,
  FileDown,
  HelpCircle,
  KeyRound,
  Mail,
  ShieldCheck,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  APP_ICON_SRC,
  APP_LOGO_SRC,
  CREATOR_CREDENTIALS,
  isVerifiedOwnerEmail,
} from '../constants/branding';
import { useAuth } from '../context/AuthContext';
import { useTrialAccess } from '../context/TrialAccessContext';
import { RamtiVectorEmblem } from './icons/RamtiBrandAssets';
import { generateSystemBlueprintPdf } from '../services/systemBlueprintPdfService';

export interface CredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLicenseModal?: () => void;
  onOpenWalkthroughModal?: () => void;
  isMasterAdminOrOwner?: boolean;
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19C8F5] focus-visible:ring-offset-1 focus-visible:ring-offset-[#060B14]';

export const CredentialsModal: React.FC<CredentialsModalProps> = ({
  isOpen,
  onClose,
  onOpenLicenseModal,
  onOpenWalkthroughModal,
  isMasterAdminOrOwner: isMasterAdminOrOwnerProp,
}) => {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const { user: googleUser } = useAuth();
  const { isAdminUnlocked, isMasterAdminOrOwner } = useTrialAccess();
  const canDownloadSystemBlueprint =
    isMasterAdminOrOwnerProp ??
    Boolean(
      isMasterAdminOrOwner ||
        isAdminUnlocked ||
        (googleUser?.emailVerified && isVerifiedOwnerEmail(googleUser?.email))
    );
  const [iconFailed, setIconFailed] = useState(false);
  const [bannerFailed, setBannerFailed] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="credentials-modal-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={shouldReduceMotion ? { duration: 0.01 } : { duration: 0.18 }}
          className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-5"
        >
          {/* Backdrop */}
          <div
            aria-hidden="true"
            onClick={onClose}
            className="fixed inset-0 bg-[#02050B]/84 backdrop-blur-[30px]"
          />

          {/* Modal Dialog */}
          <motion.div
            key="credentials-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
            transition={
              shouldReduceMotion
                ? { duration: 0.01 }
                : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
            }
            className="relative z-10 flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#203653] bg-gradient-to-b from-[#0E192A]/95 via-[#0A1220]/95 to-[#060B14]/95 text-[#EAF3FF] backdrop-blur-[30px] shadow-[0_24px_72px_rgba(2,6,14,0.88)]"
          >
            {/* Electric Cyan Top Edge Highlight */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[1.5px] bg-gradient-to-r from-transparent via-[#19C8F5]/85 to-transparent"
            />

            {/* Branded Modal Header */}
            <header className="relative shrink-0 overflow-hidden border-b border-[#203653] bg-[#0A1220] px-4 py-3.5 sm:px-5">
              {!bannerFailed && (
                <img
                  src={APP_LOGO_SRC}
                  alt=""
                  aria-hidden="true"
                  referrerPolicy="no-referrer"
                  onError={() => setBannerFailed(true)}
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-20 mix-blend-screen select-none"
                />
              )}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#060B14]/95 via-[#0A1220]/84 to-[#060B14]/94"
              />

              <div className="relative z-10 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#19C8F5]/55 bg-[#050A12] shadow-[0_0_16px_rgba(25,200,245,0.2)]">
                    {!iconFailed ? (
                      <img
                        src={APP_ICON_SRC}
                        alt="AutoElectric Lab PRO app icon"
                        referrerPolicy="no-referrer"
                        onError={() => setIconFailed(true)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Cpu className="h-5 w-5 text-[#19C8F5]" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1.5 whitespace-nowrap leading-none">
                      <span className="font-body text-[16px] sm:text-[18px] font-bold italic tracking-tight brand-wordmark-silver">
                        AutoElectric Lab
                      </span>
                      <span className="font-body text-[16px] sm:text-[18px] font-bold italic tracking-tight brand-wordmark-amber">
                        PRO
                      </span>
                    </div>
                    <h2
                      id={titleId}
                      className="mt-1 font-hud text-[11.5px] font-bold uppercase tracking-[0.14em] text-[#19C8F5] truncate"
                    >
                      Official Credentials &amp; Governance
                    </h2>
                  </div>
                </div>

                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={onClose}
                  aria-label="Close credentials modal"
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#203653] bg-[#0E192A]/95 text-[#EAF3FF] transition-colors hover:border-[#19C8F5]/80 hover:bg-[#132238] hover:text-white cursor-pointer ${FOCUS_RING}`}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </header>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4">
              {/* Centered Primary RAMTi Trademark Emblem & 3-Line Subtitle */}
              <div className="flex flex-col items-center justify-center border-b border-[#203653]/70 pb-2">
                <RamtiVectorEmblem
                  size={52}
                  variant="flat-white"
                  showWordmark
                  showSubtitle
                />
              </div>

              <p className="text-[12.5px] leading-relaxed text-[#91A4BD]">
                Deterministic Virtual ECU Workbench built for accountable workshop diagnostics,
                Modified Nodal Analysis circuit simulation, and verified OEM reference governance.
              </p>

              {/* Leadership & Ownership Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CREATOR_CREDENTIALS.leaders.map((leader) => (
                  <article
                    key={leader.id}
                    className="rounded-xl border border-[#203653] bg-[#0E192A]/95 p-3.5 flex flex-col gap-2.5 shadow-[inset_0_1px_0_rgba(220,240,255,0.04)]"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-[#203653]/80 pb-2">
                      <span
                        className={`font-hud text-[11px] font-bold uppercase tracking-[0.13em] ${
                          leader.accent === 'cyan' ? 'text-[#19C8F5]' : 'text-[#FFB020]'
                        }`}
                      >
                        {leader.roleTitle}
                      </span>
                      {leader.accent === 'cyan' ? (
                        <Cpu className="h-4 w-4 text-[#19C8F5] shrink-0" aria-hidden="true" />
                      ) : (
                        <TrendingUp className="h-4 w-4 text-[#FFB020] shrink-0" aria-hidden="true" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-[15px] font-bold tracking-tight text-[#EAF3FF]">
                        {leader.name}
                      </h3>
                      <div
                        className={`mt-0.5 font-mono text-[11px] ${
                          leader.accent === 'cyan' ? 'text-[#FFB020]' : 'text-[#19C8F5]'
                        }`}
                      >
                        {leader.subtitle}
                      </div>
                    </div>
                    <p className="text-[12px] leading-relaxed text-[#91A4BD]">{leader.bio}</p>
                    {leader.email && (
                      <div className="mt-auto pt-1 flex items-center gap-1.5 font-mono text-[11px] text-[#EAF3FF]/90">
                        <Mail className="h-3.5 w-3.5 text-[#19C8F5] shrink-0" aria-hidden="true" />
                        <span className="truncate">{leader.email}</span>
                      </div>
                    )}
                  </article>
                ))}
              </div>

              {/* Verified Security & Compliance Instrumentation Well */}
              <section
                aria-label="Verified engineering and security standards"
                className="hw-lcd-well rounded-xl p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2 border-b border-[#203653]/75 pb-2">
                  <span className="flex items-center gap-2 font-hud text-[11.5px] font-bold uppercase tracking-[0.13em] text-[#EAF3FF]">
                    <ShieldCheck className="h-4 w-4 text-[#20D889] shrink-0" aria-hidden="true" />
                    Security &amp; Engineering Standards
                  </span>
                  <span className="font-mono text-[10.5px] font-semibold text-[#20D889]">
                    Verified Architecture
                  </span>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-[11px]">
                  <div className="space-y-0.5">
                    <dt className="text-[#91A4BD] uppercase text-[9.5px] tracking-wider">
                      Authentication &amp; Licensing
                    </dt>
                    <dd className="text-[#EAF3FF] leading-snug">
                      Firebase RS256 Auth · SHA-256 License Control (1 Account · Max 2 Devices) ·
                      HMAC Offline Leases
                    </dd>
                  </div>
                  <div className="space-y-0.5">
                    <dt className="text-[#91A4BD] uppercase text-[9.5px] tracking-wider">
                      Automotive Reference Alignment
                    </dt>
                    <dd className="text-[#EAF3FF] leading-snug">
                      Bosch ME7.5 Reference · ISO 3779 VIN · SAE J1979 OBD-II · ISO 11898 CAN
                    </dd>
                  </div>
                </dl>
              </section>
            </div>

            {/* Action Footer */}
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#203653] bg-[#0A1220]/95 px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                {onOpenLicenseModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenLicenseModal();
                    }}
                    className={`hw-btn inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-[#FFB020] cursor-pointer whitespace-nowrap ${FOCUS_RING}`}
                  >
                    <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Access License</span>
                  </button>
                )}
                {onOpenWalkthroughModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenWalkthroughModal();
                    }}
                    className={`hw-btn inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-[#EAF3FF] cursor-pointer whitespace-nowrap ${FOCUS_RING}`}
                  >
                    <HelpCircle className="h-3.5 w-3.5 text-[#19C8F5] shrink-0" aria-hidden="true" />
                    <span>Slide Walkthrough</span>
                  </button>
                )}
                {canDownloadSystemBlueprint && (
                  <button
                    type="button"
                    data-testid="credentials-download-blueprint-pdf-btn"
                    onClick={() => {
                      void generateSystemBlueprintPdf();
                    }}
                    className={`hw-btn inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-[#19C8F5] cursor-pointer whitespace-nowrap ${FOCUS_RING}`}
                  >
                    <FileDown className="h-3.5 w-3.5 text-[#19C8F5] shrink-0" aria-hidden="true" />
                    <span>System Blueprint (PDF)</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className={`diag-cta-blue inline-flex min-h-[38px] items-center justify-center rounded-lg px-4 py-1.5 text-[12px] font-bold cursor-pointer whitespace-nowrap ${FOCUS_RING}`}
              >
                Close
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
