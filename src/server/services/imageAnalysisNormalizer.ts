import {
  ImageAnalysisComponent,
  ImageAnalysisHotspot,
  ImageAnalysisNet,
  ImageAnalysisPinSpec,
  ImageAnalysisResult,
  PcbNormalizedBox,
} from './imageAnalysisTypes';

export interface RawVisionPinSpec {
  pinNumber?: number;
  pinName?: string;
  category?: string;
  nominalVoltage?: number;
  connectedNetId?: string;
  notes?: string;
}

export interface RawVisionComponent {
  refDes?: string;
  category?: string;
  marking?: string;
  decodedValue?: string;
  packageType?: string;
  bbox?: Partial<PcbNormalizedBox>;
  confidenceScore?: number;
  circuitFunction?: string;
  operatingVoltageRange?: string;
  maxCurrentRating?: string;
  datasheetSummary?: string;
  notes?: string;
  terminalIds?: string[];
  pinSpecs?: RawVisionPinSpec[];
}

export interface RawVisionNet {
  name?: string;
  signalType?: string;
  connectedComponentRefs?: string[];
  connectedTerminalIds?: string[];
  tracePoints?: Array<{ x?: number; y?: number }>;
  confidenceScore?: number;
}

export interface RawVisionHotspot {
  id?: string;
  label?: string;
  severity?: string;
  suspectComponentRef?: string;
  notes?: string;
  bbox?: Partial<PcbNormalizedBox>;
}

export interface RawVisionPayload {
  confidenceScore?: number;
  analysisSummary?: string;
  components?: RawVisionComponent[];
  nets?: RawVisionNet[];
  hotspots?: RawVisionHotspot[];
  warnings?: string[];
}

export function normalizeBox(box?: Partial<PcbNormalizedBox>): PcbNormalizedBox {
  let ymin = Number(box?.ymin ?? 100);
  let xmin = Number(box?.xmin ?? 100);
  let ymax = Number(box?.ymax ?? 250);
  let xmax = Number(box?.xmax ?? 250);

  if (!Number.isFinite(ymin)) ymin = 100;
  if (!Number.isFinite(xmin)) xmin = 100;
  if (!Number.isFinite(ymax)) ymax = 250;
  if (!Number.isFinite(xmax)) xmax = 250;

  // Guard against models returning 0..1 floats instead of 0..1000 integers
  const maxCoord = Math.max(ymin, xmin, ymax, xmax);
  if (maxCoord > 0 && maxCoord <= 1.05) {
    ymin *= 1000;
    xmin *= 1000;
    ymax *= 1000;
    xmax *= 1000;
  }

  ymin = Math.max(0, Math.min(980, Math.round(ymin)));
  xmin = Math.max(0, Math.min(980, Math.round(xmin)));
  ymax = Math.max(ymin + 20, Math.min(1000, Math.round(ymax)));
  xmax = Math.max(xmin + 20, Math.min(1000, Math.round(xmax)));

  return { ymin, xmin, ymax, xmax };
}

export function normalizePoints(
  pts?: Array<{ x?: number; y?: number }>
): { x: number; y: number }[] {
  if (!Array.isArray(pts) || pts.length === 0) return [];
  const maxVal = Math.max(
    ...pts.map((p) => Math.max(Number(p.x ?? 0), Number(p.y ?? 0)))
  );
  const scale = maxVal > 0 && maxVal <= 1.05 ? 1000 : 1;
  return pts.map((p) => ({
    x: Math.max(0, Math.min(1000, Math.round((Number(p.x ?? 0) || 0) * scale))),
    y: Math.max(0, Math.min(1000, Math.round((Number(p.y ?? 0) || 0) * scale))),
  }));
}

const VALID_PIN_CATEGORIES: ReadonlyArray<ImageAnalysisPinSpec['category']> = [
  'power',
  'ground',
  'signal_in',
  'signal_out',
  'driver_out',
  'bus',
];

