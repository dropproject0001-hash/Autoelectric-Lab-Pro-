import type {
  AiDiagnosticResult,
  BenchTelemetry,
  BilingualLang,
  DiagnosticStepCard,
  VerifiedKnowledgeRecord,
} from '../../types/aiAssistant';
import { OfflineDiagnosticChatbot } from '../offlineChatbotEngine';
import { getAllVerifiedKnowledgeEntries } from './localKnowledgeDB';

export const OFFLINE_CONFIDENCE_THRESHOLD = 0.7;

export const SCORE_GATE_CLARIFICATION_MESSAGES: Record<BilingualLang, string> = {
  TL: 'Paumanhin, hindi malinaw ang tanong. Tungkol ba ito sa wiring, DTC, o bench test?',
  EN: "Sorry, the query wasn't clear. Is this about wiring, a DTC, or a bench test?",
};

const TAGALOG_ENGLISH_STOPWORDS = new Set<string>([
  // Tagalog / Taglish conversational fillers
  'ano', 'anu', 'yung', 'ung', 'mga', 'paano', 'pano', 'paki', 'pakicheck', 'naman', 'ba', 'po',
  'ang', 'ng', 'nang', 'sa', 'ko', 'mo', 'niya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan',
  'yan', 'iyon', 'yon', 'dito', 'doon', 'dun', 'lang', 'lamang', 'kasi', 'pero', 'para', 'kung',
  'kapag', 'pag', 'bakit', 'saan', 'kailan', 'sino', 'alin', 'din', 'rin', 'daw', 'raw', 'nga',
  'na', 'pa', 'eh', 'ay', 'may', 'meron', 'wala', 'boss', 'sir', 'kuya', 'pre', 'tol', 'hello',
  'hi', 'hey', 'kumusta', 'kamusta', 'tulungan', 'tulong', 'please', 'pls', 'plz', 'pwede', 'puede',
  'puedi', 'puwede', 'gusto', 'kailangan', 'salamat', 'thanks', 'thank', 'ok', 'okay', 'sige',
  'hoy', 'uy', 'testing', 'test123', 'asdf', 'blah', 'random', 'hmm', 'huh',
  // English conversational fillers
  'what', 'whats', 'how', 'why', 'where', 'when', 'who', 'which', 'the', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could',
  'would', 'should', 'will', 'shall', 'may', 'might', 'must', 'a', 'an', 'and', 'or', 'but',
  'if', 'then', 'than', 'that', 'this', 'these', 'those', 'of', 'to', 'in', 'on', 'at', 'by',
  'for', 'from', 'with', 'about', 'into', 'over', 'after', 'my', 'your', 'our', 'their', 'me',
  'you', 'him', 'her', 'us', 'them', 'it', 'its', 'just', 'very', 'really', 'help', 'tell',
  'explain', 'show', 'give', 'need', 'want', 'check', 'fix', 'issue', 'problem',
]);

const TECHNICAL_SHORT_ALLOWLIST = new Set<string>([
  'ac', 'dc', '5v', '12v', 'v', 'a', 'ma', 'oh', 'ic', 'o2', 'io', 'tx', 'rx', 'no', 'nc',
]);

export interface CuratedOfflineKnowledgeEntry {
  id: string;
  subject: string;
  keywords: string[];
  dtcCodes?: string[];
  safetyWarningTL: string;
  safetyWarningEN: string;
  rootCauseTL: string;
  rootCauseEN: string;
  verificationStepTL: string;
  verificationStepEN: string;
  verificationBulletsTL: string[];
  verificationBulletsEN: string[];
}

