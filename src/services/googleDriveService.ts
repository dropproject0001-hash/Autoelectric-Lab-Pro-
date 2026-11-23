import { GoogleWorkspaceAuthError, parseGoogleWorkspaceHttpError } from './googleDocsService';
import {
  BenchComponent,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import type { RpmEmulatorState } from '../utils/vehicleEcuRegistry';
import type { VoiceMacro } from './voiceMacroService';
import {
  GaugeMonitorState,
  sanitizeGaugeMonitorState,
} from '../simulation/telemetry/telemetryTypes';

const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
export const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
export const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
export const GOOGLE_SLIDE_MIME = 'application/vnd.google-apps.presentation';

export type DriveMimeFilter = 'ALL' | 'FOLDERS' | 'DOCS' | 'JSON' | 'IMAGES' | 'PDF';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  thumbnailLink?: string;
  parents?: string[];
  trashed?: boolean;
  description?: string;
  owners?: { displayName?: string; emailAddress?: string }[];
}

export interface DriveBenchSnapshot {
  schemaVersion: 1;
  app: 'AutoElectric Lab Pro';
  exportedAt: string;
  title: string;
  ecuProfileLabel: string;
  selectedBrandKey?: string;
  selectedModelName?: string;
  selectedEcuProfileId?: string | null;
  powerSupply: PowerSupplyState;
  wires: WireConnection[];
  faults: InjectedFault[];
  componentStates: Record<string, Record<string, number | boolean | string>>;
  rpmEmulator?: RpmEmulatorState;
  gaugeMonitor?: GaugeMonitorState;
  multimeter?: MultimeterState;
  activeDtcs?: string[];
  supplyCurrentDrawAmps?: number;
  workflowCheckedIds?: string[];
  preBenchGateLocked?: boolean;
  voiceMacros?: VoiceMacro[];
}

const FILE_FIELDS =
  'id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink,parents,trashed,description,owners(displayName,emailAddress)';

async function driveFetch<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {},
  isJsonBody = true
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    ...((init.headers as Record<string, string>) || {}),
  };
  if (isJsonBody && init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });

  if (res.status === 401) {
    throw new GoogleWorkspaceAuthError(
      'Your Google Workspace session expired. Please sign in with Google again.',
      401
    );
  }

  if (res.status === 204) {
    return {} as T;
  }

  const text = await res.text();
  let json: Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = {};
    }
  }

  if (!res.ok) {
    throw parseGoogleWorkspaceHttpError(
      res.status,
      json,
      'Google Drive',
      'Google Drive permissions are missing or denied. Click Sign in with Google to grant Drive access.'
    );
  }

  return json as T;
}

