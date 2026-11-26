/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lazyWithRetry } from './utils/lazyWithRetry';
import {
  DEFAULT_ECU_PINS,
  DEFAULT_BENCH_COMPONENTS,
  DEFAULT_WIRES,
  solveCircuit,
} from './utils/circuitSolver';
import {
  EcuPin,
  BenchComponent,
  WireConnection,
  InjectedFault,
  FaultType,
  MultimeterState,
  PowerSupplyState,
} from './types/ecu';
import { LabTopNav, LabTab, MobileBenchPane, RackFilter } from './components/LabTopNav';
import { LabWorkspaceLayout } from './components/LabWorkspaceLayout';
import { LabStatusFooter } from './components/LabStatusFooter';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { VoiceMacroLibrary } from './components/VoiceMacroLibrary';
import { IntroductionPinLandingPage } from './components/IntroductionPinLandingPage';
import { WelcomeBenchOverlay } from './components/WelcomeBenchOverlay';
import { getOrCreateWorkstationDeviceId } from './services/licenseClientService';
import { APP_LOGO_SRC } from './constants/branding';
import { recordRenderCycle } from './utils/perfMonitor';
import {
  LOCAL_WORKSTATION_UID,
  SavedBenchSession,
  SavedDiagnosticLog,
  countLocalWorkstationFaultSequences,
  deleteFaultSequence,
  flushQueuedBenchSync,
  promoteLocalWorkstationFaultSequencesToUser,
  saveFaultSequence,
  saveUserBenchPreferences,
  subscribeBenchSessions,
  subscribeDiagnosticLogs,
  subscribeFaultSequenceConflicts,
  subscribeFaultSequences,
  subscribeUserBenchPreferences,
  updateBenchSessionWires,
} from './services/benchStorageService';
import type { CustomFaultSequence } from './simulation/faults/faultSequenceService';
import { renameWireInList } from './utils/wireLabelUtils';
import { useAuth } from './context/AuthContext';
import { useTrialAccess } from './context/TrialAccessContext';
import {
  RpmEmulatorState,
  UNIVERSAL_BRAND_KEY,
  applyEcuProfileToPins,
  getEcuProfileById,
  getSelectedVehicleContext,
} from './utils/vehicleEcuRegistry';
import { evaluateVehicleBenchSafety } from './utils/automotiveSafetyGuard';
import {
  playLogicAlertBeep,
  stopRpmEmulatorAudio,
  updateRpmEmulatorAudio,
} from './utils/audioFeedback';
import {
  applyWatchPresetToRules,
  buildDefaultLogicCheckRules,
  evaluateLogicCheck,
  loadLogicCheckArmed,
  loadSavedLogicCheckRules,
  mergeLogicCheckRules,
  saveLogicCheckArmed,
  saveLogicCheckRules,
  type LogicCheckRule,
  type LogicCheckRuleOverride,
  type LogicWatchPreset,
} from './simulation/ecu/LogicCheckEngine';
import { LogicCheckAlertBanner } from './components/LogicCheckAlertBanner';
import type { LogicCheckIncidentEntry } from './components/LogicCheckPanel';
import { evaluateCircuitAnomalies } from './simulation/diagnostics/circuitAudioMonitor';
import { CircuitAudioAlertBar } from './components/CircuitAudioAlertBar';
import {
  DEFAULT_GAUGE_MONITOR_STATE,
  forceSafeStoppedGaugeState,
  GaugeMonitorState,
} from './simulation/telemetry/telemetryTypes';
import { useBenchContext } from './hooks/useBenchContext';
import {
  UnifiedAiAssistantDrawer,
  loadPersistedBilingualLang,
  type UnifiedAiSubTab,
} from './components/ai/UnifiedAiAssistantDrawer';
import { FloatingVoiceKnowledgeFab } from './components/ai/FloatingVoiceKnowledgeFab';
import { FloatingHelpDrawer } from './components/help/FloatingHelpDrawer';
import { CurriculumSelectorDrawer } from './components/academy/CurriculumSelectorDrawer';
import { InstructorVerifierView } from './components/academy/InstructorVerifierView';
import { SubscriptionPricingModal } from './components/billing/SubscriptionPricingModal';
import { AdminPinManagerModal } from './components/billing/AdminPinManagerModal';
import type { LabModule } from './data/academy/universityCurriculum';
import type { BilingualLang } from './types/aiAssistant';
import type { BenchVoiceSimulationAction } from './simulation/telemetry/efiHarnessStandard';

const IntroductionModal = lazyWithRetry(() =>
  import('./components/IntroductionModal').then((m) => ({ default: m.IntroductionModal }))
);
const GroundedSearchModal = lazyWithRetry(() =>
  import('./components/GroundedSearchModal').then((m) => ({ default: m.GroundedSearchModal }))
);
const BenchCloudModal = lazyWithRetry(() =>
  import('./components/BenchCloudModal').then((m) => ({ default: m.BenchCloudModal }))
);
const OfflineAssistantModal = lazyWithRetry(() =>
  import('./components/OfflineAssistantModal').then((m) => ({ default: m.OfflineAssistantModal }))
);
const GoogleDocsModal = lazyWithRetry(() =>
  import('./components/GoogleDocsModal').then((m) => ({ default: m.GoogleDocsModal }))
);
const GoogleWorkspaceModal = lazyWithRetry(() =>
  import('./components/GoogleWorkspaceModal').then((m) => ({ default: m.GoogleWorkspaceModal }))
);
const AdminLicenseModal = lazyWithRetry(() =>
  import('./components/AdminLicenseModal').then((m) => ({ default: m.AdminLicenseModal }))
);
const PhysicalMeasurementFaultPanel = lazyWithRetry(() =>
  import('./components/PhysicalMeasurementFaultPanel').then((m) => ({
    default: m.PhysicalMeasurementFaultPanel,
  }))
);
const PWAInstallGuideModal = lazyWithRetry(() =>
  import('./components/PWAInstallGuideModal').then((m) => ({
    default: m.PWAInstallGuideModal,
  }))
);
const GeminiDiagnosticStudioModal = lazyWithRetry(() =>
  import('./components/GeminiDiagnosticStudioModal').then((m) => ({
    default: m.GeminiDiagnosticStudioModal,
  }))
);
const BatchPinDiagnosticModal = lazyWithRetry(() =>
  import('./components/BatchPinDiagnosticModal').then((m) => ({
    default: m.BatchPinDiagnosticModal,
  }))
);
import { usePWA } from './hooks/usePWA';
import { PWAUpdateBanner } from './components/PWAUpdateBanner';
import type { DriveBenchSnapshot } from './services/googleDriveService';
import type { WorkspaceTab } from './components/GoogleWorkspaceModal';
import { offlineVoiceAssistant } from './services/offlineVoiceService';
import { voiceMacroService, type VoiceMacro } from './services/voiceMacroService';
import {
  DIAGNOSTIC_WORKFLOW_STEPS,
  DiagnosticPanelMode,
  canEnergizeWithPreBenchGate,
  loadCheckedWorkflowIds,
  loadWorkflowPreferences,
  saveCheckedWorkflowIds,
  saveWorkflowPreferences,
  shouldSeedInitialCloudPreferences,
} from './utils/diagnosticWorkflow';
import { formatCloudSyncError } from './utils/cloudSyncErrorUtils';


interface AuthorizedBenchLabWorkspaceProps {
  initialShowWelcomeOverlay?: boolean;
  onConsumeWelcomeOverlay?: () => void;
}

