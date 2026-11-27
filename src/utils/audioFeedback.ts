/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

let audioCtx: AudioContext | null = null;
let beepOscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;

const UI_SFX_STORAGE_KEY = 'autolab_ui_sfx_enabled_v1';
let uiSoundEnabledCache: boolean | null = null;
const uiSoundListeners = new Set<(enabled: boolean) => void>();

export function isUiSoundEnabled(): boolean {
  if (uiSoundEnabledCache !== null) return uiSoundEnabledCache;
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage?.getItem(UI_SFX_STORAGE_KEY);
    uiSoundEnabledCache = raw === null ? true : raw !== 'false';
    return uiSoundEnabledCache;
  } catch {
    uiSoundEnabledCache = true;
    return true;
  }
}

export function setUiSoundEnabled(enabled: boolean): void {
  uiSoundEnabledCache = enabled;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage?.setItem(UI_SFX_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }
  for (const listener of uiSoundListeners) {
    try {
      listener(enabled);
    } catch {
      // Ignore listener errors
    }
  }
}

export function toggleUiSoundEnabled(): boolean {
  const next = !isUiSoundEnabled();
  setUiSoundEnabled(next);
  if (next) {
    playCockpitTabDetent();
  }
  return next;
}

export function subscribeUiSoundPreference(listener: (enabled: boolean) => void): () => void {
  uiSoundListeners.add(listener);
  return () => {
    uiSoundListeners.delete(listener);
  };
}

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {
      // Autoplay guard: safely ignore until user gesture
    });
  }
  return audioCtx;
}

export function playContinuityBeep(shouldBeep: boolean) {
  if (typeof window === 'undefined') return;

  if (shouldBeep) {
    const ctx = getOrCreateAudioContext();
    if (ctx && !beepOscillator) {
      try {
        beepOscillator = ctx.createOscillator();
        gainNode = ctx.createGain();

        beepOscillator.type = 'sine';
        beepOscillator.frequency.setValueAtTime(2400, ctx.currentTime); // Standard 2.4 kHz multimeter piezo pitch
        gainNode.gain.setValueAtTime(0.08, ctx.currentTime); // Gentle volume

        beepOscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        beepOscillator.start();
      } catch {
        // Audio policy ignore
      }
    }
  } else {
    if (beepOscillator) {
      try {
        beepOscillator.stop();
        beepOscillator.disconnect();
      } catch {
        // Ignore
      }
      beepOscillator = null;
      gainNode = null;
    }
  }
}

export function playProbeTapSound() {
  if (typeof window === 'undefined' || !isUiSoundEnabled()) return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    // Subtle acoustic metallic contact chirp: 1600Hz decaying rapidly to 320Hz over 35ms
    osc.frequency.setValueAtTime(1600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.035);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.035);
  } catch {
    // Audio policy ignore
  }
}

export function playHoldBeep(isEngaged: boolean) {
  if (typeof window === 'undefined') return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';

    if (isEngaged) {
      // Classic 2.4 kHz DMM piezo confirmation chirp when locking HOLD
      osc.frequency.setValueAtTime(2400, now);
      gain.gain.setValueAtTime(0.075, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.065);
    } else {
      // Lower 1.75 kHz brief chirp when releasing HOLD back to live tracking
      osc.frequency.setValueAtTime(1750, now);
      gain.gain.setValueAtTime(0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.045);
    }
  } catch {
    // Audio policy ignore
  }
}

export type EmulatorModuleKind = 'rpm' | 'injector' | 'relay' | 'sensor';

/**
 * Plays a minimal, clean tactile confirmation sound when an emulator module turns ON or OFF.
 */
