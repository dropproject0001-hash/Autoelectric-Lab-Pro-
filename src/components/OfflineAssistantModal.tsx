/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Send,
  Bot,
  WifiOff,
  Sparkles,
  BookOpen,
  Cpu,
  Layers,
  Activity,
  Database,
  ArrowRight,
  RotateCcw,
  Mic,
  Volume2,
  VolumeX,
  Zap,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  AssistantCitation,
  LiveBenchContext,
  OfflineDiagnosticChatbot,
} from '../services/offlineChatbotEngine';
import { SavedBenchSession, SavedDiagnosticLog } from '../services/benchStorageService';
import {
  authorizeVoiceMacroSteps,
  evaluateVoiceCommandSafetyAndRisk,
  offlineVoiceAssistant,
  VoiceAssistantState,
  VoiceCommandLogSource,
  VoiceResultMetadata,
} from '../services/offlineVoiceService';
import {
  getBenchAuthorizationAuditLog,
  type BenchAuthorizationAuditEntry,
} from '../services/benchActionAuthorizationSystem';
import {
  approveKnowledgeEntry,
  getAllVerifiedKnowledgeEntries,
  getKnowledgeCenterStats,
  rejectKnowledgeEntry,
  synchronizeKnowledgeEntries,
} from '../services/ai/localKnowledgeDB';
import type { VerifiedKnowledgeRecord } from '../types/aiAssistant';
import { EcuPin, FaultType, MultimeterState } from '../types/ecu';
import {
  executeMacroSequence,
  parseAndExecuteVoiceCommand,
  LabTab,
  VoiceCommandActions,
} from '../utils/voiceCommandParser';
import { voiceMacroService } from '../services/voiceMacroService';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: AssistantCitation[];
  suggestedPrompts?: string[];
  timestamp: number;
}

type ModalActiveSection = 'ASSISTANT_BRIDGE' | 'KNOWLEDGE_CENTER' | 'SAFETY_AUDIT';
type KnowledgeFilterTab = 'ALL' | 'APPROVED' | 'AWAITING_REVIEW' | 'CONFLICT_FLAGGED';

interface OfflineAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  liveContext: LiveBenchContext;
  savedLogs: SavedDiagnosticLog[];
  savedSessions: SavedBenchSession[];
  initialPrompt?: string | null;
  onClearInitialPrompt?: () => void;
  pins: EcuPin[];
  onSetVoltage: (volts: number) => void;
  onResetLab: () => void;
  onAttachProbeToPin: (pinId: string, label: string) => void;
  onAttachBlackProbeToPin?: (pinId: string, label: string) => void;
  onChangeMultimeter?: React.Dispatch<React.SetStateAction<MultimeterState>>;
  onAddWire?: (sourcePinId: string, targetPinId: string, color?: string, label?: string) => void;
  onToggleCutWire?: (wireId: string) => void;
  onDeleteWire?: (wireId: string) => void;
  onAddFault?: (pinId: string, faultType: FaultType, description: string) => void;
  onClearAllFaults?: () => void;
  onSetPowerSupplyOutput: (enabled: boolean) => void;
  onNavigateTab: (tab: LabTab, pinId?: string) => void;
}

const STARTER_PROMPTS = [
  'Connect pin 5 to ground',
  'Set multimeter to 20 volts',
  'Attach black probe to ground',
  'Set voltage to 12 volts',
  'Attach probe to pin 7',
  'Diagnose my current bench',
  'Open oscilloscope',
  'How to test CAN Bus 60 Ohm?',
];

