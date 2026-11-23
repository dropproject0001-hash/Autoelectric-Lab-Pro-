import { AutomotiveRecordProvenance, RegionalMarket } from '../types/provenance';
import { buildProvenanceRecord } from './provenanceEngine';
import { RESTRICTED_MODEL_DATABASE, VERIFIED_VOICE_ECU_GUIDES } from './oemKnowledgeDatabase';

export interface RegionalChassisAliasGroup {
  id: string;
  brand: string;
  canonicalLabel: string;
  aliases: string[];
  ecuNotes: string;
}

export const REGIONAL_CHASSIS_ALIASES: RegionalChassisAliasGroup[] = [
  {
    id: 'mitsu-l200-strada',
    brand: 'Mitsubishi',
    canonicalLabel: 'Mitsubishi Strada ↔ L200 / Triton',
    aliases: ['l200', 'strada', 'triton', '4d56', '4n15'],
    ecuNotes: 'Denso SH7058 / SH72543R Common Rail Diesel (4D56 / 4N15 MIVEC)',
  },
  {
    id: 'mitsu-montero-pajero-sport',
    brand: 'Mitsubishi',
    canonicalLabel: 'Mitsubishi Montero Sport ↔ Pajero Sport / Challenger',
    aliases: ['pajero sport', 'montero sport', 'montero', 'challenger', 'shogun sport', '4n15', '4d56'],
    ecuNotes: 'Denso 4D56 / 4M41 / 4N15 2.4L MIVEC (Main Relay C/R Pin 118 -> I/B2 Pin 25)',
  },
  {
    id: 'toyota-vios-yaris-sedan',
    brand: 'Toyota',
    canonicalLabel: 'Toyota Vios ↔ Yaris Sedan / Belta',
    aliases: ['vios', 'yaris sedan', 'yaris', 'belta', '1nz-fe', '2nz-fe', '1nr-fe', '2nr-fe'],
    ecuNotes: 'Denso 1NZ/2NZ & 1NR/2NR Dual VVT-i',
  },
  {
    id: 'hyundai-h100-starex-d4cb',
    brand: 'Hyundai & Kia',
    canonicalLabel: 'Hyundai H-100 / Grand Starex / K2500 ↔ Porter II / H-1 (D4CB EDC16C39 / EDC17C53)',
    aliases: ['h-100', 'h100', 'porter', 'porter ii', 'starex', 'grand starex', 'h-1', 'k2500', 'bongo', 'd4cb', 'edc16c39', 'edc17c53'],
    ecuNotes: 'Bosch EDC16C39 (Euro-2/4) & Bosch EDC17C53 (Euro-4/5 D4CB CRDi)',
  },
  {
    id: 'nissan-navara-frontier-terra',
    brand: 'Nissan',
    canonicalLabel: 'Nissan Navara (D40 / D23 NP300) / Terra ↔ Frontier',
    aliases: ['navara', 'np300', 'd40', 'd23', 'terra', 'frontier', 'yd25', 'yd25ddti', 'ys23', 'ys23ddtt', 'edc17c84'],
    ecuNotes: 'D40 YD25DDTi (Denso) & D23/Terra YS23DDTT (Bosch EDC17C84 / TC1782)',
  },
  {
    id: 'isuzu-dmax-mux-kb',
    brand: 'Isuzu',
    canonicalLabel: 'Isuzu D-Max / mu-X / Alterra ↔ Rodeo / KB / N-Series',
    aliases: ['d-max', 'dmax', 'mu-x', 'mux', 'alterra', 'kb', 'rodeo', 'nhr', 'nkr', 'npr', '4jj1', '4hk1', 'transtron'],
    ecuNotes: 'Transtron SH7058 / SH7059 / SH72533 (Verify 12V vs 24V on N-Series)',
  },
];