export function playModuleActivationSound(
  isActivating: boolean,
  moduleKind: EmulatorModuleKind = 'rpm'
) {
  if (typeof window === 'undefined') return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Micro switch/relay contact transient
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(isActivating ? 920 : 540, now);
    clickOsc.frequency.exponentialRampToValueAtTime(220, now + 0.018);
    clickGain.gain.setValueAtTime(0.028, now);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.022);

    // 2. Minimal module wake/sleep harmonic tone
    const baseHzMap: Record<EmulatorModuleKind, [number, number]> = {
      rpm: [520, 780],
      injector: [660, 990],
      relay: [440, 620],
      sensor: [580, 840],
    };
    const [lowHz, highHz] = baseHzMap[moduleKind];

    const toneOsc = ctx.createOscillator();
    const toneGain = ctx.createGain();
    toneOsc.type = 'sine';
    const startTime = now + 0.016;
    if (isActivating) {
      toneOsc.frequency.setValueAtTime(lowHz, startTime);
      toneOsc.frequency.exponentialRampToValueAtTime(highHz, startTime + 0.07);
      toneGain.gain.setValueAtTime(0.001, startTime);
      toneGain.gain.linearRampToValueAtTime(0.036, startTime + 0.014);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.095);
    } else {
      toneOsc.frequency.setValueAtTime(highHz * 0.8, startTime);
      toneOsc.frequency.exponentialRampToValueAtTime(lowHz * 0.72, startTime + 0.06);
      toneGain.gain.setValueAtTime(0.025, startTime);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.075);
    }
    toneOsc.connect(toneGain);
    toneGain.connect(ctx.destination);
    toneOsc.start(startTime);
    toneOsc.stop(startTime + 0.1);
  } catch {
    // Audio policy ignore
  }
}

/**
 * Plays a short, clean instrument warning chirp when the automated Logic Check triggers.
 */
export function playLogicAlertBeep(severity: 'CRITICAL' | 'WARNING' = 'CRITICAL') {
  if (typeof window === 'undefined') return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const playTone = (freq: number, startOffset: number, duration: number, peakGain: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.001, now + startOffset);
      gain.gain.linearRampToValueAtTime(peakGain, now + startOffset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.01);
    };

    if (severity === 'CRITICAL') {
      playTone(1320, 0, 0.09, 0.055);
      playTone(990, 0.11, 0.11, 0.055);
    } else {
      playTone(1040, 0, 0.085, 0.04);
    }
  } catch {
    // Audio policy ignore
  }
}

export type CircuitAudioAlertToneKind =
  | 'SHORT_CIRCUIT'
  | 'VOLTAGE_DROP'
  | 'ABNORMAL_BEHAVIOR'
  | 'NOMINAL_RECOVERY';

/**
 * Synthesizes distinct hardware bench acoustic alerts for:
 * - SHORT_CIRCUIT: Alternating high-urgency OCP piezo alarm (1820 Hz / 1280 Hz)
 * - VOLTAGE_DROP: Descending voltage-sag brownout chime (960 Hz -> 620 Hz glide)
 * - ABNORMAL_BEHAVIOR: Triple-pulse diagnostic instrument alert (1260 Hz, 1260 Hz, 1580 Hz)
 * - NOMINAL_RECOVERY: Ascending all-clear confirmation chime (880 Hz -> 1320 Hz)
 */
export function playCircuitAnomalyAlert(
  kind: CircuitAudioAlertToneKind,
  volumeScale = 0.8
) {
  if (typeof window === 'undefined') return;
  const clampedVol = Math.min(1, Math.max(0, Number.isFinite(volumeScale) ? volumeScale : 0.8));
  if (clampedVol <= 0.001) return;

  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const scheduleNote = (
      type: OscillatorType,
      startFreq: number,
      endFreq: number,
      startOffset: number,
      duration: number,
      baseGain: number
    ) => {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(startFreq, now + startOffset);
      if (Math.abs(endFreq - startFreq) > 1) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(40, endFreq),
          now + startOffset + duration
        );
      }

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2800, now + startOffset);

      const peak = baseGain * clampedVol;
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.linearRampToValueAtTime(peak, now + startOffset + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.01);
    };

    if (kind === 'SHORT_CIRCUIT') {
      // Urgent alternating bench PSU Over-Current / Short-Circuit piezo alarm
      scheduleNote('sawtooth', 1820, 1820, 0.0, 0.085, 0.085);
      scheduleNote('sawtooth', 1280, 1280, 0.095, 0.085, 0.085);
      scheduleNote('sawtooth', 1820, 1820, 0.19, 0.085, 0.09);
      scheduleNote('sawtooth', 1280, 1180, 0.285, 0.11, 0.085);
    } else if (kind === 'VOLTAGE_DROP') {
      // Descending pitch-sag chime representing rail voltage droop / brownout
      scheduleNote('triangle', 980, 620, 0.0, 0.16, 0.08);
      scheduleNote('triangle', 680, 460, 0.18, 0.18, 0.075);
    } else if (kind === 'ABNORMAL_BEHAVIOR') {
      // Triple-pulse instrument telemetry warning
      scheduleNote('sine', 1260, 1260, 0.0, 0.06, 0.065);
      scheduleNote('sine', 1260, 1260, 0.08, 0.06, 0.065);
      scheduleNote('sine', 1580, 1580, 0.16, 0.095, 0.07);
    } else if (kind === 'NOMINAL_RECOVERY') {
      // Clean ascending two-tone all-clear confirmation
      scheduleNote('sine', 880, 880, 0.0, 0.065, 0.05);
      scheduleNote('sine', 1320, 1320, 0.075, 0.095, 0.055);
    }
  } catch {
    // Audio policy ignore
  }
}

