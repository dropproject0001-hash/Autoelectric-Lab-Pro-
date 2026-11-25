/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useId, useRef, useState } from 'react';

export type HardwareAccent = 'amber' | 'green' | 'steel' | 'red';

export interface StepButtonConfig {
  label: string;
  delta: number;
}

export interface RotaryEncoderDialProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  accent?: HardwareAccent;
  formatValue?: (val: number) => string;
  onChange: (nextValue: number) => void;
  stepButtons?: readonly StepButtonConfig[];
  inlineFlankButtons?: { dec: StepButtonConfig; inc: StepButtonConfig };
  size?: 'sm' | 'md';
  disabled?: boolean;
  ariaLabel?: string;
  centerResetValue?: number;
  className?: string;
}

const ACCENT_TOKENS: Record<
  HardwareAccent,
  { stroke: string; text: string; led: string; glow: string }
> = {
  amber: {
    stroke: '#f59e0b',
    text: 'text-amber-400',
    led: 'bg-amber-400',
    glow: 'rgba(245, 158, 11, 0.45)',
  },
  green: {
    stroke: '#22c55e',
    text: 'text-emerald-400',
    led: 'bg-emerald-400',
    glow: 'rgba(34, 197, 94, 0.45)',
  },
  steel: {
    stroke: '#94a3b8',
    text: 'text-slate-200',
    led: 'bg-slate-300',
    glow: 'rgba(148, 163, 184, 0.35)',
  },
  red: {
    stroke: '#ef4444',
    text: 'text-rose-400',
    led: 'bg-rose-400',
    glow: 'rgba(239, 68, 68, 0.45)',
  },
};

function clampAndSnap(raw: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, raw));
  const decimals = (step.toString().split('.')[1] || '').length;
  const snapped = Math.round((clamped - min) / step) * step + min;
  const fixed = Number(snapped.toFixed(Math.min(6, decimals + 1)));
  return Math.min(max, Math.max(min, fixed));
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return ['M', start.x, start.y, 'A', r, r, 0, largeArcFlag, 0, end.x, end.y].join(' ');
}

