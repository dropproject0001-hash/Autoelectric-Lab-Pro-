import { DEFAULT_WIRES } from '../simulation/ecu/BenchCircuitSolver';
import type { WireConnection } from '../types/ecu';

export const MAX_WIRE_LABEL_LENGTH = 120;

const DEFAULT_WIRE_ID_SET = new Set<string>(DEFAULT_WIRES.map((wire) => wire.id));

/**
 * Returns true for user-created custom harness connections (not factory default harness wires).
 */
export function isCustomWireConnection(wire: Pick<WireConnection, 'id'>): boolean {
  return !DEFAULT_WIRE_ID_SET.has(wire.id);
}

/**
 * Normalizes an interactive wire label edit.
 * Returns null if the label is empty/whitespace after stripping control characters.
 */
export function normalizeWireLabelInput(rawLabel: string): string | null {
  const cleaned = String(rawLabel ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_WIRE_LABEL_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Sanitizes a wire label for storage and display, falling back when empty.
 */
export function sanitizeWireLabel(
  rawLabel: string,
  fallbackLabel = 'Auxiliary Harness Lead'
): string {
  const normalized = normalizeWireLabelInput(rawLabel);
  if (normalized) return normalized;
  const fallback = normalizeWireLabelInput(fallbackLabel);
  return fallback ?? 'Auxiliary Harness Lead';
}

/**
 * Sanitizes a list of wires to match the Firestore BenchSession schema limits.
 */
export function sanitizeWiresForSession(wires: WireConnection[]): WireConnection[] {
  return wires.slice(0, 50).map((w) => ({
    id: String(w.id).slice(0, 64),
    sourcePinId: String(w.sourcePinId).slice(0, 64),
    targetPinId: String(w.targetPinId).slice(0, 64),
    color: String(w.color).slice(0, 32),
    label: sanitizeWireLabel(w.label),
    isCut: Boolean(w.isCut),
    resistance: Math.max(0, Math.min(1_000_000, Number(w.resistance) || 0.05)),
  }));
}

/**
 * Immutably renames a wire connection in a wire array.
 * Preserves electrical resistance, cut state, color, and endpoint pin IDs.
 * Rejects empty/whitespace-only labels or no-op renames.
 */
export function renameWireInList(
  wires: WireConnection[],
  wireId: string,
  rawNewLabel: string
): { updated: boolean; wires: WireConnection[]; sanitizedLabel: string | null } {
  const target = wires.find((w) => w.id === wireId);
  if (!target) {
    return { updated: false, wires, sanitizedLabel: null };
  }

  const sanitizedLabel = normalizeWireLabelInput(rawNewLabel);
  if (!sanitizedLabel || sanitizedLabel === target.label) {
    return { updated: false, wires, sanitizedLabel: null };
  }

  const nextWires = wires.map((w) =>
    w.id === wireId ? { ...w, label: sanitizedLabel } : w
  );
  return { updated: true, wires: nextWires, sanitizedLabel };
}

/**
 * Extracts custom (non-default) wire connections from a session's wire list.
 */
export function getCustomWires(wires: WireConnection[] | undefined): WireConnection[] {
  if (!Array.isArray(wires)) return [];
  return wires.filter((wire) => isCustomWireConnection(wire));
}
