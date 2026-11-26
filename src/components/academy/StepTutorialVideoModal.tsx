/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Cpu,
  Film,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { LabGuidanceStep, UniversityLabModule } from '../../data/universityLabCurriculum';
import type { EcuPin } from '../../types/ecu';
import {
  buildGroundedStepSpec,
  buildStepTutorialSubtitles,
  type GroundedStepTutorialSpec,
  type InstructorTutorialSettings,
  type StepTutorialSubtitleCue,
  type TutorialDurationSec,
} from '../../utils/stepTutorialBuilder';
import {
  loadOrGenerateStepTutorial,
  type CachedStepTutorialEntry,
} from '../../services/stepTutorialCacheService';
import { playTutorialCueTone } from '../../utils/audioFeedback';

export interface StepTutorialVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  module: UniversityLabModule;
  step: LabGuidanceStep;
  ecuPins?: readonly EcuPin[];
  settings: InstructorTutorialSettings;
  onFocusProbePin?: (pinId: string, label: string, openScope?: boolean) => void;
}

const SPEED_OPTIONS = [0.75, 1, 1.25] as const;

interface InteractiveStepSchematicProps {
  spec: GroundedStepTutorialSpec;
  activeCue: StepTutorialSubtitleCue | null;
  progressRatio: number;
  isPlaying: boolean;
}

