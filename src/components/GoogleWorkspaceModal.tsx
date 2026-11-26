/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  FileSpreadsheet,
  FileText,
  FolderDown,
  GraduationCap,
  HardDrive,
  Lock,
  Mail,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTrialAccess } from '../context/TrialAccessContext';
import {
  appendToGoogleDoc,
  buildBenchReportText,
  createBenchReportDoc,
  extractGoogleConsoleUrl,
  formatWorkspaceBannerText,
  getGoogleDoc,
  GoogleDriveDocItem,
  GoogleWorkspaceAuthError,
  listGoogleDocs,
  ParsedGoogleDoc,
  replaceGoogleDocBody,
  trashGoogleDoc,
} from '../services/googleDocsService';
import {
  buildDriveBenchSnapshot,
  createDriveFolder,
  deleteDriveFilePermanently,
  downloadDriveFileBlob,
  downloadDriveFileText,
  DRIVE_FOLDER_MIME,
  DriveBenchSnapshot,
  DriveFileItem,
  DriveMimeFilter,
  listDriveFiles,
  overwriteDriveFileContent,
  parseDriveBenchSnapshot,
  renameDriveFile,
  trashDriveFile,
  uploadDriveFile,
} from '../services/googleDriveService';
import { openGoogleDrivePicker } from '../services/googlePickerService';
import {
  buildDiagnosticEmailTemplate,
  createGmailDraft,
  getGmailMessage,
  GmailMessageDetail,
  GmailMessageSummary,
  listGmailMessages,
  markGmailMessageRead,
  sendGmailMessage,
  trashGmailMessage,
} from '../services/gmailService';
import {
  createTaskItem,
  deleteTaskItem,
  GoogleTaskItem,
  GoogleTaskList,
  listTaskLists,
  listTasksInList,
  updateTaskCompletion,
  WorkspaceBenchTelemetryInput,
} from '../services/googleSheetsSlidesTasksKeepService';
import {
  buildClassroomLabSummary,
  ClassroomAnnouncement,
  ClassroomCourse,
  ClassroomCourseWork,
  ClassroomMaterial,
  createClassroomAnnouncement,
  createClassroomAssignment,
  listClassroomAnnouncements,
  listClassroomCourses,
  listClassroomCourseWork,
  listClassroomMaterials,
} from '../services/googleClassroomService';
import type { VoiceMacro } from '../services/voiceMacroService';
import {
  BenchComponent,
  EcuPin,
  InjectedFault,
  MultimeterState,
  PowerSupplyState,
  WireConnection,
} from '../types/ecu';
import { CircuitSolution } from '../utils/circuitSolver';
import type { RpmEmulatorState } from '../utils/vehicleEcuRegistry';
import type { GaugeMonitorState } from '../simulation/telemetry/telemetryTypes';
import { toSafeExternalHttpUrl } from '../utils/safeExternalUrl';
import { GoogleDriveTab } from './workspace/GoogleDriveTab';
import { GmailDispatchTab } from './workspace/GmailDispatchTab';
import { GoogleDocsTab } from './workspace/GoogleDocsTab';
import { GoogleTasksTab } from './workspace/WorkspaceSuiteTabs';
import { GoogleClassroomTab } from './workspace/GoogleClassroomTab';
import {
  GoogleSignInButton,
  WorkspaceActionConfirmDialog,
} from './workspace/WorkspaceAuthBanner';
import type {
  GmailFilterBox,
  PendingWorkspaceAction,
  WorkspaceStatusBanner,
  WorkspaceTab,
} from './workspace/workspaceTypes';

export type { WorkspaceTab } from './workspace/workspaceTypes';

type ActiveHubTab = 'DRIVE' | 'GMAIL' | 'DOCS' | 'TASKS' | 'CLASSROOM' | 'LOCAL';
type LocalExportSubTab = 'SNAPSHOT' | 'PINOUT_CSV' | 'REPORT_TXT' | 'CHECKLIST_MD';

interface GoogleWorkspaceModalProps {
  isOpen: boolean;
  initialTab?: WorkspaceTab;
  onClose: () => void;
  powerSupply: PowerSupplyState;
  pins: EcuPin[];
  components: BenchComponent[];
  wires: WireConnection[];
  faults: InjectedFault[];
  multimeter: MultimeterState;
  circuitSolution: CircuitSolution;
  selectedBrandKey?: string;
  selectedModelName?: string;
  selectedEcuProfileId?: string | null;
  rpmEmulator?: RpmEmulatorState;
  gaugeMonitor?: GaugeMonitorState;
  checkedWorkflowIds?: string[];
  preBenchGateLocked?: boolean;
  voiceMacros?: VoiceMacro[];
  onLoadBenchSnapshot?: (snapshot: DriveBenchSnapshot) => void;
}

function normalizeInitialTab(tab?: WorkspaceTab): {
  hubTab: ActiveHubTab;
  localSubTab: LocalExportSubTab;
} {
  switch (tab) {
    case 'GMAIL':
      return { hubTab: 'GMAIL', localSubTab: 'REPORT_TXT' };
    case 'DOCS':
      return { hubTab: 'DOCS', localSubTab: 'REPORT_TXT' };
    case 'TASKS':
      return { hubTab: 'TASKS', localSubTab: 'CHECKLIST_MD' };
    case 'CLASSROOM':
      return { hubTab: 'CLASSROOM', localSubTab: 'REPORT_TXT' };
    case 'SHEETS':
      return { hubTab: 'LOCAL', localSubTab: 'PINOUT_CSV' };
    case 'LOCAL':
    case 'SLIDES':
    case 'KEEP':
      return { hubTab: 'LOCAL', localSubTab: 'SNAPSHOT' };
    case 'DRIVE':
    default:
      return { hubTab: 'DRIVE', localSubTab: 'SNAPSHOT' };
  }
}

function sanitizeFileSlug(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'ecu-bench-export'
  );
}

function escapeCsvCell(value: unknown): string {
  const raw = String(value ?? '');
  const formulaSafe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(formulaSafe)) {
    return `"${formulaSafe.replace(/"/g, '""')}"`;
  }
  return formulaSafe;
}

function triggerLocalDownload(filename: string, content: string | Blob, mimeType: string): void {
  const blob =
    content instanceof Blob
      ? content
      : new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isEditableDriveMime(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/javascript'
  );
}

