/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

export const APP_BRAND_NAME = 'AutoElectric Lab Pro';
export const APP_LOGO_SRC =
  '/assets/images/file_0000000098d48211abb177ce752b7b0e_62980da7.png';
export const APP_ICON_SRC =
  '/assets/images/retouch_2026111706475552_2bbc9ff0.jpg';
export const APP_HERO_BANNER_SRC =
  '/assets/images/1795389975182_9c2108ec.jpg';

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
  organization: 'RMATi — Ruben Modern Automotive-Electrical Technology Innovations',
  shortOrg: 'RMATi Verified Architecture',
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

