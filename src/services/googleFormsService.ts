/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import {
  BenchDocTelemetryPayload,
  GoogleWorkspaceAuthError,
  parseGoogleWorkspaceHttpError,
} from './googleDocsService';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const FORMS_API_BASE = 'https://forms.googleapis.com/v1';

export interface GoogleFormDriveItem {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
  owners?: { displayName?: string; emailAddress?: string }[];
}

export type GoogleFormQuestionKind =
  | 'SHORT_TEXT'
  | 'PARAGRAPH'
  | 'MULTIPLE_CHOICE'
  | 'CHECKBOXES'
  | 'DROPDOWN'
  | 'SECTION'
  | 'OTHER';

export interface GoogleFormItemSummary {
  itemId: string;
  title: string;
  description?: string;
  questionId?: string;
  required: boolean;
  kind: GoogleFormQuestionKind;
  options: string[];
}

export interface GoogleFormDetail {
  formId: string;
  title: string;
  documentTitle?: string;
  description?: string;
  responderUri?: string;
  linkedSheetId?: string;
  items: GoogleFormItemSummary[];
}

export interface GoogleFormAnswerSummary {
  questionId: string;
  questionTitle: string;
  values: string[];
}

export interface GoogleFormResponseSummary {
  responseId: string;
  createTime?: string;
  lastSubmittedTime?: string;
  respondentEmail?: string;
  answers: GoogleFormAnswerSummary[];
}

export interface GoogleFormQuestionDraft {
  title: string;
  description?: string;
  required?: boolean;
  kind: 'SHORT_TEXT' | 'PARAGRAPH' | 'MULTIPLE_CHOICE' | 'CHECKBOXES';
  options?: string[];
}

async function formsFetch<T>(
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
      'Google Forms',
      'Google Forms permissions are missing or denied. Click Sign in with Google to grant Forms access.'
    );
  }

  return json as T;
}

function normalizeSafeFormId(formId: string): string {
  const trimmed = formId.trim();
  if (!trimmed) {
    throw new Error('A valid Google Form ID is required.');
  }
  return encodeURIComponent(trimmed);
}

interface RawFormItem {
  itemId?: string;
  title?: string;
  description?: string;
  pageBreakItem?: unknown;
  questionItem?: {
    question?: {
      questionId?: string;
      required?: boolean;
      textQuestion?: { paragraph?: boolean };
      choiceQuestion?: {
        type?: 'RADIO' | 'CHECKBOX' | 'DROP_DOWN';
        options?: Array<{ value?: string; isOther?: boolean }>;
      };
    };
  };
}

interface RawGoogleForm {
  formId: string;
  info?: {
    title?: string;
    documentTitle?: string;
    description?: string;
  };
  responderUri?: string;
  linkedSheetId?: string;
  items?: RawFormItem[];
}

function parseRawForm(raw: RawGoogleForm): GoogleFormDetail {
  const items: GoogleFormItemSummary[] = (raw.items || []).map((item, idx) => {
    const q = item.questionItem?.question;
    let kind: GoogleFormQuestionKind = 'OTHER';
    let options: string[] = [];

    if (item.pageBreakItem) {
      kind = 'SECTION';
    } else if (q?.textQuestion) {
      kind = q.textQuestion.paragraph ? 'PARAGRAPH' : 'SHORT_TEXT';
    } else if (q?.choiceQuestion) {
      const choiceType = q.choiceQuestion.type;
      kind =
        choiceType === 'CHECKBOX'
          ? 'CHECKBOXES'
          : choiceType === 'DROP_DOWN'
            ? 'DROPDOWN'
            : 'MULTIPLE_CHOICE';
      options = (q.choiceQuestion.options || [])
        .map((opt) => (opt.isOther ? 'Other' : (opt.value || '').trim()))
        .filter(Boolean);
    }

    return {
      itemId: item.itemId || `item-${idx}`,
      title: item.title || `Item ${idx + 1}`,
      description: item.description,
      questionId: q?.questionId,
      required: Boolean(q?.required),
      kind,
      options,
    };
  });

  return {
    formId: raw.formId,
    title: raw.info?.title || raw.info?.documentTitle || 'Untitled Google Form',
    documentTitle: raw.info?.documentTitle,
    description: raw.info?.description,
    responderUri: raw.responderUri,
    linkedSheetId: raw.linkedSheetId,
    items,
  };
}

