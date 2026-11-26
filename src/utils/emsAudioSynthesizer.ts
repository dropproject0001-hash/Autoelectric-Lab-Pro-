/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { EmsDigitalTwinState } from '../simulation/telemetry/emsDigitalTwinSync';

export interface EmsAcousticParams {
  isPowerActive: boolean;
  isEngineRunning: boolean;
  rpm: number;
  firingHz: number;
  combustionFundamentalHz: number;
  throttleLoad: number; // 0..1
  healthyInjectorCount: number;
  healthyCoilCount: number;
  misfireSeverity: number; // 0..1
  fuelPumpRunning: boolean;
  fuelPumpGain: number;
  hasShortOrOcpFault: boolean;
  mainRelayLatched: boolean;
  fuelRelayLatched: boolean;
}

/**
 * Pure physics-to-acoustics mapping for 4-cylinder 4-stroke EMS audio synthesis.
 * Firing frequency for a 4-cylinder 4-stroke engine is (RPM / 60) * 2 = RPM / 30 Hz.
 */
export function deriveEmsAcousticParams(
  emsState: EmsDigitalTwinState | null | undefined
): EmsAcousticParams {
  if (!emsState) {
    return {
      isPowerActive: false,
      isEngineRunning: false,
      rpm: 0,
      firingHz: 0,
      combustionFundamentalHz: 28,
      throttleLoad: 0,
      healthyInjectorCount: 4,
      healthyCoilCount: 4,
      misfireSeverity: 0,
      fuelPumpRunning: false,
      fuelPumpGain: 0,
      hasShortOrOcpFault: false,
      mainRelayLatched: false,
      fuelRelayLatched: false,
    };
  }

  const rpm = emsState.isEngineRunning ? Math.max(550, Math.min(7200, emsState.rpm || 850)) : 0;
  const firingHz = rpm > 0 ? rpm / 30 : 0;
  const combustionFundamentalHz = Math.max(22, firingHz);
  const throttleLoad = Math.max(0, Math.min(1, (emsState.tpsPercent || 15) / 100));

  const healthyInjectorCount = emsState.cylinders.filter((c) => !c.isInjectorFaulted).length;
  const healthyCoilCount = emsState.cylinders.filter((c) => !c.isCoilFaulted).length;
  const healthyCylinders = Math.min(healthyInjectorCount, healthyCoilCount);
  const misfireSeverity = Math.max(0, (4 - healthyCylinders) / 4);

  const hasBlownFuse = emsState.fuses.some((f) => f.isBlown);
  const hasShortOrOcpFault = emsState.isSupplyTripped || hasBlownFuse;

  const fuelPumpRunning = emsState.fuelSystem.isPumpRunning && !emsState.fuelSystem.isFaulted;
  const fuelPumpGain = fuelPumpRunning ? Math.max(0.025, Math.min(0.08, (emsState.fuelSystem.railPressureBar / 4.0) * 0.055)) : 0;

  return {
    isPowerActive: emsState.isPowerActive,
    isEngineRunning: emsState.isEngineRunning && healthyCylinders > 0,
    rpm,
    firingHz,
    combustionFundamentalHz,
    throttleLoad,
    healthyInjectorCount,
    healthyCoilCount,
    misfireSeverity,
    fuelPumpRunning,
    fuelPumpGain,
    hasShortOrOcpFault,
    mainRelayLatched: emsState.mainRelay.isLatched,
    fuelRelayLatched: emsState.fuelPumpRelay.isLatched,
  };
}

/**
 * 100% Procedural Web Audio API Automotive EMS Sound Engine.
 * Zero external audio assets — synthesizes:
 * - 4-cylinder 1-3-4-2 combustion harmonics & RPM-modulated engine rumble (with real misfire drop)
 * - Sequential fuel injector metallic solenoid ticking
 * - High-voltage ignition coil capacitive spark snaps
 * - Electric in-tank fuel pump 2.5s prime whine + continuous pressure hum
 * - Tactile mechanical ISO relay clacks (Main & Fuel Pump relays)
 * - Short-circuit electric arc crackle & fuse pop transients
 */
