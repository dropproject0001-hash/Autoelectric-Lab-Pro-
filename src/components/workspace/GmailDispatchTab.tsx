/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React from 'react';
import {
  Inbox,
  Mail,
  MailCheck,
  MailOpen,
  Paperclip,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import { GmailMessageDetail, GmailMessageSummary } from '../../services/gmailService';
import { GmailFilterBox, PendingWorkspaceAction } from './workspaceTypes';

interface GmailDispatchTabProps {
  gmailBox: GmailFilterBox;
  onSelectGmailBox: (box: GmailFilterBox) => void;
  gmailSearch: string;
  onChangeGmailSearch: (q: string) => void;
  gmailMessages: GmailMessageSummary[];
  gmailNextPageToken?: string;
  gmailLoading: boolean;
  selectedMessage: GmailMessageDetail | null;
  gmailDetailLoading: boolean;
  gmailRightMode: 'READER' | 'COMPOSE';
  onSwitchToCompose: () => void;
  composeTo: string;
  onChangeComposeTo: (val: string) => void;
  composeCc: string;
  onChangeComposeCc: (val: string) => void;
  composeSubject: string;
  onChangeComposeSubject: (val: string) => void;
  composeBody: string;
  onChangeComposeBody: (val: string) => void;
  isExecuting: boolean;
  onRefreshGmailMessages: (
    tokenOverride?: string,
    opts?: { box?: GmailFilterBox; q?: string; pageToken?: string; append?: boolean }
  ) => void;
  onOpenGmailMessage: (msg: GmailMessageSummary) => void;
  onToggleReadState: (msg: GmailMessageSummary) => void;
  onReplyToSelected: () => void;
  onPopulateMnaReportEmail: () => void;
  onSetPendingAction: (action: PendingWorkspaceAction) => void;
}

const GMAIL_BOXES: readonly { id: GmailFilterBox; label: string }[] = [
  { id: 'INBOX', label: 'Inbox' },
  { id: 'SENT', label: 'Sent' },
  { id: 'DRAFT', label: 'Drafts' },
  { id: 'STARRED', label: 'Starred' },
  { id: 'ALL', label: 'All Mail' },
];

export const GmailDispatchTab: React.FC<GmailDispatchTabProps> = ({
  gmailBox,
  onSelectGmailBox,
  gmailSearch,
  onChangeGmailSearch,
  gmailMessages,
  gmailNextPageToken,
  gmailLoading,
  selectedMessage,
  gmailDetailLoading,
  gmailRightMode,
  onSwitchToCompose,
  composeTo,
  onChangeComposeTo,
  composeCc,
  onChangeComposeCc,
  composeSubject,
  onChangeComposeSubject,
  composeBody,
  onChangeComposeBody,
  isExecuting,
  onRefreshGmailMessages,
  onOpenGmailMessage,
  onToggleReadState,
  onReplyToSelected,
  onPopulateMnaReportEmail,
  onSetPendingAction,
}) => {
  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 p-3 sm:p-4 overflow-y-auto lg:overflow-hidden">
      {/* Left: Mailbox & Search */}
      <div className="lg:col-span-5 hud-panel rounded-[3px] flex flex-col min-h-[240px] lg:min-h-0 lg:overflow-hidden">
        <div className="p-3 border-b border-[#2b313c] flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {GMAIL_BOXES.map((box) => (
                <button
                  key={box.id}
                  type="button"
                  onClick={() => onSelectGmailBox(box.id)}
                  className={`hw-btn px-2 py-1 rounded-[2px] text-[11px] font-bold transition ${
                    gmailBox === box.id
                      ? 'hw-btn-amber'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {box.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onSwitchToCompose}
                className="hw-btn hw-btn-green px-2 py-1 rounded-[2px] text-[11px] font-bold flex items-center gap-1 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Compose</span>
              </button>
              <button
                type="button"
                onClick={() => onRefreshGmailMessages()}
                disabled={gmailLoading}
                className="hw-btn p-1.5 rounded-[2px] text-slate-300 transition"
                title="Refresh Gmail"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${gmailLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onRefreshGmailMessages(undefined, { q: gmailSearch });
            }}
            className="flex gap-1.5"
          >
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={gmailSearch}
                onChange={(e) => onChangeGmailSearch(e.target.value)}
                placeholder="Search Gmail (subject, sender, DTC)..."
                className="hw-lcd-well w-full rounded-[2px] pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
              />
            </div>
            <button
              type="submit"
              className="hw-btn px-2.5 py-1.5 rounded-[2px] text-[11px] font-bold text-slate-200 transition"
            >
              Search
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1.5 bg-[#101318]">
          {gmailLoading && gmailMessages.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              Loading Gmail messages...
            </div>
          ) : gmailMessages.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 font-sans">
              No messages found in this mailbox view.
            </div>
          ) : (
            <>
              {gmailMessages.map((msg) => {
                const isSelected =
                  selectedMessage?.id === msg.id && gmailRightMode === 'READER';
                return (
                  <div
                    key={msg.id}
                    className={`rounded-[2px] border p-2.5 transition flex items-start justify-between gap-2 ${
                      isSelected
                        ? 'bg-[#1f180b] border-amber-500/70'
                        : 'bg-[#151920] border-[#2b313c] hover:border-[#4b5668]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenGmailMessage(msg)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex items-center gap-1.5">
                        {msg.isUnread && (
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                        )}
                        <span
                          className={`text-xs truncate ${
                            msg.isUnread
                              ? 'font-bold text-white'
                              : 'font-semibold text-slate-200'
                          }`}
                        >
                          {msg.subject}
                        </span>
                      </div>
                      <div className="text-[11px] text-amber-300/90 truncate mt-0.5 font-sans">
                        {msg.from}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5 font-sans">
                        {msg.snippet}
                      </div>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleReadState(msg)}
                        className="hw-btn p-1 rounded-[2px] text-slate-400 hover:text-amber-300 transition"
                        title={msg.isUnread ? 'Mark as Read' : 'Mark as Unread'}
                      >
                        {msg.isUnread ? (
                          <MailCheck className="w-3 h-3" />
                        ) : (
                          <MailOpen className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onSetPendingAction({
                            kind: 'TRASH_EMAIL',
                            messageId: msg.id,
                            subject: msg.subject,
                            from: msg.from,
                          })
                        }
                        className="hw-btn p-1 rounded-[2px] hover:border-rose-700 text-slate-400 hover:text-rose-300 transition"
                        title="Move to Trash"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {gmailNextPageToken && (
                <button
                  type="button"
                  disabled={gmailLoading}
                  onClick={() =>
                    onRefreshGmailMessages(undefined, {
                      pageToken: gmailNextPageToken,
                      append: true,
                    })
                  }
                  className="hw-btn mt-1 py-2 rounded-[2px] text-xs text-amber-300 font-bold transition"
                >
                  {gmailLoading ? 'Loading...' : 'Load More Messages'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right: Message Reader or Compose Report */}
      <div className="lg:col-span-7 hud-panel rounded-[3px] flex flex-col min-h-[420px] lg:min-h-0 lg:overflow-hidden">
        {gmailRightMode === 'READER' ? (
          gmailDetailLoading ? (
            <div className="m-auto text-xs text-slate-400">
              Decoding Gmail message...
            </div>
          ) : !selectedMessage ? (
            <div className="m-auto flex flex-col items-center gap-2 text-slate-400 p-6 text-center">
              <Inbox className="w-9 h-9 text-amber-500/50" />
              <p className="text-xs font-bold text-slate-200">
                Select an email on the left or compose a new diagnostic email
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-3.5 border-b border-[#2b313c] flex flex-wrap items-start justify-between gap-2 shrink-0">
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="text-sm font-bold text-slate-100">
                    {selectedMessage.subject}
                  </h3>
                  <div className="text-[11px] text-slate-300 font-sans">
                    <span className="text-slate-500">From:</span> {selectedMessage.from}
                  </div>
                  {selectedMessage.to && (
                    <div className="text-[11px] text-slate-400 font-sans">
                      <span className="text-slate-500">To:</span> {selectedMessage.to}
                    </div>
                  )}
                  {selectedMessage.date && (
                    <div className="text-[10px] text-slate-500">
                      {selectedMessage.date}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={onReplyToSelected}
                    className="hw-btn hw-btn-amber px-2.5 py-1.5 rounded-[2px] text-[11px] font-bold flex items-center gap-1 transition"
                  >
                    <Reply className="w-3.5 h-3.5" />
                    <span>Reply</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onSetPendingAction({
                        kind: 'TRASH_EMAIL',
                        messageId: selectedMessage.id,
                        subject: selectedMessage.subject,
                        from: selectedMessage.from,
                      })
                    }
                    className="hw-btn px-2.5 py-1.5 rounded-[2px] border-rose-700/70 hover:bg-rose-950/70 text-rose-200 text-[11px] font-bold flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Trash</span>
                  </button>
                </div>
              </div>

              {selectedMessage.attachments.length > 0 && (
                <div className="px-3.5 py-2 border-b border-[#2b313c] bg-[#12161d] flex flex-wrap gap-1.5 shrink-0">
                  {selectedMessage.attachments.map((att) => (
                    <span
                      key={att.attachmentId}
                      className="hw-lcd-well px-2 py-1 rounded-[2px] text-[11px] text-slate-300 flex items-center gap-1"
                    >
                      <Paperclip className="w-3 h-3 text-amber-400" />
                      <span>{att.filename}</span>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 bg-[#101318]">
                <pre className="text-xs text-slate-200 font-sans whitespace-pre-wrap leading-relaxed">
                  {selectedMessage.bodyText}
                </pre>
              </div>
            </div>
          )
        ) : (
          /* COMPOSE FORM */
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!composeTo.trim()) return;
              onSetPendingAction({
                kind: 'SEND_EMAIL',
                to: composeTo.trim(),
                cc: composeCc.trim(),
                subject: composeSubject.trim(),
                bodyText: composeBody,
              });
            }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="p-3.5 border-b border-[#2b313c] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div>
                <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
                  <Mail className="w-4 h-4" />
                  <span>Compose Diagnostic Email</span>
                </h3>
                <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                  Send repair summaries or attach live MNA ECU telemetry directly via Gmail
                </p>
              </div>

              <button
                type="button"
                onClick={onPopulateMnaReportEmail}
                className="hw-btn hw-btn-green px-2.5 py-1.5 rounded-[2px] text-[11px] font-bold transition"
              >
                Insert Live MNA Bench Report
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-2.5 bg-[#101318]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 uppercase">
                    To (Recipient Email) *
                  </label>
                  <input
                    type="email"
                    required
                    value={composeTo}
                    onChange={(e) => onChangeComposeTo(e.target.value)}
                    placeholder="technician@workshop.com"
                    className="hw-lcd-well rounded-[2px] px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 uppercase">
                    Cc (Optional)
                  </label>
                  <input
                    type="text"
                    value={composeCc}
                    onChange={(e) => onChangeComposeCc(e.target.value)}
                    placeholder="service-advisor@workshop.com"
                    className="hw-lcd-well rounded-[2px] px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-400 uppercase">Subject</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => onChangeComposeSubject(e.target.value)}
                  placeholder="ECU Diagnostic Summary / DTC Findings"
                  className="hw-lcd-well rounded-[2px] px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
                />
              </div>

              <div className="flex flex-col gap-1 flex-1 min-h-[220px]">
                <label className="text-[10px] text-slate-400 uppercase">Message Body</label>
                <textarea
                  value={composeBody}
                  onChange={(e) => onChangeComposeBody(e.target.value)}
                  placeholder="Write your diagnostic notes or click 'Insert Live MNA Bench Report' above..."
                  className="hw-lcd-well flex-1 rounded-[2px] p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono resize-none"
                />
              </div>
            </div>

            <div className="p-3 border-t border-[#2b313c] bg-[#12161d] flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                disabled={isExecuting || (!composeSubject.trim() && !composeBody.trim())}
                onClick={() =>
                  onSetPendingAction({
                    kind: 'SAVE_DRAFT',
                    to: composeTo.trim(),
                    cc: composeCc.trim(),
                    subject: composeSubject.trim(),
                    bodyText: composeBody,
                  })
                }
                className="hw-btn px-3.5 py-2 disabled:opacity-40 text-slate-200 font-bold text-xs rounded-[2px] transition"
              >
                Save Draft
              </button>
              <button
                type="submit"
                disabled={isExecuting || !composeTo.trim()}
                className="hw-btn hw-btn-amber px-4 py-2 disabled:opacity-40 font-bold text-xs rounded-[2px] flex items-center gap-1.5 transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Review &amp; Send Email</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
