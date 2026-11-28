/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowLeftRight, ArrowUpDown, GitCompare, Layers, Pause, Play, Zap } from 'lucide-react';
import { EcuPin, InjectedFault } from '../types/ecu';
import { SignalGenerator } from '../simulation/signals/SignalGenerator';
import { RackCornerScrews, RotaryEncoderDial } from './HardwareControls';
import { OscilloscopeZoomControls } from './OscilloscopeZoomControls';
import { OemOscilloscopeReferenceDrawer } from './OemOscilloscopeReferenceDrawer';
import {
  DEFAULT_SCOPE_ZOOM,
  ScopeDragInteractionMode,
  ScopeZoomViewport,
  formatScopeTimeAxisTick,
  formatScopeTimeUnit,
  formatZoomFactor,
  getVisibleTimeWindowMs,
  isScopeZoomed,
  panScopeViewport,
  stepScopeZoomX,
  stepScopeZoomY,
  zoomToSelectionRange,
} from '../utils/oscilloscopeZoomUtils';

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
  const [phosphorEnabled, setPhosphorEnabled] = useState(true);
  const [isOemDrawerOpen, setIsOemDrawerOpen] = useState(false);
  const [voltDiv, setVoltDiv] = useState(1.0);
  const [timeDiv, setTimeDiv] = useState(1.0);
  const [activeSignal, setActiveSignal] = useState<ScopeSignalMode>(selectedSignal);
  const [localCh1PinId, setLocalCh1PinId] = useState<string>('ecu-pin-10');
  const [ch2PinId, setCh2PinId] = useState<string>('ecu-pin-11');
  const [isAutoScale, setIsAutoScale] = useState(false);
  const [triggerSource, setTriggerSource] = useState<'CH1' | 'CH2'>('CH1');
  const [triggerMode, setTriggerMode] = useState<'Auto' | 'Normal' | 'Single'>('Auto');
  const [triggerLevelV, setTriggerLevelV] = useState<number>(2.5);
  const [zoomViewport, setZoomViewport] = useState<ScopeZoomViewport>(DEFAULT_SCOPE_ZOOM);
  const [interactionMode, setInteractionMode] = useState<ScopeDragInteractionMode>('ZOOM_BOX');
  const [dragSelection, setDragSelection] = useState<{ startRatio: number; currentRatio: number } | null>(null);
  const [hoverTimeRatio, setHoverTimeRatio] = useState<number | null>(null);
  const crtPointerRef = useRef<{
    active: boolean;
    pointerId: number;
    mode: ScopeDragInteractionMode;
    startClientX: number;
    startClientY: number;
    startRatioX: number;
    startViewport: ScopeZoomViewport;
  } | null>(null);

  useEffect(() => {
    setActiveSignal((prev) =>
      prev === 'DUAL_PIN' || prev === 'GPT_BENCH' ? prev : selectedSignal
    );
  }, [selectedSignal]);

  // Reset zoom window cleanly when switching signal mode
  useEffect(() => {
    setZoomViewport(DEFAULT_SCOPE_ZOOM);
  }, [activeSignal]);

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
  const baseWindowMs = useMemo(() => {
    switch (activeSignal) {
      case 'DUAL_PIN':
        return dualWindowMs;
      case 'CAN_BUS':
        return 5 / timeDiv;
      case 'INJECTOR_PWM':
        return 90 / timeDiv;
      case 'CRANK_CKP':
        return 48 / timeDiv;
      case 'O2_LAMBDA':
        return 1200 / timeDiv;
      case 'GPT_BENCH':
        return 2.4 / timeDiv;
      default:
        return 50 / timeDiv;
    }
  }, [activeSignal, dualWindowMs, timeDiv]);

  const visibleTimeWindow = useMemo(
    () => getVisibleTimeWindowMs(baseWindowMs, zoomViewport, 10),
    [baseWindowMs, zoomViewport]
  );

  const simTimeRef = useRef<number>(0);
  const [hudSimTimeSec, setHudSimTimeSec] = useState<number>(0);

  // Miniature overview trace for the capture minimap scrubber when zoomed horizontally
  const overviewTrace = useMemo(() => {
    if (!isPowerOn || zoomViewport.zoomX <= 1.001) return undefined;
    const count = 64;
    const raw: number[] = [];
    const baseSec = baseWindowMs / 1000;
    const t0 = hudSimTimeSec;
    for (let i = 0; i < count; i++) {
      const t = t0 + (i / (count - 1)) * baseSec;
      let v = 0;
      if (activeSignal === 'CAN_BUS') {
        v = isCanBusHealthy ? SignalGenerator.getCanBusSignals(t, false).canHigh : canHMnaV;
      } else if (activeSignal === 'INJECTOR_PWM') {
        const injHardFault =
          !isEcuAwake ||
          ckpSignalLost ||
          hasInjectorFault ||
          injPinFault === 'SHORT_TO_GND' ||
          injPinFault === 'SHORT_TO_VBAT' ||
          injPinFault === 'OPEN_CIRCUIT';
        v =
          isInjectorFiring && !injHardFault
            ? SignalGenerator.getInjectorWaveform(t, false, injMnaV, activeRpm)
            : injMnaV;
      } else if (activeSignal === 'CRANK_CKP') {
        v = SignalGenerator.getCrankshaftVrSignal(t, activeRpm, ckpSignalLost);
      } else if (activeSignal === 'O2_LAMBDA') {
        v = Math.min(1.1, Math.max(0.05, o2MnaV + 0.35 * Math.sin(t * 2 * Math.PI * 1.25)));
      } else if (activeSignal === 'GPT_BENCH') {
        v = SignalGenerator.getGptBenchSignals(t).gpt1V;
      } else {
        v = tpsMnaV;
      }
      raw.push(v);
    }
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const v of raw) {
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
    const span = vMax - vMin;
    if (span < 1e-3) return raw.map(() => 0.5);
    return raw.map((v) => (v - vMin) / span);
  }, [
    isPowerOn,
    zoomViewport.zoomX,
    baseWindowMs,
    hudSimTimeSec,
    activeSignal,
    isCanBusHealthy,
    canHMnaV,
    isEcuAwake,
    ckpSignalLost,
    hasInjectorFault,
    injPinFault,
    isInjectorFiring,
    injMnaV,
    activeRpm,
    o2MnaV,
    tpsMnaV,
  ]);

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
      tStartSec: hudSimTimeSec + visibleTimeWindow.startMs / 1000,
      windowMs: visibleTimeWindow.spanMs,
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
    visibleTimeWindow.startMs,
    visibleTimeWindow.spanMs,
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
    baseWindowMs,
    zoomViewport,
    isAutoScale,
    triggerLevelV,
    phosphorEnabled,
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
    baseWindowMs,
    zoomViewport,
    isAutoScale,
    triggerLevelV,
    phosphorEnabled,
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

      // Deep calibrated bench DSO CRT background
      ctx.fillStyle = '#03060a';
      ctx.fillRect(0, 0, width, height);

      // Draw Precision 10×8 Reticle Grid
      ctx.strokeStyle = '#0d1a22';
      ctx.lineWidth = 1;

      const numX = 10;
      const numY = 8;
      const stepX = width / numX;
      const stepY = height / numY;

      ctx.beginPath();
      for (let i = 1; i < numX; i++) {
        const x = Math.round(i * stepX) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let j = 1; j < numY; j++) {
        const y = Math.round(j * stepY) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Center crosshair axis + 50×40 vernier sub-ticks
      const cx = Math.round(width / 2) + 0.5;
      const cy = Math.round(height / 2) + 0.5;
      ctx.strokeStyle = '#18303d';
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, height);
      ctx.moveTo(0, cy);
      ctx.lineTo(width, cy);
      for (let i = 1; i < 50; i++) {
        const tx = (i / 50) * width;
        ctx.moveTo(tx, cy - 2.5);
        ctx.lineTo(tx, cy + 2.5);
      }
      for (let j = 1; j < 40; j++) {
        const ty = (j / 40) * height;
        ctx.moveTo(cx - 2.5, ty);
        ctx.lineTo(cx + 2.5, ty);
      }
      ctx.stroke();

      if (!p.isPowerOn) {
        ctx.fillStyle = 'rgba(240, 82, 82, 0.72)';
        ctx.font = '11px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('[ CIRCUIT DE-ENERGIZED — ZERO SIGNAL VOLTAGE ]', width / 2, height / 2 - 6);
        ctx.textAlign = 'left';
        ctx.restore();
        return;
      }

      if (p.isRunning) {
        simTimeRef.current = (simTimeRef.current + 0.0004 * p.timeDiv * p.simulationSpeed) % 60;
      }
      const simTime = simTimeRef.current;
      const zWindow = getVisibleTimeWindowMs(p.baseWindowMs, p.zoomViewport, 10);
      const tVisibleStartSec = simTime + zWindow.startMs / 1000;
      const tVisibleSpanSec = zWindow.spanMs / 1000;
      const zoomY = p.zoomViewport.zoomY;
      const panYPx = p.zoomViewport.panY * height * zoomY;
      const projectY = (rawY: number) =>
        height / 2 + (rawY - height / 2) * zoomY + panYPx;
      const pxDenom = Math.max(1, width - 1);

      // Hardware-authentic 1.15px fine-beam stroke with optional 2.3px @ 20% tight phosphor halo
      const strokeFineBeam = (color: string, buildPath: () => void) => {
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowBlur = 0;
        if (p.phosphorEnabled) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.3;
          ctx.globalAlpha = 0.2;
          ctx.beginPath();
          buildPath();
          ctx.stroke();
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.15;
        ctx.globalAlpha = 0.96;
        ctx.beginPath();
        buildPath();
        ctx.stroke();
        ctx.restore();
      };

      const drawEdgeMarker = (label: string, yPos: number, color: string, side: 'left' | 'right' = 'left') => {
        const clampedY = Math.max(14, Math.min(height - 14, yPos));
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = 'bold 9px "IBM Plex Mono", monospace';
        ctx.textBaseline = 'middle';
        if (side === 'left') {
          ctx.textAlign = 'left';
          ctx.fillText(`${label}►`, 3, clampedY);
        } else {
          ctx.textAlign = 'right';
          ctx.fillText(`◄${label}`, width - 3, clampedY);
        }
        ctx.restore();
      };

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
          tStartSec: tVisibleStartSec,
          windowMs: zWindow.spanMs,
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
          ctx.strokeStyle = 'rgba(74, 222, 128, 0.16)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.font = '9px "IBM Plex Mono", monospace';
          ctx.fillStyle = 'rgba(74, 222, 128, 0.72)';
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

          // CH1 Normalized (Instrument Amber) across shared full viewport
          strokeFineBeam('#e5a93c', () => {
            for (let i = 0; i < n; i++) {
              const normRatio = ch1Flat
                ? 0.5
                : Math.max(0, Math.min(1, (dualCh1Buf[i] - dualStats.ch1Min) / ch1Span));
              const x = (i / Math.max(1, n - 1)) * width;
              const y = projectY(padTop + (1 - normRatio) * usableH);
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
          });

          // CH2 Normalized (Instrument LED Green) across exact same shared viewport
          strokeFineBeam('#4ade80', () => {
            for (let i = 0; i < n; i++) {
              const normRatio = ch2Flat
                ? 0.5
                : Math.max(0, Math.min(1, (dualCh2Buf[i] - dualStats.ch2Min) / ch2Span));
              const x = (i / Math.max(1, n - 1)) * width;
              const y = projectY(padTop + (1 - normRatio) * usableH);
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
          });
          drawEdgeMarker('1', projectY(padTop + usableH * 0.4), '#e5a93c');
          drawEdgeMarker('2', projectY(padTop + usableH * 0.65), '#4ade80');
        } else {
          const ch1BandMax = Math.max(5, dualStats.ch1Max > 15 ? 68 : Math.ceil(dualStats.ch1Max + 1));
          const ch2BandMax = Math.max(5, dualStats.ch2Max > 15 ? 68 : Math.ceil(dualStats.ch2Max + 1));
          const midY = padTop + usableH * 0.5;
          const halfBand = Math.max(18, usableH * 0.42);

          // Band separator for dual-pin CRT clarity
          ctx.save();
          ctx.strokeStyle = '#1b2b36';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(0, projectY(midY));
          ctx.lineTo(width, projectY(midY));
          ctx.stroke();
          ctx.restore();

          // CH1 (Upper band, Instrument Amber)
          strokeFineBeam('#e5a93c', () => {
            for (let i = 0; i < n; i++) {
              const x = (i / Math.max(1, n - 1)) * width;
              const norm = Math.min(1.15, Math.max(-0.15, dualCh1Buf[i] / ch1BandMax));
              const y = projectY(midY - 6 - norm * halfBand * Math.min(1.3, p.voltDiv));
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
          });

          // CH2 (Lower band, Instrument LED Green)
          strokeFineBeam('#4ade80', () => {
            for (let i = 0; i < n; i++) {
              const x = (i / Math.max(1, n - 1)) * width;
              const norm = Math.min(1.15, Math.max(-0.15, dualCh2Buf[i] / ch2BandMax));
              const y = projectY(height - padBottom - norm * halfBand * Math.min(1.3, p.voltDiv));
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
          });
          drawEdgeMarker('1', projectY(midY - 6), '#e5a93c');
          drawEdgeMarker('2', projectY(height - padBottom), '#4ade80');
        }
      } else if (p.activeSignal === 'CAN_BUS') {
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
            canHighBuf[x] = projectY(halfH - (p.canHMnaV - 2.5) * scale - 20);
            canLowBuf[x] = projectY(halfH - (p.canLMnaV - 2.5) * scale + 20);
          } else {
            const tPoint = tVisibleStartSec + (x / pxDenom) * tVisibleSpanSec;
            const sig = SignalGenerator.getCanBusSignals(tPoint, false);
            const vH = Math.max(0, sig.canHigh + mnaOffsetH);
            const vL = Math.max(0, sig.canLow + mnaOffsetL);
            canHighBuf[x] = projectY(halfH - (vH - 2.5) * scale - 20);
            canLowBuf[x] = projectY(halfH - (vL - 2.5) * scale + 20);
          }
        }

        // CH1 CAN_H (Red if bus faulted, else Instrument Amber)
        strokeFineBeam(canHardFault ? '#f05252' : '#e5a93c', () => {
          for (let x = 0; x < width; x++) {
            if (x === 0) ctx.moveTo(x, canHighBuf[x]);
            else ctx.lineTo(x, canHighBuf[x]);
          }
        });

        // CH2 CAN_L (Instrument LED Green)
        strokeFineBeam(canHardFault ? '#f05252' : '#4ade80', () => {
          for (let x = 0; x < width; x++) {
            if (x === 0) ctx.moveTo(x, canLowBuf[x]);
            else ctx.lineTo(x, canLowBuf[x]);
          }
        });
        drawEdgeMarker('1', projectY(halfH - 20), canHardFault ? '#f05252' : '#e5a93c');
        drawEdgeMarker('2', projectY(halfH + 20), canHardFault ? '#f05252' : '#4ade80');
      } else if (p.activeSignal === 'INJECTOR_PWM') {
        const injHardFault =
          !p.isEcuAwake ||
          p.ckpSignalLost ||
          p.hasInjectorFault ||
          p.injPinFault === 'SHORT_TO_GND' ||
          p.injPinFault === 'SHORT_TO_VBAT' ||
          p.injPinFault === 'OPEN_CIRCUIT';
        const traceColor = injHardFault ? '#f05252' : '#4ade80';
        strokeFineBeam(traceColor, () => {
          for (let x = 0; x < width; x++) {
            const tPoint = tVisibleStartSec + (x / pxDenom) * tVisibleSpanSec;
            const v =
              p.isInjectorFiring && !injHardFault
                ? SignalGenerator.getInjectorWaveform(tPoint, false, p.injMnaV, p.activeRpm)
                : p.injMnaV;
            const y = projectY(height - 30 - v * 2.6 * p.voltDiv);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        });
        drawEdgeMarker('1', projectY(height - 30 - 12 * 2.6 * p.voltDiv), traceColor);
      } else if (p.activeSignal === 'CRANK_CKP') {
        const ckpColor = p.ckpSignalLost ? '#f05252' : '#4ade80';
        const ckpCenterY = height * 0.38;
        strokeFineBeam(ckpColor, () => {
          for (let x = 0; x < width; x++) {
            const tPoint = tVisibleStartSec + (x / pxDenom) * tVisibleSpanSec;
            const v = SignalGenerator.getCrankshaftVrSignal(tPoint, p.activeRpm, p.ckpSignalLost);
            const y = projectY(ckpCenterY - v * 8 * p.voltDiv);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        });

        const cmpColor = Math.abs(p.camPhaseOffsetDeg) > 15 ? '#f05252' : '#e5a93c';
        const cmpBaseY = height * 0.80;
        strokeFineBeam(cmpColor, () => {
          for (let x = 0; x < width; x++) {
            const tPoint = tVisibleStartSec + (x / pxDenom) * tVisibleSpanSec;
            const vCmp = SignalGenerator.getCamshaftHallSignal(tPoint, p.activeRpm, p.camPhaseOffsetDeg);
            const y = projectY(cmpBaseY - vCmp * 6 * p.voltDiv);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        });
        drawEdgeMarker('1', projectY(ckpCenterY), ckpColor);
        drawEdgeMarker('2', projectY(cmpBaseY), cmpColor);
      } else if (p.activeSignal === 'O2_LAMBDA') {
        const o2HardFault =
          p.o2PinFault === 'SHORT_TO_GND' ||
          p.o2PinFault === 'SHORT_TO_VBAT' ||
          p.o2PinFault === 'OPEN_CIRCUIT';
        const o2Color = o2HardFault ? '#f05252' : '#4ade80';
        strokeFineBeam(o2Color, () => {
          for (let x = 0; x < width; x++) {
            const tPoint = tVisibleStartSec + (x / pxDenom) * tVisibleSpanSec;
            const v = o2HardFault
              ? p.o2MnaV
              : Math.min(1.1, Math.max(0.05, p.o2MnaV + 0.35 * Math.sin(tPoint * 2 * Math.PI * 1.25)));
            const y = projectY(height / 2 - (v - 0.5) * 100 * p.voltDiv);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        });
        drawEdgeMarker('1', projectY(height / 2), o2Color);
      } else if (p.activeSignal === 'GPT_BENCH') {
        const gpt1BaseY = height * 0.40;
        const gpt2BaseY = height * 0.80;
        const ampPx = 28 * Math.min(1.5, p.voltDiv);

        strokeFineBeam('#e5a93c', () => {
          for (let x = 0; x < width; x++) {
            const tPoint = tVisibleStartSec + (x / pxDenom) * tVisibleSpanSec;
            const sig = SignalGenerator.getGptBenchSignals(tPoint);
            const y = projectY(gpt1BaseY - (sig.gpt1V / 5.0) * ampPx);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        });

        strokeFineBeam('#4ade80', () => {
          for (let x = 0; x < width; x++) {
            const tPoint = tVisibleStartSec + (x / pxDenom) * tVisibleSpanSec;
            const sig = SignalGenerator.getGptBenchSignals(tPoint);
            const y = projectY(gpt2BaseY - (sig.gpt2V / 5.0) * ampPx);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        });
        drawEdgeMarker('1', projectY(gpt1BaseY), '#e5a93c');
        drawEdgeMarker('2', projectY(gpt2BaseY), '#4ade80');
      } else {
        // TPS_DC analog level anchored strictly to live MNA node voltage on Pin 7
        const tpsY = projectY(height - 35 - p.tpsMnaV * 28 * p.voltDiv);
        strokeFineBeam('#4ade80', () => {
          ctx.moveTo(0, tpsY);
          ctx.lineTo(width, tpsY);
        });
        drawEdgeMarker('1', tpsY, '#4ade80');
      }

      // Draw Trigger Level dashed marker + right-edge T► indicator
      ctx.save();
      ctx.shadowBlur = 0;
      const trigRatio = Math.min(0.88, Math.max(0.12, 1 - p.triggerLevelV / 15));
      const trigY = projectY(trigRatio * height);
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.24)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(0, trigY);
      ctx.lineTo(width, trigY);
      ctx.stroke();
      drawEdgeMarker('T', trigY, 'rgba(226, 232, 240, 0.72)', 'right');

      // Calibrated CRT bottom timebase reticle tick labels (auto-switches ms / µs under zoom)
      ctx.setLineDash([]);
      ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.68)';
      const tickDivs = [0, 2, 4, 6, 8];
      for (let idx = 0; idx < tickDivs.length; idx++) {
        const div = tickDivs[idx];
        const frac = div / 10;
        const tx = frac * width + 4;
        const tMs = zWindow.startMs + frac * zWindow.spanMs;
        ctx.textAlign = 'left';
        ctx.fillText(formatScopeTimeAxisTick(tMs, zWindow.spanMs), tx, height - 5);
      }
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
    baseWindowMs,
    zoomViewport,
    isAutoScale,
    triggerLevelV,
    phosphorEnabled,
  ]);

  // Cursor-anchored wheel zoom on the CRT screen (non-passive so wheel does not scroll page while zooming)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const anchorX =
        rect.width > 0 ? Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) : 0.5;
      const anchorY =
        rect.height > 0
          ? Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height))
          : 0.5;
      const dir = e.deltaY < 0 ? 'in' : 'out';

      setZoomViewport((prev) => {
        if (e.shiftKey) {
          return stepScopeZoomY(prev, dir, anchorY);
        }
        return stepScopeZoomX(prev, dir, anchorX);
      });
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  const handleCrtPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) return;

    const ratioX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const effectiveMode: ScopeDragInteractionMode =
      e.shiftKey || e.button === 1 ? 'PAN' : interactionMode;

    container.setPointerCapture(e.pointerId);
    crtPointerRef.current = {
      active: true,
      pointerId: e.pointerId,
      mode: effectiveMode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRatioX: ratioX,
      startViewport: zoomViewport,
    };

    if (effectiveMode === 'ZOOM_BOX') {
      setDragSelection({ startRatio: ratioX, currentRatio: ratioX });
    }
  };

  const handleCrtPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const ratioX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHoverTimeRatio(ratioX);

    const drag = crtPointerRef.current;
    if (!drag?.active) return;

    if (drag.mode === 'ZOOM_BOX') {
      setDragSelection({ startRatio: drag.startRatioX, currentRatio: ratioX });
    } else {
      const dxRatio = (e.clientX - drag.startClientX) / rect.width;
      const dyRatio = (e.clientY - drag.startClientY) / rect.height;
      setZoomViewport(panScopeViewport(drag.startViewport, dxRatio, dyRatio));
    }
  };

  const handleCrtPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    const drag = crtPointerRef.current;
    if (drag?.active && container?.hasPointerCapture(e.pointerId)) {
      container.releasePointerCapture(e.pointerId);
    }

    if (drag?.active && drag.mode === 'ZOOM_BOX' && dragSelection) {
      const span = Math.abs(dragSelection.currentRatio - dragSelection.startRatio);
      if (span >= 0.02) {
        setZoomViewport((prev) =>
          zoomToSelectionRange(prev, dragSelection.startRatio, dragSelection.currentRatio)
        );
        // Auto-HOLD on drag-box capture so rapid transients stay frozen for inspection
        setIsRunning(false);
        setHudSimTimeSec(simTimeRef.current);
      }
    }

    crtPointerRef.current = null;
    setDragSelection(null);
  };

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

  const hasActiveScopeFault =
    !isPowerOn ||
    (activeSignal === 'CAN_BUS' && !isCanBusHealthy) ||
    (activeSignal === 'INJECTOR_PWM' && (hasInjectorFault || ckpSignalLost || !isEcuAwake)) ||
    (activeSignal === 'CRANK_CKP' && (ckpSignalLost || Math.abs(camPhaseOffsetDeg) > 15)) ||
    (activeSignal === 'O2_LAMBDA' && o2PinFault !== 'NONE');

  return (
    <div className="relative dso-alloy-chassis rounded-xl px-3.5 pt-4 pb-3 text-[#E6EDF3] flex flex-col gap-3 shrink-0 overflow-hidden">
      {/* Thin Flat Brushed-Aluminum Top Frame Rail */}
      <div className="dso-alloy-top-rail" aria-hidden="true" />
      <RackCornerScrews />

      {/* Scope Module Header */}
      <div className="hud-panel-header flex flex-wrap items-center justify-between pb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-4 h-4 text-[#b4c2d0] shrink-0" aria-hidden="true" />
          <span className="text-xs sm:text-sm font-mono font-bold tracking-[0.08em] text-[#E6EDF3] uppercase truncate">
            OSCILLOSCOPE DIAGNOSTIC MODULE
          </span>
          <span className="hidden sm:inline text-[10px] font-instrument-num text-[#8b98a8] font-semibold shrink-0">
            2-CH 50MS/s
          </span>
          <span className="text-[9.5px] font-instrument-num font-bold px-1.5 py-0.5 rounded-[4px] dso-alloy-frame text-[#c5d0dc] uppercase shrink-0">
            SIMULATED
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => setPhosphorEnabled((prev) => !prev)}
            aria-pressed={phosphorEnabled}
            title="Toggle realistic phosphor beam persistence halo"
            className="dso-alloy-frame px-2 py-1 text-[10px] font-instrument-num rounded-[5px] flex items-center gap-1.5 font-semibold uppercase transition cursor-pointer whitespace-nowrap text-[#c9d3de] hover:text-white"
          >
            <span className={`dso-micro-led ${phosphorEnabled ? 'dso-micro-led-green' : ''}`} />
            <span>PHOSPHOR {phosphorEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsOemDrawerOpen(true)}
            title="Open OEM Reference Waveforms Drawer (118 PicoAuto Guided Tests + AI Voice Control)"
            className="dso-alloy-frame px-2.5 py-1 text-[10px] font-instrument-num rounded-[5px] flex items-center gap-1.5 font-semibold uppercase transition cursor-pointer whitespace-nowrap text-[#e2e8f0] hover:border-[#9fb0c4]"
          >
            <Layers className="w-3 h-3 text-[#4ade80]" />
            <span>OEM DRAWER (118)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsRunning(!isRunning)}
            className={`dso-alloy-frame px-2.5 py-1 text-[10px] font-instrument-num rounded-[5px] flex items-center gap-1.5 font-bold uppercase transition cursor-pointer whitespace-nowrap ${
              isRunning ? 'dso-led-green' : 'dso-led-red'
            }`}
          >
            <span className={`dso-micro-led ${isRunning ? 'dso-micro-led-green' : 'dso-micro-led-red'}`} />
            {isRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>{isRunning ? 'RUNNING' : 'HOLD'}</span>
          </button>
        </div>
      </div>

      {/* Recessed Phosphor CRT Screen Container (Flat Brushed-Alloy Bezel) */}
      <div
        ref={containerRef}
        onPointerDown={handleCrtPointerDown}
        onPointerMove={handleCrtPointerMove}
        onPointerUp={handleCrtPointerUp}
        onPointerCancel={handleCrtPointerUp}
        onPointerLeave={() => {
          if (!crtPointerRef.current?.active) setHoverTimeRatio(null);
        }}
        onDoubleClick={() => setZoomViewport(DEFAULT_SCOPE_ZOOM)}
        className={`relative dso-alloy-screen-bezel rounded-lg overflow-hidden bg-[#03060a] h-[200px] sm:h-[230px] w-full select-none touch-none ${
          interactionMode === 'PAN'
            ? isScopeZoomed(zoomViewport)
              ? 'cursor-grab active:cursor-grabbing'
              : 'cursor-default'
            : 'cursor-crosshair'
        }`}
      >
        <canvas ref={canvasRef} data-scope-canvas="true" className="w-full h-full block" />

        {/* Hover Crosshair & Transient Probe Line */}
        {hoverTimeRatio !== null && !dragSelection && (
          <div
            className="pointer-events-none absolute inset-y-0 border-l border-[#94a3b8]/45"
            style={{ left: `${hoverTimeRatio * 100}%` }}
          />
        )}

        {/* Drag-to-Zoom Transient Selection Marquee */}
        {dragSelection && Math.abs(dragSelection.currentRatio - dragSelection.startRatio) >= 0.01 && (
          <div
            className="pointer-events-none absolute inset-y-0 border-x border-[#94a3b8]/70 bg-[#94a3b8]/10"
            style={{
              left: `${Math.min(dragSelection.startRatio, dragSelection.currentRatio) * 100}%`,
              width: `${Math.abs(dragSelection.currentRatio - dragSelection.startRatio) * 100}%`,
            }}
          >
            <span className="absolute top-8 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-[3px] dso-alloy-frame text-[9px] font-instrument-num font-bold dso-led-green whitespace-nowrap">
              Δt {formatScopeTimeUnit(
                Math.abs(dragSelection.currentRatio - dragSelection.startRatio) *
                  visibleTimeWindow.spanMs
              )}
            </span>
          </div>
        )}

        {/* Channel Readout Chips (Thin Flat Alloy Bezel + Instrument LED Green/Red) */}
        <div className="absolute top-2 left-2 right-2 flex flex-wrap gap-1.5 text-[9.5px] sm:text-[10px] font-instrument-num pointer-events-none">
          {activeSignal === 'DUAL_PIN' && ch1Pin && ch2Pin ? (
            <>
              <span className="dso-alloy-frame font-semibold px-1.5 py-0.5 rounded-[4px] dso-led-green truncate">
                CH1: #{ch1Pin.pinNumber} {ch1Pin.label} ({ch1MnaVoltage.toFixed(2)}V)
              </span>
              <span className="dso-alloy-frame font-semibold px-1.5 py-0.5 rounded-[4px] dso-led-green truncate">
                CH2: #{ch2Pin.pinNumber} {ch2Pin.label} ({ch2MnaVoltage.toFixed(2)}V)
              </span>
              {dualTelemetry && (
                <span className="dso-alloy-frame font-semibold px-1.5 py-0.5 rounded-[4px] text-[#cbd5e1] truncate">
                  {dualTelemetry.correlationMode.replace('_', ' ')}
                  {dualTelemetry.timeLagMs !== null
                    ? ` · Δt ${dualTelemetry.timeLagMs >= 0 ? '+' : ''}${dualTelemetry.timeLagMs.toFixed(2)}ms`
                    : ''}
                </span>
              )}
            </>
          ) : (
            <>
              <span
                className={`dso-alloy-frame font-semibold px-1.5 py-0.5 rounded-[4px] truncate ${
                  hasActiveScopeFault ? 'dso-led-red' : 'dso-led-green'
                }`}
              >
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
                <span className="dso-alloy-frame font-semibold px-1.5 py-0.5 rounded-[4px] dso-led-green truncate">
                  CH2: GPT2 Bench Clock (2.0 kHz · 5.0V)
                </span>
              )}
              {activeSignal === 'CAN_BUS' && (
                <span
                  className={`dso-alloy-frame font-semibold px-1.5 py-0.5 rounded-[4px] truncate ${
                    isCanBusHealthy ? 'dso-led-green' : 'dso-led-red'
                  }`}
                >
                  CH2: CAN_L ({canLMnaV.toFixed(2)}V · {isCanBusHealthy ? '2.0V Diff' : 'FAULT'})
                </span>
              )}
              {activeSignal === 'CRANK_CKP' && (
                <span
                  className={`dso-alloy-frame font-semibold px-1.5 py-0.5 rounded-[4px] truncate ${
                    Math.abs(camPhaseOffsetDeg) > 15 ? 'dso-led-red' : 'dso-led-green'
                  }`}
                >
                  CH2: CMP Hall ({camPhaseOffsetDeg > 0 ? '+' : ''}{camPhaseOffsetDeg}°{Math.abs(camPhaseOffsetDeg) > 15 ? ' · P0016' : ''})
                </span>
              )}
            </>
          )}
        </div>

        {/* Hover Cursor Probe Readout (Bottom-Left) */}
        {hoverTimeRatio !== null && (
          <div className="absolute bottom-5 left-2 text-[9px] font-instrument-num dso-led-green dso-alloy-frame px-1.5 py-0.5 rounded-[3px] pointer-events-none">
            t = {formatScopeTimeUnit(
              visibleTimeWindow.startMs + hoverTimeRatio * visibleTimeWindow.spanMs
            )}
            {isScopeZoomed(zoomViewport)
              ? ` · ${formatZoomFactor(zoomViewport.zoomX)} H`
              : ''}
          </div>
        )}

        {/* Trigger Status Overlay Strip */}
        <div className="absolute bottom-5 right-2 text-[9px] font-instrument-num text-[#cbd5e1] dso-alloy-frame px-2 py-0.5 rounded-[4px] pointer-events-none">
          TRIG: {triggerSource} · {triggerMode.toUpperCase()} @ {triggerLevelV.toFixed(1)}V
        </div>
      </div>

      {/* Hardware DSO Transient Zoom Bar & Overview Capture Minimap */}
      <OscilloscopeZoomControls
        viewport={zoomViewport}
        onChangeViewport={setZoomViewport}
        baseWindowMs={baseWindowMs}
        interactionMode={interactionMode}
        onChangeInteractionMode={setInteractionMode}
        overviewTrace={overviewTrace}
        theme="crt"
        divisionsX={10}
      />

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
            formatValue={() => `${formatScopeTimeUnit(visibleTimeWindow.msPerDiv)}/div`}
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
            formatValue={(v) => `${(2 / (v * zoomViewport.zoomY)).toFixed(2)}V/div`}
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

      {/* Bottom 3-Column Recessed Hardware Digital Parameter Cards (Thin Flat Alloy Frame + Green/Red Instrument LEDs) */}
      <div className="grid grid-cols-3 gap-2 font-instrument-num">
        <div className="dso-alloy-frame rounded-md px-2.5 py-2 flex flex-col">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9.5px] text-[#8b98a8] uppercase tracking-[0.08em] font-semibold">Vpk-pk</span>
            <span className={`dso-micro-led ${hasActiveScopeFault ? 'dso-micro-led-red' : 'dso-micro-led-green'}`} />
          </div>
          <strong
            className={`text-base sm:text-lg font-semibold mt-0.5 truncate ${
              hasActiveScopeFault ? 'dso-led-red' : 'dso-led-green'
            }`}
          >
            {measuredVpp}
          </strong>
        </div>
        <div className="dso-alloy-frame rounded-md px-2.5 py-2 flex flex-col">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9.5px] text-[#8b98a8] uppercase tracking-[0.08em] font-semibold">Freq</span>
            <span className={`dso-micro-led ${hasActiveScopeFault ? 'dso-micro-led-red' : 'dso-micro-led-green'}`} />
          </div>
          <strong
            className={`text-base sm:text-lg font-semibold mt-0.5 truncate ${
              hasActiveScopeFault ? 'dso-led-red' : 'dso-led-green'
            }`}
          >
            {measuredFreq}
          </strong>
        </div>
        <div className="dso-alloy-frame rounded-md px-2.5 py-2 flex flex-col">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9.5px] text-[#8b98a8] uppercase tracking-[0.08em] font-semibold truncate">
              {activeSignal === 'DUAL_PIN' ? 'Phase / Corr' : 'RMS / Duty'}
            </span>
            <span className={`dso-micro-led ${hasActiveScopeFault ? 'dso-micro-led-red' : 'dso-micro-led-green'}`} />
          </div>
          <strong
            className={`text-base sm:text-lg font-semibold mt-0.5 truncate ${
              hasActiveScopeFault ? 'dso-led-red' : 'dso-led-green'
            }`}
          >
            {measuredVrms}{' '}
            <span className="text-[11px] opacity-85">· {measuredDuty}</span>
          </strong>
        </div>
      </div>

      {/* Slide-Over OEM Reference Waveforms Drawer (118 PicoAuto Guided Tests + Integrated Sliding Hands-Free AI Voice Controller) */}
      <OemOscilloscopeReferenceDrawer
        isOpen={isOemDrawerOpen}
        onClose={() => setIsOemDrawerOpen(false)}
        scopeState={{
          voltDiv,
          timeDiv,
          rpm: activeRpm,
          isRunning,
          phosphorEnabled,
        }}
        onSetVoltDiv={setVoltDiv}
        onSetTimeDiv={setTimeDiv}
        onToggleRun={setIsRunning}
        onTogglePhosphor={setPhosphorEnabled}
      />
    </div>
  );
};