export const OfflineAssistantModal: React.FC<OfflineAssistantModalProps> = ({
  isOpen,
  onClose,
  liveContext,
  savedLogs,
  savedSessions,
  initialPrompt,
  onClearInitialPrompt,
  pins,
  onSetVoltage,
  onResetLab,
  onAttachProbeToPin,
  onAttachBlackProbeToPin,
  onChangeMultimeter,
  onAddWire,
  onToggleCutWire,
  onDeleteWire,
  onAddFault,
  onClearAllFaults,
  onSetPowerSupplyOutput,
  onNavigateTab,
}) => {
  const [input, setInput] = useState('');
  const [activeSection, setActiveSection] = useState<ModalActiveSection>('ASSISTANT_BRIDGE');
  const [knowledgeRecords, setKnowledgeRecords] = useState<VerifiedKnowledgeRecord[]>([]);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [knowledgeFilter, setKnowledgeFilter] = useState<KnowledgeFilterTab>('ALL');
  const [knowledgeStats, setKnowledgeStats] = useState({
    totalRecords: 0,
    approvedCount: 0,
    awaitingReviewCount: 0,
    conflictCount: 0,
    rejectedCount: 0,
    syncedCloudCount: 0,
    totalReuseHits: 0,
  });
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<BenchAuthorizationAuditEntry[]>([]);

  const scrollEndRef = useRef<HTMLDivElement>(null);

  const botEngine = useMemo(
    () => new OfflineDiagnosticChatbot(savedLogs, savedSessions),
    [savedLogs, savedSessions]
  );

  const [voiceState, setVoiceState] = useState<VoiceAssistantState>(() =>
    offlineVoiceAssistant.getState()
  );

  const refreshKnowledgeAndAudit = useCallback(async () => {
    const [records, stats] = await Promise.all([
      getAllVerifiedKnowledgeEntries(),
      getKnowledgeCenterStats(),
    ]);
    setKnowledgeRecords(records);
    setKnowledgeStats(stats);
    setAuditEntries([...getBenchAuthorizationAuditLog()]);
  }, []);

  useEffect(() => {
    const unsub = offlineVoiceAssistant.subscribe((s) => setVoiceState(s));
    return () => {
      unsub();
      offlineVoiceAssistant.stopSpeaking();
      offlineVoiceAssistant.stopListening();
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      void refreshKnowledgeAndAudit();
    }
  }, [isOpen, activeSection, refreshKnowledgeAndAudit]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: `Offline Diagnostic, Knowledge Center & Centralized Safety Bridge ready.\n\nSpeak or type commands like:\n• **"Attach black probe to ground"**\n• **"Set multimeter to 20 volts"**\n• **"Set voltage to 12 volts"** (requires safety confirmation)\n• **"Open oscilloscope"**\n\nI have indexed all **${botEngine.indexedCount} knowledge records** from AutoElectric Lab Pro.`,
      suggestedPrompts: STARTER_PROMPTS.slice(0, 4),
      timestamp: Date.now(),
    },
  ]);

  const MAX_CHAT_MESSAGES = 60;

  useEffect(() => {
    if (isOpen && initialPrompt && initialPrompt.trim()) {
      const trimmed = initialPrompt.trim();
      sendQuery(trimmed, true);
      onClearInitialPrompt?.();
    }
  }, [isOpen, initialPrompt, onClearInitialPrompt]);

  useEffect(() => {
    if (isOpen && activeSection === 'ASSISTANT_BRIDGE') {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, activeSection]);

  if (!isOpen) return null;

  const buildVoiceActions = (): VoiceCommandActions => ({
    setVoltage: onSetVoltage,
    resetLab: onResetLab,
    attachProbeToPin: onAttachProbeToPin,
    attachBlackProbeToPin: onAttachBlackProbeToPin,
    swapProbes: () =>
      onChangeMultimeter?.((prev) => ({
        ...prev,
        redProbe: prev.blackProbe,
        blackProbe: prev.redProbe,
      })),
    disconnectProbes: () =>
      onChangeMultimeter?.((prev) => ({
        ...prev,
        redProbe: { attachedToPinId: null, attachedLabel: 'Unconnected' },
        blackProbe: { attachedToPinId: null, attachedLabel: 'Unconnected' },
      })),
    setMultimeterState: onChangeMultimeter
      ? (updates) =>
          onChangeMultimeter((prev) => ({
            ...prev,
            ...(updates.mode !== undefined ? { mode: updates.mode } : {}),
            ...(updates.isPowered !== undefined ? { isPowered: updates.isPowered } : {}),
            ...(updates.rangeAuto !== undefined ? { rangeAuto: updates.rangeAuto } : {}),
            ...(updates.holdValue !== undefined ? { holdValue: updates.holdValue } : {}),
          }))
      : undefined,
    connectWire: onAddWire
      ? (sourcePinId, targetPinId, color, label) => {
          onAddWire(sourcePinId, targetPinId, color, label);
          return true;
        }
      : undefined,
    disconnectWireByPin: onDeleteWire
      ? (pinId) => {
          const matching = liveContext.wires.filter(
            (w) => w.sourcePinId === pinId || w.targetPinId === pinId
          );
          matching.forEach((w) => onDeleteWire(w.id));
          return matching.length;
        }
      : undefined,
    toggleCutWireByPin: onToggleCutWire
      ? (pinId, cut) => {
          const matching = liveContext.wires.filter((w) => {
            const touchesPin = w.sourcePinId === pinId || w.targetPinId === pinId;
            if (!touchesPin) return false;
            if (typeof cut === 'boolean') return w.isCut !== cut;
            return true;
          });
          matching.forEach((w) => onToggleCutWire(w.id));
          return matching.length;
        }
      : undefined,
    injectFault: onAddFault,
    clearFaults: onClearAllFaults,
    readMeter: () => ({
      display: liveContext.multimeterDisplay,
      unit: liveContext.multimeterUnit,
      dtcCount: liveContext.activeDTCs.length,
      supplyVolts: liveContext.powerSupply.voltageSetting,
      isPowerOn: liveContext.powerSupply.isOutputEnabled,
      supplyAmps: liveContext.supplyCurrentDrawAmps,
    }),
    setPowerSupplyOutput: onSetPowerSupplyOutput,
    switchTab: (tab) => onNavigateTab(tab),
  });

  const handleConfirmPendingAction = () => {
    const confirmed = offlineVoiceAssistant.confirmPendingAction();
    if (!confirmed) return;
    const replyText = `✅ **Confirmed & Executed**: ${confirmed.actionSummary}`;
    setMessages((prev) =>
      [
        ...prev,
        {
          id: `b_confirm_${Date.now()}`,
          role: 'assistant' as const,
          text: replyText,
          timestamp: Date.now(),
        },
      ].slice(-MAX_CHAT_MESSAGES)
    );
    offlineVoiceAssistant.speak('Confirmed. Executing the queued bench command now.');
    void refreshKnowledgeAndAudit();
  };

  const handleCancelPendingAction = () => {
    const cancelled = offlineVoiceAssistant.cancelPendingAction();
    if (!cancelled) return;
    const replyText = `🛑 **Cancelled**: Discarded queued command "${cancelled.rawCommand}" without changing bench state.`;
    setMessages((prev) =>
      [
        ...prev,
        {
          id: `b_cancel_${Date.now()}`,
          role: 'assistant' as const,
          text: replyText,
          timestamp: Date.now(),
        },
      ].slice(-MAX_CHAT_MESSAGES)
    );
    offlineVoiceAssistant.speak('Cancelled. The queued bench command was discarded.');
    void refreshKnowledgeAndAudit();
  };

  const sendQuery = (
    queryText: string,
    triggerSpeech = true,
    source: VoiceCommandLogSource = 'TEXT_INPUT',
    meta?: VoiceResultMetadata
  ) => {
    const trimmed = queryText.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: Date.now(),
    };

    const voiceActions = buildVoiceActions();

    // Centralized Safety & Confirmation Gate evaluation first (Sections 2 & 6)
    const safetyEval = evaluateVoiceCommandSafetyAndRisk({
      rawCommand: trimmed,
      powerSupply: liveContext.powerSupply,
      pins,
      hasPendingConfirmation: Boolean(voiceState.pendingAction),
    });

    if (safetyEval.decision === 'CONFIRMED_PENDING') {
      setMessages((prev) => [...prev, userMsg].slice(-MAX_CHAT_MESSAGES));
      setInput('');
      handleConfirmPendingAction();
      return;
    }

    if (safetyEval.decision === 'CANCELLED_PENDING') {
      setMessages((prev) => [...prev, userMsg].slice(-MAX_CHAT_MESSAGES));
      setInput('');
      handleCancelPendingAction();
      return;
    }

    if (safetyEval.decision === 'REJECTED_SAFETY') {
      offlineVoiceAssistant.addCommandLog({
        source,
        rawTranscript: trimmed,
        normalizedTranscript: trimmed.toLowerCase(),
        confidence: meta?.confidence,
        status: 'REJECTED_SAFETY',
        category: 'SAFETY_INTERLOCK',
        actionDescription: safetyEval.actionSummary,
        spokenReply: safetyEval.spokenReplyEN,
      });

      const botMsg: ChatMessage = {
        id: `b_${Date.now() + 1}`,
        role: 'assistant',
        text: `🛡️ **Electrical Safety Interlock (BLOCK)**:\n\n${safetyEval.safetyReason || safetyEval.spokenReplyEN}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg, botMsg].slice(-MAX_CHAT_MESSAGES));
      setInput('');
      if (triggerSpeech) {
        offlineVoiceAssistant.speak(safetyEval.spokenReplyEN);
      }
      void refreshKnowledgeAndAudit();
      return;
    }

    // 0. Check Custom & Preset Voice Macros — pass every step through the safety authorization layer
    const matchedMacro = voiceMacroService.findMatchingMacro(trimmed);
    if (matchedMacro) {
      const macroAuth = authorizeVoiceMacroSteps({
        macroName: matchedMacro.name,
        steps: matchedMacro.steps,
        snapshot: {
          environmentMode: 'SIMULATION_MODE',
          psuOutputEnabled: liveContext.powerSupply.isOutputEnabled,
          psuVoltageSetting: liveContext.powerSupply.voltageSetting,
          psuCurrentLimitAmps: liveContext.powerSupply.currentLimit,
          ocpTripped: false,
          dmmMode: 'V_DC',
        },
      });

      if (macroAuth.overallDecision === 'BLOCK') {
        const blockMsg: ChatMessage = {
          id: `b_${Date.now() + 1}`,
          role: 'assistant',
          text: `🛡️ **Macro Blocked by Safety Interlock**:\n\n${macroAuth.blockedReasonEN || 'One or more macro steps violated bench electrical safety rules.'}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg, blockMsg].slice(-MAX_CHAT_MESSAGES));
        setInput('');
        void refreshKnowledgeAndAudit();
        return;
      }

      if (macroAuth.overallDecision === 'CONFIRM') {
        offlineVoiceAssistant.setPendingAction({
          id: `pending-macro-${Date.now()}`,
          rawCommand: trimmed,
          actionSummary: `Execute Macro "${matchedMacro.name}" (${matchedMacro.steps.length} steps)`,
          riskReason: 'Macro contains state-changing electrical operations requiring confirmation.',
          source,
          confidence: meta?.confidence,
          createdAtMs: Date.now(),
          execute: () => {
            executeMacroSequence(matchedMacro, pins, voiceActions);
          },
        });

        const confirmMsg: ChatMessage = {
          id: `b_${Date.now() + 1}`,
          role: 'assistant',
          text: `⚠️ **Confirmation Required (CONFIRM)**: Macro **"${matchedMacro.name}"** contains state-changing bench operations. Say **"Confirm"** or tap the **Confirm** button below to execute all ${matchedMacro.steps.length} steps.`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg, confirmMsg].slice(-MAX_CHAT_MESSAGES));
        setInput('');
        if (triggerSpeech) {
          offlineVoiceAssistant.speak(
            `Confirmation required for macro ${matchedMacro.name}. Say Confirm or tap Confirm to proceed.`
          );
        }
        void refreshKnowledgeAndAudit();
        return;
      }

      const macroResult = executeMacroSequence(matchedMacro, pins, voiceActions);
      offlineVoiceAssistant.addCommandLog({
        source,
        rawTranscript: trimmed,
        normalizedTranscript: `Macro: ${matchedMacro.name} (${macroResult.stepResults.length} steps)`,
        confidence: meta?.confidence,
        status: macroResult.status === 'EXECUTED' ? 'EXECUTED' : 'FAILED',
        category: 'MACRO',
        actionDescription: macroResult.actionDescription,
        spokenReply: macroResult.spokenReply,
      });

      const stepsMarkdown = macroResult.stepResults
        .map((step, idx) => `${idx + 1}. **${step.instruction}** → ${step.actionDescription}`)
        .join('\n');
      const botMsg: ChatMessage = {
        id: `b_${Date.now() + 1}`,
        role: 'assistant',
        text: `⚡ **Voice Macro Executed: ${matchedMacro.name}**\n\n${stepsMarkdown}\n\n${macroResult.spokenReply}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg, botMsg].slice(-MAX_CHAT_MESSAGES));
      setInput('');
      if (triggerSpeech) {
        offlineVoiceAssistant.speak(macroResult.spokenReply);
      }
      void refreshKnowledgeAndAudit();
      return;
    }

    // 1. State-changing single command -> queue for confirmation
    if (safetyEval.decision === 'REQUIRES_CONFIRMATION') {
      offlineVoiceAssistant.setPendingAction({
        id: `pending-cmd-${Date.now()}`,
        rawCommand: trimmed,
        actionSummary: safetyEval.actionSummary,
        riskReason: safetyEval.safetyReason || 'State-changing electrical operation',
        source,
        confidence: meta?.confidence,
        createdAtMs: Date.now(),
        proposal: safetyEval.proposal,
        authorization: safetyEval.authorization,
        execute: () => {
          parseAndExecuteVoiceCommand(trimmed, pins, voiceActions);
        },
      });

      offlineVoiceAssistant.addCommandLog({
        source,
        rawTranscript: trimmed,
        normalizedTranscript: trimmed.toLowerCase(),
        confidence: meta?.confidence,
        status: 'PENDING_CONFIRMATION',
        category: 'SAFETY_CONFIRMATION',
        actionDescription: safetyEval.actionSummary,
        spokenReply: safetyEval.spokenReplyEN,
      });

      const confirmMsg: ChatMessage = {
        id: `b_${Date.now() + 1}`,
        role: 'assistant',
        text: `⚠️ **Confirmation Required (CONFIRM)**:\n\n${safetyEval.spokenReplyEN}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg, confirmMsg].slice(-MAX_CHAT_MESSAGES));
      setInput('');
      if (triggerSpeech) {
        offlineVoiceAssistant.speak(safetyEval.spokenReplyEN);
      }
      void refreshKnowledgeAndAudit();
      return;
    }

    // 2. Direct single-step low-risk lab voice command
    const commandResult = parseAndExecuteVoiceCommand(trimmed, pins, voiceActions);

    if (commandResult.matched) {
      offlineVoiceAssistant.addCommandLog({
        source,
        rawTranscript: trimmed,
        normalizedTranscript: commandResult.normalizedTranscript || trimmed.toLowerCase(),
        confidence: meta?.confidence,
        status: commandResult.status === 'FAILED' ? 'FAILED' : 'EXECUTED',
        category: commandResult.category || 'DIAGNOSTIC',
        actionDescription: commandResult.actionDescription,
        spokenReply: commandResult.spokenReply,
      });

      const botMsg: ChatMessage = {
        id: `b_${Date.now() + 1}`,
        role: 'assistant',
        text: `⚡ **Voice Command Executed**: ${commandResult.actionDescription}\n\n${commandResult.spokenReply}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg, botMsg].slice(-MAX_CHAT_MESSAGES));
      setInput('');
      if (triggerSpeech) {
        offlineVoiceAssistant.speak(commandResult.spokenReply);
      }
      void refreshKnowledgeAndAudit();
      return;
    }

    // 3. Otherwise, fallback to MiniSearch RAG knowledge query
    const reply = botEngine.ask(trimmed, liveContext);

    offlineVoiceAssistant.addCommandLog({
      source,
      rawTranscript: trimmed,
      normalizedTranscript: commandResult.normalizedTranscript || trimmed.toLowerCase(),
      confidence: meta?.confidence,
      status: 'FALLBACK',
      category: 'DIAGNOSTIC',
      actionDescription: 'Routed to offline diagnostic assistant',
      spokenReply: reply.answer,
    });

    const botMsg: ChatMessage = {
      id: `b_${Date.now() + 1}`,
      role: 'assistant',
      text: reply.answer,
      citations: reply.citations,
      suggestedPrompts: reply.suggestedPrompts,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg, botMsg].slice(-MAX_CHAT_MESSAGES));
    setInput('');

    if (triggerSpeech) {
      offlineVoiceAssistant.speak(reply.answer);
    }
    void refreshKnowledgeAndAudit();
  };

  const handleToggleVoiceInput = () => {
    if (voiceState.isListening) {
      offlineVoiceAssistant.stopListening();
    } else {
      offlineVoiceAssistant.startListening((spokenText, meta) => {
        if (spokenText) {
          sendQuery(spokenText, true, 'SPEECH_API', meta);
        }
      });
    }
  };

  const handleToggleAutoSpeak = () => {
    offlineVoiceAssistant.toggleAutoSpeak();
  };

  const handleSpeakMessage = (text: string) => {
    if (voiceState.isSpeaking) {
      offlineVoiceAssistant.stopSpeaking();
    } else {
      offlineVoiceAssistant.speak(text, true);
    }
  };

  const handleResetChat = () => {
    offlineVoiceAssistant.stopSpeaking();
    offlineVoiceAssistant.stopListening();
    setMessages([
      {
        id: `welcome_${Date.now()}`,
        role: 'assistant',
        text: `Chat cleared. Local MiniSearch index has **${botEngine.indexedCount} records** loaded and centralized safety authorization is active.`,
        suggestedPrompts: STARTER_PROMPTS.slice(0, 4),
        timestamp: Date.now(),
      },
    ]);
  };

  const handleApproveRecord = async (id: string) => {
    await approveKnowledgeEntry(id);
    await refreshKnowledgeAndAudit();
  };

  const handleRejectRecord = async (id: string) => {
    await rejectKnowledgeEntry(id);
    await refreshKnowledgeAndAudit();
  };

  const handleSyncKnowledge = async () => {
    const res = await synchronizeKnowledgeEntries();
    setSyncNotice(
      `Synchronized ${res.syncedCount} local entries (${res.totalApproved} approved records ready for offline & cloud use).`
    );
    await refreshKnowledgeAndAudit();
  };

  const filteredKnowledgeRecords = knowledgeRecords.filter((rec) => {
    if (knowledgeFilter === 'APPROVED' && (rec.reviewStatus || 'APPROVED') !== 'APPROVED') {
      return false;
    }
    if (knowledgeFilter === 'AWAITING_REVIEW' && rec.reviewStatus !== 'AWAITING_REVIEW') {
      return false;
    }
    if (
      knowledgeFilter === 'CONFLICT_FLAGGED' &&
      rec.reviewStatus !== 'CONFLICT_FLAGGED' &&
      rec.classification !== 'CONFLICTING_INFORMATION'
    ) {
      return false;
    }
    if (!knowledgeSearch.trim()) return true;
    const q = knowledgeSearch.trim().toLowerCase();
    return (
      rec.subject.toLowerCase().includes(q) ||
      rec.rootCauseSummary.toLowerCase().includes(q) ||
      rec.tokens.some((t) => t.toLowerCase().includes(q)) ||
      (rec.originalQuestion && rec.originalQuestion.toLowerCase().includes(q))
    );
  });

  const renderBadgeIcon = (kind: AssistantCitation['kind']) => {
    switch (kind) {
      case 'OEM_MANUAL':
        return <BookOpen className="w-3 h-3 text-amber-400" />;
      case 'ECU_PINOUT':
        return <Cpu className="w-3 h-3 text-amber-300" />;
      case 'PCB_HOTSPOT':
        return <Layers className="w-3 h-3 text-amber-400" />;
      case 'PH_SCENARIO':
        return <Database className="w-3 h-3 text-cyan-300" />;
      case 'SAVED_DB_LOG':
      case 'SAVED_BENCH':
        return <Database className="w-3 h-3 text-emerald-400" />;
      default:
        return <Activity className="w-3 h-3 text-slate-300" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-black/80">
      <div className="relative w-full max-w-4xl h-[88vh] flex flex-col hud-panel rounded-[3px] border-[#3c4554] shadow-2xl overflow-hidden font-mono text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 hud-header shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[2px] hw-lcd-well border-emerald-700/60 flex items-center justify-center">
              <Bot className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-hud font-bold text-slate-100 tracking-wide uppercase">
                  Diagnostic Intelligence & Local-First Knowledge Center
                </h2>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-[2px] bg-[#0c1a12] border border-emerald-700/70 text-emerald-300 flex items-center gap-1">
                  <WifiOff className="w-2.5 h-2.5" />
                  LOCAL-FIRST READY
                </span>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-[2px] bg-[#0e1624] border border-cyan-700/70 text-cyan-300 flex items-center gap-1">
                  <ShieldCheck className="w-2.5 h-2.5 text-cyan-400" />
                  SIMULATION MODE · SAFETY INTERLOCK ON
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                {botEngine.indexedCount} Static + {knowledgeStats.approvedCount} Learned Verified Records · {knowledgeStats.totalReuseHits} Offline Reuse Hits
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleToggleAutoSpeak}
              className={`hw-btn p-1.5 rounded-[2px] transition flex items-center gap-1 text-[11px] font-mono ${
                voiceState.autoSpeakReplies
                  ? 'hw-btn-green'
                  : 'text-slate-400 hover:text-white'
              }`}
              title={
                voiceState.autoSpeakReplies
                  ? 'Voice Assistant Speech Output ON (Click to Mute)'
                  : 'Voice Assistant Speech Output Muted (Click to Enable)'
              }
            >
              {voiceState.autoSpeakReplies ? (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" />
              )}
              <span className="hidden sm:inline text-[10px]">
                {voiceState.autoSpeakReplies ? 'Voice ON' : 'Muted'}
              </span>
            </button>

            <button
              onClick={handleResetChat}
              className="hw-btn p-1.5 rounded-[2px] text-slate-400 hover:text-white transition"
              title="Reset Chat"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="hw-btn p-1.5 rounded-[2px] text-slate-400 hover:text-white transition"
              title="Close Assistant"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Section Tabs (Section 10) */}
        <div className="px-4 py-1.5 bg-[#0e1218] border-b border-[#2b313c] flex items-center justify-between gap-2 flex-wrap shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveSection('ASSISTANT_BRIDGE')}
              className={`px-2.5 py-1 rounded-[2px] text-[10px] font-bold uppercase tracking-wider transition flex items-center gap-1.5 ${
                activeSection === 'ASSISTANT_BRIDGE'
                  ? 'bg-amber-500/20 border border-amber-500/70 text-amber-200'
                  : 'bg-[#151a22] border border-[#2b313c] text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Voice & Diagnostic Bridge</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('KNOWLEDGE_CENTER')}
              className={`px-2.5 py-1 rounded-[2px] text-[10px] font-bold uppercase tracking-wider transition flex items-center gap-1.5 ${
                activeSection === 'KNOWLEDGE_CENTER'
                  ? 'bg-emerald-500/20 border border-emerald-500/70 text-emerald-200'
                  : 'bg-[#151a22] border border-[#2b313c] text-slate-400 hover:text-slate-200'
              }`}
            >
              <Database className="w-3 h-3" />
              <span>Knowledge Center ({knowledgeStats.totalRecords})</span>
              {knowledgeStats.conflictCount > 0 && (
                <span className="px-1.5 py-0.2 bg-rose-900/70 border border-rose-500/60 text-rose-200 rounded-[2px] text-[9px]">
                  {knowledgeStats.conflictCount} Conflict
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('SAFETY_AUDIT')}
              className={`px-2.5 py-1 rounded-[2px] text-[10px] font-bold uppercase tracking-wider transition flex items-center gap-1.5 ${
                activeSection === 'SAFETY_AUDIT'
                  ? 'bg-cyan-500/20 border border-cyan-500/70 text-cyan-200'
                  : 'bg-[#151a22] border border-[#2b313c] text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              <span>Safety Audit ({auditEntries.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-[10px] text-slate-300 tabular-nums">
            <span>
              PSU:{' '}
              <strong className={liveContext.powerSupply.isOutputEnabled ? 'text-emerald-400' : 'text-rose-400'}>
                {liveContext.powerSupply.isOutputEnabled ? `${liveContext.powerSupply.voltageSetting.toFixed(1)}V ON` : 'OFF'}
              </strong>
            </span>
            <span>
              DRAW: <strong className="text-amber-300">{liveContext.supplyCurrentDrawAmps.toFixed(2)}A</strong>
            </span>
            <span>
              DTCs:{' '}
              <strong className={liveContext.activeDTCs.length > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                {liveContext.activeDTCs.length > 0
                  ? liveContext.activeDTCs.map((d) => d.code).join(', ')
                  : 'NONE'}
              </strong>
            </span>
          </div>
        </div>

        {/* Pending Safety Confirmation Bar */}
        {voiceState.pendingAction && (
          <div className="px-4 py-2 bg-[#231908] border-b border-amber-500/80 flex items-center justify-between gap-2 flex-wrap shrink-0">
            <div className="flex items-center gap-2 text-[11px] text-amber-200">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold uppercase">Safety Authorization Pending: </span>
                <span>{voiceState.pendingAction.actionSummary}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleConfirmPendingAction}
                className="hw-btn hw-btn-green px-2.5 py-1 rounded-[2px] text-[10px] font-bold uppercase"
              >
                Confirm & Execute
              </button>
              <button
                type="button"
                onClick={handleCancelPendingAction}
                className="hw-btn px-2.5 py-1 rounded-[2px] text-[10px] text-rose-300 border-rose-700/70 uppercase"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: VOICE & DIAGNOSTIC BRIDGE */}
        {activeSection === 'ASSISTANT_BRIDGE' && (
          <>
            <div className="px-4 py-2 bg-[#0e1116] border-b border-[#2b313c] flex items-center justify-between gap-2 overflow-x-auto scrollbar-none shrink-0">
              <div className="flex items-center gap-1.5">
                {STARTER_PROMPTS.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendQuery(p)}
                    className="hw-btn text-[10px] px-2.5 py-1 rounded-[2px] text-slate-300 hover:text-amber-200 hover:border-amber-500/60 whitespace-nowrap transition"
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                onClick={() => sendQuery('Diagnose my current bench')}
                className="hw-btn hw-btn-green px-2 py-0.5 rounded-[2px] text-[10px] font-bold flex items-center gap-1 shrink-0 transition"
              >
                <Sparkles className="w-3 h-3" />
                <span>Diagnose Live Bench</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[#0a0c10]">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-2 max-w-[92%] ${
                    msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`rounded-[2px] px-3.5 py-2.5 text-xs font-sans leading-relaxed whitespace-pre-wrap border ${
                        msg.role === 'user'
                          ? 'bg-[#241b0c] border-amber-500/60 text-amber-100'
                          : 'bg-[#151920] border-[#2b313c] text-slate-200'
                      }`}
                    >
                      {msg.text}
                    </div>

                    {msg.role === 'assistant' && voiceState.hasSpeechSynthesis && (
                      <button
                        onClick={() => handleSpeakMessage(msg.text)}
                        className="hw-btn p-1 rounded-[2px] text-slate-400 hover:text-emerald-400 transition shrink-0"
                        title={voiceState.isSpeaking ? 'Stop speaking' : 'Read message aloud (offline voice)'}
                      >
                        <Volume2 className={`w-3.5 h-3.5 ${voiceState.isSpeaking ? 'text-emerald-400' : ''}`} />
                      </button>
                    )}
                  </div>

                  {msg.citations && msg.citations.length > 0 && (
                    <div className="w-full flex flex-col gap-1.5 mt-0.5">
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider font-mono">
                        Matched Knowledge Sources ({msg.citations.length}):
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {msg.citations.slice(0, 4).map((cit) => (
                          <div
                            key={cit.id}
                            className="hw-lcd-well rounded-[2px] p-2 flex flex-col justify-between gap-1.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {renderBadgeIcon(cit.kind)}
                                <span className="text-[10px] font-bold text-slate-200 truncate">
                                  {cit.title}
                                </span>
                              </div>
                              <span className="text-[9px] text-slate-500 font-mono shrink-0">
                                {cit.kind.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-sans line-clamp-2">
                              {cit.snippet}
                            </p>
                            {cit.actionTab && (
                              <button
                                onClick={() => {
                                  onNavigateTab(cit.actionTab!, cit.targetPinId);
                                  onClose();
                                }}
                                className="self-start text-[10px] text-amber-300 hover:text-amber-200 flex items-center gap-1 font-mono font-semibold"
                              >
                                <span>Open {cit.actionTab.replace('_', ' ')}</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.suggestedPrompts && msg.suggestedPrompts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      {msg.suggestedPrompts.map((sp, i) => (
                        <button
                          key={i}
                          onClick={() => sendQuery(sp)}
                          className="hw-btn text-[10px] px-2 py-0.5 rounded-[2px] text-amber-200 transition font-sans"
                        >
                          {sp}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div ref={scrollEndRef} />
            </div>
          </>
        )}

        {/* TAB 2: KNOWLEDGE CENTER (SECTION 10) */}
        {activeSection === 'KNOWLEDGE_CENTER' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-[#0a0c10]">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="hw-lcd-well p-2.5 rounded-[2px] border border-emerald-800/50">
                <div className="text-[9px] text-slate-400 uppercase">Approved Local DB</div>
                <div className="text-lg font-bold text-emerald-400 tabular-nums">
                  {knowledgeStats.approvedCount}
                </div>
                <div className="text-[9px] text-slate-500">Served before online AI</div>
              </div>
              <div className="hw-lcd-well p-2.5 rounded-[2px] border border-amber-800/50">
                <div className="text-[9px] text-slate-400 uppercase">Awaiting Review</div>
                <div className="text-lg font-bold text-amber-300 tabular-nums">
                  {knowledgeStats.awaitingReviewCount}
                </div>
                <div className="text-[9px] text-slate-500">Technician verification queue</div>
              </div>
              <div className="hw-lcd-well p-2.5 rounded-[2px] border border-rose-800/50">
                <div className="text-[9px] text-slate-400 uppercase">Conflicts Flagged</div>
                <div className="text-lg font-bold text-rose-400 tabular-nums">
                  {knowledgeStats.conflictCount}
                </div>
                <div className="text-[9px] text-slate-500">Protected from overwrite</div>
              </div>
              <div className="hw-lcd-well p-2.5 rounded-[2px] border border-cyan-800/50">
                <div className="text-[9px] text-slate-400 uppercase">Offline Reuse Hits</div>
                <div className="text-lg font-bold text-cyan-300 tabular-nums">
                  {knowledgeStats.totalReuseHits}
                </div>
                <div className="text-[9px] text-slate-500">
                  {knowledgeStats.syncedCloudCount} Cloud-Synced
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#12161e] p-2.5 rounded-[2px] border border-[#2b313c]">
              <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={knowledgeSearch}
                  onChange={(e) => setKnowledgeSearch(e.target.value)}
                  placeholder="Search saved technical answers, DTCs, pinouts, or symptoms..."
                  className="bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none w-full font-sans"
                />
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {(['ALL', 'APPROVED', 'AWAITING_REVIEW', 'CONFLICT_FLAGGED'] as KnowledgeFilterTab[]).map(
                  (tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setKnowledgeFilter(tab)}
                      className={`px-2 py-0.5 rounded-[2px] text-[9px] font-bold uppercase ${
                        knowledgeFilter === tab
                          ? 'bg-emerald-600/30 border border-emerald-500 text-emerald-200'
                          : 'bg-[#181d26] border border-[#2b313c] text-slate-400'
                      }`}
                    >
                      {tab.replace(/_/g, ' ')}
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={handleSyncKnowledge}
                  className="hw-btn hw-btn-green px-2.5 py-0.5 rounded-[2px] text-[9px] font-bold flex items-center gap-1"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span>Sync DB</span>
                </button>
              </div>
            </div>

            {syncNotice && (
              <div className="px-3 py-1.5 rounded-[2px] bg-[#0c1e14] border border-emerald-700/70 text-emerald-200 text-[10px] flex items-center justify-between">
                <span>{syncNotice}</span>
                <button
                  type="button"
                  onClick={() => setSyncNotice(null)}
                  className="text-emerald-400 hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            )}

            {filteredKnowledgeRecords.length === 0 ? (
              <div className="hw-lcd-well p-6 rounded-[2px] text-center text-xs text-slate-400">
                No learned knowledge records match the current filter. When online AI answers a new technical question, it is automatically validated, classified, versioned, and stored here for permanent offline reuse.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {filteredKnowledgeRecords.map((rec) => (
                  <div
                    key={rec.id}
                    className="hw-lcd-well p-3 rounded-[2px] border border-[#2b313c] flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-amber-300 uppercase">
                          {rec.subject}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold bg-[#141b26] border border-cyan-700/60 text-cyan-300">
                          {rec.classification || 'UNIVERSAL_TRAINER_KNOWLEDGE'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-[2px] text-[9px] bg-[#161b22] border border-slate-700 text-slate-300">
                          v{rec.version || 1} · {rec.technicalCategory || 'GENERAL_BENCH'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-[2px] text-[9px] bg-[#161b22] border border-slate-700 text-slate-400">
                          Evidence: {rec.evidenceSource || 'LOCAL_TECHNICAL_KNOWLEDGE'} ({rec.evidenceStatus || 'VALID'})
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {rec.reviewStatus !== 'APPROVED' && (
                          <button
                            type="button"
                            onClick={() => handleApproveRecord(rec.id)}
                            className="hw-btn hw-btn-green px-2 py-0.5 rounded-[2px] text-[9px] font-bold flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>Approve</span>
                          </button>
                        )}
                        {rec.reviewStatus !== 'REJECTED' && (
                          <button
                            type="button"
                            onClick={() => handleRejectRecord(rec.id)}
                            className="hw-btn px-2 py-0.5 rounded-[2px] text-[9px] text-rose-300 border-rose-700/70"
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </div>

                    {rec.conflictReason && (
                      <div className="p-2 rounded-[2px] bg-rose-950/50 border border-rose-600/60 text-rose-200 text-[10px] flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span>{rec.conflictReason}</span>
                      </div>
                    )}

                    <div className="text-[11px] text-slate-200 font-sans leading-relaxed">
                      <strong>Root Cause:</strong> {rec.rootCauseSummary}
                    </div>
                    <div className="text-[10px] text-amber-200/90 font-sans">
                      <strong>Safety Warning:</strong> {rec.safetyWarning}
                    </div>
                    <div className="text-[10px] text-emerald-300/90 font-sans">
                      <strong>Verification Step:</strong> {rec.verificationStep}
                    </div>

                    <div className="flex items-center justify-between text-[9px] text-slate-500 pt-1 border-t border-[#222834] flex-wrap gap-2">
                      <span>
                        ECU Applicability:{' '}
                        {rec.ecuApplicability?.isUniversalTrainer !== false
                          ? 'UNIVERSAL TRAINER'
                          : `${rec.ecuApplicability?.brandKey || 'OEM'} ${rec.ecuApplicability?.modelName || ''}`}
                      </span>
                      <span>
                        Reuse Hits: {rec.hitCount || 0} · Sync: {rec.syncStatus || 'LOCAL_ONLY'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CENTRALIZED SAFETY AUTHORIZATION AUDIT LOG (SECTION 2) */}
        {activeSection === 'SAFETY_AUDIT' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5 bg-[#0a0c10]">
            <div className="text-xs text-slate-300 font-sans">
              Every AI, voice command, macro step, and bench state operation passes through the centralized{' '}
              <strong>Bench Action Authorization System</strong> (<code className="text-amber-300">ALLOW | CONFIRM | BLOCK</code>).
            </div>
            {auditEntries.length === 0 ? (
              <div className="hw-lcd-well p-6 rounded-[2px] text-center text-xs text-slate-400">
                No bench authorization events recorded in this session yet.
              </div>
            ) : (
              auditEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="hw-lcd-well p-2.5 rounded-[2px] border border-[#2b313c] flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold uppercase ${
                          entry.decision === 'ALLOW'
                            ? 'bg-emerald-950 border border-emerald-600 text-emerald-300'
                            : entry.decision === 'CONFIRM'
                              ? 'bg-amber-950 border border-amber-600 text-amber-300'
                              : 'bg-rose-950 border border-rose-600 text-rose-300'
                        }`}
                      >
                        {entry.decision}
                      </span>
                      <span className="text-[10px] font-bold text-slate-200">
                        {entry.actionType}
                      </span>
                      <span className="text-[9px] text-slate-400">
                        [{entry.environmentMode} · {entry.eventKind}]
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-500 tabular-nums">
                      {new Date(entry.timestampMs).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 font-sans">
                    Command: <code className="text-amber-200">{entry.commandText}</code>
                  </div>
                  <div className="text-[10px] text-slate-400 font-sans">{entry.details}</div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Voice Listening Wave & Live Interim Transcript Indicator */}
        {voiceState.isListening && (
          <div className="px-4 py-1.5 bg-[#1c1507] border-t border-amber-500/60 flex items-center justify-between text-[11px] text-amber-200 shrink-0 animate-in fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
              <span className="font-bold shrink-0">Listening:</span>
              <span className="text-slate-200 font-mono text-[10px] truncate">
                {voiceState.interimTranscript
                  ? `"${voiceState.interimTranscript}"`
                  : '(Try: "Attach black probe to ground", "Set multimeter to 20 volts")'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => offlineVoiceAssistant.stopListening()}
              className="hw-btn text-[10px] text-rose-300 hover:text-white px-2 py-0.5 rounded-[2px] border-rose-700/70 shrink-0"
            >
              Cancel
            </button>
          </div>
        )}
        {voiceState.error && (
          <div className="px-4 py-1.5 bg-[#1c1507] border-t border-amber-500/50 flex items-center justify-between text-[10px] text-amber-200 shrink-0">
            <span>{voiceState.error}</span>
            <button
              type="button"
              onClick={() => offlineVoiceAssistant.clearError()}
              className="text-amber-300 hover:text-white px-1.5"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Input Form with Offline Voice Mic Button */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuery(input);
          }}
          className="p-3 bg-[#13171e] border-t border-[#2b313c] flex items-center gap-2 shrink-0"
        >
          {voiceState.hasSpeechRecognition && (
            <button
              type="button"
              onClick={handleToggleVoiceInput}
              className={`hw-btn p-2 rounded-[2px] transition flex items-center justify-center ${
                voiceState.isListening
                  ? 'hw-btn-amber animate-pulse'
                  : 'text-slate-300 hover:text-amber-300'
              }`}
              title={
                voiceState.isListening
                  ? 'Listening... Click to stop voice input'
                  : 'Click to speak lab command hands-free (Web Speech Voice)'
              }
            >
              <Mic className="w-4 h-4" />
            </button>
          )}

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              voiceState.isListening
                ? 'Listening to your voice command...'
                : 'Type or speak command ("Set voltage to 12V", "Attach probe to pin 7", "Confirm")...'
            }
            className="hw-lcd-well flex-1 rounded-[2px] px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="hw-btn hw-btn-amber px-4 py-2 disabled:opacity-50 rounded-[2px] text-xs font-bold flex items-center gap-1.5 transition"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
};