export interface RpmAudioProfile {
  clampedRpm: number;
  normalizedRpm: number;
  carrierHz: number;
  harmonicHz: number;
  harmonicMix: number;
  firingRateHz: number;
  fmModHz: number;
  fmDeviationHz: number;
  harmonicFmDeviationHz: number;
  amRateHz: number;
  amDepth: number;
  filterCutoffHz: number;
  masterGain: number;
}

/**
 * Computes deterministic Web Audio FM synthesis parameters for a 4-stroke engine RPM state.
 * Pure math helper — safe in SSR/unit-test environments without requiring AudioContext.
 */
export function computeRpmAudioProfile(rpm: number): RpmAudioProfile {
  const safeRpm = Number.isFinite(rpm) ? rpm : 600;
  const clampedRpm = Math.min(7500, Math.max(400, safeRpm));
  const norm = Math.min(1, Math.max(0, (clampedRpm - 600) / (7000 - 600)));

  // 4-stroke, 4-cylinder firing cadence (2 combustion events per crankshaft revolution)
  const firingRateHz = (clampedRpm / 60) * 2;

  // Fundamental carrier & octave harmonic track RPM linearly for immediate pitch feedback
  const carrierHz = 44 + norm * 186; // 44 Hz idle -> 230 Hz at 7000 RPM
  const harmonicHz = carrierHz * 2; // 88 Hz idle -> 460 Hz at 7000 RPM
  const harmonicMix = 0.18 + norm * 0.18; // 0.18 -> 0.36

  // Dynamic Frequency Modulation (FM): sub-firing crank modulation creates engine-run texture
  const fmModHz = Math.max(9, firingRateHz * 0.5); // 10 Hz flutter at idle -> 116.7 Hz growl at redline
  const fmDeviationHz = 3.2 + Math.pow(norm, 1.05) * 18.8; // +/-3.2 Hz idle -> +/-22 Hz high RPM
  const harmonicFmDeviationHz = fmDeviationHz * 1.5;

  // Gentle synchronized amplitude cadence & brightness scaling (minimal, non-fatiguing bench volume)
  const amRateHz = Math.max(8, firingRateHz * 0.45);
  const amDepth = 0.18 + norm * 0.14; // 0.18 -> 0.32
  const filterCutoffHz = 190 + Math.pow(norm, 1.15) * 1310; // 190 Hz warm idle -> 1500 Hz upper RPM
  const masterGain = 0.008 + Math.pow(norm, 1.35) * 0.044; // 0.008 subtle idle -> 0.052 max

  return {
    clampedRpm,
    normalizedRpm: norm,
    carrierHz,
    harmonicHz,
    harmonicMix,
    firingRateHz,
    fmModHz,
    fmDeviationHz,
    harmonicFmDeviationHz,
    amRateHz,
    amDepth,
    filterCutoffHz,
    masterGain,
  };
}

interface RpmSynthNodes {
  carrierOsc: OscillatorNode;
  harmonicOsc: OscillatorNode;
  harmonicGain: GainNode;
  fmModOsc: OscillatorNode;
  fmDepthGain: GainNode;
  fmHarmonicDepthGain: GainNode;
  lfoOsc: OscillatorNode;
  lfoDepthGain: GainNode;
  pulseGain: GainNode;
  filter: BiquadFilterNode;
  masterGain: GainNode;
}

