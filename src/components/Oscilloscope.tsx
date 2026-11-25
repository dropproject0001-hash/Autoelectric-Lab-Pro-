/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowLeftRight, ArrowUpDown, GitCompare, Pause, Play, Zap } from 'lucide-react';
import { EcuPin, InjectedFault } from '../types/ecu';
import { SignalGenerator } from '../simulation/signals/SignalGenerator';
import { RackCornerScrews, RotaryEncoderDial } from './HardwareControls';

type ScopeSignalMode =
  | 'CAN_BUS'
  | 'INJECTOR_PWM'
  | 'CRANK_CKP'
  | 'O2_LAMBDA'
  | 'TPS_DC'
  | 'GPT_BENCH'
  | 'DUAL_PIN';

interface OscilloscopeProps {
  isPowerOn: boolean;
  selectedSignal: 'CAN_BUS' | 'INJECTOR_PWM' | 'CRANK_CKP' | 'TPS_DC' | 'O2_LAMBDA';
  hasCanFault: boolean;
  hasInjectorFault: boolean;
  simulationSpeed?: number;
  emulatorRpm?: number;
  isRpmEmulatorActive?: boolean;
  isInjectorFiring?: boolean;
  camPhaseOffsetDeg?: number;
  ckpSignalLost?: boolean;
  pins?: EcuPin[];
  nodeVoltages?: Record<string, number>;
  faults?: InjectedFault[];
  selectedPinId?: string | null;
  onSelectPin?: (pinId: string) => void;
}

function pickCompanionPinId(ch1Id: string, pins: EcuPin[]): string {
  const pairs: Record<string, string> = {
    'ecu-pin-13': 'ecu-pin-14',
    'ecu-pin-14': 'ecu-pin-13',
    'ecu-pin-10': 'ecu-pin-11',
    'ecu-pin-11': 'ecu-pin-10',
    'ecu-pin-7': 'ecu-pin-8',
    'ecu-pin-8': 'ecu-pin-7',
    'ecu-pin-3': 'ecu-pin-4',
    'ecu-pin-4': 'ecu-pin-3',
  };
  const preferred = pairs[ch1Id];
  if (preferred && pins.some((p) => p.id === preferred)) return preferred;
  return pins.find((p) => p.id !== ch1Id)?.id || ch1Id;
}

