/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { OscilloscopeSignalFamily } from '../../types/oscilloscopeWaveformIngestion';

export type WaveformCompareViewMode = 'GOOD' | 'FAULTY' | 'OVERLAY';

export interface SynthesizedWaveformPacket {
  signalFamily: OscilloscopeSignalFamily;
  ch1Label: string;
  ch2Label: string | null;
  ch1Unit: string;
  vMinDisplay: number;
  vMaxDisplay: number;
  timebaseMsPerDiv: number;
  voltsPerDiv: number;
  triggerLevelV: number;
  goodCh1: Float32Array;
  faultyCh1: Float32Array;
  goodCh2: Float32Array | null;
  faultyDescription: string;
  metricsGood: {
    vMax: number;
    vMin: number;
    vpp: number;
    freqHz: number;
    dutyPct: number | null;
  };
  metricsFaulty: {
    vMax: number;
    vMin: number;
    vpp: number;
    freqHz: number;
    dutyPct: number | null;
  };
}

function deterministicAdcNoise(index: number, phaseOffset: number, amplitudeV: number): number {
  const s = index * 0.73 + phaseOffset * 13.7;
  const n = Math.sin(s * 17.3) * Math.cos(s * 7.1) + 0.5 * Math.sin(s * 43.9);
  return (n / 1.5) * amplitudeV;
}

function computeStats(buf: Float32Array, freqHz: number, dutyPct: number | null) {
  let vMin = Infinity;
  let vMax = -Infinity;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] < vMin) vMin = buf[i];
    if (buf[i] > vMax) vMax = buf[i];
  }
  return {
    vMax: Number(vMax.toFixed(2)),
    vMin: Number(vMin.toFixed(2)),
    vpp: Number(Math.max(0, vMax - vMin).toFixed(2)),
    freqHz: Number(freqHz.toFixed(1)),
    dutyPct: dutyPct !== null ? Number(dutyPct.toFixed(1)) : null,
  };
}

/**
 * Physics-grade deterministic automotive oscilloscope waveform synthesizer.
 * Produces trigger-locked Known-Good and Faulty signal buffers with realistic
 * automotive transients (62V injector flyback + pintle bump, 60-2 missing tooth
 * VR amplitude jump, ignition dwell + burn line + coil ring, mirrored CAN-H/L
 * packets, 3-phase alternator diode dropout, lazy O2 switching, and subtle ADC noise).
 */