const InteractiveStepSchematic: React.FC<InteractiveStepSchematicProps> = ({
  spec,
  activeCue,
  progressRatio,
  isPlaying,
}) => {
  const focusArea = activeCue?.focusArea ?? 'PSU';
  const psuActive = spec.requiredPsuState === 'ON';
  const pulseOn = isPlaying && progressRatio > 0.24;
  const readingSettled = progressRatio >= 0.56;

  return (
    <div
      data-testid="step-tutorial-interactive-schematic"
      className="relative h-full w-full select-none overflow-hidden bg-[#040912]"
    >
      <svg
        viewBox="0 0 960 540"
        className="h-full w-full"
        role="img"
        aria-label={`Interactive animated schematic for ${spec.stepTitle}`}
      >
        <defs>
          <pattern id="tut-bench-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path
              d="M 32 0 L 0 0 0 32"
              fill="none"
              stroke="rgba(32,54,83,0.45)"
              strokeWidth="1"
            />
          </pattern>
          <linearGradient id="tut-ecu-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16263d" />
            <stop offset="100%" stopColor="#0a1322" />
          </linearGradient>
        </defs>

        {/* ESD Mat Background */}
        <rect width="960" height="540" fill="url(#tut-bench-grid)" />

        {/* Header Strip inside schematic */}
        <text
          x="32"
          y="36"
          fill="#91A4BD"
          fontSize="13"
          fontFamily="JetBrains Mono, monospace"
        >
          {spec.exerciseCode} · STEP {spec.stepNumber} · {spec.targetUnit}
        </text>
        <text
          x="928"
          y="36"
          textAnchor="end"
          fill="#19C8F5"
          fontSize="13"
          fontFamily="JetBrains Mono, monospace"
        >
          INTERACTIVE SCHEMATIC GUIDANCE
        </text>

        {/* 1. Bench Power Supply (Top Left) */}
        <g transform="translate(36, 70)">
          <rect
            width="230"
            height="156"
            rx="10"
            fill="#0A1220"
            stroke={focusArea === 'PSU' ? '#19C8F5' : '#203653'}
            strokeWidth={focusArea === 'PSU' ? '2.5' : '1.5'}
          />
          <text x="16" y="28" fill="#EAF3FF" fontSize="13" fontWeight="700" fontFamily="Rajdhani, sans-serif">
            BENCH POWER SUPPLY
          </text>
          <rect x="16" y="42" width="198" height="54" rx="6" fill="#050A12" stroke="#203653" />
          <text
            x="28"
            y="75"
            fill={psuActive ? '#20D889' : '#FFB020'}
            fontSize="24"
            fontWeight="700"
            fontFamily="JetBrains Mono, monospace"
          >
            {psuActive ? `${spec.psuVoltageSetting.toFixed(1)} V · ON` : '0.0 V · OFF'}
          </text>
          <text x="16" y="122" fill="#91A4BD" fontSize="11.5" fontFamily="JetBrains Mono, monospace">
            REQ STATE: {spec.requiredPsuState}
          </text>
          <text x="16" y="140" fill="#6F849F" fontSize="10.5" fontFamily="JetBrains Mono, monospace">
            {psuActive ? 'KL30/KL15 Rail Energized' : 'Cold Safety Resistance Mode'}
          </text>
        </g>

        {/* 2. Digital Multimeter (Top Right) */}
        <g transform="translate(674, 70)">
          <rect
            width="250"
            height="196"
            rx="10"
            fill="#0A1220"
            stroke={focusArea === 'DMM_DIAL' || focusArea === 'READING' ? '#FFB020' : '#203653'}
            strokeWidth={focusArea === 'DMM_DIAL' || focusArea === 'READING' ? '2.5' : '1.5'}
          />
          <text x="16" y="28" fill="#EAF3FF" fontSize="13" fontWeight="700" fontFamily="Rajdhani, sans-serif">
            DIGITAL MULTIMETER (DMM)
          </text>
          <rect x="16" y="42" width="218" height="62" rx="6" fill="#050A12" stroke="#203653" />
          <text
            x="28"
            y="80"
            fill={readingSettled ? '#20D889' : '#19C8F5'}
            fontSize="21"
            fontWeight="700"
            fontFamily="JetBrains Mono, monospace"
          >
            {readingSettled ? spec.expectedReadingLabel : 'SETTLING...'}
          </text>
          <text x="16" y="126" fill="#FFB020" fontSize="12" fontWeight="600" fontFamily="JetBrains Mono, monospace">
            MODE: {spec.dmmModeDisplay}
          </text>
          <text x="16" y="146" fill="#91A4BD" fontSize="11" fontFamily="JetBrains Mono, monospace">
            TOLERANCE: {spec.toleranceLabel}
          </text>
          <circle cx="54" cy="172" r="7" fill="#FF4D62" />
          <text x="68" y="176" fill="#EAF3FF" fontSize="11" fontFamily="JetBrains Mono, monospace">
            RED (+)
          </text>
          <circle cx="152" cy="172" r="7" fill="#64748B" />
          <text x="166" y="176" fill="#EAF3FF" fontSize="11" fontFamily="JetBrains Mono, monospace">
            COM (-)
          </text>
        </g>

        {/* 3. ECU Breakout Module (Center) */}
        <g transform="translate(300, 120)">
          <rect
            width="340"
            height="240"
            rx="12"
            fill="url(#tut-ecu-body)"
            stroke="#2D4B73"
            strokeWidth="2"
          />
          <text x="170" y="34" textAnchor="middle" fill="#EAF3FF" fontSize="16" fontWeight="700" fontFamily="Rajdhani, sans-serif">
            ECU BREAKOUT TERMINAL HEADER
          </text>
          <text x="170" y="54" textAnchor="middle" fill="#91A4BD" fontSize="11.5" fontFamily="JetBrains Mono, monospace">
            {spec.focusPinDetail}
          </text>

          {/* Target Verified Pin Slot */}
          <rect
            x="24"
            y="82"
            width="292"
            height="58"
            rx="8"
            fill="#071222"
            stroke="#19C8F5"
            strokeWidth={focusArea === 'PROBES' || focusArea === 'READING' ? '2.5' : '1.5'}
          />
          <circle cx="48" cy="111" r="9" fill="#FF4D62" />
          <text x="68" y="106" fill="#19C8F5" fontSize="12" fontWeight="700" fontFamily="JetBrains Mono, monospace">
            RED (+) → {spec.redProbeLabel}
          </text>
          <text x="68" y="125" fill="#91A4BD" fontSize="11" fontFamily="JetBrains Mono, monospace">
            Focus Pin: {spec.focusPinLabel}
          </text>

          {/* Reference Return Pin Slot */}
          <rect
            x="24"
            y="156"
            width="292"
            height="54"
            rx="8"
            fill="#071222"
            stroke="#334155"
            strokeWidth="1.5"
          />
          <circle cx="48" cy="183" r="9" fill="#94A3B8" />
          <text x="68" y="179" fill="#EAF3FF" fontSize="12" fontWeight="700" fontFamily="JetBrains Mono, monospace">
            BLACK (-) → {spec.blackProbeLabel}
          </text>
          <text x="68" y="197" fill="#91A4BD" fontSize="11" fontFamily="JetBrains Mono, monospace">
            Signal Reference / Return Path
          </text>
        </g>

        {/* Animated Probe Lead Wires */}
        <path
          d="M 728 242 C 728 310, 660 231, 616 231"
          fill="none"
          stroke="#FF4D62"
          strokeWidth="3.5"
          strokeDasharray={pulseOn ? '10 6' : undefined}
          strokeDashoffset={pulseOn ? -Math.round(progressRatio * 180) : 0}
        />
        <path
          d="M 826 242 C 826 355, 680 303, 616 303"
          fill="none"
          stroke="#94A3B8"
          strokeWidth="3.5"
          strokeDasharray={pulseOn ? '10 6' : undefined}
          strokeDashoffset={pulseOn ? -Math.round(progressRatio * 140) : 0}
        />

        {/* PSU Supply Wire into ECU */}
        <path
          d="M 266 150 L 300 150"
          fill="none"
          stroke={psuActive ? '#20D889' : '#475569'}
          strokeWidth="4"
          strokeDasharray={psuActive && isPlaying ? '8 5' : undefined}
          strokeDashoffset={psuActive && isPlaying ? -Math.round(progressRatio * 140) : 0}
        />

        {/* Animated Probe Contact Marker */}
        {progressRatio > 0.18 && (
          <g transform={`translate(${Math.round(616 - Math.min(1, progressRatio * 1.4) * 268)}, 231)`}>
            <circle r="11" fill="rgba(255,77,98,0.22)" stroke="#FF4D62" strokeWidth="2" />
            <circle r="4" fill="#FF4D62" />
          </g>
        )}

        {/* Bottom Schematic Signal Strip */}
        <g transform="translate(36, 392)">
          <rect width="888" height="58" rx="8" fill="#0A1220" stroke="#203653" />
          <text x="16" y="24" fill="#91A4BD" fontSize="11" fontFamily="JetBrains Mono, monospace">
            VERIFIED PINS: {spec.verifiedPinNames.join('  ·  ')}
          </text>
          <text x="16" y="44" fill="#20D889" fontSize="11.5" fontFamily="JetBrains Mono, monospace">
            PASS CRITERION: {spec.expectedReadingLabel} ({spec.toleranceLabel}) · SIGNAL: {spec.oscilloscopeSignal}
          </text>
        </g>
      </svg>
    </div>
  );
};