export const CURATED_VERIFIED_BENCH_ENTRIES: CuratedOfflineKnowledgeEntry[] = [
  {
    id: 'curated-p0122-tps-low',
    subject: 'DTC P0122 — Throttle Position Sensor (TPS) Low Input',
    keywords: ['p0122', 'tps', 'throttle', 'pin 7', 'pin7', 'tps_sig', 'vref', '5v', 'low', 'input', 'toyota', '1kd', '2kd'],
    dtcCodes: ['P0122'],
    safetyWarningTL:
      'MAG-INGAT: Huwag mag-inject ng +12V sa TPS signal (Pin 7) o sa 5V VREF rail (Pin 5). Tiyaking naka-OFF ang Bench Power Supply bago mag-OHMS / continuity test para hindi masira ang ECU ADC input.',
    safetyWarningEN:
      'ELECTRICAL SAFETY: Never apply +12V to TPS signal (Pin 7) or the 5V VREF rail (Pin 5). Switch Bench Power Supply OFF before performing any OHMS or continuity check to protect the ECU ADC input.',
    rootCauseTL:
      'Lumalabas ang P0122 kapag bumababa sa 0.20V ang TPS signal habang naka-ON ang ignition (KL15). Karaniwang sanhi nito ang putol na signal wire, nawalang 5V VREF (Pin 5), o short-to-ground (KL31) sa TPS harness.',
    rootCauseEN:
      'P0122 triggers when TPS signal voltage drops below 0.20V with KL15 ignition ON. Verified causes include an open TPS signal harness, missing 5V VREF (Pin 5), or a short-to-ground (KL31) on the TPS line.',
    verificationStepTL:
      'Isang hakbang muna: Sukatin ang Pin 5 (VREF_5V) gamit ang DMM sa V_DC mode (Red sa Pin 5, Black sa Chassis GND / KL31) at kumpirmahin na eksaktong ~5.00V bago i-probe ang Pin 7 (TPS_SIG).',
    verificationStepEN:
      'One step first: Measure Pin 5 (VREF_5V) in DMM V_DC mode (Red on Pin 5, Black on Chassis GND / KL31) and confirm stable ~5.00V before probing Pin 7 (TPS_SIG).',
    verificationBulletsTL: [
      'Nominal VREF_5V (Pin 5): 4.90V – 5.10V DC habang ON ang PSU.',
      'Nominal TPS_SIG (Pin 7) idle: ~0.50V – 1.30V; kung < 0.20V, i-OFF ang PSU at i-check ang cut wire o SHORT_TO_GND fault.',
      'Huwag manghula ng OEM pinout ng aktwal na sasakyan — i-verify muna ang eksaktong ECU part number at connector orientation.',
    ],
    verificationBulletsEN: [
      'Nominal VREF_5V (Pin 5): 4.90V – 5.10V DC with PSU enabled.',
      'Nominal TPS_SIG (Pin 7) at idle: ~0.50V – 1.30V; if < 0.20V, power OFF PSU and inspect for cut wire or SHORT_TO_GND fault.',
      'Never assume vehicle-specific OEM pinouts — confirm exact ECU part number and connector orientation first.',
    ],
  },
  {
    id: 'curated-p0123-tps-high',
    subject: 'DTC P0123 — Throttle Position Sensor (TPS) High Input',
    keywords: ['p0123', 'tps', 'throttle', 'high', 'input', 'pin 7', 'pin7', 'sgnd', 'pin 6', 'short', 'vbat'],
    dtcCodes: ['P0123'],
    safetyWarningTL:
      'MAG-INGAT: Kung umabot sa > 5.2V (o +12V) ang Pin 7, i-OFF agad ang Bench PSU at alisin ang SHORT_TO_VBAT fault upang hindi matusta ang 5V sensor rail.',
    safetyWarningEN:
      'ELECTRICAL SAFETY: If Pin 7 reads > 5.2V (or +12V), turn Bench PSU OFF immediately and clear any SHORT_TO_VBAT condition before re-energizing the 5V sensor rail.',
    rootCauseTL:
      'Nagti-trigger ang P0123 kapag lumampas sa 4.80V ang TPS_SIG (Pin 7). Kadalasang dulot ito ng putol na Sensor Ground (SGND Pin 6) o short sa +5V / +12V.',
    rootCauseEN:
      'P0123 triggers when TPS_SIG (Pin 7) exceeds 4.80V. Verified causes are an open Sensor Clean Ground (SGND Pin 6) or a short to 5V VREF / +12V battery rail.',
    verificationStepTL:
      'Sukatin ang voltage drop sa Pin 6 (SGND) papuntang Chassis GND (KL31) gamit ang DMM V_DC mode. Dapat mababa sa 0.10V; kung mataas, may open ground circuit.',
    verificationStepEN:
      'Measure voltage drop on Pin 6 (SGND) referenced to Chassis GND (KL31) in DMM V_DC mode. It must stay under 0.10V; higher readings confirm an open sensor ground.',
    verificationBulletsTL: [
      'I-check sa V_DC mode ang Pin 7: kung ~12.6V, kumpirmadong SHORT_TO_VBAT.',
      'I-verify ang Pin 6 (SGND) continuity patungong KL31 habang OFF ang Power Supply.',
    ],
    verificationBulletsEN: [
      'Probe Pin 7 in V_DC mode: a ~12.6V reading confirms SHORT_TO_VBAT.',
      'Verify Pin 6 (SGND) continuity to KL31 with Power Supply OFF.',
    ],
  },
  {
    id: 'curated-u0001-can-bus',
    subject: 'DTC U0001 — High-Speed CAN Bus & 60Ω Termination Test',
    keywords: ['u0001', 'can', 'can_h', 'can_l', 'canbus', '60', 'ohm', 'ohms', 'termination', 'pin 13', 'pin 14', 'communication', 'network'],
    dtcCodes: ['U0001'],
    safetyWarningTL:
      'MAG-INGAT: Kailangang naka-OFF ang Bench Power Supply at naka-discharge ang circuit bago sukatin ang CAN Bus resistance (OHMS) sa Pin 13 at Pin 14.',
    safetyWarningEN:
      'ELECTRICAL SAFETY: Bench Power Supply MUST be OFF and de-energized before measuring CAN Bus termination resistance (OHMS) across Pin 13 and Pin 14.',
    rootCauseTL:
      'Ang dalawang 120Ω termination resistors na naka-parallel sa CAN_H (Pin 13) at CAN_L (Pin 14) ay dapat magbasa ng ~60Ω. Ang 120Ω ay senyales ng putol na terminator; ang < 5Ω ay CAN short.',
    rootCauseEN:
      'Two 120Ω termination resistors wired in parallel across CAN_H (Pin 13) and CAN_L (Pin 14) must measure ~60Ω. Reading 120Ω indicates one open terminator; < 5Ω indicates a CAN short.',
    verificationStepTL:
      'I-OFF ang Bench PSU, ilagay ang DMM sa OHMS mode, ilapat ang Red probe sa Pin 13 (CAN_H) at Black probe sa Pin 14 (CAN_L). Kumpirmahin kung ~60.0Ω ang reading.',
    verificationStepEN:
      'Turn Bench PSU OFF, switch DMM to OHMS mode, place Red probe on Pin 13 (CAN_H) and Black probe on Pin 14 (CAN_L), and verify a ~60.0Ω reading.',
    verificationBulletsTL: [
      '~60Ω: Normal parallel termination (2 × 120Ω).',
      '~120Ω: Isa sa termination legs ay OPEN circuit.',
      'Kapag ON na ang PSU, tingnan sa Oscilloscope: CAN_H 2.5V–3.5V at CAN_L 2.5V–1.5V (mirror symmetry).',
    ],
    verificationBulletsEN: [
      '~60Ω: Healthy parallel termination (2 × 120Ω).',
      '~120Ω: One termination leg or harness wire is OPEN.',
      'With PSU ON, inspect Oscilloscope CAN_BUS view: CAN_H 2.5V–3.5V and CAN_L 2.5V–1.5V differential mirror.',
    ],
  },
  {
    id: 'curated-ocp-trip-power',
    subject: 'Bench Power Supply OCP Trip / Short-to-Ground Recovery',
    keywords: ['ocp', 'trip', 'tripped', 'short', 'current', 'limit', 'psu', 'power', 'supply', 'kl30', 'kl15', 'kl31', 'overcurrent', 'fuse'],
    safetyWarningTL:
      'KRITIKAL NA BABALA: Huwag tataasan ang current limit (Amps) para pilitin ang circuit na mag-ON kapag nag-OCP Trip! Ang short-to-ground sa +12V ay kayang sunugin ang ECU PCB traces.',
    safetyWarningEN:
      'CRITICAL SAFETY: Never raise the current limit (Amps) to force a circuit ON after an OCP Trip! A +12V short-to-ground can permanently burn ECU PCB traces.',
    rootCauseTL:
      'Nagti-trigger ang Over-Current Protection (OCP) kapag lumagpas ang draw ng circuit sa nakatakdang current limit dahil sa direct short ng KL30/KL15 sa KL31 ground o sirang driver MOSFET/TVS diode.',
    rootCauseEN:
      'Over-Current Protection (OCP) trips when total current draw exceeds the preset current limit due to a KL30/KL15 short-to-ground, reversed jumper wire, or shorted power driver / TVS diode.',
    verificationStepTL:
      'I-OFF muna ang PSU Output, suriin ang Wiring Canvas at Fault Matrix para sa SHORT_TO_GND, pagkatapos sukatin sa DMM RESISTANCE (Ω / OHMS) mode ang KL30 (Pin 3) papuntang KL31 (Pin 1) bago ibalik ang power.',
    verificationStepEN:
      'Switch PSU Output OFF immediately, inspect Wiring Canvas and Fault Matrix for SHORT_TO_GND faults, then verify KL30 (Pin 3) to KL31 (Pin 1) resistance in DMM RESISTANCE (Ω / OHMS) mode before re-enabling power.',
    verificationBulletsTL: [
      'Panatilihing mababa ang bench current limit (~1.0A – 2.0A) sa initial ECU power-up.',
      'Huwag kailanman pagdidikitin ang +12V rail (KL30/KL15) at 5V sensor rail (VREF_5V).',
    ],
    verificationBulletsEN: [
      'Keep initial ECU bench current limit conservative (~1.0A – 2.0A) during bring-up.',
      'Never bridge +12V power rails (KL30/KL15) into 5V sensor reference rails (VREF_5V).',
    ],
  },
  {
    id: 'curated-p0117-p0118-ect',
    subject: 'DTC P0117 / P0118 — Engine Coolant Temperature (ECT) NTC Sensor',
    keywords: ['p0117', 'p0118', 'ect', 'coolant', 'temp', 'temperature', 'ntc', 'thermistor', 'pin 9', 'pin9'],
    dtcCodes: ['P0117', 'P0118'],
    safetyWarningTL:
      'MAG-INGAT: Ang ECT ay 5V pull-up sensor circuit (2.2kΩ internal pull-up). Huwag lagyan ng +12V at i-OFF ang PSU bago mag-resistance test ng NTC thermistor.',
    safetyWarningEN:
      'ELECTRICAL SAFETY: ECT uses a 5V internal pull-up circuit (2.2kΩ). Never apply +12V and always turn Bench PSU OFF before measuring NTC thermistor resistance.',
    rootCauseTL:
      'P0117 (< 0.15V) ay short-to-ground sa ECT_SIG (Pin 9); P0118 (> 4.85V) ay open circuit o disconnected sensor harness kaya nahihila sa 5.00V ang Pin 9.',
    rootCauseEN:
      'P0117 (< 0.15V) indicates a short-to-ground on ECT_SIG (Pin 9); P0118 (> 4.85V) indicates an open thermistor circuit or disconnected harness pulling Pin 9 up to 5.00V.',
    verificationStepTL:
      'I-probe ang Pin 9 (ECT_SIG) gamit ang DMM V_DC mode. Ang warm bench reading (85°C) ay nasa ~0.55V (saklaw na 0.50V – 1.95V mula mainit hanggang malamig); kung 5.00V ay open wire, kung 0.00V ay short to ground.',
    verificationStepEN:
      'Probe Pin 9 (ECT_SIG) in DMM V_DC mode. Default warm bench reading (85°C) sits at ~0.55V (0.50V – 1.95V warm-to-cool range); 5.00V confirms open circuit, 0.00V confirms short to ground.',
    verificationBulletsTL: [
      'I-check ang wire connection mula comp-ect hanggang ecu-pin-9 sa Wiring Canvas.',
      'I-verify na hindi putol ang Sensor Ground (SGND Pin 6).',
    ],
    verificationBulletsEN: [
      'Inspect the harness path between comp-ect and ecu-pin-9 on the Wiring Canvas.',
      'Confirm Sensor Ground (SGND Pin 6) continuity with PSU OFF.',
    ],
  },
  {
    id: 'curated-ckp-cmp-crank',
    subject: 'CKP / CMP Crank & Cam Signal Waveform Bench Verification',
    keywords: ['ckp', 'cmp', 'crank', 'cam', 'crankshaft', 'camshaft', 'p0335', 'p0340', 'waveform', 'oscilloscope', 'rpm', 'vr', 'hall', '60-2', '36-2', 'no start', 'crank no start'],
    dtcCodes: ['P0335', 'P0340'],
    safetyWarningTL:
      'MAG-INGAT: Huwag gagamit ng test light na naka-12V sa CKP/CMP ECU input pins. Gumamit ng high-impedance Digital Multimeter o Oscilloscope probe lamang.',
    safetyWarningEN:
      'ELECTRICAL SAFETY: Never use an incandescent 12V test light on CKP/CMP ECU input pins. Use only a high-impedance DMM or Oscilloscope probe.',
    rootCauseTL:
      'Kapag walang malinis na CKP sync pulse (missing-tooth pattern) o walang CMP phase reference, hindi mag-fi-fire ang injector at ignition drivers ng ECU.',
    rootCauseEN:
      'Without a clean CKP missing-tooth sync pulse or CMP phase signal, the ECU disables injector and ignition driver outputs (crank-no-start condition).',
    verificationStepTL:
      'Buksan ang Oscilloscope tab at piliin ang CKP / CMP channel. Kumpirmahin kung may stable waveform habang naka-ON ang RPM Emulator at KL15 ignition.',
    verificationStepEN:
      'Open the Oscilloscope tab and select the CKP / CMP channel. Verify a clean repeating pulse train while RPM Emulator and KL15 ignition are enabled.',
    verificationBulletsTL: [
      'Kumpirmahin muna na naka-ON ang KL30/KL15 at stable ang 5V VREF bago mag-diagnose ng no-RPM signal.',
      'Suriin ang shielding at sensor ground kung may erratic noise spikes sa waveform.',
    ],
    verificationBulletsEN: [
      'Verify KL30/KL15 power and 5V VREF stability before diagnosing a missing RPM signal.',
      'Inspect sensor ground and harness shielding if erratic noise spikes distort the waveform.',
    ],
  },
  {
    id: 'curated-dmm-oscilloscope-wiring',
    subject: 'Bench Multimeter (DMM), Oscilloscope & Safe Wiring Procedure',
    keywords: ['multimeter', 'dmm', 'oscilloscope', 'scope', 'probe', 'ohms', 'continuity', 'voltage', 'wire', 'wiring', 'kl30', 'kl15', 'kl31', 'vref'],
    safetyWarningTL:
      'MAG-INGAT: Ihiwalay palagi ang 12V Power Rails (KL30/KL15) sa 5V Sensor Rails (VREF_5V). Palaging mag-short-to-ground check (OHMS mode, PSU OFF) bago i-ON ang Bench Power Supply.',
    safetyWarningEN:
      'ELECTRICAL SAFETY: Strictly separate 12V Power Rails (KL30/KL15) from 5V Sensor Rails (VREF_5V). Always perform a power-OFF short-to-ground OHMS check before enabling Bench Power Supply.',
    rootCauseTL:
      'Ang maling DMM mode (tulad ng OHMS/CONTINUITY habang live ang +12V circuit) ay nagti-trigger ng safety lockout, at ang maling pagkakabit ng 12V sa 5V pin ay nakakasira ng ECU regulator.',
    rootCauseEN:
      'Selecting OHMS or CONTINUITY on a live energized circuit triggers DMM safety lockout, and applying +12V to a 5V sensor pin damages internal ECU LDO/ADC stages.',
    verificationStepTL:
      'Ikabit muna ang Black (-) probe sa Chassis GND (KL31), siguraduhing nasa V_DC mode ang DMM para sa live test, o i-OFF muna ang PSU bago mag-OHMS / CONTINUITY.',
    verificationStepEN:
      'Clip the Black (-) COM probe to Chassis GND (KL31) first, use V_DC mode for live voltage measurements, and turn PSU OFF before switching to OHMS / CONTINUITY.',
    verificationBulletsTL: [
      'V_DC Mode: Gamitin habang ON ang PSU (KL30 ~12.6V, VREF_5V ~5.00V).',
      'OHMS / CONTINUITY Mode: Gamitin LAMANG habang naka-OFF ang PSU.',
    ],
    verificationBulletsEN: [
      'V_DC Mode: Use with PSU ON (KL30 ~12.6V, VREF_5V ~5.00V).',
      'OHMS / CONTINUITY Mode: Use ONLY with PSU switched OFF.',
    ],
  },
];

