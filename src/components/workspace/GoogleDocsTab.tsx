/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useState } from 'react';
import {
  ExternalLink,
  FilePlus2,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import type { GoogleDriveDocItem, ParsedGoogleDoc } from '../../services/googleDocsService';
import type { PendingWorkspaceAction } from './workspaceTypes';
import { toSafeExternalHttpUrl } from '../../utils/safeExternalUrl';

interface GoogleDocsTabProps {
  docsList: GoogleDriveDocItem[];
  docsLoading: boolean;
  docSearch: string;
  onChangeDocSearch: (q: string) => void;
  selectedDoc: ParsedGoogleDoc | null;
  docDetailLoading: boolean;
  docEditableBody: string;
  onChangeDocEditableBody: (text: string) => void;
  defaultNewTitle: string;
  liveReportBody: string;
  isExecuting: boolean;
  onRefreshDocs: (qOverride?: string) => void;
  onOpenDoc: (item: GoogleDriveDocItem) => void;
  onSetPendingAction: (action: PendingWorkspaceAction) => void;
}

export const GoogleDocsTab: React.FC<GoogleDocsTabProps> = ({
  docsList,
  docsLoading,
  docSearch,
  onChangeDocSearch,
  selectedDoc,
  docDetailLoading,
  docEditableBody,
  onChangeDocEditableBody,
  defaultNewTitle,
  liveReportBody,
  isExecuting,
  onRefreshDocs,
  onOpenDoc,
  onSetPendingAction,
}) => {
  const [newDocTitle, setNewDocTitle] = useState(defaultNewTitle);

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 p-3 sm:p-4 overflow-y-auto lg:overflow-hidden">
      {/* Left: Create & List Google Docs */}
      <div className="lg:col-span-5 hud-panel rounded-[3px] flex flex-col min-h-[260px] lg:min-h-0 lg:overflow-hidden">
        <div className="p-3 border-b border-[#2b313c] space-y-2.5 shrink-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
            Create Google Doc from Live MNA Bench
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newDocTitle}
              onChange={(e) => setNewDocTitle(e.target.value)}
              placeholder="Google Doc title..."
              className="hw-lcd-well flex-1 min-w-0 rounded-[2px] px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500 font-sans"
            />
            <button
              type="button"
              disabled={isExecuting}
              onClick={() =>
                onSetPendingAction({
                  kind: 'CREATE_GOOGLE_DOC',
                  title: newDocTitle.trim() || defaultNewTitle,
                  bodyText: liveReportBody,
                })
              }
              className="hw-btn hw-btn-green px-2.5 py-1.5 rounded-[2px] text-[11px] font-bold flex items-center gap-1 shrink-0 disabled:opacity-50 cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>Create Doc</span>
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onRefreshDocs(docSearch);
            }}
            className="flex gap-1.5"
          >
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={docSearch}
                onChange={(e) => onChangeDocSearch(e.target.value)}
                placeholder="Search your Google Docs..."
                className="hw-lcd-well w-full rounded-[2px] pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 font-sans"
              />
            </div>
            <button
              type="submit"
              className="hw-btn px-2.5 py-1.5 rounded-[2px] text-[11px] font-bold text-slate-200 cursor-pointer"
            >
              Find
            </button>
            <button
              type="button"
              onClick={() => onRefreshDocs()}
              disabled={docsLoading}
              className="hw-btn p-1.5 rounded-[2px] text-slate-300 hover:text-white cursor-pointer"
              title="Refresh Google Docs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${docsLoading ? 'animate-spin' : ''}`} />
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 bg-[#101318]">
          {docsLoading && docsList.length === 0 ? (
            <div className="p-6 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
              <span>Loading Google Docs...</span>
            </div>
          ) : docsList.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 font-sans">
              No Google Docs matched. Click <strong>Create Doc</strong> above to publish your live ECU bench report directly to Google Docs.
            </div>
          ) : (
            docsList.map((docItem) => {
              const isSelected = selectedDoc?.documentId === docItem.id;
              const safeUrl = toSafeExternalHttpUrl(docItem.webViewLink);
              return (
                <div
                  key={docItem.id}
                  className={`rounded-[2px] border p-2.5 transition flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-[#0c1824] border-sky-500/70'
                      : 'bg-[#151920] border-[#2b313c] hover:border-[#4b5668]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onOpenDoc(docItem)}
                    className="flex items-center gap-2 flex-1 text-left min-w-0 cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-100 truncate">
                        {docItem.name}
                      </div>
                      {docItem.modifiedTime && (
                        <div className="text-[10px] text-slate-400 truncate">
                          Updated {new Date(docItem.modifiedTime).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {safeUrl && (
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hw-btn p-1 rounded-[2px] text-slate-400 hover:text-sky-300"
                        title="Open in Google Docs"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        onSetPendingAction({
                          kind: 'TRASH_GOOGLE_DOC',
                          documentId: docItem.id,
                          title: docItem.name,
                        })
                      }
                      className="hw-btn p-1 rounded-[2px] hover:border-rose-700 text-slate-400 hover:text-rose-300 cursor-pointer"
                      title="Move Google Doc to Trash"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Google Doc Reader & Editor */}
      <div className="lg:col-span-7 hud-panel rounded-[3px] flex flex-col min-h-[340px] lg:min-h-0 lg:overflow-hidden">
        {docDetailLoading ? (
          <div className="m-auto flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
            <span>Loading Google Doc content...</span>
          </div>
        ) : !selectedDoc ? (
          <div className="m-auto p-8 text-center max-w-md space-y-2">
            <FileText className="w-9 h-9 text-sky-400/60 mx-auto" />
            <h3 className="text-sm font-bold text-slate-100">
              Select or Create a Google Doc
            </h3>
            <p className="text-xs text-slate-400 font-sans">
              Inspect live Google Docs content, append timestamped MNA telemetry snapshots, or edit and save changes back to Google Docs with explicit confirmation.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2b313c] bg-[#12161d] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-bold text-slate-100 truncate">{selectedDoc.title}</h3>
                <p className="text-[10px] text-slate-400">
                  {selectedDoc.blocks.length} structural block(s) · Live Google Docs API v1
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={isExecuting}
                  onClick={() =>
                    onSetPendingAction({
                      kind: 'APPEND_GOOGLE_DOC',
                      documentId: selectedDoc.documentId,
                      title: selectedDoc.title,
                      textToAppend: liveReportBody,
                    })
                  }
                  className="hw-btn hw-btn-amber px-2.5 py-1 rounded-[2px] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Append Live MNA Report</span>
                </button>
                <a
                  href={`https://docs.google.com/document/d/${encodeURIComponent(selectedDoc.documentId)}/edit`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hw-btn px-2.5 py-1 rounded-[2px] text-[11px] text-sky-300 flex items-center gap-1"
                >
                  <span>Open in Docs</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <div className="flex-1 overflow-hidden p-3.5 flex flex-col gap-2.5 bg-[#101318]">
              <textarea
                value={docEditableBody}
                onChange={(e) => onChangeDocEditableBody(e.target.value)}
                className="hw-lcd-well flex-1 rounded-[2px] p-3 text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-sky-500 resize-none"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-400">
                  Editing replaces body text upon confirmation
                </span>
                <button
                  type="button"
                  disabled={isExecuting || docEditableBody === selectedDoc.plainText}
                  onClick={() =>
                    onSetPendingAction({
                      kind: 'REPLACE_GOOGLE_DOC',
                      documentId: selectedDoc.documentId,
                      title: selectedDoc.title,
                      newBodyText: docEditableBody,
                    })
                  }
                  className="hw-btn hw-btn-green px-3.5 py-1.5 rounded-[2px] disabled:opacity-40 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Review &amp; Save to Google Docs</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
