import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BookmarkCheck,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Cpu,
  Crosshair,
  Database,
  FileText,
  Globe,
  History,
  Info,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  Trash2,
  Volume2,
  VolumeX,
  Wrench,
  X,
} from 'lucide-react';
import {
  PH_BATCH1_DOMAIN_DEFINITIONS,
  PH_BATCH2_DOMAIN_DEFINITIONS,
  PH_BATCH3_DOMAIN_DEFINITIONS,
  PH_BATCH4_DOMAIN_DEFINITIONS,
  PH_REFERENCE_ATTRIBUTION,
  splitDiagnosticSteps,
  type PhBatchFilter,
  type PhDomainNumber,
} from '../data/phTroubleScenarios520';
import {
  PH_BENCH_TROUBLE_SCENARIOS,
  type BenchTroubleScenario,
  type PhBenchTroubleScenario,
  type PhEmulationFidelity,
} from '../simulation/faults/benchTroubleScenarios';
import {
  TROUBLE_TRIAGE_PRESETS,
  findRelatedTroubleScenarios,
  formatScenarioClipboardText,
  getIndexedScenarioByPhId,
  loadFavoriteScenarioIds,
  loadRecentLookupIds,
  recordRecentLookupId,
  searchTroubleScenariosRanked,
  toggleFavoriteScenarioId,
  type TroubleTriagePresetId,
} from '../utils/troubleScenarioLookup';
import {
  AUTO_PLAY_STEP_DELAY_MS,
  computeScenarioStepProgress,
  evaluateScenarioVoiceCoach,
  filterVoiceTranscriptForScenario,
  formatScenarioTranscriptText,
  resolveAutoPlayNextStepIndex,
  stepScenarioIndex,
  type ScenarioVoiceCoachBenchState,
  type ScenarioVoiceGuidanceKind,
} from '../utils/troubleScenarioVoiceCoach';
import {
  offlineVoiceAssistant,
  type VoiceAssistantState,
  type VoiceCommandLogEntry,
  type VoiceCommandLogSource,
  type VoiceResultMetadata,
} from '../services/offlineVoiceService';
import { LOCAL_WORKSTATION_UID, saveDiagnosticLog } from '../services/benchStorageService';
import { RackCornerScrews } from './HardwareControls';
import { LabDrawerIcon } from './icons/LabDrawerIcons';

export interface ScenarioGuidanceTranscriptItem {
  id: string;
  timestamp: number;
  scenarioPhId: string;
  scenarioStepNumber?: number;
  guidanceKind: ScenarioVoiceGuidanceKind;
  rawTranscript: string;
  actionDescription: string;
  spokenReply: string;
  replayCount: number;
  lastReplayedAt?: number;
}

export interface TroubleScenariosLookupDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeScenarioId: string | null;
  initialQuery?: string;
  onEmulateScenario: (scenario: BenchTroubleScenario) => void;
  onFocusProbePin: (pinId: string, label: string, openScope?: boolean) => void;
  onLaunchGroundedSearch: (query?: string, dtc?: string, ecu?: string) => void;
  onOpenOfflineBot: (prompt?: string) => void;
  onOpenSavedBenches: () => void;
  onOpenEmulatorDrawer?: () => void;
  /** Live bench telemetry for step-by-step interactive voice coaching & DMM probe verification */
  benchState?: ScenarioVoiceCoachBenchState;
  /** Controlled selected PH-ID synchronized with LabWorkspaceLayout & global Voice Bar */
  selectedPhId?: string;
  onSelectPhIdChange?: (phId: string) => void;
  /** Controlled active step index (0-based) synchronized with global Voice Bar */
  activeVoiceStepIndex?: number;
  onActiveVoiceStepIndexChange?: (stepIndex: number) => void;
  /** Controlled completed diagnostic step indices (0-based) keyed by PH-ID */
  completedStepsByPhId?: Record<string, number[]>;
  onToggleStepCompleted?: (phId: string, stepIndex: number, forceCompleted?: boolean) => void;
  /** Global Offline AI Voice Guide state & command runner */
  voiceNavEnabled?: boolean;
  onToggleVoiceNav?: (next?: boolean) => void;
  onRunVoiceCommand?: (
    transcript: string,
    source?: VoiceCommandLogSource,
    meta?: VoiceResultMetadata
  ) => void;
}

const RESULTS_PAGE_SIZE = 30;

function stripScenarioIdPrefix(title: string, phId: string): string {
  const prefix = `${phId}: `;
  return title.startsWith(prefix) ? title.slice(prefix.length) : title;
}

function getFidelityMeta(fidelity: PhEmulationFidelity): {
  label: string;
  shortLabel: string;
  badgeClass: string;
  description: string;
} {
  switch (fidelity) {
    case 'DIRECT_16PIN_FAULT':
      return {
        label: 'Direct 16-Pin MNA Emulation',
        shortLabel: '16-Pin MNA',
        badgeClass: 'border-emerald-500/50 bg-emerald-950/50 text-emerald-300',
        description:
          'Directly injects matching electrical pin/supply/CKP fault into the 16-pin Modified Nodal Analysis circuit solver.',
      };
    case 'ELECTRICAL_PROXY':
      return {
        label: 'Bench Electrical Proxy',
        shortLabel: 'Electrical Proxy',
        badgeClass: 'border-[#3c4554] bg-[#1d222b] text-slate-200',
        description:
          'Models the electrical symptom using a safe 16-pin bench analog/bus proxy channel for signal & voltage-drop practice.',
      };
    case 'DIAGNOSTIC_REFERENCE_ONLY':
      return {
        label: 'Safe Reference Procedure Only',
        shortLabel: 'Reference Only',
        badgeClass: 'border-[#323a46] bg-[#0f1217] text-slate-300',
        description:
          'High-voltage, SRS/mechanical, thermal, or pre-purchase verification workflow. Clicking Emulate keeps PSU safely non-energized.',
      };
  }
}

