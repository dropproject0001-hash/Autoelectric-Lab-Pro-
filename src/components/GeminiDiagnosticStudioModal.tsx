/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Camera,
  CheckCircle2,
  Copy,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Info,
  MapPin,
  Mic,
  MicOff,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import {
  animateImageToVideo,
  ChatMessageEntry,
  generateOrEditCircuitImage,
  GeminiChatRole,
  searchMapsGrounding,
  sendGeminiChat,
  sendLiveVoiceTurn,
  transcribeAudioBlob,
} from '../services/geminiIntelligenceService';
import {
  GeminiLiveVoiceSession,
  type LiveVoiceConnectionState,
  type LiveVoicePersona,
} from '../services/geminiLiveVoiceClient';
import { CircuitSolution } from '../utils/circuitSolver';
import { EcuPin, MultimeterState, PowerSupplyState } from '../types/ecu';

export type GeminiStudioTab =
  | 'CHAT'
  | 'AUDIO_TRANSCRIBE'
  | 'MAPS_GROUNDING'
  | 'VIDEO_ANIMATE'
  | 'IMAGE_STUDIO'
  | 'LIVE_VOICE';

interface GeminiDiagnosticStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: GeminiStudioTab;
  powerSupply?: PowerSupplyState;
  circuitSolution?: CircuitSolution;
  multimeter?: MultimeterState;
  pins?: EcuPin[];
}

const STARTER_DIAGNOSTIC_QUERIES = [
  'How do I test CAN bus termination resistance (60 Ohm vs 120 Ohm)?',
  'What causes a 5V sensor reference (VREF) voltage drop on an automotive ECU?',
  'Explain how to distinguish inductive crankshaft sensors from Hall-effect sensors on a bench scope.',
  'Steps to isolate a short-to-ground on an electronic fuel injector driver stage.',
];

