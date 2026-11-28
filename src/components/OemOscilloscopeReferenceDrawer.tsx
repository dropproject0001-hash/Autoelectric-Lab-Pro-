/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Mic,
  MicOff,
  Search,
  Send,
  Sliders,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  getAllOscilloscopeWaveforms,
  getOscilloscopeWaveformManifest,
  searchOscilloscopeWaveforms,
} from '../services/oscilloscopeWaveformKnowledgeService';
import type {
  OscilloscopeGuideCategory,
  OscilloscopeWaveformRecord,
} from '../types/oscilloscopeWaveformIngestion';
import {
  renderRealisticDsoCanvas,
  synthesizeOemWaveform,
  type WaveformCompareViewMode,
} from '../simulation/signals/OemWaveformSynthesizer';
import { parseScopeAndDrawerVoiceCommand } from '../services/ai/oscilloscopeVoiceControlService';
import { runUnifiedAiOrchestrator } from '../services/ai/unifiedAiOrchestrator';
import { formatOrchestratorResponseForVoice } from '../services/ai/localKnowledgeAdoptionEngine';
import { sendGeminiChat } from '../services/geminiIntelligenceService';

type UnifiedDrawerAiMode = 'AUTO_ALL' | 'OFFLINE_LLM' | 'LIVE_AI';

export interface OemOscilloscopeReferenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Live parent oscilloscope state synced with the drawer's sliding AI Voice controller */
  scopeState: {
    voltDiv: number;
    timeDiv: number;
    rpm: number;
    isRunning: boolean;
    phosphorEnabled: boolean;
  };
  onSetVoltDiv: (voltDiv: number) => void;
  onSetTimeDiv: (timeDiv: number) => void;
  onSetRpm?: (rpm: number) => void;
  onToggleRun: (running: boolean) => void;
  onTogglePhosphor: (enabled: boolean) => void;
}

interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  meta?: string;
}

const CATEGORY_TABS: Array<{ id: 'ALL' | OscilloscopeGuideCategory; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'sensors', label: 'Sensors' },
  { id: 'ignition', label: 'Ignition' },
  { id: 'actuators', label: 'Actuators' },
  { id: 'communication', label: 'CAN / LIN' },
  { id: 'charging-starting', label: 'Charging' },
  { id: 'system-tests', label: 'System' },
];