let rpmSynth: RpmSynthNodes | null = null;
let rpmStopTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Stops and releases all active RPM emulator Web Audio oscillators and modulation nodes.
 */
export function stopRpmEmulatorAudio() {
  if (rpmStopTimer) {
    clearTimeout(rpmStopTimer);
    rpmStopTimer = null;
  }
  if (!rpmSynth) return;
  const nodes = rpmSynth;
  rpmSynth = null;
  const oscs = [nodes.carrierOsc, nodes.harmonicOsc, nodes.fmModOsc, nodes.lfoOsc];
  for (const osc of oscs) {
    try {
      osc.stop();
    } catch {
      // Already stopped
    }
  }
  const allNodes: AudioNode[] = [
    nodes.carrierOsc,
    nodes.harmonicOsc,
    nodes.harmonicGain,
    nodes.fmModOsc,
    nodes.fmDepthGain,
    nodes.fmHarmonicDepthGain,
    nodes.lfoOsc,
    nodes.lfoDepthGain,
    nodes.pulseGain,
    nodes.filter,
    nodes.masterGain,
  ];
  for (const node of allNodes) {
    try {
      node.disconnect();
    } catch {
      // Already disconnected
    }
  }
}

/**
 * Updates the minimal Web Audio RPM emulator synth using dynamic Frequency Modulation (FM),
 * engine firing-order AM cadence, lowpass brightness, and smooth AudioParam scheduling.
 */
