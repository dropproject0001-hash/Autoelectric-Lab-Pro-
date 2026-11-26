/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React from 'react';
import { AlertTriangle, Loader2, ShieldAlert, X } from 'lucide-react';
import type { PendingWorkspaceAction } from './workspaceTypes';

interface GoogleSignInButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  testId?: string;
}

/**
 * Official Google Sign-In Material button styling per Google Branding Guidelines.
 */
export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  onClick,
  disabled = false,
  label = 'Sign in with Google',
  testId,
}) => (
  <button
    type="button"
    data-testid={testId}
    disabled={disabled}
    onClick={onClick}
    className="inline-flex items-center justify-center gap-3 h-10 px-4 rounded-[4px] bg-white hover:bg-[#f8f9fa] active:bg-[#eeeeee] border border-[#747775] text-[#1f1f1f] text-sm font-medium shadow-sm transition disabled:opacity-50 cursor-pointer"
  >
    <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
    <span>{label}</span>
  </button>
);

export interface ActionConfirmationSummary {
  title: string;
  description: string;
  confirmLabel: string;
  isDestructive: boolean;
  details: Array<{ label: string; value: string }>;
}

export function describePendingWorkspaceAction(
  action: PendingWorkspaceAction
): ActionConfirmationSummary {
  switch (action.kind) {
    case 'SEND_EMAIL':
      return {
        title: 'Confirm Send Gmail Message',
        description: 'This will immediately send an email from your Google account.',
        confirmLabel: 'Send Email',
        isDestructive: false,
        details: [
          { label: 'To', value: action.to },
          ...(action.cc ? [{ label: 'Cc', value: action.cc }] : []),
          { label: 'Subject', value: action.subject || '(No Subject)' },
          { label: 'Preview', value: action.bodyText.slice(0, 220) || '(Empty body)' },
        ],
      };
    case 'SAVE_DRAFT':
      return {
        title: 'Confirm Save Gmail Draft',
        description: 'This will create a new draft email in your Gmail Drafts folder.',
        confirmLabel: 'Save Draft',
        isDestructive: false,
        details: [
          { label: 'To', value: action.to || '(Unassigned)' },
          { label: 'Subject', value: action.subject || '(No Subject)' },
        ],
      };
    case 'TRASH_EMAIL':
      return {
        title: 'Confirm Move Email to Trash',
        description: 'This will move the selected Gmail message to Trash.',
        confirmLabel: 'Move to Trash',
        isDestructive: true,
        details: [
          { label: 'Subject', value: action.subject },
          { label: 'From', value: action.from },
        ],
      };
    case 'UPLOAD_DRIVE_FILE':
      return {
        title: 'Confirm Upload to Google Drive',
        description: 'This will upload a new file into your Google Drive.',
        confirmLabel: 'Upload File',
        isDestructive: false,
        details: [
          { label: 'File Name', value: action.name },
          { label: 'MIME Type', value: action.mimeType },
          { label: 'Details', value: action.description },
        ],
      };
    case 'OVERWRITE_DRIVE_FILE':
      return {
        title: 'Confirm Overwrite Google Drive File',
        description: 'This will replace the existing content of this Google Drive file.',
        confirmLabel: 'Overwrite File',
        isDestructive: true,
        details: [
          { label: 'File Name', value: action.name },
          { label: 'Characters', value: String(action.content.length) },
        ],
      };
    case 'CREATE_DRIVE_FOLDER':
      return {
        title: 'Confirm Create Google Drive Folder',
        description: 'This will create a new folder in your Google Drive.',
        confirmLabel: 'Create Folder',
        isDestructive: false,
        details: [{ label: 'Folder Name', value: action.name }],
      };
    case 'RENAME_DRIVE_FILE':
      return {
        title: 'Confirm Rename Drive File',
        description: 'This will rename the selected file or folder in Google Drive.',
        confirmLabel: 'Rename',
        isDestructive: false,
        details: [
          { label: 'Current Name', value: action.oldName },
          { label: 'New Name', value: action.newName },
        ],
      };
    case 'TRASH_DRIVE_FILE':
      return {
        title: 'Confirm Move Drive File to Trash',
        description: 'This will move the selected file into your Google Drive Trash.',
        confirmLabel: 'Move to Trash',
        isDestructive: true,
        details: [{ label: 'File Name', value: action.name }],
      };
    case 'DELETE_DRIVE_FILE':
      return {
        title: 'Confirm Permanent Drive Deletion',
        description: 'This will permanently delete the file from Google Drive and cannot be undone.',
        confirmLabel: 'Delete Permanently',
        isDestructive: true,
        details: [{ label: 'File Name', value: action.name }],
      };
    case 'CREATE_GOOGLE_DOC':
      return {
        title: 'Confirm Create Google Doc',
        description: 'This will create a new Google Doc in your Google Drive with live ECU telemetry.',
        confirmLabel: 'Create Google Doc',
        isDestructive: false,
        details: [
          { label: 'Document Title', value: action.title },
          { label: 'Body Preview', value: action.bodyText.slice(0, 200) },
        ],
      };
    case 'APPEND_GOOGLE_DOC':
      return {
        title: 'Confirm Append to Google Doc',
        description: 'This will append live MNA ECU bench telemetry to the end of the selected Google Doc.',
        confirmLabel: 'Append Report',
        isDestructive: false,
        details: [
          { label: 'Document', value: action.title },
          { label: 'Text Length', value: `${action.textToAppend.length} chars` },
        ],
      };
    case 'REPLACE_GOOGLE_DOC':
      return {
        title: 'Confirm Replace Google Doc Body',
        description: 'This will overwrite the current text body of the selected Google Doc.',
        confirmLabel: 'Save Changes',
        isDestructive: true,
        details: [
          { label: 'Document', value: action.title },
          { label: 'Updated Length', value: `${action.newBodyText.length} chars` },
        ],
      };
    case 'TRASH_GOOGLE_DOC':
      return {
        title: 'Confirm Move Google Doc to Trash',
        description: 'This will move the selected Google Doc into your Google Drive Trash.',
        confirmLabel: 'Move to Trash',
        isDestructive: true,
        details: [{ label: 'Document', value: action.title }],
      };
    case 'CREATE_TASK_ITEM':
      return {
        title: 'Confirm Create Google Task',
        description: 'This will add a new repair/diagnostic task to your Google Tasks list.',
        confirmLabel: 'Create Task',
        isDestructive: false,
        details: [
          { label: 'Task List', value: action.taskListTitle },
          { label: 'Title', value: action.title },
          ...(action.dueIsoDate ? [{ label: 'Due Date', value: action.dueIsoDate }] : []),
        ],
      };
    case 'TOGGLE_TASK_STATUS':
      return {
        title: action.nextCompleted ? 'Confirm Mark Task Complete' : 'Confirm Reopen Task',
        description: `This will update the task status in Google Tasks to "${action.nextCompleted ? 'Completed' : 'Needs Action'}".`,
        confirmLabel: action.nextCompleted ? 'Mark Completed' : 'Reopen Task',
        isDestructive: false,
        details: [{ label: 'Task', value: action.taskTitle }],
      };
    case 'DELETE_TASK_ITEM':
      return {
        title: 'Confirm Delete Google Task',
        description: 'This will permanently delete the selected task from Google Tasks.',
        confirmLabel: 'Delete Task',
        isDestructive: true,
        details: [{ label: 'Task', value: action.taskTitle }],
      };
    case 'EXPORT_BENCH_TASKS':
      return {
        title: 'Confirm Export Checklist to Google Tasks',
        description: `This will create ${action.tasks.length} task item(s) in your selected Google Tasks list.`,
        confirmLabel: `Create ${action.tasks.length} Task(s)`,
        isDestructive: false,
        details: [
          { label: 'Target List', value: action.taskListTitle },
          {
            label: 'Items',
            value: action.tasks
              .slice(0, 4)
              .map((t) => `• ${t.title}`)
              .join('\n'),
          },
        ],
      };
    case 'POST_CLASSROOM_ANNOUNCEMENT':
      return {
        title: 'Confirm Post Google Classroom Announcement',
        description: 'This will publish a live announcement visible to everyone enrolled in the selected Google Classroom course.',
        confirmLabel: 'Publish Announcement',
        isDestructive: false,
        details: [
          { label: 'Course', value: action.courseName },
          { label: 'Announcement', value: action.text.slice(0, 240) },
        ],
      };
    case 'CREATE_CLASSROOM_ASSIGNMENT':
      return {
        title: 'Confirm Publish Google Classroom Assignment',
        description: 'This will create and publish a new coursework assignment in the selected Google Classroom course.',
        confirmLabel: 'Publish Assignment',
        isDestructive: false,
        details: [
          { label: 'Course', value: action.courseName },
          { label: 'Assignment Title', value: action.title },
          ...(action.maxPoints ? [{ label: 'Max Points', value: String(action.maxPoints) }] : []),
        ],
      };
    case 'APPEND_SHEET_TELEMETRY':
      return {
        title: 'Confirm Append to Google Sheet',
        description: 'This will append live bench telemetry rows to the selected sheet tab.',
        confirmLabel: 'Append Rows',
        isDestructive: false,
        details: [
          { label: 'Spreadsheet', value: action.spreadsheetTitle },
          { label: 'Sheet Tab', value: action.sheetTitle },
        ],
      };
    case 'TRASH_SPREADSHEET':
      return {
        title: 'Confirm Trash Spreadsheet',
        description: 'This will move the selected Google Sheet to Drive Trash.',
        confirmLabel: 'Move to Trash',
        isDestructive: true,
        details: [{ label: 'Spreadsheet', value: action.title }],
      };
    case 'APPEND_SLIDE_DECK':
      return {
        title: 'Confirm Append Slide',
        description: 'This will add a diagnostic summary slide to the selected presentation.',
        confirmLabel: 'Append Slide',
        isDestructive: false,
        details: [{ label: 'Presentation', value: action.presentationTitle }],
      };
    case 'TRASH_PRESENTATION':
      return {
        title: 'Confirm Trash Presentation',
        description: 'This will move the selected Google Slides deck to Drive Trash.',
        confirmLabel: 'Move to Trash',
        isDestructive: true,
        details: [{ label: 'Presentation', value: action.title }],
      };
    case 'DELETE_KEEP_NOTE':
      return {
        title: 'Confirm Delete Note',
        description: 'This will delete the selected note.',
        confirmLabel: 'Delete Note',
        isDestructive: true,
        details: [{ label: 'Note', value: action.noteTitle }],
      };
  }
}

