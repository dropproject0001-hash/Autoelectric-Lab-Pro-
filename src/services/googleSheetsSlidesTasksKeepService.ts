import {
  DiagnosticTroubleCode,
  EcuPin,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import { CircuitSolution } from '../utils/circuitSolver';
import { GoogleWorkspaceAuthError, parseGoogleWorkspaceHttpError } from './googleDocsService';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4';
const SLIDES_API_BASE = 'https://slides.googleapis.com/v1';
const TASKS_API_BASE = 'https://tasks.googleapis.com/tasks/v1';
const KEEP_API_BASE = 'https://keep.googleapis.com/v1';

export interface WorkspaceBenchTelemetryInput {
  ecuProfileLabel: string;
  powerSupply: PowerSupplyState;
  pins: EcuPin[];
  wires: WireConnection[];
  faults: InjectedFault[];
  multimeter: MultimeterState;
  circuitSolution: CircuitSolution;
}

async function workspaceApiFetch<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {},
  serviceName = 'Google Workspace'
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });

  if (res.status === 401) {
    throw new GoogleWorkspaceAuthError(
      'Your Google Workspace session expired. Please sign in with Google again.',
      401
    );
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
      serviceName,
      `${serviceName} permission missing or denied. Re-authorize with Google.`
    );
  }

  return json as T;
}

// ============================================================================
// 1. GOOGLE SHEETS API (sheets.googleapis.com/v4/spreadsheets)
// ============================================================================

export interface GoogleSheetDriveItem {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface SheetTabMetadata {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  tabs: SheetTabMetadata[];
}

export async function listGoogleSpreadsheets(
  accessToken: string,
  searchQuery = ''
): Promise<GoogleSheetDriveItem[]> {
  const escaped = searchQuery.trim().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const qParts = [
    "mimeType='application/vnd.google-apps.spreadsheet'",
    'trashed=false',
  ];
  if (escaped) {
    qParts.push(`name contains '${escaped}'`);
  }

  const params = new URLSearchParams({
    q: qParts.join(' and '),
    orderBy: 'modifiedTime desc',
    pageSize: '25',
    fields: 'files(id,name,modifiedTime,webViewLink)',
  });

  const data = await workspaceApiFetch<{ files?: GoogleSheetDriveItem[] }>(
    `${DRIVE_API_BASE}/files?${params.toString()}`,
    accessToken,
    {},
    'Google Sheets'
  );
  return data.files || [];
}

/**
 * Fetch spreadsheet metadata first to identify actual tab names (never hardcode "Sheet1").
 */
export async function getSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string
): Promise<SpreadsheetMetadata> {
  interface RawSpreadsheet {
    spreadsheetId: string;
    spreadsheetUrl?: string;
    properties?: { title?: string };
    sheets?: {
      properties?: {
        sheetId?: number;
        title?: string;
        gridProperties?: { rowCount?: number; columnCount?: number };
      };
    }[];
  }

  const raw = await workspaceApiFetch<RawSpreadsheet>(
    `${SHEETS_API_BASE}/spreadsheets/${encodeURIComponent(spreadsheetId)}?includeGridData=false`,
    accessToken,
    {},
    'Google Sheets'
  );

  const tabs: SheetTabMetadata[] = (raw.sheets || []).map((s, idx) => ({
    sheetId: typeof s.properties?.sheetId === 'number' ? s.properties.sheetId : idx,
    title: s.properties?.title || `Tab_${idx + 1}`,
    rowCount: s.properties?.gridProperties?.rowCount ?? 100,
    columnCount: s.properties?.gridProperties?.columnCount ?? 26,
  }));

  return {
    spreadsheetId: raw.spreadsheetId,
    title: raw.properties?.title || 'Untitled Spreadsheet',
    spreadsheetUrl:
      raw.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${raw.spreadsheetId}/edit`,
    tabs,
  };
}

function escapeSheetTitleForA1(sheetTitle: string): string {
  if (/^[A-Za-z0-9_]+$/.test(sheetTitle)) {
    return sheetTitle;
  }
  return `'${sheetTitle.replace(/'/g, "''")}'`;
}