export const PCB_ANTI_FABRICATION_RULES: readonly string[] = [
  'Never invent or guess illegible SMD markings or IC part numbers — label unreadable parts as "UNREADABLE".',
  'Never assume or default operating voltage ranges (e.g. 5V/12V), current ratings, or pin nominal voltages when unknown — use "UNKNOWN" or 0V with UNVERIFIED status.',
  'Never synthesize pinout tables or power/CAN rail names without legible markings or verified schematic/datasheet evidence.',
  'Never create phantom copper nets or fault hotspots on blank, uniform, or out-of-focus images.',
  'Drop component references in nets that do not match an actual detected component.',
];

export function isUnreadableOrUnknownMarker(value?: string | null): boolean {
  if (!value) return true;
  const upper = value.trim().toUpperCase();
  return (
    upper.length === 0 ||
    upper === 'UNKNOWN' ||
    upper === 'UNREADABLE' ||
    upper === 'LOCAL-CV' ||
    upper === 'N/A' ||
    upper === 'NONE' ||
    upper.startsWith('UNREADABLE') ||
    upper.startsWith('UNVERIFIED')
  );
}

export function buildPcbPromptText(documentName: string, isMacroCrop: boolean): string {
  return `You are a Master Automotive ECU Electronics & PCB Reverse-Engineering Specialist.
Analyze this ${isMacroCrop ? 'HIGH-MAGNIFICATION MACRO CROP of an ECU PCB' : 'automotive ECU PCB photograph'} (${documentName}).

HARD-CODED ANTI-FABRICATION RULES (STRICTLY MANDATORY — ZERO HALLUCINATION):
1. ONLY report components, laser/silkscreen markings, copper traces, and faults you can DIRECTLY OBSERVE in this image.
2. NEVER invent, guess, or autocomplete part numbers or SMD markings (e.g. TLE4275, TJA1050, BTS141) if the text is blurry, shadowed, or unreadable. If a marking cannot be clearly read, set "marking": "UNREADABLE" and "decodedValue": "Unreadable marking — Macro Crop required".
3. NEVER fabricate "operatingVoltageRange", "maxCurrentRating", or "pinSpecs" (pinouts/voltages) when not supported by a clearly legible IC marking or visible PCB silkscreen pin label. Use "UNKNOWN" for unknown ratings, omit "pinSpecs" (or set "nominalVoltage": 0 and "connectedNetId": "NET_UNASSIGNED") when unknown, and NEVER assume 5V or 12V rails without visual/marking proof.
4. Coordinate format: output EVERY bounding box and trace point in a STRICT 0 to 1000 normalized coordinate space where (0,0) is top-left and (1000,1000) is bottom-right of THIS image.
5. ONLY include "nets" where copper tracks/pours are visibly traceable between components ("tracePoints" in 0..1000), and ONLY include "hotspots" for genuine visible physical anomalies (burnt carbonization, cracked solder joints, corrosion residue, lifted copper).
6. If the image is blank, solid color, severely out of focus, or NOT a PCB/schematic, return empty "components": [], empty "nets": [], empty "hotspots": [], "confidenceScore": 0.1, and explain why extraction could not be verified in "warnings".`;
}

