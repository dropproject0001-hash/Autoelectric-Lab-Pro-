/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useId } from 'react';
import {
  APP_ACADEMY_BANNER_SRC,
  APP_STUDIO_CARDS_SHEET_SRC,
  RAMTI_SUBTITLE_LINES,
  RAMTI_TRADEMARK_WORDMARK,
} from '../../constants/branding';

export type RamtiModuleIconName =
  | 'home'
  | 'dashboard'
  | 'diagnostics'
  | 'wiring_schematics'
  | 'ecu_flashing'
  | 'settings'
  | 'user_profile'
  | 'notifications'
  | 'help_support'
  | 'multimeter'
  | 'oscilloscope'
  | 'power_supply'
  | 'file_manager'
  | 'security_settings'
  | 'cloud_sync'
  | 'academy_lab'
  | 'scenario_lookup'
  | 'ai_diagnostic_studio'
  | 'bench_fault_isolation'
  | 'harness_ecu_pinouts'
  | 'pcb_scanners';

export const RAMTI_CORE_AND_HARDWARE_ICONS: ReadonlyArray<{
  id: RamtiModuleIconName;
  label: string;
  category: 'CORE_NAV' | 'STUDIO' | 'HARDWARE_TOOL';
  subtitle: string;
}> = [
  { id: 'home', label: 'Home', category: 'CORE_NAV', subtitle: 'Workbench Hub' },
  { id: 'dashboard', label: 'Dashboard', category: 'CORE_NAV', subtitle: 'Live Telemetry' },
  { id: 'diagnostics', label: 'Diagnostics', category: 'CORE_NAV', subtitle: 'Fault Isolation' },
  {
    id: 'wiring_schematics',
    label: 'Wiring Schematics',
    category: 'CORE_NAV',
    subtitle: 'Harness Topology',
  },
  { id: 'ecu_flashing', label: 'ECU Flashing', category: 'CORE_NAV', subtitle: 'ROM & Calibration' },
  { id: 'settings', label: 'Settings', category: 'CORE_NAV', subtitle: 'Bench Config' },
  { id: 'user_profile', label: 'User Profile', category: 'CORE_NAV', subtitle: 'Technician ID' },
  { id: 'notifications', label: 'Notifications', category: 'CORE_NAV', subtitle: 'Circuit Alerts' },
  { id: 'help_support', label: 'Help / Support', category: 'CORE_NAV', subtitle: 'Guided Manuals' },
  { id: 'multimeter', label: 'Multimeter', category: 'HARDWARE_TOOL', subtitle: 'True-RMS DMM' },
  { id: 'oscilloscope', label: 'Oscilloscope', category: 'HARDWARE_TOOL', subtitle: 'Dual-Trace 20MHz' },
  { id: 'power_supply', label: 'Power Supply', category: 'HARDWARE_TOOL', subtitle: '0–30V KL30/KL15' },
  { id: 'file_manager', label: 'File Manager', category: 'HARDWARE_TOOL', subtitle: 'Logs & Exports' },
  {
    id: 'security_settings',
    label: 'Security Settings',
    category: 'HARDWARE_TOOL',
    subtitle: '8-Digit PIN Gate',
  },
  { id: 'cloud_sync', label: 'Cloud Sync', category: 'HARDWARE_TOOL', subtitle: 'Firestore & Drive' },
  {
    id: 'academy_lab',
    label: 'Academy Lab',
    category: 'STUDIO',
    subtitle: 'Course Modules & Certification',
  },
  {
    id: 'scenario_lookup',
    label: 'Scenario Lookup',
    category: 'STUDIO',
    subtitle: 'Search Fault Data',
  },
  {
    id: 'ai_diagnostic_studio',
    label: 'AI Diagnostic Studio',
    category: 'STUDIO',
    subtitle: 'Signal Analysis',
  },
  {
    id: 'bench_fault_isolation',
    label: 'Bench Fault Isolation',
    category: 'HARDWARE_TOOL',
    subtitle: 'Macro Library',
  },
  {
    id: 'harness_ecu_pinouts',
    label: 'Harness ECU Pinouts',
    category: 'HARDWARE_TOOL',
    subtitle: 'Connector Views',
  },
  {
    id: 'pcb_scanners',
    label: 'PCB Scanners',
    category: 'HARDWARE_TOOL',
    subtitle: 'Board Inspection',
  },
] as const;