export function updateRpmEmulatorAudio(
  isActive: boolean,
  rpm: number,
  isSoundEnabled = true
) {
  if (typeof window === 'undefined') return;

  if (!isActive || !isSoundEnabled || !Number.isFinite(rpm) || rpm <= 0) {
    if (rpmSynth && audioCtx) {
      try {
        const now = audioCtx.currentTime;
        rpmSynth.masterGain.gain.cancelScheduledValues(now);
        rpmSynth.masterGain.gain.setTargetAtTime(0.0001, now, 0.03);
        if (rpmStopTimer) clearTimeout(rpmStopTimer);
        rpmStopTimer = setTimeout(() => {
          stopRpmEmulatorAudio();
        }, 120);
      } catch {
        stopRpmEmulatorAudio();
      }
    } else {
      stopRpmEmulatorAudio();
    }
    return;
  }

  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    if (rpmStopTimer) {
      clearTimeout(rpmStopTimer);
      rpmStopTimer = null;
    }

    const profile = computeRpmAudioProfile(rpm);
    const pulseBaseGain = 1 - profile.amDepth;
    const now = ctx.currentTime;

    if (!rpmSynth) {
      const carrierOsc = ctx.createOscillator();
      const harmonicOsc = ctx.createOscillator();
      const harmonicGain = ctx.createGain();
      const fmModOsc = ctx.createOscillator();
      const fmDepthGain = ctx.createGain();
      const fmHarmonicDepthGain = ctx.createGain();
      const lfoOsc = ctx.createOscillator();
      const lfoDepthGain = ctx.createGain();
      const pulseGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const masterGain = ctx.createGain();

      carrierOsc.type = 'triangle';
      carrierOsc.frequency.setValueAtTime(profile.carrierHz, now);

      harmonicOsc.type = 'sine';
      harmonicOsc.frequency.setValueAtTime(profile.harmonicHz, now);
      harmonicGain.gain.setValueAtTime(profile.harmonicMix, now);

      // True dynamic Frequency Modulation routed into both carrier & harmonic frequency params
      fmModOsc.type = 'sine';
      fmModOsc.frequency.setValueAtTime(profile.fmModHz, now);
      fmDepthGain.gain.setValueAtTime(profile.fmDeviationHz, now);
      fmHarmonicDepthGain.gain.setValueAtTime(profile.harmonicFmDeviationHz, now);

      fmModOsc.connect(fmDepthGain);
      fmDepthGain.connect(carrierOsc.frequency);
      fmModOsc.connect(fmHarmonicDepthGain);
      fmHarmonicDepthGain.connect(harmonicOsc.frequency);

      // Subtle firing-pulse AM envelope
      lfoOsc.type = 'sine';
      lfoOsc.frequency.setValueAtTime(profile.amRateHz, now);
      lfoDepthGain.gain.setValueAtTime(profile.amDepth, now);
      pulseGain.gain.setValueAtTime(pulseBaseGain, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(profile.filterCutoffHz, now);
      filter.Q.setValueAtTime(1.35, now);

      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.linearRampToValueAtTime(profile.masterGain, now + 0.08);

      carrierOsc.connect(filter);
      harmonicOsc.connect(harmonicGain);
      harmonicGain.connect(filter);

      filter.connect(pulseGain);
      lfoOsc.connect(lfoDepthGain);
      lfoDepthGain.connect(pulseGain.gain);

      pulseGain.connect(masterGain);
      masterGain.connect(ctx.destination);

      carrierOsc.start(now);
      harmonicOsc.start(now);
      fmModOsc.start(now);
      lfoOsc.start(now);

      rpmSynth = {
        carrierOsc,
        harmonicOsc,
        harmonicGain,
        fmModOsc,
        fmDepthGain,
        fmHarmonicDepthGain,
        lfoOsc,
        lfoDepthGain,
        pulseGain,
        filter,
        masterGain,
      };
    } else {
      const tc = 0.035;
      rpmSynth.carrierOsc.frequency.setTargetAtTime(profile.carrierHz, now, tc);
      rpmSynth.harmonicOsc.frequency.setTargetAtTime(profile.harmonicHz, now, tc);
      rpmSynth.harmonicGain.gain.setTargetAtTime(profile.harmonicMix, now, 0.045);

      rpmSynth.fmModOsc.frequency.setTargetAtTime(profile.fmModHz, now, tc);
      rpmSynth.fmDepthGain.gain.setTargetAtTime(profile.fmDeviationHz, now, tc);
      rpmSynth.fmHarmonicDepthGain.gain.setTargetAtTime(profile.harmonicFmDeviationHz, now, tc);

      rpmSynth.lfoOsc.frequency.setTargetAtTime(profile.amRateHz, now, tc);
      rpmSynth.lfoDepthGain.gain.setTargetAtTime(profile.amDepth, now, 0.045);
      rpmSynth.pulseGain.gain.setTargetAtTime(pulseBaseGain, now, 0.045);

      rpmSynth.filter.frequency.setTargetAtTime(profile.filterCutoffHz, now, 0.05);
      rpmSynth.masterGain.gain.cancelScheduledValues(now);
      rpmSynth.masterGain.gain.setTargetAtTime(profile.masterGain, now, 0.045);
    }
  } catch {
    // Audio policy ignore
  }
}

/**
 * Real-time acoustic confirmation chime played when a Trouble Scenario diagnostic
 * step is marked completed (or when all steps in the scenario are completed).
 */
export function playStepCompletionTone(allCompleted = false) {
  if (typeof window === 'undefined') return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = allCompleted
      ? [
          { freq: 880, offset: 0, duration: 0.09, gain: 0.075 },
          { freq: 1108.73, offset: 0.075, duration: 0.09, gain: 0.075 },
          { freq: 1318.51, offset: 0.15, duration: 0.1, gain: 0.08 },
          { freq: 1760, offset: 0.23, duration: 0.16, gain: 0.085 },
        ]
      : [
          { freq: 880, offset: 0, duration: 0.085, gain: 0.075 },
          { freq: 1318.51, offset: 0.075, duration: 0.13, gain: 0.085 },
        ];

    notes.forEach(({ freq, offset, duration, gain }) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + offset);

      env.gain.setValueAtTime(0.0001, now + offset);
      env.gain.linearRampToValueAtTime(gain, now + offset + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);

      osc.connect(env);
      env.connect(ctx.destination);

      osc.start(now + offset);
      osc.stop(now + offset + duration + 0.015);
    });
  } catch {
    // Audio policy ignore
  }
}

export type PinKeypadClickKind = 'digit' | 'clear' | 'backspace';

/**
 * Dark-industrial mechanical keypad click synthesized via Web Audio API.
 */