export const GeminiDiagnosticStudioModal: React.FC<GeminiDiagnosticStudioModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'CHAT',
  powerSupply,
  circuitSolution,
  multimeter,
  pins,
}) => {
  const [activeTab, setActiveTab] = useState<GeminiStudioTab>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // =========================================================================
  // 1. CHATBOT STATE
  // =========================================================================
  const [chatRole, setChatRole] = useState<GeminiChatRole>('GENERAL');
  const [messages, setMessages] = useState<ChatMessageEntry[]>([
    {
      role: 'model',
      text: 'Welcome to the AutoElectric Diagnostic Intelligence Studio. Select an engineering analysis mode above (Deep Root-Cause, Interactive Bench Guide, General Engineering, or Rapid Pinout Check), or ask any automotive electronics question.',
      timestamp: Date.now(),
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [copiedTranscription, setCopiedTranscription] = useState(false);
  const copyTranscriptionTimerRef = useRef<number | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const buildLiveBenchSummary = useCallback(() => {
    const parts: string[] = [];
    if (powerSupply) {
      const actualAmps = circuitSolution ? circuitSolution.supplyCurrentDrawAmps : 0;
      parts.push(
        `PSU: ${powerSupply.isOutputEnabled ? 'ON' : 'OFF'} (${powerSupply.voltageSetting.toFixed(2)}V, ${powerSupply.currentLimit.toFixed(2)}A limit, ${actualAmps.toFixed(3)}A actual)`
      );
    }
    if (multimeter && circuitSolution) {
      parts.push(
        `Multimeter Mode: ${multimeter.mode} -> Display: ${circuitSolution.multimeterReading.display} ${circuitSolution.multimeterReading.unit}`
      );
    }
    if (pins && pins.length > 0) {
      const activePins = pins.filter((p) => p.isEnergized).map((p) => `${p.name} (#${p.pinNumber})`);
      parts.push(`Harness Active Pins (${activePins.length}): ${activePins.slice(0, 8).join(', ')}`);
    }
    return parts.join(' | ');
  }, [powerSupply, circuitSolution, multimeter, pins]);

  useEffect(() => {
    if (activeTab === 'CHAT') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const handleSendChat = async (textToSend?: string) => {
    const content = (textToSend || chatInput).trim();
    if (!content || chatLoading) return;

    const userEntry: ChatMessageEntry = {
      role: 'user',
      text: content,
      timestamp: Date.now(),
    };

    const nextMessages = [...messages, userEntry];
    setMessages(nextMessages);
    setChatInput('');
    setChatLoading(true);
    setChatError(null);

    try {
      const benchSummary = buildLiveBenchSummary();
      const res = await sendGeminiChat({
        messages: nextMessages,
        role: chatRole,
        benchContext: benchSummary,
      });

      if (isMountedRef.current) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'model',
            text: res.reply,
            timestamp: Date.now(),
          },
        ]);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setChatError(err instanceof Error ? err.message : 'Chat request failed');
      }
    } finally {
      if (isMountedRef.current) {
        setChatLoading(false);
      }
    }
  };

  // =========================================================================
  // 2. AUDIO TRANSCRIPTION STATE (gemini-3.5-transcribe)
  // =========================================================================
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [transcription, setTranscription] = useState('');
  const [transcribeLoading, setTranscribeLoading] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  const cleanupAudioRecorder = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // Ignore already-stopped recorder
      }
    }
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanupAudioRecorder();
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      if (copyTranscriptionTimerRef.current !== null) {
        window.clearTimeout(copyTranscriptionTimerRef.current);
        copyTranscriptionTimerRef.current = null;
      }
    };
  }, [cleanupAudioRecorder]);

  const handleCopyTranscription = useCallback(async () => {
    if (!transcription) return;
    try {
      await navigator.clipboard.writeText(transcription);
      if (!isMountedRef.current) return;
      setCopiedTranscription(true);
      if (copyTranscriptionTimerRef.current !== null) {
        window.clearTimeout(copyTranscriptionTimerRef.current);
      }
      copyTranscriptionTimerRef.current = window.setTimeout(() => {
        copyTranscriptionTimerRef.current = null;
        if (isMountedRef.current) {
          setCopiedTranscription(false);
        }
      }, 1800);
    } catch {
      if (isMountedRef.current) {
        setTranscribeError('Clipboard is unavailable in this browser context.');
      }
    }
  }, [transcription]);

  useEffect(() => {
    if (!isOpen) {
      cleanupAudioRecorder();
      setIsRecording(false);
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
    }
  }, [isOpen, cleanupAudioRecorder]);

  const startAudioRecording = async () => {
    setTranscribeError(null);
    cleanupAudioRecorder();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const fullBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        if (mediaStreamRef.current === stream) {
          mediaStreamRef.current = null;
        }
        if (isMountedRef.current) {
          setAudioBlob(fullBlob);
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);
      timerRef.current = window.setInterval(() => {
        if (isMountedRef.current) {
          setRecordSeconds((s) => s + 1);
        }
      }, 1000);
    } catch (err) {
      if (isMountedRef.current) {
        setTranscribeError(
          err instanceof Error ? err.message : 'Microphone permission denied or unsupported.'
        );
      }
    }
  };

  const stopAudioRecording = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      setIsRecording(false);
    }
  };

  const handleExecuteTranscription = async () => {
    if (!audioBlob) return;
    setTranscribeLoading(true);
    setTranscribeError(null);
    try {
      const res = await transcribeAudioBlob(audioBlob);
      if (isMountedRef.current) {
        setTranscription(res.transcription);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setTranscribeError(err instanceof Error ? err.message : 'Transcription failed.');
      }
    } finally {
      if (isMountedRef.current) {
        setTranscribeLoading(false);
      }
    }
  };

  // =========================================================================
  // 3. MAPS GROUNDING STATE (gemini-4-hydrogen + google_maps)
  // =========================================================================
  const [mapsQuery, setMapsQuery] = useState(
    'Find certified automotive electronics ECU bench testing and repair shops'
  );
  const [mapsLocation, setMapsLocation] = useState('Manila, Philippines');
  const [mapsAnswer, setMapsAnswer] = useState('');
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);

  const handleSearchMaps = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapsQuery.trim()) return;
    setMapsLoading(true);
    setMapsError(null);
    try {
      const res = await searchMapsGrounding({
        query: mapsQuery.trim(),
        location: mapsLocation.trim() || undefined,
      });
      if (isMountedRef.current) {
        setMapsAnswer(res.answer);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setMapsError(err instanceof Error ? err.message : 'Maps grounding search failed.');
      }
    } finally {
      if (isMountedRef.current) {
        setMapsLoading(false);
      }
    }
  };

  // =========================================================================
  // 4. ANIMATE IMAGES INTO VIDEO (gemini-omni-1.2-flash)
  // =========================================================================
  const [videoImageBase64, setVideoImageBase64] = useState<string | null>(null);
  const [videoImageMime, setVideoImageMime] = useState('image/png');
  const [videoPrompt, setVideoPrompt] = useState(
    'Animate this automotive circuit component with high-voltage visual glow and flowing current traces'
  );
  const [videoAspect, setVideoAspect] = useState<'16:9' | '9:16'>('16:9');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const handleVideoImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setVideoError('Uploaded image exceeds the 8MB maximum limit.');
      setVideoImageBase64(null);
      e.target.value = '';
      return;
    }
    setVideoError(null);
    setVideoImageMime(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (isMountedRef.current) {
        setVideoImageBase64(ev.target?.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAnimateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoImageBase64) return;
    setVideoLoading(true);
    setVideoError(null);
    setGeneratedVideoUrl(null);
    try {
      const res = await animateImageToVideo({
        imageBase64: videoImageBase64,
        mimeType: videoImageMime,
        prompt: videoPrompt,
        aspectRatio: videoAspect,
      });
      if (isMountedRef.current) {
        setGeneratedVideoUrl(res.videoUrl);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setVideoError(err instanceof Error ? err.message : 'Video animation failed.');
      }
    } finally {
      if (isMountedRef.current) {
        setVideoLoading(false);
      }
    }
  };

  // =========================================================================
  // 5. CREATE & EDIT IMAGES (gemini-nano-banana-2.1)
  // =========================================================================
  const [imagePrompt, setImagePrompt] = useState(
    'High-resolution technical diagram of a 16-pin automotive ECU bench harness with pin numbers and wire color codes'
  );
  const [baseDiagramBase64, setBaseDiagramBase64] = useState<string | null>(null);
  const [baseDiagramMime, setBaseDiagramMime] = useState<string>('image/png');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [imageAspect, setImageAspect] = useState<'1:1' | '16:9' | '4:3'>('16:9');
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const handleDiagramBaseUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setBaseDiagramBase64(null);
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setImageError('Reference diagram image exceeds 6MB limit.');
      return;
    }
    setImageError(null);
    setBaseDiagramMime(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (isMountedRef.current) {
        setBaseDiagramBase64(typeof ev.target?.result === 'string' ? ev.target.result : null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imagePrompt.trim()) return;
    setImageLoading(true);
    setImageError(null);
    setGeneratedImageUrl(null);
    try {
      const res = await generateOrEditCircuitImage({
        prompt: imagePrompt.trim(),
        baseImageBase64: baseDiagramBase64 || undefined,
        mimeType: baseDiagramBase64 ? baseDiagramMime : undefined,
        aspectRatio: imageAspect,
      });
      if (isMountedRef.current) {
        setGeneratedImageUrl(res.imageUrl);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setImageError(err instanceof Error ? err.message : 'Image generation failed.');
      }
    } finally {
      if (isMountedRef.current) {
        setImageLoading(false);
      }
    }
  };

  // =========================================================================
  // 6. REAL-TIME BIDIRECTIONAL LIVE VOICE (gemini-3.8-live) + TEXT FALLBACK
  // =========================================================================
  const liveSessionRef = useRef<GeminiLiveVoiceSession | null>(null);
  const [liveState, setLiveState] = useState<LiveVoiceConnectionState>('IDLE');
  const [liveVoicePersona, setLiveVoicePersona] = useState<LiveVoicePersona>('Zephyr');
  const [liveMuted, setLiveMuted] = useState(false);
  const [liveMicLevel, setLiveMicLevel] = useState(0);
  const [liveModelSpeaking, setLiveModelSpeaking] = useState(false);
  const [liveTranscripts, setLiveTranscripts] = useState<
    Array<{ id: string; speaker: 'user' | 'assistant'; text: string }>
  >([]);
  const [liveVoiceInput, setLiveVoiceInput] = useState('');
  const [liveVoiceReply, setLiveVoiceReply] = useState('');
  const [liveVoiceLoading, setLiveVoiceLoading] = useState(false);
  const [liveVoiceError, setLiveVoiceError] = useState<string | null>(null);
  const liveTranscriptBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === 'LIVE_VOICE') {
      liveTranscriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveTranscripts, activeTab]);

  const appendLiveTranscriptChunk = useCallback((speaker: 'user' | 'assistant', chunk: string) => {
    const clean = chunk;
    if (!clean) return;
    setLiveTranscripts((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          text: `${last.text}${clean}`,
        };
        return updated;
      }
      return [
        ...prev.slice(-24),
        {
          id: `${speaker}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          speaker,
          text: clean.trimStart(),
        },
      ];
    });
  }, []);

  const handleStartLiveVoice = useCallback(async () => {
    if (liveSessionRef.current) {
      liveSessionRef.current.stop();
      liveSessionRef.current = null;
    }
    setLiveVoiceError(null);
    setLiveMuted(false);

    const session = new GeminiLiveVoiceSession({
      onStateChange: (nextState) => {
        if (isMountedRef.current) setLiveState(nextState);
      },
      onInputTranscript: (delta) => {
        if (isMountedRef.current) appendLiveTranscriptChunk('user', delta);
      },
      onOutputTranscript: (delta) => {
        if (isMountedRef.current) appendLiveTranscriptChunk('assistant', delta);
      },
      onMicLevel: (rms) => {
        if (isMountedRef.current) setLiveMicLevel(rms);
      },
      onModelSpeakingChange: (speaking) => {
        if (isMountedRef.current) setLiveModelSpeaking(speaking);
      },
      onError: (msg) => {
        if (isMountedRef.current) setLiveVoiceError(msg);
      },
      onClosed: (reason) => {
        if (isMountedRef.current && reason && reason !== 'Session stopped by technician.') {
          setLiveVoiceError(reason);
        }
      },
    });
    liveSessionRef.current = session;
    await session.start({
      voiceName: liveVoicePersona,
      benchContext: buildLiveBenchSummary(),
    });
  }, [appendLiveTranscriptChunk, buildLiveBenchSummary, liveVoicePersona]);

  const handleStopLiveVoice = useCallback(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.stop();
      liveSessionRef.current = null;
    }
    setLiveState('IDLE');
    setLiveMicLevel(0);
    setLiveModelSpeaking(false);
  }, []);

  const handleToggleLiveMute = useCallback(() => {
    if (!liveSessionRef.current) return;
    const nextMuted = !liveSessionRef.current.getMuted();
    liveSessionRef.current.setMuted(nextMuted);
    setLiveMuted(nextMuted);
  }, []);

  const handleSendLiveVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = liveVoiceInput.trim();
    if (!prompt) return;

    // If real-time gemini-3.8-live WebSocket is active, inject directly into the live audio stream
    if (liveState === 'LIVE' && liveSessionRef.current?.sendTextMessage(prompt)) {
      appendLiveTranscriptChunk('user', prompt);
      setLiveVoiceInput('');
      setLiveVoiceError(null);
      return;
    }

    setLiveVoiceLoading(true);
    setLiveVoiceError(null);
    try {
      const benchSummary = buildLiveBenchSummary();
      const res = await sendLiveVoiceTurn({
        speechText: prompt,
        benchContext: benchSummary,
      });
      if (isMountedRef.current) {
        setLiveVoiceReply(res.reply);
        appendLiveTranscriptChunk('user', prompt);
        appendLiveTranscriptChunk('assistant', res.reply);
        setLiveVoiceInput('');
      }
    } catch (err) {
      if (isMountedRef.current) {
        setLiveVoiceError(err instanceof Error ? err.message : 'Live voice conversation failed.');
      }
    } finally {
      if (isMountedRef.current) {
        setLiveVoiceLoading(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Diagnostic Intelligence Studio"
        onClick={(e) => e.stopPropagation()}
        className="flex h-[92vh] w-full max-w-5xl flex-col rounded-[4px] border border-[#2b3547] bg-[#071426] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1b2535] bg-[#0c1a2d] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[3px] bg-amber-500/15 border border-amber-500/40 text-amber-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold tracking-wider text-slate-100 uppercase">
                  Diagnostic Intelligence Studio
                </span>
                <span className="rounded-[2px] bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300">
                  ONLINE PRO
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                Multimodal Automotive Diagnostics · Root-Cause Chat, Voice Transcription, Maps &amp; Visual Studio
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close diagnostic intelligence studio"
            className="rounded-[2px] p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center gap-1 border-b border-[#1a2332] bg-[#081220] px-3 py-2 font-mono text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('CHAT')}
            className={`flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 font-semibold transition-colors cursor-pointer ${
              activeTab === 'CHAT'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="h-3.5 w-3.5" />
            <span>Diagnostic Chat</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('AUDIO_TRANSCRIBE')}
            className={`flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 font-semibold transition-colors cursor-pointer ${
              activeTab === 'AUDIO_TRANSCRIBE'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mic className="h-3.5 w-3.5" />
            <span>Audio Transcribe</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MAPS_GROUNDING')}
            className={`flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 font-semibold transition-colors cursor-pointer ${
              activeTab === 'MAPS_GROUNDING'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
            <span>Maps Grounding</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('VIDEO_ANIMATE')}
            className={`flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 font-semibold transition-colors cursor-pointer ${
              activeTab === 'VIDEO_ANIMATE'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            <span>Circuit Video</span>
            <span className="rounded bg-slate-800/80 border border-slate-700 px-1 py-0.5 text-[9px] text-slate-400">
              Paid Key
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('IMAGE_STUDIO')}
            className={`flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 font-semibold transition-colors cursor-pointer ${
              activeTab === 'IMAGE_STUDIO'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span>Diagram Studio</span>
            <span className="rounded bg-slate-800/80 border border-slate-700 px-1 py-0.5 text-[9px] text-slate-400">
              Paid Key
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('LIVE_VOICE')}
            className={`flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 font-semibold transition-colors cursor-pointer ${
              activeTab === 'LIVE_VOICE'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            <span>Voice Assistant</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
          {/* =============================================================== */}
          {/* TAB 1: DIAGNOSTIC CHAT                                          */}
          {/* =============================================================== */}
          {activeTab === 'CHAT' && (
            <div className="flex h-full flex-col gap-3">
              {/* Role Selectors */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-[#1b2636] bg-[#0c1828] p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Analysis Mode:</span>
                  <button
                    type="button"
                    onClick={() => setChatRole('DEEP_REASONING')}
                    className={`rounded-[2px] px-2 py-1 text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                      chatRole === 'DEEP_REASONING'
                        ? 'bg-purple-600 text-white'
                        : 'bg-[#152030] text-slate-300 hover:bg-[#1f2e44]'
                    }`}
                  >
                    Deep Root-Cause
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatRole('COMPLEX_INTERACTIVE')}
                    className={`rounded-[2px] px-2 py-1 text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                      chatRole === 'COMPLEX_INTERACTIVE'
                        ? 'bg-blue-600 text-white'
                        : 'bg-[#152030] text-slate-300 hover:bg-[#1f2e44]'
                    }`}
                  >
                    Interactive Bench
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatRole('GENERAL')}
                    className={`rounded-[2px] px-2 py-1 text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                      chatRole === 'GENERAL'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#152030] text-slate-300 hover:bg-[#1f2e44]'
                    }`}
                  >
                    General Engineering
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatRole('FAST')}
                    className={`rounded-[2px] px-2 py-1 text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                      chatRole === 'FAST'
                        ? 'bg-amber-600 text-white'
                        : 'bg-[#152030] text-slate-300 hover:bg-[#1f2e44]'
                    }`}
                  >
                    Rapid Check
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const benchText = buildLiveBenchSummary();
                    setChatInput((prev) => (prev ? `${prev}\n[Bench Context]: ${benchText}` : `[Bench Context]: ${benchText}\n`));
                  }}
                  className="inline-flex items-center gap-1 rounded-[2px] border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                >
                  <Zap className="h-3 w-3" />
                  <span>Insert Live Bench Telemetry</span>
                </button>
              </div>

              {/* Chat Thread */}
              <div className="flex-1 space-y-3 overflow-y-auto rounded-[3px] border border-[#1b2535] bg-[#060e1a] p-3.5">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${
                      m.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div className="mb-0.5 text-[9px] uppercase tracking-wider text-slate-400">
                      {m.role === 'user' ? 'Technician' : 'Gemini Engineering AI'}
                    </div>
                    <div
                      className={`max-w-[85%] rounded-[3px] p-3 text-xs leading-relaxed whitespace-pre-wrap ${
                        m.role === 'user'
                          ? 'border border-amber-500/30 bg-amber-950/25 text-amber-100'
                          : 'border border-[#202c3e] bg-[#0c1827] text-slate-100'
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex items-center gap-2 text-amber-400 animate-pulse">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Gemini is analyzing automotive circuit telemetry...</span>
                  </div>
                )}
                {chatError && (
                  <div className="flex items-center gap-2 rounded-[2px] border border-rose-500/50 bg-rose-950/40 p-2.5 text-rose-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                    <span>{chatError}</span>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Starter Query Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-slate-400">Quick Starters:</span>
                {STARTER_DIAGNOSTIC_QUERIES.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendChat(q)}
                    className="rounded-[2px] border border-[#1c2838] bg-[#0d1624] px-2 py-1 text-[10px] text-slate-300 hover:border-amber-400 hover:text-white cursor-pointer"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Input Area */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendChat();
                    }
                  }}
                  placeholder="Ask a technical question (e.g. TPS reference voltage, CAN H/L waveforms, injector flyback spikes)..."
                  className="flex-1 rounded-[2px] border border-[#2b3547] bg-[#0c1726] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleSendChat()}
                  disabled={chatLoading || !chatInput.trim()}
                  className="inline-flex items-center gap-1.5 rounded-[2px] border border-amber-500 bg-amber-500/20 px-4 py-2 font-bold uppercase text-amber-300 hover:bg-amber-500/30 disabled:opacity-50 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 2: AUDIO TRANSCRIPTION                                      */}
          {/* =============================================================== */}
          {activeTab === 'AUDIO_TRANSCRIBE' && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div className="rounded-[3px] border border-[#1d293b] bg-[#0c1726] p-4 text-center">
                <h3 className="font-bold text-slate-200 uppercase tracking-wider mb-1">
                  Audio Diagnostic Transcription
                </h3>
                <p className="text-slate-400 text-[11px] mb-4">
                  Speak technician observations, harness pin readings, or DTC symptoms into your microphone to convert them into formatted diagnostic text.
                </p>

                <div className="flex items-center justify-center gap-3">
                  {!isRecording ? (
                    <button
                      type="button"
                      onClick={startAudioRecording}
                      className="inline-flex items-center gap-2 rounded-[3px] border border-rose-500 bg-rose-500/20 px-5 py-2.5 font-bold uppercase text-rose-300 hover:bg-rose-500/30 cursor-pointer"
                    >
                      <Mic className="h-4 w-4" />
                      <span>Start Recording</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopAudioRecording}
                      className="inline-flex items-center gap-2 rounded-[3px] border border-amber-500 bg-amber-500/20 px-5 py-2.5 font-bold uppercase text-amber-300 hover:bg-amber-500/30 cursor-pointer animate-pulse"
                    >
                      <MicOff className="h-4 w-4" />
                      <span>Stop Recording ({recordSeconds}s)</span>
                    </button>
                  )}

                  {audioBlob && !isRecording && (
                    <button
                      type="button"
                      onClick={handleExecuteTranscription}
                      disabled={transcribeLoading}
                      className="inline-flex items-center gap-1.5 rounded-[3px] border border-emerald-500 bg-emerald-500/20 px-4 py-2.5 font-bold uppercase text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className="h-4 w-4" />
                      <span>{transcribeLoading ? 'Transcribing...' : 'Transcribe Audio'}</span>
                    </button>
                  )}
                </div>
              </div>

              {transcribeError && (
                <div className="flex items-center gap-2 rounded-[2px] border border-rose-500/50 bg-rose-950/40 p-3 text-rose-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{transcribeError}</span>
                </div>
              )}

              {transcription && (
                <div className="rounded-[3px] border border-[#1e2a3c] bg-[#091321] p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#1b2637] pb-2">
                    <span className="font-bold text-slate-300 uppercase text-[10px]">
                      Verbatim Diagnostic Transcription
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyTranscription()}
                      className="inline-flex items-center gap-1 text-slate-400 hover:text-white text-[10px] cursor-pointer"
                    >
                      {copiedTranscription ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-300">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy Text</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="text-slate-100 text-xs leading-relaxed whitespace-pre-wrap">
                    {transcription}
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setChatInput(transcription);
                        setActiveTab('CHAT');
                      }}
                      className="rounded-[2px] border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-amber-300 font-bold text-[10px] hover:bg-amber-500/25 cursor-pointer"
                    >
                      Send into Diagnostic Chat
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 3: MAPS GROUNDING                                           */}
          {/* =============================================================== */}
          {activeTab === 'MAPS_GROUNDING' && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <form onSubmit={handleSearchMaps} className="rounded-[3px] border border-[#1d293b] bg-[#0c1726] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase tracking-wider text-amber-300">
                    Google Maps Grounding
                  </span>
                  <span className="text-[10px] text-slate-400">Live Location Lookup</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={mapsQuery}
                    onChange={(e) => setMapsQuery(e.target.value)}
                    placeholder="Search query (e.g. ECU repair, automotive electronics lab)..."
                    className="sm:col-span-2 rounded-[2px] border border-[#2b3547] bg-[#060e1a] px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                    required
                  />
                  <input
                    type="text"
                    value={mapsLocation}
                    onChange={(e) => setMapsLocation(e.target.value)}
                    placeholder="City / Region"
                    className="rounded-[2px] border border-[#2b3547] bg-[#060e1a] px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={mapsLoading}
                  className="inline-flex items-center gap-1.5 rounded-[2px] border border-amber-500 bg-amber-500/20 px-4 py-2 font-bold uppercase text-amber-300 hover:bg-amber-500/30 disabled:opacity-50 cursor-pointer"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{mapsLoading ? 'Searching Maps...' : 'Find Facilities via Google Maps'}</span>
                </button>
              </form>

              {mapsError && (
                <div className="flex items-center gap-2 rounded-[2px] border border-rose-500/50 bg-rose-950/40 p-3 text-rose-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{mapsError}</span>
                </div>
              )}

              {mapsAnswer && (
                <div className="rounded-[3px] border border-[#1e2a3c] bg-[#091321] p-4 space-y-2">
                  <div className="text-[10px] uppercase font-bold text-amber-300">
                    Google Maps Grounded Locations
                  </div>
                  <div className="text-slate-100 text-xs leading-relaxed whitespace-pre-wrap">
                    {mapsAnswer}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 4: ANIMATE IMAGES INTO VIDEO                                */}
          {/* =============================================================== */}
          {activeTab === 'VIDEO_ANIMATE' && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <form onSubmit={handleAnimateVideo} className="rounded-[3px] border border-[#1d293b] bg-[#0c1726] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase tracking-wider text-amber-300">
                    Animate Circuit or Component into Video
                  </span>
                  <span className="text-[10px] text-slate-400">Video Simulation</span>
                </div>
                <div className="flex items-start gap-2 rounded-[2px] border border-blue-500/30 bg-blue-950/25 p-2.5 text-[11px] text-blue-200">
                  <Info className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />
                  <div>
                    <span className="font-bold text-white">Paid Media Tier (Optional):</span> Circuit video generation requires a billing-enabled API key in server configuration. Diagnostic Chat, Audio Transcription, Maps Grounding, Voice Assistant, and Search Grounding remain available on standard keys.
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  Upload an oscilloscope trace, PCB photo, or ECU bench schematic to generate a video simulation of current flow or signal dynamics.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 mb-1">Upload Component Photo</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleVideoImageUpload}
                      className="w-full text-xs text-slate-300 file:mr-2 file:py-1 file:px-2 file:rounded-[2px] file:border-0 file:bg-slate-700 file:text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 mb-1">Video Aspect Ratio</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setVideoAspect('16:9')}
                        className={`rounded-[2px] px-3 py-1.5 font-bold text-xs cursor-pointer ${
                          videoAspect === '16:9'
                            ? 'bg-amber-500 text-black'
                            : 'bg-[#152030] text-slate-300'
                        }`}
                      >
                        16:9 (Landscape)
                      </button>
                      <button
                        type="button"
                        onClick={() => setVideoAspect('9:16')}
                        className={`rounded-[2px] px-3 py-1.5 font-bold text-xs cursor-pointer ${
                          videoAspect === '9:16'
                            ? 'bg-amber-500 text-black'
                            : 'bg-[#152030] text-slate-300'
                        }`}
                      >
                        9:16 (Portrait)
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">Motion Prompt</label>
                  <input
                    type="text"
                    value={videoPrompt}
                    onChange={(e) => setVideoPrompt(e.target.value)}
                    className="w-full rounded-[2px] border border-[#2b3547] bg-[#060e1a] px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={videoLoading || !videoImageBase64}
                  className="inline-flex items-center gap-1.5 rounded-[2px] border border-amber-500 bg-amber-500/20 px-4 py-2 font-bold uppercase text-amber-300 hover:bg-amber-500/30 disabled:opacity-50 cursor-pointer"
                >
                  <Film className="h-3.5 w-3.5" />
                  <span>{videoLoading ? 'Generating Circuit Video...' : 'Generate Circuit Video'}</span>
                </button>
              </form>

              {videoError && (
                <div className="flex items-center gap-2 rounded-[2px] border border-rose-500/50 bg-rose-950/40 p-3 text-rose-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{videoError}</span>
                </div>
              )}

              {generatedVideoUrl && (
                <div className="rounded-[3px] border border-[#1e2a3c] bg-[#091321] p-4 text-center">
                  <h4 className="font-bold text-amber-300 uppercase text-xs mb-2">Generated Video</h4>
                  <video
                    src={generatedVideoUrl}
                    controls
                    autoPlay
                    loop
                    className="max-h-80 mx-auto rounded-[3px] border border-slate-700"
                  />
                </div>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 5: CREATE & EDIT TECHNICAL DIAGRAMS                         */}
          {/* =============================================================== */}
          {activeTab === 'IMAGE_STUDIO' && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <form onSubmit={handleGenerateImage} className="rounded-[3px] border border-[#1d293b] bg-[#0c1726] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase tracking-wider text-amber-300">
                    Create &amp; Edit Technical Diagrams
                  </span>
                  <span className="text-[10px] text-slate-400">Diagram Renderer</span>
                </div>
                <div className="flex items-start gap-2 rounded-[2px] border border-blue-500/30 bg-blue-950/25 p-2.5 text-[11px] text-blue-200">
                  <Info className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />
                  <div>
                    <span className="font-bold text-white">Paid Media Tier (Optional):</span> Technical image rendering requires a billing-enabled API key in server configuration. All other diagnostic tools remain active.
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">
                    Optional Reference Diagram to Edit (PNG / JPG / WEBP)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleDiagramBaseUpload}
                      className="flex-1 text-xs text-slate-300 file:mr-2 file:py-1 file:px-2 file:rounded-[2px] file:border-0 file:bg-slate-700 file:text-white"
                    />
                    {baseDiagramBase64 && (
                      <button
                        type="button"
                        onClick={() => setBaseDiagramBase64(null)}
                        className="rounded-[2px] border border-slate-600 px-2 py-1 text-[10px] text-slate-300 hover:text-white cursor-pointer"
                      >
                        Clear Base
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">Image Prompt</label>
                  <textarea
                    rows={3}
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    className="w-full rounded-[2px] border border-[#2b3547] bg-[#060e1a] p-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                    required
                  />
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[10px] uppercase text-slate-400">Aspect Ratio:</span>
                  {(['1:1', '16:9', '4:3'] as const).map((aspect) => (
                    <button
                      key={aspect}
                      type="button"
                      onClick={() => setImageAspect(aspect)}
                      className={`rounded-[2px] px-2.5 py-1 text-xs font-bold cursor-pointer ${
                        imageAspect === aspect
                          ? 'bg-amber-500 text-black'
                          : 'bg-[#152030] text-slate-300'
                      }`}
                    >
                      {aspect}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={imageLoading}
                  className="inline-flex items-center gap-1.5 rounded-[2px] border border-amber-500 bg-amber-500/20 px-4 py-2 font-bold uppercase text-amber-300 hover:bg-amber-500/30 disabled:opacity-50 cursor-pointer"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span>{imageLoading ? 'Rendering Technical Diagram...' : 'Generate Image'}</span>
                </button>
              </form>

              {imageError && (
                <div className="flex items-center gap-2 rounded-[2px] border border-rose-500/50 bg-rose-950/40 p-3 text-rose-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{imageError}</span>
                </div>
              )}

              {generatedImageUrl && (
                <div className="rounded-[3px] border border-[#1e2a3c] bg-[#091321] p-4 text-center">
                  <h4 className="font-bold text-amber-300 uppercase text-xs mb-2">Rendered Component Image</h4>
                  <img
                    src={generatedImageUrl}
                    alt="Generated automotive circuit diagram"
                    className="max-h-80 mx-auto rounded-[3px] border border-slate-700"
                  />
                </div>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 6: REAL-TIME BIDIRECTIONAL LIVE VOICE (gemini-3.8-live)     */}
          {/* =============================================================== */}
          {activeTab === 'LIVE_VOICE' && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="rounded-[3px] border border-[#1d293b] bg-[#0c1726] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-amber-300 font-bold uppercase tracking-wider">
                    <Radio className="h-4 w-4" />
                    <span>Real-Time Hands-Free Bench Voice</span>
                  </div>
                  <span
                    className={`rounded-[2px] border px-2 py-0.5 text-[10px] font-bold uppercase ${
                      liveState === 'LIVE'
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                        : liveState === 'CONNECTING'
                          ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                          : 'border-slate-700 bg-slate-900 text-slate-400'
                    }`}
                  >
                    {liveState === 'LIVE'
                      ? liveModelSpeaking
                        ? 'AI Speaking (24kHz PCM)'
                        : liveMuted
                          ? 'Connected · Mic Muted'
                          : 'Live Bidirectional Audio'
                      : liveState === 'CONNECTING'
                        ? 'Connecting WebSocket...'
                        : 'Standby'}
                  </span>
                </div>

                <p className="text-slate-400 text-[11px]">
                  Stream hands-free voice questions directly while holding multimeter or scope probes. Interrupt anytime—speaking automatically pauses AI playback and injects your active bench PSU &amp; DMM context.
                </p>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase text-slate-400">Voice:</span>
                    {(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir'] as LiveVoicePersona[]).map(
                      (persona) => (
                        <button
                          key={persona}
                          type="button"
                          disabled={liveState === 'LIVE' || liveState === 'CONNECTING'}
                          onClick={() => setLiveVoicePersona(persona)}
                          className={`rounded-[2px] px-2 py-1 text-[10px] font-bold cursor-pointer disabled:opacity-50 ${
                            liveVoicePersona === persona
                              ? 'bg-amber-500 text-black'
                              : 'bg-[#152030] text-slate-300 hover:bg-[#1f2e44]'
                          }`}
                        >
                          {persona}
                        </button>
                      )
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {liveState !== 'LIVE' && liveState !== 'CONNECTING' ? (
                      <button
                        type="button"
                        onClick={() => void handleStartLiveVoice()}
                        className="inline-flex items-center gap-2 rounded-[3px] border border-emerald-500 bg-emerald-500/20 px-4 py-2 font-bold uppercase text-emerald-300 hover:bg-emerald-500/30 cursor-pointer"
                      >
                        <Mic className="h-4 w-4" />
                        <span>Start Live Audio</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleToggleLiveMute}
                          disabled={liveState !== 'LIVE'}
                          className={`inline-flex items-center gap-1.5 rounded-[3px] border px-3 py-2 font-bold uppercase cursor-pointer disabled:opacity-50 ${
                            liveMuted
                              ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                              : 'border-slate-600 bg-[#152030] text-slate-200 hover:border-slate-400'
                          }`}
                        >
                          {liveMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                          <span>{liveMuted ? 'Unmute' : 'Mute'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleStopLiveVoice}
                          className="inline-flex items-center gap-1.5 rounded-[3px] border border-rose-500 bg-rose-500/20 px-4 py-2 font-bold uppercase text-rose-300 hover:bg-rose-500/30 cursor-pointer"
                        >
                          <X className="h-4 w-4" />
                          <span>End Stream</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Live 16kHz Mic Input Meter */}
                {liveState === 'LIVE' && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>16kHz PCM Mic Input</span>
                      <span>{liveMuted ? 'MUTED' : `${Math.round(liveMicLevel * 100)}%`}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-[2px] bg-[#060e1a] border border-[#1d293b]">
                      <div
                        className="h-full bg-emerald-400 transition-all duration-75"
                        style={{ width: `${liveMuted ? 0 : Math.min(100, Math.round(liveMicLevel * 100))}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {liveVoiceError && (
                <div className="flex items-center gap-2 rounded-[2px] border border-rose-500/50 bg-rose-950/40 p-3 text-rose-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{liveVoiceError}</span>
                </div>
              )}

              {/* Chronological Live Voice Transcript */}
              <div className="rounded-[3px] border border-[#1e2a3c] bg-[#060e1a] p-3.5 space-y-2.5 max-h-64 overflow-y-auto">
                <div className="flex items-center justify-between border-b border-[#1b2535] pb-1.5 text-[10px] uppercase font-bold text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Volume2 className="h-3.5 w-3.5 text-amber-400" />
                    <span>Live Session Transcript</span>
                  </span>
                  {liveTranscripts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setLiveTranscripts([])}
                      className="text-slate-500 hover:text-slate-200 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {liveTranscripts.length === 0 ? (
                  <p className="text-[11px] text-slate-500 py-4 text-center">
                    Press &ldquo;Start Live Audio&rdquo; to speak directly with the bench voice engineer, or send a quick text prompt below.
                  </p>
                ) : (
                  liveTranscripts.map((entry) => (
                    <div
                      key={entry.id}
                      className={`flex flex-col ${
                        entry.speaker === 'user' ? 'items-end' : 'items-start'
                      }`}
                    >
                      <span className="text-[9px] uppercase text-slate-500 mb-0.5">
                        {entry.speaker === 'user' ? 'Technician' : `Voice Engineer (${liveVoicePersona})`}
                      </span>
                      <div
                        className={`max-w-[85%] rounded-[3px] px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                          entry.speaker === 'user'
                            ? 'border border-amber-500/30 bg-amber-950/25 text-amber-100'
                            : 'border border-[#202c3e] bg-[#0c1827] text-slate-100'
                        }`}
                      >
                        {entry.text}
                      </div>
                    </div>
                  ))
                )}
                <div ref={liveTranscriptBottomRef} />
              </div>

              {/* Typed Prompt Injection / Turn-Based Fallback */}
              <form onSubmit={handleSendLiveVoice} className="flex items-center gap-2">
                <input
                  type="text"
                  value={liveVoiceInput}
                  onChange={(e) => setLiveVoiceInput(e.target.value)}
                  placeholder={
                    liveState === 'LIVE'
                      ? 'Send a typed prompt into the live voice stream...'
                      : 'Or type a quick hands-free voice question...'
                  }
                  className="flex-1 rounded-[2px] border border-[#2b3547] bg-[#060e1a] px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                  required
                />
                <button
                  type="submit"
                  disabled={liveVoiceLoading}
                  className="inline-flex items-center gap-1.5 rounded-[2px] border border-amber-500 bg-amber-500/20 px-4 py-2 font-bold uppercase text-amber-300 hover:bg-amber-500/30 disabled:opacity-50 cursor-pointer"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>
                    {liveState === 'LIVE'
                      ? 'Send to Stream'
                      : liveVoiceLoading
                        ? 'Asking...'
                        : 'Ask'}
                  </span>
                </button>
              </form>

              {liveVoiceReply && liveTranscripts.length === 0 && (
                <div className="rounded-[3px] border border-[#1e2a3c] bg-[#091321] p-4 space-y-2">
                  <div className="text-[10px] uppercase font-bold text-amber-300 flex items-center gap-1">
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>Voice Diagnostic Response</span>
                  </div>
                  <div className="text-slate-100 text-xs leading-relaxed whitespace-pre-wrap">
                    {liveVoiceReply}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