interface WorkspaceActionConfirmDialogProps {
  action: PendingWorkspaceAction | null;
  isExecuting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const WorkspaceActionConfirmDialog: React.FC<WorkspaceActionConfirmDialogProps> = ({
  action,
  isExecuting,
  onCancel,
  onConfirm,
}) => {
  if (!action) return null;
  const summary = describePendingWorkspaceAction(action);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-confirm-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-950 shadow-2xl overflow-hidden text-slate-100">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2 min-w-0">
            {summary.isDestructive ? (
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <h3 id="workspace-confirm-title" className="text-sm font-bold text-white truncate">
              {summary.title}
            </h3>
          </div>
          <button
            type="button"
            disabled={isExecuting}
            onClick={onCancel}
            className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer"
            aria-label="Cancel confirmation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-300 leading-relaxed">{summary.description}</p>
          <div className="rounded-lg border border-slate-800 bg-slate-900/75 p-3 space-y-2 text-xs">
            {summary.details.map((item) => (
              <div key={item.label} className="space-y-0.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {item.label}
                </div>
                <div className="text-slate-200 whitespace-pre-wrap break-words font-mono text-[11px]">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/70 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isExecuting}
            onClick={onCancel}
            className="px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="workspace-confirm-execute-btn"
            disabled={isExecuting}
            onClick={onConfirm}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-60 ${
              summary.isDestructive
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isExecuting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{isExecuting ? 'Executing...' : summary.confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