export function playPinKeypadClick(kind: PinKeypadClickKind = 'digit') {
  if (typeof window === 'undefined') return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    filter.type = 'bandpass';
    filter.Q.setValueAtTime(2.4, now);

    if (kind === 'clear') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.045);
      filter.frequency.setValueAtTime(750, now);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.055);
      return;
    }

    if (kind === 'backspace') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.032);
      filter.frequency.setValueAtTime(1050, now);
      gain.gain.setValueAtTime(0.042, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.036);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
      return;
    }

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1180, now);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.024);
    filter.frequency.setValueAtTime(1450, now);
    gain.gain.setValueAtTime(0.048, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.032);
  } catch {
    // Audio policy ignore
  }
}

/**
 * Futuristic harmonic access-granted sequence played on PIN / Admin / Auth unlock.
 */
export function playAccessGrantedChime() {
  if (typeof window === 'undefined') return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [
      { freq: 587.33, offset: 0.0, duration: 0.11, gain: 0.06, type: 'triangle' as OscillatorType },
      { freq: 739.99, offset: 0.07, duration: 0.11, gain: 0.06, type: 'triangle' as OscillatorType },
      { freq: 880.0, offset: 0.14, duration: 0.13, gain: 0.065, type: 'sine' as OscillatorType },
      { freq: 1174.66, offset: 0.22, duration: 0.26, gain: 0.07, type: 'sine' as OscillatorType },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const env = ctx.createGain();

      osc.type = note.type;
      osc.frequency.setValueAtTime(note.freq, now + note.offset);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3200, now + note.offset);

      env.gain.setValueAtTime(0.0001, now + note.offset);
      env.gain.linearRampToValueAtTime(note.gain, now + note.offset + 0.014);
      env.gain.exponentialRampToValueAtTime(0.0001, now + note.offset + note.duration);

      osc.connect(filter);
      filter.connect(env);
      env.connect(ctx.destination);

      osc.start(now + note.offset);
      osc.stop(now + note.offset + note.duration + 0.02);
    }
  } catch {
    // Audio policy ignore
  }
}

/**
 * Authoritative dark-industrial lock or rejection audio cue.
 */
export function playSystemLockSound(kind: 'lock' | 'error' = 'lock') {
  if (typeof window === 'undefined') return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const steps =
      kind === 'error'
        ? [
            { startHz: 260, endHz: 175, offset: 0.0, dur: 0.09, gain: 0.065 },
            { startHz: 195, endHz: 120, offset: 0.1, dur: 0.13, gain: 0.065 },
          ]
        : [
            { startHz: 420, endHz: 210, offset: 0.0, dur: 0.09, gain: 0.055 },
            { startHz: 220, endHz: 110, offset: 0.085, dur: 0.14, gain: 0.06 },
          ];

    for (const st of steps) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const env = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(st.startHz, now + st.offset);
      osc.frequency.exponentialRampToValueAtTime(st.endHz, now + st.offset + st.dur);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, now + st.offset);

      env.gain.setValueAtTime(0.0001, now + st.offset);
      env.gain.linearRampToValueAtTime(st.gain, now + st.offset + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, now + st.offset + st.dur);

      osc.connect(filter);
      filter.connect(env);
      env.connect(ctx.destination);

      osc.start(now + st.offset);
      osc.stop(now + st.offset + st.dur + 0.02);
    }
  } catch {
    // Audio policy ignore
  }
}

/**
 * Subtle telemetry cue tone used during interactive schematic tutorial playback.
 */
export function playTutorialCueTone(kind: 'step' | 'probe' | 'complete' = 'step') {
  if (typeof window === 'undefined') return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    if (kind === 'complete') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, now);
      osc.frequency.setValueAtTime(1318.51, now + 0.07);
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(0.045, now + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(env);
      env.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
      return;
    }

    osc.type = 'sine';
    osc.frequency.setValueAtTime(kind === 'probe' ? 1480 : 880, now);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.032, now + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.085);
  } catch {
    // Audio policy ignore
  }
}

/**
 * Machined anodized-aluminum automotive cockpit detent click when switching modules or panes.
 */