export const GoogleWorkspaceModal: React.FC<GoogleWorkspaceModalProps> = ({
  isOpen,
  initialTab = 'DRIVE',
  onClose,
  powerSupply,
  pins,
  components,
  wires,
  faults,
  multimeter,
  circuitSolution,
  selectedBrandKey,
  selectedModelName,
  selectedEcuProfileId,
  rpmEmulator,
  gaugeMonitor,
  checkedWorkflowIds = [],
  preBenchGateLocked,
  voiceMacros = [],
  onLoadBenchSnapshot,
}) => {
  const { canUseExports, openAccessModal } = useTrialAccess();
  const {
    user,
    workspaceToken,
    needsWorkspaceAuth,
    isSigningIn,
    authError,
    connectGoogleWorkspace,
    invalidateWorkspaceToken,
  } = useAuth();

  const initialState = normalizeInitialTab(initialTab);
  const [activeTab, setActiveTab] = useState<ActiveHubTab>(initialState.hubTab);
  const [localSubTab, setLocalSubTab] = useState<LocalExportSubTab>(initialState.localSubTab);
  const [statusBanner, setStatusBanner] = useState<WorkspaceStatusBanner | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingWorkspaceAction | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Local Export state
  const [exportTitle, setExportTitle] = useState(
    () => `ECU Bench Export - ${new Date().toISOString().slice(0, 10)}`
  );
  const [techNotes, setTechNotes] = useState('');
  const [importedSnapshot, setImportedSnapshot] = useState<DriveBenchSnapshot | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Google Drive + Picker state
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [driveNextPageToken, setDriveNextPageToken] = useState<string | undefined>();
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveSearch, setDriveSearch] = useState('');
  const [driveFilter, setDriveFilter] = useState<DriveMimeFilter>('ALL');
  const [folderTrail, setFolderTrail] = useState<{ id: string; name: string }[]>([
    { id: 'root', name: 'My Drive' },
  ]);
  const [selectedDriveFile, setSelectedDriveFile] = useState<DriveFileItem | null>(null);
  const [drivePreviewText, setDrivePreviewText] = useState('');
  const [drivePreviewImageUrl, setDrivePreviewImageUrl] = useState<string | null>(null);
  const [driveEditableText, setDriveEditableText] = useState('');
  const [driveFileLoading, setDriveFileLoading] = useState(false);
  const [driveParsedSnapshot, setDriveParsedSnapshot] = useState<DriveBenchSnapshot | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [isPickerOpening, setIsPickerOpening] = useState(false);

  // Gmail state
  const [gmailBox, setGmailBox] = useState<GmailFilterBox>('INBOX');
  const [gmailSearch, setGmailSearch] = useState('');
  const [gmailMessages, setGmailMessages] = useState<GmailMessageSummary[]>([]);
  const [gmailNextPageToken, setGmailNextPageToken] = useState<string | undefined>();
  const [gmailLoading, setGmailLoading] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<GmailMessageDetail | null>(null);
  const [gmailDetailLoading, setGmailDetailLoading] = useState(false);
  const [gmailRightMode, setGmailRightMode] = useState<'READER' | 'COMPOSE'>('READER');
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');

  // Google Docs state
  const [docsList, setDocsList] = useState<GoogleDriveDocItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docSearch, setDocSearch] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<ParsedGoogleDoc | null>(null);
  const [docDetailLoading, setDocDetailLoading] = useState(false);
  const [docEditableBody, setDocEditableBody] = useState('');

  // Google Tasks state
  const [taskLists, setTaskLists] = useState<GoogleTaskList[]>([]);
  const [selectedTaskListId, setSelectedTaskListId] = useState('');
  const [tasks, setTasks] = useState<GoogleTaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  // Google Classroom state
  const [courses, setCourses] = useState<ClassroomCourse[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<ClassroomCourse | null>(null);
  const [announcements, setAnnouncements] = useState<ClassroomAnnouncement[]>([]);
  const [courseWork, setCourseWork] = useState<ClassroomCourseWork[]>([]);
  const [materials, setMaterials] = useState<ClassroomMaterial[]>([]);
  const [classroomDetailsLoading, setClassroomDetailsLoading] = useState(false);

  const currentFolderId = folderTrail[folderTrail.length - 1]?.id || 'root';

  useEffect(() => {
    if (isOpen) {
      const mapped = normalizeInitialTab(initialTab);
      setActiveTab(mapped.hubTab);
      setLocalSubTab(mapped.localSubTab);
      setStatusBanner(null);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    return () => {
      if (drivePreviewImageUrl) {
        URL.revokeObjectURL(drivePreviewImageUrl);
      }
    };
  }, [drivePreviewImageUrl]);

  const ecuProfileLabel = useMemo(() => {
    const parts = [selectedBrandKey, selectedModelName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Universal ECU Bench';
  }, [selectedBrandKey, selectedModelName]);

  const benchTelemetryInput = useMemo<WorkspaceBenchTelemetryInput>(
    () => ({
      ecuProfileLabel,
      powerSupply,
      pins,
      wires,
      faults,
      multimeter,
      circuitSolution,
    }),
    [ecuProfileLabel, powerSupply, pins, wires, faults, multimeter, circuitSolution]
  );

  const liveSnapshot = useMemo(
    () =>
      buildDriveBenchSnapshot({
        title: exportTitle,
        ecuProfileLabel,
        selectedBrandKey,
        selectedModelName,
        selectedEcuProfileId,
        powerSupply,
        wires,
        faults,
        components,
        rpmEmulator,
        gaugeMonitor,
        multimeter,
        activeDtcs: circuitSolution.activeDTCs.map((d) => d.code),
        supplyCurrentDrawAmps: circuitSolution.supplyCurrentDrawAmps,
        workflowCheckedIds: checkedWorkflowIds,
        preBenchGateLocked,
        voiceMacros,
      }),
    [
      exportTitle,
      ecuProfileLabel,
      selectedBrandKey,
      selectedModelName,
      selectedEcuProfileId,
      powerSupply,
      wires,
      faults,
      components,
      rpmEmulator,
      gaugeMonitor,
      multimeter,
      circuitSolution,
      checkedWorkflowIds,
      preBenchGateLocked,
      voiceMacros,
    ]
  );

  const snapshotJson = useMemo(() => JSON.stringify(liveSnapshot, null, 2), [liveSnapshot]);

  const diagnosticReportTxt = useMemo(
    () =>
      buildBenchReportText({
        ecuProfileLabel,
        powerSupply,
        pins,
        wires,
        faults,
        multimeter,
        circuitSolution,
        technicianNotes: techNotes,
      }),
    [ecuProfileLabel, powerSupply, pins, wires, faults, multimeter, circuitSolution, techNotes]
  );

  const classroomLabSummary = useMemo(
    () =>
      buildClassroomLabSummary({
        ecuProfileLabel,
        powerSupply,
        pins,
        wires,
        faults,
        multimeter,
        circuitSolution,
        technicianNotes: techNotes,
      }),
    [ecuProfileLabel, powerSupply, pins, wires, faults, multimeter, circuitSolution, techNotes]
  );

  const pinoutMatrixCsv = useMemo(() => {
    const activeFaults = faults.filter((f) => f.faultType !== 'NONE');
    const header = [
      'Pin Number',
      'Pin ID',
      'Label',
      'Signal Name',
      'Category',
      'Measured Voltage (V)',
      'Nominal Voltage (V)',
      'Status',
      'PSU State',
      'PSU Voltage Setting (V)',
      'Total Bench Draw (A)',
    ];
    const rows = pins.map((pin) => {
      const v = circuitSolution.nodeVoltages[pin.id];
      const pinFault = activeFaults.find((f) => f.pinId === pin.id);
      const status = pinFault
        ? pinFault.faultType
        : powerSupply.isOutputEnabled
          ? 'NOMINAL'
          : 'STANDBY';
      return [
        pin.pinNumber,
        pin.id,
        pin.label,
        pin.name,
        pin.category,
        Number.isFinite(v) ? v.toFixed(3) : '0.000',
        pin.nominalVoltage.toFixed(2),
        status,
        powerSupply.isOutputEnabled ? 'ON' : 'OFF',
        powerSupply.voltageSetting.toFixed(2),
        circuitSolution.supplyCurrentDrawAmps.toFixed(3),
      ];
    });
    return [header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  }, [pins, faults, circuitSolution, powerSupply]);

  const repairChecklistMd = useMemo(() => {
    const activeFaults = faults.filter((f) => f.faultType !== 'NONE');
    const lines = [
      `# ECU Repair & Verification Checklist — ${exportTitle.trim() || ecuProfileLabel}`,
      '',
      `- **Generated At:** ${new Date().toISOString()}`,
      `- **Vehicle / ECU Profile:** ${ecuProfileLabel}`,
      `- **Simulated Bench PSU:** ${powerSupply.isOutputEnabled ? 'ENABLED' : 'STANDBY'} (${powerSupply.voltageSetting.toFixed(2)}V / ${circuitSolution.supplyCurrentDrawAmps.toFixed(3)}A)`,
      '',
      '## Active Diagnostic Trouble Codes (DTCs)',
      ...(circuitSolution.activeDTCs.length > 0
        ? circuitSolution.activeDTCs.map(
            (dtc) => `- [ ] **${dtc.code}** (${dtc.severity}) — ${dtc.description}`
          )
        : ['- [x] No active simulated DTCs detected on current bench configuration.']),
      '',
      '## Active Injected Bench Faults',
      ...(activeFaults.length > 0
        ? activeFaults.map(
            (fault) => `- [ ] **${fault.pinId}** (${fault.faultType}) — ${fault.description}`
          )
        : ['- [x] No active faults injected.']),
    ];
    return lines.join('\n');
  }, [exportTitle, ecuProfileLabel, powerSupply, circuitSolution, faults]);

  const reportApiError = useCallback(
    (err: unknown) => {
      if (err instanceof GoogleWorkspaceAuthError) {
        invalidateWorkspaceToken();
      }
      const rawMessage = err instanceof Error ? err.message : 'Google Workspace request failed.';
      const consoleUrl = extractGoogleConsoleUrl(rawMessage);
      setStatusBanner({
        type: 'error',
        text: formatWorkspaceBannerText(rawMessage, Boolean(consoleUrl)),
        linkUrl: consoleUrl || undefined,
        linkLabel: consoleUrl ? 'Enable API in Console' : undefined,
      });
    },
    [invalidateWorkspaceToken]
  );

  // ---- Drive loaders ----
  const refreshDriveFiles = useCallback(
    async (
      tokenOverride?: string,
      opts?: {
        folderId?: string;
        q?: string;
        filter?: DriveMimeFilter;
        pageToken?: string;
        append?: boolean;
      }
    ) => {
      const token = tokenOverride ?? workspaceToken;
      if (!token) return;
      setDriveLoading(true);
      try {
        const res = await listDriveFiles(token, {
          folderId: opts?.folderId ?? currentFolderId,
          q: opts?.q ?? driveSearch,
          mimeFilter: opts?.filter ?? driveFilter,
          pageToken: opts?.pageToken,
        });
        setDriveFiles((prev) => (opts?.append ? [...prev, ...res.files] : res.files));
        setDriveNextPageToken(res.nextPageToken);
      } catch (err) {
        reportApiError(err);
      } finally {
        setDriveLoading(false);
      }
    },
    [workspaceToken, currentFolderId, driveSearch, driveFilter, reportApiError]
  );

  const inspectDriveFile = useCallback(
    async (file: DriveFileItem, tokenOverride?: string) => {
      const token = tokenOverride ?? workspaceToken;
      if (!token) return;
      if (file.mimeType === DRIVE_FOLDER_MIME) {
        setFolderTrail((prev) => [...prev, { id: file.id, name: file.name }]);
        setSelectedDriveFile(null);
        await refreshDriveFiles(token, { folderId: file.id, q: '' });
        return;
      }

      setSelectedDriveFile(file);
      setRenameDraft(file.name);
      setDrivePreviewText('');
      setDriveEditableText('');
      setDriveParsedSnapshot(null);
      if (drivePreviewImageUrl) {
        URL.revokeObjectURL(drivePreviewImageUrl);
        setDrivePreviewImageUrl(null);
      }

      setDriveFileLoading(true);
      try {
        if (file.mimeType.startsWith('image/')) {
          const blob = await downloadDriveFileBlob(token, file.id);
          setDrivePreviewImageUrl(URL.createObjectURL(blob));
        } else if (
          isEditableDriveMime(file.mimeType) ||
          file.mimeType.startsWith('application/vnd.google-apps.')
        ) {
          const text = await downloadDriveFileText(token, file);
          setDrivePreviewText(text);
          setDriveEditableText(text);
          const parsed = parseDriveBenchSnapshot(text);
          if (parsed) {
            setDriveParsedSnapshot(parsed);
          }
        }
      } catch (err) {
        reportApiError(err);
      } finally {
        setDriveFileLoading(false);
      }
    },
    [workspaceToken, drivePreviewImageUrl, refreshDriveFiles, reportApiError]
  );

  const handleOpenGooglePicker = useCallback(async () => {
    if (!workspaceToken) return;
    setIsPickerOpening(true);
    setStatusBanner(null);
    try {
      const picked = await openGoogleDrivePicker(workspaceToken, {
        title: 'Pick ECU Bench File or Document from Google Drive',
      });
      if (picked) {
        setStatusBanner({
          type: 'success',
          text: `Selected "${picked.name}" via Google Picker.`,
        });
        await inspectDriveFile(picked, workspaceToken);
      }
    } catch (err) {
      reportApiError(err);
    } finally {
      setIsPickerOpening(false);
    }
  }, [workspaceToken, inspectDriveFile, reportApiError]);

  // ---- Gmail loaders ----
  const refreshGmailMessages = useCallback(
    async (
      tokenOverride?: string,
      opts?: { box?: GmailFilterBox; q?: string; pageToken?: string; append?: boolean }
    ) => {
      const token = tokenOverride ?? workspaceToken;
      if (!token) return;
      const box = opts?.box ?? gmailBox;
      const labelIds = box === 'ALL' ? undefined : [box];
      setGmailLoading(true);
      try {
        const res = await listGmailMessages(token, {
          labelIds,
          q: opts?.q ?? gmailSearch,
          pageToken: opts?.pageToken,
        });
        setGmailMessages((prev) => (opts?.append ? [...prev, ...res.messages] : res.messages));
        setGmailNextPageToken(res.nextPageToken);
      } catch (err) {
        reportApiError(err);
      } finally {
        setGmailLoading(false);
      }
    },
    [workspaceToken, gmailBox, gmailSearch, reportApiError]
  );

  // ---- Docs loaders ----
  const refreshGoogleDocs = useCallback(
    async (qOverride?: string, tokenOverride?: string) => {
      const token = tokenOverride ?? workspaceToken;
      if (!token) return;
      setDocsLoading(true);
      try {
        const docs = await listGoogleDocs(token, qOverride ?? docSearch);
        setDocsList(docs);
      } catch (err) {
        reportApiError(err);
      } finally {
        setDocsLoading(false);
      }
    },
    [workspaceToken, docSearch, reportApiError]
  );

  const handleOpenGoogleDoc = useCallback(
    async (item: GoogleDriveDocItem) => {
      if (!workspaceToken) return;
      setDocDetailLoading(true);
      try {
        const parsed = await getGoogleDoc(workspaceToken, item.id);
        setSelectedDoc(parsed);
        setDocEditableBody(parsed.plainText);
      } catch (err) {
        reportApiError(err);
      } finally {
        setDocDetailLoading(false);
      }
    },
    [workspaceToken, reportApiError]
  );

  // ---- Tasks loaders ----
  const refreshTasks = useCallback(
    async (tokenOverride?: string, listIdOverride?: string) => {
      const token = tokenOverride ?? workspaceToken;
      if (!token) return;
      setTasksLoading(true);
      try {
        const lists = await listTaskLists(token);
        setTaskLists(lists);
        const activeListId = listIdOverride || selectedTaskListId || lists[0]?.id || '';
        setSelectedTaskListId(activeListId);
        if (activeListId) {
          const items = await listTasksInList(token, activeListId);
          setTasks(items);
        } else {
          setTasks([]);
        }
      } catch (err) {
        reportApiError(err);
      } finally {
        setTasksLoading(false);
      }
    },
    [workspaceToken, selectedTaskListId, reportApiError]
  );

  // ---- Classroom loaders ----
  const loadCourseDetails = useCallback(
    async (course: ClassroomCourse, tokenOverride?: string) => {
      const token = tokenOverride ?? workspaceToken;
      if (!token) return;
      setSelectedCourse(course);
      setClassroomDetailsLoading(true);
      try {
        const [anns, works, mats] = await Promise.all([
          listClassroomAnnouncements(token, course.id),
          listClassroomCourseWork(token, course.id),
          listClassroomMaterials(token, course.id),
        ]);
        setAnnouncements(anns);
        setCourseWork(works);
        setMaterials(mats);
      } catch (err) {
        reportApiError(err);
      } finally {
        setClassroomDetailsLoading(false);
      }
    },
    [workspaceToken, reportApiError]
  );

  const refreshClassroomCourses = useCallback(
    async (tokenOverride?: string) => {
      const token = tokenOverride ?? workspaceToken;
      if (!token) return;
      setCoursesLoading(true);
      try {
        const list = await listClassroomCourses(token);
        setCourses(list);
        if (list.length > 0 && !selectedCourse) {
          await loadCourseDetails(list[0], token);
        }
      } catch (err) {
        reportApiError(err);
      } finally {
        setCoursesLoading(false);
      }
    },
    [workspaceToken, selectedCourse, loadCourseDetails, reportApiError]
  );

  // Load active tab data when authorized
  useEffect(() => {
    if (!isOpen || !workspaceToken) return;
    if (activeTab === 'DRIVE') {
      void refreshDriveFiles(workspaceToken);
    } else if (activeTab === 'GMAIL') {
      void refreshGmailMessages(workspaceToken);
    } else if (activeTab === 'DOCS') {
      void refreshGoogleDocs(undefined, workspaceToken);
    } else if (activeTab === 'TASKS') {
      void refreshTasks(workspaceToken);
    } else if (activeTab === 'CLASSROOM') {
      void refreshClassroomCourses(workspaceToken);
    }
  }, [
    isOpen,
    workspaceToken,
    activeTab,
    refreshDriveFiles,
    refreshGmailMessages,
    refreshGoogleDocs,
    refreshTasks,
    refreshClassroomCourses,
  ]);

  const handleConnectWorkspace = useCallback(async () => {
    setStatusBanner(null);
    const token = await connectGoogleWorkspace(true);
    if (token) {
      setStatusBanner({
        type: 'success',
        text: 'Connected to Google Workspace (Drive, Picker, Gmail, Docs, Tasks & Classroom).',
      });
    }
  }, [connectGoogleWorkspace]);

  // Execute ONLY after explicit user confirmation inside WorkspaceActionConfirmDialog
  const handleConfirmPendingAction = useCallback(async () => {
    if (!pendingAction || !workspaceToken) return;
    setIsExecuting(true);
    setStatusBanner(null);
    try {
      switch (pendingAction.kind) {
        case 'SEND_EMAIL': {
          await sendGmailMessage(workspaceToken, {
            to: pendingAction.to,
            cc: pendingAction.cc,
            subject: pendingAction.subject,
            bodyText: pendingAction.bodyText,
          });
          setStatusBanner({ type: 'success', text: `Sent email to ${pendingAction.to}.` });
          setGmailRightMode('READER');
          await refreshGmailMessages(workspaceToken);
          break;
        }
        case 'SAVE_DRAFT': {
          await createGmailDraft(workspaceToken, {
            to: pendingAction.to,
            cc: pendingAction.cc,
            subject: pendingAction.subject,
            bodyText: pendingAction.bodyText,
          });
          setStatusBanner({ type: 'success', text: 'Saved email draft in Gmail.' });
          await refreshGmailMessages(workspaceToken);
          break;
        }
        case 'TRASH_EMAIL': {
          await trashGmailMessage(workspaceToken, pendingAction.messageId);
          if (selectedMessage?.id === pendingAction.messageId) {
            setSelectedMessage(null);
          }
          setStatusBanner({
            type: 'success',
            text: `Moved "${pendingAction.subject}" to Gmail Trash.`,
          });
          await refreshGmailMessages(workspaceToken);
          break;
        }
        case 'UPLOAD_DRIVE_FILE': {
          const uploaded = await uploadDriveFile(workspaceToken, {
            name: pendingAction.name,
            mimeType: pendingAction.mimeType,
            content: pendingAction.content,
            parentId: pendingAction.parentId,
            description: pendingAction.description,
          });
          setStatusBanner({
            type: 'success',
            text: `Uploaded "${uploaded.name}" to Google Drive.`,
            linkUrl: uploaded.webViewLink,
            linkLabel: 'Open in Drive',
          });
          await refreshDriveFiles(workspaceToken);
          break;
        }
        case 'OVERWRITE_DRIVE_FILE': {
          await overwriteDriveFileContent(
            workspaceToken,
            pendingAction.fileId,
            pendingAction.content,
            pendingAction.mimeType
          );
          setDrivePreviewText(pendingAction.content);
          setStatusBanner({
            type: 'success',
            text: `Saved changes to "${pendingAction.name}" in Google Drive.`,
          });
          break;
        }
        case 'CREATE_DRIVE_FOLDER': {
          const folder = await createDriveFolder(
            workspaceToken,
            pendingAction.name,
            pendingAction.parentId
          );
          setNewFolderName('');
          setShowNewFolderInput(false);
          setStatusBanner({
            type: 'success',
            text: `Created Google Drive folder "${folder.name}".`,
          });
          await refreshDriveFiles(workspaceToken);
          break;
        }
        case 'RENAME_DRIVE_FILE': {
          const renamed = await renameDriveFile(
            workspaceToken,
            pendingAction.fileId,
            pendingAction.newName
          );
          setSelectedDriveFile(renamed);
          setStatusBanner({
            type: 'success',
            text: `Renamed Drive item to "${renamed.name}".`,
          });
          await refreshDriveFiles(workspaceToken);
          break;
        }
        case 'TRASH_DRIVE_FILE': {
          await trashDriveFile(workspaceToken, pendingAction.fileId);
          if (selectedDriveFile?.id === pendingAction.fileId) {
            setSelectedDriveFile(null);
          }
          setStatusBanner({
            type: 'success',
            text: `Moved "${pendingAction.name}" to Google Drive Trash.`,
          });
          await refreshDriveFiles(workspaceToken);
          break;
        }
        case 'DELETE_DRIVE_FILE': {
          await deleteDriveFilePermanently(workspaceToken, pendingAction.fileId);
          if (selectedDriveFile?.id === pendingAction.fileId) {
            setSelectedDriveFile(null);
          }
          setStatusBanner({
            type: 'success',
            text: `Permanently deleted "${pendingAction.name}" from Google Drive.`,
          });
          await refreshDriveFiles(workspaceToken);
          break;
        }
        case 'CREATE_GOOGLE_DOC': {
          const created = await createBenchReportDoc(
            workspaceToken,
            pendingAction.title,
            pendingAction.bodyText
          );
          setStatusBanner({
            type: 'success',
            text: `Created Google Doc "${created.title}".`,
            linkUrl: created.webViewLink,
            linkLabel: 'Open in Docs',
          });
          await refreshGoogleDocs(undefined, workspaceToken);
          const loaded = await getGoogleDoc(workspaceToken, created.documentId);
          setSelectedDoc(loaded);
          setDocEditableBody(loaded.plainText);
          break;
        }
        case 'APPEND_GOOGLE_DOC': {
          const updated = await appendToGoogleDoc(
            workspaceToken,
            pendingAction.documentId,
            pendingAction.textToAppend
          );
          setSelectedDoc(updated);
          setDocEditableBody(updated.plainText);
          setStatusBanner({
            type: 'success',
            text: `Appended live MNA bench report to "${updated.title}".`,
          });
          break;
        }
        case 'REPLACE_GOOGLE_DOC': {
          const updated = await replaceGoogleDocBody(
            workspaceToken,
            pendingAction.documentId,
            pendingAction.newBodyText
          );
          setSelectedDoc(updated);
          setDocEditableBody(updated.plainText);
          setStatusBanner({
            type: 'success',
            text: `Saved updated body to Google Doc "${updated.title}".`,
          });
          break;
        }
        case 'TRASH_GOOGLE_DOC': {
          await trashGoogleDoc(workspaceToken, pendingAction.documentId);
          if (selectedDoc?.documentId === pendingAction.documentId) {
            setSelectedDoc(null);
          }
          setStatusBanner({
            type: 'success',
            text: `Moved Google Doc "${pendingAction.title}" to Trash.`,
          });
          await refreshGoogleDocs(undefined, workspaceToken);
          break;
        }
        case 'CREATE_TASK_ITEM': {
          await createTaskItem(workspaceToken, pendingAction.taskListId, {
            title: pendingAction.title,
            notes: pendingAction.notes,
            dueIsoDate: pendingAction.dueIsoDate,
          });
          setStatusBanner({
            type: 'success',
            text: `Added "${pendingAction.title}" to Google Tasks.`,
          });
          await refreshTasks(workspaceToken, pendingAction.taskListId);
          break;
        }
        case 'TOGGLE_TASK_STATUS': {
          await updateTaskCompletion(
            workspaceToken,
            pendingAction.taskListId,
            pendingAction.taskId,
            pendingAction.nextCompleted
          );
          setStatusBanner({
            type: 'success',
            text: `Marked "${pendingAction.taskTitle}" as ${pendingAction.nextCompleted ? 'Completed' : 'Needs Action'}.`,
          });
          await refreshTasks(workspaceToken, pendingAction.taskListId);
          break;
        }
        case 'DELETE_TASK_ITEM': {
          await deleteTaskItem(workspaceToken, pendingAction.taskListId, pendingAction.taskId);
          setStatusBanner({
            type: 'success',
            text: `Deleted task "${pendingAction.taskTitle}".`,
          });
          await refreshTasks(workspaceToken, pendingAction.taskListId);
          break;
        }
        case 'EXPORT_BENCH_TASKS': {
          for (const item of pendingAction.tasks) {
            await createTaskItem(workspaceToken, pendingAction.taskListId, {
              title: item.title,
              notes: item.notes,
            });
          }
          setStatusBanner({
            type: 'success',
            text: `Exported ${pendingAction.tasks.length} repair task(s) to "${pendingAction.taskListTitle}".`,
          });
          await refreshTasks(workspaceToken, pendingAction.taskListId);
          break;
        }
        case 'POST_CLASSROOM_ANNOUNCEMENT': {
          const posted = await createClassroomAnnouncement(
            workspaceToken,
            pendingAction.courseId,
            pendingAction.text
          );
          setStatusBanner({
            type: 'success',
            text: `Posted announcement to "${pendingAction.courseName}".`,
            linkUrl: posted.alternateLink,
            linkLabel: 'Open in Classroom',
          });
          if (selectedCourse && selectedCourse.id === pendingAction.courseId) {
            await loadCourseDetails(selectedCourse, workspaceToken);
          }
          break;
        }
        case 'CREATE_CLASSROOM_ASSIGNMENT': {
          const createdWork = await createClassroomAssignment(
            workspaceToken,
            pendingAction.courseId,
            {
              title: pendingAction.title,
              description: pendingAction.description,
              maxPoints: pendingAction.maxPoints,
            }
          );
          setStatusBanner({
            type: 'success',
            text: `Published assignment "${createdWork.title}" in "${pendingAction.courseName}".`,
            linkUrl: createdWork.alternateLink,
            linkLabel: 'Open in Classroom',
          });
          if (selectedCourse && selectedCourse.id === pendingAction.courseId) {
            await loadCourseDetails(selectedCourse, workspaceToken);
          }
          break;
        }
        default:
          break;
      }
      setPendingAction(null);
    } catch (err) {
      reportApiError(err);
    } finally {
      setIsExecuting(false);
    }
  }, [
    pendingAction,
    workspaceToken,
    selectedMessage?.id,
    selectedDriveFile?.id,
    selectedDoc?.documentId,
    selectedCourse,
    refreshGmailMessages,
    refreshDriveFiles,
    refreshGoogleDocs,
    refreshTasks,
    loadCourseDetails,
    reportApiError,
  ]);

  if (!isOpen) return null;

  const isCloudTab = activeTab !== 'LOCAL';
  const showAuthGate = isCloudTab && (needsWorkspaceAuth || !workspaceToken);

  const hubTabs: Array<{
    id: ActiveHubTab;
    label: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'DRIVE', label: 'Drive & Picker', icon: HardDrive },
    { id: 'GMAIL', label: 'Gmail', icon: Mail },
    { id: 'DOCS', label: 'Google Docs', icon: FileText },
    { id: 'TASKS', label: 'Google Tasks', icon: CheckSquare },
    { id: 'CLASSROOM', label: 'Classroom', icon: GraduationCap },
    { id: 'LOCAL', label: 'Local Exports', icon: FolderDown },
  ];

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatusBanner({ type: 'success', text: `Copied ${label} to clipboard.` });
    } catch {
      setStatusBanner({
        type: 'error',
        text: 'Clipboard copy was blocked by the browser. Use Download instead.',
      });
    }
  };

  const handleImportSnapshotFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setStatusBanner({ type: 'error', text: 'Snapshot file exceeds the 5 MB safety limit.' });
      return;
    }
    try {
      const rawText = await file.text();
      const parsed = parseDriveBenchSnapshot(rawText);
      if (!parsed) {
        setStatusBanner({
          type: 'error',
          text: 'Invalid ECU bench snapshot JSON. Select a file exported by AutoElectric Lab Pro.',
        });
        return;
      }
      setImportedSnapshot(parsed);
      setStatusBanner({
        type: 'success',
        text: `Parsed local snapshot "${parsed.title}" (${parsed.wires.length} wires, ${parsed.faults.length} faults).`,
      });
    } catch {
      setStatusBanner({ type: 'error', text: 'Unable to read selected snapshot file.' });
    }
  };

  return (
    <div
      data-testid="google-workspace-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4"
    >
      <div className="relative flex flex-col w-full max-w-6xl h-[92vh] bg-slate-900 border border-sky-500/30 rounded-xl shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-400 shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                Google Workspace Hub
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Google Drive, Picker, Gmail, Docs, Tasks &amp; Classroom synced with live ECU telemetry
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {workspaceToken ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300">
                <CheckCircle2 className="w-3 h-3" />
                {user?.email ? `Connected: ${user.email}` : 'Workspace Connected'}
              </span>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-[10px] font-semibold text-amber-300">
                Sign-In Required for Cloud
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              aria-label="Close Google Workspace Hub"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status / Auth Error Banner */}
        {(statusBanner || authError) && (
          <div
            className={`px-4 sm:px-5 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 border-b shrink-0 ${
              statusBanner?.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-700/40 text-emerald-200'
                : 'bg-rose-950/70 border-rose-700/40 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {statusBanner?.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span className="break-words">{statusBanner?.text || authError}</span>
              {statusBanner?.linkUrl && toSafeExternalHttpUrl(statusBanner.linkUrl) && (
                <a
                  href={toSafeExternalHttpUrl(statusBanner.linkUrl)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline font-semibold shrink-0"
                >
                  <span>{statusBanner.linkLabel || 'Open'}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-slate-400 hover:text-white cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Body */}
        {!canUseExports ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-amber-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              Workspace Hub Requires an Active PIN
            </h3>
            <p className="text-xs text-slate-400 max-w-md mb-5 leading-relaxed">
              Enter an active 8-digit Trial PIN or Master Admin PIN to unlock Google Workspace sync and local bench exports.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                openAccessModal({
                  tab: 'TRIAL_PIN',
                  notice:
                    'Enter an active 8-digit Trial PIN or Master Admin PIN to unlock Google Workspace exports.',
                });
              }}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer"
            >
              Enter 8-Digit Trial PIN
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Top Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 px-4 sm:px-5 py-2.5 bg-slate-950/80 border-b border-slate-800 shrink-0">
              {hubTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    data-testid={`workspace-tab-${tab.id.toLowerCase()}`}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setStatusBanner(null);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      isActive
                        ? 'bg-sky-600 text-white border border-sky-400/50'
                        : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Cloud Auth Prompt or Active Workspace Tab */}
            {showAuthGate ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 text-center space-y-4 overflow-y-auto">
                <div className="w-14 h-14 rounded-2xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-400">
                  <Cloud className="w-7 h-7" />
                </div>
                <div className="space-y-1.5 max-w-md">
                  <h3 className="text-base font-bold text-white">
                    Connect Google Workspace to AutoElectric Lab Pro
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Sign in with Google to authorize live access to Google Drive, Google Picker, Gmail, Google Docs, Google Tasks, and Google Classroom. Your OAuth token is kept in memory only and cleared automatically when you sign out.
                  </p>
                </div>
                <GoogleSignInButton
                  testId="workspace-google-signin-btn"
                  disabled={isSigningIn}
                  label={isSigningIn ? 'Authorizing Google Workspace...' : 'Sign in with Google'}
                  onClick={() => void handleConnectWorkspace()}
                />
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('LOCAL')}
                    className="text-xs text-sky-400 hover:text-sky-300 underline cursor-pointer"
                  >
                    Or continue offline with Local Exports (.JSON, .CSV, .TXT, .MD)
                  </button>
                </div>
              </div>
            ) : activeTab === 'DRIVE' ? (
              <GoogleDriveTab
                driveFiles={driveFiles}
                driveNextPageToken={driveNextPageToken}
                driveLoading={driveLoading}
                driveSearch={driveSearch}
                onChangeDriveSearch={setDriveSearch}
                driveFilter={driveFilter}
                onChangeDriveFilter={setDriveFilter}
                folderTrail={folderTrail}
                onNavigateBreadcrumb={(idx, folderId) => {
                  setFolderTrail((prev) => prev.slice(0, idx + 1));
                  void refreshDriveFiles(workspaceToken ?? undefined, { folderId, q: '' });
                }}
                selectedDriveFile={selectedDriveFile}
                drivePreviewText={drivePreviewText}
                drivePreviewImageUrl={drivePreviewImageUrl}
                driveEditableText={driveEditableText}
                onChangeDriveEditableText={setDriveEditableText}
                driveFileLoading={driveFileLoading}
                driveParsedSnapshot={driveParsedSnapshot}
                renameDraft={renameDraft}
                onChangeRenameDraft={setRenameDraft}
                newFolderName={newFolderName}
                onChangeNewFolderName={setNewFolderName}
                showNewFolderInput={showNewFolderInput}
                onToggleNewFolderInput={() => setShowNewFolderInput((prev) => !prev)}
                isExecuting={isExecuting}
                selectedIsEditableText={
                  selectedDriveFile ? isEditableDriveMime(selectedDriveFile.mimeType) : false
                }
                currentFolderId={currentFolderId}
                onRefreshDriveFiles={(tokenOverride, opts) =>
                  void refreshDriveFiles(tokenOverride, opts)
                }
                onInspectDriveFile={(file) => void inspectDriveFile(file)}
                onDownloadSelectedDriveFile={async () => {
                  if (!selectedDriveFile || !workspaceToken) return;
                  try {
                    const blob = await downloadDriveFileBlob(workspaceToken, selectedDriveFile.id);
                    triggerLocalDownload(
                      selectedDriveFile.name,
                      blob,
                      selectedDriveFile.mimeType || 'application/octet-stream'
                    );
                    setStatusBanner({
                      type: 'success',
                      text: `Downloaded "${selectedDriveFile.name}".`,
                    });
                  } catch (err) {
                    reportApiError(err);
                  }
                }}
                onStageBenchSnapshotUpload={() =>
                  setPendingAction({
                    kind: 'UPLOAD_DRIVE_FILE',
                    name: `${sanitizeFileSlug(exportTitle)}.json`,
                    mimeType: 'application/json',
                    content: snapshotJson,
                    parentId: currentFolderId,
                    previewText: snapshotJson.slice(0, 200),
                    description: `AutoElectric Lab Pro bench snapshot (${ecuProfileLabel})`,
                  })
                }
                onStageReportTxtUpload={() =>
                  setPendingAction({
                    kind: 'UPLOAD_DRIVE_FILE',
                    name: `${sanitizeFileSlug(exportTitle)}-report.txt`,
                    mimeType: 'text/plain',
                    content: diagnosticReportTxt,
                    parentId: currentFolderId,
                    previewText: diagnosticReportTxt.slice(0, 200),
                    description: `MNA ECU diagnostic report (${ecuProfileLabel})`,
                  })
                }
                onLocalFileSelected={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setPendingAction({
                    kind: 'UPLOAD_DRIVE_FILE',
                    name: file.name,
                    mimeType: file.type || 'application/octet-stream',
                    content: file,
                    parentId: currentFolderId,
                    previewText: `${file.name} (${file.size} bytes)`,
                    description: 'Local file uploaded from AutoElectric Lab Pro',
                  });
                }}
                onOpenGooglePicker={() => void handleOpenGooglePicker()}
                isPickerOpening={isPickerOpening}
                onSetPendingAction={setPendingAction}
                onLoadBenchSnapshot={onLoadBenchSnapshot}
                onSetStatusBanner={setStatusBanner}
              />
            ) : activeTab === 'GMAIL' ? (
              <GmailDispatchTab
                gmailBox={gmailBox}
                onSelectGmailBox={(box) => {
                  setGmailBox(box);
                  void refreshGmailMessages(workspaceToken ?? undefined, { box });
                }}
                gmailSearch={gmailSearch}
                onChangeGmailSearch={setGmailSearch}
                gmailMessages={gmailMessages}
                gmailNextPageToken={gmailNextPageToken}
                gmailLoading={gmailLoading}
                selectedMessage={selectedMessage}
                gmailDetailLoading={gmailDetailLoading}
                gmailRightMode={gmailRightMode}
                onSwitchToCompose={() => setGmailRightMode('COMPOSE')}
                composeTo={composeTo}
                onChangeComposeTo={setComposeTo}
                composeCc={composeCc}
                onChangeComposeCc={setComposeCc}
                composeSubject={composeSubject}
                onChangeComposeSubject={setComposeSubject}
                composeBody={composeBody}
                onChangeComposeBody={setComposeBody}
                isExecuting={isExecuting}
                onRefreshGmailMessages={(tokenOverride, opts) =>
                  void refreshGmailMessages(tokenOverride, opts)
                }
                onOpenGmailMessage={async (msg) => {
                  if (!workspaceToken) return;
                  setGmailRightMode('READER');
                  setGmailDetailLoading(true);
                  try {
                    const detail = await getGmailMessage(workspaceToken, msg.id);
                    setSelectedMessage(detail);
                  } catch (err) {
                    reportApiError(err);
                  } finally {
                    setGmailDetailLoading(false);
                  }
                }}
                onToggleReadState={async (msg) => {
                  if (!workspaceToken) return;
                  try {
                    await markGmailMessageRead(workspaceToken, msg.id, !msg.isUnread);
                    await refreshGmailMessages(workspaceToken);
                  } catch (err) {
                    reportApiError(err);
                  }
                }}
                onReplyToSelected={() => {
                  if (!selectedMessage) return;
                  setComposeTo(selectedMessage.from);
                  setComposeSubject(
                    selectedMessage.subject.startsWith('Re:')
                      ? selectedMessage.subject
                      : `Re: ${selectedMessage.subject}`
                  );
                  setComposeBody(`\n\n--- Original Message ---\n${selectedMessage.bodyText}`);
                  setGmailRightMode('COMPOSE');
                }}
                onPopulateMnaReportEmail={() => {
                  const template = buildDiagnosticEmailTemplate({
                    ecuProfileLabel,
                    powerSupply,
                    pins,
                    wires,
                    faults,
                    multimeter,
                    circuitSolution,
                    technicianNotes: techNotes,
                  });
                  setComposeSubject(template.subject);
                  setComposeBody(template.bodyText);
                }}
                onSetPendingAction={setPendingAction}
              />
            ) : activeTab === 'DOCS' ? (
              <GoogleDocsTab
                docsList={docsList}
                docsLoading={docsLoading}
                docSearch={docSearch}
                onChangeDocSearch={setDocSearch}
                selectedDoc={selectedDoc}
                docDetailLoading={docDetailLoading}
                docEditableBody={docEditableBody}
                onChangeDocEditableBody={setDocEditableBody}
                defaultNewTitle={`ECU Bench Report — ${ecuProfileLabel}`}
                liveReportBody={diagnosticReportTxt}
                isExecuting={isExecuting}
                onRefreshDocs={(qOverride) => void refreshGoogleDocs(qOverride)}
                onOpenDoc={(item) => void handleOpenGoogleDoc(item)}
                onSetPendingAction={setPendingAction}
              />
            ) : activeTab === 'TASKS' ? (
              <GoogleTasksTab
                taskLists={taskLists}
                selectedTaskListId={selectedTaskListId}
                onSelectTaskListId={(id) => {
                  setSelectedTaskListId(id);
                  void refreshTasks(workspaceToken ?? undefined, id);
                }}
                tasks={tasks}
                tasksLoading={tasksLoading}
                isExecuting={isExecuting}
                benchInput={benchTelemetryInput}
                onRefreshTasks={() => void refreshTasks()}
                onCreateTask={(title, notes, dueIsoDate) => {
                  const selectedList = taskLists.find((l) => l.id === selectedTaskListId);
                  setPendingAction({
                    kind: 'CREATE_TASK_ITEM',
                    taskListId: selectedTaskListId,
                    taskListTitle: selectedList?.title || 'Primary Task List',
                    title,
                    notes,
                    dueIsoDate,
                  });
                }}
                onSetPendingAction={setPendingAction}
              />
            ) : activeTab === 'CLASSROOM' ? (
              <GoogleClassroomTab
                courses={courses}
                coursesLoading={coursesLoading}
                selectedCourse={selectedCourse}
                announcements={announcements}
                courseWork={courseWork}
                materials={materials}
                detailsLoading={classroomDetailsLoading}
                isExecuting={isExecuting}
                defaultLabSummary={classroomLabSummary}
                onRefreshCourses={() => void refreshClassroomCourses()}
                onSelectCourse={(course) => void loadCourseDetails(course)}
                onSetPendingAction={setPendingAction}
              />
            ) : (
              /* LOCAL OFFLINE EXPORTS TAB */
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'SNAPSHOT', label: 'Bench Snapshot (.JSON)', icon: FileJson },
                      { id: 'PINOUT_CSV', label: 'Pinout Matrix (.CSV)', icon: FileSpreadsheet },
                      { id: 'REPORT_TXT', label: 'Diagnostic Report (.TXT)', icon: FileText },
                      { id: 'CHECKLIST_MD', label: 'Repair Checklist (.MD)', icon: CheckSquare },
                    ] as const
                  ).map((sub) => {
                    const Icon = sub.icon;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => setLocalSubTab(sub.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          localSubTab === sub.id
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{sub.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Export File Title
                    </label>
                    <input
                      type="text"
                      value={exportTitle}
                      onChange={(e) => setExportTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Optional Technician Notes
                    </label>
                    <input
                      type="text"
                      value={techNotes}
                      onChange={(e) => setTechNotes(e.target.value)}
                      placeholder="Add bench findings or test notes..."
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                {localSubTab === 'SNAPSHOT' && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const filename = `${sanitizeFileSlug(exportTitle)}.json`;
                          triggerLocalDownload(filename, snapshotJson, 'application/json');
                          setStatusBanner({
                            type: 'success',
                            text: `Downloaded local bench snapshot "${filename}".`,
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Bench Snapshot (.JSON)
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={handleImportSnapshotFile}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Import Local Snapshot (.JSON)
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopy(snapshotJson, 'Bench Snapshot JSON')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy JSON
                      </button>
                    </div>

                    {importedSnapshot && onLoadBenchSnapshot && (
                      <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs">
                          <div className="font-semibold text-emerald-200">
                            Ready to Load: {importedSnapshot.title}
                          </div>
                          <div className="text-[11px] text-emerald-300/80">
                            {importedSnapshot.ecuProfileLabel} · {importedSnapshot.wires.length} wires
                            · {importedSnapshot.faults.length} faults
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onLoadBenchSnapshot(importedSnapshot);
                            setStatusBanner({
                              type: 'success',
                              text: `Loaded bench snapshot "${importedSnapshot.title}".`,
                            });
                            setImportedSnapshot(null);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer"
                        >
                          Apply Snapshot to Bench
                        </button>
                      </div>
                    )}

                    <pre className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/90 text-[11px] font-mono text-slate-300 max-h-72 overflow-auto">
                      {snapshotJson}
                    </pre>
                  </div>
                )}

                {localSubTab === 'PINOUT_CSV' && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const filename = `${sanitizeFileSlug(exportTitle)}-pinouts.csv`;
                          triggerLocalDownload(filename, pinoutMatrixCsv, 'text/csv');
                          setStatusBanner({
                            type: 'success',
                            text: `Downloaded live MNA pinout matrix "${filename}".`,
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Pinout Matrix (.CSV)
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopy(pinoutMatrixCsv, 'Pinout Matrix CSV')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy CSV
                      </button>
                    </div>
                    <pre className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/90 text-[11px] font-mono text-slate-300 max-h-72 overflow-auto">
                      {pinoutMatrixCsv}
                    </pre>
                  </div>
                )}

                {localSubTab === 'REPORT_TXT' && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const filename = `${sanitizeFileSlug(exportTitle)}-report.txt`;
                          triggerLocalDownload(filename, diagnosticReportTxt, 'text/plain');
                          setStatusBanner({
                            type: 'success',
                            text: `Downloaded diagnostic report "${filename}".`,
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Diagnostic Report (.TXT)
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopy(diagnosticReportTxt, 'Diagnostic Report')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy Report
                      </button>
                    </div>
                    <pre className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/90 text-[11px] font-mono text-slate-300 whitespace-pre-wrap max-h-72 overflow-auto">
                      {diagnosticReportTxt}
                    </pre>
                  </div>
                )}

                {localSubTab === 'CHECKLIST_MD' && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const filename = `${sanitizeFileSlug(exportTitle)}-checklist.md`;
                          triggerLocalDownload(filename, repairChecklistMd, 'text/markdown');
                          setStatusBanner({
                            type: 'success',
                            text: `Downloaded repair checklist "${filename}".`,
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Repair Checklist (.MD)
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopy(repairChecklistMd, 'Repair Checklist')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy Markdown
                      </button>
                    </div>
                    <pre className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/90 text-[11px] font-mono text-slate-300 whitespace-pre-wrap max-h-72 overflow-auto">
                      {repairChecklistMd}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Explicit React confirmation modal for all mutating/destructive Google Workspace API calls */}
      <WorkspaceActionConfirmDialog
        action={pendingAction}
        isExecuting={isExecuting}
        onCancel={() => {
          if (!isExecuting) setPendingAction(null);
        }}
        onConfirm={() => void handleConfirmPendingAction()}
      />
    </div>
  );
};