export async function readSheetRange(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  cellRange = 'A1:H40'
): Promise<string[][]> {
  const cleanRange = cellRange.trim() || 'A1:H40';
  const a1Notation = `${escapeSheetTitleForA1(sheetTitle)}!${cleanRange}`;

  const data = await workspaceApiFetch<{ values?: string[][] }>(
    `${SHEETS_API_BASE}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(a1Notation)}`,
    accessToken,
    {},
    'Google Sheets'
  );

  return data.values || [];
}

export function buildBenchTelemetryRows(input: WorkspaceBenchTelemetryInput): {
  pinoutRows: string[][];
  summaryRows: string[][];
} {
  const timestamp = new Date().toISOString();
  const pinoutRows: string[][] = [
    [
      'Pin #',
      'Pin ID',
      'Pin Label',
      'Signal Name',
      'Nominal Voltage (V)',
      'Measured MNA Voltage (V)',
      'Delta (V)',
      'Injected Fault / Status',
    ],
    ...input.pins.map((pin) => {
      const measured = input.circuitSolution.nodeVoltages[pin.id];
      const measuredNum =
        typeof measured === 'number' && Number.isFinite(measured) ? measured : 0;
      const delta = measuredNum - pin.nominalVoltage;
      const fault = input.faults.find((f) => f.pinId === pin.id);
      return [
        String(pin.pinNumber),
        pin.id,
        pin.label,
        pin.name,
        pin.nominalVoltage.toFixed(2),
        typeof measured === 'number' && Number.isFinite(measured)
          ? measured.toFixed(3)
          : 'N/A',
        typeof measured === 'number' && Number.isFinite(measured)
          ? `${delta >= 0 ? '+' : ''}${delta.toFixed(3)}`
          : 'N/A',
        fault ? `${fault.faultType}: ${fault.description}` : 'OK',
      ];
    }),
  ];

  const dtcRows: string[][] =
    input.circuitSolution.activeDTCs.length > 0
      ? input.circuitSolution.activeDTCs.map((dtc: DiagnosticTroubleCode) => [
          'ACTIVE DTC',
          dtc.code,
          `${dtc.severity} (${dtc.system})`,
          dtc.description,
        ])
      : [['ACTIVE DTC', 'NONE', 'OK', '0 Active Diagnostic Trouble Codes']];

  const summaryRows: string[][] = [
    ['ECU Profile', input.ecuProfileLabel, 'Timestamp', timestamp],
    [
      'Power Supply State',
      input.powerSupply.isOutputEnabled ? 'ENABLED' : 'DISABLED',
      'Preset / Voltage',
      `${input.powerSupply.preset} (${input.powerSupply.voltageSetting.toFixed(2)}V @ ${input.powerSupply.currentLimit.toFixed(2)}A limit)`,
    ],
    [
      'MNA Bus Current Draw',
      `${input.circuitSolution.supplyCurrentDrawAmps.toFixed(3)} A`,
      'Over-Current Protection',
      input.circuitSolution.isSupplyCurrentTripped ? 'TRIPPED' : 'NORMAL',
    ],
    [
      'DMM Mode & Probes',
      input.multimeter.isPowered ? input.multimeter.mode : 'OFF',
      `${input.multimeter.redProbe.attachedLabel} -> ${input.multimeter.blackProbe.attachedLabel}`,
      `${input.circuitSolution.multimeterReading.display} ${input.circuitSolution.multimeterReading.unit}`,
    ],
    ['', '', '', ''],
    ['Category', 'Code / Pin', 'Severity / Type', 'Diagnostic Detail'],
    ...dtcRows,
    ...input.faults.map((f) => [
      'INJECTED FAULT',
      f.pinId,
      f.faultType,
      f.description,
    ]),
  ];

  return { pinoutRows, summaryRows };
}

