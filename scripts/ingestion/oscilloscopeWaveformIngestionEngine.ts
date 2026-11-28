/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import fs from 'node:fs';
import path from 'node:path';
import type { SystemCategoryId } from '../../src/types/automotiveKnowledge';
import type {
  OscilloscopeGuideCategory,
  OscilloscopeSignalFamily,
  OscilloscopeWaveformCatalogManifest,
  OscilloscopeWaveformRecord,
} from '../../src/types/oscilloscopeWaveformIngestion';

const BASE_URL = 'https://www.picoauto.com';
const INDEX_URL = `${BASE_URL}/library/automotive-guided-tests`;
const USER_AGENT =
  'AutoElectricLabPro/1.0 (+https://autoelectriclab-pro.vercel.app; Automotive Oscilloscope Reference Cataloger)';

const TARGET_CATEGORIES: OscilloscopeGuideCategory[] = [
  'sensors',
  'actuators',
  'communication',
  'ignition',
  'charging-starting',
  'system-tests',
];

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&ndash;|&mdash;/gi, '-')
    .replace(/&plusmn;/gi, '±')
    .replace(/&micro;/gi, 'µ')
    .replace(/&Omega;/gi, 'Ω')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTagsToLines(htmlChunk: string): string[] {
  const cleaned = htmlChunk
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(?:p|li|div|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return cleaned
    .split('\n')
    .map((line) => decodeHtmlEntities(line))
    .filter((line) => line.length > 0 && line !== '-->');
}

function truncateText(text: string, maxLen = 320): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trimEnd()}…`;
}

function classifySignalFamily(
  title: string,
  category: OscilloscopeGuideCategory,
  subCategory: string
): { signalFamily: OscilloscopeSignalFamily; systemCategoryId: SystemCategoryId } {
  const combined = `${title} ${subCategory} ${category}`.toLowerCase();

  if (/\bcrankshaft\b|\bckp\b/.test(combined)) {
    return { signalFamily: 'CKP_CRANKSHAFT', systemCategoryId: 'engine_management_ecu' };
  }
  if (/\bcamshaft\b|\bcmp\b/.test(combined)) {
    return { signalFamily: 'CMP_CAMSHAFT', systemCategoryId: 'engine_management_ecu' };
  }
  if (/\bair\s*flow\b|\bair\s*mass\b|\bmaf\b/.test(combined)) {
    return { signalFamily: 'MAF_AIRFLOW', systemCategoryId: 'engine_management_ecu' };
  }
  if (/\bmanifold\s+absolute\b|\bmap\b|\bboost\s+pressure\b|\bbarometric\b/.test(combined)) {
    return { signalFamily: 'MAP_PRESSURE', systemCategoryId: 'engine_management_ecu' };
  }
  if (/\boxygen\b|\blambda\b|\bo2\b|\bair\s*fuel\b|\bwideband\b|\bzirconia\b|\btitania\b/.test(combined)) {
    return { signalFamily: 'O2_LAMBDA_AFR', systemCategoryId: 'engine_management_ecu' };
  }
  if (/\bthrottle\b|\baccelerator\s+pedal\b|\btps\b|\bapp\b/.test(combined)) {
    return { signalFamily: 'TPS_APP_THROTTLE', systemCategoryId: 'engine_management_ecu' };
  }
  if (/\btemperature\b|\bcoolant\b|\bect\b|\biat\b/.test(combined)) {
    return { signalFamily: 'TEMP_ECT_IAT', systemCategoryId: 'engine_management_ecu' };
  }
  if (/\bknock\b/.test(combined)) {
    return { signalFamily: 'KNOCK_SENSOR', systemCategoryId: 'engine_management_ecu' };
  }
  if (/\bwheel\s+speed\b|\babs\b|\bwss\b/.test(combined)) {
    return { signalFamily: 'ABS_WHEEL_SPEED', systemCategoryId: 'safety_abs_srs' };
  }
  if (/\bfuel\s+rail\b|\brail\s+pressure\b|\bfrp\b/.test(combined)) {
    return { signalFamily: 'FUEL_RAIL_PRESSURE', systemCategoryId: 'fuel_system' };
  }
  if (/\binjector\b|\binjection\b/.test(combined)) {
    return { signalFamily: 'INJECTOR_FUEL', systemCategoryId: 'fuel_system' };
  }
  if (category === 'ignition' || /\bignition\b|\bcoil\b|\bspark\b|\bdistributor\b|\bprimary\b|\bsecondary\b/.test(combined)) {
    return { signalFamily: 'IGNITION_PRIMARY_SECONDARY', systemCategoryId: 'engine_management_ecu' };
  }
  if (category === 'communication' || /\bcan\b|\blin\b|\bflexray\b|\bsent\b|\bk-line\b|\bserial\b/.test(combined)) {
    return { signalFamily: 'CAN_LIN_NETWORK', systemCategoryId: 'diagnostics_obd_dtc' };
  }
  if (category === 'charging-starting' || /\balternator\b|\bstarter\b|\bcharging\b|\bbattery\b|\bripple\b/.test(combined)) {
    return { signalFamily: 'CHARGING_STARTING_RIPPLE', systemCategoryId: 'electrical_charging' };
  }
  if (category === 'system-tests' || /\bcompression\b|\bcorrelation\b|\bparasitic\b/.test(combined)) {
    return { signalFamily: 'SYSTEM_COMPRESSION_CORRELATION', systemCategoryId: 'diagnostics_obd_dtc' };
  }
  if (category === 'actuators' || /\bsolenoid\b|\bvalve\b|\begr\b|\bvvt\b|\bpwm\b|\bactuator\b|\bmotor\b|\bpump\b/.test(combined)) {
    return { signalFamily: 'PWM_SOLENOID_VALVE', systemCategoryId: 'engine_management_ecu' };
  }
  return { signalFamily: 'OTHER_AUTOMOTIVE_SIGNAL', systemCategoryId: 'body_electrical' };
}

function detectWaveformShape(text: string, signalFamily: OscilloscopeSignalFamily): string {
  const lower = text.toLowerCase();
  if (/\bsquare\s*wave\b|\bdigital\s+signal\b|\b0\s*v\s*(?:to|-)\s*5\s*v\b|\bhall\s+effect\b/.test(lower)) {
    return 'Digital Square Wave (Hall / Optical / Logic 0V-5V or 0V-12V)';
  }
  if (/\bsine\s*wave\b|\bac\s+(?:voltage|signal)\b|\binductive\b|\bzero\s*crossing\b/.test(lower)) {
    return 'AC Sine Wave (Inductive / Reluctor — amplitude & frequency scale with speed)';
  }
  if (/\bdifferential\b|\bcan\s*high\b|\bcan\s*low\b|\brecessive\b|\bdominant\b/.test(lower)) {
    return 'Differential Digital Bus (CAN-H / CAN-L mirrored 2.5V recessive -> 3.5V/1.5V dominant)';
  }
  if (/\bpwm\b|\bpulse\s+width\s+modulat|\bduty\s+cycle\b/.test(lower)) {
    return 'Pulse-Width Modulated (PWM) Switched Square Wave';
  }
  if (/\binductive\s+kick\b|\bflyback\b|\bpintle\b|\bpeak\s+and\s+hold\b|\bpiezo\b/.test(lower)) {
    return 'Inductive Switched Pulse with Flyback Voltage Spike & Pintle/Dwell Signature';
  }
  if (/\bripple\b|\brectifi/.test(lower)) {
    return 'DC Bus with Low-Amplitude AC Ripple (3-Phase Diode Rectification Envelope)';
  }
  if (/\boscillat|\brich\b|\blean\b|\b0\.1\s*v\b|\b0\.9\s*v\b/.test(lower)) {
    return 'Slow Switching Analog Voltage (0.1V Lean to 0.9V Rich Lambda Oscillation)';
  }
  if (signalFamily === 'IGNITION_PRIMARY_SECONDARY') {
    return 'Ignition Dwell Ramp, High-Voltage Firing Spike, Spark Burn Line & Coil Oscillations';
  }
  return 'Continuous Analog Voltage / Current Envelope (see OEM reference range)';
}

function extractSpecs(text: string, regex: RegExp, maxItems = 6): string[] {
  const seen = new Set<string>();
  const matches = text.match(regex) || [];
  for (const m of matches) {
    const clean = m.replace(/\s+/g, ' ').trim();
    if (clean.length >= 2 && clean.length <= 40) {
      seen.add(clean);
    }
    if (seen.size >= maxItems) break;
  }
  return [...seen];
}

function extractSectionChunk(html: string, headingText: string, nextHeadings: string[]): string {
  const hRegex = new RegExp(`<h[2-4][^>]*>\\s*${headingText}\\s*<\\/h[2-4]>`, 'i');
  const match = hRegex.exec(html);
  if (!match) return '';
  const start = match.index + match[0].length;
  let end = html.length;
  for (const nextH of nextHeadings) {
    const nextRegex = new RegExp(`<h[2-4][^>]*>\\s*${nextH}\\s*<\\/h[2-4]>`, 'i');
    const nextMatch = nextRegex.exec(html.slice(start));
    if (nextMatch && start + nextMatch.index < end) {
      end = start + nextMatch.index;
    }
  }
  return html.slice(start, Math.min(end, start + 18000));
}

function buildGoodVsFaultyRule(
  signalFamily: OscilloscopeSignalFamily,
  waveformShape: string,
  voltageSpecs: string[],
  faultIndicators: string[],
  dtcs: string[]
): string {
  const vSpec = voltageSpecs.length > 0 ? `Expected voltage references: ${voltageSpecs.slice(0, 3).join(', ')}. ` : '';
  const faultPart =
    faultIndicators.length > 0
      ? `Faulty signal deviations to compare: ${faultIndicators.slice(0, 3).join('; ')}.`
      : 'Compare amplitude, frequency/duty cycle, ground offset, noise/dropouts, and missing pulses against the known-good reference.';
  const dtcPart = dtcs.length > 0 ? ` Typical DTCs: ${dtcs.slice(0, 5).join(', ')}.` : '';
  return `[${signalFamily}] Known-Good: ${waveformShape}. ${vSpec}${faultPart}${dtcPart}`;
}

async function fetchHtmlWithRetry(url: string, retries = 2): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 16000);
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        if (attempt < retries) continue;
        return null;
      }
      return await res.text();
    } catch {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      }
    }
  }
  return null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIdx = 0;
  async function runWorker() {
    while (nextIdx < items.length) {
      const current = nextIdx++;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runWorker()));
  return results;
}

export async function runOscilloscopeWaveformIngestion(): Promise<OscilloscopeWaveformCatalogManifest> {
  console.log('[OscilloscopeIngestion] Discovering PicoAuto Automotive Guided Tests across 6 categories...');

  const discovered = new Map<string, { category: OscilloscopeGuideCategory; relUrl: string; agtCode: string; subCategory: string }>();

  for (const cat of TARGET_CATEGORIES) {
    const html = await fetchHtmlWithRetry(`${INDEX_URL}/${cat}`, 2);
    if (!html) {
      console.warn(`  [WARN] Could not fetch category index: ${cat}`);
      continue;
    }
    const matches = [...html.matchAll(/href="(\/library\/automotive-guided-tests\/[^"]*?(AGT-\d+)[^"]*)"/gi)];
    let addedForCat = 0;
    for (const m of matches) {
      const relUrl = m[1].replace(/\/+$/, '') + '/';
      const agtCode = m[2].toUpperCase();
      if (!discovered.has(agtCode)) {
        const parts = relUrl.split('/').filter(Boolean);
        const subCategory = parts.length >= 4 ? parts[3] : cat;
        discovered.set(agtCode, { category: cat, relUrl, agtCode, subCategory });
        addedForCat += 1;
      }
    }
    console.log(`  [${cat}] discovered ${addedForCat} unique AGT guided tests`);
  }

  const targets = [...discovered.values()].sort((a, b) => a.agtCode.localeCompare(b.agtCode));
  console.log(`[OscilloscopeIngestion] Scraping ${targets.length} unique AGT waveform guides...`);

  const crawledAt = new Date().toISOString();

  const parsedRecords = await mapWithConcurrency(targets, 6, async (target, idx) => {
    const sourceUrl = `${BASE_URL}${target.relUrl}`;
    const html = await fetchHtmlWithRetry(sourceUrl, 2);
    if (!html) return null;

    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = h1Match ? decodeHtmlEntities(h1Match[1].replace(/<[^>]+>/g, ' ')) : target.agtCode;

    const h1Pos = h1Match ? html.indexOf(h1Match[0]) : 0;
    const bodySlice = html.slice(h1Pos);

    // Extract intro / purpose between H1 and "How to perform the test"
    const howToPos = bodySlice.search(/<h[2-4][^>]*>\s*How to perform the test/i);
    const introSlice = howToPos > 0 ? bodySlice.slice(0, Math.min(howToPos, 4000)) : bodySlice.slice(0, 1500);
    const introLines = stripTagsToLines(introSlice).filter((l) => l.toLowerCase() !== title.toLowerCase());
    const purposeSummary = truncateText(
      introLines.join(' ') || `Automotive oscilloscope guided test for ${title}.`,
      260
    );

    const howToHtml = extractSectionChunk(bodySlice, 'How to perform the test', [
      'Example waveform',
      'Waveform notes',
      'Further guidance',
      'Diagnostic trouble codes',
      'Disclaimer',
    ]);
    const howToLines = stripTagsToLines(howToHtml).slice(0, 6);
    const testSetupSummary = truncateText(
      howToLines.join(' → ') || 'Identify signal circuit using OEM data, connect scope channel, capture at idle/crank.',
      280
    );

    const guidanceHtml = extractSectionChunk(bodySlice, 'Further guidance', [
      'Diagnostic trouble codes',
      'Disclaimer',
      'Related',
    ]);
    const exampleHtml = extractSectionChunk(bodySlice, 'Example waveform', [
      'Further guidance',
      'Diagnostic trouble codes',
      'Disclaimer',
    ]);
    const dtcHtml = extractSectionChunk(bodySlice, 'Diagnostic trouble codes', [
      'Disclaimer',
      'Related',
    ]);

    const guidanceLines = stripTagsToLines(`${exampleHtml}\n${guidanceHtml}`);
    const fullTechnicalText = `${purposeSummary} ${guidanceLines.join(' ')}`;

    const { signalFamily, systemCategoryId } = classifySignalFamily(
      title,
      target.category,
      target.subCategory
    );

    const waveformShape = detectWaveformShape(fullTechnicalText, signalFamily);
    const extractedVoltageSpecs = extractSpecs(
      fullTechnicalText,
      /\b(?:\d+(?:\.\d+)?\s*(?:to|-)\s*\d+(?:\.\d+)?\s*(?:mV|kV|V)|[+-]?\d+(?:\.\d+)?\s*(?:mV|kV|V))\b/g,
      6
    );
    const extractedFrequencyOrTimingSpecs = extractSpecs(
      fullTechnicalText,
      /\b(?:\d+(?:\.\d+)?\s*(?:to|-)\s*\d+(?:\.\d+)?\s*(?:kHz|Hz|ms|µs|us|%|RPM|kbps|Mbps)|\d+(?:\.\d+)?\s*(?:kHz|Hz|ms|µs|us|kbps|Mbps))\b/gi,
      6
    );

    // Extract fault indicators & symptom indicators from guidance lines
    const faultIndicators: string[] = [];
    const symptomIndicators: string[] = [];
    for (const line of guidanceLines) {
      if (line.length < 12 || line.length > 220) continue;
      const lower = line.toLowerCase();
      if (
        /\b(?:short|open\s+circuit|high\s+resistance|excessive\s+gap|damage|corros|dirt|detritus|wear|leak|broken|missing\s+tooth|noise|interference|drop|faulty|failure|diode|saturation|backlash|stretch|slip|contaminat|blockage|stuck)\b/.test(
          lower
        )
      ) {
        if (faultIndicators.length < 5 && !faultIndicators.includes(line)) {
          faultIndicators.push(truncateText(line, 160));
        }
      } else if (
        /\b(?:misfire|no\s+start|crank|stall|cut\s+out|rough\s+idle|poor\s+fuel|limp|mil|warning\s+lamp|hesitat|surging|overheat|loss\s+of\s+power|flat\s+battery|no\s+communicat)\b/.test(
          lower
        )
      ) {
        if (symptomIndicators.length < 4 && !symptomIndicators.includes(line)) {
          symptomIndicators.push(truncateText(line, 140));
        }
      }
    }

    const associatedDtcs = Array.from(
      new Set((`${dtcHtml} ${fullTechnicalText}`.toUpperCase().match(/\b[PBCU][0-3][0-9A-F]{3}\b/g) || []))
    ).sort();

    const knownGoodSummary = truncateText(
      guidanceLines.slice(0, 3).join(' ') || purposeSummary,
      320
    );

    const record: OscilloscopeWaveformRecord = {
      id: `osc-pico-${target.agtCode.toLowerCase()}`,
      agtCode: target.agtCode,
      title,
      category: target.category,
      subCategory: target.subCategory,
      signalFamily,
      systemCategoryId,
      purposeSummary,
      knownGood: {
        waveformShape,
        extractedVoltageSpecs,
        extractedFrequencyOrTimingSpecs,
        testSetupSummary,
        knownGoodSummary,
      },
      faultyComparison: {
        faultIndicators:
          faultIndicators.length > 0
            ? faultIndicators
            : [
                'Open/short circuit or high circuit resistance causing flatline or voltage offset',
                'Amplitude dropout, erratic noise, or timing/duty-cycle deviation vs. known-good reference',
              ],
        symptomIndicators,
        associatedDtcs,
        goodVsFaultyDiagnosticRule: buildGoodVsFaultyRule(
          signalFamily,
          waveformShape,
          extractedVoltageSpecs,
          faultIndicators,
          associatedDtcs
        ),
      },
      provenance: {
        sourceSite: 'picoauto.com',
        sourceUrl,
        crawledAt,
        tier: 'VERIFIED',
        evidenceType: 'VERIFIED_OEM',
        copyrightNotice:
          'Structured oscilloscope signal parameters, DTCs, and short technical extracts only; full guided test remains hosted on picoauto.com.',
      },
    };

    if ((idx + 1) % 20 === 0 || idx === targets.length - 1) {
      console.log(
        `  [${idx + 1}/${targets.length}] Scraped ${record.agtCode} (${record.signalFamily}) — ${record.faultyComparison.associatedDtcs.length} DTC(s)`
      );
    }
    return record;
  });

  const validRecords = parsedRecords
    .filter((r): r is OscilloscopeWaveformRecord => Boolean(r))
    .sort((a, b) => a.agtCode.localeCompare(b.agtCode));

  const categoriesBreakdown: Record<OscilloscopeGuideCategory, number> = {
    sensors: 0,
    actuators: 0,
    communication: 0,
    ignition: 0,
    'charging-starting': 0,
    'system-tests': 0,
  };
  const signalFamiliesBreakdown: Record<string, number> = {};
  const allDtcs = new Set<string>();

  for (const rec of validRecords) {
    categoriesBreakdown[rec.category] += 1;
    signalFamiliesBreakdown[rec.signalFamily] = (signalFamiliesBreakdown[rec.signalFamily] || 0) + 1;
    for (const d of rec.faultyComparison.associatedDtcs) allDtcs.add(d);
  }

  const manifest: OscilloscopeWaveformCatalogManifest = {
    schemaVersion: '1.0.0',
    sourceSite: 'picoauto.com',
    sourceIndexUrl: INDEX_URL,
    generatedAt: crawledAt,
    zeroFabricationIntegrity: true,
    totalGuidesDiscovered: targets.length,
    totalWaveformsIngested: validRecords.length,
    totalDtcsIndexed: allDtcs.size,
    categoriesBreakdown,
    signalFamiliesBreakdown,
    records: validRecords,
  };

  const outDir = path.resolve(process.cwd(), 'src/data/oscilloscope');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'oemOscilloscopeWaveformsCatalog.json');
  fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2), 'utf-8');

  console.log(
    `✓ Wrote OEM Oscilloscope Waveforms Catalog -> ${outFile}\n` +
      `  Total guides scraped: ${manifest.totalWaveformsIngested}/${manifest.totalGuidesDiscovered} | Unique DTCs indexed: ${manifest.totalDtcsIndexed}`
  );
  return manifest;
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('oscilloscopeWaveformIngestionEngine.ts')
) {
  runOscilloscopeWaveformIngestion().catch((err) => {
    console.error('[OscilloscopeIngestion] Fatal error:', err);
    process.exit(1);
  });
}
