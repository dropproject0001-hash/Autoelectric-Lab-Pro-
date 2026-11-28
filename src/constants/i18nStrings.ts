/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

/**
 * Externalized UI & Safety Strings (Master Developer Instruction v1.1, Section 14).
 * Structured for English (EN) and Tagalog/Taglish (TL) localization readiness.
 */

export type SupportedUiLocale = 'EN' | 'TL';

export interface LocalizedUiStrings {
  repairGuidanceDisclaimer: string;
  simulatedBadgeLabel: string;
  simulatedBadgeTooltip: string;
  offlineModeNotice: string;
  evidenceGapNotice: string;
  cloudPrivacyNotice: string;
}

export const UI_STRINGS: Record<SupportedUiLocale, LocalizedUiStrings> = {
  EN: {
    repairGuidanceDisclaimer:
      'Diagnostic procedures are for trained automotive technicians. All virtual bench readings are SIMULATED and are not physical ECU measurements. Always follow OEM service manuals and workshop safety procedures.',
    simulatedBadgeLabel: 'SIMULATED',
    simulatedBadgeTooltip:
      'Computed by the Virtual ECU Bench MNA software simulator — not a physical ECU measurement.',
    offlineModeNotice:
      'Offline mode active: App shell, ECU simulation, saved sessions, local knowledge retrieval, and downloaded local AI remain usable. Cloud AI requires network connectivity.',
    evidenceGapNotice:
      'No verified database record was found for this exact ECU or specification. Verify exact VIN, ECU part number, and factory service manual before testing.',
    cloudPrivacyNotice:
      'Free-tier cloud inputs may be used by the provider to improve products. Personal data, user IDs, emails, phones, and full VINs are scrubbed before any cloud call.',
  },
  TL: {
    repairGuidanceDisclaimer:
      'PAALALA: Ang mga diagnostic procedure ay para sa mga sanay na automotive technician. Ang lahat ng sukat sa virtual bench ay SIMULATED lamang at hindi aktwal na sukat sa pisikal na ECU. Laging sundin ang OEM service manual at workshop safety procedures.',
    simulatedBadgeLabel: 'SIMULATED',
    simulatedBadgeTooltip:
      'Kinukwenta ng Virtual ECU Bench MNA software simulator — hindi aktwal na sukat sa pisikal na ECU.',
    offlineModeNotice:
      'Offline mode: Gumagana pa rin ang app shell, ECU simulation, saved sessions, local knowledge search, at downloaded local AI. Kailangan ng internet para sa Cloud AI.',
    evidenceGapNotice:
      'Walang verified database record para sa eksaktong ECU o specification na ito. I-verify muna ang eksaktong VIN, ECU part number, at factory service manual bago mag-test.',
    cloudPrivacyNotice:
      'Maaaring gamitin ng provider ang free-tier cloud inputs para mapabuti ang serbisyo nito. Awtomatikong tinatanggal ang personal data, user ID, email, phone, at buong VIN bago ipadala sa cloud.',
  },
};

export function getUiStrings(locale: SupportedUiLocale = 'EN'): LocalizedUiStrings {
  return UI_STRINGS[locale] || UI_STRINGS.EN;
}