export function synthesizeOemWaveform(params: {
  signalFamily: OscilloscopeSignalFamily;
  rpm?: number;
  sampleCount?: number;
  triggerJitterPhase?: number;
  timebaseScale?: number;
}): SynthesizedWaveformPacket {
  const {
    signalFamily,
    rpm = 850,
    sampleCount = 480,
    triggerJitterPhase = 0,
    timebaseScale = 1.0,
  } = params;

  const goodCh1 = new Float32Array(sampleCount);
  const faultyCh1 = new Float32Array(sampleCount);
  let goodCh2: Float32Array | null = null;

  let ch1Label = 'CH1 SIG';
  let ch2Label: string | null = null;
  const ch1Unit = 'V';
  let vMinDisplay = -1;
  let vMaxDisplay = 15;
  let timebaseMsPerDiv = 5;
  let voltsPerDiv = 2;
  let triggerLevelV = 2.5;
  let freqHz = Math.max(5, (rpm / 60) * 1);
  let dutyPct: number | null = null;
  let faultyDescription = 'Open/short circuit or signal dropout vs known-good reference';

  const zoomFactor = Math.max(0.25, Math.min(4.0, timebaseScale));
  const jitter = (Math.sin(triggerJitterPhase * 1.7) * 0.0018);

  switch (signalFamily) {
    case 'INJECTOR_FUEL': {
      ch1Label = 'CH1 INJ_V';
      ch2Label = 'CH2 CKP_REF';
      goodCh2 = new Float32Array(sampleCount);
      vMinDisplay = -5;
      vMaxDisplay = 75;
      timebaseMsPerDiv = 2 * zoomFactor;
      voltsPerDiv = 10;
      triggerLevelV = 6.0;
      freqHz = Math.max(4, rpm / 120);
      dutyPct = Math.min(85, Math.max(3, (rpm / 850) * 9.1));
      faultyDescription = 'Shorted injector winding: weak 18V inductive peak and missing pintle-closing hump';

      for (let i = 0; i < sampleCount; i++) {
        const u = i / (sampleCount - 1) + jitter;
        const n = deterministicAdcNoise(i, triggerJitterPhase, 0.22);
        const onStart = 0.22;
        const onEnd = 0.22 + 0.18 / zoomFactor;
        if (u < onStart) {
          goodCh1[i] = 12.6 + n;
          faultyCh1[i] = 12.5 + n;
        } else if (u < onEnd) {
          goodCh1[i] = 0.28 + n * 0.4;
          faultyCh1[i] = 1.65 + n * 0.6; // high ground-side resistance
        } else {
          const dt = (u - onEnd) / (0.22 / zoomFactor);
          if (dt < 1.2) {
            const spikeGood = 52.0 * Math.exp(-dt * 4.8);
            const pintle = 9.5 * Math.exp(-Math.pow((dt - 0.34) / 0.11, 2));
            goodCh1[i] = 12.6 + spikeGood + pintle + n;
            const spikeFault = 8.2 * Math.exp(-dt * 6.5);
            faultyCh1[i] = 12.5 + spikeFault + n;
          } else {
            goodCh1[i] = 12.6 + n;
            faultyCh1[i] = 12.5 + n;
          }
        }
        const teeth = 16 * zoomFactor;
        const inGap = u > 0.56 && u < 0.64;
        goodCh2[i] = inGap ? 0 + n : Math.sin(u * Math.PI * 2 * teeth) * 10 + n;
      }
      break;
    }

    case 'CKP_CRANKSHAFT': {
      ch1Label = 'CH1 CKP 60-2 VR';
      ch2Label = 'CH2 CMP HALL';
      goodCh2 = new Float32Array(sampleCount);
      vMinDisplay = -16;
      vMaxDisplay = 16;
      timebaseMsPerDiv = 5 * zoomFactor;
      voltsPerDiv = 5;
      triggerLevelV = 0;
      freqHz = (rpm / 60) * 58;
      faultyDescription = 'Excessive air gap / reluctor runout: low Vpp amplitude & damaged tooth glitch';

      const teethCount = Math.max(8, Math.round((14 + rpm / 550) * zoomFactor));
      const ampGood = Math.min(12.5, 2.2 + rpm * 0.0042);
      for (let i = 0; i < sampleCount; i++) {
        const u = i / (sampleCount - 1) + jitter;
        const n = deterministicAdcNoise(i, triggerJitterPhase, 0.12);
        const inGap = u > 0.45 && u < 0.54;
        const nearGap = (u > 0.42 && u <= 0.45) || (u >= 0.54 && u < 0.57);
        const env = nearGap ? 1.28 : 1.0;

        if (inGap) {
          goodCh1[i] = n * 0.9;
          faultyCh1[i] = n * 1.4;
        } else {
          goodCh1[i] = Math.sin(u * Math.PI * 2 * teethCount) * ampGood * env + n;
          const runout = 0.38 + 0.18 * Math.sin(u * Math.PI * 2);
          const brokenTooth = u > 0.24 && u < 0.29 ? 0.15 : 1.0;
          faultyCh1[i] = Math.sin(u * Math.PI * 2 * teethCount) * ampGood * runout * brokenTooth + n * 1.6;
        }

        // CH2 CMP Hall 0-5V reference synced to CKP gap
        const cmpHigh = (u > 0.12 && u < 0.26) || (u > 0.58 && u < 0.78);
        goodCh2[i] = (cmpHigh ? 5.0 : 0.1) + n * 0.35;
      }
      break;
    }

    case 'CMP_CAMSHAFT': {
      ch1Label = 'CH1 CMP HALL';
      ch2Label = 'CH2 CKP REF';
      goodCh2 = new Float32Array(sampleCount);
      vMinDisplay = -1;
      vMaxDisplay = 7;
      timebaseMsPerDiv = 10 * zoomFactor;
      voltsPerDiv = 1;
      triggerLevelV = 2.5;
      freqHz = Math.max(3, (rpm / 120) * 4);
      dutyPct = 42.0;
      faultyDescription = 'Retarded cam timing phase shift (+18° chain stretch) + elevated 0.9V ground offset';

      for (let i = 0; i < sampleCount; i++) {
        const u = i / (sampleCount - 1) + jitter;
        const n = deterministicAdcNoise(i, triggerJitterPhase, 0.045);
        const isHigh = (u > 0.12 && u < 0.30) || (u > 0.48 && u < 0.58) || (u > 0.74 && u < 0.92);
        const uShift = u - 0.08; // stretched chain phase retard
        const isHighFault =
          (uShift > 0.12 && uShift < 0.30) ||
          (uShift > 0.48 && uShift < 0.58) ||
          (uShift > 0.74 && uShift < 0.92);
        goodCh1[i] = (isHigh ? 5.02 : 0.08) + n;
        faultyCh1[i] = (isHighFault ? 4.85 : 0.92) + n * 1.5;
        goodCh2[i] = 1.8 + Math.sin(u * Math.PI * 2 * 22 * zoomFactor) * 1.2 + n;
      }
      break;
    }

    case 'CAN_LIN_NETWORK': {
      ch1Label = 'CH1 CAN_H';
      ch2Label = 'CH2 CAN_L';
      goodCh2 = new Float32Array(sampleCount);
      vMinDisplay = 0;
      vMaxDisplay = 5;
      timebaseMsPerDiv = 0.05 * zoomFactor;
      voltsPerDiv = 1;
      triggerLevelV = 3.0;
      freqHz = 500_000;
      dutyPct = 48.5;
      faultyDescription = 'Missing 120Ω termination ringing + CAN_L ground bias collapse (U0100/U0073)';

      // Deterministic CAN bit packet pattern
      const bits = [
        0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 0, 0, 1, 0,
        1, 1, 0, 1, 0, 1, 0, 0, 0, 0,
      ];
      for (let i = 0; i < sampleCount; i++) {
        const u = i / (sampleCount - 1);
        const n = deterministicAdcNoise(i, triggerJitterPhase, 0.028);
        const bitPos = u * bits.length * zoomFactor;
        const idx = Math.floor(bitPos) % bits.length;
        const frac = bitPos - Math.floor(bitPos);
        const bit = bits[idx];
        // Realistic slight capacitive edge slew
        const edge = Math.min(1, frac * 8);
        const prevBit = bits[(idx - 1 + bits.length) % bits.length];
        const level = prevBit + (bit - prevBit) * edge;

        goodCh1[i] = 2.5 + level * 1.02 + n;
        goodCh2[i] = 2.5 - level * 1.02 + n;
        // Faulty: termination ringing + dragged down bias
        const ring = bit !== prevBit ? Math.sin(frac * Math.PI * 6) * 0.42 * Math.exp(-frac * 4) : 0;
        faultyCh1[i] = 1.15 + level * 0.55 + ring + n * 2.1;
      }
      break;
    }

    case 'IGNITION_PRIMARY_SECONDARY': {
      ch1Label = 'CH1 IGN_PRI';
      vMinDisplay = -20;
      vMaxDisplay = 360;
      timebaseMsPerDiv = 1.0 * zoomFactor;
      voltsPerDiv = 50;
      triggerLevelV = 45;
      freqHz = Math.max(5, rpm / 120);
      dutyPct = 14.5;
      faultyDescription = 'Shorted coil primary turns: shortened 0.4ms burn line & zero post-burn oscillations';

      for (let i = 0; i < sampleCount; i++) {
        const u = i / (sampleCount - 1) + jitter;
        const n = deterministicAdcNoise(i, triggerJitterPhase, 0.9);
        if (u < 0.18) {
          goodCh1[i] = 13.8 + n;
          faultyCh1[i] = 13.8 + n;
        } else if (u < 0.36) {
          // Dwell saturation
          goodCh1[i] = 0.4 + (u - 0.18) * 6 + n * 0.5;
          faultyCh1[i] = 0.6 + (u - 0.18) * 12 + n * 0.5;
        } else if (u < 0.39) {
          // Inductive primary kick (320V good vs 115V shorted turns)
          const t = (u - 0.36) / 0.03;
          goodCh1[i] = 325 * Math.sin(t * Math.PI * 0.85) + 45 + n;
          faultyCh1[i] = 115 * Math.sin(t * Math.PI * 0.85) + 20 + n;
        } else if (u < 0.56) {
          // Spark burn line (~1.4ms good vs rapid collapse faulty)
          const t = (u - 0.39) / 0.17;
          goodCh1[i] = 58 - t * 14 + Math.sin(t * 24) * 2.2 + n;
          faultyCh1[i] = t < 0.3 ? 34 - t * 40 + n : 13.8 + n;
        } else if (u < 0.72) {
          // 4-5 decaying coil oscillations (healthy coil energy reserve!)
          const t = (u - 0.56) / 0.16;
          goodCh1[i] = 13.8 + Math.sin(t * Math.PI * 8) * 22 * Math.exp(-t * 3.4) + n;
          faultyCh1[i] = 13.8 + n; // zero oscillations = shorted winding!
        } else {
          goodCh1[i] = 13.8 + n;
          faultyCh1[i] = 13.8 + n;
        }
      }
      break;
    }

    case 'O2_LAMBDA_AFR': {
      ch1Label = 'CH1 O2_B1S1';
      vMinDisplay = 0;
      vMaxDisplay = 1.1;
      timebaseMsPerDiv = 200 * zoomFactor;
      voltsPerDiv = 0.2;
      triggerLevelV = 0.45;
      freqHz = 1.2;
      dutyPct = 50;
      faultyDescription = 'Lazy / poisoned zirconia sensor stuck near 0.45V with sluggish >600ms transitions';

      for (let i = 0; i < sampleCount; i++) {
        const u = i / (sampleCount - 1);
        const n = deterministicAdcNoise(i, triggerJitterPhase, 0.012);
        const s = Math.sin(u * Math.PI * 2 * 3.0 * zoomFactor);
        goodCh1[i] = 0.49 + Math.tanh(s * 3.4) * 0.37 + n;
        faultyCh1[i] = 0.44 + Math.sin(u * Math.PI * 2 * 0.9) * 0.08 + n * 1.4;
      }
      break;
    }

    case 'CHARGING_STARTING_RIPPLE': {
      ch1Label = 'CH1 ALT_RIPPLE';
      vMinDisplay = 12.2;
      vMaxDisplay = 14.8;
      timebaseMsPerDiv = 2 * zoomFactor;
      voltsPerDiv = 0.5;
      triggerLevelV = 14.1;
      freqHz = (rpm / 60) * 18;
      faultyDescription = 'Blown open rectifier diode: deep rhythmic 1.2V dropout valleys on charging bus';

      for (let i = 0; i < sampleCount; i++) {
        const u = i / (sampleCount - 1);
        const n = deterministicAdcNoise(i, triggerJitterPhase, 0.015);
        const phases = 12 * zoomFactor;
        const rippleGood = Math.abs(Math.sin(u * Math.PI * phases)) * 0.16;
        goodCh1[i] = 14.12 + rippleGood + n;
        const phaseIdx = Math.floor(u * phases) % 3;
        const dropFault = phaseIdx === 1 ? -1.15 * Math.pow(Math.sin(((u * phases) % 1) * Math.PI), 1.4) : rippleGood;
        faultyCh1[i] = 13.75 + dropFault + n * 1.6;
      }
      break;
    }

    case 'ABS_WHEEL_SPEED': {
      ch1Label = 'CH1 WSS_MR';
      vMinDisplay = 0;
      vMaxDisplay = 2.0;
      timebaseMsPerDiv = 2 * zoomFactor;
      voltsPerDiv = 0.5;
      triggerLevelV = 1.05;
      freqHz = 240;
      dutyPct = 50;
      faultyDescription = 'Damaged magnetic tone ring: missing pulses and intermittent dropout to 0.7V base';

      for (let i = 0; i < sampleCount; i++) {
        const u = i / (sampleCount - 1) + jitter;
        const n = deterministicAdcNoise(i, triggerJitterPhase, 0.02);
        const cyc = (u * 12 * zoomFactor) % 1;
        const high = cyc < 0.5;
        goodCh1[i] = (high ? 1.42 : 0.71) + n;
        const missingZone = u > 0.42 && u < 0.62;
        faultyCh1[i] = (!missingZone && high ? 1.38 : 0.71) + n * 1.6;
      }
      break;
    }

    default: {
      // PWM Solenoid, MAF Digital/Analog, MAP, TPS, Knock, Rail Pressure, Compression
      ch1Label = `CH1 ${signalFamily.split('_')[0]}`;
      vMinDisplay = 0;
      vMaxDisplay = 5.5;
      timebaseMsPerDiv = 5 * zoomFactor;
      voltsPerDiv = 1;
      triggerLevelV = 2.5;
      freqHz = signalFamily === 'PWM_SOLENOID_VALVE' ? 250 : 80;
      dutyPct = signalFamily === 'PWM_SOLENOID_VALVE' ? 38.0 : null;
      faultyDescription = 'Signal dropout / wiper dead spot or voltage bias collapse outside OEM envelope';

      for (let i = 0; i < sampleCount; i++) {
        const u = i / (sampleCount - 1) + jitter;
        const n = deterministicAdcNoise(i, triggerJitterPhase, 0.035);
        if (signalFamily === 'PWM_SOLENOID_VALVE') {
          const cyc = (u * 8 * zoomFactor) % 1;
          goodCh1[i] = (cyc < 0.38 ? 0.15 : 4.95) + n;
          faultyCh1[i] = (cyc < 0.08 ? 1.6 : 4.95) + n * 1.8;
        } else if (signalFamily === 'KNOCK_SENSOR') {
          const burst = Math.exp(-Math.pow((u - 0.42) / 0.09, 2)) * Math.sin(u * 180) * 1.8;
          goodCh1[i] = 2.5 + burst + n;
          faultyCh1[i] = 2.5 + n * 0.5; // open piezo = flatline
        } else {
          // Smooth analog sensor sweep (TPS / MAP / MAF / Rail Pressure)
          const sweep = 0.65 + 3.8 * Math.pow(Math.sin(u * Math.PI), 1.3);
          goodCh1[i] = sweep + n;
          const glitch = u > 0.45 && u < 0.54 ? 0.08 : sweep * 0.75;
          faultyCh1[i] = glitch + n * 2.2;
        }
      }
      break;
    }
  }

  return {
    signalFamily,
    ch1Label,
    ch2Label,
    ch1Unit,
    vMinDisplay,
    vMaxDisplay,
    timebaseMsPerDiv,
    voltsPerDiv,
    triggerLevelV,
    goodCh1,
    faultyCh1,
    goodCh2,
    faultyDescription,
    metricsGood: computeStats(goodCh1, freqHz, dutyPct),
    metricsFaulty: computeStats(faultyCh1, freqHz, dutyPct),
  };
}

