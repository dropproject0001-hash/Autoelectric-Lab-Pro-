/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useRef } from 'react';
import {
  ChevronRight,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Folder,
  FolderPlus,
  FolderSearch,
  HardDrive,
  Image as ImageIcon,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  DRIVE_FOLDER_MIME,
  DriveBenchSnapshot,
  DriveFileItem,
  DriveMimeFilter,
  formatDriveFileSize,
} from '../../services/googleDriveService';
import { PendingWorkspaceAction, WorkspaceStatusBanner } from './workspaceTypes';
import { toSafeExternalHttpUrl } from '../../utils/safeExternalUrl';

interface GoogleDriveTabProps {
  driveFiles: DriveFileItem[];
  driveNextPageToken?: string;
  driveLoading: boolean;
  driveSearch: string;
  onChangeDriveSearch: (q: string) => void;
  driveFilter: DriveMimeFilter;
  onChangeDriveFilter: (filter: DriveMimeFilter) => void;
  folderTrail: { id: string; name: string }[];
  onNavigateBreadcrumb: (idx: number, folderId: string) => void;
  selectedDriveFile: DriveFileItem | null;
  drivePreviewText: string;
  drivePreviewImageUrl: string | null;
  driveEditableText: string;
  onChangeDriveEditableText: (text: string) => void;
  driveFileLoading: boolean;
  driveParsedSnapshot: DriveBenchSnapshot | null;
  renameDraft: string;
  onChangeRenameDraft: (name: string) => void;
  newFolderName: string;
  onChangeNewFolderName: (name: string) => void;
  showNewFolderInput: boolean;
  onToggleNewFolderInput: () => void;
  isExecuting: boolean;
  selectedIsEditableText: boolean;
  currentFolderId: string;
  onRefreshDriveFiles: (
    tokenOverride?: string,
    opts?: { folderId?: string; q?: string; filter?: DriveMimeFilter; pageToken?: string; append?: boolean }
  ) => void;
  onInspectDriveFile: (file: DriveFileItem) => void;
  onDownloadSelectedDriveFile: () => void;
  onStageBenchSnapshotUpload: () => void;
  onStageReportTxtUpload: () => void;
  onLocalFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenGooglePicker?: () => void;
  isPickerOpening?: boolean;
  onSetPendingAction: (action: PendingWorkspaceAction) => void;
  onLoadBenchSnapshot?: (snapshot: DriveBenchSnapshot) => void;
  onSetStatusBanner: (banner: WorkspaceStatusBanner | null) => void;
}

