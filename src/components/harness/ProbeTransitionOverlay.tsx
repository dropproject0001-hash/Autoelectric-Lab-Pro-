import React from 'react';
import {
  formatProbeMoveBadge,
  type ProbePoint,
  type ProbeTransitionState,
} from './useProbeTransitionMotion';

interface ProbeTransitionOverlayProps {
  color: 'red' | 'black';
  motionState: ProbeTransitionState;
  leadOrigin: ProbePoint;
  instanceId: string;
  compact?: boolean;
}

const PROBE_THEME = {
  red: {
    leadStroke: '#ef4444',
    trailStroke: '#f87171',
    trailGlow: 'rgba(239, 68, 68, 0.35)',
    bodyFill: '#dc2626',
    bodyStroke: '#fca5a5',
    gripFill: '#7f1d1d',
    gripStroke: '#991b1b',
    badgeStroke: '#ef4444',
    badgeText: '#fca5a5',
    label: '[+] RED PROBE',
    compactTag: '+RED',
    badgeYOffset: -22,
  },
  black: {
    leadStroke: '#64748b',
    trailStroke: '#cbd5e1',
    trailGlow: 'rgba(148, 163, 184, 0.32)',
    bodyFill: '#1e293b',
    bodyStroke: '#94a3b8',
    gripFill: '#0f172a',
    gripStroke: '#334155',
    badgeStroke: '#64748b',
    badgeText: '#cbd5e1',
    label: '[-] COM DMM',
    compactTag: '-COM',
    badgeYOffset: 16,
  },
} as const;