export function normalizeVisionPayload(
  parsed: RawVisionPayload,
  meta: {
    documentType: string;
    model: string;
    provider: 'gemini' | 'openai';
    providerDisplayName: string;
  }
): ImageAnalysisResult {
  const warnings: string[] = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
    : [];

  const rawConfidence = Number(parsed.confidenceScore ?? 0.5);
  const overallConfidence = Number.isFinite(rawConfidence)
    ? Math.max(0.05, Math.min(1, rawConfidence))
    : 0.5;

  const components: ImageAnalysisComponent[] = (parsed.components || []).map((c, idx) => {
    const safeRef = (c.refDes || `PART_${idx + 1}`).trim();
    const marking = (c.marking || '').trim() || 'UNREADABLE';
    const compConfidence = Math.max(
      0.05,
      Math.min(1, Number.isFinite(Number(c.confidenceScore)) ? Number(c.confidenceScore) : overallConfidence)
    );
    const unreadable = isUnreadableOrUnknownMarker(marking) || compConfidence < 0.55;

    const pinSpecs: ImageAnalysisPinSpec[] | undefined =
      Array.isArray(c.pinSpecs) && c.pinSpecs.length > 0
        ? c.pinSpecs.map((p, pIdx) => {
            const cat = VALID_PIN_CATEGORIES.includes(
              p.category as ImageAnalysisPinSpec['category']
            )
              ? (p.category as ImageAnalysisPinSpec['category'])
              : 'signal_in';
            const parsedVoltage = Number(p.nominalVoltage);
            const hasExplicitVoltage = p.nominalVoltage !== undefined && p.nominalVoltage !== null && Number.isFinite(parsedVoltage);
            return {
              pinNumber: Number(p.pinNumber || pIdx + 1),
              pinName: (p.pinName || '').trim() || `PAD_${pIdx + 1}`,
              category: cat,
              nominalVoltage: !unreadable && hasExplicitVoltage ? parsedVoltage : 0,
              connectedNetId: (p.connectedNetId || '').trim() || 'NET_UNASSIGNED',
              notes:
                (p.notes || '').trim() ||
                (unreadable
                  ? 'Unverified pin assignment — marking unreadable; verify physically before probing.'
                  : `Extracted from legible marking by ${meta.providerDisplayName} (requires technician confirmation).`),
            };
          })
        : undefined;

    const cleanTerminalIds =
      Array.isArray(c.terminalIds) && c.terminalIds.length > 0
        ? c.terminalIds
        : pinSpecs?.map((p) => `${safeRef}-${p.pinName}`) || [];

    return {
      refDes: safeRef,
      category: (c.category || '').trim() || 'UNIDENTIFIED_COMPONENT',
      marking,
      decodedValue:
        (c.decodedValue || '').trim() ||
        (unreadable ? 'Unreadable — verify with Macro Crop' : marking),
      packageType: (c.packageType || '').trim() || 'UNKNOWN_PKG',
      bbox: normalizeBox(c.bbox),
      confidenceScore: compConfidence,
      verificationStatus: unreadable ? 'UNKNOWN' : 'UNVERIFIED',
      circuitFunction:
        (c.circuitFunction || '').trim() ||
        'Unverified component — physical marking or schematic check required',
      terminalIds: cleanTerminalIds,
      operatingVoltageRange: (c.operatingVoltageRange || '').trim() || 'UNKNOWN',
      maxCurrentRating: (c.maxCurrentRating || '').trim() || 'UNKNOWN',
      datasheetSummary: (c.datasheetSummary || c.notes || '').trim(),
      pinSpecs,
      source: 'AI',
    };
  });

  const validCompRefs = new Set(components.map((c) => c.refDes));

  // If overall confidence indicates blank/non-PCB or zero components, do not fabricate nets
  const nets: ImageAnalysisNet[] =
    components.length === 0 || overallConfidence <= 0.2
      ? []
      : (parsed.nets || [])
          .map((n, idx) => {
            const tracePoints = normalizePoints(n.tracePoints);
            const filteredRefs = Array.isArray(n.connectedComponentRefs)
              ? Array.from(new Set(n.connectedComponentRefs.filter((r) => validCompRefs.has(r))))
              : [];
            const netConfidence = Math.max(
              0.05,
              Math.min(1, Number.isFinite(Number(n.confidenceScore)) ? Number(n.confidenceScore) : overallConfidence)
            );
            const hasVerifiedGeometry = tracePoints.length >= 2;
            return {
              name: (n.name || `NET_UNVERIFIED_${idx + 1}`).toUpperCase().replace(/\s+/g, '_'),
              signalType: (n.signalType || '').trim() || 'UNVERIFIED_TRACE',
              connectedComponentRefs: filteredRefs,
              connectedTerminalIds: Array.isArray(n.connectedTerminalIds)
                ? n.connectedTerminalIds
                : [],
              tracePoints,
              confidenceScore: netConfidence,
              verificationStatus: (netConfidence < 0.55 || !hasVerifiedGeometry ? 'UNKNOWN' : 'UNVERIFIED') as
                | 'UNKNOWN'
                | 'UNVERIFIED',
              isComplete: hasVerifiedGeometry && filteredRefs.length >= 2,
              ...(!hasVerifiedGeometry
                ? { incompleteNotes: 'Trace coordinates incomplete; physical continuity unverified.' }
                : {}),
            };
          })
          .filter((n) => n.tracePoints.length >= 2 || n.connectedComponentRefs.length >= 2);

  const hotspots: ImageAnalysisHotspot[] = (parsed.hotspots || []).map((h, idx) => ({
    id: h.id || `ai-hotspot-${idx + 1}`,
    label: (h.label || '').trim() || 'Visual Anomaly Zone (Unverified)',
    severity: (['CRITICAL', 'WARNING', 'INFO'].includes(h.severity || '')
      ? h.severity
      : 'WARNING') as 'CRITICAL' | 'WARNING' | 'INFO',
    bbox: normalizeBox(h.bbox),
    suspectComponentRef:
      h.suspectComponentRef && validCompRefs.has(h.suspectComponentRef)
        ? h.suspectComponentRef
        : undefined,
    notes:
      (h.notes || '').trim() ||
      'Flagged from image for physical inspection; confirm with multimeter and magnification.',
    source: 'AI',
  }));

  const unknownCount = components.filter((c) => c.verificationStatus === 'UNKNOWN').length;
  if (components.length === 0 && warnings.length === 0) {
    warnings.push(
      'Anti-fabrication guard: No legible PCB components were verified in this image.'
    );
  } else if (unknownCount > 0) {
    warnings.push(
      `Anti-fabrication guard: ${unknownCount} component(s) marked UNKNOWN due to illegible markings or low confidence; ratings/pinouts were withheld rather than guessed.`
    );
  }

  return {
    documentType: meta.documentType,
    confidenceScore: components.length === 0 ? Math.min(overallConfidence, 0.2) : overallConfidence,
    detectionMethod: 'AI_ANALYZED',
    analysisSummary:
      (parsed.analysisSummary || '').trim() ||
      (components.length === 0
        ? `${meta.providerDisplayName}: No legible PCB components verified (anti-fabrication guard active).`
        : `${meta.providerDisplayName} observed ${components.length} component(s) and ${nets.length} trace(s); verify UNKNOWN/UNVERIFIED markings before probing.`),
    components,
    terminals: [],
    nets,
    hotspots,
    warnings,
    model: meta.model,
    provider: meta.provider,
  };
}

