import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  Activity,
  Pause,
  Play,
  Zap,
  GitCompare,
  ArrowLeftRight,
  Sliders,
  Download,
  Sparkles,
} from 'lucide-react';
import { EcuPin, InjectedFault } from '../types/ecu';
import { SignalGenerator } from '../simulation/signals/SignalGenerator';
import { RackCornerScrews, RotaryEncoderDial } from './HardwareControls';

interface D3OscilloscopeViewProps {
  pins: EcuPin[];
  selectedPinId: string | null;
  onSelectPin: (pinId: string) => void;
  nodeVoltages: Record<string, number>;
  faults: InjectedFault[];
  isPowerOn: boolean;
  hasCanFault: boolean;
  hasInjectorFault: boolean;
  isInjectorFiring: boolean;
  rpm: number;
  simulationSpeed: number;
  camPhaseOffsetDeg?: number;
  ckpSignalLost?: boolean;
}

export const D3OscilloscopeView: React.FC<D3OscilloscopeViewProps> = ({
  pins,
  selectedPinId,
  onSelectPin,
  nodeVoltages,
  faults,
  isPowerOn,
  hasCanFault,
  hasInjectorFault,
  isInjectorFiring,
  rpm,
  simulationSpeed,
  camPhaseOffsetDeg = 0,
  ckpSignalLost = false,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isRunning, setIsRunning] = useState(true);
  const [timebaseMs, setTimebaseMs] = useState<number>(40);
  const [voltDiv, setVoltDiv] = useState<number>(1.0);
  const [simTimeSec, setSimTimeSec] = useState<number>(0);
  const [ch2PinId, setCh2PinId] = useState<string | null>('ecu-pin-11'); // Default companion CH2 (e.g. IGN / CMP)
  const [signalMode, setSignalMode] = useState<'SINGLE' | 'DUAL' | 'CKP_CMP' | 'INJ_PWM' | 'CAN_BUS'>('DUAL');

  const ch1Pin = useMemo(() => {
    return (
      pins.find((p) => p.id === selectedPinId) ||
      pins.find((p) => p.id === 'ecu-pin-10') ||
      pins[0]
    );
  }, [pins, selectedPinId]);

  const ch2Pin = useMemo(() => {
    if (!ch2PinId) return null;
    return pins.find((p) => p.id === ch2PinId) || null;
  }, [pins, ch2PinId]);

  const ch1Fault = useMemo(() => (ch1Pin ? faults.find((f) => f.pinId === ch1Pin.id) : undefined), [faults, ch1Pin]);
  const ch2Fault = useMemo(() => (ch2Pin ? faults.find((f) => f.pinId === ch2Pin.id) : undefined), [faults, ch2Pin]);

  const ch1MnaVoltage = ch1Pin ? nodeVoltages[ch1Pin.id] ?? 0 : 0;
  const ch2MnaVoltage = ch2Pin ? nodeVoltages[ch2Pin.id] ?? 0 : 0;
  const isEcuAwake = useMemo(() => {
    if (!isPowerOn) return false;
    const kl30V = nodeVoltages['ecu-pin-3'] ?? 12.6;
    const kl15V = nodeVoltages['ecu-pin-4'] ?? 12.6;
    const kl31V = nodeVoltages['ecu-pin-1'] ?? 0;
    const kl31_2V = nodeVoltages['ecu-pin-2'] ?? 0;
    return kl30V - kl31V >= 6.5 && kl15V - kl31_2V >= 6.5;
  }, [isPowerOn, nodeVoltages]);

  // Throttled timebase advance when running
  useEffect(() => {
    if (!isRunning || !isPowerOn) return;
    let rafId = 0;
    let lastTick = performance.now();

    const step = (now: number) => {
      if (!document.hidden && now - lastTick >= 40) {
        const dtSec = Math.min(0.1, (now - lastTick) / 1000);
        lastTick = now;
        setSimTimeSec((prev) => prev + dtSec * Math.max(0.2, simulationSpeed) * 0.35);
      }
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isRunning, isPowerOn, simulationSpeed]);

  // Generate waveform sample data for D3
  const waveformData = useMemo(() => {
    if (!ch1Pin) return { samples: [], stats: { vMin: 0, vMax: 5, vpp: 5, freqHz: 0 } };

    if (signalMode === 'CKP_CMP') {
      const sampleCount = 120;
      const samples = [];
      for (let i = 0; i < sampleCount; i++) {
        const tMs = (i / (sampleCount - 1)) * timebaseMs;
        const tSec = simTimeSec + tMs / 1000;
        const ckpV = SignalGenerator.getCrankshaftVrSignal(tSec, rpm, ckpSignalLost);
        const cmpV = SignalGenerator.getCamshaftHallSignal(tSec, rpm, camPhaseOffsetDeg) * 5.0;
        samples.push({ timeMs: tMs, ch1: ckpV, ch2: cmpV, diff: ckpV - cmpV });
      }
      return {
        samples,
        stats: {
          vMin: -15,
          vMax: 18,
          vpp: 33,
          freqHz: (rpm / 60) * 30,
        },
      };
    }

    if (signalMode === 'INJ_PWM') {
      const sampleCount = 120;
      const samples = [];
      const injV = nodeVoltages['ecu-pin-10'] ?? 12.6;
      const canPulse = isEcuAwake && isInjectorFiring && !hasInjectorFault && !ckpSignalLost;
      for (let i = 0; i < sampleCount; i++) {
        const tMs = (i / (sampleCount - 1)) * timebaseMs;
        const tSec = simTimeSec + tMs / 1000;
        const v = canPulse ? SignalGenerator.getInjectorWaveform(tSec, false, injV, rpm) : injV;
        samples.push({ timeMs: tMs, ch1: v, ch2: canPulse && v <= 1.0 ? 5 : 0, diff: v });
      }
      return {
        samples,
        stats: {
          vMin: canPulse ? 0 : Math.max(0, injV - 0.5),
          vMax: canPulse ? 65 : Math.max(5, injV + 1),
          vpp: canPulse ? 65 : 0,
          freqHz: canPulse ? rpm / 120 : 0,
        },
      };
    }

    if (signalMode === 'CAN_BUS') {
      const sampleCount = 120;
      const samples = [];
      const busBroken = !isEcuAwake || hasCanFault;
      for (let i = 0; i < sampleCount; i++) {
        const tMs = (i / (sampleCount - 1)) * timebaseMs;
        const tSec = simTimeSec + tMs / 1000;
        const sig = SignalGenerator.getCanBusSignals(tSec, busBroken);
        samples.push({ timeMs: tMs, ch1: sig.canHigh, ch2: sig.canLow, diff: sig.canHigh - sig.canLow });
      }
      return {
        samples,
        stats: {
          vMin: 0,
          vMax: 5,
          vpp: busBroken ? 0.0 : 2.0,
          freqHz: busBroken ? 0 : 500000,
        },
      };
    }

    if (signalMode === 'DUAL' && ch2Pin) {
      const dual = SignalGenerator.sampleDualPinWaveformSeries({
        ch1PinId: ch1Pin.id,
        ch1PinLabel: ch1Pin.label,
        ch1MnaVoltage,
        ch1FaultType: ch1Fault?.faultType ?? 'NONE',
        ch2PinId: ch2Pin.id,
        ch2PinLabel: ch2Pin.label,
        ch2MnaVoltage,
        ch2FaultType: ch2Fault?.faultType ?? 'NONE',
        isPowerOn,
        isEcuAwake,
        ckpSignalLost,
        hasCanFault,
        hasInjectorFault,
        isInjectorFiring,
        rpm,
        tStartSec: simTimeSec,
        windowMs: timebaseMs,
        sampleCount: 120,
      });
      return {
        samples: dual.samples,
        stats: {
          vMin: Math.min(dual.ch1Stats.vMin, dual.ch2Stats.vMin),
          vMax: Math.max(dual.ch1Stats.vMax, dual.ch2Stats.vMax),
          vpp: Math.max(dual.ch1Stats.vpp, dual.ch2Stats.vpp),
          freqHz: dual.ch1Stats.freqHz,
        },
      };
    }

    // Single pin mode
    const single = SignalGenerator.samplePinWaveformSeries({
      pinId: ch1Pin.id,
      pinLabel: ch1Pin.label,
      mnaNodeVoltage: ch1MnaVoltage,
      faultType: ch1Fault?.faultType ?? 'NONE',
      isPowerOn,
      isEcuAwake,
      ckpSignalLost,
      hasCanFault,
      hasInjectorFault,
      isInjectorFiring,
      rpm,
      tStartSec: simTimeSec,
      windowMs: timebaseMs,
      sampleCount: 120,
    });
    return {
      samples: single.samples.map((s) => ({ timeMs: s.timeMs, ch1: s.voltage, ch2: 0, diff: s.voltage })),
      stats: {
        vMin: single.vMin,
        vMax: single.vMax,
        vpp: single.vpp,
        freqHz: single.freqHz,
      },
    };
  }, [
    ch1Pin,
    ch2Pin,
    signalMode,
    timebaseMs,
    simTimeSec,
    rpm,
    ckpSignalLost,
    camPhaseOffsetDeg,
    isInjectorFiring,
    nodeVoltages,
    hasCanFault,
    hasInjectorFault,
    isPowerOn,
    isEcuAwake,
    ch1MnaVoltage,
    ch2MnaVoltage,
    ch1Fault?.faultType,
    ch2Fault?.faultType,
  ]);

  // Render D3 SVG plot
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 260;
    const margin = { top: 15, right: 25, bottom: 25, left: 45 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Phosphor CRT background & grid
    g.append('rect')
      .attr('width', innerW)
      .attr('height', innerH)
      .attr('fill', '#040907')
      .attr('rx', 2);

    const xScale = d3.scaleLinear().domain([0, timebaseMs]).range([0, innerW]);
    const yScale = d3
      .scaleLinear()
      .domain([
        (waveformData.stats.vMin - 1) / voltDiv,
        (waveformData.stats.vMax + 1) / voltDiv,
      ])
      .range([innerH, 0]);

    // Reticle Grid Lines
    const xTicks = xScale.ticks(8);
    const yTicks = yScale.ticks(6);

    g.selectAll('.grid-x')
      .data(xTicks)
      .enter()
      .append('line')
      .attr('x1', (d) => xScale(d))
      .attr('x2', (d) => xScale(d))
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('stroke', '#0a231f')
      .attr('stroke-width', 1);

    g.selectAll('.grid-y')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', '#0a231f')
      .attr('stroke-width', 1);

    // Center zero axis
    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', yScale(0))
      .attr('y2', yScale(0))
      .attr('stroke', '#143c34')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,4');

    // Axes
    const xAxis = d3.axisBottom(xScale).ticks(6).tickFormat((d) => `${d}ms`);
    const yAxis = d3.axisLeft(yScale).ticks(5).tickFormat((d) => `${d}V`);

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(xAxis)
      .attr('color', '#475569')
      .style('font-size', '9px')
      .style('font-family', 'monospace');

    g.append('g')
      .call(yAxis)
      .attr('color', '#475569')
      .style('font-size', '9px')
      .style('font-family', 'monospace');

    if (!isPowerOn) {
      g.append('text')
        .attr('x', innerW / 2)
        .attr('y', innerH / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#34d399')
        .style('font-size', '11px')
        .style('font-family', 'monospace')
        .text('[ POWER SUPPLY OFF - ZERO VOLTAGE ]');
      return;
    }

    const data = waveformData.samples;
    if (data.length === 0) return;

    // Line and Area generators
    const lineCh1 = d3
      .line<(typeof data)[0]>()
      .x((d) => xScale(d.timeMs))
      .y((d) => yScale(d.ch1))
      .curve(d3.curveMonotoneX);

    const lineCh2 = d3
      .line<(typeof data)[0]>()
      .x((d) => xScale(d.timeMs))
      .y((d) => yScale(d.ch2))
      .curve(d3.curveMonotoneX);

    const areaCh1 = d3
      .area<(typeof data)[0]>()
      .x((d) => xScale(d.timeMs))
      .y0(yScale(0))
      .y1((d) => yScale(d.ch1))
      .curve(d3.curveMonotoneX);

    // Render CH1 Area & Glow Line
    g.append('path')
      .datum(data)
      .attr('fill', 'url(#d3ScopeGradient)')
      .attr('d', areaCh1);

    // SVG Gradient definition
    const defs = svg.append('defs');
    const grad = defs.append('linearGradient').attr('id', 'd3ScopeGradient').attr('x1', '0%').attr('y1', '0%').attr('x2', '0%').attr('y2', '100%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#4ade80').attr('stop-opacity', 0.28);
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#4ade80').attr('stop-opacity', 0.02);

    // CH1 Trace (Phosphor Green)
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#4ade80')
      .attr('stroke-width', 2.25)
      .attr('d', lineCh1)
      .style('filter', 'drop-shadow(0 0 3px rgba(74, 222, 128, 0.5))');

    // CH2 Trace (Safety Amber) when dual or CKP/CMP / CAN
    if (signalMode === 'DUAL' || signalMode === 'CKP_CMP' || signalMode === 'CAN_BUS') {
      g.append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', '#f59e0b')
        .attr('stroke-width', 2.0)
        .attr('d', lineCh2)
        .style('filter', 'drop-shadow(0 0 3px rgba(245, 158, 11, 0.5))');
    }
  }, [waveformData, timebaseMs, voltDiv, isPowerOn, signalMode]);

  const formatFreq = (hz: number) => {
    if (hz <= 0) return '0.0 Hz';
    if (hz >= 1000) return `${(hz / 1000).toFixed(1)} kHz`;
    return `${hz.toFixed(1)} Hz`;
  };

  return (
    <div className="relative hud-panel rounded-[3px] px-3.5 py-3 text-slate-100 flex flex-col gap-3 font-mono">
      <RackCornerScrews />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#2b313c] pb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-4 h-4 text-[#4ade80] shrink-0" aria-hidden="true" />
          <h3 className="text-xs sm:text-sm font-mono font-bold tracking-[0.08em] text-slate-100 uppercase truncate">
            VECTOR SVG DIAGNOSTIC SCOPE
          </h3>
          <span className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded-[2px] bg-[#141820] text-slate-300 border border-[#343c4b]">
            D3.js Engine
          </span>
          <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded-[2px] bg-amber-500/10 text-amber-400 border border-amber-500/45 uppercase">
            SIMULATED
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsRunning(!isRunning)}
            className={`px-2.5 py-1 text-[10px] font-mono rounded-[2px] border flex items-center gap-1.5 font-bold uppercase transition cursor-pointer whitespace-nowrap ${
              isRunning
                ? 'hw-btn-green text-emerald-300'
                : 'hw-btn-amber text-amber-300'
            }`}
          >
            {isRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>{isRunning ? 'RUNNING' : 'HOLD'}</span>
          </button>
        </div>
      </div>

      {/* Signal Mode Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="text-slate-400 uppercase font-bold tracking-wider mr-1">MODE:</span>
        {(
          [
            { id: 'DUAL', label: 'Dual Pin A/B' },
            { id: 'CKP_CMP', label: 'CKP 60-2 & CMP' },
            { id: 'INJ_PWM', label: 'Injector PWM' },
            { id: 'CAN_BUS', label: 'CAN Bus Diff' },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setSignalMode(m.id)}
            className={`px-2.5 py-1 rounded-[2px] transition cursor-pointer whitespace-nowrap ${
              signalMode === m.id
                ? 'hw-btn-amber text-amber-300 font-bold'
                : 'hw-btn text-slate-300'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Recessed SVG CRT Container */}
      <div
        ref={containerRef}
        className="relative hw-lcd-well border border-[#2b313c] rounded-[2px] overflow-hidden bg-[#040907] h-[220px] sm:h-[260px] w-full"
      >
        <svg ref={svgRef} className="w-full h-full block" />

        {/* Live Channel Badges overlay */}
        <div className="absolute top-2 left-2 flex flex-wrap items-center gap-1.5 text-[10px] font-mono pointer-events-none">
          <span className="text-[#4ade80] font-bold bg-[#0c0f14]/90 px-2 py-0.5 rounded-[2px] border border-emerald-500/45">
            CH1: {ch1Pin?.label || 'Pin'} ({ch1MnaVoltage.toFixed(2)}V)
          </span>
          {(signalMode === 'DUAL' || signalMode === 'CKP_CMP' || signalMode === 'CAN_BUS') && ch2Pin && (
            <span className="text-amber-300 font-bold bg-[#0c0f14]/90 px-2 py-0.5 rounded-[2px] border border-amber-500/45">
              CH2: {signalMode === 'CKP_CMP' ? 'CMP Hall' : signalMode === 'CAN_BUS' ? 'CAN-L' : ch2Pin.label} ({ch2MnaVoltage.toFixed(2)}V)
            </span>
          )}
        </div>
      </div>

      {/* Channel Selectors & Rotary Scale Controls */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center pt-1 border-t border-[#2b313c]">
        <div className="md:col-span-5 flex flex-wrap items-center gap-2 text-[10px]">
          {signalMode === 'DUAL' ? (
            <>
              <label className="flex items-center gap-1 text-[#4ade80] font-semibold">
                <span>CH1:</span>
                <select
                  value={ch1Pin?.id || ''}
                  onChange={(e) => onSelectPin(e.target.value)}
                  className="bg-[#0c0f14] border border-[#343c4b] rounded-[2px] px-1.5 py-1 text-emerald-200 text-[10px] cursor-pointer"
                >
                  {pins.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.pinNumber} {p.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-1 text-amber-300 font-semibold">
                <span>CH2:</span>
                <select
                  value={ch2PinId || ''}
                  onChange={(e) => setCh2PinId(e.target.value)}
                  className="bg-[#0c0f14] border border-[#343c4b] rounded-[2px] px-1.5 py-1 text-amber-200 text-[10px] cursor-pointer"
                >
                  {pins.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.pinNumber} {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <span className="text-[10px] text-slate-400">
              TIMEBASE PRESETS:
              <span className="inline-flex ml-2 gap-1">
                {[10, 40, 100, 500].map((ms) => (
                  <button
                    key={ms}
                    type="button"
                    onClick={() => setTimebaseMs(ms)}
                    className={`px-2 py-0.5 rounded-[2px] cursor-pointer transition ${
                      timebaseMs === ms
                        ? 'hw-btn-amber text-amber-300 font-bold'
                        : 'hw-btn text-slate-300'
                    }`}
                  >
                    {ms}ms
                  </button>
                ))}
              </span>
            </span>
          )}
        </div>

        <div className="md:col-span-7 grid grid-cols-2 gap-3 rounded-[2px] border border-[#2b313c] bg-[#141820] p-2">
          <RotaryEncoderDial
            label="TIMEBASE"
            value={timebaseMs}
            min={10}
            max={500}
            step={10}
            unit="ms"
            accent="green"
            size="sm"
            formatValue={(v) => `${v}ms`}
            onChange={setTimebaseMs}
          />
          <RotaryEncoderDial
            label="VOLTS / DIV"
            value={voltDiv}
            min={0.5}
            max={2.5}
            step={0.25}
            accent="amber"
            size="sm"
            formatValue={(v) => `${v.toFixed(2)}x`}
            onChange={setVoltDiv}
            inlineFlankButtons={{
              dec: { label: '-', delta: -0.25 },
              inc: { label: '+', delta: 0.25 },
            }}
          />
        </div>
      </div>

      {/* Bottom 3-Column Recessed Telemetry Strip */}
      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
        <div className="hw-lcd-well rounded-[2px] border border-[#2b313c] px-2.5 py-2 flex flex-col">
          <span className="text-slate-400 uppercase tracking-wider">Vpk-pk</span>
          <strong className="text-sm sm:text-base font-bold text-[#4ade80] tabular-nums mt-0.5">
            {waveformData.stats.vpp.toFixed(2)} V
          </strong>
        </div>
        <div className="hw-lcd-well rounded-[2px] border border-[#2b313c] px-2.5 py-2 flex flex-col">
          <span className="text-slate-400 uppercase tracking-wider">Freq</span>
          <strong className="text-sm sm:text-base font-bold text-[#4ade80] tabular-nums mt-0.5">
            {formatFreq(waveformData.stats.freqHz)}
          </strong>
        </div>
        <div className="hw-lcd-well rounded-[2px] border border-[#2b313c] px-2.5 py-2 flex flex-col">
          <span className="text-slate-400 uppercase tracking-wider">Engine Speed</span>
          <strong className="text-sm sm:text-base font-bold text-amber-400 tabular-nums mt-0.5">
            {rpm} RPM
          </strong>
        </div>
      </div>
    </div>
  );
};