export async function createBenchTelemetrySpreadsheet(
  accessToken: string,
  title: string,
  input: WorkspaceBenchTelemetryInput
): Promise<SpreadsheetMetadata> {
  const cleanTitle =
    title.trim() ||
    `ECU Bench Telemetry — ${input.ecuProfileLabel} (${new Date().toLocaleDateString()})`;

  const created = await workspaceApiFetch<{
    spreadsheetId: string;
    spreadsheetUrl?: string;
  }>(
    `${SHEETS_API_BASE}/spreadsheets`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        properties: { title: cleanTitle },
        sheets: [
          { properties: { title: 'Pinout & Node Voltages' } },
          { properties: { title: 'DTCs & Bench Summary' } },
        ],
      }),
    },
    'Google Sheets'
  );

  const { pinoutRows, summaryRows } = buildBenchTelemetryRows(input);

  await workspaceApiFetch(
    `${SHEETS_API_BASE}/spreadsheets/${encodeURIComponent(created.spreadsheetId)}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: `'Pinout & Node Voltages'!A1`,
            values: pinoutRows,
          },
          {
            range: `'DTCs & Bench Summary'!A1`,
            values: summaryRows,
          },
        ],
      }),
    },
    'Google Sheets'
  );

  return getSpreadsheetMetadata(accessToken, created.spreadsheetId);
}

/**
 * Append live MNA bench telemetry rows to an existing sheet tab (MUST be user-confirmed before calling).
 */
export async function appendBenchTelemetryToSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  input: WorkspaceBenchTelemetryInput
): Promise<void> {
  const { pinoutRows } = buildBenchTelemetryRows(input);
  const stampRow = [
    `--- BENCH SNAPSHOT (${new Date().toISOString()}) — ${input.ecuProfileLabel} ---`,
    `Supply: ${input.powerSupply.voltageSetting.toFixed(2)}V (${input.circuitSolution.supplyCurrentDrawAmps.toFixed(3)}A)`,
    `DMM: ${input.circuitSolution.multimeterReading.display} ${input.circuitSolution.multimeterReading.unit}`,
    `Active DTCs: ${input.circuitSolution.activeDTCs.length}`,
  ];

  const a1Range = `${escapeSheetTitleForA1(sheetTitle)}!A1`;
  await workspaceApiFetch(
    `${SHEETS_API_BASE}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(a1Range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        values: [[], stampRow, ...pinoutRows],
      }),
    },
    'Google Sheets'
  );
}

export async function trashSpreadsheet(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  await workspaceApiFetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(spreadsheetId)}`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify({ trashed: true }),
    },
    'Google Sheets'
  );
}

// ============================================================================
// 2. GOOGLE SLIDES API (slides.googleapis.com/v1/presentations)
// ============================================================================

export interface GoogleSlideDriveItem {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface ParsedSlidePage {
  objectId: string;
  index: number;
  texts: string[];
}

export interface ParsedPresentation {
  presentationId: string;
  title: string;
  webViewLink: string;
  slides: ParsedSlidePage[];
}

export async function listGooglePresentations(
  accessToken: string,
  searchQuery = ''
): Promise<GoogleSlideDriveItem[]> {
  const escaped = searchQuery.trim().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const qParts = [
    "mimeType='application/vnd.google-apps.presentation'",
    'trashed=false',
  ];
  if (escaped) {
    qParts.push(`name contains '${escaped}'`);
  }

  const params = new URLSearchParams({
    q: qParts.join(' and '),
    orderBy: 'modifiedTime desc',
    pageSize: '25',
    fields: 'files(id,name,modifiedTime,webViewLink)',
  });

  const data = await workspaceApiFetch<{ files?: GoogleSlideDriveItem[] }>(
    `${DRIVE_API_BASE}/files?${params.toString()}`,
    accessToken,
    {},
    'Google Slides'
  );
  return data.files || [];
}

export async function getPresentationDetail(
  accessToken: string,
  presentationId: string
): Promise<ParsedPresentation> {
  interface RawSlideElement {
    shape?: {
      text?: {
        textElements?: {
          textRun?: { content?: string };
        }[];
      };
    };
  }
  interface RawPresentation {
    presentationId: string;
    title?: string;
    slides?: {
      objectId: string;
      pageElements?: RawSlideElement[];
    }[];
  }

  const raw = await workspaceApiFetch<RawPresentation>(
    `${SLIDES_API_BASE}/presentations/${encodeURIComponent(presentationId)}`,
    accessToken,
    {},
    'Google Slides'
  );

  const slides: ParsedSlidePage[] = (raw.slides || []).map((slide, idx) => {
    const texts: string[] = [];
    for (const el of slide.pageElements || []) {
      const content = (el.shape?.text?.textElements || [])
        .map((te) => te.textRun?.content || '')
        .join('')
        .trim();
      if (content) {
        texts.push(content);
      }
    }
    return {
      objectId: slide.objectId,
      index: idx + 1,
      texts,
    };
  });

  return {
    presentationId: raw.presentationId,
    title: raw.title || 'Untitled Presentation',
    webViewLink: `https://docs.google.com/presentation/d/${raw.presentationId}/edit`,
    slides,
  };
}