export async function listDriveFiles(
  accessToken: string,
  options: {
    q?: string;
    folderId?: string;
    mimeFilter?: DriveMimeFilter;
    pageSize?: number;
    pageToken?: string;
  } = {}
): Promise<{ files: DriveFileItem[]; nextPageToken?: string }> {
  const qParts: string[] = ['trashed = false'];
  const searchTerm = (options.q || '').trim().replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  if (searchTerm) {
    qParts.push(`name contains '${searchTerm}'`);
  } else if (options.folderId) {
    const cleanFolder = options.folderId.replace(/'/g, "\\'");
    qParts.push(`'${cleanFolder}' in parents`);
  }

  switch (options.mimeFilter) {
    case 'FOLDERS':
      qParts.push(`mimeType = '${DRIVE_FOLDER_MIME}'`);
      break;
    case 'DOCS':
      qParts.push(
        `(mimeType = '${GOOGLE_DOC_MIME}' or mimeType = '${GOOGLE_SHEET_MIME}' or mimeType = 'text/plain')`
      );
      break;
    case 'JSON':
      qParts.push(`(mimeType = 'application/json' or name contains '.json')`);
      break;
    case 'IMAGES':
      qParts.push(`mimeType contains 'image/'`);
      break;
    case 'PDF':
      qParts.push(`mimeType = 'application/pdf'`);
      break;
    default:
      break;
  }

  const params = new URLSearchParams({
    q: qParts.join(' and '),
    orderBy: 'folder,modifiedTime desc',
    pageSize: String(options.pageSize ?? 30),
    fields: `nextPageToken,files(${FILE_FIELDS})`,
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });

  if (options.pageToken) {
    params.set('pageToken', options.pageToken);
  }

  const data = await driveFetch<{ files?: DriveFileItem[]; nextPageToken?: string }>(
    `${DRIVE_FILES_API}?${params.toString()}`,
    accessToken
  );

  return {
    files: data.files || [],
    nextPageToken: data.nextPageToken,
  };
}

export async function downloadDriveFileText(
  accessToken: string,
  file: Pick<DriveFileItem, 'id' | 'mimeType'>
): Promise<string> {
  let url = `${DRIVE_FILES_API}/${encodeURIComponent(file.id)}?alt=media`;

  if (file.mimeType === GOOGLE_DOC_MIME) {
    url = `${DRIVE_FILES_API}/${encodeURIComponent(file.id)}/export?mimeType=text/plain`;
  } else if (file.mimeType === GOOGLE_SHEET_MIME) {
    url = `${DRIVE_FILES_API}/${encodeURIComponent(file.id)}/export?mimeType=text/csv`;
  } else if (file.mimeType === GOOGLE_SLIDE_MIME) {
    url = `${DRIVE_FILES_API}/${encodeURIComponent(file.id)}/export?mimeType=text/plain`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) {
    throw new GoogleWorkspaceAuthError(
      'Your Google Workspace session expired. Please sign in with Google again.',
      401
    );
  }
  if (res.status === 403) {
    throw new GoogleWorkspaceAuthError(
      'Google Drive download permission missing or denied. Re-authorize with Google.',
      403
    );
  }
  if (!res.ok) {
    throw new Error(`Unable to read Drive file (${res.status})`);
  }

  return res.text();
}

export async function downloadDriveFileBlob(
  accessToken: string,
  fileId: string
): Promise<Blob> {
  const res = await fetch(`${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) {
    throw new GoogleWorkspaceAuthError(
      'Your Google Workspace session expired. Please sign in with Google again.',
      401
    );
  }
  if (res.status === 403) {
    throw new GoogleWorkspaceAuthError(
      'Google Drive download permission missing or denied. Re-authorize with Google.',
      403
    );
  }
  if (!res.ok) {
    throw new Error(`Unable to download Drive file (${res.status})`);
  }

  return res.blob();
}

/**
 * Upload a new file into Google Drive via multipart/related upload (MUST be user-confirmed).
 */
export async function uploadDriveFile(
  accessToken: string,
  input: {
    name: string;
    content: string | Blob;
    mimeType: string;
    parentId?: string;
    description?: string;
  }
): Promise<DriveFileItem> {
  const metadata: Record<string, unknown> = {
    name: input.name.trim() || 'autoelectric-file.txt',
    mimeType: input.mimeType || 'text/plain',
  };
  if (input.parentId && input.parentId !== 'root') {
    metadata.parents = [input.parentId];
  }
  if (input.description) {
    metadata.description = input.description;
  }

  const boundary = `autoelectric_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const metadataPart =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${input.mimeType || 'application/octet-stream'}\r\n\r\n`;

  const closingBoundary = `\r\n--${boundary}--`;

  const bodyBlob =
    typeof input.content === 'string'
      ? new Blob([metadataPart, input.content, closingBoundary])
      : new Blob([metadataPart, input.content, closingBoundary]);

  return driveFetch<DriveFileItem>(
    `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=${encodeURIComponent(FILE_FIELDS)}`,
    accessToken,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: bodyBlob,
    },
    false
  );
}

/**
 * Overwrite an existing Google Drive file's media content (MUST be user-confirmed).
 */
export async function overwriteDriveFileContent(
  accessToken: string,
  fileId: string,
  content: string | Blob,
  mimeType: string
): Promise<DriveFileItem> {
  return driveFetch<DriveFileItem>(
    `${DRIVE_UPLOAD_API}/${encodeURIComponent(fileId)}?uploadType=media&fields=${encodeURIComponent(FILE_FIELDS)}`,
    accessToken,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': mimeType || 'text/plain',
      },
      body: content,
    },
    false
  );
}

/**
 * Create a folder in Google Drive (MUST be user-confirmed).
 */
export async function createDriveFolder(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<DriveFileItem> {
  const metadata: Record<string, unknown> = {
    name: name.trim() || 'AutoElectric Lab Exports',
    mimeType: DRIVE_FOLDER_MIME,
  };
  if (parentId && parentId !== 'root') {
    metadata.parents = [parentId];
  }

  return driveFetch<DriveFileItem>(
    `${DRIVE_FILES_API}?fields=${encodeURIComponent(FILE_FIELDS)}`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(metadata),
    }
  );
}

/**
 * Rename a Google Drive file or folder (MUST be user-confirmed).
 */
export async function renameDriveFile(
  accessToken: string,
  fileId: string,
  newName: string
): Promise<DriveFileItem> {
  return driveFetch<DriveFileItem>(
    `${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(FILE_FIELDS)}`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify({ name: newName.trim() }),
    }
  );
}

/**
 * Move a Google Drive file to Trash (MUST be user-confirmed).
 */
export async function trashDriveFile(accessToken: string, fileId: string): Promise<void> {
  await driveFetch(`${DRIVE_FILES_API}/${encodeURIComponent(fileId)}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify({ trashed: true }),
  });
}

