import React, { useState } from 'react';
import {
  Check,
  CheckSquare,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  Loader2,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
} from 'lucide-react';
import {
  buildBenchVerificationTasks,
  GoogleKeepNoteItem,
  GoogleSheetDriveItem,
  GoogleSlideDriveItem,
  GoogleTaskItem,
  GoogleTaskList,
  ParsedPresentation,
  SpreadsheetMetadata,
  WorkspaceBenchTelemetryInput,
} from '../../services/googleSheetsSlidesTasksKeepService';
import { PendingWorkspaceAction } from './workspaceTypes';

// ============================================================================
// 1. GOOGLE SHEETS TAB
// ============================================================================

interface GoogleSheetsTabProps {
  sheetsList: GoogleSheetDriveItem[];
  sheetsLoading: boolean;
  sheetSearch: string;
  onChangeSheetSearch: (q: string) => void;
  selectedSpreadsheet: SpreadsheetMetadata | null;
  selectedSheetTabTitle: string;
  onSelectSheetTabTitle: (tabTitle: string) => void;
  cellRangeInput: string;
  onChangeCellRangeInput: (range: string) => void;
  sheetGridValues: string[][];
  sheetDetailLoading: boolean;
  isExecuting: boolean;
  benchInput: WorkspaceBenchTelemetryInput;
  onRefreshSheets: () => void;
  onOpenSpreadsheet: (item: GoogleSheetDriveItem) => void;
  onReadRange: () => void;
  onCreateBenchSheet: (customTitle: string) => void;
  onSetPendingAction: (action: PendingWorkspaceAction) => void;
}

