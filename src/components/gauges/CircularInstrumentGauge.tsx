import React, { useMemo } from 'react';
import type { InstrumentStatusCode } from '../../simulation/telemetry/telemetryTypes';
import {
  buildClockwiseArcPath,
  useDampedGaugeMotion,
} from './useDampedGaugeMotion';

export interface CircularInstrumentGaugeProps {
  title: string;
  subtitle?: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  majorStep: number;
  minorStepsPerMajor?: number;
  labelDivisor?: number;
  redlineStart?: number;
  peakValue?: number | null;
  showPeakHold?: boolean;
  statusCode: InstrumentStatusCode;
  statusFooterLabel: string;
  accent?: 'amber' | 'green';
  ariaLabel?: string;
}

const START_ANGLE_DEG = -135;
const SWEEP_ANGLE_DEG = 270;
const FULL_TRACK_ARC_PATH = buildClockwiseArcPath(
  90,
  88,
  66,
  START_ANGLE_DEG,
  START_ANGLE_DEG + SWEEP_ANGLE_DEG
);

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polarPoint(cx, cy, r, endDeg);
  const end = polarPoint(cx, cy, r, startDeg);
  const largeArc = endDeg - startDeg <= 180 ? '0' : '1';
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export const CircularInstrumentGauge: React.FC<CircularInstrumentGaugeProps> = ({
  title,
  subtitle,
  value,
  min,
  max,
  unit,
  majorStep,
  minorStepsPerMajor = 4,
  labelDivisor = 1,
  redlineStart,
  peakValue = null,
  showPeakHold = false,
  statusCode,
  statusFooterLabel,
  accent = 'amber',
  ariaLabel,
}) => {
  const span = Math.max(1e-6, max - min);
  const clampedValue = Math.max(min, Math.min(max, value));

  const { needleRef, arcRef, arcPathLengthUnits } = useDampedGaugeMotion({
    value: clampedValue,
    min,
    max,
    startAngleDeg: START_ANGLE_DEG,
    sweepAngleDeg: SWEEP_ANGLE_DEG,
  });

  const peakAngle =
    showPeakHold && peakValue !== null && Number.isFinite(peakValue)
      ? START_ANGLE_DEG + (Math.max(min, Math.min(max, peakValue)) - min) / span * SWEEP_ANGLE_DEG
      : null;

  const ticks = useMemo(() => {
    const items: {
      angle: number;
      major: boolean;
      label?: string;
      isRedline: boolean;
    }[] = [];
    const majorCount = Math.round(span / majorStep);
    const totalMinor = majorCount * minorStepsPerMajor;

    for (let i = 0; i <= totalMinor; i++) {
      const val = min + (i / totalMinor) * span;
      const angle = START_ANGLE_DEG + (i / totalMinor) * SWEEP_ANGLE_DEG;
      const major = i % minorStepsPerMajor === 0;
      const isRedline = redlineStart !== undefined && val >= redlineStart;
      const labelNum = val / labelDivisor;
      items.push({
        angle,
        major,
        label: major ? String(Math.round(labelNum)) : undefined,
        isRedline,
      });
    }
    return items;
  }, [span, majorStep, minorStepsPerMajor, min, redlineStart, labelDivisor]);

  const redlineStartAngle =
    redlineStart !== undefined
      ? START_ANGLE_DEG + ((Math.max(min, Math.min(max, redlineStart)) - min) / span) * SWEEP_ANGLE_DEG
      : null;

  const isLive = statusCode === 'LIVE_SIMULATED';
  const isFaulted = statusCode === 'CKP_NO_SIGNAL' || statusCode === 'SAFETY_LOCKED';
  const isPaused = statusCode === 'PAUSED';

  const statusColorClass = isLive
    ? 'text-[#20d889]'
    : isFaulted
    ? 'text-[#ff4d62]'
    : isPaused
    ? 'text-[#ffb020]'
    : 'text-[#91a4bd]';

  const needleColor = isFaulted
    ? '#ff4d62'
    : accent === 'amber'
    ? '#ffb020'
    : '#20d889';

  const arcColor = isFaulted
    ? '#ff4d62'
    : isLive
    ? '#19c8f5'
    : '#1677ff';

  return (
    <div
      role="meter"
      aria-label={ariaLabel || title}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(clampedValue)}
      className="diag-gauge-well relative flex flex-col items-center justify-between rounded-xl p-2 select-none min-w-0"
    >
      <svg
        viewBox="0 0 180 176"
        className="w-full max-w-[172px] h-auto overflow-visible"
        aria-hidden="true"
      >
        {/* Outer Hardware Ring & Bezel */}
        <circle
          cx="90"
          cy="88"
          r="80"
          fill="#0a1324"
          stroke="#203653"
          strokeWidth="2.5"
        />
        <circle
          cx="90"
          cy="88"
          r="75"
          fill="#050a12"
          stroke="#192c47"
          strokeWidth="1"
        />

        {/* Track Background Arc */}
        <path
          d={FULL_TRACK_ARC_PATH}
          fill="none"
          stroke="#14233b"
          strokeWidth="4.8"
          strokeLinecap="round"
        />

        {/* Spring-Synchronized Active Value Progress Arc */}
        <path
          ref={arcRef}
          d={FULL_TRACK_ARC_PATH}
          pathLength={arcPathLengthUnits}
          strokeDasharray={arcPathLengthUnits}
          fill="none"
          stroke={arcColor}
          strokeOpacity={isLive ? 0.95 : 0.45}
          strokeWidth="4.8"
          strokeLinecap="round"
          style={{ transition: 'stroke 150ms ease, stroke-opacity 150ms ease' }}
        />

        {/* Redline Segment */}
        {redlineStartAngle !== null && (
          <path
            d={arcPath(90, 88, 70.5, redlineStartAngle, START_ANGLE_DEG + SWEEP_ANGLE_DEG)}
            fill="none"
            stroke="#ff4d62"
            strokeWidth="2.5"
            strokeOpacity="0.92"
          />
        )}

        {/* Scale Ticks & Numerals */}
        {ticks.map((tick, idx) => {
          const outer = polarPoint(90, 88, 72, tick.angle);
          const inner = polarPoint(90, 88, tick.major ? 62 : 67, tick.angle);
          const textPos = tick.major ? polarPoint(90, 88, 51, tick.angle) : null;
          return (
            <g key={idx}>
              <line
                x1={outer.x}
                y1={outer.y}
                x2={inner.x}
                y2={inner.y}
                stroke={tick.isRedline ? '#ff4d62' : tick.major ? '#d9e8fa' : '#4a6282'}
                strokeWidth={tick.major ? 1.6 : 1}
              />
              {textPos && tick.label && (
                <text
                  x={textPos.x}
                  y={textPos.y}
                  fill={tick.isRedline ? '#ff8594' : '#eaf3ff'}
                  fontSize={majorCountTextSize(labelDivisor)}
                  fontWeight="700"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {tick.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Peak-Hold Rim Marker */}
        {peakAngle !== null && (
          <g
            className="gauge-peak-marker"
            style={{ transform: `rotate(${peakAngle}deg)`, transformOrigin: '90px 88px' }}
          >
            <polygon points="90,15 86.5,22 93.5,22" fill="#ffb020" />
          </g>
        )}

        {/* Dial Title */}
        <text
          x="90"
          y="60"
          fill="#91a4bd"
          fontSize="8.5"
          fontWeight="700"
          letterSpacing="0.8"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          textAnchor="middle"
        >
          {title}
        </text>
        {subtitle && (
          <text
            x="90"
            y="70"
            fill="#6f87a6"
            fontSize="6.5"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            textAnchor="middle"
          >
            {subtitle}
          </text>
        )}

        {/* Spring-Damped Hardware Needle */}
        <g
          ref={needleRef}
          style={{
            transformOrigin: '90px 88px',
            willChange: 'transform',
          }}
        >
          <polygon
            points="88.3,88 90,22 91.7,88 90.8,97 89.2,97"
            fill={needleColor}
            style={{ transition: 'fill 150ms ease' }}
          />
        </g>

        {/* Center Hub Cap */}
        <circle cx="90" cy="88" r="6.5" fill="#132238" stroke="#3b5b84" strokeWidth="1.2" />
        <circle cx="90" cy="88" r="2.2" fill="#19c8f5" />

        {/* Digital Monospace LCD Readout Well */}
        <rect
          x="52"
          y="108"
          width="76"
          height="24"
          rx="4"
          fill="#050a12"
          stroke="#203653"
          strokeWidth="1"
        />
        <text
          x="90"
          y="120.5"
          fill={isFaulted ? '#ff8594' : '#eaf3ff'}
          fontSize="16"
          fontWeight="700"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {Math.round(clampedValue)}
        </text>

        {/* Unit & Peak Line */}
        <text
          x="90"
          y="142"
          fill="#91a4bd"
          fontSize="7.5"
          fontWeight="600"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          textAnchor="middle"
        >
          {unit}
        </text>
      </svg>

      {/* Bottom Dial Status / Peak-Hold Line */}
      <div className="w-full flex items-center justify-between gap-1 px-1.5 pt-1.5 border-t border-[#203653]/80 text-[9.5px] font-mono tabular-nums">
        <span className={`font-bold uppercase tracking-wider truncate ${statusColorClass}`}>
          {statusFooterLabel}
        </span>
        {showPeakHold && peakValue !== null && Number.isFinite(peakValue) && (
          <span className="text-[#ffb020] shrink-0" title="Valid Peak-Hold">
            PK {Math.round(peakValue)}
          </span>
        )}
      </div>
    </div>
  );
};

function majorCountTextSize(divisor: number): string {
  return divisor === 1 ? '8' : '9.5';
}