export const OemOscilloscopeReferenceDrawer: React.FC<OemOscilloscopeReferenceDrawerProps> = ({
  isOpen,
  onClose,
  scopeState,
  onSetVoltDiv,
  onSetTimeDiv,
  onSetRpm,
  onToggleRun,
  onTogglePhosphor,
}) => {
  const manifest = useMemo(() => getOscilloscopeWaveformManifest(), []);
  const allRecords = useMemo(() => getAllOscilloscopeWaveforms(), []);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'ALL' | OscilloscopeGuideCategory>('ALL');
  const [selectedRecordId, setSelectedRecordId] = useState<string>(() => {
    const inj = allRecords.find((r) => r.signalFamily === 'INJECTOR_FUEL');
    return inj?.id || allRecords[0]?.id || '';
  });
  const [compareMode, setCompareMode] = useState<WaveformCompareViewMode>('OVERLAY');
  const [localRpm, setLocalRpm] = useState<number>(scopeState.rpm || 850);
  const [localTimeScale, setLocalTimeScale] = useState<number>(1.0);
  const [jitterTick, setJitterTick] = useState<number>(0);

  // Unified Sliding Popup Drawer state (Offline AI + Local LLM + Live Cloud AI + Hands-Free Voice Control)
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [aiEngineMode, setAiEngineMode] = useState<UnifiedDrawerAiMode>('AUTO_ALL');
  const [aiInput, setAiInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Unified AI Ready (Offline AI + Local LLM + Live AI). Say or type a scope command ("set voltage to 5V", "set timebase to 2x", "show faulty", "load CAN bus", "hold") or ask any diagnostic question about the active signal.',
      meta: 'Unified AI • Offline + Local LLM + Live AI',
    },
  ]);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    setLocalRpm(scopeState.rpm || 850);
  }, [scopeState.rpm]);

  // Subtle realistic trigger-locked micro-jitter animation when scope is running
  useEffect(() => {
    if (!isOpen || !scopeState.isRunning) return;
    const timer = window.setInterval(() => {
      setJitterTick((t) => (t + 1) % 1000);
    }, 180);
    return () => window.clearInterval(timer);
  }, [isOpen, scopeState.isRunning]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim();
    const cat = activeCategory === 'ALL' ? undefined : activeCategory;
    if (!q && !cat) return allRecords;
    return searchOscilloscopeWaveforms({ query: q || undefined, category: cat }).map(
      (hit) => hit.record
    );
  }, [allRecords, searchQuery, activeCategory]);

  const activeRecord: OscilloscopeWaveformRecord | null = useMemo(() => {
    return (
      allRecords.find((r) => r.id === selectedRecordId) ||
      filteredRecords[0] ||
      allRecords[0] ||
      null
    );
  }, [allRecords, filteredRecords, selectedRecordId]);

  const synthesized = useMemo(() => {
    if (!activeRecord) return null;
    return synthesizeOemWaveform({
      signalFamily: activeRecord.signalFamily,
      rpm: localRpm,
      sampleCount: 480,
      triggerJitterPhase: jitterTick,
      timebaseScale: localTimeScale,
    });
  }, [activeRecord, localRpm, jitterTick, localTimeScale]);

  useEffect(() => {
    if (!isOpen || !previewCanvasRef.current || !synthesized) return;
    renderRealisticDsoCanvas({
      canvas: previewCanvasRef.current,
      packet: synthesized,
      viewMode: compareMode,
      phosphorEnabled: scopeState.phosphorEnabled,
      isPowerOn: true,
    });
  }, [isOpen, synthesized, compareMode, scopeState.phosphorEnabled]);

  const speakText = useCallback(
    (text: string) => {
      if (!speakReplies || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text.replace(/[*#`_]+/g, '').slice(0, 320));
        utter.rate = 0.96;
        window.speechSynthesis.speak(utter);
      } catch {
        // Ignore TTS blocks
      }
    },
    [speakReplies]
  );

  const handleExportSnapshot = () => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !activeRecord) return;
    try {
      const link = document.createElement('a');
      link.download = `${activeRecord.agtCode}-${compareMode.toLowerCase()}-reference.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // Ignore export error in restricted environments
    }
  };

  const handleSubmitAiCommandOrQuestion = useCallback(
    async (rawText: string) => {
      const cleaned = rawText.trim();
      if (!cleaned) return;

      const userMsg: AiChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: cleaned,
      };
      setAiMessages((prev) => [...prev.slice(-8), userMsg]);
      setAiInput('');

      // 1. Check direct hands-free Oscilloscope & Drawer control commands first
      const action = parseScopeAndDrawerVoiceCommand(cleaned, {
        voltDiv: scopeState.voltDiv,
        timeDiv: scopeState.timeDiv,
        rpm: localRpm,
        isRunning: scopeState.isRunning,
      });

      if (action.type !== 'NONE') {
        switch (action.type) {
          case 'SET_VOLT_DIV':
            onSetVoltDiv(action.voltDiv);
            break;
          case 'SET_TIME_DIV':
            onSetTimeDiv(action.timeDiv);
            setLocalTimeScale(action.timeDiv);
            break;
          case 'SET_RPM':
            setLocalRpm(action.rpm);
            onSetRpm?.(action.rpm);
            break;
          case 'SET_COMPARE_MODE':
            setCompareMode(action.mode);
            break;
          case 'TOGGLE_RUN':
            onToggleRun(action.running);
            break;
          case 'TOGGLE_PHOSPHOR':
            onTogglePhosphor(action.enabled);
            break;
          case 'LOAD_OEM_WAVEFORM':
            setSelectedRecordId(action.record.id);
            break;
        }
        setAiMessages((prev) => [
          ...prev.slice(-8),
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: action.spokenReply,
            meta: `Scope Command • ${action.type}`,
          },
        ]);
        speakText(action.spokenReply);
        return;
      }

      // 2. Otherwise query the Unified AI Stack (Offline AI + On-Device Local WebGPU LLM + Live Gemini Cloud AI)
      setIsAiThinking(true);
      try {
        const isBrowserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        const contextualQuery = activeRecord
          ? `${cleaned} (Active OEM Waveform: ${activeRecord.title} ${activeRecord.agtCode}, Mode: ${compareMode})`
          : cleaned;
        const benchContextSummary = [
          activeRecord
            ? `Active OEM Waveform: ${activeRecord.title} (${activeRecord.agtCode}, ${activeRecord.category})`
            : 'No OEM waveform selected',
          `Compare Mode: ${compareMode}`,
          `Simulated Scope Settings: V/div=${scopeState.voltDiv}V, Timebase=${scopeState.timeDiv}x, RPM=${localRpm}, Run=${scopeState.isRunning ? 'RUNNING' : 'HOLD'}, Phosphor=${scopeState.phosphorEnabled ? 'ON' : 'OFF'}`,
          synthesized
            ? `Simulated Readings: Good Vmax=${synthesized.metricsGood.vMax}V/Vmin=${synthesized.metricsGood.vMin}V, Faulty Vmax=${synthesized.metricsFaulty.vMax}V/Vmin=${synthesized.metricsFaulty.vMin}V`
            : '',
          activeRecord?.faultyComparison.associatedDtcs.length
            ? `Associated DTCs: ${activeRecord.faultyComparison.associatedDtcs.slice(0, 6).join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join(' | ');

        // Direct Live AI mode tries Gemini Live Chat first with full drawer/scope telemetry,
        // and transparently falls back to Offline AI + Local LLM if offline or quota-limited.
        if (aiEngineMode === 'LIVE_AI' && !isBrowserOffline) {
          try {
            const liveResp = await sendGeminiChat({
              messages: [{ role: 'user', text: cleaned }],
              role: 'DEEP_REASONING',
              benchContext: benchContextSummary,
            });
            if (liveResp?.reply && liveResp.reply.trim().length > 0) {
              setAiMessages((prev) => [
                ...prev.slice(-8),
                {
                  id: `a-${Date.now()}`,
                  role: 'assistant',
                  text: liveResp.reply.trim(),
                  meta: `Live AI • ${liveResp.model || 'Gemini Free Tier'}`,
                },
              ]);
              speakText(liveResp.reply.trim());
              return;
            }
          } catch {
            // Automatic silent fallback to Unified Offline AI + Local LLM below
          }
        }

        const allowCloud = aiEngineMode !== 'OFFLINE_LLM' && !isBrowserOffline;
        const orch = await runUnifiedAiOrchestrator({
          query: contextualQuery,
          allowLocalLlm: true,
          allowGeminiFreeTier: allowCloud,
          isOffline: aiEngineMode === 'OFFLINE_LLM' || isBrowserOffline,
          includeUnverifiedDb: true,
          cloudExplainerFn: allowCloud
            ? async (sanitizedPrompt: string) => {
                const liveResp = await sendGeminiChat({
                  messages: [{ role: 'user', text: sanitizedPrompt }],
                  role: 'DEEP_REASONING',
                  benchContext: benchContextSummary,
                });
                return {
                  text: liveResp.reply,
                  model: liveResp.model || 'gemini-free-tier',
                };
              }
            : undefined,
          simulationContext: {
            selectedComponent: activeRecord ? `${activeRecord.title} (${activeRecord.agtCode})` : undefined,
            rpm: localRpm,
            dmmReadingSummary: synthesized
              ? `SIMULATED Scope (${compareMode}): Vmax=${(compareMode === 'FAULTY' ? synthesized.metricsFaulty : synthesized.metricsGood).vMax}V, Vmin=${(compareMode === 'FAULTY' ? synthesized.metricsFaulty : synthesized.metricsGood).vMin}V, V/div=${scopeState.voltDiv}V, T/div=${scopeState.timeDiv}x`
              : undefined,
            activeDtcs: activeRecord?.faultyComparison.associatedDtcs.slice(0, 5),
          },
        });
        const formatted = formatOrchestratorResponseForVoice({
          answer: orch.answer,
          evidenceLevel: orch.evidenceLevel,
          executionMode: orch.executionMode,
          sources: orch.sources,
          hasEvidenceGap: orch.hasEvidenceGap,
          lang: 'EN',
          hasSimulationContext: true,
        });
        const engineBadge =
          orch.executionMode === 'GEMINI_FREE_TIER_ASSIST'
            ? 'Live AI + Verified DB'
            : orch.executionMode === 'LOCAL_WEBGPU_LLM'
            ? 'Local WebGPU LLM + Offline DB'
            : 'Offline AI Engine';
        setAiMessages((prev) => [
          ...prev.slice(-8),
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: formatted.spokenText,
            meta: `${engineBadge} • ${formatted.matchedSource}`,
          },
        ]);
        speakText(formatted.spokenText);
      } catch {
        setAiMessages((prev) => [
          ...prev.slice(-8),
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: 'Local knowledge lookup encountered an error. You can still inspect all 118 OEM reference waveforms offline.',
            meta: 'Offline AI Fallback',
          },
        ]);
      } finally {
        setIsAiThinking(false);
      }
    },
    [
      activeRecord,
      aiEngineMode,
      compareMode,
      localRpm,
      onSetRpm,
      onSetTimeDiv,
      onSetVoltDiv,
      onTogglePhosphor,
      onToggleRun,
      scopeState.isRunning,
      scopeState.phosphorEnabled,
      scopeState.timeDiv,
      scopeState.voltDiv,
      speakText,
      synthesized,
    ]
  );

  const toggleVoiceMic = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    if (typeof window === 'undefined') return;
    const win = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
    };
    const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!Ctor) {
      setAiMessages((prev) => [
        ...prev.slice(-8),
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: 'Browser microphone SpeechRecognition is unavailable here — type your command or question directly below.',
          meta: 'Text Mode Active',
        },
      ]);
      return;
    }
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const transcript = ev.results?.[0]?.[0]?.transcript || '';
      if (transcript.trim()) {
        void handleSubmitAiCommandOrQuestion(transcript);
      }
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
    setIsListening(true);
    rec.start();
  };

  if (!isOpen) return null;

  const activeMetrics =
    synthesized && compareMode === 'FAULTY'
      ? synthesized.metricsFaulty
      : synthesized?.metricsGood;
  const isFaultHighlight = compareMode === 'FAULTY';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-[2px]"
      role="dialog"
      aria-label="OEM Reference Waveforms Drawer"
    >
      {/* Click outside to close */}
      <div className="flex-1" onClick={onClose} />

      {/* Right Slide-Over Drawer Chassis */}
      <aside className="dso-alloy-chassis relative flex h-full w-full max-w-[520px] flex-col text-[#dce1e8] shadow-2xl">
        <div className="dso-alloy-top-rail" />

        {/* Drawer Header */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 pb-3 pt-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#aeb7c4]" />
              <h2 className="font-instrument-num truncate text-xs font-bold uppercase tracking-[0.12em] text-[#eceff4]">
                OEM Reference Waveforms ({manifest.totalWaveformsIngested})
              </h2>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-[#8590a0]">
              <span className="dso-alloy-frame font-instrument-num px-1.5 py-0.5 text-[9px] uppercase text-[#c7d1de]">
                SIMULATED REFERENCE
              </span>
              <span className="dso-alloy-frame font-instrument-num px-1.5 py-0.5 text-[9px]">
                <span className="dso-led-green font-semibold">{manifest.totalDtcsIndexed}</span> DTCs
              </span>
              <span className="dso-alloy-frame font-instrument-num px-1.5 py-0.5 text-[9px]">
                1.15px FINE-BEAM
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close OEM Reference Waveforms Drawer"
            className="dso-alloy-frame p-1.5 text-[#9ba4b2] hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="space-y-2 border-b border-white/10 bg-[#0d1015] px-4 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[#6e7785]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sensor, waveform, AGT code, or DTC (e.g. P0335, CAN, injector)..."
              className="dso-alloy-frame w-full py-1.5 pl-8 pr-3 text-[11px] text-[#eceff4] placeholder-[#6e7785] focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {CATEGORY_TABS.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`font-instrument-num rounded-[3px] border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider transition cursor-pointer ${
                  activeCategory === cat.id
                    ? 'border-[#8c96a6] bg-[#242a34] text-[#f1f5f9]'
                    : 'border-[#333a45] bg-[#12161c] text-[#8a94a3] hover:text-[#dce1e8]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Content Area (leaves bottom space for sliding AI Voice Drawer handle) */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-20 pt-3">
          {activeRecord && synthesized && (
            <div className="space-y-2.5">
              {/* Active Guide Title + Mode Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-instrument-num text-[10px] font-semibold text-[#8c96a6]">
                    {activeRecord.agtCode} • {activeRecord.signalFamily.replace(/_/g, ' ')}
                  </div>
                  <div className="truncate text-xs font-semibold text-[#f1f5f9]">
                    {activeRecord.title}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {(['GOOD', 'FAULTY', 'OVERLAY'] as WaveformCompareViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setCompareMode(mode)}
                      className={`font-instrument-num rounded-[3px] border px-2 py-0.5 text-[9.5px] font-semibold uppercase cursor-pointer ${
                        compareMode === mode
                          ? mode === 'FAULTY'
                            ? 'border-[#b84b56] bg-[#281518] text-[#f0c2c7]'
                            : 'border-[#848f9f] bg-[#252c37] text-[#f1f5f9]'
                          : 'border-[#343b47] bg-[#12161c] text-[#8b94a3] hover:text-white'
                      }`}
                    >
                      {mode === 'GOOD' ? 'Good' : mode === 'FAULTY' ? 'Faulty' : 'Overlay'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recessed Flat-Alloy Fine-Beam DSO Canvas */}
              <div className="dso-alloy-screen-bezel p-1.5">
                <canvas
                  ref={previewCanvasRef}
                  width={460}
                  height={165}
                  className="block h-[165px] w-full rounded-[3px]"
                />
              </div>

              {/* Flat-Alloy Digital Parameter Boxes (Strict Instrument LED Green / Red) */}
              {activeMetrics && (
                <div className="grid grid-cols-4 gap-1.5">
                  <div className="dso-alloy-frame px-2 py-1.5 text-center">
                    <div className="font-instrument-num text-[8px] uppercase tracking-wider text-[#757f8e]">
                      Vmax
                    </div>
                    <div
                      className={`font-instrument-num mt-0.5 text-xs font-semibold ${
                        isFaultHighlight ? 'dso-led-red' : 'dso-led-green'
                      }`}
                    >
                      {activeMetrics.vMax.toFixed(2)}
                      <span className="ml-0.5 text-[9px] text-[#7a8494]">V</span>
                    </div>
                  </div>
                  <div className="dso-alloy-frame px-2 py-1.5 text-center">
                    <div className="font-instrument-num text-[8px] uppercase tracking-wider text-[#757f8e]">
                      Vmin
                    </div>
                    <div
                      className={`font-instrument-num mt-0.5 text-xs font-semibold ${
                        isFaultHighlight ? 'dso-led-red' : 'dso-led-green'
                      }`}
                    >
                      {activeMetrics.vMin.toFixed(2)}
                      <span className="ml-0.5 text-[9px] text-[#7a8494]">V</span>
                    </div>
                  </div>
                  <div className="dso-alloy-frame px-2 py-1.5 text-center">
                    <div className="font-instrument-num text-[8px] uppercase tracking-wider text-[#757f8e]">
                      Vpp
                    </div>
                    <div
                      className={`font-instrument-num mt-0.5 text-xs font-semibold ${
                        isFaultHighlight ? 'dso-led-red' : 'dso-led-green'
                      }`}
                    >
                      {activeMetrics.vpp.toFixed(2)}
                      <span className="ml-0.5 text-[9px] text-[#7a8494]">V</span>
                    </div>
                  </div>
                  <div className="dso-alloy-frame px-2 py-1.5 text-center">
                    <div className="font-instrument-num text-[8px] uppercase tracking-wider text-[#757f8e]">
                      Freq
                    </div>
                    <div className="font-instrument-num dso-led-green mt-0.5 text-xs font-semibold">
                      {activeMetrics.freqHz >= 1000
                        ? `${(activeMetrics.freqHz / 1000).toFixed(0)}k`
                        : activeMetrics.freqHz.toFixed(1)}
                      <span className="ml-0.5 text-[9px] text-[#7a8494]">Hz</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Compact Simulation Controls (RPM + Timebase + PNG Export) */}
              <div className="dso-alloy-frame flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 text-[10px]">
                <div className="flex items-center gap-2">
                  <Sliders className="h-3 w-3 text-[#7a8494]" />
                  <span className="font-instrument-num text-[#8b94a3]">RPM</span>
                  <input
                    type="range"
                    min={0}
                    max={5000}
                    step={50}
                    value={localRpm}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setLocalRpm(v);
                      onSetRpm?.(v);
                    }}
                    className="w-20 accent-[#7a8494]"
                  />
                  <span className="font-instrument-num dso-led-green font-semibold">{localRpm}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleExportSnapshot}
                    className="dso-alloy-frame font-instrument-num inline-flex items-center gap-1 px-2 py-0.5 text-[9.5px] text-[#dce1e8] hover:text-white cursor-pointer"
                  >
                    <Download className="h-3 w-3" /> PNG
                  </button>
                  <a
                    href={activeRecord.provenance.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dso-alloy-frame font-instrument-num inline-flex items-center gap-1 px-2 py-0.5 text-[9.5px] text-[#aeb7c4] hover:text-white"
                  >
                    <ExternalLink className="h-3 w-3" /> Source
                  </a>
                </div>
              </div>

              {/* Known-Good vs Faulty Diagnostic Comparison Cards */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="dso-alloy-frame p-2.5 text-[10.5px]">
                  <div className="font-instrument-num mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-[#b5c0cf]">
                    <span className="dso-micro-led dso-micro-led-green" /> Known-Good Reference
                  </div>
                  <div className="text-[#dce1e8]">{activeRecord.knownGood.waveformShape}</div>
                  {activeRecord.knownGood.extractedVoltageSpecs.length > 0 && (
                    <div className="font-instrument-num dso-led-green mt-1 text-[10px]">
                      Specs: {activeRecord.knownGood.extractedVoltageSpecs.slice(0, 3).join(' · ')}
                    </div>
                  )}
                </div>

                <div className="dso-alloy-frame p-2.5 text-[10.5px]">
                  <div className="font-instrument-num mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-[#b5c0cf]">
                    <span className="dso-micro-led dso-micro-led-red" /> Faulty Signal Deviation
                  </div>
                  <div className="text-[#e6c4c8]">{synthesized.faultyDescription}</div>
                  {activeRecord.faultyComparison.faultIndicators[0] && (
                    <div className="mt-1 text-[10px] text-[#9ba4b2]">
                      • {activeRecord.faultyComparison.faultIndicators[0]}
                    </div>
                  )}
                </div>
              </div>

              {/* Associated DTCs */}
              {activeRecord.faultyComparison.associatedDtcs.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="font-instrument-num text-[9px] uppercase tracking-wider text-[#757f8e]">
                    DTCs:
                  </span>
                  {activeRecord.faultyComparison.associatedDtcs.slice(0, 8).map((dtc) => (
                    <span
                      key={dtc}
                      className="dso-alloy-frame font-instrument-num dso-led-red px-1.5 py-0.5 text-[9px] font-semibold"
                    >
                      {dtc}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Library List of All 118 OEM Waveforms */}
          <div className="pt-1">
            <div className="font-instrument-num mb-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-[#7a8494]">
              OEM Waveform Library ({filteredRecords.length} shown)
            </div>
            <div className="max-h-[210px] space-y-1 overflow-y-auto pr-0.5">
              {filteredRecords.slice(0, 40).map((rec) => {
                const isSelected = activeRecord?.id === rec.id;
                return (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => setSelectedRecordId(rec.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-[4px] border px-2.5 py-1.5 text-left transition cursor-pointer ${
                      isSelected
                        ? 'border-[#848f9f] bg-[#202630] text-[#f1f5f9]'
                        : 'border-[#2b323d] bg-[#0e1218] text-[#9ba4b2] hover:border-[#525b68] hover:text-[#e2e8f0]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-medium">{rec.title}</div>
                      <div className="font-instrument-num text-[9px] text-[#707a8a]">
                        {rec.agtCode} • {rec.category}
                      </div>
                    </div>
                    {rec.faultyComparison.associatedDtcs.length > 0 && (
                      <span className="font-instrument-num shrink-0 text-[9px] text-[#8c96a6]">
                        {rec.faultyComparison.associatedDtcs.length} DTC
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ====================================================================
            UNIFIED SLIDING POPUP AI DRAWER (OFFLINE AI + LOCAL LLM + LIVE AI)
            Slides up cleanly from bottom of the OEM drawer and collapses back down
           ==================================================================== */}
        <div
          className={`absolute inset-x-0 bottom-0 z-20 flex flex-col border-t-2 border-[#7c8798] bg-[#0d1117]/98 shadow-[0_-12px_32px_rgba(0,0,0,0.75)] transition-all duration-250 ${
            isAiDrawerOpen ? 'h-[62%]' : 'h-[48px]'
          }`}
        >
          {/* Slide Handle / Pop-Up Toggle Bar */}
          <button
            type="button"
            onClick={() => setIsAiDrawerOpen((v) => !v)}
            className="flex h-[48px] shrink-0 w-full items-center justify-between px-4 text-left hover:bg-white/[0.03] cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="h-4 w-4 text-[#4ade80] shrink-0" />
              <div className="min-w-0">
                <div className="font-instrument-num text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#eceff4] truncate">
                  Unified AI Drawer • Offline + Local LLM + Live AI
                </div>
                <div className="text-[9.5px] text-[#7f8998] truncate">
                  {isAiDrawerOpen
                    ? 'Slide down to hide • Hands-free voice, scope control & live/offline answers'
                    : 'Slide up for Offline AI, Local LLM, Live AI & hands-free scope control'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="dso-micro-led dso-micro-led-green" />
              {isAiDrawerOpen ? (
                <ChevronDown className="h-4 w-4 text-[#aeb7c4]" />
              ) : (
                <ChevronUp className="h-4 w-4 text-[#aeb7c4]" />
              )}
            </div>
          </button>

          {/* Expanded Sliding Unified AI Interaction Body */}
          {isAiDrawerOpen && (
            <div className="flex min-h-0 flex-1 flex-col border-t border-white/10 px-3.5 pb-3 pt-2">
              {/* Unified Engine Mode Selector (All-in-One Popup: Auto All / Offline+LLM / Live AI) */}
              <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1">
                  {(
                    [
                      { id: 'AUTO_ALL', label: 'ALL (AUTO)' },
                      { id: 'OFFLINE_LLM', label: 'OFFLINE + LLM' },
                      { id: 'LIVE_AI', label: 'LIVE AI' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setAiEngineMode(mode.id)}
                      className={`dso-alloy-frame font-instrument-num px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider cursor-pointer ${
                        aiEngineMode === mode.id
                          ? 'dso-led-green border-[#4ade80]/60'
                          : 'text-[#8c96a6] hover:text-[#dce3ed]'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                <span className="font-instrument-num text-[9px] text-[#7c8798]">
                  {aiEngineMode === 'AUTO_ALL'
                    ? 'Offline DB → Local LLM → Live AI'
                    : aiEngineMode === 'OFFLINE_LLM'
                    ? '100% Offline + Local WebGPU LLM'
                    : 'Live Gemini AI + Offline Fallback'}
                </span>
              </div>

              {/* Quick Voice/Scope Control Chips */}
              <div className="mb-2 flex flex-wrap gap-1">
                {[
                  'Set voltage to 5V',
                  'Set timebase to 2x',
                  'Show faulty',
                  'Overlay compare',
                  'Set RPM to 2500',
                  'Hold',
                ].map((cmd) => (
                  <button
                    key={cmd}
                    type="button"
                    onClick={() => void handleSubmitAiCommandOrQuestion(cmd)}
                    className="dso-alloy-frame font-instrument-num px-2 py-0.5 text-[9.5px] text-[#c7d1de] hover:text-white cursor-pointer"
                  >
                    {cmd}
                  </button>
                ))}
              </div>

              {/* Conversation History */}
              <div className="flex-1 space-y-2 overflow-y-auto pr-1 text-[11px]">
                {aiMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-[4px] border px-2.5 py-1.5 ${
                      msg.role === 'user'
                        ? 'ml-6 border-[#525b68] bg-[#1b2028] text-[#eceff4]'
                        : 'mr-4 border-[#323a46] bg-[#090c10] text-[#d4dae3]'
                    }`}
                  >
                    <div className="leading-snug">{msg.text}</div>
                    {msg.meta && (
                      <div className="font-instrument-num mt-1 text-[9px] text-[#757f8e]">
                        {msg.meta}
                      </div>
                    )}
                  </div>
                ))}
                {isAiThinking && (
                  <div className="font-instrument-num text-[10px] text-[#4ade80]">
                    Analyzing local OEM waveform database & Local LLM...
                  </div>
                )}
              </div>

              {/* Hands-Free Mic + TTS + Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSubmitAiCommandOrQuestion(aiInput);
                }}
                className="mt-2 flex items-center gap-1.5"
              >
                <button
                  type="button"
                  onClick={toggleVoiceMic}
                  title={isListening ? 'Stop voice recognition' : 'Start hands-free voice command'}
                  className={`dso-alloy-frame p-2 cursor-pointer ${
                    isListening ? 'dso-led-red border-[#b84b56]' : 'dso-led-green'
                  }`}
                >
                  {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setSpeakReplies((v) => !v)}
                  title={speakReplies ? 'Mute voice replies' : 'Enable voice replies'}
                  className="dso-alloy-frame p-2 text-[#9ba4b2] hover:text-white cursor-pointer"
                >
                  {speakReplies ? (
                    <Volume2 className="h-3.5 w-3.5" />
                  ) : (
                    <VolumeX className="h-3.5 w-3.5" />
                  )}
                </button>
                <input
                  type="text"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder='Ask about this signal or say "set voltage to 5V"...'
                  className="dso-alloy-frame min-w-0 flex-1 px-2.5 py-1.5 text-[11px] text-[#eceff4] placeholder-[#6e7785] focus:outline-none"
                />
                <button
                  type="submit"
                  className="dso-alloy-frame p-2 text-[#4ade80] hover:text-white cursor-pointer"
                  aria-label="Send AI command"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
