/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { RepairReferenceRecord } from '../types/automotiveKnowledge';
import type {
  EcuPcbComponentRecord,
  EcuPcbComponentRole,
  EcuPcbComponentsCatalogManifest,
} from '../types/ecuPcbComponentCatalog';
import catalogManifestJson from '../data/pcb/ecuPcbComponentsCatalog.json';

const PCB_COMPONENTS_MANIFEST = catalogManifestJson as unknown as EcuPcbComponentsCatalogManifest;

export function getEcuPcbComponentsManifest(): EcuPcbComponentsCatalogManifest {
  return PCB_COMPONENTS_MANIFEST;
}

export function getAllEcuPcbComponents(): EcuPcbComponentRecord[] {
  return PCB_COMPONENTS_MANIFEST.records || [];
}

export interface VisualScanComponentQuery {
  refDes?: string;
  partNumber?: string;
  label?: string;
  category?: string;
  packageType?: string;
  markingText?: string;
  notes?: string;
}

export interface VisualComponentIdentificationMatch {
  component: EcuPcbComponentRecord;
  matchConfidence: number;
  matchReason: string;
}

function normalizeMarking(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9.-]/g, '');
}

/**
 * Identifies an ECU PCB component from actual visual scan attributes
 * (part number, silkscreen/laser marking, refDes prefix, category, package, notes)
 * and returns ranked matches with full electrical bench specs, technician pro tips,
 * and step-by-step guided repair instructions.
 */
export function identifyPcbComponentFromVisualScan(
  input: VisualScanComponentQuery
): VisualComponentIdentificationMatch[] {
  const combinedRaw = [
    input.partNumber,
    input.markingText,
    input.label,
    input.refDes,
    input.category,
    input.packageType,
    input.notes,
  ]
    .filter(Boolean)
    .join(' ');

  if (!combinedRaw.trim()) return [];

  const combinedUpper = combinedRaw.toUpperCase();
  const combinedNorm = normalizeMarking(combinedRaw);
  const refPrefix = (input.refDes || '').toUpperCase().replace(/[0-9].*$/, '').trim();
  const lower = combinedRaw.toLowerCase();

  const matches: VisualComponentIdentificationMatch[] = [];

  for (const comp of getAllEcuPcbComponents()) {
    let score = 0;
    const reasons: string[] = [];

    const normPart = normalizeMarking(comp.partNumber);
    if (normPart.length >= 4 && combinedNorm.includes(normPart)) {
      score += 100;
      reasons.push(`Exact part number match (${comp.partNumber})`);
    }

    for (const alias of comp.markingAliases) {
      const normAlias = normalizeMarking(alias);
      if (normAlias.length >= 3 && combinedNorm.includes(normAlias)) {
        score += 85;
        reasons.push(`Laser/silkscreen marking match (${alias})`);
        break;
      }
    }

    for (const xref of comp.crossReferences) {
      const normXref = normalizeMarking(xref);
      if (normXref.length >= 4 && combinedNorm.includes(normXref)) {
        score += 75;
        reasons.push(`Cross-reference equivalent (${xref})`);
        break;
      }
    }

    // Role / functional keyword scoring when exact laser marking is obscured or worn
    const roleHints: Array<{ role: EcuPcbComponentRole; pattern: RegExp; label: string }> = [
      { role: 'IGNITION_IGBT_DRIVER', pattern: /\b(?:igbt|ignition|coil\s*driver|spark)\b/i, label: 'Ignition IGBT stage' },
      { role: 'INJECTOR_SOLENOID_DRIVER', pattern: /\b(?:injector|mosfet|low[\s-]*side|solenoid|darlington|relay\s*driver|smart\s*power)\b/i, label: 'Injector/Solenoid driver stage' },
      { role: 'ETC_H_BRIDGE_DRIVER', pattern: /\b(?:h[\s-]*bridge|throttle|etc|etcs|dc\s*motor)\b/i, label: 'ETC H-Bridge stage' },
      { role: 'CAN_LIN_KLINE_TRANSCEIVER', pattern: /\b(?:can\s*bus|can\s*transceiver|k[\s-]*line|iso\s*9141|lin\s*bus|transceiver)\b/i, label: 'CAN/LIN/K-Line transceiver' },
      { role: 'VOLTAGE_REGULATOR_SBC', pattern: /\b(?:regulator|ldo|5v\s*reg|vreg|sbc|power\s*ic|voltage\s*reg)\b/i, label: '5V/3.3V Voltage Regulator / SBC' },
      { role: 'SERIAL_EEPROM_FLASH', pattern: /\b(?:eeprom|flash|memory|immob|95160|95080|93c56|24c02)\b/i, label: 'Serial EEPROM / Memory' },
      { role: 'ECU_MICROCONTROLLER', pattern: /\b(?:mcu|cpu|microcontroller|tricore|renesas|superh|processor)\b/i, label: 'ECU Microcontroller' },
      { role: 'POWER_PROTECTION_PASSIVE', pattern: /\b(?:tvs|diode|capacitor|electrolytic|cap\b|shunt|resistor|crystal|xtal|oscillator)\b/i, label: 'Protection / Passive power stage' },
    ];

    for (const hint of roleHints) {
      if (comp.role === hint.role && hint.pattern.test(lower)) {
        score += 36;
        reasons.push(`Visual/category match (${hint.label})`);
        // Extra precision inside passive protection parts
        if (comp.role === 'POWER_PROTECTION_PASSIVE') {
          if (comp.id.includes('tvs') && /\b(?:tvs|diode|zd)\b/i.test(lower)) score += 28;
          if (comp.id.includes('cap') && /\b(?:cap|capacitor|electrolytic|uf|µf)\b/i.test(lower)) score += 28;
          if (comp.id.includes('shunt') && /\b(?:shunt|resistor|ohm|r0)\b/i.test(lower)) score += 28;
          if (comp.id.includes('crystal') && /\b(?:crystal|xtal|mhz|oscillator)\b/i.test(lower)) score += 28;
        }
        break;
      }
    }

    if (refPrefix && comp.refDesPrefixes.includes(refPrefix)) {
      score += 12;
      reasons.push(`RefDes prefix (${refPrefix}*)`);
    }

    if (
      input.packageType &&
      comp.packageType.toLowerCase().includes(input.packageType.toLowerCase().trim())
    ) {
      score += 10;
      reasons.push(`Package match (${comp.packageType})`);
    }

    // DTC match in notes/query
    const dtcMatch = comp.visualAndFaultSignatures.associatedDtcs.find((d) =>
      combinedUpper.includes(d)
    );
    if (dtcMatch) {
      score += 20;
      reasons.push(`Associated DTC (${dtcMatch})`);
    }

    if (score >= 30) {
      matches.push({
        component: comp,
        matchConfidence: Math.min(0.99, Number((score / 120).toFixed(2))),
        matchReason: reasons.join(' • '),
      });
    }
  }

  return matches.sort(
    (a, b) =>
      b.matchConfidence - a.matchConfidence ||
      a.component.partNumber.localeCompare(b.component.partNumber)
  );
}