export function playCockpitTabDetent() {
  if (typeof window === 'undefined' || !isUiSoundEnabled()) return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Crisp metallic micro-switch transient
    const snapOsc = ctx.createOscillator();
    const snapFilter = ctx.createBiquadFilter();
    const snapGain = ctx.createGain();
    snapOsc.type = 'triangle';
    snapOsc.frequency.setValueAtTime(2150, now);
    snapOsc.frequency.exponentialRampToValueAtTime(580, now + 0.022);
    snapFilter.type = 'bandpass';
    snapFilter.frequency.setValueAtTime(1450, now);
    snapFilter.Q.setValueAtTime(1.4, now);
    snapGain.gain.setValueAtTime(0.042, now);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.024);
    snapOsc.connect(snapFilter);
    snapFilter.connect(snapGain);
    snapGain.connect(ctx.destination);
    snapOsc.start(now);
    snapOsc.stop(now + 0.026);

    // 2. Warm low-end chassis body resonance
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime(195, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(92, now + 0.028);
    bodyGain.gain.setValueAtTime(0.036, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
    bodyOsc.connect(bodyGain);
    bodyGain.connect(ctx.destination);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.032);
  } catch {
    // Audio policy ignore
  }
}

/**
 * Precision optical rotary encoder tick for voltage presets and DMM selector modes.
 */
export function playRotaryEncoderTick() {
  if (typeof window === 'undefined' || !isUiSoundEnabled()) return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1880, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.015);
    gain.gain.setValueAtTime(0.034, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.016);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.018);
  } catch {
    // Audio policy ignore
  }
}

/**
 * Authentic 30A automotive cube relay armature pull-in & contact snap when energizing/de-energizing KL30.
 */
export function playAutomotiveRelayClunk(engaged: boolean) {
  if (typeof window === 'undefined' || !isUiSoundEnabled()) return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Primary armature thud
    const armOsc = ctx.createOscillator();
    const armGain = ctx.createGain();
    armOsc.type = 'triangle';
    armOsc.frequency.setValueAtTime(engaged ? 155 : 210, now);
    armOsc.frequency.exponentialRampToValueAtTime(engaged ? 78 : 95, now + 0.055);
    armGain.gain.setValueAtTime(0.065, now);
    armGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    armOsc.connect(armGain);
    armGain.connect(ctx.destination);
    armOsc.start(now);
    armOsc.stop(now + 0.065);

    // Secondary silver-contact snap (delayed 14ms for physical relay travel)
    const contactOsc = ctx.createOscillator();
    const contactGain = ctx.createGain();
    contactOsc.type = 'sine';
    contactOsc.frequency.setValueAtTime(engaged ? 2850 : 1920, now + 0.014);
    contactOsc.frequency.exponentialRampToValueAtTime(engaged ? 940 : 480, now + 0.042);
    contactGain.gain.setValueAtTime(0.048, now + 0.014);
    contactGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    contactOsc.connect(contactGain);
    contactGain.connect(ctx.destination);
    contactOsc.start(now + 0.014);
    contactOsc.stop(now + 0.048);

    if (engaged) {
      // Subtle 880 Hz bus-ready harmonic confirmation
      const chimeOsc = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      chimeOsc.type = 'sine';
      chimeOsc.frequency.setValueAtTime(880, now + 0.025);
      chimeOsc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.11);
      chimeGain.gain.setValueAtTime(0.0001, now + 0.025);
      chimeGain.gain.linearRampToValueAtTime(0.028, now + 0.04);
      chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      chimeOsc.connect(chimeGain);
      chimeGain.connect(ctx.destination);
      chimeOsc.start(now + 0.025);
      chimeOsc.stop(now + 0.15);
    }
  } catch {
    // Audio policy ignore
  }
}

/**
 * Smooth servo-assisted diagnostic drawer slide cue.
 */
export function playDrawerPneumaticSlide(opening: boolean) {
  if (typeof window === 'undefined' || !isUiSoundEnabled()) return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(opening ? 360 : 720, now);
    osc.frequency.exponentialRampToValueAtTime(opening ? 760 : 330, now + 0.085);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.026, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  } catch {
    // Audio policy ignore
  }
}