export const GoogleDriveTab: React.FC<GoogleDriveTabProps> = ({
  driveFiles,
  driveNextPageToken,
  driveLoading,
  driveSearch,
  onChangeDriveSearch,
  driveFilter,
  onChangeDriveFilter,
  folderTrail,
  onNavigateBreadcrumb,
  selectedDriveFile,
  drivePreviewText,
  drivePreviewImageUrl,
  driveEditableText,
  onChangeDriveEditableText,
  driveFileLoading,
  driveParsedSnapshot,
  renameDraft,
  onChangeRenameDraft,
  newFolderName,
  onChangeNewFolderName,
  showNewFolderInput,
  onToggleNewFolderInput,
  isExecuting,
  selectedIsEditableText,
  currentFolderId,
  onRefreshDriveFiles,
  onInspectDriveFile,
  onDownloadSelectedDriveFile,
  onStageBenchSnapshotUpload,
  onStageReportTxtUpload,
  onLocalFileSelected,
  onOpenGooglePicker,
  isPickerOpening = false,
  onSetPendingAction,
  onLoadBenchSnapshot,
  onSetStatusBanner,
}) => {
  const uploadInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 p-3 sm:p-4 overflow-y-auto lg:overflow-hidden">
      {/* Left: Drive Explorer */}
      <div className="lg:col-span-6 hud-panel rounded-[3px] flex flex-col min-h-[260px] lg:min-h-0 lg:overflow-hidden">
        {/* Quick Action Bar */}
        <div className="p-3 border-b border-[#2b313c] flex flex-col gap-2.5 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-xs overflow-x-auto scrollbar-none">
              {folderTrail.map((crumb, idx) => (
                <React.Fragment key={crumb.id}>
                  {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />}
                  <button
                    type="button"
                    onClick={() => onNavigateBreadcrumb(idx, crumb.id)}
                    className={`px-1.5 py-0.5 rounded-[2px] truncate max-w-[120px] ${
                      idx === folderTrail.length - 1
                        ? 'text-emerald-300 font-bold bg-[#0c1a12] border border-emerald-700/60'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onRefreshDriveFiles()}
              disabled={driveLoading}
              className="hw-btn p-1.5 rounded-[2px] text-slate-300 transition"
              title="Refresh Drive list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${driveLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Search & Filter */}
          <div className="flex flex-wrap gap-1.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onRefreshDriveFiles(undefined, { q: driveSearch });
              }}
              className="flex flex-1 min-w-[180px] gap-1.5"
            >
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={driveSearch}
                  onChange={(e) => onChangeDriveSearch(e.target.value)}
                  placeholder="Search Google Drive files..."
                  className="hw-lcd-well w-full rounded-[2px] pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>
              <button
                type="submit"
                className="hw-btn px-2.5 py-1.5 rounded-[2px] text-[11px] font-bold text-slate-200 transition"
              >
                Find
              </button>
            </form>

            <select
              value={driveFilter}
              onChange={(e) => {
                const nextFilter = e.target.value as DriveMimeFilter;
                onChangeDriveFilter(nextFilter);
                onRefreshDriveFiles(undefined, { filter: nextFilter });
              }}
              aria-label="Filter Google Drive file type"
              className="hw-lcd-well rounded-[2px] px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">All Files</option>
              <option value="FOLDERS">Folders</option>
              <option value="JSON">Bench JSON</option>
              <option value="DOCS">Docs & Text</option>
              <option value="IMAGES">Images / PCB</option>
              <option value="PDF">PDF Manuals</option>
            </select>
          </div>

          {/* Upload / Export Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={onStageBenchSnapshotUpload}
              className="hw-btn hw-btn-green px-2.5 py-1.5 rounded-[2px] text-[11px] font-bold flex items-center gap-1 transition"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>Save Bench JSON</span>
            </button>
            <button
              type="button"
              onClick={onStageReportTxtUpload}
              className="hw-btn hw-btn-amber px-2.5 py-1.5 rounded-[2px] text-[11px] font-bold flex items-center gap-1 transition"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Save Report (.txt)</span>
            </button>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className="hw-btn px-2.5 py-1.5 rounded-[2px] text-slate-200 text-[11px] font-bold flex items-center gap-1 transition"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload File</span>
            </button>
            <input
              ref={uploadInputRef}
              type="file"
              onChange={onLocalFileSelected}
              className="hidden"
            />
            {onOpenGooglePicker && (
              <button
                type="button"
                data-testid="google-drive-picker-btn"
                disabled={isPickerOpening}
                onClick={onOpenGooglePicker}
                className="hw-btn border-sky-500/60 bg-sky-950/50 hover:bg-sky-900/50 text-sky-200 px-2.5 py-1.5 rounded-[2px] text-[11px] font-bold flex items-center gap-1 transition disabled:opacity-50 cursor-pointer"
                title="Select a file directly via Google Picker"
              >
                <FolderSearch className="w-3.5 h-3.5" />
                <span>{isPickerOpening ? 'Opening Picker...' : 'Google Picker'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onToggleNewFolderInput}
              className="hw-btn px-2.5 py-1.5 rounded-[2px] text-slate-200 text-[11px] font-bold flex items-center gap-1 transition"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>New Folder</span>
            </button>
          </div>

          {showNewFolderInput && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newFolderName.trim()) return;
                onSetPendingAction({
                  kind: 'CREATE_DRIVE_FOLDER',
                  name: newFolderName.trim(),
                  parentId: currentFolderId,
                });
              }}
              className="flex gap-1.5 pt-1"
            >
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => onChangeNewFolderName(e.target.value)}
                placeholder="New Drive folder name..."
                className="hw-lcd-well flex-1 rounded-[2px] px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-sans"
              />
              <button
                type="submit"
                disabled={!newFolderName.trim()}
                className="hw-btn hw-btn-green px-3 py-1 disabled:opacity-50 rounded-[2px] text-[11px] font-bold"
              >
                Create
              </button>
            </form>
          )}
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1.5 bg-[#101318]">
          {driveLoading && driveFiles.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              Loading files from Google Drive...
            </div>
          ) : driveFiles.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 font-sans">
              No matching files found in this Google Drive view.
            </div>
          ) : (
            <>
              {driveFiles.map((file) => {
                const isFolder = file.mimeType === DRIVE_FOLDER_MIME;
                const isImage = file.mimeType.startsWith('image/');
                const isSelected = selectedDriveFile?.id === file.id;

                return (
                  <div
                    key={file.id}
                    className={`rounded-[2px] border p-2.5 transition flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-[#0e1a13] border-emerald-500/70'
                        : 'bg-[#151920] border-[#2b313c] hover:border-[#4b5668]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onInspectDriveFile(file)}
                      className="flex items-center gap-2.5 flex-1 text-left min-w-0"
                    >
                      {isFolder ? (
                        <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                      ) : isImage ? (
                        <ImageIcon className="w-4 h-4 text-amber-300 shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-100 truncate">
                          {file.name}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate tabular-nums">
                          {isFolder ? 'Folder' : formatDriveFileSize(file.size)}
                          {file.modifiedTime
                            ? ` · ${new Date(file.modifiedTime).toLocaleDateString()}`
                            : ''}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      {(() => {
                        const safeLink = toSafeExternalHttpUrl(file.webViewLink);
                        return safeLink ? (
                          <a
                            href={safeLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hw-btn p-1 rounded-[2px] text-slate-400 hover:text-emerald-300 transition"
                            title="Open in Google Drive"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : null;
                      })()}
                      <button
                        type="button"
                        onClick={() =>
                          onSetPendingAction({
                            kind: 'TRASH_DRIVE_FILE',
                            fileId: file.id,
                            name: file.name,
                          })
                        }
                        className="hw-btn p-1 rounded-[2px] hover:border-rose-700 text-slate-400 hover:text-rose-300 transition"
                        title="Move to Drive Trash"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {driveNextPageToken && (
                <button
                  type="button"
                  disabled={driveLoading}
                  onClick={() =>
                    onRefreshDriveFiles(undefined, {
                      pageToken: driveNextPageToken,
                      append: true,
                    })
                  }
                  className="hw-btn mt-1 py-2 rounded-[2px] text-xs text-emerald-300 font-bold transition"
                >
                  {driveLoading ? 'Loading...' : 'Load More Drive Files'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right: Drive File Inspector / Preview / Bench Restore */}
      <div className="lg:col-span-6 hud-panel rounded-[3px] flex flex-col min-h-[320px] lg:min-h-0 lg:overflow-hidden">
        {!selectedDriveFile ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-2 text-slate-400">
            <HardDrive className="w-10 h-10 text-emerald-500/50" />
            <p className="text-xs font-bold text-slate-200">
              Select a Google Drive file to inspect, preview, or manage
            </p>
            <p className="text-[11px] font-sans max-w-sm">
              You can save live AutoElectric bench snapshots (.json, including workflow checks &amp; voice macros) or diagnostic reports (.txt) to Drive, preview images, edit text files, or restore saved bench JSON configs back into the lab.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3.5 border-b border-[#2b313c] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-bold text-slate-100 truncate">
                  {selectedDriveFile.name}
                </h3>
                <p className="text-[10px] text-slate-400 truncate tabular-nums">
                  {selectedDriveFile.mimeType} ·{' '}
                  {formatDriveFileSize(selectedDriveFile.size)}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                {!selectedDriveFile.mimeType.startsWith('application/vnd.google-apps.') && (
                  <button
                    type="button"
                    onClick={onDownloadSelectedDriveFile}
                    className="hw-btn px-2.5 py-1.5 rounded-[2px] text-slate-200 text-[11px] font-bold flex items-center gap-1 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                )}
                {(() => {
                  const safeLink = toSafeExternalHttpUrl(selectedDriveFile.webViewLink);
                  return safeLink ? (
                    <a
                      href={safeLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hw-btn hw-btn-green px-2.5 py-1.5 rounded-[2px] text-[11px] font-bold flex items-center gap-1 transition"
                    >
                      <span>Drive</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : null;
                })()}
              </div>
            </div>

            {/* Rename & Delete Banner */}
            <div className="px-3.5 py-2.5 border-b border-[#2b313c] bg-[#12161d] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!renameDraft.trim() || renameDraft.trim() === selectedDriveFile.name) {
                    return;
                  }
                  onSetPendingAction({
                    kind: 'RENAME_DRIVE_FILE',
                    fileId: selectedDriveFile.id,
                    oldName: selectedDriveFile.name,
                    newName: renameDraft.trim(),
                  });
                }}
                className="flex items-center gap-1.5 flex-1 min-w-[200px]"
              >
                <input
                  type="text"
                  value={renameDraft}
                  onChange={(e) => onChangeRenameDraft(e.target.value)}
                  className="hw-lcd-well flex-1 rounded-[2px] px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-sans"
                />
                <button
                  type="submit"
                  disabled={!renameDraft.trim() || renameDraft.trim() === selectedDriveFile.name}
                  className="hw-btn px-2.5 py-1 rounded-[2px] disabled:opacity-40 text-slate-200 text-[11px] font-bold flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Rename</span>
                </button>
              </form>

              <button
                type="button"
                onClick={() =>
                  onSetPendingAction({
                    kind: 'DELETE_DRIVE_FILE',
                    fileId: selectedDriveFile.id,
                    name: selectedDriveFile.name,
                  })
                }
                className="hw-btn px-2.5 py-1 rounded-[2px] border-rose-700/70 hover:bg-rose-950/70 text-rose-200 text-[11px] font-bold flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete Forever</span>
              </button>
            </div>

            {driveParsedSnapshot && onLoadBenchSnapshot && (
              <div className="mx-3.5 mt-3 p-2.5 rounded-[2px] bg-[#1c1507] border border-amber-500/60 flex items-center justify-between gap-2 shrink-0">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-amber-300">
                    AutoElectric Bench Snapshot Detected
                  </div>
                  <div className="text-[11px] text-amber-200/80 font-sans truncate tabular-nums">
                    {driveParsedSnapshot.ecuProfileLabel} · {driveParsedSnapshot.faults.length}{' '}
                    fault(s) · {driveParsedSnapshot.wires.length} wire(s)
                    {Array.isArray(driveParsedSnapshot.workflowCheckedIds)
                      ? ` · ${driveParsedSnapshot.workflowCheckedIds.length} workflow step(s)`
                      : ''}
                    {Array.isArray(driveParsedSnapshot.voiceMacros)
                      ? ` · ${driveParsedSnapshot.voiceMacros.length} voice macro(s)`
                      : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onLoadBenchSnapshot(driveParsedSnapshot);
                    onSetStatusBanner({
                      type: 'success',
                      text: `Loaded Drive snapshot "${selectedDriveFile.name}" into the live ECU bench.`,
                    });
                  }}
                  className="hw-btn hw-btn-amber px-3 py-1.5 rounded-[2px] text-xs font-bold shrink-0 transition"
                >
                  Load into Bench
                </button>
              </div>
            )}

            {/* Preview / Editor Body */}
            <div className="flex-1 overflow-hidden p-3.5 flex flex-col gap-2 bg-[#101318]">
              {driveFileLoading ? (
                <div className="m-auto text-xs text-slate-400">
                  Downloading preview from Google Drive...
                </div>
              ) : drivePreviewImageUrl ? (
                <div className="hw-lcd-well flex-1 flex items-center justify-center rounded-[2px] p-3 overflow-hidden">
                  <img
                    src={drivePreviewImageUrl}
                    alt={selectedDriveFile.name}
                    className="max-w-full max-h-full object-contain rounded-[2px]"
                  />
                </div>
              ) : selectedIsEditableText ? (
                <>
                  <textarea
                    value={driveEditableText}
                    onChange={(e) => onChangeDriveEditableText(e.target.value)}
                    className="hw-lcd-well flex-1 rounded-[2px] p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500 resize-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={isExecuting || driveEditableText === drivePreviewText}
                      onClick={() =>
                        onSetPendingAction({
                          kind: 'OVERWRITE_DRIVE_FILE',
                          fileId: selectedDriveFile.id,
                          name: selectedDriveFile.name,
                          mimeType: selectedDriveFile.mimeType || 'text/plain',
                          content: driveEditableText,
                        })
                      }
                      className="hw-btn hw-btn-amber px-3.5 py-1.5 rounded-[2px] disabled:opacity-40 text-xs font-bold transition"
                    >
                      Review &amp; Save Changes to Drive
                    </button>
                  </div>
                </>
              ) : drivePreviewText ? (
                <pre className="hw-lcd-well flex-1 overflow-y-auto rounded-[2px] p-3 text-xs text-slate-300 font-mono whitespace-pre-wrap">
                  {drivePreviewText}
                </pre>
              ) : (
                <div className="m-auto text-center text-xs text-slate-400 font-sans">
                  Binary or previewless file ({selectedDriveFile.mimeType}). Use Download or open directly in Google Drive.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
