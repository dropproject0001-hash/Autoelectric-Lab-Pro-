/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import { DriveBenchSnapshot, DriveFileItem, DriveMimeFilter } from '../../services/googleDriveService';
import { GmailMessageDetail, GmailMessageSummary } from '../../services/gmailService';

export type WorkspaceTab =
  | 'DRIVE'
  | 'GMAIL'
  | 'DOCS'
  | 'TASKS'
  | 'CLASSROOM'
  | 'LOCAL'
  | 'SHEETS'
  | 'SLIDES'
  | 'KEEP';

export type GmailFilterBox = 'INBOX' | 'SENT' | 'DRAFT' | 'STARRED' | 'ALL';

export interface WorkspaceStatusBanner {
  type: 'success' | 'error';
  text: string;
  linkUrl?: string;
  linkLabel?: string;
}

export type PendingWorkspaceAction =
  | {
      kind: 'SEND_EMAIL';
      to: string;
      cc: string;
      subject: string;
      bodyText: string;
    }
  | {
      kind: 'SAVE_DRAFT';
      to: string;
      cc: string;
      subject: string;
      bodyText: string;
    }
  | {
      kind: 'TRASH_EMAIL';
      messageId: string;
      subject: string;
      from: string;
    }
  | {
      kind: 'UPLOAD_DRIVE_FILE';
      name: string;
      mimeType: string;
      content: string | Blob;
      parentId?: string;
      previewText: string;
      description: string;
    }
  | {
      kind: 'OVERWRITE_DRIVE_FILE';
      fileId: string;
      name: string;
      mimeType: string;
      content: string;
    }
  | {
      kind: 'CREATE_DRIVE_FOLDER';
      name: string;
      parentId?: string;
    }
  | {
      kind: 'RENAME_DRIVE_FILE';
      fileId: string;
      oldName: string;
      newName: string;
    }
  | {
      kind: 'TRASH_DRIVE_FILE';
      fileId: string;
      name: string;
    }
  | {
      kind: 'DELETE_DRIVE_FILE';
      fileId: string;
      name: string;
    }
  | {
      kind: 'CREATE_GOOGLE_DOC';
      title: string;
      bodyText: string;
    }
  | {
      kind: 'APPEND_GOOGLE_DOC';
      documentId: string;
      title: string;
      textToAppend: string;
    }
  | {
      kind: 'REPLACE_GOOGLE_DOC';
      documentId: string;
      title: string;
      newBodyText: string;
    }
  | {
      kind: 'TRASH_GOOGLE_DOC';
      documentId: string;
      title: string;
    }
  | {
      kind: 'APPEND_SHEET_TELEMETRY';
      spreadsheetId: string;
      spreadsheetTitle: string;
      sheetTitle: string;
    }
  | {
      kind: 'TRASH_SPREADSHEET';
      spreadsheetId: string;
      title: string;
    }
  | {
      kind: 'APPEND_SLIDE_DECK';
      presentationId: string;
      presentationTitle: string;
    }
  | {
      kind: 'TRASH_PRESENTATION';
      presentationId: string;
      title: string;
    }
  | {
      kind: 'CREATE_TASK_ITEM';
      taskListId: string;
      taskListTitle: string;
      title: string;
      notes: string;
      dueIsoDate: string;
    }
  | {
      kind: 'TOGGLE_TASK_STATUS';
      taskListId: string;
      taskId: string;
      taskTitle: string;
      nextCompleted: boolean;
    }
  | {
      kind: 'DELETE_TASK_ITEM';
      taskListId: string;
      taskId: string;
      taskTitle: string;
    }
  | {
      kind: 'EXPORT_BENCH_TASKS';
      taskListId: string;
      taskListTitle: string;
      tasks: { title: string; notes: string }[];
    }
  | {
      kind: 'POST_CLASSROOM_ANNOUNCEMENT';
      courseId: string;
      courseName: string;
      text: string;
    }
  | {
      kind: 'CREATE_CLASSROOM_ASSIGNMENT';
      courseId: string;
      courseName: string;
      title: string;
      description: string;
      maxPoints?: number;
    }
  | {
      kind: 'DELETE_KEEP_NOTE';
      noteName: string;
      noteTitle: string;
    };

export interface DriveTabState {
  driveFiles: DriveFileItem[];
  driveNextPageToken?: string;
  driveLoading: boolean;
  driveSearch: string;
  driveFilter: DriveMimeFilter;
  folderTrail: { id: string; name: string }[];
  selectedDriveFile: DriveFileItem | null;
  drivePreviewText: string;
  drivePreviewImageUrl: string | null;
  driveEditableText: string;
  driveFileLoading: boolean;
  driveParsedSnapshot: DriveBenchSnapshot | null;
  renameDraft: string;
  newFolderName: string;
  showNewFolderInput: boolean;
}

export interface GmailTabState {
  gmailBox: GmailFilterBox;
  gmailSearch: string;
  gmailMessages: GmailMessageSummary[];
  gmailNextPageToken?: string;
  gmailLoading: boolean;
  selectedMessage: GmailMessageDetail | null;
  gmailDetailLoading: boolean;
  gmailRightMode: 'READER' | 'COMPOSE';
  composeTo: string;
  composeCc: string;
  composeSubject: string;
  composeBody: string;
}
