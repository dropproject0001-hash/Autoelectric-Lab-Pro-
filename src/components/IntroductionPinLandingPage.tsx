/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  Delete,
  ExternalLink,
  KeyRound,
  Laptop,
  Lock,
  LogIn,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Unlock,
} from 'lucide-react';
import { APP_HERO_BANNER_SRC, APP_LOGO_SRC, CREATOR_CREDENTIALS } from '../constants/branding';
import {
  playAccessGrantedChime,
  playPinKeypadClick,
  playSystemLockSound,
} from '../utils/audioFeedback';
import { useAuth } from '../context/AuthContext';
import { useTrialAccess } from '../context/TrialAccessContext';
import {
  getDefaultWorkstationLabel,
  getOrCreateWorkstationDeviceId,
} from '../services/licenseClientService';
import {
  AdminPinConfigStatus,
  ClientTrialPinRecord,
  fetchAdminPinConfigStatus,
  fetchAdminTrialPinsList,
  formatTrialDurationLabel,
  generateAdminTrialPinClient,
  loginAdminMasterPinClient,
  resetAdminTrialDeviceClient,
  revokeAdminTrialPinClient,
  setAdminPinToken,
  setupFirstRunAdminPinClient,
  TRIAL_DURATION_PRESETS,
  TrialDurationHours,
} from '../services/trialPinClientService';

type LandingGateTab = 'PIN_ENTRY' | 'ADMIN_MASTER';

const KEYPAD_KEYS: ReadonlyArray<{ label: string; value: string; aria: string }> = [
  { label: '1', value: '1', aria: 'Digit 1' },
  { label: '2', value: '2', aria: 'Digit 2' },
  { label: '3', value: '3', aria: 'Digit 3' },
  { label: '4', value: '4', aria: 'Digit 4' },
  { label: '5', value: '5', aria: 'Digit 5' },
  { label: '6', value: '6', aria: 'Digit 6' },
  { label: '7', value: '7', aria: 'Digit 7' },
  { label: '8', value: '8', aria: 'Digit 8' },
  { label: '9', value: '9', aria: 'Digit 9' },
  { label: 'Clear', value: 'CLEAR', aria: 'Clear all PIN digits' },
  { label: '0', value: '0', aria: 'Digit 0' },
  { label: 'Del', value: 'BACKSPACE', aria: 'Delete last digit' },
];

const LAB_CAPABILITIES = [
  {
    number: '01',
    title: 'MNA Electrical Bench',
    detail:
      '0–30V programmable KL30/KL15 power supply, OCP protection, fault injection matrix, and live Digital Multimeter probing.',
  },
  {
    number: '02',
    title: 'Oscilloscope & Signal Lab',
    detail:
      'Dual-channel waveform capture for injector MOSFET flyback, 60-2 CKP/CMP crank timing, PWM actuators, and CAN bus telemetry.',
  },
  {
    number: '03',
    title: '3D ECU Twin & PCB Vision',
    detail:
      'Explodable ECU enclosure, interactive harness topology map, and SMD board optical inspection with thermal tracking.',
  },
  {
    number: '04',
    title: 'Grounded OEM Diagnostics',
    detail:
      'VIN recall decoding via NHTSA, step-by-step DTC isolation playbooks, offline PH fault database, and printable repair reports.',
  },
] as const;

