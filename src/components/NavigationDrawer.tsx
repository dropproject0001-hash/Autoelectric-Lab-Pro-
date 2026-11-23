import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Cpu,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Gauge,
  Globe,
  GraduationCap,
  HardDrive,
  HelpCircle,
  KeyRound,
  Layers,
  ListChecks,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Volume2,
  X,
  type LucideIcon,
} from 'lucide-react';

import { APP_ICON_SRC, APP_LOGO_SRC } from '../constants/branding';
import { useAuth } from '../context/AuthContext';
import { formatTrialCountdown, useTrialAccess } from '../context/TrialAccessContext';
import type { PwaStateAndActions } from '../hooks/usePWA';
import type { BilingualLang } from '../types/aiAssistant';
import { persistBilingualLang } from './ai/AiWorkbenchControlBar';
import { LicenseStatusBadge } from './billing/LicenseStatusBadge';
import type { WorkspaceTab } from './workspace/workspaceTypes';
import type { LabTab } from './LabTopNav';
import type { LabDrawerIconName } from './icons/LabDrawerIcons';

export interface DrawerNavTabItem {
  id: LabTab;
  label: string;
  icon: LucideIcon;
}

export interface DrawerActionItem {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  drawerIcon?: LabDrawerIconName;
  metaText?: string;
  tone?: 'default' | 'sky' | 'amber' | 'emerald' | 'rose';
  showChevron?: boolean;
  isActive?: boolean;
  onClick: () => void;
}

export interface SimulationSpeedOption {
  value: number;
  label: string;
}

const DEFAULT_SIMULATION_SPEEDS: readonly SimulationSpeedOption[] = [
  { value: 0.25, label: '0.25×' },
  { value: 0.5, label: '0.5×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
  { value: 4, label: '4×' },
];

export interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: (restoreFocus?: boolean) => void;
  drawerId: string;
  activeTab: LabTab;
  onSelectTab: (tab: LabTab) => void;
  navTabs: readonly DrawerNavTabItem[];
  simulationSpeed: number;
  simulationSpeedOptions?: readonly SimulationSpeedOption[];
  onChangeSimulationSpeed: (speed: number) => void;
  isSignedIn: boolean;
  onOpenCloudModal: () => void;
  onOpenDocsModal: () => void;
  onOpenWorkspaceModal: (tab: WorkspaceTab) => void;
  onOpenOfflineBot: () => void;
  onOpenGroundedSearch: () => void;
  onOpenIntroModal: () => void;
  onResetLab: () => void;
  onOpenLicenseModal?: () => void;
  onOpenPhysicalFaultModal?: () => void;
  onToggleAudioAlertsPanel?: () => void;
  activeAudioAlertCount?: number;
  onOpenGeminiStudio?: () => void;
  pwa?: PwaStateAndActions;
  onOpenPwaGuideModal?: () => void;
  onOpenVoiceMacroLibrary?: () => void;
  onOpenLookupDrawer?: () => void;
  isLookupDrawerOpen?: boolean;
  onOpenBatchPinTest?: () => void;
  batchSelectedPinCount?: number;
  onOpenCredentials?: () => void;
  bilingualLang?: BilingualLang;
  onChangeBilingualLang?: (lang: BilingualLang) => void;
  onOpenAcademyCurriculum?: () => void;
  onOpenSubscriptionModal?: () => void;
  onOpenAdminBillingModal?: () => void;
  isAdminUnlocked?: boolean;
  onOpenHelpDrawer?: () => void;
}