export class EmsAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOscA: OscillatorNode | null = null;
  private engineOscB: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private pumpOscA: OscillatorNode | null = null;
  private pumpOscB: OscillatorNode | null = null;
  private pumpFilter: BiquadFilterNode | null = null;
  private pumpGain: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private enabled = false;
  private volume = 0.55;
  private disposed = false;

  private prevMainRelay = false;
  private prevFuelRelay = false;
  private prevShortFault = false;
  private prevPowerActive = false;
  private pumpPrimeUntilMs = 0;

  private pulseTimerId: number | null = null;
  private lastParams: EmsAcousticParams = deriveEmsAcousticParams(null);
  private cylinderSlot = 0;

  private ensureContext(): AudioContext | null {
    if (this.disposed || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Shared white-noise buffer for injector metallic clicks, spark snaps, & fault arcs
      const len = Math.floor(this.ctx.sampleRate * 0.25);
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;

      this.initContinuousOscillators(this.ctx);
    }

    if (this.ctx.state === 'suspended' && this.enabled) {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private initContinuousOscillators(ctx: AudioContext): void {
    if (!this.masterGain) return;

    // 1. 4-Cylinder Engine Combustion Chain
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(160, ctx.currentTime);
    this.engineFilter.Q.setValueAtTime(2.6, ctx.currentTime);

    this.engineGain = ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.0001, ctx.currentTime);

    this.engineOscA = ctx.createOscillator();
    this.engineOscA.type = 'sawtooth';
    this.engineOscA.frequency.setValueAtTime(28, ctx.currentTime);

    this.engineOscB = ctx.createOscillator();
    this.engineOscB.type = 'triangle';
    this.engineOscB.frequency.setValueAtTime(56, ctx.currentTime);

    this.engineSubOsc = ctx.createOscillator();
    this.engineSubOsc.type = 'sine';
    this.engineSubOsc.frequency.setValueAtTime(14, ctx.currentTime);

    const oscBGain = ctx.createGain();
    oscBGain.gain.setValueAtTime(0.55, ctx.currentTime);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.45, ctx.currentTime);

    this.engineOscA.connect(this.engineFilter);
    this.engineOscB.connect(oscBGain);
    oscBGain.connect(this.engineFilter);
    this.engineSubOsc.connect(subGain);
    subGain.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.engineOscA.start();
    this.engineOscB.start();
    this.engineSubOsc.start();

    // 2. Electric In-Tank Fuel Pump Turbine Chain
    this.pumpFilter = ctx.createBiquadFilter();
    this.pumpFilter.type = 'bandpass';
    this.pumpFilter.frequency.setValueAtTime(380, ctx.currentTime);
    this.pumpFilter.Q.setValueAtTime(4.5, ctx.currentTime);

    this.pumpGain = ctx.createGain();
    this.pumpGain.gain.setValueAtTime(0.0001, ctx.currentTime);

    this.pumpOscA = ctx.createOscillator();
    this.pumpOscA.type = 'triangle';
    this.pumpOscA.frequency.setValueAtTime(320, ctx.currentTime);

    this.pumpOscB = ctx.createOscillator();
    this.pumpOscB.type = 'sine';
    this.pumpOscB.frequency.setValueAtTime(640, ctx.currentTime);

    const pumpBAtten = ctx.createGain();
    pumpBAtten.gain.setValueAtTime(0.35, ctx.currentTime);

    this.pumpOscA.connect(this.pumpFilter);
    this.pumpOscB.connect(pumpBAtten);
    pumpBAtten.connect(this.pumpFilter);
    this.pumpFilter.connect(this.pumpGain);
    this.pumpGain.connect(this.masterGain);

    this.pumpOscA.start();
    this.pumpOscB.start();
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    const ctx = enabled ? this.ensureContext() : this.ctx;
    if (ctx && this.masterGain) {
      const now = ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(enabled ? this.volume : 0.0001, now, 0.04);
    }
    if (enabled) {
      this.playConfirmationChime();
      this.scheduleNextFiringPulse();
    } else if (this.pulseTimerId !== null) {
      clearTimeout(this.pulseTimerId);
      this.pulseTimerId = null;
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0.05, Math.min(1, vol));
    if (this.ctx && this.masterGain && this.enabled) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public update(emsState: EmsDigitalTwinState | null | undefined): void {
    if (this.disposed) return;
    const params = deriveEmsAcousticParams(emsState);
    this.lastParams = params;

    // Detect mechanical transitions even if audio initializes right after toggle
    const mainRelayChanged = params.mainRelayLatched !== this.prevMainRelay;
    const fuelRelayChanged = params.fuelRelayLatched !== this.prevFuelRelay;
    const shortFaultTriggered = params.hasShortOrOcpFault && !this.prevShortFault;
    const ignitionJustTurnedOn = params.isPowerActive && !this.prevPowerActive;

    this.prevMainRelay = params.mainRelayLatched;
    this.prevFuelRelay = params.fuelRelayLatched;
    this.prevShortFault = params.hasShortOrOcpFault;
    this.prevPowerActive = params.isPowerActive;

    if (ignitionJustTurnedOn || (fuelRelayChanged && params.fuelRelayLatched)) {
      this.pumpPrimeUntilMs = Date.now() + 2400;
    }

    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (mainRelayChanged) {
      this.playRelayClick(params.mainRelayLatched, 1.0);
    }
    if (fuelRelayChanged) {
      this.playRelayClick(params.fuelRelayLatched, 0.85);
    }
    if (shortFaultTriggered) {
      this.playShortCircuitArc();
    }

    // Update continuous 4-cylinder combustion harmonics
    if (this.engineOscA && this.engineOscB && this.engineSubOsc && this.engineFilter && this.engineGain) {
      if (params.isEngineRunning && params.rpm > 0) {
        const baseHz = params.combustionFundamentalHz;
        const rpmRatio = Math.min(1, (params.rpm - 600) / 5400);
        this.engineOscA.frequency.setTargetAtTime(baseHz, now, 0.05);
        this.engineOscB.frequency.setTargetAtTime(baseHz * 2.0, now, 0.05);
        this.engineSubOsc.frequency.setTargetAtTime(baseHz * 0.5, now, 0.05);
        this.engineFilter.frequency.setTargetAtTime(
          135 + rpmRatio * 480 + params.throttleLoad * 240,
          now,
          0.06
        );
        const targetGain = 0.06 + rpmRatio * 0.065 + params.throttleLoad * 0.035;
        this.engineGain.gain.setTargetAtTime(targetGain, now, 0.07);
      } else {
        this.engineGain.gain.setTargetAtTime(0.0001, now, 0.09);
      }
    }

    // Update electric in-tank fuel pump prime whine & steady hum
    if (this.pumpOscA && this.pumpOscB && this.pumpFilter && this.pumpGain) {
      if (params.fuelPumpRunning) {
        const isPriming = Date.now() < this.pumpPrimeUntilMs;
        const pitch = isPriming ? 375 : 318;
        this.pumpOscA.frequency.setTargetAtTime(pitch, now, 0.08);
        this.pumpOscB.frequency.setTargetAtTime(pitch * 2.0, now, 0.08);
        this.pumpFilter.frequency.setTargetAtTime(isPriming ? 460 : 350, now, 0.08);
        this.pumpGain.gain.setTargetAtTime(
          isPriming ? params.fuelPumpGain * 1.45 : params.fuelPumpGain,
          now,
          0.08
        );
      } else {
        this.pumpGain.gain.setTargetAtTime(0.0001, now, 0.09);
      }
    }

    if (this.pulseTimerId === null) {
      this.scheduleNextFiringPulse();
    }
  }

  private scheduleNextFiringPulse(): void {
    if (this.disposed || !this.enabled) return;
    const p = this.lastParams;

    if (!p.isEngineRunning || p.firingHz <= 0) {
      // Check again smoothly while idle/standby
      this.pulseTimerId = window.setTimeout(() => {
        this.pulseTimerId = null;
        if (this.enabled && !this.disposed) {
          if (this.lastParams.hasShortOrOcpFault) {
            this.playShortCircuitArc();
          }
          this.scheduleNextFiringPulse();
        }
      }, 260);
      return;
    }

    // Cap audible discrete tick rate so high RPM stays crisp without saturating CPU
    const intervalMs = Math.max(28, Math.min(180, Math.round(1000 / Math.min(p.firingHz, 34))));
    this.pulseTimerId = window.setTimeout(() => {
      this.pulseTimerId = null;
      if (!this.enabled || this.disposed) return;

      const slot = this.cylinderSlot % 4;
      this.cylinderSlot = (this.cylinderSlot + 1) % 4;

      // Misfire realism: skip injector/spark tick on faulted cylinder slots
      if (slot < this.lastParams.healthyInjectorCount) {
        this.playInjectorSolenoidTick();
      }
      if (slot < this.lastParams.healthyCoilCount) {
        this.playIgnitionSparkSnap();
      }

      this.scheduleNextFiringPulse();
    }, intervalMs);
  }

  public playRelayClick(isLatching: boolean, intensity = 1): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Dual metallic armature contact transient (coil pull-in + contact bounce)
    const freqs = isLatching ? [1420, 920] : [780, 480];
    freqs.forEach((f, idx) => {
      const t = now + idx * 0.011;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(190, t + 0.018);
      gain.gain.setValueAtTime(0.11 * intensity * (idx === 0 ? 1 : 0.6), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.022);
    });
  }

  private playInjectorSolenoidTick(): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(3400 + Math.random() * 420, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.009);
    gain.gain.setValueAtTime(0.026, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.011);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.012);
  }

  private playIgnitionSparkSnap(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(4200, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.032, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.008);

    src.connect(hp);
    hp.connect(gain);
    gain.connect(this.masterGain);
    src.start(now, Math.random() * 0.1, 0.01);
  }

  public playShortCircuitArc(): void {
    if (!this.enabled || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2200, now);
    bp.Q.setValueAtTime(2.2, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.masterGain);
    src.start(now, 0, 0.13);
  }

  private playConfirmationChime(): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.065);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    if (this.pulseTimerId !== null) {
      clearTimeout(this.pulseTimerId);
      this.pulseTimerId = null;
    }
    try {
      this.engineOscA?.stop();
      this.engineOscB?.stop();
      this.engineSubOsc?.stop();
      this.pumpOscA?.stop();
      this.pumpOscB?.stop();
    } catch {
      // Ignore already-stopped oscillators
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.masterGain = null;
  }
}
