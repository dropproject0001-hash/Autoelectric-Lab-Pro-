/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  BookOpen,
  Box,
  Cable,
  Cloud,
  Cpu,
  FileText,
  Menu,
  RefreshCw,
  ScanLine,
  Volume2,
  VolumeX,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import type { CircuitSolution } from '../utils/circuitSolver';
import type { PowerSupplyState } from '../types/ecu';
import type { PwaStateAndActions } from '../hooks/usePWA';
import type { BilingualLang } from '../types/aiAssistant';
import type { WorkspaceTab } from './workspace/workspaceTypes';
import { APP_ICON_SRC, RAMTI_SUBTITLE_INLINE } from '../constants/branding';
import { CredentialsModal } from './CredentialsModal';
import { NavigationDrawer, type DrawerNavTabItem } from './NavigationDrawer';
import { RamtiVectorEmblem } from './icons/RamtiBrandAssets';
import { formatTrialCountdown, useTrialAccess } from '../context/TrialAccessContext';
import { useAuth } from '../context/AuthContext';
import {
  isUiSoundEnabled,
  playCockpitTabDetent,
  playDrawerPneumaticSlide,
  subscribeUiSoundPreference,
  toggleUiSoundEnabled,
} from '../utils/audioFeedback';

export type LabTab =
  | 'BENCH_LAB'
  | 'WIRING_DIAGRAM'
  | 'THREE_D_TWIN'
  | 'ECU_PINOUT'
  | 'OSCILLOSCOPE'
  | 'PCB_SCANNER'
  | 'REPAIR_GUIDE'
  | 'KNOWLEDGE_CENTER';

export type RackFilter = 'ALL' | 'DMM_POWER' | 'FAULT_MATRIX';

export type MobileBenchPane = 'INSTRUMENTS' | 'CANVAS' | 'GUIDE';

export interface LabTopNavProps {
  activeTab: LabTab;
  onSelectTab: (tab: LabTab) => void;
  simulationSpeed: number;
  onChangeSimulationSpeed: (speed: number) => void;
  circuitSolution: CircuitSolution;
  powerSupply?: PowerSupplyState;
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
  bilingualLang?: BilingualLang;
  onChangeBilingualLang?: (lang: BilingualLang) => void;
  onOpenAcademyCurriculum?: () => void;
  onOpenSubscriptionModal?: () => void;
  onOpenAdminBillingModal?: () => void;
  isAdminUnlocked?: boolean;
  onOpenHelpDrawer?: () => void;
}

interface NavigationItem extends DrawerNavTabItem {
  shortLabel: string;
  icon: LucideIcon;
}

const NAV_TABS: readonly NavigationItem[] = [
  { id: 'BENCH_LAB', label: 'Bench Lab', shortLabel: 'Bench', icon: Wrench },
  { id: 'WIRING_DIAGRAM', label: 'Harness Wiring', shortLabel: 'Wiring', icon: Cable },
  { id: 'THREE_D_TWIN', label: '3D Bench Twin', shortLabel: '3D Twin', icon: Box },
  { id: 'ECU_PINOUT', label: 'ECU Pinouts', shortLabel: 'Pinouts', icon: Cpu },
  { id: 'OSCILLOSCOPE', label: 'Oscilloscope', shortLabel: 'Scope', icon: Activity },
  { id: 'PCB_SCANNER', label: 'PCB Scanner', shortLabel: 'PCB', icon: ScanLine },
  { id: 'REPAIR_GUIDE', label: 'Repair Manuals', shortLabel: 'Manuals', icon: FileText },
  { id: 'KNOWLEDGE_CENTER', label: 'Knowledge Center', shortLabel: 'Knowledge', icon: BookOpen },
];

const FOCUS_STYLES =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19C8F5] focus-visible:ring-offset-1 focus-visible:ring-offset-[#060B14]';

function BrandAppIcon() {
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#19C8F5]/55 bg-[#050A12] shadow-[0_0_14px_rgba(25,200,245,0.22)]">
      {!failed && (
        <img
          src={APP_ICON_SRC}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
        />
      )}
      <RamtiVectorEmblem size={28} variant="flat-white" className="relative z-10" />
    </div>
  );
}