const ICON_TONE_CLASSES: Record<NonNullable<DrawerActionItem['tone']>, string> = {
  default: 'text-[#91A4BD] group-hover:text-[#19C8F5] group-hover:drop-shadow-[0_0_8px_rgba(25,200,245,0.45)]',
  sky: 'text-[#19C8F5] group-hover:text-[#56DAFF] group-hover:drop-shadow-[0_0_8px_rgba(25,200,245,0.5)]',
  amber: 'text-[#FFB020] group-hover:text-[#FFD06B] group-hover:drop-shadow-[0_0_8px_rgba(255,176,32,0.45)]',
  emerald: 'text-[#20D889] group-hover:text-[#5AE9AA] group-hover:drop-shadow-[0_0_8px_rgba(32,216,137,0.45)]',
  rose: 'text-[#FF4D62] group-hover:text-[#FF7D8D] group-hover:drop-shadow-[0_0_8px_rgba(255,77,98,0.45)]',
};

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19C8F5] focus-visible:ring-offset-1 focus-visible:ring-offset-[#060B14]';

function DrawerActionButton({
  tool,
  onSelect,
}: {
  tool: DrawerActionItem;
  onSelect: () => void;
}) {
  const Icon = tool.icon;
  const toneClass = ICON_TONE_CLASSES[tool.tone ?? 'default'];

  return (
    <button
      type="button"
      title={tool.description}
      aria-pressed={tool.isActive !== undefined ? tool.isActive : undefined}
      onClick={onSelect}
      className={[
        'group flex min-h-[48px] w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13px] cursor-pointer',
        FOCUS_RING,
        tool.isActive ? 'hud-drawer-item-active font-semibold' : 'hud-drawer-item font-medium',
      ].join(' ')}
    >
      <span className="flex min-w-0 items-center gap-3.5">
        <Icon
          aria-hidden="true"
          size={24}
          strokeWidth={1.75}
          className={`h-6 w-6 shrink-0 transition-all duration-150 ${
            tool.isActive
              ? 'text-[#19C8F5] drop-shadow-[0_0_8px_rgba(25,200,245,0.5)]'
              : toneClass
          }`}
        />
        <span className="truncate">{tool.label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {tool.metaText && (
          <span
            className={`font-mono text-[11px] font-semibold tabular-nums ${
              tool.tone === 'amber'
                ? 'text-[#FFB020]'
                : tool.tone === 'emerald'
                  ? 'text-[#20D889]'
                  : tool.tone === 'rose'
                    ? 'text-[#FF4D62]'
                    : 'text-[#19C8F5]'
            }`}
          >
            {tool.metaText}
          </span>
        )}
        {tool.showChevron && (
          <ChevronRight
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-[#91A4BD]/70 transition-transform group-hover:translate-x-0.5 group-hover:text-[#19C8F5]"
          />
        )}
      </span>
    </button>
  );
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  isOpen,
  onClose,
  drawerId,
  activeTab,
  onSelectTab,
  navTabs,
  simulationSpeed,
  simulationSpeedOptions = DEFAULT_SIMULATION_SPEEDS,
  onChangeSimulationSpeed,
  isSignedIn,
  onOpenCloudModal,
  onOpenDocsModal,
  onOpenWorkspaceModal,
  onOpenOfflineBot,
  onOpenGroundedSearch,
  onOpenIntroModal,
  onResetLab,
  onOpenLicenseModal,
  onOpenPhysicalFaultModal,
  onToggleAudioAlertsPanel,
  activeAudioAlertCount = 0,
  onOpenGeminiStudio,
  pwa,
  onOpenPwaGuideModal,
  onOpenVoiceMacroLibrary,
  onOpenLookupDrawer,
  isLookupDrawerOpen = false,
  onOpenBatchPinTest,
  batchSelectedPinCount,
  onOpenCredentials,
  bilingualLang = 'TL',
  onChangeBilingualLang,
  onOpenAcademyCurriculum,
  onOpenSubscriptionModal,
  onOpenAdminBillingModal,
  isAdminUnlocked = false,
  onOpenHelpDrawer,
}) => {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const [bannerFailed, setBannerFailed] = useState(false);
  const [emblemFailed, setEmblemFailed] = useState(false);
  const { accessMode, remainingSeconds, lockBenchSession } = useTrialAccess();
  const {
    user: googleUser,
    isSigningIn,
    syncStatus,
    signInWithGoogle,
    signOutUser,
    retryCloudSync,
  } = useAuth();

  const diagnosticTools = useMemo<readonly DrawerActionItem[]>(
    () => [
      ...(onOpenLookupDrawer
        ? [
            {
              id: 'trouble-scenarios-lookup',
              label: 'Scenario Lookup',
              description: 'Open 2,080 PH Trouble Scenarios Lookup & Diagnostic Dossier drawer',
              icon: Database,
              drawerIcon: 'server-drawer' as LabDrawerIconName,
              metaText: '2,080',
              tone: 'sky' as const,
              isActive: isLookupDrawerOpen,
              onClick: onOpenLookupDrawer,
            },
          ]
        : []),
      ...(onOpenAcademyCurriculum
        ? [
            {
              id: 'academy-lab-curriculum',
              label: 'Academy Lab',
              description: 'University 3-Tier Curriculum Matrix & SHA-256 Exam PDF',
              icon: GraduationCap,
              metaText: '3 Tiers',
              tone: 'sky' as const,
              showChevron: true,
              onClick: onOpenAcademyCurriculum,
            },
          ]
        : []),
      ...(onOpenGeminiStudio
        ? [
            {
              id: 'gemini-studio',
              label: 'AI Diagnostic Studio',
              description: 'Diagnostic Chat, Audio Transcribe, Maps, Video & Diagram Studio',
              icon: Sparkles,
              tone: 'sky' as const,
              onClick: onOpenGeminiStudio,
            },
          ]
        : []),
      ...(onOpenBatchPinTest
        ? [
            {
              id: 'batch-pin-test',
              label: 'Batch Pin Test',
              description:
                'Run bulk electrical continuity check on all selected ECU pins',
              icon: ListChecks,
              metaText:
                batchSelectedPinCount !== undefined
                  ? `${batchSelectedPinCount} Pins`
                  : 'Check',
              tone: 'emerald' as const,
              showChevron: true,
              onClick: onOpenBatchPinTest,
            },
          ]
        : []),
      ...(onOpenPhysicalFaultModal
        ? [
            {
              id: 'physical-fault-isolation',
              label: 'Bench Fault Isolation',
              description: 'Enter physical multimeter readings for evidence-ranked ECU fault isolation',
              icon: Cpu,
              drawerIcon: 'trouble-drawer' as LabDrawerIconName,
              tone: 'amber' as const,
              onClick: onOpenPhysicalFaultModal,
            },
          ]
        : []),
      ...(onOpenVoiceMacroLibrary
        ? [
            {
              id: 'voice-macros',
              label: 'Macro Library',
              description: 'Record live bench actions and run sequential voice macros',
              icon: Layers,
              drawerIcon: 'tray-stack' as LabDrawerIconName,
              tone: 'amber' as const,
              onClick: onOpenVoiceMacroLibrary,
            },
          ]
        : []),
      {
        id: 'assistant',
        label: 'Offline Bot',
        description: 'Open the offline diagnostic assistant',
        icon: Bot,
        tone: 'amber',
        onClick: onOpenOfflineBot,
      },
      {
        id: 'search',
        label: 'Live OEM Search',
        description: 'Search OEM bulletins, service information, and pinouts',
        icon: Globe,
        tone: 'emerald',
        onClick: onOpenGroundedSearch,
      },
    ],
    [
      batchSelectedPinCount,
      isLookupDrawerOpen,
      onOpenAcademyCurriculum,
      onOpenBatchPinTest,
      onOpenGeminiStudio,
      onOpenGroundedSearch,
      onOpenLookupDrawer,
      onOpenOfflineBot,
      onOpenPhysicalFaultModal,
      onOpenVoiceMacroLibrary,
    ],
  );

  const workspaceViewTools = useMemo<readonly DrawerActionItem[]>(
    () => [
      {
        id: 'workspaces',
        label: 'Saved Benches',
        description: 'Save or load local bench sessions and diagnostic logs (IndexedDB)',
        icon: Save,
        drawerIcon: 'archive',
        tone: 'emerald',
        showChevron: true,
        onClick: onOpenCloudModal,
      },
      {
        id: 'reports',
        label: 'Diagnostic Report',
        description: 'Export live MNA ECU bench reports as local TXT, Markdown, or PDF',
        icon: FileText,
        tone: 'sky',
        showChevron: true,
        onClick: onOpenDocsModal,
      },
      {
        id: 'drive',
        label: 'Bench Export Hub',
        description: 'Export or import local JSON snapshots, CSV pinout matrices, and checklists',
        icon: HardDrive,
        tone: 'sky',
        showChevron: true,
        onClick: () => onOpenWorkspaceModal('DRIVE'),
      },
      {
        id: 'sheets',
        label: 'Pinout Matrix (.CSV)',
        description: 'Export live 16-pin MNA voltage & current telemetry matrix as local CSV',
        icon: FileSpreadsheet,
        tone: 'emerald',
        showChevron: true,
        onClick: () => onOpenWorkspaceModal('SHEETS'),
      },
    ],
    [onOpenCloudModal, onOpenDocsModal, onOpenWorkspaceModal],
  );

  const configurationTools = useMemo<readonly DrawerActionItem[]>(
    () => [
      ...(onToggleAudioAlertsPanel
        ? [
            {
              id: 'circuit-audio-alerts',
              label: 'Audio Alerts',
              description: 'Configure acoustic alerts for short circuits and voltage drops',
              icon: Volume2,
              metaText: activeAudioAlertCount > 0 ? String(activeAudioAlertCount) : undefined,
              tone: (activeAudioAlertCount > 0 ? 'amber' : 'emerald') as 'amber' | 'emerald',
              onClick: onToggleAudioAlertsPanel,
            },
          ]
        : []),
      ...(onOpenLicenseModal
        ? [
            {
              id: 'license-manager',
              label: 'Trial PIN Access',
              description: 'Enter 8-digit Trial PIN or manage 3–6h trial sessions via Master Admin PIN',
              icon: KeyRound,
              metaText:
                accessMode === 'TRIAL_ACTIVE'
                  ? formatTrialCountdown(remainingSeconds)
                  : accessMode === 'TRIAL_EXPIRED' || accessMode === 'TRIAL_REVOKED'
                    ? 'Expired'
                    : accessMode === 'ADMIN'
                      ? 'Admin'
                      : 'PIN',
              tone: (accessMode === 'TRIAL_ACTIVE'
                ? 'emerald'
                : accessMode === 'TRIAL_EXPIRED' || accessMode === 'TRIAL_REVOKED'
                  ? 'rose'
                  : 'amber') as 'emerald' | 'rose' | 'amber',
              showChevron: true,
              onClick: onOpenLicenseModal,
            },
          ]
        : []),
      {
        id: 'lock-bench-pin-gate',
        label: 'Lock Bench Lab',
        description: 'Return to the Introduction Login PIN Verification Landing Page',
        icon: Lock,
        metaText: 'Exit',
        tone: 'rose' as const,
        onClick: lockBenchSession,
      },
      ...(pwa?.updateAvailable
        ? [
            {
              id: 'pwa-apply-update',
              label: 'Update App',
              description: 'A new version of Virtual ECU Lab Pro is ready. Click to update now.',
              icon: RefreshCw,
              tone: 'emerald' as const,
              metaText: 'Ready',
              onClick: () => pwa.applyUpdate(),
            },
          ]
        : []),
      ...(pwa?.isInstallable && !pwa.isInstalled
        ? [
            {
              id: 'pwa-install-app',
              label: 'Install App',
              description:
                'Install Virtual ECU Lab Pro on your device for standalone offline-ready operation',
              icon: Download,
              tone: 'amber' as const,
              metaText: 'PWA',
              onClick: () => {
                void pwa.promptInstall().then((outcome) => {
                  if (outcome === 'unavailable') {
                    onOpenPwaGuideModal?.();
                  }
                });
              },
            },
          ]
        : []),
      ...(onOpenPwaGuideModal
        ? [
            {
              id: 'pwa-install-guide',
              label: pwa?.isInstalled
                ? 'App Installed'
                : pwa?.isIOS
                  ? 'Install App (iOS)'
                  : 'PWA Install Guide',
              description: pwa?.isInstalled
                ? 'Virtual ECU Lab Pro is running as an installed app. Open PWA status & update controls.'
                : 'Install AutoElectric Lab Pro on Android, Desktop, or iOS',
              icon: pwa?.isInstalled ? CheckCircle2 : pwa?.isIOS ? Smartphone : Download,
              tone: 'emerald' as const,
              metaText: pwa?.isInstalled ? 'Installed' : undefined,
              showChevron: true,
              onClick: onOpenPwaGuideModal,
            },
          ]
        : []),
      ...(onOpenAdminBillingModal && isAdminUnlocked
        ? [
            {
              id: 'admin-pin-qr-manager',
              label: 'Admin PIN / QR',
              description: 'Master Admin Offline PIN Generator & E-Wallet QR Uploader',
              icon: KeyRound,
              metaText: 'Admin',
              tone: 'amber' as const,
              showChevron: true,
              onClick: onOpenAdminBillingModal,
            },
          ]
        : []),
      ...(onOpenHelpDrawer
        ? [
            {
              id: 'help-quick-guides',
              label: bilingualLang === 'TL' ? 'Gabay at Tulong' : 'Help & Quick Guides',
              description: '5 interactive beginner-safe ECU bench guides (Taglish & English)',
              icon: BookOpen,
              tone: 'sky' as const,
              showChevron: true,
              onClick: onOpenHelpDrawer,
            },
          ]
        : []),
      {
        id: 'guide',
        label: 'Slide Walkthrough',
        description: 'Open technician visual slide walkthrough and credentials',
        icon: HelpCircle,
        tone: 'default',
        showChevron: true,
        onClick: onOpenIntroModal,
      },
      {
        id: 'reset',
        label: 'Reset Bench',
        description: 'Reset the bench to factory defaults',
        icon: RotateCcw,
        tone: 'rose',
        onClick: onResetLab,
      },
    ],
    [
      activeAudioAlertCount,
      accessMode,
      bilingualLang,
      isAdminUnlocked,
      lockBenchSession,
      onOpenAdminBillingModal,
      onOpenHelpDrawer,
      onOpenIntroModal,
      onOpenLicenseModal,
      onOpenPwaGuideModal,
      onResetLab,
      onToggleAudioAlertsPanel,
      pwa,
      remainingSeconds,
    ],
  );

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
        onClose(true);
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

  const backdropVariants = {
    closed: {
      opacity: 0,
      transition: shouldReduceMotion
        ? { duration: 0.01 }
        : { duration: 0.18, ease: [0.4, 0, 1, 1] as const },
    },
    open: {
      opacity: 1,
      transition: shouldReduceMotion
        ? { duration: 0.01 }
        : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
    },
  };

  const panelVariants = {
    closed: {
      x: '-100%',
      transition: shouldReduceMotion
        ? { duration: 0.01 }
        : { duration: 0.2, ease: [0.4, 0, 1, 1] as const },
    },
    open: {
      x: 0,
      transition: shouldReduceMotion
        ? { duration: 0.01 }
        : { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const },
    },
  };

  const drawerListVariants = {
    closed: {
      opacity: 0,
      transition: shouldReduceMotion ? { duration: 0.01 } : { duration: 0.12 },
    },
    open: {
      opacity: 1,
      transition: shouldReduceMotion
        ? { duration: 0.01 }
        : {
            duration: 0.16,
            delayChildren: 0.08,
            staggerChildren: 0.055,
          },
    },
  };

  const drawerSectionVariants = {
    closed: {
      opacity: 0,
      x: shouldReduceMotion ? 0 : -10,
      transition: shouldReduceMotion ? { duration: 0.01 } : { duration: 0.12 },
    },
    open: {
      opacity: 1,
      x: 0,
      transition: shouldReduceMotion
        ? { duration: 0.01 }
        : {
            duration: 0.22,
            ease: [0.22, 1, 0.36, 1] as const,
            delayChildren: 0.02,
            staggerChildren: 0.032,
          },
    },
  };

  const drawerItemVariants = {
    closed: {
      opacity: 0,
      x: shouldReduceMotion ? 0 : -14,
      y: shouldReduceMotion ? 0 : 4,
      transition: shouldReduceMotion ? { duration: 0.01 } : { duration: 0.1 },
    },
    open: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: shouldReduceMotion
        ? { duration: 0.01 }
        : {
            duration: 0.22,
            ease: [0.22, 1, 0.36, 1] as const,
          },
    },
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="navigation-drawer-root"
          initial="closed"
          animate="open"
          exit="closed"
          className="fixed inset-0 z-[70] flex"
        >
          {/* Semi-Transparent Dark Background Overlay — Outside Click Closes Drawer */}
          <motion.div
            key="navigation-drawer-backdrop"
            aria-hidden="true"
            variants={backdropVariants}
            onClick={() => onClose(true)}
            className="fixed inset-0 bg-[#02050B]/82 backdrop-blur-[3px] will-change-[opacity]"
          />

          {/* Left-Sliding Overlay Drawer Panel */}
          <motion.aside
            key="navigation-drawer-panel"
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            variants={panelVariants}
            className="hud-drawer-surface relative z-10 flex h-[100dvh] w-[304px] sm:w-[324px] max-w-[88vw] flex-col pl-[env(safe-area-inset-left)] text-[#EAF3FF] will-change-transform"
          >
            {/* Electric Cyan Top Edge Highlight */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[1.5px] bg-gradient-to-r from-[#1677FF]/40 via-[#19C8F5]/85 to-transparent"
            />

            {/* Branded AutoElectric Lab Pro Drawer Header */}
            <div className="relative shrink-0 overflow-hidden border-b border-[#203653] bg-[#0A1220] px-4 pb-3.5 pt-[max(0.875rem,env(safe-area-inset-top))]">
              {!bannerFailed && (
                <img
                  src={APP_LOGO_SRC}
                  alt=""
                  aria-hidden="true"
                  referrerPolicy="no-referrer"
                  onError={() => setBannerFailed(true)}
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-25 mix-blend-screen select-none"
                />
              )}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#060B14]/95 via-[#0A1220]/82 to-[#060B14]/92"
              />

              <div className="relative z-10 flex items-center justify-between gap-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#19C8F5]/55 bg-[#050A12] shadow-[0_0_16px_rgba(25,200,245,0.18)]">
                    {!emblemFailed ? (
                      <img
                        src={APP_ICON_SRC}
                        alt="AutoElectric Lab Pro emblem"
                        referrerPolicy="no-referrer"
                        onError={() => setEmblemFailed(true)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Cpu className="h-5 w-5 text-[#19C8F5]" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1 whitespace-nowrap leading-none">
                      <span className="font-body text-[15px] font-bold italic tracking-tight brand-wordmark-silver">
                        AutoElectric Lab
                      </span>
                      <span className="font-body text-[15px] font-bold italic tracking-tight brand-wordmark-amber">
                        Pro
                      </span>
                    </div>
                    <h2
                      id={titleId}
                      className="mt-1 font-hud text-[11px] font-bold uppercase tracking-[0.14em] text-[#19C8F5]"
                    >
                      Modules &amp; Tools
                    </h2>
                  </div>
                </div>

                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => onClose(true)}
                  aria-label="Close navigation drawer"
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#203653] bg-[#0E192A]/95 text-[#EAF3FF] transition-colors hover:border-[#19C8F5]/80 hover:bg-[#132238] hover:text-white cursor-pointer ${FOCUS_RING}`}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Scrollable Midnight-Navy & Electric-Cyan Section Cards */}
            <motion.div
              variants={drawerListVariants}
              className="flex-1 overflow-y-auto overscroll-contain px-3.5 py-3.5 space-y-3"
            >
              {/* Section 1: DIAGNOSTIC TOOLS */}
              {diagnosticTools.length > 0 && (
                <motion.section
                  variants={drawerSectionVariants}
                  aria-label="Diagnostic Tools"
                  className="hud-drawer-section"
                >
                  <div className="mb-1.5 flex items-center justify-between border-b border-[#203653]/75 px-2 pb-1.5 pt-0.5">
                    <span className="font-hud text-[11.5px] font-bold uppercase tracking-[0.14em] text-[#91A4BD]">
                      Diagnostic Tools
                    </span>
                    <span className="font-mono text-[10px] text-[#91A4BD]/80 tabular-nums">
                      {diagnosticTools.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {diagnosticTools.map((tool) => (
                      <motion.div
                        key={tool.id}
                        variants={drawerItemVariants}
                        className="will-change-transform"
                      >
                        <DrawerActionButton
                          tool={tool}
                          onSelect={() => {
                            onClose(false);
                            tool.onClick();
                          }}
                        />
                      </motion.div>
                    ))}
                  </div>
                </motion.section>
              )}

              {/* Section 2: WORKSPACE VIEWS */}
              <motion.section
                variants={drawerSectionVariants}
                aria-label="Workspace Views"
                className="hud-drawer-section"
              >
                <div className="mb-1.5 flex items-center justify-between border-b border-[#203653]/75 px-2 pb-1.5 pt-0.5">
                  <span className="font-hud text-[11.5px] font-bold uppercase tracking-[0.14em] text-[#91A4BD]">
                    Workspace Views
                  </span>
                  <span className="font-mono text-[10.5px] font-semibold text-[#19C8F5]">
                    Local Mode
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  {navTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <motion.div
                        key={tab.id}
                        variants={drawerItemVariants}
                        className="will-change-transform"
                      >
                        <button
                          type="button"
                          aria-current={isActive ? 'page' : undefined}
                          onClick={() => {
                            onSelectTab(tab.id);
                            onClose(false);
                          }}
                          className={[
                            'group flex min-h-[48px] w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13px] cursor-pointer whitespace-nowrap',
                            FOCUS_RING,
                            isActive ? 'hud-drawer-item-active font-semibold' : 'hud-drawer-item font-medium',
                          ].join(' ')}
                        >
                          <span className="flex min-w-0 items-center gap-3.5">
                            <Icon
                              aria-hidden="true"
                              size={24}
                              strokeWidth={1.75}
                              className={`h-6 w-6 shrink-0 transition-all duration-150 ${
                                isActive
                                  ? 'text-[#19C8F5] drop-shadow-[0_0_8px_rgba(25,200,245,0.5)]'
                                  : 'text-[#91A4BD] group-hover:text-[#19C8F5] group-hover:drop-shadow-[0_0_8px_rgba(25,200,245,0.45)]'
                              }`}
                            />
                            <span className="truncate">{tab.label}</span>
                          </span>
                          {isActive && (
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#19C8F5]">
                              Active
                            </span>
                          )}
                        </button>
                      </motion.div>
                    );
                  })}
                </div>

                {workspaceViewTools.length > 0 && (
                  <div className="my-2.5 border-t border-[#203653]/85 pt-2">
                    <div className="px-2 pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#91A4BD]/85">
                      Saved Sessions &amp; Exports
                    </div>
                    <div className="flex flex-col gap-1">
                      {workspaceViewTools.map((tool) => (
                        <motion.div
                          key={tool.id}
                          variants={drawerItemVariants}
                          className="will-change-transform"
                        >
                          <DrawerActionButton
                            tool={tool}
                            onSelect={() => {
                              onClose(false);
                              tool.onClick();
                            }}
                          />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.section>

              {/* Section 3: CONFIGURATION */}
              <motion.section
                variants={drawerSectionVariants}
                aria-label="Configuration"
                className="hud-drawer-section"
              >
                <div className="mb-2 flex items-center justify-between border-b border-[#203653]/75 px-2 pb-1.5 pt-0.5">
                  <span className="font-hud text-[11.5px] font-bold uppercase tracking-[0.14em] text-[#91A4BD]">
                    Configuration
                  </span>
                </div>

                {/* Simulation Speed Selector */}
                <motion.div
                  variants={drawerItemVariants}
                  className="mb-2 hw-lcd-well rounded-lg px-3 py-2.5 will-change-transform"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-3 text-[12.5px] font-semibold text-[#EAF3FF]">
                      <Gauge
                        size={24}
                        strokeWidth={1.75}
                        className="h-6 w-6 text-[#19C8F5] shrink-0"
                        aria-hidden="true"
                      />
                      Simulation Speed
                    </span>
                    <span className="font-mono text-[11px] font-bold text-[#19C8F5] tabular-nums">
                      {simulationSpeed}×
                    </span>
                  </div>
                  <div
                    role="group"
                    aria-label="Simulation speed presets"
                    className="grid grid-cols-5 gap-1"
                  >
                    {simulationSpeedOptions.map((option) => {
                      const isSelected = simulationSpeed === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => onChangeSimulationSpeed(option.value)}
                          className={[
                            'min-h-[34px] rounded-md border px-1 py-1 font-mono text-[10.5px] font-semibold tabular-nums transition-colors cursor-pointer',
                            FOCUS_RING,
                            isSelected
                              ? 'diag-tab-active border-[#19C8F5]/85 text-white'
                              : 'border-[#203653] bg-[#0A1220] text-[#91A4BD] hover:border-[#19C8F5]/55 hover:text-[#EAF3FF]',
                          ].join(' ')}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>

                {/* Language & License / Account Controls */}
                {(onChangeBilingualLang || onOpenSubscriptionModal) && (
                  <motion.div
                    variants={drawerItemVariants}
                    className="mb-2 hw-lcd-well rounded-lg px-3 py-2.5 space-y-2 will-change-transform"
                  >
                    {onChangeBilingualLang && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-[12px] font-semibold text-[#EAF3FF]">
                          <Globe className="w-4 h-4 text-[#19C8F5]" aria-hidden="true" />
                          <span>{bilingualLang === 'TL' ? 'Wika ng Coach' : 'Coach Language'}</span>
                        </span>
                        <div className="inline-flex rounded-md border border-[#203653] bg-[#0A1220] p-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              persistBilingualLang('TL');
                              onChangeBilingualLang('TL');
                            }}
                            aria-pressed={bilingualLang === 'TL'}
                            className={`px-2 py-0.5 rounded font-mono text-[10.5px] font-bold cursor-pointer ${
                              bilingualLang === 'TL'
                                ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50'
                                : 'text-[#91A4BD] hover:text-white'
                            }`}
                          >
                            TL
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              persistBilingualLang('EN');
                              onChangeBilingualLang('EN');
                            }}
                            aria-pressed={bilingualLang === 'EN'}
                            className={`px-2 py-0.5 rounded font-mono text-[10.5px] font-bold cursor-pointer ${
                              bilingualLang === 'EN'
                                ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50'
                                : 'text-[#91A4BD] hover:text-white'
                            }`}
                          >
                            EN
                          </button>
                        </div>
                      </div>
                    )}

                    {onOpenSubscriptionModal && (
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#203653]/70">
                        <span className="font-mono text-[10.5px] text-[#91A4BD]">
                          {bilingualLang === 'TL' ? 'Lisensya' : 'License'}
                        </span>
                        <LicenseStatusBadge
                          lang={bilingualLang}
                          onClick={() => {
                            onClose(false);
                            onOpenSubscriptionModal();
                          }}
                        />
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Google Account & Firestore Cloud Sync Card */}
                <motion.div
                  variants={drawerItemVariants}
                  className="mb-2 hw-lcd-well rounded-lg px-3 py-2.5 space-y-2 will-change-transform"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[12px] font-semibold text-[#EAF3FF] min-w-0">
                      <Cloud
                        className={`w-4 h-4 shrink-0 ${
                          googleUser
                            ? syncStatus.pendingCount > 0
                              ? 'text-[#FFB020]'
                              : 'text-[#20D889]'
                            : 'text-[#91A4BD]'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="truncate">
                        {googleUser
                          ? googleUser.displayName || googleUser.email || 'Cloud Account'
                          : 'Google Cloud Sync'}
                      </span>
                    </span>
                    {googleUser && (
                      <button
                        type="button"
                        onClick={() => void retryCloudSync()}
                        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-[#19C8F5] hover:text-white cursor-pointer shrink-0"
                        title="Retry or verify Firestore Cloud Sync"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${
                            syncStatus.state === 'SYNCING' ? 'animate-spin' : ''
                          }`}
                        />
                        <span>
                          {syncStatus.pendingCount > 0
                            ? `Sync (${syncStatus.pendingCount})`
                            : 'Synced'}
                        </span>
                      </button>
                    )}
                  </div>

                  {googleUser ? (
                    <button
                      type="button"
                      onClick={() => void signOutUser()}
                      className={`w-full inline-flex items-center justify-center gap-1.5 min-h-[34px] rounded-md border border-[#FF4D62]/45 bg-[#200C13]/75 hover:bg-[#31111C] font-mono text-[11px] font-semibold text-[#FFC2CA] cursor-pointer ${FOCUS_RING}`}
                    >
                      <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Sign Out</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isSigningIn}
                      onClick={() => void signInWithGoogle()}
                      className={`w-full inline-flex items-center justify-center gap-1.5 min-h-[34px] rounded-md border border-[#19C8F5]/55 bg-[#0E192A] hover:bg-[#14253D] font-mono text-[11px] font-bold text-[#19C8F5] disabled:opacity-60 cursor-pointer ${FOCUS_RING}`}
                    >
                      <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{isSigningIn ? 'Signing in...' : 'Google Sign-In'}</span>
                    </button>
                  )}
                </motion.div>

                {configurationTools.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {configurationTools.map((tool) => (
                      <motion.div
                        key={tool.id}
                        variants={drawerItemVariants}
                        className="will-change-transform"
                      >
                        <DrawerActionButton
                          tool={tool}
                          onSelect={() => {
                            onClose(false);
                            tool.onClick();
                          }}
                        />
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.section>
            </motion.div>

            {/* Docked Bottom Official Credentials Footer */}
            {onOpenCredentials && (
              <motion.div
                variants={drawerItemVariants}
                className="shrink-0 border-t border-[#203653] bg-[#0A1220]/98 px-3.5 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] will-change-transform"
              >
                <button
                  type="button"
                  onClick={() => {
                    onClose(false);
                    onOpenCredentials();
                  }}
                  aria-label="Open Official Credentials modal"
                  className={`hud-drawer-item group flex min-h-[50px] w-full items-center justify-between gap-2.5 rounded-xl !border-[#203653] bg-[#0E192A]/95 px-3 py-2 text-left cursor-pointer ${FOCUS_RING}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#19C8F5]/40 bg-[#050A12] text-[#19C8F5] transition-all group-hover:border-[#19C8F5]/80 group-hover:shadow-[0_0_12px_rgba(25,200,245,0.28)]">
                      <ShieldCheck size={24} strokeWidth={1.75} className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold text-[#EAF3FF] group-hover:text-white truncate">
                        Official Credentials
                      </div>
                      <div className="font-mono text-[10px] text-[#91A4BD] truncate">
                        Ruben Llego · Elnombre Danong
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-[#91A4BD]/80 transition-transform group-hover:translate-x-0.5 group-hover:text-[#19C8F5]"
                  />
                </button>
              </motion.div>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