export const Oscilloscope: React.FC<OscilloscopeProps> = ({
  isPowerOn,
  selectedSignal,
  hasCanFault,
  hasInjectorFault,
  simulationSpeed = 1.0,
  emulatorRpm = 850,
  isRpmEmulatorActive = false,
  isInjectorFiring = true,
  camPhaseOffsetDeg = 0,
  ckpSignalLost = false,
  pins = [],
  nodeVoltages = {},
  faults = [],
  selectedPinId = null,
  onSelectPin,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isRunning, setIsRunning] = useState(true);
  const [voltDiv, setVoltDiv] = useState(1.0);
  const [timeDiv, setTimeDiv] = useState(1.0);
  const [activeSignal, setActiveSignal] = useState<ScopeSignalMode>(selectedSignal);
  const [localCh1PinId, setLocalCh1PinId] = useState<string>('ecu-pin-10');
  const [ch2PinId, setCh2PinId] = useState<string>('ecu-pin-11');
  const [isAutoScale, setIsAutoScale] = useState(false);
  const [triggerSource, setTriggerSource] = useState<'CH1' | 'CH2'>('CH1');
  const [triggerMode, setTriggerMode] = useState<'Auto' | 'Normal' | 'Single'>('Auto');
  const [triggerLevelV, setTriggerLevelV] = useState<number>(2.5);

  useEffect(() => {
    setActiveSignal((prev) =>
      prev === 'DUAL_PIN' || prev === 'GPT_BENCH' ? prev : selectedSignal
    );
  }, [selectedSignal]);

  const effectiveCh1PinId = selectedPinId || localCh1PinId;

  const ch1Pin = useMemo(
    () => pins.find((p) => p.id === effectiveCh1PinId) || pins[0] || null,
    [pins, effectiveCh1PinId]
  );

  const ch2Pin = useMemo(() => {
    if (pins.length === 0) return null;
    return (
      pins.find((p) => p.id === ch2PinId) ||
      pins.find((p) => p.id === pickCompanionPinId(ch1Pin?.id || '', pins)) ||
      pins[0]
    );
  }, [pins, ch2PinId, ch1Pin]);

  const ch1FaultType = useMemo(
    () => (ch1Pin ? faults.find((f) => f.pinId === ch1Pin.id)?.faultType ?? 'NONE' : 'NONE'),
    [faults, ch1Pin]
  );

  const ch2FaultType = useMemo(
    () => (ch2Pin ? faults.find((f) => f.pinId === ch2Pin.id)?.faultType ?? 'NONE' : 'NONE'),
    [faults, ch2Pin]
  );

  const ch1MnaVoltage = ch1Pin ? nodeVoltages[ch1Pin.id] ?? ch1Pin.nominalVoltage : 0;
  const ch2MnaVoltage = ch2Pin ? nodeVoltages[ch2Pin.id] ?? ch2Pin.nominalVoltage : 0;

  const canHMnaV = nodeVoltages['ecu-pin-13'] ?? 2.5;
  const canLMnaV = nodeVoltages['ecu-pin-14'] ?? 2.5;
  const injMnaV = nodeVoltages['ecu-pin-10'] ?? 12.6;
  const o2MnaV = nodeVoltages['ecu-pin-15'] ?? 0.45;
  const tpsMnaV = nodeVoltages['ecu-pin-7'] ?? 0.85;

  const canPinFault = faults.find((f) => f.pinId === 'ecu-pin-13' || f.pinId === 'ecu-pin-14')?.faultType ?? 'NONE';
  const injPinFault = faults.find((f) => f.pinId === 'ecu-pin-10')?.faultType ?? 'NONE';
  const o2PinFault = faults.find((f) => f.pinId === 'ecu-pin-15')?.faultType ?? 'NONE';
  const kl30V = nodeVoltages['ecu-pin-3'] ?? 12.6;
  const kl15V = nodeVoltages['ecu-pin-4'] ?? 12.6;
  const kl31V = nodeVoltages['ecu-pin-1'] ?? 0;
  const kl31_2V = nodeVoltages['ecu-pin-2'] ?? 0;
  const isEcuAwake = isPowerOn && kl30V - kl31V >= 6.5 && kl15V - kl31_2V >= 6.5;

  const isCanBusHealthy =
    isEcuAwake &&
    !hasCanFault &&
    canHMnaV >= 0.3 &&
    canLMnaV >= 0.3 &&
    Math.abs(canHMnaV - canLMnaV) <= 3.0;

  const activeRpm = isRpmEmulatorActive ? emulatorRpm : 850;
  const dualWindowMs = Math.max(10, Math.round(40 / timeDiv));
  const simTimeRef = useRef<number>(0);
  const [hudSimTimeSec, setHudSimTimeSec] = useState<number>(0);

  // Live telemetry snapshot for DUAL_PIN mode, synced at ~7 Hz with advancing CRT simTime
  const dualTelemetry = useMemo(() => {
    if (activeSignal !== 'DUAL_PIN' || !ch1Pin || !ch2Pin) return null;
    return SignalGenerator.sampleDualPinWaveformSeries({
      ch1PinId: ch1Pin.id,
      ch1PinLabel: ch1Pin.label,
      ch1MnaVoltage,
      ch1FaultType,
      ch2PinId: ch2Pin.id,
      ch2PinLabel: ch2Pin.label,
      ch2MnaVoltage,
      ch2FaultType,
      isPowerOn,
      isEcuAwake,
      ckpSignalLost,
      hasCanFault,
      hasInjectorFault,
      isInjectorFiring,
      rpm: activeRpm,
      tStartSec: hudSimTimeSec,
      windowMs: dualWindowMs,
      sampleCount: 128,
    });
  }, [
    activeSignal,
    ch1Pin,
    ch2Pin,
    ch1MnaVoltage,
    ch1FaultType,
    ch2MnaVoltage,
    ch2FaultType,
    isPowerOn,
    isEcuAwake,
    ckpSignalLost,
    hasCanFault,
    hasInjectorFault,
    isInjectorFiring,
    activeRpm,
    dualWindowMs,
    hudSimTimeSec,
  ]);

  // Live physical measurements anchored to MNA nodeVoltages & SignalGenerator
  let measuredVpp = '0.00 V';
  let measuredFreq = '0.0 Hz';
  let measuredDuty = '0.0 %';
  let measuredVrms = '0.00 V';

  if (activeSignal === 'DUAL_PIN' && dualTelemetry) {
    const f1 = dualTelemetry.ch1Stats.freqHz;
    measuredVpp = `${dualTelemetry.ch1Stats.vpp.toFixed(2)} / ${dualTelemetry.ch2Stats.vpp.toFixed(2)} V`;
    measuredFreq = f1 >= 1000 ? `${(f1 / 1000).toFixed(1)} kHz` : `${f1.toFixed(1)} Hz`;
    measuredDuty =
      dualTelemetry.correlationR !== null ? `r=${dualTelemetry.correlationR.toFixed(2)}` : 'DC/Flat';
    measuredVrms =
      dualTelemetry.phaseDiffDeg !== null ? `Δφ ${dualTelemetry.phaseDiffDeg.toFixed(1)}°` : `ΔV ${dualTelemetry.avgDiffV.toFixed(2)}V`;
  } else if (isPowerOn) {
    if (activeSignal === 'CAN_BUS') {
      const canAvgV = (canHMnaV + canLMnaV) / 2;
      measuredVpp = isCanBusHealthy ? '2.00 V' : '0.00 V';
      measuredFreq = isCanBusHealthy ? '500.0 kHz' : '0.0 kHz';
      measuredDuty = isCanBusHealthy ? '50.0 %' : '0.0 %';
      measuredVrms = `${canAvgV.toFixed(2)} V`;
    } else if (activeSignal === 'INJECTOR_PWM') {
      const injSeries = SignalGenerator.samplePinWaveformSeries({
        pinId: 'ecu-pin-10',
        pinLabel: 'INJ_1',
        mnaNodeVoltage: injMnaV,
        faultType: injPinFault,
        isPowerOn,
        isEcuAwake,
        ckpSignalLost,
        hasCanFault,
        hasInjectorFault,
        isInjectorFiring,
        rpm: activeRpm,
        tStartSec: 0,
        windowMs: 160,
        sampleCount: 128,
      });
      measuredVpp = `${injSeries.vpp.toFixed(2)} V`;
      measuredFreq = injSeries.freqHz > 0 ? `${injSeries.freqHz.toFixed(1)} Hz` : '0.0 Hz (NO PULSE)';
      const dutyPct =
        injSeries.freqHz > 0 ? Math.min(45, (2.5 / (1000 / injSeries.freqHz)) * 100) : 0;
      measuredDuty = `${dutyPct.toFixed(1)} %`;
      measuredVrms = `${injSeries.vAvg.toFixed(2)} V`;
    } else if (activeSignal === 'CRANK_CKP') {
      if (ckpSignalLost) {
        measuredVpp = '0.00 V';
        measuredFreq = '0.00 kHz';
        measuredDuty = 'CKP LOST';
        measuredVrms = '0.00 V';
      } else {
        const crankFreqKhz = ((activeRpm / 60) * 60) / 1000;
        const vrPeak = Math.min(18.0, 1.2 + (activeRpm / 1000) * 1.8);
        measuredVpp = `${(vrPeak * 2).toFixed(2)} V`;
        measuredFreq = `${crankFreqKhz.toFixed(2)} kHz`;
        measuredDuty = `CMP ${camPhaseOffsetDeg > 0 ? '+' : ''}${camPhaseOffsetDeg}°`;
        measuredVrms = `${(vrPeak * 0.707).toFixed(2)} V`;
      }
    } else if (activeSignal === 'O2_LAMBDA') {
      const o2Series = SignalGenerator.samplePinWaveformSeries({
        pinId: 'ecu-pin-15',
        pinLabel: 'O2_SIG',
        mnaNodeVoltage: o2MnaV,
        faultType: o2PinFault,
        isPowerOn,
        isEcuAwake,
        ckpSignalLost,
        hasCanFault,
        hasInjectorFault,
        isInjectorFiring,
        rpm: activeRpm,
        tStartSec: 0,
        windowMs: 1000,
        sampleCount: 64,
      });
      measuredVpp = `${o2Series.vpp.toFixed(2)} V`;
      measuredFreq = `${o2Series.freqHz.toFixed(2)} Hz`;
      measuredDuty = o2Series.freqHz > 0 ? '50.0 %' : '0.0 %';
      measuredVrms = `${o2Series.vAvg.toFixed(2)} V`;
    } else if (activeSignal === 'GPT_BENCH') {
      measuredVpp = '5.00 V';
      measuredFreq = '1.00 / 2.00 kHz';
      measuredDuty = '50.0 % GPT';
      measuredVrms = '2.50 V';
    } else {
      measuredVpp = '0.00 V';
      measuredFreq = '0.0 Hz';
      measuredDuty = '100.0 %';
      measuredVrms = `${tpsMnaV.toFixed(2)} V`;
    }
  }

  const drawParamsRef = useRef({
    isPowerOn,
    isEcuAwake,
    isRunning,
    activeSignal,
    hasCanFault,
    hasInjectorFault,
    timeDiv,
    voltDiv,
    simulationSpeed,
    activeRpm,
    isInjectorFiring,
    camPhaseOffsetDeg,
    ckpSignalLost,
    isCanBusHealthy,
    canPinFault,
    injPinFault,
    o2PinFault,
    canHMnaV,
    canLMnaV,
    injMnaV,
    o2MnaV,
    tpsMnaV,
    ch1Pin,
    ch2Pin,
    ch1MnaVoltage,
    ch2MnaVoltage,
    ch1FaultType,
    ch2FaultType,
    dualWindowMs,
    isAutoScale,
    triggerLevelV,
  });

  drawParamsRef.current = {
    isPowerOn,
    isEcuAwake,
    isRunning,
    activeSignal,
    hasCanFault,
    hasInjectorFault,
    timeDiv,
    voltDiv,
    simulationSpeed,
    activeRpm,
    isInjectorFiring,
    camPhaseOffsetDeg,
    ckpSignalLost,
    isCanBusHealthy,
    canPinFault,
    injPinFault,
    o2PinFault,
    canHMnaV,
    canLMnaV,
    injMnaV,
    o2MnaV,
    tpsMnaV,
    ch1Pin,
    ch2Pin,
    ch1MnaVoltage,
    ch2MnaVoltage,
    ch1FaultType,
    ch2FaultType,
    dualWindowMs,
    isAutoScale,
    triggerLevelV,
  };

  const drawFrameRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrame = 0;
    let width = Math.max(1, Math.floor(container.clientWidth));
    let height = Math.max(1, Math.floor(container.clientHeight));
    let canHighBuf = new Float32Array(width);
    let canLowBuf = new Float32Array(width);
    const dualSampleCount = 128;
    const dualCh1Buf = new Float32Array(dualSampleCount);
    const dualCh2Buf = new Float32Array(dualSampleCount);
    let lastHudSync = performance.now();

    const syncCanvasSize = () => {
      const rect = container.getBoundingClientRect();
      const targetWidth = Math.max(1, Math.floor(rect.width));
      const targetHeight = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelW = Math.floor(targetWidth * dpr);
      const pixelH = Math.floor(targetHeight * dpr);

      width = targetWidth;
      height = targetHeight;

      if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW;
        canvas.height = pixelH;
      }
      if (canHighBuf.length < width) {
        canHighBuf = new Float32Array(width);
        canLowBuf = new Float32Array(width);
      }
    };

    const drawFrame = () => {
      const p = drawParamsRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Dark oscilloscope phosphor CRT screen background
      ctx.fillStyle = '#030807';
      ctx.fillRect(0, 0, width, height);

      // Draw Reticle Grid
      ctx.strokeStyle = '#0a231f';
      ctx.lineWidth = 1;

      const numX = 10;
      const numY = 8;
      const stepX = width / numX;
      const stepY = height / numY;

      ctx.beginPath();
      for (let x = 0; x <= width; x += stepX) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = 0; y <= height; y += stepY) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Center crosshair axis
      ctx.strokeStyle = '#143c34';
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      if (!p.isPowerOn) {
        ctx.fillStyle = '#10b98144';
        ctx.font = '12px monospace';
        ctx.fillText('[ CIRCUIT DE-ENERGIZED - ZERO SIGNAL VOLTAGE ]', width / 2 - 140, height / 2);
        ctx.restore();
        return;
      }

      if (p.isRunning) {
        simTimeRef.current = (simTimeRef.current + 0.0004 * p.timeDiv * p.simulationSpeed) % 60;
      }
      const simTime = simTimeRef.current;

      ctx.lineWidth = 2.5;

      if (p.activeSignal === 'DUAL_PIN' && p.ch1Pin && p.ch2Pin) {
        const dualStats = SignalGenerator.sampleDualPinIntoBuffers({
          ch1PinId: p.ch1Pin.id,
          ch1MnaVoltage: p.ch1MnaVoltage,
          ch1FaultType: p.ch1FaultType,
          ch2PinId: p.ch2Pin.id,
          ch2MnaVoltage: p.ch2MnaVoltage,
          ch2FaultType: p.ch2FaultType,
          isPowerOn: p.isPowerOn,
          isEcuAwake: p.isEcuAwake,
          ckpSignalLost: p.ckpSignalLost,
          hasCanFault: p.hasCanFault,
          hasInjectorFault: p.hasInjectorFault,
          isInjectorFiring: p.isInjectorFiring,
          rpm: p.activeRpm,
          tStartSec: simTime,
          windowMs: p.dualWindowMs,
          sampleCount: dualSampleCount,
          ch1Out: dualCh1Buf,
          ch2Out: dualCh2Buf,
        });

        const n = dualStats.count;
        const padTop = 34;
        const padBottom = 30;
        const usableH = Math.max(40, height - padTop - padBottom);

        if (p.isAutoScale) {
          // Shared normalized 0–100% viewport with 0%, 50%, and 100% guide lines
          ctx.save();
          ctx.strokeStyle = '#10b98133';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.font = '9px monospace';
          ctx.fillStyle = '#34d399cc';
          ctx.textAlign = 'right';
          const guidePcts = [100, 50, 0];
          const guideLabels = ['100%', '50%', '0%'];
          const guideOffsets = [10, -4, -4];
          for (let g = 0; g < 3; g++) {
            const gy = padTop + (1 - guidePcts[g] / 100) * usableH;
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(width, gy);
            ctx.stroke();
            ctx.fillText(guideLabels[g], width - 8, gy + guideOffsets[g]);
          }
          ctx.restore();

          const ch1Span = Math.max(0, dualStats.ch1Max - dualStats.ch1Min);
          const ch2Span = Math.max(0, dualStats.ch2Max - dualStats.ch2Min);
          const ch1Flat = ch1Span <= 1e-3;
          const ch2Flat = ch2Span <= 1e-3;

          ctx.lineWidth = 2.25;
          // CH1 Normalized (Safety Amber) across shared full viewport
          ctx.strokeStyle = '#f59e0b';
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 4;
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const normRatio = ch1Flat
              ? 0.5
              : Math.max(0, Math.min(1, (dualCh1Buf[i] - dualStats.ch1Min) / ch1Span));
            const x = (i / Math.max(1, n - 1)) * width;
            const y = padTop + (1 - normRatio) * usableH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();

          // CH2 Normalized (Phosphor Green) across exact same shared viewport
          ctx.strokeStyle = '#4ade80';
          ctx.shadowColor = '#4ade80';
          ctx.shadowBlur = 4;
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const normRatio = ch2Flat
              ? 0.5
              : Math.max(0, Math.min(1, (dualCh2Buf[i] - dualStats.ch2Min) / ch2Span));
            const x = (i / Math.max(1, n - 1)) * width;
            const y = padTop + (1 - normRatio) * usableH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        } else {
          const ch1BandMax = Math.max(5, dualStats.ch1Max > 15 ? 68 : Math.ceil(dualStats.ch1Max + 1));
          const ch2BandMax = Math.max(5, dualStats.ch2Max > 15 ? 68 : Math.ceil(dualStats.ch2Max + 1));
          const midY = padTop + usableH * 0.5;
          const halfBand = Math.max(18, usableH * 0.42);

          // Band separator for dual-pin CRT clarity
          ctx.strokeStyle = '#1e352a';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(0, midY);
          ctx.lineTo(width, midY);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.lineWidth = 2.25;
          // CH1 (Upper band, Safety Amber)
          ctx.strokeStyle = '#f59e0b';
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 4;
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const x = (i / Math.max(1, n - 1)) * width;
            const norm = Math.min(1.15, Math.max(-0.15, dualCh1Buf[i] / ch1BandMax));
            const y = midY - 6 - norm * halfBand * Math.min(1.3, p.voltDiv);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();

          // CH2 (Lower band, Phosphor Green)
          ctx.strokeStyle = '#4ade80';
          ctx.shadowColor = '#4ade80';
          ctx.shadowBlur = 4;
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const x = (i / Math.max(1, n - 1)) * width;
            const norm = Math.min(1.15, Math.max(-0.15, dualCh2Buf[i] / ch2BandMax));
            const y = height - padBottom - norm * halfBand * Math.min(1.3, p.voltDiv);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      } else if (p.activeSignal === 'CAN_BUS') {
        const dt = 0.000008 / p.timeDiv;
        const halfH = height / 2;
        const scale = 38 * p.voltDiv;
        const canHardFault =
          !p.isCanBusHealthy ||
          p.canPinFault === 'SHORT_TO_GND' ||
          p.canPinFault === 'SHORT_TO_VBAT' ||
          p.canPinFault === 'OPEN_CIRCUIT';
        const mnaOffsetH = p.canHMnaV - 2.5;
        const mnaOffsetL = p.canLMnaV - 2.5;

        for (let x = 0; x < width; x++) {
          if (canHardFault) {
            canHighBuf[x] = halfH - (p.canHMnaV - 2.5) * scale - 20;
            canLowBuf[x] = halfH - (p.canLMnaV - 2.5) * scale + 20;
          } else {
            const sig = SignalGenerator.getCanBusSignals(simTime + x * dt, false);
            const vH = Math.max(0, sig.canHigh + mnaOffsetH);
            const vL = Math.max(0, sig.canLow + mnaOffsetL);
            canHighBuf[x] = halfH - (vH - 2.5) * scale - 20;
            canLowBuf[x] = halfH - (vL - 2.5) * scale + 20;
          }
        }

        // CH1 CAN_H Safety Amber
        ctx.strokeStyle = '#f59e0b';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        for (let x = 0; x < width; x++) {
          if (x === 0) ctx.moveTo(x, canHighBuf[x]);
          else ctx.lineTo(x, canHighBuf[x]);
        }
        ctx.stroke();

        // CH2 CAN_L Phosphor Green
        ctx.strokeStyle = '#4ade80';
        ctx.shadowColor = '#4ade80';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        for (let x = 0; x < width; x++) {
          if (x === 0) ctx.moveTo(x, canLowBuf[x]);
          else ctx.lineTo(x, canLowBuf[x]);
        }
        ctx.stroke();
      } else if (p.activeSignal === 'INJECTOR_PWM') {
        const injHardFault =
          !p.isEcuAwake ||
          p.ckpSignalLost ||
          p.hasInjectorFault ||
          p.injPinFault === 'SHORT_TO_GND' ||
          p.injPinFault === 'SHORT_TO_VBAT' ||
          p.injPinFault === 'OPEN_CIRCUIT';
        ctx.strokeStyle = injHardFault ? '#f43f5e' : '#4ade80';
        ctx.shadowColor = injHardFault ? '#f43f5e' : '#4ade80';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        for (let x = 0; x < width; x++) {
          const tPoint = simTime + (x * 0.00015 / p.timeDiv);
          const v =
            p.isInjectorFiring && !injHardFault
              ? SignalGenerator.getInjectorWaveform(tPoint, false, p.injMnaV, p.activeRpm)
              : p.injMnaV;
          const y = height - 30 - v * 2.6 * p.voltDiv;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (p.activeSignal === 'CRANK_CKP') {
        // CH1: Crankshaft 60-2 VR signal (upper band, Phosphor Green)
        ctx.strokeStyle = p.ckpSignalLost ? '#f43f5e' : '#4ade80';
        ctx.shadowColor = p.ckpSignalLost ? '#f43f5e' : '#4ade80';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        const ckpCenterY = height * 0.38;
        for (let x = 0; x < width; x++) {
          const tPoint = simTime + (x * 0.00008 / p.timeDiv);
          const v = SignalGenerator.getCrankshaftVrSignal(tPoint, p.activeRpm, p.ckpSignalLost);
          const y = ckpCenterY - v * 8 * p.voltDiv;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // CH2: Camshaft Hall 5V sync pulse (lower band, Safety Amber) with phase offset
        ctx.strokeStyle = '#f59e0b';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        const cmpBaseY = height * 0.80;
        for (let x = 0; x < width; x++) {
          const tPoint = simTime + (x * 0.00008 / p.timeDiv);
          const vCmp = SignalGenerator.getCamshaftHallSignal(tPoint, p.activeRpm, p.camPhaseOffsetDeg);
          const y = cmpBaseY - vCmp * 6 * p.voltDiv;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (p.activeSignal === 'O2_LAMBDA') {
        const o2HardFault =
          p.o2PinFault === 'SHORT_TO_GND' ||
          p.o2PinFault === 'SHORT_TO_VBAT' ||
          p.o2PinFault === 'OPEN_CIRCUIT';
        ctx.strokeStyle = '#f59e0b';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        for (let x = 0; x < width; x++) {
          const tPoint = simTime + (x * 0.002 / p.timeDiv);
          const v = o2HardFault
            ? p.o2MnaV
            : Math.min(1.1, Math.max(0.05, p.o2MnaV + 0.35 * Math.sin(tPoint * 2 * Math.PI * 1.25)));
          const y = height / 2 - (v - 0.5) * 100 * p.voltDiv;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (p.activeSignal === 'GPT_BENCH') {
        // CH1: GPT1 1.0 kHz 5V Bench Wake-Up Square Wave (Upper band, Safety Amber)
        const gpt1BaseY = height * 0.40;
        const gpt2BaseY = height * 0.80;
        const ampPx = 28 * Math.min(1.5, p.voltDiv);
        const gptDt = 0.000004 / p.timeDiv;

        ctx.strokeStyle = '#f59e0b';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        for (let x = 0; x < width; x++) {
          const sig = SignalGenerator.getGptBenchSignals(simTime + x * gptDt);
          const y = gpt1BaseY - (sig.gpt1V / 5.0) * ampPx;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // CH2: GPT2 2.0 kHz 5V Complementary Square Wave (Lower band, Phosphor Green)
        ctx.strokeStyle = '#4ade80';
        ctx.shadowColor = '#4ade80';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        for (let x = 0; x < width; x++) {
          const sig = SignalGenerator.getGptBenchSignals(simTime + x * gptDt);
          const y = gpt2BaseY - (sig.gpt2V / 5.0) * ampPx;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        // TPS_DC analog level anchored strictly to live MNA node voltage on Pin 7
        ctx.strokeStyle = '#4ade80';
        ctx.shadowColor = '#4ade80';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        const y = height - 35 - p.tpsMnaV * 28 * p.voltDiv;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw Trigger Level dashed marker
      ctx.save();
      ctx.shadowBlur = 0;
      const trigRatio = Math.min(0.88, Math.max(0.12, 1 - p.triggerLevelV / 15));
      const trigY = trigRatio * height;
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.32)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(0, trigY);
      ctx.lineTo(width, trigY);
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    };

    drawFrameRef.current = drawFrame;

    const tick = (now: number) => {
      const p = drawParamsRef.current;
      drawFrame();
      if (
        p.activeSignal === 'DUAL_PIN' &&
        p.isPowerOn &&
        p.isRunning &&
        !document.hidden &&
        now - lastHudSync >= 140
      ) {
        lastHudSync = now;
        setHudSimTimeSec(simTimeRef.current);
      }
      if (p.isPowerOn && p.isRunning && !document.hidden) {
        animFrame = requestAnimationFrame(tick);
      } else {
        animFrame = 0;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (animFrame) {
          cancelAnimationFrame(animFrame);
          animFrame = 0;
        }
      } else if (isPowerOn && isRunning && !animFrame) {
        animFrame = requestAnimationFrame(tick);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      syncCanvasSize();
      drawFrame();
    });
    resizeObserver.observe(container);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    syncCanvasSize();
    drawFrame();
    if (isPowerOn && isRunning && !document.hidden) {
      animFrame = requestAnimationFrame(tick);
    }

    return () => {
      drawFrameRef.current = null;
      if (animFrame) cancelAnimationFrame(animFrame);
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Release GPU backing texture on unmount
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [isPowerOn, isRunning, activeSignal]);

  // Redraw frozen oscilloscope CRT immediately when knobs/telemetry change while paused
  useEffect(() => {
    if (!isRunning || !isPowerOn) {
      drawFrameRef.current?.();
    }
  }, [
    isRunning,
    isPowerOn,
    activeSignal,
    hasCanFault,
    hasInjectorFault,
    timeDiv,
    voltDiv,
    simulationSpeed,
    activeRpm,
    isInjectorFiring,
    camPhaseOffsetDeg,
    ckpSignalLost,
    isCanBusHealthy,
    canPinFault,
    injPinFault,
    o2PinFault,
    canHMnaV,
    canLMnaV,
    injMnaV,
    o2MnaV,
    tpsMnaV,
    ch1Pin,
    ch2Pin,
    ch1MnaVoltage,
    ch2MnaVoltage,
    ch1FaultType,
    ch2FaultType,
    dualWindowMs,
    isAutoScale,
    triggerLevelV,
  ]);

  const handleSelectCh1Pin = (pinId: string) => {
    setLocalCh1PinId(pinId);
    onSelectPin?.(pinId);
  };

  const handleSwapDualPins = () => {
    if (!ch1Pin || !ch2Pin) return;
    const prev1 = ch1Pin.id;
    handleSelectCh1Pin(ch2Pin.id);
    setCh2PinId(prev1);
  };

  return (
    <div className="relative hud-panel px-3.5 py-3 text-[#EAF3FF] flex flex-col gap-3 shrink-0">
      <RackCornerScrews />

      {/* Scope Module Header */}
      <div className="hud-panel-header flex flex-wrap items-center justify-between pb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-4 h-4 text-[#19C8F5] shrink-0" aria-hidden="true" />
          <span className="text-xs sm:text-sm font-mono font-bold tracking-[0.08em] text-[#EAF3FF] uppercase truncate">
            OSCILLOSCOPE DIAGNOSTIC MODULE
          </span>
          <span className="hidden sm:inline text-[10px] font-mono text-[#91A4BD] font-semibold shrink-0">
            2-CH 50MS/s
          </span>
          <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-[#FFB020]/10 border border-[#FFB020]/45 text-[#FFB020] uppercase shrink-0">
            SIMULATED
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsRunning(!isRunning)}
            className={`px-2.5 py-1 text-[10px] font-mono rounded-lg border flex items-center gap-1.5 font-bold uppercase transition cursor-pointer whitespace-nowrap ${
              isRunning
                ? 'hw-btn-green text-[#93F7C8]'
                : 'hw-btn-amber text-[#FFE29E]'
            }`}
          >
            {isRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>{isRunning ? 'RUNNING' : 'HOLD'}</span>
          </button>
        </div>
      </div>

      {/* Recessed Phosphor CRT Screen Container */}
      <div
        ref={containerRef}
        className="relative hw-lcd-well border border-[#203653] rounded-xl overflow-hidden bg-[#050A12] h-[200px] sm:h-[230px] w-full"
      >
        <canvas ref={canvasRef} data-scope-canvas="true" className="w-full h-full block" />

        {/* Channel Readout Chips */}
        <div className="absolute top-2 left-2 right-2 flex flex-wrap gap-1.5 text-[9.5px] sm:text-[10px] font-mono pointer-events-none">
          {activeSignal === 'DUAL_PIN' && ch1Pin && ch2Pin ? (
            <>
              <span className="text-[#FFB020] font-bold bg-[#050A12]/90 px-1.5 py-0.5 rounded-md border border-[#FFB020]/45 truncate">
                CH1: #{ch1Pin.pinNumber} {ch1Pin.label} ({ch1MnaVoltage.toFixed(2)}V)
              </span>
              <span className="text-[#20D889] font-bold bg-[#050A12]/90 px-1.5 py-0.5 rounded-md border border-[#20D889]/45 truncate">
                CH2: #{ch2Pin.pinNumber} {ch2Pin.label} ({ch2MnaVoltage.toFixed(2)}V)
              </span>
              {dualTelemetry && (
                <span className="text-[#EAF3FF] font-bold bg-[#050A12]/90 px-1.5 py-0.5 rounded-md border border-[#203653] truncate">
                  {dualTelemetry.correlationMode.replace('_', ' ')}
                  {dualTelemetry.timeLagMs !== null
                    ? ` · Δt ${dualTelemetry.timeLagMs >= 0 ? '+' : ''}${dualTelemetry.timeLagMs.toFixed(2)}ms`
                    : ''}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="text-[#FFB020] font-bold bg-[#050A12]/90 px-1.5 py-0.5 rounded-md border border-[#FFB020]/45 truncate">
                {activeSignal === 'CAN_BUS'
                  ? `CH1: CAN_H (${canHMnaV.toFixed(2)}V)`
                  : activeSignal === 'INJECTOR_PWM'
                  ? `CH1: INJ_1 (${injMnaV.toFixed(2)}V)`
                  : activeSignal === 'CRANK_CKP'
                  ? `CH1: CKP 60-2 VR ${ckpSignalLost ? '(LOST · P0335)' : `(${activeRpm} RPM)`}`
                  : activeSignal === 'O2_LAMBDA'
                  ? `CH1: O2_SIG (${o2MnaV.toFixed(2)}V)`
                  : activeSignal === 'GPT_BENCH'
                  ? 'CH1: GPT1 Bench Clock (1.0 kHz · 5.0V)'
                  : `CH1: TPS_SIG (${tpsMnaV.toFixed(2)}V)`}
              </span>
              {activeSignal === 'GPT_BENCH' && (
                <span className="text-[#20D889] font-bold bg-[#050A12]/90 px-1.5 py-0.5 rounded-md border border-[#20D889]/45 truncate">
                  CH2: GPT2 Bench Clock (2.0 kHz · 5.0V)
                </span>
              )}
              {activeSignal === 'CAN_BUS' && (
                <span className="text-[#20D889] font-bold bg-[#050A12]/90 px-1.5 py-0.5 rounded-md border border-[#20D889]/45 truncate">
                  CH2: CAN_L ({canLMnaV.toFixed(2)}V · {isCanBusHealthy ? '2.0V Diff' : 'FAULT'})
                </span>
              )}
              {activeSignal === 'CRANK_CKP' && (
                <span
                  className={`font-bold bg-[#050A12]/90 px-1.5 py-0.5 rounded-md border truncate ${
                    Math.abs(camPhaseOffsetDeg) > 15
                      ? 'text-[#FF4D62] border-[#FF4D62]/50'
                      : 'text-[#20D889] border-[#20D889]/45'
                  }`}
                >
                  CH2: CMP Hall ({camPhaseOffsetDeg > 0 ? '+' : ''}{camPhaseOffsetDeg}°{Math.abs(camPhaseOffsetDeg) > 15 ? ' · P0016' : ''})
                </span>
              )}
            </>
          )}
        </div>

        {/* Trigger Status Overlay Strip */}
        <div className="absolute bottom-1.5 right-2 text-[9px] font-mono text-[#91A4BD] bg-[#050A12]/90 border border-[#203653] px-2 py-0.5 rounded-md pointer-events-none tabular-nums">
          TRIG: {triggerSource} · {triggerMode.toUpperCase()} @ {triggerLevelV.toFixed(1)}V
        </div>
      </div>

      {/* Signal Source Tactile Selector Bar */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
        <span className="text-[10px] text-[#91A4BD] uppercase font-bold tracking-wider mr-0.5 shrink-0">
          INPUT:
        </span>
        {pins.length >= 2 && (
          <button
            type="button"
            onClick={() => setActiveSignal('DUAL_PIN')}
            className={`px-2.5 py-1 text-[10px] rounded-lg transition whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
              activeSignal === 'DUAL_PIN'
                ? 'diag-tab-active font-bold border'
                : 'hw-btn text-[#EAF3FF]'
            }`}
          >
            <GitCompare className="w-3 h-3" />
            Dual Pin A/B
          </button>
        )}
        {(
          [
            { id: 'CAN_BUS', label: 'CAN High/Low' },
            { id: 'INJECTOR_PWM', label: 'Injector 1 PWM' },
            { id: 'CRANK_CKP', label: 'Crank 60-2' },
            { id: 'O2_LAMBDA', label: 'O2 Lambda' },
            { id: 'TPS_DC', label: 'TPS DC' },
            { id: 'GPT_BENCH', label: 'GPT1 / GPT2 Bench' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveSignal(item.id)}
            className={`px-2.5 py-1 text-[10px] rounded-lg transition whitespace-nowrap shrink-0 cursor-pointer ${
              activeSignal === item.id
                ? 'diag-tab-active font-bold border'
                : 'hw-btn text-[#EAF3FF]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Dual-Pin Selector Strip (when Dual Pin A/B mode is active) */}
      {activeSignal === 'DUAL_PIN' && pins.length > 0 && (
        <div className="hud-subwell flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono px-2.5 py-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-[#FFB020] font-semibold">
              <span>CH1 Pin:</span>
              <select
                aria-label="CRT Scope CH1 Pin"
                value={ch1Pin?.id || ''}
                onChange={(e) => handleSelectCh1Pin(e.target.value)}
                className="bg-[#050A12] border border-[#203653] rounded-md px-1.5 py-0.5 text-[#FFE29E] focus:outline-none cursor-pointer"
              >
                {pins.map((pin) => (
                  <option key={pin.id} value={pin.id}>
                    #{pin.pinNumber} {pin.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={handleSwapDualPins}
              aria-label="Swap CRT CH1 and CH2 pins"
              title="Swap CH1 and CH2 pins"
              className="hw-btn p-1 rounded-md text-[#91A4BD] hover:text-[#19C8F5] cursor-pointer"
            >
              <ArrowLeftRight className="w-3 h-3" />
            </button>

            <label className="flex items-center gap-1 text-[#20D889] font-semibold">
              <span>CH2 Pin:</span>
              <select
                aria-label="CRT Scope CH2 Pin"
                value={ch2Pin?.id || ''}
                onChange={(e) => setCh2PinId(e.target.value)}
                className="bg-[#050A12] border border-[#203653] rounded-md px-1.5 py-0.5 text-[#93F7C8] focus:outline-none cursor-pointer"
              >
                {pins.map((pin) => (
                  <option key={pin.id} value={pin.id}>
                    #{pin.pinNumber} {pin.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => setIsAutoScale((prev) => !prev)}
              aria-pressed={isAutoScale}
              aria-label="Toggle CRT Auto-Scale normalized overlay"
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 transition cursor-pointer ${
                isAutoScale ? 'hw-btn-green text-[#93F7C8]' : 'hw-btn text-[#EAF3FF]'
              }`}
            >
              <ArrowUpDown className="w-3 h-3" />
              <span>Auto-Scale</span>
            </button>
          </div>
          {dualTelemetry && (
            <div className="flex flex-wrap items-center gap-2 text-[#EAF3FF] tabular-nums">
              {isAutoScale && (
                <span className="px-1.5 py-0.5 rounded-md border bg-[#20D889]/15 border-[#20D889]/45 text-[#20D889] text-[9px] font-bold">
                  AUTO-SCALE 0–100%
                  {dualTelemetry.autoScale.amplitudeRatio !== null
                    ? ` · ${dualTelemetry.autoScale.amplitudeRatio.toFixed(2)}×`
                    : ''}
                </span>
              )}
              <span>
                Avg ΔV:{' '}
                <strong className="text-[#FFB020]">
                  {dualTelemetry.avgDiffV >= 0 ? '+' : ''}
                  {dualTelemetry.avgDiffV.toFixed(2)}V
                </strong>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Rotary Encoders (Timebase & Voltage Scaling) + Hardware Trigger Module */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
        <div className="md:col-span-6 hud-subwell p-2.5 grid grid-cols-2 gap-3">
          <RotaryEncoderDial
            label="TIMEBASE"
            value={timeDiv}
            min={0.5}
            max={2.0}
            step={0.25}
            accent="green"
            size="sm"
            formatValue={(v) => `${Math.round(50 / v)}ms/div`}
            onChange={setTimeDiv}
            inlineFlankButtons={{
              dec: { label: '-', delta: -0.25 },
              inc: { label: '+', delta: 0.25 },
            }}
          />

          <RotaryEncoderDial
            label="VOLTS / DIV"
            value={voltDiv}
            min={0.5}
            max={2.5}
            step={0.25}
            accent="amber"
            size="sm"
            formatValue={(v) => `${(2 / v).toFixed(1)}V/div`}
            onChange={setVoltDiv}
            inlineFlankButtons={{
              dec: { label: '-', delta: -0.25 },
              inc: { label: '+', delta: 0.25 },
            }}
          />
        </div>

        {/* Trigger Controls Box */}
        <div className="md:col-span-6 hud-subwell p-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[#EAF3FF]">
              <Zap className="w-3.5 h-3.5 text-[#19C8F5] shrink-0" aria-hidden="true" />
              <span>TRIGGER</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="text-[9px] font-mono uppercase text-[#91A4BD] mb-1">SOURCE</div>
                <div className="inline-flex rounded-lg border border-[#203653] overflow-hidden">
                  {(['CH1', 'CH2'] as const).map((src) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setTriggerSource(src)}
                      className={`px-2.5 py-1 text-[10px] font-mono font-semibold cursor-pointer ${
                        triggerSource === src
                          ? 'bg-[#1677FF]/25 text-[#19C8F5] border-r border-[#19C8F5]/40'
                          : 'bg-[#050A12] text-[#91A4BD] hover:text-[#EAF3FF] border-r border-[#203653] last:border-r-0'
                      }`}
                    >
                      {src}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[9px] font-mono uppercase text-[#91A4BD] mb-1">MODE</div>
                <div className="inline-flex rounded-lg border border-[#203653] overflow-hidden">
                  {(['Auto', 'Normal', 'Single'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTriggerMode(m)}
                      className={`px-2 py-1 text-[10px] font-mono font-semibold cursor-pointer border-r border-[#203653] last:border-r-0 ${
                        triggerMode === m
                          ? 'bg-[#1677FF]/25 text-[#19C8F5]'
                          : 'bg-[#050A12] text-[#91A4BD] hover:text-[#EAF3FF]'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0">
            <RotaryEncoderDial
              label="LEVEL"
              value={triggerLevelV}
              min={0}
              max={15}
              step={0.5}
              unit="V"
              accent="green"
              size="sm"
              formatValue={(v) => `${v.toFixed(1)}V`}
              onChange={setTriggerLevelV}
            />
          </div>
        </div>
      </div>

      {/* Bottom 3-Column Recessed Hardware LCD Readout Cards */}
      <div className="grid grid-cols-3 gap-2 font-mono">
        <div className="hw-lcd-well rounded-xl px-2.5 py-2 flex flex-col">
          <span className="text-[10px] text-[#91A4BD] uppercase tracking-wider">Vpk-pk</span>
          <strong className="text-base sm:text-lg font-bold text-[#19C8F5] tabular-nums mt-0.5 truncate">
            {measuredVpp}
          </strong>
        </div>
        <div className="hw-lcd-well rounded-xl px-2.5 py-2 flex flex-col">
          <span className="text-[10px] text-[#91A4BD] uppercase tracking-wider">Freq</span>
          <strong className="text-base sm:text-lg font-bold text-[#20D889] tabular-nums mt-0.5 truncate">
            {measuredFreq}
          </strong>
        </div>
        <div className="hw-lcd-well rounded-xl px-2.5 py-2 flex flex-col">
          <span className="text-[10px] text-[#91A4BD] uppercase tracking-wider">
            {activeSignal === 'DUAL_PIN' ? 'Phase / Corr' : 'RMS / Duty'}
          </span>
          <strong className="text-base sm:text-lg font-bold text-[#EAF3FF] tabular-nums mt-0.5 truncate">
            {measuredVrms} <span className="text-[11px] text-[#FFB020]">· {measuredDuty}</span>
          </strong>
        </div>
      </div>
    </div>
  );
};

