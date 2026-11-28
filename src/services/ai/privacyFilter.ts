/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

/**
 * Privacy Filter (Master Developer Instruction v1.1, Section 10).
 * Free-tier cloud inputs may be used by the provider to improve its products.
 * Strips user identifiers, personal data, customer/owner details, emails, phone numbers,
 * full VINs, license/PIN codes, and tokens before any optional cloud call.
 */

export interface PrivacyScrubResult {
  sanitizedText: string;
  redactedCount: number;
  redactedCategories: string[];
}

const PRIVACY_RULES: ReadonlyArray<{ category: string; regex: RegExp; replacement: string }> = [
  {
    category: 'EMAIL',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: '[REDACTED_EMAIL]',
  },
  {
    category: 'LICENSE_OR_TOKEN',
    regex: /\b(?:VECL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}|vecl_(?:trial|admin)_v1\.[A-Za-z0-9._-]+|AIza[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z]{20,})\b/g,
    replacement: '[REDACTED_CREDENTIAL]',
  },
  {
    category: 'FULL_VIN',
    regex: /\b[A-HJ-NPR-Z0-9]{17}\b/g,
    replacement: '[REDACTED_VIN]',
  },
  {
    category: 'PHONE',
    regex: /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g,
    replacement: '[REDACTED_PHONE]',
  },
  {
    category: 'USER_ID',
    regex: /\b(?:uid|user_id|userid|customer|owner)\s*[:=]\s*[^\n,;]{2,64}/gi,
    replacement: '[REDACTED_IDENTIFIER]',
  },
];

export function scrubSensitiveDataForCloud(input: string): PrivacyScrubResult {
  if (!input) {
    return { sanitizedText: '', redactedCount: 0, redactedCategories: [] };
  }

  let sanitizedText = input;
  let redactedCount = 0;
  const categories = new Set<string>();

  for (const rule of PRIVACY_RULES) {
    const matches = sanitizedText.match(rule.regex);
    if (matches && matches.length > 0) {
      redactedCount += matches.length;
      categories.add(rule.category);
      sanitizedText = sanitizedText.replace(rule.regex, rule.replacement);
    }
  }

  return {
    sanitizedText,
    redactedCount,
    redactedCategories: Array.from(categories),
  };
}