export const ProbeTransitionOverlay: React.FC<ProbeTransitionOverlayProps> = ({
  color,
  motionState,
  leadOrigin,
  instanceId,
  compact = false,
}) => {
  const {
    coords,
    groundCoords,
    fromCoords,
    toCoords,
    fromLabel,
    toLabel,
    trailPathD,
    isMoving,
    justLanded,
    trailVisible,
    tiltAngle,
    scale,
    shadowOpacity,
  } = motionState;

  if (!coords && !trailVisible) return null;

  const theme = PROBE_THEME[color];
  const arrowMarkerId = `probe-arrow-${color}-${instanceId}`;
  const moveLabel =
    fromLabel && toLabel ? formatProbeMoveBadge(fromLabel, toLabel) : null;

  return (
    <g className="pointer-events-none" data-testid={`probe-overlay-${color}`}>
      <defs>
        <marker
          id={arrowMarkerId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5.5"
          markerHeight="5.5"
          orient="auto-start-reverse"
        >
          <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill={theme.trailStroke} />
        </marker>
      </defs>

      {/* Connection Movement Arc Across Harness */}
      {trailVisible && trailPathD && fromCoords && toCoords && (
        <g
          className="transition-opacity duration-500 ease-out"
          style={{ opacity: isMoving ? 1 : 0 }}
        >
          {/* Departure ring at previous pin */}
          <circle
            cx={fromCoords.x}
            cy={fromCoords.y}
            r={compact ? 11 : 8}
            fill="none"
            stroke={theme.trailStroke}
            strokeWidth="1.5"
            strokeDasharray="3 3"
            opacity="0.7"
          />

          {/* Soft glow trajectory */}
          <path
            d={trailPathD}
            fill="none"
            stroke={theme.trailGlow}
            strokeWidth={compact ? 5.5 : 6.5}
            strokeLinecap="round"
          />

          {/* Animated dashed directional flight path */}
          <path
            d={trailPathD}
            fill="none"
            stroke={theme.trailStroke}
            strokeWidth={compact ? 2 : 2.25}
            strokeDasharray="6 6"
            strokeLinecap="round"
            markerEnd={`url(#${arrowMarkerId})`}
            className="animate-probe-trail"
          />

          {/* Destination target lock reticle while approaching */}
          <circle
            cx={toCoords.x}
            cy={toCoords.y}
            r={compact ? 14 : 11}
            fill="none"
            stroke={theme.trailStroke}
            strokeWidth="1.5"
            strokeDasharray="4 3"
            opacity="0.9"
          />
          <circle
            cx={toCoords.x}
            cy={toCoords.y}
            r="3"
            fill={theme.trailStroke}
            opacity="0.85"
          />
        </g>
      )}

      {/* Projected harness-board shadow when probe lifts above terminals */}
      {isMoving && groundCoords && coords && (
        <ellipse
          cx={groundCoords.x - 8}
          cy={groundCoords.y + 3}
          rx={compact ? 11 : 15}
          ry={compact ? 3.5 : 4.5}
          fill="#020617"
          opacity={Math.min(0.65, shadowOpacity)}
        />
      )}

      {coords && (
        <>
          {/* Touchdown Contact Ripple / Spark Effect */}
          {justLanded && (
            <g transform={`translate(${coords.x}, ${coords.y})`}>
              <circle
                r={compact ? 18 : 16}
                fill={theme.leadStroke}
                fillOpacity="0.24"
                stroke={theme.trailStroke}
                strokeWidth="2.5"
                className="animate-probe-tap"
              />
              <circle r="3.5" fill="#ffffff" />
            </g>
          )}

          {/* Flexible silicone test lead wire originating from DMM jack */}
          <path
            d={
              color === 'red'
                ? `M ${leadOrigin.x} ${leadOrigin.y} C ${leadOrigin.x} ${coords.y * 0.45 + 30}, ${coords.x - 70} ${coords.y - 12}, ${coords.x - (compact ? 20 : 28)} ${coords.y}`
                : `M ${leadOrigin.x} ${leadOrigin.y} C ${leadOrigin.x} ${coords.y * 0.6 + (compact ? 120 : 250)}, ${coords.x - 70} ${coords.y + 12}, ${coords.x - (compact ? 20 : 28)} ${coords.y}`
            }
            fill="none"
            stroke={theme.leadStroke}
            strokeWidth={compact ? 2.5 : 3.5}
            strokeLinecap="round"
            opacity={isMoving ? 0.95 : 0.88}
            style={{
              filter: `drop-shadow(0 2px 5px ${theme.trailGlow})`,
            }}
          />

          {/* Probe Handle & Needle assembly with lift arc, scale, and tilt */}
          <g
            transform={`translate(${coords.x}, ${coords.y}) scale(${scale.toFixed(3)}) rotate(${tiltAngle.toFixed(2)})`}
          >
            {/* Flexible strain-relief boot */}
            <rect
              x="-35"
              y="-3"
              width="7"
              height="6"
              rx="1.5"
              fill={theme.gripFill}
              stroke={theme.gripStroke}
              strokeWidth="0.8"
            />
            {/* Ergonomic probe body */}
            <rect
              x="-28"
              y="-4.5"
              width="18"
              height="9"
              rx="2"
              fill={theme.bodyFill}
              stroke={theme.bodyStroke}
              strokeWidth="0.8"
            />
            {/* Grip ridges */}
            <line x1="-24" y1="-3" x2="-24" y2="3" stroke={theme.gripStroke} strokeWidth="1" />
            <line x1="-20" y1="-3" x2="-20" y2="3" stroke={theme.gripStroke} strokeWidth="1" />
            <line x1="-16" y1="-3" x2="-16" y2="3" stroke={theme.gripStroke} strokeWidth="1" />
            {/* Finger safety barrier flange */}
            <rect
              x="-11"
              y="-6.5"
              width="2.5"
              height="13"
              rx="1"
              fill={theme.gripStroke}
              stroke={theme.bodyStroke}
              strokeWidth="0.5"
            />
            {/* Hardened probe needle shaft */}
            <line
              x1="-8.5"
              y1="0"
              x2="-2"
              y2="0"
              stroke="#cbd5e1"
              strokeWidth="2"
              strokeLinecap="round"
            />
            {/* Sharp needle tip seated into terminal jack */}
            <polygon points="-2,-1 0,0 -2,1" fill="#f8fafc" />

            {/* Terminal contact point indicator */}
            <circle
              cx="0"
              cy="0"
              r="3.5"
              fill={color === 'red' ? '#ef4444' : '#475569'}
              stroke={color === 'red' ? '#ffffff' : '#cbd5e1'}
              strokeWidth="1.5"
            />

            {/* High-visibility probe status badge + live transition callout */}
            <g transform={`translate(-10, ${theme.badgeYOffset})`}>
              <rect
                x="-2"
                y={color === 'red' ? -12 : -1}
                width={isMoving && moveLabel ? 158 : compact ? 64 : 92}
                height="18"
                rx="3.5"
                fill="#090d16"
                stroke={theme.badgeStroke}
                strokeWidth="1.2"
                opacity="0.96"
              />
              <text
                x="5"
                y={color === 'red' ? 0.5 : 11.5}
                fill={theme.badgeText}
                fontSize="8.5"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {isMoving && moveLabel
                  ? `${theme.compactTag} ${moveLabel}`
                  : compact
                  ? theme.compactTag
                  : theme.label}
              </text>
            </g>
          </g>
        </>
      )}
    </g>
  );
};