function buildCreateItemRequest(question: GoogleFormQuestionDraft, index: number): Record<string, unknown> {
  const cleanTitle = question.title.trim() || 'Untitled Question';
  const cleanOptions = (question.options || []).map((o) => o.trim()).filter(Boolean);
  const questionPayload: Record<string, unknown> = {
    required: Boolean(question.required),
  };

  if (question.kind === 'MULTIPLE_CHOICE' || question.kind === 'CHECKBOXES') {
    const resolvedOptions = cleanOptions.length > 0 ? cleanOptions : ['Nominal', 'Out of Spec', 'Open / Short'];
    questionPayload.choiceQuestion = {
      type: question.kind === 'CHECKBOXES' ? 'CHECKBOX' : 'RADIO',
      options: resolvedOptions.map((value) => ({ value })),
    };
  } else {
    questionPayload.textQuestion = {
      paragraph: question.kind === 'PARAGRAPH',
    };
  }

  const item: Record<string, unknown> = {
    title: cleanTitle,
    questionItem: {
      question: questionPayload,
    },
  };

  if (question.description && question.description.trim()) {
    item.description = question.description.trim();
  }

  return {
    createItem: {
      item,
      location: { index },
    },
  };
}

/**
 * List the user's Google Forms via Drive API v3.
 */
export async function listGoogleForms(
  accessToken: string,
  searchQuery = ''
): Promise<GoogleFormDriveItem[]> {
  const escaped = searchQuery.trim().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const qParts = [
    "mimeType='application/vnd.google-apps.form'",
    'trashed=false',
  ];
  if (escaped) {
    qParts.push(`name contains '${escaped}'`);
  }

  const params = new URLSearchParams({
    q: qParts.join(' and '),
    orderBy: 'modifiedTime desc',
    pageSize: '25',
    fields: 'files(id,name,modifiedTime,webViewLink,owners(displayName,emailAddress))',
  });

  const data = await formsFetch<{ files?: GoogleFormDriveItem[] }>(
    `${DRIVE_API_BASE}/files?${params.toString()}`,
    accessToken
  );

  return data.files || [];
}

/**
 * Fetch a Google Form schema and item questions via Forms API v1.
 */
export async function getGoogleForm(
  accessToken: string,
  formId: string
): Promise<GoogleFormDetail> {
  const safeFormId = normalizeSafeFormId(formId);
  const raw = await formsFetch<RawGoogleForm>(
    `${FORMS_API_BASE}/forms/${safeFormId}`,
    accessToken
  );
  return parseRawForm(raw);
}

interface RawFormResponse {
  responseId?: string;
  createTime?: string;
  lastSubmittedTime?: string;
  respondentEmail?: string;
  answers?: Record<
    string,
    {
      questionId?: string;
      textAnswers?: { answers?: Array<{ value?: string }> };
    }
  >;
}

/**
 * Fetch submitted responses for a Google Form via Forms API v1.
 */
export async function listGoogleFormResponses(
  accessToken: string,
  formId: string,
  questionTitlesById: Record<string, string> = {}
): Promise<GoogleFormResponseSummary[]> {
  const safeFormId = normalizeSafeFormId(formId);
  const data = await formsFetch<{ responses?: RawFormResponse[] }>(
    `${FORMS_API_BASE}/forms/${safeFormId}/responses?pageSize=25`,
    accessToken
  );

  return (data.responses || []).map((resp, idx) => {
    const answersMap = resp.answers || {};
    const answers: GoogleFormAnswerSummary[] = Object.entries(answersMap).map(
      ([key, answerObj]) => {
        const qId = answerObj.questionId || key;
        const values = (answerObj.textAnswers?.answers || [])
          .map((a) => (a.value || '').trim())
          .filter(Boolean);
        return {
          questionId: qId,
          questionTitle: questionTitlesById[qId] || qId,
          values,
        };
      }
    );

    return {
      responseId: resp.responseId || `resp-${idx}`,
      createTime: resp.createTime,
      lastSubmittedTime: resp.lastSubmittedTime,
      respondentEmail: resp.respondentEmail,
      answers,
    };
  });
}

/**
 * Create a new Google Form and populate initial description and questions via batchUpdate
 * (MUST be explicitly user-confirmed beforehand).
 */
export async function createDiagnosticGoogleForm(
  accessToken: string,
  input: {
    title: string;
    description?: string;
    questions?: GoogleFormQuestionDraft[];
  }
): Promise<GoogleFormDetail> {
  const cleanTitle = input.title.trim() || `ECU Bench Inspection Form (${new Date().toLocaleDateString()})`;
  const created = await formsFetch<RawGoogleForm>(
    `${FORMS_API_BASE}/forms`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        info: {
          title: cleanTitle,
          documentTitle: cleanTitle,
        },
      }),
    }
  );

  const safeFormId = normalizeSafeFormId(created.formId);
  const requests: Record<string, unknown>[] = [];

  if (input.description && input.description.trim()) {
    requests.push({
      updateFormInfo: {
        info: {
          description: input.description.trim(),
        },
        updateMask: 'description',
      },
    });
  }

  const questions = input.questions || [];
  questions.forEach((q, idx) => {
    requests.push(buildCreateItemRequest(q, idx));
  });

  if (requests.length > 0) {
    const updated = await formsFetch<{ form?: RawGoogleForm }>(
      `${FORMS_API_BASE}/forms/${safeFormId}:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          includeFormInResponse: true,
          requests,
        }),
      }
    );
    if (updated.form) {
      return parseRawForm(updated.form);
    }
  }

  return getGoogleForm(accessToken, created.formId);
}

/**
 * Append or insert a new question into an existing Google Form via batchUpdate
 * (MUST be explicitly user-confirmed beforehand).
 */
export async function addGoogleFormQuestion(
  accessToken: string,
  formId: string,
  question: GoogleFormQuestionDraft,
  insertIndex = 0
): Promise<GoogleFormDetail> {
  const safeFormId = normalizeSafeFormId(formId);
  const updated = await formsFetch<{ form?: RawGoogleForm }>(
    `${FORMS_API_BASE}/forms/${safeFormId}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        includeFormInResponse: true,
        requests: [buildCreateItemRequest(question, Math.max(0, insertIndex))],
      }),
    }
  );

  if (updated.form) {
    return parseRawForm(updated.form);
  }
  return getGoogleForm(accessToken, formId);
}