export function searchEcuPcbComponents(query: string): VisualComponentIdentificationMatch[] {
  return identifyPcbComponentFromVisualScan({ markingText: query, notes: query });
}

/**
 * Converts all ECU PCB component records into RepairReferenceRecord entries
 * for unified MiniSearch indexing in automotiveKnowledgeService.
 */
export function buildEcuPcbComponentRepairReferences(): RepairReferenceRecord[] {
  return getAllEcuPcbComponents().map((comp) => ({
    id: `ref-${comp.id}`,
    vehicleId: 'v-universal-ecu-pcb-components',
    make: comp.manufacturer,
    model: `${comp.partNumber} (${comp.packageType})`,
    years: 'Automotive ECU Hardware',
    systemCategoryId: comp.systemCategoryId,
    title: `${comp.partNumber} — ${comp.role.replace(/_/g, ' ')} [ECU PCB Component & Guided Repair]`,
    referenceType: 'electrical_system',
    summary: `${comp.functionalSummary} Bench Check: ${comp.electricalBenchSpecs.diodeOrResistanceCheck} Pro Tip: ${comp.technicianProTips[0] || ''}`,
    source: {
      sourceName: `${comp.manufacturer} (${comp.provenance.sourceSite})`,
      originalUrl: comp.provenance.sourceUrl,
      sourceType: 'oem_ecu_pcb_component_reference',
      collectedAt: comp.provenance.crawledAt,
      language: 'en',
      verificationStatus: 'verified_source',
      confidenceScore: 0.94,
    },
    verified: true,
    tags: Array.from(
      new Set([
        'pcb-scanner',
        'ecu-component',
        comp.partNumber.toLowerCase(),
        comp.role.toLowerCase(),
        ...comp.markingAliases.map((a) => a.toLowerCase()),
        ...comp.crossReferences.map((x) => x.toLowerCase()),
        ...comp.visualAndFaultSignatures.associatedDtcs.map((d) => d.toLowerCase()),
      ])
    ),
    ecuIdentity: {
      manufacturer: comp.manufacturer,
      partNumber: comp.partNumber,
      componentName: `${comp.partNumber} (${comp.packageType})`,
    },
    provenance: {
      sourceDocument: `${comp.manufacturer} ${comp.partNumber} (${comp.provenance.sourceUrl})`,
      pageOrSection: `${comp.role} / ${comp.packageType}`,
      revision: 'v1.0',
      captureDate: comp.provenance.crawledAt,
      verificationStatus: comp.provenance.evidenceType === 'VERIFIED_OEM' ? 'VERIFIED' : 'TECHNICIAN_CONFIRMED',
      evidenceType: comp.provenance.evidenceType,
      testConditions: comp.electricalBenchSpecs.diodeOrResistanceCheck,
      versionHistory: [
        {
          version: 1,
          updatedAt: comp.provenance.crawledAt,
          actor: 'ecu-pcb-component-ingestion-engine',
          lifecycleStatus: comp.provenance.evidenceType === 'VERIFIED_OEM' ? 'VERIFIED' : 'TECHNICIAN_CONFIRMED',
          changeSummary: `Ingested OEM ECU PCB component specs & guided repair for ${comp.partNumber}`,
        },
      ],
    },
  }));
}