function buildSlideSummaryBody(input: WorkspaceBenchTelemetryInput): {
  titleText: string;
  bodyText: string;
} {
  const dtcSummary =
    input.circuitSolution.activeDTCs.length > 0
      ? input.circuitSolution.activeDTCs
          .map((d) => `• ${d.code} (${d.severity}): ${d.description}`)
          .join('\n')
      : '• No active OBD-II Diagnostic Trouble Codes';

  const pinHighlights = input.pins
    .slice(0, 8)
    .map((pin) => {
      const v = input.circuitSolution.nodeVoltages[pin.id];
      const vStr = typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(2)}V` : 'N/A';
      return `• Pin ${pin.pinNumber} (${pin.label}): ${vStr} [Nom ${pin.nominalVoltage.toFixed(2)}V]`;
    })
    .join('\n');

  return {
    titleText: `ECU Bench Diagnostic Snapshot — ${input.ecuProfileLabel}`,
    bodyText: [
      `Captured: ${new Date().toLocaleString()}`,
      `Power Bus: ${input.powerSupply.isOutputEnabled ? 'ON' : 'OFF'} | ${input.powerSupply.voltageSetting.toFixed(2)}V | Draw: ${input.circuitSolution.supplyCurrentDrawAmps.toFixed(3)}A`,
      `DMM (${input.multimeter.mode}): ${input.circuitSolution.multimeterReading.display} ${input.circuitSolution.multimeterReading.unit} (${input.multimeter.redProbe.attachedLabel} -> ${input.multimeter.blackProbe.attachedLabel})`,
      '',
      'Active DTCs:',
      dtcSummary,
      '',
      'Key MNA Pin Voltages:',
      pinHighlights,
    ].join('\n'),
  };
}

export async function createBenchPresentation(
  accessToken: string,
  title: string,
  input: WorkspaceBenchTelemetryInput
): Promise<ParsedPresentation> {
  const cleanTitle =
    title.trim() ||
    `ECU Diagnostic Case Study — ${input.ecuProfileLabel} (${new Date().toLocaleDateString()})`;

  const created = await workspaceApiFetch<{ presentationId: string }>(
    `${SLIDES_API_BASE}/presentations`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ title: cleanTitle }),
    },
    'Google Slides'
  );

  await appendDiagnosticSlideToDeck(accessToken, created.presentationId, input);
  return getPresentationDetail(accessToken, created.presentationId);
}

/**
 * Append a new diagnostic slide to an existing Google Slides presentation (MUST be user-confirmed when mutating existing deck).
 */
export async function appendDiagnosticSlideToDeck(
  accessToken: string,
  presentationId: string,
  input: WorkspaceBenchTelemetryInput
): Promise<ParsedPresentation> {
  const suffix = Math.random().toString(36).slice(2, 9);
  const slideId = `vecl_slide_${suffix}`;
  const titleId = `vecl_title_${suffix}`;
  const bodyId = `vecl_body_${suffix}`;

  const { titleText, bodyText } = buildSlideSummaryBody(input);

  await workspaceApiFetch(
    `${SLIDES_API_BASE}/presentations/${encodeURIComponent(presentationId)}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            createSlide: {
              objectId: slideId,
              slideLayoutReference: {
                predefinedLayout: 'TITLE_AND_BODY',
              },
              placeholderIdMappings: [
                {
                  layoutPlaceholder: { type: 'TITLE', index: 0 },
                  objectId: titleId,
                },
                {
                  layoutPlaceholder: { type: 'BODY', index: 0 },
                  objectId: bodyId,
                },
              ],
            },
          },
          {
            insertText: {
              objectId: titleId,
              text: titleText,
            },
          },
          {
            insertText: {
              objectId: bodyId,
              text: bodyText,
            },
          },
        ],
      }),
    },
    'Google Slides'
  );

  return getPresentationDetail(accessToken, presentationId);
}

