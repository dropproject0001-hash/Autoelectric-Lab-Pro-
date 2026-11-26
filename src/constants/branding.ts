/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

export const APP_BRAND_NAME = 'AutoElectric Lab PRO';
export const RAMTI_TRADEMARK_WORDMARK = 'RAMTi';
export const RAMTI_SUBTITLE_LINES = [
  'Ruben AutoMotive',
  'Modern Technology',
  'Innovation',
] as const;
export const RAMTI_SUBTITLE_INLINE =
  'Ruben AutoMotive · Modern Technology · Innovation';

// Primary Dark Industrial RAMTi Carbon/Metallic Crest & Backdrop Assets
export const APP_LOGO_SRC = '/assets/aistudio/1795699079803_96e28eb3.jpg';
export const APP_ICON_SRC = '/assets/aistudio/1795699079803_96e28eb3.jpg';
export const APP_INDUSTRIAL_BACKDROP_SRC =
  '/assets/aistudio/1795699079803_96e28eb3.jpg';
export const APP_BRANDING_GUIDE_SRC =
  '/assets/aistudio/1795699656648_ba33be6d.jpg';
export const APP_MODULE_ICONS_SHEET_SRC =
  '/assets/aistudio/1795701476178_14294533.jpg';
export const APP_ACADEMY_BANNER_SRC =
  '/assets/aistudio/1795701471877_2efeb92c.jpg';
export const APP_STUDIO_CARDS_SHEET_SRC =
  '/assets/aistudio/1795701467304_07225485.jpg';

// Preserved Workshop & Legacy Brand Assets
export const APP_HERO_BANNER_SRC =
  '/assets/images/1795389975182_9c2108ec.jpg';
export const APP_LEGACY_LOGO_SRC =
  '/assets/images/file_0000000098d48211abb177ce752b7b0e_62980da7.png';
export const APP_LEGACY_ICON_SRC =
  '/assets/images/retouch_2026111706475552_2bbc9ff0.jpg';

export interface CreatorCredentialEntry {
  id: string;
  roleTitle: string;
  name: string;
  subtitle: string;
  bio: string;
  email?: string;
  accent: 'cyan' | 'amber';
}

export const CREATOR_CREDENTIALS = {
  organization:
    'RAMTi / RMATi — Ruben AutoMotive Modern Technology Innovation',
  shortOrg: 'RAMTi Verified Architecture',
  architectureSummary:
    'Modified Nodal Analysis (MNA) Solver · OEM ECU Twin · ISO 11898 CAN · SAE J1979 OBD-II',
  leaders: [
    {
      id: 'ruben-llego',
      roleTitle: 'Lead Systems Architect',
      name: 'Ruben Llego',
      subtitle: 'Owner & Head Developer',
      bio: 'Architected the Modified Nodal Analysis (MNA) circuit solver matrix, ECU pinout diagnostic engine, D3 harness topology, and real-time bench telemetry framework.',
      email: 'rubenllego12@gmail.com',
      accent: 'cyan',
    },
    {
      id: 'elnombre-danong',
      roleTitle: 'VIP Investor & Co-Owner',
      name: 'Elnombre Danong',
      subtitle: 'Executive Co-Owner & Strategic Backer',
      bio: 'Foundational early strategic investor driving EV diagnostic capability, dedicated physical hardware lab tooling expansion, and global workshop scale.',
      accent: 'amber',
    },
  ] as readonly CreatorCredentialEntry[],
} as const;

export const VERIFIED_OWNER_EMAILS = [
  'rubenllego12@gmail.com',
] as const;

export function isVerifiedOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (VERIFIED_OWNER_EMAILS as readonly string[]).includes(normalized);
}

