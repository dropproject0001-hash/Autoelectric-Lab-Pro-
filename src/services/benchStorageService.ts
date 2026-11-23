import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteField,
  writeBatch,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import {
  SavePersistenceResult,
  OfflineMutationCollection,
  OfflineMutationRecord,
  cacheLocalDocument,
  enqueueOfflineMutation,
  flushOfflineMutations,
  getLocalCachedDocuments,
  isTransientOfflineError,
  markMutationSynced,
  refreshPendingCount,
  removeLocalCachedDocument,
  reserveMutationStamp,
} from './offlineSyncQueue';
export type { SavePersistenceResult, CloudSyncStatusSnapshot } from './offlineSyncQueue';
export { getSyncStatusSnapshot, subscribeSyncStatus } from './offlineSyncQueue';
import type { VoiceMacro } from './voiceMacroService';
import {
  BenchComponent,
  FaultType,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import type { RpmEmulatorState } from '../utils/vehicleEcuRegistry';
import {
  GaugeMonitorState,
  sanitizeGaugeMonitorState,
} from '../simulation/telemetry/telemetryTypes';
import { GroundedSearchSource } from './groundedSearchService';
import {
  ImageAnalysisComponent,
  ImageAnalysisHotspot,
  ImageAnalysisNet,
  ImageAnalysisPinSpec,
} from '../server/services/imageAnalysisTypes';
import { sanitizeWiresForSession } from '../utils/wireLabelUtils';
import {
  clearLegacyLocalFaultSequences,
  MAX_ITEMS_PER_STEP,
  MAX_STEPS_PER_SEQUENCE,
  MIN_PULSE_WIDTH_MS,
  readLegacyLocalFaultSequences,
  sanitizeFaultSequence,
  type CustomFaultMode,
  type CustomFaultSequence,
  type FaultBuilderStageItem,
  type FaultSequenceStep,
  type IntermittentEffect,
} from '../simulation/faults/faultSequenceService';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errMessage = error instanceof Error ? error.message : String(error);
  const isBrowserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (errMessage.includes('offline') || errMessage.includes('unavailable') || isBrowserOffline) {
    console.debug('Firestore offline / network unavailable:', path);
    throw new Error('FIRESTORE_OFFLINE_SUPPRESSED');
  }
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const SCHEMA_VERSION_SUBCOLLECTIONS = 2;

export const LOCAL_WORKSTATION_UID = 'local_workstation';

export function isLocalWorkstationUid(uid: string | null | undefined): boolean {
  return uid === LOCAL_WORKSTATION_UID;
}

const localCollectionListeners = new Map<OfflineMutationCollection, Set<() => void>>();

function subscribeLocalCollectionChange(
  col: OfflineMutationCollection,
  listener: () => void
): () => void {
  let set = localCollectionListeners.get(col);
  if (!set) {
    set = new Set();
    localCollectionListeners.set(col, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

function notifyLocalCollectionChange(col: OfflineMutationCollection): void {
  const set = localCollectionListeners.get(col);
  if (!set) return;
  set.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore subscriber errors
    }
  });
}

function makeLocalTimestamp(ms = Date.now()): Timestamp {
  return Timestamp.fromMillis(ms);
}

export interface SavedBenchSession {
  id: string;
  ownerId: string;
  title: string;
  notes: string;
  ecuProfileLabel: string;
  powerSupply: PowerSupplyState;
  wires: WireConnection[];
  faults: InjectedFault[];
  componentStates: Record<string, Record<string, number | boolean | string>>;
  activeDtcs: string[];
  supplyCurrentDrawAmps: number;
  wireCount?: number;
  faultCount?: number;
  componentStateCount?: number;
  schemaVersion?: number;
  selectedBrandKey?: string;
  selectedModelName?: string;
  selectedEcuProfileId?: string | null;
  rpmEmulator?: RpmEmulatorState;
  gaugeMonitor?: GaugeMonitorState;
  multimeter?: MultimeterState;
  workflowCheckedIds?: string[];
  preBenchGateLocked?: boolean;
  syncState?: 'SYNCED_CLOUD' | 'QUEUED_OFFLINE';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface SavedBenchPreferences {
  id: string;
  ownerId: string;
  workflowCheckedIds: string[];
  preBenchGateLocked: boolean;
  autoVerifyWorkflow: boolean;
  voiceMacros: VoiceMacro[];
  voiceMacroCount?: number;
  schemaVersion?: number;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface SavedDiagnosticLog {
  id: string;
  ownerId: string;
  title: string;
  dtcCode: string;
  ecuModel: string;
  sourceType: 'GROUNDED_TSB' | 'BENCH_SNAPSHOT' | 'PINOUT_NOTE';
  summary: string;
  sources: GroundedSearchSource[];
  sourceCount?: number;
  schemaVersion?: number;
  syncState?: 'SYNCED_CLOUD' | 'QUEUED_OFFLINE';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface SavedPcbScan {
  id: string;
  ownerId: string;
  title: string;
  boardType: string;
  analysisSummary: string;
  model: string;
  components: ImageAnalysisComponent[];
  nets: ImageAnalysisNet[];
  hotspots: ImageAnalysisHotspot[];
  componentCount?: number;
  netCount?: number;
  hotspotCount?: number;
  schemaVersion?: number;
  syncState?: 'SYNCED_CLOUD' | 'QUEUED_OFFLINE';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
}

export function toSafeFirestoreDocId(
  raw: string,
  fallbackPrefix: string,
  index: number,
  usedIds?: Set<string>
): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 118);
  const base = cleaned || `${fallbackPrefix}_${index}`;
  let candidate = base.slice(0, 128);
  if (usedIds) {
    let suffix = 1;
    while (usedIds.has(candidate)) {
      const tag = `_${suffix++}`;
      candidate = `${base.slice(0, 128 - tag.length)}${tag}`;
    }
    usedIds.add(candidate);
  }
  return candidate;
}

type BatchWriteOp = (batch: ReturnType<typeof writeBatch>) => void;

async function commitWriteOpsInChunks(ops: BatchWriteOp[], chunkSize = 400): Promise<void> {
  for (let i = 0; i < ops.length; i += chunkSize) {
    const batch = writeBatch(db);
    const slice = ops.slice(i, i + chunkSize);
    for (const op of slice) {
      op(batch);
    }
    await batch.commit();
  }
}

const VALID_FAULT_TYPES = new Set<FaultType>([
  'NONE',
  'OPEN_CIRCUIT',
  'SHORT_TO_GND',
  'SHORT_TO_VBAT',
  'HIGH_RESISTANCE_50R',
  'HIGH_RESISTANCE_250R',
  'HIGH_RESISTANCE_1K',
]);

function normalizeFaultType(raw: unknown): FaultType {
  const val = String(raw || 'OPEN_CIRCUIT') as FaultType;
  return VALID_FAULT_TYPES.has(val) ? val : 'OPEN_CIRCUIT';
}

function sanitizeFaultsList(faults: InjectedFault[]): InjectedFault[] {
  return (faults || []).slice(0, 20).map((f) => ({
    pinId: String(f.pinId || 'ecu-pin-1').slice(0, 64) || 'ecu-pin-1',
    faultType: normalizeFaultType(f.faultType),
    description: String(f.description || '').slice(0, 240),
    timestamp: Math.max(0, Number(f.timestamp) || Date.now()),
  }));
}

function sanitizeComponentStateMap(
  rawState: Record<string, unknown> | undefined
): Record<string, number | boolean | string> {
  if (!rawState || typeof rawState !== 'object') return {};
  const cleaned: Record<string, number | boolean | string> = {};
  const entries = Object.entries(rawState).slice(0, 24);
  for (const [k, v] of entries) {
    const key = String(k).slice(0, 48);
    if (!key) continue;
    if (typeof v === 'number') {
      cleaned[key] = Number.isFinite(v) ? v : 0;
    } else if (typeof v === 'boolean') {
      cleaned[key] = v;
    } else if (typeof v === 'string') {
      cleaned[key] = v.slice(0, 120);
    }
  }
  return cleaned;
}

function sanitizeComponentStatesRecord(
  raw: Record<string, Record<string, number | boolean | string>>
): Record<string, Record<string, number | boolean | string>> {
  const out: Record<string, Record<string, number | boolean | string>> = {};
  const entries = Object.entries(raw || {}).slice(0, 40);
  for (const [compId, stateMap] of entries) {
    const cleanId = String(compId || '').slice(0, 64);
    if (!cleanId) continue;
    const cleaned = sanitizeComponentStateMap(stateMap);
    if (Object.keys(cleaned).length > 0) {
      out[cleanId] = cleaned;
    }
  }
  return out;
}

function sanitizeSourcesList(sources?: GroundedSearchSource[]): GroundedSearchSource[] {
  return (sources || []).slice(0, 20).map((s) => ({
    title: String(s.title || '').slice(0, 200),
    uri: String(s.uri || '').slice(0, 1000),
    domain: String(s.domain || '').slice(0, 120),
  }));
}

function normalizeConfidenceScore(raw: unknown): number {
  const num = Number(raw);
  if (!Number.isFinite(num)) return 0.7;
  if (num > 1 && num <= 100) return Math.min(1, Math.max(0, num / 100));
  return Math.min(1, Math.max(0, num));
}

function clampCoord1000(raw: unknown): number {
  const n = Math.round(Number(raw) || 0);
  return Math.min(1000, Math.max(0, n));
}

function normalizeVerificationStatus(
  raw: unknown
): 'VERIFIED' | 'CROSS_REFERENCED' | 'UNVERIFIED' | 'UNKNOWN' {
  const val = String(raw || 'UNVERIFIED');
  if (val === 'VERIFIED' || val === 'CROSS_REFERENCED' || val === 'UNVERIFIED' || val === 'UNKNOWN') {
    return val;
  }
  return 'UNVERIFIED';
}

function normalizePinCategory(raw: unknown): ImageAnalysisPinSpec['category'] {
  const val = String(raw || 'signal_in');
  if (
    val === 'power' ||
    val === 'ground' ||
    val === 'signal_in' ||
    val === 'signal_out' ||
    val === 'driver_out' ||
    val === 'bus'
  ) {
    return val;
  }
  return 'signal_in';
}

function sanitizePcbComponentsList(components: ImageAnalysisComponent[]): ImageAnalysisComponent[] {
  return (components || []).slice(0, 60).map((c, compIdx) => ({
    refDes: String(c.refDes || `U${compIdx + 1}`).slice(0, 32) || `U${compIdx + 1}`,
    category: String(c.category || 'IC').slice(0, 64) || 'IC',
    marking: String(c.marking || '').slice(0, 64),
    decodedValue: String(c.decodedValue || '').slice(0, 80),
    packageType: String(c.packageType || '').slice(0, 64),
    bbox: {
      ymin: clampCoord1000(c.bbox?.ymin),
      xmin: clampCoord1000(c.bbox?.xmin),
      ymax: clampCoord1000(c.bbox?.ymax),
      xmax: clampCoord1000(c.bbox?.xmax),
    },
    confidenceScore: normalizeConfidenceScore(c.confidenceScore),
    verificationStatus: normalizeVerificationStatus(c.verificationStatus),
    circuitFunction: String(c.circuitFunction || '').slice(0, 240),
    terminalIds: (c.terminalIds || []).slice(0, 24).map((t) => String(t).slice(0, 32)),
    notes: String(c.notes || '').slice(0, 400),
    operatingVoltageRange: String(c.operatingVoltageRange || '').slice(0, 64),
    maxCurrentRating: String(c.maxCurrentRating || '').slice(0, 64),
    datasheetSummary: String(c.datasheetSummary || '').slice(0, 400),
    pinSpecs: (c.pinSpecs || []).slice(0, 24).map((p, idx) => ({
      pinNumber: Math.max(0, Math.min(1024, Number(p.pinNumber) || idx + 1)),
      pinName: String(p.pinName || '').slice(0, 40),
      category: normalizePinCategory(p.category),
      nominalVoltage: Math.max(-100, Math.min(1000, Number(p.nominalVoltage) || 0)),
      connectedNetId: String(p.connectedNetId || 'NET_UNASSIGNED').slice(0, 64),
      notes: String(p.notes || '').slice(0, 200),
    })),
    source: c.source === 'LOCAL_CV' || c.source === 'MANUAL' ? c.source : 'AI',
  }));
}

function sanitizePcbNetsList(nets: ImageAnalysisNet[]): ImageAnalysisNet[] {
  return (nets || []).slice(0, 40).map((n, netIdx) => ({
    name: String(n.name || `NET_${netIdx + 1}`).slice(0, 64) || `NET_${netIdx + 1}`,
    signalType: String(n.signalType || 'SIGNAL').slice(0, 48) || 'SIGNAL',
    connectedComponentRefs: (n.connectedComponentRefs || [])
      .slice(0, 32)
      .map((r) => String(r).slice(0, 32)),
    connectedTerminalIds: (n.connectedTerminalIds || [])
      .slice(0, 32)
      .map((t) => String(t).slice(0, 32)),
    tracePoints: (n.tracePoints || []).slice(0, 40).map((pt) => ({
      x: clampCoord1000(pt.x),
      y: clampCoord1000(pt.y),
    })),
    confidenceScore: normalizeConfidenceScore(n.confidenceScore),
    verificationStatus: normalizeVerificationStatus(n.verificationStatus),
    isComplete: Boolean(n.isComplete),
    incompleteNotes: String(n.incompleteNotes || '').slice(0, 240),
  }));
}

function sanitizePcbHotspotsList(hotspots?: ImageAnalysisHotspot[]): ImageAnalysisHotspot[] {
  return (hotspots || []).slice(0, 30).map((h, hsIdx) => {
    const severity =
      h.severity === 'CRITICAL' || h.severity === 'WARNING' || h.severity === 'INFO'
        ? h.severity
        : 'WARNING';
    return {
      id: String(h.id || `hotspot_${hsIdx + 1}`).slice(0, 64) || `hotspot_${hsIdx + 1}`,
      label: String(h.label || 'PCB Hotspot').slice(0, 120) || 'PCB Hotspot',
      severity,
      bbox: {
        ymin: clampCoord1000(h.bbox?.ymin),
        xmin: clampCoord1000(h.bbox?.xmin),
        ymax: clampCoord1000(h.bbox?.ymax),
        xmax: clampCoord1000(h.bbox?.xmax),
      },
      suspectComponentRef: String(h.suspectComponentRef || '').slice(0, 32),
      notes: String(h.notes || '').slice(0, 300),
      source: h.source === 'AI' ? 'AI' : 'LOCAL_CV',
    };
  });
}

function sanitizeBenchSessionHeader(
  uid: string,
  sessionId: string,
  raw: {
    title: string;
    notes?: string;
    ecuProfileLabel?: string;
    powerSupply: PowerSupplyState;
    activeDtcs: string[];
    supplyCurrentDrawAmps: number;
    wireCount: number;
    faultCount: number;
    componentStateCount: number;
    selectedBrandKey?: string;
    selectedModelName?: string;
    selectedEcuProfileId?: string | null;
    rpmEmulator?: RpmEmulatorState;
    gaugeMonitor?: GaugeMonitorState;
    multimeter?: MultimeterState;
    workflowCheckedIds?: string[];
    preBenchGateLocked?: boolean;
  }
): Record<string, unknown> {
  const sanitizedDtcs = (raw.activeDtcs || [])
    .slice(0, 20)
    .map((code) => String(code).slice(0, 32));

  const header: Record<string, unknown> = {
    id: sessionId,
    ownerId: uid,
    title: String(raw.title || '').trim().slice(0, 120) || 'ECU Bench Snapshot',
    notes: String(raw.notes || '').trim().slice(0, 1000),
    ecuProfileLabel:
      String(raw.ecuProfileLabel || 'Universal ECU Bench').trim().slice(0, 120) ||
      'Universal ECU Bench',
    powerSupply: {
      voltageSetting: Math.max(0, Math.min(60, Number(raw.powerSupply.voltageSetting) || 0)),
      currentLimit: Math.max(0, Math.min(50, Number(raw.powerSupply.currentLimit) || 0)),
      isOutputEnabled: Boolean(raw.powerSupply.isOutputEnabled),
      preset: String(raw.powerSupply.preset || 'CUSTOM').slice(0, 32) || 'CUSTOM',
    },
    activeDtcs: sanitizedDtcs,
    supplyCurrentDrawAmps: Math.max(0, Math.min(200, Number(raw.supplyCurrentDrawAmps) || 0)),
    wireCount: Math.max(0, Math.min(50, Math.trunc(raw.wireCount))),
    faultCount: Math.max(0, Math.min(20, Math.trunc(raw.faultCount))),
    componentStateCount: Math.max(0, Math.min(40, Math.trunc(raw.componentStateCount))),
    schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
  };

  if (raw.selectedBrandKey !== undefined) {
    header.selectedBrandKey = String(raw.selectedBrandKey).slice(0, 64);
  }
  if (raw.selectedModelName !== undefined) {
    header.selectedModelName = String(raw.selectedModelName).slice(0, 120);
  }
  if (raw.selectedEcuProfileId !== undefined) {
    header.selectedEcuProfileId = raw.selectedEcuProfileId
      ? String(raw.selectedEcuProfileId).slice(0, 64)
      : null;
  }
  if (raw.rpmEmulator) {
    header.rpmEmulator = {
      isActive: Boolean(raw.rpmEmulator.isActive),
      rpm: Math.max(0, Math.min(15000, Number(raw.rpmEmulator.rpm) || 850)),
      soundEnabled: Boolean(raw.rpmEmulator.soundEnabled),
      camPhaseOffsetDeg: Math.max(
        -360,
        Math.min(360, Number(raw.rpmEmulator.camPhaseOffsetDeg) || 0)
      ),
      ckpSignalLost: Boolean(raw.rpmEmulator.ckpSignalLost),
    };
  }
  if (raw.gaugeMonitor) {
    header.gaugeMonitor = sanitizeGaugeMonitorState(raw.gaugeMonitor);
  }
  if (raw.multimeter) {
    header.multimeter = {
      mode: String(raw.multimeter.mode).slice(0, 24),
      redProbe: {
        attachedToPinId: raw.multimeter.redProbe.attachedToPinId
          ? String(raw.multimeter.redProbe.attachedToPinId).slice(0, 64)
          : null,
        attachedLabel: String(raw.multimeter.redProbe.attachedLabel || 'Unconnected').slice(0, 120),
      },
      blackProbe: {
        attachedToPinId: raw.multimeter.blackProbe.attachedToPinId
          ? String(raw.multimeter.blackProbe.attachedToPinId).slice(0, 64)
          : null,
        attachedLabel: String(raw.multimeter.blackProbe.attachedLabel || 'Unconnected').slice(0, 120),
      },
      isPowered: Boolean(raw.multimeter.isPowered),
      rangeAuto: Boolean(raw.multimeter.rangeAuto),
      holdValue: Boolean(raw.multimeter.holdValue),
    };
  }
  if (Array.isArray(raw.workflowCheckedIds)) {
    header.workflowCheckedIds = Array.from(new Set(raw.workflowCheckedIds))
      .slice(0, 20)
      .map((id) => String(id).slice(0, 64));
  }
  if (typeof raw.preBenchGateLocked === 'boolean') {
    header.preBenchGateLocked = raw.preBenchGateLocked;
  }

  return header;
}

async function writeBenchSessionBundleToFirestore(
  uid: string,
  sessionId: string,
  header: Record<string, unknown>,
  wires: WireConnection[],
  faults: InjectedFault[],
  componentStates: Record<string, Record<string, number | boolean | string>>
): Promise<void> {
  const ops: BatchWriteOp[] = [];
  const parentRef = doc(db, 'users', uid, 'benchSessions', sessionId);
  ops.push((batch) => {
    batch.set(parentRef, {
      ...header,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  const usedWireIds = new Set<string>();
  wires.slice(0, 50).forEach((w, idx) => {
    const wireDocId = toSafeFirestoreDocId(w.id, 'wire', idx, usedWireIds);
    const wireRef = doc(db, 'users', uid, 'benchSessions', sessionId, 'wires', wireDocId);
    ops.push((batch) => {
      batch.set(wireRef, {
        id: wireDocId,
        ownerId: uid,
        sessionId,
        sourcePinId: String(w.sourcePinId).slice(0, 64),
        targetPinId: String(w.targetPinId).slice(0, 64),
        color: String(w.color || '#94a3b8').slice(0, 32) || '#94a3b8',
        label: String(w.label || '').slice(0, 120),
        isCut: Boolean(w.isCut),
        resistance: Math.max(0, Math.min(1_000_000, Number(w.resistance) || 0.05)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  });

  const usedFaultIds = new Set<string>();
  faults.slice(0, 20).forEach((f, idx) => {
    const faultDocId = toSafeFirestoreDocId(`fault_${idx}_${f.pinId}`, 'fault', idx, usedFaultIds);
    const faultRef = doc(db, 'users', uid, 'benchSessions', sessionId, 'faults', faultDocId);
    ops.push((batch) => {
      batch.set(faultRef, {
        id: faultDocId,
        ownerId: uid,
        sessionId,
        pinId: String(f.pinId).slice(0, 64),
        faultType: normalizeFaultType(f.faultType),
        description: String(f.description || '').slice(0, 240),
        timestamp: Math.max(0, Number(f.timestamp) || Date.now()),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  });

  const usedCompIds = new Set<string>();
  Object.entries(componentStates)
    .slice(0, 40)
    .forEach(([compId, stateMap], idx) => {
      const compDocId = toSafeFirestoreDocId(compId, 'comp', idx, usedCompIds);
      const compRef = doc(
        db,
        'users',
        uid,
        'benchSessions',
        sessionId,
        'componentStates',
        compDocId
      );
      ops.push((batch) => {
        batch.set(compRef, {
          id: compDocId,
          ownerId: uid,
          sessionId,
          componentId: String(compId).slice(0, 64),
          state: sanitizeComponentStateMap(stateMap),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    });

  await commitWriteOpsInChunks(ops);
}

/**
 * Ensure user profile document exists in Firestore under /users/{uid}.
 */
export async function syncUserProfile(
  uid: string,
  email: string,
  displayName?: string | null
): Promise<void> {
  if (!db || isLocalWorkstationUid(uid)) return;
  const path = `users/${uid}`;
  const userRef = doc(db, 'users', uid);
  const safeEmail = email.trim().slice(0, 254);
  if (safeEmail.length < 3) return;
  const safeName = (displayName || '').slice(0, 120);

  const stamp = reserveMutationStamp(uid, 'users', uid);

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueueOfflineMutation({
      uid,
      collection: 'users',
      docId: uid,
      payload: { uid, email: safeEmail, displayName: safeName },
      version: stamp.version,
      updatedAtMs: stamp.updatedAtMs,
    });
    return;
  }

  try {
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      await setDoc(userRef, {
        uid,
        email: safeEmail,
        displayName: safeName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(
        userRef,
        {
          email: safeEmail,
          displayName: safeName,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    await markMutationSynced(uid, 'users', uid, undefined, {
      expectedVersion: stamp.version,
      expectedUpdatedAtMs: stamp.updatedAtMs,
    });
  } catch (error) {
    if (isTransientOfflineError(error)) {
      await enqueueOfflineMutation({
        uid,
        collection: 'users',
        docId: uid,
        payload: { uid, email: safeEmail, displayName: safeName },
        lastError: error instanceof Error ? error.message : String(error),
        version: stamp.version,
        updatedAtMs: stamp.updatedAtMs,
      });
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Save a full ECU bench workspace snapshot with wires, faults, and componentStates stored
 * in individually validated Firestore subcollections under /users/{uid}/benchSessions/{sessionId}.
 */
export async function saveBenchSession(
  uid: string,
  payload: {
    title: string;
    notes?: string;
    ecuProfileLabel?: string;
    powerSupply: PowerSupplyState;
    wires: WireConnection[];
    faults: InjectedFault[];
    components: BenchComponent[];
    activeDtcs: string[];
    supplyCurrentDrawAmps: number;
    selectedBrandKey?: string;
    selectedModelName?: string;
    selectedEcuProfileId?: string | null;
    rpmEmulator?: RpmEmulatorState;
    gaugeMonitor?: GaugeMonitorState;
    multimeter?: MultimeterState;
    workflowCheckedIds?: string[];
    preBenchGateLocked?: boolean;
  }
): Promise<SavePersistenceResult> {
  const sessionId = makeSafeId('bench');
  const path = `users/${uid}/benchSessions/${sessionId}`;

  const rawCompStates: Record<string, Record<string, number | boolean | string>> = {};
  for (const comp of payload.components) {
    if (comp.state && Object.keys(comp.state).length > 0) {
      rawCompStates[comp.id] = { ...comp.state };
    }
  }
  const componentStates = sanitizeComponentStatesRecord(rawCompStates);
  const sanitizedWires = sanitizeWiresForSession(payload.wires).slice(0, 50);
  const sanitizedFaults = sanitizeFaultsList(payload.faults);

  try {
    const headerDoc = sanitizeBenchSessionHeader(uid, sessionId, {
      ...payload,
      wireCount: sanitizedWires.length,
      faultCount: sanitizedFaults.length,
      componentStateCount: Object.keys(componentStates).length,
    });

    // Preserve full in-memory copy for immediate offline hydration in UI
    const queuePayload: Record<string, unknown> = {
      ...headerDoc,
      wires: sanitizedWires,
      faults: sanitizedFaults,
      componentStates,
    };

    const stamp = reserveMutationStamp(uid, 'benchSessions', sessionId);

    if (isLocalWorkstationUid(uid)) {
      const nowMs = Date.now();
      await cacheLocalDocument({
        uid,
        collection: 'benchSessions',
        docId: sessionId,
        data: {
          ...queuePayload,
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
        },
        syncState: 'SYNCED_CLOUD',
        version: stamp.version,
        updatedAtMs: nowMs,
      });
      notifyLocalCollectionChange('benchSessions');
      return {
        id: sessionId,
        syncedToCloud: false,
        queuedOffline: false,
        syncState: 'SYNCED_CLOUD',
      };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await enqueueOfflineMutation({
        uid,
        collection: 'benchSessions',
        docId: sessionId,
        payload: queuePayload,
        lastError: 'Browser offline — queued for automatic cloud sync',
        version: stamp.version,
        updatedAtMs: stamp.updatedAtMs,
      });
      return {
        id: sessionId,
        syncedToCloud: false,
        queuedOffline: true,
        syncState: 'QUEUED_OFFLINE',
      };
    }

    try {
      await writeBenchSessionBundleToFirestore(
        uid,
        sessionId,
        headerDoc,
        sanitizedWires,
        sanitizedFaults,
        componentStates
      );
      await markMutationSynced(uid, 'benchSessions', sessionId, queuePayload, {
        expectedVersion: stamp.version,
        expectedUpdatedAtMs: stamp.updatedAtMs,
      });
      return {
        id: sessionId,
        syncedToCloud: true,
        queuedOffline: false,
        syncState: 'SYNCED_CLOUD',
      };
    } catch (writeErr) {
      if (isTransientOfflineError(writeErr)) {
        await enqueueOfflineMutation({
          uid,
          collection: 'benchSessions',
          docId: sessionId,
          payload: queuePayload,
          lastError: writeErr instanceof Error ? writeErr.message : String(writeErr),
          version: stamp.version,
          updatedAtMs: stamp.updatedAtMs,
        });
        return {
          id: sessionId,
          syncedToCloud: false,
          queuedOffline: true,
          syncState: 'QUEUED_OFFLINE',
        };
      }
      throw writeErr;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

const BENCH_SESSION_UPDATABLE_KEYS = new Set<string>([
  'title',
  'notes',
  'ecuProfileLabel',
  'powerSupply',
  'activeDtcs',
  'supplyCurrentDrawAmps',
  'wireCount',
  'faultCount',
  'componentStateCount',
  'schemaVersion',
  'selectedBrandKey',
  'selectedModelName',
  'selectedEcuProfileId',
  'rpmEmulator',
  'gaugeMonitor',
  'multimeter',
  'workflowCheckedIds',
  'preBenchGateLocked',
]);

export function buildBenchSessionUpdatePayload(
  rawPayload: Record<string, unknown>
): Record<string, unknown> {
  const updateData: Record<string, unknown> = {};
  for (const key of BENCH_SESSION_UPDATABLE_KEYS) {
    if (key in rawPayload && rawPayload[key] !== undefined) {
      updateData[key] = rawPayload[key];
    }
  }
  return updateData;
}

export const CONFLICT_COPY_TITLE_SUFFIX = ' [Conflict Copy]';

export function extractRemoteUpdatedAtMs(
  remoteDocData: Record<string, unknown> | undefined | null
): number | null {
  if (!remoteDocData || typeof remoteDocData !== 'object') return null;
  const rawUpdated = remoteDocData.updatedAt;
  if (rawUpdated && typeof rawUpdated === 'object') {
    const maybeToMillis = (rawUpdated as { toMillis?: unknown }).toMillis;
    if (typeof maybeToMillis === 'function') {
      const ms = Number((maybeToMillis as () => number).call(rawUpdated));
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
    const maybeSeconds = (rawUpdated as { seconds?: unknown; nanoseconds?: unknown }).seconds;
    if (typeof maybeSeconds === 'number' && Number.isFinite(maybeSeconds)) {
      const nanos =
        typeof (rawUpdated as { nanoseconds?: unknown }).nanoseconds === 'number'
          ? Number((rawUpdated as { nanoseconds?: unknown }).nanoseconds)
          : 0;
      const ms = Math.round(maybeSeconds * 1000 + nanos / 1_000_000);
      if (ms > 0) return ms;
    }
  }
  if (typeof rawUpdated === 'number' && Number.isFinite(rawUpdated) && rawUpdated > 0) {
    return rawUpdated;
  }
  if (
    typeof remoteDocData.updatedAtMs === 'number' &&
    Number.isFinite(remoteDocData.updatedAtMs) &&
    remoteDocData.updatedAtMs > 0
  ) {
    return remoteDocData.updatedAtMs;
  }
  return null;
}

export function hasRemoteSessionConflict(
  baseUpdatedAtMs: number | undefined | null,
  remoteUpdatedAtMs: number | undefined | null
): boolean {
  return Boolean(
    typeof baseUpdatedAtMs === 'number' &&
      Number.isFinite(baseUpdatedAtMs) &&
      baseUpdatedAtMs > 0 &&
      typeof remoteUpdatedAtMs === 'number' &&
      Number.isFinite(remoteUpdatedAtMs) &&
      remoteUpdatedAtMs > 0 &&
      remoteUpdatedAtMs > baseUpdatedAtMs
  );
}

export function formatConflictCopyTitle(rawTitle: string): string {
  const base = String(rawTitle || '').trim() || 'ECU Bench Snapshot';
  if (base.endsWith(CONFLICT_COPY_TITLE_SUFFIX)) {
    return base.slice(0, 120);
  }
  const maxBaseLen = 120 - CONFLICT_COPY_TITLE_SUFFIX.length;
  return `${base.slice(0, maxBaseLen).trimEnd()}${CONFLICT_COPY_TITLE_SUFFIX}`;
}

export function buildConflictCopySessionPayload(
  uid: string,
  conflictSessionId: string,
  header: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...header,
    id: conflictSessionId,
    ownerId: uid,
    title: formatConflictCopyTitle(String(header.title || 'ECU Bench Snapshot')),
  };
}

function buildSerializableSessionSnapshot(
  uid: string,
  sessionId: string,
  sanitizedWires: WireConnection[],
  existingSession?: SavedBenchSession
): Record<string, unknown> {
  const baseUpdatedAtMs = extractRemoteUpdatedAtMs(
    existingSession as unknown as Record<string, unknown> | undefined
  );
  if (!existingSession) {
    return {
      id: sessionId,
      ownerId: uid,
      wires: sanitizedWires,
      wireCount: sanitizedWires.length,
      schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
    };
  }

  const snapshot: Record<string, unknown> = {
    id: sessionId,
    ownerId: uid,
    title: existingSession.title,
    notes: existingSession.notes || '',
    ecuProfileLabel: existingSession.ecuProfileLabel || 'Universal ECU Bench',
    powerSupply: existingSession.powerSupply,
    wires: sanitizedWires,
    faults: existingSession.faults || [],
    componentStates: existingSession.componentStates || {},
    activeDtcs: existingSession.activeDtcs || [],
    supplyCurrentDrawAmps: Number(existingSession.supplyCurrentDrawAmps) || 0,
    wireCount: sanitizedWires.length,
    faultCount: (existingSession.faults || []).length,
    componentStateCount: Object.keys(existingSession.componentStates || {}).length,
    schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
    ...(baseUpdatedAtMs !== null ? { baseUpdatedAtMs } : {}),
  };

  if (existingSession.selectedBrandKey !== undefined) {
    snapshot.selectedBrandKey = existingSession.selectedBrandKey;
  }
  if (existingSession.selectedModelName !== undefined) {
    snapshot.selectedModelName = existingSession.selectedModelName;
  }
  if (existingSession.selectedEcuProfileId !== undefined) {
    snapshot.selectedEcuProfileId = existingSession.selectedEcuProfileId;
  }
  if (existingSession.rpmEmulator !== undefined) {
    snapshot.rpmEmulator = existingSession.rpmEmulator;
  }
  if (existingSession.gaugeMonitor !== undefined) {
    snapshot.gaugeMonitor = sanitizeGaugeMonitorState(existingSession.gaugeMonitor);
  }
  if (existingSession.multimeter !== undefined) {
    snapshot.multimeter = existingSession.multimeter;
  }
  if (Array.isArray(existingSession.workflowCheckedIds)) {
    snapshot.workflowCheckedIds = existingSession.workflowCheckedIds;
  }
  if (typeof existingSession.preBenchGateLocked === 'boolean') {
    snapshot.preBenchGateLocked = existingSession.preBenchGateLocked;
  }

  return snapshot;
}

async function syncBenchSessionWiresSubcollection(
  uid: string,
  sessionId: string,
  sanitizedWires: WireConnection[],
  baseUpdatedAtMs?: number,
  fallbackSnapshot?: Record<string, unknown>
): Promise<{ targetSessionId: string; conflictForked: boolean }> {
  const parentRef = doc(db, 'users', uid, 'benchSessions', sessionId);
  const parentSnap = await getDoc(parentRef);
  if (!parentSnap.exists()) {
    throw new Error('Saved bench session not found.');
  }

  const parentRaw = parentSnap.data() as Record<string, unknown>;
  const remoteUpdatedAtMs = extractRemoteUpdatedAtMs(parentRaw);

  if (
    hasRemoteSessionConflict(baseUpdatedAtMs, remoteUpdatedAtMs) &&
    fallbackSnapshot &&
    'title' in fallbackSnapshot &&
    'powerSupply' in fallbackSnapshot
  ) {
    const conflictSessionId = makeSafeId('bench_conflict');
    const faults = sanitizeFaultsList((fallbackSnapshot.faults as InjectedFault[]) || []);
    const componentStates = sanitizeComponentStatesRecord(
      (fallbackSnapshot.componentStates as Record<
        string,
        Record<string, number | boolean | string>
      >) || {}
    );
    const headerDoc = sanitizeBenchSessionHeader(uid, conflictSessionId, {
      title: formatConflictCopyTitle(String(fallbackSnapshot.title || 'ECU Bench Snapshot')),
      notes: typeof fallbackSnapshot.notes === 'string' ? fallbackSnapshot.notes : '',
      ecuProfileLabel:
        typeof fallbackSnapshot.ecuProfileLabel === 'string'
          ? fallbackSnapshot.ecuProfileLabel
          : 'Universal ECU Bench',
      powerSupply: fallbackSnapshot.powerSupply as PowerSupplyState,
      activeDtcs: Array.isArray(fallbackSnapshot.activeDtcs)
        ? fallbackSnapshot.activeDtcs.map(String)
        : [],
      supplyCurrentDrawAmps: Number(fallbackSnapshot.supplyCurrentDrawAmps) || 0,
      wireCount: sanitizedWires.slice(0, 50).length,
      faultCount: faults.length,
      componentStateCount: Object.keys(componentStates).length,
      selectedBrandKey:
        typeof fallbackSnapshot.selectedBrandKey === 'string'
          ? fallbackSnapshot.selectedBrandKey
          : undefined,
      selectedModelName:
        typeof fallbackSnapshot.selectedModelName === 'string'
          ? fallbackSnapshot.selectedModelName
          : undefined,
      selectedEcuProfileId:
        fallbackSnapshot.selectedEcuProfileId === null ||
        typeof fallbackSnapshot.selectedEcuProfileId === 'string'
          ? fallbackSnapshot.selectedEcuProfileId
          : undefined,
      rpmEmulator: fallbackSnapshot.rpmEmulator as RpmEmulatorState | undefined,
      gaugeMonitor: fallbackSnapshot.gaugeMonitor as GaugeMonitorState | undefined,
      multimeter: fallbackSnapshot.multimeter as MultimeterState | undefined,
      workflowCheckedIds: Array.isArray(fallbackSnapshot.workflowCheckedIds)
        ? fallbackSnapshot.workflowCheckedIds.map(String)
        : undefined,
      preBenchGateLocked:
        typeof fallbackSnapshot.preBenchGateLocked === 'boolean'
          ? fallbackSnapshot.preBenchGateLocked
          : undefined,
    });
    await writeBenchSessionBundleToFirestore(
      uid,
      conflictSessionId,
      headerDoc,
      sanitizedWires,
      faults,
      componentStates
    );
    return { targetSessionId: conflictSessionId, conflictForked: true };
  }

  const wiresSnap = await getDocs(
    query(collection(db, 'users', uid, 'benchSessions', sessionId, 'wires'), where('ownerId', '==', uid))
  );
  const existingWireIds = new Set(wiresSnap.docs.map((d) => d.id));

  const ops: BatchWriteOp[] = [];
  const usedWireIds = new Set<string>();
  const targetWireIds = new Set<string>();
  const limitedWires = sanitizedWires.slice(0, 50);

  limitedWires.forEach((w, idx) => {
    const wireDocId = toSafeFirestoreDocId(w.id, 'wire', idx, usedWireIds);
    targetWireIds.add(wireDocId);
    const wireRef = doc(db, 'users', uid, 'benchSessions', sessionId, 'wires', wireDocId);
    const wireFields = {
      sourcePinId: String(w.sourcePinId).slice(0, 64),
      targetPinId: String(w.targetPinId).slice(0, 64),
      color: String(w.color || '#94a3b8').slice(0, 32) || '#94a3b8',
      label: String(w.label || '').slice(0, 120),
      isCut: Boolean(w.isCut),
      resistance: Math.max(0, Math.min(1_000_000, Number(w.resistance) || 0.05)),
      updatedAt: serverTimestamp(),
    };
    if (existingWireIds.has(wireDocId)) {
      ops.push((batch) => {
        batch.update(wireRef, wireFields);
      });
    } else {
      ops.push((batch) => {
        batch.set(wireRef, {
          id: wireDocId,
          ownerId: uid,
          sessionId,
          ...wireFields,
          createdAt: serverTimestamp(),
        });
      });
    }
  });

  for (const existingDoc of wiresSnap.docs) {
    if (!targetWireIds.has(existingDoc.id)) {
      ops.push((batch) => {
        batch.delete(existingDoc.ref);
      });
    }
  }

  const parentUpdates: Record<string, unknown> = {
    wireCount: limitedWires.length,
    schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
    updatedAt: serverTimestamp(),
  };

  // Transparently migrate legacy inline faults / componentStates to subcollections on first v2 update
  if ('wires' in parentRaw) {
    parentUpdates.wires = deleteField();
  }
  if ('faults' in parentRaw) {
    const legacyFaults = Array.isArray(parentRaw.faults)
      ? sanitizeFaultsList(parentRaw.faults as InjectedFault[])
      : [];
    const usedFaultIds = new Set<string>();
    legacyFaults.forEach((f, idx) => {
      const faultDocId = toSafeFirestoreDocId(`fault_${idx}_${f.pinId}`, 'fault', idx, usedFaultIds);
      const faultRef = doc(db, 'users', uid, 'benchSessions', sessionId, 'faults', faultDocId);
      ops.push((batch) => {
        batch.set(faultRef, {
          id: faultDocId,
          ownerId: uid,
          sessionId,
          ...f,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    });
    parentUpdates.faultCount = legacyFaults.length;
    parentUpdates.faults = deleteField();
  }
  if ('componentStates' in parentRaw) {
    const legacyStates =
      parentRaw.componentStates && typeof parentRaw.componentStates === 'object'
        ? sanitizeComponentStatesRecord(
            parentRaw.componentStates as Record<string, Record<string, number | boolean | string>>
          )
        : {};
    const usedCompIds = new Set<string>();
    Object.entries(legacyStates).forEach(([compId, stateMap], idx) => {
      const compDocId = toSafeFirestoreDocId(compId, 'comp', idx, usedCompIds);
      const compRef = doc(
        db,
        'users',
        uid,
        'benchSessions',
        sessionId,
        'componentStates',
        compDocId
      );
      ops.push((batch) => {
        batch.set(compRef, {
          id: compDocId,
          ownerId: uid,
          sessionId,
          componentId: compId.slice(0, 64),
          state: stateMap,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    });
    parentUpdates.componentStateCount = Object.keys(legacyStates).length;
    parentUpdates.componentStates = deleteField();
  }

  ops.push((batch) => {
    batch.update(parentRef, parentUpdates);
  });

  await commitWriteOpsInChunks(ops);
  return { targetSessionId: sessionId, conflictForked: false };
}

/**
 * Sync updated wire metadata (e.g., renamed custom wire labels) into the /wires subcollection
 * of an existing saved bench session. Queues an idempotent offline update if offline.
 */
export async function updateBenchSessionWires(
  uid: string,
  sessionId: string,
  wires: WireConnection[],
  existingSession?: SavedBenchSession
): Promise<SavePersistenceResult> {
  if (!/^[a-zA-Z0-9_\-]+$/.test(sessionId)) {
    throw new Error('Invalid bench session ID for wire metadata sync.');
  }
  const path = `users/${uid}/benchSessions/${sessionId}`;
  const sanitizedWires = sanitizeWiresForSession(wires).slice(0, 50);
  const baseUpdatedAtMs =
    extractRemoteUpdatedAtMs(existingSession as unknown as Record<string, unknown> | undefined) ??
    undefined;
  const queuePayload = buildSerializableSessionSnapshot(
    uid,
    sessionId,
    sanitizedWires,
    existingSession
  );

  const stamp = reserveMutationStamp(uid, 'benchSessions', sessionId);

  if (isLocalWorkstationUid(uid)) {
    const nowMs = Date.now();
    await cacheLocalDocument({
      uid,
      collection: 'benchSessions',
      docId: sessionId,
      data: {
        ...queuePayload,
        updatedAtMs: nowMs,
      },
      syncState: 'SYNCED_CLOUD',
      version: stamp.version,
      updatedAtMs: nowMs,
    });
    notifyLocalCollectionChange('benchSessions');
    return {
      id: sessionId,
      syncedToCloud: false,
      queuedOffline: false,
      syncState: 'SYNCED_CLOUD',
    };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueueOfflineMutation({
      uid,
      collection: 'benchSessions',
      docId: sessionId,
      payload: queuePayload,
      lastError: 'Browser offline — wire label update queued for cloud sync',
      version: stamp.version,
      updatedAtMs: stamp.updatedAtMs,
      baseUpdatedAtMs,
    });
    return {
      id: sessionId,
      syncedToCloud: false,
      queuedOffline: true,
      syncState: 'QUEUED_OFFLINE',
    };
  }

  try {
    try {
      const outcome = await syncBenchSessionWiresSubcollection(
        uid,
        sessionId,
        sanitizedWires,
        baseUpdatedAtMs,
        existingSession ? queuePayload : undefined
      );
      await markMutationSynced(
        uid,
        'benchSessions',
        sessionId,
        existingSession && !outcome.conflictForked ? queuePayload : undefined,
        {
          expectedVersion: stamp.version,
          expectedUpdatedAtMs: stamp.updatedAtMs,
        }
      );
      if (outcome.conflictForked && existingSession) {
        const conflictCachedPayload = buildConflictCopySessionPayload(
          uid,
          outcome.targetSessionId,
          queuePayload
        );
        await markMutationSynced(
          uid,
          'benchSessions',
          outcome.targetSessionId,
          conflictCachedPayload
        );
      }
      return {
        id: outcome.targetSessionId,
        syncedToCloud: true,
        queuedOffline: false,
        syncState: 'SYNCED_CLOUD',
        ...(outcome.conflictForked
          ? { conflictForked: true, conflictOriginalId: sessionId }
          : {}),
      };
    } catch (writeErr) {
      if (isTransientOfflineError(writeErr)) {
        await enqueueOfflineMutation({
          uid,
          collection: 'benchSessions',
          docId: sessionId,
          payload: queuePayload,
          lastError: writeErr instanceof Error ? writeErr.message : String(writeErr),
          version: stamp.version,
          updatedAtMs: stamp.updatedAtMs,
          baseUpdatedAtMs,
        });
        return {
          id: sessionId,
          syncedToCloud: false,
          queuedOffline: true,
          syncState: 'QUEUED_OFFLINE',
        };
      }
      throw writeErr;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

async function syncBenchSessionFullToFirestore(
  uid: string,
  sessionId: string,
  header: Record<string, unknown>,
  sanitizedWires: WireConnection[],
  sanitizedFaults: InjectedFault[],
  componentStates: Record<string, Record<string, number | boolean | string>>,
  baseUpdatedAtMs?: number
): Promise<{ targetSessionId: string; conflictForked: boolean }> {
  const parentRef = doc(db, 'users', uid, 'benchSessions', sessionId);
  const parentSnap = await getDoc(parentRef);
  if (!parentSnap.exists()) {
    throw new Error('Saved bench session not found.');
  }

  const parentRaw = parentSnap.data() as Record<string, unknown>;
  const remoteUpdatedAtMs = extractRemoteUpdatedAtMs(parentRaw);

  // Optimistic Concurrency Check: if another device saved newer changes in the cloud since
  // baseUpdatedAtMs, preserve both versions by forking a new [Conflict Copy] bench session.
  if (hasRemoteSessionConflict(baseUpdatedAtMs, remoteUpdatedAtMs)) {
    const conflictSessionId = makeSafeId('bench_conflict');
    const conflictHeader = buildConflictCopySessionPayload(uid, conflictSessionId, header);
    await writeBenchSessionBundleToFirestore(
      uid,
      conflictSessionId,
      conflictHeader,
      sanitizedWires,
      sanitizedFaults,
      componentStates
    );
    return { targetSessionId: conflictSessionId, conflictForked: true };
  }
  const [wiresSnap, faultsSnap, compSnap] = await Promise.all([
    getDocs(
      query(collection(db, 'users', uid, 'benchSessions', sessionId, 'wires'), where('ownerId', '==', uid))
    ),
    getDocs(
      query(collection(db, 'users', uid, 'benchSessions', sessionId, 'faults'), where('ownerId', '==', uid))
    ),
    getDocs(
      query(
        collection(db, 'users', uid, 'benchSessions', sessionId, 'componentStates'),
        where('ownerId', '==', uid)
      )
    ),
  ]);

  const ops: BatchWriteOp[] = [];

  // 1. Reconcile /wires subcollection
  const existingWireIds = new Set(wiresSnap.docs.map((d) => d.id));
  const usedWireIds = new Set<string>();
  const targetWireIds = new Set<string>();
  const limitedWires = sanitizedWires.slice(0, 50);

  limitedWires.forEach((w, idx) => {
    const wireDocId = toSafeFirestoreDocId(w.id, 'wire', idx, usedWireIds);
    targetWireIds.add(wireDocId);
    const wireRef = doc(db, 'users', uid, 'benchSessions', sessionId, 'wires', wireDocId);
    const wireFields = {
      sourcePinId: String(w.sourcePinId).slice(0, 64),
      targetPinId: String(w.targetPinId).slice(0, 64),
      color: String(w.color || '#94a3b8').slice(0, 32) || '#94a3b8',
      label: String(w.label || '').slice(0, 120),
      isCut: Boolean(w.isCut),
      resistance: Math.max(0, Math.min(1_000_000, Number(w.resistance) || 0.05)),
      updatedAt: serverTimestamp(),
    };
    if (existingWireIds.has(wireDocId)) {
      ops.push((batch) => batch.update(wireRef, wireFields));
    } else {
      ops.push((batch) =>
        batch.set(wireRef, {
          id: wireDocId,
          ownerId: uid,
          sessionId,
          ...wireFields,
          createdAt: serverTimestamp(),
        })
      );
    }
  });
  for (const existingDoc of wiresSnap.docs) {
    if (!targetWireIds.has(existingDoc.id)) {
      ops.push((batch) => batch.delete(existingDoc.ref));
    }
  }

  // 2. Reconcile /faults subcollection
  const existingFaultIds = new Set(faultsSnap.docs.map((d) => d.id));
  const usedFaultIds = new Set<string>();
  const targetFaultIds = new Set<string>();
  const limitedFaults = sanitizedFaults.slice(0, 20);

  limitedFaults.forEach((f, idx) => {
    const faultDocId = toSafeFirestoreDocId(`fault_${idx}_${f.pinId}`, 'fault', idx, usedFaultIds);
    targetFaultIds.add(faultDocId);
    const faultRef = doc(db, 'users', uid, 'benchSessions', sessionId, 'faults', faultDocId);
    const faultFields = {
      pinId: String(f.pinId).slice(0, 64),
      faultType: normalizeFaultType(f.faultType),
      description: String(f.description || '').slice(0, 240),
      timestamp: Math.max(0, Number(f.timestamp) || Date.now()),
      updatedAt: serverTimestamp(),
    };
    if (existingFaultIds.has(faultDocId)) {
      ops.push((batch) => batch.update(faultRef, faultFields));
    } else {
      ops.push((batch) =>
        batch.set(faultRef, {
          id: faultDocId,
          ownerId: uid,
          sessionId,
          ...faultFields,
          createdAt: serverTimestamp(),
        })
      );
    }
  });
  for (const existingDoc of faultsSnap.docs) {
    if (!targetFaultIds.has(existingDoc.id)) {
      ops.push((batch) => batch.delete(existingDoc.ref));
    }
  }

  // 3. Reconcile /componentStates subcollection
  const existingCompMap = new Map<string, string>(
    compSnap.docs.map((d) => [d.id, String(d.data()?.componentId || d.id)])
  );
  const usedCompIds = new Set<string>();
  const targetCompIds = new Set<string>();

  Object.entries(componentStates)
    .slice(0, 40)
    .forEach(([compId, stateMap], idx) => {
      const safeCompId = String(compId).slice(0, 64);
      let compDocId = toSafeFirestoreDocId(compId, 'comp', idx, usedCompIds);
      // Avoid overwriting an existing doc that has a different immutable componentId,
      // which firestore.rules rejects on update (componentId & createdAt are immutable).
      if (existingCompMap.has(compDocId) && existingCompMap.get(compDocId) !== safeCompId) {
        compDocId = toSafeFirestoreDocId(`${compId}_${idx}_v2`, 'comp', idx, usedCompIds);
      }
      targetCompIds.add(compDocId);
      const compRef = doc(
        db,
        'users',
        uid,
        'benchSessions',
        sessionId,
        'componentStates',
        compDocId
      );
      const sanitizedState = sanitizeComponentStateMap(stateMap);
      if (existingCompMap.get(compDocId) === safeCompId) {
        ops.push((batch) =>
          batch.update(compRef, {
            state: sanitizedState,
            updatedAt: serverTimestamp(),
          })
        );
      } else {
        ops.push((batch) =>
          batch.set(compRef, {
            id: compDocId,
            ownerId: uid,
            sessionId,
            componentId: safeCompId,
            state: sanitizedState,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      }
    });
  for (const existingDoc of compSnap.docs) {
    if (!targetCompIds.has(existingDoc.id)) {
      ops.push((batch) => batch.delete(existingDoc.ref));
    }
  }

  // 4. Update parent document (leaving createdAt immutable and stripping legacy inline arrays if present)
  const parentUpdates: Record<string, unknown> = {
    ...buildBenchSessionUpdatePayload(header),
    wireCount: limitedWires.length,
    faultCount: limitedFaults.length,
    componentStateCount: targetCompIds.size,
    schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
    updatedAt: serverTimestamp(),
  };
  if ('wires' in parentRaw) parentUpdates.wires = deleteField();
  if ('faults' in parentRaw) parentUpdates.faults = deleteField();
  if ('componentStates' in parentRaw) parentUpdates.componentStates = deleteField();

  ops.push((batch) => batch.update(parentRef, parentUpdates));
  await commitWriteOpsInChunks(ops);
  return { targetSessionId: sessionId, conflictForked: false };
}

/**
 * Update an existing ECU bench workspace session in-place (parent doc + /wires, /faults, /componentStates
 * subcollections) while queuing an idempotent offline snapshot if offline.
 * If baseUpdatedAtMs is supplied and a newer cloud revision exists from another device,
 * automatically forks into a non-destructive "[Conflict Copy]" bench session.
 */
export async function updateBenchSession(
  uid: string,
  sessionId: string,
  payload: {
    title: string;
    notes?: string;
    ecuProfileLabel?: string;
    powerSupply: PowerSupplyState;
    wires: WireConnection[];
    faults: InjectedFault[];
    components: BenchComponent[];
    activeDtcs: string[];
    supplyCurrentDrawAmps: number;
    selectedBrandKey?: string;
    selectedModelName?: string;
    selectedEcuProfileId?: string | null;
    rpmEmulator?: RpmEmulatorState;
    gaugeMonitor?: GaugeMonitorState;
    multimeter?: MultimeterState;
    workflowCheckedIds?: string[];
    preBenchGateLocked?: boolean;
    baseUpdatedAtMs?: number;
  }
): Promise<SavePersistenceResult> {
  if (!/^[a-zA-Z0-9_\-]+$/.test(sessionId)) {
    throw new Error('Invalid bench session ID for workspace update.');
  }
  const path = `users/${uid}/benchSessions/${sessionId}`;

  const rawCompStates: Record<string, Record<string, number | boolean | string>> = {};
  for (const comp of payload.components) {
    if (comp.state && Object.keys(comp.state).length > 0) {
      rawCompStates[comp.id] = { ...comp.state };
    }
  }
  const componentStates = sanitizeComponentStatesRecord(rawCompStates);
  const sanitizedWires = sanitizeWiresForSession(payload.wires).slice(0, 50);
  const sanitizedFaults = sanitizeFaultsList(payload.faults);

  try {
    const headerDoc = sanitizeBenchSessionHeader(uid, sessionId, {
      ...payload,
      wireCount: sanitizedWires.length,
      faultCount: sanitizedFaults.length,
      componentStateCount: Object.keys(componentStates).length,
    });

    const queuePayload: Record<string, unknown> = {
      ...headerDoc,
      wires: sanitizedWires,
      faults: sanitizedFaults,
      componentStates,
      ...(typeof payload.baseUpdatedAtMs === 'number' && payload.baseUpdatedAtMs > 0
        ? { baseUpdatedAtMs: payload.baseUpdatedAtMs }
        : {}),
    };

    const stamp = reserveMutationStamp(uid, 'benchSessions', sessionId);

    if (isLocalWorkstationUid(uid)) {
      const nowMs = Date.now();
      await cacheLocalDocument({
        uid,
        collection: 'benchSessions',
        docId: sessionId,
        data: {
          ...queuePayload,
          updatedAtMs: nowMs,
        },
        syncState: 'SYNCED_CLOUD',
        version: stamp.version,
        updatedAtMs: nowMs,
      });
      notifyLocalCollectionChange('benchSessions');
      return {
        id: sessionId,
        syncedToCloud: false,
        queuedOffline: false,
        syncState: 'SYNCED_CLOUD',
      };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await enqueueOfflineMutation({
        uid,
        collection: 'benchSessions',
        docId: sessionId,
        payload: queuePayload,
        lastError: 'Browser offline — workspace update queued for automatic cloud sync',
        version: stamp.version,
        updatedAtMs: stamp.updatedAtMs,
        baseUpdatedAtMs: payload.baseUpdatedAtMs,
      });
      return {
        id: sessionId,
        syncedToCloud: false,
        queuedOffline: true,
        syncState: 'QUEUED_OFFLINE',
      };
    }

    try {
      const outcome = await syncBenchSessionFullToFirestore(
        uid,
        sessionId,
        headerDoc,
        sanitizedWires,
        sanitizedFaults,
        componentStates,
        payload.baseUpdatedAtMs
      );
      await markMutationSynced(
        uid,
        'benchSessions',
        sessionId,
        outcome.conflictForked ? undefined : queuePayload,
        {
          expectedVersion: stamp.version,
          expectedUpdatedAtMs: stamp.updatedAtMs,
        }
      );
      if (outcome.conflictForked) {
        const conflictCachedPayload = buildConflictCopySessionPayload(
          uid,
          outcome.targetSessionId,
          queuePayload
        );
        await markMutationSynced(
          uid,
          'benchSessions',
          outcome.targetSessionId,
          conflictCachedPayload
        );
      }
      return {
        id: outcome.targetSessionId,
        syncedToCloud: true,
        queuedOffline: false,
        syncState: 'SYNCED_CLOUD',
        ...(outcome.conflictForked
          ? { conflictForked: true, conflictOriginalId: sessionId }
          : {}),
      };
    } catch (writeErr) {
      if (isTransientOfflineError(writeErr)) {
        await enqueueOfflineMutation({
          uid,
          collection: 'benchSessions',
          docId: sessionId,
          payload: queuePayload,
          lastError: writeErr instanceof Error ? writeErr.message : String(writeErr),
          version: stamp.version,
          updatedAtMs: stamp.updatedAtMs,
          baseUpdatedAtMs: payload.baseUpdatedAtMs,
        });
        return {
          id: sessionId,
          syncedToCloud: false,
          queuedOffline: true,
          syncState: 'QUEUED_OFFLINE',
        };
      }
      throw writeErr;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function mergeCachedBenchSessions(
  cloudItems: SavedBenchSession[],
  localQueued: {
    docId: string;
    syncState: string;
    updatedAtMs?: number;
    data?: Partial<SavedBenchSession> & { createdAtMs?: number; updatedAtMs?: number };
  }[]
): SavedBenchSession[] {
  const byId = new Map<string, SavedBenchSession>();
  for (const item of cloudItems) {
    byId.set(item.id, { ...item, syncState: 'SYNCED_CLOUD' });
  }
  const hasCloudSnapshot = cloudItems.length > 0;
  for (const cached of localQueued) {
    const cachedData = cached.data;
    if (!cachedData) continue;
    const isQueued = cached.syncState === 'QUEUED_OFFLINE';
    const existingItem = byId.get(cached.docId);
    if (existingItem) {
      if (!isQueued) continue;
      byId.set(cached.docId, {
        ...existingItem,
        ...cachedData,
        ...(Array.isArray(cachedData.wires) ? { wires: cachedData.wires } : {}),
        ...(cachedData.gaugeMonitor
          ? { gaugeMonitor: sanitizeGaugeMonitorState(cachedData.gaugeMonitor) }
          : {}),
        syncState: 'QUEUED_OFFLINE',
      });
    } else if ((isQueued || !hasCloudSnapshot) && cachedData.title && cachedData.powerSupply) {
      const tsMs = cachedData.updatedAtMs ?? cached.updatedAtMs ?? Date.now();
      const createdMs = cachedData.createdAtMs ?? tsMs;
      byId.set(cached.docId, {
        ...(cachedData as SavedBenchSession),
        id: cached.docId,
        wires: Array.isArray(cachedData.wires) ? cachedData.wires : [],
        faults: Array.isArray(cachedData.faults) ? cachedData.faults : [],
        componentStates: cachedData.componentStates || {},
        activeDtcs: Array.isArray(cachedData.activeDtcs) ? cachedData.activeDtcs : [],
        ...(cachedData.gaugeMonitor
          ? { gaugeMonitor: sanitizeGaugeMonitorState(cachedData.gaugeMonitor) }
          : {}),
        createdAt: cachedData.createdAt || makeLocalTimestamp(createdMs),
        updatedAt: cachedData.updatedAt || makeLocalTimestamp(tsMs),
        syncState: isQueued ? 'QUEUED_OFFLINE' : 'SYNCED_CLOUD',
      });
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0)
  );
}

async function hydrateBenchSessionFromSubcollections(
  uid: string,
  rawSession: SavedBenchSession
): Promise<SavedBenchSession> {
  if (rawSession.schemaVersion !== SCHEMA_VERSION_SUBCOLLECTIONS) {
    return {
      ...rawSession,
      wires: Array.isArray(rawSession.wires) ? rawSession.wires : [],
      faults: Array.isArray(rawSession.faults) ? rawSession.faults : [],
      componentStates:
        rawSession.componentStates && typeof rawSession.componentStates === 'object'
          ? rawSession.componentStates
          : {},
    };
  }

  const [wiresSnap, faultsSnap, compSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'users', uid, 'benchSessions', rawSession.id, 'wires'),
        where('ownerId', '==', uid)
      )
    ),
    getDocs(
      query(
        collection(db, 'users', uid, 'benchSessions', rawSession.id, 'faults'),
        where('ownerId', '==', uid)
      )
    ),
    getDocs(
      query(
        collection(db, 'users', uid, 'benchSessions', rawSession.id, 'componentStates'),
        where('ownerId', '==', uid)
      )
    ),
  ]);

  const wires: WireConnection[] = wiresSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: String(data.id || d.id),
      sourcePinId: String(data.sourcePinId || ''),
      targetPinId: String(data.targetPinId || ''),
      color: String(data.color || '#94a3b8'),
      label: String(data.label || ''),
      isCut: Boolean(data.isCut),
      resistance: Number(data.resistance) || 0.05,
    };
  });

  const faults: InjectedFault[] = faultsSnap.docs.map((d) => {
    const data = d.data();
    return {
      pinId: String(data.pinId || ''),
      faultType: normalizeFaultType(data.faultType),
      description: String(data.description || ''),
      timestamp: Number(data.timestamp) || 0,
    };
  });

  const componentStates: Record<string, Record<string, number | boolean | string>> = {};
  for (const d of compSnap.docs) {
    const data = d.data();
    const compId = String(data.componentId || d.id);
    if (data.state && typeof data.state === 'object') {
      componentStates[compId] = data.state as Record<string, number | boolean | string>;
    }
  }

  return {
    ...rawSession,
    wires,
    faults,
    componentStates,
  };
}

export function subscribeBenchSessions(
  uid: string,
  onData: (sessions: SavedBenchSession[]) => void,
  onError?: (err: Error) => void
): () => void {
  let latestRawCloudItems: SavedBenchSession[] = [];
  let isUnsubscribed = false;

  if (isLocalWorkstationUid(uid)) {
    const emitLocal = async () => {
      try {
        const cachedDocs = await getLocalCachedDocuments<Partial<SavedBenchSession> & { createdAtMs?: number; updatedAtMs?: number }>(
          uid,
          'benchSessions'
        );
        if (isUnsubscribed) return;
        const sessions: SavedBenchSession[] = cachedDocs
          .filter((docItem) => Boolean(docItem.data?.title && docItem.data?.powerSupply))
          .map((docItem) => {
            const raw = docItem.data;
            const tsMs = raw.updatedAtMs ?? docItem.updatedAtMs ?? Date.now();
            const createdMs = raw.createdAtMs ?? tsMs;
            return {
              ...(raw as SavedBenchSession),
              id: docItem.docId,
              ownerId: uid,
              wires: Array.isArray(raw.wires) ? raw.wires : [],
              faults: Array.isArray(raw.faults) ? raw.faults : [],
              componentStates: raw.componentStates || {},
              activeDtcs: Array.isArray(raw.activeDtcs) ? raw.activeDtcs : [],
              ...(raw.gaugeMonitor
                ? { gaugeMonitor: sanitizeGaugeMonitorState(raw.gaugeMonitor) }
                : {}),
              createdAt: makeLocalTimestamp(createdMs),
              updatedAt: makeLocalTimestamp(tsMs),
              syncState: 'SYNCED_CLOUD' as const,
            };
          })
          .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
        onData(sessions);
      } catch (e) {
        if (!isUnsubscribed && onError && e instanceof Error) onError(e);
      }
    };
    void emitLocal();
    const unsubLocal = subscribeLocalCollectionChange('benchSessions', () => {
      void emitLocal();
    });
    return () => {
      isUnsubscribed = true;
      unsubLocal();
    };
  }

  const emitMerged = async () => {
    try {
      const hydratedCloud = await Promise.all(
        latestRawCloudItems.map((item) =>
          hydrateBenchSessionFromSubcollections(uid, item).catch(() => ({
            ...item,
            wires: Array.isArray(item.wires) ? item.wires : [],
            faults: Array.isArray(item.faults) ? item.faults : [],
            componentStates: item.componentStates || {},
          }))
        )
      );
      if (isUnsubscribed) return;
      const localQueued = await getLocalCachedDocuments<Partial<SavedBenchSession>>(uid, 'benchSessions');
      if (isUnsubscribed) return;
      onData(mergeCachedBenchSessions(hydratedCloud, localQueued));
    } catch (e) {
      if (!isUnsubscribed && onError && e instanceof Error) onError(e);
    }
  };

  void emitMerged();
  const unsubLocal = subscribeLocalCollectionChange('benchSessions', () => {
    void emitMerged();
  });

  if (!db || !auth?.currentUser) {
    return () => {
      isUnsubscribed = true;
      unsubLocal();
    };
  }

  const path = `users/${uid}/benchSessions`;
  const q = query(
    collection(db, 'users', uid, 'benchSessions'),
    where('ownerId', '==', uid)
  );

  const unsub = onSnapshot(
    q,
    (snapshot) => {
      latestRawCloudItems = snapshot.docs.map((d) => d.data() as SavedBenchSession);
      void emitMerged();
    },
    (error) => {
      void emitMerged();
      if (isTransientOfflineError(error)) {
        return;
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        if (!isUnsubscribed && onError && e instanceof Error) onError(e);
      }
    }
  );

  return () => {
    isUnsubscribed = true;
    unsubLocal();
    unsub();
  };
}

export async function deleteBenchSession(uid: string, sessionId: string): Promise<void> {
  const path = `users/${uid}/benchSessions/${sessionId}`;
  try {
    await removeLocalCachedDocument(uid, 'benchSessions', sessionId);
    if (isLocalWorkstationUid(uid)) {
      notifyLocalCollectionChange('benchSessions');
      return;
    }
    const [wiresSnap, faultsSnap, compSnap] = await Promise.all([
      getDocs(
        query(collection(db, 'users', uid, 'benchSessions', sessionId, 'wires'), where('ownerId', '==', uid))
      ),
      getDocs(
        query(collection(db, 'users', uid, 'benchSessions', sessionId, 'faults'), where('ownerId', '==', uid))
      ),
      getDocs(
        query(
          collection(db, 'users', uid, 'benchSessions', sessionId, 'componentStates'),
          where('ownerId', '==', uid)
        )
      ),
    ]);
    const ops: BatchWriteOp[] = [];
    for (const d of wiresSnap.docs) ops.push((batch) => batch.delete(d.ref));
    for (const d of faultsSnap.docs) ops.push((batch) => batch.delete(d.ref));
    for (const d of compSnap.docs) ops.push((batch) => batch.delete(d.ref));
    ops.push((batch) => batch.delete(doc(db, 'users', uid, 'benchSessions', sessionId)));
    await commitWriteOpsInChunks(ops);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

async function writeDiagnosticLogBundleToFirestore(
  uid: string,
  logId: string,
  header: Record<string, unknown>,
  sources: GroundedSearchSource[]
): Promise<void> {
  const ops: BatchWriteOp[] = [];
  const logRef = doc(db, 'users', uid, 'diagnosticLogs', logId);
  ops.push((batch) => {
    batch.set(logRef, {
      ...header,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  sources.slice(0, 20).forEach((s, idx) => {
    const srcId = `src_${idx}`;
    const srcRef = doc(db, 'users', uid, 'diagnosticLogs', logId, 'sources', srcId);
    ops.push((batch) => {
      batch.set(srcRef, {
        id: srcId,
        ownerId: uid,
        logId,
        title: String(s.title || '').slice(0, 200),
        uri: String(s.uri || '').slice(0, 1000),
        domain: String(s.domain || '').slice(0, 120),
        orderIndex: idx,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  });

  await commitWriteOpsInChunks(ops);
}

/**
 * Save a Diagnostic Log or Google Search Grounding TSB/Pinout Bookmark,
 * storing grounded sources individually inside /diagnosticLogs/{logId}/sources.
 */
export async function saveDiagnosticLog(
  uid: string,
  payload: {
    title: string;
    dtcCode?: string;
    ecuModel?: string;
    sourceType: 'GROUNDED_TSB' | 'BENCH_SNAPSHOT' | 'PINOUT_NOTE';
    summary: string;
    sources?: GroundedSearchSource[];
  }
): Promise<SavePersistenceResult> {
  const logId = makeSafeId('diag');
  const path = `users/${uid}/diagnosticLogs/${logId}`;
  const sanitizedSources = sanitizeSourcesList(payload.sources);

  const headerDoc = {
    id: logId,
    ownerId: uid,
    title: payload.title.trim().slice(0, 160) || 'Diagnostic Note',
    dtcCode: (payload.dtcCode || '').trim().slice(0, 32),
    ecuModel: (payload.ecuModel || '').trim().slice(0, 120),
    sourceType: payload.sourceType,
    summary: payload.summary.trim().slice(0, 12000) || 'Diagnostic summary recorded.',
    sourceCount: sanitizedSources.length,
    schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
  };

  const queuePayload = {
    ...headerDoc,
    sources: sanitizedSources,
  };

  const stamp = reserveMutationStamp(uid, 'diagnosticLogs', logId);

  if (isLocalWorkstationUid(uid)) {
    const nowMs = Date.now();
    await cacheLocalDocument({
      uid,
      collection: 'diagnosticLogs',
      docId: logId,
      data: {
        ...queuePayload,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      },
      syncState: 'SYNCED_CLOUD',
      version: stamp.version,
      updatedAtMs: nowMs,
    });
    notifyLocalCollectionChange('diagnosticLogs');
    return {
      id: logId,
      syncedToCloud: false,
      queuedOffline: false,
      syncState: 'SYNCED_CLOUD',
    };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueueOfflineMutation({
      uid,
      collection: 'diagnosticLogs',
      docId: logId,
      payload: queuePayload,
      lastError: 'Browser offline — queued for automatic cloud sync',
      version: stamp.version,
      updatedAtMs: stamp.updatedAtMs,
    });
    return {
      id: logId,
      syncedToCloud: false,
      queuedOffline: true,
      syncState: 'QUEUED_OFFLINE',
    };
  }

  try {
    await writeDiagnosticLogBundleToFirestore(uid, logId, headerDoc, sanitizedSources);
    await markMutationSynced(uid, 'diagnosticLogs', logId, queuePayload, {
      expectedVersion: stamp.version,
      expectedUpdatedAtMs: stamp.updatedAtMs,
    });
    return {
      id: logId,
      syncedToCloud: true,
      queuedOffline: false,
      syncState: 'SYNCED_CLOUD',
    };
  } catch (error) {
    if (isTransientOfflineError(error)) {
      await enqueueOfflineMutation({
        uid,
        collection: 'diagnosticLogs',
        docId: logId,
        payload: queuePayload,
        lastError: error instanceof Error ? error.message : String(error),
        version: stamp.version,
        updatedAtMs: stamp.updatedAtMs,
      });
      return {
        id: logId,
        syncedToCloud: false,
        queuedOffline: true,
        syncState: 'QUEUED_OFFLINE',
      };
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

async function hydrateDiagnosticLogFromSubcollection(
  uid: string,
  rawLog: SavedDiagnosticLog
): Promise<SavedDiagnosticLog> {
  if (rawLog.schemaVersion !== SCHEMA_VERSION_SUBCOLLECTIONS) {
    return {
      ...rawLog,
      sources: Array.isArray(rawLog.sources) ? rawLog.sources : [],
    };
  }
  if ((rawLog.sourceCount ?? 0) === 0) {
    return {
      ...rawLog,
      sources: [],
    };
  }

  const srcSnap = await getDocs(
    query(
      collection(db, 'users', uid, 'diagnosticLogs', rawLog.id, 'sources'),
      where('ownerId', '==', uid)
    )
  );
  const sources = srcSnap.docs
    .map((d) => d.data())
    .sort((a, b) => (Number(a.orderIndex) || 0) - (Number(b.orderIndex) || 0))
    .map((data) => ({
      title: String(data.title || ''),
      uri: String(data.uri || ''),
      domain: String(data.domain || ''),
    }));

  return {
    ...rawLog,
    sources,
  };
}

export function subscribeDiagnosticLogs(
  uid: string,
  onData: (logs: SavedDiagnosticLog[]) => void,
  onError?: (err: Error) => void
): () => void {
  let latestRawCloudItems: SavedDiagnosticLog[] = [];
  let isUnsubscribed = false;

  if (isLocalWorkstationUid(uid)) {
    const emitLocal = async () => {
      try {
        const cachedDocs = await getLocalCachedDocuments<Partial<SavedDiagnosticLog> & { createdAtMs?: number; updatedAtMs?: number }>(
          uid,
          'diagnosticLogs'
        );
        if (isUnsubscribed) return;
        const logs: SavedDiagnosticLog[] = cachedDocs
          .filter((docItem) => Boolean(docItem.data?.title))
          .map((docItem) => {
            const raw = docItem.data;
            const tsMs = raw.updatedAtMs ?? docItem.updatedAtMs ?? Date.now();
            const createdMs = raw.createdAtMs ?? tsMs;
            return {
              ...(raw as SavedDiagnosticLog),
              id: docItem.docId,
              ownerId: uid,
              sources: Array.isArray(raw.sources) ? raw.sources : [],
              createdAt: makeLocalTimestamp(createdMs),
              updatedAt: makeLocalTimestamp(tsMs),
              syncState: 'SYNCED_CLOUD' as const,
            };
          })
          .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
        onData(logs);
      } catch (e) {
        if (!isUnsubscribed && onError && e instanceof Error) onError(e);
      }
    };
    void emitLocal();
    const unsubLocal = subscribeLocalCollectionChange('diagnosticLogs', () => {
      void emitLocal();
    });
    return () => {
      isUnsubscribed = true;
      unsubLocal();
    };
  }

  const emitMerged = async () => {
    try {
      const hydratedCloud = await Promise.all(
        latestRawCloudItems.map((item) =>
          hydrateDiagnosticLogFromSubcollection(uid, item).catch(() => ({
            ...item,
            sources: Array.isArray(item.sources) ? item.sources : [],
          }))
        )
      );
      if (isUnsubscribed) return;
      const localCached = await getLocalCachedDocuments<
        Partial<SavedDiagnosticLog> & { createdAtMs?: number; updatedAtMs?: number }
      >(uid, 'diagnosticLogs');
      if (isUnsubscribed) return;
      const byId = new Map<string, SavedDiagnosticLog>();
      for (const item of hydratedCloud) {
        byId.set(item.id, { ...item, syncState: 'SYNCED_CLOUD' });
      }
      for (const cached of localCached) {
        if (!byId.has(cached.docId) && cached.data?.title) {
          const tsMs = cached.data.updatedAtMs ?? cached.updatedAtMs ?? Date.now();
          const createdMs = cached.data.createdAtMs ?? tsMs;
          byId.set(cached.docId, {
            ...(cached.data as SavedDiagnosticLog),
            id: cached.docId,
            ownerId: uid,
            sources: Array.isArray(cached.data?.sources) ? cached.data.sources : [],
            createdAt: cached.data.createdAt || makeLocalTimestamp(createdMs),
            updatedAt: cached.data.updatedAt || makeLocalTimestamp(tsMs),
            syncState: cached.syncState === 'QUEUED_OFFLINE' ? 'QUEUED_OFFLINE' : 'SYNCED_CLOUD',
          });
        }
      }
      const merged = Array.from(byId.values()).sort(
        (a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0)
      );
      onData(merged);
    } catch (e) {
      if (!isUnsubscribed && onError && e instanceof Error) onError(e);
    }
  };

  void emitMerged();
  const unsubLocal = subscribeLocalCollectionChange('diagnosticLogs', () => {
    void emitMerged();
  });

  if (!db || !auth?.currentUser) {
    return () => {
      isUnsubscribed = true;
      unsubLocal();
    };
  }

  const path = `users/${uid}/diagnosticLogs`;
  const q = query(
    collection(db, 'users', uid, 'diagnosticLogs'),
    where('ownerId', '==', uid)
  );

  const unsub = onSnapshot(
    q,
    (snapshot) => {
      latestRawCloudItems = snapshot.docs.map((d) => d.data() as SavedDiagnosticLog);
      void emitMerged();
    },
    (error) => {
      void emitMerged();
      if (isTransientOfflineError(error)) {
        return;
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        if (!isUnsubscribed && onError && e instanceof Error) onError(e);
      }
    }
  );

  return () => {
    isUnsubscribed = true;
    unsubLocal();
    unsub();
  };
}

export async function deleteDiagnosticLog(uid: string, logId: string): Promise<void> {
  const path = `users/${uid}/diagnosticLogs/${logId}`;
  try {
    await removeLocalCachedDocument(uid, 'diagnosticLogs', logId);
    if (isLocalWorkstationUid(uid)) {
      notifyLocalCollectionChange('diagnosticLogs');
      return;
    }
    const srcSnap = await getDocs(
      query(collection(db, 'users', uid, 'diagnosticLogs', logId, 'sources'), where('ownerId', '==', uid))
    );
    const ops: BatchWriteOp[] = [];
    for (const d of srcSnap.docs) ops.push((batch) => batch.delete(d.ref));
    ops.push((batch) => batch.delete(doc(db, 'users', uid, 'diagnosticLogs', logId)));
    await commitWriteOpsInChunks(ops);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchBenchSessionCount(uid: string): Promise<number> {
  const path = `users/${uid}/benchSessions`;
  try {
    const q = query(
      collection(db, 'users', uid, 'benchSessions'),
      where('ownerId', '==', uid)
    );
    const snap = await getDocs(q);
    return snap.size;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('offline') || msg.includes('unavailable')) return 0;
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

async function writePcbScanBundleToFirestore(
  uid: string,
  scanId: string,
  header: Record<string, unknown>,
  components: ImageAnalysisComponent[],
  nets: ImageAnalysisNet[],
  hotspots: ImageAnalysisHotspot[]
): Promise<void> {
  const ops: BatchWriteOp[] = [];
  const scanRef = doc(db, 'users', uid, 'pcbScans', scanId);
  ops.push((batch) => {
    batch.set(scanRef, {
      ...header,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  const usedCompIds = new Set<string>();
  components.slice(0, 60).forEach((c, idx) => {
    const compDocId = toSafeFirestoreDocId(`comp_${idx}_${c.refDes}`, 'comp', idx, usedCompIds);
    const compRef = doc(db, 'users', uid, 'pcbScans', scanId, 'components', compDocId);
    ops.push((batch) => {
      batch.set(compRef, {
        id: compDocId,
        ownerId: uid,
        scanId,
        ...c,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  });

  const usedNetIds = new Set<string>();
  nets.slice(0, 40).forEach((n, idx) => {
    const netDocId = toSafeFirestoreDocId(`net_${idx}_${n.name}`, 'net', idx, usedNetIds);
    const netRef = doc(db, 'users', uid, 'pcbScans', scanId, 'nets', netDocId);
    ops.push((batch) => {
      batch.set(netRef, {
        id: netDocId,
        ownerId: uid,
        scanId,
        ...n,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  });

  const usedHotspotIds = new Set<string>();
  hotspots.slice(0, 30).forEach((h, idx) => {
    const hsDocId = toSafeFirestoreDocId(`hs_${idx}_${h.id}`, 'hs', idx, usedHotspotIds);
    const hsRef = doc(db, 'users', uid, 'pcbScans', scanId, 'hotspots', hsDocId);
    ops.push((batch) => {
      batch.set(hsRef, {
        id: hsDocId,
        ownerId: uid,
        scanId,
        hotspotId: String(h.id).slice(0, 64),
        label: h.label,
        severity: h.severity,
        bbox: h.bbox,
        suspectComponentRef: String(h.suspectComponentRef || '').slice(0, 32),
        notes: String(h.notes || '').slice(0, 300),
        source: h.source,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  });

  await commitWriteOpsInChunks(ops);
}

/**
 * Save a mapped ECU PCB layout with components, copper nets, and hotspots stored
 * as individually validated documents in /pcbScans/{scanId}/{components|nets|hotspots}.
 */
export async function savePcbScan(
  uid: string,
  payload: {
    title: string;
    boardType: string;
    analysisSummary: string;
    model: string;
    components: ImageAnalysisComponent[];
    nets: ImageAnalysisNet[];
    hotspots: ImageAnalysisHotspot[];
  }
): Promise<SavePersistenceResult> {
  const scanId = makeSafeId('pcb');
  const path = `users/${uid}/pcbScans/${scanId}`;

  const sanitizedComponents = sanitizePcbComponentsList(payload.components);
  const sanitizedNets = sanitizePcbNetsList(payload.nets);
  const sanitizedHotspots = sanitizePcbHotspotsList(payload.hotspots);

  const headerDoc = {
    id: scanId,
    ownerId: uid,
    title: payload.title.trim().slice(0, 160) || 'Mapped ECU PCB Scan',
    boardType: payload.boardType.trim().slice(0, 120) || 'Automotive ECU PCB',
    analysisSummary: payload.analysisSummary.trim().slice(0, 4000) || 'Mapped PCB layout',
    model: payload.model.trim().slice(0, 80) || 'gemini-4-hydrogen',
    componentCount: sanitizedComponents.length,
    netCount: sanitizedNets.length,
    hotspotCount: sanitizedHotspots.length,
    schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
  };

  const queuePayload = {
    ...headerDoc,
    components: sanitizedComponents,
    nets: sanitizedNets,
    hotspots: sanitizedHotspots,
  };

  const stamp = reserveMutationStamp(uid, 'pcbScans', scanId);

  if (isLocalWorkstationUid(uid)) {
    const nowMs = Date.now();
    await cacheLocalDocument({
      uid,
      collection: 'pcbScans',
      docId: scanId,
      data: {
        ...queuePayload,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      },
      syncState: 'SYNCED_CLOUD',
      version: stamp.version,
      updatedAtMs: nowMs,
    });
    notifyLocalCollectionChange('pcbScans');
    return {
      id: scanId,
      syncedToCloud: false,
      queuedOffline: false,
      syncState: 'SYNCED_CLOUD',
    };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueueOfflineMutation({
      uid,
      collection: 'pcbScans',
      docId: scanId,
      payload: queuePayload,
      lastError: 'Browser offline — queued for automatic cloud sync',
      version: stamp.version,
      updatedAtMs: stamp.updatedAtMs,
    });
    return {
      id: scanId,
      syncedToCloud: false,
      queuedOffline: true,
      syncState: 'QUEUED_OFFLINE',
    };
  }

  try {
    await writePcbScanBundleToFirestore(
      uid,
      scanId,
      headerDoc,
      sanitizedComponents,
      sanitizedNets,
      sanitizedHotspots
    );
    await markMutationSynced(uid, 'pcbScans', scanId, queuePayload, {
      expectedVersion: stamp.version,
      expectedUpdatedAtMs: stamp.updatedAtMs,
    });
    return {
      id: scanId,
      syncedToCloud: true,
      queuedOffline: false,
      syncState: 'SYNCED_CLOUD',
    };
  } catch (error) {
    if (isTransientOfflineError(error)) {
      await enqueueOfflineMutation({
        uid,
        collection: 'pcbScans',
        docId: scanId,
        payload: queuePayload,
        lastError: error instanceof Error ? error.message : String(error),
        version: stamp.version,
        updatedAtMs: stamp.updatedAtMs,
      });
      return {
        id: scanId,
        syncedToCloud: false,
        queuedOffline: true,
        syncState: 'QUEUED_OFFLINE',
      };
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

async function hydratePcbScanFromSubcollections(
  uid: string,
  rawScan: SavedPcbScan
): Promise<SavedPcbScan> {
  if (rawScan.schemaVersion !== SCHEMA_VERSION_SUBCOLLECTIONS) {
    return {
      ...rawScan,
      components: Array.isArray(rawScan.components) ? rawScan.components : [],
      nets: Array.isArray(rawScan.nets) ? rawScan.nets : [],
      hotspots: Array.isArray(rawScan.hotspots) ? rawScan.hotspots : [],
    };
  }

  const [compSnap, netSnap, hsSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'users', uid, 'pcbScans', rawScan.id, 'components'),
        where('ownerId', '==', uid)
      )
    ),
    getDocs(
      query(
        collection(db, 'users', uid, 'pcbScans', rawScan.id, 'nets'),
        where('ownerId', '==', uid)
      )
    ),
    getDocs(
      query(
        collection(db, 'users', uid, 'pcbScans', rawScan.id, 'hotspots'),
        where('ownerId', '==', uid)
      )
    ),
  ]);

  const components: ImageAnalysisComponent[] = compSnap.docs.map((d) => {
    const data = d.data();
    return {
      refDes: String(data.refDes || ''),
      category: String(data.category || ''),
      marking: String(data.marking || ''),
      decodedValue: String(data.decodedValue || ''),
      packageType: String(data.packageType || ''),
      bbox: data.bbox,
      confidenceScore: Number(data.confidenceScore) || 0.7,
      verificationStatus: normalizeVerificationStatus(data.verificationStatus),
      circuitFunction: String(data.circuitFunction || ''),
      terminalIds: Array.isArray(data.terminalIds) ? data.terminalIds : [],
      notes: String(data.notes || ''),
      operatingVoltageRange: String(data.operatingVoltageRange || ''),
      maxCurrentRating: String(data.maxCurrentRating || ''),
      datasheetSummary: String(data.datasheetSummary || ''),
      pinSpecs: Array.isArray(data.pinSpecs) ? data.pinSpecs : [],
      source: data.source || 'AI',
    };
  });

  const nets: ImageAnalysisNet[] = netSnap.docs.map((d) => {
    const data = d.data();
    return {
      name: String(data.name || ''),
      signalType: String(data.signalType || 'SIGNAL'),
      connectedComponentRefs: Array.isArray(data.connectedComponentRefs)
        ? data.connectedComponentRefs
        : [],
      connectedTerminalIds: Array.isArray(data.connectedTerminalIds)
        ? data.connectedTerminalIds
        : [],
      tracePoints: Array.isArray(data.tracePoints) ? data.tracePoints : [],
      confidenceScore: Number(data.confidenceScore) || 0.7,
      verificationStatus: normalizeVerificationStatus(data.verificationStatus),
      isComplete: Boolean(data.isComplete),
      incompleteNotes: String(data.incompleteNotes || ''),
    };
  });

  const hotspots: ImageAnalysisHotspot[] = hsSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: String(data.hotspotId || data.id || d.id),
      label: String(data.label || ''),
      severity:
        data.severity === 'CRITICAL' || data.severity === 'WARNING' || data.severity === 'INFO'
          ? data.severity
          : 'WARNING',
      bbox: data.bbox,
      suspectComponentRef: String(data.suspectComponentRef || ''),
      notes: String(data.notes || ''),
      source: data.source === 'AI' ? 'AI' : 'LOCAL_CV',
    };
  });

  return {
    ...rawScan,
    components,
    nets,
    hotspots,
  };
}

export function subscribePcbScans(
  uid: string,
  onData: (scans: SavedPcbScan[]) => void,
  onError?: (err: Error) => void
): () => void {
  let latestRawCloudItems: SavedPcbScan[] = [];
  let isUnsubscribed = false;

  if (isLocalWorkstationUid(uid)) {
    const emitLocal = async () => {
      try {
        const cachedDocs = await getLocalCachedDocuments<Partial<SavedPcbScan> & { createdAtMs?: number; updatedAtMs?: number }>(
          uid,
          'pcbScans'
        );
        if (isUnsubscribed) return;
        const scans: SavedPcbScan[] = cachedDocs
          .filter((docItem) => Boolean(docItem.data?.title))
          .map((docItem) => {
            const raw = docItem.data;
            const tsMs = raw.updatedAtMs ?? docItem.updatedAtMs ?? Date.now();
            const createdMs = raw.createdAtMs ?? tsMs;
            return {
              ...(raw as SavedPcbScan),
              id: docItem.docId,
              ownerId: uid,
              components: Array.isArray(raw.components) ? raw.components : [],
              nets: Array.isArray(raw.nets) ? raw.nets : [],
              hotspots: Array.isArray(raw.hotspots) ? raw.hotspots : [],
              createdAt: makeLocalTimestamp(createdMs),
              updatedAt: makeLocalTimestamp(tsMs),
              syncState: 'SYNCED_CLOUD' as const,
            };
          })
          .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
        onData(scans);
      } catch (e) {
        if (!isUnsubscribed && onError && e instanceof Error) onError(e);
      }
    };
    void emitLocal();
    const unsubLocal = subscribeLocalCollectionChange('pcbScans', () => {
      void emitLocal();
    });
    return () => {
      isUnsubscribed = true;
      unsubLocal();
    };
  }

  const emitMerged = async () => {
    try {
      const hydratedCloud = await Promise.all(
        latestRawCloudItems.map((item) =>
          hydratePcbScanFromSubcollections(uid, item).catch(() => ({
            ...item,
            components: Array.isArray(item.components) ? item.components : [],
            nets: Array.isArray(item.nets) ? item.nets : [],
            hotspots: Array.isArray(item.hotspots) ? item.hotspots : [],
          }))
        )
      );
      if (isUnsubscribed) return;
      const localCached = await getLocalCachedDocuments<
        Partial<SavedPcbScan> & { createdAtMs?: number; updatedAtMs?: number }
      >(uid, 'pcbScans');
      if (isUnsubscribed) return;
      const byId = new Map<string, SavedPcbScan>();
      for (const item of hydratedCloud) {
        byId.set(item.id, { ...item, syncState: 'SYNCED_CLOUD' });
      }
      for (const cached of localCached) {
        if (!byId.has(cached.docId) && cached.data?.title) {
          const tsMs = cached.data.updatedAtMs ?? cached.updatedAtMs ?? Date.now();
          const createdMs = cached.data.createdAtMs ?? tsMs;
          byId.set(cached.docId, {
            ...(cached.data as SavedPcbScan),
            id: cached.docId,
            ownerId: uid,
            components: Array.isArray(cached.data?.components) ? cached.data.components : [],
            nets: Array.isArray(cached.data?.nets) ? cached.data.nets : [],
            hotspots: Array.isArray(cached.data?.hotspots) ? cached.data.hotspots : [],
            createdAt: cached.data.createdAt || makeLocalTimestamp(createdMs),
            updatedAt: cached.data.updatedAt || makeLocalTimestamp(tsMs),
            syncState: cached.syncState === 'QUEUED_OFFLINE' ? 'QUEUED_OFFLINE' : 'SYNCED_CLOUD',
          });
        }
      }
      const merged = Array.from(byId.values()).sort(
        (a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0)
      );
      onData(merged);
    } catch (e) {
      if (!isUnsubscribed && onError && e instanceof Error) onError(e);
    }
  };

  void emitMerged();
  const unsubLocal = subscribeLocalCollectionChange('pcbScans', () => {
    void emitMerged();
  });

  if (!db || !auth?.currentUser) {
    return () => {
      isUnsubscribed = true;
      unsubLocal();
    };
  }

  const path = `users/${uid}/pcbScans`;
  const q = query(
    collection(db, 'users', uid, 'pcbScans'),
    where('ownerId', '==', uid)
  );

  const unsub = onSnapshot(
    q,
    (snapshot) => {
      latestRawCloudItems = snapshot.docs.map((d) => d.data() as SavedPcbScan);
      void emitMerged();
    },
    (error) => {
      void emitMerged();
      if (isTransientOfflineError(error)) {
        return;
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        if (!isUnsubscribed && onError && e instanceof Error) onError(e);
      }
    }
  );

  return () => {
    isUnsubscribed = true;
    unsubLocal();
    unsub();
  };
}

export async function deletePcbScan(uid: string, scanId: string): Promise<void> {
  const path = `users/${uid}/pcbScans/${scanId}`;
  try {
    await removeLocalCachedDocument(uid, 'pcbScans', scanId);
    if (isLocalWorkstationUid(uid)) {
      notifyLocalCollectionChange('pcbScans');
      return;
    }
    const [compSnap, netSnap, hsSnap] = await Promise.all([
      getDocs(
        query(collection(db, 'users', uid, 'pcbScans', scanId, 'components'), where('ownerId', '==', uid))
      ),
      getDocs(
        query(collection(db, 'users', uid, 'pcbScans', scanId, 'nets'), where('ownerId', '==', uid))
      ),
      getDocs(
        query(collection(db, 'users', uid, 'pcbScans', scanId, 'hotspots'), where('ownerId', '==', uid))
      ),
    ]);
    const ops: BatchWriteOp[] = [];
    for (const d of compSnap.docs) ops.push((batch) => batch.delete(d.ref));
    for (const d of netSnap.docs) ops.push((batch) => batch.delete(d.ref));
    for (const d of hsSnap.docs) ops.push((batch) => batch.delete(d.ref));
    ops.push((batch) => batch.delete(doc(db, 'users', uid, 'pcbScans', scanId)));
    await commitWriteOpsInChunks(ops);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export const FORD_OEM_PINOUTS_DB_LOG_ID = 'diag_ford_oem_pinouts_v1';

export const FORD_OEM_PINOUTS_SUMMARY_TEXT = [
  'For the Ranger and Everest T6, power goes to Pin C1E148, switched ignition to Pin C1E142, and grounds to Pins C1E139 and C1E140.',
  'For the Next-Gen Ranger and Everest EcoBlue, constant power connects to Pin CBR pin 1, ignition to CBR pin 3, and grounds to CBR pins 2 and 4.',
  'For the EcoSport and Fiesta 1.5L, connect power to Pin 1, ignition to Pin 2, and ground to Pins 3 and 4.',
  'The Focus and EcoSport GDI require power on Pin 61, ignition on Pin 16, and ground on Pin 32.',
  'For the PowerShift TCM, power is applied to Pins 1 and 2, ignition to Pin 3, and grounds to Pins 4 and 5.',
  'The Territory 1.5L EcoBoost uses Pin 8 for power, Pin 9 for ignition, and Pins 10 and 11 for ground.',
  'Connecting the Ranger 2.5L NA requires power on Pin 1, ignition on Pin 2, and ground on Pins 3 and 4.',
  'Older Escape, Focus, and Duratec models take power on Pin 15, ignition on Pin 6, and ground on Pin 61.',
  'For the Explorer, power goes to Pin 103, ignition to Pin 105, and ground to Pin 116.',
  'Finally, the Transit 2.2L TDCi needs power on Pin B20, ignition on Pin B22, and ground on Pins B23 and B24.',
].join('\n');

/**
 * Automatically seeds and synchronizes the verified 10-platform Ford OEM Pinouts
 * into the user's Firestore `diagnosticLogs` collection so both the Cloud Database
 * and the Offline AI Voice Guide / MiniSearch RAG index always have this knowledge.
 */
export async function syncFordOemPinoutsToDatabase(uid: string): Promise<void> {
  if (!db || isLocalWorkstationUid(uid)) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const logId = FORD_OEM_PINOUTS_DB_LOG_ID;
  const path = `users/${uid}/diagnosticLogs/${logId}`;
  const docRef = doc(db, 'users', uid, 'diagnosticLogs', logId);

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return;
    }
    await setDoc(docRef, {
      id: logId,
      ownerId: uid,
      title:
        'Ford / FoMoCo OEM Bench Pinouts (T6, EcoBlue, EcoSport, Fiesta, Focus, PowerShift TCM, Territory, Explorer, Transit)',
      dtcCode: 'FORD-OEM-PINOUT',
      ecuModel: 'Ford FoMoCo PCM / PowerShift TCM Suite',
      sourceType: 'PINOUT_NOTE',
      summary: FORD_OEM_PINOUTS_SUMMARY_TEXT,
      sourceCount: 0,
      schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isTransientOfflineError(error)) return;
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export const TOYOTA_OEM_PINOUTS_DB_LOG_ID = 'diag_toyota_oem_pinouts_v1';

export const TOYOTA_OEM_PINOUTS_SUMMARY_TEXT = [
  '⚠️ WARNING: Pinout Verification & Polarity: Always cross-check the exact Denso/Fujitsu Ten part number on the ECU case and verify ground continuity with a multimeter before applying +12V bench power. Toyota connectors (A/B/C/D or E1–E6) vary slightly across model years and emissions tiers (Euro 2 vs. Euro 4).',
  '1. Hilux / Fortuner / Innova (2.8L 1GD-FTV & 2.4L 2GD-FTV, Denso): Constant Power (+B / +B2): A1, A2 | Switched Ignition (IGSW): A28 | Ground (GND / E1 / ME01): A3, A4, B1 | CAN Bus: A41 (H) / A42 (L) | NE+ (CKP): B14 | G2+ (CMP): B15 | PCR1 (FRP): B32 | SCV+: B48.',
  '2. Hilux / Fortuner / Hiace (3.0L 1KD-FTV & 2.5L 2KD-FTV, Denso): Constant Power (+B / +B2): E5-1, E5-2 | Switched Ignition (IGSW): E5-9 | Ground (GND / E1 / ME01): E5-3, E6-1 | CAN Bus: E5-23 (H) / E5-24 (L) | NE+ (CKP): E6-12 | G2+ (CMP): E6-13 | PCR1 (FRP): E6-25 | SCV+: E6-31.',
  '3. Innova (2.0L 1TR-FE VVT-i Gasoline, Denso): Constant Power (+B): A1, A2 | Switched Ignition (IGSW): A18 | Ground (GND / E1): A3, B1 | CAN Bus: A33 (H) / A34 (L) | NE+ (CKP): B11 | G2+ (CMP): B12 | VTA1 (TPS): B21 | IGT1: B36.',
  '4. Hiace Commuter / GL Grandia (2.8L 1GD-FTV, Denso): Constant Power (+B / +B2): A1, A2 | Switched Ignition (IGSW): A28 | Ground (GND / E1): A3, A4, B1 | CAN Bus: A41 (H) / A42 (L) | NE+ (CKP): B14 | G2+ (CMP): B15 | PCR1 (FRP): B32 | EGR PWM: B54.',
  '5. Vios / Yaris (1.5L 1NZ-FE & 1.3L 2NZ-FE, Denso): Constant Power (+B / BATT): A1, A2 | Switched Ignition (IGSW): A15 | Ground (GND / E1): A3, B1 | CAN Bus: A27 (H) / A28 (L) | NE+ (CKP): B10 | G2+ (CMP): B11 | VTA1 (TPS): B19 | IGT1: B32.',
  '6. Vios / Yaris (1.5L 2NR-FE & 1.3L 1NR-FE Dual VVT-i, Denso): Constant Power (+B / BATT): A1, A2 | Switched Ignition (IGSW): A21 | Ground (GND / E1): A3, A4, B1 | CAN Bus: A37 (H) / A38 (L) | NE+ (CKP): B12 | G2+ (CMP): B13 | VTA1 (TPS): B24 | IGT1: B40.',
  '7. Wigo / Agya (1.0L 1KR-FE / 1KR-VE, Denso): Constant Power (+B / BATT): A1, A2 | Switched Ignition (IGSW): A12 | Ground (GND / E1): A3, B1 | CAN Bus: A22 (H) / A23 (L) | NE+ (CKP): B8 | G2+ (CMP): B9 | PIM (MAP): B16 | IGT1: B28.',
  '8. Avanza / Rush (1.5L 2NR-VE & 1.3L 1NR-VE, Denso): Constant Power (+B / BATT): A1, A2 | Switched Ignition (IGSW): A19 | Ground (GND / E1): A3, B1 | CAN Bus: A31 (H) / A32 (L) | NE+ (CKP): B11 | G2+ (CMP): B12 | PIM (MAP): B20 | IGT1: B35.',
  '9. Corolla Altis (1.6L 1ZR-FE & 1.8L 2ZR-FE Dual VVT-i, Denso): Constant Power (+B / +B2): A1, A2 | Switched Ignition (IGSW): A24 | Ground (GND / E1): A3, A4, B1 | CAN Bus: A39 (H) / A40 (L) | NE+ (CKP): B13 | G2+ (CMP): B14 | VG (MAF): B22 | IGT1: B42.',
  '10. Fortuner / Hilux 6AT TCM (Aisin AC60E / AC60F): Constant Power (+B): Pin 1, Pin 2 | Switched Ignition (IG): Pin 11 | Ground (GND / E1): Pin 15, Pin 16 | CAN Bus: Pin 21 (H) / Pin 22 (L) | NT (Input Spd): Pin 5 | SP2 (Output Spd): Pin 6 | SL1: Pin 12.',
].join('\n');

/**
 * Automatically seeds and synchronizes the verified 10-platform PH-Market Toyota OEM ECU & TCM Bench Pinouts
 * and mandatory Pinout Verification & Polarity Warning into the user's Firestore `diagnosticLogs` collection
 * so both the Cloud Database and the Offline AI Voice Guide / MiniSearch RAG index always have this knowledge.
 */
export async function syncToyotaOemPinoutsToDatabase(uid: string): Promise<void> {
  if (!db || isLocalWorkstationUid(uid)) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const logId = TOYOTA_OEM_PINOUTS_DB_LOG_ID;
  const path = `users/${uid}/diagnosticLogs/${logId}`;
  const docRef = doc(db, 'users', uid, 'diagnosticLogs', logId);

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return;
    }
    await setDoc(docRef, {
      id: logId,
      ownerId: uid,
      title:
        'Toyota OEM ECU Bench Test Pinouts (PH Market — 1GD/2GD, 1KD/2KD, 1TR, 1NZ, 2NR, 1KR, 2NR-VE, 1ZR, 6AT TCM)',
      dtcCode: 'TOYOTA-OEM-PINOUT',
      ecuModel: 'Toyota Denso ECM / Aisin AC60 6AT TCM Suite',
      sourceType: 'PINOUT_NOTE',
      summary: TOYOTA_OEM_PINOUTS_SUMMARY_TEXT,
      sourceCount: 0,
      schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isTransientOfflineError(error)) return;
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export const TOYOTA_OEM_PCB_SPECS_DB_LOG_ID = 'diag_toyota_oem_pcb_specs_v1';

export const TOYOTA_OEM_PCB_SPECS_SUMMARY_TEXT = [
  '# Toyota OEM ECU PCB Layouts & Component Specifications (PH Market — 10 Platforms)',
  'Motherboard Architectures & Landmark Identification:',
  '• Denso 275922-022 / 275922-450 (1GD-FTV / 2GD-FTV Hilux, Fortuner, Innova, Hiace): Low-ESR SMD electrolytic filter caps (100-220µF, 35V/50V) on +12V rail; Renesas/NEC 76F0085 32-bit RISC MCU (16.000/20.000 MHz crystal); DPAK N-ch power MOSFETs for SCV, EGR, VNT turbo.',
  '• Denso 175822-887 / 175822-799 (1KD-FTV / 2KD-FTV Hilux, Fortuner, Hiace): Dual NEC 76F0038AGD / 76F0040AGD processors; 27V/600W SMB TVS diode & 220µF/35V SMD filter caps on +B/IGSW; 93C86 SOIC-8 EEPROM (mask L86/S330); TJA1050 / PCA82C250 CAN transceiver.',
  '• Fujitsu Ten 211941-32200930 / Denso 275036-1152 (1NZ-FE / 2NZ-FE Vios & Yaris): Fujitsu MB91F362 / NEC 76F0038GD MCU (16.000 MHz); custom multi-reg system LSI (3.3V/5V/8V); BA6285/SE616 ETC H-bridge; 93C56 EEPROM (mask S220); 4× 60V/10A SOT-223 injector drivers.',
  '• Denso 275236-0011 / 275036-9170 (2NR-FE / 1NR-FE / 1ZR-FE Dual VVT-i): Renesas 76F0038GD/76F0085 MCU (20.000 MHz); Denso SE811 power/pre-driver LSI; dual PWM low-side drivers with 40V/3A Schottky flyback diodes; 93C66 TSSOP-8/SOIC-8 EEPROM.',
  '',
  '10 Platforms Component & Hardware Specifications:',
  '1. Hilux/Fortuner/Innova 1GD/2GD: PCB Denso 275922-022, 275922-450 | MCU Renesas/NEC 76F0085 | EEPROM 93C86 | Power LSI Denso SE811/SE921 | CAN TJA1051/V230 | EDU Trigger to ext 89871-71010 | Bulk Caps 4× 220µF/35V Low-ESR SMD | CAN Term 2× 60.4Ω + 4.7nF | SCV/VNT FETs N-Ch 60V/30A DPAK | Crystal 16.000 MHz SMD.',
  '2. Hilux/Fortuner/Hiace 1KD/2KD: PCB Denso 175822-887, 175822-799 | Dual MCU NEC 76F0038AGD/76F0040AGD | EEPROM 93C86 (L86/S330) | System Power IC Denso SE627 (5V/3.3V + watchdog) | CAN TJA1050/PCA82C250 | VC Ref 5.0V LDO | Bulk Caps 3× 220µF/35V + 2× 100µF/35V | TVS Diode 27V/600W SMB | Shunts 0.02Ω (R020) 1W | Crystal 20.000 MHz.',
  '3. Innova 2.0L 1TR-FE Gasoline: PCB Denso 175822-666, 275036-2880 | MCU NEC 76F0039GD/76F0040GD | EEPROM 93C56/93C66 | ETC H-Bridge Denso SE616/TLE6209R | Inj/Coil Driver Denso SE654 Octal | CAN TJA1050 | Bulk Caps 2× 220µF/35V + 2× 47µF/35V | IGT Pull-ups 1.0kΩ to 5V | O2 Heater FET N-Ch 60V/15A SOT-223 | Crystal 16.000 MHz.',
  '4. Hiace Commuter/GL Grandia 1GD-FTV: PCB Denso 275922-022, 276100-6832 | MCU Renesas 76F0085/76F0196 | EEPROM 93C86 | Power/System LSI Denso SE921 | EGR H-Bridge integrated IC | LIN TJA1020 + CAN TJA1051 | Bulk Caps 4× 220µF/35V SMD | EGR Sense 0.015Ω (R015) 2W | NE/G2 Filters 1.0kΩ + 1000pF | Crystal 20.000 MHz.',
  '5. Vios/Yaris 1NZ/2NZ-FE: PCB Fujitsu Ten 211941-32200930, Denso 275036-1152 | MCU Fujitsu MB91F362 / NEC 76F0038GD | EEPROM 93C56 (S220) | System LSI Fujitsu Ten multi-reg | ETC BA6285/SE616 | CAN V230/TJA1050 | Bulk Caps 3× 100µF/35V + 1× 220µF/25V | Inj Drivers 4× N-Ch 60V/10A SOT-223 | Knock Filter 6.5-7.5 kHz RC | Crystal 16.000 MHz.',
  '6. Vios/Yaris 2NR/1NR-FE Dual VVT-i: PCB Denso 275236-0011, 275036-9170 | MCU Renesas/NEC 76F0038GD/76F0085 | EEPROM 93C66 | Power LSI Denso SE811 | Dual VVT OCV low-side drivers | CAN TJA1051 | Bulk Caps 3× 220µF/35V SMD | OCV Flyback 40V/3A Schottky | TPS/MAP Pull-downs 10kΩ 1% | Crystal 20.000 MHz.',
  '7. Wigo/Agya 1.0L 1KR-FE/1KR-VE: PCB Denso 275036-7341, 112700-3410 | MCU NEC 76F0038GD/76F0039AGD | EEPROM 93C56 | Power IC Denso SE627 | 3-Cyl Driver Denso SE654 | CAN TJA1050 | Bulk Caps 2× 100µF/35V + 1× 220µF/25V | Coil Triggers (IGT1-3) 470Ω + 100pF | TVS Diode 24V/600W SMB | Crystal 16.000 MHz.',
  '8. Avanza/Rush 2NR/1NR-VE: PCB Denso 275236-0011, 89560-BZxxx | MCU Renesas/NEC 76F0038GD | EEPROM 93C66 | Power LSI Denso SE811 | ETC H-Bridge IC | CAN TJA1051 | Bulk Caps 3× 220µF/35V SMD | VC Sensor Ref 5.00V ± 0.05V (10µF bypass) | Inj Clamps 45V active Zener clamp | Crystal 20.000 MHz.',
  '9. Corolla Altis 1ZR/2ZR-FE Dual VVT-i: PCB Denso 275036-9050, 275236-0011 | MCU Renesas/NEC 76F0038GD/76F0085 | EEPROM 93C66 | System LSI Denso SE811/SE921 | Valvematic/VVT PWM IC | CAN TJA1051 | Bulk Caps 3× 220µF/35V SMD | MAF Input 2.2kΩ + 4.7nF | A/F Shunt 100Ω diff | Crystal 20.000 MHz.',
  '10. Fortuner/Hilux 6AT TCM AC60E/AC60F: PCB Aisin AW / Denso 89530-71xxx | MCU Renesas SH7058/76F0038 | EEPROM 93C66 | Solenoid Drivers 4× closed-loop PWM ICs (SL1-SL4, SLU, SLT) | CAN TJA1050 | Bulk Caps 2× 220µF/35V High-Temp (125°C) | Solenoid Sense 0.05Ω (R050) 1% | Speed Pull-ups 2.2kΩ to 5V | Crystal 16.000 MHz.',
  '',
  'Key Bench-Repair & Diagnostic Checks on Toyota Denso PCBs:',
  '1. No Power / No Comm (+B / IGSW Dead): 27V SMD TVS diode across +B & E1 near header shorts dead-to-ground on jump-start polarity reversal, blowing EFI MAIN fuse. Replace diode.',
  '2. 5V Reference (VC) Shorted: 10µF/16V ceramic MLCC bypass capacitor near SE627/SE811 cracks, pulling VC < 2.0V and killing CKP, CMP, FRP, TPS outputs simultaneously.',
  '3. Cylinder Misfire / Injector Stuck Open (1GD/2GD/1KD): Common-rail injectors driven by external EDU (89871-71010). Verify 5V square-wave IJt#1-#4 triggers & IJf feedback from ECM before replacing ECM.',
].join('\n');

/**
 * Automatically seeds and synchronizes the verified 10-platform PH-Market Toyota OEM ECU PCB Layouts & Component Specifications
 * into the user's Firestore `diagnosticLogs` collection.
 */
export async function syncToyotaOemPcbSpecsToDatabase(uid: string): Promise<void> {
  if (!db || isLocalWorkstationUid(uid)) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const logId = TOYOTA_OEM_PCB_SPECS_DB_LOG_ID;
  const path = `users/${uid}/diagnosticLogs/${logId}`;
  const docRef = doc(db, 'users', uid, 'diagnosticLogs', logId);

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return;
    }
    await setDoc(docRef, {
      id: logId,
      ownerId: uid,
      title:
        'Toyota OEM ECU PCB Layouts & Component Specifications (PH Market — 10 Platforms Denso/Fujitsu Ten)',
      dtcCode: 'TOYOTA-PCB-SPECS',
      ecuModel: 'Toyota Denso ECM / Aisin AC60 6AT TCM Hardware Suite',
      sourceType: 'PINOUT_NOTE',
      summary: TOYOTA_OEM_PCB_SPECS_SUMMARY_TEXT,
      sourceCount: 0,
      schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isTransientOfflineError(error)) return;
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export const FORD_OEM_PCB_SPECS_DB_LOG_ID = 'diag_ford_oem_pcb_specs_v1';

export const FORD_OEM_PCB_SPECS_SUMMARY_TEXT = [
  '# Ford OEM ECU PCB Layouts & Component Specifications (PH Market — 10 Platforms)',
  'Motherboard Architectures & Landmark Identification:',
  '• Continental SID208 / SID209 (2.2L & 3.2L Duratorq TDCi Ranger T6, Everest, Transit): Infineon Tricore TC1797 BGA-292 MCU (4MB Flash + 64KB D-Flash); high-energy DC-DC boost converter (toroidal inductor + 2× 47µF/250V boost caps) providing 110V-180V for Continental piezo injectors; IRF640 / STD25NF20 high-side MOSFETs; Continental ATIC91 / TLE7368 system IC.',
  '• Continental SID212 / Bosch MD1CS005 (2.0L EcoBlue Single & Bi-Turbo Next-Gen Ranger & Everest): Multi-core Infineon Aurix TC297TP/TC277 BGA processor (8MB P-Flash); dual-stage synchronous buck regulators with shielded ferrite inductors; Bosch 40184 / CJ327 system power ICs; TJA1043 / TJA1145 FD-CAN transceivers; 0.010Ω (R010) 2W current shunts; 28V/1500W SMC TVS protection.',
  '• Continental EMS2211 / EMS2510 (1.5L Ti-VCT & GDI EcoSport, Fiesta, Focus): Infineon Tricore TC1738 / TC1782 QFP MCU; ATIC111 / TLE8888 multi-output power/injector LSI; 4× 400V/18A SOT-223 IGBT ignition coil drivers (ISL9V3040D3S / STGD18N40LZ); TLE7209-2R ETC H-bridge; TJA1042 CAN.',
  '• Continental PowerShift 6DCT250 (DPS6) TCM (Fiesta, EcoSport, Focus): Infineon Tricore TC1766 BGA-176 MCU; 8× N-ch 40V/90A DPAK MOSFETs (BSC016N04LS / IPD90N04S4) driving Shift Drum Motors A & B; 2× 0.005Ω (R005) 3W current-sense shunts; TLE7183F / TLE7189F gate drivers; 4× 100µF/35V high-temp caps.',
  '',
  '10 Platforms Component & Hardware Specifications:',
  '1. Ranger/Everest T6 2.2L/3.2L TDCi: PCB Continental SID208, SID209 | MCU Infineon Tricore TC1797 | Memory 4MB Flash + 64KB D-Flash | System IC ATIC91 / TLE7368 | Piezo High-Side IRF640 / STD25NF20 | CAN TJA1041 / TJA1042 | Bulk Caps 3× 220µF/35V SMD | Piezo Boost 2× 47µF/250V + 100µH coil | CAN Term 2× 60.4Ω + 4.7nF | Crystal 20.000 MHz SMD.',
  '2. Next-Gen Ranger/Everest 2.0L EcoBlue: PCB Continental SID212, Bosch MD1CS005 | MCU Infineon Aurix TC297TP/TC277 | Memory 8MB P-Flash + emulated EEPROM | Power/Driver Bosch 40184 / CJ327 | Injector Dual-bank driver IC | CAN-FD TJA1043 / TJA1145 | Bulk Caps 4× 220µF/35V Low-ESR | Shunts 0.010Ω (R010) 2W 1% | TVS Diode 28V/1500W SMC | Crystal 20.000 MHz.',
  '3. EcoSport/Fiesta 1.5L Ti-VCT: PCB Continental EMS2211, EMS2510 | MCU Infineon Tricore TC1738/TC1782 | Memory 2MB/2.5MB Flash + D-Flash | Multi-Function ATIC111 / TLE8888 | ETC H-Bridge TLE7209-2R | CAN TJA1042 | Bulk Caps 2× 220µF/35V SMD | Coil Drivers 4× 400V/18A IGBT (SOT-223) | TPS Pull-ups 4.7kΩ 1% | Crystal 20.000 MHz.',
  '4. Focus/EcoSport GDI 2.0L/1.5L: PCB Bosch MED17.0/MED17.2, Continental EMS2511 | MCU Infineon Tricore TC1767/TC1793 | Memory Flash + 64KB EEPROM | System IC Bosch 30622 / 40048 | GDI High-Volt Bosch 30682 (65V boost) | CAN TJA1040 | Bulk Caps 3× 220µF/35V SMD | GDI Boost Cap 100µF/100V + 47µH coil | Fuel Press Shunt 0.02Ω (R020) 1W | Crystal 20.000 MHz.',
  '5. PowerShift 6AT TCM 6DCT250 DPS6: PCB Continental A2C53377498, AE8Z-7Z369-F | MCU Infineon Tricore TC1766 | Memory 1.5MB Flash + 32KB D-Flash | Gate Driver TLE7183F/TLE7189F | Transceiver TLE6251DS | Motor FETs 8× N-Ch 40V/90A DPAK | Shunts 2× 0.005Ω (R005) 3W | Filter Caps 4× 100µF/35V High-Temp | Crystal 20.000 MHz.',
  '6. Territory 1.5L EcoBoost 4G15T6: PCB Bosch MED17.8.10, FoMoCo JS1-12A650 | MCU Infineon Tricore TC1728/TC1782 | Memory 1.5MB/2.5MB Flash | Power/Driver Bosch 40076 / 40114 | GDI Boost Bosch 30682 | CAN TJA1042 | Bulk Caps 3× 220µF/35V SMD | Wastegate FET N-Ch 60V/20A DPAK | MAP Filter 1.0kΩ + 10nF MLCC | Crystal 20.000 MHz.',
  '7. Ranger 2.5L NA Duratec: PCB FoMoCo/Continental EMS2204, AB39-12A650 | MCU Infineon Tricore TC1738 | Memory 2MB Flash + emulated EEPROM | System IC ATIC111 / TLE7368 | ETC Driver TLE7209-2R | CAN TJA1041 | Bulk Caps 2× 220µF/35V + 1× 100µF/35V | Ignition Drivers 4× 400V/15A IGBTs | VCT Diode 40V/3A Schottky | Crystal 20.000 MHz.',
  '8. Escape/Focus Older Gen 2.0L/2.3L & 2.0L TDCi: PCB Visteon ESU-131/ESU-411, Siemens SID803A | MCU Motorola/NXP MPC561/MPC555 | Memory External AM29BL802C + 95320 EEPROM | Power IC TLE6240GP + TLE6209R | Coil Drivers 4× 5503DM IGBTs | CAN TJA1050 | Bulk Caps 3× 220µF/35V | Sensor 5V Ref 5.00V LDO + 10µF tantalum | CKP Filter 2.2kΩ + 4.7nF diff | Crystal 4.000/20.000 MHz.',
  '9. Explorer 2.0L/2.3L EcoBoost & 3.5L V6: PCB Bosch MEDG17.0, FoMoCo/Continental | MCU Infineon Tricore TC1797 | Memory 4MB Flash + 64KB EEPROM | System Power Bosch 30622 / 40048 | GDI/Coil Driver Bosch 30682 + 6× IGBTs | CAN Dual TJA1042 (HS1/HS2) | Bulk Caps 4× 220µF/35V SMD | GDI FETs 60V/35A DPAK | O2 Pump Shunt 61.9Ω 0.1% | Crystal 20.000 MHz.',
  '10. Transit Van 2.2L TDCi: PCB Continental SID208, Visteon DCU-102/DCU-201 | MCU Infineon TC1797 or ST10F276 | Memory Internal Flash | Power IC ATIC91 / TLE6240GP | SCV Driver Low-side PWM MOSFET | CAN TJA1041 / TJA1050 | Bulk Caps 3× 220µF/35V SMD | Piezo Boost 47µF/250V (SID208) | TVS Diode 27V/600W SMB | Crystal 20.000 MHz.',
  '',
  'Key Bench-Repair & Diagnostic Checks on Ford PCBs:',
  '1. Ranger/Everest SID208 No-Start / Piezo Fault (P0201-P0204 / P062D): Check DC-DC piezo boost stage near toroidal inductor. Shorted IRF640 / STD25NF20 high-side FET or open 0.01Ω sense resistor collapses 110V-180V rail and disables all 4 piezo injectors simultaneously.',
  '2. PowerShift 6DCT250 TCM Loss of Comm / Clutch Motor Codes (U0100 / P0902 / P090C): Inspect 8× 40V/90A DPAK MOSFETs forming motor H-bridges & 0.005Ω (R005) shunts. Thermal fatigue on TC1766 BGA solder balls or cracked sense resistors causes intermittent loss of gear selection.',
  '3. EcoSport/Fiesta EMS2211 Misfire / No Ignition Pulse (P0351-P0354): Check 4× 400V/18A SOT-223 ignition IGBTs for C-to-E shorting. Shorted coil primary burns IGBT & opens 100Ω gate resistor from ATIC111 driver IC.',
].join('\n');

/**
 * Automatically seeds and synchronizes the verified 10-platform PH-Market Ford OEM ECU PCB Layouts & Component Specifications
 * into the user's Firestore `diagnosticLogs` collection.
 */
export async function syncFordOemPcbSpecsToDatabase(uid: string): Promise<void> {
  if (!db || isLocalWorkstationUid(uid)) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const logId = FORD_OEM_PCB_SPECS_DB_LOG_ID;
  const path = `users/${uid}/diagnosticLogs/${logId}`;
  const docRef = doc(db, 'users', uid, 'diagnosticLogs', logId);

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return;
    }
    await setDoc(docRef, {
      id: logId,
      ownerId: uid,
      title:
        'Ford OEM ECU PCB Layouts & Component Specifications (PH Market — 10 Platforms Continental/Bosch/FoMoCo)',
      dtcCode: 'FORD-PCB-SPECS',
      ecuModel: 'Ford Continental SID208/SID212/EMS2211, Bosch MED17, PowerShift TCM Hardware Suite',
      sourceType: 'PINOUT_NOTE',
      summary: FORD_OEM_PCB_SPECS_SUMMARY_TEXT,
      sourceCount: 0,
      schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isTransientOfflineError(error)) return;
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export const MITSUBISHI_OEM_PCB_SPECS_DB_LOG_ID = 'diag_mitsubishi_oem_pcb_specs_v1';

export const MITSUBISHI_OEM_PCB_SPECS_SUMMARY_TEXT = [
  '# Mitsubishi OEM ECU PCB Layouts & Component Specifications (PH Market — 10 Platforms)',
  'Motherboard Architectures & Landmark Identification:',
  '• Denso 275700-7422 / 1860C711 / 1860D215 (Montero Sport Gen 3 & Strada 2.4L 4N15 MIVEC Clean Diesel): Renesas SH72543R 32-bit QFP MCU (2MB Flash + 128KB D-Flash); central bank of 9× 100-220µF/35V low-ESR SMD electrolytic caps for piezo/solenoid boost; 6× DPAK N-ch 100V/30A power MOSFETs; Denso SE921 / SE811 system power IC; 16.000 MHz crystal.',
  '• Denso 1860B556 / 275800-8833 / 1860A698 (Montero Sport Gen 2, Strada, L300 Euro 4 2.5L 4D56 & 3.2L 4M41 DI-D): Dual Renesas SH7058 / SH7059 QFP processors; 93C86 SOIC-8 EEPROM (injector QR codes & immobilizer); Denso SE627 (5V/3.3V LDO + watchdog); 85V DC-DC boost stage; 6× 220µF/35V + 2× 100µF/100V caps; 27V/600W SMB TVS diode on +B; 16.000 / 20.000 MHz crystal.',
  '• Melco E6T79xxx / 1860C298 / 1860D284 (Mirage, Mirage G4, Xpander 1.2L 3A92 & 1.5L 4A91 MIVEC): Centrally mounted Mitsubishi MH8115F / MH8106F 32-bit QFP MCU (1MB-1.5MB Flash); discrete DPAK IGBTs & FETs for ignition and electronic throttle; TLE7209-2R / BA6285 ETC H-bridge; Melco custom multi-rail regulator LSI; 16.000 MHz crystal.',
  '• Mitsubishi / Jatco CVT-ECU 10GOD38S / 8631A867 / 8631B152 (INVECS-III CVT Mirage, Lancer EX, ASX): Renesas SH7055 / SH7058 QFP MCU; 93C66 / 93C86 EEPROM; 6× constant-current PWM MOSFETs for pulley pressure and lockup; 0.05Ω (R050) 1% shunts; 2× 220µF/35V 125°C high-temp caps; 16.000 MHz crystal.',
  '',
  '10 Platforms Component & Hardware Specifications:',
  '1. Montero Sport / Strada 2.4L 4N15: PCB Denso 275700-7422, 1860C711 | MCU Renesas SH72543R | Memory 2MB Flash + 128KB D-Flash | Power IC Denso SE921 / SE811 | Injector Boost Integrated DC-DC | CAN TJA1051 | Bulk Caps 9× 100-220µF/35V SMD | Injector FETs 6× 100V/30A DPAK | SCV Shunt 0.02Ω (R020) 1W | Crystal 16.000 MHz SMD.',
  '2. Montero Sport / Strada 2.5L 4D56 & 3.2L 4M41: PCB Denso 1860B556, 275800-8833 | Dual MCU Renesas SH7058/SH7059 | EEPROM 93C86 | Power IC Denso SE627 | Injector Boost 85V DC-DC | CAN TJA1050 | Bulk Caps 6× 220µF/35V + 2× 100µF/100V | TVS Diode 27V/600W SMB | CAN Term 2× 60.4Ω + 4.7nF | Crystal 16.000 / 20.000 MHz.',
  '3. L300 Exceed / FB Euro 4 2.2L 4N14: PCB Denso 1860D118, 275700-6911 | MCU Renesas SH72531/SH72543R | Memory Flash + emulated EEPROM | Power LSI Denso SE811 | EGR/VGT Full H-bridge + PWM FET | CAN TJA1051 | Bulk Caps 4× 220µF/35V Low-ESR | EGR Shunt 0.015Ω (R015) 2W | CKP/CMP Filters 1.0kΩ + 1000pF | Crystal 16.000 MHz.',
  '4. Xpander / Xpander Cross 1.5L 4A91: PCB Melco 1860D284, E6T83xxx | MCU Mitsubishi MH8115F (QFP-144) | Memory 1.5MB Flash + EEPROM | Power IC Melco custom multi-reg + watchdog | ETC H-Bridge TLE7209-2R / BA6285 | CAN TJA1042 | Bulk Caps 4× 220µF/35V SMD | Coil Drivers 4× 400V/15A IGBTs (DPAK) | TPS Pull-downs 10kΩ 1% | Crystal 16.000 MHz.',
  '5. Mirage / Mirage G4 1.2L 3A92: PCB Melco 1860C298, E6T79xxx, 1860B947 | MCU Mitsubishi MH8115F/MH8106F | Memory 1MB/1.5MB Flash | Power IC Melco 5V/3.3V LSI | 3-Cyl Ignition/Inj Discrete DPAK IGBTs & FETs | CAN TJA1040/TJA1050 | Bulk Caps 6× 100µF/35V + 2× 220µF/25V | Coil IGBTs 3× 400V/15A DPAK | O2 Heater FET N-Ch 60V/15A DPAK | Crystal 16.000 MHz.',
  '6. Adventure / L300 Older 2.5L 4D56 (Euro 2): PCB Melco E6T38xxx, MD37xxxx | MCU Mitsubishi MH7203FA/MH8206F | Memory 128KB-256KB Flash | Power Regulator 5.0V LDO (TA78L05/NJM2396) | Solenoid Drivers STA509A / M5269L | Bulk Caps 2× 100µF/50V + 1× 47µF/35V | EGR/Glow Drivers N-Ch 60V/20A TO-252 | TVS Diode 24V/600W Zener | Crystal 12.000 / 16.000 MHz.',
  '7. Lancer EX / ASX 2.0L 4B11 & 1.6L 4A92: PCB Melco 1860A867, 1860B428, E6T76xxx | MCU Mitsubishi MH8106F (QFP-144) | Memory 1MB Flash | Power IC Melco multi-rail LSI | ETC H-Bridge TLE6209R/TLE7209 | CAN TJA1050 | Bulk Caps 4× 220µF/35V SMD | Coil Drivers 4× 400V/18A IGBTs | MIVEC OCV Diode 40V/3A Schottky | Crystal 16.000 MHz.',
  '8. Pajero BK Gen 4 3.2L 4M41: PCB Denso 1860A751, 275800-5442 | MCU Dual Renesas SH7058 | EEPROM 93C86 | Power LSI Denso SE627 | Injector Driver 85V boost converter + high/low FETs | CAN TJA1050 | Bulk Caps 4× 220µF/35V + 2× 100µF/100V | Boost Inductor 47µH shielded ferrite | Current Shunts 0.02Ω (R020) 1W | Crystal 20.000 MHz.',
  '9. Canter FE71 / FE84 Fuso 3.0L 4P10 & 3.9L 4D34: PCB Bosch EDC17CP52 / Denso 275800-xxxx (24V) | MCU Infineon TC1797 or Renesas SH7058 | Memory Flash | System IC Bosch 30622 / 40048 (24V rated) | CAN Dual TJA1042 | Bulk Caps 4× 220µF/50V (24V spec) | TVS Protection 36V/1500W SMC Zener | Current Shunts 0.01Ω (R010) 2W | Crystal 20.000 MHz.',
  '10. Mirage / Lancer EX CVT-ECU (Jatco JF015E/JF011E/F1CJC): PCB Mitsubishi 8631A867, 8631B152, 10GOD38S | MCU Renesas SH7055/SH7058 | EEPROM 93C66/93C86 | Linear Solenoid Drivers 6× PWM MOSFETs | Power/CAN TJA1050 + 5V LDO | Bulk Caps 2× 220µF/35V 125°C High-Temp | Solenoid Shunts 0.05Ω (R050) 1% | Speed Pull-ups 2.2kΩ to 5V | Crystal 16.000 MHz.',
  '',
  'Key Bench-Repair & Diagnostic Checks on Mitsubishi PCBs:',
  '1. Montero / Strada 4D56 / 4M41 Injector Misfire or Boost Fault (P0201–P0204 / P0628): On Denso 1860B556 boards, inspect 100µF/100V high-voltage boost caps and 100V/30A DPAK boost switching MOSFET. Leaking electrolyte corrodes adjacent vias under capacitor pads, cutting the 85V injector opening pulse.',
  '2. Mirage / Xpander Melco E6T79xxx No-Start / Throttle Limp Mode (P2119 / P0606): Check TLE7209-2R / BA6285 ETC H-bridge driver IC and 5.0V sensor reference rail. Water intrusion through cowl seal oxidizes pins along black harness header, shorting 5V TPS/MAP supply to ground.',
  '3. Older Adventure / L300 Melco E6T38xxx Dead Module / No Check-Engine Light: Inspect radial/SMD electrolytic caps (100µF/50V & 47µF/35V). Aged caps leak alkaline electrolyte onto PCB traces around 5.0V LDO regulator and watchdog reset line, preventing MCU boot.',
].join('\n');

/**
 * Automatically seeds and synchronizes the verified 10-platform PH-Market Mitsubishi OEM ECU PCB Layouts & Component Specifications
 * into the user's Firestore `diagnosticLogs` collection.
 */
export async function syncMitsubishiOemPcbSpecsToDatabase(uid: string): Promise<void> {
  if (!db || isLocalWorkstationUid(uid)) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const logId = MITSUBISHI_OEM_PCB_SPECS_DB_LOG_ID;
  const path = `users/${uid}/diagnosticLogs/${logId}`;
  const docRef = doc(db, 'users', uid, 'diagnosticLogs', logId);

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return;
    }
    await setDoc(docRef, {
      id: logId,
      ownerId: uid,
      title:
        'Mitsubishi OEM ECU PCB Layouts & Component Specifications (PH Market — 10 Platforms Denso/Melco/Bosch)',
      dtcCode: 'MITSUBISHI-PCB-SPECS',
      ecuModel: 'Mitsubishi Denso 4N15/4D56/4M41, Melco MIVEC, Jatco CVT-ECU Suite',
      sourceType: 'PINOUT_NOTE',
      summary: MITSUBISHI_OEM_PCB_SPECS_SUMMARY_TEXT,
      sourceCount: 0,
      schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isTransientOfflineError(error)) return;
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export const NISSAN_OEM_PCB_SPECS_DB_LOG_ID = 'diag_nissan_oem_pcb_specs_v1';

export const NISSAN_OEM_PCB_SPECS_SUMMARY_TEXT = [
  '# Nissan OEM ECU PCB Layouts & Component Specifications (PH Market — 10 Platforms)',
  'Motherboard Architectures & Landmark Identification:',
  '• Denso 275800-xxxx / 23710-4JAxx (Navara NP300/D40 & NV350 Urvan 2.5L YD25DDTi Common Rail): Renesas SH7058 / SH7059 QFP-256 MCU (16.000/20.000 MHz crystal); 8 perimeter 100-220µF/35V SMD electrolytic caps; 93C86 SOIC-8 EEPROM (injector QR codes & NATS immobilizer); Denso SE627 / SE811 system power LSI; 85V DC-DC boost stage with DPAK MOSFETs driving SCV and VNT turbo actuator; 27V/600W SMB TVS diode on +B.',
  '• Bosch EDC17C84 / MD1CS006 (Terra & Navara Pro-4X 2.3L YS23DDT / YS23DDTT Twin-Turbo): Infineon Tricore TC1782 / TC277 BGA processor (2.5MB-4MB Flash + D-Flash); dual-stage synchronous buck regulators with 6 shielded power inductors; Bosch 40114 / 30622 system power ICs; high-speed TJA1042 / TJA1043 CAN transceivers; 6× 220µF/35V Low-ESR caps; 0.010Ω (R010) 2W 1% shunts; 20.000 MHz SMD crystal.',
  '• Hitachi MEC90 / MEC100 / MEC110 / BED410 (Almera, Sylphy, X-Trail 1.5L HR15DE, 1.6L HR16DE, 2.0L MR20DD, 2.5L QR25DE): Renesas SH7055 / SH7058 / SH72531 QFP MCU; 93C66 / 95320 / 95640 serial EEPROM; Hitachi L9302-AD / STA509A / L9779WD driver array; MC33186 / TLE6209R electronic throttle H-bridge; TJA1050 CAN; 4× 400V/15A DPAK coil drivers; 16.000 / 20.000 MHz crystal.',
  '• Hitachi BED434 / BED50x / BED310 / Jatco 31036-xxxx (Almera 1.0L Turbo, Kicks e-Power, Patrol Y62 V8, Xtronic CVT): Infineon Tricore TC1767/TC1782 (BED434) or Aurix TC275/TC277 (BED50x e-Power) or Dual Renesas SH72543R (Patrol Y62); 30682 GDI boost IC; TLF35584 safety PMIC; dual CAN-FD on Kicks; closed-loop PWM drivers + quad-phase step motor driver on Jatco CVT TCM.',
  '',
  '10 Platforms Component & Hardware Specifications:',
  '1. Navara NP300 / D40 2.5L YD25DDTi: PCB Denso 275800-xxxx, 23710-4JA0A / 5X21B | MCU Renesas SH7058/SH7059 | EEPROM 93C86 | Power LSI Denso SE627/SE811 | Injector Stage 85V DC-DC boost + FETs | CAN TJA1050/TJA1051 | Bulk Caps 6× 220µF/35V + 2× 100µF/100V | SCV Shunt 0.02Ω (R020) 1W | TVS Diode 27V/600W SMB | Crystal 16.000 / 20.000 MHz.',
  '2. Terra / Navara Pro-4X 2.3L YS23: PCB Bosch EDC17C84, Bosch MD1CS006 | MCU Infineon Tricore TC1782/TC277 | Memory 2.5MB-4MB Flash + D-Flash | System IC Bosch 40114 / 30622 | Solenoid/Piezo Dual-bank driver ICs | CAN TJA1042/TJA1043 | Bulk Caps 6× 220µF/35V Low-ESR | Shunts 0.010Ω (R010) 2W 1% | CAN Term 2× 60.4Ω + 4.7nF | Crystal 20.000 MHz SMD.',
  '3. NV350 Urvan 2.5L YD25 Euro 4: PCB Denso 275700-xxxx, 23710-3XN0A / 5YA0A | MCU Renesas SH7058/SH72531 | EEPROM 93C86 | Power LSI Denso SE811 | EGR/VNT Full H-bridge + PWM FET | CAN TJA1051 | Bulk Caps 4× 220µF/35V + 2× 100µF/100V | EGR Shunt 0.015Ω (R015) 2W | CKP/CMP Filters 1.0kΩ + 1000pF | Crystal 20.000 MHz.',
  '4. Almera N17 1.5L HR15DE & 1.2L HR12DE: PCB Hitachi MEC90-xxx, MEC100, 23710-3BAxx | MCU Renesas SH7055/SH7058 | EEPROM 93C66/95320 | Driver LSI Hitachi L9302-AD / STA509A | ETC H-Bridge MC33186/TLE6209R | CAN TJA1050 | Bulk Caps 4× 220µF/35V SMD | Coil Triggers 1.0kΩ + 100pF | TPS Pull-downs 10kΩ 1% | Crystal 16.000 MHz.',
  '5. Almera N18 1.0L Turbo DIG-T: PCB Hitachi BED434-xxx, 23710-6LAxx | MCU Infineon Tricore TC1767/TC1782 | Memory 2MB-2.5MB Flash | Power IC Hitachi/Bosch 30682 GDI boost | ETC / Wastegate Dual H-bridge drivers | CAN TJA1042 | Bulk Caps 6× 220µF/35V Radial High-Temp | GDI Boost Cap 100µF/100V + 47µH coil | Coil IGBTs 3× 400V/18A DPAK | Crystal 20.000 MHz.',
  '6. Kicks e-Power 1.2L HR12DE Series-Hybrid: PCB Hitachi BED50x / VCM 23710-5RYxx | MCU Infineon Aurix TC275/TC277 | Memory 4MB Flash + D-Flash | System Power IC TLF35584 safety PMIC | e-Power Dual isolated CAN-FD | CAN TJA1043/TJA1145 | Bulk Caps 4× 220µF/35V Low-ESR | Coil Drivers 3× 400V/15A DPAK | Sensor Ref 5.00V ± 0.02V | Crystal 20.000 MHz.',
  '7. X-Trail T32 / T31 2.0L MR20DD & 2.5L QR25DE: PCB Hitachi BED410 / MEC107, 23710-4BAxx / JGxx | MCU Renesas SH72531/SH7058 | EEPROM 95320/95640 | GDI/Driver IC Hitachi custom 65V GDI boost + L9302 | ETC H-Bridge MC33186/TLE7209 | CAN TJA1050/TJA1042 | Bulk Caps 5× 220µF/35V SMD | GDI Boost Cap 100µF/100V Low-ESR | IVT OCV Diodes 40V/3A Schottky | Crystal 20.000 MHz.',
  '8. Sylphy / Juke / Livina 1.6L HR16 & 1.8L MRA8: PCB Hitachi MEC93 / MEC110, 23710-3SHxx / 1KAxx | MCU Renesas SH7058/SH72531 | EEPROM 93C66/95320 | System Power/Driver Hitachi L9779WD / L9302 | ETC H-Bridge MC33186 | CAN TJA1050 | Bulk Caps 4× 220µF/35V SMD | Coil Drivers 4× 400V/15A DPAK | O2 Heater FET N-Ch 60V/15A DPAK | Crystal 16.000 / 20.000 MHz.',
  '9. Patrol Royale Y62 5.6L VK56VD V8 DIG: PCB Hitachi BED310 / MEC120, 23710-1LBxx | Dual MCU Renesas SH72543R | EEPROM 95640 | GDI High-Volt Driver Dual 65V boost stages (Bank 1 & 2) | VVEL Actuator Dedicated H-bridge | CAN Dual TJA1042 | Bulk Caps 6× 220µF/35V + 4× 100µF/100V | V8 Coil Triggers 8× 1.0kΩ + 100pF | Current Shunts 0.015Ω (R015) 2W | Crystal 20.000 MHz.',
  '10. Jatco Xtronic CVT TCM (JF011E/JF015E/JF016E/JF017E): PCB Hitachi / Jatco 31036-xxxx, ETC94-xxxN | MCU Renesas SH7055/SH72531 | EEPROM 93C66/95640 (valve body calibration) | Linear Solenoid Drivers 5× Closed-loop PWM drivers | Step Motor Driver Quad-phase unipolar driver (JF011E) | CAN TJA1050 | Bulk Caps 3× 220µF/35V 125°C High-Temp | Solenoid Shunts 0.05Ω (R050) 1% | Speed Pull-ups 2.2kΩ to 5V | Crystal 16.000 MHz.',
  '',
  'Key Bench-Repair & Diagnostic Checks on Nissan PCBs:',
  '1. Navara / Urvan YD25DDTi No-Start / Injector Driver Fault (P0201–P0204 / P0628): On Denso 275800-xxxx boards, check 100µF/100V high-voltage boost caps and 85V boost switching MOSFET. Shorted injector harnesses on engine frequently burn bank-select DPAK MOSFETs and open 0.02Ω (R020) current-sense shunt resistor.',
  '2. Almera / Sylphy / X-Trail Hitachi MEC Throttle Limp Mode (P2101 / P1122 / P1126): Inspect MC33186 / TLE6209R electronic throttle H-bridge driver IC and ignition/throttle relay power trace. Sticky throttle body draws excessive stall current, overheating driver IC and blowing internal thermal shutdown latch.',
  '3. Jatco Xtronic CVT TCM Step-Motor or Pressure Solenoid Codes (P1778 / P0746 / P0868): On Hitachi 31036-xxxx TCMs, inspect 0.05Ω (R050) solenoid current-sense resistors and quad-driver IC traces. Note: JF016E/JF017E TCMs store unique valve-body calibration QR data in 95640 EEPROM that must be transferred if cloning replacement board.',
].join('\n');

/**
 * Automatically seeds and synchronizes the verified 10-platform PH-Market Nissan OEM ECU PCB Layouts & Component Specifications
 * into the user's Firestore `diagnosticLogs` collection.
 */
export async function syncNissanOemPcbSpecsToDatabase(uid: string): Promise<void> {
  if (!db || isLocalWorkstationUid(uid)) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const logId = NISSAN_OEM_PCB_SPECS_DB_LOG_ID;
  const path = `users/${uid}/diagnosticLogs/${logId}`;
  const docRef = doc(db, 'users', uid, 'diagnosticLogs', logId);

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return;
    }
    await setDoc(docRef, {
      id: logId,
      ownerId: uid,
      title:
        'Nissan OEM ECU PCB Layouts & Component Specifications (PH Market — 10 Platforms Denso/Hitachi/Bosch/Jatco)',
      dtcCode: 'NISSAN-PCB-SPECS',
      ecuModel: 'Nissan Denso YD25, Bosch YS23, Hitachi MEC/BED, Jatco Xtronic CVT Suite',
      sourceType: 'PINOUT_NOTE',
      summary: NISSAN_OEM_PCB_SPECS_SUMMARY_TEXT,
      sourceCount: 0,
      schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isTransientOfflineError(error)) return;
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export const BENCH_PREFERENCES_DOC_ID = 'preferences';

function sanitizeMacrosForFirestore(macros: VoiceMacro[]): VoiceMacro[] {
  return (macros || [])
    .slice(0, 50)
    .map((m) => {
      const triggerPhrase = String(m.triggerPhrase || '').trim().slice(0, 120) || 'Bench Macro';
      const name = String(m.name || triggerPhrase).trim().slice(0, 120) || triggerPhrase;
      const steps = (m.steps || [])
        .map((s) => String(s).trim().slice(0, 240))
        .filter(Boolean)
        .slice(0, 20);
      if (steps.length === 0) {
        steps.push('Connect Power');
      }
      return {
        id: String(m.id).slice(0, 128),
        name,
        triggerPhrase,
        steps,
        ...(m.description ? { description: String(m.description).slice(0, 240) } : {}),
        isPreset: Boolean(m.isPreset),
        createdAt: Math.max(0, Number(m.createdAt) || Date.now()),
        updatedAt: Math.max(0, Number(m.updatedAt) || Date.now()),
      };
    });
}

async function writeBenchPreferencesBundleToFirestore(
  uid: string,
  sanitizedChecked: string[],
  preBenchGateLocked: boolean,
  autoVerifyWorkflow: boolean,
  sanitizedMacros: VoiceMacro[]
): Promise<void> {
  const prefRef = doc(db, 'users', uid, 'benchPreferences', BENCH_PREFERENCES_DOC_ID);
  const [snap, macrosSnap] = await Promise.all([
    getDoc(prefRef),
    getDocs(
      query(
        collection(db, 'users', uid, 'benchPreferences', BENCH_PREFERENCES_DOC_ID, 'voiceMacros'),
        where('ownerId', '==', uid)
      )
    ),
  ]);

  const ops: BatchWriteOp[] = [];
  const headerFields = {
    workflowCheckedIds: sanitizedChecked,
    preBenchGateLocked,
    autoVerifyWorkflow,
    voiceMacroCount: sanitizedMacros.length,
    schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
    updatedAt: serverTimestamp(),
  };

  if (!snap.exists()) {
    ops.push((batch) => {
      batch.set(prefRef, {
        id: BENCH_PREFERENCES_DOC_ID,
        ownerId: uid,
        ...headerFields,
        createdAt: serverTimestamp(),
      });
    });
  } else {
    const existingData = snap.data() as Record<string, unknown>;
    const updatePayload: Record<string, unknown> = { ...headerFields };
    if ('voiceMacros' in existingData) {
      updatePayload.voiceMacros = deleteField();
    }
    ops.push((batch) => {
      batch.update(prefRef, updatePayload);
    });
  }

  const existingMacroIds = new Set(macrosSnap.docs.map((d) => d.id));
  const usedMacroIds = new Set<string>();
  const targetMacroIds = new Set<string>();

  sanitizedMacros.forEach((m, idx) => {
    const macroDocId = toSafeFirestoreDocId(m.id, 'macro', idx, usedMacroIds);
    targetMacroIds.add(macroDocId);
    const macroRef = doc(
      db,
      'users',
      uid,
      'benchPreferences',
      BENCH_PREFERENCES_DOC_ID,
      'voiceMacros',
      macroDocId
    );
    const mutableFields: Record<string, unknown> = {
      name: m.name,
      triggerPhrase: m.triggerPhrase,
      steps: m.steps,
      isPreset: Boolean(m.isPreset),
      macroCreatedAtMs: Number(m.createdAt) || Date.now(),
      macroUpdatedAtMs: Number(m.updatedAt) || Date.now(),
      updatedAt: serverTimestamp(),
    };
    if (m.description !== undefined) {
      mutableFields.description = m.description;
    }
    if (existingMacroIds.has(macroDocId)) {
      ops.push((batch) => {
        batch.update(macroRef, mutableFields);
      });
    } else {
      ops.push((batch) => {
        batch.set(macroRef, {
          id: macroDocId,
          ownerId: uid,
          prefId: BENCH_PREFERENCES_DOC_ID,
          ...mutableFields,
          createdAt: serverTimestamp(),
        });
      });
    }
  });

  for (const existingDoc of macrosSnap.docs) {
    if (!targetMacroIds.has(existingDoc.id)) {
      ops.push((batch) => {
        batch.delete(existingDoc.ref);
      });
    }
  }

  await commitWriteOpsInChunks(ops);
}

/**
 * Persists Diagnostic Workflow progress, Safety Gate settings, and Voice Macros
 * to /users/{uid}/benchPreferences/preferences + /voiceMacros subcollection.
 */
export async function saveUserBenchPreferences(
  uid: string,
  payload: {
    workflowCheckedIds: string[];
    preBenchGateLocked: boolean;
    autoVerifyWorkflow: boolean;
    voiceMacros: VoiceMacro[];
  }
): Promise<SavePersistenceResult> {
  const path = `users/${uid}/benchPreferences/${BENCH_PREFERENCES_DOC_ID}`;
  const sanitizedChecked = Array.from(new Set(payload.workflowCheckedIds))
    .slice(0, 20)
    .map((id) => String(id).slice(0, 64));
  const sanitizedMacros = sanitizeMacrosForFirestore(payload.voiceMacros);
  const preBenchGateLocked = Boolean(payload.preBenchGateLocked);
  const autoVerifyWorkflow = Boolean(payload.autoVerifyWorkflow);

  const basePayload = {
    id: BENCH_PREFERENCES_DOC_ID,
    ownerId: uid,
    workflowCheckedIds: sanitizedChecked,
    preBenchGateLocked,
    autoVerifyWorkflow,
    voiceMacros: sanitizedMacros,
    voiceMacroCount: sanitizedMacros.length,
    schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
  };

  const stamp = reserveMutationStamp(uid, 'benchPreferences', BENCH_PREFERENCES_DOC_ID);

  if (isLocalWorkstationUid(uid)) {
    const nowMs = Date.now();
    await cacheLocalDocument({
      uid,
      collection: 'benchPreferences',
      docId: BENCH_PREFERENCES_DOC_ID,
      data: {
        ...basePayload,
        updatedAtMs: nowMs,
      },
      syncState: 'SYNCED_CLOUD',
      version: stamp.version,
      updatedAtMs: nowMs,
    });
    notifyLocalCollectionChange('benchPreferences');
    return {
      id: BENCH_PREFERENCES_DOC_ID,
      syncedToCloud: false,
      queuedOffline: false,
      syncState: 'SYNCED_CLOUD',
    };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueueOfflineMutation({
      uid,
      collection: 'benchPreferences',
      docId: BENCH_PREFERENCES_DOC_ID,
      payload: basePayload,
      lastError: 'Browser offline — bench preferences queued for automatic cloud sync',
      version: stamp.version,
      updatedAtMs: stamp.updatedAtMs,
    });
    return {
      id: BENCH_PREFERENCES_DOC_ID,
      syncedToCloud: false,
      queuedOffline: true,
      syncState: 'QUEUED_OFFLINE',
    };
  }

  try {
    await writeBenchPreferencesBundleToFirestore(
      uid,
      sanitizedChecked,
      preBenchGateLocked,
      autoVerifyWorkflow,
      sanitizedMacros
    );
    await markMutationSynced(uid, 'benchPreferences', BENCH_PREFERENCES_DOC_ID, basePayload, {
      expectedVersion: stamp.version,
      expectedUpdatedAtMs: stamp.updatedAtMs,
    });
    return {
      id: BENCH_PREFERENCES_DOC_ID,
      syncedToCloud: true,
      queuedOffline: false,
      syncState: 'SYNCED_CLOUD',
    };
  } catch (error) {
    if (isTransientOfflineError(error)) {
      await enqueueOfflineMutation({
        uid,
        collection: 'benchPreferences',
        docId: BENCH_PREFERENCES_DOC_ID,
        payload: basePayload,
        lastError: error instanceof Error ? error.message : String(error),
        version: stamp.version,
        updatedAtMs: stamp.updatedAtMs,
      });
      return {
        id: BENCH_PREFERENCES_DOC_ID,
        syncedToCloud: false,
        queuedOffline: true,
        syncState: 'QUEUED_OFFLINE',
      };
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeUserBenchPreferences(
  uid: string,
  onData: (prefs: SavedBenchPreferences | null) => void,
  onError?: (err: Error) => void
): () => void {
  if (isLocalWorkstationUid(uid)) {
    let isCancelled = false;
    const emitLocal = async () => {
      try {
        const docs = await getLocalCachedDocuments<SavedBenchPreferences>(uid, 'benchPreferences');
        if (isCancelled) return;
        const found = docs.find((d) => d.docId === BENCH_PREFERENCES_DOC_ID);
        onData(
          found
            ? {
                ...found.data,
                voiceMacros: Array.isArray(found.data.voiceMacros) ? found.data.voiceMacros : [],
              }
            : null
        );
      } catch (e) {
        if (!isCancelled && onError && e instanceof Error) onError(e);
      }
    };
    void emitLocal();
    const unsubLocal = subscribeLocalCollectionChange('benchPreferences', () => {
      void emitLocal();
    });
    return () => {
      isCancelled = true;
      unsubLocal();
    };
  }

  let isUnsubscribed = false;
  const emitLocalPrefs = async () => {
    try {
      const docs = await getLocalCachedDocuments<SavedBenchPreferences>(uid, 'benchPreferences');
      if (isUnsubscribed) return;
      const found = docs.find((d) => d.docId === BENCH_PREFERENCES_DOC_ID);
      onData(
        found
          ? {
              ...found.data,
              voiceMacros: Array.isArray(found.data.voiceMacros) ? found.data.voiceMacros : [],
            }
          : null
      );
    } catch {
      if (!isUnsubscribed) onData(null);
    }
  };

  if (!db || !auth?.currentUser) {
    void emitLocalPrefs();
    const unsubLocal = subscribeLocalCollectionChange('benchPreferences', () => {
      void emitLocalPrefs();
    });
    return () => {
      isUnsubscribed = true;
      unsubLocal();
    };
  }

  const path = `users/${uid}/benchPreferences/${BENCH_PREFERENCES_DOC_ID}`;
  const docRef = doc(db, 'users', uid, 'benchPreferences', BENCH_PREFERENCES_DOC_ID);

  const unsub = onSnapshot(
    docRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        void emitLocalPrefs();
        return;
      }
      const rawData = snapshot.data() as SavedBenchPreferences;
      if (rawData.schemaVersion !== SCHEMA_VERSION_SUBCOLLECTIONS) {
        if (!isUnsubscribed) {
          onData({
            ...rawData,
            voiceMacros: Array.isArray(rawData.voiceMacros) ? rawData.voiceMacros : [],
          });
        }
        return;
      }

      void (async () => {
        const macrosSnap = await getDocs(
          query(
            collection(
              db,
              'users',
              uid,
              'benchPreferences',
              BENCH_PREFERENCES_DOC_ID,
              'voiceMacros'
            ),
            where('ownerId', '==', uid)
          )
        );
        if (isUnsubscribed) return;
        const voiceMacros: VoiceMacro[] = macrosSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            name: String(data.name || ''),
            triggerPhrase: String(data.triggerPhrase || ''),
            steps: Array.isArray(data.steps) ? data.steps.map(String) : [],
            description: typeof data.description === 'string' ? data.description : undefined,
            isPreset: Boolean(data.isPreset),
            createdAt: Number(data.macroCreatedAtMs) || Date.now(),
            updatedAt: Number(data.macroUpdatedAtMs) || Date.now(),
          };
        });
        onData({
          ...rawData,
          voiceMacros,
        });
      })().catch((err) => {
        void emitLocalPrefs();
        if (isTransientOfflineError(err)) return;
        if (!isUnsubscribed && onError && err instanceof Error) {
          onError(err);
        }
      });
    },
    (error) => {
      void emitLocalPrefs();
      if (isTransientOfflineError(error)) return;
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (e) {
        if (!isUnsubscribed && onError && e instanceof Error) onError(e);
      }
    }
  );

  return () => {
    isUnsubscribed = true;
    unsub();
  };
}

async function replayFirestoreMutation(record: OfflineMutationRecord): Promise<void> {
  const { uid, collection: colName, docId, payload } = record;
  if (!db || isLocalWorkstationUid(uid)) return;
  if (colName === 'users') {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    await setDoc(
      userRef,
      {
        ...(payload as Record<string, unknown>),
        ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  const rawPayload = payload as Record<string, unknown>;

  if (colName === 'benchPreferences') {
    const checked = Array.isArray(rawPayload.workflowCheckedIds)
      ? Array.from(new Set(rawPayload.workflowCheckedIds)).slice(0, 20).map(String)
      : [];
    const macros = Array.isArray(rawPayload.voiceMacros)
      ? sanitizeMacrosForFirestore(rawPayload.voiceMacros as VoiceMacro[])
      : [];
    await writeBenchPreferencesBundleToFirestore(
      uid,
      checked,
      Boolean(rawPayload.preBenchGateLocked),
      Boolean(rawPayload.autoVerifyWorkflow),
      macros
    );
    return;
  }

  if (colName === 'diagnosticLogs') {
    const sources = sanitizeSourcesList(rawPayload.sources as GroundedSearchSource[] | undefined);
    const headerDoc: Record<string, unknown> = {
      id: docId,
      ownerId: uid,
      title: String(rawPayload.title || 'Diagnostic Note').slice(0, 160),
      dtcCode: String(rawPayload.dtcCode || '').slice(0, 32),
      ecuModel: String(rawPayload.ecuModel || '').slice(0, 120),
      sourceType:
        rawPayload.sourceType === 'GROUNDED_TSB' ||
        rawPayload.sourceType === 'BENCH_SNAPSHOT' ||
        rawPayload.sourceType === 'PINOUT_NOTE'
          ? rawPayload.sourceType
          : 'BENCH_SNAPSHOT',
      summary: String(rawPayload.summary || 'Diagnostic summary recorded.').slice(0, 12000),
      sourceCount: sources.length,
      schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
    };
    await writeDiagnosticLogBundleToFirestore(uid, docId, headerDoc, sources);
    return;
  }

  if (colName === 'pcbScans') {
    const components = sanitizePcbComponentsList(
      (rawPayload.components as ImageAnalysisComponent[]) || []
    );
    const nets = sanitizePcbNetsList((rawPayload.nets as ImageAnalysisNet[]) || []);
    const hotspots = sanitizePcbHotspotsList(
      (rawPayload.hotspots as ImageAnalysisHotspot[]) || []
    );
    const headerDoc: Record<string, unknown> = {
      id: docId,
      ownerId: uid,
      title: String(rawPayload.title || 'Mapped ECU PCB Scan').slice(0, 160),
      boardType: String(rawPayload.boardType || 'Automotive ECU PCB').slice(0, 120),
      analysisSummary: String(rawPayload.analysisSummary || 'Mapped PCB layout').slice(0, 4000),
      model: String(rawPayload.model || 'gemini-4-hydrogen').slice(0, 80),
      componentCount: components.length,
      netCount: nets.length,
      hotspotCount: hotspots.length,
      schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
    };
    await writePcbScanBundleToFirestore(uid, docId, headerDoc, components, nets, hotspots);
    return;
  }

  if (colName === 'benchSessions') {
    const targetRef = doc(db, 'users', uid, 'benchSessions', docId);
    const snap = await getDoc(targetRef);
    const wires = Array.isArray(rawPayload.wires)
      ? sanitizeWiresForSession(rawPayload.wires as WireConnection[]).slice(0, 50)
      : [];

    const baseUpdatedAtMs =
      record.baseUpdatedAtMs ??
      (typeof rawPayload.baseUpdatedAtMs === 'number' ? rawPayload.baseUpdatedAtMs : undefined);

    if (snap.exists()) {
      const hasFullSnapshot =
        'title' in rawPayload &&
        'powerSupply' in rawPayload &&
        ('faults' in rawPayload || 'componentStates' in rawPayload);
      if (hasFullSnapshot) {
        const faults = sanitizeFaultsList((rawPayload.faults as InjectedFault[]) || []);
        const componentStates = sanitizeComponentStatesRecord(
          (rawPayload.componentStates as Record<
            string,
            Record<string, number | boolean | string>
          >) || {}
        );
        const headerDoc = sanitizeBenchSessionHeader(uid, docId, {
          title: String(rawPayload.title || 'ECU Bench Snapshot'),
          notes: typeof rawPayload.notes === 'string' ? rawPayload.notes : '',
          ecuProfileLabel:
            typeof rawPayload.ecuProfileLabel === 'string'
              ? rawPayload.ecuProfileLabel
              : 'Universal ECU Bench',
          powerSupply: rawPayload.powerSupply as PowerSupplyState,
          activeDtcs: Array.isArray(rawPayload.activeDtcs) ? rawPayload.activeDtcs.map(String) : [],
          supplyCurrentDrawAmps: Number(rawPayload.supplyCurrentDrawAmps) || 0,
          wireCount: wires.length,
          faultCount: faults.length,
          componentStateCount: Object.keys(componentStates).length,
          selectedBrandKey:
            typeof rawPayload.selectedBrandKey === 'string'
              ? rawPayload.selectedBrandKey
              : undefined,
          selectedModelName:
            typeof rawPayload.selectedModelName === 'string'
              ? rawPayload.selectedModelName
              : undefined,
          selectedEcuProfileId:
            rawPayload.selectedEcuProfileId === null ||
            typeof rawPayload.selectedEcuProfileId === 'string'
              ? rawPayload.selectedEcuProfileId
              : undefined,
          rpmEmulator: rawPayload.rpmEmulator as RpmEmulatorState | undefined,
          gaugeMonitor: rawPayload.gaugeMonitor as GaugeMonitorState | undefined,
          multimeter: rawPayload.multimeter as MultimeterState | undefined,
          workflowCheckedIds: Array.isArray(rawPayload.workflowCheckedIds)
            ? rawPayload.workflowCheckedIds.map(String)
            : undefined,
          preBenchGateLocked:
            typeof rawPayload.preBenchGateLocked === 'boolean'
              ? rawPayload.preBenchGateLocked
              : undefined,
        });
        await syncBenchSessionFullToFirestore(
          uid,
          docId,
          headerDoc,
          wires,
          faults,
          componentStates,
          baseUpdatedAtMs
        );
      } else {
        const outcome = await syncBenchSessionWiresSubcollection(
          uid,
          docId,
          wires,
          baseUpdatedAtMs,
          rawPayload
        );
        if (!outcome.conflictForked) {
          const extraUpdates = buildBenchSessionUpdatePayload(rawPayload);
          delete extraUpdates.wireCount;
          delete extraUpdates.schemaVersion;
          if (Object.keys(extraUpdates).length > 0) {
            await updateDoc(targetRef, {
              ...extraUpdates,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }
      return;
    }

    if (!('title' in rawPayload && 'powerSupply' in rawPayload)) {
      // Partial wire patch for a session that no longer exists remotely; nothing safe to create.
      return;
    }

    const faults = sanitizeFaultsList((rawPayload.faults as InjectedFault[]) || []);
    const componentStates = sanitizeComponentStatesRecord(
      (rawPayload.componentStates as Record<string, Record<string, number | boolean | string>>) || {}
    );
    const headerDoc = sanitizeBenchSessionHeader(uid, docId, {
      title: String(rawPayload.title || 'ECU Bench Snapshot'),
      notes: typeof rawPayload.notes === 'string' ? rawPayload.notes : '',
      ecuProfileLabel:
        typeof rawPayload.ecuProfileLabel === 'string'
          ? rawPayload.ecuProfileLabel
          : 'Universal ECU Bench',
      powerSupply: rawPayload.powerSupply as PowerSupplyState,
      activeDtcs: Array.isArray(rawPayload.activeDtcs) ? rawPayload.activeDtcs.map(String) : [],
      supplyCurrentDrawAmps: Number(rawPayload.supplyCurrentDrawAmps) || 0,
      wireCount: wires.length,
      faultCount: faults.length,
      componentStateCount: Object.keys(componentStates).length,
      selectedBrandKey:
        typeof rawPayload.selectedBrandKey === 'string' ? rawPayload.selectedBrandKey : undefined,
      selectedModelName:
        typeof rawPayload.selectedModelName === 'string' ? rawPayload.selectedModelName : undefined,
      selectedEcuProfileId:
        rawPayload.selectedEcuProfileId === null || typeof rawPayload.selectedEcuProfileId === 'string'
          ? rawPayload.selectedEcuProfileId
          : undefined,
      rpmEmulator: rawPayload.rpmEmulator as RpmEmulatorState | undefined,
      gaugeMonitor: rawPayload.gaugeMonitor as GaugeMonitorState | undefined,
      multimeter: rawPayload.multimeter as MultimeterState | undefined,
      workflowCheckedIds: Array.isArray(rawPayload.workflowCheckedIds)
        ? rawPayload.workflowCheckedIds.map(String)
        : undefined,
      preBenchGateLocked:
        typeof rawPayload.preBenchGateLocked === 'boolean'
          ? rawPayload.preBenchGateLocked
          : undefined,
    });
    await writeBenchSessionBundleToFirestore(uid, docId, headerDoc, wires, faults, componentStates);
    return;
  }

  if (colName === 'faultSequences') {
    if (rawPayload._deleted === true) {
      await deleteFaultSequenceFromFirestore(uid, docId);
      return;
    }
    const sanitized = sanitizeFaultSequence(rawPayload);
    if (!sanitized) return;
    const normalizedSeq = sanitizeFaultSequenceForFirestore({
      ...sanitized,
      id: docId,
      isBuiltInPreset: false,
    });
    await writeFaultSequenceBundleToFirestore(uid, docId, normalizedSeq);
  }
}

function clampSeqNum(val: unknown, fallback: number, min: number, max: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeFaultSequenceForFirestore(sequence: CustomFaultSequence): CustomFaultSequence {
  const base = sanitizeFaultSequence({
    ...sequence,
    isBuiltInPreset: false,
  });
  const source = base ?? {
    ...sequence,
    isBuiltInPreset: false,
    steps: sequence.steps.slice(0, MAX_STEPS_PER_SEQUENCE),
  };

  const steps: FaultSequenceStep[] = source.steps.slice(0, MAX_STEPS_PER_SEQUENCE).map((step, sIdx) => ({
    id: toSafeFirestoreDocId(step.id, 'fstep', sIdx),
    name: String(step.name || `Stage ${sIdx + 1}`).slice(0, 100) || `Stage ${sIdx + 1}`,
    durationSec: clampSeqNum(step.durationSec, 6, 2, 120),
    notes: String(step.notes || '').slice(0, 280),
    items: (step.items || []).slice(0, MAX_ITEMS_PER_STEP).map((item, iIdx) => {
      const startOhms = clampSeqNum(item.startOhms, 50, 0.5, 100_000);
      const endOhms = clampSeqNum(item.endOhms ?? startOhms, startOhms, 0.5, 100_000);
      const onDurationMs = clampSeqNum(item.onDurationMs, 700, MIN_PULSE_WIDTH_MS, 30_000);
      const offDurationMs = clampSeqNum(item.offDurationMs, 900, MIN_PULSE_WIDTH_MS, 30_000);
      const effect: IntermittentEffect =
        item.intermittentEffect === 'SHORT_TO_GND' || item.intermittentEffect === 'HIGH_RESISTANCE'
          ? item.intermittentEffect
          : 'OPEN_DROPOUT';
      return {
        id: toSafeFirestoreDocId(item.id, 'fitem', iIdx),
        pinId: String(item.pinId || 'ecu-pin-7').slice(0, 64) || 'ecu-pin-7',
        ...(item.wireId ? { wireId: String(item.wireId).slice(0, 64) } : {}),
        mode: item.mode,
        label: String(item.label || item.mode).slice(0, 120) || item.mode,
        startOhms,
        endOhms,
        onDurationMs,
        offDurationMs,
        intermittentEffect: effect,
      };
    }),
  }));

  const now = Date.now();
  return {
    id: toSafeFirestoreDocId(source.id, 'fseq', 0),
    title: String(source.title || 'Custom Fault Sequence').slice(0, 100) || 'Custom Fault Sequence',
    description: String(source.description || '').slice(0, 320),
    difficulty:
      source.difficulty === 'APPRENTICE' || source.difficulty === 'MASTER'
        ? source.difficulty
        : 'TECHNICIAN',
    loopPlayback: Boolean(source.loopPlayback),
    blindChallengeHint: String(source.blindChallengeHint || '').slice(0, 260),
    steps,
    isBuiltInPreset: false,
    createdAt: Math.max(0, Number(source.createdAt) || now),
    updatedAt: Math.max(0, Number(source.updatedAt) || now),
  };
}

async function writeFaultSequenceBundleToFirestore(
  uid: string,
  seqId: string,
  seq: CustomFaultSequence
): Promise<void> {
  const seqRef = doc(db, 'users', uid, 'faultSequences', seqId);
  const [headerSnap, stagesSnap, itemsSnap] = await Promise.all([
    getDoc(seqRef),
    getDocs(
      query(
        collection(db, 'users', uid, 'faultSequences', seqId, 'stages'),
        where('ownerId', '==', uid)
      )
    ),
    getDocs(
      query(
        collection(db, 'users', uid, 'faultSequences', seqId, 'items'),
        where('ownerId', '==', uid)
      )
    ),
  ]);

  const ops: BatchWriteOp[] = [];
  const totalItemCount = seq.steps.reduce((acc, s) => acc + s.items.length, 0);
  const mutableHeader: Record<string, unknown> = {
    title: seq.title,
    description: seq.description,
    difficulty: seq.difficulty,
    loopPlayback: seq.loopPlayback,
    blindChallengeHint: seq.blindChallengeHint ?? '',
    stageCount: seq.steps.length,
    itemCount: totalItemCount,
    schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
    sequenceUpdatedAtMs: seq.updatedAt,
    updatedAt: serverTimestamp(),
  };

  if (headerSnap.exists()) {
    ops.push((batch) => {
      batch.update(seqRef, mutableHeader);
    });
  } else {
    ops.push((batch) => {
      batch.set(seqRef, {
        id: seqId,
        ownerId: uid,
        ...mutableHeader,
        sequenceCreatedAtMs: seq.createdAt,
        createdAt: serverTimestamp(),
      });
    });
  }

  const existingStageIds = new Set(stagesSnap.docs.map((d) => d.id));
  const usedStageIds = new Set<string>();
  const targetStageIds = new Set<string>();

  const existingItemIds = new Set(itemsSnap.docs.map((d) => d.id));
  const usedItemIds = new Set<string>();
  const targetItemIds = new Set<string>();
  let globalItemIdx = 0;

  seq.steps.forEach((stage, sIdx) => {
    const stageDocId = toSafeFirestoreDocId(stage.id, 'stage', sIdx, usedStageIds);
    targetStageIds.add(stageDocId);
    const stageRef = doc(db, 'users', uid, 'faultSequences', seqId, 'stages', stageDocId);
    const mutableStageFields = {
      orderIndex: sIdx,
      name: stage.name,
      durationSec: stage.durationSec,
      notes: stage.notes,
      itemCount: stage.items.length,
      updatedAt: serverTimestamp(),
    };

    if (existingStageIds.has(stageDocId)) {
      ops.push((batch) => {
        batch.update(stageRef, mutableStageFields);
      });
    } else {
      ops.push((batch) => {
        batch.set(stageRef, {
          id: stageDocId,
          ownerId: uid,
          sequenceId: seqId,
          ...mutableStageFields,
          createdAt: serverTimestamp(),
        });
      });
    }

    stage.items.forEach((item, iIdx) => {
      const itemDocId = toSafeFirestoreDocId(item.id, 'item', globalItemIdx, usedItemIds);
      targetItemIds.add(itemDocId);
      const itemRef = doc(db, 'users', uid, 'faultSequences', seqId, 'items', itemDocId);
      const mutableItemFields = {
        stageId: stageDocId,
        orderIndex: globalItemIdx,
        pinId: item.pinId,
        wireId: item.wireId ?? '',
        mode: item.mode,
        label: item.label,
        startOhms: item.startOhms ?? 50,
        endOhms: item.endOhms ?? item.startOhms ?? 50,
        onDurationMs: item.onDurationMs ?? 700,
        offDurationMs: item.offDurationMs ?? 900,
        intermittentEffect: item.intermittentEffect ?? 'OPEN_DROPOUT',
        updatedAt: serverTimestamp(),
      };
      globalItemIdx += 1;

      if (existingItemIds.has(itemDocId)) {
        ops.push((batch) => {
          batch.update(itemRef, mutableItemFields);
        });
      } else {
        ops.push((batch) => {
          batch.set(itemRef, {
            id: itemDocId,
            ownerId: uid,
            sequenceId: seqId,
            ...mutableItemFields,
            createdAt: serverTimestamp(),
          });
        });
      }
      void iIdx;
    });
  });

  for (const d of stagesSnap.docs) {
    if (!targetStageIds.has(d.id)) {
      ops.push((batch) => batch.delete(d.ref));
    }
  }
  for (const d of itemsSnap.docs) {
    if (!targetItemIds.has(d.id)) {
      ops.push((batch) => batch.delete(d.ref));
    }
  }

  await commitWriteOpsInChunks(ops);
}

async function deleteFaultSequenceFromFirestore(uid: string, seqId: string): Promise<void> {
  const [stagesSnap, itemsSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'users', uid, 'faultSequences', seqId, 'stages'),
        where('ownerId', '==', uid)
      )
    ),
    getDocs(
      query(
        collection(db, 'users', uid, 'faultSequences', seqId, 'items'),
        where('ownerId', '==', uid)
      )
    ),
  ]);

  const ops: BatchWriteOp[] = [];
  for (const d of itemsSnap.docs) ops.push((batch) => batch.delete(d.ref));
  for (const d of stagesSnap.docs) ops.push((batch) => batch.delete(d.ref));
  ops.push((batch) => batch.delete(doc(db, 'users', uid, 'faultSequences', seqId)));
  await commitWriteOpsInChunks(ops);
}

/**
 * Persists a custom Fault Builder sequence into IndexedDB immediately and queues/writes
 * an atomic subcollection batch to Firestore (/users/{uid}/faultSequences/{sequenceId}).
 */
export async function saveFaultSequence(
  uid: string,
  sequence: CustomFaultSequence
): Promise<SavePersistenceResult & { sequence: CustomFaultSequence }> {
  const isPresetSource = Boolean(sequence.isBuiltInPreset);
  const rawTargetId = isPresetSource ? makeSafeId('fseq') : sequence.id || makeSafeId('fseq');
  const seqId = toSafeFirestoreDocId(rawTargetId, 'fseq', 0);
  const path = `users/${uid}/faultSequences/${seqId}`;
  const normalized = sanitizeFaultSequenceForFirestore({
    ...sequence,
    id: seqId,
    title:
      isPresetSource && !sequence.title.toLowerCase().includes('custom')
        ? `${sequence.title} (Custom)`
        : sequence.title,
    isBuiltInPreset: false,
    createdAt: isPresetSource ? Date.now() : sequence.createdAt || Date.now(),
    updatedAt: Date.now(),
  });

  const payload = {
    ...normalized,
    ownerId: uid,
    schemaVersion: SCHEMA_VERSION_SUBCOLLECTIONS,
  };

  const stamp = reserveMutationStamp(uid, 'faultSequences', seqId);

  if (isLocalWorkstationUid(uid)) {
    await cacheLocalDocument({
      uid,
      collection: 'faultSequences',
      docId: seqId,
      data: payload,
      syncState: 'SYNCED_CLOUD',
      version: stamp.version,
      updatedAtMs: stamp.updatedAtMs,
    });
    notifyLocalCollectionChange('faultSequences');
    return {
      id: seqId,
      syncedToCloud: false,
      queuedOffline: false,
      syncState: 'SYNCED_CLOUD',
      sequence: { ...normalized, syncState: 'LOCAL_ONLY' },
    };
  }

  if (!db || !auth?.currentUser || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    await enqueueOfflineMutation({
      uid,
      collection: 'faultSequences',
      docId: seqId,
      payload,
      lastError: 'Offline or unauthenticated — fault sequence queued for automatic cloud sync',
      version: stamp.version,
      updatedAtMs: stamp.updatedAtMs,
    });
    notifyLocalCollectionChange('faultSequences');
    return {
      id: seqId,
      syncedToCloud: false,
      queuedOffline: true,
      syncState: 'QUEUED_OFFLINE',
      sequence: { ...normalized, syncState: 'QUEUED_OFFLINE' },
    };
  }

  try {
    await writeFaultSequenceBundleToFirestore(uid, seqId, normalized);
    await markMutationSynced(uid, 'faultSequences', seqId, payload, {
      expectedVersion: stamp.version,
      expectedUpdatedAtMs: stamp.updatedAtMs,
    });
    notifyLocalCollectionChange('faultSequences');
    return {
      id: seqId,
      syncedToCloud: true,
      queuedOffline: false,
      syncState: 'SYNCED_CLOUD',
      sequence: { ...normalized, syncState: 'SYNCED_CLOUD' },
    };
  } catch (error) {
    if (isTransientOfflineError(error)) {
      await enqueueOfflineMutation({
        uid,
        collection: 'faultSequences',
        docId: seqId,
        payload,
        lastError: error instanceof Error ? error.message : String(error),
        version: stamp.version,
        updatedAtMs: stamp.updatedAtMs,
      });
      notifyLocalCollectionChange('faultSequences');
      return {
        id: seqId,
        syncedToCloud: false,
        queuedOffline: true,
        syncState: 'QUEUED_OFFLINE',
        sequence: { ...normalized, syncState: 'QUEUED_OFFLINE' },
      };
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteFaultSequence(
  uid: string,
  sequenceId: string
): Promise<{ syncedToCloud: boolean; queuedOffline: boolean }> {
  const seqId = toSafeFirestoreDocId(sequenceId, 'fseq', 0);
  const path = `users/${uid}/faultSequences/${seqId}`;
  const stamp = reserveMutationStamp(uid, 'faultSequences', seqId);

  if (isLocalWorkstationUid(uid)) {
    await removeLocalCachedDocument(uid, 'faultSequences', seqId);
    notifyLocalCollectionChange('faultSequences');
    return { syncedToCloud: false, queuedOffline: false };
  }

  if (!db || !auth?.currentUser || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    await enqueueOfflineMutation({
      uid,
      collection: 'faultSequences',
      docId: seqId,
      payload: { _deleted: true, id: seqId },
      lastError: 'Offline — sequence deletion queued for cloud sync',
      version: stamp.version,
      updatedAtMs: stamp.updatedAtMs,
    });
    notifyLocalCollectionChange('faultSequences');
    return { syncedToCloud: false, queuedOffline: true };
  }

  try {
    await deleteFaultSequenceFromFirestore(uid, seqId);
    await removeLocalCachedDocument(uid, 'faultSequences', seqId);
    notifyLocalCollectionChange('faultSequences');
    return { syncedToCloud: true, queuedOffline: false };
  } catch (error) {
    if (isTransientOfflineError(error)) {
      await enqueueOfflineMutation({
        uid,
        collection: 'faultSequences',
        docId: seqId,
        payload: { _deleted: true, id: seqId },
        lastError: error instanceof Error ? error.message : String(error),
        version: stamp.version,
        updatedAtMs: stamp.updatedAtMs,
      });
      notifyLocalCollectionChange('faultSequences');
      return { syncedToCloud: false, queuedOffline: true };
    }
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

const migratedFaultSequenceUids = new Set<string>();

/**
 * One-time idempotent migration from legacy localStorage (`autoelectric_fault_builder_sequences_v1`)
 * into durable IndexedDB (+ Firestore cloud queue when signed in).
 */
export async function migrateLegacyLocalFaultSequencesToStore(uid: string): Promise<number> {
  const legacyList = readLegacyLocalFaultSequences();
  if (legacyList.length === 0) return 0;

  const existingDocs = await getLocalCachedDocuments<Record<string, unknown>>(uid, 'faultSequences');
  const existingIds = new Set(existingDocs.map((d) => d.docId));

  let migratedCount = 0;
  for (const seq of legacyList) {
    const safeId = toSafeFirestoreDocId(seq.id, 'fseq', 0);
    if (!existingIds.has(safeId)) {
      await saveFaultSequence(uid, { ...seq, id: safeId, isBuiltInPreset: false });
      migratedCount += 1;
    }
  }

  clearLegacyLocalFaultSequences();
  return migratedCount;
}

export function subscribeFaultSequences(
  uid: string,
  onData: (sequences: CustomFaultSequence[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!migratedFaultSequenceUids.has(uid)) {
    migratedFaultSequenceUids.add(uid);
    void migrateLegacyLocalFaultSequencesToStore(uid).catch(() => {
      // Non-fatal migration error
    });
  }

  const readCachedSequences = async (localFallbackTone: 'LOCAL_ONLY' | 'SYNCED_CLOUD') => {
    const docs = await getLocalCachedDocuments<Record<string, unknown>>(uid, 'faultSequences');
    const deletedIds = new Set<string>();
    const list: CustomFaultSequence[] = [];
    for (const d of docs) {
      if (d.data && d.data._deleted === true) {
        deletedIds.add(d.docId);
        continue;
      }
      const parsed = sanitizeFaultSequence(d.data);
      if (!parsed) continue;
      list.push({
        ...parsed,
        id: d.docId,
        isBuiltInPreset: false,
        syncState:
          d.syncState === 'QUEUED_OFFLINE'
            ? 'QUEUED_OFFLINE'
            : localFallbackTone,
      });
    }
    return { list, deletedIds };
  };

  if (isLocalWorkstationUid(uid) || !db || !auth?.currentUser) {
    let isCancelled = false;
    const emitLocal = async () => {
      try {
        const { list } = await readCachedSequences('LOCAL_ONLY');
        if (!isCancelled) {
          onData(list.sort((a, b) => b.updatedAt - a.updatedAt));
        }
      } catch (e) {
        if (!isCancelled && onError && e instanceof Error) onError(e);
      }
    };
    void emitLocal();
    const unsubLocal = subscribeLocalCollectionChange('faultSequences', () => {
      void emitLocal();
    });
    return () => {
      isCancelled = true;
      unsubLocal();
    };
  }

  let isUnsubscribed = false;
  let latestHeaderDocs: Array<{ id: string; data: Record<string, unknown> }> | null = null;
  const path = `users/${uid}/faultSequences`;

  const emitMerged = async () => {
    try {
      const { list: cachedList, deletedIds } = await readCachedSequences('SYNCED_CLOUD');
      const byId = new Map<string, CustomFaultSequence>();

      if (latestHeaderDocs && latestHeaderDocs.length > 0) {
        const hydratedCloud = await Promise.all(
          latestHeaderDocs.map(async (hdr) => {
            if (deletedIds.has(hdr.id)) return null;
            const d = hdr.data;
            const [stagesSnap, itemsSnap] = await Promise.all([
              getDocs(
                query(
                  collection(db, 'users', uid, 'faultSequences', hdr.id, 'stages'),
                  where('ownerId', '==', uid)
                )
              ),
              getDocs(
                query(
                  collection(db, 'users', uid, 'faultSequences', hdr.id, 'items'),
                  where('ownerId', '==', uid)
                )
              ),
            ]);

            const itemsByStage = new Map<string, Array<{ orderIndex: number; item: FaultBuilderStageItem }>>();
            for (const itemDoc of itemsSnap.docs) {
              const idata = itemDoc.data();
              const stageId = String(idata.stageId || '');
              const bucket = itemsByStage.get(stageId) ?? [];
              bucket.push({
                orderIndex: Number(idata.orderIndex) || 0,
                item: {
                  id: String(idata.id || itemDoc.id),
                  pinId: String(idata.pinId || 'ecu-pin-7'),
                  ...(idata.wireId ? { wireId: String(idata.wireId) } : {}),
                  mode: String(idata.mode || 'OPEN_CIRCUIT') as CustomFaultMode,
                  label: String(idata.label || ''),
                  startOhms: Number(idata.startOhms) || 50,
                  endOhms: Number(idata.endOhms) || 50,
                  onDurationMs: Number(idata.onDurationMs) || 700,
                  offDurationMs: Number(idata.offDurationMs) || 900,
                  intermittentEffect: String(idata.intermittentEffect || 'OPEN_DROPOUT') as IntermittentEffect,
                },
              });
              itemsByStage.set(stageId, bucket);
            }

            const steps: FaultSequenceStep[] = stagesSnap.docs
              .map((sDoc) => {
                const sdata = sDoc.data();
                const stageId = String(sdata.id || sDoc.id);
                const rawItems = (itemsByStage.get(stageId) ?? [])
                  .sort((a, b) => a.orderIndex - b.orderIndex)
                  .map((entry) => entry.item);
                return {
                  orderIndex: Number(sdata.orderIndex) || 0,
                  step: {
                    id: stageId,
                    name: String(sdata.name || 'Stage'),
                    durationSec: Number(sdata.durationSec) || 6,
                    notes: String(sdata.notes || ''),
                    items: rawItems,
                  },
                };
              })
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((entry) => entry.step);

            if (steps.length === 0) return null;

            const reconstructed = sanitizeFaultSequence({
              id: hdr.id,
              title: String(d.title || 'Untitled Fault Sequence'),
              description: String(d.description || ''),
              difficulty: d.difficulty,
              loopPlayback: Boolean(d.loopPlayback),
              blindChallengeHint: typeof d.blindChallengeHint === 'string' ? d.blindChallengeHint : '',
              steps,
              isBuiltInPreset: false,
              syncState: 'SYNCED_CLOUD',
              createdAt: Number(d.sequenceCreatedAtMs) || Date.now(),
              updatedAt: Number(d.sequenceUpdatedAtMs) || Date.now(),
            });
            return reconstructed;
          })
        );

        for (const seq of hydratedCloud) {
          if (!seq) continue;
          byId.set(seq.id, seq);
          await cacheLocalDocument({
            uid,
            collection: 'faultSequences',
            docId: seq.id,
            data: seq as unknown as Record<string, unknown>,
            syncState: 'SYNCED_CLOUD',
            updatedAtMs: seq.updatedAt,
          });
        }
      }

      // Overlay any locally cached / offline-queued sequences (queued edits always take precedence)
      for (const localSeq of cachedList) {
        const existing = byId.get(localSeq.id);
        if (!existing || localSeq.syncState === 'QUEUED_OFFLINE' || localSeq.updatedAt > existing.updatedAt) {
          byId.set(localSeq.id, localSeq);
        }
      }

      if (!isUnsubscribed) {
        onData(Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt));
      }
    } catch (err) {
      if (isTransientOfflineError(err)) {
        const { list } = await readCachedSequences('SYNCED_CLOUD');
        if (!isUnsubscribed) onData(list.sort((a, b) => b.updatedAt - a.updatedAt));
        return;
      }
      if (!isUnsubscribed && onError && err instanceof Error) {
        onError(err);
      }
    }
  };

  void emitMerged();
  const unsubLocal = subscribeLocalCollectionChange('faultSequences', () => {
    void emitMerged();
  });

  const q = query(collection(db, 'users', uid, 'faultSequences'), where('ownerId', '==', uid));
  const unsub = onSnapshot(
    q,
    (snapshot) => {
      latestHeaderDocs = snapshot.docs.map((d) => ({
        id: d.id,
        data: d.data() as Record<string, unknown>,
      }));
      void emitMerged();
    },
    (error) => {
      void emitMerged();
      if (isTransientOfflineError(error)) return;
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        if (!isUnsubscribed && onError && e instanceof Error) onError(e);
      }
    }
  );

  return () => {
    isUnsubscribed = true;
    unsubLocal();
    unsub();
  };
}

export async function flushQueuedBenchSync(
  uid: string,
  forceRetry = false
): Promise<{ synced: number; failed: number; remaining: number }> {
  await refreshPendingCount(uid);
  if (!db || isLocalWorkstationUid(uid)) {
    return { synced: 0, failed: 0, remaining: 0 };
  }
  return flushOfflineMutations(uid, replayFirestoreMutation, { forceRetry });
}