function formatShortTime(ms: number | null): string {
  if (!ms) return 'Not activated';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const IntroductionPinLandingPage: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  const {
    signInWithGoogle,
    isSigningIn,
    authError,
    authErrorDetails,
    clearAuthError,
  } = useAuth();
  const {
    accessMode,
    trialRecord,
    lockNotice,
    isAdminUnlocked,
    clearLockNotice,
    redeemTrialPin,
    markAdminSessionActive,
    enterBenchAsAdmin,
  } = useTrialAccess();

  const [activeTab, setActiveTab] = useState<LandingGateTab>('PIN_ENTRY');
  const [logoFailed, setLogoFailed] = useState(false);
  const [bgFailed, setBgFailed] = useState(false);
  const [bannerFailed, setBannerFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const handleCopyUnauthorizedDomain = useCallback(async (hostname: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(hostname);
      }
      setCopiedDomain(true);
      window.setTimeout(() => setCopiedDomain(false), 2200);
    } catch {
      setCopiedDomain(false);
    }
  }, []);

  // Technician 8-digit PIN state
  const [pinDigits, setPinDigits] = useState('');
  const [deviceLabel, setDeviceLabel] = useState(() => getDefaultWorkstationLabel());
  const pinInputRef = useRef<HTMLInputElement>(null);

  // Admin Master state
  const [adminConfig, setAdminConfig] = useState<AdminPinConfigStatus | null>(null);
  const [masterPinInput, setMasterPinInput] = useState('');
  const [setupPinConfirm, setSetupPinConfirm] = useState('');
  const [trialDurationHours, setTrialDurationHours] = useState<TrialDurationHours>(4);
  const [trialNotes, setTrialNotes] = useState('');
  const [generatedPinBanner, setGeneratedPinBanner] = useState<{
    formattedPin: string;
    plainPin: string;
    durationHours: number;
  } | null>(null);
  const [adminTrials, setAdminTrials] = useState<ClientTrialPinRecord[]>([]);

  const workstationId = getOrCreateWorkstationDeviceId();

  const loadAdminConfigAndList = useCallback(async () => {
    try {
      const cfg = await fetchAdminPinConfigStatus();
      setAdminConfig(cfg);
      if (isAdminUnlocked) {
        const list = await fetchAdminTrialPinsList();
        setAdminTrials(list.trials);
      }
    } catch {
      // Non-fatal while checking admin config
    }
  }, [isAdminUnlocked]);

  useEffect(() => {
    void loadAdminConfigAndList();
  }, [loadAdminConfigAndList]);

  useEffect(() => {
    if (activeTab === 'PIN_ENTRY') {
      pinInputRef.current?.focus();
    }
  }, [activeTab]);

  const handleKeypadPress = (value: string) => {
    setErrorMsg(null);
    if (value === 'CLEAR') {
      playPinKeypadClick('clear');
      setPinDigits('');
      pinInputRef.current?.focus();
      return;
    }
    if (value === 'BACKSPACE') {
      playPinKeypadClick('backspace');
      setPinDigits((prev) => prev.slice(0, -1));
      pinInputRef.current?.focus();
      return;
    }
    if (/^\d$/.test(value)) {
      playPinKeypadClick('digit');
      setPinDigits((prev) => (prev.length >= 8 ? prev : prev + value));
    }
  };

  const handleVerifyPinAndEnter = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (pinDigits.length !== 8) {
      playSystemLockSound('error');
      setErrorMsg('Enter all 8 numeric digits issued by your Admin Master.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await redeemTrialPin(pinDigits, deviceLabel);
      playAccessGrantedChime();
      clearLockNotice();
      setPinDigits('');
    } catch (err: unknown) {
      playSystemLockSound('error');
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'PIN verification failed. Confirm the 8-digit PIN with your Admin Master.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFirstRunAdminSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    const cleaned = masterPinInput.replace(/\D/g, '');
    const confirmCleaned = setupPinConfirm.replace(/\D/g, '');
    if (cleaned.length < 6 || cleaned.length > 12) {
      playSystemLockSound('error');
      setErrorMsg('Master Admin PIN must be 6 to 12 numeric digits.');
      return;
    }
    if (cleaned !== confirmCleaned) {
      playSystemLockSound('error');
      setErrorMsg('Confirmation PIN does not match.');
      return;
    }
    setLoading(true);
    try {
      await setupFirstRunAdminPinClient(cleaned);
      playAccessGrantedChime();
      setMasterPinInput('');
      setSetupPinConfirm('');
      setAdminConfig({ masterEnvConfigured: false, adminClaimed: true });
      markAdminSessionActive(true);
      const list = await fetchAdminTrialPinsList();
      setAdminTrials(list.trials);
      setSuccessMsg('Master Admin PIN configured. Generate an 8-digit trial PIN or enter the bench lab.');
    } catch (err: unknown) {
      playSystemLockSound('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unable to configure Master Admin PIN.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminMasterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!masterPinInput.trim()) {
      playSystemLockSound('error');
      setErrorMsg('Enter the Master Admin PIN.');
      return;
    }
    setLoading(true);
    try {
      await loginAdminMasterPinClient(masterPinInput.trim());
      playAccessGrantedChime();
      setMasterPinInput('');
      markAdminSessionActive(true);
      const list = await fetchAdminTrialPinsList();
      setAdminTrials(list.trials);
      setSuccessMsg('Admin Master authenticated. Generate trial PINs below or enter the bench lab.');
    } catch (err: unknown) {
      playSystemLockSound('error');
      setErrorMsg(err instanceof Error ? err.message : 'Incorrect Master Admin PIN.');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await generateAdminTrialPinClient({
        durationHours: trialDurationHours,
        unusedExpiryHours: 72,
        notes: trialNotes.trim() || undefined,
      });
      setGeneratedPinBanner({
        formattedPin: res.formattedPin,
        plainPin: res.plainPin,
        durationHours: res.trial.durationHours,
      });
      setTrialNotes('');
      const list = await fetchAdminTrialPinsList();
      setAdminTrials(list.trials);
      setSuccessMsg(
        `Issued ${res.formattedPin} (${formatTrialDurationLabel(res.trial.durationHours, 'full')} single-device trial PIN).`
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate 8-digit trial PIN.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRevoke = async (rec: ClientTrialPinRecord) => {
    const nextRevoked = rec.status !== 'REVOKED';
    setLoading(true);
    setErrorMsg(null);
    try {
      await revokeAdminTrialPinClient(
        rec.trialId,
        nextRevoked,
        nextRevoked ? 'Revoked by Admin Master' : undefined
      );
      const list = await fetchAdminTrialPinsList();
      setAdminTrials(list.trials);
      setSuccessMsg(nextRevoked ? 'Trial PIN revoked.' : 'Trial PIN restored.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update PIN status.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetDevice = async (trialId: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await resetAdminTrialDeviceClient(trialId);
      const list = await fetchAdminTrialPinsList();
      setAdminTrials(list.trials);
      setSuccessMsg('Device binding cleared (0/1). Ready for technician login.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reset device binding.');
    } finally {
      setLoading(false);
    }
  };

  const handleLockAdmin = () => {
    playSystemLockSound('lock');
    setAdminPinToken(null);
    markAdminSessionActive(false);
    setAdminTrials([]);
    setGeneratedPinBanner(null);
    setSuccessMsg('Admin Master session locked.');
  };

  const handleCopyPin = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setSuccessMsg(`Copied PIN ${value} to clipboard.`);
    } catch {
      setErrorMsg('Clipboard unavailable in this browser.');
    }
  };

  const handleUseGeneratedPinInEntry = (plainPin: string) => {
    setPinDigits(plainPin);
    setActiveTab('PIN_ENTRY');
    setErrorMsg(null);
    setSuccessMsg('PIN loaded. Click "Verify PIN & Enter Bench Lab" to start the timed session.');
  };

  const pinSlots = Array.from({ length: 8 }, (_, idx) => pinDigits[idx] ?? '');
  const isExpiredOrRevoked = accessMode === 'TRIAL_EXPIRED' || accessMode === 'TRIAL_REVOKED';

  return (
    <div className="relative isolate min-h-[100dvh] w-full overflow-x-hidden bg-[#060B14] text-[#EAF3FF] font-body flex flex-col">
      {/* Background cover blend with zero-broken-image fallback */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {!bgFailed && (
          <img
            src={APP_LOGO_SRC}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setBgFailed(true)}
            className="hud-cover-backdrop-img opacity-15"
          />
        )}
        <div className="hud-cover-backdrop-scrim" />
      </div>

      {/* Strict 3-Zone Top Bar */}
      <header className="w-full border-b border-[#203653] bg-[#0A1220]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1220px] items-center justify-between gap-8 px-4 sm:px-6 py-3.5">
          {/* Zone 1: Clean single-line brand wordmark */}
          <a
            href="#pin-verification-gate"
            className="flex items-center gap-2.5 text-[#EAF3FF] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#19C8F5]"
          >
            {!logoFailed ? (
              <img
                src={APP_LOGO_SRC}
                alt="AutoElectric Lab Pro emblem"
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="h-7 w-7 rounded object-cover border border-[#203653]"
              />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded border border-[#203653] bg-[#0E192A] text-[#19C8F5]">
                <Cpu className="h-4 w-4" aria-hidden="true" />
              </span>
            )}
            <span className="font-hud text-lg font-bold tracking-wide">
              AutoElectric Lab Pro
            </span>
          </a>

          {/* Zone 2: Concise single-line navigation links */}
          <nav
            aria-label="Landing sections"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-[#91A4BD]"
          >
            <button
              type="button"
              onClick={() => setActiveTab('PIN_ENTRY')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-[#EAF3FF] hover:underline underline-offset-4 cursor-pointer ${
                activeTab === 'PIN_ENTRY' ? 'text-[#EAF3FF] underline' : ''
              }`}
            >
              PIN Entry
            </button>
            <a
              href="#bench-modules"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-[#EAF3FF] hover:underline underline-offset-4"
            >
              Bench Modules
            </a>
            <button
              type="button"
              onClick={() => setActiveTab('ADMIN_MASTER')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-[#EAF3FF] hover:underline underline-offset-4 cursor-pointer ${
                activeTab === 'ADMIN_MASTER' ? 'text-[#FFB020] underline' : ''
              }`}
            >
              Admin Master
            </button>
          </nav>

          {/* Zone 3: Single primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() =>
                setActiveTab((prev) => (prev === 'ADMIN_MASTER' ? 'PIN_ENTRY' : 'ADMIN_MASTER'))
              }
              className="whitespace-nowrap shrink-0 rounded-md border border-[#203653] bg-[#0E192A] px-4 py-2 text-xs font-semibold text-[#EAF3FF] transition-colors hover:border-[#19C8F5]/70 hover:text-white cursor-pointer min-h-[40px]"
            >
              {activeTab === 'ADMIN_MASTER' ? 'Technician PIN' : 'Admin Master'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-[1220px] flex-1 px-4 sm:px-6 py-6 sm:py-8 space-y-8 sm:space-y-10">
        {/* Featured Workshop Hero Banner */}
        {!bannerFailed && (
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: 'easeOut' }}
            className="w-full overflow-hidden rounded-xl border border-[#203653] bg-[#0A1220] shadow-2xl"
          >
            <img
              src={APP_HERO_BANNER_SRC}
              alt="Auto-Electronics Repair — Expert Diagnostics & Wiring, Module & Computer Repair"
              onError={() => setBannerFailed(true)}
              className="w-full aspect-[21/7] sm:aspect-[24/7] object-cover object-center block"
            />
          </motion.div>
        )}

        {/* Asymmetric Two-Column Hero & PIN Gate */}
        <section
          id="pin-verification-gate"
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start"
        >
          {/* Left Column: Introduction & Strict Access Policy */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: 'easeOut' }}
            className="lg:col-span-6 space-y-6 pt-1"
          >
            <p className="text-xs font-medium text-[#91A4BD] tracking-wide">
              Virtual ECU Lab · Automotive Bench Simulation · PIN-Gated Workstation
            </p>

            <h1
              className="font-hud font-bold tracking-tight text-[#EAF3FF] leading-[1.08]"
              style={{
                fontSize: 'clamp(2.25rem, 3.8vw, 3.35rem)',
                textWrap: 'balance',
              }}
            >
              Verify Your Admin PIN to Enter the Bench Lab
            </h1>

            <p className="max-w-[58ch] text-base text-[#91A4BD] leading-relaxed">
              Entry into AutoElectric Lab Pro is restricted. Technicians require an 8-digit verification PIN issued by the Admin Master before accessing the programmable ECU power supply, Modified Nodal Analysis circuit solver, oscilloscope, 3D harness twin, PCB optical scanner, and diagnostic reports.
            </p>

            {/* Hairline Key-Value Policy Table (Zero Cards-Within-Cards) */}
            <div className="border-t border-[#203653] pt-5 space-y-3.5 text-sm">
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 border-b border-[#203653]/60 pb-3">
                <span className="font-medium text-[#91A4BD]">Access Rule</span>
                <span className="font-mono text-xs sm:text-sm text-[#EAF3FF]">
                  Verified 8-digit Admin PIN required prior to entry
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 border-b border-[#203653]/60 pb-3">
                <span className="font-medium text-[#91A4BD]">Trial Window</span>
                <span className="font-mono text-xs sm:text-sm text-[#EAF3FF] tabular-nums">
                  3h–6h or 30d / 3m / 6m / 1y from first login
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 border-b border-[#203653]/60 pb-3">
                <span className="font-medium text-[#91A4BD]">Workstation Lock</span>
                <span className="font-mono text-xs sm:text-sm text-[#EAF3FF] tabular-nums">
                  Single device limit ({workstationId.slice(0, 14)}...)
                </span>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Primary Focal Anchor — Futuristic Glassmorphic PIN Verification Gate Console */}
          <motion.div
            data-testid="landing-pin-glass-console"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.36,
              delay: 0.06,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="relative overflow-hidden lg:col-span-6 rounded-2xl border border-[#19C8F5]/30 bg-[#0A1220]/78 p-5 sm:p-6 space-y-5 backdrop-blur-xl shadow-[0_24px_72px_rgba(2,10,24,0.85),0_0_42px_rgba(25,200,245,0.08)]"
          >
            {/* Top futuristic laser hairline accent */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#19C8F5]/80 to-transparent"
            />

            {/* Explicit Glowing Gate Status Badge (Text + Icon, never color alone) */}
            <div
              data-testid="landing-status-badge"
              className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs backdrop-blur-md transition-colors ${
                isExpiredOrRevoked
                  ? 'border-[#FF4D62]/60 bg-[#2A0E15]/85 text-[#FFC2CA] shadow-[0_0_24px_rgba(255,77,98,0.18)]'
                  : isAdminUnlocked
                    ? 'border-[#20D889]/55 bg-[#0A261B]/80 text-[#9BF3CB] shadow-[0_0_24px_rgba(32,216,137,0.15)]'
                    : 'border-[#19C8F5]/35 bg-[#0E192A]/85 text-[#C7DCF5] shadow-[0_0_24px_rgba(25,200,245,0.14)]'
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                {isExpiredOrRevoked ? (
                  <AlertTriangle className="h-4 w-4 text-[#FF4D62] shrink-0" aria-hidden="true" />
                ) : isAdminUnlocked ? (
                  <Unlock className="h-4 w-4 text-[#20D889] shrink-0" aria-hidden="true" />
                ) : (
                  <Lock className="h-4 w-4 text-[#FFB020] shrink-0" aria-hidden="true" />
                )}
                <span>
                  {accessMode === 'TRIAL_REVOKED'
                    ? 'Bench Lab Locked · Trial PIN Revoked'
                    : accessMode === 'TRIAL_EXPIRED'
                      ? 'Bench Lab Locked · Trial Session Expired'
                      : isAdminUnlocked
                        ? 'Admin Master Verified · Ready to Enter Bench Lab'
                        : 'Bench Lab Locked · Verification Required'}
                </span>
              </span>
              <span className="font-mono text-[10.5px] uppercase tracking-wider text-[#19C8F5] tabular-nums">
                {trialRecord?.maskedPin ? trialRecord.maskedPin : 'AES/SHA-256'}
              </span>
            </div>

            {/* Instant Google Account Sign-In with Firestore Cloud Sync */}
            <div className="space-y-2">
              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => {
                  setErrorMsg(null);
                  void signInWithGoogle();
                }}
                className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#19C8F5]/65 bg-[#0E2238] px-4 py-2.5 text-sm font-semibold text-[#EAF3FF] hover:bg-[#14304E] hover:border-[#19C8F5] disabled:opacity-60 transition cursor-pointer"
              >
                <LogIn className="h-4 w-4 text-[#19C8F5]" aria-hidden="true" />
                <span>
                  {isSigningIn
                    ? 'Signing in with Google...'
                    : 'Sign in with Google · Enter Bench Lab & Cloud Sync'}
                </span>
              </button>
              <div className="flex items-center gap-2 text-[11px] font-mono text-[#6F849F]">
                <span className="h-px flex-1 bg-[#203653]" />
                <span>OR USE 8-DIGIT PIN / ADMIN MASTER</span>
                <span className="h-px flex-1 bg-[#203653]" />
              </div>
            </div>

            {/* Segmented Mode Tabs (Technician PIN & Admin Master) */}
            <div
              role="tablist"
              aria-label="Verification method"
              className="grid grid-cols-2 gap-1.5 rounded-lg border border-[#203653] bg-[#050A12] p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'PIN_ENTRY'}
                onClick={() => {
                  setActiveTab('PIN_ENTRY');
                  setErrorMsg(null);
                }}
                className={`min-h-[40px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'PIN_ENTRY'
                    ? 'bg-[#0E192A] text-[#19C8F5] border border-[#19C8F5]/40'
                    : 'text-[#91A4BD] hover:text-[#EAF3FF]'
                }`}
              >
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Technician PIN</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'ADMIN_MASTER'}
                onClick={() => {
                  setActiveTab('ADMIN_MASTER');
                  setErrorMsg(null);
                  void loadAdminConfigAndList();
                }}
                className={`min-h-[40px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'ADMIN_MASTER'
                    ? 'bg-[#0E192A] text-[#FFB020] border border-[#FFB020]/45'
                    : 'text-[#91A4BD] hover:text-[#EAF3FF]'
                }`}
              >
                {isAdminUnlocked ? (
                  <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Admin Master</span>
              </button>
            </div>

            {/* Feedback & Lock Alerts */}
            {(lockNotice || errorMsg || authError) && (
              <div
                role="alert"
                className="rounded-lg border border-[#FF4D62]/50 bg-[#2A0E15] px-3.5 py-2.5 text-xs text-[#FFC2CA] space-y-2.5"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    className="h-4 w-4 text-[#FF4D62] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span className="leading-relaxed">{errorMsg || authError || lockNotice}</span>
                </div>

                {!errorMsg &&
                  authErrorDetails?.code === 'auth/unauthorized-domain' &&
                  authErrorDetails.hostname && (
                    <div
                      data-testid="unauthorized-domain-recovery"
                      className="pt-2 border-t border-[#FF4D62]/30 space-y-2"
                    >
                      <div className="font-mono text-[11px] text-[#FFE0E5] break-all tabular-nums">
                        {authErrorDetails.hostname}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopyUnauthorizedDomain(authErrorDetails.hostname!)
                          }
                          data-testid="copy-unauthorized-domain-btn"
                          className="min-h-[40px] px-3 py-1.5 rounded-md border border-[#FF8A99]/55 bg-[#3D141F] hover:bg-[#4E1A28] font-mono text-[11px] font-semibold text-[#FFF0F2] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{copiedDomain ? 'Domain Copied' : 'Copy Domain'}</span>
                        </button>

                        {authErrorDetails.consoleAuthorizedDomainsUrl && (
                          <a
                            href={authErrorDetails.consoleAuthorizedDomainsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="open-firebase-auth-settings-link"
                            className="min-h-[40px] px-3 py-1.5 rounded-md border border-[#19C8F5]/55 bg-[#0E192A] hover:bg-[#14253D] font-mono text-[11px] font-semibold text-[#19C8F5] inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Open Firebase Settings</span>
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={clearAuthError}
                          className="min-h-[40px] px-2.5 py-1.5 font-mono text-[11px] text-[#FFC2CA]/85 hover:text-white underline cursor-pointer whitespace-nowrap"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            )}

            {successMsg && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-lg border border-[#20D889]/45 bg-[#0A261B] px-3.5 py-2.5 text-xs text-[#8DF0C1]"
              >
                <CheckCircle2 className="h-4 w-4 text-[#20D889] shrink-0 mt-0.5" aria-hidden="true" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* TAB 1: TECHNICIAN 8-DIGIT PIN ENTRY */}
            {activeTab === 'PIN_ENTRY' && (
              <form onSubmit={handleVerifyPinAndEnter} className="space-y-4">
                <div>
                  <label
                    htmlFor="landing-pin-input"
                    className="block text-sm font-semibold text-[#EAF3FF]"
                  >
                    8-Digit Access PIN
                  </label>
                  <p className="text-xs text-[#91A4BD] mt-0.5">
                    Type on your keyboard, paste XXXX-XXXX, or tap the numeric keypad below.
                  </p>
                </div>

                {/* 8-Slot Segmented Readout with glass glow */}
                <div
                  className="grid grid-cols-9 items-center gap-1.5"
                  onClick={() => pinInputRef.current?.focus()}
                >
                  {pinSlots.slice(0, 4).map((digit, i) => (
                    <motion.div
                      key={i}
                      animate={
                        shouldReduceMotion
                          ? undefined
                          : digit
                            ? { scale: [1, 1.04, 1] }
                            : undefined
                      }
                      transition={{ duration: 0.14 }}
                      className={`flex h-12 items-center justify-center rounded-lg border font-mono text-xl font-bold tabular-nums transition-all backdrop-blur-sm ${
                        digit
                          ? 'border-[#19C8F5]/85 bg-[#0E2238]/90 text-[#EAF3FF] shadow-[0_0_16px_rgba(25,200,245,0.22)]'
                          : 'border-[#203653]/85 bg-[#050A12]/80 text-[#4E6480]'
                      }`}
                    >
                      {digit || '•'}
                    </motion.div>
                  ))}
                  <div className="flex items-center justify-center font-mono text-lg text-[#91A4BD]">
                    —
                  </div>
                  {pinSlots.slice(4, 8).map((digit, i) => (
                    <motion.div
                      key={i + 4}
                      animate={
                        shouldReduceMotion
                          ? undefined
                          : digit
                            ? { scale: [1, 1.04, 1] }
                            : undefined
                      }
                      transition={{ duration: 0.14 }}
                      className={`flex h-12 items-center justify-center rounded-lg border font-mono text-xl font-bold tabular-nums transition-all backdrop-blur-sm ${
                        digit
                          ? 'border-[#19C8F5]/85 bg-[#0E2238]/90 text-[#EAF3FF] shadow-[0_0_16px_rgba(25,200,245,0.22)]'
                          : 'border-[#203653]/85 bg-[#050A12]/80 text-[#4E6480]'
                      }`}
                    >
                      {digit || '•'}
                    </motion.div>
                  ))}
                </div>

                {/* Direct Keyboard / Paste Input */}
                <input
                  id="landing-pin-input"
                  ref={pinInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={pinDigits}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, '').slice(0, 8);
                    if (next.length > pinDigits.length) {
                      playPinKeypadClick('digit');
                    } else if (next.length < pinDigits.length) {
                      playPinKeypadClick('backspace');
                    }
                    setPinDigits(next);
                    setErrorMsg(null);
                  }}
                  placeholder="Enter or paste 8-digit PIN (e.g. 48291736)"
                  className="w-full rounded-lg border border-[#203653] bg-[#050A12]/85 px-3.5 py-2.5 font-mono text-sm tabular-nums text-[#EAF3FF] placeholder:text-[#5F748E] focus:border-[#19C8F5] focus:shadow-[0_0_18px_rgba(25,200,245,0.18)] focus:outline-none backdrop-blur-sm"
                />

                {/* Tactile 3x4 Glass Keypad */}
                <div className="grid grid-cols-3 gap-2">
                  {KEYPAD_KEYS.map((key) => (
                    <motion.button
                      key={key.value}
                      type="button"
                      aria-label={key.aria}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                      transition={{ duration: 0.08 }}
                      onClick={() => handleKeypadPress(key.value)}
                      className={`min-h-[46px] rounded-lg border font-mono text-sm font-semibold transition-all cursor-pointer flex items-center justify-center backdrop-blur-sm ${
                        key.value === 'CLEAR' || key.value === 'BACKSPACE'
                          ? 'border-[#203653]/85 bg-[#08101C]/85 text-[#91A4BD] hover:border-[#FFB020]/65 hover:text-[#FFB020]'
                          : 'border-[#203653]/90 bg-[#0E192A]/85 text-[#EAF3FF] hover:border-[#19C8F5]/75 hover:bg-[#13243B]/90 hover:shadow-[0_0_14px_rgba(25,200,245,0.15)]'
                      }`}
                    >
                      {key.value === 'BACKSPACE' ? (
                        <Delete className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        key.label
                      )}
                    </motion.button>
                  ))}
                </div>

                {/* Workstation Label + Submit */}
                <div className="space-y-3 pt-1">
                  <label className="block">
                    <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[#91A4BD]">
                      <Laptop className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Workstation Name (Single-Device Binding)</span>
                    </span>
                    <input
                      type="text"
                      value={deviceLabel}
                      onChange={(e) => setDeviceLabel(e.target.value)}
                      maxLength={80}
                      className="w-full rounded-md border border-[#203653] bg-[#050A12] px-3 py-2 text-xs text-[#EAF3FF] focus:border-[#19C8F5] focus:outline-none"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={loading || pinDigits.length !== 8}
                    className="w-full min-h-[48px] rounded-md bg-[#1677FF] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3B8BFF] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>
                      {loading ? 'Verifying PIN...' : 'Verify PIN & Enter Bench Lab'}
                    </span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: ADMIN MASTER CONSOLE */}
            {activeTab === 'ADMIN_MASTER' && (
              <div className="space-y-4">
                {!isAdminUnlocked ? (
                  adminConfig && !adminConfig.masterEnvConfigured && !adminConfig.adminClaimed ? (
                    <form onSubmit={handleFirstRunAdminSetup} className="space-y-3.5">
                      <div>
                        <h2 className="text-sm font-semibold text-[#FFB020]">
                          First-Run Master Admin PIN Setup
                        </h2>
                        <p className="text-xs text-[#91A4BD] mt-1">
                          No Master Admin PIN has been claimed on this server yet. Choose a 6–12 digit Master PIN so you can generate 3h–1y trial PINs for technicians.
                        </p>
                      </div>
                      <div className="space-y-2.5">
                        <input
                          type="password"
                          name="vecl-admin-setup-pin"
                          inputMode="numeric"
                          autoComplete="new-password"
                          value={masterPinInput}
                          onChange={(e) => setMasterPinInput(e.target.value.replace(/\D/g, '').slice(0, 12))}
                          placeholder="Choose Master Admin PIN (6–12 digits)"
                          className="w-full rounded-md border border-[#203653] bg-[#050A12] px-3.5 py-2.5 font-mono text-sm text-[#EAF3FF] placeholder:text-[#5F748E] focus:border-[#FFB020] focus:outline-none"
                        />
                        <input
                          type="password"
                          name="vecl-admin-setup-pin-confirm"
                          inputMode="numeric"
                          autoComplete="new-password"
                          value={setupPinConfirm}
                          onChange={(e) => setSetupPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 12))}
                          placeholder="Confirm Master Admin PIN"
                          className="w-full rounded-md border border-[#203653] bg-[#050A12] px-3.5 py-2.5 font-mono text-sm text-[#EAF3FF] placeholder:text-[#5F748E] focus:border-[#FFB020] focus:outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full min-h-[46px] rounded-md bg-[#FFB020] px-4 py-2.5 text-sm font-semibold text-[#060B14] transition-colors hover:bg-[#FFC24D] disabled:opacity-50 cursor-pointer"
                      >
                        {loading ? 'Saving Master PIN...' : 'Claim Master Admin PIN'}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleAdminMasterLogin} className="space-y-3.5">
                      <div>
                        <h2 className="text-sm font-semibold text-[#EAF3FF]">
                          Admin Master Verification
                        </h2>
                        <p className="text-xs text-[#91A4BD] mt-1">
                          Enter the Master Admin PIN to issue 8-digit trial PINs (3h to 1 year) or open the bench lab directly as administrator.
                        </p>
                      </div>
                      <input
                        type="password"
                        name="vecl-admin-master-pin"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={masterPinInput}
                        onChange={(e) => setMasterPinInput(e.target.value)}
                        placeholder="Enter Master Admin PIN"
                        className="w-full rounded-md border border-[#203653] bg-[#050A12] px-3.5 py-2.5 font-mono text-sm text-[#EAF3FF] placeholder:text-[#5F748E] focus:border-[#FFB020] focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={loading || !masterPinInput.trim()}
                        className="w-full min-h-[46px] rounded-md bg-[#FFB020] px-4 py-2.5 text-sm font-semibold text-[#060B14] transition-colors hover:bg-[#FFC24D] disabled:opacity-50 cursor-pointer"
                      >
                        {loading ? 'Verifying...' : 'Unlock Admin Generator'}
                      </button>
                    </form>
                  )
                ) : (
                  <div className="space-y-4">
                    {/* Admin Quick Entry + Lock Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#203653]">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-[#20D889]">
                        <Unlock className="h-4 w-4" aria-hidden="true" />
                        <span>Admin Master Verified</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            playAccessGrantedChime();
                            enterBenchAsAdmin();
                          }}
                          className="min-h-[38px] rounded-md bg-[#1677FF] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#3B8BFF] cursor-pointer flex items-center gap-1.5"
                        >
                          <span>Enter Bench Lab</span>
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={handleLockAdmin}
                          className="min-h-[38px] rounded-md border border-[#203653] bg-[#0E192A] px-3 py-1.5 text-xs font-medium text-[#91A4BD] hover:text-white cursor-pointer"
                        >
                          Lock
                        </button>
                      </div>
                    </div>

                    {/* Issue New 8-Digit Trial PIN */}
                    <form onSubmit={handleGeneratePin} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#EAF3FF]">
                          Generate 8-Digit Technician PIN
                        </span>
                        <span className="text-[11px] font-mono text-[#91A4BD]">
                          Single device · Starts on login
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        {TRIAL_DURATION_PRESETS.map((preset) => (
                          <button
                            key={preset.hours}
                            type="button"
                            onClick={() => setTrialDurationHours(preset.hours)}
                            title={preset.fullLabel}
                            className={`min-h-[38px] rounded-md border px-2 font-mono text-xs font-bold tabular-nums transition-colors cursor-pointer whitespace-nowrap ${
                              trialDurationHours === preset.hours
                                ? 'border-[#FFB020] bg-[#261D0D] text-[#FFB020]'
                                : 'border-[#203653] bg-[#050A12] text-[#91A4BD] hover:text-[#EAF3FF]'
                            }`}
                          >
                            {preset.fullLabel}
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={trialNotes}
                          onChange={(e) => setTrialNotes(e.target.value)}
                          placeholder="Technician / Bay note (optional)"
                          maxLength={100}
                          className="flex-1 rounded-md border border-[#203653] bg-[#050A12] px-3 py-2 text-xs text-[#EAF3FF] placeholder:text-[#5F748E] focus:border-[#FFB020] focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={loading}
                          className="min-h-[40px] rounded-md bg-[#FFB020] px-4 py-2 text-xs font-bold text-[#060B14] hover:bg-[#FFC24D] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                        >
                          <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Issue PIN</span>
                        </button>
                      </div>
                    </form>

                    {/* Newly Issued PIN Readout */}
                    {generatedPinBanner && (
                      <div className="rounded-lg border border-[#FFB020]/60 bg-[#1B1408] p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between text-xs text-[#FFD88A]">
                          <span>
                            Issued {formatTrialDurationLabel(generatedPinBanner.durationHours, 'full')} PIN
                          </span>
                          <span className="font-mono">Single Device Only</span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-2xl font-bold tracking-wider text-white tabular-nums">
                            {generatedPinBanner.formattedPin}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleCopyPin(generatedPinBanner.formattedPin)}
                              className="min-h-[36px] rounded-md border border-[#203653] bg-[#0E192A] px-3 py-1.5 text-xs font-medium text-[#EAF3FF] hover:border-[#19C8F5] cursor-pointer flex items-center gap-1.5"
                            >
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Copy</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleUseGeneratedPinInEntry(generatedPinBanner.plainPin)
                              }
                              className="min-h-[36px] rounded-md bg-[#1677FF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3B8BFF] cursor-pointer"
                            >
                              Use PIN
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Issued Trial PINs List */}
                    <div className="space-y-2 border-t border-[#203653] pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#EAF3FF]">
                          Issued Trial PIN Registry ({adminTrials.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => void loadAdminConfigAndList()}
                          className="text-xs text-[#19C8F5] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="h-3 w-3" aria-hidden="true" />
                          <span>Refresh</span>
                        </button>
                      </div>

                      {adminTrials.length === 0 ? (
                        <p className="text-xs text-[#91A4BD] py-2">
                          No 8-digit trial PINs issued yet.
                        </p>
                      ) : (
                        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                          {adminTrials.slice(0, 10).map((rec) => (
                            <div
                              key={rec.trialId}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#203653] bg-[#050A12] px-3 py-2 text-xs font-mono tabular-nums"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-[#EAF3FF]">{rec.maskedPin}</span>
                                  <span className="text-[#91A4BD]">
                                    {formatTrialDurationLabel(rec.durationHours, 'short')}
                                  </span>
                                  <span
                                    className={
                                      rec.status === 'ACTIVE'
                                        ? 'text-[#20D889]'
                                        : rec.status === 'UNUSED'
                                          ? 'text-[#19C8F5]'
                                          : 'text-[#FF4D62]'
                                    }
                                  >
                                    {rec.status}
                                  </span>
                                </div>
                                <div className="text-[10.5px] text-[#91A4BD] font-body truncate">
                                  {rec.notes || rec.boundDeviceLabel || 'Unbound'} · Exp:{' '}
                                  {formatShortTime(rec.expiresAtMs)}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 font-body">
                                {rec.boundDeviceId && (
                                  <button
                                    type="button"
                                    onClick={() => void handleResetDevice(rec.trialId)}
                                    className="rounded border border-[#203653] bg-[#0E192A] px-2 py-1 text-[11px] text-[#EAF3FF] hover:border-[#19C8F5] cursor-pointer flex items-center gap-1"
                                    title="Reset single-device binding"
                                  >
                                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                                    <span>Reset</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void handleToggleRevoke(rec)}
                                  className="rounded border border-[#203653] bg-[#0E192A] px-2 py-1 text-[11px] text-[#FF8B99] hover:border-[#FF4D62] cursor-pointer"
                                >
                                  {rec.status === 'REVOKED' ? 'Restore' : 'Revoke'}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

          </motion.div>
        </section>

        {/* Quiet Numbered Capabilities Overview */}
        <section id="bench-modules" className="border-t border-[#203653] pt-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h2 className="font-hud text-xl font-bold text-[#EAF3FF]">
                Inside the Bench Workstation
              </h2>
              <p className="text-sm text-[#91A4BD]">
                Modules unlocked upon Admin PIN verification.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#91A4BD]">
              <Clock className="h-3.5 w-3.5 text-[#19C8F5]" aria-hidden="true" />
              <span>Full Pro access active for assigned duration (3h–1y) once verified</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {LAB_CAPABILITIES.map((item) => (
              <article
                key={item.number}
                className="rounded-lg border border-[#203653] bg-[#0A1220] p-4 space-y-2"
              >
                <div className="font-mono text-xs font-semibold text-[#19C8F5] tabular-nums">
                  {item.number}.
                </div>
                <h3 className="font-hud text-base font-bold text-[#EAF3FF]">
                  {item.title}
                </h3>
                <p className="text-xs text-[#91A4BD] leading-relaxed">
                  {item.detail}
                </p>
              </article>
            ))}
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-[#203653] bg-[#080F1B]/90 backdrop-blur-sm py-4 px-4 sm:px-6 text-xs text-[#91A4BD]">
        <div className="mx-auto flex max-w-[1220px] flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            AutoElectric Lab Pro · {CREATOR_CREDENTIALS.shortOrg} · Lead Architect:{' '}
            {CREATOR_CREDENTIALS.leaders[0]?.name}
          </span>
          <span className="font-mono text-[11px] tabular-nums">
            Workstation ID: {workstationId}
          </span>
        </div>
      </footer>
    </div>
  );
};