export const StepTutorialVideoModal: React.FC<StepTutorialVideoModalProps> = ({
  isOpen,
  onClose,
  module,
  step,
  ecuPins = [],
  settings,
  onFocusProbePin,
}) => {
  const titleId = useId();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSpokenCueIdRef = useRef<string | null>(null);

  const [entry, setEntry] = useState<CachedStepTutorialEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [preferSchematic, setPreferSchematic] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(1);
  const [voiceEnabled, setVoiceEnabled] = useState(settings.voiceGuidanceEnabled);

  const groundedFallback = useMemo(
    () => buildGroundedStepSpec(module, step, ecuPins),
    [module, step, ecuPins]
  );

  const activeSpec = entry?.grounded ?? groundedFallback;
  const durationSec: TutorialDurationSec = entry?.durationSec ?? settings.durationSec;
  const activeSubtitles = useMemo(
    () =>
      entry?.subtitles ??
      buildStepTutorialSubtitles(activeSpec, settings.narrationStyle, durationSec),
    [entry?.subtitles, activeSpec, settings.narrationStyle, durationSec]
  );

  const loadTutorial = useCallback(
    async (forceRegenerate = false, signal?: AbortSignal) => {
      setIsLoading(true);
      setCurrentTimeSec(0);
      lastSpokenCueIdRef.current = null;
      try {
        const result = await loadOrGenerateStepTutorial({
          module,
          step,
          ecuPins,
          narrationStyle: settings.narrationStyle,
          durationSec: settings.durationSec,
          forceRegenerate,
          signal,
        });
        if (!signal?.aborted) {
          setEntry(result);
          setPreferSchematic(result.mode !== 'AI_VIDEO');
          setIsPlaying(true);
        }
      } catch {
        // Aborted or failed gracefully
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [module, step, ecuPins, settings.narrationStyle, settings.durationSec]
  );

  useEffect(() => {
    if (!isOpen) return;
    setVoiceEnabled(settings.voiceGuidanceEnabled);
    const controller = new AbortController();
    void loadTutorial(false, controller.signal);
    return () => {
      controller.abort();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore SpeechSynthesis teardown errors
        }
      }
    };
  }, [isOpen, loadTutorial, settings.voiceGuidanceEnabled]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const showingVideo =
    !preferSchematic && entry?.mode === 'AI_VIDEO' && Boolean(entry.videoUrl);

  // Playback timer for Interactive Animated Schematic mode
  useEffect(() => {
    if (!isOpen || showingVideo || !isPlaying) return;
    let lastTs = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const dt = ((now - lastTs) / 1000) * playbackSpeed;
      lastTs = now;
      setCurrentTimeSec((prev) => {
        const next = prev + dt;
        if (next >= durationSec) {
          setIsPlaying(false);
          playTutorialCueTone('complete');
          return durationSec;
        }
        return next;
      });
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isOpen, showingVideo, isPlaying, playbackSpeed, durationSec]);

  // Sync HTML5 video element rate & play state
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !showingVideo) return;
    vid.playbackRate = playbackSpeed;
    if (isPlaying) {
      vid.play().catch(() => {
        // Autoplay restriction handled cleanly via play button
      });
    } else {
      vid.pause();
    }
  }, [showingVideo, isPlaying, playbackSpeed]);

  const activeCue = useMemo(() => {
    return (
      activeSubtitles.find(
        (c) => currentTimeSec >= c.startSec && currentTimeSec <= c.endSec
      ) ?? activeSubtitles[activeSubtitles.length - 1] ?? null
    );
  }, [activeSubtitles, currentTimeSec]);

  // Voice guidance narration synced to active subtitle cue
  useEffect(() => {
    if (!isOpen || !isPlaying || !voiceEnabled || !activeCue) return;
    if (lastSpokenCueIdRef.current === activeCue.id) return;
    lastSpokenCueIdRef.current = activeCue.id;

    playTutorialCueTone(activeCue.focusArea === 'PROBES' ? 'probe' : 'step');

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(activeCue.voiceText);
        utter.rate = Math.min(1.25, Math.max(0.85, playbackSpeed));
        utter.lang = settings.narrationStyle === 'TAGLISH_COACH' ? 'en-PH' : 'en-US';
        window.speechSynthesis.speak(utter);
      } catch {
        // Ignore if browser blocks speechSynthesis
      }
    }
  }, [
    isOpen,
    isPlaying,
    voiceEnabled,
    activeCue,
    playbackSpeed,
    settings.narrationStyle,
  ]);

  const handleTogglePlay = () => {
    if (currentTimeSec >= durationSec - 0.05) {
      setCurrentTimeSec(0);
      lastSpokenCueIdRef.current = null;
      if (videoRef.current) videoRef.current.currentTime = 0;
      setIsPlaying(true);
      return;
    }
    setIsPlaying((p) => !p);
  };

  const handleRestart = () => {
    setCurrentTimeSec(0);
    lastSpokenCueIdRef.current = null;
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
    setIsPlaying(true);
  };

  const handleSeek = (nextSec: number) => {
    setCurrentTimeSec(nextSec);
    lastSpokenCueIdRef.current = null;
    if (videoRef.current) {
      videoRef.current.currentTime = nextSec;
    }
  };

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  const progressRatio = durationSec > 0 ? Math.min(1, Math.max(0, currentTimeSec / durationSec)) : 0;

  return createPortal(
    <div
      data-testid="step-tutorial-video-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[105] flex items-center justify-center bg-[#02050B]/85 p-3 sm:p-5 backdrop-blur-sm"
    >
      <div className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#203653] bg-[#0A1220] text-[#EAF3FF] shadow-[0_24px_80px_rgba(2,6,14,0.92)]">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-[#203653] bg-[#0E192A] px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#91A4BD]">
              <span className="font-bold text-[#19C8F5]">{module.exerciseCode}</span>
              <span aria-hidden="true">·</span>
              <span>Step {step.stepNumber}</span>
              <span aria-hidden="true">·</span>
              <span>
                {showingVideo
                  ? `AI Video (${entry?.model || 'gemini-omni-1.2-flash'})`
                  : 'Interactive Schematic + Voice Guidance'}
              </span>
            </div>
            <h2 id={titleId} className="truncate font-hud text-base sm:text-lg font-bold text-[#EAF3FF]">
              {step.titleTaglish}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close step tutorial modal"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#203653] bg-[#0A1220] text-[#91A4BD] hover:border-[#19C8F5] hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {/* Fallback / Generation Status Notice */}
          {entry?.mode === 'INTERACTIVE_SCHEMATIC' && entry.fallbackReason && (
            <div
              data-testid="step-tutorial-fallback-banner"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-950/25 px-3 py-2 text-xs text-amber-200"
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                <span className="truncate">
                  Interactive Schematic Fallback Active · {entry.fallbackReason}
                </span>
              </div>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => void loadTutorial(true)}
                className="inline-flex items-center gap-1 rounded border border-amber-400/50 bg-[#0E192A] px-2.5 py-1 font-mono text-[11px] font-semibold text-amber-100 hover:bg-[#162740] cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span>Retry AI Video</span>
              </button>
            </div>
          )}

          {/* 16:9 Viewport Stage */}
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[#203653] bg-[#040912]">
            {isLoading ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center p-6">
                <RefreshCw className="h-7 w-7 animate-spin text-[#19C8F5]" aria-hidden="true" />
                <div className="font-hud text-base font-bold text-[#EAF3FF]">
                  Constructing Grounded Step Tutorial ({durationSec}s · 16:9)...
                </div>
                <p className="max-w-md font-mono text-xs text-[#91A4BD]">
                  Binding verified pin {activeSpec.focusPinLabel}, DMM mode {activeSpec.dmmModeDisplay}, and PSU {activeSpec.requiredPsuState}.
                </p>
              </div>
            ) : showingVideo && entry?.videoUrl ? (
              <video
                ref={videoRef}
                src={entry.videoUrl}
                playsInline
                onTimeUpdate={(e) => setCurrentTimeSec(e.currentTarget.currentTime)}
                onEnded={() => setIsPlaying(false)}
                className="h-full w-full object-contain bg-black"
              />
            ) : (
              <InteractiveStepSchematic
                spec={activeSpec}
                activeCue={activeCue}
                progressRatio={progressRatio}
                isPlaying={isPlaying}
              />
            )}

            {/* Synced Subtitle Scrim Overlay */}
            {!isLoading && activeCue && (
              <div
                data-testid="step-tutorial-subtitle"
                className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/65 to-transparent px-4 pb-3 pt-8 text-center"
              >
                <p className="mx-auto max-w-2xl rounded-md bg-[#050A12]/80 px-3 py-1.5 font-body text-xs sm:text-sm font-medium text-[#EAF3FF] border border-white/10">
                  {activeCue.text}
                </p>
              </div>
            )}
          </div>

          {/* Playback Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#203653] bg-[#0E192A] px-3 py-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleTogglePlay}
                aria-label={isPlaying ? 'Pause tutorial' : 'Play tutorial'}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#19C8F5]/55 bg-[#0E2238] px-3 py-1.5 font-mono text-xs font-semibold text-[#EAF3FF] hover:bg-[#14304E] cursor-pointer whitespace-nowrap"
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-3.5 w-3.5 text-[#19C8F5]" aria-hidden="true" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 text-[#19C8F5]" aria-hidden="true" />
                    <span>Play</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleRestart}
                aria-label="Restart tutorial"
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#203653] bg-[#0A1220] px-2.5 py-1.5 font-mono text-xs text-[#91A4BD] hover:text-white cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Restart</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setVoiceEnabled((v) => {
                    if (v && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                      window.speechSynthesis.cancel();
                    }
                    return !v;
                  });
                }}
                aria-label={voiceEnabled ? 'Mute voice guidance' : 'Enable voice guidance'}
                className={`inline-flex min-h-[36px] items-center gap-1 rounded-lg border px-2.5 py-1.5 font-mono text-xs cursor-pointer whitespace-nowrap ${
                  voiceEnabled
                    ? 'border-[#20D889]/50 bg-[#0A261B] text-[#8DF0C1]'
                    : 'border-[#203653] bg-[#0A1220] text-[#91A4BD]'
                }`}
              >
                {voiceEnabled ? (
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{voiceEnabled ? 'Voice ON' : 'Muted'}</span>
              </button>
            </div>

            {/* Scrubber */}
            <div className="flex min-w-[180px] flex-1 items-center gap-2 px-1">
              <span className="font-mono text-[11px] text-[#91A4BD] tabular-nums">
                {currentTimeSec.toFixed(1)}s
              </span>
              <input
                type="range"
                aria-label="Tutorial playback timeline"
                min={0}
                max={durationSec}
                step={0.1}
                value={Math.min(durationSec, currentTimeSec)}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="h-1.5 flex-1 accent-[#19C8F5] cursor-pointer"
              />
              <span className="font-mono text-[11px] text-[#91A4BD] tabular-nums">
                {durationSec.toFixed(1)}s
              </span>
            </div>

            {/* Speed & Mode Controls */}
            <div className="flex items-center gap-1.5">
              {SPEED_OPTIONS.map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`min-h-[32px] rounded border px-2 font-mono text-[11px] tabular-nums cursor-pointer ${
                    playbackSpeed === spd
                      ? 'border-[#19C8F5]/70 bg-[#0E2238] text-[#19C8F5] font-bold'
                      : 'border-[#203653] bg-[#0A1220] text-[#91A4BD] hover:text-white'
                  }`}
                >
                  {spd}x
                </button>
              ))}

              {entry?.mode === 'AI_VIDEO' && (
                <button
                  type="button"
                  onClick={() => setPreferSchematic((p) => !p)}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded border border-[#203653] bg-[#0A1220] px-2.5 font-mono text-[11px] text-[#EAF3FF] hover:border-[#19C8F5] cursor-pointer whitespace-nowrap"
                >
                  {preferSchematic ? (
                    <>
                      <Film className="h-3.5 w-3.5 text-[#19C8F5]" aria-hidden="true" />
                      <span>AI Video</span>
                    </>
                  ) : (
                    <>
                      <Cpu className="h-3.5 w-3.5 text-[#FFB020]" aria-hidden="true" />
                      <span>Schematic</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Grounded Pin & Tool Metadata Footer */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 rounded-xl border border-[#203653] bg-[#050A12] p-3 font-mono text-[11px] tabular-nums">
            <div>
              <div className="text-[#91A4BD]">Verified Probes &amp; Pin</div>
              <div className="mt-0.5 text-[#EAF3FF]">
                Red (+) {activeSpec.redProbeLabel} → Black (-) {activeSpec.blackProbeLabel}
              </div>
            </div>
            <div>
              <div className="text-[#91A4BD]">Grounded Instrument Setup</div>
              <div className="mt-0.5 text-[#FFB020]">
                DMM: {activeSpec.dmmModeDisplay} · PSU: {activeSpec.requiredPsuState} ({activeSpec.psuVoltageSetting.toFixed(1)}V)
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[#91A4BD]">Target Tolerance</div>
                <div className="mt-0.5 text-[#20D889]">
                  {activeSpec.expectedReadingLabel} ({activeSpec.toleranceLabel})
                </div>
              </div>
              {onFocusProbePin && (
                <button
                  type="button"
                  onClick={() => {
                    onFocusProbePin(step.focusPinId, step.focusPinLabel, false);
                    onClose();
                  }}
                  className="rounded border border-[#19C8F5]/55 bg-[#0E2238] px-2.5 py-1.5 text-[11px] font-semibold text-[#19C8F5] hover:bg-[#14304E] cursor-pointer whitespace-nowrap"
                >
                  Snap Probes
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
