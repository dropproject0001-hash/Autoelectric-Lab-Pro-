/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useId } from 'react';

export type LabDrawerIconName =
  | 'cabinet'
  | 'slide-out'
  | 'trouble-drawer'
  | 'tray-stack'
  | 'expand'
  | 'split-drawer'
  | 'multi-comp'
  | 'modular'
  | 'active-drawer'
  | 'server-drawer'
  | 'archive'
  | 'mini-slider'
  | 'status-ok'
  | 'status-warning'
  | 'status-fault'
  | 'status-active'
  | 'status-inactive';

export type LabDrawerIconSize = 24 | 32 | 48;

export const LAB_DRAWER_ICON_SIZES: readonly LabDrawerIconSize[] = [24, 32, 48];

export const LAB_DRAWER_ICON_ASSET_PATHS: Record<LabDrawerIconName, string> = {
  cabinet: '/assets/icons/drawers/cabinet.svg',
  'slide-out': '/assets/icons/drawers/slide-out.svg',
  'trouble-drawer': '/assets/icons/drawers/trouble-drawer.svg',
  'tray-stack': '/assets/icons/drawers/tray-stack.svg',
  expand: '/assets/icons/drawers/expand.svg',
  'split-drawer': '/assets/icons/drawers/split-drawer.svg',
  'multi-comp': '/assets/icons/drawers/multi-comp.svg',
  modular: '/assets/icons/drawers/modular.svg',
  'active-drawer': '/assets/icons/drawers/active-drawer.svg',
  'server-drawer': '/assets/icons/drawers/server-drawer.svg',
  archive: '/assets/icons/drawers/archive.svg',
  'mini-slider': '/assets/icons/drawers/mini-slider.svg',
  'status-ok': '/assets/icons/drawers/status-ok.svg',
  'status-warning': '/assets/icons/drawers/status-warning.svg',
  'status-fault': '/assets/icons/drawers/status-fault.svg',
  'status-active': '/assets/icons/drawers/status-active.svg',
  'status-inactive': '/assets/icons/drawers/status-inactive.svg',
};

export const LAB_DRAWER_ARCHETYPE_LABELS: Record<LabDrawerIconName, string> = {
  cabinet: 'Main Module Categories',
  'slide-out': 'Expandable Diagnostic Tools',
  'trouble-drawer': 'Active Fault Scenarios',
  'tray-stack': 'Grouped Diagnostic Functions',
  expand: 'Collapsible Panels',
  'split-drawer': 'Left/Right Diagnostic Sections',
  'multi-comp': 'Multiple Component Groups',
  modular: 'Independent Diagnostic Modules',
  'active-drawer': 'Currently Running Tools',
  'server-drawer': 'Stored Databases & Resources',
  archive: 'Saved Diagnostic Sessions',
  'mini-slider': 'Compact Expandable Controls',
  'status-ok': 'Nominal / OK Status',
  'status-warning': 'Warning Status',
  'status-fault': 'Fault / Critical Status',
  'status-active': 'Active / Energized Status',
  'status-inactive': 'Inactive / Standby Status',
};

export interface LabDrawerIconProps {
  name: LabDrawerIconName;
  size?: LabDrawerIconSize | number;
  className?: string;
  title?: string;
  decorative?: boolean;
}

/**
 * Shared metallic automotive SVG definitions matching AutoElectric Lab Pro's
 * brushed steel, dark graphite bezels, and controlled blue/amber/green/red accents.
 * Uses unique `useId()` prefixes so multiple instances render cleanly without ID collisions.
 */
