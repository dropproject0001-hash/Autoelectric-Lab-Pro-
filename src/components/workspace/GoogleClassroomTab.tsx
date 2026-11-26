/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import React, { useState } from 'react';
import {
  BookOpen,
  ClipboardList,
  ExternalLink,
  GraduationCap,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';
import type {
  ClassroomAnnouncement,
  ClassroomCourse,
  ClassroomCourseWork,
  ClassroomMaterial,
} from '../../services/googleClassroomService';
import type { PendingWorkspaceAction } from './workspaceTypes';
import { toSafeExternalHttpUrl } from '../../utils/safeExternalUrl';

type ClassroomSection = 'ANNOUNCEMENTS' | 'COURSEWORK' | 'MATERIALS';

interface GoogleClassroomTabProps {
  courses: ClassroomCourse[];
  coursesLoading: boolean;
  selectedCourse: ClassroomCourse | null;
  announcements: ClassroomAnnouncement[];
  courseWork: ClassroomCourseWork[];
  materials: ClassroomMaterial[];
  detailsLoading: boolean;
  isExecuting: boolean;
  defaultLabSummary: { title: string; bodyText: string };
  onRefreshCourses: () => void;
  onSelectCourse: (course: ClassroomCourse) => void;
  onSetPendingAction: (action: PendingWorkspaceAction) => void;
}

export const GoogleClassroomTab: React.FC<GoogleClassroomTabProps> = ({
  courses,
  coursesLoading,
  selectedCourse,
  announcements,
  courseWork,
  materials,
  detailsLoading,
  isExecuting,
  defaultLabSummary,
  onRefreshCourses,
  onSelectCourse,
  onSetPendingAction,
}) => {
  const [courseSearch, setCourseSearch] = useState('');
  const [section, setSection] = useState<ClassroomSection>('ANNOUNCEMENTS');
  const [announcementText, setAnnouncementText] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentDescription, setAssignmentDescription] = useState('');
  const [assignmentPoints, setAssignmentPoints] = useState('100');

  const filteredCourses = courses.filter((c) => {
    if (!courseSearch.trim()) return true;
    const q = courseSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.section && c.section.toLowerCase().includes(q)) ||
      (c.room && c.room.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 p-3 sm:p-4 overflow-y-auto lg:overflow-hidden">
      {/* Left: Active Courses */}
      <div className="lg:col-span-4 hud-panel rounded-[3px] flex flex-col min-h-[240px] lg:min-h-0 lg:overflow-hidden">
        <div className="p-3 border-b border-[#2b313c] space-y-2 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4" />
              <span>Google Classroom Courses</span>
            </span>
            <button
              type="button"
              onClick={onRefreshCourses}
              disabled={coursesLoading}
              className="hw-btn p-1.5 rounded-[2px] text-slate-300 hover:text-white transition"
              title="Refresh Google Classroom Courses"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${coursesLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={courseSearch}
              onChange={(e) => setCourseSearch(e.target.value)}
              placeholder="Filter active courses..."
              className="hw-lcd-well w-full rounded-[2px] pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-sans"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 bg-[#101318]">
          {coursesLoading && courses.length === 0 ? (
            <div className="p-6 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Loading Classroom courses...</span>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 font-sans">
              No active Google Classroom courses found for this Google account.
            </div>
          ) : (
            filteredCourses.map((course) => {
              const isSelected = selectedCourse?.id === course.id;
              const safeUrl = toSafeExternalHttpUrl(course.alternateLink);
              return (
                <div
                  key={course.id}
                  className={`rounded-[2px] border p-2.5 transition flex items-start justify-between gap-2 ${
                    isSelected
                      ? 'bg-[#0e1a13] border-emerald-500/70'
                      : 'bg-[#151920] border-[#2b313c] hover:border-[#4b5668]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectCourse(course)}
                    className="flex-1 text-left min-w-0 cursor-pointer"
                  >
                    <div className="text-xs font-bold text-slate-100 truncate">{course.name}</div>
                    {(course.section || course.room) && (
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        {[course.section, course.room ? `Room ${course.room}` : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                    {course.enrollmentCode && (
                      <div className="text-[10px] font-mono text-emerald-300/80 mt-0.5">
                        Code: {course.enrollmentCode}
                      </div>
                    )}
                  </button>
                  {safeUrl && (
                    <a
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hw-btn p-1 rounded-[2px] text-slate-400 hover:text-emerald-300 transition shrink-0"
                      title="Open course in Google Classroom"
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

      {/* Right: Course Stream, Coursework, Materials & Composer */}
      <div className="lg:col-span-8 hud-panel rounded-[3px] flex flex-col min-h-[360px] lg:min-h-0 lg:overflow-hidden">
        {!selectedCourse ? (
          <div className="m-auto p-8 text-center max-w-md space-y-2">
            <GraduationCap className="w-9 h-9 text-emerald-400/70 mx-auto" />
            <h3 className="text-sm font-bold text-slate-100">
              Select a Google Classroom Course
            </h3>
            <p className="text-xs text-slate-400 font-sans">
              Browse announcements, assignments, and lab materials, or publish live ECU bench diagnostic summaries directly to your class.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2b313c] bg-[#12161d] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-slate-100 truncate">{selectedCourse.name}</h3>
                <p className="text-[10px] text-slate-400 truncate">
                  {selectedCourse.section || 'Active Course'} · {announcements.length} announcement(s) ·{' '}
                  {courseWork.length} assignment(s) · {materials.length} material(s)
                </p>
              </div>
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: 'ANNOUNCEMENTS', label: 'Stream', icon: Megaphone },
                    { id: 'COURSEWORK', label: 'Assignments', icon: ClipboardList },
                    { id: 'MATERIALS', label: 'Materials', icon: BookOpen },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSection(item.id)}
                      className={`hw-btn px-2.5 py-1 rounded-[2px] text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                        section === item.id
                          ? 'hw-btn-green'
                          : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#101318]">
              {detailsLoading ? (
                <div className="p-8 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Loading course stream &amp; coursework...</span>
                </div>
              ) : section === 'ANNOUNCEMENTS' ? (
                <>
                  {/* Announcement Composer */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!announcementText.trim()) return;
                      onSetPendingAction({
                        kind: 'POST_CLASSROOM_ANNOUNCEMENT',
                        courseId: selectedCourse.id,
                        courseName: selectedCourse.name,
                        text: announcementText.trim(),
                      });
                    }}
                    className="p-3 rounded-[2px] border border-[#2b313c] bg-[#141922] space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                        Post Announcement to Class Stream
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAnnouncementText(
                            `${defaultLabSummary.title}\n\n${defaultLabSummary.bodyText.slice(0, 1200)}`
                          )
                        }
                        className="hw-btn hw-btn-amber px-2 py-1 rounded-[2px] text-[10px] font-bold cursor-pointer"
                      >
                        Insert Live ECU Telemetry
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={announcementText}
                      onChange={(e) => setAnnouncementText(e.target.value)}
                      placeholder="Share lab instructions, DTC fault case notes, or bench telemetry with your class..."
                      className="hw-lcd-well w-full rounded-[2px] p-2.5 text-xs text-slate-100 placeholder-slate-500 font-sans focus:outline-none focus:border-emerald-500"
                    />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isExecuting || !announcementText.trim()}
                        className="hw-btn hw-btn-green px-3 py-1.5 rounded-[2px] text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Review &amp; Post Announcement</span>
                      </button>
                    </div>
                  </form>

                  {announcements.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No announcements posted in this course yet.
                    </div>
                  ) : (
                    announcements.map((ann) => (
                      <div
                        key={ann.id}
                        className="p-3 rounded-[2px] border border-[#262c36] bg-[#141820] space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                          <span>
                            {ann.updateTime
                              ? new Date(ann.updateTime).toLocaleString()
                              : 'Published'}
                          </span>
                          {toSafeExternalHttpUrl(ann.alternateLink) && (
                            <a
                              href={toSafeExternalHttpUrl(ann.alternateLink)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-300 hover:underline inline-flex items-center gap-1"
                            >
                              <span>Open</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                        <p className="text-xs text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                          {ann.text}
                        </p>
                      </div>
                    ))
                  )}
                </>
              ) : section === 'COURSEWORK' ? (
                <>
                  {/* Assignment Composer */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!assignmentTitle.trim()) return;
                      const parsedPoints = Number(assignmentPoints);
                      onSetPendingAction({
                        kind: 'CREATE_CLASSROOM_ASSIGNMENT',
                        courseId: selectedCourse.id,
                        courseName: selectedCourse.name,
                        title: assignmentTitle.trim(),
                        description: assignmentDescription.trim(),
                        maxPoints:
                          Number.isFinite(parsedPoints) && parsedPoints > 0
                            ? parsedPoints
                            : undefined,
                      });
                    }}
                    className="p-3 rounded-[2px] border border-[#2b313c] bg-[#141922] space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                        Create ECU Lab Assignment
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setAssignmentTitle(defaultLabSummary.title);
                          setAssignmentDescription(defaultLabSummary.bodyText.slice(0, 1600));
                        }}
                        className="hw-btn hw-btn-green px-2 py-1 rounded-[2px] text-[10px] font-bold cursor-pointer"
                      >
                        Fill from Live ECU Bench
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <input
                        type="text"
                        value={assignmentTitle}
                        onChange={(e) => setAssignmentTitle(e.target.value)}
                        placeholder="Assignment title..."
                        className="sm:col-span-3 hw-lcd-well rounded-[2px] px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500"
                      />
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={assignmentPoints}
                        onChange={(e) => setAssignmentPoints(e.target.value)}
                        placeholder="Points"
                        className="hw-lcd-well rounded-[2px] px-2.5 py-1.5 text-xs text-slate-100"
                      />
                    </div>
                    <textarea
                      rows={3}
                      value={assignmentDescription}
                      onChange={(e) => setAssignmentDescription(e.target.value)}
                      placeholder="Diagnostic objective, target pin voltages, and grading rubric..."
                      className="hw-lcd-well w-full rounded-[2px] p-2.5 text-xs text-slate-100 placeholder-slate-500 font-sans"
                    />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isExecuting || !assignmentTitle.trim()}
                        className="hw-btn hw-btn-amber px-3 py-1.5 rounded-[2px] text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Review &amp; Publish Assignment</span>
                      </button>
                    </div>
                  </form>

                  {courseWork.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No coursework assignments found in this course.
                    </div>
                  ) : (
                    courseWork.map((work) => (
                      <div
                        key={work.id}
                        className="p-3 rounded-[2px] border border-[#262c36] bg-[#141820] space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-bold text-slate-100">{work.title}</div>
                            <div className="text-[10px] text-slate-400">
                              {work.workType || 'ASSIGNMENT'}
                              {typeof work.maxPoints === 'number' ? ` · ${work.maxPoints} pts` : ''}
                              {work.dueDate
                                ? ` · Due ${work.dueDate.year}-${String(work.dueDate.month).padStart(2, '0')}-${String(work.dueDate.day).padStart(2, '0')}`
                                : ''}
                            </div>
                          </div>
                          {toSafeExternalHttpUrl(work.alternateLink) && (
                            <a
                              href={toSafeExternalHttpUrl(work.alternateLink)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hw-btn px-2 py-1 rounded-[2px] text-[10px] text-emerald-300 inline-flex items-center gap-1 shrink-0"
                            >
                              <span>Open</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                        {work.description && (
                          <p className="text-[11px] text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                            {work.description}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </>
              ) : materials.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No coursework materials found in this course.
                </div>
              ) : (
                materials.map((mat) => (
                  <div
                    key={mat.id}
                    className="p-3 rounded-[2px] border border-[#262c36] bg-[#141820] space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-bold text-slate-100">{mat.title}</div>
                      {toSafeExternalHttpUrl(mat.alternateLink) && (
                        <a
                          href={toSafeExternalHttpUrl(mat.alternateLink)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hw-btn px-2 py-1 rounded-[2px] text-[10px] text-emerald-300 inline-flex items-center gap-1 shrink-0"
                        >
                          <span>Open</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                    {mat.description && (
                      <p className="text-[11px] text-slate-300 whitespace-pre-wrap font-sans">
                        {mat.description}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