export async function trashPresentation(
  accessToken: string,
  presentationId: string
): Promise<void> {
  await workspaceApiFetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(presentationId)}`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify({ trashed: true }),
    },
    'Google Slides'
  );
}

// ============================================================================
// 3. GOOGLE TASKS API (tasks.googleapis.com/tasks/v1)
// ============================================================================

export interface GoogleTaskList {
  id: string;
  title: string;
  updated?: string;
}

export interface GoogleTaskItem {
  id: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string;
  updated?: string;
}

export async function listTaskLists(accessToken: string): Promise<GoogleTaskList[]> {
  const data = await workspaceApiFetch<{ items?: GoogleTaskList[] }>(
    `${TASKS_API_BASE}/users/@me/lists?maxResults=25`,
    accessToken,
    {},
    'Google Tasks'
  );
  return data.items || [];
}

export async function listTasksInList(
  accessToken: string,
  taskListId: string
): Promise<GoogleTaskItem[]> {
  const data = await workspaceApiFetch<{ items?: GoogleTaskItem[] }>(
    `${TASKS_API_BASE}/lists/${encodeURIComponent(taskListId)}/tasks?showCompleted=true&showHidden=true&maxResults=50`,
    accessToken,
    {},
    'Google Tasks'
  );
  return (data.items || []).filter((item) => Boolean(item.title && item.title.trim()));
}

export async function createTaskItem(
  accessToken: string,
  taskListId: string,
  params: { title: string; notes?: string; dueIsoDate?: string }
): Promise<GoogleTaskItem> {
  const payload: Record<string, unknown> = {
    title: params.title.trim(),
    status: 'needsAction',
  };
  if (params.notes?.trim()) {
    payload.notes = params.notes.trim();
  }
  if (params.dueIsoDate?.trim()) {
    const d = new Date(params.dueIsoDate);
    if (!Number.isNaN(d.getTime())) {
      payload.due = d.toISOString();
    }
  }

  return workspaceApiFetch<GoogleTaskItem>(
    `${TASKS_API_BASE}/lists/${encodeURIComponent(taskListId)}/tasks`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    'Google Tasks'
  );
}

export async function updateTaskCompletion(
  accessToken: string,
  taskListId: string,
  taskId: string,
  completed: boolean
): Promise<GoogleTaskItem> {
  return workspaceApiFetch<GoogleTaskItem>(
    `${TASKS_API_BASE}/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status: completed ? 'completed' : 'needsAction',
        completed: completed ? new Date().toISOString() : null,
      }),
    },
    'Google Tasks'
  );
}