export const GoogleSheetsTab: React.FC<GoogleSheetsTabProps> = ({
  sheetsList,
  sheetsLoading,
  sheetSearch,
  onChangeSheetSearch,
  selectedSpreadsheet,
  selectedSheetTabTitle,
  onSelectSheetTabTitle,
  cellRangeInput,
  onChangeCellRangeInput,
  sheetGridValues,
  sheetDetailLoading,
  isExecuting,
  benchInput,
  onRefreshSheets,
  onOpenSpreadsheet,
  onReadRange,
  onCreateBenchSheet,
  onSetPendingAction,
}) => {
  const [newSheetTitle, setNewSheetTitle] = useState(
    `ECU Bench Telemetry — ${benchInput.ecuProfileLabel}`
  );

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-y-auto lg:overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-[#262c36]">
      {/* Left Sidebar: Spreadsheets List & New Export */}
      <div className="lg:col-span-4 flex flex-col min-h-[240px] lg:min-h-0 lg:overflow-hidden bg-[#101318]">
        <div className="p-3 border-b border-[#262c36] space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center justify-between">
            <span>Export Live MNA Pinout Sheet</span>
            <span className="text-[10px] text-slate-400 font-normal">
              {benchInput.pins.length} Pins
            </span>
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newSheetTitle}
              onChange={(e) => setNewSheetTitle(e.target.value)}
              placeholder="Spreadsheet title..."
              className="flex-1 min-w-0 hw-lcd-well px-2.5 py-1.5 rounded-[2px] text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              disabled={isExecuting}
              onClick={() => onCreateBenchSheet(newSheetTitle)}
              className="hw-btn hw-btn-green px-2.5 py-1.5 rounded-[2px] text-xs font-bold flex items-center gap-1 shrink-0 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create</span>
            </button>
          </div>
        </div>

        <div className="p-2.5 border-b border-[#262c36] flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={sheetSearch}
              onChange={(e) => onChangeSheetSearch(e.target.value)}
              placeholder="Search Google Sheets..."
              className="w-full hw-lcd-well pl-8 pr-2.5 py-1.5 rounded-[2px] text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            type="button"
            onClick={onRefreshSheets}
            disabled={sheetsLoading}
            className="hw-btn p-1.5 rounded-[2px] text-slate-300 hover:text-white"
            title="Refresh Spreadsheets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${sheetsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#1d222b]">
          {sheetsLoading ? (
            <div className="p-6 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Loading Google Sheets...</span>
            </div>
          ) : sheetsList.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 font-sans">
              No Google Spreadsheets found. Click <strong>Create</strong> above to generate a live MNA ECU pinout spreadsheet.
            </div>
          ) : (
            sheetsList.map((item) => {
              const isSelected = selectedSpreadsheet?.spreadsheetId === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => onOpenSpreadsheet(item)}
                  className={`p-2.5 cursor-pointer transition flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-emerald-950/30 border-l-2 border-emerald-400'
                      : 'hover:bg-[#161b22]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-200 truncate flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </div>
                    {item.modifiedTime && (
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Modified {new Date(item.modifiedTime).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetPendingAction({
                        kind: 'TRASH_SPREADSHEET',
                        spreadsheetId: item.id,
                        title: item.name,
                      });
                    }}
                    className="p-1 text-slate-500 hover:text-rose-400 transition"
                    title="Move Spreadsheet to Trash"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Main Area: Sheet Tabs, Range Reader & Append Action */}
      <div className="lg:col-span-8 flex flex-col overflow-hidden bg-[#0c0e12]">
        {!selectedSpreadsheet ? (
          <div className="m-auto p-8 text-center max-w-md space-y-2">
            <FileSpreadsheet className="w-8 h-8 text-emerald-400 mx-auto" />
            <h3 className="text-sm font-bold text-slate-200">
              Select or Create a Google Spreadsheet
            </h3>
            <p className="text-xs text-slate-400 font-sans">
              Inspect sheet tabs dynamically, read cell ranges, or append timestamped MNA ECU pinout voltage matrices directly to your spreadsheet.
            </p>
          </div>
        ) : (
          <>
            <div className="p-3 border-b border-[#262c36] bg-[#12161d] flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-slate-100 truncate">
                  {selectedSpreadsheet.title}
                </h3>
                <p className="text-[10px] text-slate-400">
                  {selectedSpreadsheet.tabs.length} Sheet Tab(s) Discovered via Metadata API
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedSheetTabTitle && (
                  <button
                    type="button"
                    disabled={isExecuting}
                    onClick={() =>
                      onSetPendingAction({
                        kind: 'APPEND_SHEET_TELEMETRY',
                        spreadsheetId: selectedSpreadsheet.spreadsheetId,
                        spreadsheetTitle: selectedSpreadsheet.title,
                        sheetTitle: selectedSheetTabTitle,
                      })
                    }
                    className="hw-btn hw-btn-amber px-2.5 py-1 rounded-[2px] text-[11px] font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Append Bench Snapshot to &ldquo;{selectedSheetTabTitle}&rdquo;</span>
                  </button>
                )}
                <a
                  href={selectedSpreadsheet.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hw-btn px-2.5 py-1 rounded-[2px] text-[11px] text-emerald-300 flex items-center gap-1"
                >
                  <span>Open in Sheets</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Dynamic Sheet Tab Selector & Range Reader */}
            <div className="p-2.5 border-b border-[#262c36] bg-[#0e1116] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">
                  Sheet Tab:
                </span>
                {selectedSpreadsheet.tabs.map((tab) => (
                  <button
                    key={tab.sheetId}
                    type="button"
                    onClick={() => onSelectSheetTabTitle(tab.title)}
                    className={`px-2.5 py-1 rounded-[2px] text-xs font-semibold transition ${
                      selectedSheetTabTitle === tab.title
                        ? 'hw-btn-green'
                        : 'bg-[#161b22] text-slate-300 hover:text-white'
                    }`}
                  >
                    {tab.title}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">
                  Range:
                </span>
                <input
                  type="text"
                  value={cellRangeInput}
                  onChange={(e) => onChangeCellRangeInput(e.target.value)}
                  className="w-24 hw-lcd-well px-2 py-1 rounded-[2px] text-xs text-slate-100"
                  placeholder="A1:H40"
                />
                <button
                  type="button"
                  onClick={onReadRange}
                  disabled={sheetDetailLoading}
                  className="hw-btn px-2.5 py-1 rounded-[2px] text-xs text-slate-200 hover:text-white"
                >
                  Read Cells
                </button>
              </div>
            </div>

            {/* Grid Values Table */}
            <div className="flex-1 overflow-auto p-3">
              {sheetDetailLoading ? (
                <div className="p-8 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Reading range from {selectedSheetTabTitle}...</span>
                </div>
              ) : sheetGridValues.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No values in selected range ({selectedSheetTabTitle}!{cellRangeInput}).
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#262c36] rounded-[2px]">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <tbody>
                      {sheetGridValues.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className={
                            rIdx === 0
                              ? 'bg-[#18202c] font-bold text-emerald-300 border-b border-[#2b3545]'
                              : 'border-b border-[#1c212b] hover:bg-[#13171f]'
                          }
                        >
                          <td className="px-2 py-1.5 text-[10px] text-slate-500 bg-[#0f1318] border-r border-[#262c36] w-10 text-right">
                            {rIdx + 1}
                          </td>
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="px-2.5 py-1.5 border-r border-[#1c212b] text-slate-200 whitespace-nowrap"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 2. GOOGLE SLIDES TAB
// ============================================================================

interface GoogleSlidesTabProps {
  presentationsList: GoogleSlideDriveItem[];
  slidesLoading: boolean;
  slideSearch: string;
  onChangeSlideSearch: (q: string) => void;
  selectedPresentation: ParsedPresentation | null;
  slideDetailLoading: boolean;
  isExecuting: boolean;
  benchInput: WorkspaceBenchTelemetryInput;
  onRefreshPresentations: () => void;
  onOpenPresentation: (item: GoogleSlideDriveItem) => void;
  onCreateBenchDeck: (customTitle: string) => void;
  onSetPendingAction: (action: PendingWorkspaceAction) => void;
}

export const GoogleSlidesTab: React.FC<GoogleSlidesTabProps> = ({
  presentationsList,
  slidesLoading,
  slideSearch,
  onChangeSlideSearch,
  selectedPresentation,
  slideDetailLoading,
  isExecuting,
  benchInput,
  onRefreshPresentations,
  onOpenPresentation,
  onCreateBenchDeck,
  onSetPendingAction,
}) => {
  const [newDeckTitle, setNewDeckTitle] = useState(
    `ECU Diagnostic Case Study — ${benchInput.ecuProfileLabel}`
  );

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-y-auto lg:overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-[#262c36]">
      {/* Left Sidebar: Presentations List */}
      <div className="lg:col-span-4 flex flex-col min-h-[240px] lg:min-h-0 lg:overflow-hidden bg-[#101318]">
        <div className="p-3 border-b border-[#262c36] space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
            Generate Diagnostic Slide Deck
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newDeckTitle}
              onChange={(e) => setNewDeckTitle(e.target.value)}
              placeholder="Presentation title..."
              className="flex-1 min-w-0 hw-lcd-well px-2.5 py-1.5 rounded-[2px] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
            <button
              type="button"
              disabled={isExecuting}
              onClick={() => onCreateBenchDeck(newDeckTitle)}
              className="hw-btn hw-btn-amber px-2.5 py-1.5 rounded-[2px] text-xs font-bold flex items-center gap-1 shrink-0 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create</span>
            </button>
          </div>
        </div>

        <div className="p-2.5 border-b border-[#262c36] flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={slideSearch}
              onChange={(e) => onChangeSlideSearch(e.target.value)}
              placeholder="Search Google Slides..."
              className="w-full hw-lcd-well pl-8 pr-2.5 py-1.5 rounded-[2px] text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>
          <button
            type="button"
            onClick={onRefreshPresentations}
            disabled={slidesLoading}
            className="hw-btn p-1.5 rounded-[2px] text-slate-300 hover:text-white"
            title="Refresh Presentations"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${slidesLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#1d222b]">
          {slidesLoading ? (
            <div className="p-6 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              <span>Loading Google Slides...</span>
            </div>
          ) : presentationsList.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 font-sans">
              No Google Slides presentations found. Click <strong>Create</strong> above to build a training/diagnostic deck from this bench session.
            </div>
          ) : (
            presentationsList.map((item) => {
              const isSelected = selectedPresentation?.presentationId === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => onOpenPresentation(item)}
                  className={`p-2.5 cursor-pointer transition flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-amber-950/30 border-l-2 border-amber-400'
                      : 'hover:bg-[#161b22]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-200 truncate flex items-center gap-1.5">
                      <Presentation className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </div>
                    {item.modifiedTime && (
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Modified {new Date(item.modifiedTime).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetPendingAction({
                        kind: 'TRASH_PRESENTATION',
                        presentationId: item.id,
                        title: item.name,
                      });
                    }}
                    className="p-1 text-slate-500 hover:text-rose-400 transition"
                    title="Move Presentation to Trash"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Main Area: Slide Inspector & Append Slide */}
      <div className="lg:col-span-8 flex flex-col overflow-hidden bg-[#0c0e12]">
        {slideDetailLoading ? (
          <div className="m-auto flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            <span>Loading presentation slides...</span>
          </div>
        ) : !selectedPresentation ? (
          <div className="m-auto p-8 text-center max-w-md space-y-2">
            <Presentation className="w-8 h-8 text-amber-400 mx-auto" />
            <h3 className="text-sm font-bold text-slate-200">
              Select or Create a Google Slides Presentation
            </h3>
            <p className="text-xs text-slate-400 font-sans">
              Create workshop training slide decks or append live ECU bench diagnostic summary slides to an existing presentation.
            </p>
          </div>
        ) : (
          <>
            <div className="p-3 border-b border-[#262c36] bg-[#12161d] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-slate-100">
                  {selectedPresentation.title}
                </h3>
                <p className="text-[10px] text-slate-400">
                  {selectedPresentation.slides.length} Slide(s) in Deck
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isExecuting}
                  onClick={() =>
                    onSetPendingAction({
                      kind: 'APPEND_SLIDE_DECK',
                      presentationId: selectedPresentation.presentationId,
                      presentationTitle: selectedPresentation.title,
                    })
                  }
                  className="hw-btn hw-btn-amber px-2.5 py-1 rounded-[2px] text-[11px] font-bold flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Append Live Diagnostic Slide</span>
                </button>
                <a
                  href={selectedPresentation.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hw-btn px-2.5 py-1 rounded-[2px] text-[11px] text-amber-300 flex items-center gap-1"
                >
                  <span>Open in Slides</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedPresentation.slides.map((slide) => (
                <div
                  key={slide.objectId}
                  className="p-3.5 rounded-[2px] border border-[#2a313d] bg-[#12161f] space-y-2"
                >
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-amber-400 font-bold">
                    <span>Slide #{slide.index}</span>
                    <span className="text-slate-500">ID: {slide.objectId}</span>
                  </div>
                  {slide.texts.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">
                      (Visual / graphic slide — no text elements)
                    </p>
                  ) : (
                    <div className="space-y-1.5 text-xs text-slate-200 font-sans whitespace-pre-wrap">
                      {slide.texts.map((t, i) => (
                        <div
                          key={i}
                          className={
                            i === 0
                              ? 'font-bold text-slate-100 text-sm border-b border-[#232934] pb-1'
                              : 'text-slate-300 leading-relaxed'
                          }
                        >
                          {t}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 3. GOOGLE TASKS TAB
// ============================================================================

interface GoogleTasksTabProps {
  taskLists: GoogleTaskList[];
  selectedTaskListId: string;
  onSelectTaskListId: (id: string) => void;
  tasks: GoogleTaskItem[];
  tasksLoading: boolean;
  isExecuting: boolean;
  benchInput: WorkspaceBenchTelemetryInput;
  onRefreshTasks: () => void;
  onCreateTask: (title: string, notes: string, dueIsoDate: string) => void;
  onSetPendingAction: (action: PendingWorkspaceAction) => void;
}

export const GoogleTasksTab: React.FC<GoogleTasksTabProps> = ({
  taskLists,
  selectedTaskListId,
  onSelectTaskListId,
  tasks,
  tasksLoading,
  isExecuting,
  benchInput,
  onRefreshTasks,
  onCreateTask,
  onSetPendingAction,
}) => {
  const [taskTitle, setTaskTitle] = useState('');
  const [taskNotes, setTaskNotes] = useState('');
  const [taskDue, setTaskDue] = useState('');

  const selectedList = taskLists.find((l) => l.id === selectedTaskListId);
  const autoBenchTasks = buildBenchVerificationTasks(benchInput);

  const handleSubmitNewTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    onCreateTask(taskTitle, taskNotes, taskDue);
    setTaskTitle('');
    setTaskNotes('');
    setTaskDue('');
  };

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-y-auto lg:overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-[#262c36]">
      {/* Left Column: Task Lists & Auto-Generate Bench Repair Checklist */}
      <div className="lg:col-span-4 flex flex-col min-h-[260px] lg:min-h-0 lg:overflow-hidden bg-[#101318] p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
            Google Task Lists
          </span>
          <button
            type="button"
            onClick={onRefreshTasks}
            disabled={tasksLoading}
            className="hw-btn p-1.5 rounded-[2px] text-slate-300 hover:text-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${tasksLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="space-y-1 max-h-40 overflow-y-auto">
          {taskLists.map((list) => (
            <button
              key={list.id}
              type="button"
              onClick={() => onSelectTaskListId(list.id)}
              className={`w-full text-left px-3 py-2 rounded-[2px] text-xs font-semibold flex items-center justify-between transition ${
                list.id === selectedTaskListId
                  ? 'hw-btn-green'
                  : 'bg-[#161b22] text-slate-300 hover:text-white'
              }`}
            >
              <span className="truncate">{list.title}</span>
              <CheckSquare className="w-3.5 h-3.5 shrink-0" />
            </button>
          ))}
        </div>

        {/* Create Single Task Form */}
        <form
          onSubmit={handleSubmitNewTask}
          className="p-3 rounded-[2px] border border-[#262c36] bg-[#0c0f14] space-y-2"
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
            Add Repair / Bench Task
          </div>
          <input
            type="text"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Task title (e.g., Check Pin 14 5V Reference)..."
            className="w-full hw-lcd-well px-2.5 py-1.5 rounded-[2px] text-xs text-slate-100"
          />
          <textarea
            rows={2}
            value={taskNotes}
            onChange={(e) => setTaskNotes(e.target.value)}
            placeholder="Diagnostic notes / specs..."
            className="w-full hw-lcd-well px-2.5 py-1.5 rounded-[2px] text-xs text-slate-200 font-sans"
          />
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={taskDue}
              onChange={(e) => setTaskDue(e.target.value)}
              className="flex-1 hw-lcd-well px-2 py-1 rounded-[2px] text-xs text-slate-200"
            />
            <button
              type="submit"
              disabled={isExecuting || !taskTitle.trim() || !selectedTaskListId}
              className="hw-btn hw-btn-green px-3 py-1.5 rounded-[2px] text-xs font-bold flex items-center gap-1 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Task</span>
            </button>
          </div>
        </form>

        {/* Export Live Bench Faults / DTCs as Tasks */}
        <div className="p-3 rounded-[2px] border border-amber-700/40 bg-amber-950/15 space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
            Export Live Bench Fault Checklist ({autoBenchTasks.length})
          </div>
          <p className="text-[11px] text-slate-400 font-sans">
            Create Google Tasks for active OBD-II DTCs, injected pin faults, and open harness leads on {benchInput.ecuProfileLabel}.
          </p>
          <button
            type="button"
            disabled={isExecuting || !selectedTaskListId}
            onClick={() =>
              onSetPendingAction({
                kind: 'EXPORT_BENCH_TASKS',
                taskListId: selectedTaskListId,
                taskListTitle: selectedList?.title || 'Primary Task List',
                tasks: autoBenchTasks,
              })
            }
            className="w-full hw-btn hw-btn-amber py-1.5 px-3 rounded-[2px] text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Push {autoBenchTasks.length} Repair Task(s) to Google Tasks</span>
          </button>
        </div>
      </div>

      {/* Right Column: Active Task Items */}
      <div className="lg:col-span-8 flex flex-col overflow-hidden bg-[#0c0e12]">
        <div className="p-3 border-b border-[#262c36] bg-[#12161d] flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-100">
              {selectedList?.title || 'Task List'}
            </h3>
            <p className="text-[10px] text-slate-400">
              {tasks.length} Task(s) — Status changes and deletions require confirmation
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {tasksLoading ? (
            <div className="p-8 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Loading tasks from Google Tasks...</span>
            </div>
          ) : tasks.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 font-sans">
              No tasks in this list yet. Add a task or push the live ECU bench repair checklist from the left panel.
            </div>
          ) : (
            tasks.map((task) => {
              const isCompleted = task.status === 'completed';
              return (
                <div
                  key={task.id}
                  className={`p-3 rounded-[2px] border flex items-start justify-between gap-3 ${
                    isCompleted
                      ? 'border-emerald-900/50 bg-[#0d1512] opacity-80'
                      : 'border-[#262c36] bg-[#12161f]'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isCompleted}
                      onChange={() =>
                        onSetPendingAction({
                          kind: 'TOGGLE_TASK_STATUS',
                          taskListId: selectedTaskListId,
                          taskId: task.id,
                          taskTitle: task.title,
                          nextCompleted: !isCompleted,
                        })
                      }
                      className="mt-0.5 cursor-pointer accent-emerald-500"
                    />
                    <div className="min-w-0">
                      <div
                        className={`text-xs font-semibold ${
                          isCompleted ? 'line-through text-slate-400' : 'text-slate-100'
                        }`}
                      >
                        {task.title}
                      </div>
                      {task.notes && (
                        <p className="text-[11px] text-slate-400 font-sans mt-1 whitespace-pre-wrap">
                          {task.notes}
                        </p>
                      )}
                      {task.due && (
                        <div className="text-[10px] text-amber-400 mt-1">
                          Due: {new Date(task.due).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onSetPendingAction({
                        kind: 'DELETE_TASK_ITEM',
                        taskListId: selectedTaskListId,
                        taskId: task.id,
                        taskTitle: task.title,
                      })
                    }
                    className="p-1 text-slate-500 hover:text-rose-400 transition shrink-0"
                    title="Delete Task"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 4. GOOGLE KEEP TAB
// ============================================================================

interface GoogleKeepTabProps {
  keepNotes: GoogleKeepNoteItem[];
  keepLoading: boolean;
  keepRestrictionMessage?: string;
  isExecuting: boolean;
  benchReportText: string;
  ecuProfileLabel: string;
  onRefreshKeep: () => void;
  onCreateKeepNote: (title: string, bodyText: string) => void;
  onFallbackSaveNoteToDrive: (title: string, bodyText: string) => void;
  onExportNoteToTasks?: (title: string, bodyText: string) => void;
  onSetPendingAction: (action: PendingWorkspaceAction) => void;
}

export const GoogleKeepTab: React.FC<GoogleKeepTabProps> = ({
  keepNotes,
  keepLoading,
  keepRestrictionMessage,
  isExecuting,
  benchReportText,
  ecuProfileLabel,
  onRefreshKeep,
  onCreateKeepNote,
  onFallbackSaveNoteToDrive,
  onExportNoteToTasks,
  onSetPendingAction,
}) => {
  const [noteTitle, setNoteTitle] = useState(`Bench Note — ${ecuProfileLabel}`);
  const [noteBody, setNoteBody] = useState(benchReportText);
  const [keepSearch, setKeepSearch] = useState('');
  const [copiedKind, setCopiedKind] = useState<'NONE' | 'CHECKLIST' | 'TEXT'>('NONE');

  const handleCopyChecklist = async () => {
    // Convert lines into Google Keep checklist format [ ]
    const lines = noteBody
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const checklistText = lines
      .map((line) => {
        if (line.startsWith('[ ]') || line.startsWith('[x]')) return line;
        if (line.startsWith('- ') || line.startsWith('* ')) return `[ ] ${line.slice(2)}`;
        return `[ ] ${line}`;
      })
      .join('\n');
    const fullText = `${noteTitle}\n\n${checklistText}`;
    try {
      await navigator.clipboard.writeText(fullText);
      setCopiedKind('CHECKLIST');
      window.setTimeout(() => setCopiedKind('NONE'), 2500);
    } catch {
      // Fallback
    }
  };

  const handleCopyPlainText = async () => {
    try {
      await navigator.clipboard.writeText(`${noteTitle}\n\n${noteBody}`);
      setCopiedKind('TEXT');
      window.setTimeout(() => setCopiedKind('NONE'), 2500);
    } catch {
      // Fallback
    }
  };

  const handleApplyTemplate = (type: 'MNA' | 'DTC' | 'HARNESS') => {
    if (type === 'MNA') {
      setNoteTitle(`MNA Bench Telemetry — ${ecuProfileLabel}`);
      setNoteBody(benchReportText);
    } else if (type === 'DTC') {
      setNoteTitle(`DTC Pinout Isolation Checklist — ${ecuProfileLabel}`);
      setNoteBody(
        `[ ] Verify KL30 constant battery power (Target: 12.60 V ± 0.2 V)\n` +
          `[ ] Verify KL15 switched ignition power (Target: 12.60 V ± 0.2 V)\n` +
          `[ ] Measure KL31 chassis ground voltage drop (Target: < 0.05 V)\n` +
          `[ ] Measure sensor ground (SGND) rail offset (Target: < 0.05 V)\n` +
          `[ ] Verify 5.00V reference rail (Pin 5) with TPS/MAP disconnected\n` +
          `[ ] Scope CKP inductive crankshaft reluctor sine wave amplitude\n` +
          `[ ] Scope CMP Hall effect camshaft sync 0-5V square wave\n` +
          `[ ] Measure CAN bus termination resistance (Target: 60.0 Ω Key-OFF)\n` +
          `[ ] Perform high-resistance terminal pull-test on ECU header pins`
      );
    } else {
      setNoteTitle(`Harness Continuity & Resistance Notes — ${ecuProfileLabel}`);
      setNoteBody(
        `[ ] Injector 1 harness wire: Pin 10 ↔ Comp Inj (Target: < 0.10 Ω)\n` +
          `[ ] TPS signal harness wire: Pin 7 ↔ Comp TPS (Target: < 0.10 Ω)\n` +
          `[ ] MAP signal harness wire: Pin 8 ↔ Comp MAP (Target: < 0.10 Ω)\n` +
          `[ ] CAN-H lead: Pin 13 ↔ DLC Pin 6 (Target: < 0.10 Ω)\n` +
          `[ ] CAN-L lead: Pin 14 ↔ DLC Pin 14 (Target: < 0.10 Ω)\n` +
          `[ ] Main power feed lead: KL30 (Pin 3) ↔ Battery (+B)\n` +
          `[ ] Check for chafed harness loom near engine bracket ground`
      );
    }
  };

  const filteredNotes = keepNotes.filter((n) => {
    if (!keepSearch.trim()) return true;
    const q = keepSearch.toLowerCase();
    return (
      (n.title && n.title.toLowerCase().includes(q)) ||
      (n.bodyText && n.bodyText.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-y-auto lg:overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-[#262c36]">
      {/* Left Composer */}
      <div className="lg:col-span-5 flex flex-col min-h-[280px] lg:min-h-0 lg:overflow-hidden bg-[#101318] p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <StickyNote className="w-3.5 h-3.5" />
            <span>Technician Bench Note</span>
          </span>

          <a
            href="https://keep.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hw-btn px-2 py-0.5 rounded-[2px] text-[10px] text-amber-300 border-amber-600/60 flex items-center gap-1 hover:text-white"
            title="Open Google Keep in a new tab"
          >
            <span>keep.google.com</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>

        {/* Diagnostic Template Selectors */}
        <div className="flex flex-wrap items-center gap-1 text-[10px]">
          <span className="text-slate-500 uppercase font-mono mr-0.5">Template:</span>
          <button
            type="button"
            onClick={() => handleApplyTemplate('MNA')}
            className="hw-btn px-2 py-0.5 rounded-[2px] text-emerald-300 hover:text-white flex items-center gap-1"
          >
            <FileText className="w-2.5 h-2.5" />
            <span>Live MNA</span>
          </button>
          <button
            type="button"
            onClick={() => handleApplyTemplate('DTC')}
            className="hw-btn px-2 py-0.5 rounded-[2px] text-amber-300 hover:text-white flex items-center gap-1"
          >
            <CheckSquare className="w-2.5 h-2.5" />
            <span>DTC Checklist</span>
          </button>
          <button
            type="button"
            onClick={() => handleApplyTemplate('HARNESS')}
            className="hw-btn px-2 py-0.5 rounded-[2px] text-sky-300 hover:text-white flex items-center gap-1"
          >
            <Sparkles className="w-2.5 h-2.5" />
            <span>Harness Test</span>
          </button>
        </div>

        <input
          type="text"
          value={noteTitle}
          onChange={(e) => setNoteTitle(e.target.value)}
          placeholder="Keep Note Title..."
          className="w-full hw-lcd-well px-2.5 py-1.5 rounded-[2px] text-xs text-slate-100"
        />

        <textarea
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          rows={9}
          placeholder="Enter bench voltages, pin observations, or repair notes..."
          className="flex-1 w-full hw-lcd-well p-2.5 rounded-[2px] text-xs text-slate-200 font-mono leading-relaxed resize-none"
        />

        {/* Copy for Google Keep / Tasks toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={handleCopyChecklist}
            className={`hw-btn px-2 py-1 rounded-[2px] text-[10px] font-bold flex items-center gap-1 ${
              copiedKind === 'CHECKLIST' ? 'text-emerald-300 border-emerald-500' : 'text-slate-300'
            }`}
            title="Copy formatted as Google Keep interactive checkboxes"
          >
            {copiedKind === 'CHECKLIST' ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            <span>
              {copiedKind === 'CHECKLIST' ? 'Copied Keep Checklist!' : 'Copy Keep Checklist'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleCopyPlainText}
            className={`hw-btn px-2 py-1 rounded-[2px] text-[10px] flex items-center gap-1 ${
              copiedKind === 'TEXT' ? 'text-emerald-300 border-emerald-500' : 'text-slate-400'
            }`}
            title="Copy title and notes as plain text"
          >
            {copiedKind === 'TEXT' ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            <span>{copiedKind === 'TEXT' ? 'Copied Text!' : 'Copy Text'}</span>
          </button>

          {onExportNoteToTasks && (
            <button
              type="button"
              disabled={isExecuting || !noteBody.trim()}
              onClick={() => onExportNoteToTasks(noteTitle, noteBody)}
              className="hw-btn px-2 py-1 rounded-[2px] text-[10px] text-emerald-400 hover:text-emerald-200 flex items-center gap-1 ml-auto"
              title="Push this bench note directly as a Google Tasks item"
            >
              <CheckSquare className="w-3 h-3" />
              <span>Push to Tasks</span>
            </button>
          )}
        </div>

        {/* Primary Save Actions */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-[#232934]">
          <button
            type="button"
            disabled={isExecuting || !noteBody.trim()}
            onClick={() => onCreateKeepNote(noteTitle, noteBody)}
            className="flex-1 hw-btn hw-btn-amber py-2 px-3 rounded-[2px] text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
            title="Create note via Google Keep REST API (keep.googleapis.com)"
          >
            <StickyNote className="w-3.5 h-3.5" />
            <span>Create Keep Note (API)</span>
          </button>

          <button
            type="button"
            disabled={isExecuting || !noteBody.trim()}
            onClick={() => onFallbackSaveNoteToDrive(noteTitle, noteBody)}
            className="flex-1 hw-btn hw-btn-green py-2 px-3 rounded-[2px] text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
            title="Save note directly to Google Drive folder as a .txt document"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Save to Drive (.txt)</span>
          </button>
        </div>
      </div>

      {/* Right Keep Notes List & Enterprise Notice */}
      <div className="lg:col-span-7 flex flex-col overflow-hidden bg-[#0c0e12]">
        <div className="p-3 border-b border-[#262c36] bg-[#12161d] flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
              <span>Google Keep Notes (keep.googleapis.com)</span>
            </h3>
            <p className="text-[10px] text-slate-400">
              Enterprise Workspace API &amp; Consumer Google Workspace Sync
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={keepSearch}
                onChange={(e) => setKeepSearch(e.target.value)}
                placeholder="Search notes..."
                className="pl-7 pr-2 py-1 bg-[#090c10] border border-[#2b3341] rounded-[2px] text-[11px] text-slate-200 w-32 focus:w-44 transition-all"
              />
            </div>

            <button
              type="button"
              onClick={onRefreshKeep}
              disabled={keepLoading}
              className="hw-btn p-1.5 rounded-[2px] text-slate-300 hover:text-white"
              title="Refresh Google Keep notes"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${keepLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {keepRestrictionMessage && (
          <div className="m-3 p-3 rounded-[2px] border border-amber-700/60 bg-amber-950/25 text-xs text-amber-200 font-sans space-y-1.5">
            <div className="font-bold text-amber-300 uppercase font-mono text-[11px] flex items-center justify-between">
              <span>Google Keep API Notice</span>
              <a
                href="https://keep.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-amber-400 underline flex items-center gap-1"
              >
                <span>Open Keep Web</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
            <p className="leading-relaxed text-[11px]">{keepRestrictionMessage}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {keepLoading ? (
            <div className="p-8 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              <span>Querying Google Keep API...</span>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 font-sans space-y-2">
              <p>
                {keepSearch.trim()
                  ? `No Google Keep notes matched "${keepSearch}".`
                  : 'No Google Keep notes returned from the API.'}
              </p>
              <p className="text-[11px] text-slate-400">
                You can use the left composer to create a Keep note, copy Keep-formatted checklists to your clipboard, or save your technician notes directly to Google Drive or Google Tasks.
              </p>
            </div>
          ) : (
            filteredNotes.map((note) => (
              <div
                key={note.name}
                className="p-3 rounded-[2px] border border-[#2a313d] bg-[#12161f] flex items-start justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="text-xs font-bold text-amber-300">{note.title}</div>
                  <pre className="text-[11px] text-slate-300 font-sans whitespace-pre-wrap">
                    {note.bodyText}
                  </pre>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onSetPendingAction({
                      kind: 'DELETE_KEEP_NOTE',
                      noteName: note.name,
                      noteTitle: note.title || note.name,
                    })
                  }
                  className="p-1 text-slate-500 hover:text-rose-400 transition shrink-0"
                  title="Delete Keep Note"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