export function resolveRegionalAliases(query: string): {
  expandedTerms: string[];
  matchedGroups: RegionalChassisAliasGroup[];
} {
  const q = query.trim().toLowerCase();
  if (!q) return { expandedTerms: [], matchedGroups: [] };

  const matchedGroups = REGIONAL_CHASSIS_ALIASES.filter((group) =>
    group.aliases.some((alias) => q.includes(alias) || alias.includes(q))
  );
  const termSet = new Set<string>([q]);
  for (const group of matchedGroups) {
    for (const alias of group.aliases) {
      termSet.add(alias);
    }
  }
  return {
    expandedTerms: Array.from(termSet),
    matchedGroups,
  };
}

export interface RegionalVehicleRecord {
  id: string;
  manufacturer: string;
  model: string;
  productionYears: string;
  engineCode: string;
  ecuPartNumber: string;
  transmission: string;
  marketRegion: RegionalMarket;
  connectorIdentity: string;
  nhtsaCoverageExpected: boolean;
  regionalCoverageNote: string;
  regionalAliases?: string[];
  provenance: AutomotiveRecordProvenance;
}

const REGION_CATALOG_RULES: Array<{
  match: RegExp;
  regions: RegionalMarket[];
  nhtsaCoverageExpected: boolean;
  note: string;
}> = [
  {
    match: /(hilux|fortuner|innova|hiace|vios|wigo|avanza|montero|triton|strada|xpander|mirage|almera|navara|urvan|d-max|mu-x|starex|l300)/i,
    regions: ['PHILIPPINES', 'ASEAN'],
    nhtsaCoverageExpected: false,
    note: 'Philippines / ASEAN market diesel & petrol platform. Not sold under U.S. FMVSS; NHTSA recalls/VIN decoding may return partial or 0 results.',
  },
  {
    match: /(qg16de|4d56|4n15|1gd-ftv|2gd-ftv|1kd-ftv|2kd-ftv|4jj1|fiat|marelli)/i,
    regions: ['PHILIPPINES', 'ASEAN', 'JAPAN_DOMESTIC', 'EUROPE'],
    nhtsaCoverageExpected: false,
    note: 'Non-USDM powertrain variant (JDM / ASEAN / EU). Consult regional OEM EPC/TSB bulletins.',
  },
  {
    match: /(ranger|f-150|civic|corolla|altis|camry|accord|cr-v|volkswagen|audi|me7\.5)/i,
    regions: ['NORTH_AMERICA', 'PHILIPPINES', 'ASEAN', 'EUROPE'],
    nhtsaCoverageExpected: true,
    note: 'Global nameplate: NHTSA covers North American VINs and recalls only; verify chassis WMI and emissions tier for non-US builds.',
  },
];

function inferRegionalProfile(text: string): {
  regions: RegionalMarket[];
  nhtsaCoverageExpected: boolean;
  note: string;
} {
  for (const rule of REGION_CATALOG_RULES) {
    if (rule.match.test(text)) {
      return {
        regions: rule.regions,
        nhtsaCoverageExpected: rule.nhtsaCoverageExpected,
        note: rule.note,
      };
    }
  }
  return {
    regions: ['PHILIPPINES', 'ASEAN'],
    nhtsaCoverageExpected: false,
    note: 'Regional market vehicle. Confirm WMI and target market before relying on U.S. NHTSA recall records.',
  };
}

