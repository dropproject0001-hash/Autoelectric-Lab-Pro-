import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  MicOff,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  AssistantCitation,
  LiveBenchContext,
  OfflineDiagnosticChatbot,
} from '../services/offlineChatbotEngine';
import { SavedBenchSession, SavedDiagnosticLog } from '../services/benchStorageService';
import {
  offlineVoiceAssistant,
  VoiceAssistantState,
  VoiceCommandLogSource,
  VoiceResultMetadata,
} from '../services/offlineVoiceService';
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
  const scrollEndRef = useRef<HTMLDivElement>(null);

  // Build / refresh MiniSearch index locally whenever project or saved DB records update
  const botEngine = useMemo(
    () => new OfflineDiagnosticChatbot(savedLogs, savedSessions),
    [savedLogs, savedSessions]
  );

  const [voiceState, setVoiceState] = useState<VoiceAssistantState>(() =>
    offlineVoiceAssistant.getState()
  );

  // Subscribe to offline voice assistant state changes
  useEffect(() => {
    const unsub = offlineVoiceAssistant.subscribe((s) => setVoiceState(s));
    return () => {
      unsub();
      offlineVoiceAssistant.stopSpeaking();
      offlineVoiceAssistant.stopListening();
    };
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: `Offline Diagnostic & Voice Command Bridge ready (powered by Web Speech API & MiniSearch — zero internet or API key required).\n\nSpeak or type commands like:\n• **"Connect pin 5 to ground"**\n• **"Set multimeter to 20 volts"**\n• **"Attach black probe to ground"**\n• **"Set voltage to 12 volts"**\n• **"Open oscilloscope"**\n\nI have indexed all **${botEngine.indexedCount} knowledge records** from AutoElectric Lab Pro.`,
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
    if (isOpen) {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

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

    const voiceActions: VoiceCommandActions = {
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
    };

    // 0. Check Custom & Preset Voice Macros first
    const matchedMacro = voiceMacroService.findMatchingMacro(trimmed);
    if (matchedMacro) {
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
      return;
    }

    // 1. Direct single-step lab voice command
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
      return;
    }

    // 2. Otherwise, fallback to MiniSearch RAG knowledge query
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
        text: `Chat cleared. Local MiniSearch index has **${botEngine.indexedCount} records** loaded and voice command bridge active.`,
        suggestedPrompts: STARTER_PROMPTS.slice(0, 4),
        timestamp: Date.now(),
      },
    ]);
  };

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
                  Offline Assistant & Voice Command Bridge
                </h2>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-[2px] bg-[#0c1a12] border border-emerald-700/70 text-emerald-300 flex items-center gap-1">
                  <WifiOff className="w-2.5 h-2.5" />
                  100% OFFLINE
                </span>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-[2px] bg-[#1c1507] border border-amber-600/70 text-amber-300 flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5 text-amber-400" />
                  Voice-to-Command Active
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                {botEngine.indexedCount} Records Indexed · Commands: "Connect pin 5 to ground", "Set multimeter to 20 volts", "Reset lab"
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Auto-Speak Toggle */}
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

        {/* Live MNA Bench Context Bar */}
        <div className="px-4 py-1.5 bg-[#12161d] border-b border-[#2b313c] flex flex-wrap items-center justify-between gap-2 text-[10px] shrink-0">
          <div className="flex items-center gap-3 flex-wrap text-slate-300 tabular-nums">
            <span>
              LIVE PSU:{' '}
              <strong className={liveContext.powerSupply.isOutputEnabled ? 'text-emerald-400' : 'text-rose-400'}>
                {liveContext.powerSupply.isOutputEnabled ? `${liveContext.powerSupply.voltageSetting.toFixed(1)}V ON` : 'OFF'}
              </strong>
            </span>
            <span>
              DRAW: <strong className="text-amber-300">{liveContext.supplyCurrentDrawAmps.toFixed(2)}A</strong>
            </span>
            <span>
              ACTIVE DTCs:{' '}
              <strong className={liveContext.activeDTCs.length > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                {liveContext.activeDTCs.length > 0
                  ? liveContext.activeDTCs.map((d) => d.code).join(', ')
                  : 'NONE'}
              </strong>
            </span>
          </div>

          <button
            onClick={() => sendQuery('Diagnose my current bench')}
            className="hw-btn hw-btn-green px-2 py-0.5 rounded-[2px] font-bold flex items-center gap-1 transition"
          >
            <Sparkles className="w-3 h-3" />
            <span>Diagnose Live Bench</span>
          </button>
        </div>

        {/* Quick Voice Command Chips */}
        <div className="px-4 py-2 bg-[#0e1116] border-b border-[#2b313c] flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
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

        {/* Chat History */}
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

              {/* Matched Knowledge Citations */}
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

              {/* Suggested Follow-ups */}
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

        {/* Voice Listening Wave & Live Interim Transcript Indicator */}
        {voiceState.isListening && (
          <div className="px-4 py-1.5 bg-[#1c1507] border-t border-amber-500/60 flex items-center justify-between text-[11px] text-amber-200 shrink-0 animate-in fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
              <span className="font-bold shrink-0">Listening:</span>
              <span className="text-slate-200 font-mono text-[10px] truncate">
                {voiceState.interimTranscript
                  ? `"${voiceState.interimTranscript}"`
                  : '(Try: "Connect pin 5 to ground", "Set multimeter to 20 volts")'}
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
                : 'Type or speak command ("Set voltage to 12V", "Attach probe to pin 7", "Reset lab")...'
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