/**
 * Shared 1.15px Fine-Beam Industrial DSO Canvas Renderer.
 * Renders a recessed matte-black scope grid with 10x8 divisions, center-axis
 * vernier ticks, tight 2.3px @ 20% phosphor persistence halo + razor-sharp 1.15px
 * core beam, ground markers (1► / 2►), and trigger level arrow (T►).
 */
export function renderRealisticDsoCanvas(params: {
  canvas: HTMLCanvasElement;
  packet: SynthesizedWaveformPacket;
  viewMode: WaveformCompareViewMode;
  phosphorEnabled?: boolean;
  isPowerOn?: boolean;
}): void {
  const { canvas, packet, viewMode, phosphorEnabled = true, isPowerOn = true } = params;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(240, Math.floor(rect.width || canvas.width));
  const height = Math.max(120, Math.floor(rect.height || canvas.height));
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Deep anti-glare obsidian DSO background
  ctx.fillStyle = '#06080b';
  ctx.fillRect(0, 0, width, height);

  // 10x8 major graticule grid
  ctx.strokeStyle = 'rgba(156, 166, 180, 0.11)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const x = Math.round((width / 10) * i) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let j = 0; j <= 8; j++) {
    const y = Math.round((height / 8) * j) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Center crosshair vernier sub-ticks (50 horizontal, 40 vertical)
  ctx.strokeStyle = 'rgba(156, 166, 180, 0.24)';
  for (let i = 0; i <= 50; i++) {
    const x = (width / 50) * i;
    ctx.beginPath();
    ctx.moveTo(x, height / 2 - 2.5);
    ctx.lineTo(x, height / 2 + 2.5);
    ctx.stroke();
  }
  for (let j = 0; j <= 40; j++) {
    const y = (height / 40) * j;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 2.5, y);
    ctx.lineTo(width / 2 + 2.5, y);
    ctx.stroke();
  }

  if (!isPowerOn) {
    ctx.fillStyle = '#6e7785';
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.fillText('[ OUTPUT OFF — 0.00 V ]', width / 2 - 78, height / 2 + 4);
    ctx.restore();
    return;
  }

  const padTop = 14;
  const padBottom = 14;
  const usableH = height - padTop - padBottom;
  const spanV = Math.max(0.5, packet.vMaxDisplay - packet.vMinDisplay);
  const toY = (v: number, bandTopRatio = 0, bandHeightRatio = 1) => {
    const norm = Math.max(-0.08, Math.min(1.08, (v - packet.vMinDisplay) / spanV));
    const bandTop = padTop + usableH * bandTopRatio;
    const bandH = usableH * bandHeightRatio;
    return bandTop + (1 - norm) * bandH;
  };

  const strokeFineBeam = (
    buf: Float32Array,
    color: string,
    dashed: boolean,
    mapY: (v: number) => number
  ) => {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (dashed) ctx.setLineDash([4, 3]);

    // Pass 1: subtle tight phosphor persistence halo
    if (phosphorEnabled && !dashed) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.20;
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      for (let i = 0; i < buf.length; i++) {
        const x = (i / (buf.length - 1)) * width;
        const y = mapY(buf[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Pass 2: 1.15px razor-sharp DSO core beam
    ctx.globalAlpha = dashed ? 0.88 : 0.97;
    ctx.strokeStyle = color;
    ctx.lineWidth = dashed ? 1.0 : 1.15;
    ctx.beginPath();
    for (let i = 0; i < buf.length; i++) {
      const x = (i / (buf.length - 1)) * width;
      const y = mapY(buf[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  };

  const hasCh2 = Boolean(packet.goodCh2);
  const ch1BandH = hasCh2 ? 0.62 : 1.0;

  // CH2 (Lower band, Instrument LED Green #4ade80)
  if (packet.goodCh2) {
    let ch2Min = Infinity;
    let ch2Max = -Infinity;
    for (let i = 0; i < packet.goodCh2.length; i++) {
      if (packet.goodCh2[i] < ch2Min) ch2Min = packet.goodCh2[i];
      if (packet.goodCh2[i] > ch2Max) ch2Max = packet.goodCh2[i];
    }
    const ch2Span = Math.max(1, ch2Max - ch2Min);
    strokeFineBeam(packet.goodCh2, '#4ade80', false, (v) => {
      const norm = (v - ch2Min) / ch2Span;
      return padTop + usableH * 0.68 + (1 - norm) * (usableH * 0.30);
    });
  }

  // CH1 Known-Good (Gold-Ochre #d9a441)
  if (viewMode === 'GOOD' || viewMode === 'OVERLAY') {
    strokeFineBeam(packet.goodCh1, '#d9a441', false, (v) => toY(v, 0, ch1BandH));
  }

  // CH1 Faulty Comparison (Instrument LED Red #f05252)
  if (viewMode === 'FAULTY' || viewMode === 'OVERLAY') {
    strokeFineBeam(
      packet.faultyCh1,
      '#f05252',
      viewMode === 'OVERLAY',
      (v) => toY(v, 0, ch1BandH)
    );
  }

  // Edge markers (1►, 2►, T►)
  ctx.font = '600 9px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#d9a441';
  ctx.fillText(`1► ${packet.ch1Label}`, 6, 13);
  if (packet.ch2Label) {
    ctx.fillStyle = '#4ade80';
    ctx.fillText(`2► ${packet.ch2Label}`, 6, padTop + usableH * 0.67);
  }
  const trigY = Math.max(12, Math.min(height - 8, toY(packet.triggerLevelV, 0, ch1BandH)));
  ctx.fillStyle = '#9ba4b2';
  ctx.fillText('T►', width - 18, trigY + 3);

  ctx.restore();
}