export async function deleteTaskItem(
  accessToken: string,
  taskListId: string,
  taskId: string
): Promise<void> {
  await workspaceApiFetch(
    `${TASKS_API_BASE}/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
    accessToken,
    {
      method: 'DELETE',
    },
    'Google Tasks'
  );
}

export function buildBenchVerificationTasks(
  input: WorkspaceBenchTelemetryInput
): { title: string; notes: string }[] {
  const tasks: { title: string; notes: string }[] = [];

  for (const dtc of input.circuitSolution.activeDTCs) {
    tasks.push({
      title: `[${input.ecuProfileLabel}] Diagnose DTC ${dtc.code} (${dtc.system})`,
      notes: `${dtc.description} | Severity: ${dtc.severity} | Supply: ${input.powerSupply.voltageSetting.toFixed(2)}V`,
    });
  }

  for (const fault of input.faults) {
    tasks.push({
      title: `[${input.ecuProfileLabel}] Isolate pin fault on ${fault.pinId} (${fault.faultType})`,
      notes: `${fault.description} | Verify continuity and terminal tension under load.`,
    });
  }

  const cutWires = input.wires.filter((w) => w.isCut);
  for (const wire of cutWires) {
    tasks.push({
      title: `[${input.ecuProfileLabel}] Repair open harness lead ${wire.label}`,
      notes: `Open circuit between ${wire.sourcePinId} and ${wire.targetPinId}. Perform voltage-drop test after splice repair.`,
    });
  }

  if (tasks.length === 0) {
    tasks.push({
      title: `[${input.ecuProfileLabel}] Complete final QC bench verification (${input.powerSupply.voltageSetting.toFixed(2)}V)`,
      notes: `DMM Reading: ${input.circuitSolution.multimeterReading.display} ${input.circuitSolution.multimeterReading.unit}. 0 active DTCs recorded.`,
    });
  }

  return tasks;
}

// ============================================================================
// 4. GOOGLE KEEP API (keep.googleapis.com/v1/notes)
// ============================================================================

export interface GoogleKeepNoteItem {
  name: string;
  title?: string;
  createTime?: string;
  updateTime?: string;
  trashed?: boolean;
  bodyText: string;
}

export async function listKeepNotes(accessToken: string): Promise<{
  notes: GoogleKeepNoteItem[];
  enterpriseRestrictionMessage?: string;
}> {
  interface RawKeepNote {
    name: string;
    title?: string;
    createTime?: string;
    updateTime?: string;
    trashed?: boolean;
    body?: {
      text?: { text?: string };
      list?: { listItems?: { text?: { text?: string }; checked?: boolean }[] };
    };
  }

  try {
    const data = await workspaceApiFetch<{ notes?: RawKeepNote[] }>(
      `${KEEP_API_BASE}/notes?pageSize=25`,
      accessToken,
      {},
      'Google Keep'
    );

    const notes: GoogleKeepNoteItem[] = (data.notes || []).map((n) => {
      const textBody = n.body?.text?.text || '';
      const listBody = (n.body?.list?.listItems || [])
        .map((li) => `${li.checked ? '[x]' : '[ ]'} ${li.text?.text || ''}`)
        .join('\n');
      return {
        name: n.name,
        title: n.title || 'Untitled Keep Note',
        createTime: n.createTime,
        updateTime: n.updateTime,
        trashed: n.trashed,
        bodyText: textBody || listBody,
      };
    });

    return { notes };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      notes: [],
      enterpriseRestrictionMessage:
        msg.includes('403') || msg.includes('401') || msg.toLowerCase().includes('scope')
          ? 'Google Keep REST API (keep.googleapis.com) is restricted by Google to Google Workspace Enterprise accounts with Admin domain-wide delegation. Consumer @gmail.com accounts can save bench notes directly to Google Drive or Google Tasks below.'
          : msg,
    };
  }
}

export async function createKeepNote(
  accessToken: string,
  title: string,
  bodyText: string
): Promise<GoogleKeepNoteItem> {
  interface RawCreatedKeepNote {
    name: string;
    title?: string;
    createTime?: string;
    updateTime?: string;
    body?: { text?: { text?: string } };
  }

  const created = await workspaceApiFetch<RawCreatedKeepNote>(
    `${KEEP_API_BASE}/notes`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        title: title.trim() || 'ECU Bench Note',
        body: {
          text: {
            text: bodyText.trim(),
          },
        },
      }),
    },
    'Google Keep'
  );

  return {
    name: created.name,
    title: created.title || title,
    createTime: created.createTime,
    updateTime: created.updateTime,
    bodyText: created.body?.text?.text || bodyText,
  };
}

export async function deleteKeepNote(
  accessToken: string,
  noteName: string
): Promise<void> {
  const cleanName = noteName.startsWith('notes/') ? noteName : `notes/${noteName}`;
  await workspaceApiFetch(
    `${KEEP_API_BASE}/${cleanName}`,
    accessToken,
    {
      method: 'DELETE',
    },
    'Google Keep'
  );
}