export const TroubleScenariosLookupDrawer: React.FC<TroubleScenariosLookupDrawerProps> = ({
  isOpen,
  onClose,
  activeScenarioId,
  initialQuery,
  onEmulateScenario,
  onFocusProbePin,
  onLaunchGroundedSearch,
  onOpenOfflineBot,
  onOpenSavedBenches,
  onOpenEmulatorDrawer,
  benchState,
  selectedPhId: controlledSelectedPhId,
  onSelectPhIdChange,
  activeVoiceStepIndex: controlledVoiceStepIndex,
  onActiveVoiceStepIndexChange,
  completedStepsByPhId: controlledCompletedStepsByPhId,
  onToggleStepCompleted,
  voiceNavEnabled = false,
  onToggleVoiceNav,
  onRunVoiceCommand,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'ALL' | 'SAVED'>('ALL');
  const [query, setQuery] = useState(initialQuery ?? '');
  const [batchFilter, setBatchFilter] = useState<PhBatchFilter>('ALL');
  const [domainFilter, setDomainFilter] = useState<PhDomainNumber | 'ALL'>('ALL');
  const [fidelityFilter, setFidelityFilter] = useState<PhEmulationFidelity | 'ALL'>('ALL');
  const [triagePreset, setTriagePreset] = useState<TroubleTriagePresetId>('ALL');
  const [page, setPage] = useState(0);

  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => loadFavoriteScenarioIds());
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecentLookupIds());
  const [internalSelectedPhId, setInternalSelectedPhId] = useState<string>(() => {
    const recent = loadRecentLookupIds();
    return recent[0] || PH_BENCH_TROUBLE_SCENARIOS[0]?.phId || 'PH-001';
  });
  const selectedPhId = controlledSelectedPhId ?? internalSelectedPhId;
  const setSelectedPhId = useCallback(
    (nextPhId: string) => {
      setInternalSelectedPhId(nextPhId);
      onSelectPhIdChange?.(nextPhId);
    },
    [onSelectPhIdChange]
  );

  const [internalVoiceStepIndex, setInternalVoiceStepIndex] = useState(0);
  const activeVoiceStepIndex = controlledVoiceStepIndex ?? internalVoiceStepIndex;
  const setActiveVoiceStepIndex = useCallback(
    (nextIndex: number) => {
      setInternalVoiceStepIndex(nextIndex);
      onActiveVoiceStepIndexChange?.(nextIndex);
    },
    [onActiveVoiceStepIndexChange]
  );

  const [internalCompletedStepsByPhId, setInternalCompletedStepsByPhId] = useState<
    Record<string, number[]>
  >({});
  const completedStepsByPhId =
    controlledCompletedStepsByPhId ?? internalCompletedStepsByPhId;

  const setStepCompletedState = useCallback(
    (phId: string, stepIndex: number, forceCompleted?: boolean) => {
      const normalizedPh = phId.trim().toUpperCase();
      if (onToggleStepCompleted) {
        onToggleStepCompleted(normalizedPh, stepIndex, forceCompleted);
        return;
      }
      setInternalCompletedStepsByPhId((prev) => {
        const existing = prev[normalizedPh] ?? [];
        const isAlready = existing.includes(stepIndex);
        const shouldComplete =
          typeof forceCompleted === 'boolean' ? forceCompleted : !isAlready;
        if (shouldComplete) {
          if (isAlready) return prev;
          return {
            ...prev,
            [normalizedPh]: [...existing, stepIndex].sort((a, b) => a - b),
          };
        }
        if (!isAlready) return prev;
        return {
          ...prev,
          [normalizedPh]: existing.filter((idx) => idx !== stepIndex),
        };
      });
    },
    [onToggleStepCompleted]
  );

  const [autoSpeakOnStepChange, setAutoSpeakOnStepChange] = useState(true);
  const [autoPlayNextStep, setAutoPlayNextStep] = useState(true);
  const [pendingAutoPlayStep, setPendingAutoPlayStep] = useState<{
    phId: string;
    fromStepIndex: number;
    targetStepIndex: number;
  } | null>(null);
  const autoPlayTimerRef = useRef<number | null>(null);
  const lastLocalCompletedKeyRef = useRef<string | null>(null);
  const activeSelectedPhIdRef = useRef<string>(selectedPhId.trim().toUpperCase());
  const [voiceState, setVoiceState] = useState<VoiceAssistantState>(() =>
    offlineVoiceAssistant.getState()
  );
  const [voiceHistory, setVoiceHistory] = useState<VoiceCommandLogEntry[]>(() =>
    offlineVoiceAssistant.getCommandHistory()
  );
  /** Dedicated per-scenario drawer state tracking previously played voice guidance steps */
  const [guidanceTranscriptByPhId, setGuidanceTranscriptByPhId] = useState<
    Record<string, ScenarioGuidanceTranscriptItem[]>
  >({});
  const [activeReplayEntryId, setActiveReplayEntryId] = useState<string | null>(null);
  const [isStepChimeActive, setIsStepChimeActive] = useState(false);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(true);
  const [copiedTranscriptPhId, setCopiedTranscriptPhId] = useState<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const lastObservedChimeAtRef = useRef<number | null>(voiceState.lastStepCompleteChimeAt);

  const cancelPendingAutoPlay = useCallback(() => {
    if (autoPlayTimerRef.current !== null) {
      window.clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
    setPendingAutoPlayStep(null);
  }, []);

  useEffect(() => {
    activeSelectedPhIdRef.current = selectedPhId.trim().toUpperCase();
    cancelPendingAutoPlay();
  }, [selectedPhId, cancelPendingAutoPlay]);

  useEffect(() => {
    if (!isOpen || !autoPlayNextStep) {
      cancelPendingAutoPlay();
    }
  }, [isOpen, autoPlayNextStep, cancelPendingAutoPlay]);

  const copiedTranscriptTimerRef = useRef<number | null>(null);
  const copiedDossierTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (autoPlayTimerRef.current !== null) {
        window.clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
      if (copiedTranscriptTimerRef.current !== null) {
        window.clearTimeout(copiedTranscriptTimerRef.current);
        copiedTranscriptTimerRef.current = null;
      }
      if (copiedDossierTimerRef.current !== null) {
        window.clearTimeout(copiedDossierTimerRef.current);
        copiedDossierTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const unsubState = offlineVoiceAssistant.subscribe(setVoiceState);
    const unsubHistory = offlineVoiceAssistant.subscribeHistory(setVoiceHistory);
    return () => {
      unsubState();
      unsubHistory();
    };
  }, []);

  useEffect(() => {
    if (
      voiceState.lastStepCompleteChimeAt &&
      voiceState.lastStepCompleteChimeAt !== lastObservedChimeAtRef.current
    ) {
      lastObservedChimeAtRef.current = voiceState.lastStepCompleteChimeAt;
      setIsStepChimeActive(true);
      const timer = window.setTimeout(() => setIsStepChimeActive(false), 1800);
      return () => window.clearTimeout(timer);
    }
  }, [voiceState.lastStepCompleteChimeAt]);

  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [copiedPhId, setCopiedPhId] = useState<string | null>(null);
  const [savingCloudPhId, setSavingCloudPhId] = useState<string | null>(null);
  const [savedCloudPhIds, setSavedCloudPhIds] = useState<Record<string, boolean>>({});
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (initialQuery !== undefined && initialQuery !== '') {
      setQuery(initialQuery);
      const exactPh = initialQuery.trim().match(/^(PH-\d{3,4})$/i);
      if (exactPh) {
        const matched = getIndexedScenarioByPhId(exactPh[1].toUpperCase());
        if (matched) {
          setSelectedPhId(matched.phId);
          setActiveVoiceStepIndex(0);
          setMobileShowDetail(true);
        }
      }
    }
  }, [initialQuery, setSelectedPhId, setActiveVoiceStepIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (
        event.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const filteredScenarios = useMemo(() => {
    const results = searchTroubleScenariosRanked({
      query,
      batch: batchFilter,
      domain: domainFilter,
      fidelity: fidelityFilter,
      triagePreset,
      onlyBookmarkedIds: activeTab === 'SAVED' ? favoriteSet : undefined,
    });
    if (activeTab === 'SAVED' && query.trim() === '' && results.length > 1) {
      const orderIndex = new Map(favoriteIds.map((id, idx) => [id, idx]));
      return [...results].sort(
        (a, b) => (orderIndex.get(a.phId) ?? 99999) - (orderIndex.get(b.phId) ?? 99999)
      );
    }
    return results;
  }, [query, batchFilter, domainFilter, fidelityFilter, triagePreset, activeTab, favoriteSet, favoriteIds]);

  useEffect(() => {
    setPage(0);
  }, [query, batchFilter, domainFilter, fidelityFilter, triagePreset, activeTab]);

  const totalPages = Math.max(1, Math.ceil(filteredScenarios.length / RESULTS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visibleScenarios = useMemo(() => {
    const start = safePage * RESULTS_PAGE_SIZE;
    return filteredScenarios.slice(start, start + RESULTS_PAGE_SIZE);
  }, [filteredScenarios, safePage]);

  const selectedScenario = useMemo(() => {
    const exactMatch = filteredScenarios.find((s) => s.phId === selectedPhId);
    if (exactMatch) return exactMatch;
    if (activeTab === 'SAVED' && filteredScenarios.length === 0) return null;
    const globalMatch = getIndexedScenarioByPhId(selectedPhId);
    if (globalMatch && filteredScenarios.length === 0) return globalMatch;
    return filteredScenarios[0] ?? globalMatch ?? PH_BENCH_TROUBLE_SCENARIOS[0];
  }, [filteredScenarios, selectedPhId, activeTab]);

  const relatedScenarios = useMemo(
    () => (selectedScenario ? findRelatedTroubleScenarios(selectedScenario, 5) : []),
    [selectedScenario]
  );

  const handleSelectScenario = useCallback(
    (scenario: PhBenchTroubleScenario, openDetailOnMobile = true) => {
      setSelectedPhId(scenario.phId);
      setActiveVoiceStepIndex(0);
      setRecentIds((prev) => recordRecentLookupId(scenario.phId, prev));
      if (openDetailOnMobile) {
        setMobileShowDetail(true);
      }
      setActionFeedback(null);
    },
    [setSelectedPhId, setActiveVoiceStepIndex]
  );

  const voiceCoachEval = useMemo(() => {
    if (!selectedScenario) return null;
    return evaluateScenarioVoiceCoach(selectedScenario, activeVoiceStepIndex, {
      ...benchState,
      activeScenarioId,
    });
  }, [selectedScenario, activeVoiceStepIndex, benchState, activeScenarioId]);

  const appendScenarioTranscriptEntry = useCallback(
    (entry: VoiceCommandLogEntry, explicitPhId?: string) => {
      const normalizedPh = (explicitPhId ?? entry.scenarioPhId ?? '').trim().toUpperCase();
      if (!normalizedPh) return;
      setGuidanceTranscriptByPhId((prev) => {
        const current = prev[normalizedPh] ?? [];
        if (current.some((item) => item.id === entry.id)) return prev;
        const nextItem: ScenarioGuidanceTranscriptItem = {
          id: entry.id,
          timestamp: entry.timestamp,
          scenarioPhId: normalizedPh,
          scenarioStepNumber: entry.scenarioStepNumber,
          guidanceKind: entry.guidanceKind ?? 'STEP_GUIDANCE',
          rawTranscript: entry.rawTranscript,
          actionDescription: entry.actionDescription,
          spokenReply: entry.spokenReply,
          replayCount: 0,
        };
        return {
          ...prev,
          [normalizedPh]: [...current, nextItem].sort((a, b) => a.timestamp - b.timestamp),
        };
      });
    },
    []
  );

  // Sync any global voice bar commands targeting the active scenario into drawer transcript state
  useEffect(() => {
    if (!selectedScenario) return;
    const normalizedPh = selectedScenario.phId.trim().toUpperCase();
    const matchedFromService = filterVoiceTranscriptForScenario(voiceHistory, normalizedPh);
    if (matchedFromService.length === 0) return;

    setGuidanceTranscriptByPhId((prev) => {
      const existing = prev[normalizedPh] ?? [];
      const existingIds = new Set(existing.map((item) => item.id));
      const newlyObserved = matchedFromService
        .filter((entry) => !existingIds.has(entry.id))
        .map<ScenarioGuidanceTranscriptItem>((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp,
          scenarioPhId: normalizedPh,
          scenarioStepNumber: entry.scenarioStepNumber,
          guidanceKind: entry.guidanceKind ?? 'STEP_GUIDANCE',
          rawTranscript: entry.rawTranscript,
          actionDescription: entry.actionDescription,
          spokenReply: entry.spokenReply,
          replayCount: 0,
        }));
      if (newlyObserved.length === 0) return prev;
      return {
        ...prev,
        [normalizedPh]: [...existing, ...newlyObserved].sort(
          (a, b) => a.timestamp - b.timestamp
        ),
      };
    });
  }, [voiceHistory, selectedScenario]);

  const activeScenarioTranscript = useMemo(() => {
    if (!selectedScenario) return [];
    return guidanceTranscriptByPhId[selectedScenario.phId.trim().toUpperCase()] ?? [];
  }, [guidanceTranscriptByPhId, selectedScenario]);

  useEffect(() => {
    if (!isTranscriptExpanded || activeScenarioTranscript.length === 0) return;
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeScenarioTranscript.length, isTranscriptExpanded, selectedScenario?.phId]);

  const handleReplayTranscriptEntry = useCallback(
    (entry: ScenarioGuidanceTranscriptItem) => {
      const normalizedPh = entry.scenarioPhId.trim().toUpperCase();
      if (!voiceNavEnabled) {
        onToggleVoiceNav?.(true);
      }
      offlineVoiceAssistant.setAutoSpeak(true);
      offlineVoiceAssistant.speak(entry.spokenReply, true);
      setActiveReplayEntryId(entry.id);
      setGuidanceTranscriptByPhId((prev) => {
        const list = prev[normalizedPh];
        if (!list) return prev;
        return {
          ...prev,
          [normalizedPh]: list.map((item) =>
            item.id === entry.id
              ? {
                  ...item,
                  replayCount: item.replayCount + 1,
                  lastReplayedAt: Date.now(),
                }
              : item
          ),
        };
      });
    },
    [voiceNavEnabled, onToggleVoiceNav]
  );

  const handleClearActiveScenarioTranscript = useCallback(() => {
    if (!selectedScenario) return;
    const normalizedPh = selectedScenario.phId.trim().toUpperCase();
    setGuidanceTranscriptByPhId((prev) => {
      if (!prev[normalizedPh] || prev[normalizedPh].length === 0) return prev;
      const next = { ...prev };
      delete next[normalizedPh];
      return next;
    });
    setActiveReplayEntryId(null);
    offlineVoiceAssistant.clearScenarioHistory(normalizedPh);
  }, [selectedScenario]);

  const speakAndLogCoachMessage = useCallback(
    (
      actionLabel: string,
      spokenText: string,
      rawTranscript: string,
      source: VoiceCommandLogSource = 'QUICK_CHIP',
      meta?: {
        scenarioPhId?: string;
        scenarioStepNumber?: number;
        guidanceKind?: ScenarioVoiceGuidanceKind;
        queueSpeech?: boolean;
      }
    ) => {
      if (!voiceNavEnabled) {
        onToggleVoiceNav?.(true);
      }
      const targetPhId = (meta?.scenarioPhId ?? selectedScenario?.phId ?? '').trim().toUpperCase();
      offlineVoiceAssistant.setAutoSpeak(true);
      offlineVoiceAssistant.speak(spokenText, true, Boolean(meta?.queueSpeech));
      const logged = offlineVoiceAssistant.addCommandLog({
        source,
        rawTranscript,
        normalizedTranscript: rawTranscript.toLowerCase(),
        status: 'EXECUTED',
        category: 'DIAGNOSTIC',
        actionDescription: actionLabel,
        spokenReply: spokenText,
        scenarioPhId: targetPhId || undefined,
        scenarioStepNumber: meta?.scenarioStepNumber,
        guidanceKind: meta?.guidanceKind ?? 'STEP_GUIDANCE',
      });
      if (targetPhId) {
        appendScenarioTranscriptEntry(logged, targetPhId);
      }
    },
    [voiceNavEnabled, onToggleVoiceNav, selectedScenario?.phId, appendScenarioTranscriptEntry]
  );

  const handleSelectCoachStep = useCallback(
    (
      nextStepIdx: number,
      shouldSpeak = autoSpeakOnStepChange,
      options?: { fromAutoPlay?: boolean; queueSpeech?: boolean }
    ) => {
      if (!selectedScenario) return;
      if (!options?.fromAutoPlay) {
        cancelPendingAutoPlay();
      }
      const evalNext = evaluateScenarioVoiceCoach(selectedScenario, nextStepIdx, {
        ...benchState,
        activeScenarioId,
      });
      setActiveVoiceStepIndex(evalNext.stepIndex);
      if (shouldSpeak) {
        speakAndLogCoachMessage(
          `${selectedScenario.phId} Step ${evalNext.stepIndex + 1}/${evalNext.totalSteps}`,
          evalNext.spokenStepGuidance,
          options?.fromAutoPlay
            ? `auto-play step ${evalNext.stepIndex + 1}`
            : `read step ${evalNext.stepIndex + 1}`,
          'QUICK_CHIP',
          {
            scenarioPhId: selectedScenario.phId,
            scenarioStepNumber: evalNext.stepIndex + 1,
            guidanceKind: 'STEP_GUIDANCE',
            queueSpeech: options?.queueSpeech,
          }
        );
      }
    },
    [
      selectedScenario,
      cancelPendingAutoPlay,
      benchState,
      activeScenarioId,
      setActiveVoiceStepIndex,
      autoSpeakOnStepChange,
      speakAndLogCoachMessage,
    ]
  );

  const handleSelectCoachStepRef = useRef(handleSelectCoachStep);
  handleSelectCoachStepRef.current = handleSelectCoachStep;
  const autoSpeakOnStepChangeRef = useRef(autoSpeakOnStepChange);
  autoSpeakOnStepChangeRef.current = autoSpeakOnStepChange;

  const scheduleAutoPlayNextStep = useCallback(
    (
      phId: string,
      completedStepIndex: number,
      completedIndicesAfterMark: readonly number[],
      totalSteps: number
    ): number | null => {
      cancelPendingAutoPlay();
      if (!autoPlayNextStep) return null;
      const normalizedPh = phId.trim().toUpperCase();
      const targetStepIndex = resolveAutoPlayNextStepIndex(
        completedStepIndex,
        completedIndicesAfterMark,
        totalSteps
      );
      if (targetStepIndex === null) return null;

      setPendingAutoPlayStep({
        phId: normalizedPh,
        fromStepIndex: completedStepIndex,
        targetStepIndex,
      });

      autoPlayTimerRef.current = window.setTimeout(() => {
        autoPlayTimerRef.current = null;
        setPendingAutoPlayStep(null);
        if (activeSelectedPhIdRef.current !== normalizedPh) return;
        handleSelectCoachStepRef.current(
          targetStepIndex,
          autoSpeakOnStepChangeRef.current,
          { fromAutoPlay: true, queueSpeech: true }
        );
        setActionFeedback(
          `Auto-Play advanced ${normalizedPh} to Step ${targetStepIndex + 1}/${totalSteps}.`
        );
      }, AUTO_PLAY_STEP_DELAY_MS);

      return targetStepIndex;
    },
    [autoPlayNextStep, cancelPendingAutoPlay]
  );

  // Sync external step completions (e.g., global Voice Bar "Mark step complete") with Auto-Play
  const prevExternalCompletedRef = useRef<{ phId: string; indices: number[] }>({
    phId: selectedPhId.trim().toUpperCase(),
    indices: completedStepsByPhId[selectedPhId.trim().toUpperCase()] ?? [],
  });

  useEffect(() => {
    const normalizedPh = (selectedScenario?.phId ?? selectedPhId).trim().toUpperCase();
    const currentIndices = completedStepsByPhId[normalizedPh] ?? [];
    const prev = prevExternalCompletedRef.current;

    if (prev.phId !== normalizedPh) {
      prevExternalCompletedRef.current = { phId: normalizedPh, indices: currentIndices };
      return;
    }

    const newlyCompleted = currentIndices.filter((idx) => !prev.indices.includes(idx));
    prevExternalCompletedRef.current = { phId: normalizedPh, indices: currentIndices };

    if (!isOpen || !autoPlayNextStep || !selectedScenario || newlyCompleted.length !== 1) {
      return;
    }

    const addedIdx = newlyCompleted[0];
    const completionKey = `${normalizedPh}:${addedIdx}`;
    if (lastLocalCompletedKeyRef.current === completionKey) {
      lastLocalCompletedKeyRef.current = null;
      return;
    }

    const steps = splitDiagnosticSteps(selectedScenario.diagnosticSteps);
    scheduleAutoPlayNextStep(normalizedPh, addedIdx, currentIndices, Math.max(1, steps.length));
  }, [
    isOpen,
    autoPlayNextStep,
    selectedScenario,
    selectedPhId,
    completedStepsByPhId,
    scheduleAutoPlayNextStep,
  ]);

  const handleCycleCoachStep = useCallback(
    (delta: -1 | 1) => {
      if (!selectedScenario || !voiceCoachEval) return;
      const targetIndex = stepScenarioIndex(
        voiceCoachEval.stepIndex,
        delta,
        voiceCoachEval.totalSteps
      );
      if (targetIndex === voiceCoachEval.stepIndex) return;
      handleSelectCoachStep(targetIndex, autoSpeakOnStepChange);
    },
    [selectedScenario, voiceCoachEval, handleSelectCoachStep, autoSpeakOnStepChange]
  );

  const handleToggleStepCompletionWithAudio = useCallback(
    (stepIndex: number) => {
      if (!selectedScenario) return;
      const phId = selectedScenario.phId.toUpperCase();
      const steps = splitDiagnosticSteps(selectedScenario.diagnosticSteps);
      const totalSteps = Math.max(1, steps.length);
      const safeIdx = Math.max(0, Math.min(stepIndex, totalSteps - 1));
      const existingCompleted = completedStepsByPhId[phId] ?? [];
      const isAlreadyCompleted = existingCompleted.includes(safeIdx);

      if (isAlreadyCompleted) {
        cancelPendingAutoPlay();
        setStepCompletedState(phId, safeIdx, false);
        setActionFeedback(
          `${phId} Step ${safeIdx + 1}/${totalSteps} unmarked (set back to pending).`
        );
        return;
      }

      lastLocalCompletedKeyRef.current = `${phId}:${safeIdx}`;
      setStepCompletedState(phId, safeIdx, true);
      setActiveVoiceStepIndex(safeIdx);

      const nextCompletedArray = Array.from(new Set([...existingCompleted, safeIdx])).sort(
        (a, b) => a - b
      );
      const allCompleted = nextCompletedArray.length >= totalSteps;
      const autoPlayTargetIdx = autoPlayNextStep
        ? resolveAutoPlayNextStepIndex(safeIdx, nextCompletedArray, totalSteps)
        : null;
      const fallbackIncompleteIdx = resolveAutoPlayNextStepIndex(
        safeIdx,
        nextCompletedArray,
        totalSteps
      );

      if (!voiceNavEnabled) {
        onToggleVoiceNav?.(true);
      }
      offlineVoiceAssistant.setAutoSpeak(true);

      const willSpeakAutoPlayNext =
        autoPlayTargetIdx !== null && autoSpeakOnStepChange;

      const confirmation = offlineVoiceAssistant.confirmStepCompleted({
        phId,
        stepNumber: safeIdx + 1,
        totalSteps,
        stepText: steps[safeIdx] || `Step ${safeIdx + 1}`,
        allCompleted,
        // Avoid duplicating next step readout when Auto-Play will speak Step N+1 after the 1s chime delay
        nextStepNumber:
          !willSpeakAutoPlayNext && fallbackIncompleteIdx !== null
            ? fallbackIncompleteIdx + 1
            : undefined,
        nextStepText:
          !willSpeakAutoPlayNext && fallbackIncompleteIdx !== null
            ? steps[fallbackIncompleteIdx]
            : undefined,
        dmmReadingText: voiceCoachEval?.dmmReadingText,
        source: 'QUICK_CHIP',
        rawTranscript: `mark ${phId} step ${safeIdx + 1} complete`,
        recordLog: true,
      });
      if (confirmation.logEntry) {
        appendScenarioTranscriptEntry(confirmation.logEntry, phId);
      }

      const scheduledTarget = scheduleAutoPlayNextStep(
        phId,
        safeIdx,
        nextCompletedArray,
        totalSteps
      );

      setActionFeedback(
        scheduledTarget !== null
          ? `${confirmation.actionDescription} · Chime played — Auto-Play advancing to Step ${scheduledTarget + 1} in 1s.`
          : `${confirmation.actionDescription} · 'Step Complete' chime & voice confirmation played.`
      );
    },
    [
      selectedScenario,
      completedStepsByPhId,
      cancelPendingAutoPlay,
      setStepCompletedState,
      setActiveVoiceStepIndex,
      autoPlayNextStep,
      autoSpeakOnStepChange,
      voiceNavEnabled,
      onToggleVoiceNav,
      voiceCoachEval?.dmmReadingText,
      appendScenarioTranscriptEntry,
      scheduleAutoPlayNextStep,
    ]
  );

  const handleVerifyCurrentStepWithVoice = useCallback(() => {
    if (!selectedScenario || !voiceCoachEval) return;
    const phId = selectedScenario.phId.toUpperCase();
    const existingCompleted = completedStepsByPhId[phId] ?? [];
    let spokenText = voiceCoachEval.spokenVerificationReply;
    let scheduledAutoPlayTarget: number | null = null;

    if (voiceCoachEval.isStepVerified) {
      const wasAlreadyCompleted = existingCompleted.includes(voiceCoachEval.stepIndex);
      const nextCompletedArray = wasAlreadyCompleted
        ? existingCompleted
        : [...existingCompleted, voiceCoachEval.stepIndex].sort((a, b) => a - b);
      if (!wasAlreadyCompleted) {
        lastLocalCompletedKeyRef.current = `${phId}:${voiceCoachEval.stepIndex}`;
      }
      setStepCompletedState(phId, voiceCoachEval.stepIndex, true);
      offlineVoiceAssistant.playStepCompleteChime(
        nextCompletedArray.length >= voiceCoachEval.totalSteps
      );
      spokenText = `${voiceCoachEval.spokenVerificationReply} Step ${voiceCoachEval.stepIndex + 1} marked complete.`;
      if (!wasAlreadyCompleted) {
        scheduledAutoPlayTarget = scheduleAutoPlayNextStep(
          phId,
          voiceCoachEval.stepIndex,
          nextCompletedArray,
          voiceCoachEval.totalSteps
        );
      }
    }
    setActionFeedback(
      scheduledAutoPlayTarget !== null
        ? `${voiceCoachEval.verdictBadgeLabel}: Step ${voiceCoachEval.stepIndex + 1} complete — Auto-Play advancing to Step ${scheduledAutoPlayTarget + 1} in 1s.`
        : `${voiceCoachEval.verdictBadgeLabel}: ${voiceCoachEval.coachingHeadline}`
    );
    speakAndLogCoachMessage(
      `${selectedScenario.phId} Step ${voiceCoachEval.stepIndex + 1} Verification (${voiceCoachEval.verdictBadgeLabel})`,
      spokenText,
      'verify current step',
      'QUICK_CHIP',
      {
        scenarioPhId: selectedScenario.phId,
        scenarioStepNumber: voiceCoachEval.stepIndex + 1,
        guidanceKind: 'VERIFICATION',
      }
    );
  }, [
    selectedScenario,
    voiceCoachEval,
    completedStepsByPhId,
    setStepCompletedState,
    scheduleAutoPlayNextStep,
    speakAndLogCoachMessage,
  ]);

  const handleSpeakFullOverview = useCallback(() => {
    if (!selectedScenario || !voiceCoachEval) return;
    speakAndLogCoachMessage(
      `${selectedScenario.phId} Full Voice Briefing`,
      voiceCoachEval.spokenScenarioOverview,
      `diagnose ${selectedScenario.phId}`,
      'QUICK_CHIP',
      {
        scenarioPhId: selectedScenario.phId,
        scenarioStepNumber: voiceCoachEval.stepIndex + 1,
        guidanceKind: 'BRIEFING',
      }
    );
  }, [selectedScenario, voiceCoachEval, speakAndLogCoachMessage]);

  const handleCopyScenarioTranscript = useCallback(async () => {
    if (!selectedScenario) return;
    const text = formatScenarioTranscriptText(
      selectedScenario.phId,
      stripScenarioIdPrefix(selectedScenario.title, selectedScenario.phId),
      activeScenarioTranscript
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTranscriptPhId(selectedScenario.phId);
      if (copiedTranscriptTimerRef.current !== null) {
        window.clearTimeout(copiedTranscriptTimerRef.current);
      }
      copiedTranscriptTimerRef.current = window.setTimeout(() => {
        copiedTranscriptTimerRef.current = null;
        setCopiedTranscriptPhId(null);
      }, 1800);
    } catch {
      setActionFeedback('Clipboard unavailable in this browser context.');
    }
  }, [selectedScenario, activeScenarioTranscript]);

  const handleDrawerVoiceMic = useCallback(() => {
    if (!voiceNavEnabled) {
      onToggleVoiceNav?.(true);
    }
    offlineVoiceAssistant.setAutoSpeak(true);
    if (voiceState.isListening) {
      offlineVoiceAssistant.stopListening();
      return;
    }
    if (!voiceState.hasSpeechRecognition) {
      setActionFeedback(
        'Browser microphone SpeechRecognition is unavailable; use the interactive Voice Coach buttons below.'
      );
      return;
    }
    offlineVoiceAssistant.startListening(
      (spokenText, meta) => {
        if (onRunVoiceCommand) {
          onRunVoiceCommand(spokenText, 'SPEECH_API', meta);
        }
      },
      { continuous: voiceState.continuousMode }
    );
  }, [
    voiceNavEnabled,
    onToggleVoiceNav,
    voiceState.isListening,
    voiceState.hasSpeechRecognition,
    voiceState.continuousMode,
    onRunVoiceCommand,
  ]);

  const handleToggleFavorite = useCallback((phId: string, showToast = false) => {
    setFavoriteIds((prev) => {
      const wasSaved = prev.includes(phId);
      const next = toggleFavoriteScenarioId(phId, prev);
      if (showToast) {
        setActionFeedback(
          wasSaved
            ? `Removed ${phId} from Saved Scenarios.`
            : `Bookmarked ${phId} to Saved Scenarios tab.`
        );
      }
      return next;
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setQuery('');
    setBatchFilter('ALL');
    setDomainFilter('ALL');
    setFidelityFilter('ALL');
    setTriagePreset('ALL');
    setPage(0);
  }, []);

  const handleCopyDossier = useCallback(async (scenario: PhBenchTroubleScenario) => {
    const text = formatScenarioClipboardText(scenario);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPhId(scenario.phId);
      setActionFeedback(`Copied ${scenario.phId} engineering summary to clipboard.`);
      if (copiedDossierTimerRef.current !== null) {
        window.clearTimeout(copiedDossierTimerRef.current);
      }
      copiedDossierTimerRef.current = window.setTimeout(() => {
        copiedDossierTimerRef.current = null;
        setCopiedPhId((prev) => (prev === scenario.phId ? null : prev));
      }, 2000);
    } catch {
      setActionFeedback('Clipboard unavailable in this browser context.');
    }
  }, []);

  const handleSaveToCloud = useCallback(
    async (scenario: PhBenchTroubleScenario) => {
      setSavingCloudPhId(scenario.phId);
      setActionFeedback(null);
      const dtcLabel = scenario.relatedDtcs.length > 0 ? scenario.relatedDtcs.join(', ') : 'Reference';
      try {
        await saveDiagnosticLog(LOCAL_WORKSTATION_UID, {
          title: `${scenario.phId} (${dtcLabel}) — ${stripScenarioIdPrefix(scenario.title, scenario.phId)}`,
          dtcCode: dtcLabel,
          ecuModel: scenario.phContext,
          sourceType: 'BENCH_SNAPSHOT',
          summary: [
            `Domain ${scenario.domainNumber}: ${scenario.domainName} (PDF p.${scenario.sourcePage} · ${scenario.provenanceStatus})`,
            `PH Context: ${scenario.phContext}`,
            `Symptoms: ${scenario.symptoms}`,
            `Diagnostic Steps: ${scenario.diagnosticSteps}`,
            `16-Pin Bench Mapping (${scenario.emulationFidelity}): ${scenario.emulationNote}`,
          ].join('\n'),
        });
        setSavedCloudPhIds((prev) => ({ ...prev, [scenario.phId]: true }));
        setActionFeedback(`Saved ${scenario.phId} to Local Diagnostic Logs.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Local log save failed';
        setActionFeedback(`Save failed: ${msg}`);
      } finally {
        setSavingCloudPhId(null);
      }
    },
    []
  );

  if (!isOpen) return null;

  const hasActiveFilters =
    query.trim().length > 0 ||
    batchFilter !== 'ALL' ||
    domainFilter !== 'ALL' ||
    fidelityFilter !== 'ALL' ||
    triagePreset !== 'ALL';

  const selectedFidelity = selectedScenario
    ? getFidelityMeta(selectedScenario.emulationFidelity)
    : null;
  const selectedSteps = selectedScenario
    ? splitDiagnosticSteps(selectedScenario.diagnosticSteps)
    : [];
  const isSelectedActiveOnBench = Boolean(
    selectedScenario && activeScenarioId === selectedScenario.id
  );
  const isSelectedFavorite = Boolean(selectedScenario && favoriteSet.has(selectedScenario.phId));

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="lookup-drawer-title"
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full w-full max-w-[1060px] flex-col border-l border-[#3c4554] bg-[#0c0e12] text-slate-100 shadow-2xl"
      >
        {/* Top Drawer Bar */}
        <header className="relative flex shrink-0 flex-wrap items-center justify-between gap-2 hud-header px-4 py-3 sm:px-5">
          <RackCornerScrews />
          <div className="min-w-0 flex-1 pl-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-[2px] border border-[#3c4554] bg-[#090b0f] p-0.5">
                <LabDrawerIcon name="server-drawer" size={24} className="h-5 w-5" />
              </span>
              <h2
                id="lookup-drawer-title"
                className="font-hud text-sm font-bold uppercase tracking-wider text-slate-100 sm:text-base"
              >
                Trouble Scenarios Lookup
              </h2>
              <span className="inline-flex items-center gap-1 rounded-[2px] border border-[#2b313c] bg-[#090b0f] px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-amber-300 tabular-nums">
                <LabDrawerIcon name="split-drawer" size={24} className="h-3.5 w-3.5" />
                <span>{PH_BENCH_TROUBLE_SCENARIOS.length.toLocaleString()} Scenarios · 48 Domains</span>
              </span>
              <span className="hidden sm:inline rounded-[2px] border border-[#384150] bg-[#171b22] px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase text-slate-300">
                {PH_REFERENCE_ATTRIBUTION.provenanceStatus}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-slate-400">
              Standalone PH diagnostic search, DTC cross-reference &amp; bench workflow bridge (Batches 1–4 · PH-001 to PH-2080). Press <kbd className="rounded border border-[#384150] bg-[#090b0f] px-1 text-[9.5px] text-amber-300">/</kbd> to search.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 pr-1">
            {onOpenEmulatorDrawer && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenEmulatorDrawer();
                }}
                className="hw-btn inline-flex min-h-[34px] items-center gap-1.5 rounded-[2px] border-amber-500/50 bg-amber-950/35 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-amber-200 hover:bg-amber-900/45 cursor-pointer"
                title="Switch to the live 16-pin MNA Trouble Scenario Emulator drawer"
              >
                <LabDrawerIcon name="trouble-drawer" size={24} className="h-4 w-4 shrink-0" />
                <span className="hidden xs:inline">Live Emulator</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close trouble scenarios lookup drawer"
              className="hw-btn inline-flex h-[34px] w-[34px] items-center justify-center rounded-[2px] text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Primary Drawer Views: All Scenarios vs Saved Scenarios */}
        <nav
          aria-label="Trouble scenario drawer sections"
          className="flex shrink-0 items-center justify-between gap-2 border-b border-[#2b313c] bg-[#111419] px-3.5 sm:px-5"
        >
          <div role="tablist" aria-label="Scenario catalog tabs" className="flex items-center gap-1 pt-1.5">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'ALL'}
              onClick={() => {
                setActiveTab('ALL');
                setMobileShowDetail(false);
              }}
              className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide transition cursor-pointer ${
                activeTab === 'ALL'
                  ? 'border-amber-400 bg-[#1c212b] text-slate-100 rounded-t-[2px]'
                  : 'border-transparent text-slate-400 hover:bg-[#171b22] hover:text-slate-200'
              }`}
            >
              <LabDrawerIcon name="server-drawer" size={24} className="h-4 w-4 shrink-0" />
              <span>All Scenarios</span>
              <span className="rounded-[2px] border border-[#2b313c] bg-[#090b0f] px-1.5 py-px text-[9.5px] tabular-nums text-amber-300">
                {PH_BENCH_TROUBLE_SCENARIOS.length.toLocaleString()}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'SAVED'}
              onClick={() => {
                setActiveTab('SAVED');
                setMobileShowDetail(false);
              }}
              className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide transition cursor-pointer ${
                activeTab === 'SAVED'
                  ? 'border-amber-400 bg-[#211b13] text-amber-200 rounded-t-[2px]'
                  : 'border-transparent text-slate-400 hover:bg-[#171b22] hover:text-amber-200'
              }`}
            >
              <Star
                className={`h-3.5 w-3.5 shrink-0 ${
                  favoriteIds.length > 0 ? 'fill-amber-400 text-amber-300' : 'text-amber-400'
                }`}
                aria-hidden="true"
              />
              <span>Saved Scenarios</span>
              <span
                className={`rounded-[2px] border px-1.5 py-px text-[9.5px] tabular-nums ${
                  favoriteIds.length > 0
                    ? 'border-amber-500/60 bg-amber-950/65 text-amber-200'
                    : 'border-[#2b313c] bg-[#090b0f] text-slate-400'
                }`}
              >
                {favoriteIds.length}
              </span>
            </button>
          </div>
        </nav>

        {/* Search + Triage Presets + Filter Toolbar */}
        <section
          aria-label="Scenario lookup filters"
          className="shrink-0 space-y-2 border-b border-[#2b313c] bg-[#13161c] px-3.5 py-2.5 sm:px-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-amber-400"
                aria-hidden="true"
              />
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  activeTab === 'SAVED'
                    ? 'Filter your Saved Scenarios by PH ID, DTC, vehicle, or fault...'
                    : 'Search PH-001, PH-1853, P0335, U0073, Vios, Hilux, KL30, flood, no pulse...'
                }
                aria-label="Search 2,080 trouble scenarios by PH ID, DTC, vehicle, or symptom"
                className="w-full rounded-[2px] border border-[#2b313c] bg-[#090b0f] py-1.5 pl-8 pr-8 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search query"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="hw-btn inline-flex min-h-[34px] items-center gap-1 rounded-[2px] px-2.5 py-1 font-mono text-[10.5px] text-slate-300 hover:text-white cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* Field Triage Presets Strip */}
          <div
            role="tablist"
            aria-label="Field symptom triage presets"
            className="flex items-center gap-1 overflow-x-auto pb-0.5 font-mono text-[10px]"
          >
            {TROUBLE_TRIAGE_PRESETS.map((preset) => {
              const active = triagePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setTriagePreset(preset.id);
                    setMobileShowDetail(false);
                  }}
                  title={preset.description}
                  className={`hw-btn shrink-0 whitespace-nowrap rounded-[2px] px-2.5 py-1 font-semibold cursor-pointer ${
                    active
                      ? 'hw-btn-amber text-amber-200 font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {preset.shortLabel}
                </button>
              );
            })}
          </div>

          {/* Batch + Domain + Fidelity Controls */}
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-12">
            <div className="flex flex-wrap items-center gap-1 font-mono text-[10px] sm:col-span-5">
              {(
                [
                  { id: 'ALL', label: 'All (2,080)' },
                  { id: 'BATCH_1', label: 'B1' },
                  { id: 'BATCH_2', label: 'B2' },
                  { id: 'BATCH_3', label: 'B3' },
                  { id: 'BATCH_4', label: 'B4' },
                ] as const
              ).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setBatchFilter(b.id);
                    setDomainFilter('ALL');
                  }}
                  className={`hw-btn rounded-[2px] px-2 py-1 font-bold cursor-pointer ${
                    batchFilter === b.id
                      ? 'hw-btn-amber text-amber-200'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <div className="sm:col-span-4">
              <select
                aria-label="Filter lookup by 48 PH system domains"
                value={domainFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setDomainFilter(val === 'ALL' ? 'ALL' : (Number(val) as PhDomainNumber));
                  setMobileShowDetail(false);
                }}
                className="w-full rounded-[2px] border border-[#2b313c] bg-[#090b0f] px-2 py-1.5 font-mono text-[10.5px] text-slate-200 focus:border-amber-400 focus:outline-none"
              >
                <option value="ALL">All 48 Diagnostic Domains</option>
                {(batchFilter === 'ALL' || batchFilter === 'BATCH_1') && (
                  <optgroup label="Batch 1 · Domains 1–12 (PH-001–PH-520)">
                    {PH_BATCH1_DOMAIN_DEFINITIONS.map((d) => (
                      <option key={d.domainNumber} value={d.domainNumber}>
                        {d.domainNumber}. {d.name} ({d.expectedCount})
                      </option>
                    ))}
                  </optgroup>
                )}
                {(batchFilter === 'ALL' || batchFilter === 'BATCH_2') && (
                  <optgroup label="Batch 2 · Domains 13–24 (PH-521–PH-1040)">
                    {PH_BATCH2_DOMAIN_DEFINITIONS.map((d) => (
                      <option key={d.domainNumber} value={d.domainNumber}>
                        {d.domainNumber}. {d.name} ({d.expectedCount})
                      </option>
                    ))}
                  </optgroup>
                )}
                {(batchFilter === 'ALL' || batchFilter === 'BATCH_3') && (
                  <optgroup label="Batch 3 · Domains 25–36 (PH-1041–PH-1560)">
                    {PH_BATCH3_DOMAIN_DEFINITIONS.map((d) => (
                      <option key={d.domainNumber} value={d.domainNumber}>
                        {d.domainNumber}. {d.name} ({d.expectedCount})
                      </option>
                    ))}
                  </optgroup>
                )}
                {(batchFilter === 'ALL' || batchFilter === 'BATCH_4') && (
                  <optgroup label="Batch 4 · Domains 37–48 (PH-1561–PH-2080)">
                    {PH_BATCH4_DOMAIN_DEFINITIONS.map((d) => (
                      <option key={d.domainNumber} value={d.domainNumber}>
                        {d.domainNumber}. {d.name} ({d.expectedCount})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div className="sm:col-span-3">
              <select
                aria-label="Filter lookup by bench emulation mode"
                value={fidelityFilter}
                onChange={(e) => {
                  setFidelityFilter(e.target.value as PhEmulationFidelity | 'ALL');
                  setMobileShowDetail(false);
                }}
                className="w-full rounded-[2px] border border-[#2b313c] bg-[#090b0f] px-2 py-1.5 font-mono text-[10.5px] text-amber-200 focus:border-amber-400 focus:outline-none"
              >
                <option value="ALL">All Emulation Modes</option>
                <option value="DIRECT_16PIN_FAULT">Direct 16-Pin MNA</option>
                <option value="ELECTRICAL_PROXY">Electrical Proxy</option>
                <option value="DIAGNOSTIC_REFERENCE_ONLY">Reference Only (Safe)</option>
              </select>
            </div>
          </div>

          {/* Quick Jump Strip: Recent & Saved */}
          {(recentIds.length > 0 || favoriteIds.length > 0) && (
            <div className="flex items-center gap-1.5 overflow-x-auto pt-0.5 font-mono text-[9.5px]">
              <span className="inline-flex shrink-0 items-center gap-1 text-slate-400 uppercase">
                <History className="h-3 w-3 text-amber-400" aria-hidden="true" />
                Recent:
              </span>
              {recentIds.slice(0, 6).map((phId) => {
                const sc = getIndexedScenarioByPhId(phId);
                if (!sc) return null;
                const active = selectedScenario?.phId === phId;
                return (
                  <button
                    key={phId}
                    type="button"
                    onClick={() => handleSelectScenario(sc, true)}
                    title={sc.title}
                    className={`hw-btn shrink-0 rounded-[2px] px-1.5 py-0.5 cursor-pointer ${
                      active
                        ? 'hw-btn-amber text-amber-200 font-bold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {phId}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Split Master-Detail Body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-12">
          {/* Left Master List */}
          <section
            aria-label="Matching trouble scenarios list"
            className={`min-h-0 flex-col border-r border-[#2b313c] bg-[#0c0e12] md:col-span-5 ${
              mobileShowDetail ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* Match Count + Pagination Header */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#242a34] bg-[#111419] px-3 py-2 font-mono text-[10px] text-slate-300">
              <span>
                {filteredScenarios.length === 0
                  ? '0 matches'
                  : `${safePage * RESULTS_PAGE_SIZE + 1}–${Math.min(
                      (safePage + 1) * RESULTS_PAGE_SIZE,
                      filteredScenarios.length
                    )} of `}
                <strong className="text-amber-300">{filteredScenarios.length.toLocaleString()}</strong>
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="hw-btn inline-flex items-center rounded-[2px] px-1.5 py-0.5 disabled:opacity-40 cursor-pointer"
                  aria-label="Previous lookup results page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="px-1 text-slate-400">
                  {safePage + 1}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  className="hw-btn inline-flex items-center rounded-[2px] px-1.5 py-0.5 disabled:opacity-40 cursor-pointer"
                  aria-label="Next lookup results page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Results Scroll List */}
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
              {visibleScenarios.length === 0 ? (
                <div className="rounded-[3px] border border-dashed border-[#384150] bg-[#14171d] p-5 text-center font-mono text-xs text-slate-400">
                  {activeTab === 'SAVED' && favoriteIds.length === 0 ? (
                    <>
                      <Star className="mx-auto mb-2 h-6 w-6 text-amber-400/70" aria-hidden="true" />
                      <p className="text-slate-200 font-semibold">No Saved Scenarios yet</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                        Click the <strong className="text-amber-300">Favorite</strong> button on any trouble scenario entry to bookmark frequently used fault conditions here.
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveTab('ALL')}
                        className="hw-btn hw-btn-amber mt-3 rounded-[2px] px-3 py-1.5 text-[10.5px] font-bold uppercase cursor-pointer"
                      >
                        Browse All Scenarios
                      </button>
                    </>
                  ) : (
                    <>
                      <p>
                        {activeTab === 'SAVED'
                          ? 'No Saved Scenarios match your current filters.'
                          : 'No PH trouble scenarios match your current filters.'}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                        {hasActiveFilters && (
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className="hw-btn hw-btn-amber rounded-[2px] px-3 py-1.5 text-[10.5px] font-bold uppercase cursor-pointer"
                          >
                            Clear All Filters
                          </button>
                        )}
                        {activeTab === 'SAVED' && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('ALL')}
                            className="hw-btn rounded-[2px] px-3 py-1.5 text-[10.5px] font-bold uppercase text-amber-200 cursor-pointer"
                          >
                            Browse All Scenarios
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                visibleScenarios.map((scenario) => {
                  const isSelected = selectedScenario?.phId === scenario.phId;
                  const isActiveBench = activeScenarioId === scenario.id;
                  const isFavorite = favoriteSet.has(scenario.phId);
                  const fidelityMeta = getFidelityMeta(scenario.emulationFidelity);
                  const cleanTitle = stripScenarioIdPrefix(scenario.title, scenario.phId);

                  return (
                    <article
                      key={scenario.id}
                      onClick={() => handleSelectScenario(scenario, true)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectScenario(scenario, true);
                        }
                      }}
                      aria-current={isSelected ? 'true' : undefined}
                      className={`rounded-[3px] border p-2.5 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                        isSelected
                          ? 'border-amber-400/85 bg-[#1d222b] shadow-[inset_2px_0_0_0_#f59e0b]'
                          : isActiveBench
                            ? 'border-emerald-500/70 bg-[#101c17]'
                            : 'border-[#2b313c] bg-[#14171d] hover:border-[#4b5566]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1 font-mono text-[9.5px]">
                          <span className="rounded-[2px] border border-amber-500/55 bg-[#221b11] px-1.5 py-0.5 font-bold text-amber-300">
                            {scenario.phId}
                          </span>
                          {scenario.relatedDtcs.slice(0, 2).map((dtc) => (
                            <span
                              key={dtc}
                              className="rounded-[2px] border border-rose-500/50 bg-rose-950/55 px-1.5 py-0.5 font-bold text-rose-200"
                            >
                              {dtc}
                            </span>
                          ))}
                          <span
                            className={`rounded-[2px] border px-1.5 py-0.5 font-semibold ${fidelityMeta.badgeClass}`}
                          >
                            {fidelityMeta.shortLabel}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleFavorite(scenario.phId, false);
                          }}
                          aria-pressed={isFavorite}
                          aria-label={
                            isFavorite
                              ? `Remove ${scenario.phId} from Saved Scenarios`
                              : `Favorite ${scenario.phId} to Saved Scenarios`
                          }
                          title={
                            isFavorite
                              ? 'Remove from Saved Scenarios tab'
                              : 'Save fault condition to Saved Scenarios tab'
                          }
                          className={`hw-btn inline-flex shrink-0 items-center gap-1 rounded-[2px] px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase transition cursor-pointer ${
                            isFavorite
                              ? 'border-amber-400/75 bg-amber-950/60 text-amber-200'
                              : 'text-slate-300 hover:border-amber-400/50 hover:text-amber-200'
                          }`}
                        >
                          <Star
                            className={`h-3 w-3 shrink-0 ${
                              isFavorite ? 'fill-amber-400 text-amber-300' : 'text-slate-400'
                            }`}
                            aria-hidden="true"
                          />
                          <span>{isFavorite ? 'Favorited' : 'Favorite'}</span>
                        </button>
                      </div>

                      <h3 className="mt-1.5 text-xs font-bold leading-snug text-slate-100">
                        {cleanTitle}
                      </h3>

                      <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-slate-400">
                        {scenario.phContext}
                      </p>

                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 font-mono text-[9.5px] text-slate-400">
                        <span>
                          D{scenario.domainNumber} · p.{scenario.sourcePage} · {scenario.focusPinLabel}
                        </span>
                        {isActiveBench && (
                          <span className="rounded-[2px] border border-emerald-500/65 bg-emerald-950/55 px-1.5 py-0.5 font-bold uppercase text-emerald-300">
                            Active
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          {/* Right Detail Dossier */}
          <section
            aria-label="Selected trouble scenario engineering dossier"
            className={`min-h-0 flex-col bg-[#0e1116] md:col-span-7 ${
              mobileShowDetail ? 'flex' : 'hidden md:flex'
            }`}
          >
            {/* Mobile Back Button */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#2b313c] bg-[#13161c] px-3 py-2 md:hidden">
              <button
                type="button"
                onClick={() => setMobileShowDetail(false)}
                className="hw-btn inline-flex items-center gap-1.5 rounded-[2px] px-2.5 py-1 font-mono text-[10.5px] font-bold text-amber-200 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                <span>Back to Results ({filteredScenarios.length})</span>
              </button>
              {selectedScenario && (
                <span className="font-mono text-[10px] font-bold text-amber-300">
                  {selectedScenario.phId}
                </span>
              )}
            </div>

            {selectedScenario && selectedFidelity ? (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5 sm:p-4 select-text">
                {actionFeedback && (
                  <div
                    role="status"
                    className="flex items-center justify-between gap-2 rounded-[2px] border border-emerald-500/50 bg-emerald-950/40 px-3 py-2 font-mono text-[11px] text-emerald-200"
                  >
                    <span>{actionFeedback}</span>
                    <button
                      type="button"
                      onClick={() => setActionFeedback(null)}
                      className="text-[10px] underline hover:text-white cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Dossier Header Card */}
                <div className="hud-panel rounded-[3px] p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                      <span className="rounded-[2px] border border-amber-500/60 bg-[#221b11] px-2 py-0.5 font-bold text-amber-300">
                        {selectedScenario.phId}
                      </span>
                      {selectedScenario.relatedDtcs.length > 0 ? (
                        selectedScenario.relatedDtcs.map((dtc) => (
                          <span
                            key={dtc}
                            className="rounded-[2px] border border-rose-500/55 bg-rose-950/55 px-2 py-0.5 font-bold text-rose-200"
                          >
                            {dtc}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-[2px] border border-[#384150] bg-[#171b22] px-2 py-0.5 font-bold text-slate-300">
                          Field Reference
                        </span>
                      )}
                      <span
                        className={`rounded-[2px] border px-2 py-0.5 font-bold uppercase ${selectedFidelity.badgeClass}`}
                      >
                        {selectedFidelity.label}
                      </span>
                      <span className="rounded-[2px] border border-[#2b313c] bg-[#090b0f] px-2 py-0.5 text-slate-300">
                        Batch {selectedScenario.batch} · Domain {selectedScenario.domainNumber} · p.{selectedScenario.sourcePage}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleFavorite(selectedScenario.phId, true)}
                        aria-pressed={isSelectedFavorite}
                        className={`hw-btn inline-flex items-center gap-1 rounded-[2px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase cursor-pointer ${
                          isSelectedFavorite ? 'hw-btn-amber text-amber-200' : 'text-slate-200 hover:text-amber-200'
                        }`}
                      >
                        <Star
                          className={`h-3.5 w-3.5 shrink-0 ${
                            isSelectedFavorite ? 'fill-amber-400 text-amber-300' : ''
                          }`}
                          aria-hidden="true"
                        />
                        <span>{isSelectedFavorite ? 'Favorited' : 'Favorite'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleCopyDossier(selectedScenario)}
                        className="hw-btn inline-flex items-center gap-1 rounded-[2px] px-2 py-1 font-mono text-[10px] text-slate-200 hover:text-amber-200 cursor-pointer"
                      >
                        {copiedPhId === selectedScenario.phId ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                            <span className="text-emerald-300">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <h3 className="mt-2.5 font-hud text-base font-bold leading-snug tracking-wide text-slate-100 sm:text-lg">
                    {stripScenarioIdPrefix(selectedScenario.title, selectedScenario.phId)}
                  </h3>
                  <p className="mt-1 font-mono text-[10.5px] text-slate-400">
                    System Domain: <span className="text-slate-200">{selectedScenario.domainName}</span>
                  </p>

                  {/* Provenance Notice */}
                  <div className="mt-2.5 flex items-start gap-2 rounded-[2px] border border-amber-500/35 bg-[#1b1710] px-2.5 py-2 text-[10.5px] text-amber-200/90">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                    <span>
                      <strong className="font-mono uppercase">{selectedScenario.provenanceStatus}:</strong>{' '}
                      Simulated bench values do not replace physical harness testing. Verify exact OEM pinouts, connector orientation, and service manual specs before wiring or component replacement.
                    </span>
                  </div>
                </div>

                {/* PH Vehicle Context & Symptoms */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div className="hud-panel rounded-[3px] p-3">
                    <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      PH Vehicle &amp; Field Context
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-200">
                      {selectedScenario.phContext}
                    </p>
                  </div>

                  <div className="rounded-[3px] border border-rose-500/40 bg-[#191115] p-3">
                    <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-rose-300">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Reported Symptoms</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-rose-100">
                      {selectedScenario.symptoms}
                    </p>
                  </div>
                </div>

                {/* Embedded Offline AI Voice Guide & Step-by-Step Interactive Diagnostic Coach */}
                {voiceCoachEval && (
                  <div
                    aria-label="Offline AI Voice Guide Interactive Coach"
                    className="rounded-[3px] border border-amber-500/45 bg-[#12161f] p-3.5 shadow-inner"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#262e3d] pb-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-[2px] border border-amber-500/60 bg-amber-950/60 text-amber-300">
                          <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-amber-300">
                            <span>Offline AI Voice Guide · Interactive Step Coach</span>
                            <span
                              className={`rounded-[2px] border px-1.5 py-0.5 text-[9px] ${
                                voiceState.isListening
                                  ? 'border-rose-500/75 bg-rose-950/80 text-rose-200 animate-pulse'
                                  : voiceState.isSpeaking
                                    ? 'border-emerald-500/75 bg-emerald-950/80 text-emerald-200'
                                    : voiceNavEnabled
                                      ? 'border-amber-500/60 bg-amber-950/60 text-amber-200'
                                      : 'border-[#343d4d] bg-[#0c0f15] text-slate-400'
                              }`}
                            >
                              {voiceState.isListening
                                ? 'MIC LISTENING'
                                : voiceState.isSpeaking
                                  ? 'SPEAKING'
                                  : voiceNavEnabled
                                    ? 'VOICE SYNC ON'
                                    : 'READY'}
                            </span>
                            {isStepChimeActive && (
                              <span className="rounded-[2px] border border-emerald-400/75 bg-emerald-950/85 px-1.5 py-0.5 text-[9px] text-emerald-200 animate-pulse">
                                STEP COMPLETE CHIME
                              </span>
                            )}
                            {pendingAutoPlayStep &&
                              pendingAutoPlayStep.phId === selectedScenario.phId.toUpperCase() && (
                                <span className="inline-flex items-center gap-1 rounded-[2px] border border-sky-400/75 bg-sky-950/85 px-1.5 py-0.5 text-[9px] text-sky-200">
                                  <span className="animate-pulse">
                                    AUTO-PLAY → STEP {pendingAutoPlayStep.targetStepIndex + 1} (1s)
                                  </span>
                                  <button
                                    type="button"
                                    onClick={cancelPendingAutoPlay}
                                    aria-label="Cancel auto-play step advance"
                                    className="ml-0.5 rounded-[2px] border border-sky-400/40 bg-sky-900/60 px-1 text-[8.5px] font-bold uppercase text-sky-100 hover:bg-sky-800/80 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </span>
                              )}
                          </div>
                          <p className="text-[10.5px] text-slate-400">
                            Step-by-step spoken walkthrough synchronized with live 16-pin DMM probe &amp; global voice bar.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                        <button
                          type="button"
                          onClick={() => setAutoPlayNextStep((prev) => !prev)}
                          aria-pressed={autoPlayNextStep}
                          className={`hw-btn inline-flex min-h-[30px] items-center gap-1 rounded-[2px] px-2 py-1 font-bold uppercase cursor-pointer ${
                            autoPlayNextStep
                              ? 'border-emerald-500/60 bg-emerald-950/50 text-emerald-200'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title="Automatically advance to the next diagnostic step 1 second after marking a step complete so you hear the completion chime"
                        >
                          {autoPlayNextStep ? (
                            <Play className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                          ) : (
                            <Pause className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                          )}
                          <span>{autoPlayNextStep ? 'Auto-Play ON' : 'Auto-Play OFF'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setAutoSpeakOnStepChange((prev) => !prev)}
                          aria-pressed={autoSpeakOnStepChange}
                          className={`hw-btn inline-flex min-h-[30px] items-center gap-1 rounded-[2px] px-2 py-1 font-bold uppercase cursor-pointer ${
                            autoSpeakOnStepChange
                              ? 'border-amber-500/60 bg-amber-950/50 text-amber-200'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title="Automatically speak step guidance when stepping through the scenario"
                        >
                          {autoSpeakOnStepChange ? (
                            <Volume2 className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                          ) : (
                            <VolumeX className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                          )}
                          <span>{autoSpeakOnStepChange ? 'Auto-Speak ON' : 'Auto-Speak OFF'}</span>
                        </button>

                        {voiceState.isSpeaking && (
                          <button
                            type="button"
                            onClick={() => offlineVoiceAssistant.stopSpeaking()}
                            className="hw-btn inline-flex min-h-[30px] items-center gap-1 rounded-[2px] border-rose-500/60 bg-rose-950/60 px-2 py-1 font-bold uppercase text-rose-200 cursor-pointer"
                          >
                            <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Stop Speech</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handleDrawerVoiceMic}
                          aria-pressed={voiceState.isListening}
                          className={`hw-btn inline-flex min-h-[30px] items-center gap-1 rounded-[2px] px-2.5 py-1 font-bold uppercase cursor-pointer ${
                            voiceState.isListening
                              ? 'border-rose-500/80 bg-rose-900/75 text-rose-100 animate-pulse'
                              : 'hw-btn-blue'
                          }`}
                          title='Speak voice commands like "Next step", "Verify probe", "Emulate scenario", or "Probe focus pin"'
                        >
                          {voiceState.isListening ? (
                            <MicOff className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          <span>{voiceState.isListening ? 'Stop Mic' : 'Voice Mic'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Live Bench & DMM Telemetry Verification Status Banner */}
                    <div
                      className={`mt-2.5 rounded-[2px] border px-3 py-2 text-xs ${
                        voiceCoachEval.verdict === 'FAULT_CONFIRMED' ||
                        voiceCoachEval.verdict === 'NOMINAL_RESTORED'
                          ? 'border-emerald-500/55 bg-emerald-950/35 text-emerald-100'
                          : voiceCoachEval.verdict === 'PSU_MISMATCH'
                            ? 'border-rose-500/65 bg-rose-950/45 text-rose-100'
                            : 'border-amber-500/50 bg-[#1c170f] text-amber-100'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px]">
                        <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wider">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              voiceCoachEval.isStepVerified
                                ? 'bg-emerald-400'
                                : 'bg-amber-400 animate-pulse'
                            }`}
                          />
                          <span>{voiceCoachEval.verdictBadgeLabel}</span>
                          <span>·</span>
                          <span>
                            Step {voiceCoachEval.stepIndex + 1} of {voiceCoachEval.totalSteps}
                          </span>
                        </span>

                        <div className="flex flex-wrap items-center gap-1.5 text-[9.5px]">
                          <span
                            className={`rounded-[2px] border px-1.5 py-0.5 ${
                              voiceCoachEval.isScenarioEmulated
                                ? 'border-emerald-500/50 bg-emerald-950/70 text-emerald-200 font-bold'
                                : 'border-[#333c4d] bg-[#0c0f14] text-slate-300'
                            }`}
                          >
                            {voiceCoachEval.isScenarioEmulated ? 'Scenario Emulated' : 'Not Yet Emulated'}
                          </span>
                          <span
                            className={`rounded-[2px] border px-1.5 py-0.5 ${
                              voiceCoachEval.isRedProbeOnFocusPin
                                ? 'border-emerald-500/50 bg-emerald-950/70 text-emerald-200 font-bold'
                                : 'border-rose-500/50 bg-rose-950/60 text-rose-200'
                            }`}
                          >
                            Red (+): {benchState?.multimeter?.redProbe?.attachedLabel || 'Unconnected'}
                          </span>
                          <span className="rounded-[2px] border border-[#333c4d] bg-[#0c0f14] px-1.5 py-0.5 font-bold text-amber-300 tabular-nums">
                            DMM: {voiceCoachEval.dmmReadingText}
                          </span>
                        </div>
                      </div>

                      <div className="mt-1 font-semibold text-slate-100">
                        {voiceCoachEval.coachingHeadline}
                      </div>
                      <p className="mt-0.5 text-[11px] leading-snug opacity-90">
                        {voiceCoachEval.coachingDetail}
                      </p>
                    </div>

                    {/* Step-by-Step Interactive Voice Coach Controls */}
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          disabled={voiceCoachEval.stepIndex <= 0}
                          onClick={() => handleCycleCoachStep(-1)}
                          aria-label="Previous diagnostic step"
                          className="hw-btn inline-flex min-h-[32px] items-center gap-1 rounded-[2px] px-2.5 py-1 font-bold uppercase text-slate-200 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                          title="Move to previous diagnostic step in the voice guidance workflow"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Previous</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectCoachStep(voiceCoachEval.stepIndex, true)}
                          className="hw-btn hw-btn-amber inline-flex min-h-[32px] items-center gap-1.5 rounded-[2px] px-3 py-1 font-bold uppercase cursor-pointer"
                        >
                          <Volume2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>Speak Step {voiceCoachEval.stepIndex + 1}</span>
                        </button>

                        <button
                          type="button"
                          disabled={voiceCoachEval.stepIndex >= voiceCoachEval.totalSteps - 1}
                          onClick={() => handleCycleCoachStep(1)}
                          aria-label="Next diagnostic step"
                          className="hw-btn inline-flex min-h-[32px] items-center gap-1 rounded-[2px] px-2.5 py-1 font-bold uppercase text-slate-200 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                          title="Advance to next diagnostic step in the voice guidance workflow"
                        >
                          <span>Next</span>
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {(() => {
                          const currentPhCompleted =
                            completedStepsByPhId[selectedScenario.phId.toUpperCase()] ?? [];
                          const isActiveStepCompleted = currentPhCompleted.includes(
                            voiceCoachEval.stepIndex
                          );
                          return (
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleStepCompletionWithAudio(voiceCoachEval.stepIndex)
                              }
                              aria-pressed={isActiveStepCompleted}
                              className={`hw-btn inline-flex min-h-[32px] items-center gap-1.5 rounded-[2px] px-2.5 py-1 font-bold uppercase cursor-pointer ${
                                isActiveStepCompleted
                                  ? 'border-emerald-400/75 bg-emerald-900/55 text-emerald-100'
                                  : 'hw-btn-green text-emerald-200'
                              }`}
                              title="Mark current diagnostic step completed and trigger real-time voice + chime confirmation"
                            >
                              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>
                                {isActiveStepCompleted
                                  ? `Step ${voiceCoachEval.stepIndex + 1} Done`
                                  : `Mark Step ${voiceCoachEval.stepIndex + 1} Complete`}
                              </span>
                            </button>
                          );
                        })()}

                        <button
                          type="button"
                          onClick={handleVerifyCurrentStepWithVoice}
                          className="hw-btn inline-flex min-h-[32px] items-center gap-1.5 rounded-[2px] border-emerald-500/45 bg-emerald-950/35 px-2.5 py-1 font-bold uppercase text-emerald-200 hover:bg-emerald-900/45 cursor-pointer"
                          title="Check live DMM probe placement & voltage against this scenario step and speak coaching feedback"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>Verify Probe &amp; Bench</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleSpeakFullOverview}
                          className="hw-btn inline-flex min-h-[32px] items-center gap-1.5 rounded-[2px] px-2.5 py-1 text-slate-200 hover:text-amber-200 cursor-pointer"
                          title="Read full scenario briefing, symptoms, target pin, and expected probe outcome aloud"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                          <span>Speak Full Briefing</span>
                        </button>
                      </div>
                    </div>

                    {/* Interactive Step-by-Step Diagnostic Procedure List */}
                    <div className="mt-3 hw-lcd-well rounded-[3px] p-3">
                      {(() => {
                        const completedForPh =
                          completedStepsByPhId[selectedScenario.phId.toUpperCase()] ?? [];
                        const progress = computeScenarioStepProgress(
                          completedForPh,
                          selectedSteps.length
                        );
                        return (
                          <div className="mb-2.5 space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10.5px] font-bold uppercase tracking-wider text-emerald-400">
                              <span className="inline-flex items-center gap-1.5">
                                <Activity className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span>Interactive Diagnostic Steps</span>
                              </span>
                              <div className="flex flex-wrap items-center gap-1.5 text-[9.5px]">
                                <span
                                  className={`rounded-[2px] border px-1.5 py-0.5 font-bold ${
                                    progress.isAllComplete
                                      ? 'border-emerald-400/70 bg-emerald-950/75 text-emerald-200'
                                      : progress.completedCount > 0
                                        ? 'border-amber-500/55 bg-amber-950/60 text-amber-200'
                                        : 'border-[#30394a] bg-[#0e1219] text-slate-400'
                                  }`}
                                >
                                  {progress.statusLabel}
                                </span>
                                <span
                                  className={`tabular-nums ${
                                    progress.isAllComplete
                                      ? 'text-emerald-300'
                                      : 'text-slate-200'
                                  }`}
                                >
                                  {progress.completedCount}/{progress.totalSteps} Finished ({progress.percent}%)
                                </span>
                              </div>
                            </div>

                            {/* Accessible Step Completion Progress Bar Indicator */}
                            <div
                              role="progressbar"
                              aria-label={`Diagnostic step completion progress for ${selectedScenario.phId}`}
                              aria-valuemin={0}
                              aria-valuemax={progress.totalSteps}
                              aria-valuenow={progress.completedCount}
                              aria-valuetext={`${progress.completedCount} of ${progress.totalSteps} steps finished (${progress.percent}%)`}
                              className="relative h-2 w-full overflow-hidden rounded-[2px] border border-[#2a3342] bg-[#0a0d12]"
                            >
                              <div
                                className={`h-full transition-all duration-300 ${
                                  progress.isAllComplete
                                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.45)]'
                                    : 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-amber-400'
                                }`}
                                style={{ width: `${progress.percent}%` }}
                              />
                              {progress.totalSteps > 1 && (
                                <div
                                  aria-hidden="true"
                                  className="pointer-events-none absolute inset-0 flex"
                                >
                                  {Array.from({ length: progress.totalSteps }).map((_, segIdx) => (
                                    <div
                                      key={segIdx}
                                      className={`flex-1 ${
                                        segIdx > 0 ? 'border-l border-[#0b0e14]/80' : ''
                                      }`}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                      <ol className="space-y-1.5 text-xs leading-relaxed text-slate-200">
                        {selectedSteps.map((step, index) => {
                          const isCurrentStep = voiceCoachEval.stepIndex === index;
                          const isStepChecked = (
                            completedStepsByPhId[selectedScenario.phId.toUpperCase()] ?? []
                          ).includes(index);
                          const isQueuedAutoPlayTarget =
                            pendingAutoPlayStep !== null &&
                            pendingAutoPlayStep.phId === selectedScenario.phId.toUpperCase() &&
                            pendingAutoPlayStep.targetStepIndex === index;
                          return (
                            <li
                              key={index}
                              onClick={() => handleSelectCoachStep(index, true)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleSelectCoachStep(index, true);
                                }
                              }}
                              aria-current={isCurrentStep ? 'step' : undefined}
                              className={`flex flex-wrap sm:flex-nowrap items-start justify-between gap-2 rounded-[2px] border px-2.5 py-2 transition cursor-pointer ${
                                isCurrentStep
                                  ? 'border-amber-400/85 bg-[#1b2230] text-amber-100 shadow-[inset_2px_0_0_0_#f59e0b]'
                                  : isQueuedAutoPlayTarget
                                    ? 'border-sky-400/75 bg-sky-950/35 text-sky-100 shadow-[inset_2px_0_0_0_#38bdf8]'
                                    : isStepChecked
                                      ? 'border-emerald-500/45 bg-emerald-950/25 text-emerald-100'
                                      : 'border-[#242a34] bg-[#111419] hover:border-[#3e485a]'
                              }`}
                            >
                              <div className="flex items-start gap-2 min-w-0 flex-1">
                                <span
                                  className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] font-mono text-[9.5px] font-bold ${
                                    isStepChecked
                                      ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/60'
                                      : isCurrentStep
                                        ? 'bg-amber-500/30 text-amber-200 border border-amber-400/70'
                                        : isQueuedAutoPlayTarget
                                          ? 'bg-sky-500/30 text-sky-200 border border-sky-400/70'
                                          : 'bg-[#1a1f29] text-slate-400 border border-[#2f3746]'
                                  }`}
                                >
                                  {isStepChecked ? '✓' : index + 1}
                                </span>
                                <span
                                  className={`leading-snug ${
                                    isStepChecked && !isCurrentStep
                                      ? 'text-emerald-100/90'
                                      : ''
                                  }`}
                                >
                                  {step}
                                </span>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5 self-center font-mono text-[9.5px]">
                                <span
                                  className={`uppercase ${
                                    isQueuedAutoPlayTarget
                                      ? 'text-sky-300 font-bold animate-pulse'
                                      : 'text-amber-300/90'
                                  }`}
                                >
                                  {isCurrentStep
                                    ? 'Active'
                                    : isQueuedAutoPlayTarget
                                      ? 'Next (1s)'
                                      : 'Speak'}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleStepCompletionWithAudio(index);
                                  }}
                                  aria-pressed={isStepChecked}
                                  className={`inline-flex min-h-[26px] items-center gap-1 rounded-[2px] border px-2 py-0.5 font-bold uppercase transition cursor-pointer ${
                                    isStepChecked
                                      ? 'border-emerald-400/70 bg-emerald-900/65 text-emerald-200 hover:bg-emerald-900/90'
                                      : 'border-[#394356] bg-[#151a24] text-slate-300 hover:border-emerald-400/70 hover:text-emerald-200'
                                  }`}
                                  title={
                                    isStepChecked
                                      ? `Unmark Step ${index + 1}`
                                      : `Mark Step ${index + 1} completed with real-time audio confirmation`
                                  }
                                >
                                  <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
                                  <span>{isStepChecked ? 'Completed' : 'Done'}</span>
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ol>

                      {/* Diagnostic Step Footer Previous / Next Step Cycler */}
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#222936] pt-2 font-mono text-[10px]">
                        <button
                          type="button"
                          disabled={voiceCoachEval.stepIndex <= 0}
                          onClick={() => handleCycleCoachStep(-1)}
                          aria-label="Cycle to previous diagnostic step"
                          className="hw-btn inline-flex min-h-[28px] items-center gap-1 rounded-[2px] px-2.5 py-1 font-bold uppercase text-slate-200 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Previous</span>
                        </button>

                        <span className="text-[10px] text-slate-300 tabular-nums">
                          Active Step{' '}
                          <strong className="text-amber-300">
                            {voiceCoachEval.stepIndex + 1}
                          </strong>{' '}
                          of{' '}
                          <strong className="text-slate-100">
                            {voiceCoachEval.totalSteps}
                          </strong>
                        </span>

                        <button
                          type="button"
                          disabled={voiceCoachEval.stepIndex >= voiceCoachEval.totalSteps - 1}
                          onClick={() => handleCycleCoachStep(1)}
                          aria-label="Cycle to next diagnostic step"
                          className="hw-btn inline-flex min-h-[28px] items-center gap-1 rounded-[2px] px-2.5 py-1 font-bold uppercase text-slate-200 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <span>Next</span>
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {/* Active Scenario Voice Guidance Transcript Log */}
                    <div className="mt-3 rounded-[3px] border border-[#2c3444] bg-[#0b0e14] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-sky-300">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-sky-400" aria-hidden="true" />
                          <span>Voice Guidance Transcript · {selectedScenario.phId}</span>
                          <span className="rounded-[2px] border border-sky-500/40 bg-sky-950/60 px-1.5 py-0.5 text-[9px] text-sky-200 tabular-nums">
                            {activeScenarioTranscript.length}{' '}
                            {activeScenarioTranscript.length === 1 ? 'Entry' : 'Entries'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[9.5px]">
                          {activeScenarioTranscript.length > 0 && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  const latest =
                                    activeScenarioTranscript[activeScenarioTranscript.length - 1];
                                  if (!latest) return;
                                  handleReplayTranscriptEntry(latest);
                                }}
                                className="hw-btn inline-flex min-h-[26px] items-center gap-1 rounded-[2px] px-2 py-0.5 text-amber-200 hover:text-amber-100 cursor-pointer"
                                title="Replay the most recent voice guidance step"
                              >
                                <Volume2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span>Replay Latest</span>
                              </button>

                              <button
                                type="button"
                                onClick={handleCopyScenarioTranscript}
                                className="hw-btn inline-flex min-h-[26px] items-center gap-1 rounded-[2px] px-2 py-0.5 text-slate-200 hover:text-sky-200 cursor-pointer"
                                title="Copy transcript log for this scenario"
                              >
                                {copiedTranscriptPhId === selectedScenario.phId ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                                    <span className="text-emerald-300">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3 shrink-0" aria-hidden="true" />
                                    <span>Copy Log</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={handleClearActiveScenarioTranscript}
                                className="hw-btn inline-flex min-h-[26px] items-center gap-1 rounded-[2px] px-2 py-0.5 text-slate-400 hover:text-rose-300 cursor-pointer"
                                title={`Clear voice guidance transcript for ${selectedScenario.phId}`}
                              >
                                <Trash2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span>Clear</span>
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => setIsTranscriptExpanded((prev) => !prev)}
                            aria-expanded={isTranscriptExpanded}
                            className="hw-btn inline-flex min-h-[26px] items-center gap-1 rounded-[2px] px-2 py-0.5 text-slate-300 hover:text-white cursor-pointer"
                          >
                            {isTranscriptExpanded ? (
                              <>
                                <ChevronUp className="h-3 w-3" aria-hidden="true" />
                                <span>Hide</span>
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-3 w-3" aria-hidden="true" />
                                <span>Show</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {isTranscriptExpanded && (
                        <div
                          role="log"
                          aria-live="polite"
                          aria-label={`Voice guidance transcript for ${selectedScenario.phId}`}
                          className="mt-2.5 max-h-[220px] space-y-1.5 overflow-y-auto pr-1"
                        >
                          {activeScenarioTranscript.length === 0 ? (
                            <div className="rounded-[2px] border border-dashed border-[#2b3444] bg-[#0f131b] px-3 py-2.5 font-mono text-[10.5px] text-slate-400">
                              No voice guidance played yet for <strong className="text-slate-200">{selectedScenario.phId}</strong>. Click <span className="text-amber-300">Speak Step</span>, <span className="text-emerald-300">Mark Complete</span>, <span className="text-emerald-300">Verify Probe &amp; Bench</span>, or use <span className="text-sky-300">Voice Mic</span> to record previously played voice guidance steps.
                            </div>
                          ) : (
                            activeScenarioTranscript.map((entry, idx) => {
                              const timeLabel = new Date(entry.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              });
                              const kind = entry.guidanceKind ?? 'STEP_GUIDANCE';
                              const isHighlightedReplay = activeReplayEntryId === entry.id;
                              const kindBadgeClass =
                                kind === 'STEP_COMPLETED'
                                  ? 'border-emerald-500/60 bg-emerald-950/75 text-emerald-200'
                                  : kind === 'VERIFICATION'
                                    ? 'border-sky-500/60 bg-sky-950/75 text-sky-200'
                                    : kind === 'BRIEFING'
                                      ? 'border-purple-500/60 bg-purple-950/75 text-purple-200'
                                      : kind === 'BENCH_ACTION'
                                        ? 'border-amber-500/60 bg-amber-950/75 text-amber-200'
                                        : 'border-amber-400/50 bg-[#1d1912] text-amber-200';
                              const kindLabel =
                                kind === 'STEP_COMPLETED'
                                  ? 'COMPLETED'
                                  : kind === 'VERIFICATION'
                                    ? 'VERIFIED'
                                    : kind === 'BRIEFING'
                                      ? 'BRIEFING'
                                      : kind === 'BENCH_ACTION'
                                        ? 'BENCH'
                                        : 'GUIDANCE';
                              return (
                                <div
                                  key={entry.id}
                                  className={`animate-transcript-entry-in rounded-[2px] border px-2.5 py-2 text-[11px] transition-colors ${
                                    isHighlightedReplay
                                      ? 'border-amber-400/75 bg-[#171d29]'
                                      : 'border-[#222937] bg-[#10141d]'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-1.5 font-mono text-[9.5px]">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-slate-500 tabular-nums">
                                        #{idx + 1} · {timeLabel}
                                      </span>
                                      <span
                                        className={`rounded-[2px] border px-1.5 py-0.5 font-bold uppercase ${kindBadgeClass}`}
                                      >
                                        {kindLabel}
                                      </span>
                                      {entry.scenarioStepNumber && (
                                        <span className="rounded-[2px] border border-[#343e52] bg-[#161c28] px-1.5 py-0.5 text-slate-200">
                                          Step {entry.scenarioStepNumber}
                                        </span>
                                      )}
                                      {entry.replayCount > 0 && (
                                        <span className="rounded-[2px] border border-amber-500/45 bg-amber-950/50 px-1.5 py-0.5 text-[9px] text-amber-200 tabular-nums">
                                          Replayed ×{entry.replayCount}
                                        </span>
                                      )}
                                      <span className="text-slate-400 truncate max-w-[200px]">
                                        &ldquo;{entry.rawTranscript}&rdquo;
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleReplayTranscriptEntry(entry)}
                                      className="inline-flex items-center gap-1 rounded-[2px] border border-[#323c4e] bg-[#161b26] px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300 hover:border-amber-400/70 hover:text-amber-200 cursor-pointer"
                                      title="Replay this guidance entry aloud"
                                    >
                                      <Volume2 className="h-2.5 w-2.5" aria-hidden="true" />
                                      <span>Replay</span>
                                    </button>
                                  </div>
                                  <p className="mt-1 leading-snug text-slate-200">
                                    {entry.spokenReply}
                                  </p>
                                </div>
                              );
                            })
                          )}
                          <div ref={transcriptEndRef} />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 16-Pin Bench Lab Mapping & Safety Card */}
                <div
                  className={`rounded-[3px] p-3.5 ${
                    selectedScenario.emulationFidelity === 'DIAGNOSTIC_REFERENCE_ONLY'
                      ? 'hud-panel-amber'
                      : 'hud-panel'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-amber-300">
                      <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Virtual 16-Pin Bench Mapping</span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-300">
                      Focus Pin: <strong className="text-emerald-300">{selectedScenario.focusPinLabel}</strong>
                    </span>
                  </div>

                  {selectedScenario.emulationFidelity === 'DIAGNOSTIC_REFERENCE_ONLY' && (
                    <div className="mt-2 flex items-start gap-2 rounded-[2px] border border-amber-500/55 bg-amber-950/45 px-2.5 py-2 text-[11px] text-amber-100">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                      <span>
                        <strong>Non-Energized Safety Boundary:</strong> This scenario covers mechanical, HV, SRS, or workshop safety procedures beyond live 12V pin fault injection. Emulating it safely powers the bench PSU OFF.
                      </span>
                    </div>
                  )}

                  <div className="mt-2 hw-lcd-well rounded-[2px] px-2.5 py-2 font-mono text-[11px] text-amber-200">
                    <span className="text-slate-400">Expected Probe Outcome: </span>
                    {selectedScenario.expectedProbeOutcome}
                  </div>

                  <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                    {selectedScenario.emulationNote} — {selectedFidelity.description}
                  </p>
                </div>

                {/* Action Dock */}
                <div className="hud-panel rounded-[3px] p-3">
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Workstation Handoff Actions
                  </div>
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px]">
                    <button
                      type="button"
                      onClick={() => {
                        onEmulateScenario(selectedScenario);
                        setActionFeedback(
                          `Loaded ${selectedScenario.phId} into active 16-Pin MNA Bench Lab simulation.`
                        );
                        if (autoSpeakOnStepChange && voiceCoachEval) {
                          speakAndLogCoachMessage(
                            `Emulated ${selectedScenario.phId} on 16-Pin Bench`,
                            `Emulating ${selectedScenario.phId} on the 16-pin bench. Red probe attached to ${selectedScenario.focusPinLabel}. ${voiceCoachEval.spokenStepGuidance}`,
                            `emulate ${selectedScenario.phId}`,
                            'QUICK_CHIP',
                            {
                              scenarioPhId: selectedScenario.phId,
                              scenarioStepNumber: voiceCoachEval.stepIndex + 1,
                              guidanceKind: 'BENCH_ACTION',
                            }
                          );
                        }
                      }}
                      className={`hw-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-[2px] px-3 py-1.5 font-bold uppercase cursor-pointer ${
                        isSelectedActiveOnBench
                          ? 'hw-btn-green text-emerald-200'
                          : 'hw-btn-amber'
                      }`}
                    >
                      <Play className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {isSelectedActiveOnBench ? 'Re-Emulate in Bench Lab' : 'Emulate in Bench Lab'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onFocusProbePin(
                          selectedScenario.focusPinId,
                          selectedScenario.focusPinLabel,
                          false
                        );
                        setActionFeedback(
                          `Attached Red DMM Probe & selected ${selectedScenario.focusPinLabel}.`
                        );
                        if (autoSpeakOnStepChange) {
                          speakAndLogCoachMessage(
                            `Attached Red Probe to ${selectedScenario.focusPinLabel}`,
                            `Attached red multimeter probe to ${selectedScenario.focusPinLabel}. Expected reading: ${selectedScenario.expectedProbeOutcome}.`,
                            `probe ${selectedScenario.focusPinLabel}`,
                            'QUICK_CHIP',
                            {
                              scenarioPhId: selectedScenario.phId,
                              scenarioStepNumber: activeVoiceStepIndex + 1,
                              guidanceKind: 'BENCH_ACTION',
                            }
                          );
                        }
                      }}
                      className="hw-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-[2px] px-2.5 py-1.5 text-slate-200 hover:text-amber-200 cursor-pointer"
                    >
                      <Crosshair className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                      <span>Probe {selectedScenario.focusPinLabel}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onLaunchGroundedSearch(
                          `${selectedScenario.phContext} ${selectedScenario.relatedDtcs.join(' ')} ${stripScenarioIdPrefix(selectedScenario.title, selectedScenario.phId)} wiring diagram TSB`,
                          selectedScenario.relatedDtcs[0] || '',
                          selectedScenario.phContext
                        )
                      }
                      className="hw-btn hw-btn-green inline-flex min-h-[36px] items-center gap-1.5 rounded-[2px] px-2.5 py-1.5 text-emerald-200 cursor-pointer"
                    >
                      <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Live TSB Search</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onOpenOfflineBot(
                          `Diagnose ${selectedScenario.phId} (${selectedScenario.relatedDtcs.join(', ') || 'Field Case'}): ${stripScenarioIdPrefix(selectedScenario.title, selectedScenario.phId)}`
                        )
                      }
                      className="hw-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-[2px] border-amber-500/45 bg-amber-950/30 px-2.5 py-1.5 text-amber-200 hover:bg-amber-900/40 cursor-pointer"
                    >
                      <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Ask Offline Bot</span>
                    </button>

                    <button
                      type="button"
                      disabled={savingCloudPhId === selectedScenario.phId}
                      onClick={() => void handleSaveToCloud(selectedScenario)}
                      className={`hw-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-[2px] px-2.5 py-1.5 font-bold cursor-pointer ${
                        savedCloudPhIds[selectedScenario.phId]
                          ? 'hw-btn-green text-emerald-300'
                          : 'text-slate-200 hover:text-amber-200'
                      }`}
                    >
                      {savedCloudPhIds[selectedScenario.phId] ? (
                        <BookmarkCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <LabDrawerIcon name="archive" size={24} className="h-4 w-4 shrink-0" />
                      )}
                      <span>
                        {savingCloudPhId === selectedScenario.phId
                          ? 'Saving...'
                          : savedCloudPhIds[selectedScenario.phId]
                            ? 'Logged'
                            : 'Save Cloud Log'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Related / Differential Scenarios */}
                {relatedScenarios.length > 0 && (
                  <div className="hud-panel rounded-[3px] p-3">
                    <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      Related &amp; Differential Scenarios
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {relatedScenarios.map((rel) => (
                        <button
                          key={rel.phId}
                          type="button"
                          onClick={() => handleSelectScenario(rel, true)}
                          className="rounded-[2px] border border-[#2b313c] bg-[#090b0f] px-2.5 py-2 text-left transition-colors hover:border-amber-400/65 cursor-pointer"
                        >
                          <div className="flex flex-wrap items-center gap-1 font-mono text-[9.5px]">
                            <span className="font-bold text-amber-300">{rel.phId}</span>
                            {rel.relatedDtcs[0] && (
                              <span className="text-rose-300">· {rel.relatedDtcs[0]}</span>
                            )}
                            <span className="text-slate-500">· D{rel.domainNumber}</span>
                          </div>
                          <div className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-slate-200">
                            {stripScenarioIdPrefix(rel.title, rel.phId)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center font-mono text-xs text-slate-400">
                {activeTab === 'SAVED' ? (
                  <>
                    <Star className="h-7 w-7 text-amber-400/70" aria-hidden="true" />
                    <p className="max-w-sm leading-relaxed">
                      {favoriteIds.length === 0
                        ? 'Your Saved Scenarios tab is empty. Click Favorite on frequently used trouble scenarios to keep them one tap away.'
                        : 'No Saved Scenarios match your active filter criteria.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('ALL');
                        setMobileShowDetail(false);
                      }}
                      className="hw-btn hw-btn-amber rounded-[2px] px-3 py-1.5 text-[10.5px] font-bold uppercase cursor-pointer"
                    >
                      Browse All Scenarios
                    </button>
                  </>
                ) : (
                  <span>
                    Select a trouble scenario on the left to inspect its full diagnostic dossier.
                  </span>
                )}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
};