/**
 * Move a Google Form to Drive Trash (MUST be explicitly user-confirmed beforehand).
 */
export async function trashGoogleForm(accessToken: string, formId: string): Promise<void> {
  const safeFormId = normalizeSafeFormId(formId);
  await formsFetch(
    `${DRIVE_API_BASE}/files/${safeFormId}`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify({ trashed: true }),
    }
  );
}

/**
 * Build a deterministic ECU Bench Inspection & Lab Assessment Google Form template
 * derived directly from live MNA circuit solver and DMM telemetry.
 */
export function buildBenchInspectionFormTemplate(payload: BenchDocTelemetryPayload): {
  title: string;
  description: string;
  questions: GoogleFormQuestionDraft[];
} {
  const { ecuProfileLabel, powerSupply, multimeter, circuitSolution, faults } = payload;
  const activeDtcs = circuitSolution.activeDTCs.map((d) => `${d.code} (${d.description})`);
  const activeFaults = faults.filter((f) => f.faultType !== 'NONE');

  const descriptionLines = [
    `AutoElectric Lab Pro Bench Verification & Technician Intake Form for ${ecuProfileLabel}.`,
    `Bench PSU: ${powerSupply.isOutputEnabled ? 'ENABLED' : 'STANDBY'} @ ${powerSupply.voltageSetting.toFixed(2)} V / ${circuitSolution.supplyCurrentDrawAmps.toFixed(3)} A draw.`,
    `DMM Live Reading (${multimeter.redProbe.attachedLabel}): ${circuitSolution.multimeterReading.display} ${circuitSolution.multimeterReading.unit}.`,
    activeDtcs.length > 0
      ? `Active DTCs: ${activeDtcs.slice(0, 4).join('; ')}`
      : 'Active DTCs: None (Nominal Bench Baseline).',
  ];

  const questions: GoogleFormQuestionDraft[] = [
    {
      title: 'Technician Name / Student ID & Bench Station',
      description: 'Enter full name and bay/bench station identifier.',
      required: true,
      kind: 'SHORT_TEXT',
    },
    {
      title: `KL30 / KL15 Power & Ground Rail Status (${powerSupply.voltageSetting.toFixed(1)}V Nominal)`,
      description: 'Verify constant battery feed (KL30), switched ignition (KL15), and star ground continuity.',
      required: true,
      kind: 'MULTIPLE_CHOICE',
      options: [
        'Nominal (+12V rails and ground within spec)',
        'Voltage drop detected on power feed',
        'High resistance / open chassis ground',
        'Over-current trip / short to ground',
      ],
    },
    {
      title: 'Recorded DMM Probe Reading & Pin Reference',
      description: `Compare your bench measurement against live MNA reading (${circuitSolution.multimeterReading.display} ${circuitSolution.multimeterReading.unit} on ${multimeter.redProbe.attachedLabel}).`,
      required: true,
      kind: 'SHORT_TEXT',
    },
    {
      title: 'Faults & Anomalies Observed During Bench Test',
      description:
        activeFaults.length > 0
          ? `Bench fault context: ${activeFaults.map((f) => `${f.pinId} [${f.faultType}]`).join(', ')}`
          : 'Select all symptoms verified on the wiring harness and actuators.',
      required: false,
      kind: 'CHECKBOXES',
      options: [
        'Open circuit / broken harness lead',
        'Short to ground on sensor or actuator driver',
        'Short to B+ (+12V)',
        'High contact resistance / corroded terminal',
        'No fault — passed baseline verification',
      ],
    },
    {
      title: 'Root Cause Isolation & Recommended Corrective Action',
      description: 'Document diagnostic steps taken, oscilloscope/DMM findings, and final repair verification.',
      required: true,
      kind: 'PARAGRAPH',
    },
  ];

  return {
    title: `ECU Bench Inspection — ${ecuProfileLabel}`,
    description: descriptionLines.join('\n'),
    questions,
  };
}