let sharedOfflineIndex: OfflineDiagnosticChatbot | null = null;

function getSharedOfflineIndex(): OfflineDiagnosticChatbot {
  if (!sharedOfflineIndex) {
    sharedOfflineIndex = new OfflineDiagnosticChatbot();
  }
  return sharedOfflineIndex;
}

/**
 * Strips Tagalog + English conversational filler words while preserving core technical terms,
 * DTC codes (P0122, U0001), ECU/engine codes (1KD, 2KD, 4D56, MEC11), and pin phrases (Pin 7).
 */
export function stripBilingualStopwords(rawQuery: string): string[] {
  const normalized = rawQuery
    .toLowerCase()
    .replace(/[^\w\s\-/.Ω]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return [];

  const tokens: string[] = [];
  const pinPhraseMatches = normalized.match(/\bpin\s*\d+\b/g) || [];
  for (const phrase of pinPhraseMatches) {
    tokens.push(phrase.replace(/\s+/g, ' '));
  }

  const rawWords = normalized.split(' ');
  for (const word of rawWords) {
    const clean = word.replace(/^[./-]+|[./-]+$/g, '');
    if (!clean) continue;
    if (TAGALOG_ENGLISH_STOPWORDS.has(clean)) continue;

    const isDtc = /^[pcbu][0-9]{4}$/i.test(clean);
    const isAlnumCode = /[a-z]/i.test(clean) && /\d/.test(clean);
    const isPinNum = /^pin\d+$/i.test(clean);

    if (isDtc || isAlnumCode || isPinNum || TECHNICAL_SHORT_ALLOWLIST.has(clean) || clean.length >= 2) {
      tokens.push(clean);
    }
  }

  return Array.from(new Set(tokens));
}

export function formatBenchSnapshotSummary(
  telemetry: BenchTelemetry | undefined,
  lang: BilingualLang
): string {
  if (!telemetry) {
    return lang === 'TL'
      ? 'Walang active live bench telemetry snapshot.'
      : 'No live bench telemetry snapshot attached.';
  }

  const psuStatus = telemetry.isOcpTripped
    ? `OCP TRIPPED (${telemetry.psuCurrentDrawAmps.toFixed(2)}A / ${telemetry.psuCurrentLimitAmps.toFixed(1)}A)`
    : telemetry.psuEnabled
      ? `${telemetry.psuVoltageSetting.toFixed(1)}V ON (${telemetry.psuCurrentDrawAmps.toFixed(2)}A)`
      : `OFF (${telemetry.psuVoltageSetting.toFixed(1)}V preset)`;

  const dtcPart =
    telemetry.activeDtcs.length > 0
      ? telemetry.activeDtcs.map((d) => d.code).join(', ')
      : lang === 'TL'
        ? '0 Active DTC'
        : '0 Active DTCs';

  const pinPart = telemetry.selectedPin
    ? `${telemetry.selectedPin.label} (#${telemetry.selectedPin.pinNumber}: ${
        telemetry.selectedPin.measuredVoltage !== null
          ? `${telemetry.selectedPin.measuredVoltage.toFixed(2)}V`
          : 'Floating'
      })`
    : lang === 'TL'
      ? 'Walang naka-select na pin'
      : 'No pin selected';

  return `PSU: ${psuStatus} | DTC: ${dtcPart} | Pin: ${pinPart} | DMM: ${telemetry.dmm.displayReading} ${telemetry.dmm.unit}`;
}

function buildLiveBenchAssessmentAddon(
  telemetry: BenchTelemetry | undefined,
  lang: BilingualLang
): string {
  if (!telemetry) return '';
  const parts: string[] = [];

  if (telemetry.isOcpTripped) {
    parts.push(
      lang === 'TL'
        ? `LIVE BENCH ALERT: Naka-OCP TRIP ang Power Supply sa ${telemetry.psuCurrentDrawAmps.toFixed(2)}A (limit ${telemetry.psuCurrentLimitAmps.toFixed(1)}A). I-OFF agad ang PSU at hanapin ang SHORT_TO_GND.`
        : `LIVE BENCH ALERT: Power Supply is OCP TRIPPED at ${telemetry.psuCurrentDrawAmps.toFixed(2)}A (limit ${telemetry.psuCurrentLimitAmps.toFixed(1)}A). Switch PSU OFF immediately and isolate SHORT_TO_GND.`
    );
  } else {
    parts.push(
      lang === 'TL'
        ? `Live Bench PSU: ${telemetry.psuEnabled ? `${telemetry.psuVoltageSetting.toFixed(1)}V ON (${telemetry.psuCurrentDrawAmps.toFixed(2)}A)` : `OFF (${telemetry.psuVoltageSetting.toFixed(1)}V preset)`}.`
        : `Live Bench PSU: ${telemetry.psuEnabled ? `${telemetry.psuVoltageSetting.toFixed(1)}V ON (${telemetry.psuCurrentDrawAmps.toFixed(2)}A)` : `OFF (${telemetry.psuVoltageSetting.toFixed(1)}V preset)`}.`
    );
  }

  if (telemetry.activeDtcs.length > 0) {
    const dtcList = telemetry.activeDtcs.map((d) => `${d.code} (${d.description})`).join('; ');
    parts.push(
      lang === 'TL'
        ? `Active Bench DTCs: ${dtcList}.`
        : `Active Bench DTCs: ${dtcList}.`
    );
  }

  if (telemetry.selectedPin) {
    const vText =
      telemetry.selectedPin.measuredVoltage !== null
        ? `${telemetry.selectedPin.measuredVoltage.toFixed(2)}V`
        : 'Floating';
    parts.push(
      lang === 'TL'
        ? `Probed/Selected Pin: ${telemetry.selectedPin.label} (Pin #${telemetry.selectedPin.pinNumber}) = ${vText} (Nominal: ${telemetry.selectedPin.nominalVoltage.toFixed(2)}V).`
        : `Probed/Selected Pin: ${telemetry.selectedPin.label} (Pin #${telemetry.selectedPin.pinNumber}) = ${vText} (Nominal: ${telemetry.selectedPin.nominalVoltage.toFixed(2)}V).`
    );
  }

  return parts.join(' ');
}

export function buildThreeRepairStepCards(params: {
  lang: BilingualLang;
  subject: string;
  safetyWarning: string;
  rootCause: string;
  verificationAction: string;
  verificationBullets?: string[];
  telemetry?: BenchTelemetry;
}): DiagnosticStepCard[] {
  const { lang, safetyWarning, rootCause, verificationAction, verificationBullets, telemetry } = params;
  const liveBenchAddon = buildLiveBenchAssessmentAddon(telemetry, lang);

  return [
    {
      id: 'card-safety-warning',
      stepNumber: 1,
      kind: 'SAFETY_WARNING',
      title: lang === 'TL' ? 'Babala sa Kaligtasan sa Kuryente' : 'Safety Warning Banner',
      badge: lang === 'TL' ? 'STEP 1 · SAFETY FIRST' : 'STEP 1 · SAFETY FIRST',
      body: safetyWarning,
      emphasisTone: 'danger',
    },
    {
      id: 'card-root-cause',
      stepNumber: 2,
      kind: 'ROOT_CAUSE_ASSESSMENT',
      title:
        lang === 'TL'
          ? 'Root Cause at Live Bench Assessment'
          : 'Root Cause & Live Bench Assessment',
      badge: lang === 'TL' ? 'STEP 2 · VERIFIED ANALYSIS' : 'STEP 2 · VERIFIED ANALYSIS',
      body: liveBenchAddon ? `${rootCause}\n\n${liveBenchAddon}` : rootCause,
      emphasisTone: 'info',
    },
    {
      id: 'card-verification-action',
      stepNumber: 3,
      kind: 'VERIFICATION_ACTION',
      title:
        lang === 'TL'
          ? 'Step-by-Step Verification Action'
          : 'Step-by-Step Verification Action',
      badge: lang === 'TL' ? 'STEP 3 · NEXT TEST' : 'STEP 3 · NEXT TEST',
      body: verificationAction,
      bulletPoints: verificationBullets,
      emphasisTone: 'action',
    },
  ];
}

function scoreTokenOverlap(queryTokens: string[], targetKeywords: string[], dtcCodes?: string[]): number {
  if (queryTokens.length === 0) return 0;

  const targetSet = new Set(targetKeywords.map((k) => k.toLowerCase()));
  const dtcSet = new Set((dtcCodes || []).map((c) => c.toLowerCase()));

  let matchedCount = 0;
  let exactDtcMatch = false;

  for (const qt of queryTokens) {
    if (dtcSet.has(qt)) {
      exactDtcMatch = true;
      matchedCount += 1.5;
      continue;
    }
    if (targetSet.has(qt)) {
      matchedCount += 1;
      continue;
    }
    // Partial prefix match for longer technical terms (>=4 chars)
    if (qt.length >= 4) {
      for (const tk of targetSet) {
        if (tk.includes(qt) || qt.includes(tk)) {
          matchedCount += 0.65;
          break;
        }
      }
    }
  }

  if (matchedCount === 0) return 0;

  const queryCoverage = Math.min(1, matchedCount / queryTokens.length);
  if (exactDtcMatch) {
    return Math.min(0.98, Math.max(0.88, 0.78 + queryCoverage * 0.2));
  }
  if (matchedCount >= 2) {
    return Math.min(0.95, 0.72 + queryCoverage * 0.22);
  }
  if (matchedCount >= 1 && queryTokens.length === 1 && queryTokens[0].length >= 3) {
    return 0.76;
  }
  return Math.min(0.68, queryCoverage * 0.68);
}

function matchCachedRecord(
  queryTokens: string[],
  records: VerifiedKnowledgeRecord[]
): { record: VerifiedKnowledgeRecord; score: number } | null {
  let best: { record: VerifiedKnowledgeRecord; score: number } | null = null;
  for (const rec of records) {
    const dtcCandidates = rec.tokens.filter((t) => /^[pcbu]\d{4}$/i.test(t));
    const score = scoreTokenOverlap(queryTokens, rec.tokens, dtcCandidates);
    if (!best || score > best.score) {
      best = { record: rec, score };
    }
  }
  return best;
}

function matchCuratedEntry(
  queryTokens: string[]
): { entry: CuratedOfflineKnowledgeEntry; score: number } | null {
  let best: { entry: CuratedOfflineKnowledgeEntry; score: number } | null = null;
  for (const entry of CURATED_VERIFIED_BENCH_ENTRIES) {
    const score = scoreTokenOverlap(queryTokens, entry.keywords, entry.dtcCodes);
    if (!best || score > best.score) {
      best = { entry, score };
    }
  }
  return best;
}

export async function runOfflineDiagnosticEngine(params: {
  query: string;
  lang: BilingualLang;
  telemetry?: BenchTelemetry;
}): Promise<AiDiagnosticResult> {
  const { query, lang, telemetry } = params;
  const extractedTokens = stripBilingualStopwords(query);
  const benchSnapshotSummary = formatBenchSnapshotSummary(telemetry, lang);
  const now = Date.now();

  const buildClarificationGateResult = (confidence: number): AiDiagnosticResult => {
    const clarificationText = SCORE_GATE_CLARIFICATION_MESSAGES[lang];
    return {
      id: `offline-gate-${now}`,
      lang,
      tierUsed: 'OFFLINE_AI',
      tierLabel: 'Offline AI',
      sourceProvenance: 'CLARIFICATION_GATE',
      confidence,
      blockedByScoreGate: true,
      subject: lang === 'TL' ? 'Kailangan ng Karagdagang Detalye' : 'Clarification Required',
      conversationalSummary: clarificationText,
      cards: buildThreeRepairStepCards({
        lang,
        subject: 'Clarification Gate',
        safetyWarning:
          lang === 'TL'
            ? 'ZERO-FABRICATION SAFETY GATE: Hindi ako manghuhula ng pinout, wire color, o repair step kapag hindi malinaw ang tanong. I-OFF muna ang PSU kung hindi sigurado sa wiring.'
            : 'ZERO-FABRICATION SAFETY GATE: I will never guess ECU pinouts, wire colors, or repair steps on an unclear query. Keep Bench PSU OFF until wiring is verified.',
        rootCause: clarificationText,
        verificationAction:
          lang === 'TL'
            ? 'Magbigay ng partikular na DTC (hal. P0122, U0001), ECU/engine code (hal. Toyota 1KD), o bench symptom (hal. OCP trip, 60Ω CAN bus test).'
            : 'Specify a DTC code (e.g. P0122, U0001), ECU/engine code (e.g. Toyota 1KD), or bench test topic (e.g. OCP trip, 60Ω CAN bus test).',
        telemetry,
      }),
      extractedTokens,
      attemptTrail: [],
      cachedLocally: false,
      benchSnapshotSummary,
      createdAt: now,
    };
  };

  if (extractedTokens.length === 0) {
    return buildClarificationGateResult(0);
  }

  // 1. Check AutoLabPro_VerifiedKnowledge IndexedDB cache first
  const cachedEntries = await getAllVerifiedKnowledgeEntries();
  const cachedMatch = matchCachedRecord(extractedTokens, cachedEntries);
  if (cachedMatch && cachedMatch.score >= OFFLINE_CONFIDENCE_THRESHOLD) {
    const rec = cachedMatch.record;
    const conversationalSummary =
      lang === 'TL'
        ? `Boss, batay sa verified data ng ${rec.subject} (naka-save sa AutoLabPro_VerifiedKnowledge), ito ang ligtas na pagsusuri: ${rec.rootCauseSummary}`
        : `Based on verified reference data for ${rec.subject} (cached in AutoLabPro_VerifiedKnowledge), here is the safe bench analysis: ${rec.rootCauseSummary}`;

    return {
      id: `offline-cache-${now}`,
      lang,
      tierUsed: 'OFFLINE_AI',
      tierLabel: 'Offline AI (Verified Cache)',
      sourceProvenance: 'LOCAL_VERIFIED_CACHE',
      confidence: Number(cachedMatch.score.toFixed(2)),
      blockedByScoreGate: false,
      subject: rec.subject,
      conversationalSummary,
      cards: buildThreeRepairStepCards({
        lang,
        subject: rec.subject,
        safetyWarning: rec.safetyWarning,
        rootCause: rec.rootCauseSummary,
        verificationAction: rec.verificationStep,
        telemetry,
      }),
      extractedTokens,
      attemptTrail: [],
      cachedLocally: true,
      benchSnapshotSummary,
      createdAt: now,
    };
  }

  // 2. Check curated verified ECU bench entries
  const curatedMatch = matchCuratedEntry(extractedTokens);
  if (curatedMatch && curatedMatch.score >= OFFLINE_CONFIDENCE_THRESHOLD) {
    const e = curatedMatch.entry;
    const safetyWarning = lang === 'TL' ? e.safetyWarningTL : e.safetyWarningEN;
    const rootCause = lang === 'TL' ? e.rootCauseTL : e.rootCauseEN;
    const verificationAction = lang === 'TL' ? e.verificationStepTL : e.verificationStepEN;
    const verificationBullets = lang === 'TL' ? e.verificationBulletsTL : e.verificationBulletsEN;

    const conversationalSummary =
      lang === 'TL'
        ? `Boss, batay sa verified data ng ${e.subject}, huwag magmadali — unahin natin ang safety check bago mag-probe. ${rootCause}`
        : `Based on verified reference data for ${e.subject}, follow the electrical safety gate first before probing. ${rootCause}`;

    return {
      id: `offline-curated-${now}`,
      lang,
      tierUsed: 'OFFLINE_AI',
      tierLabel: 'Offline AI',
      sourceProvenance: 'OFFLINE_VERIFIED_ENGINE',
      confidence: Number(curatedMatch.score.toFixed(2)),
      blockedByScoreGate: false,
      subject: e.subject,
      conversationalSummary,
      cards: buildThreeRepairStepCards({
        lang,
        subject: e.subject,
        safetyWarning,
        rootCause,
        verificationAction,
        verificationBullets,
        telemetry,
      }),
      extractedTokens,
      attemptTrail: [],
      cachedLocally: false,
      benchSnapshotSummary,
      createdAt: now,
    };
  }

  // 3. Query the 2,080+ verified PH scenarios & OEM playbooks via MiniSearch with strict 0.70 score gate
  const offlineIdx = getSharedOfflineIndex();
  const cleanSearchQuery = extractedTokens.join(' ');
  const reply = offlineIdx.ask(cleanSearchQuery);
  const topCitation = reply.citations[0];

  if (topCitation) {
    // Verify genuine lexical match against extracted technical tokens (prevents fuzzy gibberish hallucination)
    const citationHaystack = `${topCitation.title} ${topCitation.subtitle} ${topCitation.snippet}`.toLowerCase();
    const matchedQueryTokens = extractedTokens.filter((t) => citationHaystack.includes(t));
    const tokenRatio = matchedQueryTokens.length / extractedTokens.length;
    const normalizedConfidence = Number(
      Math.min(0.94, tokenRatio * 0.85 + (topCitation.score >= 8 ? 0.12 : topCitation.score >= 4 ? 0.06 : 0)).toFixed(2)
    );

    if (normalizedConfidence >= OFFLINE_CONFIDENCE_THRESHOLD && matchedQueryTokens.length > 0) {
      const subject = topCitation.title;
      const safetyWarning =
        lang === 'TL'
          ? 'MAG-INGAT: Huwag mag-apply ng +12V sa 5V sensor pins at i-verify muna ang eksaktong ECU part number at connector pinout bago mag-jumper sa aktwal na sasakyan.'
          : 'ELECTRICAL SAFETY: Never apply +12V to 5V sensor pins and confirm the exact ECU part number and connector orientation before applying bench power.';
      const rootCause = topCitation.snippet;
      const verificationAction =
        lang === 'TL'
          ? `I-verify muna ang power (KL30/KL15), ground (KL31), at ang nabanggit na circuit para sa ${subject} gamit ang DMM bago magpalit ng piyesa.`
          : `Verify KL30/KL15 power, KL31 ground, and the referenced circuit for ${subject} with your DMM before replacing any component.`;

      const conversationalSummary =
        lang === 'TL'
          ? `Boss, batay sa verified data ng ${subject}, ito ang reference na tugma sa tanong mo: ${rootCause}`
          : `Based on verified reference data for ${subject}, here is the matched diagnostic guidance: ${rootCause}`;

      return {
        id: `offline-index-${now}`,
        lang,
        tierUsed: 'OFFLINE_AI',
        tierLabel: 'Offline AI',
        sourceProvenance: 'OFFLINE_VERIFIED_ENGINE',
        confidence: normalizedConfidence,
        blockedByScoreGate: false,
        subject,
        conversationalSummary,
        cards: buildThreeRepairStepCards({
          lang,
          subject,
          safetyWarning,
          rootCause,
          verificationAction,
          telemetry,
        }),
        extractedTokens,
        attemptTrail: [],
        cachedLocally: false,
        benchSnapshotSummary,
        createdAt: now,
      };
    }
  }

  // Score Gate triggered (< 0.70 confidence) — block response and request clarification
  const bestObservedScore = Math.max(cachedMatch?.score ?? 0, curatedMatch?.score ?? 0);
  return buildClarificationGateResult(Number(bestObservedScore.toFixed(2)));
}