function renderGradientDefs(uid: string) {
  return (
    <defs>
      <linearGradient id={`${uid}-steel`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#EAF3FF" />
        <stop offset="45%" stopColor="#91A4BD" />
        <stop offset="100%" stopColor="#335480" />
      </linearGradient>
      <linearGradient id={`${uid}-steel-dark`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#2D4B73" />
        <stop offset="55%" stopColor="#203653" />
        <stop offset="100%" stopColor="#0E192A" />
      </linearGradient>
      <linearGradient id={`${uid}-graphite`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#0E192A" />
        <stop offset="100%" stopColor="#050A12" />
      </linearGradient>
      <linearGradient id={`${uid}-blue`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#7AE5FF" />
        <stop offset="50%" stopColor="#19C8F5" />
        <stop offset="100%" stopColor="#1677FF" />
      </linearGradient>
      <linearGradient id={`${uid}-amber`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFE29E" />
        <stop offset="50%" stopColor="#FFB020" />
        <stop offset="100%" stopColor="#C47408" />
      </linearGradient>
      <linearGradient id={`${uid}-green`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#93F7C8" />
        <stop offset="50%" stopColor="#20D889" />
        <stop offset="100%" stopColor="#128A56" />
      </linearGradient>
      <linearGradient id={`${uid}-red`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FF9AA6" />
        <stop offset="50%" stopColor="#FF4D62" />
        <stop offset="100%" stopColor="#B82135" />
      </linearGradient>
    </defs>
  );
}

export function renderLabDrawerIconPaths(name: LabDrawerIconName, uid: string): React.ReactNode {
  const steel = `url(#${uid}-steel)`;
  const steelDark = `url(#${uid}-steel-dark)`;
  const graphite = `url(#${uid}-graphite)`;
  const blue = `url(#${uid}-blue)`;
  const amber = `url(#${uid}-amber)`;
  const green = `url(#${uid}-green)`;
  const red = `url(#${uid}-red)`;

  switch (name) {
    case 'cabinet':
      return (
        <>
          <rect x="7" y="5" width="34" height="38" rx="3" fill={steelDark} stroke={steel} strokeWidth="1.5" />
          <rect x="10" y="8" width="28" height="32" rx="1.5" fill={graphite} />
          {/* Top bay */}
          <rect x="12" y="10" width="24" height="8" rx="1.2" fill={steel} stroke="#1e293b" strokeWidth="1" />
          <rect x="19" y="13" width="10" height="2" rx="1" fill={blue} />
          <circle cx="15" cy="14" r="1.2" fill={green} />
          {/* Middle bay */}
          <rect x="12" y="20" width="24" height="8" rx="1.2" fill={steel} stroke="#1e293b" strokeWidth="1" />
          <rect x="19" y="23" width="10" height="2" rx="1" fill={amber} />
          <circle cx="15" cy="24" r="1.2" fill={amber} />
          {/* Bottom bay */}
          <rect x="12" y="30" width="24" height="8" rx="1.2" fill={steel} stroke="#1e293b" strokeWidth="1" />
          <rect x="19" y="33" width="10" height="2" rx="1" fill={blue} />
          <circle cx="15" cy="34" r="1.2" fill="#64748b" />
        </>
      );

    case 'slide-out':
      return (
        <>
          {/* Fixed cabinet spine */}
          <rect x="5" y="7" width="19" height="34" rx="2.5" fill={steelDark} stroke={steel} strokeWidth="1.4" />
          <rect x="8" y="10" width="13" height="28" rx="1" fill={graphite} />
          <rect x="10" y="12" width="9" height="6" rx="1" fill={steel} opacity="0.7" />
          <rect x="10" y="30" width="9" height="6" rx="1" fill={steel} opacity="0.7" />
          {/* Slide rail track */}
          <rect x="14" y="22.5" width="11" height="3" rx="1" fill={blue} />
          {/* Extended metallic drawer */}
          <rect x="17" y="14" width="25" height="20" rx="2" fill={steel} stroke="#0f172a" strokeWidth="1.4" />
          <rect x="19.5" y="16.5" width="20" height="15" rx="1" fill={graphite} />
          {/* Sliding chevron indicator */}
          <path d="M25 24h10m-3.5-3.5L35 24l-3.5 3.5" fill="none" stroke={blue} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="22.5" cy="24" r="1.5" fill={amber} />
        </>
      );

    case 'trouble-drawer':
      return (
        <>
          <rect x="6" y="8" width="36" height="32" rx="3" fill={steelDark} stroke={steel} strokeWidth="1.5" />
          <rect x="9" y="11" width="30" height="22" rx="1.5" fill={graphite} />
          {/* Lower drawer handle strip */}
          <rect x="12" y="35" width="24" height="3" rx="1.2" fill={red} />
          <circle cx="35.5" cy="14" r="1.6" fill={red} />
          {/* High-contrast hazard triangle */}
          <path d="M24 13.5L34.5 30.5H13.5L24 13.5Z" fill={amber} stroke={red} strokeWidth="1.5" strokeLinejoin="round" />
          <rect x="23" y="19" width="2" height="6" rx="0.9" fill="#090c11" />
          <circle cx="24" cy="27.5" r="1.2" fill="#090c11" />
        </>
      );

    case 'tray-stack':
      return (
        <>
          {/* Bottom tray */}
          <path d="M7 33h34l-3 7H10l-3-7Z" fill={steelDark} stroke={steel} strokeWidth="1.3" strokeLinejoin="round" />
          <rect x="12" y="31" width="24" height="3" rx="1" fill={graphite} />
          <circle cx="15" cy="36.5" r="1.4" fill={green} />
          {/* Middle tray */}
          <path d="M7 22h34l-3 7H10l-3-7Z" fill={steel} stroke="#1e293b" strokeWidth="1.2" strokeLinejoin="round" />
          <rect x="12" y="20" width="24" height="2.5" rx="1" fill={graphite} />
          <circle cx="15" cy="25.5" r="1.4" fill={amber} />
          <rect x="19" y="24.5" width="14" height="2" rx="1" fill={amber} />
          {/* Top tray */}
          <path d="M7 11h34l-3 7H10l-3-7Z" fill={steel} stroke="#1e293b" strokeWidth="1.2" strokeLinejoin="round" />
          <rect x="11" y="8" width="26" height="3.5" rx="1" fill={graphite} stroke={steelDark} strokeWidth="0.9" />
          <circle cx="15" cy="14.5" r="1.4" fill={blue} />
          <rect x="19" y="13.5" width="14" height="2" rx="1" fill={blue} />
        </>
      );

    case 'expand':
      return (
        <>
          <rect x="7" y="7" width="34" height="34" rx="3" fill={steelDark} stroke={steel} strokeWidth="1.5" />
          <rect x="10" y="10" width="28" height="28" rx="1.5" fill={graphite} />
          {/* Top/Bottom collapsible rails */}
          <rect x="13" y="13" width="22" height="3" rx="1" fill={steel} />
          <rect x="13" y="32" width="22" height="3" rx="1" fill={steel} />
          {/* Bidirectional expand chevrons */}
          <path d="M18 22l6-4.5 6 4.5" fill="none" stroke={blue} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M18 26l6 4.5 6-4.5" fill="none" stroke={amber} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );

    case 'split-drawer':
      return (
        <>
          <rect x="5" y="8" width="38" height="32" rx="3" fill={steelDark} stroke={steel} strokeWidth="1.5" />
          {/* Left master pane */}
          <rect x="8" y="11" width="14" height="26" rx="1.2" fill={graphite} />
          <rect x="10.5" y="14" width="9" height="2.5" rx="1" fill={amber} />
          <rect x="10.5" y="19" width="9" height="2.2" rx="1" fill="#475569" />
          <rect x="10.5" y="23.5" width="9" height="2.2" rx="1" fill="#475569" />
          <rect x="10.5" y="28" width="7" height="2.2" rx="1" fill={amber} opacity="0.8" />
          {/* Center machined divider spine */}
          <rect x="23" y="9" width="2" height="30" fill={steel} />
          {/* Right detail pane */}
          <rect x="26" y="11" width="14" height="26" rx="1.2" fill={graphite} />
          <rect x="28.5" y="14" width="9" height="4" rx="1" fill={blue} />
          <rect x="28.5" y="20.5" width="9" height="2.2" rx="1" fill={green} />
          <rect x="28.5" y="25" width="9" height="2.2" rx="1" fill={steel} opacity="0.65" />
          <rect x="28.5" y="29.5" width="6" height="2.2" rx="1" fill={steel} opacity="0.45" />
        </>
      );

    case 'multi-comp':
      return (
        <>
          <rect x="6" y="7" width="36" height="34" rx="3" fill={steelDark} stroke={steel} strokeWidth="1.5" />
          <rect x="9" y="10" width="30" height="28" rx="1.5" fill={graphite} />
          {/* Divider crosshair */}
          <line x1="24" y1="10" x2="24" y2="38" stroke="#334155" strokeWidth="1.4" />
          <line x1="9" y1="24" x2="39" y2="24" stroke="#334155" strokeWidth="1.4" />
          {/* Bay 1: ECU IC */}
          <rect x="13" y="13" width="7" height="7" rx="1" fill={steel} />
          <path d="M11.5 15h1.5m-1.5 3h1.5m7-3h1.5m-1.5 3h1.5" stroke={amber} strokeWidth="1.2" strokeLinecap="round" />
          {/* Bay 2: LED indicator */}
          <circle cx="31.5" cy="17" r="3.4" fill={green} stroke={steel} strokeWidth="1" />
          {/* Bay 3: Resistor / Fuse bank */}
          <rect x="12" y="29" width="9" height="4" rx="1" fill={amber} stroke={steel} strokeWidth="0.9" />
          <line x1="15" y1="29" x2="15" y2="33" stroke="#090c11" strokeWidth="1.1" />
          <line x1="18" y1="29" x2="18" y2="33" stroke="#090c11" strokeWidth="1.1" />
          {/* Bay 4: Relay / Cap */}
          <rect x="28" y="27.5" width="7" height="7" rx="1.2" fill={blue} stroke={steel} strokeWidth="1" />
          <circle cx="31.5" cy="31" r="1.4" fill="#090c11" />
        </>
      );

    case 'modular':
      return (
        <>
          {/* Left docked module */}
          <rect x="6" y="12" width="16" height="26" rx="2" fill={steelDark} stroke={steel} strokeWidth="1.4" />
          <rect x="8.5" y="15" width="11" height="16" rx="1" fill={graphite} />
          <circle cx="14" cy="19" r="2" fill={green} />
          <rect x="10.5" y="24" width="7" height="2" rx="1" fill={steel} />
          {/* Upper-right snap-in module */}
          <rect x="26" y="7" width="16" height="17" rx="2" fill={steel} stroke="#0f172a" strokeWidth="1.3" />
          <rect x="28.5" y="9.5" width="11" height="9" rx="1" fill={graphite} />
          <circle cx="34" cy="14" r="2" fill={amber} />
          {/* Bottom-right base module */}
          <rect x="26" y="27" width="16" height="14" rx="2" fill={steelDark} stroke={steel} strokeWidth="1.4" />
          <rect x="29" y="31" width="10" height="4" rx="1" fill={blue} />
          {/* Edge bus connectors */}
          <rect x="22" y="17" width="4" height="3" rx="0.5" fill={amber} />
          <rect x="22" y="32" width="4" height="3" rx="0.5" fill={blue} />
        </>
      );

    case 'active-drawer':
      return (
        <>
          <rect x="6" y="8" width="36" height="32" rx="3" fill={steelDark} stroke={steel} strokeWidth="1.5" />
          <rect x="9" y="11" width="30" height="21" rx="1.5" fill={graphite} stroke={green} strokeWidth="0.9" />
          {/* Live phosphor waveform */}
          <path
            d="M11 22h4l2.2-6 3.2 11 3.4-9 2.6 5.5 2.1-3.5h8.5"
            fill="none"
            stroke={green}
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Energized handle & run LED */}
          <rect x="15" y="34.5" width="18" height="2.8" rx="1.2" fill={steel} />
          <circle cx="36" cy="14" r="1.8" fill={green} />
        </>
      );

    case 'server-drawer':
      return (
        <>
          <rect x="7" y="6" width="34" height="36" rx="3" fill={steelDark} stroke={steel} strokeWidth="1.5" />
          {/* Blade 1 */}
          <rect x="10" y="9" width="28" height="8" rx="1.2" fill={graphite} stroke="#475569" strokeWidth="1" />
          <rect x="12.5" y="12" width="11" height="2" rx="1" fill={steel} />
          <circle cx="31" cy="13" r="1.5" fill={blue} />
          <circle cx="35" cy="13" r="1.5" fill={green} />
          {/* Blade 2 */}
          <rect x="10" y="20" width="28" height="8" rx="1.2" fill={graphite} stroke="#475569" strokeWidth="1" />
          <rect x="12.5" y="23" width="11" height="2" rx="1" fill={steel} />
          <circle cx="31" cy="24" r="1.5" fill={blue} />
          <circle cx="35" cy="24" r="1.5" fill={amber} />
          {/* Blade 3 */}
          <rect x="10" y="31" width="28" height="8" rx="1.2" fill={graphite} stroke="#475569" strokeWidth="1" />
          <rect x="12.5" y="34" width="11" height="2" rx="1" fill={steel} />
          <circle cx="31" cy="35" r="1.5" fill={green} />
          <circle cx="35" cy="35" r="1.5" fill={blue} />
        </>
      );

    case 'archive':
      return (
        <>
          {/* Folder tabs tucked inside open drawer */}
          <path d="M11 16V10a1.5 1.5 0 0 1 1.5-1.5h8l2.5 2.5h14a1.5 1.5 0 0 1 1.5 1.5V16Z" fill={amber} opacity="0.92" />
          <path d="M9.5 18V13a1.5 1.5 0 0 1 1.5-1.5h26a1.5 1.5 0 0 1 1.5 1.5v5Z" fill={blue} opacity="0.92" />
          {/* Metallic archival drawer chassis */}
          <rect x="6" y="16" width="36" height="25" rx="3" fill={steelDark} stroke={steel} strokeWidth="1.5" />
          <rect x="9.5" y="19.5" width="29" height="18" rx="1.5" fill={graphite} />
          {/* Label nameplate & pull clasp */}
          <rect x="15" y="24" width="18" height="6" rx="1.2" fill={steel} />
          <rect x="19" y="26" width="10" height="2" rx="0.8" fill={amber} />
        </>
      );

    case 'mini-slider':
      return (
        <>
          <rect x="6" y="8" width="36" height="32" rx="3" fill={steelDark} stroke={steel} strokeWidth="1.5" />
          <rect x="9" y="11" width="30" height="26" rx="1.5" fill={graphite} />
          {/* Track 1 */}
          <line x1="13" y1="16.5" x2="35" y2="16.5" stroke="#334155" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="13" y1="16.5" x2="29" y2="16.5" stroke={blue} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="29" cy="16.5" r="3" fill={steel} stroke="#0f172a" strokeWidth="1" />
          <circle cx="29" cy="16.5" r="1.2" fill={blue} />
          {/* Track 2 */}
          <line x1="13" y1="24" x2="35" y2="24" stroke="#334155" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="13" y1="24" x2="20" y2="24" stroke={amber} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="20" cy="24" r="3" fill={steel} stroke="#0f172a" strokeWidth="1" />
          <circle cx="20" cy="24" r="1.2" fill={amber} />
          {/* Track 3 */}
          <line x1="13" y1="31.5" x2="35" y2="31.5" stroke="#334155" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="13" y1="31.5" x2="26" y2="31.5" stroke={blue} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="26" cy="31.5" r="3" fill={steel} stroke="#0f172a" strokeWidth="1" />
          <circle cx="26" cy="31.5" r="1.2" fill={blue} />
        </>
      );

    case 'status-ok':
      return (
        <>
          <circle cx="24" cy="24" r="18" fill={steelDark} stroke={steel} strokeWidth="1.6" />
          <circle cx="24" cy="24" r="13" fill={graphite} />
          <circle cx="24" cy="24" r="10.5" fill={green} />
          <ellipse cx="20.5" cy="19.5" rx="4" ry="2.4" transform="rotate(-25 20.5 19.5)" fill="#ffffff" opacity="0.65" />
        </>
      );

    case 'status-warning':
      return (
        <>
          <circle cx="24" cy="24" r="18" fill={steelDark} stroke={steel} strokeWidth="1.6" />
          <circle cx="24" cy="24" r="13" fill={graphite} />
          <circle cx="24" cy="24" r="10.5" fill={amber} />
          <ellipse cx="20.5" cy="19.5" rx="4" ry="2.4" transform="rotate(-25 20.5 19.5)" fill="#ffffff" opacity="0.65" />
        </>
      );

    case 'status-fault':
      return (
        <>
          <circle cx="24" cy="24" r="18" fill={steelDark} stroke={steel} strokeWidth="1.6" />
          <circle cx="24" cy="24" r="13" fill={graphite} />
          <circle cx="24" cy="24" r="10.5" fill={red} />
          <ellipse cx="20.5" cy="19.5" rx="4" ry="2.4" transform="rotate(-25 20.5 19.5)" fill="#ffffff" opacity="0.6" />
        </>
      );

    case 'status-active':
      return (
        <>
          <circle cx="24" cy="24" r="18" fill={steelDark} stroke={steel} strokeWidth="1.6" />
          <circle cx="24" cy="24" r="13" fill={graphite} />
          <circle cx="24" cy="24" r="10.5" fill={blue} />
          <ellipse cx="20.5" cy="19.5" rx="4" ry="2.4" transform="rotate(-25 20.5 19.5)" fill="#ffffff" opacity="0.65" />
        </>
      );

    case 'status-inactive':
      return (
        <>
          <circle cx="24" cy="24" r="18" fill={steelDark} stroke={steel} strokeWidth="1.6" />
          <circle cx="24" cy="24" r="13" fill={graphite} />
          <circle cx="24" cy="24" r="10.5" fill={steel} opacity="0.55" />
          <ellipse cx="20.5" cy="19.5" rx="4" ry="2.4" transform="rotate(-25 20.5 19.5)" fill="#ffffff" opacity="0.35" />
        </>
      );
  }
}

export const LabDrawerIcon: React.FC<LabDrawerIconProps> = React.memo(
  ({ name, size = 24, className = '', title, decorative = true }) => {
    const rawId = useId();
    const uid = `ldi-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 inline-block ${className}`}
        aria-hidden={decorative && !title ? true : undefined}
        role={title ? 'img' : undefined}
        aria-label={title}
      >
        {title ? <title>{title}</title> : null}
        {renderGradientDefs(uid)}
        {renderLabDrawerIconPaths(name, uid)}
      </svg>
    );
  }
);