export function buildRegionalKnowledgeCatalog(): RegionalVehicleRecord[] {
  const records: RegionalVehicleRecord[] = [];

  for (const guide of VERIFIED_VOICE_ECU_GUIDES) {
    const fullText = `${guide.brandLabel} ${guide.ecuName} ${guide.models.join(' ')}`;
    const regional = inferRegionalProfile(fullText);
    const { matchedGroups } = resolveRegionalAliases(fullText);
    const regionalAliases = Array.from(
      new Set(matchedGroups.flatMap((g) => [g.canonicalLabel, ...g.aliases]))
    );
    records.push({
      id: `reg-${guide.id}`,
      manufacturer: guide.brandLabel,
      model: guide.models[0] || guide.ecuName,
      productionYears: 'Model Year Varies (Check ECU Sticker)',
      engineCode: guide.ecuName,
      ecuPartNumber: guide.linkedProfileId ? `Profile Ref: ${guide.linkedProfileId}` : 'Verify on ECU Case',
      transmission: guide.ecuName.includes('TCM') || guide.ecuName.includes('AT') ? 'Automatic (TCM)' : 'MT / AT (Check Spec)',
      marketRegion: regional.regions[0],
      connectorIdentity: guide.tableRef,
      nhtsaCoverageExpected: regional.nhtsaCoverageExpected,
      regionalCoverageNote: regional.note,
      regionalAliases,
      provenance: buildProvenanceRecord({
        origin: 'LOCAL_OEM_GUIDE',
        requestedStatus: guide.status === 'VERIFIED' ? 'OEM_VERIFIED' : 'UNKNOWN',
        sourceName: `Virtual ECU Lab Knowledge Base (${guide.tableRef})`,
        sourceUrlOrRef: `internal://oemKnowledgeDatabase/${guide.id}`,
        manufacturer: guide.brandLabel,
        applicableVehicle: guide.models.join('; '),
        engineCode: guide.ecuName,
        ecuPartNumber: guide.linkedProfileId || undefined,
        publicationOrRevision: guide.tableRef,
        confidenceOrUncertainty:
          guide.status === 'VERIFIED'
            ? 'Bench reference mapped to verified table; confirm physical ECU part number before energizing.'
            : 'OCR_VERIFY gate active — verify physical ECU housing sticker and connector orientation.',
        regionalApplicability: regional.regions,
      }),
    });
  }

  for (const restricted of RESTRICTED_MODEL_DATABASE) {
    const fullText = `${restricted.brandLabel} ${restricted.modelName} ${restricted.oemControllerNote}`;
    const regional = inferRegionalProfile(fullText);
    const { matchedGroups } = resolveRegionalAliases(fullText);
    const regionalAliases = Array.from(
      new Set(matchedGroups.flatMap((g) => [g.canonicalLabel, ...g.aliases]))
    );
    records.push({
      id: `reg-${restricted.id}`,
      manufacturer: restricted.brandLabel,
      model: restricted.modelName,
      productionYears: 'Verify Vehicle Plate / VIN',
      engineCode: restricted.oemControllerNote,
      ecuPartNumber: 'UNSPECIFIED_VERIFY_ECU_LABEL',
      transmission: 'Verify Vehicle Spec',
      marketRegion: regional.regions[0],
      connectorIdentity: restricted.dlcProtocol,
      nhtsaCoverageExpected: regional.nhtsaCoverageExpected,
      regionalCoverageNote: `${regional.note} Restriction: ${restricted.restrictionReason}`,
      regionalAliases,
      provenance: buildProvenanceRecord({
        origin: 'LOCAL_RESTRICTED_METADATA',
        sourceName: 'Virtual ECU Lab Restricted Vehicle Metadata',
        sourceUrlOrRef: `internal://oemKnowledgeDatabase/${restricted.id}`,
        manufacturer: restricted.brandLabel,
        applicableVehicle: restricted.modelName,
        engineCode: restricted.oemControllerNote,
        publicationOrRevision: restricted.status,
        confidenceOrUncertainty: restricted.restrictionReason,
        regionalApplicability: regional.regions,
      }),
    });
  }

  return records;
}

export const REGIONAL_VEHICLE_CATALOG: RegionalVehicleRecord[] = buildRegionalKnowledgeCatalog();

export function filterRegionalCatalog(
  region: RegionalMarket | 'ALL',
  query = ''
): RegionalVehicleRecord[] {
  const q = query.trim().toLowerCase();
  const { expandedTerms } = resolveRegionalAliases(q);
  return REGIONAL_VEHICLE_CATALOG.filter((rec) => {
    const matchesRegion =
      region === 'ALL' || rec.provenance.regionalApplicability.includes(region);
    if (!matchesRegion) return false;
    if (!q) return true;
    const aliasText = rec.regionalAliases ? rec.regionalAliases.join(' ') : '';
    const hay = `${rec.manufacturer} ${rec.model} ${rec.engineCode} ${rec.ecuPartNumber} ${rec.connectorIdentity} ${aliasText}`.toLowerCase();
    return expandedTerms.some((term) => hay.includes(term));
  });
}