export const RotaryEncoderDial: React.FC<RotaryEncoderDialProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  accent = 'amber',
  formatValue,
  onChange,
  stepButtons,
  inlineFlankButtons,
  size = 'md',
  disabled = false,
  ariaLabel,
  centerResetValue,
  className = '',
}) => {
  const labelId = useId();
  const gradId = useId();
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startValue: number;
  } | null>(null);

  const safeSpan = Math.max(1e-6, max - min);
  const normalized = Math.min(1, Math.max(0, (value - min) / safeSpan));
  // -135 deg (min) to +135 deg (max)
  const angleDeg = -135 + normalized * 270;
  const colors = ACCENT_TOKENS[accent];

  const commitValue = useCallback(
    (next: number) => {
      if (disabled) return;
      const quantized = clampAndSnap(next, min, max, step);
      if (quantized !== value) {
        onChange(quantized);
      }
    },
    [disabled, max, min, onChange, step, value]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.focus();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic */
    }
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startValue: value,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    // Drag up or right increases value; ~130px full span drag feels physical & crisp
    const deltaPx = (drag.startY - e.clientY) + (e.clientX - drag.startX) * 0.65;
    const deltaVal = (deltaPx / 135) * safeSpan;
    commitValue(drag.startValue + deltaVal);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    dragStateRef.current = null;
    setIsDragging(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* detached */
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.stopPropagation();
    const dir = e.deltaY < 0 || e.deltaX > 0 ? 1 : -1;
    const multiplier = e.shiftKey ? 5 : 1;
    commitValue(value + dir * step * multiplier);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const coarse = Math.max(step * 5, safeSpan * 0.05);
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        e.preventDefault();
        commitValue(value + (e.shiftKey ? coarse : step));
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        e.preventDefault();
        commitValue(value - (e.shiftKey ? coarse : step));
        break;
      case 'PageUp':
        e.preventDefault();
        commitValue(value + coarse);
        break;
      case 'PageDown':
        e.preventDefault();
        commitValue(value - coarse);
        break;
      case 'Home':
        e.preventDefault();
        commitValue(min);
        break;
      case 'End':
        e.preventDefault();
        commitValue(max);
        break;
      default:
        break;
    }
  };

  const displayStr = formatValue
    ? formatValue(value)
    : `${value}${unit ? ` ${unit}` : ''}`;

  const svgSize = size === 'sm' ? 48 : 64;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const trackR = size === 'sm' ? 19 : 26;
  const knobR = size === 'sm' ? 13 : 18;

  const ticks = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
  const pointerInner = polarToCartesian(cx, cy, knobR * 0.32, angleDeg);
  const pointerOuter = polarToCartesian(cx, cy, knobR - 2.2, angleDeg);

  return (
    <div
      className={`flex flex-col gap-1.5 select-none ${className}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {label && (
        <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
          <span id={labelId} className="uppercase tracking-wider text-slate-400 truncate">
            {label}
          </span>
          <span className={`font-bold tabular-nums shrink-0 ${colors.text}`}>
            {displayStr}
          </span>
        </div>
      )}

      <div className="flex items-center justify-center gap-2">
        {inlineFlankButtons && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => commitValue(value + inlineFlankButtons.dec.delta)}
            className="hw-btn min-h-[32px] min-w-[38px] px-2 py-1 rounded-md text-[10px] font-mono font-bold text-slate-200 disabled:opacity-40 cursor-pointer shrink-0 tabular-nums"
          >
            {inlineFlankButtons.dec.label}
          </button>
        )}

        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={ariaLabel || label || 'Rotary encoder'}
          aria-labelledby={!ariaLabel && label ? labelId : undefined}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={displayStr}
          aria-disabled={disabled}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
          onDoubleClick={() => {
            if (!disabled && centerResetValue !== undefined) {
              commitValue(centerResetValue);
            }
          }}
          title="Drag vertically/horizontally, scroll wheel, or use arrow keys"
          className={`relative inline-flex items-center justify-center rounded-full touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
            disabled ? 'opacity-45 cursor-not-allowed' : isDragging ? 'cursor-grabbing' : 'cursor-ns-resize'
          }`}
          style={{ width: svgSize, height: svgSize }}
        >
          <svg
            width={svgSize}
            height={svgSize}
            viewBox={`0 0 ${svgSize} ${svgSize}`}
            aria-hidden="true"
            className="overflow-visible"
          >
            <defs>
              <radialGradient id={gradId} cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#3c4452" />
                <stop offset="60%" stopColor="#20252f" />
                <stop offset="100%" stopColor="#12161c" />
              </radialGradient>
            </defs>

            {/* Scale detent ticks */}
            {ticks.map((t, idx) => {
              const deg = -135 + t * 270;
              const p1 = polarToCartesian(cx, cy, trackR + 2, deg);
              const p2 = polarToCartesian(cx, cy, trackR + (idx % 2 === 0 ? 4.8 : 3.4), deg);
              const isLit = t <= normalized + 0.001;
              return (
                <line
                  key={t}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={isLit ? colors.stroke : '#3b4454'}
                  strokeWidth={idx % 2 === 0 ? 1.4 : 1}
                  strokeLinecap="square"
                />
              );
            })}

            {/* Base Arc Track */}
            <path
              d={describeArc(cx, cy, trackR, -135, 135)}
              fill="none"
              stroke="#242b36"
              strokeWidth={size === 'sm' ? 2.2 : 2.8}
              strokeLinecap="butt"
            />

            {/* Active Value Arc */}
            {normalized > 0.005 && (
              <path
                d={describeArc(cx, cy, trackR, -135, angleDeg)}
                fill="none"
                stroke={colors.stroke}
                strokeWidth={size === 'sm' ? 2.2 : 2.8}
                strokeLinecap="butt"
              />
            )}

            {/* Recessed Collar */}
            <circle
              cx={cx}
              cy={cy}
              r={knobR + 2.2}
              fill="#0b0d11"
              stroke="#2e3644"
              strokeWidth="1"
            />

            {/* Anodized Knurled Knob Body */}
            <circle
              cx={cx}
              cy={cy}
              r={knobR}
              fill={`url(#${gradId})`}
              stroke={isDragging ? colors.stroke : '#475162'}
              strokeWidth="1.2"
            />

            {/* Inner Machined Bevel */}
            <circle
              cx={cx}
              cy={cy}
              r={knobR - 3.5}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="0.75"
            />

            {/* Index Pointer Notch */}
            <line
              x1={pointerInner.x}
              y1={pointerInner.y}
              x2={pointerOuter.x}
              y2={pointerOuter.y}
              stroke={colors.stroke}
              strokeWidth={size === 'sm' ? 2 : 2.4}
              strokeLinecap="round"
            />
          </svg>
        </div>

        {inlineFlankButtons && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => commitValue(value + inlineFlankButtons.inc.delta)}
            className="hw-btn min-h-[32px] min-w-[38px] px-2 py-1 rounded-md text-[10px] font-mono font-bold text-slate-200 disabled:opacity-40 cursor-pointer shrink-0 tabular-nums"
          >
            {inlineFlankButtons.inc.label}
          </button>
        )}
      </div>

      {stepButtons && stepButtons.length > 0 && (
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${stepButtons.length}, minmax(0, 1fr))` }}
        >
          {stepButtons.map((btn) => (
            <button
              key={btn.label}
              type="button"
              disabled={disabled}
              onClick={() => commitValue(value + btn.delta)}
              className="hw-btn py-1 px-1 rounded-md text-[9.5px] font-mono font-semibold text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer tabular-nums truncate"
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const RackCornerScrews: React.FC = () => (
  <>
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-[#0b1320] border border-[#2a3f5f] flex items-center justify-center"
    >
      <span className="w-1.5 h-px bg-[#446087] rotate-45" />
    </span>
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#0b1320] border border-[#2a3f5f] flex items-center justify-center"
    >
      <span className="w-1.5 h-px bg-[#446087] -rotate-45" />
    </span>
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-1.5 left-1.5 w-2 h-2 rounded-full bg-[#0b1320] border border-[#2a3f5f] flex items-center justify-center"
    >
      <span className="w-1.5 h-px bg-[#446087] -rotate-12" />
    </span>
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-1.5 right-1.5 w-2 h-2 rounded-full bg-[#0b1320] border border-[#2a3f5f] flex items-center justify-center"
    >
      <span className="w-1.5 h-px bg-[#446087] rotate-12" />
    </span>
  </>
);