export const LabTopNav: React.FC<LabTopNavProps> = ({
  activeTab,
  onSelectTab,
  simulationSpeed,
  onChangeSimulationSpeed,
  circuitSolution,
  powerSupply,
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
  bilingualLang,
  onChangeBilingualLang,
  onOpenAcademyCurriculum,
  onOpenSubscriptionModal,
  onOpenAdminBillingModal,
  isAdminUnlocked,
  onOpenHelpDrawer,
}) => {
  const navigationRef = useRef<HTMLElement>(null);
  const activeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerId = useId();
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false);
  const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState(false);
  const [uiSfxEnabled, setUiSfxEnabledState] = useState<boolean>(() => isUiSoundEnabled());
  const {
    user: googleUser,
    syncStatus,
    retryCloudSync,
  } = useAuth();

  useEffect(() => {
    return subscribeUiSoundPreference(setUiSfxEnabledState);
  }, []);

  const handleCloseDrawer = useCallback((restoreFocus = true) => {
    playDrawerPneumaticSlide(false);
    setIsNavDrawerOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        drawerTriggerRef.current?.focus();
      });
    }
  }, []);

  useEffect(() => {
    const navigation = navigationRef.current;
    const activeButton = activeButtonRef.current;
    if (!navigation || !activeButton) return;

    const navigationBounds = navigation.getBoundingClientRect();
    const buttonBounds = activeButton.getBoundingClientRect();
    const padding = 8;

    const isClippedLeft = buttonBounds.left < navigationBounds.left + padding;
    const isClippedRight = buttonBounds.right > navigationBounds.right - padding;
    if (!isClippedLeft && !isClippedRight) return;

    const offset = isClippedLeft
      ? buttonBounds.left - navigationBounds.left - padding
      : buttonBounds.right - navigationBounds.right + padding;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    navigation.scrollTo({
      left: navigation.scrollLeft + offset,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [activeTab]);

  const dtcCount = circuitSolution.activeDTCs.length;
  const isPowerOn = Boolean(powerSupply?.isOutputEnabled);
  const busVolts = isPowerOn
    ? (circuitSolution.nodeVoltages['bench-vbat'] ?? powerSupply?.voltageSetting ?? 0)
    : 0;

  const { accessMode, remainingSeconds, openAccessModal } = useTrialAccess();
  const isTrialExpiring =
    accessMode === 'TRIAL_ACTIVE' && remainingSeconds !== null && remainingSeconds < 900;
  const accessBadgeText =
    accessMode === 'ADMIN'
      ? 'ADMIN'
      : accessMode === 'TRIAL_ACTIVE'
        ? formatTrialCountdown(remainingSeconds)
        : accessMode === 'TRIAL_EXPIRED'
          ? 'EXPIRED'
          : accessMode === 'TRIAL_REVOKED'
            ? 'REVOKED'
            : 'TRIAL PIN';
  const accessBadgeToneClass =
    accessMode === 'ADMIN'
      ? 'border-[#FFB020]/55 text-[#FFB020] hover:border-[#FFB020]'
      : accessMode === 'TRIAL_ACTIVE'
        ? isTrialExpiring
          ? 'border-[#FFB020]/70 text-[#FFB020] hover:border-[#FFB020]'
          : 'border-[#20D889]/55 text-[#20D889] hover:border-[#19C8F5]'
        : accessMode === 'TRIAL_EXPIRED' || accessMode === 'TRIAL_REVOKED'
          ? 'border-[#FF4D62]/70 text-[#FF4D62] hover:border-[#FF4D62]'
          : 'border-[#19C8F5]/45 text-[#19C8F5] hover:border-[#19C8F5]';

  return (
    <header className="hud-header relative z-40 w-full min-w-0 shrink-0 text-[#eaf3ff]">
      {/* Subtle Electric Cyan Top Edge Highlight + Animated Optical HUD Sweep */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#19c8f5]/60 to-transparent overflow-hidden"
      >
        <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/75 to-transparent animate-hud-laser-sweep" />
      </div>

      {/* Row 1: Single NavigationDrawer Toggle + Brand Lockup + Passive Live Bus Telemetry */}
      <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2 px-2 sm:px-4 py-1.5 lg:py-1.5">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
          <button
            ref={drawerTriggerRef}
            type="button"
            onClick={() => {
              setIsNavDrawerOpen((prev) => {
                playDrawerPneumaticSlide(!prev);
                return !prev;
              });
            }}
            aria-expanded={isNavDrawerOpen}
            aria-controls={drawerId}
            aria-label={isNavDrawerOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
            title={
              isNavDrawerOpen
                ? 'Close Navigation Drawer'
                : 'Open Diagnostic Tools, Workspace Views & Configuration Drawer'
            }
            className={`hw-btn relative inline-flex h-9 w-9 sm:h-10 sm:w-10 lg:h-9 lg:w-9 shrink-0 items-center justify-center rounded-lg text-[#19c8f5] hover:border-[#19c8f5]/65 hover:text-white cursor-pointer ${FOCUS_STYLES}`}
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
            {activeAudioAlertCount > 0 && (
              <span
                aria-label={`${activeAudioAlertCount} active audio alerts`}
                className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#ffb020] px-1 font-mono text-[9px] font-black text-slate-950 tabular-nums"
              >
                {activeAudioAlertCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              playCockpitTabDetent();
              onSelectTab('BENCH_LAB');
            }}
            className="flex min-w-0 items-center gap-1.5 sm:gap-2 text-left cursor-pointer"
          >
            <BrandAppIcon />
            <div className="min-w-0 leading-none">
              <div className="flex items-baseline gap-1 min-w-0">
                <span className="font-hud text-[10.5px] sm:text-[12px] font-extrabold tracking-[0.15em] text-[#19C8F5] shrink-0">
                  RAMTi
                </span>
                <span className="xs:hidden font-body text-[13.5px] font-bold italic tracking-tight brand-wordmark-silver shrink-0">
                  LAB
                </span>
                <span className="hidden xs:inline sm:hidden font-body text-[13.5px] font-bold italic tracking-tight brand-wordmark-silver truncate">
                  AutoElec
                </span>
                <span className="hidden sm:inline font-body text-[17px] lg:text-[19px] font-bold italic tracking-tight brand-wordmark-silver truncate">
                  AutoElectric Lab
                </span>
                <span className="font-body text-[13.5px] sm:text-[17px] lg:text-[19px] font-bold italic tracking-tight brand-wordmark-amber shrink-0">
                  PRO
                </span>
              </div>
              <p className="mt-0.5 hidden md:block font-body text-[9.5px] font-medium tracking-[0.1em] text-[#BCCDEF] truncate">
                {RAMTI_SUBTITLE_INLINE}
              </p>
            </div>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {/* Compact Mobile/Tablet Live Bus Status (Read-Only Telemetry) */}
          <div
            className={`flex lg:hidden h-9 sm:h-10 items-center rounded-lg border bg-[#0A1220]/90 divide-x divide-[#203653] font-mono text-[10px] sm:text-[10.5px] tabular-nums ${
              isPowerOn && dtcCount === 0
                ? 'border-[#20D889]/45 animate-bus-energized'
                : 'border-[#203653]'
            }`}
          >
            <div className="flex items-center gap-1.5 px-2 sm:px-2.5">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full shrink-0 ${
                  dtcCount > 0
                    ? 'bg-[#FFB020] shadow-[0_0_6px_rgba(255,176,32,0.75)]'
                    : isPowerOn
                      ? 'bg-[#20D889] shadow-[0_0_6px_rgba(32,216,137,0.75)]'
                      : 'bg-[#19C8F5]/75'
                }`}
              />
              <span
                className={
                  dtcCount > 0
                    ? 'font-bold text-[#FFB020]'
                    : isPowerOn
                      ? 'font-semibold text-[#20D889]'
                      : 'font-semibold text-[#91A4BD]'
                }
              >
                {dtcCount > 0 ? `${dtcCount} DTC` : isPowerOn ? `${busVolts.toFixed(1)}V` : 'OFF'}
              </span>
            </div>
            <div className="hidden sm:flex items-center px-2.5 text-[#91A4BD]">
              <strong
                className={
                  circuitSolution.isSupplyCurrentTripped ? 'text-[#FF4D62]' : 'text-[#EAF3FF]'
                }
              >
                {circuitSolution.supplyCurrentDrawAmps.toFixed(2)}A
              </strong>
            </div>
          </div>

          <button
            type="button"
            onClick={() => toggleUiSoundEnabled()}
            aria-pressed={uiSfxEnabled}
            aria-label={uiSfxEnabled ? 'Mute cockpit tactile sound effects' : 'Enable cockpit tactile sound effects'}
            title={uiSfxEnabled ? 'Cockpit Tactile Audio: ON (Click to mute)' : 'Cockpit Tactile Audio: MUTED (Click to enable)'}
            className={`hw-btn inline-flex h-9 w-9 sm:h-10 sm:w-10 lg:h-9 lg:w-9 shrink-0 items-center justify-center rounded-lg transition cursor-pointer ${
              uiSfxEnabled
                ? 'border-[#19C8F5]/50 text-[#19C8F5] hover:border-[#19C8F5]'
                : 'border-[#203653] text-[#6F849F] hover:text-[#EAF3FF]'
            } ${FOCUS_STYLES}`}
          >
            {uiSfxEnabled ? <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> : <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>

          <button
            type="button"
            onClick={() => {
              playCockpitTabDetent();
              openAccessModal();
            }}
            aria-label={`Access status: ${accessBadgeText}. Open Trial PIN console`}
            title="Enter 8-digit Trial PIN or open Admin Trial Generator"
            className={`flex lg:hidden h-9 sm:h-10 items-center gap-1 rounded-lg border bg-[#0A1220]/95 px-2 sm:px-2.5 font-mono text-[10px] sm:text-[10.5px] font-bold tabular-nums transition cursor-pointer ${accessBadgeToneClass} ${FOCUS_STYLES}`}
          >
            <span>
              {accessMode === 'TRIAL_EXPIRED' || accessMode === 'TRIAL_REVOKED'
                ? '✖'
                : accessMode === 'TRIAL_ACTIVE' || accessMode === 'ADMIN'
                  ? '●'
                  : 'PIN'}
            </span>
            {(accessMode !== 'UNLICENSED') && <span>{accessBadgeText}</span>}
          </button>

          {/* Full Desktop Live MNA Bus & Sync Status (Read-Only Telemetry) */}
          <div className="hidden lg:flex h-9 items-center rounded-lg border border-[#203653] bg-[#0A1220]/90 divide-x divide-[#203653] font-mono text-[11px] tabular-nums">
            <div className="flex items-center gap-2 px-3">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full shrink-0 ${
                  dtcCount > 0
                    ? 'bg-[#FFB020] shadow-[0_0_8px_rgba(255,176,32,0.75)]'
                    : isPowerOn
                      ? 'bg-[#20D889] shadow-[0_0_8px_rgba(32,216,137,0.75)]'
                      : 'bg-[#19C8F5]/75'
                }`}
              />
              <span
                className={
                  dtcCount > 0
                    ? 'font-bold text-[#FFB020]'
                    : isPowerOn
                      ? 'font-semibold text-[#20D889]'
                      : 'font-semibold text-[#91A4BD]'
                }
              >
                {dtcCount > 0 ? `${dtcCount} DTC` : isPowerOn ? 'NOMINAL' : 'STANDBY'}
              </span>
            </div>
            <div className="px-3 text-[#91A4BD]">
              PSU{' '}
              <strong className={isPowerOn ? 'text-[#19C8F5]' : 'text-[#91A4BD]'}>
                {isPowerOn ? `${busVolts.toFixed(1)}V` : 'OFF'}
              </strong>
            </div>
            <div className="px-3 text-[#91A4BD]">
              DRAW{' '}
              <strong
                className={
                  circuitSolution.isSupplyCurrentTripped ? 'text-[#FF4D62]' : 'text-[#EAF3FF]'
                }
              >
                {circuitSolution.supplyCurrentDrawAmps.toFixed(2)}A
              </strong>
            </div>
            <div className="flex h-full items-center gap-1.5 px-3 text-[10.5px]">
              {googleUser ? (
                <button
                  type="button"
                  onClick={() => void retryCloudSync()}
                  title={
                    syncStatus.pendingCount > 0
                      ? `${syncStatus.pendingCount} queued offline writes. Click to sync now.`
                      : `Synced to Firestore as ${googleUser.email || googleUser.uid}`
                  }
                  className="inline-flex items-center gap-1.5 cursor-pointer hover:text-white transition"
                >
                  {syncStatus.state === 'SYNCING' ? (
                    <RefreshCw className="h-3 w-3 animate-spin text-[#19C8F5]" aria-hidden="true" />
                  ) : (
                    <Cloud
                      className={`h-3 w-3 ${
                        syncStatus.pendingCount > 0 ? 'text-[#FFB020]' : 'text-[#20D889]'
                      }`}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={`font-semibold ${
                      syncStatus.pendingCount > 0 ? 'text-[#FFB020]' : 'text-[#20D889]'
                    }`}
                  >
                    {syncStatus.pendingCount > 0
                      ? `Sync (${syncStatus.pendingCount})`
                      : 'Cloud Sync'}
                  </span>
                </button>
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full shrink-0 bg-[#20D889]"
                  />
                  <span className="font-semibold text-[#20D889]">Local Bench</span>
                </>
              )}
            </div>
          </div>

          {/* Google Sign-In / Sign-Out intentionally lives inside NavigationDrawer so Row 1 remains crisp and non-overlapping on mobile viewports. */}

          <button
            type="button"
            onClick={() => openAccessModal()}
            aria-label={`Access status: ${accessBadgeText}. Open Trial PIN console`}
            title="Enter 8-digit Trial PIN or open Admin Trial Generator"
            className={`hidden lg:flex h-9 items-center gap-1.5 rounded-lg border bg-[#0A1220]/95 px-3 font-mono text-[11px] font-bold tabular-nums transition cursor-pointer ${accessBadgeToneClass} ${FOCUS_STYLES}`}
          >
            <span>
              {accessMode === 'TRIAL_EXPIRED' || accessMode === 'TRIAL_REVOKED'
                ? '✖'
                : accessMode === 'UNLICENSED'
                  ? '🔑'
                  : '●'}
            </span>
            <span>
              {accessMode === 'TRIAL_ACTIVE' ? `TRIAL ${accessBadgeText}` : accessBadgeText}
            </span>
          </button>
        </div>
      </div>

      {/* Row 2: High-Level Workspace Tab Navigation — Aligned 8-Column Single Ribbon on lg+ */}
      <div className="flex min-w-0 items-stretch border-t border-[#203653] bg-[#0A1220]/74 px-2 sm:px-3.5 lg:px-4 py-1.5 lg:py-1">
        <nav
          ref={navigationRef}
          aria-label="AutoElectric Lab Pro sections"
          className="flex min-w-0 flex-1 items-stretch gap-1.5 overflow-x-auto scrollbar-none overscroll-x-contain lg:grid lg:grid-cols-8 lg:overflow-visible"
        >
          {NAV_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                ref={isActive ? activeButtonRef : undefined}
                type="button"
                onClick={() => {
                  if (!isActive) playCockpitTabDetent();
                  onSelectTab(tab.id);
                }}
                aria-current={isActive ? 'page' : undefined}
                className={[
                  'relative inline-flex min-h-[40px] lg:min-h-[34px] shrink-0 min-w-[82px] sm:min-w-[112px] lg:min-w-0 items-center justify-center gap-1.5 xl:gap-2 whitespace-nowrap',
                  'rounded-lg border px-2.5 sm:px-3 lg:px-1.5 xl:px-2.5 py-1.5 lg:py-1 text-[12px] lg:text-[11px] xl:text-[12px] font-semibold cursor-pointer',
                  'transition-all motion-reduce:transition-none active:scale-[0.985]',
                  FOCUS_STYLES,
                  isActive ? 'diag-tab-active' : 'diag-tab-idle',
                ].join(' ')}
              >
                <Icon
                  aria-hidden="true"
                  className={`h-4 w-4 lg:h-3.5 lg:w-3.5 shrink-0 ${isActive ? 'text-white' : 'text-[#19c8f5]/80'}`}
                  strokeWidth={1.9}
                />
                <span className="sm:hidden lg:inline xl:hidden truncate">{tab.shortLabel}</span>
                <span className="hidden sm:inline lg:hidden xl:inline truncate">{tab.label}</span>
                {isActive && (
                  <motion.span
                    layoutId="labTopNavActiveLaser"
                    aria-hidden="true"
                    transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                    className="absolute inset-x-2.5 bottom-0 h-[2px] rounded-full bg-[#19c8f5] shadow-[0_0_8px_rgba(25,200,245,0.85)]"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Left-Sliding Framer Motion NavigationDrawer (Desktop & Mobile) */}
      <NavigationDrawer
        isOpen={isNavDrawerOpen}
        onClose={handleCloseDrawer}
        drawerId={drawerId}
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        navTabs={NAV_TABS}
        simulationSpeed={simulationSpeed}
        onChangeSimulationSpeed={onChangeSimulationSpeed}
        isSignedIn={isSignedIn}
        onOpenCloudModal={onOpenCloudModal}
        onOpenDocsModal={onOpenDocsModal}
        onOpenWorkspaceModal={onOpenWorkspaceModal}
        onOpenOfflineBot={onOpenOfflineBot}
        onOpenGroundedSearch={onOpenGroundedSearch}
        onOpenIntroModal={onOpenIntroModal}
        onResetLab={onResetLab}
        onOpenLicenseModal={onOpenLicenseModal}
        onOpenPhysicalFaultModal={onOpenPhysicalFaultModal}
        onToggleAudioAlertsPanel={onToggleAudioAlertsPanel}
        activeAudioAlertCount={activeAudioAlertCount}
        onOpenGeminiStudio={onOpenGeminiStudio}
        pwa={pwa}
        onOpenPwaGuideModal={onOpenPwaGuideModal}
        onOpenVoiceMacroLibrary={onOpenVoiceMacroLibrary}
        onOpenLookupDrawer={onOpenLookupDrawer}
        isLookupDrawerOpen={isLookupDrawerOpen}
        onOpenBatchPinTest={onOpenBatchPinTest}
        batchSelectedPinCount={batchSelectedPinCount}
        onOpenCredentials={() => setIsCredentialsModalOpen(true)}
        bilingualLang={bilingualLang}
        onChangeBilingualLang={onChangeBilingualLang}
        onOpenAcademyCurriculum={onOpenAcademyCurriculum}
        onOpenSubscriptionModal={onOpenSubscriptionModal}
        onOpenAdminBillingModal={onOpenAdminBillingModal}
        isAdminUnlocked={isAdminUnlocked}
        onOpenHelpDrawer={onOpenHelpDrawer}
      />

      {/* Official Credentials & Governance Modal */}
      <CredentialsModal
        isOpen={isCredentialsModalOpen}
        onClose={() => setIsCredentialsModalOpen(false)}
        onOpenLicenseModal={onOpenLicenseModal}
        onOpenWalkthroughModal={onOpenIntroModal}
      />
    </header>
  );
};