function AuthorizedBenchLabWorkspace({
  initialShowWelcomeOverlay = false,
  onConsumeWelcomeOverlay,
}: AuthorizedBenchLabWorkspaceProps) {
  // Introduction View Modal (opened on demand via Tools > Slide Walkthrough)
  const [showIntroModal, setShowIntroModal] = useState(false);
  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState(initialShowWelcomeOverlay);

  useEffect(() => {
    if (initialShowWelcomeOverlay) {
      setShowWelcomeOverlay(true);
    }
  }, [initialShowWelcomeOverlay]);

  // Saved Bench & Diagnostic Logs Modal
  const [showCloudModal, setShowCloudModal] = useState(false);

  // Local Diagnostic Report Studio Modal
  const [showDocsModal, setShowDocsModal] = useState(false);

  // Local Bench Export Hub Modal
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [workspaceInitialTab, setWorkspaceInitialTab] = useState<WorkspaceTab>('DRIVE');

  // Firebase Google Auth & Firestore Cloud Sync State
  const { user, syncStatus, retryCloudSync } = useAuth();
  const activeStorageUid = user?.uid || LOCAL_WORKSTATION_UID;

  // Unified Trial PIN, Access Control & Admin Console Modal State
  const {
    accessMode,
    canUseAi,
    canUseExports,
    isAdminUnlocked,
    isModalOpen: showLicenseModal,
    openAccessModal,
    closeAccessModal,
  } = useTrialAccess();
  const setShowLicenseModal = useCallback(
    (open: boolean) => {
      if (open) {
        openAccessModal();
      } else {
        closeAccessModal();
      }
    },
    [closeAccessModal, openAccessModal]
  );

  // Physical Bench Measurement & Evidence-Ranked Fault Isolation Modal
  const [showPhysicalFaultModal, setShowPhysicalFaultModal] = useState(false);

  // PWA Installation & Offline Workstation Guide Modal
  const [showPwaGuideModal, setShowPwaGuideModal] = useState(false);
  const [showAudioAlertsSetup, setShowAudioAlertsSetup] = useState(false);
  const [showVoiceMacroLibrary, setShowVoiceMacroLibrary] = useState(false);
  const [showLookupDrawer, setShowLookupDrawer] = useState(false);
  const [manualRangeLabel, setManualRangeLabel] = useState<string | null>(null);
  const [showGeminiStudio, setShowGeminiStudio] = useState(false);
  const [geminiStudioInitialTab, setGeminiStudioInitialTab] = useState<
    'CHAT' | 'AUDIO_TRANSCRIBE' | 'MAPS_GROUNDING' | 'VIDEO_ANIMATE' | 'IMAGE_STUDIO' | 'LIVE_VOICE'
  >('CHAT');
  const [isCoverBgFailed, setIsCoverBgFailed] = useState(false);
  const [showBatchPinModal, setShowBatchPinModal] = useState(false);
  const [batchPinAutoRunNonce, setBatchPinAutoRunNonce] = useState(0);
  const [batchSelectedPinIds, setBatchSelectedPinIds] = useState<string[]>(() =>
    DEFAULT_ECU_PINS.map((p) => p.id)
  );
  const pwa = usePWA();

  const handleOpenBatchPinTest = useCallback(() => {
    setBatchPinAutoRunNonce((n) => n + 1);
    setShowBatchPinModal(true);
  }, []);

  const handleOpenWorkspaceModal = useCallback(
    (tab: WorkspaceTab) => {
      if (!canUseExports) {
        openAccessModal({
          tab: 'TRIAL_PIN',
          notice:
            accessMode === 'TRIAL_EXPIRED' || accessMode === 'TRIAL_REVOKED'
              ? 'Trial expired — Local Bench Exports are locked. Enter an active 8-digit Trial PIN or Master Admin PIN.'
              : 'Enter an active 8-digit Trial PIN or Master Admin PIN to open Local Bench Exports.',
        });
        return;
      }
      setWorkspaceInitialTab(tab);
      setShowWorkspaceModal(true);
    },
    [accessMode, canUseExports, openAccessModal]
  );

  const handleOpenDocsGated = useCallback(() => {
    if (!canUseExports) {
      openAccessModal({
        tab: 'TRIAL_PIN',
        notice:
          accessMode === 'TRIAL_EXPIRED' || accessMode === 'TRIAL_REVOKED'
            ? 'Trial expired — Diagnostic Report exports are locked. Enter a new 8-digit Trial PIN to continue.'
            : 'Enter an active 8-digit Trial PIN or Master Admin PIN to export diagnostic reports.',
      });
      return;
    }
    setShowDocsModal(true);
  }, [accessMode, canUseExports, openAccessModal]);

  const handleOpenGeminiStudioGated = useCallback(() => {
    if (!canUseAi) {
      openAccessModal({
        tab: 'TRIAL_PIN',
        notice:
          accessMode === 'TRIAL_EXPIRED' || accessMode === 'TRIAL_REVOKED'
            ? 'Your 3–6 hour trial PIN expired — AI Diagnostic Studio is locked. Enter a new 8-digit Trial PIN.'
            : 'Enter an active 8-digit Trial PIN or Master Admin PIN to use AI Diagnostic Studio.',
      });
      return;
    }
    setShowGeminiStudio(true);
  }, [accessMode, canUseAi, openAccessModal]);

  // 100% Offline MiniSearch Diagnostic Chatbot Modal (lazy-initialized on first open)
  const [showOfflineBot, setShowOfflineBot] = useState(false);
  const [hasOpenedOfflineBot, setHasOpenedOfflineBot] = useState(false);
  const [offlineBotPrompt, setOfflineBotPrompt] = useState<string | null>(null);
  const [showDiagnosticGuide, setShowDiagnosticGuide] = useState(true);
  const [diagnosticPanelMode, setDiagnosticPanelMode] = useState<DiagnosticPanelMode>('WORKFLOW');
  const [checkedWorkflowIds, setCheckedWorkflowIds] = useState<string[]>(() =>
    loadCheckedWorkflowIds()
  );
  const [workflowPrefs, setWorkflowPrefs] = useState(() => loadWorkflowPreferences());
  const [preBenchGateBypassed, setPreBenchGateBypassed] = useState(false);
  const [voiceMacros, setVoiceMacros] = useState<VoiceMacro[]>(() =>
    voiceMacroService.getMacros()
  );
  const [isVoiceLogOpen, setIsVoiceLogOpen] = useState(false);
  const [voiceLogCount, setVoiceLogCount] = useState(
    () => offlineVoiceAssistant.getCommandHistory().length
  );
  const [savedLogs, setSavedLogs] = useState<SavedDiagnosticLog[]>([]);
  const [savedSessions, setSavedSessions] = useState<SavedBenchSession[]>([]);
  const [savedFaultSequences, setSavedFaultSequences] = useState<CustomFaultSequence[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [cloudPrefsHydrated, setCloudPrefsHydrated] = useState(false);
  const applyingRemotePrefsRef = useRef(false);
  const lastCloudPrefsSigRef = useRef('');

  // Automated Multi-Pin Logic Check State
  const [logicRuleOverrides, setLogicRuleOverrides] = useState<LogicCheckRuleOverride[]>(() =>
    loadSavedLogicCheckRules()
  );
  const [isLogicCheckArmed, setIsLogicCheckArmed] = useState<boolean>(() =>
    loadLogicCheckArmed()
  );
  const [logicCheckIncidents, setLogicCheckIncidents] = useState<LogicCheckIncidentEntry[]>([]);
  const [dismissedLogicAlertSig, setDismissedLogicAlertSig] = useState<string>('');
  const lastLogicAlertSigRef = useRef<string>('');

  useEffect(() => {
    saveCheckedWorkflowIds(checkedWorkflowIds);
  }, [checkedWorkflowIds]);

  useEffect(() => {
    saveWorkflowPreferences(workflowPrefs);
  }, [workflowPrefs]);

  useEffect(() => {
    return voiceMacroService.subscribeMacros((nextMacros) => {
      setVoiceMacros(nextMacros);
    });
  }, []);

  useEffect(() => {
    return offlineVoiceAssistant.subscribeHistory((entries) => {
      setVoiceLogCount(entries.length);
    });
  }, []);

  const handleOpenOfflineBot = useCallback((prompt?: string) => {
    setHasOpenedOfflineBot(true);
    setOfflineBotPrompt(prompt || null);
    setShowOfflineBot(true);
  }, []);

  const [cloudSyncNotice, setCloudSyncNotice] = useState<string | null>(null);

  const reportCloudSyncError = useCallback(
    (context: string, err: unknown) => {
      const msg = formatCloudSyncError(err, { isPinOnlyLocalMode: !user });
      if (!msg) {
        console.debug(
          `[WorkbenchSync] ${context}: suppressed offline/local-only error; local IndexedDB remains active.`
        );
        return;
      }
      console.warn(`[WorkbenchSync] ${context}: ${msg}`);
      setCloudSyncNotice(`${context}: ${msg}`);
    },
    [user]
  );

  useEffect(() => {
    const unsubLogs = subscribeDiagnosticLogs(
      activeStorageUid,
      (logs) => setSavedLogs(logs),
      (err) => reportCloudSyncError('Diagnostic logs sync', err)
    );
    const unsubSessions = subscribeBenchSessions(
      activeStorageUid,
      (sessions) => setSavedSessions(sessions),
      (err) => reportCloudSyncError('Bench sessions sync', err)
    );
    const unsubFaultSequences = subscribeFaultSequences(
      activeStorageUid,
      (seqs) => setSavedFaultSequences(seqs),
      (err) => reportCloudSyncError('Fault sequences sync', err)
    );
    const unsubPrefs = subscribeUserBenchPreferences(
      activeStorageUid,
      (remotePrefs) => {
        if (!remotePrefs) {
          lastCloudPrefsSigRef.current = '';
          setCloudPrefsHydrated(true);
          return;
        }
        applyingRemotePrefsRef.current = true;
        const validIds = new Set(DIAGNOSTIC_WORKFLOW_STEPS.map((s) => s.id));
        const remoteChecked = Array.isArray(remotePrefs.workflowCheckedIds)
          ? remotePrefs.workflowCheckedIds.filter((id) => validIds.has(id))
          : [];
        const syncedMacros = Array.isArray(remotePrefs.voiceMacros)
          ? voiceMacroService.syncFromCloud(remotePrefs.voiceMacros, 'merge')
          : voiceMacroService.getMacros();

        lastCloudPrefsSigRef.current = JSON.stringify({
          checked: remoteChecked,
          gate: Boolean(remotePrefs.preBenchGateLocked),
          auto: Boolean(remotePrefs.autoVerifyWorkflow),
          macros: syncedMacros.map((m) => `${m.id}:${m.updatedAt}`),
        });

        setCheckedWorkflowIds(remoteChecked);
        setWorkflowPrefs({
          preBenchGateLocked: Boolean(remotePrefs.preBenchGateLocked),
          autoVerifyWorkflow: Boolean(remotePrefs.autoVerifyWorkflow),
        });
        setCloudPrefsHydrated(true);
        window.setTimeout(() => {
          applyingRemotePrefsRef.current = false;
        }, 50);
      },
      (err) => {
        // Never leave local preference auto-save blocked if a listener reports an error
        setCloudPrefsHydrated(true);
        reportCloudSyncError('Local bench preferences', err);
      }
    );

    return () => {
      unsubLogs();
      unsubSessions();
      unsubFaultSequences();
      unsubPrefs();
    };
  }, [activeStorageUid, reportCloudSyncError]);

  const handleSaveFaultSequence = useCallback(
    async (sequence: CustomFaultSequence): Promise<CustomFaultSequence> => {
      try {
        const result = await saveFaultSequence(activeStorageUid, sequence);
        return result.sequence;
      } catch (err) {
        reportCloudSyncError('Fault sequence save', err);
        throw err;
      }
    },
    [activeStorageUid, reportCloudSyncError]
  );

  const handleDeleteFaultSequence = useCallback(
    async (sequenceId: string): Promise<void> => {
      try {
        await deleteFaultSequence(activeStorageUid, sequenceId);
      } catch (err) {
        reportCloudSyncError('Fault sequence delete', err);
        throw err;
      }
    },
    [activeStorageUid, reportCloudSyncError]
  );

  const [localWorkstationSequenceCount, setLocalWorkstationSequenceCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) {
      setLocalWorkstationSequenceCount(0);
      return;
    }
    let cancelled = false;
    void countLocalWorkstationFaultSequences().then((count) => {
      if (!cancelled) setLocalWorkstationSequenceCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, savedFaultSequences]);

  useEffect(() => {
    return subscribeFaultSequenceConflicts((conflict) => {
      setCloudSyncNotice(
        `Offline edit conflict preserved: saved "${conflict.conflictTitle}" alongside newer cloud revision of "${conflict.originalTitle}".`
      );
    });
  }, []);

  const handlePromoteLocalFaultSequences = useCallback(async (): Promise<number> => {
    if (!user?.uid) return 0;
    const promoted = await promoteLocalWorkstationFaultSequencesToUser(user.uid);
    const remaining = await countLocalWorkstationFaultSequences();
    setLocalWorkstationSequenceCount(remaining);
    if (promoted > 0) {
      void flushQueuedBenchSync(user.uid).catch(() => {});
    }
    return promoted;
  }, [user?.uid]);

  useEffect(() => {
    if (!cloudPrefsHydrated || applyingRemotePrefsRef.current) {
      return;
    }

    const sig = JSON.stringify({
      checked: checkedWorkflowIds,
      gate: workflowPrefs.preBenchGateLocked,
      auto: workflowPrefs.autoVerifyWorkflow,
      macros: voiceMacros.map((m) => `${m.id}:${m.updatedAt}`),
    });

    if (sig === lastCloudPrefsSigRef.current) {
      return;
    }

    if (
      lastCloudPrefsSigRef.current === '' &&
      !shouldSeedInitialCloudPreferences({
        checkedWorkflowIds,
        preBenchGateLocked: workflowPrefs.preBenchGateLocked,
        autoVerifyWorkflow: workflowPrefs.autoVerifyWorkflow,
        hasCustomVoiceMacros: voiceMacros.some((m) => !m.isPreset),
      })
    ) {
      lastCloudPrefsSigRef.current = sig;
      return;
    }

    const timer = window.setTimeout(() => {
      lastCloudPrefsSigRef.current = sig;
      saveUserBenchPreferences(activeStorageUid, {
        workflowCheckedIds: checkedWorkflowIds,
        preBenchGateLocked: workflowPrefs.preBenchGateLocked,
        autoVerifyWorkflow: workflowPrefs.autoVerifyWorkflow,
        voiceMacros,
      }).catch((err) => {
        reportCloudSyncError('Bench preferences save', err);
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [activeStorageUid, cloudPrefsHydrated, checkedWorkflowIds, workflowPrefs, voiceMacros, reportCloudSyncError]);

  // Live Google Search Grounding Modal State
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [groundedSearchQuery, setGroundedSearchQuery] = useState('');
  const [groundedSearchDtc, setGroundedSearchDtc] = useState('');
  const [groundedSearchEcu, setGroundedSearchEcu] = useState('');

  const handleOpenGroundedSearch = useCallback((query?: string, dtc?: string, ecu?: string) => {
    setGroundedSearchQuery(query || '');
    setGroundedSearchDtc(dtc || '');
    setGroundedSearchEcu(ecu || '');
    setShowSearchModal(true);
  }, []);

  // Navigation & Layout State
  const [activeTab, setActiveTab] = useState<LabTab>('BENCH_LAB');
  const [rackFilter, setRackFilter] = useState<RackFilter>('ALL');
  const [mobileBenchPane, setMobileBenchPane] = useState<MobileBenchPane>('INSTRUMENTS');
  const [simulationSpeed, setSimulationSpeed] = useState<number>(1.0);
  const [twinSyncMode, setTwinSyncMode] = useState<'LIVE_DATA' | 'MANUAL_REVIEW'>('LIVE_DATA');
  const handleToggleTwinSyncMode = useCallback(() => {
    setTwinSyncMode((prev) => (prev === 'LIVE_DATA' ? 'MANUAL_REVIEW' : 'LIVE_DATA'));
  }, []);

  // Selected Vehicle Car / Model / ECU Profile & Automotive Safety Gate State
  const [selectedBrandKey, setSelectedBrandKey] = useState<string>(UNIVERSAL_BRAND_KEY);
  const [selectedModelName, setSelectedModelName] = useState<string>('Generic 16-Pin Bench');
  const [selectedEcuProfileId, setSelectedEcuProfileId] = useState<string | null>(null);
  const [confirmedOcrVehicleKey, setConfirmedOcrVehicleKey] = useState<string | null>(null);

  const activeVehicleSafetyKey = `${selectedBrandKey}::${selectedModelName}::${selectedEcuProfileId || ''}`;
  const selectedVehicleCtx = useMemo(
    () => getSelectedVehicleContext(selectedBrandKey, selectedModelName, selectedEcuProfileId),
    [selectedBrandKey, selectedModelName, selectedEcuProfileId]
  );
  const pinoutSafetyEvaluation = useMemo(
    () =>
      evaluateVehicleBenchSafety({
        brandKey: selectedBrandKey,
        modelName: selectedModelName,
        ecuProfileId: selectedEcuProfileId,
        ecuStatus: selectedVehicleCtx.status,
        hasVerifiedPinoutMap: selectedVehicleCtx.hasVerifiedPinoutMap,
        controllerNote: selectedVehicleCtx.controllerNote,
        orientationConfirmed: confirmedOcrVehicleKey === activeVehicleSafetyKey,
      }),
    [
      selectedBrandKey,
      selectedModelName,
      selectedEcuProfileId,
      selectedVehicleCtx.status,
      selectedVehicleCtx.hasVerifiedPinoutMap,
      selectedVehicleCtx.controllerNote,
      confirmedOcrVehicleKey,
      activeVehicleSafetyKey,
    ]
  );

  // Core Bench State (Safety default: PSU Output OFF on boot until technician completes or confirms pre-bench checks)
  const [powerSupply, setPowerSupply] = useState<PowerSupplyState>({
    voltageSetting: 12.6,
    currentLimit: 5.0,
    isOutputEnabled: false,
    preset: '12V_BENCH',
  });

  const handlePowerSupplyChange: React.Dispatch<React.SetStateAction<PowerSupplyState>> = useCallback(
    (updater) => {
      setPowerSupply((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (next.isOutputEnabled) {
          const canEnergizeVirtual =
            pinoutSafetyEvaluation.canEnergizeSimulatedBench ??
            pinoutSafetyEvaluation.canEnergizePhysicalBench;
          if (!canEnergizeVirtual) {
            return { ...next, isOutputEnabled: false };
          }
          const gate = canEnergizeWithPreBenchGate({
            preBenchGateLocked: workflowPrefs.preBenchGateLocked,
            preBenchGateBypassed,
            checkedWorkflowIds,
          });
          if (!gate.allowed) {
            return { ...next, isOutputEnabled: false };
          }
        }
        return next;
      });
    },
    [
      pinoutSafetyEvaluation.canEnergizeSimulatedBench,
      pinoutSafetyEvaluation.canEnergizePhysicalBench,
      workflowPrefs.preBenchGateLocked,
      preBenchGateBypassed,
      checkedWorkflowIds,
    ]
  );

  const handleTogglePreBenchGate = useCallback(() => {
    setWorkflowPrefs((prev) => {
      const nextLocked = !prev.preBenchGateLocked;
      if (nextLocked) {
        setPreBenchGateBypassed(false);
        const gate = canEnergizeWithPreBenchGate({
          preBenchGateLocked: true,
          preBenchGateBypassed: false,
          checkedWorkflowIds,
        });
        if (!gate.allowed) {
          setPowerSupply((psu) => ({ ...psu, isOutputEnabled: false }));
        }
      } else {
        setPreBenchGateBypassed(false);
      }
      return { ...prev, preBenchGateLocked: nextLocked };
    });
  }, [checkedWorkflowIds]);

  const handleBypassPreBenchGate = useCallback(() => {
    setPreBenchGateBypassed(true);
    const canEnergizeVirtual =
      pinoutSafetyEvaluation.canEnergizeSimulatedBench ??
      pinoutSafetyEvaluation.canEnergizePhysicalBench;
    if (canEnergizeVirtual) {
      setPowerSupply((psu) => ({ ...psu, isOutputEnabled: true }));
    }
  }, [
    pinoutSafetyEvaluation.canEnergizeSimulatedBench,
    pinoutSafetyEvaluation.canEnergizePhysicalBench,
  ]);

  const handleConfirmOcrVehicleBench = useCallback(() => {
    setConfirmedOcrVehicleKey(activeVehicleSafetyKey);
  }, [activeVehicleSafetyKey]);

  const handleToggleAutoVerifyWorkflow = useCallback(() => {
    setWorkflowPrefs((prev) => ({
      ...prev,
      autoVerifyWorkflow: !prev.autoVerifyWorkflow,
    }));
  }, []);

  const [pins, setPins] = useState<EcuPin[]>(DEFAULT_ECU_PINS);
  const [components, setComponents] = useState<BenchComponent[]>(DEFAULT_BENCH_COMPONENTS);
  const [wires, setWires] = useState<WireConnection[]>(DEFAULT_WIRES);
  const [faults, setFaults] = useState<InjectedFault[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>('ecu-pin-7');

  const [rpmEmulator, setRpmEmulator] = useState<RpmEmulatorState>({
    isActive: false,
    rpm: 850,
    soundEnabled: true,
  });

  const [gaugeMonitor, setGaugeMonitor] = useState<GaugeMonitorState>(
    () => ({
      ...DEFAULT_GAUGE_MONITOR_STATE,
      peakHold: { ...DEFAULT_GAUGE_MONITOR_STATE.peakHold },
    })
  );

  // Wrapper keeps voice assistant / legacy callers in sync with LiveGaugeConsole transportMode
  const handleRpmEmulatorChange: React.Dispatch<React.SetStateAction<RpmEmulatorState>> = useCallback(
    (updater) => {
      setRpmEmulator((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (next.isActive !== prev.isActive) {
          setGaugeMonitor((gm) => ({
            ...gm,
            transportMode: next.isActive ? 'LIVE' : 'STOPPED',
          }));
        }
        return next;
      });
    },
    []
  );

  // Synchronize RPM Emulator minimal sound synthesizer with active state, CKP dropout, LIVE transport, RPM, mute & PSU output
  useEffect(() => {
    const isEffectivelyEnergized =
      rpmEmulator.isActive &&
      powerSupply.isOutputEnabled &&
      !rpmEmulator.ckpSignalLost &&
      gaugeMonitor.transportMode === 'LIVE';
    updateRpmEmulatorAudio(isEffectivelyEnergized, rpmEmulator.rpm, rpmEmulator.soundEnabled);
  }, [
    rpmEmulator.isActive,
    rpmEmulator.rpm,
    rpmEmulator.soundEnabled,
    rpmEmulator.ckpSignalLost,
    gaugeMonitor.transportMode,
    powerSupply.isOutputEnabled,
  ]);

  useEffect(() => {
    return () => {
      stopRpmEmulatorAudio();
    };
  }, []);

  // Multimeter State
  const [multimeter, setMultimeter] = useState<MultimeterState>({
    mode: 'V_DC',
    redProbe: { attachedToPinId: 'ecu-pin-7', attachedLabel: 'TPS_SIG (Pin 7)' },
    blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'Chassis GND (KL31)' },
    isPowered: true,
    rangeAuto: true,
    holdValue: false,
  });

  useEffect(() => {
    recordRenderCycle('App');
  });

  const wire9 = useMemo(() => wires.find((w) => w.id === 'wire-9'), [wires]);
  const wire10 = useMemo(() => wires.find((w) => w.id === 'wire-10'), [wires]);
  const wire11 = useMemo(() => wires.find((w) => w.id === 'wire-11'), [wires]);

  const hasCanFault = useMemo(
    () =>
      faults.some((f) => f.pinId === 'ecu-pin-13' || f.pinId === 'ecu-pin-14') ||
      Boolean(wire10?.isCut) ||
      Boolean(wire11?.isCut),
    [faults, wire10?.isCut, wire11?.isCut]
  );

  const hasInjectorFault = useMemo(
    () => faults.some((f) => f.pinId === 'ecu-pin-10') || Boolean(wire9?.isCut),
    [faults, wire9?.isCut]
  );

  const isInjectorFiring = useMemo(() => {
    const inj = components.find((c) => c.id === 'comp-inj');
    return Boolean(inj?.state?.isFiring ?? true);
  }, [components]);

  // Memoize MNA circuit solution so UI-only state changes never re-allocate solver matrices
  const circuitSolution = useMemo(() => {
    recordRenderCycle('MnaSolver');
    return solveCircuit(powerSupply, pins, faults, wires, components, multimeter, {
      rpm: rpmEmulator.isActive ? rpmEmulator.rpm : 850,
      isInjectorFiring,
      hasCanFault,
      hasInjectorFault,
      camPhaseOffsetDeg: rpmEmulator.camPhaseOffsetDeg ?? 0,
      ckpSignalLost: Boolean(rpmEmulator.ckpSignalLost),
    });
  }, [
    powerSupply,
    pins,
    faults,
    wires,
    components,
    multimeter,
    rpmEmulator.isActive,
    rpmEmulator.rpm,
    rpmEmulator.camPhaseOffsetDeg,
    rpmEmulator.ckpSignalLost,
    isInjectorFiring,
    hasCanFault,
    hasInjectorFault,
  ]);

  const logicCheckRules = useMemo(
    () => mergeLogicCheckRules(pins, logicRuleOverrides),
    [pins, logicRuleOverrides]
  );

  const logicCheckSnapshot = useMemo(
    () =>
      evaluateLogicCheck({
        rules: logicCheckRules,
        pins,
        nodeVoltages: circuitSolution.nodeVoltages,
        powerSupply,
        wires,
        faults,
        components,
        isArmed: isLogicCheckArmed,
      }),
    [logicCheckRules, pins, circuitSolution.nodeVoltages, powerSupply, wires, faults, components, isLogicCheckArmed]
  );

  const circuitAnomalySnapshot = useMemo(
    () =>
      evaluateCircuitAnomalies({
        powerSupply,
        pins,
        wires,
        faults,
        multimeter,
        circuitSolution,
      }),
    [powerSupply, pins, wires, faults, multimeter, circuitSolution]
  );

  useEffect(() => {
    saveLogicCheckArmed(isLogicCheckArmed);
  }, [isLogicCheckArmed]);

  useEffect(() => {
    saveLogicCheckRules(logicCheckRules);
  }, [logicCheckRules]);

  useEffect(() => {
    const nextSig = logicCheckSnapshot.signature;
    if (!nextSig) {
      lastLogicAlertSigRef.current = '';
      setDismissedLogicAlertSig('');
      return;
    }
    if (nextSig === lastLogicAlertSigRef.current) {
      return;
    }
    lastLogicAlertSigRef.current = nextSig;
    setDismissedLogicAlertSig('');

    const timestampLabel = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    if (logicCheckSnapshot.alerts.length > 0) {
      const newEntries: LogicCheckIncidentEntry[] = logicCheckSnapshot.alerts.map((alert) => ({
        id: `${alert.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestampLabel,
        pinId: alert.pinId,
        pinNumber: alert.pinNumber,
        pinLabel: alert.pinLabel,
        severity: alert.severity,
        title: alert.title,
        detail: alert.detail,
        measuredVoltage: alert.measuredVoltage,
      }));
      setLogicCheckIncidents((prev) => [...newEntries, ...prev].slice(0, 40));

      if (rpmEmulator.soundEnabled) {
        const hasCritical = logicCheckSnapshot.alerts.some((a) => a.severity === 'CRITICAL');
        playLogicAlertBeep(hasCritical ? 'CRITICAL' : 'WARNING');
      }
    }
  }, [logicCheckSnapshot.signature, logicCheckSnapshot.alerts, rpmEmulator.soundEnabled]);

  const handleToggleLogicCheckArmed = useCallback(() => {
    setIsLogicCheckArmed((prev) => !prev);
  }, []);

  const handleToggleLogicRuleEnabled = useCallback(
    (pinId: string) => {
      setLogicRuleOverrides(() =>
        logicCheckRules.map((r) => ({
          pinId: r.pinId,
          expectedState: r.expectedState,
          minVoltage: r.minVoltage,
          maxVoltage: r.maxVoltage,
          shortToBatteryThresholdV: r.shortToBatteryThresholdV,
          enabled: r.pinId === pinId ? !r.enabled : r.enabled,
          isCustom: r.isCustom,
        }))
      );
    },
    [logicCheckRules]
  );

  const handleUpdateLogicRuleThresholds = useCallback(
    (
      pinId: string,
      updates: Partial<
        Pick<
          LogicCheckRule,
          'expectedState' | 'minVoltage' | 'maxVoltage' | 'shortToBatteryThresholdV'
        >
      >
    ) => {
      setLogicRuleOverrides(() =>
        logicCheckRules.map((r) =>
          r.pinId === pinId
            ? {
                pinId: r.pinId,
                expectedState: updates.expectedState ?? r.expectedState,
                minVoltage: updates.minVoltage ?? r.minVoltage,
                maxVoltage: updates.maxVoltage ?? r.maxVoltage,
                shortToBatteryThresholdV:
                  updates.shortToBatteryThresholdV ?? r.shortToBatteryThresholdV,
                enabled: r.enabled,
                isCustom: true,
              }
            : {
                pinId: r.pinId,
                expectedState: r.expectedState,
                minVoltage: r.minVoltage,
                maxVoltage: r.maxVoltage,
                shortToBatteryThresholdV: r.shortToBatteryThresholdV,
                enabled: r.enabled,
                isCustom: r.isCustom,
              }
        )
      );
    },
    [logicCheckRules]
  );

  const handleApplyLogicPreset = useCallback(
    (preset: LogicWatchPreset) => {
      const nextRules = applyWatchPresetToRules(logicCheckRules, preset);
      setLogicRuleOverrides(
        nextRules.map((r) => ({
          pinId: r.pinId,
          expectedState: r.expectedState,
          minVoltage: r.minVoltage,
          maxVoltage: r.maxVoltage,
          shortToBatteryThresholdV: r.shortToBatteryThresholdV,
          enabled: r.enabled,
          isCustom: r.isCustom,
        }))
      );
    },
    [logicCheckRules]
  );

  const handleResetLogicRules = useCallback(() => {
    const defaults = buildDefaultLogicCheckRules(pins);
    setLogicRuleOverrides(
      defaults.map((r) => ({
        pinId: r.pinId,
        expectedState: r.expectedState,
        minVoltage: r.minVoltage,
        maxVoltage: r.maxVoltage,
        shortToBatteryThresholdV: r.shortToBatteryThresholdV,
        enabled: r.enabled,
        isCustom: false,
      }))
    );
  }, [pins]);

  const handleClearLogicIncidents = useCallback(() => {
    setLogicCheckIncidents([]);
  }, []);

  const offlineBotLiveContext = useMemo(
    () => ({
      powerSupply,
      pins,
      wires,
      faults,
      activeDTCs: circuitSolution.activeDTCs,
      nodeVoltages: circuitSolution.nodeVoltages,
      supplyCurrentDrawAmps: circuitSolution.supplyCurrentDrawAmps,
      isSupplyCurrentTripped: circuitSolution.isSupplyCurrentTripped,
      multimeter,
      multimeterDisplay: circuitSolution.multimeterReading.display,
      multimeterUnit: circuitSolution.multimeterReading.unit,
      multimeterWarning: circuitSolution.multimeterReading.warningMessage,
      selectedPinId,
    }),
    [powerSupply, pins, wires, faults, circuitSolution, multimeter, selectedPinId]
  );

  // Bilingual AI Workbench (EN/TL) + Live Bench Context + Unified AI Drawer + Help Drawer
  const [bilingualLang, setBilingualLang] = useState<BilingualLang>(() =>
    loadPersistedBilingualLang()
  );
  const [showUnifiedAiDrawer, setShowUnifiedAiDrawer] = useState(false);
  const [unifiedAiSubTab, setUnifiedAiSubTab] = useState<UnifiedAiSubTab>('VOICE');
  const [showHelpDrawer, setShowHelpDrawer] = useState(false);
  const [aiVoiceTranscript, setAiVoiceTranscript] = useState<string | null>(null);
  const [handsFreeIncomingCommand, setHandsFreeIncomingCommand] = useState<string | null>(null);
  const [showAcademyCurriculum, setShowAcademyCurriculum] = useState(false);
  const [showInstructorVerifier, setShowInstructorVerifier] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showAdminBillingModal, setShowAdminBillingModal] = useState(false);
  const [activeAcademyModuleId, setActiveAcademyModuleId] = useState<string | null>(null);
  const [academyLaunchRequest, setAcademyLaunchRequest] = useState<{
    moduleId: string;
    nonce: number;
  } | null>(null);

  const handleHandsFreeModalAction = useCallback(
    (modal: 'ACADEMY_LAB' | 'REPORT_STUDIO' | 'DIAGNOSTIC_ASSISTANT' | 'SAVED_SESSIONS') => {
      if (modal === 'ACADEMY_LAB') {
        setShowAcademyCurriculum(true);
      } else if (modal === 'REPORT_STUDIO') {
        setShowDocsModal(true);
      } else if (modal === 'DIAGNOSTIC_ASSISTANT') {
        setUnifiedAiSubTab('DIAGNOSTIC');
        setShowUnifiedAiDrawer(true);
      } else if (modal === 'SAVED_SESSIONS') {
        setShowCloudModal(true);
      }
    },
    []
  );

  const handleTopBarVoiceTranscript = useCallback((transcript: string) => {
    setUnifiedAiSubTab('VOICE');
    setShowUnifiedAiDrawer(true);
    setHandsFreeIncomingCommand(transcript);
  }, []);

  const handleStartAcademyExercise = useCallback(
    (mod: LabModule) => {
      setActiveAcademyModuleId(mod.id);
      setActiveTab('BENCH_LAB');
      setShowDiagnosticGuide(true);
      setAcademyLaunchRequest({ moduleId: mod.id, nonce: Date.now() });
    },
    []
  );

  const selectedEcuProfileObj = useMemo(
    () => getEcuProfileById(selectedEcuProfileId),
    [selectedEcuProfileId]
  );

  const liveAiBenchContext = useBenchContext(
    {
      vehicleLabel: `${selectedBrandKey} ${selectedModelName}`.trim(),
      ecuProfileLabel: selectedEcuProfileObj
        ? `${selectedEcuProfileObj.brandName} ${selectedEcuProfileObj.modelName}`
        : 'Universal ECU Bench',
      powerSupply,
      circuitSolution,
      multimeter,
      multimeterDisplay: circuitSolution.multimeterReading.display,
      multimeterUnit: circuitSolution.multimeterReading.unit,
      multimeterWarning: circuitSolution.multimeterReading.warningMessage,
      pins,
      faults,
      selectedPinId,
    },
    bilingualLang
  );

  const handleOpenAiDiagnosticPanel = useCallback((prefillQuery?: string) => {
    if (prefillQuery && prefillQuery.trim()) {
      setAiVoiceTranscript(prefillQuery.trim());
    }
    setUnifiedAiSubTab('DIAGNOSTIC');
    setShowUnifiedAiDrawer(true);
  }, []);

  // Fault management handlers
  const handleAddFault = useCallback(
    (pinId: string, faultType: FaultType, description: string, customSeriesOhms?: number) => {
      setFaults((prev) => {
        const filtered = prev.filter((f) => f.pinId !== pinId);
        return [
          ...filtered,
          {
            pinId,
            faultType,
            description,
            timestamp: Date.now(),
            ...(typeof customSeriesOhms === 'number' && Number.isFinite(customSeriesOhms) && customSeriesOhms > 0
              ? { customSeriesOhms }
              : {}),
          },
        ];
      });
    },
    []
  );

  const handleReplaceFaults = useCallback((nextFaults: InjectedFault[]) => {
    setFaults(nextFaults);
  }, []);

  const handleRemoveFault = useCallback((pinId: string) => {
    setFaults((prev) => prev.filter((f) => f.pinId !== pinId));
  }, []);

  const handleClearAllFaults = useCallback(() => {
    setFaults([]);
  }, []);

  const handleSearchDtcFromInjector = useCallback(
    (code: string, desc: string) => {
      const profile = getEcuProfileById(selectedEcuProfileId);
      const ecuLabel = profile
        ? `${profile.brandName} ${selectedModelName} (${profile.modelName})`
        : 'Universal Bench';
      handleOpenGroundedSearch(
        `${code} ${desc} ${ecuLabel} diagnostic procedure technical service bulletin`,
        code,
        ecuLabel
      );
    },
    [handleOpenGroundedSearch, selectedEcuProfileId, selectedModelName]
  );

  // Wire management
  const handleAddWire = useCallback(
    (sourcePinId: string, targetPinId: string, color?: string, label?: string) => {
      setWires((prev) => {
        const exists = prev.some(
          (w) =>
            (w.sourcePinId === sourcePinId && w.targetPinId === targetPinId) ||
            (w.sourcePinId === targetPinId && w.targetPinId === sourcePinId)
        );
        if (exists) return prev;

        const uniqueId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? `wire-${crypto.randomUUID().slice(0, 8)}`
            : `wire-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        const newWire: WireConnection = {
          id: uniqueId,
          sourcePinId,
          targetPinId,
          color: color || '#06b6d4',
          label: label || 'Auxiliary Harness Lead',
          isCut: false,
          resistance: 0.05,
        };
        return [...prev, newWire];
      });
    },
    []
  );

  const handleToggleCutWire = useCallback((wireId: string) => {
    setWires((prev) => prev.map((w) => (w.id === wireId ? { ...w, isCut: !w.isCut } : w)));
  }, []);

  const handleDeleteWire = useCallback((wireId: string) => {
    setWires((prev) => prev.filter((w) => w.id !== wireId));
  }, []);

  const handleRenameWire = useCallback(
    (wireId: string, newLabel: string) => {
      const result = renameWireInList(wires, wireId, newLabel);
      if (!result.updated) return;

      setWires(result.wires);

      if (activeSessionId) {
        const existingSession = savedSessions.find((s) => s.id === activeSessionId);
        setSavedSessions((prev) =>
          prev.map((s) => (s.id === activeSessionId ? { ...s, wires: result.wires } : s))
        );
        updateBenchSessionWires(activeStorageUid, activeSessionId, result.wires, existingSession)
          .catch((err) => {
            reportCloudSyncError('Wire label save', err);
          });
      }
    },
    [activeStorageUid, wires, activeSessionId, savedSessions, reportCloudSyncError]
  );

  const handleUpdateComponentState = useCallback(
    (compId: string, updates: Record<string, number | boolean | string>) => {
      setComponents((prev) =>
        prev.map((c) => (c.id === compId ? { ...c, state: { ...c.state, ...updates } } : c))
      );
    },
    []
  );

  const handleAddComponent = useCallback((comp: BenchComponent) => {
    setComponents((prev) => [...prev, comp]);
  }, []);

  const handleDeleteComponent = useCallback((compId: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== compId));
    setWires((prev) =>
      prev.filter(
        (w) =>
          !w.sourcePinId.startsWith(`${compId}-`) &&
          !w.targetPinId.startsWith(`${compId}-`)
      )
    );
    setMultimeter((prev) => ({
      ...prev,
      redProbe: prev.redProbe.attachedToPinId?.startsWith(`${compId}-`)
        ? { attachedToPinId: 'ecu-pin-7', attachedLabel: 'TPS_SIG (Pin 7)' }
        : prev.redProbe,
      blackProbe: prev.blackProbe.attachedToPinId?.startsWith(`${compId}-`)
        ? { attachedToPinId: 'chassis-gnd', attachedLabel: 'Chassis GND (KL31)' }
        : prev.blackProbe,
    }));
  }, []);

  const handleUpdateComponentPosition = useCallback(
    (compId: string, x: number, y: number) => {
      setComponents((prev) =>
        prev.map((c) => (c.id === compId ? { ...c, x, y } : c))
      );
    },
    []
  );

  const handleAttachProbe = useCallback((color: 'red' | 'black', pinId: string, label: string) => {
    if (color === 'red') {
      setMultimeter((prev) => ({
        ...prev,
        redProbe: { attachedToPinId: pinId, attachedLabel: label },
      }));
    } else {
      setMultimeter((prev) => ({
        ...prev,
        blackProbe: { attachedToPinId: pinId, attachedLabel: label },
      }));
    }
  }, []);

  const handleOpenEcuPinouts = useCallback(() => {
    setActiveTab('ECU_PINOUT');
  }, []);

  const handleSelectVehicleEcu = useCallback(
    (brandKey: string, modelName: string, ecuProfileId: string | null) => {
      setSelectedBrandKey(brandKey);
      setSelectedModelName(modelName);
      setSelectedEcuProfileId(ecuProfileId);
      setPins(applyEcuProfileToPins(ecuProfileId, DEFAULT_ECU_PINS));

      const nextKey = `${brandKey}::${modelName}::${ecuProfileId || ''}`;
      const nextCtx = getSelectedVehicleContext(brandKey, modelName, ecuProfileId);
      const nextSafety = evaluateVehicleBenchSafety({
        brandKey,
        modelName,
        ecuProfileId,
        ecuStatus: nextCtx.status,
        hasVerifiedPinoutMap: nextCtx.hasVerifiedPinoutMap,
        controllerNote: nextCtx.controllerNote,
        orientationConfirmed: confirmedOcrVehicleKey === nextKey,
      });
      const canEnergizeNextVirtual =
        nextSafety.canEnergizeSimulatedBench ?? nextSafety.canEnergizePhysicalBench;
      if (!canEnergizeNextVirtual) {
        setPowerSupply((prev) => (prev.isOutputEnabled ? { ...prev, isOutputEnabled: false } : prev));
      }
    },
    [confirmedOcrVehicleKey]
  );

  // Reset entire laboratory to pristine factory state (PSU output OFF by default for electrical safety)
  const handleResetLab = useCallback(() => {
    stopRpmEmulatorAudio();
    setPreBenchGateBypassed(false);
    setActiveSessionId(null);
    setPowerSupply({
      voltageSetting: 12.6,
      currentLimit: 5.0,
      isOutputEnabled: false,
      preset: '12V_BENCH',
    });
    setSelectedBrandKey(UNIVERSAL_BRAND_KEY);
    setSelectedModelName('Generic 16-Pin Bench');
    setSelectedEcuProfileId(null);
    setRpmEmulator({ isActive: false, rpm: 850, soundEnabled: true });
    setGaugeMonitor({
      ...DEFAULT_GAUGE_MONITOR_STATE,
      peakHold: { ...DEFAULT_GAUGE_MONITOR_STATE.peakHold },
    });
    setPins(DEFAULT_ECU_PINS);
    setComponents(DEFAULT_BENCH_COMPONENTS);
    setWires(DEFAULT_WIRES);
    setFaults([]);
    setSelectedPinId('ecu-pin-7');
    setMultimeter({
      mode: 'V_DC',
      redProbe: { attachedToPinId: 'ecu-pin-7', attachedLabel: 'TPS_SIG (Pin 7)' },
      blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'Chassis GND (KL31)' },
      isPowered: true,
      rangeAuto: true,
      holdValue: false,
    });
  }, [workflowPrefs.preBenchGateLocked]);

  // Restore saved bench session into live MNA state (always force safe STOPPED transport on restore)
  const handleLoadBenchSession = useCallback((session: SavedBenchSession) => {
    stopRpmEmulatorAudio();
    setActiveSessionId(session.id);
    if (session.powerSupply) {
      setPowerSupply(session.powerSupply);
    }
    if (Array.isArray(session.wires)) {
      setWires(session.wires);
    }
    if (Array.isArray(session.faults)) {
      setFaults(
        session.faults.map((f) => ({
          pinId: f.pinId,
          faultType: f.faultType as FaultType,
          description: f.description,
          timestamp: f.timestamp,
        }))
      );
    }
    const restoredGauge = session.gaugeMonitor
      ? forceSafeStoppedGaugeState(session.gaugeMonitor)
      : {
          ...DEFAULT_GAUGE_MONITOR_STATE,
          peakHold: { ...DEFAULT_GAUGE_MONITOR_STATE.peakHold },
        };
    setGaugeMonitor(restoredGauge);

    if (session.componentStates) {
      setComponents((prev) =>
        prev.map((c) => {
          const mergedState = session.componentStates[c.id]
            ? { ...c.state, ...session.componentStates[c.id] }
            : c.state;
          if (c.id === 'comp-map') {
            return {
              ...c,
              state: {
                ...mergedState,
                calibrationPreset: restoredGauge.mapCalibrationPreset,
              },
            };
          }
          return { ...c, state: mergedState };
        })
      );
    }
    if (session.selectedBrandKey) {
      const nextBrand = session.selectedBrandKey;
      const nextModel = session.selectedModelName || 'Generic 16-Pin Bench';
      const nextProfileId = session.selectedEcuProfileId ?? null;
      setSelectedBrandKey(nextBrand);
      setSelectedModelName(nextModel);
      setSelectedEcuProfileId(nextProfileId);
      setPins(applyEcuProfileToPins(nextProfileId, DEFAULT_ECU_PINS));
    }
    if (session.rpmEmulator) {
      setRpmEmulator({
        isActive: false,
        rpm: Number(session.rpmEmulator.rpm) || 850,
        soundEnabled: session.rpmEmulator.soundEnabled !== false,
        camPhaseOffsetDeg: Number(session.rpmEmulator.camPhaseOffsetDeg) || 0,
        ckpSignalLost: Boolean(session.rpmEmulator.ckpSignalLost),
      });
    } else {
      setRpmEmulator({ isActive: false, rpm: 850, soundEnabled: true });
    }
    if (session.multimeter) {
      setMultimeter(session.multimeter);
    }
    if (Array.isArray(session.workflowCheckedIds)) {
      const validIds = new Set(DIAGNOSTIC_WORKFLOW_STEPS.map((s) => s.id));
      setCheckedWorkflowIds(session.workflowCheckedIds.filter((id) => validIds.has(id)));
    }
    if (typeof session.preBenchGateLocked === 'boolean') {
      setPreBenchGateBypassed(false);
      setWorkflowPrefs((prev) => ({
        ...prev,
        preBenchGateLocked: Boolean(session.preBenchGateLocked),
      }));
    }
  }, []);

  const handleLoadDriveBenchSnapshot = useCallback((snapshot: DriveBenchSnapshot) => {
    stopRpmEmulatorAudio();
    if (snapshot.powerSupply) {
      setPowerSupply(snapshot.powerSupply);
    }
    if (Array.isArray(snapshot.wires)) {
      setWires(snapshot.wires);
    }
    if (Array.isArray(snapshot.faults)) {
      setFaults(
        snapshot.faults.map((f) => ({
          pinId: f.pinId,
          faultType: f.faultType as FaultType,
          description: f.description,
          timestamp: f.timestamp,
        }))
      );
    }
    const restoredGauge = snapshot.gaugeMonitor
      ? forceSafeStoppedGaugeState(snapshot.gaugeMonitor)
      : {
          ...DEFAULT_GAUGE_MONITOR_STATE,
          peakHold: { ...DEFAULT_GAUGE_MONITOR_STATE.peakHold },
        };
    setGaugeMonitor(restoredGauge);

    if (snapshot.componentStates) {
      setComponents((prev) =>
        prev.map((c) => {
          const mergedState = snapshot.componentStates[c.id]
            ? { ...c.state, ...snapshot.componentStates[c.id] }
            : c.state;
          if (c.id === 'comp-map') {
            return {
              ...c,
              state: {
                ...mergedState,
                calibrationPreset: restoredGauge.mapCalibrationPreset,
              },
            };
          }
          return { ...c, state: mergedState };
        })
      );
    }
    if (snapshot.selectedBrandKey) {
      const nextBrand = snapshot.selectedBrandKey;
      const nextModel = snapshot.selectedModelName || 'Generic 16-Pin Bench';
      const nextProfileId = snapshot.selectedEcuProfileId ?? null;
      setSelectedBrandKey(nextBrand);
      setSelectedModelName(nextModel);
      setSelectedEcuProfileId(nextProfileId);
      setPins(applyEcuProfileToPins(nextProfileId, DEFAULT_ECU_PINS));
    }
    if (snapshot.rpmEmulator) {
      setRpmEmulator({
        isActive: false,
        rpm: Number(snapshot.rpmEmulator.rpm) || 850,
        soundEnabled: snapshot.rpmEmulator.soundEnabled !== false,
        camPhaseOffsetDeg: Number(snapshot.rpmEmulator.camPhaseOffsetDeg) || 0,
        ckpSignalLost: Boolean(snapshot.rpmEmulator.ckpSignalLost),
      });
    } else {
      setRpmEmulator({ isActive: false, rpm: 850, soundEnabled: true });
    }
    if (snapshot.multimeter) {
      setMultimeter(snapshot.multimeter);
    }
    if (Array.isArray(snapshot.workflowCheckedIds)) {
      const validIds = new Set(DIAGNOSTIC_WORKFLOW_STEPS.map((s) => s.id));
      setCheckedWorkflowIds(snapshot.workflowCheckedIds.filter((id) => validIds.has(id)));
    }
    if (typeof snapshot.preBenchGateLocked === 'boolean') {
      setPreBenchGateBypassed(false);
      setWorkflowPrefs((prev) => ({
        ...prev,
        preBenchGateLocked: Boolean(snapshot.preBenchGateLocked),
      }));
    }
    if (Array.isArray(snapshot.voiceMacros) && snapshot.voiceMacros.length > 0) {
      voiceMacroService.syncFromCloud(snapshot.voiceMacros, 'merge');
    }
  }, []);

  const handleCrossProbePin = useCallback(
    (pinId: string, label?: string, navigateToBench: boolean = true) => {
      const targetPin = pins.find((p) => p.id === pinId);
      const redLabel = label || (targetPin ? `${targetPin.label} (Pin ${targetPin.pinNumber})` : pinId);
      setSelectedPinId(pinId);
      setMultimeter((prev) => ({
        ...prev,
        isPowered: true,
        redProbe: { attachedToPinId: pinId, attachedLabel: redLabel },
        blackProbe: { attachedToPinId: 'chassis-gnd', attachedLabel: 'Chassis GND (KL31)' },
      }));
      if (navigateToBench) {
        setActiveTab('BENCH_LAB');
        setMobileBenchPane('INSTRUMENTS');
      }
    },
    [pins]
  );

  const selectedPin = pins.find((p) => p.id === selectedPinId);

  const handleQuickAttachRedProbe = useCallback(() => {
    if (!selectedPinId) return;
    const label = selectedPin ? `${selectedPin.label} (${selectedPin.name})` : selectedPinId;
    handleAttachProbe('red', selectedPinId, label);
  }, [selectedPinId, selectedPin, handleAttachProbe]);

  const handleQuickAttachBlackProbe = useCallback(() => {
    handleAttachProbe('black', 'chassis-gnd', 'Chassis GND (KL31)');
  }, [handleAttachProbe]);

  const mandatoryWorkflowIds = useMemo(
    () => DIAGNOSTIC_WORKFLOW_STEPS.filter((s) => s.mandatoryPreBench).map((s) => s.id),
    []
  );
  const workflowMandatoryChecked = useMemo(
    () => mandatoryWorkflowIds.filter((id) => checkedWorkflowIds.includes(id)).length,
    [mandatoryWorkflowIds, checkedWorkflowIds]
  );

  const handleSelectDiagnosticPanel = useCallback(
    (mode: DiagnosticPanelMode) => {
      if (activeTab !== 'BENCH_LAB') {
        setActiveTab('BENCH_LAB');
        setDiagnosticPanelMode(mode);
        setShowDiagnosticGuide(true);
        setMobileBenchPane('GUIDE');
        return;
      }
      if (showDiagnosticGuide && diagnosticPanelMode === mode) {
        setShowDiagnosticGuide(false);
        return;
      }
      setDiagnosticPanelMode(mode);
      setShowDiagnosticGuide(true);
      setMobileBenchPane('GUIDE');
    },
    [activeTab, showDiagnosticGuide, diagnosticPanelMode]
  );

  const [benchVoiceActionRequest, setBenchVoiceActionRequest] = useState<{
    action: BenchVoiceSimulationAction;
    nonce: number;
  } | null>(null);

  const handleBenchVoiceAction = useCallback(
    (action: BenchVoiceSimulationAction) => {
      if (action.type === 'SET_IGNITION') {
        if (action.enabled) {
          handleBypassPreBenchGate();
        }
        handlePowerSupplyChange((prev) => ({
          ...prev,
          isOutputEnabled: action.enabled,
        }));
        return;
      }
      if (action.type === 'SET_SYNC_MODE') {
        setTwinSyncMode(action.mode);
        return;
      }
      if (
        action.type === 'START_GUIDED_TOUR' ||
        action.type === 'SHOW_ENGINE_BLOCK' ||
        action.type === 'TOGGLE_FAULT_MESH' ||
        action.type === 'SET_CAMERA_PRESET' ||
        action.type === 'SET_EXPLODE'
      ) {
        if (activeTab !== 'BENCH_LAB' && activeTab !== 'THREE_D_TWIN') {
          setActiveTab('BENCH_LAB');
        }
      }
      setBenchVoiceActionRequest({ action, nonce: Date.now() });
    },
    [activeTab, handleBypassPreBenchGate, handlePowerSupplyChange]
  );

  return (
    <div className="relative isolate flex flex-col h-[100dvh] hud-shell text-slate-100 font-body select-none overflow-hidden">
      {/* Official AutoElectric Lab Pro Cover Image Blended Atmospheric Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none"
      >
        {!isCoverBgFailed && (
          <img
            src={APP_LOGO_SRC}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            onError={() => setIsCoverBgFailed(true)}
            className="hud-cover-backdrop-img"
          />
        )}
        <div aria-hidden="true" className="hud-cover-backdrop-scrim" />
      </div>

      <LabTopNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        simulationSpeed={simulationSpeed}
        onChangeSimulationSpeed={setSimulationSpeed}
        circuitSolution={circuitSolution}
        powerSupply={powerSupply}
        isSignedIn={Boolean(user)}
        onOpenCloudModal={() => setShowCloudModal(true)}
        onOpenDocsModal={handleOpenDocsGated}
        onOpenWorkspaceModal={handleOpenWorkspaceModal}
        onOpenOfflineBot={() => handleOpenOfflineBot()}
        onOpenGroundedSearch={() => {
          if (!canUseAi) {
            openAccessModal({
              tab: 'TRIAL_PIN',
              notice:
                accessMode === 'TRIAL_EXPIRED' || accessMode === 'TRIAL_REVOKED'
                  ? 'Your trial PIN has expired — Live OEM AI Search is locked. Enter a new 8-digit Trial PIN.'
                  : 'Enter an active 8-digit Trial PIN or Master Admin PIN to run Live OEM AI Search.',
            });
            return;
          }
          handleOpenGroundedSearch();
        }}
        onOpenIntroModal={() => setShowIntroModal(true)}
        onResetLab={handleResetLab}
        onOpenLicenseModal={() => openAccessModal()}
        onOpenPhysicalFaultModal={() => setShowPhysicalFaultModal(true)}
        onToggleAudioAlertsPanel={() => setShowAudioAlertsSetup((prev) => !prev)}
        activeAudioAlertCount={circuitAnomalySnapshot.alerts.length}
        onOpenGeminiStudio={handleOpenGeminiStudioGated}
        pwa={pwa}
        onOpenPwaGuideModal={() => setShowPwaGuideModal(true)}
        onOpenVoiceMacroLibrary={() => setShowVoiceMacroLibrary(true)}
        onOpenLookupDrawer={() => setShowLookupDrawer(true)}
        isLookupDrawerOpen={showLookupDrawer}
        onOpenBatchPinTest={handleOpenBatchPinTest}
        batchSelectedPinCount={batchSelectedPinIds.length}
        bilingualLang={bilingualLang}
        onChangeBilingualLang={setBilingualLang}
        onOpenAcademyCurriculum={() => setShowAcademyCurriculum(true)}
        onOpenSubscriptionModal={() => setShowSubscriptionModal(true)}
        onOpenAdminBillingModal={() => setShowAdminBillingModal(true)}
        isAdminUnlocked={isAdminUnlocked}
        onOpenHelpDrawer={() => setShowHelpDrawer(true)}
      />

      <CircuitAudioAlertBar
        snapshot={circuitAnomalySnapshot}
        isSettingsPanelOpen={showAudioAlertsSetup}
        onToggleSettingsPanel={() => setShowAudioAlertsSetup((prev) => !prev)}
      />

      <PWAUpdateBanner pwa={pwa} />

      {isLogicCheckArmed &&
        logicCheckSnapshot.alerts.length > 0 &&
        dismissedLogicAlertSig !== logicCheckSnapshot.signature && (
          <div className="px-2 sm:px-3 pt-1.5 shrink-0">
            <LogicCheckAlertBanner
              alerts={logicCheckSnapshot.alerts}
              onFocusPin={(pinId) => {
                setSelectedPinId(pinId);
                setActiveTab('BENCH_LAB');
                setDiagnosticPanelMode('LOGIC_CHECK');
                setShowDiagnosticGuide(true);
                setMobileBenchPane('GUIDE');
              }}
              onOpenLogicCheck={() => {
                setActiveTab('BENCH_LAB');
                setDiagnosticPanelMode('LOGIC_CHECK');
                setShowDiagnosticGuide(true);
                setMobileBenchPane('GUIDE');
              }}
              onDismiss={() => setDismissedLogicAlertSig(logicCheckSnapshot.signature)}
            />
          </div>
        )}

      {cloudSyncNotice && (
        <div
          role="status"
          className="mx-2 sm:mx-3 mt-1.5 px-3 py-1.5 rounded-[2px] border border-amber-500/60 bg-amber-950/60 text-amber-200 font-mono text-[11px] flex items-center justify-between gap-2 shrink-0"
        >
          <span className="truncate">{cloudSyncNotice}</span>
          <button
            type="button"
            onClick={() => setCloudSyncNotice(null)}
            className="hw-btn px-2 py-0.5 rounded-[2px] text-[10px] text-amber-100 shrink-0 cursor-pointer"
            aria-label="Dismiss cloud sync notice"
          >
            Dismiss
          </button>
        </div>
      )}

      <LabWorkspaceLayout
        activeTab={activeTab}
        onNavigateTab={setActiveTab}
        rackFilter={rackFilter}
        onChangeRackFilter={setRackFilter}
        mobileBenchPane={mobileBenchPane}
        onChangeMobileBenchPane={setMobileBenchPane}
        showDiagnosticGuide={showDiagnosticGuide}
        onSetShowDiagnosticGuide={setShowDiagnosticGuide}
        diagnosticPanelMode={diagnosticPanelMode}
        onChangeDiagnosticPanelMode={setDiagnosticPanelMode}
        checkedWorkflowIds={checkedWorkflowIds}
        onChangeCheckedWorkflowIds={setCheckedWorkflowIds}
        preBenchGateLocked={workflowPrefs.preBenchGateLocked}
        preBenchGateBypassed={preBenchGateBypassed}
        onTogglePreBenchGate={handleTogglePreBenchGate}
        onBypassPreBenchGate={handleBypassPreBenchGate}
        pinoutSafetyEvaluation={pinoutSafetyEvaluation}
        selectedVehicleStatus={selectedVehicleCtx.status}
        onConfirmOcrVehicleBench={handleConfirmOcrVehicleBench}
        autoVerifyWorkflow={workflowPrefs.autoVerifyWorkflow}
        onToggleAutoVerifyWorkflow={handleToggleAutoVerifyWorkflow}
        logicCheckSnapshot={logicCheckSnapshot}
        logicCheckRules={logicCheckRules}
        isLogicCheckArmed={isLogicCheckArmed}
        logicCheckIncidents={logicCheckIncidents}
        onToggleLogicCheckArmed={handleToggleLogicCheckArmed}
        onToggleLogicRuleEnabled={handleToggleLogicRuleEnabled}
        onUpdateLogicRuleThresholds={handleUpdateLogicRuleThresholds}
        onApplyLogicPreset={handleApplyLogicPreset}
        onResetLogicRules={handleResetLogicRules}
        onClearLogicIncidents={handleClearLogicIncidents}
        isVoiceLogOpen={isVoiceLogOpen}
        onToggleVoiceLog={() => setIsVoiceLogOpen((prev) => !prev)}
        onSetVoiceLogOpen={setIsVoiceLogOpen}
        isLookupDrawerOpen={showLookupDrawer}
        onOpenLookupDrawer={() => setShowLookupDrawer(true)}
        onCloseLookupDrawer={() => setShowLookupDrawer(false)}
        academyLaunchRequest={academyLaunchRequest}
        onActiveUniversityModuleChange={setActiveAcademyModuleId}
        isAiCoachOpen={showUnifiedAiDrawer}
        onOpenAiCoach={() => {
          setUnifiedAiSubTab('VOICE');
          setShowUnifiedAiDrawer((prev) => !prev);
        }}
        benchVoiceActionRequest={benchVoiceActionRequest}
        simulationSpeed={simulationSpeed}
        powerSupply={powerSupply}
        onChangePowerSupply={handlePowerSupplyChange}
        multimeter={multimeter}
        onChangeMultimeter={setMultimeter}
        circuitSolution={circuitSolution}
        pins={pins}
        components={components}
        wires={wires}
        faults={faults}
        selectedPinId={selectedPinId}
        onSelectPin={setSelectedPinId}
        onAddFault={handleAddFault}
        onReplaceFaults={handleReplaceFaults}
        onRemoveFault={handleRemoveFault}
        onClearAllFaults={handleClearAllFaults}
        onSearchDtc={handleSearchDtcFromInjector}
        onAddWire={handleAddWire}
        onToggleCutWire={handleToggleCutWire}
        onDeleteWire={handleDeleteWire}
        onRenameWire={handleRenameWire}
        onAttachProbe={handleAttachProbe}
        onUpdateComponentState={handleUpdateComponentState}
        onAddComponent={handleAddComponent}
        onDeleteComponent={handleDeleteComponent}
        onUpdateComponentPosition={handleUpdateComponentPosition}
        onOpenEcuPinouts={handleOpenEcuPinouts}
        onOpenOfflineBot={handleOpenOfflineBot}
        onOpenGroundedSearch={handleOpenGroundedSearch}
        onOpenCloudModal={() => setShowCloudModal(true)}
        onResetLab={handleResetLab}
        onCrossProbePin={handleCrossProbePin}
        hasCanFault={hasCanFault}
        hasInjectorFault={hasInjectorFault}
        selectedBrandKey={selectedBrandKey}
        selectedModelName={selectedModelName}
        selectedEcuProfileId={selectedEcuProfileId}
        onSelectVehicleEcu={handleSelectVehicleEcu}
        rpmEmulator={rpmEmulator}
        onChangeRpmEmulator={handleRpmEmulatorChange}
        gaugeMonitor={gaugeMonitor}
        onChangeGaugeMonitor={setGaugeMonitor}
        savedSessions={savedSessions}
        savedLogs={savedLogs}
        savedFaultSequences={savedFaultSequences}
        onSaveFaultSequence={handleSaveFaultSequence}
        onDeleteFaultSequence={handleDeleteFaultSequence}
        faultSyncStatus={syncStatus}
        isCloudAuthenticated={Boolean(user)}
        localWorkstationSequenceCount={localWorkstationSequenceCount}
        onSyncFaultSequences={retryCloudSync}
        onPromoteLocalFaultSequences={handlePromoteLocalFaultSequences}
        onOpenVoiceMacroLibrary={() => setShowVoiceMacroLibrary(true)}
        manualRangeLabel={manualRangeLabel}
        onSetManualRangeLabel={setManualRangeLabel}
        twinSyncMode={twinSyncMode}
        onToggleTwinSyncMode={handleToggleTwinSyncMode}
      />

      <LabStatusFooter
        activeTab={activeTab}
        selectedPin={selectedPin}
        circuitSolution={circuitSolution}
        wires={wires}
        powerSupply={powerSupply}
        faults={faults}
        hasCanFault={hasCanFault}
        twinSyncMode={twinSyncMode}
        onToggleTwinSyncMode={handleToggleTwinSyncMode}
        showDiagnosticGuide={showDiagnosticGuide}
        diagnosticPanelMode={diagnosticPanelMode}
        onSelectDiagnosticPanel={handleSelectDiagnosticPanel}
        workflowMandatoryChecked={workflowMandatoryChecked}
        workflowMandatoryTotal={mandatoryWorkflowIds.length}
        logicCheckAlertCount={logicCheckSnapshot.criticalCount + logicCheckSnapshot.warningCount}
        isLogicCheckCritical={logicCheckSnapshot.overallStatus === 'CRITICAL'}
        onToggleDiagnosticGuide={() => setShowDiagnosticGuide((prev) => !prev)}
        isVoiceLogOpen={isVoiceLogOpen}
        onToggleVoiceLog={() => setIsVoiceLogOpen((prev) => !prev)}
        voiceLogCount={voiceLogCount}
        onQuickAttachRedProbe={handleQuickAttachRedProbe}
        onQuickAttachBlackProbe={handleQuickAttachBlackProbe}
        onOpenTwinView={() => setActiveTab('THREE_D_TWIN')}
        onRetryCloudSync={() => {
          setCloudSyncNotice(null);
          if (user?.uid) {
            void retryCloudSync().catch(() => {});
          }
        }}
      />

      {/* Introduction & Executive Credentials Modal */}
      {showIntroModal && (
        <AppErrorBoundary
          variant="modal"
          label="Lab Guide & Credentials"
          resetKey={`intro-${showIntroModal}`}
          onClose={() => setShowIntroModal(false)}
        >
          <Suspense fallback={null}>
            <IntroductionModal
              isOpen={showIntroModal}
              onClose={() => setShowIntroModal(false)}
              onNavigateTab={(tab) => {
                setActiveTab(tab);
                setShowIntroModal(false);
              }}
              onOpenWorkspaceSlides={() => {
                setShowIntroModal(false);
                handleOpenWorkspaceModal('SLIDES');
              }}
              onOpenLicenseModal={() => {
                setShowIntroModal(false);
                setShowLicenseModal(true);
              }}
            />
          </Suspense>
        </AppErrorBoundary>
      )}

      {/* Live Google Search Grounding Modal */}
      {showSearchModal && (
        <AppErrorBoundary
          variant="modal"
          label="Live OEM Grounded Search"
          resetKey={`search-${showSearchModal}-${groundedSearchQuery}`}
          onClose={() => setShowSearchModal(false)}
        >
          <Suspense fallback={null}>
            <GroundedSearchModal
              isOpen={showSearchModal}
              onClose={() => setShowSearchModal(false)}
              initialQuery={groundedSearchQuery}
              initialDtc={groundedSearchDtc}
              initialEcu={groundedSearchEcu}
            />
          </Suspense>
        </AppErrorBoundary>
      )}

      {/* Saved Bench Workspaces & Diagnostic Case Logs Modal */}
      {showCloudModal && (
        <AppErrorBoundary
          variant="modal"
          label="Saved Bench Sessions"
          resetKey={`cloud-${showCloudModal}-${activeSessionId || 'new'}`}
          onClose={() => setShowCloudModal(false)}
        >
          <Suspense fallback={null}>
            <BenchCloudModal
              isOpen={showCloudModal}
              onClose={() => setShowCloudModal(false)}
              powerSupply={powerSupply}
              wires={wires}
              faults={faults}
              components={components}
              activeDTCs={circuitSolution.activeDTCs}
              supplyCurrentDrawAmps={circuitSolution.supplyCurrentDrawAmps}
              selectedBrandKey={selectedBrandKey}
              selectedModelName={selectedModelName}
              selectedEcuProfileId={selectedEcuProfileId}
              rpmEmulator={rpmEmulator}
              gaugeMonitor={gaugeMonitor}
              multimeter={multimeter}
              checkedWorkflowIds={checkedWorkflowIds}
              preBenchGateLocked={workflowPrefs.preBenchGateLocked}
              activeSessionId={activeSessionId}
              onSessionSaved={(sessionId) => setActiveSessionId(sessionId)}
              onSessionDeleted={(sessionId) => {
                setActiveSessionId((prev) => (prev === sessionId ? null : prev));
              }}
              onLoadBenchSession={handleLoadBenchSession}
            />
          </Suspense>
        </AppErrorBoundary>
      )}

      {/* Local ECU Diagnostic Report Studio Modal */}
      {showDocsModal && (
        <AppErrorBoundary
          variant="modal"
          label="Diagnostic Report Studio"
          resetKey={`docs-${showDocsModal}`}
          onClose={() => setShowDocsModal(false)}
        >
          <Suspense fallback={null}>
            <GoogleDocsModal
              isOpen={showDocsModal}
              onClose={() => setShowDocsModal(false)}
              powerSupply={powerSupply}
              pins={pins}
              wires={wires}
              faults={faults}
              multimeter={multimeter}
              circuitSolution={circuitSolution}
              defaultVehicleLabel={`${selectedBrandKey} ${selectedModelName}`.trim() || 'Universal Automotive ECU Bench'}
              defaultEcuProfileLabel={
                selectedEcuProfileObj
                  ? `${selectedEcuProfileObj.brandName} ${selectedEcuProfileObj.modelName}`
                  : 'Universal ECU Bench'
              }
            />
          </Suspense>
        </AppErrorBoundary>
      )}

      {/* Local Bench Export Hub Modal */}
      {showWorkspaceModal && (
        <AppErrorBoundary
          variant="modal"
          label="Local Bench Export Hub"
          resetKey={`workspace-${showWorkspaceModal}-${workspaceInitialTab}`}
          onClose={() => setShowWorkspaceModal(false)}
        >
          <Suspense fallback={null}>
            <GoogleWorkspaceModal
              isOpen={showWorkspaceModal}
              initialTab={workspaceInitialTab}
              onClose={() => setShowWorkspaceModal(false)}
              powerSupply={powerSupply}
              pins={pins}
              components={components}
              wires={wires}
              faults={faults}
              multimeter={multimeter}
              circuitSolution={circuitSolution}
              selectedBrandKey={selectedBrandKey}
              selectedModelName={selectedModelName}
              selectedEcuProfileId={selectedEcuProfileId}
              rpmEmulator={rpmEmulator}
              gaugeMonitor={gaugeMonitor}
              checkedWorkflowIds={checkedWorkflowIds}
              preBenchGateLocked={workflowPrefs.preBenchGateLocked}
              voiceMacros={voiceMacros}
              onLoadBenchSnapshot={handleLoadDriveBenchSnapshot}
            />
          </Suspense>
        </AppErrorBoundary>
      )}

      {/* 100% Offline Diagnostic Chatbot Modal */}
      {hasOpenedOfflineBot && (
        <AppErrorBoundary
          variant="modal"
          label="Offline Diagnostic Assistant"
          resetKey={`offline-bot-${showOfflineBot}`}
          onClose={() => setShowOfflineBot(false)}
        >
          <Suspense fallback={null}>
            <OfflineAssistantModal
              isOpen={showOfflineBot}
              onClose={() => setShowOfflineBot(false)}
              liveContext={offlineBotLiveContext}
              savedLogs={savedLogs}
              savedSessions={savedSessions}
              initialPrompt={offlineBotPrompt}
              onClearInitialPrompt={() => setOfflineBotPrompt(null)}
              pins={pins}
              onSetVoltage={(volts) => {
                const clamped = Math.max(0, Math.min(32.0, Number(volts) || 0));
                handlePowerSupplyChange((prev) => ({
                  ...prev,
                  voltageSetting: parseFloat(clamped.toFixed(2)),
                  preset: 'CUSTOM',
                }));
              }}
              onResetLab={handleResetLab}
              onAttachProbeToPin={(pinId, label) => handleAttachProbe('red', pinId, label)}
              onAttachBlackProbeToPin={(pinId, label) => handleAttachProbe('black', pinId, label)}
              onChangeMultimeter={setMultimeter}
              onAddWire={handleAddWire}
              onToggleCutWire={handleToggleCutWire}
              onDeleteWire={handleDeleteWire}
              onAddFault={handleAddFault}
              onClearAllFaults={handleClearAllFaults}
              onSetPowerSupplyOutput={(enabled) =>
                handlePowerSupplyChange((prev) => ({ ...prev, isOutputEnabled: enabled }))
              }
              onNavigateTab={(tab, pinId) => {
                setActiveTab(tab);
                if (pinId) {
                  setSelectedPinId(pinId);
                }
              }}
            />
          </Suspense>
        </AppErrorBoundary>
      )}

      {/* Owner-Only Admin License Manager & Access Code Activation Modal */}
      {showLicenseModal && (
        <AppErrorBoundary
          variant="modal"
          label="License & Access Manager"
          resetKey={`license-${showLicenseModal}`}
          onClose={() => setShowLicenseModal(false)}
        >
          <Suspense fallback={null}>
            <AdminLicenseModal
              isOpen={showLicenseModal}
              onClose={() => setShowLicenseModal(false)}
            />
          </Suspense>
        </AppErrorBoundary>
      )}

      {/* Physical Bench Measurement & Evidence-Ranked Fault Isolation Modal */}
      {showPhysicalFaultModal && (
        <AppErrorBoundary
          variant="modal"
          label="ECU Repair Intelligence"
          resetKey={`phys-fault-${showPhysicalFaultModal}`}
          onClose={() => setShowPhysicalFaultModal(false)}
        >
          <Suspense fallback={null}>
            <PhysicalMeasurementFaultPanel
              isOpen={showPhysicalFaultModal}
              onClose={() => setShowPhysicalFaultModal(false)}
              defaultSupplyVoltageV={
                powerSupply.isOutputEnabled ? powerSupply.voltageSetting : 12.6
              }
            />
          </Suspense>
        </AppErrorBoundary>
      )}

      {/* PWA Installation & Offline Workstation Guide Modal */}
      {showPwaGuideModal && (
        <AppErrorBoundary
          variant="modal"
          label="PWA Installation Guide"
          resetKey={`pwa-guide-${showPwaGuideModal}`}
          onClose={() => setShowPwaGuideModal(false)}
        >
          <Suspense fallback={null}>
            <PWAInstallGuideModal
              isOpen={showPwaGuideModal}
              onClose={() => setShowPwaGuideModal(false)}
              pwa={pwa}
            />
          </Suspense>
        </AppErrorBoundary>
      )}

      {/* Gemini Diagnostic Intelligence Studio Modal (Chat, Transcribe, Maps, Video, Image, Live) */}
      {showGeminiStudio && (
        <AppErrorBoundary
          variant="modal"
          label="Gemini Diagnostic Intelligence Studio"
          resetKey={`gemini-studio-${showGeminiStudio}`}
          onClose={() => setShowGeminiStudio(false)}
        >
          <Suspense fallback={null}>
            <GeminiDiagnosticStudioModal
              isOpen={showGeminiStudio}
              onClose={() => setShowGeminiStudio(false)}
              initialTab={geminiStudioInitialTab}
              powerSupply={powerSupply}
              circuitSolution={circuitSolution}
              multimeter={multimeter}
              pins={pins}
            />
          </Suspense>
        </AppErrorBoundary>
      )}

      {/* Voice Macro Library & Live Bench Action Recorder */}
      <AppErrorBoundary
        variant="modal"
        label="Voice Macro Library"
        resetKey={`voice-macro-lib-${showVoiceMacroLibrary}`}
        onClose={() => setShowVoiceMacroLibrary(false)}
      >
        <VoiceMacroLibrary
          isOpen={showVoiceMacroLibrary}
          onOpen={() => setShowVoiceMacroLibrary(true)}
          onClose={() => setShowVoiceMacroLibrary(false)}
          pins={pins}
          powerSupply={powerSupply}
          onChangePowerSupply={handlePowerSupplyChange}
          multimeter={multimeter}
          onChangeMultimeter={setMultimeter}
          manualRangeLabel={manualRangeLabel}
          onSetManualRangeLabel={setManualRangeLabel}
          faults={faults}
          onAddFault={handleAddFault}
          onRemoveFault={handleRemoveFault}
          onClearAllFaults={handleClearAllFaults}
          wires={wires}
          onAddWire={handleAddWire}
          onToggleCutWire={handleToggleCutWire}
          onDeleteWire={handleDeleteWire}
          rpmEmulator={rpmEmulator}
          onChangeRpmEmulator={handleRpmEmulatorChange}
          onAttachProbe={handleAttachProbe}
          onResetLab={handleResetLab}
          onNavigateTab={setActiveTab}
        />
      </AppErrorBoundary>

      {/* Bulk ECU Pin Electrical Continuity & Batch Diagnostic Modal */}
      {showBatchPinModal && (
        <AppErrorBoundary
          variant="modal"
          label="Batch Pin Continuity Test"
          resetKey={`batch-pin-${showBatchPinModal}-${batchPinAutoRunNonce}`}
          onClose={() => setShowBatchPinModal(false)}
        >
          <Suspense fallback={null}>
            <BatchPinDiagnosticModal
              isOpen={showBatchPinModal}
              onClose={() => setShowBatchPinModal(false)}
              pins={pins}
              wires={wires}
              components={components}
              faults={faults}
              nodeVoltages={circuitSolution.nodeVoltages}
              powerSupply={powerSupply}
              selectedPinId={selectedPinId}
              selectedPinIds={batchSelectedPinIds}
              onChangeSelectedPinIds={setBatchSelectedPinIds}
              initialMode="CONTINUITY"
              autoRunOnOpen={true}
              autoRunNonce={batchPinAutoRunNonce}
              onAttachContinuityProbe={(pinId, label) => {
                setMultimeter((prev) => ({
                  ...prev,
                  isPowered: true,
                  mode: 'CONTINUITY',
                }));
                handleAttachProbe('red', pinId, label);
              }}
              onSelectPin={setSelectedPinId}
              onNavigateTab={(tab, pinId) => {
                setActiveTab(tab);
                if (pinId) {
                  setSelectedPinId(pinId);
                }
              }}
            />
          </Suspense>
        </AppErrorBoundary>
      )}
      {/* Controlled Help Drawer (opened from NavigationDrawer -> Gabay at Tulong) */}
      <FloatingHelpDrawer
        isOpen={showHelpDrawer}
        onClose={() => setShowHelpDrawer(false)}
        hideFab={true}
        lang={bilingualLang}
        onAskAssistant={handleOpenAiDiagnosticPanel}
      />

      {/* University Automotive Lab — 3-Tier Curriculum Matrix & Instructor QR/SHA-256 Verifier */}
      <CurriculumSelectorDrawer
        isOpen={showAcademyCurriculum}
        onClose={() => setShowAcademyCurriculum(false)}
        lang={bilingualLang}
        activeModuleId={activeAcademyModuleId}
        onStartLabExercise={handleStartAcademyExercise}
        onOpenInstructorVerifier={() => {
          setShowAcademyCurriculum(false);
          setShowInstructorVerifier(true);
        }}
      />

      <InstructorVerifierView
        isOpen={showInstructorVerifier}
        onClose={() => setShowInstructorVerifier(false)}
        lang={bilingualLang}
      />

      {/* Offline E-Wallet QR Subscription & Master Admin Offline PIN / QR Manager */}
      <SubscriptionPricingModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        lang={bilingualLang}
      />

      <AdminPinManagerModal
        isOpen={showAdminBillingModal}
        onClose={() => setShowAdminBillingModal(false)}
      />

      {/* Global Floating Corner Button for Voice Interaction & End-to-End Knowledge DB */}
      <FloatingVoiceKnowledgeFab
        isDrawerOpen={showUnifiedAiDrawer}
        lang={bilingualLang}
        onOpenDrawer={(subTab) => {
          setUnifiedAiSubTab(subTab);
          setShowUnifiedAiDrawer(true);
        }}
        onVoiceTranscript={handleTopBarVoiceTranscript}
      />

      {/* Unified AI Assistant Drawer (Voice Coach · Diagnostic Assistant · Knowledge DB) */}
      <UnifiedAiAssistantDrawer
        isOpen={showUnifiedAiDrawer}
        onClose={() => setShowUnifiedAiDrawer(false)}
        activeSubTab={unifiedAiSubTab}
        onChangeSubTab={setUnifiedAiSubTab}
        lang={bilingualLang}
        onChangeLang={setBilingualLang}
        telemetry={liveAiBenchContext.telemetry}
        benchSummaryText={liveAiBenchContext.summaryText}
        quickFillPrompt={liveAiBenchContext.quickFillPrompt}
        activeModuleId={activeAcademyModuleId}
        activeTab={activeTab}
        pins={pins}
        nodeVoltages={circuitSolution.nodeVoltages}
        incomingVoiceCommand={handsFreeIncomingCommand}
        onConsumedIncomingVoiceCommand={() => setHandsFreeIncomingCommand(null)}
        incomingDiagnosticTranscript={aiVoiceTranscript}
        onConsumedDiagnosticTranscript={() => setAiVoiceTranscript(null)}
        onNavigateTab={setActiveTab}
        onOpenModal={handleHandsFreeModalAction}
        onVoiceTranscript={handleTopBarVoiceTranscript}
        onBenchVoiceAction={handleBenchVoiceAction}
      />

      {/* Post-Verification Two-Phase Welcome & Creator Credentials Overlay */}
      <WelcomeBenchOverlay
        isOpen={showWelcomeOverlay}
        accessLabel={
          isAdminUnlocked
            ? 'Admin Master Session'
            : user
              ? 'Google Cloud Sync Session'
              : accessMode === 'TRIAL_ACTIVE'
                ? 'Verified 8-Digit Trial PIN'
                : 'Authorized Bench Session'
        }
        userEmail={user?.email ?? null}
        workstationId={getOrCreateWorkstationDeviceId()}
        onDismiss={() => {
          setShowWelcomeOverlay(false);
          onConsumeWelcomeOverlay?.();
        }}
      />
    </div>
  );
}

export default function App() {
  const { accessReady, isBenchEntryAuthorized } = useTrialAccess();
  const prevAuthorizedRef = useRef<boolean | null>(null);
  const [showWelcomeOnEntry, setShowWelcomeOnEntry] = useState(false);

  useEffect(() => {
    if (!accessReady) return;
    const params =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const isAutostart = params?.get('autostart') === '1';

    if (prevAuthorizedRef.current === false && isBenchEntryAuthorized && !isAutostart) {
      setShowWelcomeOnEntry(true);
    }
    if (!isBenchEntryAuthorized) {
      setShowWelcomeOnEntry(false);
    }
    prevAuthorizedRef.current = isBenchEntryAuthorized;
  }, [accessReady, isBenchEntryAuthorized]);

  if (!accessReady) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#060B14] text-[#EAF3FF] font-body">
        <div className="text-center space-y-2">
          <div className="font-hud text-lg font-bold tracking-wide text-[#EAF3FF]">
            AutoElectric Lab Pro
          </div>
          <p className="font-mono text-xs text-[#91A4BD]">
            Checking workstation PIN verification...
          </p>
        </div>
      </div>
    );
  }

  if (!isBenchEntryAuthorized) {
    return <IntroductionPinLandingPage />;
  }

  return (
    <AuthorizedBenchLabWorkspace
      initialShowWelcomeOverlay={showWelcomeOnEntry}
      onConsumeWelcomeOverlay={() => setShowWelcomeOnEntry(false)}
    />
  );
}