/**
 * Permanently delete a Google Drive file (MUST be user-confirmed).
 */
export async function deleteDriveFilePermanently(
  accessToken: string,
  fileId: string
): Promise<void> {
  await driveFetch(`${DRIVE_FILES_API}/${encodeURIComponent(fileId)}`, accessToken, {
    method: 'DELETE',
  });
}

export function buildDriveBenchSnapshot(input: {
  title: string;
  ecuProfileLabel: string;
  selectedBrandKey?: string;
  selectedModelName?: string;
  selectedEcuProfileId?: string | null;
  powerSupply: PowerSupplyState;
  wires: WireConnection[];
  faults: InjectedFault[];
  components: BenchComponent[];
  rpmEmulator?: RpmEmulatorState;
  gaugeMonitor?: GaugeMonitorState;
  multimeter?: MultimeterState;
  activeDtcs: string[];
  supplyCurrentDrawAmps: number;
  workflowCheckedIds?: string[];
  preBenchGateLocked?: boolean;
  voiceMacros?: VoiceMacro[];
}): DriveBenchSnapshot {
  const componentStates: Record<string, Record<string, number | boolean | string>> = {};
  input.components.forEach((c) => {
    componentStates[c.id] = { ...c.state };
  });

  return {
    schemaVersion: 1,
    app: 'AutoElectric Lab Pro',
    exportedAt: new Date().toISOString(),
    title: input.title.trim() || 'ECU Bench Snapshot',
    ecuProfileLabel: input.ecuProfileLabel,
    selectedBrandKey: input.selectedBrandKey,
    selectedModelName: input.selectedModelName,
    selectedEcuProfileId: input.selectedEcuProfileId,
    powerSupply: input.powerSupply,
    wires: input.wires,
    faults: input.faults,
    componentStates,
    rpmEmulator: input.rpmEmulator,
    ...(input.gaugeMonitor ? { gaugeMonitor: sanitizeGaugeMonitorState(input.gaugeMonitor) } : {}),
    multimeter: input.multimeter,
    activeDtcs: input.activeDtcs,
    supplyCurrentDrawAmps: input.supplyCurrentDrawAmps,
    ...(input.workflowCheckedIds ? { workflowCheckedIds: [...input.workflowCheckedIds] } : {}),
    ...(typeof input.preBenchGateLocked === 'boolean'
      ? { preBenchGateLocked: input.preBenchGateLocked }
      : {}),
    ...(input.voiceMacros ? { voiceMacros: input.voiceMacros.map((m) => ({ ...m, steps: [...m.steps] })) } : {}),
  };
}

export function parseDriveBenchSnapshot(rawText: string): DriveBenchSnapshot | null {
  try {
    const parsed = JSON.parse(rawText) as Partial<DriveBenchSnapshot>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.powerSupply ||
      !Array.isArray(parsed.wires) ||
      !Array.isArray(parsed.faults)
    ) {
      return null;
    }
    return parsed as DriveBenchSnapshot;
  } catch {
    return null;
  }
}

export function formatDriveFileSize(sizeStr?: string): string {
  if (!sizeStr) return '—';
  const bytes = Number(sizeStr);
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
