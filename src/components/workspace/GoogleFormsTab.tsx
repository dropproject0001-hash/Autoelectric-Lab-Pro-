/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useState } from 'react';
import {
  CheckSquare,
  ClipboardList,
  ExternalLink,
  FilePlus2,
  Inbox,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import type {
  GoogleFormDetail,
  GoogleFormDriveItem,
  GoogleFormQuestionDraft,
  GoogleFormResponseSummary,
} from '../../services/googleFormsService';
import type { PendingWorkspaceAction } from './workspaceTypes';
import { toSafeExternalHttpUrl } from '../../utils/safeExternalUrl';

type FormInspectorSection = 'QUESTIONS' | 'RESPONSES';

interface GoogleFormsTabProps {
  formsList: GoogleFormDriveItem[];
  formsLoading: boolean;
  formSearch: string;
  onChangeFormSearch: (val: string) => void;
  selectedForm: GoogleFormDetail | null;
  formResponses: GoogleFormResponseSummary[];
  formDetailLoading: boolean;
  isExecuting: boolean;
  defaultInspectionTemplate: {
    title: string;
    description: string;
    questions: GoogleFormQuestionDraft[];
  };
  onRefreshForms: (qOverride?: string) => void;
  onOpenForm: (item: GoogleFormDriveItem) => void;
  onRefreshResponses: (formId: string) => void;
  onSetPendingAction: (action: PendingWorkspaceAction) => void;
}

export const GoogleFormsTab: React.FC<GoogleFormsTabProps> = ({
  formsList,
  formsLoading,
  formSearch,
  onChangeFormSearch,
  selectedForm,
  formResponses,
  formDetailLoading,
  isExecuting,
  defaultInspectionTemplate,
  onRefreshForms,
  onOpenForm,
  onRefreshResponses,
  onSetPendingAction,
}) => {
  const [rightMode, setRightMode] = useState<'INSPECT' | 'CREATE'>('INSPECT');
  const [section, setSection] = useState<FormInspectorSection>('QUESTIONS');

  // Create Form state
  const [newFormTitle, setNewFormTitle] = useState(defaultInspectionTemplate.title);
  const [newFormDescription, setNewFormDescription] = useState(
    defaultInspectionTemplate.description
  );
  const [draftQuestions, setDraftQuestions] = useState<GoogleFormQuestionDraft[]>(
    defaultInspectionTemplate.questions
  );

  // Add single question to selected form state
  const [questionTitle, setQuestionTitle] = useState('');
  const [questionKind, setQuestionKind] =
    useState<GoogleFormQuestionDraft['kind']>('SHORT_TEXT');
  const [questionRequired, setQuestionRequired] = useState(true);
  const [questionOptionsText, setQuestionOptionsText] = useState(
    'Nominal (+12V within spec)\nVoltage drop detected\nOpen / Short circuit'
  );

  const handleLoadLiveTemplate = () => {
    setNewFormTitle(defaultInspectionTemplate.title);
    setNewFormDescription(defaultInspectionTemplate.description);
    setDraftQuestions(defaultInspectionTemplate.questions);
    setRightMode('CREATE');
  };

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 p-3 sm:p-4 overflow-y-auto lg:overflow-hidden">
      {/* Left: Google Forms List & Search */}
      <div className="lg:col-span-4 hud-panel rounded-[3px] flex flex-col min-h-[240px] lg:min-h-0 lg:overflow-hidden">
        <div className="p-3 border-b border-[#2b313c] space-y-2 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-violet-300 flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4" />
              <span>Google Forms</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="forms-new-btn"
                onClick={handleLoadLiveTemplate}
                className="hw-btn hw-btn-amber px-2 py-1 rounded-[2px] text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                title="Create new ECU Bench Inspection Google Form"
              >
                <FilePlus2 className="w-3 h-3" />
                <span>New Form</span>
              </button>
              <button
                type="button"
                onClick={() => onRefreshForms()}
                disabled={formsLoading}
                className="hw-btn p-1.5 rounded-[2px] text-slate-300 hover:text-white transition cursor-pointer"
                title="Refresh Google Forms"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${formsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onRefreshForms(formSearch);
            }}
            className="relative"
          >
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={formSearch}
              onChange={(e) => onChangeFormSearch(e.target.value)}
              placeholder="Search Google Forms..."
              className="hw-lcd-well w-full rounded-[2px] pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-400 font-sans"
            />
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 bg-[#101318]">
          {formsLoading && formsList.length === 0 ? (
            <div className="p-6 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
              <span>Loading Google Forms...</span>
            </div>
          ) : formsList.length === 0 ? (
            <div className="p-6 text-center space-y-2.5">
              <p className="text-xs text-slate-400 font-sans">
                No Google Forms found matching your filter.
              </p>
              <button
                type="button"
                onClick={handleLoadLiveTemplate}
                className="hw-btn hw-btn-amber px-3 py-1.5 rounded-[2px] text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create ECU Bench Inspection Form</span>
              </button>
            </div>
          ) : (
            formsList.map((item) => {
              const isSelected = rightMode === 'INSPECT' && selectedForm?.formId === item.id;
              const safeUrl = toSafeExternalHttpUrl(item.webViewLink);
              return (
                <div
                  key={item.id}
                  className={`rounded-[2px] border p-2.5 transition flex items-start justify-between gap-2 ${
                    isSelected
                      ? 'bg-[#191426] border-violet-500/70'
                      : 'bg-[#151920] border-[#2b313c] hover:border-[#4b5668]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setRightMode('INSPECT');
                      onOpenForm(item);
                    }}
                    className="flex-1 text-left min-w-0 cursor-pointer"
                  >
                    <div className="text-xs font-bold text-slate-100 truncate">{item.name}</div>
                    {item.modifiedTime && (
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                        Updated {new Date(item.modifiedTime).toLocaleString()}
                      </div>
                    )}
                  </button>
                  {safeUrl && (
                    <a
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hw-btn p-1 rounded-[2px] text-slate-400 hover:text-violet-300 transition shrink-0"
                      title="Open form in Google Forms"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Form Builder or Inspector + Responses */}
      <div className="lg:col-span-8 hud-panel rounded-[3px] flex flex-col min-h-[360px] lg:min-h-0 lg:overflow-hidden">
        {rightMode === 'CREATE' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newFormTitle.trim()) return;
              onSetPendingAction({
                kind: 'CREATE_GOOGLE_FORM',
                title: newFormTitle.trim(),
                description: newFormDescription.trim(),
                questions: draftQuestions,
              });
            }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="p-3 border-b border-[#2b313c] bg-[#12161d] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div>
                <h3 className="text-xs font-bold text-violet-200 uppercase tracking-wider">
                  Create ECU Bench Inspection Google Form
                </h3>
                <p className="text-[10px] text-slate-400">
                  Pre-populated from live MNA circuit &amp; DMM telemetry ({draftQuestions.length} questions)
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleLoadLiveTemplate}
                  className="hw-btn hw-btn-amber px-2.5 py-1 rounded-[2px] text-[10px] font-bold cursor-pointer"
                >
                  Sync Live ECU Telemetry
                </button>
                {selectedForm && (
                  <button
                    type="button"
                    onClick={() => setRightMode('INSPECT')}
                    className="hw-btn px-2.5 py-1 rounded-[2px] text-[10px] text-slate-300 hover:text-white cursor-pointer"
                  >
                    Back to Selected Form
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#101318]">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Form Title
                </label>
                <input
                  type="text"
                  value={newFormTitle}
                  onChange={(e) => setNewFormTitle(e.target.value)}
                  placeholder="ECU Bench Inspection Form..."
                  className="hw-lcd-well w-full rounded-[2px] px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Bench Telemetry Header &amp; Instructions
                </label>
                <textarea
                  rows={3}
                  value={newFormDescription}
                  onChange={(e) => setNewFormDescription(e.target.value)}
                  className="hw-lcd-well w-full rounded-[2px] p-2.5 text-xs text-slate-100 font-sans"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Included Inspection Questions ({draftQuestions.length})
                  </span>
                </div>
                {draftQuestions.map((q, idx) => (
                  <div
                    key={`${q.title}-${idx}`}
                    className="p-2.5 rounded-[2px] border border-[#262c36] bg-[#141820] space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-100">
                        {idx + 1}. {q.title}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/30 text-[9px] font-mono text-violet-300">
                          {q.kind}
                        </span>
                        {q.required && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-[9px] font-bold text-amber-300">
                            REQ
                          </span>
                        )}
                      </div>
                    </div>
                    {q.description && (
                      <p className="text-[10px] text-slate-400 font-sans">{q.description}</p>
                    )}
                    {q.options && q.options.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {q.options.map((opt) => (
                          <span
                            key={opt}
                            className="px-1.5 py-0.5 rounded bg-slate-800/80 text-[10px] text-slate-300"
                          >
                            • {opt}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 border-t border-[#2b313c] bg-[#12161d] flex items-center justify-end gap-2 shrink-0">
              <button
                type="submit"
                disabled={isExecuting || !newFormTitle.trim()}
                className="hw-btn hw-btn-green px-3.5 py-1.5 rounded-[2px] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                <span>Review &amp; Create Google Form</span>
              </button>
            </div>
          </form>
        ) : !selectedForm ? (
          <div className="m-auto p-8 text-center max-w-md space-y-3">
            <ClipboardList className="w-9 h-9 text-violet-400/70 mx-auto" />
            <h3 className="text-sm font-bold text-slate-100">
              Select a Google Form or Build an ECU Bench Form
            </h3>
            <p className="text-xs text-slate-400 font-sans leading-relaxed">
              Inspect existing form questions and live respondent submissions, add new diagnostic items, or generate a new ECU bench verification form synced with MNA telemetry.
            </p>
            <button
              type="button"
              onClick={handleLoadLiveTemplate}
              className="hw-btn hw-btn-amber px-3.5 py-2 rounded-[2px] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>Create ECU Bench Inspection Form</span>
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Selected Form Header */}
            <div className="p-3 border-b border-[#2b313c] bg-[#12161d] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-slate-100 truncate">{selectedForm.title}</h3>
                <p className="text-[10px] text-slate-400 truncate">
                  {selectedForm.items.length} item(s) · {formResponses.length} response(s) loaded
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSection('QUESTIONS')}
                  className={`hw-btn px-2.5 py-1 rounded-[2px] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                    section === 'QUESTIONS' ? 'hw-btn-green' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ListChecks className="w-3 h-3" />
                  <span>Questions</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSection('RESPONSES')}
                  className={`hw-btn px-2.5 py-1 rounded-[2px] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                    section === 'RESPONSES' ? 'hw-btn-green' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Inbox className="w-3 h-3" />
                  <span>Responses ({formResponses.length})</span>
                </button>
                {toSafeExternalHttpUrl(selectedForm.responderUri) && (
                  <a
                    href={toSafeExternalHttpUrl(selectedForm.responderUri)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hw-btn px-2.5 py-1 rounded-[2px] text-[11px] font-semibold text-violet-300 inline-flex items-center gap-1"
                  >
                    <span>Fill Form</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  type="button"
                  disabled={isExecuting}
                  onClick={() =>
                    onSetPendingAction({
                      kind: 'TRASH_GOOGLE_FORM',
                      formId: selectedForm.formId,
                      title: selectedForm.title,
                    })
                  }
                  className="hw-btn px-2 py-1 rounded-[2px] text-[11px] text-rose-300 hover:text-rose-200 inline-flex items-center gap-1 cursor-pointer"
                  title="Move Form to Google Drive Trash"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Trash</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#101318]">
              {formDetailLoading ? (
                <div className="p-8 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                  <span>Loading Google Form schema &amp; responses...</span>
                </div>
              ) : section === 'QUESTIONS' ? (
                <>
                  {selectedForm.description && (
                    <div className="p-2.5 rounded-[2px] border border-[#2b313c] bg-[#141820] text-[11px] text-slate-300 whitespace-pre-wrap font-sans">
                      {selectedForm.description}
                    </div>
                  )}

                  {/* Add Question Composer */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!questionTitle.trim()) return;
                      const options =
                        questionKind === 'MULTIPLE_CHOICE' || questionKind === 'CHECKBOXES'
                          ? questionOptionsText
                              .split('\n')
                              .map((s) => s.trim())
                              .filter(Boolean)
                          : undefined;
                      onSetPendingAction({
                        kind: 'ADD_FORM_QUESTION',
                        formId: selectedForm.formId,
                        formTitle: selectedForm.title,
                        insertIndex: selectedForm.items.length,
                        question: {
                          title: questionTitle.trim(),
                          kind: questionKind,
                          required: questionRequired,
                          options,
                        },
                      });
                    }}
                    className="p-3 rounded-[2px] border border-[#2b313c] bg-[#141922] space-y-2"
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wider text-violet-300 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Question to Form</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={questionTitle}
                        onChange={(e) => setQuestionTitle(e.target.value)}
                        placeholder="Question prompt (e.g., Pin 3 KL30 Voltage)..."
                        className="sm:col-span-2 hw-lcd-well rounded-[2px] px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500"
                      />
                      <select
                        value={questionKind}
                        onChange={(e) =>
                          setQuestionKind(e.target.value as GoogleFormQuestionDraft['kind'])
                        }
                        className="hw-lcd-well rounded-[2px] px-2.5 py-1.5 text-xs text-slate-100"
                      >
                        <option value="SHORT_TEXT">Short Answer</option>
                        <option value="PARAGRAPH">Paragraph</option>
                        <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                        <option value="CHECKBOXES">Checkboxes</option>
                      </select>
                    </div>

                    {(questionKind === 'MULTIPLE_CHOICE' || questionKind === 'CHECKBOXES') && (
                      <textarea
                        rows={2}
                        value={questionOptionsText}
                        onChange={(e) => setQuestionOptionsText(e.target.value)}
                        placeholder="One option per line..."
                        className="hw-lcd-well w-full rounded-[2px] p-2 text-xs text-slate-100 font-sans"
                      />
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={questionRequired}
                          onChange={(e) => setQuestionRequired(e.target.checked)}
                          className="rounded border-slate-600"
                        />
                        <span>Required response</span>
                      </label>
                      <button
                        type="submit"
                        disabled={isExecuting || !questionTitle.trim()}
                        className="hw-btn hw-btn-green px-3 py-1.5 rounded-[2px] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        <span>Review &amp; Add Question</span>
                      </button>
                    </div>
                  </form>

                  {/* Question List */}
                  {selectedForm.items.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      This Google Form has no question items yet. Add one above.
                    </div>
                  ) : (
                    selectedForm.items.map((item, idx) => (
                      <div
                        key={item.itemId}
                        className="p-3 rounded-[2px] border border-[#262c36] bg-[#141820] space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-xs font-bold text-slate-100">
                            {idx + 1}. {item.title}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] font-mono text-violet-300">
                              {item.kind}
                            </span>
                            {item.required && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-[9px] font-bold text-amber-300">
                                REQUIRED
                              </span>
                            )}
                          </div>
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-slate-400 font-sans">{item.description}</p>
                        )}
                        {item.options.length > 0 && (
                          <ul className="space-y-0.5 pl-3 text-[11px] text-slate-300 font-sans">
                            {item.options.map((opt) => (
                              <li key={opt}>• {opt}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Submitted Responses ({formResponses.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => onRefreshResponses(selectedForm.formId)}
                      className="hw-btn px-2.5 py-1 rounded-[2px] text-[10px] font-semibold text-slate-300 hover:text-white inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Refresh Responses</span>
                    </button>
                  </div>

                  {formResponses.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No submissions have been recorded for this Google Form yet.
                    </div>
                  ) : (
                    formResponses.map((resp) => (
                      <div
                        key={resp.responseId}
                        className="p-3 rounded-[2px] border border-[#262c36] bg-[#141820] space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 border-b border-[#232934] pb-1.5">
                          <span className="font-mono text-violet-300">
                            {resp.respondentEmail || `Submission ${resp.responseId.slice(0, 10)}`}
                          </span>
                          <span>
                            {resp.lastSubmittedTime || resp.createTime
                              ? new Date(
                                  resp.lastSubmittedTime || resp.createTime || ''
                                ).toLocaleString()
                              : 'Submitted'}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {resp.answers.map((ans) => (
                            <div key={ans.questionId} className="text-xs">
                              <div className="text-[10px] font-semibold text-slate-400">
                                {ans.questionTitle}
                              </div>
                              <div className="text-slate-100 font-sans">
                                {ans.values.join(', ') || '(No answer)'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
