/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import {
  BenchDocTelemetryPayload,
  buildBenchReportText,
  GoogleWorkspaceAuthError,
  parseGoogleWorkspaceHttpError,
} from './googleDocsService';

const CLASSROOM_API_BASE = 'https://classroom.googleapis.com/v1';

export interface ClassroomCourse {
  id: string;
  name: string;
  section?: string;
  descriptionHeading?: string;
  room?: string;
  courseState?: 'ACTIVE' | 'ARCHIVED' | 'PROVISIONED' | 'DECLINED' | 'SUSPENDED';
  alternateLink?: string;
  enrollmentCode?: string;
  updateTime?: string;
}

export interface ClassroomAnnouncement {
  id: string;
  courseId: string;
  text: string;
  state?: string;
  alternateLink?: string;
  creationTime?: string;
  updateTime?: string;
}

export interface ClassroomCourseWork {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  state?: string;
  workType?: string;
  maxPoints?: number;
  alternateLink?: string;
  creationTime?: string;
  updateTime?: string;
  dueDate?: { year: number; month: number; day: number };
}

export interface ClassroomMaterial {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  state?: string;
  alternateLink?: string;
  updateTime?: string;
}

async function classroomFetch<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {}
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

  if (res.status === 204) {
    return {} as T;
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
      'Google Classroom',
      'Google Classroom permissions are missing or denied. Click Sign in with Google to grant Classroom access.'
    );
  }

  return json as T;
}

export async function listClassroomCourses(
  accessToken: string
): Promise<ClassroomCourse[]> {
  const params = new URLSearchParams({
    courseStates: 'ACTIVE',
    pageSize: '30',
  });
  const data = await classroomFetch<{ courses?: ClassroomCourse[] }>(
    `${CLASSROOM_API_BASE}/courses?${params.toString()}`,
    accessToken
  );
  return data.courses || [];
}

export async function listClassroomAnnouncements(
  accessToken: string,
  courseId: string
): Promise<ClassroomAnnouncement[]> {
  const data = await classroomFetch<{ announcements?: ClassroomAnnouncement[] }>(
    `${CLASSROOM_API_BASE}/courses/${encodeURIComponent(courseId)}/announcements?pageSize=25`,
    accessToken
  );
  return data.announcements || [];
}

export async function listClassroomCourseWork(
  accessToken: string,
  courseId: string
): Promise<ClassroomCourseWork[]> {
  const data = await classroomFetch<{ courseWork?: ClassroomCourseWork[] }>(
    `${CLASSROOM_API_BASE}/courses/${encodeURIComponent(courseId)}/courseWork?pageSize=25`,
    accessToken
  );
  return data.courseWork || [];
}

export async function listClassroomMaterials(
  accessToken: string,
  courseId: string
): Promise<ClassroomMaterial[]> {
  const data = await classroomFetch<{ courseWorkMaterial?: ClassroomMaterial[] }>(
    `${CLASSROOM_API_BASE}/courses/${encodeURIComponent(courseId)}/courseWorkMaterials?pageSize=25`,
    accessToken
  );
  return data.courseWorkMaterial || [];
}

/**
 * Post an announcement to a Google Classroom course (MUST be explicitly user-confirmed beforehand).
 */
export async function createClassroomAnnouncement(
  accessToken: string,
  courseId: string,
  text: string
): Promise<ClassroomAnnouncement> {
  return classroomFetch<ClassroomAnnouncement>(
    `${CLASSROOM_API_BASE}/courses/${encodeURIComponent(courseId)}/announcements`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        text: text.trim(),
        state: 'PUBLISHED',
      }),
    }
  );
}

/**
 * Create a coursework assignment in a Google Classroom course (MUST be explicitly user-confirmed beforehand).
 */
export async function createClassroomAssignment(
  accessToken: string,
  courseId: string,
  input: {
    title: string;
    description: string;
    maxPoints?: number;
  }
): Promise<ClassroomCourseWork> {
  const payload: Record<string, unknown> = {
    title: input.title.trim(),
    description: input.description.trim(),
    workType: 'ASSIGNMENT',
    state: 'PUBLISHED',
  };
  if (typeof input.maxPoints === 'number' && Number.isFinite(input.maxPoints) && input.maxPoints > 0) {
    payload.maxPoints = Math.round(input.maxPoints);
  }

  return classroomFetch<ClassroomCourseWork>(
    `${CLASSROOM_API_BASE}/courses/${encodeURIComponent(courseId)}/courseWork`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

/**
 * Format a concise Classroom lab brief or assignment description from live MNA ECU bench telemetry.
 */
export function buildClassroomLabSummary(payload: BenchDocTelemetryPayload): {
  title: string;
  bodyText: string;
} {
  const activeDtcs = payload.circuitSolution.activeDTCs.map((d) => d.code);
  const dtcTag = activeDtcs.length > 0 ? `DTCs: ${activeDtcs.slice(0, 3).join(', ')}` : 'Nominal Bench';
  return {
    title: `ECU Lab Exercise — ${payload.ecuProfileLabel} (${dtcTag})`,
    bodyText: buildBenchReportText(payload),
  };
}