export interface RamtiVectorEmblemProps {
  size?: number;
  variant?: 'flat-white' | 'high-flat' | 'cyan-circuit';
  showWordmark?: boolean;
  showSubtitle?: boolean;
  compactSubtitle?: boolean;
  className?: string;
}

/**
 * Primary Flat-Vector White-on-Dark RAMTi Trademark Emblem
 * Combines the geometric ram's head, the letter 'R', and the upward 45° innovation arrow,
 * with pixel-perfect centered "Ruben AutoMotive / Modern Technology / Innovation" typography
 * and generous breathing room below.
 */
export const RamtiVectorEmblem: React.FC<RamtiVectorEmblemProps> = React.memo(
  ({
    size = 48,
    variant = 'flat-white',
    showWordmark = false,
    showSubtitle = false,
    compactSubtitle = false,
    className = '',
  }) => {
    const rawId = useId();
    const uid = `ramti-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

    const primaryFill =
      variant === 'flat-white'
        ? '#EAF3FF'
        : variant === 'high-flat'
          ? `url(#${uid}-silver)`
          : `url(#${uid}-cyan-silver)`;
    const secondaryFill = variant === 'flat-white' ? '#BCCDEF' : '#91A4BD';
    const traceStroke = variant === 'cyan-circuit' ? '#19C8F5' : '#08111E';

    return (
      <div
        data-testid="ramti-vector-emblem"
        className={`inline-flex flex-col items-center justify-center text-center select-none ${
          showSubtitle ? (compactSubtitle ? 'pb-2' : 'pb-4') : ''
        } ${className}`}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="RAMTi Trademark Emblem — Ram Head, Letter R, and Upward Innovation Arrow"
          className="shrink-0"
        >
          <defs>
            <linearGradient id={`${uid}-silver`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="55%" stopColor="#BCCDEF" />
              <stop offset="100%" stopColor="#7C93B6" />
            </linearGradient>
            <linearGradient id={`${uid}-cyan-silver`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="60%" stopColor="#BCCDEF" />
              <stop offset="100%" stopColor="#19C8F5" />
            </linearGradient>
          </defs>

          {/* Outer swept Ram Horn Crown curving top-left to upper-right */}
          <path
            d="M26 50 C25 27, 48 13, 76 16 C64 21, 51 24, 42 35 C35 43, 31 48, 26 50 Z"
            fill={primaryFill}
          />
          <path
            d="M36 44 C43 26, 62 20, 84 23 C73 27, 58 31, 49 42 Z"
            fill={secondaryFill}
          />

          {/* Geometric Angular Ram Head Profile (Left Facets) */}
          <path
            d="M28 45 L44 37 L53 43 L45 55 L34 61 L23 73 L17 65 L22 51 Z"
            fill={primaryFill}
          />
          {/* Ram Eye & Cheek Cutout */}
          <path d="M35 48 L43 45 L40 51 L33 52 Z" fill="#060B14" />
          {/* Ram Jaw / Chin Facet */}
          <path d="M25 74 L39 63 L48 66 L36 81 L26 80 Z" fill={secondaryFill} />

          {/* Bold Letter 'R' Left Stem & Lower Right Leg */}
          <path
            d="M32 103 L52 64 L64 64 L46 103 Z"
            fill={primaryFill}
          />
          {/* Letter 'R' Upper Loop & Bowl */}
          <path
            d="M57 38 C76 36, 91 44, 89 59 C87 70, 76 76, 63 78 L56 71 C67 70, 76 65, 77 58 C78 50, 70 45, 55 46 Z"
            fill={secondaryFill}
          />
          {/* Letter 'R' Diagonal Kick Leg */}
          <path
            d="M56 73 L71 71 L101 103 L82 103 L55 77 Z"
            fill={primaryFill}
          />

          {/* 45-Degree Upward Innovation Arrow slicing cleanly through the R */}
          <path
            d="M44 96 L64 60 L92 31 L84 26 L110 17 L101 43 L94 37 L69 64 L52 96 Z"
            fill={primaryFill}
          />

          {/* Precision Flat-Vector Circuit Traces inside the Emblem */}
          <path
            d="M39 93 L54 66 L82 38 M65 78 L87 99"
            stroke={traceStroke}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="54" cy="66" r="2.2" fill={variant === 'cyan-circuit' ? '#19C8F5' : '#EAF3FF'} />
          <circle cx="82" cy="38" r="2.2" fill={variant === 'cyan-circuit' ? '#19C8F5' : '#EAF3FF'} />
        </svg>

        {showWordmark && (
          <div
            className="mt-1.5 font-hud font-extrabold uppercase tracking-[0.22em] text-[#EAF3FF] leading-none"
            style={{ fontSize: Math.max(13, Math.round(size * 0.34)) }}
          >
            {RAMTI_TRADEMARK_WORDMARK}
          </div>
        )}

        {showSubtitle && (
          <div
            data-testid="ramti-centered-subtitle"
            className={`mt-1.5 flex flex-col items-center justify-center text-center font-body tracking-[0.12em] text-[#BCCDEF] ${
              compactSubtitle ? 'text-[9.5px] leading-[1.35]' : 'text-[11px] sm:text-[12px] leading-[1.42]'
            }`}
          >
            {RAMTI_SUBTITLE_LINES.map((line) => (
              <span key={line} className="block font-medium">
                {line}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
);

export interface RamtiModuleIconProps {
  name: RamtiModuleIconName;
  size?: number;
  active?: boolean;
  className?: string;
}

/**
 * 15 Core/Hardware & 6 Studio Flat-Vector White-on-Dark Icons
 * Strictly 1px–1.75px crisp geometric vector strokes matching the RAMTi Branding Guide.
 */
export const RamtiModuleIcon: React.FC<RamtiModuleIconProps> = React.memo(
  ({ name, size = 24, active = false, className = '' }) => {
    const strokeMain = active ? '#19C8F5' : '#EAF3FF';
    const strokeAccent = active ? '#7AE5FF' : '#19C8F5';
    const fillSubtle = active ? 'rgba(25,200,245,0.16)' : 'rgba(188,205,239,0.08)';

    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={`shrink-0 inline-block ${className}`}
      >
        {name === 'home' && (
          <>
            <path
              d="M4 15L16 5L28 15V27H20V20H12V27H4V15Z"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M16 18V11M16 11L13 14M16 11L19 14"
              stroke={strokeAccent}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="9" cy="22" r="1" fill={strokeAccent} />
            <circle cx="23" cy="22" r="1" fill={strokeAccent} />
          </>
        )}

        {name === 'dashboard' && (
          <>
            <path
              d="M5 23A12 12 0 1 1 27 23H5Z"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M16 19L22 12"
              stroke={strokeAccent}
              strokeWidth="1.9"
              strokeLinecap="round"
            />
            <circle cx="16" cy="19" r="2" fill={strokeMain} />
            <path
              d="M9 19H11M16 10V12M23 19H21"
              stroke={strokeAccent}
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </>
        )}

        {name === 'diagnostics' && (
          <>
            {/* Crossed Diagnostic Wrenches + Circuit Nodes */}
            <path
              d="M7 10A4 4 0 0 1 12 15L22 25A2 2 0 0 1 19 28L9 18A4 4 0 0 1 4 13L7 15L9 13L7 10Z"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M25 10A4 4 0 0 0 20 15L10 25A2 2 0 0 0 13 28L23 18A4 4 0 0 0 28 13L25 15L23 13L25 10Z"
              stroke={strokeAccent}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx="16" cy="6" r="1.4" fill={strokeAccent} />
            <circle cx="6" cy="23" r="1.4" fill={strokeAccent} />
            <circle cx="26" cy="23" r="1.4" fill={strokeAccent} />
          </>
        )}

        {name === 'wiring_schematics' && (
          <>
            {/* Multi-branch automotive wiring loom */}
            <rect x="13" y="4" width="6" height="4" rx="1" stroke={strokeMain} strokeWidth="1.5" />
            <rect x="4" y="13" width="4" height="6" rx="1" stroke={strokeMain} strokeWidth="1.5" />
            <rect x="24" y="13" width="4" height="6" rx="1" stroke={strokeMain} strokeWidth="1.5" />
            <path
              d="M15 8V27M17 8V27M8 15H12L14 19V27M24 15H20L18 19V27"
              stroke={strokeAccent}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}

        {name === 'ecu_flashing' && (
          <>
            <rect
              x="8"
              y="8"
              width="16"
              height="16"
              rx="2.5"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.6"
            />
            <path
              d="M11 4V8M16 4V8M21 4V8M11 24V28M16 24V28M21 24V28M4 11H8M4 16H8M4 21H8M24 11H28M24 16H28"
              stroke={strokeMain}
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <path
              d="M24 23V18M24 18L21.5 20.5M24 18L26.5 20.5"
              stroke={strokeAccent}
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <text
              x="16"
              y="17.5"
              textAnchor="middle"
              fill={strokeAccent}
              fontSize="6"
              fontWeight="700"
              fontFamily="JetBrains Mono, monospace"
            >
              ECU
            </text>
          </>
        )}

        {name === 'settings' && (
          <>
            <circle
              cx="16"
              cy="16"
              r="9.5"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.6"
              strokeDasharray="4 2.2"
            />
            <circle cx="16" cy="16" r="4.5" stroke={strokeMain} strokeWidth="1.5" />
            <path
              d="M10 22L21 11M21 11H16.5M21 11V15.5"
              stroke={strokeAccent}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}

        {name === 'user_profile' && (
          <>
            <circle cx="16" cy="10" r="5" fill={fillSubtle} stroke={strokeMain} strokeWidth="1.6" />
            <path
              d="M6 27C6 21.5 10.2 18 16 18C21.8 18 26 21.5 26 27"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M16 18V26M12 22L16 20L20 22"
              stroke={strokeAccent}
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </>
        )}

        {name === 'notifications' && (
          <>
            <path
              d="M16 5C11.5 5 8 8.5 8 13V19L5.5 22H26.5L24 19V13C24 8.5 20.5 5 16 5Z"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M13.5 25A2.5 2.5 0 0 0 18.5 25" stroke={strokeMain} strokeWidth="1.6" />
            <circle cx="22" cy="9" r="3" fill="#060B14" stroke={strokeAccent} strokeWidth="1.5" />
          </>
        )}

        {name === 'help_support' && (
          <>
            <path
              d="M6 17V15A10 10 0 0 1 26 15V17"
              stroke={strokeMain}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <rect x="4" y="16" width="4" height="7" rx="1.5" stroke={strokeMain} strokeWidth="1.5" />
            <rect x="24" y="16" width="4" height="7" rx="1.5" stroke={strokeMain} strokeWidth="1.5" />
            <path
              d="M13.5 13C13.5 11.3 14.8 10 16.5 10C18.1 10 19.3 11.2 19.3 12.7C19.3 14.6 16.5 15.2 16.5 17.5"
              stroke={strokeAccent}
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <circle cx="16.5" cy="21" r="1.2" fill={strokeAccent} />
          </>
        )}

        {name === 'multimeter' && (
          <>
            <rect
              x="10"
              y="5"
              width="16"
              height="22"
              rx="2.5"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.6"
            />
            <rect x="13" y="8" width="10" height="5" rx="1" stroke={strokeAccent} strokeWidth="1.3" />
            <circle cx="18" cy="19.5" r="4" stroke={strokeMain} strokeWidth="1.4" />
            <path d="M16 21.5L20 17.5" stroke={strokeAccent} strokeWidth="1.6" strokeLinecap="round" />
            <path d="M6 7V19C6 23 8 25 10 25" stroke={strokeAccent} strokeWidth="1.5" strokeLinecap="round" />
          </>
        )}

        {name === 'oscilloscope' && (
          <>
            <rect
              x="4"
              y="7"
              width="24"
              height="18"
              rx="2.5"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.6"
            />
            <path
              d="M7 16H10L12 11L15 21L18 12L20 16H22"
              stroke={strokeAccent}
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="25" cy="11.5" r="1" fill={strokeMain} />
            <circle cx="25" cy="15.5" r="1" fill={strokeMain} />
            <circle cx="25" cy="19.5" r="1" fill={strokeAccent} />
          </>
        )}

        {name === 'power_supply' && (
          <>
            <path
              d="M7 9V14H13V9M8.5 5V9M11.5 5V9M10 14V23C10 25.5 12 27 14.5 27H17"
              stroke={strokeMain}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx="21.5"
              cy="16.5"
              r="6.5"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.6"
            />
            <path
              d="M22.2 12L18.8 16.8H21.8L20.8 21L24.2 16.2H21.2L22.2 12Z"
              fill={strokeAccent}
            />
          </>
        )}

        {name === 'file_manager' && (
          <>
            <path
              d="M4 9C4 7.9 4.9 7 6 7H12L14.5 9.5H24C25.1 9.5 26 10.4 26 11.5V23C26 24.1 25.1 25 24 25H6C4.9 25 4 24.1 4 23V9Z"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <ellipse cx="23" cy="19" rx="4.5" ry="2" fill="#060B14" stroke={strokeAccent} strokeWidth="1.4" />
            <path
              d="M18.5 19V24C18.5 25.1 20.5 26 23 26C25.5 26 27.5 25.1 27.5 24V19"
              fill="#060B14"
              stroke={strokeAccent}
              strokeWidth="1.4"
            />
          </>
        )}

        {name === 'security_settings' && (
          <>
            <rect
              x="9"
              y="14"
              width="14"
              height="12"
              rx="2"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.6"
            />
            <path
              d="M12 14V10C12 7.8 13.8 6 16 6C18.2 6 20 7.8 20 10V14"
              stroke={strokeMain}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="16" cy="19" r="1.6" fill={strokeAccent} />
            <path
              d="M16 20.5V23M5 17H9M5 22H9M23 17H27M23 22H27"
              stroke={strokeAccent}
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </>
        )}

        {name === 'cloud_sync' && (
          <>
            <path
              d="M9.5 22H22.5A4.5 4.5 0 0 0 23.2 13.1A6.5 6.5 0 0 0 10.6 11.5A4.8 4.8 0 0 0 9.5 22Z"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M16 14V26M12.5 17V25M19.5 17V25"
              stroke={strokeAccent}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="16" cy="27" r="1.3" fill={strokeAccent} />
            <circle cx="12.5" cy="26" r="1.2" fill={strokeMain} />
            <circle cx="19.5" cy="26" r="1.2" fill={strokeMain} />
          </>
        )}

        {name === 'academy_lab' && (
          <>
            <path
              d="M16 5L4 10.5L16 16L28 10.5L16 5Z"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M8 13.5V21.5C8 23.5 11.5 25.5 16 25.5C20.5 25.5 24 23.5 24 21.5V13.5M27 11V19"
              stroke={strokeAccent}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </>
        )}

        {name === 'scenario_lookup' && (
          <>
            <rect
              x="4"
              y="6"
              width="19"
              height="19"
              rx="2"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.5"
            />
            <circle cx="17.5" cy="17.5" r="5.5" fill="#060B14" stroke={strokeAccent} strokeWidth="1.7" />
            <path d="M21.5 21.5L27 27" stroke={strokeAccent} strokeWidth="2" strokeLinecap="round" />
            <path d="M7.5 11H13M7.5 15H11" stroke={strokeMain} strokeWidth="1.4" strokeLinecap="round" />
          </>
        )}

        {name === 'ai_diagnostic_studio' && (
          <>
            <rect
              x="4"
              y="6"
              width="24"
              height="20"
              rx="2.5"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.6"
            />
            <path
              d="M7 16C9 10, 11 10, 13 16C15 22, 17 22, 19 16C20.5 11.5, 22.5 11.5, 25 16"
              stroke={strokeAccent}
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </>
        )}

        {name === 'bench_fault_isolation' && (
          <>
            <rect
              x="5"
              y="5"
              width="22"
              height="22"
              rx="2.5"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.6"
            />
            <path
              d="M11 10H21V22H11V10Z"
              stroke={strokeAccent}
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <circle cx="16" cy="15.5" r="2.5" stroke={strokeMain} strokeWidth="1.4" />
            <path d="M5 12H9M5 19H9M23 12H27M23 19H27" stroke={strokeAccent} strokeWidth="1.3" />
          </>
        )}

        {name === 'harness_ecu_pinouts' && (
          <>
            <rect
              x="5"
              y="7"
              width="6"
              height="18"
              rx="1"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.5"
            />
            <rect
              x="21"
              y="10"
              width="7"
              height="12"
              rx="1.5"
              fill={fillSubtle}
              stroke={strokeAccent}
              strokeWidth="1.5"
            />
            <path
              d="M11 11H21M11 16H21M11 21H21"
              stroke={strokeAccent}
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </>
        )}

        {name === 'pcb_scanners' && (
          <>
            <rect
              x="4"
              y="7"
              width="22"
              height="17"
              rx="2"
              fill={fillSubtle}
              stroke={strokeMain}
              strokeWidth="1.5"
            />
            <rect x="8" y="11" width="5" height="5" stroke={strokeMain} strokeWidth="1.3" />
            <circle cx="21" cy="19" r="5" fill="#060B14" stroke={strokeAccent} strokeWidth="1.6" />
            <path d="M24.5 22.5L28 26" stroke={strokeAccent} strokeWidth="1.9" strokeLinecap="round" />
          </>
        )}
      </svg>
    );
  }
);

export type RamtiStudioType =
  | 'academy_lab'
  | 'scenario_lookup'
  | 'ai_diagnostic_studio'
  | 'bench_fault_isolation'
  | 'harness_ecu_pinouts'
  | 'pcb_scanners';

export interface RamtiStudioVisualCardProps {
  studio: RamtiStudioType;
  onClick?: () => void;
  compact?: boolean;
  isActive?: boolean;
  metaBadge?: string;
}

const STUDIO_METADATA: Record<
  RamtiStudioType,
  {
    title: string;
    subtitle: string;
    badge: string;
    bannerType: 'academy' | 'cards';
  }
> = {
  academy_lab: {
    title: 'Academy Lab',
    subtitle: 'Course Modules · Simulations · Certification',
    badge: '3 TIERS',
    bannerType: 'academy',
  },
  scenario_lookup: {
    title: 'Scenario Lookup',
    subtitle: 'SEARCH FAULT DATA',
    badge: '2,080 DTCs',
    bannerType: 'cards',
  },
  ai_diagnostic_studio: {
    title: 'AI Diagnostic Studio',
    subtitle: 'SIGNAL ANALYSIS & AI PROCESSING',
    badge: 'OMNI AI',
    bannerType: 'cards',
  },
  bench_fault_isolation: {
    title: 'Bench Fault Isolation',
    subtitle: 'Macro Library & Test Points',
    badge: 'MACROS',
    bannerType: 'cards',
  },
  harness_ecu_pinouts: {
    title: 'Harness ECU Pinouts',
    subtitle: 'CONNECTOR VIEWS',
    badge: 'OEM PINS',
    bannerType: 'cards',
  },
  pcb_scanners: {
    title: 'PCB Scanners',
    subtitle: 'BOARD INSPECTION',
    badge: 'OPTICAL',
    bannerType: 'cards',
  },
};

/**
 * Branded RAMTi Studio & Tool Visual Card matching the uploaded Studio & Academy reference cards.
 */
export const RamtiStudioVisualCard: React.FC<RamtiStudioVisualCardProps> = React.memo(
  ({ studio, onClick, compact = false, isActive = false, metaBadge }) => {
    const info = STUDIO_METADATA[studio];
    const bgSrc =
      info.bannerType === 'academy' ? APP_ACADEMY_BANNER_SRC : APP_STUDIO_CARDS_SHEET_SRC;

    return (
      <button
        type="button"
        onClick={onClick}
        data-testid={`ramti-studio-card-${studio}`}
        className={`group relative w-full overflow-hidden rounded-xl border text-left transition-all cursor-pointer ${
          isActive
            ? 'border-[#19C8F5] bg-[#0E2238]/90 shadow-[0_0_20px_rgba(25,200,245,0.25)]'
            : 'border-[#203653] bg-[#08101D]/90 hover:border-[#19C8F5]/70 hover:bg-[#0D1A2D]'
        } ${compact ? 'p-2.5' : 'p-3.5'}`}
      >
        {/* Subtle Reference Asset Backdrop */}
        <img
          src={bgSrc}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-15 mix-blend-screen transition-opacity group-hover:opacity-25"
        />

        <div className="relative z-10 flex flex-col gap-2">
          {/* Top RAMTi Brand Strip */}
          <div className="flex items-center justify-between gap-2 border-b border-[#203653]/80 pb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <RamtiVectorEmblem size={18} variant="flat-white" />
              <span className="font-hud text-[11px] font-extrabold tracking-[0.18em] text-[#EAF3FF]">
                RAMTi
              </span>
              <span className="hidden sm:inline truncate font-body text-[9px] text-[#91A4BD]">
                Ruben AutoMotive · Modern Technology · Innovation
              </span>
            </div>
            <span className="shrink-0 rounded border border-[#19C8F5]/40 bg-[#050A12]/90 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-[#19C8F5]">
              {metaBadge || info.badge}
            </span>
          </div>

          {/* Schematic Vector Artwork Viewport */}
          <div className="relative flex items-center justify-between gap-3 rounded-lg border border-[#203653]/70 bg-[#040912]/85 px-3 py-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#19C8F5]/40 bg-[#0A1424] text-[#EAF3FF] group-hover:border-[#19C8F5]">
                <RamtiModuleIcon name={studio} size={22} active={isActive} />
              </div>
              <div className="min-w-0">
                <div className="truncate font-hud text-[14px] font-bold text-[#EAF3FF] group-hover:text-white">
                  {info.title}
                </div>
                <div className="truncate font-mono text-[10px] uppercase tracking-wider text-[#19C8F5]">
                  {info.subtitle}
                </div>
              </div>
            </div>

            {/* Studio-Specific Mini Flat-Vector Graphic */}
            <svg
              width="58"
              height="28"
              viewBox="0 0 58 28"
              fill="none"
              aria-hidden="true"
              className="shrink-0 opacity-85 group-hover:opacity-100"
            >
              {studio === 'academy_lab' && (
                <>
                  <path d="M12 6L4 10L12 14L20 10L12 6Z" stroke="#EAF3FF" strokeWidth="1.3" />
                  <rect x="26" y="6" width="12" height="16" rx="1.5" stroke="#19C8F5" strokeWidth="1.3" />
                  <path d="M28 12L31 9L34 15L36 12" stroke="#EAF3FF" strokeWidth="1.2" />
                  <rect x="42" y="7" width="13" height="11" rx="1.5" stroke="#EAF3FF" strokeWidth="1.3" />
                </>
              )}
              {studio === 'scenario_lookup' && (
                <>
                  <rect x="2" y="4" width="34" height="20" rx="2" stroke="#91A4BD" strokeWidth="1.1" />
                  <text x="6" y="13" fill="#EAF3FF" fontSize="6" fontFamily="JetBrains Mono, monospace">
                    P0301
                  </text>
                  <text x="6" y="20" fill="#19C8F5" fontSize="6" fontFamily="JetBrains Mono, monospace">
                    P0302
                  </text>
                  <circle cx="44" cy="13" r="6" stroke="#EAF3FF" strokeWidth="1.6" />
                  <path d="M48.5 17.5L54 23" stroke="#19C8F5" strokeWidth="2" strokeLinecap="round" />
                </>
              )}
              {studio === 'ai_diagnostic_studio' && (
                <>
                  <path
                    d="M3 14C7 4, 11 4, 15 14C19 24, 23 24, 27 14C31 4, 35 4, 39 14"
                    stroke="#19C8F5"
                    strokeWidth="1.5"
                  />
                  <path d="M43 20L46 10L49 18L52 8L55 19" stroke="#EAF3FF" strokeWidth="1.2" />
                </>
              )}
              {studio === 'bench_fault_isolation' && (
                <>
                  <path d="M4 8H18V20H4V8Z" stroke="#91A4BD" strokeWidth="1.1" />
                  <path d="M8 14H14M11 11V17" stroke="#19C8F5" strokeWidth="1.3" />
                  <rect x="23" y="6" width="14" height="16" rx="1.5" stroke="#EAF3FF" strokeWidth="1.4" />
                  <circle cx="48" cy="14" r="4" stroke="#19C8F5" strokeWidth="1.3" />
                </>
              )}
              {studio === 'harness_ecu_pinouts' && (
                <>
                  <rect x="4" y="4" width="8" height="20" stroke="#EAF3FF" strokeWidth="1.3" />
                  <path d="M12 9H36M12 14H36M12 19H36" stroke="#19C8F5" strokeWidth="1.3" />
                  <rect x="36" y="7" width="18" height="14" rx="2" stroke="#EAF3FF" strokeWidth="1.4" />
                </>
              )}
              {studio === 'pcb_scanners' && (
                <>
                  <rect x="3" y="4" width="38" height="20" rx="2" stroke="#EAF3FF" strokeWidth="1.2" />
                  <rect x="9" y="9" width="8" height="8" stroke="#19C8F5" strokeWidth="1.2" />
                  <circle cx="45" cy="14" r="6" fill="#040912" stroke="#EAF3FF" strokeWidth="1.6" />
                  <path d="M49.5 18.5L55 24" stroke="#19C8F5" strokeWidth="1.8" strokeLinecap="round" />
                </>
              )}
            </svg>
          </div>
        </div>
      </button>
    );
  }
);