export function resolveVisionTimeoutMs(): number {
  const raw = Number(process.env.AI_VISION_TIMEOUT_MS || 25_000);
  if (!Number.isFinite(raw)) return 25_000;
  return Math.max(5_000, Math.min(60_000, Math.round(raw)));
}

const DEPRECATED_GEMINI_MODEL_PATTERN = /^(?:gemini-1\.5-|gemini-2\.0-|gemini-pro$)/i;
const VALID_GEMINI_MODEL_PATTERN = /^gemini-[a-z0-9][a-z0-9._-]{1,63}$/i;
const VALID_OPENAI_MODEL_PATTERN = /^(?:gpt-|o[1-9]|chatgpt-)[a-zA-Z0-9._-]{1,63}$/;

export function resolveGeminiModelName(
  rawModel?: string | null,
  fallback: string = 'gemini-4-hydrogen'
): string {
  if (!rawModel) return fallback;
  const cleaned = rawModel
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/^models\//i, '')
    .trim();

  if (!cleaned || DEPRECATED_GEMINI_MODEL_PATTERN.test(cleaned)) {
    return fallback;
  }

  if (!VALID_GEMINI_MODEL_PATTERN.test(cleaned)) {
    return fallback;
  }

  return cleaned;
}

export function resolveOpenAIModelName(
  rawModel?: string | null,
  fallback: string = 'gpt-4o-mini'
): string {
  if (!rawModel) return fallback;
  const cleaned = rawModel.trim().replace(/^['"]+|['"]+$/g, '').trim();
  if (!cleaned || !VALID_OPENAI_MODEL_PATTERN.test(cleaned)) {
    return fallback;
  }
  return cleaned;
}

